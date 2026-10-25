//! Tests des Klang-Vorbackers (H-K19a): Testklänge aus `scripts/klaenge-test.js` (eingecheckt unter `testklaenge/`, dazu
//! `erwartet.txt` mit SHA-256 des erwarteten PCM i16 und der Rohwerte bzw. Code und Text des Fehlers), jede Fehlerart, Grenzen,
//! Kopfprüfung, goldene Klangteige (`golden-klaenge.txt`, dieselbe Liste prüft `node herd/test-teigling.js` gegen
//! `teigling.wasm`) und Fuzz-Läufe (verdorbene Quellen brechen nie ab).

use crate::klang::{self, kopf, KFehler};
use alloc::string::String;
use alloc::vec::Vec;

const ORDNER: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/testklaenge/");

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| alloc::format!("{:02x}", x)).collect()
}

/// Zeilen von erwartet.txt (ohne Kommentare), je (Name, Rest).
fn erwartet() -> Vec<(String, String)> {
    let t = std::fs::read_to_string(alloc::format!("{}erwartet.txt", ORDNER)).unwrap();
    t.lines()
        .map(|z| z.trim_end_matches('\r'))
        .filter(|z| !z.is_empty() && !z.starts_with('#'))
        .map(|z| {
            let (n, r) = z.split_once(' ').unwrap();
            (String::from(n), String::from(r))
        })
        .collect()
}

fn datei(name: &str) -> Vec<u8> {
    std::fs::read(alloc::format!("{}{}", ORDNER, name)).unwrap_or_else(|_| panic!("Testklang {} fehlt", name))
}

#[test]
fn testklaenge_wie_erwartet() {
    let mut gut = 0;
    let mut schlecht = 0;
    for (name, rest) in erwartet() {
        let q = datei(&name);
        let t = klang::vorbacken(&q);
        let k = kopf(&t).unwrap_or_else(|| panic!("{}: Kopf ungültig", name));
        assert_eq!(k.sha256, crate::sha256(&q), "{}", name);
        if let Some(f) = rest.strip_prefix("fehler ") {
            let (code, text) = f.split_once(' ').unwrap();
            assert_eq!(k.fehler, Some((code.parse().unwrap(), String::from(text))), "{}", name);
            assert_eq!(t.len(), 68 + text.len());
            schlecht += 1;
            continue;
        }
        let f: Vec<&str> = rest.split(' ').collect();
        let zahl = |i: usize| f[i].parse::<u32>().unwrap();
        assert_eq!(k.fehler, None, "{}", name);
        assert_eq!((k.rate, k.kanaele as u32, k.bits as u32, k.frames, k.flags), (zahl(0), zahl(1), zahl(2), zahl(3), zahl(4)), "{}", name);
        assert_eq!(hex(&crate::sha256(klang::pcm(&t).unwrap())), f[5], "{}: PCM i16", name);
        let (info, roh) = klang::roh(&q).unwrap();
        assert_eq!(info.frames, Some(k.frames as u64));
        let rb: Vec<u8> = roh.iter().flat_map(|v| v.to_le_bytes()).collect();
        assert_eq!(hex(&crate::sha256(&rb)), f[6], "{}: Rohwerte", name);
        gut += 1;
    }
    assert!(gut >= 36 && schlecht >= 25, "{} Klänge, {} Fehlerdateien", gut, schlecht);
}

fn code(q: &[u8]) -> (u16, String) {
    kopf(&klang::vorbacken(q)).unwrap().fehler.unwrap()
}

/// kleines WAV: (Formatkennung, Kanäle, Rate, Bits, Größe im data-Kopf, PCM-Bytes)
fn wav(tag: u16, ch: u16, rate: u32, bits: u16, data_groesse: u32, pcm: &[u8]) -> Vec<u8> {
    let mut v = Vec::new();
    v.extend_from_slice(b"RIFF");
    v.extend_from_slice(&(36 + pcm.len() as u32).to_le_bytes());
    v.extend_from_slice(b"WAVEfmt ");
    v.extend_from_slice(&16u32.to_le_bytes());
    let block = ch * bits / 8;
    for x in [tag, ch] {
        v.extend_from_slice(&x.to_le_bytes());
    }
    v.extend_from_slice(&rate.to_le_bytes());
    v.extend_from_slice(&(rate * block as u32).to_le_bytes());
    for x in [block, bits] {
        v.extend_from_slice(&x.to_le_bytes());
    }
    v.extend_from_slice(b"data");
    v.extend_from_slice(&data_groesse.to_le_bytes());
    v.extend_from_slice(pcm);
    v
}

