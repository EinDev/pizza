# Herd – Kern, Bildpaket, ABI

Konzept und Vertrag: `HERD.md` (Schichten, Leistung, Roadmap) und `SPEC.md` §18 (Sprache). Diese Datei beschreibt die
Umsetzung im Ordner `herd/`: Aufbau, Komponenten-Registry, **Herd-ABI**, **Bildpaket-Format v1**, Schema, Bauen, Tests.

## 1. Aufbau

| Crate | Inhalt |
|---|---|
| `kern/` (`herd-kern`, `no_std` + `alloc` + `libm`) | Welt (Teile, Lage, Hierarchie), Komponenten-Registry, Systeme, Ressourcen (Formen, Bildchen-Atlas, Schrift), Bildpaket, Hashes, ABI (`Kern`) |
| `kern-wasm/` | Wasm-Hülle: exportiert jede `Kern`-Methode unter gleichem Namen, keine Importe, eigener Allocator. Nur für `wasm32v1-none` |
| `glut/` (`herd-glut`, wgpu) | **Glut** (Schicht 1, §9): zeichnet Bildpakete offscreen (Software-Adapter) oder in ein Fenster (API für H5); Shader in `glut/shader/` |
| `glut-web/` (`herd-glut-web`) | Browser-Glut (H6): wasm-bindgen-Hülle `GlutWeb` um `herd-glut` für `wasm32-unknown-unknown` (kein default-member) |
| `skript/` (`herd-skript`) | Szenen-Skripte (§7.1) nativ abspielen: Zeilen für den Determinismus-Test, Zeiten (`--mess`); Bibliothek für `herd-bild` |
| `werkzeug/` (`herd-bild`) | Schriftatlas erzeugen, Szenen-Skripte rendern (PNG), Glut-Messung |
| `skript.js`, `test-kern.js` | JS-Spieler der Szenen-Skripte gegen `kern.wasm`; Determinismus-Test nativ = Wasm |
| `teigling/` (`herd-teigling`, `no_std` + `alloc`, nur `miniz_oxide`) | **Vorbacker** (§11, PROJEKTE.md §5.3): PNG/JPEG → Teigling (RGBA8 + Mipmaps), nur Ganzzahlen; Testbild-Erzeuger und Werkzeug `herd-teigling` hinter Feature `testbilder` |
| `teigling/wasm/` (`herd-teigling-wasm`) | Wasm-Hülle `site/js/herd/teigling.wasm` (keine Importe, eigener Allocator). Nur für `wasm32v1-none` |
| `test-teigling.js` | Bitgleich-Test Vorbacker nativ = `teigling.wasm` = `teigling/golden.txt` (§11.4) |
| `klang/` (`herd-klang`, `no_std` + `alloc` + `libm`) | **Klang-Erzeuger** (§12, H-K14, K-153): Töne, Rauschen, Noten, Hüllkurven, Filter, Mischen → PCM 48 kHz mono i16; `Abi` (Methoden = Exporte), Raumformel `raum` |
| `klang/wasm/` (`herd-klang-wasm`) | Wasm-Hülle `site/js/herd/klang.wasm` (keine Importe, eigener Allocator). Nur für `wasm32v1-none` |
| `test-klang.js` | Bitgleich-Test Klang nativ = `klang.wasm` = `klang/golden.txt` (§12) |

Dateien im Kern (`kern/src`): `welt.rs` (Teile, Lage, Welt-Matrizen, Komponenten-Verwaltung), `komponenten/` (Registry +
eine Datei je Komponente), `schema.rs` (Feldtypen, Schema, Spalten-Speicher), `abi.rs` (`Kern` = Herd-ABI, Szenen-Hash,
Schema-JSON), `paket.rs` (Bildpaket), `ressourcen.rs` (Formen, Atlas), `formen.rs`, `schrift.rs` (+ `schrift/atlas.bin`),
`farbe.rs`, `fehler.rs` (alle Fehlertexte), `zahl.rs` (Zahl → Text wie JS `String(x)`), `hash.rs` (FNV-1a 64), `mathe.rs`
(f32-Hilfen für die Formen).

**Datenmodell.** Ein Teil hat eine ID (u32, ab 1, nie wiederverwendet; 1 = Kamera, 2 = Sonne), einen Raum (2D/3D, fest),
Eltern/Kinder und eine Lage (`x y z drehung neigung rollen groesseX groesseY groesseZ`, f64, relativ zu den Eltern) sowie
`ebene` und `sichtbar`. Teile liegen dicht (Struktur von Arrays) mit Abbildung ID → Zeile. Welt-Matrizen werden nur für
veränderte Teilbäume neu berechnet (Markierung beim Ändern, Berechnung beim Bild bzw. bei Abfragen).
Komponenten haben ein **Handle** (u32, ab 1, eigener Zahlenraum, nie wiederverwendet). Sie können **lose** existieren
(`komp_neu`, Werte im Kern geprüft) und an höchstens ein Teil gehängt werden; je Teil höchstens eine je Art. Der Speicher
je Art ist ein Sparse-Set: dichte Zeilen, eine Spalte je Feld (f64 für zahlartige Felder, Texte, Farben, Listen,
verborgene Puffer). Wird ein Teil entfernt, sind seine Komponenten **zerstört** (jede Nutzung meldet „Teil 7 ist schon
entfernt.“); `komp_loese` (Sprache: `ohne`) macht sie wieder lose.

**Determinismus (K-129).** Zustand in f64, nur `libm`, keine FMA (Rust kontrahiert nie), keine HashMap, Reihenfolgen nur
nach IDs/Registry. NaN wird im Szenen-Hash kanonisch gehasht, im Paket werden f32 nicht endlich/−0 → 0 geschrieben.
Sortierungen haben eindeutige Schlüssel bzw. sind stabil.

## 2. Komponenten-Registry (Schicht 3)

`kern/src/komponenten/mod.rs`:

```rust
pub static ARTEN: &[&Art] = &[
    &rechteck::ART, &kreis::ART, &text::ART, &bild::ART, &koerper::ART, &licht::ART, &kamera::ART,
    &bewegung::ART, &animation::ART, &partikel::ART,
    &linie::ART, &rahmen::ART, &funken::ART,           // Ausbau (HERD.md §12.2): Typnummern 11, 12, 13, …
    &gleiten::ART, &ablauf::ART,                       // 14, 15 (H-K4); vergeben in Merge-Reihenfolge (HERD.md §12.1)
    &belag::ART,                                       // 16 (H-K2)
    &fuehler::ART,                                     // 17 (H-K6, Nachlauf)
    &blick::ART, &leine::ART,                          // 18, 19 (H-K1; Blick im Bildbau, Leine im Nachlauf)
    &wucht::ART,                                       // 20 (H-K7, braucht Fuehler)
    &vieleck::ART,                                     // 21 (H-K3b; Zerlegung im Nachlauf, 2D-Art DREIECK)
    &gelaende::ART,                                    // 22 (H-K11a, Takt: Netz bei Änderung)
    &vorlage::ART,                                     // 23 (H-K8, Ruhe: kein System)
    &fliesen::ART,                                     // 24 (H-K10; Bildbeitrag nur im Sichtfenster, feste Kacheln in wucht.rs)
    &kulisse::ART,                                     // 25 (H-K9, Ruhe bei aktiv: nein)
    &himmelszelt::ART,                                 // 26 (H-K11b, Bildbeitrag: Abschnitt HIMMELSZELT)
    &taster::ART, &leiste::ART, &regler::ART, &tafel::ART, // 27–30 (H-K12, UI; Taster macht im Nachlauf den Maus-Durchgang)
    &stimmung::ART,                                    // 31 (Stimmung: HDR, Bloom, Tonkurve, Höhennebel; Abschnitt STIMMUNG)
    &schwung::ART,                                     // 32 (H-K17, braucht Fuehler; 3D-Physik über kollision3d.rs)
    #[cfg(any(test, feature = "probe"))]
    &probe::ART,
];
```

Position = **Typnummer** (1 …) = Systemreihenfolge; neue Zeilen nur hinten, vor `&probe::ART` (HERD.md §12.1, K-148). Eine
Komponente ist ein Modul mit

```rust
pub static ART: Art = Art {
    schema: Schema { name: "Bewegung", genus: Genus::F, raum: Raum::Beide, braucht: &[], felder: &[
        Feld::zahl("tempoX", 0.0), …, Feld::zahl("daempfung", 0.0).bereich(0.0, 1.0),
        Feld::intern("zeit", 0.0),        // verborgene Felder stehen am Ende
    ]},
    takt: Some(takt),      // System: fn(&mut Welt, &mut Speicher) – läuft je Takt über die dichten Zeilen
    ..Art::LEER            // alles Übrige leer: nur_test, nachlauf, bild, huelle, ruhe, kopie_ohne (neue Art-Felder ändern keine Komponente)
};
```

Weitere Einträge von `Art`: `nachlauf: Some(f)` (H-K0: gleiche Signatur wie `takt`, läuft je Takt nach **allen** Takt-Systemen, wie
Unity `LateUpdate`), `bild: Some(f)` (Bildbeitrag: `fn(&Welt, &Speicher, &mut Bildbau)` – Instanzen/Lichter/Kameras), `huelle: Some(f)`
(für `trifft`: `fn(&Welt, &Speicher, komp_zeile, teil_zeile) -> Option<Huelle>`), `nur_test: true` (nur Testbau, fehlt im Schema),
`ruhe: Some(f)` (H-K8: `fn(&Speicher, komp_zeile) -> bool` – ja = das Teil **ruht** samt Kindern; `Vorlage` immer, H-K9 `Kulisse`
bei `aktiv: nein`) und `kopie_ohne: true` (`kopie()` lässt die Komponente an der kopierten Wurzel weg).

**Ruhe (H-K8).** Die Welt führt `Teile::welt_ruht` (vererbt: eigene Ruhe-Komponente oder Vorfahre ruht) **sofort** nach – bei
`komp_haenge`/`komp_loese` einer Art mit `ruhe`, `haenge`, `kopie` und nach `setze_zahl` an einer solchen Komponente; der Zustand
ist abgeleitet und nicht im Szenen-Hash. `welt_sichtbar` enthält ihn (`aktualisiere`), damit zeichnen ruhende Teile nicht, haben
keine Hülle (`trifft` → nein) und keine Fühler-Form. **Jedes Takt-/Nachlauf-System prüft `komponenten::wach(w, teil)`** (Zeile
nur, wenn das Teil lebt und wach ist) bzw. `komponenten::ruht(w, teil)`, bevor es Zustand ändert; Kameras und Blicke zählen nur wach.
Ausnahme: reine Caches der eigenen Felder ohne Wirkung auf die Welt (`Vieleck`-Zerlegung, `Gelaende`-Netz) laufen weiter – Kopien erben sie.
`lies: Some(f)` (H-K12: **berechnetes Lesefeld** `fn(&mut Welt, art, zeile, feld) -> Option<f64>` – `hole_zahl` fragt zuerst hier, `None`
= Spalte lesen; die Spalte bleibt unverändert, also auch der Szenen-Hash. Erster Nutzer: `Blick.mausX`/`mausY`).

Feldtypen (Nummer im Schema): 1 `zahl` (f64, Bereich), 2 `ganz`, 3 `diavolo` (0/1), 4 `text`, 5 `wahl` (Index in fester Liste),
6 `farbe` (RGBA8 + Text, wie gesetzt), 7 `teil`, 8 `form`, 9 `bildchen` (IDs, 0 = karton), 10 `bildchen-liste`, 11 `teil-liste`
(`Feld::teil_liste`, Spalte wie `bildchen-liste`), 12 `zahl-liste` (`Feld::zahl_liste`, f64-Liste, Bereich je Eintrag) – beide
höchstens 65 536 Einträge (K-149); verborgen: `intern` (f64), `puffer` (f64-Liste je Komponente, z. B. Teilchen). Feldnummer =
Position + 1 (nur öffentliche Felder). Merkmale: `.lesen()` (**Lesefeld**: jeder Setz-Aufruf des ABI → `<Name>.<feld> kann man nur
lesen.`, Code 32; nur Systeme schreiben über den Speicher) und `.nachtrag()` (**Nachtragsfeld**: der Szenen-Hash überspringt es,
solange der Wert bitgleich dem Standard ist – so bekommt eine bestehende Komponente neue Felder, ohne dass sich Hashes bestehender
Programme ändern; öffentliche Nachtragsfelder stehen vor den verborgenen, Konstanten für verborgene Spalten also mitziehen).
Erstes Nachtragsfeld einer v1-Komponente: `Koerper.belag` (H-K2, Typ `teil`, Standard karton → Material des `Belag` an diesem
Teil; `Koerper` hat keine verborgenen Spalten). `Blick.mausX`/`mausY` (H-K12) sind Nachtrags- **und** Lesefelder, berechnet über `lies`.
`Licht.schattenGuete`, `schattenWeich`, `kaskaden`, `schattenWeite` (H-K18) sind Nachtragsfelder; ihr Bildbeitrag läuft über
`LichtB` in `kern/src/lichter.rs` (`schatten_waehlen`, Abschnitt SCHATTENLICHTER, §4) und `paket.rs` (Sonnen-Kaskaden).

**Eingabezustand und UI (H-K12, K-151):** `Welt::eingabe` hält Maus (Spielfeld), Knöpfe, Knöpfe des Vortakts (am Ende von `takt`
übernommen), das oberste Ziel unter der Maus, das gefangene und das losgelassene Ziel und den Griff einer gezogenen Tafel – nicht im
Szenen-Hash. `komponenten/ui.rs` enthält das Gemeinsame: `mauslage` (Maus in Welt bzw. Spielfeld je nach `festAb` des aktiven Blicks,
Umkehrung der Sicht über `blick::welt_punkt`), `lokal`/`im_rechteck` (Umkehrung der Welt-Matrix), `treffer` (höchste Ebene, dann
höchste ID; Ziele `Taster` aktiv, `Regler`, `Tafel`), `durchgang` (Treffer, Fangen beim Drücken der linken Taste, Freigeben beim
Loslassen; läuft im Nachlauf von `Taster`, der kleinsten Typnummer der vier), `text_mittig` (Glyphen senkrecht mittig nach Auf-/Abstieg).
Systeme, die Listenfelder lesen und zugleich Zahlenfelder schreiben, holen beides auf einmal mit
`Speicher::zahlen_puffer_mut([zahl-felder], [listen-felder])` (H-K4 `Ablauf`; disjunkte Spalten wie `zahlen_mut`).
Anleitung für neue Komponenten: §8 und HERD.md §9.

