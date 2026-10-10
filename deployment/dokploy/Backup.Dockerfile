FROM postgres:16-alpine
COPY deployment/dokploy/backup-runner.sh /usr/local/bin/frankenstein-backup-runner
COPY deployment/dokploy/backup-daemon.sh /usr/local/bin/frankenstein-backup-daemon
RUN chmod 755 /usr/local/bin/frankenstein-backup-runner /usr/local/bin/frankenstein-backup-daemon
USER root
ENTRYPOINT ["/usr/local/bin/frankenstein-backup-daemon"]
