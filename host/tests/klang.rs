//! Gruppe `klang` (HOST-ABI §2, src/klang.rs, src/wiedergabe.rs, K-153): Importe auf dem nativen Erzeuger (gleiche Samples wie
//! klang.wasm, Hash aus herd/klang/golden.txt), Kopierweg, Ereignis `klang`, Fehlerprotokoll, Wiedergabe in eine WAV-Datei.
//! **Nie ein Audiogerät:** die Läufe hier haben keine Wiedergabe bzw. nur die Datei-Senke.

use std::sync::Arc;

use pizzahost::ereignis::{Ereignis, Senke};
use pizzahost::laufen::{fuehre_aus, Optionen};
use pizzahost::wiedergabe::Wiedergabe;

/// Von Hand: Erzeuger da? → Welle „sinus“ über den Kopierweg → ton(440, 0.5) → Hash zurück ins Programm und ausgeben →
/// Fehlerfall ton(0, …) mit Text (Retry kap 0) → spiele-Ereignis mit Klang-ID (PCM an die Wiedergabe) → stoppe.
const WAT: &str = r#"(module
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (import "pizza" "klang_kern" (func $kern (param i32) (result i32)))
  (import "pizza" "klang_schreibe" (func $schreibe (param i32 i32 i32)))
  (import "pizza" "klang_lies" (func $lies (param i32 i32 i32)))
  (import "pizza" "klang_senden" (func $senden (param i32 i32 i32)))
  (import "klang" "puffer" (func $puffer (param i32) (result i32)))
  (import "klang" "ton" (func $ton (param f64 f64 i32 i32 f64 f64 f64 f64) (result i32)))
  (import "klang" "hash" (func $hash (param i32 i32) (result i32)))
  (import "klang" "fehler_text" (func $ftext (param i32 i32) (result i32)))
  (import "klang" "fehler_neu" (func $fneu (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "sinus")
  (data (i32.const 100) "{\"art\":\"spiele\",\"spur\":1,\"klang\":\"x\",\"lautstaerke\":1,\"tonhoehe\":1,\"panorama\":0,\"schleife\":false}")
  (data (i32.const 300) "{\"art\":\"stoppe\",\"spur\":1}")
  (func (export "start") (result i32) (local $p i32) (local $id i32) (local $n i32)
    (if (i32.ne (call $kern (i32.const 1)) (i32.const 1)) (then (return (i32.const 2))))
    (local.set $p (call $puffer (i32.const 16)))
    (call $schreibe (local.get $p) (i32.const 0) (i32.const 5))
    (local.set $id (call $ton (f64.const 440) (f64.const 0.5) (local.get $p) (i32.const 5) (f64.const 0.5) (f64.const 0) (f64.const 0.005) (f64.const 0.02)))
    (local.set $p (call $puffer (i32.const 16)))
    (drop (call $hash (local.get $id) (local.get $p)))
    (call $lies (i32.const 1000) (local.get $p) (i32.const 16))
    (call $ausgabe (i32.const 1000) (i32.const 16))
    ;; Fehler: Frequenz 0 → -1, Text mit Retry (der Puffer trägt jetzt den Hash – Welle neu schreiben)
    (call $schreibe (local.get $p) (i32.const 0) (i32.const 5))
    (drop (call $ton (f64.const 0) (f64.const 1) (local.get $p) (i32.const 5) (f64.const 0.5) (f64.const 0) (f64.const 0) (f64.const 0)))
    (local.set $n (call $ftext (local.get $p) (i32.const 0)))
    (local.set $p (call $puffer (local.get $n)))
    (drop (call $ftext (local.get $p) (local.get $n)))
    (call $lies (i32.const 2000) (local.get $p) (local.get $n))
    (call $ausgabe (i32.const 2000) (local.get $n))
    (drop (call $fneu))
    (call $senden (i32.const 100) (i32.const 96) (local.get $id))
    (call $senden (i32.const 300) (i32.const 25) (i32.const 0))
    (i32.const 0)))"#;

fn golden_ton() -> String {
    let g = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../herd/klang/golden.txt")).unwrap();
    let z = g.lines().find(|z| z.starts_with("ton 440 0.5 sinus 0.5 0 0.005 0.02 = ")).unwrap();
    z.split(" = ").nth(1).unwrap()[..16].to_string()
}

#[test]
fn importe_auf_dem_nativen_erzeuger() {
    let wasm = wat::parse_str(WAT).unwrap();
    let mut s = Senke::Sammeln(vec![]);
    let code = fuehre_aus(&wasm, &[], Optionen::default(), &mut s);
    let Senke::Sammeln(e) = s else { unreachable!() };
    assert_eq!(code, 0, "{:?}", e);
    let aus: Vec<String> = e.iter().filter_map(|x| if let Ereignis::Ausgabe { text, .. } = x { Some(text.clone()) } else { None }).collect();
    assert_eq!(aus[0], golden_ton(), "nativer Hash = klang.wasm (golden.txt)");
    assert_eq!(aus[1], "ton() braucht eine Frequenz von 1 bis 20000 Hz, nicht 0.");
    let k: Vec<String> = e.iter().filter(|x| matches!(x, Ereignis::Klang { .. })).map(|x| x.als_json()).collect();
    assert_eq!(k[0], r#"{"typ":"klang","art":"spiele","spur":1,"klang":"x","lautstaerke":1,"tonhoehe":1,"panorama":0,"schleife":false}"#);
    assert_eq!(k[1], r#"{"typ":"klang","art":"stoppe","spur":1}"#);
}

#[test]
fn wiedergabe_in_eine_datei() {
    let wasm = wat::parse_str(WAT).unwrap();
    let ziel = std::env::temp_dir().join(format!("pizza-klang-test-{}.wav", std::process::id()));
    let w = Wiedergabe::datei(ziel.clone());
    let mut s = Senke::Sammeln(vec![]);
    let opt = Optionen { klang: Some(w.clone()), ..Default::default() };
    assert_eq!(fuehre_aus(&wasm, &[], opt, &mut s), 0);
    // ohne Herd: mindestens 5 s; die Spur wurde sofort gestoppt → Stille, aber eine gültige Datei
    Arc::clone(&w).ende();
    let b = std::fs::read(&ziel).unwrap();
    let _ = std::fs::remove_file(&ziel);
    assert_eq!(&b[0..4], b"RIFF");
    assert!(b.len() >= 44 + 5 * 48_000 * 4, "{} Bytes", b.len());
}

#[test]
fn wiedergabe_mischt_gespielte_spur() {
    // Datei-Senke direkt: spiele ohne stoppe → der Ton steht in der Datei
    let mut k = herd_klang::Klaenge::neu();
    let id = k.ton(440.0, 0.5, "sinus", 0.5, 0.0, 0.005, 0.02).unwrap();
    let ziel = std::env::temp_dir().join(format!("pizza-klang-test-b-{}.wav", std::process::id()));
    let w = Wiedergabe::datei(ziel.clone());
    w.ereignis(r#"{"art":"spiele","spur":1,"klang":"a","lautstaerke":1,"tonhoehe":1,"panorama":0,"schleife":false}"#, k.pcm(id));
    w.bild(30, None);
    w.ende();
    let b = std::fs::read(&ziel).unwrap();
    let _ = std::fs::remove_file(&ziel);
    let s: Vec<i16> = b[44..].chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]])).collect();
    let max = s.iter().map(|x| x.unsigned_abs()).max().unwrap();
    assert!(max > 5000, "laut genug: {}", max);
    assert_eq!(s.len(), 30 * 800 * 2, "30 Takte à 800 Frames stereo (Ton ist nach 0.5 s aus)");
}
