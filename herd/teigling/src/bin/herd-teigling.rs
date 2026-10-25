//! Werkzeug des Vorbackers (nativ, Feature `testbilder`):
//!   herd-teigling faelle <ordner>      goldene Fälle als <name>.quelle schreiben, je Fall "name sha256 länge" ausgeben
//!   herd-teigling vorbacken <ein> <aus> eine Datei vorbacken
//!   herd-teigling messe <ordner> [n]    Messbilder schreiben, nativ vorbacken (Bestwert aus n Läufen, Standard 5)
//!   herd-teigling klang <ein> <aus>     WAV/FLAC → Klangteig (H-K19a)
//!   herd-teigling klang-roh <ein> <aus> WAV/FLAC → Rohwerte vor der i16-Rundung (i32 LE verschachtelt; Vergleich mit ffmpeg)
//! Benutzt von `node herd/test-teigling.js` (nativ = teigling.wasm) und `bench/herd/mess-teigling.js`.

use std::time::Instant;

use herd_teigling::{sha256, testbild, vorbacken};

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    match a.get(1).map(|s| s.as_str()) {
        Some("faelle") => {
            let ordner = std::path::PathBuf::from(&a[2]);
            std::fs::create_dir_all(&ordner).unwrap();
            for (name, q) in testbild::faelle() {
                std::fs::write(ordner.join(format!("{}.quelle", name)), &q).unwrap();
                let t = vorbacken(&q);
                println!("{} {} {}", name, hex(&sha256(&t)), t.len());
            }
        }
        Some("vorbacken") => {
            let q = std::fs::read(&a[2]).unwrap();
            std::fs::write(&a[3], vorbacken(&q)).unwrap();
        }
        Some("messe") => {
            let ordner = std::path::PathBuf::from(&a[2]);
            let n: usize = a.get(3).and_then(|s| s.parse().ok()).unwrap_or(5);
            std::fs::create_dir_all(&ordner).unwrap();
            for (name, q) in testbild::messbilder() {
                std::fs::write(ordner.join(&name), &q).unwrap();
                let mut best = f64::MAX;
                let mut t = Vec::new();
                for _ in 0..n {
                    let s = Instant::now();
                    t = vorbacken(&q);
                    best = best.min(s.elapsed().as_secs_f64() * 1000.0);
                }
                println!("{} quelle={} teigling={} sha={} nativ_ms={:.1}", name, q.len(), t.len(), hex(&sha256(&t)), best);
            }
        }
        Some("klang") => {
            let q = std::fs::read(&a[2]).unwrap();
            std::fs::write(&a[3], herd_teigling::klang::vorbacken(&q)).unwrap();
        }
        Some("klang-roh") => {
            let q = std::fs::read(&a[2]).unwrap();
            match herd_teigling::klang::roh(&q) {
                Ok((info, w)) => {
                    let b: Vec<u8> = w.iter().flat_map(|v| v.to_le_bytes()).collect();
                    std::fs::write(&a[3], b).unwrap();
                    println!("rate={} kanaele={} bits={} frames={}", info.rate, info.kanaele, info.bits, info.frames.unwrap_or(0));
                }
                Err(f) => {
                    eprintln!("{:?}: {}", f, herd_teigling::klang::fehler_text(&f).1);
                    std::process::exit(1);
                }
            }
        }
        _ => {
            eprintln!("Aufruf: herd-teigling faelle <ordner> | vorbacken <ein> <aus> | messe <ordner> [n] | klang <ein> <aus> | klang-roh <ein> <aus>");
            std::process::exit(2);
        }
    }
}
