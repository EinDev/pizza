//! Testbild-Erzeuger (nur Tests und `herd-teigling`, Feature `testbilder`): deterministische Muster, ein PNG-Kodierer für alle
//! Farbtypen/Bittiefen/Filter und ein JPEG-Kodierer (Baseline und progressiv mit Spektralauswahl und schrittweiser
//! Näherung nach libjpeg `jpeg_simple_progression`, optimierte Huffman-Tabellen nach `jpeg_gen_optimal_table`, Restart-Marker,
//! beliebige Abtastfaktoren). Keine Binärdateien im Repo: alle goldenen Fälle entstehen hier ([`faelle`]).
//! Nur Ganzzahlen – die Bytes sind auf jeder Plattform gleich.

use alloc::format;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

use crate::png::{crc32, SIGNATUR};

// ------------------------------------------------------------------ Muster

/// Kleiner deterministischer Zufall (xorshift32).
pub struct Zufall(pub u32);
impl Zufall {
    pub fn naechste(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
}

/// RGBA-Muster: Verläufe, harte Kanten (Kreis, Streifen), etwas Rauschen (`rauschen` = Amplitude), optional Alpha
/// (durchsichtiger Kreis, halbdurchsichtiger Rand).
pub fn muster(b: u32, h: u32, saat: u32, rauschen: u32, alpha: bool) -> Vec<u8> {
    let mut z = Zufall(saat.wrapping_mul(2_654_435_761).wrapping_add(12345) | 1);
    let mut v = vec![0u8; (b * h * 4) as usize];
    let (bm, hm) = (b.max(2) - 1, h.max(2) - 1);
    let (cx, cy, r) = (b as i64 / 2, h as i64 / 3, (b.min(h) as i64) / 4 + 1);
    for y in 0..h {
        for x in 0..b {
            let o = ((y * b + x) * 4) as usize;
            let n = |z: &mut Zufall| if rauschen > 0 { (z.naechste() % (2 * rauschen + 1)) as i32 - rauschen as i32 } else { 0 };
            let mut rr = (x * 255 / bm) as i32 + n(&mut z);
            let mut gg = (y * 255 / hm) as i32 + n(&mut z);
            let mut bb = (((x + 2 * y) * 3) % 256) as i32 + n(&mut z);
            let (dx, dy) = (x as i64 - cx, y as i64 - cy);
            let im_kreis = dx * dx + dy * dy <= r * r;
            if im_kreis {
                rr = 240;
                gg = 60 + (saat as i32 % 50);
                bb = 30;
            }
            if (x / 5) % 7 == 3 {
                rr = 255 - rr;
                bb = 20;
            }
            let k = |c: i32| c.clamp(0, 255) as u8;
            v[o] = k(rr);
            v[o + 1] = k(gg);
            v[o + 2] = k(bb);
            v[o + 3] = if !alpha {
                255
            } else if im_kreis {
                0
            } else if x < b / 4 {
                (x * 255 / (b / 4).max(1)) as u8
            } else if (x + y) % 11 == 0 {
                128
            } else {
                255
            };
        }
    }
    v
}

// ------------------------------------------------------------------ PNG

/// Quelle für den PNG-Kodierer: Proben in Original-Bittiefe (Kanäle je Pixel nach Farbtyp).
#[derive(Clone, Debug)]
pub struct PngQuelle {
    pub breite: u32,
    pub hoehe: u32,
    pub farbtyp: u8,
    pub bit: u8,
    pub proben: Vec<u16>,
    pub palette: Vec<[u8; 3]>,
    pub trns: Option<Vec<u8>>,
}

/// Verderb- und Variantenoptionen des PNG-Kodierers.
#[derive(Clone, Debug, Default)]
pub struct PngOpt {
    /// fester Filter je Zeile (sonst Zeile % 5)
    pub filter: Option<u8>,
    pub interlace_byte: bool,
    pub crc_kaputt: bool,
    pub ein_byte_zu_viel: bool,
    pub ein_byte_zu_wenig: bool,
    pub actl: bool,
    pub idat_teile: usize,
    pub ohne_iend: bool,
    pub kritisch_unbekannt: bool,
    pub zusatz: bool,
    pub filter_byte: Option<u8>,
}

pub fn kanaele(farbtyp: u8) -> usize {
    match farbtyp {
        0 | 3 => 1,
        2 => 3,
        4 => 2,
        _ => 4,
    }
}

fn chunk(aus: &mut Vec<u8>, typ: &[u8; 4], daten: &[u8], kaputt: bool) {
    aus.extend_from_slice(&(daten.len() as u32).to_be_bytes());
    aus.extend_from_slice(typ);
    aus.extend_from_slice(daten);
    let c = crc32(&[typ, daten]) ^ if kaputt { 1 } else { 0 };
    aus.extend_from_slice(&c.to_be_bytes());
}

fn paeth(a: u8, b: u8, c: u8) -> u8 {
    let p = a as i16 + b as i16 - c as i16;
    let (pa, pb, pc) = ((p - a as i16).abs(), (p - b as i16).abs(), (p - c as i16).abs());
    if pa <= pb && pa <= pc {
        a
    } else if pb <= pc {
        b
    } else {
        c
    }
}

/// Nur den Kopf eines PNG (IHDR + IEND) – für „zu groß“ ohne riesige Daten.
pub fn png_nur_kopf(b: u32, h: u32) -> Vec<u8> {
    let mut aus = SIGNATUR.to_vec();
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&b.to_be_bytes());
    ihdr.extend_from_slice(&h.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    chunk(&mut aus, b"IHDR", &ihdr, false);
    chunk(&mut aus, b"IEND", &[], false);
    aus
}

pub fn png(q: &PngQuelle, o: &PngOpt) -> Vec<u8> {
    let k = kanaele(q.farbtyp);
    let bpp_bits = k * q.bit as usize;
    let zb = (q.breite as usize * bpp_bits).div_ceil(8);
    let bpp = if bpp_bits >= 8 { bpp_bits / 8 } else { 1 };
    let mut roh = Vec::new();
    let mut vorige = vec![0u8; zb];
    for y in 0..q.hoehe as usize {
        let mut zeile = vec![0u8; zb];
        let pro_zeile = q.breite as usize * k;
        for i in 0..pro_zeile {
            let v = q.proben[y * pro_zeile + i];
            match q.bit {
                16 => {
                    zeile[2 * i] = (v >> 8) as u8;
                    zeile[2 * i + 1] = v as u8;
                }
                8 => zeile[i] = v as u8,
                bit => {
                    let pro_byte = 8 / bit as usize;
                    let schieb = 8 - bit as usize * (i % pro_byte + 1);
                    zeile[i / pro_byte] |= (v as u8) << schieb;
                }
            }
        }
        let f = o.filter.unwrap_or((y % 5) as u8);
        let mut gefiltert = vec![0u8; zb];
        for i in 0..zb {
            let a = if i >= bpp { zeile[i - bpp] } else { 0 };
            let b = if y > 0 { vorige[i] } else { 0 };
            let c = if i >= bpp && y > 0 { vorige[i - bpp] } else { 0 };
            let pr = match f {
                0 => 0,
                1 => a,
                2 => b,
                3 => ((a as u16 + b as u16) >> 1) as u8,
                _ => paeth(a, b, c),
            };
            gefiltert[i] = zeile[i].wrapping_sub(pr);
        }
        roh.push(if y == 0 { o.filter_byte.unwrap_or(f) } else { f });
        roh.extend_from_slice(&gefiltert);
        vorige = zeile;
    }
    if o.ein_byte_zu_viel {
        roh.push(0);
    }
    if o.ein_byte_zu_wenig {
        roh.pop();
    }
    let z = miniz_oxide::deflate::compress_to_vec_zlib(&roh, 6);
    let mut aus = SIGNATUR.to_vec();
    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&q.breite.to_be_bytes());
    ihdr.extend_from_slice(&q.hoehe.to_be_bytes());
    ihdr.extend_from_slice(&[q.bit, q.farbtyp, 0, 0, o.interlace_byte as u8]);
    chunk(&mut aus, b"IHDR", &ihdr, false);
    if o.zusatz {
        chunk(&mut aus, b"gAMA", &45455u32.to_be_bytes(), false);
        chunk(&mut aus, b"sRGB", &[0], false);
        chunk(&mut aus, b"tEXt", b"Kommentar\0Teigling-Test", false);
    }
    if o.actl {
        chunk(&mut aus, b"acTL", &[0, 0, 0, 1, 0, 0, 0, 0], false);
    }
    if !q.palette.is_empty() {
        let p: Vec<u8> = q.palette.iter().flatten().copied().collect();
        chunk(&mut aus, b"PLTE", &p, false);
    }
    if let Some(t) = &q.trns {
        chunk(&mut aus, b"tRNS", t, false);
    }
    if o.kritisch_unbekannt {
        chunk(&mut aus, b"ABCD", &[1, 2, 3], false);
    }
    let teile = o.idat_teile.max(1);
    let gross = z.len().div_ceil(teile).max(1);
    for (i, t) in z.chunks(gross).enumerate() {
        chunk(&mut aus, b"IDAT", t, o.crc_kaputt && i == 0);
    }
    if o.zusatz {
        chunk(&mut aus, b"tEXt", b"Nach\0den Daten", false);
    }
    if !o.ohne_iend {
        chunk(&mut aus, b"IEND", &[], false);
    }
    aus
}

