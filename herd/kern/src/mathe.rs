//! Kleine, deterministische Mathematik (nur `libm`, keine FMA, eigene min/max ohne ±0-Mehrdeutigkeit).

pub const PI: f32 = core::f32::consts::PI;

#[inline]
pub fn sin(x: f32) -> f32 {
    libm::sinf(x)
}
#[inline]
pub fn cos(x: f32) -> f32 {
    libm::cosf(x)
}
#[inline]
pub fn tan(x: f32) -> f32 {
    libm::tanf(x)
}
#[inline]
pub fn acos(x: f32) -> f32 {
    libm::acosf(x)
}
#[inline]
pub fn wurzel(x: f32) -> f32 {
    libm::sqrtf(x)
}
#[inline]
pub fn boden(x: f32) -> f32 {
    libm::floorf(x)
}
#[inline]
pub fn decke(x: f32) -> f32 {
    libm::ceilf(x)
}
#[inline]
pub fn potenz(x: f32, y: f32) -> f32 {
    libm::powf(x, y)
}
#[inline]
pub fn log2(x: f32) -> f32 {
    libm::log2f(x)
}
#[inline]
pub fn exp2(x: f32) -> f32 {
    libm::exp2f(x)
}
#[inline]
pub fn betrag(x: f32) -> f32 {
    if x < 0.0 {
        -x
    } else {
        x
    }
}
#[inline]
pub fn min(a: f32, b: f32) -> f32 {
    if b < a {
        b
    } else {
        a
    }
}
#[inline]
pub fn max(a: f32, b: f32) -> f32 {
    if b > a {
        b
    } else {
        a
    }
}
#[inline]
pub fn klemme(x: f32, lo: f32, hi: f32) -> f32 {
    if x < lo {
        lo
    } else if x > hi {
        hi
    } else {
        x
    }
}
/// Nicht endlich → 0; −0 → +0 (damit die Bytes nativ und in Wasm gleich sind).
#[inline]
pub fn fin(x: f32) -> f32 {
    if x.is_finite() && x != 0.0 {
        x
    } else {
        0.0
    }
}
/// Grad → Bogenmaß.
#[inline]
pub fn bogen(grad: f32) -> f32 {
    grad * (PI / 180.0)
}
/// Rundet auf die nächste ganze Zahl (halbe nach oben), deterministisch.
#[inline]
pub fn runde(x: f32) -> f32 {
    boden(x + 0.5)
}

/// sRGB-Byte → linearer Wert.
pub fn srgb_linear(b: u8) -> f32 {
    let c = b as f32 / 255.0;
    if c <= 0.04045 {
        c / 12.92
    } else {
        potenz((c + 0.055) / 1.055, 2.4)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct V3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl V3 {
    pub const fn neu(x: f32, y: f32, z: f32) -> V3 {
        V3 { x, y, z }
    }
    pub fn plus(self, o: V3) -> V3 {
        V3::neu(self.x + o.x, self.y + o.y, self.z + o.z)
    }
    pub fn minus(self, o: V3) -> V3 {
        V3::neu(self.x - o.x, self.y - o.y, self.z - o.z)
    }
    pub fn mal(self, s: f32) -> V3 {
        V3::neu(self.x * s, self.y * s, self.z * s)
    }
    pub fn punkt(self, o: V3) -> f32 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }
    pub fn kreuz(self, o: V3) -> V3 {
        V3::neu(
            self.y * o.z - self.z * o.y,
            self.z * o.x - self.x * o.z,
            self.x * o.y - self.y * o.x,
        )
    }
    pub fn laenge(self) -> f32 {
        wurzel(self.punkt(self))
    }
    /// Normiert; Nullvektor → `ersatz`.
    pub fn norm_oder(self, ersatz: V3) -> V3 {
        let l = self.laenge();
        if l > 1e-20 && l.is_finite() {
            self.mal(1.0 / l)
        } else {
            ersatz
        }
    }
    pub fn min(self, o: V3) -> V3 {
        V3::neu(min(self.x, o.x), min(self.y, o.y), min(self.z, o.z))
    }
    pub fn max(self, o: V3) -> V3 {
        V3::neu(max(self.x, o.x), max(self.y, o.y), max(self.z, o.z))
    }
}

/// 4×4-Matrix, spaltenweise gespeichert (`m[spalte * 4 + zeile]`) wie WGSL/GLSL `mat4x4`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct M4 {
    pub m: [f32; 16],
}

