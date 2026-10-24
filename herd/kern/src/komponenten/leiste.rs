//! `Leiste` (2D, H-K12): Füllbalken wie ein Unity-`Image` mit Fill (Lebensleiste, Fortschritt) – Hintergrund `farbeLeer` über die
//! ganze Breite, darüber von links der Anteil `wert` (0 … 1) in `farbe`. Mitte = Lage des Teils. Nur Anzeige: kein System, kein
//! Ziel für die Maus.

use super::*;
use crate::paket::flach_art;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const WERT: usize = 0;
pub const BREITE: usize = 1;
pub const HOEHE: usize = 2;
pub const FARBE: usize = 3;
pub const FARBE_LEER: usize = 4;
pub const RUNDUNG: usize = 5;

pub static ART: Art = Art {
    schema: Schema {
        name: "Leiste",
        genus: Genus::F,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::zahl("wert", 0.5).bereich(0.0, 1.0),
            Feld::zahl("breite", 160.0).min(0.0),
            Feld::zahl("hoehe", 14.0).min(0.0),
            Feld::farbe("farbe", "basilikum"),
            Feld::farbe("farbeLeer", "grau"),
            Feld::zahl("rundung", 7.0).min(0.0),
        ],
    },
    bild: Some(bild),
    huelle: Some(huelle),
    ..Art::LEER
};

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (we, br, ho, fa, fl, ru) = (s.zahl(WERT), s.zahl(BREITE), s.zahl(HOEHE), s.farbe(FARBE), s.farbe(FARBE_LEER), s.zahl(RUNDUNG));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let (teil, ebene, m) = (s.teil[z], w.teile.ebene[tz], w.teile.welt[tz]);
        let h = [br[z] * 0.5, ho[z] * 0.5];
        b.flach(ebene, teil, &m, [0.0, 0.0], h, flach_art::RECHTECK, fl[z], [ui::rundung(ru[z], h), 0.0], [0; 4], 0);
        let voll = br[z] * we[z];
        if voll > 0.0 {
            let hv = [voll * 0.5, h[1]];
            b.flach(ebene, teil, &m, [hv[0] - h[0], 0.0], hv, flach_art::RECHTECK, fa[z], [ui::rundung(ru[z], hv), 0.0], [0; 4], 0);
        }
    }
}

fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    Some(rechteck_huelle(&w.teile.welt[tz], [0.0, 0.0], [s.zahl(BREITE)[kz] * 0.5, s.zahl(HOEHE)[kz] * 0.5]))
}
