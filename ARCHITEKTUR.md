# Architektur & Arbeitsaufteilung

> **Grundsatz (Nutzerentscheidung, K-082): Browser = nativ.** Alles funktioniert im Playground (Browser) und nativ (EXE/Linux)
> **gleich** – Sprache, Standardbibliothek, Eingabe, Zufall, Vorratskammer, Theke – und es wird auch **das Gleiche angezeigt**:
> identische Texte (Ausgaben, Warnungen, Fehlermeldungen samt Wortlaut, Codes und Zeilenangaben, Hawaii-Banner), identische
> Zahl-/Dauer-Formatierung, identischer Theke-Fensterinhalt (gleiche Render-Engine, gleiches CSS/Thema, gleiche Standardgröße).
> Unterschiede sind nur in der technischen Hülle zulässig (Fensterrahmen des Betriebssystems vs. schwebendes Fenster, Terminal vs.
> Konsolen-Panel, Speicherort einer Datei vs. localStorage). **Was nur nativ Sinn ergibt, wird nicht gebaut.**

Eine statische One-Page-Web-App (Editor im Fokus), ausgeliefert von nginx im Docker-Container.
Der pizza-Interpreter läuft **im Browser** (Web Worker) – kein Server-Code, keine Ausführung auf dem Server.

```
pizza/
├── SPEC.md                      Sprachvertrag (verbindlich)
├── ARCHITEKTUR.md               diese Datei
├── package.json                 Root: "test"-Skript           [Interpreter-Agent]
├── tests/                       Test-Harness                   [Interpreter-Agent]
├── bin/pizza.js                 CLI: node bin/pizza.js datei.pizza   [Interpreter-Agent]
├── ui/                          Editor-Quellcode (CodeMirror 6, esbuild)   [UI-Agent]
│   ├── package.json
│   └── src/…
├── site/                        Web-Root (wird von nginx ausgeliefert)
│   ├── index.html               [UI-Agent]
│   ├── favicon.svg              [UI-Agent]
│   ├── css/                     [UI-Agent]
│   ├── js/app.bundle.js         Build-Ergebnis von ui/ (generiert, nicht von Hand)  [UI-Agent]
│   ├── js/worker.js             [UI-Agent]
│   ├── js/pizza.js              Interpreter (UMD, Browser + Node) – generiert aus js/pizza/ (scripts/baue-pizza.js)
│   ├── js/pizza/**.js           Interpreter-Quellen (Abschnitte, Tabelle in §1)   [Interpreter-Agent]
│   ├── js/doku/*.js             Doku-Inhalte als Daten        [Doku-Agents, Geschichte-Agent]
│   └── beispiele/               Beispielprogramme             [Beispiel-Agents]
│       ├── index.json           Liste der Teil-Manifeste (vom Koordinator)
│       ├── grundlagen.json + grundlagen/*.pizza + *.erwartet     [Beispiel-Agent A]
│       └── pizzafunktionen.json + pizzafunktionen/*.pizza + *.erwartet   [Beispiel-Agent B]
├── Dockerfile, compose.yaml, nginx.conf, .dockerignore, .gitignore, README.md   [Infra-Agent]
```

**Jeder Agent schreibt nur in seine eigenen Dateien.** Bedarf an Änderungen in fremden Dateien → im Abschlussbericht nennen.

---

## 1. Interpreter-API (`site/js/pizza.js`)

UMD: im Browser/Worker `self.PizzaLang`, in Node `module.exports`. Keine Abhängigkeiten.

**Quellen und Bau.** Ausgeliefert und geladen wird immer die eine Datei `site/js/pizza.js` (Browser `<script>`, Worker
`importScripts("pizza.js")`, Node `require`, Compiler `site/js/pizzaiolo*`, Worker-Kontext-Test per `vm`). Sie ist **generiert**:
`node scripts/baue-pizza.js` (`npm run baue:pizza`) hängt die Abschnitte unter `site/js/pizza/` unverändert (um 2 Leerzeichen
eingerückt) in den Rumpf der UMD-Fabrik – kein Bundler, keine Umbenennung, eingecheckt wie `app.bundle.js`. **Geändert wird nur in
`site/js/pizza/`**, danach neu bauen; `npm test` prüft vorab (`pretest`: `baue-pizza.js --pruefe`), dass `pizza.js` zum Stand
der Abschnitte passt. Alle Abschnitte teilen **einen** Gültigkeitsbereich (keine Importe); Reihenfolge = Liste `ABSCHNITTE` in
`scripts/baue-pizza.js` (zählt nur für Code, der beim Laden läuft). Eine neue Datei ist ein Eintrag in dieser Liste. Methoden der
Klasse `Laufzeit` außerhalb von `laufzeit/kern.js` stehen in Klassen `LaufzeitX`, die `laufzeitTeil(LaufzeitX)` auf
`Laufzeit.prototype` überträgt (doppelte Namen → Fehler beim Laden); der Herd nutzt weiter `Object.assign(Laufzeit.prototype, HERD_LAUFZEIT)`.
Keine Zeichenketten über Zeilengrenzen (der Bau prüft das).

