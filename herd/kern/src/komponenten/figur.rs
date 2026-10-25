//! `Figur` (3D, H-K20): Figur-Steuerung wie Unity `CharacterController` – eine aufrechte Kapsel, die läuft, springt, Treppen
//! steigt, an Wänden gleitet, auf zu steilen Hängen rutscht und auf bewegten Böden mitfährt. Die Form kommt vom `Fuehler` am
//! selben Teil (`braucht`; `kapsel` wie gesetzt, jede andere Form wird zur Kapsel um ihre Hülle, Achse immer Welt-y).
//!
//! Je Takt (Takt-System nach `Schwung`, Figuren nach Teil-ID):
//! 1. **Welt**: alle 3D-Fühler-Formen wie in der Physik ([`kollision3d::ziele`]). Hindernisse sind alle Fühler mit
//!    `ausloeser: nein` (Masken beidseitig): feste, kinematische und dynamische Körper, Netze, Gelände und die übrigen Figuren
//!    (frühere schon an ihrer neuen Lage). Wie Unitys CharacterController drückt die Figur dynamische Körper nicht von selbst weg –
//!    `schieben` stößt sie an; für `Schwung` ist die Figur ein fester Körper.
//! 2. **Mitfahren**: stand die Figur im Vortakt auf einem Teil, wird der damals gemerkte Punkt durch dessen aktuelle Welt-Matrix
//!    gerechnet – der Unterschied verschiebt die Figur (kinematischer Schwung, Ablauf, Gleiten, Programm – alles, was den Boden bewegt).
//! 3. **Tempo**: waagerecht `laufX`/`laufZ` (Wunschtempo, ohne eigenes Anfahren), senkrecht das Falltempo aus dem Vortakt −
//!    `schwerkraft` · dt; `sprung` > 0 am Boden setzt das Falltempo (danach 0).
//! 4. **Waagerecht wischen**: der Weg in Teilschritten (≤ halber Radius), nach jedem bis zu [`GLEITEN`] Durchgänge Herausschieben
//!    aus allen Hindernissen (Kapsel mit Radius + `haut`): Boden (Normale ≤ `hang` geneigt) senkrecht, Decke entlang der Normale, Wand
//!    waagerecht – so gleitet die Figur an Wänden entlang und kann zu steile Hänge nicht hinauf. Kanten bis `stufe` über dem Fuß, auf
//!    deren Oberseite man stehen kann, zählen als Boden (ein kurzer Strahl prüft die Fläche dahinter): niedrige Stufen nimmt die
//!    Kapsel so wie eine Rampe.
//! 5. **Stufe**: hielt eine Wand den Weg auf und stand die Figur, ein Versuch Hoch (`stufe`) – Vor – Runter; er gilt, wenn er auf
//!    Boden landet und weiter kommt.
//! 6. **Senkrecht wischen**, dann **Kleben**: stand die Figur im Vortakt und fällt nicht durch einen Sprung, sucht sie bis `stufe`
//!    darunter Boden (Treppe und Hang hinab ohne Abheben).
//! 7. **Zurückschreiben**: Lage (über die Eltern-Matrix), Lesefelder `amBoden`, `boden`, `bodenHoehe`, `bodenNormale*`,
//!    `tempo*` (tatsächlich, ohne Mitfahren), `anWand`, `anDecke`; `schieben` als Stoß an dynamische Körper vor der Figur.
//!
//! Grenzen (K-165): Kollision über Teilschritte statt geschlossener Wisch-Abfrage (Tempo je Takt ≤ 16 halbe Radien), Drehung des
//! Bodens dreht die Figur nicht mit, keine Kräfte von dynamischen Körpern auf die Figur. Alles f64, nur `libm`, Reihenfolgen nach
//! Teil-ID (K-129).

use alloc::vec::Vec;

use super::*;
use crate::kollision3d::{self, mal, minus, plus, punkt, Form, Punkt, Umgebung, Ziel, V};
use crate::schema::{Feld, Genus, Raum, Schema};
use crate::welt::{lage, punkt_3d, GRAD};

