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
| `windows-x64` | `x86_64-pc-windows-msvc` (mit Theke, CRT statisch) | xwin (MSVC-CRT + Windows-SDK) + rust-lld | `pizza-host-windows-x64-<sha12>.exe` |
| `linux-x64` | `x86_64-unknown-linux-gnu` (glibc ≥ 2.34, gebaut auf Debian bookworm, mit Theke-Fenster) | gcc + libwebkit2gtk-4.1-dev | `pizza-host-linux-x64-<sha12>` |

Angeboten werden nur Varianten **mit** Theke-Fenster (Browser und nativ verhalten sich gleich); statische
Varianten ohne Fenster (früher `linux-x64` musl, `linux-arm64` musl) sind gestrichen.

Dazu `ziele.json` (`version`, `ziele: [{ id, name, triple, datei, endung, groesse, sha256, theke, voraussetzung }]`;
`theke` = Fenster möglich (immer `true`), `voraussetzung` = Text für den EXE-Dialog). Die Dateinamen
enthalten den Inhalts-Hash → `immutable` cachebar. Auswahl per `PIZZA_ZIELE="windows-x64"` (Standard: beide);
scheitert `linux-x64`, wird es übersprungen (außer `STRICT_BUILD=1`), `windows-x64` muss gelingen.

**macOS** wird nicht gebaut: Cross-Linken braucht das Apple-SDK (oder zig/cargo-zigbuild), Apple-Silicon-Binaries
müssen signiert sein und heruntergeladene Dateien landen in der Gatekeeper-Quarantäne. Auf einem Mac selbst:
`cargo build --release` und `pizza-host exe …` funktionieren (ungetestet).

### Hinweise für Nutzer

- **Windows:** Die EXE ist **nicht signiert**. SmartScreen warnt evtl. („Der Computer wurde durch Windows geschützt“
  → „Weitere Informationen“ → „Trotzdem ausführen“); manche Virenscanner melden unbekannte, unsignierte EXEs
  (heuristisch). Die EXE ist ein Konsolenprogramm: am besten in der Eingabeaufforderung/PowerShell starten.
- **Linux:** Browser-Downloads sind nicht ausführbar: `chmod +x programm-linux-x64 && ./programm-linux-x64`.
  Braucht glibc ≥ 2.34 und WebKitGTK 4.1 (Debian/Ubuntu: `sudo apt install libwebkit2gtk-4.1-0`,
  Fedora: `sudo dnf install webkit2gtk4.1`).

## Theke (Fenster, THEKE.md §4)

- Feature `theke` (Standard): Fenster über die System-WebView mit **wry + tao** (Windows: WebView2, Linux: WebKitGTK 4.1).
  `--no-default-features` baut ohne Fenster (`ui_warte` → -1, Abfrage → 0, das Modul meldet W0100).
- Renderer = **unverändert** `site/js/theke/` (fenster.html/js/css, theke.js/css) – dieselbe Engine wie im Browser.
  `build.rs` bettet die Dateien per `include_bytes!` ein; ausgeliefert über das Custom-Protocol `theke://lokal/`
  (WebView2: `http://theke.localhost/`), passend zur CSP `script-src 'self'`. Kein Server, kein Netzwerk.
- Ablauf: Programm im eigenen Thread, Hauptthread wartet; erst die erste `ui_senden`-Nachricht öffnet Event-Loop,
  Fenster (unsichtbar) und WebView; sichtbar beim ersten `baum`. Nachrichten werden bis `{"typ":"bereit"}` der Seite
  gepuffert und als JS-String an `pizzaThekeEmpfange` übergeben. Nutzer schließt das Fenster → `{"typ":"geschlossen"}`.
  `op: "schliesse"` → Fenster zu. **Programmende = Fenster zu**, Prozess endet mit dem Exit-Code.
