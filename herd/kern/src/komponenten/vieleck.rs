//! `Vieleck` (2D, H-K3b): gefülltes einfaches Vieleck aus `punkte` (`[x1, y1, x2, y2, …]` relativ zum Teil, 3 … 256 Punkte) oder
//! mit `umriss > 0` nur ein Rand dieser Dicke nach innen (wie `Rechteck`). Unity: SpriteShape bzw. gefülltes 2D-Polygon.
//!
//! Der Kern zerlegt das Vieleck per **Ohrenschneiden ab Punkt 0** in Dreiecke (nur Vorzeichen-Tests in f64, keine Toleranz) und
//! legt sie als 2D-Art `DREIECK` in den vorhandenen INST2D-Strom (ein Draw-Call mit allen anderen 2D-Instanzen). Die Zerlegung
//! wird im Nachlauf gecacht (verborgene Puffer `quelle` = Punkte zur Zeit der Zerlegung, `netz` = Ergebnis) und nur neu
//! berechnet, wenn sich `punkte` bitweise geändert hat; ist der Cache veraltet (Bild ohne Takt seit der Änderung), rechnet der
//! Bildbeitrag dasselbe Ergebnis ohne zu speichern.
//!
//! Ungültig (ungerade Länge, weniger als 3 oder mehr als 256 Punkte, nicht endliche Werte, Fläche 0, Spitze zurück auf der
//! eigenen Kante oder selbstschneidend bzw. sich berührend) → es wird nichts gezeichnet, kein Fehler (HERD.md §12.4 H-K3b).

use alloc::vec::Vec;

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const PUNKTE: usize = 0;
pub const FARBE: usize = 1;
pub const UMRISS: usize = 2;
/// verborgen: Kopie von `punkte` zur Zeit der letzten Zerlegung
pub const QUELLE: usize = 3;
/// verborgen: Zerlegung `[k, ring_0 … ring_{k−1}, (a, b, c, maske) …]`, leer = ungültig
pub const NETZ: usize = 4;

/// Höchstzahl der Punkte.
pub const MAX_PUNKTE: usize = 256;
/// Gehrung des Umrisses: höchstens so viele Umrissdicken weit von der Ecke (spitze Ecken werden gekappt).
pub const GEHRUNG_GRENZE: f64 = 4.0;

pub static ART: Art = Art {
    schema: Schema {
        name: "Vieleck",
        genus: Genus::N,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::zahl_liste("punkte"),
            Feld::farbe("farbe", "weiss"),
            Feld::zahl("umriss", 0.0).min(0.0),
            Feld::puffer("quelle"),
            Feld::puffer("netz"),
        ],
    },
    nachlauf: Some(nachlauf),
    bild: Some(bild),
    huelle: Some(huelle),
    ..Art::LEER
};

/// Zerlegung eines Vielecks: bereinigter Umlauf (Punktindizes; doppelte Folgepunkte und Punkte auf der Geraden ihrer Nachbarn
/// entfernt) und Dreiecke als Punktindizes `a, b, c` mit Kantenmaske (Bit 0 = a→b, Bit 1 = b→c, Bit 2 = c→a ist Außenkante).
#[derive(Clone, Debug, PartialEq)]
pub struct Netz {
    pub ring: Vec<u32>,
    pub dreiecke: Vec<[u32; 4]>,
}

#[inline]
fn pt(p: &[f64], i: u32) -> (f64, f64) {
    (p[2 * i as usize], p[2 * i as usize + 1])
}

/// Doppelte Fläche des Dreiecks a, b, c mit Vorzeichen (> 0 = gegen den Uhrzeigersinn im mathematischen Sinn).
#[inline]
fn kreuz(a: (f64, f64), b: (f64, f64), c: (f64, f64)) -> f64 {
    (b.0 - a.0) * (c.1 - a.1) - (b.1 - a.1) * (c.0 - a.0)
}

#[inline]
fn vorzeichen(x: f64) -> i32 {
    if x > 0.0 {
        1
    } else if x < 0.0 {
        -1
    } else {
        0
    }
}

