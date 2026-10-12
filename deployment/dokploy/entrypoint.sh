#!/bin/sh
set -eu
umask 077
mkdir -p /var/lib/frankenstein/models
chown -R node:node /var/lib/frankenstein
chmod 700 /var/lib/frankenstein /var/lib/frankenstein/models
gosu node node /app/tools/bootstrap.mjs
# Le serveur applicatif ne tourne jamais comme root.
exec gosu node node /app/server/index.mjs