| Abschnitt (`site/js/pizza/…`) | Inhalt |
|---|---|
| `kopf.js` | Konstanten: Version, Schlüsselwörter, Typen, Ananas-Baum, Grenzen |
| `lexer.js` | `lexe` |
| `parser.js` | `Parser`, `parse` (AST) |
| `analyse.js` | statische Analyse (Warnungen vor dem Start) |
| `projekt.js` | Projekte: Pfadregel (`pruefePfad`), `pizza.json` (`ausDateien`), gemeinsamer Lader `ladeProjekt` (Tiefensuche, P0014 … P0020, W0004, Sichtbarkeit), Textnormalisierung |
| `laufzeit/werte.js` | Werteklassen, Signale, `Scope`, Textformen, `ZufallGen`, `Kammer` |
| `laufzeit/kern.js` | `class Laufzeit`: Konstruktor, Hilfen, Eingabe, Budgets, `start`, `behandleEnde`; `laufzeitTeil` |
| `laufzeit/pruefung.js` | `registriere`, Startprüfungen (`pruefe`, `vorbereiten`) |
| `laufzeit/typen.js` | Typprüfung, Textform, Vergleiche, Operatoren |
| `laufzeit/namen.js` | Namen und Felder |
| `laufzeit/aufrufe.js` | Aufrufe, Kühlschrank, Objekte |
| `laufzeit/auswertung.js` | Lieferung & Ofen, Ausdrücke, Anweisungen |
| `std/basis.js` · `std/mathe.js` · `std/zufall.js` · `std/vorrat.js` · `std/spiegel.js` · `std/kiste.js` | Standardbibliothek (Methodentabellen; Vorratskammer und Kiste mit Laufzeit-Teil) |
| `theke/tabellen.js` · `theke/laufzeit.js` | Theke: Klassen, Stil, Tabellen · Fenster, Zettel, Bindungen |
| `std/register.js` | `TABELLEN`, Sperren `nurRechnen`/`nurHauptkueche` (nach allen Tabellen) |
| `kueche.js` | Küchenbrigade |
| `herd/kern.js` · `herd/tabellen.js` · `herd/laufzeit.js` | Herd: Kern und Vorbacker (`teigling.wasm`) laden, Schema, Teigling-Kopf · Methodentabellen · Laufzeit, Vorbacken, `Bildchen.laden`, Spielschleife |
| `api.js` | `run`, `pruefeStart`, öffentliches Objekt (`intern`) |

Orte der Projekt-Pakete: PA1 (umgesetzt) Abschnitt `projekt.js` (Lader), `bestellt` und Datei-Index `di` in `parser.js`, Feld
`datei`/API in `api.js` und `laufzeit/kern.js` (`dateiPfad`, `ortText`, `this.d`); PD2 (umgesetzt) `Kiste` in `std/kiste.js`, Vorbacker/Teigling-Kopf in `herd/kern.js`, `Bildchen.laden` und Vorbacken (`vorbacke`) in `herd/tabellen.js`/`herd/laufzeit.js`;
H-K12–H-K14 in `herd/` (Kniff-Dispatch in `laufzeit/aufrufe.js`, Importgruppe `klang` als neuer Abschnitt `herd/klang.js`).

```js
PizzaLang.version            // "3.1.0"
PizzaLang.KEYWORDS           // string[] – reservierte Keywords (SPEC §1)
PizzaLang.TYPEN              // string[] – eingebaute Typnamen (salami, funghi, …, hawaii)
PizzaLang.BUILTINS           // string[] – globale Objekte/Funktionen (Bote, Bestellannahme, Uhr, Mathe, Zufall, Spiegel, teig, bestelle, schieb, zwischenstand, Kiste – SPEC §11.2)
PizzaLang.ANANAS             // string[] – eingebaute Ananas-Klassennamen (inkl. KüchenAnanas, SPEC §17 – am Ende angehängt)

PizzaLang.parse(quelltext, { datei }?)
  // → { ok: true, ast } | { ok: false, fehler: { code, text, zeile, spalte } }
  // Nur Syntax einer Datei (für Live-Diagnose im Editor). Schnell, wirft nie. Kennt den Knoten { k: 'Bestellt', pfad, z, s }
  // (SPEC §2.2; ungültiger Pfad → P0015); datei = Datei-Index für das Feld di der Knoten (Standard 0). Das Feld heißt di,
  // weil d an Knoten schon belegt ist (Inc: ±1, Block: hat Deklarationen).

PizzaLang.run(quelle, optionen)
  // quelle: string (Ein-Datei-Programm = { dateien: { "hauptgang.pizza": quelle } }) | Projekt (unten, SPEC §2.1)
  // synchron; optionen: { onEvent?(ereignis), schrittLimit? = 5_000_000, args?: string[],
  //                       eingabe?: string[], onEingabe?(anfrage),      // Ein-/Ausgabe: SPEC §11.1 (aus EINGABE.md)
  //                       onUi?(nachricht), onUiWarte?(), uiEreignisse?: object[],    // Theke: SPEC §16 (aus THEKE.md)
  //                       zufallsSaat?: number, vorrat?: object, onVorrat?(kennung, eintraege),  // SPEC §15.4 (K-077 … K-081, K-106: Kennung = name | namensraum/name)
  //                       koeche?: number | "auto", kuechenChaos?: number,       // Küchenbrigade: SPEC §17 (K-100)
  //                       herdKern?: WebAssembly.Module | ArrayBuffer | Uint8Array,  // Herd: SPEC §18, K-128 – Node ohne Option: site/js/herd/kern.wasm
  //                       onHerd?(art, daten), herdSpion?(kernExporte),            // Herd-Renderer (Bildpaket-Bytes nur hier); herdSpion nur Werkzeuge
  //                       teiglinge?: { pfad → Uint8Array },                       // vorgebackene Bilder (SPEC §18.5, K-145) – geprüft (Kopf + SHA-256 der Quelle), fehlende/unpassende backt der Lauf
  //                       vorbacker?: WebAssembly.Module | ArrayBuffer | Uint8Array | { vorbacken, sha256 } } // teigling.wasm wie herdKern (oder PizzaVorbacker-Objekt); Node ohne Option: site/js/herd/teigling.wasm
  // → { exitCode, ereignisse: Ereignis[], schritte, zeitMs }   (zeitMs = simulierte Uhr)
```

