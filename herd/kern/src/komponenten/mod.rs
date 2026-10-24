//! Komponenten-Registry (Schicht 3, HERD.md §3.3 und §9).
//!
//! Eine Komponente = **ein Modul** mit `pub static ART: Art` (Schema, optional System, Bildbeitrag, Hülle) und
//! **eine Zeile** in `ARTEN` unten. Die Position in `ARTEN` ist die Typnummer (1 …) und die Systemreihenfolge.
//! Nichts sonst muss sich ändern: Schema, ABI, Sprache und Speicher arbeiten generisch.

use crate::paket::Bildbau;
use crate::schema::{Schema, Speicher};
use crate::welt::Welt;

pub mod ablauf;
pub mod animation;
pub mod belag;
pub mod bewegung;
pub mod bild;
pub mod blick;
pub mod fuehler;
pub mod funken;
pub mod gleiten;
pub mod kamera;
pub mod koerper;
pub mod kreis;
pub mod leine;
pub mod licht;
pub mod linie;
pub mod partikel;
pub mod rahmen;
pub mod rechteck;
pub mod text;
pub mod wucht;
pub mod vieleck;
#[cfg(any(test, feature = "probe"))]
pub mod probe;

/// Hülle für `trifft` (SPEC §18.4) und `Fuehler` (H-K6), in Weltlage.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Huelle {
    /// 2D-Kreis: Mitte, Radius
    Kreis([f64; 2], f64),
    /// 2D-Rechteck achsenparallel: min, max
    Rechteck([f64; 2], [f64; 2]),
    /// 3D-Quader achsenparallel: min, max
    Kasten([f64; 3], [f64; 3]),
    /// 3D-Kugel: Mitte, Radius (nur `Fuehler` mit `form: kugel`; keine v1-Komponente liefert sie)
    Kugel([f64; 3], f64),
}

/// Überlappen sich zwei Hüllen? (`Teil.trifft`, Engphase von `Fuehler`/`Wucht`.) Ränder zählen; Kreis-/Kugelabstand ohne Wurzel
/// (Quadrate); verschiedene Räume (2D gegen 3D) → nein.
pub fn trifft(a: Huelle, b: Huelle) -> bool {
    fn kreis_rechteck(m: [f64; 2], r: f64, lo: [f64; 2], hi: [f64; 2]) -> bool {
        let qx = if m[0] < lo[0] { lo[0] } else if m[0] > hi[0] { hi[0] } else { m[0] };
        let qy = if m[1] < lo[1] { lo[1] } else if m[1] > hi[1] { hi[1] } else { m[1] };
        let (dx, dy) = (m[0] - qx, m[1] - qy);
        dx * dx + dy * dy <= r * r
    }
    fn kugel_kasten(m: [f64; 3], r: f64, lo: [f64; 3], hi: [f64; 3]) -> bool {
        let mut d = 0.0;
        for i in 0..3 {
            let q = if m[i] < lo[i] { lo[i] } else if m[i] > hi[i] { hi[i] } else { m[i] };
            d += (m[i] - q) * (m[i] - q);
        }
        d <= r * r
    }
    match (a, b) {
        (Huelle::Kreis(m1, r1), Huelle::Kreis(m2, r2)) => {
            let (dx, dy) = (m1[0] - m2[0], m1[1] - m2[1]);
            dx * dx + dy * dy <= (r1 + r2) * (r1 + r2)
        }
        (Huelle::Kreis(m, r), Huelle::Rechteck(lo, hi)) | (Huelle::Rechteck(lo, hi), Huelle::Kreis(m, r)) => kreis_rechteck(m, r, lo, hi),
        (Huelle::Rechteck(a0, a1), Huelle::Rechteck(b0, b1)) => a0[0] <= b1[0] && b0[0] <= a1[0] && a0[1] <= b1[1] && b0[1] <= a1[1],
        (Huelle::Kasten(a0, a1), Huelle::Kasten(b0, b1)) => (0..3).all(|i| a0[i] <= b1[i] && b0[i] <= a1[i]),
        (Huelle::Kugel(m1, r1), Huelle::Kugel(m2, r2)) => {
            let (dx, dy, dz) = (m1[0] - m2[0], m1[1] - m2[1], m1[2] - m2[2]);
            dx * dx + dy * dy + dz * dz <= (r1 + r2) * (r1 + r2)
        }
        (Huelle::Kugel(m, r), Huelle::Kasten(lo, hi)) | (Huelle::Kasten(lo, hi), Huelle::Kugel(m, r)) => kugel_kasten(m, r, lo, hi),
        _ => false,
    }
}

/// System: läuft je Takt einmal über den dichten Speicher seiner Art (`dt = 1/60`).
pub type TaktFn = fn(&mut Welt, &mut Speicher);
/// Bildbeitrag: legt Instanzen/Lichter/Kameras in den Bildbau (Welt-Matrizen sind aktuell).
pub type BildFn = fn(&Welt, &Speicher, &mut Bildbau);
/// Hülle der Komponente in Zeile `kz` am Teil in Zeile `tz` (Welt-Matrix aktuell).
pub type HuelleFn = fn(&Welt, &Speicher, usize, usize) -> Option<Huelle>;

/// Beschreibung einer Komponentenart. Literale schreiben `Art { schema: …, takt: …, ..Art::LEER }` (HERD.md §12.1 Regel 9),
/// damit neue Felder von `Art` keine Komponenten-Datei ändern.
pub struct Art {
    pub schema: Schema,
    /// Nur im Testbau (fehlt in `schema.json` und `kern.wasm`).
    pub nur_test: bool,
    /// System: je Takt nach `fn()`, Arten in Typnummer-Reihenfolge.
    pub takt: Option<TaktFn>,
    /// Nachlauf-System (H-K0, wie Unity `LateUpdate`): je Takt nach **allen** `takt`-Systemen, in Typnummer-Reihenfolge.
    pub nachlauf: Option<TaktFn>,
    pub bild: Option<BildFn>,
    pub huelle: Option<HuelleFn>,
}

impl Art {
    /// Leere Art: Grundlage für `..Art::LEER` in den Komponenten-Literalen.
    pub const LEER: Art = Art { schema: Schema::LEER, nur_test: false, takt: None, nachlauf: None, bild: None, huelle: None };
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
    &linie::ART,
    &rahmen::ART,
    &funken::ART,
    &gleiten::ART,
    &ablauf::ART,
    &belag::ART,
    &fuehler::ART,
    &blick::ART,
    &leine::ART,
    &wucht::ART,
    &vieleck::ART,
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
