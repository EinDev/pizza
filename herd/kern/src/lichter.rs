//! Viele Lichter (Clustered Forward): der Abschnitt `LICHTER` des Bildpakets (`herd/README.md` §4).
//!
//! v1 schreibt die 8 nächsten Punktlichter in den Uniform-Block SZENE – das bleibt unverändert. Gibt es **mehr als 8** wirksame
//! Punktlichter oder einen **Spot** (`Licht.kegel` > 0), schreibt der Kern zusätzlich diesen Abschnitt: alle sichtbaren Lichter
//! (bis `MAX_LICHTER_VIELE`, die nächsten zur Kamera zuerst) und eine **Cluster-Tabelle**: die Sicht ist in `RASTER_X × ny`
//! Kacheln (NDC) und `RASTER_Z` Tiefenscheiben (exponentiell zwischen `nah` und `fern`) geteilt; je Zelle stehen die Lichter,
//! deren Kugel (Lage, Reichweite) sie berühren könnte (konservativ: Quader um die Kugel, je Scheibe projiziert). Der Shader
//! sucht die Zelle seines Fragments und rechnet nur deren Lichter. Alles in f64 mit `libm`, Reihenfolgen nach (Abstand, Teil-ID)
//! – bitgleich nativ = Wasm. Pakete ohne viele Lichter bleiben byte-gleich (kein Abschnitt).
//!
//! **Schatten für Punkt- und Spotlichter (H-K18):** [`schatten_waehlen`] nimmt höchstens [`MAX_SCHATTEN_LICHTER`] Lichter mit
//! `schattenGuete` ≠ aus, deren Kugel das Kamera-Frustum schneidet, nach (Abstand Kamera – Lichtrand, Teil-ID), und packt ihre
//! Kacheln (Würfel = 6 Seiten mit 90°-Perspektive + Rand, keine Cube-Map; Spot bis 60° = 1 Kachel) nach (Güte absteigend,
//! Auswahlreihenfolge) in den Schatten-Atlas: 4096² Texel als [`SCHATTEN_SEITEN`] Schichten à 2048² hinter den Sonnen-Schichten
//! derselben Tiefen-Textur. Gepackt wird in Morton-Reihenfolge (Quadrate mit absteigender Zweierpotenz-Kante füllen lückenlos);
//! ein Licht, dessen Kacheln nicht alle passen, wirft still keinen Schatten. Ein schattenwerfendes Licht erzwingt den Abschnitt
//! `LICHTER`; sein Zellen-Eintrag trägt in Bits 16 … 19 die Nummer seines Schatten-Platzes + 1 (Indizes < 4096 bleiben in Bits
//! 0 … 15). Abschnitt `SCHATTENLICHTER` ([`schatten_abschnitt`]) nur bei Nutzung.
//!
//! **Spiegelbild voll (H-K21, `Stimmung.spiegelGuete`):** zu `LICHTER` kommt `LICHTER_SPIEGEL` – eine zweite Zellen-Tabelle für
//! die an der Spiegelebene gespiegelte Kamera über dieselbe Lichterliste (die dann auch Lichter führt, die nur den Spiegel
//! berühren); Schattenwahl und Sichtprüfung nehmen das gespiegelte Frustum dazu. Sonst byte-gleich.

use alloc::vec;
use alloc::vec::Vec;

use crate::paket::{abschnitt as art, lin4, ordnungs_bits, put_u32, put_v4, transf, LichtB, MAX_LICHTER, M4};
use crate::paket::{abschnitt_beginn, abschnitt_ende, blick, m4_mal, punkt, put_f32, v_norm};

