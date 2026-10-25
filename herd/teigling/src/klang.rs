//! Format „Klangteig“ v1 (H-K19a/b, HERD.md §13.3): eine vorgebackene Klangdatei (WAV, FLAC oder OGG Vorbis) als PCM i16 –
//! **ohne Umrechnen der Rate** (die Wiedergabe aus H-K14 rechnet auf die Geräterate um). Dekodiert wird von Hand: WAV/FLAC
//! nur mit Ganzzahlen (Float-WAV: eine f32-Multiplikation, sonst Vergleiche), Vorbis in f32 nur mit Grundrechenarten
//! (`ogg.rs`, `vorbis.rs`, `mdct.rs`); nativ und in `teigling.wasm` bitgleich.
//!
//! ```text
//! Kopf (64 B, Little Endian)
//!  0  8  Magie "TEIGKLNG"
//!  8  2  Version = 1
//! 10  1  Art: 0 = Klang · 255 = Fehler
//! 11  1  0
//! 12  4  Flags: Bit 0 Quelle FLAC, Bit 1 Quelle Float, Bit 2 Quelle OGG Vorbis (immer mit Bit 1); sonst WAV
//! 16 32  SHA-256 der Quelldatei
//! 48  4  Rate (Hz)       52  2  Kanäle (1|2)      54  2  Bits je Abtastwert der Quelle
//! 56  4  Frames (Abtastwerte je Kanal)            60  4  0
//! 64  …  PCM i16 LE, Kanäle verschachtelt, genau Frames × Kanäle × 2 Bytes; die Datei endet danach
//! Fehler-Klangteig: Art 255, Flags 0, Bytes 48…63 = 0, ab 64 u16 Code, u16 Textlänge, Text (UTF-8, ohne Pfad – die
//!   Laufzeiten setzen "<pfad> " davor). Zählt nicht zur Klangmenge.
//! ```
//! Ein gültiger Klangteig hat Rate 8 000 … 96 000, 1 oder 2 Kanäle, Frames 1 … 600 × Rate, PCM ≤ 64 MiB, Bits 8/16/24/32
//! (WAV; Float nur 32) bzw. 4 … 24 (FLAC, nie Float) bzw. 32 (Vorbis, als Float). Cache-Schlüssel `<sha256>/klang/1`.
//!
//! **Fehlercodes** (Texte nur in [`fehler_text`]): 1 kein lesbarer Klang (auch beschädigt, CRC falsch, 0 Frames, Rate 0) ·
//! 2 zu lang · 3 Quelle oder Klangteig zu groß · 4 zu viele Kanäle · 5 Rate außerhalb · 6 WAV-/FLAC-/OGG-Format, das der Herd
//! nicht kann (OGG: kein Vorbis I, Floor 0, Codebücher über den Grenzen aus `vorbis.rs`).
//!
//! **Grenzen** (vor dem Anlegen von Speicher geprüft): Quelle ≤ 16 MiB; Dauer ≤ 10 min (Frames ≤ 600 × Rate) – beim WAV nach
//! der Größe im `data`-Kopf (0 und 0xFFFFFFFF heißen „unbekannt, bis Dateiende“), beim FLAC nach `total_samples` aus
//! STREAMINFO (0 = unbekannt → laufende Prüfung: über 10 Minuten bricht das Dekodieren ab, der Text nennt die bis dahin
//! dekodierte Dauer); beim OGG genauso (Länge stets unbekannt; der Text nennt die größere von dekodierter Dauer und
//! letzter Granulposition); PCM ≤ 64 MiB ebenso (bei unbekannter Länge wird darüber nur noch gezählt, bis zum Ende oder bis
//! 10 Minuten). Ein
//! `data`-Abschnitt, der länger ist als die Datei, wird auf ganze Frames der vorhandenen Bytes gekürzt. FLAC-Blöcke ≤ 65 535,
//! Speicher je Rahmen ≤ Blockgröße × Kanäle.
//!
//! **Umrechnung nach i16** (b = Bits der Quelle; „Rohwert“ = vorzeichenbehaftete Ganzzahl der Quelle):
//! - 8 bit (WAV, vorzeichenlos u): Rohwert u − 128, dann wie b < 16 → `(u − 128) << 8`;
//! - b < 16 (FLAC 4 … 15): `s << (16 − b)`; b = 16: unverändert;
//! - b > 16: `(s + (1 << (b − 17))) >> (b − 16)` (arithmetisch, in i64; halbe Stufen aufwärts), dann auf −32 768 … 32 767
//!   begrenzt;
//! - Float 32 (auch jeder Vorbis-Abtastwert): NaN → 0, auf [−1, 1] begrenzt, `y = x · 32767.0` als **f32**-Multiplikation, dann halbe Stufen vom Nullpunkt
//!   weg gerundet: `t = y as i32` (abschneiden), `r = y − t as f32` (exakt), `t + 1` bei r ≥ 0,5, `t − 1` bei r ≤ −0,5 – nur
//!   + − × und Vergleiche, kein FMA, kein libm; Ergebnis liegt in −32 767 … 32 767.

