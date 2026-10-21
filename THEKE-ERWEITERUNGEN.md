# Theke – Erweiterungsvorschläge (aus dem Idle-Game „Pizza-Imperium“)

> Status: **Vorschlag** (Beispiel-Agent Idle-Game). Verbindlich bleibt `SPEC.md` §16 / `THEKE.md`, bis der Klärungs-Agent
> einzelne Punkte übernimmt. Die **Renderer-Seite** der hier beschriebenen Zutaten ist in `site/js/theke/theke.js`
> bereits umgesetzt (Abschnitt „v2-Zutaten“, Tests in `tests/theke/`), die **Sprach-/Laufzeit-Seite** fehlt noch
> (Aufträge in §9). Treiber: `site/beispiele/idle/pizza-imperium.pizza`.
> Vom Klärungs-Agenten übernommen als **SPEC §16.5 (K-084 … K-087)** – bei Abweichungen gilt die SPEC.

Leitlinien wie in THEKE.md: *keep it simple, but extendable* – jede Erweiterung ist **eine neue `art`** (bzw. neue Felder)
im bestehenden Protokoll v1. Kein neues `op`, keine neue Protokollversion: alte Renderer zeigen für neue Zutaten den
Platzhalter, alte Programme merken nichts. Unbekannte Felder werden weiter ignoriert, Ereignisse mit unbekanntem `typ`
ebenso (K-064) – deshalb dürfen `.ereignisse` schon heute `takt`-Zeilen enthalten.

## Übersicht und Prioritäten

| Prio | Erweiterung | Art / Ort | Wozu im Spiel | Renderer |
|---|---|---|---|---|
| **P1** | `Takt` (Zeitgeber) | Zutat `takt` + Ereignis `takt` | passive Produktion pro Sekunde | ✅ |
| **P1** | Zahlformat `kompakt()` / `tausender()` | Standardbibliothek (Zahl) | „1,2 Mio. €“ statt `1234567.8` | – |
| **P1** | Echtzeit `Uhr.echt()` | Standardbibliothek | Offline-Fortschritt zwischen Sitzungen (mit Vorratskammer) | – |
| **P1** | Schrittlimit bei offener Theke | Laufzeit/Klärung | Idle-Spiele laufen stundenlang (§8) | – |
| **P2** | `Fortschritt` (Balken) | Zutat `fortschritt` | „noch 37 % bis zum Steinofen“ | ✅ |
| **P2** | `Abschnitt` (Karte mit Überschrift) | Zutat `abschnitt` | Backstube / Upgrades / Erfolge gliedern | ✅ |
| **P2** | `Tabelle` | Zutat `tabelle` | Statistik, Erfolgsliste | ✅ |
| **P2** | `hinweis` (Tooltip) an jeder Zutat | allgemeines Feld | Upgrade-Beschreibung ohne Platz zu kosten | ✅ |
| **P3** | `Reiter` (Tabs) | Zutat `reiter` | Backstube · Erfolge · Neueröffnung | ✅ |
| **P3** | Stil `schrift: "riesig"` | Stil-Whitelist | großer Zähler / Pizza-Knopf | ✅ |
| **P3** | `Meldung` (kurzer Hinweis, verschwindet) | Zutat `meldung` | „Erfolg freigeschaltet!“ | – (Idee) |

---

## 1. `Takt` – Zeitgeber (P1)

### Sprache
```pizza
Takt uhr = neu Takt(1s, (salami n) -> { spiel.vergehe(n); });   // Konstruktor: (intervall: Dauer, beiTakt?)
uhr.aktiv(nein);              // anhalten (Setter → Zutat), aktiv() → diavolo
uhr.setzeIntervall(500ms);    // ändern; intervall() → Dauer
uhr.beiTakt(fn);              // ersetzt den Rückruf, karton entfernt ihn
```
- `Takt` ist eine **Zutat** (erbt `Zutat`, hat `id`, nimmt `id: "…"`), wird aber **nicht sichtbar** gerendert. Er muss wie jede
  Zutat **im gezeigten Baum liegen**, damit er läuft (K-057: nur gezeigte Zutaten existieren beim Renderer). Vorteil: kein neues
  `op`, Start/Stopp über die normale `aendere`-Bündelung, beim neuen `baum` oder `schliesse` endet er automatisch,
  mehrere Takte (z. B. 1 s Produktion + 60 s Ereignisse) sind einfach mehrere Zutaten.
- Rückruf `fn(anzahl)`: `anzahl` (salami ≥ 1) = Zahl der seit dem letzten Schlag verstrichenen Intervalle (Nachholregel,
  s. u.). Tolerante Lambdas (§14.9) erlauben auch `() -> …`.