/// Liegt `q` (kollinear mit a, b) im achsenparallelen Rechteck der Strecke a–b?
#[inline]
fn auf_strecke(a: (f64, f64), b: (f64, f64), q: (f64, f64)) -> bool {
    let (x0, x1) = if a.0 < b.0 { (a.0, b.0) } else { (b.0, a.0) };
    let (y0, y1) = if a.1 < b.1 { (a.1, b.1) } else { (b.1, a.1) };
    q.0 >= x0 && q.0 <= x1 && q.1 >= y0 && q.1 <= y1
}

/// Schneiden oder berühren sich die Strecken a–b und c–d (Ränder zählen)?
fn schneiden(a: (f64, f64), b: (f64, f64), c: (f64, f64), d: (f64, f64)) -> bool {
    let d1 = vorzeichen(kreuz(a, b, c));
    let d2 = vorzeichen(kreuz(a, b, d));
    let d3 = vorzeichen(kreuz(c, d, a));
    let d4 = vorzeichen(kreuz(c, d, b));
    if d1 * d2 < 0 && d3 * d4 < 0 {
        return true;
    }
    (d1 == 0 && auf_strecke(a, b, c))
        || (d2 == 0 && auf_strecke(a, b, d))
        || (d3 == 0 && auf_strecke(c, d, a))
        || (d4 == 0 && auf_strecke(c, d, b))
}

/// Zerlegt `punkte` (`[x1, y1, …]`) in Dreiecke; `None` = ungültig (wird nicht gezeichnet). Deterministisch: feste Startecke
/// (Punkt 0), feste Suchreihenfolge, nur Vorzeichen-Tests in f64.
pub fn zerlege(punkte: &[f64]) -> Option<Netz> {
    if punkte.len() % 2 != 0 {
        return None;
    }
    let n = punkte.len() / 2;
    if !(3..=MAX_PUNKTE).contains(&n) || !punkte.iter().all(|x| x.is_finite()) {
        return None;
    }
    // 1. doppelte Folgepunkte weg (Punkt 0 bleibt)
    let mut ring: Vec<u32> = Vec::with_capacity(n);
    for i in 0..n as u32 {
        if ring.last().is_some_and(|&l| pt(punkte, l) == pt(punkte, i)) {
            continue;
        }
        ring.push(i);
    }
    while ring.len() > 1 && pt(punkte, ring[ring.len() - 1]) == pt(punkte, ring[0]) {
        ring.pop();
    }
    // 2. Punkte auf der Geraden ihrer Nachbarn weg; eine Spitze zurück (Kante läuft auf sich selbst) ist ungültig
    let mut weiter = true;
    while weiter && ring.len() >= 3 {
        weiter = false;
        let mut j = 0;
        while j < ring.len() && ring.len() >= 3 {
            let m = ring.len();
            let (p, v, q) = (pt(punkte, ring[(j + m - 1) % m]), pt(punkte, ring[j]), pt(punkte, ring[(j + 1) % m]));
            if kreuz(p, v, q) == 0.0 {
                if (p.0 - v.0) * (q.0 - v.0) + (p.1 - v.1) * (q.1 - v.1) > 0.0 {
                    return None;
                }
                ring.remove(j);
                weiter = true;
            } else {
                j += 1;
            }
        }
    }
    let m = ring.len();
    if m < 3 {
        return None;
    }
    // 3. einfach: keine zwei nicht benachbarten Kanten schneiden oder berühren sich
    for i in 0..m {
        let (a, b) = (pt(punkte, ring[i]), pt(punkte, ring[(i + 1) % m]));
        for j in i + 2..m {
            if i == 0 && j == m - 1 {
                continue;
            }
            if schneiden(a, b, pt(punkte, ring[j]), pt(punkte, ring[(j + 1) % m])) {
                return None;
            }
        }
    }
    // 4. Umlaufsinn
    let mut flaeche = 0.0;
    for i in 0..m {
        let (a, b) = (pt(punkte, ring[i]), pt(punkte, ring[(i + 1) % m]));
        flaeche += a.0 * b.1 - b.0 * a.1;
    }
    let s = if flaeche > 0.0 {
        1.0
    } else if flaeche < 0.0 {
        -1.0
    } else {
        return None;
    };
    // 5. Ohrenschneiden ab Punkt 0; `rand[k]` = Kante v[k] → v[k+1] ist Außenkante
    let mut v = ring.clone();
    let mut rand: Vec<bool> = alloc::vec![true; m];
    let mut dreiecke: Vec<[u32; 4]> = Vec::with_capacity(m - 2);
    let mut k = 0usize;
    let mut fehl = 0usize;
    while v.len() > 3 {
        let l = v.len();
        let (ip, iq) = ((k + l - 1) % l, (k + 1) % l);
        let (p, c, q) = (pt(punkte, v[ip]), pt(punkte, v[k]), pt(punkte, v[iq]));
        let mut ohr = s * kreuz(p, c, q) > 0.0;
        if ohr {
            for (i, &r) in v.iter().enumerate() {
                if i == ip || i == k || i == iq {
                    continue;
                }
                let r = pt(punkte, r);
                if s * kreuz(p, c, r) >= 0.0 && s * kreuz(c, q, r) >= 0.0 && s * kreuz(q, p, r) >= 0.0 {
                    ohr = false;
                    break;
                }
            }
        }
        if ohr {
            let maske = (rand[ip] as u32) | (rand[k] as u32) << 1;
            dreiecke.push([v[ip], v[k], v[iq], maske]);
            rand[ip] = false;
            v.remove(k);
            rand.remove(k);
            if k >= v.len() {
                k = 0;
            }
            fehl = 0;
        } else {
            k = (k + 1) % l;
            fehl += 1;
            if fehl > l {
                return None;
            }
        }
    }
    let maske = (rand[0] as u32) | (rand[1] as u32) << 1 | (rand[2] as u32) << 2;
    dreiecke.push([v[0], v[1], v[2], maske]);
    Some(Netz { ring, dreiecke })
}

