# pizza v3.0 – Playground

[![CI](https://github.com/EinDev/pizza/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/EinDev/pizza/actions/workflows/ci.yml)

**pizza** ist eine Programmiersprache, die aussieht wie Java, aber riecht wie eine Holzofen-Pizzeria:
Klassen heißen `klasse`, Exceptions heißen `Ananas`, und wer Käse unter die Tomate legt, bekommt
einen `PizzaFehler B0012`. Der Playground ist eine statische Web-App mit Editor – der Interpreter
läuft komplett im Browser (Web Worker), der Server liefert nur Teig, äh, Dateien aus.

## Schnellstart

```bash
docker compose up --build
```

Dann im Browser öffnen: <http://localhost:8080>

Stoppen mit `docker compose down`.

### Build-Optionen

| Build-Arg       | Standard | Wirkung |
|-----------------|----------|---------|
| `SKIP_TESTS`    | `1`      | `0` = `npm test` läuft im Build; ein roter Test verhindert das Image. |
| `STRICT_BUILD`  | `0`      | `1` = ein fehlschlagender UI-Build (`ui/`) bricht das Image ab, statt auf das eingecheckte `site/js/app.bundle.js` zurückzufallen. |

```bash
SKIP_TESTS=0 docker compose build                     # über compose.yaml
docker build --build-arg SKIP_TESTS=0 --build-arg STRICT_BUILD=1 -t pizza-playground .
```

Das Image basiert auf `nginxinc/nginx-unprivileged` (läuft nicht als root, Port 8080) und hat
einen Healthcheck unter `/healthz`.

## Teilen über Hastebin

Beim Teilen wird der Code serverseitig auf [hastebin.com](https://hastebin.com) (Toptal) abgelegt;
der Link enthält nur den Hastebin-Schlüssel. Der Browser spricht dabei nie direkt mit Hastebin,
sondern mit dem nginx im Container:

| Endpunkt | Weiterleitung |
|---|---|
| `POST /api/teilen` (Body = Rohtext, max. 256 KB) | `https://hastebin.com/documents` → `{"key": "…"}` |
| `GET /api/teilen/<key>` (`[A-Za-z0-9]+`) | `https://hastebin.com/raw/<key>` |

Der API-Token wird nur serverseitig als `Authorization: Bearer …` gesetzt. Rate-Limit:
10 Uploads/Minute und 60 Abrufe/Minute pro IP.

**Einrichtung**

1. Bei [hastebin.com](https://hastebin.com) (Toptal) anmelden und einen API-Token erzeugen
   (Dokumentation: <https://www.toptal.com/developers/hastebin/documentation>).
2. Token als Umgebungsvariable `HASTEBIN_TOKEN` setzen:
   - lokal: `HASTEBIN_TOKEN=… docker compose up --build` oder eine `.env`-Datei neben `compose.yaml`
     (`.env` ist in `.gitignore`).
   - **Coolify:** in der Anwendung unter *Environment Variables* `HASTEBIN_TOKEN` anlegen
     (als Secret, „Is Build Variable“ **nicht** nötig) und neu deployen.
3. Ohne Token startet der Container trotzdem; `/api/teilen` antwortet dann mit
   `503 {"fehler":"Teilen ist nicht konfiguriert (HASTEBIN_TOKEN fehlt)."}`.

**Datenschutz:** Geteilter Code wird an einen Drittanbieter (Toptal/hastebin.com) übertragen und
ist für jeden mit dem Link abrufbar. Die UI weist vor dem Teilen darauf hin. Der Proxy reicht
keine Cookies, keine Client-IP, keinen Referer und keinen User-Agent an Hastebin weiter.

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
├── nginx-proxy.conf, nginx-teilen.conf.template   Hastebin-Proxy
└── README.md
```

Details zur Sprache: [`SPEC.md`](SPEC.md). Details zum Aufbau: [`ARCHITEKTUR.md`](ARCHITEKTUR.md).

## Hawaii

`hawaii` ist ein gültiger Typ. Der Parser akzeptiert ihn. Der Compiler warnt nur ganz leise.

Probieren Sie es lieber nicht aus. Und wenn doch: Wir haben Sie gewarnt. Der Pizzaiolo sagt nichts.
Er schaut nur.