- `intervall`: Dauer ≥ 100ms und ganzzahlig in ms, sonst `LaufzeitAnanas: Ein Takt braucht mindestens 100ms, nicht 50ms.`;
  Nicht-Dauer → `TypAnanas`. `Uhr.vorspulen` und die simulierte Uhr haben **keinen** Einfluss.
- Textform `Takt(t1)` wie andere Zutaten. `erbt Takt` → P0010.
- **Determinismus:** Ein Takt-Schlag ist ein ganz normales Ereignis aus `onUiWarte`/`uiEreignisse`. Im Test stehen die
  Schläge in der `.ereignisse`-Datei (`{"typ":"takt","id":"t1"}`), im Renderer/Host entstehen sie aus echter Zeit. Warten
  kostet wie immer weder Schritte noch simulierte Zeit (K-069); die Zustellung eines Schlags kostet 0, der Rückruf zählt
  seine Anweisungen.
- Ereignis für unbekannte ID, für eine Nicht-Takt-Zutat oder einen inaktiven Takt → ignoriert (wie K-064). `anzahl`
  fehlt/ist keine ganze Zahl ≥ 1 → `1`.

### Protokoll
```json
{"id":"t1","art":"takt","intervall":1000}                    // Knoten (aktiv:false nur bei Abweichung)
{"v":1,"op":"aendere","aenderungen":[{"id":"t1","aktiv":false}]}
{"typ":"takt","id":"t1","anzahl":1}                           // Renderer → Programm
```
Zustandsfeld immer: `intervall` (ms, Zahl). Nur bei Abweichung: `aktiv: false`.

### Renderer (umgesetzt)
- Unsichtbares Element (`hidden`, `aria-hidden`), Zeitgeber über `setInterval` **in `theke.js`** – damit funktioniert er
  ohne Änderung im Playground (Vorschaufenster) **und** in der nativen WebView (Host bekommt die Schläge über den
  vorhandenen IPC-Kanal wie Klicks).
- Nachholregel: Der Renderer merkt sich den Zeitpunkt des letzten Schlags; bei jedem Timer-Aufruf sendet er
  `anzahl = floor((jetzt − letzter) / intervall)` (≥ 1) und schiebt `letzter` um `anzahl × intervall` weiter. Gedrosselte
  Hintergrund-Tabs/minimierte Fenster liefern so einen Schlag mit großer `anzahl` statt Hunderter Einzelereignisse.
- Der Timer fragt alle `intervall/4` (25–250 ms) die Uhr ab; gezählt wird nur nach der Uhr (ein minimal zu früh
  feuernder Timer verspätet so keinen Schlag um ein ganzes Intervall). Nur eine echte Änderung von `intervall` oder
  `aktiv` (false → true) setzt die Zählung zurück; dieselben Werte erneut gesendet ändern nichts.
- Intervall < 100 ms wird auf 100 ms angehoben (ungültig → 1000 ms, jeweils mit Konsolenwarnung); `aktiv:false`, Entfernen aus dem Baum, neuer `baum`, `schliesse` und
  `zerstoere()` stoppen den Timer. Ändert sich `intervall`, beginnt die Zählung neu.
- Testbar: `PizzaTheke.erzeuge(container, { zeitgeber: { jetzt, setzeIntervall, loescheIntervall } })` – jsdom-Tests
  injizieren eine falsche Uhr.

### Brücken (Playground-UI, nativer Host) – Empfehlung
- Die Brücken puffern Renderer-Ereignisse, solange das Programm rechnet (Playground: `uiSchlange` in `ui/src/ausfuehrung.js`).
  **Sollte:** Liegt dort schon ein `takt` derselben `id`, wird die `anzahl` addiert statt ein zweites Ereignis anzuhängen –
  sonst stauen sich bei langsamen Rückrufen Schläge auf. Ohne diese Zusammenfassung bleibt das Verhalten korrekt, nur träger.
- Wand-Zeitlimit (P0003) zählt nur Rechenzeit (ruht beim Warten) – passt.

### Tests
- `.ereignisse` darf `{"typ":"takt","id":"t1","anzahl":5}` enthalten. Solange die Sprache `Takt` nicht kennt, werden diese Zeilen
  ignoriert (K-064) – das Idle-Beispiel nutzt Feature-Erkennung (§7) und erzeugt seine Testdateien neu, sobald `Takt` da ist.
- Prüfstand-Vorschläge (a13): Takt im Baum (`intervall`), `aktiv(nein)` → `aendere`, Schlag ruft `fn(anzahl)`, Schlag auf
  inaktiven Takt ignoriert, `neu Takt(50ms)` → LaufzeitAnanas, Takt nicht gezeigt → kein Schlag zugestellt, Schritte des Schlags = 0.

