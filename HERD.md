# Herd – die Spiel-Engine von pizza (Konzept und Vertrag, v1)

> Auf dem Herd wird gebacken, was sich bewegt.

**Nutzerwünsche (wörtlich):**
- „Kannst du eine simple Game-Engine hinzufügen? Die sollte auf Desktop nativ rendern, nicht mit HTML (wenn möglich) und im Browser
  soweit möglich, sonst als Browser-Engine.“
- „Ziel ist, dass wir 3D- und 2D-Games programmieren können. Fokus liegt auf Grafik.“
- „Mache die Engine mit genug Abstraktion, sodass wir mehr High-Level-Elemente hinzufügen können.“
- „Ich brauche aber alle Performance, die ich bekommen kann. Effizienz ist ein großes Thema.“
- „Ziel ist wirklich eine Game-Engine wie Unity zu haben. Natürlich weniger Funktionen am Anfang, aber zunehmend mehr Funktionen.“

Leitlinien des Projekts: Browser = nativ (K-082), „keep it simple, but extendable“, allgemeine Konzepte statt Fachlogik, deterministisch
und testbar. **Verbindlich** sind Sprache und Verhalten in **`SPEC.md` §18** (Klärungen K-128 … K-136, Ausbau K-148 ff.); dieses Dokument begründet,
beschreibt Schichten, Schnittstellen, Leistungsziele, Tests, Erweiterung und Roadmap.

## 1. Kurz

- Herd ist eine **Szene aus Teilen mit Komponenten** – das tragende Modell wie bei Unity (GameObject + Components): Ein `Teil` hat
  immer eine **Lage** (Transform, mit Eltern-Hierarchie) und beliebige **Komponenten** (`Kreis`, `Bild`, `Text`, `Koerper`, `Licht`,
  `Kamera`, `Bewegung`, `Animation`, `Partikel`, …). Die Szene lebt **in der Engine** (Rust, ECS: Daten in kompakten Arrays); das
  pizza-Programm hält nur **Handles** und ändert **Deltas** – es rechnet nie pro Pixel, Vertex oder (wenn es nicht will) pro Objekt.
- **Spielschleife:** `herd.backe(fn)` – 60 Takte pro simulierter Sekunde; je Takt läuft `fn` (Spiellogik), dann die **Systeme** der
  Komponenten in Rust (Bewegung, Animation, Partikel, …), danach baut der Kern ein **Bildpaket** für die GPU.
- **Drei Schichten** (Abschnitt 3): **Glut** (Render-Backend, wgpu) → **Kern** (Welt, ECS, Systeme, Culling, Batching) →
  **Komponenten-Registry** (High-Level-Bausteine). Neue Unity-artige Funktionen kommen als neue Komponente/neues System dazu,
  **ohne** den Kern, die Sprache oder das ABI umzubauen (Abschnitt 9).
- **Überall dieselbe Engine:** Kern und Glut sind Rust. Nativ als Bibliothek im Host (winit-Fenster, wgpu auf DX12/Vulkan/GL, **kein
  HTML**); im Browser als Wasm (Kern im Programm-Worker, Glut per wgpu auf **WebGPU, Rückfall WebGL2** in einem Render-Worker).
- **Deterministisch:** Szenenzustand und Bildpaket sind in Interpreter, Wasm-Programm und nativem Host **bitgleich** (Hash-Tests);
  die **Pixel** sind „visuell gleich“ (gleiche Shader, verschiedene GPUs; Toleranzvergleich) – die eine Lockerung von K-082 (K-129).

## 2. Hallo Herd

```pizza
// 2D: ein Ball fliegt und prallt ab – die Engine bewegt ihn, das Programm entscheidet nur
Herd herd = neu Herd("Hallo Herd", breite: 640, hoehe: 360);
Teil ball = herd.kreis(320, 180, 12, farbe: "tomate");
Bewegung flug = ball.mit(neu Bewegung(tempoX: 240, tempoY: 160));      // Pixel pro Sekunde
herd.backe(() -> {
    falls (ball.y() < 12 || ball.y() > 348) { flug.setzeTempoY(-flug.tempoY()); }
    falls (ball.x() < 12 || ball.x() > 628) { flug.setzeTempoX(-flug.tempoX()); }
});
```

```pizza
// 3D: ein drehender Würfel im Sonnenlicht – ganz ohne Rückruf
Herd herd = neu Herd("Würfel");
Teil wuerfel = herd.koerper(Form.wuerfel(), farbe: "tomate");
wuerfel.mit(neu Bewegung(drehtempo: 45));                               // Grad pro Sekunde um die Hochachse
herd.backe();
```

```pizza
// Steuerung und Text
Teil schaufel = herd.rechteck(320, 330, 100, 16, farbe: "kruste", rundung: 8);
Teil punkte = herd.text("0 Punkte", 16, 12, groesse: 24);
herd.backe(() -> {
    falls (herd.taste("Links"))  { schaufel.verschiebe(-6, 0); }
    falls (herd.taste("Rechts")) { schaufel.verschiebe(6, 0); }
    falls (ball.trifft(schaufel)) { zaehler = zaehler + 1; punkte.text().setzeInhalt(zaehler + " Punkte"); }
});
```

## 3. Schichten

```
 pizza-Programm (Interpreter │ Wasm-Programm)                 Handles, Deltas, Abfragen – numerische Aufrufe, kein JSON
        │  Herd-ABI (generisch: teil_neu, komp_neu, setze_zahl(teil, typ, feld, wert), hole_zahl, …)
        ▼
 ┌──────────────── Schicht 2+3: Herd-Kern (Rust no_std; nativ = Bibliothek, Browser = kern.wasm im Programm-Worker) ───────────┐
 │  Welt: Teile (IDs), Lage + Hierarchie, Ressourcen (Formen, Bildchen → Atlas), Welt-Einstellungen                            │
 │  Komponenten-Registry (Schicht 3): Schema (Felder, Typen, Standardwerte) + Speicher (SoA, Sparse-Set) + System + Beitrag    │
 │  zum Bild – Kreis, Rechteck, Text, Bild, Koerper, Licht, Kamera, Bewegung, Animation, Partikel …                              │
 │  Takt: Systeme in fester Reihenfolge · Bild: Welt-Matrizen, Culling, Sortierung, Batching/Instancing → Bildpaket (bitgleich)  │
 └──────────────────────────────────────────────────┬──────────────────────────────────────────────────────────────────────────┘
                                                    │  Bildpaket (Bytes: Ressourcen-Deltas, Instanzen je Batch, Uniforms)
                                                    ▼
 ┌──────────────── Schicht 1: Glut (Render-Backend, Rust + wgpu; schmale Schnittstelle) ───────────────────────────────────────┐
 │  nativ: wgpu DX12 · Vulkan · GL, winit-Fenster oder offscreen   │  Browser: wgpu → WebGPU (Rückfall WebGL2), Render-Worker     │
 │  Pipeline-Cache, Instanzpuffer, Textur-Atlas, Shadow-Map, MSAA   │  mit OffscreenCanvas (Rückfall: Hauptthread)                 │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Schicht 1 – Glut (Render-Backend)
- **Schnittstelle:** `Glut::neu(ziel, optionen) → Glut` (Ziel = Fenster-Surface, Offscreen-Textur oder Canvas; Optionen: Adapter,
  MSAA, Instancing an/aus, VSync), `glut.bild(&bildpaket)` (lädt Ressourcen-Deltas, schreibt Instanzpuffer, führt die Durchgänge aus,
  liefert Draw-Call-Statistik), `glut.groesse(b, h)`, `glut.lies_pixel()` (nur offscreen). Mehr nicht: keine Szene, keine Spiellogik,
  keine Geometrie-Erzeugung. Ein weiteres Backend (z. B. Software für CI) implementiert dieselben drei Funktionen. Umsetzung (H2a):
  `herd/glut`, Details `herd/README.md` §9. **Offscreen, Werkzeuge und Tests nutzen standardmäßig den Software-Adapter** (WARP/lavapipe;
  `HERD_SOFTWARE=1` erzwingt ihn); die echte GPU nur auf ausdrücklichen Wunsch (Host-Fenster, `herd-bild … --gpu`).
- **wgpu** überall (Rust). Nativ: Windows DX12 (WARP als Software-Rückfall), Linux Vulkan, sonst GL/EGL; Fenster per **winit**
  (Linux: X11/Wayland per `dlopen` → keine neue Link-Abhängigkeit, K-130). Browser: dieselbe Crate nach `wasm32-unknown-unknown` mit
  `wasm-bindgen` (Crate und `wasm-bindgen-cli` auf **dieselbe** Version gepinnt), Backend **WebGPU, Rückfall WebGL2** (wgpu wählt);
  Ergebnis `site/js/herd/glut_bg.wasm` + Glue, eingecheckt (Docker braucht kein Rust), nur für Herd-Programme geladen, komprimiert
  ausgeliefert.
- **Shader:** WGSL, fest im Glut eingebaut (2D-Instanzen: Rechteck/Kreis als SDF-Quads mit Kantenglättung, Bild/Atlas pixelscharf,
  SDF-Text; 3D: Lambert + Blinn-Phong, Eigenleuchten (mit `strahlen` über 1), Textur, mit `Stimmung` HDR + Bloom + ACES + Höhennebel, Punktlichter (bis 8 im Uniform-Block, mehr und Spots per Clustered Forward), Sonnenschatten mit PCF (Zeltfilter), Nebel, Himmelsverlauf nach Blickrichtung;
  linear rechnen, sRGB ausgeben). Eigene Shader: später (Roadmap).
- **Leistung:** Instancing je (Form, Textur-Seite), alle Bildchen und Glyphen in einem Atlas, Pipelines einmal erzeugt (Cache),
  Puffer wiederverwendet und nur gewachsen; Ziel: Draw-Calls wachsen mit der Zahl der **Arten**, nicht der Objekte.

### 3.2 Schicht 2 – Kern (Welt)
- Rust `no_std` + `alloc` + `libm`; gleicher Quelltext nativ (rlib im Host) und als `site/js/herd/kern.wasm` (`wasm32v1-none`, ohne
  wasm-bindgen, ohne Importe – wie `laufzeit.wasm` eingecheckt).
- **Teile:** IDs (u32, nie wiederverwendet), `raum` 2D oder 3D (bei der Erzeugung fest), Eltern/Kinder, Lage. Komponenten-Daten
  liegen je Typ in einem Sparse-Set mit dichten Arrays (Struktur von Arrays) – Systeme laufen linear über dichte Daten.
- **Determinismus-Regeln (verbindlich, K-129):** nur `libm` für Funktionen, `f64` für Szenenzustand (f32 erst im Bildpaket), keine
  `HashMap`/zufällige Hashes, keine Zeiger-/Ankunftsreihenfolgen – Reihenfolgen nur nach stabilen Schlüsseln (Teil-ID, Registrierung),
  keine FMA-Kontraktion. Der Test „Hash nativ = Hash `kern.wasm`“ über alle Benchmark-Szenen ist blockierend.
- **Takt:** `takt()` lässt alle Systeme in Registry-Reihenfolge laufen (`dt = 1/60`), danach alle **Nachlauf**-Systeme (ab H-K0, K-149). **Bild:** Welt-Matrizen (nur für geänderte
  Teilbäume neu), Culling gegen das Kamera-Frustum (3D) bzw. das Spielfeld (2D), Sortierung (2D: `ebene`, dann ID; 3D durchsichtig:
  Abstand, dann ID), Gruppierung zu Batches, Ressourcen-Deltas → **Bildpaket** (Format: `herd/README.md`, versioniert).
- **Fehler** prüft der Kern selbst (Wertebereiche, Ressourcen, Raum-Passung) und liefert Fehlercode + Text; die Laufzeiten werfen
  daraus die Ananas (Texte also an **einer** Stelle).

### 3.3 Schicht 3 – Komponenten (Bausteine)
- Eine Komponente = **ein Rust-Modul** im Kern mit: Name, Raum (2D/3D/beide), **Schema** (Felder mit Name, Typ, Standard, Bereich),
  Speicher, optional **System** (`takt`), optional **Bildbeitrag** (Instanzen für einen Batch-Typ) und optional **Abfragen**.
  Registriert durch **eine Zeile** in `herd/kern/src/komponenten/mod.rs`.
- Das Schema ist die **einzige Quelle**: Der Kern exportiert es (`schema_json`), ein Bauschritt schreibt `site/js/herd/schema.json`
  (eingecheckt, ein Test vergleicht mit dem Kern). Interpreter, Compiler (Klassenauflösung zur Übersetzungszeit), Editor
  (Vervollständigung) und Doku lesen es. Die Sprache bildet jede Komponente **generisch** ab (SPEC §18.4) – eine neue Komponente
  braucht **keine** Änderung an `site/js/pizza/`, `laufzeit/`, Compiler, HOST-ABI oder Host.
- Typen der Felder: `zahl` (f64), `ganz`, `diavolo`, `text`, `wahl`, `farbe` (Text → RGBA im Kern), `teil`, `form`, `bildchen`,
  `bildchen-liste`, ab H-K0 `teil-liste` und `zahl-liste` (K-149). Ein Feld kann **Lesefeld** sein (nur das System schreibt es) oder
  **Nachtragsfeld** (später an eine bestehende Komponente angehängt, im Szenen-Hash nur, wenn vom Standard abweichend). Komponenten, die das
  Programm nur anlegt und konfiguriert, kosten pro Takt **keinen** Grenzübergang.

## 4. Sprache (Kurzfassung; verbindlich SPEC §18)

| Was | API |
|---|---|
| Herd | `neu Herd(titel = "", breite: 640, hoehe: 360)`; `backe(fn = karton)`, `schliesse()`, `titel()`/`setzeTitel(t)`, `breite()`, `hoehe()`, `bildnummer()`, `zeit()` |
| Eingabe | `taste(n)`, `gedrueckt(n)`, `losgelassen(n)`, `mausX()`, `mausY()`, `maus(k = 1)`, `klick(k = 1)` |
| Welt | `hintergrund(f)`, `himmel(oben, unten = oben)`, `umgebung(f, staerke: 0.35)`, `nebel(f, von, bis)`, `kamera()` → Kamera-Teil, `sonne()` → Sonnen-Teil |
| Teile 2D | `herd.rechteck(x, y, b, h, farbe:, rundung: 0, umriss: 0)`, `herd.kreis(x, y, r, farbe:, umriss: 0)`, `herd.text(t, x, y, groesse: 16, farbe: "ofen", ausrichtung: "links")`, `herd.bild(bildchen, x, y, groesse: 1)`, `herd.gruppe(x = 0, y = 0)` |
| Teile 3D | `herd.koerper(form, x = 0, y = 0, z = 0, farbe: "weiss", glanz: 0.3, leuchten: 0, bild: karton)`, `herd.licht(x, y, z, farbe: "weiss", reichweite: 10)`, `herd.raum(x = 0, y = 0, z = 0)` (leeres 3D-Teil) |
| Teil | `x()`, `y()`, `z()`, `setzeLage(x, y, z?)`, `verschiebe(dx, dy, dz?)`, `drehung()`/`setzeDrehung(g)`, `neigung`/`rollen` (3D), `groesse()`/`setzeGroesse(s)` bzw. `(sx, sy, sz?)`, `ebene(n)` (2D), `sichtbar(d)`, `haenge(an)`, `eltern()`, `entferne()`, `kopie()`, `trifft(anderes)`, `mit(komponente)` → Komponente, `<komponente>()` → Komponente oder `karton`, `id()` |
| Komponente | `neu <Name>(feld: wert, …)`, Getter `feld()`, Setter `setzeFeld(w)` (verkettbar), generisch `hole("feld")`/`setze("feld", w)`, `teil()` |
| Ressourcen | `Form.wuerfel()`, `Form.kugel(teile: 24)`, `Form.zylinder(teile: 32)`, `Form.kegel(teile: 32)`, `Form.ebene()`, `Form.ring(dicke: 0.3, teile: 32)`, `neu Form(punkte, dreiecke, glatt: nein)`; `neu Bildchen(zeilen, farben: karton)` |
| Kniff (H-K13) | `klasse X erbt Kniff { leer takt() { teil().verschiebe(1, 0); } }`, `teil.mit(neu X())`, `teil.kniffe()`, `teil.ohne(k)`; überschreibbar `start`, `takt`, `beimBetreten(anderes)`, `beimVerlassen(anderes)`, `beimKlick`, `beimEntfernen` |
| Hilfen | `Herd.farbe(r, g, b, a = 1)` → `"#rrggbbaa"` |

**Komponenten:** `Lage` (immer da; per Teil-Methoden), `Rechteck`, `Kreis`, `Text`, `Bild` (2D) · `Koerper`, `Licht`, `Kamera` (3D) ·
`Bewegung` (beide: Tempo, Drehtempo, Beschleunigung), `Animation` (2D: Bildchen-Folge), `Partikel` (2D: Emitter); Ausbau (§12):
`Linie`, `Rahmen` (2D: Strecke, 9-Slice-Tafel), `Funken` (3D: Teilchen-Emitter), `Gleiten` (beide: Tween), `Ablauf` (beide:
Keyframes), `Fuehler` (beide: Kollider, Ereignisse als Zustand je Takt), `Blick` (2D: Kamera mit Scrollen, Zoom, Drehung, HUD ab
`festAb`), `Leine` (beide: Folgekamera), `Wucht` (2D: Physik), `Gelaende` (3D: Höhenkarte), `Vorlage` (beide: Prefab), `Kulisse` (beide: Szene an/aus), `Himmelszelt` (3D: Skybox). Die Fabriken
`festAb`, Welt-Maus `mausX`/`mausY`), `Leine` (beide: Folgekamera), `Wucht` (2D: Physik), `Gelaende` (3D: Höhenkarte), UI (2D, Maus im
Kern): `Taster` (Schaltfläche), `Leiste` (Füllbalken), `Regler` (Schieberegler), `Tafel` (ziehbare Fläche, Kinder = Inhalt). Die Fabriken
(`herd.kreis` …) sind nur Abkürzungen für „Teil anlegen + Komponente anhängen“.

**Farben** (Text): Palette `weiss #FFFFFF`, `schwarz #000000`, `grau #8A8580`, `ofen #2F2A26`, `tomate #D9452B`, `salami #A83232`,
`schinken #F2A0A0`, `basilikum #3E8E41`, `oliven #6B7A2A`, `mozzarella #FFF6E0`, `teig #E8C48A`, `kruste #C8955A`, `ananas #F5C518`,
`senf #F2B33D`, `himmel #8EC9F0`, `wasser #2E6FD9`, `aubergine #5B2A6E` oder `#rgb`/`#rrggbb`/`#rrggbbaa`. **Bildchen-Zeichen**
(Pixel-Bilder aus Text, `.`/Leerzeichen durchsichtig): `w s g o t r p b l m e k a y h u v` in Reihenfolge der Palette.

