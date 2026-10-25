//! Gemeinsame 3D-Kollision (H-K17, HERD.md §13.1 Regel 9): Formen in Weltlage, Engphase mit Kontaktpunkten, Hüllen-Baum je
//! Netz (einmal je Ressourcen-ID, Cache in [`crate::ressourcen::Ressourcen::baeume`], nicht im Hash) und das Höhenraster des
//! `Gelaende` analytisch. `Schwung` (H-K17) löst damit Kontakte; `Figur`/`Strahl` (H-K20), Funken-Aufprall (H-K25, [`Gitter`]
//! für viele kurze Strecken) und `Wasser` (H-K28) erweitern es nur additiv.
//!
//! Formen ([`Form`]): Kugel, Kapsel (Strecke + Radius, Achse y des Teils), Kasten (gedreht: Mitte, drei Einheitsachsen, halbe
//! Seiten), Netz (Dreiecke einer Form-Ressource unter der Welt-Matrix, nur fest) und Gelände (Höhenraster, nur fest). Der Bau aus
//! einem `Fuehler` steht in [`form_aus_fuehler`].
//!
//! Engphase ([`kontakte`]): Normale immer von A nach B, Tiefe ≥ 0 bei Überlappung (bis −[`RAND`] davor), Kontaktpunkt in der Mitte zwischen den
//! Oberflächen, `merkmal` = feste Kennung des Merkmals (Ecke, Fläche, Endpunkt) für den Warmstart. Kugel/Kapsel geschlossen,
//! Kasten–Kasten über 15 Trennachsen (Flächen bevorzugt) mit bis zu 4 Punkten (Gegenfläche gegen die Seiten der Bezugsfläche
//! geschnitten), Kanten–Kanten ein Punkt. Gegen Netz-Dreiecke: einseitig (Vorderseite = gegen den Uhrzeigersinn), Kugel/Kapsel
//! über den nächsten Punkt, Kasten über Trennachsen + eindringende Ecken bzw. Dreiecksecken im Kasten. Gelände: je Probepunkt
//! (Kugelmitte, Kapsel-Enden, Kasten-Ecken) die Ebene des Dreiecks darunter – genau das gezeichnete Netz (`gelaende::punkt`),
//! ohne Kanten-Hängenbleiben an den Zellfugen.
//!
//! Alles f64, nur `libm::sqrt`, Reihenfolgen fest (keine `HashMap`, K-129).

use alloc::vec::Vec;

use crate::formen::{self, Netz};
use crate::komponenten::{betrag, fuehler, gelaende, Huelle};
use crate::ressourcen::Ressourcen;
use crate::schema::Speicher;
use crate::welt::{kasten_3d, punkt_3d, Welt};

/// 3D-Vektor.
pub type V = [f64; 3];

