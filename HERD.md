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
| Eingabe | `taste(n)`, `gedrueckt(n)`, `losgelassen(n)`, `mausX()`, `mausY()`, `maus(k = 1)`, `klick(k = 1)`; Mausfang `mausFangen(an = ja)`, `mausGefangen()`, Rohbewegung `mausDX()`/`mausDY()`, `mausrad()` (K-155); Tasten auch `Umschalt`, `Strg`, `Alt` |
| Welt | `hintergrund(f)`, `himmel(oben, unten = oben)`, `umgebung(f, staerke: 0.35)`, `nebel(f, von, bis)`, `kamera()` → Kamera-Teil, `sonne()` → Sonnen-Teil |
| Teile 2D | `herd.rechteck(x, y, b, h, farbe:, rundung: 0, umriss: 0)`, `herd.kreis(x, y, r, farbe:, umriss: 0)`, `herd.text(t, x, y, groesse: 16, farbe: "ofen", ausrichtung: "links")`, `herd.bild(bildchen, x, y, groesse: 1)`, `herd.gruppe(x = 0, y = 0)` |
| Teile 3D | `herd.koerper(form, x = 0, y = 0, z = 0, farbe: "weiss", glanz: 0.3, leuchten: 0, bild: karton)`, `herd.licht(x, y, z, farbe: "weiss", reichweite: 10)`, `herd.raum(x = 0, y = 0, z = 0)` (leeres 3D-Teil) |
| Teil | `x()`, `y()`, `z()`, `setzeLage(x, y, z?)`, `verschiebe(dx, dy, dz?)`, `drehung()`/`setzeDrehung(g)`, `neigung`/`rollen` (3D), `groesse()`/`setzeGroesse(s)` bzw. `(sx, sy, sz?)`, `ebene(n)` (2D), `sichtbar(d)`, `haenge(an)`, `eltern()`, `entferne()`, `kopie()`, `trifft(anderes)`, `mit(komponente)` → Komponente, `<komponente>()` → Komponente oder `karton`, `id()` |
| Komponente | `neu <Name>(feld: wert, …)`, Getter `feld()`, Setter `setzeFeld(w)` (verkettbar), generisch `hole("feld")`/`setze("feld", w)`, `teil()` |
| Ressourcen | `Form.wuerfel()`, `Form.kugel(teile: 24)`, `Form.zylinder(teile: 32)`, `Form.kegel(teile: 32)`, `Form.ebene()`, `Form.ring(dicke: 0.3, teile: 32)`, `neu Form(punkte, dreiecke, glatt: nein)`; `neu Bildchen(zeilen, farben: karton)` |
| Kniff (H-K13) | `klasse X erbt Kniff { leer takt() { teil().verschiebe(1, 0); } }`, `teil.mit(neu X())`, `teil.kniffe()`, `teil.ohne(k)`; überschreibbar `start`, `takt`, `beimBetreten(anderes)`, `beimVerlassen(anderes)`, `beimKlick`, `beimEntfernen` |
| Hilfen | `Herd.farbe(r, g, b, a = 1)` → `"#rrggbbaa"` |
| Klang (H-K14) | `Klang.ton(frequenz, dauer, welle: "sinus", …)`, `Klang.rauschen(dauer, art: "weiss", …)`, `Klang.noten("C4 E4 G4", tempo: 120)`, `Klang.stille(d)`; Formen `huelle`, `tiefpass`, `hochpass`, `verstaerke`, `mische`, `dann`, `wiederhole`, `nahtlos`; `k.spiele(lautstaerke: 1, schleife: nein, tonhoehe: 1, panorama: 0)` → `Spur` (`stoppe`, `laeuft`, `setzeLautstaerke/Tonhoehe/Panorama`, `setzeLage`, `setzeReichweite`, `beimEnde`) – auch ohne Herd (SPEC §18.8) |

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
  Hochladen aller Ressourcen und erstes Zeichnen holen also keine Takte nach. Ist nach dem Zeichnen noch kein Schritt fällig
  (Bildschirm etwas schneller als 60 Hz oder rAF-Zittern an einer Taktgrenze), wird der Takt **zum fälligen Zeitpunkt**
  angefordert (nativ `Taktgeber::faellig`, Browser ein Wecker per `setTimeout`) und nicht erst beim nächsten Bild – sonst fiele
  bei 59,94/60,05 Hz alle 10–20 s eine Reihe Bilder aus (0 Takte, dann 2). Die Glut übersetzt ihre Pipelines beim Anlegen
  (vor dem ersten Takt), nativ wird das Fenster erst mit dem ersten Bild sichtbar. Die Uhr bestimmt nur, *wann* ein Takt kommt
  und wie viele er zusammenfasst – das Spiel hängt allein von den Takt-Ereignissen ab.
- **Eingabe als Zustand** je Takt (`tasten`, `maus`, `knoepfe` im `takt`-Ereignis; fehlende Felder unverändert): `taste` gehalten,
  `gedrueckt`/`losgelassen`/`klick` nur im ersten Takt eines Ereignisses. Tastennamen wie `Tastatur` (K-110). Ab H-K12 reicht jeder
  Motor Maus und Knöpfe je Takt vor `fn()` mit dem Kern-Export `eingabe` an den Kern (UI-Bausteine, `Blick.mausX`; K-151).
- **Mausfang und Rohbewegung (K-155):** `bewegung` `[dx, dy]` und `rad` sind Summen seit dem vorigen `takt` (fehlt → 0, nur im ersten
  Takt sichtbar), `gefangen` ist Zustand. `mausFangen` sendet nur einen Wunsch (`herd`/`mausfang`); gefangen wird mit dem nächsten
  Klick ins Bild (Browser: Pointer Lock braucht eine Nutzergeste – nativ gleich gehalten), Esc/Fokusverlust geben frei. Der fangende
  Klick kommt wie jeder Klick an (`mausGefangen()` dort noch `nein`), das freigebende Esc nicht. Bleibt beim Sprachlauf, nicht im Kern (keine Hash-Änderung).
- **Schritte:** pizza-Aufrufe kosten normale Schritte, Engine-Arbeit (Systeme, Bild) kostet keine; P0002 je Takt neu (K-087).
- **Theke und Herd** nicht im selben Programm (P0013, K-133). **Ton** seit H-K14 über die Importgruppe `klang` (K-153, SPEC §18.8; v1 ohne
  Ton, K-135): Klänge werden erzeugt (bitgleich), ihre Spuren laufen in Bildzeit und starten mit dem Bild ihres Takts.
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
„Anlauf Pizza-Konfigurator“). **Gleichmäßigkeit:** mit `window.__herdMessung = true` (vor dem Backen) meldet der Zeichner je
rAF Zeitpunkt, Zeit in `g.bild`, nachgeholte Takte und die Wartezeit Anforderung → Paket als `{typ:"messung"}` (E2E-Messlauf
„Neon-Napoli im Playground gleichmäßig“, Auswertung in `bench/herd/ERGEBNISSE.md`). Ungebremst (ohne VSync) braucht keine Messung zu laufen: die Takt-Uhr begrenzt ohnehin auf 60 Bilder/s,
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
  WebGL2). Bildpakete gehen per `MessageChannel` (Bildfach im SharedArrayBuffer) direkt vom Programm- zum Render-Worker; der Render-Worker
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
  - **Bildpakete** gehen über einen `MessagePort` (Seite legt den Kanal je Lauf an) an den Zeichner, im Normalfall über das
    **Bildfach**: ein `SharedArrayBuffer` des Programm-Workers (einmal je Fenster über den Port bekanntgegeben, Int32 `[0]` belegt,
    Paket ab Byte 16, 256 KiB … 8 MiB). Je Bild kopiert der Programm-Worker das Paket einmal aus dem Kern hinein (die Motoren
    geben mit `optionen.herdAnsicht` eine Ansicht statt einer Kopie), setzt „belegt“ und schickt nur die Länge; der Zeichner gibt
    das Fach nach `g.bild` frei. Ist es noch belegt oder das Paket zu groß (erstes Bild mit allen Ressourcen), geht das Paket als
    übertragener `ArrayBuffer` – kein neuer Puffer je Bild, kein Warten. An die Seite gehen nur `herd/fenster` und `herd/schliesse`. `kern.wasm` kompiliert die Seite **einmal** und gibt das
    `WebAssembly.Module` jedem Lauf mit (`herdKern`, für Interpreter und Wasm-Motor gleich); geladen werden Kern und Glut nur,
    wenn das Programm den Herd nutzt (Glut erst beim ersten `fenster`).
  - **Glut-Web** (`herd/glut-web`, wasm-bindgen 0.2.129, `--target no-modules` → klassisches Skript für `importScripts` und
    `<script>`), gebaut mit `node herd/baue-web.js`; wgpu wählt WebGPU (mit Adapter-Prüfung), sonst WebGL2. Auf GL legt die Glut den
    Atlas mit mindestens 2 Schichten an (eine Schicht wird dort `TEXTURE_2D` statt Array).
  - **Rückfall:** Scheitert der Render-Worker beim Anlegen (kein `requestAnimationFrame` im Worker, kein WebGL2 im
    OffscreenCanvas), gibt er den Port zurück und dieselbe Glut (`js/herd/zeichner.js`) zeichnet im Hauptthread auf einem frischen
    Canvas; scheitert auch das → „Dieser Browser kann weder WebGPU noch WebGL2 – der Herd braucht eines davon.“ + `geschlossen`.
  - **Eingabe:** nur bei Fokus auf dem Canvas; Tastennamen wie `Tastatur` (K-110) plus `Umschalt`/`Strg`/`Alt`, Loslassen nach
    `e.code` (wie nativ nach physischer Taste), Wiederholungen ignoriert, kurz gedrückte
    Tasten zählen bis zum nächsten Takt, Fokusverlust = alles losgelassen; Maus/Touch in Spielfeld-Koordinaten (wie die Glut
    seitentreu eingepasst). **Mausfang (K-155):** die Seite merkt sich den Wunsch (`herd`/`mausfang` vom Programm-Worker), ruft beim
    nächsten Mausklick aufs Canvas `requestPointerLock({unadjustedMovement: true})` (Rückfall ohne Option; scheitert es, z. B. kurz
    nach Esc, fängt der nächste Klick), meldet `pointerlockchange` als `{typ:"gefangen"}` und `movementX/Y` als `{typ:"bewegung"}`,
    das Rad als `{typ:"rad"}` an den Zeichner; der summiert bis zum nächsten Takt. Blur, Fensterende und `mausFangen(nein)` lösen. Canvas in Gerätepixeln (`device-pixel-content-box`, scharf auf HiDPI). Statuszeile im Playground:
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
| Input | Tastatur, Maus, Touch als Zustand | **v1** · Mausfang (Pointer Lock), Rohbewegung, Rad, Modifikatoren **K-155** | Laufzeit/Kern |
| Camera | `Kamera` (3D perspektivisch), Spielfeld-2D | **v1** · 2D-Kamera `Blick` (Scroll/Zoom), Folgekamera `Leine` **H-K1** | Komponente |
| Light | Sonne mit Schatten, 8 Punktlichter, Umgebung, Nebel | **v1** · viele Lichter (Clustered Forward) + Spot **umgesetzt** · Schatten für Punkt/Spot, Sonnen-Kaskaden **H-K18** · Spiegelbild mit allen Lichtern **H-K21** (§13) | Komponente + Glut |
| MeshRenderer, Material | `Koerper` (Form + Farbe/Glanz/Leuchten/Bild) | **v1** · geteiltes Material `Belag` **H-K2** · Relief/Kachelung/PBR/Nässe am `Belag` **umgesetzt** · Normal-/Stoff-/Leucht-Karte, Ausschnitt, beidseitig **H-K26** (§13) | Komponente + Glut |
| Shader | feste Shader | eigene Shader (WGSL) **später** | Glut |
| Sprites / 2D | `Rechteck`, `Kreis`, `Text`, `Bild`, Atlas | **v1** · `Linie`, 9-Slice `Rahmen` **H-K3a** · `Vieleck` **H-K3b** (umgesetzt) | Komponente (3b + Glut) |
| Animation | `Animation` (Bildchen-Folge) | **v1** · Tweens `Gleiten`, Keyframes `Ablauf` **H-K4** · Modell-Animationen `Puppe` **H-K23a**, Skinning **H-K23b** (§13) | Komponente |
| Particle System | `Partikel` 2D | **v1** · 3D-Partikel `Funken` **H-K5** · Regen (Striche, Licht, Volumen, Spritzer am Boden, Pfützenringe) **umgesetzt** · Aufprall und Spritzer an Körpern **H-K25** (§13) | Komponente + Glut |
| Collider / Trigger | `trifft` (Hüllen) | **v1** · Kollider `Fuehler`, Ereignisse als Zustand je Takt (betreten/verlassen) **H-K6** | Komponente |
| Physics 2D / 3D | – | 2D-Physik `Wucht` (Rigidbody, Impulse) **H-K7** · 3D `Schwung` **H-K17**, CharacterController `Figur` + Raycast `Strahl` **H-K20** (§13) | Komponente (System) |
| Prefabs / Assets | `kopie()`, Formen/Bildchen | **v1** (kopie) · `Vorlage` **H-K8** · größere Bilder/Texturen: abgelöst durch PROJEKTE.md (E13, K-145, K-147, PD1/PD3) · 3D-Modelle (glTF) `Modell` **H-K16** (§13) | Kern |
| Szenenwechsel | – | `Kulisse` (Teilbäume an/aus), leeren per `entferne` **H-K9** (umgesetzt) | Kern |
| Tilemap | – | Kachelkarte `Fliesen` **H-K10** (umgesetzt) | Komponente |
| Gelände / Skybox | Himmelsverlauf | `Gelaende` aus Höhenkarte **H-K11a** · Skybox `Himmelszelt` **H-K11b** · Gras/Kleinzeug `Streu` + `Wind` **H-K27**, `Wasser` **H-K28** (§13) | Komponente (11b + Glut) |
| UI (uGUI) | Text, Rechteck | `Knopf`, `Leiste`, `Regler`, `Tafel` + Maus im Kern **H-K12** | Komponente + Kern-ABI |
| Skript-Komponenten (MonoBehaviour) | Spiellogik in `backe` | eigene pizza-Klassen `erbt Kniff` (`takt()`, Rückrufe) **H-K13** | Laufzeit |
| Audio | – (K-135) | `Klang`/`Spur` (erzeugte Klänge, einfacher Raum am Hörer = Kamera) **H-K14 umgesetzt** · Klangdateien **H-K19a/b**, Raumklang-Baustein `Schall` **H-K22** (§13) | eigene Importgruppe |
| Post-Processing | – | `Stimmung`: HDR, ACES, Bloom, Höhennebel, Vignette, Korn, planare Spiegelung **umgesetzt** · Bildschirmraum-Spiegelung/AO **H-K24** (§13) | Komponente + Glut |
| Editor | – | Szenenansicht im Playground **später** | UI |

