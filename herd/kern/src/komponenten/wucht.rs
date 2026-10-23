//! `Wucht` (2D, H-K7): Physik wie Unity `Rigidbody2D` + `Collider2D` – Schwerkraft, Stöße, Abprall, Reibung, Stapeln. Die Form
//! kommt vom `Fuehler` am selben Teil (`braucht`); Kontakte gibt es nur zwischen Fühlern mit `ausloeser: nein`. Ein solcher Fühler
//! **ohne** `Wucht` ist ein fester Körper (Wand, Boden, Schüssel).
//!
//! Je Takt (Takt-System, nach `Bewegung`, `Gleiten`, `Ablauf`; vor dem Fühler-Nachlauf):
//! 1. **Kräfte** (semi-implizites Euler, je Wucht-Zeile): `dynamisch` – tempo += stoss / masse, tempoY += schwerkraft · dt,
//!    tempo ·= (1 − daempfung)^dt; `kinematisch` – tempo bleibt. `stoss` wird danach 0; `fest` bewegt sich nie.
//! 2. **Kontakte** an der Lage zu Beginn des Takts: feste Fühler sammeln ([`fuehler::sammle_wenn`], Formen in Weltlage
//!    achsenparallel), Breitphase [`fuehler::breitphase`] (Masken beidseitig, Paare nach (kleinere ID, größere ID)), je Paar mit
//!    mindestens einem dynamischen Körper Normale und Tiefe ([`kontakt`]: Kreis–Kreis, Kreis–Rechteck, Rechteck–Rechteck).
//! 3. **Lösen** ([`loese`]): Warmstart mit den Impulsen desselben Paars aus dem letzten Takt (verborgene Spalte `kontakte`), feste
//!    **4 Iterationen Impuls** (sequenziell, aufsummierte Impulse ≥ 0; Abprall aus der Annäherung vor dem Lösen, erst ab
//!    [`ABPRALL_AB`], größerer Wert der beiden; Reibung Coulomb mit √(reibung_a · reibung_b)), dann Weg = tempo · dt, dann feste
//!    **4 Iterationen Positionskorrektur** (die Überlappung über [`SPIEL`] hinaus zu [`ANTEIL`], verteilt nach 1 / masse). Beide
//!    laufen abwechselnd vorwärts und rückwärts durch die sortierte Liste. Die Korrektur bremst danach je Achse höchstens das
//!    Tempo, gegen das sie schiebt (bis 0), beschleunigt aber nie – so ruhen Haufen ohne Resttempo und Überlappungen schleudern nicht.
//! 4. **Zurückschreiben**: tempo, Lage (Weltweg über die Eltern-Matrix zurückgerechnet), `amBoden` (ein Kontakt drückt den
//!    Körper nach oben – Normale mit y < −0,5, y zeigt nach unten), `kontakte`.
//!
//! v1-Grenzen (K-150): keine Drehung (Kreise gleiten, rollen nicht), kein Schlafen, kein Schutz gegen Durchtunneln (Tempo je Takt
//! kleiner als die halbe Ausdehnung halten, Wände dick), gedrehte Rechtecke achsenparallel umschlossen. Alles f64, Reihenfolgen
//! nur nach Teil-ID, nur `libm::sqrt`/`libm::pow` (K-129).

use alloc::vec;
use alloc::vec::Vec;

use super::fuehler::{self, Kandidat};
use super::*;
use crate::schema::{Feld, Genus, Raum, Schema, Spalte};
use crate::welt::lage;

pub const ART_FELD: usize = 0;
pub const MASSE: usize = 1;
pub const TEMPO_X: usize = 2;
pub const TEMPO_Y: usize = 3;
pub const SCHWERKRAFT: usize = 4;
pub const DAEMPFUNG: usize = 5;
pub const ABPRALL: usize = 6;
pub const REIBUNG: usize = 7;
pub const STOSS_X: usize = 8;
pub const STOSS_Y: usize = 9;
/// Lesefeld: Kontakt mit Normale nach oben im letzten Takt
pub const AM_BODEN: usize = 10;
/// verborgen: Impulse des letzten Takts je Kontakt (Warmstart), flach `[Partner-Teil, normal, reib]` – je Paar beim dynamischen
/// Körper mit der kleineren Teil-ID (bzw. dem einzigen dynamischen)
pub const KONTAKTE: usize = 11;

