//! Herd-Szenen-Skripte (`*.herd`): Folgen von Herd-ABI-Aufrufen mit Schleifen und Variablen, gelesen **gleich** von
//! diesem nativen Spieler und von `herd/skript.js` (gegen `kern.wasm`). Format: `herd/README.md` §7.
//!
//! ```text
//! # Kommentar
//! vorgabe N 100                       # Variable mit Standardwert (Kommandozeile: N=10000 überschreibt)
//! welt_neu 640 360 "B1"
//! typ_nummer "Kreis" -> kreis         # Rückgabe in Variable
//! wiederhole N i                      # i = 0 … N − 1
//!   teil_neu 2 -> t
//!   teil_lage t (zufall(i) * 640) (zufall(i + N) * 360) 0
//! ende
//! takte 60                            # 60 × (takt, bild n)
//! ```
//!
//! Zahlenlisten: `[1, 2, (N * 3)]` oder erzeugt `[folge ANZAHL i AUSDRUCK]` (Eintrag i = AUSDRUCK mit i = 0 … ANZAHL − 1).
//!
//! Ausdrücke: Zahlen, Variablen, `+ - * / %` (f64, `%` wie JS), Klammern, `boden(x)`, `zufall(x)` (deterministisch,
//! [0, 1), gleiche Bitfolge in JS). Keine Winkelfunktionen (JS-`Math.sin` ≠ libm).

use std::collections::BTreeMap;

use herd_kern::Kern;

// ------------------------------------------------------------------------------------------------ Signaturen

/// Argumentarten: `i` i32, `f` f64, `t` Text, `u` Liste u32, `d` Liste f64, `z` Bildchen-Zeilen, `p` Farbpaare,
/// `b` Bytes. Rückgabe: `I` i32, `F` f64, `T` Text (Retry), `U` u32-Liste (Retry), `D` f64-Liste (Retry), `H` Hash-Text.
pub const SIGNATUREN: &[(&str, &str, char)] = &[
    ("abi_version", "", 'I'),
    ("fehler_art", "", 'I'),
    ("fehler_code", "", 'I'),
    ("fehler_neu", "", 'I'),
    ("fehler_text", "", 'T'),
    ("melde_typfehler", "iit", 'I'),
    ("welt_neu", "fft", 'I'),
    ("welt_titel", "t", 'I'),
    ("welt_hintergrund", "t", 'I'),
    ("welt_himmel", "tt", 'I'),
    ("welt_umgebung", "tf", 'I'),
    ("welt_nebel", "tff", 'I'),
    ("welt_hole", "i", 'F'),
    ("teil_neu", "i", 'I'),
    ("teil_entferne", "i", 'I'),
    ("teil_kopie", "i", 'I'),
    ("teil_haenge", "ii", 'I'),
    ("teil_kinder", "i", 'U'),
    ("teil_setze", "iif", 'I'),
    ("teil_hole", "ii", 'F'),
    ("teil_lage", "ifff", 'I'),
    ("teil_verschiebe", "ifff", 'I'),
    ("teil_groesse", "ifff", 'I'),
    ("teil_schaue", "ifff", 'I'),
    ("teil_trifft", "ii", 'I'),
    ("komp_neu", "i", 'I'),
    ("komp_haenge", "ii", 'I'),
    ("komp_loese", "i", 'I'),
    ("komp_von", "ii", 'I'),
    ("komp_info", "ii", 'I'),
    ("typ_nummer", "t", 'I'),
    ("feld_nummer", "it", 'I'),
    ("setze_zahl", "iif", 'I'),
    ("hole_zahl", "ii", 'F'),
    ("setze_text", "iit", 'I'),
    ("hole_text", "ii", 'T'),
    ("setze_liste", "iiu", 'I'),
    ("hole_liste", "ii", 'U'),
    ("setze_zahlen", "iid", 'I'),
    ("hole_zahlen", "ii", 'D'),
    ("form_grund", "iff", 'I'),
    ("form_eigene", "ddi", 'I'),
    ("bildchen_neu", "zp", 'I'),
    ("bildchen_rgba", "iib", 'I'),
    ("bildchen_teigling", "b", 'I'),
    // Hilfsaufruf der Spieler (kein ABI-Export): Teigling aus einem festen Muster (`muster_teigling`) → bildchen_teigling
    ("teigling_muster", "iii", 'I'),
    // Hilfsaufruf der Spieler: Teigling aus einer Datei (Pfad absolut oder relativ zum Arbeitsordner) → bildchen_teigling;
    // so zeichnet tests/herd/bild.js Projekte mit Bildchen.laden auf (die Teiglinge legt es in einen Temp-Ordner)
    ("teigling_datei", "t", 'I'),
    ("ressource_hole", "ii", 'F'),
    // Modelle (H-K16)
    ("modell_teig", "b", 'I'),
    // Hilfsaufruf der Spieler: Modell aus einer Datei – ein Modellteig direkt, sonst .glb/.gltf (samt Nachbardateien) mit dem
    // Vorbacker gebacken → modell_teig (so zeichnet tests/herd/bild.js Modell.laden auf)
    ("modell_datei", "t", 'I'),
    ("modell_teil", "ifff", 'I'),
    ("modell_info", "ii", 'F'),
    ("modell_text", "iii", 'T'),
    ("teil_finde", "it", 'I'),
    ("eingabe", "ffi", 'I'),
    ("takt", "", 'I'),
    ("paket_voll", "", 'I'),
    ("hash_szene", "", 'H'),
    ("hash_paket", "", 'H'),
    ("schema_json", "", 'T'),
];

// ------------------------------------------------------------------------------------------------ Syntax

#[derive(Clone, Debug)]
pub enum Ausdruck {
    Zahl(f64),
    Var(String),
    Neg(Box<Ausdruck>),
    Bin(Box<Ausdruck>, char, Box<Ausdruck>),
    Fn(String, Box<Ausdruck>),
}

#[derive(Clone, Debug)]
pub enum Arg {
    Wert(Ausdruck),
    Text(String),
    Liste(Vec<Arg>),
    /// `[folge ANZAHL VAR AUSDRUCK]`: Zahlenliste, Eintrag i = AUSDRUCK mit VAR = i (i = 0 … ANZAHL − 1; H-K10, große Karten)
    Folge(Ausdruck, String, Ausdruck),
}

#[derive(Clone, Debug)]
pub enum Befehl {
    /// ABI-Aufruf (auch `bild [n]`)
    Ruf { zeile: usize, name: String, args: Vec<Arg>, ziel: Option<String> },
    Wiederhole { zeile: usize, anzahl: Ausdruck, var: Option<String>, rumpf: Vec<Befehl> },
    Setze { zeile: usize, var: String, wert: Ausdruck },
    Vorgabe { var: String, wert: f64 },
    Takte { zeile: usize, anzahl: Ausdruck },
}