#[test]
fn fehlertexte() {
    let t = |f: KFehler| klang::fehler_text(&f);
    assert_eq!(t(KFehler::ZuLang { frames: 750 * 44100, rate: 44100 }), (2, String::from("ist zu lang (12:30) – höchstens 10 Minuten.")));
    assert_eq!(t(KFehler::ZuLang { frames: 600 * 8000 + 1, rate: 8000 }).1, "ist zu lang (10:01) – höchstens 10 Minuten.");
    assert_eq!(t(KFehler::QuelleZuGross(18_140_000)), (3, String::from("ist zu groß (17,3 MB) – höchstens 16 MB.")));
    assert_eq!(t(KFehler::TeigZuGross(73_610_000)), (3, String::from("ist vorgebacken zu groß (70,2 MB) – höchstens 64 MB.")));
    assert_eq!(t(KFehler::Kanaele(6)), (4, String::from("hat 6 Kanäle – höchstens 2 (Mono oder Stereo).")));
    assert_eq!(t(KFehler::Rate(192_000)), (5, String::from("hat 192 000 Hz – erlaubt sind 8 000 bis 96 000 Hz.")));
    assert_eq!(t(KFehler::KeinKlang), (1, String::from("ist kein lesbarer Klang (WAV, FLAC oder OGG).")));
    assert_eq!(t(KFehler::WavFormat).0, 6);
    assert_eq!(t(KFehler::FlacFormat).0, 6);
    assert_eq!(t(KFehler::OggFormat), (6, String::from("ist ein OGG in einem Format, das der Herd nicht kann (nur Vorbis I mit Floor 1, kein Opus).")));
}

#[test]
fn grenzen() {
    // Quelle über 16 MiB – vor jedem Lesen
    let mut gross = wav(1, 1, 96000, 8, 0, &[]);
    gross.resize(klang::MAX_QUELLE + 1, 0x80);
    assert_eq!(code(&gross), (3, String::from("ist zu groß (16,1 MB) – höchstens 16 MB.")));
    gross.truncate(klang::MAX_QUELLE);
    let k = kopf(&klang::vorbacken(&gross)).unwrap();
    assert_eq!((k.fehler, k.frames), (None, (klang::MAX_QUELLE - 44) as u32), "genau 16 MiB geht");
    // Dauer laut data-Kopf: genau 10 min geht (dekodiert wird, was da ist), eine Abtastung mehr nicht
    let k = kopf(&klang::vorbacken(&wav(1, 1, 8000, 8, 600 * 8000, &[1, 2, 3, 4]))).unwrap();
    assert_eq!((k.fehler, k.frames), (None, 4));
    assert_eq!(code(&wav(1, 1, 8000, 8, 600 * 8000 + 1, &[1, 2, 3, 4])).0, 2);
    // Strom-WAV (0xFFFFFFFF / 0): bis Dateiende, keine Dauer aus dem Kopf
    for g in [0u32, 0xFFFF_FFFF] {
        let k = kopf(&klang::vorbacken(&wav(1, 2, 44100, 16, g, &[0; 40]))).unwrap();
        assert_eq!((k.fehler, k.frames), (None, 10));
    }
    // halber Frame am Ende fällt weg; 0 Frames → Code 1
    assert_eq!(kopf(&klang::vorbacken(&wav(1, 2, 44100, 16, 1000, &[0; 7]))).unwrap().frames, 1);
    assert_eq!(code(&wav(1, 2, 44100, 16, 1000, &[0; 3])).0, 1);
    // Raten: Grenzen eingeschlossen, 0 → Code 1
    assert!(kopf(&klang::vorbacken(&wav(1, 1, 8000, 16, 2, &[0; 2]))).unwrap().fehler.is_none());
    assert!(kopf(&klang::vorbacken(&wav(1, 1, 96000, 16, 2, &[0; 2]))).unwrap().fehler.is_none());
    assert_eq!(code(&wav(1, 1, 7999, 16, 2, &[0; 2])).1, "hat 7 999 Hz – erlaubt sind 8 000 bis 96 000 Hz.");
    assert_eq!(code(&wav(1, 1, 96001, 16, 2, &[0; 2])).0, 5);
    assert_eq!(code(&wav(1, 1, 0, 16, 2, &[0; 2])).0, 1);
    assert_eq!(code(&wav(1, 3, 44100, 16, 6, &[0; 6])).1, "hat 3 Kanäle – höchstens 2 (Mono oder Stereo).");
    assert_eq!(code(&wav(1, 0, 44100, 16, 6, &[0; 6])).0, 1);
    // Formate
    for (tag, bits) in [(1u16, 12u16), (1, 64), (3, 64), (3, 16), (6, 8), (7, 8), (2, 4), (0x55, 16)] {
        assert_eq!(code(&wav(tag, 1, 44100, bits, 64, &[0; 64])).0, 6, "Format {} / {} bit", tag, bits);
    }
    // Blockgröße passt nicht zu Kanälen × Bits → kaputt
    let mut w = wav(1, 2, 44100, 16, 8, &[0; 8]);
    w[32] = 3;
    assert_eq!(code(&w).0, 1);
    // FLAC: STREAMINFO genau 10 min, aber Datei endet vorher → kaputt (nicht zu lang)
    let mut f = datei("fehler-zu-lang.flac");
    let gesamt = 600u64 * 8000;
    f[8 + 13] = (f[8 + 13] & 0xF0) | ((gesamt >> 32) as u8 & 0x0F);
    f[8 + 14..8 + 18].copy_from_slice(&(gesamt as u32).to_be_bytes());
    assert_eq!(code(&f).0, 1);
}

