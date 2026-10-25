//! FLAC-Leser (H-K19a, RFC 9639): `fLaC`, STREAMINFO als erster Metadatenblock (alle anderen werden übersprungen), dann
//! Rahmen bis STREAMINFO-`total_samples` erreicht ist bzw. (bei 0 = unbekannt) bis keine Synchronmarke mehr folgt. Alle
//! Teilrahmenarten (CONSTANT, VERBATIM, FIXED 0 … 4, LPC 1 … 32), RICE/RICE2 mit Escape-Partitionen, verschwendete Bits,
//! alle Kanalzuordnungen; CRC-8 des Rahmenkopfs und CRC-16 des Rahmens werden geprüft. Rate, Kanäle und Bits jedes
//! Rahmens müssen zu STREAMINFO passen. Gerechnet wird in i32/i64; jeder vorhergesagte Wert muss in die Bittiefe seines
//! Teilrahmens passen (sonst Code 1), so läuft nichts über.

use alloc::vec::Vec;

use crate::klang::{Info, KFehler, Senke, MAX_BLOCK, MAX_SEKUNDEN};

const K: KFehler = KFehler::KeinKlang;

pub fn ist_flac(q: &[u8]) -> bool {
    q.len() >= 4 && &q[0..4] == b"fLaC"
}

const fn crc8_tafel() -> [u8; 256] {
    let mut t = [0u8; 256];
    let mut i = 0;
    while i < 256 {
        let mut c = i as u8;
        let mut k = 0;
        while k < 8 {
            c = if c & 0x80 != 0 { (c << 1) ^ 0x07 } else { c << 1 };
            k += 1;
        }
        t[i] = c;
        i += 1;
    }
    t
}
const fn crc16_tafel() -> [u16; 256] {
    let mut t = [0u16; 256];
    let mut i = 0;
    while i < 256 {
        let mut c = (i as u16) << 8;
        let mut k = 0;
        while k < 8 {
            c = if c & 0x8000 != 0 { (c << 1) ^ 0x8005 } else { c << 1 };
            k += 1;
        }
        t[i] = c;
        i += 1;
    }
    t
}
static CRC8: [u8; 256] = crc8_tafel();
static CRC16: [u16; 256] = crc16_tafel();

fn crc8(d: &[u8]) -> u8 {
    d.iter().fold(0u8, |c, &b| CRC8[(c ^ b) as usize])
}
fn crc16(d: &[u8]) -> u16 {
    d.iter().fold(0u16, |c, &b| (c << 8) ^ CRC16[((c >> 8) as u8 ^ b) as usize])
}

/// Bitleser (MSB zuerst) mit 64-Bit-Vorrat; die unteren `64 − n` Bits des Vorrats sind immer 0.
struct Bits<'a> {
    d: &'a [u8],
    pos: usize,
    vorrat: u64,
    n: u32,
}

impl<'a> Bits<'a> {
    fn neu(d: &'a [u8], pos: usize) -> Self {
        Bits { d, pos, vorrat: 0, n: 0 }
    }
    #[inline]
    fn fuelle(&mut self) {
        while self.n <= 56 {
            match self.d.get(self.pos) {
                Some(&b) => {
                    self.vorrat |= (b as u64) << (56 - self.n);
                    self.n += 8;
                    self.pos += 1;
                }
                None => break,
            }
        }
    }
    /// `k` ≤ 32 Bits ohne Vorzeichen.
    #[inline]
    fn lies(&mut self, k: u32) -> Result<u32, KFehler> {
        if k == 0 {
            return Ok(0);
        }
        if self.n < k {
            self.fuelle();
            if self.n < k {
                return Err(K);
            }
        }
        let v = (self.vorrat >> (64 - k)) as u32;
        self.vorrat <<= k;
        self.n -= k;
        Ok(v)
    }
    /// `k` ≤ 32 Bits mit Vorzeichen (Zweierkomplement).
    #[inline]
    fn lies_s(&mut self, k: u32) -> Result<i32, KFehler> {
        if k == 0 {
            return Ok(0);
        }
        let v = self.lies(k)?;
        Ok(((v << (32 - k)) as i32) >> (32 - k))
    }
    /// Nullen bis zur nächsten 1 zählen (die 1 wird verbraucht).
    #[inline]
    fn unaer(&mut self) -> Result<u32, KFehler> {
        let mut z = 0u32;
        loop {
            if self.n == 0 {
                self.fuelle();
                if self.n == 0 {
                    return Err(K);
                }
            }
            let lz = self.vorrat.leading_zeros();
            if lz < self.n {
                z = z.checked_add(lz).ok_or(K)?;
                let k = lz + 1;
                self.vorrat = if k >= 64 { 0 } else { self.vorrat << k };
                self.n -= k;
                return Ok(z);
            }
            z = z.checked_add(self.n).ok_or(K)?;
            self.vorrat = 0;
            self.n = 0;
        }
    }
    /// Auf die nächste Bytegrenze (Füllbits werden verworfen).
    fn ausrichten(&mut self) {
        let r = self.n % 8;
        if r > 0 {
            self.vorrat <<= r;
            self.n -= r;
        }
    }
    /// Byteposition (nur an Bytegrenzen sinnvoll).
    fn byte(&self) -> usize {
        self.pos - (self.n / 8) as usize
    }
}