#[derive(Clone, Debug, Default)]
pub struct Skript {
    pub befehle: Vec<Befehl>,
}

struct Zeiger<'a> {
    s: &'a [u8],
    i: usize,
    zeile: usize,
}

fn fehler<T>(zeile: usize, t: impl Into<String>) -> Result<T, String> {
    Err(format!("Zeile {}: {}", zeile, t.into()))
}

impl<'a> Zeiger<'a> {
    fn leer(&mut self) {
        while self.i < self.s.len() && (self.s[self.i] == b' ' || self.s[self.i] == b'\t' || self.s[self.i] == b'\r') {
            self.i += 1;
        }
    }
    fn ende(&mut self) -> bool {
        self.leer();
        self.i >= self.s.len() || self.s[self.i] == b'#'
    }
    fn sieh(&self) -> u8 {
        if self.i < self.s.len() {
            self.s[self.i]
        } else {
            0
        }
    }
    fn text(&mut self) -> Result<String, String> {
        // JSON-Zeichenkette
        self.i += 1;
        let mut aus = String::new();
        loop {
            if self.i >= self.s.len() {
                return fehler(self.zeile, "Text ohne Ende");
            }
            let c = self.s[self.i];
            if c == b'"' {
                self.i += 1;
                return Ok(aus);
            }
            if c == b'\\' {
                let e = *self.s.get(self.i + 1).unwrap_or(&0);
                self.i += 2;
                match e {
                    b'"' => aus.push('"'),
                    b'\\' => aus.push('\\'),
                    b'/' => aus.push('/'),
                    b'n' => aus.push('\n'),
                    b't' => aus.push('\t'),
                    b'r' => aus.push('\r'),
                    b'u' => {
                        let h = std::str::from_utf8(self.s.get(self.i..self.i + 4).unwrap_or(b"")).unwrap_or("");
                        let c = u32::from_str_radix(h, 16).map_err(|_| format!("Zeile {}: \\u", self.zeile))?;
                        aus.push(char::from_u32(c).unwrap_or('\u{FFFD}'));
                        self.i += 4;
                    }
                    _ => return fehler(self.zeile, "unbekanntes Escape"),
                }
                continue;
            }
            // UTF-8 unverändert übernehmen
            let start = self.i;
            self.i += 1;
            while self.i < self.s.len() && (self.s[self.i] & 0xC0) == 0x80 {
                self.i += 1;
            }
            aus.push_str(std::str::from_utf8(&self.s[start..self.i]).map_err(|_| format!("Zeile {}: UTF-8", self.zeile))?);
        }
    }
    /// Ein Wort bis Leerraum, `,`, `]` (außerhalb von Klammern).
    fn wort(&mut self) -> &'a str {
        let start = self.i;
        let mut tiefe = 0i32;
        while self.i < self.s.len() {
            let c = self.s[self.i];
            if c == b'(' {
                tiefe += 1;
            } else if c == b')' {
                tiefe -= 1;
            } else if tiefe <= 0 && (c == b' ' || c == b'\t' || c == b'\r' || c == b',' || c == b']') {
                break;
            }
            self.i += 1;
        }
        std::str::from_utf8(&self.s[start..self.i]).unwrap_or("")
    }
    fn arg(&mut self) -> Result<Arg, String> {
        self.leer();
        match self.sieh() {
            b'"' => Ok(Arg::Text(self.text()?)),
            b'[' => {
                self.i += 1;
                self.leer();
                if self.s[self.i..].starts_with(b"folge ") {
                    self.i += 6;
                    let anzahl = match self.arg()? {
                        Arg::Wert(a) => a,
                        _ => return fehler(self.zeile, "folge braucht eine Anzahl"),
                    };
                    self.leer();
                    let var = self.wort().to_string();
                    let wert = match self.arg()? {
                        Arg::Wert(a) if !var.is_empty() => a,
                        _ => return fehler(self.zeile, "[folge anzahl var ausdruck]"),
                    };
                    self.leer();
                    if self.sieh() != b']' {
                        return fehler(self.zeile, "folge ohne ]");
                    }
                    self.i += 1;
                    return Ok(Arg::Folge(anzahl, var, wert));
                }
                let mut v = Vec::new();
                loop {
                    self.leer();
                    match self.sieh() {
                        b']' => {
                            self.i += 1;
                            return Ok(Arg::Liste(v));
                        }
                        b',' => self.i += 1,
                        0 => return fehler(self.zeile, "Liste ohne ]"),
                        _ => v.push(self.arg()?),
                    }
                }
            }
            _ => {
                let w = self.wort();
                if w.is_empty() {
                    return fehler(self.zeile, "Argument erwartet");
                }
                Ok(Arg::Wert(ausdruck(w, self.zeile)?))
            }
        }
    }
}

/// Ausdruck aus einem Text (rekursiver Abstieg).
pub fn ausdruck(t: &str, zeile: usize) -> Result<Ausdruck, String> {
    let mut toks: Vec<String> = Vec::new();
    let b = t.as_bytes();
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        if c == b' ' || c == b'\t' {
            i += 1;
        } else if c.is_ascii_digit() || (c == b'.' && i + 1 < b.len() && b[i + 1].is_ascii_digit()) {
            let s = i;
            while i < b.len() && (b[i].is_ascii_digit() || b[i] == b'.' || b[i] == b'e' || b[i] == b'E' || ((b[i] == b'-' || b[i] == b'+') && (b[i - 1] == b'e' || b[i - 1] == b'E'))) {
                i += 1;
            }
            toks.push(t[s..i].to_string());
        } else if c.is_ascii_alphabetic() || c == b'_' {
            let s = i;
            while i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'_') {
                i += 1;
            }
            toks.push(t[s..i].to_string());
        } else if b"+-*/%()".contains(&c) {
            toks.push((c as char).to_string());
            i += 1;
        } else {
            return fehler(zeile, format!("unerwartetes Zeichen '{}' in '{}'", c as char, t));
        }
    }
    let mut p = 0;
    let a = summe(&toks, &mut p, zeile)?;
    if p != toks.len() {
        return fehler(zeile, format!("Rest im Ausdruck '{}'", t));
    }
    Ok(a)
}

