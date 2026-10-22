//! 2D-Zerlegung: Rechtecke (mit Rundung), Kreise, dicke Linien mit runden Enden, Vielecke (Ear-Clipping, auch konkav),
//! Umrisse (`rand` liegt innerhalb der Form), Lage-Stapel, Bildchen (pixelscharf) und Text (SDF).

use alloc::vec::Vec;

use crate::liste::{durchgang, textur, Schreibe, Zug};
use crate::mathe::*;
use crate::schrift::{setze, Schrift};

/// Art einer 2D-Ecke (Feld `art` im Vertex).
pub mod art {
    pub const FARBE: f32 = 0.0;
    pub const BILDCHEN: f32 = 1.0;
    pub const SCHRIFT: f32 = 2.0;
}

/// Höchste Tiefe des Lage-Stapels (SPEC §18.4).
pub const MAX_STAPEL: usize = 64;

/// Toleranz der Kreisannäherung in Gerätepixeln.
const TOLERANZ: f32 = 0.12;

type P = [f32; 2];

/// Affine Lage wie Canvas: x' = a·x + c·y + e, y' = b·x + d·y + f.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Lage {
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
    pub e: f32,
    pub f: f32,
}

impl Lage {
    pub const EINS: Lage = Lage { a: 1.0, b: 0.0, c: 0.0, d: 1.0, e: 0.0, f: 0.0 };
    pub fn an(&self, p: P) -> P {
        [self.a * p[0] + self.c * p[1] + self.e, self.b * p[0] + self.d * p[1] + self.f]
    }
    /// self · m (m wirkt zuerst, wie Canvas `transform`).
    fn mal(&self, m: &Lage) -> Lage {
        Lage {
            a: self.a * m.a + self.c * m.b,
            b: self.b * m.a + self.d * m.b,
            c: self.a * m.c + self.c * m.d,
            d: self.b * m.c + self.d * m.d,
            e: self.a * m.e + self.c * m.f + self.e,
            f: self.b * m.e + self.d * m.f + self.f,
        }
    }
    /// Größte Längenverzerrung (für die Feinheit der Kreise).
    fn skala(&self) -> f32 {
        wurzel(max(self.a * self.a + self.b * self.b, self.c * self.c + self.d * self.d))
    }
    fn achsentreu(&self) -> bool {
        self.b == 0.0 && self.c == 0.0 && self.a > 0.0 && self.d > 0.0
    }
}

/// Ergebnis der 2D-Zerlegung.
pub struct Flach {
    pub ecken: Vec<u8>,
    pub ecken_anzahl: u32,
    pub indizes: Vec<u8>,
    pub index_anzahl: u32,
    pub zuege: Vec<Zug>,
    lage: Lage,
    stapel: Vec<Lage>,
    /// Spielfeld-Einheit → NDC
    nx: f32,
    ny: f32,
    /// Gerätepixel je Spielfeld-Einheit
    px: f32,
    textur: u32,
    zug_start: u32,
}

impl Flach {
    pub fn neu(feld_b: f32, feld_h: f32, px: f32) -> Self {
        Flach {
            ecken: Vec::new(),
            ecken_anzahl: 0,
            indizes: Vec::new(),
            index_anzahl: 0,
            zuege: Vec::new(),
            lage: Lage::EINS,
            stapel: Vec::new(),
            nx: 2.0 / feld_b,
            ny: 2.0 / feld_h,
            px,
            textur: textur::WEISS,
            zug_start: 0,
        }
    }

    /// Spielfeld-Punkt (nach Lage) → Ecke.
    fn ecke(&mut self, p: P, uv: P, farbe: [u8; 4], a: f32) -> u32 {
        let x = p[0] * self.nx - 1.0;
        let y = 1.0 - p[1] * self.ny;
        self.ecken.f32(x);
        self.ecken.f32(y);
        self.ecken.f32(uv[0]);
        self.ecken.f32(uv[1]);
        self.ecken.u8x4(farbe);
        self.ecken.f32(a);
        self.ecken_anzahl += 1;
        self.ecken_anzahl - 1
    }

    fn drei(&mut self, a: u32, b: u32, c: u32) {
        self.indizes.u32(a);
        self.indizes.u32(b);
        self.indizes.u32(c);
        self.index_anzahl += 3;
    }

    /// Wechselt die Textur; schließt den laufenden Zug ab, wenn nötig.
    fn nutze(&mut self, t: u32) {
        if t != self.textur {
            self.schliesse_zug();
            self.textur = t;
        }
    }

