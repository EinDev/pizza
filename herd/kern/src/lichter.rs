//! Viele Lichter (Clustered Forward): der Abschnitt `LICHTER` des Bildpakets (`herd/README.md` §4).
//!
//! v1 schreibt die 8 nächsten Punktlichter in den Uniform-Block SZENE – das bleibt unverändert. Gibt es **mehr als 8** wirksame
//! Punktlichter oder einen **Spot** (`Licht.kegel` > 0), schreibt der Kern zusätzlich diesen Abschnitt: alle sichtbaren Lichter
//! (bis `MAX_LICHTER_VIELE`, die nächsten zur Kamera zuerst) und eine **Cluster-Tabelle**: die Sicht ist in `RASTER_X × ny`
//! Kacheln (NDC) und `RASTER_Z` Tiefenscheiben (exponentiell zwischen `nah` und `fern`) geteilt; je Zelle stehen die Lichter,
//! deren Kugel (Lage, Reichweite) sie berühren könnte (konservativ: Quader um die Kugel, je Scheibe projiziert). Der Shader
//! sucht die Zelle seines Fragments und rechnet nur deren Lichter. Alles in f64 mit `libm`, Reihenfolgen nach (Abstand, Teil-ID)
//! – bitgleich nativ = Wasm. Pakete ohne viele Lichter bleiben byte-gleich (kein Abschnitt).

use alloc::vec;
use alloc::vec::Vec;

use crate::paket::{abschnitt as art, lin4, ordnungs_bits, put_u32, put_v4, transf, LichtB, MAX_LICHTER, M4};
use crate::paket::{abschnitt_beginn, abschnitt_ende};

/// Höchstens so viele Lichter im Abschnitt (die nächsten zur Kamera; weitere fallen weg).
pub const MAX_LICHTER_VIELE: usize = 4096;
/// Höchstens so viele Lichter je Zelle (die nächsten zur Kamera zuerst; weitere wirken dort nicht).
pub const MAX_JE_ZELLE: usize = 255;
/// Kacheln waagerecht; senkrecht `round(RASTER_X / Seitenverhältnis)` (1 … 32).
pub const RASTER_X: u32 = 16;
/// Tiefenscheiben (exponentiell zwischen `nah` und `fern`).
pub const RASTER_Z: u32 = 24;
/// Uniform-Kopf des Abschnitts (std140-gleich, f32): `raster` (nx, ny, nz, Anzahl), `tiefe` (nah, nz / ln(fern/nah), fern, 0),
/// `vorn` (Blickrichtung xyz, 0), frei.
pub const LICHTER_KOPF_BYTES: usize = 64;
/// Ein Licht: `pos xyz, reichweite` · `farbe rgb (linear × Stärke), cos(Kegel außen)` · `richtung xyz, cos(Kegel innen)`.
pub const LICHT_BYTES: usize = 48;
/// Höchstens so viele Wörter Cluster-Daten (Köpfe + Indizes; = Textur 1024 × 2048 in der Glut).
pub const MAX_WORTE: usize = 1024 * 2048;

/// Ein Licht wirkt (Punkt oder Spot, nicht Sonne, Stärke > 0)?
#[inline]
fn wirkt(l: &LichtB) -> bool {
    !l.sonne && l.staerke > 0.0
}

