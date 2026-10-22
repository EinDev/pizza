//! JS-identische Zahlformatierung und -verarbeitung (Number::toString, Math.round, toFixed, Number()).

use alloc::vec::Vec;
use core::fmt::Write;

pub fn floor(x: f64) -> f64 { libm::floor(x) }
pub fn ceil(x: f64) -> f64 { libm::ceil(x) }
pub fn trunc(x: f64) -> f64 { libm::trunc(x) }
pub fn sqrt(x: f64) -> f64 { libm::sqrt(x) }
// ---------------------------------------------------------------- K-111: Mathe.log/log10/log2/exp bitgleich zu V8
// Port der fdlibm-Routinen, so wie V8 sie in src/base/ieee754.cc verwendet (Sun e_log.c, Sun e_log10.c über log(),
// FreeBSD e_log2.c mit k_log1p, fdlibm e_exp.c mit V8-Sonderfall exp(1) = E). Nur Double-Operationen, keine FMA.
// libm 0.2 (musl-Fassung von log/log10/exp) weicht in einzelnen Bits ab – Stichprobentest tests/wasm/laufzeit-zahlen.js.

#[inline] fn hi_wort(x: f64) -> i32 { (x.to_bits() >> 32) as i32 }
#[inline] fn lo_wort(x: f64) -> u32 { x.to_bits() as u32 }
#[inline] fn mit_hi(x: f64, hi: i32) -> f64 { f64::from_bits(((hi as u32 as u64) << 32) | (x.to_bits() & 0xFFFF_FFFF)) }
#[inline] fn mit_lo(x: f64, lo: u32) -> f64 { f64::from_bits((x.to_bits() & 0xFFFF_FFFF_0000_0000) | lo as u64) }

const LG1: f64 = 6.666666666666735130e-01;
const LG2: f64 = 3.999999999940941908e-01;
const LG3: f64 = 2.857142874366239149e-01;
const LG4: f64 = 2.222219843214978396e-01;
const LG5: f64 = 1.818357216161805012e-01;
const LG6: f64 = 1.531383769920937332e-01;
const LG7: f64 = 1.479819860511658591e-01;
const LN2_HI: f64 = 6.93147180369123816490e-01;
const LN2_LO: f64 = 1.90821492927058770002e-10;
const TWO54: f64 = 1.80143985094819840000e+16;

/// `Math.log(x)` – Sun fdlibm e_log.c (wie V8 base::ieee754::log)
pub fn log(x: f64) -> f64 {
    let mut x = x;
    let mut hx = hi_wort(x);
    let lx = lo_wort(x);
    let mut k: i32 = 0;
    if hx < 0x0010_0000 {
        if ((hx & 0x7FFF_FFFF) as u32 | lx) == 0 { return f64::NEG_INFINITY; }
        if hx < 0 { return f64::NAN; }
        k -= 54;
        x *= TWO54;
        hx = hi_wort(x);
    }
    if hx >= 0x7FF0_0000 { return x + x; }
    k += (hx >> 20) - 1023;
    hx &= 0x000F_FFFF;
    let mut i = (hx + 0x95F64) & 0x10_0000;
    x = mit_hi(x, hx | (i ^ 0x3FF0_0000));
    k += i >> 20;
    let f = x - 1.0;
    if (0x000F_FFFF & (2 + hx)) < 3 {
        if f == 0.0 {
            if k == 0 { return 0.0; }
            let dk = k as f64;
            return dk * LN2_HI + dk * LN2_LO;
        }
        let r = f * f * (0.5 - 0.33333333333333333 * f);
        if k == 0 { return f - r; }
        let dk = k as f64;
        return dk * LN2_HI - ((r - dk * LN2_LO) - f);
    }
    let s = f / (2.0 + f);
    let dk = k as f64;
    let z = s * s;
    i = hx - 0x6147A;
    let w = z * z;
    let j = 0x6B851 - hx;
    let t1 = w * (LG2 + w * (LG4 + w * LG6));
    let t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
    i |= j;
    let r = t2 + t1;
    if i > 0 {
        let hfsq = 0.5 * f * f;
        if k == 0 { f - (hfsq - s * (hfsq + r)) } else { dk * LN2_HI - ((hfsq - (s * (hfsq + r) + dk * LN2_LO)) - f) }
    } else if k == 0 { f - s * (f - r) } else { dk * LN2_HI - ((s * (f - r) - dk * LN2_LO) - f) }
}

