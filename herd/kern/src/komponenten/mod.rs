//! Komponenten-Registry (Schicht 3, HERD.md §3.3 und §9).
//!
//! Eine Komponente = **ein Modul** mit `pub static ART: Art` (Schema, optional System, Bildbeitrag, Hülle) und
//! **eine Zeile** in `ARTEN` unten. Die Position in `ARTEN` ist die Typnummer (1 …) und die Systemreihenfolge.
//! Nichts sonst muss sich ändern: Schema, ABI, Sprache und Speicher arbeiten generisch.

use crate::paket::Bildbau;
use crate::schema::{Schema, Speicher};
use crate::welt::Welt;

pub mod animation;
pub mod bewegung;
pub mod bild;
pub mod kamera;
pub mod koerper;
pub mod kreis;
pub mod licht;
pub mod partikel;
pub mod rechteck;
pub mod text;
#[cfg(any(test, feature = "probe"))]
pub mod probe;

/// Hülle für `trifft` (SPEC §18.4), in Weltlage.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Huelle {
    /// 2D-Kreis: Mitte, Radius
    Kreis([f64; 2], f64),
    /// 2D-Rechteck achsenparallel: min, max
    Rechteck([f64; 2], [f64; 2]),
    /// 3D-Quader achsenparallel: min, max
    Kasten([f64; 3], [f64; 3]),
}

/// System: läuft je Takt einmal über den dichten Speicher seiner Art (`dt = 1/60`).
pub type TaktFn = fn(&mut Welt, &mut Speicher);
/// Bildbeitrag: legt Instanzen/Lichter/Kameras in den Bildbau (Welt-Matrizen sind aktuell).
pub type BildFn = fn(&Welt, &Speicher, &mut Bildbau);
/// Hülle der Komponente in Zeile `kz` am Teil in Zeile `tz` (Welt-Matrix aktuell).
pub type HuelleFn = fn(&Welt, &Speicher, usize, usize) -> Option<Huelle>;

/// Beschreibung einer Komponentenart.
pub struct Art {
    pub schema: Schema,
    /// Nur im Testbau (fehlt in `schema.json` und `kern.wasm`).
    pub nur_test: bool,
    pub takt: Option<TaktFn>,
    pub bild: Option<BildFn>,
    pub huelle: Option<HuelleFn>,
}

/// Zeitschritt eines Takts (Sekunden).
pub const DT: f64 = 1.0 / 60.0;

/// Die Registry. Eine Zeile je Komponente; Reihenfolge = Typnummer und Systemreihenfolge.
pub static ARTEN: &[&Art] = &[
    &rechteck::ART,
    &kreis::ART,
    &text::ART,
    &bild::ART,
    &koerper::ART,
    &licht::ART,
    &kamera::ART,
    &bewegung::ART,
    &animation::ART,
    &partikel::ART,
    #[cfg(any(test, feature = "probe"))]
    &probe::ART,
];

/// 2D-Rechteck-Hülle aus einer lokalen Box (Mitte `c`, halbe Ausdehnung `h`) unter der 2D-Welt-Matrix `m`.
pub fn rechteck_huelle(m: &[f64; 12], c: [f64; 2], h: [f64; 2]) -> Huelle {
    let mx = m[0] * c[0] + m[2] * c[1] + m[4];
    let my = m[1] * c[0] + m[3] * c[1] + m[5];
    let ex = betrag(m[0]) * h[0] + betrag(m[2]) * h[1];
    let ey = betrag(m[1]) * h[0] + betrag(m[3]) * h[1];
    Huelle::Rechteck([mx - ex, my - ey], [mx + ex, my + ey])
}

#[inline]
pub fn betrag(x: f64) -> f64 {
    if x < 0.0 {
        -x
    } else {
        x
    }
}

/// Größter Maßstab einer 2D-Welt-Matrix (Länge der längeren Achse).
pub fn massstab_2d(m: &[f64; 12]) -> f64 {
    let a = libm::sqrt(m[0] * m[0] + m[1] * m[1]);
    let b = libm::sqrt(m[2] * m[2] + m[3] * m[3]);
    if a > b {
        a
    } else {
        b
    }
}

/// Zeile des Teils, wenn die Komponente hängt und das Teil (vererbt) sichtbar ist.
#[inline]
pub fn sichtbar(w: &Welt, teil: u32) -> Option<usize> {
    if teil == 0 {
        return None;
    }
    let z = w.zeile_opt(teil)?;
    if w.teile.welt_sichtbar[z] {
        Some(z)
    } else {
        None
    }
}
