//! `Wind` (3D, H-K27): Wind wie Unitys WindZone (Richtung, Stärke, Böen). Hängt an irgendeinem 3D-Teil; es gilt der **wache**
//! mit der kleinsten Teil-ID (wie `Stimmung`). Kein System, keine Hülle, rein sichtbar: Ecken von Körpern, deren `Belag` ein
//! `wiegen` > 0 hat (auch `Streu`-Instanzen), schwingen im Vertex-Shader – Kollision, Hüllen und `trifft` bleiben unverändert.
//! Bildbeitrag: Abschnitt `WIND` (32 Bytes Uniform-Block, `herd/README.md` §4) – nur wenn einer gilt; ohne bleibt das Paket
//! byte-gleich. Zeit aus der Bildnummer (Phase und Böen-Versatz rechnet der Kern in f64 und schreibt sie im Bereich klein).

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema};

pub const STAERKE: usize = 0;
pub const RICHTUNG_X: usize = 1;
pub const RICHTUNG_Z: usize = 2;
pub const BOEEN: usize = 3;
pub const TEMPO: usize = 4;

pub static ART: Art = Art {
    schema: Schema {
        name: "Wind",
        genus: Genus::M,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::zahl("staerke", 0.0).bereich(0.0, 5.0),
            Feld::zahl("richtungX", 1.0),
            Feld::zahl("richtungZ", 0.0),
            Feld::zahl("boeen", 0.3).bereich(0.0, 1.0),
            Feld::zahl("tempo", 1.0).bereich(0.0, 10.0),
        ],
    },
    ..Art::LEER
};

/// Uniform-Block `WIND` (32 Bytes, f32): `a` (Richtung x, z normiert, staerke, 1 = an) · `b` (boeen, Phase der Welle in
/// Bogenmaß 0 … 2π, Böen-Versatz in Rauschzellen 0 … 256, tempo).
pub const WIND_BYTES: usize = 32;
/// Grundfrequenz der Welle (Schwingungen je Sekunde bei `tempo` 1) und Wandergeschwindigkeit der Böen (Rauschzellen je Sekunde)
const WELLE_HZ: f64 = 0.5;
const BOEN_ZELLEN: f64 = 0.35;

/// Der geltende Wind: (Artindex, Zeile) des wachen mit der kleinsten Teil-ID.
fn geltender(w: &Welt) -> Option<(usize, usize)> {
    let a = w.art_index(ART.schema.name)?;
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
    beste.map(|z| (a, z))
}

/// Gilt ein Wind?
pub fn an(w: &Welt) -> bool {
    geltender(w).is_some()
}

/// Richtung (x, z, ungenormt) des geltenden Winds – für die Wellen von `Wasser` (H-K28).
pub fn richtung(w: &Welt) -> Option<(f64, f64)> {
    let (a, z) = geltender(w)?;
    let s = &w.speicher[a];
    Some((s.zahl(RICHTUNG_X)[z], s.zahl(RICHTUNG_Z)[z]))
}

/// Schreibt den Abschnitt `WIND` des geltenden Winds; liefert die Zahl der Abschnitte (0/1).
pub fn abschnitt(w: &Welt, aus: &mut alloc::vec::Vec<u8>, bildnummer: u32) -> u32 {
    let Some((a, z)) = geltender(w) else { return 0 };
    let s = &w.speicher[a];
    let n = |f: usize| s.zahl(f)[z];
    let (rx, rz) = (n(RICHTUNG_X), n(RICHTUNG_Z));
    let l = libm::sqrt(rx * rx + rz * rz);
    let (dx, dz) = if l > 1e-9 && l.is_finite() { (rx / l, rz / l) } else { (1.0, 0.0) };
    let t = bildnummer as f64 / 60.0 * n(TEMPO);
    let welle = t * WELLE_HZ;
    let phase = (welle - libm::floor(welle)) * 2.0 * core::f64::consts::PI;
    let boe = t * BOEN_ZELLEN / 256.0;
    let versatz = (boe - libm::floor(boe)) * 256.0;
    use crate::paket::{abschnitt_beginn, abschnitt_ende, put_v4};
    let st = abschnitt_beginn(aus, crate::paket::abschnitt::WIND);
    put_v4(aus, [dx, dz, n(STAERKE), 1.0]);
    put_v4(aus, [n(BOEEN), phase, versatz, n(TEMPO)]);
    debug_assert_eq!(aus.len() - st, WIND_BYTES);
    abschnitt_ende(aus, st);
    1
}
