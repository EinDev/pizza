# Theke – das UI-Framework von pizza (Vertrag, v1)

> Die Theke ist da, wo der Gast die Pizza sieht.

Nutzer: „Ich will ein UI-Framework. Es soll im Browser sowie in der fertigen EXE/Linux funktionieren.
Keep it simple, but extendable – wir werden in Zukunft mehr hinzufügen.“
Entscheidung: nativ als **eigenes Fenster über die System-WebView** (Windows: WebView2, Linux: WebKitGTK).

> **Status:** Sprache, Verhalten und Protokoll sind verbindlich in **`SPEC.md` §16** festgeschrieben (Klärungen K-056 … K-075 in
> `KLAERUNGEN.md`, Stand Interpreter da07b46 / Renderer d9c9090). Dieses Dokument behält Motivation, Anbindung (§4), Tests (§5),
> Tiers (§6) und Zuständigkeiten (§7); bei Widersprüchen gilt SPEC §16. Abschnitt 8 listet die Präzisierungen.

## 1. Grundidee

- Ein pizza-Programm baut einen **Baum aus Zutaten** (Widgets) und zeigt ihn in einer **Theke** (Fenster).
- Das Programm bleibt synchron: `theke.bediene()` ist die Ereignisschleife; sie blockiert, bis ein Ereignis kommt,
  ruft den passenden Lambda-Rückruf auf und wartet weiter – bis das Fenster geschlossen oder `theke.schliesse()` gerufen wird.
- **Eine** Render-Engine (`site/js/theke/`, reines JS/DOM, ohne Framework) läuft überall: im Playground-Vorschaufenster
  und – eingebettet – in der WebView des nativen Hosts. Programm ↔ Renderer sprechen ein kleines **JSON-Protokoll** (§3).
- **Erweiterbar:** neue Zutaten = neuer Eintrag in der Zutaten-Registry des Renderers + eine Klasse in der Laufzeit,
  ohne Protokolländerung. Unbekannte Zutaten rendert der Renderer als sichtbaren Platzhalter (kein Absturz).

## 2. Sprache (Tier 1 im Interpreter; Wasm/EXE siehe §6)

```pizza
Theke theke = neu Theke("Pizzarechner", breite: 420, hoehe: 320);

Schild preis   = neu Schild("Noch nichts bestellt.");
Eingabe anzahl = neu Eingabe(platzhalter: "Wie viele Pizzen?");
Knopf backen   = neu Knopf("Backen!", () -> {
    salami n = anzahl.wert().alsZahl();
    preis.setzeText(("Macht " + (n * 8).euro()));
});

theke.zeige(neu Stapel([preis, anzahl, backen]));
theke.bediene();
```

### Zutaten v1 (bewusst wenige)
| Klasse | Zweck | Konstruktor | Methoden |
|---|---|---|---|
| `Theke` | Fenster | `(titel = "", breite: 480, hoehe: 360)` | `zeige(zutat)` → Theke, `bediene()`, `schliesse()`, `titel()`, `setzeTitel(t)` |
| `Schild` | Text/Label | `(text)` | `text()`, `setzeText(t)` |
| `Knopf` | Button | `(text, beiKlick?)` | `text()`, `setzeText(t)`, `beiKlick(fn)` (fn ohne Argument), `aktiv(diavolo)` / `aktiv()` |
| `Eingabe` | Textfeld (einzeilig) | `(wert: "", platzhalter: "")` | `wert()`, `setzeWert(t)`, `beiAenderung(fn)` (fn bekommt den Text), `beiEnter(fn)` (fn bekommt den Text) |
| `Haken` | Checkbox | `(text, an: nein)` | `an()`, `setzeAn(diavolo)`, `beiAenderung(fn)` (fn bekommt diavolo) |
| `Stapel` | Container vertikal | `(Blech<Zutat>)` | `hinzu(zutat)`, `leeren()` |
| `Reihe` | Container horizontal | `(Blech<Zutat>)` | `hinzu(zutat)`, `leeren()` |

- Gemeinsame Basisklasse **`Zutat`** (`neu Zutat()` → RohlingAnanas; `erbt Knopf` → P0010) mit `id()`, `sichtbar(diavolo)` / `sichtbar()`, `stil(schlüssel, wert)`
  (eine kleine Whitelist: `breite`, `hoehe`, `abstand`, `ausrichtung`, `schrift` = `"klein"|"normal"|"gross"|"mono"|"riesig"`, `farbe` = Themenfarben `"tomate"|"basilikum"|"mozzarella"|"kruste"|"normal"`,
  v4: `zeilen` = feste Zeilenzahl mit „…“, `mindestbreite` in px – K-113).
  Keine freien CSS-Strings (Sicherheit + Portabilität).
