//! JPEG-Decoder (PROJEKTE.md §5.3): Baseline (SOF0/SOF1) und progressiv (SOF2), Huffman, 8 bit, 1 Komponente (Grau) oder
//! 3 (YCbCr), Abtastfaktoren 1 … 4 mit ganzzahligem Verhältnis zum größten Faktor, Restart-Marker (`DRI`/`RSTn`).
//!
//! **Festgelegte Rechenwege** (Ergebnis = libjpeg/libjpeg-turbo mit `dct_method = JDCT_ISLOW` und
//! `do_fancy_upsampling = FALSE`, d. h. `djpeg -dct int -nosmooth`, für vollständige Dateien):
//! - Koeffizienten als `i16` (`JCOEF`), DC-Vorhersage in `i32`, Huffman-Erweiterung und Fortschritts-Verfeinerung wie
//!   `jdhuff.c`/`jdphuff.c` (auch die Behandlung beschädigter Daten: fehlende Bits sind 0, ungültige Codes liefern 0).
//! - Ganzzahlige IDCT `jpeg_idct_islow` (`jidctint.c`, CONST_BITS 13, PASS1_BITS 2) mit der Bereichstabelle von
//!   `prepare_range_limit_table` (Index `& 1023`).
//! - Chroma durch **Wiederholen** hochgerechnet (`int_upsample`/`h2v1`/`h2v2`, kein „fancy upsampling“).
//! - YCbCr → RGB mit den 16-bit-Festkomma-Tabellen von `jdcolor.c` (`build_ycc_rgb_table`), Klemmung auf 0 … 255.
//! - Quantisierungstabellen werden je Komponente beim ersten Scan übernommen (wie `latch_quant_tables`).
//! - Keine Blockglättung, keine Farbverwaltung; EXIF-Drehung und alle APPn/COM-Abschnitte werden ignoriert.
//!
//! Nicht unterstützt (→ kein lesbares Bild): arithmetische Kodierung, 12 bit, verlustfrei/hierarchisch, CMYK (4 Komponenten),
//! Adobe-Transform 0 (RGB-JPEG), nicht ganzzahlige Abtastverhältnisse, `DNL` (Höhe 0).

use alloc::vec;
use alloc::vec::Vec;

use crate::{pruefe_groesse, Bild, Fehler};

pub fn ist_jpeg(q: &[u8]) -> bool {
    q.len() >= 3 && q[0] == 0xFF && q[1] == 0xD8 && q[2] == 0xFF
}

/// Zickzack → natürliche Reihenfolge, mit 16 Sicherheitseinträgen (wie `jpeg_natural_order` in libjpeg).
const NATUERLICH: [usize; 80] = [
    0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35,
    42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
    63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63,
];

const SCHNELL_BITS: u32 = 9;

/// Huffman-Tabelle wie in `DHT` (BITS[1..=16], Werte); gebaut wird erst beim Scan.
type Roh = ([u8; 17], Vec<u8>);

/// Huffman-Tabelle (Annex C / `jpeg_make_d_derived_tbl`) mit 9-Bit-Vorschau.
#[derive(Clone)]
struct Huff {
    maxcode: [i32; 18],
    valoffset: [i32; 17],
    werte: [u8; 256],
    /// (Länge << 8) | Wert, 0 = länger als 9 Bit
    schnell: Vec<u16>,
}

impl Huff {
    /// Wie `jpeg_make_d_derived_tbl` (beim Scan-Beginn): ungültige Längen → Fehler, DC-Werte > 15 → Fehler.
    fn neu(roh: &Roh, ist_dc: bool) -> Option<Huff> {
        let (bits, werte_roh) = (&roh.0, &roh.1[..]);
        if ist_dc && werte_roh.iter().any(|&w| w > 15) {
            return None;
        }
        let mut werte = [0u8; 256];
        werte[..werte_roh.len()].copy_from_slice(werte_roh);
        let mut maxcode = [-1i32; 18];
        let mut valoffset = [0i32; 17];
        let mut schnell = vec![0u16; 1 << SCHNELL_BITS];
        let mut code: u32 = 0;
        let mut p: usize = 0;
        for l in 1..=16usize {
            let n = bits[l] as usize;
            if n > 0 {
                valoffset[l] = p as i32 - code as i32;
                for _ in 0..n {
                    if l as u32 <= SCHNELL_BITS {
                        let frei = SCHNELL_BITS - l as u32;
                        let basis = (code << frei) as usize;
                        for j in 0..(1usize << frei) {
                            schnell[basis + j] = ((l as u16) << 8) | werte[p] as u16;
                        }
                    }
                    code += 1;
                    p += 1;
                }
                maxcode[l] = code as i32 - 1;
            }
            if code >= (1u32 << l) {
                return None; // auch der Code aus lauter Einsen ist verboten
            }
            code <<= 1;
        }
        maxcode[17] = 0x000F_FFFF;
        Some(Huff { maxcode, valoffset, werte, schnell })
    }
}

