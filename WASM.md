# pizzaiolo – pizza → WebAssembly → (später) EXE  (Vertrag)

Ziel: pizza-Programme werden zu **portablen** WebAssembly-Modulen kompiliert (`.pkarton`), die im Browser,
in Node **und** in nativen Hosts laufen – damit auch eine **EXE** entstehen kann
(Wasm + nativer Host bzw. `wasm2c → cc`). Der Compiler ist **modular**: Frontend → IR → Backends.
Der Interpreter (`site/js/pizza.js`) bleibt die Referenz; alles wird differenziell gegen ihn getestet.

## 1. Grundsätze

1. **Gleiches Verhalten.** Für jedes Programm liefern Interpreter, Wasm-in-JS und nativer Host dieselbe
   Ereignisfolge (`ausgabe`, `fehlerausgabe`, `warnung`, `fehler`, `panik`) mit identischen Texten/Codes/Zeilen,
   denselben Exit-Code und dieselben `schritte`/`zeitMs` (Schritte sind über `Uhr.jetzt()`, Budgets und P0002 beobachtbar).
   Schrittzählung darf nur so optimiert werden, dass an jedem beobachtbaren Punkt dieselbe Summe herauskommt.
2. **Schnell.** Statisch typisierte Werte (`salami`, `funghi`, `diavolo`) laufen ungeboxt (`f64` bzw. `i32`).
   `salami` ist eine ganzzahlige IEEE-754-Double (K-004): ein Backend darf `i32`/`i64` nur mit Überlaufprüfung und
   Rückfall auf `f64` verwenden – beobachtbar muss alles identisch sein (pizzaiolo nutzt `f64` mit Ganzzahlprüfung).
   Ziele (Node 22, `bench/`, beide Motoren **mit identischer Schrittzählung**): typisierte Rechenschleifen ≥ 10×
   schneller als der Interpreter, fib(27) ≥ 5×, Beispielprogramme inkl. Kompilierzeit nicht langsamer.
3. **Ehrlicher Fallback.** Nicht unterstützte Konstrukte meldet der Compiler (`nichtUnterstuetzt`); der Playground
   nutzt dann den Interpreter. Ziel: **alle** Beispiele und Doku-Blöcke kompilierbar.
4. **Portabel.** Das Programmmodul und die Laufzeit nutzen nur **Wasm MVP + bulk-memory + multi-value +
   mutable-globals + sign-ext + nontrapping-fptoint**. **Kein** GC, **kein** Exception Handling, **kein** `externref`,
   keine JS-spezifischen Imports. Damit laufen sie in jedem Browser, in Node, wasmi/wasmtime und über `wasm2c`.

## 2. Architektur

```
quelltext ──► Frontend (PizzaLang.parse → Semantik/Typisierung) ──► IR (IR.md, serialisierbar)
                                                                     │
                                       ┌─────────────────────────────┴───────────────┐
                                       ▼                                             ▼
                              Backend „wasm“ (jetzt)                     Backend „c“/nativ (später)
                                       │
                         programm.wasm  +  laufzeit.wasm  ──►  Host (JS: Browser/Node · Rust: nativ/EXE)
```

- **Frontend & IR & Wasm-Backend:** JavaScript ohne Abhängigkeiten (`site/js/pizzaiolo/…`), nutzt `PizzaLang.parse`.
  Die **IR** (dokumentiert in `IR.md`) ist die Grenze zu allen Backends – nicht der AST.
- **Eigener Wasm-Kodierer** (LEB128, Sections, Instruktionen). `wabt` nur als devDependency für Tests.
- **Laufzeit** (`laufzeit/`, Rust `no_std` → `wasm32v1-none` (nur Wasm-1.0-Features) plus
  `+bulk-memory,+mutable-globals,+sign-ext,+nontrapping-fptoint,+multivalue`, Ergebnis `site/js/pizzaiolo/laufzeit.wasm`
  wird **eingecheckt**, damit Docker kein Rust braucht): Texte (UTF-8), Blech, Speisekarte,
  Ananas-Objekte, Teig/Ofen/Lieferung/Kühlschrank-Zustände, Zufall (mulberry32, Seed 42), simulierte Uhr,
  **JS-identische Zahlformatierung** (shortest round-trip wie `String(x)`: `1e+21`, `1e-7`, `-0`→`0`,
  `0.30000000000000004`, Gleichstand → gerade Ziffer), `euro()`, Dauer-Textform, Allocator, V8-TimSort-Port
  (gleiche Vergleichsfolge wie `Array.prototype.sort`), Texte in UTF-8 mit **UTF-16-Ordnung** für `<`/`sortiere` (K-040).
- **Linken:** Der Compiler fügt Programm und Laufzeit zu **einem** Modul zusammen (`.pkarton`, HOST-ABI.md §1).
  Der JS-Host nutzt intern zusätzlich einen zweiteiligen Schnellpfad: Laufzeitmodul einmal kompiliert und gecacht,
  das Programm als kleines Zusatzmodul, das `memory`, Tabelle und `rt_*` aus der Laufzeit importiert (Modulname
  `laufzeit`) – gleicher Code, gleiches Verhalten.
- **Speicher (Phase 1):** Bump/Arena-Allocator mit fester Obergrenze (Standard 1024 MiB, `speicher_limit_setzen`). Überschreitung →
  `LaufzeitAnanas: Der Kühlschrank ist voll (Speicherlimit erreicht).` (fangbar, deterministisch). Ein echter GC
  folgt in Phase 2. Der Interpreter hat kein eigenes festes Limit, meldet aber Engine-Grenzen
  (z. B. V8 „Invalid string length“) mit derselben Ananas (K-089); die genaue Grenze darf je Motor abweichen –
  Differenztests werten das als „speicherlimit“.
