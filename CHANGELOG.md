# Was kommt neu aus dem Ofen – Release-Notizen

Alle Änderungen der Sprache pizza, neueste zuerst. Verbindlich bleiben `SPEC.md` und `KLAERUNGEN.md`; die K-Nummern verweisen
dorthin.

> **Versionsnummern:** „pizza 3.x“ ist die Sprache samt Werkzeugen (Interpreter, Compiler pizzaiolo, Laufzeit, `pizza-host`,
> Playground). Unabhängig davon zählen weiter: „Theke v3 … v7“ (Ausbaustufen des UI-Frameworks), HOST-ABI (seit 3.2 **v2**),
> Theke-Protokoll `v: 1`, Kartonformat `pkarton/1`, Projektdatei `"pizza": 1`, Teigling-Format v1, Bildpaket v1 (mit Abschnitten)
> und das Vorrats-Format `{"v":1,…}`.

---

## pizza 3.2 (Vorschau, Stand 2026-10-25)

> Aus einer Datei wird eine ganze Küche: Rezepte bestellen einander, Bilder kommen vorgebacken aus der Kiste, und der Herd
> bekommt Licht, Regen, Spiegelungen und Klang.

**Versionsnummer:** 3.2 nach dem bisherigen Schema (neue Sprachmittel, inkompatible Änderungen nur an Formaten und Hosts → kleine
Versionsstufe). Die Kennungen im Code (`--version`, `PizzaLang.version`, Crates, Logos) stehen noch auf 3.1.0 und werden bei der
Veröffentlichung in einem Schritt umgestellt (wie beim Wechsel auf 3.1).

### Neu – Projekte und Mehrdatei-Programme (PROJEKTE.md, K-138 … K-147)

- **Projekte als Ordner:** Ein Programm ist ein Ordner mit einer Hauptdatei (`hauptgang.pizza` oder `"hauptdatei"` in der
  optionalen Projektdatei `pizza.json` mit `name`, `beschreibung` und Standard-`args`). Überall – API, CLI, Playground, ZIP,
  Teilen, `.pkarton`, EXE – reist dieselbe Dateisammlung `{ pfad → Inhalt }` (K-138).
- **`bestellt "rezepte/teig.pizza";`** holt weitere Rezepte ins Programm: alle erreichbaren Dateien in fester Ladereihenfolge,
  ein gemeinsamer Namensraum, `geheimrezept` bleibt in seiner Datei. Kreise, doppelte Namen, fehlende Dateien und `hauptgang`
  außerhalb der Hauptdatei sind klare Ladefehler (P0014 … P0019), bevor etwas läuft; Laden kostet keine Schritte (K-139, K-140).
- **Fehlerorte mit Datei:** Fehler, Warnungen und Ananas nennen `datei: zeile:spalte`; der Playground springt in die richtige
  Datei (K-141).
- **`Kiste`:** lesender Zugriff auf die Dateien des eigenen Projekts – `Kiste.text(pfad)`, `zeilen`, `gibts`, `liste` (K-146).
- **`Bildchen.laden("bilder/kachel.png")`:** PNG und JPEG aus dem Projekt als Herd-Texturen. Der **Vorbacker** (`herd/teigling`,
  nativ und als `teigling.wasm` bitgleich) macht daraus beim Packen einen **Teigling** mit fertiger Mip-Kette; Ergebnisse werden
  zwischengespeichert, die Teigmenge ist auf 64 MB begrenzt (P0020, K-145, K-147). Glut zeichnet sie beim Vergrößern scharf und
  beim Verkleinern weich – nativ und im Browser.
- **Wasm und nativer Host** übersetzen und packen ganze Projekte; Kiste-Daten und Teiglinge liegen im Datensegment des `.pkarton`,
  eine EXE enthält damit das ganze Projekt. **HOST-ABI v2** in allen Hosts (Ortsangaben mit Datei, Küchenbericht, Standard-Argumente
  im Modul).
- **Playground-Projekte (K-142):** Projekte liegen in IndexedDB (ohne IndexedDB nur im Speicher, mit Hinweis-Banner), ein Projekt je
  Fenster, Dateibaum mit Ordnern, Tabs je Datei, wählbare Hauptdatei, Bildvorschau, Projektmenü (umbenennen, duplizieren, löschen,
  Papierkorb), ZIP-Export und -Import. Alte Tabs werden beim ersten Start zu Ein-Datei-Projekten.