#[inline]
pub fn plus(a: V, b: V) -> V {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
#[inline]
pub fn minus(a: V, b: V) -> V {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
#[inline]
pub fn mal(a: V, s: f64) -> V {
    [a[0] * s, a[1] * s, a[2] * s]
}
#[inline]
pub fn punkt(a: V, b: V) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
#[inline]
pub fn kreuz(a: V, b: V) -> V {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
#[inline]
pub fn laenge(a: V) -> f64 {
    libm::sqrt(punkt(a, a))
}
/// Einheitsvektor oder `ersatz` (Länge 0, nicht endlich).
#[inline]
pub fn norm_oder(a: V, ersatz: V) -> V {
    let l = laenge(a);
    if l > 1e-300 && l.is_finite() {
        [a[0] / l, a[1] / l, a[2] / l]
    } else {
        ersatz
    }
}
#[inline]
fn klemme(x: f64, lo: f64, hi: f64) -> f64 {
    if x < lo {
        lo
    } else if x > hi {
        hi
    } else {
        x
    }
}
const OBEN: V = [0.0, 1.0, 0.0];

/// Kontaktrand (Einheiten): Punkte bis zu diesem Abstand **vor** der Berührung zählen schon als Kontakt (Tiefe negativ). Der
/// Löser lässt die Annäherung bis zur Berührung zu (spekulativer Kontakt) – so flackern ruhende Kontakte nicht ein und aus.
pub const RAND: f64 = 0.01;
/// Toleranz beim Schneiden der Gegenfläche (Einheiten): so nah an einer Seite gilt als darauf.
const KLEBEN: f64 = 1e-7;

/// Spalte `j` (0 … 2) des linearen Teils einer 3D-Welt-Matrix (3 × 4 zeilenweise).
#[inline]
pub fn spalte(m: &[f64; 12], j: usize) -> V {
    [m[j], m[4 + j], m[8 + j]]
}

/// Orthonormale Achsen (Spalten) einer Welt-Matrix nach Gram-Schmidt (x, dann y, z = x × y) und die Längen der Spalten
/// (Maßstab je lokaler Achse). Entartete Spalten fallen auf die Weltachsen zurück.
pub fn achsen(m: &[f64; 12]) -> ([V; 3], V) {
    let (c0, c1, c2) = (spalte(m, 0), spalte(m, 1), spalte(m, 2));
    let s = [laenge(c0), laenge(c1), laenge(c2)];
    let u0 = norm_oder(c0, [1.0, 0.0, 0.0]);
    let u1 = norm_oder(minus(c1, mal(u0, punkt(c1, u0))), if betrag(u0[1]) < 0.9 { norm_oder(kreuz([0.0, 0.0, 1.0], u0), OBEN) } else { norm_oder(kreuz(u0, [1.0, 0.0, 0.0]), OBEN) });
    let u2 = kreuz(u0, u1);
    ([u0, u1, u2], s)
}

/// Inverse einer affinen 3D-Matrix (3 × 4 zeilenweise); `None`, wenn der lineare Teil singulär ist.
pub fn invers(m: &[f64; 12]) -> Option<[f64; 12]> {
    let (a, b, c) = (m[0], m[1], m[2]);
    let (d, e, f) = (m[4], m[5], m[6]);
    let (g, h, i) = (m[8], m[9], m[10]);
    let k0 = e * i - f * h;
    let k1 = f * g - d * i;
    let k2 = d * h - e * g;
    let det = a * k0 + b * k1 + c * k2;
    if !(det != 0.0 && det.is_finite()) {
        return None;
    }
    let r = 1.0 / det;
    let l = [
        k0 * r,
        (c * h - b * i) * r,
        (b * f - c * e) * r,
        k1 * r,
        (a * i - c * g) * r,
        (c * d - a * f) * r,
        k2 * r,
        (b * g - a * h) * r,
        (a * e - b * d) * r,
    ];
    let t = [m[3], m[7], m[11]];
    let mut o = [0.0; 12];
    for z in 0..3 {
        o[z * 4] = l[z * 3];
        o[z * 4 + 1] = l[z * 3 + 1];
        o[z * 4 + 2] = l[z * 3 + 2];
        o[z * 4 + 3] = -(l[z * 3] * t[0] + l[z * 3 + 1] * t[1] + l[z * 3 + 2] * t[2]);
    }
    Some(o)
}

/// Achsenparalleler Kasten in Weltlage: min, max.
pub type Kasten = (V, V);

/// Eine Kollisionsform in Weltlage.
#[derive(Clone, Copy, Debug)]
pub enum Form {
    Kugel { m: V, r: f64 },
    /// Strecke m ± achse · halb (achse Länge 1), Radius r
    Kapsel { m: V, achse: V, halb: f64, r: f64 },
    /// gedrehter Quader: Mitte, Einheitsachsen, halbe Seiten (≥ 0)
    Kasten { m: V, achsen: [V; 3], h: V },
    /// Dreiecke der Form-Ressource `netz` unter `welt` (fest)
    Netz { netz: u32, welt: [f64; 12], inv: [f64; 12] },
    /// Höhenraster des `Gelaende` in Speicherzeile `zeile` unter `welt` (fest)
    Gelaende { zeile: usize, welt: [f64; 12], inv: [f64; 12] },
}

impl Form {
    /// Rang für die Engphase (die kleinere Art ist A).
    fn rang(&self) -> u8 {
        match self {
            Form::Kugel { .. } => 0,
            Form::Kapsel { .. } => 1,
            Form::Kasten { .. } => 2,
            Form::Netz { .. } => 3,
            Form::Gelaende { .. } => 4,
        }
    }
    /// Kann sich bewegen (Kugel, Kapsel, Kasten); Netz und Gelände sind nur fest.
    pub fn beweglich(&self) -> bool {
        self.rang() < 3
    }
}

/// Achsenparalleles Umschließendes einer Form (Netz/Gelände: um das gebaute Netz).
pub fn umschliesse(f: &Form, r: &Ressourcen) -> Option<Kasten> {
    Some(match *f {
        Form::Kugel { m, r } => ([m[0] - r, m[1] - r, m[2] - r], [m[0] + r, m[1] + r, m[2] + r]),
        Form::Kapsel { m, achse, halb, r } => {
            let mut lo = [0.0; 3];
            let mut hi = [0.0; 3];
            for k in 0..3 {
                let e = betrag(achse[k]) * halb + r;
                lo[k] = m[k] - e;
                hi[k] = m[k] + e;
            }
            (lo, hi)
        }
        Form::Kasten { m, achsen, h } => {
            let mut lo = [0.0; 3];
            let mut hi = [0.0; 3];
            for k in 0..3 {
                let e = betrag(achsen[0][k]) * h[0] + betrag(achsen[1][k]) * h[1] + betrag(achsen[2][k]) * h[2];
                lo[k] = m[k] - e;
                hi[k] = m[k] + e;
            }
            (lo, hi)
        }
        Form::Netz { netz, welt, .. } => {
            let n = r.netz(netz)?;
            kasten_3d(&welt, [n.min.x as f64, n.min.y as f64, n.min.z as f64], [n.max.x as f64, n.max.y as f64, n.max.z as f64])
        }
        Form::Gelaende { .. } => return None, // kommt aus der Hülle des Fühlers
    })
}

// ------------------------------------------------------------------------------------------------ Bau aus dem Fühler

/// Lokale Hülle (min, max in den Achsen des Teils) der ersten Komponente mit Netz am Teil: `Koerper`, sonst gebautes
/// `Gelaende`. Dazu, ob sie vom Gelände stammt, und die Netz-Ressource.
pub fn lokale_huelle(w: &Welt, tz: usize) -> Option<(V, V, u32, Option<usize>)> {
    if let Some(k) = w.art_index("Koerper") {
        if let Some(kz) = w.komp_zeile(tz, k) {
            let id = w.speicher[k].zahl(crate::komponenten::koerper::FORM)[kz] as u32;
            if let Some(n) = w.ressourcen.netz(id) {
                return Some((v3(n.min), v3(n.max), id, None));
            }
        }
    }
    if let Some(g) = w.art_index("Gelaende") {
        if let Some(gz) = w.komp_zeile(tz, g) {
            let id = w.speicher[g].zahl(gelaende::NETZ)[gz] as u32;
            if let Some(n) = w.ressourcen.netz(id) {
                return Some((v3(n.min), v3(n.max), id, Some(gz)));
            }
        }
    }
    None
}

#[inline]
fn v3(p: crate::mathe::V3) -> V {
    [p.x as f64, p.y as f64, p.z as f64]
}

fn halb_max(lo: V, hi: V) -> f64 {
    let mut r = 0.0;
    for k in 0..3 {
        let e = (hi[k] - lo[k]) * 0.5;
        if e > r {
            r = e;
        }
    }
    r
}

/// Form des 3D-Fühlers in Speicherzeile `z` von `fs` (Speicher der Art `Fuehler`) am Teil in Zeile `tz` (Welt-Matrix aktuell)
/// für die Physik – **gedreht** mit dem Teil (K-162). `huelle` = die achsenparallele Form aus `fuehler::form` (Rückfall, wenn
/// kein Netz am Teil Maße liefert). `beweglich`: der Körper bewegt sich (Netz wird dann zum Kasten um das Netz).
///
/// - `kugel`/`kreis`: Mitte = Lage + Versatz, Radius = `radius` × größter Maßstab; `radius` 0 → halbe größte Seite der lokalen
///   Hülle (Mitte der Hülle + Versatz).
/// - `kasten`/`rechteck`/`auto`: Quader `breite` × `hoehe` × `tiefe` in den Achsen des Teils, jede Seite 0 aus der lokalen Hülle;
///   `auto` = ganz die Hülle.
/// - `kapsel`: Achse y des Teils, `radius` × größter Maßstab von x/z, `hoehe` (gesamt, mit den Halbkugeln) × Maßstab y; fehlt
///   eines, kommt es aus der lokalen Hülle (Radius = halbe größere Seite in x/z, Höhe = Seite y); ohne Hülle und Höhe ist die
///   Kapsel eine Kugel.
/// - `netz`: fest die Dreiecke des `Koerper` bzw. das Höhenraster des `Gelaende`; beweglich wie `auto`.
pub fn form_aus_fuehler(w: &Welt, fs: &Speicher, z: usize, tz: usize, huelle: Huelle, beweglich: bool) -> Option<Form> {
    let m = w.teile.welt[tz];
    let (u, s) = achsen(&m);
    let v = [fs.zahl(fuehler::VERSATZ_X)[z], fs.zahl(fuehler::VERSATZ_Y)[z], fs.zahl(fuehler::VERSATZ_Z)[z]];
    let art = fs.zahl(fuehler::FORM)[z] as u32;
    let lokal = lokale_huelle(w, tz);
    let smax = if s[0] > s[1] { if s[0] > s[2] { s[0] } else { s[2] } } else if s[1] > s[2] { s[1] } else { s[2] };
    // Rückfall: die achsenparallele Fühler-Form als Kugel bzw. ungedrehter Kasten
    let rueckfall = || -> Option<Form> {
        match huelle {
            Huelle::Kugel(m, r) => Some(Form::Kugel { m, r }),
            Huelle::Kasten(lo, hi) => Some(Form::Kasten {
                m: [(lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5],
                achsen: [[1.0, 0.0, 0.0], OBEN, [0.0, 0.0, 1.0]],
                h: [(hi[0] - lo[0]) * 0.5, (hi[1] - lo[1]) * 0.5, (hi[2] - lo[2]) * 0.5],
            }),
            _ => None,
        }
    };
    let kasten = |masse: V| -> Option<Form> {
        let fehlt = (0..3).any(|k| !(masse[k] > 0.0));
        let (blo, bhi) = match lokal {
            Some((lo, hi, ..)) => (lo, hi),
            None if fehlt => return rueckfall(),
            None => ([0.0; 3], [0.0; 3]),
        };
        let mut c = v;
        let mut h = [0.0; 3];
        for k in 0..3 {
            if masse[k] > 0.0 {
                h[k] = masse[k] * 0.5 * s[k];
            } else {
                c[k] += (blo[k] + bhi[k]) * 0.5;
                h[k] = (bhi[k] - blo[k]) * 0.5 * s[k];
            }
        }
        Some(Form::Kasten { m: punkt_3d(&m, c), achsen: u, h })
    };
    match art {
        fuehler::form::KREIS | fuehler::form::KUGEL => {
            let r = fs.zahl(fuehler::RADIUS)[z];
            if r > 0.0 {
                return Some(Form::Kugel { m: punkt_3d(&m, v), r: r * smax });
            }
            match lokal {
                Some((lo, hi, ..)) => {
                    let c = plus(v, mal(plus(lo, hi), 0.5));
                    Some(Form::Kugel { m: punkt_3d(&m, c), r: halb_max(lo, hi) * smax })
                }
                None => rueckfall(),
            }
        }
        fuehler::form::KAPSEL => {
            let sxz = if s[0] > s[2] { s[0] } else { s[2] };
            let (mut r, mut h) = (fs.zahl(fuehler::RADIUS)[z] * sxz, fs.zahl(fuehler::HOEHE)[z] * s[1]);
            let mut c = v;
            if !(r > 0.0 && h > 0.0) {
                match lokal {
                    Some((lo, hi, ..)) => {
                        if !(r > 0.0) {
                            let (ex, ez) = ((hi[0] - lo[0]) * 0.5, (hi[2] - lo[2]) * 0.5);
                            r = (if ex > ez { ex } else { ez }) * sxz;
                            c[0] += (lo[0] + hi[0]) * 0.5;
                            c[2] += (lo[2] + hi[2]) * 0.5;
                        }
                        if !(h > 0.0) {
                            h = (hi[1] - lo[1]) * s[1];
                            c[1] += (lo[1] + hi[1]) * 0.5;
                        }
                    }
                    None if r > 0.0 => h = 2.0 * r,
                    None => return rueckfall(),
                }
            }
            let halb = h * 0.5 - r;
            Some(Form::Kapsel { m: punkt_3d(&m, c), achse: u[1], halb: if halb > 0.0 { halb } else { 0.0 }, r })
        }
        fuehler::form::NETZ if !beweglich => {
            let inv = invers(&m)?;
            match lokal {
                Some((_, _, id, None)) => Some(Form::Netz { netz: id, welt: m, inv }),
                Some((_, _, _, Some(gz))) => Some(Form::Gelaende { zeile: gz, welt: m, inv }),
                None => rueckfall(),
            }
        }
        fuehler::form::AUTO | fuehler::form::NETZ => kasten([0.0; 3]),
        _ => kasten([fs.zahl(fuehler::BREITE)[z], fs.zahl(fuehler::HOEHE)[z], fs.zahl(fuehler::TIEFE)[z]]),
    }
}

// ------------------------------------------------------------------------------------------------ Hüllen-Baum

/// Knoten des Hüllen-Baums: Kasten (lokal), innen `links` = erstes Kind (das zweite folgt direkt), Blatt `anzahl` > 0 Dreiecke
/// ab `links` in [`Baum::ordnung`].
#[derive(Clone, Copy, Debug)]
struct Knoten {
    lo: V,
    hi: V,
    links: u32,
    anzahl: u32,
}

/// Hüllen-Baum eines Netzes (lokale Koordinaten): Punkte f64 aus den f32-Ecken, Dreiecke, Knoten. Teilung nach dem Mittelpunkt
/// der längsten Seite, stabil in Indexreihenfolge (leer → Hälfte nach Index), Blätter ≤ 4 Dreiecke.
#[derive(Clone, Debug, Default)]
pub struct Baum {
    pub punkte: Vec<V>,
    pub dreiecke: Vec<[u32; 3]>,
    ordnung: Vec<u32>,
    knoten: Vec<Knoten>,
}

/// Cache der Hüllen-Bäume, Index = Ressourcen-ID − 1 (nicht im Szenen-Hash; Ressourcen ändern sich nie).
pub type Baeume = Vec<Option<Baum>>;

const BLATT: usize = 4;

impl Baum {
    pub fn neu(n: &Netz) -> Baum {
        let (punkte, dreiecke) = formen::dreiecke(n);
        let mut b = Baum { ordnung: (0..dreiecke.len() as u32).collect(), punkte, dreiecke, knoten: Vec::new() };
        if !b.dreiecke.is_empty() {
            b.knoten.push(Knoten { lo: [0.0; 3], hi: [0.0; 3], links: 0, anzahl: 0 });
            b.teile(0, 0, b.dreiecke.len());
        }
        b
    }

    fn huelle_dreieck(&self, t: u32) -> (V, V) {
        let d = self.dreiecke[t as usize];
        let mut lo = self.punkte[d[0] as usize];
        let mut hi = lo;
        for &k in &d[1..] {
            let p = self.punkte[k as usize];
            for a in 0..3 {
                if p[a] < lo[a] {
                    lo[a] = p[a];
                }
                if p[a] > hi[a] {
                    hi[a] = p[a];
                }
            }
        }
        (lo, hi)
    }

    fn teile(&mut self, k: usize, a: usize, b: usize) {
        let (mut lo, mut hi) = self.huelle_dreieck(self.ordnung[a]);
        for i in a + 1..b {
            let (l, h) = self.huelle_dreieck(self.ordnung[i]);
            for x in 0..3 {
                if l[x] < lo[x] {
                    lo[x] = l[x];
                }
                if h[x] > hi[x] {
                    hi[x] = h[x];
                }
            }
        }
        self.knoten[k].lo = lo;
        self.knoten[k].hi = hi;
        if b - a <= BLATT {
            self.knoten[k].links = a as u32;
            self.knoten[k].anzahl = (b - a) as u32;
            return;
        }
        let mut achse = 0;
        for x in 1..3 {
            if hi[x] - lo[x] > hi[achse] - lo[achse] {
                achse = x;
            }
        }
        let mitte = (lo[achse] + hi[achse]) * 0.5;
        // stabil teilen: links die mit Schwerpunkt < Mitte (Summe der drei Ecken gegen 3 · Mitte), Reihenfolge bleibt
        let (mut l, mut r): (Vec<u32>, Vec<u32>) = (Vec::new(), Vec::new());
        for i in a..b {
            let t = self.ordnung[i];
            let d = self.dreiecke[t as usize];
            let summe = self.punkte[d[0] as usize][achse] + self.punkte[d[1] as usize][achse] + self.punkte[d[2] as usize][achse];
            if summe < 3.0 * mitte {
                l.push(t);
            } else {
                r.push(t);
            }
        }
        let teilung = if l.is_empty() || r.is_empty() {
            (a + b) / 2
        } else {
            let n = l.len();
            for (i, t) in l.into_iter().chain(r).enumerate() {
                self.ordnung[a + i] = t;
            }
            a + n
        };
        let kind = self.knoten.len();
        self.knoten.push(Knoten { lo: [0.0; 3], hi: [0.0; 3], links: 0, anzahl: 0 });
        self.knoten.push(Knoten { lo: [0.0; 3], hi: [0.0; 3], links: 0, anzahl: 0 });
        self.knoten[k].links = kind as u32;
        self.teile(kind, a, teilung);
        self.teile(kind + 1, teilung, b);
    }

    /// Alle Dreiecke, deren Knoten-Kästen den lokalen Kasten `lo`–`hi` schneiden (Baum-Reihenfolge, fest).
    pub fn suche(&self, lo: V, hi: V, aus: &mut Vec<u32>) {
        if self.knoten.is_empty() {
            return;
        }
        let mut stapel: Vec<u32> = Vec::with_capacity(32);
        stapel.push(0);
        while let Some(k) = stapel.pop() {
            let n = self.knoten[k as usize];
            if !(0..3).all(|x| n.lo[x] <= hi[x] && lo[x] <= n.hi[x]) {
                continue;
            }
            if n.anzahl > 0 {
                aus.extend_from_slice(&self.ordnung[n.links as usize..(n.links + n.anzahl) as usize]);
            } else {
                // rechts zuerst auf den Stapel, damit links zuerst kommt
                stapel.push(n.links + 1);
                stapel.push(n.links);
            }
        }
    }
}

/// Baut fehlende Hüllen-Bäume für die Netz-Ressource `id` (einmal je ID).
pub fn baum_bereit(r: &mut Ressourcen, id: u32) {
    if id == 0 {
        return;
    }
    let i = id as usize - 1;
    if r.baeume.len() <= i {
        r.baeume.resize(i + 1, None);
    }
    if r.baeume[i].is_none() {
        if let Some(n) = r.netz(id) {
            let b = Baum::neu(n);
            r.baeume[i] = Some(b);
        }
    }
}

// ------------------------------------------------------------------------------------------------ Engphase

/// Ein Kontaktpunkt: Punkt (Welt, Mitte zwischen den Oberflächen), Normale von A nach B (Länge 1), Tiefe (≥ 0 bei Überlappung),
/// Merkmal (fest je Ecke/Fläche/Endpunkt, für den Warmstart).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Punkt {
    pub p: V,
    pub n: V,
    pub tiefe: f64,
    pub merkmal: u32,
}

/// Was die Engphase außer den Formen braucht: Ressourcen (Hüllen-Bäume) und den Speicher der Art `Gelaende`.
pub struct Umgebung<'a> {
    pub ressourcen: &'a Ressourcen,
    pub gelaende: Option<&'a Speicher>,
}

/// Kontaktpunkte zwischen A und B (Normalen von A nach B), angehängt an `aus`. Netz/Gelände gegen Netz/Gelände: keine.
pub fn kontakte(a: &Form, b: &Form, u: &Umgebung, aus: &mut Vec<Punkt>) {
    let start = aus.len();
    if a.rang() > b.rang() {
        kontakte_geordnet(b, a, u, aus);
        for p in &mut aus[start..] {
            p.n = mal(p.n, -1.0);
        }
    } else {
        kontakte_geordnet(a, b, u, aus);
    }
}

fn kontakte_geordnet(a: &Form, b: &Form, u: &Umgebung, aus: &mut Vec<Punkt>) {
    match (*a, *b) {
        (Form::Kugel { m: ma, r: ra }, Form::Kugel { m: mb, r: rb }) => {
            if let Some(p) = kugel_kugel(ma, ra, mb, rb, 0) {
                aus.push(p);
            }
        }
        (Form::Kugel { m, r }, Form::Kapsel { m: mk, achse, halb, r: rk }) => {
            let (p0, p1) = strecke(mk, achse, halb);
            let q = naechster_auf_strecke(m, p0, p1);
            if let Some(p) = kugel_kugel(m, r, q, rk, 0) {
                aus.push(p);
            }
        }
        (Form::Kapsel { m: ma, achse: aa, halb: ha, r: ra }, Form::Kapsel { m: mb, achse: ab, halb: hb, r: rb }) => {
            kapsel_kapsel(strecke(ma, aa, ha), ra, strecke(mb, ab, hb), rb, aus)
        }
        (Form::Kugel { m, r }, Form::Kasten { m: mk, achsen, h }) => {
            if let Some(p) = kasten_kugel(mk, &achsen, h, m, r, 0) {
                aus.push(mit_normale(p, -1.0));
            }
        }
        (Form::Kapsel { m, achse, halb, r }, Form::Kasten { m: mk, achsen, h }) => {
            let s = aus.len();
            kasten_kapsel(mk, &achsen, h, strecke(m, achse, halb), r, aus);
            for p in &mut aus[s..] {
                p.n = mal(p.n, -1.0);
            }
        }
        (Form::Kasten { m: ma, achsen: aa, h: ha }, Form::Kasten { m: mb, achsen: ab, h: hb }) => kasten_kasten(ma, &aa, ha, mb, &ab, hb, aus),
        (_, Form::Netz { netz, welt, inv }) => {
            let Some(Some(baum)) = u.ressourcen.baeume.get(netz as usize - 1) else { return };
            let Some((lo, hi)) = umschliesse(a, u.ressourcen) else { return };
            let (llo, lhi) = kasten_3d(&inv, lo, hi);
            let mut tris = Vec::new();
            baum.suche(llo, lhi, &mut tris);
            let s = aus.len();
            for t in tris {
                let d = baum.dreiecke[t as usize];
                let e = [punkt_3d(&welt, baum.punkte[d[0] as usize]), punkt_3d(&welt, baum.punkte[d[1] as usize]), punkt_3d(&welt, baum.punkte[d[2] as usize])];
                gegen_dreieck(a, &e, t, aus);
            }
            // Normalen zeigen vom Netz zum Körper (B → A): umdrehen auf A → B
            for p in &mut aus[s..] {
                p.n = mal(p.n, -1.0);
            }
        }
        (_, Form::Gelaende { zeile, welt, inv }) => {
            let Some(gs) = u.gelaende else { return };
            let raster = Raster::aus(gs, zeile, welt, inv);
            let s = aus.len();
            raster.kontakte(a, aus);
            for p in &mut aus[s..] {
                p.n = mal(p.n, -1.0);
            }
        }
        _ => {}
    }
}

#[inline]
fn mit_normale(mut p: Punkt, f: f64) -> Punkt {
    p.n = mal(p.n, f);
    p
}

#[inline]
fn strecke(m: V, achse: V, halb: f64) -> (V, V) {
    (minus(m, mal(achse, halb)), plus(m, mal(achse, halb)))
}

/// Parameter t ∈ [0, 1] des nächsten Punkts auf der Strecke p0–p1 zu q.
#[inline]
fn naechstes_t(q: V, p0: V, p1: V) -> f64 {
    let d = minus(p1, p0);
    let l2 = punkt(d, d);
    if l2 > 0.0 {
        klemme(punkt(minus(q, p0), d) / l2, 0.0, 1.0)
    } else {
        0.0
    }
}

#[inline]
fn naechster_auf_strecke(q: V, p0: V, p1: V) -> V {
    let t = naechstes_t(q, p0, p1);
    plus(p0, mal(minus(p1, p0), t))
}

/// Kugel A gegen Kugel B: Normale von A nach B (deckungsgleich: nach oben).
fn kugel_kugel(ma: V, ra: f64, mb: V, rb: f64, merkmal: u32) -> Option<Punkt> {
    let d = minus(mb, ma);
    let d2 = punkt(d, d);
    let r = ra + rb;
    if !(d2 <= (r + RAND) * (r + RAND)) {
        return None;
    }
    let l = libm::sqrt(d2);
    let n = if l > 1e-12 { mal(d, 1.0 / l) } else { OBEN };
    let tiefe = r - l;
    // Mitte zwischen den Oberflächen: A-Oberfläche ma + n·ra, B-Oberfläche mb − n·rb
    let p = mal(plus(plus(ma, mal(n, ra)), minus(mb, mal(n, rb))), 0.5);
    Some(Punkt { p, n, tiefe, merkmal })
}

/// Nächste Punkte zweier Strecken (Ericson 5.1.9): (s, t) auf p1–q1 bzw. p2–q2.
fn strecke_strecke(p1: V, q1: V, p2: V, q2: V) -> (f64, f64) {
    let d1 = minus(q1, p1);
    let d2 = minus(q2, p2);
    let r = minus(p1, p2);
    let a = punkt(d1, d1);
    let e = punkt(d2, d2);
    let f = punkt(d2, r);
    const EPS: f64 = 1e-18;
    if a <= EPS && e <= EPS {
        return (0.0, 0.0);
    }
    if a <= EPS {
        return (0.0, klemme(f / e, 0.0, 1.0));
    }
    let c = punkt(d1, r);
    if e <= EPS {
        return (klemme(-c / a, 0.0, 1.0), 0.0);
    }
    let b = punkt(d1, d2);
    let nenner = a * e - b * b;
    let mut s = if nenner > EPS * a * e { klemme((b * f - c * e) / nenner, 0.0, 1.0) } else { 0.0 };
    let mut t = (b * s + f) / e;
    if t < 0.0 {
        t = 0.0;
        s = klemme(-c / a, 0.0, 1.0);
    } else if t > 1.0 {
        t = 1.0;
        s = klemme((b - c) / a, 0.0, 1.0);
    }
    (s, t)
}

/// Kapsel gegen Kapsel: nächste Punkte der Strecken; liegen sie (fast) parallel und überdecken sich, zwei Punkte an den Enden
/// der Überdeckung (ruhige liegende Stapel).
fn kapsel_kapsel(a: (V, V), ra: f64, b: (V, V), rb: f64, aus: &mut Vec<Punkt>) {
    let da = minus(a.1, a.0);
    let db = minus(b.1, b.0);
    let (la2, lb2) = (punkt(da, da), punkt(db, db));
    let x = kreuz(da, db);
    if la2 > 1e-18 && lb2 > 1e-18 && punkt(x, x) <= 1e-6 * la2 * lb2 {
        // parallel: Enden von B auf A projizieren, Überdeckung [t0, t1] auf A
        let t_b0 = punkt(minus(b.0, a.0), da) / la2;
        let t_b1 = punkt(minus(b.1, a.0), da) / la2;
        let (lo, hi) = if t_b0 < t_b1 { (t_b0, t_b1) } else { (t_b1, t_b0) };
        let (t0, t1) = (klemme(lo, 0.0, 1.0), klemme(hi, 0.0, 1.0));
        if t1 - t0 > 1e-9 {
            for (k, t) in [t0, t1].into_iter().enumerate() {
                let pa = plus(a.0, mal(da, t));
                let pb = naechster_auf_strecke(pa, b.0, b.1);
                if let Some(p) = kugel_kugel(pa, ra, pb, rb, 1 + k as u32) {
                    aus.push(p);
                }
            }
            return;
        }
    }
    let (s, t) = strecke_strecke(a.0, a.1, b.0, b.1);
    if let Some(p) = kugel_kugel(plus(a.0, mal(da, s)), ra, plus(b.0, mal(db, t)), rb, 0) {
        aus.push(p);
    }
}

/// Nächster Punkt im Quader (Welt) zu q und ob q innen liegt.
fn im_kasten(m: V, ax: &[V; 3], h: V, q: V) -> V {
    let d = minus(q, m);
    let mut p = m;
    for k in 0..3 {
        let l = klemme(punkt(d, ax[k]), -h[k], h[k]);
        p = plus(p, mal(ax[k], l));
    }
    p
}

/// Kasten A gegen Kugel B (Normale vom Kasten zur Kugel). Mitte im Kasten: zur nächsten Fläche hinaus.
fn kasten_kugel(m: V, ax: &[V; 3], h: V, c: V, r: f64, merkmal: u32) -> Option<Punkt> {
    let d = minus(c, m);
    let lokal = [punkt(d, ax[0]), punkt(d, ax[1]), punkt(d, ax[2])];
    let innen = (0..3).all(|k| betrag(lokal[k]) <= h[k]);
    if !innen {
        let q = im_kasten(m, ax, h, c);
        let e = minus(c, q);
        let d2 = punkt(e, e);
        if !(d2 <= (r + RAND) * (r + RAND)) {
            return None;
        }
        let l = libm::sqrt(d2);
        let n = if l > 1e-12 { mal(e, 1.0 / l) } else { OBEN };
        let tiefe = r - l;
        return Some(Punkt { p: minus(q, mal(n, tiefe * 0.5)), n, tiefe, merkmal });
    }
    // innen: Achse mit dem kleinsten Abstand zur Fläche (gleich: x, y, z)
    let mut best = 0;
    let mut abstand = h[0] - betrag(lokal[0]);
    for k in 1..3 {
        let a = h[k] - betrag(lokal[k]);
        if a < abstand {
            abstand = a;
            best = k;
        }
    }
    let n = mal(ax[best], if lokal[best] < 0.0 { -1.0 } else { 1.0 });
    let tiefe = r + abstand;
    let q = plus(c, mal(n, abstand));
    Some(Punkt { p: minus(q, mal(n, tiefe * 0.5)), n, tiefe, merkmal })
}

/// Kasten A gegen Kapsel B: beide Enden als Kugeln (Merkmal 1, 2); berührt keins, der nächste Punkt der Strecke
/// (abwechselnde Projektion, 6 Schritte ab der Mitte; Merkmal 3).
fn kasten_kapsel(m: V, ax: &[V; 3], h: V, s: (V, V), r: f64, aus: &mut Vec<Punkt>) {
    let n0 = aus.len();
    for (k, e) in [s.0, s.1].into_iter().enumerate() {
        if let Some(p) = kasten_kugel(m, ax, h, e, r, 1 + k as u32) {
            aus.push(p);
        }
    }
    if aus.len() > n0 {
        return;
    }
    let mut t = 0.5;
    for _ in 0..6 {
        let x = plus(s.0, mal(minus(s.1, s.0), t));
        let q = im_kasten(m, ax, h, x);
        t = naechstes_t(q, s.0, s.1);
    }
    let x = plus(s.0, mal(minus(s.1, s.0), t));
    if let Some(p) = kasten_kugel(m, ax, h, x, r, 3) {
        aus.push(p);
    }
}

/// Kasten gegen Kasten über 15 Trennachsen. Flächenachsen werden Kantenachsen vorgezogen (Kante nur, wenn ihre Trennung
/// deutlich größer ist), Fläche von A vor Fläche von B. Fläche: Gegenfläche des anderen Kastens gegen die vier Seiten der
/// Bezugsfläche schneiden, Punkte unter der Bezugsfläche, höchstens 4. Kante: nächste Punkte der beiden Kanten.
fn kasten_kasten(ma: V, aa: &[V; 3], ha: V, mb: V, ab: &[V; 3], hb: V, aus: &mut Vec<Punkt>) {
    let t = minus(mb, ma);
    let mut r = [[0.0; 3]; 3];
    let mut ar = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            r[i][j] = punkt(aa[i], ab[j]);
            ar[i][j] = betrag(r[i][j]) + 1e-9;
        }
    }
    let ta = [punkt(t, aa[0]), punkt(t, aa[1]), punkt(t, aa[2])];
    let tb = [punkt(t, ab[0]), punkt(t, ab[1]), punkt(t, ab[2])];
    // Flächen A
    let (mut sa, mut ia) = (f64::NEG_INFINITY, 0);
    for i in 0..3 {
        let s = betrag(ta[i]) - (ha[i] + hb[0] * ar[i][0] + hb[1] * ar[i][1] + hb[2] * ar[i][2]);
        if s > RAND {
            return;
        }
        if s > sa {
            sa = s;
            ia = i;
        }
    }
    // Flächen B
    let (mut sb, mut ib) = (f64::NEG_INFINITY, 0);
    for j in 0..3 {
        let s = betrag(tb[j]) - (ha[0] * ar[0][j] + ha[1] * ar[1][j] + ha[2] * ar[2][j] + hb[j]);
        if s > RAND {
            return;
        }
        if s > sb {
            sb = s;
            ib = j;
        }
    }
    // Kanten
    let (mut se, mut ke, mut ne) = (f64::NEG_INFINITY, (0, 0), [0.0; 3]);
    for i in 0..3 {
        let (i1, i2) = ((i + 1) % 3, (i + 2) % 3);
        for j in 0..3 {
            let (j1, j2) = ((j + 1) % 3, (j + 2) % 3);
            let achse = kreuz(aa[i], ab[j]);
            let l = laenge(achse);
            if l < 1e-6 {
                continue;
            }
            let ra = ha[i1] * ar[i2][j] + ha[i2] * ar[i1][j];
            let rb = hb[j1] * ar[i][j2] + hb[j2] * ar[i][j1];
            let s = (betrag(punkt(t, achse)) - (ra + rb)) / l;
            if s > RAND {
                return;
            }
            if s > se {
                se = s;
                ke = (i, j);
                ne = mal(achse, 1.0 / l);
            }
        }
    }
    const REL: f64 = 0.95;
    const ABS: f64 = 0.001;
    let flaeche_b = sb > REL * sa + ABS;
    let sf = if flaeche_b { sb } else { sa };
    if se > REL * sf + ABS {
        // Kante gegen Kante
        let (i, j) = ke;
        let n = if punkt(ne, t) < 0.0 { mal(ne, -1.0) } else { ne };
        // Kante von A, die am weitesten in n liegt, und Kante von B, die am weitesten in −n liegt
        let mut ea = ma;
        for k in 0..3 {
            if k != i {
                ea = plus(ea, mal(aa[k], if punkt(aa[k], n) < 0.0 { -ha[k] } else { ha[k] }));
            }
        }
        let mut eb = mb;
        for k in 0..3 {
            if k != j {
                eb = plus(eb, mal(ab[k], if punkt(ab[k], n) < 0.0 { hb[k] } else { -hb[k] }));
            }
        }
        let (pa0, pa1) = (minus(ea, mal(aa[i], ha[i])), plus(ea, mal(aa[i], ha[i])));
        let (pb0, pb1) = (minus(eb, mal(ab[j], hb[j])), plus(eb, mal(ab[j], hb[j])));
        let (s, u) = strecke_strecke(pa0, pa1, pb0, pb1);
        let qa = plus(pa0, mal(minus(pa1, pa0), s));
        let qb = plus(pb0, mal(minus(pb1, pb0), u));
        aus.push(Punkt { p: mal(plus(qa, qb), 0.5), n, tiefe: -se, merkmal: 1000 + (i * 3 + j) as u32 });
        return;
    }
    // Fläche: Bezug (m, Achsen, h, Achse), Gegenkörper
    let (wer, rm, rax, rh, k, im, iax, ih, n) = if flaeche_b {
        let n = mal(ab[ib], if tb[ib] < 0.0 { -1.0 } else { 1.0 }); // von A nach B
        (1u32, mb, ab, hb, ib, ma, aa, ha, n)
    } else {
        let n = mal(aa[ia], if ta[ia] < 0.0 { -1.0 } else { 1.0 });
        (0u32, ma, aa, ha, ia, mb, ab, hb, n)
    };
    // Außennormale der Bezugsfläche (zeigt zum Gegenkörper)
    let nr = if wer == 0 { n } else { mal(n, -1.0) };
    let mitte = plus(rm, mal(nr, rh[k]));
    // Gegenfläche: Achse des Gegenkörpers am stärksten (anti)parallel zu nr
    let mut g = 0;
    let mut gd = punkt(iax[0], nr);
    for q in 1..3 {
        let d = punkt(iax[q], nr);
        if betrag(d) > betrag(gd) {
            gd = d;
            g = q;
        }
    }
    let gn = mal(iax[g], if gd > 0.0 { -1.0 } else { 1.0 }); // zeigt zur Bezugsfläche
    let gm = plus(im, mal(gn, ih[g]));
    let (g1, g2) = ((g + 1) % 3, (g + 2) % 3);
    let (e1, e2) = (mal(iax[g1], ih[g1]), mal(iax[g2], ih[g2]));
    let mut poly = Vieleck::LEER;
    poly.push((plus(plus(gm, e1), e2), 0));
    poly.push((plus(minus(gm, e1), e2), 1));
    poly.push((minus(minus(gm, e1), e2), 2));
    poly.push((minus(plus(gm, e1), e2), 3));
    // gegen die vier Seiten der Bezugsfläche schneiden (Sutherland-Hodgman); Merkmal der Schnittpunkte = 4 + Kante · 4 + Seite
    let (k1, k2) = ((k + 1) % 3, (k + 2) % 3);
    let seiten = [(rax[k1], rh[k1]), (mal(rax[k1], -1.0), rh[k1]), (rax[k2], rh[k2]), (mal(rax[k2], -1.0), rh[k2])];
    for (si, &(sn, sh)) in seiten.iter().enumerate() {
        let grenze = punkt(sn, rm) + sh;
        let ein = poly;
        poly = Vieleck::LEER;
        let n_ein = ein.n;
        for q in 0..n_ein {
            let (p0, f0) = ein.p[q];
            let (p1, _) = ein.p[(q + 1) % n_ein];
            // Punkte knapp außerhalb (Rundung) zählen als innen – sonst zerfiele eine bündige Ecke in zwei Schnittpunkte
            let (d0, d1) = (punkt(sn, p0) - grenze, punkt(sn, p1) - grenze);
            let (i0, i1) = (d0 <= KLEBEN, d1 <= KLEBEN);
            if i0 {
                poly.push((p0, f0));
            }
            if i0 != i1 {
                let s = d0 / (d0 - d1);
                poly.push((plus(p0, mal(minus(p1, p0), s)), 4 + (f0 & 3) * 4 + si as u32));
            }
        }
        // fast gleiche Nachbarn zusammenlegen (in Reihenfolge, der erste bleibt)
        let mut k = 0;
        while k < poly.n && poly.n > 1 {
            let nach = (k + 1) % poly.n;
            let d = minus(poly.p[nach].0, poly.p[k].0);
            if punkt(d, d) <= KLEBEN * KLEBEN && nach != 0 {
                poly.weg(nach);
            } else {
                k += 1;
            }
        }
        if poly.n == 0 {
            return;
        }
    }
    let mut kandidaten = [Punkt { p: [0.0; 3], n, tiefe: 0.0, merkmal: 0 }; VIELECK];
    let mut anzahl = 0;
    let basis = ((wer * 3 + k as u32) * 6 + (g as u32 * 2 + if gd > 0.0 { 1 } else { 0 })) * 32;
    for &(p, f) in &poly.p[..poly.n] {
        let sep = punkt(minus(p, mitte), nr);
        if sep <= RAND {
            kandidaten[anzahl] = Punkt { p: minus(p, mal(nr, sep * 0.5)), n, tiefe: -sep, merkmal: basis + f };
            anzahl += 1;
        }
    }
    let n_aus = reduziere(&mut kandidaten[..anzahl], nr);
    aus.extend_from_slice(&kandidaten[..n_aus]);
}

