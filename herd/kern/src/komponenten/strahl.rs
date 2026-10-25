//! `Strahl` (3D, H-K20): Strahl-Abfrage wie Unity `Physics.Raycast` als **berechnete Lesefelder** (HERD.md §13.1 Regel 6,
//! Haken `lies` aus H-K12): `getroffen`, `abstand`, `punktX/Y/Z`, `normaleX/Y/Z` werden beim Lesen gegen die Welt im
//! Lesezeitpunkt gerechnet und nie in die Spalten geschrieben (Szenen-Hash unverändert). Das Ergebnis gilt bis zur nächsten
//! Änderung der Welt ([`Welt::stand`]); mehrere Lesefelder desselben Strahls kosten eine Abfrage.
//!
//! Ursprung = Weltlage des Teils, Richtung `richtungX/Y/Z` in Welt- oder Teil-Achsen (`achsen`), bis `laenge`; `ausMaus` ja: von
//! der aktiven Kamera (kleinste wache ID, sonst die Standardsicht) durch die Maus (H-K12). Ziele sind 3D-Fühler-Formen (wach,
//! sichtbar, Gruppe in `maske`, Auslöser nur mit `ausloeser` ja), gedreht wie in der Physik ([`kollision3d::ziele`]); das eigene
//! Teil nie. Nächster Treffer gewinnt, Gleichstand → kleinere Teil-ID. Kein Treffer: `getroffen` = `karton`, Zahlen 0.
//! Höhenabfrage: Strahl nach unten gegen ein Gelände mit `form: "netz"` – genau die gezeichnete Fläche.

use alloc::vec::Vec;

use super::*;
use crate::kollision3d::{self, Treffer, Umgebung, V};
use crate::schema::{Feld, Genus, Raum, Schema};
use crate::welt::GRAD;

pub const RICHTUNG_X: usize = 0;
pub const RICHTUNG_Y: usize = 1;
pub const RICHTUNG_Z: usize = 2;
pub const ACHSEN: usize = 3;
pub const LAENGE: usize = 4;
pub const MASKE: usize = 5;
pub const AUSLOESER: usize = 6;
pub const AUS_MAUS: usize = 7;
/// Lesefelder (beim Lesen berechnet)
pub const GETROFFEN: usize = 8;
pub const ABSTAND: usize = 9;
pub const PUNKT: usize = 10;
pub const NORMALE: usize = 13;

pub static ART: Art = Art {
    schema: Schema {
        name: "Strahl",
        genus: Genus::M,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::zahl("richtungX", 0.0),
            Feld::zahl("richtungY", -1.0),
            Feld::zahl("richtungZ", 0.0),
            Feld::wahl("achsen", &["welt", "teil"], 0),
            Feld::zahl("laenge", 1000.0).min(0.0),
            Feld::ganz("maske", 4_294_967_295.0).bereich(0.0, 4_294_967_295.0),
            Feld::diavolo("ausloeser", false),
            Feld::diavolo("ausMaus", false),
            Feld::teil("getroffen").lesen(),
            Feld::zahl("abstand", 0.0).lesen(),
            Feld::zahl("punktX", 0.0).lesen(),
            Feld::zahl("punktY", 0.0).lesen(),
            Feld::zahl("punktZ", 0.0).lesen(),
            Feld::zahl("normaleX", 0.0).lesen(),
            Feld::zahl("normaleY", 0.0).lesen(),
            Feld::zahl("normaleZ", 0.0).lesen(),
        ],
    },
    lies: Some(lies),
    ..Art::LEER
};

/// Ergebnis einer Abfrage: getroffenes Teil (0 = keines), Abstand, Punkt, Normale.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Ergebnis {
    pub teil: u32,
    pub abstand: f64,
    pub punkt: V,
    pub normale: V,
}

/// Zwischenergebnisse der Strahl-Abfragen für einen Stand der Welt (nicht im Szenen-Hash): die Ziele und je Speicherzeile des
/// `Strahl` das Ergebnis. Ein neuer Stand verwirft alles.
#[derive(Clone, Debug, Default)]
pub struct Abfragen {
    pub stand: u64,
    pub gueltig: bool,
    pub ziele: Vec<kollision3d::Ziel>,
    pub ergebnisse: Vec<Option<Ergebnis>>,
}

fn lies(w: &mut Welt, a: usize, z: usize, feld: usize) -> Option<f64> {
    if !(GETROFFEN..NORMALE + 3).contains(&feld) {
        return None;
    }
    let e = ergebnis(w, a, z);
    Some(match feld {
        GETROFFEN => e.teil as f64,
        ABSTAND => e.abstand,
        f if f < NORMALE => e.punkt[f - PUNKT],
        f => e.normale[f - NORMALE],
    })
}

/// Ergebnis des Strahls in Speicherzeile `z` (Art-Index `a`) – aus dem Zwischenspeicher, wenn sich die Welt seitdem nicht
/// geändert hat.
pub fn ergebnis(w: &mut Welt, a: usize, z: usize) -> Ergebnis {
    if !(w.abfragen.gueltig && w.abfragen.stand == w.stand) {
        let ziele = kollision3d::ziele(w);
        w.abfragen = Abfragen { stand: w.stand, gueltig: true, ziele, ergebnisse: Vec::new() };
    }
    if let Some(Some(e)) = w.abfragen.ergebnisse.get(z) {
        return *e;
    }
    let e = rechne(w, a, z);
    let liste = &mut w.abfragen.ergebnisse;
    if liste.len() <= z {
        liste.resize(z + 1, None);
    }
    liste[z] = Some(e);
    e
}

