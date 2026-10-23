//! `Fuehler` (beide): Kollider mit Ereignissen **als Zustand je Takt** (Unity: Collider/Trigger mit `OnTriggerEnter/Exit`, hier
//! ohne Rückrufe – die kommen mit H-K13). Läuft im **Nachlauf** (nach allen Takt-Systemen, also nach Bewegung, Physik und
//! Folgekamera desselben Takts) und schreibt die Lesefelder `beruehrt`, `betreten`, `verlassen`, `anzahl`; das Programm liest sie
//! im nächsten Takt (wie Eingabe).
//!
//! Ein Paar zählt, wenn beide Teile einen angehängten Fühler haben, im gleichen Raum liegen, (vererbt) sichtbar sind, eine Form
//! haben und die Masken **beidseitig** passen (`maske` von A enthält die Gruppe von B und umgekehrt). Formen in Weltlage
//! achsenparallel wie `trifft` (gedrehte Rechtecke/Kästen werden umschlossen – v1-Grenze, K-150).
//!
//! Gemeinsame Kollisionssuche für `Wucht` (H-K7): [`Kandidat`], [`form`], [`sammle`], [`breitphase`] (Sweep-and-Prune nach
//! Hüllen-min-x in waagerechten Streifen, Schlüssel `ordnungs_bits` + Teil-ID), [`sammle_wenn`] und [`paare`] (Breitphase + Engphase [`trifft`]). Alles f64, keine
//! Wurzel, Reihenfolgen nur nach Teil-ID.

use alloc::vec;
use alloc::vec::Vec;

use super::*;
use crate::schema::{Feld, Genus, Raum, Schema, Spalte};
use crate::welt::{kasten_3d, punkt_3d};

pub const FORM: usize = 0;
pub const BREITE: usize = 1;
pub const HOEHE: usize = 2;
pub const TIEFE: usize = 3;
pub const RADIUS: usize = 4;
pub const VERSATZ_X: usize = 5;
pub const VERSATZ_Y: usize = 6;
pub const VERSATZ_Z: usize = 7;
pub const GRUPPE: usize = 8;
pub const MASKE: usize = 9;
pub const AUSLOESER: usize = 10;
/// Lesefeld: alle überlappenden Fühler-Teile, nach ID
pub const BERUEHRT: usize = 11;
/// Lesefeld: seit dem letzten Takt neu berührt, nach ID
pub const BETRETEN: usize = 12;
/// Lesefeld: seit dem letzten Takt nicht mehr berührt, nach ID
pub const VERLASSEN: usize = 13;
/// Lesefeld: Länge von `beruehrt`
pub const ANZAHL: usize = 14;
/// verborgen: Teil, für das die Listen gelten (0 = keines). Weicht es vom Teil ab (Kopie, umgehängt), gilt der Vortakt als leer.
pub const FUER: usize = 15;

/// Werte von `form`.
pub mod form {
    pub const AUTO: u32 = 0;
    pub const KREIS: u32 = 1;
    pub const RECHTECK: u32 = 2;
    pub const KASTEN: u32 = 3;
    pub const KUGEL: u32 = 4;
}

pub static ART: Art = Art {
    schema: Schema {
        name: "Fuehler",
        genus: Genus::M,
        raum: Raum::Beide,
        braucht: &[],
        felder: &[
            Feld::wahl("form", &["auto", "kreis", "rechteck", "kasten", "kugel"], 0),
            Feld::zahl("breite", 0.0).min(0.0),
            Feld::zahl("hoehe", 0.0).min(0.0),
            Feld::zahl("tiefe", 0.0).min(0.0),
            Feld::zahl("radius", 0.0).min(0.0),
            Feld::zahl("versatzX", 0.0),
            Feld::zahl("versatzY", 0.0),
            Feld::zahl("versatzZ", 0.0),
            Feld::ganz("gruppe", 1.0).bereich(1.0, 32.0),
            Feld::ganz("maske", 4_294_967_295.0).bereich(0.0, 4_294_967_295.0),
            Feld::diavolo("ausloeser", true),
            Feld::teil_liste("beruehrt").lesen(),
            Feld::teil_liste("betreten").lesen(),
            Feld::teil_liste("verlassen").lesen(),
            Feld::ganz("anzahl", 0.0).lesen(),
            Feld::intern("fuer", 0.0),
        ],
    },
    nachlauf: Some(nachlauf),
    ..Art::LEER
};

