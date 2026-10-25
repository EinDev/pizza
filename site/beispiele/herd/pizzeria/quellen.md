# Quellen der Modelle (alle CC0 1.0, gemeinfrei)

Alle 3D-Modelle stammen von **Kenney** (www.kenney.nl) und stehen unter **Creative Commons Zero (CC0 1.0)**
(http://creativecommons.org/publicdomain/zero/1.0/) – frei für jede Nutzung, eine Nennung ist nicht nötig, aber gern gesehen.

| Ordner | Paket | Quelle | Dateien |
|---|---|---|---|
| `modelle/moebel/` | Furniture Kit 2.0 (2018) | https://kenney.nl/assets/furniture-kit | `floorFull`, `wall`, `wallWindow`, `wallDoorway`, `kitchenCabinet`, `kitchenCabinetUpper`, `kitchenStove`, `kitchenSink`, `kitchenFridge`, `tableRound`, `chair`, `pottedPlant` (GLTF format, `.glb`) |
| `modelle/essen/` | Food Kit (2024) | https://kenney.nl/assets/food-kit | `pizza`, `pizza-box`, `plate`, `tomato`, `cheese`, `wine-red`, `bottle-oil`, `cutting-board`, `mushroom` (GLB format) und `Textures/colormap.png` |

Änderungen für die Projektpfad-Regeln (nur Kleinbuchstaben, PROJEKTE.md §1.3):

- Dateinamen der Möbel in Kleinbuchstaben mit Bindestrich (`kitchenStove.glb` → `kitchen-stove.glb`), Inhalt unverändert.
- Ordner `Textures/` → `textures/`; in den neun `.glb` des Food Kit ist deshalb im JSON-Teil die Bild-URI
  `"Textures/colormap.png"` durch `"textures/colormap.png"` ersetzt (gleiche Länge, sonst byte-gleich).