/// Bitleser über einem Entropie-Segment (ohne Marker außer `RSTn`); fehlende Bits sind 0 (wie libjpeg).
struct Bits<'a> {
    d: &'a [u8],
    p: usize,
    acc: u64,
    n: u32,
    /// an einem Marker angehalten (`p` zeigt auf `FF`)
    marker: bool,
}

impl<'a> Bits<'a> {
    fn neu(d: &'a [u8]) -> Self {
        Bits { d, p: 0, acc: 0, n: 0, marker: false }
    }
    #[inline]
    fn fuelle(&mut self) {
        while self.n <= 56 {
            let mut byte = 0u8;
            if !self.marker && self.p < self.d.len() {
                let c = self.d[self.p];
                if c == 0xFF {
                    let mut q = self.p + 1;
                    while q < self.d.len() && self.d[q] == 0xFF {
                        q += 1;
                    }
                    if q < self.d.len() && self.d[q] == 0 {
                        byte = 0xFF;
                        self.p = q + 1;
                    } else {
                        self.marker = true;
                        self.p = q.saturating_sub(1).max(self.p);
                    }
                } else {
                    byte = c;
                    self.p += 1;
                }
            }
            self.acc |= (byte as u64) << (56 - self.n);
            self.n += 8;
        }
    }
    #[inline]
    fn hole(&mut self, s: u32) -> u32 {
        if s == 0 {
            return 0;
        }
        if self.n < s {
            self.fuelle();
        }
        let v = (self.acc >> (64 - s)) as u32;
        self.acc <<= s;
        self.n -= s;
        v
    }
    #[inline]
    fn bit(&mut self) -> u32 {
        self.hole(1)
    }
    #[inline]
    fn dekodiere(&mut self, t: &Huff) -> u32 {
        if self.n < 16 {
            self.fuelle();
        }
        let vorschau = (self.acc >> (64 - SCHNELL_BITS)) as usize;
        let e = t.schnell[vorschau];
        if e != 0 {
            let l = (e >> 8) as u32;
            self.acc <<= l;
            self.n -= l;
            return (e & 0xFF) as u32;
        }
        let mut code = self.bit() as i32;
        let mut l = 1usize;
        while code > t.maxcode[l] {
            code = (code << 1) | self.bit() as i32;
            l += 1;
            if l > 16 {
                return 0; // ungültiger Code: libjpeg warnt und liefert 0
            }
        }
        let i = code + t.valoffset[l];
        t.werte[(i & 0xFF) as usize] as u32
    }
    /// Neustart: Bitpuffer verwerfen, den nächsten `RSTn` überspringen (fehlt er, weiter mit dem, was folgt).
    fn neustart(&mut self) {
        self.acc = 0;
        self.n = 0;
        if !self.marker {
            // Restbytes bis zum nächsten Marker überspringen (beschädigte Daten)
            while self.p + 1 < self.d.len() && !(self.d[self.p] == 0xFF && self.d[self.p + 1] != 0 && self.d[self.p + 1] != 0xFF) {
                self.p += 1;
            }
            if self.p + 1 >= self.d.len() {
                self.p = self.d.len();
                return;
            }
        }
        let mut q = self.p;
        while q < self.d.len() && self.d[q] == 0xFF {
            q += 1;
        }
        if q < self.d.len() && (0xD0..=0xD7).contains(&self.d[q]) {
            self.p = q + 1;
            self.marker = false;
        }
    }
}

#[inline]
fn erweitere(v: u32, s: u32) -> i32 {
    if s == 0 {
        return 0;
    }
    let v = v as i32;
    if v < (1 << (s - 1)) {
        v + ((-1i32) << s) + 1
    } else {
        v
    }
}