use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;

use crate::modell::{megabyte, tausender};
use crate::{flac, ogg, wav};

pub const MAGIE: [u8; 8] = *b"TEIGKLNG";
/// Formatversion (Teil des Cache-Schlüssels `klang/1`).
pub const VERSION: u16 = 1;
pub const KOPF: usize = 64;
pub const ART_KLANG: u8 = 0;
pub const ART_FEHLER: u8 = 255;
pub const FLAG_FLAC: u32 = 1;
pub const FLAG_FLOAT: u32 = 2;
pub const FLAG_VORBIS: u32 = 4;
/// Größte Quelldatei (16 MiB).
pub const MAX_QUELLE: usize = 16_777_216;
/// Längste Dauer in Sekunden (Frames ≤ 600 × Rate).
pub const MAX_SEKUNDEN: u64 = 600;
/// Größtes PCM eines Klangteigs in Bytes (64 MiB; ein größerer könnte die Klangmenge P0021 nie einhalten).
pub const MAX_PCM: u64 = 67_108_864;
/// Größte Klangmenge je Projekt (Summe der Klangteige verschiedener Quellen, P0021).
pub const MAX_KLANGMENGE: u64 = 67_108_864;
pub const MIN_RATE: u32 = 8_000;
pub const MAX_RATE: u32 = 96_000;
pub const MAX_KANAELE: u32 = 2;
/// Größter FLAC-Block (Abtastwerte je Kanal und Rahmen).
pub const MAX_BLOCK: usize = 65_535;

/// Warum eine Quelle kein Klangteig wird.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KFehler {
    /// Kein WAV/FLAC, beschädigt, CRC falsch, 0 Frames (Code 1).
    KeinKlang,
    /// Länger als 10 Minuten (Code 2).
    ZuLang { frames: u64, rate: u32 },
    /// Quelle größer als 16 MiB (Code 3; Bytes der Quelle).
    QuelleZuGross(u64),
    /// Klangteig größer als 64 MiB PCM (Code 3; Bytes des Klangteigs).
    TeigZuGross(u64),
    /// Mehr als 2 Kanäle (Code 4).
    Kanaele(u32),
    /// Rate außerhalb 8 000 … 96 000 Hz (Code 5).
    Rate(u32),
    /// WAV-Format, das der Herd nicht kann (Code 6).
    WavFormat,
    /// FLAC mit Bittiefe außerhalb 4 … 24 (Code 6).
    FlacFormat,
    /// OGG ohne Vorbis I (Opus, FLAC, …), Floor 0 oder über den Codebuch-Grenzen (Code 6).
    OggFormat,
}

