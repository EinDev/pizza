//! PNG-Decoder (PROJEKTE.md §5.3): Farbtypen Grau, Grau+Alpha, RGB, RGBA, Palette; Bittiefen 1/2/4/8/16; alle fünf
//! Zeilenfilter; `tRNS` (Palette: Alpha je Eintrag; Grau/RGB: Farbschlüssel, verglichen in der **Original**-Bittiefe).
//! 16 bit → obere 8 Bit, Grau < 8 bit → `v × 255 / (2^b − 1)`. CRC jedes Abschnitts wird geprüft; die dekomprimierte Länge
//! muss **genau** `Höhe × (1 + Zeilenbytes)` sein (Ausgabepuffer hart begrenzt). Nicht unterstützt (→ kein lesbares Bild):
//! Adam7-Interlacing, APNG (`acTL`), unbekannte kritische Abschnitte. `gAMA`/`cHRM`/`sRGB`/`iCCP` u. a. werden ignoriert.

use alloc::vec;
use alloc::vec::Vec;

use crate::{pruefe_groesse, Bild, Fehler};

/// PNG-Signatur.
pub const SIGNATUR: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

pub fn ist_png(q: &[u8]) -> bool {
    q.len() >= 8 && q[..8] == SIGNATUR
}

const fn crc_tabelle() -> [u32; 256] {
    let mut t = [0u32; 256];
    let mut n = 0;
    while n < 256 {
        let mut c = n as u32;
        let mut k = 0;
        while k < 8 {
            c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            k += 1;
        }
        t[n] = c;
        n += 1;
    }
    t
}
static CRC: [u32; 256] = crc_tabelle();

/// CRC-32 (ISO 3309) wie in PNG.
pub fn crc32(teile: &[&[u8]]) -> u32 {
    let mut c = 0xFFFF_FFFFu32;
    for t in teile {
        for &b in *t {
            c = CRC[((c ^ b as u32) & 0xFF) as usize] ^ (c >> 8);
        }
    }
    c ^ 0xFFFF_FFFF
}

fn be32(q: &[u8], i: usize) -> u32 {
    u32::from_be_bytes([q[i], q[i + 1], q[i + 2], q[i + 3]])
}

fn kanaele(farbtyp: u8) -> u32 {
    match farbtyp {
        0 | 3 => 1,
        2 => 3,
        4 => 2,
        _ => 4,
    }
}

fn tiefe_gueltig(farbtyp: u8, bit: u8) -> bool {
    match farbtyp {
        0 => matches!(bit, 1 | 2 | 4 | 8 | 16),
        3 => matches!(bit, 1 | 2 | 4 | 8),
        2 | 4 | 6 => matches!(bit, 8 | 16),
        _ => false,
    }
}

