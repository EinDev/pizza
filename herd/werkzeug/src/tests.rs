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

/// Szene mit einem Muster-Teigling (`teigling_muster`) als `Bild` der Größe `g` in der Feldmitte (320 × 180).
fn textur_szene(muster: u32, kante: u32, g: f64, tonung: &str) -> String {
    format!(
        "welt_neu 320 180 \"T\"\nwelt_hintergrund \"#000000\"\ntyp_nummer \"Bild\" -> T_B\nfeld_nummer T_B \"bildchen\" -> B_BILD\n\
feld_nummer T_B \"groesse\" -> B_GR\nfeld_nummer T_B \"farbe\" -> B_F\nteigling_muster {muster} {kante} {kante} -> T\n\
teil_neu 2 -> p\nteil_lage p 160 90 0\nkomp_neu T_B -> b\nsetze_zahl b B_BILD T\nsetze_zahl b B_GR {g}\nsetze_text b B_F \"{tonung}\"\n\
komp_haenge b p\nbild\n"
    )
}

fn pixel(px: &[u8], b: u32, x: u32, y: u32) -> [u8; 4] {
    let i = ((y * b + x) * 4) as usize;
    [px[i], px[i + 1], px[i + 2], px[i + 3]]
}

#[test]
fn eigene_textur_verkleinert_trilinear_ohne_moire() {
    // Schachbrett 512² (4-px-Felder) auf 1/16 verkleinert: nächster Nachbar träfe immer dieselbe Feldfarbe (hell oder
    // dunkel), über die Mipmaps ergibt sich die Mischfarbe – gleichmäßig über das ganze Viertel
    let auf = Aufruf { bilder: None, groesse: (320, 180), glut: software(), vorgaben: Vec::new() };
    let Ok(mut g) = neue_glut(&auf) else {
        eprintln!("übersprungen: kein Software-Adapter");
        return;
    };
    let px = rendere(&mut g, &textur_szene(1, 512, 0.0625, "weiss"), &auf).unwrap().pop().unwrap().1;
    // oberes linkes Viertel des Bildes (32 × 32 Pixel um 160, 90): Felder 244/232/204 und 176/52/36
    let mut gruen = Vec::new();
    for y in 76..88 {
        for x in 146..158 {
            gruen.push(pixel(&px, 320, x, y)[1] as f64);
        }
    }
    let mittel = gruen.iter().sum::<f64>() / gruen.len() as f64;
    let streu = (gruen.iter().map(|v| (v - mittel) * (v - mittel)).sum::<f64>() / gruen.len() as f64).sqrt();
    assert!((100.0..175.0).contains(&mittel) && streu < 12.0, "Grün im Viertel: Mittel {:.1}, Streuung {:.1}", mittel, streu);
    let s = g.statistik();
    assert_eq!((s.draw_calls, s.instanzen_2d), (1, 1), "eigene Texturen bleiben im einen 2D-Draw-Call");
    let sp = g.textur_speicher();
    assert_eq!(sp.bilder, 1);
    // Nutzlast = Teigling ohne Kopf (52) und Längenfelder (10 Stufen); Klasse 512: 1 398 100 Bytes je Schicht (GL: 2 Schichten)
    assert_eq!(sp.nutz_bytes, herd_skript::muster_teigling(1, 512, 512).len() as u64 - 52 - 4 * 10);
    assert!(sp.vram_bytes == 1_398_100 || sp.vram_bytes == 2 * 1_398_100, "{:?}", sp);
}

