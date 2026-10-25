//! Ogg-Leser für Vorbis (H-K19b, RFC 3533): Seiten `OggS` Version 0 mit CRC-32 (Polynom 0x04C11DB7, Start 0, ohne
//! Spiegelung), Pakete über Seitengrenzen. Gelesen wird **nur der erste logische Strom** (Seriennummer der ersten Seite,
//! die BOS tragen muss) bis zu seiner EOS-Seite; Seiten anderer Ströme werden übersprungen, Bytes nach dem Ende ebenso.
//! Falsche CRC, Lücken in der Seitenfolge und Fortsetzungs-Flags, die nicht passen, sind beschädigt (Code 1); eine abgeschnittene
//! letzte Seite beendet den Strom wie libogg. Der Inhalt muss Vorbis I sein (`vorbis.rs`), sonst Code 6.
//!
//! Dauer: unbekannt bis zum Ende (Granulpositionen sind nur Behauptungen der Datei) – die Grenzen laufen mit wie beim FLAC
//! mit unbekannter Länge: über 10 Minuten bricht das Dekodieren ab, der Text nennt die größere von dekodierter Dauer und
//! letzter Granulposition.

use alloc::vec::Vec;

use crate::klang::{Info, KFehler, Senke, MAX_SEKUNDEN};
use crate::vorbis::{self, Vorbis};

const K: KFehler = KFehler::KeinKlang;

pub fn ist_ogg(q: &[u8]) -> bool {
    q.len() >= 4 && &q[0..4] == b"OggS"
}

const fn crc_tafel() -> [u32; 256] {
    let mut t = [0u32; 256];
    let mut i = 0;
    while i < 256 {
        let mut c = (i as u32) << 24;
        let mut k = 0;
        while k < 8 {
            c = if c & 0x8000_0000 != 0 { (c << 1) ^ 0x04c1_1db7 } else { c << 1 };
            k += 1;
        }
        t[i] = c;
        i += 1;
    }
    t
}
static CRC: [u32; 256] = crc_tafel();

fn crc(seite: &[u8]) -> u32 {
    let mut c = 0u32;
    for (i, &b) in seite.iter().enumerate() {
        let b = if (22..26).contains(&i) { 0 } else { b };
        c = (c << 8) ^ CRC[((c >> 24) as u8 ^ b) as usize];
    }
    c
}

#[derive(Clone, Copy)]
struct Seite {
    typ: u8,
    granule: i64,
    serial: u32,
    seq: u32,
    /// Lacing-Werte q[lacing .. lacing + segs], Daten ab `daten`, Seitenende `ende`
    lacing: usize,
    segs: usize,
    daten: usize,
    ende: usize,
}

/// Seite bei `pos`. `Ok(None)` = keine (weitere) Seite: Dateiende, fremde Bytes oder abgeschnitten.
fn seite(q: &[u8], pos: usize) -> Result<Option<Seite>, KFehler> {
    if q.len() < pos + 27 || &q[pos..pos + 4] != b"OggS" {
        return Ok(None);
    }
    if q[pos + 4] != 0 {
        return Err(K);
    }
    let segs = q[pos + 26] as usize;
    let lacing = pos + 27;
    if q.len() < lacing + segs {
        return Ok(None);
    }
    let daten = lacing + segs;
    let ende = daten + q[lacing..daten].iter().map(|&l| l as usize).sum::<usize>();
    if q.len() < ende {
        return Ok(None);
    }
    let u32_at = |i: usize| u32::from_le_bytes([q[i], q[i + 1], q[i + 2], q[i + 3]]);
    if crc(&q[pos..ende]) != u32_at(pos + 22) {
        return Err(K);
    }
    let mut g = [0u8; 8];
    g.copy_from_slice(&q[pos + 6..pos + 14]);
    Ok(Some(Seite {
        typ: q[pos + 5],
        granule: i64::from_le_bytes(g),
        serial: u32_at(pos + 14),
        seq: u32_at(pos + 18),
        lacing,
        segs,
        daten,
        ende,
    }))
}

/// Pakete des ersten logischen Stroms.
struct Pakete<'a> {
    q: &'a [u8],
    pos: usize,
    serial: u32,
    naechste_seq: u32,
    s: Option<Seite>,
    seg: usize,
    dpos: usize,
    /// letzter Abschnitt der Seite, der ein Paket abschließt
    letzter: Option<usize>,
    puffer: Vec<u8>,
    offen: bool,
    fertig: bool,
}

