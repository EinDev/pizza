//! `Wasser` (3D, H-K28): Wasserfläche wie Unity/HDRP Water – waagerechtes Rechteck um die Weltlage des Teils (`breite` × `tiefe`;
//! Drehung und Maßstab des Teils zählen nicht), vier **Gerstner-Wellen**, Brechung, Tiefenfärbung, Schaum und Spiegelung (Glut,
//! `wasser.wgsl`). Kein System, keine Hülle: `Figur` und `Strahl` sehen Wasser nicht als Boden (Schwimmen → später);
//! `Schwung.auftrieb` (Nachtragsfeld) hebt Körper im Schwung-Takt über [`hoehe`].
//!
//! **Wellen** (dieselbe Formel im Kern in f64 mit `libm` und in `wasser.wgsl` in f32): Richtung aus dem geltenden `Wind`
//! (sonst +x), vier Wellen mit fest gestreuten Richtungen ([`DREH`]), Längen ([`LAENGE`] × `wellenLaenge`) und Höhen ([`HOEHE`] ×
//! `wellen`, Summe = `wellen`). Welle i: k = 2π / Länge, ω = √(9,81 k) · `wellenTempo` (Tiefwasser), Phase φ = ω · t – die Phase
//! rechnet nur der Kern (t = Takte / 60) und rastet sie auf 1/65 536 Umdrehung (so rechnen Kern und Shader aus **denselben** Zahlen,
//! und f32 verliert auch nach Stunden nichts). Punkt (u, v) der Ruhefläche → (u + Σ sᵢ dₓ cos θᵢ, y + Σ aᵢ sin θᵢ, v + Σ sᵢ d_z cos θᵢ)
//! mit θᵢ = kᵢ (d · (u, v)) − φᵢ und der Querweite sᵢ = min(aᵢ, 0,15 / kᵢ) (Steilheit ≤ 0,6, keine Schleifen). Höhe an einer
//! Weltstelle (x, z): (u, v) aus 4 festen Rückrechnungs-Schritten (u, v) = (x, z) − Querversatz(u, v), dann y.
//!
//! **Bildpaket** (additiv, nur bei Nutzung): Abschnitt `WASSER` (16 B Kopf + 64 B je Fläche, höchstens [`MAX_FLAECHEN`] sichtbare,
//! nach Teil-ID) und ein Zug `zug::WASSER` zwischen `FEST` und `DURCH` (`herd/README.md` §4). Lesefeld `messHoehe`: Wasserspiegel
//! (mit Wellen) an der Weltstelle `messX`/`messZ` – berechnet beim Lesen (HERD.md §13.1 Regel 6), auch außerhalb des Rechtecks.

use alloc::vec::Vec;

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const BREITE: usize = 0;
pub const TIEFE: usize = 1;
pub const FARBE: usize = 2;
pub const TIEFEN_FARBE: usize = 3;
pub const KLARHEIT: usize = 4;
pub const WELLEN: usize = 5;
pub const WELLEN_LAENGE: usize = 6;
pub const WELLEN_TEMPO: usize = 7;
pub const SCHAUM: usize = 8;
pub const BRECHUNG: usize = 9;
pub const MESS_X: usize = 10;
pub const MESS_Z: usize = 11;
/// Lesefeld (beim Lesen berechnet): Wasserspiegel an (`messX`, `messZ`)
pub const MESS_HOEHE: usize = 12;

/// Höchstens so viele Flächen je Bild (kleinste Teil-IDs zuerst); der Auftrieb kennt alle wachen.
pub const MAX_FLAECHEN: usize = 8;
/// Abschnitt `WASSER`: Kopf (`u32 anzahl, f32 nah, f32 fern, f32 zeit`) und je Fläche 64 B (`herd/README.md` §4).
pub const WASSER_KOPF_BYTES: usize = 16;
pub const WASSER_FLAECHE_BYTES: usize = 64;

/// Drehung der vier Wellen gegen die Grundrichtung (Bogenmaß), Anteil an `wellenLaenge` und an `wellen` (Summe 1).
pub const DREH: [f64; 4] = [0.0, 0.55, -0.4, 1.1];
pub const LAENGE: [f64; 4] = [1.0, 0.63, 0.41, 0.27];
pub const HOEHE: [f64; 4] = [0.5, 0.25, 0.15, 0.1];
/// Schwerebeschleunigung der Tiefwasser-Dispersion ω = √(g k).
const G: f64 = 9.81;
const ZWEI_PI: f64 = 2.0 * core::f64::consts::PI;

pub static ART: Art = Art {
    schema: Schema {
        name: "Wasser",
        genus: Genus::N,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::zahl("breite", 50.0).min(0.0),
            Feld::zahl("tiefe", 50.0).min(0.0),
            Feld::farbe("farbe", "wasser"),
            Feld::farbe("tiefenFarbe", "#0b2a3a"),
            Feld::zahl("klarheit", 2.0).min(0.01),
            Feld::zahl("wellen", 0.2).bereich(0.0, 10.0),
            Feld::zahl("wellenLaenge", 6.0).min(0.1),
            Feld::zahl("wellenTempo", 1.0).bereich(0.0, 10.0),
            Feld::zahl("schaum", 0.3).bereich(0.0, 1.0),
            Feld::zahl("brechung", 0.03).bereich(0.0, 1.0),
            Feld::zahl("messX", 0.0),
            Feld::zahl("messZ", 0.0),
            Feld::zahl("messHoehe", 0.0).lesen(),
        ],
    },
    lies: Some(lies),
    ..Art::LEER
};

