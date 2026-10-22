//! Eingebetteter SDF-Schriftatlas (erzeugt von `herd-bild atlas`, Schrift Nunito, OFL) und Textsatz.
//!
//! Format `schrift/atlas.bin` (Little Endian):
//! `"HZS1"`, `u16 breite`, `u16 hoehe`, `f32 em` (Atlas-Pixel je em), `f32 spanne` (Pixel, die dem Wertebereich 0 … 1
//! je zur Hälfte entsprechen), `f32 aufstieg`, `f32 abstieg` (negativ), `f32 zeilenluecke` (em), `u32 n`,
//! n × (`u32 zeichen`, `f32 vorschub`, `f32 links`, `f32 oben` (em), `u16 x, y, b, h` (Atlas-Pixel)) aufsteigend nach Zeichen,
//! `u32 k`, k × (`u32 a`, `u32 b`, `f32 wert` (em)) aufsteigend nach (a, b), dann `breite × hoehe` Bytes Abstandswerte.

pub static ATLAS: &[u8] = include_bytes!("../schrift/atlas.bin");

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Glyphe {
    pub zeichen: u32,
    pub vorschub: f32,
    pub links: f32,
    pub oben: f32,
    pub x: u16,
    pub y: u16,
    pub b: u16,
    pub h: u16,
}

#[derive(Clone, Copy)]
pub struct Schrift {
    pub breite: u32,
    pub hoehe: u32,
    pub em: f32,
    pub spanne: f32,
    pub aufstieg: f32,
    pub abstieg: f32,
    pub zeilenluecke: f32,
    glyphen: &'static [u8],
    n: usize,
    kern: &'static [u8],
    k: usize,
    pub pixel: &'static [u8],
}

fn u16_(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}
fn u32_(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}
fn f32_(b: &[u8], i: usize) -> f32 {
    f32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

const GLYPHE_BYTES: usize = 24;

impl Schrift {
    /// Liest den eingebetteten Atlas; `None`, wenn er fehlt oder kaputt ist (dann gibt es keinen Text).
    pub fn eingebettet() -> Option<Schrift> {
        Schrift::aus(ATLAS)
    }

    pub fn aus(b: &'static [u8]) -> Option<Schrift> {
        if b.len() < 32 || &b[0..4] != b"HZS1" {
            return None;
        }
        let breite = u16_(b, 4) as u32;
        let hoehe = u16_(b, 6) as u32;
        let n = u32_(b, 28) as usize;
        let g0 = 32usize;
        let g1 = g0.checked_add(n.checked_mul(GLYPHE_BYTES)?)?;
        if b.len() < g1 + 4 {
            return None;
        }
        let k = u32_(b, g1) as usize;
        let k0 = g1 + 4;
        let k1 = k0.checked_add(k.checked_mul(12)?)?;
        let p1 = k1.checked_add(breite as usize * hoehe as usize)?;
        if b.len() < p1 {
            return None;
        }
        Some(Schrift {
            breite,
            hoehe,
            em: f32_(b, 8),
            spanne: f32_(b, 12),
            aufstieg: f32_(b, 16),
            abstieg: f32_(b, 20),
            zeilenluecke: f32_(b, 24),
            glyphen: &b[g0..g1],
            n,
            kern: &b[k0..k1],
            k,
            pixel: &b[k1..p1],
        })
    }

    fn glyphe_bei(&self, i: usize) -> Glyphe {
        let o = i * GLYPHE_BYTES;
        let g = self.glyphen;
        Glyphe {
            zeichen: u32_(g, o),
            vorschub: f32_(g, o + 4),
            links: f32_(g, o + 8),
            oben: f32_(g, o + 12),
            x: u16_(g, o + 16),
            y: u16_(g, o + 18),
            b: u16_(g, o + 20),
            h: u16_(g, o + 22),
        }
    }

    /// Glyphe zu einem Zeichen (binäre Suche); fehlt sie → `?`.
    pub fn glyphe(&self, c: u32) -> Option<Glyphe> {
        let (mut lo, mut hi) = (0usize, self.n);
        while lo < hi {
            let m = (lo + hi) / 2;
            let z = u32_(self.glyphen, m * GLYPHE_BYTES);
            if z == c {
                return Some(self.glyphe_bei(m));
            }
            if z < c {
                lo = m + 1;
            } else {
                hi = m;
            }
        }
        if c != '?' as u32 {
            self.glyphe('?' as u32)
        } else {
            None
        }
    }

    /// Unterschneidung zwischen zwei Zeichen (em).
    pub fn unterschneidung(&self, a: u32, b: u32) -> f32 {
        let (mut lo, mut hi) = (0usize, self.k);
        let ziel = ((a as u64) << 32) | b as u64;
        while lo < hi {
            let m = (lo + hi) / 2;
            let o = m * 12;
            let s = ((u32_(self.kern, o) as u64) << 32) | u32_(self.kern, o + 4) as u64;
            if s == ziel {
                return f32_(self.kern, o + 8);
            }
            if s < ziel {
                lo = m + 1;
            } else {
                hi = m;
            }
        }
        0.0
    }

    /// Zeilenhöhe in em.
    pub fn zeilenhoehe(&self) -> f32 {
        self.aufstieg - self.abstieg + self.zeilenluecke
    }
}

/// Ein gesetztes Zeichen: Rechteck in Spielfeld-Einheiten relativ zum Ankerpunkt (x, y = Oberkante) und Atlas-UV.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Satzstueck {
    pub x0: f32,
    pub y0: f32,
    pub x1: f32,
    pub y1: f32,
    pub u0: f32,
    pub v0: f32,
    pub u1: f32,
    pub v1: f32,
}

