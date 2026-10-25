//! `Stimmung` (3D): Bildlook wie Unitys Post-Processing-Volume – HDR mit Belichtung und filmischer Tonkurve (ACES), Bloom
//! (Leuchten über der Schwelle strahlt weich aus), exponentieller **Höhennebel**, Sättigung, Vignette, Filmkorn. Hängt an
//! irgendeinem 3D-Teil; es gilt die **wache** mit der kleinsten Teil-ID (wie `Himmelszelt`). Kein System, keine Hülle.
//! Bildbeitrag: Abschnitt `STIMMUNG` (fester 64-Byte-Uniform-Block, `herd/README.md` §4) – nur wenn eine gilt; ohne bleibt
//! das Paket byte-gleich und die Glut zeichnet wie v1 direkt ins Ziel. Mit Stimmung zeichnet die Glut die 3D-Szene linear in
//! ein HDR-Ziel, rechnet Bloom und bildet erst im Abschluss auf den Bildschirm ab (2D liegt danach unverändert darüber).
//! Leuchten über 1 (für Bloom): Nachtragsfeld `strahlen` an `Koerper`/`Belag` (Faktor auf `leuchten`).
//! Spiegelung (`spiegelung` > 0): die Glut zeichnet die Szene an der Ebene y = `spiegelHoehe` gespiegelt in ein halb so großes
//! Bild; nasse, glatte, nach oben zeigende pbr-Flächen auf dieser Höhe spiegeln daraus (Pfützen, nasser Asphalt).

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const BELICHTUNG: usize = 0;
pub const BLOOM: usize = 1;
pub const BLOOM_SCHWELLE: usize = 2;
pub const BLOOM_WEITE: usize = 3;
pub const NEBEL_DICHTE: usize = 4;
pub const NEBEL_HOEHE: usize = 5;
pub const NEBEL_ABFALL: usize = 6;
pub const NEBEL_FARBE: usize = 7;
pub const SAETTIGUNG: usize = 8;
pub const VIGNETTE: usize = 9;
pub const KOERNUNG: usize = 10;
/// Spiegelung (planar): Stärke 0 … 1 (0 = aus) und Höhe der Spiegelebene (y)
pub const SPIEGELUNG: usize = 11;
pub const SPIEGEL_HOEHE: usize = 12;

pub static ART: Art = Art {
    schema: Schema {
        name: "Stimmung",
        genus: Genus::F,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::zahl("belichtung", 1.0).bereich(0.01, 100.0),
            Feld::zahl("bloom", 0.0).bereich(0.0, 4.0),
            Feld::zahl("bloomSchwelle", 1.0).bereich(0.0, 100.0),
            Feld::zahl("bloomWeite", 0.7).bereich(0.0, 1.0),
            Feld::zahl("nebelDichte", 0.0).bereich(0.0, 10.0),
            Feld::zahl("nebelHoehe", 0.0),
            Feld::zahl("nebelAbfall", 0.25).bereich(0.0, 10.0),
            Feld::farbe("nebelFarbe", "#1c1a2a"),
            Feld::zahl("saettigung", 1.0).bereich(0.0, 2.0),
            Feld::zahl("vignette", 0.0).bereich(0.0, 1.0),
            Feld::zahl("koernung", 0.0).bereich(0.0, 1.0),
            Feld::zahl("spiegelung", 0.0).bereich(0.0, 1.0),
            Feld::zahl("spiegelHoehe", 0.0),
        ],
    },
    ..Art::LEER
};

/// Uniform-Block `STIMMUNG` (80 Bytes, f32): `a` (belichtung, bloom, bloomSchwelle, bloomWeite) · `nebel` (dichte, hoehe,
/// abfall, fern der Kamera) · `farbe` (nebelFarbe linear, saettigung) · `b` (vignette, koernung, Zeit in s, 1 = an) ·
/// `spiegel` (spiegelung, spiegelHoehe, 0, 0).
pub const STIMMUNG_BYTES: usize = 80;

/// Schreibt den Abschnitt `STIMMUNG` der geltenden Stimmung (wach, kleinste Teil-ID); liefert die Zahl der Abschnitte (0/1).
pub fn abschnitt(w: &Welt, aus: &mut alloc::vec::Vec<u8>, bildnummer: u32, fern: f64) -> u32 {
    let Some(a) = w.art_index(ART.schema.name) else { return 0 };
    let s = &w.speicher[a];
    let mut beste: Option<usize> = None;
    for z in 0..s.len() {
        if wach(w, s.teil[z]).is_none() {
            continue;
        }
        if beste.map(|k| s.teil[z] < s.teil[k]).unwrap_or(true) {
            beste = Some(z);
        }
    }
    let Some(z) = beste else { return 0 };
    use crate::paket::{abschnitt_beginn, abschnitt_ende, lin4, put_v4};
    let st = abschnitt_beginn(aus, crate::paket::abschnitt::STIMMUNG);
    let n = |f: usize| s.zahl(f)[z];
    put_v4(aus, [n(BELICHTUNG), n(BLOOM), n(BLOOM_SCHWELLE), n(BLOOM_WEITE)]);
    put_v4(aus, [n(NEBEL_DICHTE), n(NEBEL_HOEHE), n(NEBEL_ABFALL), fern]);
    let f = lin4(s.farbe(NEBEL_FARBE)[z], 1.0);
    put_v4(aus, [f[0], f[1], f[2], n(SAETTIGUNG)]);
    put_v4(aus, [n(VIGNETTE), n(KOERNUNG), bildnummer as f64 / 60.0, 1.0]);
    put_v4(aus, [n(SPIEGELUNG), n(SPIEGEL_HOEHE), 0.0, 0.0]);
    debug_assert_eq!(aus.len() - st, STIMMUNG_BYTES);
    abschnitt_ende(aus, st);
    1
}
