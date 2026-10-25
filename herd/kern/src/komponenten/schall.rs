//! `Schall` (beide, H-K22, K-164): Raumklang wie Unity AudioSource – ein Klang (Feldtyp `klang`, die Klang-ID des Erzeugers)
//! spielt am Teil und folgt dessen Lage. Hörer ist die aktive Kamera mit der kleinsten Teil-ID (3D; ohne sie die Standardsicht
//! von (0, 3, 8) auf (0, 0, 0)) bzw. die Mitte des aktiven Blicks oder des Spielfelds (2D) – **kein eigener Hörer-Baustein**,
//! kein Doppler.
//!
//! Pegel = `lautstaerke` × Abfall: bis `nah` voll, ab `weite` stumm, dazwischen `((weite − d) / (weite − nah))²`. Panorama =
//! Anteil der Richtung zur Quelle an der Rechts-Achse des Hörers, `rechts · (q − h) / max(d, nah)` (innerhalb von `nah` läuft
//! es weich zur Mitte). Beide auf 1/1024 gerastet (`libm::floor`). Lesefelder `pegel`/`panorama` werden beim Lesen berechnet.
//!
//! Das **Klangbild** (Kern-Export `klangbild`) entsteht in `Kern::bild` neben dem Bildpaket: Vergleich der laufenden Schalle
//! (wach, `klang` ≠ 0, `spielt`) mit dem zuletzt gemeldeten Stand → je Schall `start`, `raum` (Pegel, Panorama oder Tonhöhe
//! geändert; ein stumm bleibender Schall meldet kein neues Panorama) oder `stopp`, nach Komponenten-Handle. Der gemeldete Stand liegt im Kern, nicht in der Welt – nicht im
//! Szenen-Hash, Bildpakete bleiben byte-gleich. Das Nachlauf-System merkt sich nur `spielt` nein → ja (Neustart von vorn).

use super::*;
use alloc::vec::Vec;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const KLANG: usize = 0;
pub const LAUTSTAERKE: usize = 1;
pub const SCHLEIFE: usize = 2;
pub const SPIELT: usize = 3;
pub const NAH: usize = 4;
pub const WEITE: usize = 5;
pub const TONHOEHE: usize = 6;
pub const PEGEL: usize = 7;
pub const PANORAMA: usize = 8;
/// verborgen: `spielt` im letzten Nachlauf (Standard 1 – ein neuer Schall mit `spielt: ja` ist kein Neustart)
pub const LIEF: usize = 9;
/// verborgen: Zähler der Neustarts (`spielt` nein → ja)
pub const NEU: usize = 10;

pub static ART: Art = Art {
    schema: Schema {
        name: "Schall",
        genus: Genus::M,
        raum: Raum::Beide,
        braucht: &[],
        felder: &[
            Feld::klang("klang"),
            Feld::zahl("lautstaerke", 1.0).bereich(0.0, 2.0),
            Feld::diavolo("schleife", true),
            Feld::diavolo("spielt", true),
            Feld::zahl("nah", 1.0).min(0.0),
            Feld::zahl("weite", 30.0).min(0.0),
            Feld::zahl("tonhoehe", 1.0).bereich(0.25, 4.0),
            Feld::zahl("pegel", 0.0).lesen(),
            Feld::zahl("panorama", 0.0).lesen(),
            Feld::intern("lief", 1.0),
            Feld::intern("neustarts", 0.0),
        ],
    },
    nachlauf: Some(nachlauf),
    lies: Some(lies),
    ..Art::LEER
};

/// Art eines Klangbild-Eintrags
pub const START: f64 = 1.0;
pub const RAUM: f64 = 2.0;
pub const STOPP: f64 = 3.0;
/// Zahlen je Eintrag: art, komp, klang, lautstaerke, panorama, tonhoehe, schleife
pub const EINTRAG: usize = 7;

/// Raster der Pegel und Panoramen
const RASTER: f64 = 1024.0;

fn raste(x: f64) -> f64 {
    libm::floor(x * RASTER + 0.5) / RASTER
}

fn nachlauf(w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    for z in 0..n {
        if wach(w, s.teil[z]).is_none() {
            continue;
        }
        let spielt = s.zahl(SPIELT)[z];
        if spielt != 0.0 && s.zahl(LIEF)[z] == 0.0 {
            s.zahl_mut(NEU)[z] += 1.0;
        }
        s.zahl_mut(LIEF)[z] = spielt;
    }
}

/// Hörer: Lage und Rechts-Achse (Einheitsvektor) in Weltkoordinaten.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Hoerer {
    pub lage: [f64; 3],
    pub rechts: [f64; 3],
}

