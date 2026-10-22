//! Herd-Kern: liest Herd-Nachrichten (HERD.md §7), hält Ressourcen und macht aus jedem Bild eine **Zeichenliste**
//! (Format: `herd/README.md`). `no_std` + `libm`, nativ und als `kern.wasm` bitgleich.

#![cfg_attr(not(test), no_std)]

extern crate alloc;

pub mod flach;
pub mod formen;
pub mod kodierer;
pub mod lesen;
pub mod liste;
pub mod mathe;
pub mod schrift;
pub mod shader;
pub mod szene;
#[doc(hidden)]
pub mod demo;

use alloc::collections::BTreeMap;
use alloc::string::String;
use alloc::vec::Vec;

use formen::Netz;
use lesen::{lies_nachricht, Befehl, Fehler, Nachricht};
use liste::*;
use schrift::Schrift;

/// Ein Bildchen als Textur (RGBA8).
#[derive(Clone, Debug)]
pub struct Textur {
    pub version: u32,
    pub breite: u32,
    pub hoehe: u32,
    pub rgba: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Fenster {
    pub breite: u16,
    pub hoehe: u16,
    pub titel: String,
}

/// Standardgröße des Spielfelds, solange kein `fenster` kam.
pub const STANDARD_FELD: (u16, u16) = (640, 360);

static WEISS_TEXEL: [u8; 4] = [255, 255, 255, 255];

pub struct Kern {
    netze: BTreeMap<u32, Netz>,
    texturen: BTreeMap<u32, Textur>,
    fenster: Option<Fenster>,
    offen: bool,
    bild: Option<(u32, Vec<Befehl>)>,
    zaehler: u32,
    schrift: Option<Schrift>,
    liste: Vec<u8>,
}

impl Default for Kern {
    fn default() -> Self {
        Self::neu()
    }
}

fn ausrichten(b: &mut Vec<u8>) {
    while b.len() % 16 != 0 {
        b.push(0);
    }
}

impl Kern {
    pub fn neu() -> Kern {
        Kern {
            netze: BTreeMap::new(),
            texturen: BTreeMap::new(),
            fenster: None,
            offen: false,
            bild: None,
            zaehler: 1,
            schrift: Schrift::eingebettet(),
            liste: Vec::new(),
        }
    }

    /// Verarbeitet eine Nachricht. Ok(art) mit der Nachrichtenart 1 … 5; bei Fehler bleibt der Zustand unverändert.
    pub fn nachricht(&mut self, b: &[u8]) -> Result<u8, Fehler> {
        let n = lies_nachricht(b)?;
        Ok(match n {
            Nachricht::Fenster { breite, hoehe, titel } => {
                self.fenster = Some(Fenster { breite, hoehe, titel });
                self.offen = true;
                1
            }
            Nachricht::Bild { nummer, befehle } => {
                self.bild = Some((nummer, befehle));
                2
            }
            Nachricht::Form(f) => {
                if f.id == 0 {
                    return Err(Fehler::Ungueltig);
                }
                let mut netz = formen::netz_aus(&f);
                self.zaehler = self.zaehler.wrapping_add(1);
                netz.version = self.zaehler;
                self.netze.insert(f.id, netz);
                3
            }
            Nachricht::Bildchen { id, breite, hoehe, rgba } => {
                if id == 0 || id == textur::SCHRIFT {
                    return Err(Fehler::Ungueltig);
                }
                self.zaehler = self.zaehler.wrapping_add(1);
                self.texturen
                    .insert(id, Textur { version: self.zaehler, breite: breite as u32, hoehe: hoehe as u32, rgba });
                4
            }
            Nachricht::Schliesse => {
                self.offen = false;
                5
            }
        })
    }

    pub fn fenster(&self) -> Option<&Fenster> {
        self.fenster.as_ref()
    }
    /// `fenster` kam und danach kein `schliesse`.
    pub fn offen(&self) -> bool {
        self.offen
    }
    pub fn hat_bild(&self) -> bool {
        self.bild.is_some()
    }