**Projekte (SPEC §2, K-138 … K-141; im Interpreter umgesetzt, PROJEKTE.md PA1; Compiler ab PA2):**

```js
// Projekt = Dateisammlung, überall dieselbe Form (Worker, CLI, ZIP, Teilen, Compiler):
{ hauptdatei?: "hauptgang.pizza", name?: "Teigball",
  dateien: { "hauptgang.pizza": "…", "welt/tisch.pizza": "…", "daten/level-1.txt": "…", "bilder/tisch.png": Uint8Array, "pizza.json": "…" } }
// Texte (.pizza .txt .json .csv .md) als String, alles andere als Uint8Array; pruefung/ wird ignoriert.
// Ist pizza.json da, gelten name/args aus ihr (Begleitfelder sind dann nur Vorschläge der Hülle). hauptdatei: ein ausdrücklich
// übergebenes Begleitfeld hat Vorrang (CLI-Aufruf mit einer Datei, PROJEKTE §1.5), sonst pizza.json, sonst die Regel SPEC §2.1.

PizzaLang.projekt.lade(projekt)        // gemeinsamer Lader (Interpreter UND Compiler): pizza.json, Pfade, Textnormalisierung, Tiefensuche,
                                       // P0014 … P0020 (Grenzen), Sichtbarkeit, W0004 – Reihenfolge SPEC §2.5
  // → { ok: true, ladeliste: [pfad…], dateien: [pfad…], ast, warnungen: [{ code, text, datei, zeile, spalte }], args, kiste, name, hauptdatei }
  //   ladeliste = Ladereihenfolge (Hauptdatei zuletzt); dateien[i] = Pfad zum Datei-Index i (dateien[0] = Hauptdatei, dann Besuchsreihenfolge);
  //   ast = EIN Programm (body = Verkettung in Ladereihenfolge, ohne Bestellt-Knoten), jeder Knoten mit di = Datei-Index,
  //   dazu ast.dateiPfade (null bei genau einer Datei → Feld datei null) und ast.ladeRang (di → Position in der Ladeliste);
  //   kiste = Sammlung ohne pruefung/ (Texte normalisiert); quelle darf auch ein Text sein (= Ein-Datei-Programm ohne Sammlung)
  // | { ok: false, fehler: { code, art, text, datei, zeile, spalte } }
PizzaLang.projekt.ausDateien(dateien)  // pizza.json auswerten → { name, hauptdatei, args, dateien } | { fehler } (P0015/HOST)
PizzaLang.projekt.pruefePfad(pfad)     // → null | Fehlertext (SPEC §2.1; dieselbe Regel in CLI, Playground, Durchreiche)
```
`run(string)` bleibt die Ein-Datei-Abkürzung (läuft durch denselben Lader). Der Wasm-Compiler ruft ab PA2 `projekt.lade` statt
`parse` (eigene Ports von `analysiere`/Startprüfung bekommen nur Datei-Index und Doppelmeldungs-Schlüssel `code:datei:zeile:spalte`);
bis dahin liefern `Pizzaiolo.kompiliere`/`run` für Projekte und für Texte mit `bestellt` `nichtUnterstuetzt` (Grund nennt PA2).

