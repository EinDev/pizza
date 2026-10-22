//! Gruppe `kueche` (HOST-ABI §2/§3, src/kueche.rs) mit einem handgeschriebenen Modul: Schnappschuss, Berichte,
//! Retry (K-013), frühes Beenden (D3), Trap im Klon, verbotene Imports im Klon, `--koeche=1`, Chaos-Planung.

use pizzahost::ereignis::{Ereignis, Senke};
use pizzahost::laufen::{fuehre_aus, Optionen, INTERNER_FEHLER};

/// Modul mit 4 Stücken. Stück i meldet Status 1, wenn i == `abbruch`; trappt, wenn i == `trap`; ruft `ausgabe`, wenn
/// i == `ausgabe`. Bericht = u32 Status + Ziffer i + Ziffer des Merkers (in der Hauptinstanz vor dem Auftrag auf 7 gesetzt).
fn modul(abbruch: i32, trap: i32, ausgabe: i32) -> Vec<u8> {
    let src = format!(
        r#"(module
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (import "pizza" "kueche_auftrag" (func $auftrag (param i32 i32) (result i32)))
  (import "pizza" "kueche_bericht" (func $bericht (param i32 i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "-2inline")
  (func (export "kueche_stueck") (param $a i32) (param $i i32) (result i32 i32)
    (if (i32.eq (local.get $i) (i32.const {trap})) (then unreachable))
    (if (i32.eq (local.get $i) (i32.const {ausgabe})) (then (call $ausgabe (i32.const 0) (i32.const 2))))
    (i32.store (i32.const 2000) (i32.eq (local.get $i) (i32.const {abbruch})))
    (i32.store8 (i32.const 2004) (i32.add (i32.const 48) (local.get $i)))
    (i32.store8 (i32.const 2005) (i32.add (i32.const 48) (i32.load (i32.const 100))))
    (i32.const 2000) (i32.const 6))
  (func (export "start") (result i32)
    (local $i i32) (local $n i32)
    (i32.store (i32.const 100) (i32.const 7))
    (if (i32.eq (call $auftrag (i32.const 64) (i32.const 4)) (i32.const -1))
      (then (call $ausgabe (i32.const 2) (i32.const 6)) (return (i32.const 0))))
    (local.set $i (i32.const 1))
    (block $aus (loop $l
      (br_if $aus (i32.gt_s (local.get $i) (i32.const 4)))
      ;; erst mit zu kleinem Puffer (K-013: Länge, nichts geschrieben), dann richtig
      (local.set $n (call $bericht (local.get $i) (i32.const 1000) (i32.const 2)))
      (if (i32.gt_s (local.get $n) (i32.const 2))
        (then (local.set $n (call $bericht (local.get $i) (i32.const 1000) (i32.const 100)))))
      (if (i32.eq (local.get $n) (i32.const -2))
        (then (call $ausgabe (i32.const 0) (i32.const 2)))
        (else (call $ausgabe (i32.const 1004) (i32.sub (local.get $n) (i32.const 4)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $l)))
    (i32.const 0)))"#
    );
    wat::parse_str(src).expect("WAT")
}

fn lauf(wasm: &[u8], koeche: usize, chaos: Option<u64>) -> (i32, Vec<Ereignis>) {
    let mut s = Senke::Sammeln(Vec::new());
    let opt = Optionen { koeche: Some(koeche), kuechen_chaos: chaos, ..Default::default() };
    let code = fuehre_aus(wasm, &[], opt, &mut s);
    match s {
        Senke::Sammeln(v) => (code, v),
        _ => unreachable!(),
    }
}

fn ausgaben(e: &[Ereignis]) -> Vec<String> {
    e.iter()
        .filter_map(|e| match e {
            Ereignis::Ausgabe { text, .. } => Some(text.clone()),
            _ => None,
        })
        .collect()
}

#[test]
fn koeche_liefern_berichte_aus_dem_schnappschuss() {
    let (code, e) = lauf(&modul(0, 0, 0), 4, None);
    assert_eq!(code, 0);
    assert_eq!(ausgaben(&e), ["17", "27", "37", "47"]);
}

#[test]
fn ein_koch_heisst_inline() {
    let (code, e) = lauf(&modul(0, 0, 0), 1, None);
    assert_eq!(code, 0);
    assert_eq!(ausgaben(&e), ["inline"]);
}

#[test]
fn frueher_abbruch_beendet_spaetere_stuecke() {
    // Stück 2 bricht ab: Berichte 1 und 2, danach -2 – auch wenn 3 trappen würde (D3: der frühere Abbruch gewinnt).
    for chaos in [None, Some(1), Some(2), Some(3)] {
        let (code, e) = lauf(&modul(2, 3, 0), 4, chaos);
        assert_eq!(code, 0, "{:?}", e);
        assert_eq!(ausgaben(&e), ["17", "27", "-2", "-2"]);
    }
}

#[test]
fn trap_im_klon_ist_interner_fehler() {
    // Stück 2 trappt vor dem Abbruch in Stück 3 → interner Fehler (K-014), Exit 1, keine Berichte.
    let (code, e) = lauf(&modul(3, 2, 0), 4, None);
    assert_eq!(code, 1);
    assert!(ausgaben(&e).is_empty());
    assert!(matches!(&e[0], Ereignis::Fehler { text, detail: Some(_), .. } if text == INTERNER_FEHLER), "{:?}", e);
}

#[test]
fn klon_darf_nicht_ausgeben() {
    let (code, e) = lauf(&modul(0, 0, 1), 4, None);
    assert_eq!(code, 1);
    assert!(matches!(&e[0], Ereignis::Fehler { detail: Some(d), .. } if d.contains("Klon rief pizza.ausgabe")), "{:?}", e);
}

#[test]
fn chaos_aendert_nichts() {
    for chaos in 0..8 {
        for koeche in [2, 3, 4, 8] {
            let (code, e) = lauf(&modul(0, 0, 0), koeche, Some(chaos));
            assert_eq!((code, ausgaben(&e)), (0, vec!["17".to_string(), "27".into(), "37".into(), "47".into()]));
        }
    }
}