#[derive(Clone)]
struct Komp {
    id: u8,
    h: usize,
    v: usize,
    tq: usize,
    /// Breite/Höhe in Proben (aufgerundet)
    bw: usize,
    bh: usize,
    /// Blöcke je Zeile/Spalte im Speicher (auf MCUs aufgefüllt)
    bx: usize,
    by: usize,
    koef: Vec<i16>,
    quant: Option<[u16; 64]>,
    pred: i32,
}

struct Rahmen {
    progressiv: bool,
    breite: usize,
    hoehe: usize,
    hmax: usize,
    vmax: usize,
    mcux: usize,
    mcuy: usize,
    komp: Vec<Komp>,
}

fn be16(q: &[u8], i: usize) -> usize {
    ((q[i] as usize) << 8) | q[i + 1] as usize
}

/// Ende eines Entropie-Segments: erster Marker außer `FF00`, `FFFF…` und `RSTn`.
fn segment_ende(q: &[u8], mut p: usize) -> usize {
    while p + 1 < q.len() {
        if q[p] == 0xFF {
            let m = q[p + 1];
            if m == 0 || m == 0xFF || (0xD0..=0xD7).contains(&m) {
                p += if m == 0xFF { 1 } else { 2 };
                continue;
            }
            return p;
        }
        p += 1;
    }
    q.len()
}

