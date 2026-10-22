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
und testbar. **Verbindlich** sind Sprache und Verhalten in **`SPEC.md` §18** (Klärungen K-128 … K-136); dieses Dokument begründet,
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
  SDF-Text; 3D: Lambert + Blinn-Phong, Eigenleuchten, Textur, bis 8 Punktlichter, Sonnenschatten mit PCF (Zeltfilter), Nebel, Himmelsverlauf nach Blickrichtung;
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
- **Takt:** `takt()` lässt alle Systeme in Registry-Reihenfolge laufen (`dt = 1/60`). **Bild:** Welt-Matrizen (nur für geänderte
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
  braucht **keine** Änderung an `pizza.js`, `laufzeit/`, Compiler, HOST-ABI oder Host.
- Typen der Felder: `zahl` (f64), `ganz`, `diavolo`, `text`, `farbe` (Text → RGBA im Kern), `teil`, `form`, `bildchen`,
  `bildchen-liste`. Komponenten, die das Programm nur anlegt und konfiguriert, kosten pro Takt **keinen** Grenzübergang.

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
| Hilfen | `Herd.farbe(r, g, b, a = 1)` → `"#rrggbbaa"` |

**Komponenten v1:** `Lage` (immer da; per Teil-Methoden), `Rechteck`, `Kreis`, `Text`, `Bild` (2D) · `Koerper`, `Licht`, `Kamera` (3D) ·
`Bewegung` (beide: Tempo, Drehtempo, Beschleunigung), `Animation` (2D: Bildchen-Folge), `Partikel` (2D: Emitter). Die Fabriken
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
- **Eingabe als Zustand** je Takt (`tasten`, `maus`, `knoepfe` im `takt`-Ereignis; fehlende Felder unverändert): `taste` gehalten,
  `gedrueckt`/`losgelassen`/`klick` nur im ersten Takt eines Ereignisses. Tastennamen wie `Tastatur` (K-110).
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
Browser mit derselben Statistik in der Statusleiste und als E2E-Messlauf (echte GPU, unsichtbares Fenster). **Vorher/nachher:** Die erste
lauffähige Glut zeichnet bewusst ohne Instancing/Atlas (ein Draw-Call je Objekt) = Grundlinie; danach Instancing, Atlas, Culling,
Teilbaum-Matrizen – beide Messreihen in `bench/herd/ERGEBNISSE.md`.

**Grenzübergang:** Numerische Direktaufrufe (Browser: Import des Programm-Wasm direkt an den Export von `kern.wasm` gebunden, ohne
JS dazwischen; nativ: wasmi-Hostfunktion → Kern) sind der billigste Weg; Texte werden kopiert (selten). Batching der Setter kommt nur,
wenn B2 die Ziele verfehlt (dann als zusätzlicher Import `setze_zahlen(puffer)`, ABI-additiv).

## 7. Plattformen

### 7.1 Nativ (K-130)
- Programm-Thread: wasmi + Kern (Bibliothek); Hauptthread: winit-Ereignisschleife + Glut. Pro Bild wandert das Bildpaket über einen
  Kanal; Takte werden im Hauptthread nach dem Präsentieren angefordert (vsync).
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
  zeichnet im `requestAnimationFrame` und schreibt den nächsten `takt` samt Eingabe in den SAB des Programm-Workers. Eingaben fängt die
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
5. Fertig – in pizza sofort verfügbar: `Pendel p = teil.mit(neu Pendel(weite: 40)); p.setzeTempo(2); teil.pendel().weite();`

**Nicht** anzufassen: `site/js/pizza.js`, `laufzeit/`, `site/js/pizzaiolo/`, `HOST-ABI.md`, `host/` (Ausnahmen nur für neue
Feld-**Typen**, neue Eingabearten oder neue Fenster-Fähigkeiten – das sind Kern-Erweiterungen, keine Komponenten).

## 10. Roadmap (an Unity orientiert)

| Unity-Konzept | Herd | Stufe | Schicht |
|---|---|---|---|
| Scene, GameObject | Welt, `Teil` | **v1** | Kern |
| Components | Komponenten-Registry, generische Sprachabbildung | **v1** | Kern/Komponenten |
| Transform + Hierarchie | `Lage`, `haenge`, Welt-Matrizen | **v1** | Kern |
| Time / Update-Schleife | fester 60-Hz-Takt, `backe(fn)`, Systeme | **v1** | Kern |
| Input | Tastatur, Maus, Touch als Zustand | **v1** | Laufzeit/Kern |
| Camera | `Kamera` (3D perspektivisch), Spielfeld-2D | **v1** · 2D-Kamera (Scroll/Zoom), Folgekamera **H-K1** | Komponente |
| Light | Sonne mit Schatten, 8 Punktlichter, Umgebung, Nebel | **v1** · Spot-Licht, mehrere Schatten **später** | Komponente + Glut |
| MeshRenderer, Material | `Koerper` (Form + Farbe/Glanz/Leuchten/Bild) | **v1** · geteiltes `Material`-Objekt **H-K2** | Komponente |
| Shader | feste Shader | eigene Shader (WGSL) **später** | Glut |
| Sprites / 2D | `Rechteck`, `Kreis`, `Text`, `Bild`, Atlas | **v1** · Linie/Vieleck, 9-Slice **H-K3** | Komponente + Glut |
| Animation | `Animation` (Bildchen-Folge) | **v1** · Tweens/Keyframes **H-K4** · Skelett **später** | Komponente |
| Particle System | `Partikel` 2D | **v1** · 3D-Partikel **H-K5** | Komponente + Glut |
| Collider / Trigger | `trifft` (Hüllen) | **v1** · `Kollider` + Ereignisse (betreten/verlassen) **H-K6** | Komponente |
| Physics 2D / 3D | – | 2D-Physik (Rigidbody, Impulse) **H-K7** · 3D **später** | Komponente (System) |
| Prefabs / Assets | `kopie()`, Formen/Bildchen | **v1** (kopie) · Vorlagen + größere Bilder **H-K8** | Kern |
| Szenenwechsel | – | `Szene`-Objekte, laden/leeren **H-K9** | Kern |
| Tilemap | – | `Kachelkarte` **H-K10** | Komponente |
| Gelände / Skybox | Himmelsverlauf | Gelände aus Höhenkarte, Skybox **H-K11** | Komponente + Glut |
| UI (uGUI) | Text, Rechteck | Herd-UI-Bausteine (Knopf, Leiste, Fenster) **H-K12** | Komponente |
| Skript-Komponenten (MonoBehaviour) | Spiellogik in `backe` | eigene pizza-Klassen als Komponente (`takt()`) **H-K13** | Laufzeit + Kern |
| Audio | – (K-135) | `klang` **H-K14** | eigene Importgruppe |
| Post-Processing | – | Bloom, Vignette **später** | Glut |
| Editor | – | Szenenansicht im Playground **später** | UI |

## 11. Pakete v1

| Paket | Inhalt | Dateien | hängt ab von |
|---|---|---|---|
| **H0 Konzept** | diese Datei, SPEC §18, K-128 … K-136 | `HERD.md`, `SPEC.md`, `KLAERUNGEN.md` | – |
| **H1 Kern** | Welt, Registry, Schema, Komponenten v1, Systeme, Bildpaket-Format, Herd-ABI (C-artige Exporte), `kern.wasm`, `schema.json`, Determinismus-Test, Kern-Benchmarks | `herd/kern/**`, `herd/README.md`, `site/js/herd/kern.wasm`, `site/js/herd/schema.json` | H0 |
| **H2 Glut** | wgpu-Backend nativ (offscreen + Fenster-API) und Web (wasm-bindgen, WebGPU/WebGL2), Shader, Instancing, Atlas, Schatten, Grundlinie + Optimierung, Referenzbilder | `herd/glut/**`, `site/js/herd/glut*` | H1 (Bildpaket-Format) |
| **H3 Interpreter** | `Herd`/`Teil`/Komponenten generisch aus `schema.json`, Aufrufe an `kern.wasm`, Spielschleife, Eingabe, Tests, Prüfstand | `site/js/pizza.js`, `tests/**`, `pruefstand/` | H1 |
| **H4 Wasm** | Compiler/Laufzeit: Importgruppe `herd` (generische Importe), Differenztests | `laufzeit/**`, `site/js/pizzaiolo/**`, `HOST-ABI.md` | H1, H3 |
| **H5 Nativ** | Host: Kern + Glut + winit, Offscreen, CLI, Starter, PE-Subsystem, Docker, Größe, `--herd-messung` | `host/**`, `Dockerfile` | H2, H4 |
| **H6 Browser** | Programm-Worker + `kern.wasm`, Render-Worker + Glut, Vorschaufenster, App-Link, Editor-Vervollständigung | `site/js/herd/**`, `site/js/worker.js`, `ui/**` | H2, H3 (H4) |
| **H7 Spiele, Doku, Messung** | 2D-Spiel, 3D-Spiel (Fokus schöne Grafik), Doku-Abschnitt mit Bildern, `bench/herd` + Ergebnisse, E2E, CI | `site/beispiele/herd*`, `site/js/doku/`, `bench/herd/`, `e2e/` | H5, H6 |

Nächste Stufen (einzeln vergebbar): **H-K1 … H-K14** aus der Roadmap; jede ist eine Komponente nach Abschnitt 9 (Ausnahmen markiert:
H-K13 braucht Laufzeit-Unterstützung für Rückrufe aus Systemen, H-K14 eine eigene Importgruppe).
