//! Die Welt: Teile (IDs nie wiederverwendet), Lage (f64) mit Hierarchie und Welt-Matrizen (nur geänderte Teilbäume
//! neu), Komponenten-Speicher je Art (Sparse-Set + Struktur von Arrays), Ressourcen und Welt-Einstellungen.

use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;

use crate::fehler::{self, Erg};
use crate::komponenten::{Art, Huelle};
use crate::ressourcen::Ressourcen;
use crate::schema::Speicher;

/// Markierung „keine Zeile“ (Teil entfernt bzw. nie angelegt).
pub const KEIN: u32 = u32::MAX;
/// Grad → Bogenmaß.
pub const GRAD: f64 = core::f64::consts::PI / 180.0;

/// Lage-Felder (Index in `Teile::lage`; Nummer im ABI = Index + 1).
pub mod lage {
    pub const X: usize = 0;
    pub const Y: usize = 1;
    pub const Z: usize = 2;
    pub const DREHUNG: usize = 3;
    pub const NEIGUNG: usize = 4;
    pub const ROLLEN: usize = 5;
    pub const GX: usize = 6;
    pub const GY: usize = 7;
    pub const GZ: usize = 8;
}

/// Alle lebenden Teile, dicht gespeichert (Zeile ≠ ID; `Welt::zeile_von` bildet ab).
#[derive(Default, Clone)]
pub struct Teile {
    pub id: Vec<u32>,
    pub drei_d: Vec<bool>,
    pub eltern: Vec<u32>,
    /// Kinder (IDs) in Anhänge-Reihenfolge
    pub kinder: Vec<Vec<u32>>,
    /// x, y, z, drehung, neigung, rollen (Grad), groesseX/Y/Z – relativ zu den Eltern
    pub lage: Vec<[f64; 9]>,
    pub ebene: Vec<i32>,
    pub sichtbar: Vec<bool>,
    /// Komponenten-Handles je Art (Zeile · Anzahl Arten + Art-Index), 0 = keine
    pub komp: Vec<u32>,
    /// Welt-Matrix: 3D 3×4 zeilenweise (r0, r1, r2 mit Verschiebung in Spalte 3);
    /// 2D: [a, b, c, d, tx, ty, …] (Spalten (a, b), (c, d) der 2×2 lokal → Spielfeld)
    pub welt: Vec<[f64; 12]>,
    pub welt_sichtbar: Vec<bool>,
    pub gueltig: Vec<bool>,
}

/// Wo eine Komponente steht.
#[derive(Clone, Copy, Debug, Default)]
pub struct KompOrt {
    /// Art-Index + 1; 0 = zerstört (mit ihrem Teil entfernt)
    pub art: u16,
    pub zeile: u32,
    /// bei zerstörten: das entfernte Teil
    pub weg_teil: u32,
}

#[derive(Clone)]
pub struct Welt {
    pub breite: u32,
    pub hoehe: u32,
    pub titel: String,
    pub hintergrund: u32,
    pub himmel: Option<(u32, u32)>,
    pub umgebung: Option<(u32, f64)>,
    pub nebel: Option<(u32, f64, f64)>,
    pub teile: Teile,
    /// ID → Zeile (`KEIN` = entfernt); Index 0 unbenutzt
    pub zeile_von: Vec<u32>,
    pub arten: &'static [&'static Art],
    pub speicher: Vec<Speicher>,
    /// Handle → Ort; Index 0 unbenutzt
    pub komp_ort: Vec<KompOrt>,
    pub ressourcen: Ressourcen,
    /// Anzahl gelaufener Takte (Systeme)
    pub takte: u64,
}

fn rot2(g: f64) -> (f64, f64) {
    if g == 0.0 {
        (0.0, 1.0)
    } else {
        let b = g * GRAD;
        (libm::sin(b), libm::cos(b))
    }
}