/// Ein Fühler in der Kollisionssuche (unabhängig vom Speicher-Layout; `Wucht` baut dieselben Kandidaten).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Kandidat {
    pub teil: u32,
    pub drei_d: bool,
    /// Gruppe als Bit (`1 << (gruppe − 1)`)
    pub gruppe: u32,
    pub maske: u32,
    pub ausloeser: bool,
    pub huelle: Huelle,
}

impl Kandidat {
    /// Die Masken passen beidseitig und der Raum ist gleich.
    #[inline]
    pub fn spuert(&self, b: &Kandidat) -> bool {
        self.drei_d == b.drei_d && self.maske & b.gruppe != 0 && b.maske & self.gruppe != 0
    }
}

/// Sortierschlüssel eines f64 (total, −0 = +0, NaN = 0) – wie `paket.rs` (dort privat).
#[inline]
pub fn ordnungs_bits(x: f64) -> u64 {
    let x = if x.is_nan() { 0.0 } else { x + 0.0 };
    let b = x.to_bits();
    if b & (1 << 63) != 0 {
        !b
    } else {
        b | (1 << 63)
    }
}

/// x-Bereich (min, max) einer Hülle in Weltlage.
#[inline]
pub fn x_bereich(h: &Huelle) -> (f64, f64) {
    match *h {
        Huelle::Kreis(m, r) => (m[0] - r, m[0] + r),
        Huelle::Rechteck(lo, hi) => (lo[0], hi[0]),
        Huelle::Kasten(lo, hi) => (lo[0], hi[0]),
        Huelle::Kugel(m, r) => (m[0] - r, m[0] + r),
    }
}

/// Achsenparalleles Umschließendes (2D: z-Werte 0) einer Hülle.
fn umschliesse(h: &Huelle) -> ([f64; 3], [f64; 3]) {
    match *h {
        Huelle::Kreis(m, r) => ([m[0] - r, m[1] - r, 0.0], [m[0] + r, m[1] + r, 0.0]),
        Huelle::Rechteck(lo, hi) => ([lo[0], lo[1], 0.0], [hi[0], hi[1], 0.0]),
        Huelle::Kasten(lo, hi) => (lo, hi),
        Huelle::Kugel(m, r) => ([m[0] - r, m[1] - r, m[2] - r], [m[0] + r, m[1] + r, m[2] + r]),
    }
}

/// Hülle um `d` verschoben (2D: nur x, y).
pub fn verschoben(h: Huelle, d: [f64; 3]) -> Huelle {
    match h {
        Huelle::Kreis(m, r) => Huelle::Kreis([m[0] + d[0], m[1] + d[1]], r),
        Huelle::Rechteck(lo, hi) => Huelle::Rechteck([lo[0] + d[0], lo[1] + d[1]], [hi[0] + d[0], hi[1] + d[1]]),
        Huelle::Kasten(lo, hi) => Huelle::Kasten([lo[0] + d[0], lo[1] + d[1], lo[2] + d[2]], [hi[0] + d[0], hi[1] + d[1], hi[2] + d[2]]),
        Huelle::Kugel(m, r) => Huelle::Kugel([m[0] + d[0], m[1] + d[1], m[2] + d[2]], r),
    }
}

fn halb_max(lo: [f64; 3], hi: [f64; 3], n: usize) -> f64 {
    let mut r = 0.0;
    for i in 0..n {
        let e = (hi[i] - lo[i]) * 0.5;
        if e > r {
            r = e;
        }
    }
    r
}

