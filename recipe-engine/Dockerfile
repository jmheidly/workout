# ── Stage 1: Install dependencies ──────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache python3 build-base
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn --frozen-lockfile --production=false

# ── Stage 2: Build ─────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build
RUN yarn --frozen-lockfile --production=true && yarn cache clean

# ── Stage 3: Litestream binary ─────────────────────────────────────────
FROM litestream/litestream:0.3 AS litestream

# ── Stage 4: Runtime ───────────────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts ./scripts
COPY litestream.yml /etc/litestream.yml
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
ENTRYPOINT ["tini", "--"]
CMD ["sh", "-c", \
  "if [ -n \"$LITESTREAM_REPLICA_URL\" ]; then \
    litestream restore -if-db-not-exists -if-replica-exists /app/data/recipe-engine.db && \
    exec litestream replicate -exec 'node build/index.js'; \
  else \
    exec node build/index.js; \
  fi"]
