//! `Probe` – nur im Testbau (`cfg(test)` bzw. Feature `probe`). Beweist HERD.md §9: diese eine Datei plus eine Zeile in
//! `komponenten/mod.rs` genügen; Schema, ABI und Speicher behandeln sie ohne weitere Änderung.
//! Seit H-K0 deckt sie auch die Grundlagen ab: je ein Feld `teil-liste` und `zahl-liste`, ein Lesefeld, ein Nachtragsfeld
//! und ein Nachlauf-System.

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const WERT: usize = 0;
pub const AN: usize = 3;
pub const ZIELE: usize = 6;
pub const WERTE: usize = 7;
pub const STAND: usize = 8;
pub const EXTRA: usize = 9;
pub const ZAEHLER: usize = 10;

pub static ART: Art = Art {
    schema: Schema {
        name: "Probe",
        genus: Genus::F,
        raum: Raum::Beide,
        braucht: &[],
        felder: &[
            Feld::zahl("wert", 1.0).bereich(0.0, 10.0),
            Feld::text("name", "probe"),
            Feld::wahl("sorte", &["margherita", "funghi", "diavolo"], 1),
            Feld::diavolo("an", true),
            Feld::farbe("farbe", "basilikum"),
            Feld::ganz("stufe", 3.0).min(0.0),
            Feld::teil_liste("ziele"),
            Feld::zahl_liste("werte").bereich(-100.0, 100.0),
            // Lesefeld: schreibt nur der Nachlauf (= Zähler nach allen Takt-Systemen)
            Feld::zahl("stand", 0.0).lesen(),
            // Nachtragsfeld: im Hash nur, wenn ≠ Standard
            Feld::zahl("extra", 0.0).nachtrag(),
            Feld::intern("zaehler", 0.0),
        ],
    },
    nur_test: true,
    takt: Some(takt),
    nachlauf: Some(nachlauf),
    ..Art::LEER
};

/// System: zählt je Takt `zaehler` um `wert` hoch (nur an angehängten Proben mit `an`).
fn takt(_w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    let (teile, [wert, an, z]) = s.zahlen_mut([WERT, AN, ZAEHLER]);
    for i in 0..n {
        if teile[i] != 0 && an[i] != 0.0 {
            z[i] += wert[i];
        }
    }
}

/// Nachlauf: `stand` = `zaehler` (nach allen Takt-Systemen dieses Takts) an angehängten Proben.
fn nachlauf(_w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    let (teile, [stand, z]) = s.zahlen_mut([STAND, ZAEHLER]);
    for i in 0..n {
        if teile[i] != 0 {
            stand[i] = z[i];
        }
    }
}