/// Ursprung und Richtung (Länge 1) durch die Maus von der aktiven Kamera (wie `paket.rs`: kleinste wache aktive ID, sonst
/// (0, 3, 8) mit Blick auf den Ursprung, Sicht 60°).
fn maus_strahl(w: &mut Welt) -> Option<(V, V)> {
    let mut kam: Option<(u32, usize, f64)> = None;
    if let Some(k) = w.art_index("Kamera") {
        let s = &w.speicher[k];
        for kz in 0..s.len() {
            if s.zahl(kamera::AKTIV)[kz] == 0.0 {
                continue;
            }
            let teil = s.teil[kz];
            let Some(tz) = wach(w, teil) else { continue };
            if kam.is_none_or(|(t, ..)| teil < t) {
                kam = Some((teil, tz, s.zahl(kamera::SICHT)[kz]));
            }
        }
    }
    let norm = |v: V, e: V| kollision3d::norm_oder(v, e);
    let (auge, vorn, oben, sicht) = match kam {
        Some((_, tz, sicht)) => {
            w.aktualisiere(tz);
            let m = w.teile.welt[tz];
            ([m[3], m[7], m[11]], norm([-m[2], -m[6], -m[10]], [0.0, 0.0, -1.0]), norm([m[1], m[5], m[9]], [0.0, 1.0, 0.0]), sicht)
        }
        None => ([0.0, 3.0, 8.0], norm([0.0, -3.0, -8.0], [0.0, 0.0, -1.0]), [0.0, 1.0, 0.0], 60.0),
    };
    // Achsen wie die Ansichtsmatrix (paket::blick)
    let mut o = oben;
    if betrag(kollision3d::punkt(vorn, o)) > 0.999 {
        o = if betrag(vorn[1]) > 0.5 { [0.0, 0.0, -1.0] } else { [0.0, 1.0, 0.0] };
    }
    let rechts = norm(kollision3d::kreuz(vorn, o), [1.0, 0.0, 0.0]);
    let hoch = kollision3d::kreuz(rechts, vorn);
    let (b, h) = (w.breite as f64, w.hoehe as f64);
    if !(b > 0.0 && h > 0.0) {
        return None;
    }
    let f = libm::tan(sicht * GRAD * 0.5);
    let nx = (2.0 * w.eingabe.maus[0] / b - 1.0) * f * (b / h);
    let ny = (1.0 - 2.0 * w.eingabe.maus[1] / h) * f;
    let d = kollision3d::plus(kollision3d::plus(vorn, kollision3d::mal(rechts, nx)), kollision3d::mal(hoch, ny));
    Some((auge, norm(d, vorn)))
}

fn rechne(w: &mut Welt, a: usize, z: usize) -> Ergebnis {
    let leer = Ergebnis::default();
    let teil = w.speicher[a].teil[z];
    let Some(tz) = wach(w, teil) else { return leer };
    w.aktualisiere(tz);
    let s = &w.speicher[a];
    let (laenge, maske, ausloeser) = (s.zahl(LAENGE)[z], s.zahl(MASKE)[z] as u32, s.zahl(AUSLOESER)[z] != 0.0);
    let (o, d) = if s.zahl(AUS_MAUS)[z] != 0.0 {
        match maus_strahl(w) {
            Some(x) => x,
            None => return leer,
        }
    } else {
        let m = w.teile.welt[tz];
        let r = [s.zahl(RICHTUNG_X)[z], s.zahl(RICHTUNG_Y)[z], s.zahl(RICHTUNG_Z)[z]];
        let r = if s.zahl(ACHSEN)[z] != 0.0 {
            let (u, _) = kollision3d::achsen(&m);
            kollision3d::plus(kollision3d::plus(kollision3d::mal(u[0], r[0]), kollision3d::mal(u[1], r[1])), kollision3d::mal(u[2], r[2]))
        } else {
            r
        };
        let l = kollision3d::laenge(r);
        if !(l > 1e-300 && l.is_finite()) {
            return leer;
        }
        ([m[3], m[7], m[11]], kollision3d::mal(r, 1.0 / l))
    };
    if !(laenge >= 0.0) || !o.iter().chain(d.iter()).all(|x| x.is_finite()) {
        return leer;
    }
    let gi = w.art_index("Gelaende");
    let u = Umgebung { ressourcen: &w.ressourcen, gelaende: gi.map(|g| &w.speicher[g]) };
    match kollision3d::strahl_ziele(&w.abfragen.ziele, &u, o, d, laenge, teil, maske, ausloeser) {
        Some((i, Treffer { t, n })) => Ergebnis { teil: w.abfragen.ziele[i].teil, abstand: t, punkt: kollision3d::plus(o, kollision3d::mal(d, t)), normale: n },
        None => leer,
    }
}
