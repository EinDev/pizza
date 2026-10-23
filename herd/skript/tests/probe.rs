//! H-K0: Szenen-Skript mit der Test-Komponente `Probe` (dev-dependency mit Feature `probe`). Prüft die neuen Feldtypen,
//! Lesefeld, Nachtragsfeld und Nachlauf über denselben Skript-Weg wie `node herd/test-kern.js` (dort fehlt Probe).

use herd_skript::{lies, Spieler, Zeilen};

fn werte(zeilen: &[String], aufruf: &str) -> Vec<String> {
    zeilen
        .iter()
        .filter_map(|z| {
            let mut t = z.splitn(3, ' ');
            let (_, name, wert) = (t.next()?, t.next()?, t.next()?);
            (name == aufruf).then(|| wert.to_string())
        })
        .collect()
}

#[test]
fn probe_skript_listen_lesefeld_nachtrag_nachlauf() {
    let pfad = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/probe.herd");
    let s = lies(&std::fs::read_to_string(pfad).unwrap()).unwrap();
    let mut sp = Spieler::neu(&[]);
    let mut aus = Zeilen::default();
    sp.spiele(&s, &mut aus).unwrap();
    let z = &aus.zeilen;
    let (a, b, d) = (sp.vars["a"], sp.vars["b"], sp.vars["d"]);
    assert_eq!(werte(z, "hole_liste"), [format!("[{},{},{},{}]", b, a, b, d), format!("[{},{}]", a, d)]);
    let f = |x: f64| format!("f{:016x}", x.to_bits());
    // hole_zahl: teil-liste (4, dann nach Entfernen gezählt nur lebende) … zahl-liste … Lesefeld
    assert_eq!(werte(z, "hole_zahl"), [f(4.0), f(4.0), f(5.0)]);
    let h = werte(z, "hash_szene");
    assert_eq!(h[1], h[2], "Lesen der teil-liste ändert den Szenen-Hash nicht");
    assert_ne!(h[0], h[1]);
    assert_ne!(h[3], h[4], "Nachtragsfeld ≠ Standard → im Hash");
    assert_eq!(h[3], h[5], "Nachtragsfeld = Standard → wie ohne");
    let liste = format!("[{},{},{},{}]", f(1.5), f(-0.0), f(100.0), f(-100.0));
    assert_eq!(werte(z, "hole_zahlen"), [liste.clone(), liste]);
    assert_eq!(
        werte(z, "fehler_text"),
        [
            format!("\"Teil {} ist schon entfernt.\"", b),
            "\"Teil 0 gibt es nicht.\"".to_string(),
            "\"Probe.ziele braucht ein Blech aus Teilen, nicht 3.\"".to_string(),
            "\"Probe.werte muss zwischen -100 und 100 liegen, nicht 101.\"".to_string(),
            "\"Probe.wert braucht eine Zahl, nicht ein Blech.\"".to_string(),
            "\"Probe.stand kann man nur lesen.\"".to_string(),
            "\"Probe.stand kann man nur lesen.\"".to_string(),
        ]
    );
    assert_eq!(werte(z, "fehler_code"), ["32"]);
    assert_eq!(werte(z, "melde_typfehler"), ["-2"]);
    assert_eq!(z.iter().filter(|l| l.starts_with("B ")).count(), 2);
}