/// Höchstens so viele Lichter im Abschnitt (die nächsten zur Kamera; weitere fallen weg).
pub const MAX_LICHTER_VIELE: usize = 4096;
/// Höchstens so viele Lichter je Zelle (die nächsten zur Kamera zuerst; weitere wirken dort nicht).
pub const MAX_JE_ZELLE: usize = 255;
/// Kacheln waagerecht; senkrecht `round(RASTER_X / Seitenverhältnis)` (1 … 32).
pub const RASTER_X: u32 = 16;
/// Tiefenscheiben (exponentiell zwischen `nah` und `fern`).
pub const RASTER_Z: u32 = 24;
/// Uniform-Kopf des Abschnitts (std140-gleich, f32): `raster` (nx, ny, nz, Anzahl), `tiefe` (nah, nz / ln(fern/nah), fern, 0),
/// `vorn` (Blickrichtung xyz, 0), frei.
pub const LICHTER_KOPF_BYTES: usize = 64;
/// Ein Licht: `pos xyz, reichweite` · `farbe rgb (linear × Stärke), cos(Kegel außen)` · `richtung xyz, cos(Kegel innen)`.
pub const LICHT_BYTES: usize = 48;
/// Höchstens so viele Wörter Cluster-Daten (Köpfe + Indizes; = Textur 1024 × 2048 in der Glut).
pub const MAX_WORTE: usize = 1024 * 2048;

/// Höchstens so viele schattenwerfende Punkt-/Spotlichter je Bild (H-K18, K-160).
pub const MAX_SCHATTEN_LICHTER: usize = 8;
/// Kantenlänge einer Schicht der Schatten-Tiefentextur (Sonne bzw. eine Kaskade je Schicht; Atlas-Seiten der Kacheln).
pub const SCHATTEN_SEITE: u32 = 2048;
/// Atlas-Seiten für Punkt-/Spot-Kacheln (zusammen 4096² Texel).
pub const SCHATTEN_SEITEN: u32 = 4;
/// Höchstens so viele Sonnen-Kaskaden.
pub const MAX_KASKADEN: usize = 4;
/// Höchstens so viele Schatten-Ansichten (Kaskaden + Kacheln).
pub const MAX_ANSICHTEN: usize = MAX_KASKADEN + MAX_SCHATTEN_LICHTER * 6;
/// Eine Schatten-Ansicht im Abschnitt `SCHATTENLICHTER`: Ansicht·Projektion (64 B), `schicht x y kante` (Texel), `texel 0 0 0`
/// (Kacheln: Weltmaß eines Texels je Einheit Abstand; Kaskaden: Weltmaß eines Texels).
pub const SCHATTEN_ANSICHT_BYTES: usize = 96;
/// Kopf (`an, kaskaden, sonne_weich, ansichten`) + 4 Kaskaden (`normalversatz, bias, 0, 0`) + 8 Plätze (`erste ansicht,
/// anzahl, weich, 0`) – danach die Ansichten.
pub const SCHATTENLICHTER_KOPF_BYTES: usize = 16 + MAX_KASKADEN * 16 + MAX_SCHATTEN_LICHTER * 16;
/// Größe des Uniform-Blocks in der Glut (Abschnitt mit allen Ansichten; kürzere Abschnitte füllt sie mit Nullen auf).
pub const SCHATTENLICHTER_BYTES: usize = SCHATTENLICHTER_KOPF_BYTES + MAX_ANSICHTEN * SCHATTEN_ANSICHT_BYTES;
/// Rand (Texel) einer Kachel um den 90°- bzw. Kegel-Bereich: Platz für den Zeltfilter, kein Übersprechen zur Nachbarkachel.
pub const KACHEL_RAND: f64 = 12.0;
/// Spots bis zu diesem halben Öffnungswinkel (Grad) werfen über eine Kachel, weitere über einen Würfel.
pub const SPOT_EINE_KACHEL: f64 = 60.0;

/// Eine Schatten-Ansicht (Sonnen-Kaskade oder Kachel eines Punkt-/Spotlichts).
#[derive(Clone, Copy, Debug)]
pub struct SchattenAnsicht {
    pub vp: M4,
    pub schicht: u32,
    pub x: u32,
    pub y: u32,
    pub kante: u32,
    pub texel: f64,
}