    fn schliesse_zug(&mut self) {
        if self.index_anzahl > self.zug_start {
            self.zuege.push(Zug {
                durchgang: durchgang::FLACH,
                netz: 0,
                textur: self.textur,
                erster_index: self.zug_start,
                index_anzahl: self.index_anzahl - self.zug_start,
                erste_instanz: 0,
                instanz_anzahl: 1,
                seiten: 0,
            });
        }
        self.zug_start = self.index_anzahl;
    }

    pub fn fertig(&mut self) {
        self.schliesse_zug();
    }

    // ---- Lage ----
    pub fn merke(&mut self) {
        if self.stapel.len() < MAX_STAPEL {
            self.stapel.push(self.lage);
        }
    }
    pub fn zurueck(&mut self) {
        if let Some(l) = self.stapel.pop() {
            self.lage = l;
        }
    }
    pub fn schiebe(&mut self, dx: f32, dy: f32) {
        self.lage = self.lage.mal(&Lage { e: dx, f: dy, ..Lage::EINS });
    }
    pub fn drehe(&mut self, grad: f32) {
        let w = bogen(grad);
        let (s, c) = (sin(w), cos(w));
        self.lage = self.lage.mal(&Lage { a: c, b: s, c: -s, d: c, e: 0.0, f: 0.0 });
    }
    pub fn skaliere(&mut self, sx: f32, sy: f32) {
        self.lage = self.lage.mal(&Lage { a: sx, d: sy, ..Lage::EINS });
    }

    /// Anzahl Kreisteile für Radius `r` (Spielfeld-Einheiten, vor der Lage).
    fn teile(&self, r: f32) -> u32 {
        let rp = r * self.px * self.lage.skala();
        if !(rp > TOLERANZ * 2.0) {
            return 8;
        }
        let w = acos(1.0 - TOLERANZ / rp);
        let n = decke(PI / max(w, 1e-4));
        let n = klemme(n, 8.0, 1024.0) as u32;
        n.div_ceil(4) * 4
    }

    // ---- Grundbausteine ----

    /// Konvexes Vieleck (Punkte in Spielfeld-Einheiten vor der Lage) als Fächer.
    fn konvex(&mut self, pkte: &[P], farbe: [u8; 4]) {
        if pkte.len() < 3 {
            return;
        }
        self.nutze(textur::WEISS);
        let l = self.lage;
        let start = self.ecken_anzahl;
        for p in pkte {
            self.ecke(l.an(*p), [0.0, 0.0], farbe, art::FARBE);
        }
        for k in 1..pkte.len() as u32 - 1 {
            self.drei(start, start + k, start + k + 1);
        }
    }

    /// Band zwischen zwei geschlossenen Ringen gleicher Länge.
    fn band(&mut self, aussen: &[P], innen: &[P], farbe: [u8; 4]) {
        let n = aussen.len();
        if n < 2 || innen.len() != n {
            return;
        }
        self.nutze(textur::WEISS);
        let l = self.lage;
        let s = self.ecken_anzahl;
        for k in 0..n {
            self.ecke(l.an(aussen[k]), [0.0, 0.0], farbe, art::FARBE);
            self.ecke(l.an(innen[k]), [0.0, 0.0], farbe, art::FARBE);
        }
        for k in 0..n as u32 {
            let j = (k + 1) % n as u32;
            let (a0, i0, a1, i1) = (s + 2 * k, s + 2 * k + 1, s + 2 * j, s + 2 * j + 1);
            self.drei(a0, a1, i1);
            self.drei(a0, i1, i0);
        }
    }

    // ---- Befehle ----

    pub fn rechteck(&mut self, x: f32, y: f32, b: f32, h: f32, farbe: [u8; 4], rand: f32, rundung: f32) {
        let (mut x, mut y, mut b, mut h) = (x, y, b, h);
        if b < 0.0 {
            x += b;
            b = -b;
        }
        if h < 0.0 {
            y += h;
            h = -h;
        }
        if b <= 0.0 || h <= 0.0 || farbe[3] == 0 {
            return;
        }
        let halb = min(b, h) * 0.5;
        let r = klemme(rundung, 0.0, halb);
        let k = if r > 0.0 { self.teile(r) / 4 } else { 0 };
        let aussen = rund_rechteck(x, y, b, h, r, k);
        if rand > 0.0 && rand < halb {
            let d = rand;
            let ri = max(r - d, 0.0);
            let innen = rund_rechteck(x + d, y + d, b - 2.0 * d, h - 2.0 * d, ri, k);
            self.band(&aussen, &innen, farbe);
        } else {
            self.konvex(&aussen, farbe);
        }
    }

