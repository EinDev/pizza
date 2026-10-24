//! `Fliesen` (2D, H-K10): Kachelkarte wie Unity `Tilemap` + `TilemapCollider2D`. Ein Raster aus `spalten` × `zeilen` Kacheln
//! (je `kachel` Spielfeldpixel), `karte` zeilenweise von oben (0 = leer, zu kurz → Rest leer), Kachel n zeigt `bilder[n]`
//! (1-basiert wie `Animation.nummer`; n größer als die Liste → unsichtbar). Die **Lage des Teils ist die obere linke Ecke** des
//! Rasters (anders als `Rechteck`); Drehung und Größe des Teils wirken aufs ganze Raster.
//!
//! - **Bildbeitrag:** je sichtbarer Kachel eine `BILD`-Instanz (Bildchen auf `kachel` × `kachel` gestreckt, untönt) – nur im
//!   Fenster aus [`Bildbau::sicht_welt`] (H-K1; HUD-Ebenen ab `festAb`: das Spielfeld), ins Raster zurückgerechnet
//!   ([`fenster`]); nie die ganze Karte. Reihenfolge: Zeilen oben → unten, je Zeile links → rechts.
//! - **Physik:** Kacheln, deren Nummer in `fest` steht, sind für `Wucht` feste Rechtecke (Gruppe 1, spüren alle; nur für
//!   dynamische Körper, deren `maske` Gruppe 1 enthält). `wucht.rs` fragt je Körper nur die Kacheln unter seiner Hülle ab
//!   ([`fenster`], [`ist_fest`], [`offene_seiten`]); Seiten zu einer festen Nachbarkachel sind innen und erzeugen keine Kontakte –
//!   so hakt nichts an den Fugen. Keine Lesefelder, kein System; der `Fuehler` sieht Kacheln nicht.
//! - **Hülle** für `trifft`/`Fuehler auto`: das ganze Raster (gedreht umschlossen).
//!
//! Determinismus (K-129): Kachelindex mit `libm::floor`, sonst Ganzzahlarithmetik; nur f64.

use alloc::vec::Vec;

use super::*;
use crate::farbe::WEISS;
use crate::paket::flach_art;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const BILDER: usize = 0;
pub const SPALTEN: usize = 1;
pub const ZEILEN: usize = 2;
pub const KARTE: usize = 3;
pub const KACHEL: usize = 4;
pub const FEST: usize = 5;

/// Größte Zahl Spalten bzw. Zeilen.
pub const MAX_SEITE: f64 = 1024.0;

pub static ART: Art = Art {
    schema: Schema {
        name: "Fliesen",
        genus: Genus::F,
        raum: Raum::Zwei,
        braucht: &[],
        felder: &[
            Feld::bildchen_liste("bilder"),
            Feld::ganz("spalten", 16.0).bereich(1.0, MAX_SEITE),
            Feld::ganz("zeilen", 9.0).bereich(1.0, MAX_SEITE),
            Feld::zahl_liste("karte"),
            Feld::zahl("kachel", 32.0).min(0.0),
            Feld::zahl_liste("fest"),
        ],
    },
    bild: Some(bild),
    huelle: Some(huelle),
    ..Art::LEER
};

/// Kachelnummer eines Karteneintrags (`libm::floor`; nicht endlich oder < 1 → 0 = leer).
#[inline]
pub fn nummer(x: f64) -> u32 {
    let n = libm::floor(x);
    if n >= 1.0 && n <= 4_294_967_295.0 {
        n as u32
    } else {
        0
    }
}

/// Die festen Kachelnummern sortiert (für [`ist_fest`]).
pub fn feste(liste: &[f64]) -> Vec<u32> {
    let mut v: Vec<u32> = liste.iter().map(|&x| nummer(x)).filter(|&n| n != 0).collect();
    v.sort_unstable();
    v.dedup();
    v
}

/// Ist die Kachel (Spalte `c`, Zeile `r`, auch außerhalb) fest? Außerhalb des Rasters oder der Karte → nein.
#[inline]
pub fn ist_fest(karte: &[f64], feste: &[u32], spalten: i64, zeilen: i64, c: i64, r: i64) -> bool {
    if c < 0 || r < 0 || c >= spalten || r >= zeilen {
        return false;
    }
    match karte.get((r * spalten + c) as usize) {
        Some(&x) => {
            let n = nummer(x);
            n != 0 && feste.binary_search(&n).is_ok()
        }
        None => false,
    }
}

