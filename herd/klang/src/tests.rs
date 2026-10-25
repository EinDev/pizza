//! Tests: Synthese-Hashes gegen `herd/klang/golden.txt` (dieselbe Datei prüft `node herd/test-klang.js` gegen `klang.wasm` –
//! nativ = Wasm), Fehlertexte, Noten, Grenzen, Raum. `KLANG_GOLDEN=schreibe cargo test -j 2 -p herd-klang` schreibt die Hashes neu.

extern crate std;

use super::*;
use alloc::string::ToString;
use alloc::vec;
use std::string::String as SString;

/// Eine Zeile der Golden-Datei: Aufruf → Ergebnis (Hash oder Fehler).
fn wort_liste(z: &str) -> Vec<SString> {
    let mut w = Vec::new();
    let mut cur = SString::new();
    let mut zitat = false;
    for c in z.chars() {
        if c == '"' {
            zitat = !zitat;
            continue;
        }
        if c == ' ' && !zitat {
            if !cur.is_empty() {
                w.push(core::mem::take(&mut cur));
            }
            continue;
        }
        cur.push(c);
    }
    if !cur.is_empty() {
        w.push(cur);
    }
    w
}

fn zahl(s: &str) -> f64 {
    s.trim_start_matches('#').parse::<f64>().unwrap()
}

/// Führt einen Aufruf der Golden-Sprache aus (wie herd/test-klang.js).
pub fn fuehre_aus(k: &mut Klaenge, w: &[SString]) -> Erg {
    let n = |i: usize| zahl(&w[i]);
    let id = |i: usize| zahl(&w[i]) as u32;
    match w[0].as_str() {
        "ton" => k.ton(n(1), n(2), &w[3], n(4), n(5), n(6), n(7)),
        "rauschen" => k.rauschen(n(1), &w[2], n(3), n(4), n(5), n(6)),
        "stille" => k.stille(n(1)),
        "noten" => k.noten(&w[1], n(2), &w[3], n(4)),
        "huelle" => k.huelle(id(1), n(2), n(3), n(4), n(5)),
        "tiefpass" => k.filter(id(1), false, n(2), n(3)),
        "hochpass" => k.filter(id(1), true, n(2), n(3)),
        "verstaerke" => k.verstaerke(id(1), n(2)),
        "mische" => k.mische(id(1), id(2), n(3)),
        "dann" => k.dann(id(1), id(2)),
        "wiederhole" => k.wiederhole(id(1), n(2)),
        "nahtlos" => k.nahtlos(id(1), n(2)),
        x => panic!("unbekannter Aufruf {}", x),
    }
}

#[test]
fn golden() {
    let pfad = concat!(env!("CARGO_MANIFEST_DIR"), "/golden.txt");
    let text = std::fs::read_to_string(pfad).unwrap().replace("\r\n", "\n");
    let schreibe = std::env::var("KLANG_GOLDEN").map(|v| v == "schreibe").unwrap_or(false);
    let mut k = Klaenge::neu();
    let mut aus = SString::new();
    let mut fehler = Vec::new();
    for z in text.lines() {
        if z.starts_with('#') || z.trim().is_empty() {
            aus.push_str(z);
            aus.push('\n');
            continue;
        }
        let (aufruf, soll) = z.split_once(" = ").unwrap_or((z, ""));
        let w = wort_liste(aufruf);
        let ist = match fuehre_aus(&mut k, &w) {
            Ok(id) => SString::from_utf8(k.hash(id).unwrap().to_vec()).unwrap() + " " + &k.pcm(id).unwrap().len().to_string(),
            Err(e) => std::format!("! {}", e.text),
        };
        if !schreibe && ist != soll {
            fehler.push(std::format!("{}: soll {}, ist {}", aufruf, soll, ist));
        }
        aus.push_str(aufruf);
        aus.push_str(" = ");
        aus.push_str(&ist);
        aus.push('\n');
    }
    if schreibe {
        std::fs::write(pfad, aus).unwrap();
    }
    assert!(fehler.is_empty(), "Golden weicht ab:\n{}", fehler.join("\n"));
}