/// `Math.log10(x)` – Sun fdlibm e_log10.c (n·log10_2hi + (n·log10_2lo + ivln10·log(x)); wie V8)
pub fn log10(x: f64) -> f64 {
    const IVLN10: f64 = 4.34294481903251816668e-01;
    const LOG10_2HI: f64 = 3.01029995663611771306e-01;
    const LOG10_2LO: f64 = 3.69423907715893078616e-13;
    let mut x = x;
    let mut hx = hi_wort(x);
    let lx = lo_wort(x);
    let mut k: i32 = 0;
    if hx < 0x0010_0000 {
        if ((hx & 0x7FFF_FFFF) as u32 | lx) == 0 { return f64::NEG_INFINITY; }
        if hx < 0 { return f64::NAN; }
        k -= 54;
        x *= TWO54;
        hx = hi_wort(x);
    }
    if hx >= 0x7FF0_0000 { return x + x; }
    k += (hx >> 20) - 1023;
    let i = ((k as u32) & 0x8000_0000) >> 31;
    hx = (hx & 0x000F_FFFF) | (((0x3FF - i) as i32) << 20);
    let y = (k + i as i32) as f64;
    x = mit_hi(x, hx);
    let z = y * LOG10_2LO + IVLN10 * log(x);
    z + y * LOG10_2HI
}

/// k_log.h `k_log1p(f)`: log(1+f) - f + hfsq für |f| klein
#[inline]
fn k_log1p(f: f64) -> f64 {
    let s = f / (2.0 + f);
    let z = s * s;
    let w = z * z;
    let t1 = w * (LG2 + w * (LG4 + w * LG6));
    let t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
    let r = t2 + t1;
    let hfsq = 0.5 * f * f;
    s * (hfsq + r)
}

/// `Math.log2(x)` – FreeBSD e_log2.c mit k_log1p (wie V8)
pub fn log2(x: f64) -> f64 {
    const IVLN2HI: f64 = 1.44269504072144627571e+00;
    const IVLN2LO: f64 = 1.67517131648865118353e-10;
    let mut x = x;
    let mut hx = hi_wort(x);
    let lx = lo_wort(x);
    let mut k: i32 = 0;
    if hx < 0x0010_0000 {
        if ((hx & 0x7FFF_FFFF) as u32 | lx) == 0 { return f64::NEG_INFINITY; }
        if hx < 0 { return f64::NAN; }
        k -= 54;
        x *= TWO54;
        hx = hi_wort(x);
    }
    if hx >= 0x7FF0_0000 { return x + x; }
    if hx == 0x3FF0_0000 && lx == 0 { return 0.0; }
    k += (hx >> 20) - 1023;
    hx &= 0x000F_FFFF;
    let i = (hx + 0x95F64) & 0x10_0000;
    x = mit_hi(x, hx | (i ^ 0x3FF0_0000));
    k += i >> 20;
    let y = k as f64;
    let f = x - 1.0;
    let hfsq = 0.5 * f * f;
    let r = k_log1p(f);
    let mut hi = f - hfsq;
    hi = mit_lo(hi, 0);
    let lo = (f - hi) - hfsq + r;
    let mut val_hi = hi * IVLN2HI;
    let mut val_lo = (lo + hi) * IVLN2LO + lo * IVLN2HI;
    let w = y + val_hi;
    val_lo += (y - w) + val_hi;
    val_hi = w;
    val_lo + val_hi
}

