//! Klang-Erzeuger (HERD.md §12.4 H-K14, SPEC §18.8, K-153): Töne, Rauschen, Noten, Hüllkurven, Filter, Mischen →
//! **PCM 48 kHz, mono, i16** (Little Endian); dazu geladene Klänge aus Klangteigen (H-K19a: WAV/FLAC, ihre Rate 8 … 96 kHz,
//! mono oder stereo verschachtelt – nur abspielbar, nicht formbar). `no_std` + `alloc` + `libm`, Zustand in f64, keine FMA – dieselben Samples
//! nativ (Host) und als `site/js/herd/klang.wasm` (Interpreter, Wasm-Programm, Browser). Geprüft wird über den FNV-1a-64-Hash
//! der PCM-Bytes ([`Klaenge::hash`]); Hörbares (Mischen, Raum, Gerät) ist nicht Teil der Bitgleichheit.
//!
//! Ein Klang ist unveränderlich: jede Formung (`huelle`, `tiefpass`, `mische`, …) legt einen **neuen** Klang an. IDs beginnen
//! bei 1 und werden nie wiederverwendet; zusammen höchstens [`MAX_GESAMT`] Samples (5 Minuten). Fehler liefern Art
//! (1 TypAnanas, 2 LaufzeitAnanas) und Text – die Texte stehen nur hier.
//!
//! Außerdem [`raum`]: Lautstärke, Panorama und Dämpfung einer räumlichen Spur relativ zum Hörer – die gemeinsame Formel der
//! Wiedergabe (nativer Host, Browser `site/js/klang/spieler.js`), nicht bitgleich geprüft.

#![no_std]

extern crate alloc;

use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;

mod zahl;
pub use zahl::zahl_text;

/// Abtastrate (Hz).
pub const RATE: usize = 48_000;
/// Längster einzelner erzeugter Ton/Rauschen/Stille (Sekunden).
pub const MAX_DAUER: f64 = 60.0;
/// Höchstens so viele Samples aller Klänge zusammen (5 Minuten).
pub const MAX_GESAMT: usize = 300 * RATE;
/// Fehlerart TypAnanas.
pub const ART_TYP: i32 = 1;
/// Fehlerart LaufzeitAnanas.
pub const ART_LAUFZEIT: i32 = 2;

/// Wellenformen (`welle:`).
pub const WELLEN: [&str; 5] = ["sinus", "rechteck", "saege", "dreieck", "rauschen"];
/// Rauscharten (`art:`).
pub const RAUSCHEN: [&str; 3] = ["weiss", "rosa", "braun"];

/// Fehler eines Aufrufs: Art (1 TypAnanas, 2 LaufzeitAnanas) und fertiger Text.
#[derive(Debug, Clone, PartialEq)]
pub struct Fehler {
    pub art: i32,
    pub text: String,
}

fn laufzeit(text: String) -> Fehler {
    Fehler { art: ART_LAUFZEIT, text }
}

/// Ergebnis: Klang-ID (ab 1) oder Fehler.
pub type Erg = Result<u32, Fehler>;

/// Ein Klang: Samples (bei Stereo verschachtelt), Abtastrate, Kanäle; `geladen` = aus einem Klangteig (H-K19a).
struct Eintrag {
    pcm: Vec<i16>,
    rate: u32,
    kanaele: u8,
    geladen: bool,
}

/// Alle Klänge eines Laufs.
#[derive(Default)]
pub struct Klaenge {
    pcm: Vec<Eintrag>,
    gesamt: usize,
}

// ---------------------------------------------------------------- Hilfen

fn bereich(wo: &str, was: &str, w: f64, min: f64, max: f64, einheit: &str) -> Result<f64, Fehler> {
    if w.is_finite() && w >= min && w <= max {
        return Ok(w);
    }
    Err(laufzeit(format!(
        "{}() braucht {} von {} bis {}{}, nicht {}.",
        wo,
        was,
        zahl_text(min),
        zahl_text(max),
        einheit,
        zahl_text(w)
    )))
}

fn dauer_pruefen(wo: &str, d: f64) -> Result<usize, Fehler> {
    if !(d.is_finite() && d > 0.0 && d <= MAX_DAUER) {
        return Err(laufzeit(format!(
            "{}() braucht eine Dauer über 0 bis {} Sekunden, nicht {}.",
            wo,
            zahl_text(MAX_DAUER),
            zahl_text(d)
        )));
    }
    let n = libm::round(d * RATE as f64) as usize;
    Ok(if n < 1 { 1 } else { n })
}

/// Zeit (Sekunden) → Samples, gerundet, nie negativ.
fn samples(t: f64) -> usize {
    if t > 0.0 {
        libm::round(t * RATE as f64) as usize
    } else {
        0
    }
}

/// f64 (−1 … 1) → i16, gerundet und geklemmt.
fn q(x: f64) -> i16 {
    let v = libm::round(x * 32767.0);
    if v > 32767.0 {
        32767
    } else if v < -32768.0 {
        -32768
    } else if v != v {
        0
    } else {
        v as i16
    }
}

