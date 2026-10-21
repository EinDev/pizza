# syntax=docker/dockerfile:1
#
# Eigener Hastebin-Server für den pizza-Playground.
# Quelle: skyra-project/haste-server (MIT, gepflegter Nachfolger von haste-server),
# gepinnt auf einen Upstream-Commit. Das veröffentlichte GHCR-Image hat nur den Tag
# "latest" und hinkt den Sicherheitsupdates hinterher – daher Eigenbau.
#
# Aktualisieren: HASTE_COMMIT auf einen neuen Commit von
#   https://github.com/skyra-project/haste-server/commits/main
# setzen und neu bauen.

ARG NODE_IMAGE=node:24.22.1-alpine3.24

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS quelle
ARG HASTE_COMMIT=77d0a869e5ac48cc17b067ae5db56abb61dbad9f
ADD --keep-git-dir=false https://github.com/skyra-project/haste-server.git#${HASTE_COMMIT} /src

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /usr/src/app
RUN apk add --no-cache g++ make python3
COPY --from=quelle /src/ ./
ENV NODE_ENV=development
RUN yarn install --immutable && yarn build \
 && NODE_ENV=production yarn workspaces focus --all --production \
 && rm -rf src .yarn/cache

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /usr/src/app
RUN apk add --no-cache dumb-init
COPY --from=build --chown=node:node /usr/src/app/package.json /usr/src/app/README.md ./
COPY --from=build --chown=node:node /usr/src/app/dist ./dist
COPY --from=build --chown=node:node /usr/src/app/node_modules ./node_modules

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps \
    HOST=0.0.0.0 \
    PORT=8290

USER node
EXPOSE 8290

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8290/ || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/backend/server.js"]
