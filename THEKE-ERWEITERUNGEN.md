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
perfekte Pizzen, `wähle` für Ereignisse), `Abschnitt` + `Reiter` (Backstube · Erfolge · Imperium · Geheimnisse · Minispiele), `Fortschritt` je
Upgrade, für den nächsten Stern, die nächste Filiale und das Ziel einer Herausforderung, `Tabelle` für Erfolge, Aufstieg und
Statistik, `hinweis` an Knöpfen, `schrift: "riesig"` für die Kasse, Vorratskammer + `Uhr.echt()` für Speichern und
Offline-Fortschritt (50 %, höchstens 30 min). Die Reiter „Imperium“ und „Geheimnisse“ werden nur gezeichnet, wenn sie offen sind
(große Tabellen-Nachrichten sparen). Tests: Manifest-Feld `echtzeit` (fester Wert), leere Vorratskammer; `.ereignisse` aus einem
echten Lauf (Interpreter, Saat 42) mit Takt-Sprüngen bis zur ersten Franchise.

**Aufstieg (v3, Spielstand `version` 3 – ältere Stände laden mit Standardwerten):**

| Ebene | Freischaltung | Mechanik |
|---|---|---|
| ⭐ Neueröffnung | – | Sterne = ⌊√(Umsatz der Kette / 1 Mio. €)⌋, +10 % auf alles je **aktivem** Stern |
| 📜 Geheimrezepte | 1. Stern | Talentbaum, kostet Sterne (ausgegebene Sterne verlieren ihre +10 %): Holzofen-Glut (1 ⭐, Betrieb +50 %), Sauerteig von 1890 (1 ⭐, Preis +20 %), Stammgäste (2 ⭐, Ereignisse doppelt so oft und doppelt so ergiebig), Nonnas Sparstrumpf (2 ⭐, nach Holzofen: Start mit 10 Lehrlingen + 5 Steinöfen), Nonnas Gedächtnis (3 ⭐, nach Sauerteig: Rezeptbuch bleibt), Lavastein-Ofen (4 ⭐, nach Holzofen: Sonderschicht doppelt so lang, 45 s Abkühlung) |
| 🏅 Herausforderungen | 3 Sterne insgesamt | Neueröffnung unter Auflagen, Ziel = Umsatz der Runde, Belohnung für immer: Neapel-Modus (nur Lehrlinge/Steinöfen, 5 Mio. € → beide ×3), Hawaii-Verbot verschärft (kein Rezeptbuch, Hawaii-Gäste fliegen raus, 1 Mrd. € → Preis +25 %), Fastenzeit (kein Klicken, keine Sonderschicht, keine Ereignisse, 5 Mrd. € → Betrieb +25 %); „Aufgeben“ hebt die Auflagen auf |
| 🏢 Franchise | 25 Sterne in der laufenden Kette | Filialen insgesamt = ⌊√(Sterne insgesamt / 2,5)⌋, +100 % auf alles je Filiale; setzt Sterne, Geheimrezepte und Runde zurück, schaltet die Franchise-Zentrale frei |

Jeder Neustart (Neueröffnung, Herausforderung, Aufgeben, Franchise, Neu anfangen) fragt nach: erster Klick ändert den Knopftext,
der zweite binnen 10 s bestätigt. **Klicken:** Klickwert = (1 + feste Handwerk-Pizzen) × Sterne × Filialen + Anteil (0,05 % je
Kurier/Tarantella/Roboter/Vesuv) der Sekundenproduktion; Handwerk wird je Stück 60 % (fest) bzw. 40 % (Anteil) teurer, der
Betrieb 15 %. Balancing-Bot (Saaten 42/7/99, 5 Klicks/s, kauft immer das teuerste Leistbare): Klickanteil am Umsatz der jeweils
letzten 5 Minuten nach 15 min 12–15 %, nach 30 min 9–14 %, nach 55 min 6–9 % (10 Klicks/s: 18–27 % / 13–15 % / 12–16 %);
nach 60 min aktiv 274–393 Mio. €, nur automatisch 292–364 Mio. €.

**Minispiele (Spielstand `version` 4 – Stände der Version 2/3 laden mit Standardwerten):** Reiter „🎲 Minispiele“ (Nonnas
Spielecke), vier kurze, freiwillige Spiele mit einer **gemeinsamen** Pause von 2 min nach jedem Spiel (läuft auch offline ab); ein
Sieg bringt `portion()` × 8–10 s (Sekundenproduktion bzw. ein Klick, wenn der mehr bringt), eine Niederlage nichts. Es gibt nur
**einen** `Takt`: Während eines Spiels schlägt er per `setzeIntervall` alle 150 bzw. 500 ms, die verstrichenen Millisekunden werden
gesammelt und als ganze Sekunden an den Betrieb weitergegeben (die Backstube backt weiter; Nachholschläge `anzahl > 1` zählen mit).
Bewusst kein zweiter Takt: Zwei gleichzeitig laufende Takte würden beim Vorspulen der E2E-Uhr (und bei jeder Nachholung) zusätzliche
Schläge erzeugen, die nicht in `.ereignisse` stehen. Zufall nur über die globale Saat, keine Animationen (Wasm/EXE gleich).

| Spiel | Ablauf | Sieg |
|---|---|---|
| 🫓 Teig fangen (8 s) | 🫓 pendelt über 21 Felder (`Schild` je Feld, Ziel 3 Felder grün, Lage per `Zufall.zahl`) | „Fangen!“ im Ziel, sonst/nach 12 s verloren |
| 🧾 Bestellung merken (10 s) | 4 Beläge (`Zufall.wähle`) 3 s sichtbar, dann 6 Belag-Knöpfe | richtige Reihenfolge binnen 15 s |
| 🌡 Ofen halten (10 s) | Temperatur driftet je 0,5 s um `Zufall.zahl(-16, 6)`, Knöpfe ±25 °C | ≥ 7 von 10 s in 380–440 °C |
| 🛵 Lieferroute (8 s) | 3 Wege (`Zufall.mische`) mit km, Ampeln, Stau; Fahrzeit 2 min/km + 1/Ampel + 4/Staustufe | schnellster Weg binnen 10 s |

Fastenzeit sperrt die Spielecke (ein laufendes Spiel endet ohne Wertung). Statistik: „Anteil Minispiele am Umsatz“ (Runde · gesamt),
„Minispiele gewonnen“; Erfolge „Nonnas Spielkamerad“ (jedes Spiel einmal gewonnen) und „Stammspieler“ (25 Spiele). Fenster 660 px
breit (fünf Reiter). Balancing-Bot (Saaten 42/7/99, 5 Klicks/s, startet jedes Spiel, sobald die Pause um ist, und gewinnt **immer**;
Obergrenze): Minispiel-Anteil am Umsatz nach 60 min 4,4–4,9 % (je 5-min-Fenster 3,2–5,6 %), mit Aufstieg 3,7–4,7 %;
Klickanteil 7,2–8,4 %. Tests: `.ereignisse` aus echtem Lauf, jedes Spiel einmal
gewonnen und einmal verloren, dazu die gesperrte Spielecke in der Fastenzeit; der Generator wechselt vor jedem Klick in den
Reiter des Ziels und bricht bei unsichtbaren Zielen ab (E2E klickt wie ein Nutzer).
