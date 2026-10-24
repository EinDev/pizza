//! `Regler` (2D, H-K12): Schieberegler wie Unity `Slider` – waagerechte Schiene (`breite`, Farbe `farbe`) und ein runder Knauf
//! (`knauf`) an der Stelle von `wert` zwischen `von` und `bis`. Mitte = Lage des Teils.
//!
//! Maus: Drücken auf dem Regler fängt ihn (Trefferfläche = Schiene samt Knauf, [`trefferflaeche`]); solange die linke Taste
//! gehalten wird, setzt die Maus `wert` = `von` + Anteil · (`bis` − `von`), Anteil = waagerechte Lage der Maus auf der Schiene,
//! auf 0 … 1 geklemmt (auch außerhalb der Schiene, also mit `bis < von` rückwärts). Lesefeld `geaendert`: die Maus hat `wert` in
//! diesem Takt verändert. Vom Programm gesetzte Werte außerhalb von `von` … `bis` bleiben stehen; der Knauf steht dann am Rand.

use super::*;
use crate::paket::flach_art;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const WERT: usize = 0;
pub const VON: usize = 1;
pub const BIS: usize = 2;
pub const BREITE: usize = 3;
pub const FARBE: usize = 4;
pub const KNAUF: usize = 5;
/// Lesefeld: in diesem Takt von der Maus verändert
pub const GEAENDERT: usize = 6;

/// Radius des Knaufs, halbe Höhe der Schiene (Spielfeld-Pixel vor Skalierung).
pub const KNAUF_RADIUS: f64 = 10.0;
pub const SCHIENE: f64 = 3.0;

pub static ART: Art = Art {
    schema: Schema {
        name: "Regler",
        genus: Genus::M,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::zahl("wert", 0.5),
            Feld::zahl("von", 0.0),
            Feld::zahl("bis", 1.0),
            Feld::zahl("breite", 160.0).min(0.0),
            Feld::farbe("farbe", "kruste"),
            Feld::farbe("knauf", "senf"),
            Feld::diavolo("geaendert", false).lesen(),
        ],
    },
    nachlauf: Some(nachlauf),
    bild: Some(bild),
    huelle: Some(huelle),
    ..Art::LEER
};

/// Halbe Ausdehnung der Trefferfläche (Schiene samt überstehendem Knauf).
pub fn trefferflaeche(breite: f64) -> [f64; 2] {
    [breite * 0.5 + KNAUF_RADIUS, KNAUF_RADIUS]
}

/// Anteil 0 … 1 von `wert` zwischen `von` und `bis` (gleiche Grenzen → 0).
fn anteil(wert: f64, von: f64, bis: f64) -> f64 {
    let d = bis - von;
    if !(d != 0.0) {
        return 0.0;
    }
    klemme01((wert - von) / d)
}

fn klemme01(x: f64) -> f64 {
    if x > 1.0 {
        1.0
    } else if x >= 0.0 {
        x
    } else {
        0.0
    }
}

fn nachlauf(w: &mut Welt, s: &mut Speicher) {
    for z in 0..s.len() {
        if !ruht(w, s.teil[z]) {
            s.zahl_mut(GEAENDERT)[z] = 0.0; // H-K8: ruhende Regler behalten ihren Stand
        }
    }
    let g = w.eingabe.gefangen;
    if g == 0 || w.eingabe.knoepfe & 1 == 0 {
        return;
    }
    let Some(z) = (0..s.len()).find(|&z| s.teil[z] == g) else { return };
    w.aktualisiere_alle();
    let Some(tz) = sichtbar(w, g) else { return };
    let ml = ui::mauslage(w);
    let Some(l) = ui::lokal(&w.teile.welt[tz], ml.fuer(w.teile.ebene[tz])) else { return };
    let br = s.zahl(BREITE)[z];
    let a = if br > 0.0 { klemme01((l[0] + br * 0.5) / br) } else { 0.0 };
    let (von, bis) = (s.zahl(VON)[z], s.zahl(BIS)[z]);
    let neu = von + a * (bis - von);
    if neu.to_bits() != s.zahl(WERT)[z].to_bits() {
        s.zahl_mut(WERT)[z] = neu;
        s.zahl_mut(GEAENDERT)[z] = 1.0;
    }
}

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (we, vo, bi, br, fa, kn) = (s.zahl(WERT), s.zahl(VON), s.zahl(BIS), s.zahl(BREITE), s.farbe(FARBE), s.farbe(KNAUF));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let (teil, ebene, m) = (s.teil[z], w.teile.ebene[tz], w.teile.welt[tz]);
        let h = [br[z] * 0.5, SCHIENE];
        b.flach(ebene, teil, &m, [0.0, 0.0], h, flach_art::RECHTECK, fa[z], [ui::rundung(SCHIENE, h), 0.0], [0; 4], 0);
        let x = -h[0] + anteil(we[z], vo[z], bi[z]) * br[z];
        b.flach(ebene, teil, &m, [x, 0.0], [KNAUF_RADIUS, KNAUF_RADIUS], flach_art::KREIS, kn[z], [0.0, 0.0], [0; 4], 0);
    }
}

fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    Some(rechteck_huelle(&w.teile.welt[tz], [0.0, 0.0], trefferflaeche(s.zahl(BREITE)[kz])))
}
