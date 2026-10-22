//! Nachrichten nach HERD.md §7 lesen. Robust: jede Länge wird vor dem Allokieren gegen die Restlänge geprüft,
//! kaputte oder abgeschnittene Nachrichten liefern einen Fehler, nie eine Panik.

use alloc::string::String;
use alloc::vec::Vec;

use crate::mathe::fin;

/// Fehlerarten (als negative Statuscodes nach außen, siehe README).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Fehler {
    /// Nachricht endet mitten in einem Feld.
    Abgeschnitten = -1,
    /// Unbekannte Nachrichtenart.
    UnbekannteArt = -2,
    /// Unbekannter Befehl (op) in `bild`.
    UnbekannterBefehl = -3,
    /// Ungültiger Inhalt (Index außerhalb, Größe, UTF-8, Grenzen).
    Ungueltig = -4,
    /// Bytes nach dem Ende der Nachricht.
    Ueberhang = -5,
    /// Leere Nachricht.
    Leer = -6,
}

pub type Erg<T> = Result<T, Fehler>;

pub struct Leser<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> Leser<'a> {
    pub fn neu(b: &'a [u8]) -> Self {
        Leser { b, i: 0 }
    }
    pub fn rest(&self) -> usize {
        self.b.len() - self.i
    }
    pub fn ende(&self) -> Erg<()> {
        if self.rest() == 0 {
            Ok(())
        } else {
            Err(Fehler::Ueberhang)
        }
    }
    fn nimm(&mut self, n: usize) -> Erg<&'a [u8]> {
        if self.rest() < n {
            return Err(Fehler::Abgeschnitten);
        }
        let s = &self.b[self.i..self.i + n];
        self.i += n;
        Ok(s)
    }
    pub fn u8(&mut self) -> Erg<u8> {
        Ok(self.nimm(1)?[0])
    }
    pub fn u16(&mut self) -> Erg<u16> {
        let s = self.nimm(2)?;
        Ok(u16::from_le_bytes([s[0], s[1]]))
    }
    pub fn u32(&mut self) -> Erg<u32> {
        let s = self.nimm(4)?;
        Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
    }
    /// f32; nicht endlich → 0 (wie der Sender).
    pub fn f32(&mut self) -> Erg<f32> {
        let s = self.nimm(4)?;
        Ok(fin(f32::from_le_bytes([s[0], s[1], s[2], s[3]])))
    }
    pub fn farbe(&mut self) -> Erg<[u8; 4]> {
        let s = self.nimm(4)?;
        Ok([s[0], s[1], s[2], s[3]])
    }
    pub fn text(&mut self) -> Erg<String> {
        let n = self.u32()? as usize;
        if n > self.rest() {
            return Err(Fehler::Abgeschnitten);
        }
        let s = self.nimm(n)?;
        match core::str::from_utf8(s) {
            Ok(t) => Ok(String::from(t)),
            Err(_) => Err(Fehler::Ungueltig),
        }
    }
    /// Liest eine Anzahl, deren Elemente je mindestens `bytes_je` Bytes brauchen; prüft gegen die Restlänge.
    pub fn anzahl(&mut self, bytes_je: usize) -> Erg<usize> {
        let n = self.u32()? as usize;
        if n.checked_mul(bytes_je).map(|g| g > self.rest()).unwrap_or(true) {
            return Err(Fehler::Abgeschnitten);
        }
        Ok(n)
    }
    pub fn bytes(&mut self, n: usize) -> Erg<&'a [u8]> {
        self.nimm(n)
    }
}

