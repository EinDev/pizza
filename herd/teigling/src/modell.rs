//! Format „Modellteig“ v1 (H-K16, HERD.md §13.3): ein vorgebackenes glTF-Modell – Netze wie `NETZ` (Ecken 32 B), Materialien,
//! Bilder als **eingebettete Teiglinge**, Knoten (Tiefensuche über die Standardszene), Lichter, Häute und Folgen. Der Kern
//! (`herd/kern/src/modell.rs`) prüft alles und rechnet daraus Teile (Drehungen, Farben linear → sRGB in f64 mit `libm`).
//!
//! ```text
//! Kopf (64 B, Little Endian)
//!  0  8  Magie "TEIGMODL"
//!  8  2  Version = 1
//! 10  1  Art: 0 = Modell · 255 = Fehler
//! 11  1  0
//! 12  4  Flags: Bit 0 Häute, Bit 1 Folgen, Bit 2 Lichter, Bit 3 Eckfarben (Paletten-Bild)
//! 16 32  SHA-256 des Quellpakets (Hauptdatei + benutzte Dateien, `gltf::quellpaket`)
//! 48  4  Ecken (Summe)      52  4  Dreiecke (Summe)
//! 56  2  Bilder · 58  2 Materialien · 60  2 Knoten · 62  2 Netze
//! Fehler-Modellteig: ab 64 u16 Code (1 kein Modell, 2 Erweiterung, 3 zu groß, 4 Bild, 5 Datei fehlt), u16 Textlänge,
//!   Text (UTF-8, ohne Pfad – die Laufzeiten setzen `<pfad> ` davor). Zählt nicht zur Teigmenge.
//! Modell: ab 64 die Abschnitte in fester Reihenfolge, je `u32 n` und n Einträge:
//!  BILDER    je u32 Länge + Teigling v1
//!  MATERIAL  je f32 farbe[4] (linear), metall, rauheit, leucht[3] (linear), leuchtStärke, normalStärke, schwelle;
//!            u8 alpha (0 deckend, 1 Maske, 2 Mischen), u8 beidseitig, u8 wiederholen, u8 0;
//!            i32 Bild Grundfarbe, Relief, Stoff, Leuchten (−1 = keins); Name
//!  NETZE     je u32 Ecken, u32 Indizes, u32 Flags (Bit 0 ohne Normalen, Bit 1 Haut), i32 Material (−1);
//!            Ecken × 32 B (Lage, Normale, UV als f32), Indizes × u32, bei Haut Ecken × (4 × u16 Gelenk, 4 × u16 Gewicht)
//!  MESHES    je u32 k, k × u32 Netz
//!  KNOTEN    je i32 Eltern, Mesh, Licht, Haut (−1 = keins), u32 Matrix (0/1), 16 × f32 (TRS: Lage 3, Quaternion 4, Größe 3,
//!            Rest 0 · Matrix: spaltenweise); Name
//!  LICHTER   je u8 Art (0 Punkt, 1 Spot, 2 Richtung), 3 × u8 0, f32 farbe[3], stärke (cd), reichweite (0 = unbegrenzt),
//!            innen, außen (rad); Name
//!  HAEUTE    je u32 Gelenke, i32 Skelett; Gelenke × u32 Knoten; Gelenke × 16 f32 (inverse Bindematrizen)
//!  FOLGEN    je Name, u32 Kanäle; je Kanal u32 Knoten, u8 Pfad (0 Lage, 1 Drehung, 2 Größe), u8 Art (0 linear, 1 Stufe),
//!            u16 0, u32 Schlüssel, Schlüssel × f32 Zeit, Schlüssel × (3 bzw. 4) × f32 Wert
//! Name = u16 Länge + UTF-8 (≤ 200 Bytes, an einer Zeichengrenze gekürzt). Die Datei endet genau nach FOLGEN.
//! ```

use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;

use crate::gltf::{self, MFehler, Modell};

