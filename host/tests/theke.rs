//! Theke-Anbindung (THEKE.md §4): `ui_senden`/`ui_warte` mit vorgegebenen Ereignissen und – falls eine Anzeige
//! da ist und `PIZZA_THEKE_SMOKE=1` gesetzt ist – mit echtem Fenster.

use std::process::{Command, Stdio};

use pizzahost::ereignis::{Ereignis, Senke};
use pizzahost::laufen::{fuehre_aus, Optionen, Ui};

/// Zeigt ein Fenster mit einem Knopf, gibt jedes Renderer-Ereignis aus und schließt nach dem ersten Klick.
pub const WAT: &str = r#"(module
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (import "pizza" "ui_senden" (func $senden (param i32 i32)))
  (import "pizza" "ui_warte" (func $warte (param i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "{\"v\":1,\"op\":\"fenster\",\"titel\":\"Smoke\",\"breite\":300,\"hoehe\":200}")
  (data (i32.const 100) "{\"v\":1,\"op\":\"baum\",\"wurzel\":{\"id\":\"z2\",\"art\":\"stapel\",\"kinder\":[{\"id\":\"z1\",\"art\":\"knopf\",\"text\":\"Backen!\"}]}}")
  (data (i32.const 300) "{\"v\":1,\"op\":\"schliesse\"}")
  (data (i32.const 400) "Ende")
  (func (export "start") (result i32) (local $n i32) (local $kap i32)
    (call $senden (i32.const 0) (i32.const 63))
    (call $senden (i32.const 100) (i32.const 109))
    (local.set $kap (i32.const 8))
    (block $raus
      (loop $l
        (local.set $n (call $warte (i32.const 1000) (local.get $kap)))
        (br_if $raus (i32.lt_s (local.get $n) (i32.const 0)))
        ;; Retry: Puffer zu klein → größer
        (if (i32.gt_s (local.get $n) (local.get $kap))
          (then (local.set $kap (i32.const 4096)) (br $l)))
        (call $ausgabe (i32.const 1000) (local.get $n))
        ;; nach einem Klick schließen
        (if (i32.eq (i32.load8_u (i32.const 1008)) (i32.const 107)) ;; 'k' aus {"typ":"klick"
          (then (call $senden (i32.const 300) (i32.const 24)) (br $raus)))
        (br $l)))
    (call $ausgabe (i32.const 400) (i32.const 4))
    i32.const 0))"#;

#[test]
fn vorgegebene_ereignisse() {
    let wasm = wat::parse_str(WAT).unwrap();
    let ui = Ui::Vorgabe(vec![r#"{"typ":"aenderung","id":"z9","wert":"2"}"#.to_string()].into());
    let mut s = Senke::Sammeln(vec![]);
    let code = fuehre_aus(&wasm, &[], Optionen { ui: Some(ui), ..Default::default() }, &mut s);
    let Senke::Sammeln(e) = s else { unreachable!() };
    assert_eq!(code, 0);
    let texte: Vec<String> = e
        .iter()
        .map(|x| match x {
            Ereignis::Ui { nachricht } => format!("ui {}", nachricht),
            Ereignis::Ausgabe { text, .. } => format!("aus {}", text),
            x => format!("{:?}", x),
        })
        .collect();
    assert_eq!(texte[0], r#"ui {"v":1,"op":"fenster","titel":"Smoke","breite":300,"hoehe":200}"#);
    assert!(texte[1].starts_with(r#"ui {"v":1,"op":"baum""#));
    assert_eq!(texte[2], r#"aus {"typ":"aenderung","id":"z9","wert":"2"}"#);
    assert_eq!(texte[3], r#"aus {"typ":"geschlossen"}"#);
    assert_eq!(texte[4], "aus Ende");
    // JSON-Form des ui-Ereignisses
    assert_eq!(e[0].als_json(), r#"{"typ":"ui","nachricht":{"v":1,"op":"fenster","titel":"Smoke","breite":300,"hoehe":200}}"#);
}

#[test]
fn ohne_renderer_minus_eins() {
    let wasm = wat::parse_str(WAT).unwrap();
    let mut s = Senke::Sammeln(vec![]);
    assert_eq!(fuehre_aus(&wasm, &[], Optionen::default(), &mut s), 0);
    let Senke::Sammeln(e) = s else { unreachable!() };
    assert_eq!(e[2], Ereignis::Ausgabe { text: "Ende".into(), umbruch: true });
}

#[test]
fn cli_ui_ereignisse_datei() {
    let dir = std::env::temp_dir().join(format!("pizza-theke-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let k = dir.join("t.pkarton");
    std::fs::write(&k, wat::parse_str(WAT).unwrap()).unwrap();
    let ev = dir.join("t.ereignisse");
    std::fs::write(&ev, "{\"typ\":\"klick\",\"id\":\"z1\"}\n").unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_pizza-host"))
        .arg("--ereignisse-json")
        .arg("--ui-ereignisse")
        .arg(&ev)
        .arg(&k)
        .stdin(Stdio::null())
        .output()
        .unwrap();
    let s = String::from_utf8_lossy(&out.stdout).replace("\r\n", "\n");
    let z: Vec<&str> = s.lines().collect();
    assert_eq!(z.len(), 6, "{}", s);
    assert_eq!(z[2], r#"{"typ":"ausgabe","text":"{\"typ\":\"klick\",\"id\":\"z1\"}"}"#);
    assert_eq!(z[3], r#"{"typ":"ui","nachricht":{"v":1,"op":"schliesse"}}"#);
    assert_eq!(out.status.code(), Some(0));
    let _ = std::fs::remove_dir_all(&dir);
}

/// Echtes Fenster (nur mit Anzeige): `PIZZA_THEKE_SMOKE=1 cargo test --test theke -- --ignored fenster`
#[test]
#[ignore]
fn fenster_smoke() {
    let dir = std::env::temp_dir().join(format!("pizza-theke-smoke-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let k = dir.join("t.pkarton");
    std::fs::write(&k, wat::parse_str(WAT).unwrap()).unwrap();
    let t = std::time::Instant::now();
    let out = Command::new(env!("CARGO_BIN_EXE_pizza-host"))
        .arg(&k)
        .env("PIZZA_THEKE_SMOKE", "1")
        .stdin(Stdio::null())
        .output()
        .unwrap();
    let s = String::from_utf8_lossy(&out.stdout).replace("\r\n", "\n");
    eprintln!("stdout:\n{}\nstderr:\n{}\n{} ms", s, String::from_utf8_lossy(&out.stderr), t.elapsed().as_millis());
    assert_eq!(s, "{\"typ\":\"klick\",\"id\":\"z1\"}\nEnde\n");
    assert_eq!(out.status.code(), Some(0));
    let _ = std::fs::remove_dir_all(&dir);
}
