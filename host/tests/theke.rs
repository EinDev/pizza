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
        .env("PIZZA_THEKE_UNSICHTBAR", "1")
        .stdin(Stdio::null())
        .output()
        .unwrap();
    let s = String::from_utf8_lossy(&out.stdout).replace("\r\n", "\n");
    eprintln!("stdout:\n{}\nstderr:\n{}\n{} ms", s, String::from_utf8_lossy(&out.stderr), t.elapsed().as_millis());
    assert_eq!(s, "{\"typ\":\"klick\",\"id\":\"z1\"}\nEnde\n");
    assert_eq!(out.status.code(), Some(0));
    let _ = std::fs::remove_dir_all(&dir);
}

/// Schreibt `target/theke-smoke.pkarton` (für Smoke-Tests mit cross-gebauten Hosts):
/// `cargo test --test theke -- --ignored fixture`
#[test]
#[ignore]
fn fixture_schreiben() {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target").join("theke-smoke.pkarton");
    std::fs::write(p, wat::parse_str(WAT).unwrap()).unwrap();
}

/// Startet `pizza-host [extra] programm` so, dass kein Fenster möglich ist (K-096): Linux ohne Anzeige,
/// Windows mit simuliert fehlender WebView2-Runtime. Nie ein sichtbares Fenster, nie der echte Vorrat.
#[cfg(feature = "theke")]
fn ohne_fenster(wat: &str, name: &str, extra: &[(&str, &str)]) -> std::process::Output {
    let dir = std::env::temp_dir().join(format!("pizza-theke-ohne-{}-{}", name, std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let k = dir.join("t.pkarton");
    std::fs::write(&k, wat::parse_str(wat).unwrap()).unwrap();
    let mut c = Command::new(env!("CARGO_BIN_EXE_pizza-host"));
    c.arg("--kein-vorrat")
        .arg(&k)
        .env_remove("PIZZA_THEKE")
        .env_remove("DISPLAY")
        .env_remove("WAYLAND_DISPLAY")
        .env("PIZZA_TEST_OHNE_WEBVIEW2", "1")
        .env("PIZZA_THEKE_UNSICHTBAR", "1")
        .stdin(Stdio::null());
    for (k, v) in extra {
        c.env(k, v);
    }
    let out = c.output().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    out
}

#[cfg(all(feature = "theke", any(windows, all(unix, not(target_os = "macos")))))]
#[test]
fn theke_ohne_fenster_bricht_ab() {
    let out = ohne_fenster(WAT, "abbruch", &[]);
    let err = String::from_utf8_lossy(&out.stderr);
    assert_eq!(out.status.code(), Some(2), "stderr: {}", err);
    assert_eq!(String::from_utf8_lossy(&out.stdout), "", "kein Programmlauf vor dem Abbruch");
    if cfg!(windows) {
        assert!(err.contains("braucht die Microsoft Edge WebView2 Runtime für sein Theke-Fenster"), "{}", err);
    } else {
        assert!(err.contains("braucht einen Bildschirm für sein Theke-Fenster"), "{}", err);
    }
    assert!(!err.contains("detail:"), "detail nur mit --debug: {}", err);
    assert!(!err.contains("W0100"), "{}", err);
}

/// Ausnahme `PIZZA_THEKE=0` (Tests/CI): fensterlos wie bisher, `ui_warte` → -1, Exit-Code des Programms.
#[cfg(feature = "theke")]
#[test]
fn theke_abgeschaltet_laeuft_weiter() {
    let out = ohne_fenster(WAT, "aus", &[("PIZZA_THEKE", "0")]);
    assert_eq!(out.status.code(), Some(0), "stderr: {}", String::from_utf8_lossy(&out.stderr));
    assert_eq!(String::from_utf8_lossy(&out.stdout).replace("\r\n", "\n"), "Ende\n");
}

/// Programme ohne Theke laufen auch ohne Fenster (z. B. über SSH) ganz normal.
#[cfg(feature = "theke")]
#[test]
fn konsolenprogramm_ohne_fenster() {
    let wat = r#"(module
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "Konsole")
  (func (export "start") (result i32)
    (call $ausgabe (i32.const 0) (i32.const 7))
    i32.const 0))"#;
    let out = ohne_fenster(wat, "konsole", &[]);
    assert_eq!(out.status.code(), Some(0), "stderr: {}", String::from_utf8_lossy(&out.stderr));
    assert_eq!(String::from_utf8_lossy(&out.stdout).replace("\r\n", "\n"), "Konsole\n");
}

/// K-084: gestaute Takt-Schläge derselben id werden im Fenster-Kanal zusammengefasst (Summe `anzahl`, wie im
/// Playground); andere Ereignisse bleiben an ihrem Platz. Vorgegebene Ereignisse (`--ui-ereignisse`) bleiben einzeln.
#[cfg(feature = "theke")]
#[test]
fn takt_schlaege_zusammenfassen() {
    let wasm = wat::parse_str(WAT).unwrap();
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    for e in [
        r#"{"typ":"takt","id":"t1","anzahl":1}"#,
        r#"{"typ":"takt","id":"t1","anzahl":2}"#,
        r#"{"typ":"aenderung","id":"e1","wert":"x"}"#,
        r#"{"typ":"takt","id":"t1","anzahl":1}"#,
        r#"{"typ":"takt","id":"t2","anzahl":1}"#,
        r#"{"typ":"takt","id":"t2"}"#,
        r#"{"typ":"takt","id":"t1","anzahl":1}"#,
    ] {
        tx.send(e.to_string()).unwrap();
    }
    drop(tx);
    let ui = Ui::Fenster { an: Box::new(|_| {}), von: rx };
    let mut s = Senke::Sammeln(vec![]);
    assert_eq!(fuehre_aus(&wasm, &[], Optionen { ui: Some(ui), ..Default::default() }, &mut s), 0);
    let Senke::Sammeln(e) = s else { unreachable!() };
    let aus: Vec<serde_json::Value> = e
        .iter()
        .filter_map(|x| match x {
            Ereignis::Ausgabe { text, .. } if text.starts_with('{') => Some(serde_json::from_str(text).unwrap()),
            _ => None,
        })
        .collect();
    let j = |s: &str| serde_json::from_str::<serde_json::Value>(s).unwrap();
    assert_eq!(
        aus,
        vec![
            j(r#"{"typ":"takt","id":"t1","anzahl":3}"#),
            j(r#"{"typ":"aenderung","id":"e1","wert":"x"}"#),
            j(r#"{"typ":"takt","id":"t1","anzahl":1}"#),
            j(r#"{"typ":"takt","id":"t2","anzahl":2}"#),
            j(r#"{"typ":"takt","id":"t1","anzahl":1}"#),
            j(r#"{"typ":"geschlossen"}"#),
        ]
    );
}

#[test]
fn takt_vorgabe_bleibt_einzeln() {
    let wasm = wat::parse_str(WAT).unwrap();
    let t = r#"{"typ":"takt","id":"t1","anzahl":1}"#.to_string();
    let ui = Ui::Vorgabe(vec![t.clone(), t.clone()].into());
    let mut s = Senke::Sammeln(vec![]);
    assert_eq!(fuehre_aus(&wasm, &[], Optionen { ui: Some(ui), ..Default::default() }, &mut s), 0);
    let Senke::Sammeln(e) = s else { unreachable!() };
    let n = e.iter().filter(|x| matches!(x, Ereignis::Ausgabe { text, .. } if *text == t)).count();
    assert_eq!(n, 2);
}
