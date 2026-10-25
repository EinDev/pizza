//! `Schwung` (3D, H-K17): Physik wie Unity `Rigidbody` mit Box-, Sphere-, Capsule-, Mesh- und Terrain-Collider – Gegenstück zu
//! `Wucht` (2D). Die Form kommt vom `Fuehler` am selben Teil (`braucht`); Kontakte nur zwischen Fühlern mit `ausloeser: nein`.
//! Ein solcher Fühler **ohne** `Schwung` ist ein fester Körper (Boden, Wand, Gelände mit `form: "netz"`). Für die Physik sind
//! Kasten und Kapsel **gedreht** (`kollision3d`); die Auslöser-Meldungen des Fühlers bleiben achsenparallel (K-150).
//!
//! Je Takt (Takt-System nach `Gelaende`; vor dem Fühler-Nachlauf):
//! 1. **Lage übernehmen, Kräfte** (je Schwung-Zeile): Hat das Programm Lage oder Drehung gesetzt (Vergleich mit den zuletzt
//!    geschriebenen Bits in verborgenen Spalten) oder ist es die erste Runde, gilt die Lage des Teils (Drehung als Quaternion
//!    aus der Welt-Matrix) und der Körper wacht auf. `dynamisch`: tempo += stoss / masse, tempoY −= schwerkraft · dt,
//!    tempo ·= (1 − daempfung)^dt, drehtempo ·= (1 − drehdaempfung)^dt; `drehsperre` → keine Drehung. `stoss` wird 0.
//! 2. **Formen**: feste Fühler sammeln ([`fuehler::sammle_wenn`]), gedrehte Formen bauen ([`kollision3d::form_aus_fuehler`]),
//!    Breitphase [`fuehler::breitphase`] auf den umschließenden Kästen (Masken beidseitig, Paare nach Teil-IDs).
//! 3. **Inseln, Schlafen**: dynamische Körper mit überlappenden Kästen bilden Inseln (Vereinigung nach Index). Eine Insel mit
//!    einem wachen Körper wacht ganz; ein Schläfer wacht auch bei Stoß, gesetztem Tempo, gesetzter Lage, einem bewegten
//!    kinematischen Nachbarn oder wenn ein Partner seines letzten Kontakts fehlt.
//! 4. **Engphase** ([`kollision3d::kontakte`]) für Paare mit einem wachen dynamischen Körper; Kontakte nach (kleinere ID, größere
//!    ID, Merkmal), ab [`kollision3d::RAND`] vor der Berührung (spekulativ: Annäherung bis zur Berührung frei). Warmstart mit den
//!    Impulsen des nächstgelegenen Punkts desselben Paars aus dem letzten Takt (Ort im Körperrahmen, verborgene Spalte `kontakte`).
//! 5. **Lösen**: feste [`IMPULSE`] Iterationen über die Kontaktflächen der Paare – je Punkt Normale (≥ 0) und zwei
//!    Reibungsrichtungen (Coulomb, √(μa · μb)), je Fläche die **Drehung** (Kippen um die Tangenten bis zur Ausdehnung der Fläche ×
//!    Normalimpuls, Bohren um die Normale mit μ; ein Einzelpunkt wie bei einer Kugel dreht frei) –, abwechselnd vorwärts und
//!    rückwärts; semi-implizites Euler; dann [`LAGEN`] Iterationen Positionskorrektur (Überlappung über [`SPIEL`] zu [`ANTEIL`],
//!    Lage und Drehung) – die Korrektur bremst je Achse höchstens das Tempo, gegen das sie schiebt, beschleunigt nie (wie `Wucht`).
//! 6. **Schlafen**: Inseln, deren Körper alle [`SCHLAF_TAKTE`] Takte unter [`SCHLAF_TEMPO`] und [`SCHLAF_DREH`] blieben, ruhen
//!    (Tempo 0, `ruht` ja) und kosten bis zum Wecken nur die Breitphase.
//! 7. **Zurückschreiben**: Lage (über die Eltern-Matrix zurückgerechnet), Drehung als `drehung`/`neigung`/`rollen` (Reihenfolge
//!    SPEC §18.4), tempo, drehtempo (Grad/s, Weltachsen), `amBoden` (ein Kontakt drückt nach oben: Normale y > 0,5), `ruht`.
//!
//! Grenzen (K-162): kein Schutz gegen Durchtunneln (Tempo je Takt kleiner als die halbe Ausdehnung halten), keine Gelenke/Federn,
//! Netze nur fest, Drehung unter gedrehten Eltern mit ungleichem Maßstab nur angenähert, Kreiselkräfte entfallen. Alles f64,
//! Reihenfolgen nur nach Teil-ID bzw. Index, nur `libm` (`sqrt`, `sin`, `cos`, `atan2`, `asin`, `pow`) (K-129).

use alloc::vec;
use alloc::vec::Vec;

use super::fuehler::{self, Kandidat};
use super::*;
use crate::kollision3d::{self, kreuz, mal, minus, plus, punkt, Form, Umgebung, V};
use crate::schema::{Feld, Genus, Raum, Schema, Spalte};
use crate::welt::{lage, GRAD};

pub const ART_FELD: usize = 0;
pub const MASSE: usize = 1;
pub const TEMPO_X: usize = 2;
pub const TEMPO_Y: usize = 3;
pub const TEMPO_Z: usize = 4;
pub const DREHTEMPO_X: usize = 5;
pub const DREHTEMPO_Y: usize = 6;
pub const DREHTEMPO_Z: usize = 7;
pub const SCHWERKRAFT: usize = 8;
pub const DAEMPFUNG: usize = 9;
pub const DREHDAEMPFUNG: usize = 10;
pub const ABPRALL: usize = 11;
pub const REIBUNG: usize = 12;
pub const STOSS_X: usize = 13;
pub const STOSS_Y: usize = 14;
pub const STOSS_Z: usize = 15;
pub const DREHSPERRE: usize = 16;
/// Lesefeld: ein Kontakt drückte im letzten Takt nach oben
pub const AM_BODEN: usize = 17;
/// Lesefeld: der Körper schläft
pub const SCHLAEFT: usize = 18;
/// verborgen: Impulse des letzten Takts (Warmstart), flach `[Partner-Teil, Punkt x, y, z (Achsen des Halters), normal, reib1, reib2]` – je Paar beim
/// dynamischen Körper mit der kleineren Teil-ID (bzw. dem einzigen dynamischen)
pub const KONTAKTE: usize = 20;
/// verborgen: Drehung als Quaternion (w, x, y, z) in Weltlage; alles 0 = noch nicht übernommen
pub const QW: usize = 21;
/// verborgen: zuletzt geschriebene Lage x, y, z, drehung, neigung, rollen (6 Spalten ab hier)
pub const GESCHRIEBEN: usize = 25;
/// verborgen: Takte in Folge unter den Schlafschwellen
pub const STILLE: usize = 31;
/// verborgen: Teil, für das der Zustand gilt (Kopie/Umhängen → neu übernehmen)
pub const FUER: usize = 32;
/// Nachtragsfeld (H-K28, letztes öffentliches Feld vor den verborgenen): Auftrieb im `Wasser`, Anteil der Gewichtskraft
/// (`masse` · `schwerkraft`) bei voller Eintauchung, 0 … 2
pub const AUFTRIEB: usize = 19;
/// Strömungsdämpfung im Wasser (1/s bei voller Eintauchung): Tempo und Drehtempo · e^(−k · Anteil · dt)
const WASSER_DAEMPFUNG: f64 = 3.0;
const WASSER_DREHDAEMPFUNG: f64 = 3.0;