**Küchenbrigade (SPEC §17, K-100):** `koeche` = gewünschte Anzahl Köche (Host-Einstellung, nie beobachtbar); der Interpreter
akzeptiert und **ignoriert** sie (sequentielle Referenz). `kuechenChaos` (nur Tests, Saat) führt die Stücke jeder Brigade in einer
pseudozufälligen Reihenfolge aus und verwirft danach nach D3 – das Ergebnis muss identisch sein. Der Wasm-Weg
(`Pizzaiolo.run`) übernimmt dieselben Optionen (`laufOptionen` + `koeche`, `faehigkeiten.importgruppen` + `kueche`; mit P3
zusätzlich ein Pool-Objekt aus `Pizzaiolo.kuechenPool(k)` als `koeche`). `BUILTINS` und `KEYWORDS` ändern sich nicht
(`brigade` ist eine Blech-Methode).

**Interne Hilfen für Compiler-Frontends** (`PizzaLang.intern`, keine Endnutzer-API, kann sich mit dem Interpreter ändern):

```js
PizzaLang.intern.analysiere(ast)   // → [{ code, text, zeile, spalte }] – Warnungen vor dem Start (W0666, W0032), sortiert wie im Lauf
PizzaLang.intern.pruefe(ast)       // → null | { code, text, zeile, spalte } – Startprüfung (Q0004, P0010, P0011, R0001, A0001), Text wie fehler-Ereignis
PizzaLang.intern.ANANAS_BAUM       // [[name, basisName|null], …] – eingebaute Ananas-Hierarchie (SPEC §8)
PizzaLang.intern.MAX_STAPEL        // 1500 – Stapeltiefe (SPEC §14.4)
PizzaLang.intern.STANDARD_LIMIT    // 5_000_000 – Standard-Schrittlimit
PizzaLang.intern.UI_STIL           // Theke-Stil-Whitelist { schlüssel: "zahl" | erlaubteWerte[] } (SPEC §16)
PizzaLang.intern.HERD_TYPEN        // Herd-Klassen + Komponentennamen (SPEC §18; der Compiler leitet daraus die Importgruppe herd ab)
```
Alle Werte sind Kopien; Änderungen daran wirken nicht auf den Interpreter zurück. `BELAEGE`, `intern.BELAEGE` und
`intern.GRUNDPREIS` gibt es seit K-105 nicht mehr (kein eingebautes Pizza-Objekt).

### Ereignisse (Reihenfolge = Auftreten)

```js
{ typ: "ausgabe",       text }                                  // Bote.sage
{ typ: "fehlerausgabe", text }                                  // Bote.fehler
{ typ: "warnung",       code, text, datei, zeile, spalte }      // z. B. W0666, T0007, W0013; datei siehe unten
{ typ: "ausgabe",       text, umbruch: false }                  // Bote.schreibe (ohne Zeilenumbruch), SPEC §11.1
{ typ: "leeren" }                                               // Bote.leeren
{ typ: "eingabe",       text }                                  // nach jedem Leseversuch; text = null bei EOF (nicht in .erwartet)
{ typ: "ui",            nachricht }                             // Theke-Protokollnachricht Programm → Renderer (SPEC §16; nicht in .erwartet, sondern .ui-erwartet)
{ typ: "vorrat",        name, schluessel, wert }                // Vorratskammer-Änderung (SPEC §15.4, K-080; name = Kennung `raum/name`, K-106; nicht in .erwartet)
{ typ: "herd",          art: "fenster", titel, breite, hoehe }  // Herd (SPEC §18.7; nicht in .erwartet, sondern .herd-erwartet ohne typ); onHerd("fenster", {titel, breite, hoehe})
{ typ: "herd",          art: "bild", bildnummer, szene, paket } // szene/paket = FNV-1a-64-Hex vom Kern; onHerd("bild", {bildnummer, szene, paket, bytes: Uint8Array}) – Bytes nie im Ereignis
{ typ: "herd",          art: "schliesse" }                      // onHerd("schliesse", {}); Kern fehlt → fehler { code: "HOST", art: "intern", text: "PizzaFehler HOST: Der Herd-Kern fehlt (kern.wasm)." }, Exit 2
{ typ: "fehler",        code, art, text, datei, zeile, spalte } // art: "syntax" | "pizzafehler" | "ananas" | "limit" | "intern"
                                                                // "intern" = Host-/Worker-Fehler vor Programmstart (KLAERUNGEN K-043, K-044); interne Fehler
                                                                // eines laufenden Motors bleiben art "ananas" mit optionalem Feld detail (K-014)
{ typ: "panik",         text }                                  // Hawaii-Banner (SPEC §9), danach sofort "ende"
{ typ: "ende",          exitCode, schritte, zeitMs }              // optional koeche: tatsächlich genutzte Köche (SPEC §17.7; nicht in .erwartet, Differenztests ignorieren es)
```

