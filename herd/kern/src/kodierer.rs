//! Nachrichten nach HERD.md §7 bauen – unabhängig vom Interpreter, für Tests, Demo-Szenen und Werkzeuge.

use alloc::vec::Vec;

/// Wandelt den f64-Wert wie der Interpreter in f32 (round-to-nearest, nicht endlich → 0).
fn f(x: f64) -> f32 {
    if x.is_finite() {
        x as f32
    } else {
        0.0
    }
}

/// Baut eine Nachricht.
pub struct Nachricht {
    pub b: Vec<u8>,
}

impl Nachricht {
    fn neu(art: u8) -> Self {
        Nachricht { b: alloc::vec![art] }
    }
    fn u8(&mut self, v: u8) -> &mut Self {
        self.b.push(v);
        self
    }
    fn u16(&mut self, v: u16) -> &mut Self {
        self.b.extend_from_slice(&v.to_le_bytes());
        self
    }
    fn u32(&mut self, v: u32) -> &mut Self {
        self.b.extend_from_slice(&v.to_le_bytes());
        self
    }
    fn f(&mut self, v: f64) -> &mut Self {
        self.b.extend_from_slice(&f(v).to_le_bytes());
        self
    }
    fn c(&mut self, c: [u8; 4]) -> &mut Self {
        self.b.extend_from_slice(&c);
        self
    }
    fn s(&mut self, t: &str) -> &mut Self {
        self.u32(t.len() as u32);
        self.b.extend_from_slice(t.as_bytes());
        self
    }

    pub fn fenster(breite: u16, hoehe: u16, titel: &str) -> Vec<u8> {
        let mut n = Nachricht::neu(1);
        n.u16(breite).u16(hoehe).s(titel);
        n.b
    }
    pub fn schliesse() -> Vec<u8> {
        alloc::vec![5]
    }
    /// Grundform (art 1 … 6).
    pub fn grundform(id: u32, art: u8, teile: u32, dicke: f64) -> Vec<u8> {
        let mut n = Nachricht::neu(3);
        n.u32(id).u8(art).u32(teile).f(dicke).u8(0);
        n.b
    }
    /// Eigene Form aus Punkten (x, y, z …) und Dreiecken.
    pub fn eigene_form(id: u32, punkte: &[f64], dreiecke: &[u32], glatt: bool) -> Vec<u8> {
        let mut n = Nachricht::neu(3);
        n.u32(id).u8(0).u32(0).f(0.0).u8(glatt as u8);
        n.u32((punkte.len() / 3) as u32);
        for p in punkte {
            n.f(*p);
        }
        n.u32(dreiecke.len() as u32);
        for d in dreiecke {
            n.u32(*d);
        }
        n.b
    }
    pub fn bildchen(id: u32, breite: u16, hoehe: u16, rgba: &[u8]) -> Vec<u8> {
        let mut n = Nachricht::neu(4);
        n.u32(id).u16(breite).u16(hoehe);
        n.b.extend_from_slice(rgba);
        n.b
    }
}

/// Baut eine `bild`-Nachricht Befehl für Befehl.
pub struct Bild {
    n: Nachricht,
    anzahl: u32,
}