/// Höchstzahl der Ecken beim Schneiden (ein Viereck gegen vier Seiten: höchstens 8).
const VIELECK: usize = 12;

/// Vieleck mit fester Höchstzahl (ohne Heap); weitere Ecken fallen weg.
#[derive(Clone, Copy)]
struct Vieleck {
    p: [(V, u32); VIELECK],
    n: usize,
}

impl Vieleck {
    const LEER: Vieleck = Vieleck { p: [([0.0; 3], 0); VIELECK], n: 0 };
    #[inline]
    fn push(&mut self, e: (V, u32)) {
        if self.n < VIELECK {
            self.p[self.n] = e;
            self.n += 1;
        }
    }
    fn weg(&mut self, i: usize) {
        for j in i..self.n - 1 {
            self.p[j] = self.p[j + 1];
        }
        self.n -= 1;
    }
}

/// Höchstens 4 Punkte behalten: der tiefste, der am weitesten entfernte, der mit der größten Dreiecksfläche, dann der mit
/// der größten Summe der Abstandsquadrate zu den dreien (Gleichstand: der frühere).
/// Ergebnis vorn in `k`, Rückgabe = Anzahl.
fn reduziere(k: &mut [Punkt], n: V) -> usize {
    if k.len() <= 4 {
        return k.len();
    }
    let mut wahl = [0usize; 4];
    for i in 1..k.len() {
        if k[i].tiefe > k[wahl[0]].tiefe {
            wahl[0] = i;
        }
    }
    let p0 = k[wahl[0]].p;
    let mut best = -1.0;
    for i in 0..k.len() {
        let d = minus(k[i].p, p0);
        let d2 = punkt(d, d);
        if i != wahl[0] && d2 > best {
            best = d2;
            wahl[1] = i;
        }
    }
    let p1 = k[wahl[1]].p;
    best = -1.0;
    for i in 0..k.len() {
        if i == wahl[0] || i == wahl[1] {
            continue;
        }
        let a = betrag(punkt(kreuz(minus(p1, p0), minus(k[i].p, p0)), n));
        if a > best {
            best = a;
            wahl[2] = i;
        }
    }
    let p2 = k[wahl[2]].p;
    best = -1.0;
    for i in 0..k.len() {
        if wahl[..3].contains(&i) {
            continue;
        }
        let q = k[i].p;
        let (a, b, c) = (minus(q, p0), minus(q, p1), minus(q, p2));
        let s = punkt(a, a) + punkt(b, b) + punkt(c, c);
        if s > best {
            best = s;
            wahl[3] = i;
        }
    }
    wahl.sort_unstable();
    let neu = [k[wahl[0]], k[wahl[1]], k[wahl[2]], k[wahl[3]]];
    k[..4].copy_from_slice(&neu);
    4
}

