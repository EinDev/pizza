//! Vorbis-I-Dekoder (H-K19b, Xiph „Vorbis I specification“): Kennungs-, Kommentar- und Setup-Kopf, Codebücher (Huffman,
//! VQ-Lookup 1 und 2), Floor 1 (Floor 0 → Code 6, praktisch ungenutzt), Residue 0/1/2, Kanal-Kopplung, inverse MDCT
//! (`mdct.rs`), Fenster und Überlappung. Vorbild für Rechenreihenfolge und Grenzfälle ist libvorbis 1.3 (`_make_words`,
//! `_book_unquantize`, `floor1_inverse1/2`, `res*_inverse`, `vorbis_synthesis_blockin`), damit die Abweichung zu libvorbis
//! klein bleibt (Gegenprobe in `klang_tests.rs`, ≤ 1 LSB nach i16); **bitgleich** ist nur nativ = `teigling.wasm` verlangt.
//!
//! **Determinismus (HERD.md §13.1 Regel 5):** Ganzzahlen für Kopf, Huffman und Floor-Linien; f32 nur mit + − × in fester
//! Reihenfolge (keine FMA, keine Bibliotheksfunktion zur Laufzeit). Tabellen: Floor-1-dB-Tafel aus der Spezifikation (als
//! Bitmuster), Fenster und MDCT-Drehfaktoren einmal je Datei mit `libm` (f64 → f32).
//!
//! **Grenzen** (Datei von außen, unvertrauenswürdig – geprüft, bevor Speicher angelegt wird): Blockgrößen 64 … 8192,
//! höchstens 256 Codebücher mit zusammen ≤ [`MAX_EINTRAEGE`] Einträgen und ≤ [`MAX_VQ_WERTE`] VQ-Werten, Dimension
//! 1 … [`MAX_DIM`], Floor 1 ≤ 65 Stützstellen, Kopplung nur zwischen verschiedenen Kanälen. Jede Zahl aus der Datei wird
//! vor dem Indizieren geprüft; ein Paket, das zu früh endet, wird wie in der Spezifikation behandelt (Floor ungenutzt bzw.
//! Residue bis dahin).

use alloc::vec;
use alloc::vec::Vec;

use crate::klang::KFehler;
use crate::mdct::Imdct;

const K: KFehler = KFehler::KeinKlang;
const F: KFehler = KFehler::OggFormat;

/// Höchstens so viele Codebuch-Einträge zusammen (Huffman-Längen, Bäume).
pub const MAX_EINTRAEGE: u64 = 1 << 20;
/// Höchstens so viele VQ-Werte (f32) zusammen.
pub const MAX_VQ_WERTE: u64 = 1 << 22;
/// Größte Codebuch-Dimension.
pub const MAX_DIM: u32 = 64;

/// Floor-1-Tafel `floor1_inverse_dB_table` (Vorbis I, Abschnitt 10.1) als f32-Bitmuster.
static DB_TAFEL: [u32; 256] = [
    0x33e4b43e, 0x33f39109, 0x3401b28b, 0x340a203c, 0x34131a23, 0x341ca960, 0x3426d7a7, 0x3431af4b,
    0x343d3b50, 0x34498770, 0x3456a023, 0x346492b8, 0x34736d55, 0x34819f88, 0x348a0bfc, 0x34930493,
    0x349c9269, 0x34a6bf32, 0x34b1953f, 0x34bd1f93, 0x34c969e4, 0x34d680ad, 0x34e47136, 0x34f349a6,
    0x35018c88, 0x3509f7c0, 0x3512ef06, 0x351c7b76, 0x3526a6c0, 0x35317b37, 0x353d03da, 0x35494c5e,
    0x3556613b, 0x35644fb9, 0x357325fc, 0x3581798a, 0x3589e386, 0x3592d97c, 0x359c6485, 0x35a68e52,
    0x35b16133, 0x35bce825, 0x35c92edc, 0x35d641ce, 0x35e42e41, 0x35f30257, 0x3601668f, 0x3609cf4f,
    0x3612c3f5, 0x361c4d98, 0x362675e8, 0x36314732, 0x363ccc74, 0x3649115e, 0x36562265, 0x36640cce,
    0x3672deb8, 0x36815397, 0x3689bb1c, 0x3692ae72, 0x369c36af, 0x36a65d81, 0x36b12d35, 0x36bcb0c7,
    0x36c8f3e4, 0x36d60301, 0x36e3eb60, 0x36f2bb1e, 0x370140a2, 0x3709a6eb, 0x371298f1, 0x371c1fc9,
    0x3726451e, 0x3731133d, 0x373c951e, 0x3748d66f, 0x3755e3a2, 0x3763c9f7, 0x37729789, 0x37812daf,
    0x378992be, 0x37928374, 0x379c08e6, 0x37a62cbe, 0x37b0f947, 0x37bc7979, 0x37c8b8fe, 0x37d5c447,
    0x37e3a892, 0x37f273f8, 0x38011ac0, 0x38097e93, 0x38126df9, 0x381bf206, 0x38261462, 0x3830df56,
    0x383c5dd8, 0x38489b92, 0x3855a4f2, 0x38638733, 0x3872506e, 0x388107d3, 0x38896a6b, 0x38925882,
    0x389bdb2a, 0x38a5fc09, 0x38b0c568, 0x38bc423b, 0x38c87e29, 0x38d585a0, 0x38e365d9, 0x38f22ce8,
    0x3900f4e9, 0x39095646, 0x3912430e, 0x391bc451, 0x3925e3b5, 0x3930ab7f, 0x393c26a2, 0x394860c5,
    0x39556653, 0x39634483, 0x39720968, 0x3980e201, 0x39894224, 0x39922d9d, 0x399bad7b, 0x39a5cb63,
    0x39b09199, 0x39bc0b0d, 0x39c84366, 0x39d5470b, 0x39e32332, 0x39f1e5ed, 0x3a00cf1d, 0x3a092e05,
    0x3a121830, 0x3a1b96a9, 0x3a25b315, 0x3a3077b7, 0x3a3bef7c, 0x3a48260a, 0x3a5527c7, 0x3a6301e6,
    0x3a71c278, 0x3a80bc3b, 0x3a8919e9, 0x3a9202c6, 0x3a9b7fdb, 0x3aa59acb, 0x3ab05dd8, 0x3abbd3ef,
    0x3ac808b3, 0x3ad50888, 0x3ae2e09f, 0x3af19f07, 0x3b00a95c, 0x3b0905d0, 0x3b11ed5e, 0x3b1b690f,
    0x3b258284, 0x3b3043fd, 0x3b3bb867, 0x3b47eb61, 0x3b54e94d, 0x3b62bf5d, 0x3b717b9c, 0x3b80967f,
    0x3b88f1ba, 0x3b91d7f9, 0x3b9b5247, 0x3ba56a41, 0x3bb02a27, 0x3bbb9ce2, 0x3bc7ce12, 0x3bd4ca17,
    0x3be29e20, 0x3bf15835, 0x3c0083a6, 0x3c08dda7, 0x3c11c298, 0x3c1b3b82, 0x3c255201, 0x3c301054,
    0x3c3b8161, 0x3c47b0c8, 0x3c54aae5, 0x3c627ce8, 0x3c7134d4, 0x3c8070cf, 0x3c88c996, 0x3c91ad3a,
    0x3c9b24c0, 0x3ca539c5, 0x3caff685, 0x3cbb65e5, 0x3cc79382, 0x3cd48bb9, 0x3ce25bb4, 0x3cf11179,
    0x3d005dfb, 0x3d08b589, 0x3d1197df, 0x3d1b0e02, 0x3d25218d, 0x3d2fdcb9, 0x3d3b4a6d, 0x3d477640,
    0x3d546c91, 0x3d623a85, 0x3d70ee22, 0x3d804b2a, 0x3d88a17f, 0x3d918288, 0x3d9af748, 0x3da50958,
    0x3dafc2f2, 0x3dbb2ef8, 0x3dc75903, 0x3dd44d6d, 0x3de2195c, 0x3df0cad1, 0x3e00385b, 0x3e088d77,
    0x3e116d33, 0x3e1ae090, 0x3e24f127, 0x3e2fa92e, 0x3e3b1387, 0x3e473bca, 0x3e542e4d, 0x3e61f837,
    0x3e70a784, 0x3e80258f, 0x3e887973, 0x3e9157e2, 0x3e9ac9dc, 0x3ea4d8f9, 0x3eaf8f6d, 0x3ebaf81b,
    0x3ec71e95, 0x3ed40f33, 0x3ee1d717, 0x3ef0843d, 0x3f0012c6, 0x3f086572, 0x3f114293, 0x3f1ab32b,
    0x3f24c0ce, 0x3f2f75b1, 0x3f3adcb2, 0x3f470165, 0x3f53f01d, 0x3f61b5fb, 0x3f7060fb, 0x3f800000,
];