Verbindlich für die Stufen H-K0 … H-K14 (Inhalt, Reihenfolge, Wellen, Abnahme) ist der **Stufenplan §12**; was umgesetzt ist, steht in
**§11.1**. Ab H-K15 gilt der **Stufenplan §13** (Engine fertigstellen). „später“ = nicht im Plan (§12.6, §13.6).

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
mit Reihenfolge, Wellen und Abnahme; die Stufen **H-K15 ff.** im **Stufenplan §13**.

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
| **Spiegelung** (planar, Nutzerwunsch „nasser spiegelnder Asphalt“) | `Stimmung.spiegelung`/`spiegelHoehe` (STIMMUNG jetzt 80 B: Vektor `spiegel`); Glut nativ + Web: gespiegelte Kopie von SZENE (Ansicht·Projektion × Spiegelmatrix, Kamera gespiegelt, `zahlen.y` = 1 und `zahlen.z` = Höhe als Kennung), eigene Haupt-Bindegruppe, Spiegeldurchgang in halber Größe (HDR-Format, Himmel + FEST, unter der Ebene verworfen, 8 Lichter aus SZENE statt Zellen), Spiegelbild an Bindung 19 (im Durchgang selbst ein 1 × 1-Platzhalter), `pbr_licht` mischt es auf nach oben zeigenden Flächen der Ebenenhöhe (Relief-Verzerrung, 5 Abtastungen nach Rauheit, Fresnel); Pipelines (HDR, einfach abgetastet) beim Anlegen vorab; Referenzbild `3d-spiegel` | (dieser) | Kern 112/112 (`tests::stimmung` erweitert), `node herd/test-kern.js` bitgleich (`stimmung.herd` mit Spiegelung); eigene Hashes von `neonschild`/Doku-Block neu (STIMMUNG-Block wuchs); WARP Referenzbild 20 Draw-Calls (Spiegel 3) |
| **Regen** (Nutzerbefund „Regen sieht nicht nach Regen aus“) | Nachtragsfelder an `Funken`: `streckung` (Belichtungszeit → Strich entlang der Bewegung), `licht` (Beleuchtung je Teilchen), `volumen` (Ausstoß im waagerechten Quadrat um das Teil, Umlauf auf die Gegenseite), `aufschlag`/`boden`/`spritzer` (Ende unter `boden`, Spritzer als Teilchen mit negativem `leben` im selben 8er-Satz), `regen` (Rate × `Stimmung.regen`); `Stimmung.regen` (Nachtrag, im freien Wort `spiegel.z` des 80-B-Blocks – Block und Hashes unverändert); Bildpaket-Abschnitt `ZUSATZ_TEILCHEN` (19, 16 B je Teilchen in TEILCHEN3D-Reihenfolge: halbe Strichachse, Merkmale) nur bei Nutzung, Sichtkörper-Test mit halber Strichlänge; Glut nativ + Web: zweiter Teilchen-Instanzpuffer (Nullen ohne Abschnitt), `funken.wgsl` Strich quer zur Kamera mit Mindestbreite ~0,6 Gerätepixel (Deckkraft ausgleichend), Licht je Teilchen im Vertex-Shader (Umgebung, Nebelfarbe, Sonne, Zellen-Lichter bzw. 8 aus SZENE, Vorwärtsstreuung; Bindungen 15/16 jetzt auch Vertex – WebGL2-Vertex-Texturen), `licht.wgsl` `regenringe` (Ringe als Normalen-Neigung in Pfützen, verzerren das Spiegelbild) und Rinnsale an nassen Wänden; Szene `regen.herd`, Referenzbild `3d-regen`, Fall `herd-regen`, Doku in `herd-ausbau`, B11 in `mess-kern.js` | (dieser) | `cargo test -j 2` (Kern 118/118 inkl. 5 neue `tests::regen`, Skript 4 + 1, Teigling 13, Glut 1, Werkzeug 7 inkl. Pixeltest 3d-regen; die sechs 3D-Referenzbilder pixelgleich nachgerechnet); `node herd/test-kern.js` bitgleich nativ = Wasm (neu `regen.herd` klein + N = 20 000); `erwartet.js` ✓ (keine bestehende geändert); `npm test` (341 Fälle, 80 Beispiele, 164 Doku), Prüfstand 845/845 + 6/6, `test:wasm` 1636, `test:differenz` 1277 ohne Abweichung; E2E 05 + 13 headless 82/82 (`3d-regen` WebGL2 0,049 %); B11 Kern je Bild 0,98 ms nativ / 1,64 ms Wasm bei 20 000 Teilchen; WARP Referenzbild 21 Draw-Calls (alle Tropfen und Spritzer 1) |
| **Neon-Napoli** (Spiel, Projektordner) | Begehbares 3D-Spiel in `site/beispiele/herd/neon-napoli/`: Ich-Perspektive wie im Ego-Shooter (Klick ins Bild fängt die Maus, Esc gibt frei; Mausblick ohne Glättung, Neigung ±85°; WASD relativ zum Blick mit Anfahren/Bremsen, diagonal normiert; Umschalt sprintet ×1,8 mit sanftem Übergang, stärkerem Kopfwippen und +6° Sichtfeld; ohne Fang Maus ziehen oder Q/E), Kollision als Kreis gegen Grundriss-Kästen, drei Lieferungen mit Zeit und Trinkgeld; 9 `.pizza`-Dateien per `bestellt`, 27 Bilder (7 Fotomaterialien CC0 von Poly Haven mit Relief – Asphalt, Gehweg, Beton, Ziegel in 1024², der Rest 512² –, prozedurale Neonschriften/Hologramm/Fenster/Schaufenster aus `scripts/texturen-neon.js`, Quellen in `quellen.md`), nutzt viele Lichter, Stimmung mit Spiegelung, Material (pbr, nass, Welt-Kachelung), Himmelszelt, Funken (Regen, Dampf), Ablauf (Drohnen); `tests/herd/bild.js --skript` behält die Teiglinge neben dem Skript (`<skript>-teige/`) zum Nachmessen | (dieser) | 585 Teile, 104 Lichter, Teigmenge 56,3 MiB (Grenze 64), Dateien 4,8 MiB; Kern je Bild 0,14 ms nativ (Release, `herd-skript --mess`); WARP 1280 × 720: 27 Draw-Calls (ohne Schatten), ≈ 0,6 s je Bild auf dem CPU-Rasterizer (kein GPU-Maß) |
| **Mausfang** (Pointer Lock, relative Maus, Rad, Modifikatoren; K-155, Nutzerbefund „Steuerung … Mausfang?“) | Sprache `herd.mausFangen(an = ja)` (Wunsch → Ereignis `herd`/`mausfang` bei Wechsel), `mausGefangen()`, `mausDX()`/`mausDY()` (Rohbewegung je Takt in Pixeln), `mausrad()` (Rasten); `takt` + `bewegung`/`rad` (Summen, fehlt → 0, nur im ersten Takt) und `gefangen` (Zustand); Tasten `Umschalt`/`Strg`/`Alt`, Browser lässt nach `e.code` los. Browser: Seite merkt den Wunsch, Klick aufs Canvas → `requestPointerLock({unadjustedMovement})`, `pointerlockchange`/`movementX`/Rad → Zeichner (summiert bis zum Takt), Esc frei (nicht ans Programm), Blur/Ende lösen; nativ: Klick → `CursorGrabMode::Locked`, sonst `Confined`, Zeiger aus, `DeviceEvent::MouseMotion`, Esc/Fokusverlust frei. Kern, Schema, ABI-Exporte, Glut unverändert | (dieser) | `cargo test -j 2` in `herd/` (Kern 113, Teigling 13, Werkzeug 7, Skript 4 + 1, Glut 1) und `host/` (63, neu `takt_json_mit_bewegung_rad_und_fang`, Tastennamen mit Modifikatoren); `test-kern.js` 46 Läufe bitgleich; `erwartet.js` 87 ✓ (neu `herd-mausfang`, Doku-Block); `npm test` (341 Fälle, 80 Beispiele, 164 Doku); Prüfstand 845/845 + 6/6 (neu a18 Mausfang); `test:wasm` 1636; `test:differenz` 1279 ohne Abweichung (neu Korpus `herd-mausfang-blick` mit Nachholtakten, doppelten Feldern, 1e400); `host/test.js` 78/78 + 6/6; E2E 14 neu „Mausfang per Klick ins Bild“ (echter Pointer Lock im headless Chrome: Fang, movementX-Summe, Umschalt, kein hängendes `W`, `mausFangen(nein)` löst) |
| **H-K12** UI + Maus im Kern | `Taster` (27; Name statt `Knopf`, das ist die Theke), `Leiste` (28), `Regler` (29), `Tafel` (30, ziehbar, Kinder = Inhalt), alle 2D, Bildbeiträge nur aus `RECHTECK`/`KREIS`/`GLYPHE`; Kern-Export `eingabe(maus_x, maus_y, knoepfe)` (Kern, `kern.wasm`, Skript-Spieler, Interpreter, Laufzeit, Host, HOST-ABI v2 additiv), `Welt::eingabe` nicht im Szenen-Hash (Kante = Wechsel gegen den Stand am Ende des Vortakts), gemeinsamer UI-Durchgang `komponenten/ui.rs` im Nachlauf von `Taster` (oberstes Ziel nach Ebene, dann ID; HUD ab `festAb` in Spielfeld-, sonst Weltkoordinaten; Fangen/Freigeben), `Blick.mausX`/`mausY` als Nachtrags-Lesefelder, beim Lesen berechnet (neuer `Art`-Haken `lies`); Fenster (winit, Render-Worker) unverändert – sie liefern Maus/Knöpfe schon gleich; Szene `ui.herd`, Fälle `herd-taster`/`herd-regler`, Korpus `herd-ui-maus`, Beispiel `konfigurator.pizza`, E2E-Fall in `14-herd-playground`, Doku in `herd-ausbau`, K-151 | (dieser) | `cargo test -j 2` in `herd/` (Kern 106/106 inkl. 9 neue `tests::hk12` und Schlüsselwort-Test aus H-K11b, Skript 4 + 1, Teigling 13, Glut 1, Werkzeug 7); `node herd/test-kern.js` 40 Läufe bitgleich nativ = Wasm (neu `ui.herd` klein + N = 2 000); `erwartet.js` 73 ✓ (keine bestehende geändert); `npm test` (337 Fälle, 74 Beispiele, 155 Doku), Prüfstand 830/830 + 6/6, `test:wasm` 1597, `test:differenz` 1257 ohne Abweichung (neu Korpus `herd-ui-maus`); Host `cargo test` 61 + `host/test.js` 74/74 + 6/6; E2E headless 338/340 (1 übersprungen; 1 Doku-Panel-Test unter Last wackelig, allein grün), neu `Herd-UI: Taster und Regler mit der Maus im Vorschaufenster`; Sichtprüfung `konfigurator.pizza` offscreen (WARP) in Ordnung |
| **H-K13** Kniff | eingebaute, erbbare Basisklasse `Kniff` (Rohling, Laufzeitklasse 16, eigene Klassen im Wasm ab 17), `teil()` auch unqualifiziert, Rückrufe `start`/`takt`/`beimBetreten`/`beimVerlassen`/`beimKlick`/`beimEntfernen` (nur überschriebene), `teil.mit(k)`/`ohne(k)`/`kniffe()`, Kniff-Phase nach dem Nachlauf (Teile nach ID, Anhängereihenfolge, Schnappschuss, ruhende Teile ohne Rückrufe), `beimEntfernen` nach dem Lösen, `kopie()` ohne Kniffe; Interpreter `herd/kniff.js` + Hooks in `aufrufe.js`/`namen.js`/`pruefung.js`, Laufzeit `herd.rs` (Abschnitt Kniff, `Obj.kniff` im Füllplatz) + `klassen.rs`/`programm.rs`, Compiler `KLASSEN_BASIS` 17; Kern nur `abi.rs` (`kniffe` in `TEIL_METHODEN`, Lesefeld 19 ruht); Fälle `herd-kniff`/`herd-kniff-ereignisse`/`herd-kniff-ananas`, Korpus `herd-kniff-kueche`, Prüfstand a18 (+2), Beispiel `herd/kniffe` (Pizzaboten-Spiel), Editor-Wörter, Doku in `herd-ausbau`, K-152 | (dieser) | `cargo test -j 2` in `herd/` (Kern 107/107 inkl. `tests::hk13`, Skript 4 + 1, Teigling 13, Glut 1, Werkzeug 7 inkl. Pixeltest); `node herd/test-kern.js` alle Läufe bitgleich; `erwartet.js` ✓ (keine bestehende geändert); `npm test` (340 Fälle, 77 Beispiele, 160 Doku), Prüfstand 838/838 + 6/6, `test:wasm` 1615, `test:differenz` 1269 ohne Abweichung (inkl. Host, Köche, Chaos); Host `cargo test` 61 + `host/test.js` 75/75 + 6/6; UI-Tests; E2E headless 343/344 (1 übersprungen); Sichtprüfung `herd/kniffe` offscreen (WARP) in Ordnung |
| **H-K14** Klang | neue Crate `herd/klang` (`no_std` + `libm`: Töne in 5 Wellen mit Gleiten, Rauschen weiß/rosa/braun, Noten, Stille; Hüllkurve, Tief-/Hochpass, Verstärken, Mischen, Anhängen, Wiederholen, nahtlose Schleife → PCM 48 kHz mono i16, FNV-1a-64), `site/js/herd/klang.wasm`; Sprache `Klang`/`Spur` (SPEC §18.8, K-153) im Interpreter (`klang/kern.js`, `klang/tabellen.js`), Compiler (Gruppe `klang`), Laufzeit (`klang.rs`), JS-Host, Host (`klang.rs` + `wiedergabe.rs`: Mischer, `waveOut` per winmm, ALSA per `dlopen`, `--klang-datei`, `PIZZA_KLANG=0`), Browser (`ui/src/klang.js` WebAudio, Stummschalter, Hörer aus dem Bildpaket im Worker); Ereignisse sammeln sich bei offenem Fenster bis zum Bild, `beimEnde` nach den Kniffen (Rückruf-Rahmen aus H-K13); Testdateityp `.klang-erwartet`; Fälle `klang-ton/-spur/-herd/-ananas`, Beispiel `herd/klavier`, Klangkulisse in `herd/neon-napoli`, K-153 | (dieser) | `cargo test -j 2` in `herd/` (Kern 118, Klang 6 inkl. Golden mit 20 Aufrufen, Werkzeug 7 inkl. Pixeltest, Teigling 13); `node herd/test-klang.js` 20 Aufrufe bitgleich nativ = `klang.wasm`; `node herd/test-kern.js` alle Läufe bitgleich; `erwartet.js` ✓ (keine bestehende geändert, Neon-Napoli-`herd-erwartet` unverändert); `npm test` (346 Fälle, 81 Beispiele, 166 Doku), Prüfstand 849/849 + 6/6, `test:wasm` 1662 (neu `tests/wasm/klang.js` 8), `test:differenz` 1287 ohne Abweichung; Host `cargo test` 70 (neu `tests/klang.rs` 3, Mischer 4) + `host/test.js` 81/81 + 7/7; UI-Tests; E2E headless 383 (368 ✓, 4 unter Last abgelaufen und einzeln grün, 10 übersprungen; neu `20-klang` 3 mit `OfflineAudioContext`); stiller Gerätetest Windows (`PIZZA_KLANG_STILL=1`), Linux `cargo check` |
| **H-K15** Bindungen und Einheiten (W8, nur Glut, unsichtbar) | **Bindungswächter** `herd/glut/src/waechter.rs` (naga 30 als Dev-Abhängigkeit, `wgsl-in` + `glsl-out`): jeder Einstiegspunkt → GLSL ES 3.00 wie wgpu für WebGL2, zählt GLSL-Sampler und Uniform-Blöcke je Stufe (≤ 16/≤ 16/zusammen ≤ 32, ≤ 12) mit Gegenprobe am GLSL-Text, dazu die Pipeline-Layouts wie wgpu-GL (Textur-Einträge über alle Stufen ≤ 16, Sampler ≤ 16, Uniform-Puffer ≤ 12 je Stufe) und dass jeder Einstiegspunkt nur Bindungen seines Layouts in dessen Sichtbarkeit benutzt; Layouts als gerätefreie Funktionen `layout_haupt`/`layout_schatten`/`layout_nachbild` (reiner Umbau); Tabelle „Bindungen und Einheiten“ mit Reservierungen in `herd/README.md` §9. **Befund:** naga legt je benutzter Textur **einen** GLSL-Sampler an (`texelFetch` und `textureLod`/`textureGrad` teilen ihn) – `fs_licht` belegte schon vorher **10/16**, nicht 15/16; der Umbau `eigen_lade` → `textureSampleLevel` hätte nichts gespart und unterbleibt (**Entscheidung**, Shader unverändert). Knapp ist das Haupt-Layout: 11/16 Textur-Einheiten, nach den Reservierungen H-K18/H-K24/H-K28/H-K23b 16/16 (Vertex-Texturen teilen unter wgpu-GL denselben Pool) | (dieser) | Wächter: Layout haupt 11/16 Texturen · 3/16 Sampler · 5/12 Blöcke, `fs_licht` 10/16 (vorher = nachher); `cargo test -j 2` in `herd/`, Referenzbilder byte-gleich, `node herd/baue-web.js`, E2E 05/13/14 |
| **H-K17** Schwung (3D-Physik) | `Schwung` (32, 3D, braucht `Fuehler`, Takt nach `Gelaende`; Felder laut §13.3, Schwerkraft 0, Lesefelder `amBoden`/`ruht`), `Fuehler`-Formen `kapsel`/`netz` (hinten angehängt), neu `kollision3d.rs` (gedrehte Formen, SAT Kasten–Kasten mit bis zu 4 Punkten, Kapsel/Kugel geschlossen, Hüllen-Baum je Netz-Ressource in `Ressourcen::baeume`, Gelände analytisch = gezeichnetes Netz, `gelaende::hoehe`), Löser mit spekulativen Kontakten, Warmstart nach Ort, 8 Impuls-Iterationen je Kontaktfläche inkl. Flächen-Drehung, 4 Iterationen Positionskorrektur, Quaternion-Spalten, Schlafen in Inseln; Szene `schwung.herd`, Fall `herd-schwung`, Beispiel `kistenturm` (Pizzakarton-Turm auf Gelände, Klick wirft Teigkugeln), Doku in `herd-ausbau`, K-162; kein Bildpaket, keine Glut | (dieser) | `cargo test -j 2` in `herd/` (Kern 128/128 inkl. 10 neue `tests::hk17`: Fallhöhe, Stapel aus 10 Kisten ruht und schläft, Kugel rollt den Hang hinab (5/7 g sin θ, ω r = v), Kapsel stehend/liegend auf Netz, Kante kippt + Drehsperre, Schlafen/Wecken, kinematisch/fest/Auslöser/Kopie, ohne Schwung byte-gleich, Winkel hin und zurück; Skript 4 + 1, Teigling 13, Glut 2 + 6, Werkzeug 7 inkl. Pixeltest); `node herd/test-kern.js` 51 Läufe bitgleich nativ = Wasm (neu `schwung.herd` klein, N = 500 Kisten, K = 2 000 Kugeln); `erwartet.js` 93 ✓ (keine bestehende geändert); `npm test` (347 Fälle, 84 Beispiele, 168 Doku), Prüfstand 854/854 + 6/6, `test:wasm` 1671, `test:differenz` 1293 ohne Abweichung; `herd-fuehler.erwartet` Zeile 5 angepasst (Fehlertext nennt `kapsel`, `netz`); Sichtprüfung `kistenturm` offscreen (WARP) in Ordnung; B12: 500 Kisten Takt 1,70 ms nativ / 2,01 ms Wasm (Ziel ≤ 2 ms nativ), 2 000 Kugeln 3,2 / 3,1 ms (`bench/herd/ERGEBNISSE.md`); Repo-Zuwachs ≈ 0 (keine Assets) |
| **H-K18** Schatten für Punkt-/Spotlichter, Sonnen-Kaskaden (W9, Kern + Glut; K-160) | `Licht` Nachtragsfelder `schattenGuete` (aus/grob/mittel/fein), `schattenWeich` (0 … 4), `kaskaden` (1 … 4), `schattenWeite`; Kern `lichter.rs` (`schatten_waehlen`: ≤ 8 Lichter nach Abstand zum Lichtrand + ID, Morton-Packen in 4 Atlas-Seiten 2048², Würfel = 6 Kacheln mit Rand, Spot ≤ 60° = 1 Kachel; Abschnitt `SCHATTENLICHTER` (20), Platz in Bits 16 … 19 der LICHTER-Zellen), `paket.rs` (Sonnen-Kaskaden λ = 0,75, Kugel + Texel-Raster, Werfer je Ansicht als Instanz-Kopien, `zug` 4 `ANSICHT`); Glut nativ + Web: Shadow-Map → **ein** Tiefen-Array an Bindung 2 (Haupt-Layout bleibt **11/16**), Uniform 18 (SCHATTENLICHTER), dynamischer Uniform 20 im Schatten-Layout, `punktschatten`/`sonne_neu`/`zelt_frei` in `licht.wgsl`; Bindungs-Planung bis H-K28 (13/16) in `herd/README.md` §9, §13.1/§13.3 berichtigt; Szene `schatten.herd`, Referenzbilder `3d-punktschatten`, `3d-kaskaden`, Beispiel `laternengasse`, Doku `herd-ausbau` | (dieser) | `cargo test -j 2` (Kern inkl. 4 `tests::hk18`, Wächter, Pixeltest: alle bisherigen Referenzbilder auf WARP pixelgleich); `node herd/test-kern.js` (schatten.herd klein, N = 1000/L = 8, B13) bitgleich; **B13:** 76 Draw-Calls (73 Schatten) bei 8 Punktlichtern + 1 000 Körpern (Ziel ≤ 120), Kern-Bild 0,42 ms nativ / 0,53 ms Wasm, WARP 46 ms je Bild (60 fps EXE: vom Nutzer); Repo + 0,85 MB (2 PNG) |
| **H-K21** Spiegelbild vollständig (W10, Kern + Glut; Nachtrag K-160) | `Stimmung` Nachtragsfeld `spiegelGuete` (einfach/voll; STIMMUNG `spiegel.w`); Kern `lichter.rs` (bei voll und LICHTER: Abschnitt `LICHTER_SPIEGEL` (21) = Zellen-Tabelle für Ansicht × Spiegelmatrix über dieselbe Lichterliste, Versätze absolut hinter der ersten Tabelle; Lichterliste, Schattenwahl und – in `paket.rs` – Sichtprüfung der Körper und Teilchen mit dem gespiegelten Frustum); Glut nativ + Web: Spiegelziel in voller Größe, `DURCH` (Umlaufsinn gedreht) und 3D-Teilchen im Spiegel, Spiegel-Kopf als zweiter Uniform-Puffer an Bindung 14 der Spiegel-Bindegruppe, Zellen hinter denen von LICHTER in `zellen_t` (Haupt-Layout bleibt **11/16**), echte Vorderseite im Spiegel, Höhenfenster ±0,2/0,45 und verworfene Oberseiten unter h + 0,5 (eine Spiegelebene, Gehwege spiegeln mit); `einfach` byte- und pixelgleich; Szene `spiegel.herd`, Referenzbild `3d-spiegel-voll`, Beispiel `regenplatz`, Doku `herd-ausbau`; danach Neon-Napoli voll | (dieser) | `cargo test -j 2` (Kern inkl. 3 `tests::hk21`, Wächter, Pixeltest: alle bisherigen Referenzbilder auf WARP pixelgleich bzw. wie vorher); `node herd/test-kern.js` (spiegel.herd klein und N = 1000/L = 256) bitgleich; Neon-Napoli einfach/voll: Kern je Bild 0,62/0,66 ms nativ, 1,11/1,20 ms Wasm, 39/41 Draw-Calls, WARP 774/1 118 ms; Repo + 0,77 MB (1 PNG) |
| **H-K20** Figur, Strahl | `Figur` (33, 3D, braucht `Fuehler`, Takt nach `Schwung`; Felder laut §13.3, `schwerkraft` 9.81, Lesefelder `amBoden`/`boden`/`bodenHoehe`/`bodenNormale*`/`tempo*`/`anWand`/`anDecke`): aufrechte Kapsel, Hindernisse = alle Fühler mit `ausloeser: nein` (auch dynamische – `schieben` stößt sie an, wie Unity), Teilschritte ≤ halber Radius mit je ≤ 4 Durchgängen Herausschieben (Boden senkrecht, Decke entlang der Normale, Wand waagerecht), Kanten-Regel (Kante bis `stufe` mit begehbarer Oberseite = Boden, kurzer Strahl), Hoch–Vor–Runter nur bei niedriger Wand, Kleben und Absetzen als senkrechtes Wischen per Halbieren, Mitfahren über den Bezugspunkt im Raum des Bodens, Gelände für die Figur als Dreiecke (`kollision3d::kontakte_genau`; `Schwung` unverändert); `Strahl` (34, 3D, kein System): Lesefelder `getroffen`/`abstand`/`punkt*`/`normale*` beim Lesen berechnet (Haken `lies`), Ziele = Fühler-Formen (`kollision3d::ziele`, Strahl gegen Kugel/Kapsel/Kasten/Netz-Baum/Gelände-Raster), `ausMaus` von der aktiven Kamera; Zwischenergebnis bis zur nächsten Änderung über `Welt::stand` (schreibende Kern-Aufrufe zählen hoch, `Kern::wl` für lesende) und `Welt::abfragen` (nicht im Hash); Szene `figur.herd`, Fälle `herd-figur`/`herd-strahl`, Beispiel `parkour` (Schulterperspektive mit Mausfang, Treppe, Rampen, fahrende Plattformen, Aufzug, Fadenkreuz-Strahl auf Teigscheiben, Kamera-Strahl gegen Wände), Doku in `herd-ausbau`, K-165; kein Bildpaket, keine Glut, kein Interpreter/Laufzeit/Host | (dieser) | `cargo test -j 2` in `herd/` (Kern 140/140 inkl. 12 neue `tests::hk20`: Typnummern/Schema, fällt-landet-steht, laufen und Wandgleiten, Treppe hoch und runter ohne Abheben, Hang 30°/45° begehbar und 60° zu steil, Plattform und Aufzug mitfahren, Sprung und Decke, Figuren untereinander und Schieben, Strahl gegen jede Form/Maske/Auslöser/eigenes Teil/Gleichstand, Höhe über Gelände = Netz an 391 Punkten, `ausMaus` und Zwischenergebnis, ohne Figur byte-gleich; Skript 4 + 1 (+ 1 Messung, ignoriert), Teigling 13, Klang 6, Glut 2, Werkzeug 7 inkl. Pixeltest); `node herd/test-kern.js` 53 Läufe bitgleich nativ = Wasm (neu `figur.herd` klein, N = 100 Figuren + S = 1 000 Strahlen); `erwartet.js` 97 ✓ (keine bestehende geändert); `npm test` (349 Fälle, 85 Beispiele, 169 Doku), Prüfstand 856/856 + 6/6, `test:wasm` 1679, `test:differenz` 1297 ohne Abweichung; Sichtprüfung `parkour` offscreen (WARP) in Ordnung; B14: 100 Figuren Takt 0,36 ms nativ / 0,61 ms Wasm (Ziel ≤ 0,5 ms nativ), 1 000 Strahlen lesen 0,38 ms nativ / 0,58 ms Wasm je Takt (Ziel ≤ 1 ms nativ) (`bench/herd/ERGEBNISSE.md`); Repo-Zuwachs ≈ 0 (keine Assets) |
| **Neon-Napoli: Figur** (nach H-K20, §13.1 Regel 8) | Der Bote ist eine `Figur` (Kapsel 0.33 + Haut 0.02 = 35 cm wie zuvor, Höhe 1.8): Mauern, Laternen, Kaimauer bekommen einen festen Fühler (`quader(…, fest)`), Fahrbahn und Gehwege werden mit `begehbar(…)` zum Boden – Bordsteine (15 cm) steigt er jetzt wirklich hinauf und hinunter (Kanten-Regel/Kleben), um Ecken gleitet die runde Kapsel statt am eckigen Grundriss-Rechteck; die Kamera hängt am Boten (Augenhöhe, Kopfwippen, Neigung), Anfahren 28/36 m/s², Sprint ×1,8 mit +6° Sichtfeld und Mausfang unverändert im Programm (`spieler.pizza` gibt nur das Wunschtempo). Der Kreis-Test gegen `MAUERN` entfällt (die Liste bleibt als Zählung). Gleiches Steuergefühl: Bewegung im selben Takt wie die Eingabe (keine Verzögerung), Weg der Prüffahrt bis auf Zentimeter wie zuvor (1 von 3 Pizzen, 50 m) | (dieser) | `pruefung/` neu erzeugt (`herd-erwartet`, `klang-erwartet`; `erwartet` unverändert); `npm test` (85 Beispiele), `erwartet.js` ✓, `test:wasm` 1679, `test:differenz` 1297, Prüfstand 856/856 + 6/6; E2E 05 + 14 headless 95/95; Sichtprüfung offscreen (WARP) |

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
15 `Ablauf`** (H-K4 vor H-K1/H-K2 gemergt), **16 `Belag`** (H-K2), **17 `Fuehler`** (H-K6), **18 `Blick`, 19 `Leine`** (H-K1), **20 `Wucht`** (H-K7), **21 `Vieleck`** (H-K3b), **22 `Gelaende`** (H-K11a), **23 `Vorlage`** (H-K8), **24 `Fliesen`** (H-K10), **25 `Kulisse`** (H-K9), **26 `Himmelszelt`** (H-K11b), **27 `Taster`, 28 `Leiste`, 29 `Regler`, 30 `Tafel`** (H-K12), **31 `Stimmung`**, **32 `Schwung`** (H-K17; nächste freie Nummer auf `master` – kommt H-K16 mit `Etikett` vorher, wird es beim Rebase 33, §13.2), **33 `Figur`, 34 `Strahl`** (H-K20).

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
- **Umgesetzt (K-153):** Sprache wie geplant, erweitert um `Klang.rauschen` (weiß/rosa/braun), `Klang.stille`, Formen (`huelle`,
  `tiefpass`, `hochpass`, `verstaerke`, `mische`, `dann`, `wiederhole`, `nahtlos`) und an der `Spur` Lautstärke/Tonhöhe/Panorama,
  `setzeLage`/`setzeReichweite` (Raum) und `beimEnde` (nur in `backe`, nach den Kniffen). **Entscheidungen:** Ereignisse `spiele`/
  `setze`/`stoppe` (`setze` mit dem ganzen Zustand), `onKlang` **vor** dem Ereignis (PCM einmal je Klang zur Seite); Hörer = Kamera, von
  den Wiedergaben aus dem SZENE-Block jedes Bildpakets gelesen (kein Ereignis, kein Kern-Umbau); nativ `waveOut` statt WASAPI (gleiche
  Wirkung, ohne COM/Crates), ALSA per `dlopen`; Browser mit WebAudio-Knoten statt AudioWorklet (Raum, Tonhöhe, Filter eingebaut; Formel
  gespiegelt); laufende Schleifen setzen nach der ersten Nutzeraktion ein, einzelne Klänge davor entfallen; am Programmende klingen
  Spuren ohne Schleife aus. Beispiel `herd/klavier` (statt `klavier.pizza`).

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
Jede davon wird vor Beginn als eigene Stufe in §12 nachgetragen (Format-Brüche ausdrücklich markieren). **Nachtrag:** Spot-Licht ist
umgesetzt; Punkt-/Spotschatten, Kaskaden, Skelett-Animation, 3D-Physik, Bildschirmraum-Effekte und Klänge aus Projektdateien plant
jetzt §13 (H-K15 ff.).