/// Werte von `art`.
pub mod art {
    pub const DYNAMISCH: u32 = 0;
    pub const KINEMATISCH: u32 = 1;
    pub const FEST: u32 = 2;
}

/// Iterationen des Lösers (fest, K-150).
pub const ITERATIONEN: usize = 4;
/// Abprall erst ab dieser Annäherung (Pixel/s) – darunter ruht ein Körper, statt zu zittern (bei schwerkraft 1200 sind es zwei
/// Takte Fallen).
pub const ABPRALL_AB: f64 = 40.0;
/// Überlappung (Pixel), die die Positionskorrektur stehen lässt – so bleibt ein ruhender Kontakt von Takt zu Takt bestehen.
pub const SPIEL: f64 = 0.05;
/// Anteil der Überlappung, den eine Iteration korrigiert.
pub const ANTEIL: f64 = 0.5;
/// Werkstoff eines festen Fühlers ohne `Wucht`: abprall 0, reibung wie der Standard 0.2.
const REIBUNG_OHNE: f64 = 0.2;

pub static ART: Art = Art {
    schema: Schema {
        name: "Wucht",
        genus: Genus::F,
        raum: Raum::Zwei,
        braucht: &["Fuehler"],
        felder: &[
            Feld::wahl("art", &["dynamisch", "kinematisch", "fest"], 0),
            Feld::zahl("masse", 1.0).min(0.001),
            Feld::zahl("tempoX", 0.0),
            Feld::zahl("tempoY", 0.0),
            Feld::zahl("schwerkraft", 0.0),
            Feld::zahl("daempfung", 0.0).bereich(0.0, 1.0),
            Feld::zahl("abprall", 0.0).bereich(0.0, 1.0),
            Feld::zahl("reibung", 0.2).bereich(0.0, 1.0),
            Feld::zahl("stossX", 0.0),
            Feld::zahl("stossY", 0.0),
            Feld::diavolo("amBoden", false).lesen(),
            Feld::puffer("kontakte"),
        ],
    },
    takt: Some(takt),
    ..Art::LEER
};

/// Ein Körper im Löser (unabhängig vom Speicher; H-K10 hängt feste Kacheln als Körper mit `inv_masse` 0 an).
#[derive(Clone, Copy, Debug)]
pub struct Koerper {
    /// 1 / masse (0 = unendlich schwer: kinematisch, fest, Fühler ohne Wucht)
    pub inv_masse: f64,
    pub tempo: [f64; 2],
    /// Weg in diesem Takt (Welt): tempo · dt + Positionskorrektur; setzt [`loese`]
    pub weg: [f64; 2],
    pub abprall: f64,
    pub reibung: f64,
    /// bewegt sich mit tempo (dynamisch, kinematisch)
    pub beweglich: bool,
    pub am_boden: bool,
}

impl Koerper {
    /// Fester Körper ohne Wucht (Wand, Boden, später Kachel).
    pub const FEST: Koerper =
        Koerper { inv_masse: 0.0, tempo: [0.0; 2], weg: [0.0; 2], abprall: 0.0, reibung: REIBUNG_OHNE, beweglich: false, am_boden: false };
}

/// Ein Kontakt: Körper `a` und `b` (Indizes, `a` mit der kleineren Teil-ID), Normale von `a` nach `b`, Tiefe zu Beginn; der
/// Löser merkt sich Annäherung und aufsummierte Impulse.
#[derive(Clone, Copy, Debug)]
pub struct Kontakt {
    pub a: usize,
    pub b: usize,
    pub normale: [f64; 2],
    pub tiefe: f64,
    pub annaeherung: f64,
    pub impuls: f64,
    pub reibimpuls: f64,
}

impl Kontakt {
    pub fn neu(a: usize, b: usize, normale: [f64; 2], tiefe: f64) -> Kontakt {
        Kontakt { a, b, normale, tiefe, annaeherung: 0.0, impuls: 0.0, reibimpuls: 0.0 }
    }
}

#[inline]
fn wurzel(x: f64) -> f64 {
    libm::sqrt(x)
}

