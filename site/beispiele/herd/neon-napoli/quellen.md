# Bild-, Modell- und Klangquellen – Neon-Napoli

**Klänge:** Regen, Stadt, Schritte und die Ladenglocke sind Aufnahmen von **Freesound** (https://freesound.org) unter **CC0 1.0**
(Creative Commons 0, gemeinfrei, https://creativecommons.org/publicdomain/zero/1.0/ – keine Namensnennung nötig, wir nennen die
Urheber trotzdem); geladen mit `Klang.laden` und gemischt mit erzeugten Schichten. Neonsummen, Drohnen, Tropfen, Ping, Tür und Fanfare
sowie das Prasseln und Platschen über den Aufnahmen erzeugt das Programm selbst mit `Klang` (`welt/klangkulisse.pizza`).
Geladen wurde je Geräusch die öffentliche HQ-Vorschau (MP3, 128 kbit/s); umgewandelt mit ffmpeg nach **FLAC, mono, 22 050 Hz, 16 Bit**
(`-ac 1 -ar 22050 -sample_fmt s16 -c:a flac -compression_level 8`, Metadaten entfernt).

| Datei | Freesound-Titel | Urheber | Seite | Lizenz | Bearbeitung |
|---|---|---|---|---|---|
| `klaenge/regen.flac` | rain medium on street pavement.flac | kyles | https://freesound.org/people/kyles/sounds/454143/ | CC0 | Ausschnitt 6 … 22 s, die folgende Sekunde mit gleicher Leistung in den Anfang geblendet (nahtlose Schleife), −18 LUFS, Spitzen auf −3 dBFS begrenzt |
| `klaenge/stadt.flac` | XY_City hum_Night_River_ambience.wav | softwalls | https://freesound.org/people/softwalls/sounds/385104/ | CC0 | Ausschnitt 40 … 56 s, 1,5 s in den Anfang geblendet (nahtlos), −18 LUFS |
| `klaenge/schritt-1.flac` … `schritt-3.flac` | footsteps pavement street (Lederschuhe auf nassem Pflaster) | Yuval | https://freesound.org/people/Yuval/sounds/205817/ | CC0 | drei einzelne Schritte (ab 3,138 / 4,360 / 5,005 s, je 0,42 s), 4 ms Einblendung, Ausblendung ab 0,27 s, Spitze −3 dBFS |
| `klaenge/ladenglocke.flac` | shop_door_bell.wav | 3bagbrew | https://freesound.org/people/3bagbrew/sounds/57743/ | CC0 | 0 … 4 s, Ausblendung ab 2,8 s über 1,2 s, Spitze −3 dBFS |

Alle Fototexturen stammen von **Poly Haven** (https://polyhaven.com) und stehen unter **CC0** (gemeinfrei, keine Namensnennung
nötig – wir nennen sie trotzdem). Geladen wurden je Material die 1k-JPEGs „Diffuse“, „nor_gl“ (Normalen im OpenGL-Sinn) und „arm“
(Umgebungsverdeckung, Rauheit, Metall). Bearbeitet mit `scripts/texturen-neon.js` (eigener Code, keine Abhängigkeiten):

- `<name>-farbe.jpg` = Diffuse × Umgebungsverdeckung (Anteil 0,7 … 0,8), bei Kante 512 per 2 × 2-Mittel verkleinert (bleibt
  kachelbar), Baseline-JPEG Qualität 88.
- `<name>-relief.jpg` = R, G aus nor_gl (Normale x, y), B = Rauheit aus arm (G-Kanal), 4:4:4-JPEG Qualität 92.

| Datei | Poly-Haven-Asset | Quelle (1k) | Lizenz | Kante Farbe / Relief |
|---|---|---|---|---|
| `asphalt-farbe.jpg`, `asphalt-relief.jpg` | Asphalt 02 (`asphalt_02`) | https://polyhaven.com/a/asphalt_02 | CC0 | 1024 / 1024 |
| `beton-farbe.jpg`, `beton-relief.jpg` | Concrete Wall 008 (`concrete_wall_008`) | https://polyhaven.com/a/concrete_wall_008 | CC0 | 1024 / 1024 |
| `ziegel-farbe.jpg`, `ziegel-relief.jpg` | Dark Brick Wall (`dark_brick_wall`) | https://polyhaven.com/a/dark_brick_wall | CC0 | 1024 / 1024 |
| `fliesen-farbe.jpg`, `fliesen-relief.jpg` | Rectangular Facade Tiles (`rectangular_facade_tiles`) | https://polyhaven.com/a/rectangular_facade_tiles | CC0 | 512 / 512 |
| `wellblech-farbe.jpg`, `wellblech-relief.jpg` | Rusty Corrugated Iron (`rusty_corrugated_iron`) | https://polyhaven.com/a/rusty_corrugated_iron | CC0 | 512 / 512 |
| `rolltor-farbe.jpg`, `rolltor-relief.jpg` | Rusty Metal Shutter (`rusty_metal_shutter`) | https://polyhaven.com/a/rusty_metal_shutter | CC0 | 512 / 512 |
| `gehweg-farbe.jpg`, `gehweg-relief.jpg` | Concrete Pavement (`concrete_pavement`) | https://polyhaven.com/a/concrete_pavement | CC0 | 1024 / 1024 |

Direkte Download-Adressen: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<asset>/<asset>_<diff|nor_gl|arm>_1k.jpg`.

**Selbst erzeugt** (prozedural, `scripts/texturen-neon.js`, ohne Fotos): `neon-*.png` (Neonröhren aus einer eigenen Strichschrift),
`holo-pizza.png` (Hologramm), `ziel.png` (Lieferziel), `fenster.png` (erleuchtete Fenster der Hochhäuser).

**3D-Modelle** (`modelle/`, `welt/kram.pizza`): aus dem **Furniture Kit 2.0** (2018) von **Kenney** (www.kenney.nl),
https://kenney.nl/assets/furniture-kit, Lizenz **CC0 1.0** (http://creativecommons.org/publicdomain/zero/1.0/, laut `License.txt`
im Paket; Nennung nicht nötig, wir nennen ihn trotzdem). Aus dem Paketordner `Models/GLTF format/`; Bearbeitung: nur umbenannt
(Kleinbuchstaben, PROJEKTE.md §1.3), Inhalt byte-gleich. Größe und Nässe stellt das Programm ein (`setzeGroesse`, `setzeNass`).

| Datei | Original im Paket | Quelle | Lizenz | Bearbeitung |
|---|---|---|---|---|
| `modelle/muelltonne.glb` | `trashcan.glb` | https://kenney.nl/assets/furniture-kit | CC0 | umbenannt |
| `modelle/schachtel-zu.glb` | `cardboardBoxClosed.glb` | https://kenney.nl/assets/furniture-kit | CC0 | umbenannt |
| `modelle/schachtel-auf.glb` | `cardboardBoxOpen.glb` | https://kenney.nl/assets/furniture-kit | CC0 | umbenannt |