/// Code und fertiger Text (ohne Pfad) eines Fehlers – die einzige Stelle, an der diese Texte entstehen (13.1 Regel 5).
pub fn fehler_text(f: &KFehler) -> (u16, String) {
    match *f {
        KFehler::KeinKlang => (1, String::from("ist kein lesbarer Klang (WAV, FLAC oder OGG).")),
        KFehler::ZuLang { frames, rate } => {
            let s = frames.div_ceil(rate.max(1) as u64);
            (2, format!("ist zu lang ({}:{:02}) – höchstens 10 Minuten.", s / 60, s % 60))
        }
        KFehler::QuelleZuGross(b) => (3, format!("ist zu groß ({} MB) – höchstens 16 MB.", megabyte(b))),
        KFehler::TeigZuGross(b) => (3, format!("ist vorgebacken zu groß ({} MB) – höchstens 64 MB.", megabyte(b))),
        KFehler::Kanaele(n) => (4, format!("hat {} Kanäle – höchstens 2 (Mono oder Stereo).", tausender(n as u64))),
        KFehler::Rate(r) => (5, format!("hat {} Hz – erlaubt sind 8 000 bis 96 000 Hz.", tausender(r as u64))),
        KFehler::WavFormat => (
            6,
            String::from("ist ein WAV in einem Format, das der Herd nicht kann (nur PCM mit 8, 16, 24 oder 32 Bit und Float mit 32 Bit)."),
        ),
        KFehler::FlacFormat => (6, String::from("ist ein FLAC in einem Format, das der Herd nicht kann (nur 4 bis 24 Bit).")),
        KFehler::OggFormat => {
            (6, String::from("ist ein OGG in einem Format, das der Herd nicht kann (nur Vorbis I mit Floor 1, kein Opus)."))
        }
    }
}

/// Was der Dateikopf über den Klang sagt.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Info {
    pub rate: u32,
    pub kanaele: u32,
    pub bits: u32,
    pub flac: bool,
    pub float: bool,
    pub vorbis: bool,
    /// Frames, die dekodiert werden (WAV: genau; FLAC: aus STREAMINFO, `None` = unbekannt; OGG: immer unbekannt).
    pub frames: Option<u64>,
    /// Frames laut Kopf für die Dauerprüfung (WAV: Größe im `data`-Kopf; sonst wie `frames`).
    pub frames_laut_kopf: Option<u64>,
}

/// Nimmt die dekodierten Rohwerte entgegen (Kanäle verschachtelt; Float: die f32-Bits).
pub(crate) trait Senke {
    fn werte(&mut self, w: &[i32]);
}

/// Rohwert → i16 nach den Regeln oben.
#[derive(Clone, Copy)]
enum Wandel {
    Gleich,
    Hoch(u32),
    Runter(u32),
    Float,
}

impl Wandel {
    fn aus(info: &Info) -> Wandel {
        if info.float {
            Wandel::Float
        } else if info.bits == 16 {
            Wandel::Gleich
        } else if info.bits < 16 {
            Wandel::Hoch(16 - info.bits)
        } else {
            Wandel::Runter(info.bits - 16)
        }
    }
    #[inline]
    fn i16(self, w: i32) -> i16 {
        match self {
            Wandel::Gleich => w as i16,
            Wandel::Hoch(n) => (w << n) as i16,
            Wandel::Runter(n) => {
                let v = ((w as i64) + (1i64 << (n - 1))) >> n;
                v.clamp(-32768, 32767) as i16
            }
            Wandel::Float => float_i16(f32::from_bits(w as u32)),
        }
    }
}

/// Float-Abtastwert → i16 (NaN → 0, begrenzen, × 32767 in f32, halbe Stufen vom Nullpunkt weg).
pub fn float_i16(x: f32) -> i16 {
    if x.is_nan() {
        return 0;
    }
    let y = x.clamp(-1.0, 1.0) * 32767.0f32;
    let mut t = y as i32;
    let r = y - t as f32;
    if r >= 0.5 {
        t += 1;
    } else if r <= -0.5 {
        t -= 1;
    }
    t.clamp(-32768, 32767) as i16
}

