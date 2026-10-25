//! Bildpaket (Kern → Glut), Format v1 – genau beschrieben in `herd/README.md` („Bildpaket“).
//!
//! Aufbau: Kopf (32 Bytes) + Abschnitte (`u32 art`, `u32 länge`, Daten, auf 4 Bytes aufgefüllt). Alles Little Endian,
//! feldweise geschrieben. f32 über `f32w` (nicht endlich → 0, −0 → 0): bitgleich nativ = Wasm. Das Paket hängt nicht von
//! der Fenster- oder Gerätegröße ab (nur vom logischen Spielfeld).

use alloc::vec::Vec;

use crate::farbe;
use crate::komponenten::blick::{self, Sicht};
use crate::ressourcen::{Ressource, Ressourcen, TEXTUR_MARKE};
use crate::schrift::Schrift;
use crate::welt::{mal_2d, Welt};

pub const MAGIE: [u8; 4] = *b"HZP1";
pub const VERSION: u32 = 1;
pub const KOPF_BYTES: usize = 32;
pub const SZENE_BYTES: usize = 592;
pub const INST2D_BYTES: usize = 56;
pub const INST3D_BYTES: usize = 72;
/// Abschnitt `ZUSATZ3D`: je Instanz `u32 relief, f32 kachel, f32 metall, u32 merkmale` (`Belag`-Material).
pub const ZUSATZ3D_BYTES: usize = 16;
/// Abschnitt `KARTEN3D` (H-K26): je Instanz `u32 normal, stoff, leucht, leuchtfarbe|schwelle` (`belag::karten`).
pub const KARTEN3D_BYTES: usize = 16;
pub const ZUG_BYTES: usize = 16;
pub const ECKE_BYTES: usize = 32;
/// Ein Teilchen im Abschnitt `TEILCHEN3D` (Funken): `f32 x, y, z, halbe Größe`, `u8 r, g, b, a`.
pub const TEILCHEN3D_BYTES: usize = 20;
/// Abschnitt `ZUSATZ_TEILCHEN` (Funken „Regen“): je Teilchen `f32 strich x, y, z` (halbe Strichachse in Welt), `u32 merkmale`.
pub const ZUSATZ_TEILCHEN_BYTES: usize = 16;
/// Abschnitt `HIMMELSZELT` (H-K11b): fester Block, Aufbau gleich dem Uniform-Block der Glut (`herd/README.md` §4).
pub const HIMMELSZELT_BYTES: usize = 208;
/// Kantenlänge der Shadow-Map (Texel), mit der der Kern die Lichtkamera einrastet.
pub const SCHATTEN_GROESSE: u32 = 2048;
pub const MAX_LICHTER: usize = 8;
/// Weiteste Entfernung von der Kamera, bis zu der die Sonne Schatten wirft.
pub const SCHATTEN_WEITE: f64 = 60.0;

pub mod abschnitt {
    pub const SCHRIFT: u32 = 1;
    pub const ATLAS_SEITE: u32 = 2;
    pub const ATLAS_STUECK: u32 = 3;
    pub const NETZ: u32 = 4;
    /// Eigene Textur aus einem Teigling (PROJEKTE PD1): einmal je Bild, nur wenn `bildchen_teigling` benutzt wurde
    pub const TEXTUR: u32 = 5;
    pub const SZENE: u32 = 10;
    pub const INST3D: u32 = 11;
    pub const ZUEGE3D: u32 = 12;
    pub const INST2D: u32 = 13;
    /// 3D-Teilchen (`Funken`), nur wenn welche sichtbar sind
    pub const TEILCHEN3D: u32 = 14;
    /// Himmelszelt (Skybox, H-K11b), nur wenn eines an einem wachen Teil hängt
    pub const HIMMELSZELT: u32 = 15;
    /// Viele Lichter (Clustered Forward, `crate::lichter`): nur bei mehr als 8 Punktlichtern oder einem Spot
    pub const LICHTER: u32 = 16;
    /// Stimmung (HDR, Bloom, Tonkurve, Höhennebel): nur wenn eine wache `Stimmung` gilt
    pub const STIMMUNG: u32 = 17;
    /// Material-Zusatz je 3D-Instanz (16 B, gleiche Reihenfolge wie INST3D): nur wenn eine Instanz einen hat
    pub const ZUSATZ3D: u32 = 18;
    /// Zusatz je 3D-Teilchen (16 B, gleiche Reihenfolge wie TEILCHEN3D): nur wenn ein Teilchen gestreckt oder beleuchtet ist
    pub const ZUSATZ_TEILCHEN: u32 = 19;
    /// Schatten für Punkt-/Spotlichter und Sonnen-Kaskaden (H-K18, `crate::lichter::schatten_abschnitt`): nur wenn ein Licht
    /// `schattenGuete` ≠ aus wirft, die Sonne Kaskaden hat oder ihr `schattenWeich` ≠ 1 ist
    pub const SCHATTENLICHTER: u32 = 20;
    /// Zweite Zellen-Tabelle für die gespiegelte Kamera (H-K21, `crate::lichter::abschnitt`): nur bei `Stimmung.spiegelGuete`
    /// voll und vorhandenem `LICHTER`, direkt dahinter
    pub const LICHTER_SPIEGEL: u32 = 21;
    /// Bildschirmraum (H-K24, `crate::komponenten::stimmung::bildraum_abschnitt`): Verdeckung (SSAO) und Bildraum-Spiegelung
    /// (SSR), 32 B; nur wenn die geltende `Stimmung` `verdeckung` oder `bildspiegel` > 0 hat
    pub const BILDRAUM: u32 = 22;
    /// Belag-Karten je 3D-Instanz (H-K26, 16 B, gleiche Reihenfolge wie INST3D): nur wenn eine geschriebene Instanz welche hat
    pub const KARTEN3D: u32 = 23;
}

pub mod flag {
    /// 3D-Durchgänge vorhanden
    pub const DREI_D: u32 = 1;
    /// Schattendurchgang vorhanden
    pub const SCHATTEN: u32 = 2;
    /// Himmelsverlauf zeichnen (sonst nur Hintergrundfarbe)
    pub const HIMMEL: u32 = 4;
}

/// Art einer 2D-Instanz.
pub mod flach_art {
    pub const RECHTECK: u32 = 1;
    pub const KREIS: u32 = 2;
    pub const BILD: u32 = 3;
    pub const GLYPHE: u32 = 4;
    /// Dreieck (`Vieleck`, H-K3b): Ecken direkt in Spielfeld-Pixeln – `m00 m10` = Ecke B, `m01 m11` = Ecke C, `tx ty` = Ecke A;
    /// `h` = 0, `p0` = Maske der Außenkanten (Bit 0 = A→B, 1 = B→C, 2 = C→A; nur dort Kantenglättung), `p1` = 0 (frei)
    pub const DREIECK: u32 = 5;
    /// Bild aus einer eigenen Textur (PROJEKTE PD1): `seite` = Textur-ID, `u0 v0 u1 v1` in Pixeln der Textur (Stufe 0)
    pub const TEXTURBILD: u32 = 6;
}

/// Art eines 3D-Zugs.
pub mod zug {
    pub const FEST: u32 = 1;
    pub const SCHATTEN: u32 = 2;
    pub const DURCH: u32 = 3;
    /// Schatten in eine Ansicht des Abschnitts `SCHATTENLICHTER` (H-K18): `art = ANSICHT | ansicht << 8` (Bits 0–7 = Art,
    /// darüber die Nummer der Ansicht – erst die Kaskaden, dann die Kacheln); Instanzen sind eigene Kopien hinter `DURCH`
    pub const ANSICHT: u32 = 4;
    /// Merkmal an `FEST`/`DURCH` (H-K26): Rückseiten weglassen – Instanzen mit Karten (`KARTEN3D` ≠ 0) und `beidseitig` nein,
    /// einseitig wie glTF; ohne Karten zeichnet Herd wie seit v1 beide Seiten
    pub const EINSEITIG: u32 = 1 << 16;
    /// Merkmal zu `EINSEITIG`: Welt-Matrix mit Determinante < 0 (gespiegelt) – Umlaufsinn gedreht, die Glut lässt die Vorderseiten
    /// (im Bild) weg
    pub const GEDREHT: u32 = 1 << 17;
    /// Art ohne Merkmale
    pub const ART: u32 = 0xFFFF;
}

