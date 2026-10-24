//! `Animation` (2D, braucht `Bild`): spielt eine Bildchen-Folge ab und setzt `Bild.bildchen` auf `bilder[nummer]`.

use super::*;
use crate::schema::{Genus, Feld, Raum, Schema, Spalte};

pub const BILDER: usize = 0;
pub const PRO_SEKUNDE: usize = 1;
pub const SCHLEIFE: usize = 2;
pub const LAEUFT: usize = 3;
pub const NUMMER: usize = 4;
/// verborgen: Bruchteil bis zum nächsten Bild
pub const ZEIT: usize = 5;

pub static ART: Art = Art {
    schema: Schema {
        name: "Animation", genus: Genus::F,
        raum: Raum::Zwei,
        braucht: &["Bild"],
        felder: &[
            Feld::bildchen_liste("bilder"),
            Feld::zahl("proSekunde", 8.0).min(0.0),
            Feld::diavolo("schleife", true),
            Feld::diavolo("laeuft", true),
            Feld::ganz("nummer", 1.0).min(1.0),
            Feld::intern("zeit", 0.0),
        ],
    },
    takt: Some(takt),
    ..Art::LEER
};

fn takt(w: &mut Welt, s: &mut Speicher) {
    let Some(bild_art) = w.art_index("Bild") else { return };
    let n = s.len();
    // Liste kurz herausnehmen, damit die Zahlenspalten gleichzeitig veränderlich sind
    let spalte = core::mem::replace(&mut s.spalten[BILDER], Spalte::Liste(alloc::vec::Vec::new()));
    let Spalte::Liste(bilder) = &spalte else { return };
    let (teile, [ps, sch, lf, nr, zt]) = s.zahlen_mut([PRO_SEKUNDE, SCHLEIFE, LAEUFT, NUMMER, ZEIT]);
    for z in 0..n {
        let teil = teile[z];
        if teil == 0 || ruht(w, teil) {
            continue;
        }
        let liste = &bilder[z];
        let len = liste.len() as f64;
        if len == 0.0 {
            continue;
        }
        if lf[z] != 0.0 {
            zt[z] += ps[z] * DT;
            let mut schritte = 0u32;
            while zt[z] >= 1.0 && schritte < 1000 {
                zt[z] -= 1.0;
                schritte += 1;
                nr[z] += 1.0;
                if nr[z] > len {
                    if sch[z] != 0.0 {
                        nr[z] = 1.0;
                    } else {
                        nr[z] = len;
                        lf[z] = 0.0;
                        zt[z] = 0.0;
                        break;
                    }
                }
            }
        }
        let k = if nr[z] > len { len } else { nr[z] } as usize;
        let id = liste[k - 1] as f64;
        let Some(r) = w.zeile_opt(teil) else { continue };
        if let Some(bz) = w.komp_zeile(r, bild_art) {
            w.speicher[bild_art].zahl_mut(super::bild::BILDCHEN)[bz] = id;
        }
    }
    s.spalten[BILDER] = spalte;
}
