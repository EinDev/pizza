//! Tests des Vorbis-Dekoders (H-K19b): Abgleich mit libvorbis (eingecheckte Referenz-PCM unter `testklaenge/libvorbis/`, mit
//! ffmpeg/libvorbis dekodiert und nach der Herd-Regel auf i16 gerundet, verlustfrei als FLAC gepackt; Abweichung ≤ 1 LSB),
//! Grenzen der Codebücher, Floor 0, fremde Ogg-Inhalte und Fuzz-Läufe, die die Ogg-CRC nach jeder Änderung neu berechnen –
//! so erreichen verdorbene Pakete wirklich den Vorbis-Dekoder (die Fuzz-Läufe in `klang_tests.rs` bleiben meist an der CRC
//! hängen).

use crate::klang::{self, kopf, KFehler};
use crate::vorbis::{self, Bits, Kennung, Vorbis};
use alloc::vec;
use alloc::vec::Vec;

const ORDNER: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/testklaenge/");
const GRUND: [&str; 7] = [
    "vorbis-ffmpeg-44100.ogg",
    "vorbis-hoch-96000.ogg",
    "vorbis-klick-48000.ogg",
    "vorbis-mono-22050.ogg",
    "vorbis-rauschen-8000.ogg",
    "vorbis-stereo-44100.ogg",
    "vorbis-stille-16000.ogg",
];

fn datei(name: &str) -> Vec<u8> {
    std::fs::read(alloc::format!("{}{}", ORDNER, name)).unwrap_or_else(|_| panic!("{} fehlt", name))
}

fn pcm_i16(t: &[u8]) -> Vec<i16> {
    klang::pcm(t).unwrap().chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect()
}

/// libvorbis (über ffmpeg) gegen den eigenen Dekoder: ≤ 1 LSB auf dem gemeinsamen Anfang. ffmpegs Ogg-Weg kürzt das Ende
/// anders (bis zu einem halben Block), daher höchstens 512 Frames Längenunterschied.
#[test]
fn libvorbis_abgleich() {
    let (mut werte, mut anders) = (0usize, 0usize);
    for name in GRUND {
        let t = klang::vorbacken(&datei(name));
        let k = kopf(&t).unwrap();
        assert!(k.vorbis() && k.float() && !k.flac() && k.bits == 32, "{}", name);
        let ich = pcm_i16(&t);
        let (info, referenz) = klang::roh(&datei(&alloc::format!("libvorbis/{}", name.replace(".ogg", ".flac")))).unwrap();
        assert_eq!((info.rate, info.kanaele), (k.rate, k.kanaele as u32), "{}", name);
        let rf = info.frames.unwrap();
        assert!(rf <= k.frames as u64 && rf + 512 >= k.frames as u64, "{}: {} Frames, libvorbis {}", name, k.frames, rf);
        for (a, &b) in ich.iter().zip(referenz.iter()) {
            let d = (*a as i32 - b).abs();
            assert!(d <= 1, "{}: Abweichung {} LSB", name, d);
            anders += (d != 0) as usize;
            werte += 1;
        }
    }
    std::eprintln!("libvorbis-Abgleich: {} Werte, {} um 1 LSB anders", werte, anders);
    assert!(anders * 100 < werte, "zu viele Abweichungen: {} von {}", anders, werte);
}

/// Bitschreiber (LSB zuerst) für künstliche Köpfe.
struct Schreiber {
    b: Vec<u8>,
    n: u32,
}
impl Schreiber {
    fn neu() -> Schreiber {
        Schreiber { b: Vec::new(), n: 0 }
    }
    fn w(&mut self, v: u32, k: u32) -> &mut Self {
        for i in 0..k {
            if self.n % 8 == 0 {
                self.b.push(0);
            }
            let l = self.b.len() - 1;
            self.b[l] |= (((v >> i) & 1) as u8) << (self.n % 8);
            self.n += 1;
        }
        self
    }
}

fn setup_mit(f: impl FnOnce(&mut Schreiber)) -> Vec<u8> {
    let mut p = vec![5u8];
    p.extend_from_slice(b"vorbis");
    let mut s = Schreiber::neu();
    f(&mut s);
    p.extend_from_slice(&s.b);
    p
}