pub const MAGIE: [u8; 8] = *b"TEIGMODL";
/// Formatversion (Teil des Cache-Schlüssels `modell/1`).
pub const VERSION: u16 = 1;
pub const KOPF: usize = 64;
pub const ART_MODELL: u8 = 0;
pub const ART_FEHLER: u8 = 255;
pub const FLAG_HAUT: u32 = 1;
pub const FLAG_FOLGEN: u32 = 2;
pub const FLAG_LICHTER: u32 = 4;
pub const FLAG_PALETTE: u32 = 8;
/// Längste gespeicherte Namen in Bytes.
pub const MAX_NAME: usize = 200;

/// Ganzzahl mit Leerzeichen als Tausendertrenner (`612 000`).
pub fn tausender(n: u64) -> String {
    let s = format!("{}", n);
    let mut aus = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i) % 3 == 0 {
            aus.push(' ');
        }
        aus.push(c);
    }
    aus
}

/// Bytes / 1 048 576, eine Nachkommastelle aufgerundet, Dezimalkomma (wie P0020).
pub fn megabyte(b: u64) -> String {
    let z = (b * 10).div_ceil(1_048_576);
    format!("{},{}", z / 10, z % 10)
}

fn kuerze(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut e = max;
    while !s.is_char_boundary(e) {
        e -= 1;
    }
    &s[..e]
}

/// Code und fertiger Text (ohne Pfad) eines Fehlers – die einzige Stelle, an der diese Texte entstehen (13.1 Regel 5).
pub fn fehler_text(f: &MFehler) -> (u16, String) {
    match f {
        MFehler::KeinModell => (1, String::from("ist kein lesbares Modell (glTF 2.0).")),
        MFehler::Erweiterung(e) => (2, format!("braucht die Erweiterung {} – die kann der Herd nicht.", kuerze(e, 100))),
        MFehler::ZuGross(ist, max, "Bytes") => (3, format!("ist zu groß ({} MB) – höchstens {} MB.", megabyte(*ist), max / 1_048_576)),
        MFehler::ZuGross(ist, max, was) => (3, format!("ist zu groß ({} {}) – höchstens {} {}.", tausender(*ist), was, tausender(*max), was)),
        MFehler::Bild(nr, crate::Fehler::KeinBild) => (4, format!("(Bild {}) ist kein lesbares Bild (PNG oder JPEG).", nr)),
        MFehler::Bild(nr, crate::Fehler::ZuGross(b, h)) => {
            (4, format!("(Bild {}) ist zu groß ({} × {}) – höchstens 2048 × 2048 Pixel.", nr, b, h))
        }
        MFehler::DateiFehlt(u) => (5, format!("braucht die Datei {} – die liegt nicht in der Kiste.", kuerze(u, 120))),
    }
}

struct Schreiber(Vec<u8>);

impl Schreiber {
    fn u8(&mut self, v: u8) {
        self.0.push(v);
    }
    fn u16(&mut self, v: u16) {
        self.0.extend_from_slice(&v.to_le_bytes());
    }
    fn u32(&mut self, v: u32) {
        self.0.extend_from_slice(&v.to_le_bytes());
    }
    fn i32(&mut self, v: Option<u32>) {
        self.0.extend_from_slice(&v.map(|x| x as i32).unwrap_or(-1).to_le_bytes());
    }
    fn f32(&mut self, v: f32) {
        self.0.extend_from_slice(&v.to_bits().to_le_bytes());
    }
    fn name(&mut self, s: &str) {
        let s = kuerze(s, MAX_NAME);
        self.u16(s.len() as u16);
        self.0.extend_from_slice(s.as_bytes());
    }
}

fn kopf(s: &mut Schreiber, art: u8, flags: u32, sha: &[u8; 32], zahlen: [u32; 2], anz: [u16; 4]) {
    s.0.extend_from_slice(&MAGIE);
    s.u16(VERSION);
    s.u8(art);
    s.u8(0);
    s.u32(flags);
    s.0.extend_from_slice(sha);
    s.u32(zahlen[0]);
    s.u32(zahlen[1]);
    for a in anz {
        s.u16(a);
    }
}