/// `Math.exp(x)` – fdlibm e_exp.c mit V8-Sonderfall exp(1) = E
pub fn exp(x: f64) -> f64 {
    const HALF: [f64; 2] = [0.5, -0.5];
    const O_THRESHOLD: f64 = 7.09782712893383973096e+02;
    const U_THRESHOLD: f64 = -7.45133219101941108420e+02;
    const LN2HI: [f64; 2] = [6.93147180369123816490e-01, -6.93147180369123816490e-01];
    const LN2LO: [f64; 2] = [1.90821492927058770002e-10, -1.90821492927058770002e-10];
    const INVLN2: f64 = 1.44269504088896338700e+00;
    const P1: f64 = 1.66666666666666019037e-01;
    const P2: f64 = -2.77777777770155933842e-03;
    const P3: f64 = 6.61375632143793436117e-05;
    const P4: f64 = -1.65339022054652515390e-06;
    const P5: f64 = 4.13813679705723846039e-08;
    const E: f64 = 2.718281828459045;
    const HUGE: f64 = 1.0e+300;
    const TWOM1000: f64 = 9.33263618503218878990e-302;
    const TWO1023: f64 = 8.988465674311579539e307;
    let mut x = x;
    let mut hi = 0.0;
    let mut lo = 0.0;
    let mut k: i32 = 0;
    let hx0 = hi_wort(x);
    let xsb = ((hx0 >> 31) & 1) as usize;
    let hx = hx0 & 0x7FFF_FFFF;
    if hx >= 0x4086_2E42 {
        if hx >= 0x7FF0_0000 {
            let lx = lo_wort(x);
            if ((hx & 0xFFFFF) as u32 | lx) != 0 { return x + x; }
            return if xsb == 0 { x } else { 0.0 };
        }
        if x > O_THRESHOLD { return HUGE * HUGE; }
        if x < U_THRESHOLD { return TWOM1000 * TWOM1000; }
    }
    if hx > 0x3FD6_2E42 {
        if hx < 0x3FF0_A2B2 {
            if x == 1.0 { return E; }
            hi = x - LN2HI[xsb];
            lo = LN2LO[xsb];
            k = 1 - xsb as i32 - xsb as i32;
        } else {
            k = (INVLN2 * x + HALF[xsb]) as i32;
            let t = k as f64;
            hi = x - t * LN2HI[0];
            lo = t * LN2LO[0];
        }
        x = hi - lo;
    } else if hx < 0x3E30_0000 {
        if HUGE + x > 1.0 { return 1.0 + x; }
    } else {
        k = 0;
    }
    let t = x * x;
    let twopk = if k >= -1021 { f64::from_bits(((0x3FF0_0000i32 + (k << 20)) as u32 as u64) << 32) } else { f64::from_bits(((0x3FF0_0000i32 + ((k + 1000) << 20)) as u32 as u64) << 32) };
    let c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
    if k == 0 { return 1.0 - ((x * c) / (c - 2.0) - x); }
    let y = 1.0 - ((lo - (x * c) / (2.0 - c)) - hi);
    if k >= -1021 {
        if k == 1024 { return y * 2.0 * TWO1023; }
        y * twopk
    } else {
        y * twopk * TWOM1000
    }
}

/// `Number.isInteger(x)`
pub fn ist_ganz(x: f64) -> bool { x.is_finite() && trunc(x) == x }

/// `Math.round(x)` (Hälfte Richtung +∞, -0 bleibt -0)
pub fn js_round(x: f64) -> f64 {
    if !x.is_finite() || x == 0.0 { return x; }
    let f = floor(x);
    let r = if x - f >= 0.5 { f + 1.0 } else { f };
    if r == 0.0 && x < 0.0 { -0.0 } else { r }
}

/// `Math.sign`
pub fn js_sign(x: f64) -> f64 {
    if x != x { return x; }
    if x > 0.0 { 1.0 } else if x < 0.0 { -1.0 } else { x }
}

struct Puffer<'a>(&'a mut Vec<u8>);
impl<'a> Write for Puffer<'a> {
    fn write_str(&mut self, s: &str) -> core::fmt::Result { self.0.extend_from_slice(s.as_bytes()); Ok(()) }
}