const MONO: Kennung = Kennung { kanaele: 1, rate: 22050, bs: [256, 2048] };

/// Ein kleines Codebuch: 2 Einträge der Länge 1, ohne Lookup.
fn buch(s: &mut Schreiber) {
    s.w(0x564342, 24).w(1, 16).w(2, 24).w(0, 1).w(0, 1).w(0, 5).w(0, 5).w(0, 4);
}

fn fehler(p: &[u8]) -> KFehler {
    match Vorbis::neu(&MONO, p) {
        Ok(_) => panic!("Setup wurde angenommen"),
        Err(f) => f,
    }
}

#[test]
fn setup_grenzen_und_floor0() {
    // Floor 0 → Code 6
    let p = setup_mit(|s| {
        s.w(0, 8);
        buch(s);
        s.w(0, 6).w(0, 16).w(0, 6).w(0, 16);
    });
    assert_eq!(fehler(&p), KFehler::OggFormat);
    // zu viele Einträge (vor dem Anlegen) → Code 6
    let p = setup_mit(|s| {
        s.w(0, 8).w(0x564342, 24).w(1, 16).w((vorbis::MAX_EINTRAEGE + 1) as u32, 24);
    });
    assert_eq!(fehler(&p), KFehler::OggFormat);
    // Dimension über der Grenze → Code 6
    let p = setup_mit(|s| {
        s.w(0, 8).w(0x564342, 24).w(vorbis::MAX_DIM + 1, 16).w(2, 24);
    });
    assert_eq!(fehler(&p), KFehler::OggFormat);
    // VQ-Werte über der Grenze: 2^20 Einträge der Länge 20 (geordnet, ein Lauf), Lookup 2 mit Dimension 4 → Code 6
    let p = setup_mit(|s| {
        s.w(0, 8).w(0x564342, 24).w(4, 16).w(1 << 20, 24).w(1, 1).w(19, 5).w(1 << 20, 21);
        s.w(2, 4).w(0, 32).w(0, 32).w(0, 4).w(0, 1);
    });
    assert_eq!(fehler(&p), KFehler::OggFormat);
    // überbestimmter Huffman-Baum (drei Wörter der Länge 1) → Code 1
    let p = setup_mit(|s| {
        s.w(0, 8).w(0x564342, 24).w(1, 16).w(3, 24).w(0, 1).w(0, 1).w(0, 5).w(0, 5).w(0, 5).w(0, 4);
    });
    assert_eq!(fehler(&p), KFehler::KeinKlang);
    // unterbestimmter Baum (Längen 1 und 2) → Code 1
    let p = setup_mit(|s| {
        s.w(0, 8).w(0x564342, 24).w(1, 16).w(2, 24).w(0, 1).w(0, 1).w(0, 5).w(1, 5).w(0, 4);
    });
    assert_eq!(fehler(&p), KFehler::KeinKlang);
    // falsche Synchronmarke, leeres Setup, falscher Pakettyp → Code 1
    assert_eq!(fehler(&setup_mit(|s| { s.w(0, 8).w(0x564343, 24); })), KFehler::KeinKlang);
    assert_eq!(fehler(&setup_mit(|_| {})), KFehler::KeinKlang);
    assert_eq!(fehler(b"\x03vorbis"), KFehler::KeinKlang);
    // drei Kanäle erreichen den Dekoder nie (Code 4 vorher), er lehnt sie trotzdem ab
    assert!(Vorbis::neu(&Kennung { kanaele: 3, ..MONO }, &setup_mit(|_| {})).is_err());
}

