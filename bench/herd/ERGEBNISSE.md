# Herd – Messergebnisse

Ziele und Messverfahren: `HERD.md` §6 (K-131). Weitere Abschnitte (Kern, Glut, Wasm-Programm in Chrome, EXE) ergänzen die
jeweiligen Pakete.

## Interpreter

Der Interpreter ist die Korrektheits-Referenz, **kein Leistungsziel** (HERD.md §6). Gemessen wird nur, dass die Anbindung dünn
bleibt: Setter gehen ohne JSON und ohne Objekt-Allokation direkt an die Exporte von `kern.wasm` (Feldnummern vorab aus dem Schema,
Austauschpuffer und Speicheransichten wiederverwendet).

`node bench/herd/setter-interpreter.js 1000 60` – 1000 Kreise, 60 Takte, je Takt jeder Setter einmal (B2 in klein); abgezogen wird
eine Leerlauf-Schleife gleicher Form (Blech-Zugriff, Rechnung), Bestwert aus 3 Läufen. Node v22.15.1, i7-13700KF, 2026-10-22:

| Aufruf | Kosten je Aufruf |
|---|---|
| `teil.setzeLage(x, y)` (Teil-Methode → `teil_lage`) | ≈ 100 ns |
| `kreis.setzeRadius(r)` (generischer Komponenten-Setter → `setze_zahl`) | ≈ 155 ns |
| zum Vergleich: `teil_lage` direkt aus JS (ohne Interpreter) | ≈ 40 ns |

Der Rest des Interpreter-Aufrufs ist Methodenauflösung, Argumentprüfung und der Küchen-Schutz (`nurHauptkueche`); der Grenzübergang
JS → Wasm selbst ist der kleinere Teil.

## Wasm

Wasm-Programm-Pfad (Paket H4): die Laufzeit ruft den Kern über die Importgruppe `herd`, deren Importe der JS-Host **direkt an die
Exporte von `kern.wasm` bindet** (HOST-ABI §2) – kein JS zwischen Programm und Kern. Ziel B2 (HERD.md §6): ≤ 80 ns je Setter (Chrome).

`node bench/herd/setter-wasm.js 1000 60` – wie der Interpreter-Lauf (1000 Kreise, 60 Takte, Leerlauf abgezogen, Bestwert aus 3); dazu
der reine Grenzübergang (kleines Wasm-Modul, das den Import in einer Schleife ruft). Node v22.15.1 (V8), i7-13700KF, 2026-10-22, < 2 s:

| Aufruf | Kosten je Aufruf |
|---|---|
| Grenzübergang `herd.teil_lage` (Programm-Wasm → kern.wasm, direkt gebunden, inkl. Kern-Arbeit) | ≈ 7 ns |
| Grenzübergang `herd.setze_zahl` (direkt gebunden, inkl. Kern-Arbeit) | ≈ 7 ns |
| zum Vergleich: `herd.teil_lage` über eine JS-Hülle | ≈ 20 ns |
| pizza `teil.setzeLage(x, y)` im Wasm-Motor (Methodenauflösung + Argumente + Kern) | ≈ 58 ns |
| pizza `kreis.setzeRadius(r)` (generischer Komponenten-Setter → `setze_zahl`) | ≈ 28 ns |

Damit liegt der Setter im Wasm-Pfad unter dem Ziel von 80 ns (Node/V8 als Näherung für Chrome; die Browser-Messung folgt mit H6/H7).
Der Grenzübergang selbst ist der kleinste Teil – den Rest kosten Namensauflösung (`rt_mcall` → Tabelle nach Namens-ID) und
Argumentprüfung in der Laufzeit. Ein Batching-Import `setze_zahlen` ist nicht nötig.

## Kern

`node bench/herd/mess-kern.js` (baut `herd-skript` mit `cargo build -j 2 --release`): spielt B1–B4 in **voller Größe** aus
`tests/herd/szenen/` nativ (`herd-skript … --mess`, Release) und als `site/js/herd/kern.wasm` in Node (`herd/skript.js`).
Gemessen: Systeme je Takt (`takt`), Bildpaket bauen (`bild`), Kern-Zeit je gesendetem Bild (Takt + Bild; erstes Bild mit allen
Ressourcen nicht mitgezählt). Nur CPU, i7-13700KF, Node v22.15.1, Rust 1.98, 2026-10-22 (Paket H1b/H2a):

