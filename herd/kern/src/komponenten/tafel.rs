//! `Tafel` (2D, H-K12): Fläche für UI wie ein Unity-`Panel` – abgerundetes Rechteck (`farbe`, Standard halbdurchsichtiges
//! Ofen-Braun), optional mit `titel` oben links. Mitte = Lage des Teils; der Inhalt sind die **Kinder** des Teils (sie folgen über
//! die Hierarchie). Die Tafel ist ein Ziel für die Maus und verdeckt so, was unter ihr liegt; ihre Kinder liegen bei gleicher
//! Ebene darüber (höhere ID). `ziehbar: ja`: ist die Tafel gefangen (darauf gedrückt), folgt sie der Maus, solange die linke
//! Taste gehalten wird – die Verschiebung wird in den Raum der Eltern umgerechnet.

use super::*;
use crate::paket::flach_art;
use crate::schema::{Feld, Genus, Raum, Schema};
use crate::welt::lage;

pub const BREITE: usize = 0;
pub const HOEHE: usize = 1;
pub const FARBE: usize = 2;
pub const TITEL: usize = 3;
pub const RUNDUNG: usize = 4;
pub const ZIEHBAR: usize = 5;

/// Titel: Schriftgröße, Abstand vom linken Rand, Mitte der Titelzeile unter der Oberkante.
pub const TITEL_GROESSE: f64 = 18.0;
pub const TITEL_RAND: f64 = 12.0;
pub const TITEL_MITTE: f64 = 18.0;

pub static ART: Art = Art {
    schema: Schema {
        name: "Tafel",
        genus: Genus::F,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::zahl("breite", 240.0).min(0.0),
            Feld::zahl("hoehe", 160.0).min(0.0),
            Feld::farbe("farbe", "#2f2a26e0"),
            Feld::text("titel", ""),
            Feld::zahl("rundung", 10.0).min(0.0),
            Feld::diavolo("ziehbar", false),
        ],
    },
    nachlauf: Some(nachlauf),
    bild: Some(bild),
    huelle: Some(huelle),
    ..Art::LEER
};

fn nachlauf(w: &mut Welt, s: &mut Speicher) {
    let g = w.eingabe.gefangen;
    if g == 0 || w.eingabe.knoepfe & 1 == 0 {
        return;
    }
    let Some(z) = (0..s.len()).find(|&z| s.teil[z] == g) else { return };
    if s.zahl(ZIEHBAR)[z] == 0.0 {
        return;
    }
    w.aktualisiere_alle();
    let Some(tz) = sichtbar(w, g) else { return };
    let p = ui::mauslage(w).fuer(w.teile.ebene[tz]);
    let alt = w.eingabe.griff;
    w.eingabe.griff = p;
    let d = [p[0] - alt[0], p[1] - alt[1]];
    if d[0] == 0.0 && d[1] == 0.0 {
        return;
    }
    // Verschiebung im Raum der Eltern: Umkehrung des linearen Teils ihrer Welt-Matrix
    let e = w.teile.eltern[tz];
    let dl = match w.zeile_opt(e).filter(|_| e != 0) {
        Some(ez) => {
            let mut m = w.teile.welt[ez];
            m[4] = 0.0;
            m[5] = 0.0;
            match ui::lokal(&m, d) {
                Some(x) => x,
                None => return,
            }
        }
        None => d,
    };
    let l = &mut w.teile.lage[tz];
    l[lage::X] += dl[0];
    l[lage::Y] += dl[1];
    w.markiere(tz);
}

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (br, ho, fa, ru) = (s.zahl(BREITE), s.zahl(HOEHE), s.farbe(FARBE), s.zahl(RUNDUNG));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let (teil, ebene, m) = (s.teil[z], w.teile.ebene[tz], w.teile.welt[tz]);
        let h = [br[z] * 0.5, ho[z] * 0.5];
        b.flach(ebene, teil, &m, [0.0, 0.0], h, flach_art::RECHTECK, fa[z], [ui::rundung(ru[z], h), 0.0], [0; 4], 0);
        let p = [TITEL_RAND - h[0], TITEL_MITTE - h[1]];
        ui::text_mittig(b, ebene, teil, &m, &s.text(TITEL)[z], TITEL_GROESSE, crate::farbe::WEISS, p, 0);
    }
}

fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    Some(rechteck_huelle(&w.teile.welt[tz], [0.0, 0.0], [s.zahl(BREITE)[kz] * 0.5, s.zahl(HOEHE)[kz] * 0.5]))
}
