//! Gemeinsames der UI-Bausteine (H-K12, K-151): Maus im Raum eines Elements, Trefferregel, zentrierter Text.
//!
//! **Trefferregel:** Unter der Maus zählt nur das **oberste** Element – höchste `ebene`, bei Gleichstand höchste Teil-ID (so wie
//! gezeichnet wird: sortiert nach `(ebene, ID)`). Ziele sind sichtbare `Taster` (nur `aktiv: ja`), `Regler` und `Tafel`; `Leiste`
//! ist nur Anzeige. Elemente mit `ebene ≥ festAb` des aktiven `Blick` (HUD) prüfen die Maus in Spielfeld-, alle anderen in
//! Weltkoordinaten (ohne aktiven Blick sind beide gleich). Geprüft wird im lokalen Rechteck des Teils (Umkehrung seiner Welt-Matrix,
//! also auch gedreht und skaliert), Ränder zählen. Alles f64-Grundrechenarten, Reihenfolge nur nach Ebene und ID.
//!
//! **Ablauf je Takt** (Nachlauf, nach allen Takt-Systemen): `Taster` (kleinste Typnummer der UI-Bausteine) macht den
//! [`durchgang`] – Treffer bestimmen, beim Drücken der linken Taste das getroffene Element **fangen**, beim Loslassen freigeben –
//! und schreibt danach seine Lesefelder; `Regler` und `Tafel` lesen im eigenen Nachlauf, was gefangen ist. Der Zustand steht in
//! [`crate::welt::Eingabe`] und nicht im Szenen-Hash; das Programm sieht ihn im nächsten Takt über die Lesefelder.

use super::*;
use crate::paket::flach_art;
use crate::schrift;

/// Mauspunkt passend zur Ebene eines Elements (Spielfeld für HUD, sonst Welt).
#[derive(Clone, Copy, Debug)]
pub struct Mauslage {
    pub feld: [f64; 2],
    pub welt: [f64; 2],
    /// `festAb` des aktiven Blicks; ohne Blick `None`
    pub fest_ab: Option<f64>,
}

impl Mauslage {
    /// Maus im Raum eines Elements der Ebene `ebene`.
    pub fn fuer(&self, ebene: i32) -> [f64; 2] {
        match self.fest_ab {
            Some(f) if (ebene as f64) < f => self.welt,
            _ => self.feld,
        }
    }
}

/// Maus aus dem Eingabezustand unter der Sicht des aktiven Blicks (Welt-Matrizen müssen aktuell sein).
pub fn mauslage(w: &Welt) -> Mauslage {
    let feld = w.eingabe.maus;
    match blick::aktive_sicht(w, w.breite as f64, w.hoehe as f64) {
        Some(s) => Mauslage { feld, welt: blick::welt_punkt(&s.m, feld), fest_ab: Some(s.fest_ab) },
        None => Mauslage { feld, welt: feld, fest_ab: None },
    }
}

/// Punkt `p` (Raum der Welt-Matrix) im lokalen Raum der 2D-Matrix `m`; `None` bei entarteter Matrix (Größe 0).
pub fn lokal(m: &[f64; 12], p: [f64; 2]) -> Option<[f64; 2]> {
    let det = m[0] * m[3] - m[2] * m[1];
    if !(det != 0.0 && det.is_finite()) {
        return None;
    }
    let (dx, dy) = (p[0] - m[4], p[1] - m[5]);
    Some([(m[3] * dx - m[2] * dy) / det, (m[0] * dy - m[1] * dx) / det])
}

/// Liegt `p` im lokalen Rechteck (Mitte 0, halbe Ausdehnung `h`) unter `m`?
pub fn im_rechteck(m: &[f64; 12], p: [f64; 2], h: [f64; 2]) -> bool {
    match lokal(m, p) {
        Some(l) => betrag(l[0]) <= h[0] && betrag(l[1]) <= h[1],
        None => false,
    }
}

fn art_von(w: &Welt, art: &'static Art) -> Option<usize> {
    w.arten.iter().position(|x| core::ptr::eq(*x, art))
}

