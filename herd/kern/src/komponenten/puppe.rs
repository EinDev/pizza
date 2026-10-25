//! `Puppe` (3D, H-K23a, HERD.md §13.3, Nachtrag K-161): spielt die Folgen (glTF-Animationen) eines Modells an der Wurzel aus
//! `herd.modell` ab und blendet zwischen ihnen über – wie Unitys Animator ohne Ebenen.
//!
//! - **Gelenke sind Teile:** die Knoten-Teile aus H-K16. Die Puppe schreibt nur die animierten Größen (Lage, Drehung, Größe je
//!   Kanal); alles andere behält das Programm in der Hand – man hängt Dinge an die Hand (`finde("Hand").haenge(…)`).
//! - **Zuordnung** Kanal → Teil über den Knoten-Index (verborgenes Feld `knoten` am `Etikett`), jeden Takt neu durch einen Gang
//!   über den Teilbaum entlang der Modell-Hierarchie: ein Kind zählt nur, wenn sein Etikett den passenden Knoten nennt, dessen
//!   Modell-Eltern der bisherige Knoten ist. Fremde Teile (angehängte Dinge, andere Modelle) und Kopien stören also nicht.
//! - **Welches Modell:** beim ersten Takt an einer Wurzel (auch nach `kopie()`) über die Form eines `Koerper` der Knoten-Teile
//!   (jedes Modell hat eigene Netz-Ressourcen). Modelle ganz ohne Netz kann eine Puppe nicht finden (Doku).
//! - **Zeit** = Summe von `DT · tempo`; gesetzte `zeit` springt (in diesem Takt ohne Vorlauf). `schleife` nein hält am Ende.
//!   `fertig` ist ein Ereignis: ja in dem Takt, in dem die Folge ihr Ende erreicht (mit Schleife: jede Runde).
//! - **Interpolation** in f64 aus den f32-Stützwerten: `STEP`, `LINEAR` (Drehung per Slerp mit `libm::acos`/`sin`, kürzester
//!   Weg, fast gleiche Drehungen normiert linear); `CUBICSPLINE` hat der Vorbacker auf die Stützwerte zurückgeführt (linear).
//! - **Überblenden:** ein Wechsel von `folge` blendet in `blende` Sekunden linear von der alten (läuft weiter) zur neuen Folge;
//!   Größen, die nur eine der beiden Folgen bewegt, blenden gegen die Ruhelage des Modells. `""` = Ruhelage: die zuvor
//!   bewegten Gelenke kehren in die Ruhelage zurück, danach schreibt die Puppe nichts mehr. Ein Wechsel während des Blendens
//!   blendet vom bisherigen Ziel aus (die ältere Folge entfällt). Ein unbekannter Name gilt als Ruhelage (`dauer` 0).

use super::*;
use crate::modell::{euler, quat_matrix, MKanal, Modell};
use crate::schema::{Feld, Genus, Raum, Schema};
use alloc::vec::Vec;

pub const FOLGE: usize = 0;
pub const TEMPO: usize = 1;
pub const SCHLEIFE: usize = 2;
pub const ZEIT: usize = 3;
pub const LAEUFT: usize = 4;
pub const BLENDE: usize = 5;
pub const DAUER: usize = 6;
pub const FERTIG: usize = 7;
/// verborgen: Modell-ID (0 = noch keins gefunden)
pub const MODELL: usize = 8;
/// verborgen: Teil, an dem das Modell gefunden wurde (anders → neu suchen, z. B. nach `kopie()`)
pub const WURZEL: usize = 9;
/// verborgen: laufende Folge + 1 (0 = Ruhelage, −1 = noch nie gelaufen)
pub const AKTIV: usize = 10;
/// verborgen: Folge + 1, aus der übergeblendet wird (0 = Ruhelage)
pub const VORHER: usize = 11;
pub const VORHER_ZEIT: usize = 12;
/// verborgen: gelaufene Blendzeit und Blenddauer (0 = kein Blenden)
pub const MISCH: usize = 13;
pub const MISCH_DAUER: usize = 14;
/// verborgen: `zeit` am Ende des letzten Takts (anders → das Programm hat gesprungen)
pub const ZEIT_STAND: usize = 15;

