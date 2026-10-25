# Modellquellen – Werkstatt

Beide Modelle stammen von **Poly Haven** (https://polyhaven.com) und stehen unter **CC0** (gemeinfrei, keine Namensnennung
nötig – wir nennen sie trotzdem). Geladen wurde je Modell das glTF in **1k** (`.gltf` + `.bin` + Texturen), unverändert.

| Ordner | Poly-Haven-Asset | Quelle | Lizenz | Dateien (Größe) |
|---|---|---|---|---|
| `modelle/kiste/` | Wooden Crate 01 (`wooden_crate_01`) | https://polyhaven.com/a/wooden_crate_01 | CC0 | `wooden_crate_01_1k.gltf`, `wooden_crate_01.bin`, `textures/wooden_crate_01_{diff,nor_gl,arm}_1k.jpg` (2,2 MB) |
| `modelle/farn/` | Fern 02 (`fern_02`) | https://polyhaven.com/a/fern_02 | CC0 | `fern_02_1k.gltf`, `fern_02.bin`, `textures/fern_02_{diff,nor_gl,arm}_1k.jpg` (1,1 MB) |

Direkte Download-Adressen: `https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/<asset>/<asset>_1k.gltf` (Dateiliste über
`https://api.polyhaven.com/files/<asset>`, Schlüssel `gltf` → `1k`).

Karten im glTF: `baseColorTexture` (diff), `normalTexture` (nor_gl, OpenGL-Richtung), `metallicRoughnessTexture` (arm: R
Verdeckung, G Rauheit, B Metall); der Farn zusätzlich `alphaMode` MASK mit `alphaCutoff` 0.5, beide `doubleSided`.