/// Größter Maßstab einer 3D-Welt-Matrix (längste Spalte).
fn massstab_3d(m: &[f64; 12]) -> f64 {
    let mut g = 0.0;
    for j in 0..3 {
        let l = libm::sqrt(m[j] * m[j] + m[4 + j] * m[4 + j] + m[8 + j] * m[8 + j]);
        if l > g {
            g = l;
        }
    }
    g
}

/// Form des Fühlers in Speicherzeile `z` in Weltlage – `None`, wenn er nirgends hängt, das Teil unsichtbar ist oder keine Form
/// entsteht (`auto` bzw. Maße 0 ohne Hülle einer anderen Komponente). Aktualisiert die Welt-Matrix des Teils.
///
/// - `auto`: Hülle wie `trifft` (erste Komponente mit Hülle), um den Versatz verschoben.
/// - `kreis`/`kugel`: Mitte = Lage + Versatz (mit dem Teil gedreht/skaliert), Radius = `radius` × größter Maßstab; `radius` 0 →
///   Mitte und halbe größte Ausdehnung der Hülle (+ Versatz).
/// - `rechteck`/`kasten`: Box `breite` × `hoehe` (× `tiefe`) um Lage + Versatz, gedreht umschlossen; jede Seite 0 nimmt die
///   Ausdehnung der Hülle in dieser Weltachse (alle 0 = ganz die Hülle).
/// - Die Form folgt dem Raum des Teils: `kreis` an einem 3D-Teil ist eine Kugel, `kasten` an einem 2D-Teil ein Rechteck usw.
pub fn form(w: &mut Welt, s: &Speicher, z: usize) -> Option<Huelle> {
    let teil = s.teil[z];
    let tz = w.zeile_opt(teil)?;
    w.aktualisiere(tz);
    if !w.teile.welt_sichtbar[tz] {
        return None;
    }
    let drei_d = w.teile.drei_d[tz];
    let m = w.teile.welt[tz];
    let v = [s.zahl(VERSATZ_X)[z], s.zahl(VERSATZ_Y)[z], s.zahl(VERSATZ_Z)[z]];
    // Versatz als Weltvektor (nur der lineare Teil der Matrix) und Lage + Versatz als Punkt
    let (d, p) = if drei_d {
        let p = punkt_3d(&m, v);
        ([p[0] - m[3], p[1] - m[7], p[2] - m[11]], p)
    } else {
        let d = [m[0] * v[0] + m[2] * v[1], m[1] * v[0] + m[3] * v[1], 0.0];
        (d, [m[4] + d[0], m[5] + d[1], 0.0])
    };
    let art = s.zahl(FORM)[z] as u32;
    // Hülle der übrigen Komponenten (Fühler selbst hat keine), schon um den Versatz verschoben
    let mut basis = || w.huelle(teil).filter(|h| matches!(h, Huelle::Kasten(..) | Huelle::Kugel(..)) == drei_d).map(|h| verschoben(h, d));
    match art {
        form::AUTO => basis(),
        form::KREIS | form::KUGEL => {
            let r = s.zahl(RADIUS)[z];
            if r > 0.0 {
                return Some(if drei_d { Huelle::Kugel(p, r * massstab_3d(&m)) } else { Huelle::Kreis([p[0], p[1]], r * massstab_2d(&m)) });
            }
            let h = basis()?;
            Some(match h {
                Huelle::Kreis(..) | Huelle::Kugel(..) => h,
                Huelle::Rechteck(lo, hi) => Huelle::Kreis([(lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5], halb_max([lo[0], lo[1], 0.0], [hi[0], hi[1], 0.0], 2)),
                Huelle::Kasten(lo, hi) => Huelle::Kugel([(lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5], halb_max(lo, hi, 3)),
            })
        }
        _ => {
            let n = if drei_d { 3 } else { 2 };
            let masse = [s.zahl(BREITE)[z], s.zahl(HOEHE)[z], s.zahl(TIEFE)[z]];
            let eigen = (0..n).any(|i| masse[i] > 0.0);
            let (mut lo, mut hi) = if drei_d {
                let h = [masse[0] * 0.5, masse[1] * 0.5, masse[2] * 0.5];
                kasten_3d(&m, [v[0] - h[0], v[1] - h[1], v[2] - h[2]], [v[0] + h[0], v[1] + h[1], v[2] + h[2]])
            } else {
                match rechteck_huelle(&m, [v[0], v[1]], [masse[0] * 0.5, masse[1] * 0.5]) {
                    Huelle::Rechteck(lo, hi) => ([lo[0], lo[1], 0.0], [hi[0], hi[1], 0.0]),
                    _ => return None,
                }
            };
            if !eigen || (0..n).any(|i| masse[i] <= 0.0) {
                // fehlende Seiten aus der Hülle (ohne Hülle: nur ganz ohne eigene Maße keine Form)
                match basis() {
                    Some(h) => {
                        let (blo, bhi) = umschliesse(&h);
                        for i in 0..n {
                            if masse[i] <= 0.0 {
                                lo[i] = blo[i];
                                hi[i] = bhi[i];
                            }
                        }
                    }
                    None if !eigen => return None,
                    None => {}
                }
            }
            Some(if drei_d { Huelle::Kasten(lo, hi) } else { Huelle::Rechteck([lo[0], lo[1]], [hi[0], hi[1]]) })
        }
    }
}

/// Alle Fühler mit Form als Kandidaten (in Speicher-Reihenfolge) samt ihrer Speicherzeile. `s` ist der Speicher der Art
/// `Fuehler` (im Nachlauf bekommt das System ihn; `Wucht` nimmt ihn mit `core::mem::take` aus `w.speicher`).
pub fn sammle(w: &mut Welt, s: &Speicher) -> Vec<(usize, Kandidat)> {
    sammle_wenn(w, s, |_| true)
}

/// Wie [`sammle`], aber nur die Speicherzeilen, für die `wahl(z)` gilt (vor dem Formbau; `Wucht` nimmt so nur feste Fühler).
pub fn sammle_wenn(w: &mut Welt, s: &Speicher, wahl: impl Fn(usize) -> bool) -> Vec<(usize, Kandidat)> {
    let mut v = Vec::with_capacity(s.len());
    let (gr, ma, au) = (s.zahl(GRUPPE), s.zahl(MASKE), s.zahl(AUSLOESER));
    for z in 0..s.len() {
        if !wahl(z) {
            continue;
        }
        let Some(huelle) = form(w, s, z) else { continue };
        let tz = w.zeile_opt(s.teil[z]).expect("form → Teil lebt");
        let g = gr[z] as u32;
        v.push((
            z,
            Kandidat {
                teil: s.teil[z],
                drei_d: w.teile.drei_d[tz],
                gruppe: if (1..=32).contains(&g) { 1u32 << (g - 1) } else { 0 },
                maske: ma[z] as u32,
                ausloeser: au[z] != 0.0,
                huelle,
            },
        ));
    }
    v
}

/// Breitphase (Sweep-and-Prune entlang x in waagerechten Streifen): alle Index-Paare `(i, j)` in `k`, deren umschließende Kästen
/// (achsenparallel, 2D mit z = 0) sich überlappen und die sich gegenseitig spüren ([`Kandidat::spuert`]).
///
/// Ablauf: Kästen nach (`ordnungs_bits(min x)`, Teil-ID) sortieren; den y-Bereich aller Kästen in `S` gleich hohe Streifen teilen
/// (`S` = n / 64, 1 … 64; bei nicht endlichen Grenzen 1), jeden Kasten in die Streifen legen, die er überdeckt (sortiert bleibt
/// sortiert), und je Streifen entlang x sweepen. Ein Paar zählt nur in dem Streifen, in dem das größere der beiden min-y liegt –
/// dort liegen beide, also genau einmal. Ausgabe je Paar mit der kleineren Teil-ID zuerst, nach (kleinere ID, größere ID)
/// sortiert. Teil-IDs in `k` müssen verschieden sein. Kosten ≈ n · (aktive je Streifen).
pub fn breitphase(k: &[Kandidat]) -> Vec<(usize, usize)> {
    let n = k.len();
    let kaesten: Vec<([f64; 3], [f64; 3])> = k.iter().map(|c| umschliesse(&c.huelle)).collect();
    let mut ordnung: Vec<(u64, u32, usize)> = kaesten.iter().zip(k).enumerate().map(|(i, (b, c))| (ordnungs_bits(b.0[0]), c.teil, i)).collect();
    ordnung.sort_unstable();
    // Streifen über y
    let (mut y0, mut y1) = (f64::INFINITY, f64::NEG_INFINITY);
    for b in &kaesten {
        if b.0[1] < y0 {
            y0 = b.0[1];
        }
        if b.1[1] > y1 {
            y1 = b.1[1];
        }
    }
    let mut s = (n / 64).clamp(1, 64);
    let hoehe = (y1 - y0) / s as f64;
    if !(hoehe.is_finite() && hoehe > 0.0) {
        s = 1;
    }
    let streifen = |y: f64| -> usize {
        if s == 1 {
            return 0;
        }
        let f = libm::floor((y - y0) / hoehe);
        if f >= 0.0 {
            if f < s as f64 {
                f as usize
            } else {
                s - 1
            }
        } else {
            0 // auch NaN
        }
    };
    let mut je_streifen: Vec<Vec<usize>> = vec![Vec::new(); s];
    let mut erster = vec![0usize; n];
    for &(_, _, i) in &ordnung {
        let (a, b) = (streifen(kaesten[i].0[1]), streifen(kaesten[i].1[1]));
        erster[i] = a;
        for st in je_streifen.iter_mut().take(if b >= a { b + 1 } else { a + 1 }).skip(a) {
            st.push(i);
        }
    }
    /// Eintrag der aktiven Liste: alles, was der Sweep prüft, beieinander (Cache)
    #[derive(Clone, Copy)]
    struct Aktiv {
        hi_x: f64,
        lo_y: f64,
        hi_y: f64,
        lo_z: f64,
        hi_z: f64,
        gruppe: u32,
        maske: u32,
        drei_d: bool,
        i: usize,
    }
    let mut aktiv: Vec<Aktiv> = Vec::new();
    let mut paare = Vec::new();
    for (nr, liste) in je_streifen.iter().enumerate() {
        aktiv.clear();
        for &i in liste {
            let (lo, hi) = kaesten[i];
            let c = &k[i];
            // wer ganz links von `lo.x` endet, kann niemanden mehr treffen (NaN bleibt, trifft aber nie); die Reihenfolge der
            // aktiven Liste ist egal, die Paare werden am Ende sortiert
            let mut m = 0;
            while m < aktiv.len() {
                let a = aktiv[m];
                if a.hi_x < lo[0] {
                    aktiv.swap_remove(m);
                    continue;
                }
                m += 1;
                if lo[1] <= a.hi_y && a.lo_y <= hi[1] && lo[2] <= a.hi_z && a.lo_z <= hi[2] && a.drei_d == c.drei_d && c.maske & a.gruppe != 0 && a.maske & c.gruppe != 0 {
                    // genau einmal: im Streifen des größeren min-y
                    let heimat = if erster[i] > erster[a.i] { erster[i] } else { erster[a.i] };
                    if heimat == nr {
                        paare.push(if c.teil < k[a.i].teil { (i, a.i) } else { (a.i, i) });
                    }
                }
            }
            aktiv.push(Aktiv { hi_x: hi[0], lo_y: lo[1], hi_y: hi[1], lo_z: lo[2], hi_z: hi[2], gruppe: c.gruppe, maske: c.maske, drei_d: c.drei_d, i });
        }
    }
    paare.sort_unstable_by_key(|&(i, j)| (k[i].teil, k[j].teil));
    paare
}
/// Breitphase + Engphase: alle sich überlappenden Paare (kleinere Teil-ID zuerst, nach IDs sortiert).
pub fn paare(k: &[Kandidat]) -> Vec<(usize, usize)> {
    let mut p = breitphase(k);
    p.retain(|&(i, j)| trifft(k[i].huelle, k[j].huelle));
    p
}

fn liste_mut(s: &mut Speicher, f: usize) -> &mut Vec<Vec<u32>> {
    match &mut s.spalten[f] {
        Spalte::Liste(v) => v,
        _ => unreachable!("Fuehler: Listenspalte"),
    }
}

/// Nachlauf: Formen sammeln, Paare suchen, je Fühler `beruehrt` (nach ID) neu; `betreten`/`verlassen` = Unterschied zum Vortakt
/// (entfernte Teile fallen aus dem Vortakt heraus und erscheinen daher nicht in `verlassen`).
fn nachlauf(w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    if n == 0 {
        return;
    }
    let kandidaten = sammle(w, s);
    let k: Vec<Kandidat> = kandidaten.iter().map(|x| x.1).collect();
    let p = paare(&k);
    // Nachbarn je Speicherzeile flach (Zählen, Versätze, Füllen), danach je Zeile nach ID sortieren
    let mut ab = vec![0usize; n + 1];
    for &(i, j) in &p {
        ab[kandidaten[i].0 + 1] += 1;
        ab[kandidaten[j].0 + 1] += 1;
    }
    for z in 0..n {
        ab[z + 1] += ab[z];
    }
    let mut stelle = ab.clone();
    let mut nachbarn = vec![0u32; ab[n]];
    for &(i, j) in &p {
        let (zi, zj) = (kandidaten[i].0, kandidaten[j].0);
        nachbarn[stelle[zi]] = k[j].teil;
        stelle[zi] += 1;
        nachbarn[stelle[zj]] = k[i].teil;
        stelle[zj] += 1;
    }
    // Spalten herausnehmen (drei Listen zugleich veränderlich), Vektoren wiederverwenden
    let mut ber = core::mem::take(liste_mut(s, BERUEHRT));
    let mut rein = core::mem::take(liste_mut(s, BETRETEN));
    let mut raus = core::mem::take(liste_mut(s, VERLASSEN));
    for z in 0..n {
        let neu = &mut nachbarn[ab[z]..ab[z + 1]];
        neu.sort_unstable();
        let teil = s.teil[z];
        // Vortakt: nur, wenn die Listen zu diesem Teil gehören (nach Kopie/Umhängen leer); entfernte Teile fallen heraus
        let alt = &mut ber[z];
        if teil != 0 && s.zahl(FUER)[z] == teil as f64 {
            alt.retain(|&t| w.zeile_opt(t).is_some());
        } else {
            alt.clear();
        }
        let (r, v) = (&mut rein[z], &mut raus[z]);
        r.clear();
        v.clear();
        let (mut a, mut b) = (0, 0);
        while a < alt.len() || b < neu.len() {
            if b == neu.len() || (a < alt.len() && alt[a] < neu[b]) {
                v.push(alt[a]);
                a += 1;
            } else if a == alt.len() || neu[b] < alt[a] {
                r.push(neu[b]);
                b += 1;
            } else {
                a += 1;
                b += 1;
            }
        }
        alt.clear();
        alt.extend_from_slice(neu);
        s.zahl_mut(ANZAHL)[z] = neu.len() as f64;
        s.zahl_mut(FUER)[z] = teil as f64;
    }
    *liste_mut(s, BERUEHRT) = ber;
    *liste_mut(s, BETRETEN) = rein;
    *liste_mut(s, VERLASSEN) = raus;
}
