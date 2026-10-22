# Herd – die Spiel-Engine von pizza (Konzept und Vertrag, v1)

> Auf dem Herd wird gebacken, was sich bewegt.

Nutzerwunsch: „Kannst du eine simple Game-Engine hinzufügen? Die sollte auf Desktop nativ rendern, nicht mit HTML (wenn möglich)
und im Browser soweit möglich, sonst als Browser-Engine.“ Präzisierung: „Ziel ist, dass wir **3D- und 2D-Games** programmieren können.
**Fokus liegt auf Grafik.**“ Leitlinien: Browser = nativ (K-082), „keep it simple, but extendable“, nur allgemeine Konzepte, deterministisch
und testbar wie die Theke.

**Verbindlich** sind Sprache, Verhalten und Protokoll in **`SPEC.md` §18** (Klärungen K-128 … K-136). Dieses Dokument begründet die
Entscheidungen, beschreibt Rendering, Anbindung, Tests und den Paketplan. Bei Widersprüchen gilt SPEC §18.

## 1. Kurz

- `Herd` ist ein **eigenes Fenster mit Spielschleife**: Das Programm übergibt `backe` einen Rückruf, der **60-mal pro simulierter
  Sekunde** läuft, Zustand ändert, Eingaben liest und das Bild **jedes Mal neu beschreibt** (Immediate Mode) – 2D-Formen, Text,
  Pixel-Bildchen und 3D-Körper mit Licht, Schatten und Nebel.
- **Eine Render-Logik überall:** Der **Herd-Kern** (Rust, `no_std`) macht aus den Zeichenbefehlen fertige Dreieckslisten und Matrizen –
  nativ als Bibliothek im Host, im Browser als `kern.wasm` (gleicher Quelltext, gleiche Zahlen, bitgleich). Darunter liegt nur noch eine
  **dünne GPU-Schicht**: nativ **wgpu** (DirectX 12 / Vulkan / OpenGL) in einem **winit**-Fenster ohne HTML, im Browser **WebGL2** auf
  einem `<canvas>`. Beide nutzen **dieselben Shader** (WGSL; die GLSL-Fassung für WebGL2 wird daraus erzeugt).
- **Deterministisch:** Was das Programm zeichnet, ist eine Byte-Folge („Bild-Nachricht“), in Interpreter, Wasm-Laufzeit und nativem Host
  **bitgleich** und in Tests per Hash verglichen (`.herd-erwartet`). Die **Pixel** sind „visuell gleich“ (gleiche Shader, verschiedene
  GPUs) und werden mit Toleranz gegen Referenzbilder geprüft – die eine bewusste Lockerung von K-082 (K-129).

## 2. Hallo Herd

```pizza
// 2D: ein Ball, der über den Bildschirm rollt
Herd herd = neu Herd("Hallo Herd", breite: 640, hoehe: 360);
funghi x = 0;
herd.backe(() -> {
    x = (x + 3) % 640;
    herd.hintergrund("mozzarella");
    herd.kreis(x, 180, 30, "tomate");
    herd.text("Hallo Herd!", 20, 20, groesse: 24);
});
```

```pizza
// 3D: ein drehender Würfel im Sonnenlicht
Herd herd = neu Herd("Würfel", breite: 640, hoehe: 360);
Form wuerfel = Form.wuerfel();
herd.backe(() -> {
    herd.kamera(0, 2, 5);                                   // schaut zum Ursprung
    herd.zeichne(wuerfel, drehung: herd.zeit() * 45, farbe: "tomate");
});
```

```pizza
// Steuerung: Pfeiltasten und Maus
herd.backe(() -> {
    falls (herd.taste("Links"))  { x = x - 4; }
    falls (herd.taste("Rechts")) { x = x + 4; }
    falls (herd.klick()) { Bote.sage("Klick bei " + herd.mausX() + ", " + herd.mausY()); }
    herd.rechteck(x, 300, 80, 16, "kruste", rundung: 8);
});
```

## 3. Sprache (Kurzfassung; verbindlich SPEC §18.1–§18.4)

