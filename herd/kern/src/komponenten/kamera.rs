//! `Kamera` (3D): perspektivische Kamera; sie blickt entlang ihrer −z-Achse. Es zeichnet die aktive Kamera mit der
//! kleinsten Teil-ID; ohne aktive Kamera gilt die Standardsicht von (0, 3, 8) auf (0, 0, 0).

use super::*;
use crate::paket::KameraB;
use crate::schema::{Genus, Feld, Raum, Schema};

pub const SICHT: usize = 0;
pub const NAH: usize = 1;
pub const FERN: usize = 2;
pub const AKTIV: usize = 3;

pub static ART: Art = Art {
    schema: Schema {
        name: "Kamera", genus: Genus::F,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::zahl("sicht", 60.0).bereich(1.0, 170.0),
            Feld::zahl("nah", 0.1).min(0.001),
            Feld::zahl("fern", 500.0).min(0.001),
            Feld::diavolo("aktiv", true),
        ],
    },
    bild: Some(bild),
    ..Art::LEER
};

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (si, na, fe, ak) = (s.zahl(SICHT), s.zahl(NAH), s.zahl(FERN), s.zahl(AKTIV));
    for z in 0..s.len() {
        if ak[z] == 0.0 {
            continue;
        }
        let Some(tz) = wach(w, s.teil[z]) else { continue };
        b.kameras.push(KameraB { teil: s.teil[z], m: w.teile.welt[tz], sicht: si[z], nah: na[z], fern: fe[z] });
    }
}