/// Kürzeste Ziffern (wie JS) + Exponent n, so dass x = 0.d1d2…dk × 10^n
fn ziffern(x: f64) -> (Vec<u8>, i32) {
    let mut roh = Vec::new();
    let _ = write!(Puffer(&mut roh), "{:e}", x);
    // Form: d[.ddd]e[-]E
    let mut dig = Vec::new();
    let mut i = 0;
    while i < roh.len() && roh[i] != b'e' {
        if roh[i] != b'.' { dig.push(roh[i]); }
        i += 1;
    }
    let mut e: i32 = 0;
    let mut neg = false;
    i += 1;
    if i < roh.len() && roh[i] == b'-' { neg = true; i += 1; }
    while i < roh.len() { e = e * 10 + (roh[i] - b'0') as i32; i += 1; }
    if neg { e = -e; }
    while dig.len() > 1 && *dig.last().unwrap() == b'0' { dig.pop(); }
    let k = dig.len();
    // Gleichstand? (exakter Wert liegt genau zwischen zwei k-stelligen Dezimalzahlen) → JS wählt die gerade Ziffer
    let mut ex = Vec::new();
    let _ = write!(Puffer(&mut ex), "{:.*e}", k + 25, x);
    let mut ed = Vec::new();
    let mut j = 0;
    while j < ex.len() && ex[j] != b'e' { if ex[j] != b'.' { ed.push(ex[j]); } j += 1; }
    let mut ee: i32 = 0; let mut en = false; j += 1;
    if j < ex.len() && ex[j] == b'-' { en = true; j += 1; }
    while j < ex.len() { ee = ee * 10 + (ex[j] - b'0') as i32; j += 1; }
    if en { ee = -ee; }
    if ed.len() > k + 1 && ed[k] == b'5' && ed[k + 1..].iter().all(|&c| c == b'0') {
        let mut d: Vec<u8> = ed[..k].to_vec();
        let mut exp = ee;
        if (d[k - 1] - b'0') % 2 == 1 {
            // aufrunden
            let mut i = k;
            loop {
                if i == 0 { d.insert(0, b'1'); d.pop(); exp += 1; break; }
                i -= 1;
                if d[i] == b'9' { d[i] = b'0'; } else { d[i] += 1; break; }
            }
        }
        while d.len() > 1 && *d.last().unwrap() == b'0' { d.pop(); }
        return (d, exp + 1);
    }
    (dig, e + 1)
}

/// `String(x)` für Zahlen
pub fn js_text(x: f64, out: &mut Vec<u8>) {
    if x != x { out.extend_from_slice(b"NaN"); return; }
    if x == 0.0 { out.push(b'0'); return; }
    if x.is_infinite() { if x < 0.0 { out.push(b'-'); } out.extend_from_slice(b"Infinity"); return; }
    let mut v = x;
    if v < 0.0 { out.push(b'-'); v = -v; }
    // schneller Weg: kleine Ganzzahlen
    if v < 1e15 && trunc(v) == v {
        let mut n = v as u64;
        let mut buf = [0u8; 20];
        let mut i = 20;
        loop { i -= 1; buf[i] = b'0' + (n % 10) as u8; n /= 10; if n == 0 { break; } }
        out.extend_from_slice(&buf[i..]);
        return;
    }
    let (d, n) = ziffern(v);
    let k = d.len() as i32;
    if k <= n && n <= 21 {
        out.extend_from_slice(&d);
        for _ in 0..(n - k) { out.push(b'0'); }
    } else if 0 < n && n <= 21 {
        out.extend_from_slice(&d[..n as usize]);
        out.push(b'.');
        out.extend_from_slice(&d[n as usize..]);
    } else if -6 < n && n <= 0 {
        out.extend_from_slice(b"0.");
        for _ in 0..(-n) { out.push(b'0'); }
        out.extend_from_slice(&d);
    } else {
        let e = n - 1;
        out.push(d[0]);
        if k > 1 { out.push(b'.'); out.extend_from_slice(&d[1..]); }
        out.push(b'e');
        out.push(if e < 0 { b'-' } else { b'+' });
        let mut ea = e.unsigned_abs();
        let mut buf = [0u8; 6];
        let mut i = 6;
        loop { i -= 1; buf[i] = b'0' + (ea % 10) as u8; ea /= 10; if ea == 0 { break; } }
        out.extend_from_slice(&buf[i..]);
    }
}

/// zahlText: -0 → "0"
pub fn zahl_text(x: f64, out: &mut Vec<u8>) { js_text(x, out) }

/// `rundeAuf(x, n)`
pub fn runde_auf(x: f64, n: f64) -> f64 {
    if n == 0.0 || n != n {
        return js_sign(x) * js_round(x.abs());
    }
    let f = libm::pow(10.0, n);
    let r = js_sign(x) * js_round(x.abs() * f + 1e-9) / f;
    if r == 0.0 { 0.0 } else { r }
}