/// 3D-Hörer: aktive Kamera mit der kleinsten Teil-ID (wie das Bildpaket), sonst die Standardsicht.
pub fn hoerer_3d(w: &mut Welt) -> Hoerer {
    let mut best: Option<(u32, usize)> = None;
    if let Some(a) = w.arten.iter().position(|x| core::ptr::eq(*x, &kamera::ART)) {
        let s = &w.speicher[a];
        let ak = s.zahl(kamera::AKTIV);
        for z in 0..s.len() {
            let teil = s.teil[z];
            if teil == 0 || ak[z] == 0.0 {
                continue;
            }
            let Some(tz) = wach(w, teil) else { continue };
            if best.map(|b| teil < b.0).unwrap_or(true) {
                best = Some((teil, tz));
            }
        }
    }
    let Some((_, tz)) = best else {
        return Hoerer { lage: [0.0, 3.0, 8.0], rechts: [1.0, 0.0, 0.0] };
    };
    w.aktualisiere(tz);
    let m = w.teile.welt[tz];
    let r = [m[0], m[4], m[8]];
    let l = libm::sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]);
    let rechts = if l > 0.0 && l.is_finite() { [r[0] / l, r[1] / l, r[2] / l] } else { [1.0, 0.0, 0.0] };
    Hoerer { lage: [m[3], m[7], m[11]], rechts }
}

/// 2D-Hörer: Mitte des aktiven Blicks (Rechts-Achse = Bildschirm-Rechts in Weltlage), sonst Mitte des Spielfelds.
pub fn hoerer_2d(w: &mut Welt) -> Hoerer {
    let (b, h) = (w.breite as f64, w.hoehe as f64);
    let mitte = [b * 0.5, h * 0.5];
    if let Some(a) = w.arten.iter().position(|x| core::ptr::eq(*x, &blick::ART)) {
        if w.speicher[a].len() > 0 {
            w.aktualisiere_alle();
            if let Some(si) = blick::aktive_sicht(w, b, h) {
                let c = blick::welt_punkt(&si.m, mitte);
                let r = blick::welt_punkt(&si.m, [mitte[0] + 1.0, mitte[1]]);
                let (dx, dy) = (r[0] - c[0], r[1] - c[1]);
                let l = libm::sqrt(dx * dx + dy * dy);
                let rechts = if l > 0.0 && l.is_finite() { [dx / l, dy / l, 0.0] } else { [1.0, 0.0, 0.0] };
                return Hoerer { lage: [c[0], c[1], 0.0], rechts };
            }
        }
    }
    Hoerer { lage: [mitte[0], mitte[1], 0.0], rechts: [1.0, 0.0, 0.0] }
}

/// Pegel (gerastet, ohne Lautstärke-Faktor) und Panorama eines Punkts `q` mit `nah`/`weite` am Hörer `h`.
pub fn raum(h: &Hoerer, q: [f64; 3], nah: f64, weite: f64) -> (f64, f64) {
    let d3 = [q[0] - h.lage[0], q[1] - h.lage[1], q[2] - h.lage[2]];
    let d = libm::sqrt(d3[0] * d3[0] + d3[1] * d3[1] + d3[2] * d3[2]);
    let abfall = if d <= nah {
        1.0
    } else if d >= weite {
        0.0
    } else {
        let t = (weite - d) / (weite - nah);
        t * t
    };
    let teiler = if d > nah { d } else { nah };
    let pan = if teiler > 0.0 {
        let p = (h.rechts[0] * d3[0] + h.rechts[1] * d3[1] + h.rechts[2] * d3[2]) / teiler;
        if p > 1.0 {
            1.0
        } else if p < -1.0 {
            -1.0
        } else {
            p
        }
    } else {
        0.0
    };
    (abfall, pan)
}

/// Pegel und Panorama der Zeile `z` (Speicher `a`), beide gerastet; Teil lose oder entfernt → (0, 0).
fn zeile_raum(w: &mut Welt, a: usize, z: usize, h3: &mut Option<Hoerer>, h2: &mut Option<Hoerer>) -> (f64, f64) {
    let teil = w.speicher[a].teil[z];
    let Some(tz) = (if teil == 0 { None } else { w.zeile_opt(teil) }) else { return (0.0, 0.0) };
    let drei_d = w.teile.drei_d[tz];
    let h = if drei_d {
        match h3 {
            Some(h) => *h,
            None => {
                let h = hoerer_3d(w);
                *h3 = Some(h);
                h
            }
        }
    } else {
        match h2 {
            Some(h) => *h,
            None => {
                let h = hoerer_2d(w);
                *h2 = Some(h);
                h
            }
        }
    };
    w.aktualisiere(tz);
    let m = w.teile.welt[tz];
    let q = if drei_d { [m[3], m[7], m[11]] } else { [m[4], m[5], 0.0] };
    let s = &w.speicher[a];
    let (abfall, pan) = raum(&h, q, s.zahl(NAH)[z], s.zahl(WEITE)[z]);
    (raste(s.zahl(LAUTSTAERKE)[z] * abfall), raste(pan))
}