/// Proben für ein PNG aus einem RGBA-Muster (Farbtyp/Bittiefe wie gewünscht; Palette: bis 2^bit Farben aus dem Muster).
pub fn png_quelle(b: u32, h: u32, farbtyp: u8, bit: u8, saat: u32) -> PngQuelle {
    let m = muster(b, h, saat, 3, true);
    let max = ((1u32 << bit) - 1) as u16;
    let mut z = Zufall(saat | 7);
    let k = kanaele(farbtyp);
    let mut proben = Vec::with_capacity((b * h) as usize * k);
    let mut palette = Vec::new();
    if farbtyp == 3 {
        let n = (1usize << bit).min(256);
        for i in 0..n {
            let r = (z.naechste() & 255) as u8;
            palette.push([r, (i * 255 / n.max(2).saturating_sub(1).max(1)) as u8, 255 - r]);
        }
    }
    for p in 0..(b * h) as usize {
        let px = &m[p * 4..p * 4 + 4];
        // Werte auf die Bittiefe bringen; bei 16 bit die unteren Bits mit Rauschen füllen (müssen beim Kürzen verschwinden)
        let tief = |c: u8, z: &mut Zufall| -> u16 {
            if bit == 16 {
                ((c as u16) << 8) | (z.naechste() & 255) as u16
            } else {
                (c as u32 * max as u32 / 255) as u16
            }
        };
        match farbtyp {
            0 => {
                let g = ((px[0] as u32 * 3 + px[1] as u32 * 5 + px[2] as u32 * 2) / 10) as u8;
                proben.push(tief(g, &mut z));
            }
            2 => {
                for c in 0..3 {
                    proben.push(tief(px[c], &mut z));
                }
            }
            3 => proben.push(((px[0] as u32 + px[1] as u32 * 7 + p as u32) % palette.len() as u32) as u16),
            4 => {
                proben.push(tief(px[1], &mut z));
                proben.push(tief(px[3], &mut z));
            }
            _ => {
                for c in 0..4 {
                    proben.push(tief(px[c], &mut z));
                }
            }
        }
    }
    PngQuelle { breite: b, hoehe: h, farbtyp, bit, proben, palette, trns: None }
}

// ------------------------------------------------------------------ JPEG