## 13. Stufenplan H-K15 ff. – Engine fertigstellen

Ziel: Herd wird eine **kleine Unity** – 3D-Modelle aus Dateien samt Skelett-Animation, 3D-Physik mit Figur-Steuerung, Schatten
für alle Lichter, Bildschirmraum-Effekte, Gras im Wind, Wasser, Klänge aus Dateien und Raumklang. Es gelten alle Regeln aus §12.1
(Registry hinten anhängen, Hashes stabil, Bildpaket additiv, Browser = nativ, Determinismus, Erzeugtes neu erzeugen, Beispiele,
Doku, keine Fenster), die Abnahme-Befehle §12.3 und die Ergänzungen §13.1. Produktentscheidungen sind mit **Entscheidung**
markiert und in §13.5 gesammelt.

**Läuft (nicht Teil dieses Plans, wird vorher gemergt):** H-K14 `Klang` (Erzeugung, §12.4) · Mausfang + Modifikatortasten ·
Regen (gestreckte Teilchen, Pfützenringe) · Web-Ruckler. Welle W8 beginnt nach deren Merge; jede §13-Stufe rebased darauf und
übernimmt deren Nummern (Typnummern, Abschnitte, Fehlercodes, K-Einträge), statt eigene vorzubelegen.

### 13.1 Ergänzende Regeln

