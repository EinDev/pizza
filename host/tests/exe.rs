//! End-to-End: `pizza-host exe` erzeugt eine eigenständige EXE, die das eingebettete Programm ausführt.

use std::process::{Command, Stdio};

const WAT: &str = r#"(module
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (memory (export "memory") 1)
  (global $ende (mut i32) (i32.const 1024))
  (global $n (mut i32) (i32.const 0))
  (data (i32.const 0) "Hallo aus der EXE")
  (func (export "abi_version") (result i32) i32.const 1)
  (func (export "schritte") (result f64) f64.const 3)
  (func (export "zeitMs") (result f64) f64.const 3)
  (func (export "arg_puffer") (param i32) (result i32) global.get $ende)
  (func (export "arg_fertig") (param i32)
    (call $ausgabe (global.get $ende) (local.get 0))
    (global.set $ende (i32.add (global.get $ende) (local.get 0)))
    (global.set $n (i32.add (global.get $n) (i32.const 1))))
  (func (export "start") (result i32)
    (call $ausgabe (i32.const 0) (i32.const 17))
    (global.get $n)))"#;

#[test]
fn exe_erzeugen_und_starten() {
    let dir = std::env::temp_dir().join(format!("pizza-host-exe-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let karton = dir.join("demo.pkarton");
    std::fs::write(&karton, wat::parse_str(WAT).unwrap()).unwrap();
    let exe = dir.join(format!("demo{}", std::env::consts::EXE_SUFFIX));

    let host = env!("CARGO_BIN_EXE_pizza-host");
    let st = Command::new(host).arg("exe").arg(&karton).arg("-o").arg(&exe).status().unwrap();
    assert!(st.success());

    // Alle Argumente gehören dem Programm – auch solche, die wie Host-Optionen aussehen.
    let out = Command::new(&exe).args(["Margherita", "--hilfe"]).stdin(Stdio::null()).output().unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout).replace("\r\n", "\n"), "Margherita\n--hilfe\nHallo aus der EXE\n");
    assert_eq!(out.status.code(), Some(2));

    let out = Command::new(&exe).env("PIZZA_EREIGNISSE_JSON", "1").stdin(Stdio::null()).output().unwrap();
    assert_eq!(
        String::from_utf8_lossy(&out.stdout).replace("\r\n", "\n"),
        "{\"typ\":\"ausgabe\",\"text\":\"Hallo aus der EXE\"}\n{\"typ\":\"ende\",\"exitCode\":0,\"schritte\":3,\"zeitMs\":3}\n"
    );
    assert_eq!(out.status.code(), Some(0));

    // Ungültiges .pkarton wird abgelehnt.
    let kaputt = dir.join("kaputt.pkarton");
    std::fs::write(&kaputt, b"keine pizza").unwrap();
    let st = Command::new(host).arg("exe").arg(&kaputt).arg("-o").arg(dir.join("x.exe")).status().unwrap();
    assert_eq!(st.code(), Some(2));
    let _ = std::fs::remove_dir_all(&dir);
}

/// Erzeugt `tests/demo.pkarton` (Fixture für test-exe-js.js und Cross-Tests):
/// `cargo test --test exe -- --ignored fixture`
#[test]
#[ignore]
fn fixture_schreiben() {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("demo.pkarton");
    std::fs::write(p, wat::parse_str(WAT).unwrap()).unwrap();
}

#[test]
fn panik_banner_nach_stderr() {
    let wat = r#"(module
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (import "pizza" "panik" (func $panik (param i32 i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "vorherBANNER")
  (func (export "start") (result i32)
    (call $ausgabe (i32.const 0) (i32.const 6))
    (call $panik (i32.const 6) (i32.const 6))
    i32.const 0))"#;
    let dir = std::env::temp_dir().join(format!("pizza-host-panik-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let karton = dir.join("panik.pkarton");
    std::fs::write(&karton, wat::parse_str(wat).unwrap()).unwrap();
    let out = Command::new(env!("CARGO_BIN_EXE_pizza-host")).arg(&karton).stdin(Stdio::null()).output().unwrap();
    assert_eq!(out.status.code(), Some(39));
    assert_eq!(String::from_utf8_lossy(&out.stdout).replace("\r\n", "\n"), "vorher\n");
    assert_eq!(String::from_utf8_lossy(&out.stderr).replace("\r\n", "\n"), "BANNER\n");
    let _ = std::fs::remove_dir_all(&dir);
}

/// Programm mit Theke (Importgruppe `theke`): unter Windows Subsystem WINDOWS (kein Terminal beim Doppelklick),
/// umgeleitete Ausgaben und Exit-Code bleiben erhalten. Ohne Theke: CONSOLE.
#[test]
fn theke_exe_ohne_terminal() {
    let wat = r#"(module
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (import "pizza" "ui_senden" (func $ui (param i32 i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "Theke-Programm")
  (func (export "start") (result i32)
    (call $ausgabe (i32.const 0) (i32.const 14))
    i32.const 3))"#;
    let dir = std::env::temp_dir().join(format!("pizza-host-theke-exe-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let host = env!("CARGO_BIN_EXE_pizza-host");
    let karton = dir.join("theke.pkarton");
    std::fs::write(&karton, wat::parse_str(wat).unwrap()).unwrap();
    let exe = dir.join(format!("theke{}", std::env::consts::EXE_SUFFIX));
    assert!(Command::new(host).arg("exe").arg(&karton).arg("-o").arg(&exe).status().unwrap().success());
    let demo = dir.join("demo.pkarton");
    std::fs::write(&demo, wat::parse_str(WAT).unwrap()).unwrap();
    let konsole = dir.join(format!("konsole{}", std::env::consts::EXE_SUFFIX));
    assert!(Command::new(host).arg("exe").arg(&demo).arg("-o").arg(&konsole).status().unwrap().success());

    let mit = std::fs::read(&exe).unwrap();
    let ohne = std::fs::read(&konsole).unwrap();
    if cfg!(windows) {
        assert_eq!(pizzahost::karton::subsystem(&mit), Some(pizzahost::karton::SUBSYSTEM_FENSTER));
        assert_eq!(pizzahost::karton::subsystem(&ohne), Some(pizzahost::karton::SUBSYSTEM_KONSOLE));
    } else {
        assert_eq!(pizzahost::karton::subsystem(&mit), None);
    }
    // Umleitung (Pipe) bleibt erhalten, Exit-Code kommt an. PIZZA_THEKE=0: nie ein Fenster im Test.
    let out = Command::new(&exe).env("PIZZA_THEKE", "0").stdin(Stdio::null()).output().unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout).replace("\r\n", "\n"), "Theke-Programm\n");
    assert_eq!(out.status.code(), Some(3));
    let _ = std::fs::remove_dir_all(&dir);
}
