# pizza v3.0 – Playground

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
└── README.md
```

Details zur Sprache: [`SPEC.md`](SPEC.md). Details zum Aufbau: [`ARCHITEKTUR.md`](ARCHITEKTUR.md).

## Hawaii

`hawaii` ist ein gültiger Typ. Der Parser akzeptiert ihn. Der Compiler warnt nur ganz leise.

Probieren Sie es lieber nicht aus. Und wenn doch: Wir haben Sie gewarnt. Der Pizzaiolo sagt nichts.
Er schaut nur.