/// Optionen des JPEG-Kodierers.
#[derive(Clone, Debug)]
pub struct JpegOpt {
    pub grau: bool,
    /// (h, v) je Komponente: Y, Cb, Cr (bei Grau nur Y)
    pub abtastung: [(u8, u8); 3],
    pub qualitaet: u32,
    pub neustart: u16,
    pub progressiv: bool,
    /// Baseline: jede Komponente in einem eigenen Scan (nicht verschachtelt)
    pub je_komponente: bool,
    pub jfif: bool,
    pub exif: bool,
    pub adobe: Option<u8>,
    pub ids: [u8; 3],
    /// Marker des Rahmens (0xC0, 0xC1, 0xC2 oder zum Verderben 0xC9 …)
    pub sof: Option<u8>,
    pub praezision: u8,
    /// so viele Bytes am Ende weglassen (0 = nicht; simuliert eine abgebrochene Übertragung)
    pub abschneiden: usize,
}

impl Default for JpegOpt {
    fn default() -> Self {
        JpegOpt {
            grau: false,
            abtastung: [(2, 2), (1, 1), (1, 1)],
            qualitaet: 80,
            neustart: 0,
            progressiv: false,
            je_komponente: false,
            jfif: true,
            exif: false,
            adobe: None,
            ids: [1, 2, 3],
            sof: None,
            praezision: 8,
            abschneiden: 0,
        }
    }
}

const STD_LUMA: [u16; 64] = [
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80,
    62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98,
    112, 100, 103, 99,
];
const STD_CHROMA: [u16; 64] = [
    17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
    99, 99,
];
const ZICKZACK: [usize; 64] = [
    0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35,
    42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];
/// cos(kπ/16) · 4096, k = 0 … 8
const COS: [i64; 9] = [4096, 4017, 3784, 3406, 2896, 2276, 1567, 799, 0];

fn cosinus(u: usize, x: usize) -> i64 {
    let m = ((2 * x + 1) * u) % 32;
    let c = match m {
        0..=8 => COS[m],
        9..=16 => -COS[16 - m],
        17..=24 => -COS[m - 16],
        _ => COS[32 - m],
    };
    if u == 0 {
        2896 // 4096/√2
    } else {
        c
    }
}

fn div_rund(a: i64, b: i64) -> i64 {
    if a >= 0 {
        (a + b / 2) / b
    } else {
        -((-a + b / 2) / b)
    }
}

fn quant_tabelle(basis: &[u16; 64], q: u32) -> [u16; 64] {
    let q = q.clamp(1, 100);
    let skala = if q < 50 { 5000 / q } else { 200 - 2 * q };
    let mut t = [0u16; 64];
    for i in 0..64 {
        t[i] = ((basis[i] as u32 * skala + 50) / 100).clamp(1, 255) as u16;
    }
    t
}

/// Vorwärts-DCT eines 8 × 8-Blocks (Proben 0 … 255) und Quantisierung → Koeffizienten (natürliche Reihenfolge).
fn fdct(p: &[i64; 64], q: &[u16; 64]) -> [i16; 64] {
    let mut zw = [0i64; 64];
    for y in 0..8 {
        for u in 0..8 {
            let mut s = 0;
            for x in 0..8 {
                s += cosinus(u, x) * (p[y * 8 + x] - 128);
            }
            zw[y * 8 + u] = s;
        }
    }
    let mut aus = [0i16; 64];
    for v in 0..8 {
        for u in 0..8 {
            let mut s = 0;
            for y in 0..8 {
                s += cosinus(v, y) * zw[y * 8 + u];
            }
            aus[v * 8 + u] = div_rund(s, 4 * 4096 * 4096 * q[v * 8 + u] as i64).clamp(-2047, 2047) as i16;
        }
    }
    aus
}

struct Kompo {
    h: usize,
    v: usize,
    tab: u8,
    bw: usize,
    bh: usize,
    bx: usize,
    koef: Vec<[i16; 64]>,
}

#[derive(Clone, Copy)]
enum Sym {
    /// (dc?, Tabelle, Symbol)
    Huff(bool, u8, u8),
    Bits(u32, u8),
    Neustart(u8),
}

struct Kodierer {
    s: Vec<Sym>,
    eobrun: u32,
    be: Vec<u8>,
    ac: u8,
}

impl Kodierer {
    fn eobrun_aus(&mut self) {
        if self.eobrun > 0 {
            let mut t = self.eobrun;
            let mut n = 0u8;
            loop {
                t >>= 1;
                if t == 0 {
                    break;
                }
                n += 1;
            }
            self.s.push(Sym::Huff(false, self.ac, n << 4));
            if n > 0 {
                self.s.push(Sym::Bits(self.eobrun & ((1 << n) - 1), n));
            }
            self.eobrun = 0;
            for b in self.be.drain(..) {
                self.s.push(Sym::Bits(b as u32, 1));
            }
        }
    }
}

fn bits_von(mut t: i32) -> (u8, u32) {
    // (Anzahl Bits, Bitmuster) wie jchuff: negative Werte als Einerkomplement
    let mut t2 = t;
    if t < 0 {
        t = -t;
        t2 -= 1;
    }
    let mut n = 0u8;
    while t != 0 {
        n += 1;
        t >>= 1;
    }
    (n, if n > 0 { (t2 as u32) & ((1u32 << n) - 1) } else { 0 })
}

