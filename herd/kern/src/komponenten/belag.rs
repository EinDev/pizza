//! `Belag` (3D, H-K2): geteiltes Material wie Unity `Material`. Hängt an einem eigenen Teil (meist `herd.raum()`); jeder
//! `Koerper`, dessen Nachtragsfeld `belag` auf dieses Teil zeigt, zeichnet mit Farbe, Glanz, Leuchten und Bildchen des Belags
//! statt mit den eigenen (`koerper.rs`). Kein System, kein eigener Bildbeitrag: einen Wert ändern, alle Körper ändern sich.

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const FARBE: usize = 0;
pub const GLANZ: usize = 1;
pub const LEUCHTEN: usize = 2;
pub const BILD: usize = 3;
/// Nachtragsfeld (Stimmung): Faktor auf `leuchten` wie `Koerper.strahlen`.
pub const STRAHLEN: usize = 4;

pub static ART: Art = Art {
    schema: Schema {
        name: "Belag",
        genus: Genus::M,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::farbe("farbe", "weiss"),
            Feld::zahl("glanz", 0.3).bereich(0.0, 1.0),
            Feld::zahl("leuchten", 0.0).bereich(0.0, 1.0),
            Feld::bildchen("bild"),
            Feld::zahl("strahlen", 1.0).bereich(0.0, 1000.0).nachtrag(),
        ],
    },
    ..Art::LEER
};
