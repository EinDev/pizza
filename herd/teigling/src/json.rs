//! Kleiner JSON-Leser für glTF (H-K16): RFC 8259, UTF-8, harte Grenzen (Tiefe ≤ 64, Länge durch die Quelle begrenzt).
//! Werte liegen flach in einem Feld (`Vec<Wert>`), Objekte und Felder verweisen über Indizes – keine Rekursion beim Lesen der
//! Ergebnisse, keine `HashMap` (Schlüssel werden linear gesucht; glTF-Objekte haben wenige Schlüssel).
//!
//! Zahlen bleiben als **Text** (die Ziffernfolge aus der Quelle) und werden erst beim Abfragen umgewandelt: `zahl_f32` über
//! `core`s korrekt gerundetes `str::parse::<f32>()` (IEEE, keine eigene Rechnung), `ganz` exakt als Ganzzahl. So entstehen die
//! f32-Bits aus der Quelle ohne doppelte Rundung.

use alloc::string::String;
use alloc::vec::Vec;

/// Größte Schachtelungstiefe.
pub const MAX_TIEFE: usize = 64;

#[derive(Clone, Debug, PartialEq)]
pub enum Wert {
    Null,
    Bool(bool),
    /// Ziffernfolge wie in der Quelle (geprüft nach RFC 8259)
    Zahl(String),
    Text(String),
    /// Indizes der Elemente
    Feld(Vec<u32>),
    /// (Schlüssel, Index des Werts) in Quellreihenfolge
    Objekt(Vec<(String, u32)>),
}

/// Ein gelesenes Dokument: `werte[0]` ist die Wurzel.
#[derive(Clone, Debug)]
pub struct Dok {
    pub werte: Vec<Wert>,
}

struct Leser<'a> {
    q: &'a [u8],
    p: usize,
    werte: Vec<Wert>,
}