1. **Nummern sind Vorschläge**, vergeben in Merge-Reihenfolge (§12.1 Regel 1), maßgeblich ist §11.1. Stand vor W8 (vor dem
   Schreiben erneut prüfen – die laufenden Arbeiten können Nummern belegen): Typnummern ab **32** (31 = `Stimmung`), Feldtyp ab **13**,
   Bildpaket-`abschnitt` ab **22** (19 = `ZUSATZ_TEILCHEN` (Regen), 20 = `SCHATTENLICHTER` (H-K18), 21 = `LICHTER_SPIEGEL` (H-K21)), `flach_art` ab **7**, `zug` ab
   **5** (4 = `ANSICHT`, H-K18), Flag-Bits ab **8**, Kern-Fehlercodes ab **63**, PizzaFehler ab **P0021**, Glut-Bindungen ab **21**
   (18, 20 = H-K18; Einheiten-Planung in `herd/README.md` §9), Benchmarks ab **B15** (B11 = Regen, B12 = H-K17, B13 = H-K18, B14 = H-K20), K-Einträge ab
   **K-161** (K-160 = H-K18, K-162 = H-K17, K-165 = H-K20; K-156 … K-159 sind für die laufenden Stufen frei gehalten; beim Umsetzen gilt die nächste freie Nummer)
   (K-153 ist für H-K14 reserviert, K-154 belegt).
2. **Kein Format-Bruch** (**Entscheidung**): `VERSION` bleibt 1, `ECKE_BYTES` 32. Was Netze zusätzlich brauchen (Gelenke und Gewichte
   der Haut), kommt als eigener Ressourcen-Abschnitt und eigener Vertex-Strom neben `NETZ`; Tangenten werden nicht gespeichert, sondern
   wie beim Relief aus Ableitungen berechnet; Vertex-Farben aus Modellen backt der Vorbacker in ein Paletten-Bild (H-K16). Grund: ein `VERSION`-2-Bruch würde alle Hashes und
   Referenzbilder neu erzeugen, während in jeder Welle drei Stufen parallel laufen – zusätzliche Ströme kosten dagegen nur dort, wo
   sie benutzt werden.
3. **§9-Ausnahmen** in §13 haben nur **H-K16, H-K19a, H-K22** – höchstens eine je Welle. Je Welle höchstens **eine** Stufe, die
   `paket.rs` oder die Glut ändert (§12.1 Regel 8). Reine Vorbacker-Stufen (`herd/teigling`, Dateifilter in `ui/src/`) zählen nicht
   als §9-Ausnahme.
4. **Bindungs-Budget:** ab H-K15 ist die Tabelle „Bindungen und Einheiten“ in `herd/README.md` §9 maßgeblich (Shader, Bindung,
   Art, Textur-Sampler-Paar, WebGL2-Einheit, Stufe). Jede Glut-Stufe trägt ihre Einheiten dort ein; der **Bindungswächter** (Test aus
   H-K15) muss grün sein. Neue Bildquellen (Normal-, Stoff-, Leucht-Karten) laufen über die PD3-Klassen 7 … 11 und
   kosten **keine** Einheit.
5. **Vorbacker-Determinismus:** Bilder weiter nur Ganzzahlen (PROJEKTE §5.3). Modelle: f32-Bytes werden kopiert; gerechnet wird nur
   mit + − × ÷ √ (IEEE-exakt, keine FMA, feste Reihenfolge), keine Transzendenten – Drehungen, Zerlegungen und Interpolation rechnet der
   Kern in f64 mit `libm`. Klänge: WAV/FLAC ganzzahlig; Vorbis f32 nur mit Grundrechenarten, Tabellen aus `libm`. Fehler-Teige tragen
   ihren Fehlertext selbst (Text an **einer** Stelle, die Laufzeiten geben ihn nur aus).
6. **Abfragen ohne neue Sprache** (**Entscheidung**): Höhe, Strahl-Treffer und Ähnliches sind **berechnete Lesefelder** (Haken
   `lies`, H-K12 `Blick.mausX`) an einer Komponente – sofort gültig, deterministisch, ohne Methoden mit Argumenten. Ein generisches
   Abfrage-ABI (`komp_frage`) ist „später“; es lohnt erst, wenn eine Abfrage mehr als eine Handvoll Eingaben braucht.
7. **Assets:** Modelle, Texturen und Klänge in Beispielen sind **CC0** (Poly Haven, Kenney, ambientCG, Quaternius; Freesound nur mit
   CC0-Filter) und stehen mit Quelle und Lizenz in `quellen.md` des Projektordners (Muster `neon-napoli`). Testdaten erzeugen Skripte
   selbst (`scripts/modelle-test.js`, `scripts/klaenge-test.js`: wenige KB, keine Lizenzfrage), außer Vorbis (Kenney-OGG, H-K19b).
   Beispiele bevorzugen Kenney (Low-Poly, GLB ≤ 100 KB); Poly Haven nur in 1k-Auflösung, je Beispiel höchstens 5 MiB Dateien; den
   Zuwachs des Repos vermerkt jede Stufe in §11.1.
8. **Neon-Napoli aufrüsten** ist keine Regression im Sinne von §12.1 Regel 2: nach einer Welle bewusst, in einem eigenen Commit
   „Neon-Napoli: …“, mit neu erzeugtem `pruefung/` – nie innerhalb einer Stufe.
9. **Gemeinsame 3D-Kollision:** H-K17 legt `herd/kern/src/kollision3d.rs` an (Formen, Hüllen-Baum je Netz, Höhenraster des
   Geländes, Strahl- und Wisch-Abfragen); H-K20, H-K25 und H-K28 benutzen es und erweitern es nur additiv.

### 13.2 Wellen und Typnummern

Höchstens drei Stufen je Welle, parallel in eigenen Worktrees, gemergt in der angegebenen Reihenfolge. Spalten wie §12.2
(Nicht-Komponenten-Dateien; Anhängestellen nach §12.1 Regel 7 nicht gezählt).

| Welle | Stufen (Merge-Reihenfolge) | `paket.rs` / Glut | Interpreter / Laufzeit / Compiler / Host | weitere Kern-Dateien, Vorbacker |
|---|---|---|---|---|
| **W8** | H-K15 · H-K16 · H-K17 | H-K15 (nur Glut) | H-K16 | H-K16: `ressourcen.rs`, `abi.rs`, `fehler.rs`, `kern-wasm`, `herd/skript*`, `herd/teigling`; H-K17: neu `kollision3d.rs`, `formen.rs` |
| **W9** | H-K18 · H-K19a · H-K20 | H-K18 | H-K19a | H-K18: `lichter.rs`; H-K19a: `herd/teigling`; H-K20: `kollision3d.rs`, ggf. `mod.rs`/`abi.rs` (`lies` für Teil-Felder) |
| **W10** | H-K21 · H-K22 · H-K23a | H-K21 | H-K22 | H-K21: `lichter.rs`; H-K22: `schema.rs`, `abi.rs`, `kern-wasm`, `herd/skript*`; H-K23a: `ressourcen.rs` |
| **W11** | H-K24 · H-K19b · H-K25 | H-K24 | – | H-K19b: `herd/teigling`; H-K25: `kollision3d.rs` |
| **W12** | H-K26 | H-K26 | – | `ressourcen.rs` (Modell-Abbildung) |
| **W13** | H-K23b | H-K23b | – | `ressourcen.rs` |
| **W14** | H-K27 | H-K27 | – | – |
| **W15** | H-K28 | H-K28 | – | `kollision3d.rs` |

**Reihenfolge der Glut-Kette** (eine je Welle): Bindungen (Voraussetzung jeder weiteren Textur-Stufe) → Schatten → Spiegelbild
(braucht die Schatten) → Bildschirmraum → Belag-Karten → Haut → Wind/Streu → Wasser (braucht Bildschirmraum-Kopien). Modelle (H-K16)
brauchen die Glut nicht (sie nutzen `NETZ`, `TEXTUR`, `INST3D`, `ZUSATZ3D`) und kommen deshalb schon in W8; ihre Karten und ihre Haut
folgen in W12/W13. Die Kern-only-Stufen (Physik, Figur, Puppe, Funken-Aufprall) und die §9-Stufen füllen die Wellen W8 … W11.

**Abhängigkeiten:** H-K15 ← Regen (laufend) · H-K16 ← PD1/PD3 (umgesetzt), Mausfang (laufend, gleiche §9-Dateien) · H-K17 ← H-K6,
H-K11a · H-K18 ← H-K15 · H-K19a ← H-K14 · H-K20 ← H-K17, H-K12 · H-K21 ← H-K18 · H-K22 ← H-K14 · H-K23a ← H-K16 · H-K24 ← H-K15 ·
H-K19b ← H-K19a · H-K25 ← H-K17, H-K5, Regen · H-K26 ← H-K15, H-K16 · H-K23b ← H-K23a, H-K15 · H-K27 ← H-K15, H-K11a (weich H-K26) ·
H-K28 ← H-K24, H-K17 (weich H-K27). Innerhalb einer Welle hängt keine Stufe von einer anderen ab.

**Typnummern** (Vorschlag in Planreihenfolge; vergeben in Merge-Reihenfolge, §11.1):

| Nr (Vorschlag) | Komponente | Stufe | Raum | läuft in |
|---|---|---|---|---|
| 32 | `Etikett` | H-K16 | beide | – |
| 33 → vergeben **32** | `Schwung` | H-K17 | 3D | Takt |
| 34 → vergeben **33** | `Figur` | H-K20 | 3D | Takt (nach Schwung) |
| 35 → vergeben **34** | `Strahl` | H-K20 | 3D | – (beim Lesen berechnet) |
| 36 | `Schall` | H-K22 | beide | Nachlauf |
| 37 | `Puppe` | H-K23a | 3D | Takt |
| 38 | `Wind` | H-K27 | 3D | – |
| 39 | `Streu` | H-K27 | 3D | Takt (Punkte bei Änderung) |
| 40 | `Wasser` | H-K28 | 3D | – (Auftrieb im Schwung-Takt) |

Takt-Folge damit: … `Wucht` → `Gelaende` → `Schwung` → `Figur` → `Puppe` → `Streu` → Nachlauf (`Leine`, `Fuehler`, UI, `Schall`) →
Kniffe → Bild. Fühler sehen also die Lage nach Physik, Figur und Animation desselben Takts.

### 13.3 Die Stufen

#### H-K15 Bindungen und Textureinheiten (W8, nur Glut, unsichtbar)
- **Ziel:** Platz schaffen für Schatten-Atlas, Verdeckung, Bildschirmraum-Kopien und Gelenk-Palette; Unity: festes Binding-Layout
  der SRP. **Berichtigt (H-K18):** Der Plan nahm hier „15 von 16“ für den Licht-Shader an; gemessen (Wächter, naga/wgpu 30) belegt
  `fs_licht` **10/16** GLSL-Sampler (je benutzter Textur einer, `textureLoad` und Abtastung teilen ihn), und unter wgpu-GL zählt das
  **Pipeline-Layout**: das Haupt-Layout hat **11/16** Textur-Einträge über alle Stufen (Vertex und Fragment teilen sich die 16 –
  `MAX_TEXTURE_SLOTS`), die Planung je Stufe steht in `herd/README.md` §9.
- **Sprachfläche:** keine.
- **Umbau:** (1) `eigen_laden` liest über `textureSampleLevel(klasse, eigen_s, (t + 0.5) / größe, schicht, stufe)` an der Texelmitte
  mit expliziter Stufe statt `textureLoad` → je Klasse ein Paar (−5 Einheiten); pixelscharfe Bilder bleiben pixelscharf (lineare
  Abtastung genau in der Texelmitte = Texelwert). (2) `lichter_t` (RGBA32F, nicht filterbar) und `zellen_t` (R32Uint, ganzzahlig)
  bleiben `textureLoad` (je eine Einheit). (3) Feste Tabelle in `herd/README.md` §9 mit der Planung (Stand H-K18): H-K18 **0** (die
  Schatten-Tiefentextur wird ein Array, Kacheln und Kaskaden liegen in ihren Schichten), H-K24 Verdeckung (1), H-K23b Gelenk-Palette (1,
  im **selben** 16er-Pool des Haupt- und Schatten-Layouts – kein eigener Vertex-Pool), H-K28 Szenenfarbe + Tiefe in einem **eigenen**
  Layout `wasser` (0 im Haupt-Layout); H-K21 legt die Spiegel-Zellen in `zellen_t` (keine Einheit). Haupt-Layout heute 11/16, am Ende
  des Plans 13/16.
  (4) **Bindungswächter** (`cargo test` in `herd/glut`): übersetzt jeden Einstiegspunkt aller Pipelines mit naga nach GLSL ES 3.00 (wie
  wgpu-GL), zählt Sampler je Stufe (Fragment ≤ 16, Vertex ≤ 16, eine Pipeline zusammen ≤ 32) und Uniform-Blöcke (≤ 12 je Stufe,
  WebGL2-Minimum), dazu je Pipeline-Layout die Textur-Einträge (≤ 16 über alle Stufen, die eigentliche Grenze unter wgpu-GL) und
  Sampler (≤ 16), druckt die Tabelle und scheitert über der Grenze.
- **Schichten/Dateien:** `herd/glut/src/*`, `shader/gemeinsam.wgsl`, `licht.wgsl` (und jeder Shader mit `eigen_laden`), `herd/glut-web`
  neu bauen; `herd/README.md` §9. Kein Kern, kein `paket.rs`.
- **Determinismus:** kein Kern-Anteil. **Tests:** Wächter; **alle bestehenden Referenzbilder unverändert** (Pixeltest K-129, auf WARP
  möglichst bitgleich); E2E `13-herd-glut` (WebGPU und WebGL2). Kein neues Referenzbild, kein Beispiel (unsichtbar; Ausnahme zu §12.1
  Regel 4/10).
- **Doku:** `herd/README.md` §9 (Tabelle), §11.1. **Abnahme:** A-Glut ohne neues Referenzbild. **Abhängig von:** Regen (laufend).
  **K-Vorschlag:** K-160.