/// STREAMINFO lesen, die übrigen Metadatenblöcke überspringen. Liefert Info und den Beginn des ersten Rahmens.
pub(crate) fn kopf(q: &[u8]) -> Result<(Info, usize), KFehler> {
    if !ist_flac(q) {
        return Err(K);
    }
    let mut p = 4usize;
    let mut info: Option<Info> = None;
    loop {
        let h = q.get(p..p + 4).ok_or(K)?;
        let letzter = h[0] & 0x80 != 0;
        let typ = h[0] & 0x7F;
        let laenge = ((h[1] as usize) << 16) | ((h[2] as usize) << 8) | h[3] as usize;
        let rumpf = q.get(p + 4..p + 4 + laenge).ok_or(K)?;
        if typ == 127 || (info.is_none() != (typ == 0)) {
            // erster Block muss STREAMINFO sein, nur einmal
            return Err(K);
        }
        if typ == 0 {
            if laenge != 34 {
                return Err(K);
            }
            let s = rumpf;
            let rate = ((s[10] as u32) << 12) | ((s[11] as u32) << 4) | ((s[12] as u32) >> 4);
            let kanaele = (((s[12] >> 1) & 7) + 1) as u32;
            let bits = ((((s[12] & 1) << 4) | (s[13] >> 4)) + 1) as u32;
            let gesamt = (((s[13] & 0x0F) as u64) << 32) | u32::from_be_bytes([s[14], s[15], s[16], s[17]]) as u64;
            if rate == 0 {
                return Err(K);
            }
            if !(4..=24).contains(&bits) {
                return Err(KFehler::FlacFormat);
            }
            let frames = if gesamt == 0 { None } else { Some(gesamt) };
            info = Some(Info { rate, kanaele, bits, flac: true, float: false, vorbis: false, frames, frames_laut_kopf: frames });
        }
        p += 4 + laenge;
        if letzter {
            break;
        }
    }
    Ok((info.ok_or(K)?, p))
}

/// Rahmen dekodieren und an die Senke geben. Liefert die Zahl der Frames.
pub(crate) fn dekodiere<S: Senke>(q: &[u8], info: &Info, start: usize, s: &mut S) -> Result<u64, KFehler> {
    let ch = info.kanaele as usize;
    let mut kan: [Vec<i32>; 2] = [Vec::new(), Vec::new()];
    let mut aus: Vec<i32> = Vec::new();
    let mut frames = 0u64;
    let mut p = start;
    loop {
        if let Some(g) = info.frames {
            if frames == g {
                break;
            }
        }
        let sync = q.len() >= p + 2 && q[p] == 0xFF && (q[p + 1] & 0xFE) == 0xF8;
        if !sync {
            if info.frames.is_some() {
                return Err(K); // Datei endet vor total_samples
            }
            break;
        }
        let mut b = Bits::neu(q, p);
        let n = rahmen(&mut b, info, &mut kan)?;
        if let Some(g) = info.frames {
            if frames + n as u64 > g {
                return Err(K);
            }
        }
        // verschachteln
        aus.clear();
        aus.reserve_exact(n * ch);
        if ch == 1 {
            aus.extend_from_slice(&kan[0][..n]);
        } else {
            for (&l, &r) in kan[0][..n].iter().zip(&kan[1][..n]) {
                aus.push(l);
                aus.push(r);
            }
        }
        s.werte(&aus);
        frames += n as u64;
        p = b.byte();
        // unbekannte Länge: über 10 Minuten wird nicht weiter dekodiert (Code 2 mit der bis hier gezählten Dauer) – so bleibt
        // die Arbeit auch bei winzigen konstanten Rahmen begrenzt
        if frames > MAX_SEKUNDEN * info.rate as u64 {
            break;
        }
    }
    Ok(frames)
}

