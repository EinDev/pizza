//! WAV-Leser (H-K19a): RIFF/WAVE mit `fmt ` vor `data`, Formatkennung 1 (PCM 8/16/24/32 bit, 8 bit vorzeichenlos) oder 3
//! (IEEE-Float 32 bit), auch als `WAVE_FORMAT_EXTENSIBLE` (0xFFFE, Unterformat-GUID PCM bzw. Float). Unbekannte Abschnitte
//! werden übersprungen (ungerade Längen mit Füllbyte); ein `data`-Abschnitt, der über das Dateiende reicht (oder Größe 0 bzw.
//! 0xFFFFFFFF hat), wird auf die vorhandenen ganzen Frames gekürzt. Alles andere (ADPCM, Float 64, μ-law, …) → Code 6.

use crate::klang::{Info, KFehler, Senke};

/// Unterformat-GUID von `WAVE_FORMAT_EXTENSIBLE` ohne die ersten beiden Bytes (= Formatkennung).
const GUID_REST: [u8; 14] = [0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71];

/// Lage der Abtastwerte in der Datei.
pub(crate) struct Daten {
    start: usize,
    frames: u64,
    block: usize,
}

pub fn ist_wav(q: &[u8]) -> bool {
    q.len() >= 12 && &q[0..4] == b"RIFF" && &q[8..12] == b"WAVE"
}

fn u16_at(q: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([q[i], q[i + 1]])
}
fn u32_at(q: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([q[i], q[i + 1], q[i + 2], q[i + 3]])
}

struct Fmt {
    tag: u16,
    kanaele: u16,
    rate: u32,
    block: u16,
    bits: u16,
}

fn lies_fmt(f: &[u8]) -> Result<Fmt, KFehler> {
    if f.len() < 16 {
        return Err(KFehler::KeinKlang);
    }
    let mut tag = u16_at(f, 0);
    if tag == 0xFFFE {
        if f.len() < 40 || u16_at(f, 16) < 22 {
            return Err(KFehler::KeinKlang);
        }
        if f[26..40] != GUID_REST {
            return Err(KFehler::WavFormat);
        }
        tag = u16_at(f, 24);
    }
    Ok(Fmt { tag, kanaele: u16_at(f, 2), rate: u32_at(f, 4), block: u16_at(f, 12), bits: u16_at(f, 14) })
}

/// Kopf lesen: Info und Lage der Daten. Prüft Format (6), leere Kanäle/Rate und Blockgröße (1).
pub(crate) fn kopf(q: &[u8]) -> Result<(Info, Daten), KFehler> {
    if !ist_wav(q) {
        return Err(KFehler::KeinKlang);
    }
    let mut p = 12usize;
    let mut fmt: Option<Fmt> = None;
    loop {
        if q.len() - p < 8 {
            return Err(KFehler::KeinKlang);
        }
        let id = &q[p..p + 4];
        let groesse = u32_at(q, p + 4) as usize;
        let rumpf = p + 8;
        let rest = q.len() - rumpf;
        if id == b"data" {
            let f = fmt.ok_or(KFehler::KeinKlang)?;
            let ok = matches!((f.tag, f.bits), (1, 8 | 16 | 24 | 32) | (3, 32));
            if !ok {
                return Err(KFehler::WavFormat);
            }
            let block = f.kanaele as usize * (f.bits as usize / 8);
            if f.kanaele == 0 || f.rate == 0 || f.block as usize != block {
                return Err(KFehler::KeinKlang);
            }
            let unbekannt = groesse == 0 || groesse == 0xFFFF_FFFF;
            let laut_kopf = if unbekannt { rest } else { groesse };
            let da = if laut_kopf < rest { laut_kopf } else { rest };
            let info = Info {
                rate: f.rate,
                kanaele: f.kanaele as u32,
                bits: f.bits as u32,
                flac: false,
                float: f.tag == 3,
                frames: Some((da / block) as u64),
                frames_laut_kopf: Some((laut_kopf / block) as u64),
            };
            return Ok((info, Daten { start: rumpf, frames: (da / block) as u64, block }));
        }
        if groesse > rest {
            return Err(KFehler::KeinKlang);
        }
        if id == b"fmt " {
            fmt = Some(lies_fmt(&q[rumpf..rumpf + groesse])?);
        }
        // ungerade Länge: ein Füllbyte (fehlt es am Dateiende, ist danach ohnehin kein `data` mehr)
        p = rumpf + groesse + (groesse & 1);
        if p > q.len() {
            return Err(KFehler::KeinKlang);
        }
    }
}

/// Abtastwerte lesen und in Stücken an die Senke geben (Rohwerte: 8 bit u − 128, sonst vorzeichenbehaftet, Float: Bits).
pub(crate) fn dekodiere<S: Senke>(q: &[u8], info: &Info, d: &Daten, s: &mut S) -> Result<u64, KFehler> {
    const STUECK: usize = 4096;
    let mut puf = [0i32; STUECK];
    let bytes = (info.bits / 8) as usize;
    let ende = d.start + d.frames as usize * d.block;
    let daten = q.get(d.start..ende).ok_or(KFehler::KeinKlang)?;
    for teil in daten.chunks(STUECK * bytes) {
        let n = teil.len() / bytes;
        for (i, b) in teil.chunks_exact(bytes).enumerate() {
            puf[i] = match bytes {
                1 => b[0] as i32 - 128,
                2 => i16::from_le_bytes([b[0], b[1]]) as i32,
                3 => (i32::from_le_bytes([0, b[0], b[1], b[2]])) >> 8,
                _ => i32::from_le_bytes([b[0], b[1], b[2], b[3]]),
            };
        }
        s.werte(&puf[..n]);
    }
    Ok(d.frames)
}
