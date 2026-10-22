//! `Bewegung` (2D und 3D): je Takt Tempo += Beschleunigung·dt, Tempo ·= (1 − daempfung)^dt, Lage += Tempo·dt,
//! Drehung += drehtempo·dt (2D um die Bildmitte, 3D um die Hochachse).

use super::*;
use crate::schema::{Genus, Feld, Raum, Schema};
use crate::welt::lage;

pub const TEMPO_X: usize = 0;
pub const TEMPO_Y: usize = 1;
pub const TEMPO_Z: usize = 2;
pub const BESCHL_X: usize = 3;
pub const BESCHL_Y: usize = 4;
pub const BESCHL_Z: usize = 5;
pub const DREHTEMPO: usize = 6;
pub const DAEMPFUNG: usize = 7;

pub static ART: Art = Art {
    schema: Schema {
        name: "Bewegung", genus: Genus::F,
        raum: Raum::Beide,
        braucht: &[],
        felder: &[
            Feld::zahl("tempoX", 0.0),
            Feld::zahl("tempoY", 0.0),
            Feld::zahl("tempoZ", 0.0),
            Feld::zahl("beschleunigungX", 0.0),
            Feld::zahl("beschleunigungY", 0.0),
            Feld::zahl("beschleunigungZ", 0.0),
            Feld::zahl("drehtempo", 0.0),
            Feld::zahl("daempfung", 0.0).bereich(0.0, 1.0),
        ],
    },
    nur_test: false,
    takt: Some(takt),
    bild: None,
    huelle: None,
};

fn takt(w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    let (teile, [tx, ty, tz, bx, by, bz, dr, da]) = s.zahlen_mut([TEMPO_X, TEMPO_Y, TEMPO_Z, BESCHL_X, BESCHL_Y, BESCHL_Z, DREHTEMPO, DAEMPFUNG]);
    for z in 0..n {
        let teil = teile[z];
        if teil == 0 {
            continue;
        }
        let Some(r) = w.zeile_opt(teil) else { continue };
        let drei_d = w.teile.drei_d[r];
        tx[z] += bx[z] * DT;
        ty[z] += by[z] * DT;
        if drei_d {
            tz[z] += bz[z] * DT;
        }
        if da[z] != 0.0 {
            let f = libm::pow(1.0 - da[z], DT);
            tx[z] *= f;
            ty[z] *= f;
            tz[z] *= f;
        }
        let (vx, vy, vz, d) = (tx[z], ty[z], tz[z], dr[z]);
        if vx == 0.0 && vy == 0.0 && (vz == 0.0 || !drei_d) && d == 0.0 {
            continue;
        }
        let l = &mut w.teile.lage[r];
        l[lage::X] += vx * DT;
        l[lage::Y] += vy * DT;
        if drei_d {
            l[lage::Z] += vz * DT;
        }
        l[lage::DREHUNG] += d * DT;
        w.markiere(r);
    }
}