| Bench | Takt nativ | Bild nativ | Kern je Bild nativ (Median) | Takt Wasm | Bild Wasm | Kern je Bild Wasm (Median) | Ziel (HERD.md §6) |
|---|---|---|---|---|---|---|---|
| B1: 10 000 Sprites, Bewegung + Animation, 120 Takte | 0,111 ms | 0,357 ms | 0,47 (0,43) ms | 0,143 ms | 0,504 ms | 0,64 (0,62) ms | ≤ 2 ms EXE / ≤ 4 ms Chrome |
| B2: 10 000 Kreise, Lage je Takt vom Programm, 60 Takte | 0,001 ms | 0,258 ms | 0,26 (0,25) ms | 0,004 ms | 0,312 ms | 0,32 (0,30) ms | – |
| B3: 1 000 Körper, Sonne + Schatten, 8 Lichter, Nebel, 120 Takte | 0,004 ms | 0,074 ms | 0,08 (0,07) ms | 0,006 ms | 0,220 ms | 0,23 (0,21) ms | – |
| B4: 10 Emitter, 20 000 Teilchen (RATE 1000, 3 s), 180 Takte | 0,020 ms | 0,329 ms | 0,35 (0,40) ms | 0,030 ms | 0,458 ms | 0,49 (0,56) ms | Partikel ≤ 1,5 ms (EXE) |
| B5 (H-K5, 2026-10-23): 10 `Funken`-Emitter 3D, 20 000 Teilchen (RATE 1000), 180 Takte | 0,028 ms | 0,326 ms | 0,35 (0,40) ms | 0,040 ms | 0,463 ms | 0,50 (0,56) ms | Funken ≤ 1,5 ms (EXE) |
| B5 mit RATE 500 (10 000 Teilchen), nur nativ | 0,014 ms | 0,158 ms | 0,17 (0,20) ms | – | – | – | – |
| B6 (H-K6, 2026-10-23): 1 000 wandernde `Fuehler` 2D (+ 13 weitere 2D/3D), Bewegung, 120 Takte | 0,202 ms | 0,027 ms | 0,23 (0,22) ms | 0,314 ms | 0,051 ms | 0,36 (0,34) ms | Fühler-Nachlauf ≤ 0,5 ms (nativ) |
| B6 mit N = 10 000, 60 Takte | 6,959 ms | 0,319 ms | 7,25 (7,06) ms | 9,700 ms | 0,469 ms | 10,16 (10,10) ms | – (nur gemessen) |
| B7 (H-K7, 2026-10-23): 500 Kugeln + 125 Kisten mit `Wucht` in einer Schüssel (+ Schieber, Pfahl, Auslöser, 6 3D-Fühler), 240 Takte | 0,415 ms | 0,016 ms | 0,43 (0,46) ms | 0,593 ms | 0,030 ms | 0,62 (0,70) ms | Takt ≤ 1 ms bei 500 Kugeln (nativ) |
| B7 mit N = 2 000 (+ 500 Kisten), 240 Takte | 2,079 ms | 0,074 ms | 2,16 (2,20) ms | 2,844 ms | 0,108 ms | 2,96 (3,10) ms | – (nur gemessen) |
| B8 (H-K11a, 2026-10-24): `Gelaende` 256 × 256 (65 536 Punkte, 130 050 Dreiecke) + kleines Gelände mit Textur, 120 Takte, Netz einmal gebaut | 0,111 ms | 0,015 ms | 0,13 (0,002) ms | 0,187 ms | 0,020 ms | 0,21 (0,003) ms | – (nur gemessen) |
| B8 mit Neubau je Takt (`UMBAU` 1), 60 Takte | 7,805 ms | 0,485 ms | 8,29 (8,88) ms | 9,831 ms | 0,458 ms | 10,29 (10,71) ms | – (nur gemessen) |
| B9 (H-K10, 2026-10-24): `Fliesen` 256 × 256 Kacheln, wandernder Blick (später Zoom 0.5, gedreht), 200 Wucht-Körper auf festen Kacheln, 250 Takte | 0,077 ms | 0,013 ms | 0,09 (0,08) ms | 0,137 ms | 0,018 ms | 0,14 (0,12) ms | Bild ≤ 0,3 ms (nativ) |
| B10 (viele Lichter, 2026-10-25): `lichter.herd` N = 256 Punktlichter an einem drehenden Träger + 2 Spots, Reichweite 1 … 7, 120 Takte | 0,002 ms | 0,225 ms | 0,23 (0,22) ms | 0,031 ms | 0,399 ms | 0,40 (0,40) ms | – (nur gemessen) |
| B10 mit N = 1024, 120 Takte | 0,004 ms | 0,876 ms | 0,88 (0,81) ms | 0,009 ms | 0,961 ms | 0,97 (0,98) ms | – (nur gemessen) |
| B10 mit N = 4096, 60 Takte | 0,017 ms | 3,833 ms | 3,85 (3,66) ms | 0,028 ms | 4,364 ms | 4,39 (4,49) ms | – (nur gemessen) |
| B11 (Regen, 2026-10-25): `regen.herd` N = 40 000 → 2 × 10 000 Teilchen (Grenze je Sprüher; A mit Volumen, Strichen, Licht, Aufschlag und Spritzern, B deckend im Raum des Teils), 12 Lichter, 220 Takte | 0,140 ms | 0,844 ms | 0,98 (0,89) ms | 0,156 ms | 1,495 ms | 1,64 (1,56) ms | – (nur gemessen; B5 mit 20 000 Funken zum Vergleich 0,67 ms nativ) |
| B13 (Schatten, H-K18, 2026-10-25): `schatten.herd` N = 1000 Würfel, L = 8 Punktlichter mit Würfelschatten, NACHT = 1, AUS = 0, 120 Takte – Auswahl, Packen, 48 Kachel-Matrizen, Werfer je Kachel (Hülle gegen Kachel-Frustum) als Instanz-Kopien | 0,001 ms | 0,424 ms | 0,43 (0,42) ms | 0,019 ms | 0,533 ms | 0,53 (0,47) ms | – (nur gemessen; Draw-Calls siehe Glut) |
| B9 mit 4 × 4 Rastern à 256² = 1024 × 1024 Kacheln, 250 Takte | 0,179 ms | 0,033 ms | 0,21 (0,19) ms | 0,254 ms | 0,049 ms | 0,30 (0,30) ms | – (nur gemessen) |
| B12 (H-K17, 2026-10-25): `schwung.herd` N = 500 Kisten mit `Schwung` als 10 × 10 Türme à 5 Lagen auf einem Tisch in einer Gelände-Mulde (+ Rampe aus eigenem Netz, Drehscheibe, Kind, Kugel, Kapsel), 240 Takte | 1,696 ms | 0,047 ms | 1,75 (1,75) ms | 2,010 ms | 0,141 ms | 2,13 (1,96) ms | Takt ≤ 2 ms bei 500 Kisten (nativ) – erreicht |
| B12 mit K = 2 000 Kugeln/Kapseln (ohne Kisten), 120 Takte | 3,210 ms | 0,011 ms | 3,23 (2,14) ms | 3,132 ms | 0,017 ms | 3,15 (2,11) ms | – (nur gemessen) |
| H-K21 (Spiegelbild voll, 2026-10-25): Neon-Napoli, aufgezeichnetes Skript (664 Takte, 166 Bilder, ~110 Lichter, Regen), `spiegelGuete` **einfach** | 0,049 ms | 0,425 ms | 0,62 (0,61) ms | – | – | 1,11 (1,07) ms | – (nur gemessen) |
| dasselbe mit `spiegelGuete` **voll** (zweite Zellen-Tabelle, gespiegeltes Frustum für Körper, Teilchen, Schattenwahl) | 0,046 ms | 0,478 ms | 0,66 (0,67) ms | – | – | 1,20 (1,15) ms | – (nur gemessen; +0,05 ms nativ, +0,09 ms Wasm je Bild) |
| B14 (H-K20, 2026-10-25): `figur.herd` N = 100 Figuren (+ 5 an Treppe, Plattform, Aufzug, Kiste, Rampe) auf einem Gelände mit Mulde, Wand, Treppe, Rampe aus eigenem Netz, 240 Takte (S = 0) | 0,361 ms | 0,004 ms | 0,36 (0,38) ms | 0,606 ms | 0,008 ms | 0,59 (0,59) ms | Takt ≤ 0,5 ms bei 100 Figuren (nativ) – erreicht |
| B14 Strahlen: 1 000 `Strahl` (Höhenabfrage im Raster) je Takt lesen (`punktY`), nach je einem Takt mit 100 Figuren, 120 Takte | 0,381 ms (Median 0,357) | – | – | 0,579 ms | – | – | 1 000 Strahlen ≤ 1 ms je Takt (nativ) – erreicht |
| B15 (H-K25, 2026-10-25): `aufprall.herd` N = 40 000 → 2 × 10 000 Regentropfen (Grenze je Sprüher) über 16 Häusern auf gewelltem Gelände (+ Kugel, Kapsel, Netz-Rampe, Auslöser, abprallende Funken, liegende Glut), `KOLL` = 0: **ohne Kollision**, 180 Takte | 0,104 ms | 0,443 ms | 0,55 (0,55) ms | 0,177 ms | 0,939 ms | 1,09 (1,11) ms | – (Vergleich) |
| B15 mit `KOLL` = 1: `kollision: "boden"` (Ebene), Spritzer | 0,139 ms | 0,474 ms | 0,61 (0,58) ms | 0,215 ms | 0,969 ms | 1,18 (1,17) ms | 20 000 gegen Ebene ≤ 0,5 ms je Takt (nativ) – erreicht |
| B15 mit `KOLL` = 2: `kollision: "welt"` (Häuser, Gelände, Kugel, Kapsel, Netz), Spritzer | 1,108 ms | 0,493 ms | 1,61 (1,45) ms | 1,467 ms | 0,949 ms | 2,42 (2,19) ms | 10 000 gegen Gelände ≤ 2 ms je Takt (nativ) – erreicht (20 000 gegen Stadt + Gelände 1,1 ms) |
| H-K24 (Bildschirmraum, 2026-10-25): Neon-Napoli, aufgezeichnetes Skript (664 Takte, 166 Bilder) ohne / mit `verdeckung` 1.8 + `bildspiegel` 1 (Abschnitt BILDRAUM, 40 B je Paket) | 0,418 / 0,412 ms | 0,548 / 0,531 ms | 2,23 / 2,19 (2,15 / 2,15) ms | – | – | – | – (nur gemessen; im Rauschen – der Kern schreibt nur 32 B; Stand nach H-K20/H-K16/H-K25: Figur, Modelle, Regen-Kollision) |
| B17 (H-K23a, 2026-10-25): `puppe.herd` N = 33 → 102 Puppen à 50 Gelenke (Testmodell `puppe.glb`, je ein Drittel Winken/Nicken/Welle, eine Überblendung, eine Kopie), 240 Takte | 0,302 ms | 0,176 ms | 0,48 (0,44) ms | 0,544 ms | 0,359 ms | 0,90 (0,82) ms | Takt ≤ 1,5 ms bei 100 × 50 Gelenken (nativ) – erreicht |

