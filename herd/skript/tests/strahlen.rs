//! B14 (H-K20, HERD.md §13.3): Messung der Strahl-Abfragen nativ – `figur.herd` voll (100 Figuren, 1 000 Strahlen), danach je
//! Takt alle 1 000 Strahlen lesen (`punktY`; der Takt verwirft die Zwischenergebnisse, die erste Abfrage baut die Ziele neu).
//! Nur auf Wunsch: `cargo test --release -j 2 -p herd-skript --test strahlen -- --ignored --nocapture`.

use herd_skript::{lies, Spieler, Zeilen};
use std::time::Instant;

#[test]
#[ignore]
fn b14_strahlen_je_takt() {
    let pfad = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/herd/szenen/figur.herd");
    let s = lies(&std::fs::read_to_string(pfad).unwrap()).unwrap();
    let vorgaben = [("N".to_string(), 100.0), ("S".to_string(), 1000.0), ("TAKTE".to_string(), 20.0)];
    let mut sp = Spieler::neu(&vorgaben);
    sp.spiele(&s, &mut Zeilen::default()).unwrap();
    let marke = sp.vars["marke"] as i32;
    let typ = sp.kern.typ_nummer(b"Strahl");
    let py = sp.kern.feld_nummer(typ, b"punktY");
    let strahlen: Vec<i32> = (0..1000).map(|e| sp.kern.komp_von(marke + 1 + e, typ)).collect();
    assert!(strahlen.iter().all(|&k| k > 0));
    let (mut takt, mut lesen) = (Vec::new(), Vec::new());
    let mut summe = 0.0;
    for _ in 0..120 {
        let t = Instant::now();
        sp.kern.takt();
        takt.push(t.elapsed().as_secs_f64() * 1e3);
        let t = Instant::now();
        for &k in &strahlen {
            summe += sp.kern.hole_zahl(k, py);
        }
        lesen.push(t.elapsed().as_secs_f64() * 1e3);
    }
    let mittel = |v: &[f64]| v.iter().sum::<f64>() / v.len() as f64;
    let median = |v: &[f64]| {
        let mut s = v.to_vec();
        s.sort_by(|a, b| a.partial_cmp(b).unwrap());
        s[s.len() / 2]
    };
    println!(
        "B14 nativ: Takt (100 Figuren) {:.3} ms (Median {:.3}), 1 000 Strahlen lesen {:.3} ms (Median {:.3}) je Takt [Prüfsumme {}]",
        mittel(&takt),
        median(&takt),
        mittel(&lesen),
        median(&lesen),
        summe
    );
}