/// Normale (von `a` nach `b`, Länge 1) und Tiefe zweier 2D-Hüllen, wenn sie sich überlappen (Ränder zählen, Tiefe dann 0).
/// Kreis–Kreis über den Mittenabstand (deckungsgleich: Normale nach oben), Rechteck–Rechteck über die kleinere Überlappung
/// (gleich: senkrecht), Kreis–Rechteck über den nächsten Punkt (Mitte im Rechteck: zur nächsten Kante, gleich weit: oben, unten,
/// links, rechts). 3D-Hüllen → `None`.
pub fn kontakt(a: &Huelle, b: &Huelle) -> Option<([f64; 2], f64)> {
    match (*a, *b) {
        (Huelle::Kreis(ma, ra), Huelle::Kreis(mb, rb)) => {
            let (dx, dy) = (mb[0] - ma[0], mb[1] - ma[1]);
            let d2 = dx * dx + dy * dy;
            let r = ra + rb;
            if !(d2 <= r * r) {
                return None;
            }
            let d = wurzel(d2);
            if d > 0.0 {
                Some(([dx / d, dy / d], r - d))
            } else {
                Some(([0.0, -1.0], r))
            }
        }
        (Huelle::Kreis(m, r), Huelle::Rechteck(lo, hi)) => kreis_rechteck(m, r, lo, hi).map(|(n, t)| ([-n[0], -n[1]], t)),
        (Huelle::Rechteck(lo, hi), Huelle::Kreis(m, r)) => kreis_rechteck(m, r, lo, hi),
        (Huelle::Rechteck(a0, a1), Huelle::Rechteck(b0, b1)) => {
            let ox = (if a1[0] < b1[0] { a1[0] } else { b1[0] }) - (if a0[0] > b0[0] { a0[0] } else { b0[0] });
            let oy = (if a1[1] < b1[1] { a1[1] } else { b1[1] }) - (if a0[1] > b0[1] { a0[1] } else { b0[1] });
            if !(ox >= 0.0 && oy >= 0.0) {
                return None;
            }
            if oy <= ox {
                let unten = b0[1] + b1[1] >= a0[1] + a1[1];
                Some(([0.0, if unten { 1.0 } else { -1.0 }], oy))
            } else {
                let rechts = b0[0] + b1[0] >= a0[0] + a1[0];
                Some(([if rechts { 1.0 } else { -1.0 }, 0.0], ox))
            }
        }
        _ => None,
    }
}

/// Kreis gegen Rechteck: Normale vom Rechteck zum Kreis, Tiefe.
fn kreis_rechteck(m: [f64; 2], r: f64, lo: [f64; 2], hi: [f64; 2]) -> Option<([f64; 2], f64)> {
    let qx = if m[0] < lo[0] { lo[0] } else if m[0] > hi[0] { hi[0] } else { m[0] };
    let qy = if m[1] < lo[1] { lo[1] } else if m[1] > hi[1] { hi[1] } else { m[1] };
    let (dx, dy) = (m[0] - qx, m[1] - qy);
    let d2 = dx * dx + dy * dy;
    if !(d2 <= r * r) {
        return None;
    }
    if d2 > 0.0 {
        let d = wurzel(d2);
        return Some(([dx / d, dy / d], r - d));
    }
    // Mitte im Rechteck (oder auf dem Rand): zur nächsten Kante hinaus
    let kanten = [(m[1] - lo[1], [0.0, -1.0]), (hi[1] - m[1], [0.0, 1.0]), (m[0] - lo[0], [-1.0, 0.0]), (hi[0] - m[0], [1.0, 0.0])];
    let mut best = kanten[0];
    for k in &kanten[1..] {
        if k.0 < best.0 {
            best = *k;
        }
    }
    Some((best.1, r + best.0))
}