## 5. Spielschleife, Eingabe, Determinismus

- **Takt:** 60 Takte je simulierter Sekunde; `bildnummer()` zählt, `zeit()` = `bildnummer()/60`. Nie Wanduhr.
- **`backe(fn)`:** öffnet beim ersten Aufruf das Fenster, wartet auf Fenster-Ereignisse (über denselben Weg wie die Theke:
  `onUiWarte`/`uiEreignisse`, HOST-ABI `herd_warte`). `{"typ":"takt","anzahl":n,…}` → n-mal { Eingabe übernehmen (nur im ersten),
  `fn()`, Systeme }, dann **ein** Bildpaket an die Glut. Der Renderer verlangt den nächsten Takt erst nach dem Zeichnen; fällt er zurück,
  fasst er bis zu 4 Takte zusammen. Gleiche Ereignisse ⇒ bitgleich gleiches Spiel.
- **Präsentation und Anlauf:** gezeichnet wird synchron zur Bildwiederholung (nativ `PresentMode::Fifo`, Browser
  `requestAnimationFrame`), jeweils das neueste Bildpaket; die Simulation bleibt bei 60 Takten je Sekunde (bei 120/144 Hz zeigen
  manche Bildwiederholungen dasselbe Bild). Die Takt-Uhr beginnt erst mit dem **ersten gezeigten Bild** (Browser: im rAF danach),
  um einen halben Schritt versetzt (Anforderungen liegen mitten zwischen zwei Takten, nicht auf der Grenze) – Programmstart,
  Hochladen aller Ressourcen und erstes Zeichnen holen also keine Takte nach. Die Glut übersetzt ihre Pipelines beim Anlegen
  (vor dem ersten Takt), nativ wird das Fenster erst mit dem ersten Bild sichtbar. Die Uhr bestimmt nur, *wann* ein Takt kommt
  und wie viele er zusammenfasst – das Spiel hängt allein von den Takt-Ereignissen ab.
- **Eingabe als Zustand** je Takt (`tasten`, `maus`, `knoepfe` im `takt`-Ereignis; fehlende Felder unverändert): `taste` gehalten,
  `gedrueckt`/`losgelassen`/`klick` nur im ersten Takt eines Ereignisses. Tastennamen wie `Tastatur` (K-110). Ab H-K12 reicht jeder
  Motor Maus und Knöpfe je Takt vor `fn()` mit dem Kern-Export `eingabe` an den Kern (UI-Bausteine, `Blick.mausX`; K-151).
- **Schritte:** pizza-Aufrufe kosten normale Schritte, Engine-Arbeit (Systeme, Bild) kostet keine; P0002 je Takt neu (K-087).
- **Theke und Herd** nicht im selben Programm (P0013, K-133). **Kein Ton** in v1 (K-135).
- `herd`-Aufrufe in Küchen-Stücken (`brigade`) sind verboten (wie `ui_senden`: LaufzeitAnanas bzw. Trap im Klon).

## 6. Leistung (K-131)

**Ziele** (Entwicklungsrechner, 1280 × 720, gemessen im Wasm-Programm-Pfad – Chrome – und in der EXE; der Interpreter ist die
Korrektheits-Referenz, kein Leistungsziel):

| Benchmark | Ziel |
|---|---|
| B1 2D: 10 000 Sprites mit `Bewegung` + `Animation`, Programm tut pro Takt nichts | 60 fps; Kern-Takt + Bild ≤ 2 ms (EXE) / ≤ 4 ms (Chrome); ≤ 4 Draw-Calls |
| B2 2D: 10 000 Kreise, das Programm setzt **jede** Lage pro Takt selbst | 60 fps in der EXE und in Chrome; Kosten je Setter-Aufruf ≤ 150 ns (wasmi) / ≤ 80 ns (Chrome) |
| B3 3D: 1 000 Körper (6 Formen, 4 Farben, 1 Textur), Sonne mit Schatten, 8 Punktlichter, Nebel | 60 fps; ≤ 30 Draw-Calls (inkl. Schatten) |
| B4 Partikel: 20 000 Teilchen aus 10 Emittern | 60 fps; Partikel-System ≤ 1,5 ms (EXE) |

**Messung:** `bench/herd/*.pizza`; EXE mit `--herd-messung` (je Sekunde: Bildzeit, Anteil Programm/Kern/Glut, Draw-Calls, Instanzen),
Browser mit derselben Statistik in der Statusleiste und als E2E-Messlauf (echte GPU, unsichtbares Fenster). **Anlauf:**
`--herd-messung` beschreibt zusätzlich Glut-Anlegen und die ersten 30 Bilder einzeln (`Herd-Anlauf: Bild n · … ms nach Fenster ·
Abstand … · Takte · Programm/Kern/Glut`); im Browser meldet der Zeichner dasselbe einmal als `{typ:"anlauf"}` (E2E-Messlauf
„Anlauf Pizza-Konfigurator“). Ungebremst (ohne VSync) braucht keine Messung zu laufen: die Takt-Uhr begrenzt ohnehin auf 60 Bilder/s,
und `herd-bild bench` zeichnet offscreen. **Vorher/nachher:** Die erste
lauffähige Glut zeichnet bewusst ohne Instancing/Atlas (ein Draw-Call je Objekt) = Grundlinie; danach Instancing, Atlas, Culling,
Teilbaum-Matrizen – beide Messreihen in `bench/herd/ERGEBNISSE.md`.

**Grenzübergang:** Numerische Direktaufrufe (Browser: Import des Programm-Wasm direkt an den Export von `kern.wasm` gebunden, ohne
JS dazwischen; nativ: wasmi-Hostfunktion → Kern) sind der billigste Weg; Texte werden kopiert (selten). Batching der Setter kommt nur,
wenn B2 die Ziele verfehlt (dann als zusätzlicher Import `setze_zahlen(puffer)`, ABI-additiv).

## 7. Plattformen

### 7.1 Nativ (K-130)
- Programm-Thread: wasmi + Kern (Bibliothek); Hauptthread: winit-Ereignisschleife + Glut. Pro Bild wandert das Bildpaket über einen
  Kanal; Takte werden im Hauptthread nach dem Präsentieren angefordert (VSync = `PresentMode::Fifo`, nie Tearing – nicht
  `AutoVsync`, das unter Vulkan `FifoRelaxed` wählt und gerade verspätete Bilder reißen lässt). Das Fenster wird erst nach dem ersten
  gezeichneten Bild sichtbar; die Takt-Uhr beginnt dann (§5 „Anlauf“).
- Fenster erst beim ersten `backe`; Größe = Spielfeld × Skalierung, frei veränderbar (seitentreu mit Rändern).
- Kein Fenster/keine GPU möglich → Meldung + Exit 2 (wie K-096), ohne Terminal als Meldungsfenster. `PIZZA_HERD=0`, JSON-Modus und
  `--ui-ereignisse` sind fensterlos (W0104). Offscreen: `--herd-bilder=ordner [--herd-nur=n,m]` (PNG, Software-Adapter bevorzugt).
- PE-Subsystem WINDOWS bei Importgruppe `herd`. Linux: Herd im glibc-Starter selbst (wgpu/winit laden alles per `dlopen`; prüfen per
  `readelf -d`). Größe messen; Ziel Windows-EXE ≤ 6 MB.
- **Umsetzung H5** (`host/README.md` „Herd“): das Bildpaket geht als winit-Nutzerereignis (statt eigenem Kanal) zum Hauptthread; die
  Takt-Planung ist die des Browser-Zeichners (`zeichner.js`). Fensterbetrieb nimmt die echte GPU, ohne Adapter Software-Rückfall;
  Vorprüfung vor dem ersten Wasm-Befehl = Anzeige + Ereignisschleife + irgendein Adapter. `--herd-bilder` ohne `--ui-ereignisse`
  erzeugt selbst Takte (bis Bild 60 bzw. höchste `--herd-nur`-Nummer). Größe: Windows-EXE 4,2 MiB.

### 7.2 Browser
- **Programm-Worker** (wie heute): Interpreter oder Programm-Wasm **plus `kern.wasm`** (Instanz im selben Worker, direkte Aufrufe).
  Der Worker blockiert zwischen Takten auf SAB/Atomics – **deshalb wird dort nie gerendert**.
- **Render-Worker** mit `OffscreenCanvas` (vom Vorschaufenster-Canvas übertragen) und der Glut (wgpu-Wasm, WebGPU bevorzugt, sonst
  WebGL2). Bildpakete gehen per `MessageChannel` (übertragene ArrayBuffer) direkt vom Programm- zum Render-Worker; der Render-Worker
  zeichnet im `requestAnimationFrame` (= Bildwiederholrate, der Browser setzt immer VSync um) und schreibt den nächsten `takt` samt
  Eingabe in den SAB des Programm-Workers. Eingaben fängt die
  Seite am Canvas und reicht den Zustand an den Render-Worker. **Rückfall:** ohne OffscreenCanvas/rAF im Worker läuft dieselbe Glut im
  Hauptthread.
- Kein WebGPU und kein WebGL2 → Meldung, Lauf endet mit `geschlossen`. CSP: `script-src 'self' 'wasm-unsafe-eval'` genügt.
  Vorschaufenster wie die Theke (Größe K-123), App-Link bildschirmfüllend.
- **Umsetzung (H6), Entscheidungen:**
  - **Takt-Weg:** ein eigener **Herd-Puffer** je Lauf (SAB, getrennt vom Eingabe-/Theke-Puffer): Int32 `[0]` Folgenummer,
    `[1]` geschlossen, `[2]` Länge, ab Byte 16 der `takt` als JSON. **Einziger Schreiber von Takten ist der Zeichner** (Render-Worker
    bzw. Hauptthread-Rückfall); er zählt die Folgenummer hoch und weckt per `Atomics.notify`, der Programm-Worker wartet mit
    `Atomics.wait` auf eine neue Nummer. Da der nächste Takt erst nach dem Zeichnen angefordert wird, ist höchstens einer
    ausstehend – die Nachricht wird nie überschrieben, während sie gelesen wird. `geschlossen` setzen Seite (Schließen-Knopf) oder
    Zeichner (Fehler); der Programm-Worker setzt es beim nächsten `fenster` zurück. Kein `ui-warte` an die Seite, kein Umweg über
    den Hauptthread (Latenz: Bild → rAF → Takt direkt). Das HOST-ABI `herd_warte` des Wasm-Motors nutzt denselben Weg
    (`onUiWarte` des Workers).
  - **Bildpakete** gehen als übertragene `ArrayBuffer` über einen `MessagePort` (Seite legt den Kanal je Lauf an) an den Zeichner;
    an die Seite gehen nur `herd/fenster` und `herd/schliesse`. `kern.wasm` kompiliert die Seite **einmal** und gibt das
    `WebAssembly.Module` jedem Lauf mit (`herdKern`, für Interpreter und Wasm-Motor gleich); geladen werden Kern und Glut nur,
    wenn das Programm den Herd nutzt (Glut erst beim ersten `fenster`).
  - **Glut-Web** (`herd/glut-web`, wasm-bindgen 0.2.129, `--target no-modules` → klassisches Skript für `importScripts` und
    `<script>`), gebaut mit `node herd/baue-web.js`; wgpu wählt WebGPU (mit Adapter-Prüfung), sonst WebGL2. Auf GL legt die Glut den
    Atlas mit mindestens 2 Schichten an (eine Schicht wird dort `TEXTURE_2D` statt Array).
  - **Rückfall:** Scheitert der Render-Worker beim Anlegen (kein `requestAnimationFrame` im Worker, kein WebGL2 im
    OffscreenCanvas), gibt er den Port zurück und dieselbe Glut (`js/herd/zeichner.js`) zeichnet im Hauptthread auf einem frischen
    Canvas; scheitert auch das → „Dieser Browser kann weder WebGPU noch WebGL2 – der Herd braucht eines davon.“ + `geschlossen`.
  - **Eingabe:** nur bei Fokus auf dem Canvas; Tastennamen wie `Tastatur` (K-110), Wiederholungen ignoriert, kurz gedrückte
    Tasten zählen bis zum nächsten Takt, Fokusverlust = alles losgelassen; Maus/Touch in Spielfeld-Koordinaten (wie die Glut
    seitentreu eingepasst). Canvas in Gerätepixeln (`device-pixel-content-box`, scharf auf HiDPI). Statuszeile im Playground:
    Schnittstelle, fps, Draw-Calls, Instanzen.

## 8. Tests (K-134)

| Ebene | Was | Vergleich |
|---|---|---|
| Programm | `.ereignisse` (JSON-Lines, `takt`-Zeilen) + `.herd-erwartet` (je gesendetem Bild `{"art":"bild","bildnummer","szene","paket"}` mit FNV-1a-64-Hashes des Szenenzustands und des Bildpakets; `fenster`, `schliesse`) | **bitgleich**: Interpreter, Wasm, Host, Differenztests |
| Kern | `cargo test`; `herd/test-kern.js`: Hash nativ = `kern.wasm` für alle Benchmark-Szenen; Schema-Datei aktuell | **bitgleich** |
| Erweiterung | Test-Komponente `Probe` (nur unter `cfg(test)`/Testbau) – beweist: eine Rust-Datei + eine Registry-Zeile, ohne andere Änderungen in Sprache sichtbar | – |
| Pixel | Referenz-PNGs (`tests/herd/bilder/`), nativ offscreen (WARP/lavapipe) und Browser (E2E headless) mit Toleranz | **visuell gleich** (mittlere Abweichung ≤ 1,5 %, ≥ 98 % Pixel innerhalb 10/255) |
| Leistung | `bench/herd` | Ziele §6 (Bericht, kein harter CI-Test) |

`node tests/herd/zeige.js prog.pizza [--bild n]` zeigt Szene und Bildpaket lesbar (Fehlersuche). Keine sichtbaren Fenster in Tests.

## 9. So fügt man eine neue Komponente hinzu

Beispiel: `Pendel` (lässt ein Teil hin- und herschwingen).

1. **Rust-Datei** `herd/kern/src/komponenten/pendel.rs`: Struktur der Felder, `SCHEMA` (Name `Pendel`, Raum `beide`, Felder
   `weite: zahl = 30`, `tempo: zahl = 1` mit Bereichen), `fn takt(welt, dichte_daten)` (System) – optional `fn bild(…)` für eigene
   Instanzen eines vorhandenen Batch-Typs, optional Abfragen.
2. **Eine Zeile** in `herd/kern/src/komponenten/mod.rs` (Registry; Position = Systemreihenfolge).
3. `node herd/baue.js` → `kern.wasm` und `site/js/herd/schema.json` neu; Glut nur, wenn ein **neuer Batch-Typ/Shader** nötig ist.
4. Tests: `cargo test` (System), ein Fall `tests/faelle/herd-pendel.*`, ein Doku-Absatz, eine Zeile in SPEC §18.6 (Komponententabelle).
   **Ab H-K8** prüft jedes System, ob das Teil **wach** ist (`komponenten::wach(w, teil)` statt `w.zeile_opt(teil)`, bzw.
   `komponenten::ruht(w, teil)` vor dem ersten Schreiben) – ruhende Teile (`Vorlage`, ausgeschaltete `Kulisse`) laufen nicht. Bildbeiträge über
   `sichtbar(w, teil)` und Hüllen sind automatisch richtig (`welt_sichtbar` enthält die Ruhe).
5. Fertig – in pizza sofort verfügbar: `Pendel p = teil.mit(neu Pendel(weite: 40)); p.setzeTempo(2); teil.pendel().weite();`

**Nicht** anzufassen: `site/js/pizza/` (Interpreter-Quellen; daraus gebaut `site/js/pizza.js`), `laufzeit/`, `site/js/pizzaiolo/`, `HOST-ABI.md`, `host/` (Ausnahmen nur für neue
Feld-**Typen**, neue Eingabearten oder neue Fenster-Fähigkeiten – das sind Kern-Erweiterungen, keine Komponenten).

## 10. Roadmap (an Unity orientiert)