/// Ein Zeichenbefehl aus einer `bild`-Nachricht.
#[derive(Clone, Debug, PartialEq)]
pub enum Befehl {
    Hintergrund([u8; 4]),
    Rechteck { x: f32, y: f32, b: f32, h: f32, farbe: [u8; 4], rand: f32, rundung: f32 },
    Kreis { x: f32, y: f32, r: f32, farbe: [u8; 4], rand: f32 },
    Linie { x1: f32, y1: f32, x2: f32, y2: f32, dicke: f32, farbe: [u8; 4] },
    Vieleck { punkte: Vec<[f32; 2]>, farbe: [u8; 4], rand: f32 },
    Text { x: f32, y: f32, groesse: f32, farbe: [u8; 4], ausrichtung: u8, text: String },
    Bild { id: u32, x: f32, y: f32, groesse: f32, farbe: [u8; 4] },
    Merke,
    Zurueck,
    Schiebe(f32, f32),
    Drehe(f32),
    Skaliere(f32, f32),
    Kamera { x: f32, y: f32, z: f32, zx: f32, zy: f32, zz: f32, sicht: f32 },
    Himmel([u8; 4], [u8; 4]),
    Sonne { x: f32, y: f32, z: f32, farbe: [u8; 4], staerke: f32, schatten: bool },
    Licht { x: f32, y: f32, z: f32, farbe: [u8; 4], reichweite: f32 },
    Umgebung([u8; 4], f32),
    Nebel([u8; 4], f32, f32),
    Zeichne(Zeichne),
}

#[derive(Clone, Debug, PartialEq)]
pub struct Zeichne {
    pub form: u32,
    pub pos: [f32; 3],
    pub groesse: [f32; 3],
    pub drehung: f32,
    pub neigung: f32,
    pub rollen: f32,
    pub farbe: [u8; 4],
    pub glanz: f32,
    pub leuchten: f32,
    pub bildchen: u32,
}

/// Höchstzahl Befehle je Bild (SPEC §18.4).
pub const MAX_BEFEHLE: usize = 100_000;

pub fn lies_befehl(l: &mut Leser) -> Erg<Befehl> {
    let op = l.u8()?;
    Ok(match op {
        0x01 => Befehl::Hintergrund(l.farbe()?),
        0x02 => Befehl::Rechteck {
            x: l.f32()?,
            y: l.f32()?,
            b: l.f32()?,
            h: l.f32()?,
            farbe: l.farbe()?,
            rand: l.f32()?,
            rundung: l.f32()?,
        },
        0x03 => Befehl::Kreis { x: l.f32()?, y: l.f32()?, r: l.f32()?, farbe: l.farbe()?, rand: l.f32()? },
        0x04 => Befehl::Linie { x1: l.f32()?, y1: l.f32()?, x2: l.f32()?, y2: l.f32()?, dicke: l.f32()?, farbe: l.farbe()? },
        0x05 => {
            let n = l.anzahl(8)?;
            let mut punkte = Vec::with_capacity(n);
            for _ in 0..n {
                punkte.push([l.f32()?, l.f32()?]);
            }
            Befehl::Vieleck { punkte, farbe: l.farbe()?, rand: l.f32()? }
        }
        0x06 => {
            let x = l.f32()?;
            let y = l.f32()?;
            let groesse = l.f32()?;
            let farbe = l.farbe()?;
            let ausrichtung = l.u8()?;
            if ausrichtung > 2 {
                return Err(Fehler::Ungueltig);
            }
            Befehl::Text { x, y, groesse, farbe, ausrichtung, text: l.text()? }
        }
        0x07 => Befehl::Bild { id: l.u32()?, x: l.f32()?, y: l.f32()?, groesse: l.f32()?, farbe: l.farbe()? },
        0x08 => Befehl::Merke,
        0x09 => Befehl::Zurueck,
        0x0A => Befehl::Schiebe(l.f32()?, l.f32()?),
        0x0B => Befehl::Drehe(l.f32()?),
        0x0C => Befehl::Skaliere(l.f32()?, l.f32()?),
        0x20 => Befehl::Kamera { x: l.f32()?, y: l.f32()?, z: l.f32()?, zx: l.f32()?, zy: l.f32()?, zz: l.f32()?, sicht: l.f32()? },
        0x21 => Befehl::Himmel(l.farbe()?, l.farbe()?),
        0x22 => Befehl::Sonne { x: l.f32()?, y: l.f32()?, z: l.f32()?, farbe: l.farbe()?, staerke: l.f32()?, schatten: l.u8()? != 0 },
        0x23 => Befehl::Licht { x: l.f32()?, y: l.f32()?, z: l.f32()?, farbe: l.farbe()?, reichweite: l.f32()? },
        0x24 => Befehl::Umgebung(l.farbe()?, l.f32()?),
        0x25 => Befehl::Nebel(l.farbe()?, l.f32()?, l.f32()?),
        0x26 => Befehl::Zeichne(Zeichne {
            form: l.u32()?,
            pos: [l.f32()?, l.f32()?, l.f32()?],
            groesse: [l.f32()?, l.f32()?, l.f32()?],
            drehung: l.f32()?,
            neigung: l.f32()?,
            rollen: l.f32()?,
            farbe: l.farbe()?,
            glanz: l.f32()?,
            leuchten: l.f32()?,
            bildchen: l.u32()?,
        }),
        _ => return Err(Fehler::UnbekannterBefehl),
    })
}

