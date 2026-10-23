//! `Rechteck` (2D): gefülltes Rechteck mit Rundung oder nur Umriss (SDF im Shader, kantengeglättet).

use super::*;
use crate::paket::flach_art;
use crate::schema::{Genus, Feld, Raum, Schema};

pub const BREITE: usize = 0;
pub const HOEHE: usize = 1;
pub const FARBE: usize = 2;
pub const RUNDUNG: usize = 3;
pub const UMRISS: usize = 4;

pub static ART: Art = Art {
    schema: Schema {
        name: "Rechteck", genus: Genus::N,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::zahl("breite", 10.0).min(0.0),
            Feld::zahl("hoehe", 10.0).min(0.0),
            Feld::farbe("farbe", "weiss"),
            Feld::zahl("rundung", 0.0).min(0.0),
            Feld::zahl("umriss", 0.0).min(0.0),
        ],
    },
    bild: Some(bild),
    huelle: Some(huelle),
    ..Art::LEER
};

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (br, ho, fa, ru, um) = (s.zahl(BREITE), s.zahl(HOEHE), s.farbe(FARBE), s.zahl(RUNDUNG), s.zahl(UMRISS));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        b.flach(
            w.teile.ebene[tz],
            s.teil[z],
            &w.teile.welt[tz],
            [0.0, 0.0],
            [br[z] * 0.5, ho[z] * 0.5],
            flach_art::RECHTECK,
            fa[z],
            [ru[z], um[z]],
            [0; 4],
            0,
        );
    }
}

fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    Some(rechteck_huelle(&w.teile.welt[tz], [0.0, 0.0], [s.zahl(BREITE)[kz] * 0.5, s.zahl(HOEHE)[kz] * 0.5]))
}