impl Bild {
    pub fn neu(bildnummer: u32) -> Self {
        let mut n = Nachricht::neu(2);
        n.u32(bildnummer).u32(0);
        Bild { n, anzahl: 0 }
    }
    fn op(&mut self, op: u8) -> &mut Nachricht {
        self.anzahl += 1;
        self.n.u8(op)
    }
    pub fn fertig(mut self) -> Vec<u8> {
        let a = self.anzahl.to_le_bytes();
        self.n.b[5..9].copy_from_slice(&a);
        self.n.b
    }
    pub fn hintergrund(&mut self, c: [u8; 4]) -> &mut Self {
        self.op(0x01).c(c);
        self
    }
    #[allow(clippy::too_many_arguments)]
    pub fn rechteck(&mut self, x: f64, y: f64, b: f64, h: f64, c: [u8; 4], rand: f64, rundung: f64) -> &mut Self {
        self.op(0x02).f(x).f(y).f(b).f(h).c(c).f(rand).f(rundung);
        self
    }
    pub fn kreis(&mut self, x: f64, y: f64, r: f64, c: [u8; 4], rand: f64) -> &mut Self {
        self.op(0x03).f(x).f(y).f(r).c(c).f(rand);
        self
    }
    pub fn linie(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, dicke: f64, c: [u8; 4]) -> &mut Self {
        self.op(0x04).f(x1).f(y1).f(x2).f(y2).f(dicke).c(c);
        self
    }
    pub fn vieleck(&mut self, punkte: &[f64], c: [u8; 4], rand: f64) -> &mut Self {
        let n = self.op(0x05);
        n.u32((punkte.len() / 2) as u32);
        for p in punkte {
            n.f(*p);
        }
        n.c(c).f(rand);
        self
    }
    pub fn text(&mut self, t: &str, x: f64, y: f64, groesse: f64, c: [u8; 4], ausrichtung: u8) -> &mut Self {
        self.op(0x06).f(x).f(y).f(groesse).c(c).u8(ausrichtung).s(t);
        self
    }
    pub fn bild(&mut self, id: u32, x: f64, y: f64, groesse: f64, c: [u8; 4]) -> &mut Self {
        self.op(0x07).u32(id).f(x).f(y).f(groesse).c(c);
        self
    }
    pub fn merke(&mut self) -> &mut Self {
        self.op(0x08);
        self
    }
    pub fn zurueck(&mut self) -> &mut Self {
        self.op(0x09);
        self
    }
    pub fn schiebe(&mut self, dx: f64, dy: f64) -> &mut Self {
        self.op(0x0A).f(dx).f(dy);
        self
    }
    pub fn drehe(&mut self, grad: f64) -> &mut Self {
        self.op(0x0B).f(grad);
        self
    }
    pub fn skaliere(&mut self, sx: f64, sy: f64) -> &mut Self {
        self.op(0x0C).f(sx).f(sy);
        self
    }
    #[allow(clippy::too_many_arguments)]
    pub fn kamera(&mut self, x: f64, y: f64, z: f64, zx: f64, zy: f64, zz: f64, sicht: f64) -> &mut Self {
        self.op(0x20).f(x).f(y).f(z).f(zx).f(zy).f(zz).f(sicht);
        self
    }
    pub fn himmel(&mut self, oben: [u8; 4], unten: [u8; 4]) -> &mut Self {
        self.op(0x21).c(oben).c(unten);
        self
    }
    pub fn sonne(&mut self, x: f64, y: f64, z: f64, c: [u8; 4], staerke: f64, schatten: bool) -> &mut Self {
        self.op(0x22).f(x).f(y).f(z).c(c).f(staerke).u8(schatten as u8);
        self
    }
    pub fn licht(&mut self, x: f64, y: f64, z: f64, c: [u8; 4], reichweite: f64) -> &mut Self {
        self.op(0x23).f(x).f(y).f(z).c(c).f(reichweite);
        self
    }
    pub fn umgebung(&mut self, c: [u8; 4], staerke: f64) -> &mut Self {
        self.op(0x24).c(c).f(staerke);
        self
    }
    pub fn nebel(&mut self, c: [u8; 4], von: f64, bis: f64) -> &mut Self {
        self.op(0x25).c(c).f(von).f(bis);
        self
    }
    /// `zeichne` mit allen Feldern; `groesse` = [sx, sy, sz], Winkel in Grad.
    #[allow(clippy::too_many_arguments)]
    pub fn zeichne(
        &mut self,
        form: u32,
        pos: [f64; 3],
        groesse: [f64; 3],
        drehung: f64,
        neigung: f64,
        rollen: f64,
        c: [u8; 4],
        glanz: f64,
        leuchten: f64,
        bildchen: u32,
    ) -> &mut Self {
        self.op(0x26)
            .u32(form)
            .f(pos[0])
            .f(pos[1])
            .f(pos[2])
            .f(groesse[0])
            .f(groesse[1])
            .f(groesse[2])
            .f(drehung)
            .f(neigung)
            .f(rollen)
            .c(c)
            .f(glanz)
            .f(leuchten)
            .u32(bildchen);
        self
    }
}