/// Werte von `art`.
pub mod art {
    pub const DYNAMISCH: u32 = 0;
    pub const KINEMATISCH: u32 = 1;
    pub const FEST: u32 = 2;
}

/// Impuls-Iterationen (fest, K-162).
pub const IMPULSE: usize = 8;
/// Iterationen der Positionskorrektur (fest).
pub const LAGEN: usize = 4;
/// Abprall erst ab dieser Annäherung (Einheiten/s) – darunter ruht ein Körper, statt zu zittern.
pub const ABPRALL_AB: f64 = 0.5;
/// Überlappung (Einheiten), die die Positionskorrektur stehen lässt (ruhende Kontakte bleiben bestehen).
pub const SPIEL: f64 = 0.005;
/// Anteil der Überlappung, den eine Korrektur-Iteration behebt.
pub const ANTEIL: f64 = 0.2;
/// Schlafschwellen: Tempo (Einheiten/s), Drehtempo (Bogenmaß/s, 2°/s) und Dauer (Takte, 0,5 s).
pub const SCHLAF_TEMPO: f64 = 0.05;
pub const SCHLAF_DREH: f64 = 2.0 * GRAD;
pub const SCHLAF_TAKTE: f64 = 30.0;
/// Werkstoff eines festen Fühlers ohne `Schwung`: abprall 0, reibung wie der Standard.
const REIBUNG_OHNE: f64 = 0.5;

pub static ART: Art = Art {
    schema: Schema {
        name: "Schwung",
        genus: Genus::M,
        raum: Raum::Drei,
        braucht: &["Fuehler"],
        felder: &[
            Feld::wahl("art", &["dynamisch", "kinematisch", "fest"], 0),
            Feld::zahl("masse", 1.0).min(0.001),
            Feld::zahl("tempoX", 0.0),
            Feld::zahl("tempoY", 0.0),
            Feld::zahl("tempoZ", 0.0),
            Feld::zahl("drehtempoX", 0.0),
            Feld::zahl("drehtempoY", 0.0),
            Feld::zahl("drehtempoZ", 0.0),
            Feld::zahl("schwerkraft", 0.0),
            Feld::zahl("daempfung", 0.0).bereich(0.0, 1.0),
            Feld::zahl("drehdaempfung", 0.05).bereich(0.0, 1.0),
            Feld::zahl("abprall", 0.0).bereich(0.0, 1.0),
            Feld::zahl("reibung", 0.5).bereich(0.0, 1.0),
            Feld::zahl("stossX", 0.0),
            Feld::zahl("stossY", 0.0),
            Feld::zahl("stossZ", 0.0),
            Feld::diavolo("drehsperre", false),
            Feld::diavolo("amBoden", false).lesen(),
            Feld::diavolo("ruht", false).lesen(),
            Feld::zahl("auftrieb", 0.0).bereich(0.0, 2.0).nachtrag(),
            Feld::puffer("kontakte"),
            Feld::intern("qw", 0.0),
            Feld::intern("qx", 0.0),
            Feld::intern("qy", 0.0),
            Feld::intern("qz", 0.0),
            Feld::intern("lageX", 0.0),
            Feld::intern("lageY", 0.0),
            Feld::intern("lageZ", 0.0),
            Feld::intern("lageDrehung", 0.0),
            Feld::intern("lageNeigung", 0.0),
            Feld::intern("lageRollen", 0.0),
            Feld::intern("stille", 0.0),
            Feld::intern("fuer", 0.0),
        ],
    },
    takt: Some(takt),
    ..Art::LEER
};

// ------------------------------------------------------------------------------------------------ Drehungen

/// Quaternion (w, x, y, z).
pub type Q = [f64; 4];

/// Quaternion aus einer Drehmatrix (Spalten = Achsen), nach Shepperd, normiert.
pub fn quaternion(ax: &[V; 3]) -> Q {
    let r = |i: usize, j: usize| ax[j][i];
    let spur = r(0, 0) + r(1, 1) + r(2, 2);
    let q = if spur > 0.0 {
        let s = libm::sqrt(spur + 1.0) * 2.0;
        [0.25 * s, (r(2, 1) - r(1, 2)) / s, (r(0, 2) - r(2, 0)) / s, (r(1, 0) - r(0, 1)) / s]
    } else if r(0, 0) > r(1, 1) && r(0, 0) > r(2, 2) {
        let s = libm::sqrt(1.0 + r(0, 0) - r(1, 1) - r(2, 2)) * 2.0;
        [(r(2, 1) - r(1, 2)) / s, 0.25 * s, (r(0, 1) + r(1, 0)) / s, (r(0, 2) + r(2, 0)) / s]
    } else if r(1, 1) > r(2, 2) {
        let s = libm::sqrt(1.0 + r(1, 1) - r(0, 0) - r(2, 2)) * 2.0;
        [(r(0, 2) - r(2, 0)) / s, (r(0, 1) + r(1, 0)) / s, 0.25 * s, (r(1, 2) + r(2, 1)) / s]
    } else {
        let s = libm::sqrt(1.0 + r(2, 2) - r(0, 0) - r(1, 1)) * 2.0;
        [(r(1, 0) - r(0, 1)) / s, (r(0, 2) + r(2, 0)) / s, (r(1, 2) + r(2, 1)) / s, 0.25 * s]
    };
    normiere(q)
}

fn normiere(q: Q) -> Q {
    let l = libm::sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    if l > 1e-300 && l.is_finite() {
        [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
    } else {
        [1.0, 0.0, 0.0, 0.0]
    }
}

/// Drehmatrix eines Quaternions als Spalten (Achsen).
pub fn matrix(q: &Q) -> [V; 3] {
    let [w, x, y, z] = *q;
    [
        [1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y + w * z), 2.0 * (x * z - w * y)],
        [2.0 * (x * y - w * z), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z + w * x)],
        [2.0 * (x * z + w * y), 2.0 * (y * z - w * x), 1.0 - 2.0 * (x * x + y * y)],
    ]
}