/// Netz → Puffer `[k, ring…, (a, b, c, maske)…]`; `None` → leer.
fn kodiere(n: Option<Netz>) -> Vec<f64> {
    let Some(n) = n else { return Vec::new() };
    let mut v = Vec::with_capacity(1 + n.ring.len() + 4 * n.dreiecke.len());
    v.push(n.ring.len() as f64);
    v.extend(n.ring.iter().map(|&i| i as f64));
    for d in &n.dreiecke {
        v.extend(d.iter().map(|&i| i as f64));
    }
    v
}

#[inline]
fn gleich(a: &[f64], b: &[f64]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| x.to_bits() == y.to_bits())
}

/// Nachlauf: zerlegt neu, wenn sich `punkte` seit der letzten Zerlegung geändert hat. Läuft bewusst auch in ruhenden Teilen
/// (H-K8 `Vorlage`): reiner Cache der eigenen Felder ohne Wirkung auf die Welt – Kopien einer Vorlage erben so die Zerlegung.
fn nachlauf(_w: &mut Welt, s: &mut Speicher) {
    for z in 0..s.len() {
        if gleich(&s.puffer(PUNKTE)[z], &s.puffer(QUELLE)[z]) {
            continue;
        }
        let p = s.puffer(PUNKTE)[z].clone();
        s.puffer_mut(NETZ)[z] = kodiere(zerlege(&p));
        s.puffer_mut(QUELLE)[z] = p;
    }
}

#[inline]
fn wende(m: &[f64; 12], p: (f64, f64)) -> [f64; 2] {
    [m[0] * p.0 + m[2] * p.1 + m[4], m[1] * p.0 + m[3] * p.1 + m[5]]
}

