//! Vorbacker (PROJEKTE.md §5.3, K-147): PNG oder JPEG → **Teigling** (RGBA8 nicht vormultipliziert + Mipmaps bis 1 × 1).
//!
//! `no_std` + `alloc`, einzige Abhängigkeit `miniz_oxide` (Inflate). Gerechnet wird **nur mit Ganzzahlen** – derselbe Code
//! läuft nativ und als `site/js/herd/teigling.wasm` und liefert dieselben Bytes (Tests: `cargo test -p herd-teigling`,
//! `node herd/test-teigling.js`).
//!
//! Einstieg: [`vorbacken`] (Quellbytes → Teigling, bei Fehlern ein Fehler-Teigling) und [`sha256`]; Modelle (glTF, H-K16):
//! [`modell::vorbacken`] (Quellpaket → Modellteig, Format in `modell.rs`) und [`modell::braucht_text`] (welche Dateien ein
//! `.gltf` braucht). Für Modelle gilt HERD.md §13.1 Regel 5: f32 kopiert, nur + − × ÷, Farben über eine feste Tabelle.
//! Klänge (WAV/FLAC, H-K19a): [`klang::vorbacken`] (Quelldatei → Klangteig, PCM i16 ohne Umrechnen der Rate, Format und
//! Rundungsregeln in `klang.rs`; Leser in `wav.rs` und `flac.rs`).
//! Format „Teigling“ v1 (Little Endian):
//!
//! ```text
//!  0  8  Magie "TEIGLING"
//!  8  2  Version = 1
//! 10  1  Pixelformat: 0 = RGBA8 · 255 = Fehler
//! 11  1  Stufen n (1 … 12)
//! 12  2  Breite      14  2  Höhe
//! 16  4  Flags: Bit 0 = hat Durchsichtiges (Alpha < 255 in Stufe 0), Bit 1 = Quelle war JPEG
//! 20 32  SHA-256 der Quelldatei
//! 52  …  n × (u32 Länge, Bytes der Stufe, Zeilen von oben)
//! ```
//! Fehler-Teigling (64 Bytes): Pixelformat 255, Stufen 0, Breite/Höhe 0, Flags 0, SHA-256 der Quelle, ab 52 `u16` Code
//! (1 kein lesbares Bild, 2 zu groß), `u16 0`, `u32 Breite`, `u32 Höhe` (nur bei Code 2, sonst 0).

#![cfg_attr(not(test), no_std)]

extern crate alloc;

pub mod flac;
pub mod gltf;
pub mod jpeg;
pub mod json;
pub mod klang;
pub mod mip;
pub mod modell;
pub mod png;
pub mod sha256;
mod srgb;
pub mod wav;
#[cfg(any(test, feature = "testbilder"))]
pub mod testbild;

#[cfg(test)]
mod klang_tests;
#[cfg(test)]
mod modell_tests;
#[cfg(test)]
mod tests;

use alloc::vec::Vec;

pub use sha256::sha256;

/// Magie am Anfang jedes Teiglings.
pub const MAGIE: [u8; 8] = *b"TEIGLING";
/// Formatversion (Teil des Cache-Schlüssels `teigling/1`).
pub const VERSION: u16 = 1;
/// Pixelformat RGBA8 unkomprimiert (v1).
pub const FORMAT_RGBA8: u8 = 0;
/// Pixelformat eines Fehler-Teiglings.
pub const FORMAT_FEHLER: u8 = 255;
/// Länge des Kopfes; danach folgen die Stufen bzw. der Fehlerblock.
pub const KOPF: usize = 52;
/// Länge eines Fehler-Teiglings.
pub const FEHLER_LAENGE: usize = 64;
/// Größte Kante in Pixeln.
pub const MAX_KANTE: u32 = 2048;
/// Größte Quelldatei in Bytes (2 MiB, PROJEKTE.md §5.3/F8).
pub const MAX_QUELLE: usize = 2 * 1024 * 1024;
/// Größte Teigmenge je Projekt in Bytes (64 MiB, P0020).
pub const MAX_TEIGMENGE: u64 = 67_108_864;
/// Flag-Bit 0: irgendwo Alpha < 255.
pub const FLAG_DURCHSICHTIG: u32 = 1;
/// Flag-Bit 1: Quelle war ein JPEG.
pub const FLAG_JPEG: u32 = 2;
/// Fehlercode im Fehler-Teigling: kein lesbares Bild.
pub const FEHLER_KEIN_BILD: u16 = 1;
/// Fehlercode im Fehler-Teigling: zu groß.
pub const FEHLER_ZU_GROSS: u16 = 2;

