//! `Funken` (3D): Teilchen-Emitter im Raum (Unity: Particle System, kamerazugewandte Teilchen). Teilchen leben im Kern
//! (f64, eigener deterministischer Zufall wie `Partikel`, eigene Saat-Mischung), höchstens 10 000 je Emitter. Ausstoß in
//! einem Kegel um `richtung` (in den Achsen des Teils), Schwerkraft nach −y. Bildbeitrag: Teilchen für den Abschnitt
//! `TEILCHEN3D` (leuchtend = additiv, deckend = gemischt, vom Kern von hinten nach vorn sortiert).

use alloc::vec::Vec;

use super::partikel::{mische, zufall};
use super::*;
use crate::paket::Teilchen3;
use crate::schema::{Feld, Genus, Raum, Schema, Spalte};
use crate::welt::{punkt_3d, GRAD};

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
/// verborgen: Zufallszustand (0 = noch nicht gesät)
pub const ZUFALL: usize = 16;
/// verborgen: angesammelte Ausstoß-Bruchteile
pub const REST: usize = 17;
/// verborgen: Teilchen je 8 Zahlen (x, y, z, vx, vy, vz, alter, leben) – in Weltlage (`weltlage` ja) bzw. im Raum des Teils
pub const TEILCHEN: usize = 18;

pub const MAX_TEILCHEN: usize = 10_000;
const T: usize = 8;
/// Saat-Mischung: Funken und Partikel am selben Teil (gleiche Saat) ziehen verschiedene Folgen.
const SAAT_MISCHUNG: u32 = 0x9E37_79B9;

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

fn takt(w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    let mut puffer = core::mem::replace(&mut s.spalten[TEILCHEN], Spalte::Puffer(Vec::new()));
    let Spalte::Puffer(teilchen) = &mut puffer else { return };
    for z in 0..n {
        let teil = s.teil[z];
        let liste: &mut Vec<f64> = &mut teilchen[z];
        // Leben: altern, fallen, bewegen, Tote entfernen (Reihenfolge bleibt)
        let g = s.zahl(SCHWERKRAFT)[z];
        let mut j = 0;
        let mut i = 0;
        while i + T <= liste.len() {
            let mut p = [0.0; T];
            p.copy_from_slice(&liste[i..i + T]);
            p[6] += DT;
            if p[6] < p[7] {
                p[4] -= g * DT;
                p[0] += p[3] * DT;
                p[1] += p[4] * DT;
                p[2] += p[5] * DT;
                liste[j..j + T].copy_from_slice(&p);
                j += T;
            }
            i += T;
        }
        liste.truncate(j);
        // Ausstoß
        if teil == 0 || s.zahl(AKTIV)[z] == 0.0 {
            continue;
        }
        let Some(r) = w.zeile_opt(teil) else { continue };
        w.aktualisiere(r);
        if !w.teile.welt_sichtbar[r] {
            continue;
        }
        let rest = s.zahl(REST)[z] + s.zahl(RATE)[z] * DT;
        let anzahl = libm::floor(rest);
        s.zahl_mut(REST)[z] = rest - anzahl;
        let leben = s.zahl(LEBENSDAUER)[z];
        if anzahl < 1.0 || !(leben > 0.0) {
            continue;
        }
        let m = w.teile.welt[r];
        let weltlage = s.zahl(WELTLAGE)[z] != 0.0;
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
        let mut zs = s.zahl(ZUFALL)[z] as u32;
        if s.zahl(ZUFALL)[z] == 0.0 {
            let saat = s.zahl(SAAT)[z] as u32;
            zs = (if saat != 0 { saat } else { teil }) ^ SAAT_MISCHUNG;
        }
        let (tempo, streuung) = (s.zahl(TEMPO)[z], s.zahl(STREUUNG)[z]);
        let mut k = 0.0;
        while k < anzahl && liste.len() / T < MAX_TEILCHEN {
            let d = kegel(achse, streuung, &mut zs);
            let v = tempo * (0.75 + 0.5 * zufall(&mut zs));
            let (vx, vy, vz) = (d[0] * v, d[1] * v, d[2] * v);
            // Vorlauf innerhalb des Takts: gleichmäßiger Strahl statt Ringe je Takt
            let vor = zufall(&mut zs) * DT;
            liste.extend_from_slice(&[ursprung[0] + vx * vor, ursprung[1] + vy * vor, ursprung[2] + vz * vor, vx, vy, vz, vor, leben]);
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
        let m = &w.teile.welt[tz];
        for p in liste.chunks_exact(T) {
            let t = if p[7] > 0.0 { p[6] / p[7] } else { 1.0 };
            let r = (g0 + (g1 - g0) * t) * 0.5;
            if !(r > 0.0) {
                continue;
            }
            let farbe = mische(f0, f1, t);
            if farbe & 0xFF == 0 {
                continue;
            }
            let pos = if weltlage { [p[0], p[1], p[2]] } else { punkt_3d(m, [p[0], p[1], p[2]]) };
            b.teilchen3d.push(Teilchen3 { pos, r, farbe, deckend });
        }
    }
}
