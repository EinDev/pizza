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

Dann im Browser öffnen: <http://localhost:8080>. Stoppen mit
`docker compose -f compose.yaml -f compose.lokal.yaml down` (geteilte Codes bleiben im Volume
`hastebin-daten`; `down -v` löscht sie).

`compose.yaml` selbst veröffentlicht **keine** Ports (und setzt keinen `container_name`), weil das
Coolifys Proxy-Routing bricht. `compose.lokal.yaml` ergänzt für lokal nur den Playground-Port
(`127.0.0.1:8080`, änderbar über `PIZZA_PORT`).

### Build-Optionen

| Build-Arg       | Standard | Wirkung |
|-----------------|----------|---------|
| `SKIP_TESTS`    | `1`      | `0` = `npm test` läuft im Build; ein roter Test verhindert das Image. |
| `STRICT_BUILD`  | `0`      | `1` = ein fehlschlagender UI-Build (`ui/`) bricht das Image ab, statt auf das eingecheckte `site/js/app.bundle.js` zurückzufallen. |
| `SKIP_EXE`      | `0`      | `1` = keine nativen `pizza-host`-Binaries bauen (Stage `exe`: Rust + xwin (Windows-MSVC) + WebKitGTK 4.1 (Linux), führt `host/baue-ziele.sh /out` aus; Ergebnis unter `/bin/` inkl. `ziele.json`). |

```bash
SKIP_TESTS=0 docker compose build pizza               # über compose.yaml
docker build --build-arg SKIP_TESTS=0 --build-arg STRICT_BUILD=1 -t pizza-playground .
```

Das pizza-Image basiert auf `nginxinc/nginx-unprivileged` (läuft nicht als root, Port 8080) und hat
einen Healthcheck unter `/healthz`. Die Seite ist cross-origin-isoliert (COOP/COEP/CORP).

## Teilen (Betrieb)

Beim Teilen werden Code und Tab-Name serverseitig gespeichert (ein Dokument mit kleiner JSON-Hülle
`{"pizza":"teilen","v":1,"name":…,"code":…}`; ältere Dokumente mit rohem Code funktionieren weiter); der Dialog zeigt
danach zwei Links zum selben Schlüssel und kopiert den App-Link gleich in die Zwischenablage:
`https://<pizza-domain>/#h=<key>` (**Code öffnen** – Playground mit Editor) und
`https://<pizza-domain>/#app=<key>` (**App starten** – nur Ladebalken, dann läuft das Programm im Vollbild; übersetzt wird zur
Laufzeit im Browser mit dem Motor „Auto“, es wird kein Kompilat gespeichert). Beide Formen stehen im Hash und erreichen den
Server nur als `GET /api/teilen/<key>`; nginx braucht dafür nichts Zusätzliches. Der App-Link nutzt dieselben Vorratskammern
(`localStorage` `pizza.vorrat.<name>`) wie geteilte Tabs im Playground. Der Browser spricht nur mit dem pizza-nginx
(`connect-src 'self'`). Dahinter läuft ein **interner** Speicherdienst, der von außen nicht
erreichbar ist (keine Domain, kein Port):

| Endpunkt (pizza-nginx) | intern / Antwort |
|---|---|
| `POST /api/teilen` (Body = Rohtext, max. 256 KB) | `$HASTEBIN_URL/documents` → `201 {"key":"…"}` |
| `GET /api/teilen/<key>` (`[A-Za-z0-9]{1,64}`) | `$HASTEBIN_URL/raw/<key>` → Rohtext; unbekannt/abgelaufen → `404 {"fehler":…}` |
| `GET /api/konfig` | `{"teilen":true,"aufbewahrungTage":90,"aufbewahrungAb":"erstellung"}` |

Fehler kommen immer als JSON `{"fehler":"…"}`: 405 (falsche Methode), 413 (zu groß), 429
(Rate-Limit: 10 Uploads und 60 Abrufe pro Minute und IP), 502 (Dienst nicht erreichbar),
503 (Teilen nicht eingerichtet).

