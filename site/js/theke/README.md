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
    nach(fn, ms) {},           //   → Handle, Standard setTimeout (Ende von Animationen/uebergang)
    loescheNach(h) {},         //   Standard clearTimeout
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
`hinweis` (Text → Tooltip/`title`-Attribut; leer/`null` entfernt ihn), `uebergang` (bool, v3 – s. u.).

| art | Felder | Ereignisse |
|---|---|---|
| `schild` | `text` | – |
| `knopf` | `text`, `aktiv` | `{"typ":"klick","id"}` (nicht wenn inaktiv) |
| `eingabe` | `wert`, `platzhalter`, `aktiv` | `{"typ":"aenderung","id","wert":"…"}` bei jeder Eingabe, `{"typ":"enter","id","wert"}` |
| `haken` | `text`, `an`, `aktiv` | `{"typ":"aenderung","id","wert":true/false}` |
| `stapel`, `reihe` | `kinder` (Liste von Knoten) | – |
| `takt` | `intervall` (ms; < 100 → 100, ungültig → 1000 + Warnung), `aktiv` | `{"typ":"takt","id","anzahl":n}` (n ≥ 1, s. u.) |
| `fortschritt` | `wert` (0…1, geklemmt; NaN/kein Zahl → 0), `text` (optional, mittig im Balken) | – |
| `abschnitt` | `titel`, `kinder`, `klappbar` (bool, v4), `zu` (bool, v4) | `{"typ":"aenderung","id","wert":true/false}` (neuer `zu`-Zustand, nur wenn der Gast klappt) |
| `tabelle` | `spalten` (Liste Texte), `zeilen` (Liste von Listen; Zellen per `String()`) | – |
| `reiter` | `titel` (Liste; fehlend/leer → „Seite n“), `gewaehlt` (1-basiert, auf 1…n geklemmt), `kinder` (Seiten; `sichtbar:false` an einer Seite versteckt auch ihren Tab, v4) | `{"typ":"aenderung","id","wert":n}` |
| `auswahl` (v4) | `optionen` (Liste Texte), `gewaehlt` (1-basiert, auf 1…n geklemmt; ungültig → 1 + Warnung), `aktiv` | `{"typ":"aenderung","id","wert":n}` |
| `tastatur` (v4) | `aktiv` | `{"typ":"taste","id","taste":"…"}` je Tastendruck auf der Theke (s. u.) |

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
| `farbe` | `tomate`, `basilikum`, `mozzarella`, `kruste`, `normal` | Schild: Textfarbe; Knopf: Füllung; Eingabe/Haken: Akzent; Behälter: getönte Karte; Auswahl: gewählte Option |
| `zeilen` (v4) | ganze Zahl ≥ 1 | `--theke-zeilen` + Klasse `theke-hat-zeilen`: der Text von `schild`, `knopf` (innerer `span.theke-knopf-text`) und `haken` ist **genau** n Zeilen hoch (`n × 1lh`, auch bei kurzem Text), längerer Text endet mit „…“ (`line-clamp`); andere Zutaten tragen die Property, das CSS ignoriert sie |
| `mindestbreite` (v4) | wie `breite` (Zahl px 0–4000, `"voll"`, `"auto"`) | `--theke-mindestbreite` + Klasse `theke-hat-mindestbreite` → `min-width` (nie schmaler, darf wachsen); für jede Zutat |

## v4: Reiter-Seiten, klappbarer Abschnitt, Auswahl, Tastatur (K-107 … K-110, SPEC §16.7)