    /// Bereitet das letzte Bild für ein Ziel von `breite × hoehe` Gerätepixeln vor (Spielfeld seitentreu eingepasst).
    pub fn bereite(&mut self, breite: u32, hoehe: u32) -> &[u8] {
        let zb = breite.clamp(1, 16384);
        let zh = hoehe.clamp(1, 16384);
        let (fb, fh) = match &self.fenster {
            Some(f) if f.breite > 0 && f.hoehe > 0 => (f.breite as u32, f.hoehe as u32),
            _ => (STANDARD_FELD.0 as u32, STANDARD_FELD.1 as u32),
        };
        // seitentreu einpassen
        let sk = mathe::min(zb as f32 / fb as f32, zh as f32 / fh as f32);
        let vb = (mathe::runde(fb as f32 * sk) as u32).clamp(1, zb);
        let vh = (mathe::runde(fh as f32 * sk) as u32).clamp(1, zh);
        let vx = (zb - vb) / 2;
        let vy = (zh - vh) / 2;
        let px = vb as f32 / fb as f32;

        let leer: Vec<Befehl> = Vec::new();
        let (nummer, befehle) = match &self.bild {
            Some((n, b)) => (*n, b),
            None => (0, &leer),
        };

        let mut hg: Option<[u8; 4]> = None;
        let mut flach = flach::Flach::neu(fb as f32, fh as f32, px);
        let mut drei = szene::Sammlung::default();
        for b in befehle.iter() {
            if drei.nimm(b) {
                continue;
            }
            match b {
                Befehl::Hintergrund(c) => hg = Some(*c),
                Befehl::Rechteck { x, y, b, h, farbe, rand, rundung } => {
                    flach.rechteck(*x, *y, *b, *h, *farbe, *rand, *rundung)
                }
                Befehl::Kreis { x, y, r, farbe, rand } => flach.kreis(*x, *y, *r, *farbe, *rand),
                Befehl::Linie { x1, y1, x2, y2, dicke, farbe } => flach.linie(*x1, *y1, *x2, *y2, *dicke, *farbe),
                Befehl::Vieleck { punkte, farbe, rand } => flach.vieleck(punkte, *farbe, *rand),
                Befehl::Text { x, y, groesse, farbe, ausrichtung, text } => {
                    if let Some(s) = &self.schrift {
                        flach.text(s, text, *x, *y, *groesse, *farbe, *ausrichtung)
                    }
                }
                Befehl::Bild { id, x, y, groesse, farbe } => {
                    if let Some(t) = self.texturen.get(id) {
                        flach.bild(*id, t.breite, t.hoehe, *x, *y, *groesse, *farbe)
                    }
                }
                Befehl::Merke => flach.merke(),
                Befehl::Zurueck => flach.zurueck(),
                Befehl::Schiebe(dx, dy) => flach.schiebe(*dx, *dy),
                Befehl::Drehe(g) => flach.drehe(*g),
                Befehl::Skaliere(sx, sy) => flach.skaliere(*sx, *sy),
                _ => {}
            }
        }
        flach.fertig();

        let texturen = &self.texturen;
        let drei_erg = if drei.vorhanden {
            Some(szene::baue(&drei, &self.netze, |id| texturen.contains_key(&id), fb as f32 / fh as f32, hg))
        } else {
            None
        };

        // ---- Liste schreiben ----
        let klar = hg.unwrap_or(szene::MOZZARELLA);
        let mut flags = 0;
        let mut schatten_groesse = 0;
        if let Some(e) = &drei_erg {
            flags |= flag::DREI_D;
            if e.schatten {
                flags |= flag::SCHATTEN;
                schatten_groesse = szene::SCHATTEN_GROESSE;
            }
        }
        let l = &mut self.liste;
        l.clear();
        l.u32(MAGIE);
        l.u32(VERSION);
        l.u32(nummer);
        l.u32(zb);
        l.u32(zh);
        l.u32(vx);
        l.u32(vy);
        l.u32(vb);
        l.u32(vh);
        for k in 0..4 {
            l.f32(klar[k] as f32 / 255.0);
        }
        l.u32(flags);
        l.u32(schatten_groesse);
        l.u32(0);
        let tab = l.len();
        debug_assert_eq!(tab, 64);
        l.resize(KOPF_BYTES, 0);

        let mut abschnitte = [(0u32, 0u32); abschnitt::ANZAHL];
        let mut setze = |l: &mut Vec<u8>, a: usize, daten: &[u8]| {
            ausrichten(l);
            abschnitte[a] = (l.len() as u32, daten.len() as u32);
            l.extend_from_slice(daten);
        };
        let mut zuege: Vec<Zug> = Vec::new();
        if let Some(e) = &drei_erg {
            setze(l, abschnitt::SZENE, &e.szene);
            setze(l, abschnitt::INSTANZEN, &e.instanzen);
            zuege.extend_from_slice(&e.zuege);
        }
        setze(l, abschnitt::ECKEN2D, &flach.ecken);
        setze(l, abschnitt::INDIZES2D, &flach.indizes);
        zuege.extend_from_slice(&flach.zuege);
        let mut zb_: Vec<u8> = Vec::with_capacity(zuege.len() * ZUG_BYTES);
        for z in &zuege {
            for v in [z.durchgang, z.netz, z.textur, z.erster_index, z.index_anzahl, z.erste_instanz, z.instanz_anzahl, z.seiten] {
                zb_.u32(v);
            }
        }
        setze(l, abschnitt::ZUEGE, &zb_);
        let mut nb: Vec<u8> = Vec::with_capacity(self.netze.len() * NETZ_BYTES);
        for (id, n) in &self.netze {
            for v in [*id, n.version, n.ecken_anzahl, n.index_anzahl] {
                nb.u32(v);
            }
        }
        setze(l, abschnitt::NETZE, &nb);
        let mut tb: Vec<u8> = Vec::new();
        for v in [textur::WEISS, 1, 1, 1, textur::RGBA8, textur::NAECHSTER] {
            tb.u32(v);
        }
        for (id, t) in &self.texturen {
            for v in [*id, t.version, t.breite, t.hoehe, textur::RGBA8, textur::NAECHSTER] {
                tb.u32(v);
            }
        }
        if let Some(s) = &self.schrift {
            for v in [textur::SCHRIFT, 1, s.breite, s.hoehe, textur::R8, textur::LINEAR] {
                tb.u32(v);
            }
        }
        setze(l, abschnitt::TEXTUREN, &tb);
        ausrichten(l);
        for (a, (o, n)) in abschnitte.iter().enumerate() {
            let i = 64 + a * 8;
            l[i..i + 4].copy_from_slice(&o.to_le_bytes());
            l[i + 4..i + 8].copy_from_slice(&n.to_le_bytes());
        }
        &self.liste
    }

