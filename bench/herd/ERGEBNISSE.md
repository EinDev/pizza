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
| B9 mit 4 × 4 Rastern à 256² = 1024 × 1024 Kacheln, 250 Takte | 0,179 ms | 0,033 ms | 0,21 (0,19) ms | 0,254 ms | 0,049 ms | 0,30 (0,30) ms | – (nur gemessen) |

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