/// `x.toFixed(2)` für 0 ≤ x < 1e21 (exakt)
fn to_fixed2(x: f64, out: &mut Vec<u8>) {
    let bits = x.to_bits();
    let exp = ((bits >> 52) & 0x7ff) as i32;
    let raw = bits & ((1u64 << 52) - 1);
    let (mant, e) = if exp == 0 { (raw, -1074i32) } else { (raw | (1u64 << 52), exp - 1075) };
    // x = mant * 2^e ; n = round_half_up(x*100)
    let n: u128 = if e >= 0 {
        ((mant as u128) << e as u32) * 100
    } else {
        let sh = (-e) as u32;
        if sh >= 120 { 0 } else {
            let z = (mant as u128) * 100;
            let q = z >> sh;
            let rest = z - (q << sh);
            let halb = 1u128 << (sh - 1);
            if rest >= halb { q + 1 } else { q }
        }
    };
    let ganz = n / 100;
    let frac = (n % 100) as u8;
    let mut buf = [0u8; 40];
    let mut i = 40;
    let mut g = ganz;
    loop { i -= 1; buf[i] = b'0' + (g % 10) as u8; g /= 10; if g == 0 { break; } }
    out.extend_from_slice(&buf[i..]);
    out.push(b'.');
    out.push(b'0' + frac / 10);
    out.push(b'0' + frac % 10);
}

/// `x.toFixed(n)` für 0 ≤ x < 1e21, n ≤ 20 (exakt, Hälfte aufrunden wie V8)
pub fn to_fixed(x: f64, n: u32, out: &mut Vec<u8>) {
    let bits = x.to_bits();
    let exp = ((bits >> 52) & 0x7ff) as i32;
    let raw = bits & ((1u64 << 52) - 1);
    let (mant, e) = if exp == 0 { (raw, -1074i32) } else { (raw | (1u64 << 52), exp - 1075) };
    let p10: u128 = 10u128.pow(n);
    let (ganz, frac): (u128, u128) = if e >= 0 {
        ((mant as u128) << e as u32, 0)
    } else {
        let sh = (-e) as u32;
        let z = (mant as u128) * p10;
        let mut q = if sh >= 128 { 0 } else { z >> sh };
        let rest = if sh >= 128 { z } else { z - (q << sh) };
        if sh < 128 && sh > 0 && rest >= (1u128 << (sh - 1)) { q += 1; }
        (q / p10, q % p10)
    };
    let mut buf = [0u8; 48];
    let mut i = 48;
    let mut g = ganz;
    loop { i -= 1; buf[i] = b'0' + (g % 10) as u8; g /= 10; if g == 0 { break; } }
    out.extend_from_slice(&buf[i..]);
    if n > 0 {
        out.push(b'.');
        let mut d = [b'0'; 20];
        let mut fr = frac;
        for k in (0..n as usize).rev() { d[k] = b'0' + (fr % 10) as u8; fr /= 10; }
        out.extend_from_slice(&d[..n as usize]);
    }
}

/// K-085/K-103 `tausenderText(x, n)`: ab |x| ≥ 10²¹ sowie ∞/NaN wie `kompakt(2)`
pub fn tausender_text(x: f64, n: u32, out: &mut Vec<u8>) {
    if !x.is_finite() || x.abs() >= 1e21 { kompakt_text(x, 2, out); return; }
    let r = runde_auf(x, n as f64);
    if !r.is_finite() || r.abs() >= 1e21 { kompakt_text(r, 2, out); return; } // Rundung kann 10²¹ erreichen
    let neg = r < 0.0;
    let a = r.abs();
    let mut fix = Vec::new();
    to_fixed(a, n, &mut fix);
    let (g, k) = match fix.iter().position(|&c| c == b'.') { Some(p) => (&fix[..p], Some(&fix[p + 1..])), None => (&fix[..], None) };
    if neg { out.push(b'-'); }
    // \B(?=(\d{3})+(?!\d)): Punkt vor jeder Dreiergruppe von Ziffern bis zum Ende der Ziffernfolge
    let alle_ziffern = g.iter().all(|c| c.is_ascii_digit());
    if alle_ziffern {
        for (i, &c) in g.iter().enumerate() { if i > 0 && (g.len() - i) % 3 == 0 { out.push(b'.'); } out.push(c); }
    } else { out.extend_from_slice(g); }
    if let Some(k) = k { out.push(b','); out.extend_from_slice(k); }
}

fn zahl_mit_komma(x: f64, out: &mut Vec<u8>) {
    let st = out.len();
    js_text(x, out);
    if let Some(p) = out[st..].iter().position(|&c| c == b'.') { out[st + p] = b','; }
}