### Natives Fenster
Kein Host-Code nötig (Timer läuft in der WebView). WebView2/WebKitGTK drosseln minimierte Fenster – die Nachholregel gleicht
das aus. Beim Schließen endet der Timer mit der Seite.

---

## 2. Zahlformat (P1, Standardbibliothek – kein Renderer)

Idle-Spiele leben von großen Zahlen. `euro()` hat keine Tausendertrennung, `alsText` liefert ab 1e21 Exponenten.

| Aufruf | Ergebnis |
|---|---|
| `1234567.alsText()` | `1234567` (unverändert) |
| `1234567.tausender()` | `1.234.567` (Nachkommastellen: `tausender(2)` → `1.234.567,00`) |
| `1234567.kompakt()` | `1,23 Mio.` – Stufen `Tsd.`, `Mio.`, `Mrd.`, `Bio.`, `Brd.`, `Trio.`, dann `1,2e21`; unter 1000 wie `runden(1)` mit Komma |
| `1234567.kompakt(1)` | `1,2 Mio.` (Nachkommastellen) |
| `x.euro(kompakt: ja)` | `1,23 Mio. €` |

Rundung nach K-048. Bis dahin enthält das Spiel eine eigene Klasse `Format` (gleiches Verhalten), die dann entfallen kann.
Eine eigene Zutat „Zahlanzeige“ ist **nicht** nötig – Formatierung gehört in die Sprache, das Schild zeigt Text.

## 3. `Fortschritt` – Balken (P2)

```pizza
Fortschritt f = neu Fortschritt(wert: 0.25, text: "25 %");   // wert 0…1 (wird geklemmt)
f.setzeWert(0.5); f.wert(); f.setzeText("Hälfte"); f.text();
f.stil("farbe", "basilikum");
```
Protokoll: `{"id":"z9","art":"fortschritt","wert":0.25}` + `text` nur wenn nicht leer. Werte < 0 / > 1 / NaN klemmt der
Renderer auf 0…1 (NaN und Nicht-Zahlen wie `"0.5"` → 0); Vorschlag: Sprache klemmt ebenfalls, `wert()` liefert den
geklemmten Wert. Renderer: `<div role="progressbar" aria-valuenow>` mit Füllung (Themenfarbe über `stil.farbe`, Standard
Tomate) und optionalem Text mittig. Keine Ereignisse.

## 4. `Abschnitt` – Karte mit Überschrift (P2)

```pizza
Abschnitt upgrades = neu Abschnitt("Upgrades", [knopf1, knopf2]);   // wie Stapel, plus Titel
upgrades.setzeTitel("Upgrades (3)"); upgrades.hinzu(k); upgrades.leeren();
```
Protokoll: `{"id":"z5","art":"abschnitt","titel":"Upgrades","kinder":[…]}` (Zustandsfelder `titel`, `kinder`).
Renderer: `<section>` mit `<h3>` und einem Stapel-Inhalt; `stil.abstand` gilt für den Inhalt, `stil.farbe` tönt die Karte.

## 5. `Tabelle` (P2)

```pizza
Tabelle t = neu Tabelle(["Gebäude", "Anzahl", "Pizzen/s"], [["Lehrling", 3, 0.3]]);
t.setzeZeilen(blech); t.zeilen(); t.setzeSpalten(blech);
```
Protokoll: `{"id":"z7","art":"tabelle","spalten":["…"],"zeilen":[["…","…"]]}` – Zellen sind **Texte** (Sprache sendet die
Textform jedes Werts, K-066). Renderer: `<table>` mit `<thead>`; Zahlenspalten rechtsbündig, wenn alle Zellen der Spalte wie
Zahlen aussehen. Keine Ereignisse (Auswahl einer Zeile wäre eine spätere Erweiterung `{"typ":"auswahl","id","wert":n}`).

## 6. `hinweis` – Tooltip an jeder Zutat (P2)

`zutat.hinweis("Backt 1 Pizza pro Sekunde")` / `hinweis()`; Protokoll: allgemeines Feld `hinweis` (Text, nur wenn nicht leer),
Renderer: `title`-Attribut. Wie `sichtbar`/`stil` von der Engine für alle Arten behandelt.

## 7. `Reiter` – Tabs (P3)

