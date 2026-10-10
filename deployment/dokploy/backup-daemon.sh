#!/bin/sh
set -eu

INTERVAL=${BACKUP_INTERVAL_SECONDS:-86400}
RETRY=${BACKUP_RETRY_SECONDS:-900}
case "$INTERVAL" in
  ''|*[!0-9]*) echo "Backup interval must be a positive integer in seconds." >&2; exit 2 ;;
esac
case "$RETRY" in
  ''|*[!0-9]*) echo "Backup retry interval must be a positive integer in seconds." >&2; exit 2 ;;
esac
[ "$INTERVAL" -ge 3600 ] || { echo "Backup interval must be at least one hour." >&2; exit 2; }
[ "$RETRY" -ge 60 ] || { echo "Backup retry interval must be at least one minute." >&2; exit 2; }

mkdir -p "${BACKUP_DIR:-/backups}"
chmod 700 "${BACKUP_DIR:-/backups}"
while :; do
  if /usr/local/bin/frankenstein-backup-runner; then
    sleep "$INTERVAL"
  else
    echo "Backup failed; retrying in ${RETRY}s." >&2
    sleep "$RETRY"
  fi
done