| Klasse | Konstruktor | Methoden |
|---|---|---|
| `Herd` | `(titel = "", breite: 640, hoehe: 360)` | Schleife: `backe(fn)`, `schliesse()`, `titel()`, `setzeTitel(t)`, `breite()`, `hoehe()`, `bildnummer()`, `zeit()` |
| | | Eingabe: `taste(n)`, `gedrueckt(n)`, `losgelassen(n)`, `mausX()`, `mausY()`, `maus(knopf = 1)`, `klick(knopf = 1)` |
| | | 2D: `hintergrund(f)`, `rechteck(x, y, b, h, f, rand: 0, rundung: 0)`, `kreis(x, y, r, f, rand: 0)`, `linie(x1, y1, x2, y2, f, dicke: 2)`, `vieleck(punkte, f, rand: 0)`, `text(t, x, y, farbe: "ofen", groesse: 16, ausrichtung: "links")`, `bild(bildchen, x, y, groesse: 1, farbe: "weiss")` |
| | | 2D-Lage: `merke()`, `zurueck()`, `schiebe(dx, dy)`, `drehe(grad)`, `skaliere(sx, sy = sx)` |
| | | 3D: `kamera(x, y, z, zielX: 0, zielY: 0, zielZ: 0, sicht: 60)`, `himmel(oben, unten = oben)`, `sonne(x, y, z, farbe: "weiss", staerke: 1, schatten: ja)`, `licht(x, y, z, farbe: "weiss", reichweite: 10)`, `umgebung(farbe, staerke: 0.35)`, `nebel(farbe, von, bis)`, `zeichne(form, x = 0, y = 0, z = 0, groesse: 1, drehung: 0, neigung: 0, rollen: 0, farbe: "weiss", glanz: 0.3, leuchten: 0, bild: karton)` |
| | statisch | `Herd.farbe(r, g, b, a = 1)` → `"#rrggbbaa"`, `Herd.ueberlappt(ax, ay, ab, ah, bx, by, bb, bh)`, `Herd.beruehrt(ax, ay, ar, bx, by, br)` |
| `Form` | `(punkte, dreiecke, glatt: nein)` | statisch: `Form.wuerfel()`, `Form.kugel(teile: 24)`, `Form.zylinder(teile: 32)`, `Form.kegel(teile: 32)`, `Form.ebene()`, `Form.ring(dicke: 0.3, teile: 32)`; `id()` |
| `Bildchen` | `(zeilen, farben: karton)` | `breite()`, `hoehe()`, `id()` |

- **Farben** sind Texte: ein Name der Herd-Palette (§3.1) oder `"#rgb"`, `"#rrggbb"`, `"#rrggbbaa"`. `Herd.farbe(…)` baut einen solchen Text.
- **Formen** sind die 3D-Ressourcen (einmal erzeugen, oft zeichnen); `Form.ring` ist ein Torus (Pizzarand). Eigene Formen aus einem Blech von
  Koordinaten `[x1, y1, z1, x2, …]` und einem Blech von Eckpunkt-Indizes (je drei = ein Dreieck, gegen den Uhrzeigersinn = Vorderseite).
- **Bildchen** sind Pixel-Bilder aus Text – jede Zeile eine Pixelreihe, jedes Zeichen ein Pixel (`.` = durchsichtig); Standardzeichen
  (§3.1) oder eigene Zuordnung `Speisekarte<margherita, margherita>` (Zeichen → Farbe). In 2D per `herd.bild`, in 3D als Textur
  (`zeichne(…, bild: b)`), immer pixelscharf (kein Weichzeichnen) – das ist der Stil des Herds.
- **Material** = `farbe` + `glanz` (0 … 1, Glanzlicht) + `leuchten` (0 … 1, Eigenleuchten, unbeleuchtet sichtbar) + optional `bild`.
  Kein eigenes Material-Objekt in v1 (ein Blech von benannten Argumenten reicht; ein `Material` kann später ohne Bruch dazukommen).
- Nur **ein** Herd pro Programm; **Theke und Herd zusammen** in einem Programm gibt es in v1 nicht (P0013, K-133).

### 3.1 Palette und Bildchen-Zeichen