| Unity-Konzept | Herd | Stufe | Schicht |
|---|---|---|---|
| Scene, GameObject | Welt, `Teil` | **v1** | Kern |
| Components | Komponenten-Registry, generische Sprachabbildung | **v1** | Kern/Komponenten |
| Transform + Hierarchie | `Lage`, `haenge`, Welt-Matrizen | **v1** | Kern |
| Time / Update-Schleife | fester 60-Hz-Takt, `backe(fn)`, Systeme | **v1** | Kern |
| Input | Tastatur, Maus, Touch als Zustand | **v1** | Laufzeit/Kern |
| Camera | `Kamera` (3D perspektivisch), Spielfeld-2D | **v1** · 2D-Kamera `Blick` (Scroll/Zoom), Folgekamera `Leine` **H-K1** | Komponente |
| Light | Sonne mit Schatten, 8 Punktlichter, Umgebung, Nebel | **v1** · viele Lichter (Clustered Forward) + Spot **umgesetzt** · Schatten für Punkt/Spot **später** | Komponente + Glut |
| MeshRenderer, Material | `Koerper` (Form + Farbe/Glanz/Leuchten/Bild) | **v1** · geteiltes Material `Belag` **H-K2** · Relief/Kachelung/PBR/Nässe am `Belag` **umgesetzt** | Komponente + Glut |
| Shader | feste Shader | eigene Shader (WGSL) **später** | Glut |
| Sprites / 2D | `Rechteck`, `Kreis`, `Text`, `Bild`, Atlas | **v1** · `Linie`, 9-Slice `Rahmen` **H-K3a** · `Vieleck` **H-K3b** (umgesetzt) | Komponente (3b + Glut) |
| Animation | `Animation` (Bildchen-Folge) | **v1** · Tweens `Gleiten`, Keyframes `Ablauf` **H-K4** · Skelett **später** | Komponente |
| Particle System | `Partikel` 2D | **v1** · 3D-Partikel `Funken` **H-K5** | Komponente + Glut |
| Collider / Trigger | `trifft` (Hüllen) | **v1** · Kollider `Fuehler`, Ereignisse als Zustand je Takt (betreten/verlassen) **H-K6** | Komponente |
| Physics 2D / 3D | – | 2D-Physik `Wucht` (Rigidbody, Impulse) **H-K7** · 3D **später** | Komponente (System) |
| Prefabs / Assets | `kopie()`, Formen/Bildchen | **v1** (kopie) · `Vorlage` **H-K8** · größere Bilder/Texturen: abgelöst durch PROJEKTE.md (E13, K-145, K-147, PD1/PD3) | Kern |
| Szenenwechsel | – | `Kulisse` (Teilbäume an/aus), leeren per `entferne` **H-K9** (umgesetzt) | Kern |
| Tilemap | – | Kachelkarte `Fliesen` **H-K10** (umgesetzt) | Komponente |
| Gelände / Skybox | Himmelsverlauf | `Gelaende` aus Höhenkarte **H-K11a** · Skybox `Himmelszelt` **H-K11b** | Komponente (11b + Glut) |
| UI (uGUI) | Text, Rechteck | `Knopf`, `Leiste`, `Regler`, `Tafel` + Maus im Kern **H-K12** | Komponente + Kern-ABI |
| Skript-Komponenten (MonoBehaviour) | Spiellogik in `backe` | eigene pizza-Klassen `erbt Kniff` (`takt()`, Rückrufe) **H-K13** | Laufzeit |
| Audio | – (K-135) | `klang` **H-K14** | eigene Importgruppe |
| Post-Processing | – | `Stimmung`: HDR, ACES, Bloom, Höhennebel, Vignette, Korn **umgesetzt** · Bildschirmraum-Spiegelung/AO **später** | Komponente + Glut |
| Editor | – | Szenenansicht im Playground **später** | UI |

Verbindlich für die Stufen H-K0 … H-K14 (Inhalt, Reihenfolge, Wellen, Abnahme) ist der **Stufenplan §12**; was umgesetzt ist, steht in
**§11.1**. „später“ = nicht im Plan (§12.6).

## 11. Pakete v1

| Paket | Inhalt | Dateien | hängt ab von |
|---|---|---|---|
| **H0 Konzept** | diese Datei, SPEC §18, K-128 … K-136 | `HERD.md`, `SPEC.md`, `KLAERUNGEN.md` | – |
| **H1 Kern** | Welt, Registry, Schema, Komponenten v1, Systeme, Bildpaket-Format, Herd-ABI (C-artige Exporte), `kern.wasm`, `schema.json`, Determinismus-Test, Kern-Benchmarks | `herd/kern/**`, `herd/README.md`, `site/js/herd/kern.wasm`, `site/js/herd/schema.json` | H0 |
| **H2 Glut** | wgpu-Backend nativ (offscreen + Fenster-API) und Web (wasm-bindgen, WebGPU/WebGL2), Shader, Instancing, Atlas, Schatten, Grundlinie + Optimierung, Referenzbilder | `herd/glut/**`, `site/js/herd/glut*` | H1 (Bildpaket-Format) |
| **H3 Interpreter** | `Herd`/`Teil`/Komponenten generisch aus `schema.json`, Aufrufe an `kern.wasm`, Spielschleife, Eingabe, Tests, Prüfstand | `site/js/pizza/herd/`, `tests/**`, `pruefstand/` | H1 |
| **H4 Wasm** | Compiler/Laufzeit: Importgruppe `herd` (generische Importe), Differenztests | `laufzeit/**`, `site/js/pizzaiolo/**`, `HOST-ABI.md` | H1, H3 |
| **H5 Nativ** | Host: Kern + Glut + winit, Offscreen, CLI, Starter, PE-Subsystem, Docker, Größe, `--herd-messung` | `host/**`, `Dockerfile` | H2, H4 |
| **H6 Browser** | Programm-Worker + `kern.wasm`, Render-Worker + Glut, Vorschaufenster, App-Link, Editor-Vervollständigung | `site/js/herd/**`, `site/js/worker.js`, `ui/**` | H2, H3 (H4) |
| **H7 Spiele, Doku, Messung** | 2D-Spiel, 3D-Spiel (Fokus schöne Grafik), Doku-Abschnitt mit Bildern, `bench/herd` + Ergebnisse, E2E, CI | `site/beispiele/herd*`, `site/js/doku/`, `bench/herd/`, `e2e/` | H5, H6 |

Stand der Umsetzung: §11.1. Die nächsten Stufen **H-K0 … H-K14** (Roadmap §10) sind im verbindlichen **Stufenplan §12** beschrieben,
mit Reihenfolge, Wellen und Abnahme.

### 11.1 Stand (umgesetzt)

Wer eine Stufe abschließt, trägt hier den Commit (bei mehreren den ersten und den letzten) und die Messwerte bzw. Tests ein.

