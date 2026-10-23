//! `Licht` (3D): Punktlicht (Lage des Teils) oder Sonne (Lage = Richtung zur Sonne). Höchstens 8 Punktlichter je Bild
//! (die nächsten zur Kamera), eine Sonne (kleinste Teil-ID).

use super::*;
use crate::paket::LichtB;
use crate::schema::{Genus, Feld, Raum, Schema};

pub const ART_FELD: usize = 0;
pub const FARBE: usize = 1;
pub const STAERKE: usize = 2;
pub const REICHWEITE: usize = 3;
pub const SCHATTEN: usize = 4;

pub static ART: Art = Art {
    schema: Schema {
        name: "Licht", genus: Genus::N,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::wahl("art", &["punkt", "sonne"], 0),
            Feld::farbe("farbe", "weiss"),
            Feld::zahl("staerke", 1.0).min(0.0),
            Feld::zahl("reichweite", 10.0).min(0.0),
            Feld::diavolo("schatten", true),
        ],
    },
    bild: Some(bild),
    ..Art::LEER
};

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (ar, fa, st, rw, sc) = (s.zahl(ART_FELD), s.farbe(FARBE), s.zahl(STAERKE), s.zahl(REICHWEITE), s.zahl(SCHATTEN));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let m = &w.teile.welt[tz];
        b.lichter.push(LichtB {
            teil: s.teil[z],
            sonne: ar[z] == 1.0,
            pos: [m[3], m[7], m[11]],
            farbe: fa[z],
            staerke: st[z],
            reichweite: rw[z],
            schatten: sc[z] != 0.0,
        });
    }
}