#[inline]
fn db(i: i32) -> f32 {
    f32::from_bits(DB_TAFEL[i as usize])
}

/// Anzahl Bits von `x` (ilog der Spezifikation: 0 → 0, 1 → 1, 7 → 3).
fn ilog(x: u32) -> u32 {
    32 - x.leading_zeros()
}

// ---------------------------------------------------------------- Bitleser (LSB zuerst)

pub(crate) struct Bits<'a> {
    d: &'a [u8],
    i: usize,
    v: u64,
    n: u32,
}

impl<'a> Bits<'a> {
    pub(crate) fn neu(d: &'a [u8]) -> Bits<'a> {
        Bits { d, i: 0, v: 0, n: 0 }
    }
    #[inline]
    fn fuelle(&mut self, k: u32) {
        while self.n < k && self.i < self.d.len() {
            self.v |= (self.d[self.i] as u64) << self.n;
            self.i += 1;
            self.n += 8;
        }
    }
    /// `k` ≤ 32 Bits; `None` = Paketende (danach liefert jeder weitere Lesezugriff `None`).
    #[inline]
    pub(crate) fn lies(&mut self, k: u32) -> Option<u32> {
        if k == 0 {
            return Some(0);
        }
        self.fuelle(k);
        if self.n < k {
            self.n = 0;
            self.v = 0;
            self.i = self.d.len();
            return None;
        }
        let r = (self.v & ((1u64 << k) - 1)) as u32;
        self.v >>= k;
        self.n -= k;
        Some(r)
    }
    /// Die nächsten `k` Bits ansehen (fehlende = 0) und wie viele davon wirklich da sind.
    #[inline]
    fn guck(&mut self, k: u32) -> (u32, u32) {
        self.fuelle(k);
        ((self.v & ((1u64 << k) - 1)) as u32, self.n.min(k))
    }
    /// Paketende erzwingen (jeder weitere Lesezugriff liefert `None`).
    fn leer(&mut self) {
        self.n = 0;
        self.v = 0;
        self.i = self.d.len();
    }
    #[inline]
    fn weg(&mut self, k: u32) {
        self.v >>= k;
        self.n -= k;
    }
}

fn r(b: &mut Bits, k: u32) -> Result<u32, KFehler> {
    b.lies(k).ok_or(K)
}

// ---------------------------------------------------------------- Codebücher

const BLATT: u32 = 0x8000_0000;
/// Schnelltafel: 0 = ungültig, `BLATT | Knoten` = weiter im Baum, sonst `(Länge << 24) | Eintrag`.
const SCHNELL_MAX: u32 = 10;

struct Buch {
    dim: usize,
    eintraege: u32,
    benutzt: u32,
    /// Knoten [0, 1]: 0 = leer, `BLATT | e` = Eintrag e, sonst Index des Kindknotens
    baum: Vec<[u32; 2]>,
    sbits: u32,
    schnell: Vec<u32>,
    /// VQ-Vektoren (Einträge × Dimension), leer ohne Lookup
    werte: Vec<f32>,
}

/// `float32_unpack` wie libvorbis (Exponent auf ±63 begrenzt, damit exakt in f32).
fn float32(x: u32) -> f32 {
    let mant = (x & 0x1f_ffff) as f32;
    let e = (((x & 0x7fe0_0000) >> 21) as i32 - 788).clamp(-63, 63);
    let v = mant * f32::from_bits(((e + 127) as u32) << 23);
    if x & 0x8000_0000 != 0 {
        -v
    } else {
        v
    }
}

/// Größtes r mit r^dim ≤ eintraege.
fn lookup1_werte(eintraege: u32, dim: u32) -> u32 {
    let passt = |r: u64| -> bool {
        let mut p: u64 = 1;
        for _ in 0..dim {
            p = match p.checked_mul(r) {
                Some(x) if x <= eintraege as u64 => x,
                _ => return false,
            };
        }
        true
    };
    let (mut lo, mut hi) = (0u64, eintraege as u64);
    while lo < hi {
        let m = (lo + hi + 1) / 2;
        if passt(m) {
            lo = m;
        } else {
            hi = m - 1;
        }
    }
    lo as u32
}

impl Buch {
    fn lesen(b: &mut Bits, budget: &mut (u64, u64)) -> Result<Buch, KFehler> {
        if r(b, 24)? != 0x564342 {
            return Err(K);
        }
        let dim = r(b, 16)?;
        let eintraege = r(b, 24)?;
        if dim == 0 || eintraege == 0 {
            return Err(K);
        }
        if dim > MAX_DIM {
            return Err(F);
        }
        budget.0 += eintraege as u64;
        if budget.0 > MAX_EINTRAEGE {
            return Err(F);
        }
        let n = eintraege as usize;
        let mut laengen = vec![0u8; n];
        if r(b, 1)? == 0 {
            let duenn = r(b, 1)? == 1;
            for l in laengen.iter_mut() {
                if !duenn || r(b, 1)? == 1 {
                    *l = r(b, 5)? as u8 + 1;
                }
            }
        } else {
            let mut laenge = r(b, 5)? + 1;
            let mut e = 0usize;
            while e < n {
                let zahl = r(b, ilog((n - e) as u32))? as usize;
                if laenge > 32 || zahl > n - e {
                    return Err(K);
                }
                for l in &mut laengen[e..e + zahl] {
                    *l = laenge as u8;
                }
                e += zahl;
                laenge += 1;
            }
        }
        let lookup = r(b, 4)?;
        let werte = match lookup {
            0 => Vec::new(),
            1 | 2 => {
                let min = float32(r(b, 32)?);
                let delta = float32(r(b, 32)?);
                let wbits = r(b, 4)? + 1;
                let folge = r(b, 1)? == 1;
                let anzahl = if lookup == 1 { lookup1_werte(eintraege, dim) as u64 } else { eintraege as u64 * dim as u64 };
                budget.1 += eintraege as u64 * dim as u64 + anzahl;
                if budget.1 > MAX_VQ_WERTE {
                    return Err(F);
                }
                if anzahl == 0 {
                    return Err(K);
                }
                let mut mult = Vec::with_capacity(anzahl as usize);
                for _ in 0..anzahl {
                    mult.push(r(b, wbits)? as f32);
                }
                let d = dim as usize;
                let mut w = Vec::with_capacity(n * d);
                for e in 0..n {
                    let mut letzt = 0.0f32;
                    let mut teiler = 1u64;
                    for i in 0..d {
                        let off = if lookup == 1 { ((e as u64 / teiler) % anzahl) as usize } else { e * d + i };
                        let v = mult[off] * delta + min + letzt;
                        if folge {
                            letzt = v;
                        }
                        w.push(v);
                        if lookup == 1 {
                            teiler *= anzahl;
                        }
                    }
                }
                w
            }
            _ => return Err(K),
        };
        let mut buch = Buch { dim: dim as usize, eintraege, benutzt: 0, baum: vec![[0, 0]], sbits: 0, schnell: Vec::new(), werte };
        buch.baue(&laengen)?;
        Ok(buch)
    }

