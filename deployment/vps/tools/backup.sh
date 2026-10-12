#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
BASE=/var/backups/frankenstein
mkdir -p "$BASE"
exec 9>"$BASE/.lock"
flock -n 9 || exit 0
TMP=$(mktemp -d "$BASE/.working.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
pg_dump -h /var/run/postgresql -U frankenstein -d frankenstein --format=custom > "$TMP/database.dump"
tar -C /var/lib/frankenstein -czf "$TMP/private-files.tar.gz" .
sha256sum "$TMP/database.dump" "$TMP/private-files.tar.gz" | sed "s|$TMP/||" > "$TMP/SHA256SUMS"
FINAL="$BASE/$(date -u +%Y%m%dT%H%M%SZ)"
mv "$TMP" "$FINAL"
# Aucune suppression automatique. Planifier la retention apres une restauration verifiee.
echo "Sauvegarde privee terminee : $FINAL"
