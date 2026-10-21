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
| 🏭 Betrieb | die 6 jüngsten Gebäude + 1 nächstes | ältere → Zeile „🧺 Kleinbetriebe: 🧑‍🍳×120 🧱×80 … (2 % der Produktion)“ mit Knopf „▸ zeigen“ | neues Gebäude, sobald das vorige gekauft ist |
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

### 11.5 Wünsche an Theke/Sprache (nicht selbst gebaut)

| Nr. | Wunsch | Wozu | Umweg heute |
|---|---|---|---|
| W1 | `Reiter`: Seiten ein-/ausblenden und Titel ändern (`setzeTitel(n, t)`, `seiteSichtbar(n, d)`) | Reiter erst zeigen, wenn die Ebene offen ist; Kennzeichen „•“ für Neues | gesperrte Reiter zeigen einen Schloss-Text |
| W2 | Einklappbarer `Abschnitt` (`zu(d)`, Ereignis beim Auf-/Zuklappen) | „Erledigt“- und Kleinbetriebe-Zeilen | Knopf „▸ zeigen“ + `sichtbar` |
| W3 | Umschalter/Segment-Auswahl (`Auswahl(["1×","10×","100×","Max"])`) | Kaufmenge | vier Knöpfe, gewählter eingefärbt |
| W4 | Tastatur-Ereignisse (Leertaste, Ziffern) | Minispiele „Fangen!“ ohne Maus | nur Klicks |
| W5 | `Mathe.log` | Max-Kauf in geschlossener Form statt Schleife | Schleife (≤ 1000) |
| W6 | `Meldung`/Toast mit Warteschlange (Idee aus der Übersicht) | mehrere Neuigkeiten kurz hintereinander | eine Meldungszeile, letzte gewinnt |