pub fn dekodiere(q: &[u8]) -> Result<Bild, Fehler> {
    let kein = Err(Fehler::KeinBild);
    let mut quant: [Option<[u16; 64]>; 4] = [None; 4];
    let mut dc: [Option<Roh>; 4] = [None, None, None, None];
    let mut ac: [Option<Roh>; 4] = [None, None, None, None];
    let mut rahmen: Option<Rahmen> = None;
    let mut neustart_abstand = 0usize;
    let mut adobe: Option<u8> = None;
    let mut jfif = false;
    let mut scans = 0usize;
    let mut p = 2;
    loop {
        // nächster Marker (Füllbytes FF überspringen)
        while p < q.len() && q[p] != 0xFF {
            p += 1; // Müll zwischen Abschnitten: libjpeg sucht den nächsten Marker
        }
        while p < q.len() && q[p] == 0xFF {
            p += 1;
        }
        if p >= q.len() {
            break; // ohne EOI: was da ist, zählt
        }
        let m = q[p];
        p += 1;
        match m {
            0xD9 => break,
            0xD0..=0xD7 | 0x01 | 0xD8 => continue,
            _ => {}
        }
        if p + 2 > q.len() {
            return kein;
        }
        let laenge = be16(q, p);
        if laenge < 2 || p + laenge > q.len() {
            return kein;
        }
        let d = &q[p + 2..p + laenge];
        p += laenge;
        match m {
            0xC0 | 0xC1 | 0xC2 => {
                if rahmen.is_some() || d.len() < 6 {
                    return kein;
                }
                if d[0] != 8 {
                    return kein; // 12 bit
                }
                let (hoehe, breite, n) = (be16(d, 1), be16(d, 3), d[5] as usize);
                if hoehe == 0 {
                    return kein; // DNL
                }
                pruefe_groesse(breite as u32, hoehe as u32)?;
                if !(n == 1 || n == 3) || d.len() != 6 + 3 * n {
                    return kein;
                }
                let mut komp = Vec::with_capacity(n);
                for i in 0..n {
                    let (id, hv, tq) = (d[6 + 3 * i], d[7 + 3 * i], d[8 + 3 * i] as usize);
                    let (h, v) = ((hv >> 4) as usize, (hv & 15) as usize);
                    if !(1..=4).contains(&h) || !(1..=4).contains(&v) || tq > 3 || komp.iter().any(|k: &Komp| k.id == id) {
                        return kein;
                    }
                    komp.push(Komp { id, h, v, tq, bw: 0, bh: 0, bx: 0, by: 0, koef: Vec::new(), quant: None, pred: 0 });
                }
                let hmax = komp.iter().map(|k| k.h).max().unwrap_or(1);
                let vmax = komp.iter().map(|k| k.v).max().unwrap_or(1);
                if komp.iter().any(|k| hmax % k.h != 0 || vmax % k.v != 0) {
                    return kein;
                }
                let mcux = breite.div_ceil(8 * hmax);
                let mcuy = hoehe.div_ceil(8 * vmax);
                for k in komp.iter_mut() {
                    k.bw = (breite * k.h).div_ceil(hmax);
                    k.bh = (hoehe * k.v).div_ceil(vmax);
                    k.bx = mcux * k.h;
                    k.by = mcuy * k.v;
                    k.koef = vec![0i16; k.bx * k.by * 64];
                }
                rahmen = Some(Rahmen { progressiv: m == 0xC2, breite, hoehe, hmax, vmax, mcux, mcuy, komp });
            }
            0xC3 | 0xC5..=0xC7 | 0xC9..=0xCB | 0xCD..=0xCF | 0xCC | 0xDC | 0xDE | 0xDF => return kein,
            0xC4 => {
                let mut i = 0;
                while i < d.len() {
                    if i + 17 > d.len() {
                        return kein;
                    }
                    let (klasse, nr) = (d[i] >> 4, (d[i] & 15) as usize);
                    if klasse > 1 || nr > 3 {
                        return kein;
                    }
                    let mut bits = [0u8; 17];
                    bits[1..17].copy_from_slice(&d[i + 1..i + 17]);
                    let summe: usize = bits.iter().map(|&b| b as usize).sum();
                    if summe > 256 || i + 17 + summe > d.len() {
                        return kein;
                    }
                    let t: Roh = (bits, d[i + 17..i + 17 + summe].to_vec());
                    if klasse == 0 {
                        dc[nr] = Some(t);
                    } else {
                        ac[nr] = Some(t);
                    }
                    i += 17 + summe;
                }
            }
            0xDB => {
                let mut i = 0;
                while i < d.len() {
                    let (pq, nr) = (d[i] >> 4, (d[i] & 15) as usize);
                    if pq > 1 || nr > 3 {
                        return kein;
                    }
                    let n = if pq == 0 { 64 } else { 128 };
                    if i + 1 + n > d.len() {
                        return kein;
                    }
                    let mut t = [0u16; 64];
                    for (k, &z) in NATUERLICH[..64].iter().enumerate() {
                        t[z] = if pq == 0 { d[i + 1 + k] as u16 } else { ((d[i + 1 + 2 * k] as u16) << 8) | d[i + 2 + 2 * k] as u16 };
                    }
                    quant[nr] = Some(t);
                    i += 1 + n;
                }
            }
            0xDD => {
                if d.len() < 2 {
                    return kein;
                }
                neustart_abstand = be16(d, 0);
            }
            0xE0 => {
                if d.len() >= 5 && &d[..5] == b"JFIF\0" {
                    jfif = true;
                }
            }
            0xEE => {
                if d.len() >= 12 && &d[..5] == b"Adobe" {
                    adobe = Some(d[11]);
                }
            }
            0xDA => {
                let Some(r) = rahmen.as_mut() else { return kein };
                if d.is_empty() {
                    return kein;
                }
                let ns = d[0] as usize;
                if ns == 0 || ns > 4 || d.len() != 4 + 2 * ns {
                    return kein;
                }
                let mut im_scan: Vec<(usize, usize, usize)> = Vec::with_capacity(ns);
                for i in 0..ns {
                    let (id, t) = (d[1 + 2 * i], d[2 + 2 * i]);
                    let Some(ki) = r.komp.iter().position(|k| k.id == id) else { return kein };
                    if (t >> 4) > 3 || (t & 15) > 3 || im_scan.iter().any(|x| x.0 == ki) {
                        return kein;
                    }
                    im_scan.push((ki, (t >> 4) as usize, (t & 15) as usize));
                }
                let (ss, se, ah, al) = (d[1 + 2 * ns] as usize, d[2 + 2 * ns] as usize, (d[3 + 2 * ns] >> 4) as u32, (d[3 + 2 * ns] & 15) as u32);
                if r.progressiv {
                    // wie start_pass_phuff_decoder
                    if se > 63 || ss > se || (ss == 0 && se != 0) || (ss > 0 && ns != 1) || al > 13 || (ah != 0 && al + 1 != ah) {
                        return kein;
                    }
                } // Baseline: Ss/Se/Ah/Al werden wie in libjpeg nicht ausgewertet
                // Quantisierungstabellen übernehmen (einmal je Komponente)
                for &(ki, _, _) in &im_scan {
                    let k = &mut r.komp[ki];
                    if k.quant.is_none() {
                        let Some(t) = quant[k.tq] else { return kein };
                        k.quant = Some(t);
                    }
                }
                // Huffman-Tabellen bauen (wie libjpeg beim Scan-Beginn, nur die gebrauchten)
                let (braucht_dc, braucht_ac) = if r.progressiv { (ss == 0 && ah == 0, ss > 0) } else { (true, true) };
                let mut tab: Vec<(Option<Huff>, Option<Huff>)> = Vec::with_capacity(ns);
                for &(_, td, ta) in &im_scan {
                    let mut paar = (None, None);
                    if braucht_dc {
                        let Some(t) = dc[td].as_ref().and_then(|roh| Huff::neu(roh, true)) else { return kein };
                        paar.0 = Some(t);
                    }
                    if braucht_ac {
                        let Some(t) = ac[ta].as_ref().and_then(|roh| Huff::neu(roh, false)) else { return kein };
                        paar.1 = Some(t);
                    }
                    tab.push(paar);
                }
                let ende = segment_ende(q, p);
                scan(r, &im_scan, &tab, ss, se, ah, al, neustart_abstand, &q[p..ende]);
                scans += 1;
                p = ende;
            }
            _ => {} // APPn, COM, …: überspringen
        }
    }
    let Some(r) = rahmen else { return kein };
    if scans == 0 {
        return kein;
    }
    // Farbraum wie default_decompress_parms: JFIF → YCbCr; sonst Adobe-Transform 0 bzw. Kennungen R, G, B → RGB (nicht unterstützt)
    if r.komp.len() == 3 && !jfif {
        let rgb = match adobe {
            Some(t) => t == 0,
            None => r.komp[0].id == b'R' && r.komp[1].id == b'G' && r.komp[2].id == b'B',
        };
        if rgb {
            return kein;
        }
    }
    Ok(ausgabe(&r))
}