    /// Codewörter wie libvorbis `_make_words` (der Reihe nach, kürzestes freies Wort), dann Baum und Schnelltafel.
    fn baue(&mut self, laengen: &[u8]) -> Result<(), KFehler> {
        let benutzt = laengen.iter().filter(|&&l| l > 0).count();
        self.benutzt = benutzt as u32;
        if benutzt == 0 {
            return Ok(());
        }
        if benutzt == 1 {
            // libvorbis: ein einziges Wort kostet genau ein Bit, beide Werte treffen es
            let e = laengen.iter().position(|&l| l > 0).unwrap() as u32;
            self.baum[0] = [BLATT | e, BLATT | e];
            self.sbits = 1;
            self.schnell = vec![(1 << 24) | e, (1 << 24) | e];
            return Ok(());
        }
        let mut marke = [0u32; 33];
        let mut maxlen = 0;
        for (i, &l) in laengen.iter().enumerate() {
            if l == 0 {
                continue;
            }
            let len = l as usize;
            maxlen = maxlen.max(len);
            let mut wort = marke[len];
            if len < 32 && (wort >> len) != 0 {
                return Err(K);
            }
            self.einfuegen(wort, len as u32, i as u32)?;
            let mut j = len;
            while j > 0 {
                if marke[j] & 1 != 0 {
                    if j == 1 {
                        marke[1] = marke[1].wrapping_add(1);
                    } else {
                        marke[j] = marke[j - 1] << 1;
                    }
                    break;
                }
                marke[j] = marke[j].wrapping_add(1);
                j -= 1;
            }
            for j in len + 1..33 {
                if (marke[j] >> 1) == wort {
                    wort = marke[j];
                    marke[j] = marke[j - 1] << 1;
                } else {
                    break;
                }
            }
        }
        for (i, &m) in marke.iter().enumerate().skip(1) {
            if m & (u32::MAX >> (32 - i)) != 0 {
                return Err(K);
            }
        }
        // Schnelltafel über die ersten sbits Bits (in Lesereihenfolge)
        self.sbits = (maxlen as u32).min(SCHNELL_MAX);
        let s = self.sbits;
        self.schnell = (0..1u32 << s)
            .map(|p| {
                let mut k = 0u32;
                for t in 0..s {
                    let c = self.baum[k as usize][((p >> t) & 1) as usize];
                    if c == 0 {
                        return 0;
                    }
                    if c & BLATT != 0 {
                        return ((t + 1) << 24) | (c & !BLATT);
                    }
                    k = c;
                }
                BLATT | k
            })
            .collect();
        Ok(())
    }