B5 (`tests/herd/szenen/b5-funken.herd`): Takt = Altern, Schwerkraft, Bewegen, Ausstoß im Kegel (libm `sin`/`cos`/`sqrt`); Bild =
Sichtkörper-Test je Teilchen, deckende nach Abstand sortieren (5 der 10 Emitter), 20 Bytes je Teilchen schreiben. Paket ≈ 262 KB
bei ~19 000 sichtbaren Teilchen. Glut auf WARP (640 × 360, MSAA 4×, `herd-bild bench … RATE=1000 TAKTE=180`): **3 Draw-Calls**
(Himmel + je Mischart einer), 19 131 Teilchen, 25,9 ms je Bild (Median, CPU-Rasterizer).

B6 (`tests/herd/szenen/fuehler.herd`, Vorgabe `N`): Takt = Bewegung (N Teile) + **Fühler-Nachlauf** (Formen aus Hülle/Maßen,
Breitphase Sweep-and-Prune entlang x in bis zu 64 waagerechten Streifen, Engphase `trifft`, Listen `beruehrt`/`betreten`/
`verlassen` nach ID); die Bewegung allein kostet bei 10 000 Teilen ≈ 0,1 ms (B1), der Rest ist der Nachlauf. Die Szene ist
absichtlich dicht (N Rechtecke 8–24 × 6–16 px, halb mit 30 px breiten Fühlern, auf 1280 × 720 – bei N = 10 000 berührt jeder Fühler
im Mittel mehrere andere). Ohne Streifen (reines 1D-Sweep) kostete N = 10 000 rund 73 ms je Takt (1,26 Mio. x-Überlappungen gegen
34 561 echte Paare im Kern-Test); mit Streifen und wiederverwendeten Listen 7 ms. Ziel (HERD.md §12.4 H-K6): 1 000 Fühler ≤ 0,5 ms
nativ – erreicht (0,20 ms inkl. Bewegung).

B7 (`tests/herd/szenen/wucht.herd`, Vorgabe `N`): Takt = **Wucht** (Kräfte, feste Fühler sammeln, Breitphase `fuehler::breitphase`,
Engphase `wucht::kontakt`, Warmstart, je 4 Iterationen Impuls und Positionskorrektur, Lage zurückschreiben) + **Fühler-Nachlauf**
(alle Körper sind auch Fühler). Die Körper fallen aus einem Raster in eine Schüssel aus dicken festen Fühlern und liegen nach
≈ 1 s als Haufen (viele Kontakte je Körper) – gemessen ist also überwiegend der dichte Fall. Ziel (HERD.md §12.4 H-K7): Takt ≤ 1 ms
nativ bei 500 Kugeln – erreicht (0,42 ms inkl. Fühler-Nachlauf; Wasm 0,59 ms). Gemessen nach dem Rebase auf H-K1/PD1, CPU-only,
Rechner nebenbei belastet (Werte daher eher zu hoch).

B8 (`tests/herd/szenen/gelaende.herd`, Vorgaben `N`, `UMBAU`): Takt = **Gelaende** (Prüfwert der Netz-Felder, bei Änderung Netzbau:
Punkte/UV in f64 → f32, 130 050 Dreiecke, glatte Normalen, Netz-Bytes 3,6 MB schreiben und in den Ressourcen-Hash nehmen). Mit Neubau in
jedem Takt kostet ein Bau ≈ 7,8 ms nativ / 9,8 ms Wasm (dazu Bild ≈ 0,5 ms für das Ressourcen-Delta von 3,6 MB) – daher die Doku-Regel
„nicht je Takt umformen“. Ohne Änderung kostet der Takt nur den Prüfwert: die Szene hat eine kurze Höhenliste (fehlende = 0), mit voller
Liste (65 536 Höhen, eigener Lauf mit `herd-skript --mess`) ≈ 0,07 ms je Bild nativ (Median). Rechner beim Lauf belastet (B7 lag
doppelt so hoch wie in der eigenen Messung oben), Werte daher eher zu hoch.

B9 (`tests/herd/szenen/fliesen.herd`, Vorgaben `S`, `CHUNKS`, `N`): Bild = Bildbeitrag `Fliesen` nur im Sichtfenster
(`fliesen::fenster` aus `Bildbau::sicht_welt()`), ≈ 290 Kachel-Instanzen bei Zoom 1, ≈ 1 000 bei Zoom 0.5 – unabhängig von der
Kartengröße (16 Raster kosten nur 16 Fenster-Rechnungen). Takt = `Wucht` mit 200 Körpern und Kachel-Kontakten (je Körper nur die
Kacheln unter seiner Hülle) + Fühler-Nachlauf. Ziel (HERD.md §12.4 H-K10): Bild ≤ 0,3 ms nativ – erreicht (0,013 / 0,033 ms).