#[test]
fn fehlertexte() {
    let mut k = Klaenge::neu();
    assert_eq!(k.ton(0.0, 1.0, "sinus", 0.5, 0.0, 0.0, 0.0).unwrap_err().text, "ton() braucht eine Frequenz von 1 bis 20000 Hz, nicht 0.");
    assert_eq!(k.ton(440.0, 90.0, "sinus", 0.5, 0.0, 0.0, 0.0).unwrap_err().text, "ton() braucht eine Dauer über 0 bis 60 Sekunden, nicht 90.");
    assert_eq!(k.ton(440.0, 1.0, "quak", 0.5, 0.0, 0.0, 0.0).unwrap_err().text, "Eine Welle 'quak' gibt es nicht (sinus, rechteck, saege, dreieck, rauschen).");
    assert_eq!(k.rauschen(1.0, "gruen", 0.5, 0.0, 0.0, 1.0).unwrap_err().text, "Ein Rauschen 'gruen' gibt es nicht (weiss, rosa, braun).");
    let e = k.rauschen(1.0, "weiss", 0.5, 0.0, 0.0, 1.5).unwrap_err();
    assert_eq!((e.art, e.text.as_str()), (ART_TYP, "rauschen() braucht eine Ganzzahl für 'saat', nicht 1.5."));
    assert_eq!(k.noten("C4 X9", 120.0, "sinus", 0.5).unwrap_err().text, "Die Note 'X9' verstehe ich nicht (z. B. C4, F#4, Bb3, A4:2 für zwei Viertel, - für eine Pause).");
    assert_eq!(k.noten("", 120.0, "sinus", 0.5).unwrap_err().text, "noten() braucht mindestens eine Note, z. B. \"C4 E4 G4\".");
    let a = k.stille(0.1).unwrap();
    assert_eq!(k.nahtlos(a, 0.08).unwrap_err().text, "nahtlos() braucht eine Überblendung über 0 bis zur halben Dauer (0.05 Sekunden), nicht 0.08.");
    assert_eq!(k.wiederhole(a, 2.5).unwrap_err().art, ART_TYP);
    assert_eq!(k.anzahl(), 1, "Fehler legen keinen Klang an");
}

#[test]
fn noten_frequenzen() {
    let nah = |a: f64, b: f64| (a - b).abs() < 1e-9;
    assert!(nah(note_frequenz("A4").unwrap(), 440.0));
    assert!(nah(note_frequenz("A5").unwrap(), 880.0));
    assert!(nah(note_frequenz("C4").unwrap(), 261.625_565_300_598_6));
    assert!(nah(note_frequenz("H3").unwrap(), note_frequenz("C4").unwrap() / libm::pow(2.0, 1.0 / 12.0)));
    assert!(nah(note_frequenz("B3").unwrap(), note_frequenz("A#3").unwrap()));
    assert!(nah(note_frequenz("Eb4").unwrap(), note_frequenz("D#4").unwrap()));
    assert!(note_frequenz("C9").is_none() && note_frequenz("X4").is_none() && note_frequenz("C").is_none());
    let mut k = Klaenge::neu();
    let id = k.noten("C4 - E4:2 G4:0.5", 120.0, "sinus", 0.5).unwrap();
    assert_eq!(k.pcm(id).unwrap().len(), 24_000 * 4 + 12_000);
}

#[test]
fn grenzen_und_formen() {
    let mut k = Klaenge::neu();
    let a = k.ton(440.0, 1.0, "sinus", 1.0, 0.0, 0.0, 0.0).unwrap();
    assert_eq!(k.pcm(a).unwrap().len(), RATE);
    assert_eq!(k.pcm(a).unwrap()[0], 0);
    let b = k.ton(440.0, 0.5, "rechteck", 0.25, 0.0, 0.0, 0.0).unwrap();
    let m = k.mische(a, b, 0.75).unwrap();
    assert_eq!(k.pcm(m).unwrap().len(), RATE + RATE / 4);
    let d = k.dann(a, b).unwrap();
    assert_eq!(k.pcm(d).unwrap().len(), RATE + RATE / 2);
    let n = k.nahtlos(a, 0.1).unwrap();
    assert_eq!(k.pcm(n).unwrap().len(), RATE - RATE / 10);
    assert_eq!(k.dauer(n), Some(0.9));
    // zusammen höchstens 5 Minuten
    let mut k = Klaenge::neu();
    for _ in 0..5 {
        k.stille(60.0).unwrap();
    }
    assert!(k.stille(0.001).unwrap_err().text.starts_with("Die Klänge sind zusammen zu lang"));
    assert_eq!(hash_pcm(&[]), *b"cbf29ce484222325");
    assert_eq!(hash_pcm(&vec![0i16; 1]).len(), 16);
}

#[test]
fn raum_formel() {
    let h = Hoerer::default();
    let (g, p, _) = raum((0.5, 0.0, 0.0), 20.0, &h);
    assert!((g - 1.0).abs() < 1e-12 && (p - 0.5).abs() < 1e-12);
    let (g, p, t) = raum((4.0, 0.0, 0.0), 20.0, &h);
    assert!((g - 0.25).abs() < 1e-12 && (p - 1.0).abs() < 1e-12 && t < 18_000.0);
    let (g, p, _) = raum((0.0, 0.0, -4.0), 20.0, &h);
    assert!((g - 0.25).abs() < 1e-12 && p.abs() < 1e-12);
    assert_eq!(raum((0.0, 0.0, -25.0), 20.0, &h).0, 0.0);
    let (g, _, _) = raum((0.0, 0.0, -16.0), 20.0, &h);
    assert!(g > 0.0 && g < 1.0 / 16.0);
}

// ---------------------------------------------------------------- H-K19a: Klangteig laden