| Name | Hex | Bildchen-Zeichen |
|---|---|---|
| `weiss` | `#FFFFFF` | `w` |
| `schwarz` | `#000000` | `s` |
| `grau` | `#8A8580` | `g` |
| `ofen` | `#2F2A26` | `o` |
| `tomate` | `#D9452B` | `t` |
| `salami` | `#A83232` | `r` |
| `schinken` | `#F2A0A0` | `p` |
| `basilikum` | `#3E8E41` | `b` |
| `oliven` | `#6B7A2A` | `l` |
| `mozzarella` | `#FFF6E0` | `m` |
| `teig` | `#E8C48A` | `e` |
| `kruste` | `#C8955A` | `k` |
| `ananas` | `#F5C518` | `a` |
| `senf` | `#F2B33D` | `y` |
| `himmel` | `#8EC9F0` | `h` |
| `wasser` | `#2E6FD9` | `u` |
| `aubergine` | `#5B2A6E` | `v` |

`.` und Leerzeichen = durchsichtig. Die Farben der Doku-Bilder (ARCHITEKTUR §4) sind enthalten.

## 4. Spielschleife und Determinismus (SPEC §18.2)

- **Fester Takt:** 60 Takte pro simulierter Sekunde. `herd.bildnummer()` zählt die Takte (der erste Rückruf sieht 1), `herd.zeit()` =
  `bildnummer / 60` (Sekunden, funghi). Die Spiellogik hängt **nie** von der Wanduhr ab.
- **`backe(fn)`** öffnet beim ersten Aufruf das Fenster (Nachricht `fenster`), dann wartet es auf Fenster-Ereignisse:
  `{"typ":"takt","anzahl":n, …Eingabe…}` → `fn()` läuft **n-mal** hintereinander, danach wird **ein** Bild gesendet (das des letzten Takts);
  `{"typ":"geschlossen"}` oder `herd.schliesse()` beendet die Schleife. Der Renderer schickt den nächsten `takt` erst, wenn er das
  vorige Bild hat (kein Stau); fällt er zurück (langsame GPU, 30-Hz-Bildschirm), fasst er verstrichene Takte zu `anzahl > 1` zusammen
  (höchstens 4). So läuft das Spiel immer gleich schnell oder – wenn die Spiellogik selbst zu langsam ist – gleichmäßig langsamer, aber
  **nie anders**: Mit denselben Ereignissen (`.ereignisse`) entsteht bitgleich dasselbe Spiel.
- **Zeichnen = Immediate Mode:** Zu Beginn jedes Takts ist das Bild leer; alle Zeichenbefehle des Takts landen in der Bild-Nachricht.
  Befehle außerhalb von `backe` sammeln sich für das nächste Bild.
- **Schritte:** wie Theke-Rückrufe – jeder Aufruf kostet normale Schritte, Warten 0; das Schrittlimit P0002 gilt **je Takt** neu (wie
  K-087). Ananas aus dem Rückruf verlassen `backe` (fangbar); erneutes `backe` macht weiter.
- **Ohne Renderer** (CLI `bin/pizza.js`, Tests ohne `.ereignisse`): `W0104: Kein Herd verfügbar – Fenster wird nicht angezeigt.` und
  `backe` kehrt sofort zurück (wie W0100). Nativ bricht ein Herd-Programm ohne mögliches Fenster mit Meldung und Exit 2 ab (wie K-096).

## 5. Eingabe (SPEC §18.3)

Eingabe kommt als **Zustand je Takt**, nicht als Rückruf: Der Renderer hängt an jedes `takt`-Ereignis den aktuellen Zustand
(`tasten` = gehaltene Tasten, `maus` = `[x, y]` in Spielfeld-Koordinaten, `knoepfe` = Bitmaske 1 links · 2 rechts · 4 Mitte; fehlende Felder =
unverändert). Daraus leitet der Herd ab:

- `taste(n)` – gerade gehalten; `gedrueckt(n)` / `losgelassen(n)` – in **diesem** Takt neu gedrückt/losgelassen (nur im ersten der
  `anzahl` Takte eines Ereignisses; danach gilt der Zustand als gehalten).
- `mausX()`, `mausY()`, `maus(k)` (gehalten), `klick(k)` (in diesem Takt gedrückt). Touch zählt als linke Maustaste.
- Tastennamen wie `Tastatur` (K-110): `e.key` für Zeichen (Buchstaben klein: `"a"`), deutsch für Sondertasten (`Leertaste`, `Links`,
  `Rechts`, `Hoch`, `Runter`, `Eingabe`, `Escape`, `Tab`, `Rücktaste`, `Umschalt`, `Strg`, `Alt`, …). Verliert das Fenster den Fokus,
  gelten alle Tasten als losgelassen.