- **Ananas ohne Wasm-EH:** globales „schwebende Ananas“-Register + Prüfung nach jedem Aufruf, der werfen kann
  (Konvention im IR/Backend). Hawaii-Panik → Host-Import `panik` am Programmende; der Host darf dort abbrechen, sonst
  wickelt das Modul selbst ab (K-045: bei Widersprüchen gilt HOST-ABI.md).
- **Schritte & Limits:** Zähler im Laufzeitzustand (lineare Speicherzelle), gebündelt je Anweisung/Effektpunkt mit
  exakter Rekonstruktion des Überschreitungspunkts (IR.md §5); Ofen/Lieferung-Budgets intern; Stapeltiefe 1500 wie §14.4
  (statische Tiefe je Knoten, „schnelle“ und „exakte“ Variante je Funktion).

## 3. Host-ABI (Details in `HOST-ABI.md`, vom Compiler-Agent als ERSTES festzulegen)

Bewusst winzig, nur Zahlen/Zeiger: Imports Modul `pizza`: `ausgabe`, `schreibe`, `fehlerausgabe`, `leeren`,
`warnung`, `fehler`, `panik`, `eingabe`, `ui_senden`, `ui_warte` (verbindliche Signaturen in HOST-ABI.md – sie gilt
vor dieser Datei, K-045). Exports: `memory`, `start() -> exitCode`, `schritte()`/`zeitMs()`, `abi_version`,
`limit_setzen`, `speicher_limit_setzen`, `arg_puffer`/`arg_fertig`.
Ein Host ist in ~50 Zeilen JS oder Rust implementierbar. Args für `hauptgang` über ein definiertes Speicherprotokoll.

## 4. JS-API (`site/js/pizzaiolo.js`, UMD: `self.Pizzaiolo` / `module.exports`; benötigt `PizzaLang`)

```js
Pizzaiolo.version
Pizzaiolo.unterstuetzt()                       // Wasm verfügbar?
Pizzaiolo.kompiliere(quelltext, optionen?)     // synchron
  // → { ok: true,  pkarton: Uint8Array, kompilierMs, statistik }      // pkarton = programm.wasm (+ Laufzeit gebündelt, siehe HOST-ABI.md)
  // → { ok: false, fehler: {code, text, zeile, spalte} }               // Syntaxfehler
  // → { ok: false, nichtUnterstuetzt: [{ zeile, spalte, grund }] }     // → Fallback
Pizzaiolo.run(quelltext, optionen?)            // synchron; Optionen & Rückgabe wie PizzaLang.run
  // + rückgabe.motor = "wasm"|"interpreter", rückgabe.kompilierMs
  // optionen.motor: "auto" (Standard) | "wasm" | "interpreter"
  // Bei "auto" zuerst genau ein Ereignis { typ: "motor", motor, grund?, kompilierMs? }
Pizzaiolo.fuehreAus(pkarton, optionen?)        // führt ein fertiges .pkarton aus (gleiche Rückgabe)
Pizzaiolo.faehigkeiten                         // eingefroren: { version, abi, laufOptionen: [...], importgruppen: [...],
                                               //   features: [...], ereignisse: [...], motoren: [...] }
```
Synchrones Instanziieren (`new WebAssembly.Module/Instance`) ist im Worker und in Node erlaubt.
`faehigkeiten` ist die maschinenlesbare Auskunft für Harnische und UI: `laufOptionen` = vom JS-Host ausgewertete
`optionen`-Felder, `importgruppen` = HOST-ABI §2, `features` = Sprachbereiche, die ohne Fallback kompiliert werden
(Programme mit anderen Konstrukten melden weiterhin `nichtUnterstuetzt`).

## 5. EXE (nativer Host)

`host/` (Rust, `wasmi`): implementiert HOST-ABI, führt ein `.pkarton` aus, Exit-Code = Programm-Exit-Code.
`pizzaofen exe programm.pkarton -o programm.exe` erzeugt eine EXE = Host + eingebettetes `.pkarton`.
Differenztests laufen über **drei** Motoren: Interpreter, Wasm-in-Node, nativer Host.

## 6. Dateien & Zuständigkeit

| Pfad | Agent |
|---|---|
| `IR.md`, `HOST-ABI.md`, `site/js/pizzaiolo.js`, `site/js/pizzaiolo/**`, `laufzeit/**`, `bench/`, `tests/wasm/` | Compiler |
| `host/**` | Native-Host |
| `tests/differenz/`, `tests/fuzz/` | Differenz-Agent |
| `e2e/` | E2E-Agent |
| `.github/workflows/`, Coverage, neue `scripts` in Root-`package.json` (nur ergänzen) | CI-Agent |
| `ui/**`, `site/index.html`, `site/css/**`, `site/js/worker.js`, `site/js/app.bundle.js` | UI-Agent |
| `site/js/pizza.js`, `tests/run-tests.js`, `tests/faelle/`, `SPEC.md` (nur Ergänzungen) | Interpreter-Agent |
| `pruefstand/` | Prüfstand-Agent |

Alle: Commit/Push nur eigener Pfade (`git add <pfade>`, nie `-A`), Nachricht deutsch +
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Lehnt die Berechtigungsprüfung git ab:
nicht umgehen, fertige Dateien im Bericht nennen (der Koordinator pusht).