- **Teilen mit Versionen – die „Durchreiche“ (K-143):** eigener kleiner Teilen-Dienst statt Hastebin und Redis. Ein Link kann neue
  Versionen bekommen (ohne Zusatz die neueste, mit `@n` eine feste), ändern darf nur, wer den Bearbeitungsschlüssel hat; Dateien
  liegen einmal je Inhalt (SHA-256). App-Links mit `@n`, EXE direkt aus dem Projekt. Grenzen und Aufbewahrung sind per Umgebung
  einstellbar (`/api/konfig`).
- **Beispiele als Ordner (K-144):** alle Beispiele sind Projektordner mit `pruefung/` (erwartete Ausgabe, Eingaben, Ereignisse);
  die Doku zeigt Mehrdatei-Blöcke und hat das Kapitel „Projekte und Dateien“. Teigball, Teigfänger und Steuerung laden ihre Bilder
  jetzt aus PNG-/JPEG-Dateien, das Pizza-Imperium ist auf mehrere Dateien verteilt (`zustand.pizza`, `theke/…`, `modell/…`).

### Neu – Herd (Spiele-Engine, Importgruppe `herd`, HERD.md)

- **Der Herd:** Teile mit Komponenten, fester Takt, Eingabe als Zustand, 2D und 3D in einem Programm; nativ (winit + wgpu) und
  im Browser (WebGPU, Rückfall WebGL2), Kern bitgleich, in den Tests mit `.herd-erwartet` (K-130 … K-136).
- **Ausbau H-K0 … H-K13:** Feldtypen `teil-liste`/`zahl-liste`, Lesefelder und Nachlauf (K-149); `Linie`, `Rahmen` (9-Slice),
  `Vieleck`, `Funken` (3D-Teilchen), `Belag` (geteiltes Material), `Gleiten` und `Ablauf` (Tweens, Keyframes), `Blick` und `Leine`
  (Kameras), `Fuehler` (Kollider mit betreten/verlassen, K-150), `Wucht` (2D-Physik), `Vorlage` (Prefab), `Kulisse` (Szenenwechsel),
  `Gelaende` (Höhenkarte), `Fliesen` (Kachelkarten), `Himmelszelt` (Skybox), die UI-Bausteine `Taster`, `Leiste`, `Regler` und
  `Tafel` mit Maus im Kern (K-151) sowie `Kniff`: eigene pizza-Klassen als Komponente mit `start`, `takt`, `beimBetreten` … (K-152).
- **Grafik:** viele Lichter (Clustered Forward) und Spot-Licht, `Stimmung` (HDR, Bloom, ACES, Höhennebel, `strahlen`), Material
  (Relief, Kachelung, PBR, Nässe), Spiegelung nasser Böden, Regen (gestreckte Tropfen, Aufschläge, Pfützenringe) und ein
  Bindungswächter für die Shader (H-K15).
- **Gehäutete Figuren (H-K23b):** Modelle mit Skelett und Haut (glTF `skins`) verformen sich nach ihren Gelenk-Teilen – auf der
  Grafikkarte, auch in Schatten, Spiegelung und Bildschirmraum; Beispiel „Tanzfiguren“ (Kenney Mini Characters, CC0).
- **Klang (H-K14, K-153):** eigene Importgruppe `klang` mit `Klang.ton`, `rauschen`, `stille`, `noten`, Hüllkurve, Filtern, Mischen
  und Schleifen; `k.spiele()` liefert eine Spur mit Lautstärke, Tonhöhe, Panorama und Lage im Raum (Hörer = Kamera). Die Erzeugung
  ist nativ und in Wasm bitgleich. Abgespielt wird über WebAudio bzw. waveOut/ALSA, ohne Gerät bleibt es stumm; getestet wird mit
  `.klang-erwartet`.
- **Raumklang `Schall` (H-K22, K-164):** ein Klang am Teil (neuer Feldtyp `klang`) folgt dessen Lage von selbst; gehört wird an der
  aktiven Kamera bzw. am Blick, Pegel und Panorama rechnet der Herd (gerastet, in allen Motoren gleich) und meldet sie als
  Klang-Ereignis `raum`. Beispiel Brunnenplatz.
- **Eingabe:** Mausfang (Pointer Lock) mit relativer Bewegung, Mausrad und Modifikatortasten (K-155) – Steuerung wie in einem
  Ego-Shooter.
- **Gleichmäßige Bilder:** VSync (Fifo), Pipelines vorab, Takt-Uhr ab dem ersten gezeigten Bild; im Browser kommt der Takt zum
  fälligen Zeitpunkt, statt zu ruckeln.
- **Neue Beispiele**, u. a. Neon-Napoli (begehbares 3D-Spiel im Regen, mit Klangkulisse), Klavier, Lichterfest, Neonschild, Hügel,
  Weite Welt, Kulissen und Kniffe.