    /// Die zuletzt vorbereitete Zeichenliste.
    pub fn liste(&self) -> &[u8] {
        &self.liste
    }

    /// Netzdaten (Ecken, Indizes) zu einer ID.
    pub fn netz(&self, id: u32) -> Option<(&[u8], &[u8])> {
        self.netze.get(&id).map(|n| (&n.ecken[..], &n.indizes[..]))
    }

    /// Texturdaten (RGBA8 bzw. R8 beim Schriftatlas) zu einer ID.
    pub fn textur(&self, id: u32) -> Option<&[u8]> {
        if id == textur::WEISS {
            return Some(&WEISS_TEXEL);
        }
        if id == textur::SCHRIFT {
            return self.schrift.as_ref().map(|s| s.pixel);
        }
        self.texturen.get(&id).map(|t| &t.rgba[..])
    }

    /// FNV-1a 64 über die Zeichenliste und alle darin aufgeführten Ressourcendaten (in Tabellenreihenfolge).
    pub fn fnv(&self) -> u64 {
        let mut f = Fnv::neu();
        f.dazu(&self.liste);
        if let Some(a) = Ansicht::neu(&self.liste) {
            for n in a.netze() {
                if let Some((e, i)) = self.netz(n.id) {
                    f.dazu(e);
                    f.dazu(i);
                }
            }
            for t in a.texturen() {
                if let Some(d) = self.textur(t.id) {
                    f.dazu(d);
                }
            }
        }
        f.0
    }
}

#[cfg(test)]
mod tests;