## 3. Herd-ABI

Jede Zeile ist **ein Export von `kern.wasm`** (Modul ohne Importe, exportiert `memory`) und gleichzeitig eine Methode von
`herd_kern::Kern` mit gleichem Namen (nativ: wasmi-Hostfunktion → Methode). In Rust sind (Zeiger, Länge)-Paare Slices.
Typen nur `i32`/`f64`. Alle Zeiger zeigen in den Speicher **des Kerns**: Die Anbindung holt sich mit `puffer(len)` einen
Austauschpuffer, schreibt Texte (UTF-8)/Zahlen hinein und übergibt den Zeiger. Achtung: Nach jedem Aufruf kann der
Speicher gewachsen sein – JS-Ansichten (`Uint8Array` auf `memory.buffer`) danach neu anlegen.

**Direkt bindbar** (rein numerisch, kein fremder Speicher; `setze_zahlen`/`hole_zahlen` gehen wie Listen über den Austauschpuffer): ein Programm-Wasm kann diese Importe im Browser unmittelbar an
die Exporte von `kern.wasm` binden (`imports.herd = kern.exports`): `teil_*` (außer `teil_kinder`), `komp_*`, `setze_zahl`,
`hole_zahl`, `form_grund`, `ressource_hole`, `eingabe`, `takt`, `bild`, `paket_voll`, `fehler_art`, `fehler_code`, `fehler_neu`,
`welt_hole`. Alles mit Texten/Listen geht über eine kleine Hülle, die zwischen den Speichern kopiert (selten).

**Fehlerprotokoll.** i32-Rückgaben: ≥ 0 Erfolg (ID, Länge, 0), **< 0 = −Fehlerart**. f64-Rückgaben: **NaN** bei Fehler
(dann liefert `fehler_neu()` 1; ein NaN ohne Fehler ist ein echter Wert). Fehlerarten: 1 = `TypAnanas`, 2 =
`LaufzeitAnanas`, 3 = intern (Anbindungsfehler; melden als `LaufzeitAnanas: Interner Fehler im Herd: <text>`). Die Anbindung
wirft `<Art>: <fehler_text>` – Texte entstehen nur im Kern (`fehler.rs`). `fehler_code()` unterscheidet die Fälle (Tabelle
unten), z. B. für Sonderbehandlung in der Anbindung.

**Längen-Retry (K-013).** Funktionen mit `(ptr, kap)`-Ausgabe liefern die benötigte Länge (Bytes bzw. Elemente). Ist sie
größer als `kap`, wird **nichts** geschrieben; erneut aufrufen mit größerem Puffer.

| Export | Signatur | Bedeutung |
|---|---|---|
| `abi_version` | `() → i32` | 1 |
| `puffer` | `(len i32) → ptr` | Austauschpuffer ≥ len Bytes, 8-Byte-ausgerichtet; gültig bis zum nächsten `puffer` |
| `fehler_art` / `fehler_code` | `() → i32` | Art/Code des letzten Fehlers (0 = keiner) |
| `fehler_text` | `(ptr, kap) → len` | Text des letzten Fehlers (ohne `…Ananas: `), Retry |
| `fehler_neu` | `() → i32` | 1, wenn der **letzte** Aufruf mit Fehlerprotokoll fehlschlug, sonst 0; setzt zurück. Jeder solche Aufruf setzt die Markierung neu (seit H1b-Nachtrag) – ein früherer, nicht abgefragter i32-Fehler macht ein späteres echtes NaN also nicht zum Fehler |
| `melde_typfehler` | `(typ, feld, ptr, len) → −1` | setzt `TypAnanas: <Name>.<feld> braucht <erwartet>, nicht <darstellung>.` – für Werte, deren Typ nur die Anbindung kennt (z. B. Text statt Zahl) |
| `welt_neu` | `(breite f64, hoehe f64, titel_ptr, titel_len) → 0` | einmal je Programm; Teil 1 = Kamera (0, 3, 8) → (0, 0, 0), Teil 2 = Sonne (0.5, 1, 0.3) mit `Licht(art: sonne)`. Prüft Ganzzahl und 64 … 4096 |
| `welt_titel` | `(ptr, len) → 0` | Titel ändern (gehört zum Szenenzustand) |
| `welt_hintergrund` | `(ptr, len) → 0` | Farbe (Standard `mozzarella`) |
| `welt_himmel` | `(oben_ptr, oben_len, unten_ptr, unten_len) → 0` | Verlauf; `unten_len = 0` → wie oben |
| `welt_umgebung` | `(ptr, len, staerke f64) → 0` | Umgebungslicht (Standard: Himmel oben bzw. Hintergrund, 0.35) |
| `welt_nebel` | `(ptr, len, von f64, bis f64) → 0` | `von ≥ bis` schaltet ab |
| `welt_hole` | `(was) → f64` | 1 Breite, 2 Höhe, 3 Takte, 4 nächste Teil-ID, 5 lebende Teile, 6 Ressourcen |
| `teil_neu` | `(raum 2∣3) → id` | leeres Teil an der Wurzel |
| `teil_entferne` | `(teil) → 0` | samt Kindern; Komponenten zerstört |
| `teil_kopie` | `(teil) → id` | Kopie samt Komponenten und Kindern, hängt am selben Eltern-Teil; IDs: Kopie, dann Komponenten in Registry-Reihenfolge, dann Kinder (Tiefe zuerst) |
| `teil_haenge` | `(teil, an) → 0` | `an = 0` löst; lokale Lage bleibt; Zyklus/Raum → Fehler |
| `teil_kinder` | `(teil, ptr, kap) → n` | Kinder-IDs (u32 LE) in Anhänge-Reihenfolge, Retry (kap in Elementen) |
| `teil_setze` | `(teil, feld, wert f64) → 0` | Lage-Feld (Tabelle unten) |
| `teil_hole` | `(teil, feld) → f64` | Lage-Feld lesen; `14` (entfernt) wirft nie; `19` (ruht, H-K13) für die Kniff-Phase der Laufzeiten |
| `teil_lage` / `teil_verschiebe` | `(teil, x, y, z) → 0` | `setzeLage`/`verschiebe`; 2D: z ≠ 0 → Fehler |
| `teil_groesse` | `(teil, sx, sy, sz) → 0` | `setzeGroesse` (2D ignoriert sz) |
| `teil_schaue` | `(teil, x, y, z) → 0` | `schaueAuf` (nur 3D): −z-Achse zeigt auf den Punkt, rollen = 0 |
| `teil_trifft` | `(a, b) → 0∣1` | Hüllen (SPEC §18.4) |
| `komp_neu` | `(typ) → handle` | lose Komponente mit Standardwerten |
| `komp_haenge` | `(komp, teil) → 0` | prüft: lose, Raum, Art frei, Voraussetzungen |
| `komp_loese` | `(komp) → 0` | wieder lose (Werte bleiben); verweigert, wenn eine andere Komponente am Teil sie braucht |
| `komp_von` | `(teil, typ) → handle∣0` | `teil.<name>()` |
| `komp_info` | `(komp, was) → i32` | 1 Typnummer, 2 Teil (0 = lose **oder zerstört**, wirft dann nicht), 3 zerstört (0/1, wirft nie) |
| `typ_nummer` | `(ptr, len) → typ` | nach Name; unbekannt → −2, `Eine Komponente 'Pendel' gibt es nicht.` (Code 19; bis H1b: 0 ohne Fehler) |
| `feld_nummer` | `(typ, ptr, len) → feld` | nach Name; unbekannt → `<Name> hat kein Feld 'x'.` |
| `setze_zahl` | `(komp, feld, wert f64) → 0` | zahl/ganz (Bereich), diavolo (0/1), wahl (Index), teil/form/bildchen (ID, 0 = karton), farbe (0xRRGGBBAA; Text wird `#rrggbbaa`). Lesefeld → Code 32 (gilt für alle `setze_*`) |
| `hole_zahl` | `(komp, feld) → f64` | wie oben; farbe → 0xRRGGBBAA; bildchen-liste/zahl-liste → Länge; teil-liste → Anzahl **lebender** Teile |
| `setze_text` | `(komp, feld, ptr, len) → 0` | text, wahl (Name), farbe (Palette/Hex) |
| `hole_text` | `(komp, feld, ptr, kap) → len` | text, wahl (Name), farbe (**wie gesetzt**), Retry |
| `setze_liste` | `(komp, feld, ptr, n) → 0` | bildchen-liste bzw. teil-liste: n × u32 LE (IDs); teil-liste: jedes Teil muss leben, höchstens 65 536 |
| `hole_liste` | `(komp, feld, ptr, kap) → n` | Retry (kap in Elementen); teil-liste: entfernte Teile fallen heraus (gespeicherter Zustand bleibt) |
| `setze_zahlen` | `(komp, feld, ptr, n) → 0` | zahl-liste (H-K0): n × f64 LE, Bereich je Eintrag, höchstens 65 536 |
| `hole_zahlen` | `(komp, feld, ptr, kap) → n` | zahl-liste: n × f64 LE, Retry (kap in Elementen) |
| `form_grund` | `(art, teile f64, dicke f64) → id` | 1 Würfel, 2 Kugel, 3 Zylinder, 4 Kegel, 5 Ebene, 6 Ring; `teile` 3 … 128 (Kugel/Zylinder/Kegel/Ring), `dicke` 0.05 … 0.9 (Ring) |
| `form_eigene` | `(punkte_ptr, n_zahlen, dreiecke_ptr, n_zahlen, glatt) → id` | beide als f64 LE (Dreiecke als Zahlen, damit der Kern Ganzzahl/Bereich prüft) |
| `bildchen_neu` | `(zeilen_ptr, zeilen_len, farben_ptr, farben_len) → id` | Zeilen: Folge `u32 Länge + UTF-8`; Farben: Folge von Paaren `u32 Länge + Zeichen`, `u32 Länge + Farbtext` (leer = keine). **Zeichen werden im Kern aufgelöst** (Palette `w s g o t r p b l m e k a y h u v`, `.`/Leerzeichen durchsichtig, Zuordnung hat Vorrang) |
| `bildchen_rgba` | `(breite, hoehe, ptr) → id` | breite × hoehe × 4 Bytes RGBA8 |
| `bildchen_teigling` | `(ptr, len) → id` | `len` Bytes eines **Teiglings** (§11.2, `Bildchen.laden`, PROJEKTE PD1): prüft **nur den Kopf** (Magie, Version 1, Pixelformat 0, Größe 1 … 2048, Stufenzahl bis 1 × 1, jede Stufenlänge, Gesamtlänge) und übernimmt die Bytes als **eigene Textur** mit Mip-Kette (nicht im Atlas; `ressource_hole` Art 2 = Bildchen, Breite/Höhe = Stufe 0). Fehler-Teigling Code 1 bzw. ungültiger Kopf → Code 61, Code 2 → Code 62 (`LaufzeitAnanas`). Vor `welt_neu` → Code 3 |
| `ressource_hole` | `(id, was) → f64` | 1 Art (1 Form, 2 Bildchen), 2 Breite, 3 Höhe, 4 Ecken, 5 Dreiecke |
| `eingabe` | `(maus_x f64, maus_y f64, knoepfe) → 0` | Eingabezustand für die folgenden Takte (H-K12, K-151): Maus in Spielfeld-Koordinaten, Knöpfe 1 links · 2 rechts · 4 Mitte. Die Anbindung ruft es **je Takt vor `fn()`**; nicht endliche Maus bzw. Knöpfe außerhalb 0 … 7 bleiben stehen. Nicht im Szenen-Hash, wirkt nur über Lesefelder (`Taster`, `Regler`, `Tafel`, `Blick.mausX`). Vor `welt_neu` → Code 3 |
| `takt` | `() → 0` | alle Takt-Systeme, danach alle Nachlauf-Systeme (je in Registry-Reihenfolge), dt = 1/60; danach gilt der Knopfstand als Vortakt |
| `bild` | `(bildnummer) → len` | baut das Bildpaket; Bytes ab `bild_zeiger()`, gültig bis zum nächsten `bild` |
| `bild_zeiger` | `() → ptr` | |
| `paket_voll` | `() → 0` | nächstes Paket enthält wieder alle Ressourcen (neue Glut, Fenster neu geöffnet) |
| `hash_szene` / `hash_paket` | `(ptr) → 16` | FNV-1a 64 als 16 Hex-Ziffern (Kleinbuchstaben) über den Szenenzustand bzw. das letzte Paket |
| `schema_json` | `(ptr, kap) → len` | Schema (§5), Retry |

**Lage-Felder** (`teil_setze`/`teil_hole`): 1 x, 2 y, 3 z, 4 drehung, 5 neigung, 6 rollen, 7 groesseX, 8 groesseY,
9 groesseZ, 10 ebene (2D, Ganzzahl), 11 sichtbar (0/1); nur lesen: 12 raum (2/3), 13 eltern (0 = keins), 14 entfernt (0/1),
15 weltX, 16 weltY, 17 weltZ, 18 Anzahl Kinder, 19 ruht (0/1: selbst oder geerbt `Vorlage` bzw. ausgeschaltete `Kulisse`; H-K13). 3D-Felder (z, neigung, rollen, groesseZ) an 2D-Teilen und `ebene` an
3D-Teilen → `LaufzeitAnanas: Teil 5 ist ein 2D-Teil – neigung gibt es nur für 3D-Teile.` (bzw. `… 3D-Teil – ebene gibt es nur
für 2D-Teile.`).

