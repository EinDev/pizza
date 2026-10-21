# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: Teig kneten – UI bauen und (optional) Interpreter testen
# ---------------------------------------------------------------------------
FROM node:24.22.1-alpine3.24 AS build

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
# Stage 2: Nativer Host – Cross-Builds der pizza-host-Binaries für den
# EXE-Download im Browser – nur Varianten mit Theke-Fenster: Windows x64 (MSVC
# per xwin, WebView2) und Linux x64 (glibc/bookworm, WebKitGTK 4.1).
# Vertrag: host/baue-ziele.sh <ausgabeverzeichnis> legt die Binaries und
# ziele.json dort ab (auch als $AUSGABE_DIR verfügbar). Fehlt das Skript, bleibt
# /usr/share/nginx/html/bin/ leer. Abschalten: --build-arg SKIP_EXE=1.
# Schlägt das Skript fehl, wird (Standard) gewarnt; STRICT_BUILD=1 bricht ab.
# Cargo-Registry und target/ liegen in BuildKit-Cache-Mounts (schnelle Rebuilds).
# ---------------------------------------------------------------------------
FROM rust:1.99.1-slim-bookworm AS exe

ARG SKIP_EXE=0
ARG STRICT_BUILD=0
RUN if [ "$SKIP_EXE" != "1" ]; then \
        apt-get update && \
        apt-get install -y --no-install-recommends \
            pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev && \
        rm -rf /var/lib/apt/lists/* && \
        rustup target add x86_64-pc-windows-msvc && \
        cargo install --locked --root /usr/local xwin --version 0.10.0 && rm -rf /usr/local/cargo/registry/*; \
    fi

WORKDIR /app
COPY host/ host/
# Theke-Renderer (eine Render-Engine für Browser und nativ) – build.rs bettet ihn ins Host-Binary ein.
COPY site/js/theke/ site/js/theke/
# Windows: MSVC-Ziel per xwin (MSVC-CRT + Windows-SDK, Lizenz vom Nutzer freigegeben), gelinkt mit rust-lld,
# CRT statisch → eine EXE ohne Zusatz-DLLs (auch ohne WebView2Loader.dll). Das entpackte SDK liegt im Cache-Mount.
ENV AUSGABE_DIR=/out \
    CARGO_TARGET_DIR=/app/host/target \
    XWIN_DIR=/opt/xwin
RUN --mount=type=cache,id=pizza-cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=pizza-host-target-bookworm,target=/app/host/target \
    --mount=type=cache,id=pizza-xwin,target=/opt/xwin \
    mkdir -p /out && \
    if [ "$SKIP_EXE" = "1" ]; then \
        echo ">> SKIP_EXE=1 – keine nativen Binaries."; \
    elif [ -f host/baue-ziele.sh ]; then \
        start=$(date +%s); \
        find host -name '*.sh' -exec sed -i 's/\r$//' {} + ; \
        { sh host/baue-ziele.sh /out || { [ "$STRICT_BUILD" != "1" ] && rm -rf /out/* && \
            echo ">> WARNUNG: host/baue-ziele.sh fehlgeschlagen – keine EXE-Downloads."; }; } && \
        echo ">> Native Builds: $(( $(date +%s) - start )) s"; ls -la /out; \
    else \
        echo ">> host/baue-ziele.sh fehlt noch – keine EXE-Downloads."; \
    fi

# ---------------------------------------------------------------------------
# Stage 3: Ausliefern – nur site/ über nginx (nicht-root, Port 8080)
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24 AS runtime

LABEL org.opencontainers.image.title="pizza-playground" \
      org.opencontainers.image.description="Playground für die Programmiersprache pizza v3.0" \
      org.opencontainers.image.version="3.0.0"

# Standard-Willkommensseite des Basis-Images entfernen (sonst würde sie ohne
# site/index.html ausgeliefert)
USER root
RUN rm -rf /usr/share/nginx/html/*
# Setzt beim Start HASTEBIN_URL-Standard und die Aufbewahrungstage (siehe unten);
# CRLF entfernen, falls das Repo unter Windows ausgecheckt wurde.
COPY --chmod=755 docker-entrypoint-pizza.envsh /docker-entrypoint.d/05-pizza-env.envsh
RUN tr -d '\015' < /docker-entrypoint.d/05-pizza-env.envsh > /tmp/env.sh \
    && cat /tmp/env.sh > /docker-entrypoint.d/05-pizza-env.envsh && rm /tmp/env.sh
USER 101

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-proxy.conf /etc/nginx/pizza-proxy.conf
COPY nginx-teilen.conf.template /etc/nginx/templates/pizza-env/teilen.conf.template

# Teilen: HASTEBIN_URL (interner haste-server, z. B. http://hastebin:8290) und
# HASTEBIN_ABLAUF_SEKUNDEN (-> aufbewahrungTage in /api/konfig) kommen zur Laufzeit
# aus der Umgebung (compose.yaml). HASTEBIN_URL leer = Teilen
# deaktiviert (503). Leere Standards setzt 05-pizza-env.envsh beim Start (nicht per ENV).
# Die Templates werden nach /tmp gerendert, damit read_only + tmpfs funktioniert.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_OUTPUT_DIR=/tmp \
    NGINX_ENVSUBST_FILTER="HASTEBIN_URL|TEILEN_AUFBEWAHRUNG_TAGE|NGINX_LOCAL_RESOLVERS"

COPY --from=build /app/site/ /usr/share/nginx/html/
# Native pizza-host-Binaries + ziele.json (ggf. leer)
COPY --from=exe /out/ /usr/share/nginx/html/bin/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
