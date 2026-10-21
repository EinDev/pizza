# Theke – das UI-Framework von pizza (Vertrag, v1)

> Die Theke ist da, wo der Gast die Pizza sieht.

Nutzer: „Ich will ein UI-Framework. Es soll im Browser sowie in der fertigen EXE/Linux funktionieren.
Keep it simple, but extendable – wir werden in Zukunft mehr hinzufügen.“
Entscheidung: nativ als **eigenes Fenster über die System-WebView** (Windows: WebView2, Linux: WebKitGTK).

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
| `Theke` | Fenster | `(titel, breite: 480, hoehe: 360)` | `zeige(zutat)`, `bediene()`, `schliesse()`, `setzeTitel(t)` |
| `Schild` | Text/Label | `(text)` | `text()`, `setzeText(t)` |
| `Knopf` | Button | `(text, beiKlick?)` | `text()`, `setzeText(t)`, `beiKlick(fn)`, `aktiv(diavolo)` |
| `Eingabe` | Textfeld (einzeilig) | `(wert: "", platzhalter: "")` | `wert()`, `setzeWert(t)`, `beiAenderung(fn)` (fn bekommt den Text), `beiEnter(fn)` |
| `Haken` | Checkbox | `(text, an: nein)` | `an()`, `setzeAn(diavolo)`, `beiAenderung(fn)` (fn bekommt diavolo) |
| `Stapel` | Container vertikal | `(Blech<Zutat>)` | `hinzu(zutat)`, `leeren()` |
| `Reihe` | Container horizontal | `(Blech<Zutat>)` | `hinzu(zutat)`, `leeren()` |

- Gemeinsame Basisklasse **`Zutat`** (nicht direkt instanziierbar) mit `id()`, `sichtbar(diavolo)`, `stil(schlüssel, wert)`
  (eine kleine Whitelist: `breite`, `hoehe`, `abstand`, `ausrichtung`, `schrift` = `"klein"|"normal"|"gross"|"mono"`, `farbe` = Themenfarben `"tomate"|"basilikum"|"mozzarella"|"kruste"|"normal"`).
  Keine freien CSS-Strings (Sicherheit + Portabilität).
- **IDs:** automatisch `z1, z2, …` in Erzeugungsreihenfolge (deterministisch) oder benannt: `neu Knopf("OK", id: "ok")`.
- Zustand lebt im Programm; jede Änderung (`setzeText` usw.) erzeugt eine **Änderungsnachricht**. Mehrere Änderungen während eines
  Rückrufs werden gebündelt und beim Zurückkehren in `bediene()` gesendet (ein Frame).
- `bediene()` ohne vorheriges `zeige` → `LaufzeitAnanas: Die Theke ist leer.` Zweites `bediene()` nach Schließen kehrt sofort zurück.
- Ananas in Rückrufen laufen wie gewohnt aus `bediene()` heraus (fangbar mit `probier` um `bediene()`).
- Ohne verfügbaren Renderer (z. B. CLI ohne GUI, Tests ohne Skript): `bediene()` kehrt sofort zurück und es gibt die Warnung
  `W0100: Keine Theke verfügbar – Fenster wird nicht angezeigt.` (Programm läuft weiter, kein Fehler).
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
```
- Unbekannte Felder werden ignoriert (Vorwärtskompatibilität), unbekannte `art` → Platzhalter, unbekanntes `op`/`typ` → ignorieren + Konsolenwarnung.
- Neue Zutaten/Eigenschaften = neue `art`/Felder; `v` steigt nur bei inkompatiblen Änderungen.

## 4. Anbindung

### API (ARCHITEKTUR §1, Erweiterung)
- Neues Ereignis `{ typ: "ui", nachricht: <Protokoll-Objekt> }` in der Ereignisfolge (für Tests/Differenz vergleichbar).
- `optionen.onUi?: (nachricht) => void` – Nachricht an den Renderer.
- `optionen.onUiWarte?: () => ereignis | null` – **synchron** blockierend auf das nächste Ereignis (null = Fenster weg/Abbruch).
- `optionen.uiEreignisse?: Ereignis[]` – vorgegebene Ereignisfolge für Tests (erschöpft → `{"typ":"geschlossen"}`).
- Fehlen `onUiWarte` und `uiEreignisse`: kein Renderer → W0100-Verhalten.

### Browser (Playground)
Worker blockiert per `SharedArrayBuffer` + `Atomics.wait` (wie Eingabe). Die UI zeigt die Theke in einem **Vorschaufenster**
(schwebendes, verschiebbares Panel über dem Editor bzw. eigener Bereich; Titel = Fenstertitel; Schließen-Knopf → `geschlossen`).
Wand-Zeitlimit ruht während des Wartens. Abbrechen funktioniert immer.

### Wasm / HOST-ABI
Imports Modul `pizza`: `ui_senden(ptr, len)` (UTF-8-JSON) und `ui_warte(puffer_ptr, puffer_kap) -> i32`
(Länge des Ereignis-JSON, `-1` = kein Renderer/geschlossen, `> kap` = benötigte Größe, erneut aufrufen – wie K-013 bei `eingabe`).

### Nativer Host (EXE / Linux)
- Theke = eigenes Fenster per **wry + tao** (System-WebView: WebView2 unter Windows, WebKitGTK unter Linux).
  Die Render-Engine (`site/js/theke/`) ist ins Binary eingebettet (`include_str!`), kein Netzwerk, kein localhost-Server.
- Das Wasm-Programm läuft in einem eigenen Thread; das Fenster im Hauptthread (Event-Loop von tao). `ui_warte` blockiert auf einem Kanal.
- Das Fenster erscheint erst beim ersten `zeige`; Programme ohne Theke bleiben reine Konsolenprogramme (kein Fenster).
- **Varianten:** Windows x64 (eine EXE mit Theke; WebView2-Runtime ist ab Win 10/11 vorhanden – fehlt sie: verständliche Meldung + Konsolenbetrieb),
  Linux x64 **statisch ohne Theke** (`linux-x64`, W0100) und **Linux x64 mit Theke** (`linux-x64-theke`, glibc, braucht WebKitGTK 4.1 installiert).
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
Ausblick (nicht v1): Leinwand/Raster für Spiele, Liste, Auswahl, Bilder, Tastaturereignisse, Timer, Dialoge, mehrere Fenster.

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