/// Dreht q um den Weltvektor θ (Bogenmaß, kleiner Schritt): q + ½ (0, θ) ⊗ q, normiert.
pub fn drehe(q: &Q, th: V) -> Q {
    if th == [0.0; 3] {
        return *q;
    }
    let [w, x, y, z] = *q;
    let (a, b, c) = (th[0] * 0.5, th[1] * 0.5, th[2] * 0.5);
    normiere([w - (a * x + b * y + c * z), x + (a * w + b * z - c * y), y + (b * w + c * x - a * z), z + (c * w + a * y - b * x)])
}

/// Winkel (drehung, neigung, rollen) in Grad zu einer Drehmatrix (Spalten), passend zu `lokal_3d`: R = Ry · Rx · Rz.
pub fn winkel(ax: &[V; 3]) -> (f64, f64, f64) {
    let r = |i: usize, j: usize| ax[j][i];
    let s = -r(1, 2);
    let s = if s > 1.0 { 1.0 } else if s < -1.0 { -1.0 } else { s };
    let neigung = libm::asin(s);
    let (drehung, rollen) = if betrag(r(1, 2)) < 0.999_999_9 {
        (libm::atan2(r(0, 2), r(2, 2)), libm::atan2(r(1, 0), r(1, 1)))
    } else if r(1, 2) < 0.0 {
        (libm::atan2(r(0, 1), r(0, 0)), 0.0)
    } else {
        (libm::atan2(-r(0, 1), r(0, 0)), 0.0)
    };
    (drehung / GRAD + 0.0, neigung / GRAD + 0.0, rollen / GRAD + 0.0)
}

#[inline]
fn mat_mal(m: &[V; 3], v: V) -> V {
    plus(plus(mal(m[0], v[0]), mal(m[1], v[1])), mal(m[2], v[2]))
}
/// Rᵀ · v (R als Spalten).
#[inline]
fn mat_t_mal(m: &[V; 3], v: V) -> V {
    [punkt(m[0], v), punkt(m[1], v), punkt(m[2], v)]
}

/// Inverse Trägheit in Weltlage: R · diag(i) · Rᵀ (als Spalten; symmetrisch).
fn traegheit_welt(r: &[V; 3], i: V) -> [V; 3] {
    let mut m = [[0.0; 3]; 3];
    for (c, mc) in m.iter_mut().enumerate() {
        for (z, x) in mc.iter_mut().enumerate() {
            *x = r[0][z] * i[0] * r[0][c] + r[1][z] * i[1] * r[1][c] + r[2][z] * i[2] * r[2][c];
        }
    }
    m
}

/// Inverse Trägheit (Diagonale in den Achsen der Form) für Masse `m`.
fn inv_traegheit(f: &Form, m: f64) -> V {
    let inv = |x: f64| if x > 0.0 { 1.0 / x } else { 0.0 };
    match *f {
        Form::Kugel { r, .. } => {
            let i = inv(0.4 * m * r * r);
            [i, i, i]
        }
        Form::Kasten { h, .. } => {
            let (a, b, c) = (h[0] * h[0], h[1] * h[1], h[2] * h[2]);
            [inv(m / 3.0 * (b + c)), inv(m / 3.0 * (a + c)), inv(m / 3.0 * (a + b))]
        }
        Form::Kapsel { halb, r, .. } => {
            // Zylinder (Länge l) + zwei Halbkugeln, Masse nach Volumen geteilt (π kürzt sich)
            let l = 2.0 * halb;
            let (vz, vk) = (r * r * l, 4.0 / 3.0 * r * r * r);
            let summe = vz + vk;
            let (mz, mk) = if summe > 0.0 { (m * vz / summe, m * vk / summe) } else { (0.0, m) };
            let iy = mz * r * r * 0.5 + mk * 0.4 * r * r;
            let ix = mz * (l * l / 12.0 + r * r * 0.25) + mk * (0.4 * r * r + l * l * 0.25 + 0.375 * l * r);
            [inv(ix), inv(iy), inv(ix)]
        }
        _ => [0.0; 3],
    }
}

// ------------------------------------------------------------------------------------------------ Löser

/// Ein Körper im Löser.
#[derive(Clone, Copy, Debug)]
struct Leib {
    teil: u32,
    /// Schwung-Zeile (`usize::MAX`: fester Fühler ohne Schwung)
    zeile: usize,
    art: u32,
    /// dynamisch und wach (bewegt sich durch Kräfte und Kontakte)
    wach: bool,
    /// Schwerpunkt (Welt), Drehung, Tempo, Drehtempo (Bogenmaß/s)
    x: V,
    q: Q,
    v: V,
    w: V,
    /// Schwerpunkt-Versatz in den Achsen des Körpers: Ursprung des Teils = x − R · o
    o: V,
    inv_m: f64,
    inv_i: V,
    ii: [V; 3],
    abprall: f64,
    reibung: f64,
    am_boden: bool,
    dx: V,
    dth: V,
}

impl Leib {
    fn fest(teil: u32) -> Leib {
        Leib {
            teil,
            zeile: usize::MAX,
            art: art::FEST,
            wach: false,
            x: [0.0; 3],
            q: [1.0, 0.0, 0.0, 0.0],
            v: [0.0; 3],
            w: [0.0; 3],
            o: [0.0; 3],
            inv_m: 0.0,
            inv_i: [0.0; 3],
            ii: [[0.0; 3]; 3],
            abprall: 0.0,
            reibung: REIBUNG_OHNE,
            am_boden: false,
            dx: [0.0; 3],
            dth: [0.0; 3],
        }
    }
    #[inline]
    fn tempo_bei(&self, r: V) -> V {
        plus(self.v, kreuz(self.w, r))
    }
    #[inline]
    fn bewegt(&self) -> bool {
        self.v != [0.0; 3] || self.w != [0.0; 3]
    }
}

/// Ein Kontaktpunkt im Löser.
#[derive(Clone, Copy, Debug)]
struct Kontakt {
    a: usize,
    b: usize,
    n: V,
    t1: V,
    t2: V,
    tiefe: f64,
    ra: V,
    rb: V,
    ziel: f64,
    ln: f64,
    lt1: f64,
    lt2: f64,
}

/// Zwei feste Tangenten zur Normale (Länge 1).
fn tangenten(n: V) -> (V, V) {
    let t1 = if betrag(n[0]) >= 0.577_35 { kollision3d::norm_oder([n[1], -n[0], 0.0], [0.0, 0.0, 1.0]) } else { kollision3d::norm_oder([0.0, n[2], -n[1]], [1.0, 0.0, 0.0]) };
    (t1, kreuz(n, t1))
}

/// Eine Richtung eines Kontakts im Löser: d, Hebelkreuze ra × d und rb × d, deren Dreh-Antworten I⁻¹ (r × d) (0 für unbewegliche
/// Körper) und die effektive Masse. Relatives Tempo entlang d = (vb · d + wb · jb) − (va · d + wa · ja).
#[derive(Clone, Copy, Debug)]
struct Richtung {
    d: V,
    ja: V,
    jb: V,
    ia: V,
    ib: V,
    m: f64,
}

