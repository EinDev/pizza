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
```

Jede `bench`-Zeile gibt eine JSON-Zeile aus (`glut_median_ms`, `draw_calls`, Adapter); bitte hier als Tabelle „Glut (GPU)“
eintragen. Die letzte Zeile rendert das 3D-Referenzbild auf der GPU zum Sichtvergleich mit `tests/herd/bilder/3d-alles.png`.
`HERD_SOFTWARE=1` erzwingt trotz `--gpu` den Software-Adapter.

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