/// K-085/K-103: deutsche lange Skala bis Dezilliarde (größte zuerst)
const KOMPAKT_STUFEN: [(f64, &str); 21] = [
    (1e63, "Dezd."), (1e60, "Dez."), (1e57, "Nond."), (1e54, "Non."), (1e51, "Oktd."), (1e48, "Okt."),
    (1e45, "Septd."), (1e42, "Sept."), (1e39, "Sextd."), (1e36, "Sext."), (1e33, "Quintd."), (1e30, "Quint."),
    (1e27, "Quadrd."), (1e24, "Quadr."), (1e21, "Trd."), (1e18, "Trio."), (1e15, "Brd."), (1e12, "Bio."), (1e9, "Mrd."),
    (1e6, "Mio."), (1e3, "Tsd."),
];
const HOCH: [&str; 10] = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

/// K-085/K-103 `kompaktText(x, n)`
pub fn kompakt_text(x: f64, n: u32, out: &mut Vec<u8>) {
    if x != x { out.extend_from_slice(b"NaN"); return; }
    if x.is_infinite() { if x < 0.0 { out.push(b'-'); } out.extend_from_slice("∞".as_bytes()); return; }
    let a = x.abs();
    if a >= 1e66 {
        // Mantisse/Exponent aus der kürzesten Ziffernfolge wie `a.toExponential()` (nie über log10/pow)
        let (d, k) = ziffern(a);
        let mut ms = alloc::string::String::new();
        ms.push(d[0] as char);
        if d.len() > 1 { ms.push('.'); for &c in &d[1..] { ms.push(c as char); } }
        let mut e: i32 = k - 1;
        let mut m = runde_auf(ms.parse::<f64>().unwrap_or(f64::NAN), n as f64);
        if m >= 10.0 { m = runde_auf(m / 10.0, n as f64); e += 1; }
        if x < 0.0 { out.push(b'-'); }
        zahl_mit_komma(m, out);
        out.extend_from_slice(" × 10".as_bytes());
        if e < 0 { out.push(b'-'); }
        let mut buf = [0usize; 6];
        let mut i = 6;
        let mut ea = e.unsigned_abs() as usize;
        loop { i -= 1; buf[i] = ea % 10; ea /= 10; if ea == 0 { break; } }
        for &z in &buf[i..] { out.extend_from_slice(HOCH[z].as_bytes()); }
        return;
    }
    for (f, name) in KOMPAKT_STUFEN.iter() {
        if a >= *f { zahl_mit_komma(runde_auf(x / f, n as f64), out); out.push(b' '); out.extend_from_slice(name.as_bytes()); return; }
    }
    zahl_mit_komma(runde_auf(x, n as f64), out);
}

/// `euroText(x)` (K-103: ab |x| ≥ 10²¹ sowie ∞/NaN wie `kompakt(2)` + " €")
pub fn euro_text(x: f64, out: &mut Vec<u8>) {
    if !x.is_finite() || x.abs() >= 1e21 { kompakt_text(x, 2, out); out.extend_from_slice(" €".as_bytes()); return; }
    let r = js_round(x.abs() * 100.0 + 1e-9) / 100.0;
    let mut fix = Vec::new();
    if r != r { fix.extend_from_slice(b"NaN"); }
    else if r >= 1e21 || r.is_infinite() { js_text(r, &mut fix); }
    else { to_fixed2(r, &mut fix); }
    if x < 0.0 && r != 0.0 { out.push(b'-'); }
    // split('.') → g, k
    match fix.iter().position(|&c| c == b'.') {
        Some(p) => {
            let rest = &fix[p + 1..];
            let k_end = rest.iter().position(|&c| c == b'.').unwrap_or(rest.len());
            out.extend_from_slice(&fix[..p]);
            out.push(b',');
            out.extend_from_slice(&rest[..k_end]);
        }
        None => { out.extend_from_slice(&fix); out.extend_from_slice(b",undefined"); }
    }
    out.extend_from_slice(" €".as_bytes());
}