    pub fn kreis(&mut self, x: f32, y: f32, r: f32, farbe: [u8; 4], rand: f32) {
        if r <= 0.0 || farbe[3] == 0 {
            return;
        }
        let n = self.teile(r);
        let ring = |rr: f32| -> Vec<P> {
            (0..n)
                .map(|k| {
                    let w = 2.0 * PI * k as f32 / n as f32;
                    [x + rr * cos(w), y + rr * sin(w)]
                })
                .collect()
        };
        let aussen = ring(r);
        if rand > 0.0 && rand < r {
            let innen = ring(r - rand);
            self.band(&aussen, &innen, farbe);
        } else {
            self.konvex(&aussen, farbe);
        }
    }

    pub fn linie(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, dicke: f32, farbe: [u8; 4]) {
        if dicke <= 0.0 || farbe[3] == 0 {
            return;
        }
        let w = dicke * 0.5;
        let (dx, dy) = (x2 - x1, y2 - y1);
        let len = wurzel(dx * dx + dy * dy);
        if !(len > 1e-6) {
            self.kreis(x1, y1, w, farbe, 0.0);
            return;
        }
        let u = [dx / len, dy / len];
        let nrm = [-u[1], u[0]];
        let m = self.teile(w) / 2;
        let mut pk: Vec<P> = Vec::with_capacity(2 * m as usize + 2);
        for k in 0..=m {
            let t = PI * k as f32 / m as f32;
            let (c, s) = (cos(t), sin(t));
            pk.push([x2 + w * (nrm[0] * c + u[0] * s), y2 + w * (nrm[1] * c + u[1] * s)]);
        }
        for k in 0..=m {
            let t = PI * k as f32 / m as f32;
            let (c, s) = (cos(t), sin(t));
            pk.push([x1 - w * (nrm[0] * c + u[0] * s), y1 - w * (nrm[1] * c + u[1] * s)]);
        }
        self.konvex(&pk, farbe);
    }

    pub fn vieleck(&mut self, punkte: &[[f32; 2]], farbe: [u8; 4], rand: f32) {
        if farbe[3] == 0 {
            return;
        }
        let p = bereinige(punkte);
        if p.len() < 3 {
            return;
        }
        let fl = flaeche(&p);
        if !(betrag(fl) > 1e-9) {
            return;
        }
        if rand > 0.0 {
            let innen = einrueckung(&p, rand, if fl > 0.0 { 1.0 } else { -1.0 });
            self.band(&p, &innen, farbe);
            return;
        }
        let dr = ohren(&p);
        self.nutze(textur::WEISS);
        let l = self.lage;
        let s = self.ecken_anzahl;
        for q in &p {
            self.ecke(l.an(*q), [0.0, 0.0], farbe, art::FARBE);
        }
        for t in dr.chunks_exact(3) {
            self.drei(s + t[0], s + t[1], s + t[2]);
        }
    }

