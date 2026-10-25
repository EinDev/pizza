//! `Funken` (3D): Teilchen-Emitter im Raum (Unity: Particle System, kamerazugewandte Teilchen). Teilchen leben im Kern
//! (f64, eigener deterministischer Zufall wie `Partikel`, eigene Saat-Mischung), höchstens 10 000 je Emitter. Ausstoß in
//! einem Kegel um `richtung` (in den Achsen des Teils), Schwerkraft nach −y. Bildbeitrag: Teilchen für den Abschnitt
//! `TEILCHEN3D` (leuchtend = additiv, deckend = gemischt, vom Kern von hinten nach vorn sortiert).
//!
//! Nachtragsfelder „Regen“ (alle Standard = wie zuvor, Paket byte-gleich): `streckung` (Belichtungszeit in s: das Teilchen
//! wird als Strich entlang seiner Geschwindigkeit gezeichnet, Länge = Tempo · `streckung`), `licht` (Anteil, mit dem
//! Umgebung und Lichter das Teilchen färben – Tropfen leuchten in den Farben der Neonlichter, gegen das Licht heller),
//! `volumen` (halbe Kantenlänge eines waagerechten Quadrats um das Teil: Ausstoß gleichmäßig darin, wer es verlässt,
//! kommt auf der Gegenseite wieder herein – wenige Tropfen wirken dicht, das Volumen folgt dem Teil), `aufschlag`/`boden`/
//! `spritzer` (Teilchen enden unter der Höhe `boden` und werfen `spritzer` kurze Spritzer), `regen` (Rate × `Stimmung.regen`).
//! Zusatz je Teilchen (Strich, Licht) im Abschnitt `ZUSATZ_TEILCHEN` (`paket.rs`), nur wenn benutzt.
//!
//! Nachtragsfelder „Aufprall“ (H-K25, Unity: Collision-Modul): `kollision` (`keine` = wie zuvor, `aufschlag` gilt weiter;
//! `boden` = waagerechte Ebene auf Höhe `boden`; `welt` = feste Fühler-Formen und Gelände über `kollision3d`, jedes Teilchen als
//! Strecke seines Wegs im Takt), `aufprall` (`vergehen` | `abprallen` | `liegen`), `abprall` (Anteil des Normaltempos, mit dem
//! ein Teilchen zurückspringt). Spritzer wie beim Regen: `spritzer` je Aufprall (Kegel um die Normale), nur ab
//! [`SPRITZ_MIN`] Normaltempo, höchstens [`SPRITZ_MAX_TAKT`] neue je Takt und Emitter. Liegende Teilchen tragen ein negatives
//! `alter` (Betrag = Alter); sie bewegen sich nicht mehr und laufen nicht mit dem Volumen um.

use alloc::vec::Vec;

use super::partikel::{mische, zufall};
use super::*;
use crate::kollision3d::{self, Gitter, Umgebung, Ziel};
use crate::paket::Teilchen3;
use crate::schema::{Feld, Genus, Raum, Schema, Spalte};
use crate::welt::{kasten_3d, punkt_3d, GRAD};

pub const RATE: usize = 0;
pub const LEBENSDAUER: usize = 1;
pub const TEMPO: usize = 2;
pub const RICHTUNG_X: usize = 3;
pub const RICHTUNG_Y: usize = 4;
pub const RICHTUNG_Z: usize = 5;
pub const STREUUNG: usize = 6;
pub const SCHWERKRAFT: usize = 7;
pub const GROESSE: usize = 8;
pub const GROESSE_ENDE: usize = 9;
pub const FARBE: usize = 10;
pub const FARBE_ENDE: usize = 11;
pub const MISCHUNG: usize = 12;
pub const WELTLAGE: usize = 13;
pub const AKTIV: usize = 14;
pub const SAAT: usize = 15;
/// Nachtragsfelder „Regen“
pub const STRECKUNG: usize = 16;
pub const LICHT: usize = 17;
pub const VOLUMEN: usize = 18;
pub const AUFSCHLAG: usize = 19;
pub const BODEN: usize = 20;
pub const SPRITZER: usize = 21;
pub const REGEN: usize = 22;
/// Nachtragsfelder „Aufprall“ (H-K25)
pub const KOLLISION: usize = 23;
pub const AUFPRALL: usize = 24;
pub const ABPRALL: usize = 25;
/// verborgen: Zufallszustand (0 = noch nicht gesät)
pub const ZUFALL: usize = 26;
/// verborgen: angesammelte Ausstoß-Bruchteile
pub const REST: usize = 27;
/// verborgen: Teilchen je 8 Zahlen (x, y, z, vx, vy, vz, alter, leben) – in Weltlage (`weltlage` ja) bzw. im Raum des Teils;
/// Spritzer (`aufschlag`, `kollision`) tragen ein negatives `leben` (Betrag = Lebensdauer), liegende Teilchen (`aufprall`
/// `liegen`) ein negatives `alter`
pub const TEILCHEN: usize = 28;