impl<'a> Leser<'a> {
    fn leer(&mut self) {
        while self.p < self.q.len() && matches!(self.q[self.p], b' ' | b'\t' | b'\n' | b'\r') {
            self.p += 1;
        }
    }
    fn neu(&mut self, w: Wert) -> u32 {
        self.werte.push(w);
        (self.werte.len() - 1) as u32
    }
    fn wert(&mut self, tiefe: usize) -> Option<u32> {
        if tiefe > MAX_TIEFE {
            return None;
        }
        self.leer();
        let c = *self.q.get(self.p)?;
        match c {
            b'{' => {
                self.p += 1;
                let id = self.neu(Wert::Null);
                let mut felder = Vec::new();
                self.leer();
                if self.q.get(self.p) == Some(&b'}') {
                    self.p += 1;
                } else {
                    loop {
                        self.leer();
                        if self.q.get(self.p) != Some(&b'"') {
                            return None;
                        }
                        let k = self.text()?;
                        self.leer();
                        if self.q.get(self.p) != Some(&b':') {
                            return None;
                        }
                        self.p += 1;
                        let v = self.wert(tiefe + 1)?;
                        felder.push((k, v));
                        self.leer();
                        match self.q.get(self.p) {
                            Some(b',') => self.p += 1,
                            Some(b'}') => {
                                self.p += 1;
                                break;
                            }
                            _ => return None,
                        }
                    }
                }
                self.werte[id as usize] = Wert::Objekt(felder);
                Some(id)
            }
            b'[' => {
                self.p += 1;
                let id = self.neu(Wert::Null);
                let mut el = Vec::new();
                self.leer();
                if self.q.get(self.p) == Some(&b']') {
                    self.p += 1;
                } else {
                    loop {
                        let v = self.wert(tiefe + 1)?;
                        el.push(v);
                        self.leer();
                        match self.q.get(self.p) {
                            Some(b',') => self.p += 1,
                            Some(b']') => {
                                self.p += 1;
                                break;
                            }
                            _ => return None,
                        }
                    }
                }
                self.werte[id as usize] = Wert::Feld(el);
                Some(id)
            }
            b'"' => {
                let t = self.text()?;
                Some(self.neu(Wert::Text(t)))
            }
            b't' => self.wort(b"true", Wert::Bool(true)),
            b'f' => self.wort(b"false", Wert::Bool(false)),
            b'n' => self.wort(b"null", Wert::Null),
            b'-' | b'0'..=b'9' => {
                let s = self.zahl()?;
                Some(self.neu(Wert::Zahl(s)))
            }
            _ => None,
        }
    }
    fn wort(&mut self, w: &[u8], v: Wert) -> Option<u32> {
        if self.q.len() - self.p >= w.len() && &self.q[self.p..self.p + w.len()] == w {
            self.p += w.len();
            Some(self.neu(v))
        } else {
            None
        }
    }
    fn ziffern(&mut self) -> usize {
        let a = self.p;
        while self.p < self.q.len() && self.q[self.p].is_ascii_digit() {
            self.p += 1;
        }
        self.p - a
    }
    fn zahl(&mut self) -> Option<String> {
        let a = self.p;
        if self.q[self.p] == b'-' {
            self.p += 1;
        }
        match self.q.get(self.p) {
            Some(b'0') => self.p += 1,
            Some(b'1'..=b'9') => {
                self.ziffern();
            }
            _ => return None,
        }
        if self.q.get(self.p) == Some(&b'.') {
            self.p += 1;
            if self.ziffern() == 0 {
                return None;
            }
        }
        if matches!(self.q.get(self.p), Some(b'e') | Some(b'E')) {
            self.p += 1;
            if matches!(self.q.get(self.p), Some(b'+') | Some(b'-')) {
                self.p += 1;
            }
            if self.ziffern() == 0 {
                return None;
            }
        }
        if self.p - a > 400 {
            return None;
        }
        Some(String::from(core::str::from_utf8(&self.q[a..self.p]).ok()?))
    }
    fn hex4(&mut self) -> Option<u32> {
        if self.q.len() - self.p < 4 {
            return None;
        }
        let mut v = 0u32;
        for i in 0..4 {
            let c = self.q[self.p + i];
            let d = match c {
                b'0'..=b'9' => c - b'0',
                b'a'..=b'f' => c - b'a' + 10,
                b'A'..=b'F' => c - b'A' + 10,
                _ => return None,
            };
            v = v * 16 + d as u32;
        }
        self.p += 4;
        Some(v)
    }
    fn text(&mut self) -> Option<String> {
        self.p += 1; // "
        let mut aus: Vec<u8> = Vec::new();
        loop {
            let c = *self.q.get(self.p)?;
            self.p += 1;
            match c {
                b'"' => break,
                b'\\' => {
                    let e = *self.q.get(self.p)?;
                    self.p += 1;
                    let z = match e {
                        b'"' => '"',
                        b'\\' => '\\',
                        b'/' => '/',
                        b'b' => '\u{8}',
                        b'f' => '\u{c}',
                        b'n' => '\n',
                        b'r' => '\r',
                        b't' => '\t',
                        b'u' => {
                            let a = self.hex4()?;
                            let cp = if (0xD800..0xDC00).contains(&a) {
                                if self.q.get(self.p) != Some(&b'\\') || self.q.get(self.p + 1) != Some(&b'u') {
                                    return None;
                                }
                                self.p += 2;
                                let b = self.hex4()?;
                                if !(0xDC00..0xE000).contains(&b) {
                                    return None;
                                }
                                0x10000 + ((a - 0xD800) << 10) + (b - 0xDC00)
                            } else if (0xDC00..0xE000).contains(&a) {
                                return None;
                            } else {
                                a
                            };
                            char::from_u32(cp)?
                        }
                        _ => return None,
                    };
                    let mut b = [0u8; 4];
                    aus.extend_from_slice(z.encode_utf8(&mut b).as_bytes());
                }
                0..=0x1F => return None,
                _ => aus.push(c),
            }
        }
        String::from_utf8(aus).ok()
    }
}

/// Liest ein JSON-Dokument (UTF-8, optional mit BOM). `None` = kein gültiges JSON.
pub fn lies(q: &[u8]) -> Option<Dok> {
    let q = if q.starts_with(&[0xEF, 0xBB, 0xBF]) { &q[3..] } else { q };
    core::str::from_utf8(q).ok()?;
    let mut l = Leser { q, p: 0, werte: Vec::new() };
    let w = l.wert(0)?;
    l.leer();
    if l.p != q.len() || w != 0 {
        return None;
    }
    Some(Dok { werte: l.werte })
}

/// Verweis auf einen Wert im Dokument (Kopierbar, mit Abfragen).
#[derive(Clone, Copy)]
pub struct W<'a> {
    pub d: &'a Dok,
    pub i: u32,
}

