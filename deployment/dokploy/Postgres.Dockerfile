# Schéma immuable dans l'image : aucun bind mount vers le clone Git de Dokploy.
FROM postgres:16-alpine
COPY deployment/vps/schema.sql /docker-entrypoint-initdb.d/001-frankenstein.sql
