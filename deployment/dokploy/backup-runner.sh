#!/bin/sh
set -eu
umask 077

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

SOURCE=${PRIVATE_DATA_DIR:-/source/private}
BASE=${BACKUP_DIR:-/backups}
[ -d "$SOURCE" ] || { echo "Private data volume is unavailable." >&2; exit 1; }
[ -f "$SOURCE/access.json" ] || { echo "Operator access file is missing; refusing an incomplete backup." >&2; exit 1; }
[ -d "$SOURCE/models" ] || { echo "Models directory is missing; refusing an incomplete backup." >&2; exit 1; }

mkdir -p "$BASE"
chmod 700 "$BASE"
TMP=$(mktemp -d "$BASE/.working.XXXXXX")
cleanup() { [ -z "${TMP:-}" ] || rm -rf "$TMP"; }
trap cleanup EXIT HUP INT TERM

PGPASSWORD="$PGPASSWORD" pg_dump \
  --host="$PGHOST" --port="${PGPORT:-5432}" --username="$PGUSER" \
  --dbname="$PGDATABASE" --format=custom > "$TMP/database.dump"
[ -s "$TMP/database.dump" ] || { echo "Database dump is empty." >&2; exit 1; }
pg_restore --list "$TMP/database.dump" >/dev/null

tar -C "$(dirname "$SOURCE")" -czf "$TMP/private-files.tar.gz" "$(basename "$SOURCE")"
gzip -t "$TMP/private-files.tar.gz"
tar -tzf "$TMP/private-files.tar.gz" > "$TMP/private-files.list"
grep -q '^private/access.json$' "$TMP/private-files.list"
(cd "$TMP" && sha256sum database.dump private-files.tar.gz > SHA256SUMS && sha256sum -c SHA256SUMS)
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$TMP/SUCCESS"

STAMP=$(date -u '+%Y%m%dT%H%M%SZ')
FINAL="$BASE/$STAMP"
SUFFIX=1
while [ -e "$FINAL" ]; do
  FINAL="$BASE/$STAMP-$SUFFIX"
  SUFFIX=$((SUFFIX + 1))
done
mv "$TMP" "$FINAL"
TMP=
echo "Verified backup written: $FINAL"