**Fehlercodes** (`fehler_code`): 1 Herd-Größe keine Ganzzahl · 2 Herd-Größe Bereich · 3 noch kein Herd · 4 zweiter Herd ·
10 Teil entfernt · 11 Teil unbekannt · 12 Hängen: Zyklus · 13 Hängen: Raum · 14 nur 3D · 15 nur 2D · 16 Lage-Feld unbekannt
(intern) · 17 Raum unbekannt (intern) · 18 Lage-Bereich (ebene) · 20 Typnummer unbekannt (intern) · 21 Komponente hängt schon
· 22 Komponente falscher Raum · 23 Art schon am Teil · 24 Voraussetzung fehlt · 25 wird gebraucht · 26 Handle unbekannt
(intern) · 27 Feld unbekannt · 28 Feld falscher Typ · 29 Feld Bereich · 30 Wahl unbekannt · 31 Farbe unbekannt · 32 Lesefeld gesetzt (`<Name>.<feld> kann man nur lesen.`; auch `melde_typfehler` an einem Lesefeld) · 33 Liste zu lang ·
19 Komponentenname unbekannt · 40 teile (Bereich) · 51 teile keine Ganzzahl (TypAnanas `Form.kugel(teile: …) braucht eine Ganzzahl, nicht 24.5.`) · 41 dicke · 42 Punkte · 43 Dreiecke · 44 Punkt-Index · 45 Bildchen zu groß · 46 Bildchen-Zeichen · 47 Bildchen
ohne Zeilen · 48 Ressource unbekannt · 49 Grundform unbekannt (intern) · 50 Bildchen-Farbschlüssel · 60 Puffer (intern) ·
61 Teigling: kein lesbares Bild (`ist kein lesbares Bild (PNG oder JPEG).`) · 62 Teigling: zu groß (`ist zu groß (2400 × 800) –
höchstens 2048 × 2048 Pixel.`). Bei 61/62 kennt der Kern den Pfad nicht: die Anbindung meldet `LaufzeitAnanas: <pfad> <fehler_text>`
(SPEC §18.5). Neue Codes der HERD-Stufen ab 63.

**Was die Anbindung selbst tut:** Sprachtypen prüfen (Zahl/Text/Blech …, bei falschem Typ `melde_typfehler`), Fabriken
zusammensetzen (`herd.kreis(x, y, r, farbe:)` = `teil_neu(2)` + `teil_lage` + `komp_neu(Kreis)` + Felder + `komp_haenge`),
Objektidentität (Handle → pizza-Objekt), Textformen (`Teil(3)`, `Bewegung(3)`), Getter/Setter-Namen aus dem Schema,
`bildnummer`/`zeit`, Eingabe, Fenster-Ereignisse. `bildnummer` gibt die Anbindung an `bild(n)` (sie steht im Paketkopf).
Mausfang, Rohbewegung und Rad (`mausFangen`, `mausDX`/`mausDY`, `mausrad`, K-155) hält allein die Anbindung – der Kern sieht davon
nichts (kein neuer Export, `eingabe` unverändert).

## 4. Bildpaket v1 (Kern → Glut)

Little Endian, feldweise geschrieben. Hängt **nicht** von Fenster- oder Gerätegröße ab (nur vom logischen Spielfeld
`breite × hoehe`); Kantenglättung und Pixeldichte macht die Glut (SDF, MSAA).

**Kopf (32 Bytes):** `"HZP1"` · `u32 version = 1` · `u32 bildnummer` · `u16 breite` · `u16 hoehe` · `u32 flags`
(1 = 3D-Züge oder 3D-Teilchen vorhanden, 2 = Schattendurchgang, 4 = Himmel zeichnen: Verlauf bzw. Himmelszelt) · `u32 anzahl_abschnitte` · `u32 länge_gesamt` ·
`u32 0`.
**Abschnitte** folgen: `u32 art` · `u32 länge` · Daten · Auffüllung auf 4 Bytes. Reihenfolge: Ressourcen-Deltas (1–5), dann 10,
11, 12, 13, 14, 15. Unbekannte Arten überspringen. Abschnitte des Ausbaus (HERD.md §12, ab 14) stehen nur im Paket, wenn die
Komponente benutzt wird – Pakete ohne sie bleiben byte-gleich, `version` bleibt 1.

| Art | Name | Inhalt |
|---|---|---|
| 1 | SCHRIFT | `u16 breite, u16 hoehe, f32 em, f32 spanne`, dann `breite × hoehe` Bytes R8 (SDF, 0.5 = Kante). Im ersten Paket (und nach `paket_voll`) |
| 2 | ATLAS_SEITE | `u32 seite, u16 breite, u16 hoehe` – neue Bildchen-Atlasseite (RGBA8, 2048 × 2048, anfangs durchsichtig; Seiten sind die Schichten eines Textur-Arrays) |
| 3 | ATLAS_STUECK | `u32 seite, u16 x, u16 y, u16 b, u16 h`, dann `b × h × 4` Bytes RGBA8 (Zeilen von oben) |
| 4 | NETZ | `u32 id, u32 ecken, u32 indizes, f32 min[3], f32 max[3]`, dann `ecken × 32` Bytes (`f32 pos[3], normale[3], uv[2]`), dann `indizes × u32` (Dreiecke, Vorderseite gegen den Uhrzeigersinn) |
| 5 | TEXTUR | eigene Textur aus einem Teigling (`bildchen_teigling`, PROJEKTE PD1): `u32 id` (Ressourcen-ID = Textur-ID), `u8 format` (0 = RGBA8, nicht vormultipliziert), `u8 stufen`, `u16 b, u16 h`, dann je Stufe `u32 länge` + Bytes (Stufe 0 = b × h, jede weitere halbiert, abgerundet, mindestens 1, bis 1 × 1; Zeilen von oben). Einmal je Bild (nicht je Verwendung), nur wenn Teiglinge geladen sind |
| 10 | SZENE | 592 Bytes Uniform-Block (unten), immer vorhanden |
| 11 | INST3D | n × 72 Bytes 3D-Instanzen |
| 12 | ZUEGE3D | m × 16 Bytes: `u32 art, u32 netz, u32 erste_instanz, u32 anzahl` (art 1 FEST, 2 SCHATTEN, 3 DURCH; H-K18: Bits 0–7 = 4 ANSICHT, Bits 8 … = Nummer der Schatten-Ansicht) |
| 13 | INST2D | k × 56 Bytes 2D-Instanzen, **bereits in Zeichenreihenfolge** |
| 14 | TEILCHEN3D | `u32 leuchtend, u32 deckend`, dann (leuchtend + deckend) × 20 Bytes 3D-Teilchen (`Funken`, unten); nur wenn sichtbare Teilchen da sind |
| 15 | HIMMELSZELT | 208 Bytes Uniform-Block des geltenden `Himmelszelt` (H-K11b, unten); nur wenn eines an einem wachen Teil hängt (dann ist auch Flag 4 gesetzt) |
| 18 | ZUSATZ3D | Material-Zusatz je 3D-Instanz (16 B, gleiche Reihenfolge wie INST3D): `u32 relief` (wie `INST3D.textur`, nur eigene Texturen; 0 = keins), `f32 kachel`, `f32 metall`, `u32 merkmale` (Bit 0 pbr, Bit 1 Welt-Abbildung, Bits 8–15 nass · 255); nur wenn eine geschriebene Instanz einen hat (`Belag`-Material) |
| 19 | ZUSATZ_TEILCHEN | Zusatz je 3D-Teilchen (16 B, gleiche Reihenfolge wie TEILCHEN3D): `f32 strich x, y, z` (halbe Strichachse in Welt, 0 = rund), `u32 merkmale` (Bits 0–7 `licht` · 255); nur wenn ein geschriebenes Teilchen gestreckt oder beleuchtet ist (`Funken` „Regen“) |
| 17 | STIMMUNG | 80 Bytes Uniform-Block der geltenden `Stimmung` (unten); nur wenn eine an einem wachen Teil hängt |
| 16 | LICHTER | viele Lichter (Clustered Forward, `kern/src/lichter.rs`, unten); nur bei mehr als 8 wirksamen Punktlichtern (Stärke > 0), einem Spot (`Licht.kegel` > 0) oder einem schattenwerfenden Punkt-/Spotlicht (H-K18) |
| 20 | SCHATTENLICHTER | Schatten für Punkt-/Spotlichter und Sonnen-Kaskaden (H-K18, unten); nur wenn ein Licht mit `schattenGuete` ≠ aus Schatten wirft, die Sonne `kaskaden` > 1 hat oder ihr `schattenWeich` ≠ 1 ist |

Ressourcen-Deltas enthalten jede Ressource genau einmal (im ersten Paket nach ihrem Anlegen); Ressourcen werden in v1 nie
gelöscht. Atlasrechtecke liegen mit 1 Pixel Abstand.

**SZENE (592 Bytes, std140-gleich, alles f32):**
`ansicht_proj mat4` (spaltenweise, Tiefe 0 … 1, Seitenverhältnis = breite/hoehe) · `licht_proj mat4` (Sonne, orthografisch,
auf Shadow-Map-Texel 2048 eingerastet) · `kamera vec4` (xyz) · `sonne_richtung vec4` (xyz zur Sonne, normiert; w = 1 Schatten
an) · `sonne_farbe vec4` (linear × Stärke; 0 = keine Sonne) · `umgebung_oben vec4` · `umgebung_unten vec4` (linear × Stärke)
· `nebel_farbe vec4` (linear; w = 1 an) · `nebel vec4` (von, bis, 1/(bis − von)) · `himmel_oben vec4` · `himmel_unten vec4`
(linear) · `hintergrund vec4` (**sRGB** 0 … 1) · `schatten vec4` (1/2048, Normalenversatz in Welt-Einheiten = 1 Texel,
Tiefen-Bias, Texelgröße Welt) · `feld vec4` (breite, hoehe, 1/breite, 1/hoehe) · `zahlen vec4` (x = Anzahl Punktlichter
0 … 8) · `licht_pos[8] vec4` (xyz, w = Reichweite) · `licht_farbe[8] vec4` (linear × Stärke).

**INST3D (72 Bytes):** `f32 zeile0[4], zeile1[4], zeile2[4]` (Welt-Matrix 3 × 4 zeilenweise: Rotation·Skalierung | Verschiebung;
Normalenmatrix = Kofaktoren der 3 × 3, im Shader) · `u8 r, g, b, a` (sRGB, nicht vormultipliziert) · `f32 glanz` (0 … 1) ·
`f32 leuchten` (0 … 1) · `u16 u0, v0, u1, v1` (Atlas-Pixel der Textur) · `u32 textur` (Bits 0–15 Atlasseite, Bit 16 = hat
Textur; **Bit 17 = eigene Textur** (PD1): dann sind Bits 0–15 die Textur-ID aus TEXTUR und `u0 v0 u1 v1` = `0 0 b h` Pixel der
Textur – Textur-IDs ab 65 536 sind in 3D nicht darstellbar). Texturkoordinate: `atlas = (u0, v0) + clamp(uv · (u1 − u0, v1 − v0), 0.5, Größe − 0.5)`, nächster Nachbar;
Texel mit Deckkraft < ½ werden verworfen (auch im Schatten).

**Züge:** In Listenreihenfolge. Für jedes Netz (aufsteigende ID) folgen die undurchsichtigen Instanzen in drei Gruppen:
[wirft Schatten, außerhalb der Sicht] [wirft Schatten, sichtbar] [wirft keinen, sichtbar] – je nach Teil-ID. `FEST` zeichnet
die sichtbaren (Tiefe schreiben), `SCHATTEN` die werfenden in die Shadow-Map (Tiefe aus `licht_proj`). Danach `DURCH` (Farbe
mit Deckkraft < 1) von hinten nach vorn (Abstand entlang der Blickrichtung, dann Teil-ID), aufeinanderfolgende gleiche Netze
zusammengefasst; je Zug erst Rückseiten, dann Vorderseiten, Tiefe testen, nicht schreiben. Frustum-Culling ist erledigt.
Mit SCHATTENLICHTER folgen hinter `DURCH` **eigene Instanz-Kopien** der Werfer je Schatten-Ansicht (Kaskaden, dann Kacheln; je
Ansicht nach (Netz, Teil-ID), nur Werfer, deren Hülle die Ansicht schneidet bzw. bei Kaskaden in die Lichtbox fällt) als Züge
`ANSICHT | a << 8` – je Ansicht und Netz ein Draw-Call; mit Kaskaden entfallen die `SCHATTEN`-Züge der Sonne.

**TEILCHEN3D (20 Bytes je Teilchen):** `f32 x, y, z` (Weltlage) · `f32 r` (halbe Größe, Welt-Einheiten) · `u8 r, g, b, a` (sRGB,
nicht vormultipliziert). Erst die **leuchtenden** (additiv) in Ausstoßreihenfolge (Komponentenzeile, dann Teilchen), dann die
**deckenden** (gemischt) von hinten nach vorn (Abstand entlang der Blickrichtung, dann Ausstoßreihenfolge; Schlüssel
`ordnungs_bits`). Teilchen außerhalb des Sichtkörpers (Kugel mit Radius `r`) sind entfernt. Die Glut zeichnet sie als
kamerazugewandte Vierecke nach `DURCH` und vor INST2D: Tiefe testen, nicht schreiben, Nebel, keine Schatten, je Mischart ein
instanzierter Draw-Call. Mit `Funken.streckung` ist `x, y, z` die **Mitte** des Strichs (Kopf = Mitte + `strich` aus ZUSATZ_TEILCHEN) und der
Sichtkörper-Test nimmt den Radius `r` + halbe Strichlänge; Strich und Licht stehen dann in **ZUSATZ_TEILCHEN** (16 B je Teilchen in
derselben Reihenfolge), sonst fehlt der Abschnitt und das Paket ist byte-gleich.

**HIMMELSZELT (208 Bytes, std140-gleich):** `oben vec4` · `horizont vec4` · `boden vec4` (linear, w = 1) · `sonne vec4` (xyz zur
Sonne = `SZENE.sonne_richtung.xyz`, w = halber Scheibenwinkel in Bogenmaß, 0 = keine Scheibe) · `sonne_farbe vec4` (Farbe des
Sonnenlichts linear ohne Stärke, ohne Sonne mozzarella; w = `sterne` 0 … 1) · `u32 box[6][4]` (je Seite rechts +x, links −x,
oben +y, unten −y, vorn −z, hinten +z: `u0 v0 u1 v1` in Pixeln – Atlas bzw. `0 0 b h` der eigenen Textur) · `u32 wort[8]` (je Seite
wie `INST3D.textur`: Bits 0–15 Atlasseite bzw. Textur-ID, Bit 16 = Bild, Bit 17 = eigene Textur; 0 = Seite prozedural; Wörter 6, 7
= 0). Seitenkoordinate als aufgeklapptes Kreuz um `vorn`: `vorn (s, t) = (½ + ½ x/|z|, ½ − ½ y/|z|)`, `hinten (½ − ½ x/|z|, …)`,
`rechts (½ + ½ z/|x|, ½ − ½ y/|x|)`, `links (½ − ½ z/|x|, …)`, `oben (½ + ½ x/|y|, ½ − ½ z/|y|)`, `unten (½ + ½ x/|y|, ½ + ½ z/|y|)`.
Ohne `herd.umgebung` gilt als Umgebungslicht `oben` × 0.35 (SZENE `umgebung_*`); sonst ändert das Himmelszelt an SZENE nichts.