/// Innere Gehrungsecke des Umrisses (Dicke `u`) an der Ecke `v` zwischen den Kanten `a → v` und `v → b`; `s` = Umlaufsinn.
fn gehrung(a: (f64, f64), v: (f64, f64), b: (f64, f64), s: f64, u: f64) -> (f64, f64) {
    let (e1x, e1y) = (v.0 - a.0, v.1 - a.1);
    let (e2x, e2y) = (b.0 - v.0, b.1 - v.1);
    let l1 = libm::sqrt(e1x * e1x + e1y * e1y);
    let l2 = libm::sqrt(e2x * e2x + e2y * e2y);
    // nach innen zeigende Normalen
    let (n1x, n1y) = (-e1y * s / l1, e1x * s / l1);
    let (n2x, n2y) = (-e2y * s / l2, e2x * s / l2);
    let (sx, sy) = (n1x + n2x, n1y + n2y);
    let nenner = 1.0 + (n1x * n2x + n1y * n2y);
    let laenge = libm::sqrt(sx * sx + sy * sy);
    let mut f = u / nenner;
    if !(laenge * f <= GEHRUNG_GRENZE * u) {
        f = GEHRUNG_GRENZE * u / laenge;
    }
    (v.0 + sx * f, v.1 + sy * f)
}

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (pu, qu, ne, fa, um) = (s.puffer(PUNKTE), s.puffer(QUELLE), s.puffer(NETZ), s.farbe(FARBE), s.zahl(UMRISS));
    let mut welt: Vec<[f64; 2]> = Vec::new();
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        if fa[z] & 0xFF == 0 {
            continue;
        }
        let p = &pu[z];
        let frisch: Vec<f64>;
        let netz: &[f64] = if gleich(p, &qu[z]) {
            &ne[z]
        } else {
            frisch = kodiere(zerlege(p));
            &frisch
        };
        if netz.is_empty() {
            continue;
        }
        let ebene = w.teile.ebene[tz];
        let m = b.sicht_matrix(ebene, &w.teile.welt[tz]);
        let k = netz[0] as usize;
        let (ring, dreiecke) = (&netz[1..1 + k], &netz[1 + k..]);
        let u = um[z];
        if u > 0.0 {
            // Umriss: je Kante ein Viereck (Ecke, Ecke, innere Gehrungsecken) = zwei Dreiecke, Außen- und Innenkante geglättet
            let mut fl = 0.0;
            for i in 0..k {
                let (a, c) = (pt(p, ring[i] as u32), pt(p, ring[(i + 1) % k] as u32));
                fl += a.0 * c.1 - c.0 * a.1;
            }
            let sinn = if fl > 0.0 { 1.0 } else { -1.0 };
            welt.clear();
            for i in 0..k {
                let v = pt(p, ring[i] as u32);
                let g = gehrung(pt(p, ring[(i + k - 1) % k] as u32), v, pt(p, ring[(i + 1) % k] as u32), sinn, u);
                welt.push(wende(&m, v));
                welt.push(wende(&m, g));
            }
            for i in 0..k {
                let j = (i + 1) % k;
                let (v0, g0, v1, g1) = (welt[2 * i], welt[2 * i + 1], welt[2 * j], welt[2 * j + 1]);
                b.dreieck(ebene, s.teil[z], [v0, v1, g1], 1, fa[z]);
                b.dreieck(ebene, s.teil[z], [v0, g1, g0], 2, fa[z]);
            }
        } else {
            welt.clear();
            for i in 0..p.len() / 2 {
                welt.push(wende(&m, pt(p, i as u32)));
            }
            for d in dreiecke.chunks_exact(4) {
                let e = [welt[d[0] as usize], welt[d[1] as usize], welt[d[2] as usize]];
                b.dreieck(ebene, s.teil[z], e, d[3] as u32, fa[z]);
            }
        }
    }
}

/// Hülle: umschließendes Rechteck aller Punkte (auch wenn das Vieleck ungültig ist und nicht gezeichnet wird); keine bei leerer
/// Liste oder nicht endlichen Werten.
fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    let p = &s.puffer(PUNKTE)[kz];
    let n = p.len() / 2;
    if n == 0 {
        return None;
    }
    let (mut lo, mut hi) = ([p[0], p[1]], [p[0], p[1]]);
    for i in 0..n {
        let (x, y) = (p[2 * i], p[2 * i + 1]);
        if !(x.is_finite() && y.is_finite()) {
            return None;
        }
        lo = [if x < lo[0] { x } else { lo[0] }, if y < lo[1] { y } else { lo[1] }];
        hi = [if x > hi[0] { x } else { hi[0] }, if y > hi[1] { y } else { hi[1] }];
    }
    let c = [(lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5];
    Some(rechteck_huelle(&w.teile.welt[tz], c, [(hi[0] - lo[0]) * 0.5, (hi[1] - lo[1]) * 0.5]))
}
