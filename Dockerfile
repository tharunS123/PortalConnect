# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the Angular app and compile the API.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS build

WORKDIR /app

# Copy manifests first so the dependency layer is cached until they change.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json

RUN npm ci

COPY . .

RUN npm run build && npm run build:api

# Re-resolve with production dependencies only, for the runtime stage.
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Stage 2 — runtime. Carries no toolchain, no tests, no source.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/portalconnect.db \
    STATIC_DIR=/app/dist/portal-connect/browser

WORKDIR /app

# `tini` reaps zombies and forwards SIGTERM, so graceful shutdown works.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/src/db/migrations ./server/src/db/migrations
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json

# The database lives on a volume so it survives container replacement.
RUN mkdir -p /data && chown -R node:node /data /app

USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/dist/index.js"]