### Neu – Sprache und Bibliothek

- **`Uhr.zone()`:** Versatz der Ortszeit zu UTC als Dauer, Sommerzeit inklusive; im Test fest über `optionen.zone` bzw.
  `--zone=N`. Die Pizza-Uhr läuft synchron zur echten Uhrzeit (K-154).
- **Pizza-Imperium, Pakete 5 und 6:** Nonnas Katze, Pizza-Wettbewerb, Sammelalbum, Banca di Napoli und Erfolge der Bereiche.

### Geändert

- **HOST-ABI v1 → v2** (K-141): Ein v2-Host lehnt v1-Module mit klarer Meldung ab – `.pkarton` und EXEs bitte neu bauen.
- **Beispiel-Manifeste** listen Ordner und Dateien statt einzelner `.pizza`-Dateien; der Übergangsleser für das alte Format ist
  entfernt (keine Rückwärtskompatibilität, ARCHITEKTUR §3).
- **Alte Teilen-Links** (Hastebin) werden ignoriert; Hastebin und Redis sind aus `compose.yaml` entfernt, an ihre Stelle tritt die
  Durchreiche.
- **Interpreter-Quellen** liegen jetzt als Module unter `site/js/pizza/`; `site/js/pizza.js` wird daraus gebaut
  (`node scripts/baue-pizza.js`).
- **Kühlschrank bei Speicherdruck:** Gibt der Rechner für einen großen Text keinen Speicher mehr her, wirft die Wasm-Laufzeit die
  fangbare `LaufzeitAnanas` „Der Kühlschrank ist voll“ statt „Interner Fehler im Ofen“ (K-014, Abnahme PZ).

---

## pizza 3.1 (2026-10-22)

> Die Pizza ist aus der Sprache ausgezogen. Dafür stehen jetzt mehrere Köche in der Küche, und die Theke folgt dem Zettel von selbst.