- **Stand (umgesetzt, §11.1):** Bindungswächter und Tabelle wie oben. Die Ausgangszahl „15 von 16“ stimmt für naga/wgpu 30 nicht:
  naga macht aus jeder benutzten Textur **einen** GLSL-Sampler, gleich ob `textureLoad` oder Abtastung – `fs_licht` belegt 10/16, vor
  und nach H-K15. Umbau (1) unterbleibt deshalb (kein Gewinn, nur Risiko für die Bitgleichheit), Shader unverändert. Unter wgpu-GL
  zählt zusätzlich das **Pipeline-Layout**: jede Textur-Bindung eine Einheit über alle Stufen (≤ 16) – Haupt-Layout 11/16, nach den
  damaligen Reservierungen 16/16; die Gelenk-Palette (H-K23b) ist dort **kein** eigener Vertex-Pool. H-K18 hat die Planung auf 13/16
  am Ende des Plans gesenkt (`herd/README.md` §9).

#### H-K16 `Modell` – 3D-Modelle aus glTF (W8, §9-Ausnahme: neue Ressource)
- **Ziel:** Unity Model Import: Meshes, Materialien, Texturen, Hierarchie; Instanzen wie Prefabs.
- **Sprachfläche** (SPEC §18.5, Importgruppe `herd`, wie `Bildchen.laden`): `Modell m = Modell.laden("modelle/laterne.glb");` (statisch,
  gleicher Pfad → dasselbe Objekt, vor `neu Herd` Fehlertext wie `Bildchen.laden`); `Teil t = herd.modell(m, x = 0, y = 0, z = 0)` →
  neues 3D-Wurzel-Teil mit einem Kind-Teil je glTF-Knoten (Standardszene, Tiefensuche in Dateireihenfolge → feste Teil-IDs), Lage aus
  TRS, `Koerper` je Primitive (mehrere Primitive eines Knotens als Kind-Teile), `Belag` je Material als **geteilte** Belag-Teile (einmal
  je Modell unter einer ruhenden `Vorlage`-Wurzel angelegt, H-K2/H-K8), `Licht` aus `KHR_lights_punctual` (Punkt, Spot; Richtungslichter
  entfallen – die Sonne ist global). `m.namen()` (Blech<margherita>, Knotennamen), `m.folgen()` (Animationsnamen, für H-K23a),
  `m.belaege()` (Blech<Teil>), `m.breite()`/`hoehe()`/`tiefe()` (Hülle der Ruhelage). Neue Komponente **`Etikett`** (beide): `name` ""
  (setzt `herd.modell` je Knoten; auch selbst verwendbar) und Teil-Methode **`finde(name)`** → erstes Teil im Teilbaum (Wurzel
  eingeschlossen, Tiefensuche in Kindreihenfolge) mit diesem Etikett, sonst `karton`. Mehr Instanzen: `herd.modell` erneut oder
  `kopie()` einer Vorlage. Fehler: `LaufzeitAnanas: modelle/x.glb ist kein lesbares Modell (glTF 2.0).` · `… braucht die Erweiterung
  KHR_draco_mesh_compression – die kann der Herd nicht.` · `… ist zu groß (612 000 Ecken) – höchstens 500 000 Ecken.` · Bild im Modell
  zu groß wie PROJEKTE §5.2 mit `modelle/x.glb (Bild 3)`.
- **glTF-Untermenge** (**Entscheidung**): `.glb` und `.gltf` (externe `.bin`/Bilder relativ im Projekt, `data:`-URIs); Dreiecke (Streifen
  und Fächer → Liste, ohne Indizes → Indizes), Punkte/Linien entfallen; `POSITION`, `NORMAL` (fehlt → glatt wie `netz_glatt`),
  `TEXCOORD_0`; `KHR_mesh_quantization`, Sparse-Accessoren, `KHR_materials_emissive_strength` (→ `strahlen`). Material → `Belag`:
  `baseColorFactor` → `farbe` (+ Deckkraft), `baseColorTexture` → `bild`, `metallicFactor` → `metall`, `roughnessFactor` → `glanz` =
  1 − Rauheit, `modell` pbr; Normal-, Stoff- (Verdeckung/Rauheit/Metall, getrennte Bilder packt der Vorbacker ganzzahlig in eines) und
  Leucht-Bild werden schon vorgebacken und ab H-K26 benutzt; `alphaMode BLEND` → Deckkraft, `MASK`/`doubleSided` ab H-K26. Häute
  (Gelenke, inverse Bindematrizen, `JOINTS_0`/`WEIGHTS_0`) und Animationen (Kanäle Lage/Drehung/Größe, `LINEAR`/`STEP`; `CUBICSPLINE`
  → nur die Stützwerte, linear) werden mitgenommen und ab H-K23a/b benutzt. `COLOR_0` ohne `baseColorTexture` backt der Vorbacker
  ganzzahlig in ein kleines Paletten-Bild (je Farbe ein Texel, uv = Texelmitte; Low-Poly-Modelle färben oft so), mit Grundfarb-Bild
  entfällt es. **Nicht:** Draco, meshopt, KTX2/Basis (Pflicht-Erweiterung
  → Fehler; nur benutzte, nicht verlangte Erweiterungen werden still übergangen), Morph-Ziele, `TEXCOORD_1`, Kameras,
  mehrere Szenen; FBX/OBJ gar nicht (Doku: mit Blender oder `gltf-transform` nach GLB ohne Kompression wandeln).
- **Koordinaten:** 1 glTF-Meter = 1 Einheit, +y oben, Vorderseite +z (schaut die Standardkamera an). Quaternionen → `rollen`/`neigung`/
  `drehung` (Reihenfolge SPEC §18.4) im Kern mit `libm`; `matrix`-Knoten zerlegt der Kern in TRS – Scherung geht verloren
  (**Entscheidung**, Doku).
- **Modellteig** (Format v1, Magie `TEIGMODL`, im Vorbacker `herd/teigling`): Kopf mit Zählern und SHA-256 über Hauptdatei + alle
  benutzten Dateien; Netze (Ecken 32 B wie `NETZ`, u32-Indizes, Material je Primitive), Materialien (Faktoren, Bild-Indizes), Bilder als
  **eingebettete Teiglinge** (PROJEKTE §5.3; gleiche Bilddatei einmal), Knoten (Name, Eltern, TRS als f32-Bits, Netz, Licht), Häute
  (Gelenk-Knoten, inverse Bindematrizen f32, je Ecke 4 × u16 Gelenk + 4 × u16 Gewicht, auf 65 535 normiert, ganzzahlig), Folgen
  (Kanäle, Zeiten, Werte). Fehler-Modellteig wie Fehler-Teigling, mit fertigem Text. `.gltf` zweistufig: `modell_braucht(bytes)` nennt
  die URIs, dann `vorbacken` mit allen Dateien.
- **Vorbacken, Grenzen:** Anlässe und Cache wie Bilder (PROJEKTE §5.4, Schlüssel SHA-256 + `modell/1`, Einbettung ins pkarton wie §5.6).
  Quelle zusammen ≤ 32 MiB; je Modell ≤ 500 000 Ecken, ≤ 1 000 000 Dreiecke, ≤ 1 024 Knoten, ≤ 64 Materialien, ≤ 32 Bilder (je ≤ 2048²),
  ≤ 4 Häute à ≤ 256 Gelenke, ≤ 64 Folgen. Modellteige zählen zur **Teigmenge** (P0020, 64 MiB; **Entscheidung**: ein Budget für alles,
  was in Kern und GPU liegt; Hebel bleibt GPU-Kompression PROJEKTE §5.7).
- **Schichten/Dateien:** `herd/teigling` (glTF-Leser mit kleinem JSON-Leser, Modellteig, Base64); Kern `ressourcen.rs`
  (`Ressource::Modell`: Netz-, Textur-IDs, Knoten, Häute, Folgen), `abi.rs` (Exporte `modell_teig(ptr, len) → id` mit Kopfprüfung,
  Netze/Bilder werden normale `NETZ`-/`TEXTUR`-Ressourcen; `modell_teil(id, x, y, z) → teil`, `modell_info`; `finde` in
  `TEIL_METHODEN`), `fehler.rs` (63 ff.), neu `komponenten/etikett.rs`, `kern-wasm`, `herd/skript*` (Zeile `modell_datei` wie
  `teigling_datei`). **§9-Ausnahme:** `site/js/pizza/herd/` (Klasse `Modell`, `herd.modell`, `finde`, Kiste-Weg), `laufzeit/src/herd.rs`
  (Importe, passives Datensegment), `site/js/pizzaiolo/` (Klasse, Einbettung), `HOST-ABI.md`, `host/src/herd.rs`, `site/js/worker.js`
  (Vorbacken), `ui/src/` (Dateibaum: `.glb`/`.gltf` mit Anzeige „612 Ecken · 3 Bilder · vorgebacken 1,2 MB“, Editor-Wörter), SPEC
  §18.5, PROJEKTE §5 (Absatz „Modelle“ mit Verweis auf §13). Kein `paket.rs`, keine Glut.
- **Determinismus:** 13.1 Regel 5; Teil-IDs in fester Knotenfolge; Hashes decken die Modellteig-Bytes ab.
- **Tests:** `cargo test` Vorbacker (Testmodelle aus `scripts/modelle-test.js`: Würfel, Hierarchie, Textur, Haut, Folge, jede
  Fehlerart; Hash nativ = `teigling.wasm`), Kern `tests::hk16`, Szene `modell.herd`, Fälle `herd-modell.*` (Projektordner),
  `herd-modell-ananas.*`, Prüfstand `a18-herd.js`, Differenz mit Host, E2E Playground (Modell hochladen, Vorschau, Lauf).
  **Beispiel:** `pizzeria` (Tische, Stühle, Öfen, Pizzen aus Kenney Food Kit und Furniture Kit, CC0, `quellen.md`).
- **Abnahme:** A-Lauf. **K-Vorschlag:** K-161.

#### H-K17 `Schwung` – 3D-Physik (W8, Kern-only)
- **Ziel:** Unity Rigidbody mit Box-, Sphere-, Capsule-, Mesh- und Terrain-Collider; Gegenstück zu `Wucht`.
- **Sprachfläche:** `Schwung` (3D, braucht `Fuehler`): `art` dynamisch (`dynamisch|kinematisch|fest`), `masse` 1 (> 0), `tempoX`/`Y`/`Z`
  0, `drehtempoX`/`Y`/`Z` 0 (Grad/s, Weltachsen), `schwerkraft` 0 (Einheiten/s² nach −y; Doku empfiehlt 9.81 – **Entscheidung** wie
  `Wucht`), `daempfung` 0, `drehdaempfung` 0.05, `abprall` 0, `reibung` 0.5, `stossX`/`Y`/`Z` 0 (Einmal-Impuls im Schwerpunkt),
  `drehsperre` nein (keine Drehdynamik); Lesefelder `amBoden`, `ruht` (schläft). `Fuehler` bekommt die Formen **`kapsel`** (Achse y des
  Teils, `radius`, `hoehe` gesamt) und **`netz`** (nur fest: Dreiecke der `Koerper`-Form am Teil bzw. das Höhenraster des `Gelaende`) –
  Wahl-Werte hinten angehängt, Hash-neutral. Kontakte nur zwischen Fühlern mit `ausloeser: nein`; ein fester Fühler ohne Schwung ist
  ein fester Körper (wie K-150). Für die Physik sind Kasten und Kapsel **gedreht**; Auslöser-Meldungen bleiben achsenparallel (K-150).
- **Löser:** Breitphase `fuehler::breitphase` auf 3D-Hüllen; Engphase Kugel/Kapsel geschlossen, Kasten über Trennachsen mit bis zu
  4 Kontaktpunkten, Netz über einen Hüllen-Baum je Form (einmal je Ressourcen-ID gebaut, Teilung nach Mittelpunkt in Indexreihenfolge,
  Cache als `Vec` nach ID, nicht im Hash), Gelände analytisch über die Zellen unter der Hülle. Kontakte sortiert nach (kleinere ID,
  größere ID, Merkmal), Warmstart aus einer verborgenen Spalte, **8** Impuls-Iterationen (Normale, zwei Reibungsrichtungen, Drehung),
  **4** Iterationen Positionskorrektur, abwechselnd vorwärts/rückwärts; semi-implizites Euler; Trägheit analytisch aus der Form.
  Drehung intern als Quaternion f64 (verborgene Spalten), geschrieben als `rollen`/`neigung`/`drehung`; setzt das Programm Lage oder
  Drehung, übernimmt Schwung sie (Vergleich mit den zuletzt geschriebenen Bits). Schlafen nach 0,5 s unter festen Schwellen, Inseln
  wecken sich bei Kontakt, Stoß oder Setzen. Kein Durchtunnel-Schutz (Doku-Tipp wie `Wucht`); Gelenke und Federn → später.
- **Schichten/Dateien:** neu `komponenten/schwung.rs`, `kollision3d.rs` (13.1 Regel 9); `fuehler.rs`, `gelaende.rs` (Höhen-Abfrage
  öffentlich, Komponenten-Dateien); `formen.rs` (Dreiecke einer Form lesen). Kein `paket.rs`, keine Glut.
- **Determinismus:** wie `Wucht`; nur `libm` (`sqrt`, `sin`, `cos`, `atan2`, `asin`), keine `HashMap`.
- **Tests:** `tests::hk17` (Fallhöhe, Stapel aus 10 Kisten ruht, Kugel rollt den Hang hinab, Kapsel auf Netz, Schlafen/Wecken,
  Drehsperre, ohne Schwung byte-gleich), Szene `schwung.herd` (klein, N = 500 Kisten, N = 2 000 Kugeln), Fall `herd-schwung.*`;
  **B11:** 500 Kisten Takt ≤ 2 ms nativ. **Beispiel:** `kistenturm` (Turm aus Pizzakartons auf einem Gelände, Klick wirft Teigkugeln).
- **Abnahme:** A-Kern. **K-Vorschlag:** K-162.

#### H-K18 Schatten für Punkt- und Spotlichter, Sonnen-Kaskaden (W9, Kern + Glut)
- **Ziel:** Unity Point/Spot Light Shadows (Schatten-Atlas) und Cascaded Shadow Maps.
- **Sprachfläche:** `Licht` bekommt Nachtragsfelder `schattenGuete` aus (`aus|grob|mittel|fein`; Punkt/Spot 256/512/1024 Texel je
  Würfelseite bzw. Kegel; `aus` = v1: nur die Sonne wirft Schatten), `schattenWeich` 1 (0 … 4, Zeltfilter-Radius in Texeln, auch
  Sonne), `kaskaden` 1 (1 … 4, nur Sonne; 1 = v1-Verfahren), `schattenWeite` 0 (Sonne: 0 = wie v1, sonst Reichweite der Kaskaden ab der
  Kamera). `schatten` bleibt der Hauptschalter, `Koerper.schatten` bestimmt die Werfer.
- **Budget** (**Entscheidung**): höchstens **8** schattenwerfende Punkt-/Spotlichter je Bild. Der Kern wählt: wirksam (Kugel bzw. Kegel
  schneidet das Kamera-Frustum), nach Abstand Kamera – Lichtrand, dann Teil-ID; Würfel = 6 Kacheln (90°-Perspektiven, keine Cube-Map →
  WebGL2), Spot = 1 Kachel; Tiefen-Atlas 4096² (umgesetzt als 4 Schichten à 2048², siehe Stand), Kachelvergabe im Kern
  (Regal-Packen nach Güte, dann Reihenfolge); was nicht passt, wirft still keinen Schatten. Sonne: Kaskaden als
  `texture_depth_2d_array` (2048² je Schicht; eine Schicht = heutiges Bild), praktische Teilung (λ = 0,75), kugelumschlossen und
  texelweise gerastet gegen Flimmern. Kein Schatten-Cache für ruhende Lichter in dieser Stufe (später).