/// Eine Wasserfläche in Weltlage mit ihren Wellen (für Auftrieb, Lesefeld und Bildpaket).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Flaeche {
    pub teil: u32,
    /// Speicherzeile der Komponente
    pub zeile: usize,
    /// Mitte der Ruhefläche (Weltlage des Teils)
    pub mitte: [f64; 3],
    /// halbe Breite (x) und halbe Tiefe (z)
    pub halb: [f64; 2],
    /// Grundrichtung (x, z), Länge 1
    pub richtung: [f64; 2],
    /// je Welle: Richtung (x, z), k, Höhe a, Querweite s, Phase (gerastet, 0 … 65 535)
    pub welle: [Welle; 4],
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Welle {
    pub d: [f64; 2],
    pub k: f64,
    pub a: f64,
    pub s: f64,
    pub phase: u16,
}

/// Grundrichtung der Wellen: Richtung des geltenden `Wind` (normiert), sonst +x.
fn grundrichtung(w: &Welt) -> [f64; 2] {
    let Some((rx, rz)) = wind::richtung(w) else { return [1.0, 0.0] };
    let l = libm::sqrt(rx * rx + rz * rz);
    if l > 1e-9 && l.is_finite() {
        [rx / l, rz / l]
    } else {
        [1.0, 0.0]
    }
}

/// Wellen einer Fläche aus den Feldern (Zeile `z`), der Grundrichtung `r` und den Takten der Welt.
fn wellen(s: &Speicher, z: usize, r: [f64; 2], takte: u64) -> [Welle; 4] {
    let hoehe = s.zahl(WELLEN)[z];
    let laenge = s.zahl(WELLEN_LAENGE)[z];
    let tempo = s.zahl(WELLEN_TEMPO)[z];
    // Zeit in Sekunden; die Phase rechnet in Umdrehungen und behält nur den Bruchteil (Takte bleiben ganzzahlig genau)
    let t = takte as f64 * DT;
    let mut aus = [Welle::default(); 4];
    for i in 0..4 {
        let (c, sn) = (libm::cos(DREH[i]), libm::sin(DREH[i]));
        let d = [r[0] * c - r[1] * sn, r[0] * sn + r[1] * c];
        let k = ZWEI_PI / (laenge * LAENGE[i]);
        let a = hoehe * HOEHE[i];
        let quer = 0.15 / k;
        let s_ = if a < quer { a } else { quer };
        let om = libm::sqrt(G * k) * tempo;
        let umdrehungen = om * t / ZWEI_PI;
        let bruch = umdrehungen - libm::floor(umdrehungen);
        let mut q = libm::floor(bruch * 65536.0);
        if !(q >= 0.0) || q >= 65536.0 {
            q = 0.0;
        }
        aus[i] = Welle { d, k, a, s: s_, phase: q as u16 };
    }
    aus
}

/// Bogenmaß einer gerasteten Phase.
#[inline]
pub fn phase_bogen(p: u16) -> f64 {
    p as f64 * (ZWEI_PI / 65536.0)
}

/// Alle wachen Wasserflächen (nach Teil-ID); `sichtbar` ja → nur sichtbare (Bildpaket).
pub fn flaechen(w: &Welt, nur_sichtbar: bool) -> Vec<Flaeche> {
    let mut aus = Vec::new();
    let Some(a) = w.art_index(ART.schema.name) else { return aus };
    let s = &w.speicher[a];
    if s.len() == 0 {
        return aus;
    }
    let r = grundrichtung(w);
    for z in 0..s.len() {
        let teil = s.teil[z];
        let tz = if nur_sichtbar { sichtbar(w, teil) } else { wach(w, teil) };
        let Some(tz) = tz else { continue };
        let m = w.teile.welt[tz];
        aus.push(Flaeche {
            teil,
            zeile: z,
            mitte: [m[3], m[7], m[11]],
            halb: [s.zahl(BREITE)[z] * 0.5, s.zahl(TIEFE)[z] * 0.5],
            richtung: r,
            welle: wellen(s, z, r, w.takte),
        });
    }
    aus.sort_by_key(|f| f.teil);
    aus
}

/// Alle wachen Wasserflächen für den Takt (Welt-Matrizen der Wasser-Teile vorher aktualisiert).
pub fn flaechen_wach(w: &mut Welt) -> Vec<Flaeche> {
    let Some(a) = w.art_index(ART.schema.name) else { return Vec::new() };
    for z in 0..w.speicher[a].len() {
        if let Some(tz) = wach(w, w.speicher[a].teil[z]) {
            w.aktualisiere(tz);
        }
    }
    flaechen(w, false)
}