/// Senke des Klangteigs: schreibt i16 direkt hinter den Kopf; über den Grenzen wird nur noch gezählt.
struct TeigSenke {
    aus: Vec<u8>,
    wandel: Wandel,
    kanaele: u64,
    werte: u64,
    ueber: bool,
    max_werte: u64,
}

impl Senke for TeigSenke {
    fn werte(&mut self, w: &[i32]) {
        self.werte += w.len() as u64;
        if self.ueber {
            return;
        }
        if self.werte > self.max_werte {
            self.ueber = true;
            self.aus = Vec::new();
            return;
        }
        let n = w.len() * 2;
        if self.aus.capacity() - self.aus.len() < n {
            // genau wachsen (wasm: Größenklassen 2^k) – höchstens bis zur Grenze
            let grenze = KOPF + (self.max_werte * 2) as usize;
            let mut neu = self.aus.capacity().saturating_mul(2).max(self.aus.len() + n).max(4096);
            if neu > grenze {
                neu = grenze;
            }
            self.aus.reserve_exact(neu - self.aus.len());
        }
        let wa = self.wandel;
        for &x in w {
            self.aus.extend_from_slice(&wa.i16(x).to_le_bytes());
        }
    }
}

/// Rohwerte sammeln (Tests und `herd-teigling klang-roh`).
struct RohSenke(Vec<i32>);
impl Senke for RohSenke {
    fn werte(&mut self, w: &[i32]) {
        self.0.extend_from_slice(w);
    }
}

fn kopf_bytes(aus: &mut Vec<u8>, art: u8, flags: u32, sha: &[u8; 32]) {
    aus.extend_from_slice(&MAGIE);
    aus.extend_from_slice(&VERSION.to_le_bytes());
    aus.push(art);
    aus.push(0);
    aus.extend_from_slice(&flags.to_le_bytes());
    aus.extend_from_slice(sha);
    aus.extend_from_slice(&[0u8; 16]);
}

/// Fehler-Klangteig (68 Bytes + Text).
pub fn fehler_teig(f: &KFehler, sha: &[u8; 32]) -> Vec<u8> {
    let (code, text) = fehler_text(f);
    let mut aus = Vec::with_capacity(KOPF + 4 + text.len());
    kopf_bytes(&mut aus, ART_FEHLER, 0, sha);
    aus.extend_from_slice(&code.to_le_bytes());
    aus.extend_from_slice(&(text.len() as u16).to_le_bytes());
    aus.extend_from_slice(text.as_bytes());
    aus
}

enum Quelle {
    Wav(wav::Daten),
    Flac(usize),
    Ogg,
}

/// Kopf lesen und alle Grenzen prüfen, die vor dem Dekodieren feststehen.
fn pruefe(q: &[u8]) -> Result<(Info, Quelle), KFehler> {
    if q.len() > MAX_QUELLE {
        return Err(KFehler::QuelleZuGross(q.len() as u64));
    }
    let (info, quelle) = if wav::ist_wav(q) {
        let (i, d) = wav::kopf(q)?;
        (i, Quelle::Wav(d))
    } else if flac::ist_flac(q) {
        let (i, start) = flac::kopf(q)?;
        (i, Quelle::Flac(start))
    } else if ogg::ist_ogg(q) {
        (ogg::kopf(q)?, Quelle::Ogg)
    } else {
        return Err(KFehler::KeinKlang);
    };
    if info.kanaele == 0 || info.rate == 0 {
        return Err(KFehler::KeinKlang);
    }
    if info.kanaele > MAX_KANAELE {
        return Err(KFehler::Kanaele(info.kanaele));
    }
    if info.rate < MIN_RATE || info.rate > MAX_RATE {
        return Err(KFehler::Rate(info.rate));
    }
    if let Some(f) = info.frames_laut_kopf {
        if f > MAX_SEKUNDEN * info.rate as u64 {
            return Err(KFehler::ZuLang { frames: f, rate: info.rate });
        }
    }
    if let Some(f) = info.frames {
        if f == 0 {
            return Err(KFehler::KeinKlang);
        }
        let pcm = f * info.kanaele as u64 * 2;
        if pcm > MAX_PCM {
            return Err(KFehler::TeigZuGross(KOPF as u64 + pcm));
        }
    }
    Ok((info, quelle))
}