/// Warum eine Quelle kein Teigling wird.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fehler {
    /// Kein PNG/JPEG, beschädigt oder nicht unterstützt (Code 1).
    KeinBild,
    /// Größer als 2048 × 2048 (Code 2) – Größe aus `IHDR` bzw. `SOF`.
    ZuGross(u32, u32),
}

/// Ein dekodiertes Bild: RGBA8, nicht vormultipliziert, Zeilen von oben.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Bild {
    pub breite: u32,
    pub hoehe: u32,
    pub rgba: Vec<u8>,
}

/// Prüft die Größe aus dem Dateikopf (vor dem Dekodieren).
pub(crate) fn pruefe_groesse(b: u32, h: u32) -> Result<(), Fehler> {
    if b == 0 || h == 0 {
        return Err(Fehler::KeinBild);
    }
    if b > MAX_KANTE || h > MAX_KANTE {
        return Err(Fehler::ZuGross(b, h));
    }
    Ok(())
}

/// Dekodiert PNG oder JPEG (erkannt an der Signatur). Liefert das Bild und ob die Quelle ein JPEG war.
pub fn dekodiere(quelle: &[u8]) -> Result<(Bild, bool), Fehler> {
    if quelle.len() > MAX_QUELLE {
        return Err(Fehler::KeinBild);
    }
    if png::ist_png(quelle) {
        png::dekodiere(quelle).map(|b| (b, false))
    } else if jpeg::ist_jpeg(quelle) {
        jpeg::dekodiere(quelle).map(|b| (b, true))
    } else {
        Err(Fehler::KeinBild)
    }
}

/// Anzahl der Mip-Stufen bis 1 × 1: `1 + floor(log2(max(b, h)))` (2048 → 12).
pub fn stufen_anzahl(b: u32, h: u32) -> u8 {
    let m = if b > h { b } else { h };
    (32 - m.leading_zeros()) as u8
}

/// Länge des Teiglings für ein Bild `b × h` (Kopf + alle Stufen mit Längenfeld).
pub fn teigling_laenge(b: u32, h: u32) -> usize {
    let (mut w, mut hh) = (b as usize, h as usize);
    let mut n = KOPF;
    loop {
        n += 4 + w * hh * 4;
        if w == 1 && hh == 1 {
            return n;
        }
        w = if w > 1 { w / 2 } else { 1 };
        hh = if hh > 1 { hh / 2 } else { 1 };
    }
}

fn kopf(aus: &mut Vec<u8>, format: u8, stufen: u8, b: u16, h: u16, flags: u32, hash: &[u8; 32]) {
    aus.extend_from_slice(&MAGIE);
    aus.extend_from_slice(&VERSION.to_le_bytes());
    aus.push(format);
    aus.push(stufen);
    aus.extend_from_slice(&b.to_le_bytes());
    aus.extend_from_slice(&h.to_le_bytes());
    aus.extend_from_slice(&flags.to_le_bytes());
    aus.extend_from_slice(hash);
}

/// Fehler-Teigling (64 Bytes).
pub fn fehler_teigling(f: Fehler, hash: &[u8; 32]) -> Vec<u8> {
    let mut aus = Vec::with_capacity(FEHLER_LAENGE);
    kopf(&mut aus, FORMAT_FEHLER, 0, 0, 0, 0, hash);
    let (code, b, h) = match f {
        Fehler::KeinBild => (FEHLER_KEIN_BILD, 0, 0),
        Fehler::ZuGross(b, h) => (FEHLER_ZU_GROSS, b, h),
    };
    aus.extend_from_slice(&code.to_le_bytes());
    aus.extend_from_slice(&0u16.to_le_bytes());
    aus.extend_from_slice(&b.to_le_bytes());
    aus.extend_from_slice(&h.to_le_bytes());
    aus
}

