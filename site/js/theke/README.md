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
`id`, `art`, `sichtbar` (bool), `stil` (Objekt, Teil-Updates; `null` setzt einen Schlüssel zurück).

| art | Felder | Ereignisse |
|---|---|---|
| `schild` | `text` | – |
| `knopf` | `text`, `aktiv` | `{"typ":"klick","id"}` (nicht wenn inaktiv) |
| `eingabe` | `wert`, `platzhalter`, `aktiv` | `{"typ":"aenderung","id","wert":"…"}` bei jeder Eingabe, `{"typ":"enter","id","wert"}` |
| `haken` | `text`, `an`, `aktiv` | `{"typ":"aenderung","id","wert":true/false}` |
| `stapel`, `reihe` | `kinder` (Liste von Knoten) | – |

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
| `schrift` | `klein`, `normal`, `gross`, `mono` | Klasse `theke-schrift-…` |
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
`baue(knoten)`, `setzeKinder(el, kinder)` (für eigene Behälter), `warne(…)`. `stil` und `sichtbar` übernimmt die Engine.
Wirft `erzeuge`, erscheint ein Platzhalter. Die v1-Zutaten sind über genau diese API registriert (Abschnitt „v1-Zutaten“ in `theke.js`).

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

**Seite → Host:** `window.ipc.postMessage(json)` – jeder IPC-String ist ein Ereignis-JSON (`klick`, `aenderung`, `enter`).
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