- `code` bei Ananas = Klassenname (z. B. `"StreitAnanas"`), sonst der PizzaFehler-Code (`"P0001"`, `"R0001"` …).
- `text` bei ungefangener Ananas: `Ungefangene Ananas – StreitAnanas: 8 Stücke lassen sich nicht fair durch 3 teilen. (Zeile 12)`.
- `text` bei PizzaFehler: `PizzaFehler R0001: Klasse 'X' erfüllt Rezeptur 'Y' nicht: Methode 'z' fehlt.`
- `zeile`/`spalte` ab 1, `null` falls unbekannt.
- `datei` (SPEC §2.6, K-141): Projektpfad der Datei, zu der `zeile`/`spalte` gehören – steht **immer** im Ereignis direkt
  vor `zeile` und ist `null`, solange das Programm aus genau einer `.pizza`-Datei besteht (alle heutigen Programme). Fehler ohne Ort
  (Host, Grenzen) haben `datei: null`. Harnische, die ganze Ereignisse vergleichen, ergänzen `datei: null`; Testdateien bleiben.
  Der JS-Host (`host-js.js`, ABI v1) liefert bis PA2 immer `datei: null`; für den nativen Host ergänzen `tests/differenz/motoren.js`
  und `host/test.js` das fehlende Feld als `null`.

## 2. Worker-Protokoll (`site/js/worker.js`)

```js
// UI → Worker
{ typ: "start", code: string, args?: string[] }                         // Ein-Datei-Abkürzung
{ typ: "start", projekt: { dateien, hauptdatei, name }, args?, teiglinge?, vorbacker? }   // Projekt (SPEC §2, PROJEKTE.md PB1)
{ typ: "kompiliere", projekt, teiglinge?, vorbacker? }                  // EXE-Export: pkarton aus dem Projekt
// Worker → UI: jedes Ereignis aus onEvent 1:1 per postMessage (ggf. gebündelt als { typ: "batch", ereignisse: [...] })
```
- Worker lädt `importScripts("pizza.js")` (relativ zu `js/`).
- **Projekte:** Binärdateien und Teiglinge als `ArrayBuffer`-Transfer, `vorbacker` = `WebAssembly.Module` von `teigling.wasm` (einmal
  je Seite kompiliert, wie `herdKern`). Der Worker reicht alles unverändert an Interpreter **und** Wasm-Motor (`Pizzaiolo.run(projekt,
  { teiglinge, vorbacker })`); der Rückfall auf den Interpreter nimmt dasselbe Projekt. Ohne Argumente gelten die `args` aus `pizza.json`.
- Die UI startet pro Lauf einen **frischen** Worker und beendet ihn nach `ende`.
- **Kein Wand-Zeitlimit** (Nutzerentscheidung K-083/3, Grundsatz K-082): Es gilt nur das Schrittlimit (P0002) wie nativ; „Abbrechen“ → `worker.terminate()`.
- Playground bietet ein Feld **„Argumente“** für `hauptgang(args)` (K-083/2) und den Befehl **„Vorrat löschen“** (K-083/5) – beides gleich in der EXE (`--vorrat-loeschen <name>`). Kammern **mit Namensraum** (K-106) liegen unabhängig vom Tab unter `pizza.vorrat.<raum>/<name>` (nativ `<ordner>/<raum>/<name>.json`) – ein Spielstand für Beispiel-Tab, geteilte Tabs und App-Links jeder Fassung.
- **Köche (SPEC §17.7, K-100):** Lauf-Einstellungen-Popover **„Köche: auto | 1 | 2 | 4 | 8“** (localStorage, neben „feste Saat“;
  `auto` = `navigator.hardwareConcurrency`, höchstens 16). Enthält das kompilierte Programm die Importgruppe `kueche`, erzeugt der
  Lauf-Worker **vor** `run` einen Köche-Pool (Kinder-Worker; „Abbrechen“ = `worker.terminate()` beendet alle Köche). Ohne
  Cross-Origin-Isolation, ohne verschachtelte Worker oder im Interpreter-Rückfall läuft die Brigade sequentiell (gleiches
  Ergebnis). Statusleiste nach dem Lauf: `Köche: N` (tatsächlich genutzt; 1 bei Interpreter/Rückfall) **nur**, wenn das Programm
  `brigade` nutzt (Gruppe `kueche`; Nutzerentscheidung K-100 – das Popover bleibt immer) – gleicher Text wie
  `--info` nativ (`--koeche=N`, HOST-ABI §7). Ereignisse eines Stücks erscheinen frühestens, wenn alle früheren Stücke fertig sind.
- **Herd (HERD.md §7.2, H6):** Bei Herd-Programmen trägt `start` zusätzlich `herdKern` (WebAssembly.Module, einmal je Seite
  kompiliert), `herdPort` (MessagePort zum Render-Worker, übertragen) und `herdPuffer` (SAB, Takt-Weg). Der Worker reicht sie als
  `optionen.herdKern`/`onHerd`/`onUiWarte` an Interpreter **und** Wasm-Motor; Bildpakete gehen nur über den Port, an die UI nur
  `herd/fenster` und `herd/schliesse`.
- Bei `panik`: **keine Sonderbehandlung** (Nutzerentscheidung, KLAERUNGEN K-012) – der Banner wird als normale Fehlerausgabe
  in der Konsole gezeigt, der Exit-Code 39 wie jeder andere; der Worker endet regulär mit `ende`. CLI/Host/EXE schreiben den Banner nach **stderr**.