/// Baut den Teigling aus einem dekodierten Bild (Stufe 0 = Bild, danach die Mipmaps).
pub fn teigling_aus(bild: &Bild, jpeg: bool, hash: &[u8; 32]) -> Vec<u8> {
    let (b, h) = (bild.breite, bild.hoehe);
    let stufen = stufen_anzahl(b, h);
    let mut flags = if jpeg { FLAG_JPEG } else { 0 };
    if bild.rgba.chunks_exact(4).any(|p| p[3] != 255) {
        flags |= FLAG_DURCHSICHTIG;
    }
    let mut aus = Vec::with_capacity(teigling_laenge(b, h));
    kopf(&mut aus, FORMAT_RGBA8, stufen, b as u16, h as u16, flags, hash);
    aus.extend_from_slice(&(bild.rgba.len() as u32).to_le_bytes());
    aus.extend_from_slice(&bild.rgba);
    let (mut w, mut hh) = (b, h);
    let mut start = aus.len() - bild.rgba.len();
    for _ in 1..stufen {
        let (nw, nh) = (if w > 1 { w / 2 } else { 1 }, if hh > 1 { hh / 2 } else { 1 });
        let laenge = (nw * nh * 4) as usize;
        aus.extend_from_slice(&(laenge as u32).to_le_bytes());
        let neu = aus.len();
        aus.resize(neu + laenge, 0);
        let (vor, ziel) = aus.split_at_mut(neu);
        mip::halbiere(&vor[start..start + (w * hh * 4) as usize], w, hh, ziel);
        start = neu;
        w = nw;
        hh = nh;
    }
    debug_assert_eq!(aus.len(), teigling_laenge(b, h));
    aus
}

/// Quellbytes → Teigling (PROJEKTE.md §5.3). Bei Fehlern ein Fehler-Teigling (64 Bytes) – nie ein Abbruch.
pub fn vorbacken(quelle: &[u8]) -> Vec<u8> {
    let hash = sha256(quelle);
    match dekodiere(quelle) {
        Ok((bild, jpeg)) => teigling_aus(&bild, jpeg, &hash),
        Err(f) => fehler_teigling(f, &hash),
    }
}

/// Kopf eines Teiglings (geprüft: Magie, Version, Pixelformat, Stufen, Längen).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Kopf {
    pub format: u8,
    pub stufen: u8,
    pub breite: u32,
    pub hoehe: u32,
    pub flags: u32,
    pub sha256: [u8; 32],
    /// Bei einem Fehler-Teigling: der Fehler.
    pub fehler: Option<Fehler>,
}

fn u16_at(t: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([t[i], t[i + 1]])
}
fn u32_at(t: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([t[i], t[i + 1], t[i + 2], t[i + 3]])
}

/// Liest und prüft einen Teigling vollständig (wie `bildchen_teigling` im Herd-Kern). `None` = kein gültiger Teigling v1.
pub fn lies_kopf(t: &[u8]) -> Option<Kopf> {
    if t.len() < KOPF || t[..8] != MAGIE || u16_at(t, 8) != VERSION {
        return None;
    }
    let mut sha = [0u8; 32];
    sha.copy_from_slice(&t[20..52]);
    let (format, stufen, b, h, flags) = (t[10], t[11], u16_at(t, 12) as u32, u16_at(t, 14) as u32, u32_at(t, 16));
    if format == FORMAT_FEHLER {
        if t.len() != FEHLER_LAENGE || stufen != 0 || b != 0 || h != 0 {
            return None;
        }
        let fehler = match u16_at(t, 52) {
            FEHLER_KEIN_BILD => Fehler::KeinBild,
            FEHLER_ZU_GROSS => Fehler::ZuGross(u32_at(t, 56), u32_at(t, 60)),
            _ => return None,
        };
        return Some(Kopf { format, stufen, breite: 0, hoehe: 0, flags, sha256: sha, fehler: Some(fehler) });
    }
    if format != FORMAT_RGBA8 || b == 0 || h == 0 || b > MAX_KANTE || h > MAX_KANTE || stufen != stufen_anzahl(b, h) {
        return None;
    }
    if t.len() != teigling_laenge(b, h) {
        return None;
    }
    let (mut w, mut hh, mut p) = (b, h, KOPF);
    for _ in 0..stufen {
        if u32_at(t, p) != w * hh * 4 {
            return None;
        }
        p += 4 + (w * hh * 4) as usize;
        w = if w > 1 { w / 2 } else { 1 };
        hh = if hh > 1 { hh / 2 } else { 1 };
    }
    Some(Kopf { format, stufen, breite: b, hoehe: h, flags, sha256: sha, fehler: None })
}