/// Nächster Punkt auf dem Dreieck abc zu p (Ericson 5.1.5).
fn naechster_im_dreieck(p: V, a: V, b: V, c: V) -> V {
    let ab = minus(b, a);
    let ac = minus(c, a);
    let ap = minus(p, a);
    let d1 = punkt(ab, ap);
    let d2 = punkt(ac, ap);
    if d1 <= 0.0 && d2 <= 0.0 {
        return a;
    }
    let bp = minus(p, b);
    let d3 = punkt(ab, bp);
    let d4 = punkt(ac, bp);
    if d3 >= 0.0 && d4 <= d3 {
        return b;
    }
    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 {
        let v = d1 / (d1 - d3);
        return plus(a, mal(ab, v));
    }
    let cp = minus(p, c);
    let d5 = punkt(ab, cp);
    let d6 = punkt(ac, cp);
    if d6 >= 0.0 && d5 <= d6 {
        return c;
    }
    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 {
        let w = d2 / (d2 - d6);
        return plus(a, mal(ac, w));
    }
    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0 {
        let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return plus(b, mal(minus(c, b), w));
    }
    let nenner = 1.0 / (va + vb + vc);
    let v = vb * nenner;
    let w = vc * nenner;
    plus(a, plus(mal(ab, v), mal(ac, w)))
}

