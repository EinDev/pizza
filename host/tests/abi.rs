//! ABI-Tests mit handgeschriebenen Modulen (WAT), unabhängig vom Compiler.

use pizzahost::ereignis::{Ereignis, Senke};
use pizzahost::laufen::{fuehre_aus, Optionen};

fn lauf(wat_src: &str, args: &[&str], opt: Optionen) -> (i32, Vec<Ereignis>) {
    let wasm = wat::parse_str(wat_src).expect("WAT");
    let mut s = Senke::Sammeln(Vec::new());
    let args: Vec<String> = args.iter().map(|a| a.to_string()).collect();
    let code = fuehre_aus(&wasm, &args, &opt, &mut s);
    match s {
        Senke::Sammeln(v) => (code, v),
        _ => unreachable!(),
    }
}

const KOPF: &str = r#"
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (import "pizza" "fehlerausgabe" (func $fehlerausgabe (param i32 i32)))
  (import "pizza" "warnung" (func $warnung (param i32 i32 i32 i32 i32 i32)))
  (import "pizza" "fehler" (func $fehler (param i32 i32 i32 i32 i32 i32 i32)))
  (import "pizza" "panik" (func $panik (param i32 i32)))
  (memory (export "memory") 1)
  (global $schritte (mut f64) (f64.const 0))
  (global $limit (mut f64) (f64.const 5000000))
  (global $argende (mut i32) (i32.const 1024))
  (global $argn (mut i32) (i32.const 0))
  (func (export "abi_version") (result i32) i32.const 1)
  (func (export "schritte") (result f64) global.get $schritte)
  (func (export "zeitMs") (result f64) (f64.add (global.get $schritte) (f64.const 1000)))
  (func (export "limit_setzen") (param f64) local.get 0 global.set $limit)
  ;; Argumente hintereinander ab 1024 ablegen, jeweils ausgeben im start
  (func (export "arg_puffer") (param i32) (result i32) global.get $argende)
  (func (export "arg_fertig") (param i32)
    (call $ausgabe (global.get $argende) (local.get 0))
    (global.set $argende (i32.add (global.get $argende) (local.get 0)))
    (global.set $argn (i32.add (global.get $argn) (i32.const 1))))
"#;

#[test]
fn ereignisse_und_exitcode() {
    let src = format!(
        r#"(module {KOPF}
  (data (i32.const 0) "Hallo Pizza\c3\a4W0666Typ hawaii")
  (func (export "start") (result i32)
    (call $ausgabe (i32.const 0) (i32.const 13))
    (call $fehlerausgabe (i32.const 0) (i32.const 5))
    (call $warnung (i32.const 13) (i32.const 5) (i32.const 18) (i32.const 10) (i32.const 3) (i32.const 0))
    (call $fehler (i32.const 2) (i32.const 13) (i32.const 5) (i32.const 0) (i32.const 5) (i32.const 0) (i32.const 0))
    (global.set $schritte (global.get $limit))
    i32.const 2))"#
    );
    let (code, e) = lauf(&src, &["eins", "zwei"], Optionen { schritt_limit: Some(42.0), ..Default::default() });
    assert_eq!(code, 2);
    assert_eq!(
        e,
        vec![
            Ereignis::Ausgabe { text: "eins".into(), umbruch: true },
            Ereignis::Ausgabe { text: "zwei".into(), umbruch: true },
            Ereignis::Ausgabe { text: "Hallo Pizzaä".into(), umbruch: true },
            Ereignis::Fehlerausgabe { text: "Hallo".into() },
            Ereignis::Warnung { code: "W0666".into(), text: "Typ hawaii".into(), zeile: Some(3), spalte: None },
            Ereignis::Fehler { code: "W0666".into(), art: "ananas".into(), text: "Hallo".into(), zeile: None, spalte: None, detail: None },
            Ereignis::Ende { exit_code: 2, schritte: 42.0, zeit_ms: 1042.0 },
        ]
    );
}

