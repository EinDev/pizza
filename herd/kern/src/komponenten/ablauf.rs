//! `Ablauf` (2D und 3D, H-K4): Keyframes auf der Lage (wie ein Unity Animation Clip). `zeiten` (s, aufsteigend) und je Größe
//! eine Werteliste (`xWerte` …; leer = nicht animiert, kürzer als `zeiten` → der letzte Wert gilt weiter). Zwischen zwei
//! Schlüsseln linear oder sanft. Zeit = Summe von `tempo · DT`; mit `schleife` von vorn, sonst Halt am Ende (`laeuft` → nein).

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};
use crate::welt::lage;

use super::gleiten::{kurve_wert, rest, schreibe_lage};

pub const ZEITEN: usize = 0;
pub const X_WERTE: usize = 1;
pub const Y_WERTE: usize = 2;
pub const Z_WERTE: usize = 3;
pub const DREH_WERTE: usize = 4;
pub const GROESSE_WERTE: usize = 5;
pub const KURVE: usize = 6;
pub const SCHLEIFE: usize = 7;
pub const TEMPO: usize = 8;
pub const ZEIT: usize = 9;
pub const LAEUFT: usize = 10;
/// verborgen: `zeit` nach dem letzten Anwenden (gesetzt von außen → einmal anwenden, auch angehalten)
pub const GESEHEN: usize = 11;

pub static ART: Art = Art {
    schema: Schema {
        name: "Ablauf",
        genus: Genus::M,
        raum: Raum::Beide,
        braucht: &[],
        felder: &[
            Feld::zahl_liste("zeiten").min(0.0),
            Feld::zahl_liste("xWerte"),
            Feld::zahl_liste("yWerte"),
            Feld::zahl_liste("zWerte"),
            Feld::zahl_liste("drehWerte"),
            Feld::zahl_liste("groesseWerte"),
            Feld::wahl("kurve", &["linear", "sanft"], 0),
            Feld::diavolo("schleife", true),
            Feld::zahl("tempo", 1.0),
            Feld::zahl("zeit", 0.0).min(0.0),
            Feld::diavolo("laeuft", true),
            Feld::intern("gesehen", 0.0),
        ],
    },
    takt: Some(takt),
    ..Art::LEER
};

/// Wert der Liste `werte` zur Zeit `t` (Schlüssel `zeiten`); `None` bei leerer Liste.
/// Segment = das erste Paar `zeiten[i] ≤ t < zeiten[i+1]`; vor dem ersten Schlüssel gilt der erste Wert, ab dem letzten der letzte.
fn wert(zeiten: &[f64], werte: &[f64], kurve: u32, t: f64) -> Option<f64> {
    if werte.is_empty() || zeiten.is_empty() {
        return None;
    }
    let w = |i: usize| werte[if i < werte.len() { i } else { werte.len() - 1 }];
    if !(t >= zeiten[0]) {
        return Some(w(0));
    }
    let mut i = 0;
    while i + 1 < zeiten.len() && zeiten[i + 1] <= t {
        i += 1;
    }
    if i + 1 >= zeiten.len() {
        return Some(w(zeiten.len() - 1));
    }
    let (a, b) = (zeiten[i], zeiten[i + 1]);
    let (va, vb) = (w(i), w(i + 1));
    if va.to_bits() == vb.to_bits() {
        return Some(va);
    }
    Some(va + (vb - va) * kurve_wert(kurve, (t - a) / (b - a)))
}

fn takt(w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    let (teile, [kurve, schleife, tempo, zeit, laeuft, gesehen], [zeiten, xw, yw, zw, dw, gw]) = s.zahlen_puffer_mut(
        [KURVE, SCHLEIFE, TEMPO, ZEIT, LAEUFT, GESEHEN],
        [ZEITEN, X_WERTE, Y_WERTE, Z_WERTE, DREH_WERTE, GROESSE_WERTE],
    );
    for z in 0..n {
        let teil = teile[z];
        if teil == 0 || ruht(w, teil) {
            continue;
        }
        let zt = &zeiten[z];
        let Some(&ende) = zt.last() else { continue };
        let laeuft_jetzt = laeuft[z] != 0.0;
        if !laeuft_jetzt && zeit[z].to_bits() == gesehen[z].to_bits() {
            continue;
        }
        let Some(r) = w.zeile_opt(teil) else { continue };
        let mut t = zeit[z];
        if laeuft_jetzt {
            t += tempo[z] * DT;
        }
        if !t.is_finite() {
            t = 0.0;
        }
        if schleife[z] != 0.0 {
            t = if ende > 0.0 { rest(t, ende) } else { 0.0 };
        } else if t >= ende {
            t = ende;
            if laeuft_jetzt && tempo[z] > 0.0 {
                laeuft[z] = 0.0;
            }
        } else if t <= 0.0 {
            t = 0.0;
            if laeuft_jetzt && tempo[z] < 0.0 {
                laeuft[z] = 0.0;
            }
        }
        zeit[z] = t;
        gesehen[z] = t;
        let k = kurve[z] as u32;
        let drei_d = w.teile.drei_d[r];
        let mut ziele: [(usize, &[f64]); 5] =
            [(lage::X, &xw[z]), (lage::Y, &yw[z]), (lage::Z, &zw[z]), (lage::DREHUNG, &dw[z]), (lage::GX, &gw[z])];
        if !drei_d {
            ziele[2].1 = &[];
        }
        for (i, werte) in ziele {
            if let Some(v) = wert(zt, werte, k, t) {
                schreibe_lage(w, r, i, v);
            }
        }
    }
}
