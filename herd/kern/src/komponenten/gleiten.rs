//! `Gleiten` (2D und 3D, H-K4): Tween einer Lage-Größe des Teils von ihrem Wert im ersten laufenden Takt nach `nach`, in
//! `dauer` Sekunden, entlang einer Kurve (wie DOTween). Am Ende von `einmal` steht exakt `nach` und `laeuft` wird nein.
//! Zeit = Summe von `DT`; Kurven sind Polynome, `federnd` mit `libm::pow`/`libm::sin` (K-129).

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};
use crate::welt::lage;

pub const WAS: usize = 0;
pub const NACH: usize = 1;
pub const DAUER: usize = 2;
pub const KURVE: usize = 3;
pub const SCHLEIFE: usize = 4;
pub const LAEUFT: usize = 5;
/// verborgen: Startwert (Wert im ersten laufenden Takt)
pub const VON: usize = 6;
/// verborgen: gelaufene Zeit (s, Summe von DT)
pub const ZEIT: usize = 7;
/// verborgen: 1 = Startwert genommen
pub const GESTARTET: usize = 8;
/// verborgen: `nach` und `was` beim Start (Änderung → neu starten vom aktuellen Wert)
pub const ZIEL: usize = 9;
pub const WAS_START: usize = 10;

pub const WAS_WAHL: &[&str] = &["x", "y", "z", "drehung", "neigung", "rollen", "groesse"];
pub const KURVEN: &[&str] = &["linear", "sanft", "rein", "raus", "federnd", "huepfend"];
pub const SCHLEIFEN: &[&str] = &["einmal", "wiederholen", "pendeln"];

/// Kurven-Nummern (Index in `KURVEN`; `Ablauf.kurve` nutzt die ersten beiden).
pub mod kurve {
    pub const LINEAR: u32 = 0;
    pub const SANFT: u32 = 1;
    pub const REIN: u32 = 2;
    pub const RAUS: u32 = 3;
    pub const FEDERND: u32 = 4;
    pub const HUEPFEND: u32 = 5;
}

/// Toleranz am Ende (s): 60 · DT ist in f64 nicht exakt 1 – so endet `dauer: 1` nach genau 60 Takten.
const REST: f64 = 1e-9;

pub static ART: Art = Art {
    schema: Schema {
        name: "Gleiten",
        genus: Genus::N,
        raum: Raum::Beide,
        braucht: &[],
        felder: &[
            Feld::wahl("was", WAS_WAHL, 0),
            Feld::zahl("nach", 0.0),
            Feld::zahl("dauer", 1.0).min(0.0),
            Feld::wahl("kurve", KURVEN, 1),
            Feld::wahl("schleife", SCHLEIFEN, 0),
            Feld::diavolo("laeuft", true),
            Feld::intern("von", 0.0),
            Feld::intern("zeit", 0.0),
            Feld::intern("gestartet", 0.0),
            Feld::intern("ziel", 0.0),
            Feld::intern("wasStart", 0.0),
        ],
    },
    takt: Some(takt),
    ..Art::LEER
};

/// Kurve `k` an der Stelle `t` (0 … 1): 0 → 0, 1 → 1 (federnd/huepfend schwingen dazwischen über 1 hinaus bzw. prallen ab).
pub fn kurve_wert(k: u32, t: f64) -> f64 {
    if !(t > 0.0) {
        return 0.0;
    }
    if t >= 1.0 {
        return 1.0;
    }
    match k {
        kurve::SANFT => t * t * (3.0 - 2.0 * t),
        kurve::REIN => t * t,
        kurve::RAUS => t * (2.0 - t),
        kurve::FEDERND => {
            // easeOutElastic: 2^(−10t) · sin((10t − 0,75) · 2π/3) + 1
            let c4 = 2.0 * core::f64::consts::PI / 3.0;
            libm::pow(2.0, -10.0 * t) * libm::sin((t * 10.0 - 0.75) * c4) + 1.0
        }
        kurve::HUEPFEND => {
            // easeOutBounce: vier Parabelbögen
            let (n1, d1) = (7.5625, 2.75);
            if t < 1.0 / d1 {
                n1 * t * t
            } else if t < 2.0 / d1 {
                let u = t - 1.5 / d1;
                n1 * u * u + 0.75
            } else if t < 2.5 / d1 {
                let u = t - 2.25 / d1;
                n1 * u * u + 0.9375
            } else {
                let u = t - 2.625 / d1;
                n1 * u * u + 0.984375
            }
        }
        _ => t,
    }
}