    fn einfuegen(&mut self, wort: u32, len: u32, e: u32) -> Result<(), KFehler> {
        let mut k = 0usize;
        for t in (1..len).rev() {
            let bit = ((wort >> t) & 1) as usize;
            let c = self.baum[k][bit];
            if c == 0 {
                self.baum.push([0, 0]);
                let neu = (self.baum.len() - 1) as u32;
                self.baum[k][bit] = neu;
                k = neu as usize;
            } else if c & BLATT != 0 {
                return Err(K);
            } else {
                k = c as usize;
            }
        }
        let bit = (wort & 1) as usize;
        if self.baum[k][bit] != 0 {
            return Err(K);
        }
        self.baum[k][bit] = BLATT | e;
        Ok(())
    }

    /// Nächster Eintrag; `None` = Paketende oder ungültiges Wort.
    #[inline]
    fn eintrag(&self, b: &mut Bits) -> Option<u32> {
        if self.benutzt == 0 {
            return None;
        }
        let (v, da) = b.guck(self.sbits);
        let s = self.schnell[v as usize];
        if s == 0 {
            if da < self.sbits {
                b.leer();
            }
            return None;
        }
        if s & BLATT == 0 {
            let l = s >> 24;
            if l > da {
                b.leer();
                return None;
            }
            b.weg(l);
            return Some(s & 0xff_ffff);
        }
        if da < self.sbits {
            b.leer();
            return None;
        }
        b.weg(self.sbits);
        let mut k = (s & !BLATT) as usize;
        loop {
            let c = self.baum[k][b.lies(1)? as usize];
            if c == 0 {
                return None;
            }
            if c & BLATT != 0 {
                return Some(c & !BLATT);
            }
            k = c as usize;
        }
    }

    #[inline]
    fn vektor(&self, e: u32) -> &[f32] {
        let i = e as usize * self.dim;
        &self.werte[i..i + self.dim]
    }
}

// ---------------------------------------------------------------- Floor 1

struct Floor1 {
    teile: Vec<u8>,
    klasse_dim: Vec<u8>,
    klasse_sub: Vec<u8>,
    klasse_haupt: Vec<u8>,
    /// Unterbücher je Klasse (−1 = keins)
    klasse_buecher: Vec<[i16; 8]>,
    mult: i32,
    x: Vec<i32>,
    /// Stützstellen nach x sortiert
    sortiert: Vec<usize>,
    nachbar: Vec<(usize, usize)>,
    quant: i32,
}

impl Floor1 {
    fn lesen(b: &mut Bits, buecher: usize) -> Result<Floor1, KFehler> {
        let n = r(b, 5)? as usize;
        let mut teile = Vec::with_capacity(n);
        let mut maxk = -1i32;
        for _ in 0..n {
            let k = r(b, 4)?;
            maxk = maxk.max(k as i32);
            teile.push(k as u8);
        }
        let nk = (maxk + 1) as usize;
        let (mut kd, mut ks, mut kh, mut kb) = (vec![0u8; nk], vec![0u8; nk], vec![0u8; nk], vec![[-1i16; 8]; nk]);
        for c in 0..nk {
            kd[c] = r(b, 3)? as u8 + 1;
            ks[c] = r(b, 2)? as u8;
            if ks[c] > 0 {
                let h = r(b, 8)?;
                if h as usize >= buecher {
                    return Err(K);
                }
                kh[c] = h as u8;
            }
            for j in 0..(1usize << ks[c]) {
                let s = r(b, 8)? as i32 - 1;
                if s >= buecher as i32 {
                    return Err(K);
                }
                kb[c][j] = s as i16;
            }
        }
        let mult = r(b, 2)? as i32 + 1;
        let rbits = r(b, 4)?;
        let mut x = vec![0i32, 1 << rbits];
        for &t in &teile {
            for _ in 0..kd[t as usize] {
                if x.len() >= 65 {
                    return Err(K);
                }
                x.push(r(b, rbits)? as i32);
            }
        }
        let mut sortiert: Vec<usize> = (0..x.len()).collect();
        sortiert.sort_by_key(|&i| x[i]);
        if sortiert.windows(2).any(|w| x[w[0]] == x[w[1]]) {
            return Err(K);
        }
        let mut nachbar = vec![(0, 0); x.len()];
        for i in 2..x.len() {
            let (mut lo, mut hi) = (0usize, 1usize);
            for j in 0..i {
                if x[j] < x[i] && x[j] > x[lo] {
                    lo = j;
                }
                if x[j] > x[i] && x[j] < x[hi] {
                    hi = j;
                }
            }
            nachbar[i] = (lo, hi);
        }
        let quant = [256, 128, 86, 64][(mult - 1) as usize];
        Ok(Floor1 { teile, klasse_dim: kd, klasse_sub: ks, klasse_haupt: kh, klasse_buecher: kb, mult, x, sortiert, nachbar, quant })
    }

