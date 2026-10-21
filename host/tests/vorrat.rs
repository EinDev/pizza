//! Vorratskammer (K-079–K-081), Saat (K-077), Echtzeit (K-087) und Importprüfung (HOST-ABI §2) –
//! mit handgeschriebenen Modulen (WAT) und als End-to-End-Test der EXE (Spielstand überlebt zwei Läufe).

use std::path::PathBuf;
use std::process::{Command, Stdio};

use pizzahost::ereignis::{Ereignis, Senke};
use pizzahost::laufen::{eintraege_roh, fuehre_aus, Optionen};

fn lauf(wat_src: &str, opt: Optionen) -> (i32, Vec<Ereignis>) {
    let wasm = wat::parse_str(wat_src).expect("WAT");
    let mut s = Senke::Sammeln(Vec::new());
    let code = fuehre_aus(&wasm, &[], opt, &mut s);
    match s {
        Senke::Sammeln(v) => (code, v),
        _ => unreachable!(),
    }
}

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("pizza-host-{}-{}", name, std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    d
}

/// Modul mit Vorrat-Importen: `start` fragt die Verfügbarkeit ab (Ausgabe "1"/"0"), liest Kammer „k“ erst mit
/// Puffer 4 (Retry), dann mit 4096, gibt den Inhalt aus und schreibt danach `{"v":1,"name":"k","eintraege":[["a",7]]}`.
const VORRAT_WAT: &str = r#"(module
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (import "pizza" "vorrat_lesen" (func $lesen (param i32 i32 i32 i32) (result i32)))
  (import "pizza" "vorrat_schreiben" (func $schreiben (param i32 i32 i32 i32 i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "k10-")
  (data (i32.const 16) "{\"v\":1,\"name\":\"k\",\"eintraege\":[[\"a\",7]]}")
  (data (i32.const 64) "{\"schluessel\":\"a\",\"wert\":7}")
  (func (export "start") (result i32) (local $n i32)
    ;; Abfrage
    (if (i32.gt_s (call $lesen (i32.const 0) (i32.const 1) (i32.const 0) (i32.const -1)) (i32.const 0))
      (then (call $ausgabe (i32.const 1) (i32.const 1)))
      (else (call $ausgabe (i32.const 2) (i32.const 1))))
    ;; Lesen mit zu kleinem Puffer → benötigte Länge, dann richtig
    (local.set $n (call $lesen (i32.const 0) (i32.const 1) (i32.const 1024) (i32.const 4)))
    (if (i32.lt_s (local.get $n) (i32.const 0))
      (then (call $ausgabe (i32.const 3) (i32.const 1)))
      (else
        (local.set $n (call $lesen (i32.const 0) (i32.const 1) (i32.const 1024) (i32.const 4096)))
        (call $ausgabe (i32.const 1024) (local.get $n))))
    ;; Schreiben: 0 = ok, sonst "-"
    (if (i32.ne (call $schreiben (i32.const 0) (i32.const 1) (i32.const 16) (i32.const 40) (i32.const 64) (i32.const 27)) (i32.const 0))
      (then (call $ausgabe (i32.const 3) (i32.const 1))))
    i32.const 0))"#;

fn ausgaben(e: &[Ereignis]) -> Vec<String> {
    e.iter()
        .filter_map(|x| match x {
            Ereignis::Ausgabe { text, .. } => Some(text.clone()),
            _ => None,
        })
        .collect()
}

#[test]
fn eintraege_aus_gespeicherter_kammer() {
    assert_eq!(eintraege_roh(r#"{"v":1,"name":"x","eintraege":[["a",1e+21],["b","]\"["]]}"#), Some(r#"[["a",1e+21],["b","]\"["]]"#));
    assert_eq!(eintraege_roh(r#" { "name" : "x" , "eintraege" : [ ] } "#), Some("[ ]"));
    assert_eq!(eintraege_roh(r#"{"eintraege":{"a":1}}"#), None);
    assert_eq!(eintraege_roh(r#"{"v":1}"#), None);
    assert_eq!(eintraege_roh("kaputt"), None);
    assert_eq!(eintraege_roh(r#"[["a",1]]"#), Some(r#"[["a",1]]"#));
}

#[test]
fn vorrat_ohne_speicher_nur_ereignis() {
    let (code, e) = lauf(VORRAT_WAT, Optionen::default());
    assert_eq!(code, 0);
    assert_eq!(ausgaben(&e), vec!["0", "-"]);
    let json: Vec<String> = e.iter().map(|x| x.als_json()).collect();
    assert!(json.contains(&r#"{"typ":"vorrat","name":"k","schluessel":"a","wert":7}"#.to_string()), "{:?}", json);
}

#[test]
fn vorrat_lesen_retry_und_atomar_schreiben() {
    let ordner = tmp("vorrat-abi");
    // Erster Lauf: keine Kammer → -1; danach gespeichert.
    let (code, e) = lauf(VORRAT_WAT, Optionen { vorrat: Some(ordner.clone()), ..Default::default() });
    assert_eq!(code, 0);
    assert_eq!(ausgaben(&e), vec!["1", "-"]);
    let datei = ordner.join("k.json");
    assert_eq!(std::fs::read_to_string(&datei).unwrap(), r#"{"v":1,"name":"k","eintraege":[["a",7]]}"#);
    // Keine Temp-Dateien übrig.
    assert_eq!(std::fs::read_dir(&ordner).unwrap().count(), 1);
    // Zweiter Lauf: Einträge kommen roh zurück (Retry über zu kleinen Puffer).
    let (_, e) = lauf(VORRAT_WAT, Optionen { vorrat: Some(ordner.clone()), ..Default::default() });
    assert_eq!(ausgaben(&e), vec!["1", r#"[["a",7]]"#]);
    // Speichern schlägt fehl (Ordner ist eine Datei) → < 0.
    let (_, e) = lauf(VORRAT_WAT, Optionen { vorrat: Some(datei.clone()), ..Default::default() });
    assert_eq!(ausgaben(&e), vec!["1", "-", "-"]);
    let _ = std::fs::remove_dir_all(&ordner);
}

const SAAT_ECHTZEIT_WAT: &str = r#"(module
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (import "pizza" "echtzeit_ms" (func $echt (result f64)))
  (memory (export "memory") 1)
  (global $saat (mut f64) (f64.const 42))
  (data (i32.const 0) "ja")
  (func (export "saat_setzen") (param f64) local.get 0 global.set $saat)
  (func (export "start") (result i32)
    (if (f64.eq (global.get $saat) (f64.const 7)) (then (call $ausgabe (i32.const 0) (i32.const 2))))
    (if (f64.eq (call $echt) (f64.const 1235)) (then (call $ausgabe (i32.const 0) (i32.const 2))))
    i32.const 0))"#;

#[test]
fn saat_und_echtzeit() {
    let (code, e) = lauf(SAAT_ECHTZEIT_WAT, Optionen { saat: Some(7.0), echtzeit: Some(1234.5), ..Default::default() });
    assert_eq!(code, 0);
    assert_eq!(ausgaben(&e), vec!["ja", "ja"]);
    // Ohne Optionen: Modul-Standard 42, Systemzeit.
    let (_, e) = lauf(SAAT_ECHTZEIT_WAT, Optionen::default());
    assert!(ausgaben(&e).is_empty());
}

#[test]
fn unbekannter_import_ist_ladefehler() {
    let wat = r#"(module
  (import "pizza" "ausgabe" (func (param i32 i32)))
  (import "pizza" "zauber_wirken" (func))
  (memory (export "memory") 1)
  (func (export "start") (result i32) i32.const 0))"#;
    let (code, e) = lauf(wat, Optionen::default());
    assert_eq!(code, 2);
    assert_eq!(
        e,
        vec![
            Ereignis::Fehler {
                code: "HOST".into(),
                art: "intern".into(),
                text: "PizzaFehler HOST: Dieses Programm braucht die Funktion 'pizza.zauber_wirken' (Gruppe zauber), die dieser Host nicht kennt – bitte pizza-host aktualisieren.".into(),
                zeile: None,
                spalte: None,
                detail: None,
            },
            Ereignis::Ende { exit_code: 2, schritte: 0.0, zeit_ms: 0.0 },
        ]
    );
}

/// Zähler-Programm: liest Kammer „spielstand“ (Inhalt wird ausgegeben, sonst "neu") und speichert einen festen Stand.
const ZAEHLER_WAT: &str = r#"(module
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (import "pizza" "vorrat_lesen" (func $lesen (param i32 i32 i32 i32) (result i32)))
  (import "pizza" "vorrat_schreiben" (func $schreiben (param i32 i32 i32 i32 i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "spielstandneu")
  (data (i32.const 16) "{\"v\":1,\"name\":\"spielstand\",\"eintraege\":[[\"pizzen\",42]]}")
  (data (i32.const 128) "{\"schluessel\":\"pizzen\",\"wert\":42}")
  (func (export "abi_version") (result i32) i32.const 1)
  (func (export "saat_setzen") (param f64))
  (func (export "start") (result i32) (local $n i32)
    (drop (call $lesen (i32.const 0) (i32.const 10) (i32.const 0) (i32.const -1)))
    (local.set $n (call $lesen (i32.const 0) (i32.const 10) (i32.const 1024) (i32.const 4096)))
    (if (i32.lt_s (local.get $n) (i32.const 0))
      (then (call $ausgabe (i32.const 10) (i32.const 3)))
      (else (call $ausgabe (i32.const 1024) (local.get $n))))
    (drop (call $schreiben (i32.const 0) (i32.const 10) (i32.const 16) (i32.const 55) (i32.const 128) (i32.const 33)))
    i32.const 0))"#;

#[test]
fn spielstand_ueberlebt_zwei_exe_laeufe() {
    let dir = tmp("vorrat-exe");
    std::fs::create_dir_all(&dir).unwrap();
    let karton = dir.join("zaehler.pkarton");
    std::fs::write(&karton, wat::parse_str(ZAEHLER_WAT).unwrap()).unwrap();
    let exe = dir.join(format!("zaehler{}", std::env::consts::EXE_SUFFIX));
    let st = Command::new(env!("CARGO_BIN_EXE_pizza-host")).arg("exe").arg(&karton).arg("-o").arg(&exe).status().unwrap();
    assert!(st.success());
    let vorrat = dir.join("vorrat");
    let vorrat_opt = format!("--vorrat={}", vorrat.display());
    let lauf = |args: &[&str]| {
        let out = Command::new(&exe).args(args).stdin(Stdio::null()).output().unwrap();
        (
            out.status.code(),
            String::from_utf8_lossy(&out.stdout).replace("\r\n", "\n"),
            String::from_utf8_lossy(&out.stderr).replace("\r\n", "\n"),
        )
    };

    // 1. Lauf: kein Stand; ohne --saat erscheint „Saat: N“ (echte Saat) auf stderr.
    let (code, out, err) = lauf(&[&vorrat_opt]);
    assert_eq!((code, out.as_str()), (Some(0), "neu\n"));
    assert!(err.starts_with("Saat: ") && err.trim_end()["Saat: ".len()..].parse::<u32>().is_ok(), "{:?}", err);
    assert_eq!(
        std::fs::read_to_string(vorrat.join("spielstand.json")).unwrap(),
        r#"{"v":1,"name":"spielstand","eintraege":[["pizzen",42]]}"#
    );
    // 2. Lauf: der Stand ist wieder da; mit --saat keine Saat-Zeile.
    let (code, out, err) = lauf(&[&vorrat_opt, "--saat=7"]);
    assert_eq!(code, Some(0));
    assert_eq!(out, "[[\"pizzen\",42]]
");
    assert_eq!(err, "");
    // Löschen mit den CLI-Texten (K-088), danach fängt das Programm neu an.
    let (code, out, _) = lauf(&[&vorrat_opt, "--vorrat-loeschen", "spielstand"]);
    assert_eq!((code, out.as_str()), (Some(0), "Vorrat 'spielstand' gelöscht.
"));
    let (code, out, _) = lauf(&[&vorrat_opt, "--vorrat-loeschen", "spielstand"]);
    assert_eq!((code, out.as_str()), (Some(0), "Vorrat 'spielstand' gibt es nicht.
"));
    let (code, _, err) = lauf(&[&vorrat_opt, "--vorrat-loeschen=Spielstand"]);
    assert_eq!(code, Some(2));
    assert_eq!(err, "Ungültiger Kammername 'Spielstand' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).
");
    let (code, out, _) = lauf(&[&vorrat_opt, "--kein-vorrat", "--saat=1"]);
    assert_eq!((code, out.as_str()), (Some(0), "neu
"));
    assert!(!vorrat.join("spielstand.json").exists());
    let (code, out, _) = lauf(&[&vorrat_opt, "--saat=1"]);
    assert_eq!((code, out.as_str()), (Some(0), "neu
"));
    let (code, out, _) = lauf(&[&vorrat_opt, "--vorrat-loeschen-alle"]);
    assert_eq!((code, out.as_str()), (Some(0), "Alle Vorräte gelöscht.
"));
    assert!(!vorrat.join("spielstand.json").exists());
    let _ = std::fs::remove_dir_all(&dir);
}