/// `jpeg_gen_optimal_table`: Häufigkeiten (256) → (BITS[1..=16], Werte).
fn optimale_tabelle(freq_ein: &[u32; 256]) -> ([u8; 17], Vec<u8>) {
    let mut freq = [0i64; 257];
    for i in 0..256 {
        freq[i] = freq_ein[i] as i64;
    }
    if freq.iter().all(|&f| f == 0) {
        freq[0] = 1;
    }
    freq[256] = 1;
    let mut codesize = [0i32; 257];
    let mut others = [-1i32; 257];
    loop {
        let mut c1 = -1i32;
        let mut v = i64::MAX;
        for i in 0..257 {
            if freq[i] != 0 && freq[i] <= v {
                v = freq[i];
                c1 = i as i32;
            }
        }
        let mut c2 = -1i32;
        v = i64::MAX;
        for i in 0..257 {
            if freq[i] != 0 && freq[i] <= v && i as i32 != c1 {
                v = freq[i];
                c2 = i as i32;
            }
        }
        if c2 < 0 {
            break;
        }
        let (mut a, mut b) = (c1 as usize, c2 as usize);
        freq[a] += freq[b];
        freq[b] = 0;
        codesize[a] += 1;
        while others[a] >= 0 {
            a = others[a] as usize;
            codesize[a] += 1;
        }
        others[a] = c2;
        codesize[b] += 1;
        while others[b] >= 0 {
            b = others[b] as usize;
            codesize[b] += 1;
        }
    }
    let mut bits = [0i32; 33];
    for i in 0..257 {
        if codesize[i] > 0 {
            bits[codesize[i] as usize] += 1;
        }
    }
    let mut i = 32;
    while i > 16 {
        while bits[i] > 0 {
            let mut j = i - 2;
            while bits[j] == 0 {
                j -= 1;
            }
            bits[i] -= 2;
            bits[i - 1] += 1;
            bits[j + 1] += 2;
            bits[j] -= 1;
        }
        i -= 1;
    }
    while bits[i] == 0 {
        i -= 1;
    }
    bits[i] -= 1;
    let mut aus = [0u8; 17];
    for l in 1..=16 {
        aus[l] = bits[l] as u8;
    }
    let mut werte = Vec::new();
    for l in 1..=32 {
        for j in 0..256 {
            if codesize[j] == l {
                werte.push(j as u8);
            }
        }
    }
    (aus, werte)
}

/// Kanonische Codes (Annex C): Symbol → (Code, Länge).
fn codes(bits: &[u8; 17], werte: &[u8]) -> [(u32, u8); 256] {
    let mut t = [(0u32, 0u8); 256];
    let mut code = 0u32;
    let mut p = 0;
    for l in 1..=16u8 {
        for _ in 0..bits[l as usize] {
            t[werte[p] as usize] = (code, l);
            code += 1;
            p += 1;
        }
        code <<= 1;
    }
    t
}

struct BitSchreiber {
    aus: Vec<u8>,
    acc: u32,
    n: u32,
}
impl BitSchreiber {
    fn schreibe(&mut self, v: u32, n: u8) {
        for i in (0..n).rev() {
            self.acc = (self.acc << 1) | ((v >> i) & 1);
            self.n += 1;
            if self.n == 8 {
                let b = self.acc as u8;
                self.aus.push(b);
                if b == 0xFF {
                    self.aus.push(0);
                }
                self.acc = 0;
                self.n = 0;
            }
        }
    }
    fn auffuellen(&mut self) {
        while self.n != 0 {
            self.schreibe(1, 1);
        }
    }
}

fn segment(aus: &mut Vec<u8>, marker: u8, daten: &[u8]) {
    aus.extend_from_slice(&[0xFF, marker]);
    aus.extend_from_slice(&((daten.len() + 2) as u16).to_be_bytes());
    aus.extend_from_slice(daten);
}

/// Scan-Beschreibung: (Komponenten, Ss, Se, Ah, Al).
type ScanDef = (Vec<usize>, usize, usize, u32, u32);

fn skript(n: usize, progressiv: bool, je_komponente: bool) -> Vec<ScanDef> {
    if !progressiv {
        if je_komponente {
            return (0..n).map(|c| (vec![c], 0, 63, 0, 0)).collect();
        }
        return vec![((0..n).collect(), 0, 63, 0, 0)];
    }
    if n == 1 {
        return vec![
            (vec![0], 0, 0, 0, 1),
            (vec![0], 1, 5, 0, 2),
            (vec![0], 6, 63, 0, 2),
            (vec![0], 1, 63, 2, 1),
            (vec![0], 0, 0, 1, 0),
            (vec![0], 1, 63, 1, 0),
        ];
    }
    vec![
        (vec![0, 1, 2], 0, 0, 0, 1),
        (vec![0], 1, 5, 0, 2),
        (vec![2], 1, 63, 0, 1),
        (vec![1], 1, 63, 0, 1),
        (vec![0], 6, 63, 0, 2),
        (vec![0], 1, 63, 2, 1),
        (vec![0, 1, 2], 0, 0, 1, 0),
        (vec![2], 1, 63, 1, 0),
        (vec![1], 1, 63, 1, 0),
        (vec![0], 1, 63, 1, 0),
    ]
}

