//! `Taster` (2D, H-K12): Schaltfläche wie Unity `Button` – abgerundetes Rechteck mit zentriertem Text, Farbe je Zustand. Mitte =
//! Lage des Teils. (Name `Taster` statt `Knopf`: `Knopf` ist schon eine Theke-Klasse, K-151.)
//!
//! Lesefelder (Nachlauf, das Programm sieht sie im nächsten Takt): `drueber` (oberstes Element unter der Maus und keine andere
//! Taste gefangen), `gedrueckt` (linke Taste auf diesem Taster gedrückt und noch gehalten – auch, wenn die Maus ihn verlässt),
//! `geklickt` (über dem Taster losgelassen, auf dem gedrückt wurde; nur in diesem Takt). `aktiv: nein` → halb durchsichtig, alle
//! Lesefelder `nein`, kein Ziel für die Maus. Der Nachlauf macht zuerst den gemeinsamen [`ui::durchgang`].

use super::*;
use crate::paket::flach_art;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const INHALT: usize = 0;
pub const BREITE: usize = 1;
pub const HOEHE: usize = 2;
pub const FARBE: usize = 3;
pub const FARBE_DRUEBER: usize = 4;
pub const FARBE_GEDRUECKT: usize = 5;
pub const TEXT_FARBE: usize = 6;
pub const GROESSE: usize = 7;
pub const RUNDUNG: usize = 8;
pub const AKTIV: usize = 9;
/// Lesefeld: Maus über dem Taster
pub const DRUEBER: usize = 10;
/// Lesefeld: gedrückt und gehalten
pub const GEDRUECKT: usize = 11;
/// Lesefeld: in diesem Takt geklickt
pub const GEKLICKT: usize = 12;

pub static ART: Art = Art {
    schema: Schema {
        name: "Taster",
        genus: Genus::M,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::text("inhalt", ""),
            Feld::zahl("breite", 120.0).min(0.0),
            Feld::zahl("hoehe", 36.0).min(0.0),
            Feld::farbe("farbe", "kruste"),
            Feld::farbe("farbeDrueber", "senf"),
            Feld::farbe("farbeGedrueckt", "tomate"),
            Feld::farbe("textFarbe", "weiss"),
            Feld::zahl("groesse", 18.0).min(0.0),
            Feld::zahl("rundung", 8.0).min(0.0),
            Feld::diavolo("aktiv", true),
            Feld::diavolo("drueber", false).lesen(),
            Feld::diavolo("gedrueckt", false).lesen(),
            Feld::diavolo("geklickt", false).lesen(),
        ],
    },
    nachlauf: Some(nachlauf),
    bild: Some(bild),
    huelle: Some(huelle),
    ..Art::LEER
};

fn nachlauf(w: &mut Welt, s: &mut Speicher) {
    ui::durchgang(w, s);
    let e = w.eingabe;
    for z in 0..s.len() {
        let teil = s.teil[z];
        if ruht(w, teil) {
            continue; // H-K8: ruhende Teile (Vorlage, ausgeschaltete Kulisse) behalten ihren Stand
        }
        let ak = teil != 0 && s.zahl(AKTIV)[z] != 0.0;
        let drueber = ak && e.treffer == teil && (e.gefangen == 0 || e.gefangen == teil);
        let gedrueckt = ak && e.gefangen == teil;
        let geklickt = ak && e.los == teil && e.treffer == teil;
        s.zahl_mut(DRUEBER)[z] = drueber as i32 as f64;
        s.zahl_mut(GEDRUECKT)[z] = gedrueckt as i32 as f64;
        s.zahl_mut(GEKLICKT)[z] = geklickt as i32 as f64;
    }
}

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (br, ho, ru, ak) = (s.zahl(BREITE), s.zahl(HOEHE), s.zahl(RUNDUNG), s.zahl(AKTIV));
    let (fa, fd, fg, tf) = (s.farbe(FARBE), s.farbe(FARBE_DRUEBER), s.farbe(FARBE_GEDRUECKT), s.farbe(TEXT_FARBE));
    let (dr, ge) = (s.zahl(DRUEBER), s.zahl(GEDRUECKT));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let (teil, ebene, m) = (s.teil[z], w.teile.ebene[tz], w.teile.welt[tz]);
        let aktiv = ak[z] != 0.0;
        let (grund, schrift) = if !aktiv {
            (ui::halb(fa[z]), ui::halb(tf[z]))
        } else if ge[z] != 0.0 {
            (fg[z], tf[z])
        } else if dr[z] != 0.0 {
            (fd[z], tf[z])
        } else {
            (fa[z], tf[z])
        };
        let h = [br[z] * 0.5, ho[z] * 0.5];
        b.flach(ebene, teil, &m, [0.0, 0.0], h, flach_art::RECHTECK, grund, [ui::rundung(ru[z], h), 0.0], [0; 4], 0);
        ui::text_mittig(b, ebene, teil, &m, &s.text(INHALT)[z], s.zahl(GROESSE)[z], schrift, [0.0, 0.0], 1);
    }
}

fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    Some(rechteck_huelle(&w.teile.welt[tz], [0.0, 0.0], [s.zahl(BREITE)[kz] * 0.5, s.zahl(HOEHE)[kz] * 0.5]))
}
