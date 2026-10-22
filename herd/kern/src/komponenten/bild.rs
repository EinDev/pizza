//! `Bild` (2D): ein Bildchen aus dem Atlas, pixelscharf, mit Tönung und Spiegelung. Mitte = Lage des Teils.

use super::*;
use crate::paket::flach_art;
use crate::schema::{Feld, Raum, Schema};

pub const BILDCHEN: usize = 0;
pub const GROESSE: usize = 1;
pub const FARBE: usize = 2;
pub const SPIEGELN: usize = 3;

pub static ART: Art = Art {
    schema: Schema {
        name: "Bild",
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::bildchen("bildchen"),
            Feld::zahl("groesse", 1.0).min(0.0),
            Feld::farbe("farbe", "weiss"),
            Feld::diavolo("spiegeln", false),
        ],
    },
    nur_test: false,
    takt: None,
    bild: Some(bild),
    huelle: Some(huelle),
};

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (bc, gr, fa, sp) = (s.zahl(BILDCHEN), s.zahl(GROESSE), s.farbe(FARBE), s.zahl(SPIEGELN));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let Some(bi) = w.ressourcen.bildchen(bc[z] as u32) else { continue };
        let mut m = w.teile.welt[tz];
        if sp[z] != 0.0 {
            m[0] = -m[0];
            m[1] = -m[1];
        }
        let h = [bi.breite as f64 * gr[z] * 0.5, bi.hoehe as f64 * gr[z] * 0.5];
        let uv = [bi.x as u16, bi.y as u16, (bi.x + bi.breite) as u16, (bi.y + bi.hoehe) as u16];
        b.flach(w.teile.ebene[tz], s.teil[z], &m, [0.0, 0.0], h, flach_art::BILD, fa[z], [0.0, 0.0], uv, bi.seite);
    }
}

fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    let bi = w.ressourcen.bildchen(s.zahl(BILDCHEN)[kz] as u32)?;
    let g = s.zahl(GROESSE)[kz];
    Some(rechteck_huelle(&w.teile.welt[tz], [0.0, 0.0], [bi.breite as f64 * g * 0.5, bi.hoehe as f64 * g * 0.5]))
}
