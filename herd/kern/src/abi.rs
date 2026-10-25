//! Das Herd-ABI als Rust-API (`Kern`). Jede Methode entspricht genau einem Export von `kern.wasm` (gleicher Name);
//! Texte/Listen sind hier Slices, im Wasm (Zeiger, Länge) in den Speicher des Kerns (`puffer`). Der native Host ruft
//! dieselben Methoden direkt aus seinen wasmi-Hostfunktionen.
//!
//! Fehlerprotokoll: i32-Rückgaben ≥ 0 = Erfolg, < 0 = −Fehlerart; f64-Rückgaben NaN = möglicher Fehler (dann
//! `fehler_neu()` = 1). Art/Code/Text des letzten Fehlers: `fehler_art`, `fehler_code`, `fehler_text`.

use alloc::string::String;
use alloc::vec::Vec;

use crate::farbe;
use crate::fehler::{self, Erg, Fehler};
use crate::formen::{self, FormDaten};
use crate::hash::Fnv;
use crate::komponenten::{trifft, ARTEN};
use crate::paket::{self, Bildbau, Gesendet};
use crate::ressourcen::{Ressource, MAX_BILDCHEN};
use crate::schema::{Spalte, Typ, FELDTYPEN, MAX_LISTE};
use crate::welt::{lage, Welt};
use crate::zahl::zahl_text;

/// Lage-Felder für `teil_setze`/`teil_hole` (Nummern im ABI).
pub mod teilfeld {
    pub const X: i32 = 1;
    pub const Y: i32 = 2;
    pub const Z: i32 = 3;
    pub const DREHUNG: i32 = 4;
    pub const NEIGUNG: i32 = 5;
    pub const ROLLEN: i32 = 6;
    pub const GROESSE_X: i32 = 7;
    pub const GROESSE_Y: i32 = 8;
    pub const GROESSE_Z: i32 = 9;
    pub const EBENE: i32 = 10;
    pub const SICHTBAR: i32 = 11;
    /// nur lesen: 2 oder 3
    pub const RAUM: i32 = 12;
    /// nur lesen: Eltern-ID (0 = keine)
    pub const ELTERN: i32 = 13;
    /// nur lesen: 1 = entfernt (wirft nie)
    pub const ENTFERNT: i32 = 14;
    /// nur lesen: Weltlage
    pub const WELT_X: i32 = 15;
    pub const WELT_Y: i32 = 16;
    pub const WELT_Z: i32 = 17;
    /// nur lesen: Anzahl Kinder
    pub const KINDER: i32 = 18;
    /// nur lesen: 1 = ruht (selbst oder geerbt: `Vorlage`, ausgeschaltete `Kulisse`); H-K13: ruhende Teile bekommen keine
    /// Kniff-Rückrufe
    pub const RUHT: i32 = 19;
}

/// Teil-Methoden der Sprache (SPEC §18.4) – kein Komponentenname darf kleingeschrieben einer davon sein. `kniffe` (H-K13) lebt
/// nur in den Laufzeiten (der Kern kennt keine Kniffe), steht aber hier, damit keine Komponente `Kniffe` heißen kann.
pub const TEIL_METHODEN: &[&str] = &[
    "x", "y", "z", "setzeLage", "verschiebe", "drehung", "setzeDrehung", "neigung", "setzeNeigung", "rollen", "setzeRollen",
    "schaueAuf", "groesse", "groesseX", "groesseY", "groesseZ", "setzeGroesse", "ebene", "setzeEbene", "sichtbar", "haenge",
    "eltern", "kinder", "entferne", "entfernt", "kopie", "trifft", "mit", "ohne", "raum", "id", "kniffe", "finde",
];

/// Der Kern: höchstens eine Welt (ein Herd pro Programm), Fehlerzustand, letztes Bildpaket.
#[derive(Default)]
pub struct Kern {
    pub welt: Option<Welt>,
    fehler: Option<Fehler>,
    fehler_neu: bool,
    paket: Vec<u8>,
    bau: Bildbau,
    gesendet: Gesendet,
}

fn ganz(x: f64) -> bool {
    x.is_finite() && libm::floor(x) == x
}

fn utf8(b: &[u8]) -> Erg<&str> {
    core::str::from_utf8(b).map_err(|_| fehler::puffer("kein UTF-8"))
}

fn bereich_ok(min: Option<f64>, max: Option<f64>, w: f64) -> bool {
    if let Some(a) = min {
        if !(w >= a) {
            return false;
        }
    }
    if let Some(b) = max {
        if !(w <= b) {
            return false;
        }
    }
    true
}

/// Darstellung einer Ressource in Fehlertexten: `Form(3)` bzw. `Bildchen(16×16)`.
fn res_text(w: &Welt, id: u32) -> String {
    match w.ressourcen.get(id) {
        Some(Ressource::Form(_)) => alloc::format!("Form({})", id),
        Some(Ressource::Bildchen(b)) => alloc::format!("Bildchen({}×{})", b.breite, b.hoehe),
        None => alloc::format!("{}", id),
    }
}

impl Kern {
    pub fn neu() -> Kern {
        Kern::default()
    }

    fn fehler_setzen(&mut self, f: Fehler) {
        self.fehler = Some(f);
        self.fehler_neu = true;
    }
    fn ri(&mut self, e: Erg<i32>) -> i32 {
        match e {
            Ok(v) => {
                self.fehler_neu = false;
                v
            }
            Err(f) => {
                let a = f.art;
                self.fehler_setzen(f);
                -a
            }
        }
    }
    fn rf(&mut self, e: Erg<f64>) -> f64 {
        match e {
            Ok(v) => {
                self.fehler_neu = false;
                v
            }
            Err(f) => {
                self.fehler_setzen(f);
                f64::NAN
            }
        }
    }
    /// Welt für einen **schreibenden** Aufruf: zählt [`Welt::stand`] hoch (H-K20 – berechnete Abfragen gelten bis zur nächsten
    /// Änderung). Im Zweifel diesen nehmen: ein unnötiges Hochzählen kostet nur eine neue Abfrage.
    fn w(&mut self) -> Erg<&mut Welt> {
        let w = self.welt.as_mut().ok_or_else(fehler::keine_welt)?;
        w.stand += 1;
        Ok(w)
    }
    /// Welt für einen **lesenden** Aufruf (ändert nichts am Zustand, nur Caches wie Welt-Matrizen): `stand` bleibt.
    fn wl(&mut self) -> Erg<&mut Welt> {
        self.welt.as_mut().ok_or_else(fehler::keine_welt)
    }

    // ================================================================ Fehler

    /// Art des letzten Fehlers (1 TypAnanas, 2 LaufzeitAnanas, 3 intern; 0 = noch keiner).
    pub fn fehler_art(&self) -> i32 {
        self.fehler.as_ref().map(|f| f.art).unwrap_or(0)
    }
    pub fn fehler_code(&self) -> i32 {
        self.fehler.as_ref().map(|f| f.code).unwrap_or(0)
    }
    /// Text des letzten Fehlers (ohne `LaufzeitAnanas: `-Vorsilbe).
    pub fn fehler_text(&self) -> &str {
        self.fehler.as_ref().map(|f| f.text.as_str()).unwrap_or("")
    }
    /// 1, wenn der **letzte** Aufruf mit Fehlerprotokoll fehlschlug (jeder solche Aufruf setzt die Markierung neu: 1 bei
    /// Fehler, sonst 0); liest und setzt zurück. So bleibt ein echtes NaN aus `hole_zahl` eindeutig, auch wenn die Anbindung
    /// nach einem früheren i32-Fehler `fehler_neu` nicht abgefragt hat.
    pub fn fehler_neu(&mut self) -> i32 {
        let n = self.fehler_neu;
        self.fehler_neu = false;
        n as i32
    }
    /// TypAnanas für ein Feld mit einem Wert, den nur die Anbindung kennt (`darstellung` = Textform des Werts).
    /// Liefert immer −1 (TypAnanas) bzw. einen anderen Fehler bei ungültiger Typ-/Feldnummer; an einem Lesefeld −2 mit
    /// `<Name>.<feld> kann man nur lesen.` (der Lesefeld-Fehler geht in allen Motoren dem Typfehler vor).
    pub fn melde_typfehler(&mut self, typ: i32, feld: i32, darstellung: &[u8]) -> i32 {
        let e = (|| {
            let a = art_idx(typ)?;
            let s = &ARTEN[a].schema;
            let f = feld_idx(s, feld)?;
            if s.felder[f].lesen {
                return Err(fehler::feld_lesen(s.name, s.felder[f].name));
            }
            let d = String::from_utf8_lossy(darstellung);
            Err::<i32, _>(fehler::feld_typ(s.name, s.felder[f].name, s.felder[f].typ.erwartet(), &d))
        })();
        self.ri(e)
    }

    // ================================================================ Welt