/// `dauerText(ms)`
pub fn dauer_text(ms: f64, out: &mut Vec<u8>) {
    let neg = ms < 0.0;
    let mut r = js_round(ms.abs());
    if r == 0.0 || r != r {
        if r != r { out.extend_from_slice(b"0ms"); return; }
        out.extend_from_slice(b"0ms");
        return;
    }
    if neg { out.push(b'-'); }
    let e: [(&[u8], f64); 5] = [(b"d", 86400000.0), (b"h", 3600000.0), (b"min", 60000.0), (b"s", 1000.0), (b"ms", 1.0)];
    let mut erst = true;
    for (n, f) in e.iter() {
        let q = floor(r / f);
        if q != 0.0 {
            if !erst { out.push(b' '); }
            erst = false;
            js_text(q, out);
            out.extend_from_slice(n);
            r -= q * f;
        }
    }
}

fn ist_js_leer(c: char) -> bool {
    matches!(c, '\u{9}' | '\u{a}' | '\u{b}' | '\u{c}' | '\u{d}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}'
        | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

/// `String.prototype.trim`
pub fn js_trim(s: &str) -> &str { s.trim_matches(ist_js_leer) }

/// `Number(s)` (StringToNumber); None = NaN
pub fn js_number(s: &str) -> Option<f64> {
    let t = js_trim(s);
    if t.is_empty() { return Some(0.0); }
    let b = t.as_bytes();
    if b.len() > 2 && b[0] == b'0' {
        let basis = match b[1] { b'x' | b'X' => 16, b'o' | b'O' => 8, b'b' | b'B' => 2, _ => 0 };
        if basis != 0 {
            let mut v = 0.0f64;
            for &c in &b[2..] {
                let d = match c { b'0'..=b'9' => (c - b'0') as u32, b'a'..=b'f' => (c - b'a' + 10) as u32, b'A'..=b'F' => (c - b'A' + 10) as u32, _ => 99 };
                if d >= basis { return None; }
                v = v * basis as f64 + d as f64;
            }
            return Some(v);
        }
    }
    match t {
        "Infinity" | "+Infinity" => return Some(f64::INFINITY),
        "-Infinity" => return Some(f64::NEG_INFINITY),
        _ => {}
    }
    // nur JS-Dezimalliterale zulassen
    let mut i = 0;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') { i += 1; }
    let mut ziff = 0;
    while i < b.len() && b[i].is_ascii_digit() { i += 1; ziff += 1; }
    if i < b.len() && b[i] == b'.' { i += 1; while i < b.len() && b[i].is_ascii_digit() { i += 1; ziff += 1; } }
    if ziff == 0 { return None; }
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        i += 1;
        if i < b.len() && (b[i] == b'+' || b[i] == b'-') { i += 1; }
        let mut ez = 0;
        while i < b.len() && b[i].is_ascii_digit() { i += 1; ez += 1; }
        if ez == 0 { return None; }
    }
    if i != b.len() { return None; }
    t.parse::<f64>().ok()
}

/// mulberry32
pub fn mulberry32(a: &mut u32) -> f64 {
    *a = a.wrapping_add(0x6D2B79F5);
    let a0 = *a;
    let mut t = (a0 ^ (a0 >> 15)).wrapping_mul(1 | a0);
    t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t)) ^ t;
    ((t ^ (t >> 14)) as f64) / 4294967296.0
}

/// JS `%` auf Zahlen
pub fn js_rest(a: f64, b: f64) -> f64 { a % b }

/// K-007: `[+-]? Ziffern[_Ziffern]* ((.|,) Ziffern[_Ziffern]*)?` nach trim; -0 → 0
pub fn zahl_aus_text(text: &str) -> Option<f64> {
    let t = js_trim(text);
    let b = t.as_bytes();
    let mut i = 0;
    let mut s = alloc::string::String::new();
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') { s.push(b[i] as char); i += 1; }
    let ziffern = |i: &mut usize, s: &mut alloc::string::String| -> bool {
        let start = *i;
        loop {
            let a = *i;
            while *i < b.len() && b[*i].is_ascii_digit() { s.push(b[*i] as char); *i += 1; }
            if *i == a { return false; }
            if *i < b.len() && b[*i] == b'_' && *i + 1 < b.len() && b[*i + 1].is_ascii_digit() { *i += 1; continue; }
            break;
        }
        *i > start
    };
    if !ziffern(&mut i, &mut s) { return None; }
    if i < b.len() && (b[i] == b'.' || b[i] == b',') {
        s.push('.');
        i += 1;
        if !ziffern(&mut i, &mut s) { return None; }
    }
    if i != b.len() { return None; }
    let v: f64 = s.parse().ok()?;
    Some(if v == 0.0 { 0.0 } else { v })
}