/// Spalten- und Zeilenbereich `(c0, c1, r0, r1)` (einschließlich) der Kacheln, die das Weltrechteck `lo`–`hi` berühren
/// können: die vier Ecken über die Inverse der 2D-Welt-Matrix `m` ins Raster, umschlossen, durch `kachel` mit `libm::floor`,
/// auf das Raster begrenzt. `None`, wenn nichts im Raster liegt oder die Matrix entartet ist.
pub fn fenster(m: &[f64; 12], lo: [f64; 2], hi: [f64; 2], kachel: f64, spalten: i64, zeilen: i64) -> Option<(i64, i64, i64, i64)> {
    if !(kachel > 0.0 && kachel.is_finite()) || spalten < 1 || zeilen < 1 {
        return None;
    }
    let det = m[0] * m[3] - m[2] * m[1];
    if det == 0.0 || !det.is_finite() {
        return None;
    }
    let (mut l0, mut l1) = ([f64::INFINITY; 2], [f64::NEG_INFINITY; 2]);
    for p in [[lo[0], lo[1]], [hi[0], lo[1]], [lo[0], hi[1]], [hi[0], hi[1]]] {
        let (dx, dy) = (p[0] - m[4], p[1] - m[5]);
        let q = [(m[3] * dx - m[2] * dy) / det, (m[0] * dy - m[1] * dx) / det];
        for i in 0..2 {
            if q[i] < l0[i] {
                l0[i] = q[i];
            }
            if q[i] > l1[i] {
                l1[i] = q[i];
            }
        }
    }
    if !(l0[0].is_finite() && l0[1].is_finite() && l1[0].is_finite() && l1[1].is_finite()) {
        return None;
    }
    let grenze = |x: f64, n: i64| -> i64 {
        let f = libm::floor(x / kachel);
        if f < -1.0 {
            -1
        } else if f > n as f64 {
            n
        } else {
            f as i64
        }
    };
    let (c0, c1) = (grenze(l0[0], spalten), grenze(l1[0], spalten));
    let (r0, r1) = (grenze(l0[1], zeilen), grenze(l1[1], zeilen));
    if c1 < 0 || r1 < 0 || c0 >= spalten || r0 >= zeilen {
        return None;
    }
    Some((if c0 < 0 { 0 } else { c0 }, if c1 >= spalten { spalten - 1 } else { c1 }, if r0 < 0 { 0 } else { r0 }, if r1 >= zeilen { zeilen - 1 } else { r1 }))
}

/// Seiten einer festen Kachel, die in Weltlage nach oben, unten, links, rechts **offen** sind (dort keine feste Nachbarkachel).
/// Nur für achsenparallele Raster (`m[1] = m[2] = 0`; Spiegelung über negative Größe beachtet); gedrehte Raster: alle offen.
pub fn offene_seiten(m: &[f64; 12], karte: &[f64], feste: &[u32], spalten: i64, zeilen: i64, c: i64, r: i64) -> [bool; 4] {
    if m[1] != 0.0 || m[2] != 0.0 {
        return [true; 4];
    }
    // Weltrichtung → Rasterschritt: y wächst nach unten; bei negativer Größe kehrt sich die Achse um
    let (dy, dx) = (if m[3] > 0.0 { 1 } else { -1 }, if m[0] > 0.0 { 1 } else { -1 });
    let frei = |cc: i64, rr: i64| !ist_fest(karte, feste, spalten, zeilen, cc, rr);
    [frei(c, r - dy), frei(c, r + dy), frei(c - dx, r), frei(c + dx, r)]
}

/// Weltrechteck (min, max) der Kachel (Spalte `c`, Zeile `r`), gedreht umschlossen.
#[inline]
pub fn kachel_huelle(m: &[f64; 12], kachel: f64, c: i64, r: i64) -> Huelle {
    let h = kachel * 0.5;
    rechteck_huelle(m, [c as f64 * kachel + h, r as f64 * kachel + h], [h, h])
}

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    let (bl, sp, ze, ka, ki) = (s.liste(BILDER), s.zahl(SPALTEN), s.zahl(ZEILEN), s.puffer(KARTE), s.zahl(KACHEL));
    let mut uv: Vec<Option<([u16; 4], u32)>> = Vec::new();
    for z in 0..s.len() {
        let Some(tz) = sichtbar(w, s.teil[z]) else { continue };
        let karte = &ka[z];
        if karte.is_empty() || bl[z].is_empty() {
            continue;
        }
        let (spalten, zeilen, k) = (sp[z] as i64, ze[z] as i64, ki[z]);
        let ebene = w.teile.ebene[tz];
        // Fenster: sichtbare Welt (HUD-Ebenen unter einem Blick: das Spielfeld)
        let (lo, hi) = match &b.blick {
            Some(bk) if (ebene as f64) >= bk.fest_ab => ([0.0, 0.0], [b.breite, b.hoehe]),
            _ => b.sicht_welt(),
        };
        let m = w.teile.welt[tz];
        let Some((c0, c1, r0, r1)) = fenster(&m, lo, hi, k, spalten, zeilen) else { continue };
        uv.clear();
        uv.extend(bl[z].iter().map(|&id| {
            w.ressourcen.bildchen(id).map(|bi| ([bi.x as u16, bi.y as u16, (bi.x + bi.breite) as u16, (bi.y + bi.hoehe) as u16], bi.seite))
        }));
        let h = k * 0.5;
        for r in r0..=r1 {
            let start = (r * spalten) as usize;
            if start >= karte.len() {
                break;
            }
            for c in c0..=c1 {
                let Some(&x) = karte.get(start + c as usize) else { break };
                let n = nummer(x) as usize;
                if n == 0 || n > uv.len() {
                    continue;
                }
                let Some((q, seite)) = uv[n - 1] else { continue };
                b.flach(ebene, s.teil[z], &m, [c as f64 * k + h, r as f64 * k + h], [h, h], flach_art::BILD, WEISS, [0.0, 0.0], q, seite);
            }
        }
    }
}

fn huelle(w: &Welt, s: &Speicher, kz: usize, tz: usize) -> Option<Huelle> {
    let k = s.zahl(KACHEL)[kz];
    if !(k > 0.0) {
        return None;
    }
    let (bx, by) = (s.zahl(SPALTEN)[kz] * k * 0.5, s.zahl(ZEILEN)[kz] * k * 0.5);
    Some(rechteck_huelle(&w.teile.welt[tz], [bx, by], [bx, by]))
}