fn summe(t: &[String], p: &mut usize, z: usize) -> Result<Ausdruck, String> {
    let mut a = produkt(t, p, z)?;
    while *p < t.len() && (t[*p] == "+" || t[*p] == "-") {
        let op = t[*p].as_bytes()[0] as char;
        *p += 1;
        let b = produkt(t, p, z)?;
        a = Ausdruck::Bin(Box::new(a), op, Box::new(b));
    }
    Ok(a)
}
fn produkt(t: &[String], p: &mut usize, z: usize) -> Result<Ausdruck, String> {
    let mut a = faktor(t, p, z)?;
    while *p < t.len() && (t[*p] == "*" || t[*p] == "/" || t[*p] == "%") {
        let op = t[*p].as_bytes()[0] as char;
        *p += 1;
        let b = faktor(t, p, z)?;
        a = Ausdruck::Bin(Box::new(a), op, Box::new(b));
    }
    Ok(a)
}
fn faktor(t: &[String], p: &mut usize, z: usize) -> Result<Ausdruck, String> {
    let Some(x) = t.get(*p) else { return fehler(z, "Ausdruck unvollständig") };
    *p += 1;
    if x == "-" {
        return Ok(Ausdruck::Neg(Box::new(faktor(t, p, z)?)));
    }
    if x == "(" {
        let a = summe(t, p, z)?;
        if t.get(*p).map(|s| s.as_str()) != Some(")") {
            return fehler(z, ") fehlt");
        }
        *p += 1;
        return Ok(a);
    }
    let c = x.as_bytes()[0];
    if c.is_ascii_digit() || c == b'.' {
        return x.parse::<f64>().map(Ausdruck::Zahl).map_err(|_| format!("Zeile {}: Zahl '{}'", z, x));
    }
    if c.is_ascii_alphabetic() || c == b'_' {
        if t.get(*p).map(|s| s.as_str()) == Some("(") {
            *p += 1;
            let a = summe(t, p, z)?;
            if t.get(*p).map(|s| s.as_str()) != Some(")") {
                return fehler(z, ") fehlt");
            }
            *p += 1;
            if x != "boden" && x != "zufall" {
                return fehler(z, format!("unbekannte Funktion {}", x));
            }
            return Ok(Ausdruck::Fn(x.clone(), Box::new(a)));
        }
        return Ok(Ausdruck::Var(x.clone()));
    }
    fehler(z, format!("unerwartet '{}'", x))
}

/// Liest ein Skript.
pub fn lies(text: &str) -> Result<Skript, String> {
    let mut stapel: Vec<(Vec<Befehl>, Option<(usize, Ausdruck, Option<String>)>)> = vec![(Vec::new(), None)];
    for (n, zeile) in text.lines().enumerate() {
        let nr = n + 1;
        let mut z = Zeiger { s: zeile.as_bytes(), i: 0, zeile: nr };
        if z.ende() {
            continue;
        }
        let wort = z.wort().to_string();
        let befehl = match wort.as_str() {
            "wiederhole" => {
                let anzahl = match z.arg()? {
                    Arg::Wert(a) => a,
                    _ => return fehler(nr, "wiederhole braucht eine Anzahl"),
                };
                let var = if z.ende() { None } else { Some(z.wort().to_string()) };
                stapel.push((Vec::new(), Some((nr, anzahl, var))));
                continue;
            }
            "ende" => {
                let (rumpf, kopf) = stapel.pop().unwrap();
                let Some((zeile, anzahl, var)) = kopf else { return fehler(nr, "ende ohne wiederhole") };
                Befehl::Wiederhole { zeile, anzahl, var, rumpf }
            }
            "setze" => {
                z.leer();
                let var = z.wort().to_string();
                z.leer();
                if z.sieh() != b'=' {
                    return fehler(nr, "setze name = ausdruck");
                }
                z.i += 1;
                z.leer();
                let rest = std::str::from_utf8(&z.s[z.i..]).unwrap_or("");
                let rest = rest.split('#').next().unwrap_or("");
                Befehl::Setze { zeile: nr, var, wert: ausdruck(rest, nr)? }
            }
            "vorgabe" => {
                z.leer();
                let var = z.wort().to_string();
                let Arg::Wert(Ausdruck::Zahl(w)) = z.arg()? else { return fehler(nr, "vorgabe name zahl") };
                Befehl::Vorgabe { var, wert: w }
            }
            "takte" => {
                let Arg::Wert(a) = z.arg()? else { return fehler(nr, "takte anzahl") };
                Befehl::Takte { zeile: nr, anzahl: a }
            }
            name => {
                if name != "bild" && !SIGNATUREN.iter().any(|s| s.0 == name) {
                    return fehler(nr, format!("unbekannter Aufruf '{}'", name));
                }
                let mut args = Vec::new();
                let mut ziel = None;
                while !z.ende() {
                    if z.s[z.i..].starts_with(b"->") {
                        z.i += 2;
                        z.leer();
                        ziel = Some(z.wort().to_string());
                        break;
                    }
                    args.push(z.arg()?);
                }
                if let Some(sig) = SIGNATUREN.iter().find(|s| s.0 == name) {
                    if sig.1.len() != args.len() {
                        return fehler(nr, format!("{} braucht {} Argumente, nicht {}", name, sig.1.len(), args.len()));
                    }
                }
                Befehl::Ruf { zeile: nr, name: name.to_string(), args, ziel }
            }
        };
        stapel.last_mut().unwrap().0.push(befehl);
    }
    if stapel.len() != 1 {
        return fehler(text.lines().count(), "wiederhole ohne ende");
    }
    Ok(Skript { befehle: stapel.pop().unwrap().0 })
}

// ------------------------------------------------------------------------------------------------ Auswertung

/// Deterministischer Zufall in [0, 1) aus einer Zahl (gleiche Bits wie `herd/skript.js`).
pub fn zufall(x: f64) -> f64 {
    let mut h = (if x.is_finite() { x.trunc() as i64 } else { 0 }) as u32;
    h ^= h >> 16;
    h = h.wrapping_mul(0x7feb_352d);
    h ^= h >> 15;
    h = h.wrapping_mul(0x846c_a68b);
    h ^= h >> 16;
    h as f64 / 4_294_967_296.0
}

/// JS `ToInt32`.
pub fn zu_i32(x: f64) -> i32 {
    if !x.is_finite() {
        return 0;
    }
    let t = x.trunc();
    let m = t.rem_euclid(4_294_967_296.0);
    m as u32 as i32
}

fn rechne(a: &Ausdruck, v: &BTreeMap<String, f64>, z: usize) -> Result<f64, String> {
    Ok(match a {
        Ausdruck::Zahl(x) => *x,
        Ausdruck::Var(n) => *v.get(n).ok_or_else(|| format!("Zeile {}: Variable '{}' unbekannt", z, n))?,
        Ausdruck::Neg(x) => -rechne(x, v, z)?,
        Ausdruck::Bin(a, op, b) => {
            let (x, y) = (rechne(a, v, z)?, rechne(b, v, z)?);
            match op {
                '+' => x + y,
                '-' => x - y,
                '*' => x * y,
                '/' => x / y,
                _ => x % y,
            }
        }
        Ausdruck::Fn(n, x) => {
            let x = rechne(x, v, z)?;
            if n == "boden" {
                x.floor()
            } else {
                zufall(x)
            }
        }
    })
}