- **v2/v4-Zutaten** (SPEC §16.5/§16.7): `Takt`, `Fortschritt`, `Abschnitt` (v4: `klappbar`/`zu`/`beiAenderung`), `Tabelle`, `Reiter` (v4: `setzeTitel(n, t)`,
  `titel(n)`, Seite ausblenden per `sichtbar`), `Auswahl` (Segment-Umschalter), `Tastatur` (unsichtbar, `beiTaste(fn)` → `fn(taste)`).
- **IDs:** automatisch `z1, z2, …` in Erzeugungsreihenfolge unbenannter Zutaten (belegte Nummern werden übersprungen) oder benannt an jeder Zutat: `neu Knopf("OK", id: "ok")`; doppelt → `LaufzeitAnanas: Die ID 'ok' gibt es schon.`
- Zustand lebt im Programm; jede Änderung (`setzeText` usw.) erzeugt eine **Änderungsnachricht**. Mehrere Änderungen während eines
  Rückrufs werden gebündelt und beim Zurückkehren in `bediene()` gesendet (ein Frame).
- `bediene()` ohne vorheriges `zeige` → `LaufzeitAnanas: Die Theke ist leer.` Zweites `bediene()` nach Schließen kehrt sofort zurück; `zeige` danach öffnet wieder. Nur eine Theke pro Programm (`LaufzeitAnanas: Es gibt nur eine Theke pro Programm.`). Textformen `Knopf(z3)`, `Theke(Titel)`.
- Text-Argumente fehlend oder `karton` (K-102): Zustandsfelder (`text`, `wert`, `titel`, Zellen, Schwebetext) nehmen die Textform – `karton` → „karton“, fehlend im Konstruktor → `""`, fehlend in Methoden = `karton`; optionale Felder (`platzhalter`, `hinweis`, Fortschritt-`text`) lassen `karton` weg → `""`.
- Ananas in Rückrufen laufen wie gewohnt aus `bediene()` heraus (fangbar mit `probier` um `bediene()`).
- Ohne verfügbaren Renderer (z. B. CLI ohne GUI, Tests ohne Skript): `bediene()` kehrt sofort zurück und es gibt die Warnung
  `W0100: Keine Theke verfügbar – Fenster wird nicht angezeigt.` (je Aufrufstelle; Programm läuft weiter, `ui`-Nachrichten werden trotzdem emittiert).
- Schritte: Erzeugen/Setzen kosten normale Aufruf-Schritte; Warten auf Ereignisse kostet **keine** Schritte/Zeit (wie Eingabe).

## 3. Protokoll Programm ↔ Renderer (JSON, Version 1)

Programm → Renderer (`ui`-Nachricht):
```json
{"v":1,"op":"fenster","titel":"Pizzarechner","breite":420,"hoehe":320}
{"v":1,"op":"baum","wurzel":{"id":"z4","art":"stapel","kinder":[{"id":"z1","art":"schild","text":"…"}, …]}}
{"v":1,"op":"aendere","aenderungen":[{"id":"z1","text":"Macht 16,00 €"},{"id":"z3","aktiv":false}]}
{"v":1,"op":"schliesse"}
```
Renderer → Programm (Ereignis):
```json
{"typ":"klick","id":"z3"}
{"typ":"aenderung","id":"z2","wert":"2"}      // Eingabe (bei jeder Änderung) bzw. Haken (wert true/false)
{"typ":"enter","id":"z2","wert":"2"}
{"typ":"geschlossen"}
{"typ":"takt","id":"t1","anzahl":1}            // v2 Takt
{"typ":"taste","id":"z9","taste":"Leertaste"}  // v4 Tastatur (K-110)
```
- Unbekannte Felder werden ignoriert (Vorwärtskompatibilität), unbekannte `art` → Platzhalter, unbekanntes `op`/`typ` → ignorieren + Konsolenwarnung.
- Neue Zutaten/Eigenschaften = neue `art`/Felder; `v` steigt nur bei inkompatiblen Änderungen.

## 4. Anbindung