fn utf8_zahl(b: &mut Bits) -> Result<u64, KFehler> {
    let x = b.lies(8)?;
    let (mut v, mehr) = match x {
        0x00..=0x7F => (x as u64, 0),
        0xC0..=0xDF => ((x & 0x1F) as u64, 1),
        0xE0..=0xEF => ((x & 0x0F) as u64, 2),
        0xF0..=0xF7 => ((x & 0x07) as u64, 3),
        0xF8..=0xFB => ((x & 0x03) as u64, 4),
        0xFC..=0xFD => ((x & 0x01) as u64, 5),
        0xFE => (0, 6),
        _ => return Err(K),
    };
    for _ in 0..mehr {
        let c = b.lies(8)?;
        if c & 0xC0 != 0x80 {
            return Err(K);
        }
        v = (v << 6) | (c & 0x3F) as u64;
    }
    Ok(v)
}

/// Ein Rahmen: Kopf (CRC-8), Teilrahmen, Dekorrelation, CRC-16. Liefert die Blockgröße.
fn rahmen(b: &mut Bits, info: &Info, kan: &mut [Vec<i32>; 2]) -> Result<usize, KFehler> {
    let start = b.byte();
    if b.lies(15)? != 0x7FFC {
        return Err(K);
    }
    let variabel = b.lies(1)?;
    let bs_code = b.lies(4)?;
    let rate_code = b.lies(4)?;
    let ch_code = b.lies(4)?;
    let bits_code = b.lies(3)?;
    if b.lies(1)? != 0 {
        return Err(K);
    }
    let nummer = utf8_zahl(b)?;
    if (variabel == 0 && nummer >= 1 << 31) || nummer >= 1 << 36 {
        return Err(K);
    }
    let bs: usize = match bs_code {
        0 => return Err(K),
        1 => 192,
        2..=5 => 576 << (bs_code - 2),
        6 => b.lies(8)? as usize + 1,
        7 => b.lies(16)? as usize + 1,
        _ => 256 << (bs_code - 8),
    };
    let rate = match rate_code {
        0 => info.rate,
        1 => 88_200,
        2 => 176_400,
        3 => 192_000,
        4 => 8_000,
        5 => 16_000,
        6 => 22_050,
        7 => 24_000,
        8 => 32_000,
        9 => 44_100,
        10 => 48_000,
        11 => 96_000,
        12 => b.lies(8)? * 1000,
        13 => b.lies(16)?,
        14 => b.lies(16)? * 10,
        _ => return Err(K),
    };
    let bits = match bits_code {
        0 => info.bits,
        1 => 8,
        2 => 12,
        4 => 16,
        5 => 20,
        6 => 24,
        7 => 32,
        _ => return Err(K),
    };
    let (kanaele, art) = match ch_code {
        0..=7 => (ch_code + 1, 0),
        8..=10 => (2, ch_code - 7), // 1 links/seite, 2 rechts/seite, 3 mitte/seite
        _ => return Err(K),
    };
    let ende_kopf = b.byte();
    let crc = b.lies(8)? as u8;
    if crc != crc8(&b.d[start..ende_kopf]) {
        return Err(K);
    }
    if bs > MAX_BLOCK || rate != info.rate || bits != info.bits || kanaele != info.kanaele {
        return Err(K);
    }
    for (c, kv) in kan.iter_mut().enumerate().take(kanaele as usize) {
        // Seitenkanal braucht ein Bit mehr
        let seite = matches!((art, c), (1, 1) | (2, 0) | (3, 1));
        kv.resize(bs, 0);
        teilrahmen(b, &mut kv[..bs], bits + seite as u32)?;
    }
    if art != 0 {
        let (a, z) = kan.split_at_mut(1);
        let (a, z) = (&mut a[0][..bs], &mut z[0][..bs]);
        for i in 0..bs {
            let (x, y) = (a[i], z[i]);
            let (l, r) = match art {
                1 => (x, x - y),
                2 => (x + y, y),
                _ => {
                    let m = (x << 1) | (y & 1);
                    ((m + y) >> 1, (m - y) >> 1)
                }
            };
            a[i] = l;
            z[i] = r;
        }
    }
    // jeder Ausgabewert muss in die Bittiefe passen
    let (min, max) = (-(1i32 << (bits - 1)), (1i32 << (bits - 1)) - 1);
    for kv in kan.iter().take(kanaele as usize) {
        if kv[..bs].iter().any(|&v| v < min || v > max) {
            return Err(K);
        }
    }
    b.ausrichten();
    let ende = b.byte();
    let crc = b.lies(16)? as u16;
    if crc != crc16(&b.d[start..ende]) {
        return Err(K);
    }
    Ok(bs)
}

