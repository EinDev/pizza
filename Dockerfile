# syntax=docker/dockerfile:1

# Aufbau (Caching): Jede Stage kopiert nur, was sie braucht. Eine Änderung an site/
# baut weder Rust noch npm neu, eine an ui/src nur das Bundle, eine an host/src nur
# das pizza-host-Crate selbst (Abhängigkeiten, xwin-SDK und apt-Pakete liegen in
# stabilen Layern davor). Abhängigkeiten liegen bewusst in normalen Layern, nicht
# nur in Cache-Mounts: Layer überleben einen Export als Registry-/GHA-Cache
# (--cache-to type=…,mode=max), Cache-Mounts nicht.
#
#   ui         ui/package*.json -> npm ci -> ui/src -> site/js/app.bundle.js
#   tests      nur bei SKIP_TESTS=0: ganzes Repo + frisches Bundle -> npm test
#   exe        nur bei SKIP_EXE!=1: Rust-Cross-Builds -> /out (Binaries + ziele.json)
#   runtime    nginx: site/ + Bundle + /out

ARG SKIP_TESTS=1
ARG SKIP_EXE=0
ARG NODE_IMAGE=node:24.22.1-alpine3.24

# ---------------------------------------------------------------------------
# UI-Bundle bauen -> /app/site/js/app.bundle.js
# Schlägt der Build fehl, wird standardmäßig nur gewarnt (eingechecktes Bundle
# bleibt); mit --build-arg STRICT_BUILD=1 bricht der Build ab. npm ci selbst muss
# gelingen (sonst würde ein Netzwerkfehler als Layer im Cache landen).
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS ui
WORKDIR /app/ui
COPY ui/package.json ui/package-lock.json ./
RUN --mount=type=cache,id=pizza-npm,target=/root/.npm \
    npm ci --no-audit --no-fund --prefer-offline
# Rückfall: eingechecktes Bundle (wird bei Erfolg überschrieben)
COPY site/js/app.bundle.js /app/site/js/app.bundle.js
COPY ui/build.mjs ./
COPY ui/src/ src/
ARG STRICT_BUILD=0
RUN npm run build || { [ "$STRICT_BUILD" != "1" ] && \
        echo ">> WARNUNG: UI-Build fehlgeschlagen – nutze eingechecktes site/js/app.bundle.js."; }

# ---------------------------------------------------------------------------
# Tests (Root-npm test). Standard: übersprungen (SKIP_TESTS=1) – dann wird diese
# Stage gar nicht gebaut. Strikt bauen (kaputter Interpreter => kein Image):
#   docker compose build --build-arg SKIP_TESTS=0   bzw.   SKIP_TESTS=0 docker compose build
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS tests-0
WORKDIR /app
COPY . .
COPY --from=ui /app/site/js/app.bundle.js site/js/app.bundle.js
RUN npm test && mkdir -p /ergebnis && echo "npm test bestanden" > /ergebnis/tests.txt

FROM scratch AS tests-1
WORKDIR /ergebnis

FROM tests-${SKIP_TESTS} AS tests

# ---------------------------------------------------------------------------
# Nativer Host – Cross-Builds der pizza-host-Binaries für den EXE-Download im
# Browser – nur Varianten mit Theke-Fenster: Windows x64 (MSVC per xwin, WebView2)
# und Linux x64 (glibc/bookworm, WebKitGTK 4.1).
# Vertrag: host/baue-ziele.sh <ausgabeverzeichnis> legt die Binaries und
# ziele.json dort ab. Abschalten: --build-arg SKIP_EXE=1 (Stage wird nicht gebaut,
# /usr/share/nginx/html/bin/ bleibt leer). Schlägt das Skript fehl, wird
# (Standard) gewarnt; STRICT_BUILD=1 bricht ab.
# ---------------------------------------------------------------------------
FROM rust:1.99.1-slim-bookworm AS exe-werkzeug