- **Bildpaket** (additiv): Abschnitt `SCHATTENLICHTER` nur bei Nutzung (je Kachel Ansicht·Projektion, Atlas-Rechteck, Licht-Index; je
  Kaskade Matrix und Teilungstiefe); der Kern schneidet je Kachel die Werfer (Hülle gegen Kachel-Frustum) und schreibt sie als neuen
  `zug` (je Kachel und Netz-Art ein Draw-Call). Schattenwerfende Punkt-/Spotlichter erzwingen den `LICHTER`-Abschnitt auch bei ≤ 8
  Lichtern (der v1-Pfad über SZENE kennt keinen Kachel-Index).
- **Glut:** Atlas **ohne neue Einheit** (ersetzt die Shadow-Map an Bindung 2, Vergleichs-Sampler 3 geteilt), Würfelseite nach größter
  Achse, PCF-Zelt mit dem Vergleichs-Sampler, Normalen-Versatz gegen Akne; `licht.wgsl`, `schatten.wgsl`, `herd/glut/src`, `herd/glut-web`.
- **Schichten/Dateien:** Kern `komponenten/licht.rs`, `lichter.rs`, `paket.rs`; Glut wie oben; `herd/README.md` §4/§9.
- **Determinismus:** Auswahl, Packen, Matrizen im Kern (f64, `libm::tan`); Pixel K-129.
- **Tests:** `tests::hk18` (Auswahl stabil, Budget, ohne Nutzung byte-gleich), Szene `schatten.herd`, Referenzbilder
  `3d-punktschatten` (Würfel-Kacheln + Spot) und `3d-kaskaden`; **B12** (vergeben: **B13**): 8 Punktlichter mit Schatten + 1 000 Körper ≤ 120 Draw-Calls,
  60 fps EXE. **Beispiel:** `laternengasse` (Gasse bei Nacht mit 6 Laternen und 2 Spots, Taster schaltet auf Tag mit Kaskaden).
- **Abnahme:** A-Glut. **K-Vorschlag:** K-163 (geschrieben als **K-160**, nächste freie Nummer).
- **Stand (umgesetzt, §11.1):** wie oben, mit diesen **Entscheidungen**: (1) **Eine** Schatten-Tiefentextur (`texture_depth_2d_array`,
  Depth32Float, Schichten 2048²) an Bindung 2 statt Shadow-Map + Atlas: Schicht 0 = Sonne v1 bzw. die k Kaskaden (je eine Schicht), dahinter
  die Atlas-Seiten (4 × 2048² = 4096² Texel) – 2048 ist die WebGL2-Mindestgröße, der 2048er-Rückfall mit halben Kacheln entfällt; v1 bleibt
  eine Schicht (16 MB), Haupt-Layout bleibt 11/16. (2) Packen in **Morton-Reihenfolge** statt Regalen (Kanten absteigende Zweierpotenzen →
  lückenlos); ein Licht, dessen Kacheln nicht alle passen, wirft keinen Schatten. (3) Würfelseiten mit 12 Texeln Rand (halber Tangens
  vergrößert), Spots bis 60° eine Kachel, darüber ein Würfel; das Auge der Kacheln liegt ≈ 0,02 % der Reichweite schief neben dem Licht (Netz-Ecken genau in der Lichtebene ergäben w = 0, das rastert SwiftShader/WebGL2 falsch – gefunden mit E2E 13). (4) Matrizen und Plätze im Uniform-Block SCHATTENLICHTER (Bindung 18), der
  Schattendurchgang nimmt die Matrix je Zug über einen dynamischen Uniform-Versatz (Bindung 20, Schatten-Layout); der Platz eines Lichts
  steht in Bits 16 … 19 seines Zellen-Eintrags in LICHTER (kein neues Licht-Format). (5) `schattenWeich` w: derselbe Castaño-Zeltfilter
  mit Texel-Schritt w (0 = ein bilinearer Vergleich); Normalenversatz der Kacheln × (1 + w). (6) Kaskaden: Wahl der ersten Kaskade, deren
  Bild den Punkt mit Filterrand enthält (auch im Spiegeldurchgang richtig); Kugel-Radius auf 1/16 aufgerundet. (7) Werfer je Ansicht als
  Instanz-Kopien hinter `DURCH`, Zug `ANSICHT | a << 8` (zug 4). Ohne Nutzung: Paket, Hash und alle Referenzbilder byte- bzw. pixelgleich.
  Messung B13: 76 Draw-Calls (73 Schatten), Kern-Bild 0,42 ms nativ / 0,53 ms Wasm.

#### H-K19a `Klang.laden` – WAV und FLAC (W9, §9-Ausnahme)
- **Ziel:** Unity AudioClip-Import; baut auf H-K14 (`Klang`, `Spur`, Ereignisse, Wiedergabewege).
- **Sprachfläche:** `Klang.laden(pfad)` (statisch, auch ohne Herd, gleicher Pfad → dasselbe Objekt) → `Klang` wie aus `Klang.ton`
  (`spiele`, `dauer()`). Fehler: `LaufzeitAnanas: klaenge/x.mp3 ist kein lesbarer Klang (WAV oder FLAC).` · `… ist zu lang (12:30) –
  höchstens 10 Minuten.` · `PizzaFehler P0021: Die Klänge sind zusammen zu groß für den Ofen (70,2 MB vorgebacken, höchstens 64 MB).`
  (Interpreter und Compiler vor dem Start, wie P0020).
- **Formate** (**Entscheidung**): WAV (RIFF/WAVE inkl. `WAVE_FORMAT_EXTENSIBLE`; PCM 8/16/24/32 bit, IEEE-Float 32 bit) und FLAC (alle
  Teilrahmenarten, 4 … 24 bit, Kanal-Dekorrelation, CRC geprüft) – beide ganzzahlig dekodierbar und klein; OGG Vorbis folgt in H-K19b,
  Opus/MP3 später. Kanäle 1 … 2 (mehr → Fehler), Rate 8 000 … 96 000 Hz bleibt erhalten – **kein Umrechnen im Vorbacker**: die
  Wiedergabe (H-K14) rechnet auf die Geräterate um, Hörbares ist nicht Teil der Bitgleichheit. Ergebnis i16, Float mit fester Rundung.
- **Klangteig** (Magie `TEIGKLNG`, v1): Kopf (Rate, Kanäle, Abtastwerte, SHA-256 der Quelle), PCM i16 LE verschachtelt; FNV-1a-64 des
  PCM ist die `klang`-Kennung der Ereignisse wie bei der Synthese. Fehler-Klangteig mit fertigem Text (13.1 Regel 5).
- **Grenzen:** Quelle ≤ 16 MiB, Dauer ≤ 10 min, **Klangmenge** je Projekt ≤ 64 MiB (Summe der Klangteige verschiedener Quell-Hashes;
  eigene Grenze neben der Teigmenge, **Entscheidung**: Klänge liegen weder im Kern noch auf der GPU).
- **Schichten/Dateien:** `herd/teigling` (Modul `klang`, Signaturen `RIFF`/`fLaC`, gleicher Cache mit Schlüssel `klang/1`);
  **§9-Ausnahme:** `site/js/pizza/` (Klang.laden, Kiste-Weg), `laufzeit/` (Import, Datensegment), `site/js/pizzaiolo/` (Einbettung,
  P0021), `HOST-ABI.md`, `host/` (PCM aus dem pkarton an die Wiedergabe), `site/js/worker.js` + `ui/src/` (Dateibaum mit Abspielknopf,
  Klangmenge in der Projektleiste); SPEC (Klang-Abschnitt aus H-K14), PROJEKTE §5 (Absatz „Klänge“).
- **Determinismus:** ganzzahlig; Ereignisse wie H-K14, die PCM-Bytes gehen einmal je Klang als übertragener Puffer an die Wiedergabe,
  nie in die Ereignisliste.
- **Tests:** `cargo test` Vorbacker (Testklänge aus `scripts/klaenge-test.js` mit eigenem kleinem FLAC-Schreiber für alle
  Teilrahmenarten; jede Fehlerart), Fälle `klang-laden.*` + `.klang-erwartet` in Interpreter, Wasm, Differenz, Host; E2E mit
  `OfflineAudioContext`. **Beispiel:** `geraeuschkiste` (Taster spielen CC0-Geräusche aus Freesound, `quellen.md`).
- **Abnahme:** A-Lauf. **K-Vorschlag:** K-164.

#### H-K20 `Figur` und `Strahl` – Figur-Steuerung, Strahl- und Höhenabfrage (W9, Kern-only)
- **Ziel:** Unity CharacterController und `Physics.Raycast`; Höhenabfrage am `Gelaende`.
- **Sprachfläche:** `Figur` (3D, braucht `Fuehler`; Form `kapsel`, jede andere wird als Kapsel aus der Hülle genommen, kein Fehler):
  `laufX`, `laufZ` 0 (Wunschtempo in Weltachsen, Einheiten/s), `sprung` 0 (Einmal: Sprungtempo nach oben, nur am Boden, danach 0),
  `schwerkraft` 9.81 (**Entscheidung**, anders als `Wucht`/`Schwung`: eine Figur ohne Schwerkraft ist kein sinnvoller Standard),
  `stufe` 0.3 (Treppenhöhe), `hang` 45 (Grad, steiler rutscht), `haut` 0.02 (Abstand zu Wänden), `schieben` 0 (Impuls auf dynamische
  Schwung-Körper), `mitfahren` ja (bewegt sich mit kinematischen Böden); Lesefelder `amBoden`, `boden` (teil), `bodenHoehe`,
  `bodenNormaleX`/`Y`/`Z`, `tempoX`/`Y`/`Z` (tatsächlich), `anWand`, `anDecke`. Verfahren: Kapsel-Wischen gegen die Kollisionswelt aus
  H-K17 (feste und kinematische Fühler-Formen, Netze, Gelände, andere Figuren in ID-Reihenfolge), höchstens 4 Gleit-Schritte an Wänden,
  Stufe als Hoch-Vor-Runter-Versuch, am Boden kleben beim Abwärtsgehen (≤ `stufe`).
- `Strahl` (3D): `richtungX`/`Y`/`Z` 0/−1/0, `achsen` welt (`welt|teil`), `laenge` 1000, `maske` 4294967295, `ausloeser` nein (trifft
  auch Auslöser), `ausMaus` nein (ja: von der aktiven Kamera durch die Maus, H-K12). **Lesefelder beim Lesen berechnet** (13.1 Regel 6;
  gegen die Welt im Lesezeitpunkt, Zwischenergebnis bis zur nächsten Änderung): `getroffen` (teil oder `karton`), `abstand`,
  `punktX`/`Y`/`Z`, `normaleX`/`Y`/`Z`. Ziele sind Fühler-Formen (wach, sichtbar, Maske passt), das eigene Teil nicht; Gleichstand →
  kleinere ID. `Koerper` ohne Fühler trifft der Strahl nicht (**Entscheidung**: Ziele bestimmt der Fühler, wie bei der Physik).
  Höhenabfrage = Strahl nach unten: `Strahl lot = herd.raum(x, 500, z).mit(neu Strahl()); funghi h = lot.punktY();` – am Gelände mit
  `form: "netz"` exakt.
- **Schichten/Dateien:** neu `komponenten/figur.rs`, `strahl.rs`; `kollision3d.rs` (Wischen, Strahl); `lies` ggf. um Teil-Felder
  erweitert (`komponenten/mod.rs`, `abi.rs`; H-K12 berechnet nur Zahlen). Kein `paket.rs`.
- **Determinismus:** f64, feste Höchstzahl Schritte, `libm::sqrt`; Reihenfolge nach Teil-ID.
- **Tests:** `tests::hk20` (Treppe, Hang, Wandgleiten, Plattform mitfahren, Sprung; Strahl gegen jede Form, Gelände = analytische
  Höhe, `ausMaus`), Szene `figur.herd` (N = 100 Figuren im Gelände, 1 000 Strahlen), Fälle `herd-figur.*`, `herd-strahl.*`; **B13:**
  100 Figuren ≤ 0,5 ms, 1 000 Strahlen ≤ 1 ms je Takt nativ. **Beispiel:** `parkour` (Schulterperspektive mit Mausfang, Treppen, Hänge,
  fahrende Plattformen; Klick-Strahl markiert Ziele).
- **Abnahme:** A-Kern. **K-Vorschlag:** K-165.
- **Stand (umgesetzt, §11.1, K-165):** Typnummern 33/34. Abweichungen vom Plan: (1) das Wischen läuft in Teilschritten mit Herausschieben statt
  als geschlossene Kapsel-Wisch-Abfrage (deterministisch, nutzt `kollision3d::kontakte`; Tempo je Takt ≤ 8 Radien); (2) Hindernisse sind auch
  **dynamische** Schwung-Körper (wie Unity – sonst liefe die Figur durch Kisten), `schieben` stößt sie an; (3) das Gelände zählt für die Figur als
  Dreiecke (`kontakte_genau`), weil die Probepunkt-Ebene aus H-K17 am Hangfuß sprunghaft tiefe Überlappung meldet – `Schwung` bleibt dabei;
  (4) das Zwischenergebnis „bis zur nächsten Änderung“ braucht einen Änderungszähler: `Welt::stand`, hochgezählt von jedem schreibenden
  Kern-Aufruf (`abi.rs`: `w` zählt, `wl` für lesende), dazu `Welt::abfragen` (`welt.rs`) – beides nicht im Hash. Teil-Lesefelder (`boden`,
  `getroffen`) laufen schon über `hole_zahl`; `lies` brauchte keine Erweiterung, Interpreter/Laufzeit/Host bleiben unberührt.

#### H-K21 Spiegelbild vollständig (W10, Kern + Glut)
- **Ziel:** planare Spiegelung mit derselben Beleuchtung wie das Bild. **Heute** zeichnet der Spiegeldurchgang nur Himmel + FEST, mit
  den 8 Lichtern aus SZENE und ohne Schatten.
- **Sprachfläche:** `Stimmung.spiegelGuete` einfach (`einfach|voll`, Nachtragsfeld; `einfach` = heute, Referenzbild `3d-spiegel`
  unverändert). `voll`: alle Lichter über Cluster, Schatten (Sonne + H-K18), Durchsichtiges und Funken im Spiegel, volle Auflösung.
- **Kern:** `lichter.rs` schreibt bei `voll` und vorhandenem `LICHTER` eine zweite Zellen-Tabelle für die gespiegelte Kamera
  (dieselbe Lichterliste) als Abschnitt `LICHTER_SPIEGEL` – nur dann, sonst byte-gleich.
- **Glut:** Spiegeldurchgang über den Cluster-Pfad mit der zweiten Tabelle (hinter der ersten in `zellen_t`, keine neue Einheit),
  Schatten-Abtastung wie im Hauptdurchgang, DURCH- und `TEILCHEN3D`-Züge im Spiegel.
- **Schichten/Dateien:** Kern `lichter.rs`, `paket.rs`, `komponenten/stimmung.rs`; Glut `src/*`, `licht.wgsl`, `funken.wgsl`,
  `herd/glut-web`; `herd/README.md` §4/§9.
- **Tests:** `tests::hk21` (ohne `voll` byte-gleich; Spiegelzellen konservativ an Stichproben wie bei „viele Lichter“), Szene
  `spiegel.herd`, Referenzbild `3d-spiegel-voll` (64 Lichter, Spots mit Schatten, Funken über nassem Boden). **Beispiel:** `regenplatz`
  (Piazza im Regen mit 150 Neonlichtern im Spiegel). Danach Neon-Napoli aufrüsten (13.1 Regel 8).
