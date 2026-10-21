# pizza-host – nativer Host für `.pkarton`

Führt kompilierte pizza-Programme (`.pkarton` = ein WebAssembly-Modul, siehe `../HOST-ABI.md`) nativ aus
und baut daraus eigenständige **EXE**-Dateien. Engine: [`wasmi`](https://crates.io/crates/wasmi) (reines Rust,
Interpreter, keine JIT, deterministisch). Erlaubte Wasm-Features genau wie in `WASM.md` §1.4.

## Bauen

```sh
cd host
cargo build --release        # → target/release/pizza-host(.exe)
cargo test                   # ABI-Tests mit handgeschriebenen Wasm-Modulen
node test.js                 # Differenztest aller Beispiele gegen den Interpreter (braucht site/js/pizzaiolo.js)
```

## Ausführen

```sh
pizza-host [--ereignisse-json] [--info] [--schritte=N] [--eingabe datei] programm.pkarton [args…]
```

| Ereignis | Ausgabe (Konsole) |
|---|---|
| `ausgabe` | stdout, mit Zeilenumbruch; `Bote.schreibe` (`umbruch: false`) ohne Umbruch |
| `fehlerausgabe` | stderr (rot bei TTY) |
| `warnung` | stderr: `⚠ text (Zeile z, Spalte s)` (gelb bei TTY) |
| `fehler` | stderr: `text` (+ Position bei `syntax`/`pizzafehler`) |
| `panik` | Hawaii-Banner nach **stdout**, Exit-Code 39 |
| `leeren` | ANSI-Clear, nur wenn stdout ein Terminal ist |
| `eingabe` | kein Echo (das macht das Terminal) |

- Farbe nur bei TTY und ohne `NO_COLOR` (wie `bin/pizza.js`).
- Exit-Code = Exit-Code des Programms (SPEC §12: 0, 1, 2, 3, 39). Lade-/Formatfehler → 2.
- Eingabe (`Bestellannahme.lies()` …): zeilenweise von **stdin**, EOF → `karton`. Mit `--eingabe datei`
  kommen die Zeilen aus der Datei (danach EOF) – für Tests.
- `--ereignisse-json`: jedes Ereignis als JSON-Zeile auf stdout, gleiches Schema wie `PizzaLang.run`
  (ARCHITEKTUR §1, EINGABE.md §2), zuletzt `{"typ":"ende","exitCode":…,"schritte":…,"zeitMs":…}`.
- `--schritte=N` → Export `limit_setzen(N)`; `--info` → Exit-Code/Schritte/Uhr am Ende nach stderr.

## EXE erzeugen

```sh
pizza-host exe programm.pkarton -o programm.exe
./programm.exe arg1 arg2
```

Die EXE ist eine Kopie des `pizza-host`-Binaries mit angehängtem `.pkarton`:

```
[pizza-host-Binary][pkarton-Bytes][u64 LE: Länge][8 Byte Magie "PKARTON1"]
```

Beim Start liest der Host sein eigenes Binary (`current_exe`), findet die Magie am Dateiende und führt das
eingebettete Programm aus – **alle** Kommandozeilenargumente gehen dann an `hauptgang`. Betriebssysteme ignorieren
angehängte Daten (PE-Overlay/ELF-Anhang), die EXE bleibt normal startbar und braucht keine weiteren Dateien.
`PIZZA_EREIGNISSE_JSON=1` schaltet auch in einer EXE die JSON-Ereignisausgabe ein.
Hinweis: eine angehängte Signatur (Authenticode) müsste nach dem Einbetten erfolgen.

Die EXE läuft nur auf dem Betriebssystem/der Architektur des verwendeten `pizza-host` – für andere Ziele
`pizza-host` dort (oder per `cargo build --target …`) bauen und damit einbetten.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/laufen.rs` | HOST-ABI: Imports `pizza.*`, Argumentprotokoll, `start`, Trap → `LaufzeitAnanas`, Panik-Abbruch |
| `src/ereignis.rs` | Ereignisse, Konsolen- und JSON-Ausgabe |
| `src/karton.rs` | Einbetten/Finden des `.pkarton` in der EXE |
| `src/main.rs` | Kommandozeile |
| `tests/abi.rs` | ABI-Tests (WAT) |
| `test.js` | Differenztest gegen den Interpreter |

wasmi-Konfiguration nach HOST-ABI §6: Rekursionstiefe 65 536 Wasm-Aufrufe, Wert-Stapel bis 64 MiB.
Imports, die ein Modul nicht nutzt, schaden nicht; `ausgabe` wird mit 2 Parametern (ABI v1) oder mit
Umbruch-Flag (3 Parameter) angeboten – je nachdem, was das Modul importiert.
