#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || { echo "Usage : sudo bash install.sh labo.votre-domaine.tld"; exit 1; }
DOMAIN=${1:?Un domaine DNS dedie est requis}
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && "$DOMAIN" == *.* && "$DOMAIN" != *..* ]] \
  || { echo "Domaine invalide (sans https:// ni chemin)."; exit 1; }
[[ ! -e /etc/frankenstein/vps.env && ! -e /opt/frankenstein/app ]] \
  || { echo "Installation existante : ne pas ecraser. Voir le guide de mise a jour."; exit 1; }
. /etc/os-release
[[ "$ID:$VERSION_ID" == ubuntu:24.04 || "$ID:$VERSION_ID" == debian:12 || "$ID:$VERSION_ID" == debian:13 ]] \
  || { echo "Paquet prevu pour Ubuntu 24.04 / Debian 12 ou 13."; exit 1; }
[[ "$(uname -m)" == x86_64 ]] || { echo "Paquet valide pour Linux x86_64 uniquement."; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
[[ -f "$HERE/app/server/index.mjs" && -f "$HERE/app/web/index.html" ]] || { echo "Archive incomplete."; exit 1; }
for PORT in 80 443; do
  LISTENERS=$(ss -ltnpH "( sport = :$PORT )")
  if [[ -n "$LISTENERS" && "$LISTENERS" != *'"caddy"'* ]]; then
    echo "Port $PORT utilise par un autre serveur web. Ne pas le remplacer : integration manuelle au proxy existant requise."
    exit 1
  fi
done
if ss -ltnH '( sport = :3000 )' | grep -q .; then echo "Port 3000 occupe : adapter le paquet avant installation."; exit 1; fi
echo "Installation paper-only sur $DOMAIN. Ajoute PostgreSQL, Caddy et des services dedies."
echo "Ne configure pas de VPN, n'envoie pas d'ordre, ne ferme pas SSH et ne modifie pas le pare-feu."
read -r -p "Saisir INSTALLER pour continuer : " CONFIRM
[[ $CONFIRM == INSTALLER ]] || exit 1
apt-get update
apt-get install -y postgresql postgresql-client caddy curl ca-certificates xz-utils sudo
id frankenstein >/dev/null 2>&1 || useradd --system --home-dir /var/lib/frankenstein --shell /usr/sbin/nologin frankenstein
install -d -m 755 /opt/frankenstein /opt/frankenstein/tools
install -d -m 700 -o frankenstein -g frankenstein /var/lib/frankenstein /var/backups/frankenstein
install -d -m 750 -o root -g frankenstein /etc/frankenstein
NODE_VERSION=v24.13.0
CACHE=$(mktemp -d)
trap 'rm -rf "$CACHE"' EXIT
curl --fail --proto '=https' --tlsv1.2 -o "$CACHE/node.tar.xz" "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz"
curl --fail --proto '=https' --tlsv1.2 -o "$CACHE/SHASUMS256.txt" "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt"
EXPECTED=$(awk '$2=="node-v24.13.0-linux-x64.tar.xz" {print $1}' "$CACHE/SHASUMS256.txt")
[[ ${#EXPECTED} == 64 ]] || { echo "Checksum Node absent."; exit 1; }
echo "$EXPECTED  $CACHE/node.tar.xz" | sha256sum -c -
mkdir "$CACHE/node"
tar -xf "$CACHE/node.tar.xz" -C "$CACHE/node" --strip-components=1
mv "$CACHE/node" /opt/frankenstein/node
cp -a "$HERE/app" /opt/frankenstein/app
cp "$HERE/tools/"* /opt/frankenstein/tools/
chmod 755 /opt/frankenstein/tools/*.sh
chown -R root:root /opt/frankenstein
chmod -R a+rX /opt/frankenstein
systemctl enable --now postgresql
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -c "CREATE ROLE frankenstein LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;"
sudo -u postgres createdb --owner=frankenstein frankenstein
sudo -u frankenstein psql -X -v ON_ERROR_STOP=1 -d frankenstein -f /opt/frankenstein/app/schema.sql
cat > /etc/frankenstein/vps.env <<EOF
NODE_ENV=production
PORT=3000
PUBLIC_ORIGIN=https://$DOMAIN
DATABASE_URL=postgresql:///frankenstein
PGHOST=/var/run/postgresql
PGUSER=frankenstein
PGDATABASE=frankenstein
VPS_ACCESS_FILE=/var/lib/frankenstein/access.json
VPS_DATA_DIR=/var/lib/frankenstein
LOG_LEVEL=info
EOF
chmod 640 /etc/frankenstein/vps.env
chown root:frankenstein /etc/frankenstein/vps.env
sudo -u frankenstein /opt/frankenstein/node/bin/node /opt/frankenstein/tools/create-access.mjs /var/lib/frankenstein/access.json
cp "$HERE/frankenstein.service" "$HERE/frankenstein-backup.service" "$HERE/frankenstein-backup.timer" /etc/systemd/system/
if [[ -e /etc/caddy/frankenstein.caddy ]]; then echo "Configuration Caddy dediee deja presente : verifier manuellement."; exit 1; fi
cat > /etc/caddy/frankenstein.caddy <<EOF
$DOMAIN {
  encode zstd gzip
  header {
    X-Content-Type-Options nosniff
    Referrer-Policy same-origin
    X-Frame-Options DENY
    Strict-Transport-Security "max-age=31536000"
  }
  reverse_proxy 127.0.0.1:3000
}
EOF
PREVIOUS_CADDY="/etc/caddy/Caddyfile.before-frankenstein-$(date +%s)"
cp /etc/caddy/Caddyfile "$PREVIOUS_CADDY"
printf '\nimport /etc/caddy/frankenstein.caddy\n' >> /etc/caddy/Caddyfile
chmod 644 /etc/caddy/frankenstein.caddy /etc/caddy/Caddyfile
if ! caddy validate --config /etc/caddy/Caddyfile; then
  cp "$PREVIOUS_CADDY" /etc/caddy/Caddyfile
  rm /etc/caddy/frankenstein.caddy
  echo "Configuration Caddy precedente restauree. Installation conservee pour diagnostic."
  exit 1
fi
systemctl daemon-reload
/opt/frankenstein/node/bin/node /opt/frankenstein/tools/check-binance.mjs \
  || { echo "Diagnostic Binance incomplet : service non active. Corriger puis utiliser les commandes du guide."; exit 1; }
systemctl enable --now frankenstein frankenstein-backup.timer caddy
systemctl reload caddy
sudo -u frankenstein /opt/frankenstein/tools/backup.sh
curl --fail --retry 10 --retry-delay 2 --retry-connrefused http://127.0.0.1:3000/api/healthz
echo
echo "Installation terminee : https://$DOMAIN/sign-in"
echo "Verifier le HTTPS externe. Le compte paper commence EN PAUSE ; demarrer explicitement apres verification."