- Ohne Anzeige (Linux ohne `DISPLAY`/`WAYLAND_DISPLAY`), mit `PIZZA_THEKE=0` oder im JSON-Modus
  (`--ereignisse-json`, außer `PIZZA_THEKE=1`) öffnet der Host kein Fenster → W0100-Verhalten.
  Fehlt WebView2/WebKitGTK, erscheint eine verständliche Meldung und das Programm läuft als Konsolenprogramm weiter.
- Tests ohne Fenster: `--ui-ereignisse datei` (JSON-Lines, erschöpft → `{"typ":"geschlossen"}`).
- Smoke-Test mit (unsichtbarem) Fenster: `PIZZA_THEKE_SMOKE=1 cargo test --test theke -- --ignored fenster`
  (Linux/CI: `xvfb-run -a` davor). `PIZZA_THEKE_UNSICHTBAR=1` hält das Fenster unsichtbar.
- WebView-Daten: `%LOCALAPPDATA%pizza	heke` bzw. `$XDG_DATA_HOME/pizza/theke` (nie neben der EXE).
- **Windows-Build:** MSVC-Ziel im Linux-Docker per `xwin --accept-license splat` (Lizenz vom Nutzer freigegeben;
  Cache-Mount `/opt/xwin`, ~630 MB) und `rust-lld`, `+crt-static` → eine EXE, die nur System-DLLs importiert
  (kein `vcruntime`, kein `WebView2Loader.dll` – der Loader ist statisch gelinkt). mingw/gnu geht nicht: dessen
  Loader-Anbindung bräuchte `WebView2Loader.dll` neben der EXE. Erster Build ~4 min (xwin-Installation + SDK-Download),
  danach mit Cache wenige Sekunden bis ~1 min.

## Größe & Geschwindigkeit

Release-Profil: `opt-level = "z"`, LTO, `codegen-units = 1`, `strip`, `panic = "abort"`; nur die wasmi-Crates
mit `opt-level = 3` (reines `"z"` macht die Engine ~25 % langsamer, so ist sie gleich schnell wie `3`).
wasmi ohne `wat`/`memory64`. Größen ohne Theke (nur Tests/CLI): Windows-msvc 1,1 MB, Windows-gnu 1,3 MB.
Mit Theke (wry/tao): Windows-msvc 1,56 MB, Windows-gnu 1,74 MB, Linux-glibc 1,99 MB (+ dynamisch WebKitGTK/GTK).

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/laufen.rs` | HOST-ABI: Imports `pizza.*`, Argumentprotokoll, `start`, Trap → `LaufzeitAnanas`, Panik-Abbruch |
| `src/ereignis.rs` | Ereignisse, Konsolen- und JSON-Ausgabe |
| `src/karton.rs` | Einbetten/Finden des `.pkarton` in der EXE |
| `src/main.rs` | Kommandozeile |
| `src/theke.rs` | Theke-Fenster (wry/tao), Custom-Protocol, Brücke |
| `build.rs` | bettet `site/js/theke/` ein |
| `tests/theke.rs` | `ui_senden`/`ui_warte`, `--ui-ereignisse`, Fenster-Smoke-Test |
| `tests/abi.rs` | ABI-Tests (WAT) |
| `test.js` | Differenztest gegen den Interpreter |
| `test-exe-js.js` | Test für `site/js/exe.js` (byte-gleich mit `pizza-host exe`, EXE läuft) |
| `baue-ziele.sh` | Cross-Builds + `ziele.json` für den Browser-Download |
| `tests/demo.pkarton` | kleines Test-Modul (aus `tests/exe.rs`, `--ignored fixture`) |

wasmi-Konfiguration nach HOST-ABI §6: Rekursionstiefe 65 536 Wasm-Aufrufe, Wert-Stapel bis 64 MiB.
Imports, die ein Modul nicht nutzt, schaden nicht. JSON-Zahlen werden wie JS `String(x)` formatiert (`1e+21`, `1e-7`).
