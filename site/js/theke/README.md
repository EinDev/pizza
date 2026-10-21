# Theke – Render-Engine

Reines JS/DOM, keine Abhängigkeiten, kein Netzwerk, kein `eval`, keine Inline-Handler. Vertrag: `THEKE.md` (Protokoll v1, §3).

| Datei | Zweck |
|---|---|
| `theke.js` | Engine + Zutaten-Registry (UMD → `self.PizzaTheke`, auch `require()`-bar) |
| `theke.css` | Gekapseltes Design (nur `.theke`/`.theke-…`), hell/dunkel |
| `fenster.html` + `fenster.js` + `fenster.css` | Eigenständige Hülle für den nativen Host (wry) |

Tests: `tests/theke/` (`npm install && node run.js` – jsdom; `node visuell.mjs` – Chrome-Screenshots unter strikter CSP).

## API

```js
const theke = PizzaTheke.erzeuge(container, {
  sende(ereignis) {},          // Pflicht: Ereignis ans Programm, z. B. {typ:"klick",id:"z3"}
  thema: "auto",               // "hell" | "dunkel" | "auto" (Standard)
  fenster(info) {},            // optional: {titel, breite?, hoehe?} bei jedem op "fenster" (auch setzeTitel)
  geschlossen() {},            // optional: Programm hat op "schliesse" gesendet → Fenster/Panel zumachen
  zeitgeber: {                 // optional (Tests): Uhr für takt & eigene Zutaten; fehlende Funktionen = Standard
    jetzt() {},                //   ms, Standard performance.now() des Fensters (sonst Date.now())
    setzeIntervall(fn, ms) {}, //   → Handle, Standard setInterval von container.ownerDocument.defaultView
    loescheIntervall(h) {},    //   Standard clearInterval
  },
});
theke.empfange(nachricht);     // Objekt oder JSON-String; wirft nie (Probleme → console.warn)
theke.schliessen();            // Nutzer hat das Fenster geschlossen → sendet einmalig {"typ":"geschlossen"}
theke.setzeThema("dunkel");    // Thema später wechseln
theke.titel();                 // letzter Fenstertitel
theke.element;                 // das erzeugte .theke-Element (füllt den Container: width/height 100 %)
theke.zerstoere();             // Listener + DOM weg, danach ist alles wirkungslos
```

- Die Engine fasst nichts außerhalb von `container` an (kein `document.title`, keine Fenstergröße) und nutzt
  `container.ownerDocument`. Größe des Containers bestimmt die Einbettung; `breite`/`hoehe` aus `fenster`
  kommen über den `fenster`-Rückruf (zusätzlich als `--theke-fenster-breite/-hoehe` am Element).
- `op: "schliesse"` leert die Theke und ruft `geschlossen()`, **sendet aber nichts**. `geschlossen` als Ereignis entsteht
  nur über `schliessen()`. Ein späteres `fenster`/`baum` öffnet die Theke wieder.
- **Thema:** `thema: "auto"` folgt einem `data-theme="light|dark"` an einem Vorfahren (z. B. `<html>` im Playground),
  sonst `prefers-color-scheme`. Die Einbettung darf `data-theme` an `theke.element` auch direkt setzen.

## Protokoll-Felder (was der Renderer versteht)

Gemeinsam für alle Zutaten (in `baum`-Knoten **und** `aendere`-Einträgen, gleicher Codepfad):
`id`, `art`, `sichtbar` (bool), `stil` (Objekt, Teil-Updates; `null` setzt einen Schlüssel zurück),
`hinweis` (Text → Tooltip/`title`-Attribut; leer/`null` entfernt ihn).

| art | Felder | Ereignisse |
|---|---|---|
| `schild` | `text` | – |
| `knopf` | `text`, `aktiv` | `{"typ":"klick","id"}` (nicht wenn inaktiv) |
| `eingabe` | `wert`, `platzhalter`, `aktiv` | `{"typ":"aenderung","id","wert":"…"}` bei jeder Eingabe, `{"typ":"enter","id","wert"}` |
| `haken` | `text`, `an`, `aktiv` | `{"typ":"aenderung","id","wert":true/false}` |
| `stapel`, `reihe` | `kinder` (Liste von Knoten) | – |
| `takt` | `intervall` (ms; < 100 → 100, ungültig → 1000 + Warnung), `aktiv` | `{"typ":"takt","id","anzahl":n}` (n ≥ 1, s. u.) |
| `fortschritt` | `wert` (0…1, geklemmt; NaN/kein Zahl → 0), `text` (optional, mittig im Balken) | – |
| `abschnitt` | `titel`, `kinder` | – |
| `tabelle` | `spalten` (Liste Texte), `zeilen` (Liste von Listen; Zellen per `String()`) | – |
| `reiter` | `titel` (Liste; fehlend/leer → „Seite n“), `gewaehlt` (1-basiert, auf 1…n geklemmt), `kinder` (Seiten) | `{"typ":"aenderung","id","wert":n}` |