pub const LAUF_X: usize = 0;
pub const LAUF_Z: usize = 1;
pub const SPRUNG: usize = 2;
pub const SCHWERKRAFT: usize = 3;
pub const STUFE: usize = 4;
pub const HANG: usize = 5;
pub const HAUT: usize = 6;
pub const SCHIEBEN: usize = 7;
pub const MITFAHREN: usize = 8;
/// Lesefeld: steht auf Boden
pub const AM_BODEN: usize = 9;
/// Lesefeld: Teil, auf dem die Figur steht (0 = keines)
pub const BODEN: usize = 10;
/// Lesefeld: Höhe des Bodenpunkts (Welt)
pub const BODEN_HOEHE: usize = 11;
/// Lesefelder: Normale des Bodens (3 Spalten ab hier)
pub const BODEN_NORMALE: usize = 12;
/// Lesefelder: tatsächliches Tempo (3 Spalten ab hier)
pub const TEMPO: usize = 15;
pub const AN_WAND: usize = 18;
pub const AN_DECKE: usize = 19;
/// verborgen: Falltempo (Einheiten/s, nach oben positiv)
pub const FALL: usize = 20;
/// verborgen: gemerkter Punkt im Raum des Bodens (3 Spalten)
pub const BEZUG_LOKAL: usize = 21;
/// verborgen: derselbe Punkt in Welt beim Merken (3 Spalten)
pub const BEZUG_WELT: usize = 24;
/// verborgen: Teil, für das der Zustand gilt (Kopie/Umhängen → neu)
pub const FUER: usize = 27;

/// Durchgänge Herausschieben je Teilschritt („Gleit-Schritte“, fest).
pub const GLEITEN: usize = 4;
/// Teilschritt höchstens dieser Anteil des Radius.
pub const TEILSCHRITT: f64 = 0.5;
/// Höchstzahl Teilschritte je Bewegung.
pub const MAX_TEILE: usize = 16;
/// Genauigkeit beim Wischen nach unten (Kleben, Stufe): halb so groß wie der Kontaktrand, damit der Boden danach als berührt zählt.
pub const SENKEN: f64 = kollision3d::RAND * 0.5;
/// Überlappung, die nicht mehr geschoben wird.
const EPS: f64 = 1e-9;
/// Kanten-Probe: so weit hinein und darüber beginnt der kurze Strahl nach unten.
const KANTE_HINEIN: f64 = 0.01;
const KANTE_HOCH: f64 = 0.05;
const OBEN: V = [0.0, 1.0, 0.0];

pub static ART: Art = Art {
    schema: Schema {
        name: "Figur",
        genus: Genus::F,
        raum: Raum::Drei,
        braucht: &["Fuehler"],
        felder: &[
            Feld::zahl("laufX", 0.0),
            Feld::zahl("laufZ", 0.0),
            Feld::zahl("sprung", 0.0).min(0.0),
            Feld::zahl("schwerkraft", 9.81),
            Feld::zahl("stufe", 0.3).min(0.0),
            Feld::zahl("hang", 45.0).bereich(0.0, 90.0),
            Feld::zahl("haut", 0.02).min(0.0),
            Feld::zahl("schieben", 0.0).min(0.0),
            Feld::diavolo("mitfahren", true),
            Feld::diavolo("amBoden", false).lesen(),
            Feld::teil("boden").lesen(),
            Feld::zahl("bodenHoehe", 0.0).lesen(),
            Feld::zahl("bodenNormaleX", 0.0).lesen(),
            Feld::zahl("bodenNormaleY", 0.0).lesen(),
            Feld::zahl("bodenNormaleZ", 0.0).lesen(),
            Feld::zahl("tempoX", 0.0).lesen(),
            Feld::zahl("tempoY", 0.0).lesen(),
            Feld::zahl("tempoZ", 0.0).lesen(),
            Feld::diavolo("anWand", false).lesen(),
            Feld::diavolo("anDecke", false).lesen(),
            Feld::intern("falltempo", 0.0),
            Feld::intern("bezugX", 0.0),
            Feld::intern("bezugY", 0.0),
            Feld::intern("bezugZ", 0.0),
            Feld::intern("bezugWeltX", 0.0),
            Feld::intern("bezugWeltY", 0.0),
            Feld::intern("bezugWeltZ", 0.0),
            Feld::intern("fuer", 0.0),
        ],
    },
    takt: Some(takt),
    lies: Some(lies),
    ..Art::LEER
};

