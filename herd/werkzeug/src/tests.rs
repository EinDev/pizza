//! Pixeltest (K-129/K-134): Referenzbilder `tests/herd/bilder/*.herd` → offscreen auf dem **Software-Adapter** rendern und
//! mit `*.png` vergleichen (mittlere Abweichung ≤ 1,5 %, ≥ 98 % der Pixel innerhalb 10/255). Ohne Software-Adapter wird
//! der Test mit Hinweis übersprungen – nie auf die GPU ausgewichen.

use super::*;

fn ordner() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/herd/bilder")
}

/// (mittlere Abweichung in %, Anteil Pixel innerhalb 10/255 in %)
pub fn vergleiche(a: &[u8], b: &[u8]) -> (f64, f64) {
    assert_eq!(a.len(), b.len());
    let mut summe = 0u64;
    let mut gut = 0usize;
    let n = a.len() / 4;
    for i in 0..n {
        let mut max = 0u8;
        for k in 0..3 {
            let d = a[i * 4 + k].abs_diff(b[i * 4 + k]);
            summe += d as u64;
            max = max.max(d);
        }
        if max <= 10 {
            gut += 1;
        }
    }
    (summe as f64 / (n as f64 * 3.0 * 255.0) * 100.0, gut as f64 / n as f64 * 100.0)
}

fn software() -> Optionen {
    Optionen { adapter: Adapter::Software, ..Default::default() }
}

#[test]
fn referenzbilder_visuell_gleich() {
    let mut skripte: Vec<PathBuf> = std::fs::read_dir(ordner()).unwrap().map(|e| e.unwrap().path()).filter(|p| p.extension().map(|x| x == "herd").unwrap_or(false)).collect();
    skripte.sort();
    assert!(skripte.len() >= 3, "zu wenige Referenzbilder");
    for p in skripte {
        let text = std::fs::read_to_string(&p).unwrap();
        let (kb, kg) = kopf(&text);
        let auf = Aufruf { bilder: kb.map(|b| vec![b]), groesse: kg.unwrap_or((1280, 720)), glut: software(), vorgaben: Vec::new() };
        let mut glut = match neue_glut(&auf) {
            Ok(g) => g,
            Err(e @ herd_glut::Fehler::KeinSoftwareAdapter(_)) => {
                eprintln!("Pixeltest übersprungen: {}", e);
                return;
            }
            Err(e) => panic!("{}", e),
        };
        let bilder = rendere(&mut glut, &text, &auf).unwrap_or_else(|e| panic!("{}: {}", p.display(), e));
        let (_, ist) = bilder.last().expect("kein Bild");
        let ref_pfad = p.with_extension("png");
        let (b, h, soll) = lies_png(&ref_pfad).unwrap_or_else(|| panic!("{} fehlt (herd-bild referenz)", ref_pfad.display()));
        assert_eq!((b, h), auf.groesse, "{}: Größe", p.display());
        let (mittel, innerhalb) = vergleiche(ist, &soll);
        eprintln!("{}: mittlere Abweichung {:.3} %, {:.2} % innerhalb 10/255", p.display(), mittel, innerhalb);
        if !(mittel <= 1.5 && innerhalb >= 98.0) {
            let neu = std::env::temp_dir().join(format!("herd-ist-{}.png", p.file_stem().unwrap().to_string_lossy()));
            schreibe_png(&neu, b, h, ist);
            panic!("{}: nicht visuell gleich ({:.3} %, {:.2} %) – Ist-Bild: {}", p.display(), mittel, innerhalb, neu.display());
        }
    }
}

#[test]
fn instancing_aendert_das_bild_nicht() {
    // Grundlinie (ein Draw-Call je Objekt) und Instancing zeichnen dasselbe – nur mit anderer Zahl an Draw-Calls
    let p = ordner().join("2d-alles.herd");
    let text = std::fs::read_to_string(&p).unwrap();
    let auf = Aufruf { bilder: None, groesse: (320, 180), glut: software(), vorgaben: vec![("TAKTE".into(), 2.0)] };
    let Ok(mut g1) = neue_glut(&auf) else {
        eprintln!("übersprungen: kein Software-Adapter");
        return;
    };
    let a = rendere(&mut g1, &text, &auf).unwrap();
    let s1 = g1.statistik();
    let mut auf2 = auf.clone();
    auf2.glut.instancing = false;
    let mut g2 = neue_glut(&auf2).unwrap();
    let b = rendere(&mut g2, &text, &auf2).unwrap();
    let s2 = g2.statistik();
    let (m, inn) = vergleiche(&a.last().unwrap().1, &b.last().unwrap().1);
    assert!(m < 0.01 && inn > 99.99, "{} {}", m, inn);
    assert!(s1.draw_calls < s2.draw_calls, "{:?} {:?}", s1, s2);
    assert_eq!(s1.instanzen_2d, s2.instanzen_2d);
}

#[test]
fn kaputtes_paket_ist_ein_fehler() {
    let Ok(mut g) = neue_glut(&Aufruf { bilder: None, groesse: (64, 64), glut: software(), vorgaben: Vec::new() }) else {
        return;
    };
    assert!(matches!(g.bild(b"kein paket"), Err(herd_glut::Fehler::Paket(_))));
}