fn dekodiere_in<S: Senke>(q: &[u8], info: &Info, quelle: &Quelle, s: &mut S) -> Result<u64, KFehler> {
    match quelle {
        Quelle::Wav(d) => wav::dekodiere(q, info, d, s),
        Quelle::Flac(start) => flac::dekodiere(q, info, *start, s),
        Quelle::Ogg => ogg::dekodiere(q, info, s),
    }
}

fn backe(q: &[u8], sha: &[u8; 32]) -> Result<Vec<u8>, KFehler> {
    let (info, quelle) = pruefe(q)?;
    let k = info.kanaele as u64;
    let max_frames = MAX_SEKUNDEN * info.rate as u64;
    let max_werte = (MAX_PCM / 2 / k) * k;
    let cap = match info.frames {
        Some(f) => KOPF + (f * k * 2) as usize,
        None => KOPF,
    };
    let mut aus = Vec::with_capacity(cap);
    let mut flags = 0;
    if info.flac {
        flags |= FLAG_FLAC;
    }
    if info.float {
        flags |= FLAG_FLOAT;
    }
    if info.vorbis {
        flags |= FLAG_VORBIS;
    }
    kopf_bytes(&mut aus, ART_KLANG, flags, sha);
    let mut s = TeigSenke { aus, wandel: Wandel::aus(&info), kanaele: k, werte: 0, ueber: false, max_werte };
    let frames = dekodiere_in(q, &info, &quelle, &mut s)?;
    debug_assert_eq!(frames * s.kanaele, s.werte);
    if frames > max_frames {
        return Err(KFehler::ZuLang { frames, rate: info.rate });
    }
    if s.ueber {
        return Err(KFehler::TeigZuGross(KOPF as u64 + frames * k * 2));
    }
    if frames == 0 {
        return Err(KFehler::KeinKlang);
    }
    let mut aus = s.aus;
    aus[48..52].copy_from_slice(&info.rate.to_le_bytes());
    aus[52..54].copy_from_slice(&(info.kanaele as u16).to_le_bytes());
    aus[54..56].copy_from_slice(&(info.bits as u16).to_le_bytes());
    aus[56..60].copy_from_slice(&(frames as u32).to_le_bytes());
    debug_assert_eq!(aus.len() as u64, KOPF as u64 + frames * k * 2);
    Ok(aus)
}

/// Quelldatei (WAV, FLAC oder OGG Vorbis) → Klangteig; bei Fehlern ein Fehler-Klangteig – nie ein Abbruch.
pub fn vorbacken(quelle: &[u8]) -> Vec<u8> {
    let sha = crate::sha256(quelle);
    match backe(quelle, &sha) {
        Ok(t) => t,
        Err(f) => fehler_teig(&f, &sha),
    }
}

/// Dekodiert ohne i16-Rundung: (Info mit den dekodierten Frames, Rohwerte verschachtelt; Float: f32-Bits). Für Tests und
/// den Vergleich mit anderen Dekodern; dieselben Grenzen wie [`vorbacken`] bis auf die 64-MiB-Grenze bei unbekannter Länge.
pub fn roh(quelle: &[u8]) -> Result<(Info, Vec<i32>), KFehler> {
    let (mut info, q) = pruefe(quelle)?;
    let mut s = RohSenke(Vec::new());
    let frames = dekodiere_in(quelle, &info, &q, &mut s)?;
    if frames > MAX_SEKUNDEN * info.rate as u64 {
        return Err(KFehler::ZuLang { frames, rate: info.rate });
    }
    if frames == 0 {
        return Err(KFehler::KeinKlang);
    }
    info.frames = Some(frames);
    Ok((info, s.0))
}