#[test]
fn panik_bricht_ab_mit_39() {
    let src = format!(
        r#"(module {KOPF}
  (data (i32.const 0) "PANIK")
  (func (export "start") (result i32)
    (global.set $schritte (f64.const 7))
    (call $panik (i32.const 0) (i32.const 5))
    (call $ausgabe (i32.const 0) (i32.const 5))
    i32.const 0))"#
    );
    let (code, e) = lauf(&src, &[], Optionen::default());
    assert_eq!(code, 39);
    assert_eq!(
        e,
        vec![Ereignis::Panik { text: "PANIK".into() }, Ereignis::Ende { exit_code: 39, schritte: 7.0, zeit_ms: 1007.0 }]
    );
}

#[test]
fn trap_wird_laufzeitananas() {
    let src = format!(r#"(module {KOPF} (func (export "start") (result i32) unreachable))"#);
    let (code, e) = lauf(&src, &[], Optionen::default());
    assert_eq!(code, 1);
    match &e[0] {
        Ereignis::Fehler { code, art, text, zeile, detail, .. } => {
            assert_eq!(code, "LaufzeitAnanas");
            assert_eq!(art, "ananas");
            assert_eq!(text, "Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.");
            assert_eq!(*zeile, None);
            assert!(detail.as_deref().map(|d| !d.is_empty()).unwrap_or(false));
        }
        x => panic!("{:?}", x),
    }
    assert!(matches!(e[1], Ereignis::Ende { exit_code: 1, .. }));
}

#[test]
fn tiefe_rekursion_erlaubt() {
    // HOST-ABI §6: ≥ 16 384 verschachtelte Wasm-Aufrufe.
    let src = format!(
        r#"(module {KOPF}
  (func $r (param i32) (result i32)
    (if (result i32) (i32.eqz (local.get 0)) (then (i32.const 0))
      (else (i32.add (i32.const 1) (call $r (i32.sub (local.get 0) (i32.const 1)))))))
  (func (export "start") (result i32) (i32.sub (call $r (i32.const 20000)) (i32.const 20000))))"#
    );
    let (code, _) = lauf(&src, &[], Optionen::default());
    assert_eq!(code, 0);
}

#[test]
fn falsche_abi_version() {
    let src = r#"(module (memory (export "memory") 1)
      (func (export "abi_version") (result i32) i32.const 2)
      (func (export "start") (result i32) i32.const 0))"#;
    let (code, e) = lauf(src, &[], Optionen::default());
    assert_eq!(code, 2);
    match &e[0] {
        Ereignis::Fehler { code, art, text, .. } => {
            assert_eq!(code, "HOST");
            assert_eq!(art, "intern");
            assert!(text.starts_with("PizzaFehler HOST: "), "{}", text);
        }
        x => panic!("{:?}", x),
    }
    assert_eq!(e[1], Ereignis::Ende { exit_code: 2, schritte: 0.0, zeit_ms: 0.0 });
    // Kein Wasm überhaupt → ebenfalls Ladefehler.
    let mut senke = Senke::Sammeln(Vec::new());
    assert_eq!(fuehre_aus(b"keine pizza", &[], &Optionen::default(), &mut senke), 2);
}

#[test]
fn ungueltiger_exit_code_ist_interner_fehler() {
    let src = r#"(module (memory (export "memory") 1) (func (export "start") (result i32) i32.const 7))"#;
    let (code, e) = lauf(src, &[], Optionen::default());
    assert_eq!(code, 1);
    assert!(matches!(&e[0], Ereignis::Fehler { code, text, .. } if code == "LaufzeitAnanas" && text.ends_with("Interner Fehler im Ofen.")));
    assert!(matches!(e[1], Ereignis::Ende { exit_code: 1, .. }));
}

