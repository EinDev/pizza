//! `Text` (2D): eingebettete SDF-Schrift (Nunito), eine Glyphe = eine Instanz. `y` des Teils = Oberkante.

use super::*;
use crate::paket::flach_art;
use crate::schema::{Genus, Feld, Raum, Schema};
use crate::schrift;

pub const INHALT: usize = 0;
pub const GROESSE: usize = 1;
pub const FARBE: usize = 2;
pub const AUSRICHTUNG: usize = 3;

pub static ART: Art = Art {
    schema: Schema {
        name: "Text", genus: Genus::M,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::text("inhalt", ""),
            Feld::zahl("groesse", 16.0).min(0.0),
            Feld::farbe("farbe", "ofen"),
            Feld::wahl("ausrichtung", &["links", "mitte", "rechts"], 0),
        ],
    },
    bild: Some(bild),
    huelle: Some(huelle),
    ..Art::LEER
};

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let Some(sch) = b.schrift else { return };
    let (inh, gr, fa, au) = (s.text(INHALT), s.zahl(GROESSE), s.farbe(FARBE), s.zahl(AUSRICHTUNG));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        if inh[z].is_empty() || !(gr[z] > 0.0) {
            continue;
        }
        let (teil, ebene, m) = (s.teil[z], w.teile.ebene[tz], w.teile.welt[tz]);
        let farbe = fa[z];
        schrift::setze(&sch, &inh[z], gr[z] as f32, au[z] as u8, |st| {
            let c = [((st.x0 + st.x1) * 0.5) as f64, ((st.y0 + st.y1) * 0.5) as f64];
            let h = [((st.x1 - st.x0) * 0.5) as f64, ((st.y1 - st.y0) * 0.5) as f64];
            b.flach(ebene, teil, &m, c, h, flach_art::GLYPHE, farbe, [0.0, 0.0], st.px, 0);
        });
    }
}

fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    let sch = schrift::Schrift::eingebettet()?;
    let mut mi = [f32::MAX, f32::MAX];
    let mut ma = [f32::MIN, f32::MIN];
    schrift::setze(&sch, &s.text(INHALT)[kz], s.zahl(GROESSE)[kz] as f32, s.zahl(AUSRICHTUNG)[kz] as u8, |st| {
        mi = [mi[0].min(st.x0), mi[1].min(st.y0)];
        ma = [ma[0].max(st.x1), ma[1].max(st.y1)];
    });
    if mi[0] > ma[0] {
        return None;
    }
    let c = [((mi[0] + ma[0]) * 0.5) as f64, ((mi[1] + ma[1]) * 0.5) as f64];
    let h = [((ma[0] - mi[0]) * 0.5) as f64, ((ma[1] - mi[1]) * 0.5) as f64];
    Some(rechteck_huelle(&w.teile.welt[tz], c, h))
}