- **Abnahme:** A-Glut. **K-Vorschlag:** Nachtrag K-163 (geschrieben als Nachtrag **K-160**).
- **Stand (umgesetzt, §11.1):** wie oben, mit diesen **Entscheidungen**: (1) `LICHTER_SPIEGEL` ist Abschnitt **21**: Kopf wie LICHTER
  (`vorn` mit negiertem y, `frei.x` = erstes Wort hinter der LICHTER-Tabelle), Wörter mit absoluten Versätzen; die Glut bindet den Kopf
  als zweiten Uniform-Puffer an Bindung 14 der Spiegel-Bindegruppe – keine Einheit, kein Layout-Eintrag (Wächter: Haupt-Layout 11/16).
  (2) Die Lichterliste führt bei voll auch Lichter, die nur den Spiegel berühren; Sichtprüfung der Körper/Teilchen und die Schattenwahl
  nehmen das gespiegelte Frustum dazu (ein Schild über dem Bildrand erscheint in der Pfütze). (3) Umlaufsinn: im Spiegeldurchgang zählt
  bei voll die echte Vorderseite (der einfache Spiegel beleuchtete Rückseiten; er bleibt so, damit `3d-spiegel` gleich bleibt); `DURCH`
  im Spiegel erst „vorn“, dann „hinten“. (4) **Eine Spiegelebene** (Prüfauftrag „mehrere Höhen?“): eine zweite Höhe kostete einen
  zweiten vollen Durchgang (Neon-Napoli: +44 % Glut-Zeit auf WARP schon für den einen); stattdessen Höhenfenster bei voll ±0,2 voll, aus
  ab 0,45, und von unten gesehene Oberseiten unter h + 0,5 werden im Spiegel verworfen – Gehweg-Pfützen (0,15) spiegeln die Straße
  dahinter, versetzt um 2 · 0,15. (5) Spiegelziel in voller Größe ohne MSAA; Teilchen und Durchsichtiges unter h + 0,03 verworfen.
  Messung: Neon-Napoli einfach/voll Kern je Bild 0,62/0,66 ms nativ, 1,11/1,20 ms Wasm; 39/41 Draw-Calls; `3d-spiegel-voll` 34.

#### H-K22 `Schall` – Raumklang (W10, §9-Ausnahme: neuer Feldtyp)
- **Ziel:** Unity AudioSource mit räumlichem Klang und AudioListener.
- **Sprachfläche:** neuer Feldtyp **`klang`** (Nummer 13, ein `Klang`-Objekt). `Schall` (beide): `klang` karton, `lautstaerke` 1,
  `schleife` ja, `spielt` ja (ja → nein stoppt, nein → ja startet von vorn), `nah` 1 (bis hier volle Lautstärke), `weite` 30 (ab hier
  stumm; dazwischen quadratisch fallend), `tonhoehe` 1 (0.25 … 4). Es hört die aktive Kamera (3D) bzw. die Mitte des aktiven Blicks
  oder Spielfelds (2D) (**Entscheidung**: kein eigener Hörer-Baustein). Doppler, Hall, Verdeckung → später.
- **Kern:** Nachlauf-System rechnet je Schall Lautstärke und Panorama (−1 … 1 aus der Richtung im Hörer-Raum), auf 1/1024 gerastet;
  Änderungen gegen den Vortakt sowie Start/Stopp ergeben je Bild ein **Klangbild** (neuer Kern-Export `klangbild(ptr, kap)` neben dem
  Bildpaket, nicht im Bildpaket). Die Laufzeiten machen daraus Ereignisse `{typ:"klang", art:"raum", spur, lautstaerke, panorama}`
  (in `.klang-erwartet`).
- **Schichten/Dateien:** neu `komponenten/schall.rs`; Kern `schema.rs` (Feldtyp), `abi.rs` (Export, Klang-Feld als Kennung), `kern-wasm`,
  `herd/skript*`. **§9-Ausnahme:** `site/js/pizza/herd/kern.js` (Feldtyp ↔ `Klang`), `laufzeit/src/herd.rs` (Feldtyp, Klangbild →
  Wiedergabe), `site/js/pizzaiolo/` (Feldtyp in der Klassenauflösung), `HOST-ABI.md`, `host/` (Lautstärke/Panorama in der Mischung),
  `site/js/worker.js` (WebAudio Gain/StereoPanner), `ui/src/` (Editor), SPEC §18.4.
- **Determinismus:** f64 mit `libm`, gerastete Werte; Hörbares nicht Teil der Bitgleichheit (K-153).
- **Tests:** `tests::hk22`, Fall `herd-schall.*` mit `.klang-erwartet`, Differenz, Host, E2E (`OfflineAudioContext`). **Beispiel:**
  `brunnenplatz` (plätschernder Brunnen in Schleife, der Bote läuft vorbei, Klang wandert von links nach rechts).
- **Abnahme:** A-Lauf. **K-Vorschlag:** K-166.

#### H-K23a `Puppe` – Animationen aus Modellen (W10, Kern-only)
- **Ziel:** Unity Animator/Animation: Clips abspielen und überblenden.
- **Sprachfläche:** `Puppe` (3D, an der Wurzel aus `herd.modell`): `folge` "" (Name aus `m.folgen()`; "" = Ruhelage), `tempo` 1,
  `schleife` ja, `zeit` 0 (setzbar = springen), `laeuft` ja, `blende` 0.2 (s; ein Wechsel von `folge` blendet über), Lesefelder `dauer`,
  `fertig`. **Gelenke sind Teile** (**Entscheidung**): die Knoten-Teile aus H-K16 – man hängt Dinge an die Hand (`haenge`,
  `finde("Hand.R")`). Die Puppe schreibt nur animierte Größen; Teile ohne Kanal behält das Programm in der Hand. Zuordnung Kanal → Teil
  über den **Knoten-Index** (verborgenes Feld am `Etikett`, von `herd.modell` gesetzt – glTF-Namen sind oft leer oder doppelt), nach
  `herd.modell`/`kopie()` durch einen Gang über den Teilbaum neu aufgebaut; `finde(name)` bleibt namensbasiert. Gehäutete Netze bleiben bis H-K23b in der
  Ruhelage starr (Doku). Ebenen/Masken, Clip-Ereignisse, Root Motion, IK → später.
- **Schichten/Dateien:** neu `komponenten/puppe.rs` (Takt); `ressourcen.rs` (Folgen-Daten der Modell-Ressource lesen). Kein
  `paket.rs`.
- **Determinismus:** Zeit als Summe von `DT`, Interpolation f64, Drehungen per Slerp mit `libm`.
- **Tests:** `tests::hk23a` (Stützstellen exakt, `STEP`, Schleife, Überblendung, Kopie unabhängig), Szene `puppe.herd` (100 Puppen à
  50 Gelenke), Fall `herd-puppe.*` (Testmodell mit Knoten-Animation); **B14:** 100 × 50 Gelenke ≤ 1,5 ms je Takt nativ.
  **Beispiel:** `spieluhr` (Modell mit Knoten-Animationen: Deckel, Walze, tanzende Figur; Taster wechselt die Folge).
- **Abnahme:** A-Kern. **K-Vorschlag:** Nachtrag K-161.

#### H-K19b `Klang.laden` – OGG Vorbis (W11, Vorbacker)
- **Ziel:** Kenney-Klänge (CC0) liegen als OGG vor.
- **Sprachfläche:** unverändert; Fehlertext „(WAV, FLAC oder OGG)“ steht im Fehler-Klangteig (13.1 Regel 5) – keine Laufzeit-Änderung.
- **Dekoder:** eigener Vorbis-I-Dekoder in `herd/teigling` (Ogg-Seiten mit CRC, Kopfpakete, Codebücher, Floor 1 – Floor 0 → Fehler,
  praktisch ungenutzt –, Residue 0/1/2, Kanal-Kopplung, inverse MDCT, Fenster, Überlappung). MDCT in f32 nur mit Grundrechenarten,
  Fenster- und Drehfaktor-Tabellen aus `libm`, keine FMA; Vorbild lewton (MIT/Apache) bzw. Tremor; kein Fremd-Crate (`no_std`).
  Ergebnis i16, Klangteig unverändert.
- **Schichten/Dateien:** `herd/teigling`, `ui/src/` (Endung `.ogg` im Dateibaum), PROJEKTE §5, SPEC-Fehlertext. Keine §9-Datei.
- **Tests:** `cargo test` mit 5 kurzen Kenney-OGG (CC0, `quellen.md` im Testordner): Hash nativ = `teigling.wasm`, Abgleich mit
  eingecheckten libvorbis-PCM (Abweichung ≤ 1 LSB); Fall `klang-ogg.*`. Kein Beispiel (hörbar, nicht sichtbar).
- **Abnahme:** A-Kern + `node herd/test-teigling.js` + E2E Dateibaum. **K-Vorschlag:** Nachtrag K-164.

#### H-K24 Bildschirmraum: Verdeckung (SSAO) und Spiegelung (SSR) (W11, Kern + Glut)
- **Ziel:** Unity SSAO und Screen Space Reflections.
- **Sprachfläche:** `Stimmung` Nachtragsfelder `verdeckung` 0 (0 … 2, 0 = aus), `verdeckungWeite` 0.5 (Radius in Welt-Einheiten),
  `bildspiegel` 0 (0 … 1, 0 = aus).
- **Bildpaket:** Abschnitt `BILDRAUM` (32 B) nur, wenn `verdeckung` oder `bildspiegel` > 0 (STIMMUNG bleibt 80 B).
- **Verfahren** (beide Backends gleich, **Entscheidung**: ein Weg): (1) **Vorlauf** ohne MSAA über FEST: Tiefe + Normale oktaedrisch
  (RGBA8) + Rauheit/Metall – nötig, weil WebGL2 MSAA-Tiefe nicht abtasten kann; (2) **SSAO** in halber Auflösung, 12 Abtastungen in der
  Halbkugel, Drehung aus Ganzzahl-Hash je Pixel (kein Geräte-Zufall), zweimal 1D bilateral weichgezeichnet; wirkt nur auf Umgebungs- und
  indirektes Licht (`fs_licht` liest sie, eine Einheit laut `herd/README.md` §9); (3) **SSR** nach dem undurchsichtigen Hauptdurchgang: Kopie der
  HDR-Farbe mit 5 Mip-Stufen, Vollbild-Durchgang mit Strahlmarsch im Sichtraum (höchstens 48 Schritte + 6 Halbierungen, Hash-Versatz),
  Rauheit wählt die Stufe, Fresnel; Fehltreffer und Bildrand fallen auf die planare Spiegelung (wenn `spiegelung`), sonst auf
  Himmelszelt/Umgebung zurück; additiv vor dem Durchsichtigen, Bloom danach. **WebGL2-Rückfall konkret:** derselbe Weg mit nicht-MSAA
  `DEPTH24`-Tiefe aus dem Vorlauf; ohne `EXT_color_buffer_float` (selten; dann ist auch `Stimmung` in Rgba8) fällt nur SSR still aus,
  planare Spiegelung und SSAO bleiben.
- **Schichten/Dateien:** Kern `komponenten/stimmung.rs`, `paket.rs`; Glut `src/*`, `licht.wgsl`, `nachbild.wgsl`, neu `bildraum.wgsl`,
  `herd/glut-web`; `herd/README.md` §4/§9.
- **Tests:** `tests::hk24` (ohne Nutzung byte-gleich), Referenzbilder `3d-verdeckung` (Gewölbe, Fässer) und `3d-bildspiegel`
  (polierter Boden, Säulen, Rückfall am Bildrand); **B15:** SSAO + SSR ≤ 2 ms bei 1280 × 720 auf der Entwickler-GPU
  (`--herd-messung`; WARP nur Korrektheit). **Beispiel:** `pizzakeller`.
- **Abnahme:** A-Glut. **K-Vorschlag:** Nachtrag K-163.

#### H-K25 Funken-Aufprall (W11, Kern-only)
- **Ziel:** Collision-Modul und Sub-Emitter des Unity Particle System.
- **Sprachfläche:** `Funken` Nachtragsfelder `aufprall` keiner (`keiner|ebene|welt`; ebene = waagerecht auf `aufprallHoehe`, welt =
  Gelände und feste Fühler-Formen über `kollision3d`, Teilchen als Strahl über seinen Weg im Takt), `aufprallHoehe` 0, `abprall` 0.3,
  `nachAufprall` abprallen (`abprallen|vergehen|liegen`), `spritzer` karton (teil: ein Funken-Emitter, der je Aufprall
  `spritzerAnzahl` Teilchen am Aufprallpunkt ausstößt; höchstens 1 000 je Takt und Emitter), `spritzerAnzahl` 3. Was Regen (laufend)
  schon kann, wird nicht doppelt gebaut – nach dessen Merge abgleichen.
- **Schichten/Dateien:** `komponenten/funken.rs` (Komponenten-Datei), `kollision3d.rs` (Strahl-Bündel). `TEILCHEN3D` unverändert.
- **Determinismus:** Teilchen in Index-Reihenfolge, Kern-Zufall. **Tests:** `tests::hk25`, Szene `aufprall.herd`, Fall
  `herd-funken-aufprall.*`; **B16:** 20 000 Teilchen gegen Ebene ≤ 0,5 ms, 10 000 gegen Gelände ≤ 2 ms je Takt nativ. **Beispiel:**
  `funkenschlag` (Funken springen über Hügel, Tropfen spritzen auf Steinen).
- **Abnahme:** A-Kern.

#### H-K26 Belag-Karten – Normal-, Stoff-, Leucht-Karte, Ausschnitt, beidseitig (W12, Kern + Glut)
- **Ziel:** Unity Lit-Material vollständig, damit glTF-PBR stimmt.
- **Sprachfläche:** `Belag` Nachtragsfelder `normalKarte` (bildchen, Tangentenraum wie glTF), `normalStaerke` 1, `stoffKarte` (bildchen:
  R Verdeckung, G Rauheit, B Metall wie glTF, multipliziert mit `glanz`/`metall`), `leuchtKarte` (bildchen), `leuchtFarbe` weiss (wirkt
  nur mit `leuchtKarte`; ohne Karte bleibt v1 = Grundfarbe · `leuchten`), `schwelle` 0 (Ausschnitt: Deckkraft darunter verworfen, darüber
  deckend; 0 = aus, gilt auch im Schatten), `beidseitig` nein (Rückseiten mit gedrehter Normale, Schatten ohne Rückseiten-Culling).
  Karten nur am `Belag`, nicht am `Koerper` (**Entscheidung**). Tangenten aus Ableitungen (13.1 Regel 2); Abweichung zu MikkTSpace nur
  bei starker UV-Verzerrung (Doku).
- **Bildpaket:** Abschnitt `KARTEN3D` (16 B je Instanz in INST3D-Reihenfolge: drei Bild-Kennwörter wie das Relief, Schwelle,
  Merkmale) nur bei Nutzung, vierter Instanzpuffer (Nullen ohne Abschnitt); beidseitige Instanzen in eigenem `zug` (Pipeline ohne
  Culling). Bilder aus den PD3-Klassen – keine neue Einheit.
- **Modell-Abbildung** (Nachtrag H-K16): Normal-, Stoff-, Leucht-Bild, `emissiveFactor` → `leuchtFarbe`, `alphaCutoff` → `schwelle`,
  `doubleSided` → `beidseitig`.
- **Schichten/Dateien:** Kern `komponenten/belag.rs`, `koerper.rs`, `paket.rs`, `ressourcen.rs`; Glut `src/*`, `licht.wgsl`,
  `schatten.wgsl`, `herd/glut-web`; `herd/README.md` §4/§9.
- **Tests:** `tests::hk26` (ohne Nutzung byte-gleich), Referenzbild `3d-karten` (alle Karten, Laub mit Schwelle beidseitig), Fall
  `herd-belag-karten.*`, Modell-Fall mit Karten. **Beispiel:** `werkstatt` (ein Poly-Haven-Modell in 1k mit allen Karten, CC0).
- **Abnahme:** A-Glut. **K-Vorschlag:** Nachtrag K-161.

