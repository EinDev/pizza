# Ein- & Ausgabe für interaktive Programme (Vertrag, Ergänzung zu SPEC §11)

Nutzer: „Mach bitte Support für In- und Output, sodass die Games interaktiv sein können. Ich will keine nicht-interaktiven Games.“
Status: **abgelöst durch `SPEC.md` §11.1** (Sprache und API; dort verbindlich, inkl. der Klärungen K-007 … K-013, K-031,
K-041, K-042 aus `KLAERUNGEN.md`). Dieses Dokument behält die Umsetzungsdetails für Browser, Wasm/Host und CLI (§3–§5);
bei Widersprüchen gilt SPEC §11.1.

## 1. Sprache (Tier 1)

### Ausgabe
| Aufruf | Wirkung |
|---|---|
| `Bote.sage(x)` | wie bisher: Text + Zeilenumbruch |
| `Bote.schreibe(x)` | Text **ohne** Zeilenumbruch (für Eingabeaufforderungen, Spielfelder Zeichen für Zeichen) |
| `Bote.leeren()` | Konsole leeren (für Spielfelder, die neu gezeichnet werden) |

### Eingabe: `Bestellannahme` (zeilenbasiert)
| Aufruf | Rückgabe |
|---|---|
| `Bestellannahme.lies()` | nächste Eingabezeile als `margherita` (ohne Zeilenumbruch); **`karton`**, wenn keine Eingabe mehr kommt (Ende/EOF) |
| `Bestellannahme.frage(text)` | wie `Bote.schreibe(text)` + `lies()` |
| `Bestellannahme.liesZahl([ersatz])` / `frageZahl(text[, ersatz])` | Zeile als Zahl nach der Zahltext-Grammatik aus SPEC §11.1 (trimmen; Punkt oder Komma als Dezimaltrenner, `_` erlaubt; kein Hex/Exponent – K-007); keine gültige Zahl → `TypAnanas: '<eingabe>' ist keine Zahl.`; EOF → `karton` bzw. `ersatz`, falls angegeben (auch `ersatz: …`; nur bei EOF – K-008) |
| `Bestellannahme.hatMehr()` | `diavolo`: ob (noch) Eingabe möglich ist – interaktiv immer `ja`, vorgegebene Eingabe: `nein` sobald erschöpft |

- Jeder Aufruf kostet 1 Schritt (wie andere Aufrufe). Warten auf Eingabe verbraucht **keine** Schritte und **keine** simulierte Zeit.
- Ein Programm, das `lies()` nach EOF erneut aufruft, bekommt wieder `karton` (keine Endlosschleife durch Blockieren). Spiele **müssen** `karton` als „Spieler ist gegangen“ behandeln und sauber enden.
- Die Eingabe wird **nicht** vom Interpreter als Ausgabe wiederholt (das Echo ist Sache der UI/des Terminals).

## 2. API (Erweiterung von ARCHITEKTUR §1)

`PizzaLang.run(quelltext, optionen)` und `Pizzaiolo.run(...)`:
- `optionen.eingabe?: string[]` – vorgegebene Zeilen (Tests, nicht-interaktiv). Erschöpft → EOF.
- `optionen.onEingabe?: (anfrage) => string | null` – **synchroner** Rückruf für interaktive Eingabe; `null` = EOF.
  `anfrage = { prompt: string|null, art: "zeile"|"zahl" }`. Hat Vorrang vor `eingabe`. Fehlt beides → sofort EOF.
  `prompt` ist **informativ** (z. B. Platzhalter des Eingabefelds): den Prompt gibt das Programm selbst als
  `ausgabe` mit `umbruch: false` aus; UI/Host dürfen ihn nie zusätzlich ausgeben (K-011). EOF ist endgültig (K-042).
- Neue Ereignisse:
  - `{ typ: "ausgabe", text, umbruch: false }` für `Bote.schreibe` (bei `Bote.sage` ist `umbruch` weggelassen oder `true`).
  - `{ typ: "leeren" }` für `Bote.leeren()`.
  - `{ typ: "eingabe", text }` – wird **nach** jeder erfolgreich gelesenen Zeile emittiert (für Protokolle/UI-Echo; `null` bei EOF).
- `.erwartet`-Format (ARCHITEKTUR §3): `ausgabe` mit `umbruch:false` wird ohne Zeilenumbruch angehängt; `leeren` erscheint als Zeile `«leeren»`; `eingabe`-Ereignisse erscheinen **nicht**.
- Beispiel-Manifeste: optionales Feld `"eingabe": "spiele/tictactoe.eingabe"` (Datei mit einer Zeile pro Eingabe) – Tests laufen damit nicht-interaktiv. Feld `"interaktiv": true` markiert Spiele in der UI.

## 3. Browser (Worker, blockierend)

- Der Interpreter läuft synchron im Worker. Interaktive Eingabe blockiert den Worker per **`SharedArrayBuffer` + `Atomics.wait`**:
  Worker sendet `{ typ: "eingabe-anfrage", prompt, art }`, wartet; die UI schreibt die Zeile (UTF-8) in den geteilten Puffer und weckt per `Atomics.notify`. EOF/Abbruch per Statusflag.
- Voraussetzung: **Cross-Origin-Isolation** (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) in `nginx.conf` und im E2E-Testserver. Ohne Isolation (`crossOriginIsolated === false`): Fallback – die UI fragt **vor** dem Lauf alle Eingaben ab („Eingaben vorab eintragen“), deutlich gekennzeichnet.
- Das Wand-Zeitlimit (10 s) ruht, solange auf Eingabe gewartet wird.
- UI: Eingabezeile unten in der Konsole (erscheint nur bei Anfrage, Fokus springt hinein, Enter sendet, Strg+D = EOF, Verlauf mit ↑/↓), Echo der Eingabe in der Konsole (eigener Stil), `Bote.schreibe`-Ausgaben ohne Umbruch korrekt fortgesetzt, `leeren` leert die Konsole, „Abbrechen“ beendet auch während des Wartens.

## 4. Wasm / Host / CLI

- HOST-ABI: Import `pizza.eingabe(art: i32, prompt_ptr, prompt_len, puffer_ptr, puffer_kap) -> i32` (Rückgabe = benötigte Länge in Bytes, `-1` = EOF). **Keine Kürzung** (K-013): passt die Zeile nicht in `puffer_kap`, schreibt der Host nichts, behält die Zeile und das Modul ruft mit größerem Puffer erneut auf. `prompt_ptr/len` ist informativ – der Prompt wird vom Modul über `schreibe` ausgegeben (K-011). Dazu `pizza.leeren()` und ein **separater** Import `pizza.schreibe(ptr, len)`; `ausgabe(ptr, len)` bleibt zweistellig (K-041). JS-Host bildet das auf `onEingabe`/`eingabe` ab. Der Panik-Banner geht bei CLI/Host/EXE nach stderr (K-012).
- `bin/pizza.js`: liest interaktiv von stdin (synchron, `fs.readSync(0, …)`), Option `--eingabe datei` für vorgegebene Zeilen; `leeren` → ANSI-Clear nur bei TTY.
- `pizza-host` (nativ/EXE): liest von stdin; EOF → `-1`.

## 5. Spiele

Alle Spiele unter `site/beispiele/spiele/` sind **interaktiv** (der Mensch spielt), jeweils mit `.eingabe`-Datei für die Tests und `"interaktiv": true` im Manifest. Simulationen ohne Spielcharakter dürfen nicht-interaktiv bleiben; spielartige Simulationen (z. B. Tycoon, Duell) bekommen Entscheidungen per Eingabe.
