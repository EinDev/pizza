//! `Gelaende` (3D, H-K11a): Gelände aus einer Höhenkarte (Unity Terrain). `hoehen` = `spalten · zeilen` Werte zeilenweise
//! (fehlende = 0, überzählige ohne Wirkung), Punktabstand `weite`, um den Ursprung des Teils: Spalte `i` liegt bei
//! x = (i − (spalten − 1)/2) · weite, Zeile `j` bei z = (j − (zeilen − 1)/2) · weite (Zeile 0 hinten bei −z), Höhe = y.
//! Das Takt-System baut bei geänderten Netz-Feldern (`hoehen`, `spalten`, `zeilen`, `weite`) ein neues Netz mit glatten Normalen
//! (`formen::netz_glatt`) als neue Form-Ressource (v1 gibt Ressourcen nie frei – also nicht je Takt umformen); gezeichnet wird es
//! wie ein `Koerper` (FEST-Zug, Schatten), einfarbig plus Textur über die ganze Fläche (UV 0 … 1). Kein Bildpaket-Umbau.
//! Änderung = anderer Prüfwert (FNV-1a je 64-Bit-Wort über Länge, Höhen mit kanonischem NaN, Seiten und Weite) – gleiche Werte
//! erneut setzen baut nicht neu; eine Kopie teilt das Netz, bis sich ihre Werte ändern.

use alloc::vec::Vec;

use super::*;
use crate::formen;
use crate::hash::{PRIM, START};
use crate::mathe::fin;
use crate::paket::{f32w, Koerper3};
use crate::schema::{Feld, Genus, Raum, Schema};
use crate::welt::kasten_3d;

pub const HOEHEN: usize = 0;
pub const SPALTEN: usize = 1;
pub const ZEILEN: usize = 2;
pub const WEITE: usize = 3;
pub const FARBE: usize = 4;
pub const GLANZ: usize = 5;
pub const BILD: usize = 6;
pub const SCHATTEN: usize = 7;
/// verborgen: Ressourcen-ID des gebauten Netzes (0 = noch keins)
pub const NETZ: usize = 8;
/// verborgen: Prüfwert der Netz-Felder beim letzten Bau, untere und obere 32 Bit (exakte Ganzzahlen)
pub const PRUEF_LO: usize = 9;
pub const PRUEF_HI: usize = 10;

pub static ART: Art = Art {
    schema: Schema {
        name: "Gelaende",
        genus: Genus::N,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::zahl_liste("hoehen"),
            Feld::ganz("spalten", 32.0).bereich(2.0, 256.0),
            Feld::ganz("zeilen", 32.0).bereich(2.0, 256.0),
            Feld::zahl("weite", 1.0).min(0.001),
            Feld::farbe("farbe", "basilikum"),
            Feld::zahl("glanz", 0.1).bereich(0.0, 1.0),
            Feld::bildchen("bild"),
            Feld::diavolo("schatten", true),
            Feld::intern("netz", 0.0),
            Feld::intern("pruefLo", 0.0),
            Feld::intern("pruefHi", 0.0),
        ],
    },
    takt: Some(takt),
    bild: Some(bild),
    huelle: Some(huelle),
    ..Art::LEER
};

/// Prüfwert der Netz-Felder (FNV-1a je 64-Bit-Wort; jede einzelne geänderte Höhe ändert ihn sicher).
pub fn pruefwert(hoehen: &[f64], spalten: f64, zeilen: f64, weite: f64) -> u64 {
    let mut h = START;
    let mut mische = |x: u64| {
        h ^= x;
        h = h.wrapping_mul(PRIM);
    };
    mische(hoehen.len() as u64);
    mische(spalten.to_bits());
    mische(zeilen.to_bits());
    mische(weite.to_bits());
    for x in hoehen {
        mische(if x.is_nan() { 0x7FF8_0000_0000_0000 } else { x.to_bits() });
    }
    h
}