| Stufe | Inhalt | Commit | Messung/Tests |
|---|---|---|---|
| **H0** Konzept | HERD.md, SPEC §18, K-128 … K-136 (erste Fassung, dann v1-Neufassung), ARCHITEKTUR §6 | `1dbf259`, `009f6c4`, `b56e894` | – |
| **H1** Kern | Welt, Registry, Komponenten v1, Bildpaket v1, Herd-ABI, `kern.wasm`, `schema.json`, Szenen-Skripte; ABI-Nachtrag (Genus, `typ_nummer`, `komp_info`, `fehler_neu`) | `495b777` (H1a), `eeb396d`, `644fb3b` (H1b) | `cargo test -j 2`; `node herd/test-kern.js` bitgleich nativ = Wasm (B1–B4 klein/voll, `hierarchie.herd`); Kern je Bild B1 0,47 ms nativ / 0,64 ms Wasm (`bench/herd/ERGEBNISSE.md`) |
| **H2** Glut | wgpu offscreen nativ (Instancing, Atlas, Schatten repariert, `herd-bild`, Referenzbilder), Glut-Web (WebGPU/WebGL2) | `5df8362` (Zwischenstand), `3c4aa10`, `ea1aed0` (H2a), `46952d6` (Glut-Web, als H6 bezeichnet) | 4 Referenzbilder, Pixeltest K-129; WARP: B1 voll 1 Draw-Call, B3 voll 15 Draw-Calls (inkl. Schatten) |
| **H3** Interpreter | `Herd`/`Teil`/Komponenten generisch aus dem Kern-Schema, Spielschleife, Eingabe, `.herd-erwartet` | `1385559`, `a123456`, `2e0f40c` (H3b) | `tests/faelle/herd-*`, `node tests/herd/erwartet.js`, Prüfstand `a18-herd.js`; Setter ≈ 155 ns |
| **H4** Wasm | Compiler/Laufzeit, Importgruppe `herd`, JS-Host, Schema beim Start | `3171a01`, `09a58d1`, `62c6425` | `npm run test:wasm`; Grenzübergang ≈ 7 ns, Setter im Wasm-Motor ≈ 28 ns |
| **H5** Nativ | Host mit Kern + Glut + winit, Offscreen-PNGs, PE-Subsystem, Linux-Starter, Gruppenprüfung EXE-Export | `574d5c5`, `66ccd26`, `cdc1e74`, `e80a544`, `c711005`, `56569c9` | Differenztests mit nativem Host; Windows-EXE 4,2 MiB (Ziel ≤ 6 MB) |
| **H6** Browser | Render-Worker + OffscreenCanvas, Takt-Weg per SAB, Vorschaufenster, App-Link, Editor aus `schema.json`, E2E-Nachspielen | `832de3d`, `1e56e86`, `7e873b5`, `24316da` | E2E 13/14/15 (headless), Browser-Messlauf SwiftShader (indikativ) |
| **H7** Spiele, Doku, Messung | Teigfänger 2D, Teigball 3D, drei Lernbeispiele, `tests/herd/bild.js`, Doku `40-herd.js` mit Bildern | `950e338` (H7a), `3b08e51`, `5b1a123`, `c2d24e6`, `43122a3` | 5 Beispiele mit `.herd-erwartet` in allen Modi; `bench/herd/ERGEBNISSE.md` |
| **H-K0** Grundlagen | Feldtypen `teil-liste` (11)/`zahl-liste` (12), Lesefelder, Nachtragsfelder, Nachlauf-Systeme, `Art::LEER` (auch Linie/Rahmen umgestellt), ABI `setze_zahlen`/`hole_zahlen` in Kern, `kern.wasm`, Skript, Interpreter, Laufzeit, Host, Editor; K-148, K-149; kein Beispiel (unsichtbar) | (dieser) | `cargo test -j 2` (Kern 34/34 inkl. 8 neue `tests::hk0`, Skript 3 + `tests/probe.herd`, Werkzeug 4); `node herd/test-kern.js` 11 Läufe bitgleich (neu `listen.herd`); `erwartet.js` 30 ✓ unverändert; `npm test` (310 Fälle), Prüfstand 713/713, `test:wasm` 1461, `test:differenz` 1113 ohne Abweichung; Host `cargo test` + `host/test.js` 61/61; UI-Tests; E2E 286/287 (1 übersprungen); Rauchtest mit Probe-Kern (nicht eingecheckt): Interpreter = Wasm = Host bitgleich |
| **H-K3a** Linie, Rahmen | `Linie` (11, ein `RECHTECK` längs der Strecke, runde Enden über die Rundung), `Rahmen` (12, bis zu 9 `BILD`-Instanzen, 9-Slice), Szene `linien.herd`, Fälle `herd-linie`/`herd-rahmen`, Beispiel `uhr.pizza`, Doku-Abschnitt `herd-ausbau`; kein Bildpaket-/Glut-Umbau | (dieser) | `cargo test -j 2` (Kern 26/26 inkl. 2 neue); `node herd/test-kern.js` 10 Läufe bitgleich nativ = Wasm (neu `linien.herd`); `node tests/herd/erwartet.js` 30 ✓; `npm test` (310 Fälle), Prüfstand 713/713, `test:wasm` 1461, `test:differenz` 1113 ohne Abweichung |
| **H-K5** Funken | `Funken` (13, 3D-Teilchen im Kern, Kegel um die Richtung in den Achsen des Teils, `weltlage`), Bildpaket-Abschnitt `TEILCHEN3D` (14, nur bei Nutzung, `VERSION` 1), Glut-Shader `funken.wgsl` (kamerazugewandt, leuchtend additiv / deckend sortiert, je Mischart ein Draw-Call), Szene `b5-funken.herd`, Referenzbild `3d-funken`, Fall `herd-funken`, Beispiel `ofenfunken.pizza`, Doku in `herd-ausbau` | (dieser) | `cargo test -j 2` (Kern 36/36 inkl. 2 neue, Pixeltest 5 Referenzbilder); `node herd/test-kern.js` 13 Läufe bitgleich nativ = Wasm (neu B5 klein + voll 20 000 Teilchen); `erwartet.js` 33 ✓ (keine bestehende geändert); `npm test` (311 Fälle), Prüfstand 715/715, `test:wasm` 1468, `test:differenz` 1118 ohne Abweichung; E2E headless 289/290 (1 übersprungen), `3d-funken` WebGL2 0,007 %; B5 voll Kern je Bild 0,35 ms nativ / 0,50 ms Wasm (Funken-Takt 0,028 ms, Bildbau 0,33 ms; Ziel ≤ 1,5 ms); WARP 3 Draw-Calls |
| **H-K1** Blick, Leine | `Blick` (18, 2D, kein System: `paket::baue` bestimmt vor den Bildbeiträgen die Sicht des aktiven Blicks mit der kleinsten ID – T(Spielfeldmitte) · R(−Drehung samt Eltern) · S(zoom) · T(−Mitte), über `lokal_2d`/`mal_2d` –, `Bildbau::flach` multipliziert `m` nur bei aktivem Blick und `ebene < festAb`, Culling danach; Grenzen klemmen nur die Mitte der Sicht, eine Achse ohne Ausdehnung bleibt frei; `Bildbau::sicht_welt()` für H-K10), `Leine` (19, beide, Nachlauf: Ziel-Weltlage + Abstand, `1 − weich^dt`, radiale Totzone, 3D `schaue` über `schaue_auf`), Szene `blick.herd`, Fälle `herd-blick`/`herd-leine`, Beispiel `weite-welt.pizza` (Lieferroller in einer Stadt von 3 × 2 Fenstern), Doku in `herd-ausbau`; ohne Blick byte-gleiche Bildpakete, kein Format, keine Glut | (dieser) | `cargo test -j 2 -p herd-kern -p herd-skript` (Kern 57/57 inkl. 9 neue `tests::hk1`, Skript 3 + 1); `node herd/test-kern.js` 22 Läufe bitgleich nativ = Wasm (neu `blick.herd` klein + N = 10 000); `erwartet.js` 49 ✓ (keine bestehende geändert); `npm test` (326 Fälle, 66 Beispiele, 147 Doku), Prüfstand 783/783 + 6/6, `test:wasm` 1519, `test:differenz` 1140 ohne Abweichung; Sichtprüfung und Glut-Pixeltest stehen aus (Render-Pause) |
| **H-K2** Belag | `Belag` (16, 3D, geteiltes Material, kein System/Bildbeitrag), `Koerper.belag` (Teil, Nachtragsfeld; Belag-Werte statt eigener, sonst eigene ohne Fehler; Belag-Teil darf unsichtbar sein), Szene `belag.herd`, Fall `herd-belag`, Beispiel `belaege.pizza`, Doku in `herd-ausbau`; kein `paket.rs`, keine Glut | (dieser) | `cargo test -j 2 -p herd-kern -p herd-skript` (Kern 40/40 inkl. 1 neuer, 2 Schutztests um die Nachtragsliste ergänzt; Skript 3 + 1); `node herd/test-kern.js` 16 Läufe bitgleich nativ = Wasm (neu `belag.herd`); `erwartet.js` 41 ✓ (keine bestehende geändert); `npm test` (317 Fälle), Prüfstand 722/722 + 6/6, `test:wasm` 1503, `test:differenz` 1132 ohne Abweichung; Sichtprüfung und Glut-Pixeltest (`cargo test` herd-werkzeug) stehen aus (Render-Pause) |
| **H-K4** Gleiten, Ablauf | `Gleiten` (14, Tween einer Lage-Größe, 6 Kurven, einmal/wiederholen/pendeln, Neustart bei neuem `nach`/`was`), `Ablauf` (15, Keyframes aus `zahl-liste`n, linear/sanft, Schleife/Halt/rückwärts, `zeit` springt auch angehalten); erster Nutzer von `zahl-liste` (Sprachtest `herd-zahl-liste`); Kern-Helfer `Speicher::zahlen_puffer_mut`; Szene `gleiten.herd`, Fälle `herd-gleiten`/`herd-ablauf`/`herd-zahl-liste`, Beispiel `speisekarte.pizza`, Doku in `herd-ausbau`; kein Bildpaket-/Glut-Umbau | (dieser) | `cargo test -j 2` Kern 39/39 (inkl. 3 neue), Skript 3+1; `node herd/test-kern.js` 15 Läufe bitgleich nativ = Wasm (neu `gleiten.herd` klein + voll 9 000 Gleiter); `erwartet.js` 38 ✓ (keine bestehende geändert); `npm test` (316 Fälle, 63 Beispiele, 144 Doku), Prüfstand 720/720 + 6/6, `test:wasm` 1496, `test:differenz` 1129 ohne Abweichung |
| **H-K6** Fühler | `Fuehler` (17, Typnummer in Merge-Reihenfolge, Nachlauf; Formen auto/kreis/rechteck/kasten/kugel mit Versatz, Gruppen/Masken 32 Bit beidseitig, Lesefelder `beruehrt`/`betreten`/`verlassen` (teil-liste, nach ID)/`anzahl`), gemeinsame Kollisionssuche für H-K7 (`fuehler::{Kandidat, form, sammle, breitphase, paare}`, Sweep-and-Prune nach `ordnungs_bits(min x)` + ID in bis zu 64 waagerechten Streifen), Engphase `komponenten::trifft` (aus `abi.rs` verschoben, neu `Huelle::Kugel`), Szene `fuehler.herd`, Fälle `herd-fuehler`/`herd-teil-liste` (Sprachtest H-K0), Beispiel `muenzen.pizza`, Doku in `herd-ausbau`, K-150 | (dieser) | `cargo test -j 2 -p herd-kern -p herd-skript` (Kern 46/46 inkl. 6 neue `tests::hk6`, Skript 3 + 1); `node herd/test-kern.js` 19 Läufe bitgleich nativ = Wasm (neu `fuehler.herd` klein, N = 1 000, N = 10 000); `erwartet.js` 45 ✓ (keine bestehende geändert); `npm test` (319 Fälle), Prüfstand 724/724 + 6/6, `test:wasm` 1511, `test:differenz` 1136 ohne Abweichung; Sichtprüfung und Glut-Pixeltest stehen aus (Render-Pause); B6: 1 000 Fühler Takt 0,20 ms nativ / 0,31 ms Wasm (Ziel Nachlauf ≤ 0,5 ms), 10 000 Fühler (dichte Szene) 7,0 / 9,7 ms (`bench/herd/ERGEBNISSE.md`) |
| **H-K3b** Vieleck | `Vieleck` (21, 2D, Typnummer in Merge-Reihenfolge; `punkte` zahl-liste, `farbe`, `umriss`; Ohrenschneiden ab Punkt 0 nur mit f64-Vorzeichen-Tests, Prüfung auf einfaches Vieleck O(n²), doppelte/kollineare Punkte fallen aus dem Umlauf; Zerlegung im Nachlauf in verborgenen Puffern `quelle`/`netz` gecacht, Bildbeitrag rechnet bei veraltetem Cache dasselbe ohne Speichern; Umriss als Gehrungsband aus Dreiecken im Kern; ungültig → nichts, kein Fehler; Hülle = umschließendes Rechteck), `flach_art::DREIECK = 5` im INST2D-Strom (Ecken direkt statt Matrix, `p0` = Außenkanten-Maske; VERSION 1, ohne Vieleck byte-gleich), `Bildbau::sicht_matrix`/`dreieck`, Glut `flach.wgsl` (Zweig Art 5, nativ + Web neu gebaut), Szene `vieleck.herd`, Referenzbild `2d-vieleck`, Fall `herd-vieleck`, Beispiel `pizzastuecke.pizza`, Doku in `herd-ausbau` | (dieser) | `cargo test -j 2` (Kern 69/69 inkl. 4 neue `tests::hk3b`, Glut 1, Skript 3 + 1, Werkzeug 4 inkl. Pixeltest mit `2d-vieleck`); `node herd/test-kern.js` 27 Läufe bitgleich nativ = Wasm (neu `vieleck.herd` klein + N = 100); `erwartet.js` 55 ✓ (keine bestehende geändert); `npm test` (330 Fälle, 68 Beispiele, 149 Doku), Prüfstand 818/818 + 6/6, `test:wasm` 1533, `test:differenz` 1146 ohne Abweichung; E2E headless 307/308 (1 übersprungen, `13-herd-glut` mit `2d-vieleck`); WARP: Referenzbild 1 Draw-Call, 95 2D-Instanzen |
| **H-K8** Vorlage | `Vorlage` (23, beide, `name` "", kein System/Bildbeitrag); gemeinsames Ruhe-Konzept für H-K9: `Art::ruhe` (Regel je Komponente) und `Art::kopie_ohne`, abgeleiteter vererbter Zustand `Teile::welt_ruht` (sofort nachgeführt bei mit/ohne/`haenge`/`kopie` und nach `setze_zahl` an einer Ruhe-Komponente, nicht im Hash), `welt_sichtbar` enthält ihn (nicht gezeichnet, `trifft` nein, keine Fühler-Form), Helfer `komponenten::wach`/`ruht`; Systeme `bewegung`, `animation`, `partikel`, `funken`, `gleiten`, `ablauf`, `leine`, `fuehler`, `wucht` überspringen ruhende Teile (die reinen Caches `Vieleck`-Zerlegung und `Gelaende`-Netz laufen weiter, Kopien erben sie), `kamera`/`blick` zählen nur wache; `kopie` lässt `Vorlage` an der Wurzel weg (verschachtelte bleiben); Szene `vorlage.herd`, Fall `herd-vorlage`, Beispiel `pizzaofen.pizza` (statt `gegnerwelle`), Doku in `herd-ausbau` | (dieser) | `cargo test -j 2` in `herd/` (Kern 80/80 inkl. 6 neue `tests::hk8`, Skript 3 + 1, Glut 1, Teigling 13, Werkzeug 4 inkl. Pixeltest); `node herd/test-kern.js` 32 Läufe bitgleich nativ = Wasm (neu `vorlage.herd` klein + N = 1 000, mit Vieleck- und Gelände-Kind); `erwartet.js` 61 ✓ (keine bestehende geändert); `npm test` (332 Fälle, 70 Beispiele, 151 Doku), Prüfstand 822/822 + 6/6, `test:wasm` 1571, `test:differenz` 1243 ohne Abweichung; Sichtprüfung `pizzaofen` offscreen (WARP) |
| **H-K7** Wucht | `Wucht` (20, 2D, braucht `Fuehler`, Takt-System nach Ablauf; `art` dynamisch/kinematisch/fest, `masse`, `tempoX/Y`, `schwerkraft` 0, `daempfung`, `abprall`, `reibung` 0.2, Einmal-Stoß `stossX/Y`, Lesefeld `amBoden`; Kreise und achsenparallele Rechtecke, keine Drehung; fester Fühler ohne Wucht = fester Körper), Löser in `wucht.rs`: Breitphase `fuehler::breitphase` auf den Fühlern mit `ausloeser: nein` (neu `fuehler::sammle_wenn`), Engphase `wucht::kontakt`, Warmstart aus verborgener Spalte `kontakte`, je 4 Iterationen Impuls + Positionskorrektur (vorwärts/rückwärts), `wucht::{Koerper, Kontakt, loese}` öffentlich für H-K10 (feste Kacheln als Körper), Szene `wucht.herd`, Fall `herd-wucht`, Beispiel `teigkugeln.pizza`, Doku in `herd-ausbau`, K-150 (Nachtrag) | (dieser) | `cargo test -j 2 -p herd-kern -p herd-skript` (Kern 65/65 inkl. 8 neue `tests::hk7`, Skript 3 + 1); `node herd/test-kern.js` 25 Läufe bitgleich nativ = Wasm (neu `wucht.herd` klein, N = 500, N = 2 000); `erwartet.js` 52 ✓ (keine bestehende geändert); `npm test` (327 Fälle), Prüfstand 785/785 + 6/6, `test:wasm` 1526, `test:differenz` 1143 ohne Abweichung; Sichtprüfung und Glut-Pixeltest stehen aus (Render-Pause); B7: 500 Kugeln Takt 0,42 ms nativ / 0,59 ms Wasm (Ziel ≤ 1 ms), 2 000 Kugeln 2,1 / 2,8 ms (`bench/herd/ERGEBNISSE.md`) |
| **H-K9** Kulisse | `Kulisse` (25, beide, `aktiv` ja, `name` "", kein System/Bildbeitrag): nur `Art::ruhe` = `aktiv` nein auf dem Ruhe-Konzept aus H-K8 (sofort nachgeführt über den `setze_zahl`-Haken, vererbt, verschachtelt, mehrere aktiv); `kopie` behält die Kulisse samt `aktiv`; Kamera, Blick und Licht in ausgeschalteten Kulissen zählen schon über `wach`/`sichtbar` nicht – kein Umbau an `welt.rs`, `kamera.rs`, `blick.rs`, `licht.rs`; Szene `kulisse.herd`, Fall `herd-kulisse`, Beispiel `kulissen.pizza` (Titel → Leertaste → Spiel ⇄ Pause → Ende), Doku in `herd-ausbau` | (dieser) | `cargo test -j 2` in `herd/` (Kern 93/93 inkl. 6 neue `tests::hk9`, Skript 4 + 1, Glut 1, Teigling 13, Werkzeug 7 inkl. Pixeltest); `node herd/test-kern.js` 36 Läufe bitgleich nativ = Wasm (neu `kulisse.herd` klein + N = 2 000); `erwartet.js` 67 ✓ (keine bestehende geändert); `npm test` (334 Fälle, 72 Beispiele, 153 Doku), Prüfstand 826/826 + 6/6, `test:wasm` 1585, `test:differenz` 1249 ohne Abweichung; Sichtprüfung `kulissen` offscreen (WARP: Titel, Spiel, Pause, Ende) |
| **H-K11a** Gelände | `Gelaende` (22, 3D, Takt-System nach Wucht; `hoehen` (zahl-liste, zeilenweise), `spalten`/`zeilen` 32 (2 … 256), `weite` 1, `farbe` basilikum, `glanz` 0.1, `bild` (Textur über die ganze Fläche, auch Teigling-Texturen), `schatten` ja), Netz im Takt nur bei geänderten Netz-Feldern (Prüfwert FNV-1a je 64-Bit-Wort in verborgenen Spalten `pruefLo`/`pruefHi`, Ressourcen-ID in `netz`), Zeichnen und Hülle wie `Koerper`; `formen::netz_glatt` (öffentlich: Punkte + UV + Dreiecke, glatte Normalen gemeinsam mit `Form.eigene(glatt)`), `ressourcen.rs` unverändert (`Ressourcen::form` genügt); kein Bildpaket-/Glut-Umbau (NETZ-Abschnitt, u32-Indizes, FEST-/SCHATTEN-Zug wie bisher); Szene `gelaende.herd`, Fall `herd-gelaende`, Beispiel `huegel.pizza` (Tomatenplantage, Orbit-Kamera), Doku in `herd-ausbau` | (dieser) | `cargo test -j 2` in `herd/` (Kern 74/74 inkl. 4 neue `tests::hk11a` + 1 in `formen`, Skript 3 + 1, Teigling 13, Glut 1, Werkzeug-Pixeltest 4); `node herd/test-kern.js` 30 Läufe bitgleich nativ = Wasm (neu `gelaende.herd` klein, 256 × 256, 256 × 256 mit Neubau je Takt); `erwartet.js` 58 ✓ (keine bestehende geändert); `npm test` (331 Fälle, 69 Beispiele, 150 Doku), Prüfstand 820/820 + 6/6, `test:wasm` 1540, `test:differenz` 1149 ohne Abweichung; Sichtprüfung `huegel.pizza` offscreen (WARP) in Ordnung; B8: Netzbau 256 × 256 je Umbau ≈ 7,8 ms nativ / 9,8 ms Wasm, ohne Änderung Prüfwert über 65 536 Höhen ≈ 0,07 ms je Takt (`bench/herd/ERGEBNISSE.md`) |
| **H-K10** Fliesen | `Fliesen` (24, 2D, kein System; `bilder`, `spalten`/`zeilen` 1 … 1024, `karte`, `kachel`, `fest`; Lage = obere linke Ecke, Kachel n = `bilder[n]` ab 1), Bildbeitrag nur im Fenster aus `Bildbau::sicht_welt()` über die Inverse der Raster-Matrix (`fliesen::fenster`, HUD-Ebene: Spielfeld), feste Kacheln als `Koerper::FEST` in `wucht.rs` (`kachel_kontakte`, `kachel_kontakt`: nur offene Seiten auf der Seite der Körpermitte – keine Geisterkanten an Fugen; Gruppe 1, nur dynamische Körper; Warmstart-Schlüssel negativ), `MAX_LISTE` unverändert (größere Welten aus mehreren Rastern), Skript-Listen `[folge N i AUSDRUCK]` (`herd/skript*`), Szene `fliesen.herd`, Fall `herd-fliesen`, Beispiel `huepfwelt.pizza` (Pizzabote im Keller), Doku in `herd-ausbau`, K-150 (Nachtrag) | (dieser) | `cargo test -j 2` (Kern 87/87 inkl. 7 neue `tests::hk10`, Skript 4 + 1 inkl. `folge`, Glut 1, Teigling 13, Werkzeug 4 inkl. Pixeltest); `node herd/test-kern.js` 34 Läufe bitgleich nativ = Wasm (neu `fliesen.herd` klein + voll 1024 × 1024 Kacheln); `erwartet.js` alle ✓ (keine bestehende geändert); `npm test` (333 Fälle, 71 Beispiele, 152 Doku), Prüfstand 824/824 + 6/6, `test:wasm` 1578, `test:differenz` 1246 ohne Abweichung; Sichtprüfung `huepfwelt` (WARP); B9: Bild 0,013 ms nativ / 0,018 ms Wasm (256²), 0,033 / 0,049 ms (1024²), Ziel ≤ 0,3 ms |
| **H-K11b** Himmelszelt | `Himmelszelt` (26, 3D, kein System; `bilder` (bildchen-liste: rechts, links, oben, unten, vorn = −z, hinten), `oben` himmel, `horizont` mozzarella, **`boden`** teig (statt `unten`, Schlüsselwort), `sonnenscheibe` 0 (Grad, 0 … 90), `sterne` 0 (0 … 1); es gilt das wache mit der kleinsten Teil-ID), Bildpaket-Abschnitt `HIMMELSZELT` (15, fester 208-Byte-Uniform-Block, nur bei Nutzung, Flag 4 mit; ohne `herd.umgebung` Umgebungslicht aus `oben`), Glut `himmel.wgsl` `fs_zelt` (Bindung 13, Würfelseiten ohne Cube-Map, Seiten aus Atlas **und** eigenen Texturen (Bit 17, PD3-Arrays, bilinear/trilinear), Deckkraft über prozeduralem Himmel, Sonnenscheibe vom Horizont abgeschnitten, Sterne aus Hash je Winkelzelle), nativ + Web neu gebaut; Teigling-Muster 5 (Bergketten) in beiden Szenen-Spielern; Kern-Test „Feldnamen keine pizza-Schlüsselwörter“; Szene `himmelszelt.herd`, Referenzbild `3d-himmelszelt`, Fall `herd-himmelszelt`, Beispiel `sternennacht.pizza`, Doku in `herd-ausbau` | (dieser) | `cargo test -j 2` in `herd/` (Kern 97/97 inkl. 4 neue `tests::hk11b`, Skript 4 + 1, Teigling 13, Glut 1, Werkzeug 7 inkl. Pixeltest mit `3d-himmelszelt`); `node herd/test-kern.js` 38 Läufe bitgleich nativ = Wasm (neu `himmelszelt.herd` klein + N = 100); `erwartet.js` ✓ (keine bestehende geändert); `npm test` (335 Fälle, 73 Beispiele, 154 Doku), Prüfstand 828/828 + 6/6, `test:wasm` 1592, `test:differenz` 1252 ohne Abweichung; E2E headless 13 (`3d-himmelszelt` WebGL2 0,002 %), vor dem Rebase auch 05/07/14 229/229; WARP 7 Draw-Calls (Himmel 1); Sichtprüfung `sternennacht` und Referenzbild offscreen (WARP) |
| **Viele Lichter** (Clustered Forward, Nutzerwunsch neben H-K) | `Licht` ohne 8er-Grenze: Nachtragsfelder `kegel`/`kegelRand` (Spot entlang −z des Teils), neues Kern-Modul `lichter.rs`: Abschnitt `LICHTER` (16, nur bei > 8 wirksamen Punktlichtern oder einem Spot; sonst Paket byte-gleich): Kopf 64 B (Raster 16 × round(16/Seitenverhältnis) × 24, Tiefe exponentiell nah … fern, Blickrichtung), bis 4096 Lichter à 48 B (nächste zuerst), Zellen-Tabelle (Kopf `versatz << 8 | anzahl` je Zelle, ≤ 255, dann Licht-Indizes; konservativ: Quader um die Kugel je Tiefenscheibe projiziert); Glut: Bindungen 14 (Kopf), 15 (Lichter RGBA32F, 3 Texel je Licht), 16 (Zellen R32Uint) – nur `textureLoad`, WebGL2-tauglich; `fs_licht` sucht die Zelle aus NDC + Tiefe, Spot = smoothstep(cos außen, cos innen); ohne Abschnitt Kopf 0 → v1-Pfad (Referenzbilder unverändert); Szene `lichter.herd`, Referenzbild `3d-lichter` (256 Lichter + 4 Spots), Beispiel `lichterfest.pizza` (144 Birnen + 6 Spots), Doku in `herd-ausbau`; Werkzeug: `tests/herd/bild.js` nimmt Projektordner (Bildchen.laden als Skriptzeile `teigling_datei`) | (dieser) | `cargo test -j 2` (Kern 109/109 inkl. 3 neue `tests::viele_lichter`: Schwelle/Nachtrag, Spot, Zellen konservativ an > 2000 Stichproben); `node herd/test-kern.js` bitgleich nativ = Wasm (neu `lichter.herd` klein + N = 1024); B10: Kern je Bild 0,23 ms (256 Lichter) / 0,88 ms (1024) / 3,8 ms (4096) nativ, Wasm 0,40 / 0,97 / 4,4 ms; WARP Referenzbild 4 Draw-Calls |
| **Stimmung** (HDR, Bloom, Tonkurve, Höhennebel; Nutzerwunsch neben H-K) | `Stimmung` (31, 3D, kein System; Typnummer in Merge-Reihenfolge nach H-K12), Nachtragsfelder `Koerper.strahlen`/`Belag.strahlen` (Faktor auf `leuchten`, `fs_licht`: ≤ 1 wie v1, darüber albedo · leuchten), Bildpaket-Abschnitt `STIMMUNG` (17, 64 B, nur bei geltender Stimmung); Glut nativ + Web: Bindung 17 (Haupt-Layout), HDR-Ziel Rgba16Float (wenn renderbar/filterbar/mischbar, sonst Rgba8Unorm) mit MSAA, falls möglich, Bloom-Kette (Jimenez 2014: Vorfilter mit weichem Knie + Karis-Mittel, 5 × 13-Tap verkleinern, 5 × Zelt additiv vergrößern), Abschluss (ACES nach Hill, Sättigung, Vignette, Korn, Dither) im Zielformat, 2D danach; 3D-Shader geben mit Stimmung linear aus (`hdr_an()`), Höhennebel geschlossen integriert; ohne Abschnitt v1-Pfad (Referenzbilder unverändert); Szene `stimmung.herd`, Referenzbild `3d-stimmung`, Beispiel `neonschild`, Doku in `herd-ausbau` | (dieser) | `cargo test -j 2` (Kern 111/111 inkl. 2 neue `tests::stimmung`); `node herd/test-kern.js` bitgleich nativ = Wasm (neu `stimmung.herd` klein + N = 2000); WARP Referenzbild 17 Draw-Calls (3D 4, Bloom 11, Abschluss 1, 2D 1) |
| **Material** (Relief, Kachelung, PBR, Nässe; Nutzerwunsch neben H-K) | Nachtragsfelder am `Belag`: `relief`, `kachel`, `abbildung` (uv/welt), `modell` (klassisch/pbr), `metall`, `nass`; `Koerper3.zusatz` und Bildpaket-Abschnitt `ZUSATZ3D` (18, 16 B je Instanz in INST3D-Reihenfolge: Relief-Kennwort, kachel, metall, Merkmale) nur wenn eine Instanz einen hat; Glut nativ + Web: dritter Instanzpuffer (Slot 2, Nullen ohne Abschnitt), Kachelung über den Sampler der eigenen Texturen (Bindung 12, jetzt wiederholend, Stufen linear, anisotrop 8 falls möglich – die expliziten Abtastungen klemmen selbst, Bilder unverändert; ein eigener Sampler hätte unter WebGL2 die 16 Textureinheiten überschritten), `textureSampleGrad` mit vorab berechneten Ableitungen, `fs_licht`: Welt-/uv-Kachelung, Relief-Normale (Welt-Tangenten bzw. Kotangenten aus Ableitungen), Modell pbr (`pbr_licht`: GGX + Smith + Schlick, Metall, Umgebungsglanz, Pfützen aus Wertrauschen); Muster-Teiglinge 6 (Relief „Noppen“) und 7 (Steinplatten) in beiden Spielern; Szene `material.herd`, Referenzbild `3d-material`, Doku in `herd-ausbau`; Werkzeug `scripts/texturen-neon.js` (Fototexturen → Farbe + Relief, eigener JPEG/PNG-Schreiber) | (dieser) | `cargo test -j 2` (Kern 112/112 inkl. `tests::material`); `node herd/test-kern.js` bitgleich (neu `material.herd` klein + N = 1000); WARP Referenzbild 7 Draw-Calls |
| **H-K12** UI + Maus im Kern | `Taster` (27; Name statt `Knopf`, das ist die Theke), `Leiste` (28), `Regler` (29), `Tafel` (30, ziehbar, Kinder = Inhalt), alle 2D, Bildbeiträge nur aus `RECHTECK`/`KREIS`/`GLYPHE`; Kern-Export `eingabe(maus_x, maus_y, knoepfe)` (Kern, `kern.wasm`, Skript-Spieler, Interpreter, Laufzeit, Host, HOST-ABI v2 additiv), `Welt::eingabe` nicht im Szenen-Hash (Kante = Wechsel gegen den Stand am Ende des Vortakts), gemeinsamer UI-Durchgang `komponenten/ui.rs` im Nachlauf von `Taster` (oberstes Ziel nach Ebene, dann ID; HUD ab `festAb` in Spielfeld-, sonst Weltkoordinaten; Fangen/Freigeben), `Blick.mausX`/`mausY` als Nachtrags-Lesefelder, beim Lesen berechnet (neuer `Art`-Haken `lies`); Fenster (winit, Render-Worker) unverändert – sie liefern Maus/Knöpfe schon gleich; Szene `ui.herd`, Fälle `herd-taster`/`herd-regler`, Korpus `herd-ui-maus`, Beispiel `konfigurator.pizza`, E2E-Fall in `14-herd-playground`, Doku in `herd-ausbau`, K-151 | (dieser) | `cargo test -j 2` in `herd/` (Kern 106/106 inkl. 9 neue `tests::hk12` und Schlüsselwort-Test aus H-K11b, Skript 4 + 1, Teigling 13, Glut 1, Werkzeug 7); `node herd/test-kern.js` 40 Läufe bitgleich nativ = Wasm (neu `ui.herd` klein + N = 2 000); `erwartet.js` 73 ✓ (keine bestehende geändert); `npm test` (337 Fälle, 74 Beispiele, 155 Doku), Prüfstand 830/830 + 6/6, `test:wasm` 1597, `test:differenz` 1257 ohne Abweichung (neu Korpus `herd-ui-maus`); Host `cargo test` 61 + `host/test.js` 74/74 + 6/6; E2E headless 338/340 (1 übersprungen; 1 Doku-Panel-Test unter Last wackelig, allein grün), neu `Herd-UI: Taster und Regler mit der Maus im Vorschaufenster`; Sichtprüfung `konfigurator.pizza` offscreen (WARP) in Ordnung |
| **H-K13** Kniff | eingebaute, erbbare Basisklasse `Kniff` (Rohling, Laufzeitklasse 16, eigene Klassen im Wasm ab 17), `teil()` auch unqualifiziert, Rückrufe `start`/`takt`/`beimBetreten`/`beimVerlassen`/`beimKlick`/`beimEntfernen` (nur überschriebene), `teil.mit(k)`/`ohne(k)`/`kniffe()`, Kniff-Phase nach dem Nachlauf (Teile nach ID, Anhängereihenfolge, Schnappschuss, ruhende Teile ohne Rückrufe), `beimEntfernen` nach dem Lösen, `kopie()` ohne Kniffe; Interpreter `herd/kniff.js` + Hooks in `aufrufe.js`/`namen.js`/`pruefung.js`, Laufzeit `herd.rs` (Abschnitt Kniff, `Obj.kniff` im Füllplatz) + `klassen.rs`/`programm.rs`, Compiler `KLASSEN_BASIS` 17; Kern nur `abi.rs` (`kniffe` in `TEIL_METHODEN`, Lesefeld 19 ruht); Fälle `herd-kniff`/`herd-kniff-ereignisse`/`herd-kniff-ananas`, Korpus `herd-kniff-kueche`, Prüfstand a18 (+2), Beispiel `herd/kniffe` (Pizzaboten-Spiel), Editor-Wörter, Doku in `herd-ausbau`, K-152 | (dieser) | `cargo test -j 2` in `herd/` (Kern 107/107 inkl. `tests::hk13`, Skript 4 + 1, Teigling 13, Glut 1, Werkzeug 7 inkl. Pixeltest); `node herd/test-kern.js` alle Läufe bitgleich; `erwartet.js` ✓ (keine bestehende geändert); `npm test` (340 Fälle, 77 Beispiele, 160 Doku), Prüfstand 838/838 + 6/6, `test:wasm` 1615, `test:differenz` 1269 ohne Abweichung (inkl. Host, Köche, Chaos); Host `cargo test` 61 + `host/test.js` 75/75 + 6/6; UI-Tests; E2E headless 343/344 (1 übersprungen); Sichtprüfung `herd/kniffe` offscreen (WARP) in Ordnung |
| **H-K14** Klang | offen | – | – |