/// Löst die Kontakte (sortiert nach Teil-IDs): [`ITERATIONEN`] Impuls-Durchgänge, `weg` = tempo · dt der beweglichen Körper,
/// [`ITERATIONEN`] Durchgänge Positionskorrektur auf `weg`. Gerade Durchgänge laufen vorwärts, ungerade rückwärts. Stehen in
/// `impuls`/`reibimpuls` schon Werte (Warmstart aus dem letzten Takt), wirken sie zuerst. Setzt `am_boden` der Körper, die ein
/// Kontakt nach oben drückt. Für H-K10 öffentlich (feste Kacheln als weitere Körper).
pub fn loese(koerper: &mut [Koerper], kontakte: &mut [Kontakt]) {
    let m = kontakte.len();
    for c in kontakte.iter_mut() {
        let n = c.normale;
        let (a, b) = (&koerper[c.a], &koerper[c.b]);
        c.annaeherung = (b.tempo[0] - a.tempo[0]) * n[0] + (b.tempo[1] - a.tempo[1]) * n[1];
        if b.inv_masse > 0.0 && n[1] < -0.5 {
            koerper[c.b].am_boden = true;
        }
        if koerper[c.a].inv_masse > 0.0 && n[1] > 0.5 {
            koerper[c.a].am_boden = true;
        }
    }
    // Warmstart: die Impulse des letzten Takts (vom Aufrufer in `impuls`/`reibimpuls` gelegt) gleich anwenden
    for c in kontakte.iter() {
        if c.impuls == 0.0 && c.reibimpuls == 0.0 {
            continue;
        }
        let (a, b) = (koerper[c.a], koerper[c.b]);
        let n = c.normale;
        let p = [c.impuls * n[0] - c.reibimpuls * n[1], c.impuls * n[1] + c.reibimpuls * n[0]];
        koerper[c.a].tempo = [a.tempo[0] - a.inv_masse * p[0], a.tempo[1] - a.inv_masse * p[1]];
        koerper[c.b].tempo = [b.tempo[0] + b.inv_masse * p[0], b.tempo[1] + b.inv_masse * p[1]];
    }
    // Impulse (aufsummiert, normal ≥ 0, Reibung ≤ μ · normal)
    for it in 0..ITERATIONEN {
        for nr in 0..m {
            let c = &mut kontakte[if it % 2 == 0 { nr } else { m - 1 - nr }];
            let (a, b) = (koerper[c.a], koerper[c.b]);
            let summe = a.inv_masse + b.inv_masse;
            let n = c.normale;
            let (mut va, mut vb) = (a.tempo, b.tempo);
            let vn = (vb[0] - va[0]) * n[0] + (vb[1] - va[1]) * n[1];
            let ziel = if -c.annaeherung > ABPRALL_AB { -(if a.abprall > b.abprall { a.abprall } else { b.abprall }) * c.annaeherung } else { 0.0 };
            let neu = c.impuls + (ziel - vn) / summe;
            let neu = if neu > 0.0 { neu } else { 0.0 };
            let j = neu - c.impuls;
            c.impuls = neu;
            va = [va[0] - a.inv_masse * j * n[0], va[1] - a.inv_masse * j * n[1]];
            vb = [vb[0] + b.inv_masse * j * n[0], vb[1] + b.inv_masse * j * n[1]];
            // Reibung entlang der Tangente (−n.y, n.x)
            let t = [-n[1], n[0]];
            let vt = (vb[0] - va[0]) * t[0] + (vb[1] - va[1]) * t[1];
            let grenze = wurzel(a.reibung * b.reibung) * c.impuls;
            let neu = c.reibimpuls - vt / summe;
            let neu = if neu > grenze { grenze } else if neu < -grenze { -grenze } else { neu };
            let jt = neu - c.reibimpuls;
            c.reibimpuls = neu;
            va = [va[0] - a.inv_masse * jt * t[0], va[1] - a.inv_masse * jt * t[1]];
            vb = [vb[0] + b.inv_masse * jt * t[0], vb[1] + b.inv_masse * jt * t[1]];
            koerper[c.a].tempo = va;
            koerper[c.b].tempo = vb;
        }
    }
    for kp in koerper.iter_mut() {
        kp.weg = if kp.beweglich { [kp.tempo[0] * DT, kp.tempo[1] * DT] } else { [0.0; 2] };
    }
    let vorher: Vec<[f64; 2]> = koerper.iter().map(|kp| kp.weg).collect();
    // Positionskorrektur: nur die Lage, das Tempo bleibt (keine Energie aus Überlappungen)
    for it in 0..ITERATIONEN {
        for nr in 0..m {
            let c = &kontakte[if it % 2 == 0 { nr } else { m - 1 - nr }];
            let (a, b) = (koerper[c.a], koerper[c.b]);
            let n = c.normale;
            let tiefe = c.tiefe - ((b.weg[0] - a.weg[0]) * n[0] + (b.weg[1] - a.weg[1]) * n[1]);
            if !(tiefe > SPIEL) {
                continue;
            }
            let k = (tiefe - SPIEL) * ANTEIL / (a.inv_masse + b.inv_masse);
            let (ka, kb) = (k * a.inv_masse, k * b.inv_masse);
            koerper[c.a].weg = [a.weg[0] - ka * n[0], a.weg[1] - ka * n[1]];
            koerper[c.b].weg = [b.weg[0] + kb * n[0], b.weg[1] + kb * n[1]];
        }
    }
    // Die Korrektur bremst je Achse das Tempo, das sie aufhebt (höchstens bis 0) – sie beschleunigt nie: ein Haufen, den die
    // Impulse nicht ganz halten, ruht so ohne Resttempo, und eine tiefe Überlappung schleudert nicht.
    for (kp, v0) in koerper.iter_mut().zip(&vorher) {
        if kp.inv_masse > 0.0 {
            for d in 0..2 {
                let k = (kp.weg[d] - v0[d]) / DT;
                let v = kp.tempo[d];
                if v > 0.0 && k < 0.0 {
                    kp.tempo[d] = if v + k > 0.0 { v + k } else { 0.0 };
                } else if v < 0.0 && k > 0.0 {
                    kp.tempo[d] = if v + k < 0.0 { v + k } else { 0.0 };
                }
            }
        }
    }
}