    /// Legt die Welt an (Teil 1 = Kamera, Teil 2 = Sonne). Breite/Höhe ganzzahlig 64 … 4096.
    pub fn welt_neu(&mut self, breite: f64, hoehe: f64, titel: &[u8]) -> i32 {
        let e = (|| {
            if self.welt.is_some() {
                return Err(fehler::welt_doppelt());
            }
            for (n, v) in [("breite", breite), ("hoehe", hoehe)] {
                if !ganz(v) {
                    return Err(fehler::herd_ganz(n, v));
                }
                if !(64.0..=4096.0).contains(&v) {
                    return Err(fehler::herd_bereich(n, v));
                }
            }
            let t = String::from(utf8(titel)?);
            self.welt = Some(Welt::neu(breite as u32, hoehe as u32, t, ARTEN));
            self.gesendet = Gesendet::default();
            Ok(0)
        })();
        self.ri(e)
    }
    pub fn welt_titel(&mut self, titel: &[u8]) -> i32 {
        let e = (|| {
            let t = String::from(utf8(titel)?);
            self.w()?.titel = t;
            Ok(0)
        })();
        self.ri(e)
    }
    pub fn welt_hintergrund(&mut self, f: &[u8]) -> i32 {
        let e = (|| {
            let c = farbe_aus(f)?;
            self.w()?.hintergrund = c;
            Ok(0)
        })();
        self.ri(e)
    }
    /// Himmelsverlauf; `unten` leer = wie `oben`.
    pub fn welt_himmel(&mut self, oben: &[u8], unten: &[u8]) -> i32 {
        let e = (|| {
            let o = farbe_aus(oben)?;
            let u = if unten.is_empty() { o } else { farbe_aus(unten)? };
            self.w()?.himmel = Some((o, u));
            Ok(0)
        })();
        self.ri(e)
    }
    pub fn welt_umgebung(&mut self, f: &[u8], staerke: f64) -> i32 {
        let e = (|| {
            let c = farbe_aus(f)?;
            if !(staerke >= 0.0) {
                return Err(fehler::lage_bereich("umgebung(staerke: …)", 0.0, 10.0, staerke));
            }
            self.w()?.umgebung = Some((c, staerke));
            Ok(0)
        })();
        self.ri(e)
    }
    /// Nebel von … bis (Abstand zur Kamera); `von ≥ bis` schaltet ab.
    pub fn welt_nebel(&mut self, f: &[u8], von: f64, bis: f64) -> i32 {
        let e = (|| {
            let c = farbe_aus(f)?;
            self.w()?.nebel = if von < bis { Some((c, von, bis)) } else { None };
            Ok(0)
        })();
        self.ri(e)
    }
    /// Welt-Angaben: 1 Breite, 2 Höhe, 3 Takte, 4 nächste Teil-ID, 5 Anzahl lebender Teile, 6 Anzahl Ressourcen.
    pub fn welt_hole(&mut self, was: i32) -> f64 {
        let e = (|| {
            let w = self.wl()?;
            Ok(match was {
                1 => w.breite as f64,
                2 => w.hoehe as f64,
                3 => w.takte as f64,
                4 => w.naechste_teil_id() as f64,
                5 => w.teile.id.len() as f64,
                6 => w.ressourcen.liste.len() as f64,
                _ => return Err(fehler::lage_feld(was)),
            })
        })();
        self.rf(e)
    }
    pub fn welt_titel_text(&self) -> &str {
        self.welt.as_ref().map(|w| w.titel.as_str()).unwrap_or("")
    }

    // ================================================================ Teile

    /// Neues leeres Teil, `raum` 2 oder 3 → ID.
    pub fn teil_neu(&mut self, raum: i32) -> i32 {
        let e = (|| {
            if raum != 2 && raum != 3 {
                return Err(fehler::raum(raum));
            }
            Ok(self.w()?.teil_neu(raum == 3) as i32)
        })();
        self.ri(e)
    }
    pub fn teil_entferne(&mut self, teil: i32) -> i32 {
        let e = (|| {
            self.w()?.entferne(teil as u32)?;
            Ok(0)
        })();
        self.ri(e)
    }
    pub fn teil_kopie(&mut self, teil: i32) -> i32 {
        let e = (|| Ok(self.w()?.kopie(teil as u32)? as i32))();
        self.ri(e)
    }
    /// Hängt `teil` an `an` (0 = löst). Lokale Lage bleibt.
    pub fn teil_haenge(&mut self, teil: i32, an: i32) -> i32 {
        let e = (|| {
            self.w()?.haenge(teil as u32, an as u32)?;
            Ok(0)
        })();
        self.ri(e)
    }
    /// Kinder-IDs; Rückgabe = Anzahl. Ist sie größer als `aus.len()`, wird nichts geschrieben (K-013).
    pub fn teil_kinder(&mut self, teil: i32, aus: &mut [u32]) -> i32 {
        let e = (|| {
            let w = self.wl()?;
            let z = w.zeile(teil as u32)?;
            let k = &w.teile.kinder[z];
            if k.len() <= aus.len() {
                aus[..k.len()].copy_from_slice(k);
            }
            Ok(k.len() as i32)
        })();
        self.ri(e)
    }

    pub fn teil_setze(&mut self, teil: i32, feld: i32, wert: f64) -> i32 {
        let e = (|| {
            let w = self.w()?;
            let id = teil as u32;
            let z = w.zeile(id)?;
            let drei = w.teile.drei_d[z];
            let i = match feld {
                teilfeld::X => lage::X,
                teilfeld::Y => lage::Y,
                teilfeld::Z | teilfeld::NEIGUNG | teilfeld::ROLLEN | teilfeld::GROESSE_Z if !drei => {
                    let n = ["z", "", "neigung", "rollen", "", "", "groesseZ"][(feld - 3) as usize];
                    return Err(fehler::nur_3d(id, n));
                }
                teilfeld::Z => lage::Z,
                teilfeld::DREHUNG => lage::DREHUNG,
                teilfeld::NEIGUNG => lage::NEIGUNG,
                teilfeld::ROLLEN => lage::ROLLEN,
                teilfeld::GROESSE_X => lage::GX,
                teilfeld::GROESSE_Y => lage::GY,
                teilfeld::GROESSE_Z => lage::GZ,
                teilfeld::EBENE => {
                    if drei {
                        return Err(fehler::nur_2d(id, "ebene"));
                    }
                    if !ganz(wert) {
                        return Err(fehler::typ(fehler::code::LAGE_BEREICH, alloc::format!("ebene braucht eine Ganzzahl, nicht {}.", zahl_text(wert))));
                    }
                    if !(-2147483648.0..=2147483647.0).contains(&wert) {
                        return Err(fehler::lage_bereich("ebene", -2147483648.0, 2147483647.0, wert));
                    }
                    w.teile.ebene[z] = wert as i32;
                    return Ok(0);
                }
                teilfeld::SICHTBAR => {
                    w.teile.sichtbar[z] = wert != 0.0;
                    w.markiere(z);
                    return Ok(0);
                }
                _ => return Err(fehler::lage_feld(feld)),
            };
            w.teile.lage[z][i] = wert;
            w.markiere(z);
            Ok(0)
        })();
        self.ri(e)
    }

    pub fn teil_hole(&mut self, teil: i32, feld: i32) -> f64 {
        let e = (|| {
            let w = self.wl()?;
            let id = teil as u32;
            if feld == teilfeld::ENTFERNT {
                return match w.zeile(id) {
                    Ok(_) => Ok(0.0),
                    Err(f) if f.code == fehler::code::TEIL_ENTFERNT => Ok(1.0),
                    Err(f) => Err(f),
                };
            }
            let z = w.zeile(id)?;
            let l = &w.teile.lage[z];
            Ok(match feld {
                1..=9 => l[(feld - 1) as usize],
                teilfeld::EBENE => w.teile.ebene[z] as f64,
                teilfeld::SICHTBAR => w.teile.sichtbar[z] as i32 as f64,
                teilfeld::RAUM => {
                    if w.teile.drei_d[z] {
                        3.0
                    } else {
                        2.0
                    }
                }
                teilfeld::ELTERN => w.teile.eltern[z] as f64,
                teilfeld::WELT_X | teilfeld::WELT_Y | teilfeld::WELT_Z => {
                    w.aktualisiere(z);
                    let m = &w.teile.welt[z];
                    let k = (feld - teilfeld::WELT_X) as usize;
                    if w.teile.drei_d[z] {
                        m[k * 4 + 3]
                    } else if k < 2 {
                        m[4 + k]
                    } else {
                        0.0
                    }
                }
                teilfeld::KINDER => w.teile.kinder[z].len() as f64,
                teilfeld::RUHT => w.teile.welt_ruht[z] as i32 as f64,
                _ => return Err(fehler::lage_feld(feld)),
            })
        })();
        self.rf(e)
    }

