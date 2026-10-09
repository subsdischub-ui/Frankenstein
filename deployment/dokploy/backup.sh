#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
APP=${1:?Usage: bash backup.sh CONTENEUR_APP CONTENEUR_DB}
DB=${2:?Usage: bash backup.sh CONTENEUR_APP CONTENEUR_DB}
[[ "$(docker inspect -f '{{index .Config.Labels "frankenstein.role"}}' "$APP")" == paper ]] \
  || { echo "Conteneur applicatif Frankenstein non identifie."; exit 1; }
[[ "$(docker inspect -f '{{index .Config.Labels "frankenstein.role"}}' "$DB")" == database ]] \
  || { echo "Conteneur PostgreSQL Frankenstein non identifie."; exit 1; }
BASE=${BACKUP_DIR:-/var/backups/frankenstein-dokploy}
mkdir -p "$BASE"
TMP=$(mktemp -d "$BASE/.working.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
docker exec "$DB" sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$TMP/database.dump"
docker cp "$APP":/var/lib/frankenstein "$TMP/private"
tar -C "$TMP" -czf "$TMP/private-files.tar.gz" private
rm -rf "$TMP/private"
(cd "$TMP" && sha256sum database.dump private-files.tar.gz > SHA256SUMS)
FINAL="$BASE/$(date -u +%Y%m%dT%H%M%SZ)"
mv "$TMP" "$FINAL"
echo "Sauvegarde privee terminee : $FINAL"