impl Welt {
    pub fn neu(breite: u32, hoehe: u32, titel: String, arten: &'static [&'static Art]) -> Welt {
        let mut w = Welt {
            breite,
            hoehe,
            titel,
            hintergrund: crate::farbe::MOZZARELLA,
            himmel: None,
            umgebung: None,
            nebel: None,
            teile: Teile::default(),
            zeile_von: vec![KEIN],
            arten,
            speicher: arten.iter().map(|a| Speicher::neu(&a.schema)).collect(),
            komp_ort: vec![KompOrt::default()],
            ressourcen: Ressourcen::default(),
            takte: 0,
        };
        // Teil 1: Kamera (0, 3, 8) → schaut auf (0, 0, 0); Teil 2: Sonne, Lage = Richtung zur Sonne.
        let kamera = w.teil_neu(true);
        w.lage_setzen(kamera, 0.0, 3.0, 8.0);
        w.schaue_auf(kamera, 0.0, 0.0, 0.0);
        let sonne = w.teil_neu(true);
        w.lage_setzen(sonne, 0.5, 1.0, 0.3);
        if let Some(k) = w.art_index("Kamera") {
            let h = w.komp_neu(k);
            let _ = w.komp_haenge(h, kamera);
        }
        if let Some(l) = w.art_index("Licht") {
            let h = w.komp_neu(l);
            let z = w.komp_ort[h as usize].zeile as usize;
            w.speicher[l].zahl_mut(crate::komponenten::licht::ART_FELD)[z] = 1.0; // sonne
            let _ = w.komp_haenge(h, sonne);
        }
        w
    }

    pub fn art_index(&self, name: &str) -> Option<usize> {
        self.arten.iter().position(|a| a.schema.name == name)
    }
    pub fn n_arten(&self) -> usize {
        self.arten.len()
    }

    // ------------------------------------------------------------------ Teile

    /// Zeile eines lebenden Teils oder Fehler.
    pub fn zeile(&self, id: u32) -> Erg<usize> {
        match self.zeile_von.get(id as usize) {
            Some(&z) if z != KEIN && id != 0 => Ok(z as usize),
            Some(_) if id != 0 => Err(fehler::teil_entfernt(id)),
            _ => Err(fehler::teil_unbekannt(id)),
        }
    }

    /// Zeile, falls das Teil lebt.
    #[inline]
    pub fn zeile_opt(&self, id: u32) -> Option<usize> {
        match self.zeile_von.get(id as usize) {
            Some(&z) if z != KEIN => Some(z as usize),
            _ => None,
        }
    }

    pub fn naechste_teil_id(&self) -> u32 {
        self.zeile_von.len() as u32
    }

    pub fn teil_neu(&mut self, drei_d: bool) -> u32 {
        let id = self.zeile_von.len() as u32;
        let t = &mut self.teile;
        let z = t.id.len();
        t.id.push(id);
        t.drei_d.push(drei_d);
        t.eltern.push(0);
        t.kinder.push(Vec::new());
        t.lage.push([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0]);
        t.ebene.push(0);
        t.sichtbar.push(true);
        t.komp.extend(core::iter::repeat_n(0, self.arten.len()));
        t.welt.push([0.0; 12]);
        t.welt_sichtbar.push(true);
        t.gueltig.push(false);
        self.zeile_von.push(z as u32);
        id
    }

    /// Markiert die Welt-Matrix eines Teils und seines ganzen Teilbaums als veraltet.
    pub fn markiere(&mut self, z: usize) {
        if !self.teile.gueltig[z] {
            return;
        }
        self.teile.gueltig[z] = false;
        let n = self.teile.kinder[z].len();
        for i in 0..n {
            let k = self.teile.kinder[z][i];
            if let Some(kz) = self.zeile_opt(k) {
                self.markiere(kz);
            }
        }
    }

    /// Bringt die Welt-Matrix einer Zeile (und ihrer Vorfahren) auf den neuesten Stand.
    pub fn aktualisiere(&mut self, z: usize) {
        if self.teile.gueltig[z] {
            return;
        }
        let e = self.teile.eltern[z];
        let (pm, ps) = match self.zeile_opt(e).filter(|_| e != 0) {
            Some(pz) => {
                self.aktualisiere(pz);
                (Some(self.teile.welt[pz]), self.teile.welt_sichtbar[pz])
            }
            None => (None, true),
        };
        let l = self.teile.lage[z];
        let m = if self.teile.drei_d[z] { lokal_3d(&l) } else { lokal_2d(&l) };
        let w = match pm {
            None => m,
            Some(p) => {
                if self.teile.drei_d[z] {
                    mal_3d(&p, &m)
                } else {
                    mal_2d(&p, &m)
                }
            }
        };
        self.teile.welt[z] = w;
        self.teile.welt_sichtbar[z] = ps && self.teile.sichtbar[z];
        self.teile.gueltig[z] = true;
    }

    pub fn aktualisiere_alle(&mut self) {
        for z in 0..self.teile.id.len() {
            if !self.teile.gueltig[z] {
                self.aktualisiere(z);
            }
        }
    }

    pub fn lage_setzen(&mut self, id: u32, x: f64, y: f64, z: f64) {
        if let Some(r) = self.zeile_opt(id) {
            let l = &mut self.teile.lage[r];
            l[0] = x;
            l[1] = y;
            l[2] = z;
            self.markiere(r);
        }
    }

    /// Dreht ein 3D-Teil so, dass seine −z-Achse (Blickrichtung) auf den Punkt zeigt (rollen = 0).
    /// Bezug ist die Weltlage des Teils; bei Eltern wird die Richtung nicht in deren Raum umgerechnet.
    pub fn schaue_auf(&mut self, id: u32, x: f64, y: f64, z: f64) {
        let Some(r) = self.zeile_opt(id) else { return };
        self.aktualisiere(r);
        let w = self.teile.welt[r];
        let (dx, dy, dz) = (x - w[3], y - w[7], z - w[11]);
        let l = libm::sqrt(dx * dx + dy * dy + dz * dz);
        if !(l > 1e-12) {
            return;
        }
        let (dx, dy, dz) = (dx / l, dy / l, dz / l);
        let mut s = dy;
        if s > 1.0 {
            s = 1.0;
        }
        if s < -1.0 {
            s = -1.0;
        }
        let neigung = libm::asin(s) / GRAD;
        let drehung = if dx == 0.0 && dz == 0.0 { self.teile.lage[r][lage::DREHUNG] } else { libm::atan2(-dx, -dz) / GRAD };
        let lg = &mut self.teile.lage[r];
        lg[lage::DREHUNG] = drehung;
        lg[lage::NEIGUNG] = neigung;
        lg[lage::ROLLEN] = 0.0;
        self.markiere(r);
    }

    /// Ist `vielleicht` ein Nachfahre von `id` (oder `id` selbst)?
    pub fn ist_nachfahre(&self, vielleicht: u32, id: u32) -> bool {
        let mut t = vielleicht;
        let mut schritte = 0usize;
        while t != 0 {
            if t == id {
                return true;
            }
            match self.zeile_opt(t) {
                Some(z) => t = self.teile.eltern[z],
                None => return false,
            }
            schritte += 1;
            if schritte > self.teile.id.len() + 1 {
                return false;
            }
        }
        false
    }

    pub fn haenge(&mut self, id: u32, an: u32) -> Erg<()> {
        let z = self.zeile(id)?;
        if an != 0 {
            let za = self.zeile(an)?;
            if self.teile.drei_d[z] != self.teile.drei_d[za] {
                return Err(fehler::haenge_raum(self.teile.drei_d[z]));
            }
            if self.ist_nachfahre(an, id) {
                return Err(fehler::haenge_zyklus(id));
            }
        }
        let alt = self.teile.eltern[z];
        if alt == an {
            return Ok(());
        }
        if let Some(az) = self.zeile_opt(alt).filter(|_| alt != 0) {
            self.teile.kinder[az].retain(|k| *k != id);
        }
        if an != 0 {
            let za = self.zeile_opt(an).unwrap_or(0);
            self.teile.kinder[za].push(id);
        }
        self.teile.eltern[z] = an;
        self.markiere(z);
        Ok(())
    }

    /// Entfernt ein Teil samt Kindern und Komponenten.
    pub fn entferne(&mut self, id: u32) -> Erg<()> {
        let z = self.zeile(id)?;
        let e = self.teile.eltern[z];
        if let Some(ez) = self.zeile_opt(e).filter(|_| e != 0) {
            self.teile.kinder[ez].retain(|k| *k != id);
        }
        self.entferne_rek(id);
        Ok(())
    }

    fn entferne_rek(&mut self, id: u32) {
        let Some(z) = self.zeile_opt(id) else { return };
        let kinder = core::mem::take(&mut self.teile.kinder[z]);
        for k in kinder {
            self.entferne_rek(k);
        }
        // Komponenten zerstören
        let z = self.zeile_opt(id).unwrap_or(z);
        let n = self.arten.len();
        for a in 0..n {
            let h = self.teile.komp[z * n + a];
            if h != 0 {
                self.zerstoere_komp(h, id);
            }
        }
        // Zeile entfernen (swap_remove; die nachrückende Zeile umtragen)
        let z = self.zeile_opt(id).unwrap_or(z);
        let t = &mut self.teile;
        let letzte = t.id.len() - 1;
        t.id.swap_remove(z);
        t.drei_d.swap_remove(z);
        t.eltern.swap_remove(z);
        t.kinder.swap_remove(z);
        t.lage.swap_remove(z);
        t.ebene.swap_remove(z);
        t.sichtbar.swap_remove(z);
        t.welt.swap_remove(z);
        t.welt_sichtbar.swap_remove(z);
        t.gueltig.swap_remove(z);
        if z != letzte {
            for a in 0..n {
                t.komp[z * n + a] = t.komp[letzte * n + a];
            }
            let verschoben = t.id[z];
            self.zeile_von[verschoben as usize] = z as u32;
        }
        self.teile.komp.truncate(letzte * n);
        self.zeile_von[id as usize] = KEIN;
    }

    /// Kopie eines Teils samt Komponenten und Kindern; die Kopie hängt am selben Eltern-Teil.
    pub fn kopie(&mut self, id: u32) -> Erg<u32> {
        let z = self.zeile(id)?;
        let e = self.teile.eltern[z];
        let neu = self.kopie_rek(id);
        if e != 0 {
            self.haenge(neu, e)?;
        }
        Ok(neu)
    }

    fn kopie_rek(&mut self, id: u32) -> u32 {
        let z = self.zeile_opt(id).expect("lebt");
        let neu = self.teil_neu(self.teile.drei_d[z]);
        let nz = self.zeile_opt(neu).expect("neu");
        self.teile.lage[nz] = self.teile.lage[z];
        self.teile.ebene[nz] = self.teile.ebene[z];
        self.teile.sichtbar[nz] = self.teile.sichtbar[z];
        let n = self.arten.len();
        for a in 0..n {
            let h = self.teile.komp[z * n + a];
            if h != 0 {
                let ort = self.komp_ort[h as usize];
                let kh = self.komp_ort.len() as u32;
                let kz = self.speicher[a].zeile_kopie(ort.zeile as usize, kh);
                self.komp_ort.push(KompOrt { art: a as u16 + 1, zeile: kz as u32, weg_teil: 0 });
                self.speicher[a].teil[kz] = neu;
                self.teile.komp[nz * n + a] = kh;
            }
        }
        let kinder = self.teile.kinder[z].clone();
        for k in kinder {
            let kk = self.kopie_rek(k);
            let nz = self.zeile_opt(neu).expect("neu");
            let kz = self.zeile_opt(kk).expect("kk");
            self.teile.eltern[kz] = neu;
            self.teile.kinder[nz].push(kk);
        }
        neu
    }

    // ------------------------------------------------------------------ Komponenten

    /// Neue (lose) Komponente mit Standardwerten.
    pub fn komp_neu(&mut self, art: usize) -> u32 {
        let h = self.komp_ort.len() as u32;
        let z = self.speicher[art].zeile_neu(&self.arten[art].schema, h);
        self.komp_ort.push(KompOrt { art: art as u16 + 1, zeile: z as u32, weg_teil: 0 });
        h
    }

    /// (Art-Index, Zeile) einer lebenden Komponente.
    pub fn komp(&self, h: u32) -> Erg<(usize, usize)> {
        match self.komp_ort.get(h as usize) {
            Some(o) if h != 0 && o.art != 0 => Ok((o.art as usize - 1, o.zeile as usize)),
            Some(o) if h != 0 && o.weg_teil != 0 => Err(fehler::teil_entfernt(o.weg_teil)),
            _ => Err(fehler::komp_unbekannt(h)),
        }
    }

    fn zerstoere_komp(&mut self, h: u32, teil: u32) {
        let Ok((a, z)) = self.komp(h) else { return };
        if let Some(verschoben) = self.speicher[a].zeile_weg(z) {
            self.komp_ort[verschoben as usize].zeile = z as u32;
        }
        self.komp_ort[h as usize] = KompOrt { art: 0, zeile: 0, weg_teil: teil };
    }

    pub fn komp_haenge(&mut self, h: u32, teil: u32) -> Erg<()> {
        let (a, z) = self.komp(h)?;
        let schema = &self.arten[a].schema;
        let tz = self.zeile(teil)?;
        let schon = self.speicher[a].teil[z];
        if schon != 0 {
            return Err(fehler::komp_haengt(schema.name, schon));
        }
        let drei_d = self.teile.drei_d[tz];
        if !schema.raum.passt(drei_d) {
            return Err(fehler::komp_raum(schema.name, !drei_d));
        }
        let n = self.arten.len();
        if self.teile.komp[tz * n + a] != 0 {
            return Err(fehler::komp_doppelt(teil, schema.name));
        }
        for b in schema.braucht {
            let hat = self.art_index(b).map(|bi| self.teile.komp[tz * n + bi] != 0).unwrap_or(false);
            if !hat {
                return Err(fehler::komp_braucht(schema.name, b));
            }
        }
        self.teile.komp[tz * n + a] = h;
        self.speicher[a].teil[z] = teil;
        Ok(())
    }

    /// Löst eine Komponente von ihrem Teil (sie lebt lose weiter und behält ihre Werte).
    pub fn komp_loese(&mut self, h: u32) -> Erg<()> {
        let (a, z) = self.komp(h)?;
        let teil = self.speicher[a].teil[z];
        if teil == 0 {
            return Ok(());
        }
        let tz = self.zeile(teil)?;
        let n = self.arten.len();
        let name = self.arten[a].schema.name;
        for (bi, b) in self.arten.iter().enumerate() {
            if self.teile.komp[tz * n + bi] != 0 && b.schema.braucht.contains(&name) {
                return Err(fehler::komp_gebraucht(name, b.schema.name));
            }
        }
        self.teile.komp[tz * n + a] = 0;
        self.speicher[a].teil[z] = 0;
        Ok(())
    }

    /// Handle der Komponente einer Art an einem Teil (0 = keine).
    #[inline]
    pub fn komp_von_zeile(&self, tz: usize, art: usize) -> u32 {
        self.teile.komp[tz * self.arten.len() + art]
    }

    /// Zeile der Komponente einer Art an einem Teil.
    #[inline]
    pub fn komp_zeile(&self, tz: usize, art: usize) -> Option<usize> {
        let h = self.komp_von_zeile(tz, art);
        if h == 0 {
            None
        } else {
            Some(self.komp_ort[h as usize].zeile as usize)
        }
    }

    // ------------------------------------------------------------------ Takt und Hüllen

    /// Läuft alle Systeme in Registry-Reihenfolge (dt = 1/60).
    pub fn takt(&mut self) {
        for a in 0..self.arten.len() {
            if let Some(f) = self.arten[a].takt {
                let mut s = core::mem::take(&mut self.speicher[a]);
                f(self, &mut s);
                self.speicher[a] = s;
            }
        }
        self.takte += 1;
    }

    /// Hülle eines Teils (erste Komponente mit Hülle in Registry-Reihenfolge).
    pub fn huelle(&mut self, id: u32) -> Option<Huelle> {
        let z = self.zeile_opt(id)?;
        self.aktualisiere(z);
        if !self.teile.welt_sichtbar[z] {
            return None;
        }
        for a in 0..self.arten.len() {
            if let (Some(f), Some(kz)) = (self.arten[a].huelle, self.komp_zeile(z, a)) {
                if let Some(h) = f(self, &self.speicher[a], kz, z) {
                    return Some(h);
                }
            }
        }
        None
    }
}