Warum Zustand statt Ereignis-Rückrufen? Spiele fragen „ist Links gedrückt?“ in ihrer Schleife – das ist einfacher als Rückrufe, passt
zum festen Takt und macht Aufnahmen kompakt und reproduzierbar.

## 6. Zeichenmodell

### 6.1 2D
- Spielfeld = logische Größe `breite × hoehe` (Pixel, Ursprung oben links, y nach unten). Das Fenster skaliert das Spielfeld
  **seitentreu** (Ränder in der Hintergrundfarbe) auf jede Fenstergröße und rendert in voller Gerätepixel-Auflösung (scharf auf HiDPI).
- Reihenfolge = Aufrufreihenfolge (Maler-Algorithmus), Alpha-Mischung, Kantenglättung (4× MSAA).
- `rand > 0` zeichnet nur den Umriss in dieser Dicke; `rundung` rundet Rechteck-Ecken. `drehe(grad)` dreht im Uhrzeigersinn.
- Text: eine eingebettete, freundliche Schrift (OFL-lizenziert, als SDF-Atlas im Kern – scharf in jeder Größe), `ausrichtung`
  `links|mitte|rechts`, `y` = Oberkante. Zeichenvorrat: druckbares ASCII, `ÄÖÜäöüß€°·–—„“‚‘…×÷`; Unbekanntes wird `?`.

### 6.2 3D
- Rechtshändig, y nach oben, Einheiten frei („Meter“). `kamera` = Position + Ziel + vertikaler Sichtwinkel (Grad); ohne `kamera` im
  Bild gilt `(0, 3, 8) → (0, 0, 0)`, 60°.
- **Licht:** eine Sonne (Richtung zur Sonne hin; ohne `sonne` gilt `(0.5, 1, 0.3)`, weiß, Stärke 1, mit Schatten), bis zu **8
  Punktlichter** je Bild (mehr → LaufzeitAnanas), Umgebungslicht (Halbkugel: Himmelsfarbe von oben, gedämpft von unten; Standard =
  Himmelsfarbe, 0,35). Beleuchtung pro Pixel (Lambert + Blinn-Phong-Glanz), **Sonnenschatten** (Shadow-Map, weiche Kanten), linearer
  Nebel, Farben gamma-korrekt (rechnen linear, Ausgabe sRGB).
- **Himmel:** `himmel(oben, unten)` = senkrechter Verlauf hinter der 3D-Szene; ohne `himmel` gilt `hintergrund` bzw. Standard
  `himmel → mozzarella`.
- **Reihenfolge:** Erst die **3D-Szene** (mit Tiefenpuffer, Reihenfolge der `zeichne` egal; halbdurchsichtige Farben werden nach den
  undurchsichtigen gezeichnet), **dann alle 2D-Befehle darüber** (HUD, Punkte, Menüs). Ein Bild ohne 3D-Befehle ist reines 2D.
- **Lage eines Körpers:** `groesse` (Zahl oder Blech `[sx, sy, sz]`), Drehung in Grad – erst `rollen` (um z), dann `neigung` (um x), dann
  `drehung` (um y), dann Verschieben nach `(x, y, z)`. Grundformen haben die Größe 1 und den Mittelpunkt im Ursprung (`ebene` liegt in
  y = 0, `kugel` hat Durchmesser 1).

## 7. Protokoll (verbindlich SPEC §18.5)

Programm → Renderer: **binäre Nachrichten** (Little Endian), als Ereignis `{ typ: "herd", daten: Uint8Array }`. Binär statt JSON, weil
ein Bild aus hunderten Befehlen 60-mal pro Sekunde entsteht; Zahlen als `f32` (aus dem f64-Wert per round-to-nearest, nicht endlich → 0),
Farben als 4 Bytes RGBA, Texte als `u32`-Länge + UTF-8. Interpreter (`Math.fround`, `DataView`) und Wasm-Laufzeit (`as f32`) erzeugen
dieselben Bytes.