## 12. Stufenplan H-K (verbindlich)

Jede Stufe ist **eine Einheit**: eigener Worktree, lokale Commits, Abnahme grün (§12.3), Zeile in §11.1. Geteilte Roadmap-Stufen heißen
`a`/`b`; **H-K0** ist neu und bereitet alles vor, damit die übrigen Stufen (außer H-K12 … H-K14) reine Kern-Arbeit bleiben. Komponenten-
und Feldnamen stehen hier fest; Produktentscheidungen, die der Plan trifft, sind mit **Entscheidung** markiert.

### 12.1 Regeln für alle Stufen

1. **Registry nur hinten anhängen.** Neue Zeilen kommen in `ARTEN` (`herd/kern/src/komponenten/mod.rs`) nach der letzten
   Produktivzeile und **vor** die `cfg(test)`-Zeile `&probe::ART` (Probe bleibt letzte; sie fehlt in `schema.json`/`kern.wasm`, ihre
   Nummer im Testbau ist egal). Position = Typnummer = Systemreihenfolge, **für immer**. Die Nummer wird in **Merge-Reihenfolge**
   vergeben (nächste freie Registry-Position beim Rebase auf `master`, Entscheidung ab H-K4); die Tabelle in §12.2 ist nur ein
   Reihenfolge-Vorschlag, die tatsächlich vergebenen Nummern stehen in §11.1. Wer nach dem Rebase eine andere Nummer bekommt als zuvor,
   erzeugt die Hashes der **eigenen** neuen Fälle/Beispiele/Doku-Blöcke neu (Regel 6). Bestehende Arten werden nie umsortiert,
   umbenannt oder entfernt.
2. **Hashes bestehender Programme bleiben gleich.** Der Szenen-Hash (`abi.rs` `szenen_hash`) enthält je Komponente Handle, Typnummer und
   alle Spalten, aber **nicht** die Zahl der Arten – angehängte Arten ändern also nichts. Neue Felder an einer **bestehenden** Komponente
   nur als **Nachtragsfeld** (H-K0: gehasht nur, wenn vom Standard abweichend). Eine geänderte `.herd-erwartet` bzw. ein geänderter
   `herdErwartet`-Block eines bestehenden Beispiels, Falls oder Doku-Codeblocks ist eine **Regression**. Ausnahme wäre nur eine Stufe, die
   das Bildpaket-Format bewusst bricht (Regel 3) – **keine Stufe dieses Plans tut das**. Prüfung: `node tests/herd/erwartet.js` ohne
   `--schreibe` zeigt nur ✓; `git status -- tests/faelle site/beispiele site/js/doku tests/herd/bilder` zeigt nur neue eigene Dateien
   (plus den neuen Eintrag in `site/beispiele/herd.json` und die Doku-Zeilen).
3. **Bildpaket additiv.** Neue Werte für `abschnitt`, `flach_art`, `zug` oder neue Flag-Bits schreibt der Kern **nur**, wenn die neue
   Komponente benutzt wird; `VERSION` bleibt 1, Pakete ohne sie bleiben byte-gleich. Änderungen an `SZENE_BYTES` (592), `INST2D_BYTES`
   (56), `INST3D_BYTES` (72), `ECKE_BYTES` (32) oder an Feldreihenfolgen wären ein **Format-Bruch** (`VERSION` 2, alle Hashes per
   `node tests/herd/erwartet.js --schreibe` und alle Referenzbilder per `herd-bild referenz` neu, im Plan zu vermerken) – nicht
   vorgesehen. PROJEKTE.md PD1 (`TEXTUR`-Abschnitt, Kern-Export `bildchen_teigling`) und PD3 (Glut-Texturen) folgen derselben Regel und
   zählen in ihrer Welle als Bildpaket-/Glut-Stufe. **Für PROJEKTE reserviert** (K-145, K-147; nicht anderweitig vergeben): Kern-Export
   `bildchen_teigling(ptr, len) → id` (Kern-ABI neben `bildchen_rgba`, nur Kopfprüfung, HOST-ABI §2), Kern-Fehlercodes **61** (kein
   lesbares Bild) und **62** (zu groß), Bildpaket-Abschnitt **`TEXTUR = 5`** (`u32 id, u8 format, u8 stufen, u16 b, u16 h`, je Stufe
   `u32 länge` + Bytes; einmal je Bild), `flach_art` **`TEXTURBILD = 6`** (`seite` = Textur-ID, `u0 v0 u1 v1` = `0 0 b h`) und
   `INST3D.textur` **Bit 17** = eigene Textur (Bits 0–15 = Textur-ID). Stufen dieses Plans nehmen danach die nächsten freien Nummern.
4. **Browser = nativ.** Jede Glut-Änderung in `herd/glut` (Shader `herd/glut/shader/*.wgsl` gelten für beide) **und** `herd/glut-web`
   (`node herd/baue-web.js` → `site/js/herd/glut.js`, `glut_bg.wasm`); WebGPU **und** WebGL2-Rückfall (`textureLoad`, Ableitungen nur in
   gleichförmigem Kontrollfluss, keine Cube-Maps/Storage-Puffer, die WebGL2 nicht kann). Jede Glut-Stufe bringt ein Referenzbild mit
   (`tests/herd/bilder/<name>.herd` + `.png`); bestehende PNGs bleiben unverändert, E2E `13-herd-glut` prüft das neue Bild im Browser
   automatisch mit.
5. **Determinismus (K-129).** Kern-Zustand f64; Funktionen **nur aus `libm`** (`libm::sin`, `cos`, `atan2`, `pow`, `exp`, `sqrt`, `floor`)
   – keine std-Transzendenten, auch nicht über Hilfs-Crates; keine `HashMap`; Reihenfolgen nur nach Teil-ID, Typnummer, Komponenten-Handle
   oder stabil sortiert (Schlüssel `ordnungs_bits` + ID); Zufall nur über den Kern-Zufall aus `partikel.rs` (Saat, 0 = Teil-ID); keine
   FMA; f32 erst im Bildpaket (`f32w`). Bitgleich **nativ = `kern.wasm` = Interpreter = Wasm-Programm = Host**: Jede neue Komponente
   bekommt ein Szenen-Skript `tests/herd/szenen/<name>.herd` (oder Zeilen in `hierarchie.herd`), damit `node herd/test-kern.js` ihr
   System nativ gegen Wasm vergleicht; der Fall `tests/faelle/herd-<name>.*` läuft in Interpreter, Wasm und Differenztests.
6. **Erzeugtes nie von Hand mergen.** `site/js/herd/kern.wasm` + `site/js/herd/schema.json` nach dem Rebase mit `node herd/baue.js` neu
   erzeugen; `glut.js` + `glut_bg.wasm` mit `node herd/baue-web.js`; `site/js/pizzaiolo/laufzeit.wasm` + `laufzeit-daten.js` mit
   `npm run baue:laufzeit`; `.herd-erwartet` **eigener neuer** Fälle/Beispiele mit `node tests/herd/erwartet.js <filter> --schreibe` bzw.
   `node tests/herd/bild.js <prog> --schreibe`. Bei Konflikt: eigene Fassung verwerfen, neu erzeugen.
7. **Anhängestellen** (berührt jede Stufe; Konflikte sind nur Nachbarzeilen – beide behalten, nach Typnummer ordnen): `pub mod` + `ARTEN`
   in `mod.rs`, Registry-Ausschnitt `herd/README.md` §2, SPEC §18.6 (je Komponente eine Zeile; Überschrift wird mit der ersten Stufe zu
   „Komponenten (v1 und Ausbau)“), der Satz „Komponenten v1“ in §4 (wird „Komponenten“), Doku `site/js/doku/40-herd.js` (Zeile in der
   Tabelle „Alle Komponenten …“ von `ordnung: 595`, ein `details`-Block je Stufe im neuen Abschnitt `herd-ausbau`, `ordnung: 599`, Titel
   „Ausbau: neue Komponenten“, angelegt von der ersten gemergten Stufe), `site/beispiele/herd.json`, §11.1. Seit PROJEKTE.md PB3 sind
   Beispiele Ordner nach K-144 (Regel 10).
8. **§9-Ausnahmen** (Interpreter `site/js/pizza/`, `laufzeit/`, `site/js/pizzaiolo/`, `HOST-ABI.md`, `host/`) haben nur **H-K0, H-K12,
   H-K13, H-K14** – höchstens eine davon je Welle. Je Welle höchstens **eine** Stufe, die `herd/kern/src/paket.rs` oder die Glut ändert.
9. **Art-Literale:** Ab H-K0 schreiben neue Komponenten `pub static ART: Art = Art { schema: …, takt: …, ..Art::LEER };` – dann ändern
   spätere Felder von `Art` keine Komponenten-Datei mehr. Parallel zu H-K0 entstandene Stufen passen ihr Literal beim Rebase an.
10. **Sichtbar heißt Beispiel:** Jede Stufe mit sichtbarer Wirkung bringt ein kleines Beispiel als Projektordner (PROJEKTE.md §7, K-144)
    `site/beispiele/herd/<name>/` mit `pizza.json` (`name` = Titel), `hauptgang.pizza` und `pruefung/{ereignisse, erwartet,
    herd-erwartet}` sowie einem Eintrag mit `ordner` in `site/beispiele/herd.json` (`dateien` schreibt `node scripts/beispiele.js
    --schreibe`, `--pruefe` läuft in `npm test`); ein noch im alten Format angelegtes Beispiel zieht `node scripts/beispiele.js
    --umziehen` um. Sichtprüfung offscreen mit `node tests/herd/bild.js site/beispiele/herd/<name> --png <scratch-ordner>`
    (Software-Adapter, kein Fenster).
11. **Doku je Stufe:** SPEC §18.6-Zeile(n) (bei neuer Sprache auch §18.2–§18.5), Absatz + Tabellenzeile in `40-herd.js`, `herd/README.md`
    (§2; §3 bei ABI, §4 bei Bildpaket, §9 bei Glut), Zeile in §11.1, Hinweis in `CHANGELOG.md` beim Bündel-Push.
12. **Keine sichtbaren Fenster**, Cargo immer mit `-j 2`; E2E nur headless (nie `E2E_SICHTBAR`), Glut nur auf dem Software-Adapter.

### 12.2 Wellen und Typnummern

Höchstens drei Stufen je Welle, parallel in eigenen Worktrees, gemergt in der angegebenen Reihenfolge. Die Spalten zeigen, welche
**Nicht-Komponenten-Dateien** eine Stufe berührt (Anhängestellen nach Regel 7 nicht gezählt).

| Welle | Stufen (Merge-Reihenfolge) | `paket.rs` / Glut | Interpreter / Laufzeit / Compiler / Host | weitere Kern-Dateien |
|---|---|---|---|---|
| **W1** | H-K0 · H-K3a · H-K5 | H-K5 | H-K0 | H-K0: `schema.rs`, `abi.rs`, `welt.rs`, `fehler.rs`, `mod.rs` (Art), `kern-wasm`, `herd/skript*` |
| **W2** | H-K1 · H-K2 · H-K4 | H-K1 (nur `Bildbau`, kein Format) | – | – |
| **W3** | H-K6 · H-K3b · H-K8 | H-K3b | – | H-K8: `welt.rs`, `mod.rs` (`sichtbar`) |
| **W4** | H-K7 · H-K9 · H-K11a | – | – | H-K9: `welt.rs`; H-K11a: `ressourcen.rs`, `formen.rs` |
| **W5** | H-K10 · H-K11b · H-K12 | H-K11b | H-K12 | H-K12: `abi.rs`, `welt.rs`, `kern-wasm`, `herd/skript*` |
| **W6** | H-K13 | – | H-K13 | – |
| **W7** | H-K14 | – | H-K14 | neue Crate `herd/klang` |

Abhängigkeiten über Wellen: H-K1/H-K2/H-K4 ← H-K0 · H-K6 ← H-K0 · H-K3b ← H-K0 · H-K8 nach H-K6 (prüft auch Fühler) · H-K7 ← H-K6 ·
H-K9 ← H-K8 · H-K11a ← H-K0 · H-K10 ← H-K1, H-K7 · H-K12 ← H-K0, H-K1 · H-K13 ← H-K6, H-K12 · H-K14 ← (H-K12 fürs Beispiel).
Innerhalb einer Welle hängt keine Stufe von einer anderen ab.