```pizza
Reiter r = neu Reiter(["Backstube", "Erfolge"], [backstube, erfolge]);   // Seiten = beliebige Zutaten
r.waehle(2); r.gewaehlt();   // 1-basiert wie Blech.stück
r.beiAenderung((salami n) -> { … });
```
Protokoll: `{"id":"z8","art":"reiter","titel":["Backstube","Erfolge"],"gewaehlt":1,"kinder":[…]}`;
Ereignis `{"typ":"aenderung","id":"z8","wert":2}` (Zustand vor dem Rückruf aktualisiert, wie K-056). Renderer: Leiste aus
Reiter-Knöpfen (`role="tab"`, Pfeiltasten/Home/End), nur die gewählte Seite sichtbar; fehlende Titel → „Seite n“.
Umgesetzt: Ein Klick schaltet sofort lokal um und sendet nur bei echtem Wechsel (Klick auf den gewählten Reiter sendet nichts,
`gewaehlt` vom Programm sendet nie); ungültiges `gewaehlt` → 1, zu große Werte werden auf die Seitenzahl geklemmt; nicht gewählte
Seiten tragen die Klasse `theke-reiter-aus` (nicht `hidden` – das gehört `sichtbar`).

## 8. Laufzeit-Themen für lange laufende Theke-Programme (P1, Klärung)

- **Schrittlimit:** global 5 000 000 Schritte (P0002). Ein Idle-Spiel mit Sekundentakt und ~300 Schritten pro Rückruf
  erreicht das nach ~4,5 Stunden. Vorschlag: Während `bediene()` gilt das Limit **pro Rückruf** (jeder Rückruf startet mit
  frischem Budget; Endlosschleifen im Rückruf werden weiterhin erkannt), die Gesamtzahl bleibt nur informativ.
- **Echtzeit:** `Uhr.jetzt()` ist die simulierte Uhr (1 ms/Schritt) und steht beim Warten still. Für Offline-Fortschritt
  braucht es `Uhr.echt()` → Dauer seit 1970 (Wanduhr), in Tests fest über `optionen.echtzeit` (Startwert, wächst nicht).
  Zusammen mit der geplanten `Vorratskammer` rechnet das Spiel dann „Während du weg warst, wurden 1.234 Pizzen gebacken“.

## 9. Umsetzungsaufträge

**Interpreter (`site/js/pizza.js`, Prüfstand a13):**
1. Klasse `Takt` (§1) inkl. Ereignis `takt` mit `anzahl`, Bündelung `aktiv`/`intervall` über `aendere`.
2. Zahl-Methoden `kompakt(n?)`, `tausender(n?)`, `euro(kompakt: ja)` (§2).
3. Klassen `Fortschritt`, `Abschnitt`, `Tabelle`, `Reiter`; Methode `hinweis` an `Zutat`; Stil `schrift: "riesig"` in die
   Whitelist (Fehlertext-Liste K-068 erweitern).
4. Schrittlimit pro Rückruf während `bediene()` und `Uhr.echt()` (§8) – vorher Klärung K-0xx.

**Compiler/Laufzeit (`laufzeit/`, `site/js/pizzaiolo*`):** dieselben Klassen/Methoden; `Takt` braucht nichts Neues in der
HOST-ABI (Ereignisse kommen über `ui_warte`). `Uhr.echt()` braucht einen Import (z. B. `echtzeit_ms() -> f64`).

**Nativer Host (`host/`):** nichts für Takt (läuft in der WebView). Optional: aufeinanderfolgende `takt`-Ereignisse derselben
`id` im Kanal zusammenfassen (Summe der `anzahl`). Für `Uhr.echt()` den Import bereitstellen.

**UI (`ui/src/ausfuehrung.js`):** optional `takt`-Zusammenfassung in `uiSchlange` (§1 Brücken).

**Klärung/SPEC:** §16 um die Zutaten erweitern; Mindestintervall, Nachholregel (`anzahl`), Schrittlimit pro Rückruf.

## 10. Stand im Spiel (umgesetzt)

`pizza-imperium.pizza` nutzt alles aus §1–§8 direkt (kein Fallback mehr, Nutzerentscheidung F8): `Takt` (1 s, passive Produktion
und Ereignisse in Sekunden), `kompakt()`/`euro(kompakt: ja)`/`tausender()` statt eigener Formatklasse, Zufall-API (`wahr` für
perfekte Pizzen, `wähle` für Ereignisse), `Abschnitt` + `Reiter` (Backstube · Erfolge · Imperium), `Fortschritt` je Upgrade und
für den nächsten Stern, `Tabelle` für Erfolge und Statistik, `hinweis` an Knöpfen, `schrift: "riesig"` für die Kasse,
Vorratskammer + `Uhr.echt()` für Speichern und Offline-Fortschritt (50 %, höchstens 8 h). Der Reiter „Imperium“ wird nur gezeichnet,
wenn er offen ist (große Tabellen-Nachrichten sparen). Tests: Manifest-Feld `echtzeit` (fester Wert), leere Vorratskammer.