#[allow(clippy::too_many_arguments)]
fn scan(r: &mut Rahmen, im_scan: &[(usize, usize, usize)], tab: &[(Option<Huff>, Option<Huff>)], ss: usize, se: usize, ah: u32, al: u32, ri: usize, daten: &[u8]) {
    let (baseline, dc_scan) = (!r.progressiv, ss == 0);
    for k in r.komp.iter_mut() {
        k.pred = 0;
    }
    let mut bits = Bits::neu(daten);
    let mut eobrun: u32 = 0;
    let mut mcu_nr = 0usize;
    let einzeln = im_scan.len() == 1;
    let (mx_n, my_n) = if einzeln {
        let k = &r.komp[im_scan[0].0];
        (k.bw.div_ceil(8), k.bh.div_ceil(8))
    } else {
        (r.mcux, r.mcuy)
    };
    for my in 0..my_n {
        for mx in 0..mx_n {
            if ri > 0 && mcu_nr > 0 && mcu_nr % ri == 0 {
                bits.neustart();
                eobrun = 0;
                for k in r.komp.iter_mut() {
                    k.pred = 0;
                }
            }
            mcu_nr += 1;
            for (si, &(ki, _, _)) in im_scan.iter().enumerate() {
                let (dc, ac) = (tab[si].0.as_ref(), tab[si].1.as_ref());
                let k = &mut r.komp[ki];
                let (hn, vn) = if einzeln { (1, 1) } else { (k.h, k.v) };
                for v in 0..vn {
                    for h in 0..hn {
                        let (bx, by) = if einzeln { (mx, my) } else { (mx * k.h + h, my * k.v + v) };
                        let o = (by * k.bx + bx) * 64;
                        let block: &mut [i16] = &mut k.koef[o..o + 64];
                        if baseline {
                            block_baseline(&mut bits, dc.unwrap(), ac.unwrap(), &mut k.pred, block);
                        } else if dc_scan {
                            if ah == 0 {
                                let t = bits.dekodiere(dc.unwrap());
                                let diff = erweitere(bits.hole(t), t);
                                k.pred = k.pred.wrapping_add(diff);
                                block[0] = (k.pred.wrapping_shl(al)) as i16;
                            } else if bits.bit() != 0 {
                                block[0] |= (1i32 << al) as i16;
                            }
                        } else if ah == 0 {
                            ac_erst(&mut bits, ac.unwrap(), ss, se, al, &mut eobrun, block);
                        } else {
                            ac_verfeinere(&mut bits, ac.unwrap(), ss, se, al, &mut eobrun, block);
                        }
                    }
                }
            }
        }
    }
}