    /// `setzeLage(x, y, z)`; bei 2D-Teilen muss z = 0 sein.
    pub fn teil_lage(&mut self, teil: i32, x: f64, y: f64, z: f64) -> i32 {
        let e = (|| {
            let w = self.w()?;
            let r = w.zeile(teil as u32)?;
            if !w.teile.drei_d[r] && z != 0.0 {
                return Err(fehler::nur_3d(teil as u32, "z"));
            }
            let l = &mut w.teile.lage[r];
            l[0] = x;
            l[1] = y;
            l[2] = z;
            w.markiere(r);
            Ok(0)
        })();
        self.ri(e)
    }
    pub fn teil_verschiebe(&mut self, teil: i32, dx: f64, dy: f64, dz: f64) -> i32 {
        let e = (|| {
            let w = self.w()?;
            let r = w.zeile(teil as u32)?;
            if !w.teile.drei_d[r] && dz != 0.0 {
                return Err(fehler::nur_3d(teil as u32, "z"));
            }
            let l = &mut w.teile.lage[r];
            l[0] += dx;
            l[1] += dy;
            l[2] += dz;
            w.markiere(r);
            Ok(0)
        })();
        self.ri(e)
    }
    /// `setzeGroesse(sx, sy, sz)` (bei 2D wird sz nicht verwendet).
    pub fn teil_groesse(&mut self, teil: i32, sx: f64, sy: f64, sz: f64) -> i32 {
        let e = (|| {
            let w = self.w()?;
            let r = w.zeile(teil as u32)?;
            let drei = w.teile.drei_d[r];
            let l = &mut w.teile.lage[r];
            l[lage::GX] = sx;
            l[lage::GY] = sy;
            if drei {
                l[lage::GZ] = sz;
            }
            w.markiere(r);
            Ok(0)
        })();
        self.ri(e)
    }
    pub fn teil_schaue(&mut self, teil: i32, x: f64, y: f64, z: f64) -> i32 {
        let e = (|| {
            let w = self.w()?;
            let r = w.zeile(teil as u32)?;
            if !w.teile.drei_d[r] {
                return Err(fehler::nur_3d(teil as u32, "schaueAuf"));
            }
            w.schaue_auf(teil as u32, x, y, z);
            Ok(0)
        })();
        self.ri(e)
    }
    /// 1 = Hüllen überlappen, 0 = nicht (anderer Raum, unsichtbar, ohne Hülle).
    pub fn teil_trifft(&mut self, a: i32, b: i32) -> i32 {
        let e = (|| {
            let w = self.wl()?;
            let za = w.zeile(a as u32)?;
            let zb = w.zeile(b as u32)?;
            if w.teile.drei_d[za] != w.teile.drei_d[zb] {
                return Ok(0);
            }
            let (Some(ha), Some(hb)) = (w.huelle(a as u32), w.huelle(b as u32)) else { return Ok(0) };
            Ok(trifft(ha, hb) as i32)
        })();
        self.ri(e)
    }

    // ================================================================ Komponenten

    /// Neue lose Komponente der Art `typ` (1 …) mit Standardwerten → Handle.
    pub fn komp_neu(&mut self, typ: i32) -> i32 {
        let e = (|| {
            let a = art_idx(typ)?;
            Ok(self.w()?.komp_neu(a) as i32)
        })();
        self.ri(e)
    }
    pub fn komp_haenge(&mut self, komp: i32, teil: i32) -> i32 {
        let e = (|| {
            self.w()?.komp_haenge(komp as u32, teil as u32)?;
            Ok(0)
        })();
        self.ri(e)
    }
    /// Löst die Komponente von ihrem Teil (`ohne`); sie bleibt lose mit ihren Werten erhalten.
    pub fn komp_loese(&mut self, komp: i32) -> i32 {
        let e = (|| {
            self.w()?.komp_loese(komp as u32)?;
            Ok(0)
        })();
        self.ri(e)
    }
    /// Handle der Komponente der Art `typ` am Teil (0 = keine).
    pub fn komp_von(&mut self, teil: i32, typ: i32) -> i32 {
        let e = (|| {
            let a = art_idx(typ)?;
            let w = self.wl()?;
            let z = w.zeile(teil as u32)?;
            Ok(w.komp_von_zeile(z, a) as i32)
        })();
        self.ri(e)
    }
    /// 1 = Typnummer, 2 = Teil (0 = lose), 3 = zerstört (1/0, wirft nie).
    pub fn komp_info(&mut self, komp: i32, was: i32) -> i32 {
        let e = (|| {
            let w = self.wl()?;
            if was == 3 {
                return match w.komp(komp as u32) {
                    Ok(_) => Ok(0),
                    Err(f) if f.code == fehler::code::TEIL_ENTFERNT => Ok(1),
                    Err(f) => Err(f),
                };
            }
            if was == 2 {
                // an einer zerstörten Komponente: 0 (an keinem Teil), wirft nicht
                if let Err(f) = w.komp(komp as u32) {
                    return if f.code == fehler::code::TEIL_ENTFERNT { Ok(0) } else { Err(f) };
                }
            }
            let (a, z) = w.komp(komp as u32)?;
            Ok(match was {
                1 => a as i32 + 1,
                2 => w.speicher[a].teil[z] as i32,
                _ => return Err(fehler::lage_feld(was)),
            })
        })();
        self.ri(e)
    }
    /// Typnummer nach Name; unbekannt → −2 mit `Eine Komponente 'X' gibt es nicht.` (Code 19).
    pub fn typ_nummer(&mut self, name: &[u8]) -> i32 {
        let e = match ARTEN.iter().position(|a| a.schema.name.as_bytes() == name) {
            Some(p) => Ok(p as i32 + 1),
            None => Err(fehler::komp_name(&String::from_utf8_lossy(name))),
        };
        self.ri(e)
    }
    /// Feldnummer nach Name; unbekannt → Fehler `<Name> hat kein Feld 'x'.`
    pub fn feld_nummer(&mut self, typ: i32, name: &[u8]) -> i32 {
        let e = (|| {
            let a = art_idx(typ)?;
            let s = &ARTEN[a].schema;
            let n = utf8(name)?;
            s.feld(n).map(|i| i as i32 + 1).ok_or_else(|| fehler::feld_unbekannt(s.name, n))
        })();
        self.ri(e)
    }

    /// Zahlartige Felder (zahl, ganz, diavolo 0/1, wahl = Index, teil/form/bildchen = ID, farbe = 0xRRGGBBAA).
    pub fn setze_zahl(&mut self, komp: i32, feld: i32, wert: f64) -> i32 {
        let e = (|| {
            let w = self.w()?;
            let (a, z) = w.komp(komp as u32)?;
            let s = &w.arten[a].schema;
            let f = feld_idx(s, feld)?;
            let fd = &s.felder[f];
            let (name, fname) = (s.name, fd.name);
            if fd.lesen {
                return Err(fehler::feld_lesen(name, fname));
            }
            let typfehler = |d: &str| Err(fehler::feld_typ(name, fname, fd.typ.erwartet(), d));
            match fd.typ {
                Typ::Zahl => {
                    if !bereich_ok(fd.min, fd.max, wert) {
                        return Err(fehler::feld_bereich(name, fname, fd.min, fd.max, wert));
                    }
                }
                Typ::Ganz => {
                    if !ganz(wert) {
                        return typfehler(&zahl_text(wert));
                    }
                    if !bereich_ok(fd.min, fd.max, wert) {
                        return Err(fehler::feld_bereich(name, fname, fd.min, fd.max, wert));
                    }
                }
                Typ::Diavolo => {
                    if wert != 0.0 && wert != 1.0 {
                        return typfehler(&zahl_text(wert));
                    }
                }
                Typ::Wahl => {
                    if !ganz(wert) || wert < 0.0 || wert >= fd.wahl.len() as f64 {
                        return typfehler(&zahl_text(wert));
                    }
                }
                Typ::Teil => {
                    if wert != 0.0 {
                        if !ganz(wert) || wert < 0.0 {
                            return typfehler(&zahl_text(wert));
                        }
                        w.zeile(wert as u32)?;
                    }
                }
                Typ::Form | Typ::Bildchen => {
                    if wert != 0.0 {
                        if !ganz(wert) || wert < 0.0 || wert > u32::MAX as f64 {
                            return typfehler(&zahl_text(wert));
                        }
                        let id = wert as u32;
                        let passt = match (w.ressourcen.get(id), fd.typ) {
                            (Some(Ressource::Form(_)), Typ::Form) | (Some(Ressource::Bildchen(_)), Typ::Bildchen) => true,
                            (None, _) => return Err(fehler::ressource(if fd.typ == Typ::Form { "Form" } else { "Bildchen" }, id)),
                            _ => false,
                        };
                        if !passt {
                            return typfehler(&res_text(w, id));
                        }
                    }
                }
                Typ::Farbe => {
                    if !ganz(wert) || !(0.0..=4294967295.0).contains(&wert) {
                        return typfehler(&zahl_text(wert));
                    }
                    if let Spalte::Farbe(v, t) = &mut w.speicher[a].spalten[f] {
                        v[z] = wert as u32;
                        t[z] = farbe::text(wert as u32);
                    }
                    return Ok(0);
                }
                _ => return typfehler(&zahl_text(wert)),
            }
            w.speicher[a].zahl_mut(f)[z] = wert;
            // Ruhe-Komponente (H-K8/H-K9, z. B. `Kulisse.aktiv`): vererbte Ruhe sofort nachführen
            if w.arten[a].ruhe.is_some() {
                if let Some(tz) = w.zeile_opt(w.speicher[a].teil[z]).filter(|_| w.speicher[a].teil[z] != 0) {
                    w.ruhe_neu(tz);
                }
            }
            Ok(0)
        })();
        self.ri(e)
    }