#[test]
fn eigene_textur_vergroessert_pixelscharf() {
    // Pizza 16² auf das 8-Fache: jedes Texel ein 8 × 8-Block gleicher Farbe (nächster Nachbar); der halb durchsichtige Rand
    // wird auf schwarzem Grund mit seiner eigenen Farbe und halber Deckkraft gemischt (vormultipliziert geladen und im
    // Shader zurückgerechnet – die Farbe bleibt)
    let auf = Aufruf { bilder: None, groesse: (320, 180), glut: Optionen { msaa: 1, ..software() }, vorgaben: Vec::new() };
    let Ok(mut g) = neue_glut(&auf) else {
        eprintln!("übersprungen: kein Software-Adapter");
        return;
    };
    let px = rendere(&mut g, &textur_szene(2, 16, 8.0, "weiss"), &auf).unwrap().pop().unwrap().1;
    // Bild 128 × 128 ab (96, 26): Texel (tx, ty) → Block ab (96 + 8 tx, 26 + 8 ty)
    for (tx, ty) in [(8u32, 8u32), (3, 8), (8, 2), (12, 12)] {
        let erwartet = herd_skript::muster_pixel(2, tx as i64, ty as i64, 16, 16);
        for (dx, dy) in [(1u32, 1u32), (6, 6), (1, 6)] {
            let p = pixel(&px, 320, 96 + 8 * tx + dx, 26 + 8 * ty + dy);
            if erwartet[3] == 255 {
                for k in 0..3 {
                    assert!(p[k].abs_diff(erwartet[k]) <= 2, "Texel {:?}: {:?} statt {:?}", (tx, ty), p, erwartet);
                }
            }
        }
    }
    // Randpixel halb durchsichtig (Alpha 128): Farbe · ½ auf Schwarz
    let rand = (0..16).find(|&x| herd_skript::muster_pixel(2, x, 8, 16, 16)[3] == 128).expect("Rand");
    let e = herd_skript::muster_pixel(2, rand, 8, 16, 16);
    let p = pixel(&px, 320, 96 + 8 * rand as u32 + 4, 26 + 8 * 8 + 4);
    for k in 0..3 {
        let soll = (e[k] as f64 * 128.0 / 255.0).round() as u8;
        assert!(p[k].abs_diff(soll) <= 3, "Rand: {:?} statt ≈ {:?}·½", p, e);
    }
}

#[test]
fn textur_mit_unbekanntem_format_ist_ein_fehler() {
    let Ok(mut g) = neue_glut(&Aufruf { bilder: None, groesse: (64, 64), glut: software(), vorgaben: Vec::new() }) else {
        return;
    };
    let mut k = Kern::neu();
    k.welt_neu(64.0, 64.0, b"T");
    assert!(k.bildchen_teigling(&herd_skript::muster_teigling(1, 4, 4)) > 0);
    k.bild(1);
    let mut p = k.paket().to_vec();
    // Abschnitt TEXTUR suchen und das Pixelformat (Byte 4 der Daten) auf 7 setzen
    let mut i = 32;
    while i + 8 <= p.len() {
        let art = u32::from_le_bytes([p[i], p[i + 1], p[i + 2], p[i + 3]]);
        let len = u32::from_le_bytes([p[i + 4], p[i + 5], p[i + 6], p[i + 7]]) as usize;
        if art == herd_kern::paket::abschnitt::TEXTUR {
            p[i + 8 + 4] = 7;
            break;
        }
        i += 8 + len.div_ceil(4) * 4;
    }
    assert!(matches!(g.bild(&p), Err(herd_glut::Fehler::Paket(_))));
}

#[test]
fn schatten_auch_wenn_das_erste_bild_keine_hat() {
    // Titelbild ohne 3D, dann Körper mit Schatten: die Shadow-Map muss nachträglich entstehen
    let text = "welt_neu 320 180 \"S\"\ntakte 1\ntyp_nummer \"Koerper\" -> T\nform_grund 1 0 0 -> W\nform_grund 5 0 0 -> E\n\
teil_neu 3 -> b\nteil_groesse b 20 1 20\nkomp_neu T -> k\nsetze_zahl k 1 E\nkomp_haenge k b\n\
teil_neu 3 -> w\nteil_lage w 0 0.5 0\nkomp_neu T -> k\nsetze_zahl k 1 W\nkomp_haenge k w\ntakte 1\n";
    let mut auf = Aufruf { bilder: Some(vec![1, 2]), groesse: (320, 180), glut: software(), vorgaben: Vec::new() };
    let Ok(mut g1) = neue_glut(&auf) else {
        eprintln!("übersprungen: kein Software-Adapter");
        return;
    };
    let a = rendere(&mut g1, text, &auf).unwrap();
    assert!(g1.statistik().schatten_draw_calls > 0);
    auf.bilder = Some(vec![2]);
    let mut g2 = neue_glut(&auf).unwrap();
    let b = rendere(&mut g2, text, &auf).unwrap();
    let (m, inn) = vergleiche(&a.last().unwrap().1, &b.last().unwrap().1);
    assert!(m < 0.05 && inn > 99.9, "Bild 2 hängt vom Vorgänger ab: {} {}", m, inn);
}
