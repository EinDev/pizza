# Bild-, Modell- und Klangquellen – Neon-Napoli

**Klänge:** keine Dateien – Regen, Stadt, Neonsummen, Drohnen, Schritte, Tropfen, Ping, Tür und Fanfare erzeugt das Programm selbst mit
`Klang` (Rauschen, Töne, Noten, Filter, Hüllkurven; `welt/klangkulisse.pizza`).

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
