//! `Koerper` (3D): Form + Material (Farbe, Glanz, Leuchten, Bildchen als Textur), wirft Schatten.
//! Seit H-K2 optional mit geteiltem Material: Zeigt das Nachtragsfeld `belag` auf ein Teil mit `Belag`, gelten dessen Farbe,
//! Glanz, Leuchten und Bildchen statt der eigenen; sonst (karton, entfernt, ohne Belag) die eigenen, ohne Fehler.

use super::*;
use crate::paket::Koerper3;
use crate::schema::{Genus, Feld, Raum, Schema};
use crate::welt::kasten_3d;

pub const FORM: usize = 0;
pub const FARBE: usize = 1;
pub const GLANZ: usize = 2;
pub const LEUCHTEN: usize = 3;
pub const BILD: usize = 4;
pub const SCHATTEN: usize = 5;
/// Nachtragsfeld (H-K2): Teil mit dem geteilten `Belag`, 0 = karton (im Szenen-Hash nur, wenn gesetzt).
pub const BELAG: usize = 6;

pub static ART: Art = Art {
    schema: Schema {
        name: "Koerper", genus: Genus::M,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::form("form"),
            Feld::farbe("farbe", "weiss"),
            Feld::zahl("glanz", 0.3).bereich(0.0, 1.0),
            Feld::zahl("leuchten", 0.0).bereich(0.0, 1.0),
            Feld::bildchen("bild"),
            Feld::diavolo("schatten", true),
            Feld::teil("belag").nachtrag(),
        ],
    },
    bild: Some(bild),
    huelle: Some(huelle),
    ..Art::LEER
};

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (fo, fa, gl, le, bi, sc, be) = (s.zahl(FORM), s.farbe(FARBE), s.zahl(GLANZ), s.zahl(LEUCHTEN), s.zahl(BILD), s.zahl(SCHATTEN), s.zahl(BELAG));
    let belag_art = w.art_index(super::belag::ART.schema.name);
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let Some(netz) = w.ressourcen.netz(fo[z] as u32) else { continue };
        // Material: das des Belags (Sichtbarkeit des Belag-Teils spielt keine Rolle) oder das eigene
        let (farbe, glanz, leuchten, bild) = match belag_art.and_then(|a| Some((a, belag_zeile(w, be[z], a)?))) {
            Some((a, bz)) => {
                let bs = &w.speicher[a];
                (bs.farbe(super::belag::FARBE)[bz], bs.zahl(super::belag::GLANZ)[bz], bs.zahl(super::belag::LEUCHTEN)[bz], bs.zahl(super::belag::BILD)[bz])
            }
            None => (fa[z], gl[z], le[z], bi[z]),
        };
        if netz.index_anzahl == 0 || farbe & 0xFF == 0 {
            continue;
        }
        let m = w.teile.welt[tz];
        let (min, max) = kasten_3d(&m, [netz.min.x as f64, netz.min.y as f64, netz.min.z as f64], [netz.max.x as f64, netz.max.y as f64, netz.max.z as f64]);
        let (uv, seite) = match w.ressourcen.bildchen(bild as u32) {
            Some(t) => ([t.x as u16, t.y as u16, (t.x + t.breite) as u16, (t.y + t.hoehe) as u16], t.seite as i64),
            None => ([0; 4], -1),
        };
        b.koerper.push(Koerper3 {
            teil: s.teil[z],
            netz: fo[z] as u32,
            m,
            farbe,
            glanz,
            leuchten,
            uv,
            seite,
            wirft: sc[z] != 0.0,
            min,
            max,
        });
    }
}

/// Zeile des `Belag` (Art `a`) am Teil `teil`, wenn das Teil lebt und einen Belag hat.
#[inline]
fn belag_zeile(w: &Welt, teil: f64, a: usize) -> Option<usize> {
    if teil == 0.0 {
        return None;
    }
    w.komp_zeile(w.zeile_opt(teil as u32)?, a)
}

fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    let netz = w.ressourcen.netz(s.zahl(FORM)[kz] as u32)?;
    let (a, b) = kasten_3d(&w.teile.welt[tz], [netz.min.x as f64, netz.min.y as f64, netz.min.z as f64], [netz.max.x as f64, netz.max.y as f64, netz.max.z as f64]);
    Some(Huelle::Kasten(a, b))
}