- **Reiter-Seite ausblenden (K-107):** kein neues Feld – `sichtbar:false` an einer Seite versteckt den Tab (`hidden`) und die Seite;
  Pfeiltasten/Home/End wandern nur über sichtbare Seiten. Zeigt `gewaehlt` auf eine versteckte Seite, zeigt der Renderer die nächste
  sichtbare danach, sonst die letzte sichtbare davor, und sendet **nichts**; alle versteckt → leere Leiste und Fläche. `gewaehlt` bleibt
  roh gespeichert (wird die Seite wieder sichtbar, gilt es wieder). Mit `uebergang` an der Seite blendet die Seite weich aus, der Tab
  verschwindet sofort (eine ausblendende Seite zählt als versteckt). Ein Tab ohne Seite (`titel` länger als `kinder`) zählt als sichtbar.
  Mechanik: der generische Registry-Hook `kindSichtbar(el, kindEl, ctx)` (s. „Erweitern“) – die Engine ruft ihn nach jedem echten
  sichtbar-Wechsel eines Kindes an der nächsten umgebenden Zutat.
- **Abschnitt (K-108):** `klappbar:true` macht den Kopf (`<h3>`) zu einem `<button type=button aria-expanded>` mit Pfeil ▸ (zu) / ▾
  (offen) per CSS vor dem Titel (leerer Titel → nur der Pfeil, der Kopf bleibt sichtbar). Klick (Enter/Leertaste nativ) klappt sofort lokal
  und sendet `aenderung` mit `wert` = neuer `zu`-Zustand; `zu` vom Programm sendet nie. `zu:true` setzt `hidden` am Inhaltsbereich
  (`.theke-abschnitt-inhalt`) – Kinder eines zugeklappten Abschnitts gelten für Animationen als nicht gezeigt und senden nichts; mit
  `uebergang` blendet der Inhalt weich (sofort `inert` + `theke-ueb-aus`, nach 200 ms `hidden`). Ohne `klappbar`/`zu`: unverändert.
- **Auswahl (K-109):** Segment-Leiste `role="radiogroup"` mit `<button type=button role="radio" aria-checked>` je Option (Klasse
  `theke-auswahl-option`, gewählte zusätzlich `theke-auswahl-option-an` in `--theke-ton`, also `stil.farbe`). Roving-Tabindex, Pfeil
  links/rechts mit Umlauf, Home/End (Hoch/Runter bleiben unangetastet – die gehören einer `tastatur`). Klick/Taste schaltet sofort lokal
  um und sendet nur bei echtem Wechsel; `gewaehlt` vom Programm sendet nie; `aktiv:false` deaktiviert alle Knöpfe (kein Ereignis).