/// Ein Teilrahmen mit `bits` Bits je Wert (inkl. Seitenkanal-Bit) nach `s`.
fn teilrahmen(b: &mut Bits, s: &mut [i32], bits: u32) -> Result<(), KFehler> {
    if b.lies(1)? != 0 {
        return Err(K);
    }
    let typ = b.lies(6)?;
    let verschwendet = if b.lies(1)? == 1 { b.unaer()? + 1 } else { 0 };
    if verschwendet >= bits {
        return Err(K);
    }
    let w = bits - verschwendet;
    match typ {
        0 => {
            let v = b.lies_s(w)?;
            s.fill(v);
        }
        1 => {
            for x in s.iter_mut() {
                *x = b.lies_s(w)?;
            }
        }
        8..=12 => {
            let ordnung = (typ - 8) as usize;
            if ordnung > s.len() {
                return Err(K);
            }
            for x in s[..ordnung].iter_mut() {
                *x = b.lies_s(w)?;
            }
            rest(b, s, ordnung)?;
            fest(s, ordnung, w)?;
        }
        32..=63 => {
            let ordnung = (typ - 31) as usize;
            if ordnung > s.len() {
                return Err(K);
            }
            for x in s[..ordnung].iter_mut() {
                *x = b.lies_s(w)?;
            }
            let genau = b.lies(4)?;
            if genau == 15 {
                return Err(K);
            }
            let schub = b.lies_s(5)?;
            if schub < 0 {
                return Err(K);
            }
            let mut koeff = [0i64; 32];
            for c in koeff[..ordnung].iter_mut() {
                *c = b.lies_s(genau + 1)? as i64;
            }
            rest(b, s, ordnung)?;
            lpc(s, &koeff[..ordnung], schub as u32, w)?;
        }
        _ => return Err(K),
    }
    if verschwendet > 0 {
        for x in s.iter_mut() {
            *x <<= verschwendet;
        }
    }
    Ok(())
}

/// Restwerte (RICE/RICE2, Partitionen, Escape) nach `s[ordnung..]`.
fn rest(b: &mut Bits, s: &mut [i32], ordnung: usize) -> Result<(), KFehler> {
    let (kbits, escape) = match b.lies(2)? {
        0 => (4, 15),
        1 => (5, 31),
        _ => return Err(K),
    };
    let po = b.lies(4)?;
    let n = s.len();
    let teile = 1usize << po;
    if !n.is_multiple_of(teile) {
        return Err(K);
    }
    let groesse = n >> po;
    if groesse < ordnung {
        return Err(K);
    }
    let mut i = ordnung;
    for t in 0..teile {
        let ende = (t + 1) * groesse;
        let k = b.lies(kbits)?;
        if k == escape {
            let rb = b.lies(5)?;
            while i < ende {
                s[i] = b.lies_s(rb)?;
                i += 1;
            }
        } else {
            while i < ende {
                let q = b.unaer()? as u64;
                let u = (q << k) | b.lies(k)? as u64;
                if u > u32::MAX as u64 {
                    return Err(K);
                }
                s[i] = ((u >> 1) as i64 ^ -((u & 1) as i64)) as i32;
                i += 1;
            }
        }
    }
    Ok(())
}

#[inline]
fn passt(v: i64, w: u32) -> Result<i32, KFehler> {
    let m = 1i64 << (w - 1);
    if v < -m || v >= m {
        return Err(K);
    }
    Ok(v as i32)
}

fn fest(s: &mut [i32], ordnung: usize, w: u32) -> Result<(), KFehler> {
    for i in ordnung..s.len() {
        let r = s[i] as i64;
        let v = match ordnung {
            0 => r,
            1 => r + s[i - 1] as i64,
            2 => r + 2 * s[i - 1] as i64 - s[i - 2] as i64,
            3 => r + 3 * s[i - 1] as i64 - 3 * s[i - 2] as i64 + s[i - 3] as i64,
            _ => r + 4 * s[i - 1] as i64 - 6 * s[i - 2] as i64 + 4 * s[i - 3] as i64 - s[i - 4] as i64,
        };
        s[i] = passt(v, w)?;
    }
    Ok(())
}

fn lpc(s: &mut [i32], koeff: &[i64], schub: u32, w: u32) -> Result<(), KFehler> {
    let o = koeff.len();
    for i in o..s.len() {
        let mut summe = 0i64;
        for (j, &c) in koeff.iter().enumerate() {
            summe += c * s[i - 1 - j] as i64;
        }
        s[i] = passt(s[i] as i64 + (summe >> schub), w)?;
    }
    Ok(())
}