B12 (`tests/herd/szenen/schwung.herd`, Vorgaben `N`, `K`): Takt = **Schwung** (Lage übernehmen, Kräfte, feste Fühler sammeln und gedrehte Formen bauen, Breitphase `fuehler::breitphase`, Inseln, Engphase `kollision3d` – Kasten–Kasten über 15 Trennachsen mit bis zu 4 Punkten, Gelände analytisch, Netz über den Hüllen-Baum –, Warmstart nach Ort, 8 Impuls-Iterationen je Kontaktfläche, 4 Iterationen Positionskorrektur, Zurückschreiben mit Quaternion → Winkel) + **Fühler-Nachlauf** (alle Körper sind auch Fühler). Die Kisten fallen wenige Zentimeter auf ihren Turm und wanken; ein Turm ist eine Insel und schläft erst, wenn alle seine Kisten ruhen – gemessen ist also überwiegend der wache Fall; ruhende Inseln kosten danach nur Breitphase und Nachlauf. Der Löser rechnet je Kontaktrichtung vorab Hebel und Dreh-Antworten (I⁻¹ (r × d)) und arbeitet auf einem dichten Tempo-Feld – das senkte den Löser-Anteil gegenüber dem ersten Wurf (Kopien des ganzen Körpers je Kontakt) auf rund ein Drittel. Ziel (HERD.md §13.3 H-K17): 500 Kisten Takt ≤ 2 ms nativ – erreicht (1,70 ms inkl. Fühler-Nachlauf; Wasm 2,01 ms). Gemessen neben anderen Agents (B7 lag im selben Lauf bei 0,40 ms, wie in seiner eigenen Messung), CPU-only.

B14 (`tests/herd/szenen/figur.herd`, Vorgaben `N`, `S`): Takt = **Figur** (Ziele: alle Fühler-Formen einmal je Takt, je Figur eigene Kapsel, Hindernisse per Kasten-Vortest, waagerecht und senkrecht wischen in Teilschritten mit bis zu 4 Durchgängen Herausschieben, Gelände als Dreiecke unter der Kapsel, Kanten-Strahl, Stufe nur bei niedriger Wand, Kleben per Halbieren) + **Schwung** (Plattformen, Kiste) + **Fühler-Nachlauf**. Die Figuren laufen in verschiedene Richtungen über das gewellte Gelände, stoßen aneinander und an die Wand. Erster Wurf 0,58 ms: der Stufen-Versuch lief bei jeder Wandberührung (auch Figur an Figur), das Kleben halbierte 14-mal – jetzt Stufe nur, wenn die Wand bis `stufe` über dem Fuß aufhält, Halbieren nur bis 0,005 (Kontaktrand / 2): 0,36 ms. Strahlen: `node bench/herd/mess-kern.js --nur B14` (Wasm aus JS) bzw. `cargo test --release -j 2 -p herd-skript --test strahlen -- --ignored --nocapture` (nativ); die erste Abfrage nach dem Takt baut die Ziele (≈ 0,05 ms), jede weitere prüft die Kästen aller ≈ 115 Ziele linear und trifft das Gelände über die Zellen unter dem Strahl. Gemessen neben anderen Agents, CPU-only.

B15 (`tests/herd/szenen/aufprall.herd`, Vorgaben `N`, `KOLL`; `node bench/herd/mess-kern.js --nur B15`): Takt = **Funken** mit Aufprall
(je Emitter: Kasten aller Wege, Ziele aus `kollision3d::ziele` – einmal je Takt – in ein waagerechtes Gitter mit Oberkante je Zelle, je
Teilchen die Zellen unter seiner Strecke, Kasten-Vortest, Strahl gegen Kasten/Kugel/Kapsel/Netz-Baum/Gelände-Raster) + **Bewegung**. Bei
`boden`/`welt` ist ein Teil der 20 000 Teilchen Spritzer, die dicht über Flächen leben und darum immer geprüft werden; der Rest fällt meist über
der Oberkante der Zellen (zwei Vergleiche). Bild unverändert (gleiche Teilchenzahl). Gemessen neben anderen Agents, CPU-only.
B17 (`tests/herd/szenen/puppe.herd`, Vorgaben `N`, `TAKTE`): Takt = **Puppe** je Modell-Wurzel: Folge nachschlagen, Zeit fortschreiben, Zuordnung Knoten → Teil über den Teilbaum (jeden Takt neu, ohne Cache), je Kanal binäre Suche und Lerp bzw. Slerp, Quaternion → Euler, Lage schreiben und Teilbaum markieren; Bild = Welt-Matrizen der 5 100 Gelenk-Teile. Gemessen neben anderen Agents, CPU-only.

Setter `teil_lage` direkt am Kern (B2, 10 000 Teile × 60): **nativ 4,3 ns**, **Wasm aus JS 9,4 ns** je Aufruf (warm; Ziel ≤ 80 ns
Chrome / ≤ 150 ns wasmi – der wasmi-Weg kommt mit H4/H5). Bildpaket: B1 ≈ 506 KB, B4 ≈ 728 KB je Bild (fast nur INST2D).
Bewertung: Kern weit unter den Zielen; der Bildbau (Instanzen schreiben + 2D-Sortierung) dominiert, Systeme sind billig.

## Glut (WARP)

`herd-bild bench <skript> --groesse=640x360 [--ohne-instancing] VAR=…` (Profil `messung`: `cargo build -j 2 --profile messung
-p herd-werkzeug`): je Bild Hochladen + Zeichnen + Warten auf das Gerät (ohne Auslesen), Median ohne erstes Bild. **Adapter:
Microsoft Basic Render Driver (WARP, DX12, CPU-Rasterizer), MSAA 4×, 640 × 360.** Auf WARP misst man vor allem den CPU-Rasterizer
(Pixel × MSAA × Fragment-Shader); die Wirkung von Instancing zeigt sich hier hauptsächlich in der Zahl der Draw-Calls. Die
Aussagekraft für echte GPUs hat der Abschnitt „vom Nutzer auszuführen“.