#[test]
fn kennung_und_fremde_inhalte() {
    let gut = |f: &dyn Fn(&mut Vec<u8>)| {
        let mut p = vec![1u8];
        p.extend_from_slice(b"vorbis");
        p.extend_from_slice(&[0, 0, 0, 0, 2, 0x44, 0xac, 0, 0]); // Version, Kanäle, Rate
        p.extend_from_slice(&[0; 12]); // Bitraten
        p.extend_from_slice(&[0xb8, 1]); // Blockgrößen 256/2048, Rahmenbit
        assert_eq!(p.len(), 30);
        f(&mut p);
        vorbis::kennung(&p)
    };
    let k = gut(&|_| {}).unwrap();
    assert_eq!((k.kanaele, k.rate, k.bs), (2, 44100, [256, 2048]));
    assert_eq!(gut(&|p| p[7] = 1).unwrap_err(), KFehler::OggFormat); // Version 1
    assert_eq!(gut(&|p| p[28] = 0x8b).unwrap_err(), KFehler::KeinKlang); // kurzer Block größer als langer
    assert_eq!(gut(&|p| p[28] = 0xe8).unwrap_err(), KFehler::KeinKlang); // 16384
    assert_eq!(gut(&|p| p[29] = 0).unwrap_err(), KFehler::KeinKlang); // Rahmenbit
    assert_eq!(gut(&|p| p[11] = 0).unwrap_err(), KFehler::KeinKlang); // 0 Kanäle
    assert_eq!(gut(&|p| p.truncate(20)).unwrap_err(), KFehler::KeinKlang);
    for fremd in [&b"OpusHead\x01\x02"[..], b"\x7fFLAC\x01\x00", b"Speex   ", b"\x80theora"] {
        assert_eq!(vorbis::kennung(fremd).unwrap_err(), KFehler::OggFormat);
    }
    let mut b = Bits::neu(&[0b1010_1100, 0xff]);
    assert_eq!((b.lies(2), b.lies(3), b.lies(8), b.lies(4)), (Some(0), Some(3), Some(0xfd), None));
    assert_eq!(b.lies(1), None);
}

// ---------------------------------------------------------------- Fuzz mit neu berechneter Ogg-CRC

fn crc(s: &[u8]) -> u32 {
    let mut c = 0u32;
    for (i, &b) in s.iter().enumerate() {
        let b = if (22..26).contains(&i) { 0 } else { b };
        c ^= (b as u32) << 24;
        for _ in 0..8 {
            c = if c & 0x8000_0000 != 0 { (c << 1) ^ 0x04c1_1db7 } else { c << 1 };
        }
    }
    c
}

/// Seiten als (Anfang, Ende) – nur für unverdorbene Grunddateien.
fn seiten(q: &[u8]) -> Vec<(usize, usize)> {
    let mut v = Vec::new();
    let mut p = 0;
    while p + 27 <= q.len() && &q[p..p + 4] == b"OggS" {
        let n = q[p + 26] as usize;
        let l: usize = q[p + 27..p + 27 + n].iter().map(|&x| x as usize).sum();
        v.push((p, p + 27 + n + l));
        p += 27 + n + l;
    }
    v
}

fn crc_neu(q: &mut [u8], (a, e): (usize, usize)) {
    let c = crc(&q[a..e]);
    q[a + 22..a + 26].copy_from_slice(&c.to_le_bytes());
}

#[test]
fn ogg_crc_stimmt() {
    for name in GRUND {
        let q = datei(name);
        for (a, e) in seiten(&q) {
            assert_eq!(crc(&q[a..e]).to_le_bytes(), q[a + 22..a + 26], "{}", name);
        }
    }
}