/// Kugel (Mitte c, Radius r) gegen das Dreieck e (einseitig): Normale vom Dreieck zur Kugel.
fn dreieck_kugel(e: &[V; 3], nf: V, c: V, r: f64, merkmal: u32) -> Option<Punkt> {
    let abstand = punkt(minus(c, e[0]), nf);
    if abstand < 0.0 || abstand > r + RAND {
        return None;
    }
    let q = naechster_im_dreieck(c, e[0], e[1], e[2]);
    let d = minus(c, q);
    let d2 = punkt(d, d);
    if !(d2 <= (r + RAND) * (r + RAND)) {
        return None;
    }
    let l = libm::sqrt(d2);
    let n = if l > 1e-9 { mal(d, 1.0 / l) } else { nf };
    let tiefe = r - l;
    Some(Punkt { p: minus(q, mal(n, tiefe * 0.5)), n, tiefe, merkmal })
}

/// Körper A gegen ein Netz-Dreieck `e` (Welt, Nummer `t`); Normalen vom Dreieck zum Körper (der Aufrufer dreht um).
fn gegen_dreieck(a: &Form, e: &[V; 3], t: u32, aus: &mut Vec<Punkt>) {
    let nf = kreuz(minus(e[1], e[0]), minus(e[2], e[0]));
    if !(laenge(nf) > 1e-12) {
        return;
    }
    let nf = norm_oder(nf, OBEN);
    let basis = t.wrapping_mul(16);
    match *a {
        Form::Kugel { m, r } => {
            if let Some(p) = dreieck_kugel(e, nf, m, r, basis) {
                aus.push(p);
            }
        }
        Form::Kapsel { m, achse, halb, r } => {
            let (s0, s1) = strecke(m, achse, halb);
            let n0 = aus.len();
            for (k, q) in [s0, s1].into_iter().enumerate() {
                if let Some(p) = dreieck_kugel(e, nf, q, r, basis + 1 + k as u32) {
                    aus.push(p);
                }
            }
            if aus.len() > n0 {
                return;
            }
            // nächster Punkt der Strecke: abwechselnde Projektion (6 Schritte ab der Mitte)
            let mut tt = 0.5;
            for _ in 0..6 {
                let x = plus(s0, mal(minus(s1, s0), tt));
                let q = naechster_im_dreieck(x, e[0], e[1], e[2]);
                tt = naechstes_t(q, s0, s1);
            }
            if let Some(p) = dreieck_kugel(e, nf, plus(s0, mal(minus(s1, s0), tt)), r, basis + 3) {
                aus.push(p);
            }
        }
        Form::Kasten { m, achsen, h } => dreieck_kasten(e, nf, m, &achsen, h, basis, aus),
        _ => {}
    }
}

/// Kasten gegen das Dreieck e (einseitig, Mitte vor der Ebene): 13 Trennachsen als Vorprüfung; Kontakte mit der
/// Dreiecksnormale aus den Ecken des Kastens unter der Ebene, deren Lot im Dreieck liegt (Merkmal 0 … 7), sonst aus den
/// Dreiecksecken im Kasten (Merkmal 8 … 10).
fn dreieck_kasten(e: &[V; 3], nf: V, m: V, ax: &[V; 3], h: V, basis: u32, aus: &mut Vec<Punkt>) {
    let mitte_abstand = punkt(minus(m, e[0]), nf);
    if mitte_abstand < 0.0 {
        return;
    }
    let radius = |achse: V| h[0] * betrag(punkt(ax[0], achse)) + h[1] * betrag(punkt(ax[1], achse)) + h[2] * betrag(punkt(ax[2], achse));
    let rb = radius(nf);
    if mitte_abstand > rb + RAND {
        return;
    }
    // Trennachsen: Kastenachsen und Kanten-Kreuze
    let getrennt = |achse: V| -> bool {
        let l = laenge(achse);
        if l < 1e-9 {
            return false;
        }
        let mut lo = f64::INFINITY;
        let mut hi = f64::NEG_INFINITY;
        for v in e {
            let p = punkt(minus(*v, m), achse);
            if p < lo {
                lo = p;
            }
            if p > hi {
                hi = p;
            }
        }
        let r = radius(achse);
        lo > r + RAND || hi < -r - RAND
    };
    for k in 0..3 {
        if getrennt(ax[k]) {
            return;
        }
    }
    let kanten = [minus(e[1], e[0]), minus(e[2], e[1]), minus(e[0], e[2])];
    for k in 0..3 {
        for kk in &kanten {
            if getrennt(kreuz(ax[k], *kk)) {
                return;
            }
        }
    }
    // Ecken des Kastens unter der Ebene, Lot im Dreieck
    let n0 = aus.len();
    let (k0, k1, k2) = (kanten[0], kanten[1], kanten[2]);
    for i in 0..8u32 {
        let mut p = m;
        for k in 0..3 {
            p = plus(p, mal(ax[k], if i & (1 << k) != 0 { h[k] } else { -h[k] }));
        }
        let d = punkt(minus(p, e[0]), nf);
        if d > RAND {
            continue;
        }
        // Lot im Dreieck: auf der Innenseite aller drei Kanten
        let innen = punkt(kreuz(k0, minus(p, e[0])), nf) >= 0.0 && punkt(kreuz(k1, minus(p, e[1])), nf) >= 0.0 && punkt(kreuz(k2, minus(p, e[2])), nf) >= 0.0;
        if innen {
            aus.push(Punkt { p: minus(p, mal(nf, d * 0.5)), n: nf, tiefe: -d, merkmal: basis + i });
        }
    }
    if aus.len() > n0 {
        return;
    }
    // Dreiecksecken im Kasten: Tiefe = wie weit die Ecke über dem tiefsten Punkt des Kastens (gegen nf) liegt
    for (k, v) in e.iter().enumerate() {
        let d = minus(*v, m);
        if (0..3).all(|a| betrag(punkt(d, ax[a])) <= h[a] + RAND) {
            let tiefe = punkt(d, nf) + rb;
            if tiefe >= -RAND {
                aus.push(Punkt { p: plus(*v, mal(nf, tiefe * 0.5)), n: nf, tiefe, merkmal: basis + 8 + k as u32 });
            }
        }
    }
}

// ------------------------------------------------------------------------------------------------ Gelände

/// Höhenraster eines `Gelaende` in Weltlage (Sicht auf den Speicher, nichts kopiert).
pub struct Raster<'a> {
    hoehen: &'a [f64],
    spalten: u32,
    zeilen: u32,
    weite: f64,
    welt: [f64; 12],
    inv: [f64; 12],
}