**Typnummern** (v1: 1 `Rechteck` · 2 `Kreis` · 3 `Text` · 4 `Bild` · 5 `Koerper` · 6 `Licht` · 7 `Kamera` · 8 `Bewegung` ·
9 `Animation` · 10 `Partikel`). Die Spalte „Nr“ ist ab Nr. 14 nur ein **Vorschlag** in Planreihenfolge: vergeben wird in
Merge-Reihenfolge (§12.1 Regel 1), maßgeblich ist §11.1. Bisher vergeben: 11 `Linie`, 12 `Rahmen`, 13 `Funken`, **14 `Gleiten`,
15 `Ablauf`** (H-K4 vor H-K1/H-K2 gemergt), **16 `Belag`** (H-K2), **17 `Fuehler`** (H-K6), **18 `Blick`, 19 `Leine`** (H-K1), **20 `Wucht`** (H-K7), **21 `Vieleck`** (H-K3b), **22 `Gelaende`** (H-K11a), **23 `Vorlage`** (H-K8), **24 `Fliesen`** (H-K10), **25 `Kulisse`** (H-K9), **26 `Himmelszelt`** (H-K11b), **27 `Taster`, 28 `Leiste`, 29 `Regler`, 30 `Tafel`** (H-K12).

| Nr (Vorschlag; vergeben: §11.1) | Komponente | Stufe | Raum | läuft in |
|---|---|---|---|---|
| 11 | `Linie` | H-K3a | 2D | – (Bildbeitrag) |
| 12 | `Rahmen` | H-K3a | 2D | – |
| 13 | `Funken` | H-K5 | 3D | Takt |
| 14 | `Blick` | H-K1 | 2D | – (Bildbau) |
| 15 | `Leine` | H-K1 | beide | Nachlauf |
| 16 | `Belag` | H-K2 | 3D | – |
| 17 → vergeben **14** | `Gleiten` | H-K4 | beide | Takt |
| 18 → vergeben **15** | `Ablauf` | H-K4 | beide | Takt |
| 19 | `Fuehler` | H-K6 | beide | Nachlauf |
| 20 | `Vieleck` | H-K3b | 2D | – |
| 21 | `Vorlage` | H-K8 | beide | – |
| 22 | `Wucht` | H-K7 | 2D | Takt |
| 23 | `Kulisse` | H-K9 | beide | – |
| 24 | `Gelaende` | H-K11a | 3D | Takt (Netz bei Änderung) |
| 25 | `Fliesen` | H-K10 | 2D | – |
| 26 | `Himmelszelt` | H-K11b | 3D | – |
| 27 | `Knopf` | H-K12 | 2D | Nachlauf |
| 28 | `Leiste` | H-K12 | 2D | – |
| 29 | `Regler` | H-K12 | 2D | Nachlauf |
| 30 | `Tafel` | H-K12 | 2D | Nachlauf |

**Ablauf eines Takts ab H-K0:** `fn()` → Takt-Systeme in Typnummer-Reihenfolge (z. B. Bewegung 8 vor Gleiten 14 vor einer später gemergten Wucht) →
**Nachlauf**-Systeme in Typnummer-Reihenfolge (in Merge-Reihenfolge, z. B. Leine vor Fühler vor Knopf, wenn so gemergt) → ab H-K13 Kniffe → Bild. Fühler sehen also die
Lage nach Physik und Folgekamera desselben Takts; das Programm liest sie im nächsten Takt (wie Eingabe, §5).

### 12.3 Abnahme-Befehle

**A-Kern** (jede Stufe; im Repo-Wurzelordner, Cargo im Ordner `herd/`):
1. `cargo test -j 2` (in `herd/`: Kern, Skript, Glut-Pixeltest, Werkzeug)
2. `node herd/baue.js`, danach `node herd/baue.js --pruefe` (schema.json passt zu kern.wasm)
3. `node herd/test-kern.js` (blockierend: nativ = Wasm, alle Szenen inkl. der neuen)
4. `node tests/herd/erwartet.js` (Prüfmodus, ohne `--schreibe`: nur ✓)
5. `npm test` · `node pruefstand/run.js` · `npm run test:wasm` · `npm run test:differenz`
6. `git status` gegen Regel 2 (keine geänderte `.herd-erwartet`/`herdErwartet`/PNG bestehender Fälle)

**A-Glut** = A-Kern + `node herd/baue-web.js` (wasm-bindgen 0.2.129) + neues Referenzbild: nur das neue Skript rendern
(`cargo run -j 2 -p herd-werkzeug --bin herd-bild -- bild tests/herd/bilder/<name>.herd <scratch-ordner>`, PNG als
`tests/herd/bilder/<name>.png` übernehmen) – `referenz` schreibt **alle** PNGs neu, und WARP/lavapipe sind nicht über Rechner bitgleich;
wer es doch nutzt, setzt die übrigen mit `git checkout -- tests/herd/bilder` zurück. Maßgeblich ist der Pixeltest in `cargo test -j 2`
(Toleranz K-129) + `npm run test:e2e` (headless; mindestens `13-herd-glut` und `14-herd-playground` grün).

**A-Lauf** = A-Kern + `npm run baue:laufzeit` + `cargo test -j 2` in `host/` + `node host/test.js` (setzt `PIZZA_KEIN_DIALOG=1`) +
`npm --prefix ui test` (wenn `ui/` berührt) + `npm run test:e2e` (headless).

Sichtbare Stufen zusätzlich: `node tests/herd/bild.js site/beispiele/herd/<name> --png <scratch-ordner>` (Sichtprüfung) und
`node tests/herd/bild.js site/beispiele/herd/<name> --schreibe` (schreibt `pruefung/herd-erwartet` und `pruefung/erwartet`) für das
eigene neue Beispiel.

### 12.4 Die Stufen

#### H-K0 Grundlagen: Listenfelder, Lesefelder, Nachtragsfelder, Nachlauf (W1, §9-Ausnahme)
- **Ziel:** einmaliger Umbau der generischen Schicht, damit Kollider-Ereignisse, Keyframes, Vielecke, Kachelkarten und UI ohne weitere
  Sprachänderung auskommen. Unity: serialisierte Listen (`List<GameObject>`, `float[]`), schreibgeschützte Eigenschaften, `LateUpdate`.
- **Sprachfläche:** Feldtypen **`teil-liste`** (`Blech<Teil>`, Feldtyp-Nummer 11) und **`zahl-liste`** (`Blech<funghi>`, 12), hinten an
  `FELDTYPEN`; Texte `ein Blech aus Teilen` / `ein Blech aus Zahlen`; höchstens 65 536 Einträge. **Lesefelder** (Schema `lesen: true`):
  Getter wie immer, Setter, `setze(…)` und Konstruktor-Argument → `LaufzeitAnanas: <Name>.<feld> kann man nur lesen.` (Text im Kern).
  **Nachtragsfelder** (Schema `nachtrag: true`): für die Sprache normale Felder; der Szenen-Hash überspringt sie, solange ihr Wert
  bitgleich dem Standard ist. **Nachlauf:** `Art.nachlauf: Option<TaktFn>`, läuft nach allen Takt-Systemen. Entfernte Teile fallen beim
  Lesen einer `teil-liste` heraus (**Entscheidung**). Kein neuer Komponentenname.
- **Schichten/Dateien:** Kern `schema.rs` (Typen, Flags), `abi.rs` (neue Exporte `setze_zahlen(komp, feld, ptr, n)`,
  `hole_zahlen(komp, feld, ptr, kap)` mit Retry wie `hole_liste`; `teil-liste` über `setze_liste`/`hole_liste` mit Teil-Prüfung;
  Hash-Regel; `schema_json` mit `lesen`/`nachtrag`), `welt.rs` (Nachlauf), `komponenten/mod.rs` (`Art`-Feld, `Art::LEER`, alle v1-Literale
  auf `..Art::LEER`), `fehler.rs`, `kern-wasm/`, `komponenten/probe.rs` (ein Feld je neuem Typ, ein Lese-, ein Nachtragsfeld, ein
  Nachlauf); `herd/skript/src/lib.rs` + `herd/skript.js` (neue Aufrufe); **§9-Ausnahme:** `site/js/pizza/herd/kern.js` (Feldtyp-Tabelle bei
  `HF_LISTE`, Blech ↔ Liste), `laufzeit/src/herd.rs` (Typabbildung, Kopierweg f64-Liste), `site/js/pizzaiolo/` (nur falls die
  Klassenauflösung Feldtypen kennt), `host/src/herd.rs` (zwei Hostfunktionen), `HOST-ABI.md` (Tabelle Modul `herd`), Editor-Vervoll-
  ständigung in `ui/src/` (keine Setter für Lesefelder). Kein `paket.rs`, keine Glut.
- **Determinismus:** Listen in Einfügereihenfolge; NaN in `zahl-liste` kanonisch gehasht; Nachtrag-Vergleich auf Bits.
- **Tests:** `cargo test` (Nachtragsfeld mit Standard → Hash wie ohne Feld; mit anderem Wert → anderer Hash; Lesefeld-Fehler; Nachlauf nach
  allen Takten; Listen-Grenzen), `erweiterungsprobe` erweitert, Szenen-Skript mit Probe (Testbau). Die **Sprachtests** der neuen Typen
  sind Pflicht der ersten Nutzer: `herd-zahl-liste.*` in H-K4, `herd-teil-liste.*` + Lesefeld-Fehler in H-K6 (Probe ist nicht in
  `kern.wasm`). Alle bestehenden Hashes unverändert.
- **Doku:** SPEC §18.4 (Feldtypen, Lesefelder), `herd/README.md` §2/§3/§5, HERD.md §3.3 Typenliste; kein Beispiel (unsichtbar).
- **Abnahme:** A-Lauf. **Abhängig von:** –. **K-Vorschlag:** K-149.

#### H-K3a `Linie` und `Rahmen` (W1, Kern-only)
- **Ziel:** Unity LineRenderer (2D-Strecke) und Sprite-9-Slice (skalierbare Tafeln, Sprechblasen, Knöpfe).
- **Sprachfläche:** `Linie` (2D): `zuX` 100, `zuY` 0 (Endpunkt relativ zum Teil), `dicke` 2 (> 0), `farbe` ofen, `rund` nein (runde
  Enden). `Rahmen` (2D): `bildchen` karton, `kante` 4 (Bildchen-Pixel der Ecken; `rand` ist reserviert), `breite` 64, `hoehe` 32 (Größe im
  Spielfeld, Mitte = Lage), `groesse` 1 (Bildschirmpixel je Bildchen-Pixel der Kanten), `farbe` weiss (Tönung). Hülle für `trifft`: Rechteck.
- **Schichten/Dateien:** neu `komponenten/linie.rs`, `rahmen.rs`. Bildbeiträge nur mit vorhandenen Arten: Linie = ein `RECHTECK` längs der
  Strecke (Rundung = `dicke/2` bei `rund`), Rahmen = 9 `BILD`-Instanzen mit Atlas-Teilrechtecken (Ecken fest, Kanten und Mitte gestreckt).
  Kein `paket.rs`, keine Glut.
- **Determinismus:** Länge `libm::sqrt`, Winkel `libm::atan2`, Matrix wie `lokal_2d`.
- **Tests:** `cargo test`, `herd-linie.*`, `herd-rahmen.*`, Szenen-Skript `linien.herd`. **Beispiel:** `uhr.pizza` (Zeiger als Linien auf
  einer Rahmen-Tafel, alle drei Zeiger je Takt nach `Uhr.echt() + Uhr.zone()` gestellt, K-154).
- **Abnahme:** A-Kern. **Abhängig von:** – (Literal nach Rebase auf H-K0 auf `..Art::LEER`).

#### H-K5 `Funken` – 3D-Partikel (W1, Kern + Glut)
- **Ziel:** Unity Particle System in 3D (kamerazugewandte Teilchen).
- **Sprachfläche:** `Funken` (3D): `rate` 30, `lebensdauer` 1, `tempo` 2 (Einheiten/s), `richtungX` 0, `richtungY` 1, `richtungZ` 0,
  `streuung` 30 (Kegel in Grad, 0 … 180), `schwerkraft` 0 (nach −y), `groesse` 0.2, `groesseEnde` 0, `farbe` senf, `farbeEnde` tomate,
  `mischung` leuchtend (`leuchtend|deckend`), `weltlage` ja (Teilchen bleiben, wo sie entstanden; nein = wandern mit dem Teil), `aktiv` ja,
  `saat` 0 (0 = Teil-ID). Höchstens 10 000 Teilchen je Emitter.
- **Schichten/Dateien:** neu `komponenten/funken.rs` (System wie `partikel.rs`); `paket.rs`: neuer Abschnitt `TEILCHEN3D = 14` (je Teilchen
  Lage, Größe, Farbe, Mischung; deckende vom Kern nach Abstand sortiert, Schlüssel `ordnungs_bits` + Index), nur wenn Funken sichtbar;
  Glut `herd/glut/src/*` + neuer Shader `glut/shader/funken.wgsl` (Durchgang nach `DURCH`: Tiefentest an, Tiefe schreiben aus, Nebel ja,
  keine Schatten; je Mischart ein instanzierter Draw-Call), `herd/glut-web` neu bauen; `herd/README.md` §4/§9.
- **Determinismus:** Zufall wie `partikel.rs` (eigene Saat-Mischung), Kegelrichtung mit `libm::sin/cos/sqrt`.
- **Tests:** `cargo test`, `herd-funken.*`, Szenen-Skript `b5-funken.herd` (10 Emitter, 20 000 Teilchen; Ziel Funken-System ≤ 1,5 ms EXE,
  Messung in `bench/herd/ERGEBNISSE.md`), Referenzbild `3d-funken.herd`. **Beispiel:** `ofenfunken.pizza` (Pizzaofen mit Glutfunken).
- **Abnahme:** A-Glut. **Abhängig von:** –.

#### H-K1 `Blick` und `Leine` – 2D-Kamera und Folgekamera (W2, Kern-only)
- **Ziel:** Unity orthografische 2D-Kamera (Scrollen, Zoom) und Cinemachine-Follow (2D und 3D).
- **Sprachfläche:** `Blick` (2D): Lage des Teils = Mitte der Sicht, `drehung` dreht die Sicht; `zoom` 1 (0.05 … 20), `aktiv` ja, `festAb`
  1000 (Teile mit `ebene ≥ festAb` bleiben als HUD fest im Spielfeld), `grenzeLinks`, `grenzeOben`, `grenzeRechts`, `grenzeUnten` 0 (alle 0 =
  keine Grenze, sonst wird die Mitte so geklemmt, dass die Sicht in der Welt bleibt). Es gilt der aktive Blick mit der kleinsten ID. `Leine`
  (beide): `ziel` karton (Teil), `abstandX`/`abstandY`/`abstandZ` 0, `weich` 0 (0 = starr; sonst Anteil des Rests, der nach einer Sekunde
  übrig ist, 0 … 0.999), `totzone` 0, `schaue` nein (3D: richtet das Teil wie `schaueAuf` aufs Ziel). Läuft im Nachlauf.
  Beispiel: `herd.kamera().mit(neu Leine(ziel: auto, abstandY: 3, abstandZ: 8, weich: 0.05, schaue: ja));`
- **Schichten/Dateien:** neu `komponenten/blick.rs`, `leine.rs`; `paket.rs` nur im `Bildbau`: vor den Bildbeiträgen die Sicht-Matrix
  bestimmen, `flach` wendet sie auf `m` an, wenn ein Blick aktiv ist und `ebene < festAb`, Spielfeld-Culling danach; dazu
  `Bildbau::sicht_welt()` (sichtbares Weltrechteck, für H-K10). **Ohne Blick wird nichts multipliziert** – Bildpakete byte-gleich v1.
  Keine Glut. Maus bleibt in Spielfeld-Koordinaten (Welt-Maus = Lesefelder am Blick in H-K12).
- **Determinismus:** Sicht-Matrix f64 mit `libm::sin/cos` wie `lokal_2d`; Leine-Faktor `1 − libm::pow(weich, dt)`.
- **Tests:** `cargo test` (Identität ohne Blick: Paket-Hash gleich; Klemmung; HUD-Ebene), `herd-blick.*`, `herd-leine.*`, Szenen-Skript
  `blick.herd`. **Beispiel:** `weite-welt.pizza` (Bote läuft durch drei Bildschirmbreiten, Blick an der Leine, Punkte-HUD fest).
- **Abnahme:** A-Kern. **Abhängig von:** H-K0 (Nachlauf).

#### H-K2 `Belag` – geteiltes Material (W2, Kern-only)
- **Ziel:** Unity Material als geteiltes Objekt: ein Wert ändern, alle Körper ändern sich.
- **Sprachfläche:** `Belag` (3D) an einem eigenen Teil (`herd.raum()`): `farbe` weiss, `glanz` 0.3, `leuchten` 0, `bild` karton.
  `Koerper.belag` (Teil, **Nachtragsfeld**, Standard karton): Hat das Teil einen `Belag`, nimmt der Körper dessen Werte statt der eigenen;
  sonst die eigenen (kein Fehler, **Entscheidung**). `Belag b = herd.raum().mit(neu Belag(farbe: "tomate")); herd.koerper(f).koerper()
  .setzeBelag(b.teil());`
- **Schichten/Dateien:** neu `komponenten/belag.rs`; `koerper.rs` (Nachtragsfeld, Bildbeitrag liest den Belag über `komp_zeile`). Kein
  `paket.rs`, keine Glut; Batching unverändert (gleiche Werte → gleiche Gruppe).
- **Determinismus:** keine Rechnung. **Tests:** `cargo test` (Hash ohne Belag unverändert), `herd-belag.*`, Szenen-Skript
  `belag.herd`. **Beispiel:** `belaege.pizza` (60 Würfel, drei Beläge, Leertaste färbt alle Tomaten-Würfel um).
- **Abnahme:** A-Kern. **Abhängig von:** H-K0 (Nachtragsfeld).

