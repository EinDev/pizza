//! `Himmelszelt` (3D, H-K11b): Skybox wie Unity – prozedural (Verlauf `boden` → `horizont` → `oben`, Sonnenscheibe in Richtung
//! der Sonne, Sterne) und/oder sechsseitig aus Bildchen. Hängt an einem beliebigen 3D-Teil; es gilt das **wache** mit der
//! kleinsten Teil-ID (wie `Kamera`; die Sichtbarkeit des Teils spielt keine Rolle). Solange eines da ist, ersetzt es den
//! Verlauf von `herd.himmel(…)` (Flag `HIMMEL` wird gesetzt) und färbt das Umgebungslicht, wenn `herd.umgebung(…)` fehlt.
//!
//! `bilder` = rechts (+x), links (−x), oben (+y), unten (−y), vorn (−z, Standard-Blickrichtung der Kamera), hinten (+z) – als
//! aufgeklapptes Kreuz um `vorn` (Bildoberkante von `oben` grenzt an `hinten`, die von `unten` an `vorn`). Fehlende Seiten
//! (kürzere Liste) bleiben prozedural; Sonne und Sterne gibt es nur auf prozeduralen Seiten. Atlas-Bildchen und eigene
//! Texturen (Teiglinge, `Bildchen.laden`, PROJEKTE PD1/PD3) gehen beide. Kein System, kein Format-Bruch: der Kern schreibt nur
//! Werte in den Abschnitt `HIMMELSZELT` (`paket.rs`), die Glut rechnet die Pixel (`himmel.wgsl`).

use super::*;
use crate::paket::HimmelszeltB;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const BILDER: usize = 0;
pub const OBEN: usize = 1;
pub const HORIZONT: usize = 2;
pub const BODEN: usize = 3;
pub const SONNENSCHEIBE: usize = 4;
pub const STERNE: usize = 5;

pub static ART: Art = Art {
    schema: Schema {
        name: "Himmelszelt",
        genus: Genus::N,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::bildchen_liste("bilder"),
            Feld::farbe("oben", "himmel"),
            Feld::farbe("horizont", "mozzarella"),
            Feld::farbe("boden", "teig"),
            Feld::zahl("sonnenscheibe", 0.0).bereich(0.0, 90.0),
            Feld::zahl("sterne", 0.0).bereich(0.0, 1.0),
        ],
    },
    bild: Some(bild),
    ..Art::LEER
};

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let mut beste: Option<usize> = None;
    for z in 0..s.len() {
        if wach(w, s.teil[z]).is_none() {
            continue;
        }
        if beste.map(|k| s.teil[z] < s.teil[k]).unwrap_or(true) {
            beste = Some(z);
        }
    }
    let Some(z) = beste else { return };
    // Seiten: (Atlas-Rechteck u0 v0 u1 v1, Kennwort wie INST3D.textur – Bit 16 = Bild, Bit 17 = eigene Textur; 0 = prozedural)
    let mut seiten = [([0u16; 4], 0u32); 6];
    for (i, id) in s.liste(BILDER)[z].iter().take(6).enumerate() {
        if let Some(t) = w.ressourcen.bildchen(*id) {
            let wort = if t.seite & crate::ressourcen::TEXTUR_MARKE != 0 { (t.seite & 0xFFFF) | 1 << 16 | 1 << 17 } else { (t.seite & 0xFFFF) | 1 << 16 };
            seiten[i] = ([t.x as u16, t.y as u16, (t.x + t.breite) as u16, (t.y + t.hoehe) as u16], wort);
        }
    }
    b.himmelszelt = Some(HimmelszeltB {
        teil: s.teil[z],
        oben: s.farbe(OBEN)[z],
        horizont: s.farbe(HORIZONT)[z],
        boden: s.farbe(BODEN)[z],
        sonnenscheibe: s.zahl(SONNENSCHEIBE)[z],
        sterne: s.zahl(STERNE)[z],
        seiten,
    });
}