| Art (u8) | Nachricht | Inhalt |
|---|---|---|
| 1 | `fenster` | `u16 breite`, `u16 hoehe`, `str titel` |
| 2 | `bild` | `u32 bildnummer`, `u32 anzahl`, dann `anzahl` Befehle |
| 3 | `form` | `u32 id`, `u8 art` (0 eigene · 1 würfel · 2 kugel · 3 zylinder · 4 kegel · 5 ebene · 6 ring), `u32 teile`, `f32 dicke`, `u8 glatt`; nur bei art 0: `u32 n`, `n × 3 f32`, `u32 m`, `m × u32` |
| 4 | `bildchen` | `u32 id`, `u16 breite`, `u16 hoehe`, `breite × hoehe × 4` Bytes RGBA |
| 5 | `schliesse` | – |

Befehle in `bild` (`u8 op`, dann die Felder; `f` = f32, `c` = 4 Bytes RGBA, `s` = str):

| op | Befehl | Felder |
|---|---|---|
| 0x01 | hintergrund | `c` |
| 0x02 | rechteck | `f x, f y, f b, f h, c, f rand, f rundung` |
| 0x03 | kreis | `f x, f y, f r, c, f rand` |
| 0x04 | linie | `f x1, f y1, f x2, f y2, f dicke, c` |
| 0x05 | vieleck | `u32 n, n × (f x, f y), c, f rand` |
| 0x06 | text | `f x, f y, f groesse, c, u8 ausrichtung (0 links · 1 mitte · 2 rechts), s` |
| 0x07 | bild | `u32 id, f x, f y, f groesse, c` |
| 0x08 / 0x09 | merke / zurueck | – |
| 0x0A | schiebe | `f dx, f dy` |
| 0x0B | drehe | `f grad` |
| 0x0C | skaliere | `f sx, f sy` |
| 0x20 | kamera | `f x, f y, f z, f zielX, f zielY, f zielZ, f sicht` |
| 0x21 | himmel | `c oben, c unten` |
| 0x22 | sonne | `f x, f y, f z, c, f staerke, u8 schatten` |
| 0x23 | licht | `f x, f y, f z, c, f reichweite` |
| 0x24 | umgebung | `c, f staerke` |
| 0x25 | nebel | `c, f von, f bis` |
| 0x26 | zeichne | `u32 form, f x, f y, f z, f sx, f sy, f sz, f drehung, f neigung, f rollen, c, f glanz, f leuchten, u32 bildchen (0 = keins)` |

- Ressourcen (`form`, `bildchen`) werden **beim Erzeugen** gesendet (IDs 1, 2, … gemeinsam für Formen und Bildchen, in
  Erzeugungsreihenfolge), auch vor `fenster`; der Renderer hebt sie auf. `fenster` beim ersten `backe` und erneut bei `setzeTitel`;
  `schliesse` bei `schliesse()` und am Programmende bei offenem Fenster (wie K-061).
- Renderer → Programm: JSON-Ereignisse über denselben Weg wie die Theke (`onUiWarte` / `uiEreignisse` / HOST-ABI `herd_warte`):
  `{"typ":"takt","anzahl":1,"tasten":["Links"],"maus":[320,180],"knoepfe":1}`, `{"typ":"geschlossen"}`; Unbekanntes wird ignoriert.
- **Erweiterbar:** neue Befehle = neue Opcodes, neue Ressourcen = neue Arten. Ein Renderer, der einen Opcode nicht kennt, kann den
  Rest des Bildes nicht lesen – deshalb tragen Kern und Programm dieselbe Protokollversion (`fenster` könnte später ein Versionsfeld
  bekommen; v1 braucht keins, weil Kern und Laufzeit immer zusammen ausgeliefert werden).

## 8. Rendering – Entscheidung und Bewertung (K-128, K-129)

### 8.1 Aufbau

```
Programm (Interpreter | Wasm-Laufzeit)  ──Bild-Nachricht (Bytes, bitgleich)──►  Herd-Kern (Rust no_std)
                                                                                 │  Dreiecke 2D/3D, Text-Quads, Matrizen,
                                                                                 │  Schatten-Kamera, Zeichenliste (bitgleich)
                                                     ┌───────────────────────────┴───────────────────────┐
                                                     ▼                                                   ▼
                                    nativ: wgpu (DX12 · Vulkan · GL)                       Browser: WebGL2 (JS, dünn)
                                    winit-Fenster, kein HTML                               <canvas> im Vorschaufenster / App-Link
                                                     └──────────── dieselben Shader (WGSL → GLSL ES 3.0) ────────┘
```