#[allow(clippy::too_many_arguments)]
fn kodiere_block(k: &mut Kodierer, blk: &[i16; 64], dc_tab: u8, pred: &mut i32, ss: usize, se: usize, ah: u32, al: u32, baseline: bool) {
    if baseline {
        let (n, v) = bits_von(blk[0] as i32 - *pred);
        *pred = blk[0] as i32;
        k.s.push(Sym::Huff(true, dc_tab, n));
        if n > 0 {
            k.s.push(Sym::Bits(v, n));
        }
        let mut r = 0;
        for i in 1..64 {
            let t = blk[ZICKZACK[i]] as i32;
            if t == 0 {
                r += 1;
                continue;
            }
            while r > 15 {
                k.s.push(Sym::Huff(false, k.ac, 0xF0));
                r -= 16;
            }
            let (n, v) = bits_von(t);
            k.s.push(Sym::Huff(false, k.ac, (r << 4) as u8 + n));
            k.s.push(Sym::Bits(v, n));
            r = 0;
        }
        if r > 0 {
            k.s.push(Sym::Huff(false, k.ac, 0));
        }
        return;
    }
    if ss == 0 {
        if ah == 0 {
            let w = (blk[0] as i32) >> al;
            let (n, v) = bits_von(w - *pred);
            *pred = w;
            k.s.push(Sym::Huff(true, dc_tab, n));
            if n > 0 {
                k.s.push(Sym::Bits(v, n));
            }
        } else {
            k.s.push(Sym::Bits((((blk[0] as i32) >> al) & 1) as u32, 1));
        }
        return;
    }
    if ah == 0 {
        let mut r = 0;
        for i in ss..=se {
            let mut t = blk[ZICKZACK[i]] as i32;
            if t == 0 {
                r += 1;
                continue;
            }
            let t2;
            if t < 0 {
                t = -t;
                t >>= al;
                t2 = !t;
            } else {
                t >>= al;
                t2 = t;
            }
            if t == 0 {
                r += 1;
                continue;
            }
            k.eobrun_aus();
            while r > 15 {
                k.s.push(Sym::Huff(false, k.ac, 0xF0));
                r -= 16;
            }
            let mut n = 1u8;
            let mut tt = t >> 1;
            while tt != 0 {
                n += 1;
                tt >>= 1;
            }
            k.s.push(Sym::Huff(false, k.ac, (r << 4) as u8 + n));
            k.s.push(Sym::Bits((t2 as u32) & ((1 << n) - 1), n));
            r = 0;
        }
        if r > 0 {
            k.eobrun += 1;
            if k.eobrun == 0x7FFF {
                k.eobrun_aus();
            }
        }
        return;
    }
    // AC-Verfeinerung (jcphuff encode_mcu_AC_refine)
    let mut abs = [0i32; 64];
    let mut eob = 0;
    for i in ss..=se {
        let t = (blk[ZICKZACK[i]] as i32).abs() >> al;
        abs[i] = t;
        if t == 1 {
            eob = i;
        }
    }
    let mut r = 0;
    let mut br: Vec<u8> = Vec::new();
    for i in ss..=se {
        let t = abs[i];
        if t == 0 {
            r += 1;
            continue;
        }
        while r > 15 && i <= eob {
            k.eobrun_aus();
            k.s.push(Sym::Huff(false, k.ac, 0xF0));
            r -= 16;
            for b in br.drain(..) {
                k.s.push(Sym::Bits(b as u32, 1));
            }
        }
        if t > 1 {
            br.push((t & 1) as u8);
            continue;
        }
        k.eobrun_aus();
        k.s.push(Sym::Huff(false, k.ac, ((r << 4) + 1) as u8));
        k.s.push(Sym::Bits(if blk[ZICKZACK[i]] < 0 { 0 } else { 1 }, 1));
        for b in br.drain(..) {
            k.s.push(Sym::Bits(b as u32, 1));
        }
        r = 0;
    }
    if r > 0 || !br.is_empty() {
        k.eobrun += 1;
        k.be.append(&mut br);
        if k.eobrun == 0x7FFF || k.be.len() > 1000 - 64 + 1 {
            k.eobrun_aus();
        }
    }
}

