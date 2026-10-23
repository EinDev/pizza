//! `Rahmen` (2D): ein Bildchen als 9-Slice-Tafel (Unity: Sprite mit Border). Die Ecken bleiben fest (`kante` Bildchen-Pixel,
//! je Bildchen-Pixel `groesse` Spielfeld-Pixel), Kanten und Mitte werden auf `breite` × `hoehe` gestreckt. Mitte = Lage des Teils.
//! Bildbeitrag = bis zu 9 `BILD`-Instanzen mit Atlas-Teilrechtecken (Zeilen oben → unten, je Zeile links → rechts).

use super::*;
use crate::paket::flach_art;
use crate::schema::{Genus, Feld, Raum, Schema};

pub const BILDCHEN: usize = 0;
pub const KANTE: usize = 1;
pub const BREITE: usize = 2;
pub const HOEHE: usize = 3;
pub const GROESSE: usize = 4;
pub const FARBE: usize = 5;

pub static ART: Art = Art {
    schema: Schema {
        name: "Rahmen", genus: Genus::M,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::bildchen("bildchen"),
            Feld::ganz("kante", 4.0).min(0.0),
            Feld::zahl("breite", 64.0).min(0.0),
            Feld::zahl("hoehe", 32.0).min(0.0),
            Feld::zahl("groesse", 1.0).min(0.0),
            Feld::farbe("farbe", "weiss"),
        ],
    },
    nur_test: false,
    takt: None,
    bild: Some(bild),
    huelle: Some(huelle),
};

#[inline]
fn kleiner(a: f64, b: f64) -> f64 {
    if a < b {
        a
    } else {
        b
    }
}

/// Eine Achse in drei Stücke teilen: je Stück (Mitte, halbe Ausdehnung) im Spielfeld und (u0, u1) im Atlas.
/// `voll` = Größe im Spielfeld, `start`/`px` = Atlas-Anfang und Bildchen-Pixel, `k` = Kante in Bildchen-Pixeln (< px/2),
/// `kw` = Kante im Spielfeld (≤ voll/2).
fn drittel(voll: f64, start: u32, px: u32, k: u32, kw: f64) -> [(f64, f64, u16, u16); 3] {
    let a = voll * 0.5;
    let (u0, u1, u2, u3) = (start, start + k, start + px - k, start + px);
    [
        (kw * 0.5 - a, kw * 0.5, u0 as u16, u1 as u16),
        (0.0, (voll - 2.0 * kw) * 0.5, u1 as u16, u2 as u16),
        (a - kw * 0.5, kw * 0.5, u2 as u16, u3 as u16),
    ]
}

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (bc, ka, br, ho, gr, fa) = (s.zahl(BILDCHEN), s.zahl(KANTE), s.zahl(BREITE), s.zahl(HOEHE), s.zahl(GROESSE), s.farbe(FARBE));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let Some(bi) = w.ressourcen.bildchen(bc[z] as u32) else { continue };
        if !(br[z] > 0.0 && ho[z] > 0.0 && br[z].is_finite() && ho[z].is_finite() && gr[z].is_finite()) {
            continue;
        }
        // Kante so begrenzen, dass vom Bildchen mindestens ein Pixel Mitte bleibt; Ecken höchstens halb so groß wie die Tafel
        let grenze = kleiner((bi.breite.saturating_sub(1) / 2) as f64, (bi.hoehe.saturating_sub(1) / 2) as f64);
        let k = kleiner(ka[z], grenze) as u32;
        let ecke = k as f64 * gr[z];
        let (kx, ky) = (kleiner(ecke, br[z] * 0.5), kleiner(ecke, ho[z] * 0.5));
        let spalten = drittel(br[z], bi.x, bi.breite, k, kx);
        let zeilen = drittel(ho[z], bi.y, bi.hoehe, k, ky);
        let m = &w.teile.welt[tz];
        for &(cy, hy, v0, v1) in &zeilen {
            if !(hy > 0.0) {
                continue;
            }
            for &(cx, hx, u0, u1) in &spalten {
                if !(hx > 0.0) {
                    continue;
                }
                b.flach(w.teile.ebene[tz], s.teil[z], m, [cx, cy], [hx, hy], flach_art::BILD, fa[z], [0.0, 0.0], [u0, v0, u1, v1], bi.seite);
            }
        }
    }
}

fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    Some(rechteck_huelle(&w.teile.welt[tz], [0.0, 0.0], [s.zahl(BREITE)[kz] * 0.5, s.zahl(HOEHE)[kz] * 0.5]))
}