- **Herd-Kern** (`herd/kern/`, Rust `no_std` + `libm`): liest Nachrichten, hält Ressourcen (Formen → Dreiecksnetze, Bildchen → Texturen),
  zerlegt 2D-Formen in Dreiecke (Kreise, Rundungen, dicke Linien, Vielecke per Ear-Clipping, Umrisse), setzt Text aus dem eingebetteten
  SDF-Atlas, rechnet Kamera-, Licht- und Schattenmatrizen und liefert eine **Zeichenliste**: Puffer (Vertex/Index), Texturen, Durchgänge
  (Schatten → 3D undurchsichtig → 3D durchsichtig → 2D) mit ihren Uniforms. Gleicher Quelltext nativ (Bibliothek im Host) und im Browser
  (`site/js/herd/kern.wasm`, `wasm32v1-none`, ohne wasm-bindgen, ohne JS-Importe – wie `laufzeit.wasm` eingecheckt, damit Docker kein
  Rust für die Website braucht). Damit ist auch die Geometrie bitgleich und testbar (Hash der Zeichenliste nativ = Wasm).
- **GPU-Schicht** (dünn, nur Hochladen und Zeichnen): nativ `herd/gpu/` (wgpu), im Browser `site/js/herd/webgl.js`. Keine Geometrie,
  keine Mathematik, keine Spiellogik in den Backends.
- **Shader:** eine Quelle `herd/kern/shader/*.wgsl` (2D, 3D beleuchtet, Schatten, Himmel); die GLSL-ES-3.0-Fassung für WebGL2 erzeugt
  `naga` beim Bauen und wird eingecheckt (ein Test prüft, dass sie aktuell ist). Farben: Renderziel ohne sRGB-Format, die Shader
  wandeln selbst um – identisch in beiden Welten.

### 8.2 Bewertete Alternativen

| Ansatz | Bewertung |
|---|---|
| **Software-Rasterizer** (eigener oder tiny-skia) in Wasm und nativ, Anzeige per `putImageData` / softbuffer | Pixel bitgleich und trivial testbar, winzig – aber 3D mit Licht, Schatten und Kantenglättung bei 60 fps in voller HiDPI-Auflösung ist in Wasm im Browser zu langsam (≈ 2–8 Mio. Pixel × Shading je Bild); „Fokus Grafik“ verlangt die GPU. **Verworfen** als Anzeige, nicht nötig als Test-Ersatz (Software-GPU: WARP/lavapipe/SwiftShader). |
| **Canvas2D im Browser + nativer Vektor-Renderer** | nur 2D, zwei verschiedene Renderer → sichtbar verschiedene Kanten/Schrift. **Verworfen.** |
| **wgpu auch im Browser** (wasm-bindgen, WebGPU/WebGL) | eine Rust-Codebasis bis zur GPU, aber mehrere MB Wasm + JS-Glue, neue Werkzeugkette (wasm-bindgen-cli) und ein anderes Wasm-Ziel als der Rest; WebGL-Pfad über wgpu's GL-Emulation. **Verworfen** – der Kern liefert schon alles Gemeinsame; die Browser-GPU-Schicht ist ~400 Zeilen JS. |
| **WebGPU im Browser zuerst, WebGL2 als Rückfall** | WGSL wäre direkt nutzbar, aber zwei Browser-Backends = doppelte Testfläche; WebGPU fehlt noch in Teilen (Linux-Chrome, ältere Safari) und in Headless-Tests. v1 nutzt **nur WebGL2** (überall vorhanden, auch Headless mit SwiftShader); ein WebGPU-Backend ist eine spätere, rein additive Datei (`site/js/herd/webgpu.js`), da Kern und Shader schon WGSL sind. |
| **Theke-Zutat „Leinwand“** (Spiel im Theke-Fenster) | nativ läge das Spiel in der WebView – genau das HTML, das der Nutzer nicht will. **Verworfen** (K-133). |
| **GPU nativ per OpenGL (glow/glutin)** | kleiner als wgpu, aber Windows-OpenGL-Treiber sind unzuverlässig, kein Software-Rückfall wie WARP. **Verworfen** zugunsten von wgpu (DX12 unter Windows inkl. WARP, Vulkan/GL unter Linux). |

### 8.3 Nativ (K-130)