/// Bits in Paketdaten (Setup und Audio), Lacing-Werte, Granulpositionen, Flags und Seitenfolgen verändern, CRC jeweils neu –
/// jede Eingabe ergibt einen gültigen Klangteig oder einen Fehler-Klangteig, nie eine Panik oder Endlosschleife.
#[test]
fn verdorbene_vorbis_pakete_brechen_nie_ab() {
    let mut z: u64 = 0x2545_F491_4F6C_DD1D;
    let mut zufall = move || {
        z ^= z << 13;
        z ^= z >> 7;
        z ^= z << 17;
        z
    };
    let (mut n, mut gueltig, mut fehler) = (0, 0, [0usize; 7]);
    for name in GRUND {
        let q = datei(name);
        let s = seiten(&q);
        for runde in 0..400 {
            let mut v = q.clone();
            // Seite: 1 = Kommentar + Setup, ab 2 Audio
            let i = if runde % 3 == 0 { 1 } else { 1 + (zufall() % (s.len() as u64 - 1)) as usize };
            let (a, e) = s[i];
            let d0 = a + 27 + v[a + 26] as usize;
            match runde % 8 {
                0..=3 => {
                    for _ in 0..1 + zufall() % 6 {
                        let p = d0 + (zufall() % (e - d0) as u64) as usize;
                        v[p] ^= 1 << (zufall() % 8);
                    }
                }
                4 => {
                    // ein Stück Paketdaten mit Zufall überschreiben
                    let p = d0 + (zufall() % (e - d0) as u64) as usize;
                    for k in p..(p + 1 + (zufall() % 64) as usize).min(e) {
                        v[k] = zufall() as u8;
                    }
                }
                5 => {
                    let l = a + 27 + (zufall() % v[a + 26] as u64) as usize;
                    v[l] = zufall() as u8;
                }
                6 => {
                    let g = match zufall() % 4 {
                        0 => 0i64,
                        1 => -1,
                        2 => i64::MAX,
                        _ => (zufall() % 100_000) as i64,
                    };
                    v[a + 6..a + 14].copy_from_slice(&g.to_le_bytes());
                    v[a + 5] ^= (zufall() % 8) as u8;
                }
                _ => {
                    // Audio-Paket abschneiden: Lacing kürzen, Seite neu zusammensetzen
                    let ns = v[a + 26] as usize;
                    let k = (zufall() % ns as u64) as usize;
                    let alt = v[a + 27 + k] as usize;
                    let neu = (zufall() % (alt as u64 + 1)) as usize;
                    let off: usize = v[a + 27..a + 27 + k].iter().map(|&x| x as usize).sum();
                    v[a + 27 + k] = neu as u8;
                    v.drain(d0 + off + neu..d0 + off + alt);
                    let e2 = e - (alt - neu);
                    crc_neu(&mut v, (a, e2));
                    let t = klang::vorbacken(&v);
                    let k = kopf(&t).unwrap_or_else(|| panic!("{} Runde {}: Kopf ungültig", name, runde));
                    if let Some((c, _)) = k.fehler {
                        fehler[c as usize] += 1;
                    } else {
                        gueltig += 1;
                    }
                    n += 1;
                    continue;
                }
            }
            crc_neu(&mut v, (a, e));
            let t = klang::vorbacken(&v);
            let k = kopf(&t).unwrap_or_else(|| panic!("{} Runde {}: Kopf ungültig", name, runde));
            assert_eq!(k.sha256, crate::sha256(&v));
            if let Some((c, _)) = k.fehler {
                fehler[c as usize] += 1;
            } else {
                gueltig += 1;
            }
            n += 1;
        }
    }
    std::eprintln!("Vorbis-Fuzz: {} Läufe, {} gültige Klangteige, Fehlercodes 1…6: {:?}", n, gueltig, &fehler[1..]);
    assert_eq!(n, GRUND.len() * 400);
    assert!(gueltig > n / 4 && fehler[1] > 0, "{} gültig, Fehler {:?}", gueltig, fehler);
}

/// Bitgleichheit braucht feste Rechenreihenfolge: zweimal dekodiert = dieselben Bytes; Pakete über Seitengrenzen und ein
/// verschränkter zweiter Strom ändern nichts.
#[test]
fn gleich_bei_wiederholung_und_umpacken() {
    let a = klang::vorbacken(&datei("vorbis-stereo-44100.ogg"));
    assert_eq!(a, klang::vorbacken(&datei("vorbis-stereo-44100.ogg")));
    assert_eq!(klang::pcm(&a), klang::pcm(&klang::vorbacken(&datei("vorbis-seiten.ogg"))));
    let m = klang::vorbacken(&datei("vorbis-mono-22050.ogg"));
    assert_eq!(klang::pcm(&m), klang::pcm(&klang::vorbacken(&datei("vorbis-zwei-stroeme.ogg"))));
}