Seit 3.0 gab es einige inkompatible Änderungen – vor allem den Auszug der eingebauten Pizza (K-105). Programme ohne Pizza-Literale, Beläge und
`teile` laufen meist unverändert weiter. Was beim Umstieg zu tun ist, steht unter [Umstieg von 3.0](#umstieg-von-30).

### Neu

- **Küchenbrigade:** echte Parallelität mit `blech.brigade(fn)` (SPEC §17, K-097 … K-101, K-104). Die Stücke laufen auf mehreren
  Köchen und liefern trotzdem dasselbe Ergebnis wie ein einzelner Koch: gleiche Ausgabe, gleiche Uhr, gleiche Schritte. Wer aus einem
  Stück in die Hauptküche schreibt, bekommt eine `KüchenAnanas`. Die Zahl der Köche stellt der Host ein (`--koeche=N`, Playground
  „Köche: auto | 1 | 2 | 4 | 8“), das Programm selbst sieht sie nie.
- **Theke v3 – Animationen:** `zutat.animiere("puls" | "huepfen" | "wackeln" | "funkeln" | "einblenden" | "aufpoppen", dauer?)`,
  `theke.schwebe(text, bei?, farbe?, dauer?)` für „+12“-Zahlen, `zutat.uebergang(ja)` für weiches Ein- und Ausblenden
  (K-090 … K-094). Sie sind rein visuell und ändern keinen Programmzustand.
- **Theke v4:** `Reiter.setzeTitel(n, t)`/`titel(n)` und ausblendbare Seiten, `Abschnitt` mit `klappbar`/`zu`, neue Zutaten
  `Auswahl` (Segment-Umschalter) und `Tastatur` (Tastenereignisse), Stile `zeilen` und `mindestbreite` (K-107 … K-110, K-113, K-114).
- **Theke v5 – reaktiv:** `neu Zettel(wert)` als beobachtbarer Wert, dazu `zutat.binde(eigenschaft, () -> …)` und
  `bindeStil(schlüssel, () -> …)`. Abhängigkeiten werden automatisch erfasst, und gesendet wird nur, was sich wirklich geändert hat.
  Eine Bindung rechnet nur: Setter darin werfen eine `LaufzeitAnanas`. Liest sie weder Zettel noch Zutat, warnt `W0103`
  (K-116 … K-119).
- **Theke v6:** Stil `senkrecht` (`oben | mitte | unten | strecken`), `marke` als Badge am Reiter-Tab, `zeilen` auch für
  Abschnitt-Titel und Tabellenzellen, feste Innenbreite unabhängig vom Rollbalken (K-120 … K-122, K-124).
- **Theke v7:** abgeleiteter Zettel `Zettel.aus(() -> …)` und Spaltengewichte `stil("spalten", [2, 1, 1])` (K-125, K-126).
- **Mathe:** `Mathe.log`, `log10`, `log2`, `exp` und die Konstante `Mathe.E`, in allen Motoren bitgleich (K-111).
- **Mathe – Winkel:** `Mathe.sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2(y, x)` im Bogenmaß und die Umrechnung
  `Mathe.bogen(grad)` / `Mathe.grad(bogen)` – in jedem Browser, in der App und in Wasm Bit für Bit gleich (fdlibm, K-137).
- **Speisekarte:** `hole(k, ersatz)` mit Ersatzwert, so wie bei der Vorratskammer (K-095).
- **Vorratskammer mit Namensraum:** `neu Vorratskammer("spielstand", namensraum: "mein-spiel")`. Alle Fassungen eines Programms
  teilen sich dann einen Spielstand, egal ob als Beispiel, Teilen-Link, App-Link oder EXE. Löschen geht mit
  `--vorrat-loeschen raum/name` (K-106).
- **Kommandozeile:** `node bin/pizza.js --version` und `pizza-host --version` (eine EXE versteht die Option auch) nennen die Version.

### Geändert

- **Zahlformat für große Zahlen (K-103):** `kompakt()`, `tausender()` und `währung("€")` (vormals `euro()`) liefern statt `2,08e+21 €` jetzt `2,08 Trd. €`.
  Die Stufen reichen bis Dezilliarde, danach folgt `1,5 × 10⁶⁶`. ∞ und NaN erscheinen als `∞`/`NaN`. Die Textform (`text(x)`) bleibt
  unverändert.
- **Theke sendet nur echte Änderungen (K-117):** Ein Setter auf den gleichen Wert erzeugt keine Nachricht mehr. Das ersetzt K-073.
- **Theke `kinder` in `aendere`** zeigt den Zustand beim Senden, nicht den beim `hinzu` (K-115).
- **Text-Parameter bei `karton` (K-102):** `neu Theke(karton)`, `neu Eingabe(karton)` und `neu Abschnitt(karton)` ergeben jetzt den
  Text `"karton"`. `Fortschritt.setzeText(karton)` leert den Text.
- **Theke ohne Fenster bricht nativ ab (K-096):** Bekommt eine EXE oder `pizza-host` kein Fenster (kein Bildschirm, keine WebView2),
  endet das Programm mit einer klaren Meldung und **Exit 2**. Bisher lief es mit `W0100` weiter. Die CLI und der Browser verhalten
  sich wie bisher.
- **Playground-Vorschau** übernimmt `breite`/`hoehe` des Programms bei jedem Lauf (K-123).

### Entfernt (K-105)

Rezepte, Preise und Beläge sind Fachlogik und gehören ins Programm, nicht in die Sprache:

- der Typ `Pizza`, Pizza-Literale `((Tomate, Käse))` und `(())`, `neu Pizza()` ohne eigene Klasse
- Belag-Werte samt eingebautem Zutatenkatalog und Grundpreis, `preis()`, `beläge()`, `hat()`, `p + Belag`, `für (b : pizza)`
- `belag X auf Pizza { … }`, `@Nach(…)`, die Keywords `belag` und `auf` (sind jetzt freie Namen), `PizzaFehler B0012`
- `teile(p)`, `Stück<T>`, `essen()`, `BesitzAnanas`, `UnbekannterBelagAnanas`
- der Hawaii-Auslöser „Pizza mit Belag Ananas“. `hawaii` als Typ und `neu Hawaii(…)` gibt es weiterhin.

Weiterhin da sind alle allgemeinen Konzepte mit Pizza-Namen: `schieb`, `teig`, `ofen`, `schneide`, `bestelle`, `calzone`,
`@Kühlschrank` und `quattrostagioni`.

### Entfernt und verallgemeinert (K-127)

Eine zweite Durchsicht hat die Pizza-Regeln entfernt, die noch in der Semantik steckten. Pizza-Namen und Floskeln bleiben.
Eingebaute Enums, Listen oder Fachkonstanten gibt es keine mehr (nur `Mathe.PI` und `Mathe.E`).

- **Ofen nur mit Zeitbudget:** `ofen(zeit: 90s)` oder kurz `ofen(90s)`. Das Budget ist genau die Zeit. Die Ofentemperatur ist weg,
  ebenso ihre Grenze von 485 °C (`„Zu heiß! Selbst Neapel hat Grenzen.“`) und die Regel „heißer = mehr Schritte“.
- **`priorität` statt `trinkgeld`:** `lieferung.priorität(n)` legt fest, in welcher Reihenfolge die `wennDa`-Rückrufe nach
  Programmende laufen (höchste zuerst). Der letzte Aufruf gilt. Aufs Budget wirkt die Priorität nicht mehr: `warte(max: 30min)`
  bedeutet genau 30 Minuten.
- **`währung(symbol)` statt `euro()`:** `8.währung("€")` → `8,00 €`, `2.5.währung("CHF")` → `2,50 CHF`, `x.währung("€", kompakt: ja)`
  → `1,23 Mio. €`. Ohne Symbol bleibt nur der Betrag (`8,00`). Gerundet wird wie bisher.
- **`schneide(n)` braucht immer eine Stückzahl:** `schneide(auto)` (= 8 Stücke) und `schneide()` gibt es nicht mehr. `auto` ist ein
  gewöhnlicher Name. Die Warnung `S0007` bei 7 Stücken ist ebenfalls weg.

### Umstieg von 3.0

1. **Pizza-Literale durch eine eigene Klasse ersetzen.** Dieselbe Pizza, jetzt aus eigener Küche:
   ```pizza
   klasse Pizza {
     gebacken Blech<margherita> beläge = [];
     speisekarte Pizza drauf(margherita b) { beläge.hinzu(b); serviere ((dies)); }
     speisekarte funghi preis() { serviere ((5 + beläge.länge())); }
   }
   Pizza p = neu Pizza().drauf("Tomate").drauf("Mozzarella");   // statt ((Tomate, Mozzarella))
   ```
   Beispiele dafür: `site/beispiele/pizzafunktionen/pizza-klasse.pizza` und `theke/belag-baukasten.pizza`.
   Wer Altes stehen lässt, sieht die üblichen Meldungen: `LaufzeitAnanas: 'Tomate' ist nicht definiert.`,
   `UnbekanntePizzaAnanas: Klasse 'Pizza' steht nicht auf der Speisekarte.`, für `((A, B))` und `belag … auf` einen Syntaxfehler `P0001`.
2. **`teile(p)`/`Stück` entfernen.** Für „ein Wert, ein Tisch“ gibt es `schieb(x)`, für Stückzahlen ein eigenes Feld.
3. **`zeichne()`-/`aktualisiere()`-Schleifen auf Zettel umstellen.** Den Zustand in `Zettel` legen, die Anzeige einmal mit `binde`
   anschließen, und in den Rückrufen nur noch `setze` aufrufen:
   ```pizza
   Zettel kasse = neu Zettel(0);
   Schild anzeige = neu Schild("").binde("text", () -> "Kasse: " + kasse.wert().währung("€"));
   Knopf backen = neu Knopf("Backen", () -> kasse.setze(kasse.wert() + 8));
   ```
   Werte, die sich aus anderen Werten berechnen, werden mit `Zettel.aus(() -> …)` zum abgeleiteten Zettel. Ein vollständiges Beispiel
   ist das Pizza-Imperium (Commit `1d400fc`) bzw. `site/beispiele/idle/erste-pizzeria.pizza`.
4. **Spielstände zusammenführen (optional):** `namensraum:` an die Vorratskammer hängen. Für die Migration einmal die alte Kammer
   ohne Namensraum öffnen, die Einträge kopieren und die alte Kammer leeren (K-106).
5. **Große Zahlen:** Wächter wie `summe < 1e21 ? summe.euro() : "unbezahlbar"` werden überflüssig. Sie schaden aber auch nicht.
6. **Native Theke-Programme in CI/SSH:** wer bisher still fensterlos lief, setzt `PIZZA_THEKE=0` oder nutzt `--ereignisse-json`,
   sonst endet das Programm mit Exit 2.
7. **Pizza-Regeln aus K-127 ersetzen:**
   - `x.euro()` → `x.währung("€")`, `x.euro(kompakt: ja)` → `x.währung("€", kompakt: ja)`.
   - `ofen(temperatur: t, zeit: z)` → `ofen(zeit: z * t / 250)` ergibt dasselbe Budget, `ofen(t, z)` → `ofen(z * t / 250)`.
     Die 485-Grenze baut man bei Bedarf selbst nach: `falls (t > 485) { wirf neu VerbranntAnanas("Zu heiß!"); }`.
   - `l.trinkgeld(n)` → `l.priorität(summe)` für die Reihenfolge. Wer das alte Zusatzbudget braucht, rechnet es aus:
     `l.warte(max: d * (1 + summe / 10))`.
   - `schneide(auto)` → `schneide(8)`. Wer die Warnung bei 7 Stücken vermisst, schreibt sich einen eigenen Hinweis.
