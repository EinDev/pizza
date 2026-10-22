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
| **P3** | `Meldung` (kurzer Hinweis, verschwindet) | Zutat `meldung` | „Erfolg freigeschaltet!“ | – **abgelehnt (K-112):** Anwendungslogik – Schild + Blech + Takt |

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
| ⭐ Neueröffnung | – | Sterne = ⌊√(Umsatz der Kette / 1 Mio. €)⌋ bis 100, darüber ⌊100 · ⁴√(Umsatz / 10 Mrd. €)⌋ (v5, §11.6), +10 % auf alles je **aktivem** Stern |
| 📜 Geheimrezepte | 1. Stern | Talentbaum, kostet Sterne (ausgegebene Sterne verlieren ihre +10 %): Holzofen-Glut (1 ⭐, Betrieb +50 %), Sauerteig von 1890 (1 ⭐, Preis +20 %), Stammgäste (2 ⭐, Ereignisse doppelt so oft und doppelt so ergiebig), Nonnas Sparstrumpf (2 ⭐, nach Holzofen: Start mit 10 Lehrlingen + 5 Steinöfen), Nonnas Gedächtnis (3 ⭐, nach Sauerteig: Rezeptbuch bleibt), Lavastein-Ofen (4 ⭐, nach Holzofen: Sonderschicht doppelt so lang, 45 s Abkühlung) |
| 🏅 Herausforderungen | 3 Sterne insgesamt | Neueröffnung unter Auflagen, Ziel = Umsatz der Runde, Belohnung für immer: Neapel-Modus (nur Lehrlinge/Steinöfen, 5 Mio. € → beide ×3), Hawaii-Verbot verschärft (kein Rezeptbuch, Hawaii-Gäste fliegen raus, 1 Mrd. € → Preis +25 %), Fastenzeit (kein Klicken, keine Sonderschicht, keine Ereignisse, 5 Mrd. € → Betrieb +25 %); „Aufgeben“ hebt die Auflagen auf |
| 🏢 Franchise | 25 Sterne in der laufenden Kette (v5: 100) | Filialen insgesamt = ⌊√(Sterne insgesamt / 2,5)⌋, +100 % auf alles je Filiale (v5: +200 %, **zusammen** mit den Sternen statt mal); setzt Sterne, Geheimrezepte und Runde zurück, schaltet die Franchise-Zentrale frei |

Jeder Neustart (Neueröffnung, Herausforderung, Aufgeben, Franchise, Neu anfangen) fragt nach: erster Klick ändert den Knopftext,
der zweite binnen 10 s bestätigt. **Klicken:** Klickwert = (1 + feste Handwerk-Pizzen) × Sterne × Filialen + Anteil (0,05 % je
Kurier/Tarantella/Roboter/Vesuv, **höchstens 8 Stück je Upgrade**, Knopf dann „✅ ausgebaut“, ältere Stände werden beim Laden
gekappt) der Sekundenproduktion; Handwerk wird je Stück 60 % (fest) bzw. 40 % (Anteil) teurer, der Betrieb 15 %. Balancing-Bot (Saaten 42/7/99, 5 Klicks/s, kauft immer das teuerste Leistbare): Klickanteil am Umsatz der jeweils
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

## 11. Content-Plan v5 – „Wellen“ (Pizza-Imperium, Plan)

Nutzer: „Wir brauchen mehr von allem. Mehr Content grundsätzlich. Aber immer aufpassen, dass man nie mit zu viel auf einmal
erschlagen wird, es muss immer Zeugs verschwinden und auftauchen.“ – „Geheimrezepte sollten verschwinden, wenn sie gelernt sind,
und stattdessen neue auftauchen.“ – „Wenn das Rezeptbuch gelesen ist, entferne es aus dem UI, damit die nächste Funktion Platz hat.“
– „Füge 10x, 100x und Max-Buttons hinzu beim Kauf.“

### 11.1 Prinzip „Wellen“

1. **Deckel je Bereich:** Jeder Bereich zeigt höchstens eine kleine Zahl **offener** Optionen (Tabelle 11.2). Offen = man kann
   oder könnte bald etwas damit tun. Was dahinter wartet, ist unsichtbar (kein „🔒 ???“-Friedhof) – es **rückt nach**, sobald
   ein Platz frei wird.
2. **Erledigtes verschwindet:** Gelerntes, Geschafftes, Gekauftes (Einmal-Käufe) klappt in **eine** kompakte Zeile
   („✅ Gelernt: 🔥 🫙 🎉“, Hinweis mit den Namen). Ganz erledigte Abschnitte (Rezeptbuch ausgelesen) verschwinden komplett und
   machen Platz für die **nächste Funktion** an derselben Stelle.
3. **Neues taucht mit Bedingung auf:** Alles Neue hat eine Freischalt-Bedingung (Stückzahl, Sterne, Filialen, Siege …) und
   kommt mit `einblenden` (Paket 4) und einer Meldung – nie mehrere Bereiche gleichzeitig.
4. **Fensterbudget:** 660 × 780 px, kein garantiertes Scrollen; die Deckel sorgen dafür, dass die Backstube auch spät ins
   Fenster passt (≈ 14 Zeilen Inhalt).
5. **Technik (nur vorhandene Theke-Zutaten):** Wellen leben **in** Abschnitten (`sichtbar`, `Abschnitt.setzeTitel`,
   `hinzu`/`leeren`, später `uebergang(ja)`). Neue Reiter gibt es nicht dynamisch (Wunsch W1). Was sich in Wellen bewegt, wird
   in `zeichneVoll()` entschieden; jede Zustandsänderung, die eine Welle verschiebt, erhöht `spiel.version`.

### 11.2 Deckel je Bereich

| Bereich | sichtbar offen (höchstens) | Erledigtes | rückt nach / taucht auf |
|---|---|---|---|
| 📖 Rezeptbuch | 1 Knopf (nächste Seite) | ausgelesen → Abschnitt weg | an seine Stelle: 🧀 Feinkost-Händler |
| 🧀 Feinkost-Händler (neu) | 2 Angebote | „✅ Im Lager: 🍅 🧀 …“ | nächstes Angebot, sobald eins gekauft ist |
| 🎓 Meisterbriefe (neu) | 3 (die billigsten erfüllten) | „✅ n Meisterbriefe“ | bei 10/25/50/100 Stück eines Gebäudes |
| 🛠 Handwerk | gekaufte + 1 nächstes (≤ 6) | – | wie bisher |
| 🏭 Betrieb | 6 Plätze: bis 6 Gebäude je eine Zeile, danach die 5 jüngsten + Kopf „Kleinbetriebe“ (v4) | ältere → klappbarer Abschnitt „🧺 Kleinbetriebe: 🧑‍🍳×120 🧱×80 – 2 % der Produktion“ (zu; aufgeklappt mit Kauf-Knöpfen) | neues Gebäude, sobald das vorige gekauft ist |
| 📜 Geheimrezepte | 3 (Voraussetzung erfüllt, nach Kosten) | „✅ Gelernt: …“ | nächstes Glied der Kette |
| 🏅 Herausforderungen | 2 | „✅ Geschafft: 🔥 🍍 🙏“ | zweite Staffel ab der 1. Franchise |
| 🏆 Erfolge | die letzten 8 erreichten + 3 nächste Ziele | Kopf „32 von 55“ | nächste Ziele nach Fortschritt |
| 🎲 Minispiele | 4 Zeilen | – | Meister-Variante **ersetzt** die Grundform nach 3 Siegen |
| 🎉 Ereignisse | 1 laufendes | – | neue Ereignisarten mit Bedingung im Topf |

### 11.3 Pakete (seriell, je ein Commit)

**Paket 1 – Rezeptbuch und Geheimrezepte als Welle** (kein neuer Spielstand-Inhalt)
- Rezeptbuch ausgelesen → `rezeptTeil.sichtbar(nein)`; das Rezept („Margherita mit …“) wandert als `hinweis` an die Kennzahlen.
  Hawaii-Verbot: Abschnitt bleibt mit Schloss sichtbar (vorübergehend, erklärt die Auflage). Mit Nonnas Gedächtnis bleibt er
  nach der Neueröffnung weg; Erfolg „Nonnas Liebling“ unverändert.
- Geheimrezepte: höchstens 3 offene Zeilen (Voraussetzung erfüllt, nicht gelernt; sortiert nach Kosten, dann Reihenfolge);
  gelernte verschwinden in die Zeile „✅ Gelernt: …“. Nach der Franchise (Talente leer) beginnt die Welle von vorn.
- `aus(s, k, ersatz)` → `s.hole(k, ersatz)` (K-095).

**Paket 2 – Kaufmenge 1× · 10× · 100× · Max**
- Ein **Umschalter** über Handwerk/Betrieb (Reihe aus vier Knöpfen `menge-1`, `menge-10`, `menge-100`, `menge-max`; gewählt =
  Farbe `basilikum`), statt vier Knöpfe je Zeile (passt nicht in 130 px, erschlägt). Taucht auf, sobald man von irgendeinem
  Upgrade 10 Stück hat oder einmal neu eröffnet hat (Welle!). Die Wahl gilt für alle Zeilen und wird nicht gespeichert
  (Sitzungs-Komfort).