    /// Bildchen `id` (Größe `bb × bh`) an (x, y), `groesse` Pixel je Bildchen-Pixel, getönt mit `farbe`.
    #[allow(clippy::too_many_arguments)]
    pub fn bild(&mut self, id: u32, bb: u32, bh: u32, x: f32, y: f32, groesse: f32, farbe: [u8; 4]) {
        if !(groesse > 0.0) || farbe[3] == 0 {
            return;
        }
        let l = self.lage;
        let mut q = [
            l.an([x, y]),
            l.an([x + bb as f32 * groesse, y]),
            l.an([x + bb as f32 * groesse, y + bh as f32 * groesse]),
            l.an([x, y + bh as f32 * groesse]),
        ];
        if l.achsentreu() {
            // pixelscharf: Ecken auf Gerätepixel runden
            let px = self.px;
            let rd = |v: f32| runde(v * px) / px;
            let (x0, y0, x1, y1) = (rd(q[0][0]), rd(q[0][1]), rd(q[2][0]), rd(q[2][1]));
            q = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        }
        self.nutze(id);
        let uv = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        let s = self.ecken_anzahl;
        for k in 0..4 {
            self.ecke(q[k], uv[k], farbe, art::BILDCHEN);
        }
        self.drei(s, s + 1, s + 2);
        self.drei(s, s + 2, s + 3);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn text(&mut self, schrift: &Schrift, t: &str, x: f32, y: f32, groesse: f32, farbe: [u8; 4], ausrichtung: u8) {
        if !(groesse > 0.0) || farbe[3] == 0 {
            return;
        }
        self.nutze(textur::WEISS);
        let l = self.lage;
        let mut stuecke = Vec::new();
        setze(schrift, t, groesse, ausrichtung, |s| stuecke.push(s));
        for s in stuecke {
            let e = self.ecken_anzahl;
            self.ecke(l.an([x + s.x0, y + s.y0]), [s.u0, s.v0], farbe, art::SCHRIFT);
            self.ecke(l.an([x + s.x1, y + s.y0]), [s.u1, s.v0], farbe, art::SCHRIFT);
            self.ecke(l.an([x + s.x1, y + s.y1]), [s.u1, s.v1], farbe, art::SCHRIFT);
            self.ecke(l.an([x + s.x0, y + s.y1]), [s.u0, s.v1], farbe, art::SCHRIFT);
            self.drei(e, e + 1, e + 2);
            self.drei(e, e + 2, e + 3);
        }
    }
}

/// Rechteck mit Eckenradius `r` und `k` Teilen je Ecke (k = 0 → 4 Ecken).
fn rund_rechteck(x: f32, y: f32, b: f32, h: f32, r: f32, k: u32) -> Vec<P> {
    if k == 0 {
        return alloc::vec![[x, y], [x + b, y], [x + b, y + h], [x, y + h]];
    }
    let mut v = Vec::with_capacity(4 * (k as usize + 1));
    let ecken = [
        (x + r, y + r, PI),
        (x + b - r, y + r, 1.5 * PI),
        (x + b - r, y + h - r, 0.0),
        (x + r, y + h - r, 0.5 * PI),
    ];
    for (cx, cy, w0) in ecken {
        for j in 0..=k {
            let w = w0 + 0.5 * PI * j as f32 / k as f32;
            v.push([cx + r * cos(w), cy + r * sin(w)]);
        }
    }
    v
}

/// Entfernt aufeinanderfolgende doppelte Punkte (auch Ende = Anfang).
fn bereinige(p: &[[f32; 2]]) -> Vec<P> {
    let mut v: Vec<P> = Vec::with_capacity(p.len());
    for q in p {
        if v.last().map(|l| l[0] == q[0] && l[1] == q[1]).unwrap_or(false) {
            continue;
        }
        v.push(*q);
    }
    while v.len() > 1 && v[0] == v[v.len() - 1] {
        v.pop();
    }
    v
}

/// Doppelte vorzeichenbehaftete Fläche (Schuhband).
fn flaeche(p: &[P]) -> f32 {
    let mut s = 0.0f32;
    for k in 0..p.len() {
        let a = p[k];
        let b = p[(k + 1) % p.len()];
        s += a[0] * b[1] - b[0] * a[1];
    }
    s
}

fn kreuz(o: P, a: P, b: P) -> f32 {
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

/// Ear-Clipping (deterministisch: Suche läuft ab der letzten Fundstelle weiter). Liefert Indizes in `p`.
pub fn ohren(p: &[P]) -> Vec<u32> {
    let n = p.len();
    let mut aus = Vec::with_capacity(3 * n);
    if n < 3 {
        return aus;
    }
    let s = if flaeche(p) > 0.0 { 1.0 } else { -1.0 };
    let mut idx: Vec<u32> = (0..n as u32).collect();
    let mut k = 0usize;
    let mut versuche = 0usize;
    while idx.len() > 3 {
        let m = idx.len();
        if k >= m {
            k = 0;
        }
        let (ia, ib, ic) = (idx[(k + m - 1) % m], idx[k], idx[(k + 1) % m]);
        let (a, b, c) = (p[ia as usize], p[ib as usize], p[ic as usize]);
        let kr = kreuz(a, b, c) * s;
        let mut ohr = false;
        if kr == 0.0 {
            // kollinear: Punkt ohne Dreieck entfernen
            idx.remove(k);
            versuche = 0;
            continue;
        }
        if kr > 0.0 {
            ohr = true;
            for &j in &idx {
                if j == ia || j == ib || j == ic {
                    continue;
                }
                let q = p[j as usize];
                if q == a || q == b || q == c {
                    continue;
                }
                if kreuz(a, b, q) * s >= 0.0 && kreuz(b, c, q) * s >= 0.0 && kreuz(c, a, q) * s >= 0.0 {
                    ohr = false;
                    break;
                }
            }
        }
        if ohr || versuche >= m {
            // Notausgang bei sich selbst schneidenden Vielecken: nimm die Ecke trotzdem
            aus.extend_from_slice(&[ia, ib, ic]);
            idx.remove(k);
            versuche = 0;
        } else {
            k += 1;
            versuche += 1;
        }
    }
    if idx.len() == 3 {
        aus.extend_from_slice(&[idx[0], idx[1], idx[2]]);
    }
    aus
}

/// Nach innen versetzter Ring (Gehrung, Länge auf 4·d begrenzt). `s` = Vorzeichen der Fläche.
fn einrueckung(p: &[P], d: f32, s: f32) -> Vec<P> {
    let n = p.len();
    let normale = |a: P, b: P| -> P {
        let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
        let l = wurzel(dx * dx + dy * dy);
        if l > 0.0 {
            [-dy / l * s, dx / l * s]
        } else {
            [0.0, 0.0]
        }
    };
    let mut v = Vec::with_capacity(n);
    for k in 0..n {
        let vor = p[(k + n - 1) % n];
        let hier = p[k];
        let nach = p[(k + 1) % n];
        let n0 = normale(vor, hier);
        let n1 = normale(hier, nach);
        let m = [n0[0] + n1[0], n0[1] + n1[1]];
        let dot = n0[0] * n1[0] + n0[1] * n1[1];
        let mut f = d / max(1.0 + dot, 1e-6);
        let ml = wurzel(m[0] * m[0] + m[1] * m[1]) * f;
        if ml > 4.0 * d {
            f *= 4.0 * d / ml;
        }
        v.push([hier[0] + m[0] * f, hier[1] + m[1] * f]);
    }
    v
}


#[cfg(test)]
mod tests {
    use super::*;

    fn flaeche_dreiecke(p: &[P], i: &[u32]) -> f32 {
        i.chunks_exact(3).map(|t| betrag(kreuz(p[t[0] as usize], p[t[1] as usize], p[t[2] as usize]))).sum::<f32>()
    }

    #[test]
    fn ohren_konvex_und_konkav() {
        let quadrat = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        let d = ohren(&quadrat);
        assert_eq!(d.len(), 6);
        assert!((flaeche_dreiecke(&quadrat, &d) - 2.0).abs() < 1e-6);
        // L-Form (konkav), Fläche 3
        let l = [[0.0, 0.0], [2.0, 0.0], [2.0, 1.0], [1.0, 1.0], [1.0, 2.0], [0.0, 2.0]];
        let d = ohren(&l);
        assert_eq!(d.len(), 12);
        assert!((flaeche_dreiecke(&l, &d) - 6.0).abs() < 1e-5);
        // Stern (konkav), andere Windung
        let mut stern = Vec::new();
        for k in 0..10 {
            let w = -2.0 * PI * k as f32 / 10.0;
            let r = if k % 2 == 0 { 1.0 } else { 0.4 };
            stern.push([r * cos(w), r * sin(w)]);
        }
        let d = ohren(&stern);
        assert_eq!(d.len(), 24);
        assert!((flaeche_dreiecke(&stern, &d) - betrag(flaeche(&stern))).abs() < 1e-4);
    }

    #[test]
    fn ohren_sich_schneidend_terminiert() {
        let acht = [[0.0, 0.0], [1.0, 1.0], [1.0, 0.0], [0.0, 1.0]];
        let d = ohren(&acht);
        assert_eq!(d.len() % 3, 0);
    }

    #[test]
    fn kreis_teile_wachsen_mit_radius() {
        let f = Flach::neu(100.0, 100.0, 1.0);
        assert!(f.teile(2.0) < f.teile(50.0));
        assert_eq!(f.teile(50.0) % 4, 0);
        let g = Flach::neu(100.0, 100.0, 4.0);
        assert!(g.teile(50.0) > f.teile(50.0));
    }

    #[test]
    fn rechteck_mit_rand_und_rundung() {
        let mut f = Flach::neu(100.0, 100.0, 1.0);
        f.rechteck(10.0, 10.0, 50.0, 30.0, [255, 0, 0, 255], 0.0, 0.0);
        assert_eq!(f.ecken_anzahl, 4);
        f.rechteck(10.0, 10.0, 50.0, 30.0, [255, 0, 0, 255], 3.0, 0.0);
        assert_eq!(f.ecken_anzahl, 12);
        f.rechteck(10.0, 10.0, 50.0, 30.0, [255, 0, 0, 255], 0.0, 8.0);
        assert!(f.ecken_anzahl > 20);
        f.fertig();
        assert_eq!(f.zuege.len(), 1);
    }

    #[test]
    fn lage_dreht_im_uhrzeigersinn() {
        let mut f = Flach::neu(100.0, 100.0, 1.0);
        f.drehe(90.0);
        let p = f.lage.an([1.0, 0.0]);
        // y nach unten: (1,0) → (0,1) ist im Uhrzeigersinn
        assert!(betrag(p[0]) < 1e-6 && betrag(p[1] - 1.0) < 1e-6);
        f.merke();
        f.schiebe(10.0, 0.0);
        f.zurueck();
        assert!(betrag(f.lage.an([1.0, 0.0])[1] - 1.0) < 1e-6);
    }
}