// ------------------------------------------------------------------------------------------------ Muster-Teiglinge

/// Pixel des Musters `m` an (x, y) in einem Bild `b × h` – nur Ganzzahlen, gleich in `skript.js` (`musterPixel`).
/// 1 Schachbrett (4-px-Felder, Gitter alle 32 px, je Viertel eigene Farben), 2 Pizza (rund, Rand halb durchsichtig, außen
/// durchsichtig), 3 Rahmen (Ecken gestreift, Kanten mit Goldband, Mitte fein kariert), 4 Zonenplatte (Ringe bis 3 px Periode),
/// 5 Himmelsseite, 6 Relief „Noppen“ (Normale x, y in R, G; Rauheit in B, in Bändern je 32 Zeilen), 7 Steinplatten (64-px-Felder
/// mit Fugen, Grau je Feld) – 6 und 7 kachelbar bei Vielfachen von 32 bzw. 64; H-K26: 8 Normal-Karte, 9 Stoff, 10 Leucht,
/// 11 Laub (alle kachelbar bei Vielfachen von 64); sonst weiß.
pub fn muster_pixel(m: u32, x: i64, y: i64, b: i64, h: i64) -> [u8; 4] {
    let dx = 2 * x + 1 - b;
    let dy = 2 * y + 1 - h;
    match m {
        1 => {
            if x % 32 == 0 || y % 32 == 0 {
                return [30, 30, 30, 255];
            }
            const HELL: [[u8; 3]; 4] = [[244, 232, 204], [204, 228, 244], [222, 240, 200], [240, 212, 232]];
            const DUNKEL: [[u8; 3]; 4] = [[176, 52, 36], [36, 84, 168], [52, 128, 52], [132, 52, 132]];
            let q = (2 * x >= b) as usize + 2 * (2 * y >= h) as usize;
            let c = if (x / 4 + y / 4) % 2 == 0 { HELL[q] } else { DUNKEL[q] };
            [c[0], c[1], c[2], 255]
        }
        2 => {
            let r = (b.min(h) - 2).max(1);
            let d2 = dx * dx + dy * dy;
            if d2 > (r + 2) * (r + 2) {
                return [0, 0, 0, 0];
            }
            if d2 > r * r {
                return [150, 95, 40, 128];
            }
            if d2 > (r * 4 / 5) * (r * 4 / 5) {
                return [204, 148, 72, 255];
            }
            let rp = (r / 5).max(1);
            for (fx, fy) in [(3i64, 4i64), (6, 3), (7, 6), (4, 7), (5, 5)] {
                let (px, py) = (2 * b * fx / 10 - b, 2 * h * fy / 10 - h);
                let (ex, ey) = (dx - px, dy - py);
                if (ex + rp / 3) * (ex + rp / 3) + (ey + rp / 3) * (ey + rp / 3) <= (rp / 4) * (rp / 4) {
                    return [214, 92, 80, 255];
                }
                if ex * ex + ey * ey <= rp * rp {
                    return [160, 30, 28, 255];
                }
            }
            if (x * 7 + y * 13) % 17 == 0 {
                [252, 226, 140, 255]
            } else {
                [214, 64, 36, 255]
            }
        }
        3 => {
            let t = (b.min(h) / 3).max(1);
            if x < 2 || y < 2 || x >= b - 2 || y >= h - 2 {
                return [44, 30, 20, 255];
            }
            let rand_x = x < t || x >= b - t;
            let rand_y = y < t || y >= h - t;
            if rand_x && rand_y {
                return if (x + y) / 2 % 2 == 0 { [230, 180, 60, 255] } else { [150, 96, 30, 255] };
            }
            if rand_x || rand_y {
                let innen = (rand_x && (x == t - 1 || x == b - t)) || (rand_y && (y == t - 1 || y == h - t));
                return if innen { [90, 60, 30, 255] } else { [218, 170, 70, 255] };
            }
            if (x / 2 + y / 2) % 2 == 0 {
                [250, 240, 215, 255]
            } else {
                [228, 212, 178, 255]
            }
        }
        4 => {
            let s = b.max(h);
            if (dx * dx + dy * dy) / (6 * s) % 2 == 0 {
                [250, 250, 245, 255]
            } else {
                [24, 28, 70, 255]
            }
        }
        // Himmelsseite (H-K11b): zwei Bergketten vor durchsichtigem Himmel, Horizont bei h/2, Lichter im nahen Hang
        5 => {
            let zacke = |x: i64, p: i64, v: i64| {
                let p = p.max(1);
                p - (2 * ((x + v) % p) - p).abs()
            };
            let (p1, p2, p3) = ((b / 3).max(1), (b / 11).max(1), (b / 5).max(1));
            let fern = h / 2 - h * zacke(x, p1, b / 7) / (6 * p1) - h * zacke(x, p2, b / 3) / (18 * p2);
            let nah = h / 2 + h / 40 - h * zacke(x, p3, b / 2) / (12 * p3);
            if y >= nah {
                if (x * 31 + y * 17) % 211 == 0 && y < h * 3 / 5 {
                    return [255, 204, 120, 255];
                }
                return [36, 32, 62, 255];
            }
            if y >= fern {
                return if y == fern { [74, 66, 116, 170] } else { [74, 66, 116, 255] };
            }
            [0, 0, 0, 0]
        }
        // Relief (Material-Zusatz): Halbkugel-Noppen je 32-px-Feld, Normale (ex, −ey, nz)/r auf 0 … 255, Rauheit in Bändern
        6 => {
            let ex = 2 * (x % 32) + 1 - 32;
            let ey = 2 * (y % 32) + 1 - 32;
            let r = 26;
            let rauh = (30 + (y / 32 % 8) * 28) as u8;
            let d2 = ex * ex + ey * ey;
            if d2 >= r * r {
                return [128, 128, rauh, 255];
            }
            // z ergibt der Shader aus x, y (√(1 − x² − y²))
            [((ex + r) * 255 / (2 * r)) as u8, ((r - ey) * 255 / (2 * r)) as u8, (rauh / 2), 255]
        }
        // Steinplatten: Fugen 3 px dunkel, Plattengrau je Feld
        7 => {
            let (lx, ly) = (x % 64, y % 64);
            if lx < 3 || ly < 3 {
                return [52, 50, 48, 255];
            }
            let g = (118 + ((x / 64) * 7 + (y / 64) * 13) % 5 * 14) as u8;
            [g, g - 4, g - 10, 255]
        }
        // H-K26: Normal-Karte (Fasen an 64-px-Fliesen, x, y, z)
        8 => {
            let (lx, ly) = (x % 64, y % 64);
            if lx < 8 {
                [52, 128, 230, 255]
            } else if lx >= 56 {
                [204, 128, 230, 255]
            } else if ly < 8 {
                [128, 204, 230, 255]
            } else if ly >= 56 {
                [128, 52, 230, 255]
            } else {
                [128, 128, 255, 255]
            }
        }
        // Stoff: R Verdeckung in den Fugen, G Rauheit je Fliese, B Metall jede zweite
        9 => {
            let (lx, ly, f) = (x % 64, y % 64, x / 64 + y / 64);
            [if lx < 6 || ly < 6 { 70 } else { 255 }, (30 + (f % 4) * 70) as u8, ((f % 2) * 255) as u8, 255]
        }
        // Leucht: Streifen und Punkte auf Schwarz
        10 => {
            if y % 32 < 4 {
                [255, 140, 40, 255]
            } else if (x / 16 + y / 16) % 7 == 0 && x % 16 < 6 && y % 16 < 6 {
                [80, 200, 255, 255]
            } else {
                [0, 0, 0, 255]
            }
        }
        // Laub: Blatt je 64-px-Feld, Rand halb durchsichtig, außen leer
        11 => {
            let (ex, ey) = (2 * (x % 64) + 1 - 64, 2 * (y % 64) + 1 - 64);
            let q = ex * ex * 4 + ey * ey;
            if q >= 62 * 62 {
                [40, 90, 30, 0]
            } else if q >= 54 * 54 {
                [50, 110, 36, 100]
            } else if (-2..=2).contains(&ex) {
                [150, 200, 90, 255]
            } else {
                [(60 + (x / 64 * 13 + y / 64 * 7) % 5 * 12) as u8, 140, 50, 255]
            }
        }
        _ => [255, 255, 255, 255],
    }
}

