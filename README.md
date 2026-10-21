# pizza v3.0 – Playground

[![CI](https://github.com/EinDev/pizza/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/EinDev/pizza/actions/workflows/ci.yml)

**pizza** ist eine Programmiersprache, die aussieht wie Java, aber riecht wie eine Holzofen-Pizzeria:
Klassen heißen `klasse`, Exceptions heißen `Ananas`, und wer Käse unter die Tomate legt, bekommt
einen `PizzaFehler B0012`. Der Playground ist eine statische Web-App mit Editor – der Interpreter
läuft komplett im Browser (Web Worker), der Server liefert nur Teig, äh, Dateien aus.

## Schnellstart

```bash
docker compose -f compose.yaml -f compose.lokal.yaml up --build
```

Dann im Browser öffnen: <http://localhost:8080> (Playground) – der eigene Hastebin läuft unter
<http://localhost:8290>. Stoppen mit `docker compose -f compose.yaml -f compose.lokal.yaml down`
(Dokumente bleiben im Volume `hastebin-daten`; `down -v` löscht sie).

`compose.yaml` selbst veröffentlicht **keine** Ports (und setzt keinen `container_name`), weil das
Coolifys Proxy-Routing bricht. `compose.lokal.yaml` ergänzt für lokal die Ports
(`127.0.0.1:8080`, `127.0.0.1:8290`; änderbar über `PIZZA_PORT`/`HASTEBIN_PORT`).

### Build-Optionen

| Build-Arg       | Standard | Wirkung |
|-----------------|----------|---------|
| `SKIP_TESTS`    | `1`      | `0` = `npm test` läuft im Build; ein roter Test verhindert das Image. |
| `STRICT_BUILD`  | `0`      | `1` = ein fehlschlagender UI-Build (`ui/`) bricht das Image ab, statt auf das eingecheckte `site/js/app.bundle.js` zurückzufallen. |

```bash
SKIP_TESTS=0 docker compose build pizza               # über compose.yaml
docker build --build-arg SKIP_TESTS=0 --build-arg STRICT_BUILD=1 -t pizza-playground .
```

Das pizza-Image basiert auf `nginxinc/nginx-unprivileged` (läuft nicht als root, Port 8080) und hat
einen Healthcheck unter `/healthz`. Die Seite ist cross-origin-isoliert (COOP/COEP/CORP).

## Teilen über den eigenen Hastebin

Beim Teilen wird der Code serverseitig auf dem **eigenen Hastebin-Server** (Service `hastebin` in
`compose.yaml`) gespeichert; der pizza-Link sieht so aus: `https://<pizza-domain>/#h=<key>`.
Der Browser spricht dabei nur mit dem pizza-nginx (`connect-src 'self'`), der intern weiterleitet:

| Endpunkt | Weiterleitung / Antwort |
|---|---|
| `POST /api/teilen` (Body = Rohtext, max. 256 KB) | `$HASTEBIN_URL/documents` → `201 {"key":"…"}` |
| `GET /api/teilen/<key>` (`[A-Za-z0-9]{1,64}`) | `$HASTEBIN_URL/raw/<key>` → Rohtext; unbekannt → `404 {"fehler":…}` |
| `GET /api/konfig` | `{"hastebin":"<öffentliche Hastebin-URL>","teilen":true}` |

Fehler kommen immer als JSON `{"fehler":"…"}`: 405 (falsche Methode), 413 (zu groß), 429
(Rate-Limit: 10 Uploads und 60 Abrufe pro Minute und IP), 502 (Hastebin nicht erreichbar),
503 (Teilen nicht konfiguriert).

**Hastebin-Server:** [skyra-project/haste-server](https://github.com/skyra-project/haste-server)
(MIT, gepflegter Nachfolger des ursprünglichen haste-server), gebaut aus einem gepinnten Commit
(`hastebin/Dockerfile`, `HASTE_COMMIT`). Speicher: Redis mit AOF im Volume `hastebin-daten`.
Er hat eine eigene öffentliche Oberfläche (Einfügen, Rohansicht `/raw/<key>`, API-Doku `/swagger-ui`).

| Variable (Service) | Standard | Bedeutung |
|---|---|---|
| `HASTEBIN_URL` (pizza) | `http://hastebin:8290` | interner Upstream; leer = Teilen aus (503) |
| `HASTEBIN_OEFFENTLICH` (pizza) | `SERVICE_URL_HASTEBIN_8290` | öffentliche Hastebin-URL für `/api/konfig` |
| `HASTEBIN_TOKEN` (pizza) | leer | nur für externe Dienste mit Token (z. B. hastebin.com) |
| `HASTEBIN_ABLAUF_SEKUNDEN` (hastebin) | `7776000` (90 Tage) | Ablaufzeit je Dokument |
| `HASTEBIN_RATE_LIMIT` (hastebin) | `60` | Anfragen pro Minute und IP direkt am Hastebin |
| `SERVICE_PASSWORD_REDIS` | Coolify generiert; lokal `pizza-lokal` | Redis-Passwort (nur intern erreichbar) |

Max. Dokumentgröße: 256 KB (`MAX_LENGTH` im Hastebin = `client_max_body_size` im pizza-nginx).

**Datenschutz:** Geteilter Code liegt auf dem eigenen Server, ist aber für **jeden mit dem Link**
abrufbar (auch über die öffentliche Hastebin-Domain) und wird nach 90 Tagen gelöscht. Die UI weist
vor dem Teilen darauf hin. Der Proxy reicht keine Cookies, keinen Referer und keinen User-Agent
weiter; die Client-IP geht nur an den internen Hastebin (für dessen Rate-Limit).

## Deployment in Coolify

Ziel: zwei Domains über Coolifys Proxy mit TLS, z. B. `pizza.example.com` (Playground) und
`paste.example.com` (Hastebin). Die echten Domains stehen nur in Coolify, nicht im Repo.

1. **Ressource anlegen:** *New Resource* → Git-Repository → **Build Pack: Docker Compose**,
   Compose-Datei `compose.yaml` (Base Directory `/`). `compose.lokal.yaml` **nicht** angeben.
2. **Domains pro Service** (Abschnitt *Domains*/*Services* der Ressource):
   - `pizza` → `https://pizza.example.com:8080`
   - `hastebin` → `https://paste.example.com:8290`
   - `redis` → keine Domain.

   Der Port-Suffix ist der **interne** Container-Port (Coolify routet darauf); öffentlich bleibt es
   443. Ohne Suffix landet der Proxy auf Port 80 → „No Available Server“/503.
3. **Umgebungsvariablen** prüfen (*Environment Variables*): `SERVICE_URL_PIZZA_8080` und
   `SERVICE_URL_HASTEBIN_8290` füllt Coolify aus den Domains, `SERVICE_PASSWORD_REDIS` wird
   generiert. `HASTEBIN_OEFFENTLICH` nur setzen, wenn die Hastebin-URL abweichen soll.
   Optional: `HASTEBIN_ABLAUF_SEKUNDEN`, `HASTEBIN_RATE_LIMIT`.
4. **Persistent Storage:** Das Volume `hastebin-daten` (Redis `/data`) legt Coolify aus der
   Compose-Datei an – nichts weiter zu tun; es übersteht Redeploys.
5. **Deploy** und prüfen:
   - alle drei Services *healthy*;
   - `https://pizza.example.com/healthz` → `ok`;
   - `https://pizza.example.com/api/konfig` → `{"hastebin":"https://paste.example.com","teilen":true}`;
   - im Playground teilen → Link `https://pizza.example.com/#h=<key>` öffnen;
   - `https://paste.example.com/raw/<key>` zeigt denselben Code.

## Lokale Entwicklung

Voraussetzung: Node.js 22.

```bash
# UI bauen (CodeMirror 6 + esbuild) -> site/js/app.bundle.js
cd ui && npm install && npm run build

# Tests (Interpreter, Beispiele, Doku-Codeblöcke) – im Repo-Root
npm test

# pizza-Programm auf der Kommandozeile ausführen
node bin/pizza.js site/beispiele/grundlagen/hallo-welt.pizza
```

`site/` ist der Web-Root und kann auch mit jedem anderen statischen Server ausgeliefert werden
(z. B. `npx serve site`). `site/js/app.bundle.js` ist ein Build-Ergebnis, wird aber eingecheckt.

## Tests & CI

Jeder Push und jeder Pull Request auf `master` startet [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
Die CI ist das **Sicherheitssignal** – sie blockiert das automatische Deployment von `master` nicht.
Alle Jobs laufen parallel; Jobs für Suiten, die es noch nicht gibt, überspringen sich (Hinweis im Lauf)
und werden automatisch aktiv, sobald Skript bzw. Ordner existieren.

| Job | Was | lokal |
|---|---|---|
| Interpreter | Interpreter, Beispiele, Doku-Codeblöcke | `npm test` |
| Coverage | Zeilen-/Zweig-Coverage von `site/js/pizza.js` (+ `pizzaiolo*`), Bericht als Artefakt `coverage` und im Job-Summary | `npm run coverage` |
| Prüfstand | unabhängige Konformitätsprüfung gegen `SPEC.md` | `npm run test:pruefstand` |
| Compiler | pizza → Wasm | `npm run test:wasm` |
| Differenz & Fuzz | Interpreter vs. Wasm (vs. nativer Host); Fuzz mit `FUZZ_SEED=42`, `FUZZ_ANZAHL=500` | `npm run test:differenz`, `npm run test:fuzz` |
| UI | `ui/`: `npm test` + `npm run build`; warnt, wenn das eingecheckte `site/js/app.bundle.js` vom Build abweicht | `cd ui && npm test && npm run build` |
| Browser-E2E | Playground in Chrome (`CHROME_PFAD`), Artefakte aus `e2e/artefakte/` | `npm run test:e2e` |
| Nativer Host | `host/`: `cargo test` + Release-Build (Linux & Windows), Artefakte `pizza-host-linux`/`-windows` | `cd host && cargo test` |
| Docker | Image strikt bauen (`SKIP_TESTS=0`, `STRICT_BUILD=1`) + Rauchtest `/healthz` | `docker build .` |

Alles Vorhandene auf einmal (wie die CI, ohne Browser): `npm run test:alles` (mit `-- --mit-e2e` inkl. E2E).

**Coverage** nutzt die in Node eingebaute Test-Coverage (Node ≥ 22.5, keine Abhängigkeiten). Ergebnis in
`coverage/`: `lcov.info`, `zusammenfassung.md` (Tabelle + größte ungetestete Funktionen/Blöcke) und
`zusammenfassung.json`. Nur bestimmte Suiten messen: `npm run coverage -- interpreter`.

## Projektstruktur

```
pizza/
├── SPEC.md              Sprachspezifikation (verbindlich)
├── ARCHITEKTUR.md       Architektur, Schnittstellen, Zuständigkeiten
├── package.json         Root: npm test
├── tests/               Test-Harness
├── bin/pizza.js         CLI
├── ui/                  Editor-Quellen (CodeMirror 6, esbuild)
├── site/                Web-Root (von nginx ausgeliefert)
│   ├── index.html, css/, favicon.svg
│   ├── js/pizza.js      Interpreter (UMD, Browser + Node)
│   ├── js/worker.js     Web Worker für Programmläufe
│   ├── js/app.bundle.js gebaute UI
│   ├── js/doku/         Doku-Inhalte
│   └── beispiele/       Beispielprogramme (*.pizza, *.erwartet, Manifeste)
├── Dockerfile, compose.yaml, nginx.conf
├── compose.lokal.yaml   lokale Ports (nicht für Coolify)
├── nginx-proxy.conf, nginx-teilen.conf.template, docker-entrypoint-pizza.envsh   Teilen-Proxy
├── hastebin/Dockerfile  eigener Hastebin-Server (gepinnter Upstream-Commit)
└── README.md
```

Details zur Sprache: [`SPEC.md`](SPEC.md). Details zum Aufbau: [`ARCHITEKTUR.md`](ARCHITEKTUR.md).

## Hawaii

`hawaii` ist ein gültiger Typ. Der Parser akzeptiert ihn. Der Compiler warnt nur ganz leise.

Probieren Sie es lieber nicht aus. Und wenn doch: Wir haben Sie gewarnt. Der Pizzaiolo sagt nichts.
Er schaut nur.
