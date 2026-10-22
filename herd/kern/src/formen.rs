//! 3D-Formen: Grundformen aus Parametern, eigene Formen flach/glatt. Ergebnis: Netz (Ecken + Indizes).
//! Vorderseite = gegen den Uhrzeigersinn; Grundformen haben Größe 1 um den Ursprung.

use alloc::vec::Vec;

use crate::lesen::FormDaten;
use crate::liste::Schreibe;
use crate::mathe::*;

#[derive(Clone, Debug)]
pub struct Netz {
    pub version: u32,
    /// Ecken: je 8 × f32 (Position, Normale, UV), Little Endian.
    pub ecken: Vec<u8>,
    /// Indizes: u32 Little Endian.
    pub indizes: Vec<u8>,
    pub ecken_anzahl: u32,
    pub index_anzahl: u32,
    pub min: V3,
    pub max: V3,
}

struct Bau {
    e: Vec<[f32; 8]>,
    i: Vec<u32>,
}

impl Bau {
    fn neu() -> Self {
        Bau { e: Vec::new(), i: Vec::new() }
    }
    fn ecke(&mut self, p: V3, n: V3, u: f32, v: f32) -> u32 {
        self.e.push([p.x, p.y, p.z, n.x, n.y, n.z, u, v]);
        (self.e.len() - 1) as u32
    }
    fn drei(&mut self, a: u32, b: u32, c: u32) {
        self.i.extend_from_slice(&[a, b, c]);
    }
    fn fertig(self) -> Netz {
        let mut ecken = Vec::with_capacity(self.e.len() * 32);
        let mut mi = V3::neu(f32::MAX, f32::MAX, f32::MAX);
        let mut ma = V3::neu(f32::MIN, f32::MIN, f32::MIN);
        for e in &self.e {
            ecken.f32s(e);
            let p = V3::neu(fin(e[0]), fin(e[1]), fin(e[2]));
            mi = mi.min(p);
            ma = ma.max(p);
        }
        if self.e.is_empty() {
            mi = V3::default();
            ma = V3::default();
        }
        let mut indizes = Vec::with_capacity(self.i.len() * 4);
        for x in &self.i {
            indizes.u32(*x);
        }
        Netz {
            version: 0,
            ecken_anzahl: self.e.len() as u32,
            index_anzahl: self.i.len() as u32,
            ecken,
            indizes,
            min: mi,
            max: ma,
        }
    }
}

fn wuerfel() -> Netz {
    let mut b = Bau::neu();
    let seiten: [(V3, V3, V3); 6] = [
        (V3::neu(1.0, 0.0, 0.0), V3::neu(0.0, 0.0, -1.0), V3::neu(0.0, 1.0, 0.0)),
        (V3::neu(-1.0, 0.0, 0.0), V3::neu(0.0, 0.0, 1.0), V3::neu(0.0, 1.0, 0.0)),
        (V3::neu(0.0, 1.0, 0.0), V3::neu(1.0, 0.0, 0.0), V3::neu(0.0, 0.0, -1.0)),
        (V3::neu(0.0, -1.0, 0.0), V3::neu(1.0, 0.0, 0.0), V3::neu(0.0, 0.0, 1.0)),
        (V3::neu(0.0, 0.0, 1.0), V3::neu(1.0, 0.0, 0.0), V3::neu(0.0, 1.0, 0.0)),
        (V3::neu(0.0, 0.0, -1.0), V3::neu(-1.0, 0.0, 0.0), V3::neu(0.0, 1.0, 0.0)),
    ];
    for (n, u, v) in seiten {
        let c = n.mal(0.5);
        let (hu, hv) = (u.mal(0.5), v.mal(0.5));
        let a = b.ecke(c.minus(hu).minus(hv), n, 0.0, 1.0);
        let bb = b.ecke(c.plus(hu).minus(hv), n, 1.0, 1.0);
        let cc = b.ecke(c.plus(hu).plus(hv), n, 1.0, 0.0);
        let d = b.ecke(c.minus(hu).plus(hv), n, 0.0, 0.0);
        b.drei(a, bb, cc);
        b.drei(a, cc, d);
    }
    b.fertig()
}

fn kugel(teile: u32) -> Netz {
    let seg = teile;
    let ringe = if teile / 2 < 2 { 2 } else { teile / 2 };
    let mut b = Bau::neu();
    for r in 0..=ringe {
        let phi = PI * r as f32 / ringe as f32;
        let (y, rr) = (cos(phi), sin(phi));
        for s in 0..=seg {
            let th = 2.0 * PI * s as f32 / seg as f32;
            let n = V3::neu(rr * sin(th), y, rr * cos(th));
            b.ecke(n.mal(0.5), n, s as f32 / seg as f32, r as f32 / ringe as f32);
        }
    }
    let w = seg + 1;
    for r in 0..ringe {
        for s in 0..seg {
            let a = r * w + s;
            let bb = (r + 1) * w + s;
            let c = (r + 1) * w + s + 1;
            let d = r * w + s + 1;
            if r != ringe - 1 {
                b.drei(a, bb, c);
            }
            if r != 0 {
                b.drei(a, c, d);
            }
        }
    }
    b.fertig()
}

