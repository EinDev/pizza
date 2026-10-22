//! `Kreis` (2D): gefüllter Kreis oder Ring (Umriss), SDF im Shader.

use super::*;
use crate::paket::flach_art;
use crate::schema::{Genus, Feld, Raum, Schema};

pub const RADIUS: usize = 0;
pub const FARBE: usize = 1;
pub const UMRISS: usize = 2;

pub static ART: Art = Art {
    schema: Schema {
        name: "Kreis", genus: Genus::M,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[Feld::zahl("radius", 10.0).min(0.0), Feld::farbe("farbe", "weiss"), Feld::zahl("umriss", 0.0).min(0.0)],
    },
    nur_test: false,
    takt: None,
    bild: Some(bild),
    huelle: Some(huelle),
};

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (r, fa, um) = (s.zahl(RADIUS), s.farbe(FARBE), s.zahl(UMRISS));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        b.flach(w.teile.ebene[tz], s.teil[z], &w.teile.welt[tz], [0.0, 0.0], [r[z], r[z]], flach_art::KREIS, fa[z], [0.0, um[z]], [0; 4], 0);
    }
}

fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    let m = &w.teile.welt[tz];
    Some(Huelle::Kreis([m[4], m[5]], s.zahl(RADIUS)[kz] * massstab_2d(m)))
}