v2-Zutaten (`THEKE-ERWEITERUNGEN.md`, Abschnitt „v2-Zutaten“ in `theke.js`):
- **`takt`** ist unsichtbar (`hidden`, `aria-hidden`, per CSS nie angezeigt – auch nicht mit `sichtbar:true`) und läuft, solange
  er aktiv ist und im Baum liegt. Der Timer feuert feiner als das Intervall (`intervall/4`, 25…250 ms); gezählt wird nach der Uhr:
  `anzahl = floor((jetzt − letzter) / intervall)`, bei ≥ 1 wird gesendet und `letzter += anzahl × intervall` (Nachholregel –
  gedrosselte Fenster liefern einen Schlag mit großer `anzahl`, nichts geht verloren oder doppelt). Echte Änderung von `intervall`
  oder `aktiv:false → true` startet die Zählung neu; gleiche Werte nicht. Entfernen, neuer `baum`, `schliesse`, `schliessen()`
  und `zerstoere()` löschen den Timer (auch ohne `id`).
- **`fortschritt`**: `role="progressbar"`, `aria-valuemin/max/now` (0–100), `aria-valuetext` = `text`. `stil.farbe` färbt die
  Füllung (Standard Tomate); Breite mit CSS-Transition (aus bei `prefers-reduced-motion`). Mit `text` wird der Balken höher.
- **`abschnitt`**: `<section>`-Karte mit `<h3>` (leerer Titel → ausgeblendet) und Stapel-Inhalt; `stil.abstand`/`ausrichtung`
  wirken auf den Inhalt, `stil.farbe` tönt die Karte.
- **`tabelle`**: `<table>` mit `thead`/`tbody`; Spalten, deren nicht-leere Zellen alle wie Zahlen aussehen (auch `1.234,5`,
  `1,2 Mio.`, `8,00 €`, `12 %`; leer/`–` zählt nicht), sind rechtsbündig mit `tabular-nums`. Spaltenzahl = max(Spalten, längste
  Zeile); keine Zeilen → eine dezente Zeile „–“. `spalten` und `zeilen` dürfen einzeln per `aendere` kommen.
- **`reiter`**: `role=tablist/tab/tabpanel`, `aria-selected`, Roving-Tabindex, Pfeil links/rechts (mit Umlauf), Home/End.
  Klick/Taste zeigt sofort lokal um und sendet `aenderung` – **nur bei echtem Wechsel** (Klick auf den gewählten Reiter sendet
  nichts). `gewaehlt` vom Programm sendet nie. Nicht gewählte Seiten bekommen die Klasse `theke-reiter-aus` (nicht `hidden`,
  das gehört `sichtbar`); Seiten werden über `setzeKinder` nach `id` wiederverwendet.

- **`hinzu`/`leeren` (Vorschlag an den Interpreter):** `{"id":"z4","kinder":[…]}` in `aendere` mit der **vollständigen** neuen
  Kinderliste. Bereits bekannte IDs werden wiederverwendet (Element, Fokus und Eingabe bleiben erhalten); ein Kind darf als
  `{"id":"z1"}` ohne `art` referenziert werden. Nicht mehr enthaltene Zutaten werden entfernt.
- `eingabe.wert` wird nur gesetzt, wenn er sich vom aktuellen Inhalt unterscheidet (kein Cursorsprung beim Tippen).
- Unbekannte `art` → sichtbarer Platzhalter „Unbekannte Zutat „x““ (Kinder werden darin trotzdem gezeigt).
  Unbekannte Felder → einmalige Warnung je `art.feld`, unbekanntes `op` → Warnung, `v > 1` → Warnung + Versuch.

### Stil-Whitelist (THEKE.md §2) – sonst nichts

| Schlüssel | Werte | Wirkung |
|---|---|---|
| `breite`, `hoehe` | Zahl (px, 0–4000), `"voll"` (100 %), `"auto"` | Custom-Property `--theke-breite/-hoehe` |
| `abstand` | Zahl (px, 0–200) | Behälter: Lücke zwischen Kindern; sonst Innenabstand |
| `ausrichtung` | `start`/`links`/`oben`, `mitte`/`zentriert`, `ende`/`rechts`/`unten`, `strecken` | Stapel: Querachse; Reihe: Hauptachse; Einzel-Zutat: Lage im Behälter + Textausrichtung |
| `schrift` | `klein`, `normal`, `gross`, `riesig`, `mono` | Klasse `theke-schrift-…` (`riesig`: großer Zähler/Knopf) |
| `farbe` | `tomate`, `basilikum`, `mozzarella`, `kruste`, `normal` | Schild: Textfarbe; Knopf: Füllung; Eingabe/Haken: Akzent; Behälter: getönte Karte |