/// Unbekannte Länge: winzige konstante Rahmen dürfen keine endlose Arbeit machen – über 10 Minuten bricht das Dekodieren ab.
#[test]
fn unbekannte_laenge_bricht_ab() {
    let q = datei("fehler-zu-lang-unbekannt.flac");
    // letzten Rahmen (65 535 konstante Werte) 20 000-mal anhängen: 1,3 Mrd. Abtastwerte, gestoppt nach 74 Rahmen
    let mut p = q.len() - 1;
    while !(q[p] == 0xFF && q[p + 1] == 0xF8) {
        p -= 1;
    }
    let rahmen = q[p..].to_vec();
    let mut v = q.clone();
    for _ in 0..20_000 {
        v.extend_from_slice(&rahmen);
    }
    assert_eq!(code(&v), (2, String::from("ist zu lang (10:07) – höchstens 10 Minuten.")));
    // über 64 MiB, aber unter 10 Minuten: bis zum Ende gezählt
    assert_eq!(code(&datei("fehler-zu-gross-unbekannt.flac")).1, "ist vorgebacken zu groß (64,3 MB) – höchstens 64 MB.");
}

#[test]
fn float_rundung() {
    let f = klang::float_i16;
    assert_eq!([f(0.0), f(-0.0), f(1.0), f(-1.0), f(2.0), f(-7.5), f(f32::NAN), f(f32::INFINITY), f(f32::NEG_INFINITY)], [0, 0, 32767, -32767, 32767, -32767, 0, 32767, -32767]);
    // halbe Stufen vom Nullpunkt weg, knapp darunter abgerundet
    let halb = |k: f32| {
        let mut x = k / 32767.0;
        for _ in 0..80 {
            if x * 32767.0 == k {
                return Some(x);
            }
            x = f32::from_bits(if (x * 32767.0) < k { x.to_bits() + 1 } else { x.to_bits() - 1 });
        }
        None
    };
    if let Some(x) = halb(100.5) {
        assert_eq!(f(x), 101);
        assert_eq!(f(-x), -101);
        assert_eq!(f(f32::from_bits(x.to_bits() - 1)), 100);
    }
    assert_eq!(f(0.5 / 32767.0 * 0.999), 0);
}