| Szene | Instanzen | Draw-Calls ohne Instancing (Grundlinie) | Draw-Calls mit Instancing | Glut je Bild ohne / mit Instancing |
|---|---|---|---|---|
| B1 N=2000 | 1 963 2D | 1 963 | **1** | 24,9 / 19,5 ms |
| B1 N=10000 (voll) | 9 988 2D | 9 988 | **1** | 123,8 / 96,5 ms |
| B3 N=300 | 301 3D | 603 (301 Schatten) | **15** (7 Schatten) | 43,8 / 41,3 ms |
| B3 N=1000 (voll) | 1 001 3D | 1 947 (1 001 Schatten) | **15** (7 Schatten) | 113,9 / 109,3 ms |
| B4 RATE=300 | 2 960 2D | 2 960 | **1** | 14,9 / 11,8 ms |
| B13 (H-K18, 2026-10-25): `schatten.herd` N=1000 L=8 NACHT=1 AUS=0 – 8 Punktlichter mit Würfelschatten (Güte reihum grob/mittel/fein) + 1 000 Würfel + Boden, letztes Bild | 1 110 3D (inkl. Werfer-Kopien je Kachel) | – | **76** (73 Schatten; Ziel ≤ 120) | – / 46,5 ms (Median über alle Bilder; 60 fps EXE vom Nutzer auf echter GPU) |
| `3d-punktschatten` (3 Würfel + 2 Spot-Kacheln) / `3d-kaskaden` (4 Kaskaden) | 124 / 255 3D | – | 62 (57 Schatten) / 16 (12 Schatten) | – / 20,0 / 16,4 ms |
| H-K21 (2026-10-25): Neon-Napoli (Skript wie oben, 1280 × 720, letztes Bild), `spiegelGuete` einfach / **voll** | 4 064 / 7 630 3D (Regen im Spiegel, Sichtbares nur im Spiegel) | – | 39 / **41** (je 14 Schatten) | – / 774 / 1 118 ms (Median; WARP, Debug-Werkzeug – Spiegel in voller statt halber Größe mit allen Lichtern: +44 % auf der CPU-Rasterung) |
| `3d-spiegel-voll` mit `VOLL=0` (einfach) / voll | 242 / 400 3D | – | 31 / 34 (je 6 Schatten) | – |
| B16 (H-K24, 2026-10-25): `3d-verdeckung` 1280 × 720, `VERDECKUNG=0` / 1.4 (Vorlauf 1 280 × 720 ohne MSAA, Verdeckung 640 × 360 + 2 × Weichzeichnen) | 60 3D | – | 6 / **13** (+ 4 Vorlauf, + 3 Verdeckung) | – / 139,5 / 208,1 ms (WARP, Profil `messung`, nur indikativ: +68,6 ms auf der CPU-Rasterung) |
| B16: `3d-bildspiegel` 1280 × 720, `BILDSPIEGEL=0` / 1 (Vorlauf, Farbstufen 1 280 × 720 … 80 × 45, SSR 1 280 × 720 in das MSAA-Ziel) | 17 3D | – | 17 / **26** (+ 4 Vorlauf, + 4 Farbstufen, + 1 SSR; der HDR-Durchgang ist zweigeteilt) | – / 98,5 / 199,6 ms (WARP, indikativ: +101 ms) |
| H-K24 (2026-10-25): Neon-Napoli (Skript wie oben, 1280 × 720, 166 Bilder) ohne / mit Bildraum (`verdeckung` 1.8, `bildspiegel` 1; Vorlauf 1 280 × 720, Verdeckung 640 × 360, Farbstufen 1 280 × 720 … 80 × 45) | 6 223 3D | – | 69 / **87** (je 30 Schatten; + Vorlauf, 3 Verdeckung, 4 Farbstufen, 1 SSR) | – / 1 125 / 1 641 ms (Median; WARP, Debug-Werkzeug, indikativ: +46 % auf der CPU-Rasterung) |
| B18 (H-K26, 2026-10-25): `3d-karten` 1280 × 720, `KARTEN=0` / 1 (Normal-, Stoff-, Leucht-Karte, Schwelle; einseitige Züge eigene Draw-Calls) | 15 3D | – | 9 / **11** (4 / 5 Schatten; + 1 einseitiger FEST-Zug, + 1 Schatten-Zug durch die Teilung) | – / 178,3 / 265,7 ms (WARP, Profil `messung`, ein gemessenes Bild, nur indikativ: +87 ms für drei zusätzliche `textureSampleGrad` je Fragment auf der CPU-Rasterung) |

Ziele erfüllt, soweit auf WARP messbar: B1 ≤ 4 Draw-Calls (1), B3 ≤ 30 Draw-Calls inkl. Schatten (15). Die Draw-Calls wachsen mit
der Zahl der **Arten** (Netze), nicht der Objekte. Erstes Bild (Pipelines anlegen, Ressourcen, Shadow-Map) ≈ 100–230 ms auf WARP.
Pipelines werden je Zielformat einmal erzeugt (Cache), Instanzpuffer nur vergrößert (Zweierpotenzen), Ressourcen nur als Deltas.

## Binärgröße (Kern + Glut)

`cargo build -j 2 --profile klein -p herd-glut --example groesse` (Profil `klein`: opt-level "z", LTO, codegen-units 1, strip,
panic abort; `herd/glut/examples/groesse.rs` = Kern + Glut, ein Bild offscreen): **2 530 304 Bytes (2,4 MiB)**, Windows x64,
wgpu 30 nur mit DX12-Backend und WGSL. Ziel der Windows-EXE (HERD.md §7.1): ≤ 6 MB inkl. Host, wasmi, Laufzeit und winit (H5).

## Vorbacker (PROJEKTE PD1)

`node bench/herd/mess-teigling.js` – Vorbacken (Dekodieren + Mipmaps + Teigling schreiben, inkl. SHA-256 der Quelle) je Bild,
Bestwert aus 5 Läufen; nativ = `herd-teigling messe` (Release), Wasm = `site/js/herd/teigling.wasm` über die JS-Hülle in Node
(V8). Messbilder aus `testbild::messbilder()` (1024 × 1024, Verläufe + Kanten + Rauschen; PNG RGBA mit Alpha, Filter Paeth;
JPEG 4:2:0 Qualität 85 mit optimierten Huffman-Tabellen). Beide Wege liefern byte-gleiche Teiglinge. Node v22.15.1,
i7-13700KF, 2026-10-23:

| Bild | Quelle | Teigling | nativ | Wasm (Node) |
|---|---|---|---|---|
| 1024² PNG RGBA | 1 106 KiB | 5,33 MiB (5 592 500 Bytes, 11 Stufen) | 29 ms | 45 ms |
| 1024² JPEG 4:2:0 Baseline | 191 KiB | 5,33 MiB (11 Stufen) | 17 ms | 24 ms |
| 1024² JPEG 4:2:0 progressiv | 187 KiB | 5,33 MiB (11 Stufen) | 21 ms | 29 ms |

Bewertung: Vorbacken eines 1024²-Bildes kostet im Browser-Worker Größenordnung 25 … 50 ms – einmal je Bild und Quell-Hash
(Cache, PROJEKTE.md §5.4), also kein Thema für Ladezeiten; ein 2048²-Bild ≈ das Vierfache. Der Teigling ist ≈ 5 × (PNG) bis
29 × (JPEG) größer als die Quelle – deshalb teilt v1 die Quellbilder und backt beim Empfänger (§5.4). `teigling.wasm`: 75 564
Bytes, 27 954 Bytes gzip (Stufe 6).

## Glut-Texturen (PROJEKTE PD3)

`herd-bild textur --kanten=256,1024,2048 --laeufe=5` (Profil `messung`, Software-Adapter **WARP**, MSAA 4×, 640 × 360): je Kante
ein Muster-Teigling (Schachbrett, volle Mip-Kette), Median aus 5 Läufen mit je neuer Glut. **Kern** = `bildchen_teigling` nativ
(Kopfprüfung + Übernahme der Stufen). **Glut** = ein Bild mit Hochladen der TEXTUR (alle Stufen vormultipliziert, `write_texture`
je Stufe, Klasse anlegen) + Zeichnen + Warten, gegen dasselbe Bild ohne Hochladen. **Grafikspeicher** = angelegte Textur-Arrays der
eigenen Texturen (`textur_speicher()`); i7-13700KF, 2026-10-24:

| Kante | Teigling | Kern | Glut-Bild mit / ohne Hochladen | Hochladen | hochgeladen | Grafikspeicher |
|---|---|---|---|---|---|---|
| 256² | 349 612 Bytes (9 Stufen) | 0,35 ms | 21,7 / 9,7 ms | **≈ 12 ms** | 0,33 MiB | 0,33 MiB |
| 1024² | 5 592 500 Bytes (11 Stufen) | 8,5 ms | 170,4 / 19,7 ms | **≈ 151 ms** | 5,33 MiB | 5,33 MiB |
| 2048² | 22 369 720 Bytes (12 Stufen) | 26,1 ms | 608,9 / 18,4 ms | **≈ 590 ms** | 21,33 MiB | 21,33 MiB |

Bewertung: Auf WARP kostet das Hochladen eines 1024²-Teiglings einmalig ≈ 150 ms (CPU-Kopien in die Mip-Ebenen; ein Paket je
Bild, in der Regel beim Start) – auf einer echten GPU erwartungsgemäß wenige Millisekunden (Messung unten, vom Nutzer). Danach
kostet die Textur nichts mehr je Bild (Bild ohne Hochladen wie ohne Textur). Der Grafikspeicher entspricht bei Zweierpotenz-Kanten
genau den Teigling-Stufen (≈ b · h · 4 · 4/3); andere Größen landen in der nächsten Klasse (schlimmstenfalls knapp × 4, z. B.
1025² → 21,3 MiB statt 5,3 MiB), auf WebGL2 belegt eine Klasse mindestens 2 Schichten. Mit der Teigmenge ≤ 64 MiB (P0020, bis 2026-10-25: 32 MiB) bleibt
der Bedarf damit ≤ 256 MiB, typisch ≈ 64 MiB. Pixeltest WebGL2 (E2E 13) der drei PD3-Szenen: mittlere Abweichung 0,007 … 0,210 %,
99,58 … 99,94 % der Pixel innerhalb 10/255; Browser-Glut 1 916 KiB roh (+15 KiB), 721 KiB gzip.

## Vom Nutzer auszuführen (echte GPU)

Diese Messungen brauchen die **echte GPU** und werden deshalb von keinem Agenten ausgeführt. Bitte nur starten, wenn kein Spiel
läuft. Vorher einmal bauen: `cd herd && cargo build -j 4 --profile messung -p herd-werkzeug`.

```sh
cd D:\Projekte\pizza
herd\target\messung\herd-bild.exe bench tests\herd\szenen\b1-sprites.herd N=10000 TAKTE=120 --groesse=1280x720 --gpu
herd\target\messung\herd-bild.exe bench tests\herd\szenen\b1-sprites.herd N=10000 TAKTE=120 --groesse=1280x720 --gpu --ohne-instancing
herd\target\messung\herd-bild.exe bench tests\herd\szenen\b3-koerper.herd N=1000 TAKTE=120 --groesse=1280x720 --gpu
herd\target\messung\herd-bild.exe bench tests\herd\szenen\b3-koerper.herd N=1000 TAKTE=120 --groesse=1280x720 --gpu --ohne-instancing
herd\target\messung\herd-bild.exe bench tests\herd\szenen\b4-partikel.herd RATE=1000 TAKTE=180 --groesse=1280x720 --gpu
herd\target\messung\herd-bild.exe bild tests\herd\bilder\3d-alles.herd tmp\gpu-bilder --gpu
herd\target\messung\herd-bild.exe textur --kanten=256,1024,2048 --laeufe=5 --gpu
herd\target\messung\herd-bild.exe bild tests\herd\bilder\3d-textur.herd tmp\gpu-bilder --gpu
```

Die `textur`-Zeile misst das Hochladen eigener Texturen (PD3) auf der GPU – bitte als Tabelle „Glut-Texturen (GPU)“ eintragen.

Jede `bench`-Zeile gibt eine JSON-Zeile aus (`glut_median_ms`, `draw_calls`, Adapter); bitte hier als Tabelle „Glut (GPU)“
eintragen. Die letzte Zeile rendert das 3D-Referenzbild auf der GPU zum Sichtvergleich mit `tests/herd/bilder/3d-alles.png`.
`HERD_SOFTWARE=1` erzwingt trotz `--gpu` den Software-Adapter.

## Nativ (Host, H5)

`pizza-host --herd-messung` schreibt je Sekunde: Bilder/s, Bildzeit, Anteil Programm/Kern/Glut, Draw-Calls, Instanzen
(`host/README.md` „Herd“). Agenten messen nur offscreen auf WARP (`--herd-bilder`, zeichnet und liest jedes gespeicherte Bild aus –
kein Leistungswert). Größe der Windows-EXE mit Herd: 4 411 904 Bytes (vorher 1 698 816), Ziel ≤ 6 MB erfüllt.
Es gibt (noch) keine `bench/herd/*.pizza`; gemessen wird mit den Herd-Beispielen (`teigball` = 3D mit Schatten, `teigfaenger` = 2D).

### Vom Nutzer auszuführen (Fenster, echte GPU)

```sh
cd D:\Projekte\pizza\host
cargo build --release
node -e "global.PizzaLang=require('../site/js/pizza.js');const P=require('../site/js/pizzaiolo.js');const fs=require('fs');for(const b of ['teigball','teigfaenger'])fs.writeFileSync(b+'.pkarton',P.kompiliere(fs.readFileSync('../site/beispiele/herd/'+b+'.pizza','utf8')).pkarton)"
target\release\pizza-host.exe --herd-messung teigball.pkarton
target\release\pizza-host.exe --herd-messung teigfaenger.pkarton
```

Bitte die Zeilen nach einigen Sekunden Spiel hier als Tabelle „Nativ (GPU)“ eintragen. Das Fenster schließen beendet den Lauf.

## Browser (SwiftShader)

Paket H6: Glut-Web (`site/js/herd/glut_bg.wasm`, wgpu → WebGL2) und `kern.wasm` in **Chrome 155 headless mit `--disable-gpu`**
– WebGL2 kommt aus **SwiftShader** (ANGLE/Vulkan auf der CPU). Die Zahlen sind daher **nur indikativ** (CPU-Rasterizer, 1280 × 720,
MSAA 4×); sie zeigen, dass der Pfad trägt und dass Draw-Calls/Instanzen dieselben sind wie nativ. Lauf (≈ 8,5 s, je Benchmark
höchstens ~2 s gezeichnet): `cd e2e && HERD_MESSUNG=1 node --test tests/15-herd-messung.test.mjs`. Kern und Glut laufen dabei in
der Seite hintereinander (Kern: `herd/skript.js` gegen `kern.wasm`; Glut: `bild()` + Abwarten der GPU durch ein 1×1-Auslesen),
volle Größe nach HERD.md §6. i7-13700KF, 2026-10-22:

| Bench | Instanzen | Draw-Calls | Kern je Bild (Takte + Bildpaket, Median) | Glut je Bild (SwiftShader, Median) |
|---|---|---|---|---|
| B1: 10 000 Sprites, Bewegung + Animation | 9 911 2D | 1 | 0,65 ms | 84 ms |
| B2: 10 000 Kreise | 10 000 2D | 1 | 0,34 ms (ohne Programm-Setter) | 84 ms |
| B3: 1 000 Körper, Sonne + Schatten, 8 Lichter, Nebel | 1 001 3D | 15 (inkl. Schatten) | 0,34 ms | 336 ms |
| B4: 10 Emitter, ≈ 19 000 Teilchen | 19 243 2D | 1 | 0,88 ms | 153 ms |