fn block_baseline(bits: &mut Bits, dc: &Huff, ac: &Huff, pred: &mut i32, block: &mut [i16]) {
    let t = bits.dekodiere(dc);
    let diff = erweitere(bits.hole(t), t);
    *pred = pred.wrapping_add(diff);
    block[0] = *pred as i16;
    let mut k = 1usize;
    while k < 64 {
        let rs = bits.dekodiere(ac);
        let (r, s) = ((rs >> 4) as usize, rs & 15);
        if s != 0 {
            k += r;
            let v = erweitere(bits.hole(s), s);
            block[NATUERLICH[k]] = v as i16;
        } else if r == 15 {
            k += 15;
        } else {
            break;
        }
        k += 1;
    }
}

fn ac_erst(bits: &mut Bits, ac: &Huff, ss: usize, se: usize, al: u32, eobrun: &mut u32, block: &mut [i16]) {
    if *eobrun > 0 {
        *eobrun -= 1;
        return;
    }
    let mut k = ss;
    while k <= se {
        let rs = bits.dekodiere(ac);
        let (r, s) = ((rs >> 4) as usize, rs & 15);
        if s != 0 {
            k += r;
            let v = erweitere(bits.hole(s), s);
            block[NATUERLICH[k]] = v.wrapping_shl(al) as i16;
        } else if r == 15 {
            k += 15;
        } else {
            *eobrun = 1 << r;
            if r > 0 {
                *eobrun += bits.hole(r as u32);
            }
            *eobrun -= 1;
            break;
        }
        k += 1;
    }
}

#[inline]
fn verfeinere(bits: &mut Bits, c: &mut i16, p1: i16, m1: i16) {
    if bits.bit() != 0 && (*c & p1) == 0 {
        *c = if *c >= 0 { c.wrapping_add(p1) } else { c.wrapping_add(m1) };
    }
}

fn ac_verfeinere(bits: &mut Bits, ac: &Huff, ss: usize, se: usize, al: u32, eobrun: &mut u32, block: &mut [i16]) {
    let p1 = (1i32 << al) as i16;
    let m1 = ((-1i32) << al) as i16;
    let mut k = ss;
    if *eobrun == 0 {
        while k <= se {
            let rs = bits.dekodiere(ac);
            let (mut r, s) = ((rs >> 4) as i32, rs & 15);
            let mut neu: i16 = 0;
            if s != 0 {
                // s ≠ 1 ist beschädigt: libjpeg warnt und macht weiter wie bei 1
                neu = if bits.bit() != 0 { p1 } else { m1 };
            } else if r != 15 {
                *eobrun = 1 << r;
                if r > 0 {
                    *eobrun += bits.hole(r as u32);
                }
                break;
            }
            loop {
                let c = &mut block[NATUERLICH[k]];
                if *c != 0 {
                    verfeinere(bits, c, p1, m1);
                } else {
                    r -= 1;
                    if r < 0 {
                        break;
                    }
                }
                k += 1;
                if k > se {
                    break;
                }
            }
            if s != 0 {
                block[NATUERLICH[k]] = neu;
            }
            k += 1;
        }
    }
    if *eobrun > 0 {
        while k <= se {
            let c = &mut block[NATUERLICH[k]];
            if *c != 0 {
                verfeinere(bits, c, p1, m1);
            }
            k += 1;
        }
        *eobrun -= 1;
    }
}

// ------------------------------------------------------------------ IDCT (jidctint.c, jpeg_idct_islow)

const CONST_BITS: i32 = 13;
const PASS1_BITS: i32 = 2;
const FIX_0_298631336: i32 = 2446;
const FIX_0_390180644: i32 = 3196;
const FIX_0_541196100: i32 = 4433;
const FIX_0_765366865: i32 = 6270;
const FIX_0_899976223: i32 = 7373;
const FIX_1_175875602: i32 = 9633;
const FIX_1_501321110: i32 = 12299;
const FIX_1_847759065: i32 = 15137;
const FIX_1_961570560: i32 = 16069;
const FIX_2_053119869: i32 = 16819;
const FIX_2_562915447: i32 = 20995;
const FIX_3_072711026: i32 = 25172;