#[test]
fn kopf_pruefung() {
    let q = datei("wav-16-stereo.wav");
    let t = klang::vorbacken(&q);
    let k = kopf(&t).unwrap();
    assert_eq!((k.rate, k.kanaele, k.bits, k.frames, k.flac(), k.float(), k.pcm_bytes()), (44100, 2, 16, 1000, false, false, 4000));
    assert_eq!(&t[..8], b"TEIGKLNG");
    // jedes Byte des Kopfes außer SHA-256: verändert → ungültig (Flags-Bit 0 macht ein FLAC mit 16 bit – gültig)
    for i in (0..16).chain(48..64) {
        for bit in 0..8 {
            let mut v = t.clone();
            v[i] ^= 1 << bit;
            let gueltig = kopf(&v).is_some();
            // erlaubt: Flag FLAC (16 bit ist auch ein FLAC), 16 → 24 bit, jede andere Rate im Bereich
            let erlaubt = (i == 12 && bit == 0) || (i == 54 && bit == 3) || (48..52).contains(&i) && {
                let r = u32::from_le_bytes([v[48], v[49], v[50], v[51]]);
                (8000..=96000).contains(&r) && 1000 <= 600 * r
            };
            assert_eq!(gueltig, erlaubt, "Byte {} Bit {}", i, bit);
        }
    }
    for l in [t.len() - 1, t.len() + 1, 63, 64] {
        let mut v = t.clone();
        v.resize(l, 0);
        assert!(kopf(&v).is_none(), "Länge {}", l);
    }
    // SHA-256 ist frei
    let mut v = t.clone();
    v[20] ^= 0xFF;
    assert!(kopf(&v).is_some());
    // Fehler-Klangteig
    let e = klang::vorbacken(b"kein Klang");
    let ke = kopf(&e).unwrap();
    assert_eq!(ke.fehler, Some((1, String::from("ist kein lesbarer Klang (WAV, FLAC oder OGG)."))));
    assert_eq!((ke.art, ke.rate, ke.frames), (255, 0, 0));
    assert!(klang::pcm(&e).is_none());
    for (i, x) in [(64usize, 7u8), (64, 0), (66, 1), (12, 1), (50, 1), (63, 1)] {
        let mut v = e.clone();
        v[i] = x;
        assert!(kopf(&v).is_none(), "Fehler-Teig Byte {} = {}", i, x);
    }
    let mut v = e.clone();
    v.push(b'x');
    assert!(kopf(&v).is_none());
    let mut v = e.clone();
    let n = v.len();
    v[n - 1] = 0xFF; // kein UTF-8
    assert!(kopf(&v).is_none());
}

const GOLDEN: &str = include_str!("../golden-klaenge.txt");

/// Goldene Klangteige (Name, SHA-256, Länge) – `SCHREIBE_GOLDEN=1 cargo test -p herd-teigling` schreibt die Liste neu.
#[test]
fn goldene_klangteige() {
    let ist: String = erwartet()
        .iter()
        .map(|(n, _)| {
            let t = klang::vorbacken(&datei(n));
            alloc::format!("{} {} {}\n", n, hex(&crate::sha256(&t)), t.len())
        })
        .collect();
    if std::env::var("SCHREIBE_GOLDEN").is_ok() {
        std::fs::write(concat!(env!("CARGO_MANIFEST_DIR"), "/golden-klaenge.txt"), &ist).unwrap();
        return;
    }
    let soll: Vec<&str> = GOLDEN.lines().map(|z| z.trim()).filter(|z| !z.is_empty() && !z.starts_with('#')).collect();
    for (i, z) in ist.lines().enumerate() {
        assert_eq!(Some(z), soll.get(i).copied(), "goldener Klangteig {} weicht ab", i);
    }
    assert_eq!(ist.lines().count(), soll.len());
}

/// Lage von Längenfeldern (WAV: Abschnittsgrößen; FLAC: Blocklängen, STREAMINFO-Felder, Blockgrößen-Bytes der Rahmen).
fn laengenfelder(q: &[u8]) -> Vec<(usize, usize)> {
    let mut aus = Vec::new();
    if q.starts_with(b"RIFF") {
        aus.push((4, 4));
        let mut p = 12;
        while p + 8 <= q.len() {
            aus.push((p + 4, 4));
            let g = u32::from_le_bytes([q[p + 4], q[p + 5], q[p + 6], q[p + 7]]) as usize;
            p = p.saturating_add(8 + g + (g & 1));
        }
        if q.len() > 36 {
            aus.extend([(22, 2), (24, 4), (32, 2), (34, 2)]);
        }
    } else if q.starts_with(b"fLaC") {
        let mut p = 4;
        while p + 4 <= q.len() {
            aus.push((p + 1, 3));
            let letzter = q[p] & 0x80 != 0;
            p += 4 + (((q[p + 1] as usize) << 16) | ((q[p + 2] as usize) << 8) | q[p + 3] as usize);
            if letzter {
                break;
            }
        }
        aus.extend([(8, 2), (10, 2), (18, 3), (21, 2), (25, 4)]);
        let mut i = p;
        while i + 4 < q.len() {
            if q[i] == 0xFF && q[i + 1] & 0xFE == 0xF8 {
                aus.push((i + 2, 1));
            }
            i += 1;
        }
    }
    aus.retain(|&(p, n)| p + n <= q.len());
    aus
}