/// Gelesene Nachricht.
#[derive(Clone, Debug, PartialEq)]
pub enum Nachricht {
    Fenster { breite: u16, hoehe: u16, titel: String },
    Bild { nummer: u32, befehle: Vec<Befehl> },
    Form(FormDaten),
    Bildchen { id: u32, breite: u16, hoehe: u16, rgba: Vec<u8> },
    Schliesse,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FormDaten {
    pub id: u32,
    pub art: u8,
    pub teile: u32,
    pub dicke: f32,
    pub glatt: bool,
    pub punkte: Vec<f32>,
    pub dreiecke: Vec<u32>,
}

/// Höchstzahl Punkte einer eigenen Form (SPEC §18.4).
pub const MAX_PUNKTE: usize = 65_536;
/// Größte Kantenlänge eines Bildchens, die der Kern annimmt (SPEC: 256; großzügig für spätere Versionen).
pub const MAX_BILDCHEN: u16 = 4096;

pub fn lies_nachricht(b: &[u8]) -> Erg<Nachricht> {
    if b.is_empty() {
        return Err(Fehler::Leer);
    }
    let mut l = Leser::neu(b);
    let art = l.u8()?;
    let n = match art {
        1 => {
            let breite = l.u16()?;
            let hoehe = l.u16()?;
            let titel = l.text()?;
            Nachricht::Fenster { breite, hoehe, titel }
        }
        2 => {
            let nummer = l.u32()?;
            let anzahl = l.anzahl(1)?;
            if anzahl > MAX_BEFEHLE {
                return Err(Fehler::Ungueltig);
            }
            let mut befehle = Vec::with_capacity(anzahl);
            for _ in 0..anzahl {
                befehle.push(lies_befehl(&mut l)?);
            }
            Nachricht::Bild { nummer, befehle }
        }
        3 => {
            let id = l.u32()?;
            let art = l.u8()?;
            let teile = l.u32()?;
            let dicke = l.f32()?;
            let glatt = l.u8()? != 0;
            if art > 6 {
                return Err(Fehler::Ungueltig);
            }
            let mut punkte = Vec::new();
            let mut dreiecke = Vec::new();
            if art == 0 {
                let n = l.anzahl(12)?;
                if !(3..=MAX_PUNKTE).contains(&n) {
                    return Err(Fehler::Ungueltig);
                }
                punkte.reserve_exact(n * 3);
                for _ in 0..n * 3 {
                    punkte.push(l.f32()?);
                }
                let m = l.anzahl(4)?;
                if m < 3 || m % 3 != 0 {
                    return Err(Fehler::Ungueltig);
                }
                dreiecke.reserve_exact(m);
                for _ in 0..m {
                    let i = l.u32()?;
                    if i as usize >= n {
                        return Err(Fehler::Ungueltig);
                    }
                    dreiecke.push(i);
                }
            }
            Nachricht::Form(FormDaten { id, art, teile, dicke, glatt, punkte, dreiecke })
        }
        4 => {
            let id = l.u32()?;
            let breite = l.u16()?;
            let hoehe = l.u16()?;
            if breite == 0 || hoehe == 0 || breite > MAX_BILDCHEN || hoehe > MAX_BILDCHEN {
                return Err(Fehler::Ungueltig);
            }
            let n = breite as usize * hoehe as usize * 4;
            let rgba = l.bytes(n)?.to_vec();
            Nachricht::Bildchen { id, breite, hoehe, rgba }
        }
        5 => Nachricht::Schliesse,
        _ => return Err(Fehler::UnbekannteArt),
    };
    l.ende()?;
    Ok(n)
}