/// Querversatz und Höhe der Wellen am Ruhepunkt (u, v) (Weltmaß, relativ zur Ruhefläche).
#[inline]
fn versatz(f: &Flaeche, u: f64, v: f64) -> [f64; 3] {
    let mut o = [0.0; 3];
    for wl in &f.welle {
        let th = wl.k * (wl.d[0] * u + wl.d[1] * v) - phase_bogen(wl.phase);
        let (c, sn) = (libm::cos(th), libm::sin(th));
        o[0] += wl.s * wl.d[0] * c;
        o[1] += wl.a * sn;
        o[2] += wl.s * wl.d[1] * c;
    }
    o
}

/// Wasserspiegel (Welt-y) der Fläche `f` an der Weltstelle (x, z): Ruhepunkt über 4 feste Rückrechnungs-Schritte, dann die Höhe.
pub fn hoehe(f: &Flaeche, x: f64, z: f64) -> f64 {
    let (mut u, mut v) = (x, z);
    for _ in 0..4 {
        let o = versatz(f, u, v);
        u = x - o[0];
        v = z - o[2];
    }
    f.mitte[1] + versatz(f, u, v)[1]
}

/// Liegt (x, z) über dem Rechteck der Fläche?
#[inline]
pub fn ueber(f: &Flaeche, x: f64, z: f64) -> bool {
    betrag(x - f.mitte[0]) <= f.halb[0] && betrag(z - f.mitte[2]) <= f.halb[1]
}

/// Erste Fläche (kleinste Teil-ID), über deren Rechteck (x, z) liegt.
pub fn unter<'a>(fl: &'a [Flaeche], x: f64, z: f64) -> Option<&'a Flaeche> {
    fl.iter().find(|f| ueber(f, x, z))
}

fn lies(w: &mut Welt, a: usize, z: usize, feld: usize) -> Option<f64> {
    if feld != MESS_HOEHE {
        return None;
    }
    let teil = w.speicher[a].teil[z];
    let Some(tz) = wach(w, teil) else { return Some(0.0) };
    w.aktualisiere(tz);
    let s = &w.speicher[a];
    let m = w.teile.welt[tz];
    let r = grundrichtung(w);
    let f = Flaeche {
        teil,
        zeile: z,
        mitte: [m[3], m[7], m[11]],
        halb: [s.zahl(BREITE)[z] * 0.5, s.zahl(TIEFE)[z] * 0.5],
        richtung: r,
        welle: wellen(s, z, r, w.takte),
    };
    let y = hoehe(&f, s.zahl(MESS_X)[z], s.zahl(MESS_Z)[z]);
    Some(if y.is_finite() { y } else { 0.0 })
}

/// Zahl der Flächen, die [`abschnitt`] schreiben wird (für den Zug).
pub fn anzahl(w: &Welt) -> usize {
    let n = flaechen(w, true).len();
    if n < MAX_FLAECHEN {
        n
    } else {
        MAX_FLAECHEN
    }
}

/// Schreibt den Abschnitt `WASSER` (nur mit sichtbaren Flächen); liefert die Zahl der Abschnitte (0/1). Ohne Wasser byte-gleich.
pub fn abschnitt(w: &Welt, aus: &mut Vec<u8>, nah: f64, fern: f64) -> u32 {
    let fl = flaechen(w, true);
    if fl.is_empty() {
        return 0;
    }
    let Some(a) = w.art_index(ART.schema.name) else { return 0 };
    let s = &w.speicher[a];
    use crate::paket::{abschnitt_beginn, abschnitt_ende, put_f32, put_u32, put_v4};
    let st = abschnitt_beginn(aus, crate::paket::abschnitt::WASSER);
    let n = fl.len().min(MAX_FLAECHEN);
    put_u32(aus, n as u32);
    put_f32(aus, nah);
    put_f32(aus, fern);
    // Zeit für das Detail-Rauschen der Glut (s, alle 1 024 s von vorn – f32 bleibt fein)
    let t = w.takte as f64 * DT / 1024.0;
    put_f32(aus, (t - libm::floor(t)) * 1024.0);
    for f in fl.iter().take(n) {
        let z = f.zeile;
        let q = |f: usize| s.zahl(f)[z];
        put_v4(aus, [f.mitte[0], f.mitte[1], f.mitte[2], q(WELLEN)]);
        put_v4(aus, [f.halb[0], f.halb[1], q(WELLEN_LAENGE), q(KLARHEIT)]);
        put_v4(aus, [f.richtung[0], f.richtung[1], q(SCHAUM), q(BRECHUNG)]);
        put_u32(aus, s.farbe(FARBE)[z]);
        put_u32(aus, s.farbe(TIEFEN_FARBE)[z]);
        put_u32(aus, f.welle[0].phase as u32 | (f.welle[1].phase as u32) << 16);
        put_u32(aus, f.welle[2].phase as u32 | (f.welle[3].phase as u32) << 16);
    }
    debug_assert_eq!(aus.len() - st, WASSER_KOPF_BYTES + n * WASSER_FLAECHE_BYTES);
    abschnitt_ende(aus, st);
    1
}
