#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE=${BACKUP_TEST_IMAGE:-frankenstein-backup:ci}
PASSWORD=${BACKUP_TEST_PASSWORD:?Set a disposable integration-test password}
PREFIX="frankenstein-backup-test-$$"
NETWORK="$PREFIX-net"
DB="$PREFIX-db"
PRIVATE_VOLUME="$PREFIX-private"
ARCHIVE_VOLUME="$PREFIX-archives"

cleanup() {
  docker rm -f "$DB" >/dev/null 2>&1 || true
  docker volume rm "$PRIVATE_VOLUME" "$ARCHIVE_VOLUME" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$NETWORK" >/dev/null
docker volume create "$PRIVATE_VOLUME" >/dev/null
docker volume create "$ARCHIVE_VOLUME" >/dev/null
docker run -d --name "$DB" --network "$NETWORK" \
  -e POSTGRES_USER=frankenstein -e POSTGRES_PASSWORD="$PASSWORD" \
  -e POSTGRES_DB=frankenstein postgres:16-alpine >/dev/null

ready=false
for _ in $(seq 1 60); do
  if docker exec "$DB" pg_isready -h 127.0.0.1 -U frankenstein -d frankenstein >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ $ready != true ]]; then
  docker logs "$DB" >&2
  echo "Disposable PostgreSQL did not become ready." >&2
  exit 1
fi

docker exec -e PGPASSWORD="$PASSWORD" "$DB" \
  psql -X -v ON_ERROR_STOP=1 -U frankenstein -d frankenstein \
  -c "CREATE TABLE backup_smoke(value text); INSERT INTO backup_smoke VALUES ('journal-backup-ok');" >/dev/null

docker run --rm -v "$PRIVATE_VOLUME:/source/private" --entrypoint /bin/sh "$IMAGE" -ec '
  mkdir -p /source/private/models
  printf "{\"owner\":\"smoke\"}\n" > /source/private/access.json
  printf "{\"model\":\"shadow\"}\n" > /source/private/models/model.json
  chown -R 1000:1000 /source/private
  chmod 700 /source/private /source/private/models
  chmod 600 /source/private/access.json /source/private/models/model.json
'

docker run --rm --network "$NETWORK" --read-only --cap-drop ALL --cap-add DAC_READ_SEARCH \
  --security-opt no-new-privileges --tmpfs /tmp:mode=1777,size=64m \
  -v "$PRIVATE_VOLUME:/source/private:ro" -v "$ARCHIVE_VOLUME:/backups" \
  -e PGHOST="$DB" -e PGPORT=5432 -e PGUSER=frankenstein -e PGDATABASE=frankenstein \
  -e PGPASSWORD="$PASSWORD" -e PRIVATE_DATA_DIR=/source/private \
  --entrypoint /usr/local/bin/frankenstein-backup-runner "$IMAGE"

docker exec "$DB" createdb -U frankenstein backup_restore
docker run --rm --network "$NETWORK" --read-only --cap-drop ALL --cap-add DAC_READ_SEARCH \
  --security-opt no-new-privileges --tmpfs /tmp:mode=1777,size=64m \
  -v "$ARCHIVE_VOLUME:/backups:ro" \
  -e PGHOST="$DB" -e PGPORT=5432 -e PGUSER=frankenstein -e PGDATABASE=backup_restore \
  -e PGPASSWORD="$PASSWORD" --entrypoint /bin/sh "$IMAGE" -ec '
    archive=$(find /backups -mindepth 2 -maxdepth 2 -type f -name SUCCESS | head -1 | sed "s#/SUCCESS##")
    test -n "$archive"
    test "$(stat -c %a "$archive")" = 700
    cd "$archive"
    sha256sum -c SHA256SUMS
    pg_restore --no-owner --exit-on-error --dbname=backup_restore database.dump
    result=$(psql -X -At -v ON_ERROR_STOP=1 -d backup_restore -c "SELECT value FROM backup_smoke")
    test "$result" = journal-backup-ok
    mkdir /tmp/private-restore
    tar -xzf private-files.tar.gz -C /tmp/private-restore
    test "$(cat /tmp/private-restore/private/access.json)" = "{\"owner\":\"smoke\"}"
    test "$(cat /tmp/private-restore/private/models/model.json)" = "{\"model\":\"shadow\"}"
  '

echo "Database restore, model/access archive, hashes, and private directory permissions verified."