/// JPEG aus RGBA (Alpha wird ignoriert).
pub fn jpeg(b: u32, h: u32, rgba: &[u8], o: &JpegOpt) -> Vec<u8> {
    let (bu, hu) = (b as usize, h as usize);
    let n = if o.grau { 1 } else { 3 };
    // Farbumrechnung (jccolor, Festkomma)
    let mut ebenen = vec![vec![0u8; bu * hu]; n];
    for i in 0..bu * hu {
        let (r, g, bb) = (rgba[i * 4] as i32, rgba[i * 4 + 1] as i32, rgba[i * 4 + 2] as i32);
        let y = (19595 * r + 38470 * g + 7471 * bb + 32768) >> 16;
        ebenen[0][i] = y.clamp(0, 255) as u8;
        if n == 3 {
            let cb = (-11059 * r - 21709 * g + 32768 * bb + (128 << 16) + 32767) >> 16;
            let cr = (32768 * r - 27439 * g - 5329 * bb + (128 << 16) + 32767) >> 16;
            ebenen[1][i] = cb.clamp(0, 255) as u8;
            ebenen[2][i] = cr.clamp(0, 255) as u8;
        }
    }
    let hmax = o.abtastung[..n].iter().map(|a| a.0 as usize).max().unwrap();
    let vmax = o.abtastung[..n].iter().map(|a| a.1 as usize).max().unwrap();
    let mcux = bu.div_ceil(8 * hmax);
    let mcuy = hu.div_ceil(8 * vmax);
    let ql = quant_tabelle(&STD_LUMA, o.qualitaet);
    let qc = quant_tabelle(&STD_CHROMA, o.qualitaet);
    let mut komp: Vec<Kompo> = Vec::new();
    for c in 0..n {
        let (kh, kv) = (o.abtastung[c].0 as usize, o.abtastung[c].1 as usize);
        let (fx, fy) = (hmax.div_ceil(kh), vmax.div_ceil(kv));
        let bw = (bu * kh).div_ceil(hmax);
        let bh = (hu * kv).div_ceil(vmax);
        let (bx, by) = (mcux * kh, mcuy * kv);
        let q = if c == 0 { &ql } else { &qc };
        let probe = |x: usize, y: usize| -> i64 {
            // Mittel über den fx × fy-Kasten, Ränder wiederholt
            let (x, y) = (x.min(bw - 1), y.min(bh - 1));
            let mut s = 0i64;
            for dy in 0..fy {
                for dx in 0..fx {
                    let (px, py) = ((x * fx + dx).min(bu - 1), (y * fy + dy).min(hu - 1));
                    s += ebenen[c][py * bu + px] as i64;
                }
            }
            div_rund(s, (fx * fy) as i64)
        };
        let mut koef = Vec::with_capacity(bx * by);
        for byy in 0..by {
            for bxx in 0..bx {
                let mut p = [0i64; 64];
                for y in 0..8 {
                    for x in 0..8 {
                        p[y * 8 + x] = probe(bxx * 8 + x, byy * 8 + y);
                    }
                }
                koef.push(fdct(&p, q));
            }
        }
        komp.push(Kompo { h: kh, v: kv, tab: if c == 0 { 0 } else { 1 }, bw, bh, bx, koef });
    }

    let mut aus = vec![0xFF, 0xD8];
    if o.jfif {
        segment(&mut aus, 0xE0, b"JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00");
    }
    if o.exif {
        let mut e = b"Exif\0\0MM\0\x2a\0\0\0\x08\0\x01\x01\x12\0\x03\0\0\0\x01\0\x06\0\0\0\0\0\0".to_vec();
        e.extend_from_slice(&[0x55; 40]);
        segment(&mut aus, 0xE1, &e);
        segment(&mut aus, 0xFE, b"Kommentar: Teigling-Test");
    }
    if let Some(t) = o.adobe {
        segment(&mut aus, 0xEE, &[b'A', b'd', b'o', b'b', b'e', 0, 100, 0, 0, 0, 0, t]);
    }
    let mut dqt = vec![0u8];
    dqt.extend(ZICKZACK.iter().map(|&z| ql[z] as u8));
    if n == 3 {
        dqt.push(1);
        dqt.extend(ZICKZACK.iter().map(|&z| qc[z] as u8));
    }
    segment(&mut aus, 0xDB, &dqt);
    let mut sof = vec![o.praezision];
    sof.extend_from_slice(&(h as u16).to_be_bytes());
    sof.extend_from_slice(&(b as u16).to_be_bytes());
    sof.push(n as u8);
    for (c, k) in komp.iter().enumerate() {
        sof.extend_from_slice(&[o.ids[c], ((k.h as u8) << 4) | k.v as u8, k.tab]);
    }
    segment(&mut aus, o.sof.unwrap_or(if o.progressiv { 0xC2 } else { 0xC0 }), &sof);
    if o.neustart > 0 {
        segment(&mut aus, 0xDD, &o.neustart.to_be_bytes());
    }
    for (kl, ss, se, ah, al) in skript(n, o.progressiv, o.je_komponente) {
        let baseline = !o.progressiv;
        let einzeln = kl.len() == 1;
        let mut kod = Kodierer { s: Vec::new(), eobrun: 0, be: Vec::new(), ac: 0 };
        let mut preds = [0i32; 3];
        let (mx_n, my_n) = if einzeln { (komp[kl[0]].bw.div_ceil(8), komp[kl[0]].bh.div_ceil(8)) } else { (mcux, mcuy) };
        let mut nr = 0usize;
        let mut rst = 0u8;
        for my in 0..my_n {
            for mx in 0..mx_n {
                if o.neustart > 0 && nr > 0 && nr % o.neustart as usize == 0 {
                    kod.eobrun_aus();
                    kod.s.push(Sym::Neustart(rst));
                    rst = (rst + 1) & 7;
                    preds = [0; 3];
                }
                nr += 1;
                for &c in &kl {
                    let k = &komp[c];
                    kod.ac = k.tab;
                    let (hn, vn) = if einzeln { (1, 1) } else { (k.h, k.v) };
                    for v in 0..vn {
                        for hh in 0..hn {
                            let (bx, by) = if einzeln { (mx, my) } else { (mx * k.h + hh, my * k.v + v) };
                            let blk = k.koef[by * k.bx + bx];
                            kodiere_block(&mut kod, &blk, k.tab, &mut preds[c], ss, se, ah, al, baseline);
                        }
                    }
                }
            }
        }
        kod.eobrun_aus();
        // Häufigkeiten → optimale Tabellen
        let mut freq = [[[0u32; 256]; 2]; 2];
        for s in &kod.s {
            if let Sym::Huff(dc, t, sym) = *s {
                freq[dc as usize][t as usize][sym as usize] += 1;
            }
        }
        let mut dht = Vec::new();
        let mut tabellen = [[[(0u32, 0u8); 256]; 2]; 2];
        for dc in [true, false] {
            for t in 0..2 {
                if freq[dc as usize][t].iter().any(|&f| f > 0) {
                    let (bits, werte) = optimale_tabelle(&freq[dc as usize][t]);
                    dht.push(((if dc { 0 } else { 1 }) << 4) | t as u8);
                    dht.extend_from_slice(&bits[1..]);
                    dht.extend_from_slice(&werte);
                    tabellen[dc as usize][t] = codes(&bits, &werte);
                }
            }
        }
        if !dht.is_empty() {
            segment(&mut aus, 0xC4, &dht);
        }
        let mut sos = vec![kl.len() as u8];
        for &c in &kl {
            sos.extend_from_slice(&[o.ids[c], (komp[c].tab << 4) | komp[c].tab]);
        }
        sos.extend_from_slice(&[ss as u8, se as u8, ((ah as u8) << 4) | al as u8]);
        segment(&mut aus, 0xDA, &sos);
        let mut w = BitSchreiber { aus: Vec::new(), acc: 0, n: 0 };
        for s in &kod.s {
            match *s {
                Sym::Huff(dc, t, sym) => {
                    let (c, l) = tabellen[dc as usize][t as usize][sym as usize];
                    w.schreibe(c, l);
                }
                Sym::Bits(v, n) => w.schreibe(v, n),
                Sym::Neustart(m) => {
                    w.auffuellen();
                    w.aus.extend_from_slice(&[0xFF, 0xD0 + m]);
                }
            }
        }
        w.auffuellen();
        aus.extend_from_slice(&w.aus);
    }
    aus.extend_from_slice(&[0xFF, 0xD9]);
    if o.abschneiden > 0 && o.abschneiden < aus.len() {
        aus.truncate(aus.len() - o.abschneiden);
    }
    aus
}