    pub fn hole_zahl(&mut self, komp: i32, feld: i32) -> f64 {
        let e = (|| {
            let w = self.wl()?;
            let (a, z) = w.komp(komp as u32)?;
            let art: &'static crate::komponenten::Art = w.arten[a];
            let s = &art.schema;
            let f = feld_idx(s, feld)?;
            // H-K12: beim Lesen berechnete Lesefelder (Blick.mausX/mausY)
            if let Some(l) = art.lies {
                if let Some(v) = l(w, a, z, f) {
                    return Ok(v);
                }
            }
            match &w.speicher[a].spalten[f] {
                Spalte::Zahl(v) => Ok(v[z]),
                Spalte::Farbe(v, _) => Ok(v[z] as f64),
                Spalte::Liste(v) if s.felder[f].typ == Typ::TeilListe => Ok(v[z].iter().filter(|t| w.zeile_opt(**t).is_some()).count() as f64),
                Spalte::Liste(v) => Ok(v[z].len() as f64),
                Spalte::Puffer(v) => Ok(v[z].len() as f64),
                _ => Err(fehler::intern(alloc::format!("{}.{} ist keine Zahl.", s.name, s.felder[f].name))),
            }
        })();
        self.rf(e)
    }

    /// Text-, Wahl- und Farbfelder aus Text.
    pub fn setze_text(&mut self, komp: i32, feld: i32, text: &[u8]) -> i32 {
        let e = (|| {
            let t = utf8(text)?;
            let w = self.w()?;
            let (a, z) = w.komp(komp as u32)?;
            let s = &w.arten[a].schema;
            let f = feld_idx(s, feld)?;
            let fd = &s.felder[f];
            if fd.lesen {
                return Err(fehler::feld_lesen(s.name, fd.name));
            }
            match fd.typ {
                Typ::Text => {
                    if let Spalte::Text(v) = &mut w.speicher[a].spalten[f] {
                        v[z] = String::from(t);
                    }
                }
                Typ::Wahl => {
                    let Some(i) = fd.wahl.iter().position(|x| *x == t) else {
                        return Err(fehler::feld_wahl(s.name, fd.name, t, fd.wahl));
                    };
                    w.speicher[a].zahl_mut(f)[z] = i as f64;
                }
                Typ::Farbe => {
                    let c = farbe::lies(t).ok_or_else(|| fehler::farbe(t))?;
                    if let Spalte::Farbe(v, tx) = &mut w.speicher[a].spalten[f] {
                        v[z] = c;
                        tx[z] = String::from(t);
                    }
                }
                _ => return Err(fehler::feld_typ(s.name, fd.name, fd.typ.erwartet(), t)),
            }
            Ok(0)
        })();
        self.ri(e)
    }

    /// Text eines Text-/Wahl-/Farbfelds (Farbe: wie gesetzt). Ist er länger als `aus`, wird nichts geschrieben;
    /// Rückgabe = Länge in Bytes (K-013).
    pub fn hole_text(&mut self, komp: i32, feld: i32, aus: &mut [u8]) -> i32 {
        let e = (|| {
            let w = self.wl()?;
            let (a, z) = w.komp(komp as u32)?;
            let s = &w.arten[a].schema;
            let f = feld_idx(s, feld)?;
            let fd = &s.felder[f];
            let t: &str = match &w.speicher[a].spalten[f] {
                Spalte::Text(v) => &v[z],
                Spalte::Farbe(_, v) => &v[z],
                Spalte::Zahl(v) if fd.typ == Typ::Wahl => fd.wahl.get(v[z] as usize).copied().unwrap_or(""),
                _ => return Err(fehler::intern(alloc::format!("{}.{} ist kein Text.", s.name, fd.name))),
            };
            let b = t.as_bytes();
            if b.len() <= aus.len() {
                aus[..b.len()].copy_from_slice(b);
            }
            Ok(b.len() as i32)
        })();
        self.ri(e)
    }

    /// `bildchen-liste` (Bildchen-IDs) bzw. `teil-liste` (Teil-IDs, jedes Teil muss leben) aus IDs.
    pub fn setze_liste(&mut self, komp: i32, feld: i32, ids: &[u32]) -> i32 {
        let e = (|| {
            let w = self.w()?;
            let (a, z) = w.komp(komp as u32)?;
            let s = &w.arten[a].schema;
            let f = feld_idx(s, feld)?;
            let fd = &s.felder[f];
            if fd.lesen {
                return Err(fehler::feld_lesen(s.name, fd.name));
            }
            match fd.typ {
                Typ::BildchenListe => {
                    for id in ids {
                        if w.ressourcen.bildchen(*id).is_none() {
                            let d = res_text(w, *id);
                            return Err(fehler::feld_typ(s.name, fd.name, fd.typ.erwartet(), &alloc::format!("ein Blech mit {}", d)));
                        }
                    }
                }
                Typ::TeilListe => {
                    if ids.len() > MAX_LISTE {
                        return Err(fehler::liste_laenge(s.name, fd.name, MAX_LISTE, ids.len()));
                    }
                    for id in ids {
                        w.zeile(*id)?;
                    }
                }
                _ => return Err(fehler::feld_typ(s.name, fd.name, fd.typ.erwartet(), "ein Blech")),
            }
            if let Spalte::Liste(v) = &mut w.speicher[a].spalten[f] {
                v[z] = ids.to_vec();
            }
            Ok(0)
        })();
        self.ri(e)
    }
    /// Liste lesen; Rückgabe = Anzahl, nichts geschrieben, wenn größer als `aus.len()`. `teil-liste`: entfernte Teile fallen
    /// heraus (nur in der Ausgabe – der gespeicherte Zustand und damit der Szenen-Hash ändern sich beim Lesen nicht).
    pub fn hole_liste(&mut self, komp: i32, feld: i32, aus: &mut [u32]) -> i32 {
        let e = (|| {
            let w = self.wl()?;
            let (a, z) = w.komp(komp as u32)?;
            let s = &w.arten[a].schema;
            let f = feld_idx(s, feld)?;
            match &w.speicher[a].spalten[f] {
                Spalte::Liste(v) if s.felder[f].typ == Typ::TeilListe => {
                    let l = &v[z];
                    let n = l.iter().filter(|t| w.zeile_opt(**t).is_some()).count();
                    if n <= aus.len() {
                        for (o, t) in aus.iter_mut().zip(l.iter().filter(|t| w.zeile_opt(**t).is_some())) {
                            *o = *t;
                        }
                    }
                    Ok(n as i32)
                }
                Spalte::Liste(v) => {
                    let l = &v[z];
                    if l.len() <= aus.len() {
                        aus[..l.len()].copy_from_slice(l);
                    }
                    Ok(l.len() as i32)
                }
                _ => Err(fehler::intern(alloc::format!("{}.{} ist keine Liste.", s.name, s.felder[f].name))),
            }
        })();
        self.ri(e)
    }

    /// `zahl-liste` aus Zahlen (f64; NaN erlaubt, im Hash kanonisch; `min`/`max` des Felds gelten je Eintrag).
    pub fn setze_zahlen(&mut self, komp: i32, feld: i32, zahlen: &[f64]) -> i32 {
        let e = (|| {
            let w = self.w()?;
            let (a, z) = w.komp(komp as u32)?;
            let s = &w.arten[a].schema;
            let f = feld_idx(s, feld)?;
            let fd = &s.felder[f];
            if fd.lesen {
                return Err(fehler::feld_lesen(s.name, fd.name));
            }
            if fd.typ != Typ::ZahlListe {
                return Err(fehler::feld_typ(s.name, fd.name, fd.typ.erwartet(), "ein Blech"));
            }
            if zahlen.len() > MAX_LISTE {
                return Err(fehler::liste_laenge(s.name, fd.name, MAX_LISTE, zahlen.len()));
            }
            if fd.min.is_some() || fd.max.is_some() {
                for x in zahlen {
                    if !bereich_ok(fd.min, fd.max, *x) {
                        return Err(fehler::feld_bereich(s.name, fd.name, fd.min, fd.max, *x));
                    }
                }
            }
            if let Spalte::Puffer(v) = &mut w.speicher[a].spalten[f] {
                v[z] = zahlen.to_vec();
            }
            Ok(0)
        })();
        self.ri(e)
    }
    /// `zahl-liste` lesen; Rückgabe = Anzahl, nichts geschrieben, wenn größer als `aus.len()` (K-013, kap in Elementen).
    pub fn hole_zahlen(&mut self, komp: i32, feld: i32, aus: &mut [f64]) -> i32 {
        let e = (|| {
            let w = self.wl()?;
            let (a, z) = w.komp(komp as u32)?;
            let s = &w.arten[a].schema;
            let f = feld_idx(s, feld)?;
            match &w.speicher[a].spalten[f] {
                Spalte::Puffer(v) if s.felder[f].typ == Typ::ZahlListe => {
                    let l = &v[z];
                    if l.len() <= aus.len() {
                        aus[..l.len()].copy_from_slice(l);
                    }
                    Ok(l.len() as i32)
                }
                _ => Err(fehler::intern(alloc::format!("{}.{} ist keine Zahlenliste.", s.name, s.felder[f].name))),
            }
        })();
        self.ri(e)
    }

