//! `Licht` (3D): Punktlicht (Lage des Teils) oder Sonne (Lage = Richtung zur Sonne). Die 8 nächsten Punktlichter stehen wie in
//! v1 im Uniform-Block SZENE; sind es mehr oder ist ein Spot dabei, trägt der Abschnitt `LICHTER` alle sichtbaren (Clustered
//! Forward, `crate::lichter`). Nachtragsfelder („viele Lichter“): `kegel` (halber Öffnungswinkel in Grad, 0 = rundum) und
//! `kegelRand` (weicher Rand) – ein Spot leuchtet entlang −z des Teils (wie die Kamera; `schaueAuf` richtet ihn aus).
//! Eine Sonne (kleinste Teil-ID).
//! Nachtragsfelder H-K18 (Schatten, `crate::lichter::schatten_waehlen`): `schattenGuete` (`aus|grob|mittel|fein`; Punkt/Spot
//! wirft mit 256/512/1024 Texeln je Würfelseite bzw. Kegel Schatten, höchstens 8 je Bild), `schattenWeich` (Zeltfilter-Radius
//! in Texeln, auch Sonne), `kaskaden` (nur Sonne, 1 = v1) und `schattenWeite` (nur Sonne, 0 = wie v1).

use super::*;
use crate::paket::LichtB;
use crate::schema::{Genus, Feld, Raum, Schema};

pub const ART_FELD: usize = 0;
pub const FARBE: usize = 1;
pub const STAERKE: usize = 2;
pub const REICHWEITE: usize = 3;
pub const SCHATTEN: usize = 4;
/// Nachtragsfelder („viele Lichter“): Spot-Kegel (halber Öffnungswinkel in Grad, 0 = Punktlicht) und weicher Rand (Anteil).
pub const KEGEL: usize = 5;
pub const KEGEL_RAND: usize = 6;
/// Nachtragsfelder H-K18: Schatten-Güte (Punkt/Spot), Weichheit, Kaskaden und Schattenweite (Sonne).
pub const SCHATTEN_GUETE: usize = 7;
pub const SCHATTEN_WEICH: usize = 8;
pub const KASKADEN: usize = 9;
pub const SCHATTEN_WEITE: usize = 10;

pub static ART: Art = Art {
    schema: Schema {
        name: "Licht", genus: Genus::N,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::wahl("art", &["punkt", "sonne"], 0),
            Feld::farbe("farbe", "weiss"),
            Feld::zahl("staerke", 1.0).min(0.0),
            Feld::zahl("reichweite", 10.0).min(0.0),
            Feld::diavolo("schatten", true),
            Feld::zahl("kegel", 0.0).bereich(0.0, 90.0).nachtrag(),
            Feld::zahl("kegelRand", 0.25).bereich(0.0, 1.0).nachtrag(),
            Feld::wahl("schattenGuete", &["aus", "grob", "mittel", "fein"], 0).nachtrag(),
            Feld::zahl("schattenWeich", 1.0).bereich(0.0, 4.0).nachtrag(),
            Feld::ganz("kaskaden", 1.0).bereich(1.0, 4.0).nachtrag(),
            Feld::zahl("schattenWeite", 0.0).min(0.0).nachtrag(),
        ],
    },
    bild: Some(bild),
    ..Art::LEER
};

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (ar, fa, st, rw, sc) = (s.zahl(ART_FELD), s.farbe(FARBE), s.zahl(STAERKE), s.zahl(REICHWEITE), s.zahl(SCHATTEN));
    let (ke, kr) = (s.zahl(KEGEL), s.zahl(KEGEL_RAND));
    let (gu, we, ka, wt) = (s.zahl(SCHATTEN_GUETE), s.zahl(SCHATTEN_WEICH), s.zahl(KASKADEN), s.zahl(SCHATTEN_WEITE));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let m = &w.teile.welt[tz];
        b.lichter.push(LichtB {
            teil: s.teil[z],
            sonne: ar[z] == 1.0,
            pos: [m[3], m[7], m[11]],
            farbe: fa[z],
            staerke: st[z],
            reichweite: rw[z],
            schatten: sc[z] != 0.0,
            // Spot: Richtung = −z des Teils in Weltlage (Spalte 2 der Welt-Matrix), normiert im Abschnitt LICHTER
            richtung: [-m[2], -m[6], -m[10]],
            kegel: ke[z],
            kegel_rand: kr[z],
            guete: gu[z] as u32,
            weich: we[z],
            kaskaden: ka[z] as u32,
            weite: wt[z],
        });
    }
}