/// Deckel bei Höhe `y` (Normale nach oben, wenn `oben`).
fn deckel(b: &mut Bau, seg: u32, y: f32, oben: bool) {
    let n = V3::neu(0.0, if oben { 1.0 } else { -1.0 }, 0.0);
    let m = b.ecke(V3::neu(0.0, y, 0.0), n, 0.5, 0.5);
    let start = b.e.len() as u32;
    for s in 0..=seg {
        let th = 2.0 * PI * s as f32 / seg as f32;
        let (x, z) = (0.5 * sin(th), 0.5 * cos(th));
        b.ecke(V3::neu(x, y, z), n, x + 0.5, if oben { z + 0.5 } else { 0.5 - z });
    }
    for s in 0..seg {
        if oben {
            b.drei(m, start + s, start + s + 1);
        } else {
            b.drei(m, start + s + 1, start + s);
        }
    }
}

fn zylinder(teile: u32) -> Netz {
    let seg = teile;
    let mut b = Bau::neu();
    let start = b.e.len() as u32;
    for s in 0..=seg {
        let th = 2.0 * PI * s as f32 / seg as f32;
        let n = V3::neu(sin(th), 0.0, cos(th));
        let u = s as f32 / seg as f32;
        b.ecke(V3::neu(n.x * 0.5, 0.5, n.z * 0.5), n, u, 0.0);
        b.ecke(V3::neu(n.x * 0.5, -0.5, n.z * 0.5), n, u, 1.0);
    }
    for s in 0..seg {
        let a = start + 2 * s;
        let bb = a + 1;
        let c = a + 3;
        let d = a + 2;
        b.drei(a, bb, c);
        b.drei(a, c, d);
    }
    deckel(&mut b, seg, 0.5, true);
    deckel(&mut b, seg, -0.5, false);
    b.fertig()
}

fn kegel(teile: u32) -> Netz {
    let seg = teile;
    let mut b = Bau::neu();
    let neig = |th: f32| V3::neu(sin(th), 0.5, cos(th)).norm_oder(V3::neu(0.0, 1.0, 0.0));
    for s in 0..seg {
        let t0 = 2.0 * PI * s as f32 / seg as f32;
        let t1 = 2.0 * PI * (s + 1) as f32 / seg as f32;
        let tm = (t0 + t1) * 0.5;
        let u0 = s as f32 / seg as f32;
        let u1 = (s + 1) as f32 / seg as f32;
        let spitze = b.ecke(V3::neu(0.0, 0.5, 0.0), neig(tm), (u0 + u1) * 0.5, 0.0);
        let a = b.ecke(V3::neu(0.5 * sin(t0), -0.5, 0.5 * cos(t0)), neig(t0), u0, 1.0);
        let c = b.ecke(V3::neu(0.5 * sin(t1), -0.5, 0.5 * cos(t1)), neig(t1), u1, 1.0);
        b.drei(spitze, a, c);
    }
    deckel(&mut b, seg, -0.5, false);
    b.fertig()
}

fn ebene() -> Netz {
    let mut b = Bau::neu();
    let n = V3::neu(0.0, 1.0, 0.0);
    let a = b.ecke(V3::neu(-0.5, 0.0, 0.5), n, 0.0, 1.0);
    let bb = b.ecke(V3::neu(0.5, 0.0, 0.5), n, 1.0, 1.0);
    let c = b.ecke(V3::neu(0.5, 0.0, -0.5), n, 1.0, 0.0);
    let d = b.ecke(V3::neu(-0.5, 0.0, -0.5), n, 0.0, 0.0);
    b.drei(a, bb, c);
    b.drei(a, c, d);
    b.fertig()
}

fn ring(teile: u32, dicke: f32) -> Netz {
    let r = klemme(dicke, 0.05, 0.9) * 0.5;
    let gr = 0.5 - r;
    let n = teile;
    let m = if teile / 2 < 3 { 3 } else { teile / 2 };
    let mut b = Bau::neu();
    let oben = V3::neu(0.0, 1.0, 0.0);
    for i in 0..=n {
        let th = 2.0 * PI * i as f32 / n as f32;
        let d = V3::neu(sin(th), 0.0, cos(th));
        for j in 0..=m {
            let ph = 2.0 * PI * j as f32 / m as f32;
            let nn = d.mal(cos(ph)).plus(oben.mal(sin(ph)));
            let p = d.mal(gr).plus(nn.mal(r));
            b.ecke(p, nn, i as f32 / n as f32, j as f32 / m as f32);
        }
    }
    let w = m + 1;
    for i in 0..n {
        for j in 0..m {
            let a = i * w + j;
            let bb = (i + 1) * w + j;
            let c = (i + 1) * w + j + 1;
            let d = i * w + j + 1;
            b.drei(a, bb, c);
            b.drei(a, c, d);
        }
    }
    b.fertig()
}