/// Toleranz am Ende (s), wie `Gleiten`: 60 · DT ist in f64 nicht exakt 1.
const REST: f64 = 1e-9;

pub static ART: Art = Art {
    schema: Schema {
        name: "Puppe",
        genus: Genus::F,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::text("folge", ""),
            Feld::zahl("tempo", 1.0),
            Feld::diavolo("schleife", true),
            Feld::zahl("zeit", 0.0),
            Feld::diavolo("laeuft", true),
            Feld::zahl("blende", 0.2).min(0.0),
            Feld::zahl("dauer", 0.0).lesen(),
            Feld::diavolo("fertig", false).lesen(),
            Feld::intern("modell", 0.0),
            Feld::intern("wurzel", 0.0),
            Feld::intern("aktiv", -1.0),
            Feld::intern("vorher", 0.0),
            Feld::intern("vorherZeit", 0.0),
            Feld::intern("misch", 0.0),
            Feld::intern("mischDauer", 0.0),
            Feld::intern("zeitStand", 0.0),
        ],
    },
    takt: Some(takt),
    ..Art::LEER
};

// ------------------------------------------------------------------------------------------------ Mathe (f64, libm)

type Q = [f64; 4];

fn normiert(q: Q) -> Q {
    let l = libm::sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    if !(l > 1e-12) {
        return [0.0, 0.0, 0.0, 1.0];
    }
    [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
}

/// Slerp von `a` nach `b` (u = 0 … 1), kürzester Weg; fast gleiche Drehungen normiert linear. u ≥ 1 → genau `b`.
pub fn slerp(a: Q, b: Q, u: f64) -> Q {
    if !(u > 0.0) {
        return a;
    }
    if u >= 1.0 {
        return b;
    }
    let (a, mut b) = (normiert(a), normiert(b));
    let mut d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if d < 0.0 {
        b = [-b[0], -b[1], -b[2], -b[3]];
        d = -d;
    }
    let (wa, wb) = if d > 0.9995 {
        (1.0 - u, u)
    } else {
        let th = libm::acos(d);
        let s = libm::sin(th);
        (libm::sin((1.0 - u) * th) / s, libm::sin(u * th) / s)
    };
    normiert([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb])
}

fn lerp3(a: &[f64], b: &[f64], u: f64) -> [f64; 3] {
    if u >= 1.0 {
        return [b[0], b[1], b[2]];
    }
    [a[0] * (1.0 - u) + b[0] * u, a[1] * (1.0 - u) + b[1] * u, a[2] * (1.0 - u) + b[2] * u]
}

fn qmal(a: Q, b: Q) -> Q {
    [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]
}

/// (drehung, neigung, rollen) in Grad → Quaternion für R = Ry(d) · Rx(n) · Rz(r) (Gegenstück zu `modell::euler`).
pub fn euler_quat(d: f64, n: f64, r: f64) -> Q {
    let h = crate::welt::GRAD / 2.0;
    let qy = [0.0, libm::sin(d * h), 0.0, libm::cos(d * h)];
    let qx = [libm::sin(n * h), 0.0, 0.0, libm::cos(n * h)];
    let qz = [0.0, 0.0, libm::sin(r * h), libm::cos(r * h)];
    qmal(qmal(qy, qx), qz)
}

/// Wert eines Kanals zur Zeit `t` (vor der ersten/nach der letzten Stützstelle: deren Wert) → `aus` (3 bzw. 4 Werte).
pub fn abtasten(k: &MKanal, t: f64, aus: &mut [f64; 4]) {
    let n = k.zeiten.len();
    let b = if k.pfad == 1 { 4 } else { 3 };
    let wert = |i: usize, aus: &mut [f64; 4]| {
        for j in 0..b {
            aus[j] = k.werte[i * b + j] as f64;
        }
    };
    if n == 0 {
        return;
    }
    if !(t > k.zeiten[0] as f64) {
        return wert(0, aus);
    }
    if t >= k.zeiten[n - 1] as f64 {
        return wert(n - 1, aus);
    }
    // größtes i mit zeiten[i] ≤ t (binäre Suche, feste Reihenfolge)
    let (mut lo, mut hi) = (0usize, n - 1);
    while hi - lo > 1 {
        let m = (lo + hi) / 2;
        if k.zeiten[m] as f64 <= t {
            lo = m;
        } else {
            hi = m;
        }
    }
    if k.art == 1 {
        return wert(lo, aus);
    }
    let (t0, t1) = (k.zeiten[lo] as f64, k.zeiten[hi] as f64);
    let u = if t1 > t0 { (t - t0) / (t1 - t0) } else { 0.0 };
    let (mut a, mut c) = ([0.0; 4], [0.0; 4]);
    wert(lo, &mut a);
    wert(hi, &mut c);
    if k.pfad == 1 {
        *aus = slerp(a, c, u);
    } else {
        let v = lerp3(&a, &c, u);
        aus[..3].copy_from_slice(&v);
    }
}

/// Dauer einer Folge = späteste Stützstelle aller Kanäle.
pub fn dauer(m: &Modell, folge: usize) -> f64 {
    m.folgen[folge].kanaele.iter().filter_map(|k| k.zeiten.last()).fold(0.0, |a, &t| if (t as f64) > a { t as f64 } else { a })
}

// ------------------------------------------------------------------------------------------------ Zeit

/// Schreitet `zeit` um `dt` fort: mit Schleife umlaufend, sonst am Rand gehalten → (neue Zeit, Ende/Runde erreicht).
fn fortschreiten(zeit: f64, dt: f64, d: f64, schleife: bool) -> (f64, bool) {
    if !(d > 0.0) {
        return (0.0, false);
    }
    let t = zeit + dt;
    if schleife {
        let runden = libm::floor((t + REST) / d);
        if runden == 0.0 {
            return (t, false);
        }
        let r = t - runden * d;
        (if r < 0.0 { 0.0 } else { r }, true)
    } else if dt >= 0.0 {
        if t >= d - REST {
            (d, zeit < d - REST)
        } else {
            (t, false)
        }
    } else if t <= REST {
        (0.0, zeit > REST)
    } else {
        (t, false)
    }
}

// ------------------------------------------------------------------------------------------------ Takt

/// Knoten-Teile der Puppe an `wurzel` (Zeile je Knoten + 1, 0 = fehlt), entlang der Modell-Hierarchie.
fn zuordnen(w: &Welt, etikett: usize, m: &Modell, wurzel: usize, karte: &mut Vec<u32>) {
    karte.clear();
    karte.resize(m.knoten.len(), 0);
    let mut stapel: Vec<(usize, Option<u32>)> = alloc::vec![(wurzel, None)];
    while let Some((z, eltern)) = stapel.pop() {
        for &kind in &w.teile.kinder[z] {
            let Some(kz) = w.zeile_opt(kind) else { continue };
            let Some(ez) = w.komp_zeile(kz, etikett) else { continue };
            let k = w.speicher[etikett].zahl(super::etikett::KNOTEN)[ez];
            if !(k >= 1.0) || k as usize > m.knoten.len() {
                continue;
            }
            let i = k as usize - 1;
            if m.knoten[i].eltern == eltern && karte[i] == 0 {
                karte[i] = kz as u32 + 1;
                stapel.push((kz, Some(i as u32)));
            }
        }
    }
}

/// Sucht das Modell zur Wurzel: Form eines `Koerper` an einem Knoten-Teil (oder dessen Primitiven-Kind ohne Etikett).
fn modell_finden(w: &Welt, etikett: usize, wurzel: usize) -> f64 {
    let Some(ka) = w.art_index("Koerper") else { return 0.0 };
    let form_von = |z: usize| -> Option<f64> {
        let kz = w.komp_zeile(z, ka)?;
        let f = w.speicher[ka].zahl(super::koerper::FORM)[kz] as u32;
        w.ressourcen.modelle.iter().position(|m| m.netze.contains(&f)).map(|i| (i + 1) as f64)
    };
    let mut stapel = alloc::vec![wurzel];
    while let Some(z) = stapel.pop() {
        for &kind in w.teile.kinder[z].iter().rev() {
            let Some(kz) = w.zeile_opt(kind) else { continue };
            let knoten = w.komp_zeile(kz, etikett).map(|ez| w.speicher[etikett].zahl(super::etikett::KNOTEN)[ez]).unwrap_or(0.0);
            if z != wurzel && knoten == 0.0 {
                // Primitiven-Kind eines Knotens
                if let Some(m) = form_von(kz) {
                    return m;
                }
            } else if knoten >= 1.0 {
                if let Some(m) = form_von(kz) {
                    return m;
                }
                stapel.push(kz);
            }
        }
    }
    0.0
}

/// Werte je Knoten: Lage (0 … 2), Drehung (3 … 6), Größe (7 … 9); Maske 1 = Lage, 2 = Drehung, 4 = Größe.
#[derive(Clone, Copy, Default)]
struct Pose {
    maske: u8,
    v: [f64; 10],
}

fn pose_aus(m: &Modell, folge: usize, t: f64, posen: &mut [Pose]) {
    let mut aus = [0.0; 4];
    for k in &m.folgen[folge].kanaele {
        abtasten(k, t, &mut aus);
        let p = &mut posen[k.knoten as usize];
        match k.pfad {
            0 => {
                p.maske |= 1;
                p.v[0..3].copy_from_slice(&aus[..3]);
            }
            1 => {
                p.maske |= 2;
                p.v[3..7].copy_from_slice(&aus);
            }
            _ => {
                p.maske |= 4;
                p.v[7..10].copy_from_slice(&aus[..3]);
            }
        }
    }
}

/// Ruhelage eines Knotens als Pose (alle drei Größen).
fn ruhe(m: &Modell, i: usize) -> [f64; 10] {
    let l = &m.knoten[i].lage;
    let q = euler_quat(l[3], l[4], l[5]);
    [l[0], l[1], l[2], q[0], q[1], q[2], q[3], l[6], l[7], l[8]]
}

#[derive(Default)]
struct Kram {
    karte: Vec<u32>,
    neu: Vec<Pose>,
    alt: Vec<Pose>,
    schreiben: Vec<(usize, u8, [f64; 9])>,
}

fn takt(w: &mut Welt, s: &mut Speicher) {
    let Some(etikett) = w.art_index("Etikett") else { return };
    let mut kram = Kram::default();
    for z in 0..s.len() {
        let teil = s.teil[z];
        let Some(r) = wach(w, teil) else { continue };
        // Modell (neu) finden
        if s.zahl(WURZEL)[z] != teil as f64 || s.zahl(MODELL)[z] == 0.0 {
            let m = modell_finden(w, etikett, r);
            s.zahl_mut(MODELL)[z] = m;
            s.zahl_mut(WURZEL)[z] = teil as f64;
        }
        let mi = s.zahl(MODELL)[z] as usize;
        if mi == 0 || mi > w.ressourcen.modelle.len() {
            continue;
        }
        let m = &w.ressourcen.modelle[mi - 1];
        let fi = {
            let name = s.text(FOLGE)[z].as_str();
            if name.is_empty() {
                0.0
            } else {
                m.folgen.iter().position(|f| f.name == name).map(|i| (i + 1) as f64).unwrap_or(0.0)
            }
        };
        let (_, [tempo, schleife, zeit, laeuft, blende, dauer_f, fertig, aktiv, vorher, vorher_zeit, misch, misch_dauer, zeit_stand]) = s
            .zahlen_mut([TEMPO, SCHLEIFE, ZEIT, LAEUFT, BLENDE, DAUER, FERTIG, AKTIV, VORHER, VORHER_ZEIT, MISCH, MISCH_DAUER, ZEIT_STAND]);
        let gesprungen = zeit[z].to_bits() != zeit_stand[z].to_bits();
        let schl = schleife[z] != 0.0;
        let dt = if laeuft[z] != 0.0 { DT * tempo[z] } else { 0.0 };
        let mut vorlauf = !gesprungen;
        if aktiv[z] < 0.0 {
            aktiv[z] = fi;
            vorlauf = false;
        } else if fi != aktiv[z] {
            // Wechsel: von der bisherigen Folge (bzw. dem bisherigen Ziel) überblenden
            if blende[z] > 0.0 {
                vorher[z] = aktiv[z];
                vorher_zeit[z] = zeit_stand[z];
                misch[z] = 0.0;
                misch_dauer[z] = blende[z];
            } else {
                vorher[z] = 0.0;
                misch_dauer[z] = 0.0;
            }
            aktiv[z] = fi;
            if !gesprungen {
                zeit[z] = 0.0;
            }
            vorlauf = false;
        } else if misch_dauer[z] > 0.0 {
            misch[z] += DT;
        }
        let a = aktiv[z] as usize;
        let d = if a > 0 { dauer(m, a - 1) } else { 0.0 };
        dauer_f[z] = d;
        fertig[z] = 0.0;
        if vorlauf && dt != 0.0 {
            let (t, ende) = fortschreiten(zeit[z], dt, d, schl);
            zeit[z] = t;
            if ende {
                fertig[z] = 1.0;
            }
        } else if !(d > 0.0) {
            zeit[z] = 0.0;
        }
        zeit_stand[z] = zeit[z];
        // Blenden
        let mut gewicht = 1.0;
        let b = if misch_dauer[z] > 0.0 {
            gewicht = misch[z] / misch_dauer[z];
            let b = vorher[z] as usize;
            if b > 0 && misch[z] > 0.0 && dt != 0.0 {
                vorher_zeit[z] = fortschreiten(vorher_zeit[z], dt, dauer(m, b - 1), schl).0;
            }
            if gewicht >= 1.0 - REST {
                gewicht = 1.0;
                misch_dauer[z] = 0.0;
                vorher[z] = 0.0;
            }
            Some(b)
        } else {
            None
        };
        if a == 0 && b.is_none() {
            continue;
        }
        // Posen
        let n = m.knoten.len();
        kram.neu.clear();
        kram.neu.resize(n, Pose::default());
        kram.alt.clear();
        kram.alt.resize(n, Pose::default());
        if a > 0 {
            pose_aus(m, a - 1, zeit[z], &mut kram.neu);
        }
        if let Some(b) = b {
            if b > 0 {
                pose_aus(m, b - 1, vorher_zeit[z], &mut kram.alt);
            }
        }
        zuordnen(w, etikett, m, r, &mut kram.karte);
        for i in 0..n {
            let (pn, pa) = (kram.neu[i], kram.alt[i]);
            let maske = pn.maske | if b.is_some() { pa.maske } else { 0 };
            if maske == 0 || kram.karte[i] == 0 {
                continue;
            }
            let mut v = [0.0; 10];
            let ru = if pn.maske != maske || pa.maske != maske { Some(ruhe(m, i)) } else { None };
            let wert = |p: &Pose, bit: u8, j: core::ops::Range<usize>| -> [f64; 4] {
                let q = if p.maske & bit != 0 { &p.v } else { ru.as_ref().unwrap() };
                let mut o = [0.0; 4];
                o[..j.len()].copy_from_slice(&q[j]);
                o
            };
            for (bit, j) in [(1u8, 0..3), (2, 3..7), (4, 7..10)] {
                if maske & bit == 0 {
                    continue;
                }
                let nv = wert(&pn, bit, j.clone());
                let x = if b.is_some() {
                    let av = wert(&pa, bit, j.clone());
                    if bit == 2 {
                        slerp(av, nv, gewicht)
                    } else {
                        let l = lerp3(&av, &nv, gewicht);
                        [l[0], l[1], l[2], 0.0]
                    }
                } else {
                    nv
                };
                v[j.clone()].copy_from_slice(&x[..j.len()]);
            }
            let mut lage = [0.0; 9];
            lage[0..3].copy_from_slice(&v[0..3]);
            if maske & 2 != 0 {
                let (dr, ne, ro) = euler(quat_matrix([v[3], v[4], v[5], v[6]]));
                lage[3..6].copy_from_slice(&[dr, ne, ro]);
            }
            lage[6..9].copy_from_slice(&v[7..10]);
            kram.schreiben.push((kram.karte[i] as usize - 1, maske, lage));
        }
        for (kz, maske, l) in kram.schreiben.drain(..) {
            let ziel = &mut w.teile.lage[kz];
            for (bit, j) in [(1u8, 0..3), (2, 3..6), (4, 6..9)] {
                if maske & bit != 0 {
                    ziel[j.clone()].copy_from_slice(&l[j]);
                }
            }
            w.markiere(kz);
        }
    }
}

// ------------------------------------------------------------------------------------------------ Haut (H-K23b)

/// 3 × 4-Matrix zeilenweise (Rotation·Skalierung | Verschiebung), wie `Teile::welt` und INST3D.
type M34 = [f64; 12];

const EINS34: M34 = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0];

