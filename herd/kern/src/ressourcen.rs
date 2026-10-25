//! Ressourcen (SPEC §18.5): Formen → Netze, Bildchen → RGBA in einem Atlas (Seiten 2048 × 2048, Regal-Packer).
//! IDs ab 1, gemeinsam für Formen und Bildchen, nie wiederverwendet.

use alloc::vec::Vec;

use crate::formen::Netz;

/// Kantenlänge einer Atlas-Seite in Pixeln.
pub const SEITE: u32 = 2048;
/// Größtes Bildchen (Pixel je Kante).
pub const MAX_BILDCHEN: u32 = 256;

#[derive(Clone, Debug)]
pub struct Bildchen {
    pub breite: u32,
    pub hoehe: u32,
    pub rgba: Vec<u8>,
    pub seite: u32,
    pub x: u32,
    pub y: u32,
    /// Hat durchsichtige oder halbdurchsichtige Pixel.
    pub durchsichtig: bool,
    /// Eigene Textur aus einem Teigling (`bildchen_teigling`, PROJEKTE PD1): nicht im Atlas, `seite` = `TEXTUR_MARKE | id`,
    /// `x = y = 0`, `rgba` = Stufe 0. `None` = Atlas-Bildchen.
    pub textur: Option<Textur>,
}

/// Mip-Kette einer eigenen Textur (ab Stufe 1; Stufe 0 steht in `Bildchen::rgba`).
#[derive(Clone, Debug)]
pub struct Textur {
    /// Pixelformat aus dem Teigling (0 = RGBA8)
    pub format: u8,
    pub weitere: Vec<Vec<u8>>,
}

/// Markiert in `Bildchen::seite` eine eigene Textur (Bits 0–23 = Textur-ID = Ressourcen-ID). Die Komponenten reichen `seite`
/// unverändert weiter; das Bildpaket macht daraus `flach_art::TEXTURBILD` (2D) bzw. `INST3D.textur` Bit 17 (3D).
pub const TEXTUR_MARKE: u32 = 1 << 31;

#[derive(Clone, Debug)]
pub enum Ressource {
    Form(Netz),
    Bildchen(Bildchen),
}

#[derive(Clone, Copy, Debug)]
struct Regal {
    seite: u32,
    y: u32,
    h: u32,
    x: u32,
}

#[derive(Clone, Debug, Default)]
pub struct Ressourcen {
    pub liste: Vec<Ressource>,
    regale: Vec<Regal>,
    /// nächste freie y-Zeile je Seite
    seiten_y: Vec<u32>,
    /// laufender Hash über alle Ressourcen-Definitionen (für den Szenen-Hash)
    pub hash: crate::hash::Fnv,
    /// Hüllen-Bäume der Netze für die 3D-Kollision (H-K17), nach ID, beim ersten Kontakt gebaut – nicht im Hash
    pub baeume: crate::kollision3d::Baeume,
    /// Modelle (H-K16): eigene IDs 1 … (getrennt von Formen und Bildchen; ihre Netze und Bilder stehen in `liste`)
    pub modelle: Vec<crate::modell::Modell>,
    /// Texturen aus Modellen: (SHA-256 der Bildquelle, Breite, Höhe) → Bildchen-ID – gleiche Bilder mehrerer Modelle einmal
    pub modell_bilder: Vec<(([u8; 32], u32, u32), u32)>,
}

impl Ressourcen {
    pub fn get(&self, id: u32) -> Option<&Ressource> {
        if id == 0 {
            None
        } else {
            self.liste.get(id as usize - 1)
        }
    }
    pub fn netz(&self, id: u32) -> Option<&Netz> {
        match self.get(id) {
            Some(Ressource::Form(n)) => Some(n),
            _ => None,
        }
    }
    pub fn bildchen(&self, id: u32) -> Option<&Bildchen> {
        match self.get(id) {
            Some(Ressource::Bildchen(b)) => Some(b),
            _ => None,
        }
    }
    pub fn seiten(&self) -> u32 {
        self.seiten_y.len() as u32
    }

    pub fn form(&mut self, n: Netz) -> u32 {
        self.hash.u8(1);
        self.hash.bytes(&n.ecken);
        self.hash.bytes(&n.indizes);
        self.liste.push(Ressource::Form(n));
        self.liste.len() as u32
    }

    /// Platz im Atlas suchen (Regale; 1 Pixel Abstand).
    fn platz(&mut self, b: u32, h: u32) -> (u32, u32, u32) {
        let (pb, ph) = (b + 1, h + 1);
        for r in self.regale.iter_mut() {
            if r.h >= ph && r.h <= ph + ph / 2 + 2 && r.x + pb <= SEITE {
                let x = r.x;
                r.x += pb;
                return (r.seite, x, r.y);
            }
        }
        let mut s = self.seiten_y.len() as u32;
        if s == 0 || self.seiten_y[s as usize - 1] + ph > SEITE {
            self.seiten_y.push(1);
            s += 1;
        }
        let seite = s - 1;
        let y = self.seiten_y[seite as usize];
        self.seiten_y[seite as usize] = y + ph;
        self.regale.push(Regal { seite, y, h: ph, x: 1 + pb });
        (seite, 1, y)
    }

    pub fn bildchen_neu(&mut self, breite: u32, hoehe: u32, rgba: Vec<u8>) -> u32 {
        let (seite, x, y) = self.platz(breite, hoehe);
        let durchsichtig = rgba.chunks_exact(4).any(|p| p[3] != 255);
        self.hash.u8(2);
        self.hash.u32(breite);
        self.hash.u32(hoehe);
        self.hash.bytes(&rgba);
        self.liste.push(Ressource::Bildchen(Bildchen { breite, hoehe, rgba, seite, x, y, durchsichtig, textur: None }));
        self.liste.len() as u32
    }

    /// Bildchen aus einem geprüften Teigling: eigene Textur mit Mip-Kette (nicht im Atlas). Der Hash deckt alle Stufen ab.
    pub fn teigling_neu(&mut self, t: crate::teigling::Geprueft) -> u32 {
        let id = self.liste.len() as u32 + 1;
        self.hash.u8(3);
        self.hash.u32(t.breite);
        self.hash.u32(t.hoehe);
        self.hash.u8(t.format);
        self.hash.u32(t.stufen.len() as u32);
        for s in &t.stufen {
            self.hash.bytes(s);
        }
        let mut stufen = t.stufen.into_iter();
        let rgba = stufen.next().unwrap_or_default();
        let durchsichtig = t.flags & crate::teigling::FLAG_DURCHSICHTIG != 0;
        let textur = Some(Textur { format: t.format, weitere: stufen.collect() });
        self.liste.push(Ressource::Bildchen(Bildchen { breite: t.breite, hoehe: t.hoehe, rgba, seite: TEXTUR_MARKE | id, x: 0, y: 0, durchsichtig, textur }));
        id
    }
}