/// Oberstes Ziel unter der Maus: (Teil, Ebene), `None` = keines. `taster` ist der Speicher der Taster (im eigenen Nachlauf aus
/// der Welt genommen).
pub fn treffer(w: &Welt, taster: &Speicher, ml: &Mauslage) -> Option<(u32, i32)> {
    let mut best: Option<(u32, i32)> = None;
    let mut pruefe = |w: &Welt, teil: u32, h: [f64; 2]| {
        let Some(tz) = sichtbar(w, teil) else { return };
        let ebene = w.teile.ebene[tz];
        if !im_rechteck(&w.teile.welt[tz], ml.fuer(ebene), h) {
            return;
        }
        let besser = match best {
            None => true,
            Some((bt, be)) => ebene > be || (ebene == be && teil > bt),
        };
        if besser {
            best = Some((teil, ebene));
        }
    };
    let (br, ho, ak) = (taster.zahl(taster::BREITE), taster.zahl(taster::HOEHE), taster.zahl(taster::AKTIV));
    for z in 0..taster.len() {
        if ak[z] != 0.0 {
            pruefe(w, taster.teil[z], [br[z] * 0.5, ho[z] * 0.5]);
        }
    }
    if let Some(a) = art_von(w, &regler::ART) {
        let s = &w.speicher[a];
        let br = s.zahl(regler::BREITE);
        for z in 0..s.len() {
            pruefe(w, s.teil[z], regler::trefferflaeche(br[z]));
        }
    }
    if let Some(a) = art_von(w, &tafel::ART) {
        let s = &w.speicher[a];
        let (br, ho) = (s.zahl(tafel::BREITE), s.zahl(tafel::HOEHE));
        for z in 0..s.len() {
            pruefe(w, s.teil[z], [br[z] * 0.5, ho[z] * 0.5]);
        }
    }
    best
}

/// Der gemeinsame Schritt je Takt (aus dem Nachlauf von `Taster`): Treffer, Fangen beim Drücken, Freigeben beim Loslassen.
pub fn durchgang(w: &mut Welt, taster: &Speicher) {
    // ohne UI-Bausteine keine Trefferprüfung (kostet in Szenen ohne UI dann nichts)
    let anzahl = |w: &Welt, art: &'static Art| art_von(w, art).map(|a| w.speicher[a].len()).unwrap_or(0);
    let t = if taster.is_empty() && anzahl(w, &regler::ART) == 0 && anzahl(w, &tafel::ART) == 0 {
        None
    } else {
        w.aktualisiere_alle();
        let ml = mauslage(w);
        treffer(w, taster, &ml).map(|(teil, ebene)| (teil, ml.fuer(ebene)))
    };
    let e = &mut w.eingabe;
    e.treffer = t.map(|x| x.0).unwrap_or(0);
    e.los = 0;
    if e.gedrueckt() {
        e.gefangen = e.treffer;
        if let Some((_, griff)) = t {
            e.griff = griff;
        }
    } else if e.knoepfe & 1 == 0 && e.gefangen != 0 {
        e.los = e.gefangen;
        e.gefangen = 0;
    }
}

/// Farbe mit halber Deckkraft (inaktiver Taster).
pub fn halb(f: u32) -> u32 {
    (f & !0xFF) | ((f & 0xFF) / 2)
}

/// Rundung höchstens so groß wie die halbe kürzere Seite.
pub fn rundung(r: f64, h: [f64; 2]) -> f64 {
    let k = if h[0] < h[1] { h[0] } else { h[1] };
    if r > k {
        k
    } else {
        r
    }
}

/// Text (auch mehrzeilig) mit Ausrichtung `ausrichtung` (0 links · 1 mitte · 2 rechts) am Punkt `p`, **senkrecht mittig** um
/// `p[1]` (Zeilenkasten aus Auf- und Abstieg der Schrift, nicht der Glyphen – der Text springt nicht je nach Buchstaben).
#[allow(clippy::too_many_arguments)]
pub fn text_mittig(b: &mut Bildbau, ebene: i32, teil: u32, m: &[f64; 12], text: &str, groesse: f64, farbe: u32, p: [f64; 2], ausrichtung: u8) {
    let Some(sch) = b.schrift else { return };
    if text.is_empty() || !(groesse > 0.0) {
        return;
    }
    let zeilen = text.split('\n').count() as f64;
    let kasten = (sch.aufstieg - sch.abstieg) as f64 + (zeilen - 1.0) * sch.zeilenhoehe() as f64;
    let oben = p[1] - kasten * groesse * 0.5;
    schrift::setze(&sch, text, groesse as f32, ausrichtung, |st| {
        let c = [p[0] + ((st.x0 + st.x1) * 0.5) as f64, oben + ((st.y0 + st.y1) * 0.5) as f64];
        let h = [((st.x1 - st.x0) * 0.5) as f64, ((st.y1 - st.y0) * 0.5) as f64];
        b.flach(ebene, teil, m, c, h, flach_art::GLYPHE, farbe, [0.0, 0.0], st.px, 0);
    });
}