- **Fenster:** `winit` (nicht `tao`): Unter Linux lädt winit X11 bzw. Wayland **zur Laufzeit** (`dlopen`), tao dagegen ist gegen GTK
  gelinkt. wgpu lädt Vulkan (`libvulkan.so.1`) bzw. EGL/GL ebenfalls zur Laufzeit. Damit braucht der Herd **keine neue
  Link-Abhängigkeit** – er kann direkt im glibc-only **Linux-Starter** wohnen (kein memfd-Umweg wie beim Theke-Teil).
- **Backends:** Windows: DX12 (Rückfall WARP, wenn keine GPU), Linux: Vulkan, sonst GL (EGL). Kein Metal-Build (macOS wird nicht gebaut).
- **Kein Fenster/keine GPU möglich** → wie K-096: Meldung auf stderr (ohne Terminal als Meldungsfenster), **Exit 2**, vor dem ersten
  Wasm-Befehl: „Dieses Programm braucht einen Bildschirm für sein Herd-Fenster …“ (keine Anzeige), „… braucht eine Grafikkarte mit Vulkan
  oder OpenGL ES 3 …“ (kein Adapter). `PIZZA_HERD=0`, JSON-Modus und `--ui-ereignisse` bleiben fensterlos (W0104).
- **Windows-Subsystem:** Herd-Programme starten wie Theke-Programme ohne Terminal (PE-Subsystem WINDOWS, Kriterium: Importgruppe `herd`).
- **Offscreen-Modus für Tests und Sichtprüfung:** `pizza-host --herd-bilder=ordner [--herd-nur=n,m] --ui-ereignisse datei prog.pkarton`
  rendert ohne Fenster in eine Textur und schreibt PNGs (Software-Adapter bevorzugt: WARP bzw. lavapipe → reproduzierbar).
- **Größe:** wgpu (nur `wgsl`-Frontend, DX12 bzw. Vulkan+GL) + winit kosten geschätzt 2–4 MB; gemessen und in `host/README.md` und
  im Abschlussbericht des Host-Pakets festgehalten. Zielwert: Windows-EXE ≤ 6 MB, Linux-Starter ≤ 7 MB.

### 8.4 Browser (K-131)

- Das Programm läuft wie immer im Worker; jede `herd`-Nachricht geht (übertragen, nicht kopiert) an die Seite. Die Seite hat den
  Kern (`kern.wasm`) und die WebGL2-Schicht, zeichnet im `requestAnimationFrame` und antwortet über den bestehenden SAB/Atomics-Weg der
  Theke (`onUiWarte`) mit dem nächsten `takt`. Braucht also Cross-Origin-Isolation wie Theke und Eingabe (Meldung ohne – wie heute).
- Anzeige im **Vorschaufenster** wie die Theke (schwebend, Titel, Schließen = `geschlossen`), Größe = Programmgröße (K-123-Regel),
  im App-Link (`#app=…`) bildschirmfüllend seitentreu. Tastatur/Maus nur bei Fokus auf dem Canvas.
- **CSP:** unverändert (`script-src 'self' 'wasm-unsafe-eval'` deckt `kern.wasm`; WebGL braucht nichts). Kein WebGL2 → Meldung
  „Dieser Browser kann kein WebGL2 – der Herd braucht es.“ und Lauf endet wie ein fehlendes Fenster (`geschlossen` vor dem ersten Takt).
- Kern + WebGL-Schicht werden **nur geladen, wenn ein Programm den Herd nutzt** (Gruppe `herd` bzw. `neu Herd` im Quelltext).

## 9. Tests (K-134)

| Ebene | Was | Vergleich |
|---|---|---|
| Programm | `tests/faelle/herd-*`, Beispiele: `.ereignisse` (JSON-Lines, `takt`-Zeilen) + `.herd-erwartet` (je Nachricht eine JSON-Zeile `{"art":"bild","bildnummer":12,"befehle":34,"bytes":1234,"fnv":"…"}`, `fenster` mit Titel/Größe, `form`/`bildchen` mit id + fnv, `schliesse`) | **bitgleich**: Interpreter, Wasm (`npm run test:wasm`), nativer Host (`node host/test.js`), Differenztests |
| Prüfstand | `pruefstand/faelle/a18-herd.js` | Texte, Ananas, Schritte |
| Kern | `cargo test` im Kern: Zerlegung, Text, Matrizen; Hash der Zeichenliste nativ = `kern.wasm` in Node | **bitgleich** |
| Pixel | Referenz-PNGs (`tests/herd/bilder/`), erzeugt nativ offscreen; Browser (E2E, Headless-Chromium/SwiftShader) und nativ (WARP/lavapipe) vergleichen mit Toleranz | **visuell gleich** (mittlere Abweichung ≤ 1,5 %, ≥ 98 % der Pixel innerhalb 10/255) |
| Doku | Codeblöcke mit `uiEreignisse` + `herdErwartet` | wie Programm |