fn normalisiere(c: char) -> Option<u32> {
    match c {
        '\r' => None,
        '\t' => Some(' ' as u32),
        _ => Some(c as u32),
    }
}

fn zeilenbreite(s: &Schrift, zeile: &str) -> f32 {
    let mut w = 0.0f32;
    let mut vorher: Option<u32> = None;
    for c in zeile.chars() {
        let Some(c) = normalisiere(c) else { continue };
        if let Some(g) = s.glyphe(c) {
            if let Some(v) = vorher {
                w += s.unterschneidung(v, g.zeichen);
            }
            w += g.vorschub;
            vorher = Some(g.zeichen);
        }
    }
    w
}

/// Setzt `text` (mehrzeilig mit `\n`) in Größe `groesse` (Pixel je em) mit Ausrichtung 0 links · 1 mitte · 2 rechts.
pub fn setze(s: &Schrift, text: &str, groesse: f32, ausrichtung: u8, mut ausgabe: impl FnMut(Satzstueck)) {
    let k = groesse;
    let (ab, hb) = (1.0 / s.breite as f32, 1.0 / s.hoehe as f32);
    let px = 1.0 / s.em; // Atlas-Pixel → em
    for (zn, zeile) in text.split('\n').enumerate() {
        let w = zeilenbreite(s, zeile);
        let mut stift = match ausrichtung {
            1 => -w * 0.5,
            2 => -w,
            _ => 0.0,
        };
        let grund = s.aufstieg + zn as f32 * s.zeilenhoehe();
        let mut vorher: Option<u32> = None;
        for c in zeile.chars() {
            let Some(c) = normalisiere(c) else { continue };
            let Some(g) = s.glyphe(c) else { continue };
            if let Some(v) = vorher {
                stift += s.unterschneidung(v, g.zeichen);
            }
            if g.b > 0 && g.h > 0 {
                let x0 = stift + g.links;
                let y0 = grund - g.oben;
                ausgabe(Satzstueck {
                    x0: x0 * k,
                    y0: y0 * k,
                    x1: (x0 + g.b as f32 * px) * k,
                    y1: (y0 + g.h as f32 * px) * k,
                    u0: g.x as f32 * ab,
                    v0: g.y as f32 * hb,
                    u1: (g.x as f32 + g.b as f32) * ab,
                    v1: (g.y as f32 + g.h as f32) * hb,
                });
            }
            stift += g.vorschub;
            vorher = Some(g.zeichen);
        }
    }
}
