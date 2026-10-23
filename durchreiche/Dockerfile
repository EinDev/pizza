# syntax=docker/dockerfile:1
#
# Durchreiche – interner Teilen-Dienst des pizza-Playgrounds (PROJEKTE.md §4, K-143).
# Node ohne Abhängigkeiten (kein npm ci), läuft als USER node, Root-Dateisystem read_only (compose.yaml);
# beschreibbar ist nur das Volume /daten.
#
# Gleiches gepinntes Basis-Image wie der Haupt-Dockerfile (Dependabot hält beide frisch).

ARG NODE_IMAGE=node:24.22.1-alpine3.24
FROM ${NODE_IMAGE}

LABEL org.opencontainers.image.title="pizza-durchreiche" \
      org.opencontainers.image.description="Teilen-Dienst des pizza-Playgrounds (Blobs + Manifeste, Versionen)"

# /daten gehört node: Docker übernimmt Besitzer und Rechte beim ersten Einhängen eines leeren benannten Volumes.
RUN mkdir -p /daten && chown node:node /daten && chmod 700 /daten

WORKDIR /app
COPY regeln.mjs lager.mjs server.mjs ./

ENV NODE_ENV=production \
    PORT=8291 \
    TEILEN_DATEN=/daten

USER node
EXPOSE 8291

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8291/healthz || exit 1

CMD ["node", "server.mjs"]