### API (ARCHITEKTUR §1, Erweiterung)
- Neues Ereignis `{ typ: "ui", nachricht: <Protokoll-Objekt> }` in der Ereignisfolge (für Tests/Differenz vergleichbar).
- `optionen.onUi?: (nachricht) => void` – Nachricht an den Renderer.
- `optionen.onUiWarte?: () => ereignis | null` – **synchron** blockierend auf das nächste Ereignis (null = Fenster weg/Abbruch).
- `optionen.uiEreignisse?: Ereignis[]` – vorgegebene Ereignisfolge für Tests (erschöpft → `{"typ":"geschlossen"}`). Doku-Codeblöcke: `uiEreignisse`/`uiErwartet` (K-074).
- Fehlen `onUiWarte` und `uiEreignisse`: kein Renderer → W0100-Verhalten.

### Browser (Playground)
Worker blockiert per `SharedArrayBuffer` + `Atomics.wait` (wie Eingabe). Die UI zeigt die Theke in einem **Vorschaufenster**
(schwebendes, verschiebbares Panel über dem Editor bzw. eigener Bereich; Titel = Fenstertitel; Schließen-Knopf → `geschlossen`).
Kein Wand-Zeitlimit (K-083/3: P0003 abgeschafft, nur Schrittlimit P0002); Abbrechen funktioniert immer.
**Thema (K-083/4):** Das Programmfenster folgt im Playground dem Seiten-Thema (Standard = OS-Thema; schaltet der Nutzer die Seite um,
gilt das auch für das Programmfenster), nativ dem OS-Thema – gleiche Engine, gleiches CSS, gleiche Farben.

### Wasm / HOST-ABI
Imports Modul `pizza`: `ui_senden(ptr, len)` (UTF-8-JSON) und `ui_warte(puffer_ptr, puffer_kap) -> i32`
(Länge des Ereignis-JSON, `-1` = kein Renderer/geschlossen, `> kap` = benötigte Größe, erneut aufrufen – wie K-013 bei `eingabe`).

### Nativer Host (EXE / Linux)
- Theke = eigenes Fenster per **wry + tao** (System-WebView: WebView2 unter Windows, WebKitGTK unter Linux).
  Die Render-Engine (`site/js/theke/`) ist ins Binary eingebettet (`include_str!`), kein Netzwerk, kein localhost-Server.
- Das Wasm-Programm läuft in einem eigenen Thread; das Fenster im Hauptthread (Event-Loop von tao). `ui_warte` blockiert auf einem Kanal.
- Das Fenster erscheint erst beim ersten `zeige`; Programme ohne Theke bleiben reine Konsolenprogramme (kein Fenster).
- **Terminal (Windows, Nutzerentscheidung):** EXEs mit Theke (Importgruppe `theke`) werden mit PE-Subsystem WINDOWS gebaut und starten
  ohne Terminal; aus einem Terminal gestartet hängen sie sich an dessen Konsole (`AttachConsole`), per Doppelklick gehen Konsolen-Ausgaben
  verloren. EXEs ohne Theke bleiben Konsolenprogramme (Terminal beim Doppelklick). Details: `host/README.md` („Terminal“).
- **Varianten (Nutzerentscheidung K-083/1, Grundsatz K-082):** **nur Varianten mit Theke** – Windows x64 als eine EXE mit Fenster
  (Build per cargo-xwin/MSVC; WebView2-Runtime ab Win 10/11 vorhanden – fehlt sie: **klare Fehlermeldung**, kein stiller Konsolenbetrieb)
  und Linux x64 mit Fenster (Ziel-ID `linux-x64`, glibc/bookworm, braucht WebKitGTK 4.1 – fehlt es: klare Fehlermeldung). Varianten **ohne**
  Fenster (statisch x64-musl, arm64-musl) werden **nicht** mehr angeboten. Linux: ausgeliefert wird ein **Starter** ohne
  WebKitGTK-Abhängigkeit, der den Theke-Teil eingebettet trägt und nur für Programme mit Theke startet (`host/README.md`).