## 3. Beispiel-Manifeste (`site/beispiele/`)

`index.json` (vom Koordinator):
```json
{ "teile": ["grundlagen.json", "pizzafunktionen.json"] }
```
Teil-Manifest, z. B. `grundlagen.json`:
```json
{
  "kategorie": "Grundlagen",
  "beispiele": [
    {
      "id": "hallo-welt",
      "titel": "Hallo Welt",
      "beschreibung": "Ein Satz Beschreibung.",
      "datei": "grundlagen/hallo-welt.pizza",
      "erwartet": "grundlagen/hallo-welt.erwartet",
      "exitCode": 0,
      "tier": 1,
      "schlagworte": ["Ausgabe"]
    }
  ]
}
```
- Pfade relativ zu `site/beispiele/`.
- **Projekte als Beispiele (K-144; Umzug PROJEKTE.md PB3):** Ein Eintrag nennt statt `datei`/`erwartet`/`eingabe`/`exitCode` den
  Projektordner und seine Dateiliste (statisches Hosting kann keine Ordner auflisten; ohne `pruefung/`):
  `{ "id": "teigball", "titel": "Teigball", "beschreibung": "…", "ordner": "herd/teigball", "dateien": ["pizza.json", "hauptgang.pizza",
  "welt/tisch.pizza", "bilder/tischdecke.png"], "tier": 1, "schlagworte": ["Herd", "3D"], "herd": true }` – Erwartungen liegen in
  `<ordner>/pruefung/` (§6). Bis zum Umzug des Pizza-Imperiums (PB5) lesen Galerie und Harnische `datei` **oder** `ordner`.
- Optionale Felder `"eingabe": "spiele/x.eingabe"` (eine Zeile pro Eingabe, Tests laufen damit nicht-interaktiv; Fallback: gleichnamige `.eingabe` neben der `.pizza`) und `"interaktiv": true` – siehe SPEC §11.1.
- `.erwartet` = alle `ausgabe`-, `fehlerausgabe`- und `panik`-Texte in Reihenfolge, je Ereignis eine Zeile
  (`ausgabe` mit `umbruch: false` ohne Zeilenumbruch, `leeren` als Zeile `«leeren»`, `eingabe` nie – SPEC §11.1)
  (mehrzeiliger Panik-Text bleibt mehrzeilig), abschließender Zeilenumbruch. Warnungen, `fehler` und `ende` stehen **nicht** drin.

## 4. Doku-Daten (`site/js/doku/*.js`)

Jede Datei registriert Abschnitte:
```js
(self.PIZZA_DOKU = self.PIZZA_DOKU || []).push({
  id: "pf-teig",
  gruppe: "Pizza-Funktionen",      // Gruppierung in der Navigation
  ordnung: 310,                    // Sortierung (aufsteigend) – Bereiche siehe unten
  titel: "Teig (Lazy Evaluation)",
  tier: 1,                         // 1 | 2 | 3 → Badge
  inhalt: [
    { art: "text", md: "Absatz mit **fett**, *kursiv*, `code` und [Links](#)." },
    { art: "code", code: "Teig<salami> t = teig(() -> (6 * 7));\nBote.sage((t.gehenlassen().backen()));", ausfuehrbar: true, tier: 1 },
    { art: "tabelle", kopf: ["pizza", "Java"], zeilen: [["`tiefkühl`", "static"]] },
    { art: "hinweis", ton: "info", md: "…" },          // ton: "info" | "warnung" | "pizza"
    { art: "ausgabe", text: "erwartete Ausgabe (optional)" }
  ]
});
```
### Doku v2: einfacher, mit Bildern (Nutzer-Feedback)

Neue Inhaltsarten (zusätzlich zu den obigen):
```js
{ art: "kurz", md: "Ein Satz: Was ist das und wozu? (erscheint als hervorgehobene Box ganz oben)" },
{ art: "bild", src: "img/doku/pf-schneiden.svg", alt: "Alternativtext", unterschrift: "optionale Bildunterschrift" },
{ art: "details", titel: "Für Fortgeschrittene: Budget-Formel", inhalt: [ /* beliebige Inhaltsblöcke */ ] }
```
Regeln für jeden Abschnitt:
1. Beginnt mit `kurz` (1–2 Sätze, Alltagssprache, keine Fachbegriffe ohne Erklärung).
2. Danach möglichst ein `bild`, das die Idee als Pizzeria-Szene/Diagramm zeigt.
3. Dann **ein** kleines, ausführbares Beispiel (≤ 12 Zeilen) + `ausgabe`.
4. Alles Weitere (Tabellen, Randfälle, Fehlercodes, zweites Beispiel) kommt in `details` (standardmäßig zugeklappt).
5. Kurze Sätze, aktive Sprache, Humor ja – aber Verständlichkeit zuerst.