/// UV aus der Position per Würfel-Projektion (nach der dominanten Achse der Normale).
fn uv_kasten(p: V3, n: V3) -> (f32, f32) {
    let (ax, ay, az) = (betrag(n.x), betrag(n.y), betrag(n.z));
    if ay >= ax && ay >= az {
        (p.x + 0.5, 0.5 - p.z * if n.y < 0.0 { -1.0 } else { 1.0 })
    } else if ax >= az {
        (0.5 - p.z * if n.x < 0.0 { -1.0 } else { 1.0 }, 0.5 - p.y)
    } else {
        (p.x * if n.z < 0.0 { -1.0 } else { 1.0 } + 0.5, 0.5 - p.y)
    }
}

fn eigene(punkte: &[f32], dreiecke: &[u32], glatt: bool) -> Netz {
    let pk = |i: u32| {
        let k = i as usize * 3;
        V3::neu(punkte[k], punkte[k + 1], punkte[k + 2])
    };
    let mut b = Bau::neu();
    let oben = V3::neu(0.0, 1.0, 0.0);
    if glatt {
        let n = punkte.len() / 3;
        let mut nor = alloc::vec![V3::default(); n];
        for t in dreiecke.chunks_exact(3) {
            let (a, bb, c) = (pk(t[0]), pk(t[1]), pk(t[2]));
            let f = bb.minus(a).kreuz(c.minus(a));
            for &k in t {
                nor[k as usize] = nor[k as usize].plus(f);
            }
        }
        for (k, nn) in nor.iter().enumerate() {
            let p = pk(k as u32);
            let nn = nn.norm_oder(oben);
            let (u, v) = uv_kasten(p, nn);
            b.ecke(p, nn, u, v);
        }
        for t in dreiecke.chunks_exact(3) {
            b.drei(t[0], t[1], t[2]);
        }
    } else {
        for t in dreiecke.chunks_exact(3) {
            let (a, bb, c) = (pk(t[0]), pk(t[1]), pk(t[2]));
            let nn = bb.minus(a).kreuz(c.minus(a)).norm_oder(oben);
            let mut k = [0u32; 3];
            for (j, p) in [a, bb, c].into_iter().enumerate() {
                let (u, v) = uv_kasten(p, nn);
                k[j] = b.ecke(p, nn, u, v);
            }
            b.drei(k[0], k[1], k[2]);
        }
    }
    b.fertig()
}

/// Netz aus einer `form`-Nachricht.
pub fn netz_aus(f: &FormDaten) -> Netz {
    let teile = if f.teile < 3 {
        3
    } else if f.teile > 128 {
        128
    } else {
        f.teile
    };
    match f.art {
        0 => eigene(&f.punkte, &f.dreiecke, f.glatt),
        1 => wuerfel(),
        2 => kugel(teile),
        3 => zylinder(teile),
        4 => kegel(teile),
        5 => ebene(),
        _ => ring(teile, f.dicke),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lies(n: &Netz) -> (Vec<[f32; 8]>, Vec<u32>) {
        let e = n
            .ecken
            .chunks_exact(32)
            .map(|c| {
                let mut a = [0f32; 8];
                for (k, x) in a.iter_mut().enumerate() {
                    *x = f32::from_le_bytes([c[k * 4], c[k * 4 + 1], c[k * 4 + 2], c[k * 4 + 3]]);
                }
                a
            })
            .collect();
        let i = n.indizes.chunks_exact(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
        (e, i)
    }

    /// Jede Dreiecksnormale (Windung) zeigt in Richtung der Eckennormalen (außen).
    fn pruefe_windung(n: &Netz) {
        let (e, i) = lies(n);
        for t in i.chunks_exact(3) {
            let p = |k: u32| V3::neu(e[k as usize][0], e[k as usize][1], e[k as usize][2]);
            let nn = |k: u32| V3::neu(e[k as usize][3], e[k as usize][4], e[k as usize][5]);
            let f = p(t[1]).minus(p(t[0])).kreuz(p(t[2]).minus(p(t[0])));
            if f.laenge() < 1e-9 {
                continue;
            }
            let summe = nn(t[0]).plus(nn(t[1])).plus(nn(t[2]));
            assert!(f.punkt(summe) > 0.0, "Dreieck {:?} falsch herum", t);
        }
    }

    #[test]
    fn grundformen_windung_und_groesse() {
        for art in 1..=6u8 {
            let f = FormDaten { id: 1, art, teile: 16, dicke: 0.3, glatt: false, punkte: Vec::new(), dreiecke: Vec::new() };
            let n = netz_aus(&f);
            pruefe_windung(&n);
            assert!(n.max.x <= 0.5001 && n.min.x >= -0.5001, "Art {} zu groß", art);
            assert!(n.index_anzahl % 3 == 0 && n.index_anzahl > 0);
        }
    }

    #[test]
    fn eigene_form_flach_und_glatt() {
        // Tetraeder
        let p = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
        let d = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3];
        let flach = eigene(&p, &d, false);
        assert_eq!(flach.ecken_anzahl, 12);
        let glatt = eigene(&p, &d, true);
        assert_eq!(glatt.ecken_anzahl, 4);
        assert_eq!(glatt.index_anzahl, 12);
    }
}