/// Bereichstabelle nach der IDCT (`prepare_range_limit_table`, ab `CENTERJSAMPLE`), Index `x & 1023`.
const fn bereich_tabelle() -> [u8; 1024] {
    let mut t = [0u8; 1024];
    let mut i = 0;
    while i < 1024 {
        t[i] = if i < 128 {
            (i + 128) as u8
        } else if i < 512 {
            255
        } else if i < 896 {
            0
        } else {
            (i - 896) as u8
        };
        i += 1;
    }
    t
}
static BEREICH: [u8; 1024] = bereich_tabelle();

#[inline]
fn descale(x: i32, n: i32) -> i32 {
    x.wrapping_add(1 << (n - 1)) >> n
}
#[inline]
fn mul(a: i32, b: i32) -> i32 {
    a.wrapping_mul(b)
}

/// Gerade/ungerade Teile einer 1-D-IDCT (gemeinsam für beide Durchgänge).
#[inline]
#[allow(clippy::too_many_arguments)]
fn idct_1d(i0: i32, i1: i32, i2: i32, i3: i32, i4: i32, i5: i32, i6: i32, i7: i32) -> [i32; 8] {
    let z2 = i2;
    let z3 = i6;
    let z1 = mul(z2.wrapping_add(z3), FIX_0_541196100);
    let tmp2 = z1.wrapping_add(mul(z3, -FIX_1_847759065));
    let tmp3 = z1.wrapping_add(mul(z2, FIX_0_765366865));
    let tmp0 = i0.wrapping_add(i4).wrapping_shl(CONST_BITS as u32);
    let tmp1 = i0.wrapping_sub(i4).wrapping_shl(CONST_BITS as u32);
    let tmp10 = tmp0.wrapping_add(tmp3);
    let tmp13 = tmp0.wrapping_sub(tmp3);
    let tmp11 = tmp1.wrapping_add(tmp2);
    let tmp12 = tmp1.wrapping_sub(tmp2);

    let (mut t0, mut t1, mut t2, mut t3) = (i7, i5, i3, i1);
    let z1 = t0.wrapping_add(t3);
    let z2 = t1.wrapping_add(t2);
    let z3 = t0.wrapping_add(t2);
    let z4 = t1.wrapping_add(t3);
    let z5 = mul(z3.wrapping_add(z4), FIX_1_175875602);
    t0 = mul(t0, FIX_0_298631336);
    t1 = mul(t1, FIX_2_053119869);
    t2 = mul(t2, FIX_3_072711026);
    t3 = mul(t3, FIX_1_501321110);
    let z1 = mul(z1, -FIX_0_899976223);
    let z2 = mul(z2, -FIX_2_562915447);
    let z3 = mul(z3, -FIX_1_961570560).wrapping_add(z5);
    let z4 = mul(z4, -FIX_0_390180644).wrapping_add(z5);
    t0 = t0.wrapping_add(z1).wrapping_add(z3);
    t1 = t1.wrapping_add(z2).wrapping_add(z4);
    t2 = t2.wrapping_add(z2).wrapping_add(z3);
    t3 = t3.wrapping_add(z1).wrapping_add(z4);
    [
        tmp10.wrapping_add(t3),
        tmp11.wrapping_add(t2),
        tmp12.wrapping_add(t1),
        tmp13.wrapping_add(t0),
        tmp13.wrapping_sub(t0),
        tmp12.wrapping_sub(t1),
        tmp11.wrapping_sub(t2),
        tmp10.wrapping_sub(t3),
    ]
}