/// Schreibt den Abschnitt `LICHTER`, wenn mehr als `MAX_LICHTER` Lichter wirken oder ein Spot dabei ist; liefert die Zahl der
/// geschriebenen Abschnitte (0 oder 1). `ansicht` = Ansichtsmatrix der Kamera, `vorn` = ihre Blickrichtung (normiert).
#[allow(clippy::too_many_arguments)]
pub fn abschnitt(aus: &mut Vec<u8>, lichter: &[LichtB], ansicht: &M4, sicht: f64, seiten: f64, nah: f64, fern: f64, auge: [f64; 3], vorn: [f64; 3]) -> u32 {
    let anzahl = lichter.iter().filter(|l| wirkt(l)).count();
    let spot = lichter.iter().any(|l| wirkt(l) && l.kegel > 0.0);
    if anzahl <= MAX_LICHTER && !spot {
        return 0;
    }
    let nx = RASTER_X as usize;
    let ny = {
        let v = libm::round(RASTER_X as f64 / if seiten > 0.0 { seiten } else { 1.0 });
        if v < 1.0 {
            1
        } else if v > 32.0 {
            32
        } else {
            v as usize
        }
    };
    let nz = RASTER_Z as usize;
    let zellen = nx * ny * nz;
    let ln_tiefe = libm::log(fern / nah);
    let pro_scheibe = nz as f64 / ln_tiefe;
    let t = libm::tan(sicht * crate::welt::GRAD * 0.5);
    let (kx, ky) = (1.0 / (t * seiten), 1.0 / t);

    // Reihenfolge: Abstand zur Kamera, dann Teil-ID (wie die 8 Lichter in SZENE)
    let mut ordnung: Vec<(u64, u32, usize)> = lichter
        .iter()
        .enumerate()
        .filter(|(_, l)| wirkt(l))
        .map(|(i, l)| {
            let d = [l.pos[0] - auge[0], l.pos[1] - auge[1], l.pos[2] - auge[2]];
            (ordnungs_bits(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]), l.teil, i)
        })
        .collect();
    ordnung.sort_unstable_by_key(|x| (x.0, x.1));

    // Scheibe zu einer Tiefe (wie der Shader: ⌊ln(d/nah) · nz / ln(fern/nah)⌋, geklemmt)
    let scheibe = |d: f64| -> usize {
        if d <= nah {
            return 0;
        }
        let s = libm::floor(libm::log(d / nah) * pro_scheibe);
        if s < 0.0 {
            0
        } else if s >= (nz - 1) as f64 {
            nz - 1
        } else {
            s as usize
        }
    };
    let grenze = |s: usize| -> f64 { nah * libm::exp(s as f64 / pro_scheibe) };
    // Kachel zu einer NDC-Koordinate (wie der Shader: ⌊(ndc · ½ + ½) · n⌋, geklemmt)
    let kachel = |ndc: f64, n: usize| -> usize {
        let k = libm::floor((ndc * 0.5 + 0.5) * n as f64);
        if k < 0.0 {
            0
        } else if k >= (n - 1) as f64 {
            n - 1
        } else {
            k as usize
        }
    };

    let mut sichtbar: Vec<usize> = Vec::new();
    let mut paare: Vec<(u32, u32)> = Vec::new(); // (Zelle, Licht-Index) in Lichtreihenfolge
    for &(_, _, i) in &ordnung {
        if sichtbar.len() >= MAX_LICHTER_VIELE {
            break;
        }
        let l = &lichter[i];
        let r = if l.reichweite > 0.0 { l.reichweite } else { 0.0 };
        let p = transf(ansicht, l.pos);
        let (x, y, d) = (p[0], p[1], -p[2]);
        if !(x.is_finite() && y.is_finite() && d.is_finite()) || d + r <= nah || d - r >= fern {
            continue;
        }
        let index = sichtbar.len() as u32;
        let mut drin = false;
        let (s0, s1) = (scheibe((d - r) * (1.0 - 1e-6)), scheibe((d + r) * (1.0 + 1e-6)));
        for s in s0..=s1 {
            // Tiefenbereich dieser Scheibe ∩ Kugel (die letzte Scheibe reicht bis ins Unendliche)
            let mut z0 = grenze(s);
            let mut z1 = if s + 1 >= nz { f64::INFINITY } else { grenze(s + 1) };
            if s == 0 {
                z0 = nah;
            }
            if d - r > z0 {
                z0 = d - r;
            }
            if d + r < z1 {
                z1 = d + r;
            }
            if z0 < nah {
                z0 = nah;
            }
            if z1 < z0 {
                continue;
            }
            // Quader um die Kugel, projiziert: x/z ist für festes x monoton in z → Extremwerte an z0 und z1
            let (xa, xb, ya, yb) = (x - r, x + r, y - r, y + r);
            let lo = |a: f64, k: f64| -> f64 {
                let (u, v) = (a * k / z0, a * k / z1);
                if u < v {
                    u
                } else {
                    v
                }
            };
            let hi = |a: f64, k: f64| -> f64 {
                let (u, v) = (a * k / z0, a * k / z1);
                if u > v {
                    u
                } else {
                    v
                }
            };
            let (nx0, nx1, ny0, ny1) = (lo(xa, kx), hi(xb, kx), lo(ya, ky), hi(yb, ky));
            if nx1 < -1.0 || nx0 > 1.0 || ny1 < -1.0 || ny0 > 1.0 {
                continue;
            }
            drin = true;
            let (tx0, tx1, ty0, ty1) = (kachel(nx0, nx), kachel(nx1, nx), kachel(ny0, ny), kachel(ny1, ny));
            for ty in ty0..=ty1 {
                for tx in tx0..=tx1 {
                    paare.push((((s * ny + ty) * nx + tx) as u32, index));
                }
            }
        }
        if drin {
            sichtbar.push(i);
        }
    }

    // Zählen (gekappt), Versätze, Füllen – innerhalb einer Zelle in Lichtreihenfolge (stabil)
    let mut zahl = vec![0u32; zellen];
    for &(z, _) in &paare {
        let c = &mut zahl[z as usize];
        if (*c as usize) < MAX_JE_ZELLE {
            *c += 1;
        }
    }
    let mut versatz = vec![0u32; zellen];
    let mut summe = zellen as u32;
    for z in 0..zellen {
        if summe as usize + zahl[z] as usize > MAX_WORTE {
            zahl[z] = 0;
        }
        versatz[z] = summe;
        summe += zahl[z];
    }
    let mut daten = vec![0u32; summe as usize];
    for z in 0..zellen {
        daten[z] = versatz[z] << 8 | zahl[z];
    }
    let mut fuell = vec![0u32; zellen];
    for &(z, i) in &paare {
        let z = z as usize;
        if fuell[z] < zahl[z] {
            daten[(versatz[z] + fuell[z]) as usize] = i;
            fuell[z] += 1;
        }
    }

    let st = abschnitt_beginn(aus, art::LICHTER);
    put_v4(aus, [nx as f64, ny as f64, nz as f64, sichtbar.len() as f64]);
    put_v4(aus, [nah, pro_scheibe, fern, 0.0]);
    put_v4(aus, [vorn[0], vorn[1], vorn[2], 0.0]);
    put_v4(aus, [0.0; 4]);
    put_u32(aus, sichtbar.len() as u32);
    put_u32(aus, daten.len() as u32);
    for &i in &sichtbar {
        let l = &lichter[i];
        let f = lin4(l.farbe, l.staerke);
        let (aussen, innen) = if l.kegel > 0.0 {
            let w = l.kegel * crate::welt::GRAD;
            (libm::cos(w), libm::cos(w * (1.0 - l.kegel_rand)))
        } else {
            (-2.0, -1.5)
        };
        let rl = libm::sqrt(l.richtung[0] * l.richtung[0] + l.richtung[1] * l.richtung[1] + l.richtung[2] * l.richtung[2]);
        let rich = if rl > 1e-12 && rl.is_finite() { [l.richtung[0] / rl, l.richtung[1] / rl, l.richtung[2] / rl] } else { [0.0, -1.0, 0.0] };
        put_v4(aus, [l.pos[0], l.pos[1], l.pos[2], l.reichweite]);
        put_v4(aus, [f[0], f[1], f[2], aussen]);
        put_v4(aus, [rich[0], rich[1], rich[2], innen]);
    }
    for w in &daten {
        put_u32(aus, *w);
    }
    abschnitt_ende(aus, st);
    1
}
