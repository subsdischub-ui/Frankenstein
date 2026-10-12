#!/usr/bin/env bash
set -Eeuo pipefail
APP=${1:?Usage: bash restore.sh CONTENEUR_APP CONTENEUR_DB SAUVEGARDE}
DB=${2:?Usage: bash restore.sh CONTENEUR_APP CONTENEUR_DB SAUVEGARDE}
SOURCE=$(realpath "${3:?Usage: bash restore.sh CONTENEUR_APP CONTENEUR_DB SAUVEGARDE}")
[[ "$(docker inspect -f '{{index .Config.Labels "frankenstein.role"}}' "$APP")" == paper ]] || exit 1
[[ "$(docker inspect -f '{{index .Config.Labels "frankenstein.role"}}' "$DB")" == database ]] || exit 1
(cd "$SOURCE" && sha256sum -c SHA256SUMS)
echo "Remplacement des donnees Frankenstein de ces deux conteneurs. Autres applications non touchees."
read -r -p "Saisir RESTAURER pour confirmer : " CONFIRM
[[ $CONFIRM == RESTAURER ]] || exit 1
docker stop "$APP"
bash "$(dirname "$0")/backup.sh" "$APP" "$DB"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# Seulement les archives de confiance creees par backup.sh.
tar -xzf "$SOURCE/private-files.tar.gz" -C "$TMP"
docker exec -i "$DB" sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error' < "$SOURCE/database.dump"
docker cp "$TMP/private/." "$APP":/var/lib/frankenstein/
docker exec "$DB" sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "UPDATE lab_accounts SET state=jsonb_set(jsonb_set(state,'\''{running}'\'','\''false'\''),'\''{halted}'\'','\''true'\'');"'
docker start "$APP"
echo "Restauration terminee, entrees bloquees. Verifier les positions et le journal avant reprise."