/// Ergebnis von [`schatten_waehlen`]: Platz je Licht (Index wie `lichter`; 0 = kein Schatten, sonst Platz + 1), je Platz
/// (Licht-Index, erste Kachel, Zahl der Kacheln, Weichheit) und die Kacheln.
#[derive(Default, Debug)]
pub struct SchattenWahl {
    pub platz: Vec<u8>,
    pub plaetze: Vec<(usize, u32, u32, f64)>,
    pub kacheln: Vec<SchattenAnsicht>,
}

/// Perspektive mit gegebenem halbem Tangens (quadratisch, Tiefe 0 … 1 wie WebGPU).
fn perspektive_tan(t: f64, nah: f64, fern: f64) -> M4 {
    let mut r = [0.0; 16];
    r[0] = 1.0 / t;
    r[5] = 1.0 / t;
    r[10] = fern / (nah - fern);
    r[11] = -1.0;
    r[14] = nah * fern / (nah - fern);
    r
}

/// Morton-Index → (x, y) (x in den geraden, y in den ungeraden Bits).
fn morton(k: u32) -> (u32, u32) {
    let (mut x, mut y) = (0, 0);
    for b in 0..16 {
        x |= ((k >> (2 * b)) & 1) << b;
        y |= ((k >> (2 * b + 1)) & 1) << b;
    }
    (x, y)
}

/// Würfelseiten in fester Reihenfolge (+x, −x, +y, −y, +z, −z) – der Shader wählt die Seite nach der größten Achse.
const SEITEN: [[f64; 3]; 6] = [[1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, -1.0, 0.0], [0.0, 0.0, 1.0], [0.0, 0.0, -1.0]];

/// Kantenlänge einer Kachel je Güte (grob, mittel, fein).
pub fn kachel_kante(guete: u32) -> u32 {
    128 << guete.clamp(1, 3)
}