/// Palette (HERD.md §3.1) als RGBA.
pub mod palette {
    pub const WEISS: [u8; 4] = [0xFF, 0xFF, 0xFF, 0xFF];
    pub const SCHWARZ: [u8; 4] = [0x00, 0x00, 0x00, 0xFF];
    pub const GRAU: [u8; 4] = [0x8A, 0x85, 0x80, 0xFF];
    pub const OFEN: [u8; 4] = [0x2F, 0x2A, 0x26, 0xFF];
    pub const TOMATE: [u8; 4] = [0xD9, 0x45, 0x2B, 0xFF];
    pub const SALAMI: [u8; 4] = [0xA8, 0x32, 0x32, 0xFF];
    pub const SCHINKEN: [u8; 4] = [0xF2, 0xA0, 0xA0, 0xFF];
    pub const BASILIKUM: [u8; 4] = [0x3E, 0x8E, 0x41, 0xFF];
    pub const OLIVEN: [u8; 4] = [0x6B, 0x7A, 0x2A, 0xFF];
    pub const MOZZARELLA: [u8; 4] = [0xFF, 0xF6, 0xE0, 0xFF];
    pub const TEIG: [u8; 4] = [0xE8, 0xC4, 0x8A, 0xFF];
    pub const KRUSTE: [u8; 4] = [0xC8, 0x95, 0x5A, 0xFF];
    pub const ANANAS: [u8; 4] = [0xF5, 0xC5, 0x18, 0xFF];
    pub const SENF: [u8; 4] = [0xF2, 0xB3, 0x3D, 0xFF];
    pub const HIMMEL: [u8; 4] = [0x8E, 0xC9, 0xF0, 0xFF];
    pub const WASSER: [u8; 4] = [0x2E, 0x6F, 0xD9, 0xFF];
    pub const AUBERGINE: [u8; 4] = [0x5B, 0x2A, 0x6E, 0xFF];

    /// Bildchen-Zeichen → Farbe (`.`/Leerzeichen = durchsichtig).
    pub fn zeichen(c: char) -> Option<[u8; 4]> {
        Some(match c {
            'w' => WEISS,
            's' => SCHWARZ,
            'g' => GRAU,
            'o' => OFEN,
            't' => TOMATE,
            'r' => SALAMI,
            'p' => SCHINKEN,
            'b' => BASILIKUM,
            'l' => OLIVEN,
            'm' => MOZZARELLA,
            'e' => TEIG,
            'k' => KRUSTE,
            'a' => ANANAS,
            'y' => SENF,
            'h' => HIMMEL,
            'u' => WASSER,
            'v' => AUBERGINE,
            _ => return None,
        })
    }

    /// Mit Deckkraft (0 … 255).
    pub const fn mit_alpha(c: [u8; 4], a: u8) -> [u8; 4] {
        [c[0], c[1], c[2], a]
    }
}

/// Bildchen aus Textzeilen (Standardzeichen) → (breite, hoehe, rgba).
pub fn bildchen_aus_zeilen(zeilen: &[&str]) -> (u16, u16, Vec<u8>) {
    let h = zeilen.len();
    let b = zeilen.iter().map(|z| z.chars().count()).max().unwrap_or(0);
    let mut rgba = alloc::vec![0u8; b * h * 4];
    for (y, z) in zeilen.iter().enumerate() {
        for (x, c) in z.chars().enumerate() {
            if let Some(f) = palette::zeichen(c) {
                let i = (y * b + x) * 4;
                rgba[i..i + 4].copy_from_slice(&f);
            }
        }
    }
    (b as u16, h as u16, rgba)
}

/// Nachrichten-Datei (HERD README): je Nachricht `u32`-LE-Länge + Bytes.
pub fn datei(nachrichten: &[Vec<u8>]) -> Vec<u8> {
    let mut d = Vec::new();
    for n in nachrichten {
        d.extend_from_slice(&(n.len() as u32).to_le_bytes());
        d.extend_from_slice(n);
    }
    d
}

/// Nachrichten-Datei zerlegen; `None` bei abgeschnittener Datei.
pub fn datei_lesen(d: &[u8]) -> Option<Vec<&[u8]>> {
    let mut v = Vec::new();
    let mut i = 0usize;
    while i < d.len() {
        if d.len() - i < 4 {
            return None;
        }
        let n = u32::from_le_bytes([d[i], d[i + 1], d[i + 2], d[i + 3]]) as usize;
        i += 4;
        if d.len() - i < n {
            return None;
        }
        v.push(&d[i..i + n]);
        i += n;
    }
    Some(v)
}