fn f(s: i16) -> f64 {
    s as f64 / 32767.0
}

/// Lineare Ein- und Ausblendung (anschlag/ausklang in Samples) auf n Samples: Faktor bei i.
fn rampe(i: usize, n: usize, an: usize, aus: usize) -> f64 {
    let mut g = 1.0;
    if an > 0 && i < an {
        g = i as f64 / an as f64;
    }
    if aus > 0 && i + aus >= n {
        let r = (n - i) as f64 / aus as f64;
        if r < g {
            g = r;
        }
    }
    g
}

/// Kern-Zufall: xorshift32, Saat 0 → 1.
struct Zufall(u32);
impl Zufall {
    fn neu(saat: u32) -> Zufall {
        let s = saat.wrapping_mul(2_654_435_761) ^ 0x9E37_79B9;
        Zufall(if s == 0 { 1 } else { s })
    }
    /// gleichverteilt in [−1, 1)
    fn wert(&mut self) -> f64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        (x as f64 / 2_147_483_648.0) - 1.0
    }
}

/// Biquad (RBJ-Kochbuch), Direktform I in f64.
struct Biquad {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl Biquad {
    fn neu(hoch: bool, frequenz: f64, guete: f64) -> Biquad {
        let w0 = 2.0 * core::f64::consts::PI * frequenz / RATE as f64;
        let c = libm::cos(w0);
        let alpha = libm::sin(w0) / (2.0 * guete);
        let a0 = 1.0 + alpha;
        let (b0, b1, b2) = if hoch {
            ((1.0 + c) / 2.0, -(1.0 + c), (1.0 + c) / 2.0)
        } else {
            ((1.0 - c) / 2.0, 1.0 - c, (1.0 - c) / 2.0)
        };
        Biquad {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: (-2.0 * c) / a0,
            a2: (1.0 - alpha) / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }
    fn schritt(&mut self, x: f64) -> f64 {
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

/// Wellenform-Nummer (1 … 5) aus dem Namen.
pub fn welle_nummer(name: &str) -> Result<u32, Fehler> {
    match WELLEN.iter().position(|w| *w == name) {
        Some(i) => Ok(i as u32 + 1),
        None => Err(laufzeit(format!(
            "Eine Welle '{}' gibt es nicht (sinus, rechteck, saege, dreieck, rauschen).",
            name
        ))),
    }
}

/// Wert einer Wellenform bei Phase ph (0 … 1).
fn welle(nr: u32, ph: f64, z: &mut Zufall) -> f64 {
    match nr {
        1 => libm::sin(2.0 * core::f64::consts::PI * ph),
        2 => {
            if ph < 0.5 {
                1.0
            } else {
                -1.0
            }
        }
        3 => 2.0 * ph - 1.0,
        4 => {
            let d = ph - 0.5;
            4.0 * (if d < 0.0 { -d } else { d }) - 1.0
        }
        _ => z.wert(),
    }
}

// ---------------------------------------------------------------- Noten

/// Frequenz einer Note: Buchstabe C D E F G A H (deutsch) bzw. B = H erniedrigt, `#` erhöht, `b` erniedrigt, Oktave 0 … 8
/// (A4 = 440 Hz, gleichstufig). Liefert None, wenn die Note keine ist.
fn note_frequenz(t: &str) -> Option<f64> {
    let b = t.as_bytes();
    if b.is_empty() {
        return None;
    }
    let mut halb: i32 = match b[0] {
        b'C' | b'c' => -9,
        b'D' | b'd' => -7,
        b'E' | b'e' => -5,
        b'F' | b'f' => -4,
        b'G' | b'g' => -2,
        b'A' | b'a' => 0,
        b'H' | b'h' => 2,
        b'B' | b'b' => 1,
        _ => return None,
    };
    let mut i = 1;
    while i < b.len() && (b[i] == b'#' || b[i] == b'b') {
        halb += if b[i] == b'#' { 1 } else { -1 };
        i += 1;
    }
    if i + 1 != b.len() || !b[i].is_ascii_digit() || b[i] > b'8' {
        return None;
    }
    let oktave = (b[i] - b'0') as i32;
    let n = halb + (oktave - 4) * 12;
    Some(440.0 * libm::pow(2.0, n as f64 / 12.0))
}

/// Länge in Vierteln aus „:2“, „:0.5“ (positiv, endlich).
fn note_laenge(t: &str) -> Option<f64> {
    let b = t.as_bytes();
    if b.is_empty() || b.len() > 12 {
        return None;
    }
    let mut ganz: u64 = 0;
    let mut teil: u64 = 0;
    let mut teiler: u64 = 1;
    let mut punkt = false;
    let mut ziffern = 0;
    for &c in b {
        if c == b'.' {
            if punkt {
                return None;
            }
            punkt = true;
        } else if c.is_ascii_digit() {
            ziffern += 1;
            if punkt {
                teil = teil * 10 + (c - b'0') as u64;
                teiler *= 10;
            } else {
                ganz = ganz * 10 + (c - b'0') as u64;
            }
        } else {
            return None;
        }
    }
    if ziffern == 0 {
        return None;
    }
    let l = ganz as f64 + teil as f64 / teiler as f64;
    if l > 0.0 && l <= 64.0 {
        Some(l)
    } else {
        None
    }
}

// ---------------------------------------------------------------- Klänge

impl Klaenge {
    pub fn neu() -> Klaenge {
        Klaenge::default()
    }

    /// Anzahl angelegter Klänge.
    pub fn anzahl(&self) -> usize {
        self.pcm.len()
    }

    /// Samples eines Klangs (None = unbekannte ID).
    pub fn pcm(&self, id: u32) -> Option<&[i16]> {
        if id == 0 {
            return None;
        }
        self.eintrag(id).map(|v| v.pcm.as_slice())
    }

    fn eintrag(&self, id: u32) -> Option<&Eintrag> {
        if id == 0 {
            return None;
        }
        self.pcm.get(id as usize - 1)
    }

    /// Abtastrate (Hz) eines Klangs: erzeugt 48 000, geladen die Rate der Datei.
    pub fn rate(&self, id: u32) -> Option<u32> {
        self.eintrag(id).map(|e| e.rate)
    }

    /// Kanäle eines Klangs (1 oder 2; erzeugt immer 1).
    pub fn kanaele(&self, id: u32) -> Option<u8> {
        self.eintrag(id).map(|e| e.kanaele)
    }

    /// Ist der Klang aus einer Datei geladen (`Klang.laden`)?
    pub fn geladen(&self, id: u32) -> Option<bool> {
        self.eintrag(id).map(|e| e.geladen)
    }

    /// Samples eines **erzeugten** Klangs für eine Formung `wo` – geladene Klänge formt der Erzeuger nicht (H-K19a,
    /// **Entscheidung**: andere Rate/Kanäle; die Spur kann Lautstärke, Tonhöhe, Panorama und Raum).
    fn hole_wo(&self, id: u32, wo: &str) -> Result<&[i16], Fehler> {
        match self.eintrag(id) {
            None => Err(laufzeit(format!("Interner Fehler im Klang: Klang {} gibt es nicht.", id))),
            Some(e) if e.geladen => Err(laufzeit(format!(
                "{}() geht nur mit erzeugten Klängen, nicht mit geladenen (Klang.laden) – spiele sie mit lautstaerke, tonhoehe und panorama.",
                wo
            ))),
            Some(e) => Ok(e.pcm.as_slice()),
        }
    }

    fn lege_an(&mut self, v: Vec<i16>) -> Erg {
        if self.gesamt + v.len() > MAX_GESAMT {
            return Err(laufzeit(String::from(
                "Die Klänge sind zusammen zu lang (höchstens 5 Minuten in einem Programm).",
            )));
        }
        self.gesamt += v.len();
        self.pcm.push(Eintrag { pcm: v, rate: RATE as u32, kanaele: 1, geladen: false });
        Ok(self.pcm.len() as u32)
    }

    fn platz(&self, n: usize) -> Result<(), Fehler> {
        if self.gesamt + n > MAX_GESAMT {
            return Err(laufzeit(String::from(
                "Die Klänge sind zusammen zu lang (höchstens 5 Minuten in einem Programm).",
            )));
        }
        Ok(())
    }

    /// Dauer in Sekunden.
    pub fn dauer(&self, id: u32) -> Option<f64> {
        self.eintrag(id).map(|e| (e.pcm.len() / e.kanaele as usize) as f64 / e.rate as f64)
    }

    /// FNV-1a-64 über die PCM-Bytes (i16 LE), als 16 Hex-Ziffern (klein).
    pub fn hash(&self, id: u32) -> Option<[u8; 16]> {
        self.pcm(id).map(hash_pcm)
    }

    /// `Klang.ton(frequenz, dauer, welle, lautstaerke, bis, anschlag, ausklang)`: Ton mit (exponentiellem) Gleiten von
    /// `frequenz` nach `bis` (0 = kein Gleiten), lineare Ein-/Ausblendung.
    #[allow(clippy::too_many_arguments)]
    pub fn ton(
        &mut self,
        frequenz: f64,
        dauer: f64,
        welle_name: &str,
        lautstaerke: f64,
        bis: f64,
        anschlag: f64,
        ausklang: f64,
    ) -> Erg {
        let wo = "ton";
        let nr = welle_nummer(welle_name)?;
        bereich(wo, "eine Frequenz", frequenz, 1.0, 20_000.0, " Hz")?;
        let n = dauer_pruefen(wo, dauer)?;
        bereich(wo, "eine Lautstärke", lautstaerke, 0.0, 1.0, "")?;
        if bis != 0.0 {
            bereich(wo, "für 'bis' eine Frequenz", bis, 1.0, 20_000.0, " Hz")?;
        }
        bereich(wo, "einen Anschlag", anschlag, 0.0, MAX_DAUER, " Sekunden")?;
        bereich(wo, "einen Ausklang", ausklang, 0.0, MAX_DAUER, " Sekunden")?;
        self.platz(n)?;
        let (an, aus) = (samples(anschlag), samples(ausklang));
        let faktor = if bis != 0.0 && bis != frequenz { libm::pow(bis / frequenz, 1.0 / n as f64) } else { 1.0 };
        let mut fr = frequenz;
        let mut ph = 0.0f64;
        let mut z = Zufall::neu(1);
        let mut v = Vec::with_capacity(n);
        for i in 0..n {
            let x = welle(nr, ph, &mut z) * lautstaerke * rampe(i, n, an, aus);
            v.push(q(x));
            ph += fr / RATE as f64;
            ph -= libm::floor(ph);
            fr *= faktor;
        }
        self.lege_an(v)
    }

    /// `Klang.rauschen(dauer, art, lautstaerke, anschlag, ausklang, saat)`: weißes, rosa (Kellet) oder braunes Rauschen.
    pub fn rauschen(&mut self, dauer: f64, art: &str, lautstaerke: f64, anschlag: f64, ausklang: f64, saat: f64) -> Erg {
        let wo = "rauschen";
        let nr = match RAUSCHEN.iter().position(|a| *a == art) {
            Some(i) => i,
            None => {
                return Err(laufzeit(format!("Ein Rauschen '{}' gibt es nicht (weiss, rosa, braun).", art)));
            }
        };
        let n = dauer_pruefen(wo, dauer)?;
        bereich(wo, "eine Lautstärke", lautstaerke, 0.0, 1.0, "")?;
        bereich(wo, "einen Anschlag", anschlag, 0.0, MAX_DAUER, " Sekunden")?;
        bereich(wo, "einen Ausklang", ausklang, 0.0, MAX_DAUER, " Sekunden")?;
        if !(saat.is_finite() && libm::floor(saat) == saat) {
            return Err(Fehler { art: ART_TYP, text: format!("rauschen() braucht eine Ganzzahl für 'saat', nicht {}.", zahl_text(saat)) });
        }
        self.platz(n)?;
        let (an, aus) = (samples(anschlag), samples(ausklang));
        let s = libm::fmod(saat, 4_294_967_296.0);
        let s = if s < 0.0 { s + 4_294_967_296.0 } else { s };
        let mut z = Zufall::neu(s as u32);
        let (mut b0, mut b1, mut b2, mut braun) = (0.0f64, 0.0f64, 0.0f64, 0.0f64);
        let mut v = Vec::with_capacity(n);
        for i in 0..n {
            let w = z.wert();
            let x = match nr {
                0 => w,
                1 => {
                    // Paul Kellet (sparsam): drei Pole + direkter Anteil, ≈ −3 dB je Oktave
                    b0 = 0.99765 * b0 + w * 0.099_046;
                    b1 = 0.963 * b1 + w * 0.296_516_4;
                    b2 = 0.57 * b2 + w * 1.052_691_3;
                    (b0 + b1 + b2 + w * 0.1848) * 0.2
                }
                _ => {
                    // integriert mit Leck, ≈ −6 dB je Oktave
                    braun = (braun + 0.02 * w) / 1.02;
                    braun * 3.5
                }
            };
            v.push(q(x * lautstaerke * rampe(i, n, an, aus)));
        }
        self.lege_an(v)
    }

    /// `Klang.stille(dauer)`.
    pub fn stille(&mut self, dauer: f64) -> Erg {
        let n = dauer_pruefen("stille", dauer)?;
        self.platz(n)?;
        let mut v = Vec::new();
        v.resize(n, 0);
        self.lege_an(v)
    }

    /// `Klang.noten(text, tempo, welle, lautstaerke)`: Noten durch Leerzeichen getrennt, z. B. „C4 E4 G4:2 - C5“;
    /// `:n` = Länge in Vierteln (Standard 1), `-` = Pause. Jede Note mit 5 ms Anschlag und 30 ms Ausklang.
    pub fn noten(&mut self, text: &str, tempo: f64, welle_name: &str, lautstaerke: f64) -> Erg {
        let wo = "noten";
        let nr = welle_nummer(welle_name)?;
        bereich(wo, "ein Tempo", tempo, 20.0, 400.0, " Schlägen je Minute")?;
        bereich(wo, "eine Lautstärke", lautstaerke, 0.0, 1.0, "")?;
        let viertel = 60.0 / tempo;
        let mut stuecke: Vec<(Option<f64>, usize)> = Vec::new();
        let mut gesamt = 0usize;
        for t in text.split(|c: char| c == ' ' || c == '\t' || c == '\n' || c == ',').filter(|t| !t.is_empty()) {
            let (kopf, laenge) = match t.split_once(':') {
                Some((k, l)) => match note_laenge(l) {
                    Some(x) => (k, x),
                    None => return Err(note_fehler(t)),
                },
                None => (t, 1.0),
            };
            let fr = if kopf == "-" {
                None
            } else {
                match note_frequenz(kopf) {
                    Some(x) => Some(x),
                    None => return Err(note_fehler(t)),
                }
            };
            let n = samples(laenge * viertel).max(1);
            gesamt += n;
            if gesamt as f64 > MAX_DAUER * RATE as f64 {
                return Err(laufzeit(format!("noten() ergibt mehr als {} Sekunden.", zahl_text(MAX_DAUER))));
            }
            stuecke.push((fr, n));
        }
        if stuecke.is_empty() {
            return Err(laufzeit(String::from("noten() braucht mindestens eine Note, z. B. \"C4 E4 G4\".")));
        }
        self.platz(gesamt)?;
        let (an, aus) = (samples(0.005), samples(0.03));
        let mut z = Zufall::neu(1);
        let mut v = Vec::with_capacity(gesamt);
        for (fr, n) in stuecke {
            match fr {
                None => v.resize(v.len() + n, 0),
                Some(fr) => {
                    let mut ph = 0.0f64;
                    for i in 0..n {
                        v.push(q(welle(nr, ph, &mut z) * lautstaerke * rampe(i, n, an, aus)));
                        ph += fr / RATE as f64;
                        ph -= libm::floor(ph);
                    }
                }
            }
        }
        self.lege_an(v)
    }

    /// `k.huelle(anschlag, abfall, halten, ausklang)`: ADSR – linear 0 → 1 in `anschlag`, 1 → `halten` in `abfall`,
    /// halten, in den letzten `ausklang` Sekunden auf 0.
    pub fn huelle(&mut self, id: u32, anschlag: f64, abfall: f64, halten: f64, ausklang: f64) -> Erg {
        let wo = "huelle";
        bereich(wo, "einen Anschlag", anschlag, 0.0, MAX_DAUER, " Sekunden")?;
        bereich(wo, "einen Abfall", abfall, 0.0, MAX_DAUER, " Sekunden")?;
        bereich(wo, "für 'halten' einen Pegel", halten, 0.0, 1.0, "")?;
        bereich(wo, "einen Ausklang", ausklang, 0.0, MAX_DAUER, " Sekunden")?;
        let a = self.hole_wo(id, wo)?;
        let n = a.len();
        self.platz(n)?;
        let (an, ab, aus) = (samples(anschlag), samples(abfall), samples(ausklang));
        let mut v = Vec::with_capacity(n);
        for (i, &s) in a.iter().enumerate() {
            let mut g = if i < an {
                i as f64 / an as f64
            } else if i < an + ab {
                1.0 + (halten - 1.0) * ((i - an) as f64 / ab as f64)
            } else {
                halten
            };
            if aus > 0 && i + aus >= n {
                g *= (n - i) as f64 / aus as f64;
            }
            v.push(q(f(s) * g));
        }
        self.lege_an(v)
    }

    /// `k.tiefpass(frequenz, guete)` / `k.hochpass(frequenz, guete)`: Biquad 12 dB je Oktave.
    pub fn filter(&mut self, id: u32, hoch: bool, frequenz: f64, guete: f64) -> Erg {
        let wo = if hoch { "hochpass" } else { "tiefpass" };
        bereich(wo, "eine Frequenz", frequenz, 10.0, 20_000.0, " Hz")?;
        bereich(wo, "eine Güte", guete, 0.1, 20.0, "")?;
        let a = self.hole_wo(id, wo)?;
        self.platz(a.len())?;
        let mut bq = Biquad::neu(hoch, frequenz, guete);
        let v: Vec<i16> = a.iter().map(|&s| q(bq.schritt(f(s)))).collect();
        self.lege_an(v)
    }

    /// `k.verstaerke(faktor)`: lauter/leiser (0 … 16), übersteuert wird geklemmt.
    pub fn verstaerke(&mut self, id: u32, faktor: f64) -> Erg {
        bereich("verstaerke", "einen Faktor", faktor, 0.0, 16.0, "")?;
        let a = self.hole_wo(id, "verstaerke")?;
        self.platz(a.len())?;
        let v: Vec<i16> = a.iter().map(|&s| q(f(s) * faktor)).collect();
        self.lege_an(v)
    }

    /// `a.mische(b, ab)`: b ab `ab` Sekunden in a hineingemischt (Summe, geklemmt); Länge = das längere Ende.
    pub fn mische(&mut self, a: u32, b: u32, ab: f64) -> Erg {
        bereich("mische", "für 'ab' eine Zeit", ab, 0.0, MAX_DAUER, " Sekunden")?;
        let x = self.hole_wo(a, "mische")?;
        let y = self.hole_wo(b, "mische")?;
        let s = samples(ab);
        let n = if x.len() > s + y.len() { x.len() } else { s + y.len() };
        self.platz(n)?;
        let mut v = Vec::with_capacity(n);
        for i in 0..n {
            let p = if i < x.len() { f(x[i]) } else { 0.0 };
            let r = if i >= s && i - s < y.len() { f(y[i - s]) } else { 0.0 };
            v.push(q(p + r));
        }
        self.lege_an(v)
    }

    /// `a.dann(b)`: b hinter a.
    pub fn dann(&mut self, a: u32, b: u32) -> Erg {
        let x = self.hole_wo(a, "dann")?;
        let y = self.hole_wo(b, "dann")?;
        self.platz(x.len() + y.len())?;
        let mut v = Vec::with_capacity(x.len() + y.len());
        v.extend_from_slice(x);
        v.extend_from_slice(y);
        self.lege_an(v)
    }

    /// `k.wiederhole(n)`: n-mal hintereinander (1 … 1000).
    pub fn wiederhole(&mut self, id: u32, n: f64) -> Erg {
        if !(n.is_finite() && libm::floor(n) == n) {
            return Err(Fehler { art: ART_TYP, text: format!("wiederhole() braucht eine Ganzzahl, nicht {}.", zahl_text(n)) });
        }
        bereich("wiederhole", "eine Anzahl", n, 1.0, 1000.0, "")?;
        let x = self.hole_wo(id, "wiederhole")?;
        let gesamt = x.len() * n as usize;
        self.platz(gesamt)?;
        let mut v = Vec::with_capacity(gesamt);
        for _ in 0..n as usize {
            v.extend_from_slice(x);
        }
        self.lege_an(v)
    }

    /// `k.nahtlos(ueberblendung)`: für Schleifen – das Ende wird über `ueberblendung` Sekunden (gleiche Leistung) in den
    /// Anfang geblendet; der neue Klang ist um die Überblendung kürzer und schließt ohne Knacken an sich selbst an.
    pub fn nahtlos(&mut self, id: u32, ueberblendung: f64) -> Erg {
        let x = self.hole_wo(id, "nahtlos")?;
        let c = samples(ueberblendung);
        if !(ueberblendung.is_finite() && c >= 1 && 2 * c <= x.len()) {
            return Err(laufzeit(format!(
                "nahtlos() braucht eine Überblendung über 0 bis zur halben Dauer ({} Sekunden), nicht {}.",
                zahl_text(x.len() as f64 / RATE as f64 / 2.0),
                zahl_text(ueberblendung)
            )));
        }
        let n = x.len() - c;
        self.platz(n)?;
        let mut v = Vec::with_capacity(n);
        let halb = core::f64::consts::PI / 2.0;
        for i in 0..n {
            if i < c {
                let w = i as f64 / c as f64;
                v.push(q(f(x[i]) * libm::sin(w * halb) + f(x[n + i]) * libm::cos(w * halb)));
            } else {
                v.push(x[i]);
            }
        }
        self.lege_an(v)
    }
}

// ---------------------------------------------------------------- Klangteig (H-K19a, K-163)

/// Magie des Klangteigs (Format: `herd/teigling/src/klang.rs`).
pub const TEIG_MAGIE: [u8; 8] = *b"TEIGKLNG";
/// Kopf des Klangteigs in Bytes.
pub const TEIG_KOPF: usize = 64;
/// Text für alles, was kein (gültiger) Klangteig ist – gleich dem Fehler-Klangteig Code 1 des Vorbackers.
pub const KEIN_KLANG: &str = "ist kein lesbarer Klang (WAV oder FLAC).";

fn u16_bei(t: &[u8], i: usize) -> Option<u16> {
    Some(u16::from_le_bytes([*t.get(i)?, *t.get(i + 1)?]))
}
fn u32_bei(t: &[u8], i: usize) -> Option<u32> {
    Some(u32::from_le_bytes([*t.get(i)?, *t.get(i + 1)?, *t.get(i + 2)?, *t.get(i + 3)?]))
}

/// Klangteig prüfen → Ok((Rate, Kanäle, PCM)) oder Err(Text ohne Pfad). Volle Kopfprüfung (Magie, Version, Art, Rate
/// 8 000 … 96 000, Kanäle 1 … 2, 1 … 600 × Rate Frames, Länge genau); ein Fehler-Klangteig liefert seinen eigenen Text.
fn lies_teig(t: &[u8]) -> Result<(u32, u8, Vec<i16>), String> {
    let kein = || String::from(KEIN_KLANG);
    if t.len() < TEIG_KOPF || t[0..8] != TEIG_MAGIE || u16_bei(t, 8) != Some(1) || t[11] != 0 {
        return Err(kein());
    }
    if t[10] == 255 {
        let n = u16_bei(t, 66).unwrap_or(0) as usize;
        let code = u16_bei(t, 64).unwrap_or(0);
        if code == 0 || t.len() != 68 + n {
            return Err(kein());
        }
        return match core::str::from_utf8(&t[68..]) {
            Ok(x) if !x.is_empty() => Err(String::from(x)),
            _ => Err(kein()),
        };
    }
    let rate = u32_bei(t, 48).unwrap_or(0);
    let kanaele = u16_bei(t, 52).unwrap_or(0);
    let frames = u32_bei(t, 56).unwrap_or(0) as u64;
    if t[10] != 0
        || !(8_000..=96_000).contains(&rate)
        || !(1..=2).contains(&kanaele)
        || frames == 0
        || frames > 600 * rate as u64
        || (t.len() - TEIG_KOPF) as u64 != frames * kanaele as u64 * 2
    {
        return Err(kein());
    }
    let v: Vec<i16> = t[TEIG_KOPF..].chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect();
    Ok((rate, kanaele as u8, v))
}

impl Klaenge {
    /// `Klang.laden(pfad)`: Klangteig (vorgebacken aus WAV/FLAC, `herd/teigling`) → Klang mit seiner Rate und Kanälen. Zählt
    /// nicht zu den 5 Minuten der erzeugten Klänge (die Klangmenge prüfen die Laufzeiten vor dem Start, P0021). Fehler:
    /// LaufzeitAnanas „<pfad> <Text>“ – der Text steht im Fehler-Klangteig, für Ungültiges [`KEIN_KLANG`].
    pub fn laden(&mut self, pfad: &str, teig: &[u8]) -> Erg {
        match lies_teig(teig) {
            Ok((rate, kanaele, pcm)) => {
                self.pcm.push(Eintrag { pcm, rate, kanaele, geladen: true });
                Ok(self.pcm.len() as u32)
            }
            Err(text) => Err(laufzeit(format!("{} {}", pfad, text))),
        }
    }
}

fn note_fehler(t: &str) -> Fehler {
    laufzeit(format!(
        "Die Note '{}' verstehe ich nicht (z. B. C4, F#4, Bb3, A4:2 für zwei Viertel, - für eine Pause).",
        t
    ))
}

/// FNV-1a-64 über i16-Samples (Little Endian) → 16 Hex-Ziffern.
pub fn hash_pcm(p: &[i16]) -> [u8; 16] {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &s in p {
        for b in s.to_le_bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
    let mut out = [0u8; 16];
    for (i, o) in out.iter_mut().enumerate() {
        let n = ((h >> (60 - 4 * i)) & 15) as u8;
        *o = if n < 10 { b'0' + n } else { b'a' + n - 10 };
    }
    out
}

// ---------------------------------------------------------------- ABI (klang.wasm und nativer Host)

/// Die Exporte von `klang.wasm` als Methoden (gleiche Namen, Ergebnis `id ≥ 1` oder `-1` = Fehler; Text und Art über
/// `fehler_*`, zurückgesetzt mit `fehler_neu`). Texte kommen als `&str` (die Hülle liest sie aus ihrem Speicher).
#[derive(Default)]
pub struct Abi {
    pub klaenge: Klaenge,
    fehler: Option<Fehler>,
}

impl Abi {
    pub fn neu() -> Abi {
        Abi::default()
    }
    fn erg(&mut self, r: Erg) -> i32 {
        match r {
            Ok(id) => id as i32,
            Err(e) => {
                self.fehler = Some(e);
                -1
            }
        }
    }
    /// Art des letzten Fehlers (0 = keiner).
    pub fn fehler_art(&self) -> i32 {
        self.fehler.as_ref().map(|e| e.art).unwrap_or(0)
    }
    /// Text des letzten Fehlers ("" = keiner).
    pub fn fehler_text(&self) -> &str {
        self.fehler.as_ref().map(|e| e.text.as_str()).unwrap_or("")
    }
    /// 1 = es gab einen Fehler (jetzt zurückgesetzt), 0 = keiner.
    pub fn fehler_neu(&mut self) -> i32 {
        if self.fehler.take().is_some() {
            1
        } else {
            0
        }
    }
    #[allow(clippy::too_many_arguments)]
    pub fn ton(&mut self, fr: f64, d: f64, welle: &str, laut: f64, bis: f64, an: f64, aus: f64) -> i32 {
        let r = self.klaenge.ton(fr, d, welle, laut, bis, an, aus);
        self.erg(r)
    }
    pub fn rauschen(&mut self, d: f64, art: &str, laut: f64, an: f64, aus: f64, saat: f64) -> i32 {
        let r = self.klaenge.rauschen(d, art, laut, an, aus, saat);
        self.erg(r)
    }
    pub fn stille(&mut self, d: f64) -> i32 {
        let r = self.klaenge.stille(d);
        self.erg(r)
    }
    pub fn noten(&mut self, text: &str, tempo: f64, welle: &str, laut: f64) -> i32 {
        let r = self.klaenge.noten(text, tempo, welle, laut);
        self.erg(r)
    }
    pub fn huelle(&mut self, id: i32, an: f64, ab: f64, halten: f64, aus: f64) -> i32 {
        let r = self.klaenge.huelle(id.max(0) as u32, an, ab, halten, aus);
        self.erg(r)
    }
    pub fn tiefpass(&mut self, id: i32, fr: f64, guete: f64) -> i32 {
        let r = self.klaenge.filter(id.max(0) as u32, false, fr, guete);
        self.erg(r)
    }
    pub fn hochpass(&mut self, id: i32, fr: f64, guete: f64) -> i32 {
        let r = self.klaenge.filter(id.max(0) as u32, true, fr, guete);
        self.erg(r)
    }
    pub fn verstaerke(&mut self, id: i32, faktor: f64) -> i32 {
        let r = self.klaenge.verstaerke(id.max(0) as u32, faktor);
        self.erg(r)
    }
    pub fn mische(&mut self, a: i32, b: i32, ab: f64) -> i32 {
        let r = self.klaenge.mische(a.max(0) as u32, b.max(0) as u32, ab);
        self.erg(r)
    }
    pub fn dann(&mut self, a: i32, b: i32) -> i32 {
        let r = self.klaenge.dann(a.max(0) as u32, b.max(0) as u32);
        self.erg(r)
    }
    pub fn wiederhole(&mut self, id: i32, n: f64) -> i32 {
        let r = self.klaenge.wiederhole(id.max(0) as u32, n);
        self.erg(r)
    }
    pub fn nahtlos(&mut self, id: i32, u: f64) -> i32 {
        let r = self.klaenge.nahtlos(id.max(0) as u32, u);
        self.erg(r)
    }
    /// `Klang.laden`: Klangteig → id (H-K19a).
    pub fn laden(&mut self, pfad: &str, teig: &[u8]) -> i32 {
        let r = self.klaenge.laden(pfad, teig);
        self.erg(r)
    }
    /// Abtastrate in Hz (0 = unbekannte ID).
    pub fn rate(&self, id: i32) -> i32 {
        self.klaenge.rate(id.max(0) as u32).unwrap_or(0) as i32
    }
    /// Kanäle (0 = unbekannte ID).
    pub fn kanaele(&self, id: i32) -> i32 {
        self.klaenge.kanaele(id.max(0) as u32).unwrap_or(0) as i32
    }
    /// Dauer in Sekunden (NaN = unbekannte ID).
    pub fn dauer(&self, id: i32) -> f64 {
        self.klaenge.dauer(id.max(0) as u32).unwrap_or(f64::NAN)
    }
    /// Hash als 16 Hex-Ziffern (None = unbekannte ID).
    pub fn hash(&self, id: i32) -> Option<[u8; 16]> {
        self.klaenge.hash(id.max(0) as u32)
    }
    /// PCM eines Klangs (leer = unbekannte ID).
    pub fn pcm(&self, id: i32) -> &[i16] {
        self.klaenge.pcm(id.max(0) as u32).unwrap_or(&[])
    }
}

// ---------------------------------------------------------------- Raum (Wiedergabe, nicht bitgleich geprüft)

/// Hörer: Lage und Blickrichtung „rechts“ (normiert, waagerecht genügt).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Hoerer {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub rechts_x: f64,
    pub rechts_y: f64,
    pub rechts_z: f64,
}

impl Default for Hoerer {
    fn default() -> Hoerer {
        Hoerer { x: 0.0, y: 0.0, z: 0.0, rechts_x: 1.0, rechts_y: 0.0, rechts_z: 0.0 }
    }
}

/// Wirkung einer räumlichen Spur am Hörer: `(lautstaerke 0 … 1, panorama −1 … 1, tiefpass Hz)`.
///
/// Abstand d: bis 1 m voll, dann 1/d (Abstandsgesetz), zusätzlich ab 60 % der `reichweite` weich auf 0 (bei d ≥ reichweite
/// still). Panorama = Anteil der Richtung auf der Rechts-Achse des Hörers, bei Nähe zur Mitte gezogen. Tiefpass (Luft und
/// Wände): 18 kHz nah, bis 900 Hz an der Reichweite.
pub fn raum(lage: (f64, f64, f64), reichweite: f64, h: &Hoerer) -> (f64, f64, f64) {
    let (dx, dy, dz) = (lage.0 - h.x, lage.1 - h.y, lage.2 - h.z);
    let d = libm::sqrt(dx * dx + dy * dy + dz * dz);
    let r = if reichweite > 0.0 { reichweite } else { 1.0 };
    if d >= r {
        return (0.0, 0.0, 900.0);
    }
    let mut g = if d <= 1.0 { 1.0 } else { 1.0 / d };
    let rand = 0.6 * r;
    if d > rand {
        let t = (d - rand) / (r - rand);
        g *= 1.0 - t * t * (3.0 - 2.0 * t);
    }
    let pan = if d > 1e-9 { (dx * h.rechts_x + dy * h.rechts_y + dz * h.rechts_z) / d } else { 0.0 };
    let nah = if d < 1.0 { d } else { 1.0 };
    let pan = pan * nah;
    let t = d / r;
    let tief = 18_000.0 * libm::pow(900.0 / 18_000.0, t);
    (g, if pan > 1.0 { 1.0 } else if pan < -1.0 { -1.0 } else { pan }, tief)
}

#[cfg(test)]
mod tests;