fn lies(w: &mut Welt, a: usize, z: usize, feld: usize) -> Option<f64> {
    if feld != PEGEL && feld != PANORAMA {
        return None;
    }
    let (p, pan) = zeile_raum(w, a, z, &mut None, &mut None);
    Some(if feld == PEGEL { p } else { pan })
}

/// Zuletzt gemeldeter Stand eines Schalls.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Gemeldet {
    komp: u32,
    klang: f64,
    neu: f64,
    pegel: f64,
    pan: f64,
    ton: f64,
}

/// Klangbild-Zustand des Kerns: gemeldeter Stand (nach Handle) und die Einträge des letzten Bilds.
#[derive(Clone, Debug, Default)]
pub struct Klangbild {
    gemeldet: Vec<Gemeldet>,
    /// je Eintrag [`EINTRAG`] Zahlen
    pub daten: Vec<f64>,
}

impl Klangbild {
    fn eintrag(&mut self, art: f64, g: &Gemeldet, schleife: f64) {
        self.daten.extend_from_slice(&[art, g.komp as f64, g.klang, g.pegel, g.pan, g.ton, schleife]);
    }

    /// Neues Klangbild aus der Welt (in `Kern::bild`, nach dem Bildpaket).
    pub fn baue(&mut self, w: &mut Welt) {
        self.daten.clear();
        let a = w.arten.iter().position(|x| core::ptr::eq(*x, &ART));
        let n = a.map(|a| w.speicher[a].len()).unwrap_or(0);
        if n == 0 && self.gemeldet.is_empty() {
            return;
        }
        // laufende Schalle jetzt (nach Handle)
        let mut jetzt: Vec<(Gemeldet, f64)> = Vec::new();
        if let Some(a) = a {
            let (mut h3, mut h2) = (None, None);
            for z in 0..n {
                let s = &w.speicher[a];
                let (teil, klang, spielt) = (s.teil[z], s.zahl(KLANG)[z], s.zahl(SPIELT)[z]);
                if teil == 0 || klang == 0.0 || spielt == 0.0 || wach(w, teil).is_none() {
                    continue;
                }
                let (komp, neu, ton, schleife) = (s.komp[z], s.zahl(NEU)[z], s.zahl(TONHOEHE)[z], s.zahl(SCHLEIFE)[z]);
                let (pegel, pan) = zeile_raum(w, a, z, &mut h3, &mut h2);
                jetzt.push((Gemeldet { komp, klang, neu, pegel, pan, ton }, schleife));
            }
        }
        jetzt.sort_by_key(|(g, _)| g.komp);
        let alt = core::mem::take(&mut self.gemeldet);
        let (mut i, mut j) = (0, 0);
        while i < alt.len() || j < jetzt.len() {
            let ka = alt.get(i).map(|g| g.komp).unwrap_or(u32::MAX);
            let kj = jetzt.get(j).map(|(g, _)| g.komp).unwrap_or(u32::MAX);
            if ka < kj {
                self.eintrag(STOPP, &alt[i], 0.0);
                i += 1;
            } else if kj < ka {
                let (g, sch) = jetzt[j];
                self.eintrag(START, &g, sch);
                self.gemeldet.push(g);
                j += 1;
            } else {
                let (g, sch) = jetzt[j];
                let a = alt[i];
                if a.klang != g.klang || a.neu != g.neu {
                    self.eintrag(STOPP, &a, 0.0);
                    self.eintrag(START, &g, sch);
                } else if a.pegel != g.pegel || a.ton != g.ton || (a.pan != g.pan && g.pegel != 0.0) {
                    // stumm bleibende Schalle (hinter `weite`) melden ein neues Panorama erst, wenn sie wieder hörbar werden
                    self.eintrag(RAUM, &g, sch);
                } else {
                    self.gemeldet.push(a);
                    i += 1;
                    j += 1;
                    continue;
                }
                self.gemeldet.push(g);
                i += 1;
                j += 1;
            }
        }
    }
}