pub fn dekodiere(q: &[u8]) -> Result<Bild, Fehler> {
    let kein = Err(Fehler::KeinBild);
    let mut p = 8;
    let mut ihdr: Option<(u32, u32, u8, u8)> = None;
    let mut palette: Vec<[u8; 4]> = Vec::new();
    let mut trns: Option<Vec<u8>> = None;
    let mut idat: Vec<u8> = Vec::new();
    let mut idat_gesehen = false;
    let mut ende = false;
    while !ende {
        if p + 12 > q.len() {
            return kein;
        }
        let laenge = be32(q, p) as usize;
        if laenge > 0x7FFF_FFFF || p + 12 + laenge > q.len() {
            return kein;
        }
        let typ = &q[p + 4..p + 8];
        let daten = &q[p + 8..p + 8 + laenge];
        if crc32(&[typ, daten]) != be32(q, p + 8 + laenge) {
            return kein;
        }
        p += 12 + laenge;
        if ihdr.is_none() && typ != b"IHDR" {
            return kein;
        }
        match typ {
            b"IHDR" => {
                if ihdr.is_some() || laenge != 13 {
                    return kein;
                }
                let (b, h) = (be32(daten, 0), be32(daten, 4));
                let (bit, farbtyp) = (daten[8], daten[9]);
                if !tiefe_gueltig(farbtyp, bit) || daten[10] != 0 || daten[11] != 0 || daten[12] != 0 {
                    return kein; // auch Interlacing (Adam7, Byte 12 = 1) wird nicht unterstützt
                }
                pruefe_groesse(b, h)?;
                ihdr = Some((b, h, bit, farbtyp));
            }
            b"PLTE" => {
                if idat_gesehen || !palette.is_empty() || laenge == 0 || laenge % 3 != 0 || laenge > 768 {
                    return kein;
                }
                palette = daten.chunks_exact(3).map(|c| [c[0], c[1], c[2], 255]).collect();
            }
            b"tRNS" => {
                if idat_gesehen || trns.is_some() {
                    return kein;
                }
                trns = Some(daten.to_vec());
            }
            b"IDAT" => {
                idat_gesehen = true;
                idat.extend_from_slice(daten);
            }
            b"IEND" => ende = true,
            b"acTL" | b"fcTL" | b"fdAT" => return kein, // APNG: Animationen über mehrere Dateien + `Animation`
            _ => {
                if typ[0] & 0x20 == 0 {
                    return kein; // unbekannter kritischer Abschnitt
                }
            }
        }
    }
    let Some((b, h, bit, farbtyp)) = ihdr else { return kein };
    if !idat_gesehen {
        return kein;
    }
    if farbtyp == 3 {
        if palette.is_empty() || palette.len() > (1usize << bit) {
            return kein;
        }
        if let Some(t) = &trns {
            for (i, &a) in t.iter().enumerate() {
                if i < palette.len() {
                    palette[i][3] = a;
                }
            }
        }
    }
    let bits_pro_pixel = kanaele(farbtyp) * bit as u32;
    let zeilenbytes = ((b as usize) * bits_pro_pixel as usize).div_ceil(8);
    let soll = h as usize * (1 + zeilenbytes);
    let roh = match miniz_oxide::inflate::decompress_to_vec_zlib_with_limit(&idat, soll) {
        Ok(v) => v,
        Err(_) => return kein,
    };
    drop(idat);
    if roh.len() != soll {
        return kein;
    }
    let bpp = if bits_pro_pixel >= 8 { (bits_pro_pixel / 8) as usize } else { 1 };
    let mut zeilen = roh;
    entfiltere(&mut zeilen, h as usize, zeilenbytes, bpp)?;
    wandle(&zeilen, b, h, bit, farbtyp, zeilenbytes, &palette, trns.as_deref())
}

fn paeth(a: u8, b: u8, c: u8) -> u8 {
    let p = a as i16 + b as i16 - c as i16;
    let pa = (p - a as i16).abs();
    let pb = (p - b as i16).abs();
    let pc = (p - c as i16).abs();
    if pa <= pb && pa <= pc {
        a
    } else if pb <= pc {
        b
    } else {
        c
    }
}

/// Zeilenfilter rückgängig machen (in place; Filterbyte bleibt stehen).
fn entfiltere(d: &mut [u8], h: usize, zb: usize, bpp: usize) -> Result<(), Fehler> {
    let s = zb + 1;
    for y in 0..h {
        let (vor, rest) = d.split_at_mut(y * s);
        let zeile = &mut rest[..s];
        let oben: Option<&[u8]> = if y > 0 { Some(&vor[(y - 1) * s + 1..y * s]) } else { None };
        let f = zeile[0];
        let z = &mut zeile[1..];
        match f {
            0 => {}
            1 => {
                for i in bpp..zb {
                    z[i] = z[i].wrapping_add(z[i - bpp]);
                }
            }
            2 => {
                if let Some(o) = oben {
                    for i in 0..zb {
                        z[i] = z[i].wrapping_add(o[i]);
                    }
                }
            }
            3 => {
                for i in 0..zb {
                    let a = if i >= bpp { z[i - bpp] as u16 } else { 0 };
                    let b = oben.map_or(0, |o| o[i] as u16);
                    z[i] = z[i].wrapping_add(((a + b) >> 1) as u8);
                }
            }
            4 => {
                for i in 0..zb {
                    let a = if i >= bpp { z[i - bpp] } else { 0 };
                    let b = oben.map_or(0, |o| o[i]);
                    let c = if i >= bpp { oben.map_or(0, |o| o[i - bpp]) } else { 0 };
                    z[i] = z[i].wrapping_add(paeth(a, b, c));
                }
            }
            _ => return Err(Fehler::KeinBild),
        }
    }
    Ok(())
}