/// Werte von `kollision`
pub mod kollision {
    pub const KEINE: u32 = 0;
    pub const BODEN: u32 = 1;
    pub const WELT: u32 = 2;
}
/// Werte von `aufprall`
pub mod aufprall {
    pub const VERGEHEN: u32 = 0;
    pub const ABPRALLEN: u32 = 1;
    pub const LIEGEN: u32 = 2;
}

pub const MAX_TEILCHEN: usize = 10_000;
const T: usize = 8;
/// Saat-Mischung: Funken und Partikel am selben Teil (gleiche Saat) ziehen verschiedene Folgen.
const SAAT_MISCHUNG: u32 = 0x9E37_79B9;
/// Spritzer: Schwerkraft (Einheiten/s²), Anteil des Aufschlag-Tempos, Lebensdauer (s), Größe relativ zu `groesse`
const SPRITZ_G: f64 = 9.81;
const SPRITZ_TEMPO: f64 = 0.16;
const SPRITZ_LEBEN: f64 = 0.24;
const SPRITZ_GROESSE: f64 = 0.7;
const SPRITZ_STREUUNG: f64 = 50.0;
/// Aufprall (H-K25): Spritzer nur ab diesem Normaltempo (Einheiten/s) – gleitende und ruhende Teilchen spritzen nicht
pub const SPRITZ_MIN: f64 = 1.0;
/// Aufprall: höchstens so viele neue Spritzer je Takt und Emitter
pub const SPRITZ_MAX_TAKT: usize = 1000;
/// Aufprall: Abstand über der getroffenen Fläche nach Abprallen/Liegen (Einheiten), damit der nächste Weg nicht sofort trifft
const AUF_ABSTAND: f64 = 0.002;
/// Aufprall: Spritzer entstehen so hoch über der Fläche (wie beim Regen)
const SPRITZ_ABSTAND: f64 = 0.005;
/// Abprallen: springt ein Teilchen langsamer als das zurück (Einheiten/s), gleitet es (Normaltempo 0)
const RUHE: f64 = 0.1;

pub static ART: Art = Art {
    schema: Schema {
        name: "Funken", genus: Genus::M,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::zahl("rate", 30.0).bereich(0.0, 100_000.0),
            Feld::zahl("lebensdauer", 1.0).min(0.0),
            Feld::zahl("tempo", 2.0),
            Feld::zahl("richtungX", 0.0),
            Feld::zahl("richtungY", 1.0),
            Feld::zahl("richtungZ", 0.0),
            Feld::zahl("streuung", 30.0).bereich(0.0, 180.0),
            Feld::zahl("schwerkraft", 0.0),
            Feld::zahl("groesse", 0.2).min(0.0),
            Feld::zahl("groesseEnde", 0.0).min(0.0),
            Feld::farbe("farbe", "senf"),
            Feld::farbe("farbeEnde", "tomate"),
            Feld::wahl("mischung", &["leuchtend", "deckend"], 0),
            Feld::diavolo("weltlage", true),
            Feld::diavolo("aktiv", true),
            Feld::ganz("saat", 0.0).bereich(0.0, 4_294_967_295.0),
            Feld::zahl("streckung", 0.0).bereich(0.0, 10.0).nachtrag(),
            Feld::zahl("licht", 0.0).bereich(0.0, 1.0).nachtrag(),
            Feld::zahl("volumen", 0.0).bereich(0.0, 10_000.0).nachtrag(),
            Feld::diavolo("aufschlag", false).nachtrag(),
            Feld::zahl("boden", 0.0).nachtrag(),
            Feld::ganz("spritzer", 3.0).bereich(0.0, 16.0).nachtrag(),
            Feld::diavolo("regen", false).nachtrag(),
            Feld::wahl("kollision", &["keine", "boden", "welt"], 0).nachtrag(),
            Feld::wahl("aufprall", &["vergehen", "abprallen", "liegen"], 0).nachtrag(),
            Feld::zahl("abprall", 0.3).bereich(0.0, 1.0).nachtrag(),
            Feld::intern("zufall", 0.0),
            Feld::intern("rest", 0.0),
            Feld::puffer("teilchen"),
        ],
    },
    takt: Some(takt),
    bild: Some(bild),
    ..Art::LEER
};

