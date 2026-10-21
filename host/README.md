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
| `panik` | Hawaii-Banner nach stderr (rot/gelb bei TTY), Exit-Code 39 |
| `leeren` | ANSI-Clear, nur wenn stdout ein Terminal ist |
| `eingabe` | kein Echo (das macht das Terminal) |

- Farbe nur bei TTY und ohne `NO_COLOR` (wie `bin/pizza.js`).
- Exit-Code = Exit-Code des Programms (SPEC §12: 0, 1, 2, 3, 39). Liefert ein Modul einen anderen Code oder trappt es,
  meldet der Host `LaufzeitAnanas` mit dem festen Text `Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.`
  und der wasmi-Meldung im Feld `detail` (K-014/K-046), Exit 1.
- Ladefehler (kein gültiges `.pkarton`, falsche ABI-Version): `{typ:"fehler", code:"HOST", art:"intern", text:"PizzaFehler HOST: …"}`, Exit 2 (K-043).
- Eingabe (`Bestellannahme.lies()` …): zeilenweise von **stdin**, EOF → `karton` (endgültig). Den Prompt gibt das Modul
  selbst per `schreibe` aus (K-011). Lange Zeilen werden nie gekürzt: passt eine Zeile nicht in `puffer_kap`, liefert
  `eingabe` die benötigte Länge, schreibt nichts und hält die Zeile für den nächsten Aufruf bereit (K-013). Mit `--eingabe datei`
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

## EXE-Download im Browser

Die Website baut die EXE **clientseitig** (`site/js/exe.js`, `PizzaExe`): Programm mit Pizzaiolo zu `.pkarton`
kompilieren → vorgebautes Host-Binary der gewählten Plattform aus `/bin/` laden → sha256 prüfen (SubtleCrypto;
in nicht sicheren Kontexten nur die Größe) → `.pkarton` + Trailer anhängen → Blob-Download. Ergebnis byte-gleich
mit `pizza-host exe` (geprüft von `node host/test-exe-js.js`).

Die Binaries baut `host/baue-ziele.sh <ausgabeverzeichnis>` (POSIX-sh, Linux/Docker-Stage `exe`):

| Ziel-ID | Rust-Target | Linker | Datei |
|---|---|---|---|
| `windows-x64` | `x86_64-pc-windows-gnu` | mingw-w64 | `pizza-host-windows-x64-<sha12>.exe` |
| `linux-x64` | `x86_64-unknown-linux-musl` (statisch) | musl-tools | `pizza-host-linux-x64-<sha12>` |
| `linux-arm64` | `aarch64-unknown-linux-musl` (statisch, optional) | rust-lld | `pizza-host-linux-arm64-<sha12>` |

Dazu `ziele.json` (`version`, `ziele: [{ id, name, triple, datei, endung, groesse, sha256 }]`). Die Dateinamen
enthalten den Inhalts-Hash → `immutable` cachebar. Auswahl per `PIZZA_ZIELE="windows-x64 linux-x64"`;
`linux-arm64` wird übersprungen, wenn das Target nicht installierbar ist (außer `STRICT_BUILD=1`).
Getestet: Windows-gnu-EXE mit Anhang unter Windows 11, linux-x64 und linux-arm64 (qemu) in Docker/busybox.

**macOS** wird nicht gebaut: Cross-Linken braucht das Apple-SDK (oder zig/cargo-zigbuild), Apple-Silicon-Binaries
müssen signiert sein und heruntergeladene Dateien landen in der Gatekeeper-Quarantäne. Auf einem Mac selbst:
`cargo build --release` und `pizza-host exe …` funktionieren (ungetestet).

### Hinweise für Nutzer

- **Windows:** Die EXE ist **nicht signiert**. SmartScreen warnt evtl. („Der Computer wurde durch Windows geschützt“
  → „Weitere Informationen“ → „Trotzdem ausführen“); manche Virenscanner melden unbekannte, unsignierte EXEs
  (heuristisch). Die EXE ist ein Konsolenprogramm: am besten in der Eingabeaufforderung/PowerShell starten.
- **Linux:** Browser-Downloads sind nicht ausführbar: `chmod +x programm-linux-x64 && ./programm-linux-x64`.
  Statisch gelinkt (musl), läuft ohne weitere Bibliotheken.

## Größe & Geschwindigkeit

Release-Profil: `opt-level = "z"`, LTO, `codegen-units = 1`, `strip`, `panic = "abort"`; nur die wasmi-Crates
mit `opt-level = 3` (reines `"z"` macht die Engine ~25 % langsamer, so ist sie gleich schnell wie `3`).
wasmi ohne `wat`/`memory64`. Größen: Windows-msvc 1,1 MB, Windows-gnu 1,3 MB, Linux-musl x64 1,5 MB, arm64 1,3 MB.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/laufen.rs` | HOST-ABI: Imports `pizza.*`, Argumentprotokoll, `start`, Trap → `LaufzeitAnanas`, Panik-Abbruch |
| `src/ereignis.rs` | Ereignisse, Konsolen- und JSON-Ausgabe |
| `src/karton.rs` | Einbetten/Finden des `.pkarton` in der EXE |
| `src/main.rs` | Kommandozeile |
| `tests/abi.rs` | ABI-Tests (WAT) |
| `test.js` | Differenztest gegen den Interpreter |
| `test-exe-js.js` | Test für `site/js/exe.js` (byte-gleich mit `pizza-host exe`, EXE läuft) |
| `baue-ziele.sh` | Cross-Builds + `ziele.json` für den Browser-Download |
| `tests/demo.pkarton` | kleines Test-Modul (aus `tests/exe.rs`, `--ignored fixture`) |

wasmi-Konfiguration nach HOST-ABI §6: Rekursionstiefe 65 536 Wasm-Aufrufe, Wert-Stapel bis 64 MiB.
Imports, die ein Modul nicht nutzt, schaden nicht. JSON-Zahlen werden wie JS `String(x)` formatiert (`1e+21`, `1e-7`).