/// Fehler-Modellteig (Länge 68 + Text).
pub fn fehler_teig(f: &MFehler, sha: &[u8; 32]) -> Vec<u8> {
    let (code, text) = fehler_text(f);
    let mut s = Schreiber(Vec::with_capacity(KOPF + 4 + text.len()));
    kopf(&mut s, ART_FEHLER, 0, sha, [0, 0], [0; 4]);
    s.u16(code);
    s.u16(text.len() as u16);
    s.0.extend_from_slice(text.as_bytes());
    s.0
}

/// Modell → Modellteig.
pub fn schreibe(m: &Modell, sha: &[u8; 32]) -> Vec<u8> {
    let ecken: usize = m.netze.iter().map(|n| n.pos.len() / 3).sum();
    let drei: usize = m.netze.iter().map(|n| n.idx.len() / 3).sum();
    let mut flags = 0;
    if !m.haeute.is_empty() {
        flags |= FLAG_HAUT;
    }
    if !m.folgen.is_empty() {
        flags |= FLAG_FOLGEN;
    }
    if !m.lichter.is_empty() {
        flags |= FLAG_LICHTER;
    }
    let teiglinge: Vec<Vec<u8>> = m.bilder.iter().map(|b| crate::teigling_aus(&b.bild, b.jpeg, &b.sha)).collect();
    if m.palette {
        flags |= FLAG_PALETTE;
    }
    let groesse = KOPF + teiglinge.iter().map(|t| 4 + t.len()).sum::<usize>() + ecken * 40 + drei * 12 + 4096;
    let mut s = Schreiber(Vec::with_capacity(groesse));
    let anz = [m.bilder.len() as u16, m.materialien.len() as u16, m.knoten.len() as u16, m.netze.len() as u16];
    kopf(&mut s, ART_MODELL, flags, sha, [ecken as u32, drei as u32], anz);
    s.u32(teiglinge.len() as u32);
    for t in &teiglinge {
        s.u32(t.len() as u32);
        s.0.extend_from_slice(t);
    }
    s.u32(m.materialien.len() as u32);
    for ma in &m.materialien {
        for x in ma.farbe {
            s.f32(x);
        }
        s.f32(ma.metall);
        s.f32(ma.rauheit);
        for x in ma.leucht {
            s.f32(x);
        }
        s.f32(ma.leucht_staerke);
        s.f32(ma.normal_staerke);
        s.f32(ma.schwelle);
        s.u8(ma.alpha);
        s.u8(ma.beidseitig as u8);
        s.u8(ma.wiederholen as u8);
        s.u8(0);
        for b in [ma.bild_farbe, ma.bild_relief, ma.bild_stoff, ma.bild_leucht] {
            s.i32(b);
        }
        s.name(&ma.name);
    }
    s.u32(m.netze.len() as u32);
    for n in &m.netze {
        let e = n.pos.len() / 3;
        s.u32(e as u32);
        s.u32(n.idx.len() as u32);
        s.u32(n.nor.is_none() as u32 | (n.gelenke.is_some() as u32) << 1);
        s.i32(n.material);
        for i in 0..e {
            for k in 0..3 {
                s.f32(n.pos[i * 3 + k]);
            }
            for k in 0..3 {
                s.f32(n.nor.as_ref().map(|v| v[i * 3 + k]).unwrap_or(0.0));
            }
            s.f32(n.uv[i * 2]);
            s.f32(n.uv[i * 2 + 1]);
        }
        for &x in &n.idx {
            s.u32(x);
        }
        if let (Some(g), Some(w)) = (&n.gelenke, &n.gewichte) {
            for i in 0..e {
                for k in 0..4 {
                    s.u16(g[i * 4 + k]);
                }
                for k in 0..4 {
                    s.u16(w[i * 4 + k]);
                }
            }
        }
    }
    s.u32(m.meshes.len() as u32);
    for me in &m.meshes {
        s.u32(me.len() as u32);
        for &x in me {
            s.u32(x);
        }
    }
    s.u32(m.knoten.len() as u32);
    for k in &m.knoten {
        for v in [k.eltern, k.mesh, k.licht, k.haut] {
            s.i32(v);
        }
        s.u32(k.matrix as u32);
        for x in k.werte {
            s.f32(x);
        }
        s.name(&k.name);
    }
    s.u32(m.lichter.len() as u32);
    for l in &m.lichter {
        s.u8(l.art);
        s.u8(0);
        s.u8(0);
        s.u8(0);
        for x in l.farbe {
            s.f32(x);
        }
        for x in [l.staerke, l.reichweite, l.innen, l.aussen] {
            s.f32(x);
        }
        s.name(&l.name);
    }
    s.u32(m.haeute.len() as u32);
    for h in &m.haeute {
        s.u32(h.gelenke.len() as u32);
        s.i32(h.skelett);
        for &g in &h.gelenke {
            s.u32(g);
        }
        for &x in &h.ibm {
            s.f32(x);
        }
    }
    s.u32(m.folgen.len() as u32);
    for f in &m.folgen {
        s.name(&f.name);
        s.u32(f.kanaele.len() as u32);
        for k in &f.kanaele {
            s.u32(k.knoten);
            s.u8(k.pfad);
            s.u8(k.art);
            s.u16(0);
            s.u32(k.zeiten.len() as u32);
            for &x in &k.zeiten {
                s.f32(x);
            }
            for &x in &k.werte {
                s.f32(x);
            }
        }
    }
    s.0
}