/// Wählt die schattenwerfenden Punkt-/Spotlichter (H-K18) und packt ihre Kacheln. `sk` = Ebenen des Kamera-Frustums,
/// `sk_spiegel` = Ebenen des gespiegelten Frustums bei `Stimmung.spiegelGuete` voll (H-K21: ein Licht zählt auch, wenn es nur
/// den Spiegel berührt), `basis` = erste Schicht der Atlas-Seiten (hinter den Sonnen-Schichten).
pub fn schatten_waehlen(lichter: &[LichtB], sk: &[[f64; 4]; 6], sk_spiegel: Option<&[[f64; 4]; 6]>, auge: [f64; 3], basis: u32) -> SchattenWahl {
    let mut wahl = SchattenWahl { platz: vec![0; lichter.len()], ..Default::default() };
    let mut kandidaten: Vec<(u64, u32, usize)> = Vec::new();
    for (i, l) in lichter.iter().enumerate() {
        if !wirkt(l) || !l.schatten || l.guete == 0 || !(l.reichweite > 0.0 && l.reichweite.is_finite()) {
            continue;
        }
        if !(l.pos[0].is_finite() && l.pos[1].is_finite() && l.pos[2].is_finite()) {
            continue;
        }
        let r = l.reichweite;
        let drin = |e: &[[f64; 4]; 6]| {
            e.iter().all(|p| {
                let n = libm::sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
                p[0] * l.pos[0] + p[1] * l.pos[1] + p[2] * l.pos[2] + p[3] >= -r * n
            })
        };
        if !drin(sk) && !sk_spiegel.is_some_and(drin) {
            continue;
        }
        let d = [l.pos[0] - auge[0], l.pos[1] - auge[1], l.pos[2] - auge[2]];
        let rand = libm::sqrt(punkt(d, d)) - r;
        kandidaten.push((ordnungs_bits(if rand > 0.0 { rand } else { 0.0 }), l.teil, i));
    }
    kandidaten.sort_unstable_by_key(|x| (x.0, x.1));
    kandidaten.truncate(MAX_SCHATTEN_LICHTER);
    // Packen: Güte absteigend (Kante absteigend → lückenlos in Morton-Reihenfolge), dann Auswahlreihenfolge
    let mut pack: Vec<(u32, usize, usize)> = kandidaten.iter().enumerate().map(|(r, k)| (3 - lichter[k.2].guete.clamp(1, 3), r, k.2)).collect();
    pack.sort_unstable_by_key(|x| (x.0, x.1));
    let seite = (SCHATTEN_SEITE as u64) * (SCHATTEN_SEITE as u64);
    let gesamt = seite * SCHATTEN_SEITEN as u64;
    let mut belegt: u64 = 0;
    for &(_, _, i) in &pack {
        let l = &lichter[i];
        let kante = kachel_kante(l.guete);
        let spot = l.kegel > 0.0 && l.kegel <= SPOT_EINE_KACHEL;
        let anzahl: u32 = if spot { 1 } else { 6 };
        let flaeche = kante as u64 * kante as u64;
        if belegt + flaeche * anzahl as u64 > gesamt {
            continue;
        }
        let fern = l.reichweite;
        let nah = {
            let n = fern * 0.002;
            let n = if n > 0.02 { n } else { 0.02 };
            if n < fern * 0.5 {
                n
            } else {
                fern * 0.5
            }
        };
        // Rand um den Nutzbereich: halber Tangens so vergrößert, dass KACHEL_RAND Texel je Seite übrig bleiben
        let rand = 1.0 - 2.0 * KACHEL_RAND / kante as f64;
        let erste = wahl.kacheln.len() as u32;
        // Auge der Kacheln um ein Winziges (≈ 0,02 % der Reichweite, schief) neben dem Licht: Netze, deren Ecken genau in der
        // Ebene des Lichts liegen (Boden-Kante unter einer Laterne bei x = 0), hätten sonst Ecken mit w = 0 – SwiftShader
        // (WebGL2) rastert solche Dreiecke falsch. Die Würfelseite wählt der Shader weiter am Licht (Rand 12 Texel).
        let auge = [l.pos[0] + fern * 1.73e-4, l.pos[1] + fern * 2.31e-4, l.pos[2] + fern * 1.27e-4];
        for seite_nr in 0..anzahl as usize {
            let (richtung, t) = if spot {
                (v_norm(l.richtung, [0.0, -1.0, 0.0]), libm::tan(l.kegel * crate::welt::GRAD))
            } else {
                (SEITEN[seite_nr], libm::tan(45.0 * crate::welt::GRAD))
            };
            let t = t / rand;
            let vp = m4_mal(&perspektive_tan(t, nah, fern), &blick(auge, richtung, [0.0, 1.0, 0.0]));
            let s = (belegt / seite) as u32;
            let (mx, my) = morton(((belegt % seite) / flaeche) as u32);
            wahl.kacheln.push(SchattenAnsicht { vp, schicht: basis + s, x: mx * kante, y: my * kante, kante, texel: 2.0 * t / kante as f64 });
            belegt += flaeche;
        }
        wahl.plaetze.push((i, erste, anzahl, l.weich));
        wahl.platz[i] = wahl.plaetze.len() as u8;
    }
    wahl
}