    // ================================================================ Ressourcen

    /// Grundform: 1 Würfel, 2 Kugel, 3 Zylinder, 4 Kegel, 5 Ebene, 6 Ring. `teile` 3 … 128 (Kugel/Zylinder/Kegel/Ring),
    /// `dicke` 0.05 … 0.9 (Ring). → Ressourcen-ID.
    pub fn form_grund(&mut self, art: i32, teile: f64, dicke: f64) -> i32 {
        let e = (|| {
            if !(1..=6).contains(&art) {
                return Err(fehler::form_art(art));
            }
            if matches!(art, 2 | 3 | 4 | 6) {
                if teile.is_finite() && !ganz(teile) {
                    let name = ["", "wuerfel", "kugel", "zylinder", "kegel", "ebene", "ring"][art as usize];
                    return Err(fehler::form_teile_ganz(name, teile));
                }
                if !(ganz(teile) && (3.0..=128.0).contains(&teile)) {
                    return Err(fehler::form_teile(teile));
                }
            }
            if art == 6 && !(0.05..=0.9).contains(&dicke) {
                return Err(fehler::form_dicke(dicke));
            }
            let w = self.w()?;
            let d = FormDaten { art: art as u8, teile: if ganz(teile) { teile as u32 } else { 3 }, dicke: dicke as f32, glatt: false, punkte: Vec::new(), dreiecke: Vec::new() };
            Ok(w.ressourcen.form(formen::netz_aus(&d)) as i32)
        })();
        self.ri(e)
    }

    /// Eigene Form aus Punkten (x, y, z, …) und Dreiecken (Punkt-Nummern ab 0, gegen den Uhrzeigersinn).
    pub fn form_eigene(&mut self, punkte: &[f64], dreiecke: &[f64], glatt: i32) -> i32 {
        let e = (|| {
            let n = punkte.len() / 3;
            if punkte.len() % 3 != 0 || !(3..=65536).contains(&n) {
                return Err(fehler::form_punkte());
            }
            if dreiecke.len() % 3 != 0 || dreiecke.is_empty() {
                return Err(fehler::form_dreiecke());
            }
            let mut d = Vec::with_capacity(dreiecke.len());
            for x in dreiecke {
                if !ganz(*x) {
                    return Err(fehler::form_dreiecke());
                }
                if *x < 0.0 || *x >= n as f64 {
                    return Err(fehler::form_index(*x, n));
                }
                d.push(*x as u32);
            }
            let w = self.w()?;
            let fd = FormDaten { art: 0, teile: 3, dicke: 0.3, glatt: glatt != 0, punkte: punkte.iter().map(|x| paket::f32w(*x)).collect(), dreiecke: d };
            Ok(w.ressourcen.form(formen::netz_aus(&fd)) as i32)
        })();
        self.ri(e)
    }

    /// Bildchen aus Zeilen (je `u32 Länge` + UTF-8) und Farben (je `u32 Länge` + Zeichen, `u32 Länge` + Farbtext).
    pub fn bildchen_neu(&mut self, zeilen: &[u8], farben: &[u8]) -> i32 {
        let e = (|| {
            let z = texte(zeilen)?;
            let f = texte(farben)?;
            if z.is_empty() || f.len() % 2 != 0 {
                return Err(if z.is_empty() { fehler::bildchen_zeilen() } else { fehler::puffer("Farben paarweise") });
            }
            let mut zuordnung: Vec<(char, u32)> = Vec::new();
            for p in f.chunks_exact(2) {
                let mut cs = p[0].chars();
                let (Some(c), None) = (cs.next(), cs.next()) else { return Err(fehler::bildchen_schluessel(p[0])) };
                let farbe = farbe::lies(p[1]).ok_or_else(|| fehler::farbe(p[1]))?;
                zuordnung.retain(|(k, _)| *k != c);
                zuordnung.push((c, farbe));
            }
            let breite = z.iter().map(|t| t.chars().count()).max().unwrap_or(0) as u32;
            let hoehe = z.len() as u32;
            if breite > MAX_BILDCHEN || hoehe > MAX_BILDCHEN {
                return Err(fehler::bildchen_groesse());
            }
            let breite = if breite == 0 { 1 } else { breite };
            let mut rgba = alloc::vec![0u8; (breite * hoehe * 4) as usize];
            for (y, zeile) in z.iter().enumerate() {
                for (x, c) in zeile.chars().enumerate() {
                    let wert = if let Some((_, f)) = zuordnung.iter().find(|(k, _)| *k == c) {
                        *f
                    } else if c == '.' || c == ' ' {
                        0
                    } else if let Some(i) = farbe::BILDCHEN_ZEICHEN.iter().position(|k| *k == c) {
                        farbe::PALETTE[i].1
                    } else {
                        return Err(fehler::bildchen_zeichen(c));
                    };
                    let o = (y * breite as usize + x) * 4;
                    rgba[o..o + 4].copy_from_slice(&wert.to_be_bytes());
                }
            }
            let w = self.w()?;
            Ok(w.ressourcen.bildchen_neu(breite, hoehe, rgba) as i32)
        })();
        self.ri(e)
    }

    /// Bildchen aus RGBA8 (breite × hoehe × 4 Bytes, Zeilen von oben).
    pub fn bildchen_rgba(&mut self, breite: i32, hoehe: i32, rgba: &[u8]) -> i32 {
        let e = (|| {
            if breite < 1 || hoehe < 1 || breite as u32 > MAX_BILDCHEN || hoehe as u32 > MAX_BILDCHEN {
                return Err(fehler::bildchen_groesse());
            }
            if rgba.len() != (breite * hoehe * 4) as usize {
                return Err(fehler::puffer("RGBA-Länge"));
            }
            let w = self.w()?;
            Ok(w.ressourcen.bildchen_neu(breite as u32, hoehe as u32, rgba.to_vec()) as i32)
        })();
        self.ri(e)
    }

    /// Bildchen aus einem Teigling (PROJEKTE PD1, `Bildchen.laden`): nur Kopfprüfung, eigene Textur mit Mip-Kette.
    /// Fehler-Teigling → Code 61/62 (Text ohne Pfad, die Anbindung setzt `<pfad> ` davor).
    pub fn bildchen_teigling(&mut self, t: &[u8]) -> i32 {
        let e = (|| {
            self.w()?;
            let g = crate::teigling::pruefe(t)?;
            let w = self.w()?;
            Ok(w.ressourcen.teigling_neu(g) as i32)
        })();
        self.ri(e)
    }

    // ================================================================ Modelle (H-K16)

    /// Modell aus einem Modellteig (`Modell.laden`): volle Prüfung, Netze und Bilder als Ressourcen, ruhende Vorlage mit den
    /// geteilten Belägen → Modell-ID (eigene Zählung 1 …). Fehler-Modellteig → Code 63 … 67 mit dessen Text (ohne Pfad, die
    /// Anbindung setzt `<pfad> ` davor); ungültiger Teig → 63.
    pub fn modell_teig(&mut self, t: &[u8]) -> i32 {
        let e = (|| {
            self.w()?;
            let teig = crate::modell::pruefe(t)?;
            self.modell_anlegen(teig, t)
        })();
        self.ri(e)
    }