**Technik:** Service `hastebin` = [skyra-project/haste-server](https://github.com/skyra-project/haste-server)
(MIT, gepflegter Nachfolger des ursprünglichen haste-server), gebaut aus einem gepinnten Commit
(`hastebin/Dockerfile`, `HASTE_COMMIT`); Service `redis` speichert mit AOF im Volume `hastebin-daten`.

| Variable | Standard | Bedeutung |
|---|---|---|
| `HASTEBIN_URL` (pizza) | `http://hastebin:8290` | interner Upstream; leer = Teilen aus (503, `"teilen":false`) |
| `HASTEBIN_ABLAUF_SEKUNDEN` | `7776000` (90 Tage) | **eine** Variable (in `compose.yaml` bei `pizza` und `hastebin` eingetragen): Ablaufzeit im haste-server und `aufbewahrungTage` in `/api/konfig`; `0` = nie (`null`) |
| `HASTEBIN_RATE_LIMIT` (hastebin) | `60` | Anfragen pro Minute und IP am internen Dienst |
| `SERVICE_PASSWORD_REDIS` | Coolify generiert; lokal `pizza-lokal` | Redis-Passwort (nur intern erreichbar) |

**Aufbewahrung:** Die Frist läuft **fest ab Erstellung** (`"aufbewahrungAb":"erstellung"`): der
haste-server speichert mit Redis `SETEX`, Abrufe sind ein einfaches `GET` und verlängern nichts.
Max. Dokumentgröße: 256 KB (`MAX_LENGTH` = `client_max_body_size` im pizza-nginx).

**Datenschutz:** Geteilter Code bleibt auf dem eigenen Server, ist aber für **jeden mit dem Link**
abrufbar und wird nach Ablauf der Frist gelöscht. Die UI weist vor dem Teilen darauf hin. Der Proxy
reicht keine Cookies, keinen Referer und keinen User-Agent weiter; die Client-IP geht als
`X-Real-IP` an den internen Dienst (für dessen Rate-Limit).

## Deployment in Coolify

Eine Domain, z. B. `pizza.example.com` (die echte Domain steht nur in Coolify, nicht im Repo).

1. **Ressource anlegen:** *New Resource* → Git-Repository → **Build Pack: Docker Compose**,
   Compose-Datei `compose.yaml` (Base Directory `/`). `compose.lokal.yaml` **nicht** angeben.
2. **Domain** (Abschnitt *Domains*/*Services* der Ressource): nur beim Service
   `pizza` → `https://pizza.example.com:8080`. `hastebin` und `redis` bekommen **keine** Domain.

   Der Port-Suffix ist der **interne** Container-Port (Coolify routet darauf); öffentlich bleibt es
   443. Ohne Suffix landet der Proxy auf Port 80 → „No Available Server“/503.
3. **Umgebungsvariablen** (*Environment Variables*): `SERVICE_URL_PIZZA_8080` füllt Coolify aus der
   Domain, `SERVICE_PASSWORD_REDIS` wird generiert. Optional: `HASTEBIN_ABLAUF_SEKUNDEN`,
   `HASTEBIN_RATE_LIMIT`.
4. **Persistent Storage:** Das Volume `hastebin-daten` (Redis `/data`) legt Coolify aus der
   Compose-Datei an – nichts weiter zu tun; es übersteht Redeploys.
5. **Deploy** und prüfen:
   - alle drei Services *healthy*;
   - `https://pizza.example.com/healthz` → `ok`;
   - `https://pizza.example.com/api/konfig` → `{"teilen":true,"aufbewahrungTage":90,"aufbewahrungAb":"erstellung"}`;
   - im Playground teilen → Links `https://pizza.example.com/#h=<key>` (Code) und `…/#app=<key>` (App im Vollbild) in einem anderen Browser öffnen.

### Build-Cache

Das `Dockerfile` ist auf Layer-Cache geschnitten: Änderungen nur an `site/` bauen weder Rust noch
npm neu, nur an `ui/src` nur das Bundle, nur an `host/src` nur das `pizza-host`-Crate (Crates,
xwin-SDK und apt-Pakete liegen in stabilen Layern davor). Coolify baut mit
`docker compose build --pull` über den Docker-Daemon des Servers und nutzt diesen Cache –
**aber** die Server-Einstellung *Docker Cleanup* führt standardmäßig (Stand Coolify v4.x, Okt. 2026 – in den Server-Einstellungen prüfen) jede Nacht
`docker builder prune -af` aus (*Force Docker Cleanup* an, Frequenz `0 0 * * *`). Danach ist der
erste Deploy wieder ein kalter Build (mehrere Minuten). Abhilfen: *Force Docker Cleanup*
abschalten (Cleanup nur über dem Platten-Schwellwert) oder einen Registry-Cache
(`cache_from`/`cache_to` mit `type=registry,mode=max`) einrichten – Cache-Mounts
(`--mount=type=cache`) werden dabei nicht mitgesichert, Layer schon.

## Lokale Entwicklung

Voraussetzung: Node.js ≥ 22.12 (CI und Docker: Node 24 LTS).

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
├── hastebin/Dockerfile  interner Teilen-Dienst (haste-server, gepinnter Upstream-Commit)
└── README.md
```

Details zur Sprache: [`SPEC.md`](SPEC.md). Details zum Aufbau: [`ARCHITEKTUR.md`](ARCHITEKTUR.md).

## Hawaii

`hawaii` ist ein gültiger Typ. Der Parser akzeptiert ihn. Der Compiler warnt nur ganz leise.

Probieren Sie es lieber nicht aus. Und wenn doch: Wir haben Sie gewarnt. Der Pizzaiolo sagt nichts.
Er schaut nur.