# Systempakete (Linux-Ziel: WebKitGTK 4.1) und Windows-Ziel – ändern sich praktisch nie.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev && \
    rm -rf /var/lib/apt/lists/* && \
    rustup target add x86_64-pc-windows-msvc
RUN --mount=type=cache,id=pizza-cargo-registry,target=/usr/local/cargo/registry \
    cargo install --locked --root /usr/local xwin --version 0.10.0

# MSVC-CRT + Windows-SDK (Lizenz vom Nutzer freigegeben) als eigener Layer statt im
# Cache-Mount: Coolify leert den Build-Cache nachts per `docker builder prune -af`,
# Cache-Mounts lassen sich – anders als Layer – nicht als Registry-Cache sichern.
# host/baue-ziele.sh erkennt das fertige SDK an $XWIN_DIR/splat/.fertig.
ENV XWIN_DIR=/opt/xwin
RUN xwin --accept-license --cache-dir /tmp/xwin-dl splat --output "$XWIN_DIR/splat" && \
    rm -rf /tmp/xwin-dl && touch "$XWIN_DIR/splat/.fertig"

FROM exe-werkzeug AS exe-0
WORKDIR /app
ENV AUSGABE_DIR=/out \
    CARGO_TARGET_DIR=/app/host/target

# Crates laden (nur Cargo.toml/Cargo.lock) – Layer bleibt, solange sich die Abhängigkeiten nicht ändern.
COPY host/Cargo.toml host/Cargo.lock host/
RUN mkdir -p host/src && echo 'fn main() {}' > host/src/main.rs && : > host/src/lib.rs && \
    cargo fetch --locked --manifest-path host/Cargo.toml

# Abhängigkeiten für beide Ziele vorab bauen: Dummy-Quellen + leerer Theke-Renderer,
# gleicher Aufruf (baue-ziele.sh, gleiche RUSTFLAGS) wie der echte Build.
COPY host/build.rs host/baue-ziele.sh host/
RUN sed -i 's/\r$//' host/baue-ziele.sh && \
    mkdir -p /tmp/theke-leer && \
    touch /tmp/theke-leer/fenster.html /tmp/theke-leer/fenster.js /tmp/theke-leer/fenster.css \
          /tmp/theke-leer/theke.js /tmp/theke-leer/theke.css && \
    { CARGO_NET_OFFLINE=true PIZZA_THEKE_DIR=/tmp/theke-leer sh host/baue-ziele.sh /tmp/vorab || \
      echo ">> WARNUNG: Vorab-Build der Abhängigkeiten fehlgeschlagen."; } && \
    rm -rf /tmp/vorab /tmp/theke-leer host/src

# Eigentlicher Build: nur pizza-host selbst wird übersetzt und gelinkt.
# Theke-Renderer (eine Render-Engine für Browser und nativ) – build.rs bettet ihn ins Host-Binary ein.
COPY site/js/theke/ site/js/theke/
COPY host/src/ host/src/
# ARG erst hier: STRICT_BUILD soll die Abhängigkeits-Layer davor nicht invalidieren.
ARG STRICT_BUILD=0
RUN mkdir -p /out && \
    find host/src -type f -exec touch {} + && \
    start=$(date +%s); \
    { CARGO_NET_OFFLINE=true sh host/baue-ziele.sh /out || { [ "$STRICT_BUILD" != "1" ] && rm -rf /out/* && \
        echo ">> WARNUNG: host/baue-ziele.sh fehlgeschlagen – keine EXE-Downloads."; }; } && \
    echo ">> Native Builds: $(( $(date +%s) - start )) s" && ls -la /out

FROM scratch AS exe-1
WORKDIR /out

FROM exe-${SKIP_EXE} AS exe

# ---------------------------------------------------------------------------
# Ausliefern – nur site/ über nginx (nicht-root, Port 8080)
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

# Testergebnis (leer bei SKIP_TESTS=1) – hängt die Tests in den Build-Graphen.
COPY --from=tests /ergebnis/ /usr/share/pizza/tests/
# Native pizza-host-Binaries + ziele.json (ggf. leer)
COPY --from=exe /out/ /usr/share/nginx/html/bin/
COPY site/ /usr/share/nginx/html/
COPY --from=ui /app/site/js/app.bundle.js /usr/share/nginx/html/js/app.bundle.js

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