/// Modellteig aus einer Datei (H-K16): beginnt sie mit `TEIGMODL`, so wie sie ist; sonst `.glb`/`.gltf` mit den Nachbardateien,
/// die `herd_teigling::gltf::braucht` nennt (fehlende bleiben weg → Fehler-Modellteig), über das Quellpaket vorgebacken – wie die
/// JS-Hülle `site/js/herd/teigling.js`.
pub fn modell_aus_datei(pfad: &str) -> Result<Vec<u8>, String> {
    // relative Pfade gelten ab dem Arbeitsordner, sonst ab dem ersten Elternordner, in dem es sie gibt (Szenen nennen Pfade ab der
    // Repo-Wurzel; `cargo test` läuft im Crate-Ordner)
    let mut basis = std::path::PathBuf::new();
    if !std::path::Path::new(pfad).is_absolute() {
        for hoch in ["", "..", "../..", "../../.."] {
            if std::path::Path::new(hoch).join(pfad).exists() {
                basis = std::path::PathBuf::from(hoch);
                break;
            }
        }
    }
    let voll = basis.join(pfad);
    let pfad = voll.to_string_lossy().into_owned();
    let pfad = pfad.as_str();
    let haupt = std::fs::read(pfad).map_err(|e| e.to_string())?;
    if haupt.starts_with(b"TEIGMODL") {
        return Ok(haupt);
    }
    let norm = pfad.replace('\\', "/");
    let mut dateien: Vec<(String, Vec<u8>)> = Vec::new();
    for (uri, p) in herd_teigling::gltf::braucht(&norm, &haupt) {
        if let Ok(b) = std::fs::read(&p) {
            dateien.push((uri, b));
        }
    }
    let refs: Vec<(&str, &[u8])> = dateien.iter().map(|(u, b)| (u.as_str(), b.as_slice())).collect();
    Ok(herd_teigling::modell::vorbacken(&herd_teigling::gltf::quellpaket(&haupt, &refs)))
}

/// Teigling (Format v1, `herd_teigling::teigling_aus`: Mipmaps wie der Vorbacker, SHA-256 im Kopf = 0) aus Muster `m`.
pub fn muster_teigling(m: u32, b: u32, h: u32) -> Vec<u8> {
    let mut rgba = Vec::with_capacity((b * h * 4) as usize);
    for y in 0..h as i64 {
        for x in 0..b as i64 {
            rgba.extend_from_slice(&muster_pixel(m, x, y, b as i64, h as i64));
        }
    }
    herd_teigling::teigling_aus(&herd_teigling::Bild { breite: b, hoehe: h, rgba }, false, &[0; 32])
}

/// Rückgabewert eines Aufrufs.
#[derive(Clone, Debug, PartialEq)]
pub enum Wert {
    I(i32),
    F(f64),
    T(Vec<u8>),
    U(Vec<u32>),
    D(Vec<f64>),
    H(String),
}

impl Wert {
    /// Kanonische Textform (identisch in `skript.js`): i32 dezimal, f64 als 16 Hex-Ziffern der Bits, Text als JSON.
    pub fn text(&self) -> String {
        match self {
            Wert::I(x) => x.to_string(),
            Wert::F(x) => format!("f{:016x}", x.to_bits()),
            Wert::T(b) => {
                let s = String::from_utf8_lossy(b);
                let mut o = String::from("\"");
                for c in s.chars() {
                    match c {
                        '"' => o.push_str("\\\""),
                        '\\' => o.push_str("\\\\"),
                        '\n' => o.push_str("\\n"),
                        c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
                        c => o.push(c),
                    }
                }
                o.push('"');
                o
            }
            Wert::U(v) => format!("[{}]", v.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(",")),
            // f64-Liste: je Eintrag wie `F`, NaN kanonisch (JS kann NaN-Bits beim Lesen verändern)
            Wert::D(v) => format!(
                "[{}]",
                v.iter().map(|x| format!("f{:016x}", if x.is_nan() { 0x7FF8_0000_0000_0000u64 } else { x.to_bits() })).collect::<Vec<_>>().join(",")
            ),
            Wert::H(h) => h.clone(),
        }
    }
    pub fn zahl(&self) -> f64 {
        match self {
            Wert::I(x) => *x as f64,
            Wert::F(x) => *x,
            _ => 0.0,
        }
    }
}

/// Empfänger der Ergebnisse.
pub trait Ausgabe {
    /// nach jedem ABI-Aufruf
    fn ruf(&mut self, _zeile: usize, _name: &str, _wert: &Wert) {}
    /// nach jedem `bild` (Paket liegt in `kern.paket()`)
    fn bild(&mut self, _kern: &mut Kern, _nr: u32) {}
    /// Takt (für Messungen: vorher/nachher)
    fn vor_takt(&mut self) {}
    fn nach_takt(&mut self) {}
    fn vor_bild(&mut self) {}
}