    /// Stützwerte lesen (libvorbis `floor1_inverse1`); `false` = Kanal ungenutzt (auch bei Paketende).
    fn lies(&self, b: &mut Bits, buecher: &[Buch], fit: &mut Vec<i32>) -> bool {
        fit.clear();
        if b.lies(1) != Some(1) {
            return false;
        }
        let yb = ilog((self.quant - 1) as u32);
        let (Some(y0), Some(y1)) = (b.lies(yb), b.lies(yb)) else { return false };
        fit.push(y0 as i32);
        fit.push(y1 as i32);
        for &t in &self.teile {
            let c = t as usize;
            let cbits = self.klasse_sub[c] as u32;
            let csub = (1u32 << cbits) - 1;
            let mut cval = 0u32;
            if cbits > 0 {
                match buecher[self.klasse_haupt[c] as usize].eintrag(b) {
                    Some(v) => cval = v,
                    None => return false,
                }
            }
            for _ in 0..self.klasse_dim[c] {
                let buch = self.klasse_buecher[c][(cval & csub) as usize];
                cval >>= cbits;
                if buch >= 0 {
                    match buecher[buch as usize].eintrag(b) {
                        Some(v) => fit.push(v as i32),
                        None => return false,
                    }
                } else {
                    fit.push(0);
                }
            }
        }
        // Schritt 2: Vorhersage und Rückrechnung (Bit 15 = Stelle wird nicht gezeichnet)
        for i in 2..self.x.len() {
            let (lo, hi) = self.nachbar[i];
            let vorher = punkt(self.x[lo], self.x[hi], fit[lo], fit[hi], self.x[i]);
            let oben = self.quant - vorher;
            let unten = vorher;
            let raum = oben.min(unten) << 1;
            let mut v = fit[i];
            if v != 0 {
                if v >= raum {
                    v = if oben > unten { v - unten } else { -1 - (v - oben) };
                } else if v & 1 != 0 {
                    v = -((v + 1) >> 1);
                } else {
                    v >>= 1;
                }
                fit[i] = (v + vorher) & 0x7fff;
                fit[lo] &= 0x7fff;
                fit[hi] &= 0x7fff;
            } else {
                fit[i] = vorher | 0x8000;
            }
        }
        true
    }

