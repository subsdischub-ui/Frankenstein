#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo "Executer avec sudo."; exit 1; }
SOURCE=$(realpath "${1:?Usage: sudo bash restore.sh /var/backups/frankenstein/DATE}")
[[ -f "$SOURCE/database.dump" && -f "$SOURCE/private-files.tar.gz" ]] || exit 1
(cd "$SOURCE" && sha256sum -c SHA256SUMS)
echo "Cette operation remplace les donnees VPS actuelles. L'installation Replit n'est pas touchee."
read -r -p "Saisir RESTAURER pour confirmer : " CONFIRM
[[ $CONFIRM == RESTAURER ]] || exit 1
systemctl stop frankenstein
echo "Sauvegarde de securite avant remplacement..."
sudo -u frankenstein /opt/frankenstein/tools/backup.sh
# Les dumps produits par ce paquet sont de confiance ; ne pas restaurer une archive inconnue.
sudo -u frankenstein pg_restore -h /var/run/postgresql -U frankenstein -d frankenstein \
  --clean --if-exists --no-owner --exit-on-error "$SOURCE/database.dump"
tar -C /var/lib/frankenstein -xzf "$SOURCE/private-files.tar.gz" --no-same-owner
chown -R frankenstein:frankenstein /var/lib/frankenstein
chmod 700 /var/lib/frankenstein
# Une restauration ne doit jamais relancer automatiquement les entrees.
sudo -u frankenstein psql -X -v ON_ERROR_STOP=1 -d frankenstein -c \
  "UPDATE lab_accounts SET state=jsonb_set(jsonb_set(state,'{running}','false'),'{halted}','true');"
systemctl start frankenstein
echo "Restaure. Entrees bloquees ; verifier positions, donnees et journal avant toute reprise."