/// Kopf eines Klangteigs (vollständig geprüft, auch die genaue Länge).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Kopf {
    pub art: u8,
    pub flags: u32,
    pub sha256: [u8; 32],
    pub rate: u32,
    pub kanaele: u16,
    pub bits: u16,
    pub frames: u32,
    /// Fehler-Klangteig: (Code, Text)
    pub fehler: Option<(u16, String)>,
}

impl Kopf {
    pub fn flac(&self) -> bool {
        self.flags & FLAG_FLAC != 0
    }
    pub fn float(&self) -> bool {
        self.flags & FLAG_FLOAT != 0
    }
    pub fn vorbis(&self) -> bool {
        self.flags & FLAG_VORBIS != 0
    }
    pub fn pcm_bytes(&self) -> u64 {
        self.frames as u64 * self.kanaele as u64 * 2
    }
}

/// Liest und prüft einen Klangteig. `None` = kein gültiger Klangteig v1.
pub fn kopf(t: &[u8]) -> Option<Kopf> {
    if t.len() < KOPF || t[..8] != MAGIE || u16::from_le_bytes([t[8], t[9]]) != VERSION || t[11] != 0 {
        return None;
    }
    let u16_at = |i: usize| u16::from_le_bytes([t[i], t[i + 1]]);
    let u32_at = |i: usize| u32::from_le_bytes([t[i], t[i + 1], t[i + 2], t[i + 3]]);
    let mut sha = [0u8; 32];
    sha.copy_from_slice(&t[16..48]);
    let (art, flags) = (t[10], u32_at(12));
    match art {
        ART_FEHLER => {
            if flags != 0 || t[48..64].iter().any(|&b| b != 0) || t.len() < KOPF + 4 {
                return None;
            }
            let (code, n) = (u16_at(64), u16_at(66) as usize);
            if !(1..=6).contains(&code) || t.len() != KOPF + 4 + n {
                return None;
            }
            let text = String::from(core::str::from_utf8(&t[68..]).ok()?);
            Some(Kopf { art, flags, sha256: sha, rate: 0, kanaele: 0, bits: 0, frames: 0, fehler: Some((code, text)) })
        }
        ART_KLANG => {
            let (rate, kanaele, bits, frames) = (u32_at(48), u16_at(52), u16_at(54), u32_at(56));
            if flags & !(FLAG_FLAC | FLAG_FLOAT | FLAG_VORBIS) != 0 || u32_at(60) != 0 {
                return None;
            }
            let bits_ok = if flags & FLAG_VORBIS != 0 {
                flags & (FLAG_FLAC | FLAG_FLOAT) == FLAG_FLOAT && bits == 32
            } else if flags & FLAG_FLAC != 0 {
                flags & FLAG_FLOAT == 0 && (4..=24).contains(&bits)
            } else if flags & FLAG_FLOAT != 0 {
                bits == 32
            } else {
                matches!(bits, 8 | 16 | 24 | 32)
            };
            if !bits_ok || !(MIN_RATE..=MAX_RATE).contains(&rate) || !(1..=2).contains(&kanaele) {
                return None;
            }
            let pcm = frames as u64 * kanaele as u64 * 2;
            if frames == 0 || frames as u64 > MAX_SEKUNDEN * rate as u64 || pcm > MAX_PCM || t.len() as u64 != KOPF as u64 + pcm {
                return None;
            }
            Some(Kopf { art, flags, sha256: sha, rate, kanaele, bits, frames, fehler: None })
        }
        _ => None,
    }
}

/// Die PCM-Bytes eines gültigen Klangteigs (i16 LE verschachtelt), sonst `None`.
pub fn pcm(t: &[u8]) -> Option<&[u8]> {
    let k = kopf(t)?;
    if k.fehler.is_some() {
        return None;
    }
    Some(&t[KOPF..])
}