#[test]
fn json_format() {
    let e = Ereignis::Fehler { code: "B0012".into(), art: "pizzafehler".into(), text: "a \"b\"\nc".into(), zeile: Some(3), spalte: None, detail: None };
    assert_eq!(
        e.als_json(),
        r#"{"typ":"fehler","code":"B0012","art":"pizzafehler","text":"a \"b\"\nc","zeile":3,"spalte":null}"#
    );
    assert_eq!(Ereignis::Ende { exit_code: 0, schritte: 160.0, zeit_ms: 160.0 }.als_json(), r#"{"typ":"ende","exitCode":0,"schritte":160,"zeitMs":160}"#);
    assert_eq!(Ereignis::Ende { exit_code: 0, schritte: 1e21, zeit_ms: 10.5 }.als_json(), r#"{"typ":"ende","exitCode":0,"schritte":1e+21,"zeitMs":10.5}"#);
    let d = Ereignis::Fehler { code: "LaufzeitAnanas".into(), art: "ananas".into(), text: "t".into(), zeile: None, spalte: None, detail: Some("unreachable".into()) };
    assert_eq!(d.als_json(), r#"{"typ":"fehler","code":"LaufzeitAnanas","art":"ananas","text":"t","zeile":null,"spalte":null,"detail":"unreachable"}"#);
}

#[test]
fn eingabe_leeren_schreibe() {
    let src = r#"(module
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (import "pizza" "schreibe" (func $schreibe (param i32 i32)))
  (import "pizza" "leeren" (func $leeren))
  (import "pizza" "eingabe" (func $eingabe (param i32 i32 i32 i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "Name? ")
  (func (export "start") (result i32) (local $n i32)
    (call $schreibe (i32.const 0) (i32.const 6))
    (call $leeren)
    ;; K-013: Puffer zu klein (4) → benötigte Länge, nichts geschrieben; Retry mit 64.
    (local.set $n (call $eingabe (i32.const 0) (i32.const 0) (i32.const 6) (i32.const 100) (i32.const 4)))
    (if (i32.ne (local.get $n) (i32.const 11)) (then unreachable))
    (if (i32.ne (i32.load8_u (i32.const 100)) (i32.const 0)) (then unreachable))
    (local.set $n (call $eingabe (i32.const 0) (i32.const 0) (i32.const 6) (i32.const 100) (i32.const 64)))
    (call $ausgabe (i32.const 100) (local.get $n))
    (local.set $n (call $eingabe (i32.const 1) (i32.const 0) (i32.const -1) (i32.const 100) (i32.const 64)))
    (call $ausgabe (i32.const 100) (local.get $n))
    ;; EOF → -1, auch wiederholt (K-042)
    (drop (call $eingabe (i32.const 0) (i32.const 0) (i32.const -1) (i32.const 100) (i32.const 64)))
    (if (i32.ne (call $eingabe (i32.const 0) (i32.const 0) (i32.const -1) (i32.const 100) (i32.const 64)) (i32.const -1)) (then unreachable))
    i32.const 0))"#;
    let opt = Optionen { eingabe: Some(vec!["Pizzaioloä".to_string(), "zwei".to_string()]), ..Default::default() };
    let (code, e) = lauf(src, &[], opt);
    assert_eq!(code, 0, "{:?}", e);
    assert_eq!(
        &e[..],
        &[
            Ereignis::Ausgabe { text: "Name? ".into(), umbruch: false },
            Ereignis::Leeren,
            Ereignis::Eingabe { text: Some("Pizzaioloä".into()) },
            Ereignis::Ausgabe { text: "Pizzaioloä".into(), umbruch: true },
            Ereignis::Eingabe { text: Some("zwei".into()) },
            Ereignis::Ausgabe { text: "zwei".into(), umbruch: true },
            Ereignis::Eingabe { text: None },
            Ereignis::Eingabe { text: None },
            Ereignis::Ende { exit_code: 0, schritte: 0.0, zeit_ms: 0.0 },
        ]
    );
}
