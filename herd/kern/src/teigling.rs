//! Teiglinge im Kern (PROJEKTE.md §5.3/§5.5, K-147): `bildchen_teigling` prüft **nur den Kopf** (Magie, Version, Pixelformat,
//! Stufen, Größen, Längen) und übernimmt die Bytes – dekodiert wird nichts (das tut der Vorbacker `herd/teigling`).
//! Fehler-Teiglinge werden zu Code 61 (kein lesbares Bild) bzw. 62 (zu groß); ein ungültiger Kopf zählt als Code 61.

use alloc::vec::Vec;

use crate::fehler::{self, Erg};

pub const MAGIE: [u8; 8] = *b"TEIGLING";
pub const VERSION: u16 = 1;
pub const KOPF: usize = 52;
pub const FORMAT_RGBA8: u8 = 0;
pub const FORMAT_FEHLER: u8 = 255;
pub const MAX_KANTE: u32 = 2048;
/// Flag-Bit 0 im Kopf: irgendwo Alpha < 255.
pub const FLAG_DURCHSICHTIG: u32 = 1;

/// Geprüfter Teigling: Größe, Pixelformat, Flags und die Stufen (je Bytes, Zeilen von oben).
pub struct Geprueft {
    pub breite: u32,
    pub hoehe: u32,
    pub format: u8,
    pub flags: u32,
    pub stufen: Vec<Vec<u8>>,
}

fn u16_at(t: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([t[i], t[i + 1]])
}
fn u32_at(t: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([t[i], t[i + 1], t[i + 2], t[i + 3]])
}

/// `1 + floor(log2(max(b, h)))`
pub fn stufen_anzahl(b: u32, h: u32) -> u32 {
    32 - b.max(h).leading_zeros()
}