/// `boden` beim Lesen: ein inzwischen entferntes Teil liest sich als `karton` (0). Die Spalte bleibt.
fn lies(w: &mut Welt, a: usize, z: usize, feld: usize) -> Option<f64> {
    if feld != BODEN {
        return None;
    }
    let t = w.speicher[a].zahl(BODEN)[z];
    Some(if t != 0.0 && w.zeile_opt(t as u32).is_some() { t } else { 0.0 })
}

/// Was die Figur nach einem Herausschieben berührt (Kapsel mit Haut, ab [`kollision3d::RAND`] davor).
#[derive(Clone, Copy, Debug, Default)]
struct Beruehrung {
    /// Boden: Teil, Normale (nach oben), Höhe des Punkts – der flachste (größtes y der Normale; gleich: kleinere ID)
    boden: Option<(u32, V, f64)>,
    wand: bool,
    decke: bool,
    /// eine Wand hat waagerecht geschoben, ihr Punkt lag höchstens `stufe` über dem Fuß (vielleicht eine Stufe)
    wand_schub: bool,
}

/// Eine Bewegung der Kapsel durch die Hindernisse.
struct Lauf<'a> {
    ziele: &'a [Ziel],
    u: &'a Umgebung<'a>,
    /// Hindernisse (Index in `ziele`, nach Teil-ID)
    kand: Vec<usize>,
    halb: f64,
    r: f64,
    cos_hang: f64,
    stufe: f64,
}

#[derive(Clone, Copy, PartialEq)]
enum Klasse {
    Boden,
    Decke,
    Wand,
}