- Kauf-Knopf (`kauf-<schlüssel>`, unverändert) zeigt **Preis zuerst**: „12,3 Mio. € (×10)“, bei Max „1,2 Mio. € (Max 37)“;
  Summe = Σ der **gerundeten** Einzelpreise `kostenBei(n … n+k−1)` (genau wie Einzelkäufe), Max = größtes k mit Summe ≤ Kasse
  (Schleife, höchstens 1000). Unbezahlbar → deaktiviert (Max 0 zeigt den Preis von einem Stück). Balken = Kasse / Summe.
  `setzeAnzahl` einmal nach dem Kauf; Meldung „🧱 Steinofen ×10 gekauft (jetzt 35).“

**Paket 3 – Content** (Spielstand `version` 5; ältere Stände laden mit Standardwerten; Unter-Pakete einzeln committen)

*3a – Geheimrezepte in fünf Ketten* (bestehende Schlüssel bleiben; Kosten in ⭐, Kette = „braucht“ das vorige Glied)

| Kette | Glieder (Kosten · Wirkung) |
|---|---|
| 🔥 Ofen | Holzofen-Glut (1 · Betrieb +50 %) → Lavastein-Ofen (4 · Sonderschicht ×2, 45 s Abkühlung) → Vesuv-Kamin (7 · Ofen bis 535 °C) → Ewige Glut (11 · Abkühlung 20 s) → Ofenflüsterer (16 · Betrieb +100 %) |
| 🫙 Teig | Sauerteig von 1890 (1 · Preis +20 %) → Nonnas Gedächtnis (3 · Rezeptbuch bleibt) → 72-Stunden-Teig (6 · Preis +30 %) → Mutterhefe aus Neapel (10 · Preis +50 %) → Teig mit Seele (15 · perfekte Pizza ×25 statt ×10) |
| 🎉 Gäste | Stammgäste (2 · Ereignisse ×2) → Mundpropaganda (4 · Großbestellungen immer pünktlich) → Hawaii-Diplomatie (6 · bekehrte Hawaii-Gäste ×3) → Kritikerliebling (9 · Freitagabend 60 s) → Kultstatus (14 · alle Ereignis-Boni ×2) |
| 🧦 Nonna | Nonnas Sparstrumpf (2 · Start mit 10 Lehrlingen + 5 Steinöfen) → Nonnas Erbstück (5 · Start zusätzlich mit 10 Rollern und 1 Filiale in Wuppertal) → Familienbetrieb (8 · offline 75 % statt 50 %, weiter höchstens 30 min) → Nonnas Segen (12 · +12 % statt +10 % je aktivem Stern) |
| 🎲 Spiel | Nonnas Kartenspiel (3 · Minispiel-Pause 90 s) → Glückspilz (6 · perfekte Pizza 3 % statt 2 %) → Spielecken-Abo (10 · Minispiel-Gewinn +50 %) |

22 Rezepte (Summe ≈ 160 ⭐ – mehrere Ketten-Durchläufe, nach jeder Franchise wieder von vorn). Welle: 3 offen.

*3b – 🎓 Meisterbriefe* (Einmal-Käufe gegen €, je Gebäude bei 10/25/50/100 Stück, Wirkung: dieses Gebäude ×1,5; Preis = 8 × Preis
des Stücks Nr. 10/25/50/100). Je Gebäude eigene Namen, z. B. Lehrling: Kochmütze · Gesellenprüfung · Meisterbrief ·
Lehrlingsgewerkschaft; Steinofen: Schamottsteine · Ofenkachel aus Neapel · Pizzaschaufel aus Kirschholz · Ofensegen vom Pfarrer;
Roller: Warmhaltebox · Vespa-Tuning · Navi mit Nonna-Stimme · Blaulicht (inoffiziell); Wuppertal: Schwebebahn-Lieferung ·
Elberfelder Teigwerk · Barmer Margherita · Ehrenbürgerschaft; Teigfabrik: Fließband · Teigroboter · 24/7-Schicht · Mehlsilo
„Nonna I“; Satellit: Hitzeschild · Fallschirm mit Basilikum-Muster · Umlaufbahn über Neapel · Zweiter Satellit (heimlich);
Mond: Mondkäse (endlich echt) · Krater-Ofen · Schwerelos-Teig · Mondbasis „Margherita“; Zentrale: Excel-Tabelle ·
Franchise-Handbuch · Hauptversammlung im Ofen · Börsengang (WKN: PIZZA); neue Gebäude (3c) analog. Welle: 3 offen; Reset bei
Neueröffnung wie Upgrades.

*3c – Gebäude* (Betrieb, je ×13–15 teurer, ×4,3 Wirkung):
- 🚚 Foodtruck (25 Tsd. €, 40/s) zwischen Roller und Wuppertal – „Parkt immer genau vor der Konkurrenz.“
- nach der Franchise-Zentrale (also erst nach der 1. Franchise sichtbar): 🪐 Saturnring-Lieferdienst (35 Mrd. €, 130 Tsd./s,
  „Die Ringe sind aus Parmesan. Behauptet die Werbung.“), 🕳️ Wurmloch-Lieferung (500 Mrd. €, 600 Tsd./s, „Die Pizza kommt an,
  bevor sie bestellt wurde.“), 🌌 Galaktische Pizzakette (7 Bio. €, 2,8 Mio./s), ⏳ Nonnas Zeitmaschine (100 Bio. €, 13 Mio./s,
  „Holt Rezepte aus dem Jahr 1890 – original!“), 🍕 Pizza-Multiversum (1,5 Brd. €, 60 Mio./s, „In jedem Universum ohne Ananas.“).
- Betrieb-Welle: höchstens 6 Gebäudezeilen + Kleinbetriebe-Zeile (§11.2).

*3d – Ereignisse* (Topf wächst mit Bedingungen; keine reinen Strafen):

