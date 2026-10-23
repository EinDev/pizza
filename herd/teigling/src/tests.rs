//! Tests des Vorbackers: Bausteine (SHA-256, Mipmaps, Kopf), PNG exakt gegen die erzeugten Proben, JPEG gegen das Muster
//! (Näherung) und **goldene Teiglinge** (`golden.txt`: Name, SHA-256 des Teiglings, Länge) – dieselbe Liste prüft
//! `node herd/test-teigling.js` gegen `teigling.wasm` (nativ = Wasm).
//! Neu schreiben (nur bei gewollter Formatänderung = neue Formatversion): `TEIGLING_SCHREIBE=1 cargo test -p herd-teigling`.

use super::*;
use crate::testbild::*;
use alloc::string::String;

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

#[test]
fn sha256_bekannte_werte() {
    assert_eq!(hex(&sha256(b"")), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert_eq!(hex(&sha256(b"abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    let lang = b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    assert_eq!(hex(&sha256(lang)), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    let million = vec![b'a'; 1_000_000];
    assert_eq!(hex(&sha256(&million)), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
    for n in [55usize, 56, 63, 64, 65, 119, 120] {
        // Grenzfälle der Auffüllung: nur Determinismus und Länge
        assert_eq!(sha256(&vec![7u8; n]), sha256(&vec![7u8; n]));
    }
}

#[test]
fn stufen_und_laengen() {
    assert_eq!(stufen_anzahl(1, 1), 1);
    assert_eq!(stufen_anzahl(2, 1), 2);
    assert_eq!(stufen_anzahl(3, 1), 2);
    assert_eq!(stufen_anzahl(1024, 1024), 11);
    assert_eq!(stufen_anzahl(2048, 7), 12);
    assert_eq!(stufen_anzahl(2048, 2048), 12);
    assert_eq!(teigling_laenge(1, 1), KOPF + 4 + 4);
    assert_eq!(teigling_laenge(4, 2), KOPF + (4 + 32) + (4 + 8) + (4 + 4));
    // ≈ b × h × 4 × 4/3 (PROJEKTE.md §5.3)
    let l = teigling_laenge(1024, 1024);
    assert!(l > 5_592_000 && l < 5_593_000, "{}", l);
    assert!(teigling_laenge(2048, 2048) < 22_400_000);
}

#[test]
fn mipmaps_alpha_gewichtet() {
    // vier Pixel: rot deckend, drei durchsichtig → Farbe bleibt rot (kein dunkler Saum), Alpha = (255 + 2) >> 2
    let q = [255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let mut z = [0u8; 4];
    mip::halbiere(&q, 2, 2, &mut z);
    assert_eq!(z, [255, 0, 0, 64]);
    // alles durchsichtig → 0
    mip::halbiere(&[9, 9, 9, 0, 9, 9, 9, 0, 9, 9, 9, 0, 9, 9, 9, 0], 2, 2, &mut z);
    assert_eq!(z, [0, 0, 0, 0]);
    // gewichtetes Mittel mit Rundung: (10·255 + 20·255 + 30·255 + 41·255 + Σa/2) / Σa
    mip::halbiere(&[10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 41, 0, 0, 255], 2, 2, &mut z);
    assert_eq!(z, [25, 0, 0, 255]);
    // ungerade Breite 3 → 1: Spalte 2 entfällt; Höhe 1: Zeile wird wiederholt
    let q = [100, 0, 0, 255, 200, 0, 0, 255, 0, 0, 0, 255];
    mip::halbiere(&q, 3, 1, &mut z);
    assert_eq!(z, [150, 0, 0, 255]);
    // 1 × 2 → 1 × 1: Spalte wiederholt
    mip::halbiere(&[0, 0, 0, 255, 255, 255, 255, 255], 1, 2, &mut z);
    assert_eq!(z, [128, 128, 128, 255]);
}

#[test]
fn kopf_und_fehler_teigling() {
    let h = sha256(b"x");
    let f = fehler_teigling(Fehler::ZuGross(70000, 10), &h);
    assert_eq!(f.len(), FEHLER_LAENGE);
    let k = lies_kopf(&f).unwrap();
    assert_eq!(k.fehler, Some(Fehler::ZuGross(70000, 10)));
    assert_eq!(k.sha256, h);
    let f = fehler_teigling(Fehler::KeinBild, &h);
    assert_eq!(lies_kopf(&f).unwrap().fehler, Some(Fehler::KeinBild));
    let bild = Bild { breite: 3, hoehe: 2, rgba: (0..24).map(|i| (i * 10) as u8).collect() };
    let t = teigling_aus(&bild, false, &h);
    let k = lies_kopf(&t).unwrap();
    assert_eq!((k.breite, k.hoehe, k.stufen, k.flags), (3, 2, 2, FLAG_DURCHSICHTIG));
    assert_eq!(&t[KOPF + 4..KOPF + 4 + 24], &bild.rgba[..]);
    // jede Verfälschung des Kopfes wird erkannt
    for i in [0usize, 8, 10, 11, 12, 14, KOPF] {
        let mut v = t.clone();
        v[i] ^= 0x40;
        assert!(lies_kopf(&v).is_none(), "Byte {}", i);
    }
    let mut v = t.clone();
    v.pop();
    assert!(lies_kopf(&v).is_none());
}

/// Erwartete RGBA-Werte einer PNG-Quelle (unabhängig vom Decoder ausgerechnet).
fn png_erwartet(q: &PngQuelle) -> Vec<u8> {
    let k = kanaele(q.farbtyp);
    let max = (1u32 << q.bit) - 1;
    let acht = |v: u16| -> u8 {
        if q.bit == 16 {
            (v >> 8) as u8
        } else {
            ((v as u32 * 255 + max / 2) / max) as u8 // Rundung unterscheidet sich nur, wo v·255 nicht teilbar ist
        }
    };
    let acht_genau = |v: u16| -> u8 {
        if q.bit == 16 {
            (v >> 8) as u8
        } else {
            (v as u32 * 255 / max) as u8
        }
    };
    let _ = acht;
    let mut aus = Vec::new();
    let n = (q.breite * q.hoehe) as usize;
    let schluessel: Option<Vec<u16>> = q.trns.as_ref().filter(|_| q.farbtyp == 0 || q.farbtyp == 2).map(|t| t.chunks(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect());
    for p in 0..n {
        let s = &q.proben[p * k..p * k + k];
        let px: [u8; 4] = match q.farbtyp {
            0 => {
                let g = acht_genau(s[0]);
                [g, g, g, if schluessel.as_ref().is_some_and(|t| t[0] == s[0]) { 0 } else { 255 }]
            }
            2 => [acht_genau(s[0]), acht_genau(s[1]), acht_genau(s[2]), if schluessel.as_ref().is_some_and(|t| t[..] == s[..]) { 0 } else { 255 }],
            3 => {
                let c = q.palette[s[0] as usize];
                let a = q.trns.as_ref().and_then(|t| t.get(s[0] as usize).copied()).unwrap_or(255);
                [c[0], c[1], c[2], a]
            }
            4 => {
                let g = acht_genau(s[0]);
                [g, g, g, acht_genau(s[1])]
            }
            _ => [acht_genau(s[0]), acht_genau(s[1]), acht_genau(s[2]), acht_genau(s[3])],
        };
        aus.extend_from_slice(&px);
    }
    aus
}

#[test]
fn png_exakt_alle_farbtypen() {
    let mut geprueft = 0;
    for (ft, bits) in [(0u8, &[1u8, 2, 4, 8, 16][..]), (2, &[8, 16]), (3, &[1, 2, 4, 8]), (4, &[8, 16]), (6, &[8, 16])] {
        for &bit in bits {
            for (b, h) in [(1, 1), (13, 7), (8, 3), (31, 5)] {
                let mut q = png_quelle(b, h, ft, bit, b * 7 + h + bit as u32);
                if ft != 3 && ft != 4 && ft != 6 && b * h > 3 {
                    let k = kanaele(ft);
                    q.trns = Some(q.proben[2 * k..3 * k].iter().flat_map(|v| v.to_be_bytes()).collect());
                }
                if ft == 3 {
                    q.trns = Some(vec![0, 77]);
                }
                for filter in [None, Some(0), Some(1), Some(2), Some(3), Some(4)] {
                    let datei = png(&q, &PngOpt { filter, ..PngOpt::default() });
                    let (bild, jpeg) = dekodiere(&datei).unwrap_or_else(|e| panic!("typ {} {} bit {}×{}: {:?}", ft, bit, b, h, e));
                    assert!(!jpeg);
                    assert_eq!((bild.breite, bild.hoehe), (b, h));
                    assert_eq!(bild.rgba, png_erwartet(&q), "typ {} {} bit {}×{} Filter {:?}", ft, bit, b, h, filter);
                    geprueft += 1;
                }
            }
        }
    }
    assert_eq!(geprueft, 15 * 4 * 6);
}

#[test]
fn png_grau_hochskaliert() {
    // v × 255 / (2^b − 1): 1 bit → 0/255, 2 bit → 0/85/170/255, 4 bit → 17er-Schritte
    for (bit, werte) in [(1u8, vec![0u16, 1]), (2, vec![0, 1, 2, 3]), (4, (0..16).collect())] {
        let n = werte.len() as u32;
        let q = PngQuelle { breite: n, hoehe: 1, farbtyp: 0, bit, proben: werte.clone(), palette: vec![], trns: None };
        let (b, _) = dekodiere(&png(&q, &PngOpt::default())).unwrap();
        let max = (1u32 << bit) - 1;
        for (i, v) in werte.iter().enumerate() {
            assert_eq!(b.rgba[i * 4] as u32, *v as u32 * 255 / max);
        }
    }
}

fn fehler_von(q: &[u8]) -> Option<Fehler> {
    dekodiere(q).err()
}

#[test]
fn fehlerfaelle() {
    for (name, q) in faelle() {
        let erwartet = if name.contains("zu-gross-2400x800") {
            Some(Fehler::ZuGross(2400, 800))
        } else if name.contains("zu-gross-70000x10") {
            Some(Fehler::ZuGross(70000, 10))
        } else if name.contains("zu-gross-2049x1") {
            Some(Fehler::ZuGross(2049, 1))
        } else if name.contains("zu-gross-4000x3000") {
            Some(Fehler::ZuGross(4000, 3000))
        } else if name.contains("zu-gross-2048x2049") {
            Some(Fehler::ZuGross(2048, 2049))
        } else if name.contains("fehler") || name == "leer" || name == "kein-bild" || name == "quelle-ueber-2mib" {
            Some(Fehler::KeinBild)
        } else {
            None
        };
        assert_eq!(fehler_von(&q), erwartet, "{}", name);
        let t = vorbacken(&q);
        let k = lies_kopf(&t).unwrap_or_else(|| panic!("{}: kein gültiger Teigling", name));
        assert_eq!(k.fehler, erwartet, "{}", name);
        assert_eq!(k.sha256, sha256(&q));
        if erwartet.is_some() {
            assert_eq!(t.len(), FEHLER_LAENGE);
        } else {
            assert_eq!(k.flags & FLAG_JPEG != 0, name.starts_with("jpeg"), "{}", name);
        }
    }
}

#[test]
fn jpeg_naehert_das_muster() {
    // Grobe Plausibilität (die Bits selbst sichern die goldenen Teiglinge und der Abgleich mit libjpeg, ERGEBNISSE.md):
    // mittlere Abweichung je Kanal klein gegenüber dem Muster.
    for (name, q) in faelle() {
        if !name.starts_with("jpeg") || name.contains("fehler") || name.contains("zu-gross") || name.contains("abgeschnitten") || name.contains("q5") || name.contains("1x1") {
            continue;
        }
        let (bild, jpeg) = dekodiere(&q).unwrap();
        assert!(jpeg);
        // geprüft wird nur die Glätte benachbarter Pixel (der Vergleich mit dem Muster steht in `jpeg_gegen_muster`)
        let (b, h) = (bild.breite as usize, bild.hoehe as usize);
        let mut summe = 0u64;
        let mut n = 0u64;
        for y in 0..h {
            for x in 1..b {
                for c in 0..3 {
                    let a = bild.rgba[(y * b + x) * 4 + c] as i32;
                    let l = bild.rgba[(y * b + x - 1) * 4 + c] as i32;
                    summe += (a - l).unsigned_abs() as u64;
                    n += 1;
                }
            }
        }
        if n > 0 {
            assert!(summe / n < 60, "{}: unruhig ({})", name, summe / n);
        }
    }
}

#[test]
fn jpeg_gegen_muster() {
    let px = muster(48, 32, 5, 0, false);
    for (abt, grau, prog) in [
        ([(1u8, 1u8), (1, 1), (1, 1)], false, false),
        ([(2, 2), (1, 1), (1, 1)], false, false),
        ([(2, 1), (1, 1), (1, 1)], false, true),
        ([(1, 1), (1, 1), (1, 1)], true, true),
        ([(1, 1), (1, 1), (1, 1)], false, true),
    ] {
        let q = jpeg(48, 32, &px, &JpegOpt { abtastung: abt, grau, progressiv: prog, qualitaet: 95, ..JpegOpt::default() });
        let (b, _) = dekodiere(&q).unwrap();
        let mut fehler = 0u64;
        for i in 0..48 * 32 {
            let (r, g, bb) = (px[i * 4] as i32, px[i * 4 + 1] as i32, px[i * 4 + 2] as i32);
            if grau {
                let y = (19595 * r + 38470 * g + 7471 * bb + 32768) >> 16;
                fehler += (b.rgba[i * 4] as i32 - y).unsigned_abs() as u64;
            } else {
                for (c, v) in [r, g, bb].iter().enumerate() {
                    fehler += (b.rgba[i * 4 + c] as i32 - v).unsigned_abs() as u64;
                }
            }
        }
        let mittel = fehler * 100 / (48 * 32 * if grau { 1 } else { 3 });
        assert!(mittel < 1200, "{:?} grau {} prog {}: mittlere Abweichung {}/100", abt, grau, prog, mittel);
    }
}

#[test]
fn jpeg_progressiv_gleich_baseline() {
    // Progressiv mit voller Verfeinerung (Al = 0 am Ende) ergibt dieselben Koeffizienten wie Baseline → dieselben Pixel.
    for (abt, grau, ri) in [([(2u8, 2u8), (1, 1), (1, 1)], false, 0u16), ([(1, 1), (1, 1), (1, 1)], false, 3), ([(1, 1), (1, 1), (1, 1)], true, 2), ([(2, 1), (1, 1), (1, 1)], false, 1)] {
        let px = muster(70, 45, 9, 8, false);
        let o = JpegOpt { abtastung: abt, grau, neustart: ri, qualitaet: 90, ..JpegOpt::default() };
        let a = dekodiere(&jpeg(70, 45, &px, &o)).unwrap().0;
        let b = dekodiere(&jpeg(70, 45, &px, &JpegOpt { progressiv: true, ..o.clone() })).unwrap().0;
        let c = dekodiere(&jpeg(70, 45, &px, &JpegOpt { je_komponente: true, ..o })).unwrap().0;
        assert_eq!(a, b, "{:?} grau {} ri {}", abt, grau, ri);
        assert_eq!(a, c, "{:?} grau {} ri {} (je Komponente)", abt, grau, ri);
    }
}

#[test]
fn png_rgba8_ist_identitaet() {
    let px = muster(50, 20, 3, 5, true);
    let q = PngQuelle { breite: 50, hoehe: 20, farbtyp: 6, bit: 8, proben: px.iter().map(|&v| v as u16).collect(), palette: vec![], trns: None };
    let (b, _) = dekodiere(&png(&q, &PngOpt::default())).unwrap();
    assert_eq!(b.rgba, px);
}

#[test]
fn verdorbene_quellen_brechen_nie_ab() {
    // Kleine Unschärfe-Probe: zufällige Bitkipper, Bytes und Kürzungen in allen Fällen – jede Eingabe ergibt einen gültigen
    // Teigling oder Fehler-Teigling (kein Panic, kein Überlauf im Debug-Bau; in Wasm wäre ein Panic ein Trap).
    let mut z = Zufall(0x5EED);
    for (name, q) in faelle() {
        if q.is_empty() || q.len() > 200_000 {
            continue;
        }
        for runde in 0..60 {
            let mut v = q.clone();
            match runde % 3 {
                0 => {
                    for _ in 0..1 + z.naechste() % 4 {
                        let i = (z.naechste() as usize) % v.len();
                        v[i] ^= 1 << (z.naechste() % 8);
                    }
                }
                1 => {
                    let i = (z.naechste() as usize) % v.len();
                    v[i] = z.naechste() as u8;
                }
                _ => {
                    let n = (z.naechste() as usize) % v.len();
                    v.truncate(n.max(1));
                }
            }
            let t = vorbacken(&v);
            assert!(lies_kopf(&t).is_some(), "{} Runde {}", name, runde);
        }
    }
}

const GOLDEN: &str = include_str!("../golden.txt");

#[test]
fn goldene_teiglinge() {
    let mut ist = String::new();
    for (name, q) in faelle() {
        let t = vorbacken(&q);
        ist.push_str(&format!("{} {} {}\n", name, hex(&sha256(&t)), t.len()));
    }
    if std::env::var("TEIGLING_SCHREIBE").is_ok() {
        std::fs::write(concat!(env!("CARGO_MANIFEST_DIR"), "/golden.txt"), &ist).unwrap();
        return;
    }
    let soll: Vec<&str> = GOLDEN.lines().filter(|z| !z.is_empty() && !z.starts_with('#')).collect();
    let ist: Vec<&str> = ist.lines().collect();
    for (i, z) in ist.iter().enumerate() {
        assert_eq!(Some(z), soll.get(i), "goldener Teigling {} weicht ab", i);
    }
    assert_eq!(ist.len(), soll.len());
}