/// Schreibt den Abschnitt `SCHATTENLICHTER` (H-K18): Kopf, Kaskaden-Werte, Plätze, Ansichten (erst die Kaskaden, dann die
/// Kacheln; die erste Kachel eines Platzes zählt ab Ansicht 0). `kaskaden` = (Ansicht, Normalenversatz, Bias) je Kaskade
/// (leer = Sonne über SZENE wie v1).
pub fn schatten_abschnitt(aus: &mut Vec<u8>, kaskaden: &[(SchattenAnsicht, f64, f64)], sonne_weich: f64, wahl: &SchattenWahl) {
    let k = kaskaden.len();
    let st = abschnitt_beginn(aus, art::SCHATTENLICHTER);
    put_v4(aus, [1.0, k as f64, sonne_weich, (k + wahl.kacheln.len()) as f64]);
    for c in 0..MAX_KASKADEN {
        match kaskaden.get(c) {
            Some((_, versatz, bias)) => put_v4(aus, [*versatz, *bias, 0.0, 0.0]),
            None => put_v4(aus, [0.0; 4]),
        }
    }
    for p in 0..MAX_SCHATTEN_LICHTER {
        match wahl.plaetze.get(p) {
            Some((_, erste, anzahl, weich)) => put_v4(aus, [(k as u32 + *erste) as f64, *anzahl as f64, *weich, 0.0]),
            None => put_v4(aus, [0.0; 4]),
        }
    }
    for a in kaskaden.iter().map(|x| &x.0).chain(wahl.kacheln.iter()) {
        for x in a.vp {
            put_f32(aus, x);
        }
        put_v4(aus, [a.schicht as f64, a.x as f64, a.y as f64, a.kante as f64]);
        put_v4(aus, [a.texel, 0.0, 0.0, 0.0]);
    }
    abschnitt_ende(aus, st);
}

/// Ein Licht wirkt (Punkt oder Spot, nicht Sonne, Stärke > 0)?
#[inline]
fn wirkt(l: &LichtB) -> bool {
    !l.sonne && l.staerke > 0.0
}

/// Spiegelmatrix an der Ebene y = `h` (y → 2h − y; spaltenweise wie alle `M4`).
pub fn spiegel_matrix(h: f64) -> M4 {
    let mut m = [0.0; 16];
    m[0] = 1.0;
    m[5] = -1.0;
    m[13] = 2.0 * h;
    m[10] = 1.0;
    m[15] = 1.0;
    m
}

/// Ebenen eines Frustums (`a·x + b·y + c·z + d ≥ 0` innen), an der Ebene y = `h` gespiegelt: ein Punkt liegt im gespiegelten
/// Frustum, wenn sein Spiegelbild im ursprünglichen liegt (H-K21).
pub fn ebenen_gespiegelt(sk: &[[f64; 4]; 6], h: f64) -> [[f64; 4]; 6] {
    let mut r = *sk;
    for p in r.iter_mut() {
        *p = [p[0], -p[1], p[2], p[3] + 2.0 * h * p[1]];
    }
    r
}

/// Raster einer Sicht (Kacheln × Scheiben) wie im Shader.
struct Raster {
    nx: usize,
    ny: usize,
    nz: usize,
    nah: f64,
    fern: f64,
    pro_scheibe: f64,
    kx: f64,
    ky: f64,
}

impl Raster {
    /// Scheibe zu einer Tiefe (wie der Shader: ⌊ln(d/nah) · nz / ln(fern/nah)⌋, geklemmt)
    fn scheibe(&self, d: f64) -> usize {
        if d <= self.nah {
            return 0;
        }
        let s = libm::floor(libm::log(d / self.nah) * self.pro_scheibe);
        if s < 0.0 {
            0
        } else if s >= (self.nz - 1) as f64 {
            self.nz - 1
        } else {
            s as usize
        }
    }

    fn grenze(&self, s: usize) -> f64 {
        self.nah * libm::exp(s as f64 / self.pro_scheibe)
    }

    /// Kachel zu einer NDC-Koordinate (wie der Shader: ⌊(ndc · ½ + ½) · n⌋, geklemmt)
    fn kachel(ndc: f64, n: usize) -> usize {
        let k = libm::floor((ndc * 0.5 + 0.5) * n as f64);
        if k < 0.0 {
            0
        } else if k >= (n - 1) as f64 {
            n - 1
        } else {
            k as usize
        }
    }