impl<'a> Raster<'a> {
    pub fn aus(gs: &'a Speicher, zeile: usize, welt: [f64; 12], inv: [f64; 12]) -> Raster<'a> {
        Raster {
            hoehen: &gs.puffer(gelaende::HOEHEN)[zeile],
            spalten: gs.zahl(gelaende::SPALTEN)[zeile] as u32,
            zeilen: gs.zahl(gelaende::ZEILEN)[zeile] as u32,
            weite: gs.zahl(gelaende::WEITE)[zeile],
            welt,
            inv,
        }
    }

    /// Dreieck des Netzes unter dem Weltpunkt p (in lokaler Draufsicht): Welt-Ecken und Merkmal (Zelle · 2 + Hälfte);
    /// außerhalb des Rasters `None`.
    pub fn dreieck_unter(&self, p: V) -> Option<([V; 3], u32)> {
        let l = punkt_3d(&self.inv, p);
        let (sp, ze) = (self.spalten as f64, self.zeilen as f64);
        let fi = l[0] / self.weite + (sp - 1.0) * 0.5;
        let fj = l[2] / self.weite + (ze - 1.0) * 0.5;
        if !(fi >= 0.0 && fi <= sp - 1.0 && fj >= 0.0 && fj <= ze - 1.0) {
            return None;
        }
        let ci = libm::floor(fi);
        let cj = libm::floor(fj);
        let ci = if ci > sp - 2.0 { sp - 2.0 } else { ci };
        let cj = if cj > ze - 2.0 { ze - 2.0 } else { cj };
        let (i, j) = (ci as u32, cj as u32);
        let (fx, fz) = (fi - ci, fj - cj);
        let pk = |i: u32, j: u32| punkt_3d(&self.welt, gelaende::punkt(self.hoehen, self.spalten, self.zeilen, self.weite, i, j));
        // wie gelaende::netz: d = (i, j), c = (i+1, j), a = (i, j+1), b = (i+1, j+1); Dreiecke (a, b, c) und (a, c, d)
        let zelle = (j * (self.spalten - 1) + i) * 2;
        if fx + fz >= 1.0 {
            Some(([pk(i, j + 1), pk(i + 1, j + 1), pk(i + 1, j)], zelle))
        } else {
            Some(([pk(i, j + 1), pk(i + 1, j), pk(i, j)], zelle + 1))
        }
    }

    /// Ebene unter p: (Abstand von p über der Ebene entlang der Normale, Normale nach oben (Welt)).
    pub fn ebene_unter(&self, p: V) -> Option<(f64, V)> {
        let (e, _) = self.dreieck_unter(p)?;
        let n = kreuz(minus(e[1], e[0]), minus(e[2], e[0]));
        if !(laenge(n) > 1e-300) {
            return None;
        }
        let n = norm_oder(n, OBEN);
        Some((punkt(minus(p, e[0]), n), n))
    }

    /// Kontakte des Körpers A mit dem Gelände (Normalen vom Gelände zum Körper; der Aufrufer dreht um). Probepunkte: Kugelmitte
    /// (Merkmal 0), Kapsel-Enden (1, 2), Kasten-Ecken (0 … 7). Liegt ein Punkt unter dem Gelände, wird er hinaufgeschoben.
    fn kontakte(&self, a: &Form, aus: &mut Vec<Punkt>) {
        let kugel = |c: V, r: f64, merkmal: u32, aus: &mut Vec<Punkt>| {
            if let Some((d, n)) = self.ebene_unter(c) {
                if d < r + RAND {
                    let tiefe = r - d;
                    aus.push(Punkt { p: plus(minus(c, mal(n, r)), mal(n, tiefe * 0.5)), n, tiefe, merkmal });
                }
            }
        };
        match *a {
            Form::Kugel { m, r } => kugel(m, r, 0, aus),
            Form::Kapsel { m, achse, halb, r } => {
                let (s0, s1) = strecke(m, achse, halb);
                kugel(s0, r, 1, aus);
                if halb > 0.0 {
                    kugel(s1, r, 2, aus);
                }
            }
            Form::Kasten { m, achsen, h } => {
                for i in 0..8u32 {
                    let mut p = m;
                    for k in 0..3 {
                        p = plus(p, mal(achsen[k], if i & (1 << k) != 0 { h[k] } else { -h[k] }));
                    }
                    if let Some((d, n)) = self.ebene_unter(p) {
                        if d < RAND {
                            aus.push(Punkt { p: minus(p, mal(n, d * 0.5)), n, tiefe: -d, merkmal: i });
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

// ------------------------------------------------------------------------------------------------ Strahl (H-K20)

/// Treffer eines Strahls: Abstand (Welt, ≥ 0) und Normale der getroffenen Fläche (Welt, Länge 1, zeigt aus der Form heraus).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Treffer {
    pub t: f64,
    pub n: V,
}

/// Strahl ab `o` in Richtung `d` (Länge 1) bis `laenge` gegen die Form `f` – nur der **Eintritt** zählt: liegt `o` in einer
/// Kugel, Kapsel oder einem Kasten, trifft der Strahl diese Form nicht (wie Unity). Netz und Gelände sind einseitig wie in der
/// Physik (nur die Vorderseite, Gelände von oben). Gleichstand innerhalb einer Form: das frühere Dreieck.
pub fn strahl(o: V, d: V, laenge: f64, f: &Form, u: &Umgebung) -> Option<Treffer> {
    let t = match *f {
        Form::Kugel { m, r } => strahl_kugel(o, d, m, r),
        Form::Kapsel { m, achse, halb, r } => strahl_kapsel(o, d, strecke(m, achse, halb), r),
        Form::Kasten { m, achsen, h } => strahl_kasten(o, d, m, &achsen, h),
        Form::Netz { netz, welt, inv } => {
            let Some(Some(baum)) = u.ressourcen.baeume.get((netz as usize).wrapping_sub(1)) else { return None };
            baum.strahl(o, d, laenge, &welt, &inv)
        }
        Form::Gelaende { zeile, welt, inv } => {
            let gs = u.gelaende?;
            Raster::aus(gs, zeile, welt, inv).strahl(o, d, laenge)
        }
    }?;
    if t.t >= 0.0 && t.t <= laenge {
        Some(t)
    } else {
        None
    }
}

fn strahl_kugel(o: V, d: V, m: V, r: f64) -> Option<Treffer> {
    let oc = minus(o, m);
    let c = punkt(oc, oc) - r * r;
    if !(c > 0.0) {
        return None; // innen (oder Radius 0)
    }
    let b = punkt(oc, d);
    let h = b * b - c;
    if !(h >= 0.0) {
        return None;
    }
    let t = -b - libm::sqrt(h);
    if !(t >= 0.0) {
        return None;
    }
    let p = plus(o, mal(d, t));
    Some(Treffer { t, n: norm_oder(minus(p, m), OBEN) })
}

/// Kapsel = Vereinigung aus Mantel und zwei Kugeln: der erste Eintritt ist der kleinste Eintritt der Teile.
fn strahl_kapsel(o: V, d: V, s: (V, V), r: f64) -> Option<Treffer> {
    let q = naechster_auf_strecke(o, s.0, s.1);
    let oq = minus(o, q);
    if !(punkt(oq, oq) > r * r) {
        return None;
    }
    let mut best: Option<Treffer> = None;
    let mut nimm = |t: Option<Treffer>| {
        if let Some(t) = t {
            if best.is_none_or(|b| t.t < b.t) {
                best = Some(t);
            }
        }
    };
    nimm(strahl_kugel(o, d, s.0, r));
    nimm(strahl_kugel(o, d, s.1, r));
    // Mantel: |(o + t d − p0) × achse|² = r², Fußpunkt zwischen den Enden
    let ba = minus(s.1, s.0);
    let baba = punkt(ba, ba);
    if baba > 1e-18 {
        let oa = minus(o, s.0);
        let (bard, baoa) = (punkt(ba, d), punkt(ba, oa));
        let a = baba - bard * bard;
        if a > 1e-12 * baba {
            let b = baba * punkt(d, oa) - baoa * bard;
            let c = baba * punkt(oa, oa) - baoa * baoa - r * r * baba;
            let h = b * b - a * c;
            if h >= 0.0 {
                let t = (-b - libm::sqrt(h)) / a;
                let y = baoa + t * bard;
                if t >= 0.0 && y > 0.0 && y < baba {
                    let p = plus(oa, mal(d, t));
                    let n = minus(p, mal(ba, y / baba));
                    nimm(Some(Treffer { t, n: norm_oder(n, OBEN) }));
                }
            }
        }
    }
    best
}

/// Gedrehter Kasten über die drei Plattenpaare in seinen Achsen; Eintrittsachse = die mit dem spätesten Eintritt (gleich: x, y, z).
fn strahl_kasten(o: V, d: V, m: V, ax: &[V; 3], h: V) -> Option<Treffer> {
    let rel = minus(o, m);
    let (mut t0, mut t1) = (f64::NEG_INFINITY, f64::INFINITY);
    let mut achse = 3;
    let mut seite = 0.0;
    for k in 0..3 {
        let (p, q) = (punkt(rel, ax[k]), punkt(d, ax[k]));
        if betrag(q) < 1e-300 {
            if p < -h[k] || p > h[k] {
                return None;
            }
            continue;
        }
        let (mut a, mut b) = ((-h[k] - p) / q, (h[k] - p) / q);
        // Eintrittsseite nach der Richtung (nicht nach a > b: bei Dicke 0 – Ebene als Kasten – sind beide gleich)
        let s = if q < 0.0 { 1.0 } else { -1.0 };
        if a > b {
            core::mem::swap(&mut a, &mut b);
        }
        if a > t0 {
            t0 = a;
            achse = k;
            seite = s;
        }
        if b < t1 {
            t1 = b;
        }
    }
    if achse == 3 || !(t0 <= t1) || !(t0 > 0.0) {
        return None; // innen, dahinter oder verfehlt
    }
    Some(Treffer { t: t0, n: mal(ax[achse], seite) })
}

/// Dreieck e (Welt) einseitig nach Möller–Trumbore: nur von vorn (gegen den Uhrzeigersinn), Abstand in [0, tmax].
fn strahl_dreieck(o: V, d: V, e: &[V; 3], tmax: f64) -> Option<Treffer> {
    let e1 = minus(e[1], e[0]);
    let e2 = minus(e[2], e[0]);
    let p = kreuz(d, e2);
    let det = punkt(e1, p);
    if !(det > 1e-300) {
        return None; // Rückseite oder parallel
    }
    let inv = 1.0 / det;
    let s = minus(o, e[0]);
    let u = punkt(s, p) * inv;
    if !(0.0..=1.0).contains(&u) {
        return None;
    }
    let q = kreuz(s, e1);
    let v = punkt(d, q) * inv;
    if !(v >= 0.0 && u + v <= 1.0) {
        return None;
    }
    let t = punkt(e2, q) * inv;
    if !(t >= 0.0 && t <= tmax) {
        return None;
    }
    Some(Treffer { t, n: norm_oder(kreuz(e1, e2), OBEN) })
}

/// Eintritt und Austritt (Parameter) eines Strahls in einen achsenparallelen Kasten, `None` ohne Schnitt in [0, tmax].
fn strahl_huelle(o: V, d: V, lo: V, hi: V, tmax: f64) -> Option<(f64, f64)> {
    let (mut t0, mut t1) = (0.0f64, tmax);
    for k in 0..3 {
        if betrag(d[k]) < 1e-300 {
            if o[k] < lo[k] || o[k] > hi[k] {
                return None;
            }
            continue;
        }
        let inv = 1.0 / d[k];
        let (mut a, mut b) = ((lo[k] - o[k]) * inv, (hi[k] - o[k]) * inv);
        if a > b {
            core::mem::swap(&mut a, &mut b);
        }
        if a > t0 {
            t0 = a;
        }
        if b < t1 {
            t1 = b;
        }
        if !(t0 <= t1) {
            return None;
        }
    }
    Some((t0, t1))
}

/// Richtung `d` (Welt) unter dem linearen Teil der Matrix `m` (3 × 4 zeilenweise).
#[inline]
fn richtung_unter(m: &[f64; 12], d: V) -> V {
    [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]]
}

impl Baum {
    /// Erster Treffer des Strahls (Welt `o`, `d`) gegen die Dreiecke unter `welt`: Knoten lokal geprüft (`inv`; der Parameter t
    /// ist lokal und in Welt derselbe), Dreiecke in Welt wie die Physik. Feste Reihenfolge (links zuerst), Gleichstand → kleineres Dreieck.
    pub fn strahl(&self, o: V, d: V, laenge: f64, welt: &[f64; 12], inv: &[f64; 12]) -> Option<Treffer> {
        if self.knoten.is_empty() {
            return None;
        }
        let ol = punkt_3d(inv, o);
        let dl = richtung_unter(inv, d);
        let mut best: Option<(Treffer, u32)> = None;
        let mut stapel: Vec<u32> = Vec::with_capacity(32);
        stapel.push(0);
        while let Some(k) = stapel.pop() {
            let n = self.knoten[k as usize];
            let grenze = best.map_or(laenge, |b| b.0.t);
            if strahl_huelle(ol, dl, n.lo, n.hi, grenze).is_none() {
                continue;
            }
            if n.anzahl > 0 {
                for &t in &self.ordnung[n.links as usize..(n.links + n.anzahl) as usize] {
                    let dr = self.dreiecke[t as usize];
                    let e = [punkt_3d(welt, self.punkte[dr[0] as usize]), punkt_3d(welt, self.punkte[dr[1] as usize]), punkt_3d(welt, self.punkte[dr[2] as usize])];
                    let grenze = best.map_or(laenge, |b| b.0.t);
                    if let Some(h) = strahl_dreieck(o, d, &e, grenze) {
                        if best.is_none_or(|(b, bt)| h.t < b.t || (h.t == b.t && t < bt)) {
                            best = Some((h, t));
                        }
                    }
                }
            } else {
                stapel.push(n.links + 1);
                stapel.push(n.links);
            }
        }
        best.map(|b| b.0)
    }
}

impl Raster<'_> {
    /// Die beiden Dreiecke der Zelle (i, j) in Welt, wie [`Raster::dreieck_unter`].
    fn zelle(&self, i: u32, j: u32) -> [[V; 3]; 2] {
        let pk = |i: u32, j: u32| punkt_3d(&self.welt, gelaende::punkt(self.hoehen, self.spalten, self.zeilen, self.weite, i, j));
        let (a, b, c, d) = (pk(i, j + 1), pk(i + 1, j + 1), pk(i + 1, j), pk(i, j));
        [[a, b, c], [a, c, d]]
    }

    /// Erster Treffer des Strahls gegen das Höhenraster (von oben): Zellen entlang des Strahls in der Draufsicht (Amanatides–Woo im
    /// Raster), je Zelle beide Dreiecke; die erste Zelle mit Treffer liefert den nächsten. Ein senkrechter Strahl prüft genau die Zelle
    /// unter sich – die Höhenabfrage ist so exakt das gezeichnete Netz.
    pub fn strahl(&self, o: V, d: V, laenge: f64) -> Option<Treffer> {
        if self.spalten < 2 || self.zeilen < 2 || !(self.weite > 0.0) {
            return None;
        }
        let ol = punkt_3d(&self.inv, o);
        let dl = richtung_unter(&self.inv, d);
        let (sp, ze) = (self.spalten as f64, self.zeilen as f64);
        // Rasterkoordinaten g(t) = g0 + t · dg
        let g0 = [ol[0] / self.weite + (sp - 1.0) * 0.5, ol[2] / self.weite + (ze - 1.0) * 0.5];
        let dg = [dl[0] / self.weite, dl[2] / self.weite];
        let grenzen = [sp - 1.0, ze - 1.0];
        let (mut t0, mut t1) = (0.0f64, laenge);
        for k in 0..2 {
            if betrag(dg[k]) < 1e-300 {
                if !(g0[k] >= 0.0 && g0[k] <= grenzen[k]) {
                    return None;
                }
                continue;
            }
            let (mut a, mut b) = ((0.0 - g0[k]) / dg[k], (grenzen[k] - g0[k]) / dg[k]);
            if a > b {
                core::mem::swap(&mut a, &mut b);
            }
            if a > t0 {
                t0 = a;
            }
            if b < t1 {
                t1 = b;
            }
        }
        if !(t0 <= t1) {
            return None;
        }
        let zelle_von = |x: f64, k: usize| -> i64 {
            let c = libm::floor(x);
            let hoch = grenzen[k] - 1.0;
            (if c < 0.0 { 0.0 } else if c > hoch { hoch } else { c }) as i64
        };
        let start = [g0[0] + dg[0] * t0, g0[1] + dg[1] * t0];
        let mut c = [zelle_von(start[0], 0), zelle_von(start[1], 1)];
        let schritt = [if dg[0] > 0.0 { 1i64 } else { -1 }, if dg[1] > 0.0 { 1i64 } else { -1 }];
        // Parameter bis zur nächsten Zellgrenze je Achse und Abstand zwischen den Grenzen
        let mut naechst = [f64::INFINITY; 2];
        let mut delta = [f64::INFINITY; 2];
        for k in 0..2 {
            if betrag(dg[k]) >= 1e-300 {
                let rand = if schritt[k] > 0 { (c[k] + 1) as f64 } else { c[k] as f64 };
                naechst[k] = (rand - g0[k]) / dg[k];
                delta[k] = 1.0 / betrag(dg[k]);
            }
        }
        let max = (self.spalten + self.zeilen) as usize + 2;
        for _ in 0..max {
            let mut best: Option<Treffer> = None;
            for e in &self.zelle(c[0] as u32, c[1] as u32) {
                if let Some(h) = strahl_dreieck(o, d, e, laenge) {
                    if best.is_none_or(|b| h.t < b.t) {
                        best = Some(h);
                    }
                }
            }
            if best.is_some() {
                return best;
            }
            // nächste Zelle
            let k = if naechst[0] <= naechst[1] { 0 } else { 1 };
            if !(naechst[k] <= t1) {
                return None;
            }
            naechst[k] += delta[k];
            c[k] += schritt[k];
            if c[k] < 0 || c[k] as f64 > grenzen[k] - 1.0 {
                return None;
            }
        }
        None
    }
}

impl Raster<'_> {
    /// Ruft `f` für jedes Dreieck (Welt, Nummer = Zelle · 2 + Hälfte) der Zellen unter dem Welt-Kasten `lo`–`hi` (Draufsicht im
    /// Raster), Zellen zeilenweise.
    fn dreiecke_in(&self, lo: V, hi: V, mut f: impl FnMut(&[V; 3], u32)) {
        if self.spalten < 2 || self.zeilen < 2 || !(self.weite > 0.0) {
            return;
        }
        let (llo, lhi) = kasten_3d(&self.inv, lo, hi);
        let (sp, ze) = (self.spalten as f64, self.zeilen as f64);
        let bereich = |a: f64, b: f64, n: f64| -> Option<(u32, u32)> {
            let (a, b) = (libm::floor(a / self.weite + (n - 1.0) * 0.5), libm::floor(b / self.weite + (n - 1.0) * 0.5));
            if !(b >= 0.0 && a <= n - 2.0) {
                return None;
            }
            let a = if a < 0.0 { 0.0 } else { a };
            let b = if b > n - 2.0 { n - 2.0 } else { b };
            Some((a as u32, b as u32))
        };
        let (Some((i0, i1)), Some((j0, j1))) = (bereich(llo[0], lhi[0], sp), bereich(llo[2], lhi[2], ze)) else { return };
        for j in j0..=j1 {
            for i in i0..=i1 {
                let zelle = (j * (self.spalten - 1) + i) * 2;
                let [e0, e1] = self.zelle(i, j);
                f(&e0, zelle);
                f(&e1, zelle + 1);
            }
        }
    }
}

/// Wie [`kontakte`], nur das Gelände **als Dreiecke** (nächster Punkt je Dreieck der Zellen unter dem Umschließenden von A, einseitig
/// wie ein Netz) – genau auch an Knicken und Kanten des Rasters. Für `Figur` (H-K20); die Physik (`Schwung`) bleibt bei den
/// Probepunkten (K-162), damit ihre Abläufe unverändert bleiben.
pub fn kontakte_genau(a: &Form, b: &Form, u: &Umgebung, aus: &mut Vec<Punkt>) {
    if let (true, Form::Gelaende { zeile, welt, inv }) = (a.beweglich(), *b) {
        let Some(gs) = u.gelaende else { return };
        let Some((lo, hi)) = umschliesse(a, u.ressourcen) else { return };
        let r = [RAND; 3];
        let raster = Raster::aus(gs, zeile, welt, inv);
        let s = aus.len();
        raster.dreiecke_in(minus(lo, r), plus(hi, r), |e, t| gegen_dreieck(a, e, t, aus));
        for p in &mut aus[s..] {
            p.n = mal(p.n, -1.0);
        }
        return;
    }
    kontakte(a, b, u, aus);
}

// ------------------------------------------------------------------------------------------------ Ziele (H-K20)

/// Eine Fühler-Form als Ziel für `Strahl` und Hindernis für `Figur`: Teil, gedrehte Form, umschließender Kasten, Gruppe (Bit),
/// Maske, Auslöser, dynamischer `Schwung` (bewegt sich durch Physik) und `Figur` am Teil.
#[derive(Clone, Copy, Debug)]
pub struct Ziel {
    pub teil: u32,
    pub form: Form,
    pub lo: V,
    pub hi: V,
    pub gruppe: u32,
    pub maske: u32,
    pub ausloeser: bool,
    pub dynamisch: bool,
    pub figur: bool,
}

/// Aufrechte Kapsel (Achse = Welt-y) aus einer Fühler-Form (H-K20 `Figur`): Kapsel und Kugel behalten Mitte, Radius und Länge,
/// sonst aus dem umschließenden Kasten (Radius = halbe größere Seite in x/z, Höhe = Seite in y).
pub fn aufrecht(f: &Form, r: &Ressourcen) -> Option<Form> {
    Some(match *f {
        Form::Kapsel { m, halb, r, .. } => Form::Kapsel { m, achse: OBEN, halb, r },
        Form::Kugel { m, r } => Form::Kapsel { m, achse: OBEN, halb: 0.0, r },
        _ => {
            let (lo, hi) = umschliesse(f, r)?;
            let (ex, ey, ez) = ((hi[0] - lo[0]) * 0.5, (hi[1] - lo[1]) * 0.5, (hi[2] - lo[2]) * 0.5);
            let rr = if ex > ez { ex } else { ez };
            let halb = ey - rr;
            Form::Kapsel { m: mal(plus(lo, hi), 0.5), achse: OBEN, halb: if halb > 0.0 { halb } else { 0.0 }, r: rr }
        }
    })
}

/// Alle 3D-Fühler-Formen (wach, sichtbar, mit Form) nach Teil-ID: gedreht wie in der Physik, Netze mit fertigem Hüllen-Baum, die
/// Form einer `Figur` als aufrechte Kapsel. Netz und Gelände nur, wenn das Teil sich nicht bewegt (sonst Kasten wie in der Physik).
pub fn ziele(w: &mut Welt) -> Vec<Ziel> {
    let Some(fi) = w.art_index("Fuehler") else { return Vec::new() };
    let si = w.art_index("Schwung");
    let gi = w.art_index("Figur");
    let fs = core::mem::take(&mut w.speicher[fi]);
    let gesammelt = fuehler::sammle(w, &fs);
    let mut aus: Vec<Ziel> = Vec::with_capacity(gesammelt.len());
    for &(fz, c) in &gesammelt {
        if !c.drei_d {
            continue;
        }
        let tz = w.zeile_opt(c.teil).expect("Kandidat lebt");
        let schwung_art = si.and_then(|si| w.komp_zeile(tz, si).map(|z| w.speicher[si].zahl(crate::komponenten::schwung::ART_FELD)[z] as u32));
        let figur = gi.is_some_and(|gi| w.komp_zeile(tz, gi).is_some());
        let beweglich = figur || schwung_art.is_some_and(|a| a != crate::komponenten::schwung::art::FEST);
        let Some(mut form) = form_aus_fuehler(w, &fs, fz, tz, c.huelle, beweglich) else { continue };
        if figur {
            match aufrecht(&form, &w.ressourcen) {
                Some(f) => form = f,
                None => continue,
            }
        }
        let kasten = match form {
            Form::Netz { netz, .. } => {
                baum_bereit(&mut w.ressourcen, netz);
                match c.huelle {
                    Huelle::Kasten(lo, hi) => (lo, hi),
                    _ => continue,
                }
            }
            Form::Gelaende { .. } => match c.huelle {
                Huelle::Kasten(lo, hi) => (lo, hi),
                _ => continue,
            },
            _ => match umschliesse(&form, &w.ressourcen) {
                Some(b) => b,
                None => continue,
            },
        };
        aus.push(Ziel {
            teil: c.teil,
            form,
            lo: kasten.0,
            hi: kasten.1,
            gruppe: c.gruppe,
            maske: c.maske,
            ausloeser: c.ausloeser,
            dynamisch: schwung_art == Some(crate::komponenten::schwung::art::DYNAMISCH),
            figur,
        });
    }
    w.speicher[fi] = fs;
    aus.sort_by_key(|z| z.teil);
    aus
}

/// Erster Treffer eines Strahls gegen die Ziele: (Ziel-Index, Treffer); Gleichstand → kleinere Teil-ID (die Ziele sind nach ID
/// sortiert, es bleibt der frühere). `ohne` = eigenes Teil, `maske` gegen die Gruppe des Ziels, Auslöser nur mit `ausloeser`.
#[allow(clippy::too_many_arguments)]
pub fn strahl_ziele(ziele: &[Ziel], u: &Umgebung, o: V, d: V, laenge: f64, ohne: u32, maske: u32, ausloeser: bool) -> Option<(usize, Treffer)> {
    let mut best: Option<(usize, Treffer)> = None;
    for (i, z) in ziele.iter().enumerate() {
        if z.teil == ohne || maske & z.gruppe == 0 || (z.ausloeser && !ausloeser) {
            continue;
        }
        let grenze = best.map_or(laenge, |b| b.1.t);
        if strahl_huelle(o, d, z.lo, z.hi, grenze).is_none() {
            continue;
        }
        if let Some(h) = strahl(o, d, grenze, &z.form, u) {
            if best.is_none_or(|b| h.t < b.1.t) {
                best = Some((i, h));
            }
        }
    }
    best
}

// ------------------------------------------------------------------------------------------------ Gitter (H-K25)

/// Breitphase für viele kurze Strecken (Funken-Aufprall, H-K25): die Ziele, deren Kasten einen Welt-Kasten berührt, in einem
/// waagerechten Gitter (x/z, höchstens 64 × 64 Zellen, Zelle ≥ 2 Einheiten) mit der größten Oberkante je Zelle. Eine Strecke prüft
/// nur die Zellen unter ihrem Kasten und dort nur Ziele, deren Kasten sie berührt; liegt sie ganz über der Oberkante, gar keins.
/// Einträge je Zelle in Ziel-Reihenfolge (nach Teil-ID), Gleichstand → kleinerer Index: das Ergebnis hängt nicht davon ab, über
/// welche Zelle ein Ziel gefunden wird.
pub struct Gitter {
    x0: f64,
    z0: f64,
    zelle: f64,
    nx: usize,
    nz: usize,
    /// Zelle c: Einträge `eintrag[start[c] .. start[c + 1]]` (Ziel-Indizes)
    start: Vec<u32>,
    eintrag: Vec<u32>,
    oben: Vec<f64>,
}

/// Größte Zahl Zellen je Achse im [`Gitter`].
const GITTER_MAX: usize = 64;

#[inline]
fn kaesten_beruehren(alo: V, ahi: V, blo: V, bhi: V) -> bool {
    alo[0] <= bhi[0] && ahi[0] >= blo[0] && alo[1] <= bhi[1] && ahi[1] >= blo[1] && alo[2] <= bhi[2] && ahi[2] >= blo[2]
}

impl Gitter {
    /// Gitter über dem Welt-Kasten `lo`–`hi` aus den Zielen, für die `nimm` gilt und deren Kasten ihn berührt.
    pub fn neu(ziele: &[Ziel], lo: V, hi: V, nimm: impl Fn(&Ziel) -> bool) -> Gitter {
        let groesser = |a: f64, b: f64| if a > b { a } else { b };
        let (ex, ez) = (groesser(hi[0] - lo[0], 0.0), groesser(hi[2] - lo[2], 0.0));
        let zelle = groesser(2.0, groesser(ex, ez) / GITTER_MAX as f64);
        let anzahl = |e: f64| {
            let f = libm::floor(e / zelle);
            if !(f < (GITTER_MAX - 1) as f64) {
                GITTER_MAX
            } else {
                f as usize + 1
            }
        };
        let (nx, nz) = (anzahl(ex), anzahl(ez));
        let mut g = Gitter { x0: lo[0], z0: lo[2], zelle, nx, nz, start: alloc::vec![0; nx * nz + 1], eintrag: Vec::new(), oben: alloc::vec![f64::NEG_INFINITY; nx * nz] };
        let mut gewaehlt: Vec<(u32, (usize, usize, usize, usize))> = Vec::new();
        for (i, z) in ziele.iter().enumerate() {
            if !nimm(z) || !kaesten_beruehren(z.lo, z.hi, lo, hi) {
                continue;
            }
            gewaehlt.push((i as u32, g.bereich(z.lo, z.hi)));
        }
        for &(_, (i0, i1, j0, j1)) in &gewaehlt {
            for j in j0..=j1 {
                for i in i0..=i1 {
                    g.start[j * nx + i + 1] += 1;
                }
            }
        }
        for c in 0..nx * nz {
            g.start[c + 1] += g.start[c];
        }
        let mut voll: Vec<u32> = g.start[..nx * nz].to_vec();
        g.eintrag = alloc::vec![0; g.start[nx * nz] as usize];
        for &(zi, (i0, i1, j0, j1)) in &gewaehlt {
            let oben = ziele[zi as usize].hi[1];
            for j in j0..=j1 {
                for i in i0..=i1 {
                    let c = j * nx + i;
                    g.eintrag[voll[c] as usize] = zi;
                    voll[c] += 1;
                    if oben > g.oben[c] {
                        g.oben[c] = oben;
                    }
                }
            }
        }
        g
    }

    /// Zellbereich (i0, i1, j0, j1) unter dem Kasten, auf das Gitter geklemmt.
    fn bereich(&self, lo: V, hi: V) -> (usize, usize, usize, usize) {
        let idx = |x: f64, x0: f64, n: usize| {
            let f = libm::floor((x - x0) / self.zelle);
            if !(f > 0.0) {
                0
            } else if f >= (n - 1) as f64 {
                n - 1
            } else {
                f as usize
            }
        };
        (idx(lo[0], self.x0, self.nx), idx(hi[0], self.x0, self.nx), idx(lo[2], self.z0, self.nz), idx(hi[2], self.z0, self.nz))
    }

    /// Hat das Gitter überhaupt Ziele?
    pub fn leer(&self) -> bool {
        self.eintrag.is_empty()
    }

    /// Erster Treffer der Strecke `o` → `e` (Welt) gegen die Ziele im Gitter: (Ziel-Index, Treffer mit `t` als Abstand ab `o`).
    /// Die Strecke soll im Kasten liegen, über dem das Gitter gebaut wurde (außerhalb zählen nur die Randzellen).
    pub fn strecke(&self, ziele: &[Ziel], u: &Umgebung, o: V, e: V) -> Option<(usize, Treffer)> {
        let mut lo = o;
        let mut hi = o;
        for k in 0..3 {
            if e[k] < lo[k] {
                lo[k] = e[k];
            }
            if e[k] > hi[k] {
                hi[k] = e[k];
            }
        }
        let weg = minus(e, o);
        let l = laenge(weg);
        if !(l > 1e-12 && l.is_finite()) {
            return None;
        }
        let d = mal(weg, 1.0 / l);
        let (i0, i1, j0, j1) = self.bereich(lo, hi);
        let mut best: Option<(usize, Treffer)> = None;
        for j in j0..=j1 {
            for i in i0..=i1 {
                let c = j * self.nx + i;
                if lo[1] > self.oben[c] {
                    continue;
                }
                for &zi in &self.eintrag[self.start[c] as usize..self.start[c + 1] as usize] {
                    let zi = zi as usize;
                    let z = &ziele[zi];
                    if best.is_some_and(|(b, _)| b == zi) || !kaesten_beruehren(lo, hi, z.lo, z.hi) {
                        continue;
                    }
                    let grenze = best.map_or(l, |b| b.1.t);
                    if let Some(h) = strahl(o, d, grenze, &z.form, u) {
                        if best.is_none_or(|(bi, b)| h.t < b.t || (h.t == b.t && zi < bi)) {
                            best = Some((zi, h));
                        }
                    }
                }
            }
        }
        best
    }
}

/// Messpunkte des Auftriebs (H-K28, `Schwung.auftrieb`): Mitte und vier Punkte in der waagerechten Ebene der Form (mit ihr
/// gedreht: Kasten in seinen beiden flachsten Achsen bei 0,7 × halber Seite, liegende Kapsel entlang der Achse und quer dazu),
/// dazu die halbe senkrechte Ausdehnung `e` (Wassersäule je Punkt von y − e bis y + e). Netz und Gelände → `None` (nur fest).
pub fn auftrieb_punkte(f: &Form) -> Option<([V; 5], f64)> {
    let um = |m: V, a: V, ha: f64, b: V, hb: f64| [m, plus(m, plus(mal(a, ha), mal(b, hb))), plus(m, minus(mal(a, ha), mal(b, hb))), minus(m, minus(mal(a, ha), mal(b, hb))), minus(m, plus(mal(a, ha), mal(b, hb)))];
    let x = [1.0, 0.0, 0.0];
    let z = [0.0, 0.0, 1.0];
    match *f {
        Form::Kugel { m, r } => Some((um(m, x, 0.5 * r, z, 0.5 * r), r)),
        Form::Kapsel { m, achse, halb, r } => {
            let e = betrag(achse[1]) * halb + r;
            if betrag(achse[1]) < 0.7 {
                let quer = norm_oder(kreuz(achse, [0.0, 1.0, 0.0]), z);
                Some((um(m, achse, 0.7 * halb, quer, 0.5 * r), e))
            } else {
                Some((um(m, x, 0.5 * r, z, 0.5 * r), e))
            }
        }
        Form::Kasten { m, achsen, h } => {
            // die Achse mit dem größten Anteil nach oben ist „senkrecht“, die beiden anderen spannen die Ebene
            let mut oben = 0;
            for i in 1..3 {
                if betrag(achsen[i][1]) > betrag(achsen[oben][1]) {
                    oben = i;
                }
            }
            let (a, b) = ((oben + 1) % 3, (oben + 2) % 3);
            let e = betrag(achsen[0][1]) * h[0] + betrag(achsen[1][1]) * h[1] + betrag(achsen[2][1]) * h[2];
            Some((um(m, achsen[a], 0.7 * h[a], achsen[b], 0.7 * h[b]), e))
        }
        Form::Netz { .. } | Form::Gelaende { .. } => None,
    }
    .filter(|(_, e)| *e > 1e-9)
}