/// Netz des Geländes: `spalten × zeilen` Punkte (fehlende Höhen = 0, nicht endliche = 0), je Zelle zwei Dreiecke mit fester
/// Diagonale, Vorderseite nach oben, UV (i/(spalten − 1), j/(zeilen − 1)), glatte Normalen. Lage in f64, dann f32 (`f32w`).
pub fn netz(hoehen: &[f64], spalten: u32, zeilen: u32, weite: f64) -> formen::Netz {
    let (sp, ze) = (spalten as usize, zeilen as usize);
    let n = sp * ze;
    let mut punkte = Vec::with_capacity(n * 3);
    let mut uv = Vec::with_capacity(n * 2);
    let (mx, mz) = ((spalten - 1) as f64 / 2.0, (zeilen - 1) as f64 / 2.0);
    let (du, dv) = ((spalten - 1) as f32, (zeilen - 1) as f32);
    for j in 0..ze {
        for i in 0..sp {
            let k = j * sp + i;
            let y = if k < hoehen.len() { hoehen[k] } else { 0.0 };
            punkte.push(fin(f32w((i as f64 - mx) * weite)));
            punkte.push(fin(f32w(y)));
            punkte.push(fin(f32w((j as f64 - mz) * weite)));
            uv.push(i as f32 / du);
            uv.push(j as f32 / dv);
        }
    }
    let mut dreiecke = Vec::with_capacity((sp - 1) * (ze - 1) * 6);
    for j in 0..ze - 1 {
        for i in 0..sp - 1 {
            let d = (j * sp + i) as u32; // hinten links
            let c = d + 1; // hinten rechts
            let a = d + sp as u32; // vorn links
            let b = a + 1; // vorn rechts
            dreiecke.extend_from_slice(&[a, b, c, a, c, d]);
        }
    }
    formen::netz_glatt(&punkte, &uv, &dreiecke)
}

/// System: baut das Netz neu, wenn sich die Netz-Felder seit dem letzten Bau geändert haben (oder noch keins da ist).
/// Baut das Netz bei geänderten Feldern. Läuft bewusst auch in ruhenden Teilen (H-K8 `Vorlage`): reiner Cache der eigenen
/// Felder – Kopien einer Vorlage erben Netz und Prüfwert und teilen sich so **eine** Ressource, statt je Kopie eine neue anzulegen.
fn takt(w: &mut Welt, s: &mut Speicher) {
    for z in 0..s.len() {
        if s.teil[z] == 0 {
            continue;
        }
        let (sp, ze, we) = (s.zahl(SPALTEN)[z], s.zahl(ZEILEN)[z], s.zahl(WEITE)[z]);
        let p = pruefwert(&s.puffer(HOEHEN)[z], sp, ze, we);
        let (lo, hi) = ((p & 0xFFFF_FFFF) as f64, (p >> 32) as f64);
        if s.zahl(NETZ)[z] != 0.0 && s.zahl(PRUEF_LO)[z] == lo && s.zahl(PRUEF_HI)[z] == hi {
            continue;
        }
        let n = netz(&s.puffer(HOEHEN)[z], sp as u32, ze as u32, we);
        let id = w.ressourcen.form(n);
        s.zahl_mut(NETZ)[z] = id as f64;
        s.zahl_mut(PRUEF_LO)[z] = lo;
        s.zahl_mut(PRUEF_HI)[z] = hi;
    }
}

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (ne, fa, gl, bi, sc) = (s.zahl(NETZ), s.farbe(FARBE), s.zahl(GLANZ), s.zahl(BILD), s.zahl(SCHATTEN));
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let Some(netz) = w.ressourcen.netz(ne[z] as u32) else { continue };
        if netz.index_anzahl == 0 || fa[z] & 0xFF == 0 {
            continue;
        }
        let m = w.teile.welt[tz];
        let (min, max) = kasten_3d(&m, [netz.min.x as f64, netz.min.y as f64, netz.min.z as f64], [netz.max.x as f64, netz.max.y as f64, netz.max.z as f64]);
        // Textur wie `Koerper.bild`: Atlas-Ausschnitt oder eigene Textur (Teigling, `seite` mit TEXTUR_MARKE)
        let (uv, seite) = match w.ressourcen.bildchen(bi[z] as u32) {
            Some(t) => ([t.x as u16, t.y as u16, (t.x + t.breite) as u16, (t.y + t.hoehe) as u16], t.seite as i64),
            None => ([0; 4], -1),
        };
        b.koerper.push(Koerper3 {
            teil: s.teil[z],
            netz: ne[z] as u32,
            m,
            farbe: fa[z],
            glanz: gl[z],
            leuchten: 0.0,
            uv,
            seite,
            wirft: sc[z] != 0.0,
            min,
            max,
        });
    }
}

/// Hülle: Kasten um das gebaute Netz in Weltlage (vor dem ersten Takt keine).
fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    let netz = w.ressourcen.netz(s.zahl(NETZ)[kz] as u32)?;
    let (a, b) = kasten_3d(&w.teile.welt[tz], [netz.min.x as f64, netz.min.y as f64, netz.min.z as f64], [netz.max.x as f64, netz.max.y as f64, netz.max.z as f64]);
    Some(Huelle::Kasten(a, b))
}