fn richtung(la: &Leib, lb: &Leib, ra: V, rb: V, d: V) -> Richtung {
    let (ja, jb) = (kreuz(ra, d), kreuz(rb, d));
    let ia = if la.inv_m > 0.0 { mat_mal(&la.ii, ja) } else { [0.0; 3] };
    let ib = if lb.inv_m > 0.0 { mat_mal(&lb.ii, jb) } else { [0.0; 3] };
    let k = la.inv_m + lb.inv_m + punkt(ja, ia) + punkt(jb, ib);
    Richtung { d, ja, jb, ia, ib, m: if k > 0.0 { 1.0 / k } else { 0.0 } }
}

/// Tempo eines Körpers im Löser (dicht, ohne den Rest des Leibs).
#[derive(Clone, Copy, Debug)]
struct Tempo {
    v: V,
    w: V,
    im: f64,
}

#[inline]
fn relativ(t: &[Tempo], a: usize, b: usize, r: &Richtung) -> f64 {
    let (ta, tb) = (&t[a], &t[b]);
    (punkt(tb.v, r.d) + punkt(tb.w, r.jb)) - (punkt(ta.v, r.d) + punkt(ta.w, r.ja))
}

/// Impuls l entlang r: A bekommt −l, B +l.
#[inline]
fn stoss(t: &mut [Tempo], a: usize, b: usize, r: &Richtung, l: f64) {
    let ta = &mut t[a];
    ta.v = minus(ta.v, mal(r.d, ta.im * l));
    ta.w = minus(ta.w, mal(r.ia, l));
    let tb = &mut t[b];
    tb.v = plus(tb.v, mal(r.d, tb.im * l));
    tb.w = plus(tb.w, mal(r.ib, l));
}

/// Kontaktfläche eines Paars (aufeinanderfolgende Kontakte `von..bis`): Drehung um die Tangenten t1, t2 und die Normale.
struct Flaeche {
    a: usize,
    b: usize,
    von: usize,
    bis: usize,
    achsen: [V; 3],
    /// Hebel je Achse: um t1 die Ausdehnung entlang t2, um t2 die entlang t1, um n μ · halbe Summe
    hebel: [f64; 3],
    ia: [V; 3],
    ib: [V; 3],
    m: [f64; 3],
    l: [f64; 3],
}

/// Kontaktflächen aus den sortierten Kontakten. Die Ausdehnung zählt nur berührende Punkte (Tiefe ≥ 0); ein einzelner Punkt
/// (Kugel) hat keine – Kugeln rollen frei, Kästen auf einer Kante kippen frei um die Kante.
fn flaechen(leiber: &[Leib], kontakte: &[Kontakt]) -> Vec<Flaeche> {
    let mut aus = Vec::new();
    let mut i = 0;
    while i < kontakte.len() {
        let (a, b) = (kontakte[i].a, kontakte[i].b);
        let mut j = i + 1;
        while j < kontakte.len() && kontakte[j].a == a && kontakte[j].b == b {
            j += 1;
        }
        let c0 = &kontakte[i];
        let (t1, t2) = (c0.t1, c0.t2);
        let (la, lb) = (&leiber[a], &leiber[b]);
        let (mut e1, mut e2) = (0.0, 0.0);
        let mut m = [0.0; 3];
        let mut zahl = 0usize;
        for c in &kontakte[i..j] {
            if c.tiefe >= 0.0 {
                m = plus(m, c.ra);
                zahl += 1;
            }
        }
        if zahl >= 2 {
            let m = mal(m, 1.0 / zahl as f64);
            for c in &kontakte[i..j] {
                if c.tiefe >= 0.0 {
                    let d = minus(c.ra, m);
                    let (x, y) = (betrag(punkt(d, t1)), betrag(punkt(d, t2)));
                    if x > e1 {
                        e1 = x;
                    }
                    if y > e2 {
                        e2 = y;
                    }
                }
            }
        }
        let mu = libm::sqrt(la.reibung * lb.reibung);
        let hebel = [e2, e1, mu * 0.5 * (e1 + e2)];
        let achsen = [t1, t2, c0.n];
        let (mut ia, mut ib, mut mm) = ([[0.0; 3]; 3], [[0.0; 3]; 3], [0.0; 3]);
        for k in 0..3 {
            if hebel[k] > 0.0 {
                let ax = achsen[k];
                ia[k] = if la.inv_m > 0.0 { mat_mal(&la.ii, ax) } else { [0.0; 3] };
                ib[k] = if lb.inv_m > 0.0 { mat_mal(&lb.ii, ax) } else { [0.0; 3] };
                let kk = punkt(ax, ia[k]) + punkt(ax, ib[k]);
                mm[k] = if kk > 0.0 { 1.0 / kk } else { 0.0 };
            }
        }
        aus.push(Flaeche { a, b, von: i, bis: j, achsen, hebel, ia, ib, m: mm, l: [0.0; 3] });
        i = j;
    }
    aus
}

