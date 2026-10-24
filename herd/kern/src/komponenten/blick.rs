//! `Blick` (2D, H-K1): orthografische 2D-Kamera wie Unity (Scrollen, Zoom, Drehung). Die Weltlage des Teils ist die Mitte
//! der Sicht, seine Drehung (mit allen Eltern) dreht die Sicht, `zoom` vergrößert. Es gilt der aktive Blick mit der kleinsten
//! Teil-ID (Sichtbarkeit egal, wie `Kamera`). Teile mit `ebene ≥ festAb` bleiben als HUD fest im Spielfeld.
//!
//! Kein System, kein Bildbeitrag: `paket::baue` holt vor den Bildbeiträgen [`aktive_sicht`] und `Bildbau::flach` wendet die
//! Sicht-Matrix auf `m` an (Culling danach). Ohne aktiven Blick wird nichts multipliziert – Bildpakete bleiben byte-gleich.
//! Mit Grenzen (nicht alle 0) wird nur die **Mitte der Sicht** geklemmt, die Lage des Teils bleibt unverändert.

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};
use crate::welt::{lage, lokal_2d, mal_2d};

pub const ZOOM: usize = 0;
pub const AKTIV: usize = 1;
pub const FEST_AB: usize = 2;
pub const GRENZE_LINKS: usize = 3;
pub const GRENZE_OBEN: usize = 4;
pub const GRENZE_RECHTS: usize = 5;
pub const GRENZE_UNTEN: usize = 6;

pub static ART: Art = Art {
    schema: Schema {
        name: "Blick",
        genus: Genus::M,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::zahl("zoom", 1.0).bereich(0.05, 20.0),
            Feld::diavolo("aktiv", true),
            Feld::ganz("festAb", 1000.0),
            Feld::zahl("grenzeLinks", 0.0),
            Feld::zahl("grenzeOben", 0.0),
            Feld::zahl("grenzeRechts", 0.0),
            Feld::zahl("grenzeUnten", 0.0),
        ],
    },
    ..Art::LEER
};

/// Die Sicht eines aktiven Blicks im Bildbau.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sicht {
    /// Teil des Blicks
    pub teil: u32,
    /// 2D-Matrix Welt → Spielfeld (Layout wie `lokal_2d`): T(breite/2, hoehe/2) · R(−drehung) · S(zoom) · T(−mitte)
    pub m: [f64; 12],
    /// Teile mit `ebene ≥ fest_ab` bleiben fest (HUD)
    pub fest_ab: f64,
    /// sichtbares Weltrechteck (achsenparallel umschlossen): min, max
    pub welt_min: [f64; 2],
    pub welt_max: [f64; 2],
}

/// Drehung des Teils in Grad samt aller Eltern (2D: Drehungen addieren sich).
fn drehung_welt(w: &Welt, z: usize) -> f64 {
    let mut d = w.teile.lage[z][lage::DREHUNG];
    let mut e = w.teile.eltern[z];
    let mut schritte = 0usize;
    while e != 0 && schritte <= w.teile.id.len() {
        let Some(ez) = w.zeile_opt(e) else { break };
        d += w.teile.lage[ez][lage::DREHUNG];
        e = w.teile.eltern[ez];
        schritte += 1;
    }
    d
}

/// Mitte `c` einer Achse klemmen: Sicht mit halber Ausdehnung `h` soll in [`lo`, `hi`] bleiben; ist die Welt schmaler als
/// die Sicht, steht die Mitte in der Mitte der Welt. Eine Achse ohne Ausdehnung (`hi ≤ lo`, z. B. beide 0) bleibt frei.
fn klemme(c: f64, h: f64, lo: f64, hi: f64) -> f64 {
    if !(hi > lo) {
        c
    } else if hi - lo <= 2.0 * h {
        (lo + hi) * 0.5
    } else if c < lo + h {
        lo + h
    } else if c > hi - h {
        hi - h
    } else {
        c
    }
}

/// Sicht des aktiven Blicks mit der kleinsten Teil-ID (Welt-Matrizen aktuell), `None` = kein Blick → Bild wie v1.
pub fn aktive_sicht(w: &Welt, breite: f64, hoehe: f64) -> Option<Sicht> {
    let a = w.arten.iter().position(|x| core::ptr::eq(*x, &ART))?;
    let s = &w.speicher[a];
    let ak = s.zahl(AKTIV);
    let mut best: Option<(u32, usize, usize)> = None;
    for z in 0..s.len() {
        let teil = s.teil[z];
        if teil == 0 || ak[z] == 0.0 {
            continue;
        }
        let Some(tz) = wach(w, teil) else { continue };
        if best.map(|b| teil < b.0).unwrap_or(true) {
            best = Some((teil, z, tz));
        }
    }
    let (teil, z, tz) = best?;
    let zoom = s.zahl(ZOOM)[z];
    let dreh = drehung_welt(w, tz);
    let wm = &w.teile.welt[tz];
    let (mut cx, mut cy) = (wm[4], wm[5]);
    // halbe Ausdehnung der (gedrehten) Sicht in Welteinheiten, achsenparallel umschlossen
    let v = lokal_2d(&[breite * 0.5, hoehe * 0.5, 0.0, -dreh, 0.0, 0.0, zoom, zoom, 1.0]);
    let (c, sn) = (v[0] / zoom, v[1] / zoom);
    let (hb, hh) = (breite * 0.5 / zoom, hoehe * 0.5 / zoom);
    let ex = betrag(c) * hb + betrag(sn) * hh;
    let ey = betrag(sn) * hb + betrag(c) * hh;
    let (gl, go, gr, gu) = (s.zahl(GRENZE_LINKS)[z], s.zahl(GRENZE_OBEN)[z], s.zahl(GRENZE_RECHTS)[z], s.zahl(GRENZE_UNTEN)[z]);
    if gl != 0.0 || go != 0.0 || gr != 0.0 || gu != 0.0 {
        cx = klemme(cx, ex, gl, gr);
        cy = klemme(cy, ey, go, gu);
    }
    let m = mal_2d(&v, &[1.0, 0.0, 0.0, 1.0, -cx, -cy, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    Some(Sicht { teil, m, fest_ab: s.zahl(FEST_AB)[z], welt_min: [cx - ex, cy - ey], welt_max: [cx + ex, cy + ey] })
}