impl<'a> W<'a> {
    pub fn wurzel(d: &'a Dok) -> W<'a> {
        W { d, i: 0 }
    }
    pub fn wert(&self) -> &'a Wert {
        &self.d.werte[self.i as usize]
    }
    /// Feld `k` eines Objekts (erstes Vorkommen).
    pub fn feld(&self, k: &str) -> Option<W<'a>> {
        match self.wert() {
            Wert::Objekt(f) => f.iter().find(|(s, _)| s == k).map(|(_, i)| W { d: self.d, i: *i }),
            _ => None,
        }
    }
    pub fn ist_objekt(&self) -> bool {
        matches!(self.wert(), Wert::Objekt(_))
    }
    pub fn schluessel(&self) -> Vec<&'a str> {
        match self.wert() {
            Wert::Objekt(f) => f.iter().map(|(s, _)| s.as_str()).collect(),
            _ => Vec::new(),
        }
    }
    pub fn laenge(&self) -> Option<usize> {
        match self.wert() {
            Wert::Feld(e) => Some(e.len()),
            _ => None,
        }
    }
    pub fn el(&self, n: usize) -> Option<W<'a>> {
        match self.wert() {
            Wert::Feld(e) => e.get(n).map(|i| W { d: self.d, i: *i }),
            _ => None,
        }
    }
    pub fn text(&self) -> Option<&'a str> {
        match self.wert() {
            Wert::Text(s) => Some(s.as_str()),
            _ => None,
        }
    }
    pub fn bool(&self) -> Option<bool> {
        match self.wert() {
            Wert::Bool(b) => Some(*b),
            _ => None,
        }
    }
    /// Zahl als f32 (korrekt gerundet aus der Ziffernfolge; nicht endlich → `None`).
    pub fn f32(&self) -> Option<f32> {
        match self.wert() {
            Wert::Zahl(s) => {
                let v: f32 = s.parse().ok()?;
                if v.is_finite() {
                    Some(v)
                } else {
                    None
                }
            }
            _ => None,
        }
    }
    /// Nicht negative Ganzzahl ≤ 2^53 (auch `1.0`, `1e3` – sofern exakt ganz).
    pub fn ganz(&self) -> Option<u64> {
        match self.wert() {
            Wert::Zahl(s) => {
                if let Ok(v) = s.parse::<u64>() {
                    return if v <= 1 << 53 { Some(v) } else { None };
                }
                let v: f64 = s.parse().ok()?;
                if v >= 0.0 && v <= 9007199254740992.0 && (v as u64) as f64 == v {
                    Some(v as u64)
                } else {
                    None
                }
            }
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_grundlagen() {
        let d = lies(br#" {"a": [1, -2.5e3, true, null], "b": {"c": "x\u00e4\ud83c\udf55\n"}, "a": 7} "#).unwrap();
        let w = W::wurzel(&d);
        let a = w.feld("a").unwrap();
        assert_eq!(a.laenge(), Some(4));
        assert_eq!(a.el(0).unwrap().ganz(), Some(1));
        assert_eq!(a.el(1).unwrap().f32(), Some(-2500.0));
        assert_eq!(a.el(1).unwrap().ganz(), None);
        assert_eq!(a.el(2).unwrap().bool(), Some(true));
        assert_eq!(w.feld("b").unwrap().feld("c").unwrap().text(), Some("xä🍕\n"));
        assert_eq!(w.schluessel(), alloc::vec!["a", "b", "a"]);
        assert_eq!(lies(b"1.0").map(|d| W::wurzel(&d).ganz()), Some(Some(1)));
        assert_eq!(lies(b"0.1").map(|d| W::wurzel(&d).f32()), Some(Some(0.1f32)));
        for kaputt in [&b"{"[..], b"[1,]", b"{\"a\" 1}", b"01", b"1.", b"-", b"\"\\x\"", b"\"\\ud800\"", b"[1] 2", b"\"\x01\"", b"nul", b"\xff"] {
            assert!(lies(kaputt).is_none(), "{:?}", kaputt);
        }
        let tief: Vec<u8> = core::iter::repeat(b'[').take(MAX_TIEFE + 2).chain(core::iter::repeat(b']').take(MAX_TIEFE + 2)).collect();
        assert!(lies(&tief).is_none());
        let ok: Vec<u8> = core::iter::repeat(b'[').take(MAX_TIEFE + 1).chain(core::iter::repeat(b']').take(MAX_TIEFE + 1)).collect();
        assert!(lies(&ok).is_some());
    }
}