**Bilder** (`site/img/doku/*.svg`, Präfix je Doku-Datei: `ge-`, `sp-`, `pf-`, `re-`, `he-`; Herd-Doku auch PNG-Render-Bilder):
- Handgeschriebenes SVG, `viewBox="0 0 640 360"` (oder 640×240 für flache), keine externen Referenzen, keine Skripte, keine Webfonts; Schrift `font-family="system-ui, sans-serif"`, mind. 14px.
- Werden per `<img>` auf einer **hellen Karte** gezeigt (auch im Dunkelmodus) → für hellen Hintergrund gestalten, Hintergrund transparent.
- Palette: Teig/Rand `#E8C48A`/`#C8955A`, Tomate `#D9452B`, Mozzarella `#FFF6E0` (Kontur `#E6D3A8`), Basilikum `#3E8E41`, Ofen/Anthrazit `#2F2A26`, Text `#2F2A26`, Akzent Gelb `#F2B33D`, Ananas `#F5C518`.
- Stil: flach, freundlich, klare Formen, Strichstärke 2–3, abgerundete Ecken; Beschriftungen auf Deutsch; zeigt den Mechanismus (z. B. Blech → 8 Stücke → 8 Köche → Ergebnis), nicht nur Deko.

- In Node: `globalThis.self` existiert ggf. nicht → Dateien nutzen `(typeof self !== "undefined" ? self : globalThis)`.
- Markdown-Untermenge: `**fett**`, `*kursiv*`, `` `code` ``, `[text](url)`, Leerzeilen = Absätze, `- ` Listen.
- `ausfuehrbar: true` ⇒ Code läuft im Snack-Modus mit Exit-Code 0 (oder `exitCode`-Feld angeben). Der Test-Harness prüft das.
  `ausfuehrbar: false` ⇒ Code muss trotzdem **parsen** (außer `sprache: "xml"`/`"shell"` – dann gar nicht geprüft).
- Ein `ausgabe`-Block nach einem Code-Block darf das Hawaii-Panik-Banner weglassen (der Test-Harness vergleicht `ausgabe`-Blöcke ohnehin nur als Hinweis). In `.erwartet`-Dateien (Beispiele, Testfälle) ist das Banner dagegen **Pflicht**.
- `ordnung`-Bereiche: 0–99 Geschichte · 100–199 Einstieg · 200–299 Sprache · 300–399 Pizza-Funktionen · 400–499 Ananas/Hawaii · 500–599 Standardbibliothek · 600–699 Toolchain/Referenz.
- Die UI lädt alle Doku-Dateien über eine feste Liste in `index.html` (`<script type="application/json" id="doku-dateien">`;
  `js/thema.js` lädt sie im Playground sofort nach, beim App-Link `#app=…` gar nicht). Dateinamen:
  `00-geschichte.js`, `10-sprache.js`, `20-pizzafunktionen.js`, `30-referenz.js`, `40-herd.js` (Herd, `ordnung` 591–598).

## 5. UI

- One-Page, **Editor im Fokus** (CodeMirror 6, eigenes pizza-Highlighting, Live-Syntaxdiagnose über `PizzaLang.parse`, Autovervollständigung aus KEYWORDS/TYPEN/BUILTINS/ANANAS).
- Konsole unter dem Editor (ausgabe / fehlerausgabe / warnung / fehler farblich unterschieden, Exit-Code-Badge).
- Einklappbares **Seitenpanel** rechts mit Tabs **Doku** · **Beispiele** (auf schmalen Bildschirmen als Overlay/Popup).
- Doku-Code-Blöcke und Beispiele: „Im Editor öffnen“. Kürzel: `Strg+Enter` ausführen, `Strg+S` lokal speichern, `Strg+B` Panel.
- Hawaii-Panik: kein Crash-Overlay – Banner als Fehlerausgabe in der Konsole, Exit-Code-Badge 39 (KLAERUNGEN K-012).
- Hell/Dunkel, deutsch, keine externen Requests zur Laufzeit (alles gebündelt).

## 6. Testfall-Dateien (Vertrag für Harnische)

Alle Harnische (`tests/run-tests.js`, `pruefstand/`, `tests/differenz/`, E2E) lesen dieselben Formate:

| Ort | Datei | Inhalt |
|---|---|---|
| `tests/faelle/` | `<name>.pizza` | Quelltext des Falls |
| | `<name>.erwartet` | Ausgabestrom nach §3 (`ausgabe`/`fehlerausgabe`/`panik`, `umbruch:false` ohne Umbruch, `«leeren»`), endet mit genau einem `\n` |
| | `<name>.exitcode` | erwarteter Exit-Code (eine Zahl); fehlt → 0 |
| | `<name>.warnungen` | erwartete `warnung`-Texte, je Zeile ein Text (`W0666: …`), in Reihenfolge; fehlt → nicht geprüft |
| | `<name>.fehler` | erwartete `fehler`-Texte (eine Zeile pro Ereignis); fehlt → nicht geprüft |
| | `<name>.optionen.json` | `optionen` für `run` (z. B. `{"schrittLimit": 1000, "args": ["a"]}`) |
| | `<name>.eingabe` | vorgegebene Eingabe, eine Zeile pro Eingabe (SPEC §11.1); letzter Zeilenumbruch zählt nicht |
| `site/beispiele/` | `*.pizza`, `*.erwartet`, `*.eingabe` | wie oben; Manifestfelder `exitCode`, `eingabe`, `interaktiv` (§3) |
| Vorrat (SPEC §15.4) | `<name>.vorrat.json` | Eingangszustand `{ "<kennung>": [["schlüssel", wert], …] }` → `optionen.vorrat` (Kennung `kammer` oder `raum/kammer`, K-106); Tests laufen mit `zufallsSaat` 42 (Standard) |
| Theke (SPEC §16) | `<name>.ereignisse` | vorgegebene Renderer-Ereignisse als JSON-Lines (`{"typ":"klick","id":"z2"}` …) → `optionen.uiEreignisse`; erschöpft → `geschlossen` |
| | `<name>.ui-erwartet` | alle `ui`-Nachrichten als JSON-Lines, kanonisch verglichen (Schlüsselreihenfolge egal, Nachrichtenreihenfolge zählt); `ui`-Ereignisse stehen nicht in `.erwartet` |
| Herd (SPEC §18) | `<name>.herd-erwartet` | alle `herd`-Ereignisse als JSON-Lines ohne `typ` (`fenster` mit Titel/Größe, `bild` mit `bildnummer`/`szene`/`paket` = FNV-1a-64-Hashes des Kerns, `schliesse`), kanonisch verglichen; Renderer-Ereignisse (`takt`, `geschlossen`) in `.ereignisse` wie bei der Theke; Doku-Codeblöcke `herdErwartet: object[]` (K-134); `node tests/herd/erwartet.js --schreibe` erneuert die Dateien nach einer Kern-Änderung |
| Projekte (SPEC §2, K-144; seit PA1, z. B. `tests/faelle/projekt-*/`) | `tests/faelle/<name>/` | **Ordner-Fall** = Projekt (`pizza.json` optional, `hauptgang.pizza`, Nebendateien, Assets) mit Testordner `pruefung/`: `erwartet`, `exitcode`, `warnungen`, `fehler`, `optionen.json`, `eingabe`, `ereignisse`, `ui-erwartet`, `herd-erwartet`, `vorrat.json`, `vorrat-erwartet` (Inhalt wie die gleichnamigen Dateien oben) und neu `orte` (JSON-Lines `{ "code", "datei", "zeile", "spalte" }` je `fehler`/`warnung`). `pruefung/` gehört nicht zum Programm; Ein-Datei-Fälle bleiben, wie sie sind. Beispiele ebenso (`site/beispiele/<kategorie>/<projekt>/pruefung/`) |
| `tests/differenz/korpus/` | `*.pizza` mit Kopfzeilen | `// exit: N`, `// optionen: {…}`, `// args: a b` (nur Kommentarzeilen vor dem ersten Code); ab PA2 auch Ordner `<name>/` als Projekt, Kopfzeilen in der Hauptdatei |
| `pruefstand/faelle/` | `aNN-*.js` | Arrays aus `F(gruppe, name, code, erwartung)` (siehe `pruefstand/lib/helfer.js`); `code` ist ein Text oder ein Projekt `{ dateien, hauptdatei? }` (Differenztests nehmen nur Texte, bis PA2); `*-offen.js` enthält Fälle zu noch nicht umgesetzten Klärungen (KLAERUNGEN.md) – sie zählen nicht als Fehlschlag, grüne Fälle meldet der Lauf als „nach a10 verschieben“ (derzeit keine; die Projekt-Fälle – Lader seit PA1, Kiste/Bilder seit PD2 – stehen in `a19-projekte.js`, gemeinsame Hilfen in `pruefstand/lib/projekt-helfer.js`) |
| Doku-Codeblöcke | `ausfuehrbar`, `exitCode`, `eingabe: string[]`, `uiEreignisse: object[]`, `uiErwartet: object[]`, `zufallsSaat: number`, `vorrat: object`, `vorratErwartet: object[]`, `echtzeit: number`, `zone: number` | §4; der folgende `ausgabe`-Block ist die Soll-Ausgabe (Panik-Banner optional); `uiEreignisse`/`uiErwartet` wie `.ereignisse`/`.ui-erwartet` (SPEC §16.4, K-074); `zufallsSaat`/`vorrat`/`vorratErwartet`/`echtzeit`/`zone` wie die gleichnamigen Optionen bzw. `.vorrat.json` (K-077, K-080, K-087, K-088, K-154) |

Normalisierung beim Vergleich: `\r\n` → `\n`; beidseitig höchstens **ein** Schluss-Zeilenumbruch (K-052).
Küchenbrigade (SPEC §17, K-100): Fälle heißen `kueche-*`; `.optionen.json` darf `koeche`/`kuechenChaos` tragen; das `ende`-Feld
`koeche` wird von allen Harnischen ignoriert – Ereignisse, Exit-Code, `schritte` und `zeitMs` müssen für jede Köche-Anzahl und
jede Chaos-Saat identisch sein.