/// Verschiebt ein 2D-Teil um den Weltweg `(dx, dy)` (über die Eltern-Matrix in dessen Lage zurückgerechnet).
fn verschiebe(w: &mut Welt, r: usize, dx: f64, dy: f64) {
    if dx == 0.0 && dy == 0.0 {
        return;
    }
    let e = w.teile.eltern[r];
    let (lx, ly) = match w.zeile_opt(e).filter(|_| e != 0) {
        Some(pz) => {
            w.aktualisiere(pz);
            let p = w.teile.welt[pz];
            let det = p[0] * p[3] - p[2] * p[1];
            if det == 0.0 || !det.is_finite() {
                return;
            }
            ((p[3] * dx - p[2] * dy) / det, (p[0] * dy - p[1] * dx) / det)
        }
        None => (dx, dy),
    };
    let l = &mut w.teile.lage[r];
    l[lage::X] += lx;
    l[lage::Y] += ly;
    w.markiere(r);
}

fn takt(w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    if n == 0 {
        return;
    }
    // 1. Kräfte (die Lage bleibt noch)
    let mut dynamische = 0usize;
    {
        let (teile, [ar, ma, tx, ty, g, da, sx, sy, bo]) = s.zahlen_mut([ART_FELD, MASSE, TEMPO_X, TEMPO_Y, SCHWERKRAFT, DAEMPFUNG, STOSS_X, STOSS_Y, AM_BODEN]);
        for z in 0..n {
            bo[z] = 0.0;
            let (stx, sty) = (sx[z], sy[z]);
            sx[z] = 0.0;
            sy[z] = 0.0;
            if teile[z] == 0 || ar[z] as u32 != art::DYNAMISCH {
                continue;
            }
            dynamische += 1;
            tx[z] += stx / ma[z];
            ty[z] += sty / ma[z] + g[z] * DT;
            if da[z] != 0.0 {
                let f = libm::pow(1.0 - da[z], DT);
                tx[z] *= f;
                ty[z] *= f;
            }
        }
    }
    // Warmstart-Speicher des letzten Takts herausnehmen (wird unten neu gefüllt)
    let mut alt = core::mem::replace(&mut s.spalten[KONTAKTE], Spalte::Puffer(Vec::new()));
    let Spalte::Puffer(cache) = &mut alt else { unreachable!("Wucht: Pufferspalte") };
    // 2. Kontakte: feste 2D-Fühler (Speicher des Fühlers kurz herausnehmen und immer zurücklegen)
    let mut koerper: Vec<Koerper> = Vec::new();
    let mut von_zeile: Vec<usize> = vec![usize::MAX; n];
    // je Körper: Wucht-Zeile (dynamisch) oder usize::MAX
    let mut zeile_von: Vec<usize> = Vec::new();
    if dynamische > 0 {
        if let (Some(fi), Some(wi)) = (w.art_index("Fuehler"), w.art_index("Wucht")) {
            let fs = core::mem::take(&mut w.speicher[fi]);
            let gesammelt = {
                let au = fs.zahl(fuehler::AUSLOESER);
                fuehler::sammle_wenn(w, &fs, |z| au[z] == 0.0)
            };
            w.speicher[fi] = fs;
            let mut k: Vec<Kandidat> = Vec::with_capacity(gesammelt.len());
            for &(_, c) in &gesammelt {
                if c.drei_d {
                    continue;
                }
                let tz = w.zeile_opt(c.teil).expect("Kandidat lebt");
                let kp = match w.komp_zeile(tz, wi) {
                    None => {
                        zeile_von.push(usize::MAX);
                        Koerper::FEST
                    }
                    Some(z) => {
                        let a = s.zahl(ART_FELD)[z] as u32;
                        von_zeile[z] = koerper.len();
                        zeile_von.push(if a == art::DYNAMISCH { z } else { usize::MAX });
                        Koerper {
                            inv_masse: if a == art::DYNAMISCH { 1.0 / s.zahl(MASSE)[z] } else { 0.0 },
                            tempo: if a == art::FEST { [0.0; 2] } else { [s.zahl(TEMPO_X)[z], s.zahl(TEMPO_Y)[z]] },
                            weg: [0.0; 2],
                            abprall: s.zahl(ABPRALL)[z],
                            reibung: s.zahl(REIBUNG)[z],
                            beweglich: a != art::FEST,
                            am_boden: false,
                        }
                    }
                };
                k.push(c);
                koerper.push(kp);
            }
            let mut kontakte: Vec<Kontakt> = Vec::new();
            for (i, j) in fuehler::breitphase(&k) {
                if koerper[i].inv_masse + koerper[j].inv_masse > 0.0 {
                    if let Some((normale, tiefe)) = kontakt(&k[i].huelle, &k[j].huelle) {
                        let mut c = Kontakt::neu(i, j, normale, tiefe);
                        // Warmstart: beim dynamischen Körper mit der kleineren ID nach dem Partner suchen
                        let (halter, partner) = if zeile_von[i] != usize::MAX { (zeile_von[i], k[j].teil) } else { (zeile_von[j], k[i].teil) };
                        let liste = &cache[halter];
                        let mut q = 0;
                        while q + 3 <= liste.len() {
                            if liste[q] == partner as f64 {
                                c.impuls = liste[q + 1];
                                c.reibimpuls = liste[q + 2];
                                break;
                            }
                            q += 3;
                        }
                        kontakte.push(c);
                    }
                }
            }
            // 3. Lösen (ohne Kontakte bewegt Schritt 4 alle mit tempo · dt)
            for liste in cache.iter_mut() {
                liste.clear();
            }
            if kontakte.is_empty() {
                von_zeile.iter_mut().for_each(|v| *v = usize::MAX);
            } else {
                loese(&mut koerper, &mut kontakte);
                for c in &kontakte {
                    if c.impuls > 0.0 {
                        let (halter, partner) = if zeile_von[c.a] != usize::MAX { (zeile_von[c.a], k[c.b].teil) } else { (zeile_von[c.b], k[c.a].teil) };
                        cache[halter].extend_from_slice(&[partner as f64, c.impuls, c.reibimpuls]);
                    }
                }
            }
        }
    }
    if dynamische == 0 {
        for liste in cache.iter_mut() {
            liste.clear();
        }
    }
    s.spalten[KONTAKTE] = alt;
    // 4. Zurückschreiben und bewegen (in Speicher-Reihenfolge)
    for z in 0..n {
        let teil = s.teil[z];
        if teil == 0 || s.zahl(ART_FELD)[z] as u32 == art::FEST {
            continue;
        }
        let Some(r) = w.zeile_opt(teil) else { continue };
        let (dx, dy) = match von_zeile[z] {
            usize::MAX => (s.zahl(TEMPO_X)[z] * DT, s.zahl(TEMPO_Y)[z] * DT),
            i => {
                let kp = koerper[i];
                if kp.inv_masse > 0.0 {
                    s.zahl_mut(TEMPO_X)[z] = kp.tempo[0];
                    s.zahl_mut(TEMPO_Y)[z] = kp.tempo[1];
                }
                if kp.am_boden {
                    s.zahl_mut(AM_BODEN)[z] = 1.0;
                }
                (kp.weg[0], kp.weg[1])
            }
        };
        verschiebe(w, r, dx, dy);
    }
}
