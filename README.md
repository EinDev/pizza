# pizza v3.1 – Playground

[![CI](https://github.com/EinDev/pizza/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/EinDev/pizza/actions/workflows/ci.yml)

**pizza** ist eine Programmiersprache, die aussieht wie Java, aber riecht wie eine Holzofen-Pizzeria:
Klassen heißen `klasse`, Exceptions heißen `Ananas`, Listen sind Bleche, Maps Speisekarten, und wer eine
Endlosschleife baut, hört: „Die Pizza ist noch im Ofen.“ Der Playground ist eine statische Web-App mit Editor – der Interpreter
läuft komplett im Browser (Web Worker), der Server liefert nur Teig, äh, Dateien aus.

Was sich seit pizza 3.0 geändert hat (und wie man umsteigt): [`CHANGELOG.md`](CHANGELOG.md).

## Schnellstart

```bash
docker compose -f compose.yaml -f compose.lokal.yaml up --build
```

Dann im Browser öffnen: <http://localhost:8080>. Stoppen mit
`docker compose -f compose.yaml -f compose.lokal.yaml down` (geteilte Projekte bleiben im Volume
`durchreiche-daten`; `down -v` löscht sie).

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

Geteilt wird über den eigenen, **internen** Dienst **Durchreiche** (`durchreiche/`, Node ohne Abhängigkeiten; Konzept
[`PROJEKTE.md`](PROJEKTE.md) §4, Vertrag K-143). Der Browser spricht nur mit dem pizza-nginx (`connect-src 'self'`); nginx reicht
`/api/…` unverändert an den Dienst weiter, der weder Domain noch Port hat. Ein geteilter Link enthält ein ganzes Projekt
(Dateien inhaltsadressiert per SHA-256, je Version ein Manifest) und kann **neue Versionen** bekommen: `#h=<id>`/`#app=<id>` zeigen
immer die neueste, `#h=<id>@<n>`/`#app=<id>@<n>` eine feste Version (`<id>` = 12 Zeichen Base62). Wer den Link erstellt, bekommt
einmalig einen **Bearbeitungsschlüssel** (256 bit; gespeichert wird nur sein Hash) für neue Versionen und zum Löschen. Alte
Hastebin-Links (`#h=` mit 10 Kleinbuchstaben) verfallen: `GET /api/teilen/<alt>` → `404` mit Hinweis auf den alten Dienst.

Im Playground (Paket PB2, `ui/src/teilen.js`): „Teilen“ lädt nur fehlende Dateien hoch (gleiche Bilder nie zweimal), bietet bei
eigenen Links „Neue Version teilen (Link bleibt gleich)“ oder „Neuer Link“, zeigt die festen Links `@n`, kopiert den
Bearbeitungsschlüssel für ein anderes Gerät („Schlüssel eingeben“) und löscht Links. Der Schlüssel liegt nur im Browser
(IndexedDB, am Projekt). Ein Code-Link öffnet das Projekt als eigene Kopie; ist es dein eigener Link, wird dein Projekt geöffnet
und – falls es auf dem Server eine neuere Version gibt – ihr Laden angeboten.

| Endpunkt (pizza-nginx → Dienst) | Zweck / Antwort |
|---|---|
| `GET /api/konfig` | `{"teilen":true,"aufbewahrungTage":90,"aufbewahrungAb":"letzte-version","grenzen":{…}}`; Dienst aus oder `TEILEN_URL` leer → `{"teilen":false}` |
| `POST /api/blob/fehlend` (`{"sha256":[…]}`) | `{"fehlend":[…]}` – welche Dateien noch hochgeladen werden müssen |
| `PUT /api/blob/<sha256>` (Rohbytes, ≤ 2 MiB) | `201` neu / `200` vorhanden; Hash wird geprüft (`422`) |
| `GET /api/blob/<sha256>` | Inhalt als `application/octet-stream`, `attachment`, `private, max-age=31536000, immutable` |
| `POST /api/teilen` (Manifest, ≤ 64 KiB) | `201 {"id","version":1,"schluessel"}`; fehlende Dateien → `409 {"fehlend":[…]}` |
| `POST /api/teilen/<id>` + `Authorization: Bearer <schluessel>` | `201 {"id","version":n}`; gleiches Manifest → `200 {…,"unveraendert":true}` |
| `GET /api/teilen/<id>` / `GET /api/teilen/<id>@<n>` | `{"id","version","versionen","geaendert","ablauf","projekt"}` (neueste `no-store`, feste Version `immutable`) |
| `DELETE /api/teilen/<id>` + Schlüssel | `204` – Link samt allen Versionen gelöscht |

Fehler kommen als JSON `{"fehler":"…"}`: 403 (Schlüssel passt nicht), 404 (unbekannt/abgelaufen), 405, 409 (Dateien fehlen,
200 Versionen erreicht), 413 (zu groß), 415 (Body ohne `application/json` bzw. `application/octet-stream` – kein Teilen über fremde
Formulare), 422 (Manifest/Inhalt ungültig), 429 (Rate-Limit), 502 (Dienst nicht erreichbar), 503 (Teilen nicht eingerichtet),
507 (Speicher voll). **Rate-Limits** (nginx, je IP; der Dienst zählt dahinter noch einmal): Erstellen/Version/Löschen 10/min
(Burst 3), Manifest lesen und `fehlend` 60/min (Burst 20), Blob-PUT 240/min (Burst 120), Blob-GET 1200/min (Burst 300).

**Ablage:** Volume `durchreiche-daten` (`/daten`): `blobs/<ab>/<sha256>`, `links/<Xy>/<id>.json`, `tmp/` (Schreiben über
tmp → fsync → rename). Ein stündlicher Aufräumlauf löscht abgelaufene Links und Dateien, die kein Link mehr nutzt (frisch
hochgeladene erst nach 1 h). Kein Datenbankserver.

| Variable | Dienst | Standard | Bedeutung |
|---|---|---|---|
| `TEILEN_URL` | pizza | `http://durchreiche:8291` | interner Upstream; leer = Teilen aus (`{"teilen":false}`, sonst 503) |
| `TEILEN_ABLAUF_TAGE` | durchreiche | `90` | Aufbewahrung **ab der letzten Version** (jede neue Version verlängert); `0` = unbegrenzt (`null`) |
| `TEILEN_SPEICHER_MAX_MB` | durchreiche | `2048` | Speicherdeckel; darüber `507` (Lesen geht weiter) |
| `TEILEN_MAX_DATEIEN` | durchreiche | `100` | Dateien je Projekt |
| `TEILEN_MAX_DATEI_BYTES` | durchreiche | `2097152` | Bytes je Datei (nginx deckelt fest auf 2 MiB) |
| `TEILEN_MAX_PROJEKT_BYTES` | durchreiche | `8388608` | Bytes je Projekt |
| `TEILEN_MAX_PIZZA_BYTES` | durchreiche | `524288` | Bytes je `.pizza`-Datei |
| `TEILEN_MAX_MANIFEST_BYTES` | durchreiche | `65536` | Bytes je Manifest (nginx deckelt fest auf 64 KiB) |
| `TEILEN_MAX_VERSIONEN` | durchreiche | `200` | Versionen je Link |
| `TEILEN_LOSE_JE_IP_MB`, `TEILEN_LOSE_ANTEIL_PROZENT`, `TEILEN_NEU_JE_IP_MB` | durchreiche | `32`, `10`, `64` | noch keinem Link zugeordnete Uploads je IP und Stunde · Anteil solcher Uploads am Speicherdeckel · neue Bytes in Links je IP und Stunde |
| `TEILEN_RATE_SCHREIBEN`, `TEILEN_RATE_LESEN`, `TEILEN_RATE_FEHLEND`, `TEILEN_RATE_BLOB` | durchreiche | `13`, `80`, `80`, `360` | Anfragen je Minute und IP im Dienst (= nginx-Rate + Burst; `0` = aus) |

Die letzten drei Zeilen stehen nicht in `compose.yaml`; wer sie ändern will, ergänzt sie dort beim Dienst `durchreiche`.

**Datenschutz:** Gespeichert werden nur Dateiinhalte, Manifeste, Erstellungs-/Änderungsdatum (tagesgenau) und der Hash des
Schlüssels – keine IP-Adressen, kein User-Agent, keine Zugriffszeiten (IPs leben nur im Arbeitsspeicher der Zähler, ≤ 1 h).
Geteilte Projekte sind für **jeden mit dem Link** abrufbar, ältere Versionen auch. nginx schreibt für `/api/` kein Zugriffsprotokoll
und nur kritische Fehler (IDs sind Zugriffsrechte); der Dienst protokolliert weder Inhalte noch IDs oder Schlüssel. Der Proxy reicht
keine Cookies, keinen Referer und keinen User-Agent weiter; die Client-IP geht als `X-Real-IP` (von nginx gesetzt, nicht fälschbar)
an den Dienst, `Authorization` nur bei `POST`/`DELETE /api/teilen/<id>`.

## Deployment in Coolify

Eine Domain, z. B. `pizza.example.com` (die echte Domain steht nur in Coolify, nicht im Repo).

1. **Ressource anlegen:** *New Resource* → Git-Repository → **Build Pack: Docker Compose**,
   Compose-Datei `compose.yaml` (Base Directory `/`). `compose.lokal.yaml` **nicht** angeben.
2. **Domain** (Abschnitt *Domains*/*Services* der Ressource): nur beim Service
   `pizza` → `https://pizza.example.com:8080`. `durchreiche` bekommt **keine** Domain.

   Der Port-Suffix ist der **interne** Container-Port (Coolify routet darauf); öffentlich bleibt es
   443. Ohne Suffix landet der Proxy auf Port 80 → „No Available Server“/503.
3. **Umgebungsvariablen** (*Environment Variables*): `SERVICE_URL_PIZZA_8080` füllt Coolify aus der
   Domain. Optional: `TEILEN_ABLAUF_TAGE`, `TEILEN_SPEICHER_MAX_MB` und die übrigen `TEILEN_MAX_*` (Tabelle oben).
4. **Persistent Storage:** Das Volume `durchreiche-daten` (`/daten` im Dienst `durchreiche`) legt Coolify aus der
   Compose-Datei an – nichts weiter zu tun; es übersteht Redeploys.
5. **Deploy** und prüfen:
   - beide Services *healthy*;
   - `https://pizza.example.com/healthz` → `ok`;
   - `https://pizza.example.com/api/konfig` → `{"teilen":true,"aufbewahrungTage":90,"aufbewahrungAb":"letzte-version",…}`;
   - im Playground teilen → Links `https://pizza.example.com/#h=<id>` (Code) und `…/#app=<id>` (App im Vollbild) in einem anderen Browser öffnen.

**Umzug von hastebin (einmalig):** Die Variablen `HASTEBIN_URL`, `HASTEBIN_ABLAUF_SEKUNDEN`, `HASTEBIN_RATE_LIMIT` und
`SERVICE_PASSWORD_REDIS` in Coolify löschen; nach dem ersten erfolgreichen Deploy die alten Container `hastebin`/`redis` (falls
Coolify sie nicht selbst entfernt) und das alte Volume `hastebin-daten` von Hand löschen. Alte Links werden nicht übernommen.

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
node bin/pizza.js site/beispiele/grundlagen/hallo-welt
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
| Interpreter | Interpreter, Beispiele, Doku-Codeblöcke, CLI, Teilen-Dienst Durchreiche (`node --test`) | `npm test` |
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
│   ├── js/pizza.js      Interpreter (UMD, Browser + Node), generiert aus js/pizza/ (npm run baue:pizza)
│   ├── js/worker.js     Web Worker für Programmläufe
│   ├── js/app.bundle.js gebaute UI
│   ├── js/doku/         Doku-Inhalte
│   └── beispiele/       Beispielprogramme (*.pizza, *.erwartet, Manifeste)
├── Dockerfile, compose.yaml, nginx.conf
├── compose.lokal.yaml   lokale Ports (nicht für Coolify)
├── nginx-proxy.conf, nginx-teilen.conf.template, docker-entrypoint-pizza.envsh   Teilen-Proxy
├── durchreiche/        interner Teilen-Dienst (Node ohne Abhängigkeiten, Tests in durchreiche/test)
└── README.md
```

Details zur Sprache: [`SPEC.md`](SPEC.md). Details zum Aufbau: [`ARCHITEKTUR.md`](ARCHITEKTUR.md).

## Hawaii

`hawaii` ist ein gültiger Typ. Der Parser akzeptiert ihn. Der Compiler warnt nur ganz leise.

Probieren Sie es lieber nicht aus. Und wenn doch: Wir haben Sie gewarnt. Der Pizzaiolo sagt nichts.
Er schaut nur.