## Erweitern: neue Zutat

```js
PizzaTheke.registriere("leinwand", {
  felder: ["breite", "hoehe"],                       // optional: bekannte Felder (sonst keine Feldwarnungen)
  erzeuge(knoten, ctx) {                              // → DOM-Element (wird nach erzeuge mit allen Feldern aktualisiert)
    const el = ctx.dokument.createElement("canvas");
    ctx.bei("click", (e) => ctx.sende("klick", { x: e.offsetX, y: e.offsetY }));   // → {typ:"klick", id, x, y}
    return el;
  },
  aktualisiere(el, felder, ctx) { /* nur vorhandene Felder anwenden */ },
});
```

`ctx`: `dokument`, `id`, `sende(typ, extra?)`, `bei(typ, fn, ziel?)` (Listener, beim Entfernen automatisch gelöst),
`baue(knoten)`, `setzeKinder(el, kinder)` (für eigene Behälter), `beimEntfernen(fn)` (fn wird genau einmal gerufen, wenn die
Zutat verschwindet: aus `kinder` entfernt, Art gewechselt, neuer `baum`, `schliesse`/`schliessen()`, `zerstoere()` – z. B. um
Timer zu stoppen), `zeitgeber` (die Uhr der Instanz, s. `optionen.zeitgeber`), `warne(…)`. `stil`, `sichtbar` und `hinweis`
übernimmt die Engine. Wirft `erzeuge`, erscheint ein Platzhalter. Die v1- und v2-Zutaten sind über genau diese API registriert
(Abschnitte „v1-Zutaten“/„v2-Zutaten“ in `theke.js`).

## Einbettung im Playground (UI-Agent)

```html
<link rel="stylesheet" href="js/theke/theke.css">
<script src="js/theke/theke.js"></script>
```
```js
const theke = PizzaTheke.erzeuge(panelInhalt, {
  sende: (e) => /* an Worker: Antwort auf onUiWarte */,
  fenster: ({ titel, breite, hoehe }) => { panelTitel.textContent = titel; /* Panelgröße */ },
  geschlossen: () => panel.hidden = true,
});
// ui-Ereignis vom Worker: theke.empfange(ereignis.nachricht)
// Schließen-Knopf des Panels: theke.schliessen()  (sendet {"typ":"geschlossen"})
```
Das Thema folgt automatisch `<html data-theme>`. Der Container braucht eine Höhe (die Theke scrollt intern).

## Nativer Host (wry/tao) – Brücke

`fenster.html` lädt `fenster.css`, `theke.css`, `theke.js`, `fenster.js` **relativ** und hat eine eigene CSP
(`default-src 'none'; script-src 'self'; style-src 'self'`). Empfohlen: alle fünf Dateien per `include_str!`
einbetten und über ein **Custom-Protocol** ausliefern (z. B. `with_custom_protocol("theke", …)` →
`theke://lokal/fenster.html`; unter Windows/WebView2 erscheint das als `http://theke.localhost/…`). So bleiben die relativen Pfade
gültig, `'self'` passt, und es gibt keinen Server. (Inline-`<script>` würde an der CSP der Seite scheitern.)

**Seite → Host:** `window.ipc.postMessage(json)` – jeder IPC-String ist ein Ereignis-JSON (`klick`, `aenderung`, `enter`, `takt`).
Der Takt-Timer läuft in der Seite; der Host braucht dafür nichts.
Ausnahme: direkt nach dem Laden kommt einmal **`{"typ":"bereit"}`** – kein Programm-Ereignis, **nicht weiterreichen**.
Vorher eintreffende `ui`-Nachrichten puffert der Host und sendet sie nach `bereit` in Reihenfolge.

**Host → Seite:** `pizzaThekeEmpfange(<String>)` per `evaluate_script`. Das Argument ist ein **JS-String**, der das
Protokoll-JSON enthält – also doppelt kodieren, nie roh einsetzen:
```rust
let js = format!("pizzaThekeEmpfange({})", serde_json::to_string(&nachricht_json_string)?);
webview.evaluate_script(&js)?;
```

**Fenster:** Bei `op: "fenster"` setzt der Host Titel/Größe des tao-Fensters selbst (er sieht die Nachricht ja); die Seite
setzt nur `document.title`. Bei `op: "schliesse"` schließt der Host das Fenster selbst. Schließt der **Nutzer** das Fenster,
ist die Seite schon weg – dann schickt der **Host** `{"typ":"geschlossen"}` direkt auf den Kanal an `ui_warte`.
Ohne `window.ipc` (Datei im Browser geöffnet) loggt `fenster.js` Ereignisse nur in die Konsole.