Bewertung: Kern im Browser (V8) weit unter dem Ziel ≤ 4 ms (Chrome); Draw-Calls wie nativ (B1 ≤ 4, B3 ≤ 30). Die Glut-Zeiten sind
reine Software-Rasterung (Pixel × 4 Proben × Fragment-Shader) und sagen über eine echte GPU nichts aus. Pixeltest WebGL2 gegen die
nativen Referenzbilder: mittlere Abweichung 0,007 … 0,040 %, 99,6 … 100 % der Pixel innerhalb 10/255 (`e2e/tests/13-herd-glut`).
Größe der Browser-Glut: `glut_bg.wasm` 1 893 KiB roh, **712 KiB gzip** (nginx Stufe 6), 564 KiB Brotli; Glue `glut.js` 138 KiB
(ohne `wasm-opt` – binaryen ist hier nicht installiert).

### Vom Nutzer auszuführen (Browser, echte GPU)

Bitte nur starten, wenn kein Spiel läuft – beides nutzt die **echte GPU** (in Chrome WebGPU, sonst WebGL2):

1. **Messlauf B1–B4 automatisch** (headless, kein sichtbares Fenster, ≈ 10 s): `cd e2e && set HERD_MESSUNG=1&& set E2E_GPU=1&& node --test
   tests/15-herd-messung.test.mjs` (PowerShell: `$env:HERD_MESSUNG=1; $env:E2E_GPU=1; node --test tests/15-herd-messung.test.mjs`).
   Die Ausgabe nennt je Benchmark Schnittstelle (WebGPU/WebGL2), Adapter, Glut- und Kern-Zeit je Bild – bitte als Tabelle
   „Browser (GPU)“ hier eintragen.
2. **Echte Bildrate im Playground:** `npm --prefix e2e run server` (oder die laufende Seite), in Chrome die Programme aus
   `bench/herd/*.pizza` (H7) backen – die Statuszeile unten links im Vorschaufenster zeigt Schnittstelle, fps, Draw-Calls und
   Instanzen (Ziel HERD.md §6: 60 fps bei B1–B4).

## Anlauf und VSync (erste Bilder, Pizza-Konfigurator)

Nutzerbefund: die ersten Bilder des Pizza-Konfigurators (`site/beispiele/herd/konfigurator/`, viel Text, UI-Bausteine) ruckeln,
„VSync scheint aus“. Ursachen (nativ und Browser gleich):

1. Die Glut übersetzte ihre 9 Pipelines **erst im ersten `bild()`** (nativ FXC: ≈ 200 ms auf WARP; Browser ANGLE/SwiftShader ≈ 25 ms),
   und die Takt-Uhr lief da schon – Bild 2 holte 2–4 Takte nach (sichtbarer Sprung, danach noch einmal).
2. Die Uhr begann mit der ersten Anforderung, nicht mit dem ersten gezeigten Bild; Anforderungen fielen genau auf Taktgrenzen,
   so dass Zittern im rAF zwischen 0 und 2 Takten je Bild wechselte.
3. Nativ `PresentMode::AutoVsync`: unter Vulkan wählt das `FifoRelaxed` – verspätete Bilder (eben die ersten) reißen (Tearing).
   Unter DX12 war es schon Fifo. Das Fenster wurde vor dem ersten Bild sichtbar (leer, bis Glut + Programm + Bild 1 fertig waren).

Korrekturen: Pipelines beim Anlegen der Glut (vor dem ersten Takt); Uhr beginnt mit dem ersten gezeigten Bild (Browser: im rAF danach,
wenn der Browser es wirklich gezeichnet hat), halber Schritt versetzt; nativ `PresentMode::Fifo` und Fenster erst nach dem ersten
Bild sichtbar. Messung: `--herd-messung` (Zeilen `Herd-Anlauf: …`) bzw. E2E `HERD_MESSUNG=1` „Anlauf Pizza-Konfigurator“
(`{typ:"anlauf"}` des Zeichners). Nie die echte GPU: nativ WARP im **unsichtbaren** Fenster (`PIZZA_KEIN_DIALOG=1`), Browser
headless SwiftShader – Zahlen indikativ. i7-13700KF, 2026-10-25, je 2–4 Läufe:

| Weg | Glut anlegen | Bild 1: Glut | Bild 2 | Bilder 2–30 mit nachgeholten Takten | größter Abstand Bild 2–30 |
|---|---|---|---|---|---|
| EXE-Fenster (WARP) vorher | 550–900 ms | 200–250 ms | **4 Takte** | 3–4 (je 4 Takte, Lücken ≈ 100 ms) | 105 ms; 29–37 Bilder/s in Sekunde 1–2 |
| EXE-Fenster (WARP) nachher | 580–830 ms (inkl. ≈ 200 ms Pipelines) | 3 ms | 1 Takt | **0** | 18–31 ms; 60 Bilder/s ab Sekunde 1 |
| offscreen `--herd-bilder` vorher / nachher | 530 / 650–770 ms | 341 / 27–34 ms | – | – | – |
| Playground (SwiftShader) vorher | bereit nach 68–84 ms | 32–39 ms | Nr 3–4 (2–3 Takte) | 2 | 33–36 ms; Bildnummer 32–33 bei Bild 30 |
| Playground (SwiftShader) nachher | bereit nach 113–177 ms | 8–13 ms | Nr 2 (1 Takt) | **0** | 40–59 ms (Browser zeigt Bild 1 noch); Bildnummer 30 bei Bild 30 |

Bewertung: Die Simulation läuft nach dem ersten Bild gleichmäßig (Takt für Takt, keine Sprünge); die Kosten liegen jetzt vor dem
ersten Bild (Glut anlegen), wo sie nicht als Ruckeln sichtbar sind. Die 100-ms-Lücken vorher im unsichtbaren WARP-Fenster
verschwanden mit dem Warm-up ebenfalls (WARP übersetzte im Hintergrund nach). Auf einer echten GPU bitte prüfen
(Nutzer): `target/release/pizza-host --herd-messung konfigurator.pkarton` – die `Herd-Anlauf`-Zeilen sollten ab Bild 2 Abstände um
16,7 ms und je 1 Takt zeigen.

## Gleichmäßige Bilder im Browser (Ruckler mitten im Spiel, Neon-Napoli)

Nutzerbefund: im Playground „hier und da Ruckler zwischendurch, nativ nicht“ (`site/beispiele/herd/neon-napoli/`). Messlauf:
E2E `HERD_MESSUNG=1` „Neon-Napoli im Playground gleichmäßig“ (60 s, gehaltenes „w“, wechselndes „e“; der Zeichner meldet mit
`window.__herdMessung` je rAF Zeitpunkt, `g.bild`, Takte, Wartezeit Anforderung → Paket; Heap beider Worker je Sekunde per CDP;
`HERD_MESSUNG_TRACE=Datei` Chrome-Trace mit GC; `HERD_MESSUNG_FENSTER=300x220` kleinere Seite; `HERD_MESSUNG_KLEIN=1` nur die Kette
Zeichner → Programm → Zeichner mit einem Kreis; `HERD_MESSUNG_MOTOREN=auto,interpreter`). Headless SwiftShader, i7-13700KF, 2026-10-25.