    fn modell_anlegen(&mut self, teig: crate::modell::Teig, bytes: &[u8]) -> Erg<i32> {
        use crate::modell::Modell;
        let w = self.w()?;
        w.ressourcen.hash.u8(4);
        w.ressourcen.hash.bytes(bytes);
        let mut netz_huellen = Vec::with_capacity(teig.netze.len());
        let mut netze = Vec::with_capacity(teig.netze.len());
        let mut netz_material = Vec::with_capacity(teig.netze.len());
        let mut netz_haut = Vec::with_capacity(teig.netze.len());
        for (n, m, h) in teig.netze {
            netz_huellen.push((n.min, n.max));
            netze.push(w.ressourcen.form(n));
            netz_material.push(m);
            netz_haut.push(h);
        }
        // Bilder: Grundfarbe, Relief, Stoff und Leuchten werden Texturen (Stoff/Leuchten seit H-K26)
        let mut gebraucht = alloc::vec![false; teig.bilder.len()];
        for m in &teig.materialien {
            for b in [m.bild, m.relief, m.stoff, m.leucht_bild].into_iter().flatten() {
                gebraucht[b as usize] = true;
            }
        }
        let mut bilder = Vec::with_capacity(teig.bilder.len());
        let mut weitere = Vec::new();
        for (i, (g, b)) in teig.bilder.into_iter().zip(teig.bild_bytes).enumerate() {
            if gebraucht[i] {
                // gleiche Bilder in mehreren Modellen (z. B. die gemeinsame colormap.png eines Kenney-Kits) nur einmal als Textur:
                // Schlüssel = SHA-256 der Quelle aus dem Teigling-Kopf + Größe
                let mut sha = [0u8; 32];
                sha.copy_from_slice(&b[20..52]);
                let schluessel = (sha, g.breite, g.hoehe);
                let id = match w.ressourcen.modell_bilder.iter().find(|x| x.0 == schluessel) {
                    Some(x) => x.1,
                    None => {
                        let id = w.ressourcen.teigling_neu(g);
                        w.ressourcen.modell_bilder.push((schluessel, id));
                        id
                    }
                };
                bilder.push(Some(id));
            } else {
                bilder.push(None);
                weitere.push((i as u32, b));
            }
        }
        let huelle = crate::modell::huelle(&teig.knoten, &teig.meshes, &netz_huellen);
        // ruhende Vorlage mit einem Belag-Teil je Material
        let (tv, tb, te) = (self.typ_nummer(b"Vorlage"), self.typ_nummer(b"Belag"), self.typ_nummer(b"Etikett"));
        let vorlage = self.teil_neu(3);
        let kv = self.komp_neu(tv);
        let fv = self.feld_nummer_s(tv, "name");
        self.setze_text(kv, fv, b"Modell");
        self.komp_haenge(kv, vorlage);
        let felder: Vec<i32> = [
            "farbe", "glanz", "leuchten", "bild", "strahlen", "relief", "kachel", "modell", "metall",
            // H-K26: Karten (Nachtragsfelder – Standardwerte ändern keinen Hash)
            "normalStaerke", "stoffKarte", "leuchtKarte", "leuchtFarbe", "schwelle", "beidseitig",
        ]
        .iter()
        .map(|n| self.feld_nummer_s(tb, n))
        .collect();
        let mut belaege = Vec::with_capacity(teig.materialien.len());
        for m in &teig.materialien {
            let t = self.teil_neu(3);
            self.teil_haenge(t, vorlage);
            let k = self.komp_neu(tb);
            let id_von = |b: Option<u32>| b.and_then(|i| bilder[i as usize]).unwrap_or(0) as f64;
            // Leucht-Bild (H-K26): Eigenleuchten = Bild · emissiveFactor (leuchtFarbe) · Stärke (strahlen), leuchten 1;
            // ohne Bild wie H-K16 (Grundfarbe · größter Anteil von emissiveFactor)
            let leucht = id_von(m.leucht_bild);
            let (leuchten, strahlen, leucht_farbe) = if leucht > 0.0 { (1.0, m.leucht_staerke, m.leucht_farbe) } else { (m.leuchten, m.strahlen, 0xFFFF_FFFF) };
            let stoff = id_von(m.stoff);
            // beidseitig nur an Karten-Belägen: ohne Karten zeichnet Herd ohnehin beide Seiten (wie seit v1)
            let karten = stoff > 0.0 || leucht > 0.0 || m.schwelle > 0.0 || m.normal_staerke != 1.0;
            let werte = [
                m.farbe as f64, m.glanz, leuchten, id_von(m.bild), strahlen, id_von(m.relief), m.kachel, 1.0, m.metall,
                m.normal_staerke, stoff, leucht, leucht_farbe as f64, m.schwelle, (karten && m.beidseitig) as u8 as f64,
            ];
            // H-K26-Felder nur abweichend vom Standard setzen (Belag ohne Karten bleibt wie in H-K16)
            const STANDARD: [f64; 6] = [1.0, 0.0, 0.0, 4294967295.0, 0.0, 0.0];
            for (i, (fe, v)) in felder.iter().zip(werte).enumerate() {
                if i < 9 || v != STANDARD[i - 9] {
                    self.setze_zahl(k, *fe, v);
                }
            }
            self.komp_haenge(k, t);
            self.etikett_neu(te, t, &m.name, 0.0);
            belaege.push(t as u32);
        }
        let w = self.w()?;
        // Netze mit Haut (H-K23b): Nachschlag Form → Modell, Netz, benutzte Gelenke (Index mit Gewicht > 0)
        let mi = w.ressourcen.modelle.len() as u32;
        for (i, h) in netz_haut.iter().enumerate() {
            if let Some(h) = h {
                let gelenke = h.chunks_exact(8).flat_map(|e| (0..4).filter(move |&k| e[4 + k] > 0).map(move |k| e[k] as u32 + 1)).max().unwrap_or(1);
                w.ressourcen.haut_netze.push(crate::ressourcen::HautNetz { form: netze[i], modell: mi, netz: i as u32, gelenke });
            }
        }
        w.ressourcen.modelle.push(Modell {
            netze,
            netz_material,
            netz_haut,
            meshes: teig.meshes,
            bilder,
            weitere_bilder: weitere,
            materialien: teig.materialien,
            knoten: teig.knoten,
            lichter: teig.lichter,
            haeute: teig.haeute,
            folgen: teig.folgen,
            vorlage: vorlage as u32,
            belaege,
            huelle,
        });
        Ok(w.ressourcen.modelle.len() as i32)
    }

    fn feld_nummer_s(&mut self, typ: i32, name: &str) -> i32 {
        self.feld_nummer(typ, name.as_bytes())
    }

    /// `Etikett` mit Name (und verborgener Knotennummer) an ein Teil hängen.
    fn etikett_neu(&mut self, te: i32, teil: i32, name: &str, knoten: f64) {
        let k = self.komp_neu(te);
        let fe = self.feld_nummer_s(te, "name");
        self.setze_text(k, fe, name.as_bytes());
        if let Some(w) = self.welt.as_mut() {
            if let Ok((a, z)) = w.komp(k as u32) {
                w.speicher[a].zahl_mut(crate::komponenten::etikett::KNOTEN)[z] = knoten;
            }
        }
        self.komp_haenge(k, teil);
    }

    fn modell_von(&mut self, id: i32) -> Erg<&crate::modell::Modell> {
        let w = self.w()?;
        if id < 1 || id as usize > w.ressourcen.modelle.len() {
            return Err(fehler::ressource("Modell", id as u32));
        }
        Ok(&w.ressourcen.modelle[id as usize - 1])
    }

    /// `herd.modell(m, x, y, z)`: neue 3D-Wurzel an (x, y, z) mit einem Teil je Knoten (Tiefensuche, Etikett mit Name und
    /// Knotennummer, Lage aus TRS/Matrix), `Koerper` je Primitive (mehrere als Kind-Teile) mit dem geteilten Belag, `Licht`
    /// aus Punkt- und Spotlichtern → Wurzel-Teil.
    pub fn modell_teil(&mut self, id: i32, x: f64, y: f64, z: f64) -> i32 {
        let e = (|| {
            let m = self.modell_von(id)?;
            let (knoten, meshes, netze, mat, belaege, lichter) =
                (m.knoten.clone(), m.meshes.clone(), m.netze.clone(), m.netz_material.clone(), m.belaege.clone(), m.lichter.clone());
            let (te, tk, tl) = (self.typ_nummer(b"Etikett"), self.typ_nummer(b"Koerper"), self.typ_nummer(b"Licht"));
            let (kf, kb) = (self.feld_nummer_s(tk, "form"), self.feld_nummer_s(tk, "belag"));
            let lf: Vec<i32> = ["art", "farbe", "staerke", "reichweite", "kegel", "kegelRand"].iter().map(|n| self.feld_nummer_s(tl, n)).collect();
            let wurzel = self.teil_neu(3);
            if wurzel < 0 {
                return Err(fehler::keine_welt());
            }
            self.teil_lage(wurzel, x, y, z);
            let mut teile: Vec<i32> = Vec::with_capacity(knoten.len());
            for (i, k) in knoten.iter().enumerate() {
                let t = self.teil_neu(3);
                self.teil_haenge(t, k.eltern.map(|e| teile[e as usize]).unwrap_or(wurzel));
                let w = self.w()?;
                let r = w.zeile(t as u32)?;
                w.teile.lage[r] = k.lage;
                w.markiere(r);
                self.etikett_neu(te, t, &k.name, (i + 1) as f64);
                if let Some(me) = k.mesh {
                    let prims = &meshes[me as usize];
                    for &ni in prims {
                        let ziel = if prims.len() == 1 {
                            t
                        } else {
                            let c = self.teil_neu(3);
                            self.teil_haenge(c, t);
                            c
                        };
                        let kk = self.komp_neu(tk);
                        self.setze_zahl(kk, kf, netze[ni as usize] as f64);
                        if let Some(mi) = mat[ni as usize] {
                            self.setze_zahl(kk, kb, belaege[mi as usize] as f64);
                        }
                        self.komp_haenge(kk, ziel);
                    }
                }
                if let Some(li) = k.licht {
                    let l = &lichter[li as usize];
                    if l.art != 2 {
                        let kl = self.komp_neu(tl);
                        for (fe, v) in lf.iter().zip([0.0, l.farbe as f64, l.staerke, l.reichweite, l.kegel, l.kegel_rand]) {
                            self.setze_zahl(kl, *fe, v);
                        }
                        self.komp_haenge(kl, t);
                    }
                }
                teile.push(t);
            }
            Ok(wurzel)
        })();
        self.ri(e)
    }