/// Fuzz: Bits kippen, kürzen, Bytes einfügen, Längenfelder verändern, Stücke verdoppeln – jede Eingabe ergibt einen Klangteig
/// oder Fehler-Klangteig, nie eine Panik; der Kopf ist immer gültig. Ausgenommen: die beiden „…-unbekannt.flac“ (je ~30 Mio.
/// Abtastwerte dekodieren – 400 Läufe würden die Testzeit beherrschen; ihr Fall ist oben einmal geprüft).
#[test]
fn verdorbene_klaenge_brechen_nie_ab() {
    let mut z: u64 = 0x9E37_79B9_7F4A_7C15;
    let mut zufall = move || {
        z ^= z << 13;
        z ^= z >> 7;
        z ^= z << 17;
        z
    };
    let (mut n, mut gueltig) = (0, 0);
    let namen: Vec<String> = erwartet().into_iter().map(|(n, _)| n).filter(|n| !n.contains("unbekannt") && !n.contains("fehler-ogg-zu")).collect();
    for name in &namen {
        let q = datei(name);
        let felder = laengenfelder(&q);
        for runde in 0..400 {
            let mut v = q.clone();
            let l = v.len() as u64;
            match runde % 6 {
                0 => {
                    for _ in 0..1 + zufall() % 4 {
                        let i = (zufall() % l) as usize;
                        v[i] ^= 1 << (zufall() % 8);
                    }
                }
                1 => v.truncate((zufall() % l) as usize),
                2 => {
                    let i = (zufall() % l) as usize;
                    let neu: Vec<u8> = (0..1 + zufall() % 8).map(|_| zufall() as u8).collect();
                    v.splice(i..i, neu);
                }
                3 if !felder.is_empty() => {
                    let (p, b) = felder[(zufall() % felder.len() as u64) as usize];
                    let w: u32 = match zufall() % 6 {
                        0 => 0,
                        1 => u32::MAX,
                        2 => 0x7FFF_FFFF,
                        3 => (zufall() % 300) as u32,
                        4 => zufall() as u32,
                        _ => {
                            let mut x = [0u8; 4];
                            x[..b].copy_from_slice(&v[p..p + b]);
                            u32::from_le_bytes(x).wrapping_add(1 + (zufall() % 3) as u32)
                        }
                    };
                    v[p..p + b].copy_from_slice(&w.to_le_bytes()[..b]);
                }
                4 => {
                    let i = (zufall() % l) as usize;
                    for (k, b) in [0xFFu8, 0xF8, 0x00, 0x7F].iter().enumerate() {
                        if i + k < v.len() {
                            v[i + k] = *b;
                        }
                    }
                }
                _ => {
                    let i = (zufall() % l) as usize;
                    let e = v[i..].to_vec();
                    v.truncate(i);
                    v.extend_from_slice(&e[..e.len() / 2]);
                    v.extend_from_slice(&e);
                }
            }
            let t = klang::vorbacken(&v);
            let k = kopf(&t).unwrap_or_else(|| panic!("{} Runde {}: Kopf ungültig", name, runde));
            assert_eq!(k.sha256, crate::sha256(&v));
            if k.fehler.is_none() {
                gueltig += 1;
            }
            n += 1;
        }
    }
    std::eprintln!("Fuzz: {} Dateien × 400 = {} Läufe, {} gültige Klangteige", namen.len(), n, gueltig);
    assert_eq!(n, namen.len() * 400);
    assert!(gueltig > 0 && gueltig < n, "{} von {} verdorbenen Klängen gültig", gueltig, n);
}