/// Ein 3D-Körper im Bildbau.
#[derive(Clone, Copy, Debug)]
pub struct Koerper3 {
    pub teil: u32,
    pub netz: u32,
    pub m: [f64; 12],
    pub farbe: u32,
    pub glanz: f64,
    pub leuchten: f64,
    pub uv: [u16; 4],
    /// Atlas-Seite der Textur, −1 = keine
    pub seite: i64,
    pub wirft: bool,
    pub min: [f64; 3],
    pub max: [f64; 3],
    /// Material-Zusatz (`Belag`: Relief, Kachel, Metall, Merkmale) – alles 0 = wie v1, Abschnitt `ZUSATZ3D` nur wenn nicht 0
    pub zusatz: [u32; 4],
    /// Karten (H-K26, `Belag`: Normal-, Stoff-, Leucht-Karte, Schwelle, beidseitig) – alles 0 = wie vorher, Abschnitt `KARTEN3D`
    /// nur wenn nicht 0
    pub karten: [u32; 4],
}

impl Koerper3 {
    /// Merkmale des Zugs (`zug::EINSEITIG`, `zug::GEDREHT`): einseitig nur mit Karten und ohne `beidseitig` (Wort 1, Bit 24)
    pub fn seiten(&self) -> u32 {
        if self.karten == [0; 4] || self.karten[1] & 1 << 24 != 0 {
            return 0;
        }
        let m = &self.m;
        let det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
        zug::EINSEITIG | if det < 0.0 { zug::GEDREHT } else { 0 }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct LichtB {
    pub teil: u32,
    pub sonne: bool,
    pub pos: [f64; 3],
    pub farbe: u32,
    pub staerke: f64,
    pub reichweite: f64,
    pub schatten: bool,
    /// Spot („viele Lichter“): Richtung (Welt, nicht normiert), halber Öffnungswinkel in Grad (0 = rundum), weicher Rand
    pub richtung: [f64; 3],
    pub kegel: f64,
    pub kegel_rand: f64,
    /// H-K18: Schatten-Güte (0 aus, 1 grob, 2 mittel, 3 fein; Punkt/Spot), Zeltfilter-Radius in Texeln (1 = v1),
    /// Kaskaden (Sonne, 1 = v1) und Schattenweite (Sonne, 0 = wie v1)
    pub guete: u32,
    pub weich: f64,
    pub kaskaden: u32,
    pub weite: f64,
}

/// Ein 3D-Teilchen im Bildbau (`Funken`): Weltlage, halbe Größe, Farbe, Mischart.
#[derive(Clone, Copy, Debug)]
pub struct Teilchen3 {
    pub pos: [f64; 3],
    pub r: f64,
    pub farbe: u32,
    /// `false` = leuchtend (additiv), `true` = deckend (gemischt, von hinten nach vorn)
    pub deckend: bool,
    /// Funken „Regen“: halbe Strichachse (Welt; 0 = rundes Teilchen) – `pos` ist die Mitte des Strichs
    pub strich: [f64; 3],
    /// Anteil Beleuchtung durch Umgebung und Lichter · 255 (0 = Eigenfarbe wie v1)
    pub licht: u32,
}

/// Das geltende `Himmelszelt` im Bildbau (wache Komponente mit der kleinsten Teil-ID).
#[derive(Clone, Copy, Debug)]
pub struct HimmelszeltB {
    pub teil: u32,
    pub oben: u32,
    pub horizont: u32,
    pub boden: u32,
    /// Durchmesser der Sonnenscheibe in Grad (0 = aus)
    pub sonnenscheibe: f64,
    pub sterne: f64,
    /// je Seite (rechts, links, oben, unten, vorn, hinten): Atlas-Rechteck und Kennwort wie `INST3D.textur` (0 = prozedural)
    pub seiten: [([u16; 4], u32); 6],
}

#[derive(Clone, Copy, Debug)]
pub struct KameraB {
    pub teil: u32,
    pub m: [f64; 12],
    pub sicht: f64,
    pub nah: f64,
    pub fern: f64,
}

/// Sammelt die Bildbeiträge der Komponenten (Puffer werden über Bilder hinweg wiederverwendet).
#[derive(Default)]
pub struct Bildbau {
    pub breite: f64,
    pub hoehe: f64,
    pub schrift: Option<Schrift>,
    flach_daten: Vec<u8>,
    flach_ordnung: Vec<(u64, u32)>,
    pub koerper: Vec<Koerper3>,
    pub lichter: Vec<LichtB>,
    pub kameras: Vec<KameraB>,
    pub teilchen3d: Vec<Teilchen3>,
    /// Himmelszelt (H-K11b): nur das geltende (kleinste wache Teil-ID); `None` = Verlauf aus `herd.himmel` wie v1
    pub himmelszelt: Option<HimmelszeltB>,
    /// Sicht des aktiven `Blick` (H-K1), vor den Bildbeiträgen bestimmt; `None` = Spielfeld wie v1
    pub blick: Option<Sicht>,
    // Arbeitslisten
    sicht: Vec<bool>,
    fest: Vec<(u64, u32)>,
    durch: Vec<(u64, u32, u32)>,
    teilchen_ordnung: Vec<(u64, u32)>,
}

/// f64 → f32 fürs Paket: nicht endlich → 0, −0 → +0.
#[inline]
pub fn f32w(x: f64) -> f32 {
    let y = x as f32;
    if y.is_finite() && y != 0.0 {
        y
    } else {
        0.0
    }
}

#[inline]
fn betrag(x: f64) -> f64 {
    if x < 0.0 {
        -x
    } else {
        x
    }
}

#[inline]
pub(crate) fn put_f32(b: &mut Vec<u8>, x: f64) {
    b.extend_from_slice(&f32w(x).to_le_bytes());
}
#[inline]
pub(crate) fn put_u32(b: &mut Vec<u8>, x: u32) {
    b.extend_from_slice(&x.to_le_bytes());
}
#[inline]
fn put_u16(b: &mut Vec<u8>, x: u16) {
    b.extend_from_slice(&x.to_le_bytes());
}

impl Bildbau {
    fn leeren(&mut self, breite: u32, hoehe: u32) {
        self.breite = breite as f64;
        self.hoehe = hoehe as f64;
        self.flach_daten.clear();
        self.flach_ordnung.clear();
        self.koerper.clear();
        self.lichter.clear();
        self.kameras.clear();
        self.teilchen3d.clear();
        self.himmelszelt = None;
        self.blick = None;
        if self.schrift.is_none() {
            self.schrift = Schrift::eingebettet();
        }
    }

    /// Eine 2D-Instanz: lokale Box (Mitte `c`, halbe Ausdehnung `h`) unter der 2D-Welt-Matrix `m`.
    /// `p` = Rundung/Umriss (Rechteck, Kreis), `uv` = Atlas-Rechteck (Pixel) für Bild/Glyphe.
    #[allow(clippy::too_many_arguments)]
    /// Mit aktivem `Blick` und `ebene < festAb` gilt `m` in Weltlage und wird zuerst mit der Sicht-Matrix multipliziert.
    pub fn flach(&mut self, ebene: i32, teil: u32, m: &[f64; 12], c: [f64; 2], h: [f64; 2], art: u32, farbe: u32, p: [f64; 2], uv: [u16; 4], seite: u32) {
        if farbe & 0xFF == 0 {
            return;
        }
        let gesehen;
        let m = match &self.blick {
            Some(b) if (ebene as f64) < b.fest_ab => {
                gesehen = mal_2d(&b.m, m);
                &gesehen
            }
            _ => m,
        };
        let tx = m[0] * c[0] + m[2] * c[1] + m[4];
        let ty = m[1] * c[0] + m[3] * c[1] + m[5];
        if !(tx.is_finite() && ty.is_finite()) {
            return;
        }
        // Spielfeld-Culling (1 Pixel Rand für die Kantenglättung)
        let rand = if art == flach_art::RECHTECK || art == flach_art::KREIS { 1.0 } else { 0.0 };
        let ex = betrag(m[0]) * (h[0] + rand) + betrag(m[2]) * (h[1] + rand);
        let ey = betrag(m[1]) * (h[0] + rand) + betrag(m[3]) * (h[1] + rand);
        if tx + ex < 0.0 || tx - ex > self.breite || ty + ey < 0.0 || ty - ey > self.hoehe {
            return;
        }
        let schluessel = (((ebene as i64) + (1i64 << 31)) as u64) << 32 | teil as u64;
        self.flach_ordnung.push((schluessel, self.flach_ordnung.len() as u32));
        let b = &mut self.flach_daten;
        put_f32(b, m[0]);
        put_f32(b, m[1]);
        put_f32(b, m[2]);
        put_f32(b, m[3]);
        put_f32(b, tx);
        put_f32(b, ty);
        put_f32(b, h[0]);
        put_f32(b, h[1]);
        put_f32(b, p[0]);
        put_f32(b, p[1]);
        b.extend_from_slice(&farbe.to_be_bytes());
        if art == flach_art::BILD && seite & TEXTUR_MARKE != 0 {
            put_u32(b, flach_art::TEXTURBILD | (seite & 0xFF_FFFF) << 8);
        } else {
            put_u32(b, art | (seite & 0xFF) << 8);
        }
        for x in uv {
            put_u16(b, x);
        }
    }
}

impl Bildbau {
    /// 2D-Matrix, mit der ein Bildbeitrag in Spielfeld-Pixel rechnet: mit aktivem `Blick` und `ebene < festAb` Sicht · `m`, sonst `m`
    /// (wie in [`Bildbau::flach`]; für Beiträge, die ihre Ecken selbst umrechnen).
    pub fn sicht_matrix(&self, ebene: i32, m: &[f64; 12]) -> [f64; 12] {
        match &self.blick {
            Some(b) if (ebene as f64) < b.fest_ab => mal_2d(&b.m, m),
            _ => *m,
        }
    }

    /// Ein Dreieck (2D-Art `DREIECK`, H-K3b) mit Ecken `e` in Spielfeld-Pixeln (Sicht schon eingerechnet, siehe
    /// [`Bildbau::sicht_matrix`]) und Maske der Außenkanten (Bit 0 = e0→e1, 1 = e1→e2, 2 = e2→e0). Sortiert wie alle 2D-Instanzen
    /// nach (ebene, ID), innerhalb eines Teils in Aufrufreihenfolge. Culling am umschließenden Rechteck (1 Pixel Rand).
    pub fn dreieck(&mut self, ebene: i32, teil: u32, e: [[f64; 2]; 3], maske: u32, farbe: u32) {
        if farbe & 0xFF == 0 {
            return;
        }
        if !e.iter().all(|p| p[0].is_finite() && p[1].is_finite()) {
            return;
        }
        let (mut lo, mut hi) = (e[0], e[0]);
        for p in &e[1..] {
            for i in 0..2 {
                if p[i] < lo[i] {
                    lo[i] = p[i];
                }
                if p[i] > hi[i] {
                    hi[i] = p[i];
                }
            }
        }
        if hi[0] + 1.0 < 0.0 || lo[0] - 1.0 > self.breite || hi[1] + 1.0 < 0.0 || lo[1] - 1.0 > self.hoehe {
            return;
        }
        let schluessel = (((ebene as i64) + (1i64 << 31)) as u64) << 32 | teil as u64;
        self.flach_ordnung.push((schluessel, self.flach_ordnung.len() as u32));
        let b = &mut self.flach_daten;
        put_f32(b, e[1][0]);
        put_f32(b, e[1][1]);
        put_f32(b, e[2][0]);
        put_f32(b, e[2][1]);
        put_f32(b, e[0][0]);
        put_f32(b, e[0][1]);
        put_f32(b, 0.0);
        put_f32(b, 0.0);
        put_f32(b, (maske & 7) as f64);
        put_f32(b, 0.0);
        b.extend_from_slice(&farbe.to_be_bytes());
        put_u32(b, flach_art::DREIECK);
        for _ in 0..4 {
            put_u16(b, 0);
        }
    }

    /// Sichtbares Weltrechteck (min, max) des 2D-Spielfelds: mit aktivem `Blick` die (gedrehte, achsenparallel umschlossene,
    /// geklemmte) Sicht, sonst das Spielfeld selbst. Gilt nach dem Bestimmen der Sicht in `baue` (für Bildbeiträge, H-K10).
    pub fn sicht_welt(&self) -> ([f64; 2], [f64; 2]) {
        match &self.blick {
            Some(b) => (b.welt_min, b.welt_max),
            None => ([0.0, 0.0], [self.breite, self.hoehe]),
        }
    }
}

/// Was die Glut schon hat (für Ressourcen-Deltas).
#[derive(Clone, Copy, Debug, Default)]
pub struct Gesendet {
    pub schrift: bool,
    pub seiten: u32,
    pub ressourcen: usize,
}

// ------------------------------------------------------------------ Matrizen (f64, spaltenweise wie WGSL)

pub(crate) type M4 = [f64; 16];

pub(crate) fn m4_mal(a: &M4, b: &M4) -> M4 {
    let mut r = [0.0; 16];
    for s in 0..4 {
        for z in 0..4 {
            r[s * 4 + z] = a[z] * b[s * 4] + a[4 + z] * b[s * 4 + 1] + a[8 + z] * b[s * 4 + 2] + a[12 + z] * b[s * 4 + 3];
        }
    }
    r
}

pub(crate) fn v_norm(v: [f64; 3], ersatz: [f64; 3]) -> [f64; 3] {
    let l = libm::sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if l > 1e-12 && l.is_finite() {
        [v[0] / l, v[1] / l, v[2] / l]
    } else {
        ersatz
    }
}
fn kreuz(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
pub(crate) fn punkt(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Rechtshändige Ansichtsmatrix: Auge, Blickrichtung (normiert), oben.
pub(crate) fn blick(auge: [f64; 3], f: [f64; 3], oben: [f64; 3]) -> M4 {
    let mut o = v_norm(oben, [0.0, 1.0, 0.0]);
    if betrag(punkt(f, o)) > 0.999 {
        o = if betrag(f[1]) > 0.5 { [0.0, 0.0, -1.0] } else { [0.0, 1.0, 0.0] };
    }
    let s = v_norm(kreuz(f, o), [1.0, 0.0, 0.0]);
    let u = kreuz(s, f);
    [
        s[0], u[0], -f[0], 0.0, //
        s[1], u[1], -f[1], 0.0, //
        s[2], u[2], -f[2], 0.0, //
        -punkt(s, auge), -punkt(u, auge), punkt(f, auge), 1.0,
    ]
}

/// Perspektive (Tiefe 0 … 1 wie WebGPU).
fn perspektive(sicht_grad: f64, seiten: f64, nah: f64, fern: f64) -> M4 {
    let f = 1.0 / libm::tan(sicht_grad * crate::welt::GRAD * 0.5);
    let mut r = [0.0; 16];
    r[0] = f / seiten;
    r[5] = f;
    r[10] = fern / (nah - fern);
    r[11] = -1.0;
    r[14] = nah * fern / (nah - fern);
    r
}

/// Orthografisch (Tiefe 0 … 1), `nah`/`fern` als Abstände entlang −z.
fn ortho(l: f64, r: f64, u: f64, o: f64, nah: f64, fern: f64) -> M4 {
    let mut m = [0.0; 16];
    m[0] = 2.0 / (r - l);
    m[5] = 2.0 / (o - u);
    m[10] = 1.0 / (nah - fern);
    m[12] = -(r + l) / (r - l);
    m[13] = -(o + u) / (o - u);
    m[14] = nah / (nah - fern);
    m[15] = 1.0;
    m
}

pub(crate) fn transf(m: &M4, p: [f64; 3]) -> [f64; 3] {
    [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ]
}

fn ecken(mi: [f64; 3], ma: [f64; 3]) -> [[f64; 3]; 8] {
    let mut e = [[0.0; 3]; 8];
    for (k, p) in e.iter_mut().enumerate() {
        *p = [if k & 1 == 0 { mi[0] } else { ma[0] }, if k & 2 == 0 { mi[1] } else { ma[1] }, if k & 4 == 0 { mi[2] } else { ma[2] }];
    }
    e
}

/// Sechs Ebenen (a, b, c, d) des Sichtkörpers aus einer Ansicht·Projektion (Tiefe 0 … 1).
fn ebenen(vp: &M4) -> [[f64; 4]; 6] {
    let z = |i: usize| [vp[i], vp[4 + i], vp[8 + i], vp[12 + i]];
    let (r0, r1, r2, r3) = (z(0), z(1), z(2), z(3));
    let plus = |a: [f64; 4], b: [f64; 4]| [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
    let minus = |a: [f64; 4], b: [f64; 4]| [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
    [plus(r3, r0), minus(r3, r0), plus(r3, r1), minus(r3, r1), r2, minus(r3, r2)]
}

fn im_sichtkoerper(e: &[[f64; 4]; 6], mi: [f64; 3], ma: [f64; 3]) -> bool {
    for p in e {
        let x = if p[0] >= 0.0 { ma[0] } else { mi[0] };
        let y = if p[1] >= 0.0 { ma[1] } else { mi[1] };
        let z = if p[2] >= 0.0 { ma[2] } else { mi[2] };
        if p[0] * x + p[1] * y + p[2] * z + p[3] < 0.0 {
            return false;
        }
    }
    true
}

/// f64 → u64 mit gleicher Ordnung (für Sortierschlüssel).
pub(crate) fn ordnungs_bits(x: f64) -> u64 {
    let x = if x.is_nan() { 0.0 } else { x + 0.0 };
    let b = x.to_bits();
    if b & (1 << 63) != 0 {
        !b
    } else {
        b | (1 << 63)
    }
}

pub(crate) fn lin4(rgba: u32, k: f64) -> [f64; 4] {
    let l = farbe::rgb_linear(rgba);
    [l[0] * k, l[1] * k, l[2] * k, 0.0]
}

pub(crate) fn put_v4(b: &mut Vec<u8>, v: [f64; 4]) {
    for x in v {
        put_f32(b, x);
    }
}

pub(crate) fn abschnitt_beginn(b: &mut Vec<u8>, art: u32) -> usize {
    put_u32(b, art);
    put_u32(b, 0);
    b.len()
}
pub(crate) fn abschnitt_ende(b: &mut Vec<u8>, start: usize) {
    let len = (b.len() - start) as u32;
    b[start - 4..start].copy_from_slice(&len.to_le_bytes());
    while b.len() % 4 != 0 {
        b.push(0);
    }
}

fn ressourcen_deltas(b: &mut Vec<u8>, res: &Ressourcen, g: &mut Gesendet, bau: &Bildbau) -> u32 {
    let mut n = 0;
    if !g.schrift {
        if let Some(s) = &bau.schrift {
            let st = abschnitt_beginn(b, abschnitt::SCHRIFT);
            put_u16(b, s.breite as u16);
            put_u16(b, s.hoehe as u16);
            b.extend_from_slice(&s.em.to_le_bytes());
            b.extend_from_slice(&s.spanne.to_le_bytes());
            b.extend_from_slice(s.pixel);
            abschnitt_ende(b, st);
            n += 1;
        }
        g.schrift = true;
    }
    while g.seiten < res.seiten() {
        let st = abschnitt_beginn(b, abschnitt::ATLAS_SEITE);
        put_u32(b, g.seiten);
        put_u16(b, crate::ressourcen::SEITE as u16);
        put_u16(b, crate::ressourcen::SEITE as u16);
        abschnitt_ende(b, st);
        g.seiten += 1;
        n += 1;
    }
    while g.ressourcen < res.liste.len() {
        let id = g.ressourcen as u32 + 1;
        match &res.liste[g.ressourcen] {
            Ressource::Form(netz) => {
                let st = abschnitt_beginn(b, abschnitt::NETZ);
                put_u32(b, id);
                put_u32(b, netz.ecken_anzahl);
                put_u32(b, netz.index_anzahl);
                for x in [netz.min.x, netz.min.y, netz.min.z, netz.max.x, netz.max.y, netz.max.z] {
                    b.extend_from_slice(&crate::mathe::fin(x).to_le_bytes());
                }
                b.extend_from_slice(&netz.ecken);
                b.extend_from_slice(&netz.indizes);
                abschnitt_ende(b, st);
            }
            Ressource::Bildchen(bi) if bi.textur.is_some() => {
                let t = bi.textur.as_ref().unwrap();
                let st = abschnitt_beginn(b, abschnitt::TEXTUR);
                put_u32(b, id);
                b.push(t.format);
                b.push(1 + t.weitere.len() as u8);
                put_u16(b, bi.breite as u16);
                put_u16(b, bi.hoehe as u16);
                for s in core::iter::once(&bi.rgba).chain(t.weitere.iter()) {
                    put_u32(b, s.len() as u32);
                    b.extend_from_slice(s);
                }
                abschnitt_ende(b, st);
            }
            Ressource::Bildchen(bi) => {
                let st = abschnitt_beginn(b, abschnitt::ATLAS_STUECK);
                put_u32(b, bi.seite);
                put_u16(b, bi.x as u16);
                put_u16(b, bi.y as u16);
                put_u16(b, bi.breite as u16);
                put_u16(b, bi.hoehe as u16);
                b.extend_from_slice(&bi.rgba);
                abschnitt_ende(b, st);
            }
        }
        g.ressourcen += 1;
        n += 1;
    }
    n
}

/// Baut das Bildpaket der Welt in `aus` (vorher geleert). Ruft die Bildbeiträge aller Komponenten.
pub fn baue(w: &mut Welt, bau: &mut Bildbau, g: &mut Gesendet, aus: &mut Vec<u8>, bildnummer: u32) {
    w.aktualisiere_alle();
    bau.leeren(w.breite, w.hoehe);
    bau.blick = blick::aktive_sicht(w, bau.breite, bau.hoehe);
    let arten = w.arten;
    for (a, art) in arten.iter().enumerate() {
        if let Some(f) = art.bild {
            f(w, &w.speicher[a], bau);
        }
    }

    aus.clear();
    aus.extend_from_slice(&MAGIE);
    put_u32(aus, VERSION);
    put_u32(aus, bildnummer);
    put_u16(aus, w.breite as u16);
    put_u16(aus, w.hoehe as u16);
    put_u32(aus, 0); // Flags
    put_u32(aus, 0); // Abschnitte
    put_u32(aus, 0); // Länge
    put_u32(aus, 0);
    let mut abschnitte = ressourcen_deltas(aus, &w.ressourcen, g, bau);
    let zelt = bau.himmelszelt;
    let mut flags = if w.himmel.is_some() || zelt.is_some() { flag::HIMMEL } else { 0 };

    // ---------------- 3D ----------------
    let seiten = if w.hoehe > 0 { w.breite as f64 / w.hoehe as f64 } else { 1.0 };
    let kam = bau.kameras.iter().min_by_key(|k| k.teil).copied();
    let (auge, vorn, oben, sicht, nah, fern) = match kam {
        Some(k) => {
            let m = &k.m;
            (
                [m[3], m[7], m[11]],
                v_norm([-m[2], -m[6], -m[10]], [0.0, 0.0, -1.0]),
                v_norm([m[1], m[5], m[9]], [0.0, 1.0, 0.0]),
                k.sicht,
                k.nah,
                k.fern,
            )
        }
        None => ([0.0, 3.0, 8.0], v_norm([0.0, -3.0, -8.0], [0.0, 0.0, -1.0]), [0.0, 1.0, 0.0], 60.0, 0.1, 500.0),
    };
    let fern = if fern > nah * 1.001 { fern } else { nah * 1.001 };
    let ansicht = blick(auge, vorn, oben);
    let vp = m4_mal(&perspektive(sicht, seiten, nah, fern), &ansicht);
    let sk = ebenen(&vp);
    // H-K21: Spiegelbild voll → was nur im Spiegel zu sehen ist, zählt auch als sichtbar (Körper, Teilchen, Schattenlichter)
    let spiegel = crate::komponenten::stimmung::spiegel_voll(w);
    let sk_spiegel = spiegel.map(|h| crate::lichter::ebenen_gespiegelt(&sk, h));

    // Lichter: Sonne = kleinste ID; Punktlichter = die 8 nächsten zur Kamera (Abstand, dann ID)
    let sonne = bau.lichter.iter().filter(|l| l.sonne).min_by_key(|l| l.teil).copied();
    let mut punkte: Vec<(u64, LichtB)> = bau
        .lichter
        .iter()
        .filter(|l| !l.sonne && l.staerke > 0.0)
        .map(|l| {
            let d = [l.pos[0] - auge[0], l.pos[1] - auge[1], l.pos[2] - auge[2]];
            (ordnungs_bits(punkt(d, d)), *l)
        })
        .collect();
    punkte.sort_unstable_by_key(|(d, l)| (*d, l.teil));
    punkte.truncate(MAX_LICHTER);

    let n3 = bau.koerper.len();
    bau.sicht.clear();
    for k in &bau.koerper {
        bau.sicht.push(im_sichtkoerper(&sk, k.min, k.max) || sk_spiegel.as_ref().is_some_and(|e| im_sichtkoerper(e, k.min, k.max)));
    }

    // Sonnenschatten: Lichtkamera aus sichtbarem Bereich (Kamera bis SCHATTEN_WEITE ∩ sichtbare Szene)
    let l = match &sonne {
        Some(s) => v_norm(s.pos, v_norm([0.5, 1.0, 0.3], [0.0, 1.0, 0.0])),
        None => v_norm([0.5, 1.0, 0.3], [0.0, 1.0, 0.0]),
    };
    let mut licht_vp: M4 = [0.0; 16];
    licht_vp[0] = 1.0;
    licht_vp[5] = 1.0;
    licht_vp[10] = 1.0;
    licht_vp[15] = 1.0;
    let mut schatten = false;
    let mut texel_welt = 0.0;
    let mut tiefe_spanne = 1.0;
    let schatten_an = sonne.map(|s| s.schatten && s.staerke > 0.0).unwrap_or(false);
    // H-K18: Kaskaden (1 = v1-Verfahren), Schattenweite (0 = wie v1), Weichheit (1 = v1-Zeltfilter)
    let sonne_k = sonne.map(|s| s.kaskaden.clamp(1, crate::lichter::MAX_KASKADEN as u32)).unwrap_or(1);
    let sonne_weite = sonne.map(|s| s.weite).unwrap_or(0.0);
    let sonne_weich = sonne.map(|s| s.weich).unwrap_or(1.0);
    let mut kaskaden: Vec<Kaskade> = Vec::new();
    let mut licht_box: Option<([f64; 2], [f64; 2])> = None;
    let oben_l = if betrag(l[1]) > 0.99 { [0.0, 0.0, 1.0] } else { [0.0, 1.0, 0.0] };
    let lv = blick([0.0; 3], [-l[0], -l[1], -l[2]], oben_l);
    if schatten_an {
        // Empfänger: sichtbare Körper
        let mut smin = [f64::MAX; 3];
        let mut smax = [f64::MIN; 3];
        let mut weiteste: f64 = 0.0;
        for (i, k) in bau.koerper.iter().enumerate() {
            if !bau.sicht[i] {
                continue;
            }
            for e in ecken(k.min, k.max) {
                let p = transf(&lv, e);
                for a in 0..3 {
                    if p[a] < smin[a] {
                        smin[a] = p[a];
                    }
                    if p[a] > smax[a] {
                        smax[a] = p[a];
                    }
                }
                let d = [e[0] - auge[0], e[1] - auge[1], e[2] - auge[2]];
                let d = libm::sqrt(punkt(d, d));
                if d > weiteste {
                    weiteste = d;
                }
            }
        }
        // H-K18: `schattenWeite` > 0 ersetzt die Reichweite (sonst wie v1: Empfänger, SCHATTEN_WEITE, Nebel)
        let mut d = if weiteste < SCHATTEN_WEITE { weiteste } else { SCHATTEN_WEITE };
        if let Some((_, von, bis)) = w.nebel {
            if bis > von && bis < d {
                d = bis;
            }
        }
        if sonne_weite > 0.0 {
            d = sonne_weite;
        }
        if d > fern {
            d = fern;
        }
        if d < nah + 0.1 {
            d = nah + 0.1;
        }
        let rechts = v_norm(kreuz(vorn, oben), [1.0, 0.0, 0.0]);
        let hoch = kreuz(rechts, vorn);
        let th = libm::tan(sicht * crate::welt::GRAD * 0.5);
        let mut fmin = [f64::MAX; 3];
        let mut fmax = [f64::MIN; 3];
        for z in [nah, d] {
            let (hh, hb) = (th * z, th * z * seiten);
            for (sx, sy) in [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)] {
                let p = [
                    auge[0] + vorn[0] * z + rechts[0] * hb * sx + hoch[0] * hh * sy,
                    auge[1] + vorn[1] * z + rechts[1] * hb * sx + hoch[1] * hh * sy,
                    auge[2] + vorn[2] * z + rechts[2] * hb * sx + hoch[2] * hh * sy,
                ];
                let q = transf(&lv, p);
                for a in 0..3 {
                    if q[a] < fmin[a] {
                        fmin[a] = q[a];
                    }
                    if q[a] > fmax[a] {
                        fmax[a] = q[a];
                    }
                }
            }
        }
        if sonne_k >= 2 {
            kaskaden = sonnen_kaskaden(bau, &lv, sonne_k, nah, d, auge, vorn, rechts, hoch, th, seiten);
        }
        let x0 = if smin[0] > fmin[0] { smin[0] } else { fmin[0] };
        let x1 = if smax[0] < fmax[0] { smax[0] } else { fmax[0] };
        let y0 = if smin[1] > fmin[1] { smin[1] } else { fmin[1] };
        let y1 = if smax[1] < fmax[1] { smax[1] } else { fmax[1] };
        if sonne_k < 2 && x1 > x0 && y1 > y0 {
            // Würfel: Größe auf Viertel-Zweierpotenzen, Mitte auf Texel einrasten (ruhige Schattenkanten)
            let g = (if x1 - x0 > y1 - y0 { x1 - x0 } else { y1 - y0 }) * 1.04;
            let g = if g > 0.01 { g } else { 0.01 };
            let s_ = libm::exp2(libm::ceil(libm::log2(g) * 4.0) / 4.0);
            let texel = s_ / SCHATTEN_GROESSE as f64;
            let cx = libm::floor((x0 + x1) * 0.5 / texel) * texel;
            let cy = libm::floor((y0 + y1) * 0.5 / texel) * texel;
            let (bx0, bx1, by0, by1) = (cx - s_ * 0.5, cx + s_ * 0.5, cy - s_ * 0.5, cy + s_ * 0.5);
            // Tiefe: Empfänger und alle Werfer, die in die Box fallen
            let mut zmin = smin[2];
            let mut zmax = smax[2];
            for k in bau.koerper.iter() {
                if !k.wirft || k.farbe & 0xFF != 0xFF {
                    continue;
                }
                let mut a = [f64::MAX; 3];
                let mut b = [f64::MIN; 3];
                for e in ecken(k.min, k.max) {
                    let p = transf(&lv, e);
                    for i in 0..3 {
                        if p[i] < a[i] {
                            a[i] = p[i];
                        }
                        if p[i] > b[i] {
                            b[i] = p[i];
                        }
                    }
                }
                if b[0] < bx0 || a[0] > bx1 || b[1] < by0 || a[1] > by1 {
                    continue;
                }
                if b[2] > zmax {
                    zmax = b[2];
                }
            }
            if zmin > zmax {
                zmin = zmax - 1.0;
            }
            let rand = {
                let r = (zmax - zmin) * 0.01;
                if r > 0.05 {
                    r
                } else {
                    0.05
                }
            };
            let nah_l = -zmax - rand;
            let fern_l = -zmin + rand;
            licht_vp = m4_mal(&ortho(bx0, bx1, by0, by1, nah_l, fern_l), &lv);
            schatten = true;
            texel_welt = texel;
            tiefe_spanne = fern_l - nah_l;
            licht_box = Some(([bx0, by0], [bx1, by1]));
        }
    }
    // H-K18: Sonnen-Kaskaden ersetzen das v1-Verfahren (SZENE trägt dann Kaskade 0, gezeichnet über ANSICHT-Züge)
    if let Some(k) = kaskaden.first() {
        licht_vp = k.ansicht.vp;
        texel_welt = k.ansicht.texel;
    }
    let sonne_schatten = schatten || !kaskaden.is_empty();
    // Punkt-/Spot-Kacheln hinter den Sonnen-Schichten (v1: eine, Kaskaden: je eine)
    let schatten_wahl = crate::lichter::schatten_waehlen(&bau.lichter, &sk, sk_spiegel.as_ref(), auge, if schatten { 1 } else { kaskaden.len() as u32 });

    // Sortieren: undurchsichtig nach (Netz, Gruppe, Teil), Gruppe 0 = wirft, unsichtbar (nur Schatten),
    // 1 = wirft, sichtbar, 2 = wirft nicht, sichtbar. Durchsichtig: von hinten nach vorn, dann Teil.
    bau.fest.clear();
    bau.durch.clear();
    for i in 0..n3 {
        let k = &bau.koerper[i];
        let sichtbar = bau.sicht[i];
        if k.farbe & 0xFF != 0xFF {
            if sichtbar {
                let mitte = [(k.min[0] + k.max[0]) * 0.5, (k.min[1] + k.max[1]) * 0.5, (k.min[2] + k.max[2]) * 0.5];
                let t = punkt([mitte[0] - auge[0], mitte[1] - auge[1], mitte[2] - auge[2]], vorn);
                bau.durch.push((!ordnungs_bits(t), k.teil, i as u32));
            }
            continue;
        }
        let gruppe = if k.wirft && schatten {
            if sichtbar {
                1
            } else {
                // nur aufnehmen, wenn der Werfer in die Lichtbox fällt
                let Some((a, b)) = licht_box else { continue };
                let mut lo = [f64::MAX; 2];
                let mut hi = [f64::MIN; 2];
                for e in ecken(k.min, k.max) {
                    let p = transf(&lv, e);
                    for j in 0..2 {
                        if p[j] < lo[j] {
                            lo[j] = p[j];
                        }
                        if p[j] > hi[j] {
                            hi[j] = p[j];
                        }
                    }
                }
                if hi[0] < a[0] || lo[0] > b[0] || hi[1] < a[1] || lo[1] > b[1] {
                    continue;
                }
                0
            }
        } else if sichtbar {
            2
        } else {
            continue;
        };
        // Schlüssel: Netz, Seiten-Merkmale (H-K26; ohne Karten 0 → Reihenfolge wie vorher), Gruppe, Teil
        bau.fest.push(((k.netz as u64) << 36 | ((k.seiten() >> 16) as u64) << 34 | (gruppe as u64) << 32 | k.teil as u64, i as u32));
    }
    bau.fest.sort_unstable_by_key(|x| x.0);
    bau.durch.sort_unstable_by_key(|x| (x.0, x.1));

    let mut inst3d: Vec<u8> = Vec::new();
    let mut zusatz3d: Vec<u8> = Vec::new();
    let mut karten3d: Vec<u8> = Vec::new();
    let mut zuege: Vec<[u32; 4]> = Vec::new();
    let schreib3 = |b: &mut Vec<u8>, z: &mut Vec<u8>, ka: &mut Vec<u8>, k: &Koerper3| {
        for w in k.zusatz {
            put_u32(z, w);
        }
        for w in k.karten {
            put_u32(ka, w);
        }
        for x in k.m {
            put_f32(b, x);
        }
        b.extend_from_slice(&k.farbe.to_be_bytes());
        put_f32(b, k.glanz);
        put_f32(b, k.leuchten);
        for x in k.uv {
            put_u16(b, x);
        }
        // Bits 0–15 Atlasseite bzw. Textur-ID, Bit 16 = hat Textur, Bit 17 = eigene Textur (PROJEKTE PD1)
        put_u32(b, if k.seite < 0 {
            0
        } else if k.seite as u32 & TEXTUR_MARKE != 0 {
            (k.seite as u32 & 0xFFFF) | 1 << 16 | 1 << 17
        } else {
            (k.seite as u32 & 0xFFFF) | 1 << 16
        });
    };
    let mut i = 0;
    while i < bau.fest.len() {
        let schluessel = bau.fest[i].0 >> 34;
        let netz = (schluessel >> 2) as u32;
        let seiten = ((schluessel & 3) as u32) << 16;
        let start = i as u32;
        let mut werfer = 0u32;
        let mut unsichtbar = 0u32;
        while i < bau.fest.len() && bau.fest[i].0 >> 34 == schluessel {
            let gruppe = (bau.fest[i].0 >> 32) & 3;
            if gruppe <= 1 {
                werfer += 1;
            }
            if gruppe == 0 {
                unsichtbar += 1;
            }
            schreib3(&mut inst3d, &mut zusatz3d, &mut karten3d, &bau.koerper[bau.fest[i].1 as usize]);
            i += 1;
        }
        let ende = i as u32;
        if ende - start > unsichtbar {
            zuege.push([zug::FEST | seiten, netz, start + unsichtbar, ende - start - unsichtbar]);
        }
        if schatten && werfer > 0 {
            zuege.push([zug::SCHATTEN, netz, start, werfer]);
        }
    }
    let basis = bau.fest.len() as u32;
    let mut j = 0;
    while j < bau.durch.len() {
        let netz = bau.koerper[bau.durch[j].2 as usize].netz;
        let seiten = bau.koerper[bau.durch[j].2 as usize].seiten();
        let start = j as u32;
        while j < bau.durch.len() && bau.koerper[bau.durch[j].2 as usize].netz == netz && bau.koerper[bau.durch[j].2 as usize].seiten() == seiten {
            schreib3(&mut inst3d, &mut zusatz3d, &mut karten3d, &bau.koerper[bau.durch[j].2 as usize]);
            j += 1;
        }
        zuege.push([zug::DURCH | seiten, netz, basis + start, j as u32 - start]);
    }
    // H-K18: Werfer je Schatten-Ansicht (Kaskaden, dann Kacheln) als eigene Instanz-Kopien, je Netz ein Zug
    let ansichten = kaskaden.len() + schatten_wahl.kacheln.len();
    if ansichten > 0 {
        let mut werfer: Vec<(u64, u32)> = Vec::new();
        for (i, k) in bau.koerper.iter().enumerate() {
            if k.wirft && k.farbe & 0xFF == 0xFF {
                werfer.push(((k.netz as u64) << 32 | k.teil as u64, i as u32));
            }
        }
        werfer.sort_unstable_by_key(|x| x.0);
        let mut n_inst = (bau.fest.len() + bau.durch.len()) as u32;
        let mut liste: Vec<u32> = Vec::new();
        for a in 0..ansichten {
            liste.clear();
            if a < kaskaden.len() {
                // Kaskade: vorab bestimmte Werfer (Lichtbox), in Werfer-Reihenfolge
                let kk = &kaskaden[a];
                liste.extend(werfer.iter().map(|x| x.1).filter(|i| kk.werfer.binary_search(i).is_ok()));
            } else {
                let e = ebenen(&schatten_wahl.kacheln[a - kaskaden.len()].vp);
                liste.extend(werfer.iter().map(|x| x.1).filter(|&i| {
                    let k = &bau.koerper[i as usize];
                    im_sichtkoerper(&e, k.min, k.max)
                }));
            }
            let mut j = 0;
            while j < liste.len() {
                let netz = bau.koerper[liste[j] as usize].netz;
                let start = n_inst;
                while j < liste.len() && bau.koerper[liste[j] as usize].netz == netz {
                    schreib3(&mut inst3d, &mut zusatz3d, &mut karten3d, &bau.koerper[liste[j] as usize]);
                    j += 1;
                    n_inst += 1;
                }
                zuege.push([zug::ANSICHT | (a as u32) << 8, netz, start, n_inst - start]);
            }
        }
    }
    let nur_schatten = |z: &[u32; 4]| z[0] == zug::SCHATTEN || z[0] & 0xFF == zug::ANSICHT;
    if zuege.iter().any(|z| !nur_schatten(z)) || !bau.teilchen3d.is_empty() {
        flags |= flag::DREI_D;
    }
    if zuege.iter().any(nur_schatten) {
        flags |= flag::SCHATTEN;
    }

    // ---------------- Uniform-Block Szene ----------------
    let st = abschnitt_beginn(aus, abschnitt::SZENE);
    for x in vp {
        put_f32(aus, x);
    }
    for x in licht_vp {
        put_f32(aus, x);
    }
    put_v4(aus, [auge[0], auge[1], auge[2], 0.0]);
    put_v4(aus, [l[0], l[1], l[2], if sonne_schatten { 1.0 } else { 0.0 }]);
    match &sonne {
        Some(s) => put_v4(aus, lin4(s.farbe, if s.staerke > 0.0 { s.staerke } else { 0.0 })),
        None => put_v4(aus, [0.0; 4]),
    }
    let (himmel_o, himmel_u) = w.himmel.unwrap_or((w.hintergrund, w.hintergrund));
    // ohne herd.umgebung färbt ein Himmelszelt (`oben`) das Umgebungslicht, sonst wie v1 der Himmel bzw. Hintergrund
    let (umg, umg_s) = w.umgebung.unwrap_or((zelt.map(|z| z.oben).unwrap_or(himmel_o), 0.35));
    let u = lin4(umg, umg_s);
    put_v4(aus, u);
    put_v4(aus, [u[0] * 0.45, u[1] * 0.42, u[2] * 0.38, 0.0]);
    match w.nebel {
        Some((f, von, bis)) if bis > von => {
            let n = lin4(f, 1.0);
            put_v4(aus, [n[0], n[1], n[2], 1.0]);
            put_v4(aus, [von, bis, 1.0 / (bis - von), 0.0]);
        }
        _ => {
            put_v4(aus, [0.0; 4]);
            put_v4(aus, [0.0; 4]);
        }
    }
    let ho = lin4(himmel_o, 1.0);
    let hu = lin4(himmel_u, 1.0);
    put_v4(aus, [ho[0], ho[1], ho[2], 1.0]);
    put_v4(aus, [hu[0], hu[1], hu[2], 1.0]);
    let hg = farbe::bytes(w.hintergrund);
    put_v4(aus, [hg[0] as f64 / 255.0, hg[1] as f64 / 255.0, hg[2] as f64 / 255.0, 1.0]);
    let bias = if schatten { texel_welt * 1.5 / tiefe_spanne } else { kaskaden.first().map(|k| k.bias).unwrap_or(0.0) };
    put_v4(aus, [1.0 / SCHATTEN_GROESSE as f64, texel_welt, bias, texel_welt]);
    put_v4(aus, [w.breite as f64, w.hoehe as f64, 1.0 / w.breite as f64, 1.0 / w.hoehe as f64]);
    put_v4(aus, [punkte.len() as f64, 0.0, 0.0, 0.0]);
    for k in 0..MAX_LICHTER {
        match punkte.get(k) {
            Some((_, li)) => put_v4(aus, [li.pos[0], li.pos[1], li.pos[2], li.reichweite]),
            None => put_v4(aus, [0.0; 4]),
        }
    }
    for k in 0..MAX_LICHTER {
        match punkte.get(k) {
            Some((_, li)) => put_v4(aus, lin4(li.farbe, li.staerke)),
            None => put_v4(aus, [0.0; 4]),
        }
    }
    debug_assert_eq!(aus.len() - st, SZENE_BYTES);
    abschnitt_ende(aus, st);
    abschnitte += 1;

    if !zuege.is_empty() {
        let st = abschnitt_beginn(aus, abschnitt::INST3D);
        aus.extend_from_slice(&inst3d);
        abschnitt_ende(aus, st);
        let st = abschnitt_beginn(aus, abschnitt::ZUEGE3D);
        for z in &zuege {
            for x in z {
                put_u32(aus, *x);
            }
        }
        abschnitt_ende(aus, st);
        abschnitte += 2;
        // Material-Zusatz: nur wenn eine geschriebene Instanz einen hat (sonst Paket wie v1)
        if zusatz3d.iter().any(|&b| b != 0) {
            let st = abschnitt_beginn(aus, abschnitt::ZUSATZ3D);
            aus.extend_from_slice(&zusatz3d);
            abschnitt_ende(aus, st);
            abschnitte += 1;
        }
        // Belag-Karten (H-K26): ebenso nur bei Nutzung
        if karten3d.iter().any(|&b| b != 0) {
            let st = abschnitt_beginn(aus, abschnitt::KARTEN3D);
            aus.extend_from_slice(&karten3d);
            abschnitt_ende(aus, st);
            abschnitte += 1;
        }
    }

    // ---------------- 2D: eine Instanzliste, Zeichenreihenfolge (ebene, ID), stabil ----------------
    if !bau.flach_ordnung.is_empty() {
        bau.flach_ordnung.sort_by_key(|x| x.0);
        let st = abschnitt_beginn(aus, abschnitt::INST2D);
        aus.reserve(bau.flach_ordnung.len() * INST2D_BYTES);
        for (_, i) in &bau.flach_ordnung {
            let o = *i as usize * INST2D_BYTES;
            aus.extend_from_slice(&bau.flach_daten[o..o + INST2D_BYTES]);
        }
        abschnitt_ende(aus, st);
        abschnitte += 1;
    }

    // ---------------- 3D-Teilchen (Funken): leuchtende in Ausstoßreihenfolge, dann deckende von hinten nach vorn ----------------
    if !bau.teilchen3d.is_empty() {
        abschnitte += teilchen_abschnitt(aus, bau, &sk, sk_spiegel.as_ref(), auge, vorn);
    }

    // ---------------- Himmelszelt (H-K11b): nur Werte, die Pixel rechnet die Glut ----------------
    if let Some(z) = zelt {
        let st = abschnitt_beginn(aus, abschnitt::HIMMELSZELT);
        for f in [z.oben, z.horizont, z.boden] {
            let c = lin4(f, 1.0);
            put_v4(aus, [c[0], c[1], c[2], 1.0]);
        }
        // Richtung zur Sonne wie SZENE.sonne_richtung, w = halber Scheibenwinkel (Bogenmaß, 0 = aus)
        put_v4(aus, [l[0], l[1], l[2], z.sonnenscheibe * crate::welt::GRAD * 0.5]);
        let sf = lin4(sonne.map(|s| s.farbe).unwrap_or(farbe::MOZZARELLA), 1.0);
        put_v4(aus, [sf[0], sf[1], sf[2], z.sterne]);
        for (uv, _) in &z.seiten {
            for x in uv {
                put_u32(aus, *x as u32);
            }
        }
        for i in 0..8 {
            put_u32(aus, if i < 6 { z.seiten[i].1 } else { 0 });
        }
        debug_assert_eq!(aus.len() - st, HIMMELSZELT_BYTES);
        abschnitt_ende(aus, st);
        abschnitte += 1;
    }

    // ---------------- Viele Lichter (Clustered Forward): nur bei mehr als 8 Punktlichtern oder einem Spot ----------------
    abschnitte += crate::lichter::abschnitt(aus, &bau.lichter, &ansicht, sicht, seiten, nah, fern, auge, vorn, &schatten_wahl.platz, spiegel);
    // ---------------- Schatten-Ansichten (H-K18): nur bei Kacheln, Kaskaden oder weicherer/härterer Sonne ----------------
    if !schatten_wahl.kacheln.is_empty() || !kaskaden.is_empty() || (schatten && sonne_weich != 1.0) {
        let k: Vec<(crate::lichter::SchattenAnsicht, f64, f64)> = kaskaden.iter().map(|k| (k.ansicht, k.ansicht.texel, k.bias)).collect();
        crate::lichter::schatten_abschnitt(aus, &k, sonne_weich, &schatten_wahl);
        abschnitte += 1;
    }
    // ---------------- Stimmung (HDR-Abschluss in der Glut): nur wenn eine gilt ----------------
    abschnitte += crate::komponenten::stimmung::abschnitt(w, aus, bildnummer, fern);
    // ---------------- Bildschirmraum (H-K24): nur mit Verdeckung oder Bildraum-Spiegelung ----------------
    abschnitte += crate::komponenten::stimmung::bildraum_abschnitt(w, aus, nah, fern);

    let len = aus.len() as u32;
    aus[16..20].copy_from_slice(&flags.to_le_bytes());
    aus[20..24].copy_from_slice(&abschnitte.to_le_bytes());
    aus[24..28].copy_from_slice(&len.to_le_bytes());
}

/// Eine Sonnen-Kaskade (H-K18): Ansicht (Schicht = Kaskade), Tiefen-Bias, Werfer (Indizes in `bau.koerper`, aufsteigend).
struct Kaskade {
    ansicht: crate::lichter::SchattenAnsicht,
    bias: f64,
    werfer: Vec<u32>,
}

/// Sonnen-Kaskaden: Sicht von `nah` bis `d` praktisch geteilt (λ = 0,75), je Scheibe eine Kugel um ihre 8 Ecken (Radius auf
/// 1/16 aufgerundet – drehfest), Mitte im Lichtraum texelweise gerastet (kein Flimmern), Tiefe über Empfänger-Kugel und alle
/// Werfer in der Lichtbox. Eine Kaskade = eine Schicht 2048² der Schatten-Tiefentextur.
#[allow(clippy::too_many_arguments)]
fn sonnen_kaskaden(bau: &Bildbau, lv: &M4, k: u32, nah: f64, d: f64, auge: [f64; 3], vorn: [f64; 3], rechts: [f64; 3], hoch: [f64; 3], th: f64, seiten: f64) -> Vec<Kaskade> {
    const LAMBDA: f64 = 0.75;
    // Lichtraum-Hüllen der Werfer (einmal)
    let mut werfer: Vec<(u32, [f64; 3], [f64; 3])> = Vec::new();
    for (i, kp) in bau.koerper.iter().enumerate() {
        if !kp.wirft || kp.farbe & 0xFF != 0xFF {
            continue;
        }
        let mut a = [f64::MAX; 3];
        let mut b = [f64::MIN; 3];
        for e in ecken(kp.min, kp.max) {
            let p = transf(lv, e);
            for j in 0..3 {
                if p[j] < a[j] {
                    a[j] = p[j];
                }
                if p[j] > b[j] {
                    b[j] = p[j];
                }
            }
        }
        werfer.push((i as u32, a, b));
    }
    let mut aus = Vec::new();
    let grenze = |i: u32| -> f64 {
        if i == 0 {
            return nah;
        }
        if i == k {
            return d;
        }
        let f = i as f64 / k as f64;
        LAMBDA * nah * libm::pow(d / nah, f) + (1.0 - LAMBDA) * (nah + (d - nah) * f)
    };
    for c in 0..k {
        let (z0, z1) = (grenze(c), grenze(c + 1));
        let mut e = [[0.0; 3]; 8];
        let mut n = 0;
        for z in [z0, z1] {
            let (hh, hb) = (th * z, th * z * seiten);
            for (sx, sy) in [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)] {
                e[n] = [
                    auge[0] + vorn[0] * z + rechts[0] * hb * sx + hoch[0] * hh * sy,
                    auge[1] + vorn[1] * z + rechts[1] * hb * sx + hoch[1] * hh * sy,
                    auge[2] + vorn[2] * z + rechts[2] * hb * sx + hoch[2] * hh * sy,
                ];
                n += 1;
            }
        }
        let mut m = [0.0; 3];
        for p in &e {
            for j in 0..3 {
                m[j] += p[j] * 0.125;
            }
        }
        let mut r: f64 = 0.0;
        for p in &e {
            let v = [p[0] - m[0], p[1] - m[1], p[2] - m[2]];
            let l = libm::sqrt(punkt(v, v));
            if l > r {
                r = l;
            }
        }
        let r = libm::ceil(r * 16.0) / 16.0;
        let r = if r > 0.0625 { r } else { 0.0625 };
        let cl = transf(lv, m);
        let texel = 2.0 * r / crate::lichter::SCHATTEN_SEITE as f64;
        let cx = libm::floor(cl[0] / texel) * texel;
        let cy = libm::floor(cl[1] / texel) * texel;
        let (bx0, bx1, by0, by1) = (cx - r, cx + r, cy - r, cy + r);
        let zmin = cl[2] - r;
        let mut zmax = cl[2] + r;
        let mut liste = Vec::new();
        for (i, a, b) in &werfer {
            if b[0] < bx0 || a[0] > bx1 || b[1] < by0 || a[1] > by1 || b[2] < zmin {
                continue;
            }
            if b[2] > zmax {
                zmax = b[2];
            }
            liste.push(*i);
        }
        let rand = {
            let x = (zmax - zmin) * 0.01;
            if x > 0.05 {
                x
            } else {
                0.05
            }
        };
        let (nah_l, fern_l) = (-zmax - rand, -zmin + rand);
        let vp = m4_mal(&ortho(bx0, bx1, by0, by1, nah_l, fern_l), lv);
        let ansicht = crate::lichter::SchattenAnsicht { vp, schicht: c, x: 0, y: 0, kante: crate::lichter::SCHATTEN_SEITE, texel };
        aus.push(Kaskade { ansicht, bias: texel * 1.5 / (fern_l - nah_l), werfer: liste });
    }
    aus
}

/// Abschnitt `TEILCHEN3D`: `u32 leuchtend, u32 deckend`, dann die Teilchen (je `TEILCHEN3D_BYTES`). Teilchen außerhalb des
/// Sichtkörpers (Kugel mit der halben Größe, gestreckt + halbe Strichlänge) entfallen. Danach `ZUSATZ_TEILCHEN`, wenn ein
/// Teilchen gestreckt oder beleuchtet ist. Liefert die Zahl der geschriebenen Abschnitte (0, 1 oder 2).
fn teilchen_abschnitt(aus: &mut Vec<u8>, bau: &mut Bildbau, sk: &[[f64; 4]; 6], sk_spiegel: Option<&[[f64; 4]; 6]>, auge: [f64; 3], vorn: [f64; 3]) -> u32 {
    let mut laengen = [0.0; 6];
    for (l, p) in laengen.iter_mut().zip(sk.iter()) {
        *l = libm::sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
    }
    let sichtbar = |t: &Teilchen3| {
        if !(t.pos[0].is_finite() && t.pos[1].is_finite() && t.pos[2].is_finite()) {
            return false;
        }
        // gestreckt: Kugel um die Mitte mit halber Strichlänge + halber Größe
        let s = &t.strich;
        let r = if s[0] != 0.0 || s[1] != 0.0 || s[2] != 0.0 { t.r + libm::sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]) } else { t.r };
        // H-K21: im Frustum oder (Spiegelbild voll) im gespiegelten – die gespiegelten Ebenen haben dieselben Normalenlängen
        let drin = |e: &[[f64; 4]; 6]| e.iter().zip(laengen.iter()).all(|(p, l)| !(p[0] * t.pos[0] + p[1] * t.pos[1] + p[2] * t.pos[2] + p[3] < -r * l));
        drin(sk) || sk_spiegel.is_some_and(drin)
    };
    bau.teilchen_ordnung.clear();
    let mut leuchtend = 0u32;
    for (i, t) in bau.teilchen3d.iter().enumerate() {
        if !t.deckend && sichtbar(t) {
            bau.teilchen_ordnung.push((0, i as u32));
            leuchtend += 1;
        }
    }
    for (i, t) in bau.teilchen3d.iter().enumerate() {
        if t.deckend && sichtbar(t) {
            let d = punkt([t.pos[0] - auge[0], t.pos[1] - auge[1], t.pos[2] - auge[2]], vorn);
            bau.teilchen_ordnung.push((!ordnungs_bits(d), i as u32));
        }
    }
    let deckend = bau.teilchen_ordnung.len() as u32 - leuchtend;
    if leuchtend + deckend == 0 {
        return 0;
    }
    bau.teilchen_ordnung[leuchtend as usize..].sort_unstable_by_key(|x| (x.0, x.1));
    let st = abschnitt_beginn(aus, abschnitt::TEILCHEN3D);
    put_u32(aus, leuchtend);
    put_u32(aus, deckend);
    aus.reserve(bau.teilchen_ordnung.len() * TEILCHEN3D_BYTES);
    for (_, i) in &bau.teilchen_ordnung {
        let t = &bau.teilchen3d[*i as usize];
        put_f32(aus, t.pos[0]);
        put_f32(aus, t.pos[1]);
        put_f32(aus, t.pos[2]);
        put_f32(aus, t.r);
        aus.extend_from_slice(&t.farbe.to_be_bytes());
    }
    abschnitt_ende(aus, st);
    // Zusatz (Strich, Licht): nur wenn ein geschriebenes Teilchen einen hat (sonst Paket wie v1)
    let hat = |t: &Teilchen3| t.licht != 0 || f32w(t.strich[0]) != 0.0 || f32w(t.strich[1]) != 0.0 || f32w(t.strich[2]) != 0.0;
    if !bau.teilchen_ordnung.iter().any(|(_, i)| hat(&bau.teilchen3d[*i as usize])) {
        return 1;
    }
    let st = abschnitt_beginn(aus, abschnitt::ZUSATZ_TEILCHEN);
    aus.reserve(bau.teilchen_ordnung.len() * ZUSATZ_TEILCHEN_BYTES);
    for (_, i) in &bau.teilchen_ordnung {
        let t = &bau.teilchen3d[*i as usize];
        put_f32(aus, t.strich[0]);
        put_f32(aus, t.strich[1]);
        put_f32(aus, t.strich[2]);
        put_u32(aus, t.licht & 255);
    }
    abschnitt_ende(aus, st);
    2
}

/// Lesehilfe für ein Bildpaket (Glut, Werkzeuge, Tests).
pub struct Leser<'a> {
    pub b: &'a [u8],
}

impl<'a> Leser<'a> {
    pub fn neu(b: &'a [u8]) -> Option<Leser<'a>> {
        if b.len() < KOPF_BYTES || b[0..4] != MAGIE || u32::from_le_bytes([b[4], b[5], b[6], b[7]]) != VERSION {
            return None;
        }
        Some(Leser { b })
    }
    fn u32_at(&self, i: usize) -> u32 {
        u32::from_le_bytes([self.b[i], self.b[i + 1], self.b[i + 2], self.b[i + 3]])
    }
    pub fn bildnummer(&self) -> u32 {
        self.u32_at(8)
    }
    pub fn feld(&self) -> (u32, u32) {
        (u16::from_le_bytes([self.b[12], self.b[13]]) as u32, u16::from_le_bytes([self.b[14], self.b[15]]) as u32)
    }
    pub fn flags(&self) -> u32 {
        self.u32_at(16)
    }
    /// Alle Abschnitte als (art, daten).
    pub fn abschnitte(&self) -> impl Iterator<Item = (u32, &'a [u8])> + '_ {
        let mut i = KOPF_BYTES;
        let b = self.b;
        core::iter::from_fn(move || {
            if i + 8 > b.len() {
                return None;
            }
            let art = u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]);
            let len = u32::from_le_bytes([b[i + 4], b[i + 5], b[i + 6], b[i + 7]]) as usize;
            let d = b.get(i + 8..i + 8 + len)?;
            i += 8 + ((len + 3) & !3);
            Some((art, d))
        })
    }
}
