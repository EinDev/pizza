# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: Teig kneten – UI bauen und (optional) Interpreter testen
# ---------------------------------------------------------------------------
FROM node:22.23.4-alpine3.24 AS build

WORKDIR /app

# Ganzes Repo (Interpreter, Tests, Beispiele, Doku, UI-Quellen).
# Bewusst ohne separaten package.json-Layer: ui/ darf (noch) fehlen.
COPY . .

# UI-Bundle bauen -> site/js/app.bundle.js
# Fehlt ui/package.json, wird das eingecheckte Bundle aus site/ verwendet.
# Schlägt Installation/Build fehl, wird standardmäßig nur gewarnt (eingechecktes
# Bundle bleibt); mit --build-arg STRICT_BUILD=1 bricht der Build ab.
ARG STRICT_BUILD=0
RUN if [ -f ui/package.json ]; then \
        cd ui && \
        { { if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
            else npm install --no-audit --no-fund; fi && npm run build; } || \
          { [ "$STRICT_BUILD" != "1" ] && \
            echo ">> WARNUNG: UI-Build fehlgeschlagen – nutze eingechecktes site/js/app.bundle.js."; }; }; \
    else \
        echo ">> ui/package.json fehlt – nutze vorhandenes site/js/app.bundle.js."; \
    fi

# Tests im Root. Standard: übersprungen (SKIP_TESTS=1).
# Strikt bauen (kaputter Interpreter => kein Image):
#   docker compose build --build-arg SKIP_TESTS=0   bzw.   SKIP_TESTS=0 docker compose build
ARG SKIP_TESTS=1
RUN if [ "$SKIP_TESTS" = "1" ]; then \
        echo ">> SKIP_TESTS=1 – Tests übersprungen. Der Pizzaiolo schaut skeptisch."; \
    elif [ -f package.json ]; then \
        if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
        else npm install --no-audit --no-fund; fi && \
        npm test; \
    else \
        echo ">> Kein Root-package.json gefunden – keine Tests."; \
    fi

# ---------------------------------------------------------------------------
# Stage 2: Ausliefern – nur site/ über nginx (nicht-root, Port 8080)
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24 AS runtime

LABEL org.opencontainers.image.title="pizza-playground" \
      org.opencontainers.image.description="Playground für die Programmiersprache pizza v3.0" \
      org.opencontainers.image.version="3.0.0"

# Standard-Willkommensseite des Basis-Images entfernen (sonst würde sie ohne
# site/index.html ausgeliefert)
USER root
RUN rm -rf /usr/share/nginx/html/*
USER 101

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-proxy.conf /etc/nginx/pizza-proxy.conf
COPY nginx-teilen.conf.template /etc/nginx/templates/pizza-env/teilen.conf.template

# Teilen über hastebin.com: Token kommt zur Laufzeit aus der Umgebung
# (leer/ungesetzt = Teilen deaktiviert, /api/teilen antwortet 503). Der leere
# Standardwert wird beim Start von 05-pizza-env.envsh gesetzt (nicht per ENV).
# Die Templates werden nach /tmp gerendert, damit read_only + tmpfs funktioniert.
COPY --chmod=755 docker-entrypoint-pizza.envsh /docker-entrypoint.d/05-pizza-env.envsh
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_OUTPUT_DIR=/tmp \
    NGINX_ENVSUBST_FILTER="HASTEBIN_TOKEN|NGINX_LOCAL_RESOLVERS"

COPY --from=build /app/site/ /usr/share/nginx/html/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