**LICHTER (Clustered Forward):** Kopf 64 Bytes (std140-gleich, f32; Uniform-Block an Bindung 14): `raster vec4` (nx = 16,
ny = round(16 · hoehe/breite) geklemmt 1 … 32, nz = 24, Anzahl Lichter) · `tiefe vec4` (nah, nz / ln(fern/nah), fern, 0) · `vorn vec4`
(Blickrichtung der Kamera) · 16 Bytes frei. Dann `u32 n`, `u32 worte`, n × 48 Bytes Lichter (`pos xyz, reichweite` · `farbe rgb`
linear × Stärke, `cos(kegel)` · `richtung xyz` (−z des Teils, normiert), `cos(kegel · (1 − kegelRand))`; Punktlicht: −2 und −1.5) – die
**sichtbaren** (Kugel aus Lage und Reichweite schneidet den Sichtkörper zwischen nah und fern) in der Reihenfolge (Abstand zur Kamera,
Teil-ID), höchstens 4096 –, dann `worte` × u32 Zellen-Tabelle: zuerst je Zelle `c = (s · ny + ty) · nx + tx` ein Kopf `versatz << 8 |
anzahl` (versatz = Index in dieser Tabelle, anzahl ≤ 255), danach die Licht-Indizes (je Zelle in Lichtreihenfolge; Überzählige fallen
weg, die fernsten zuerst; höchstens 1024 × 2048 Wörter). Zelle eines Punkts p: Kachel `t = ⌊(ndc · ½ + ½) · n⌋` (geklemmt) aus
`ansicht_proj · p`, Scheibe `s = ⌊ln(max(d, nah)/nah) · tiefe.y⌋` (geklemmt) mit d = (p − Kamera) · vorn. Belegung konservativ: je
Tiefenscheibe der Quader um die Kugel, an beiden Scheibengrenzen projiziert (x/z ist für festes x monoton in z). Die 8 Lichter in SZENE
bleiben wie v1 geschrieben; der Shader nimmt mit Abschnitt nur die Zellen-Lichter. **H-K18:** Ein Licht-Index in der Zellen-Tabelle trägt
in Bits 16 … 19 die Nummer seines Schatten-Platzes + 1 (0 = ohne Schatten; Indizes < 4096 bleiben in Bits 0 … 15).

**SCHATTENLICHTER (H-K18, `kern/src/lichter.rs`, f32, std140-gleich; Uniform-Block an Bindung 18, die Glut füllt auf 5 200 Bytes
mit Nullen auf):** `kopf vec4` (1 = an, Kaskaden k (0 = Sonne über SZENE wie v1), `schattenWeich` der Sonne, Zahl der Ansichten) ·
`kaskaden[4] vec4` (Normalenversatz = Texel in Welt, Tiefen-Bias) · `plaetze[8] vec4` (erste Ansicht, Zahl der Ansichten 1 oder 6,
`schattenWeich`) · dann je **Ansicht** 96 Bytes: `vp mat4` (Ansicht·Projektion), `rect vec4` (Schicht, x, y, Kante in Texeln),
`texel vec4` (x = Weltmaß eines Texels; Kacheln: je Einheit Abstand). Erst die k Kaskaden (Schicht i, ganze Schicht 2048²), dann die
Kacheln der Plätze (Punktlicht: 6 Würfelseiten +x, −x, +y, −y, +z, −z, 90°-Perspektive mit 12 Texeln Rand; Spot bis 60°: eine Kachel,
halber Öffnungswinkel = `kegel` + Rand; Auge ≈ 0,02 % der Reichweite schief neben dem Licht, damit keine Netz-Ecke w = 0 hat – SwiftShader). **Auswahl:** höchstens 8 Lichter mit `schattenGuete` ≠ aus, `schatten` an, Stärke und
Reichweite > 0, Kugel im Sichtkörper; Reihenfolge (Abstand Kamera – Lichtrand, Teil-ID). **Packen:** Kante 256/512/1024 (grob, mittel,
fein), nach (Güte absteigend, Auswahl) in Morton-Reihenfolge in 4 Seiten à 2048² (= 4096² Texel) hinter den Sonnen-Schichten (v1: ab
Schicht 1, mit Kaskaden ab Schicht k) – lückenlos, weil die Kanten absteigende Zweierpotenzen sind; passt ein Licht nicht ganz, wirft es
keinen Schatten. **Kaskaden:** Sicht von `nah` bis zur Schattenweite (`schattenWeite` > 0, sonst wie v1) praktisch geteilt
(λ = 0,75), je Scheibe Kugel um die 8 Ecken (Radius auf 1/16 aufgerundet), Mitte im Lichtraum auf Texel gerastet, Tiefe über die
Empfänger-Kugel und die Werfer in der Lichtbox; SZENE trägt dann Kaskade 0.

**STIMMUNG (80 Bytes, std140-gleich, f32):** `a vec4` (belichtung, bloom, bloomSchwelle, bloomWeite) · `nebel vec4` (nebelDichte,
nebelHoehe, nebelAbfall, `fern` der Kamera) · `farbe vec4` (nebelFarbe linear, saettigung) · `b vec4` (vignette, koernung, Zeit = Bild/60 s,
1 = an) · `spiegel vec4` (spiegelung, spiegelHoehe, 0, 0). Bei spiegelung > 0 zeichnet die Glut vorab den **Spiegeldurchgang**: SZENE-Kopie mit
Ansicht·Projektion × Spiegelmatrix (Spalte 1 negiert, Spalte 3 += 2h · Spalte 1), Kamera-y = 2h − y, `zahlen.y` = 1, `zahlen.z` = h; Himmel und
`FEST` in ein Bild halber Zielgröße (HDR-Format, ohne MSAA), Fragmente unter h + 0,03 verworfen; das Bild liegt im Hauptdurchgang an Bindung 19. Mit Abschnitt zeichnet die Glut Himmel, `FEST`, `DURCH` und 3D-Teilchen **linear** in ein HDR-Ziel, dann Bloom und Abschluss ins
Ziel, danach INST2D.

**INST2D (56 Bytes):** `f32 m00, m10, m01, m11` (2 × 2 lokal → Spielfeld, Spalten = lokale x-/y-Achse) · `f32 tx, ty`
(Mitte, Spielfeld-Pixel, y nach unten; mit aktivem `Blick` (H-K1) hat der Kern die Sicht-Matrix schon eingerechnet – außer für
Teile mit `ebene ≥ festAb` –, das Format bleibt gleich) · `f32 hx, hy` (halbe Ausdehnung lokal) · `f32 p0, p1` · `u8 r, g, b, a` (sRGB) ·
`u32 art | seite << 8` · `u16 u0, v0, u1, v1` (Atlas-Pixel). Eckpunkt `c ∈ {−1, 1}²`: `lokal = c · (h + rand)` mit `rand` = Saum für
die Kantenglättung bei Rechteck/Kreis (ein Gerätepixel, mindestens ein Spielfeldpixel, in lokalen Einheiten), sonst 0; `pos = M · lokal + t`; Texturkoordinate (Bild/Glyphe)
`uv = mix((u0, v0), (u1, v1), (c + 1) / 2)` (c.y = −1 oben).

| art | Bedeutung |
|---|---|
| 1 Rechteck | abgerundetes Rechteck, halbe Größe `h`, Rundung `p0` (≤ min(h)), Umriss `p1` (> 0: nur ein Rand dieser Dicke nach innen) |
| 2 Kreis | Radius `hx`, Umriss `p1`; auch Partikel |
| 3 Bild | Atlasseite `seite`, Texel nächster Nachbar (pixelscharf, auf das Rechteck geklemmt), × Farbe (Tönung) |
| 4 Glyphe | SCHRIFT-Textur (linear), Kante bei 0.5, × Farbe |
| 5 Dreieck | `Vieleck` (H-K3b): Ecken direkt in Spielfeld-Pixeln – **A** = `tx ty`, **B** = `m00 m10`, **C** = `m01 m11` (keine Matrix, damit Nachbardreiecke bitgleiche Ecken teilen); `h` = 0; `p0` = Maske der Außenkanten (Bit 0 = A→B, 1 = B→C, 2 = C→A), `p1` = 0; `uv` = 0. Nur Außenkanten werden geglättet (und um den Saum nach außen versetzt, je Kante höchstens 2 Saumbreiten); Innenkanten bleiben exakt. Je Instanz ein Dreieck (Ecken 3 … 5 leer), weiter ein Draw-Call mit allen 2D-Instanzen; sortiert nach (`ebene`, ID), innerhalb eines Teils in Zerlegungsreihenfolge |
| 6 Texturbild | wie 3, aber aus der **eigenen Textur** `seite` (= Textur-ID aus TEXTUR, 24 Bit); `u0 v0 u1 v1` in Pixeln der Stufe 0 (`Bild`: `0 0 b h`, `Rahmen`: die Neuntel). Abtastung (PD3): vergrößern nächster Nachbar, verkleinern trilinear über die Mipmaps |

Alle 2D-Instanzen sind **eine** Liste in Zeichenreihenfolge (`ebene`, dann Teil-ID, dann Registry-Reihenfolge, dann
Glyphen-/Teilchenreihenfolge) → ein instanzierter Draw-Call (6 Ecken × k), über der 3D-Szene, ohne Tiefe, Mischen
„source over“ in sRGB. Spielfeld-Culling ist erledigt.

**Zeichenfolge der Glut:** Ziel mit `hintergrund` füllen (Spielfeld seitentreu einpassen, Ränder ebenfalls Hintergrund) →
falls HIMMELSZELT: Himmelszelt, sonst falls Flag 4: Himmelsverlauf → `SCHATTEN`- und `ANSICHT`-Züge in die Schatten-Tiefentextur (je Schicht ein Durchgang, je Zug Rechteck der Ansicht) → `FEST` → `DURCH` → TEILCHEN3D (leuchtend, deckend) → INST2D. Der Himmel ist ein Verlauf
nach der **Blickrichtung** (Horizont `himmel_unten`, Zenit `himmel_oben`, darunter `himmel_unten`), damit ein Boden im Nebel
(Nebelfarbe = `himmel_unten`) nahtlos in den Himmel übergeht. Das Himmelszelt (H-K11b) ist ebenfalls ein Dreieck über das ganze
Spielfeld ohne Tiefe, nur mit eigenem Fragment-Shader (§9).

## 5. Schema (`site/js/herd/schema.json`)

Erzeugt von `node herd/baue.js` aus `schema_json`; ein Test vergleicht Datei und Kern. Inhalt: `format`, `feldtypen`
(Nummer, Name, `erwartet`-Text), `komponenten` (Name, Nummer = Typnummer, `genus` `m|f|n` für Fehlertexte wie „Dieser Kreis …“, Raum `2D|3D|beide`, `braucht`, `system`, `felder`
mit Nummer, Name, Typ, Standard (Listen `[]`), min, max, `wahl`, ab H-K0 `"lesen": true` bzw. `"nachtrag": true` – nur wenn
gesetzt; `system` ist wahr bei `takt` oder `nachlauf`), `teil_felder` (Lage-Feldnummern), `teil_methoden` (seit H-K13 mit `kniffe` – die Teil-Methode lebt nur in den Laufzeiten; für die
Kollisionsprüfung: kein Komponentenname mit kleinem Anfangsbuchstaben darf darunter sein), `palette` (Name, Hex, Zeichen),
`grundformen`. Test-Komponenten (`Probe`) fehlen.

## 6. Bauen

- `node herd/baue.js` → `cargo build --release -p herd-kern-wasm --target wasm32v1-none` (Features wie die Laufzeit:
  `+bulk-memory,+mutable-globals,+sign-ext,+nontrapping-fptoint,+multivalue`, `herd/.cargo/config.toml`), schreibt
  `site/js/herd/kern.wasm` (keine Importe, kein wasm-bindgen) und `site/js/herd/schema.json`; im selben Lauf
  `-p herd-teigling-wasm` → `site/js/herd/teigling.wasm` (§11) und `-p herd-klang-wasm` → `site/js/herd/klang.wasm` (§12).
  `--pruefe` vergleicht nur (schema.json ↔ kern.wasm, teigling.wasm: keine Importe, alle Exporte, SHA-256-Probe; klang.wasm: keine
  Importe, alle Exporte, Hash des ersten Golden-Tons).
- Nativ: `cargo build` im Ordner `herd/` (Kern ist eine rlib ohne Abhängigkeiten außer `libm`).
- Browser-Glut: `node herd/baue-web.js` → `cargo build -j 2 --profile klein -p herd-glut-web --target wasm32-unknown-unknown`,
  dann `wasm-bindgen --target no-modules` → `site/js/herd/glut.js` + `glut_bg.wasm` (eingecheckt). wasm-bindgen ist im Crate auf
  `=0.2.129` gepinnt, die CLI muss dieselbe Version haben (`cargo install wasm-bindgen-cli --version 0.2.129 --locked -j 2`; das
  Skript prüft das). `wasm-opt` wird genutzt, wenn es im PATH liegt.

## 7. Tests

- `cargo test -j 2` (im Ordner `herd/`, alle Crates): Kern (ABI, Fehlertexte, Hierarchie, Systeme, Bildpaket,
  Erweiterungsprobe, Schema-Datei aktuell, keine Namenskollision), Skript (Parser, alle Szenen laufen fehlerfrei), Glut und
  Werkzeug (§9).
