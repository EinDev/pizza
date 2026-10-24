//! `Partikel` (2D): Emitter an der Weltlage des Teils. Teilchen leben im Kern (Spielfeld-Koordinaten, eigener
//! deterministischer Zufall mulberry32), höchstens 10 000 je Emitter; gezeichnet als Kreise in der Ebene des Teils.

use alloc::vec::Vec;

use super::*;
use crate::paket::flach_art;
use crate::schema::{Genus, Feld, Raum, Schema};
use crate::welt::GRAD;

pub const RATE: usize = 0;
pub const LEBENSDAUER: usize = 1;
pub const TEMPO: usize = 2;
pub const RICHTUNG: usize = 3;
pub const STREUUNG: usize = 4;
pub const SCHWERKRAFT: usize = 5;
pub const GROESSE: usize = 6;
pub const GROESSE_ENDE: usize = 7;
pub const FARBE: usize = 8;
pub const FARBE_ENDE: usize = 9;
pub const AKTIV: usize = 10;
pub const SAAT: usize = 11;
/// verborgen: Zufallszustand (0 = noch nicht gesät)
pub const ZUFALL: usize = 12;
/// verborgen: angesammelte Ausstoß-Bruchteile
pub const REST: usize = 13;
/// verborgen: Teilchen je 6 Zahlen (x, y, vx, vy, alter, leben)
pub const TEILCHEN: usize = 14;

pub const MAX_TEILCHEN: usize = 10_000;
const T: usize = 6;

pub static ART: Art = Art {
    schema: Schema {
        name: "Partikel", genus: Genus::N,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::zahl("rate", 30.0).bereich(0.0, 100_000.0),
            Feld::zahl("lebensdauer", 1.0).min(0.0),
            Feld::zahl("tempo", 80.0),
            Feld::zahl("richtung", 270.0),
            Feld::zahl("streuung", 360.0).bereich(0.0, 360.0),
            Feld::zahl("schwerkraft", 0.0),
            Feld::zahl("groesse", 6.0).min(0.0),
            Feld::zahl("groesseEnde", 0.0).min(0.0),
            Feld::farbe("farbe", "senf"),
            Feld::farbe("farbeEnde", "tomate"),
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

/// mulberry32: Zustand → (neuer Zustand, Zahl in [0, 1)).
pub(crate) fn zufall(z: &mut u32) -> f64 {
    *z = z.wrapping_add(0x6D2B79F5);
    let mut t = *z;
    t = (t ^ (t >> 15)).wrapping_mul(t | 1);
    t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
    ((t ^ (t >> 14)) as f64) / 4_294_967_296.0
}

fn takt(w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    let mut puffer = core::mem::replace(&mut s.spalten[TEILCHEN], crate::schema::Spalte::Puffer(Vec::new()));
    let crate::schema::Spalte::Puffer(teilchen) = &mut puffer else { return };
    for z in 0..n {
        let teil = s.teil[z];
        // ruhendes Teil (H-K8): Teilchen frieren ein, kein Ausstoß
        if ruht(w, teil) {
            continue;
        }
        let liste: &mut Vec<f64> = &mut teilchen[z];
        // Leben: altern, bewegen, Tote entfernen (Reihenfolge bleibt)
        let g = s.zahl(SCHWERKRAFT)[z];
        let mut j = 0;
        let mut i = 0;
        while i + T <= liste.len() {
            let mut p = [liste[i], liste[i + 1], liste[i + 2], liste[i + 3], liste[i + 4], liste[i + 5]];
            p[4] += DT;
            if p[4] < p[5] {
                p[3] += g * DT;
                p[0] += p[2] * DT;
                p[1] += p[3] * DT;
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
        let (ex, ey) = (w.teile.welt[r][4], w.teile.welt[r][5]);
        let rest = s.zahl(REST)[z] + s.zahl(RATE)[z] * DT;
        let anzahl = libm::floor(rest);
        s.zahl_mut(REST)[z] = rest - anzahl;
        let leben = s.zahl(LEBENSDAUER)[z];
        if anzahl < 1.0 || !(leben > 0.0) {
            continue;
        }
        let mut zs = s.zahl(ZUFALL)[z] as u32;
        if s.zahl(ZUFALL)[z] == 0.0 {
            let saat = s.zahl(SAAT)[z] as u32;
            zs = if saat != 0 { saat } else { teil };
        }
        let (tempo, richtung, streuung) = (s.zahl(TEMPO)[z], s.zahl(RICHTUNG)[z], s.zahl(STREUUNG)[z]);
        let mut k = 0.0;
        while k < anzahl && liste.len() / T < MAX_TEILCHEN {
            let wkl = (richtung + (zufall(&mut zs) - 0.5) * streuung) * GRAD;
            let v = tempo * (0.75 + 0.5 * zufall(&mut zs));
            liste.extend_from_slice(&[ex, ey, libm::cos(wkl) * v, libm::sin(wkl) * v, 0.0, leben]);
            k += 1.0;
        }
        s.zahl_mut(ZUFALL)[z] = if zs == 0 { 1.0 } else { zs as f64 };
    }
    s.spalten[TEILCHEN] = puffer;
}

pub(crate) fn mische(a: u32, b: u32, t: f64) -> u32 {
    let (x, y) = (a.to_be_bytes(), b.to_be_bytes());
    let mut r = [0u8; 4];
    for i in 0..4 {
        let v = x[i] as f64 + (y[i] as f64 - x[i] as f64) * t;
        r[i] = libm::floor(v + 0.5) as u8;
    }
    u32::from_be_bytes(r)
}

const EINS: [f64; 12] = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];

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
        let ebene = w.teile.ebene[tz];
        for p in liste.chunks_exact(T) {
            let t = if p[5] > 0.0 { p[4] / p[5] } else { 1.0 };
            let r = (g0 + (g1 - g0) * t) * 0.5;
            if !(r > 0.0) {
                continue;
            }
            let mut m = EINS;
            m[4] = p[0];
            m[5] = p[1];
            b.flach(ebene, s.teil[z], &m, [0.0, 0.0], [r, r], flach_art::KREIS, mische(f0, f1, t), [0.0, 0.0], [0; 4], 0);
        }
    }
}