    /// Zahlen eines Modells: 1 Knoten, 2 Folgen, 3 Beläge, 4 Breite, 5 Höhe, 6 Tiefe (Hülle der Ruhelage), 7 Netze, 8 Ecken,
    /// 9 Texturen, 10 Vorlage-Teil, 100 + i = Belag-Teil i.
    pub fn modell_info(&mut self, id: i32, was: i32) -> f64 {
        let e = (|| {
            let m = self.modell_von(id)?;
            let h = m.huelle;
            let v = match was {
                1 => m.knoten.len() as f64,
                2 => m.folgen.len() as f64,
                3 => m.belaege.len() as f64,
                4 => h[3] - h[0],
                5 => h[4] - h[1],
                6 => h[5] - h[2],
                7 => m.netze.len() as f64,
                8 => {
                    let netze = m.netze.clone();
                    let w = self.w()?;
                    return Ok(netze.iter().filter_map(|&n| w.ressourcen.netz(n)).map(|n| n.ecken_anzahl as f64).sum());
                }
                9 => m.bilder.iter().flatten().count() as f64,
                10 => m.vorlage as f64,
                _ if was >= 100 && ((was - 100) as usize) < m.belaege.len() => m.belaege[(was - 100) as usize] as f64,
                _ => return Err(fehler::intern(alloc::format!("modell_info: unbekannt {}", was))),
            };
            Ok(v)
        })();
        self.rf(e)
    }

    /// Texte eines Modells: `was` 1 = Knotenname, 2 = Folgenname, 3 = Materialname; Index `i` (0 …). Rückgabe = Länge in
    /// Bytes; ist sie größer als `aus`, wird nichts geschrieben (K-013).
    pub fn modell_text(&mut self, id: i32, was: i32, i: i32, aus: &mut [u8]) -> i32 {
        let e = (|| {
            let m = self.modell_von(id)?;
            let t = match was {
                1 => m.knoten.get(i as usize).map(|k| k.name.as_str()),
                2 => m.folgen.get(i as usize).map(|f| f.name.as_str()),
                3 => m.materialien.get(i as usize).map(|f| f.name.as_str()),
                _ => None,
            }
            .ok_or_else(|| fehler::intern(alloc::format!("modell_text: {} {}", was, i)))?;
            let b = t.as_bytes();
            if b.len() <= aus.len() {
                aus[..b.len()].copy_from_slice(b);
            }
            Ok(b.len() as i32)
        })();
        self.ri(e)
    }

    /// `teil.finde(name)`: erstes Teil im Teilbaum (Wurzel eingeschlossen, Tiefensuche in Kindreihenfolge, auch ruhende und
    /// unsichtbare) mit `Etikett.name` = `name` → ID, sonst 0.
    pub fn teil_finde(&mut self, teil: i32, name: &[u8]) -> i32 {
        let e = (|| {
            let name = utf8(name)?;
            let w = self.w()?;
            w.zeile(teil as u32)?;
            let Some(a) = w.art_index("Etikett") else { return Ok(0) };
            let mut stapel = alloc::vec![teil as u32];
            while let Some(id) = stapel.pop() {
                let Some(z) = w.zeile_opt(id) else { continue };
                if let Some(kz) = w.komp_zeile(z, a) {
                    if w.speicher[a].text(crate::komponenten::etikett::NAME)[kz] == name {
                        return Ok(id as i32);
                    }
                }
                stapel.extend(w.teile.kinder[z].iter().rev());
            }
            Ok(0)
        })();
        self.ri(e)
    }

    /// 1 = Art (1 Form, 2 Bildchen), 2 = Breite, 3 = Höhe (Bildchen), 4 = Anzahl Ecken, 5 = Anzahl Dreiecke (Form).
    pub fn ressource_hole(&mut self, id: i32, was: i32) -> f64 {
        let e = (|| {
            let w = self.wl()?;
            match (w.ressourcen.get(id as u32), was) {
                (None, _) => Err(fehler::ressource("Ressource", id as u32)),
                (Some(Ressource::Form(_)), 1) => Ok(1.0),
                (Some(Ressource::Bildchen(_)), 1) => Ok(2.0),
                (Some(Ressource::Bildchen(b)), 2) => Ok(b.breite as f64),
                (Some(Ressource::Bildchen(b)), 3) => Ok(b.hoehe as f64),
                (Some(Ressource::Form(n)), 4) => Ok(n.ecken_anzahl as f64),
                (Some(Ressource::Form(n)), 5) => Ok((n.index_anzahl / 3) as f64),
                _ => Ok(0.0),
            }
        })();
        self.rf(e)
    }

    // ================================================================ Eingabe (H-K12)

    /// Eingabezustand für die folgenden Takte (vor `fn()` jedes Takts, SPEC §18.3): Maus in Spielfeld-Koordinaten, Knöpfe als
    /// Bitmaske (1 links, 2 rechts, 4 Mitte). Nicht endliche Mauswerte lassen die Maus, Knöpfe außerhalb 0 … 7 die Knöpfe
    /// unverändert (wie die Motoren ungültige Ereignisfelder ignorieren). Nicht im Szenen-Hash; wirkt nur über Lesefelder.
    pub fn eingabe(&mut self, maus_x: f64, maus_y: f64, knoepfe: i32) -> i32 {
        let e = (|| {
            let w = self.w()?;
            if maus_x.is_finite() && maus_y.is_finite() {
                w.eingabe.maus = [maus_x, maus_y];
            }
            if (0..=7).contains(&knoepfe) {
                w.eingabe.knoepfe = knoepfe as u32;
            }
            Ok(0)
        })();
        self.ri(e)
    }

    // ================================================================ Takt, Bild, Hashes

    /// Ein Takt: alle Systeme in Registry-Reihenfolge (dt = 1/60).
    pub fn takt(&mut self) -> i32 {
        let e = (|| {
            self.w()?.takt();
            Ok(0)
        })();
        self.ri(e)
    }

    /// Baut das Bildpaket; Rückgabe = Länge in Bytes. Die Bytes: `paket()`.
    pub fn bild(&mut self, bildnummer: i32) -> i32 {
        let Some(w) = self.welt.as_mut() else { return self.ri(Err(fehler::keine_welt())) };
        paket::baue(w, &mut self.bau, &mut self.gesendet, &mut self.paket, bildnummer as u32);
        self.paket.len() as i32
    }
    pub fn paket(&self) -> &[u8] {
        &self.paket
    }
    /// Nächstes Paket enthält wieder alle Ressourcen (neue Glut, Fenster neu geöffnet).
    pub fn paket_voll(&mut self) -> i32 {
        self.gesendet = Gesendet::default();
        0
    }

    /// FNV-1a 64 des letzten Bildpakets.
    pub fn hash_paket(&self) -> u64 {
        crate::hash::fnv(&self.paket)
    }

    /// FNV-1a 64 des Szenenzustands (kanonisch: Teile nach ID, Komponenten nach Registry, lose Komponenten nach Handle).
    pub fn hash_szene(&mut self) -> u64 {
        let Some(w) = self.welt.as_mut() else { return 0 };
        szenen_hash(w)
    }

    /// Schema als JSON (ohne Test-Komponenten).
    pub fn schema_json(&self) -> String {
        schema_json(false)
    }
}

fn art_idx(typ: i32) -> Erg<usize> {
    if typ >= 1 && (typ as usize) <= ARTEN.len() {
        Ok(typ as usize - 1)
    } else {
        Err(fehler::komp_typ(typ))
    }
}

fn feld_idx(s: &crate::schema::Schema, feld: i32) -> Erg<usize> {
    if feld >= 1 && (feld as usize) <= s.oeffentliche() {
        Ok(feld as usize - 1)
    } else {
        Err(fehler::feld_nummer(s.name, feld))
    }
}

fn farbe_aus(b: &[u8]) -> Erg<u32> {
    let t = utf8(b)?;
    farbe::lies(t).ok_or_else(|| fehler::farbe(t))
}

/// Liest eine Folge `u32 Länge` + UTF-8.
fn texte(b: &[u8]) -> Erg<Vec<&str>> {
    let mut v = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if i + 4 > b.len() {
            return Err(fehler::puffer("Textfolge abgeschnitten"));
        }
        let n = u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]) as usize;
        i += 4;
        let t = b.get(i..i + n).ok_or_else(|| fehler::puffer("Textfolge abgeschnitten"))?;
        v.push(utf8(t)?);
        i += n;
    }
    Ok(v)
}