- `node herd/test-kern.js` (**blockierend**, K-129): spielt jedes Szenen-Skript aus `tests/herd/szenen/` gegen
  `site/js/herd/kern.wasm` (`herd/skript.js`) und gegen den nativen Kern (`herd-skript`, baut mit `cargo build -j 2`)
  und vergleicht **jede Ausgabezeile** – jeden Rückgabewert und Szenen-/Paket-Hash je Bild. Läufe: B1–B4 klein (viele Takte)
  und in voller Größe (HERD.md §6, wenige Takte) sowie `hierarchie.herd` (Hierarchie mit Drehung, Kopie, Entfernen,
  Partikel, Fehlerfälle, Abfragen, eigene Form, `paket_voll`) und `listen.herd` (H-K0: `setze_zahlen`/`hole_zahlen` und Listen-
  Fehlerpfade); je Ausbaustufe ein eigenes Skript (`linien.herd`: `Linie`, `Rahmen`; `b5-funken.herd`: `Funken`, klein und voll
  mit 20 000 Teilchen; `gleiten.herd`: `Gleiten` mit allen Kurven und Schleifen, `Ablauf` mit Schleife, Halt, rückwärts und
  Springen, klein und voll mit 9 000 Gleitern; `belag.herd`: `Belag` und `Koerper.belag`; `fuehler.herd`: `Fuehler`-Nachlauf mit N = 200/1 000/10 000; `blick.herd`: `Blick` mit Zoom, Drehung, Grenzen, HUD und `Leine` 2D/3D, klein und mit N = 10 000; `wucht.herd`: `Wucht` in einer Schüssel mit N = 120/500/2 000 Kugeln; `gelaende.herd`: `Gelaende` mit Umbau, Kopie, Textur, N = 24 und 256 × 256, auch mit Neubau je Takt; `vorlage.herd`: `Vorlage` 2D/3D mit Kopie-Wellen, Vieleck-Kind, Umhängen, `ohne`, mit N = 40/1 000; `fliesen.herd`: `Fliesen` als CHUNKS × CHUNKS Raster mit
  wanderndem Blick, Wucht-Körpern auf festen Kacheln, gedrehtem/verschobenem/HUD-Raster, klein 2 × 2 × 48² und voll 4 × 4 × 256² =
  1024 × 1024 Kacheln; `schatten.herd` (H-K18): Schatten-Auswahl, Packen, Kaskaden, Werfer je Ansicht, klein und mit N = 1 000/L = 8 (B13); `kulisse.herd`: `Kulisse` Titel/Spiel/Pause, verschachtelt, additiv, 3D-Kulisse mit Kamera und Licht, Kopie, Entladen, mit N = 30/2 000; `himmelszelt.herd`: `Himmelszelt` mit Atlas- und Teigling-Seiten (Muster 5), kleinster wacher ID, Vorlage, Entfernen, mit N = 3/100; `material.herd`: Belag-Material mit Teigling-Mustern 6/7, Umstellen, Lösen, Durchsichtiges, N = 24/1000; `regen.herd`: Funken als Regen (Volumen um ein wanderndes Teil, Striche, Licht, Aufschlag mit Spritzern, Rate × `Stimmung.regen` mit Wechsel; im Raum des Teils gedreht und deckend), N = 400/20 000; `stimmung.herd`: Stimmung lose/angehängt/zweite/Vorlage/entfernt, `strahlen` an Körper und Belag, N = 20/2000; `lichter.herd`: viele Lichter an einem drehenden Träger, Spots, Lichter hinter der Kamera/jenseits von fern, Übergang ohne Abschnitt, N = 40/1024; `schwung.herd`: `Schwung` mit Kisten-Türmen auf einem Tisch, Kugeln/Kapseln in einer Gelände-Mulde (Fühler `netz`), Rampe aus eigenem Netz, gedrehter fester Kasten, kinematische Drehscheibe, Drehsperre, Auslöser, Maske, Kind unter gedrehter Gruppe, Stoß/Lage/Entfernen/Kopie mitten im Lauf, klein und voll mit N = 500 Kisten bzw. K = 2 000 Kugeln). Die Felder der Typen `teil-liste`/`zahl-liste`,
  Springen, klein und voll mit 9 000 Gleitern; `belag.herd`: `Belag` und `Koerper.belag`; `fuehler.herd`: `Fuehler`-Nachlauf mit N = 200/1 000/10 000; `blick.herd`: `Blick` mit Zoom, Drehung, Grenzen, HUD und `Leine` 2D/3D, klein und mit N = 10 000; `wucht.herd`: `Wucht` in einer Schüssel mit N = 120/500/2 000 Kugeln; `gelaende.herd`: `Gelaende` mit Umbau, Kopie, Textur, N = 24 und 256 × 256, auch mit Neubau je Takt; `ui.herd`: `Taster`, `Leiste`, `Regler`, ziehbare `Tafel` als HUD unter einem gedrehten, gezoomten `Blick`, Maus per `eingabe` je Takt, `Blick.mausX`/`mausY`, klein und mit N = 2 000). Die Felder der Typen `teil-liste`/`zahl-liste`,
  Lesefeld, Nachtragsfeld und Nachlauf prüft `herd/skript/tests/probe.herd` mit der Test-Komponente `Probe` (dev-dependency mit Feature
  `probe`, nur `cargo test`). Bei Abweichung: erste abweichende Zeile mit Kontext.
  `--nur b3` wählt Läufe, `--ohne-cargo` baut nicht. Stand H1b: alle Läufe bitgleich, ohne Änderung am Kern.
  `teigling.herd` (PD1): `bildchen_teigling` mit echten Teiglingen aus `teigling.wasm`, Fehlercodes 61/62, Bild/Rahmen/Koerper
  mit eigener Textur, `paket_voll`; dazu (PD3) `teigling_muster` mit allen Mustern in ungeraden Größen – damit sind die
  Muster-Teiglinge beider Spieler (Rust über `herd_teigling::teigling_aus`, JS nachgebaut) über die Paket-Hashes bitgleich geprüft.
- `node herd/test-teigling.js` (**blockierend**, PD1): Vorbacker nativ = `teigling.wasm` = `teigling/golden.txt` (§11.4).
- `node herd/test-klang.js` (**blockierend**, H-K14): Klang nativ = `klang.wasm` = `klang/golden.txt` (§12).

### 7.1 Szenen-Skripte (`*.herd`)

Textdatei, eine Anweisung je Zeile, `#` beginnt einen Kommentar. Gelesen von `herd/skript/src/lib.rs` (Rust) und
`herd/skript.js` (JS) – beide Spieler sind absichtlich gleich gebaut.

| Zeile | Bedeutung |
|---|---|
| `<abi_name> arg … [-> var]` | ein Aufruf des Herd-ABI (§3) mit gleichem Namen; Zeiger/Längen/Kapazitäten setzt der Spieler (Retry K-013). Rückgabe optional in `var` |
| `bild [n]` | `bild(n)` (ohne `n`: letzte Nummer + 1), danach Szenen- und Paket-Hash |
| `takte n` | n × (`takt`, `bild`) |
| `wiederhole n [var]` … `ende` | Schleife, `var` = 0 … n − 1 (verschachtelbar) |
| `setze var = ausdruck` | Variable |
| `vorgabe VAR zahl` | Variable mit Standardwert; Kommandozeile `VAR=wert` (bzw. Objekt in JS) überschreibt – so laufen B1–B4 klein und voll |
| `teigling_datei "pfad" [-> var]` | Hilfsaufruf der Spieler: Teigling-Datei lesen und `bildchen_teigling` rufen – so zeichnet `tests/herd/bild.js` Projekte mit `Bildchen.laden` auf (Teiglinge in einem Temp-Ordner; mit `--skript datei.herd` bleiben sie in `datei-teige/` neben dem Skript liegen, damit es sich später nachspielen und messen lässt – Skript also außerhalb des Repos ablegen, z. B. im Scratch-Ordner) |
| `teigling_muster m b h [-> var]` | Hilfsaufruf der Spieler (kein ABI-Export, PD3): baut einen Teigling v1 aus dem festen Muster `m` (1 Schachbrett, 2 Pizza mit durchsichtigem Rand, 3 Rahmen, 4 Zonenplatte, 5 Himmelsseite: zwei Bergketten mit Lichtern vor durchsichtigem Himmel, Horizont bei h/2 (H-K11b); 6 Relief „Noppen“ (Normale in R, G, Rauheit in B, je 32 px eine Noppe), 7 Steinplatten (64-px-Felder mit Fugen) – beide kachelbar (Material); nur Ganzzahlen, `muster_pixel`) mit Mipmaps wie der Vorbacker (SHA-256 im Kopf = 0) und ruft `bildchen_teigling` – Bilder bis 2048² ohne Byte-Listen im Skript (Referenzbilder, Messung) |

**Argumente:** Zahl/Variable/Ausdruck in Klammern (`(zufall(i) * 1280)`), Text als JSON-Zeichenkette, Listen `[a, b]`; erzeugte
Zahlenlisten `[folge ANZAHL var AUSDRUCK]` (H-K10: Eintrag i = AUSDRUCK mit `var` = i, i = 0 … ANZAHL − 1, z. B.
`setze_zahlen fl FL_KARTE [folge (S * S) i (boden(zufall(i) + 0.1))]` – für große Karten ohne lange Literale).
Je nach Signatur: `setze_liste` Liste von IDs; `setze_zahlen` Liste von Zahlen; `form_eigene` zwei Zahlenlisten; `bildchen_neu` Liste der Zeilen und Liste
von Paaren `[["x", "#fff"]]`; `bildchen_rgba b h [bytes]`. **Ausdrücke:** f64 mit `+ - * / %` (wie JS), Klammern,
Vorzeichen, `boden(x)`, `zufall(x)` (Hash von `ToUint32(x)` → [0, 1), in beiden Sprachen bitgleich); i32-Argumente
wie JS `ToInt32`. Keine Winkelfunktionen (JS-`Math` ≠ libm).

**Ausgabe** (beide Spieler, Zeile für Zeile verglichen): `<skriptzeile> <aufruf> <wert>` – i32 dezimal, f64 als `f` + 16
Hex-Ziffern der Bits (zeigt −0 und NaN-Bits), Texte als JSON, Listen `[1,2]`, Zahlenlisten (`hole_zahlen`) `[f…,f…]` je Eintrag
wie f64 (NaN kanonisch), Hashes als Hex – und nach jedem Bild
`B <nr> <szene> <paket>`. `herd-skript datei.herd N=10000 --nur-bilder` zeigt nur die Bildzeilen,
`--mess` misst Kern-Zeit je Takt und Bild (Release-Bau für Messungen, §10).

## 8. Eine Komponente hinzufügen

Siehe HERD.md §9. Kurz: Datei `kern/src/komponenten/<name>.rs` mit `pub static ART: Art` (Schema, optional `takt`, `bild`,
`huelle`), `pub mod <name>;` und **eine Zeile** in `ARTEN`; `node herd/baue.js`. Die Test-Komponente
`komponenten/probe.rs` (nur `cfg(test)`/Feature `probe`) zeigt, dass das genügt (`cargo test erweiterungsprobe`).

## 9. Glut (Schicht 1, `herd/glut`)

Lädt nur hoch und zeichnet – keine Geometrie, keine Szenenlogik. Eingabe ist ausschließlich das Bildpaket (§4).

```rust
use herd_glut::{Adapter, Glut, Optionen, Ziel};
// offscreen (Werkzeug, Tests, Host --herd-bilder):
let mut glut = Glut::neu(Ziel::Offscreen { breite: 1280, hoehe: 720 }, &Optionen::default())?;
let stat = glut.bild(kern.paket())?;          // Ressourcen-Deltas + Instanzen hochladen, Durchgänge ausführen
let rgba = glut.lies_pixel()?;                // nur offscreen: RGBA8, Zeilen von oben
glut.groesse(1920, 1080);                     // neue Zielgröße (Gerätepixel)
// Fenster (Paket H5 – kompiliert und typgeprüft, in diesem Paket nie ausgeführt):
let mut glut = Glut::neu(Ziel::Fenster { fenster: Arc::new(winit_fenster), breite, hoehe },
                         &Optionen { adapter: Adapter::Gpu, vsync: true, ..Default::default() })?;
glut.bild(paket)?;                            // zeichnet und präsentiert; verdeckt/minimiert → Bild ausgelassen
glut.groesse(neue_breite, neue_hoehe);        // bei WindowEvent::Resized
```

- **Browser (H6):** `Glut::neu_async(Ziel::OffscreenCanvas { canvas, breite, hoehe } | Ziel::Canvas { … }, &opt).await` (nur
  `wasm32`); `Glut::neu` ist nativ `pollster::block_on(neu_async(…))`. wgpu nimmt WebGPU (geprüft per Adapter), sonst WebGL2
  (`Limits::downlevel_webgl2_defaults`); `schnittstelle()` sagt welches. Auf GL bekommt der Atlas mindestens 2 Schichten.
  JS-Seite: `site/js/herd/zeichner.js`, `render-worker.js`, `ui/src/herd.js` (HERD.md §7.2).
- **`Ziel`**: `Offscreen { breite, hoehe }` oder `Fenster { fenster: Arc<dyn FensterHandle>, breite, hoehe }` (`FensterHandle` =
  `HasWindowHandle + HasDisplayHandle + Debug + Send + Sync`, z. B. `winit::window::Window`). Größen in Gerätepixeln; das Spielfeld
  wird seitentreu eingepasst, Ränder in `hintergrund`.
- **`Optionen`**: `adapter` (`Software` = Standard: WARP/lavapipe/llvmpipe; `Gpu` nur auf ausdrücklichen Wunsch), `msaa` (4, fällt
  auf 1 zurück), `instancing` (`false` = Grundlinie, ein Draw-Call je Objekt), `vsync` (Fenster: `true` = `PresentMode::Fifo`,
  nie Tearing; `false` = `AutoNoVsync`). `Glut::neu` übersetzt **alle Pipelines fürs Zielformat vorab** (Warm-up: FXC/ANGLE kosten
  sonst im ersten Bild 30–350 ms und lassen die Takte nachholen). `HERD_SOFTWARE=1` erzwingt
  Software. Ohne Software-Adapter → `Fehler::KeinSoftwareAdapter` (kein Rückfall auf die GPU); geprüft wird `DeviceType::Cpu`.
  Hinweis: wgpu fragt beim Aufzählen unter DX12 die Fähigkeiten **aller** Adapter ab (kurzlebiges Gerät je Adapter, ohne
  Zeichnen) – über die öffentliche wgpu-API nicht vermeidbar.
- **Weitere:** `statistik()` (Draw-Calls, davon Schatten, Instanzen 2D/3D, Dreiecke, hochgeladene Bytes inkl. TEXTUR-Stufen),
  `textur_speicher()` (PD3: eigene Texturen – Bilder, Nutzlast, angelegter Grafikspeicher), `warte()` (für Messungen),
  `adapter_info()`, `msaa()`, `setze_instancing(b)`. Neue Glut für eine laufende Welt (Fenster neu) → vorher `kern.paket_voll()`.