impl M4 {
    pub const EINS: M4 = M4 {
        m: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0],
    };

    #[inline]
    pub fn get(&self, zeile: usize, spalte: usize) -> f32 {
        self.m[spalte * 4 + zeile]
    }
    #[inline]
    pub fn set(&mut self, zeile: usize, spalte: usize, w: f32) {
        self.m[spalte * 4 + zeile] = w;
    }

    /// self · o (feste Summationsreihenfolge).
    pub fn mal(&self, o: &M4) -> M4 {
        let mut r = M4 { m: [0.0; 16] };
        for s in 0..4 {
            for z in 0..4 {
                let v = self.get(z, 0) * o.get(0, s)
                    + self.get(z, 1) * o.get(1, s)
                    + self.get(z, 2) * o.get(2, s)
                    + self.get(z, 3) * o.get(3, s);
                r.set(z, s, v);
            }
        }
        r
    }

    /// Punkt (w = 1) transformieren → (x, y, z, w).
    pub fn punkt4(&self, p: V3) -> [f32; 4] {
        let mut r = [0.0f32; 4];
        for (z, rz) in r.iter_mut().enumerate() {
            *rz = self.get(z, 0) * p.x + self.get(z, 1) * p.y + self.get(z, 2) * p.z + self.get(z, 3);
        }
        r
    }
    pub fn punkt(&self, p: V3) -> V3 {
        let r = self.punkt4(p);
        V3::neu(r[0], r[1], r[2])
    }

    pub fn verschiebung(t: V3) -> M4 {
        let mut r = M4::EINS;
        r.set(0, 3, t.x);
        r.set(1, 3, t.y);
        r.set(2, 3, t.z);
        r
    }
    pub fn skalierung(s: V3) -> M4 {
        let mut r = M4::EINS;
        r.set(0, 0, s.x);
        r.set(1, 1, s.y);
        r.set(2, 2, s.z);
        r
    }
    /// Drehung um x (rechte Hand), Bogenmaß.
    pub fn dreh_x(a: f32) -> M4 {
        let (s, c) = (sin(a), cos(a));
        let mut r = M4::EINS;
        r.set(1, 1, c);
        r.set(1, 2, -s);
        r.set(2, 1, s);
        r.set(2, 2, c);
        r
    }
    pub fn dreh_y(a: f32) -> M4 {
        let (s, c) = (sin(a), cos(a));
        let mut r = M4::EINS;
        r.set(0, 0, c);
        r.set(0, 2, s);
        r.set(2, 0, -s);
        r.set(2, 2, c);
        r
    }
    pub fn dreh_z(a: f32) -> M4 {
        let (s, c) = (sin(a), cos(a));
        let mut r = M4::EINS;
        r.set(0, 0, c);
        r.set(0, 1, -s);
        r.set(1, 0, s);
        r.set(1, 1, c);
        r
    }

    /// Rechtshändige Ansichtsmatrix (Kamera blickt entlang −z).
    pub fn blick(auge: V3, ziel: V3, oben: V3) -> M4 {
        let f = ziel.minus(auge).norm_oder(V3::neu(0.0, 0.0, -1.0));
        let mut o = oben;
        if betrag(f.punkt(o.norm_oder(V3::neu(0.0, 1.0, 0.0)))) > 0.999 {
            o = if betrag(f.y) > 0.5 { V3::neu(0.0, 0.0, -1.0) } else { V3::neu(0.0, 1.0, 0.0) };
        }
        let s = f.kreuz(o).norm_oder(V3::neu(1.0, 0.0, 0.0));
        let u = s.kreuz(f);
        let mut r = M4::EINS;
        r.set(0, 0, s.x);
        r.set(0, 1, s.y);
        r.set(0, 2, s.z);
        r.set(1, 0, u.x);
        r.set(1, 1, u.y);
        r.set(1, 2, u.z);
        r.set(2, 0, -f.x);
        r.set(2, 1, -f.y);
        r.set(2, 2, -f.z);
        r.set(0, 3, -s.punkt(auge));
        r.set(1, 3, -u.punkt(auge));
        r.set(2, 3, f.punkt(auge));
        r
    }

    /// Perspektive, rechtshändig, Tiefe 0 (nah) … 1 (fern) wie wgpu/WebGPU.
    pub fn perspektive(sicht_bogen: f32, seiten: f32, nah: f32, fern: f32) -> M4 {
        let f = 1.0 / tan(sicht_bogen * 0.5);
        let mut r = M4 { m: [0.0; 16] };
        r.set(0, 0, f / seiten);
        r.set(1, 1, f);
        r.set(2, 2, fern / (nah - fern));
        r.set(2, 3, nah * fern / (nah - fern));
        r.set(3, 2, -1.0);
        r
    }

    /// Orthografisch, rechtshändig, Tiefe 0 … 1; `nah`/`fern` als Abstände entlang −z.
    pub fn ortho(l: f32, r_: f32, u: f32, o: f32, nah: f32, fern: f32) -> M4 {
        let mut r = M4::EINS;
        r.set(0, 0, 2.0 / (r_ - l));
        r.set(1, 1, 2.0 / (o - u));
        r.set(2, 2, 1.0 / (nah - fern));
        r.set(0, 3, -(r_ + l) / (r_ - l));
        r.set(1, 3, -(o + u) / (o - u));
        r.set(2, 3, nah / (nah - fern));
        r
    }

    /// Spalten 0..2 der Kofaktormatrix des oberen 3×3-Blocks (∝ inverse Transponierte), Vorzeichen so,
    /// dass gespiegelte Matrizen die Normalen nicht umdrehen. Ohne Division.
    pub fn normalen_matrix(&self) -> [V3; 3] {
        let c0 = V3::neu(self.get(0, 0), self.get(1, 0), self.get(2, 0));
        let c1 = V3::neu(self.get(0, 1), self.get(1, 1), self.get(2, 1));
        let c2 = V3::neu(self.get(0, 2), self.get(1, 2), self.get(2, 2));
        let mut n = [c1.kreuz(c2), c2.kreuz(c0), c0.kreuz(c1)];
        let det = c0.punkt(n[0]);
        if det < 0.0 {
            for v in n.iter_mut() {
                *v = v.mal(-1.0);
            }
        }
        // grob normieren, damit die Werte im f32-Bereich gut liegen
        let gross = max(max(n[0].laenge(), n[1].laenge()), n[2].laenge());
        if gross > 1e-30 && gross.is_finite() {
            let k = 1.0 / gross;
            for v in n.iter_mut() {
                *v = v.mal(k);
            }
        }
        n
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nah(a: f32, b: f32) -> bool {
        betrag(a - b) < 1e-5
    }

    #[test]
    fn blick_und_perspektive() {
        let v = M4::blick(V3::neu(0.0, 0.0, 5.0), V3::neu(0.0, 0.0, 0.0), V3::neu(0.0, 1.0, 0.0));
        let p = v.punkt(V3::neu(0.0, 0.0, 0.0));
        assert!(nah(p.z, -5.0));
        let pr = M4::perspektive(bogen(90.0), 1.0, 1.0, 10.0);
        let a = pr.punkt4(V3::neu(0.0, 0.0, -1.0));
        assert!(nah(a[2] / a[3], 0.0));
        let b = pr.punkt4(V3::neu(0.0, 0.0, -10.0));
        assert!(nah(b[2] / b[3], 1.0));
        let c = pr.punkt4(V3::neu(1.0, 1.0, -1.0));
        assert!(nah(c[0] / c[3], 1.0) && nah(c[1] / c[3], 1.0));
    }

    #[test]
    fn ortho_tiefe() {
        let o = M4::ortho(-1.0, 1.0, -2.0, 2.0, 1.0, 11.0);
        let a = o.punkt(V3::neu(1.0, 2.0, -1.0));
        assert!(nah(a.x, 1.0) && nah(a.y, 1.0) && nah(a.z, 0.0));
        let b = o.punkt(V3::neu(-1.0, -2.0, -11.0));
        assert!(nah(b.x, -1.0) && nah(b.y, -1.0) && nah(b.z, 1.0));
    }

    #[test]
    fn drehungen_rechte_hand() {
        let p = M4::dreh_y(bogen(90.0)).punkt(V3::neu(1.0, 0.0, 0.0));
        assert!(nah(p.x, 0.0) && nah(p.z, -1.0));
        let q = M4::dreh_z(bogen(90.0)).punkt(V3::neu(1.0, 0.0, 0.0));
        assert!(nah(q.y, 1.0));
    }

    #[test]
    fn normalenmatrix_skaliert() {
        let m = M4::skalierung(V3::neu(2.0, 1.0, 1.0));
        let n = m.normalen_matrix();
        // Normale (1,1,0)/√2 einer schrägen Fläche: nach Skalierung x×2 kippt sie zu y
        let nn = n[0].mal(1.0).plus(n[1].mal(1.0));
        assert!(nn.y > nn.x);
        let g = M4::skalierung(V3::neu(-1.0, 1.0, 1.0)).normalen_matrix();
        assert!(g[1].y > 0.0);
    }

    #[test]
    fn fin_macht_null() {
        assert_eq!(fin(f32::NAN).to_bits(), 0);
        assert_eq!(fin(-0.0).to_bits(), 0);
        assert_eq!(fin(f32::INFINITY), 0.0);
    }
}