    /// Kurve zeichnen und mit dem Residue malnehmen (libvorbis `floor1_inverse2`).
    fn kurve(&self, fit: &[i32], d: &mut [f32]) {
        let n = d.len() as i32;
        let (mut lx, mut hx) = (0i32, 0i32);
        let mut ly = (fit[0] * self.mult).clamp(0, 255);
        for &k in &self.sortiert[1..] {
            let hy = fit[k] & 0x7fff;
            if hy == fit[k] {
                hx = self.x[k];
                let hy = (hy * self.mult).clamp(0, 255);
                linie(n, lx, hx, ly, hy, d);
                lx = hx;
                ly = hy;
            }
        }
        for v in d.iter_mut().skip(hx.max(0) as usize) {
            *v *= db(ly);
        }
    }
}

fn punkt(x0: i32, x1: i32, y0: i32, y1: i32, x: i32) -> i32 {
    let (y0, y1) = (y0 & 0x7fff, y1 & 0x7fff);
    let dy = y1 - y0;
    let adx = x1 - x0;
    let off = dy.abs() * (x - x0) / adx;
    if dy < 0 {
        y0 - off
    } else {
        y0 + off
    }
}

fn linie(n: i32, x0: i32, x1: i32, y0: i32, y1: i32, d: &mut [f32]) {
    let dy = y1 - y0;
    let adx = x1 - x0;
    let base = dy / adx;
    let sy = if dy < 0 { base - 1 } else { base + 1 };
    let ady = dy.abs() - (base * adx).abs();
    let n = n.min(x1);
    let (mut x, mut y, mut err) = (x0, y0, 0);
    if x < n {
        d[x as usize] *= db(y);
    }
    loop {
        x += 1;
        if x >= n {
            break;
        }
        err += ady;
        if err >= adx {
            err -= adx;
            y += sy;
        } else {
            y += base;
        }
        d[x as usize] *= db(y);
    }
}

// ---------------------------------------------------------------- Residue

struct Residue {
    typ: u32,
    anfang: u32,
    ende: u32,
    teil: u32,
    klassen: u32,
    klassenbuch: usize,
    /// klassen^dim(klassenbuch)
    teilwerte: u64,
    buecher: Vec<[i16; 8]>,
}

impl Residue {
    fn lesen(b: &mut Bits, buecher: &[Buch]) -> Result<Residue, KFehler> {
        let typ = r(b, 16)?;
        if typ > 2 {
            return Err(K);
        }
        let anfang = r(b, 24)?;
        let ende = r(b, 24)?;
        let teil = r(b, 24)? + 1;
        let klassen = r(b, 6)? + 1;
        let klassenbuch = r(b, 8)? as usize;
        if klassenbuch >= buecher.len() {
            return Err(K);
        }
        let mut kaskade = Vec::with_capacity(klassen as usize);
        for _ in 0..klassen {
            let unten = r(b, 3)?;
            let oben = if r(b, 1)? == 1 { r(b, 5)? } else { 0 };
            kaskade.push(oben * 8 + unten);
        }
        let mut bs = Vec::with_capacity(klassen as usize);
        for &k in &kaskade {
            let mut z = [-1i16; 8];
            for (j, zj) in z.iter_mut().enumerate() {
                if k & (1 << j) != 0 {
                    let n = r(b, 8)? as usize;
                    if n >= buecher.len() || buecher[n].werte.is_empty() {
                        return Err(K);
                    }
                    *zj = n as i16;
                }
            }
            bs.push(z);
        }
        // libvorbis: klassen^dim darf die Einträge des Klassenbuchs nicht übersteigen
        let kb = &buecher[klassenbuch];
        let mut teilwerte = 1u64;
        for _ in 0..kb.dim {
            teilwerte *= klassen as u64;
            if teilwerte > kb.eintraege as u64 {
                return Err(K);
            }
        }
        Ok(Residue { typ, anfang, ende, teil, klassen, klassenbuch, teilwerte, buecher: bs })
    }
}

/// Eine Partition dekodieren (`format0` = Residue 0, verschränkt; sonst 1/2 der Reihe nach). `false` = Paketende.
fn partition(buch: &Buch, format0: bool, b: &mut Bits, v: &mut [f32], merk: &mut Vec<u32>) -> bool {
    if buch.benutzt == 0 {
        return true;
    }
    let n = v.len();
    let d = buch.dim;
    if format0 {
        let schritt = n / d;
        merk.clear();
        for _ in 0..schritt {
            match buch.eintrag(b) {
                Some(e) => merk.push(e),
                None => return false,
            }
        }
        for i in 0..d {
            let o = i * schritt;
            for (j, &e) in merk.iter().enumerate() {
                if o + j >= n {
                    break;
                }
                v[o + j] += buch.vektor(e)[i];
            }
        }
    } else {
        let mut i = 0;
        while i < n {
            let Some(e) = buch.eintrag(b) else { return false };
            for &t in buch.vektor(e) {
                if i >= n {
                    break;
                }
                v[i] += t;
                i += 1;
            }
        }
    }
    true
}

// ---------------------------------------------------------------- Mapping, Modus

struct Mapping {
    mux: Vec<u8>,
    floor: Vec<u8>,
    residue: Vec<u8>,
    kopplung: Vec<(u8, u8)>,
}

#[derive(Clone, Copy)]
struct Modus {
    lang: bool,
    mapping: u8,
}

/// Kennungskopf (erstes Paket).
#[derive(Clone, Copy, Debug)]
pub(crate) struct Kennung {
    pub kanaele: u32,
    pub rate: u32,
    pub bs: [usize; 2],
}

/// Kennungskopf lesen. Fremde Ogg-Inhalte (Opus, FLAC, Speex, Theora …) und andere Vorbis-Versionen → Code 6.
pub(crate) fn kennung(p: &[u8]) -> Result<Kennung, KFehler> {
    if p.len() < 7 || p[0] != 1 || &p[1..7] != b"vorbis" {
        return Err(F);
    }
    if p.len() < 30 {
        return Err(K);
    }
    if u32::from_le_bytes([p[7], p[8], p[9], p[10]]) != 0 {
        return Err(F);
    }
    let kanaele = p[11] as u32;
    let rate = u32::from_le_bytes([p[12], p[13], p[14], p[15]]);
    let (b0, b1) = ((p[28] & 15) as u32, (p[28] >> 4) as u32);
    if kanaele == 0 || rate == 0 || !(6..=13).contains(&b0) || !(6..=13).contains(&b1) || b0 > b1 || p[29] & 1 == 0 {
        return Err(K);
    }
    Ok(Kennung { kanaele, rate, bs: [1 << b0, 1 << b1] })
}

/// Kommentarkopf: nur Art und Kennung werden geprüft.
pub(crate) fn kommentar(p: &[u8]) -> Result<(), KFehler> {
    if p.len() < 7 || p[0] != 3 || &p[1..7] != b"vorbis" {
        return Err(K);
    }
    Ok(())
}

// ---------------------------------------------------------------- Dekoder

pub(crate) struct Vorbis {
    kanaele: usize,
    bs: [usize; 2],
    buecher: Vec<Buch>,
    floors: Vec<Floor1>,
    residues: Vec<Residue>,
    mappings: Vec<Mapping>,
    modi: Vec<Modus>,
    imdct: [Imdct; 2],
    /// Anstiegsfenster je Blockgröße (Länge bs/2)
    fenster: [Vec<f32>; 2],
    // Laufzustand
    vorher: Option<usize>,
    rechts: Vec<Vec<f32>>,
    spek: Vec<Vec<f32>>,
    zeit: Vec<f32>,
    fit: Vec<Vec<i32>>,
    klassen: Vec<u8>,
    merk: Vec<u32>,
    verschr: Vec<f32>,
    ausgabe: Vec<Vec<f32>>,
    gezaehlt: Option<i64>,
    granule: Option<i64>,
    /// Ausgabe des letzten Pakets: f32-Bits, Kanäle verschachtelt
    pub(crate) aus: Vec<i32>,
}

fn fenster(l: usize) -> Vec<f32> {
    let h = core::f64::consts::FRAC_PI_2;
    (0..l)
        .map(|i| {
            let s = libm::sin((i as f64 + 0.5) / l as f64 * h);
            libm::sin(h * (s * s)) as f32
        })
        .collect()
}

impl Vorbis {
    /// Setup-Kopf (drittes Paket) lesen.
    pub(crate) fn neu(k: &Kennung, p: &[u8]) -> Result<Vorbis, KFehler> {
        if p.len() < 7 || p[0] != 5 || &p[1..7] != b"vorbis" {
            return Err(K);
        }
        let ch = k.kanaele as usize;
        if !(1..=2).contains(&ch) {
            return Err(K);
        }
        let mut b = Bits::neu(&p[7..]);
        let b = &mut b;
        let nb = r(b, 8)? as usize + 1;
        let mut budget = (0u64, 0u64);
        let mut buecher = Vec::with_capacity(nb);
        for _ in 0..nb {
            buecher.push(Buch::lesen(b, &mut budget)?);
        }
        let nt = r(b, 6)? + 1;
        for _ in 0..nt {
            if r(b, 16)? != 0 {
                return Err(K);
            }
        }
        let nf = r(b, 6)? as usize + 1;
        let mut floors = Vec::with_capacity(nf);
        for _ in 0..nf {
            match r(b, 16)? {
                0 => return Err(F),
                1 => floors.push(Floor1::lesen(b, nb)?),
                _ => return Err(K),
            }
        }
        let nr = r(b, 6)? as usize + 1;
        let mut residues = Vec::with_capacity(nr);
        for _ in 0..nr {
            residues.push(Residue::lesen(b, &buecher)?);
        }
        let nm = r(b, 6)? as usize + 1;
        let mut mappings = Vec::with_capacity(nm);
        for _ in 0..nm {
            if r(b, 16)? != 0 {
                return Err(K);
            }
            let subs = if r(b, 1)? == 1 { r(b, 4)? as usize + 1 } else { 1 };
            let mut kopplung = Vec::new();
            if r(b, 1)? == 1 {
                let schritte = r(b, 8)? + 1;
                let kb = ilog(k.kanaele - 1);
                for _ in 0..schritte {
                    let (m, w) = (r(b, kb)?, r(b, kb)?);
                    if m == w || m >= k.kanaele || w >= k.kanaele {
                        return Err(K);
                    }
                    kopplung.push((m as u8, w as u8));
                }
            }
            if r(b, 2)? != 0 {
                return Err(K);
            }
            let mut mux = vec![0u8; ch];
            if subs > 1 {
                for m in mux.iter_mut() {
                    let v = r(b, 4)? as usize;
                    if v >= subs {
                        return Err(K);
                    }
                    *m = v as u8;
                }
            }
            let (mut fl, mut re) = (Vec::with_capacity(subs), Vec::with_capacity(subs));
            for _ in 0..subs {
                r(b, 8)?;
                let f = r(b, 8)? as usize;
                let rs = r(b, 8)? as usize;
                if f >= nf || rs >= nr {
                    return Err(K);
                }
                fl.push(f as u8);
                re.push(rs as u8);
            }
            mappings.push(Mapping { mux, floor: fl, residue: re, kopplung });
        }
        let nmo = r(b, 6)? as usize + 1;
        let mut modi = Vec::with_capacity(nmo);
        for _ in 0..nmo {
            let lang = r(b, 1)? == 1;
            if r(b, 16)? != 0 || r(b, 16)? != 0 {
                return Err(K);
            }
            let m = r(b, 8)? as usize;
            if m >= nm {
                return Err(K);
            }
            modi.push(Modus { lang, mapping: m as u8 });
        }
        if r(b, 1)? != 1 {
            return Err(K);
        }
        let [b0, b1] = k.bs;
        Ok(Vorbis {
            kanaele: ch,
            bs: k.bs,
            buecher,
            floors,
            residues,
            mappings,
            modi,
            imdct: [Imdct::neu(b0), Imdct::neu(b1)],
            fenster: [fenster(b0 / 2), fenster(b1 / 2)],
            vorher: None,
            rechts: vec![vec![0.0; b1 / 2]; ch],
            spek: vec![vec![0.0; b1 / 2]; ch],
            zeit: vec![0.0; b1],
            fit: vec![Vec::with_capacity(65); ch],
            klassen: Vec::new(),
            merk: Vec::new(),
            verschr: Vec::new(),
            ausgabe: vec![vec![0.0; b1 / 2]; ch],
            gezaehlt: None,
            granule: None,
            aus: Vec::new(),
        })
    }