#### H-K23b Haut – Skinning (W13, Kern + Glut)
- **Ziel:** Unity SkinnedMeshRenderer.
- **Sprachfläche:** keine – ein `Koerper` mit Haut-Netz verformt sich nach den Gelenk-Teilen seiner Puppe.
- **Kern:** je Bild die Gelenkmatrizen (Welt-Matrix des Gelenk-Teils × inverse Bindematrix, relativ zum Körper-Teil) in f64, im Paket
  f32. Hülle fürs Culling aus den Gelenk-Teilen + Ruhelage-Radius (konservativ); `trifft` und Fühler `auto` behalten die Ruhelage-Hülle
  (**Entscheidung**, Doku). Bildpaket: Ressourcen-Abschnitt `HAUT` (je Netz und Ecke 4 × u16 Gelenk + 4 × u16 Gewicht, einmal) und je
  Bild Abschnitt `GELENKE` (Palette 3 × vec4 je Gelenk, je gehäuteter Instanz ein Versatz); gehäutete Instanzen in eigenem `zug`,
  instanziert je (Netz, Belag) mit Versatz im Instanzpuffer. ≤ 256 Gelenke je Haut, ≤ 65 536 Gelenke je Bild.
- **Glut:** zweiter Vertex-Strom nur für Haut-Pipelines, Palette als RGBA32F-Textur im Vertex-Shader (`textureLoad`; **eine** Einheit im
  Haupt- und im Schatten-Layout – Vertex-Texturen haben unter wgpu-GL keinen eigenen Pool, `herd/README.md` §9), Haut auch im Schatten- und
  Spiegeldurchgang und im Bildraum-Vorlauf.
- **Schichten/Dateien:** Kern `komponenten/koerper.rs`, `puppe.rs`, `paket.rs`, `ressourcen.rs`; Glut `src/*`, `licht.wgsl`,
  `schatten.wgsl`, `herd/glut-web`; `herd/README.md` §4/§9.
- **Tests:** `tests::hk23b` (Gelenkmatrizen bitgleich, ohne Haut byte-gleich), Szene `haut.herd` (100 gehäutete Figuren; Kern-Bild
  ≤ 1 ms nativ, B14), Referenzbild `3d-haut` (Testfigur in drei Posen). **Beispiel:** `tanzfiguren` (CC0-Figuren von Quaternius bzw.
  Kenney laufen, winken, tanzen; Taster wechseln mit Überblendung).
- **Abnahme:** A-Glut. **K-Vorschlag:** Nachtrag K-161.

#### H-K27 `Wind` und `Streu` – Gras, Kleinzeug, Vertex-Animation (W14, Kern + Glut)
- **Ziel:** Unity Terrain-Details (Gras), WindZone und Instancing großer Mengen (Steine, Blumen, Abfall).
- **Sprachfläche:** `Wind` (3D; es gilt der wache mit der kleinsten ID): `staerke` 0 (0 … 5), `richtungX` 1, `richtungZ` 0, `boeen` 0.3
  (0 … 1), `tempo` 1. `Belag.wiegen` 0 (Nachtragsfeld, 0 … 1): Ausschlag der Ecken im Vertex-Shader, quadratisch mit der Höhe über dem
  Netz-Ursprung, Phase aus der Weltlage der Instanz, Böen aus Wertrauschen (Ganzzahl-Hash), Zeit aus der Bildnummer. Rein sichtbar –
  Kollision und Hüllen unverändert (**Entscheidung**). `Streu` (3D): `form`, `belag` karton (teil), `anzahl` 1000 (≤ 200 000), `breite`
  20, `tiefe` 20 (Rechteck um die Lage), `gelaende` karton (teil: Höhe aufs Gelände, Punkte an Hängen über `hang` entfallen), `hang` 40,
  `groesse` 1, `groesseStreuung` 0.3, `drehen` ja, `dichte` karton (bildchen: Helligkeit = Wahrscheinlichkeit), `sichtweite` 60
  (ab der Hälfte ausgedünnt), `schatten` nein, `saat` 0. Streu-Instanzen haben keine Kollision (**Entscheidung**).
- **Kern:** Punkte aus dem Kern-Zufall, neu nur bei geänderten Feldern (Prüfwert wie `Gelaende`), in Zellen von 8 × 8 Einheiten.
  Bildpaket: Ressourcen-Abschnitt `STREU` (einmal je Erzeugung: je Zelle Instanzen à 32 B) und je Bild Abschnitt `STREU3D` (sichtbare
  Zellen nach Frustum und `sichtweite`, Ausdünnung je Zelle) – nie die Instanzen je Bild (100 000 × 72 B wären zu viel); `WIND` als
  kleiner Uniform-Abschnitt.
- **Glut:** Streu-Instanzpuffer als Ressource, ein Draw-Call je sichtbarem Zellenlauf (Pufferversatz statt `base_instance`, das WebGL2
  nicht kann), Wiegen im Vertex-Shader von `licht.wgsl` und `schatten.wgsl`.
- **Schichten/Dateien:** neu `komponenten/wind.rs`, `streu.rs`; `belag.rs`, `paket.rs`; Glut `src/*`, `licht.wgsl`, `schatten.wgsl`,
  `herd/glut-web`; `herd/README.md` §4/§9.
- **Tests:** `tests::hk27` (Punkte bitgleich, ohne Nutzung byte-gleich), Szene `streu.herd` (klein, N = 100 000), Referenzbild
  `3d-streu`, Fall `herd-streu.*`; **B17:** 100 000 Halme ≤ 64 Draw-Calls, 60 fps EXE, Kern-Bild ≤ 0,2 ms. **Beispiel:** `wiese`
  (Hügel mit 50 000 Grashalmen, Blumen, Steinen in Böen; der Bote läuft als `Figur`).
- **Abnahme:** A-Glut.

#### H-K28 `Wasser` (W15, Kern + Glut)
- **Ziel:** Wasserflächen mit Wellen, Spiegelung, Brechung, Tiefenfärbung und Schaum; Auftrieb für `Schwung`. Pfützen bleiben Sache
  von `Belag.nass` und Regen (**Entscheidung**: kein eigenes Pfützen-Objekt).
- **Sprachfläche:** `Wasser` (3D, waagerechtes Rechteck um die Lage): `breite` 50, `tiefe` 50, `farbe` wasser, `tiefenFarbe` `#0b2a3a`,
  `klarheit` 2 (Sichttiefe), `wellen` 0.2 (Höhe), `wellenLaenge` 6, `wellenTempo` 1 (Richtung aus `Wind`, sonst +x), `schaum` 0.3,
  `brechung` 0.03. `Schwung.auftrieb` 0 (Nachtragsfeld, 0 … 2: Anteil der Gewichtskraft bei voller Eintauchung, mit Strömungs-
  dämpfung). `Figur` und `Strahl` sehen Wasser nicht als Boden (Schwimmen → später).
- **Kern:** 4 Gerstner-Wellen aus den Feldern (feste Streuung der Richtungen), dieselbe Formel f64 mit `libm` für den Auftrieb
  (Eintauchtiefe an 5 Messpunkten der Hülle, im Schwung-Takt); Abschnitt `WASSER` (je Fläche 64 B) und eigener `zug` nach FEST vor
  DURCH, nur bei Nutzung.
- **Glut:** Gerstner im Vertex-Shader, Normalen analytisch + Detail-Rauschen, Brechung und Tiefe aus der Szenenfarbe- und Tiefen-Kopie
  von H-K24 (ohne Bildraum-Effekte macht der Wasser-Zug eine eigene Kopie; beide in einem **eigenen Layout** `wasser`, nicht im
  Haupt-Layout – `herd/README.md` §9), Spiegelung planar oder SSR,
  sonst Himmel; Schaum an der Uferlinie (Tiefendifferenz) und auf Wellenkämmen.
- **Schichten/Dateien:** neu `komponenten/wasser.rs`; `schwung.rs`, `kollision3d.rs`, `paket.rs`; Glut `src/*`, neu `wasser.wgsl`,
  `herd/glut-web`; `herd/README.md` §4/§9.
- **Tests:** `tests::hk28` (Kiste schwimmt in Ruhe auf berechneter Höhe, ohne Wasser byte-gleich), Szene `wasser.herd`, Referenzbild
  `3d-wasser`, Fall `herd-wasser.*`. **Beispiel:** `hafen` (Hafenbecken am Abend, Boote und Kisten schaukeln, Laternen spiegeln sich).
- **Abnahme:** A-Glut. **K-Vorschlag:** Nachtrag K-162.

**Doku je Stufe** wie §12.1 Regel 11: SPEC §18.6-Zeile(n) (§18.4/§18.5 bei neuer Sprache: H-K16, H-K22), Absatz + Tabellenzeile in
`site/js/doku/40-herd.js` (`herd-ausbau`), `herd/README.md` (§2; §3 bei ABI: H-K16, H-K22; §4 bei Bildpaket; §9 bei Glut), Zeile in
§11.1, Messung in `bench/herd/ERGEBNISSE.md` (B11 … B17), Hinweis in `CHANGELOG.md` beim Bündel-Push; PROJEKTE §5 für H-K16 und H-K19a/b.

### 13.4 Vorgeschlagene K-Einträge

Nur Vorschlag – geschrieben werden sie in `KLAERUNGEN.md` mit der jeweiligen Stufe (Nummer vorher erneut prüfen, 13.1 Regel 1).

| Nr | Titel | Inhalt | mit |
|---|---|---|---|
| K-160 | Herd-Ausbau II: Stufenplan §13 | kein Format-Bruch (Zusatz-Ströme statt VERSION 2), Bindungs-Budget + Wächter, Vorbacker-Determinismus für Modelle/Klänge, Abfragen als berechnete Lesefelder, CC0-Assets mit `quellen.md` | H-K15 |
| K-161 | Modelle (glTF) | `Modell.laden`, `herd.modell`, `Etikett`/`finde`, glTF-Untermenge, Modellteig, Grenzen, Teigmenge; Nachträge Puppe/Gelenke als Teile (H-K23a), Haut (H-K23b), Karten (H-K26) | H-K16 |
| K-162 | 3D-Physik `Schwung` | Formen `kapsel`/`netz`, feste Iterationen, Schlafen, Schwerkraft 0; Nachtrag Auftrieb (H-K28) | H-K17 |
| K-163 → **K-160** (geschrieben) | Schatten- und Spiegel-Budget | 8 Punkt-/Spot-Werfer, Atlas, Kaskaden, Auswahlregel, Bindungs-Planung; Nachträge `spiegelGuete` (H-K21), Bildraum-Vorlauf (H-K24) | H-K18 |
| K-164 | Klänge aus Dateien | WAV/FLAC (H-K19a), Vorbis (H-K19b), kein Umrechnen im Vorbacker, Klangteig, Klangmenge P0021 | H-K19a |
| K-165 | `Figur` und `Strahl` | Schwerkraft 9.81, Stufe/Hang, Strahl-Lesefelder beim Lesen berechnet, Ziele nur Fühler | H-K20 |
| K-166 | Raumklang `Schall`, Feldtyp `klang` | Hörer = aktive Kamera/Blick, Klangbild neben dem Bildpaket, gerastete Werte | H-K22 |

### 13.5 Entscheidungen (Überblick)

- Kein Bildpaket-Format-Bruch; Haut als Zusatz-Strom, Tangenten aus Ableitungen, Vertex-Farben als Paletten-Bild (13.1 Regel 2).
- H-K15 vor jeder weiteren Textur-Stufe; neue Karten über die PD3-Klassen ohne neue Einheit; Bindungswächter blockierend.
- Abfragen (Höhe, Strahl) als berechnete Lesefelder statt Methoden mit Argumenten; generisches Abfrage-ABI später.
- Nur glTF 2.0 (`.glb`, `.gltf`), ohne Draco/meshopt/KTX2/Morph-Ziele; FBX/OBJ nur über Umwandeln; 1 Meter = 1 Einheit,
  Vorderseite +z; Scherung aus `matrix`-Knoten geht verloren.
- Modelle zählen zur Teigmenge (64 MiB); Klänge haben eine eigene Klangmenge (64 MiB, P0021).
- Geteilte Beläge je Modell unter einer ruhenden Vorlage; Lichter aus `KHR_lights_punctual` werden `Licht`-Teile.
- Knotennamen als Komponente `Etikett` + `teil.finde(name)`; Gelenke sind Teile (Anhängen an Hände); Animationen zielen über den
  Knoten-Index, nicht über Namen.
- `Schwung` (3D) neben `Wucht` (2D) statt einer gemeinsamen Komponente; Kollider bleiben `Fuehler` (neu `kapsel`, `netz`);
  Schwerkraft-Standard 0 wie `Wucht`, bei `Figur` 9.81.
- Strahl trifft nur Fühler-Formen (wie die Physik), nicht `Koerper` ohne Fühler.
- Punkt-/Spotschatten opt-in (`schattenGuete`), höchstens 8 je Bild, Auswahl im Kern; Würfel als Atlas-Kacheln (keine Cube-Map).
- Spiegelbild „voll“ opt-in (`spiegelGuete`), damit `3d-spiegel` und bestehende Pakete gleich bleiben; eine Spiegelebene für alles
  (Gehwege über ein breiteres Höhenfenster statt eines zweiten Durchgangs), Spiegel-Zellen ohne neue Einheit.
- SSAO/SSR mit eigenem Vorlauf auf allen Backends; WebGL2 ohne Float-Farbpuffer verliert nur SSR.
- Klänge: WAV + FLAC zuerst, Vorbis als eigene Vorbacker-Stufe, Opus/MP3 später; Rate bleibt, die Wiedergabe rechnet um.
- Raumklang hört an der aktiven Kamera bzw. am Blick; kein Hörer-Baustein, kein Doppler.
- Gehäutete Netze: Culling-Hülle aus den Gelenken, `trifft`/Fühler mit der Ruhelage-Hülle.
- Streu und Wind rein sichtbar (keine Kollision); Streu-Instanzen als Ressource, je Bild nur sichtbare Zellen.
- Kein Pfützen-Objekt (Pfützen = `Belag.nass` + Regen); `Wasser` mit Auftrieb, aber ohne Schwimmen.
- Assets nur CC0 mit `quellen.md`; Testdaten aus Skripten; Neon-Napoli wird nach Wellen bewusst aufgerüstet.

### 13.6 Später (nicht in diesem Plan)

- **Szenenzustand speichern/laden:** ein Kern-Schnappschuss wäre halb – der Zustand der Kniffe lebt in den Laufzeiten, und Schreiben
  braucht die Vorratskammer (§9). Spielstände bleiben eigene Werte über die Vorratskammer (SPEC §15.4).
- **Abziehbilder (Decals):** über den Cluster-Weg und die PD3-Klassen später billig, aber kein Plan-Beispiel braucht sie.
- Navigation (NavMesh/Wegsuche), LOD und Verdeckungs-Culling, Gelenke/Federn/Fahrzeuge in der Physik, Stoff und Fahnen,
  Morph-Ziele, Animations-Ebenen/Masken, IK, Root Motion, Clip-Ereignisse, Schatten-Cache für ruhende Lichter, Reflexionsproben,
  vorberechnete Beleuchtung (Lightmaps/GI), Gelände-Texturmischung und Eckfarben, Opus/MP3 und Musik-Streaming, Doppler/Hall/Verdeckung,
  generisches Abfrage-ABI, GPU-Kompression (PROJEKTE §5.7), eigene Shader, Editor/Szenenansicht, Netzwerk, Theke und Herd zugleich
  (K-133). Jede davon wird vor Beginn als eigene Stufe in §13 nachgetragen (Format-Brüche ausdrücklich markieren).