fn loese(leiber: &mut [Leib], kontakte: &mut [Kontakt]) {
    let m = kontakte.len();
    let mut t: Vec<Tempo> = leiber.iter().map(|l| Tempo { v: l.v, w: l.w, im: l.inv_m }).collect();
    let z: Vec<[Richtung; 3]> = kontakte
        .iter()
        .map(|c| {
            let (la, lb) = (&leiber[c.a], &leiber[c.b]);
            [richtung(la, lb, c.ra, c.rb, c.n), richtung(la, lb, c.ra, c.rb, c.t1), richtung(la, lb, c.ra, c.rb, c.t2)]
        })
        .collect();
    let mu: Vec<f64> = kontakte.iter().map(|c| libm::sqrt(leiber[c.a].reibung * leiber[c.b].reibung)).collect();
    // Warmstart
    for (i, c) in kontakte.iter().enumerate() {
        for (k, l) in [c.ln, c.lt1, c.lt2].into_iter().enumerate() {
            if l != 0.0 {
                stoss(&mut t, c.a, c.b, &z[i][k], l);
            }
        }
    }
    let mut fl = flaechen(leiber, kontakte);
    let nf = fl.len();
    for it in 0..IMPULSE {
        let vor = it % 2 == 0;
        for fi in 0..nf {
            let f = &mut fl[if vor { fi } else { nf - 1 - fi }];
            let (a, b) = (f.a, f.b);
            let anzahl = f.bis - f.von;
            let mut summe = 0.0;
            for nr in 0..anzahl {
                let i = if vor { f.von + nr } else { f.bis - 1 - nr };
                let c = &mut kontakte[i];
                let r = &z[i];
                // Normale (aufsummiert ≥ 0)
                let vn = relativ(&t, a, b, &r[0]);
                let neu = c.ln + (c.ziel - vn) * r[0].m;
                let neu = if neu > 0.0 { neu } else { 0.0 };
                stoss(&mut t, a, b, &r[0], neu - c.ln);
                c.ln = neu;
                summe += neu;
                // Reibung (je Richtung bis μ · Normalimpuls)
                let grenze = mu[i] * c.ln;
                for (k, l) in [(1, &mut c.lt1), (2, &mut c.lt2)] {
                    let vt = relativ(&t, a, b, &r[k]);
                    let neu = *l - vt * r[k].m;
                    let neu = if neu > grenze { grenze } else if neu < -grenze { -grenze } else { neu };
                    stoss(&mut t, a, b, &r[k], neu - *l);
                    *l = neu;
                }
            }
            // Drehung der Kontaktfläche: Kippen um die Tangenten (Hebel = Ausdehnung der Fläche quer dazu) und Bohren um die
            // Normale (Hebel · μ), begrenzt durch die Summe der Normalimpulse
            for k in 0..3 {
                if !(f.hebel[k] > 0.0 && f.m[k] > 0.0) {
                    continue;
                }
                let ax = f.achsen[k];
                let wr = punkt(t[b].w, ax) - punkt(t[a].w, ax);
                let grenze = f.hebel[k] * summe;
                let neu = f.l[k] - wr * f.m[k];
                let neu = if neu > grenze { grenze } else if neu < -grenze { -grenze } else { neu };
                let d = neu - f.l[k];
                f.l[k] = neu;
                t[a].w = minus(t[a].w, mal(f.ia[k], d));
                t[b].w = plus(t[b].w, mal(f.ib[k], d));
            }
        }
    }
    for (l, tt) in leiber.iter_mut().zip(&t) {
        l.v = tt.v;
        l.w = tt.w;
    }
    // Positionskorrektur: dx/dθ zusätzlich zum Weg tempo · dt (linearisiert über dieselben Hebel)
    for it in 0..LAGEN {
        for nr in 0..m {
            let i = if it % 2 == 0 { nr } else { m - 1 - nr };
            let c = &kontakte[i];
            let r = &z[i][0];
            if r.m == 0.0 {
                continue;
            }
            let (a, b) = (&leiber[c.a], &leiber[c.b]);
            let wa = punkt(plus(mal(a.v, DT), a.dx), r.d) + punkt(plus(mal(a.w, DT), a.dth), r.ja);
            let wb = punkt(plus(mal(b.v, DT), b.dx), r.d) + punkt(plus(mal(b.w, DT), b.dth), r.jb);
            let tiefe = c.tiefe - (wb - wa);
            if !(tiefe > SPIEL) {
                continue;
            }
            let l = (tiefe - SPIEL) * ANTEIL * r.m;
            let (ima, imb) = (a.inv_m, b.inv_m);
            let la = &mut leiber[c.a];
            la.dx = minus(la.dx, mal(r.d, ima * l));
            la.dth = minus(la.dth, mal(r.ia, l));
            let lb = &mut leiber[c.b];
            lb.dx = plus(lb.dx, mal(r.d, imb * l));
            lb.dth = plus(lb.dth, mal(r.ib, l));
        }
    }
    // Weg des Takts = tempo · dt + Korrektur (vor dem Bremsen festgelegt). Die Korrektur bremst danach je Achse das Tempo, gegen
    // das sie schiebt (höchstens bis 0) – sie beschleunigt nie
    for l in leiber.iter_mut() {
        l.dx = plus(mal(l.v, DT), l.dx);
        l.dth = plus(mal(l.w, DT), l.dth);
    }
    for l in leiber.iter_mut() {
        if l.inv_m > 0.0 {
            for d in 0..3 {
                let k = (l.dx[d] - l.v[d] * DT) / DT;
                let v = l.v[d];
                if v > 0.0 && k < 0.0 {
                    l.v[d] = if v + k > 0.0 { v + k } else { 0.0 };
                } else if v < 0.0 && k > 0.0 {
                    l.v[d] = if v + k < 0.0 { v + k } else { 0.0 };
                }
            }
        }
    }
}

// Wurzel der Insel (Vereinigung nach Index, Pfad halbiert).
fn wurzel(e: &mut [usize], mut i: usize) -> usize {
    while e[i] != i {
        e[i] = e[e[i]];
        i = e[i];
    }
    i
}

/// Länge eines Eintrags im Warmstart-Speicher: Partner-Teil, Punkt in den Achsen des Halters (3), normal, reib1, reib2.
const EINTRAG: usize = 7;
/// Höchster Abstand (Einheiten) zwischen einem Kontaktpunkt und seinem Vorgänger aus dem letzten Takt für den Warmstart.
const WARM_ABSTAND: f64 = 0.05;

/// Impulse des nächsten Punkts desselben Paars aus dem letzten Takt (Abstand im Körperrahmen des Halters bis
/// [`WARM_ABSTAND`], jeder alte Punkt höchstens einmal; Gleichstand: der frühere). Merkmale wechseln bei kleinen Drehungen
/// (Schnittpunkte statt Ecken) – der Ort bleibt.
fn warmstart(liste: &[f64], partner: f64, lokal: V, benutzt: &mut [bool], c: &mut Kontakt) {
    let mut best: Option<(f64, usize)> = None;
    let mut q = 0;
    while q + EINTRAG <= liste.len() {
        if liste[q] == partner && !benutzt[q / EINTRAG] {
            let d = minus([liste[q + 1], liste[q + 2], liste[q + 3]], lokal);
            let d2 = punkt(d, d);
            if d2 <= WARM_ABSTAND * WARM_ABSTAND && best.is_none_or(|(b, _)| d2 < b) {
                best = Some((d2, q));
            }
        }
        q += EINTRAG;
    }
    if let Some((_, q)) = best {
        benutzt[q / EINTRAG] = true;
        c.ln = liste[q + 4];
        c.lt1 = liste[q + 5];
        c.lt2 = liste[q + 6];
    }
}

#[inline]
fn bits_gleich(a: f64, b: f64) -> bool {
    a.to_bits() == b.to_bits()
}