/// Höchstens so viele Gelenke je Bild (Palettenzeile in `ZUSATZ3D.merkmale` Bits 16–31).
pub const MAX_GELENKE_BILD: usize = 65_536;

fn m34_mal(a: &M34, b: &M34) -> M34 {
    let mut r = [0.0; 12];
    for z in 0..3 {
        for s in 0..4 {
            let v = a[z * 4] * b[s] + a[z * 4 + 1] * b[4 + s] + a[z * 4 + 2] * b[8 + s];
            r[z * 4 + s] = if s == 3 { v + a[z * 4 + 3] } else { v };
        }
    }
    r
}

/// Inverse einer affinen 3 × 4-Matrix über die Kofaktoren (nur + − × ÷); singulär → `None`.
fn m34_invers(m: &M34) -> Option<M34> {
    let (a, b, c, d, e, f, g, h, i) = (m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]);
    let k0 = e * i - f * h;
    let k1 = f * g - d * i;
    let k2 = d * h - e * g;
    let det = a * k0 + b * k1 + c * k2;
    if !(det.abs() > 1e-300) || !det.is_finite() {
        return None;
    }
    let r = [
        k0 / det,
        (c * h - b * i) / det,
        (b * f - c * e) / det,
        k1 / det,
        (a * i - c * g) / det,
        (c * d - a * f) / det,
        k2 / det,
        (b * g - a * h) / det,
        (a * e - b * d) / det,
    ];
    let (tx, ty, tz) = (m[3], m[7], m[11]);
    Some([
        r[0],
        r[1],
        r[2],
        -(r[0] * tx + r[1] * ty + r[2] * tz),
        r[3],
        r[4],
        r[5],
        -(r[3] * tx + r[4] * ty + r[5] * tz),
        r[6],
        r[7],
        r[8],
        -(r[6] * tx + r[7] * ty + r[8] * tz),
    ])
}