    /// Residue `ri` für die Kanäle `chs` lesen (Spezifikation 8.6; libvorbis `_01inverse`/`res2_inverse`).
    fn residue(&mut self, ri: usize, b: &mut Bits, chs: &[usize], nicht: &[bool], n: usize) {
        let r = &self.residues[ri];
        let buecher = &self.buecher;
        if r.typ == 2 {
            if chs.iter().all(|&c| nicht[c]) {
                return;
            }
            let k = chs.len();
            self.verschr.clear();
            self.verschr.resize(n * k, 0.0);
            let mut v = [&mut self.verschr[..]];
            res_lesen(r, buecher, b, &mut v, &[false], false, &mut self.klassen, &mut self.merk);
            for (j, &c) in chs.iter().enumerate() {
                let s = &mut self.spek[c];
                for i in 0..n {
                    s[i] = self.verschr[i * k + j];
                }
            }
        } else {
            // höchstens 2 Kanäle, chs aufsteigend
            let f0 = r.typ == 0;
            match chs.len() {
                0 => {}
                1 => {
                    let mut vs = [&mut self.spek[chs[0]][..n]];
                    res_lesen(r, buecher, b, &mut vs, &[nicht[chs[0]]], f0, &mut self.klassen, &mut self.merk);
                }
                _ => {
                    let (a, z) = self.spek.split_at_mut(1);
                    let mut vs = [&mut a[0][..n], &mut z[0][..n]];
                    res_lesen(r, buecher, b, &mut vs, &[nicht[0], nicht[1]], f0, &mut self.klassen, &mut self.merk);
                }
            }
        }
    }

