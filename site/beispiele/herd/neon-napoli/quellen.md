# Bildquellen – Neon-Napoli

Alle Fototexturen stammen von **Poly Haven** (https://polyhaven.com) und stehen unter **CC0** (gemeinfrei, keine Namensnennung
nötig – wir nennen sie trotzdem). Geladen wurden je Material die 1k-JPEGs „Diffuse“, „nor_gl“ (Normalen im OpenGL-Sinn) und „arm“
(Umgebungsverdeckung, Rauheit, Metall). Bearbeitet mit `scripts/texturen-neon.js` (eigener Code, keine Abhängigkeiten):

- `<name>-farbe.jpg` = Diffuse × Umgebungsverdeckung (Anteil 0,7 … 0,8), per 2 × 2-Mittel verkleinert (bleibt kachelbar),
  Baseline-JPEG Qualität 88.
- `<name>-relief.jpg` = R, G aus nor_gl (Normale x, y), B = Rauheit aus arm (G-Kanal), 4:4:4-JPEG Qualität 92.

| Datei | Poly-Haven-Asset | Quelle (1k) | Lizenz | Kante Farbe / Relief |
|---|---|---|---|---|
| `asphalt-farbe.jpg`, `asphalt-relief.jpg` | Asphalt 02 (`asphalt_02`) | https://polyhaven.com/a/asphalt_02 | CC0 | 1024 / 512 |
| `beton-farbe.jpg`, `beton-relief.jpg` | Concrete Wall 008 (`concrete_wall_008`) | https://polyhaven.com/a/concrete_wall_008 | CC0 | 512 / 512 |
| `ziegel-farbe.jpg`, `ziegel-relief.jpg` | Dark Brick Wall (`dark_brick_wall`) | https://polyhaven.com/a/dark_brick_wall | CC0 | 512 / 512 |
| `fliesen-farbe.jpg`, `fliesen-relief.jpg` | Rectangular Facade Tiles (`rectangular_facade_tiles`) | https://polyhaven.com/a/rectangular_facade_tiles | CC0 | 512 / 512 |
| `wellblech-farbe.jpg`, `wellblech-relief.jpg` | Rusty Corrugated Iron (`rusty_corrugated_iron`) | https://polyhaven.com/a/rusty_corrugated_iron | CC0 | 512 / 512 |
| `rolltor-farbe.jpg`, `rolltor-relief.jpg` | Rusty Metal Shutter (`rusty_metal_shutter`) | https://polyhaven.com/a/rusty_metal_shutter | CC0 | 512 / 512 |
| `gehweg-farbe.jpg`, `gehweg-relief.jpg` | Concrete Pavement (`concrete_pavement`) | https://polyhaven.com/a/concrete_pavement | CC0 | 512 / 512 |

Direkte Download-Adressen: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<asset>/<asset>_<diff|nor_gl|arm>_1k.jpg`.

**Selbst erzeugt** (prozedural, `scripts/texturen-neon.js`, ohne Fotos): `neon-*.png` (Neonröhren aus einer eigenen Strichschrift),
`holo-pizza.png` (Hologramm), `ziel.png` (Lieferziel), `fenster.png` (erleuchtete Fenster der Hochhäuser).