`fnv` = FNV-1a 64 Bit über die Nachrichtenbytes (16 Hex-Ziffern). `node tests/herd/zeige.js datei.pizza [--bild n]` gibt eine Bild-Nachricht
lesbar aus (Fehlersuche). Keine sichtbaren Fenster in Tests: nativ offscreen, Browser headless.

## 10. Bewusst nicht in v1

- **Kein Ton** (K-135): Browser (WebAudio, Autoplay-Sperre bis zur ersten Geste) und nativ (Linux: ALSA/PulseAudio/PipeWire wären neue
  Systembibliotheken für Starter und Prüfung, Windows: WASAPI) brauchen zwei völlig verschiedene Wege; Ton ist nicht deterministisch
  testbar und lenkt vom Grafik-Fokus ab. Später additiv als eigene Importgruppe (`klang`) mit eingebetteten Klängen aus Zahlen.
- Keine Physik-Engine, keine Szenengraph-Objekte, kein Laden von Dateien (Bilder/Modelle entstehen im Programm – eine Datei hätte im
  Browser keinen Ort), keine eigenen Shader, kein Vollbild-Umschalten aus dem Programm, nur ein Fenster.
- Theke + Herd zugleich (später möglich: der Herd ist ein eigenes Fenster, die Theke ein anderes).

## 11. Pakete (Phasenplan)

| Paket | Inhalt | Dateien | hängt ab von |
|---|---|---|---|
| **H0 Konzept** | diese Datei, SPEC §18, K-128 … K-136 | `HERD.md`, `SPEC.md`, `KLAERUNGEN.md` | – |
| **H1 Interpreter** | `Herd`, `Form`, `Bildchen`, Kodierung, `backe`, Eingabe, W0104/P0013, Testharness `.herd-erwartet`, Prüfstand a18 | `site/js/pizza.js`, `tests/faelle/herd-*`, `tests/run-tests.js`, `pruefstand/` | H0 |
| **H2 Kern 2D+3D** | Kern-Crate, Shader WGSL/GLSL, Schrift-Atlas, `kern.wasm`; GPU-Schicht wgpu offscreen (`herd/gpu`) + Bild-Werkzeug (`herd-bild datei.bin → png`) | `herd/**`, `site/js/herd/kern.wasm` | H0 (parallel zu H1) |
| **H3 Browser** | WebGL2-Schicht, Worker-Brücke, Vorschaufenster, App-Link, Editor-Vervollständigung | `site/js/herd/**`, `site/js/worker.js`, `ui/**` | H1, H2 |
| **H4 Wasm** | Laufzeit `herd.rs`, Compiler, Importgruppe `herd`, HOST-ABI, Differenz | `laufzeit/**`, `site/js/pizzaiolo/**`, `HOST-ABI.md`, `tests/wasm`, `tests/differenz` | H1 |
| **H5 Nativ** | winit+wgpu-Fenster, Offscreen-PNG, CLI, Starter, PE-Subsystem, Docker/`baue-ziele.sh`, Größenmessung | `host/**`, `Dockerfile` | H2, H4 |
| **H6 Spiele & Doku** | Doku-Abschnitt mit Bildern, 2D-Spiel („Salami-Snake“ o. ä.), 3D-Spiel („Pizzaofen-Rallye“ o. ä.), E2E, CI | `site/beispiele/herd*`, `site/js/doku/`, `site/img/doku/he-*`, `e2e/` | H3, H5 |

## 12. Ausblick

WebGPU-Backend im Browser; `Material`-Objekt; 3D-Gruppen/Lage-Stapel; Partikel; Ton (`klang`); Gamepad; Theke + Herd zugleich;
Texturen aus größeren Bildern; Animationen für Formen (Skelett) – alles additiv (neue Opcodes, neue Gruppen).