**Befunde**

1. **Motor:** „Auto“ nimmt für Neon-Napoli den **Wasm-Motor** (Mehrdatei-Projekte kann Pizzaiolo). Programm-Worker je Bild ≈ 1–2 ms
   (Wasm wie Interpreter – die Arbeit macht der Kern), danach wartet er nur. GC ist **keine** Ursache: Programm-Worker (Wasm) 3 kleine
   Scavenges in 60 s, Interpreter 35–37 Scavenges (max 0,5 ms, einmal 4 ms), Render-Worker 2–7 Scavenges, Major-GC ≤ 1 ms. Heaps
   flach (2–4 MB bzw. 1–2 MB, Sägezahn).
2. **SwiftShader ist grafikgebunden:** 1280 × 720 ≈ 730 ms je Bild, 300 × 220 ≈ 33 ms; `g.bild` selbst 0,5 ms, der Rest ist das
   Präsentieren (Render-Worker blockiert nach dem rAF). Damit sind Einzelruckler bei 60 fps mit Neon-Napoli hier **nicht messbar**
   (jedes Bild holt 2–4 Takte nach, vorher wie nachher).
3. **Ursache der Ruckler: Takt-Anforderung im Browser.** War beim rAF noch kein 1/60-s-Schritt fällig, wartete der Zeichner bis zum
   **nächsten** rAF – ein Bild fiel aus (0 Takte), das nächste holte 2 nach. Nativ wartet der Taktgeber nur bis zum fälligen
   Zeitpunkt (`Taktgeber::faellig`). Das trifft, sobald der rAF an einer Taktgrenze zittert – bei Bildschirmen, die nicht genau
   60,000 Hz laufen (59,94/60,05 Hz), wandert der rAF alle 10–20 s über eine Grenze. Schon headless (virtuelle 60 Hz) zeigte die
   kleine Kette 15 solcher Doppelbilder je Minute.
4. **Je Bild ein neuer ArrayBuffer** (Paket 57–125 KB): `slice` aus dem Kern im Programm-Worker, übertragen, im Render-Worker Müll
   (≈ 4–7 MB/s externer Speicher bei 60 fps). Kostet hier kaum (s. GC), ist aber unnötig.

**Korrekturen:** Zeichner fordert einen noch nicht fälligen Takt per Wecker (`setTimeout`) **zum fälligen Zeitpunkt** an (Regel,
Schritt und Nachholgrenze unverändert, wie nativ). Bildfach: ein `SharedArrayBuffer` des Programm-Workers (256 KiB … 8 MiB), je Bild
eine Kopie aus dem Kern hinein (Motoren mit `optionen.herdAnsicht`: Ansicht statt `slice`), über den Port nur die Länge; Rückfall
auf Übertragung, wenn das Fach belegt oder zu klein ist. Takt-Kopie im Programm-Worker wiederverwendet. Pakete und Szenen bitgleich.

**Vorher/nachher** (60 s je Lauf, Bildabstand = Abstand der rAF mit neuem Bild):

| Lauf | Bilder | Bildabstand p50 / p95 / p99 / max | > 25 ms | Takte je Bild | aus dem Bildfach |
|---|---|---|---|---|---|
| Kette (1 Kreis, 320 × 180, Wasm) vorher | 3616 (3631 rAF) | 16,7 / 16,7 / 16,7 / **33,3** ms | **15** | 1: 3601, **2: 15** | 0 |
| Kette nachher | 3638 (3638 rAF) | 16,7 / 16,7 / 16,7 / **16,7** ms | **0** | 1: 3638 | 3638 |
| Neon-Napoli 300 × 220, Wasm, vorher | 1429 | 33,3 / 83,3 / 100 / 100 ms | 1246 | 1: 185, 2: 791, 3: 165, 4: 288 | 0 |
| Neon-Napoli 300 × 220, Wasm, nachher | 1479 | 33,3 / 83,3 / 100 / 100 ms | 1263 | 1: 218, 2: 848, 3: 123, 4: 290 | 1479 |
| Neon-Napoli 300 × 220, Interpreter, vorher | 1411 | 33,3 / 100 / 100 / 100 ms | 1195 | 1: 213, 2: 759, 3: 176, 4: 263 | 0 |
| Neon-Napoli 300 × 220, Interpreter, nachher | 1527 | 33,3 / 83,3 / 100 / 100 ms | 1171 | 1: 356, 2: 827, 3: 71, 4: 273 | 1527 |

Neon-Napoli auf SwiftShader bleibt grafikgebunden (Unterschiede = Rauschen). Simulation des Zeichners (`ui/test/herd-zeichner.mjs`,
virtuelle Uhr, Programm 1–3 ms), Bildschirmbilder in 60 s nach Takten des gezeigten Bildes:

| Bildschirm | vorher | nachher |
|---|---|---|
| 60,00 Hz ± 1 ms | 1: 3569 | 1: 3569 |
| 59,94 Hz ± 0,5 ms | 0: **35**, 1: 3492, 2: **39** | 1: 3562, 2: 4 (unvermeidlich: 3600 Takte auf 3596 Bilder) |
| 59,94 Hz ± 2 ms | 0: **159**, 1: 3244, 2: **163** | 1: 3562, 2: 4 |
| 60,05 Hz ± 0,5 ms | 0: **34**, 1: 3508, 2: **31** | 0: 2 (unvermeidlich), 1: 3570 |
| 120 / 144 Hz | jedes 2. bzw. 2.–3. Bild neu | unverändert |

Bleibt: wasm-bindgen kopiert das Paket in `g.bild` noch einmal in den Glut-Speicher (malloc + Kopie, ≈ 10 µs; nur mit Rust-Umbau
vermeidbar). Braucht das Programm je Takt fast ein ganzes Bild (≥ 10 ms), fallen weiter Bilder aus – das ist dann echte Last.

### Vom Nutzer auszuführen (Browser, echte GPU, Gleichmäßigkeit)

`cd e2e && E2E_GPU=1 HERD_MESSUNG=1 E2E_FILTER=Neon-Napoli HERD_MESSUNG_TRACE=%TEMP%\herd.json node lauf.mjs` (headless, kein
Fenster). Erwartet: „Takte je Bild“ fast nur `1` (bei 59,94 Hz ≈ 4 × `2` je Minute), `> 25 ms` nahe 0, „Warten auf Paket“ p99
≪ 16 ms, alle Bilder aus dem Bildfach. Mit `HERD_MESSUNG_KLEIN=1` dasselbe ohne Grafiklast. Im Browser von Hand: in der Konsole
`window.__herdMessung = true`, dann backen – der Render-Worker meldet `{typ:"messung"}` je Sekunde.
