//! `Linie` (2D): Strecke von der Lage des Teils zum Endpunkt `(zuX, zuY)` (relativ zum Teil), optional mit runden Enden.
//! Bildbeitrag = ein `RECHTECK` längs der Strecke (Unity: LineRenderer mit zwei Punkten).

use super::*;
use crate::paket::flach_art;
use crate::schema::{Genus, Feld, Raum, Schema};

pub const ZU_X: usize = 0;
pub const ZU_Y: usize = 1;
pub const DICKE: usize = 2;
pub const FARBE: usize = 3;
pub const RUND: usize = 4;

pub static ART: Art = Art {
    schema: Schema {
        name: "Linie", genus: Genus::F,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::zahl("zuX", 100.0),
            Feld::zahl("zuY", 0.0),
            Feld::zahl("dicke", 2.0).min(0.0),
            Feld::farbe("farbe", "ofen"),
            Feld::diavolo("rund", false),
        ],
    },
    nur_test: false,
    takt: None,
    bild: Some(bild),
    huelle: Some(huelle),
};

/// Lokale Box der Strecke: Matrix (Welt · Drehung zur Strecke), Mitte, halbe Ausdehnung, Rundung.
/// `None` bei Länge 0 oder Dicke 0 (nichts zu zeichnen). Richtung ohne Winkel: (cos, sin) = (dx, dy) / Länge.
fn box_der_linie(m: &[f64; 12], dx: f64, dy: f64, dicke: f64, rund: bool) -> Option<([f64; 12], [f64; 2], [f64; 2], f64)> {
    let laenge = libm::sqrt(dx * dx + dy * dy);
    if !(laenge > 0.0 && laenge.is_finite() && dicke > 0.0 && dicke.is_finite()) {
        return None;
    }
    let (c, s) = (dx / laenge, dy / laenge);
    let mut r = *m;
    r[0] = m[0] * c + m[2] * s;
    r[1] = m[1] * c + m[3] * s;
    r[2] = m[2] * c - m[0] * s;
    r[3] = m[3] * c - m[1] * s;
    let d = dicke * 0.5;
    // runde Enden: die Halbkreise liegen um die Endpunkte, das Rechteck wird je Seite um dicke/2 länger
    let (hl, rundung) = if rund { (laenge * 0.5 + d, d) } else { (laenge * 0.5, 0.0) };
    Some((r, [laenge * 0.5, 0.0], [hl, d], rundung))
}

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (zx, zy, di, fa, ru) = (s.zahl(ZU_X), s.zahl(ZU_Y), s.zahl(DICKE), s.farbe(FARBE), s.zahl(RUND));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let Some((m, c, h, rundung)) = box_der_linie(&w.teile.welt[tz], zx[z], zy[z], di[z], ru[z] != 0.0) else { continue };
        b.flach(w.teile.ebene[tz], s.teil[z], &m, c, h, flach_art::RECHTECK, fa[z], [rundung, 0.0], [0; 4], 0);
    }
}

fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    let (m, c, h, _) =
        box_der_linie(&w.teile.welt[tz], s.zahl(ZU_X)[kz], s.zahl(ZU_Y)[kz], s.zahl(DICKE)[kz], s.zahl(RUND)[kz] != 0.0)?;
    Some(rechteck_huelle(&m, c, h))
}
