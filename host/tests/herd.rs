//! Gruppe `herd` (HOST-ABI §2, src/herd.rs, src/herd_fenster.rs): Importe auf dem nativen Kern, Kopierweg, Ereignis
//! `herd`, `--ui-ereignisse`, Kern fehlt, Klone, Vorprüfung (K-130) und Offscreen-PNG (K-129).
//! **Nie ein Fenster, nie die echte GPU:** alle Prozesse mit `PIZZA_KEIN_DIALOG=1` und `HERD_SOFTWARE=1` (tests/gemeinsam).
//! Die Läufe echter Beispiele (`site/beispiele/herd/`) kompilieren mit Node + `site/js/pizzaiolo.js` – fehlt eins davon,
//! werden sie mit Hinweis übersprungen.

use std::path::{Path, PathBuf};
use std::process::Stdio;

mod gemeinsam;
use gemeinsam::befehl;

use pizzahost::ereignis::{Ereignis, Senke};
use pizzahost::herd::HerdAnbindung;
use pizzahost::laufen::{fuehre_aus, Optionen, Ui, INTERNER_FEHLER};

/// Ein kleines Herd-Programm von Hand: Kern da? → Welt (Titel über den Kopierweg) → `fenster` → je `takt` ein Teil,
/// `takt`, `bild(n)`, Szenen-Hash zurück ins Programm (`herd_lies`) und ausgeben, `bild`-Ereignis mit Paketlänge.
const WAT: &str = r#"(module
  (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
  (import "pizza" "herd_kern" (func $kern (param i32) (result i32)))
  (import "pizza" "herd_schreibe" (func $schreibe (param i32 i32 i32)))
  (import "pizza" "herd_lies" (func $lies (param i32 i32 i32)))
  (import "pizza" "herd_warte" (func $warte (param i32 i32) (result i32)))
  (import "pizza" "herd_senden" (func $senden (param i32 i32 i32)))
  (import "herd" "puffer" (func $puffer (param i32) (result i32)))
  (import "herd" "welt_neu" (func $welt (param f64 f64 i32 i32) (result i32)))
  (import "herd" "teil_neu" (func $teil (param i32) (result i32)))
  (import "herd" "takt" (func $takt (result i32)))
  (import "herd" "bild" (func $bild (param i32) (result i32)))
  (import "herd" "hash_szene" (func $hash (param i32) (result i32)))
  (import "herd" "fehler_text" (func $ftext (param i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 0) "Probe")
  (data (i32.const 100) "{\"art\":\"fenster\",\"titel\":\"Probe\",\"breite\":320,\"hoehe\":180}")
  (data (i32.const 200) "{\"art\":\"bild\",\"bildnummer\":1}")
  (data (i32.const 300) "{\"art\":\"schliesse\"}")
  (func (export "start") (result i32) (local $p i32) (local $n i32) (local $nr i32) (local $len i32)
    (if (i32.ne (call $kern (i32.const 1)) (i32.const 1)) (then (return (i32.const 2))))
    (local.set $p (call $puffer (i32.const 64)))
    (call $schreibe (local.get $p) (i32.const 0) (i32.const 5))
    ;; zu klein: 10 × 10 → Fehler, Text mit Retry (kap 0 → Länge, nichts geschrieben)
    (drop (call $welt (f64.const 10) (f64.const 10) (local.get $p) (i32.const 5)))
    (local.set $n (call $ftext (local.get $p) (i32.const 0)))
    (local.set $p (call $puffer (local.get $n)))
    (drop (call $ftext (local.get $p) (local.get $n)))
    (call $lies (i32.const 2000) (local.get $p) (local.get $n))
    (call $ausgabe (i32.const 2000) (local.get $n))
    (call $schreibe (local.get $p) (i32.const 0) (i32.const 5))
    (drop (call $welt (f64.const 320) (f64.const 180) (local.get $p) (i32.const 5)))
    (call $senden (i32.const 100) (i32.const 58) (i32.const -1))
    (block $raus (loop $l
      (local.set $n (call $warte (i32.const 1000) (i32.const 512)))
      (br_if $raus (i32.lt_s (local.get $n) (i32.const 0)))
      ;; {"typ":"geschlossen"} → Byte 8 = 'g'
      (br_if $raus (i32.eq (i32.load8_u (i32.const 1008)) (i32.const 103)))
      (local.set $nr (i32.add (local.get $nr) (i32.const 1)))
      (drop (call $teil (i32.const 2)))
      (drop (call $takt))
      (local.set $len (call $bild (local.get $nr)))
      (drop (call $hash (local.get $p)))
      (call $lies (i32.const 3000) (local.get $p) (i32.const 16))
      (call $ausgabe (i32.const 3000) (i32.const 16))
      (call $senden (i32.const 200) (i32.const 29) (local.get $len))
      (br $l)))
    (call $senden (i32.const 300) (i32.const 19) (i32.const -1))
    (i32.const 0)))"#;

fn takte(n: usize) -> Ui {
    Ui::Vorgabe((0..n).map(|_| r#"{"typ":"takt","anzahl":1}"#.to_string()).collect())
}

/// Erwartete Szenen-Hashes direkt vom Kern (gleiche Aufrufe wie das Modul).
fn kern_hashes(n: usize) -> Vec<String> {
    let mut k = herd_kern::Kern::neu();
    k.welt_neu(10.0, 10.0, b"Probe");
    k.welt_neu(320.0, 180.0, b"Probe");
    (1..=n)
        .map(|nr| {
            k.teil_neu(2);
            k.takt();
            k.bild(nr as i32);
            String::from_utf8(herd_kern::hash::hex(k.hash_szene()).to_vec()).unwrap()
        })
        .collect()
}

#[test]
fn importe_auf_dem_nativen_kern() {
    let wasm = wat::parse_str(WAT).unwrap();
    let pakete = std::sync::Arc::new(std::sync::Mutex::new(Vec::<(String, usize)>::new()));
    let p2 = pakete.clone();
    let anbindung = HerdAnbindung(Box::new(move |art, _json, paket| {
        p2.lock().unwrap().push((art.to_string(), paket.map(|p| p.len()).unwrap_or(0)));
        if let Some(p) = paket {
            assert_eq!(&p[..4], b"HZP1");
        }
    }));
    let mut s = Senke::Sammeln(vec![]);
    let opt = Optionen { ui: Some(takte(3)), herd: Some(anbindung), ..Default::default() };
    let code = fuehre_aus(&wasm, &[], opt, &mut s);
    let Senke::Sammeln(e) = s else { unreachable!() };
    assert_eq!(code, 0, "{:?}", e);
    let aus: Vec<String> = e.iter().filter_map(|x| if let Ereignis::Ausgabe { text, .. } = x { Some(text.clone()) } else { None }).collect();
    assert!(aus[0].contains("64"), "Fehlertext Herd-Größe: {:?}", aus[0]);
    assert_eq!(&aus[1..], &kern_hashes(3)[..]);
    let herd: Vec<String> = e.iter().filter(|x| matches!(x, Ereignis::Herd { .. })).map(|x| x.als_json()).collect();
    assert_eq!(herd[0], r#"{"typ":"herd","art":"fenster","titel":"Probe","breite":320,"hoehe":180}"#);
    assert_eq!(herd[1], r#"{"typ":"herd","art":"bild","bildnummer":1}"#);
    assert_eq!(herd.last().unwrap(), r#"{"typ":"herd","art":"schliesse"}"#);
    let p = pakete.lock().unwrap();
    assert_eq!(p.iter().filter(|(a, n)| a == "bild" && *n > 32).count(), 3, "{:?}", p);
    assert_eq!(p.first().map(|x| x.0.as_str()), Some("fenster"));
}

#[test]
fn ohne_renderer_abfrage_null() {
    // herd_warte(_, -1) ohne Ereignisquelle → 0 (das Modul warnt dann W0104); mit Quelle → 1.
    let src = r#"(module
      (import "pizza" "ausgabe" (func $ausgabe (param i32 i32)))
      (import "pizza" "herd_warte" (func $warte (param i32 i32) (result i32)))
      (memory (export "memory") 1)
      (data (i32.const 0) "01")
      (func (export "start") (result i32)
        (call $ausgabe (i32.add (i32.const 0) (call $warte (i32.const 0) (i32.const -1))) (i32.const 1))
        (i32.const 0)))"#;
    let wasm = wat::parse_str(src).unwrap();
    for (ui, soll) in [(None, "0"), (Some(takte(1)), "1")] {
        let mut s = Senke::Sammeln(vec![]);
        assert_eq!(fuehre_aus(&wasm, &[], Optionen { ui, ..Default::default() }, &mut s), 0);
        let Senke::Sammeln(e) = s else { unreachable!() };
        assert!(matches!(&e[0], Ereignis::Ausgabe { text, .. } if text == soll), "{:?}", e);
    }
}

#[test]
fn unbekannter_herd_import_nennt_gruppe_herd() {
    let wasm = wat::parse_str(r#"(module (import "herd" "zaubere" (func)) (memory (export "memory") 1) (func (export "start") (result i32) i32.const 0))"#).unwrap();
    let mut s = Senke::Sammeln(vec![]);
    assert_eq!(fuehre_aus(&wasm, &[], Optionen::default(), &mut s), 2);
    let Senke::Sammeln(e) = s else { unreachable!() };
    assert!(
        matches!(&e[0], Ereignis::Fehler { text, .. } if text.contains("'herd.zaubere' (Gruppe herd)")),
        "{:?}",
        e
    );
}

#[test]
fn klon_ruft_herd_ist_trap() {
    // Stück 2 ruft herd.teil_neu → Trap im Klon → interner Fehler (HOST-ABI §2 „Klone“).
    let src = r#"(module
      (import "pizza" "kueche_auftrag" (func $auftrag (param i32 i32) (result i32)))
      (import "pizza" "kueche_bericht" (func $bericht (param i32 i32 i32) (result i32)))
      (import "herd" "teil_neu" (func $teil (param i32) (result i32)))
      (memory (export "memory") 1)
      (func (export "kueche_stueck") (param $a i32) (param $i i32) (result i32 i32)
        (if (i32.eq (local.get $i) (i32.const 2)) (then (drop (call $teil (i32.const 2)))))
        (i32.const 2000) (i32.const 4))
      (func (export "start") (result i32)
        (if (i32.eq (call $auftrag (i32.const 64) (i32.const 4)) (i32.const -1)) (then (return (i32.const 0))))
        (drop (call $bericht (i32.const 1) (i32.const 1000) (i32.const 100)))
        (i32.const 0)))"#;
    let wasm = wat::parse_str(src).unwrap();
    let mut s = Senke::Sammeln(vec![]);
    let code = fuehre_aus(&wasm, &[], Optionen { koeche: Some(4), ..Default::default() }, &mut s);
    let Senke::Sammeln(e) = s else { unreachable!() };
    assert_eq!(code, 1, "{:?}", e);
    assert!(
        matches!(&e[0], Ereignis::Fehler { text, detail: Some(d), .. } if text == INTERNER_FEHLER && d.contains("Klon rief herd.teil_neu")),
        "{:?}",
        e
    );
}

fn temp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("pizza-herd-test-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    d.join(name)
}

fn wat_datei(name: &str) -> PathBuf {
    let p = temp(name);
    std::fs::write(&p, wat::parse_str(WAT).unwrap()).unwrap();
    p
}

#[test]
fn kern_fehlt_meldet_host_fehler() {
    let karton = wat_datei("kern-fehlt.pkarton");
    let out = befehl(env!("CARGO_BIN_EXE_pizza-host"))
        .args(["--ereignisse-json", "--kein-vorrat"])
        .arg(&karton)
        .env("PIZZA_TEST_OHNE_HERD_KERN", "1")
        .stdin(Stdio::null())
        .output()
        .unwrap();
    let t = String::from_utf8_lossy(&out.stdout);
    assert_eq!(out.status.code(), Some(2), "{}", t);
    assert!(t.starts_with(r#"{"typ":"fehler","code":"HOST","art":"intern","text":"PizzaFehler HOST: Der Herd-Kern fehlt (kern.wasm).","datei":null,"zeile":null,"spalte":null}"#), "{}", t);
}

#[test]
fn ohne_grafik_meldung_und_exit_2_vor_dem_start() {
    // Fensterbetrieb (kein JSON, keine Vorgabe) – die Vorprüfung scheitert, bevor Anzeige oder GPU angefasst werden.
    let karton = wat_datei("ohne-grafik.pkarton");
    for (var, text) in [
        ("PIZZA_TEST_OHNE_GRAFIK", "braucht für sein Herd-Fenster einen Grafiktreiber"),
        ("PIZZA_TEST_OHNE_ANZEIGE", "braucht einen Bildschirm für sein Herd-Fenster"),
    ] {
        let out = befehl(env!("CARGO_BIN_EXE_pizza-host")).arg("--kein-vorrat").arg(&karton).env(var, "1").stdin(Stdio::null()).output().unwrap();
        assert_eq!(out.status.code(), Some(2));
        assert!(out.stdout.is_empty(), "kein Wasm-Befehl vor der Prüfung");
        assert!(String::from_utf8_lossy(&out.stderr).contains(text), "{}", String::from_utf8_lossy(&out.stderr));
    }
}

#[test]
fn ui_ereignisse_und_pizza_herd_0_sind_fensterlos() {
    let karton = wat_datei("fensterlos.pkarton");
    let ev = temp("takte.ereignisse");
    std::fs::write(&ev, "{\"typ\":\"takt\",\"anzahl\":1}\n{\"typ\":\"takt\",\"anzahl\":1}\n").unwrap();
    let out = befehl(env!("CARGO_BIN_EXE_pizza-host")).arg("--kein-vorrat").arg("--ui-ereignisse").arg(&ev).arg(&karton).stdin(Stdio::null()).output().unwrap();
    assert_eq!(out.status.code(), Some(0), "{}", String::from_utf8_lossy(&out.stderr));
    let zeilen: Vec<String> = String::from_utf8_lossy(&out.stdout).lines().map(String::from).collect();
    assert_eq!(&zeilen[1..], &kern_hashes(2)[..]);
    // PIZZA_HERD=0: keine Quelle → Modul endet sofort (warte -1), nichts gezeichnet
    let out = befehl(env!("CARGO_BIN_EXE_pizza-host")).arg("--kein-vorrat").arg(&karton).env("PIZZA_HERD", "0").stdin(Stdio::null()).output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    assert_eq!(String::from_utf8_lossy(&out.stdout).lines().count(), 1);
}

// ---------------------------------------------------------------- echte Beispiele (Node + Pizzaiolo)

fn wurzel() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..")
}

/// Kompiliert ein Beispiel mit Pizzaiolo (Node); `None` = Node/Compiler fehlt (Test wird übersprungen).
fn kompiliere(beispiel: &str) -> Option<PathBuf> {
    let w = wurzel();
    if !w.join("site/js/pizzaiolo.js").exists() {
        eprintln!("übersprungen: site/js/pizzaiolo.js fehlt");
        return None;
    }
    let ziel = temp(&format!("{}.pkarton", beispiel));
    let skript = "const p=require('path'),fs=require('fs');const w=process.argv[1];global.PizzaLang=require(p.join(w,'site/js/pizza.js'));\
const P=require(p.join(w,'site/js/pizzaiolo.js'));const k=P.kompiliere(fs.readFileSync(process.argv[2],'utf8'));\
if(!k.ok){console.error(JSON.stringify(k.fehler||k.nichtUnterstuetzt));process.exit(1)}fs.writeFileSync(process.argv[3],k.pkarton);";
    let r = std::process::Command::new("node")
        .args(["-e", skript])
        .arg(&w)
        .arg(w.join(format!("site/beispiele/herd/{}/hauptgang.pizza", beispiel)))
        .arg(&ziel)
        .output();
    match r {
        Ok(o) if o.status.success() => Some(ziel),
        Ok(o) => panic!("Pizzaiolo: {}", String::from_utf8_lossy(&o.stderr)),
        Err(_) => {
            eprintln!("übersprungen: node fehlt");
            None
        }
    }
}

fn kanonisch(z: &str) -> String {
    z.trim().to_string()
}

#[test]
fn beispiele_json_bitgleich_mit_herd_erwartet() {
    for b in ["hallo-herd", "muenzen"] { // Ein-Datei-Beispiele mit Eingabe (Steuerung lädt seit PB4 Bilddateien)
        let Some(karton) = kompiliere(b) else { return };
        let w = wurzel().join("site/beispiele/herd");
        let out = befehl(env!("CARGO_BIN_EXE_pizza-host"))
            .args(["--ereignisse-json", "--kein-vorrat", "--ui-ereignisse"])
            .arg(w.join(format!("{}/pruefung/ereignisse", b)))
            .arg(&karton)
            .stdin(Stdio::null())
            .output()
            .unwrap();
        assert_eq!(out.status.code(), Some(0), "{}", String::from_utf8_lossy(&out.stderr));
        let ist: Vec<String> = String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter(|z| z.starts_with(r#"{"typ":"herd","#))
            .map(|z| z.replacen(r#"{"typ":"herd","#, "{", 1))
            .collect();
        let soll: Vec<String> = std::fs::read_to_string(w.join(format!("{}/pruefung/herd-erwartet", b))).unwrap().lines().filter(|z| !z.trim().is_empty()).map(kanonisch).collect();
        assert_eq!(ist, soll, "{}", b);
    }
}

/// K-129: mittlere Abweichung ≤ 1,5 %, ≥ 98 % der Pixel innerhalb 10/255.
fn visuell_gleich(a: &[u8], b: &[u8]) -> Result<(), String> {
    if a.len() != b.len() {
        return Err(format!("Größe {} ≠ {}", a.len(), b.len()));
    }
    let (mut summe, mut nah, mut px) = (0u64, 0u64, 0u64);
    for (p, q) in a.chunks_exact(4).zip(b.chunks_exact(4)) {
        let d = (0..3).map(|i| (p[i] as i32 - q[i] as i32).unsigned_abs()).max().unwrap();
        summe += (0..3).map(|i| (p[i] as i32 - q[i] as i32).unsigned_abs() as u64).sum::<u64>();
        nah += (d <= 10) as u64;
        px += 1;
    }
    let mittel = summe as f64 / (px * 3 * 255) as f64;
    let anteil = nah as f64 / px as f64;
    if mittel <= 0.015 && anteil >= 0.98 {
        Ok(())
    } else {
        Err(format!("mittlere Abweichung {:.4}, innerhalb 10/255: {:.4}", mittel, anteil))
    }
}

fn lies_png(p: &Path) -> (u32, u32, Vec<u8>) {
    let d = png::Decoder::new(std::io::BufReader::new(std::fs::File::open(p).unwrap()));
    let mut r = d.read_info().unwrap();
    let mut buf = vec![0; r.output_buffer_size().unwrap()];
    let info = r.next_frame(&mut buf).unwrap();
    buf.truncate(info.buffer_size());
    (info.width, info.height, buf)
}

#[test]
fn offscreen_png_wie_referenz() {
    // `--herd-bilder` ohne `--ui-ereignisse`: Takte bis Bild 30, gespeichert nur Bild 30 (Software-Adapter).
    let Some(karton) = kompiliere("wuerfel") else { return };
    let ordner = temp("bilder");
    let _ = std::fs::remove_dir_all(&ordner);
    let out = befehl(env!("CARGO_BIN_EXE_pizza-host"))
        .args(["--kein-vorrat", "--saat=1", "--herd-nur=30"])
        .arg(format!("--herd-bilder={}", ordner.display()))
        .arg(&karton)
        .stdin(Stdio::null())
        .output()
        .unwrap();
    let fehler = String::from_utf8_lossy(&out.stderr);
    assert_eq!(out.status.code(), Some(0), "{}", fehler);
    if fehler.contains("keine Glut") {
        eprintln!("übersprungen: kein Software-Adapter ({})", fehler.trim());
        return;
    }
    let mut namen: Vec<String> = std::fs::read_dir(&ordner).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    namen.sort();
    assert_eq!(namen, ["bild-30.png"]);
    let (b, h, ist) = lies_png(&ordner.join("bild-30.png"));
    let (rb, rh, soll) = lies_png(&Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/herd/wuerfel-30.png"));
    assert_eq!((b, h), (rb, rh));
    assert_eq!((b, h), (640, 360));
    visuell_gleich(&ist, &soll).unwrap();
}