    /// Hängt die Zellen an, die die Kugel des Lichts in der Sicht `ansicht` berühren könnte (Paare (Zelle, `index`));
    /// liefert, ob es eine gab. Konservativ: Quader um die Kugel, je Scheibe projiziert.
    fn zellen(&self, ansicht: &M4, l: &LichtB, index: u32, paare: &mut Vec<(u32, u32)>) -> bool {
        let (nx, ny, nz, nah, fern) = (self.nx, self.ny, self.nz, self.nah, self.fern);
        let r = if l.reichweite > 0.0 { l.reichweite } else { 0.0 };
        let p = transf(ansicht, l.pos);
        let (x, y, d) = (p[0], p[1], -p[2]);
        if !(x.is_finite() && y.is_finite() && d.is_finite()) || d + r <= nah || d - r >= fern {
            return false;
        }
        let mut drin = false;
        let (s0, s1) = (self.scheibe((d - r) * (1.0 - 1e-6)), self.scheibe((d + r) * (1.0 + 1e-6)));
        for s in s0..=s1 {
            // Tiefenbereich dieser Scheibe ∩ Kugel (die letzte Scheibe reicht bis ins Unendliche)
            let mut z0 = self.grenze(s);
            let mut z1 = if s + 1 >= nz { f64::INFINITY } else { self.grenze(s + 1) };
            if s == 0 {
                z0 = nah;
            }
            if d - r > z0 {
                z0 = d - r;
            }
            if d + r < z1 {
                z1 = d + r;
            }
            if z0 < nah {
                z0 = nah;
            }
            if z1 < z0 {
                continue;
            }
            // Quader um die Kugel, projiziert: x/z ist für festes x monoton in z → Extremwerte an z0 und z1
            let (xa, xb, ya, yb) = (x - r, x + r, y - r, y + r);
            let lo = |a: f64, k: f64| -> f64 {
                let (u, v) = (a * k / z0, a * k / z1);
                if u < v {
                    u
                } else {
                    v
                }
            };
            let hi = |a: f64, k: f64| -> f64 {
                let (u, v) = (a * k / z0, a * k / z1);
                if u > v {
                    u
                } else {
                    v
                }
            };
            let (nx0, nx1, ny0, ny1) = (lo(xa, self.kx), hi(xb, self.kx), lo(ya, self.ky), hi(yb, self.ky));
            if nx1 < -1.0 || nx0 > 1.0 || ny1 < -1.0 || ny0 > 1.0 {
                continue;
            }
            drin = true;
            let (tx0, tx1, ty0, ty1) = (Raster::kachel(nx0, nx), Raster::kachel(nx1, nx), Raster::kachel(ny0, ny), Raster::kachel(ny1, ny));
            for ty in ty0..=ty1 {
                for tx in tx0..=tx1 {
                    paare.push((((s * ny + ty) * nx + tx) as u32, index));
                }
            }
        }
        drin
    }

    /// Zellen-Wörter (Köpfe `versatz << 8 | anzahl`, dann Licht-Index | Platz << 16) – innerhalb einer Zelle in
    /// Lichtreihenfolge (stabil), je Zelle höchstens `MAX_JE_ZELLE`, zusammen höchstens `grenze` Wörter (sonst bleibt die Zelle
    /// leer). `basis` = Lage des ersten Worts in der Glut-Textur: die Versätze der Köpfe sind absolut.
    fn tabelle(&self, paare: &[(u32, u32)], sichtbar: &[usize], platz: &[u8], basis: u32, grenze: usize) -> Vec<u32> {
        let zellen = self.nx * self.ny * self.nz;
        let mut zahl = vec![0u32; zellen];
        for &(z, _) in paare {
            let c = &mut zahl[z as usize];
            if (*c as usize) < MAX_JE_ZELLE {
                *c += 1;
            }
        }
        let mut versatz = vec![0u32; zellen];
        let mut summe = zellen as u32;
        for z in 0..zellen {
            if summe as usize + zahl[z] as usize > grenze {
                zahl[z] = 0;
            }
            versatz[z] = summe;
            summe += zahl[z];
        }
        let mut daten = vec![0u32; summe as usize];
        for z in 0..zellen {
            daten[z] = (basis + versatz[z]) << 8 | zahl[z];
        }
        let mut fuell = vec![0u32; zellen];
        for &(z, i) in paare {
            let z = z as usize;
            if fuell[z] < zahl[z] {
                let p = platz.get(sichtbar[i as usize]).copied().unwrap_or(0) as u32;
                daten[(versatz[z] + fuell[z]) as usize] = i | p << 16;
                fuell[z] += 1;
            }
        }
        daten
    }
}