/// Spielt Skripte gegen einen Kern.
pub struct Spieler {
    pub kern: Kern,
    pub vars: BTreeMap<String, f64>,
    /// Bildnummer des letzten `bild`
    pub nr: u32,
    gesetzt: BTreeMap<String, f64>,
}

fn texte(v: &[&str]) -> Vec<u8> {
    let mut b = Vec::new();
    for t in v {
        b.extend_from_slice(&(t.len() as u32).to_le_bytes());
        b.extend_from_slice(t.as_bytes());
    }
    b
}

impl Spieler {
    /// `vorgaben` überschreiben `vorgabe`-Zeilen (Kommandozeile `N=100`).
    pub fn neu(vorgaben: &[(String, f64)]) -> Spieler {
        Spieler { kern: Kern::neu(), vars: BTreeMap::new(), nr: 0, gesetzt: vorgaben.iter().cloned().collect() }
    }

    pub fn spiele(&mut self, s: &Skript, aus: &mut dyn Ausgabe) -> Result<(), String> {
        self.block(&s.befehle, aus)
    }

    fn block(&mut self, bs: &[Befehl], aus: &mut dyn Ausgabe) -> Result<(), String> {
        for b in bs {
            match b {
                Befehl::Vorgabe { var, wert } => {
                    let w = self.gesetzt.get(var).copied().unwrap_or(*wert);
                    self.vars.insert(var.clone(), w);
                }
                Befehl::Setze { zeile, var, wert } => {
                    let w = rechne(wert, &self.vars, *zeile)?;
                    self.vars.insert(var.clone(), w);
                }
                Befehl::Wiederhole { zeile, anzahl, var, rumpf } => {
                    let n = rechne(anzahl, &self.vars, *zeile)?;
                    let mut i = 0.0;
                    while i < n {
                        if let Some(v) = var {
                            self.vars.insert(v.clone(), i);
                        }
                        self.block(rumpf, aus)?;
                        i += 1.0;
                    }
                }
                Befehl::Takte { zeile, anzahl } => {
                    let n = rechne(anzahl, &self.vars, *zeile)?;
                    let mut i = 0.0;
                    while i < n {
                        aus.vor_takt();
                        let r = self.kern.takt();
                        aus.nach_takt();
                        aus.ruf(*zeile, "takt", &Wert::I(r));
                        self.bild(*zeile, None, aus);
                        i += 1.0;
                    }
                }
                Befehl::Ruf { zeile, name, args, ziel } => {
                    let w = if name == "bild" {
                        let nr = match args.first() {
                            Some(Arg::Wert(a)) => Some(zu_i32(rechne(a, &self.vars, *zeile)?) as u32),
                            _ => None,
                        };
                        self.bild(*zeile, nr, aus)
                    } else {
                        let ist_takt = name == "takt";
                        if ist_takt {
                            aus.vor_takt();
                        }
                        let w = self.ruf(*zeile, name, args)?;
                        if ist_takt {
                            aus.nach_takt();
                        }
                        aus.ruf(*zeile, name, &w);
                        w
                    };
                    if let Some(z) = ziel {
                        self.vars.insert(z.clone(), w.zahl());
                    }
                }
            }
        }
        Ok(())
    }

    fn bild(&mut self, zeile: usize, nr: Option<u32>, aus: &mut dyn Ausgabe) -> Wert {
        self.nr = nr.unwrap_or(self.nr + 1);
        aus.vor_bild();
        let n = self.kern.bild(self.nr as i32);
        let w = Wert::I(n);
        aus.ruf(zeile, "bild", &w);
        aus.bild(&mut self.kern, self.nr);
        w
    }

