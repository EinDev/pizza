//! Mini-Benchmark der Engine (nur manuell): `cargo test --release --test bench -- --ignored --nocapture`

use pizzahost::ereignis::Senke;
use pizzahost::laufen::{fuehre_aus, Optionen};

#[test]
#[ignore]
fn schleife_und_rekursion() {
    let wat = r#"(module
  (memory (export "memory") 1)
  (func $fib (param i32) (result i32)
    (if (result i32) (i32.lt_s (local.get 0) (i32.const 2)) (then (local.get 0))
      (else (i32.add (call $fib (i32.sub (local.get 0) (i32.const 1))) (call $fib (i32.sub (local.get 0) (i32.const 2)))))))
  (func (export "start") (result i32) (local $i i32) (local $s f64)
    (loop $l
      (local.set $s (f64.add (local.get $s) (f64.convert_i32_s (local.get $i))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $l (i32.lt_s (local.get $i) (i32.const 400000000))))
    (i32.and (call $fib (i32.const 33)) (i32.const 0))))"#;
    let wasm = wat::parse_str(wat).unwrap();
    let t = std::time::Instant::now();
    let code = fuehre_aus(&wasm, &[], Optionen::default(), &mut Senke::Sammeln(vec![]));
    println!("BENCH: {} ms (exit {})", t.elapsed().as_millis(), code);
}