/// Nur Kopf + SOF eines JPEG (für „zu groß“).
pub fn jpeg_nur_kopf(b: u16, h: u16) -> Vec<u8> {
    let mut aus = vec![0xFF, 0xD8];
    let mut sof = vec![8];
    sof.extend_from_slice(&h.to_be_bytes());
    sof.extend_from_slice(&b.to_be_bytes());
    sof.extend_from_slice(&[3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    segment(&mut aus, 0xC0, &sof);
    aus.extend_from_slice(&[0xFF, 0xD9]);
    aus
}

// ------------------------------------------------------------------ Fälle

fn pq(b: u32, h: u32, ft: u8, bit: u8, saat: u32) -> PngQuelle {
    png_quelle(b, h, ft, bit, saat)
}

/// Alle goldenen Fälle: (Name, Quellbytes). Reihenfolge und Inhalt sind Teil des Tests (`golden.txt`).
pub fn faelle() -> Vec<(String, Vec<u8>)> {
    let mut f: Vec<(String, Vec<u8>)> = Vec::new();
    let std = PngOpt::default();
    // PNG: alle Farbtypen und Bittiefen
    for (ft, bits) in [(0u8, &[1u8, 2, 4, 8, 16][..]), (2, &[8, 16]), (3, &[1, 2, 4, 8]), (4, &[8, 16]), (6, &[8, 16])] {
        for &bit in bits {
            let q = pq(13 + bit as u32, 7 + ft as u32, ft, bit, (ft as u32) * 100 + bit as u32);
            f.push((format!("png-typ{}-{}bit", ft, bit), png(&q, &std)));
        }
    }
    // tRNS: Farbschlüssel in Original-Bittiefe, Palette mit Alpha
    for (ft, bit) in [(0u8, 4u8), (0, 16), (2, 8), (2, 16)] {
        let mut q = pq(17, 9, ft, bit, 7 + bit as u32);
        let k = kanaele(ft);
        let s: Vec<u16> = q.proben[3 * k..4 * k].to_vec(); // Farbe von Pixel 3 wird durchsichtig
        q.trns = Some(s.iter().flat_map(|v| v.to_be_bytes()).collect());
        f.push((format!("png-typ{}-{}bit-trns", ft, bit), png(&q, &std)));
    }
    for bit in [2u8, 8] {
        let mut q = pq(19, 11, 3, bit, 33);
        let n = q.palette.len();
        q.trns = Some((0..n.min(3).max(1)).map(|i| (i * 100) as u8).collect());
        f.push((format!("png-palette-{}bit-trns", bit), png(&q, &std)));
    }
    for filter in 0..5u8 {
        let q = pq(31, 17, 6, 8, 50 + filter as u32);
        f.push((format!("png-filter{}", filter), png(&q, &PngOpt { filter: Some(filter), ..PngOpt::default() })));
    }
    f.push(("png-1x1".into(), png(&pq(1, 1, 6, 8, 1), &std)));
    f.push(("png-1x9".into(), png(&pq(1, 9, 2, 8, 2), &std)));
    f.push(("png-257x129-rgba".into(), png(&pq(257, 129, 6, 8, 3), &std)));
    f.push(("png-idat-teile".into(), png(&pq(40, 30, 2, 8, 4), &PngOpt { idat_teile: 7, ..PngOpt::default() })));
    f.push(("png-zusatz".into(), png(&pq(20, 10, 0, 8, 5), &PngOpt { zusatz: true, ..PngOpt::default() })));
    // PNG-Fehler
    let q = pq(12, 8, 2, 8, 9);
    f.push(("png-fehler-interlace".into(), png(&q, &PngOpt { interlace_byte: true, ..PngOpt::default() })));
    f.push(("png-fehler-crc".into(), png(&q, &PngOpt { crc_kaputt: true, ..PngOpt::default() })));
    f.push(("png-fehler-zu-lang".into(), png(&q, &PngOpt { ein_byte_zu_viel: true, ..PngOpt::default() })));
    f.push(("png-fehler-zu-kurz".into(), png(&q, &PngOpt { ein_byte_zu_wenig: true, ..PngOpt::default() })));
    f.push(("png-fehler-apng".into(), png(&q, &PngOpt { actl: true, ..PngOpt::default() })));
    f.push(("png-fehler-filter5".into(), png(&q, &PngOpt { filter_byte: Some(5), ..PngOpt::default() })));
    f.push(("png-fehler-ohne-iend".into(), png(&q, &PngOpt { ohne_iend: true, ..PngOpt::default() })));
    f.push(("png-fehler-kritisch".into(), png(&q, &PngOpt { kritisch_unbekannt: true, ..PngOpt::default() })));
    let mut qp = pq(12, 8, 3, 8, 9);
    qp.palette.truncate(4);
    f.push(("png-fehler-palettenindex".into(), png(&qp, &std)));
    let mut qo = pq(12, 8, 3, 4, 9);
    qo.palette.clear();
    f.push(("png-fehler-ohne-plte".into(), png(&qo, &std)));
    f.push(("png-zu-gross-2400x800".into(), png_nur_kopf(2400, 800)));
    f.push(("png-zu-gross-70000x10".into(), png_nur_kopf(70000, 10)));
    f.push(("png-zu-gross-2049x1".into(), png_nur_kopf(2049, 1)));
    f.push(("leer".into(), Vec::new()));
    f.push(("kein-bild".into(), b"GIF89a ist hier nicht erlaubt".to_vec()));
    let mut riesig = SIGNATUR.to_vec();
    riesig.resize(crate::MAX_QUELLE + 1, 0);
    f.push(("quelle-ueber-2mib".into(), riesig));

    // JPEG
    let m = |b: u32, h: u32, s: u32| muster(b, h, s, 6, false);
    let jp = |name: &str, b: u32, h: u32, s: u32, o: JpegOpt, f: &mut Vec<(String, Vec<u8>)>| {
        let px = m(b, h, s);
        f.push((String::from(name), jpeg(b, h, &px, &o)));
    };
    let d = JpegOpt::default;
    jp("jpeg-444", 40, 24, 1, JpegOpt { abtastung: [(1, 1), (1, 1), (1, 1)], ..d() }, &mut f);
    jp("jpeg-422", 40, 24, 2, JpegOpt { abtastung: [(2, 1), (1, 1), (1, 1)], ..d() }, &mut f);
    jp("jpeg-420", 40, 24, 3, d(), &mut f);
    jp("jpeg-440", 40, 24, 4, JpegOpt { abtastung: [(1, 2), (1, 1), (1, 1)], ..d() }, &mut f);
    jp("jpeg-411", 40, 24, 5, JpegOpt { abtastung: [(4, 1), (1, 1), (1, 1)], ..d() }, &mut f);
    jp("jpeg-chroma-groesser", 32, 32, 6, JpegOpt { abtastung: [(1, 1), (2, 2), (1, 1)], ..d() }, &mut f);
    jp("jpeg-grau", 33, 17, 7, JpegOpt { grau: true, ..d() }, &mut f);
    jp("jpeg-grau-2x2", 33, 17, 8, JpegOpt { grau: true, abtastung: [(2, 2), (1, 1), (1, 1)], ..d() }, &mut f);
    jp("jpeg-420-ungerade", 37, 23, 9, d(), &mut f);
    jp("jpeg-1x1", 1, 1, 10, d(), &mut f);
    jp("jpeg-420-neustart", 64, 48, 11, JpegOpt { neustart: 3, ..d() }, &mut f);
    jp("jpeg-444-je-komponente", 40, 24, 12, JpegOpt { abtastung: [(1, 1), (1, 1), (1, 1)], je_komponente: true, ..d() }, &mut f);
    jp("jpeg-420-je-komponente-neustart", 50, 30, 13, JpegOpt { je_komponente: true, neustart: 2, ..d() }, &mut f);
    jp("jpeg-q100", 24, 16, 14, JpegOpt { qualitaet: 100, ..d() }, &mut f);
    jp("jpeg-q5", 24, 16, 15, JpegOpt { qualitaet: 5, ..d() }, &mut f);
    jp("jpeg-exif-com", 24, 16, 16, JpegOpt { exif: true, ..d() }, &mut f);
    jp("jpeg-sof1", 24, 16, 17, JpegOpt { sof: Some(0xC1), ..d() }, &mut f);
    jp("jpeg-ohne-jfif-adobe1", 24, 16, 18, JpegOpt { jfif: false, adobe: Some(1), ..d() }, &mut f);
    jp("jpeg-jfif-adobe0", 24, 16, 19, JpegOpt { adobe: Some(0), ..d() }, &mut f);
    jp("jpeg-prog-420", 64, 40, 20, JpegOpt { progressiv: true, ..d() }, &mut f);
    jp("jpeg-prog-444-neustart", 40, 24, 21, JpegOpt { progressiv: true, abtastung: [(1, 1), (1, 1), (1, 1)], neustart: 2, ..d() }, &mut f);
    jp("jpeg-prog-grau", 45, 29, 22, JpegOpt { progressiv: true, grau: true, ..d() }, &mut f);
    jp("jpeg-prog-422-q95", 48, 32, 23, JpegOpt { progressiv: true, abtastung: [(2, 1), (1, 1), (1, 1)], qualitaet: 95, ..d() }, &mut f);
    jp("jpeg-prog-groesser", 200, 120, 24, JpegOpt { progressiv: true, neustart: 5, ..d() }, &mut f);
    jp("jpeg-abgeschnitten", 40, 24, 25, JpegOpt { abschneiden: 40, ..d() }, &mut f);
    f.push(("jpeg-zu-gross-4000x3000".into(), jpeg_nur_kopf(4000, 3000)));
    f.push(("jpeg-zu-gross-2048x2049".into(), jpeg_nur_kopf(2048, 2049)));
    // JPEG-Fehler
    jp("jpeg-fehler-adobe0", 24, 16, 26, JpegOpt { jfif: false, adobe: Some(0), ..d() }, &mut f);
    jp("jpeg-fehler-rgb-kennungen", 24, 16, 27, JpegOpt { jfif: false, ids: [b'R', b'G', b'B'], ..d() }, &mut f);
    jp("jpeg-fehler-arithmetisch", 24, 16, 28, JpegOpt { sof: Some(0xC9), ..d() }, &mut f);
    jp("jpeg-fehler-12bit", 24, 16, 29, JpegOpt { praezision: 12, ..d() }, &mut f);
    jp("jpeg-fehler-verhaeltnis", 24, 16, 30, JpegOpt { abtastung: [(3, 1), (2, 1), (1, 1)], ..d() }, &mut f);
    let px = m(24, 16, 31);
    let mut ohne_scan = jpeg(24, 16, &px, &d());
    let sos = ohne_scan.windows(2).position(|w| w == [0xFF, 0xDA]).unwrap();
    ohne_scan.truncate(sos);
    ohne_scan.extend_from_slice(&[0xFF, 0xD9]);
    f.push(("jpeg-fehler-ohne-scan".into(), ohne_scan));
    f
}

/// Messbilder (bench/herd/ERGEBNISSE.md): 1024 × 1024 PNG (RGBA, mit Alpha) und JPEG (4:2:0, Qualität 85, Baseline) sowie
/// ein progressives JPEG gleicher Größe.
pub fn messbilder() -> Vec<(String, Vec<u8>)> {
    let px = muster(1024, 1024, 77, 1, true);
    let mut q = PngQuelle { breite: 1024, hoehe: 1024, farbtyp: 6, bit: 8, proben: px.iter().map(|&v| v as u16).collect(), palette: Vec::new(), trns: None };
    let png1 = png(&q, &PngOpt { filter: Some(4), ..PngOpt::default() });
    q.proben.clear();
    let px2 = muster(1024, 1024, 78, 4, false);
    let j = jpeg(1024, 1024, &px2, &JpegOpt { qualitaet: 85, ..JpegOpt::default() });
    let jp = jpeg(1024, 1024, &px2, &JpegOpt { qualitaet: 85, progressiv: true, ..JpegOpt::default() });
    vec![("mess-1024-rgba.png".into(), png1), ("mess-1024-420.jpg".into(), j), ("mess-1024-420-prog.jpg".into(), jp)]
}