    fn ruf(&mut self, zeile: usize, name: &str, args: &[Arg]) -> Result<Wert, String> {
        let sig = SIGNATUREN.iter().find(|s| s.0 == name).ok_or_else(|| format!("Zeile {}: {}", zeile, name))?;
        let v = &self.vars;
        let zahl = |k: usize| -> Result<f64, String> {
            match &args[k] {
                Arg::Wert(a) => rechne(a, v, zeile),
                _ => fehler(zeile, format!("Argument {} von {} muss eine Zahl sein", k + 1, name)),
            }
        };
        let i = |k: usize| zahl(k).map(zu_i32);
        let t = |k: usize| -> Result<Vec<u8>, String> {
            match &args[k] {
                Arg::Text(s) => Ok(s.as_bytes().to_vec()),
                _ => fehler(zeile, format!("Argument {} von {} muss ein Text sein", k + 1, name)),
            }
        };
        let zahlen = |k: usize| -> Result<Vec<f64>, String> {
            match &args[k] {
                Arg::Liste(l) => l
                    .iter()
                    .map(|a| match a {
                        Arg::Wert(x) => rechne(x, v, zeile),
                        _ => fehler(zeile, "Liste aus Zahlen erwartet"),
                    })
                    .collect(),
                Arg::Folge(anzahl, var, wert) => {
                    let n = rechne(anzahl, v, zeile)?;
                    let mut vars = v.clone();
                    let mut aus = Vec::new();
                    let mut i = 0.0;
                    while i < n {
                        vars.insert(var.clone(), i);
                        aus.push(rechne(wert, &vars, zeile)?);
                        i += 1.0;
                    }
                    Ok(aus)
                }
                _ => fehler(zeile, "Liste erwartet"),
            }
        };
        let strings = |k: usize| -> Result<Vec<String>, String> {
            let mut aus = Vec::new();
            fn flach(a: &Arg, aus: &mut Vec<String>, z: usize) -> Result<(), String> {
                match a {
                    Arg::Text(s) => aus.push(s.clone()),
                    Arg::Liste(l) => {
                        for x in l {
                            flach(x, aus, z)?;
                        }
                    }
                    _ => return fehler(z, "Liste aus Texten erwartet"),
                }
                Ok(())
            }
            match &args[k] {
                Arg::Liste(l) => {
                    for x in l {
                        flach(x, &mut aus, zeile)?;
                    }
                }
                _ => return fehler(zeile, "Liste erwartet"),
            }
            Ok(aus)
        };
        let _ = sig;
        let k = &mut self.kern;
        Ok(match name {
            "abi_version" => Wert::I(1),
            "fehler_art" => Wert::I(k.fehler_art()),
            "fehler_code" => Wert::I(k.fehler_code()),
            "fehler_neu" => Wert::I(k.fehler_neu()),
            "fehler_text" => Wert::T(k.fehler_text().as_bytes().to_vec()),
            "melde_typfehler" => Wert::I(k.melde_typfehler(i(0)?, i(1)?, &t(2)?)),
            "welt_neu" => Wert::I(k.welt_neu(zahl(0)?, zahl(1)?, &t(2)?)),
            "welt_titel" => Wert::I(k.welt_titel(&t(0)?)),
            "welt_hintergrund" => Wert::I(k.welt_hintergrund(&t(0)?)),
            "welt_himmel" => Wert::I(k.welt_himmel(&t(0)?, &t(1)?)),
            "welt_umgebung" => Wert::I(k.welt_umgebung(&t(0)?, zahl(1)?)),
            "welt_nebel" => Wert::I(k.welt_nebel(&t(0)?, zahl(1)?, zahl(2)?)),
            "welt_hole" => Wert::F(k.welt_hole(i(0)?)),
            "teil_neu" => Wert::I(k.teil_neu(i(0)?)),
            "teil_entferne" => Wert::I(k.teil_entferne(i(0)?)),
            "teil_kopie" => Wert::I(k.teil_kopie(i(0)?)),
            "teil_haenge" => Wert::I(k.teil_haenge(i(0)?, i(1)?)),
            "teil_kinder" => {
                let teil = i(0)?;
                let mut kap = 16usize;
                loop {
                    let mut b = vec![0u32; kap];
                    let n = k.teil_kinder(teil, &mut b);
                    if n < 0 {
                        break Wert::I(n);
                    }
                    if n as usize <= kap {
                        b.truncate(n as usize);
                        break Wert::U(b);
                    }
                    kap = n as usize;
                }
            }
            "teil_setze" => Wert::I(k.teil_setze(i(0)?, i(1)?, zahl(2)?)),
            "teil_hole" => Wert::F(k.teil_hole(i(0)?, i(1)?)),
            "teil_lage" => Wert::I(k.teil_lage(i(0)?, zahl(1)?, zahl(2)?, zahl(3)?)),
            "teil_verschiebe" => Wert::I(k.teil_verschiebe(i(0)?, zahl(1)?, zahl(2)?, zahl(3)?)),
            "teil_groesse" => Wert::I(k.teil_groesse(i(0)?, zahl(1)?, zahl(2)?, zahl(3)?)),
            "teil_schaue" => Wert::I(k.teil_schaue(i(0)?, zahl(1)?, zahl(2)?, zahl(3)?)),
            "teil_trifft" => Wert::I(k.teil_trifft(i(0)?, i(1)?)),
            "komp_neu" => Wert::I(k.komp_neu(i(0)?)),
            "komp_haenge" => Wert::I(k.komp_haenge(i(0)?, i(1)?)),
            "komp_loese" => Wert::I(k.komp_loese(i(0)?)),
            "komp_von" => Wert::I(k.komp_von(i(0)?, i(1)?)),
            "komp_info" => Wert::I(k.komp_info(i(0)?, i(1)?)),
            "typ_nummer" => Wert::I(k.typ_nummer(&t(0)?)),
            "feld_nummer" => Wert::I(k.feld_nummer(i(0)?, &t(1)?)),
            "setze_zahl" => Wert::I(k.setze_zahl(i(0)?, i(1)?, zahl(2)?)),
            "hole_zahl" => Wert::F(k.hole_zahl(i(0)?, i(1)?)),
            "setze_text" => Wert::I(k.setze_text(i(0)?, i(1)?, &t(2)?)),
            "hole_text" => {
                let (a, b) = (i(0)?, i(1)?);
                let mut kap = 64usize;
                loop {
                    let mut buf = vec![0u8; kap];
                    let n = k.hole_text(a, b, &mut buf);
                    if n < 0 {
                        break Wert::I(n);
                    }
                    if n as usize <= kap {
                        buf.truncate(n as usize);
                        break Wert::T(buf);
                    }
                    kap = n as usize;
                }
            }
            "setze_liste" => {
                let ids: Vec<u32> = zahlen(2)?.into_iter().map(|x| zu_i32(x) as u32).collect();
                Wert::I(k.setze_liste(i(0)?, i(1)?, &ids))
            }
            "hole_liste" => {
                let (a, b) = (i(0)?, i(1)?);
                let mut kap = 16usize;
                loop {
                    let mut buf = vec![0u32; kap];
                    let n = k.hole_liste(a, b, &mut buf);
                    if n < 0 {
                        break Wert::I(n);
                    }
                    if n as usize <= kap {
                        buf.truncate(n as usize);
                        break Wert::U(buf);
                    }
                    kap = n as usize;
                }
            }
            "setze_zahlen" => {
                let z = zahlen(2)?;
                Wert::I(k.setze_zahlen(i(0)?, i(1)?, &z))
            }
            "hole_zahlen" => {
                let (a, b) = (i(0)?, i(1)?);
                let mut kap = 16usize;
                loop {
                    let mut buf = vec![0f64; kap];
                    let n = k.hole_zahlen(a, b, &mut buf);
                    if n < 0 {
                        break Wert::I(n);
                    }
                    if n as usize <= kap {
                        buf.truncate(n as usize);
                        break Wert::D(buf);
                    }
                    kap = n as usize;
                }
            }
            "form_grund" => Wert::I(k.form_grund(i(0)?, zahl(1)?, zahl(2)?)),
            "form_eigene" => Wert::I(k.form_eigene(&zahlen(0)?, &zahlen(1)?, i(2)?)),
            "bildchen_neu" => {
                let z = strings(0)?;
                let f = strings(1)?;
                let zr: Vec<&str> = z.iter().map(|s| s.as_str()).collect();
                let fr: Vec<&str> = f.iter().map(|s| s.as_str()).collect();
                Wert::I(k.bildchen_neu(&texte(&zr), &texte(&fr)))
            }
            "bildchen_rgba" => {
                let b: Vec<u8> = zahlen(2)?.into_iter().map(|x| zu_i32(x) as u8).collect();
                Wert::I(k.bildchen_rgba(i(0)?, i(1)?, &b))
            }
            "bildchen_teigling" => {
                let b: Vec<u8> = zahlen(0)?.into_iter().map(|x| zu_i32(x) as u8).collect();
                Wert::I(k.bildchen_teigling(&b))
            }
            "teigling_muster" => {
                let (m, b, h) = (i(0)?, i(1)?, i(2)?);
                if !(1..=2048).contains(&b) || !(1..=2048).contains(&h) {
                    return fehler(zeile, "teigling_muster: Breite und Höhe 1 … 2048");
                }
                Wert::I(k.bildchen_teigling(&muster_teigling(m as u32, b as u32, h as u32)))
            }
            "teigling_datei" => {
                let pfad = String::from_utf8_lossy(&t(0)?).into_owned();
                match std::fs::read(&pfad) {
                    Ok(b) => Wert::I(k.bildchen_teigling(&b)),
                    Err(e) => return fehler(zeile, format!("teigling_datei: {}: {}", pfad, e)),
                }
            }
            "ressource_hole" => Wert::F(k.ressource_hole(i(0)?, i(1)?)),
            "modell_teig" => {
                let b: Vec<u8> = zahlen(0)?.into_iter().map(|x| zu_i32(x) as u8).collect();
                Wert::I(k.modell_teig(&b))
            }
            "modell_datei" => {
                let pfad = String::from_utf8_lossy(&t(0)?).into_owned();
                match modell_aus_datei(&pfad) {
                    Ok(b) => Wert::I(k.modell_teig(&b)),
                    Err(e) => return fehler(zeile, format!("modell_datei: {}: {}", pfad, e)),
                }
            }
            "modell_teil" => Wert::I(k.modell_teil(i(0)?, zahl(1)?, zahl(2)?, zahl(3)?)),
            "modell_info" => Wert::F(k.modell_info(i(0)?, i(1)?)),
            "modell_text" => {
                let (a, b, c) = (i(0)?, i(1)?, i(2)?);
                let mut kap = 64usize;
                loop {
                    let mut buf = vec![0u8; kap];
                    let n = k.modell_text(a, b, c, &mut buf);
                    if n < 0 {
                        break Wert::I(n);
                    }
                    if n as usize <= kap {
                        buf.truncate(n as usize);
                        break Wert::T(buf);
                    }
                    kap = n as usize;
                }
            }
            "teil_finde" => Wert::I(k.teil_finde(i(0)?, &t(1)?)),
            "eingabe" => Wert::I(k.eingabe(zahl(0)?, zahl(1)?, i(2)?)),
            "takt" => Wert::I(k.takt()),
            "paket_voll" => Wert::I(k.paket_voll()),
            "hash_szene" => Wert::H(String::from_utf8(herd_kern::hash::hex(k.hash_szene()).to_vec()).unwrap()),
            "hash_paket" => Wert::H(String::from_utf8(herd_kern::hash::hex(k.hash_paket()).to_vec()).unwrap()),
            "schema_json" => Wert::T(k.schema_json().into_bytes()),
            _ => return fehler(zeile, format!("unbekannter Aufruf '{}'", name)),
        })
    }
}