fn norm(v: [f64; 3]) -> Option<[f64; 3]> {
    let l = libm::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if l > 1e-12 && l.is_finite() {
        Some([v[0] / l, v[1] / l, v[2] / l])
    } else {
        None
    }
}

fn kreuz(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/// Zufällige Richtung im Kegel um die Achse `a` (normiert) mit halbem Öffnungswinkel `streuung` (Grad), gleichmäßig über
/// die Kugelkappe: cos θ = 1 − u·(1 − cos θmax), φ = 2π·v.
fn kegel(a: [f64; 3], streuung: f64, zs: &mut u32) -> [f64; 3] {
    let u = zufall(zs);
    let v = zufall(zs);
    let ct = 1.0 - u * (1.0 - libm::cos(streuung * GRAD));
    let st2 = 1.0 - ct * ct;
    let st = if st2 > 0.0 { libm::sqrt(st2) } else { 0.0 };
    let phi = v * 360.0 * GRAD;
    let (cp, sp) = (libm::cos(phi), libm::sin(phi));
    let hilf = if betrag(a[1]) < 0.9 { [0.0, 1.0, 0.0] } else { [1.0, 0.0, 0.0] };
    let b1 = norm(kreuz(hilf, a)).unwrap_or([1.0, 0.0, 0.0]);
    let b2 = kreuz(a, b1);
    [
        a[0] * ct + (b1[0] * cp + b2[0] * sp) * st,
        a[1] * ct + (b1[1] * cp + b2[1] * sp) * st,
        a[2] * ct + (b1[2] * cp + b2[2] * sp) * st,
    ]
}

/// Verschiebt `x` um ganze Vielfache von 2·`h`, bis es in [m − h, m + h) liegt (Volumen um das Teil).
fn umlauf(x: f64, m: f64, h: f64) -> f64 {
    let d = x - m;
    if d >= -h && d < h {
        return x;
    }
    x - 2.0 * h * libm::floor((d + h) / (2.0 * h))
}

/// Einstellungen eines Emitters für [`mit_aufprall`].
struct Aufprall {
    modus: u32,
    nach: u32,
    abprall: f64,
    boden: f64,
    spritzer: usize,
    g: f64,
    weltlage: bool,
    teil: u32,
    mitte: Option<[f64; 3]>,
    volumen: f64,
}

/// Normale `n` (Welt) in den Raum des Teils mit Welt-Matrix `m`: Mᵀ · n (die Länge normiert der Aufrufer).
#[inline]
fn normale_lokal(m: &[f64; 12], n: [f64; 3]) -> [f64; 3] {
    [m[0] * n[0] + m[4] * n[1] + m[8] * n[2], m[1] * n[0] + m[5] * n[1] + m[9] * n[2], m[2] * n[0] + m[6] * n[1] + m[10] * n[2]]
}

/// Leben mit Aufprall (H-K25, `kollision` ≠ `keine`): altern, fallen, bewegen, den Weg im Takt gegen die Ebene bzw. die Welt
/// prüfen, abprallen/vergehen/liegen, Tote entfernen (Reihenfolge bleibt), dann die Spritzer. Liefert, ob Zufall gezogen wurde.
fn mit_aufprall(w: &mut Welt, ziele: &mut Option<Vec<Ziel>>, a: &Aufprall, liste: &mut Vec<f64>, zs: &mut u32) -> bool {
    // Teilchen im Raum des Teils: Welt = m · lokal
    let m: Option<[f64; 12]> = if a.weltlage || a.teil == 0 {
        None
    } else {
        w.zeile_opt(a.teil).map(|r| {
            w.aktualisiere(r);
            w.teile.welt[r]
        })
    };
    let mut gitter: Option<Gitter> = None;
    if a.modus == kollision::WELT && !liste.is_empty() {
        if ziele.is_none() {
            *ziele = Some(kollision3d::ziele(w));
        }
        // Kasten aller Wege dieses Takts: Lagen ± (Tempo + g · DT) · DT
        let mut lo = [f64::INFINITY; 3];
        let mut hi = [f64::NEG_INFINITY; 3];
        let mut v2max = 0.0;
        for p in liste.chunks_exact(T) {
            for k in 0..3 {
                if p[k] < lo[k] {
                    lo[k] = p[k];
                }
                if p[k] > hi[k] {
                    hi[k] = p[k];
                }
            }
            let v2 = p[3] * p[3] + p[4] * p[4] + p[5] * p[5];
            if v2 > v2max {
                v2max = v2;
            }
        }
        let g = if betrag(a.g) > SPRITZ_G { betrag(a.g) } else { SPRITZ_G };
        let rand = (libm::sqrt(v2max) + g * DT) * DT + 0.01;
        for k in 0..3 {
            lo[k] -= rand;
            hi[k] += rand;
        }
        if let Some(m) = &m {
            (lo, hi) = kasten_3d(m, lo, hi);
        }
        if lo.iter().chain(hi.iter()).all(|x| x.is_finite()) {
            let teil = a.teil;
            let gt = Gitter::neu(ziele.as_deref().unwrap_or(&[]), lo, hi, |z| z.teil != teil && !z.ausloeser && !z.figur && !z.dynamisch);
            if !gt.leer() {
                gitter = Some(gt);
            }
        }
    }
    let zl: &[Ziel] = ziele.as_deref().unwrap_or(&[]);
    let u = Umgebung { ressourcen: &w.ressourcen, gelaende: w.art_index("Gelaende").map(|g| &w.speicher[g]) };
    let oben = [0.0, 1.0, 0.0];
    // Aufpralle mit Spritzern: Punkt, Normale (Raum der Teilchen), Tempo
    let mut aufpralle: Vec<[f64; 7]> = Vec::new();
    let mut j = 0;
    let mut i = 0;
    while i + T <= liste.len() {
        let mut p = [0.0; T];
        p.copy_from_slice(&liste[i..i + T]);
        i += T;
        let spritz = p[7] < 0.0;
        let leben = betrag(p[7]);
        if p[6] < 0.0 {
            // liegt: nur altern
            let alter = DT - p[6];
            if alter < leben {
                p[6] = -alter;
                liste[j..j + T].copy_from_slice(&p);
                j += T;
            }
            continue;
        }
        p[6] += DT;
        if !(p[6] < leben) {
            continue;
        }
        p[4] -= if spritz { SPRITZ_G } else { a.g } * DT;
        let alt = [p[0], p[1], p[2]];
        p[0] += p[3] * DT;
        p[1] += p[4] * DT;
        p[2] += p[5] * DT;
        let neu = [p[0], p[1], p[2]];
        // Treffer: Anteil des Wegs und Normale im Raum der Teilchen
        let mut treffer: Option<(f64, [f64; 3])> = None;
        if a.modus == kollision::BODEN {
            if neu[1] < a.boden {
                let f = if alt[1] > a.boden { (alt[1] - a.boden) / (alt[1] - neu[1]) } else { 0.0 };
                treffer = Some((f, oben));
            }
        } else if let Some(gt) = &gitter {
            let (o, e) = match &m {
                Some(m) => (punkt_3d(m, alt), punkt_3d(m, neu)),
                None => (alt, neu),
            };
            if let Some((_, h)) = gt.strecke(zl, &u, o, e) {
                let l = kollision3d::laenge(kollision3d::minus(e, o));
                let f = if l > 0.0 { h.t / l } else { 0.0 };
                let n = match &m {
                    Some(m) => kollision3d::norm_oder(normale_lokal(m, h.n), oben),
                    None => h.n,
                };
                treffer = Some((f, n));
            }
        }
        let Some((f, n)) = treffer else {
            if let (Some(c), false) = (a.mitte, spritz) {
                p[0] = umlauf(p[0], c[0], a.volumen);
                p[2] = umlauf(p[2], c[2], a.volumen);
            }
            liste[j..j + T].copy_from_slice(&p);
            j += T;
            continue;
        };
        // Spritzer vergehen immer
        if spritz {
            continue;
        }
        let f = if f > 1.0 { 1.0 } else if f > 0.0 { f } else { 0.0 };
        let mut q = [alt[0] + (neu[0] - alt[0]) * f, alt[1] + (neu[1] - alt[1]) * f, alt[2] + (neu[2] - alt[2]) * f];
        if a.modus == kollision::BODEN {
            q[1] = a.boden;
        }
        let v = [p[3], p[4], p[5]];
        let vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
        if a.spritzer > 0 && -vn >= SPRITZ_MIN && (aufpralle.len() + 1) * a.spritzer <= SPRITZ_MAX_TAKT {
            aufpralle.push([q[0], q[1], q[2], n[0], n[1], n[2], libm::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])]);
        }
        let ab = [q[0] + n[0] * AUF_ABSTAND, q[1] + n[1] * AUF_ABSTAND, q[2] + n[2] * AUF_ABSTAND];
        match a.nach {
            aufprall::ABPRALLEN => {
                // Normalanteil umkehren und mit `abprall` dämpfen, Tangentialanteil bleibt; zu langsam → gleiten
                let zurueck = if vn < 0.0 { -vn * a.abprall } else { vn };
                let zurueck = if zurueck < RUHE { 0.0 } else { zurueck };
                for k in 0..3 {
                    p[k] = ab[k];
                    p[3 + k] = v[k] - n[k] * vn + n[k] * zurueck;
                }
            }
            aufprall::LIEGEN => {
                for k in 0..3 {
                    p[k] = ab[k];
                    p[3 + k] = 0.0;
                }
                p[6] = -p[6];
            }
            _ => continue, // vergehen
        }
        liste[j..j + T].copy_from_slice(&p);
        j += T;
    }
    liste.truncate(j);
    // Spritzer: je Aufprall `spritzer` kurze Teilchen im Kegel um die Normale, Tempo aus dem Aufprall
    let mut gezogen = false;
    for t in &aufpralle {
        let v0 = t[6] * SPRITZ_TEMPO;
        let n = [t[3], t[4], t[5]];
        for _ in 0..a.spritzer {
            if liste.len() / T >= MAX_TEILCHEN {
                break;
            }
            gezogen = true;
            let d = kegel(n, SPRITZ_STREUUNG, zs);
            let v = v0 * (0.5 + zufall(zs));
            let leben = SPRITZ_LEBEN * (0.7 + 0.6 * zufall(zs));
            liste.extend_from_slice(&[
                t[0] + n[0] * SPRITZ_ABSTAND,
                t[1] + n[1] * SPRITZ_ABSTAND,
                t[2] + n[2] * SPRITZ_ABSTAND,
                d[0] * v,
                d[1] * v,
                d[2] * v,
                0.0,
                -leben,
            ]);
        }
    }
    gezogen
}

