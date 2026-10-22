//! `Probe` – nur im Testbau (`cfg(test)` bzw. Feature `probe`). Beweist HERD.md §9: diese eine Datei plus eine Zeile in
//! `komponenten/mod.rs` genügen; Schema, ABI und Speicher behandeln sie ohne weitere Änderung.

use super::*;
use crate::schema::{Feld, Raum, Schema};

pub const WERT: usize = 0;
pub const ZAEHLER: usize = 6;

pub static ART: Art = Art {
    schema: Schema {
        name: "Probe",
        raum: Raum::Beide,
        braucht: &[],
        felder: &[
            Feld::zahl("wert", 1.0).bereich(0.0, 10.0),
            Feld::text("name", "probe"),
            Feld::wahl("sorte", &["margherita", "funghi", "diavolo"], 1),
            Feld::diavolo("an", true),
            Feld::farbe("farbe", "basilikum"),
            Feld::ganz("stufe", 3.0).min(0.0),
            Feld::intern("zaehler", 0.0),
        ],
    },
    nur_test: true,
    takt: Some(takt),
    bild: None,
    huelle: None,
};

/// System: zählt je Takt `zaehler` um `wert` hoch (nur an angehängten Proben mit `an`).
fn takt(_w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    let (teile, [wert, an, z]) = s.zahlen_mut([WERT, 3, ZAEHLER]);
    for i in 0..n {
        if teile[i] != 0 && an[i] != 0.0 {
            z[i] += wert[i];
        }
    }
}
