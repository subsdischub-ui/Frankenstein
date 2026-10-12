# Ce Dockerfile est destiné au VPS/Dokploy, pas au runtime Replit.
FROM node:24.13.0-bookworm-slim AS builder
WORKDIR /build
RUN npm install --global pnpm@10.26.1
COPY . .
RUN pnpm install --frozen-lockfile --filter @workspace/api-server... --filter @workspace/frankenstein...
RUN node deployment/vps/build.mjs

FROM node:24.13.0-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /build/dist-vps/server ./server
COPY --from=builder /build/dist-vps/web ./web
COPY --from=builder /build/deployment/vps/tools/create-access.mjs ./tools/create-access.mjs
COPY --from=builder /build/deployment/vps/tools/check-binance.mjs ./tools/check-binance.mjs
COPY deployment/dokploy/bootstrap.mjs ./tools/bootstrap.mjs
COPY deployment/dokploy/entrypoint.sh ./entrypoint.sh
RUN chmod 755 /app/entrypoint.sh && mkdir -p /var/lib/frankenstein
ENV NODE_ENV=production PORT=3000 VPS_BIND_HOST=0.0.0.0 VPS_TRUST_PROXY=1 \
    VPS_ACCESS_FILE=/var/lib/frankenstein/access.json VPS_DATA_DIR=/var/lib/frankenstein
EXPOSE 3000
ENTRYPOINT ["/app/entrypoint.sh"]