/// Schreibt den Abschnitt `LICHTER`, wenn mehr als `MAX_LICHTER` Lichter wirken oder ein Spot dabei ist; liefert die Zahl der
/// geschriebenen Abschnitte (0, 1 bzw. mit Spiegel-Tabelle 2). `ansicht` = Ansichtsmatrix der Kamera, `vorn` = ihre
/// Blickrichtung (normiert). `platz` = Schatten-Platz + 1 je Licht ([`SchattenWahl::platz`]; 0 bzw. leer = keiner): erzwingt
/// den Abschnitt und steht in Bits 16 … 19 der Zellen-Einträge.
///
/// **Spiegel (H-K21):** `spiegel` = Höhe der Spiegelebene bei `Stimmung.spiegelGuete` voll. Dann führt die Lichterliste auch
/// Lichter, die nur die gespiegelte Sicht berühren, und direkt dahinter folgt der Abschnitt `LICHTER_SPIEGEL`: Kopf wie bei
/// `LICHTER` (Blickrichtung gespiegelt, `frei.x` = erstes Wort der Tabelle in der Glut-Textur), Zahl der Wörter und die
/// Zellen-Tabelle der Ansicht `ansicht · Spiegelmatrix` – dieselbe Lichterliste, Versätze absolut hinter der ersten Tabelle.
/// Ohne `spiegel` byte-gleich.
#[allow(clippy::too_many_arguments)]
pub fn abschnitt(aus: &mut Vec<u8>, lichter: &[LichtB], ansicht: &M4, sicht: f64, seiten: f64, nah: f64, fern: f64, auge: [f64; 3], vorn: [f64; 3], platz: &[u8], spiegel: Option<f64>) -> u32 {
    let anzahl = lichter.iter().filter(|l| wirkt(l)).count();
    let spot = lichter.iter().any(|l| wirkt(l) && l.kegel > 0.0);
    let schatten = platz.iter().any(|&p| p != 0);
    if anzahl <= MAX_LICHTER && !spot && !schatten {
        return 0;
    }
    let nx = RASTER_X as usize;
    let ny = {
        let v = libm::round(RASTER_X as f64 / if seiten > 0.0 { seiten } else { 1.0 });
        if v < 1.0 {
            1
        } else if v > 32.0 {
            32
        } else {
            v as usize
        }
    };
    let nz = RASTER_Z as usize;
    let ln_tiefe = libm::log(fern / nah);
    let pro_scheibe = nz as f64 / ln_tiefe;
    let t = libm::tan(sicht * crate::welt::GRAD * 0.5);
    let raster = Raster { nx, ny, nz, nah, fern, pro_scheibe, kx: 1.0 / (t * seiten), ky: 1.0 / t };
    let ansicht_sp = spiegel.map(|h| m4_mal(ansicht, &spiegel_matrix(h)));

    // Reihenfolge: Abstand zur Kamera, dann Teil-ID (wie die 8 Lichter in SZENE)
    let mut ordnung: Vec<(u64, u32, usize)> = lichter
        .iter()
        .enumerate()
        .filter(|(_, l)| wirkt(l))
        .map(|(i, l)| {
            let d = [l.pos[0] - auge[0], l.pos[1] - auge[1], l.pos[2] - auge[2]];
            (ordnungs_bits(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]), l.teil, i)
        })
        .collect();
    ordnung.sort_unstable_by_key(|x| (x.0, x.1));

    let mut sichtbar: Vec<usize> = Vec::new();
    let mut paare: Vec<(u32, u32)> = Vec::new(); // (Zelle, Licht-Index) in Lichtreihenfolge
    let mut paare_sp: Vec<(u32, u32)> = Vec::new();
    for &(_, _, i) in &ordnung {
        if sichtbar.len() >= MAX_LICHTER_VIELE {
            break;
        }
        let l = &lichter[i];
        let index = sichtbar.len() as u32;
        let mut drin = raster.zellen(ansicht, l, index, &mut paare);
        if let Some(a) = &ansicht_sp {
            drin |= raster.zellen(a, l, index, &mut paare_sp);
        }
        if drin {
            sichtbar.push(i);
        }
    }
    let daten = raster.tabelle(&paare, &sichtbar, platz, 0, MAX_WORTE);

    let st = abschnitt_beginn(aus, art::LICHTER);
    put_v4(aus, [nx as f64, ny as f64, nz as f64, sichtbar.len() as f64]);
    put_v4(aus, [nah, pro_scheibe, fern, 0.0]);
    put_v4(aus, [vorn[0], vorn[1], vorn[2], 0.0]);
    put_v4(aus, [0.0; 4]);
    put_u32(aus, sichtbar.len() as u32);
    put_u32(aus, daten.len() as u32);
    for &i in &sichtbar {
        let l = &lichter[i];
        let f = lin4(l.farbe, l.staerke);
        let (aussen, innen) = if l.kegel > 0.0 {
            let w = l.kegel * crate::welt::GRAD;
            (libm::cos(w), libm::cos(w * (1.0 - l.kegel_rand)))
        } else {
            (-2.0, -1.5)
        };
        let rl = libm::sqrt(l.richtung[0] * l.richtung[0] + l.richtung[1] * l.richtung[1] + l.richtung[2] * l.richtung[2]);
        let rich = if rl > 1e-12 && rl.is_finite() { [l.richtung[0] / rl, l.richtung[1] / rl, l.richtung[2] / rl] } else { [0.0, -1.0, 0.0] };
        put_v4(aus, [l.pos[0], l.pos[1], l.pos[2], l.reichweite]);
        put_v4(aus, [f[0], f[1], f[2], aussen]);
        put_v4(aus, [rich[0], rich[1], rich[2], innen]);
    }
    for w in &daten {
        put_u32(aus, *w);
    }
    abschnitt_ende(aus, st);
    if ansicht_sp.is_none() {
        return 1;
    }

    // ---- Spiegel-Tabelle (H-K21): gespiegelte Sicht, dieselbe Lichterliste, hinter der ersten Tabelle ----
    // Passt sie nicht mehr in MAX_WORTE, bleibt sie leer (Kopf mit Anzahl 0 → der Spiegel nimmt die 8 Lichter aus SZENE)
    let basis = daten.len() as u32;
    let rest = MAX_WORTE.saturating_sub(daten.len());
    let daten_sp = if rest >= nx * ny * nz { raster.tabelle(&paare_sp, &sichtbar, platz, basis, rest) } else { Vec::new() };
    let an = if daten_sp.is_empty() { 0.0 } else { sichtbar.len() as f64 };
    let st = abschnitt_beginn(aus, art::LICHTER_SPIEGEL);
    put_v4(aus, [nx as f64, ny as f64, nz as f64, an]);
    put_v4(aus, [nah, pro_scheibe, fern, 0.0]);
    put_v4(aus, [vorn[0], -vorn[1], vorn[2], 0.0]);
    put_v4(aus, [basis as f64, 0.0, 0.0, 0.0]);
    put_u32(aus, daten_sp.len() as u32);
    for w in &daten_sp {
        put_u32(aus, *w);
    }
    abschnitt_ende(aus, st);
    2
}