/// Kanonischer Szenenzustand → FNV-1a 64.
pub fn szenen_hash(w: &mut Welt) -> u64 {
    let mut h = Fnv::default();
    h.bytes(b"HZS1");
    h.u32(w.breite);
    h.u32(w.hoehe);
    h.text(&w.titel);
    h.u32(w.hintergrund);
    match w.himmel {
        Some((o, u)) => {
            h.u8(1);
            h.u32(o);
            h.u32(u);
        }
        None => h.u8(0),
    }
    match w.umgebung {
        Some((f, s)) => {
            h.u8(1);
            h.u32(f);
            h.f64(s);
        }
        None => h.u8(0),
    }
    match w.nebel {
        Some((f, a, b)) => {
            h.u8(1);
            h.u32(f);
            h.f64(a);
            h.f64(b);
        }
        None => h.u8(0),
    }
    h.u32(w.ressourcen.liste.len() as u32);
    h.bytes(&w.ressourcen.hash.0.to_le_bytes());
    let n = w.arten.len();
    h.u32(w.zeile_von.len() as u32);
    h.u32(w.komp_ort.len() as u32);
    let schreib_komp = |h: &mut Fnv, w: &Welt, kh: u32| {
        let o = w.komp_ort[kh as usize];
        h.u32(kh);
        h.u32(o.art as u32);
        if o.art == 0 {
            h.u32(o.weg_teil);
            return;
        }
        let s = &w.speicher[o.art as usize - 1];
        let felder = w.arten[o.art as usize - 1].schema.felder;
        let z = o.zeile as usize;
        h.u32(s.teil[z]);
        for (sp, fd) in s.spalten.iter().zip(felder) {
            // Nachtragsfeld (H-K0): nur gehasht, wenn vom Standard abweichend – dann mit Marke und Feldname
            if fd.nachtrag {
                if sp.ist_standard(fd, z) {
                    continue;
                }
                h.u8(0xA5);
                h.text(fd.name);
            }
            match sp {
                Spalte::Zahl(v) => h.f64(v[z]),
                Spalte::Text(v) => h.text(&v[z]),
                Spalte::Farbe(v, t) => {
                    h.u32(v[z]);
                    h.text(&t[z]);
                }
                Spalte::Liste(v) => {
                    h.u32(v[z].len() as u32);
                    for x in &v[z] {
                        h.u32(*x);
                    }
                }
                Spalte::Puffer(v) => {
                    h.u32(v[z].len() as u32);
                    for x in &v[z] {
                        h.f64(*x);
                    }
                }
            }
        }
    };
    for id in 1..w.zeile_von.len() as u32 {
        let Some(z) = w.zeile_opt(id) else {
            h.u8(0);
            continue;
        };
        h.u8(1);
        h.u8(w.teile.drei_d[z] as u8);
        h.u32(w.teile.eltern[z]);
        h.u32(w.teile.kinder[z].len() as u32);
        for k in &w.teile.kinder[z] {
            h.u32(*k);
        }
        for x in w.teile.lage[z] {
            h.f64(x);
        }
        h.i32(w.teile.ebene[z]);
        h.u8(w.teile.sichtbar[z] as u8);
        for a in 0..n {
            let kh = w.teile.komp[z * n + a];
            if kh != 0 {
                schreib_komp(&mut h, w, kh);
            }
        }
    }
    // lose Komponenten (an keinem Teil)
    for kh in 1..w.komp_ort.len() as u32 {
        let o = w.komp_ort[kh as usize];
        if o.art != 0 && w.speicher[o.art as usize - 1].teil[o.zeile as usize] == 0 {
            schreib_komp(&mut h, w, kh);
        }
    }
    h.0
}

fn json_text(s: &mut String, t: &str) {
    s.push('"');
    for c in t.chars() {
        match c {
            '"' => s.push_str("\\\""),
            '\\' => s.push_str("\\\\"),
            '\n' => s.push_str("\\n"),
            c if (c as u32) < 0x20 => s.push_str(&alloc::format!("\\u{:04x}", c as u32)),
            c => s.push(c),
        }
    }
    s.push('"');
}

/// Schema als JSON (Format: herd/README.md „Schema“). `mit_test` nimmt Test-Komponenten (Probe) auf.
pub fn schema_json(mit_test: bool) -> String {
    let mut s = String::new();
    s.push_str("{\n  \"format\": \"herd-schema/1\",\n  \"feldtypen\": [");
    for (i, t) in FELDTYPEN.iter().enumerate() {
        if i > 0 {
            s.push_str(", ");
        }
        s.push_str(&alloc::format!("{{\"nummer\": {}, \"name\": ", t.nummer()));
        json_text(&mut s, t.name());
        s.push_str(", \"erwartet\": ");
        json_text(&mut s, t.erwartet());
        s.push('}');
    }
    s.push_str("],\n  \"komponenten\": [");
    let mut erste = true;
    for (i, a) in ARTEN.iter().enumerate() {
        if a.nur_test && !mit_test {
            continue;
        }
        if !erste {
            s.push(',');
        }
        erste = false;
        let sc = &a.schema;
        s.push_str(&alloc::format!("\n    {{\"name\": \"{}\", \"nummer\": {}, \"genus\": \"{}\", \"raum\": \"{}\", \"braucht\": [", sc.name, i + 1, sc.genus.name(), sc.raum.name()));
        for (k, b) in sc.braucht.iter().enumerate() {
            if k > 0 {
                s.push_str(", ");
            }
            json_text(&mut s, b);
        }
        s.push_str(&alloc::format!("], \"system\": {}, \"felder\": [", a.takt.is_some() || a.nachlauf.is_some()));
        for (k, f) in sc.felder.iter().take(sc.oeffentliche()).enumerate() {
            if k > 0 {
                s.push(',');
            }
            s.push_str(&alloc::format!("\n      {{\"nummer\": {}, \"name\": \"{}\", \"typ\": \"{}\", \"standard\": ", k + 1, f.name, f.typ.name()));
            match f.typ {
                Typ::Text | Typ::Farbe => json_text(&mut s, f.text),
                Typ::Wahl => json_text(&mut s, f.wahl[f.zahl as usize]),
                Typ::Diavolo => s.push_str(if f.zahl != 0.0 { "true" } else { "false" }),
                Typ::Teil | Typ::Form | Typ::Bildchen => s.push_str("null"),
                Typ::BildchenListe | Typ::TeilListe | Typ::ZahlListe => s.push_str("[]"),
                _ => s.push_str(&zahl_text(f.zahl)),
            }
            let opt = |x: Option<f64>| x.map(zahl_text).unwrap_or_else(|| String::from("null"));
            s.push_str(&alloc::format!(", \"min\": {}, \"max\": {}", opt(f.min), opt(f.max)));
            if f.typ == Typ::Wahl {
                s.push_str(", \"wahl\": [");
                for (j, x) in f.wahl.iter().enumerate() {
                    if j > 0 {
                        s.push_str(", ");
                    }
                    json_text(&mut s, x);
                }
                s.push(']');
            }
            // H-K0: nur wenn gesetzt (bestehende Felder bleiben im Schema unverändert)
            if f.lesen {
                s.push_str(", \"lesen\": true");
            }
            if f.nachtrag {
                s.push_str(", \"nachtrag\": true");
            }
            s.push('}');
        }
        s.push_str("]}");
    }
    s.push_str("\n  ],\n  \"teil_felder\": [");
    let tf = [
        "x", "y", "z", "drehung", "neigung", "rollen", "groesseX", "groesseY", "groesseZ", "ebene", "sichtbar", "raum", "eltern", "entfernt", "weltX",
        "weltY", "weltZ", "kinder", "ruht",
    ];
    for (i, n) in tf.iter().enumerate() {
        if i > 0 {
            s.push_str(", ");
        }
        s.push_str(&alloc::format!("{{\"nummer\": {}, \"name\": \"{}\"}}", i + 1, n));
    }
    s.push_str("],\n  \"teil_methoden\": [");
    for (i, m) in TEIL_METHODEN.iter().enumerate() {
        if i > 0 {
            s.push_str(", ");
        }
        json_text(&mut s, m);
    }
    s.push_str("],\n  \"palette\": [");
    for (i, (n, w)) in farbe::PALETTE.iter().enumerate() {
        if i > 0 {
            s.push_str(", ");
        }
        s.push_str(&alloc::format!("{{\"name\": \"{}\", \"hex\": \"#{:06X}\", \"zeichen\": \"{}\"}}", n, w >> 8, farbe::BILDCHEN_ZEICHEN[i]));
    }
    s.push_str("],\n  \"grundformen\": [\"wuerfel\", \"kugel\", \"zylinder\", \"kegel\", \"ebene\", \"ring\"]\n}\n");
    s
}