impl Lauf<'_> {
    fn kapsel(&self, c: V) -> Form {
        Form::Kapsel { m: c, achse: OBEN, halb: self.halb, r: self.r }
    }

    /// Klasse eines Kontakts (Normale `n` vom Hindernis zur Figur) und die für den Boden gemeldete Normale. Kanten (Punkt bis
    /// `stufe` über dem Fuß, Normale nach oben), hinter denen ein kurzer Strahl nach unten begehbare Fläche desselben Hindernisses
    /// findet, sind Boden mit deren Normale.
    fn klasse(&self, c: V, p: &Punkt, n: V, z: &Ziel) -> (Klasse, V) {
        if n[1] >= self.cos_hang - 1e-9 && n[1] > 0.05 {
            return (Klasse::Boden, n);
        }
        if n[1] <= -0.5 {
            return (Klasse::Decke, n);
        }
        let fuss = c[1] - self.halb - self.r;
        if self.stufe > 0.0 && n[1] > 0.05 && p.p[1] - fuss <= self.stufe {
            let l = libm::sqrt(n[0] * n[0] + n[2] * n[2]);
            if l > 1e-9 {
                let o = [p.p[0] - n[0] / l * KANTE_HINEIN, p.p[1] + KANTE_HOCH, p.p[2] - n[2] / l * KANTE_HINEIN];
                if let Some(t) = kollision3d::strahl(o, [0.0, -1.0, 0.0], 2.0 * KANTE_HOCH, &z.form, self.u) {
                    if t.n[1] >= self.cos_hang - 1e-9 && t.n[1] > 0.05 {
                        return (Klasse::Boden, t.n);
                    }
                }
            }
        }
        (Klasse::Wand, n)
    }

    /// Schiebt die Kapsel bei `c` aus allen Hindernissen (bis zu [`GLEITEN`] Durchgänge; je Durchgang alle Kontakte, was frühere
    /// schon behoben haben, zählt ab). Rückgabe: neue Mitte und was sie zuletzt berührt.
    fn loese(&self, mut c: V, punkte: &mut Vec<Punkt>) -> (V, Beruehrung) {
        let mut b = Beruehrung::default();
        for _ in 0..GLEITEN {
            b = Beruehrung { wand_schub: b.wand_schub, ..Beruehrung::default() };
            let mut schub = [0.0; 3];
            let mut bewegt = false;
            let kapsel = self.kapsel(c);
            for &i in &self.kand {
                let z = &self.ziele[i];
                punkte.clear();
                kollision3d::kontakte_genau(&kapsel, &z.form, self.u, punkte);
                for p in punkte.iter() {
                    let n = mal(p.n, -1.0);
                    let (k, nb) = self.klasse(c, p, n, z);
                    match k {
                        Klasse::Boden => {
                            if b.boden.is_none_or(|(_, bn, _)| nb[1] > bn[1]) {
                                b.boden = Some((z.teil, nb, p.p[1]));
                            }
                        }
                        Klasse::Decke => b.decke = true,
                        Klasse::Wand => b.wand = true,
                    }
                    let rest = p.tiefe - punkt(schub, n);
                    if !(rest > EPS) {
                        continue;
                    }
                    let d = match k {
                        Klasse::Boden => [0.0, rest / if n[1] > 0.1 { n[1] } else { 0.1 }, 0.0],
                        Klasse::Decke => mal(n, rest),
                        Klasse::Wand => {
                            let l = libm::sqrt(n[0] * n[0] + n[2] * n[2]);
                            if l > 0.5 {
                                if p.p[1] - (c[1] - self.halb - self.r) <= self.stufe {
                                    b.wand_schub = true;
                                }
                                [n[0] / l * (rest / l), 0.0, n[2] / l * (rest / l)]
                            } else {
                                mal(n, rest)
                            }
                        }
                    };
                    schub = plus(schub, d);
                    bewegt = true;
                }
            }
            if !bewegt {
                break;
            }
            c = plus(c, schub);
        }
        (c, b)
    }

    /// Liegt bei `c` etwas unter der Figur in ihr (Kontakt mit Normale nach oben, Überlappung > [`EPS`])?
    fn unten_belegt(&self, c: V, punkte: &mut Vec<Punkt>) -> bool {
        let kapsel = self.kapsel(c);
        for &i in &self.kand {
            punkte.clear();
            kollision3d::kontakte_genau(&kapsel, &self.ziele[i].form, self.u, punkte);
            if punkte.iter().any(|p| p.tiefe > EPS && -p.n[1] > 0.05) {
                return true;
            }
        }
        false
    }

    /// Senkrechtes Wischen nach unten bis höchstens `weg`: der tiefste freie Punkt über dem ersten Hindernis (Halbieren, bis die
    /// Lücke höchstens [`SENKEN`] ist – höchstens 30 Schritte), dort Herausschieben. `None`, wenn darunter bis `weg` nichts liegt oder
    /// dort kein Boden ist.
    fn senke(&self, c: V, weg: f64, punkte: &mut Vec<Punkt>) -> Option<(V, Beruehrung)> {
        if !(weg > 0.0) || !self.unten_belegt([c[0], c[1] - weg, c[2]], punkte) {
            return None;
        }
        let (mut frei, mut belegt) = (0.0, weg);
        for _ in 0..30 {
            if !(belegt - frei > SENKEN) {
                break;
            }
            let mitte = (frei + belegt) * 0.5;
            if self.unten_belegt([c[0], c[1] - mitte, c[2]], punkte) {
                belegt = mitte;
            } else {
                frei = mitte;
            }
        }
        let (c2, b) = self.loese([c[0], c[1] - frei, c[2]], punkte);
        b.boden.map(|_| (c2, b))
    }

    /// Bewegt die Kapsel um `d` in Teilschritten (≤ [`TEILSCHRITT`] · Radius, höchstens [`MAX_TEILE`]), nach jedem Herausschieben.
    fn bewege(&self, mut c: V, d: V, punkte: &mut Vec<Punkt>) -> (V, Beruehrung) {
        let l = kollision3d::laenge(d);
        let n = if l > 0.0 && self.r > 0.0 { libm::ceil(l / (TEILSCHRITT * self.r)) } else { 1.0 };
        let n = if n < 1.0 { 1 } else if n > MAX_TEILE as f64 { MAX_TEILE } else { n as usize };
        let schritt = mal(d, 1.0 / n as f64);
        let mut b = Beruehrung::default();
        let mut schub = false;
        for _ in 0..n {
            c = plus(c, schritt);
            let (c2, b2) = self.loese(c, punkte);
            c = c2;
            schub |= b2.wand_schub;
            b = b2;
        }
        b.wand_schub = schub;
        (c, b)
    }
}

