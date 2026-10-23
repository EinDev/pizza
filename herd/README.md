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
    ..Art::LEER            // alles Übrige leer: nur_test, nachlauf, bild, huelle (neue Art-Felder ändern keine Komponente)
};
```

Weitere Einträge von `Art`: `nachlauf: Some(f)` (H-K0: gleiche Signatur wie `takt`, läuft je Takt nach **allen** Takt-Systemen, wie
Unity `LateUpdate`), `bild: Some(f)` (Bildbeitrag: `fn(&Welt, &Speicher, &mut Bildbau)` – Instanzen/Lichter/Kameras), `huelle: Some(f)`
(für `trifft`: `fn(&Welt, &Speicher, komp_zeile, teil_zeile) -> Option<Huelle>`), `nur_test: true` (nur Testbau, fehlt im Schema).

Feldtypen (Nummer im Schema): 1 `zahl` (f64, Bereich), 2 `ganz`, 3 `diavolo` (0/1), 4 `text`, 5 `wahl` (Index in fester Liste),
6 `farbe` (RGBA8 + Text, wie gesetzt), 7 `teil`, 8 `form`, 9 `bildchen` (IDs, 0 = karton), 10 `bildchen-liste`, 11 `teil-liste`
(`Feld::teil_liste`, Spalte wie `bildchen-liste`), 12 `zahl-liste` (`Feld::zahl_liste`, f64-Liste, Bereich je Eintrag) – beide
höchstens 65 536 Einträge (K-149); verborgen: `intern` (f64), `puffer` (f64-Liste je Komponente, z. B. Teilchen). Feldnummer =
Position + 1 (nur öffentliche Felder). Merkmale: `.lesen()` (**Lesefeld**: jeder Setz-Aufruf des ABI → `<Name>.<feld> kann man nur
lesen.`, Code 32; nur Systeme schreiben über den Speicher) und `.nachtrag()` (**Nachtragsfeld**: der Szenen-Hash überspringt es,
solange der Wert bitgleich dem Standard ist – so bekommt eine bestehende Komponente neue Felder, ohne dass sich Hashes bestehender
Programme ändern; öffentliche Nachtragsfelder stehen vor den verborgenen, Konstanten für verborgene Spalten also mitziehen).
Erstes Nachtragsfeld einer v1-Komponente: `Koerper.belag` (H-K2, Typ `teil`, Standard karton → Material des `Belag` an diesem
Teil; `Koerper` hat keine verborgenen Spalten).
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
`hole_zahl`, `form_grund`, `ressource_hole`, `takt`, `bild`, `paket_voll`, `fehler_art`, `fehler_code`, `fehler_neu`,
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
| `teil_hole` | `(teil, feld) → f64` | Lage-Feld lesen; `14` (entfernt) wirft nie |
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
| `ressource_hole` | `(id, was) → f64` | 1 Art (1 Form, 2 Bildchen), 2 Breite, 3 Höhe, 4 Ecken, 5 Dreiecke |
| `takt` | `() → 0` | alle Takt-Systeme, danach alle Nachlauf-Systeme (je in Registry-Reihenfolge), dt = 1/60 |
| `bild` | `(bildnummer) → len` | baut das Bildpaket; Bytes ab `bild_zeiger()`, gültig bis zum nächsten `bild` |
| `bild_zeiger` | `() → ptr` | |
| `paket_voll` | `() → 0` | nächstes Paket enthält wieder alle Ressourcen (neue Glut, Fenster neu geöffnet) |
| `hash_szene` / `hash_paket` | `(ptr) → 16` | FNV-1a 64 als 16 Hex-Ziffern (Kleinbuchstaben) über den Szenenzustand bzw. das letzte Paket |
| `schema_json` | `(ptr, kap) → len` | Schema (§5), Retry |

**Lage-Felder** (`teil_setze`/`teil_hole`): 1 x, 2 y, 3 z, 4 drehung, 5 neigung, 6 rollen, 7 groesseX, 8 groesseY,
9 groesseZ, 10 ebene (2D, Ganzzahl), 11 sichtbar (0/1); nur lesen: 12 raum (2/3), 13 eltern (0 = keins), 14 entfernt (0/1),
15 weltX, 16 weltY, 17 weltZ, 18 Anzahl Kinder. 3D-Felder (z, neigung, rollen, groesseZ) an 2D-Teilen und `ebene` an
3D-Teilen → `LaufzeitAnanas: Teil 5 ist ein 2D-Teil – neigung gibt es nur für 3D-Teile.` (bzw. `… 3D-Teil – ebene gibt es nur
für 2D-Teile.`).

**Fehlercodes** (`fehler_code`): 1 Herd-Größe keine Ganzzahl · 2 Herd-Größe Bereich · 3 noch kein Herd · 4 zweiter Herd ·
10 Teil entfernt · 11 Teil unbekannt · 12 Hängen: Zyklus · 13 Hängen: Raum · 14 nur 3D · 15 nur 2D · 16 Lage-Feld unbekannt
(intern) · 17 Raum unbekannt (intern) · 18 Lage-Bereich (ebene) · 20 Typnummer unbekannt (intern) · 21 Komponente hängt schon
· 22 Komponente falscher Raum · 23 Art schon am Teil · 24 Voraussetzung fehlt · 25 wird gebraucht · 26 Handle unbekannt
(intern) · 27 Feld unbekannt · 28 Feld falscher Typ · 29 Feld Bereich · 30 Wahl unbekannt · 31 Farbe unbekannt · 32 Lesefeld gesetzt (`<Name>.<feld> kann man nur lesen.`; auch `melde_typfehler` an einem Lesefeld) · 33 Liste zu lang ·
19 Komponentenname unbekannt · 40 teile (Bereich) · 51 teile keine Ganzzahl (TypAnanas `Form.kugel(teile: …) braucht eine Ganzzahl, nicht 24.5.`) · 41 dicke · 42 Punkte · 43 Dreiecke · 44 Punkt-Index · 45 Bildchen zu groß · 46 Bildchen-Zeichen · 47 Bildchen
ohne Zeilen · 48 Ressource unbekannt · 49 Grundform unbekannt (intern) · 50 Bildchen-Farbschlüssel · 60 Puffer (intern).

**Was die Anbindung selbst tut:** Sprachtypen prüfen (Zahl/Text/Blech …, bei falschem Typ `melde_typfehler`), Fabriken
zusammensetzen (`herd.kreis(x, y, r, farbe:)` = `teil_neu(2)` + `teil_lage` + `komp_neu(Kreis)` + Felder + `komp_haenge`),
Objektidentität (Handle → pizza-Objekt), Textformen (`Teil(3)`, `Bewegung(3)`), Getter/Setter-Namen aus dem Schema,
`bildnummer`/`zeit`, Eingabe, Fenster-Ereignisse. `bildnummer` gibt die Anbindung an `bild(n)` (sie steht im Paketkopf).

## 4. Bildpaket v1 (Kern → Glut)

Little Endian, feldweise geschrieben. Hängt **nicht** von Fenster- oder Gerätegröße ab (nur vom logischen Spielfeld
`breite × hoehe`); Kantenglättung und Pixeldichte macht die Glut (SDF, MSAA).

**Kopf (32 Bytes):** `"HZP1"` · `u32 version = 1` · `u32 bildnummer` · `u16 breite` · `u16 hoehe` · `u32 flags`
(1 = 3D-Züge oder 3D-Teilchen vorhanden, 2 = Schattendurchgang, 4 = Himmelsverlauf zeichnen) · `u32 anzahl_abschnitte` · `u32 länge_gesamt` ·
`u32 0`.
**Abschnitte** folgen: `u32 art` · `u32 länge` · Daten · Auffüllung auf 4 Bytes. Reihenfolge: Ressourcen-Deltas (1–4), dann 10,
11, 12, 13, 14. Unbekannte Arten überspringen. Abschnitte des Ausbaus (HERD.md §12, ab 14) stehen nur im Paket, wenn die
Komponente benutzt wird – Pakete ohne sie bleiben byte-gleich, `version` bleibt 1.

| Art | Name | Inhalt |
|---|---|---|
| 1 | SCHRIFT | `u16 breite, u16 hoehe, f32 em, f32 spanne`, dann `breite × hoehe` Bytes R8 (SDF, 0.5 = Kante). Im ersten Paket (und nach `paket_voll`) |
| 2 | ATLAS_SEITE | `u32 seite, u16 breite, u16 hoehe` – neue Bildchen-Atlasseite (RGBA8, 2048 × 2048, anfangs durchsichtig; Seiten sind die Schichten eines Textur-Arrays) |
| 3 | ATLAS_STUECK | `u32 seite, u16 x, u16 y, u16 b, u16 h`, dann `b × h × 4` Bytes RGBA8 (Zeilen von oben) |
| 4 | NETZ | `u32 id, u32 ecken, u32 indizes, f32 min[3], f32 max[3]`, dann `ecken × 32` Bytes (`f32 pos[3], normale[3], uv[2]`), dann `indizes × u32` (Dreiecke, Vorderseite gegen den Uhrzeigersinn) |
| 10 | SZENE | 592 Bytes Uniform-Block (unten), immer vorhanden |
| 11 | INST3D | n × 72 Bytes 3D-Instanzen |
| 12 | ZUEGE3D | m × 16 Bytes: `u32 art, u32 netz, u32 erste_instanz, u32 anzahl` (art 1 FEST, 2 SCHATTEN, 3 DURCH) |
| 13 | INST2D | k × 56 Bytes 2D-Instanzen, **bereits in Zeichenreihenfolge** |
| 14 | TEILCHEN3D | `u32 leuchtend, u32 deckend`, dann (leuchtend + deckend) × 20 Bytes 3D-Teilchen (`Funken`, unten); nur wenn sichtbare Teilchen da sind |

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
Textur). Texturkoordinate: `atlas = (u0, v0) + clamp(uv · (u1 − u0, v1 − v0), 0.5, Größe − 0.5)`, nächster Nachbar;
Texel mit Deckkraft < ½ werden verworfen (auch im Schatten).

**Züge:** In Listenreihenfolge. Für jedes Netz (aufsteigende ID) folgen die undurchsichtigen Instanzen in drei Gruppen:
[wirft Schatten, außerhalb der Sicht] [wirft Schatten, sichtbar] [wirft keinen, sichtbar] – je nach Teil-ID. `FEST` zeichnet
die sichtbaren (Tiefe schreiben), `SCHATTEN` die werfenden in die Shadow-Map (Tiefe aus `licht_proj`). Danach `DURCH` (Farbe
mit Deckkraft < 1) von hinten nach vorn (Abstand entlang der Blickrichtung, dann Teil-ID), aufeinanderfolgende gleiche Netze
zusammengefasst; je Zug erst Rückseiten, dann Vorderseiten, Tiefe testen, nicht schreiben. Frustum-Culling ist erledigt.

**TEILCHEN3D (20 Bytes je Teilchen):** `f32 x, y, z` (Weltlage) · `f32 r` (halbe Größe, Welt-Einheiten) · `u8 r, g, b, a` (sRGB,
nicht vormultipliziert). Erst die **leuchtenden** (additiv) in Ausstoßreihenfolge (Komponentenzeile, dann Teilchen), dann die
**deckenden** (gemischt) von hinten nach vorn (Abstand entlang der Blickrichtung, dann Ausstoßreihenfolge; Schlüssel
`ordnungs_bits`). Teilchen außerhalb des Sichtkörpers (Kugel mit Radius `r`) sind entfernt. Die Glut zeichnet sie als
kamerazugewandte Vierecke nach `DURCH` und vor INST2D: Tiefe testen, nicht schreiben, Nebel, keine Schatten, je Mischart ein
instanzierter Draw-Call.

**INST2D (56 Bytes):** `f32 m00, m10, m01, m11` (2 × 2 lokal → Spielfeld, Spalten = lokale x-/y-Achse) · `f32 tx, ty`
(Mitte, Spielfeld-Pixel, y nach unten) · `f32 hx, hy` (halbe Ausdehnung lokal) · `f32 p0, p1` · `u8 r, g, b, a` (sRGB) ·
`u32 art | seite << 8` · `u16 u0, v0, u1, v1` (Atlas-Pixel). Eckpunkt `c ∈ {−1, 1}²`: `lokal = c · (h + rand)` mit `rand` = Saum für
die Kantenglättung bei Rechteck/Kreis (ein Gerätepixel, mindestens ein Spielfeldpixel, in lokalen Einheiten), sonst 0; `pos = M · lokal + t`; Texturkoordinate (Bild/Glyphe)
`uv = mix((u0, v0), (u1, v1), (c + 1) / 2)` (c.y = −1 oben).

| art | Bedeutung |
|---|---|
| 1 Rechteck | abgerundetes Rechteck, halbe Größe `h`, Rundung `p0` (≤ min(h)), Umriss `p1` (> 0: nur ein Rand dieser Dicke nach innen) |
| 2 Kreis | Radius `hx`, Umriss `p1`; auch Partikel |
| 3 Bild | Atlasseite `seite`, Texel nächster Nachbar (pixelscharf, auf das Rechteck geklemmt), × Farbe (Tönung) |
| 4 Glyphe | SCHRIFT-Textur (linear), Kante bei 0.5, × Farbe |

Alle 2D-Instanzen sind **eine** Liste in Zeichenreihenfolge (`ebene`, dann Teil-ID, dann Registry-Reihenfolge, dann
Glyphen-/Teilchenreihenfolge) → ein instanzierter Draw-Call (6 Ecken × k), über der 3D-Szene, ohne Tiefe, Mischen
„source over“ in sRGB. Spielfeld-Culling ist erledigt.

**Zeichenfolge der Glut:** Ziel mit `hintergrund` füllen (Spielfeld seitentreu einpassen, Ränder ebenfalls Hintergrund) →
falls Flag 4: Himmelsverlauf → `SCHATTEN`-Züge in die Shadow-Map → `FEST` → `DURCH` → TEILCHEN3D (leuchtend, deckend) → INST2D. Der Himmel ist ein Verlauf
nach der **Blickrichtung** (Horizont `himmel_unten`, Zenit `himmel_oben`, darunter `himmel_unten`), damit ein Boden im Nebel
(Nebelfarbe = `himmel_unten`) nahtlos in den Himmel übergeht.

## 5. Schema (`site/js/herd/schema.json`)

Erzeugt von `node herd/baue.js` aus `schema_json`; ein Test vergleicht Datei und Kern. Inhalt: `format`, `feldtypen`
(Nummer, Name, `erwartet`-Text), `komponenten` (Name, Nummer = Typnummer, `genus` `m|f|n` für Fehlertexte wie „Dieser Kreis …“, Raum `2D|3D|beide`, `braucht`, `system`, `felder`
mit Nummer, Name, Typ, Standard (Listen `[]`), min, max, `wahl`, ab H-K0 `"lesen": true` bzw. `"nachtrag": true` – nur wenn
gesetzt; `system` ist wahr bei `takt` oder `nachlauf`), `teil_felder` (Lage-Feldnummern), `teil_methoden` (für die
Kollisionsprüfung: kein Komponentenname mit kleinem Anfangsbuchstaben darf darunter sein), `palette` (Name, Hex, Zeichen),
`grundformen`. Test-Komponenten (`Probe`) fehlen.

## 6. Bauen

- `node herd/baue.js` → `cargo build --release -p herd-kern-wasm --target wasm32v1-none` (Features wie die Laufzeit:
  `+bulk-memory,+mutable-globals,+sign-ext,+nontrapping-fptoint,+multivalue`, `herd/.cargo/config.toml`), schreibt
  `site/js/herd/kern.wasm` (keine Importe, kein wasm-bindgen) und `site/js/herd/schema.json`. `--pruefe` vergleicht nur.
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
  Springen, klein und voll mit 9 000 Gleitern; `belag.herd`: `Belag` und `Koerper.belag`). Die Felder der Typen `teil-liste`/`zahl-liste`,
  Lesefeld, Nachtragsfeld und Nachlauf prüft `herd/skript/tests/probe.herd` mit der Test-Komponente `Probe` (dev-dependency mit Feature
  `probe`, nur `cargo test`). Bei Abweichung: erste abweichende Zeile mit Kontext.
  `--nur b3` wählt Läufe, `--ohne-cargo` baut nicht. Stand H1b: alle Läufe bitgleich, ohne Änderung am Kern.

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

**Argumente:** Zahl/Variable/Ausdruck in Klammern (`(zufall(i) * 1280)`), Text als JSON-Zeichenkette, Listen `[a, b]`.
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
  auf 1 zurück), `instancing` (`false` = Grundlinie, ein Draw-Call je Objekt), `vsync` (Fenster). `HERD_SOFTWARE=1` erzwingt
  Software. Ohne Software-Adapter → `Fehler::KeinSoftwareAdapter` (kein Rückfall auf die GPU); geprüft wird `DeviceType::Cpu`.
  Hinweis: wgpu fragt beim Aufzählen unter DX12 die Fähigkeiten **aller** Adapter ab (kurzlebiges Gerät je Adapter, ohne
  Zeichnen) – über die öffentliche wgpu-API nicht vermeidbar.
- **Weitere:** `statistik()` (Draw-Calls, davon Schatten, Instanzen 2D/3D, Dreiecke, hochgeladene Bytes), `warte()` (für Messungen),
  `adapter_info()`, `msaa()`, `setze_instancing(b)`. Neue Glut für eine laufende Welt (Fenster neu) → vorher `kern.paket_voll()`.
- **Ressourcen:** SCHRIFT → R8-Textur; ATLAS_SEITE → Schicht eines RGBA8-Textur-Arrays 2048² (wächst durch Neuanlage + Kopie);
  ATLAS_STUECK → `write_texture` in die Schicht; NETZ → Ecken-/Indexpuffer je ID. Shadow-Map (Depth32Float 2048²) erst beim ersten
  Schattenbild. Instanzpuffer wachsen nur (Zweierpotenzen), Pipelines einmal je Zielformat (Cache).
- **Durchgänge:** Schatten (nur Tiefe, `licht_proj`, Steigungs-Bias) → Haupt (MSAA 4×, Viewport = eingepasstes Spielfeld): Himmel,
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
pixelscharf, SDF-Glyphe) · `licht` (Halbkugel-Umgebung, Sonne Lambert + Blinn-Phong, bis 8 Punktlichter, Eigenleuchten, Textur,
Nebel, sanfte Schulter gegen Überstrahlen) · `schatten` (nur Tiefe, Textur-Texel < ½ Deckkraft werfen keinen Schatten) · `himmel`
(Verlauf nach Blickrichtung aus der Inversen von `ansicht_proj`) · `funken` (3D-Teilchen: Viereck aus `vertex_index`, Kamera-rechts/
-oben aus den Zeilen 0/1 von `ansicht_proj` – kein neues Uniform; leuchtend = Schein (1 − r²)² mit heißem Kern, im Nebel
ausgeblendet; deckend = Scheibe mit weichem Rand, zur Nebelfarbe gemischt). Ableitungen nur in gleichförmigem Kontrollfluss, Texturen per
`textureLoad`/`…Level` (naga-/WebGL2-tauglich).

**Sonnenschatten (H2a repariert):** Ursache der „schwachen Flecken“ war ein veralteter Uniform-Block im Shader (560 statt 592 Bytes,
ohne `hintergrund`/`feld`): Der Shader las den Tiefen-Bias aus der Hintergrundfarbe (≈ 0,9) und die PCF-Schrittweite aus 1,0 – fast
alles galt als beleuchtet. Jetzt: Block feldgleich mit `paket.rs`, PCF als **Zeltfilter 5 × 5 Texel aus 9 bilinearen Vergleichen**
(Castaño 2013, glatte Kanten ohne Treppen), Normalenversatz 0,5 … 2 Texel je nach Lichteinfall, Tiefen-Bias aus dem Kern
(1,5 Texel) plus Steigungs-Bias im Schattendurchgang. Ergebnis: deutlich sichtbare, weiche Schatten ohne Akne und ohne sichtbares
Ablösen; bei sehr flacher Sonne in Nahsicht bleibt eine leichte Welligkeit (eine 2048er-Map für die ganze Sicht; Kaskaden =
spätere Kern-Erweiterung).

## 10. Werkzeug `herd-bild`, Referenzbilder, Messungen

Alle Läufe **offscreen** und standardmäßig auf dem **Software-Adapter**; die echte GPU nur mit `--gpu`/`HERD_GPU=1` (vom Nutzer).

| Aufruf | Zweck |
|---|---|
| `herd-bild bild <skript.herd> <ordner> [--bilder=1,60] [--groesse=BxH] [--ohne-instancing] [--msaa=1] [VAR=zahl]` | Skript abspielen, gewählte Bilder (Standard: Kopfzeile bzw. letztes) als PNG |
| `herd-bild bench <skript.herd> [--groesse=640x360] [--ohne-instancing] [--gpu] [VAR=zahl]` | Glut-Zeit je Bild (ohne Auslesen), Draw-Calls, Instanzen als JSON |
| `herd-bild referenz [ordner]` | Referenzbilder `tests/herd/bilder/*.herd` → `*.png` neu schreiben |
| `herd-bild atlas` | Schriftatlas `kern/schrift/atlas.bin` neu erzeugen |

**Referenzbilder** (`tests/herd/bilder/`, Skript + PNG, Kopfzeile `#! bild 40 groesse 1280x720`): `2d-alles` (alle 2D-Komponenten,
Umriss/Rundung, Text in mehreren Größen, Bildchen gespiegelt/getönt, Animation, Partikel, Ebenen, Hierarchie mit Drehung,
Durchsichtiges), `3d-alles` (alle Grundformen + eigene Form, Sonne mit Schatten, 2 Punktlichter, Nebel, Himmel, Textur,
Durchsichtiges, 2D-HUD), `3d-viele` (nach B3: 240 Körper, 8 Lichter), `2d-partikel` (nach B4), `3d-funken` (H-K5: Steinofen bei Nacht, leuchtende
Funken aus Maul und Schlot, deckender Rauch, Nebel, schräge Kamera). **Pixeltest** in `cargo test`
(`herd-werkzeug`): rendert jedes Skript auf dem Software-Adapter und vergleicht mit Toleranz K-129 (mittlere Abweichung ≤ 1,5 %,
≥ 98 % der Pixel innerhalb 10/255); ohne Software-Adapter wird er mit Hinweis übersprungen. Dazu: Instancing ändert das Bild nicht
(nur die Zahl der Draw-Calls), kaputtes Paket → `Fehler::Paket`, Fenster-API kompiliert (`herd-glut`, ohne Fenster).

**Messungen:** `node bench/herd/mess-kern.js` (Kern nativ/Wasm), `herd-bild bench` (Glut auf WARP), Größe mit Profil `klein` –
Ergebnisse und die Kommandos für die echte GPU in `bench/herd/ERGEBNISSE.md`. Profile: `messung` (Release ohne LTO, schont
Speicher) und `klein` (opt-level "z", LTO, strip).