/// `x - floor(x / p) · p` (nur libm; `%` auf f64 wäre `fmod`).
#[inline]
pub fn rest(x: f64, p: f64) -> f64 {
    x - libm::floor(x / p) * p
}

/// Lage-Index zu `was` (Groesse = GX, dazu GY/GZ); `None` = wirkt in diesem Raum nicht (z/neigung/rollen in 2D).
fn ziel_index(was: u32, drei_d: bool) -> Option<usize> {
    match was {
        0 => Some(lage::X),
        1 => Some(lage::Y),
        2 if drei_d => Some(lage::Z),
        3 => Some(lage::DREHUNG),
        4 if drei_d => Some(lage::NEIGUNG),
        5 if drei_d => Some(lage::ROLLEN),
        6 => Some(lage::GX),
        _ => None,
    }
}

/// Schreibt `v` in die Lage-Größe `i` (Größe: alle Achsen des Raums).
fn schreibe(w: &mut Welt, r: usize, i: usize, v: f64) {
    let drei_d = w.teile.drei_d[r];
    let l = &mut w.teile.lage[r];
    if i == lage::GX {
        l[lage::GX] = v;
        l[lage::GY] = v;
        if drei_d {
            l[lage::GZ] = v;
        }
    } else {
        l[i] = v;
    }
    w.markiere(r);
}

fn takt(w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    let (teile, [was, nach, dauer, kurve, schleife, laeuft, von, zeit, gestartet, ziel, was_start]) =
        s.zahlen_mut([WAS, NACH, DAUER, KURVE, SCHLEIFE, LAEUFT, VON, ZEIT, GESTARTET, ZIEL, WAS_START]);
    for z in 0..n {
        let teil = teile[z];
        if teil == 0 || laeuft[z] == 0.0 {
            continue;
        }
        let Some(r) = wach(w, teil) else { continue };
        let ziel_i = ziel_index(was[z] as u32, w.teile.drei_d[r]);
        // Start: erster laufender Takt, nach dem Ende von `einmal` erneut, oder `nach`/`was` wurde geändert
        if gestartet[z] == 0.0 || nach[z].to_bits() != ziel[z].to_bits() || was[z] != was_start[z] {
            von[z] = match ziel_i {
                Some(i) => w.teile.lage[r][i],
                None => 0.0,
            };
            zeit[z] = 0.0;
            gestartet[z] = 1.0;
            ziel[z] = nach[z];
            was_start[z] = was[z];
        }
        zeit[z] += DT;
        let d = dauer[z];
        let (a, b) = (von[z], nach[z]);
        let v = if !(d > 0.0) {
            // dauer 0: sofort am Ziel
            if schleife[z] == 0.0 {
                laeuft[z] = 0.0;
                gestartet[z] = 0.0;
                zeit[z] = 0.0;
            }
            b
        } else if schleife[z] == 0.0 {
            // einmal
            if zeit[z] >= d - REST {
                laeuft[z] = 0.0;
                gestartet[z] = 0.0;
                zeit[z] = 0.0;
                b
            } else {
                a + (b - a) * kurve_wert(kurve[z] as u32, zeit[z] / d)
            }
        } else if schleife[z] == 1.0 {
            // wiederholen: jede Runde von vorn
            zeit[z] = rest(zeit[z], d);
            a + (b - a) * kurve_wert(kurve[z] as u32, zeit[z] / d)
        } else {
            // pendeln: hin in `dauer`, zurück in `dauer`
            zeit[z] = rest(zeit[z], 2.0 * d);
            let t = if zeit[z] <= d { zeit[z] / d } else { (2.0 * d - zeit[z]) / d };
            a + (b - a) * kurve_wert(kurve[z] as u32, t)
        };
        if let Some(i) = ziel_i {
            schreibe(w, r, i, v);
        }
    }
}

/// Für `Ablauf`: dieselbe Schreibregel (Größe = alle Achsen des Raums).
pub(crate) fn schreibe_lage(w: &mut Welt, r: usize, i: usize, v: f64) {
    schreibe(w, r, i, v);
}
