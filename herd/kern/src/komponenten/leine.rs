//! `Leine` (beide, H-K1): Folgekamera wie Cinemachine-Follow – das Teil folgt einem Ziel-Teil mit festem Abstand, starr oder
//! gedämpft, optional mit Totzone; in 3D kann es dabei aufs Ziel schauen. Läuft im **Nachlauf** (nach allen Takt-Systemen,
//! sieht also die Lage nach Bewegung, Tweens und Physik desselben Takts). Gedacht für `Blick`- und `Kamera`-Teile, geht aber an
//! jedem Teil.
//!
//! Ziel = Weltlage des Ziels + Abstand (Weltachsen); geschrieben wird die Lage (x, y, z) des Teils – wie `schaueAuf` ohne
//! Umrechnung in den Raum der Eltern (für Teile ohne Eltern gedacht). Dämpfung: je Takt rückt das Teil um den Anteil
//! `1 − weich^dt` des Rests vor (`libm::pow`), `weich` 0 = starr (genau aufs Ziel). Totzone: liegt das Ziel näher als `totzone`,
//! bleibt das Teil stehen, sonst zieht es nur so weit, dass der Abstand `totzone` bliebe. Ziel karton, entfernt, das Teil
//! selbst oder im anderen Raum → keine Wirkung (kein Fehler).

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};
use crate::welt::lage;

pub const ZIEL: usize = 0;
pub const ABSTAND_X: usize = 1;
pub const ABSTAND_Y: usize = 2;
pub const ABSTAND_Z: usize = 3;
pub const WEICH: usize = 4;
pub const TOTZONE: usize = 5;
pub const SCHAUE: usize = 6;

pub static ART: Art = Art {
    schema: Schema {
        name: "Leine",
        genus: Genus::F,
        raum: Raum::Beide,
        braucht: &[],
        felder: &[
            Feld::teil("ziel"),
            Feld::zahl("abstandX", 0.0),
            Feld::zahl("abstandY", 0.0),
            Feld::zahl("abstandZ", 0.0),
            Feld::zahl("weich", 0.0).bereich(0.0, 0.999),
            Feld::zahl("totzone", 0.0).min(0.0),
            Feld::diavolo("schaue", false),
        ],
    },
    nachlauf: Some(nachlauf),
    ..Art::LEER
};

fn nachlauf(w: &mut Welt, s: &mut Speicher) {
    let (zi, ax, ay, az, we, tz, sc) = (s.zahl(ZIEL), s.zahl(ABSTAND_X), s.zahl(ABSTAND_Y), s.zahl(ABSTAND_Z), s.zahl(WEICH), s.zahl(TOTZONE), s.zahl(SCHAUE));
    for z in 0..s.len() {
        let teil = s.teil[z];
        let ziel = zi[z] as u32;
        if teil == 0 || ziel == 0 || ziel == teil {
            continue;
        }
        let (Some(r), Some(zr)) = (wach(w, teil), w.zeile_opt(ziel)) else { continue };
        let drei_d = w.teile.drei_d[r];
        if drei_d != w.teile.drei_d[zr] {
            continue;
        }
        w.aktualisiere(zr);
        let m = w.teile.welt[zr];
        let zp = if drei_d { [m[3], m[7], m[11]] } else { [m[4], m[5], 0.0] };
        let n = if drei_d { 3 } else { 2 };
        let ziel_p = [zp[0] + ax[z], zp[1] + ay[z], zp[2] + az[z]];
        let jetzt = [w.teile.lage[r][lage::X], w.teile.lage[r][lage::Y], w.teile.lage[r][lage::Z]];
        // Rest bis zum Ziel, Totzone abziehen
        let mut rest = [0.0; 3];
        let mut q = 0.0;
        for i in 0..n {
            rest[i] = ziel_p[i] - jetzt[i];
            q += rest[i] * rest[i];
        }
        let t = tz[z];
        let mut bis = ziel_p;
        if t > 0.0 {
            if q <= t * t {
                continue;
            }
            let k = t / libm::sqrt(q);
            for i in 0..n {
                bis[i] = ziel_p[i] - rest[i] * k;
            }
        }
        let f = if we[z] > 0.0 { 1.0 - libm::pow(we[z], DT) } else { 1.0 };
        let l = &mut w.teile.lage[r];
        for i in 0..n {
            l[i] = if f == 1.0 { bis[i] } else { jetzt[i] + (bis[i] - jetzt[i]) * f };
        }
        w.markiere(r);
        if drei_d && sc[z] != 0.0 {
            w.schaue_auf(teil, zp[0], zp[1], zp[2]);
        }
    }
}