/// Quellpaket (oder `.glb`) → Modellteig; bei Fehlern ein Fehler-Modellteig – nie ein Abbruch.
pub fn vorbacken(paket: &[u8]) -> Vec<u8> {
    let sha = crate::sha256(paket);
    match gltf::lies(paket) {
        Ok(m) => schreibe(&m, &sha),
        Err(f) => fehler_teig(&f, &sha),
    }
}

/// Die Dateien, die die Hauptdatei `pfad` braucht, als Text: je Zeile `URI \t Projektpfad`.
pub fn braucht_text(pfad: &str, haupt: &[u8]) -> String {
    let mut s = String::new();
    for (u, p) in gltf::braucht(pfad, haupt) {
        // Tabulator/Zeilenumbruch in URIs sind nie gültige Projektpfade → weglassen
        if u.contains('\t') || u.contains('\n') {
            continue;
        }
        s.push_str(&u);
        s.push('\t');
        s.push_str(&p);
        s.push('\n');
    }
    s
}

/// Kopf eines Modellteigs (geprüft: Magie, Version, Art, Längen grob; die volle Prüfung macht der Kern).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Kopf {
    pub art: u8,
    pub flags: u32,
    pub sha256: [u8; 32],
    pub ecken: u32,
    pub dreiecke: u32,
    pub bilder: u16,
    pub materialien: u16,
    pub knoten: u16,
    pub netze: u16,
    /// Fehler-Teig: (Code, Text)
    pub fehler: Option<(u16, String)>,
}

pub fn lies_kopf(t: &[u8]) -> Option<Kopf> {
    if t.len() < KOPF || t[..8] != MAGIE || u16::from_le_bytes([t[8], t[9]]) != VERSION || t[11] != 0 {
        return None;
    }
    let u16_at = |i: usize| u16::from_le_bytes([t[i], t[i + 1]]);
    let u32_at = |i: usize| u32::from_le_bytes([t[i], t[i + 1], t[i + 2], t[i + 3]]);
    let mut sha = [0u8; 32];
    sha.copy_from_slice(&t[16..48]);
    let art = t[10];
    let fehler = match art {
        ART_MODELL => None,
        ART_FEHLER => {
            if t.len() < KOPF + 4 {
                return None;
            }
            let (code, n) = (u16_at(64), u16_at(66) as usize);
            if !(1..=5).contains(&code) || t.len() != KOPF + 4 + n {
                return None;
            }
            Some((code, String::from(core::str::from_utf8(&t[68..]).ok()?)))
        }
        _ => return None,
    };
    Some(Kopf {
        art,
        flags: u32_at(12),
        sha256: sha,
        ecken: u32_at(48),
        dreiecke: u32_at(52),
        bilder: u16_at(56),
        materialien: u16_at(58),
        knoten: u16_at(60),
        netze: u16_at(62),
        fehler,
    })
}