| Ereignis | ab | Wirkung |
|---|---|---|
| 🧐 Restaurantkritiker | 1 Stern insgesamt | 30 s: jede Pizza bringt doppelt so viel |
| 🌧 Regentag | 10 Roller | 45 s: Betrieb ×2 („Alle bestellen Lieferung“) |
| 🎂 Nonnas Geburtstag | 1. Neueröffnung | sofort Portion × 30, Nonna backt selbst |
| 📱 Food-Influencer | Filiale in Wuppertal | 60 s: Betrieb ×1,5 („#pizzaporn – Nonna versteht es nicht“) |
| 🍍 Ananas-Schmuggler | 3 bekehrte Hawaii-Gäste | Nonna konfisziert 12 Kisten und verkauft sie an die Konkurrenz: Portion × 10 |
| 🎤 Tenor im Lokal | Foodtruck | 20 s: Klicks ×3 („O sole mio!“) |

*3e – Erfolge* (+≈ 30, u. a.): Pizzen 1 Mrd./1 Bio.; Umsatz 1 Mrd./1 Bio.; „Lehrlingsheim“ (100 Lehrlinge), „Hitzewelle“ (100
Steinöfen), „Fuhrpark“ (50 Roller), „Food-Truck-Festival“ (25 Foodtrucks); „Feinschmecker“ (alles beim Feinkost-Händler);
„Meisterhaft“ (10 Meisterbriefe); „Nonnas Erbe“ (10 Geheimrezepte); „Kritikerliebling“ (3 Kritiker), „Regenmacher“;
„Kaufrausch“ (100 auf einmal), „Alles muss raus“ (Max kauft ≥ 50); „Nachteule“ (Offline-Bonus erhalten); „Doppelt hält besser“
(2 Franchises), „Galaxie“ (Galaktische Pizzakette); Minispiel-Meister je Spiel; je ein Erfolg für die zweite
Herausforderungs-Staffel; versteckter Humor: „Hawaii? Nein danke.“ (50 bekehrte Gäste), „Ich hab nur kurz geklickt“ (10.000 Klicks).

*3f – Herausforderungen, zweite Staffel* (ab 1. Franchise; Welle: 2 offen):
- 💸 Inflation – alle Upgrades kosten das Dreifache; Ziel 20 Mrd. € → Upgrades für immer 10 % billiger.
- 🤏 Mini-Küche – höchstens 25 Stück je Gebäude; Ziel 50 Mrd. € → Betrieb für immer +50 %.
- 🏖 Nonna im Urlaub – Geheimrezepte wirken nicht; Ziel 100 Mrd. € → Geheimrezepte kosten für immer 1 ⭐ weniger (mindestens 1).

*3g – Minispiel-Varianten* (Meister-Variante ersetzt nach 3 Siegen die Grundform, Gewinn 12–14 s):
🫓 Pizzaiolo-Wurf (Ziel 2 Felder, Schlag 120 ms) · 🧾 Großfamilie (6 Beläge, 4 s merken) · 🌡 Lavastein-Ofen (Ziel 400–430 °C,
stärkere Drift) · 🛵 Rushhour (4 Wege).

*3h – 🧀 Feinkost-Händler* (nimmt den Platz des ausgelesenen Rezeptbuchs; Einmal-Käufe, Reset bei Neueröffnung): San-Marzano-
Tomaten (+15 % Preis), Mehl Tipo 00 (+15 %), Büffelmozzarella aus Kampanien (+20 %), Olivenöl extra vergine (+10 %), Basilikum
aus Genua (+10 %), Meersalz aus Trapani (+5 %, „Nonna sagt: das schmeckt man“), weißer Trüffel aus Alba (+50 %); ab 300 Mrd. €,
je ×6. Welle: 2 offen.

*Reihenfolge in Paket 3:* 3a → 3c → 3b → 3d → 3e → 3f → 3g → 3h (Wirkung zuerst, Feinkost zuletzt – sie braucht das späte Spiel).
*Ausblick (nicht in dieser Runde):* eine fünfte Ebene „🌍 Pizza-Weltmeisterschaft“ nach mehreren Franchises.

**Paket 4 – Animationen (U-59, sparsam):** `huepfen` am Backen-Knopf beim Klick, `schwebe("+n")` über dem Backen-Knopf,
`funkeln` an der Meldung beim Glückstreffer, `aufpoppen` an der Meldung bei Erfolgen, `einblenden` für neu auftauchende Zeilen
(Wellen), `puls` an der Kasse bei großen Einnahmen (Sonderschicht, Großbestellung, Minispiel-Sieg). Wasm fällt dafür bewusst auf
den Interpreter zurück.

### 11.4 Abnahme je Paket

`npm test`, `node pruefstand/run.js`, `npm run test:differenz`, E2E 05/07 (Szenario klickt nur sichtbare Zutaten im aktiven
Reiter), `.ereignisse` aus echtem Lauf (Interpreter, Saat 42, Vorrat leer) mit den neuen Inhalten, Balancing-Bot (Klickanteil
klein; **Deckelprüfung:** der Bot zählt je Takt die sichtbaren offenen Zeilen je Bereich und meldet Verstöße gegen §11.2),
alte Spielstände (v2–v4) laden, Sichtprüfung in Chrome hell/dunkel.

### 11.5 Wünsche an Theke/Sprache – entschieden als Theke v4 (K-107 … K-113, SPEC §16.7)

| Nr. | Wunsch | Wozu | Umweg bisher | Entscheidung |
|---|---|---|---|---|
| W1 | `Reiter`: Seiten ein-/ausblenden und Titel ändern (`setzeTitel(n, t)`, `seiteSichtbar(n, d)`) | Reiter erst zeigen, wenn die Ebene offen ist; Kennzeichen „•“ für Neues | gesperrte Reiter zeigen einen Schloss-Text | **K-107:** `setzeTitel(n, t)`, `titel(n)`; Seite ausblenden = `seite.sichtbar(nein)` (kein eigenes `seiteSichtbar`) |
| W2 | Einklappbarer `Abschnitt` (`zu(d)`, Ereignis beim Auf-/Zuklappen) | „Erledigt“- und Kleinbetriebe-Zeilen | Knopf „▸ zeigen“ + `sichtbar` | **K-108:** `klappbar(d)`, `zu(d)`, `beiAenderung(fn)` → `fn(zu)` |
| W3 | Umschalter/Segment-Auswahl (`Auswahl(["1×","10×","100×","Max"])`) | Kaufmenge | vier Knöpfe, gewählter eingefärbt | **K-109:** Zutat `Auswahl(optionen, gewaehlt: 1)` |
| W4 | Tastatur-Ereignisse (Leertaste, Ziffern) | Minispiele „Fangen!“ ohne Maus | nur Klicks | **K-110:** unsichtbare Zutat `Tastatur(beiTaste)` → `fn("Leertaste")`, Ereignis `taste` in `.ereignisse` |
| W5 | `Mathe.log` | Max-Kauf in geschlossener Form statt Schleife | Schleife (≤ 1000) | **K-111:** `log`, `log10`, `log2`, `exp`, `E` |
| W6 | `Meldung`/Toast mit Warteschlange (Idee aus der Übersicht) | mehrere Neuigkeiten kurz hintereinander | eine Meldungszeile, letzte gewinnt | **K-112: abgelehnt** – Schild + Blech als Schlange + Takt (Doku-Muster) |
| W7 | Feste Höhe ohne Umbruch-Sprung für `Schild` (z. B. `stil("zeilen", 2)` mit Auslassungszeichen) bzw. Mindestbreite für Knöpfe | ruhiges UI: Texte wachsen, Knöpfe bleiben stehen | `stil("hoehe", …)` – längerer Text läuft über | **K-113:** Stile `zeilen` (ganze Zahl ≥ 1) und `mindestbreite` (px) |

### 11.6 Stand (umgesetzt, Spielstand `version` 5)

| Paket | Inhalt | Commit |
|---|---|---|
| 1 | Rezeptbuch verschwindet nach dem Lesen; Geheimrezepte als Welle (3 offen, „✅ Gelernt“) | 7bdb8cd |
| 2 | Kaufmenge 1×/10×/100×/Max (Umschalter, Summe der gerundeten Einzelpreise) | 625a02f |
| 3a–3h | 22 Geheimrezepte in 5 Ketten · 6 Gebäude (Foodtruck, Saturnring … Multiversum) + Kleinbetriebe-Welle · 56 Meisterbriefe · 6 Ereignisse mit Bedingung · ≈ 30 Erfolge als Welle · 2. Herausforderungs-Staffel (Inflation, Mini-Küche, Nonna im Urlaub) · Meister-Minispiele · Feinkost-Händler | e11da79 … 2f14048 |
| Kurve | Sterne über 100 mit vierter Wurzel, Sterne + Filialen additiv, Kette ab 100 Sternen, Geheimrezepte je gelerntem +40 % | a760ede |
| ruhiges UI | feste Höhen/Breiten, Betrieb über Handwerk, feste Plätze für Geheimrezepte/Meisterbriefe/Feinkost | 10c3906 |
| 10 fps | Takt 100 ms, Produktion anteilig, Uhren in ganzen Sekunden, Speichern nach Spielzeit | 45791eb |
| Namensraum | Kammer `pizza-imperium/spielstand` (K-106), alte Stände werden übernommen | e8dcf3e |
| 4 | Animationen: hüpfen/schweben am Backen-Knopf, funkeln/aufpoppen an der Meldung, puls an der Kasse, einblenden für Neues | 43dd57b |
| v4 | Theke v4 im Spiel: Kaufmenge als `Auswahl`; Kleinbetriebe (echte Gebäudezeilen), „✅ Gelernt“, „✅ Geschafft“ als klappbare Abschnitte (zu); Reiter „Geheimnisse“ erst ab 1 ⭐ (`sichtbar`), Titel „📜 Geheimnisse (n)“ (lernbare Rezepte) und „⭐ Imperium •“ (Sterne/Filialen warten); Herausforderungen erst ab 3 ⭐; `zeilen` statt fester Höhen (Kennzahlen 2, Meldung 3, Zeilen 2, Geheimrezept-Plätze 3); `Tastatur`: Leertaste backt (nie schneller als Klicken), Minispiele mit Leertaste/1–6/↑↓/1–4. Kein `Mathe.log` (Summe gerundeter Einzelpreise hat keine geschlossene Form) | 54b71f5 |

Balancing-Bot (Saat 42, 5 Klicks/s, Aufstieg: Neueröffnung bei Verdopplung, Kette ab 5 neuen Filialen): Sterne insgesamt
nach 2 h 40 · 3 h 441 · 4 h 1.500 · 5 h 3.600 · 6 h 8.600 · 8 h 20.000 · 11,5 h 47.000 (vorher: 10.000 nach 4,5 h, Millionen danach);
erste Kette nach ≈ 2,5 h (vorher ≈ 1,3 h); Pizza-Multiversum in 12 h nicht erreicht. Klickanteil gesamt 6–8 % ohne, 11–13 % mit
Aufstieg (12 h: 17–18 %) – siehe „Klick-Deckel“ unten. Ruhiges UI: von 66 Käufen aus dem Testlauf verschieben nur noch 7 Knöpfe (neue Gebäudeart/Kleinbetriebe), vorher 21 von 44.
**Klick-Deckel** (Nutzer: Klicken soll weniger attraktiv sein als Automatik, Ziel < 10 % auch mit Aufstieg bei 5 Klicks/s):
Ursache war der Anteil-Klick – die Anteil-Upgrades haben feste €-Preise (×1,4 je Stück), das Einkommen wächst mit Sternen und
Filialen um viele Größenordnungen, also kaufte man spät 60–70 Stück (3–3,5 % der Sekundenproduktion je Klick, ×5 Klicks/s). Ein
steilerer Preis verschiebt das nur (Stückzahl ~ log Einkommen), daher der Deckel: 8 Stück je Anteil-Upgrade (höchstens 1,6 % je
Klick). Bot (5 Klicks/s, Minispiele an, Saaten 42/7/99):

| Lauf | vorher | mit Deckel |
|---|---|---|
| ohne Aufstieg, 60 min: Klickanteil · Umsatz | 6,1 / 6,5 / 7,2 % · 753 / 645 / 648 Mio. € | 4,9 / 5,2 / 5,7 % · 751 / 656 / 717 Mio. € |
| Aufstieg, 6 h: Klickanteil gesamt | 15,2 / 13,6 / 14,2 % | 3,4 / 3,7 / 3,6 % |
| Aufstieg, 12 h: Klickanteil gesamt | 17,5 / 17,2 / 17,0 % | 3,5 / 3,6 / 3,7 % |
| Aufstieg, 12 h: 5-min-Fenster ≥ 10 % (ab min 15) | 98 / 101 / 99 von 141 | 3 / 1 / 1 (Ereignisse kurz nach Neustarts) |
| Sterne 3 h · 4 h · 6 h · 8 h (Saat 42) | 441 · 1.690 · 10.063 · 23.844 | 451 · 1.530 · 9.863 · 23.582 |
| Sterne nach 12 h | 58.735 / 59.724 / 58.806 | 57.105 / 56.858 / 58.836 |
| erste Kette | 134 / 131 / 133 min | 138 / 131 / 126 min |

CPU im Playground bei 10 Takten/s: ≈ 10 % eines Kerns. Extremstand (3·10⁷ Sterne, 9·10²¹ €, 150 Filialen): keine Ananas, Interpreter = Wasm.

## 12. Struktur-Redesign – statisches Raster und Breite (Pizza-Imperium v6, Plan)

Nutzer: „Schau dir an, wie die meisten Idle-Games strukturiert sind. Füge mehr Content hinzu – viel mehr, aber nicht in der Tiefe,
sondern in der Breite. Das UI soll sich nicht ständig verändern: größtenteils statisch, man kauft Upgrades, mit denen man neue
Spielbereiche freischaltet. Sonst bleibt die Struktur (Positionen der Knöpfe etc.) immer exakt gleich.“

**Zwei verbindliche Regeln (Nutzer, wörtlich):**

> R1 „Wenn man einen neuen Bereich freischaltet, dürfen alte verschwinden und sich damit das Layout ändern. Das darf aber nur
> passieren, wenn der User einen Knopf klickt. Dann erwartet der User es.“
> → Layoutänderungen (Bereich erscheint, alter Bereich verschwindet/wird ersetzt, Umordnung) **ausschließlich als direkte Folge
> eines Nutzerklicks** (Freischalt-Upgrade kaufen, Aufstieg auslösen, Herausforderung starten/aufgeben, Neu anfangen). **Nie**
> durch Takt, Zeit, Geld-Schwellen, Ereignisse oder Offline-Nachholen. Ein Bereich, der „bereit“ ist, zeigt das höchstens über
> Text/Farbe/Zähler seines festen Platzhalters.

> R2 „Ein Upgrade, was alte Funktionen abschaltet, darf nie zum Nachteil des Users sein. Es darf nur vorherige Schritte unnötig
> machen oder automatisieren.“
> → Blendet ein Freischalt-Upgrade etwas aus, wirkt alles, was es bot, weiter – automatisch oder überflüssig. Kein Verlust an
> Produktion, Boni, Fortschritt oder nötigen Wahlmöglichkeiten. Je Ersetzung belegt der Bot: Ertrag **mit** Upgrade ≥ Ertrag
> **ohne** (gleiche Saat, gleiche Dauer; „realistisch“ = Bot-Obergrenze, z. B. Minispiele immer gewonnen).

Weitere Vorgaben: event-getriebene Oberfläche (Zustand ändert sich nur in Rückrufen – Klick, Auswahl, Taste, Takt für die
Simulation; aktualisiert werden nur Zutaten, deren Daten sich geändert haben; kein `zeichne()`, das je Takt alles neu setzt –
Anbindung an die kommende reaktive Theke-API, bis dahin gekapselt je Panel, §12.6). Rückwärtskompatibilität der Spielstände ist
**nicht** nötig: ein Stand mit fremder `version` wird verworfen (Neustart, keine Ananas). Klickanteil < 10 %, Abwesenheit
höchstens 30 min (50 %), Browser = EXE, 10 Takte/s.

**§11.1 „Wellen“ ist damit abgelöst:** Erledigtes verschwindet nicht mehr und Neues taucht nicht mehr von selbst auf – **Slots
bleiben, nur ihr Inhalt wechselt**, und auch das nur nach einem Klick (R1).

### 12.1 Recherche – wie Idle-Games strukturiert sind

Websuche (Oktober 2026); Fandom-Wikis waren nur über Suchausschnitte erreichbar, direkt gelesen: wiki.gg (Cookie Clicker,
Antimatter Dimensions), Kittens-Game-Wiki und -Quellcode, Melvor-Wiki, Wikipedia, Steam, Game Developer (Pecorella), Entwickler-Blogs.

| Spiel | Layout / Freischaltung | Breite · Prestige | Quelle |
|---|---|---|---|
| Cookie Clicker | Store rechts, 20 Gebäude in fester Preisreihenfolge; Gebäude sind anfangs versteckt und „erscheinen, sobald verfügbar“ (rein kosmetisch); 4 Minispiele (Garden, Pantheon, Grimoire, Stock Market) hängen als Panel am Gebäude („View …“), freigeschaltet über Gebäude-Level mit Sugar Lumps (ab 1 Mrd. Keksen) | 1 Prestige-Ebene (Ascension, Kubikwurzel aus Lifetime-Keksen, +1 % je Level), heavenly upgrades dauerhaft, „permanent upgrade slots“ | cookieclicker.wiki.gg/wiki/Ascension · …/Minigames |
| AdVenture Capitalist | eine lineare Geschäftsliste; Manager automatisieren („run automatically … even offline“), gehen beim Reset verloren (Steam-Post 2015); parallele Welten Erde/Mond/Mars | 1 Ebene (Angel Investors, +2 % je Angel), Kostenwachstum 1,07 je Kauf | de.wikipedia AdVenture Capitalist · gamedeveloper.com „Math of Idle Games I/III“ |
| Antimatter Dimensions | feste Tableiste, je Prestige-Schicht erscheint ein **neuer Tab mit Subtabs** (Infinity 3, Eternity, Reality – als Vorschau schon vor dem ersten Reset), alte Tabs bleiben; Autobuyer bei festen Schwellen (1e40 … 1e140), Challenges machen sie schneller (×0,6), Eternity-Milestones schalten Voll-Automatik frei | 3 Hauptschichten + Celestials; jede Schicht resettet alles darunter, behält Achievements/Statistik | antimatterdimensions.wiki.gg/wiki/Infinity · …/Autobuyers · …/Reality |
| Kittens Game | feste Tableiste (~12 Tabs), jeder Tab an ein Gebäude/eine Tech gebunden (Code: hut → village, library → science, workshop, rocketry → space …); Gebäude werden sichtbar, sobald **30 % jedes Preises** vorrätig sind (`unlockRatio 0.3`) – sichtbar, bevor bezahlbar | 30+ Gebäude, 50+ Ressourcen, ~200 Techs, Religion/Metaphysik/Zeit/Handel als eigene Systeme; Reset ab 70 Kätzchen → Paragon/Karma, Chronospheres retten 1,5 % je Stück | github nuclear-unicorn/kittensgame buildings.js · wiki.kittensgame.com/en/game-tabs |
| Realm Grinder | 12 Fraktionen, Trophäen je 100 Gebäude, Research später; Auto-Cast ab 60 000 Mana **halbiert** Mana/s – belegter Gegenfall zu „Automatik immer Vorteil“ | 3 Schichten (Abdication → Reincarnation → Ascension); Trophäen überleben alles | pcgamer.com/realm-grinder-guide · store.steampowered.com/app/610080 |
| Idle Miner Tycoon | je Mine feste Säule Schächte/Aufzug/Lager, neue Schächte hinter „Barrieren“ (Zeit/Werbung/Super Cash); Manager automatisieren, erst dann Offline-Cash; Kontinente mit je 5 Minen | Prestige je Mine (kompletter Reset, dauerhafter Bonus), nur Super-Manager bleiben | idleminertycoon.fandom.com/wiki/Prestige · bluestacks.com IMT-Guide |
| NGU Idle | Features schalten per **Boss-Nummer** frei (4 Inventar, 17 Augmentation, 30 Time Machine, 37 Blood Magic, 58 Challenges); fast jeder Titan droppt ein Feature-Unlock | 3 Schwierigkeiten als wiederholte Leiter; Rebirth | sayolove.github.io/ngu-guide · store.steampowered.com/app/1147690 |
| Melvor Idle | feste Skill-Seitenleiste (29 Skills), alles über Skill-Level/Mastery; Township „progresses passively in the background“; Auto Eat (Shop) macht Kampf idle-fähig | **kein Prestige** – Breite statt Reset-Tiefe | wiki.melvoridle.com/w/Skills · Steam-Forum 1267910 |
| Universal Paperclips | 3 Stages, die UI **wechselt** je Stage (Stage-1-Elemente werden nutzlos, Ende: nur noch ein Knopf); Projekte nach Ops-Schwellen; erster AutoClipper → „you can leave the game alone“ | kein Prestige, Neustart mit Bonus am Ende | en.wikipedia Universal Paperclips · revk.uk 2018 |
| Trimps | Bereiche Resources/Structures/Jobs/Upgrades/Equipment/Combat/Maps; Jobs schalten per Zone frei; Automatik als **permanente Upgrades** (AutoStorage Z20+, AutoJobs Z140, AutoUpgrade Z250, AutoPrestige per Challenge) | Portal nach Z20 (alles weg außer Helium + Perks), Universe 2 ~Z700 | trimps.github.io/updates.html · trimps.fandom.com/wiki/Portal |

**Synthese** (Design-Konsequenz für Pizza-Imperium in Klammern):
1. Feste Tab-/Panel-Struktur, die **wächst, statt zu wandern** – neue Schichten hängen ganze Tabs an, alte bleiben (AD, Kittens,
   Melvor); nur Paperclips tauscht die UI aus, und das ist ein Spiel mit Ende. (→ 8 feste Reiter, Panels als Platzhalter von Anfang an.)
2. Neue Bereiche kommen als **ganze Panels/Tabs**, nicht als eingeschobene Zeilen (CC-Minispiele am Gebäude, AD-Subtabs gebündelt).
3. Sichtbar-aber-gesperrt ist üblich: Kittens zeigt Gebäude ab 30 % des Preises, AD den Reality-Tab als Vorschau, IMT Barrieren;
   ein explizites „???“ ist nirgends belegt. (→ Platzhalter mit Teaser, Preis erst nach dem Vorgänger der Kette.)
4. Freischaltung meist **Schwelle oder Kauf/Tech**, selten Zeit (Kittens-Tabs per Gebäude, AD Reality-Study, Melvor Auto Eat, NGU
   Boss-Nummern). (→ Kauf gegen €, R1: nur per Klick.)
5. Typische Breite am Ende: **10–15 parallele Bereiche** (Kittens ~12 Tabs, AD 5 Gruppen × 3–8 Subtabs, CC 20 Gebäude + 4
   Minispiele, Melvor 29 Skills). (→ 12 neue Bereiche + 6 bestehende.)
6. Prestige: 1 Schicht früh, höchstens 3 Hauptschichten; jede resettet alles darunter, behält Statistik, Achievements, Meta-Währung;
   Teil-Erhalt als eigenes Upgrade (CC-Slots, Chronospheres). (→ bleibt: Sterne → Geheimrezepte → Herausforderungen → Franchise.)
7. Prestige-Währung aus Lifetime-Ertrag mit Wurzel-Dämpfung (CC Kubikwurzel, Realm Grinder ≈ 4× je Verdopplung). (→ √ bzw. ⁴√ wie heute.)
8. Pacing (Praktikerregeln, keine Playtests): erstes Upgrade < 60 s, erste Automatik ≈ 3 min, Phasenwechsel alle 3–5 min, erster
   Prestige 15–20 min; „show the next 2–3 upgrades, not all 20“; Browser-Idler sind deutlich langsamer (CC-Ascension Tage).
   (→ Freischaltungen 4 / 10 / 18 / 30 / 45 / 65 / 100 / 150 / 180 / 210 / 240 / 270 min; Kette zeigt nur den nächsten Preis.)
9. Erschlagen vermeiden durch **Gating an Bestehendes**: Neues kommt nach einem Meilenstein im vorhandenen System, nie parallel.
10. **Automatisierung ist das Standard-Belohnungsmuster** („click, auto, multi-produce, then prestige“): permanent (Trimps, AD-
    Milestones, Melvor Auto Eat) oder je Run neu (AdCap/IMT-Manager); sie bleibt Vorteil und wird verfeinert, nicht ersetzt; Ausnahme
    mit Kosten: Realm-Grinder-Auto-Cast. (→ Helfer dauerhaft, R2: nie schlechter als Hand.)
11. Offline-Fortschritt gehört zur Automatik (AdCap/IMT-Manager koppeln Offline-Cash daran). (→ bleibt 50 %, höchstens 30 min.)
12. Breite ohne Tiefe braucht **Hintergrund-Systeme**, die von selbst laufen (Melvor Township, Kittens). (→ Weinkeller, Rezeptlabor,
    Wettbewerb, Katze laufen im Takt mit.)

Synthese-Quellen: gamedeveloper.com „The Math of Idle Games I–III“ (Pecorella) · dev.to „I built 7 idle games in 30 days“ ·
dev.to „Designing the economy of Doomscroll 2077“ · funovus.com „Gold and Goblins“ · en.wikipedia „Incremental game“.
Nicht belegt: „???“-Platzhalter in einem der Spiele, Stunden bis zur ersten AD-Infinity, Gesamtzahl der NGU-Menüs.

### 12.2 Das Raster

Fenster **860 × 800** (vorher 660 × 780): Die Reiterleiste scrollt bei Überbreite statt umzubrechen (`overflow-x: auto`,
gemessen: 5 Reiter 611 px, 8 Reiter 793 px) – mit 860 px passen acht feste Reiter, und Panels stehen **zweispaltig**
(Breite = Breite in Idle-Games: nebeneinander statt untereinander). Playground-Vorschau zentriert und begrenzt auf den Viewport,
EXE übernimmt `breite`/`hoehe`.
**Theke v6 (K-120 … K-124, SPEC §16.9)** liefert dafür: Innenbreite immer `breite − 40` = 820 px (mit und ohne Rollbalken), Stil
`senkrecht` (`oben`/`strecken`) an der Spalten-Reihe, `zeilen` an Abschnitt-Titeln und Tabellenzellen, `marke` an einer Reiter-Seite (Badge
über dem Tab, verschiebt nichts – z. B. „⭐ 3“) und eine Playground-Vorschau, die bei jedem Lauf 860 × 800 übernimmt. Die Reiterleiste ist
dafür oben 7 px höher.

```
┌ Kopf (fest, immer) ────────────────────────────────────────────────────────┐
│ Kasse (riesig)                                                             │
│ Kennzahlen (2 Zeilen) · Modus-/Hinweiszeile (1 Zeile, immer da, ggf. leer) │
│ [ 🍕 Pizza backen! 400×64 ] [ 🔥 Sonderschicht 400×64 ]                    │
│ Meldung (3 Zeilen)                                                         │
├ Reiter (8, feste Titel ohne Zähler) ───────────────────────────────────────┤
│ 🍕 Backstube · 🌱 Hof · 🏙 Stadt · 🔬 Labor · ⭐ Imperium · 📜 Nonna · 🎲 Spiele · 🏆 Erfolge
├ Seite: 2 Spalten × 412 px, Panels (Abschnitte) mit fester Zeilenzahl ──────┤
│ ┌ Panel A ───────────┐ ┌ Panel B ───────────┐                              │
│ │ Zeile 1  [Knopf]   │ │ Zeile 1  [Knopf]   │   Zeile = Schild (breite 240,│
│ │ Zeile 2  [Knopf]   │ │ Zeile 2  [Knopf]   │   zeilen 2) + Knopf (130)    │
│ │ …                  │ │ …                  │                              │
│ └────────────────────┘ └────────────────────┘                              │
└────────────────────────────────────────────────────────────────────────────┘
```

Grundsätze:
1. **Jede Zutat existiert von Anfang an** und behält ihre ID, Größe und Position. Kein `hinzu`/`leeren` zur Laufzeit, kein
   `sichtbar(nein)` an Zeilen oder Panels. Was es (noch) nicht gibt, ist ein **Platzhalter gleicher Größe**: 🔒-Text und
   ein inaktiver oder ein Freischalt-Knopf.
2. **Feste Zeilenzahl je Panel** (`zeilen` an Schildern, `breite`/`mindestbreite` an Knöpfen, `hoehe` an Reihen): Texte wechseln,
   Höhen nie. Tabellen haben eine feste Zeilenzahl (mit „—“ aufgefüllt).
3. **Reiter-Titel fest** (ein Zähler ändert die Tab-Breite und schiebt die Nachbarn): Hinweise stehen im Panel-Kopf, in der
   Kennzahlen-Zeile („⭐ 3 warten“) oder in der Meldung.
4. **Knöpfe mit fester Breite überall** – auch Neueröffnung, Franchise, Aufgeben, Neu anfangen, Rezeptbuch (Rückfragetexte
   „Wirklich? Nochmal klicken!“ laufen in der festen Breite um, `zeilen 1` mit „…“).
5. **Spalten**: Zwei `Stapel` zu je 412 px in einer `Reihe` (abstand 12). Panels einer Seite sind gleich hoch (gleiche
   Zeilenzahl), damit die Reihen bündig bleiben.
6. **Freischaltung = Klick im Platzhalter**: Jedes neue Panel ist anfangs „🔒 Name – Freischalten · Preis“; der Klick auf den
   Preis-Knopf kauft, und **im selben Rückruf** wechselt das Panel auf seinen Inhalt (R1). Gesperrte Panels zeigen den Preis erst,
   wenn der Vorgänger der Kette frei ist („🔒 Noch verschlossen – zuerst: 🍷 Weinkeller“) – so wird niemand von zwölf Preisen
   erschlagen. Platzhalter und Inhalt sind **dieselben** Zutaten (Schilder/Knöpfe der Zeilen), nur mit anderem Text/Zustand –
   darum springt nichts, wenn der Inhalt kommt.
7. **Kein Ereignis (Takt, Zufall, Offline) ändert das Layout.** Beispiele, die heute dagegen verstoßen und in Paket 1 auf feste
   Slots kommen: `modusInfo.sichtbar` (Herausforderung endet im Takt), `laufend`/`geschafftTeil`/`gelerntTeil`/`probeTeil`,
   die Herausforderungs-Welle (2 offen), der Tausch Rezeptbuch ↔ Feinkost (Hawaii-Ende), `spielfeld.sichtbar` (Ofen halten endet
   im Takt), Meister-Variante ersetzt Grundspiel (Ofen-Sieg ist ein Takt), Erfolge-Tabelle mit 3…13 Zeilen, Betrieb-Zeilen
   `zeigeWenn`, Kleinbetriebe-Umordnung, Kaufmenge-Reihe erscheint, `briefTeil`/`feinkostTeil` erscheinen.

### 12.3 Bereiche (Breite) – Liste, Reihenfolge, Pacing

Alle neuen Bereiche sind **flach**: eine kleine eigene Ressource oder ein eigener Faktor auf den Kern, 3–4 feste Zeilen, keine
Ketten über Bereiche hinweg. Freischaltungen sind **dauerhaft** (überleben Neueröffnung und Franchise – sonst sortiert jedes
Prestige das Layout neu). Käufe *innerhalb* eines Bereichs (Stückzahlen, Stufen) werden bei jeder Neueröffnung wie Upgrades
zurückgesetzt, Sammlungen (Pokale, Sticker, Forschung, Treueherzen, Helfer) bleiben. Preise der Freischaltungen aus der
Bot-Kurve (Saat 42, 5 Klicks/s, ohne Aufstieg; Umsatz insgesamt: 5 min 1,25 Mio · 10 min 6,8 Mio · 15 min 22 Mio · 30 min
166 Mio · 45 min 393 Mio · 60 min 700 Mio · 90 min 1,75 Mrd · 120 min 3,5 Mrd · 180 min 8,3 Mrd · 240 min 16 Mrd; mit Aufstieg
ab 150 min deutlich schneller: 180 min 213 Mrd · 240 min 9,3 Bio · 360 min 870 Bio) – Ziel: Freischaltung ≈ 10–15 % des
kumulierten Umsatzes zum Zielzeitpunkt, also alle 10–40 Minuten ein neuer Bereich in den ersten vier Stunden.

**Nachjustiert nach Paket 2c** (Bot gibt laufend aus, das Geld „liegt nicht herum“; nach der ersten Franchise ≈ 150 min wird alles
billig → Ballung): frühe Kette billiger (Personal 3 Mio, Lieferzonen 12 Mio, Helfer 30 Mio, Marketing 60 Mio, Labor 200 Mio), späte
teurer (Katze 30 Mrd, Wettbewerb 150 Mrd, Album 700 Mrd, Banca 2 Bio) – Ziel ≈ 15 min Abstand auch nach der Franchise. Umsetzung in Paket 3,
Messung je Paket.

| # | Bereich (Reiter) | Preis | ≈ Zeit | Mechanik (flach) | Wirkung auf den Kern |
|---|---|---|---|---|---|
| 1 | 🍅 **Zutaten-Garten** (Hof) | 150 Tsd. € | 4 min | 3 Beete (Tomaten, Basilikum, Oregano) als Stückkäufe (×1,5 je Stück), 4. Zeile: Ernte-Übersicht | jedes Beet +1 % / +2 % / +3 % Preis je Pizza (Stück), höchstens 50 Stück je Beet |
| 2 | 🍷 **Weinkeller** (Hof) | 1 Mio. € | 10 min | 4 Getränke (Acqua frizzante, Limonata, Chianti, Espresso) als Stückkäufe; eigene Ressource **Getränkeumsatz** in €/s, unabhängig von Pizzen | Nebeneinkommen: je Getränk €/s = 2 % · 6 % · 15 % · 25 % der Pizzaproduktion je 10 Stück (skaliert mit dem Betrieb, bleibt relevant) |
| 3 | 👩‍🍳 **Personal** (Hof) | 3 Mio. € | ≈ 25 min | 4 Rollen mit Stufe 1…10 (Knopf „Befördern“): Kellner Luigi, Spülkraft Rosa, Buchhalter Enzo, Türsteher Bruno | Luigi: Trinkgeld +1 je Stufe (Großbestellungen pünktlicher) · Rosa: Ofen kühlt 5 % je Stufe schneller · Enzo: Upgrades 1 % je Stufe billiger · Bruno: Hawaii-Gäste-Bonus +20 % je Stufe |
| 4 | 🛵 **Lieferzonen** (Stadt) | 12 Mio. € | ≈ 35 min | 6 Stadtviertel als Einmal-Käufe (Altstadt, Hafen, Uni-Viertel, Bahnhof, Villenviertel, Industriegebiet – „Dort bestellt man Pizza zum Frühstück“) | je Viertel Betrieb +8 % (Einmal, ×4 je Viertel teurer) |
| 5 | 🤖 **Nonnas Helfer** (Labor) | 30 Mio. € | ≈ 50 min | 4 Einmal-Käufe (Automatisierung, R2): Ofenwächter Pino (zündet die Sonderschicht, sobald der Ofen bereit ist), Vorleser Carlo (liest die nächste Rezeptseite, sobald sie bezahlbar ist), Spielpartnerin Nonna (gewinnt jedes Minispiel selbst, 60 s nach Ende der Pause, falls niemand spielt – manuelles Spielen bleibt möglich und bringt dasselbe), Wettbewerbs-Scout (nimmt automatisch am Wettbewerb teil) | ersetzt Klicks, nie weniger Ertrag (Bot: mit/ohne); Preise 60 Mio · 300 Mio · 2 Mrd · 50 Mrd |
| 6 | 📣 **Marketing** (Stadt) | 60 Mio. € | ≈ 75 min | 4 Kampagnen (Flyer, Lokalradio, Plakatwand, Fernsehspot) – Knopf startet einen **zeitlich begrenzten Bonus** mit Abkühlzeit (Text zählt herunter) | Flyer 2 min Betrieb ×1,25 (Pause 5 min) · Radio 3 min ×1,5 (10 min) · Plakat 5 min Preis ×1,3 (15 min) · TV 2 min alles ×2 (30 min); Preis = 60 s Produktion (relativ, bleibt bezahlbar) |
| 7 | 🧪 **Rezeptlabor** (Labor) | 200 Mio. € | ≈ 110 min | **Forschung über Zeit**: 10 Projekte nacheinander, je 5–30 min Spielzeit (läuft auch offline mit, Deckel 30 min), eine Zeile „läuft: Name · Balken · Rest“, Knopf „Forschen · Preis“ | dauerhafte kleine Boni: Klick +10 %, Ofen 10 s weniger Abkühlung, Großbestellung +5 Bleche, Minispiel-Pause −15 s, perfekte Pizza +0,5 %, Ereignisse 10 % öfter, Meisterbriefe 10 % billiger, Feinkost 10 % billiger, Getränke +25 %, Garten +25 % |
| 8 | 🧑‍🤝‍🧑 **Stammgäste** (Stadt) | 1,5 Mrd. € | 150 min | 4 feste Gäste (Signora Rossi, Student Timo, Kommissar Brunetti, Opa Gianni) mit je einem **Wunsch** (Pizzen backen, Gebäude kaufen, Sonderschicht, Minispiel, Hawaii-Gast …); erfüllt → Knopf „Belohnung“ (Klick holt den nächsten Wunsch = R1) | Belohnung sofort Portion × 20–60, dazu ein **Treueherz** (dauerhaft +0,5 % auf alles je Herz, höchstens 100) |
| 9 | 🐱 **Nonnas Katze Mozzarella** (Hof) | 30 Mrd. € | ≈ 3 h | Füttern (Knopf, Abkühlung 3 min), Streicheln (Knopf, 1 min), Laune 0…5 fällt alle 10 min um 1 (nur Text) | ×(1 + 0,04 · Laune) auf alles; „Mozzarella ignoriert dich. Das ist ein gutes Zeichen.“ |
| 10 | 🏆 **Pizza-Wettbewerb** (Stadt) | 150 Mrd. € | ≈ 3,3 h (mit Aufstieg) | alle 10 min ein Wettbewerb (Stadtmeisterschaft, Regionale, Italienische, Weltmeisterschaft – rotierend), Startgeld 30 s Produktion, Ergebnis per `Zufall` gewichtet mit Rezeptseiten, Feinkost, Sternen | 🥇/🥈/🥉 **Pokale** (dauerhaft): je Pokal +1 % auf alles, höchstens 100 |
| 11 | 📒 **Sammelalbum** (Labor) | 700 Mrd. € | ≈ 3,7 h | 12 Sticker in festem 3×4-Raster („❔“ bis gefunden); Fundchance 15 % je Ereignis, Sonderschicht, Minispiel-Sieg, Wettbewerb | je volle Reihe +10 % auf alles, volles Album Erfolg „Alle Sticker“ |
| 12 | 🏦 **Banca di Napoli** (Labor, optional) | 2 Bio. € | ≈ 4 h | Sparbuch: „10 % der Kasse einzahlen“, „Alles abheben“, Zinsen 1 % je Minute (höchstens auf 30 min Produktion) | alternativer Geldparkplatz, kein Risiko |

Reiter-Belegung (2 × 2 Panels je Seite, gleich hoch, 4 Zeilen je Panel):
- 🌱 **Hof:** Garten · Weinkeller · Personal · Katze
- 🏙 **Stadt:** Lieferzonen (6 Viertel in einem Panel: 2 Spalten à 3) · Marketing · Stammgäste · Wettbewerb
- 🔬 **Labor:** Helfer · Rezeptlabor · Sammelalbum · Banca

Bestehendes im Raster:
- 🍕 **Backstube** (2 Spalten): links 📖 Rezeptbuch & Feinkost (3 feste Zeilen: Seite lesen · Feinkost 1 · Feinkost 2 – die Feinkost-
  Zeilen sind bis zum ausgelesenen Buch 🔒; Hawaii-Verbot sperrt nur den Knopf), 🏭 Betrieb (6 feste Slots: die sechs jüngsten
  offenen Gebäude; ältere im klappbaren Abschnitt 🧺 Kleinbetriebe, der **immer** da ist – leer: „noch keine“; Slots für noch nicht
  erreichte Gebäude zeigen „🔒 Name – erst Vorgänger kaufen“); rechts Kaufmenge (immer), 🛠 Handwerk (6 feste Slots), 🎓 Meister-
  briefe (3 feste Slots, immer). Umordnung der Betrieb-Slots nur im Kauf-Rückruf (R1).
- ⭐ **Imperium:** Aufstieg-Tabelle (5 Zeilen fest) · Neueröffnung · Franchise · Statistik (feste Zeilen) · Neu anfangen – alles immer da.
- 📜 **Nonna:** Geheimrezepte 3 feste Plätze + „✅ Gelernt“ (klappbar, immer da, ggf. „noch keins“) · Herausforderungen **2 feste
  Plätze** + Zeile „läuft: Balken · Aufgeben“ (immer da, Aufgeben inaktiv ohne Modus) + „✅ Geschafft“ (klappbar, immer da). Vor dem
  ersten Stern zeigen die Plätze „🔒 ab 1 ⭐“ / „🔒 ab 3 ⭐“.
- 🎲 **Spiele:** Spielfeld als Abschnitt mit **fester Höhe** (immer sichtbar, leer: „Such dir ein Spiel aus“), darunter 4 feste
  Spielzeilen – Meister-Variante wechselt nur den **Text** im selben Slot (gleiche Knopf-ID `mini-<grundspiel>`).
- 🏆 **Erfolge:** Kopfzeile + Tabelle mit **12 festen Zeilen** (die letzten 8, die nächsten 3 Ziele, eine Summenzeile).

### 12.4 Pacing und Balancing-Ziele

- Erste vier Stunden: zwölf Freischaltungen + Aufstieg; nie zwei Bereiche „bereit“ zugleich, weil die Kette den Preis erst nach
  dem Vorgänger zeigt. Jeder Bereich wirkt höchstens ×1,5–×2 auf den Kern – die Sternekurve (2 h ≈ 40, 3 h ≈ 440, 4 h ≈ 1.500)
  darf sich um höchstens eine Verdopplung je Zeitpunkt verschieben; der Bot prüft Freischaltzeitpunkte, Klickanteil (< 10 %),
  Sternekurve und (R2) Ersetzungen paarweise. **Abnahmegrenze je Paket** (nach dem Schneeball von Paket 2): Sterne nach 2 / 3 / 4 h
  höchstens ×1,5 gegenüber Paket 1 (40 / 441 / 1.500 → ≤ 60 / 660 / 2.250), Freischaltzeiten ±30 % um §12.3. Getränke-Einnahmen
  zählen nicht für Sterne (nicht in `umsatzKette`/`umsatz`).
- Automatisierter Ertrag (Helfer) zählt als Betrieb, nicht als Klick.

### 12.5 Spielstand v6

`version: 6`; fremde Version → Stand verwerfen, Meldung „Ein alter Spielstand passt nicht mehr zu dieser Fassung – frischer
Teig!“. Neue Felder: `frei` (Blech der freigeschalteten Bereiche), `bereiche` (Speisekarte Bereich → Speisekarte mit Stück/
Stufen/Abkühlungen), `pokale`, `sticker`, `herzen`, `forschung` (erledigt, laufend, Rest-Sekunden), `helfer`, `laune`, `sparbuch`.

### 12.6 Pakete (seriell, je ein Commit) und Abnahme

| Paket | Inhalt |
|---|---|
| 1 | **Raster + Bestand**: 860 × 800, Kopf, 8 feste Reiter, 2 Spalten, alle Bestandspanels auf feste Slots (§12.2/7), Platzhalter aller zwölf Bereiche mit Freischalt-Kette (ohne Inhalt: Freischalten setzt nur das Flag und zeigt „bald“), Spielstand v6, UI gekapselt je Panel (eine Klasse je Panel mit `aktualisiere()`, aufgerufen nur wenn die zugehörige Modell-Version sich geändert hat – vorbereitet für Bindungen) |
| 2 | Hof: Garten, Weinkeller, Personal |
| 3 | Stadt: Lieferzonen, Marketing; Labor: Helfer (R2-Belege) |
| 4 | Labor: Rezeptlabor; Stadt: Stammgäste |
| 5 | Hof: Katze; Stadt: Wettbewerb; Labor: Sammelalbum (· Banca, falls Zeit) |
| 6 | Erfolge für die neuen Bereiche, Feinschliff, Balancing-Lauf |

Abnahme je Paket: `npm test`, `node pruefstand/run.js`, `npm run test:differenz`, E2E 05/07 (auto + wasm), Testdateien aus echtem
Interpreter-Lauf (Saat 42, Vorrat leer), **Positionsmessung** `positionen2.mjs` (inkrementell, alle Reiter, jede Verschiebung
klassifiziert: erlaubt nur im Bild **direkt nach** einem Nutzerklick, der eine Freischaltung oder einen Aufstieg auslöst –
Ziel **0 Verstöße**), Bot (Freischaltzeiten, Klickanteil, Sternekurve, R2-Paare), Sichtprüfung hell/dunkel.

### 12.7 Detailspezifikation der Bereiche (für Paket 2–5)

Gemeinsam: Panel `bereich-<schlüssel>` mit 4 Zeilen (`bereich-<s>-info-<n>`, `bereich-<s>-knopf-<n>`), Zeile 1 bis zur
Freischaltung = Platzhalter/Freischalt-Knopf `frei-<s>`. Alle Preise fest in € (wie Upgrades), Stückkäufe gehen bei jeder
Neueröffnung auf 0, Freischaltung und Sammlungen bleiben. Faktoren wirken in `neuBerechnen()` – jeder Bereich liefert **eine**
Methode `faktorX()`; die Summe aller Bereichsfaktoren bleibt moderat (je Bereich ≤ ×2). Zufall nur über `Zufall` (Saat).

| Bereich | Zeilen (fest) | Zahlen |
|---|---|---|
| 🍅 Garten | 1 Tomaten · 2 Basilikum · 3 Oregano (Stückkäufe, Knopf = Preis) · 4 „Ernte: +n % Preis“ (Knopf „—“) | Grundpreise 40 Tsd / 120 Tsd / 400 Tsd, ×1,5 je Stück, höchstens 20 je Beet; Preis je Pizza +0,5 % / +0,75 % / +1,25 % je Stück → höchstens +50 % (2c) |
| 🍷 Weinkeller | 1 Acqua frizzante · 2 Limonata · 3 Chianti · 4 Espresso (Stückkäufe; Knopf = Preis, Info zeigt €/s) | Grundpreise 100 Tsd / 500 Tsd / 3 Mio / 16 Mio, ×1,3; je Stück €/s = 0,05 % / 0,125 % / 0,25 % / 0,5 % des Pizza-Umsatzes pro Sekunde (`sekundeWert · preis`), höchstens 25 je Getränk (→ +23 %); eigener Zähler `umsatzGetränke` (Statistik „Getränkeumsatz“); Einnahmen im Takt nur in `geld`/`umsatzAllzeit` – **nicht** in `umsatz`/`umsatzKette` (keine Sterne, kein Herausforderungsziel), offline halbe Kraft, zählen nicht als Klick (2c) |
| 👩‍🍳 Personal | 1 Kellner Luigi · 2 Spülkraft Rosa · 3 Buchhalter Enzo · 4 Türsteher Bruno (Knopf „Befördern · Preis“, Info „Stufe n/10 – Wirkung“) | Preis = 4 Mio · 2^Stufe · (1 / 1,5 / 2 / 3); Luigi: Trinkgeld +1 je Stufe · Rosa: Abkühlzeit × (1 − 0,02·Stufe) · Enzo: `preisFaktor()` × (1 − 0,005·Stufe) · Bruno: Hawaii-Bonus × (1 + 0,2·Stufe) (2c: die Sonderschicht ist spät ≈ 63 % der Einnahmen – alles, was die Abkühlung berührt, wirkt überproportional) |
| 🛵 Lieferzonen | 3 Zeilen × 2 Knöpfe: Altstadt, Hafen · Uni-Viertel, Bahnhof · Villenviertel, Industriegebiet; 4. Zeile „n/6 Viertel – Betrieb +m %“ | Einmal-Käufe 10 Mio · 40 Mio · 160 Mio · 640 Mio · 2,5 Mrd · 10 Mrd (Reihenfolge frei), je +8 % Betrieb (höchstens +48 %) |
| 🤖 Helfer | 1 Ofenwächter Pino · 2 Vorleser Carlo · 3 Spielpartnerin Nonna · 4 Wettbewerbs-Scout (Einmal-Käufe, dauerhaft) | 60 Mio · 300 Mio · 2 Mrd · 50 Mrd. Pino: im Takt `sonderschicht()`, sobald `ofenBereit()` · Carlo: im Takt `blättere()`, sobald bezahlbar (nicht im Hawaii-Verbot) · Nonna: 60 s nach Ende der Pause, wenn kein Spiel läuft: Gewinn des sichtbaren Spiels (`minispielGewinn(belohnung)`, zählt als Sieg, startet die Pause) · Scout: nimmt am Wettbewerb teil, sobald er offen ist. R2-Beleg: Bot mit/ohne Helfer, Umsatz nach 60 min |
| 📣 Marketing | 1 Flyer · 2 Lokalradio · 3 Plakatwand · 4 Fernsehspot (Knopf „Starten · Preis“ / „läuft noch n s“ / „Pause n s“) | Preis = 60 s Umsatz (`sekundeWert · preis · 60`, mindestens 10 Tsd); Flyer 120 s Betrieb ×1,25, Pause 300 s · Radio 180 s Betrieb ×1,5, Pause 600 s · Plakat 300 s Preis ×1,3, Pause 900 s · TV 120 s alles ×2, Pause 1800 s; mehrere gleichzeitig erlaubt; Rest-Sekunden im Spielstand |
| 🧪 Rezeptlabor | 1 „läuft: Name · Rest“ + Fortschritt (Knopf „Forschen · Preis“ / „läuft“) · 2 „nächstes: Name – Wirkung“ · 3 „erforscht: n/10“ · 4 Liste der erforschten Symbole | Projekte (Dauer, Preis, Wirkung): Teigruhe 5 min 100 Mio Klick +10 % · Schamott-Wärme 8 min 300 Mio Abkühlung −10 s · Kartonfaltung 10 min 1 Mrd Großbestellung +5 Bleche · Pausenbrot 12 min 3 Mrd Minispiel-Pause −15 s · Goldener Rand 15 min 10 Mrd perfekte Pizza +0,5 % · Nachbarschaftsblatt 18 min 30 Mrd Ereignisse 10 % öfter · Meisterrabatt 20 min 100 Mrd Meisterbriefe −10 % · Einkaufsgemeinschaft 22 min 300 Mrd Feinkost −10 % · Sommelier 25 min 1 Bio Getränke +25 % · Gewächshaus 30 min 3 Bio Garten +25 %. Nur eins zugleich; läuft in Spielsekunden (offline mit, Deckel 30 min) |
| 🧑‍🤝‍🧑 Stammgäste | 1 Signora Rossi · 2 Student Timo · 3 Kommissar Brunetti · 4 Opa Gianni (Info „Wunsch … (x/y)“, Knopf „🎁 Belohnung“ aktiv, wenn erfüllt) | Wunschtypen rotieren je Gast (Pizzen backen = 300 s Produktion · 3 Gebäude kaufen · 2 Sonderschichten · 1 Minispiel-Sieg · 1 Hawaii-Gast · 1 Großbestellung); Zähler ab Wunschbeginn; Belohnung `portion() · 30` + 1 Treueherz (dauerhaft, +0,5 % je Herz, höchstens 100); der Klick holt den nächsten Wunsch (R1) |
| 🐱 Katze | 1 „Mozzarella: Laune n/5 – Text“ (Knopf „🐟 Füttern · Preis“ / „satt, n s“) · 2 Knopf „🫳 Streicheln“ (Pause 60 s) · 3 „Bonus ×1,xx“ · 4 Katzenweisheit | Füttern Preis = 10 s Umsatz, Laune +2, Pause 180 s · Streicheln Laune +1, Pause 60 s · Laune −1 je 600 s (nur Text) · Faktor 1 + 0,04·Laune auf alles |
| 🏆 Wettbewerb | 1 „Nächster: Name in n s“ / „offen – noch n s“ (Knopf „Teilnehmen · Startgeld“) · 2 letztes Ergebnis · 3 „Pokale: 🥇a 🥈b 🥉c“ · 4 „Bonus +p %“ | alle 600 s, 120 s offen; Startgeld 30 s Umsatz; Namen rotieren (Stadtmeisterschaft, Regionale, Italienische Meisterschaft, Weltmeisterschaft); Punkte q = Rezeptseiten + Feinkost + min(Sterne, 10); Gold-Chance 10 % + 2 %·q (max 50 %), Silber 30 %, sonst Bronze; Pokalpunkte 3/2/1 → +1 % auf alles je Punkt, höchstens 100 |
| 📒 Sammelalbum | 3 Zeilen × 4 Sticker als Schilder (❔ / Symbol) · 4. Zeile „n/12 – volle Reihen: m (+10 % je Reihe)“ | Fund 15 % je Ereignis, Sonderschicht, Minispiel-Sieg, Wettbewerb (zufälliger fehlender Sticker); Sticker: 🍕 🍅 🧀 🌿 / 🔥 🛵 🧑‍🍳 📦 / ⭐ 🏢 🌙 🍍 |
| 🏦 Banca | 1 „Guthaben … · Zinsen 1 %/min“ (Knopf „10 % einzahlen“) · 2 Knopf „Alles abheben“ · 3 „verzinst bis … (30 min Umsatz)“ · 4 Spruch | Zinsen im Takt sekundengenau auf min(Guthaben, 1800 s Umsatz) |

Neue Erfolge (Paket 6, je Bereich 1–2): „Grüner Daumen“ (alle Beete 20), „Sommelier“ (alle Getränke 25), „Vollbesetzt“ (alle vier
Stufe 10), „Ganz Neapel liefert“ (6 Viertel), „Nonna macht Pause“ (alle Helfer), „Prime Time“ (TV-Spot), „Doktor der Pizzologie“
(10 Forschungen), „Herzensangelegenheit“ (10 Herzen), „Schnurr“ (Laune 5), „Weltmeister“ (Gold bei der Weltmeisterschaft),
„Alle Sticker“ (12/12), „Zinseszins“ (erste Zinsen).

### 12.8 Stand (umgesetzt)

| Paket | Inhalt | Commit | Messung |
|---|---|---|---|
| Design | §12.1–12.7 | 4bdd1be | Baseline vor dem Umbau (positionen2.mjs, pi3.ereignisse, alle Takte): 865 Zustände, 66 mit Layout-Bewegung, 422 nur Textbreite |
| 1 | Raster 860 × 800, 8 feste Reiter, 2 Spalten, Bestand auf feste Plätze, 12 Platzhalter mit Freischalt-Kette, Spielstand v6, Panels gekapselt (`aktualisiere()` je Versionszähler). IDs: Betrieb `kauf-betrieb-n`/`kauf-klein-n`, Herausforderungen `probe-start-n`, Minispiele `mini-<grundspiel>`, `modus-info` immer da | be5d2a4 | pi4.ereignisse 886 Zustände → **0 Verstöße**; Bot 120 min 45.477 Zustände → **0**; Klickanteil 4,6 % (60 min) / 4,1 % (240 min, Aufstieg); Freischalt-Minuten (Wirkung noch 0): Garten 4 · Weinkeller 10 · Personal 28 · Lieferzonen 44 · Helfer 66 · Marketing 122 · Labor 138 · Stammgäste 155 · Katze 160 · Wettbewerb 185 · Album 187 · Banca 213 |
| 2 | Hof: Garten (3 Beete, Preis je Pizza), Weinkeller (4 Getränke, Nebeneinkommen €/s, offline halbe Kraft), Personal (4 Rollen, Stufe 0…10). Kaufmenge im Hof immer 1 Stück, Preise fest in € (`Posten`/`postenVon`/`kaufePosten`) | b9f9eef, 5a76d6c | 0 Verstöße (pi4 1.184, Bot 60 min 22.687, Bot 120 min 47.082 Zustände); Klickanteil 4,1 % / 2,3 %; Getränke 5,7–10 % des Umsatzes. **Zu schnell:** Sterne 2 h 100 (×2,5), 3 h 2.455 (×5,4), 4 h 11.329 (×7,5); Katze 132 · Wettbewerb 133 · Album 150 · Banca 168 min → Nachjustierung 2c |
| 2c | Hof-Balancing: Getränke nicht mehr in `umsatz`/`umsatzKette`, Anteile halbiert; Garten +50 % Deckel; Rosa 2 %/Stufe, Enzo 0,5 %/Stufe; Hof-Grundpreise ×2 | 2dc3a8c | Sterne 2/3/4 h: Saat 42 40 / 305 / 1.577 · Saat 7 40 / 304 / 1.796 · Saat 99 40 / 460 / 1.898 (Grenze 60 / 660 / 2.250 ✓); Klickanteil 4,9 % (60 min), 3,2–4,8 % (240 min); 0 Verstöße (1.278 Zustände); Freischaltungen Saat 42: 4 · 10 · 38 · 44 · 66 · 120 · 166 · 166 · 170 · 173 · 194 · > 240 (Ballung nach der Franchise → Preise §12.3 nachgezogen). E2E 05 „Pizza-Imperium“ war seit K-123 rot (Browser-Klick auf `kauf-betrieb-1` erzeugte kein Ereignis): weder Spiel noch Renderer – das Fenster in Programmgröße legte den Knopf unten mittig unter den Playground-Toast „… in neuem Tab geöffnet“, der Klicks abfing; behoben mit `pointer-events: none` am Toast (site/css/app.css), Regressionstest in E2E 09 |