/// Klangteig v1 von Hand (Format `herd/teigling/src/klang.rs`).
fn teig(rate: u32, kanaele: u16, pcm: &[i16]) -> Vec<u8> {
    let mut t = Vec::new();
    t.extend_from_slice(b"TEIGKLNG");
    t.extend_from_slice(&1u16.to_le_bytes());
    t.extend_from_slice(&[0, 0, 0, 0, 0, 0]);
    t.extend_from_slice(&[7u8; 32]);
    t.extend_from_slice(&rate.to_le_bytes());
    t.extend_from_slice(&kanaele.to_le_bytes());
    t.extend_from_slice(&16u16.to_le_bytes());
    t.extend_from_slice(&((pcm.len() / kanaele as usize) as u32).to_le_bytes());
    t.extend_from_slice(&0u32.to_le_bytes());
    for s in pcm {
        t.extend_from_slice(&s.to_le_bytes());
    }
    t
}

fn fehler_teig(code: u16, text: &str) -> Vec<u8> {
    let mut t = Vec::new();
    t.extend_from_slice(b"TEIGKLNG");
    t.extend_from_slice(&1u16.to_le_bytes());
    t.extend_from_slice(&[255, 0, 0, 0, 0, 0]);
    t.extend_from_slice(&[7u8; 32]);
    t.extend_from_slice(&[0u8; 16]);
    t.extend_from_slice(&code.to_le_bytes());
    t.extend_from_slice(&(text.len() as u16).to_le_bytes());
    t.extend_from_slice(text.as_bytes());
    t
}

#[test]
fn laden_klangteig() {
    let mut k = Klaenge::neu();
    let pcm = [1i16, -1, 300, -300, 32767, -32768];
    let id = k.laden("klaenge/a.wav", &teig(22_050, 2, &pcm)).unwrap();
    assert_eq!(k.pcm(id).unwrap(), &pcm);
    assert_eq!(k.rate(id), Some(22_050));
    assert_eq!(k.kanaele(id), Some(2));
    assert_eq!(k.geladen(id), Some(true));
    assert_eq!(k.dauer(id), Some(3.0 / 22_050.0));
    assert_eq!(k.hash(id).unwrap(), hash_pcm(&pcm));
    // geladen zählt nicht zu den 5 Minuten; Formen lehnen ab
    assert_eq!(k.gesamt, 0);
    let e = k.verstaerke(id, 2.0).unwrap_err();
    assert_eq!(
        e.text,
        "verstaerke() geht nur mit erzeugten Klängen, nicht mit geladenen (Klang.laden) – spiele sie mit lautstaerke, tonhoehe und panorama."
    );
    let t = k.ton(440.0, 0.01, "sinus", 0.5, 0.0, 0.0, 0.0).unwrap();
    assert!(k.mische(t, id, 0.0).unwrap_err().text.starts_with("mische() geht nur"));
    assert!(k.dann(id, t).unwrap_err().text.starts_with("dann() geht nur"));
    assert!(k.huelle(id, 0.0, 0.0, 1.0, 0.0).unwrap_err().text.starts_with("huelle() geht nur"));
    assert_eq!(k.rate(t), Some(48_000));
    assert_eq!(k.kanaele(t), Some(1));
}

#[test]
fn laden_fehler() {
    let mut k = Klaenge::neu();
    let kein = "x.mp3 ist kein lesbarer Klang (WAV, FLAC oder OGG).";
    assert_eq!(k.laden("x.mp3", &[]).unwrap_err().text, kein);
    let e = k.laden("k/l.flac", &fehler_teig(2, "ist zu lang (12:30) – höchstens 10 Minuten.")).unwrap_err();
    assert_eq!((e.art, e.text.as_str()), (ART_LAUFZEIT, "k/l.flac ist zu lang (12:30) – höchstens 10 Minuten."));
    let gut = teig(8_000, 1, &[5, 6]);
    // jede Kürzung, falsche Länge, falscher Kopf → kein Klang
    for n in 0..gut.len() {
        assert_eq!(k.laden("x.mp3", &gut[..n]).unwrap_err().text, kein, "Länge {}", n);
    }
    for (i, w) in [(8usize, 2u8), (10, 1), (11, 1), (48, 0x3f), (52, 3), (56, 0)] {
        let mut t = gut.clone();
        t[i] = w;
        if i == 48 {
            t[49] = 0x1f; // 8 000 → 7 999
        }
        assert_eq!(k.laden("x.mp3", &t).unwrap_err().text, kein, "Byte {}", i);
    }
    let mut lang = gut.clone();
    lang.extend_from_slice(&[0, 0]);
    assert_eq!(k.laden("x.mp3", &lang).unwrap_err().text, kein);
    // Rate außerhalb
    assert!(k.laden("a", &teig(7_999, 1, &[1])).is_err());
    assert!(k.laden("a", &teig(96_001, 1, &[1])).is_err());
    assert!(k.laden("a", &teig(96_000, 1, &[1])).is_ok());
    let mut fk = fehler_teig(1, "");
    assert_eq!(k.laden("a", &fk).unwrap_err().text, "a ist kein lesbarer Klang (WAV, FLAC oder OGG).");
    fk.push(1);
    assert!(k.laden("a", &fk).is_err());
}