- **Ressourcen:** SCHRIFT → R8-Textur; ATLAS_SEITE → Schicht eines RGBA8-Textur-Arrays 2048² (wächst durch Neuanlage + Kopie);
  ATLAS_STUECK → `write_texture` in die Schicht; NETZ → Ecken-/Indexpuffer je ID. **Schatten-Tiefentextur** (Depth32Float,
  Textur-Array aus Schichten 2048², H-K18) erst beim ersten Schattenbild, wächst nur: Schicht 0 = Sonne (v1) bzw. Kaskade 0 … k − 1,
  dahinter die Atlas-Seiten der Punkt-/Spot-Kacheln (höchstens 4 = 4096² Texel; auf GL mindestens 2 Schichten wie der Atlas) –
  16 MB je Schicht, v1 also wie bisher eine Schicht. Instanzpuffer wachsen nur (Zweierpotenzen), Pipelines einmal je Zielformat (Cache).
- **Eigene Texturen (TEXTUR, PROJEKTE PD3):** fünf **Größenklassen** 128, 256, 512, 1024, 2048 (kleinste Zweierpotenz ≥ max(b, h),
  mindestens 128), je Klasse ein `Rgba8Unorm`-Textur-Array mit voller Mip-Kette; ein Bild = eine Schicht, Stufe i des Teiglings an
  (0, 0) der Mip-Ebene i (keine Neuberechnung – die Mipmaps des Vorbackers, K-147). Beim Hochladen **vormultipliziert** (bilineare
  Mischung an durchsichtigen Rändern ohne dunkle Säume), der Shader rechnet nach dem Abtasten zurück. Leere Klassen sind 1 × 1-
  Platzhalter; eine Klasse wächst je Paket einmal auf die nötige Schichtenzahl (Neuanlage + Kopie aller Stufen, auf GL mindestens
  2 Schichten wie der Atlas). Grenze: `max_texture_array_layers` (WebGL2 256) je Klasse, darüber bleibt ein Bild unbekannt.
  Unbekanntes Pixelformat (≠ 0) → `Fehler::Paket`. Die Instanzen behalten ihr Paketformat; die Glut schreibt beim Hochladen nur
  ihre Kopie um: INST2D art 6 `seite` (Textur-ID) → `Klasse << 21 | Schicht`, INST3D Bit 17 Bits 0–15 → `Klasse << 13 | Schicht`
  (Klasse 7 = Textur unbekannt: 2D unsichtbar, 3D ohne Textur). So bleibt 2D **ein** Draw-Call und 3D ein Draw-Call je Zug, auch
  mit beliebig vielen Bildern. Ohne geladene Teiglinge laufen Hochladen und Shader wie vorher (Atlas-Pfad unverändert).
  Grafikspeicher je Klasse `kante² · 4 · 4/3` je Schicht: ein Bild mit Zweierpotenz-Kante belegt genau seine Teigling-Stufen, sonst
  bis knapp das Vierfache (1025² → Klasse 2048); `textur_speicher()` meldet Bilder, Nutzlast und angelegten Speicher.
- **Durchgänge:** Schatten (nur Tiefe, Steigungs-Bias; je benutzter Schicht ein Durchgang, je Zug Viewport = Rechteck der Ansicht und
  Ansicht·Projektion über einen dynamischen Uniform-Versatz an Bindung 20 – Eintrag 0 = `licht_proj`, 1 + a = Ansicht a aus
  SCHATTENLICHTER) → Haupt (MSAA 4×, Viewport = eingepasstes Spielfeld): Himmel,
  `FEST` (instanziert je Netz), `DURCH` (Rückseiten, dann Vorderseiten, mischen), 3D-Teilchen (`TEILCHEN3D`, je Mischart ein
  instanzierter Draw-Call, Tiefe testen, nicht schreiben; leuchtend One/One, deckend „source over“), 2D (**ein** instanzierter
  Draw-Call, 6 Ecken aus `vertex_index`). Das Ziel speichert sRGB-kodierte Werte (Format ohne sRGB-Umwandlung); 3D rechnet linear.

**Vertex-Layouts:** Netz-Ecke 32 B (`pos` @0, `normale` @12, `uv` @24). INST3D 72 B als Instanzpuffer: Zeilen der Welt-Matrix
@0/@16/@32 (`Float32x4`), Farbe @48 (`Unorm8x4`), `glanz, leuchten` @52 (`Float32x2`), Atlas-Rechteck @60 (`Uint16x4`),
`textur` @68 (`Uint32`). INST2D 56 B: `m` @0 (`Float32x4`), `t` @16, `h` @24, `p` @32 (je `Float32x2`), Farbe @40 (`Unorm8x4`),
`art|seite<<8` @44 (`Uint32`), Atlas-Rechteck @48 (`Uint16x4`). TEILCHEN3D 20 B: `pos` @0 (`Float32x3`), `r` @12 (`Float32`),
Farbe @16 (`Unorm8x4`). Die Bytes kommen unverändert aus dem Paket. Statistik: Teilchen zählen zu `instanzen_3d` und `dreiecke`.

**Shader** (`glut/shader/`, WGSL; jedes Programm = `gemeinsam.wgsl` + Datei): `gemeinsam` (Uniform-Block SZENE 592 B, Glut-Block
`Ansicht`: Gerätepixel je Spielfeldpixel, Schriftgröße; sRGB-Umrechnung, Rauschen gegen Farbstufen) · `flach` (2D-Uber-Shader:
SDF-Rechteck mit Rundung/Umriss, SDF-Kreis/Partikel, Kantenglättung über `fwidth` des Abstands, Atlas-Bild per `textureLoad`
pixelscharf, SDF-Glyphe, Dreieck (H-K3b: Ecken aus der Instanz, baryzentrischer Abstand zu den Außenkanten, Glättung nur dort; Höhen
flach über `uvbox` an den Fragment-Shader – keine neuen Varyings, WebGL2-tauglich), Texturbild (PD3, art 6)) · eigene Texturen
in `gemeinsam` (PD3: Bindungen 7 … 11 = Klassen, 12 = Sampler linear (seit „Material“ wiederholend, Stufen linear, anisotrop – für die expliziten Abtastungen ohne Wirkung); Stufe λ = ½ log2 max(|∂t/∂x|², |∂t/∂y|²)
der Texel-Koordinaten am Anfang des Fragment-Shaders; λ ≤ 1/16 → nächster Nachbar aus Stufe 0, sonst zwei bilineare Abtastungen
der Stufen ⌊λ⌋ und ⌊λ⌋ + 1 mit **expliziter** Stufe, je auf das Rechteck `u0 v0 u1 v1` dieser Stufe geklemmt (kein Übersprechen
zwischen Rahmen-Neunteln), λ höchstens log2 der Rechteckkante; danach durch Alpha teilen) · `licht` (Halbkugel-Umgebung, Sonne Lambert + Blinn-Phong, bis 8 Punktlichter aus SZENE oder – mit Abschnitt LICHTER – alle Lichter der Zelle des Fragments
(Bindungen 14 Kopf, 15 `lichter_t` RGBA32F mit 64 Lichtern à 3 Texel je Zeile, 16 `zellen_t` R32Uint 1024 breit; nur `textureLoad`, Texturen wachsen
nur; ohne Abschnitt schreibt die Glut den Kopf auf 0 → v1-Pfad), Spot-Kegel per smoothstep, Eigenleuchten, Textur (Atlas oder eigene, Bit 17),
Nebel, sanfte Schulter gegen Überstrahlen) · Material-Zusatz in `licht` (ZUSATZ3D als dritter Instanzpuffer @10 relief `Uint32`, @11 kachel + metall `Float32x2`, @12 merkmale `Uint32`;
ohne Abschnitt Nullen; die Glut schreibt das Relief-Kennwort wie INST3D auf `Klasse << 13 | Schicht` um): Kachelung über den Sampler der eigenen Texturen
(Bindung 12: wiederholend, Stufen linear, anisotrop 8, wenn `DownlevelFlags::ANISOTROPIC_FILTERING`; die expliziten PD3-Abtastungen klemmen ihre
Koordinaten selbst, ihre Bilder bleiben gleich – ein zweiter Sampler auf denselben Texturen geht unter WebGL2 gar nicht: naga macht aus
Textur + Sampler **einen** GLSL-Sampler und lehnt eine Textur mit zwei Samplern ab) über `textureSampleGrad` mit Ableitungen, die im gleichförmigen Kontrollfluss
vor jedem `discard` berechnet werden; Welt-Abbildung nach der größten Normalenkomponente (feste Tangenten), uv-Abbildung mit Kotangenten aus
`dpdx/dpdy` (Schüler 2006, für die nach unten zeigende Bildschirm-y-Achse gedreht); `pbr_licht`: GGX (Smith nach Heitz, Schlick), Lambert ohne
1/π wie die Engine (Glanz daher × π), Halbkugel-Umgebung diffus und in Spiegelrichtung, Pfützen aus drei Oktaven Wertrauschen (Ganzzahl-Hash)
· `nachbild` (Stimmung, eigenes Layout: 0 Quelle, 1 Sampler linear, 2 Stimmung, 3 Bloom-Stufe 0; `fs_vorfilter` 13 Abtastungen mit
Karis-Mittel und weichem Knie, `fs_ab` 13 Abtastungen, `fs_auf` Zelt 3 × 3 × `bloomWeite` additiv, `fs_abschluss` Belichtung + Bloom/Σ Gewichte,
ACES (Hill), Sättigung, Vignette, Korn, sRGB + Dither; HDR-Ziel Rgba16Float mit MSAA, falls der Adapter es kann – sonst Rgba8Unorm bzw.
ohne MSAA; die 3D-Shader prüfen `hdr_an()` (Bindung 17) und geben dann linear aus, mit Höhennebel)
· `schatten` (nur Tiefe, Matrix aus Bindung 20, Textur-Texel < ½ Deckkraft werfen keinen Schatten) · Schatten in `licht` (H-K18): Sonne
ohne Abschnitt SCHATTENLICHTER unverändert (`zeltfilter`, Schicht 0); sonst `sonne_neu` (Kaskaden: die erste, deren Bild den Punkt
samt Filterrand enthält, am Rand der letzten weich ausgeblendet; bzw. v1-Matrix mit anderer Weichheit); Punkt-/Spotlichter in beiden
Zellen-Schleifen nur, wenn Bits 16 … 19 des Zellen-Eintrags einen Platz nennen (`punktschatten`: Würfelseite nach der größten
Achse von Licht → Punkt, keine Cube-Map; Normalen- und Lichtversatz = Weltmaß eines Texels an dieser Stelle × (1 + Weichheit));
`zelt_frei`: derselbe Castaño-Zeltfilter mit Texel-Schritt `w` (0 = eine bilineare Vergleichs-Abtastung), jede Abtastung auf
das Kachel-Rechteck geklemmt; im Spiegeldurchgang keine Punkt-/Spotschatten (nur die 8 Lichter aus SZENE) · `himmel`
(Verlauf nach Blickrichtung aus der Inversen von `ansicht_proj`; H-K11b `fs_zelt` für das Himmelszelt: Uniform-Block HIMMELSZELT an
Bindung 13 (fest 208 B, immer gebunden), Würfelseite und Seitenkoordinate ohne Verzweigung aus der Richtung – **keine Cube-Map**;
Bild-Seiten aus dem Atlas per `textureLoad` (bilinear von Hand, vormultipliziert) oder aus der eigenen Textur (Bit 17, Glut
schreibt ihre Kopie wie INST3D auf `Klasse << 13 | Schicht` um; bilinear auf Stufe 0 beim Vergrößern – anders als PD3 weich, weil der
Himmel stark vergrößert wird –, trilinear beim Verkleinern; Stufe aus dem Winkel je Pixel |∂d| statt aus den Texel-Ableitungen,
damit an den Würfelkanten keine Sprünge entstehen); Deckkraft mischt über den prozeduralen Himmel; prozedural: Verlauf
`boden → horizont → oben`, Sonnenscheibe ±1 Pixel weich, vom Horizont abgeschnitten, mit Schein; Sterne je Zelle eines im Winkel
gleichmäßigen 128²-Rasters je Seite (PCG-Hash, 3,5 % der Zellen, Radius 1,3 … 2,5 Gerätepixel – auf WARP und SwiftShader gleich weich))
· `funken` (3D-Teilchen: Viereck aus `vertex_index`, Kamera-rechts/
-oben aus den Zeilen 0/1 von `ansicht_proj` – kein neues Uniform; leuchtend = Schein (1 − r²)² mit heißem Kern, im Nebel
ausgeblendet; deckend = Scheibe mit weichem Rand, zur Nebelfarbe gemischt). Ableitungen nur in gleichförmigem Kontrollfluss, Texturen per
`textureLoad`/`…Level` (naga-/WebGL2-tauglich). ZUSATZ_TEILCHEN als zweiter Instanzpuffer (Slot 1: @3 `strich` `Float32x3`, @4 `merkmale`
`Uint32`; ohne Abschnitt Nullen): Strich = Viereck entlang der Achse, quer zur Kamera, halbe Breite mindestens 0,6 Gerätepixel
(Weltmaß eines Pixels aus `w` und P11 = Länge von Zeile 1), Deckkraft × Größe/Breite, längs vom Schwanz auslaufend, Kopf und
Schwanz gerundet; schaut man fast entlang der Achse, rundes Teilchen. Licht je Teilchen **im Vertex-Shader** (Umgebung, Nebelfarbe,
Sonne, Lichter der Zelle bzw. die 8 aus SZENE, Vorwärtsstreuung 0,35 + 3,65 · max(0, Blick · zum Licht)⁶) – die Bindungen 15/16
sind dafür auch im Vertex-Stadium sichtbar (nur `textureLoad`, unter WebGL2 Vertex-Texturen). `licht`: `pbr_licht` mit
`Stimmung.regen` (STIMMUNG `spiegel.z`): Ringe aus `regenringe` (zwei Zell-Lagen, 3 × 3 Nachbarn, Ganzzahl-Hash, Welle
sin(2x)·e^(−x²) als Ableitung) als Neigung der Normale vor der Spiegelung, Rinnsale an Wänden aus Wertrauschen.

**Bindungen und Einheiten** (H-K15; maßgeblich nach HERD.md §13.1 Regel 4 – jede Glut-Stufe trägt ihre Bindungen hier ein, der
**Bindungswächter** `cargo test -j 2 -p herd-glut waechter -- --nocapture` druckt die Zählung und scheitert über der Grenze). Unter
WebGL2 zählen zwei Dinge, beide prüft der Wächter:

1. **Je Shader-Stufe (GLSL):** naga übersetzt jeden Einstiegspunkt nach GLSL ES 3.00 und legt je **benutzter Textur einen**
   GLSL-Sampler an – `textureLoad` (`texelFetch`) und Abtastungen derselben Textur teilen ihn, der WGSL-Sampler wird nur
   zugeordnet (eine Textur mit zwei Samplern lehnt naga ab). Grenzen (WebGL2-Minimum): Fragment ≤ 16, Vertex ≤ 16, eine Pipeline
   zusammen ≤ 32 Einheiten, ≤ 12 Uniform-Blöcke je Stufe.
2. **Je Pipeline-Layout (wgpu-GL):** wgpu-hal vergibt die Textureinheiten nicht je Shader, sondern je **Layout-Eintrag** über
   alle Stufen (`MAX_TEXTURE_SLOTS` = 16; Vertex-Texturen teilen sich also dieselben 16), ebenso die Sampler (≤ 16); Uniform-Puffer
   ≤ 12 je Stufe. Ein Eintrag kostet auch dann eine Einheit, wenn ein Programm des Layouts ihn nicht benutzt. Die Layouts stehen
   als `layout_haupt`/`layout_schatten`/`layout_nachbild` in `glut/src/lib.rs`; jeder Einstiegspunkt darf nur Bindungen seines
   Layouts in dessen Sichtbarkeit benutzen.

| Bindung | Art | Sichtbar | benutzt (Einstiegspunkt, Zugriff) | Einheit | seit |
|---|---|---|---|---|---|
| 0 | Uniform SZENE | VS + FS | alle (Schatten-Layout ebenso) | Block | H2 |
| 1 | Uniform `Ansicht` | VS + FS | `vs_flach` | Block | H2 |
| 2 + 3 | Schatten-Tiefentextur `texture_depth_2d_array` (Sonne/Kaskaden + Atlas-Seiten der Punkt-/Spot-Kacheln) + Vergleichs-Sampler | FS | `fs_licht` (`textureSampleCompareLevel`) | 1 | H2, H-K18 (Array statt 2D: keine neue Einheit) |
| 4 | Atlas `texture_2d_array` (nicht filterbar) | FS | `fs_flach`, `fs_zelt`, `fs_licht`, `fs_schatten` (`textureLoad`) | 1 | H2 |
| 5 + 6 | Schrift R8 + Sampler linear | FS | `fs_flach` | 1 | H2 |
| 7 … 11 + 12 | eigene Texturen (PD3-Klassen 128 … 2048) + Sampler `eigen_s` | FS | `fs_flach`, `fs_zelt`, `fs_licht` (`textureLoad` und `…Level`/`…Grad`), `fs_schatten` (`textureLoad`, Layout ohne Sampler) | 5 | PD3, Material |
| 13 | Uniform HIMMELSZELT | VS + FS | `fs_zelt` | Block | H-K11b |
| 14 | Uniform Lichter-Kopf | VS + FS | `fs_licht`, `vs_funke` | Block | viele Lichter |
| 15 | `lichter_t` RGBA32F | VS + FS | `fs_licht`, `vs_funke` (`textureLoad`) | 1 | viele Lichter, Regen (VS) |
| 16 | `zellen_t` R32Uint | VS + FS | `fs_licht`, `vs_funke` (`textureLoad`) | 1 | viele Lichter, Regen (VS) |
| 17 | Uniform STIMMUNG | VS + FS | 3D-Fragment-Shader | Block | Stimmung |
| 18 | Uniform SCHATTENLICHTER (5 200 B: Kopf, Kaskaden, Plätze, 52 Ansichten) | VS + FS | `fs_licht` | Block | H-K18 |
| 19 (+ 12) | Spiegelbild `texture_2d` | FS | `fs_licht` (`textureSampleLevel` mit `eigen_s`) | 1 | Spiegelung |
| 20 | Uniform Ansicht·Projektion je Schatten-Zug (**Schatten-Layout**, dynamischer Versatz, 64 B je 256-B-Eintrag) | VS | `vs_schatten` | Block | H-K18 |
| *21* | *Verdeckung (SSAO, halbe Auflösung)* | *FS* | *`fs_licht`* | *1* | *geplant H-K24* |
| *22* | *Gelenk-Palette RGBA32F (Haupt- **und** Schatten-Layout)* | *VS* | *`vs_licht`, `vs_schatten`* | *1* | *geplant H-K23b* |
| *–* | *Szenenfarbe + Tiefe (Bildschirmraum-Kopien)* | *FS* | *`fs_wasser` im **eigenen** Layout `wasser`* | *0 im Haupt-Layout* | *geplant H-K28* |
| – | Spiegel-Zellen | | in `zellen_t` (16) | 0 | H-K21 |
| – | Normal-, Stoff-, Leucht-Karten | | über die PD3-Klassen 7 … 11 | 0 | H-K26 |
| – | Wind (Uniform-Block), Streu-Instanzen (Instanzpuffer) | | | 0 (Block) | H-K27 |

Nachbild-Layout (eigen): 0 Quelle + 1 Sampler, 2 Uniform STIMMUNG, 3 Bloom-Stufe 0 (+ 1). Die Bindungsnummern 21 ff. sind
Vorschläge (vergeben in Merge-Reihenfolge, HERD.md §13.1 Regel 1); maßgeblich sind die Einheiten.

**Stand H-K18 (gemessen, Wächter; H-K15 → H-K18):**

| Layout | Texturen | Sampler | Uniform-Puffer VS/FS | nach dem Plan (§13) |
|---|---|---|---|---|
| haupt | **11/16** (H-K15: 11) | 3/16 | 6/12 · 6/12 (H-K15: 5 · 5) | 13/16 Texturen (+ H-K24, + H-K23b), ≤ 9/12 Blöcke (+ BILDRAUM, WIND) |
| schatten | 6/16 | 0/16 | 2/12 · 1/12 (H-K15: 1 · 1) | 7/16 (+ Gelenk-Palette) |
| nachbild | 2/16 | 1/16 | 0/12 · 1/12 | – |

| Einstiegspunkt | Einheiten | Blöcke | Einstiegspunkt | Einheiten | Blöcke |
|---|---|---|---|---|---|
| `vs_flach` | 0 | 2 | `fs_flach` | 7 | 1 |
| `vs_himmel` | 0 | 1 | `fs_himmel` / `fs_zelt` | 0 / 6 | 2 / 3 |
| `vs_licht` | 0 | 1 | `fs_licht` | **10/16** | 4 |
| `vs_schatten` | 0 | 1 | `fs_schatten` | 6 | 0 |
| `vs_funke` | 2 | 4 | `fs_leuchtend` / `fs_deckend` | 0 / 0 | 1 / 2 |
| `vs_voll` | 0 | 0 | `fs_vorfilter` / `fs_ab` / `fs_auf` / `fs_abschluss` | 1 / 1 / 1 / 2 | 1 / 0 / 1 / 1 |

**Budget-Planung der übrigen Glut-Stufen** (HERD.md §13.3; maßgeblich ist das Haupt-Layout, 16 Einheiten über **alle** Stufen –
Vertex-Texturen haben unter wgpu-GL keinen eigenen Pool): H-K18 hat **keine** Einheit gekostet (die Schatten-Tiefentextur ist ein
Array statt 2D, Kacheln und Kaskaden liegen in ihren Schichten, die Matrizen in Uniform-Blöcken). Danach: **H-K21** 0 (Spiegel-Zellen in
`zellen_t`) · **H-K24** +1 (Verdeckung; der SSR-Strahlmarsch und der Vorlauf laufen in eigenen Layouts wie das Nachbild, `fs_licht`
liest nur das Verdeckungsbild) → 12 · **H-K26** 0 (PD3-Klassen) · **H-K23b** +1 (Gelenk-Palette, im Haupt- **und** Schatten-Layout) → 13 ·
**H-K27** 0 (Uniform-Block WIND, Instanzpuffer) · **H-K28** 0 im Haupt-Layout: der Wasser-Zug bekommt ein **eigenes Layout** `wasser`
(SZENE, STIMMUNG, Lichter, Schatten, Spiegelbild, Szenenfarbe, Tiefe ≈ 9/16) statt Szenenfarbe und Tiefe ins Haupt-Layout zu legen. Ende
des Plans: Haupt-Layout **13/16** Texturen, 9/12 Uniform-Blöcke; 3 Einheiten Reserve. **Konsolidierung, falls doch eng:** (1) Schrift
(5) als R-Kanal einer Atlas-Schicht (−1), (2) `lichter_t` + `zellen_t` als eine RGBA32Uint-Textur mit `bitcast` (−1), (3) Verdeckung in
den Alpha-Kanal des Spiegelbilds (19) (−1), (4) PD3-Klassen 128 und 256 zusammenlegen (−1, Speicher für kleine Bilder ×4).

Die Annahme aus dem Plan (HERD.md §13.3 H-K15), `fs_licht` belege 15/16, weil `textureLoad` und Abtastung derselben PD3-Klasse je
eine Einheit kosteten, trifft für naga/wgpu 30 nicht zu: es waren schon vorher 10. Der geplante Umbau von `eigen_lade` auf
`textureSampleLevel` an der Texelmitte hätte keine Einheit gespart und unterbleibt (Shader unverändert, alle Bilder bitgleich).
Die knappe Größe ist das **Haupt-Layout** (H-K15 rechnete mit 16/16 nach allen Reservierungen); die Planung oben (H-K18) kommt mit
13/16 aus.

**Sonnenschatten (H2a repariert):** Ursache der „schwachen Flecken“ war ein veralteter Uniform-Block im Shader (560 statt 592 Bytes,
ohne `hintergrund`/`feld`): Der Shader las den Tiefen-Bias aus der Hintergrundfarbe (≈ 0,9) und die PCF-Schrittweite aus 1,0 – fast
alles galt als beleuchtet. Jetzt: Block feldgleich mit `paket.rs`, PCF als **Zeltfilter 5 × 5 Texel aus 9 bilinearen Vergleichen**
(Castaño 2013, glatte Kanten ohne Treppen), Normalenversatz 0,5 … 2 Texel je nach Lichteinfall, Tiefen-Bias aus dem Kern
(1,5 Texel) plus Steigungs-Bias im Schattendurchgang. Ergebnis: deutlich sichtbare, weiche Schatten ohne Akne und ohne sichtbares
Ablösen; bei sehr flacher Sonne in Nahsicht bleibt eine leichte Welligkeit (eine 2048er-Map für die ganze Sicht) – dafür gibt es seit
H-K18 `Licht.kaskaden` (2 … 4 Schichten 2048², praktische Teilung) und `schattenWeite`.

## 10. Werkzeug `herd-bild`, Referenzbilder, Messungen

Alle Läufe **offscreen** und standardmäßig auf dem **Software-Adapter**; die echte GPU nur mit `--gpu`/`HERD_GPU=1` (vom Nutzer).

| Aufruf | Zweck |
|---|---|
| `herd-bild bild <skript.herd> <ordner> [--bilder=1,60] [--groesse=BxH] [--ohne-instancing] [--msaa=1] [VAR=zahl]` | Skript abspielen, gewählte Bilder (Standard: Kopfzeile bzw. letztes) als PNG |
| `herd-bild bench <skript.herd> [--groesse=640x360] [--ohne-instancing] [--gpu] [VAR=zahl]` | Glut-Zeit je Bild (ohne Auslesen), Draw-Calls, Instanzen als JSON |
| `herd-bild referenz [ordner] [--nur=a,b]` | Referenzbilder `tests/herd/bilder/*.herd` → `*.png` neu schreiben (`--nur`: nur diese Skripte, die übrigen PNGs bleiben byte-gleich) |
| `herd-bild textur [--kanten=256,1024,2048] [--laeufe=5] [--gpu]` | PD3-Messung je Kante: Kern `bildchen_teigling`, Glut-Bild mit/ohne TEXTUR-Hochladen, hochgeladene Bytes, Grafikspeicher (JSON) |
| `herd-bild atlas` | Schriftatlas `kern/schrift/atlas.bin` neu erzeugen |