/// Lokale 2D-Matrix: T · R(drehung, im Uhrzeigersinn bei y nach unten) · S.
pub fn lokal_2d(l: &[f64; 9]) -> [f64; 12] {
    let (s, c) = rot2(l[lage::DREHUNG]);
    let (gx, gy) = (l[lage::GX], l[lage::GY]);
    [c * gx, s * gx, -s * gy, c * gy, l[0], l[1], 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
}

pub fn mal_2d(p: &[f64; 12], m: &[f64; 12]) -> [f64; 12] {
    [
        p[0] * m[0] + p[2] * m[1],
        p[1] * m[0] + p[3] * m[1],
        p[0] * m[2] + p[2] * m[3],
        p[1] * m[2] + p[3] * m[3],
        p[0] * m[4] + p[2] * m[5] + p[4],
        p[1] * m[4] + p[3] * m[5] + p[5],
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
    ]
}

/// Lokale 3D-Matrix (3×4 zeilenweise): T · Ry(drehung) · Rx(neigung) · Rz(rollen) · S.
pub fn lokal_3d(l: &[f64; 9]) -> [f64; 12] {
    let (sy, cy) = rot2(l[lage::DREHUNG]);
    let (sx, cx) = rot2(l[lage::NEIGUNG]);
    let (sz, cz) = rot2(l[lage::ROLLEN]);
    let (gx, gy, gz) = (l[lage::GX], l[lage::GY], l[lage::GZ]);
    let r00 = cy * cz + sy * sx * sz;
    let r01 = sy * sx * cz - cy * sz;
    let r02 = sy * cx;
    let r10 = cx * sz;
    let r11 = cx * cz;
    let r12 = -sx;
    let r20 = cy * sx * sz - sy * cz;
    let r21 = sy * sz + cy * sx * cz;
    let r22 = cy * cx;
    [
        r00 * gx, r01 * gy, r02 * gz, l[0], //
        r10 * gx, r11 * gy, r12 * gz, l[1], //
        r20 * gx, r21 * gy, r22 * gz, l[2],
    ]
}

pub fn mal_3d(p: &[f64; 12], m: &[f64; 12]) -> [f64; 12] {
    let mut r = [0.0; 12];
    for i in 0..3 {
        for j in 0..4 {
            let mut v = p[i * 4] * m[j] + p[i * 4 + 1] * m[4 + j] + p[i * 4 + 2] * m[8 + j];
            if j == 3 {
                v += p[i * 4 + 3];
            }
            r[i * 4 + j] = v;
        }
    }
    r
}

/// Punkt mit einer 3D-Matrix transformieren.
#[inline]
pub fn punkt_3d(m: &[f64; 12], p: [f64; 3]) -> [f64; 3] {
    [
        m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
        m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
        m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
    ]
}

/// Achsenparallele Hülle eines lokalen Quaders (min/max) unter einer 3D-Matrix.
pub fn kasten_3d(m: &[f64; 12], mi: [f64; 3], ma: [f64; 3]) -> ([f64; 3], [f64; 3]) {
    let mut a = [0.0; 3];
    let mut b = [0.0; 3];
    for i in 0..3 {
        let mut lo = m[i * 4 + 3];
        let mut hi = lo;
        for j in 0..3 {
            let e = m[i * 4 + j] * mi[j];
            let f = m[i * 4 + j] * ma[j];
            if e < f {
                lo += e;
                hi += f;
            } else {
                lo += f;
                hi += e;
            }
        }
        a[i] = lo;
        b[i] = hi;
    }
    (a, b)
}