#[inline]
fn waagerecht2(a: V, b: V) -> f64 {
    let (x, z) = (a[0] - b[0], a[2] - b[2]);
    x * x + z * z
}

/// Form der Figur am Teil (Zeile `tz`) aus ihrem Fühler (Zeile `fz` in `fs`): aufrechte Kapsel. Unsichtbare Figuren haben keine
/// Hülle – dann zählen nur eigene Maße (`kapsel`/`kugel` mit `radius`).
fn eigene_form(w: &mut Welt, fs: &Speicher, fz: usize, tz: usize) -> Option<Form> {
    let huelle = fuehler::form(w, fs, fz).unwrap_or(Huelle::Kugel([w.teile.welt[tz][3], w.teile.welt[tz][7], w.teile.welt[tz][11]], 0.0));
    let f = kollision3d::form_aus_fuehler(w, fs, fz, tz, huelle, true)?;
    let f = kollision3d::aufrecht(&f, &w.ressourcen)?;
    match f {
        Form::Kapsel { r, .. } if r > 0.0 => Some(f),
        _ => None,
    }
}

fn takt(w: &mut Welt, s: &mut Speicher) {
    let n = s.len();
    if n == 0 {
        return;
    }
    let Some(fi) = w.art_index("Fuehler") else { return };
    let si = w.art_index("Schwung");
    let gi = w.art_index("Gelaende");
    // Figuren nach Teil-ID
    let mut reihe: Vec<(u32, usize)> = (0..n).filter(|&z| s.teil[z] != 0).map(|z| (s.teil[z], z)).collect();
    reihe.sort_unstable();
    if reihe.is_empty() {
        return;
    }
    let mut ziele = kollision3d::ziele(w);
    let mut punkte: Vec<Punkt> = Vec::new();
    for &(teil, z) in &reihe {
        let Some(tz) = wach(w, teil) else { continue };
        w.aktualisiere(tz);
        if s.zahl(FUER)[z] != teil as f64 {
            s.zahl_mut(FUER)[z] = teil as f64;
            for f in [FALL, AM_BODEN, BODEN] {
                s.zahl_mut(f)[z] = 0.0;
            }
        }
        // eigene Form und Masken
        let Some(fz) = w.komp_zeile(tz, fi) else { continue };
        let fs = core::mem::take(&mut w.speicher[fi]);
        let form = eigene_form(w, &fs, fz, tz);
        let g = fs.zahl(fuehler::GRUPPE)[fz] as u32;
        let gruppe = if (1..=32).contains(&g) { 1u32 << (g - 1) } else { 0 };
        let maske = fs.zahl(fuehler::MASKE)[fz] as u32;
        w.speicher[fi] = fs;
        let Some(Form::Kapsel { m: c0, halb, r, .. }) = form else { continue };
        let haut = s.zahl(HAUT)[z];
        let stufe = s.zahl(STUFE)[z];
        let war_boden = s.zahl(AM_BODEN)[z] != 0.0;
        // 2. Mitfahren
        let mut delta = [0.0; 3];
        let boden_alt = s.zahl(BODEN)[z] as u32;
        if s.zahl(MITFAHREN)[z] != 0.0 && war_boden && boden_alt != 0 {
            if let Some(bz) = w.zeile_opt(boden_alt) {
                w.aktualisiere(bz);
                let lokal = [s.zahl(BEZUG_LOKAL)[z], s.zahl(BEZUG_LOKAL + 1)[z], s.zahl(BEZUG_LOKAL + 2)[z]];
                let alt = [s.zahl(BEZUG_WELT)[z], s.zahl(BEZUG_WELT + 1)[z], s.zahl(BEZUG_WELT + 2)[z]];
                let neu = punkt_3d(&w.teile.welt[bz], lokal);
                let d = minus(neu, alt);
                if d.iter().all(|x| x.is_finite()) {
                    delta = d;
                }
            }
        }
        // 3. Tempo
        let mut vy = s.zahl(FALL)[z];
        let springt = war_boden && s.zahl(SPRUNG)[z] > 0.0;
        if springt {
            vy = s.zahl(SPRUNG)[z];
        }
        s.zahl_mut(SPRUNG)[z] = 0.0;
        vy -= s.zahl(SCHWERKRAFT)[z] * DT;
        let lauf = [s.zahl(LAUF_X)[z], s.zahl(LAUF_Z)[z]];
        let dh = [lauf[0] * DT, 0.0, lauf[1] * DT];
        let dv = vy * DT;
        let re = r + haut;
        // Hindernisse im Bereich der ganzen Bewegung
        let weite = kollision3d::laenge(delta) + kollision3d::laenge(dh) + betrag(dv) + stufe + re + halb + kollision3d::RAND;
        let (lo, hi) = (minus(plus(c0, delta), [weite; 3]), plus(plus(c0, delta), [weite; 3]));
        let ueberlappt = |zl: &Ziel| (0..3).all(|k| zl.lo[k] <= hi[k] && lo[k] <= zl.hi[k]);
        let spuert = |zl: &Ziel| zl.teil != teil && maske & zl.gruppe != 0 && zl.maske & gruppe != 0;
        let kand: Vec<usize> = (0..ziele.len()).filter(|&i| !ziele[i].ausloeser && spuert(&ziele[i]) && ueberlappt(&ziele[i])).collect();
        let schieben = s.zahl(SCHIEBEN)[z];
        let dynamische: Vec<usize> =
            if schieben > 0.0 { (0..ziele.len()).filter(|&i| !ziele[i].ausloeser && ziele[i].dynamisch && spuert(&ziele[i]) && ueberlappt(&ziele[i])).collect() } else { Vec::new() };
        let (c_end, b_end, grounded, wand, decke, stoesse) = {
            let umgebung = Umgebung { ressourcen: &w.ressourcen, gelaende: gi.map(|g| &w.speicher[g]) };
            let lauf_w = Lauf { ziele: &ziele, u: &umgebung, kand, halb, r: re, cos_hang: libm::cos(s.zahl(HANG)[z] * GRAD), stufe };
            let c = plus(c0, delta);
            // 4. waagerecht
            let (mut ca, mut ba) = lauf_w.bewege(c, dh, &mut punkte);
            // 5. Stufe: Hoch – Vor – Runter
            if stufe > 0.0 && war_boden && !springt && ba.wand_schub && waagerecht2(dh, [0.0; 3]) > 0.0 {
                let (c1, _) = lauf_w.bewege(c, [0.0, stufe, 0.0], &mut punkte);
                let (c2, _) = lauf_w.bewege(c1, dh, &mut punkte);
                if let Some((c3, b3)) = lauf_w.senke(c2, c1[1] - c[1], &mut punkte) {
                    if waagerecht2(c3, c) > waagerecht2(ca, c) * (1.0 + 1e-6) + 1e-12 {
                        ca = c3;
                        ba = b3;
                    }
                }
            }
            // 6. senkrecht, dann Kleben
            let (mut cb, mut bb) = lauf_w.bewege(ca, [0.0, dv, 0.0], &mut punkte);
            let mut grounded = bb.boden.is_some() && vy <= 0.0;
            if !grounded && war_boden && !springt && vy <= 0.0 && stufe > 0.0 {
                if let Some((cs, bs)) = lauf_w.senke(cb, stufe, &mut punkte) {
                    cb = cs;
                    bb = bs;
                    grounded = true;
                }
            }
            // Stöße an dynamische Körper vor der Figur (waagerecht, je Körper einmal)
            let mut stoesse: Vec<(u32, V)> = Vec::new();
            if !dynamische.is_empty() && waagerecht2(dh, [0.0; 3]) > 0.0 {
                let kapsel = lauf_w.kapsel(cb);
                for &i in &dynamische {
                    punkte.clear();
                    kollision3d::kontakte_genau(&kapsel, &ziele[i].form, &umgebung, &mut punkte);
                    let mut best: Option<V> = None;
                    let mut tief = f64::NEG_INFINITY;
                    for p in punkte.iter() {
                        let l = libm::sqrt(p.n[0] * p.n[0] + p.n[2] * p.n[2]);
                        if l > 1e-9 && p.tiefe > tief && lauf[0] * p.n[0] + lauf[1] * p.n[2] > 0.0 {
                            tief = p.tiefe;
                            best = Some([p.n[0] / l, 0.0, p.n[2] / l]);
                        }
                    }
                    if let Some(d) = best {
                        stoesse.push((ziele[i].teil, mal(d, schieben * DT)));
                    }
                }
            }
            (cb, bb, grounded, ba.wand || bb.wand, ba.decke || bb.decke, stoesse)
        };
        if decke && vy > 0.0 {
            vy = 0.0;
        }
        if grounded {
            vy = 0.0;
        }
        // 7. Zurückschreiben
        let verschub = minus(c_end, c0);
        if verschub != [0.0; 3] {
            let m = w.teile.welt[tz];
            let ursprung = plus([m[3], m[7], m[11]], verschub);
            let e = w.teile.eltern[tz];
            let lokal = match w.zeile_opt(e).filter(|_| e != 0) {
                Some(pz) => {
                    w.aktualisiere(pz);
                    kollision3d::invers(&w.teile.welt[pz]).map(|inv| punkt_3d(&inv, ursprung))
                }
                None => Some(ursprung),
            };
            if let Some(l) = lokal {
                let lg = &mut w.teile.lage[tz];
                lg[lage::X] = l[0];
                lg[lage::Y] = l[1];
                lg[lage::Z] = l[2];
                w.markiere(tz);
            }
            // spätere Figuren sehen diese schon an der neuen Lage
            if let Some(zl) = ziele.iter_mut().find(|zl| zl.teil == teil) {
                if let Form::Kapsel { m, .. } = &mut zl.form {
                    *m = plus(*m, verschub);
                }
                zl.lo = plus(zl.lo, verschub);
                zl.hi = plus(zl.hi, verschub);
            }
        }
        let tempo = mal(minus(verschub, delta), 1.0 / DT);
        for k in 0..3 {
            s.zahl_mut(TEMPO + k)[z] = tempo[k];
        }
        s.zahl_mut(FALL)[z] = vy;
        s.zahl_mut(AN_WAND)[z] = if wand { 1.0 } else { 0.0 };
        s.zahl_mut(AN_DECKE)[z] = if decke { 1.0 } else { 0.0 };
        match b_end.boden.filter(|_| grounded) {
            Some((bt, bn, bh)) => {
                s.zahl_mut(AM_BODEN)[z] = 1.0;
                s.zahl_mut(BODEN)[z] = bt as f64;
                s.zahl_mut(BODEN_HOEHE)[z] = bh;
                for k in 0..3 {
                    s.zahl_mut(BODEN_NORMALE + k)[z] = bn[k];
                }
                // Bezugspunkt für das Mitfahren im nächsten Takt
                let mut lokal = None;
                if let Some(bz) = w.zeile_opt(bt) {
                    w.aktualisiere(bz);
                    lokal = kollision3d::invers(&w.teile.welt[bz]).map(|inv| punkt_3d(&inv, c_end));
                }
                let l = lokal.unwrap_or(c_end);
                for k in 0..3 {
                    s.zahl_mut(BEZUG_LOKAL + k)[z] = l[k];
                    s.zahl_mut(BEZUG_WELT + k)[z] = c_end[k];
                }
            }
            None => {
                s.zahl_mut(AM_BODEN)[z] = 0.0;
                s.zahl_mut(BODEN)[z] = 0.0;
                s.zahl_mut(BODEN_HOEHE)[z] = 0.0;
                for k in 0..3 {
                    s.zahl_mut(BODEN_NORMALE + k)[z] = 0.0;
                }
            }
        }
        // Stöße als Einmal-Impuls im nächsten Schwung-Takt
        if let Some(si) = si {
            for (t, d) in stoesse {
                if let Some(bz) = w.zeile_opt(t) {
                    if let Some(sz) = w.komp_zeile(bz, si) {
                        let sp = &mut w.speicher[si];
                        for k in 0..3 {
                            sp.zahl_mut(schwung::STOSS_X + k)[sz] += d[k];
                        }
                    }
                }
            }
        }
    }
}