/// Probe `i` (Kanalwert in Original-Bittiefe) einer Zeile.
#[inline]
fn probe(z: &[u8], i: usize, bit: u8) -> u16 {
    match bit {
        16 => u16::from_be_bytes([z[2 * i], z[2 * i + 1]]),
        8 => z[i] as u16,
        _ => {
            let pro_byte = 8 / bit as usize;
            let byte = z[i / pro_byte];
            let schieb = 8 - bit as usize * (i % pro_byte + 1);
            ((byte >> schieb) & ((1u16 << bit) - 1) as u8) as u16
        }
    }
}

/// Original-Probe → 8 bit.
#[inline]
fn acht(v: u16, bit: u8) -> u8 {
    match bit {
        16 => (v >> 8) as u8,
        8 => v as u8,
        _ => (v as u32 * 255 / ((1u32 << bit) - 1)) as u8,
    }
}

#[allow(clippy::too_many_arguments)]
fn wandle(d: &[u8], b: u32, h: u32, bit: u8, farbtyp: u8, zb: usize, palette: &[[u8; 4]], trns: Option<&[u8]>) -> Result<Bild, Fehler> {
    let (bu, hu) = (b as usize, h as usize);
    let mut rgba = vec![0u8; bu * hu * 4];
    // Farbschlüssel (Grau: 1 Wert, RGB: 3 Werte), je u16 BE; ungültige Längen werden ignoriert
    let schluessel: Option<[u16; 3]> = match (farbtyp, trns) {
        (0, Some(t)) if t.len() >= 2 => {
            let g = u16::from_be_bytes([t[0], t[1]]);
            Some([g, g, g])
        }
        (2, Some(t)) if t.len() >= 6 => Some([
            u16::from_be_bytes([t[0], t[1]]),
            u16::from_be_bytes([t[2], t[3]]),
            u16::from_be_bytes([t[4], t[5]]),
        ]),
        _ => None,
    };
    for y in 0..hu {
        let z = &d[y * (zb + 1) + 1..(y + 1) * (zb + 1)];
        let aus = &mut rgba[y * bu * 4..(y + 1) * bu * 4];
        for x in 0..bu {
            let o = x * 4;
            match farbtyp {
                0 => {
                    let v = probe(z, x, bit);
                    let g = acht(v, bit);
                    let a = if schluessel.is_some_and(|s| s[0] == v) { 0 } else { 255 };
                    aus[o..o + 4].copy_from_slice(&[g, g, g, a]);
                }
                2 => {
                    let (r, g, bb) = (probe(z, 3 * x, bit), probe(z, 3 * x + 1, bit), probe(z, 3 * x + 2, bit));
                    let a = if schluessel.is_some_and(|s| s == [r, g, bb]) { 0 } else { 255 };
                    aus[o..o + 4].copy_from_slice(&[acht(r, bit), acht(g, bit), acht(bb, bit), a]);
                }
                3 => {
                    let i = probe(z, x, bit) as usize;
                    let Some(c) = palette.get(i) else { return Err(Fehler::KeinBild) };
                    aus[o..o + 4].copy_from_slice(c);
                }
                4 => {
                    let g = acht(probe(z, 2 * x, bit), bit);
                    aus[o..o + 4].copy_from_slice(&[g, g, g, acht(probe(z, 2 * x + 1, bit), bit)]);
                }
                _ => {
                    for k in 0..4 {
                        aus[o + k] = acht(probe(z, 4 * x + k, bit), bit);
                    }
                }
            }
        }
    }
    Ok(Bild { breite: b, hoehe: h, rgba })
}