/// `jpeg_idct_islow`: 64 Koeffizienten (natürliche Reihenfolge) × Quantisierung → 8 × 8 Proben nach `aus` (Zeilenabstand `abstand`).
fn idct_islow(koef: &[i16], q: &[u16; 64], aus: &mut [u8], abstand: usize) {
    let mut ws = [0i32; 64];
    for s in 0..8 {
        let c = |r: usize| mul(koef[r * 8 + s] as i32, q[r * 8 + s] as i32);
        if (1..8).all(|r| koef[r * 8 + s] == 0) {
            let dc = c(0).wrapping_shl(PASS1_BITS as u32);
            for r in 0..8 {
                ws[r * 8 + s] = dc;
            }
            continue;
        }
        let o = idct_1d(c(0), c(1), c(2), c(3), c(4), c(5), c(6), c(7));
        for r in 0..8 {
            ws[r * 8 + s] = descale(o[r], CONST_BITS - PASS1_BITS);
        }
    }
    for z in 0..8 {
        let w = &ws[z * 8..z * 8 + 8];
        let zeile = &mut aus[z * abstand..z * abstand + 8];
        if w[1..].iter().all(|&x| x == 0) {
            let v = BEREICH[(descale(w[0], PASS1_BITS + 3) & 1023) as usize];
            zeile.fill(v);
            continue;
        }
        let o = idct_1d(w[0], w[1], w[2], w[3], w[4], w[5], w[6], w[7]);
        for s in 0..8 {
            zeile[s] = BEREICH[(descale(o[s], CONST_BITS + PASS1_BITS + 3) & 1023) as usize];
        }
    }
}

// ------------------------------------------------------------------ Farbe (jdcolor.c)

const SCALEBITS: i32 = 16;
const ONE_HALF: i32 = 1 << (SCALEBITS - 1);
const FIX_1_40200: i32 = 91881;
const FIX_1_77200: i32 = 116130;
const FIX_0_71414: i32 = 46802;
const FIX_0_34414: i32 = 22554;

#[inline]
fn klemme(x: i32) -> u8 {
    if x < 0 {
        0
    } else if x > 255 {
        255
    } else {
        x as u8
    }
}

fn ausgabe(r: &Rahmen) -> Bild {
    // Proben-Ebenen je Komponente (IDCT aller Blöcke)
    let ebenen: Vec<(Vec<u8>, usize)> = r
        .komp
        .iter()
        .map(|k| {
            let breite = k.bx * 8;
            let mut e = vec![0u8; breite * k.by * 8];
            let q = k.quant.unwrap_or([0; 64]);
            for by in 0..k.by {
                for bx in 0..k.bx {
                    let o = (by * k.bx + bx) * 64;
                    let start = by * 8 * breite + bx * 8;
                    idct_islow(&k.koef[o..o + 64], &q, &mut e[start..], breite);
                }
            }
            (e, breite)
        })
        .collect();
    let (b, h) = (r.breite, r.hoehe);
    let mut rgba = vec![0u8; b * h * 4];
    if r.komp.len() == 1 {
        let (e, eb) = &ebenen[0];
        for y in 0..h {
            for x in 0..b {
                let g = e[y * eb + x];
                rgba[(y * b + x) * 4..(y * b + x) * 4 + 4].copy_from_slice(&[g, g, g, 255]);
            }
        }
    } else {
        let mut cr_r = [0i32; 256];
        let mut cb_b = [0i32; 256];
        let mut cr_g = [0i32; 256];
        let mut cb_g = [0i32; 256];
        for i in 0..256 {
            let x = i as i32 - 128;
            cr_r[i] = (FIX_1_40200 * x + ONE_HALF) >> SCALEBITS;
            cb_b[i] = (FIX_1_77200 * x + ONE_HALF) >> SCALEBITS;
            cr_g[i] = -FIX_0_71414 * x;
            cb_g[i] = -FIX_0_34414 * x + ONE_HALF;
        }
        let f: Vec<(usize, usize)> = r.komp.iter().map(|k| (r.hmax / k.h, r.vmax / k.v)).collect();
        for y in 0..h {
            for x in 0..b {
                let probe = |c: usize| {
                    let (e, eb) = &ebenen[c];
                    e[(y / f[c].1) * eb + x / f[c].0] as usize
                };
                let (yy, cb, cr) = (probe(0) as i32, probe(1), probe(2));
                let o = (y * b + x) * 4;
                rgba[o] = klemme(yy + cr_r[cr]);
                rgba[o + 1] = klemme(yy + ((cb_g[cb] + cr_g[cr]) >> SCALEBITS));
                rgba[o + 2] = klemme(yy + cb_b[cb]);
                rgba[o + 3] = 255;
            }
        }
    }
    Bild { breite: b as u32, hoehe: h as u32, rgba }
}