- **Kein Fenster möglich (K-096, Nutzerentscheidung):** Ein Programm mit Theke (Importgruppe `theke`) **bricht nativ ab** – Meldung auf
  stderr, **Exit 2**, statt W0100 –, wenn WebKitGTK fehlt (K-083), keine Anzeige da ist (Linux ohne `DISPLAY`/`WAYLAND_DISPLAY`, z. B.
  SSH), die WebView2-Runtime fehlt oder die WebView sich nicht erzeugen lässt. Ohne Terminal (Windows-EXE per Doppelklick) zusätzlich
  als Meldungsfenster. Programme ohne Theke laufen immer. W0100 bleibt für JSON-Modus, `--ui-ereignisse`, `PIZZA_THEKE=0` (Tests/CI),
  die Interpreter-CLI `bin/pizza.js` und die Library ohne Renderer. Im Browser gibt es immer ein Fenster.
  `ziele.json` beschreibt Voraussetzungen; der EXE-Dialog zeigt sie an.

## 5. Tests

- Beispiele/Tests mit Theke haben eine Datei `.ereignisse` (JSON-Lines, eine Ereigniszeile pro Zeile) → `optionen.uiEreignisse`.
- `.erwartet` enthält wie bisher nur Ausgaben; zusätzlich `.ui-erwartet` (JSON-Lines aller `ui`-Nachrichten), vom Harness verglichen.
- Renderer: Unit-Tests (jsdom) + E2E im Playground (klicken, tippen, Fenster schließen).
- Nativer Host: Smoke-Test mit Fenster nur, wo eine Anzeige verfügbar ist (CI Linux via `xvfb-run`), sonst Protokoll-Test ohne Fenster.

## 6. Tiers & Reihenfolge

1. Renderer + Interpreter + Playground-Vorschau (Tier 1).
2. Compiler/Laufzeit + HOST-ABI (`ui_senden`/`ui_warte`) – bis dahin meldet der Compiler `nichtUnterstuetzt` für Theke → Playground nutzt den Interpreter.
3. Nativer Host mit Fenster.
Ausblick (nicht v1): Leinwand/Raster für Spiele, Liste, Bilder, Dialoge, mehrere Fenster. Erledigt: Timer (`Takt`, v2), Auswahl und
Tastaturereignisse (`Auswahl`, `Tastatur`, v4 – K-109/K-110).

## 7. Dateien & Zuständigkeit

| Pfad | Agent |
|---|---|
| `site/js/theke/**` (Renderer, Registry, Stile), `tests/theke/` | Renderer-Agent |
| `site/js/pizza.js` (Klassen, bediene, Optionen), `tests/faelle/` | Interpreter-Agent |
| `ui/**`, `site/index.html`, `site/css/**`, `site/js/worker.js` (Vorschaufenster, Worker-Brücke) | UI-Agent |
| `host/**`, Dockerfile-Stage `exe` (Abstimmung mit Infra) | Native-Host-Agent |
| `laufzeit/**`, `site/js/pizzaiolo*`, `HOST-ABI.md` | Compiler-Agent |
| `site/beispiele/theke*.json`, `site/beispiele/theke/**` | Beispiel-Agent |
| `site/js/doku/*.js` (Abschnitt „Theke“) | Doku-Agent |
| `SPEC.md` (§16 Theke), `KLAERUNGEN.md` | Klärungs-Agent |

## 8. Präzisierungen (verbindlich in SPEC §16, Klärungen K-056 … K-075)