pub fn pruefe(t: &[u8]) -> Erg<Geprueft> {
    let kein = || Err(fehler::teigling_kein_bild());
    if t.len() < KOPF || t[..8] != MAGIE || u16_at(t, 8) != VERSION {
        return kein();
    }
    let (format, stufen, b, h, flags) = (t[10], t[11] as u32, u16_at(t, 12) as u32, u16_at(t, 14) as u32, u32_at(t, 16));
    if format == FORMAT_FEHLER {
        if t.len() == KOPF + 12 && u16_at(t, 52) == 2 {
            return Err(fehler::teigling_zu_gross(u32_at(t, 56), u32_at(t, 60)));
        }
        return kein();
    }
    if format != FORMAT_RGBA8 || b == 0 || h == 0 || b > MAX_KANTE || h > MAX_KANTE || stufen != stufen_anzahl(b, h) {
        return kein();
    }
    let mut aus = Vec::with_capacity(stufen as usize);
    let (mut w, mut hh, mut p) = (b, h, KOPF);
    for _ in 0..stufen {
        let n = (w * hh * 4) as usize;
        if p + 4 + n > t.len() || u32_at(t, p) as usize != n {
            return kein();
        }
        aus.push(t[p + 4..p + 4 + n].to_vec());
        p += 4 + n;
        w = (w / 2).max(1);
        hh = (hh / 2).max(1);
    }
    if p != t.len() {
        return kein();
    }
    Ok(Geprueft { breite: b, hoehe: h, format, flags, stufen: aus })
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloc::vec;

    /// Teigling wie der Vorbacker ihn baut (Stufen hier nur Füllwerte – der Kern prüft keine Pixel).
    pub fn teigling(b: u32, h: u32, flags: u32) -> Vec<u8> {
        let mut t = MAGIE.to_vec();
        t.extend_from_slice(&VERSION.to_le_bytes());
        t.push(FORMAT_RGBA8);
        t.push(stufen_anzahl(b, h) as u8);
        t.extend_from_slice(&(b as u16).to_le_bytes());
        t.extend_from_slice(&(h as u16).to_le_bytes());
        t.extend_from_slice(&flags.to_le_bytes());
        t.extend_from_slice(&[7u8; 32]);
        let (mut w, mut hh) = (b, h);
        for s in 0..stufen_anzahl(b, h) {
            t.extend_from_slice(&(w * hh * 4).to_le_bytes());
            t.extend(vec![s as u8 + 1; (w * hh * 4) as usize]);
            w = (w / 2).max(1);
            hh = (hh / 2).max(1);
        }
        t
    }

    #[test]
    fn kopf_pruefung() {
        let t = teigling(5, 3, 1);
        let g = pruefe(&t).unwrap();
        assert_eq!((g.breite, g.hoehe, g.stufen.len()), (5, 3, 3));
        assert_eq!(g.stufen[2], vec![3u8; 4]);
        for i in [0usize, 9, 10, 11, 12, 14, 52] {
            let mut v = t.clone();
            v[i] ^= 0x20;
            assert_eq!(pruefe(&v).err().map(|f| f.code), Some(61), "Byte {}", i);
        }
        let mut v = t.clone();
        v.push(0);
        assert_eq!(pruefe(&v).err().map(|f| f.code), Some(61));
        // Fehler-Teiglinge
        let mut f = MAGIE.to_vec();
        f.extend_from_slice(&VERSION.to_le_bytes());
        f.extend_from_slice(&[255, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        f.extend_from_slice(&[0u8; 32]);
        let mut zu = f.clone();
        zu.extend_from_slice(&2u16.to_le_bytes());
        zu.extend_from_slice(&0u16.to_le_bytes());
        zu.extend_from_slice(&70000u32.to_le_bytes());
        zu.extend_from_slice(&10u32.to_le_bytes());
        let e = pruefe(&zu).err().unwrap();
        assert_eq!((e.code, e.text.as_str()), (62, "ist zu groß (70000 × 10) – höchstens 2048 × 2048 Pixel."));
        let mut kb = f.clone();
        kb.extend_from_slice(&[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        let e = pruefe(&kb).err().unwrap();
        assert_eq!((e.code, e.text.as_str()), (61, "ist kein lesbares Bild (PNG oder JPEG)."));
    }

    fn u32le(d: &[u8], i: usize) -> u32 {
        u32::from_le_bytes([d[i], d[i + 1], d[i + 2], d[i + 3]])
    }

    /// Bildpaket: TEXTUR = 5 einmal je Bild (mit allen Stufen), 2D TEXTURBILD = 6 mit Textur-ID und `0 0 b h`,
    /// 3D Bit 16 + 17 mit Textur-ID; ohne Teigling kein Abschnitt 5 und keine neuen Arten.
    #[test]
    fn bildpaket_textur() {
        use crate::paket::{abschnitt, flach_art, Leser, INST2D_BYTES, INST3D_BYTES};
        let mut k = crate::Kern::neu();
        assert_eq!(k.bildchen_teigling(&teigling(4, 2, 0)), -2); // vor neu Herd
        assert_eq!(k.fehler_code(), 3);
        k.welt_neu(320.0, 200.0, b"T");
        let atlas = k.bildchen_neu(&[1, 0, 0, 0, b'w'], &[]);
        let t = k.bildchen_teigling(&teigling(5, 3, 1));
        assert_eq!((atlas, t), (1, 2));
        assert_eq!(k.ressource_hole(t, 2), 5.0);
        let (tb, tk) = (k.typ_nummer(b"Bild"), k.typ_nummer(b"Koerper"));
        let (fb, fk, ff) = (k.feld_nummer(tb, b"bildchen"), k.feld_nummer(tk, b"bild"), k.feld_nummer(tk, b"form"));
        let teil = k.teil_neu(2);
        k.teil_lage(teil, 50.0, 50.0, 0.0);
        let bc = k.komp_neu(tb);
        k.setze_zahl(bc, fb, t as f64);
        k.komp_haenge(bc, teil);
        let w = k.form_grund(1, 0.0, 0.0);
        let teil3 = k.teil_neu(3);
        let kk = k.komp_neu(tk);
        k.setze_zahl(kk, ff, w as f64);
        k.setze_zahl(kk, fk, t as f64);
        k.komp_haenge(kk, teil3);
        k.bild(1);
        let p = k.paket().to_vec();
        let l = Leser::neu(&p).unwrap();
        let tex: Vec<&[u8]> = l.abschnitte().filter(|a| a.0 == abschnitt::TEXTUR).map(|a| a.1).collect();
        assert_eq!(tex.len(), 1);
        let d = tex[0];
        assert_eq!((u32le(d, 0), d[4], d[5], u16::from_le_bytes([d[6], d[7]]), u16::from_le_bytes([d[8], d[9]])), (2, 0, 3, 5, 3));
        assert_eq!(u32le(d, 10), 5 * 3 * 4);
        assert_eq!(d.len(), 10 + (4 + 60) + (4 + 8) + (4 + 4));
        let i2: Vec<&[u8]> = l.abschnitte().filter(|a| a.0 == abschnitt::INST2D).map(|a| a.1).collect();
        assert_eq!(i2[0].len(), INST2D_BYTES);
        let art = u32le(i2[0], 44);
        assert_eq!((art & 0xFF, art >> 8), (flach_art::TEXTURBILD, 2));
        assert_eq!(&i2[0][48..56], &[0, 0, 0, 0, 5, 0, 3, 0]);
        let i3: Vec<&[u8]> = l.abschnitte().filter(|a| a.0 == abschnitt::INST3D).map(|a| a.1).collect();
        assert_eq!(i3[0].len() % INST3D_BYTES, 0);
        assert_eq!(u32le(i3[0], 68), 2 | 1 << 16 | 1 << 17);
        assert_eq!(&i3[0][60..68], &[0, 0, 0, 0, 5, 0, 3, 0]);
        // nächstes Paket: Textur ist schon gesendet
        k.bild(2);
        let p2 = k.paket().to_vec();
        assert!(Leser::neu(&p2).unwrap().abschnitte().all(|a| a.0 != abschnitt::TEXTUR));
        // nach paket_voll wieder dabei
        k.paket_voll();
        k.bild(3);
        let p3 = k.paket().to_vec();
        assert_eq!(Leser::neu(&p3).unwrap().abschnitte().filter(|a| a.0 == abschnitt::TEXTUR).count(), 1);
    }
}