/// Inverse Bindematrix (glTF, f32 spaltenweise 4 × 4) als 3 × 4 zeilenweise.
fn ibm34(v: &[f32]) -> M34 {
    let mut r = [0.0; 12];
    for z in 0..3 {
        for s in 0..4 {
            r[z * 4 + s] = crate::mathe::fin(v[s * 4 + z]) as f64;
        }
    }
    r
}

fn knoten_von(w: &Welt, etikett: usize, z: usize) -> f64 {
    w.komp_zeile(z, etikett).map(|ez| w.speicher[etikett].zahl(super::etikett::KNOTEN)[ez]).unwrap_or(0.0)
}

fn eltern_zeile(w: &Welt, z: usize) -> Option<usize> {
    let e = w.teile.eltern[z];
    if e == 0 {
        None
    } else {
        w.zeile_opt(e)
    }
}

/// Gelenk-Palette eines gehäuteten `Koerper` (Teil-Zeile `tz`, Welt-Matrix `m`, Ruhelage-Kasten des Netzes `mi`/`ma`):
/// das Knoten-Teil (das Teil selbst oder – bei mehreren Primitiven – sein Eltern-Teil) nennt über sein `Etikett` den Knoten,
/// dessen Haut gilt; die Gelenk-Teile findet derselbe Gang wie bei der Puppe (von der Modell-Wurzel entlang der
/// Modell-Hierarchie). Je Gelenk `m⁻¹ · Welt(Gelenk) · inverse Bindematrix` (f64) ans Ende von `palette`.
/// Rückgabe: erste Palettenzeile und die Hülle fürs Culling (je Gelenk dessen Lage ± größter Abstand einer Ecke des
/// Ruhelage-Kastens im Gelenk-Raum × Gelenk-Maßstab – konservativ). `None` = starr wie vorher (kein Knoten, keine Haut,
/// fehlendes Gelenk-Teil, singuläre Matrix, Palette voll).
#[allow(clippy::too_many_arguments)]
pub fn haut(
    w: &Welt,
    karte: &mut (usize, usize, Vec<u32>),
    tz: usize,
    h: &crate::ressourcen::HautNetz,
    mi: [f64; 3],
    ma: [f64; 3],
    m: &M34,
    palette: &mut Vec<[f64; 12]>,
) -> Option<(u32, [f64; 3], [f64; 3])> {
    let etikett = w.art_index("Etikett")?;
    let modell = w.ressourcen.modelle.get(h.modell as usize)?;
    // Knoten-Teil: das Teil selbst oder das Eltern-Teil eines Primitiven-Kinds
    let (mut kz, mut k) = (tz, knoten_von(w, etikett, tz));
    if k < 1.0 {
        kz = eltern_zeile(w, tz)?;
        k = knoten_von(w, etikett, kz);
    }
    if !(k >= 1.0) || k as usize > modell.knoten.len() {
        return None;
    }
    let ki = k as usize - 1;
    let haut = modell.haeute.get(modell.knoten[ki].haut? as usize)?;
    // hinauf zur Modell-Wurzel, entlang der Modell-Hierarchie
    let (mut z, mut j) = (kz, ki);
    while let Some(e) = modell.knoten[j].eltern {
        let p = eltern_zeile(w, z)?;
        if knoten_von(w, etikett, p) != (e + 1) as f64 {
            return None;
        }
        z = p;
        j = e as usize;
    }
    let wurzel = eltern_zeile(w, z)?;
    if karte.0 != wurzel + 1 || karte.1 != h.modell as usize {
        zuordnen(w, etikett, modell, wurzel, &mut karte.2);
        karte.0 = wurzel + 1;
        karte.1 = h.modell as usize;
    }
    let n = haut.gelenke.len().max(h.gelenke as usize);
    let basis = palette.len();
    if basis + n > MAX_GELENKE_BILD {
        return None;
    }
    let inv = m34_invers(m)?;
    let ecken: [[f64; 3]; 8] = core::array::from_fn(|c| {
        [if c & 1 != 0 { ma[0] } else { mi[0] }, if c & 2 != 0 { ma[1] } else { mi[1] }, if c & 4 != 0 { ma[2] } else { mi[2] }]
    });
    let (mut lo, mut hi) = ([f64::MAX; 3], [f64::MIN; 3]);
    for g in 0..n {
        let Some(&gk) = haut.gelenke.get(g) else {
            // Index jenseits der Gelenke der Haut: Ruhelage relativ zum Körper
            palette.push(EINS34);
            let (a, b) = crate::welt::kasten_3d(m, mi, ma);
            for x in 0..3 {
                lo[x] = lo[x].min(a[x]);
                hi[x] = hi[x].max(b[x]);
            }
            continue;
        };
        let gz = match karte.2.get(gk as usize) {
            Some(&t) if t > 0 => t as usize - 1,
            _ => {
                palette.truncate(basis);
                return None;
            }
        };
        let wg = &w.teile.welt[gz];
        let b = ibm34(&haut.ibm[g * 16..g * 16 + 16]);
        palette.push(m34_mal(&inv, &m34_mal(wg, &b)));
        // Hülle: Gelenk-Lage ± (größter Eckabstand im Gelenk-Raum) × größte Spaltenlänge der Gelenk-Matrix
        let mut r2: f64 = 0.0;
        for e in &ecken {
            let q = [
                b[0] * e[0] + b[1] * e[1] + b[2] * e[2] + b[3],
                b[4] * e[0] + b[5] * e[1] + b[6] * e[2] + b[7],
                b[8] * e[0] + b[9] * e[1] + b[10] * e[2] + b[11],
            ];
            r2 = r2.max(q[0] * q[0] + q[1] * q[1] + q[2] * q[2]);
        }
        let mut s2: f64 = 0.0;
        for c in 0..3 {
            s2 = s2.max(wg[c] * wg[c] + wg[4 + c] * wg[4 + c] + wg[8 + c] * wg[8 + c]);
        }
        let r = libm::sqrt(r2) * libm::sqrt(s2);
        for (x, t) in [wg[3], wg[7], wg[11]].into_iter().enumerate() {
            lo[x] = lo[x].min(t - r);
            hi[x] = hi[x].max(t + r);
        }
    }
    if !(lo[0] <= hi[0] && lo[1] <= hi[1] && lo[2] <= hi[2]) || lo.iter().chain(hi.iter()).any(|v| !v.is_finite()) {
        palette.truncate(basis);
        return None;
    }
    Some((basis as u32, lo, hi))
}