fn takt(w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    let regen = super::stimmung::regen(w);
    let mut puffer = core::mem::replace(&mut s.spalten[TEILCHEN], Spalte::Puffer(Vec::new()));
    let Spalte::Puffer(teilchen) = &mut puffer else { return };
    // Kollisionswelt (H-K25): einmal je Takt, erst wenn ein Emitter sie braucht
    let mut ziele: Option<Vec<Ziel>> = None;
    for z in 0..n {
        let teil = s.teil[z];
        // ruhendes Teil (H-K8): Teilchen frieren ein, kein Ausstoß
        if ruht(w, teil) {
            continue;
        }
        let liste: &mut Vec<f64> = &mut teilchen[z];
        let weltlage = s.zahl(WELTLAGE)[z] != 0.0;
        // Volumen um das Teil (waagerecht): Mitte in den Koordinaten der Teilchen
        let volumen = s.zahl(VOLUMEN)[z];
        let mut mitte: Option<[f64; 3]> = None;
        if volumen > 0.0 {
            if !weltlage {
                mitte = Some([0.0; 3]);
            } else if let Some(r) = if teil == 0 { None } else { w.zeile_opt(teil) } {
                w.aktualisiere(r);
                let m = w.teile.welt[r];
                mitte = Some([m[3], m[7], m[11]]);
            }
        }
        let aufschlag = s.zahl(AUFSCHLAG)[z] != 0.0;
        let boden = s.zahl(BODEN)[z];
        let spritzer = s.zahl(SPRITZER)[z] as usize;
        let mut zs = s.zahl(ZUFALL)[z] as u32;
        if s.zahl(ZUFALL)[z] == 0.0 {
            let saat = s.zahl(SAAT)[z] as u32;
            zs = (if saat != 0 { saat } else { teil }) ^ SAAT_MISCHUNG;
        }
        let mut gezogen = false;
        // Leben: altern, fallen, bewegen, Tote entfernen (Reihenfolge bleibt)
        let g = s.zahl(SCHWERKRAFT)[z];
        let modus = s.zahl(KOLLISION)[z] as u32;
        if modus != kollision::KEINE {
            let a = Aufprall {
                modus,
                nach: s.zahl(AUFPRALL)[z] as u32,
                abprall: s.zahl(ABPRALL)[z],
                boden,
                spritzer,
                g,
                weltlage,
                teil,
                mitte,
                volumen,
            };
            gezogen = mit_aufprall(w, &mut ziele, &a, liste, &mut zs);
        } else {
        let mut j = 0;
        let mut i = 0;
        let mut aufschlaege: Vec<[f64; 4]> = Vec::new();
        while i + T <= liste.len() {
            let mut p = [0.0; T];
            p.copy_from_slice(&liste[i..i + T]);
            // lag (H-K25) und `kollision` ist wieder `keine`: fällt weiter
            if p[6] < 0.0 {
                p[6] = -p[6];
            }
            p[6] += DT;
            let spritz = p[7] < 0.0;
            if p[6] < betrag(p[7]) {
                p[4] -= if spritz { SPRITZ_G } else { g } * DT;
                p[0] += p[3] * DT;
                p[1] += p[4] * DT;
                p[2] += p[5] * DT;
                let mut lebt = true;
                if aufschlag && p[1] < boden {
                    lebt = false;
                    if !spritz {
                        aufschlaege.push([p[0], p[2], p[3], p[4]]);
                    }
                }
                if lebt {
                    if let (Some(c), false) = (mitte, spritz) {
                        p[0] = umlauf(p[0], c[0], volumen);
                        p[2] = umlauf(p[2], c[2], volumen);
                    }
                    liste[j..j + T].copy_from_slice(&p);
                    j += T;
                }
            }
            i += T;
        }
        liste.truncate(j);
        // Spritzer: je Aufschlag `spritzer` kurze Teilchen nach oben (Kegel um +y), Tempo aus dem Aufschlag
        for a in &aufschlaege {
            let v0 = libm::sqrt(a[2] * a[2] + a[3] * a[3]) * SPRITZ_TEMPO;
            for _ in 0..spritzer {
                if liste.len() / T >= MAX_TEILCHEN {
                    break;
                }
                gezogen = true;
                let d = kegel([0.0, 1.0, 0.0], SPRITZ_STREUUNG, &mut zs);
                let v = v0 * (0.5 + zufall(&mut zs));
                let leben = SPRITZ_LEBEN * (0.7 + 0.6 * zufall(&mut zs));
                liste.extend_from_slice(&[a[0], boden + 0.005, a[1], d[0] * v, d[1] * v, d[2] * v, 0.0, -leben]);
            }
        }
        }
        if gezogen {
            s.zahl_mut(ZUFALL)[z] = if zs == 0 { 1.0 } else { zs as f64 };
        }
        // Ausstoß
        if teil == 0 || s.zahl(AKTIV)[z] == 0.0 {
            continue;
        }
        let Some(r) = w.zeile_opt(teil) else { continue };
        w.aktualisiere(r);
        if !w.teile.welt_sichtbar[r] {
            continue;
        }
        let faktor = if s.zahl(REGEN)[z] != 0.0 { regen.unwrap_or(1.0) } else { 1.0 };
        let rest = s.zahl(REST)[z] + s.zahl(RATE)[z] * faktor * DT;
        let anzahl = libm::floor(rest);
        s.zahl_mut(REST)[z] = rest - anzahl;
        let leben = s.zahl(LEBENSDAUER)[z];
        if anzahl < 1.0 || !(leben > 0.0) {
            continue;
        }
        let m = w.teile.welt[r];
        // Achse: lokal normiert (Ersatz: nach oben); in Weltlage durch die Drehung des Teils (Matrix-Spalten, normiert)
        let lokal = norm([s.zahl(RICHTUNG_X)[z], s.zahl(RICHTUNG_Y)[z], s.zahl(RICHTUNG_Z)[z]]).unwrap_or([0.0, 1.0, 0.0]);
        let (ursprung, achse) = if weltlage {
            let d = [
                m[0] * lokal[0] + m[1] * lokal[1] + m[2] * lokal[2],
                m[4] * lokal[0] + m[5] * lokal[1] + m[6] * lokal[2],
                m[8] * lokal[0] + m[9] * lokal[1] + m[10] * lokal[2],
            ];
            ([m[3], m[7], m[11]], norm(d).unwrap_or(lokal))
        } else {
            ([0.0; 3], lokal)
        };
        let (tempo, streuung) = (s.zahl(TEMPO)[z], s.zahl(STREUUNG)[z]);
        let mut k = 0.0;
        while k < anzahl && liste.len() / T < MAX_TEILCHEN {
            // Volumen: Ausstoßpunkt gleichmäßig im waagerechten Quadrat um das Teil
            let (ox, oz) = if volumen > 0.0 { ((zufall(&mut zs) * 2.0 - 1.0) * volumen, (zufall(&mut zs) * 2.0 - 1.0) * volumen) } else { (0.0, 0.0) };
            let d = kegel(achse, streuung, &mut zs);
            let v = tempo * (0.75 + 0.5 * zufall(&mut zs));
            let (vx, vy, vz) = (d[0] * v, d[1] * v, d[2] * v);
            // Vorlauf innerhalb des Takts: gleichmäßiger Strahl statt Ringe je Takt
            let vor = zufall(&mut zs) * DT;
            liste.extend_from_slice(&[ursprung[0] + ox + vx * vor, ursprung[1] + vy * vor, ursprung[2] + oz + vz * vor, vx, vy, vz, vor, leben]);
            k += 1.0;
        }
        s.zahl_mut(ZUFALL)[z] = if zs == 0 { 1.0 } else { zs as f64 };
    }
    s.spalten[TEILCHEN] = puffer;
}

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let teilchen = s.puffer(TEILCHEN);
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let liste = &teilchen[z];
        if liste.is_empty() {
            continue;
        }
        let (g0, g1) = (s.zahl(GROESSE)[z], s.zahl(GROESSE_ENDE)[z]);
        let (f0, f1) = (s.farbe(FARBE)[z], s.farbe(FARBE_ENDE)[z]);
        let deckend = s.zahl(MISCHUNG)[z] != 0.0;
        let weltlage = s.zahl(WELTLAGE)[z] != 0.0;
        let streckung = s.zahl(STRECKUNG)[z];
        let licht = ((s.zahl(LICHT)[z] * 255.0 + 0.5) as u32).min(255);
        let m = &w.teile.welt[tz];
        for p in liste.chunks_exact(T) {
            let spritz = p[7] < 0.0;
            let leben = betrag(p[7]);
            // liegende Teilchen (H-K25) tragen ein negatives Alter
            let t = if leben > 0.0 { betrag(p[6]) / leben } else { 1.0 };
            let r = (g0 + (g1 - g0) * t) * 0.5 * if spritz { SPRITZ_GROESSE } else { 1.0 };
            if !(r > 0.0) {
                continue;
            }
            let farbe = mische(f0, f1, t);
            if farbe & 0xFF == 0 {
                continue;
            }
            let mut pos = if weltlage { [p[0], p[1], p[2]] } else { punkt_3d(m, [p[0], p[1], p[2]]) };
            // Strich: halbe Strecke, die das Teilchen in der Belichtungszeit zurücklegt; Mitte dahinter, Kopf = jetzige Lage
            let mut strich = [0.0; 3];
            if streckung > 0.0 {
                let v = if weltlage {
                    [p[3], p[4], p[5]]
                } else {
                    [m[0] * p[3] + m[1] * p[4] + m[2] * p[5], m[4] * p[3] + m[5] * p[4] + m[6] * p[5], m[8] * p[3] + m[9] * p[4] + m[10] * p[5]]
                };
                let h = streckung * 0.5;
                strich = [v[0] * h, v[1] * h, v[2] * h];
                pos = [pos[0] - strich[0], pos[1] - strich[1], pos[2] - strich[2]];
            }
            b.teilchen3d.push(Teilchen3 { pos, r, farbe, deckend, strich, licht });
        }
    }
}