- Rückrufe: `beiKlick` → `fn()`, `beiAenderung` → `fn(wert)`, `beiEnter` → `fn(text)`; Zustand vor dem Rückruf aktualisiert; Setter lösen keine Rückrufe aus (K-056, K-073).
- Bündelung: gepufferte Änderungen gezeigter Zutaten, gesendet vor dem Warten, nach jedem Rückruf (auch bei Ananas), vor `schliesse`, vor erneutem `fenster` (`setzeTitel`), am Programmende; ein Eintrag je Zutat, letzter Wert gewinnt, `stil` ganzes Objekt, `kinder` vollständig (K-057).
- `zeige`: erstes Mal `fenster` + `baum`; erneut → neuer `baum`, offene Änderungen verfallen; nach Schließen öffnet `zeige` wieder; `zeige(karton)` → TypAnanas (K-058).
- Ein Elternteil, keine Zyklen, gezeigte Wurzel belegt → `LaufzeitAnanas: Die Zutat 'z1' liegt schon woanders auf der Theke.` (K-059).
- Programmende (Nutzerentscheidung, K-061): offenes Fenster wird geschlossen – Laufzeit sendet nach dem letzten Flush `schliesse` (auch bei Ananas/P0002, nicht bei Panik, nicht nach `geschlossen`); Host beendet den Prozess mit dem Exit-Code, UI schließt das Vorschaufenster.
- Ereignisse mit unpassendem Ziel (unbekannte ID, inaktiver Knopf, falscher Typ, unbekannter `typ`) werden ignoriert; Haken akzeptiert `true`/`"true"`; `{"typ":"bereit"}` ist intern (K-064).
- Protokoll: Zustandsfelder immer, `platzhalter`/`aktiv:false`/`sichtbar:false`/`stil` nur bei Abweichung; Renderer akzeptiert in `aendere`-`kinder` auch `{"id"}`-Verweise und behandelt `stil` als Teil-Update (K-067).
- Stile: Zahlen in Pixeln (auch Kommazahlen), `ausrichtung` `links|mitte|rechts`, Fehlertexte mit erlaubter Liste (K-068); `stil(k, karton)` entfernt den Stil, Nachricht trägt `null` (K-075).
- HOST-ABI `ui_warte`: Rückgabe = benötigte Länge, Retry mit größerem Puffer (wie K-013); Compiler meldet bis zur Umsetzung `nichtUnterstuetzt` (K-072).
- **Animationen v3 (K-090 … K-094, SPEC §16.6; umgesetzt: Interpreter U-56, Renderer U-58, Wasm U-57):** `zutat.animiere(art, dauer?)` mit `puls|huepfen|wackeln|funkeln|einblenden|aufpoppen`,
  `theke.schwebe(text, bei?, farbe?, dauer?)` (schwebende „+12“; gleichzeitige Texte am selben Anker stapeln sich senkrecht, K-092; leerer
  Text zeigt nichts), `zutat.uebergang(ja)` (weiches Ein-/Ausblenden, neue Kinder blenden ein – auch in `Reiter`);
  alle Parameter auch benannt (K-094); fehlende Art → `Animation 'karton' gibt es nicht.`, fehlender Schwebetext → „karton“ (K-093).
  Rein visuell: keine Ereignisse zurück, Schritte wie normale Aufrufe, Warten 0. Protokoll: Feld `animationen` in `aendere`
  (Aufrufreihenfolge, ≤ 32, nach `aenderungen` angewendet), Feld `uebergang`; kein neues `op`. Nicht gezeigte Zutat → `W0102` (keine
  Ananas); `prefers-reduced-motion` → keine Bewegung (Schwebetext bleibt lesbar). Renderer: `PizzaTheke.registriereAnimation`.
- Erweiterungen v2 (Takt, Fortschritt, Abschnitt, Tabelle, Reiter, `hinweis`, `schrift: "riesig"`, Zahlformat, `Uhr.echt()`, Schrittlimit je Rückruf): SPEC §16.5 (K-084 … K-087), Vorschlag in `THEKE-ERWEITERUNGEN.md`.
- **Theke v4 (K-107 … K-113, SPEC §16.7; Wünsche W1–W7 aus THEKE-ERWEITERUNGEN.md §11.5):** `Reiter.setzeTitel(n, t)`/`titel(n)`, Reiter-Seite
  per `sichtbar(nein)` ausblenden (Renderer versteckt Tab + Seite, zeigt bei unsichtbarer gewählter Seite die nächste sichtbare, sendet nichts);
  `Abschnitt.klappbar(d)`/`zu(d)`/`beiAenderung(fn)` → `fn(zu)` mit Ereignis `aenderung` (`wert` = zu); Zutat `Auswahl(optionen, gewaehlt: 1)`
  (Segment-Umschalter, `role=radiogroup`, Ereignis `aenderung` mit `wert:n`); unsichtbare Zutat `Tastatur(beiTaste)` mit Ereignis
  `{"typ":"taste","id","taste"}` (Tastennamen: `e.key`, Sondertasten deutsch – `Leertaste`, `Links`/`Rechts`/`Hoch`/`Runter`, `Rücktaste`,
  `Entfernen`, `Pos1`, `Ende`, `BildHoch`/`BildRunter`; keine Modifikatoren, keine Wiederholungen, nicht aus einer fokussierten `Eingabe`;
  Listener auf der fokussierbaren Theke-Wurzel, `tabindex="-1"`, Fokus beim `baum`, wenn nichts fokussiert ist); Stile `zeilen`/`mindestbreite`;
  `Mathe.log/log10/log2/exp/E` (K-111, bitgleich zu V8); `Meldung`/Toast abgelehnt (K-112, Anwendungslogik). Protokoll bleibt v1.