impl<'a> Pakete<'a> {
    fn neu(q: &'a [u8]) -> Result<Pakete<'a>, KFehler> {
        let s = seite(q, 0)?.ok_or(K)?;
        if s.typ & 2 == 0 {
            return Err(K);
        }
        Ok(Pakete {
            q,
            pos: 0,
            serial: s.serial,
            naechste_seq: s.seq,
            s: None,
            seg: 0,
            dpos: 0,
            letzter: None,
            puffer: Vec::new(),
            offen: false,
            fertig: false,
        })
    }

    /// Nächstes vollständiges Paket: (Bytes, Granulposition, Strom-Ende) – die beiden letzten nur am letzten Paket einer Seite.
    fn naechstes(&mut self) -> Result<Option<(&[u8], Option<i64>, bool)>, KFehler> {
        if !self.offen {
            self.puffer.clear();
        }
        loop {
            if let Some(s) = self.s {
                while self.seg < s.segs {
                    let l = self.q[s.lacing + self.seg] as usize;
                    self.puffer.extend_from_slice(&self.q[self.dpos..self.dpos + l]);
                    self.dpos += l;
                    let i = self.seg;
                    self.seg += 1;
                    if l < 255 {
                        self.offen = false;
                        let letzt = self.letzter == Some(i);
                        let g = if letzt && s.granule != -1 { Some(s.granule) } else { None };
                        return Ok(Some((&self.puffer, g, letzt && s.typ & 4 != 0)));
                    }
                    self.offen = true;
                }
                self.s = None;
                if s.typ & 4 != 0 {
                    self.fertig = true;
                }
            }
            if self.fertig {
                return Ok(None);
            }
            // nächste Seite des Stroms
            let s = loop {
                let Some(s) = seite(self.q, self.pos)? else {
                    self.fertig = true;
                    return Ok(None);
                };
                self.pos = s.ende;
                if s.serial == self.serial {
                    break s;
                }
            };
            if s.seq != self.naechste_seq || (s.typ & 1 != 0) != self.offen {
                return Err(K);
            }
            self.naechste_seq = s.seq.wrapping_add(1);
            self.letzter = (0..s.segs).rev().find(|&i| self.q[s.lacing + i] < 255);
            self.seg = 0;
            self.dpos = s.daten;
            self.s = Some(s);
        }
    }

    /// Größte Granulposition der restlichen Seiten dieses Stroms (nur für den Text „zu lang“; ohne CRC).
    fn rest_granule(&self) -> i64 {
        let mut g = -1i64;
        let mut pos = self.pos;
        while self.q.len() >= pos + 27 && &self.q[pos..pos + 4] == b"OggS" {
            let segs = self.q[pos + 26] as usize;
            if self.q.len() < pos + 27 + segs {
                break;
            }
            let ende = pos + 27 + segs + self.q[pos + 27..pos + 27 + segs].iter().map(|&l| l as usize).sum::<usize>();
            let mut b = [0u8; 8];
            b.copy_from_slice(&self.q[pos + 6..pos + 14]);
            let serial = u32::from_le_bytes([self.q[pos + 14], self.q[pos + 15], self.q[pos + 16], self.q[pos + 17]]);
            if serial == self.serial {
                g = g.max(i64::from_le_bytes(b));
            }
            pos = ende;
        }
        g
    }
}

/// Kopf: erste Seite, Kennungspaket → Info (Frames unbekannt).
pub(crate) fn kopf(q: &[u8]) -> Result<Info, KFehler> {
    let mut p = Pakete::neu(q)?;
    let (pk, _, _) = p.naechstes()?.ok_or(K)?;
    let k = vorbis::kennung(pk)?;
    Ok(Info {
        rate: k.rate,
        kanaele: k.kanaele,
        bits: 32,
        flac: false,
        float: true,
        vorbis: true,
        frames: None,
        frames_laut_kopf: None,
    })
}

pub(crate) fn dekodiere<S: Senke>(q: &[u8], info: &Info, s: &mut S) -> Result<u64, KFehler> {
    let mut p = Pakete::neu(q)?;
    let k = vorbis::kennung(p.naechstes()?.ok_or(K)?.0)?;
    vorbis::kommentar(p.naechstes()?.ok_or(K)?.0)?;
    let mut v = Vorbis::neu(&k, p.naechstes()?.ok_or(K)?.0)?;
    let ch = info.kanaele as u64;
    let max = MAX_SEKUNDEN * info.rate as u64;
    let mut frames = 0u64;
    while let Some((pk, g, eos)) = p.naechstes()? {
        v.paket(pk, g, eos);
        if v.aus.is_empty() {
            continue;
        }
        frames += v.aus.len() as u64 / ch;
        if frames > max {
            let g = p.rest_granule().max(g.unwrap_or(-1));
            return Err(KFehler::ZuLang { frames: frames.max(g.max(0) as u64), rate: info.rate });
        }
        s.werte(&v.aus);
    }
    Ok(frames)
}