#### H-K4 `Gleiten` und `Ablauf` – Tweens und Keyframes (W2, Kern-only)
- **Ziel:** Unity-Tweens (DOTween-artig) und Animation Clips mit Keyframes auf der Lage.
- **Sprachfläche:** `Gleiten` (beide): `was` x (`x|y|z|drehung|neigung|rollen|groesse`), `nach` 0, `dauer` 1 (> 0, s), `kurve` sanft
  (`linear|sanft|rein|raus|federnd|huepfend`), `schleife` einmal (`einmal|wiederholen|pendeln`), `laeuft` ja; Startwert = Wert im ersten
  laufenden Takt, am Ende von `einmal` exakt `nach` und `laeuft` → nein. Je Teil ein `Gleiten` (je Art höchstens eine); mehrere Größen
  zugleich → `Ablauf` oder Kind-Teile (**Entscheidung**). `Ablauf` (beide): `zeiten` [] (zahl-liste, aufsteigend, s), `xWerte`, `yWerte`,
  `zWerte`, `drehWerte`, `groesseWerte` (zahl-listen; leer = nicht animiert; kürzer als `zeiten` → letzter Wert gilt weiter),
  `kurve` linear (`linear|sanft`), `schleife` ja, `tempo` 1, `zeit` 0 (setzbar = springen), `laeuft` ja.
- **Schichten/Dateien:** neu `komponenten/gleiten.rs`, `ablauf.rs`. Nur Komponenten.
- **Determinismus:** Kurven als Polynome (sanft `3t² − 2t³`, rein/raus quadratisch, huepfend stückweise quadratisch), `federnd` mit
  `libm::sin` und `libm::pow`; Zeit als Summe von `DT` (kein Wanduhr-Delta).
- **Tests:** `cargo test` (Endwert exakt, Pendeln, Schleife), `herd-gleiten.*`, `herd-ablauf.*`, **`herd-zahl-liste.*`** (Sprachtest
  für H-K0: Getter/Setter, Fehlertext, Blech-Kopie), Szenen-Skript `gleiten.herd`. **Beispiel:** `speisekarte.pizza` (Menütafel gleitet
  federnd herein, Bote läuft einen Ablauf-Pfad).
- **Abnahme:** A-Kern. **Abhängig von:** H-K0 (`zahl-liste`).

#### H-K6 `Fuehler` – Kollider mit Ereignissen als Zustand (W3, Kern-only)
- **Ziel:** Unity Collider/Trigger mit `OnTriggerEnter/Exit` – hier **als abfragbarer Zustand je Takt** (wie Eingabe), keine Rückrufe
  (die kommen mit H-K13).
- **Sprachfläche:** `Fuehler` (beide): `form` auto (`auto|kreis|rechteck|kasten|kugel`; auto = Hülle wie `trifft`), `breite`, `hoehe`,
  `tiefe`, `radius` 0 (0 = aus der Hülle), `versatzX`/`versatzY`/`versatzZ` 0, `gruppe` 1 (1 … 32), `maske` 4294967295 (Bitmaske der
  Gruppen, die er spürt), `ausloeser` ja (nur melden; nein = fest, für `Wucht` H-K7). **Lesefelder:** `beruehrt` (teil-liste, alle
  überlappenden Fühler-Teile nach ID), `betreten` (seit dem letzten Takt neu), `verlassen` (seit dem letzten Takt beendet), `anzahl`
  (ganz). Ein Paar zählt, wenn beide einen Fühler haben, gleicher Raum, beide sichtbar, und die Masken beidseitig passen.
  `falls (muenze.fuehler().betreten().länge() > 0) { … }`.
- **Schichten/Dateien:** neu `komponenten/fuehler.rs` (Nachlauf; Breitphase Sweep-and-Prune nach Hüllen-min-x, Schlüssel `ordnungs_bits`
  + ID, als `pub fn` für H-K7 bereitgestellt; umgesetzt in bis zu 64 waagerechten Streifen; Vortakt = die gespeicherte `beruehrt`-Liste
  selbst, verborgenes `fuer` gegen Kopie/Umhängen – kein eigener Puffer, K-150). Nutzt `Welt::huelle`; kein `welt.rs`, kein `paket.rs`.
  Gedrehte 2D-Rechtecke als achsenparallele Weltlage-Hülle wie `trifft` (v1-Grenze, **Entscheidung**).
- **Determinismus:** Vergleiche in f64, Kreis-Abstand ohne Wurzel (Quadrate), Listen nach ID.
- **Tests:** `cargo test` (betreten/verlassen über drei Takte, Masken, Raum, unsichtbar), `herd-fuehler.*`, **`herd-teil-liste.*`**
  (Sprachtest H-K0 inkl. `kann man nur lesen`), Szenen-Skript `fuehler.herd` (1 000 Fühler; Nachlauf ≤ 0,5 ms nativ, Messung).
  **Beispiel:** `muenzen.pizza` (Bote sammelt Münzen über `betreten`).
- **Abnahme:** A-Kern. **Abhängig von:** H-K0 (`teil-liste`, Lesefelder, Nachlauf). **K-Vorschlag:** K-150.

#### H-K3b `Vieleck` (W3, Kern + Glut)
- **Ziel:** Unity SpriteShape bzw. gefüllte 2D-Polygone (Pizzastücke, Gelände-Silhouetten).
- **Sprachfläche:** `Vieleck` (2D): `punkte` [] (zahl-liste `[x1, y1, …]` lokal, 3 … 256 Punkte, einfach), `farbe` weiss, `umriss` 0.
  Weniger als 3 Punkte oder selbstschneidend → es wird nichts gezeichnet (kein Fehler, **Entscheidung**). Hülle: umschließendes Rechteck.
- **Schichten/Dateien:** neu `komponenten/vieleck.rs` (Ohrenschneiden ab Punkt 0, Dreiecke als Puffer gecacht, neu nur bei geänderten
  `punkte`); `paket.rs`: neue 2D-Art **`flach_art::DREIECK = 5`** im vorhandenen INST2D-Strom (56 B: `m`/`t` bilden das Einheitsdreieck auf
  die Ecken ab, `p[0]` = Maske der Außenkanten, `p[1]` = Umriss) – Sortierung nach `ebene` wie alle 2D-Instanzen, weiter **ein** 2D-Draw-
  Call; Glut `glut/shader/flach.wgsl` (Zweig Art 5: Abstand zu den Außenkanten, Kantenglättung über `fwidth` nur dort), Paketprüfung in
  `herd/glut/src`, `herd/glut-web` neu bauen; `herd/README.md` §4/§9.
- **Determinismus:** Triangulation nur mit Vorzeichen-Tests in f64, feste Startecke, keine Toleranz aus Gleitkomma-Zufällen.
- **Tests:** `cargo test` (konvex, konkav, Stern, entartet), `herd-vieleck.*`, Referenzbild `2d-vieleck.herd` (gedreht, Umriss, mit
  Rechtecken in verschiedenen Ebenen gemischt). **Beispiel:** `pizzastuecke.pizza` (eine Pizza aus acht Vieleck-Stücken, Klick nimmt eins).
- **Abnahme:** A-Glut. **Abhängig von:** H-K0 (`zahl-liste`).

#### H-K8 `Vorlage` – Prefabs (W3, Kern-only)
- **Ziel:** Unity Prefab: ein ruhendes Muster, aus dem `Instantiate` wache Kopien macht. **Größere Bilder/Texturen gehören nicht mehr zu
  H-K8** – abgelöst durch PROJEKTE.md (E13, K-145, K-147, Pakete PD1/PD3: `Bildchen.laden`, Teigling, Glut-Texturen; Vertrag SPEC
  §18.5, reservierte Nummern §12.1 Regel 3).
- **Sprachfläche:** `Vorlage` (beide): `name` "" (nur Anzeige). Ein Teil mit `Vorlage` **ruht** samt Kindern: keine Systeme (Bewegung,
  Animation, Partikel, Funken, Gleiten, Ablauf, Leine, Fühler …), nicht gezeichnet, `trifft` → nein. `kopie()` einer Vorlage liefert ein
  waches Teil **ohne** `Vorlage` (sonst wie v1); `ohne("Vorlage")` weckt das Original.
- **Schichten/Dateien:** neu `komponenten/vorlage.rs`; `welt.rs` (abgeleiteter, vererbter Zustand `welt_ruht` wie `welt_sichtbar`, in
  `aktualisiere`; `kopie` lässt `Vorlage` weg; nicht im Szenen-Hash, da abgeleitet), `komponenten/mod.rs` (`sichtbar()` prüft `ruht`,
  Helfer `wach(w, teil)`), Takt-/Nachlauf-Systeme aller bis dahin vorhandenen Komponenten (`bewegung`, `animation`, `partikel`, `funken`,
  `gleiten`, `ablauf`, `leine`, `fuehler`) überspringen ruhende Teile. Ab H-K8 müssen neue Systeme `wach` prüfen.
- **Determinismus:** unverändert; kopierte Emitter mit `saat` 0 nehmen die neue Teil-ID (v1-Verhalten).
- **Umgesetzt:** Ruhe wird **sofort** nachgeführt statt in `aktualisiere` (Systeme laufen mit veralteten Matrizen; `welt_sichtbar` nimmt
  sie trotzdem auf). `Art::ruhe` + `Art::kopie_ohne` sind generisch – H-K9 braucht nur `kulisse.rs` mit `ruhe` = `aktiv` nein (der
  `setze_zahl`-Haken ist schon da) und keine Änderung an `kamera.rs`/`blick.rs` mehr. Ruhende Fühler behalten ihre Listen, ruhende
  Teilchen frieren ein; Kopie eines Kindes einer Vorlage ruht mit (hängt an der Vorlage); verschachtelte Vorlagen bleiben in Kopien.
- **Tests:** `cargo test` (Vorlage ruht, Kinder ruhen mit, Kopie wach, Hash ohne Vorlage unverändert), `herd-vorlage.*`, Szene
  `vorlage.herd` (statt Zeilen in `hierarchie.herd`). **Beispiel:** `pizzaofen.pizza` (statt `gegnerwelle.pizza`: der Ofen wirft aus einer
  Vorlage mit Belag, Dampf, Fühler und Wucht Pizzen aus).
- **Abnahme:** A-Kern. **Abhängig von:** – (nach H-K6 mergen).

#### H-K7 `Wucht` – 2D-Physik (W4, Kern-only)
- **Ziel:** Unity Rigidbody2D + Collider2D: Schwerkraft, Impulse, Abprall, Reibung, Stapeln.
- **Sprachfläche:** `Wucht` (2D, braucht `Fuehler`): `art` dynamisch (`dynamisch|kinematisch|fest`), `masse` 1 (> 0), `tempoX`/`tempoY`
  0, `schwerkraft` 0 (Pixel/s² nach unten; Doku empfiehlt 1200, **Entscheidung**: Standard 0 wie `Partikel`), `daempfung` 0 (0 … 1),
  `abprall` 0 (0 … 1), `reibung` 0.2 (0 … 1), `stossX`/`stossY` 0 (Einmal-Impuls: im nächsten Takt Δtempo = stoss / masse, danach 0).
  **Lesefeld** `amBoden` (Kontakt mit Normale nach oben im letzten Takt). Kontakte nur zwischen Fühlern mit `ausloeser: nein`.
- **Schichten/Dateien:** neu `komponenten/wucht.rs`; `fuehler.rs` (gemeinsame Breitphase, Komponenten-Datei der Vorstufe). Formen: Kreis
  und achsenparalleles Rechteck, keine Drehdynamik in v1 (**Entscheidung**), kein Schlafen, kein Durchtunnel-Schutz (Doku-Tipp: Tempo je
  Takt kleiner als die halbe Ausdehnung). Mit `Bewegung` am selben Teil wirken beide (Bewegung zuerst) – Doku rät ab.
- **Determinismus:** semi-implizites Euler, **feste 4 Iterationen** (Positionskorrektur + Impuls), Kontakte nach (kleinere ID, größere ID)
  sortiert und sequenziell gelöst, nur `libm::sqrt`. **Umgesetzt** (K-150 Nachtrag): Kontakte an der Lage zu Beginn des Takts, Warmstart mit den
  Impulsen des Vortakts (verborgene Spalte `kontakte`), 4 Impuls-Iterationen, Weg = tempo · dt, 4 Iterationen Positionskorrektur (nur Lage,
  bremst das Tempo höchstens bis 0), beide abwechselnd vorwärts/rückwärts durch die sortierte Liste; ein Fühler mit `ausloeser: nein` ohne
  Wucht ist fest. Messung B7 statt „Takt ≤ 1 ms bei 500“ siehe `bench/herd/ERGEBNISSE.md`.
- **Tests:** `cargo test` (Fallhöhe nach n Takten, Stapel aus 10 Kisten ruht, Abprall), `herd-wucht.*`, Szenen-Skript `wucht.herd`
  (500 Kugeln in einer Schüssel; Takt ≤ 1 ms nativ, Messung). **Beispiel:** `teigkugeln.pizza` (Klick wirft Teigkugeln in eine Schüssel).
- **Abnahme:** A-Kern. **Abhängig von:** H-K6. **K-Vorschlag:** K-150.

#### H-K9 `Kulisse` – Szenenwechsel (W4, Kern-only)
- **Ziel:** Unity Scenes (wechseln, additiv laden, entladen) – als **Teilbäume, die man an- und ausschaltet** (**Entscheidung**: keine
  `herd.lade(…)`-Methode und keine Szenen-Dateien; beides bräuchte Herd-Methoden bzw. PROJEKTE-Kiste und ist „später“).
- **Sprachfläche:** `Kulisse` (beide): `aktiv` ja, `name` "". `aktiv: nein` → Teilbaum ruht (wie H-K8) und ist unsichtbar. Wechsel:
  `menue.kulisse().setzeAktiv(nein); level.kulisse().setzeAktiv(ja);`; Entladen: `level.entferne()`. Welt-Einstellungen bleiben global;
  Kameras/Blicke in ruhenden Kulissen zählen nicht (es zeichnet die aktive, wache mit kleinster ID).
- **Schichten/Dateien:** neu `komponenten/kulisse.rs`; `welt.rs` (Ruhe-Vererbung um `Kulisse` ergänzen), `kamera.rs`, `blick.rs`,
  `licht.rs` (nur wache zählen).
- **Determinismus:** unverändert. **Tests:** `cargo test`, `herd-kulisse.*`. **Beispiel:** `kulissen.pizza` (Titelbild → Leertaste →
  Spiel → Ende-Kulisse).
- **Umgesetzt:** `komponenten/kulisse.rs` mit `ruhe` = `aktiv` nein, Typnummer 25 (nach `Fliesen` 24); dank H-K8 (`welt_ruht` sofort nachgeführt, auch
  nach `setze_zahl`; `wach`/`sichtbar` in Kamera, Blick und Licht) war an `welt.rs`, `kamera.rs`, `blick.rs`, `licht.rs` nichts mehr zu
  ändern. Mehrere Kulissen dürfen zugleich aktiv sein (Beispiel: Anzeige über Spiel und Pause); `kopie` behält die Kulisse (anders als
  `Vorlage`). Ein ruhendes Spiel ist unsichtbar – ein „eingefrorenes, sichtbares“ Spiel unter einer Pause bräuchte eine eigene
  Zeitsteuerung (später). Szene `kulisse.herd` (N Läufer mit Partikeln, Fühlern, Wucht; 3D-Kulisse mit Kamera und Licht).
- **Abnahme:** A-Kern. **Abhängig von:** H-K8.

#### H-K11a `Gelaende` (W4, Kern-only)
- **Ziel:** Unity Terrain aus einer Höhenkarte.
- **Sprachfläche:** `Gelaende` (3D): `hoehen` [] (zahl-liste, `spalten · zeilen` Werte zeilenweise; fehlende = 0), `spalten` 32, `zeilen` 32
  (2 … 256), `weite` 1 (Punktabstand), `farbe` basilikum, `glanz` 0.1, `bild` karton (Textur über die ganze Fläche), `schatten` ja.
  Einfarbig plus Textur; Farbverlauf nach Höhe bräuchte Eckfarben = Format-Bruch → **später** (**Entscheidung**). Hülle: Kasten.
- **Schichten/Dateien:** neu `komponenten/gelaende.rs` (System baut bei geänderten Feldern ein Netz mit glatten Normalen und zeichnet es
  wie `Koerper`: FEST-Zug, Schatten); `ressourcen.rs`/`formen.rs` (öffentliches „Netz aus Punkten/Dreiecken“ für Komponenten, bisher nur
  per ABI `form_eigene`). Jeder Umbau legt eine neue Ressource an (Ressourcen werden in v1 nie freigegeben) – Doku: nicht je Takt umformen.
  Kein `paket.rs`, keine Glut.
- **Determinismus:** Normalen wie `formen.rs` (f32-Hilfen aus `mathe.rs`), `libm::sqrt`. **Umgesetzt:** Typnummer 22 (nach Vieleck 21); Netz-Bau in
  `gelaende::netz` → `formen::netz_glatt` (dieselbe Normalen-Summe wie `Form.eigene(glatt)`), Änderung = anderer Prüfwert (kein
  Dirty-Flag im generischen ABI), daher erscheint das Netz erst im ersten Takt; `ressourcen.rs` brauchte nichts; Beispiel `huegel.pizza`
  als Tomatenplantage mit Orbit-Kamera statt rollendem Würfel (Gleiten folgt dem Boden nicht). Messung B8.
- **Tests:** `cargo test`, `herd-gelaende.*`, Szenen-Skript `gelaende.herd`. **Beispiel:** `huegel.pizza` (Hügel aus `Mathe.sin`, K-137, ein
  Würfel rollt per Gleiten darüber).
- **Abnahme:** A-Kern. **Abhängig von:** H-K0 (`zahl-liste`).

#### H-K10 `Fliesen` – Kachelkarte (W5, Kern-only)
- **Ziel:** Unity Tilemap + TilemapCollider2D.
- **Sprachfläche:** `Fliesen` (2D): `bilder` [] (bildchen-liste; Kachel n = `bilder[n]`), `spalten` 16, `zeilen` 9 (1 … 1024), `karte` []
  (zahl-liste zeilenweise von oben; 0 = leer; zu kurz → Rest leer), `kachel` 32 (Spielfeldpixel je Kachel), `fest` [] (zahl-liste der
  Kachelnummern, die für `Wucht` fest sind). Lage = **obere linke Ecke** des Rasters (**Entscheidung**, anders als `Rechteck`).