    /// Ein Audiopaket dekodieren; danach steht in [`Vorbis::aus`] die fertige Ausgabe (kann leer sein).
    /// `granule`/`eos`: Granulposition und Strom-Ende, wenn das Paket das letzte abgeschlossene seiner Seite ist.
    pub(crate) fn paket(&mut self, p: &[u8], granule: Option<i64>, eos: bool) {
        self.aus.clear();
        let mut bits = Bits::neu(p);
        let b = &mut bits;
        if b.lies(1) != Some(0) {
            return; // leeres Paket oder kein Audiopaket: übergehen
        }
        let Some(mi) = b.lies(ilog(self.modi.len() as u32 - 1)) else { return };
        let Some(&modus) = self.modi.get(mi as usize) else { return };
        let w = modus.lang as usize;
        if w == 1 && (b.lies(1).is_none() || b.lies(1).is_none()) {
            return;
        }
        let n = self.bs[w];
        let h = n / 2;
        let ch = self.kanaele;
        let mi = modus.mapping as usize;
        // Floors
        let mut genutzt = [false; 2];
        for (c, g) in genutzt.iter_mut().enumerate().take(ch) {
            let m = &self.mappings[mi];
            let f = &self.floors[m.floor[m.mux[c] as usize] as usize];
            *g = f.lies(b, &self.buecher, &mut self.fit[c]);
        }
        let mut nicht = [!genutzt[0], !genutzt[1]];
        for &(m, a) in &self.mappings[mi].kopplung {
            if !nicht[m as usize] || !nicht[a as usize] {
                nicht[m as usize] = false;
                nicht[a as usize] = false;
            }
        }
        for s in self.spek.iter_mut() {
            s[..h].fill(0.0);
        }
        // Residues je Untergruppe
        let subs = self.mappings[mi].floor.len();
        for s in 0..subs {
            let mut chs = [0usize; 2];
            let mut k = 0;
            for c in 0..ch {
                if self.mappings[mi].mux[c] as usize == s {
                    chs[k] = c;
                    k += 1;
                }
            }
            let ri = self.mappings[mi].residue[s] as usize;
            self.residue(ri, b, &chs[..k], &nicht, h);
        }
        // Kopplung rückwärts auflösen
        for i in (0..self.mappings[mi].kopplung.len()).rev() {
            let (m, a) = self.mappings[mi].kopplung[i];
            let (m, a) = (m as usize, a as usize);
            for j in 0..h {
                let mag = self.spek[m][j];
                let ang = self.spek[a][j];
                let (nm, na) = if mag > 0.0 {
                    if ang > 0.0 {
                        (mag, mag - ang)
                    } else {
                        (mag + ang, mag)
                    }
                } else if ang > 0.0 {
                    (mag, mag + ang)
                } else {
                    (mag - ang, mag)
                };
                self.spek[m][j] = nm;
                self.spek[a][j] = na;
            }
        }
        // Floor-Kurve × Residue, inverse MDCT, Überlappung
        let vorher = self.vorher;
        let pn = vorher.map(|v| self.bs[v]).unwrap_or(n);
        let zahl = if vorher.is_some() { pn / 4 + n / 4 } else { 0 };
        for c in 0..ch {
            let m = &self.mappings[mi];
            if genutzt[c] {
                self.floors[m.floor[m.mux[c] as usize] as usize].kurve(&self.fit[c], &mut self.spek[c][..h]);
            } else {
                self.spek[c][..h].fill(0.0);
            }
            self.imdct[w].rueck(&self.spek[c][..h], &mut self.zeit[..n]);
            let z = &self.zeit;
            let r = &mut self.rechts[c];
            let o = &mut self.ausgabe[c];
            if vorher.is_some() {
                if pn == n {
                    let f = &self.fenster[w];
                    for i in 0..h {
                        o[i] = r[i] * f[h - 1 - i] + z[i] * f[i];
                    }
                } else if pn > n {
                    // lang → kurz
                    let f = &self.fenster[0];
                    let l = n / 2;
                    let off = pn / 4 - n / 4;
                    o[..off].copy_from_slice(&r[..off]);
                    for i in 0..l {
                        o[off + i] = r[off + i] * f[l - 1 - i] + z[i] * f[i];
                    }
                } else {
                    // kurz → lang
                    let f = &self.fenster[0];
                    let l = pn / 2;
                    let off = n / 4 - pn / 4;
                    for i in 0..l {
                        o[i] = r[i] * f[l - 1 - i] + z[off + i] * f[i];
                    }
                    o[l..zahl].copy_from_slice(&z[off + l..off + zahl]);
                }
            }
            r[..h].copy_from_slice(&z[h..n]);
        }
        self.vorher = Some(w);
        // Granulpositionen wie libvorbis `vorbis_synthesis_blockin`: Anfang oder Ende kürzen
        let (mut von, mut bis) = (0usize, zahl);
        match self.gezaehlt {
            None => self.gezaehlt = Some(0),
            Some(g) => self.gezaehlt = Some(g.saturating_add(zahl as i64)),
        }
        let gezaehlt = self.gezaehlt.unwrap_or(0);
        match self.granule {
            None => {
                if let Some(g) = granule {
                    self.granule = Some(g);
                    if gezaehlt > g {
                        let extra = gezaehlt.saturating_sub(g).clamp(0, zahl as i64) as usize;
                        if eos {
                            bis -= extra;
                        } else {
                            von = extra;
                        }
                    }
                }
            }
            Some(eigen) => {
                let eigen = eigen.saturating_add(zahl as i64);
                self.granule = Some(eigen);
                if let Some(g) = granule {
                    if eigen != g {
                        if eigen > g && eos {
                            let extra = eigen.saturating_sub(g).clamp(0, zahl as i64) as usize;
                            bis -= extra;
                        }
                        self.granule = Some(g);
                    }
                }
            }
        }
        if von < bis {
            self.aus.reserve((bis - von) * ch);
            for i in von..bis {
                for c in 0..ch {
                    self.aus.push(self.ausgabe[c][i].to_bits() as i32);
                }
            }
        }
    }
}

/// Residue-Vektoren lesen (alle Durchgänge); bei Paketende bleibt, was bis dahin gelesen ist.
#[allow(clippy::too_many_arguments)]
fn res_lesen(
    r: &Residue,
    buecher: &[Buch],
    b: &mut Bits,
    vs: &mut [&mut [f32]],
    nicht: &[bool],
    format0: bool,
    klassen: &mut Vec<u8>,
    merk: &mut Vec<u32>,
) {
    let len = vs.first().map(|v| v.len()).unwrap_or(0);
    let anfang = (r.anfang as usize).min(len);
    let ende = (r.ende as usize).min(len);
    if ende <= anfang {
        return;
    }
    let teil = r.teil as usize;
    let teile = (ende - anfang) / teil;
    if teile == 0 {
        return;
    }
    let kb = &buecher[r.klassenbuch];
    let cpc = kb.dim;
    let breite = teile + cpc;
    klassen.clear();
    klassen.resize(vs.len() * breite, 0);
    for pass in 0..8 {
        let mut pc = 0;
        while pc < teile {
            if pass == 0 {
                for j in 0..vs.len() {
                    if nicht[j] {
                        continue;
                    }
                    let Some(t) = kb.eintrag(b) else { return };
                    if t as u64 >= r.teilwerte {
                        return;
                    }
                    let mut t = t;
                    for i in (0..cpc).rev() {
                        klassen[j * breite + pc + i] = (t % r.klassen) as u8;
                        t /= r.klassen;
                    }
                }
            }
            for _ in 0..cpc {
                if pc >= teile {
                    break;
                }
                for j in 0..vs.len() {
                    if nicht[j] {
                        continue;
                    }
                    let k = klassen[j * breite + pc] as usize;
                    let buch = r.buecher[k][pass];
                    if buch >= 0 {
                        let o = anfang + pc * teil;
                        if !partition(&buecher[buch as usize], format0, b, &mut vs[j][o..o + teil], merk) {
                            return;
                        }
                    }
                }
                pc += 1;
            }
        }
    }
}