**Referenzbilder** (`tests/herd/bilder/`, Skript + PNG, Kopfzeile `#! bild 40 groesse 1280x720`): `2d-alles` (alle 2D-Komponenten,
Umriss/Rundung, Text in mehreren Größen, Bildchen gespiegelt/getönt, Animation, Partikel, Ebenen, Hierarchie mit Drehung,
Durchsichtiges), `3d-alles` (alle Grundformen + eigene Form, Sonne mit Schatten, 2 Punktlichter, Nebel, Himmel, Textur,
Durchsichtiges, 2D-HUD), `3d-viele` (nach B3: 240 Körper, 8 Lichter), `2d-partikel` (nach B4), `3d-funken` (H-K5: Steinofen bei Nacht, leuchtende
Funken aus Maul und Schlot, deckender Rauch, Nebel, schräge Kamera), `2d-vieleck` (H-K3b) und für die eigenen Texturen (PD3,
Muster-Teiglinge über `teigling_muster`): `2d-textur` (Pizza vergrößert pixelscharf, Zonenplatte 1 : 1 und verkleinert,
Schachbrett verkleinert und gedreht, Pizzen immer kleiner ohne dunklen Rand, getönt, gespiegelt, Atlas-Bildchen daneben),
`2d-rahmen-textur` (`Rahmen` aus Texturen 48² und 96 × 60: vergrößert, 1 : 1, verkleinert, gestreckt, gestaucht, getönt, gedreht,
Atlas-Rahmen zum Vergleich), `3d-textur` (Boden mit Schachbrett 512² flach bis zum Horizont – nah pixelscharf, fern trilinear ohne
Moiré –, schräge Wand mit Zonenplatte, Würfel mit ausgeschnittener Pizza samt Schatten, Kugel 64², Belag mit 96 × 60, Atlas-Würfel),
`3d-spiegel` (Spiegelung: Neonröhren auf nassem Plattenboden, Spiegelbild in Pfützen, Bloom, Höhennebel),
`3d-regen` (Regen: nasser Platz mit Wand, Neonröhren und Laterne als Spot, zwei Sprüher im Volumen um die Kamera – Striche im Licht,
Spritzer, Pfützenringe und Rinnsale bei `Stimmung.regen` 0.8),
`3d-material` (Material: nasser Plattenboden in Weltmaß mit Noppen-Relief und Pfützen, metallische Wand in uv-Kachelung, Kugel mit Relief,
farbige Lichter knapp über dem Boden, Spot; ohne Stimmung),
`3d-stimmung` (Stimmung: drei Neonröhren, zwei mit `strahlen` 6 und Bloom, Höhennebel, Vignette, 2D-Balken darüber),
`3d-lichter` (viele Lichter: nächtliche Gasse, 256 farbige Punktlichter knapp über nassem Boden, 4 Spots mit weichem Rand),
`3d-himmelszelt` (H-K11b: Abenddämmerung prozedural mit tiefer Sonnenscheibe und Sternen, Seite rechts aus einem Teigling 512²
mit Bergketten vor durchsichtigem Himmel, Seite oben aus einem Atlas-Bildchen 24² mit halb durchsichtigen Wolken, Würfelkanten
sichtbar),
`3d-punktschatten` (H-K18: nächtlicher Hof mit Säulen, Kisten und Kugeln; drei Punktlichter mit Würfelschatten fein/mittel/grob,
zwei Spots als Kacheln, Schatten auf klassischem und pbr-Boden), `3d-kaskaden` (H-K18: lange Allee, flache Sonne mit 4 Kaskaden bis
80 m, dünne Zaunlatten vorn scharf, Säulen bis weit hinten).
**Pixeltest** in `cargo test`
(`herd-werkzeug`): rendert jedes Skript auf dem Software-Adapter und vergleicht mit Toleranz K-129 (mittlere Abweichung ≤ 1,5 %,
≥ 98 % der Pixel innerhalb 10/255); ohne Software-Adapter wird er mit Hinweis übersprungen. Dazu: Instancing ändert das Bild nicht
(nur die Zahl der Draw-Calls), kaputtes Paket → `Fehler::Paket`, Fenster-API kompiliert (`herd-glut`, ohne Fenster); PD3:
verkleinertes Schachbrett ergibt über die Mipmaps die gleichmäßige Mischfarbe (nächster Nachbar träfe nur eine Feldfarbe) bei einem
Draw-Call und richtigem `textur_speicher()`, Vergrößerung Texel für Texel gleich der Quelle (halb durchsichtiger Rand mit eigener
Farbe), unbekanntes TEXTUR-Pixelformat → `Fehler::Paket`. Im Browser vergleicht E2E 13 dieselben Szenen (WebGL2/SwiftShader).

**Messungen:** `node bench/herd/mess-kern.js` (Kern nativ/Wasm), `herd-bild bench` (Glut auf WARP), Größe mit Profil `klein` –
Ergebnisse und die Kommandos für die echte GPU in `bench/herd/ERGEBNISSE.md`. Profile: `messung` (Release ohne LTO, schont
Speicher) und `klein` (opt-level "z", LTO, strip).

## 11. Vorbacker `herd/teigling` (PROJEKTE.md §5.3, K-147)

PNG und JPEG sind nur **Eingabe**: der Vorbacker backt sie einmal zu einem **Teigling** (RGBA8 nicht vormultipliziert +
Mipmaps bis 1 × 1). Derselbe Rust-Code läuft nativ und als `site/js/herd/teigling.wasm` (Browser-Worker, Node-CLI,
Interpreter, Harnische) und rechnet **nur mit Ganzzahlen** → bitgleich per Konstruktion. Einzige Abhängigkeit:
`miniz_oxide` 0.8.9 (Inflate, `no_std`, in `Cargo.lock` gesperrt); PNG- und JPEG-Decoder sind eigener Code. Der native Host
braucht den Vorbacker nicht (er bekommt fertige Teiglinge im pkarton, PA2).

### 11.1 Decoder

- **PNG** (`png.rs`): Farbtypen Grau, Grau+Alpha, RGB, RGBA, Palette; Bittiefen 1/2/4/8/16; alle fünf Filter; `tRNS` (Palette:
  Alpha je Eintrag, fehlende = 255; Grau/RGB: Farbschlüssel, verglichen in der **Original**-Bittiefe vor dem Kürzen); 16 bit →
  obere 8 Bit, Grau < 8 bit → `v × 255 / (2^b − 1)` (abgerundet). CRC **jedes** Abschnitts wird geprüft, IDAT dürfen geteilt sein,
  `IEND` ist Pflicht, die dekomprimierte Länge muss **genau** `Höhe × (1 + Zeilenbytes)` sein (Inflate mit hartem Limit).
  Kein lesbares Bild: Adam7 (Interlace-Byte ≠ 0), APNG (`acTL`/`fcTL`/`fdAT`), unbekannter kritischer Abschnitt, Paletten-
  index außerhalb der Palette, fehlendes `PLTE` bei Farbtyp 3, Filtertyp > 4. Ignoriert: `gAMA`, `cHRM`, `sRGB`, `iCCP`,
  Text und alle anderen Zusatzabschnitte (Rohwerte, keine Farbverwaltung).
- **JPEG** (`jpeg.rs`): SOF0/SOF1 (Baseline/erweitert, Huffman) und SOF2 (progressiv: Spektralauswahl, schrittweise
  Näherung, EOB-Läufe), 8 bit, 1 Komponente (Grau) oder 3 (YCbCr), Abtastfaktoren 1 … 4 mit ganzzahligem Verhältnis zum
  größten Faktor (4:4:4, 4:2:2, 4:2:0, 4:4:0, 4:1:1 …), verschachtelte und einzelne Scans, `DRI`/`RSTn`. Ergebnis gleich
  libjpeg-turbo mit `JDCT_ISLOW` und `do_fancy_upsampling = FALSE` (`djpeg -dct int -nosmooth`): Koeffizienten als `i16`,
  IDCT `jpeg_idct_islow` mit Bereichstabelle (`& 1023`), Chroma durch Wiederholen, YCbCr → RGB mit den Festkomma-Tabellen von
  `jdcolor.c`, Quantisierungstabellen beim ersten Scan einer Komponente übernommen, Huffman-Tabellen beim Scan gebaut (DC-Werte
  > 15 → Fehler); beschädigte Daten wie libjpeg (fehlende Bits = 0, ungültiger Code = 0; eine abgeschnittene Datei wird mit Null-Bits zu Ende dekodiert).
  Farbraum wie `default_decompress_parms`: JFIF → YCbCr, sonst Adobe-Transform 0 bzw. Kennungen `R G B` → RGB-JPEG.
  Kein lesbares Bild: arithmetisch (SOF9 …, `DAC`), 12 bit, verlustfrei/hierarchisch, CMYK/4 Komponenten, RGB-JPEG,
  `DNL` (Höhe 0), nicht ganzzahliges Abtastverhältnis, kein Scan. EXIF-Drehung und alle `APPn`/`COM` werden ignoriert.
- **Grenzen**: Quelle ≤ 2 MiB (sonst Code 1; der Lader meldet vorher P0020), Breite/Höhe ≤ 2048 – geprüft aus `IHDR`/`SOF`
  **vor** dem Dekodieren (Code 2 mit der Größe als `u32`), Breite oder Höhe 0 → Code 1.
- Gegenprobe (2026-10-23, Pillow 10.3 / libjpeg-turbo, nur lokal): alle 4:4:4- und Grau-JPEGs (eigene und von Pillow
  kodierte, Baseline, progressiv, mit Restart-Markern) **bitgleich**; Unterabtastung weicht nur durch Pillows „fancy
  upsampling“ ab. PNG aller Farbtypen bitgleich (außer 16-bit-Grau, das Pillow anders nach 8 bit bringt).

### 11.2 Format „Teigling“ v1 und Mipmaps

Little Endian: `"TEIGLING"` · `u16 version = 1` · `u8 format` (0 = RGBA8, 255 = Fehler) · `u8 stufen` (1 … 12) · `u16 b, u16 h` ·
`u32 flags` (Bit 0 hat Durchsichtiges, Bit 1 Quelle JPEG) · 32 Bytes SHA-256 der Quelle · je Stufe `u32 länge` + Bytes.
Fehler-Teigling (64 Bytes): Format 255, Stufen 0, b = h = 0, Flags 0, SHA-256, `u16 code` (1 kein lesbares Bild, 2 zu groß),
`u16 0`, `u32 b`, `u32 h` (nur Code 2). Länge eines Teiglings = 52 + Σ (4 + bᵢ · hᵢ · 4) ≈ b · h · 4 · 4/3 (1024² → 5 592 500 Bytes).
**Mipmaps:** Stufe i + 1 = (max(bᵢ/2, 1), max(hᵢ/2, 1)), jedes Zielpixel aus dem 2 × 2-Block ab (2x, 2y) der Vorstufe (fehlt die
zweite Spalte/Zeile, wird die letzte wiederholt; bei ungerader Größe entfällt die letzte), alpha-gewichtet:
`a = (Σa + 2) >> 2`, `c = Σa > 0 ? (Σ c·a + Σa/2) / Σa : 0`, in sRGB-Werten. Flag-Bit 0 wird aus Stufe 0 bestimmt.

### 11.3 `teigling.wasm` und JS-Hülle `site/js/herd/teigling.js`

Exporte (keine Importe): `memory`, `abi_version() → 1`, `teigling_version() → 1`, `puffer(len) → ptr`, `vorbacken(ptr, len) → len`,
`sha256(ptr, len) → 32`, `ergebnis() → ptr`, `freigeben()`. Die Hülle (klassisches Skript, `PizzaVorbacker` bzw. `require`) bietet
`ausBytes`/`ausModul`/`lade(url)`/`node()`, je Vorbacker `vorbacken`, `sha256`, `passt(teigling, quelle)` (Kopf gültig und
SHA-256 im Kopf = SHA-256 der Quelle) und `besorge(teigling | null, quelle)` (Cache-Prüfung §5.4: passt er nicht, wird neu
vorgebacken) sowie ohne Wasm `kopf`, `stufe` (Vorschau), `teigmenge` (verschiedene Quell-Hashes, ohne Fehler-Teiglinge),
`megabyte` (aufgerundet, Dezimalkomma), `teigmengeFehler` (Text von P0020 über `MAX_TEIGMENGE` = 67 108 864 Bytes, 64 MiB) und `cacheSchluessel` (`<sha>/teigling/1`).

### 11.4 Tests

- `cargo test -j 2 -p herd-teigling`: SHA-256-Testvektoren, Mipmaps, Kopf/Fehler-Teigling, **PNG exakt** gegen die erzeugten
  Proben (15 Farbtyp/Bittiefe-Paare × 4 Größen × 6 Filterwahlen, mit `tRNS`), Grau-Hochskalierung, alle Fehlerfälle,
  JPEG gegen das Muster (Näherung), **progressiv = Baseline = je Komponente** (gleiche Koeffizienten → gleiche Pixel) und die
  **goldenen Teiglinge** `teigling/golden.txt` (80 Fälle: Name, SHA-256 und Länge des Teiglings). Die Quellbilder erzeugt
  `testbild.rs` (eigener PNG-Kodierer und JPEG-Kodierer mit optimierten Huffman-Tabellen, Baseline/progressiv, Restart-Marker,
  alle Abtastungen) – keine Binärdateien im Repo. Neu schreiben nur bei gewollter Formatänderung:
  `TEIGLING_SCHREIBE=1 cargo test -p herd-teigling` (neue Formatversion, Cache-Schlüssel ändert sich).
- `node herd/test-teigling.js` (**blockierend**): baut `herd-teigling` (`--features testbilder`, `-j 2`), schreibt die Fälle nach
  `herd/target/teigling-faelle/`, backt jeden mit `teigling.wasm` über die Hülle vor und vergleicht mit nativ und `golden.txt`;
  dazu Hülle (`sha256` = `node:crypto`, `kopf`, `passt`/`besorge`, `teigmenge`, `megabyte`, P0020-Text).
- Messung: `node bench/herd/mess-teigling.js` (1024²-PNG/-JPEG nativ und Wasm, `bench/herd/ERGEBNISSE.md`).

## 12. Klang-Erzeuger `herd/klang` (H-K14, K-153, SPEC §18.8)

- **Format:** PCM 48 kHz, mono, i16 Little Endian; Hash = FNV-1a-64 über die PCM-Bytes (16 Hex-Ziffern, im Ereignis `klang`). Zustand in
  f64, nur `libm` (`sin`, `cos`, `pow`, `floor`, `round`, `fmod`, `sqrt`), keine FMA – dieselben Samples nativ und in `klang.wasm`.
- **Synthese** (`Klaenge`): Wellen `sinus`/`rechteck`/`saege`/`dreieck`/`rauschen` mit Phase in Zyklen (exponentielles Gleiten über einen
  festen Faktor je Sample), lineare Ein-/Ausblendung; Rauschen über xorshift32 (Saat × 2 654 435 761 ⊕ 0x9E3779B9), rosa nach Paul Kellet
  (sparsam), braun integriert mit Leck; Noten gleichstufig (A4 = 440 Hz); Biquad nach RBJ (Direktform I); `nahtlos` = gleiche Leistung
  (sin/cos) über die Überblendung. Jede Formung legt einen neuen Klang an; IDs ab 1; zusammen höchstens 5 Minuten (14,4 M Samples).
- **ABI** (`Abi`, Methoden = Exporte von `klang.wasm`, HOST-ABI §2 Gruppe `klang`): Ergebnis `id ≥ 1` oder `-1`; Fehler über `fehler_art`
  (1 TypAnanas, 2 LaufzeitAnanas), `fehler_text`, `fehler_neu` – alle Fehlertexte stehen in `src/lib.rs`.
- **Raum** (`raum(lage, reichweite, hoerer)` → Lautstärke, Panorama, Tiefpass): Formel der Wiedergaben (nativer Mischer
  `host/src/wiedergabe.rs`, Browser-Spiegel `ui/src/klang.js`); nicht bitgleich geprüft. Hörer = Kamera aus dem SZENE-Block des
  Bildpakets (`kamera` ab Byte 128, Rechts-Achse = Zeile 0 von `ansicht_proj`).
- **Tests:** `cargo test -j 2 -p herd-klang` (Golden `klang/golden.txt` mit 18 Klängen und 2 Fehlertexten, Fehlertexte, Noten, Grenzen,
  Raum; neu schreiben mit `KLANG_GOLDEN=schreibe`), `node herd/test-klang.js` (dieselbe Datei gegen `klang.wasm`), `node herd/baue.js
  --pruefe` (Exporte, ein Golden-Hash).
