//! `Belag` (3D, H-K2): geteiltes Material wie Unity `Material`. Hängt an einem eigenen Teil (meist `herd.raum()`); jeder
//! `Koerper`, dessen Nachtragsfeld `belag` auf dieses Teil zeigt, zeichnet mit Farbe, Glanz, Leuchten und Bildchen des Belags
//! statt mit den eigenen (`koerper.rs`). Kein System, kein eigener Bildbeitrag: einen Wert ändern, alle Körper ändern sich.
//! Nachtragsfelder „Material“ (Oberflächen): `relief` (Bild mit Normale x, y in R, G und Rauheit in B), `kachel` (Wiederholung bzw.
//! Kachelgröße in Weltmaß), `abbildung` (uv | welt), `modell` (klassisch | pbr: GGX, Fresnel, Umgebungsglanz), `metall`, `nass`
//! (Pfützen und Feuchte) – als Zusatzstrom `ZUSATZ3D` je Instanz im Bildpaket (`paket.rs`), nur wenn benutzt.

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const FARBE: usize = 0;
pub const GLANZ: usize = 1;
pub const LEUCHTEN: usize = 2;
pub const BILD: usize = 3;
/// Nachtragsfeld (Stimmung): Faktor auf `leuchten` wie `Koerper.strahlen`.
pub const STRAHLEN: usize = 4;
/// Nachtragsfelder „Material“
pub const RELIEF: usize = 5;
pub const KACHEL: usize = 6;
pub const ABBILDUNG: usize = 7;
pub const MODELL: usize = 8;
pub const METALL: usize = 9;
pub const NASS: usize = 10;

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
            Feld::bildchen("relief").nachtrag(),
            Feld::zahl("kachel", 0.0).bereich(0.0, 10000.0).nachtrag(),
            Feld::wahl("abbildung", &["uv", "welt"], 0).nachtrag(),
            Feld::wahl("modell", &["klassisch", "pbr"], 0).nachtrag(),
            Feld::zahl("metall", 0.0).bereich(0.0, 1.0).nachtrag(),
            Feld::zahl("nass", 0.0).bereich(0.0, 1.0).nachtrag(),
        ],
    },
    ..Art::LEER
};

/// Zusatzwörter je Instanz (Abschnitt `ZUSATZ3D`): Relief-Kennwort wie `INST3D.textur` (nur eigene Texturen, sonst 0),
/// `kachel` und `metall` als f32-Bits, Merkmale (Bit 0 pbr, Bit 1 Welt-Abbildung, Bits 8–15 nass · 255). Alles 0 = v1.
pub fn zusatz(w: &Welt, s: &Speicher, z: usize) -> [u32; 4] {
    let relief = match w.ressourcen.bildchen(s.zahl(RELIEF)[z] as u32) {
        Some(t) if t.seite & crate::ressourcen::TEXTUR_MARKE != 0 => (t.seite & 0xFFFF) | 1 << 16 | 1 << 17,
        _ => 0,
    };
    let nass = (s.zahl(NASS)[z] * 255.0 + 0.5) as u32;
    let merkmale = (s.zahl(MODELL)[z] as u32 & 1) | (s.zahl(ABBILDUNG)[z] as u32 & 1) << 1 | (nass & 255) << 8;
    [relief, crate::paket::f32w(s.zahl(KACHEL)[z]).to_bits(), crate::paket::f32w(s.zahl(METALL)[z]).to_bits(), merkmale]
}