- **Schichten/Dateien:** neu `komponenten/fliesen.rs` (Bildbeitrag: `BILD`-Instanzen **nur** für Kacheln in `Bildbau::sicht_welt()` aus
  H-K1 – nie die ganze Karte); `wucht.rs` (feste Kacheln als ruhende Rechtecke im Umkreis jedes Körpers). Kein `paket.rs`.
- **Determinismus:** Kachelindex mit `libm::floor`, Ganzzahlarithmetik.
- **Tests:** `cargo test`, `herd-fliesen.*`, Szenen-Skript `fliesen.herd` (256 × 256 Kacheln, wandernder Blick: Instanzen ≤ sichtbare;
  Bild ≤ 0,3 ms nativ, Messung). **Beispiel:** `huepfwelt.pizza` (Jump-'n'-Run-Level aus Kacheln, Bote mit Wucht, Blick an der Leine).
- **Umgesetzt** (Typnummer 24 nach `Vorlage` 23, K-150 Nachtrag): Kachel n = `bilder[n]` **ab 1** (wie Blech/`Animation.nummer`), Einträge abgerundet,
  ohne Bildchen unsichtbar; `kachel` ≥ 0 (0 = nichts). Das Fenster ([`fliesen::fenster`]) rechnet `sicht_welt()` (HUD-Ebene: Spielfeld)
  über die Inverse der Raster-Matrix ins Raster, auch gedreht/skaliert. `MAX_LISTE` (65 536, K-149) bleibt – `karte` deckt also höchstens
  256 × 256 voll ab, größere Welten aus mehreren Rastern (**Entscheidung**; Szene voll: 4 × 4 Raster à 256² = 1024 × 1024 Kacheln).
  Physik: feste Kacheln als Gruppe 1 nur für dynamische Körper, nur offene Seiten auf der Seite der Körpermitte schieben (keine
  Geisterkanten an Fugen). Szenen-Skripte können große Listen erzeugen: `[folge ANZAHL i AUSDRUCK]` (`herd/skript*`, README §7.1).
  Messung B9 in `bench/herd/ERGEBNISSE.md`.
- **Abnahme:** A-Kern. **Abhängig von:** H-K0, H-K1, H-K7.

#### H-K11b `Himmelszelt` – Skybox (W5, Kern + Glut)
- **Ziel:** Unity Skybox (sechsseitig und prozedural).
- **Sprachfläche:** `Himmelszelt` (3D, beliebiges Teil; es gilt das wache mit kleinster ID): `bilder` [] (bildchen-liste: rechts, links,
  oben, unten, vorn, hinten; leer = prozedural), `oben` himmel, `horizont` mozzarella, `unten` teig, `sonnenscheibe` 0 (Grad, 0 = aus;
  Richtung = Sonne), `sterne` 0 (0 … 1). Solange vorhanden, ersetzt es `herd.himmel(…)`.
- **Schichten/Dateien:** neu `komponenten/himmelszelt.rs`; `paket.rs`: neuer Abschnitt `HIMMELSZELT = 15` (Farben, Sonnenscheibe, Sterne,
  sechs Atlas-Rechtecke) nur bei Nutzung; Glut `glut/shader/himmel.wgsl` (Würfelseiten aus dem Atlas per `textureLoad`, keine Cube-Map →
  WebGL2-tauglich; Sterne per Hash-Rauschen je Richtung), `herd/glut/src`, `herd/glut-web` neu bauen; README §4/§9.
- **Umgesetzt:** Typnummer 26 (nach Fliesen 24 und Kulisse 25). **Entscheidung:** das Feld `unten` heißt **`boden`** – `unten` ist in pizza ein
  Schlüsselwort (Aufruf der Basisklasse) und taugt nicht als benanntes Argument (Kern-Test prüft das jetzt für alle Feldnamen).
  Seiten als aufgeklapptes Kreuz um `vorn` = −z (Blickrichtung der Standardkamera); fehlende Seiten (kürzeres Blech) bleiben
  prozedural, Sonne und Sterne nur dort; Bild-Seiten aus dem Atlas **und** aus eigenen Texturen (`Bildchen.laden`/Teiglinge, PD3-Arrays,
  Bit 17 wie INST3D), weich gefiltert (bilinear statt PD3-pixelscharf, verkleinert trilinear), Deckkraft mischt über den prozeduralen
  Himmel; der Horizont schneidet die Sonnenscheibe ab; ohne `herd.umgebung` färbt `oben` das Umgebungslicht (sonst SZENE
  unverändert). Abschnitt 15 = fester 208-Byte-Uniform-Block (Glut-Bindung 13), Flag 4 mit gesetzt. Beispiel `sternennacht.pizza`:
  Abend über dem Hügelland (Gelände wie `huegel.pizza`), Sonnenuntergang, Sterne gehen auf, Zeitraffer auf Leertaste.
- **Determinismus:** Kern schreibt nur Werte; Pixel „visuell gleich“ (K-129). **Tests:** `cargo test` (Paket ohne Himmelszelt byte-gleich),
  `herd-himmelszelt.*`, Referenzbild `3d-himmelszelt.herd` (prozedural mit Sonne + Bildchen-Seiten). **Beispiel:** `sternennacht.pizza`.
- **Abnahme:** A-Glut. **Abhängig von:** –.

#### H-K12 `Knopf`, `Leiste`, `Regler`, `Tafel` + Maus im Kern (W5, §9-Ausnahme: neue Eingabeart)
- **Ziel:** Unity uGUI (Button, Image-Fill, Slider, Panel) mit EventSystem.
- **Sprachfläche:** `Knopf` (2D): `inhalt` "", `breite` 120, `hoehe` 36, `farbe` kruste, `farbeDrueber` senf, `farbeGedrueckt` tomate,
  `textFarbe` weiss, `groesse` 18, `rundung` 8, `aktiv` ja; Lesefelder `drueber`, `gedrueckt` (gehalten), `geklickt` (über dem Knopf
  losgelassen, nur in diesem Takt). `Leiste` (2D): `wert` 0.5 (0 … 1), `breite` 160, `hoehe` 14, `farbe` basilikum, `farbeLeer` grau,
  `rundung` 7. `Regler` (2D): `wert` 0.5, `von` 0, `bis` 1, `breite` 160, `farbe` kruste, `knauf` senf; Maus zieht `wert`; Lesefeld
  `geaendert`. `Tafel` (2D): `breite` 240, `hoehe` 160, `farbe` `#2f2a26e0`, `titel` "", `rundung` 10, `ziehbar` nein; Kinder = Inhalt.
  `Blick` bekommt die Lesefelder `mausX`/`mausY` (Maus in Weltkoordinaten) als Nachtragsfelder. Treffer: oberstes Element (höchste
  `ebene`, dann höchste ID); HUD-Ebene ab `festAb` in Spielfeld-, sonst in Weltkoordinaten.
- **Schichten/Dateien:** neu `komponenten/knopf.rs`, `leiste.rs`, `regler.rs`, `tafel.rs`; `blick.rs`; Kern `abi.rs` (neuer Export
  `eingabe(maus_x f64, maus_y f64, knoepfe i32)`), `welt.rs` (Eingabezustand; nicht im Szenen-Hash, wirkt nur über Lesefelder → v1-Hashes
  bleiben), `kern-wasm`, `herd/skript*`; **§9-Ausnahme:** `site/js/pizza/herd/laufzeit.js` und `laufzeit/src/herd.rs` (je Takt vor `fn()` mit dem
  Eingabezustand §18.3 aufrufen), `host/src/herd.rs` (Hostfunktion), `HOST-ABI.md`, SPEC §18.3. Bildbeiträge aus vorhandenen Arten
  (Rechteck, Glyphen) – keine Glut.
- **Determinismus:** Treffer mit f64-Vergleichen, Reihenfolge nach Ebene/ID; Eingabe nur aus dem `takt`-Ereignis.
- **Tests:** `cargo test`, `herd-knopf.*`, `herd-regler.*` (mit Maus-`.ereignisse`), Differenztests mit Host. **Beispiel:** `startmenue.pizza`
  (Knöpfe „Spielen“/„Ende“, Lebensleiste, Regler, ziehbare Tafel).
- **Abnahme:** A-Lauf. **Abhängig von:** H-K0, H-K1. **K-Vorschlag:** K-151.
- **Umgesetzt (K-151):** **Entscheidung:** `Knopf` heißt **`Taster`** – `Knopf` ist schon eine Theke-Klasse (Typprüfung, `neu`,
  Importgruppen und Editor hätten den Namen je Programm umdeuten müssen). `Blick.mausX`/`mausY` werden beim Lesen berechnet (neuer
  `Art`-Haken `lies`), nie gespeichert. Beispiel `konfigurator.pizza` (Pizza-Konfigurator) statt `startmenue.pizza`.

#### H-K13 `Kniff` – eigene pizza-Klassen als Komponente, Rückrufe aus Systemen (W6, §9-Ausnahme)
- **Ziel:** Unity MonoBehaviour (`Start`, `Update`, `OnTriggerEnter/Exit`, `onClick`).
- **Sprachfläche:** eingebaute, **erbbare** Klasse `Kniff` (Ausnahme zu P0010) mit `teil()` und überschreibbaren Methoden `start()`,
  `takt()`, `beimBetreten(Teil anderes)`, `beimVerlassen(Teil anderes)`, `beimKlick()`, `beimEntfernen()`. `klasse Wackler erbt Kniff {
  takt() { teil().verschiebe(0, Mathe.sin(herd.zeit())); } }`, `teil.mit(neu Wackler())`; mehrere Kniffe je Teil (auch gleiche Klasse),
  `teil.kniffe()` → `Blech<Kniff>`, `teil.ohne(k)`. **Ablauf je Takt** nach dem Nachlauf: Teile mit Kniffen nach ID, je Teil Kniffe in
  Anhängereihenfolge: `start()` (einmal), `beimBetreten`/`beimVerlassen` je Eintrag aus `Fuehler.betreten`/`verlassen` (nach ID),
  `beimKlick` bei `Knopf.geklickt`, dann `takt()`. Schritte normal, P0002 je Takt einschließlich Kniffe; Ananas beendet den Lauf wie in
  `fn`. `kopie()` kopiert **keine** Kniffe (**Entscheidung**; Muster: Fabrikfunktion). In `brigade`-Stücken verboten.
- **Schichten/Dateien:** Kern nur `abi.rs` (`teil_methoden` um `kniffe` ergänzen, Kollisionsprüfung); Ereignisse liest die
  Laufzeit über die Lesefelder aus H-K6/H-K12; **§9-Ausnahme:**
  `site/js/pizza/` (`herd/`, `laufzeit/aufrufe.js`), `laufzeit/src/herd.rs` + `klassen.rs`, `site/js/pizzaiolo/` (Basisklasse, Dispatch überschriebener Methoden),
  Prüfstand `a18-herd.js`, Editor-Wörter in `ui/src/`, SPEC §18.1/§18.2/§18.4.
- **Determinismus:** feste Reihenfolge, bitgleich Interpreter = Wasm (Differenztests); keine Wanduhr.
- **Tests:** `herd-kniff.*`, `herd-kniff-ereignisse.*` (Fühler + Knopf), `herd-kniff-ananas.*`, Prüfstand, Differenz. **Beispiel:**
  `kniffe.pizza` (Gegner-Klasse mit eigenem Verhalten, Münze mit `beimBetreten`).
- **Abnahme:** A-Lauf. **Abhängig von:** H-K6, H-K12. **K-Vorschlag:** K-152.
- **Umgesetzt (K-152):** `Kniff` = Laufzeitklasse 16 (Rohling; eigene Klassen im Wasm ab 17), Kniffe leben nur in den Laufzeiten
  (`site/js/pizza/herd/kniff.js`, `laufzeit/src/herd.rs` Abschnitt Kniff mit Zustand im Füllplatz `Obj.kniff`); Kern: nur `abi.rs`
  (`kniffe` in `TEIL_METHODEN`, Lesefeld `teil_hole(…, 19)` = ruht). **Entscheidungen:** ruhende Teile (Vorlage, Kulisse aus) bekommen
  **keine** Rückrufe, auch kein `start` (eingefrorene Fühler-Listen würden sonst erneut feuern); Schnappschuss der Teile/Kniffe zu Beginn
  der Phase; `start` einmal je Kniff; nur überschriebene Rückrufe kosten Schritte; `beimEntfernen` **nach** dem Lösen (`ohne(k)`,
  `entferne()` des Teils oder eines Vorfahren), `teil()` dort `karton`; `gedrueckt`/`klick` des Herds gelten in der Kniff-Phase wie in
  `fn`; `beimKlick` aus `Taster.geklickt` (statt `Knopf`, K-151). Beispiel `herd/kniffe` (Pizzaboten-Spiel) statt `kniffe.pizza`.
  Refactor für H-K14: Rückruf-Rahmen der Spielschleife als `herdRueckruf` (Interpreter) bzw. `nach_rueckruf` (Laufzeit) – ein weiterer
  Rückruf-Ort (Klang-Ende) hängt sich dort ein.

#### H-K14 `Klang` – eigene Importgruppe `klang` (W7, §9-Ausnahme)
- **Ziel:** Unity AudioSource/AudioClip; löst K-135 ab („später additiv als eigene Importgruppe“).
- **Sprachfläche:** Klasse `Klang` (Ressource, auch ohne Herd nutzbar): statisch `Klang.ton(frequenz, dauer, welle: "sinus",
  lautstaerke: 0.5)` (`sinus|rechteck|saege|dreieck|rauschen`), `Klang.noten("C4 E4 G4 C5", tempo: 120, welle: "rechteck")`; `k.spiele(
  lautstaerke: 1, schleife: nein)` → `Spur` mit `stoppe()`, `laeuft()` (aus simulierter Zeit berechnet, nie vom Gerät). Bilddateien-artig
  `Klang.laden("klaenge/x.wav")` erst mit PROJEKTE.md (Kiste) – **später** (**Entscheidung**).
- **Schichten/Dateien:** neue Crate `herd/klang` (`no_std` + `libm`, Synthese zu PCM 48 kHz, bitgleich nativ = Wasm, eingecheckt als
  `site/js/herd/klang.wasm`); **§9-Ausnahme:** `site/js/pizza/herd/`, `laufzeit/`, `site/js/pizzaiolo/` (Importgruppe `klang`), `HOST-ABI.md`,
  `host/` (Windows WASAPI; Linux ALSA `libasound.so.2` per `dlopen`, kein Link-Zwang K-130; fehlt Ton → stumm, eine Meldung, kein
  Abbruch), EXE-Export-Gruppenprüfung, `site/js/worker.js` + `ui/src/` (WebAudio, startet erst nach der ersten Geste – vorher Gespieltes
  entfällt still; Stummschalter). Mit Herd startet ein Klang mit dem Bild seines Takts, ohne Herd sofort.
- **Determinismus:** Ereignisse `{ typ: "klang", art: "spiele"|"stoppe", klang, spur, lautstaerke, schleife }` mit FNV-1a-Hash der PCM-Bytes
  (Bytes nie in der Ereignisliste); Tests vergleichen `<name>.klang-erwartet` (JSON-Lines, kanonisch wie `.herd-erwartet`, **Entscheidung**).
  Hörbares ist nicht Teil der Bitgleichheit.
- **Tests:** `cargo test` (Synthese-Hashes nativ = Wasm), `klang-*.pizza` + `.klang-erwartet` in Interpreter, Wasm, Differenz, Host;
  E2E headless mit stummem `OfflineAudioContext`. **Beispiel:** `klavier.pizza` (Knöpfe spielen Töne, H-K12).
- **Abnahme:** A-Lauf. **Abhängig von:** – (Beispiel nutzt H-K12). **K-Vorschlag:** K-153.

### 12.5 Vorgeschlagene K-Einträge

Nur Vorschlag – geschrieben werden sie in `KLAERUNGEN.md` mit der jeweiligen Stufe. K-138 … K-147 sind durch PROJEKTE.md §12 belegt;
nächste freie Nummer daher **K-148** (vor dem Schreiben erneut prüfen und ggf. verschieben).

| Nr | Titel | Inhalt | mit |
|---|---|---|---|
| K-148 | Herd-Ausbau: Stufenplan und Verträglichkeit | Registry nur anhängen, Typnummern in Merge-Reihenfolge (§12.1), Hash-Stabilität (Nachtragsfelder), Bildpaket nur additiv (VERSION 1), bestehende `.herd-erwartet` = Regression | erste Stufe (H-K0) |
| K-149 | Feldtypen `teil-liste`/`zahl-liste`, Lesefelder, Nachtragsfelder, Nachlauf | §12.4 H-K0, Texte, entfernte Teile fallen beim Lesen heraus | H-K0 |
| K-150 | Fühler und Wucht: Ereignisse als Zustand je Takt, Formen, Masken, feste Iterationen | §12.4 H-K6/H-K7, v1-Grenzen (keine Drehdynamik, achsenparallele Hüllen) | H-K6 (Nachtrag H-K7) |
| K-151 | Maus im Kern und Herd-UI-Bausteine | Export `eingabe`, nicht im Hash, Trefferregel, Welt-Maus am Blick | H-K12 |
| K-152 | `Kniff`: erbbare Basisklasse, Ablauf je Takt, keine Kopie | §12.4 H-K13, Ausnahme zu P0010 | H-K13 |
| K-153 | Importgruppe `klang` (ergänzt K-135) | Synthese bitgleich, `.klang-erwartet`, Wiedergabewege, Stumm-Rückfall | H-K14 |

### 12.6 Später (nicht in diesem Plan)

Spot-Licht und mehrere Schatten, Schatten-Kaskaden, eigene Shader, Skelett-Animation, 3D-Physik, Post-Processing, Szenenansicht im
Playground, Szenen und Klänge aus Projektdateien (nach PROJEKTE.md), Farbverlauf am Gelände (Eckfarben), Theke und Herd zugleich (K-133).
Jede davon wird vor Beginn als eigene Stufe in §12 nachgetragen (Format-Brüche ausdrücklich markieren).