fn takt(w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    if n == 0 {
        return;
    }
    let Some(si) = w.art_index("Schwung") else { return };
    // Wasserflächen (H-K28) nur, wenn ein Körper Auftrieb hat – sonst rechnet der Takt wie vorher
    let wasser = if s.zahl(AUFTRIEB).iter().any(|&a| a > 0.0) { super::wasser::flaechen_wach(w) } else { Vec::new() };
    // 1. Lage übernehmen, Kräfte
    let mut leiber: Vec<Leib> = Vec::with_capacity(n);
    let mut von_zeile = vec![usize::MAX; n];
    for z in 0..n {
        let teil = s.teil[z];
        let Some(tz) = wach(w, teil) else { continue };
        w.aktualisiere(tz);
        let m = w.teile.welt[tz];
        if s.zahl(FUER)[z] != teil as f64 {
            s.zahl_mut(FUER)[z] = teil as f64;
            s.zahl_mut(QW)[z] = 0.0;
            s.zahl_mut(STILLE)[z] = 0.0;
            s.zahl_mut(SCHLAEFT)[z] = 0.0;
            if let Spalte::Puffer(v) = &mut s.spalten[KONTAKTE] {
                v[z].clear();
            }
        }
        let l = w.teile.lage[tz];
        let felder = [lage::X, lage::Y, lage::Z, lage::DREHUNG, lage::NEIGUNG, lage::ROLLEN];
        let neu = (0..4).all(|k| s.zahl(QW + k)[z] == 0.0) || (0..6).any(|k| !bits_gleich(l[felder[k]], s.zahl(GESCHRIEBEN + k)[z]));
        let q = if neu {
            s.zahl_mut(STILLE)[z] = 0.0;
            s.zahl_mut(SCHLAEFT)[z] = 0.0;
            quaternion(&kollision3d::achsen(&m).0)
        } else {
            [s.zahl(QW)[z], s.zahl(QW + 1)[z], s.zahl(QW + 2)[z], s.zahl(QW + 3)[z]]
        };
        let a = s.zahl(ART_FELD)[z] as u32;
        let mut v = [s.zahl(TEMPO_X)[z], s.zahl(TEMPO_Y)[z], s.zahl(TEMPO_Z)[z]];
        let mut om = [s.zahl(DREHTEMPO_X)[z] * GRAD, s.zahl(DREHTEMPO_Y)[z] * GRAD, s.zahl(DREHTEMPO_Z)[z] * GRAD];
        let stoss = [s.zahl(STOSS_X)[z], s.zahl(STOSS_Y)[z], s.zahl(STOSS_Z)[z]];
        for k in 0..3 {
            s.zahl_mut(STOSS_X + k)[z] = 0.0;
        }
        let mut schlaeft = s.zahl(SCHLAEFT)[z] != 0.0;
        if a == art::DYNAMISCH && schlaeft && (stoss != [0.0; 3] || v != [0.0; 3] || om != [0.0; 3]) {
            schlaeft = false;
        }
        // H-K28: über Wasser schläft ein Körper mit Auftrieb nicht (er schaukelt bzw. pendelt sich ein)
        if a == art::DYNAMISCH && schlaeft && s.zahl(AUFTRIEB)[z] > 0.0 && super::wasser::unter(&wasser, m[3], m[11]).is_some() {
            schlaeft = false;
        }
        if a != art::DYNAMISCH {
            schlaeft = false;
        }
        let sperre = s.zahl(DREHSPERRE)[z] != 0.0;
        if a == art::DYNAMISCH && !schlaeft {
            let ma = s.zahl(MASSE)[z];
            v = plus(v, mal(stoss, 1.0 / ma));
            v[1] -= s.zahl(SCHWERKRAFT)[z] * DT;
            let da = s.zahl(DAEMPFUNG)[z];
            if da != 0.0 {
                v = mal(v, libm::pow(1.0 - da, DT));
            }
            let dd = s.zahl(DREHDAEMPFUNG)[z];
            if dd != 0.0 {
                om = mal(om, libm::pow(1.0 - dd, DT));
            }
            if sperre {
                om = [0.0; 3];
            }
        }
        if a == art::FEST {
            v = [0.0; 3];
            om = [0.0; 3];
        }
        if !schlaeft {
            s.zahl_mut(AM_BODEN)[z] = 0.0;
        }
        let dyn_ = a == art::DYNAMISCH;
        von_zeile[z] = leiber.len();
        leiber.push(Leib {
            teil,
            zeile: z,
            art: a,
            wach: dyn_ && !schlaeft,
            x: [m[3], m[7], m[11]],
            q,
            v,
            w: om,
            o: [0.0; 3],
            inv_m: if dyn_ && !schlaeft { 1.0 / s.zahl(MASSE)[z] } else { 0.0 },
            inv_i: [0.0; 3],
            ii: [[0.0; 3]; 3],
            abprall: s.zahl(ABPRALL)[z],
            reibung: s.zahl(REIBUNG)[z],
            am_boden: false,
            dx: [0.0; 3],
            dth: [0.0; 3],
        });
        s.zahl_mut(SCHLAEFT)[z] = if schlaeft { 1.0 } else { 0.0 };
    }
    // 2. Formen der festen 3D-Fühler (Speicher des Fühlers kurz herausnehmen und immer zurücklegen)
    let mut k: Vec<Kandidat> = Vec::new();
    let mut formen: Vec<Form> = Vec::new();
    let mut kl: Vec<usize> = Vec::new(); // Kandidat → Leib
    if let Some(fi) = w.art_index("Fuehler") {
        let fs = core::mem::take(&mut w.speicher[fi]);
        let gesammelt = {
            let au = fs.zahl(fuehler::AUSLOESER);
            fuehler::sammle_wenn(w, &fs, |z| au[z] == 0.0)
        };
        for &(fz, c) in &gesammelt {
            if !c.drei_d {
                continue;
            }
            let tz = w.zeile_opt(c.teil).expect("Kandidat lebt");
            let zeile = w.komp_zeile(tz, si).filter(|&z| von_zeile[z] != usize::MAX);
            let beweglich = zeile.is_some_and(|z| leiber[von_zeile[z]].art != art::FEST);
            let Some(form) = kollision3d::form_aus_fuehler(w, &fs, fz, tz, c.huelle, beweglich) else { continue };
            let kasten = match form {
                Form::Netz { netz, .. } => {
                    kollision3d::baum_bereit(&mut w.ressourcen, netz);
                    match c.huelle {
                        Huelle::Kasten(lo, hi) => (lo, hi),
                        _ => continue,
                    }
                }
                Form::Gelaende { .. } => match c.huelle {
                    Huelle::Kasten(lo, hi) => (lo, hi),
                    _ => continue,
                },
                _ => match kollision3d::umschliesse(&form, &w.ressourcen) {
                    Some(b) => b,
                    None => continue,
                },
            };
            let li = match zeile {
                Some(z) => {
                    let li = von_zeile[z];
                    let l = &mut leiber[li];
                    if let Form::Kugel { m, .. } | Form::Kapsel { m, .. } | Form::Kasten { m, .. } = form {
                        // Schwerpunkt = Mitte der Form
                        l.o = mat_t_mal(&matrix(&l.q), minus(m, l.x));
                        l.x = m;
                    }
                    let sperre = s.zahl(DREHSPERRE)[z] != 0.0;
                    if l.art == art::DYNAMISCH && !sperre {
                        l.inv_i = inv_traegheit(&form, s.zahl(MASSE)[z]);
                    }
                    li
                }
                None => {
                    leiber.push(Leib::fest(c.teil));
                    leiber.len() - 1
                }
            };
            let r = kollision3d::RAND;
            let (lo, hi) = (kasten.0, kasten.1);
            k.push(Kandidat { huelle: Huelle::Kasten([lo[0] - r, lo[1] - r, lo[2] - r], [hi[0] + r, hi[1] + r, hi[2] + r]), ..c });
            formen.push(form);
            kl.push(li);
        }
        w.speicher[fi] = fs;
    }
    for l in leiber.iter_mut() {
        if l.wach {
            l.ii = traegheit_welt(&matrix(&l.q), l.inv_i);
        }
    }
    // H-K28: Auftrieb – Eintauchtiefe an 5 Messpunkten der Form gegen den Wasserspiegel (Gerstner, `wasser::hoehe`), je Punkt
    // ein Fünftel der Kraft am Punkt (Drehmoment), dazu Strömungsdämpfung nach dem eingetauchten Anteil
    let mut schwimmt = vec![false; leiber.len()];
    if !wasser.is_empty() {
        for (c, &li) in kl.iter().enumerate() {
            let l = &mut leiber[li];
            if !l.wach || l.zeile == usize::MAX || kl.iter().position(|&x| x == li) != Some(c) {
                continue;
            }
            let auf = s.zahl(AUFTRIEB)[l.zeile];
            if !(auf > 0.0) {
                continue;
            }
            let Some((punkte, e)) = kollision3d::auftrieb_punkte(&formen[c]) else { continue };
            let g = s.zahl(SCHWERKRAFT)[l.zeile];
            let mut summe = 0.0;
            for p in punkte {
                let Some(f) = super::wasser::unter(&wasser, p[0], p[2]) else { continue };
                let h = super::wasser::hoehe(f, p[0], p[2]);
                let mut d = (h - (p[1] - e)) / (2.0 * e);
                if !(d > 0.0) {
                    continue;
                }
                if d > 1.0 {
                    d = 1.0;
                }
                summe += d;
                // Kraftstoß je Punkt (je Masseneinheit): auftrieb · schwerkraft · d / 5 · dt nach oben
                let dv = auf * g * d * 0.2 * DT;
                l.v[1] += dv;
                let r = minus(p, l.x);
                l.w = plus(l.w, mat_mal(&l.ii, kreuz(r, [0.0, dv / l.inv_m, 0.0])));
            }
            if summe > 0.0 {
                schwimmt[li] = true;
                let anteil = summe * 0.2;
                l.v = mal(l.v, libm::exp(-WASSER_DAEMPFUNG * anteil * DT));
                l.w = mal(l.w, libm::exp(-WASSER_DREHDAEMPFUNG * anteil * DT));
            }
        }
    }
    let paare = if k.is_empty() { Vec::new() } else { fuehler::breitphase(&k) };
    // 3. Inseln und Wecken
    let mut eltern: Vec<usize> = (0..leiber.len()).collect();
    let dyn_ = |l: &Leib| l.art == art::DYNAMISCH && l.zeile != usize::MAX;
    let mut weck = vec![false; leiber.len()];
    for &(i, j) in &paare {
        let (a, b) = (kl[i], kl[j]);
        if dyn_(&leiber[a]) && dyn_(&leiber[b]) {
            let (ra, rb) = (wurzel(&mut eltern, a), wurzel(&mut eltern, b));
            if ra != rb {
                if ra < rb {
                    eltern[rb] = ra;
                } else {
                    eltern[ra] = rb;
                }
            }
        }
        // ein bewegter kinematischer Nachbar weckt
        if leiber[a].art == art::KINEMATISCH && leiber[a].bewegt() {
            weck[b] = true;
        }
        if leiber[b].art == art::KINEMATISCH && leiber[b].bewegt() {
            weck[a] = true;
        }
    }
    // Schläfer, deren letzter Kontaktpartner fehlt, wachen auf
    let mut teile_da: Vec<u32> = kl.iter().map(|&i| leiber[i].teil).collect();
    teile_da.sort_unstable();
    if let Spalte::Puffer(cache) = &s.spalten[KONTAKTE] {
        for (i, l) in leiber.iter().enumerate() {
            if dyn_(l) && !l.wach {
                let liste = &cache[l.zeile];
                let mut q = 0;
                while q + EINTRAG <= liste.len() {
                    if teile_da.binary_search(&(liste[q] as u32)).is_err() {
                        weck[i] = true;
                    }
                    q += EINTRAG;
                }
            }
        }
    }
    let mut insel_wach = vec![false; leiber.len()];
    for i in 0..leiber.len() {
        if dyn_(&leiber[i]) && (leiber[i].wach || weck[i]) {
            let r = wurzel(&mut eltern, i);
            insel_wach[r] = true;
        }
    }
    for i in 0..leiber.len() {
        if dyn_(&leiber[i]) && !leiber[i].wach {
            let r = wurzel(&mut eltern, i);
            if insel_wach[r] {
                let z = leiber[i].zeile;
                let l = &mut leiber[i];
                l.wach = true;
                l.inv_m = 1.0 / s.zahl(MASSE)[z];
                if s.zahl(DREHSPERRE)[z] == 0.0 {
                    // Trägheit aus der Form (falls vorhanden): neu aus der Kandidatenliste
                    if let Some(c) = kl.iter().position(|&x| x == i) {
                        l.inv_i = inv_traegheit(&formen[c], s.zahl(MASSE)[z]);
                    }
                }
                l.ii = traegheit_welt(&matrix(&l.q), l.inv_i);
                s.zahl_mut(SCHLAEFT)[z] = 0.0;
                s.zahl_mut(STILLE)[z] = 0.0;
                s.zahl_mut(AM_BODEN)[z] = 0.0;
                // Kräfte des Takts nachholen (Schwerkraft)
                l.v[1] -= s.zahl(SCHWERKRAFT)[z] * DT;
            }
        }
    }
    // 4. Engphase
    let mut kontakte: Vec<Kontakt> = Vec::new();
    {
        let mut punkte = Vec::new();
        let mut benutzt: Vec<bool> = Vec::new();
        let umgebung = Umgebung { ressourcen: &w.ressourcen, gelaende: w.art_index("Gelaende").map(|g| &w.speicher[g]) };
        let leer: Vec<f64> = Vec::new();
        let cache: &Vec<Vec<f64>> = match &s.spalten[KONTAKTE] {
            Spalte::Puffer(v) => v,
            _ => unreachable!("Schwung: Pufferspalte"),
        };
        for &(i, j) in &paare {
            let (a, b) = (kl[i], kl[j]);
            if !(leiber[a].wach || leiber[b].wach) {
                continue;
            }
            punkte.clear();
            kollision3d::kontakte(&formen[i], &formen[j], &umgebung, &mut punkte);
            if punkte.is_empty() {
                continue;
            }
            // Merkmal-Reihenfolge innerhalb des Paars (stabil)
            punkte.sort_by_key(|p| p.merkmal);
            let (la, lb) = (leiber[a], leiber[b]);
            let (halter, partner, hl) = if dyn_(&la) { (la.zeile, lb.teil, la) } else { (lb.zeile, la.teil, lb) };
            let liste = if halter == usize::MAX { &leer } else { &cache[halter] };
            let rh = matrix(&hl.q);
            benutzt.clear();
            benutzt.resize(liste.len() / EINTRAG, false);
            for p in &punkte {
                let (ra, rb) = (minus(p.p, la.x), minus(p.p, lb.x));
                let (t1, t2) = tangenten(p.n);
                let vn = punkt(minus(lb.tempo_bei(rb), la.tempo_bei(ra)), p.n);
                let e = if la.abprall > lb.abprall { la.abprall } else { lb.abprall };
                let mut c = Kontakt {
                    a,
                    b,
                    n: p.n,
                    t1,
                    t2,
                    tiefe: p.tiefe,
                    ra,
                    rb,
                    ziel: {
                        // Abprall erst ab ABPRALL_AB; vor der Berührung (Tiefe < 0) darf er sich bis zur Berührung nähern
                        let prall = if -vn > ABPRALL_AB { -e * vn } else { 0.0 };
                        if p.tiefe < 0.0 {
                            let frei = p.tiefe / DT;
                            if vn < frei && prall > frei {
                                prall
                            } else {
                                frei
                            }
                        } else {
                            prall
                        }
                    },
                    ln: 0.0,
                    lt1: 0.0,
                    lt2: 0.0,
                };
                warmstart(liste, partner as f64, mat_t_mal(&rh, minus(p.p, hl.x)), &mut benutzt, &mut c);
                // amBoden: der Kontakt drückt den Körper nach oben
                if p.n[1] > 0.5 {
                    leiber[b].am_boden = true;
                }
                if p.n[1] < -0.5 {
                    leiber[a].am_boden = true;
                }
                kontakte.push(c);
            }
        }
    }
    // 5. Lösen (ohne Kontakte bewegt Schritt 7 alle mit tempo · dt)
    if !kontakte.is_empty() {
        loese(&mut leiber, &mut kontakte);
    } else {
        for l in leiber.iter_mut() {
            l.dx = mal(l.v, DT);
            l.dth = mal(l.w, DT);
        }
    }
    // Warmstart-Speicher: wache dynamische Körper neu füllen, Schläfer behalten ihren
    if let Spalte::Puffer(cache) = &mut s.spalten[KONTAKTE] {
        for l in &leiber {
            if l.zeile != usize::MAX && (l.wach || l.art != art::DYNAMISCH) {
                cache[l.zeile].clear();
            }
        }
        for c in &kontakte {
            if c.ln > 0.0 {
                let (la, lb) = (&leiber[c.a], &leiber[c.b]);
                let (halter, partner, hl) = if dyn_(la) { (la.zeile, lb.teil, la) } else { (lb.zeile, la.teil, lb) };
                if halter != usize::MAX {
                    let lp = mat_t_mal(&matrix(&hl.q), minus(plus(la.x, c.ra), hl.x));
                    cache[halter].extend_from_slice(&[partner as f64, lp[0], lp[1], lp[2], c.ln, c.lt1, c.lt2]);
                }
            }
        }
    }
    // 6. Schlafen: Stille je wachem Körper, Inseln ganz oder gar nicht
    let mut insel_still = vec![true; leiber.len()];
    for i in 0..leiber.len() {
        let l = leiber[i];
        if !(dyn_(&l) && l.wach) {
            continue;
        }
        let z = l.zeile;
        let still = !schwimmt[i] && punkt(l.v, l.v) < SCHLAF_TEMPO * SCHLAF_TEMPO && punkt(l.w, l.w) < SCHLAF_DREH * SCHLAF_DREH;
        let st = if still { s.zahl(STILLE)[z] + 1.0 } else { 0.0 };
        s.zahl_mut(STILLE)[z] = st;
        if st < SCHLAF_TAKTE {
            let r = wurzel(&mut eltern, i);
            insel_still[r] = false;
        }
    }
    // 7. Bewegen und zurückschreiben (in Speicher-Reihenfolge)
    for z in 0..n {
        let li = von_zeile[z];
        if li == usize::MAX {
            continue;
        }
        let mut l = leiber[li];
        if l.art == art::FEST {
            continue;
        }
        if l.wach {
            let r = wurzel(&mut eltern, li);
            if insel_still[r] {
                l.v = [0.0; 3];
                l.w = [0.0; 3];
                l.dx = [0.0; 3];
                l.dth = [0.0; 3];
                s.zahl_mut(SCHLAEFT)[z] = 1.0;
            }
        } else if l.art == art::DYNAMISCH {
            continue; // schläft: Lage, Tempo und amBoden bleiben
        }
        let x = plus(l.x, l.dx);
        let q = drehe(&l.q, l.dth);
        // Ursprung des Teils aus dem Schwerpunkt
        let rm = matrix(&q);
        let ursprung = minus(x, mat_mal(&rm, l.o));
        let tz = w.zeile_opt(l.teil).expect("Schwung-Teil lebt");
        let e = w.teile.eltern[tz];
        let (lokal, lr) = match w.zeile_opt(e).filter(|_| e != 0) {
            Some(pz) => {
                w.aktualisiere(pz);
                let p = w.teile.welt[pz];
                match kollision3d::invers(&p) {
                    Some(inv) => {
                        let (pa, _) = kollision3d::achsen(&p);
                        let lr = [mat_t_mal(&pa, rm[0]), mat_t_mal(&pa, rm[1]), mat_t_mal(&pa, rm[2])];
                        (crate::welt::punkt_3d(&inv, ursprung), lr)
                    }
                    None => continue,
                }
            }
            None => (ursprung, rm),
        };
        let (dr, ne, ro) = winkel(&lr);
        let werte = [lokal[0], lokal[1], lokal[2], dr, ne, ro];
        {
            let lg = &mut w.teile.lage[tz];
            lg[lage::X] = werte[0];
            lg[lage::Y] = werte[1];
            lg[lage::Z] = werte[2];
            lg[lage::DREHUNG] = werte[3];
            lg[lage::NEIGUNG] = werte[4];
            lg[lage::ROLLEN] = werte[5];
        }
        w.markiere(tz);
        for (kk, x) in werte.iter().enumerate() {
            s.zahl_mut(GESCHRIEBEN + kk)[z] = *x;
        }
        for (kk, x) in q.iter().enumerate() {
            s.zahl_mut(QW + kk)[z] = *x;
        }
        if l.art == art::DYNAMISCH {
            for kk in 0..3 {
                s.zahl_mut(TEMPO_X + kk)[z] = l.v[kk];
                s.zahl_mut(DREHTEMPO_X + kk)[z] = l.w[kk] / GRAD;
            }
            if l.am_boden {
                s.zahl_mut(AM_BODEN)[z] = 1.0;
            }
        }
    }
}