/// Ausgabe als Textzeilen (Format von `herd-skript` und `skript.js`): `<zeile> <name> <wert>` je Aufruf,
/// nach jedem Bild `B <nr> <szene> <paket>`.
#[derive(Default)]
pub struct Zeilen {
    pub zeilen: Vec<String>,
    /// nur Bild-Zeilen
    pub nur_bilder: bool,
}

impl Ausgabe for Zeilen {
    fn ruf(&mut self, zeile: usize, name: &str, wert: &Wert) {
        if !self.nur_bilder {
            self.zeilen.push(format!("{} {} {}", zeile, name, wert.text()));
        }
    }
    fn bild(&mut self, kern: &mut Kern, nr: u32) {
        let s = herd_kern::hash::hex(kern.hash_szene());
        let p = herd_kern::hash::hex(kern.hash_paket());
        self.zeilen.push(format!("B {} {} {}", nr, std::str::from_utf8(&s).unwrap(), std::str::from_utf8(&p).unwrap()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zufall_und_int32_wie_js() {
        // Werte aus Node: (x >>> 0) und das Mischen in skript.js
        assert_eq!(zu_i32(4294967295.0), -1);
        assert_eq!(zu_i32(-1.5), -1);
        assert_eq!(zu_i32(2147483648.0), -2147483648);
        assert_eq!(zu_i32(f64::NAN), 0);
        let z = zufall(1.0);
        assert!((0.0..1.0).contains(&z));
        assert_ne!(zufall(1.0), zufall(2.0));
    }

    #[test]
    fn liest_und_spielt() {
        let s = lies(
            "vorgabe N 3\nwelt_neu 640 360 \"T\"\ntyp_nummer \"Kreis\" -> kreis\nwiederhole N i\n  teil_neu 2 -> t\n  teil_lage t (i * 10 + 5) (zufall(i) * 360) 0\n  komp_neu kreis -> k\n  komp_haenge k t\nende\nbildchen_neu [\"tt\", \"t.\"] [[\"x\", \"#fff\"]]\ntakte 2\n",
        )
        .unwrap();
        let mut sp = Spieler::neu(&[("N".into(), 5.0)]);
        let mut aus = Zeilen::default();
        sp.spiele(&s, &mut aus).unwrap();
        assert_eq!(sp.kern.welt_hole(5), 7.0);
        assert_eq!(aus.zeilen.iter().filter(|z| z.starts_with("B ")).count(), 2);
    }

    #[test]
    fn folge_erzeugt_zahlenlisten() {
        let s = lies("vorgabe N 4
setze a = 10
welt_neu 640 360 \"T\"
typ_nummer \"Vieleck\" -> v
feld_nummer v \"punkte\" -> p
komp_neu v -> c
setze_zahlen c p [folge (N * 2) i (i % 3 + a)]
hole_zahlen c p
setze_zahlen c p [ folge 0 i 1 ]
hole_zahlen c p
").unwrap();
        let mut sp = Spieler::neu(&[]);
        let mut aus = Zeilen::default();
        sp.spiele(&s, &mut aus).unwrap();
        let f = |x: f64| format!("f{:016x}", x.to_bits());
        let soll = format!("[{}]", [10.0, 11.0, 12.0, 10.0, 11.0, 12.0, 10.0, 11.0].map(f).join(","));
        assert!(aus.zeilen.iter().any(|z| z.ends_with(&format!("hole_zahlen {}", soll))), "{:?}", aus.zeilen);
        assert!(aus.zeilen.iter().any(|z| z.ends_with("hole_zahlen []")), "{:?}", aus.zeilen);
        assert!(lies("setze_zahlen 1 2 [folge 3 i]
").is_err());
    }

    #[test]
    fn alle_szenen_laufen_fehlerfrei() {
        let ordner = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/herd/szenen");
        let mut n = 0;
        for e in std::fs::read_dir(&ordner).unwrap() {
            let p = e.unwrap().path();
            if p.extension().map(|x| x == "herd").unwrap_or(false) {
                let s = lies(&std::fs::read_to_string(&p).unwrap()).unwrap_or_else(|f| panic!("{}: {}", p.display(), f));
                // klein: Vorgaben der Datei, höchstens wenige Takte
                let mut sp = Spieler::neu(&[("TAKTE".into(), 3.0)]);
                let mut aus = Zeilen { nur_bilder: true, ..Default::default() };
                sp.spiele(&s, &mut aus).unwrap_or_else(|f| panic!("{}: {}", p.display(), f));
                assert!(!aus.zeilen.is_empty(), "{}: kein Bild", p.display());
                n += 1;
            }
        }
        assert!(n >= 5);
    }
}