- **Tastatur (K-110):** unsichtbar wie `takt` (`hidden`, `aria-hidden`, per CSS nie sichtbar). Das Theke-Wurzelelement bekommt
  `tabindex="-1"` (`:focus` ohne Rahmen) und den einzigen `keydown`-Listener; beim `baum` fokussiert der Renderer die Wurzel nur, wenn
  nichts (bzw. `body`) fokussiert ist (`focus({preventScroll:true})`) – ein Editor im Playground behält den Fokus, ein Klick ins Fenster
  gibt ihn der Theke. Jede aktive Tastatur im Baum bekommt jede Taste in **Baumreihenfolge** (DOM-Reihenfolge, auch nach `kinder`-
  Umsortierung). Tasten auf einem fokussierten Knopf/Reiter erreichen die Tastatur **zusätzlich** (Leertaste klickt den Knopf und kommt
  als `Leertaste`). Die Standardwirkung (Scrollen) von Leertaste/Pfeilen/Pos1/Ende/Bild wird **nur** unterdrückt, wenn eine aktive
  Tastatur zuhört **und** `e.target` die Wurzel ist (nichts im Fenster fokussiert). Mechanik: Registry-Hook `taste(el, name, ctx, e)`.

  Tastennamen (verbindlich, K-110): `e.key`, Sondertasten deutsch:

  | `e.key` | `taste` | | `e.key` | `taste` |
  |---|---|---|---|---|
  | `" "` (auch `Spacebar`) | `Leertaste` | | `Backspace` | `Rücktaste` |
  | `ArrowLeft` / `ArrowRight` | `Links` / `Rechts` | | `Delete` | `Entfernen` |
  | `ArrowUp` / `ArrowDown` | `Hoch` / `Runter` | | `Home` / `End` | `Pos1` / `Ende` |
  | `PageUp` / `PageDown` | `BildHoch` / `BildRunter` | | `Enter`, `Escape`, `Tab`, `F1`…`F12`, Zeichen (`a`, `A`, `1`, `+`, `ä`) | unverändert |

  **Nicht gesendet:** reine Modifikatoren (`Shift`, `Control`, `Alt`, `AltGraph`, `Meta`, `CapsLock`, `NumLock`, `ScrollLock`, `Fn`,
  `FnLock`, `Hyper`, `Super`, `Symbol`, `OS`), `Dead`/`Unidentified`, Komposition (`isComposing` oder `keyCode` 229), Wiederholungen
  (`e.repeat`), Tasten mit Ziel in einer Eingabe (`input`, `textarea`, `select`, `contenteditable`), leeres `e.key`.

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
  kindSichtbar(el, kindEl, ctx) {},                   // optional (v4): ein Kind (auch in einem inneren Bereich) hat sichtbar gewechselt
  taste(el, name, ctx, e) { return false; },          // optional (v4): Tastendruck auf der Theke; true = aktiv angenommen (→ preventDefault-Regel)
});
```

`ctx`: `dokument`, `id`, `sende(typ, extra?)`, `bei(typ, fn, ziel?)` (Listener, beim Entfernen automatisch gelöst),
`baue(knoten)`, `setzeKinder(el, kinder)` (für eigene Behälter), `beimEntfernen(fn)` (fn wird genau einmal gerufen, wenn die
Zutat verschwindet: aus `kinder` entfernt, Art gewechselt, neuer `baum`, `schliesse`/`schliessen()`, `zerstoere()` – z. B. um
Timer zu stoppen), `blende(el, an)` (v4: ein Teil-Element der Zutat – z. B. der Abschnitt-Inhalt – ein-/ausblenden, `hidden`;
mit `uebergang` der Zutat weich, Timer werden beim Entfernen gelöscht), `zeitgeber` (die Uhr der Instanz, s. `optionen.zeitgeber`),
`warne(…)`. `stil`, `sichtbar` und `hinweis` übernimmt die Engine. Wirft `erzeuge`, erscheint ein Platzhalter. Die v1-, v2- und
v4-Zutaten sind über genau diese API registriert (Abschnitte „v1-Zutaten“/„v2-Zutaten“/„v4“ in `theke.js`).

## v3: Animationen und `uebergang` (K-090 … K-092, SPEC §16.6)

- **`aendere.animationen`** (Liste neben `aenderungen`): wird **nach** den Änderungen in Reihenfolge abgespielt
  (`einblenden` auf ein im selben `aendere` per `kinder` eingefügtes Kind wirkt). Eintrag `{id, art, dauer?}` bzw.
  `{art:"schwebe", text, id?, farbe?, dauer?}`. Unbekannte `id`, nicht gezeigte Zutat (`hidden`, ausblendend, nicht gewählte
  Reiter-Seite) und `takt` → still ignoriert; unbekannte `art` → **eine** Warnung je Art. Dauer auf 50 ms … 5 s geklemmt,
  fehlt sie: Standard der Art. Keine Ereignisse zurück, die Zutat bleibt bedienbar.
- **Arten:** `puls` 400 ms, `huepfen` 350 ms, `wackeln` 400 ms, `funkeln` 800 ms (Leuchten in `--theke-gold` + 8 Funken an festen
  Positionen in der Ebene), `einblenden` 300 ms, `aufpoppen` 450 ms, `schwebe` 1000 ms. Gleiche Art an derselben Zutat startet
  neu, andere ersetzt die laufende. Schwebetexte addieren sich (höchstens 20, der älteste weicht); gleichzeitige Texte am
  selben Anker bekommen den kleinsten freien Platz 0, 1, 2, … (frei nach dem Ende): je Platz eine Zeile (20 px) höher
  (`--theke-hoch`) und seitlich reihum 0, −12, +12, −6, +6 px (`--theke-versatz`) – kein Zufall. Start oben mittig über `id`
  bzw. in der Fenstermitte, bei zu wenig Platz nach oben (Text + Steigen) tiefer – ein Stapel-Platz, für den der Platz nach
  oben nicht reicht, stapelt nach unten über die Zutat – bzw. am Rand nach innen gerückt (bleibt im sichtbaren Ausschnitt). Leerer Text (auch nur Leerraum): kein Element, zählt nicht zum Limit (K-093).
- **Technik:** `@keyframes`-Klassen `theke-anim-<art>`, Dauer als `--theke-anim-dauer` per CSSOM (CSP-fest, kein
  `style`-Attribut-String). Nur `transform`/`opacity`/`filter` – Layout und Scrollmaße ändern sich nie (in `visuell.mjs` geprüft).
  Schwebetexte/Funken liegen in `.theke-ebene` (absolut über dem Inhalt, `pointer-events: none`, schneidet ab).
  Das Ende kommt vom Zeitgeber (`nach`), nicht von `animationend`.
- **`uebergang`** (Feld an jeder Zutat): `sichtbar:false` → sofort `inert` + `theke-ueb-aus` (kein `klick` mehr), nach 200 ms
  `hidden`; `sichtbar:true` blendet ein (auch mitten im Ausblenden). Behälter mit `uebergang` blenden per `kinder`
  **neu hinzugekommene** Kinder ein (nicht im ersten `baum`, entfernte sofort weg). `fortschritt` gleitet immer (CSS-Transition).
  v4: beim `abschnitt` gilt dieselbe Mechanik für `zu` (Inhaltsbereich); eine ausblendende Reiter-Seite verliert ihren Tab sofort.
- **`prefers-reduced-motion: reduce`:** `puls`, `huepfen`, `wackeln`, `einblenden`, `aufpoppen`, `uebergang` entfallen,
  `funkeln` leuchtet ruhig (ohne Funken), `schwebe` steht ruhig für die Dauer und verschwindet, `fortschritt` springt.

```js
PizzaTheke.registriereAnimation("blinken", {
  dauer: 300,                       // Standarddauer (ms)
  ebene: false,                     // true = wie schwebe: in der Ebene, el darf null sein, ersetzt nichts, zählt zum Limit
  leer: (eintrag) => false,         // optional: true = nichts zu zeigen → Eintrag übersprungen (kein Lauf, kein Platz)
  spiele(el, eintrag, ctx) {        // eintrag = Protokolleintrag {id, art, dauer?, …}
    if (ctx.reduziert) return;      // prefers-reduced-motion
    ctx.klasse(el, "mein-blinken"); // @keyframes-Klasse mit --theke-anim-dauer (gleiche Klasse → Neustart)
    return () => {};                // optional: Aufräumen (Ende, Ersetzen, Entfernen, neuer baum, schliesse)
  },
});
```
`ctx`: `dokument`, `dauer`, `reduziert`, `nummer` (Platz am selben Anker: kleinster freier unter den laufenden, Ebenen-Arten), `ebene`, `lage(el?)`
(→ `{x, y, b, h}` in Ebenen-Koordinaten, ohne `el` die Fenstermitte), `sicht()` (sichtbarer Ausschnitt), `klasse(el, name)`,
`teil(klasse, lage)` (Element in der Ebene, verschwindet am Ende), `beimEnde(fn)`, `warne`. `PizzaTheke.animationsArten()` listet alle.

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

**Seite → Host:** `window.ipc.postMessage(json)` – jeder IPC-String ist ein Ereignis-JSON (`klick`, `aenderung`, `enter`, `takt`,
`taste`). Der Takt-Timer und der Tastatur-Listener laufen in der Seite; der Host braucht dafür nichts (v4 ändert an der Brücke nichts –
nur die eingebetteten `theke.js`/`theke.css` sind neu).
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
