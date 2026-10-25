//! Kern-Tests über das generische ABI (wie es Interpreter, Wasm-Laufzeit und Host benutzen).

use crate::abi::{teilfeld as tf, Kern, TEIL_METHODEN};
use crate::komponenten::ARTEN;
use crate::paket::{abschnitt, Leser, INST2D_BYTES, INST3D_BYTES};

fn typ(k: &mut Kern, name: &str) -> i32 {
    let t = k.typ_nummer(name.as_bytes());
    assert!(t > 0, "Typ {}", name);
    t
}
fn feld(k: &mut Kern, t: i32, name: &str) -> i32 {
    let f = k.feld_nummer(t, name.as_bytes());
    assert!(f > 0, "Feld {}", name);
    f
}
fn welt() -> Kern {
    let mut k = Kern::neu();
    assert_eq!(k.welt_neu(640.0, 360.0, "Test".as_bytes()), 0);
    k
}
fn text(k: &mut Kern, komp: i32, f: i32) -> String {
    let mut b = [0u8; 256];
    let n = k.hole_text(komp, f, &mut b);
    assert!(n >= 0);
    String::from_utf8(b[..n as usize].to_vec()).unwrap()
}

#[test]
fn welt_mit_kamera_und_sonne() {
    let mut k = welt();
    assert_eq!(k.teil_hole(1, tf::RAUM), 3.0);
    assert_eq!(k.teil_hole(2, tf::Y), 1.0);
    let kam = typ(&mut k, "Kamera");
    assert!(k.komp_von(1, kam) > 0);
    let licht = typ(&mut k, "Licht");
    let l = k.komp_von(2, licht);
    assert_eq!(text(&mut k, l, 1), "sonne");
    // zweiter Herd
    assert_eq!(k.welt_neu(640.0, 360.0, b""), -2);
    assert_eq!(k.fehler_text(), "Es gibt nur einen Herd pro Programm.");
}

#[test]
fn herd_groesse_pruefen() {
    let mut k = Kern::neu();
    assert_eq!(k.teil_neu(2), -2);
    assert_eq!(k.fehler_text(), "Erst braucht es einen Herd (neu Herd(…)).");
    assert_eq!(k.welt_neu(2.5, 360.0, b""), -1);
    assert_eq!(k.fehler_text(), "Herd(breite: …) braucht eine Ganzzahl, nicht 2.5.");
    assert_eq!(k.welt_neu(640.0, 10.0, b""), -2);
    assert_eq!(k.fehler_text(), "Herd(hoehe: …) muss zwischen 64 und 4096 liegen, nicht 10.");
}

#[test]
fn komponenten_generisch_und_fehlertexte() {
    let mut k = welt();
    let kreis = typ(&mut k, "Kreis");
    let t = k.teil_neu(2);
    let c = k.komp_neu(kreis);
    let r = feld(&mut k, kreis, "radius");
    assert_eq!(k.hole_zahl(c, r), 10.0);
    assert_eq!(k.setze_zahl(c, r, 25.0), 0);
    assert_eq!(k.setze_zahl(c, r, -1.0), -2);
    assert_eq!(k.fehler_text(), "Kreis.radius muss mindestens 0 sein, nicht -1.");
    assert_eq!(k.komp_haenge(c, t), 0);
    assert_eq!(k.komp_von(t, kreis), c);
    // schon angehängt
    let t2 = k.teil_neu(2);
    assert_eq!(k.komp_haenge(c, t2), -2);
    assert_eq!(k.fehler_text(), format!("Dieser Kreis hängt schon an Teil {}.", t));
    // doppelt
    let c2 = k.komp_neu(kreis);
    assert_eq!(k.komp_haenge(c2, t), -2);
    assert_eq!(k.fehler_text(), format!("Teil {} hat schon einen Kreis.", t));
    // falscher Raum
    let t3 = k.teil_neu(3);
    assert_eq!(k.komp_haenge(c2, t3), -2);
    assert_eq!(k.fehler_text(), "Kreis gibt es nur für 2D-Teile.");
    // Farbe
    let fa = feld(&mut k, kreis, "farbe");
    assert_eq!(text(&mut k, c, fa), "weiss");
    assert_eq!(k.setze_text(c, fa, b"lila"), -2);
    assert_eq!(k.fehler_text(), "Farbe 'lila' gibt es nicht. Erlaubt: Palettenname oder '#rrggbb'.");
    assert_eq!(k.setze_text(c, fa, b"#FF000080"), 0);
    assert_eq!(k.hole_zahl(c, fa), 0xFF000080u32 as f64);
    // Wahl
    let text_t = typ(&mut k, "Text");
    let tx = k.komp_neu(text_t);
    let au = feld(&mut k, text_t, "ausrichtung");
    assert_eq!(k.setze_text(tx, au, b"oben"), -2);
    assert_eq!(k.fehler_text(), "Text.ausrichtung kennt 'oben' nicht. Erlaubt: links, mitte, rechts.");
    // Typfehler aus der Anbindung
    assert_eq!(k.melde_typfehler(kreis, r, b"\"hallo\""), -1);
    assert_eq!(k.fehler_text(), "Kreis.radius braucht eine Zahl, nicht \"hallo\".");
    assert_eq!(k.feld_nummer(kreis, b"x"), -2);
    assert_eq!(k.fehler_text(), "Kreis hat kein Feld 'x'.");
}

#[test]
fn voraussetzungen_und_loesen() {
    let mut k = welt();
    let (bild, anim) = (typ(&mut k, "Bild"), typ(&mut k, "Animation"));
    let t = k.teil_neu(2);
    let a = k.komp_neu(anim);
    assert_eq!(k.komp_haenge(a, t), -2);
    assert_eq!(k.fehler_text(), "Animation braucht ein Bild am selben Teil.");
    let b = k.komp_neu(bild);
    assert_eq!(k.komp_haenge(b, t), 0);
    assert_eq!(k.komp_haenge(a, t), 0);
    assert_eq!(k.komp_loese(b), -2);
    assert_eq!(k.fehler_text(), "Bild wird von Animation am selben Teil gebraucht.");
    assert_eq!(k.komp_loese(a), 0);
    assert_eq!(k.komp_info(a, 2), 0);
    assert_eq!(k.komp_loese(b), 0);
}

#[test]
fn hierarchie_kopie_entferne() {
    let mut k = welt();
    let a = k.teil_neu(2);
    let b = k.teil_neu(2);
    k.teil_lage(a, 100.0, 50.0, 0.0);
    k.teil_lage(b, 10.0, 0.0, 0.0);
    assert_eq!(k.teil_haenge(b, a), 0);
    assert_eq!(k.teil_hole(b, tf::WELT_X), 110.0);
    k.teil_setze(a, tf::DREHUNG, 90.0);
    assert!((k.teil_hole(b, tf::WELT_Y) - 60.0).abs() < 1e-9);
    assert_eq!(k.teil_haenge(a, b), -2);
    assert_eq!(k.fehler_text(), format!("Teil {} kann nicht an seinem eigenen Kind hängen.", a));
    let d3 = k.teil_neu(3);
    assert_eq!(k.teil_haenge(d3, a), -2);
    assert_eq!(k.fehler_text(), "Ein 3D-Teil kann nicht an einem 2D-Teil hängen.");
    // Kopie mit Komponenten und Kindern
    let kreis = typ(&mut k, "Kreis");
    let c = k.komp_neu(kreis);
    k.komp_haenge(c, b);
    k.setze_zahl(c, 1, 33.0);
    let a2 = k.teil_kopie(a);
    assert!(a2 > b);
    assert_eq!(k.teil_hole(a2, tf::KINDER), 1.0);
    let mut kinder = [0u32; 4];
    assert_eq!(k.teil_kinder(a2, &mut kinder), 1);
    let b2 = kinder[0] as i32;
    let c2 = k.komp_von(b2, kreis);
    assert!(c2 > 0 && c2 != c);
    assert_eq!(k.hole_zahl(c2, 1), 33.0);
    // Entfernen samt Kindern
    assert_eq!(k.teil_entferne(a), 0);
    assert_eq!(k.teil_hole(b, tf::ENTFERNT), 1.0);
    assert!(k.teil_hole(b, tf::X).is_nan());
    assert_eq!(k.fehler_neu(), 1);
    assert_eq!(k.fehler_text(), format!("Teil {} ist schon entfernt.", b));
    assert!(k.hole_zahl(c, 1).is_nan());
    assert_eq!(k.fehler_text(), format!("Teil {} ist schon entfernt.", b));
    // die Kopie lebt weiter
    assert!((k.teil_hole(b2, tf::WELT_Y) - 60.0).abs() < 1e-9);
    // IDs werden nie wiederverwendet
    let neu = k.teil_neu(2);
    assert!(neu > b2);
}

#[test]
fn trifft_huellen() {
    let mut k = welt();
    let (kreis, rechteck) = (typ(&mut k, "Kreis"), typ(&mut k, "Rechteck"));
    let a = k.teil_neu(2);
    let ka = k.komp_neu(kreis);
    k.komp_haenge(ka, a);
    k.teil_lage(a, 100.0, 100.0, 0.0);
    let b = k.teil_neu(2);
    let rb = k.komp_neu(rechteck);
    k.komp_haenge(rb, b);
    k.teil_lage(b, 115.0, 100.0, 0.0);
    assert_eq!(k.teil_trifft(a, b), 1);
    k.teil_lage(b, 120.0, 100.0, 0.0);
    assert_eq!(k.teil_trifft(a, b), 0);
    k.teil_setze(b, tf::SICHTBAR, 0.0);
    k.teil_lage(b, 100.0, 100.0, 0.0);
    assert_eq!(k.teil_trifft(a, b), 0);
}

#[test]
fn bewegung_und_animation() {
    let mut k = welt();
    let (bild, anim, bew) = (typ(&mut k, "Bild"), typ(&mut k, "Animation"), typ(&mut k, "Bewegung"));
    let z: Vec<u8> = [b"ws".as_slice(), b"sw"].iter().flat_map(|z| [&(z.len() as u32).to_le_bytes()[..], z].concat()).collect();
    let b1 = k.bildchen_neu(&z, &[]);
    let b2 = k.bildchen_neu(&z, &[]);
    assert!(b1 > 0 && b2 > b1);
    let t = k.teil_neu(2);
    let kb = k.komp_neu(bild);
    k.komp_haenge(kb, t);
    let ka = k.komp_neu(anim);
    k.komp_haenge(ka, t);
    assert_eq!(k.setze_liste(ka, 1, &[b1 as u32, b2 as u32]), 0);
    k.setze_zahl(ka, 2, 30.0); // 30 Bilder/s → alle 2 Takte weiter
    let kw = k.komp_neu(bew);
    k.komp_haenge(kw, t);
    k.setze_zahl(kw, 1, 60.0);
    for _ in 0..2 {
        k.takt();
    }
    assert!((k.teil_hole(t, tf::X) - 2.0).abs() < 1e-12);
    assert_eq!(k.hole_zahl(ka, 5), 2.0);
    assert_eq!(k.hole_zahl(kb, 1), b2 as f64);
    for _ in 0..2 {
        k.takt();
    }
    assert_eq!(k.hole_zahl(ka, 5), 1.0);
}

#[test]
fn partikel_deterministisch() {
    let lauf = || {
        let mut k = welt();
        let p = typ(&mut k, "Partikel");
        let t = k.teil_neu(2);
        k.teil_lage(t, 320.0, 180.0, 0.0);
        let e = k.komp_neu(p);
        k.komp_haenge(e, t);
        k.setze_zahl(e, 1, 600.0);
        for _ in 0..90 {
            k.takt();
        }
        k.bild(90);
        (k.hash_szene(), k.hash_paket(), k.paket().len())
    };
    let a = lauf();
    assert_eq!(a, lauf());
    // 600/s · 1 s Lebensdauer ≈ 600 Teilchen → so viele 2D-Instanzen
    assert!(a.2 > 500 * INST2D_BYTES);
}

#[test]
fn bildpaket_2d_reihenfolge_und_culling() {
    let mut k = welt();
    let r = typ(&mut k, "Rechteck");
    let mut teile = vec![];
    for (i, (x, ebene)) in [(10.0, 2.0), (20.0, 1.0), (-100.0, 0.0), (30.0, 1.0)].iter().enumerate() {
        let t = k.teil_neu(2);
        k.teil_lage(t, *x, 10.0, 0.0);
        k.teil_setze(t, tf::EBENE, *ebene);
        let c = k.komp_neu(r);
        k.komp_haenge(c, t);
        teile.push((t, i));
    }
    let n = k.bild(1);
    assert!(n > 0);
    let l = Leser::neu(k.paket()).unwrap();
    assert_eq!(l.feld(), (640, 360));
    let (_, d) = l.abschnitte().find(|(a, _)| *a == abschnitt::INST2D).unwrap();
    assert_eq!(d.len(), 3 * INST2D_BYTES); // eins außerhalb
    let xs: Vec<f32> = d.chunks_exact(INST2D_BYTES).map(|c| f32::from_le_bytes([c[16], c[17], c[18], c[19]])).collect();
    assert_eq!(xs, vec![20.0, 30.0, 10.0]);
    // Schrift nur im ersten Paket
    assert!(l.abschnitte().any(|(a, _)| a == abschnitt::SCHRIFT));
    k.bild(2);
    assert!(!Leser::neu(k.paket()).unwrap().abschnitte().any(|(a, _)| a == abschnitt::SCHRIFT));
    k.paket_voll();
    k.bild(3);
    assert!(Leser::neu(k.paket()).unwrap().abschnitte().any(|(a, _)| a == abschnitt::SCHRIFT));
}

#[test]
fn bildpaket_3d_batches_und_schatten() {
    let mut k = welt();
    let ko = typ(&mut k, "Koerper");
    let w = k.form_grund(1, 0.0, 0.0);
    let e = k.form_grund(5, 0.0, 0.0);
    let boden = k.teil_neu(3);
    k.teil_groesse(boden, 20.0, 1.0, 20.0);
    let kb = k.komp_neu(ko);
    k.setze_zahl(kb, 1, e as f64);
    k.komp_haenge(kb, boden);
    for i in 0..5 {
        let t = k.teil_neu(3);
        k.teil_lage(t, i as f64 - 2.0, 0.5, 0.0);
        let c = k.komp_neu(ko);
        k.setze_zahl(c, 1, w as f64);
        k.komp_haenge(c, t);
    }
    // weit hinter der Kamera: kein Zeichnen
    let t = k.teil_neu(3);
    k.teil_lage(t, 0.0, 0.5, 100.0);
    let c = k.komp_neu(ko);
    k.setze_zahl(c, 1, w as f64);
    k.komp_haenge(c, t);
    k.bild(1);
    let l = Leser::neu(k.paket()).unwrap();
    let (_, z) = l.abschnitte().find(|(a, _)| *a == abschnitt::ZUEGE3D).unwrap();
    let zuege: Vec<[u32; 4]> = z.chunks_exact(16).map(|c| [0, 4, 8, 12].map(|o| u32::from_le_bytes([c[o], c[o + 1], c[o + 2], c[o + 3]]))).collect();
    // Würfel: fest (5) + Schatten; Ebene: fest + Schatten
    assert_eq!(zuege.iter().filter(|z| z[0] == 1).map(|z| z[3]).sum::<u32>(), 6);
    assert!(zuege.iter().any(|z| z[0] == 2));
    let (_, i) = l.abschnitte().find(|(a, _)| *a == abschnitt::INST3D).unwrap();
    assert!(i.len() >= 6 * INST3D_BYTES);
    assert!(l.flags() & 3 == 3);
}

#[test]
fn eigene_form_und_bildchen_fehler() {
    let mut k = welt();
    assert_eq!(k.form_eigene(&[0.0, 0.0], &[0.0, 1.0, 2.0], 0), -2);
    assert_eq!(k.fehler_text(), "Form braucht Punkte als Blech [x1, y1, z1, …] (Länge durch 3 teilbar).");
    let p = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
    assert_eq!(k.form_eigene(&p, &[0.0, 1.0, 7.0], 0), -2);
    assert_eq!(k.fehler_text(), "Punkt 7 gibt es nicht – die Form hat 4 Punkte.");
    assert!(k.form_eigene(&p, &[0.0, 2.0, 1.0, 0.0, 1.0, 3.0], 1) > 0);
    assert_eq!(k.form_grund(2, 2.0, 0.0), -2);
    assert_eq!(k.fehler_text(), "teile muss zwischen 3 und 128 liegen, nicht 2.");
    assert_eq!(k.form_grund(2, 24.5, 0.0), -1);
    assert_eq!(k.fehler_text(), "Form.kugel(teile: …) braucht eine Ganzzahl, nicht 24.5.");
    assert_eq!(k.fehler_code(), crate::fehler::code::FORM_TEILE_GANZ);
    let z: Vec<u8> = [b"wx".as_slice()].iter().flat_map(|z| [&(z.len() as u32).to_le_bytes()[..], z].concat()).collect();
    assert_eq!(k.bildchen_neu(&z, &[]), -2);
    assert_eq!(k.fehler_text(), "Das Zeichen 'x' hat im Bildchen keine Farbe.");
    let f: Vec<u8> = [b"x".as_slice(), b"#00ff00"].iter().flat_map(|z| [&(z.len() as u32).to_le_bytes()[..], z].concat()).collect();
    let id = k.bildchen_neu(&z, &f);
    assert!(id > 0);
    assert_eq!(k.ressource_hole(id, 2), 2.0);
    // Bildchen statt Form
    let ko = typ(&mut k, "Koerper");
    let c = k.komp_neu(ko);
    assert_eq!(k.setze_zahl(c, 1, id as f64), -1);
    assert_eq!(k.fehler_text(), "Koerper.form braucht eine Form, nicht Bildchen(2×1).");
}

#[test]
fn erweiterungsprobe_eine_datei_eine_zeile() {
    // Probe steht nur im Testbau in der Registry; Schema und ABI behandeln sie generisch.
    let json = crate::abi::schema_json(true);
    assert!(json.contains("\"name\": \"Probe\""));
    assert!(!crate::abi::schema_json(false).contains("Probe"));
    let mut k = welt();
    let p = typ(&mut k, "Probe");
    assert_eq!(p as usize, ARTEN.len()); // letzte Zeile der Registry
    let t = k.teil_neu(3);
    let c = k.komp_neu(p);
    let wert = feld(&mut k, p, "wert");
    let name = feld(&mut k, p, "name");
    let sorte = feld(&mut k, p, "sorte");
    assert_eq!(text(&mut k, c, sorte), "funghi");
    assert_eq!(k.setze_zahl(c, wert, 11.0), -2);
    assert_eq!(k.fehler_text(), "Probe.wert muss zwischen 0 und 10 liegen, nicht 11.");
    assert_eq!(k.setze_zahl(c, wert, 2.5), 0);
    assert_eq!(k.setze_text(c, name, "Käse".as_bytes()), 0);
    assert_eq!(text(&mut k, c, name), "Käse");
    assert_eq!(k.setze_text(c, sorte, b"diavolo"), 0);
    assert_eq!(k.hole_zahl(c, sorte), 2.0);
    let stufe = feld(&mut k, p, "stufe");
    assert_eq!(k.setze_zahl(c, stufe, 1.5), -1);
    assert_eq!(k.fehler_text(), "Probe.stufe braucht eine Ganzzahl, nicht 1.5.");
    assert_eq!(k.komp_haenge(c, t), 0);
    k.takt();
    k.takt();
    // verborgenes Feld ist nicht erreichbar
    assert!(k.hole_zahl(c, 11).is_nan());
    let s1 = k.hash_szene();
    k.takt();
    assert_ne!(s1, k.hash_szene());
}

#[test]
fn schema_datei_aktuell_und_keine_kollision() {
    let pfad = concat!(env!("CARGO_MANIFEST_DIR"), "/../../site/js/herd/schema.json");
    let datei = std::fs::read_to_string(pfad).expect("site/js/herd/schema.json fehlt (node herd/baue.js)");
    assert_eq!(datei.replace("\r\n", "\n"), crate::abi::schema_json(false), "schema.json veraltet: node herd/baue.js");
    for a in ARTEN {
        let n = a.schema.name;
        let klein: String = n[..1].to_lowercase() + &n[1..];
        assert!(!TEIL_METHODEN.contains(&klein.as_str()), "Komponente {} kollidiert mit Teil-Methode", n);
    }
}

#[test]
fn befunde_h3_genus_typname_info_fehlermarke() {
    let mut k = welt();
    let (kreis, bild, bew, anim) = (typ(&mut k, "Kreis"), typ(&mut k, "Bild"), typ(&mut k, "Bewegung"), typ(&mut k, "Animation"));
    let t = k.teil_neu(2);
    // Genus: Dieser Kreis / einen Kreis, Dieses Bild / ein Bild, Diese Bewegung / eine Bewegung
    for (art, dieser, einen) in [(kreis, "Dieser Kreis", "einen Kreis"), (bild, "Dieses Bild", "ein Bild"), (bew, "Diese Bewegung", "eine Bewegung")] {
        let a = k.komp_neu(art);
        assert_eq!(k.komp_haenge(a, t), 0);
        let t2 = k.teil_neu(2);
        assert_eq!(k.komp_haenge(a, t2), -2);
        assert_eq!(k.fehler_text(), format!("{} hängt schon an Teil {}.", dieser, t));
        let b = k.komp_neu(art);
        assert_eq!(k.komp_haenge(b, t), -2);
        assert_eq!(k.fehler_text(), format!("Teil {} hat schon {}.", t, einen));
    }
    let t3 = k.teil_neu(2);
    let a = k.komp_neu(anim);
    assert_eq!(k.komp_haenge(a, t3), -2);
    assert_eq!(k.fehler_text(), "Animation braucht ein Bild am selben Teil.");
    assert!(k.schema_json().contains("\"name\": \"Kreis\", \"nummer\": 2, \"genus\": \"m\""));
    // unbekannter Komponentenname
    assert_eq!(k.typ_nummer(b"Pendel"), -2);
    assert_eq!(k.fehler_text(), "Eine Komponente 'Pendel' gibt es nicht.");
    assert_eq!(k.fehler_code(), crate::fehler::code::KOMP_NAME);
    // komp_info(·, 2) an zerstörter Komponente: 0, ohne Fehler
    let t4 = k.teil_neu(2);
    let c = k.komp_neu(kreis);
    k.komp_haenge(c, t4);
    assert_eq!(k.komp_info(c, 2), t4);
    k.teil_entferne(t4);
    assert_eq!(k.komp_info(c, 2), 0);
    assert_eq!(k.komp_info(c, 3), 1);
    // Fehlermarke: ein alter i32-Fehler macht ein späteres echtes NaN nicht zum Fehler
    let t5 = k.teil_neu(2);
    let c5 = k.komp_neu(kreis);
    k.komp_haenge(c5, t5);
    assert_eq!(k.teil_neu(7), -3); // Anbindungsfehler, fehler_neu wird nicht abgefragt
    assert_eq!(k.setze_zahl(c5, 1, 5.0), 0);
    assert_eq!(k.hole_zahl(c5, 1), 5.0);
    assert_eq!(k.fehler_neu(), 0);
    assert!(k.teil_hole(t4, 1).is_nan());
    assert_eq!(k.fehler_neu(), 1);
}

/// 2D-Instanzen des letzten Bildpakets: (Matrix m00 m10 m01 m11, Mitte, halbe Ausdehnung, Rundung, Art, Atlas-Rechteck).
#[allow(clippy::type_complexity)]
fn instanzen_2d(k: &Kern) -> Vec<([f32; 4], [f32; 2], [f32; 2], f32, u32, [u16; 4])> {
    let l = Leser::neu(k.paket()).unwrap();
    let Some((_, d)) = l.abschnitte().find(|(a, _)| *a == abschnitt::INST2D) else { return vec![] };
    let f = |c: &[u8], o: usize| f32::from_le_bytes([c[o], c[o + 1], c[o + 2], c[o + 3]]);
    let u = |c: &[u8], o: usize| u16::from_le_bytes([c[o], c[o + 1]]);
    d.chunks_exact(INST2D_BYTES)
        .map(|c| {
            (
                [f(c, 0), f(c, 4), f(c, 8), f(c, 12)],
                [f(c, 16), f(c, 20)],
                [f(c, 24), f(c, 28)],
                f(c, 32),
                u32::from_le_bytes([c[44], c[45], c[46], c[47]]) & 0xFF,
                [u(c, 48), u(c, 50), u(c, 52), u(c, 54)],
            )
        })
        .collect()
}

#[test]
fn linie_ein_rechteck_laengs_der_strecke() {
    use crate::paket::flach_art;
    let mut k = welt();
    let li = typ(&mut k, "Linie");
    assert_eq!(li as usize, 11); // feste Typnummer (HERD.md §12.2)
    let (zx, zy, di, ru) = (feld(&mut k, li, "zuX"), feld(&mut k, li, "zuY"), feld(&mut k, li, "dicke"), feld(&mut k, li, "rund"));
    let fa = feld(&mut k, li, "farbe");
    let t = k.teil_neu(2);
    k.teil_lage(t, 100.0, 100.0, 0.0);
    let c = k.komp_neu(li);
    assert_eq!(text(&mut k, c, fa), "ofen");
    assert_eq!(k.hole_zahl(c, zx), 100.0);
    k.komp_haenge(c, t);
    k.setze_zahl(c, zx, 30.0);
    k.setze_zahl(c, zy, 40.0);
    k.bild(1);
    let i = instanzen_2d(&k);
    assert_eq!(i.len(), 1);
    assert_eq!(i[0].4, flach_art::RECHTECK);
    assert_eq!(i[0].0, [0.6, 0.8, -0.8, 0.6]);
    assert_eq!(i[0].1, [115.0, 120.0]);
    assert_eq!(i[0].2, [25.0, 1.0]);
    assert_eq!(i[0].3, 0.0);
    // runde Enden: je Seite um dicke/2 länger, Rundung dicke/2
    k.setze_zahl(c, ru, 1.0);
    k.setze_zahl(c, di, 6.0);
    k.bild(2);
    let i = instanzen_2d(&k);
    assert_eq!((i[0].2, i[0].3), ([28.0, 3.0], 3.0));
    // Hülle längs der Strecke
    let kreis = typ(&mut k, "Kreis");
    let b = k.teil_neu(2);
    let kb = k.komp_neu(kreis);
    k.komp_haenge(kb, b);
    k.teil_lage(b, 132.0, 142.0, 0.0);
    assert_eq!(k.teil_trifft(t, b), 1);
    k.teil_lage(b, 200.0, 100.0, 0.0);
    assert_eq!(k.teil_trifft(t, b), 0);
    // Dicke 0 zeichnet nichts (nur noch der Kreis), negative Dicke ist ein Fehler
    k.setze_zahl(c, di, 0.0);
    k.bild(3);
    assert!(instanzen_2d(&k).iter().all(|x| x.4 != flach_art::RECHTECK));
    assert_eq!(k.setze_zahl(c, di, -1.0), -2);
    assert_eq!(k.fehler_text(), "Linie.dicke muss mindestens 0 sein, nicht -1.");
}

#[test]
fn rahmen_neun_stuecke() {
    use crate::paket::flach_art;
    let mut k = welt();
    let ra = typ(&mut k, "Rahmen");
    assert_eq!(ra as usize, 12); // feste Typnummer (HERD.md §12.2)
    let (bc, ka, gr) = (feld(&mut k, ra, "bildchen"), feld(&mut k, ra, "kante"), feld(&mut k, ra, "groesse"));
    let zeilen = ["kkkkkkkkk"; 9];
    let z: Vec<u8> = zeilen.iter().flat_map(|z| [&(z.len() as u32).to_le_bytes()[..], z.as_bytes()].concat()).collect();
    let id = k.bildchen_neu(&z, &[]);
    assert!(id > 0);
    let t = k.teil_neu(2);
    k.teil_lage(t, 100.0, 100.0, 0.0);
    let c = k.komp_neu(ra);
    k.komp_haenge(c, t);
    // karton: nichts
    k.bild(1);
    assert!(instanzen_2d(&k).is_empty());
    k.setze_zahl(c, bc, id as f64);
    k.bild(2);
    let i = instanzen_2d(&k);
    assert_eq!(i.len(), 9);
    assert!(i.iter().all(|x| x.4 == flach_art::BILD));
    let (u, v) = (i[0].5[0], i[0].5[1]);
    // Ecke oben links: 4 × 4 Bildchen-Pixel, fest; Mitte: 1 Pixel, auf 56 × 24 gestreckt
    assert_eq!((i[0].1, i[0].2, i[0].5), ([70.0, 86.0], [2.0, 2.0], [u, v, u + 4, v + 4]));
    assert_eq!((i[4].1, i[4].2, i[4].5), ([100.0, 100.0], [28.0, 12.0], [u + 4, v + 4, u + 5, v + 5]));
    assert_eq!((i[8].1, i[8].2, i[8].5), ([130.0, 114.0], [2.0, 2.0], [u + 5, v + 5, u + 9, v + 9]));
    // Ecken größer als die halbe Höhe: Ecken gestaucht, die mittlere Zeile fällt weg
    k.setze_zahl(c, gr, 5.0);
    k.bild(3);
    let i = instanzen_2d(&k);
    assert_eq!(i.len(), 6);
    assert_eq!((i[0].1, i[0].2), ([78.0, 92.0], [10.0, 8.0]));
    assert_eq!((i[1].1, i[1].2), ([100.0, 92.0], [12.0, 8.0]));
    // kante 0: ein gestrecktes Bild
    k.setze_zahl(c, ka, 0.0);
    k.bild(4);
    let i = instanzen_2d(&k);
    assert_eq!((i.len(), i[0].2, i[0].5), (1, [32.0, 16.0], [u, v, u + 9, v + 9]));
    assert_eq!(k.setze_zahl(c, ka, 1.5), -1);
    assert_eq!(k.fehler_text(), "Rahmen.kante braucht eine Ganzzahl, nicht 1.5.");
    // Hülle = Tafel
    let kreis = typ(&mut k, "Kreis");
    let b = k.teil_neu(2);
    let kb = k.komp_neu(kreis);
    k.komp_haenge(kb, b);
    k.teil_lage(b, 140.0, 100.0, 0.0);
    assert_eq!(k.teil_trifft(t, b), 1);
    k.teil_lage(b, 145.0, 100.0, 0.0);
    assert_eq!(k.teil_trifft(t, b), 0);
}

// ------------------------------------------------------------------ H-K0: Listen, Lesefelder, Nachtragsfelder, Nachlauf

mod hk0 {
    use super::*;
    use crate::abi::szenen_hash;
    use crate::fehler::code;
    use crate::komponenten::Art;
    use crate::schema::{Feld, Genus, Raum, Schema, Spalte, Speicher, Typ, FELDTYPEN};
    use crate::welt::Welt;

    fn probe(k: &mut Kern) -> (i32, i32, i32) {
        let p = typ(k, "Probe");
        let t = k.teil_neu(2);
        let c = k.komp_neu(p);
        assert_eq!(k.komp_haenge(c, t), 0);
        (p, t, c)
    }
    fn liste(k: &mut Kern, c: i32, f: i32) -> Vec<u32> {
        let mut b = vec![0u32; 70000];
        let n = k.hole_liste(c, f, &mut b);
        assert!(n >= 0, "{}", k.fehler_text());
        b.truncate(n as usize);
        b
    }
    fn zahlen(k: &mut Kern, c: i32, f: i32) -> Vec<f64> {
        let mut b = vec![0f64; 70000];
        let n = k.hole_zahlen(c, f, &mut b);
        assert!(n >= 0, "{}", k.fehler_text());
        b.truncate(n as usize);
        b
    }

    #[test]
    fn feldtypen_nummern_und_schema() {
        assert_eq!(Typ::TeilListe.nummer(), 11);
        assert_eq!(Typ::ZahlListe.nummer(), 12);
        assert_eq!(Typ::Klang.nummer(), 13);
        assert_eq!(FELDTYPEN.len(), 13);
        let j = crate::abi::schema_json(true);
        assert!(j.contains("{\"nummer\": 11, \"name\": \"teil-liste\", \"erwartet\": \"ein Blech aus Teilen\"}"));
        assert!(j.contains("{\"nummer\": 12, \"name\": \"zahl-liste\", \"erwartet\": \"ein Blech aus Zahlen\"}"));
        assert!(j.contains("\"name\": \"ziele\", \"typ\": \"teil-liste\", \"standard\": [], \"min\": null, \"max\": null}"));
        assert!(j.contains("\"name\": \"werte\", \"typ\": \"zahl-liste\", \"standard\": [], \"min\": -100, \"max\": 100}"));
        assert!(j.contains("\"name\": \"stand\", \"typ\": \"zahl\", \"standard\": 0, \"min\": null, \"max\": null, \"lesen\": true}"));
        assert!(j.contains("\"name\": \"extra\", \"typ\": \"zahl\", \"standard\": 0, \"min\": null, \"max\": null, \"nachtrag\": true}"));
        // v1-Komponenten tragen keine neuen Schlüssel (außer den bewusst ergänzten Nachtragsfeldern)
        let ohne = crate::abi::schema_json(false);
        // (Lesefelder hat ab H-K6 der Fuehler; geprüft wird alles vor ihm)
        let v1 = ohne.split("\"name\": \"Fuehler\"").next().unwrap();
        assert!(!v1.contains("\"lesen\""));
        assert_eq!(ohne.matches("\"nachtrag\"").count(), NACHTRAEGE.len());
        assert!(ohne.contains("\"name\": \"belag\", \"typ\": \"teil\", \"standard\": null, \"min\": null, \"max\": null, \"nachtrag\": true}"));
    }

    #[test]
    fn teil_liste_setzen_lesen_entfernte_fallen_heraus() {
        let mut k = welt();
        let (p, _t, c) = probe(&mut k);
        let ziele = feld(&mut k, p, "ziele");
        assert_eq!(k.hole_zahl(c, ziele), 0.0);
        assert_eq!(liste(&mut k, c, ziele), Vec::<u32>::new());
        let (a, b, d) = (k.teil_neu(2) as u32, k.teil_neu(3) as u32, k.teil_neu(2) as u32);
        assert_eq!(k.setze_liste(c, ziele, &[b, a, b, d]), 0);
        assert_eq!(liste(&mut k, c, ziele), vec![b, a, b, d]);
        assert_eq!(k.hole_zahl(c, ziele), 4.0);
        // Retry (K-013): zu kleiner Puffer → Länge, nichts geschrieben
        let mut klein = [7u32; 2];
        assert_eq!(k.hole_liste(c, ziele, &mut klein), 4);
        assert_eq!(klein, [7, 7]);
        // entferntes Teil fällt beim Lesen heraus; Lesen ändert den Szenen-Hash nicht
        assert_eq!(k.teil_entferne(b as i32), 0);
        let h = k.hash_szene();
        assert_eq!(liste(&mut k, c, ziele), vec![a, d]);
        assert_eq!(k.hole_zahl(c, ziele), 2.0);
        assert_eq!(k.hash_szene(), h);
        // nur lebende Teile setzbar
        assert_eq!(k.setze_liste(c, ziele, &[a, b]), -2);
        assert_eq!(k.fehler_text(), format!("Teil {} ist schon entfernt.", b));
        assert_eq!(k.setze_liste(c, ziele, &[999]), -2);
        assert_eq!(k.fehler_text(), "Teil 999 gibt es nicht.");
        assert_eq!(k.setze_liste(c, ziele, &[0]), -2);
        assert_eq!(liste(&mut k, c, ziele), vec![a, d], "fehlgeschlagenes Setzen ändert nichts");
        // Grenze 65 536
        let voll = vec![a; 65536];
        assert_eq!(k.setze_liste(c, ziele, &voll), 0);
        assert_eq!(k.hole_zahl(c, ziele), 65536.0);
        let zu_viel = vec![a; 65537];
        assert_eq!(k.setze_liste(c, ziele, &zu_viel), -2);
        assert_eq!(k.fehler_text(), "Probe.ziele darf höchstens 65536 Einträge haben, nicht 65537.");
        assert_eq!(k.fehler_code(), code::LISTE_LAENGE);
        // Typfehler
        assert_eq!(k.setze_zahl(c, ziele, 3.0), -1);
        assert_eq!(k.fehler_text(), "Probe.ziele braucht ein Blech aus Teilen, nicht 3.");
        assert_eq!(k.melde_typfehler(p, ziele, b"[1, 2]"), -1);
        assert_eq!(k.fehler_text(), "Probe.ziele braucht ein Blech aus Teilen, nicht [1, 2].");
        assert_eq!(k.hole_zahlen(c, ziele, &mut [0.0; 4]), -3);
        // Kopie übernimmt die Liste
        assert_eq!(k.setze_liste(c, ziele, &[d, a]), 0);
        let t2 = k.komp_info(c, 2);
        let kopie = k.teil_kopie(t2);
        let c2 = k.komp_von(kopie, p);
        assert_eq!(liste(&mut k, c2, ziele), vec![d, a]);
    }

    #[test]
    fn zahl_liste_setzen_lesen_grenzen() {
        let mut k = welt();
        let (p, _t, c) = probe(&mut k);
        let werte = feld(&mut k, p, "werte");
        assert_eq!(zahlen(&mut k, c, werte), Vec::<f64>::new());
        assert_eq!(k.setze_zahlen(c, werte, &[1.5, -0.0, 100.0, -100.0]), 0);
        let z = zahlen(&mut k, c, werte);
        assert_eq!(z.iter().map(|x| x.to_bits()).collect::<Vec<_>>(), [1.5f64, -0.0, 100.0, -100.0].iter().map(|x| x.to_bits()).collect::<Vec<_>>());
        assert_eq!(k.hole_zahl(c, werte), 4.0);
        let mut klein = [9.0f64; 3];
        assert_eq!(k.hole_zahlen(c, werte, &mut klein), 4);
        assert_eq!(klein, [9.0; 3]);
        // Bereich je Eintrag
        assert_eq!(k.setze_zahlen(c, werte, &[1.0, 101.0]), -2);
        assert_eq!(k.fehler_text(), "Probe.werte muss zwischen -100 und 100 liegen, nicht 101.");
        assert_eq!(zahlen(&mut k, c, werte).len(), 4);
        // Grenze 65 536
        assert_eq!(k.setze_zahlen(c, werte, &vec![0.5; 65536]), 0);
        assert_eq!(k.setze_zahlen(c, werte, &vec![0.5; 65537]), -2);
        assert_eq!(k.fehler_text(), "Probe.werte darf höchstens 65536 Einträge haben, nicht 65537.");
        // Typfehler in beide Richtungen
        let wert = feld(&mut k, p, "wert");
        assert_eq!(k.setze_zahlen(c, wert, &[1.0]), -1);
        assert_eq!(k.fehler_text(), "Probe.wert braucht eine Zahl, nicht ein Blech.");
        assert_eq!(k.setze_liste(c, werte, &[1]), -1);
        assert_eq!(k.fehler_text(), "Probe.werte braucht ein Blech aus Zahlen, nicht ein Blech.");
        assert_eq!(k.setze_text(c, werte, b"x"), -1);
        assert_eq!(k.fehler_text(), "Probe.werte braucht ein Blech aus Zahlen, nicht x.");
        assert_eq!(k.hole_liste(c, werte, &mut [0; 4]), -3);
        assert_eq!(k.hole_zahlen(c, wert, &mut [0.0; 4]), -3);
        // der Hash sieht die Liste
        let h0 = k.hash_szene();
        assert_eq!(k.setze_zahlen(c, werte, &[2.0]), 0);
        assert_ne!(k.hash_szene(), h0);
    }

    #[test]
    fn lesefeld_nur_systeme_schreiben() {
        let mut k = welt();
        let (p, _t, c) = probe(&mut k);
        let (stand, wert) = (feld(&mut k, p, "stand"), feld(&mut k, p, "wert"));
        assert_eq!(k.setze_zahl(c, stand, 1.0), -2);
        assert_eq!(k.fehler_text(), "Probe.stand kann man nur lesen.");
        assert_eq!(k.fehler_code(), code::FELD_LESEN);
        assert_eq!(k.fehler_art(), crate::fehler::art::LAUFZEIT);
        // auch mit falschem Typ: Lesefeld-Fehler zuerst (Anbindungen melden über melde_typfehler)
        assert_eq!(k.melde_typfehler(p, stand, b"\"x\""), -2);
        assert_eq!(k.fehler_text(), "Probe.stand kann man nur lesen.");
        assert_eq!(k.setze_text(c, stand, b"x"), -2);
        assert_eq!(k.setze_liste(c, stand, &[]), -2);
        assert_eq!(k.setze_zahlen(c, stand, &[]), -2);
        assert_eq!(k.fehler_text(), "Probe.stand kann man nur lesen.");
        assert_eq!(k.hole_zahl(c, stand), 0.0);
        // der Nachlauf schreibt es
        assert_eq!(k.setze_zahl(c, wert, 2.5), 0);
        k.takt();
        k.takt();
        assert_eq!(k.hole_zahl(c, stand), 5.0);
    }

    #[test]
    fn nachtragsfeld_standard_aendert_hash_nicht() {
        let mut k = welt();
        let (p, _t, c) = probe(&mut k);
        let extra = feld(&mut k, p, "extra");
        let h0 = k.hash_szene();
        assert_eq!(k.setze_zahl(c, extra, 3.0), 0);
        assert_ne!(k.hash_szene(), h0);
        assert_eq!(k.setze_zahl(c, extra, -0.0), 0);
        assert_ne!(k.hash_szene(), h0, "Vergleich auf Bits: −0 ≠ 0");
        assert_eq!(k.setze_zahl(c, extra, 0.0), 0);
        assert_eq!(k.hash_szene(), h0);
    }

    // Eigene Registrys: „alte“ Komponente gegen dieselbe mit Nachtragsfeldern aller Spaltenarten.
    fn nichts(_: &mut Welt, _: &mut Speicher) {}
    static ALT: Art = Art {
        schema: Schema { name: "Pendel", genus: Genus::N, raum: Raum::Beide, braucht: &[], felder: &[Feld::zahl("weite", 30.0), Feld::intern("zeit", 0.0)] },
        takt: Some(nichts),
        ..Art::LEER
    };
    static NEU: Art = Art {
        schema: Schema {
            name: "Pendel",
            genus: Genus::N,
            raum: Raum::Beide,
            braucht: &[],
            felder: &[
                Feld::zahl("weite", 30.0),
                Feld::zahl("tempo", 1.0).nachtrag(),
                Feld::text("name", "p").nachtrag(),
                Feld::farbe("farbe", "tomate").nachtrag(),
                Feld::teil_liste("ziele").nachtrag(),
                Feld::zahl_liste("punkte").nachtrag(),
                Feld::intern("zeit", 0.0),
            ],
        },
        takt: Some(nichts),
        ..Art::LEER
    };
    static R_ALT: [&Art; 1] = [&ALT];
    static R_NEU: [&Art; 1] = [&NEU];

    fn pendelwelt(r: &'static [&'static Art]) -> (Welt, u32) {
        let mut w = Welt::neu(640, 360, String::from("N"), r);
        let t = w.teil_neu(false);
        let h = w.komp_neu(0);
        w.komp_haenge(h, t).unwrap();
        w.lage_setzen(t, 3.0, 4.0, 0.0);
        w.takt();
        (w, t)
    }

    fn text_setzen(s: &mut Speicher, f: usize, t: &str) {
        if let Spalte::Text(v) = &mut s.spalten[f] {
            v[0] = String::from(t);
        }
    }
    fn farbtext_setzen(s: &mut Speicher, f: usize, t: &str) {
        if let Spalte::Farbe(_, v) = &mut s.spalten[f] {
            v[0] = String::from(t);
        }
    }
    fn ids_setzen(s: &mut Speicher, f: usize, ids: Vec<u32>) {
        if let Spalte::Liste(v) = &mut s.spalten[f] {
            v[0] = ids;
        }
    }

    #[test]
    fn nachtragsfelder_aller_arten_hash_wie_ohne() {
        let (mut alt, _) = pendelwelt(&R_ALT);
        let (mut neu, t) = pendelwelt(&R_NEU);
        let h_alt = szenen_hash(&mut alt);
        assert_eq!(szenen_hash(&mut neu), h_alt, "Nachtragsfelder mit Standard ändern den Hash nicht");
        // je Spaltenart: abweichend → anderer Hash, zurück auf Standard → wieder gleich
        neu.speicher[0].zahl_mut(1)[0] = 2.0;
        assert_ne!(szenen_hash(&mut neu), h_alt);
        neu.speicher[0].zahl_mut(1)[0] = 1.0;
        assert_eq!(szenen_hash(&mut neu), h_alt);
        text_setzen(&mut neu.speicher[0], 2, "q");
        assert_ne!(szenen_hash(&mut neu), h_alt);
        text_setzen(&mut neu.speicher[0], 2, "p");
        assert_eq!(szenen_hash(&mut neu), h_alt);
        farbtext_setzen(&mut neu.speicher[0], 3, "#d9452b");
        assert_ne!(szenen_hash(&mut neu), h_alt, "Farbe: Text wie gesetzt gehört dazu");
        farbtext_setzen(&mut neu.speicher[0], 3, "tomate");
        assert_eq!(szenen_hash(&mut neu), h_alt);
        ids_setzen(&mut neu.speicher[0], 4, vec![t]);
        assert_ne!(szenen_hash(&mut neu), h_alt);
        ids_setzen(&mut neu.speicher[0], 4, Vec::new());
        assert_eq!(szenen_hash(&mut neu), h_alt);
        neu.speicher[0].puffer_mut(5)[0] = vec![f64::from_bits(0x7FF8_0000_0000_0001)];
        let a = szenen_hash(&mut neu);
        assert_ne!(a, h_alt);
        // NaN kanonisch: Nutzlast und Vorzeichen egal
        neu.speicher[0].puffer_mut(5)[0] = vec![f64::from_bits(0xFFF8_0000_0000_0000)];
        assert_eq!(szenen_hash(&mut neu), a);
        neu.speicher[0].puffer_mut(5)[0].clear();
        assert_eq!(szenen_hash(&mut neu), h_alt);
    }

    // Nachlauf läuft nach **allen** Takt-Systemen, auch denen späterer Arten.
    fn lage_x(w: &Welt, teil: u32) -> f64 {
        w.zeile_opt(teil).map(|z| w.teile.lage[z][0]).unwrap_or(-1.0)
    }
    fn frueh_takt(w: &mut Welt, s: &mut Speicher) {
        for i in 0..s.len() {
            let x = lage_x(w, s.teil[i]);
            s.zahl_mut(1)[i] = x;
        }
    }
    fn frueh_nachlauf(w: &mut Welt, s: &mut Speicher) {
        for i in 0..s.len() {
            let x = lage_x(w, s.teil[i]);
            s.zahl_mut(0)[i] = x;
        }
    }
    fn spaet_takt(w: &mut Welt, s: &mut Speicher) {
        for i in 0..s.len() {
            if let Some(z) = w.zeile_opt(s.teil[i]) {
                w.teile.lage[z][0] += 1.0;
            }
        }
    }
    static FRUEH: Art = Art {
        schema: Schema { name: "Frueh", genus: Genus::N, raum: Raum::Beide, braucht: &[], felder: &[Feld::zahl("nach", 0.0), Feld::zahl("vor", 0.0)] },
        takt: Some(frueh_takt),
        nachlauf: Some(frueh_nachlauf),
        ..Art::LEER
    };
    static SPAET: Art = Art {
        schema: Schema { name: "Spaet", genus: Genus::N, raum: Raum::Beide, braucht: &[], felder: &[] },
        takt: Some(spaet_takt),
        ..Art::LEER
    };
    static R_FS: [&Art; 2] = [&FRUEH, &SPAET];

    #[test]
    fn nachlauf_nach_allen_takten() {
        let mut w = Welt::neu(640, 360, String::from("N"), &R_FS);
        let t = w.teil_neu(false);
        for a in 0..2 {
            let h = w.komp_neu(a);
            w.komp_haenge(h, t).unwrap();
        }
        w.takt();
        assert_eq!(w.speicher[0].zahl(1)[0], 0.0, "Takt der frühen Art vor dem späten");
        assert_eq!(w.speicher[0].zahl(0)[0], 1.0, "Nachlauf nach dem späten Takt");
        w.takt();
        assert_eq!((w.speicher[0].zahl(1)[0], w.speicher[0].zahl(0)[0]), (1.0, 2.0));
        assert_eq!(w.takte, 2);
    }

    /// Nachtragsfelder an bestehenden Komponenten, die eine Stufe bewusst ergänzt (HERD.md §12.1 Regel 2).
    const NACHTRAEGE: &[(&str, &str)] = &[("Koerper", "belag"), ("Blick", "mausX"), ("Blick", "mausY"), ("Licht", "kegel"), ("Licht", "kegelRand"), ("Koerper", "strahlen"), ("Belag", "strahlen"), ("Belag", "relief"), ("Belag", "kachel"), ("Belag", "abbildung"), ("Belag", "modell"), ("Belag", "metall"), ("Belag", "nass"), ("Funken", "streckung"), ("Funken", "licht"), ("Funken", "volumen"), ("Funken", "aufschlag"), ("Funken", "boden"), ("Funken", "spritzer"), ("Funken", "regen"), ("Funken", "kollision"), ("Funken", "aufprall"), ("Funken", "abprall"), ("Stimmung", "regen"), ("Licht", "schattenGuete"), ("Licht", "schattenWeich"), ("Licht", "kaskaden"), ("Licht", "schattenWeite"), ("Stimmung", "spiegelGuete"), ("Stimmung", "verdeckung"), ("Stimmung", "verdeckungWeite"), ("Stimmung", "bildspiegel"), ("Belag", "normalKarte"), ("Belag", "normalStaerke"), ("Belag", "stoffKarte"), ("Belag", "leuchtKarte"), ("Belag", "leuchtFarbe"), ("Belag", "schwelle"), ("Belag", "beidseitig"), ("Belag", "wiegen")];

    #[test]
    fn v1_arten_ohne_neue_eigenschaften() {
        // nur die Arten bis Funken (13, Welle W1); ab W2 nutzen Ausbau-Arten die neuen Eigenschaften (H-K4: zahl-liste)
        for a in ARTEN.iter().take(13).filter(|a| !a.nur_test) {
            assert!(a.nachlauf.is_none(), "{}", a.schema.name);
            for f in a.schema.felder {
                assert!(!f.lesen, "{}.{}", a.schema.name, f.name);
                assert_eq!(f.nachtrag, NACHTRAEGE.contains(&(a.schema.name, f.name)), "{}.{}", a.schema.name, f.name);
                assert!(!matches!(f.typ, Typ::TeilListe | Typ::ZahlListe));
            }
        }
    }
}

/// Abschnitt TEILCHEN3D des letzten Bildpakets: (leuchtend, deckend, je Teilchen [x, y, z, halbe Größe], Farben).
#[allow(clippy::type_complexity)]
fn teilchen_3d(k: &Kern) -> Option<(u32, u32, Vec<[f32; 4]>, Vec<u32>)> {
    use crate::paket::TEILCHEN3D_BYTES;
    let l = Leser::neu(k.paket()).unwrap();
    let (_, d) = l.abschnitte().find(|(a, _)| *a == abschnitt::TEILCHEN3D)?;
    let u = |o: usize| u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]]);
    let f = |c: &[u8], o: usize| f32::from_le_bytes([c[o], c[o + 1], c[o + 2], c[o + 3]]);
    let rest = &d[8..];
    assert_eq!(rest.len() % TEILCHEN3D_BYTES, 0);
    let lagen = rest.chunks_exact(TEILCHEN3D_BYTES).map(|c| [f(c, 0), f(c, 4), f(c, 8), f(c, 12)]).collect();
    let farben = rest.chunks_exact(TEILCHEN3D_BYTES).map(|c| u32::from_be_bytes([c[16], c[17], c[18], c[19]])).collect();
    Some((u(0), u(4), lagen, farben))
}

#[test]
fn funken_teilchen_im_raum() {
    use crate::paket::flag;
    let mut k = welt();
    let fu = typ(&mut k, "Funken");
    assert_eq!(fu as usize, 13); // feste Typnummer (HERD.md §12.2)
    let f = |k: &mut Kern, n: &str| feld(k, fu, n);
    let (rate, leben, tempo, streu, misch) = (f(&mut k, "rate"), f(&mut k, "lebensdauer"), f(&mut k, "tempo"), f(&mut k, "streuung"), f(&mut k, "mischung"));
    let (welt_f, aktiv, gr, gre) = (f(&mut k, "weltlage"), f(&mut k, "aktiv"), f(&mut k, "groesse"), f(&mut k, "groesseEnde"));
    k.teil_lage(1, 0.0, 2.0, 10.0);
    k.teil_schaue(1, 0.0, 1.0, 0.0);
    let t = k.teil_neu(3);
    let c = k.komp_neu(fu);
    assert_eq!(k.hole_zahl(c, rate), 30.0);
    assert_eq!(k.hole_zahl(c, tempo), 2.0);
    assert_eq!(text(&mut k, c, misch), "leuchtend");
    assert_eq!(k.setze_zahl(c, streu, 200.0), -2);
    assert_eq!(k.fehler_text(), "Funken.streuung muss zwischen 0 und 180 liegen, nicht 200.");
    // ohne Teilchen: kein Abschnitt, Paket wie ohne Funken (zweites Bild: ohne Ressourcen-Deltas)
    k.bild(1);
    k.bild(1);
    let ohne = k.paket().to_vec();
    k.komp_haenge(c, t);
    k.bild(1);
    assert_eq!(k.paket(), &ohne[..]);
    assert!(teilchen_3d(&k).is_none());
    // gerader Strahl nach oben: 2 je Takt, alle auf der y-Achse, Größe wird kleiner
    k.setze_zahl(c, rate, 120.0);
    k.setze_zahl(c, leben, 10.0);
    k.setze_zahl(c, streu, 0.0);
    k.setze_zahl(c, gre, 0.0);
    for _ in 0..30 {
        k.takt();
    }
    k.bild(2);
    assert!(Leser::neu(k.paket()).unwrap().flags() & flag::DREI_D != 0);
    let (l, d, lagen, farben) = teilchen_3d(&k).unwrap();
    assert_eq!((l, d, lagen.len()), (60, 0, 60));
    assert!(lagen.iter().all(|p| p[0] == 0.0 && p[2] == 0.0 && p[1] > 0.0 && p[1] < 2.0 && p[3] > 0.0 && p[3] <= 0.1));
    assert!(lagen[0][1] > lagen[59][1], "ältestes Teilchen ist am höchsten");
    assert!(farben.iter().all(|x| x & 0xFF == 0xFF));
    // deckend: von hinten nach vorn sortiert (Kamera bei z = 10)
    k.setze_text(c, misch, b"deckend");
    k.setze_zahl(c, streu, 180.0);
    for _ in 0..30 {
        k.takt();
    }
    k.bild(3);
    let (l, d, lagen, _) = teilchen_3d(&k).unwrap();
    assert_eq!((l, d), (0, 120));
    let tiefe = |p: &[f32; 4]| -((p[1] as f64 - 2.0) * -1.0 + (p[2] as f64 - 10.0) * -10.0) / libm::sqrt(101.0);
    assert!(lagen.windows(2).all(|w| tiefe(&w[0]) <= tiefe(&w[1]) + 1e-5), "deckende von hinten nach vorn");
    // weltlage nein: Teilchen wandern mit dem Teil; weltlage ja: sie bleiben
    let vorher = lagen.clone();
    k.setze_zahl(c, aktiv, 0.0);
    k.setze_zahl(c, gr, 0.2);
    k.setze_zahl(c, welt_f, 0.0);
    k.teil_lage(t, 0.5, 0.0, 0.0);
    k.bild(4);
    let (_, _, nein, _) = teilchen_3d(&k).unwrap();
    k.setze_zahl(c, welt_f, 1.0);
    k.bild(5);
    let (_, _, ja, _) = teilchen_3d(&k).unwrap();
    let lage = |v: &[[f32; 4]]| v.iter().map(|p| [p[0], p[1], p[2]]).collect::<Vec<_>>();
    assert_eq!(lage(&ja), lage(&vorher));
    let mut a: Vec<f32> = nein.iter().map(|p| p[0]).collect();
    let mut b: Vec<f32> = ja.iter().map(|p| p[0] + 0.5).collect();
    a.sort_by(|x, y| x.partial_cmp(y).unwrap());
    b.sort_by(|x, y| x.partial_cmp(y).unwrap());
    assert!(a.iter().zip(b.iter()).all(|(x, y)| (x - y).abs() < 1e-4));
    // aus: nach der Lebensdauer kein Abschnitt mehr
    for _ in 0..600 {
        k.takt();
    }
    k.bild(6);
    assert!(teilchen_3d(&k).is_none());
    // höchstens 10 000 je Emitter
    k.setze_zahl(c, aktiv, 1.0);
    k.setze_zahl(c, rate, 100_000.0);
    k.setze_zahl(c, gr, 0.0001);
    k.teil_lage(1, 0.0, 2.0, 40.0);
    for _ in 0..10 {
        k.takt();
    }
    k.bild(7);
    let (l, d, _, _) = teilchen_3d(&k).unwrap();
    assert_eq!(l + d, 10_000);
}

#[test]
fn funken_bitgleich_und_eigene_saat() {
    // gleiche Szene zweimal → gleiches Paket; andere Saat → andere Teilchen
    let lauf = |saat: f64| {
        let mut k = welt();
        let fu = typ(&mut k, "Funken");
        let t = k.teil_neu(3);
        let c = k.komp_neu(fu);
        let s = feld(&mut k, fu, "saat");
        k.setze_zahl(c, s, saat);
        k.komp_haenge(c, t);
        for _ in 0..20 {
            k.takt();
        }
        k.bild(1);
        teilchen_3d(&k).unwrap().2
    };
    assert_eq!(lauf(5.0), lauf(5.0));
    assert_ne!(lauf(5.0), lauf(6.0));
}

/// H-K4: Typnummern in Merge-Reihenfolge (HERD.md §12.1 Regel 1, §11.1): Gleiten 14, Ablauf 15.
fn hk4_typen(k: &mut Kern) -> (i32, i32) {
    let (gl, ab) = (typ(k, "Gleiten"), typ(k, "Ablauf"));
    assert_eq!((gl, ab), (14, 15));
    (gl, ab)
}

#[test]
fn gleiten_endwert_exakt_pendeln_wiederholen() {
    let mut k = welt();
    let (gl, _) = hk4_typen(&mut k);
    let (was, nach, dauer, kurve, schleife, laeuft) = (
        feld(&mut k, gl, "was"),
        feld(&mut k, gl, "nach"),
        feld(&mut k, gl, "dauer"),
        feld(&mut k, gl, "kurve"),
        feld(&mut k, gl, "schleife"),
        feld(&mut k, gl, "laeuft"),
    );
    // Standard: x, nach 0, dauer 1, sanft, einmal, läuft
    let t = k.teil_neu(2);
    k.teil_lage(t, 100.0, 50.0, 0.0);
    let c = k.komp_neu(gl);
    assert_eq!(text(&mut k, c, was), "x");
    assert_eq!(text(&mut k, c, kurve), "sanft");
    assert_eq!(text(&mut k, c, schleife), "einmal");
    assert_eq!((k.hole_zahl(c, dauer), k.hole_zahl(c, laeuft)), (1.0, 1.0));
    k.setze_zahl(c, nach, 400.0);
    // Startwert erst im ersten laufenden Takt: Lage vor dem Anhängen geändert → gilt
    k.teil_lage(t, 200.0, 50.0, 0.0);
    k.komp_haenge(c, t);
    k.takt();
    let x1 = k.teil_hole(t, tf::X);
    assert!(x1 > 200.0 && x1 < 201.0, "{}", x1);
    // Mitte (30 Takte) bei sanft: genau die Hälfte bis auf Rundung
    for _ in 1..30 {
        k.takt();
    }
    assert!((k.teil_hole(t, tf::X) - 300.0).abs() < 1e-9);
    // dauer 1 endet nach genau 60 Takten exakt auf nach, laeuft → nein
    for _ in 30..59 {
        k.takt();
    }
    assert_eq!(k.hole_zahl(c, laeuft), 1.0);
    assert!(k.teil_hole(t, tf::X) < 400.0);
    k.takt();
    assert_eq!(k.teil_hole(t, tf::X), 400.0);
    assert_eq!(k.hole_zahl(c, laeuft), 0.0);
    k.takt();
    assert_eq!(k.teil_hole(t, tf::X), 400.0);
    // wieder einschalten: neuer Start vom aktuellen Wert
    k.setze_zahl(c, nach, 100.0);
    k.setze_zahl(c, laeuft, 1.0);
    k.setze_text(c, kurve, b"linear");
    k.setze_zahl(c, dauer, 0.5);
    for _ in 0..15 {
        k.takt();
    }
    assert!((k.teil_hole(t, tf::X) - 250.0).abs() < 1e-9);
    // nach während des Laufs geändert: neuer Start vom aktuellen Wert (250 → 350 in 0,5 s)
    k.setze_zahl(c, nach, 350.0);
    for _ in 0..15 {
        k.takt();
    }
    assert!((k.teil_hole(t, tf::X) - 300.0).abs() < 1e-9);
    for _ in 0..15 {
        k.takt();
    }
    assert_eq!((k.teil_hole(t, tf::X), k.hole_zahl(c, laeuft)), (350.0, 0.0));

    // pendeln (linear, Größe): hin in 1 s, zurück in 1 s, läuft weiter
    let t2 = k.teil_neu(3);
    let c2 = k.komp_neu(gl);
    k.setze_text(c2, was, b"groesse");
    k.setze_zahl(c2, nach, 3.0);
    k.setze_text(c2, kurve, b"linear");
    k.setze_text(c2, schleife, b"pendeln");
    k.komp_haenge(c2, t2);
    for _ in 0..60 {
        k.takt();
    }
    assert!((k.teil_hole(t2, tf::GROESSE_X) - 3.0).abs() < 1e-9);
    assert_eq!(k.teil_hole(t2, tf::GROESSE_Y), k.teil_hole(t2, tf::GROESSE_X));
    assert_eq!(k.teil_hole(t2, tf::GROESSE_Z), k.teil_hole(t2, tf::GROESSE_X));
    for _ in 0..30 {
        k.takt();
    }
    assert!((k.teil_hole(t2, tf::GROESSE_X) - 2.0).abs() < 1e-9);
    for _ in 0..30 {
        k.takt();
    }
    assert!((k.teil_hole(t2, tf::GROESSE_X) - 1.0).abs() < 1e-9);
    assert_eq!(k.hole_zahl(c2, laeuft), 1.0);

    // wiederholen (drehung, rein): nach jeder Runde von vorn
    let t3 = k.teil_neu(2);
    let c3 = k.komp_neu(gl);
    k.setze_text(c3, was, b"drehung");
    k.setze_zahl(c3, nach, 90.0);
    k.setze_text(c3, kurve, b"rein");
    k.setze_text(c3, schleife, b"wiederholen");
    k.komp_haenge(c3, t3);
    for _ in 0..30 {
        k.takt();
    }
    assert!((k.teil_hole(t3, tf::DREHUNG) - 22.5).abs() < 1e-9);
    for _ in 0..60 {
        k.takt();
    }
    assert!((k.teil_hole(t3, tf::DREHUNG) - 22.5).abs() < 1e-9);

    // 2D: z/neigung/rollen wirken nicht (kein Fehler), dauer 0 springt sofort, Fehler im Bereich
    let c4 = k.komp_neu(gl);
    let t4 = k.teil_neu(2);
    k.setze_text(c4, was, b"neigung");
    k.setze_zahl(c4, nach, 45.0);
    k.komp_haenge(c4, t4);
    k.takt();
    assert_eq!(k.teil_hole(t4, tf::DREHUNG), 0.0);
    k.setze_text(c4, was, b"y");
    k.setze_zahl(c4, dauer, 0.0);
    k.takt();
    assert_eq!((k.teil_hole(t4, tf::Y), k.hole_zahl(c4, laeuft)), (45.0, 0.0));
    assert_eq!(k.setze_zahl(c4, dauer, -1.0), -2);
    assert_eq!(k.fehler_text(), "Gleiten.dauer muss mindestens 0 sein, nicht -1.");
    assert_eq!(k.setze_text(c4, kurve, b"zappelig"), -2);
    assert_eq!(k.fehler_text(), "Gleiten.kurve kennt 'zappelig' nicht. Erlaubt: linear, sanft, rein, raus, federnd, huepfend.");
    // zweites Gleiten am selben Teil
    let c5 = k.komp_neu(gl);
    assert_eq!(k.komp_haenge(c5, t4), -2);
    assert_eq!(k.fehler_text(), format!("Teil {} hat schon ein Gleiten.", t4));
}

#[test]
fn gleiten_kurven_ende_und_bitgleich() {
    use crate::komponenten::gleiten::{kurve_wert, KURVEN};
    for k in 0..KURVEN.len() as u32 {
        assert_eq!(kurve_wert(k, 0.0), 0.0);
        assert_eq!(kurve_wert(k, 1.0), 1.0);
        assert_eq!(kurve_wert(k, -0.5), 0.0);
        assert_eq!(kurve_wert(k, f64::NAN), 0.0);
    }
    assert_eq!(kurve_wert(1, 0.5), 0.5);
    assert_eq!(kurve_wert(2, 0.5), 0.25);
    assert_eq!(kurve_wert(3, 0.5), 0.75);
    // federnd schwingt über 1 hinaus, huepfend prallt (Stelle 1/2.75 berührt 1)
    assert!((0..100).map(|i| kurve_wert(4, i as f64 / 100.0)).any(|v| v > 1.0));
    assert!((kurve_wert(5, 1.0 / 2.75) - 1.0).abs() < 1e-12);
    assert!(kurve_wert(5, 0.5) < 1.0);
    // nur libm, keine FMA: dieselben Bits wie die Formel (nativ = Wasm prüft test-kern.js an der Szene gleiten.herd)
    let c4 = 2.0 * core::f64::consts::PI / 3.0;
    assert_eq!(kurve_wert(4, 0.3).to_bits(), (libm::pow(2.0, -3.0) * libm::sin((0.3 * 10.0 - 0.75) * c4) + 1.0).to_bits());
}

#[test]
fn ablauf_schluessel_schleife_und_halt() {
    let mut k = welt();
    let (_, ab) = hk4_typen(&mut k);
    let f = |k: &mut Kern, n: &str| feld(k, ab, n);
    let (zeiten, xw, yw, gw, dw) = (f(&mut k, "zeiten"), f(&mut k, "xWerte"), f(&mut k, "yWerte"), f(&mut k, "groesseWerte"), f(&mut k, "drehWerte"));
    let (kurve, schleife, tempo, zeit, laeuft) = (f(&mut k, "kurve"), f(&mut k, "schleife"), f(&mut k, "tempo"), f(&mut k, "zeit"), f(&mut k, "laeuft"));
    let t = k.teil_neu(2);
    k.teil_lage(t, 7.0, 8.0, 0.0);
    let c = k.komp_neu(ab);
    assert_eq!(text(&mut k, c, kurve), "linear");
    assert_eq!((k.hole_zahl(c, schleife), k.hole_zahl(c, tempo), k.hole_zahl(c, zeit), k.hole_zahl(c, laeuft)), (1.0, 1.0, 0.0, 1.0));
    k.komp_haenge(c, t);
    // leer: nichts animiert
    k.takt();
    assert_eq!((k.teil_hole(t, tf::X), k.teil_hole(t, tf::Y)), (7.0, 8.0));
    // Pfad: 0 s → (0, 0), 1 s → (100, 0), 2 s → (100, 50); groesseWerte kürzer → letzter gilt weiter; drehWerte leer
    assert_eq!(k.setze_zahlen(c, zeiten, &[0.0, 1.0, 2.0]), 0);
    assert_eq!(k.setze_zahlen(c, xw, &[0.0, 100.0, 100.0]), 0);
    assert_eq!(k.setze_zahlen(c, yw, &[0.0, 0.0, 50.0]), 0);
    assert_eq!(k.setze_zahlen(c, gw, &[2.0]), 0);
    k.setze_zahl(c, laeuft, 0.0);
    assert_eq!(k.setze_zahl(c, zeit, 0.5), 0);
    // angehalten, aber zeit gesetzt → springt einmal dorthin
    k.takt();
    assert_eq!((k.teil_hole(t, tf::X), k.teil_hole(t, tf::Y), k.teil_hole(t, tf::GROESSE_X)), (50.0, 0.0, 2.0));
    assert_eq!(k.teil_hole(t, tf::DREHUNG), 0.0);
    k.teil_lage(t, 1.0, 1.0, 0.0);
    k.takt();
    assert_eq!(k.teil_hole(t, tf::X), 1.0); // angehalten: keine Wirkung
    k.setze_zahl(c, laeuft, 1.0);
    k.setze_zahl(c, zeit, 1.0);
    for _ in 0..30 {
        k.takt();
    }
    assert!((k.hole_zahl(c, zeit) - 1.5).abs() < 1e-12);
    assert!((k.teil_hole(t, tf::Y) - 25.0).abs() < 1e-9);
    assert!((k.teil_hole(t, tf::X) - 100.0).abs() < 1e-12);
    // Schleife: über 2 s hinaus von vorn
    for _ in 0..45 {
        k.takt();
    }
    assert!((k.hole_zahl(c, zeit) - 0.25).abs() < 1e-9);
    assert!((k.teil_hole(t, tf::X) - 25.0).abs() < 1e-6);
    // ohne Schleife: Halt am Ende, laeuft → nein, Endwerte exakt
    k.setze_zahl(c, schleife, 0.0);
    k.setze_text(c, kurve, b"sanft");
    k.setze_zahl(c, tempo, 2.0);
    for _ in 0..60 {
        k.takt();
    }
    assert_eq!((k.hole_zahl(c, zeit), k.hole_zahl(c, laeuft)), (2.0, 0.0));
    assert_eq!((k.teil_hole(t, tf::X), k.teil_hole(t, tf::Y)), (100.0, 50.0));
    // rückwärts bis 0
    k.setze_zahl(c, tempo, -4.0);
    k.setze_zahl(c, laeuft, 1.0);
    for _ in 0..40 {
        k.takt();
    }
    assert_eq!((k.hole_zahl(c, zeit), k.hole_zahl(c, laeuft)), (0.0, 0.0));
    assert_eq!((k.teil_hole(t, tf::X), k.teil_hole(t, tf::Y)), (0.0, 0.0));
    // sanft zwischen zwei Schlüsseln: Viertel = 0.15625 des Wegs
    k.setze_zahl(c, zeit, 0.25);
    k.takt();
    assert!((k.teil_hole(t, tf::X) - 15.625).abs() < 1e-9);
    // gleiche Zeiten = Sprung; Bereichsfehler je Eintrag
    assert_eq!(k.setze_zahlen(c, zeiten, &[0.0, 1.0, 1.0]), 0);
    k.setze_zahl(c, zeit, 1.0);
    k.takt();
    assert_eq!((k.teil_hole(t, tf::X), k.teil_hole(t, tf::Y)), (100.0, 50.0));
    assert_eq!(k.setze_zahlen(c, zeiten, &[0.0, -1.0]), -2);
    assert_eq!(k.fehler_text(), "Ablauf.zeiten muss mindestens 0 sein, nicht -1.");
    assert_eq!(k.setze_zahlen(c, dw, &[f64::NAN, 1.0]), 0);
    // 3D: zWerte und Größe auf allen Achsen
    let zw = f(&mut k, "zWerte");
    let t3 = k.teil_neu(3);
    let c3 = k.komp_neu(ab);
    k.setze_zahlen(c3, zeiten, &[0.0, 1.0]);
    k.setze_zahlen(c3, zw, &[-2.0, 2.0]);
    k.setze_zahlen(c3, gw, &[1.0, 3.0]);
    k.komp_haenge(c3, t3);
    for _ in 0..30 {
        k.takt();
    }
    assert!(k.teil_hole(t3, tf::Z).abs() < 1e-9);
    assert!((k.teil_hole(t3, tf::GROESSE_Z) - 2.0).abs() < 1e-9);
    // 2D: zWerte wirken nicht
    k.setze_zahlen(c, zw, &[5.0]);
    k.takt();
    assert_eq!(k.teil_hole(t, tf::Z), 0.0);
}

/// 3D-Instanzen des letzten Bildpakets: (Farbe RGBA, Glanz, Leuchten, Textur-Wort).
fn material_3d(k: &Kern) -> Vec<(u32, f32, f32, u32)> {
    let l = Leser::neu(k.paket()).unwrap();
    let Some((_, d)) = l.abschnitte().find(|(a, _)| *a == abschnitt::INST3D) else { return vec![] };
    let f = |c: &[u8], o: usize| f32::from_le_bytes([c[o], c[o + 1], c[o + 2], c[o + 3]]);
    d.chunks_exact(INST3D_BYTES)
        .map(|c| (u32::from_be_bytes([c[48], c[49], c[50], c[51]]), f(c, 52), f(c, 56), u32::from_le_bytes([c[68], c[69], c[70], c[71]])))
        .collect()
}

#[test]
fn belag_geteiltes_material() {
    let mut k = welt();
    let ko = typ(&mut k, "Koerper");
    let be = typ(&mut k, "Belag");
    assert_eq!(be, 16); // Typnummer in Merge-Reihenfolge (HERD.md §12.1, §11.1): nach Gleiten 14, Ablauf 15
    let (k_farbe, k_glanz, k_belag) = (feld(&mut k, ko, "farbe"), feld(&mut k, ko, "glanz"), feld(&mut k, ko, "belag"));
    let (b_farbe, b_glanz, b_leuchten, b_bild) = (feld(&mut k, be, "farbe"), feld(&mut k, be, "glanz"), feld(&mut k, be, "leuchten"), feld(&mut k, be, "bild"));
    let wuerfel = k.form_grund(1, 0.0, 0.0);
    let mut koerper = vec![];
    for i in 0..3 {
        let t = k.teil_neu(3);
        k.teil_lage(t, i as f64 - 1.0, 0.5, 0.0);
        let c = k.komp_neu(ko);
        k.setze_zahl(c, 1, wuerfel as f64);
        assert_eq!(k.setze_text(c, k_farbe, b"tomate"), 0);
        k.setze_zahl(c, k_glanz, 0.9);
        k.komp_haenge(c, t);
        koerper.push(c);
    }
    let h0 = k.hash_szene();
    // Standard karton; setzen und zurücksetzen lässt den Szenen-Hash wie ohne Feld (Nachtragsfeld)
    assert_eq!(k.hole_zahl(koerper[0], k_belag), 0.0);
    let leer = k.teil_neu(3);
    assert_eq!(k.setze_zahl(koerper[0], k_belag, leer as f64), 0);
    assert_ne!(k.hash_szene(), h0);
    assert_eq!(k.setze_zahl(koerper[0], k_belag, 0.0), 0);
    let ohne = {
        let mut k2 = welt();
        let w2 = k2.form_grund(1, 0.0, 0.0);
        for i in 0..3 {
            let t = k2.teil_neu(3);
            k2.teil_lage(t, i as f64 - 1.0, 0.5, 0.0);
            let c = k2.komp_neu(ko);
            k2.setze_zahl(c, 1, w2 as f64);
            k2.setze_text(c, k_farbe, b"tomate");
            k2.setze_zahl(c, k_glanz, 0.9);
            k2.komp_haenge(c, t);
        }
        k2.teil_neu(3);
        k2.hash_szene()
    };
    assert_eq!(k.hash_szene(), ohne);
    k.bild(1);
    let eigen = material_3d(&k);
    assert_eq!(eigen.len(), 3);
    assert!(eigen.iter().all(|m| *m == (0xD9452BFF, 0.9, 0.0, 0)));
    // Belag an einem eigenen Teil; zwei Körper zeigen darauf, der dritte auf ein Teil ohne Belag (→ eigene Werte, kein Fehler)
    let raum = k.teil_neu(3);
    let b = k.komp_neu(be);
    assert_eq!(text(&mut k, b, b_farbe), "weiss");
    assert_eq!((k.hole_zahl(b, b_glanz), k.hole_zahl(b, b_leuchten), k.hole_zahl(b, b_bild)), (0.3, 0.0, 0.0));
    k.setze_text(b, b_farbe, b"senf");
    k.setze_zahl(b, b_glanz, 0.1);
    k.setze_zahl(b, b_leuchten, 0.5);
    assert_eq!(k.komp_haenge(b, raum), 0);
    k.setze_zahl(koerper[0], k_belag, raum as f64);
    k.setze_zahl(koerper[1], k_belag, raum as f64);
    k.setze_zahl(koerper[2], k_belag, leer as f64);
    assert_eq!(k.hole_zahl(koerper[1], k_belag), raum as f64);
    k.bild(2);
    let m = material_3d(&k);
    assert_eq!(m.iter().filter(|m| **m == (0xF2B33DFF, 0.1, 0.5, 0)).count(), 2);
    assert_eq!(m.iter().filter(|m| **m == (0xD9452BFF, 0.9, 0.0, 0)).count(), 1);
    // ein Wert am Belag ändert alle Körper; auch das Bildchen (Textur) kommt vom Belag
    let zeilen = ["kk", "kk"];
    let z: Vec<u8> = zeilen.iter().flat_map(|z| [&(z.len() as u32).to_le_bytes()[..], z.as_bytes()].concat()).collect();
    let tex = k.bildchen_neu(&z, &[]);
    k.setze_text(b, b_farbe, b"wasser");
    k.setze_zahl(b, b_bild, tex as f64);
    k.bild(3);
    let m = material_3d(&k);
    assert_eq!(m.iter().filter(|m| m.0 == 0x2E6FD9FF && m.3 & 1 << 16 != 0).count(), 2);
    // durchsichtige Belag-Farbe blendet die Körper aus wie eine eigene
    k.setze_text(b, b_farbe, b"#ffffff00");
    k.bild(4);
    assert_eq!(material_3d(&k).len(), 1);
    // Belag-Teil unsichtbar: gilt trotzdem
    k.setze_text(b, b_farbe, b"senf");
    k.teil_setze(raum, crate::abi::teilfeld::SICHTBAR, 0.0);
    k.bild(5);
    assert_eq!(material_3d(&k).iter().filter(|m| m.0 == 0xF2B33DFF).count(), 2);
    // Belag gelöst bzw. Belag-Teil entfernt: wieder die eigenen Werte, kein Fehler; ein entferntes Teil setzen ist ein Fehler
    k.komp_loese(b);
    k.bild(6);
    assert!(material_3d(&k).iter().all(|m| m.0 == 0xD9452BFF));
    k.komp_haenge(b, raum);
    k.teil_entferne(raum);
    assert_eq!(k.fehler_neu(), 0);
    k.bild(7);
    assert!(material_3d(&k).iter().all(|m| m.0 == 0xD9452BFF));
    assert!(k.setze_zahl(koerper[2], k_belag, raum as f64) < 0);
    assert_eq!(k.fehler_text(), alloc::format!("Teil {} ist schon entfernt.", raum));
    // nur für 3D-Teile
    let flach = k.teil_neu(2);
    let b2 = k.komp_neu(be);
    assert!(k.komp_haenge(b2, flach) < 0);
    assert_eq!(k.fehler_text(), "Belag gibt es nur für 3D-Teile.");
    // Kopie eines Körpers teilt den Belag (gleiches Teil im Feld)
    let r2 = k.teil_neu(3);
    k.komp_haenge(b2, r2);
    k.setze_zahl(koerper[0], k_belag, r2 as f64);
    let t0 = k.komp_info(koerper[0], 2);
    let kopie = k.teil_kopie(t0);
    assert!(kopie > 0);
    k.bild(8);
    assert_eq!(material_3d(&k).iter().filter(|m| **m == (0xFFFFFFFF, 0.3, 0.0, 0)).count(), 2);
}
/// H-K6: `Fuehler` – Kollider mit Ereignissen als Zustand je Takt (Nachlauf), gemeinsame Kollisionssuche für `Wucht`.
mod hk6 {
    use super::*;
    use crate::komponenten::fuehler::{self, Kandidat};
    use crate::komponenten::{trifft, Huelle};

    struct F {
        t: i32,
        f: i32,
    }
    /// Typ und Feldnummern des Fühlers
    struct N {
        t: i32,
        form: i32,
        breite: i32,
        hoehe: i32,
        tiefe: i32,
        radius: i32,
        vx: i32,
        vy: i32,
        gruppe: i32,
        maske: i32,
        beruehrt: i32,
        betreten: i32,
        verlassen: i32,
        anzahl: i32,
    }
    fn nummern(k: &mut Kern) -> N {
        let t = typ(k, "Fuehler");
        N {
            t,
            form: feld(k, t, "form"),
            breite: feld(k, t, "breite"),
            hoehe: feld(k, t, "hoehe"),
            tiefe: feld(k, t, "tiefe"),
            radius: feld(k, t, "radius"),
            vx: feld(k, t, "versatzX"),
            vy: feld(k, t, "versatzY"),
            gruppe: feld(k, t, "gruppe"),
            maske: feld(k, t, "maske"),
            beruehrt: feld(k, t, "beruehrt"),
            betreten: feld(k, t, "betreten"),
            verlassen: feld(k, t, "verlassen"),
            anzahl: feld(k, t, "anzahl"),
        }
    }
    fn liste(k: &mut Kern, c: i32, f: i32) -> Vec<u32> {
        let mut b = vec![0u32; 20000];
        let n = k.hole_liste(c, f, &mut b);
        assert!(n >= 0, "{}", k.fehler_text());
        b.truncate(n as usize);
        b
    }
    /// 2D-Teil mit Rechteck b × h bei (x, y) und Fühler (auto)
    fn kiste(k: &mut Kern, n: &N, x: f64, y: f64, b: f64, h: f64) -> F {
        let rt = typ(k, "Rechteck");
        let (fb, fh) = (feld(k, rt, "breite"), feld(k, rt, "hoehe"));
        let t = k.teil_neu(2);
        k.teil_lage(t, x, y, 0.0);
        let r = k.komp_neu(rt);
        k.setze_zahl(r, fb, b);
        k.setze_zahl(r, fh, h);
        assert_eq!(k.komp_haenge(r, t), 0);
        let f = k.komp_neu(n.t);
        assert_eq!(k.komp_haenge(f, t), 0);
        F { t, f }
    }
    fn ids(v: &[&F]) -> Vec<u32> {
        v.iter().map(|x| x.t as u32).collect()
    }
    const LEER: Vec<u32> = Vec::new();

    #[test]
    fn schema_lesefelder_nachlauf() {
        let mut k = welt();
        let n = nummern(&mut k);
        let art = ARTEN.iter().find(|a| a.schema.name == "Fuehler").unwrap();
        assert!(art.nachlauf.is_some() && art.takt.is_none() && art.huelle.is_none() && art.bild.is_none());
        let j = crate::abi::schema_json(false);
        assert!(j.contains("\"name\": \"beruehrt\", \"typ\": \"teil-liste\", \"standard\": [], \"min\": null, \"max\": null, \"lesen\": true}"), "{}", j);
        assert!(j.contains("\"name\": \"anzahl\", \"typ\": \"ganz\", \"standard\": 0, \"min\": null, \"max\": null, \"lesen\": true}"));
        assert!(j.contains("\"name\": \"maske\", \"typ\": \"ganz\", \"standard\": 4294967295, \"min\": 0, \"max\": 4294967295}"));
        let f = k.komp_neu(n.t);
        assert_eq!(text(&mut k, f, n.form), "auto");
        assert_eq!(k.hole_zahl(f, n.gruppe), 1.0);
        for (feld, name) in [(n.beruehrt, "beruehrt"), (n.betreten, "betreten"), (n.verlassen, "verlassen")] {
            assert_eq!(k.setze_liste(f, feld, &[]), -2);
            assert_eq!(k.fehler_text(), format!("Fuehler.{} kann man nur lesen.", name));
        }
        assert_eq!(k.setze_zahl(f, n.anzahl, 1.0), -2);
        assert_eq!(k.fehler_text(), "Fuehler.anzahl kann man nur lesen.");
        assert_eq!(k.setze_zahl(f, n.gruppe, 33.0), -2);
        assert_eq!(k.fehler_text(), "Fuehler.gruppe muss zwischen 1 und 32 liegen, nicht 33.");
        assert_eq!(k.setze_text(f, n.form, b"dreieck"), -2);
        assert_eq!(k.fehler_text(), "Fuehler.form kennt 'dreieck' nicht. Erlaubt: auto, kreis, rechteck, kasten, kugel, kapsel, netz.");
    }

    #[test]
    fn betreten_verlassen_ueber_drei_takte() {
        let mut k = welt();
        let n = nummern(&mut k);
        let a = kiste(&mut k, &n, 100.0, 100.0, 20.0, 20.0);
        let b = kiste(&mut k, &n, 200.0, 100.0, 20.0, 20.0);
        let c = kiste(&mut k, &n, 105.0, 100.0, 20.0, 20.0);
        // vor dem ersten Takt: alles leer
        assert_eq!(liste(&mut k, a.f, n.beruehrt), LEER);
        // Takt 1: a und c überlappen
        k.takt();
        assert_eq!(liste(&mut k, a.f, n.beruehrt), ids(&[&c]));
        assert_eq!(liste(&mut k, a.f, n.betreten), ids(&[&c]));
        assert_eq!(liste(&mut k, c.f, n.betreten), ids(&[&a]));
        assert_eq!(liste(&mut k, b.f, n.beruehrt), LEER);
        assert_eq!(k.hole_zahl(a.f, n.anzahl), 1.0);
        // Takt 2: b rückt an a (Rand berührt zählt: a bis 110, b ab 110), nichts verlassen
        k.teil_lage(b.t, 120.0, 100.0, 0.0);
        k.takt();
        assert_eq!(liste(&mut k, a.f, n.beruehrt), ids(&[&b, &c]));
        assert_eq!(liste(&mut k, a.f, n.betreten), ids(&[&b]));
        assert_eq!(liste(&mut k, a.f, n.verlassen), LEER);
        assert_eq!(liste(&mut k, b.f, n.beruehrt), ids(&[&a, &c]), "c reicht bis 115, b ab 110");
        assert_eq!(k.hole_zahl(a.f, n.anzahl), 2.0);
        // Takt 3: c geht weg → verlassen; betreten leer
        k.teil_lage(c.t, 400.0, 300.0, 0.0);
        k.takt();
        assert_eq!(liste(&mut k, a.f, n.beruehrt), ids(&[&b]));
        assert_eq!(liste(&mut k, a.f, n.betreten), LEER);
        assert_eq!(liste(&mut k, a.f, n.verlassen), ids(&[&c]));
        assert_eq!(liste(&mut k, c.f, n.verlassen), ids(&[&a, &b]));
        // Takt 4: nichts ändert sich → beide Ereignislisten leer
        k.takt();
        assert_eq!(liste(&mut k, a.f, n.verlassen), LEER);
        assert_eq!(liste(&mut k, a.f, n.betreten), LEER);
        // Der Nachlauf sieht die Lage nach der Bewegung desselben Takts
        let bew = typ(&mut k, "Bewegung");
        let tx = feld(&mut k, bew, "tempoX");
        let m = k.komp_neu(bew);
        k.setze_zahl(m, tx, -60.0 * 280.0);
        assert_eq!(k.komp_haenge(m, c.t), 0);
        k.teil_lage(c.t, 400.0, 100.0, 0.0);
        k.takt();
        assert_eq!(k.teil_hole(c.t, tf::X), 120.0);
        assert_eq!(liste(&mut k, c.f, n.betreten), ids(&[&a, &b]));
    }

    #[test]
    fn masken_raum_unsichtbar_entfernt_kopie() {
        let mut k = welt();
        let n = nummern(&mut k);
        let a = kiste(&mut k, &n, 100.0, 100.0, 20.0, 20.0);
        let b = kiste(&mut k, &n, 105.0, 100.0, 20.0, 20.0);
        // b in Gruppe 3; a spürt Gruppe 3 nicht → kein Paar (beidseitig)
        k.setze_zahl(b.f, n.gruppe, 3.0);
        k.setze_zahl(a.f, n.maske, (u32::MAX & !(1 << 2)) as f64);
        k.takt();
        assert_eq!(liste(&mut k, b.f, n.beruehrt), LEER);
        assert_eq!(liste(&mut k, a.f, n.beruehrt), LEER);
        // a spürt nur Gruppe 3, b nur Gruppe 1 → passt beidseitig
        k.setze_zahl(a.f, n.maske, 4.0);
        k.setze_zahl(b.f, n.maske, 1.0);
        k.takt();
        assert_eq!(liste(&mut k, b.f, n.beruehrt), ids(&[&a]));
        // b spürt nichts mehr → auch a nicht
        k.setze_zahl(b.f, n.maske, 0.0);
        k.takt();
        assert_eq!(liste(&mut k, a.f, n.verlassen), ids(&[&b]));
        k.setze_zahl(b.f, n.maske, 1.0);
        k.takt();
        // unsichtbar → verlassen, wieder sichtbar → betreten
        k.teil_setze(a.t, tf::SICHTBAR, 0.0);
        k.takt();
        assert_eq!(liste(&mut k, b.f, n.verlassen), ids(&[&a]));
        k.teil_setze(a.t, tf::SICHTBAR, 1.0);
        k.takt();
        assert_eq!(liste(&mut k, b.f, n.betreten), ids(&[&a]));
        // Rechteck ohne Fühler zählt nicht
        let rt = typ(&mut k, "Rechteck");
        let nackt = k.teil_neu(2);
        k.teil_lage(nackt, 100.0, 100.0, 0.0);
        let r = k.komp_neu(rt);
        assert_eq!(k.komp_haenge(r, nackt), 0);
        // 3D-Teil an derselben Stelle (anderer Raum) zählt nicht
        let d = k.teil_neu(3);
        k.teil_lage(d, 100.0, 100.0, 0.0);
        let fd = k.komp_neu(n.t);
        k.setze_text(fd, n.form, b"kugel");
        k.setze_zahl(fd, n.radius, 50.0);
        assert_eq!(k.komp_haenge(fd, d), 0);
        // Kopie von b: übernimmt die Listen bis zum Takt, danach gilt ihr Vortakt als leer → betreten
        let kb = k.teil_kopie(b.t);
        let kf = k.komp_von(kb, n.t);
        assert_eq!(liste(&mut k, kf, n.beruehrt), ids(&[&a]));
        k.takt();
        assert_eq!(liste(&mut k, kf, n.betreten), ids(&[&a]));
        assert_eq!(liste(&mut k, a.f, n.beruehrt), vec![b.t as u32, kb as u32]);
        assert_eq!(liste(&mut k, a.f, n.betreten), vec![kb as u32]);
        assert_eq!(liste(&mut k, fd, n.beruehrt), LEER);
        // entfernt: fällt heraus und erscheint nicht in verlassen
        assert_eq!(k.teil_entferne(b.t), 0);
        k.takt();
        assert_eq!(liste(&mut k, a.f, n.beruehrt), vec![kb as u32]);
        assert_eq!(liste(&mut k, a.f, n.verlassen), LEER);
        // gelöster Fühler: Listen leer, die anderen melden verlassen
        assert_eq!(k.komp_loese(a.f), 0);
        k.takt();
        assert_eq!(liste(&mut k, a.f, n.beruehrt), LEER);
        assert_eq!(liste(&mut k, a.f, n.verlassen), LEER);
        assert_eq!(liste(&mut k, kf, n.verlassen), ids(&[&a]));
    }

    #[test]
    fn formen_und_versatz_2d() {
        let mut k = welt();
        let n = nummern(&mut k);
        // Kreis-Fühler ohne Zeichen-Komponente, radius 10 bei Größe 2 → 20
        let t = k.teil_neu(2);
        k.teil_lage(t, 100.0, 100.0, 0.0);
        k.teil_groesse(t, 2.0, 2.0, 1.0);
        let f = k.komp_neu(n.t);
        k.setze_text(f, n.form, b"kreis");
        k.setze_zahl(f, n.radius, 10.0);
        assert_eq!(k.komp_haenge(f, t), 0);
        // Rechteck 2 × 2 bei (121, 100) berührt den Kreis am Rand (120), bei (122, 100) nicht
        let p = kiste(&mut k, &n, 121.0, 100.0, 2.0, 2.0);
        k.takt();
        assert_eq!(liste(&mut k, f, n.beruehrt), vec![p.t as u32]);
        k.teil_lage(p.t, 122.0, 100.0, 0.0);
        k.takt();
        assert_eq!(liste(&mut k, f, n.beruehrt), LEER);
        // Versatz skaliert mit: versatzX 1 bei Größe 2 → Mitte 102
        k.setze_zahl(f, n.vx, 1.0);
        k.takt();
        assert_eq!(liste(&mut k, f, n.beruehrt), vec![p.t as u32]);
        // Kreis ohne Radius und ohne Hülle → keine Form
        k.setze_zahl(f, n.radius, 0.0);
        k.takt();
        assert_eq!(liste(&mut k, f, n.beruehrt), LEER);
        // rechteck mit eigener breite 100, hoehe 0 aus der Hülle (Rechteck 20 × 4 → y 298 … 302)
        let q = kiste(&mut k, &n, 300.0, 300.0, 20.0, 4.0);
        k.setze_text(q.f, n.form, b"rechteck");
        k.setze_zahl(q.f, n.breite, 100.0);
        let links = kiste(&mut k, &n, 255.0, 300.0, 2.0, 2.0);
        let oben = kiste(&mut k, &n, 300.0, 294.0, 2.0, 2.0);
        k.takt();
        assert_eq!(liste(&mut k, q.f, n.beruehrt), ids(&[&links]));
        // hoehe 10, versatzY −1 → y 294 … 304
        k.setze_zahl(q.f, n.hoehe, 10.0);
        k.setze_zahl(q.f, n.vy, -1.0);
        k.takt();
        assert_eq!(liste(&mut k, q.f, n.beruehrt), ids(&[&links, &oben]));
        // auto mit Versatz verschiebt die Hülle
        k.setze_text(q.f, n.form, b"auto");
        k.setze_zahl(q.f, n.vy, 0.0);
        k.setze_zahl(q.f, n.vx, -40.0);
        k.takt();
        assert_eq!(liste(&mut k, q.f, n.beruehrt), ids(&[&links]), "x 250 … 270");
        // kasten an einem 2D-Teil ist ein Rechteck
        k.setze_text(q.f, n.form, b"kasten");
        k.setze_zahl(q.f, n.vx, 0.0);
        k.setze_zahl(q.f, n.tiefe, 5.0);
        k.takt();
        assert_eq!(liste(&mut k, q.f, n.beruehrt), ids(&[&links, &oben]));
    }

    #[test]
    fn formen_3d_kasten_kugel() {
        let mut k = welt();
        let n = nummern(&mut k);
        let fuehler3 = |k: &mut Kern, x: f64, form: &[u8], gr: f64| {
            let t = k.teil_neu(3);
            k.teil_lage(t, x, 0.0, 0.0);
            let f = k.komp_neu(n.t);
            k.setze_text(f, n.form, form);
            if form == b"kugel" {
                k.setze_zahl(f, n.radius, gr);
            } else {
                k.setze_zahl(f, n.breite, gr);
                k.setze_zahl(f, n.hoehe, gr);
                k.setze_zahl(f, n.tiefe, gr);
            }
            assert_eq!(k.komp_haenge(f, t), 0);
            (t as u32, f)
        };
        let (k1, f1) = fuehler3(&mut k, 0.0, b"kugel", 1.0);
        let (k2, f2) = fuehler3(&mut k, 1.9, b"kugel", 1.0);
        let (_q, fq) = fuehler3(&mut k, 3.5, b"kasten", 1.0);
        let (e, fe) = fuehler3(&mut k, 1.3, b"kasten", 0.2);
        k.takt();
        // Kasten 1.2 … 1.4: Kugel um 0 (r 1) erreicht ihn nicht, Kugel um 1.9 schon; Kasten 3 … 4 nicht (2.9)
        assert_eq!(liste(&mut k, f1, n.beruehrt), vec![k2]);
        assert_eq!(liste(&mut k, f2, n.beruehrt), vec![k1, e]);
        assert_eq!(liste(&mut k, fe, n.beruehrt), vec![k2]);
        assert_eq!(liste(&mut k, fq, n.beruehrt), LEER);
        // Körper als Hülle (auto): Würfel Kante 1 bei x = 3.5 → mit Kasten 3 … 4 und gedreht umschlossen
        let kt = typ(&mut k, "Koerper");
        let ff = feld(&mut k, kt, "form");
        let wuerfel = k.form_grund(1, 0.0, 0.0);
        assert!(wuerfel > 0);
        let t = k.teil_neu(3);
        k.teil_lage(t, 2.5, 0.0, 0.0);
        let kc = k.komp_neu(kt);
        k.setze_zahl(kc, ff, wuerfel as f64);
        k.komp_haenge(kc, t);
        let fa = k.komp_neu(n.t);
        k.komp_haenge(fa, t);
        k.takt();
        assert_eq!(liste(&mut k, fa, n.beruehrt), vec![k2, _q], "x 2 … 3 berührt Kugel (bis 2.9) und Kasten (ab 3)");
    }

    fn kasten(h: &Huelle) -> ([f64; 3], [f64; 3]) {
        match *h {
            Huelle::Kreis(m, r) => ([m[0] - r, m[1] - r, 0.0], [m[0] + r, m[1] + r, 0.0]),
            Huelle::Rechteck(lo, hi) => ([lo[0], lo[1], 0.0], [hi[0], hi[1], 0.0]),
            Huelle::Kasten(lo, hi) => (lo, hi),
            Huelle::Kugel(m, r) => ([m[0] - r, m[1] - r, m[2] - r], [m[0] + r, m[1] + r, m[2] + r]),
        }
    }

    /// Zufällige Szene: Breitphase + Engphase = alle Paare mit `trifft` (Brute Force), sortiert.
    #[test]
    fn breitphase_gleich_brute_force() {
        let mut zustand = 12345u32;
        let mut zufall = || {
            zustand ^= zustand << 13;
            zustand ^= zustand >> 17;
            zustand ^= zustand << 5;
            (zustand % 1000) as f64
        };
        let mut k = Vec::new();
        for i in 0..400u32 {
            let (x, y, r) = (zufall(), zufall(), zufall() / 40.0);
            let huelle = if i % 3 == 0 { Huelle::Kreis([x, y], r) } else { Huelle::Rechteck([x - r, y - r * 0.5], [x + r, y + r * 0.5]) };
            k.push(Kandidat { teil: 1000 - i * 2, drei_d: false, gruppe: 1 << (i % 4), maske: if i % 5 == 0 { !2 } else { u32::MAX }, ausloeser: true, huelle });
        }
        // dazu 3D-Kandidaten (Kugeln, Kästen) und große Kästen über viele Streifen, ein NaN, eine Unendlichkeit
        for i in 0..300u32 {
            let (x, y, z, r) = (zufall() / 5.0, zufall(), zufall() / 5.0, zufall() / 30.0);
            let huelle = if i % 2 == 0 { Huelle::Kugel([x, y, z], r) } else { Huelle::Kasten([x - r, y - r * 3.0, z - r], [x + r, y + r * 3.0, z + r]) };
            k.push(Kandidat { teil: 2001 + i, drei_d: true, gruppe: 1, maske: u32::MAX, ausloeser: false, huelle });
        }
        k.push(Kandidat { teil: 5000, drei_d: false, gruppe: 1, maske: u32::MAX, ausloeser: true, huelle: Huelle::Rechteck([f64::NAN, 0.0], [10.0, f64::NAN]) });
        k.push(Kandidat { teil: 5001, drei_d: false, gruppe: 1, maske: u32::MAX, ausloeser: true, huelle: Huelle::Rechteck([0.0, 400.0], [f64::INFINITY, 420.0]) });
        let mut erwartet = Vec::new();
        for i in 0..k.len() {
            for j in 0..k.len() {
                // Definition: umschließende Kästen überlappen (NaN nie) und Engphase `trifft`
                let (a, b) = (kasten(&k[i].huelle), kasten(&k[j].huelle));
                let kaesten = (0..3).all(|d| a.0[d] <= b.1[d] && b.0[d] <= a.1[d]);
                if k[i].teil < k[j].teil && k[i].spuert(&k[j]) && kaesten && trifft(k[i].huelle, k[j].huelle) {
                    erwartet.push((k[i].teil, k[j].teil));
                }
            }
        }
        erwartet.sort_unstable();
        let ist: Vec<(u32, u32)> = fuehler::paare(&k).iter().map(|&(i, j)| (k[i].teil, k[j].teil)).collect();
        assert!(ist.len() > 50, "{}", ist.len());
        assert!(ist == erwartet, "{} Paare statt {}", ist.len(), erwartet.len());
        assert!(ist.iter().any(|p| p.1 == 5001) && !ist.iter().any(|p| p.1 == 5000), "unendlich ja, NaN nie");
        assert!(fuehler::breitphase(&k).len() >= ist.len());
    }
}

/// H-K1: `Blick` (2D-Kamera im Bildbau) und `Leine` (Folgekamera im Nachlauf).
mod hk1 {
    use super::*;
    use crate::komponenten::blick;

    /// 2D-Instanzen des letzten Pakets: m00 m10 m01 m11 tx ty
    fn inst(k: &Kern) -> Vec<[f32; 6]> {
        let l = Leser::neu(k.paket()).unwrap();
        let Some((_, d)) = l.abschnitte().find(|(a, _)| *a == abschnitt::INST2D) else { return Vec::new() };
        d.chunks_exact(INST2D_BYTES).map(|c| core::array::from_fn(|i| f32::from_le_bytes([c[i * 4], c[i * 4 + 1], c[i * 4 + 2], c[i * 4 + 3]]))).collect()
    }
    fn rechteck(k: &mut Kern, x: f64, y: f64, ebene: f64) -> i32 {
        let r = typ(k, "Rechteck");
        let t = k.teil_neu(2);
        k.teil_lage(t, x, y, 0.0);
        k.teil_setze(t, tf::EBENE, ebene);
        let c = k.komp_neu(r);
        assert_eq!(k.komp_haenge(c, t), 0);
        t
    }
    fn blick_an(k: &mut Kern, x: f64, y: f64) -> (i32, i32) {
        let b = typ(k, "Blick");
        let t = k.teil_neu(2);
        k.teil_lage(t, x, y, 0.0);
        let c = k.komp_neu(b);
        assert_eq!(k.komp_haenge(c, t), 0, "{}", k.fehler_text());
        (t, c)
    }
    fn lagen(k: &Kern) -> Vec<(f32, f32)> {
        inst(k).iter().map(|i| (i[4], i[5])).collect()
    }

    #[test]
    fn schema_und_raum() {
        let mut k = welt();
        let b = typ(&mut k, "Blick");
        let l = typ(&mut k, "Leine");
        let art_b = ARTEN.iter().find(|a| a.schema.name == "Blick").unwrap();
        let art_l = ARTEN.iter().find(|a| a.schema.name == "Leine").unwrap();
        assert!(art_b.takt.is_none() && art_b.nachlauf.is_none() && art_b.bild.is_none() && art_b.huelle.is_none());
        assert!(art_l.nachlauf.is_some() && art_l.takt.is_none() && art_l.bild.is_none() && art_l.huelle.is_none());
        let c = k.komp_neu(b);
        let (fz, ff) = (feld(&mut k, b, "zoom"), feld(&mut k, b, "festAb"));
        assert_eq!(k.hole_zahl(c, fz), 1.0);
        assert_eq!(k.hole_zahl(c, ff), 1000.0);
        assert_eq!(k.setze_zahl(c, fz, 0.0), -2);
        assert_eq!(k.fehler_text(), "Blick.zoom muss zwischen 0.05 und 20 liegen, nicht 0.");
        let t3 = k.teil_neu(3);
        assert_eq!(k.komp_haenge(c, t3), -2);
        assert_eq!(k.fehler_text(), "Blick gibt es nur für 2D-Teile.");
        let cl = k.komp_neu(l);
        let fw = feld(&mut k, l, "weich");
        assert_eq!(k.setze_zahl(cl, fw, 1.0), -2);
        assert_eq!(k.fehler_text(), "Leine.weich muss zwischen 0 und 0.999 liegen, nicht 1.");
        assert_eq!(k.komp_haenge(cl, t3), 0);
    }

    #[test]
    fn ohne_blick_byte_gleich() {
        // gleiche Szene: ohne Blick, mit inaktivem Blick, mit Blick an einem entfernten Teil → byte-gleiches Paket
        let bau = |modus: u32| {
            let mut k = welt();
            rechteck(&mut k, 100.0, 50.0, 0.0);
            rechteck(&mut k, 600.0, 300.0, 1000.0);
            let kr = typ(&mut k, "Kreis");
            let t = k.teil_neu(2);
            k.teil_lage(t, 320.0, 180.0, 0.0);
            k.teil_setze(t, tf::DREHUNG, 30.0);
            let c = k.komp_neu(kr);
            k.komp_haenge(c, t);
            if modus == 1 {
                let (_, c) = blick_an(&mut k, 900.0, 900.0);
                let b = typ(&mut k, "Blick");
                let fa = feld(&mut k, b, "aktiv");
                k.setze_zahl(c, fa, 0.0);
            } else if modus == 2 {
                let (t, _) = blick_an(&mut k, 900.0, 900.0);
                k.teil_entferne(t);
            }
            k.takt();
            k.bild(1);
            (k.paket().to_vec(), k.hash_paket())
        };
        let (p0, h0) = bau(0);
        assert!(p0.len() > 200);
        assert_eq!(bau(1), (p0.clone(), h0));
        assert_eq!(bau(2), (p0, h0));
        // ohne Blick: sichtbares Weltrechteck = Spielfeld
        let mut b = crate::paket::Bildbau::default();
        b.breite = 640.0;
        b.hoehe = 360.0;
        assert_eq!(b.sicht_welt(), ([0.0, 0.0], [640.0, 360.0]));
    }

    #[test]
    fn scrollen_hud_und_culling() {
        let mut k = welt();
        rechteck(&mut k, 1000.0, 500.0, 0.0); // Welt
        rechteck(&mut k, 20.0, 20.0, 1000.0); // HUD
        rechteck(&mut k, 20.0, 20.0, 999.0); // knapp unter festAb: scrollt mit
        k.bild(1);
        // ohne Blick: das Welt-Rechteck liegt außerhalb des Spielfelds
        assert_eq!(lagen(&k), vec![(20.0, 20.0), (20.0, 20.0)]);
        let (bt, c) = blick_an(&mut k, 1000.0, 500.0);
        k.bild(2);
        // Blick bei (1000, 500): Welt-Rechteck in der Mitte, Ebene 999 links oben draußen (Culling nach der Sicht), HUD fest
        assert_eq!(lagen(&k), vec![(320.0, 180.0), (20.0, 20.0)]);
        k.teil_lage(bt, 340.0, 200.0, 0.0);
        k.bild(3);
        // Mitte (340, 200): Welt (1000, 500) bei (980, 480) → draußen; Ebene 999 bei (0, 0) → drin (Rand)
        assert_eq!(lagen(&k), vec![(0.0, 0.0), (20.0, 20.0)]);
        // festAb 999: auch Ebene 999 bleibt fest
        let b = typ(&mut k, "Blick");
        let ff = feld(&mut k, b, "festAb");
        k.setze_zahl(c, ff, 999.0);
        k.bild(4);
        assert_eq!(lagen(&k), vec![(20.0, 20.0), (20.0, 20.0)]);
    }

    #[test]
    fn zoom_und_drehung() {
        let mut k = welt();
        rechteck(&mut k, 110.0, 50.0, 0.0);
        let (bt, c) = blick_an(&mut k, 100.0, 50.0);
        let b = typ(&mut k, "Blick");
        let fz = feld(&mut k, b, "zoom");
        k.setze_zahl(c, fz, 2.0);
        k.bild(1);
        let i = inst(&k);
        assert_eq!(i.len(), 1);
        // 10 Einheiten rechts der Mitte, Zoom 2 → 20 Pixel rechts; Matrix doppelt
        assert_eq!(i[0], [2.0, 0.0, 0.0, 2.0, 340.0, 180.0]);
        // Blick um 90° gedreht: was rechts der Mitte liegt, erscheint darüber (y nach unten, Drehung im Uhrzeigersinn)
        k.teil_setze(bt, tf::DREHUNG, 90.0);
        k.bild(2);
        let i = inst(&k)[0];
        assert!((i[4] - 320.0).abs() < 1e-4 && (i[5] - 160.0).abs() < 1e-4, "{:?}", i);
        assert!(i[0].abs() < 1e-6 && (i[1] + 2.0).abs() < 1e-6 && (i[2] - 2.0).abs() < 1e-6 && i[3].abs() < 1e-6, "{:?}", i);
        // Drehung der Eltern zählt mit: Blick (0°) an einem um 90° gedrehten Eltern-Teil
        k.teil_setze(bt, tf::DREHUNG, 0.0);
        let e = k.teil_neu(2);
        k.teil_lage(e, 100.0, 50.0, 0.0);
        k.teil_setze(e, tf::DREHUNG, 90.0);
        k.teil_lage(bt, 0.0, 0.0, 0.0);
        assert_eq!(k.teil_haenge(bt, e), 0);
        k.bild(3);
        let j = inst(&k)[0];
        assert!((j[4] - 320.0).abs() < 1e-4 && (j[5] - 160.0).abs() < 1e-4, "{:?}", j);
    }

    #[test]
    fn grenzen_klemmen_und_kleinste_id() {
        let mut k = welt();
        rechteck(&mut k, 320.0, 180.0, 0.0);
        let (bt, c) = blick_an(&mut k, 0.0, 0.0);
        let b = typ(&mut k, "Blick");
        let g: Vec<i32> = ["grenzeLinks", "grenzeOben", "grenzeRechts", "grenzeUnten"].iter().map(|n| feld(&mut k, b, n)).collect();
        for (f, v) in g.iter().zip([0.0, 0.0, 2000.0, 1000.0]) {
            k.setze_zahl(c, *f, v);
        }
        k.bild(1);
        // Mitte (0, 0) wird auf (320, 180) geklemmt: Welt-Punkt (320, 180) steht in der Mitte
        assert_eq!(lagen(&k), vec![(320.0, 180.0)]);
        // rechts unten geklemmt auf (1680, 820): das Rechteck ist weit draußen
        k.teil_lage(bt, 5000.0, 5000.0, 0.0);
        k.bild(2);
        assert!(inst(&k).is_empty());
        // Welt kleiner als die Sicht (Zoom 0.5 → Sicht 1280 × 720 Welteinheiten): Mitte der Welt (500, 200)
        k.setze_zahl(c, g[2], 1000.0);
        k.setze_zahl(c, g[3], 400.0);
        let fz = feld(&mut k, b, "zoom");
        k.setze_zahl(c, fz, 0.5);
        k.bild(3);
        assert_eq!(lagen(&k), vec![(230.0, 170.0)]);
        // ein zweiter aktiver Blick mit größerer ID ändert nichts; ist der erste inaktiv, gilt der zweite
        blick_an(&mut k, 320.0, 180.0);
        k.bild(4);
        assert_eq!(lagen(&k), vec![(230.0, 170.0)]);
        let fa = feld(&mut k, b, "aktiv");
        k.setze_zahl(c, fa, 0.0);
        k.bild(5);
        assert_eq!(lagen(&k), vec![(320.0, 180.0)]);
        // nur eine Achse begrenzt (Seitenscroller: grenzeRechts, oben/unten 0): y bleibt frei
        k.setze_zahl(c, fa, 1.0);
        k.setze_zahl(c, fz, 1.0);
        k.setze_zahl(c, g[2], 3000.0);
        k.setze_zahl(c, g[3], 0.0);
        k.teil_lage(bt, -50.0, 200.0, 0.0);
        k.bild(6);
        assert_eq!(lagen(&k), vec![(320.0, 160.0)]);
    }

    #[test]
    fn sicht_welt_rechteck() {
        let mut k = welt();
        let (bt, c) = blick_an(&mut k, 1000.0, 1000.0);
        let b = typ(&mut k, "Blick");
        let fz = feld(&mut k, b, "zoom");
        k.setze_zahl(c, fz, 2.0);
        k.bild(1);
        let s = blick::aktive_sicht(k.welt.as_ref().unwrap(), 640.0, 360.0).unwrap();
        assert_eq!(s.teil, bt as u32);
        assert_eq!((s.welt_min, s.welt_max), ([840.0, 910.0], [1160.0, 1090.0]));
    }

    struct L {
        t: i32,
        ziel: i32,
        ax: i32,
        ay: i32,
        az: i32,
        weich: i32,
        totzone: i32,
        schaue: i32,
    }
    fn leine(k: &mut Kern) -> L {
        let t = typ(k, "Leine");
        L {
            t,
            ziel: feld(k, t, "ziel"),
            ax: feld(k, t, "abstandX"),
            ay: feld(k, t, "abstandY"),
            az: feld(k, t, "abstandZ"),
            weich: feld(k, t, "weich"),
            totzone: feld(k, t, "totzone"),
            schaue: feld(k, t, "schaue"),
        }
    }

    #[test]
    fn leine_starr_sieht_bewegung_desselben_takts() {
        let mut k = welt();
        let n = leine(&mut k);
        let bew = typ(&mut k, "Bewegung");
        let ziel = rechteck(&mut k, 100.0, 100.0, 0.0);
        let bc = k.komp_neu(bew);
        let tx = feld(&mut k, bew, "tempoX");
        k.setze_zahl(bc, tx, 60.0);
        k.komp_haenge(bc, ziel);
        let (bt, _) = blick_an(&mut k, 0.0, 0.0);
        let l = k.komp_neu(n.t);
        k.setze_zahl(l, n.ziel, ziel as f64);
        k.setze_zahl(l, n.ax, 0.5);
        k.setze_zahl(l, n.ay, -20.0);
        k.komp_haenge(l, bt);
        k.takt();
        // nach dem ersten Takt steht das Ziel bei x = 101, der Blick genau dort + Abstand
        assert_eq!(k.teil_hole(ziel, tf::X), 101.0);
        assert_eq!((k.teil_hole(bt, tf::X), k.teil_hole(bt, tf::Y)), (101.5, 80.0));
        k.bild(1);
        assert_eq!(lagen(&k), vec![(319.5, 200.0)]);
        // Ziel entfernt, Ziel = eigenes Teil, Ziel karton: keine Wirkung, kein Fehler
        k.teil_entferne(ziel);
        assert_eq!(k.takt(), 0);
        k.setze_zahl(l, n.ziel, bt as f64);
        assert_eq!(k.takt(), 0);
        k.setze_zahl(l, n.ziel, 0.0);
        assert_eq!(k.takt(), 0);
        assert_eq!((k.teil_hole(bt, tf::X), k.teil_hole(bt, tf::Y)), (101.5, 80.0));
    }

    #[test]
    fn leine_daempfung_und_totzone() {
        let mut k = welt();
        let n = leine(&mut k);
        let ziel = rechteck(&mut k, 100.0, 0.0, 0.0);
        let t = k.teil_neu(2);
        let l = k.komp_neu(n.t);
        k.setze_zahl(l, n.ziel, ziel as f64);
        k.setze_zahl(l, n.weich, 0.25);
        k.komp_haenge(l, t);
        for _ in 0..60 {
            k.takt();
        }
        // nach einer Sekunde ist ein Viertel des Rests übrig
        let x = k.teil_hole(t, tf::X);
        assert!((x - 75.0).abs() < 1e-9, "{}", x);
        // Totzone 10, starr: Ziel 25 weg → zieht bis auf 10 heran
        k.setze_zahl(l, n.weich, 0.0);
        k.setze_zahl(l, n.totzone, 10.0);
        k.takt();
        assert!((k.teil_hole(t, tf::X) - 90.0).abs() < 1e-9);
        // innerhalb der Totzone: steht
        k.teil_lage(ziel, 95.0, 0.0, 0.0);
        k.takt();
        assert!((k.teil_hole(t, tf::X) - 90.0).abs() < 1e-9);
        // schräg (30, 40) weg, Länge 50: bleibt 10 entlang der Richtung zurück
        k.teil_lage(ziel, 120.0, 40.0, 0.0);
        k.takt();
        let (x, y) = (k.teil_hole(t, tf::X), k.teil_hole(t, tf::Y));
        assert!((x - 114.0).abs() < 1e-9 && (y - 32.0).abs() < 1e-9, "{} {}", x, y);
    }

    #[test]
    fn leine_3d_mit_schaue_und_raumwechsel() {
        let mut k = welt();
        let n = leine(&mut k);
        // Teil 1 = Standardkamera
        let ziel = k.teil_neu(3);
        k.teil_lage(ziel, 4.0, 0.0, -2.0);
        let l = k.komp_neu(n.t);
        k.setze_zahl(l, n.ziel, ziel as f64);
        k.setze_zahl(l, n.ay, 3.0);
        k.setze_zahl(l, n.az, 8.0);
        k.setze_zahl(l, n.schaue, 1.0);
        assert_eq!(k.komp_haenge(l, 1), 0);
        k.takt();
        assert_eq!([k.teil_hole(1, tf::X), k.teil_hole(1, tf::Y), k.teil_hole(1, tf::Z)], [4.0, 3.0, 6.0]);
        // schaut aufs Ziel wie schaueAuf
        let (d, ng) = (k.teil_hole(1, tf::DREHUNG), k.teil_hole(1, tf::NEIGUNG));
        assert!(ng < 0.0);
        k.teil_schaue(1, 4.0, 0.0, -2.0);
        assert_eq!((k.teil_hole(1, tf::DREHUNG), k.teil_hole(1, tf::NEIGUNG)), (d, ng));
        // 2D-Ziel für ein 3D-Teil: keine Wirkung
        let z2 = rechteck(&mut k, 50.0, 50.0, 0.0);
        k.setze_zahl(l, n.ziel, z2 as f64);
        k.setze_zahl(l, n.az, 0.0);
        k.takt();
        assert_eq!(k.teil_hole(1, tf::Z), 6.0);
        let _ = n.totzone;
    }
}

/// H-K7: `Wucht` – 2D-Physik auf den festen Fühlern (Schwerkraft, Stöße, Abprall, Reibung, Stapeln).
mod hk7 {
    use super::*;
    use crate::komponenten::{wucht, Huelle, DT};

    /// Typ- und Feldnummern
    struct N {
        f: i32,
        f_form: i32,
        f_aus: i32,
        f_radius: i32,
        w: i32,
        art: i32,
        masse: i32,
        tx: i32,
        ty: i32,
        g: i32,
        abprall: i32,
        reibung: i32,
        sx: i32,
        sy: i32,
        boden: i32,
    }
    fn nummern(k: &mut Kern) -> N {
        let (f, w) = (typ(k, "Fuehler"), typ(k, "Wucht"));
        N {
            f,
            f_form: feld(k, f, "form"),
            f_aus: feld(k, f, "ausloeser"),
            f_radius: feld(k, f, "radius"),
            w,
            art: feld(k, w, "art"),
            masse: feld(k, w, "masse"),
            tx: feld(k, w, "tempoX"),
            ty: feld(k, w, "tempoY"),
            g: feld(k, w, "schwerkraft"),
            abprall: feld(k, w, "abprall"),
            reibung: feld(k, w, "reibung"),
            sx: feld(k, w, "stossX"),
            sy: feld(k, w, "stossY"),
            boden: feld(k, w, "amBoden"),
        }
    }
    /// 2D-Teil mit Rechteck b × h bei (x, y) und festem Fühler (auto); gibt (Teil, Fühler)
    fn kiste(k: &mut Kern, n: &N, x: f64, y: f64, b: f64, h: f64) -> (i32, i32) {
        let rt = typ(k, "Rechteck");
        let (fb, fh) = (feld(k, rt, "breite"), feld(k, rt, "hoehe"));
        let t = k.teil_neu(2);
        k.teil_lage(t, x, y, 0.0);
        let r = k.komp_neu(rt);
        k.setze_zahl(r, fb, b);
        k.setze_zahl(r, fh, h);
        assert_eq!(k.komp_haenge(r, t), 0);
        let f = k.komp_neu(n.f);
        k.setze_zahl(f, n.f_aus, 0.0);
        assert_eq!(k.komp_haenge(f, t), 0);
        (t, f)
    }
    /// 2D-Kreis-Teil mit festem Fühler
    fn kugel(k: &mut Kern, n: &N, x: f64, y: f64, r: f64) -> (i32, i32) {
        let t = k.teil_neu(2);
        k.teil_lage(t, x, y, 0.0);
        let f = k.komp_neu(n.f);
        k.setze_text(f, n.f_form, b"kreis");
        k.setze_zahl(f, n.f_radius, r);
        k.setze_zahl(f, n.f_aus, 0.0);
        assert_eq!(k.komp_haenge(f, t), 0);
        (t, f)
    }
    /// Wucht (dynamisch) mit Schwerkraft g an Teil t
    fn wucht(k: &mut Kern, n: &N, t: i32, g: f64) -> i32 {
        let w = k.komp_neu(n.w);
        k.setze_zahl(w, n.g, g);
        assert_eq!(k.komp_haenge(w, t), 0, "{}", k.fehler_text());
        w
    }

    #[test]
    fn schema_typnummer_braucht_lesefeld() {
        let mut k = welt();
        let n = nummern(&mut k);
        assert_eq!(n.w, 20, "Typnummer in Merge-Reihenfolge nach Blick (18) und Leine (19)");
        let art = ARTEN.iter().find(|a| a.schema.name == "Wucht").unwrap();
        assert!(art.takt.is_some() && art.nachlauf.is_none() && art.bild.is_none() && art.huelle.is_none());
        // ohne Fühler nicht anhängbar, Fühler nicht lösbar, solange Wucht hängt
        let t = k.teil_neu(2);
        let w = k.komp_neu(n.w);
        assert!(k.komp_haenge(w, t) < 0);
        assert_eq!(k.fehler_text(), "Wucht braucht einen Fuehler am selben Teil.");
        let f = k.komp_neu(n.f);
        assert_eq!(k.komp_haenge(f, t), 0);
        assert_eq!(k.komp_haenge(w, t), 0);
        assert!(k.komp_loese(f) < 0);
        assert_eq!(k.fehler_text(), "Fuehler wird von Wucht am selben Teil gebraucht.");
        // nur 2D
        let t3 = k.teil_neu(3);
        let f3 = k.komp_neu(n.f);
        assert_eq!(k.komp_haenge(f3, t3), 0);
        let w3 = k.komp_neu(n.w);
        assert!(k.komp_haenge(w3, t3) < 0);
        // Lesefeld, Bereiche
        assert!(k.setze_zahl(w, n.boden, 1.0) < 0);
        assert_eq!(k.fehler_text(), "Wucht.amBoden kann man nur lesen.");
        assert!(k.setze_zahl(w, n.masse, 0.0) < 0);
        assert_eq!(k.fehler_text(), "Wucht.masse muss mindestens 0.001 sein, nicht 0.");
        assert!(k.setze_zahl(w, n.abprall, 1.5) < 0);
        assert!(k.setze_text(w, n.art, b"fliegend") < 0);
        assert_eq!(k.fehler_text(), "Wucht.art kennt 'fliegend' nicht. Erlaubt: dynamisch, kinematisch, fest.");
        assert_eq!(k.hole_zahl(w, n.reibung), 0.2);
    }

    #[test]
    fn fallhoehe_nach_n_takten() {
        let mut k = welt();
        let n = nummern(&mut k);
        let (t, _) = kugel(&mut k, &n, 100.0, 10.0, 5.0);
        let w = wucht(&mut k, &n, t, 1200.0);
        // semi-implizites Euler: v_i = g·dt·i, y_n = y0 + Σ v_i·dt (genau so nachgerechnet, dazu die geschlossene Form)
        let (mut y, mut v) = (10.0f64, 0.0f64);
        for i in 1..=30 {
            k.takt();
            v += 1200.0 * DT;
            y += v * DT;
            assert_eq!(k.teil_hole(t, tf::Y), y, "Takt {}", i);
        }
        let geschlossen = 10.0 + 1200.0 * DT * DT * 30.0 * 31.0 / 2.0;
        assert!((y - geschlossen).abs() < 1e-9, "{} gegen {}", y, geschlossen);
        assert_eq!(k.hole_zahl(w, n.ty), v);
        assert_eq!(k.hole_zahl(w, n.boden), 0.0);
        assert_eq!(k.teil_hole(t, tf::X), 100.0);
    }

    #[test]
    fn stapel_aus_10_kisten_ruht() {
        let mut k = welt();
        let n = nummern(&mut k);
        let (boden, _) = kiste(&mut k, &n, 320.0, 340.0, 600.0, 20.0); // Oberkante 330
        let mut kisten = Vec::new();
        for i in 0..10 {
            let (t, _) = kiste(&mut k, &n, 300.0 + (i % 2) as f64 * 3.0, 320.0 - 20.0 * i as f64, 20.0, 20.0);
            let w = wucht(&mut k, &n, t, 1200.0);
            kisten.push((t, w, k.teil_hole(t, tf::Y)));
        }
        for _ in 0..300 {
            k.takt();
        }
        let vorher: Vec<f64> = kisten.iter().map(|&(t, _, _)| k.teil_hole(t, tf::Y)).collect();
        for _ in 0..300 {
            k.takt();
        }
        for (i, &(t, w, y0)) in kisten.iter().enumerate() {
            let y = k.teil_hole(t, tf::Y);
            // 4 Iterationen lösen einen hohen Stapel nicht ganz: je Fuge sackt er etwas ein, aber er ruht
            assert!(y - y0 >= 0.0 && y - y0 < 0.8 * (i + 1) as f64, "Kiste {} sackt: {} statt {}", i, y, y0);
            assert!((y - vorher[i]).abs() < 0.01, "Kiste {} ruht nicht: {} → {}", i, vorher[i], y);
            assert!(k.hole_zahl(w, n.ty).abs() < 25.0, "Kiste {} tempo {}", i, k.hole_zahl(w, n.ty));
            assert_eq!(k.hole_zahl(w, n.boden), 1.0, "Kiste {} amBoden", i);
            let x = k.teil_hole(t, tf::X);
            assert!((x - (300.0 + (i % 2) as f64 * 3.0)).abs() < 1e-6, "Kiste {} rutscht: {}", i, x);
        }
        assert_eq!(k.teil_hole(boden, tf::Y), 340.0, "Fühler ohne Wucht = fest");
    }

    #[test]
    fn abprall_und_reibung() {
        let mut k = welt();
        let n = nummern(&mut k);
        kiste(&mut k, &n, 320.0, 350.0, 640.0, 20.0); // Oberkante 340
        let (hoch, _) = kugel(&mut k, &n, 100.0, 100.0, 10.0);
        let wh = wucht(&mut k, &n, hoch, 1200.0);
        k.setze_zahl(wh, n.abprall, 1.0);
        let (tot, _) = kugel(&mut k, &n, 300.0, 100.0, 10.0);
        let wt = wucht(&mut k, &n, tot, 1200.0);
        // höchster Punkt nach dem ersten Aufprall: fast wieder die Starthöhe
        let mut min_y = f64::INFINITY;
        let mut aufgeprallt = false;
        for _ in 0..90 {
            k.takt();
            let y = k.teil_hole(hoch, tf::Y);
            if k.hole_zahl(wh, n.ty) < 0.0 {
                aufgeprallt = true;
            }
            if aufgeprallt && y < min_y {
                min_y = y;
            }
        }
        assert!(aufgeprallt);
        assert!(min_y < 115.0, "Abprall 1: steigt wieder bis {}", min_y);
        // Abprall 0: bleibt liegen
        let y = k.teil_hole(tot, tf::Y);
        assert!((y - 330.0).abs() < 1.0, "liegt auf 330: {}", y);
        assert_eq!(k.hole_zahl(wt, n.boden), 1.0);
        // Reibung: eine geschobene Kiste bremst (reibung 1), eine ohne Reibung rutscht weiter
        let (rau, _) = kiste(&mut k, &n, 100.0, 330.0, 20.0, 20.0);
        let wr = wucht(&mut k, &n, rau, 1200.0);
        k.setze_zahl(wr, n.reibung, 1.0);
        k.setze_zahl(wr, n.tx, 200.0);
        let (glatt, _) = kiste(&mut k, &n, 500.0, 330.0, 20.0, 20.0);
        let wg = wucht(&mut k, &n, glatt, 1200.0);
        k.setze_zahl(wg, n.reibung, 0.0);
        k.setze_zahl(wg, n.tx, 50.0);
        for _ in 0..30 {
            k.takt();
        }
        assert!(k.hole_zahl(wr, n.tx).abs() < 1e-9, "rau steht: {}", k.hole_zahl(wr, n.tx));
        assert_eq!(k.hole_zahl(wg, n.tx), 50.0, "glatt gleitet");
    }

    #[test]
    fn stoss_einmal_masse() {
        let mut k = welt();
        let n = nummern(&mut k);
        let (t, _) = kugel(&mut k, &n, 100.0, 100.0, 5.0);
        let w = wucht(&mut k, &n, t, 0.0);
        k.setze_zahl(w, n.masse, 2.0);
        k.setze_zahl(w, n.sx, 120.0);
        k.setze_zahl(w, n.sy, -60.0);
        k.takt();
        assert_eq!((k.hole_zahl(w, n.tx), k.hole_zahl(w, n.ty)), (60.0, -30.0));
        assert_eq!((k.hole_zahl(w, n.sx), k.hole_zahl(w, n.sy)), (0.0, 0.0), "danach 0");
        k.takt();
        assert_eq!(k.hole_zahl(w, n.tx), 60.0);
        assert_eq!(k.teil_hole(t, tf::X), 100.0 + 60.0 * DT + 60.0 * DT);
    }

    #[test]
    fn ausloeser_fest_kinematisch() {
        let mut k = welt();
        let n = nummern(&mut k);
        kiste(&mut k, &n, 320.0, 200.0, 640.0, 20.0);
        // Auslöser-Fühler stößt nicht: fällt durch
        let (geist, gf) = kugel(&mut k, &n, 100.0, 150.0, 10.0);
        k.setze_zahl(gf, n.f_aus, 1.0);
        wucht(&mut k, &n, geist, 1200.0);
        // fest: bewegt sich nie, auch mit tempo
        let (stein, _) = kiste(&mut k, &n, 300.0, 100.0, 20.0, 20.0);
        let ws = wucht(&mut k, &n, stein, 1200.0);
        k.setze_text(ws, n.art, b"fest");
        k.setze_zahl(ws, n.tx, 100.0);
        // kinematisch: fährt mit tempo, schiebt eine Kugel, wird selbst nicht geschoben; stoss wirkt nicht
        let (schieber, _) = kiste(&mut k, &n, 400.0, 170.0, 20.0, 20.0);
        let wk = wucht(&mut k, &n, schieber, 1200.0);
        k.setze_text(wk, n.art, b"kinematisch");
        k.setze_zahl(wk, n.tx, 60.0);
        k.setze_zahl(wk, n.sx, 1000.0);
        let (ball, _) = kugel(&mut k, &n, 425.0, 170.0, 5.0);
        let wb = wucht(&mut k, &n, ball, 0.0);
        k.setze_zahl(wb, n.reibung, 0.0);
        for _ in 0..60 {
            k.takt();
        }
        assert!(k.teil_hole(geist, tf::Y) > 400.0, "Auslöser fällt durch: {}", k.teil_hole(geist, tf::Y));
        assert_eq!((k.teil_hole(stein, tf::X), k.teil_hole(stein, tf::Y)), (300.0, 100.0));
        let x = k.teil_hole(schieber, tf::X);
        assert!((x - 460.0).abs() < 1e-9 && k.teil_hole(schieber, tf::Y) == 170.0, "kinematisch: {}", x);
        assert_eq!(k.hole_zahl(wk, n.tx), 60.0);
        assert!(k.teil_hole(ball, tf::X) >= x + 10.0 + 5.0 - 0.5, "Ball vor dem Schieber: {}", k.teil_hole(ball, tf::X));
    }

    #[test]
    fn schuessel_mit_500_kugeln_kommt_zur_ruhe() {
        let mut k = welt();
        let n = nummern(&mut k);
        // dicke Wände (kein Schutz gegen Durchtunneln: Doku-Tipp)
        kiste(&mut k, &n, 320.0, 440.0, 1000.0, 200.0); // Boden, Oberkante 340
        kiste(&mut k, &n, -80.0, 180.0, 200.0, 600.0); // Wände innen 20 … 620
        kiste(&mut k, &n, 720.0, 180.0, 200.0, 600.0);
        let mut kugeln = Vec::new();
        for e in 0..500 {
            let (t, _) = kugel(&mut k, &n, 30.0 + (e % 40) as f64 * 14.5, 20.0 + (e / 40) as f64 * 13.0, 4.0 + (e % 3) as f64);
            let w = wucht(&mut k, &n, t, 1200.0);
            k.setze_zahl(w, n.abprall, (e % 4) as f64 * 0.2);
            k.setze_zahl(w, n.masse, 1.0 + (e % 5) as f64);
            k.setze_zahl(w, n.tx, (e % 9) as f64 * 20.0 - 80.0);
            kugeln.push((t, w));
        }
        let lagen = |k: &mut Kern| -> Vec<(f64, f64)> { kugeln.iter().map(|&(t, _)| (k.teil_hole(t, tf::X), k.teil_hole(t, tf::Y))).collect() };
        for _ in 0..420 {
            k.takt();
        }
        let vorher = lagen(&mut k);
        for _ in 0..60 {
            k.takt();
        }
        // kein Schlafen: ein großer Haufen zittert ein wenig, wandert aber kaum noch
        let jetzt = lagen(&mut k);
        let wege: Vec<f64> = vorher.iter().zip(&jetzt).map(|(a, b)| (a.0 - b.0).abs() + (a.1 - b.1).abs()).collect();
        let mittel = wege.iter().sum::<f64>() / wege.len() as f64;
        assert!(mittel < 1.0, "Haufen wandert: {} px in 60 Takten", mittel);
        let (mut boden, mut tiefst, mut ein) = (0, 0.0f64, 0.0f64);
        for (e, &(t, w)) in kugeln.iter().enumerate() {
            let (x, y) = jetzt[e];
            assert!(x > 20.0 && x < 620.0 && y < 340.0, "Kugel {} entwischt: {} {}", t, x, y);
            tiefst = tiefst.max(y);
            ein = ein.max(y + 4.0 + (e % 3) as f64 - 340.0);
            if k.hole_zahl(w, n.boden) == 1.0 {
                boden += 1;
            }
        }
        assert!(boden > 450, "amBoden nur {} von 500", boden);
        assert!(ein < 1.5, "Kugeln stecken {} px im Boden", ein);
        assert!(tiefst > 330.0, "unterste Kugeln liegen auf dem Boden: {}", tiefst);
    }

    #[test]
    fn kontakt_normalen() {
        let k = |a: Huelle, b: Huelle| wucht::kontakt(&a, &b);
        // Kreis auf Rechteck: Normale vom Kreis (a) zum Rechteck (b) zeigt nach unten (y wächst nach unten)
        let (n, t) = k(Huelle::Kreis([0.0, -9.0], 10.0), Huelle::Rechteck([-50.0, 0.0], [50.0, 10.0])).unwrap();
        assert_eq!(n, [0.0, 1.0]);
        assert!((t - 1.0).abs() < 1e-12);
        let (n, _) = k(Huelle::Rechteck([-50.0, 0.0], [50.0, 10.0]), Huelle::Kreis([0.0, -9.0], 10.0)).unwrap();
        assert_eq!(n, [0.0, -1.0]);
        // Mitte im Rechteck: zur nächsten Kante
        let (n, t) = k(Huelle::Rechteck([0.0, 0.0], [100.0, 100.0]), Huelle::Kreis([98.0, 50.0], 1.0)).unwrap();
        assert_eq!((n, t), ([1.0, 0.0], 3.0));
        // Rechtecke: kleinere Überlappung
        let (n, t) = k(Huelle::Rechteck([0.0, 0.0], [10.0, 10.0]), Huelle::Rechteck([8.0, 1.0], [18.0, 11.0])).unwrap();
        assert_eq!((n, t), ([1.0, 0.0], 2.0));
        // Ränder zählen, Abstand nicht
        assert_eq!(k(Huelle::Kreis([0.0, 0.0], 1.0), Huelle::Kreis([2.0, 0.0], 1.0)), Some(([1.0, 0.0], 0.0)));
        assert_eq!(k(Huelle::Kreis([0.0, 0.0], 1.0), Huelle::Kreis([2.5, 0.0], 1.0)), None);
        assert_eq!(k(Huelle::Kreis([0.0, 0.0], 1.0), Huelle::Kreis([0.0, 0.0], 1.0)), Some(([0.0, -1.0], 2.0)));
        assert_eq!(k(Huelle::Kugel([0.0; 3], 1.0), Huelle::Kugel([0.0; 3], 1.0)), None);
    }
}


mod hk3b {
    use super::*;
    use crate::komponenten::vieleck::{self, zerlege, Netz};
    use crate::paket::flach_art;

    fn kreuz(p: &[f64], a: u32, b: u32, c: u32) -> f64 {
        let g = |i: u32| (p[2 * i as usize], p[2 * i as usize + 1]);
        let (a, b, c) = (g(a), g(b), g(c));
        (b.0 - a.0) * (c.1 - a.1) - (b.1 - a.1) * (c.0 - a.0)
    }
    fn flaeche(p: &[f64], ring: &[u32]) -> f64 {
        let n = ring.len();
        let mut f = 0.0;
        for i in 0..n {
            let (a, b) = (ring[i] as usize, ring[(i + 1) % n] as usize);
            f += p[2 * a] * p[2 * b + 1] - p[2 * b] * p[2 * a + 1];
        }
        f * 0.5
    }
    /// Prüft eine Zerlegung: n − 2 Dreiecke, alle im Umlaufsinn, Flächen addieren sich, jede Umlaufkante genau einmal Außenkante,
    /// keine Diagonale als Außenkante.
    fn pruefe(p: &[f64], n: &Netz) {
        let m = n.ring.len();
        assert_eq!(n.dreiecke.len(), m - 2);
        let soll = flaeche(p, &n.ring);
        let mut summe = 0.0;
        let mut aussen: Vec<(u32, u32)> = Vec::new();
        for d in &n.dreiecke {
            let k = kreuz(p, d[0], d[1], d[2]);
            assert!(k * soll > 0.0, "Dreieck {:?} falsch herum oder leer", d);
            summe += k * 0.5;
            for (bit, (a, b)) in [(d[0], d[1]), (d[1], d[2]), (d[2], d[0])].into_iter().enumerate() {
                if d[3] >> bit & 1 == 1 {
                    aussen.push((a, b));
                }
            }
        }
        assert!((summe - soll).abs() <= 1e-9 * soll.abs().max(1.0), "Fläche {} statt {}", summe, soll);
        let mut kanten: Vec<(u32, u32)> = (0..m).map(|i| (n.ring[i], n.ring[(i + 1) % m])).collect();
        kanten.sort();
        aussen.sort();
        assert_eq!(aussen, kanten);
    }

    #[test]
    fn zerlegung_konvex_konkav_stern() {
        // Quadrat: Ohrenschneiden ab Punkt 0
        let q = [0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0];
        let n = zerlege(&q).unwrap();
        assert_eq!(n.ring, [0, 1, 2, 3]);
        assert_eq!(n.dreiecke, [[3, 0, 1, 0b11], [1, 2, 3, 0b011]]);
        pruefe(&q, &n);
        // derselbe Umriss andersherum
        let r = [0.0, 0.0, 0.0, 10.0, 10.0, 10.0, 10.0, 0.0];
        pruefe(&r, &zerlege(&r).unwrap());
        // konkav: L-Form und Pfeil
        let l = [0.0, 0.0, 20.0, 0.0, 20.0, 5.0, 5.0, 5.0, 5.0, 20.0, 0.0, 20.0];
        pruefe(&l, &zerlege(&l).unwrap());
        let pfeil = [0.0, 0.0, 30.0, 15.0, 0.0, 30.0, 10.0, 15.0];
        let n = zerlege(&pfeil).unwrap();
        pruefe(&pfeil, &n);
        assert!(n.dreiecke.iter().all(|d| d[..3].contains(&3)), "die einspringende Ecke gehört zu beiden Dreiecken");
        // Stern mit 5 Zacken (10 Punkte), Startecke in einer Mulde
        let mut stern = Vec::new();
        for i in 0..10 {
            let w = i as f64 * core::f64::consts::PI / 5.0 + 0.3;
            let r = if i % 2 == 0 { 20.0 } else { 50.0 };
            stern.push(libm::cos(w) * r);
            stern.push(libm::sin(w) * r);
        }
        let n = zerlege(&stern).unwrap();
        pruefe(&stern, &n);
        assert_eq!(zerlege(&stern), Some(n), "deterministisch");
        // Spirale mit vielen einspringenden Ecken, 256 Punkte
        let mut spirale = Vec::new();
        for i in 0..128 {
            let w = i as f64 * 0.09;
            spirale.push(libm::cos(w) * (30.0 + i as f64));
            spirale.push(libm::sin(w) * (30.0 + i as f64));
        }
        for i in (0..128).rev() {
            let w = i as f64 * 0.09;
            spirale.push(libm::cos(w) * (20.0 + i as f64));
            spirale.push(libm::sin(w) * (20.0 + i as f64));
        }
        pruefe(&spirale, &zerlege(&spirale).unwrap());
    }

    #[test]
    fn zerlegung_entartet_und_ungueltig() {
        assert_eq!(zerlege(&[]), None);
        assert_eq!(zerlege(&[0.0, 0.0, 1.0, 0.0]), None, "zwei Punkte");
        assert_eq!(zerlege(&[0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 5.0]), None, "ungerade Länge");
        assert_eq!(zerlege(&[0.0, 0.0, 1.0, f64::NAN, 1.0, 1.0]), None, "NaN");
        assert_eq!(zerlege(&[0.0, 0.0, 1.0, f64::INFINITY, 1.0, 1.0]), None, "unendlich");
        assert_eq!(zerlege(&[0.0, 0.0, 1.0, 1.0, 2.0, 2.0, 3.0, 3.0]), None, "alle auf einer Geraden");
        assert_eq!(zerlege(&[0.0, 0.0, 5.0, 0.0, 5.0, 0.0, 0.0, 0.0]), None, "nur zwei verschiedene Punkte");
        // Fliege (selbstschneidend), Ecke auf fremder Kante, Spitze zurück auf der eigenen Kante
        assert_eq!(zerlege(&[0.0, 0.0, 10.0, 10.0, 10.0, 0.0, 0.0, 10.0]), None);
        assert_eq!(zerlege(&[0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 5.0, 0.0, 0.0, 10.0]), None);
        assert_eq!(zerlege(&[0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0, 0.0, 20.0]), None);
        // doppelte Punkte und Punkte auf einer Kante sind erlaubt und fallen aus dem Umlauf
        let d = [0.0, 0.0, 0.0, 0.0, 5.0, 0.0, 10.0, 0.0, 10.0, 10.0, 10.0, 10.0, 0.0, 10.0, 0.0, 0.0];
        let n = zerlege(&d).unwrap();
        assert_eq!(n.ring, [0, 3, 4, 6]);
        pruefe(&d, &n);
        // Grenzen: 3 und 256 Punkte, 257 nicht
        let kreis = |n: usize| -> Vec<f64> {
            (0..n)
                .flat_map(|i| {
                    let w = i as f64 * 2.0 * core::f64::consts::PI / n as f64;
                    [libm::cos(w) * 100.0, libm::sin(w) * 100.0]
                })
                .collect()
        };
        assert_eq!(zerlege(&kreis(3)).unwrap().dreiecke.len(), 1);
        pruefe(&kreis(256), &zerlege(&kreis(256)).unwrap());
        assert_eq!(zerlege(&kreis(257)), None);
        assert_eq!(vieleck::MAX_PUNKTE, 256);
    }

    /// DREIECK-Instanzen des letzten Pakets: Ecken A, B, C (Spielfeld-Pixel) und Kantenmaske
    fn dreiecke(k: &Kern) -> Vec<([f32; 6], u32)> {
        let l = Leser::neu(k.paket()).unwrap();
        let Some((_, d)) = l.abschnitte().find(|(a, _)| *a == abschnitt::INST2D) else { return Vec::new() };
        let f = |c: &[u8], o: usize| f32::from_le_bytes([c[o], c[o + 1], c[o + 2], c[o + 3]]);
        d.chunks_exact(INST2D_BYTES)
            .filter(|c| u32::from_le_bytes([c[44], c[45], c[46], c[47]]) == flach_art::DREIECK)
            .map(|c| ([f(c, 16), f(c, 20), f(c, 0), f(c, 4), f(c, 8), f(c, 12)], f(c, 32) as u32))
            .collect()
    }

    #[test]
    fn vieleck_im_bildpaket_cache_umriss_huelle() {
        let mut k = welt();
        let v = typ(&mut k, "Vieleck");
        assert_eq!(v as usize, ARTEN.iter().position(|a| a.schema.name == "Vieleck").unwrap() + 1);
        let (pu, um, fa) = (feld(&mut k, v, "punkte"), feld(&mut k, v, "umriss"), feld(&mut k, v, "farbe"));
        assert!(k.feld_nummer(v, b"quelle") <= 0, "verborgen");
        let r = typ(&mut k, "Rechteck");
        let t0 = k.teil_neu(2);
        k.teil_lage(t0, 300.0, 200.0, 0.0);
        let rc = k.komp_neu(r);
        k.komp_haenge(rc, t0);
        k.bild(1);
        k.bild(1); // ohne Ressourcen-Deltas
        let ohne = k.paket().to_vec();
        let inst = |k: &Kern| -> Vec<u8> {
            let l = Leser::neu(k.paket()).unwrap();
            let d = l.abschnitte().find(|(a, _)| *a == abschnitt::INST2D).map(|(_, d)| d.to_vec()).unwrap_or_default();
            d
        };
        let inst_ohne = inst(&k);
        // leeres Vieleck: Paket byte-gleich wie ohne
        let t = k.teil_neu(2);
        k.teil_lage(t, 100.0, 50.0, 0.0);
        let c = k.komp_neu(v);
        assert_eq!(text(&mut k, c, fa), "weiss");
        assert_eq!(k.komp_haenge(c, t), 0);
        k.bild(1);
        assert_eq!(k.paket(), &ohne[..]);
        k.takt();
        k.bild(1);
        assert_eq!(inst(&k), inst_ohne);
        // Quadrat: zwei Dreiecke mit Ecken in Spielfeld-Pixeln, schon vor dem ersten Takt (ohne Cache) wie danach
        assert_eq!(k.setze_zahlen(c, pu, &[0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]), 0);
        k.bild(2);
        let vorher = dreiecke(&k);
        assert_eq!(vorher, [([100.0, 60.0, 100.0, 50.0, 110.0, 50.0], 3), ([110.0, 50.0, 110.0, 60.0, 100.0, 60.0], 3)]);
        k.takt();
        let s = &k.welt.as_ref().unwrap().speicher[v as usize - 1];
        assert_eq!(s.puffer(vieleck::QUELLE)[0].len(), 8);
        assert_eq!(s.puffer(vieleck::NETZ)[0], [4.0, 0.0, 1.0, 2.0, 3.0, 3.0, 0.0, 1.0, 3.0, 1.0, 2.0, 3.0, 3.0]);
        k.bild(3);
        assert_eq!(dreiecke(&k), vorher);
        // Drehung und Größe des Teils wirken auf die Ecken
        k.teil_setze(t, tf::DREHUNG, 90.0);
        k.teil_setze(t, tf::GROESSE_X, 2.0);
        k.teil_setze(t, tf::GROESSE_Y, 2.0);
        k.bild(4);
        let gedreht = dreiecke(&k);
        assert_eq!(gedreht[0].0[2..4], [100.0, 50.0]);
        assert!((gedreht[1].0[2] - 80.0).abs() < 1e-4 && (gedreht[1].0[3] - 70.0).abs() < 1e-4, "{:?}", gedreht);
        k.teil_setze(t, tf::DREHUNG, 0.0);
        k.teil_setze(t, tf::GROESSE_X, 1.0);
        k.teil_setze(t, tf::GROESSE_Y, 1.0);
        // Umriss: je Kante zwei Dreiecke, Außenkante (Bit 0) und Innenkante (Bit 1)
        assert_eq!(k.setze_zahl(c, um, 2.0), 0);
        k.bild(5);
        let u = dreiecke(&k);
        assert_eq!(u.len(), 8);
        assert!(u.iter().enumerate().all(|(i, d)| d.1 == if i % 2 == 0 { 1 } else { 2 }));
        assert_eq!(u[0].0, [100.0, 50.0, 110.0, 50.0, 108.0, 52.0]);
        assert_eq!(u[1].0, [100.0, 50.0, 108.0, 52.0, 102.0, 52.0]);
        assert_eq!(k.setze_zahl(c, um, -1.0), -2);
        assert_eq!(k.fehler_text(), "Vieleck.umriss muss mindestens 0 sein, nicht -1.");
        assert_eq!(k.setze_zahl(c, um, 0.0), 0);
        // ungültig (Fliege) → nichts gezeichnet, kein Fehler; Hülle bleibt das umschließende Rechteck
        assert_eq!(k.setze_zahlen(c, pu, &[0.0, 0.0, 10.0, 10.0, 10.0, 0.0, 0.0, 10.0]), 0);
        k.takt();
        k.bild(6);
        assert!(dreiecke(&k).is_empty());
        assert_eq!(inst(&k), inst_ohne);
        assert!(k.welt.as_ref().unwrap().speicher[v as usize - 1].puffer(vieleck::NETZ)[0].is_empty());
        let kr = typ(&mut k, "Kreis");
        let b = k.teil_neu(2);
        let kb = k.komp_neu(kr);
        k.komp_haenge(kb, b);
        let radius = feld(&mut k, kr, "radius");
        k.setze_zahl(kb, radius, 4.0);
        k.teil_lage(b, 113.0, 55.0, 0.0);
        assert_eq!(k.teil_trifft(t, b), 1);
        k.teil_lage(b, 120.0, 55.0, 0.0);
        assert_eq!(k.teil_trifft(t, b), 0);
        // durchsichtig → nichts
        assert_eq!(k.setze_zahlen(c, pu, &[0.0, 0.0, 10.0, 0.0, 0.0, 10.0]), 0);
        k.bild(7);
        assert_eq!(dreiecke(&k).len(), 1);
        k.setze_text(c, fa, b"#00000000");
        k.bild(8);
        assert!(dreiecke(&k).is_empty());
    }

    #[test]
    fn vieleck_mit_blick_und_ebenen() {
        let mut k = welt();
        let v = typ(&mut k, "Vieleck");
        let pu = feld(&mut k, v, "punkte");
        let r = typ(&mut k, "Rechteck");
        // Rechteck in Ebene 1 über dem Vieleck in Ebene 0: Zeichenreihenfolge nach Ebene
        let tr = k.teil_neu(2);
        k.teil_lage(tr, 105.0, 55.0, 0.0);
        k.teil_setze(tr, tf::EBENE, 1.0);
        let rc = k.komp_neu(r);
        k.komp_haenge(rc, tr);
        let t = k.teil_neu(2);
        k.teil_lage(t, 100.0, 50.0, 0.0);
        let c = k.komp_neu(v);
        k.komp_haenge(c, t);
        k.setze_zahlen(c, pu, &[0.0, 0.0, 10.0, 0.0, 0.0, 10.0]);
        k.bild(1);
        let arten = instanzen_2d(&k).iter().map(|i| i.4).collect::<Vec<_>>();
        assert_eq!(arten, [flach_art::DREIECK, flach_art::RECHTECK]);
        // Blick: Mitte der Sicht bei (120, 50) → alles um 200 nach rechts, 130 nach unten (50 → 180) (Spielfeld 640 × 360)
        let bl = typ(&mut k, "Blick");
        let tb = k.teil_neu(2);
        k.teil_lage(tb, 120.0, 50.0, 0.0);
        let cb = k.komp_neu(bl);
        k.komp_haenge(cb, tb);
        k.bild(2);
        assert_eq!(dreiecke(&k)[0].0, [300.0, 180.0, 310.0, 180.0, 300.0, 190.0]);
        // außerhalb des Spielfelds → weggeschnitten
        k.teil_lage(t, -500.0, 50.0, 0.0);
        k.bild(3);
        assert!(dreiecke(&k).is_empty());
    }
}
/// H-K11a (HERD.md §12.4): `Gelaende` – Netz aus einer Höhenkarte im Kern.
mod hk11a {
    use super::*;

    struct N {
        g: i32,
        hoehen: i32,
        spalten: i32,
        zeilen: i32,
        weite: i32,
        farbe: i32,
        bild: i32,
    }
    fn nummern(k: &mut Kern) -> N {
        let g = typ(k, "Gelaende");
        N {
            g,
            hoehen: feld(k, g, "hoehen"),
            spalten: feld(k, g, "spalten"),
            zeilen: feld(k, g, "zeilen"),
            weite: feld(k, g, "weite"),
            farbe: feld(k, g, "farbe"),
            bild: feld(k, g, "bild"),
        }
    }
    fn ressourcen(k: &mut Kern) -> f64 {
        k.welt_hole(6)
    }
    fn gelaende(k: &mut Kern, n: &N) -> (i32, i32) {
        let t = k.teil_neu(3);
        let c = k.komp_neu(n.g);
        assert_eq!(k.komp_haenge(c, t), 0);
        (t, c)
    }

    #[test]
    fn schema_raum_grenzen() {
        let mut k = welt();
        let n = nummern(&mut k);
        assert_eq!(n.g, 22); // Typnummer in Merge-Reihenfolge (HERD.md §12.1, §11.1): nach Vieleck 21
        let t2 = k.teil_neu(2);
        let c = k.komp_neu(n.g);
        assert!(k.komp_haenge(c, t2) < 0);
        assert_eq!(k.fehler_text(), "Gelaende gibt es nur für 3D-Teile.");
        assert_eq!(k.hole_zahl(c, n.spalten), 32.0);
        assert_eq!(k.hole_zahl(c, n.weite), 1.0);
        assert_eq!(text(&mut k, c, n.farbe), "basilikum");
        assert!(k.setze_zahl(c, n.spalten, 1.0) < 0);
        assert!(k.setze_zahl(c, n.zeilen, 257.0) < 0);
        assert!(k.setze_zahl(c, n.spalten, 2.5) < 0);
        assert!(k.setze_zahl(c, n.weite, 0.0) < 0);
        assert_eq!(k.setze_zahl(c, n.zeilen, 256.0), 0);
        assert_eq!(ARTEN[n.g as usize - 1].schema.oeffentliche(), 8);
    }

    #[test]
    fn netz_nur_bei_aenderung() {
        let mut k = welt();
        let n = nummern(&mut k);
        let (t, c) = gelaende(&mut k, &n);
        k.setze_zahl(c, n.spalten, 3.0);
        k.setze_zahl(c, n.zeilen, 3.0);
        assert_eq!(k.setze_zahlen(c, n.hoehen, &[0.0, 1.0, 0.0, 1.0, 2.0, 1.0]), 0);
        // vor dem ersten Takt kein Netz, keine Hülle
        let w = k.form_grund(1, 0.0, 0.0);
        let r0 = ressourcen(&mut k);
        let kt = k.teil_neu(3);
        let ko = typ(&mut k, "Koerper");
        let kc = k.komp_neu(ko);
        k.setze_zahl(kc, 1, w as f64);
        k.komp_haenge(kc, kt);
        k.teil_lage(kt, 0.0, 1.5, 0.0);
        assert_eq!(k.teil_trifft(t, kt), 0);
        k.takt();
        assert_eq!(ressourcen(&mut k), r0 + 1.0);
        assert_eq!(k.teil_trifft(t, kt), 1); // Hülle reicht bis y = 2
        k.teil_lage(kt, 0.0, 2.6, 0.0);
        assert_eq!(k.teil_trifft(t, kt), 0);
        k.takt();
        assert_eq!(ressourcen(&mut k), r0 + 1.0);
        // gleiche Werte erneut: kein Neubau
        k.setze_zahlen(c, n.hoehen, &[0.0, 1.0, 0.0, 1.0, 2.0, 1.0]);
        k.takt();
        assert_eq!(ressourcen(&mut k), r0 + 1.0);
        // eine Höhe, die Seiten, die Weite: je ein Neubau
        k.setze_zahlen(c, n.hoehen, &[0.0, 1.0, 0.0, 1.0, 2.5, 1.0]);
        k.takt();
        assert_eq!(ressourcen(&mut k), r0 + 2.0);
        k.setze_zahl(c, n.spalten, 4.0);
        k.takt();
        k.setze_zahl(c, n.weite, 2.0);
        k.takt();
        assert_eq!(ressourcen(&mut k), r0 + 4.0);
        // NaN mit anderer Nutzlast ist keine Änderung (kanonisch), -0 statt 0 schon (Bits)
        k.setze_zahlen(c, n.hoehen, &[f64::NAN]);
        k.takt();
        let r = ressourcen(&mut k);
        k.setze_zahlen(c, n.hoehen, &[f64::from_bits(0x7FF8_0000_0000_0001)]);
        k.takt();
        assert_eq!(ressourcen(&mut k), r);
        k.setze_zahlen(c, n.hoehen, &[0.0]);
        k.takt();
        k.setze_zahlen(c, n.hoehen, &[-0.0]);
        k.takt();
        assert_eq!(ressourcen(&mut k), r + 2.0);
        let r = r + 2.0;
        // Kopie teilt das Netz; ein loses Gelände baut nichts
        let t2 = k.teil_kopie(t);
        assert!(t2 > 0);
        k.takt();
        assert_eq!(ressourcen(&mut k), r);
        k.komp_neu(n.g);
        k.takt();
        assert_eq!(ressourcen(&mut k), r);
    }

    #[test]
    fn bild_wie_koerper_mit_textur() {
        let mut k = welt();
        let n = nummern(&mut k);
        let (_, c) = gelaende(&mut k, &n);
        let tex = k.bildchen_neu(&[4, 0, 0, 0, b'e', b'k', b'e', b'k'], &[]);
        assert!(tex > 0, "{}", k.fehler_text());
        k.setze_zahl(c, n.bild, tex as f64);
        k.setze_text(c, n.farbe, b"#ffffff");
        k.takt();
        k.bild(1);
        let m = material_3d(&k);
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].0, 0xFFFF_FFFF);
        assert!((m[0].1 - 0.1).abs() < 1e-6);
        assert_eq!(m[0].2, 0.0);
        // NETZ-Abschnitt: 32 × 32 Punkte, 31 × 31 × 6 Indizes
        let l = Leser::neu(k.paket()).unwrap();
        let netz = l.abschnitte().filter(|(a, _)| *a == abschnitt::NETZ).any(|(_, d)| {
            let u = |o: usize| u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]]);
            d.len() > 12 && u(4) == 1024 && u(8) == 31 * 31 * 6
        });
        assert!(netz);
        // durchsichtige Farbe: nichts
        k.setze_text(c, n.farbe, b"#ffffff00");
        k.bild(2);
        assert!(material_3d(&k).is_empty());
    }

    #[test]
    fn bitgleich_256() {
        let bau = || {
            let mut k = welt();
            let n = nummern(&mut k);
            let (_, c) = gelaende(&mut k, &n);
            k.setze_zahl(c, n.spalten, 256.0);
            k.setze_zahl(c, n.zeilen, 256.0);
            k.setze_zahl(c, n.weite, 0.25);
            let h: Vec<f64> = (0..65536).map(|i| libm::sin((i % 256) as f64 * 0.05) * libm::cos((i / 256) as f64 * 0.07) * 3.0).collect();
            k.setze_zahlen(c, n.hoehen, &h);
            k.takt();
            k.hash_szene()
        };
        assert_eq!(bau(), bau());
    }
}

/// H-K8: `Vorlage` – ruhende Muster, wache Kopien.
mod hk8 {
    use super::*;
    use crate::abi::szenen_hash;
    use crate::komponenten::Art;
    use crate::welt::Welt;

    /// 2D-Teil bei (x, y) mit Kreis (Radius 10) und Bewegung tempoX = 60
    fn laeufer(k: &mut Kern, x: f64, y: f64) -> i32 {
        let (kr, bw) = (typ(k, "Kreis"), typ(k, "Bewegung"));
        let t = k.teil_neu(2);
        k.teil_lage(t, x, y, 0.0);
        let c = k.komp_neu(kr);
        let fr = feld(k, kr, "radius");
        k.setze_zahl(c, fr, 10.0);
        assert_eq!(k.komp_haenge(c, t), 0);
        let b = k.komp_neu(bw);
        let ft = feld(k, bw, "tempoX");
        k.setze_zahl(b, ft, 60.0);
        assert_eq!(k.komp_haenge(b, t), 0);
        t
    }
    fn vorlage(k: &mut Kern, t: i32) -> i32 {
        let v = typ(k, "Vorlage");
        let c = k.komp_neu(v);
        assert_eq!(k.komp_haenge(c, t), 0);
        c
    }
    fn x(k: &mut Kern, t: i32) -> f64 {
        k.teil_hole(t, tf::X)
    }

    #[test]
    fn schema_ohne_system() {
        let mut k = welt();
        let v = typ(&mut k, "Vorlage");
        let a = &ARTEN[v as usize - 1];
        assert_eq!(a.schema.name, "Vorlage");
        assert!(a.takt.is_none() && a.nachlauf.is_none() && a.bild.is_none() && a.huelle.is_none());
        assert!(a.ruhe.is_some() && a.kopie_ohne);
        let c = k.komp_neu(v);
        let fname = feld(&mut k, v, "name");
        assert_eq!(text(&mut k, c, fname), "");
        // nur Vorlage fehlt in Kopien; ruhen lassen dürfen nur Vorlage und (ab H-K9) Kulisse
        for b in ARTEN.iter().filter(|b| b.schema.name != "Vorlage") {
            assert!(!b.kopie_ohne, "{}", b.schema.name);
            assert!(b.ruhe.is_none() || b.schema.name == "Kulisse", "{}", b.schema.name);
        }
        // beide Räume
        let d = k.teil_neu(3);
        assert_eq!(k.komp_haenge(c, d), 0);
    }

    #[test]
    fn vorlage_ruht_samt_kindern_kopie_wach_ohne_weckt() {
        let mut k = welt();
        let a = laeufer(&mut k, 100.0, 100.0);
        let kind = laeufer(&mut k, 0.0, 30.0);
        assert_eq!(k.teil_haenge(kind, a), 0);
        let wand = laeufer(&mut k, 105.0, 100.0);
        let nah = laeufer(&mut k, 100.0, 130.0);
        assert_eq!(k.teil_trifft(a, wand), 1);
        assert_eq!(k.teil_trifft(kind, nah), 1);
        let va = vorlage(&mut k, a);
        assert_eq!(k.teil_trifft(a, wand), 0, "ruht → trifft nein");
        assert_eq!(k.teil_trifft(kind, nah), 0, "Kind ruht mit");
        k.takt();
        assert_eq!(x(&mut k, a), 100.0);
        assert_eq!(x(&mut k, kind), 0.0);
        assert_eq!(x(&mut k, wand), 106.0);
        // nicht gezeichnet: nur wand und nah im Bild; die Sichtbarkeit selbst bleibt ja
        k.bild(1);
        assert_eq!(instanzen_2d(&k).len(), 2);
        assert_eq!(k.teil_hole(a, tf::SICHTBAR), 1.0);
        // Kopie: wach, ohne Vorlage, mit Kind
        let v = typ(&mut k, "Vorlage");
        let b = k.teil_kopie(a);
        assert_eq!(k.komp_von(b, v), 0);
        let mut kinder = [0u32; 2];
        assert_eq!(k.teil_kinder(b, &mut kinder), 1);
        let bk = kinder[0] as i32;
        k.takt();
        assert_eq!(x(&mut k, a), 100.0);
        assert_eq!(x(&mut k, b), 101.0);
        assert_eq!(x(&mut k, bk), 1.0);
        k.bild(2);
        assert_eq!(instanzen_2d(&k).len(), 4);
        // ein Teil unter die Vorlage hängen → ruht; wieder lösen → wach
        assert_eq!(k.teil_haenge(nah, a), 0);
        let nx = x(&mut k, nah);
        k.takt();
        assert_eq!(x(&mut k, nah), nx);
        assert_eq!(k.teil_haenge(nah, 0), 0);
        k.takt();
        assert_eq!(x(&mut k, nah), nx + 1.0);
        // Kopie des Kindes einer Vorlage hängt an der Vorlage → ruht auch
        let kk = k.teil_kopie(kind);
        k.takt();
        assert_eq!(x(&mut k, kk), 0.0);
        // ohne("Vorlage") weckt das Original samt Kindern; wieder mit → ruht
        assert_eq!(k.komp_loese(va), 0);
        k.takt();
        assert_eq!(x(&mut k, a), 101.0);
        assert_eq!(x(&mut k, kind), 1.0);
        assert_eq!(x(&mut k, kk), 1.0);
        assert_eq!(k.komp_haenge(va, a), 0);
        k.takt();
        assert_eq!(x(&mut k, a), 101.0);
    }

    #[test]
    fn verschachtelte_vorlage_bleibt_in_der_kopie() {
        let mut k = welt();
        let v = typ(&mut k, "Vorlage");
        let a = laeufer(&mut k, 0.0, 0.0);
        let innen = laeufer(&mut k, 0.0, 0.0);
        assert_eq!(k.teil_haenge(innen, a), 0);
        vorlage(&mut k, a);
        vorlage(&mut k, innen);
        let b = k.teil_kopie(a);
        let mut kinder = [0u32; 1];
        k.teil_kinder(b, &mut kinder);
        let bi = kinder[0] as i32;
        assert_eq!(k.komp_von(b, v), 0);
        assert!(k.komp_von(bi, v) > 0);
        k.takt();
        assert_eq!(x(&mut k, b), 1.0);
        assert_eq!(x(&mut k, bi), 0.0);
    }

    #[test]
    fn systeme_ueberspringen_ruhende() {
        let mut k = welt();
        let pt = typ(&mut k, "Partikel");
        let gl = typ(&mut k, "Gleiten");
        let ab = typ(&mut k, "Ablauf");
        let an = typ(&mut k, "Animation");
        let bi = typ(&mut k, "Bild");
        let fu = typ(&mut k, "Fuehler");
        let wu = typ(&mut k, "Wucht");
        let kr = typ(&mut k, "Kreis");
        let a = k.teil_neu(2);
        k.teil_lage(a, 200.0, 100.0, 0.0);
        vorlage(&mut k, a);
        // Partikel: kein Ausstoß; die Kopie stößt aus
        let p = k.komp_neu(pt);
        let f_rate = feld(&mut k, pt, "rate");
        k.setze_zahl(p, f_rate, 600.0);
        assert_eq!(k.komp_haenge(p, a), 0);
        // Gleiten nach x = 300
        let g = k.komp_neu(gl);
        let f_nach = feld(&mut k, gl, "nach");
        k.setze_zahl(g, f_nach, 300.0);
        assert_eq!(k.komp_haenge(g, a), 0);
        // Bild + Animation mit zwei Bildchen
        let zeilen: Vec<u8> = [b"ws".as_slice(), b"sw"].iter().flat_map(|z| [&(z.len() as u32).to_le_bytes()[..], z].concat()).collect();
        let bc1 = k.bildchen_neu(&zeilen, &[]);
        let bc2 = k.bildchen_neu(&zeilen, &[]);
        assert!(bc1 > 0 && bc2 > 0, "{}", k.fehler_text());
        let b = k.komp_neu(bi);
        assert_eq!(k.komp_haenge(b, a), 0);
        let m = k.komp_neu(an);
        let f_bilder = feld(&mut k, an, "bilder");
        assert!(k.setze_liste(m, f_bilder, &[bc1 as u32, bc2 as u32]) >= 0, "{}", k.fehler_text());
        let f_ps = feld(&mut k, an, "proSekunde");
        k.setze_zahl(m, f_ps, 60.0);
        assert_eq!(k.komp_haenge(m, a), 0);
        let nummer = feld(&mut k, an, "nummer");
        // Ablauf an einem Kind: Schlüssel x
        let abl = k.komp_neu(ab);
        let (f_zeiten, f_x, ab_zeit) = (feld(&mut k, ab, "zeiten"), feld(&mut k, ab, "xWerte"), feld(&mut k, ab, "zeit"));
        assert!(k.setze_zahlen(abl, f_zeiten, &[0.0, 1.0]) >= 0, "{}", k.fehler_text());
        assert!(k.setze_zahlen(abl, f_x, &[10.0, 70.0]) >= 0, "{}", k.fehler_text());
        let hinten = k.teil_neu(2);
        assert_eq!(k.komp_haenge(abl, hinten), 0);
        assert_eq!(k.teil_haenge(hinten, a), 0);
        // Kreis + Fühler + Wucht (dynamisch, Schwerkraft) am ruhenden Teil; ein waches Fühler-Teil daneben
        let c = k.komp_neu(kr);
        let f_radius = feld(&mut k, kr, "radius");
        k.setze_zahl(c, f_radius, 10.0);
        assert_eq!(k.komp_haenge(c, a), 0);
        let f = k.komp_neu(fu);
        let f_aus = feld(&mut k, fu, "ausloeser");
        k.setze_zahl(f, f_aus, 0.0);
        assert_eq!(k.komp_haenge(f, a), 0);
        let wc = k.komp_neu(wu);
        let (f_g, f_ty) = (feld(&mut k, wu, "schwerkraft"), feld(&mut k, wu, "tempoY"));
        k.setze_zahl(wc, f_g, 1200.0);
        assert_eq!(k.komp_haenge(wc, a), 0);
        let wach_t = k.teil_neu(2);
        k.teil_lage(wach_t, 205.0, 100.0, 0.0);
        let c2 = k.komp_neu(kr);
        assert_eq!(k.komp_haenge(c2, wach_t), 0);
        let f2 = k.komp_neu(fu);
        assert_eq!(k.komp_haenge(f2, wach_t), 0);
        let beruehrt = feld(&mut k, fu, "beruehrt");
        for _ in 0..10 {
            k.takt();
        }
        assert_eq!(k.teil_hole(a, tf::X), 200.0);
        assert_eq!(k.teil_hole(a, tf::Y), 100.0);
        assert_eq!(k.teil_hole(hinten, tf::X), 0.0);
        assert_eq!(k.hole_zahl(m, nummer), 1.0);
        assert_eq!(k.hole_zahl(abl, ab_zeit), 0.0);
        assert_eq!(k.hole_zahl(wc, f_ty), 0.0);
        assert_eq!(k.hole_zahl(f2, beruehrt), 0.0);
        k.bild(1);
        assert_eq!(instanzen_2d(&k).len(), 1, "nur der wache Kreis");
        // Kopie: alles läuft
        let kopie = k.teil_kopie(a);
        k.takt();
        let kf = k.komp_von(wach_t, fu);
        assert_eq!(k.hole_zahl(kf, beruehrt), 1.0, "der wache Fühler spürt die Kopie");
        for _ in 0..10 {
            k.takt();
        }
        assert_ne!(k.teil_hole(kopie, tf::X), 200.0);
        let km = k.komp_von(kopie, an);
        assert_ne!(k.hole_zahl(km, nummer), 1.0);
        let kw = k.komp_von(kopie, wu);
        assert!(k.hole_zahl(kw, f_ty) > 0.0);
        let mut kinder = [0u32; 2];
        k.teil_kinder(kopie, &mut kinder);
        assert!(k.teil_hole(kinder[0] as i32, tf::X) > 10.0);
        k.bild(2);
        assert!(instanzen_2d(&k).len() > 3, "Kopie zeichnet Kreis, Bild und Teilchen");
        // das Original ruht weiter
        assert_eq!(k.teil_hole(a, tf::X), 200.0);
        assert_eq!(k.hole_zahl(m, nummer), 1.0);
    }

    #[test]
    fn blick_in_vorlage_zaehlt_nicht() {
        let mut k = welt();
        let bl = typ(&mut k, "Blick");
        laeufer(&mut k, 100.0, 100.0);
        k.bild(1);
        k.bild(2);
        let ohne: Vec<u8> = k.paket().to_vec();
        let t = k.teil_neu(2);
        k.teil_lage(t, 500.0, 300.0, 0.0);
        let b = k.komp_neu(bl);
        let f_zoom = feld(&mut k, bl, "zoom");
        k.setze_zahl(b, f_zoom, 3.0);
        assert_eq!(k.komp_haenge(b, t), 0);
        let v = vorlage(&mut k, t);
        k.bild(2);
        assert_eq!(k.paket(), &ohne[..], "ruhender Blick: Bild wie ohne Blick");
        assert_eq!(k.komp_loese(v), 0);
        k.bild(2);
        assert_ne!(k.paket(), &ohne[..], "geweckter Blick gilt");
    }

    /// Szenen-Hash einer Welt ohne Vorlage ist gleich, ob die Registry Vorlage kennt oder nicht.
    #[test]
    fn hash_ohne_vorlage_unveraendert() {
        fn baue(arten: &'static [&'static Art]) -> u64 {
            let mut w = Welt::neu(640, 360, String::from("H"), arten);
            let (kr, bw, pt) = (w.art_index("Kreis").unwrap(), w.art_index("Bewegung").unwrap(), w.art_index("Partikel").unwrap());
            let a = w.teil_neu(false);
            let b = w.teil_neu(false);
            w.haenge(b, a).unwrap();
            for (art, t) in [(kr, a), (bw, a), (pt, b), (kr, b)] {
                let h = w.komp_neu(art);
                w.komp_haenge(h, t).unwrap();
            }
            let z = w.komp_zeile(w.zeile_opt(a).unwrap(), bw).unwrap();
            w.speicher[bw].zahl_mut(crate::komponenten::bewegung::TEMPO_X)[z] = 30.0;
            let c = w.kopie(a).unwrap();
            w.lage_setzen(c, 5.0, 6.0, 0.0);
            for _ in 0..20 {
                w.takt();
            }
            szenen_hash(&mut w)
        }
        let ohne: &'static [&'static Art] = Box::leak(ARTEN.iter().copied().filter(|a| a.schema.name != "Vorlage").collect::<Vec<_>>().into_boxed_slice());
        assert_eq!(ohne.len() + 1, ARTEN.len());
        assert_eq!(baue(ARTEN), baue(ohne));
    }
}


mod hk10 {
    use super::*;
    use crate::komponenten::{fliesen, wucht, Huelle};
    use crate::paket::flach_art;

    struct N {
        fl: i32,
        bilder: i32,
        spalten: i32,
        zeilen: i32,
        karte: i32,
        kachel: i32,
        fest: i32,
    }
    fn nummern(k: &mut Kern) -> N {
        let fl = typ(k, "Fliesen");
        N {
            fl,
            bilder: feld(k, fl, "bilder"),
            spalten: feld(k, fl, "spalten"),
            zeilen: feld(k, fl, "zeilen"),
            karte: feld(k, fl, "karte"),
            kachel: feld(k, fl, "kachel"),
            fest: feld(k, fl, "fest"),
        }
    }
    /// Bildchen b × h (einfarbig) → ID
    fn bildchen(k: &mut Kern, b: usize, h: usize, zeichen: u8) -> u32 {
        let zeile: Vec<u8> = vec![zeichen; b];
        let z: Vec<u8> = (0..h).flat_map(|_| [&(b as u32).to_le_bytes()[..], &zeile].concat()).collect();
        let id = k.bildchen_neu(&z, &[]);
        assert!(id > 0);
        id as u32
    }
    /// Fliesen-Teil bei (x, y) → (Teil, Komponente)
    #[allow(clippy::too_many_arguments)]
    fn karte(k: &mut Kern, n: &N, x: f64, y: f64, spalten: f64, zeilen: f64, kachel: f64, bilder: &[u32], karte: &[f64], fest: &[f64]) -> (i32, i32) {
        let t = k.teil_neu(2);
        k.teil_lage(t, x, y, 0.0);
        let c = k.komp_neu(n.fl);
        assert_eq!(k.setze_zahl(c, n.spalten, spalten), 0, "{}", k.fehler_text());
        assert_eq!(k.setze_zahl(c, n.zeilen, zeilen), 0);
        assert_eq!(k.setze_zahl(c, n.kachel, kachel), 0);
        assert_eq!(k.setze_liste(c, n.bilder, bilder), 0, "{}", k.fehler_text());
        assert_eq!(k.setze_zahlen(c, n.karte, karte), 0, "{}", k.fehler_text());
        assert_eq!(k.setze_zahlen(c, n.fest, fest), 0);
        assert_eq!(k.komp_haenge(c, t), 0, "{}", k.fehler_text());
        (t, c)
    }
    /// (Mitte, halbe Ausdehnung, Art, Atlas) der 2D-Instanzen
    #[allow(clippy::type_complexity)]
    fn inst(k: &Kern) -> Vec<([f32; 2], [f32; 2], u32, [u16; 4])> {
        instanzen_2d(k).into_iter().map(|i| (i.1, i.2, i.4, i.5)).collect()
    }

    #[test]
    fn schema_typnummer_bereiche() {
        let mut k = welt();
        let n = nummern(&mut k);
        assert_eq!(n.fl, 24, "Typnummer in Merge-Reihenfolge nach Vorlage (23)");
        let art = ARTEN.iter().find(|a| a.schema.name == "Fliesen").unwrap();
        assert!(art.takt.is_none() && art.nachlauf.is_none() && art.bild.is_some() && art.huelle.is_some());
        let c = k.komp_neu(n.fl);
        assert_eq!(k.hole_zahl(c, n.spalten), 16.0);
        assert_eq!(k.hole_zahl(c, n.zeilen), 9.0);
        assert_eq!(k.hole_zahl(c, n.kachel), 32.0);
        assert_eq!(k.setze_zahl(c, n.spalten, 0.0), -2);
        assert_eq!(k.fehler_text(), "Fliesen.spalten muss zwischen 1 und 1024 liegen, nicht 0.");
        assert_eq!(k.setze_zahl(c, n.zeilen, 1025.0), -2);
        assert!(k.setze_zahl(c, n.zeilen, 2.5) < 0);
        assert_eq!(k.setze_zahl(c, n.kachel, -1.0), -2);
        assert_eq!(k.fehler_text(), "Fliesen.kachel muss mindestens 0 sein, nicht -1.");
        let t3 = k.teil_neu(3);
        assert_eq!(k.komp_haenge(c, t3), -2);
        assert_eq!(k.fehler_text(), "Fliesen gibt es nur für 2D-Teile.");
        // Hülle für trifft: das ganze Raster ab der oberen linken Ecke
        let rt = typ(&mut k, "Rechteck");
        let t = k.teil_neu(2);
        k.teil_lage(t, 100.0, 50.0, 0.0);
        let f = k.komp_neu(n.fl);
        k.setze_zahl(f, n.spalten, 4.0);
        k.setze_zahl(f, n.zeilen, 2.0);
        k.setze_zahl(f, n.kachel, 10.0);
        k.komp_haenge(f, t);
        let probe = |k: &mut Kern, x: f64, y: f64| {
            let p = k.teil_neu(2);
            k.teil_lage(p, x, y, 0.0);
            let r = k.komp_neu(rt);
            let (fb, fh) = (feld(k, rt, "breite"), feld(k, rt, "hoehe"));
            k.setze_zahl(r, fb, 2.0);
            k.setze_zahl(r, fh, 2.0);
            k.komp_haenge(r, p);
            let ja = k.teil_trifft(t, p);
            k.teil_entferne(p);
            ja
        };
        assert_eq!(probe(&mut k, 102.0, 52.0), 1);
        assert_eq!(probe(&mut k, 138.0, 68.0), 1);
        assert_eq!(probe(&mut k, 97.0, 52.0), 0, "links der Ecke");
        assert_eq!(probe(&mut k, 143.0, 60.0), 0, "rechts vom Raster");
    }

    #[test]
    fn lage_ist_obere_linke_ecke_und_nummern() {
        let mut k = welt();
        let n = nummern(&mut k);
        let (a, b) = (bildchen(&mut k, 4, 4, b't'), bildchen(&mut k, 8, 2, b'b'));
        // 3 × 3: Zeile 0 = 1 0 2, Zeile 1 = 2 1.7 9 (9 hat kein Bildchen), Zeile 2 = −1 und Rest fehlt (zu kurz → leer)
        let (_, c) = karte(&mut k, &n, 100.0, 50.0, 3.0, 3.0, 10.0, &[a, b], &[1.0, 0.0, 2.0, 2.0, 1.7, 9.0, -1.0], &[]);
        k.bild(1);
        let i = inst(&k);
        assert_eq!(i.len(), 4, "{:?}", i);
        assert_eq!(i.iter().map(|x| x.0).collect::<Vec<_>>(), [[105.0, 55.0], [125.0, 55.0], [105.0, 65.0], [115.0, 65.0]]);
        assert!(i.iter().all(|x| x.1 == [5.0, 5.0] && x.2 == flach_art::BILD));
        assert_eq!(i[0].3, i[3].3, "Kachel 1 = bilder[1]");
        assert_eq!(i[1].3, i[2].3);
        assert_ne!(i[0].3, i[1].3);
        assert_eq!(i[1].3[2] - i[1].3[0], 8, "Bildchen 8 × 2 auf die Kachel gestreckt");
        // kachel 0 → nichts; ohne Bilder → nichts
        k.setze_zahl(c, n.kachel, 0.0);
        k.bild(2);
        assert!(inst(&k).is_empty());
        k.setze_zahl(c, n.kachel, 10.0);
        k.setze_liste(c, n.bilder, &[]);
        k.bild(3);
        assert!(inst(&k).is_empty());
        // gedreht und skaliert: die Ecke bleibt an der Lage
        k.setze_liste(c, n.bilder, &[a, b]);
        let t = k.teil_neu(2);
        k.teil_lage(t, 300.0, 200.0, 0.0);
        k.teil_setze(t, tf::DREHUNG, 90.0);
        k.teil_setze(t, tf::GROESSE_X, 2.0);
        k.teil_setze(t, tf::GROESSE_Y, 2.0);
        let c2 = k.komp_neu(n.fl);
        k.setze_zahl(c2, n.kachel, 10.0);
        k.setze_liste(c2, n.bilder, &[a]);
        k.setze_zahlen(c2, n.karte, &[1.0]);
        k.komp_haenge(c2, t);
        k.bild(4);
        let i = inst(&k);
        let m = i.last().unwrap();
        assert!((m.0[0] - 290.0).abs() < 1e-3 && (m.0[1] - 210.0).abs() < 1e-3, "{:?}", m.0);
    }

    #[test]
    fn culling_grosse_karte_mit_blick() {
        let mut k = welt();
        let n = nummern(&mut k);
        let a = bildchen(&mut k, 2, 2, b'g');
        let voll = vec![1.0; 256 * 256];
        let (_, c) = karte(&mut k, &n, 0.0, 0.0, 256.0, 256.0, 32.0, &[a], &voll, &[1.0]);
        // ohne Blick: nur das Spielfeld 640 × 360 → Spalten 0 … 20 (Spalte 20 berührt den Rand), Zeilen 0 … 11 (360 / 32 = 11,25)
        k.bild(1);
        assert_eq!(inst(&k).len(), 21 * 12);
        // Blick bei (1007, 805): Sicht 687 … 1327 × 625 … 985 → Spalten 21 … 41, Zeilen 19 … 30
        let bt = typ(&mut k, "Blick");
        let t = k.teil_neu(2);
        k.teil_lage(t, 1007.0, 805.0, 0.0);
        let bc = k.komp_neu(bt);
        k.komp_haenge(bc, t);
        k.bild(2);
        assert_eq!(inst(&k).len(), 21 * 12);
        // wandern: nie mehr als die sichtbaren (≤ 21 × 13), am Kartenrand weniger
        for s in 0..40 {
            k.teil_lage(t, 50.0 + s as f64 * 211.3, 30.0 + s as f64 * 197.7, 0.0);
            k.bild(3 + s);
            let i = inst(&k).len();
            assert!(i <= 21 * 13, "Schritt {}: {}", s, i);
        }
        // gedreht + Zoom 0.5: Sicht ≈ 1280 × 720 gedreht
        k.teil_lage(t, 4000.0, 4000.0, 0.0);
        k.teil_setze(t, tf::DREHUNG, 30.0);
        let fz = feld(&mut k, bt, "zoom");
        k.setze_zahl(bc, fz, 0.5);
        k.bild(50);
        let i = instanzen_2d(&k);
        assert!(i.len() > 500 && i.len() < 2000, "{}", i.len());
        // HUD-Ebene: Fliesen mit ebene ≥ festAb bleiben im Spielfeld wie ohne Blick
        let (h, _) = karte(&mut k, &n, 0.0, 0.0, 30.0, 30.0, 32.0, &[a], &voll[..900], &[]);
        k.teil_setze(h, tf::EBENE, 1000.0);
        k.setze_zahl(c, n.kachel, 0.0);
        k.bild(51);
        let i = inst(&k);
        assert_eq!(i.len(), 21 * 12);
        assert_eq!(i[0].0, [16.0, 16.0]);
    }

    #[test]
    fn kachel_kontakt_offene_seiten() {
        let (lo, hi) = ([0.0, 0.0], [10.0, 10.0]);
        let alle = [true; 4];
        // Kiste liegt 0,5 tief auf: oben
        let kiste = Huelle::Rechteck([2.0, -5.0], [8.0, 0.5]);
        assert_eq!(wucht::kachel_kontakt(lo, hi, alle, &kiste), Some(([0.0, -1.0], 0.5)));
        // Kiste ragt 0,1 von links in die Kachel, 0,5 tief: an einer Fuge (links geschlossen) → oben statt links
        let fuge = Huelle::Rechteck([-6.0, -5.0], [0.1, 0.5]);
        assert_eq!(wucht::kachel_kontakt(lo, hi, alle, &fuge), Some(([-1.0, 0.0], 0.1)));
        assert_eq!(wucht::kachel_kontakt(lo, hi, [true, true, false, true], &fuge), Some(([0.0, -1.0], 0.5)));
        assert_eq!(wucht::kachel_kontakt(lo, hi, [false; 4], &fuge), None, "ganz innen");
        assert_eq!(wucht::kachel_kontakt(lo, hi, alle, &Huelle::Rechteck([11.0, 0.0], [12.0, 1.0])), None);
        // Kreis über der Ecke (0, 0): offen → schräg; links geschlossen → gerade nach oben; oben geschlossen → nach links
        let k = Huelle::Kreis([-0.6, -0.8], 2.0);
        let (n, t) = wucht::kachel_kontakt(lo, hi, alle, &k).unwrap();
        assert!((n[0] + 0.6).abs() < 1e-12 && (n[1] + 0.8).abs() < 1e-12 && (t - 1.0).abs() < 1e-12);
        let (n, t) = wucht::kachel_kontakt(lo, hi, [true, true, false, true], &k).unwrap();
        assert!(n == [0.0, -1.0] && (t - 1.2).abs() < 1e-12);
        let (n, t) = wucht::kachel_kontakt(lo, hi, [false, true, true, true], &k).unwrap();
        assert!(n == [-1.0, 0.0] && (t - 1.4).abs() < 1e-12);
        // Mitte in der Kachel: zur nächsten offenen Seite
        let innen = Huelle::Kreis([3.0, 2.0], 1.0);
        assert_eq!(wucht::kachel_kontakt(lo, hi, alle, &innen), Some(([0.0, -1.0], 3.0)));
        assert_eq!(wucht::kachel_kontakt(lo, hi, [false, true, true, true], &innen), Some(([-1.0, 0.0], 4.0)));
        // Helfer der Karte
        let karte = [1.0, 1.0, 0.0, 2.0];
        let feste = fliesen::feste(&[1.0, 1.9, -3.0]);
        assert_eq!(feste, [1]);
        assert!(fliesen::ist_fest(&karte, &feste, 2, 2, 1, 0));
        assert!(!fliesen::ist_fest(&karte, &feste, 2, 2, 1, 1), "Kachel 2 ist nicht fest");
        assert!(!fliesen::ist_fest(&karte, &feste, 2, 2, 2, 0), "außerhalb");
        let mut m = [0.0; 12];
        m[0] = 1.0;
        m[3] = 1.0;
        assert_eq!(fliesen::offene_seiten(&m, &karte, &feste, 2, 2, 0, 0), [true, true, true, false]);
        m[0] = -1.0;
        assert_eq!(fliesen::offene_seiten(&m, &karte, &feste, 2, 2, 0, 0), [true, true, false, true], "gespiegelt");
        m[1] = 0.5;
        assert_eq!(fliesen::offene_seiten(&m, &karte, &feste, 2, 2, 0, 0), [true; 4], "gedreht: alle offen");
    }

    /// Typ-/Feldnummern: (Fuehler, ausloeser, Wucht, schwerkraft, tempoX, tempoY, amBoden, maske)
    fn physik(k: &mut Kern) -> (i32, i32, i32, i32, i32, i32, i32, i32) {
        let (f, w) = (typ(k, "Fuehler"), typ(k, "Wucht"));
        (f, feld(k, f, "ausloeser"), w, feld(k, w, "schwerkraft"), feld(k, w, "tempoX"), feld(k, w, "tempoY"), feld(k, w, "amBoden"), feld(k, f, "maske"))
    }
    /// Kiste b × h (bzw. Kreis mit Durchmesser b) mit festem Fühler und dynamischer Wucht → (Teil, Wucht)
    fn koerper(k: &mut Kern, x: f64, y: f64, b: f64, h: f64, kreis: bool) -> (i32, i32) {
        let (f, aus, w, g, ..) = physik(k);
        let t = k.teil_neu(2);
        k.teil_lage(t, x, y, 0.0);
        if kreis {
            let kr = typ(k, "Kreis");
            let r = k.komp_neu(kr);
            let fr = feld(k, kr, "radius");
            k.setze_zahl(r, fr, b * 0.5);
            k.komp_haenge(r, t);
        } else {
            let rt = typ(k, "Rechteck");
            let r = k.komp_neu(rt);
            let (fb, fh) = (feld(k, rt, "breite"), feld(k, rt, "hoehe"));
            k.setze_zahl(r, fb, b);
            k.setze_zahl(r, fh, h);
            k.komp_haenge(r, t);
        }
        let fc = k.komp_neu(f);
        k.setze_zahl(fc, aus, 0.0);
        k.komp_haenge(fc, t);
        let wc = k.komp_neu(w);
        k.setze_zahl(wc, g, 1200.0);
        assert_eq!(k.komp_haenge(wc, t), 0);
        (t, wc)
    }
    /// Boden aus 20 Kacheln (Zeile 9 von 10, kachel 32, ab x = 0; Oberkante y = 288), eine Wand (Spalte 15, Zeilen 3 … 8) und
    /// eine Deko-Kachel (2, nicht fest)
    fn boden(k: &mut Kern, n: &N) -> (i32, i32) {
        let a = bildchen(k, 2, 2, b'k');
        let mut kt = vec![0.0; 20 * 10];
        for c in 0..20 {
            kt[9 * 20 + c] = 1.0;
        }
        for r in 3..9 {
            kt[r * 20 + 15] = 1.0;
        }
        kt[8 * 20 + 3] = 2.0;
        karte(k, n, 0.0, 0.0, 20.0, 10.0, 32.0, &[a, a], &kt, &[1.0])
    }

    #[test]
    fn kiste_gleitet_ueber_die_fugen() {
        let mut k = welt();
        let n = nummern(&mut k);
        boden(&mut k, &n);
        let (_, _, _, _, tx, ty, am, _) = physik(&mut k);
        let (t, w) = koerper(&mut k, 40.0, 278.0, 20.0, 20.0, false);
        let (tk, wk) = koerper(&mut k, 560.0, 270.0, 20.0, 20.0, true);
        for _ in 0..30 {
            k.takt();
        }
        assert_eq!(k.hole_zahl(w, am), 1.0);
        assert!((k.teil_hole(t, tf::Y) - 278.0).abs() < 0.2, "{}", k.teil_hole(t, tf::Y));
        assert!((k.teil_hole(tk, tf::Y) - 278.0).abs() < 0.2, "{}", k.teil_hole(tk, tf::Y));
        // über mehrere Fugen schieben: Deko-Kachel stört nicht, tempoY bleibt 0, amBoden jeden Takt, x steigt stetig
        k.setze_zahl(w, tx, 300.0);
        k.setze_zahl(wk, tx, 60.0);
        let mut x0 = k.teil_hole(t, tf::X);
        for i in 0..40 {
            k.takt();
            let x = k.teil_hole(t, tf::X);
            assert!(x > x0, "Takt {}: hakt bei x = {}", i, x);
            x0 = x;
            assert_eq!(k.hole_zahl(w, am), 1.0, "Takt {}", i);
            assert!(k.hole_zahl(w, ty).abs() < 1e-9, "Takt {}: tempoY {}", i, k.hole_zahl(w, ty));
            assert_eq!(k.hole_zahl(wk, am), 1.0, "Kreis, Takt {}", i);
        }
        assert!(k.teil_hole(t, tf::X) > 150.0, "{}", k.teil_hole(t, tf::X));
        // gegen die Wand (Spalte 15, x = 480): die Kiste bleibt davor stehen
        k.setze_zahl(w, tx, 600.0);
        for _ in 0..120 {
            k.takt();
        }
        let x = k.teil_hole(t, tf::X);
        assert!(x <= 470.1 && x > 465.0, "vor der Wand: {}", x);
        assert_eq!(k.hole_zahl(w, am), 1.0);
    }

    #[test]
    fn faellt_an_der_wand_entlang_und_stapel_ruht() {
        let mut k = welt();
        let n = nummern(&mut k);
        boden(&mut k, &n);
        let (f, _, _, _, tx, ty, am, maske) = physik(&mut k);
        // Kiste rechts an der Wand (x = 480 … 512), drückt leicht nach links (Reibung bremst nur wenig) und fällt an den Fugen vorbei
        let (t, w) = koerper(&mut k, 522.0, 130.0, 20.0, 20.0, false);
        let mut y0 = k.teil_hole(t, tf::Y);
        for i in 0..60 {
            k.setze_zahl(w, tx, -10.0);
            k.takt();
            let y = k.teil_hole(t, tf::Y);
            if y < 277.0 {
                assert!(y > y0, "Takt {}: hakt an der Wand bei y = {}", i, y);
            }
            y0 = y;
        }
        assert!((k.teil_hole(t, tf::Y) - 278.0).abs() < 0.2, "{}", k.teil_hole(t, tf::Y));
        assert!((k.teil_hole(t, tf::X) - 522.0).abs() < 0.2, "{}", k.teil_hole(t, tf::X));
        // Stapel aus 3 Kisten ruht auf dem Kachelboden
        let mut kisten = Vec::new();
        for i in 0..3 {
            kisten.push(koerper(&mut k, 100.0 + i as f64, 270.0 - 22.0 * i as f64, 20.0, 20.0, false));
        }
        for _ in 0..240 {
            k.takt();
        }
        let vorher: Vec<f64> = kisten.iter().map(|&(t, _)| k.teil_hole(t, tf::Y)).collect();
        for _ in 0..120 {
            k.takt();
        }
        for (i, &(t, w)) in kisten.iter().enumerate() {
            let y = k.teil_hole(t, tf::Y);
            assert!((y - vorher[i]).abs() < 0.05, "Kiste {} wandert: {} → {}", i, vorher[i], y);
            assert!((y - (278.0 - 20.0 * i as f64)).abs() < 0.5, "Kiste {} bei {}", i, y);
            assert!(k.hole_zahl(w, ty).abs() < 1e-6);
        }
        // Maske ohne Gruppe 1: fällt durch die Kacheln
        let (tg, wg) = koerper(&mut k, 300.0, 200.0, 10.0, 10.0, true);
        let fc = k.komp_von(tg, f);
        k.setze_zahl(fc, maske, 2.0);
        for _ in 0..60 {
            k.takt();
        }
        assert!(k.teil_hole(tg, tf::Y) > 330.0);
        assert_eq!(k.hole_zahl(wg, am), 0.0);
    }

    #[test]
    fn ohne_feste_kacheln_wie_vorher() {
        // dieselbe Szene mit (nicht festen) und ohne Fliesen: die Physik ist bitgleich
        let lauf = |mit: bool| {
            let mut k = welt();
            let n = nummern(&mut k);
            if mit {
                let a = bildchen(&mut k, 2, 2, b'k');
                karte(&mut k, &n, 0.0, 0.0, 20.0, 12.0, 32.0, &[a], &vec![1.0; 240], &[2.0]);
            }
            let (t, w) = koerper(&mut k, 100.0, 50.0, 12.0, 12.0, true);
            let (_, _, _, _, tx, ..) = physik(&mut k);
            k.setze_zahl(w, tx, 50.0);
            for _ in 0..30 {
                k.takt();
            }
            (k.teil_hole(t, tf::X), k.teil_hole(t, tf::Y))
        };
        assert_eq!(lauf(true), lauf(false));
    }
}

/// H-K9: `Kulisse` – Szenenwechsel als Teilbäume, die man an- und ausschaltet.
mod hk9 {
    use super::*;
    use crate::abi::szenen_hash;
    use crate::komponenten::Art;
    use crate::welt::Welt;

    /// 2D-Teil bei (x, y) mit Kreis (Radius 10) und Bewegung tempoX = 60
    fn laeufer(k: &mut Kern, x: f64, y: f64) -> i32 {
        let (kr, bw) = (typ(k, "Kreis"), typ(k, "Bewegung"));
        let t = k.teil_neu(2);
        k.teil_lage(t, x, y, 0.0);
        let c = k.komp_neu(kr);
        let fr = feld(k, kr, "radius");
        k.setze_zahl(c, fr, 10.0);
        assert_eq!(k.komp_haenge(c, t), 0);
        let b = k.komp_neu(bw);
        let ft = feld(k, bw, "tempoX");
        k.setze_zahl(b, ft, 60.0);
        assert_eq!(k.komp_haenge(b, t), 0);
        t
    }
    /// Kulisse an `t` mit `aktiv`
    fn kulisse(k: &mut Kern, t: i32, aktiv: bool) -> i32 {
        let ku = typ(k, "Kulisse");
        let c = k.komp_neu(ku);
        let fa = feld(k, ku, "aktiv");
        assert_eq!(k.setze_zahl(c, fa, if aktiv { 1.0 } else { 0.0 }), 0);
        assert_eq!(k.komp_haenge(c, t), 0);
        c
    }
    fn setze_aktiv(k: &mut Kern, c: i32, aktiv: bool) {
        let ku = typ(k, "Kulisse");
        let fa = feld(k, ku, "aktiv");
        assert_eq!(k.setze_zahl(c, fa, if aktiv { 1.0 } else { 0.0 }), 0);
    }
    fn x(k: &mut Kern, t: i32) -> f64 {
        k.teil_hole(t, tf::X)
    }

    #[test]
    fn schema_ohne_system() {
        let mut k = welt();
        let ku = typ(&mut k, "Kulisse");
        let a = &ARTEN[ku as usize - 1];
        assert_eq!(a.schema.name, "Kulisse");
        assert!(a.takt.is_none() && a.nachlauf.is_none() && a.bild.is_none() && a.huelle.is_none());
        assert!(a.ruhe.is_some() && !a.kopie_ohne);
        let c = k.komp_neu(ku);
        let (fa, fname) = (feld(&mut k, ku, "aktiv"), feld(&mut k, ku, "name"));
        assert_eq!(k.hole_zahl(c, fa), 1.0);
        assert_eq!(text(&mut k, c, fname), "");
        // diavolo: nur 0/1
        assert!(k.setze_zahl(c, fa, 2.0) < 0);
        // beide Räume
        let d = k.teil_neu(3);
        assert_eq!(k.komp_haenge(c, d), 0);
        // höchstens eine je Teil
        let c2 = k.komp_neu(ku);
        assert!(k.komp_haenge(c2, d) < 0);
    }

    #[test]
    fn aus_ruht_samt_kindern_an_weckt() {
        let mut k = welt();
        let menue = laeufer(&mut k, 100.0, 100.0);
        let kind = laeufer(&mut k, 0.0, 30.0);
        assert_eq!(k.teil_haenge(kind, menue), 0);
        let wand = laeufer(&mut k, 105.0, 100.0);
        let km = kulisse(&mut k, menue, true);
        // aktiv: wie ohne Kulisse
        assert_eq!(k.teil_trifft(menue, wand), 1);
        k.takt();
        assert_eq!(x(&mut k, menue), 101.0);
        assert_eq!(x(&mut k, kind), 1.0);
        k.bild(1);
        assert_eq!(instanzen_2d(&k).len(), 3);
        // aus: ruht samt Kind, unsichtbar, trifft nein; das eigene Feld sichtbar bleibt ja
        setze_aktiv(&mut k, km, false);
        assert_eq!(k.teil_trifft(menue, wand), 0);
        k.takt();
        assert_eq!(x(&mut k, menue), 101.0);
        assert_eq!(x(&mut k, kind), 1.0);
        assert_eq!(x(&mut k, wand), 107.0);
        k.bild(2);
        assert_eq!(instanzen_2d(&k).len(), 1);
        assert_eq!(k.teil_hole(menue, tf::SICHTBAR), 1.0);
        // wieder an: sofort wach
        setze_aktiv(&mut k, km, true);
        assert_eq!(k.teil_trifft(menue, wand), 1);
        k.takt();
        assert_eq!(x(&mut k, menue), 102.0);
        assert_eq!(x(&mut k, kind), 2.0);
        // ohne("Kulisse") weckt ebenfalls; eine ausgeschaltete Kulisse anhängen lässt ruhen
        setze_aktiv(&mut k, km, false);
        assert_eq!(k.komp_loese(km), 0);
        k.takt();
        assert_eq!(x(&mut k, menue), 103.0);
        assert_eq!(k.komp_haenge(km, menue), 0);
        k.takt();
        assert_eq!(x(&mut k, menue), 103.0);
        // ein Teil in eine ausgeschaltete Kulisse hängen → ruht; lösen → wach
        assert_eq!(k.teil_haenge(wand, menue), 0);
        let wx = x(&mut k, wand);
        k.takt();
        assert_eq!(x(&mut k, wand), wx);
        assert_eq!(k.teil_haenge(wand, 0), 0);
        k.takt();
        assert_eq!(x(&mut k, wand), wx + 1.0);
        // Entladen: entferne nimmt den ganzen Teilbaum mit
        assert_eq!(k.teil_entferne(menue), 0);
        assert_eq!(k.teil_hole(kind, tf::ENTFERNT), 1.0);
    }

    #[test]
    fn verschachtelt_und_additiv() {
        let mut k = welt();
        let spiel = k.teil_neu(2);
        let ks = kulisse(&mut k, spiel, true);
        let a = laeufer(&mut k, 0.0, 0.0);
        assert_eq!(k.teil_haenge(a, spiel), 0);
        // innere Kulisse aus in aktiver äußerer: nur der innere Teilbaum ruht
        let innen = laeufer(&mut k, 0.0, 0.0);
        assert_eq!(k.teil_haenge(innen, spiel), 0);
        let ki = kulisse(&mut k, innen, false);
        k.takt();
        assert_eq!((x(&mut k, a), x(&mut k, innen)), (1.0, 0.0));
        // äußere aus überstimmt die innere an
        setze_aktiv(&mut k, ki, true);
        setze_aktiv(&mut k, ks, false);
        k.takt();
        assert_eq!((x(&mut k, a), x(&mut k, innen)), (1.0, 0.0));
        // beide an
        setze_aktiv(&mut k, ks, true);
        k.takt();
        assert_eq!((x(&mut k, a), x(&mut k, innen)), (2.0, 1.0));
        // additiv: zweite Kulisse daneben (Pause über dem Spiel); das Spiel ruht, die Pause läuft
        let pause = laeufer(&mut k, 0.0, 0.0);
        let kp = kulisse(&mut k, pause, true);
        setze_aktiv(&mut k, ks, false);
        k.takt();
        assert_eq!((x(&mut k, a), x(&mut k, pause)), (2.0, 1.0));
        setze_aktiv(&mut k, kp, false);
        setze_aktiv(&mut k, ks, true);
        k.takt();
        assert_eq!((x(&mut k, a), x(&mut k, pause)), (3.0, 1.0));
    }

    #[test]
    fn kopie_behaelt_kulisse() {
        let mut k = welt();
        let ku = typ(&mut k, "Kulisse");
        let fa = feld(&mut k, ku, "aktiv");
        let a = laeufer(&mut k, 0.0, 0.0);
        let c = kulisse(&mut k, a, false);
        let b = k.teil_kopie(a);
        let cb = k.komp_von(b, ku);
        assert!(cb > 0 && cb != c);
        assert_eq!(k.hole_zahl(cb, fa), 0.0);
        k.takt();
        assert_eq!(x(&mut k, b), 0.0, "Kopie einer ausgeschalteten Kulisse ruht");
        setze_aktiv(&mut k, cb, true);
        k.takt();
        assert_eq!((x(&mut k, a), x(&mut k, b)), (0.0, 1.0), "jede Kopie schaltet für sich");
    }

    /// Kamera, Licht und Blick in einer ausgeschalteten Kulisse zählen nicht.
    #[test]
    fn kamera_licht_blick_nur_aktiv() {
        let (kam, li) = {
            let mut k = welt();
            (typ(&mut k, "Kamera"), typ(&mut k, "Licht"))
        };
        let spiel_kamera = |k: &mut Kern| {
            let t = k.teil_neu(3);
            k.teil_lage(t, 4.0, 3.0, 9.0);
            let c = k.komp_neu(kam);
            assert_eq!(k.komp_haenge(c, t), 0);
            t
        };
        // 3D: Standard-Kamera (Teil 1) in einer ausgeschalteten Kulisse → es zeichnet die wache Kamera des Spiels
        let mut ohne = welt();
        let c1 = ohne.komp_von(1, kam);
        assert_eq!(ohne.komp_loese(c1), 0);
        spiel_kamera(&mut ohne);
        ohne.bild(1);
        ohne.bild(2);
        let soll: Vec<u8> = ohne.paket().to_vec();
        let mut mit = welt();
        let titel = kulisse(&mut mit, 1, true);
        spiel_kamera(&mut mit);
        mit.bild(1);
        mit.bild(2);
        assert_ne!(mit.paket(), &soll[..], "aktive Titel-Kamera (kleinste ID) zeichnet");
        setze_aktiv(&mut mit, titel, false);
        mit.bild(2);
        assert_eq!(mit.paket(), &soll[..], "ausgeschaltete Titel-Kamera zählt nicht");
        // Punktlicht in einer ausgeschalteten Kulisse: Bild wie ohne Licht
        let mut k = welt();
        k.bild(1);
        k.bild(2);
        let ohne_licht: Vec<u8> = k.paket().to_vec();
        let t = k.teil_neu(3);
        k.teil_lage(t, 0.0, 2.0, 0.0);
        let l = k.komp_neu(li);
        assert_eq!(k.komp_haenge(l, t), 0);
        let kl = kulisse(&mut k, t, true);
        k.bild(2);
        assert_ne!(k.paket(), &ohne_licht[..], "aktives Licht leuchtet");
        setze_aktiv(&mut k, kl, false);
        k.bild(2);
        assert_eq!(k.paket(), &ohne_licht[..], "ausgeschaltetes Licht zählt nicht");
        // 2D-Blick in einer ausgeschalteten Kulisse: Bild wie ohne Blick
        let mut k = welt();
        let bl = typ(&mut k, "Blick");
        laeufer(&mut k, 100.0, 100.0);
        k.bild(1);
        k.bild(2);
        let ohne_blick: Vec<u8> = k.paket().to_vec();
        let t = k.teil_neu(2);
        k.teil_lage(t, 500.0, 300.0, 0.0);
        let b = k.komp_neu(bl);
        let f_zoom = feld(&mut k, bl, "zoom");
        k.setze_zahl(b, f_zoom, 3.0);
        assert_eq!(k.komp_haenge(b, t), 0);
        let kb = kulisse(&mut k, t, false);
        k.bild(2);
        assert_eq!(k.paket(), &ohne_blick[..], "ausgeschalteter Blick: Bild wie ohne Blick");
        setze_aktiv(&mut k, kb, true);
        k.bild(2);
        assert_ne!(k.paket(), &ohne_blick[..], "eingeschalteter Blick gilt");
    }

    /// Szenen-Hash einer Welt ohne Kulisse ist gleich, ob die Registry Kulisse kennt oder nicht.
    #[test]
    fn hash_ohne_kulisse_unveraendert() {
        fn baue(arten: &'static [&'static Art]) -> u64 {
            let mut w = Welt::neu(640, 360, String::from("H"), arten);
            let (kr, bw, pt) = (w.art_index("Kreis").unwrap(), w.art_index("Bewegung").unwrap(), w.art_index("Partikel").unwrap());
            let a = w.teil_neu(false);
            let b = w.teil_neu(false);
            w.haenge(b, a).unwrap();
            for (art, t) in [(kr, a), (bw, a), (pt, b), (kr, b)] {
                let h = w.komp_neu(art);
                w.komp_haenge(h, t).unwrap();
            }
            let z = w.komp_zeile(w.zeile_opt(a).unwrap(), bw).unwrap();
            w.speicher[bw].zahl_mut(crate::komponenten::bewegung::TEMPO_X)[z] = 30.0;
            let c = w.kopie(a).unwrap();
            w.lage_setzen(c, 5.0, 6.0, 0.0);
            for _ in 0..20 {
                w.takt();
            }
            szenen_hash(&mut w)
        }
        let ohne: &'static [&'static Art] = Box::leak(ARTEN.iter().copied().filter(|a| a.schema.name != "Kulisse").collect::<Vec<_>>().into_boxed_slice());
        assert_eq!(ohne.len() + 1, ARTEN.len());
        assert_eq!(baue(ARTEN), baue(ohne));
    }
}

/// H-K11b: `Himmelszelt` (Skybox) – Abschnitt HIMMELSZELT nur bei Nutzung, kleinste wache Teil-ID, Seiten aus Atlas und eigener Textur.
mod hk11b {
    use super::*;
    use crate::paket::{flag, HIMMELSZELT_BYTES};

    struct N {
        h: i32,
        bilder: i32,
        oben: i32,
        horizont: i32,
        boden: i32,
        sonne: i32,
        sterne: i32,
    }
    fn nummern(k: &mut Kern) -> N {
        let h = typ(k, "Himmelszelt");
        N {
            h,
            bilder: feld(k, h, "bilder"),
            oben: feld(k, h, "oben"),
            horizont: feld(k, h, "horizont"),
            boden: feld(k, h, "boden"),
            sonne: feld(k, h, "sonnenscheibe"),
            sterne: feld(k, h, "sterne"),
        }
    }
    fn zelt(k: &mut Kern, n: &N) -> (i32, i32) {
        let t = k.teil_neu(3);
        let c = k.komp_neu(n.h);
        assert_eq!(k.komp_haenge(c, t), 0);
        (t, c)
    }
    /// Abschnitt HIMMELSZELT des letzten Pakets
    fn abschnitt_zelt(k: &Kern) -> Option<Vec<u8>> {
        Leser::neu(k.paket()).unwrap().abschnitte().find(|(a, _)| *a == abschnitt::HIMMELSZELT).map(|(_, d)| d.to_vec())
    }
    fn f(d: &[u8], o: usize) -> f32 {
        f32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }
    fn u(d: &[u8], o: usize) -> u32 {
        u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }
    fn szene(k: &Kern) -> Vec<u8> {
        Leser::neu(k.paket()).unwrap().abschnitte().find(|(a, _)| *a == abschnitt::SZENE).unwrap().1.to_vec()
    }
    /// Bildchen-Zeilen im ABI-Format (je Text `u32` Länge + Bytes)
    fn zeilen(z: &[&str]) -> Vec<u8> {
        let mut b = Vec::new();
        for t in z {
            b.extend_from_slice(&(t.len() as u32).to_le_bytes());
            b.extend_from_slice(t.as_bytes());
        }
        b
    }

    #[test]
    fn schema_raum_grenzen() {
        let mut k = welt();
        let n = nummern(&mut k);
        assert_eq!(n.h, 26); // Typnummer in Merge-Reihenfolge (HERD.md §12.1, §11.1): nach Fliesen 24 und Kulisse 25
        let t2 = k.teil_neu(2);
        let c = k.komp_neu(n.h);
        assert!(k.komp_haenge(c, t2) < 0);
        assert_eq!(k.fehler_text(), "Himmelszelt gibt es nur für 3D-Teile.");
        assert_eq!(text(&mut k, c, n.oben), "himmel");
        assert_eq!(text(&mut k, c, n.horizont), "mozzarella");
        assert_eq!(text(&mut k, c, n.boden), "teig");
        assert_eq!((k.hole_zahl(c, n.sonne), k.hole_zahl(c, n.sterne)), (0.0, 0.0));
        assert!(k.setze_zahl(c, n.sonne, 91.0) < 0);
        assert_eq!(k.fehler_text(), "Himmelszelt.sonnenscheibe muss zwischen 0 und 90 liegen, nicht 91.");
        assert!(k.setze_zahl(c, n.sterne, 1.5) < 0);
        assert!(k.setze_zahl(c, n.sterne, -0.1) < 0);
        assert!(k.setze_liste(c, n.bilder, &[99]) < 0);
        assert_eq!(ARTEN[n.h as usize - 1].schema.oeffentliche(), 6);
    }

    /// Feldnamen müssen in pizza als benannte Argumente taugen: keines ist ein Schlüsselwort (`site/js/pizza/kopf.js`) –
    /// so fiel `unten` aus HERD.md §12.4 auf (Aufruf der Basisklasse), das Feld heißt `boden`.
    #[test]
    fn feldnamen_keine_schluesselwoerter() {
        const SCHLUESSELWOERTER: &[&str] = &[
            "paket", "import", "klasse", "rezeptur", "rohling", "calzone", "quattrostagioni", "erbt", "erfüllt", "speisekarte",
            "familienrezept", "geheimrezept", "tiefkühl", "gebacken", "leer", "neu", "dies", "unten", "serviere", "falls", "sonst",
            "für", "solange", "wähle", "fall", "standard", "probier", "verbrannt", "rand", "wirf", "wirft", "abbrechen", "weiter",
            "ja", "nein", "karton", "ofen", "roh",
        ];
        for a in ARTEN.iter().filter(|a| !a.nur_test) {
            for f in a.schema.felder {
                assert!(!SCHLUESSELWOERTER.contains(&f.name), "{}.{} ist ein pizza-Schlüsselwort", a.schema.name, f.name);
            }
        }
    }

    #[test]
    fn ohne_zelt_byte_gleich() {
        // ohne, lose, an einer ruhenden Vorlage: Paket byte-gleich; an einem wachen Teil: Abschnitt + Flag HIMMEL
        let mut k = welt();
        let n = nummern(&mut k);
        k.bild(1);
        k.bild(2);
        let ohne = k.paket().to_vec();
        assert_eq!(Leser::neu(&ohne).unwrap().flags() & flag::HIMMEL, 0);
        let lose = k.komp_neu(n.h);
        k.bild(2);
        assert_eq!(k.paket(), &ohne[..]);
        let t = k.teil_neu(3);
        let v = typ(&mut k, "Vorlage");
        let vc = k.komp_neu(v);
        assert_eq!(k.komp_haenge(vc, t), 0);
        assert_eq!(k.komp_haenge(lose, t), 0);
        k.bild(2);
        assert_eq!(k.paket(), &ohne[..]);
        assert!(abschnitt_zelt(&k).is_none());
        // geweckt: Abschnitt da, sonst nur Flags, Abschnittszahl, Länge und das Umgebungslicht (aus `oben`) anders
        k.komp_loese(vc);
        k.bild(2);
        let mit = k.paket().to_vec();
        let l = Leser::neu(&mit).unwrap();
        assert_ne!(l.flags() & flag::HIMMEL, 0);
        assert_eq!(abschnitt_zelt(&k).unwrap().len(), HIMMELSZELT_BYTES);
        assert_eq!(u32::from_le_bytes([mit[20], mit[21], mit[22], mit[23]]), u32::from_le_bytes([ohne[20], ohne[21], ohne[22], ohne[23]]) + 1);
        // mit herd.umgebung ist SZENE gleich wie ohne Himmelszelt
        k.welt_umgebung(b"#808080", 0.4);
        k.bild(2);
        let s_mit = szene(&k);
        k.komp_loese(lose);
        k.bild(2);
        assert_eq!(szene(&k), s_mit);
        assert!(abschnitt_zelt(&k).is_none());
    }

    #[test]
    fn inhalt_und_kleinste_wache_id() {
        let mut k = welt();
        let n = nummern(&mut k);
        let (_, a) = zelt(&mut k, &n);
        let (tb, b) = zelt(&mut k, &n);
        k.setze_text(a, n.oben, b"#000000");
        k.setze_text(b, n.oben, b"#ffffff");
        k.setze_text(b, n.horizont, b"#ff0000");
        k.setze_text(b, n.boden, b"#0000ff");
        k.setze_zahl(b, n.sonne, 4.0);
        k.setze_zahl(b, n.sterne, 0.5);
        k.bild(1);
        let d = abschnitt_zelt(&k).unwrap();
        assert_eq!((f(&d, 0), f(&d, 4), f(&d, 8), f(&d, 12)), (0.0, 0.0, 0.0, 1.0), "kleinste ID gilt");
        // die erste ruht (Vorlage am Elternteil) → die zweite gilt
        let eltern = k.teil_neu(3);
        let ta = k.komp_info(a, 2);
        assert_eq!(k.teil_haenge(ta, eltern), 0);
        let v = typ(&mut k, "Vorlage");
        let vc = k.komp_neu(v);
        k.komp_haenge(vc, eltern);
        k.bild(2);
        let d = abschnitt_zelt(&k).unwrap();
        assert_eq!((f(&d, 0), f(&d, 4), f(&d, 8)), (1.0, 1.0, 1.0));
        assert_eq!((f(&d, 16), f(&d, 20), f(&d, 24)), (1.0, 0.0, 0.0));
        assert_eq!((f(&d, 32), f(&d, 36), f(&d, 40)), (0.0, 0.0, 1.0));
        // Sonnenrichtung = SZENE.sonne_richtung, w = halber Winkel; Sonnenfarbe linear, w = Sterne
        let s = szene(&k);
        assert_eq!(&d[48..60], &s[144..156]);
        assert!((f(&d, 60) as f64 - 2.0 * crate::welt::GRAD).abs() < 1e-7);
        assert_eq!(f(&d, 76), 0.5);
        // Umgebungslicht aus `oben` (weiß × 0.35), wenn herd.umgebung fehlt
        assert_eq!((f(&s, 176), f(&s, 180), f(&s, 184)), (0.35, 0.35, 0.35));
        // ohne Bilder: alle Seiten prozedural
        assert!((80..208).step_by(4).all(|o| u(&d, o) == 0));
        // Seiten: Atlas-Bildchen (rechts) und eigene Textur (links); kürzere Liste = Rest prozedural
        let atlas = k.bildchen_neu(&zeilen(&["wwww", "wwww"]), &[]);
        let eigen = k.bildchen_teigling(&crate::teigling::tests::teigling(64, 32, 0));
        assert!(atlas > 0 && eigen > 0);
        assert_eq!(k.setze_liste(b, n.bilder, &[atlas as u32, eigen as u32]), 0);
        k.bild(3);
        let d = abschnitt_zelt(&k).unwrap();
        let (x, y) = (u(&d, 80), u(&d, 84));
        assert_eq!((u(&d, 88), u(&d, 92)), (x + 4, y + 2));
        assert_eq!((u(&d, 96), u(&d, 100), u(&d, 104), u(&d, 108)), (0, 0, 64, 32));
        assert_eq!(u(&d, 176), 1 << 16); // Atlas-Seite 0
        assert_eq!(u(&d, 180), (eigen as u32 & 0xFFFF) | 1 << 16 | 1 << 17);
        assert!((184..208).step_by(4).all(|o| u(&d, o) == 0));
        assert!((112..176).step_by(4).all(|o| u(&d, o) == 0));
        // nur Werte: die Szene bleibt gleich, wenn tb wandert (das Himmelszelt hängt nicht von der Lage ab)
        k.teil_lage(tb, 5.0, 5.0, 5.0);
        k.bild(4);
        assert_eq!(abschnitt_zelt(&k).unwrap(), d);
    }
}

/// H-K12: Maus im Kern (`eingabe`), UI-Bausteine `Taster`, `Leiste`, `Regler`, `Tafel`, `Blick.mausX`/`mausY`.
mod hk12 {
    use super::*;
    use crate::paket::flach_art;

    /// 2D-Instanzen des letzten Pakets: (m00 m10 m01 m11 tx ty hx hy, Farbe, Art) in Zeichenreihenfolge
    fn inst(k: &Kern) -> Vec<([f32; 8], u32, u32)> {
        let l = Leser::neu(k.paket()).unwrap();
        let Some((_, d)) = l.abschnitte().find(|(a, _)| *a == abschnitt::INST2D) else { return Vec::new() };
        d.chunks_exact(INST2D_BYTES)
            .map(|c| {
                let f: [f32; 8] = core::array::from_fn(|i| f32::from_le_bytes([c[i * 4], c[i * 4 + 1], c[i * 4 + 2], c[i * 4 + 3]]));
                let farbe = u32::from_be_bytes([c[40], c[41], c[42], c[43]]);
                let art = u32::from_le_bytes([c[44], c[45], c[46], c[47]]) & 0xFF;
                (f, farbe, art)
            })
            .collect()
    }
    fn teil(k: &mut Kern, x: f64, y: f64) -> i32 {
        let t = k.teil_neu(2);
        k.teil_lage(t, x, y, 0.0);
        t
    }
    fn an(k: &mut Kern, name: &str, t: i32) -> i32 {
        let ty = typ(k, name);
        let c = k.komp_neu(ty);
        assert_eq!(k.komp_haenge(c, t), 0, "{}", k.fehler_text());
        c
    }
    fn setze(k: &mut Kern, c: i32, name: &str, feld_name: &str, w: f64) {
        let ty = typ(k, name);
        let f = feld(k, ty, feld_name);
        assert_eq!(k.setze_zahl(c, f, w), 0, "{}", k.fehler_text());
    }
    fn hole(k: &mut Kern, c: i32, name: &str, feld_name: &str) -> f64 {
        let ty = typ(k, name);
        let f = feld(k, ty, feld_name);
        k.hole_zahl(c, f)
    }
    /// Lesefelder eines Tasters: (drueber, gedrueckt, geklickt)
    fn zustand(k: &mut Kern, c: i32) -> (bool, bool, bool) {
        (hole(k, c, "Taster", "drueber") != 0.0, hole(k, c, "Taster", "gedrueckt") != 0.0, hole(k, c, "Taster", "geklickt") != 0.0)
    }
    fn schritt(k: &mut Kern, x: f64, y: f64, kn: i32) {
        assert_eq!(k.eingabe(x, y, kn), 0);
        assert_eq!(k.takt(), 0);
    }

    #[test]
    fn schema_typnummern_lesefelder() {
        let mut k = welt();
        // Typnummern in Merge-Reihenfolge (HERD.md §12.1, §11.1): nach Himmelszelt 26
        assert_eq!([typ(&mut k, "Taster"), typ(&mut k, "Leiste"), typ(&mut k, "Regler"), typ(&mut k, "Tafel")], [27, 28, 29, 30]);
        let art = |n: &str| ARTEN.iter().find(|a| a.schema.name == n).unwrap();
        assert!(art("Taster").nachlauf.is_some() && art("Regler").nachlauf.is_some() && art("Tafel").nachlauf.is_some());
        assert!(art("Leiste").nachlauf.is_none() && art("Leiste").takt.is_none());
        for n in ["Taster", "Leiste", "Regler", "Tafel"] {
            assert!(art(n).takt.is_none() && art(n).bild.is_some() && art(n).huelle.is_some(), "{}", n);
            assert!(!TEIL_METHODEN.contains(&(n[..1].to_lowercase() + &n[1..]).as_str()));
        }
        let lese = |n: &str| art(n).schema.felder.iter().filter(|f| f.lesen).map(|f| f.name).collect::<Vec<_>>();
        assert_eq!(lese("Taster"), ["drueber", "gedrueckt", "geklickt"]);
        assert_eq!(lese("Regler"), ["geaendert"]);
        let b = art("Blick").schema.felder;
        assert!(b[7].name == "mausX" && b[7].lesen && b[7].nachtrag && b[8].name == "mausY" && b[8].lesen && b[8].nachtrag);
        let t = teil(&mut k, 0.0, 0.0);
        let c = an(&mut k, "Taster", t);
        let fd = feld(&mut k, 27, "drueber");
        assert_eq!(k.setze_zahl(c, fd, 1.0), -2);
        assert_eq!(k.fehler_text(), "Taster.drueber kann man nur lesen.");
        let l = k.komp_neu(28);
        let fw = feld(&mut k, 28, "wert");
        assert_eq!(k.setze_zahl(l, fw, 1.5), -2);
        assert_eq!(k.fehler_text(), "Leiste.wert muss zwischen 0 und 1 liegen, nicht 1.5.");
        let t3 = k.teil_neu(3);
        assert!(k.komp_haenge(l, t3) < 0);
        assert_eq!(k.fehler_text(), "Leiste gibt es nur für 2D-Teile.");
        let ff = feld(&mut k, 30, "farbe");
        let tf_ = k.komp_neu(30);
        assert_eq!(text(&mut k, tf_, ff), "#2f2a26e0");
        assert_eq!(k.hole_zahl(tf_, ff), 0x2f2a26e0u32 as f64);
        // eingabe ohne Welt → Fehler; ungültige Werte ändern nichts
        let mut leer = Kern::neu();
        assert!(leer.eingabe(1.0, 2.0, 1) < 0);
        assert_eq!(k.eingabe(f64::NAN, 5.0, 9), 0);
        assert_eq!(k.welt.as_ref().unwrap().eingabe.maus, [0.0, 0.0]);
        assert_eq!(k.welt.as_ref().unwrap().eingabe.knoepfe, 0);
    }

    #[test]
    fn maus_nicht_im_szenen_hash() {
        // eine Szene mit Blick (v1-Komponenten + Blick): Eingabe und mausX/mausY lesen ändern Szenen- und Paket-Hash nicht
        let bau = |maus: Option<(f64, f64, i32)>| {
            let mut k = welt();
            let t = teil(&mut k, 300.0, 200.0);
            an(&mut k, "Rechteck", t);
            let b = teil(&mut k, 320.0, 180.0);
            k.teil_setze(b, tf::DREHUNG, 30.0);
            let c = an(&mut k, "Blick", b);
            setze(&mut k, c, "Blick", "zoom", 2.0);
            let mut hashes = Vec::new();
            for i in 0..3 {
                if let Some((x, y, kn)) = maus {
                    k.eingabe(x + i as f64, y, kn);
                    let mx = hole(&mut k, c, "Blick", "mausX");
                    assert!(mx.is_finite());
                }
                k.takt();
                k.bild(i + 1);
                hashes.push((k.hash_szene(), k.hash_paket()));
            }
            hashes
        };
        let ohne = bau(None);
        assert_eq!(bau(Some((10.0, 20.0, 1))), ohne);
        assert_eq!(bau(Some((600.0, 5.0, 0))), ohne);
    }

    #[test]
    fn blick_maus_in_weltkoordinaten() {
        let mut k = welt();
        let b = teil(&mut k, 1000.0, 500.0);
        let c = an(&mut k, "Blick", b);
        // ohne Eingabe: Spielfeld (0, 0) → Welt (1000 − 320, 500 − 180)
        assert_eq!((hole(&mut k, c, "Blick", "mausX"), hole(&mut k, c, "Blick", "mausY")), (680.0, 320.0));
        k.eingabe(320.0, 180.0, 0);
        assert_eq!((hole(&mut k, c, "Blick", "mausX"), hole(&mut k, c, "Blick", "mausY")), (1000.0, 500.0));
        setze(&mut k, c, "Blick", "zoom", 2.0);
        k.eingabe(420.0, 180.0, 0);
        assert_eq!(hole(&mut k, c, "Blick", "mausX"), 1050.0);
        // Drehung 90°: 100 Pixel nach rechts im Spielfeld = 50 Welt-Einheiten nach oben (Sicht dreht um −90°)
        k.teil_setze(b, tf::DREHUNG, 90.0);
        let (x, y) = (hole(&mut k, c, "Blick", "mausX"), hole(&mut k, c, "Blick", "mausY"));
        assert!((x - 1000.0).abs() < 1e-9 && (y - 550.0).abs() < 1e-9, "{} {}", x, y);
        // inaktiver Blick rechnet weiter mit seiner eigenen Sicht; loser Blick → Spielfeld
        setze(&mut k, c, "Blick", "aktiv", 0.0);
        assert!((hole(&mut k, c, "Blick", "mausY") - 550.0).abs() < 1e-9);
        let tb = typ(&mut k, "Blick");
        let lose = k.komp_neu(tb);
        assert_eq!(hole(&mut k, lose, "Blick", "mausX"), 420.0);
        // Spalte bleibt Standard (0) – mausX bleibt im Hash unsichtbar
        let a = typ(&mut k, "Blick") as usize - 1;
        let w = k.welt.as_ref().unwrap();
        assert!(w.speicher[a].zahl(crate::komponenten::blick::MAUS_X).iter().all(|v| *v == 0.0));
    }

    #[test]
    fn taster_drueber_gedrueckt_geklickt() {
        let mut k = welt();
        let t = teil(&mut k, 100.0, 100.0);
        let c = an(&mut k, "Taster", t);
        // Lesefelder gelten ab dem Takt nach der Eingabe (Nachlauf)
        k.eingabe(100.0, 100.0, 0);
        assert_eq!(zustand(&mut k, c), (false, false, false));
        k.takt();
        assert_eq!(zustand(&mut k, c), (true, false, false));
        schritt(&mut k, 100.0, 100.0, 1);
        assert_eq!(zustand(&mut k, c), (true, true, false));
        schritt(&mut k, 150.0, 110.0, 1); // Rand (Ränder zählen): 100 + 60, 100 + 18
        assert_eq!(zustand(&mut k, c), (true, true, false));
        schritt(&mut k, 160.0, 100.0, 0);
        assert_eq!(zustand(&mut k, c), (true, false, true));
        k.takt(); // geklickt nur in einem Takt
        assert_eq!(zustand(&mut k, c), (true, false, false));
        // drücken, wegziehen, loslassen → kein Klick; gedrueckt bleibt, solange gehalten
        schritt(&mut k, 100.0, 100.0, 1);
        schritt(&mut k, 300.0, 100.0, 1);
        assert_eq!(zustand(&mut k, c), (false, true, false));
        schritt(&mut k, 300.0, 100.0, 0);
        assert_eq!(zustand(&mut k, c), (false, false, false));
        // außen drücken, hineinziehen, loslassen → kein Klick und solange gehalten nicht drueber
        schritt(&mut k, 300.0, 100.0, 1);
        schritt(&mut k, 100.0, 100.0, 1);
        assert_eq!(zustand(&mut k, c), (true, false, false), "nichts gefangen → drueber");
        schritt(&mut k, 100.0, 100.0, 0);
        assert_eq!(zustand(&mut k, c), (true, false, false));
        // rechte Taste zählt nicht
        schritt(&mut k, 100.0, 100.0, 2);
        schritt(&mut k, 100.0, 100.0, 0);
        assert_eq!(zustand(&mut k, c), (true, false, false));
        // gleiches Ereignis in zwei Takten: Kante nur im ersten
        schritt(&mut k, 100.0, 100.0, 1);
        schritt(&mut k, 100.0, 100.0, 1);
        assert_eq!(zustand(&mut k, c), (true, true, false));
        // inaktiv: alles nein, kein Ziel; unsichtbar: kein Ziel
        setze(&mut k, c, "Taster", "aktiv", 0.0);
        schritt(&mut k, 100.0, 100.0, 0);
        assert_eq!(zustand(&mut k, c), (false, false, false));
        setze(&mut k, c, "Taster", "aktiv", 1.0);
        k.teil_setze(t, tf::SICHTBAR, 0.0);
        k.takt();
        assert_eq!(zustand(&mut k, c), (false, false, false));
    }

    #[test]
    fn oberstes_element_gewinnt() {
        let mut k = welt();
        let a = teil(&mut k, 100.0, 100.0);
        let ca = an(&mut k, "Taster", a);
        let b = teil(&mut k, 120.0, 100.0);
        let cb = an(&mut k, "Taster", b);
        schritt(&mut k, 110.0, 100.0, 0);
        // gleiche Ebene → höhere ID
        assert_eq!((zustand(&mut k, ca).0, zustand(&mut k, cb).0), (false, true));
        // höhere Ebene schlägt höhere ID
        k.teil_setze(a, tf::EBENE, 1.0);
        k.takt();
        assert_eq!((zustand(&mut k, ca).0, zustand(&mut k, cb).0), (true, false));
        // eine Tafel darüber verdeckt beide; ein Kind der Tafel (höhere ID) liegt wieder darüber
        let f = teil(&mut k, 110.0, 100.0);
        k.teil_setze(f, tf::EBENE, 1.0);
        an(&mut k, "Tafel", f);
        k.takt();
        assert_eq!((zustand(&mut k, ca).0, zustand(&mut k, cb).0), (false, false));
        let kind = teil(&mut k, 0.0, 0.0);
        k.teil_setze(kind, tf::EBENE, 1.0);
        k.teil_haenge(kind, f);
        let ck = an(&mut k, "Taster", kind);
        k.takt();
        assert!(zustand(&mut k, ck).0);
        // eine Leiste ist kein Ziel
        let l = teil(&mut k, 110.0, 100.0);
        k.teil_setze(l, tf::EBENE, 9.0);
        an(&mut k, "Leiste", l);
        k.takt();
        assert!(zustand(&mut k, ck).0);
        assert_eq!(k.welt.as_ref().unwrap().eingabe.treffer, kind as u32);
    }

    #[test]
    fn gedreht_skaliert_hud_und_welt() {
        let mut k = welt();
        // 90° gedreht, 100 × 20: senkrecht 100 hoch
        let t = teil(&mut k, 200.0, 200.0);
        k.teil_setze(t, tf::DREHUNG, 90.0);
        let c = an(&mut k, "Taster", t);
        setze(&mut k, c, "Taster", "breite", 100.0);
        setze(&mut k, c, "Taster", "hoehe", 20.0);
        schritt(&mut k, 200.0, 245.0, 0);
        assert!(zustand(&mut k, c).0);
        schritt(&mut k, 245.0, 200.0, 0);
        assert!(!zustand(&mut k, c).0);
        // Größe 2: doppelt so breit; Größe 0 → kein Treffer
        k.teil_setze(t, tf::DREHUNG, 0.0);
        k.teil_groesse(t, 2.0, 2.0, 1.0);
        schritt(&mut k, 295.0, 200.0, 0);
        assert!(zustand(&mut k, c).0);
        k.teil_groesse(t, 0.0, 0.0, 1.0);
        k.takt();
        assert!(!zustand(&mut k, c).0);
        k.teil_groesse(t, 1.0, 1.0, 1.0);
        // Blick bei (1200, 200), zoom 2: Welt-Taster bei (1200, 200) liegt in der Spielfeldmitte; HUD-Taster in Spielfeld-Koordinaten
        k.teil_lage(t, 1200.0, 200.0, 0.0);
        let b = teil(&mut k, 1200.0, 200.0);
        let cb = an(&mut k, "Blick", b);
        setze(&mut k, cb, "Blick", "zoom", 2.0);
        let h = teil(&mut k, 320.0, 180.0);
        k.teil_setze(h, tf::EBENE, 1000.0);
        let ch = an(&mut k, "Taster", h);
        setze(&mut k, ch, "Taster", "breite", 20.0);
        setze(&mut k, ch, "Taster", "hoehe", 20.0);
        schritt(&mut k, 320.0, 180.0, 0);
        assert!(zustand(&mut k, ch).0, "HUD liegt oben (Ebene 1000)");
        schritt(&mut k, 320.0, 196.0, 0); // Welt (1200, 208): im Taster (100 × 20, bis 210), außerhalb des HUD-Tasters (bis 190)
        assert!(zustand(&mut k, c).0 && !zustand(&mut k, ch).0);
        schritt(&mut k, 320.0, 224.0, 0); // Welt (1200, 222): außerhalb
        assert!(!zustand(&mut k, c).0);
        // festAb 2000: der HUD-Taster liegt jetzt in der Welt (bei Welt (320, 180), weit weg)
        setze(&mut k, cb, "Blick", "festAb", 2000.0);
        schritt(&mut k, 320.0, 180.0, 0);
        assert!(!zustand(&mut k, ch).0 && zustand(&mut k, c).0);
    }

    #[test]
    fn regler_ziehen_klemmen_geaendert() {
        let mut k = welt();
        let t = teil(&mut k, 200.0, 100.0);
        let c = an(&mut k, "Regler", t);
        setze(&mut k, c, "Regler", "von", 10.0);
        setze(&mut k, c, "Regler", "bis", 30.0);
        assert_eq!(hole(&mut k, c, "Regler", "wert"), 0.5);
        // Knauf überragt die Schiene: Trefferfläche bis 80 + 10 links/rechts, ±10 senkrecht
        schritt(&mut k, 110.0, 108.0, 1); // links außerhalb der Schiene → Anteil 0
        assert_eq!((hole(&mut k, c, "Regler", "wert"), hole(&mut k, c, "Regler", "geaendert")), (10.0, 1.0));
        schritt(&mut k, 240.0, 300.0, 1); // weit weg, noch gehalten: Anteil 0.75
        assert_eq!((hole(&mut k, c, "Regler", "wert"), hole(&mut k, c, "Regler", "geaendert")), (25.0, 1.0));
        schritt(&mut k, 240.0, 300.0, 1);
        assert_eq!(hole(&mut k, c, "Regler", "geaendert"), 0.0);
        schritt(&mut k, 400.0, 300.0, 0); // losgelassen: keine Änderung mehr
        assert_eq!(hole(&mut k, c, "Regler", "wert"), 25.0);
        // rückwärts (bis < von) und Größe 2
        setze(&mut k, c, "Regler", "von", 1.0);
        setze(&mut k, c, "Regler", "bis", 0.0);
        k.teil_groesse(t, 2.0, 2.0, 1.0);
        schritt(&mut k, 360.0, 100.0, 1); // lokal x = 80 → Anteil 1 → wert 0
        assert_eq!(hole(&mut k, c, "Regler", "wert"), 0.0);
        schritt(&mut k, 200.0, 100.0, 1);
        assert_eq!(hole(&mut k, c, "Regler", "wert"), 0.5);
        schritt(&mut k, 200.0, 100.0, 0);
        // Bild: Schiene + Knauf; vom Programm gesetzter Wert außerhalb → Knauf am Rand
        setze(&mut k, c, "Regler", "wert", 7.0);
        k.bild(1);
        let i = inst(&k);
        assert_eq!(i.len(), 2);
        assert_eq!((i[0].2, i[1].2), (flach_art::RECHTECK, flach_art::KREIS));
        assert_eq!((i[1].0[4], i[1].0[5]), (40.0, 100.0)); // Anteil 0 bei von 1, bis 0 und wert 7 → links (200 − 2 · 80)
    }

    #[test]
    fn tafel_ziehen_mit_kindern_und_eltern() {
        let mut k = welt();
        let e = teil(&mut k, 100.0, 100.0);
        k.teil_groesse(e, 2.0, 2.0, 1.0);
        let f = teil(&mut k, 50.0, 50.0); // Welt (200, 200), 480 × 320
        k.teil_haenge(f, e);
        let cf = an(&mut k, "Tafel", f);
        let kind = teil(&mut k, 0.0, 40.0);
        k.teil_haenge(kind, f);
        an(&mut k, "Leiste", kind);
        // nicht ziehbar: bleibt
        schritt(&mut k, 200.0, 200.0, 1);
        schritt(&mut k, 260.0, 220.0, 1);
        schritt(&mut k, 260.0, 220.0, 0);
        assert_eq!((k.teil_hole(f, tf::X), k.teil_hole(f, tf::Y)), (50.0, 50.0));
        setze(&mut k, cf, "Tafel", "ziehbar", 1.0);
        schritt(&mut k, 200.0, 200.0, 1);
        schritt(&mut k, 260.0, 220.0, 1);
        schritt(&mut k, 300.0, 180.0, 1);
        schritt(&mut k, 500.0, 500.0, 0); // losgelassen: zieht nicht mehr
        // Welt-Verschiebung (100, −20) → im Raum der Eltern (Größe 2) die Hälfte
        assert_eq!((k.teil_hole(f, tf::X), k.teil_hole(f, tf::Y)), (100.0, 40.0));
        assert_eq!((k.teil_hole(kind, tf::WELT_X), k.teil_hole(kind, tf::WELT_Y)), (300.0, 260.0));
    }

    #[test]
    fn bildbeitraege() {
        let mut k = welt();
        let t = teil(&mut k, 100.0, 50.0);
        let c = an(&mut k, "Taster", t);
        let ti = feld(&mut k, 27, "inhalt");
        assert_eq!(k.setze_text(c, ti, "Go".as_bytes()), 0);
        let l = teil(&mut k, 320.0, 300.0);
        let cl = an(&mut k, "Leiste", l);
        setze(&mut k, cl, "Leiste", "wert", 0.25);
        k.bild(1);
        let i = inst(&k);
        // Taster: Rechteck in kruste, 2 Glyphen in weiß, senkrecht um die Mitte; Leiste: Grund (grau) + Füllung (basilikum) links
        assert_eq!(i.len(), 5);
        assert_eq!((i[0].1, i[0].2), (crate::farbe::lies("kruste").unwrap(), flach_art::RECHTECK));
        assert_eq!((i[0].0[6], i[0].0[7]), (60.0, 18.0));
        assert!(i[1].2 == flach_art::GLYPHE && i[2].2 == flach_art::GLYPHE && i[1].1 == crate::farbe::WEISS);
        let (oben, unten) = (i[1].0[5] - i[1].0[7], i[1].0[5] + i[1].0[7]);
        assert!(oben > 50.0 - 18.0 && unten < 50.0 + 18.0 && (oben + unten) * 0.5 > 40.0 && (oben + unten) * 0.5 < 60.0, "{} {}", oben, unten);
        assert_eq!((i[3].1, i[3].0[4], i[3].0[6]), (crate::farbe::lies("grau").unwrap(), 320.0, 80.0));
        assert_eq!((i[4].1, i[4].0[4], i[4].0[6]), (crate::farbe::lies("basilikum").unwrap(), 260.0, 20.0));
        // drueber → farbeDrueber, gedrueckt → farbeGedrueckt, inaktiv → halbe Deckkraft
        schritt(&mut k, 100.0, 50.0, 0);
        k.bild(2);
        assert_eq!(inst(&k)[0].1, crate::farbe::lies("senf").unwrap());
        schritt(&mut k, 100.0, 50.0, 1);
        k.bild(3);
        assert_eq!(inst(&k)[0].1, crate::farbe::lies("tomate").unwrap());
        setze(&mut k, c, "Taster", "aktiv", 0.0);
        k.bild(4);
        assert_eq!(inst(&k)[0].1, crate::farbe::lies("kruste").unwrap() & !0xFF | 0x7F);
        // Leiste leer → nur der Grund; Tafel mit Titel → Fläche + Glyphen
        setze(&mut k, cl, "Leiste", "wert", 0.0);
        let f = teil(&mut k, 320.0, 180.0);
        let cf = an(&mut k, "Tafel", f);
        let ft = feld(&mut k, 30, "titel");
        k.setze_text(cf, ft, "Ab".as_bytes());
        k.bild(5);
        let i = inst(&k);
        assert_eq!(i.len(), 3 + 1 + 3);
        assert_eq!((i[4].1, i[4].0[6], i[4].0[7]), (0x2f2a26e0, 120.0, 80.0));
        assert!(i[5].0[4] < 320.0 - 100.0 && i[5].0[5] < 180.0 - 50.0, "Titel oben links");
    }
}

/// H-K13: der Kern kennt keine Kniffe – nur das Lesefeld `RUHT` (19) für die Laufzeiten und `kniffe` in `teil_methoden`
mod hk13 {
    use super::*;

    #[test]
    fn ruht_als_lesefeld() {
        let mut k = welt();
        let (vo, ku) = (typ(&mut k, "Vorlage"), typ(&mut k, "Kulisse"));
        let a = k.teil_neu(2);
        let b = k.teil_neu(2);
        assert_eq!(k.teil_haenge(b, a), 0);
        let c = k.teil_neu(3);
        assert_eq!((k.teil_hole(a, tf::RUHT), k.teil_hole(b, tf::RUHT), k.teil_hole(c, tf::RUHT)), (0.0, 0.0, 0.0));
        // Vorlage an a: a und das Kind b ruhen; Lesen ändert den Hash nicht
        let v = k.komp_neu(vo);
        assert_eq!(k.komp_haenge(v, a), 0);
        let h0 = k.hash_szene();
        assert_eq!((k.teil_hole(a, tf::RUHT), k.teil_hole(b, tf::RUHT)), (1.0, 1.0));
        assert_eq!(k.hash_szene(), h0);
        assert_eq!(k.komp_loese(v), 0);
        assert_eq!((k.teil_hole(a, tf::RUHT), k.teil_hole(b, tf::RUHT)), (0.0, 0.0));
        // ausgeschaltete Kulisse (3D), sofort nachgeführt nach setze_zahl
        let kc = k.komp_neu(ku);
        assert_eq!(k.komp_haenge(kc, c), 0);
        assert_eq!(k.teil_hole(c, tf::RUHT), 0.0);
        let fa = feld(&mut k, ku, "aktiv");
        assert_eq!(k.setze_zahl(kc, fa, 0.0), 0);
        assert_eq!(k.teil_hole(c, tf::RUHT), 1.0);
        // nur lesen; entfernt → Fehler wie alle Lage-Felder
        assert!(k.teil_setze(c, tf::RUHT, 0.0) < 0);
        k.fehler_neu();
        assert_eq!(k.teil_entferne(b), 0);
        assert!(k.teil_hole(b, tf::RUHT).is_nan());
        k.fehler_neu();
        assert!(TEIL_METHODEN.contains(&"kniffe"));
    }
}

/// Viele Lichter (Clustered Forward): Abschnitt LICHTER nur bei mehr als 8 Lichtern oder einem Spot; Zellen konservativ.
mod viele_lichter {
    use super::*;
    use crate::lichter::{LICHTER_KOPF_BYTES, LICHT_BYTES, MAX_JE_ZELLE};

    struct N {
        l: i32,
        rw: i32,
        st: i32,
        kegel: i32,
        rand: i32,
    }
    fn nummern(k: &mut Kern) -> N {
        let l = typ(k, "Licht");
        N { l, rw: feld(k, l, "reichweite"), st: feld(k, l, "staerke"), kegel: feld(k, l, "kegel"), rand: feld(k, l, "kegelRand") }
    }
    fn licht(k: &mut Kern, n: &N, x: f64, y: f64, z: f64, rw: f64) -> i32 {
        let t = k.teil_neu(3);
        k.teil_lage(t, x, y, z);
        let c = k.komp_neu(n.l);
        assert_eq!(k.setze_zahl(c, n.rw, rw), 0);
        assert_eq!(k.komp_haenge(c, t), 0);
        c
    }
    fn abschnitt_lichter(k: &Kern) -> Option<Vec<u8>> {
        Leser::neu(k.paket()).unwrap().abschnitte().find(|(a, _)| *a == abschnitt::LICHTER).map(|(_, d)| d.to_vec())
    }
    fn f(d: &[u8], o: usize) -> f32 {
        f32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }
    fn u(d: &[u8], o: usize) -> u32 {
        u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }
    fn z4(s: u32) -> [f64; 4] {
        let mut st = s.wrapping_mul(2_654_435_761) | 1;
        let z = &mut st;
        [crate::komponenten::partikel::zufall(z), crate::komponenten::partikel::zufall(z), crate::komponenten::partikel::zufall(z), crate::komponenten::partikel::zufall(z)]
    }

    #[test]
    fn schema_nachtrag_und_schwelle() {
        let mut k = welt();
        let n = nummern(&mut k);
        let mut c = Vec::new();
        for i in 0..8 {
            c.push(licht(&mut k, &n, i as f64 - 4.0, 1.0, 0.0, 5.0));
        }
        // Standardwerte der Nachtragsfelder ändern den Hash nicht, 8 Lichter → kein Abschnitt (Paket wie v1)
        k.bild(1);
        k.bild(1);
        let h = k.hash_szene();
        let p = k.paket().to_vec();
        assert!(abschnitt_lichter(&k).is_none());
        assert_eq!(k.setze_zahl(c[0], n.kegel, 0.0), 0);
        assert_eq!(k.setze_zahl(c[0], n.rand, 0.25), 0);
        k.bild(1);
        assert_eq!((k.hash_szene(), k.paket()), (h, &p[..]));
        assert!(k.setze_zahl(c[0], n.kegel, 91.0) < 0);
        assert_eq!(k.fehler_text(), "Licht.kegel muss zwischen 0 und 90 liegen, nicht 91.");
        // ein Spot → Abschnitt (alle 8, sichtbar); Hash ändert sich
        assert_eq!(k.setze_zahl(c[3], n.kegel, 30.0), 0);
        k.bild(2);
        assert_ne!(k.hash_szene(), h);
        let d = abschnitt_lichter(&k).expect("Spot → LICHTER");
        assert_eq!(u(&d, LICHTER_KOPF_BYTES), 8);
        assert_eq!(f(&d, 12), 8.0);
        assert_eq!(k.setze_zahl(c[3], n.kegel, 0.0), 0);
        k.bild(3);
        assert!(abschnitt_lichter(&k).is_none());
        // Stärke 0 zählt nicht: 9 Lichter, eines aus → kein Abschnitt; an → Abschnitt mit 9
        let neun = licht(&mut k, &n, 0.0, 3.0, 0.0, 5.0);
        assert_eq!(k.setze_zahl(neun, n.st, 0.0), 0);
        k.bild(4);
        assert!(abschnitt_lichter(&k).is_none());
        assert_eq!(k.setze_zahl(neun, n.st, 2.0), 0);
        k.bild(5);
        let d = abschnitt_lichter(&k).unwrap();
        assert_eq!(u(&d, LICHTER_KOPF_BYTES), 9);
        // nächstes Licht zuerst: Kamera (0, 3, 8) → (0, 3, 0) ist am nächsten
        let l0 = LICHTER_KOPF_BYTES + 8;
        assert_eq!((f(&d, l0), f(&d, l0 + 4), f(&d, l0 + 8), f(&d, l0 + 12)), (0.0, 3.0, 0.0, 5.0));
        // Farbe linear × Stärke (weiss × 2), Punktlicht: cos außen −2, innen −1.5
        assert_eq!((f(&d, l0 + 16), f(&d, l0 + 28), f(&d, l0 + 44)), (2.0, -2.0, -1.5));
    }

    #[test]
    fn spot_richtung_und_kegel() {
        let mut k = welt();
        let n = nummern(&mut k);
        let c = licht(&mut k, &n, 0.0, 6.0, 0.0, 10.0);
        assert_eq!(k.setze_zahl(c, n.kegel, 60.0), 0);
        assert_eq!(k.setze_zahl(c, n.rand, 0.5), 0);
        k.bild(1);
        let d = abschnitt_lichter(&k).unwrap();
        let l0 = LICHTER_KOPF_BYTES + 8;
        // −z des Teils (ungedreht) = (0, 0, −1); cos 60° = 0.5, innen cos 30°
        assert_eq!((f(&d, l0 + 32), f(&d, l0 + 36), f(&d, l0 + 40)), (0.0, 0.0, -1.0));
        assert!((f(&d, l0 + 28) - 0.5).abs() < 1e-6);
        assert!((f(&d, l0 + 44) - (3.0f32).sqrt() / 2.0).abs() < 1e-6);
        assert_eq!(LICHT_BYTES, 48);
    }

    /// Jeder Weltpunkt im Wirkbereich eines Lichts liegt in einer Zelle, die das Licht führt (Zelle wie im Shader gesucht).
    #[test]
    fn zellen_konservativ() {
        let mut k = welt();
        let n = nummern(&mut k);
        k.teil_lage(1, 1.0, 4.0, 12.0);
        k.teil_schaue(1, -2.0, 0.0, -5.0);
        for i in 0..300u32 {
            let z = z4(i + 1);
            licht(&mut k, &n, (z[0] - 0.5) * 40.0, z[1] * 4.0, (z[2] - 0.5) * 50.0 - 5.0, 0.5 + z[3] * 5.0);
        }
        k.bild(1);
        let d = abschnitt_lichter(&k).unwrap();
        let p = k.paket().to_vec();
        let sz = Leser::neu(&p).unwrap().abschnitte().find(|(a, _)| *a == abschnitt::SZENE).unwrap().1.to_vec();
        let vp: Vec<f64> = (0..16).map(|i| f(&sz, i * 4) as f64).collect();
        let kam = [f(&sz, 128) as f64, f(&sz, 132) as f64, f(&sz, 136) as f64];
        let (nx, ny, nz) = (f(&d, 0) as usize, f(&d, 4) as usize, f(&d, 8) as usize);
        assert_eq!((nx, ny, nz), (16, 9, 24));
        let (nah, je) = (f(&d, 16) as f64, f(&d, 20) as f64);
        let vorn = [f(&d, 32) as f64, f(&d, 36) as f64, f(&d, 40) as f64];
        let anzahl = u(&d, LICHTER_KOPF_BYTES) as usize;
        assert!(anzahl > 100 && anzahl <= 300, "{}", anzahl);
        let l0 = LICHTER_KOPF_BYTES + 8;
        let w0 = l0 + anzahl * LICHT_BYTES;
        let wort = |i: usize| u(&d, w0 + i * 4);
        let mut geprueft = 0;
        for li in 0..anzahl {
            let o = l0 + li * LICHT_BYTES;
            let (lx, ly, lz, rw) = (f(&d, o) as f64, f(&d, o + 4) as f64, f(&d, o + 8) as f64, f(&d, o + 12) as f64);
            for s in 0..64u32 {
                let z = z4(s * 977 + li as u32 * 13 + 5);
                // Punkt in der Kugel (bis 0.98 · Reichweite)
                let (dx, dy, dz) = ((z[0] - 0.5) * 2.0, (z[1] - 0.5) * 2.0, (z[2] - 0.5) * 2.0);
                let l = (dx * dx + dy * dy + dz * dz).sqrt();
                if l > 1.0 {
                    continue;
                }
                let q = [lx + dx * rw * 0.98, ly + dy * rw * 0.98, lz + dz * rw * 0.98];
                let clip = |r: usize| vp[r] * q[0] + vp[4 + r] * q[1] + vp[8 + r] * q[2] + vp[12 + r];
                let w = clip(3);
                if w <= nah {
                    continue;
                }
                let (ndx, ndy) = (clip(0) / w, clip(1) / w);
                if ndx.abs() > 1.0 || ndy.abs() > 1.0 {
                    continue;
                }
                let tief = (q[0] - kam[0]) * vorn[0] + (q[1] - kam[1]) * vorn[1] + (q[2] - kam[2]) * vorn[2];
                let fx = (ndx * 0.5 + 0.5) * nx as f64;
                let fy = (ndy * 0.5 + 0.5) * ny as f64;
                let fs = (tief.max(nah) / nah).ln() * je;
                // Grenzen zwischen Zellen (f32-Rundung) auslassen
                let nahe = |v: f64| (v - v.round()).abs() < 1e-3;
                if nahe(fx) || nahe(fy) || nahe(fs) {
                    continue;
                }
                let tx = (fx.floor() as usize).min(nx - 1);
                let ty = (fy.floor() as usize).min(ny - 1);
                let sl = (fs.floor().max(0.0) as usize).min(nz - 1);
                let kopf = wort((sl * ny + ty) * nx + tx);
                let (erst, zahl) = ((kopf >> 8) as usize, (kopf & 255) as usize);
                if zahl == MAX_JE_ZELLE {
                    continue;
                }
                assert!((0..zahl).any(|j| wort(erst + j) as usize == li), "Licht {} fehlt in Zelle ({}, {}, {})", li, tx, ty, sl);
                geprueft += 1;
            }
        }
        assert!(geprueft > 2000, "{}", geprueft);
    }
}

/// Stimmung (HDR, Bloom, Tonkurve, Höhennebel) und Koerper/Belag.strahlen.
mod stimmung {
    use super::*;
    use crate::komponenten::stimmung::STIMMUNG_BYTES;

    fn abschnitt_stimmung(k: &Kern) -> Option<Vec<u8>> {
        Leser::neu(k.paket()).unwrap().abschnitte().find(|(a, _)| *a == abschnitt::STIMMUNG).map(|(_, d)| d.to_vec())
    }
    fn f(d: &[u8], o: usize) -> f32 {
        f32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }

    #[test]
    fn schema_und_abschnitt() {
        let mut k = welt();
        let s = typ(&mut k, "Stimmung");
        assert_eq!(s, 31); // Typnummer in Merge-Reihenfolge: nach Tafel (30, H-K12)
        assert_eq!(ARTEN[s as usize - 1].schema.oeffentliche(), 18); // + spiegelGuete (H-K21), verdeckung, verdeckungWeite, bildspiegel (H-K24)
        let bel = feld(&mut k, s, "belichtung");
        let bloom = feld(&mut k, s, "bloom");
        let nd = feld(&mut k, s, "nebelDichte");
        let nf = feld(&mut k, s, "nebelFarbe");
        // 2D-Teil: Fehler; ohne/lose → kein Abschnitt, Paket byte-gleich
        let t2 = k.teil_neu(2);
        let c = k.komp_neu(s);
        assert!(k.komp_haenge(c, t2) < 0);
        assert_eq!(k.fehler_text(), "Stimmung gibt es nur für 3D-Teile.");
        k.bild(1);
        k.bild(2);
        let ohne = k.paket().to_vec();
        assert!(abschnitt_stimmung(&k).is_none());
        k.bild(2);
        assert_eq!(k.paket(), &ohne[..]);
        assert!(k.setze_zahl(c, bloom, 5.0) < 0);
        assert_eq!(k.fehler_text(), "Stimmung.bloom muss zwischen 0 und 4 liegen, nicht 5.");
        // angehängt: Abschnitt mit den Werten (fern der Kamera 500, Zeit = Bild/60, an = 1)
        let t = k.teil_neu(3);
        assert_eq!(k.setze_zahl(c, bel, 2.0), 0);
        assert_eq!(k.setze_zahl(c, bloom, 0.5), 0);
        assert_eq!(k.setze_zahl(c, nd, 0.25), 0);
        assert_eq!(k.setze_text(c, nf, b"#ffffff"), 0);
        assert_eq!(k.komp_haenge(c, t), 0);
        k.bild(3);
        let d = abschnitt_stimmung(&k).expect("Stimmung → Abschnitt");
        assert_eq!(d.len(), STIMMUNG_BYTES);
        assert_eq!((f(&d, 0), f(&d, 4), f(&d, 8), f(&d, 12)), (2.0, 0.5, 1.0, 0.7));
        assert_eq!((f(&d, 16), f(&d, 24), f(&d, 28)), (0.25, 0.25, 500.0));
        assert_eq!((f(&d, 32), f(&d, 44)), (1.0, 1.0));
        assert_eq!((f(&d, 56), f(&d, 60)), (3.0 / 60.0, 1.0));
        // Spiegelung (Standard aus) → spiegel-Vektor 0; gesetzt → Stärke und Höhe
        assert_eq!((f(&d, 64), f(&d, 68)), (0.0, 0.0));
        let (sp, sh) = (feld(&mut k, s, "spiegelung"), feld(&mut k, s, "spiegelHoehe"));
        assert_eq!(k.setze_zahl(c, sp, 0.75), 0);
        assert_eq!(k.setze_zahl(c, sh, 0.15), 0);
        k.bild(3);
        let d = abschnitt_stimmung(&k).unwrap();
        assert_eq!((f(&d, 64), f(&d, 68), f(&d, 72)), (0.75, 0.15, 0.0));
        assert!(k.setze_zahl(c, sp, 1.5) < 0);
        // zweite Stimmung mit größerer ID gilt nicht; die erste in einer Vorlage ruht → die zweite gilt
        let t2 = k.teil_neu(3);
        let c2 = k.komp_neu(s);
        assert_eq!(k.setze_zahl(c2, bel, 3.0), 0);
        assert_eq!(k.komp_haenge(c2, t2), 0);
        k.bild(4);
        assert_eq!(f(&abschnitt_stimmung(&k).unwrap(), 0), 2.0);
        let v = typ(&mut k, "Vorlage");
        let cv = k.komp_neu(v);
        assert_eq!(k.komp_haenge(cv, t), 0);
        k.bild(5);
        assert_eq!(f(&abschnitt_stimmung(&k).unwrap(), 0), 3.0);
        k.teil_entferne(t2);
        k.bild(6);
        assert!(abschnitt_stimmung(&k).is_none());
    }

    #[test]
    fn strahlen_nachtrag() {
        let mut k = welt();
        let kt = typ(&mut k, "Koerper");
        let bt = typ(&mut k, "Belag");
        let (form, le, st, belag) = (feld(&mut k, kt, "form"), feld(&mut k, kt, "leuchten"), feld(&mut k, kt, "strahlen"), feld(&mut k, kt, "belag"));
        let (ble, bst) = (feld(&mut k, bt, "leuchten"), feld(&mut k, bt, "strahlen"));
        let w = k.form_grund(1, 0.0, 0.0);
        let t = k.teil_neu(3);
        let c = k.komp_neu(kt);
        assert_eq!(k.setze_zahl(c, form, w as f64), 0);
        assert_eq!(k.setze_zahl(c, le, 0.5), 0);
        assert_eq!(k.komp_haenge(c, t), 0);
        k.bild(1);
        k.bild(2);
        let (h, p) = (k.hash_szene(), k.paket().to_vec());
        assert_eq!(k.setze_zahl(c, st, 1.0), 0);
        k.bild(2);
        assert_eq!((k.hash_szene(), k.paket()), (h, &p[..]));
        assert_eq!(material_3d(&k)[0].2, 0.5);
        assert_eq!(k.setze_zahl(c, st, 4.0), 0);
        k.bild(3);
        assert_eq!(material_3d(&k)[0].2, 2.0);
        assert!(k.setze_zahl(c, st, -1.0) < 0);
        // Belag: dessen leuchten × strahlen
        let bt_teil = k.teil_neu(3);
        let b = k.komp_neu(bt);
        assert_eq!(k.setze_zahl(b, ble, 1.0), 0);
        assert_eq!(k.setze_zahl(b, bst, 8.0), 0);
        assert_eq!(k.komp_haenge(b, bt_teil), 0);
        assert_eq!(k.setze_zahl(c, belag, bt_teil as f64), 0);
        k.bild(4);
        assert_eq!(material_3d(&k)[0].2, 8.0);
    }
}

/// Material-Zusatz (Belag: relief, kachel, abbildung, modell, metall, nass) → Abschnitt ZUSATZ3D parallel zu INST3D.
mod material {
    use super::*;
    use crate::paket::ZUSATZ3D_BYTES;

    fn zusatz(k: &Kern) -> Option<Vec<[u32; 4]>> {
        let l = Leser::neu(k.paket()).unwrap();
        let (_, d) = l.abschnitte().find(|(a, _)| *a == abschnitt::ZUSATZ3D)?;
        Some(d.chunks_exact(ZUSATZ3D_BYTES).map(|c| [0, 4, 8, 12].map(|o| u32::from_le_bytes([c[o], c[o + 1], c[o + 2], c[o + 3]]))).collect())
    }

    #[test]
    fn zusatz_nur_bei_nutzung_und_parallel() {
        let mut k = welt();
        let kt = typ(&mut k, "Koerper");
        let bt = typ(&mut k, "Belag");
        let (form, belag, farbe) = (feld(&mut k, kt, "form"), feld(&mut k, kt, "belag"), feld(&mut k, kt, "farbe"));
        let (relief, kachel, abb, modell, metall, nass) =
            (feld(&mut k, bt, "relief"), feld(&mut k, bt, "kachel"), feld(&mut k, bt, "abbildung"), feld(&mut k, bt, "modell"), feld(&mut k, bt, "metall"), feld(&mut k, bt, "nass"));
        let w = k.form_grund(1, 0.0, 0.0);
        let kg = k.form_grund(2, 12.0, 0.0);
        let bt_teil = k.teil_neu(3);
        let b = k.komp_neu(bt);
        assert_eq!(k.komp_haenge(b, bt_teil), 0);
        // drei Körper: Würfel mit Belag, Kugel ohne, Würfel ohne (andere Netze/Reihenfolge)
        let mut koerper = Vec::new();
        for (i, f) in [w, kg, w].iter().enumerate() {
            let t = k.teil_neu(3);
            k.teil_lage(t, i as f64 * 2.0 - 2.0, 0.5, 0.0);
            let c = k.komp_neu(kt);
            assert_eq!(k.setze_zahl(c, form, *f as f64), 0);
            assert_eq!(k.setze_text(c, farbe, b"#ff0000"), 0);
            assert_eq!(k.komp_haenge(c, t), 0);
            koerper.push(c);
        }
        assert_eq!(k.setze_zahl(koerper[0], belag, bt_teil as f64), 0);
        k.bild(1);
        k.bild(2);
        let (h, p) = (k.hash_szene(), k.paket().to_vec());
        assert!(zusatz(&k).is_none(), "Standardwerte → kein Abschnitt");
        // Standardwerte gesetzt: Hash und Paket unverändert (Nachtragsfelder)
        assert_eq!(k.setze_zahl(b, kachel, 0.0), 0);
        assert_eq!(k.setze_text(b, abb, b"uv"), 0);
        assert_eq!(k.setze_text(b, modell, b"klassisch"), 0);
        k.bild(2);
        assert_eq!((k.hash_szene(), k.paket()), (h, &p[..]));
        assert!(k.setze_text(b, modell, b"phong") < 0);
        assert_eq!(k.fehler_text(), "Belag.modell kennt 'phong' nicht. Erlaubt: klassisch, pbr.");
        assert!(k.setze_zahl(b, nass, 1.5) < 0);
        // pbr, Welt-Abbildung, Kachel 2.5, Metall 0.25, nass 1 → Zusatz nur beim Körper mit Belag, Reihenfolge wie INST3D
        assert_eq!(k.setze_text(b, modell, b"pbr"), 0);
        assert_eq!(k.setze_text(b, abb, b"welt"), 0);
        assert_eq!(k.setze_zahl(b, kachel, 2.5), 0);
        assert_eq!(k.setze_zahl(b, metall, 0.25), 0);
        assert_eq!(k.setze_zahl(b, nass, 1.0), 0);
        k.bild(3);
        assert_ne!(k.hash_szene(), h);
        let z = zusatz(&k).expect("Material → ZUSATZ3D");
        assert_eq!(z.len(), 3);
        // INST3D-Reihenfolge: Netz aufsteigend (Würfel vor Kugel), dann Teil-ID → Instanz 0 = Körper mit Belag
        assert_eq!(z[0], [0, 2.5f32.to_bits(), 0.25f32.to_bits(), 1 | 2 | 255 << 8]);
        assert_eq!(z[1], [0; 4]);
        assert_eq!(z[2], [0; 4]);
        // Relief aus einem Atlas-Bildchen gilt nicht (0), aus einem Teigling: Kennwort wie INST3D.textur (Bit 16 + 17)
        let zeilen = |z: &[&str]| -> Vec<u8> { z.iter().flat_map(|t| (t.len() as u32).to_le_bytes().into_iter().chain(t.bytes())).collect() };
        let atlas = k.bildchen_neu(&zeilen(&["ab", "ba"]), &zeilen(&["a", "#ff0000", "b", "#00ff00"]));
        assert!(atlas > 0);
        assert_eq!(k.setze_zahl(b, relief, atlas as f64), 0);
        k.bild(4);
        assert_eq!(zusatz(&k).unwrap()[0][0], 0);
        let eigen = k.bildchen_teigling(&crate::teigling::tests::teigling(64, 64, 0));
        assert!(eigen > 0);
        assert_eq!(k.setze_zahl(b, relief, eigen as f64), 0);
        k.bild(5);
        let r = zusatz(&k).unwrap()[0][0];
        assert_eq!(r & (1 << 16 | 1 << 17), 1 << 16 | 1 << 17);
        // Belag gelöst → wieder ohne Abschnitt
        assert_eq!(k.setze_zahl(koerper[0], belag, 0.0), 0);
        k.bild(6);
        assert!(zusatz(&k).is_none());
    }
}

/// Regen: Funken-Nachtragsfelder (streckung, licht, volumen, aufschlag/boden/spritzer, regen) und Stimmung.regen.
mod regen {
    use super::*;
    use crate::paket::ZUSATZ_TEILCHEN_BYTES;

    fn zusatz(k: &Kern) -> Option<Vec<([f32; 3], u32)>> {
        let l = Leser::neu(k.paket()).unwrap();
        let (_, d) = l.abschnitte().find(|(a, _)| *a == abschnitt::ZUSATZ_TEILCHEN)?;
        let f = |c: &[u8], o: usize| f32::from_le_bytes([c[o], c[o + 1], c[o + 2], c[o + 3]]);
        Some(d.chunks_exact(ZUSATZ_TEILCHEN_BYTES).map(|c| ([f(c, 0), f(c, 4), f(c, 8)], u32::from_le_bytes([c[12], c[13], c[14], c[15]]))).collect())
    }

    /// Strahl nach unten aus (0, 3, 0), ohne Streuung und Schwerkraft; Kamera schaut von der Seite.
    fn strahl(k: &mut Kern) -> (i32, i32, i32) {
        let fu = typ(k, "Funken");
        k.teil_lage(1, 0.0, 1.5, 12.0);
        k.teil_schaue(1, 0.0, 1.5, 0.0);
        let t = k.teil_neu(3);
        k.teil_lage(t, 0.0, 3.0, 0.0);
        let c = k.komp_neu(fu);
        for (n, v) in [("rate", 60.0), ("lebensdauer", 2.0), ("tempo", 10.0), ("richtungY", -1.0), ("streuung", 0.0), ("groesse", 0.2), ("groesseEnde", 0.2)] {
            let f = feld(k, fu, n);
            assert_eq!(k.setze_zahl(c, f, v), 0, "{}", n);
        }
        assert_eq!(k.komp_haenge(c, t), 0);
        (fu, t, c)
    }

    #[test]
    fn standard_byte_gleich_ohne_zusatz() {
        let lauf = |setzen: bool| {
            let mut k = welt();
            let (fu, _, c) = strahl(&mut k);
            if setzen {
                for (n, v) in [("streckung", 0.0), ("licht", 0.0), ("volumen", 0.0), ("aufschlag", 0.0), ("boden", 0.0), ("spritzer", 3.0), ("regen", 0.0)] {
                    let f = feld(&mut k, fu, n);
                    assert_eq!(k.setze_zahl(c, f, v), 0, "{}", n);
                }
            }
            for _ in 0..20 {
                k.takt();
            }
            k.bild(1);
            assert!(zusatz(&k).is_none());
            (k.hash_szene(), k.paket().to_vec())
        };
        assert_eq!(lauf(false), lauf(true));
        let mut k = welt();
        let (fu, _, c) = strahl(&mut k);
        let sp = feld(&mut k, fu, "spritzer");
        assert!(k.setze_zahl(c, sp, 17.0) < 0);
        let st = feld(&mut k, fu, "streckung");
        assert!(k.setze_zahl(c, st, -1.0) < 0);
    }

    #[test]
    fn strich_und_licht_parallel_zu_den_teilchen() {
        let mut k = welt();
        let (fu, _, c) = strahl(&mut k);
        let (st, li) = (feld(&mut k, fu, "streckung"), feld(&mut k, fu, "licht"));
        assert_eq!(k.setze_zahl(c, st, 0.1), 0);
        assert_eq!(k.setze_zahl(c, li, 0.5), 0);
        for _ in 0..10 {
            k.takt();
        }
        k.bild(1);
        let (l, _, lagen, _) = teilchen_3d(&k).unwrap();
        let z = zusatz(&k).expect("Zusatz bei streckung/licht");
        assert_eq!(z.len(), l as usize);
        for ((s, m), p) in z.iter().zip(lagen.iter()) {
            // halbe Strecke in der Belichtungszeit: 10 · 0,1 / 2 (Tempo ±25 %), nach unten
            assert!(s[0] == 0.0 && s[2] == 0.0 && s[1] <= -0.375 && s[1] >= -0.625, "{:?}", s);
            assert_eq!(*m, 128);
            // Mitte über dem Kopf (Kopf = Mitte + Strich), Kopf unter dem Ausstoßpunkt
            assert!(p[1] + s[1] < 3.0 && p[1] > p[1] + s[1]);
        }
        // nur licht → Strich 0, Merkmale gesetzt
        assert_eq!(k.setze_zahl(c, st, 0.0), 0);
        k.bild(2);
        assert!(zusatz(&k).unwrap().iter().all(|(s, m)| *s == [0.0; 3] && *m == 128));
    }

    #[test]
    fn volumen_um_das_teil_mit_umlauf() {
        let mut k = welt();
        let (fu, t, c) = strahl(&mut k);
        let vol = feld(&mut k, fu, "volumen");
        assert_eq!(k.setze_zahl(c, vol, 2.0), 0);
        let rx = feld(&mut k, fu, "richtungX");
        assert_eq!(k.setze_zahl(c, rx, 0.4), 0);
        for _ in 0..40 {
            k.takt();
        }
        k.bild(1);
        let (_, _, lagen, _) = teilchen_3d(&k).unwrap();
        assert!(lagen.len() > 30);
        assert!(lagen.iter().all(|p| p[0] >= -2.0 && p[0] < 2.0 && p[2] >= -2.0 && p[2] < 2.0), "im Quadrat trotz Schräge");
        assert!(lagen.iter().any(|p| p[0] < -1.0) && lagen.iter().any(|p| p[0] > 1.0), "verteilt");
        // Teil springt: nach einem Takt liegen alle Tropfen im neuen Quadrat
        k.teil_lage(t, 10.0, 3.0, -5.0);
        k.takt();
        k.bild(2);
        let (_, _, lagen, _) = teilchen_3d(&k).unwrap();
        assert!(lagen.iter().all(|p| p[0] >= 8.0 && p[0] < 12.0 && p[2] >= -7.0 && p[2] < -3.0));
    }

    #[test]
    fn aufschlag_mit_spritzern() {
        let lauf = |spritzer: f64| {
            let mut k = welt();
            let (fu, _, c) = strahl(&mut k);
            for (n, v) in [("aufschlag", 1.0), ("boden", 0.5), ("spritzer", spritzer)] {
                let f = feld(&mut k, fu, n);
                assert_eq!(k.setze_zahl(c, f, v), 0);
            }
            for _ in 0..40 {
                k.takt();
            }
            k.bild(1);
            let (_, _, lagen, _) = teilchen_3d(&k).unwrap();
            assert!(lagen.iter().all(|p| p[1] >= 0.5), "nichts unter dem Boden");
            let spritzer = lagen.iter().filter(|p| (p[3] - 0.07).abs() < 1e-6).count();
            let tropfen = lagen.iter().filter(|p| (p[3] - 0.1).abs() < 1e-6).count();
            (spritzer, tropfen, k.hash_szene())
        };
        let (spritz0, tropfen0, _) = lauf(0.0);
        let (spritz3, tropfen3, h) = lauf(3.0);
        assert_eq!(spritz0, 0);
        assert!(spritz3 > 0, "Spritzer");
        assert_eq!(tropfen0, tropfen3, "Tropfen unabhängig von den Spritzern");
        assert!(tropfen3 < 40, "Tropfen enden am Boden");
        assert_eq!(lauf(3.0).2, h, "bitgleich");
    }

    #[test]
    fn rate_mal_stimmung_regen() {
        let lauf = |stimmung: Option<f64>| {
            let mut k = welt();
            let (fu, _, c) = strahl(&mut k);
            let rg = feld(&mut k, fu, "regen");
            assert_eq!(k.setze_zahl(c, rg, 1.0), 0);
            if let Some(r) = stimmung {
                let s = typ(&mut k, "Stimmung");
                let t = k.teil_neu(3);
                let st = k.komp_neu(s);
                let f = feld(&mut k, s, "regen");
                assert_eq!(k.setze_zahl(st, f, r), 0);
                assert_eq!(k.komp_haenge(st, t), 0);
            }
            for _ in 0..30 {
                k.takt();
            }
            k.bild(1);
            let n = teilchen_3d(&k).map(|t| t.2.len()).unwrap_or(0);
            let regen = Leser::neu(k.paket()).unwrap().abschnitte().find(|(a, _)| *a == abschnitt::STIMMUNG).map(|(_, d)| f32::from_le_bytes([d[72], d[73], d[74], d[75]]));
            (n, regen)
        };
        assert_eq!(lauf(None), (30, None));
        assert_eq!(lauf(Some(1.0)), (30, Some(1.0)));
        assert_eq!(lauf(Some(0.5)), (15, Some(0.5)));
        assert_eq!(lauf(Some(0.0)), (0, Some(0.0)));
    }
}
/// H-K17: `Schwung` – 3D-Physik mit gedrehten Formen, Gelände, Netz, Kapsel, Schlafen (HERD.md §13.3, K-162).
mod hk17 {
    use super::*;
    use crate::komponenten::{schwung, DT};

    struct N {
        f: i32,
        f_form: i32,
        f_aus: i32,
        f_radius: i32,
        f_hoehe: i32,
        s: i32,
        art: i32,
        masse: i32,
        tx: i32,
        ty: i32,
        dz: i32,
        g: i32,
        reibung: i32,
        sx: i32,
        sperre: i32,
        boden: i32,
        ruht: i32,
        kp: i32,
        kp_form: i32,
        wuerfel: i32,
    }
    fn nummern(k: &mut Kern) -> N {
        let (f, s, kp) = (typ(k, "Fuehler"), typ(k, "Schwung"), typ(k, "Koerper"));
        let wuerfel = k.form_grund(1, 0.0, 0.0);
        N {
            f,
            f_form: feld(k, f, "form"),
            f_aus: feld(k, f, "ausloeser"),
            f_radius: feld(k, f, "radius"),
            f_hoehe: feld(k, f, "hoehe"),
            s,
            art: feld(k, s, "art"),
            masse: feld(k, s, "masse"),
            tx: feld(k, s, "tempoX"),
            ty: feld(k, s, "tempoY"),
            dz: feld(k, s, "drehtempoZ"),
            g: feld(k, s, "schwerkraft"),
            reibung: feld(k, s, "reibung"),
            sx: feld(k, s, "stossX"),
            sperre: feld(k, s, "drehsperre"),
            boden: feld(k, s, "amBoden"),
            ruht: feld(k, s, "ruht"),
            kp,
            kp_form: feld(k, kp, "form"),
            wuerfel,
        }
    }
    /// 3D-Teil mit Würfel-Körper (Größe g) bei p und festem Fühler (`form`: Text oder leer = auto); gibt (Teil, Fühler)
    fn kiste(k: &mut Kern, n: &N, p: [f64; 3], g: [f64; 3], form: &str) -> (i32, i32) {
        let t = k.teil_neu(3);
        k.teil_lage(t, p[0], p[1], p[2]);
        k.teil_groesse(t, g[0], g[1], g[2]);
        let c = k.komp_neu(n.kp);
        k.setze_zahl(c, n.kp_form, n.wuerfel as f64);
        assert_eq!(k.komp_haenge(c, t), 0);
        let f = k.komp_neu(n.f);
        k.setze_zahl(f, n.f_aus, 0.0);
        if !form.is_empty() {
            assert_eq!(k.setze_text(f, n.f_form, form.as_bytes()), 0);
        }
        assert_eq!(k.komp_haenge(f, t), 0);
        (t, f)
    }
    fn kugel(k: &mut Kern, n: &N, p: [f64; 3], r: f64) -> (i32, i32) {
        let t = k.teil_neu(3);
        k.teil_lage(t, p[0], p[1], p[2]);
        let f = k.komp_neu(n.f);
        k.setze_text(f, n.f_form, b"kugel");
        k.setze_zahl(f, n.f_radius, r);
        k.setze_zahl(f, n.f_aus, 0.0);
        assert_eq!(k.komp_haenge(f, t), 0);
        (t, f)
    }
    fn schwung(k: &mut Kern, n: &N, t: i32, g: f64) -> i32 {
        let s = k.komp_neu(n.s);
        k.setze_zahl(s, n.g, g);
        assert_eq!(k.komp_haenge(s, t), 0, "{}", k.fehler_text());
        s
    }
    fn takte(k: &mut Kern, n: usize) {
        for _ in 0..n {
            k.takt();
        }
    }
    /// Boden: fester Kasten 40 × 1 × 40, Oberkante y = 0
    fn boden(k: &mut Kern, n: &N, form: &str) -> i32 {
        kiste(k, n, [0.0, -0.5, 0.0], [40.0, 1.0, 40.0], form).0
    }

    #[test]
    fn schema_typnummer_braucht_lesefelder() {
        let mut k = welt();
        let n = nummern(&mut k);
        assert_eq!(n.s, 32, "Typnummer in Merge-Reihenfolge nach Stimmung (31)");
        let art = ARTEN.iter().find(|a| a.schema.name == "Schwung").unwrap();
        assert!(art.takt.is_some() && art.nachlauf.is_none() && art.bild.is_none() && art.huelle.is_none());
        let t = k.teil_neu(3);
        let s = k.komp_neu(n.s);
        assert!(k.komp_haenge(s, t) < 0);
        assert_eq!(k.fehler_text(), "Schwung braucht einen Fuehler am selben Teil.");
        let f = k.komp_neu(n.f);
        assert_eq!(k.komp_haenge(f, t), 0);
        assert_eq!(k.komp_haenge(s, t), 0);
        // nur 3D
        let t2 = k.teil_neu(2);
        let f2 = k.komp_neu(n.f);
        assert_eq!(k.komp_haenge(f2, t2), 0);
        let s2 = k.komp_neu(n.s);
        assert!(k.komp_haenge(s2, t2) < 0);
        assert!(k.setze_zahl(s, n.boden, 1.0) < 0);
        assert_eq!(k.fehler_text(), "Schwung.amBoden kann man nur lesen.");
        assert!(k.setze_zahl(s, n.ruht, 1.0) < 0);
        assert!(k.setze_zahl(s, n.masse, 0.0) < 0);
        assert_eq!(k.fehler_text(), "Schwung.masse muss mindestens 0.001 sein, nicht 0.");
        assert!(k.setze_text(s, n.art, b"fliegend") < 0);
        assert_eq!(k.fehler_text(), "Schwung.art kennt 'fliegend' nicht. Erlaubt: dynamisch, kinematisch, fest.");
        assert_eq!((k.hole_zahl(s, n.reibung), k.hole_zahl(s, n.g)), (0.5, 0.0));
        let dd = feld(&mut k, n.s, "drehdaempfung");
        assert_eq!(k.hole_zahl(s, dd), 0.05);
        // Fühler: neue Formen hinten angehängt (Werte 5, 6)
        assert_eq!(k.setze_text(f, n.f_form, b"kapsel"), 0);
        assert_eq!(k.hole_zahl(f, n.f_form), 5.0);
        assert_eq!(k.setze_text(f, n.f_form, b"netz"), 0);
        assert_eq!(k.hole_zahl(f, n.f_form), 6.0);
    }

    #[test]
    fn fallhoehe_nach_n_takten() {
        let mut k = welt();
        let n = nummern(&mut k);
        let (t, _) = kugel(&mut k, &n, [1.0, 10.0, -2.0], 0.5);
        let s = schwung(&mut k, &n, t, 9.81);
        let (mut y, mut v) = (10.0f64, 0.0f64);
        for i in 1..=30 {
            k.takt();
            v -= 9.81 * DT;
            y += v * DT;
            assert_eq!(k.teil_hole(t, tf::Y), y, "Takt {}", i);
        }
        assert_eq!(k.hole_zahl(s, n.ty), v);
        assert_eq!((k.teil_hole(t, tf::X), k.teil_hole(t, tf::Z)), (1.0, -2.0));
        assert_eq!((k.teil_hole(t, tf::DREHUNG), k.teil_hole(t, tf::NEIGUNG), k.teil_hole(t, tf::ROLLEN)), (0.0, 0.0, 0.0));
        assert_eq!(k.hole_zahl(s, n.boden), 0.0);
    }

    #[test]
    fn stapel_aus_10_kisten_ruht_und_schlaeft() {
        let mut k = welt();
        let n = nummern(&mut k);
        let b = boden(&mut k, &n, "");
        let mut kisten = Vec::new();
        for i in 0..10 {
            let x = (i % 2) as f64 * 0.04;
            let (t, _) = kiste(&mut k, &n, [x, 0.5 + i as f64 * 1.0, 0.0], [1.0, 1.0, 1.0], "kasten");
            let s = schwung(&mut k, &n, t, 9.81);
            kisten.push((t, s, x));
        }
        takte(&mut k, 300);
        let vorher: Vec<f64> = kisten.iter().map(|&(t, _, _)| k.teil_hole(t, tf::Y)).collect();
        takte(&mut k, 300);
        for (i, &(t, s, x)) in kisten.iter().enumerate() {
            let y = k.teil_hole(t, tf::Y);
            let soll = 0.5 + i as f64;
            assert!((y - soll).abs() < 0.02 * (i + 1) as f64, "Kiste {} bei y = {} statt {}", i, y, soll);
            assert!((y - vorher[i]).abs() < 1e-3, "Kiste {} ruht nicht: {} → {}", i, vorher[i], y);
            assert!((k.teil_hole(t, tf::X) - x).abs() < 0.02, "Kiste {} rutscht: {}", i, k.teil_hole(t, tf::X));
            assert!(k.teil_hole(t, tf::ROLLEN).abs() < 1.0 && k.teil_hole(t, tf::NEIGUNG).abs() < 1.0, "Kiste {} kippt", i);
            assert_eq!(k.hole_zahl(s, n.boden), 1.0, "Kiste {} amBoden", i);
            assert_eq!(k.hole_zahl(s, n.ruht), 1.0, "Kiste {} schläft", i);
            assert_eq!(k.hole_zahl(s, n.ty), 0.0);
        }
        assert_eq!(k.teil_hole(b, tf::Y), -0.5, "Fühler ohne Schwung = fest");
    }

    #[test]
    fn kugel_rollt_den_hang_hinab() {
        let mut k = welt();
        let n = nummern(&mut k);
        let gt = typ(&mut k, "Gelaende");
        let (gh, gsp, gze) = (feld(&mut k, gt, "hoehen"), feld(&mut k, gt, "spalten"), feld(&mut k, gt, "zeilen"));
        // Hang: 33 × 33 Punkte, Weite 1, fällt in +x mit 15°
        let neig = libm::tan(15.0 * crate::welt::GRAD);
        let hoehen: Vec<f64> = (0..33 * 33).map(|p| -((p % 33) as f64 - 16.0) * neig).collect();
        let land = k.teil_neu(3);
        let g = k.komp_neu(gt);
        k.setze_zahl(g, gsp, 33.0);
        k.setze_zahl(g, gze, 33.0);
        k.setze_zahlen(g, gh, &hoehen);
        assert_eq!(k.komp_haenge(g, land), 0);
        let f = k.komp_neu(n.f);
        k.setze_text(f, n.f_form, b"netz");
        k.setze_zahl(f, n.f_aus, 0.0);
        assert_eq!(k.komp_haenge(f, land), 0);
        // Höhenabfrage = Netz
        assert!((crate::komponenten::gelaende::hoehe(&hoehen, 33, 33, 1.0, -8.0, 0.3).unwrap() - 8.0 * neig).abs() < 1e-6);
        let r = 0.5;
        let cos = libm::cos(15.0 * crate::welt::GRAD);
        let (t, _) = kugel(&mut k, &n, [-8.0, 8.0 * neig + r / cos, 0.0], r);
        let s = schwung(&mut k, &n, t, 9.81);
        k.setze_zahl(s, n.reibung, 1.0);
        let x0 = k.teil_hole(t, tf::X);
        takte(&mut k, 60);
        let weg = k.teil_hole(t, tf::X) - x0;
        // Rollen ohne Gleiten: a = 5/7 · g · sin θ entlang des Hangs
        let sin = libm::sin(15.0 * crate::welt::GRAD);
        let soll = 0.5 * 5.0 / 7.0 * 9.81 * sin * cos;
        assert!(weg > 0.8 * soll && weg < 1.1 * soll, "Weg {} gegen {}", weg, soll);
        let v = k.hole_zahl(s, n.tx);
        let om = k.hole_zahl(s, n.dz) * crate::welt::GRAD;
        assert!(om < 0.0, "rollt um −z: {}", om);
        assert!(((-om * r) - v / cos).abs() < 0.1 * v, "rollt ohne Gleiten: ω·r = {} gegen v = {}", -om * r, v / cos);
        // liegt auf dem Hang (Abstand zur Ebene = r)
        let y = k.teil_hole(t, tf::Y);
        let x = k.teil_hole(t, tf::X);
        assert!(((y + x * neig) * cos - r).abs() < 0.02, "auf dem Hang: y = {}", y);
        assert_eq!(k.hole_zahl(s, n.boden), 1.0);
        // ohne Reibung gleitet sie, ohne zu drehen
        let (t2, _) = kugel(&mut k, &n, [-8.0, 8.0 * neig + r / cos, 6.0], r);
        let s2 = schwung(&mut k, &n, t2, 9.81);
        k.setze_zahl(s2, n.reibung, 0.0);
        takte(&mut k, 30);
        assert!(k.hole_zahl(s2, n.dz).abs() < 1e-6, "gleitet ohne Drehung: {}", k.hole_zahl(s2, n.dz));
        assert!(k.hole_zahl(s2, n.tx) > 0.0);
    }

    #[test]
    fn kapsel_auf_netz_stehend_und_liegend() {
        let mut k = welt();
        let n = nummern(&mut k);
        boden(&mut k, &n, "netz");
        let kapsel = |k: &mut Kern, p: [f64; 3], rollen: f64| -> (i32, i32) {
            let t = k.teil_neu(3);
            k.teil_lage(t, p[0], p[1], p[2]);
            k.teil_setze(t, tf::ROLLEN, rollen);
            let f = k.komp_neu(n.f);
            k.setze_text(f, n.f_form, b"kapsel");
            k.setze_zahl(f, n.f_radius, 0.3);
            k.setze_zahl(f, n.f_hoehe, 1.6);
            k.setze_zahl(f, n.f_aus, 0.0);
            assert_eq!(k.komp_haenge(f, t), 0);
            let s = schwung(k, &n, t, 9.81);
            (t, s)
        };
        let (steht, ss) = kapsel(&mut k, [0.0, 2.0, 0.0], 0.0);
        let (liegt, sl) = kapsel(&mut k, [3.0, 2.0, 0.0], 90.0);
        takte(&mut k, 180);
        assert!((k.teil_hole(steht, tf::Y) - 0.8).abs() < 0.02, "steht auf 0.8: {}", k.teil_hole(steht, tf::Y));
        assert!((k.teil_hole(liegt, tf::Y) - 0.3).abs() < 0.02, "liegt auf 0.3: {}", k.teil_hole(liegt, tf::Y));
        assert!((k.teil_hole(liegt, tf::ROLLEN).abs() - 90.0).abs() < 1.0, "bleibt liegen: {}", k.teil_hole(liegt, tf::ROLLEN));
        assert_eq!((k.hole_zahl(ss, n.boden), k.hole_zahl(sl, n.boden)), (1.0, 1.0));
        // Hüllen-Baum des Würfelnetzes gebaut (Cache nach ID, nicht im Hash)
        let w = k.welt.as_ref().unwrap();
        assert!(w.ressourcen.baeume.get(n.wuerfel as usize - 1).is_some_and(|b| b.as_ref().is_some_and(|b| b.dreiecke.len() == 12)));
    }

    #[test]
    fn kasten_kippt_von_der_kante_und_drehsperre() {
        let mut k = welt();
        let n = nummern(&mut k);
        boden(&mut k, &n, "");
        // auf einer Kante abgesetzt, um 30° gerollt: kippt flach (Vielfaches von 90°) – mit Drehsperre bleibt der Winkel
        let (frei, _) = kiste(&mut k, &n, [0.0, 1.5, 0.0], [1.0, 1.0, 1.0], "kasten");
        k.teil_setze(frei, tf::ROLLEN, 30.0);
        schwung(&mut k, &n, frei, 9.81);
        let (fest, _) = kiste(&mut k, &n, [4.0, 1.5, 0.0], [1.0, 1.0, 1.0], "kasten");
        k.teil_setze(fest, tf::ROLLEN, 30.0);
        let sf = schwung(&mut k, &n, fest, 9.81);
        k.setze_zahl(sf, n.sperre, 1.0);
        k.setze_zahl(sf, n.dz, 90.0);
        takte(&mut k, 240);
        let r = k.teil_hole(frei, tf::ROLLEN);
        let rest = r - 90.0 * libm::round(r / 90.0);
        assert!(rest.abs() < 1.0, "liegt flach: rollen {}", r);
        assert!((k.teil_hole(frei, tf::Y) - 0.5).abs() < 0.02, "auf der Seite: {}", k.teil_hole(frei, tf::Y));
        assert!((k.teil_hole(fest, tf::ROLLEN) - 30.0).abs() < 1e-9, "Drehsperre: {}", k.teil_hole(fest, tf::ROLLEN));
        assert_eq!(k.hole_zahl(sf, n.dz), 0.0);
    }

    #[test]
    fn schlafen_und_wecken() {
        let mut k = welt();
        let n = nummern(&mut k);
        let b = boden(&mut k, &n, "");
        let (t, _) = kiste(&mut k, &n, [0.0, 0.6, 0.0], [1.0, 1.0, 1.0], "kasten");
        let s = schwung(&mut k, &n, t, 9.81);
        let (oben, _) = kiste(&mut k, &n, [0.0, 1.6, 0.0], [1.0, 1.0, 1.0], "kasten");
        let so = schwung(&mut k, &n, oben, 9.81);
        takte(&mut k, 120);
        assert_eq!((k.hole_zahl(s, n.ruht), k.hole_zahl(so, n.ruht)), (1.0, 1.0), "schläft nach ruhiger halber Sekunde");
        let y = k.teil_hole(t, tf::Y);
        takte(&mut k, 10);
        assert_eq!(k.teil_hole(t, tf::Y), y, "schläft: Lage bleibt bitgleich");
        // Stoß weckt die ganze Insel
        k.setze_zahl(s, n.sx, 3.0);
        k.takt();
        assert_eq!((k.hole_zahl(s, n.ruht), k.hole_zahl(so, n.ruht)), (0.0, 0.0));
        assert!(k.hole_zahl(s, n.tx) > 0.0);
        takte(&mut k, 300);
        assert_eq!(k.hole_zahl(s, n.ruht), 1.0, "schläft wieder");
        // Lage setzen weckt
        k.teil_lage(oben, 5.0, 3.0, 0.0);
        k.takt();
        assert_eq!(k.hole_zahl(so, n.ruht), 0.0);
        assert!(k.teil_hole(oben, tf::Y) < 3.0, "fällt von der gesetzten Lage");
        takte(&mut k, 200);
        assert_eq!(k.hole_zahl(s, n.ruht), 1.0);
        // Boden entfernt: der Schläfer fällt
        k.teil_entferne(b);
        k.takt();
        assert_eq!(k.hole_zahl(s, n.ruht), 0.0, "Partner fehlt → wach");
        takte(&mut k, 30);
        assert!(k.teil_hole(t, tf::Y) < 0.0, "fällt: {}", k.teil_hole(t, tf::Y));
    }

    #[test]
    fn kinematisch_fest_ausloeser_kopie() {
        let mut k = welt();
        let n = nummern(&mut k);
        boden(&mut k, &n, "");
        let (fahr, _) = kiste(&mut k, &n, [0.0, 0.25, 0.0], [2.0, 0.5, 2.0], "kasten");
        let sk = schwung(&mut k, &n, fahr, 9.81);
        k.setze_text(sk, n.art, b"kinematisch");
        k.setze_zahl(sk, n.tx, 1.0);
        let (last, _) = kiste(&mut k, &n, [0.0, 0.75, 0.0], [0.5, 0.5, 0.5], "kasten");
        let sl = schwung(&mut k, &n, last, 9.81);
        k.setze_zahl(sl, n.reibung, 1.0);
        let (stein, _) = kiste(&mut k, &n, [-5.0, 3.0, 0.0], [1.0, 1.0, 1.0], "kasten");
        let ss = schwung(&mut k, &n, stein, 9.81);
        k.setze_text(ss, n.art, b"fest");
        let (geist, gf) = kugel(&mut k, &n, [5.0, 2.0, 0.0], 0.3);
        k.setze_zahl(gf, n.f_aus, 1.0);
        schwung(&mut k, &n, geist, 9.81);
        takte(&mut k, 60);
        // kinematisch: fährt mit tempo (Schwerkraft wirkt nicht), nimmt die Last mit (Reibung)
        assert!((k.teil_hole(fahr, tf::X) - 1.0).abs() < 1e-9 && k.teil_hole(fahr, tf::Y) == 0.25);
        assert!((k.teil_hole(last, tf::X) - 1.0).abs() < 0.1, "Last fährt mit: {}", k.teil_hole(last, tf::X));
        assert_eq!((k.teil_hole(stein, tf::X), k.teil_hole(stein, tf::Y)), (-5.0, 3.0), "fest");
        assert!(k.teil_hole(geist, tf::Y) < 0.0, "Auslöser fällt durch");
        // Kopie: übernimmt die Lage der Kopie neu (Tempo wird mitkopiert) und fällt für sich
        let kopie = k.teil_kopie(last);
        k.teil_lage(kopie, 8.0, 2.0, 0.0);
        let sk2 = k.komp_von(kopie, n.s);
        k.setze_zahl(sk2, n.tx, 0.0);
        takte(&mut k, 60);
        assert!((k.teil_hole(kopie, tf::Y) - 0.25).abs() < 0.02, "Kopie liegt auf dem Boden: {}", k.teil_hole(kopie, tf::Y));
        assert!((k.teil_hole(kopie, tf::X) - 8.0).abs() < 0.05, "Kopie bei x = {}", k.teil_hole(kopie, tf::X));
    }

    /// Ohne Schwung ändert die neue Art nichts: dieselbe Szene mit und ohne Schwung in der Registry → gleicher Hash und gleiches
    /// Bildpaket über viele Takte (Fühler aller Formen, Körper, Gelände).
    #[test]
    fn ohne_schwung_byte_gleich() {
        use crate::abi::szenen_hash;
        use crate::paket::{baue, Bildbau, Gesendet};
        use crate::welt::Welt;
        let pos = ARTEN.iter().position(|a| a.schema.name == "Schwung").unwrap();
        let ohne: &'static [&'static crate::komponenten::Art] = &ARTEN[..pos];
        let mit: &'static [&'static crate::komponenten::Art] = &ARTEN[..pos + 1];
        let lauf = |r: &'static [&'static crate::komponenten::Art]| -> (u64, Vec<u8>) {
            let mut w = Welt::neu(320, 180, String::from("S"), r);
            let i = |name: &str| r.iter().position(|a| a.schema.name == name).unwrap();
            let (fi, ki, gi) = (i("Fuehler"), i("Koerper"), i("Gelaende"));
            let netz = w.ressourcen.form(crate::formen::netz_aus(&crate::formen::FormDaten { art: 1, teile: 0, dicke: 0.0, glatt: false, punkte: Vec::new(), dreiecke: Vec::new() }));
            for e in 0..7u32 {
                let t = w.teil_neu(true);
                w.lage_setzen(t, e as f64 * 0.5, 1.0 + e as f64 * 0.3, 0.0);
                let h = w.komp_neu(ki);
                let z = w.komp_ort[h as usize].zeile as usize;
                w.speicher[ki].zahl_mut(crate::komponenten::koerper::FORM)[z] = netz as f64;
                w.komp_haenge(h, t).unwrap();
                let h = w.komp_neu(fi);
                let z = w.komp_ort[h as usize].zeile as usize;
                w.speicher[fi].zahl_mut(crate::komponenten::fuehler::FORM)[z] = e as f64;
                w.speicher[fi].zahl_mut(crate::komponenten::fuehler::RADIUS)[z] = 0.4;
                w.speicher[fi].zahl_mut(crate::komponenten::fuehler::AUSLOESER)[z] = (e % 2) as f64;
                w.komp_haenge(h, t).unwrap();
            }
            let land = w.teil_neu(true);
            let h = w.komp_neu(gi);
            w.komp_haenge(h, land).unwrap();
            let (mut bau, mut ges, mut aus) = (Bildbau::default(), Gesendet::default(), Vec::new());
            for b in 0..30 {
                w.takt();
                baue(&mut w, &mut bau, &mut ges, &mut aus, b);
            }
            (szenen_hash(&mut w), aus)
        };
        assert_eq!(lauf(ohne), lauf(mit));
    }

    #[test]
    fn drehungen_hin_und_zurueck() {
        use crate::kollision3d::achsen;
        use crate::welt::lokal_3d;
        for &(d, ne, ro) in &[(0.0, 0.0, 0.0), (30.0, -20.0, 75.0), (-170.0, 89.0, 10.0), (100.0, -45.0, -120.0), (45.0, 90.0, 0.0)] {
            let m = lokal_3d(&[0.0, 0.0, 0.0, d, ne, ro, 1.0, 1.0, 1.0]);
            let q = schwung::quaternion(&achsen(&m).0);
            let r = schwung::matrix(&q);
            for j in 0..3 {
                for i in 0..3 {
                    assert!((r[j][i] - m[i * 4 + j]).abs() < 1e-12, "{:?}", (d, ne, ro));
                }
            }
            let (d2, n2, r2) = schwung::winkel(&r);
            let m2 = lokal_3d(&[0.0, 0.0, 0.0, d2, n2, r2, 1.0, 1.0, 1.0]);
            for x in 0..12 {
                assert!((m2[x] - m[x]).abs() < 1e-6, "{:?} → {:?}", (d, ne, ro), (d2, n2, r2));
            }
        }
    }
}


/// H-K18: Schatten für Punkt- und Spotlichter, Sonnen-Kaskaden (Abschnitt SCHATTENLICHTER, `crate::lichter::schatten_waehlen`).
mod hk18 {
    use super::*;
    use crate::lichter::{LICHTER_KOPF_BYTES, LICHT_BYTES, MAX_SCHATTEN_LICHTER, SCHATTENLICHTER_KOPF_BYTES, SCHATTEN_ANSICHT_BYTES, SCHATTEN_SEITE};
    use crate::paket::{zug, ZUG_BYTES};

    struct N {
        l: i32,
        rw: i32,
        kegel: i32,
        sch: i32,
        guete: i32,
        weich: i32,
        kask: i32,
        weite: i32,
    }
    fn nummern(k: &mut Kern) -> N {
        let l = typ(k, "Licht");
        N {
            l,
            rw: feld(k, l, "reichweite"),
            kegel: feld(k, l, "kegel"),
            sch: feld(k, l, "schatten"),
            guete: feld(k, l, "schattenGuete"),
            weich: feld(k, l, "schattenWeich"),
            kask: feld(k, l, "kaskaden"),
            weite: feld(k, l, "schattenWeite"),
        }
    }
    fn f(d: &[u8], o: usize) -> f32 {
        f32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }
    fn u(d: &[u8], o: usize) -> u32 {
        u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }
    fn abschnitt_von(k: &Kern, art: u32) -> Option<Vec<u8>> {
        Leser::neu(k.paket()).unwrap().abschnitte().find(|(a, _)| *a == art).map(|(_, d)| d.to_vec())
    }
    fn zuege(k: &Kern) -> Vec<[u32; 4]> {
        abschnitt_von(k, abschnitt::ZUEGE3D).map(|d| d.chunks_exact(ZUG_BYTES).map(|z| [u(z, 0), u(z, 4), u(z, 8), u(z, 12)]).collect()).unwrap_or_default()
    }
    /// Boden und ein Raster aus Kisten (alle werfen Schatten), Kamera (0, 6, 14) auf den Ursprung.
    fn szene(k: &mut Kern) {
        let kt = typ(k, "Koerper");
        let form = feld(k, kt, "form");
        let ebene = k.form_grund(5, 0.0, 0.0);
        let wuerfel = k.form_grund(1, 0.0, 0.0);
        k.teil_lage(1, 0.0, 6.0, 14.0);
        k.teil_schaue(1, 0.0, 0.0, 0.0);
        let b = k.teil_neu(3);
        k.teil_groesse(b, 60.0, 1.0, 60.0);
        let c = k.komp_neu(kt);
        assert_eq!(k.setze_zahl(c, form, ebene as f64), 0);
        assert_eq!(k.komp_haenge(c, b), 0);
        for i in 0..25 {
            let t = k.teil_neu(3);
            k.teil_lage(t, (i % 5) as f64 * 3.0 - 6.0, 0.5, (i / 5) as f64 * 3.0 - 6.0);
            let c = k.komp_neu(kt);
            assert_eq!(k.setze_zahl(c, form, wuerfel as f64), 0);
            assert_eq!(k.komp_haenge(c, t), 0);
        }
    }
    fn licht(k: &mut Kern, n: &N, x: f64, y: f64, z: f64, rw: f64) -> (i32, i32) {
        let t = k.teil_neu(3);
        k.teil_lage(t, x, y, z);
        let c = k.komp_neu(n.l);
        assert_eq!(k.setze_zahl(c, n.rw, rw), 0);
        assert_eq!(k.komp_haenge(c, t), 0);
        (c, t)
    }

    #[test]
    fn ohne_nutzung_byte_gleich() {
        let lauf = |setzen: bool| {
            let mut k = welt();
            let n = nummern(&mut k);
            szene(&mut k);
            let mut c = Vec::new();
            for i in 0..4 {
                c.push(licht(&mut k, &n, i as f64 * 3.0 - 4.5, 2.0, 0.0, 6.0).0);
            }
            let sonne = k.komp_von(2, n.l);
            if setzen {
                for &l in c.iter().chain(core::iter::once(&sonne)) {
                    assert_eq!(k.setze_text(l, n.guete, b"aus"), 0);
                    assert_eq!(k.setze_zahl(l, n.weich, 1.0), 0);
                    assert_eq!(k.setze_zahl(l, n.kask, 1.0), 0);
                    assert_eq!(k.setze_zahl(l, n.weite, 0.0), 0);
                }
            }
            // zweimal: das zweite Paket ohne die Ressourcen-Deltas des ersten
            k.bild(1);
            k.bild(1);
            assert!(abschnitt_von(&k, abschnitt::SCHATTENLICHTER).is_none());
            assert!(abschnitt_von(&k, abschnitt::LICHTER).is_none(), "4 Punktlichter ohne Schatten: wie v1");
            (k.hash_szene(), k.paket().to_vec())
        };
        let (h, p) = lauf(false);
        assert_eq!((h, p.clone()), lauf(true));
        // Grenzen der neuen Felder
        let mut k = welt();
        let n = nummern(&mut k);
        let (c, _) = licht(&mut k, &n, 0.0, 2.0, 0.0, 6.0);
        assert!(k.setze_zahl(c, n.kask, 5.0) < 0);
        assert!(k.setze_zahl(c, n.kask, 2.5) < 0);
        assert!(k.setze_zahl(c, n.weich, 4.5) < 0);
        assert!(k.setze_zahl(c, n.weite, -1.0) < 0);
        assert!(k.setze_text(c, n.guete, b"ultra") < 0);
        // an → Abschnitt, Hash anders; wieder aus → byte-gleich
        let mut k = welt();
        let n = nummern(&mut k);
        szene(&mut k);
        let mut c = Vec::new();
        for i in 0..4 {
            c.push(licht(&mut k, &n, i as f64 * 3.0 - 4.5, 2.0, 0.0, 6.0).0);
        }
        k.bild(1);
        k.bild(1);
        assert_eq!((k.hash_szene(), k.paket()), (h, &p[..]));
        assert_eq!(k.setze_text(c[1], n.guete, b"mittel"), 0);
        k.bild(1);
        assert_ne!(k.hash_szene(), h);
        assert!(abschnitt_von(&k, abschnitt::SCHATTENLICHTER).is_some());
        assert!(abschnitt_von(&k, abschnitt::LICHTER).is_some(), "Schatten erzwingt LICHTER");
        assert_eq!(k.setze_text(c[1], n.guete, b"aus"), 0);
        k.bild(1);
        assert_eq!((k.hash_szene(), k.paket()), (h, &p[..]));
    }

    #[test]
    fn auswahl_budget_packen_und_zellen() {
        let mut k = welt();
        let n = nummern(&mut k);
        szene(&mut k);
        // 12 Lichter mit Schatten im Bild (Abstand zur Kamera wächst mit i), eines hinter der Kamera, eines ohne `schatten`
        let mut c = Vec::new();
        for i in 0..12 {
            let (l, _) = licht(&mut k, &n, (i % 4) as f64 * 2.0 - 3.0, 1.5, 4.0 - i as f64 * 1.5, 3.0);
            assert_eq!(k.setze_text(l, n.guete, if i % 3 == 0 { b"fein" as &[u8] } else { b"grob" }), 0);
            c.push(l);
        }
        let (hinten, _) = licht(&mut k, &n, 0.0, 6.0, 40.0, 3.0);
        assert_eq!(k.setze_text(hinten, n.guete, b"fein"), 0);
        assert_eq!(k.setze_zahl(c[0], n.sch, 0.0), 0);
        k.bild(1);
        let d = abschnitt_von(&k, abschnitt::SCHATTENLICHTER).unwrap();
        assert_eq!((f(&d, 0), f(&d, 4), f(&d, 8)), (1.0, 0.0, 1.0));
        let ansichten = f(&d, 12) as usize;
        assert_eq!(d.len(), SCHATTENLICHTER_KOPF_BYTES + ansichten * SCHATTEN_ANSICHT_BYTES);
        // 8 Plätze (c[1] … c[8], die nächsten mit `schatten`): fein = c[3], c[6] (je 6 × 1024² = 6,3 M Texel), grob je
        // 6 × 256² = 0,4 M → alle passen (zusammen 15 M von 16,8 M)
        let plaetze: Vec<[f32; 4]> = (0..MAX_SCHATTEN_LICHTER)
            .map(|p| {
                let o = 16 + 64 + p * 16;
                [f(&d, o), f(&d, o + 4), f(&d, o + 8), f(&d, o + 12)]
            })
            .collect();
        assert!(plaetze.iter().all(|p| p[1] == 6.0), "{plaetze:?}");
        assert_eq!(ansichten, 48);
        // Rechtecke liegen in ihren Seiten und überlappen nicht
        let mut rechtecke: Vec<(u32, u32, u32, u32)> = Vec::new();
        for a in 0..ansichten {
            let o = SCHATTENLICHTER_KOPF_BYTES + a * SCHATTEN_ANSICHT_BYTES + 64;
            let (s, x, y, e) = (f(&d, o) as u32, f(&d, o + 4) as u32, f(&d, o + 8) as u32, f(&d, o + 12) as u32);
            assert!(x + e <= SCHATTEN_SEITE && y + e <= SCHATTEN_SEITE && (e == 256 || e == 1024), "{a}: {s} {x} {y} {e}");
            for &(s2, x2, y2, e2) in &rechtecke {
                assert!(s != s2 || x + e <= x2 || x2 + e2 <= x || y + e <= y2 || y2 + e2 <= y, "Überlappung");
            }
            rechtecke.push((s, x, y, e));
        }
        assert_eq!(rechtecke[0], (1, 0, 0, 1024), "Sonne v1 in Schicht 0, Kacheln ab Schicht 1, fein zuerst");
        // Zellen: Einträge der Schattenlichter tragen Platz + 1 in Bits 16 … 19
        let l = abschnitt_von(&k, abschnitt::LICHTER).unwrap();
        let zahl = u(&l, LICHTER_KOPF_BYTES) as usize;
        let worte = u(&l, LICHTER_KOPF_BYTES + 4) as usize;
        let w0 = LICHTER_KOPF_BYTES + 8 + zahl * LICHT_BYTES;
        let zellen = (f(&l, 0) * f(&l, 4) * f(&l, 8)) as usize;
        let mut mit = [false; 9];
        for i in zellen..worte {
            let wort = u(&l, w0 + i * 4);
            assert!(wort & 0xFFFF < zahl as u32 && wort >> 16 <= 8);
            mit[(wort >> 16) as usize] = true;
        }
        assert!(mit.iter().all(|&m| m), "alle 8 Plätze und Lichter ohne Schatten in den Zellen");
        // Werfer je Ansicht als eigene Züge
        let z = zuege(&k);
        assert!(z.iter().any(|z| z[0] == zug::SCHATTEN), "Sonne v1");
        let ans: Vec<u32> = z.iter().filter(|z| z[0] & 0xFF == zug::ANSICHT).map(|z| z[0] >> 8).collect();
        assert!(!ans.is_empty() && ans.iter().all(|&a| (a as usize) < ansichten));
        // Auswahl stabil: gleiches Bild → gleiches Paket (ab dem zweiten, ohne Ressourcen-Deltas)
        k.bild(1);
        let p = k.paket().to_vec();
        k.bild(1);
        assert_eq!(k.paket(), &p[..]);
    }

    #[test]
    fn spot_eine_kachel_weiter_wuerfel_und_fein_budget() {
        let mut k = welt();
        let n = nummern(&mut k);
        szene(&mut k);
        let (sp, t) = licht(&mut k, &n, 0.0, 5.0, 0.0, 10.0);
        k.teil_schaue(t, 0.0, 0.0, 0.001);
        assert_eq!(k.setze_zahl(sp, n.kegel, 40.0), 0);
        assert_eq!(k.setze_text(sp, n.guete, b"mittel"), 0);
        k.bild(1);
        let d = abschnitt_von(&k, abschnitt::SCHATTENLICHTER).unwrap();
        assert_eq!(f(&d, 12), 1.0);
        assert_eq!((f(&d, 80), f(&d, 84)), (0.0, 1.0));
        assert_eq!(k.setze_zahl(sp, n.kegel, 75.0), 0);
        k.bild(2);
        let d = abschnitt_von(&k, abschnitt::SCHATTENLICHTER).unwrap();
        assert_eq!(f(&d, 12), 6.0, "Spot über 60° → Würfel");
        // 8 feine Würfel brauchen 50 M Texel, der Atlas hat 16,8 M: nur 2 Lichter werfen, die übrigen still nicht
        assert_eq!(k.setze_text(sp, n.guete, b"aus"), 0);
        for i in 0..8 {
            let (l, _) = licht(&mut k, &n, i as f64 - 4.0, 1.5, 0.0, 3.0);
            assert_eq!(k.setze_text(l, n.guete, b"fein"), 0);
        }
        k.bild(3);
        let d = abschnitt_von(&k, abschnitt::SCHATTENLICHTER).unwrap();
        assert_eq!(f(&d, 12), 12.0);
        assert_eq!((f(&d, 80 + 16 * 2), f(&d, 84 + 16 * 2)), (0.0, 0.0), "Platz 3 frei");
    }

    #[test]
    fn kaskaden_und_weite() {
        let mut k = welt();
        let n = nummern(&mut k);
        szene(&mut k);
        let sonne = k.komp_von(2, n.l);
        k.bild(1);
        let v1 = k.paket().to_vec();
        // Weite allein: v1-Verfahren mit anderer Reichweite, kein Abschnitt
        assert_eq!(k.setze_zahl(sonne, n.weite, 12.0), 0);
        k.bild(1);
        assert!(abschnitt_von(&k, abschnitt::SCHATTENLICHTER).is_none());
        assert_ne!(k.paket(), &v1[..]);
        // Weichheit allein: Abschnitt ohne Kaskaden und Ansichten
        assert_eq!(k.setze_zahl(sonne, n.weite, 0.0), 0);
        assert_eq!(k.setze_zahl(sonne, n.weich, 2.5), 0);
        k.bild(1);
        let d = abschnitt_von(&k, abschnitt::SCHATTENLICHTER).unwrap();
        assert_eq!((f(&d, 0), f(&d, 4), f(&d, 8), f(&d, 12)), (1.0, 0.0, 2.5, 0.0));
        assert_eq!(d.len(), SCHATTENLICHTER_KOPF_BYTES);
        // 3 Kaskaden bis 30: Schichten 0 … 2, kein v1-Zug, SZENE: Sonne mit Schatten
        assert_eq!(k.setze_zahl(sonne, n.kask, 3.0), 0);
        assert_eq!(k.setze_zahl(sonne, n.weite, 30.0), 0);
        k.bild(2);
        let d = abschnitt_von(&k, abschnitt::SCHATTENLICHTER).unwrap();
        assert_eq!((f(&d, 4), f(&d, 12)), (3.0, 3.0));
        for c in 0..3 {
            let o = SCHATTENLICHTER_KOPF_BYTES + c * SCHATTEN_ANSICHT_BYTES + 64;
            assert_eq!((f(&d, o), f(&d, o + 12)), (c as f32, SCHATTEN_SEITE as f32));
            // Texel wachsen mit der Kaskade
            if c > 0 {
                assert!(f(&d, o + 16) > f(&d, o + 16 - SCHATTEN_ANSICHT_BYTES));
            }
            assert!(f(&d, 16 + c * 16) > 0.0 && f(&d, 20 + c * 16) > 0.0, "Normalenversatz und Bias");
        }
        let z = zuege(&k);
        assert!(!z.iter().any(|z| z[0] == zug::SCHATTEN));
        let mut ans: Vec<u32> = z.iter().filter(|z| z[0] & 0xFF == zug::ANSICHT).map(|z| z[0] >> 8).collect();
        ans.dedup();
        assert_eq!(ans, [0, 1, 2]);
        let s = abschnitt_von(&k, abschnitt::SZENE).unwrap();
        assert_eq!(f(&s, 128 + 16 + 12), 1.0);
        assert!(Leser::neu(k.paket()).unwrap().flags() & crate::paket::flag::SCHATTEN != 0);
        // Kamera dreht sich auf der Stelle: Kugel-Radius (Texelgröße) bleibt gleich
        let texel = f(&d, SCHATTENLICHTER_KOPF_BYTES + 80);
        k.teil_schaue(1, 5.0, 0.0, 3.0);
        k.bild(3);
        let d2 = abschnitt_von(&k, abschnitt::SCHATTENLICHTER).unwrap();
        assert_eq!(f(&d2, SCHATTENLICHTER_KOPF_BYTES + 80), texel);
        // Punktlicht mit Schatten hinter den Kaskaden: erste Kachel in Schicht 3, Platz zählt ab Ansicht 3
        let (l, _) = licht(&mut k, &n, 0.0, 2.0, 2.0, 5.0);
        assert_eq!(k.setze_text(l, n.guete, b"grob"), 0);
        k.bild(4);
        let d = abschnitt_von(&k, abschnitt::SCHATTENLICHTER).unwrap();
        assert_eq!(f(&d, 12), 9.0);
        assert_eq!(f(&d, 80), 3.0);
        assert_eq!(f(&d, SCHATTENLICHTER_KOPF_BYTES + 3 * SCHATTEN_ANSICHT_BYTES + 64), 3.0);
    }
}

/// H-K21: Spiegelbild vollständig (`Stimmung.spiegelGuete` voll, Abschnitt LICHTER_SPIEGEL, gespiegeltes Frustum).
mod hk21 {
    use super::*;
    use crate::lichter::{LICHTER_KOPF_BYTES, LICHT_BYTES, MAX_JE_ZELLE};
    use crate::paket::INST3D_BYTES;

    fn f(d: &[u8], o: usize) -> f32 {
        f32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }
    fn u(d: &[u8], o: usize) -> u32 {
        u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }
    fn abschnitt_von(k: &Kern, art: u32) -> Option<Vec<u8>> {
        Leser::neu(k.paket()).unwrap().abschnitte().find(|(a, _)| *a == art).map(|(_, d)| d.to_vec())
    }
    fn z4(s: u32) -> [f64; 4] {
        let mut st = s.wrapping_mul(2_654_435_761) | 1;
        let z = &mut st;
        [crate::komponenten::partikel::zufall(z), crate::komponenten::partikel::zufall(z), crate::komponenten::partikel::zufall(z), crate::komponenten::partikel::zufall(z)]
    }
    /// Boden, Kamera (1, 2, 12) schräg nach unten, `n` Lichter verstreut (auch hoch über dem Bild), Stimmung mit Spiegelung auf
    /// Höhe `h`. Liefert (Stimmung, Feld spiegelGuete, Feld spiegelung).
    fn szene(k: &mut Kern, n: u32, h: f64) -> (i32, i32, i32) {
        let kt = typ(k, "Koerper");
        let form = feld(k, kt, "form");
        let ebene = k.form_grund(5, 0.0, 0.0);
        k.teil_lage(1, 1.0, 2.0, 12.0);
        k.teil_schaue(1, -1.0, -1.5, -4.0);
        let b = k.teil_neu(3);
        k.teil_groesse(b, 60.0, 1.0, 60.0);
        let c = k.komp_neu(kt);
        assert_eq!(k.setze_zahl(c, form, ebene as f64), 0);
        assert_eq!(k.komp_haenge(c, b), 0);
        let lt = typ(k, "Licht");
        let rw = feld(k, lt, "reichweite");
        for i in 0..n {
            let z = z4(i + 1);
            let t = k.teil_neu(3);
            k.teil_lage(t, (z[0] - 0.5) * 40.0, z[1] * 9.0, (z[2] - 0.5) * 50.0 - 5.0);
            let c = k.komp_neu(lt);
            assert_eq!(k.setze_zahl(c, rw, 0.5 + z[3] * 5.0), 0);
            assert_eq!(k.komp_haenge(c, t), 0);
        }
        let st = typ(k, "Stimmung");
        let t = k.teil_neu(3);
        let s = k.komp_neu(st);
        let (fs, fh) = (feld(k, st, "spiegelung"), feld(k, st, "spiegelHoehe"));
        assert_eq!(k.setze_zahl(s, fs, 1.0), 0);
        assert_eq!(k.setze_zahl(s, fh, h), 0);
        assert_eq!(k.komp_haenge(s, t), 0);
        (s, feld(k, st, "spiegelGuete"), feld(k, st, "spiegelung"))
    }

    #[test]
    fn ohne_voll_byte_gleich() {
        let lauf = |setzen: bool| {
            let mut k = welt();
            let (s, g, _) = szene(&mut k, 40, 0.0);
            if setzen {
                assert_eq!(k.setze_text(s, g, b"einfach"), 0);
            }
            k.bild(1);
            k.bild(1);
            assert!(abschnitt_von(&k, abschnitt::LICHTER).is_some());
            assert!(abschnitt_von(&k, abschnitt::LICHTER_SPIEGEL).is_none());
            (k.hash_szene(), k.paket().to_vec())
        };
        let (h, p) = lauf(false);
        assert_eq!((h, p.clone()), lauf(true));
        let mut k = welt();
        let (s, g, sp) = szene(&mut k, 40, 0.0);
        assert!(k.setze_text(s, g, b"ultra") < 0);
        assert_eq!(text(&mut k, s, g), "einfach");
        k.bild(1);
        k.bild(1);
        assert_eq!((k.hash_szene(), k.paket()), (h, &p[..]));
        // voll: Hash anders, STIMMUNG spiegel.w = 1, LICHTER_SPIEGEL direkt hinter LICHTER, mehr Lichter in der Liste
        assert_eq!(k.setze_text(s, g, b"voll"), 0);
        k.bild(1);
        assert_ne!(k.hash_szene(), h);
        let arten: Vec<u32> = Leser::neu(k.paket()).unwrap().abschnitte().map(|(a, _)| a).collect();
        let i = arten.iter().position(|&a| a == abschnitt::LICHTER).unwrap();
        assert_eq!(arten[i + 1], abschnitt::LICHTER_SPIEGEL);
        assert_eq!(f(&abschnitt_von(&k, abschnitt::STIMMUNG).unwrap(), 76), 1.0);
        let einfach = Leser::neu(&p).unwrap().abschnitte().find(|(a, _)| *a == abschnitt::LICHTER).map(|(_, d)| u(d, LICHTER_KOPF_BYTES)).unwrap();
        let voll = u(&abschnitt_von(&k, abschnitt::LICHTER).unwrap(), LICHTER_KOPF_BYTES);
        assert!(voll > einfach, "Lichter nur im Spiegel kommen dazu: {} > {}", voll, einfach);
        // ohne Spiegelung zählt voll nicht
        assert_eq!(k.setze_zahl(s, sp, 0.0), 0);
        k.bild(1);
        assert!(abschnitt_von(&k, abschnitt::LICHTER_SPIEGEL).is_none());
        // wieder einfach + Spiegelung → byte-gleich
        assert_eq!(k.setze_zahl(s, sp, 1.0), 0);
        assert_eq!(k.setze_text(s, g, b"einfach"), 0);
        k.bild(1);
        assert_eq!((k.hash_szene(), k.paket()), (h, &p[..]));
    }

    /// Jeder Weltpunkt im Wirkbereich eines Lichts, der im Spiegelbild zu sehen ist, liegt in einer Spiegel-Zelle, die das
    /// Licht führt (Zelle wie im Shader: Ansicht·Projektion × Spiegelmatrix, Tiefe zur gespiegelten Kamera).
    #[test]
    fn spiegelzellen_konservativ() {
        for &h in &[0.0, 0.15] {
            let mut k = welt();
            let (s, g, _) = szene(&mut k, 300, h);
            assert_eq!(k.setze_text(s, g, b"voll"), 0);
            k.bild(1);
            let d = abschnitt_von(&k, abschnitt::LICHTER).unwrap();
            let ds = abschnitt_von(&k, abschnitt::LICHTER_SPIEGEL).unwrap();
            let sz = abschnitt_von(&k, abschnitt::SZENE).unwrap();
            let vp: Vec<f64> = (0..16).map(|i| f(&sz, i * 4) as f64).collect();
            let kam = [f(&sz, 128) as f64, 2.0 * h - f(&sz, 132) as f64, f(&sz, 136) as f64];
            let (nx, ny, nz) = (f(&ds, 0) as usize, f(&ds, 4) as usize, f(&ds, 8) as usize);
            assert_eq!((nx, ny, nz), (16, 9, 24));
            let (nah, je) = (f(&ds, 16) as f64, f(&ds, 20) as f64);
            let vorn = [f(&ds, 32) as f64, f(&ds, 36) as f64, f(&ds, 40) as f64];
            assert_eq!((vorn[0], vorn[1], vorn[2]), (f(&d, 32) as f64, -f(&d, 36) as f64, f(&d, 40) as f64));
            let anzahl = u(&d, LICHTER_KOPF_BYTES) as usize;
            assert_eq!(f(&ds, 12) as usize, anzahl);
            let worte = u(&d, LICHTER_KOPF_BYTES + 4) as usize;
            let basis = f(&ds, 48) as usize;
            assert_eq!(basis, worte, "Spiegel-Tabelle direkt hinter der ersten");
            let l0 = LICHTER_KOPF_BYTES + 8;
            let wort = |i: usize| u(&ds, LICHTER_KOPF_BYTES + 4 + (i - basis) * 4);
            let mut geprueft = 0;
            for li in 0..anzahl {
                let o = l0 + li * LICHT_BYTES;
                let (lx, ly, lz, rw) = (f(&d, o) as f64, f(&d, o + 4) as f64, f(&d, o + 8) as f64, f(&d, o + 12) as f64);
                for s in 0..64u32 {
                    let z = z4(s * 977 + li as u32 * 13 + 5);
                    let (dx, dy, dz) = ((z[0] - 0.5) * 2.0, (z[1] - 0.5) * 2.0, (z[2] - 0.5) * 2.0);
                    if (dx * dx + dy * dy + dz * dz).sqrt() > 1.0 {
                        continue;
                    }
                    let q = [lx + dx * rw * 0.98, ly + dy * rw * 0.98, lz + dz * rw * 0.98];
                    // im Spiegeldurchgang erscheint q dort, wo sein Spiegelbild im Hauptbild läge
                    let m = [q[0], 2.0 * h - q[1], q[2]];
                    let clip = |r: usize| vp[r] * m[0] + vp[4 + r] * m[1] + vp[8 + r] * m[2] + vp[12 + r];
                    let w = clip(3);
                    if w <= nah {
                        continue;
                    }
                    let (ndx, ndy) = (clip(0) / w, clip(1) / w);
                    if ndx.abs() > 1.0 || ndy.abs() > 1.0 {
                        continue;
                    }
                    let tief = (q[0] - kam[0]) * vorn[0] + (q[1] - kam[1]) * vorn[1] + (q[2] - kam[2]) * vorn[2];
                    let fx = (ndx * 0.5 + 0.5) * nx as f64;
                    let fy = (ndy * 0.5 + 0.5) * ny as f64;
                    let fs = (tief.max(nah) / nah).ln() * je;
                    let nahe = |v: f64| (v - v.round()).abs() < 1e-3;
                    if nahe(fx) || nahe(fy) || nahe(fs) {
                        continue;
                    }
                    let tx = (fx.floor() as usize).min(nx - 1);
                    let ty = (fy.floor() as usize).min(ny - 1);
                    let sl = (fs.floor().max(0.0) as usize).min(nz - 1);
                    let kopf = wort(basis + (sl * ny + ty) * nx + tx);
                    let (erst, zahl) = ((kopf >> 8) as usize, (kopf & 255) as usize);
                    if zahl == MAX_JE_ZELLE {
                        continue;
                    }
                    assert!((0..zahl).any(|j| wort(erst + j) as usize & 0xFFFF == li), "h {}: Licht {} fehlt in Spiegel-Zelle ({}, {}, {})", h, li, tx, ty, sl);
                    geprueft += 1;
                }
            }
            assert!(geprueft > 2000, "{}", geprueft);
        }
    }

    /// Ein Körper und ein schattenwerfendes Licht hoch über dem Bildrand sind nur im Spiegel zu sehen: mit voll zählen sie.
    #[test]
    fn nur_im_spiegel_sichtbar() {
        let mut k = welt();
        let (s, g, _) = szene(&mut k, 0, 0.0);
        let kt = typ(&mut k, "Koerper");
        let form = feld(&mut k, kt, "form");
        let wuerfel = k.form_grund(1, 0.0, 0.0);
        let schild = k.teil_neu(3);
        k.teil_lage(schild, -1.0, 8.0, -2.0);
        let c = k.komp_neu(kt);
        assert_eq!(k.setze_zahl(c, form, wuerfel as f64), 0);
        assert_eq!(k.komp_haenge(c, schild), 0);
        let lt = typ(&mut k, "Licht");
        let t = k.teil_neu(3);
        k.teil_lage(t, -1.0, 8.6, -2.0);
        let l = k.komp_neu(lt);
        let (frw, fg) = (feld(&mut k, lt, "reichweite"), feld(&mut k, lt, "schattenGuete"));
        assert_eq!(k.setze_zahl(l, frw, 0.5), 0);
        // ohne Sonne: keine unsichtbaren Werfer im Paket, die Instanzen zählen nur Sichtbares
        let sonne = k.komp_von(2, lt);
        let fst = feld(&mut k, lt, "staerke");
        assert_eq!(k.setze_zahl(sonne, fst, 0.0), 0);
        assert_eq!(k.komp_haenge(l, t), 0);
        let inst = |k: &Kern| abschnitt_von(k, abschnitt::INST3D).map(|d| d.len() / INST3D_BYTES).unwrap_or(0);
        k.bild(1);
        let n_einfach = inst(&k);
        assert_eq!(k.setze_text(s, g, b"voll"), 0);
        k.bild(2);
        assert_eq!(inst(&k), n_einfach + 1, "Schild nur im Spiegel");
        // Schatten (erst nach dem Zählen – die Kacheln bringen Werfer-Kopien): nur mit voll gewählt
        assert_eq!(k.setze_text(l, fg, b"grob"), 0);
        assert_eq!(k.setze_text(s, g, b"einfach"), 0);
        k.bild(3);
        assert!(abschnitt_von(&k, abschnitt::SCHATTENLICHTER).is_none(), "Licht außerhalb des Frustums wirft keinen Schatten");
        assert_eq!(k.setze_text(s, g, b"voll"), 0);
        k.bild(4);
        assert!(abschnitt_von(&k, abschnitt::SCHATTENLICHTER).is_some(), "Licht nur im Spiegel wirft Schatten");
        let d = abschnitt_von(&k, abschnitt::LICHTER).unwrap();
        assert_eq!(u(&d, LICHTER_KOPF_BYTES), 1);
        assert!(abschnitt_von(&k, abschnitt::LICHTER_SPIEGEL).is_some());
    }
}

/// H-K20: `Figur` (Figur-Steuerung) und `Strahl` (Strahl- und Höhenabfrage als berechnete Lesefelder).
mod hk20 {
    use super::*;

    struct N {
        f: i32,
        f_form: i32,
        f_aus: i32,
        f_radius: i32,
        f_hoehe: i32,
        f_gruppe: i32,
        g: i32,
        lx: i32,
        lz: i32,
        sprung: i32,
        schwer: i32,
        stufe: i32,
        hang: i32,
        haut: i32,
        schieben: i32,
        mitfahren: i32,
        boden_an: i32,
        boden: i32,
        boden_h: i32,
        bny: i32,
        tx: i32,
        ty: i32,
        tz: i32,
        wand: i32,
        decke: i32,
        st: i32,
        rx: i32,
        ry: i32,
        rz: i32,
        achsen: i32,
        laenge: i32,
        s_maske: i32,
        s_aus: i32,
        maus: i32,
        getroffen: i32,
        abstand: i32,
        px: i32,
        py: i32,
        pz: i32,
        nx: i32,
        ny: i32,
        nz: i32,
        kp: i32,
        kp_form: i32,
        wuerfel: i32,
        sw: i32,
    }
    fn nummern(k: &mut Kern) -> N {
        let (f, g, st, kp, sw) = (typ(k, "Fuehler"), typ(k, "Figur"), typ(k, "Strahl"), typ(k, "Koerper"), typ(k, "Schwung"));
        let wuerfel = k.form_grund(1, 0.0, 0.0);
        N {
            f,
            f_form: feld(k, f, "form"),
            f_aus: feld(k, f, "ausloeser"),
            f_radius: feld(k, f, "radius"),
            f_hoehe: feld(k, f, "hoehe"),
            f_gruppe: feld(k, f, "gruppe"),
            g,
            lx: feld(k, g, "laufX"),
            lz: feld(k, g, "laufZ"),
            sprung: feld(k, g, "sprung"),
            schwer: feld(k, g, "schwerkraft"),
            stufe: feld(k, g, "stufe"),
            hang: feld(k, g, "hang"),
            haut: feld(k, g, "haut"),
            schieben: feld(k, g, "schieben"),
            mitfahren: feld(k, g, "mitfahren"),
            boden_an: feld(k, g, "amBoden"),
            boden: feld(k, g, "boden"),
            boden_h: feld(k, g, "bodenHoehe"),
            bny: feld(k, g, "bodenNormaleY"),
            tx: feld(k, g, "tempoX"),
            ty: feld(k, g, "tempoY"),
            tz: feld(k, g, "tempoZ"),
            wand: feld(k, g, "anWand"),
            decke: feld(k, g, "anDecke"),
            st,
            rx: feld(k, st, "richtungX"),
            ry: feld(k, st, "richtungY"),
            rz: feld(k, st, "richtungZ"),
            achsen: feld(k, st, "achsen"),
            laenge: feld(k, st, "laenge"),
            s_maske: feld(k, st, "maske"),
            s_aus: feld(k, st, "ausloeser"),
            maus: feld(k, st, "ausMaus"),
            getroffen: feld(k, st, "getroffen"),
            abstand: feld(k, st, "abstand"),
            px: feld(k, st, "punktX"),
            py: feld(k, st, "punktY"),
            pz: feld(k, st, "punktZ"),
            nx: feld(k, st, "normaleX"),
            ny: feld(k, st, "normaleY"),
            nz: feld(k, st, "normaleZ"),
            kp,
            kp_form: feld(k, kp, "form"),
            wuerfel,
            sw,
        }
    }
    /// fester Quader (Mitte p, Größe g) mit Würfel-Körper und Fühler `kasten`, `ausloeser: nein`
    fn block(k: &mut Kern, n: &N, p: [f64; 3], g: [f64; 3]) -> (i32, i32) {
        let t = k.teil_neu(3);
        k.teil_lage(t, p[0], p[1], p[2]);
        k.teil_groesse(t, g[0], g[1], g[2]);
        let c = k.komp_neu(n.kp);
        k.setze_zahl(c, n.kp_form, n.wuerfel as f64);
        assert_eq!(k.komp_haenge(c, t), 0);
        let f = k.komp_neu(n.f);
        k.setze_zahl(f, n.f_aus, 0.0);
        k.setze_text(f, n.f_form, b"kasten");
        assert_eq!(k.komp_haenge(f, t), 0);
        (t, f)
    }
    /// Boden 60 × 1 × 60, Oberkante y = 0
    fn boden(k: &mut Kern, n: &N) -> i32 {
        block(k, n, [0.0, -0.5, 0.0], [60.0, 1.0, 60.0]).0
    }
    /// Figur: Kapsel Radius 0.3, Höhe 1.8, Fuß bei p (Mitte 0.9 darüber); gibt (Teil, Figur)
    fn figur(k: &mut Kern, n: &N, p: [f64; 3]) -> (i32, i32) {
        let t = k.teil_neu(3);
        k.teil_lage(t, p[0], p[1] + 0.9, p[2]);
        let f = k.komp_neu(n.f);
        k.setze_text(f, n.f_form, b"kapsel");
        k.setze_zahl(f, n.f_radius, 0.3);
        k.setze_zahl(f, n.f_hoehe, 1.8);
        k.setze_zahl(f, n.f_aus, 0.0);
        assert_eq!(k.komp_haenge(f, t), 0);
        let g = k.komp_neu(n.g);
        assert_eq!(k.komp_haenge(g, t), 0, "{}", k.fehler_text());
        (t, g)
    }
    fn takte(k: &mut Kern, n: usize) {
        for _ in 0..n {
            k.takt();
        }
    }
    fn fuss(k: &mut Kern, t: i32) -> f64 {
        k.teil_hole(t, tf::Y) - 0.9
    }
    /// Gelände spalten × zeilen (Weite 1) mit Höhe h(x, z) in lokalen Koordinaten, fester Netz-Fühler; gibt (Teil, Höhen)
    fn gelaende(k: &mut Kern, n: &N, sp: usize, ze: usize, h: impl Fn(f64, f64) -> f64) -> (i32, Vec<f64>) {
        let gt = typ(k, "Gelaende");
        let (gh, gsp, gze) = (feld(k, gt, "hoehen"), feld(k, gt, "spalten"), feld(k, gt, "zeilen"));
        let mut hoehen = Vec::new();
        for j in 0..ze {
            for i in 0..sp {
                hoehen.push(h(i as f64 - (sp - 1) as f64 / 2.0, j as f64 - (ze - 1) as f64 / 2.0));
            }
        }
        let land = k.teil_neu(3);
        let g = k.komp_neu(gt);
        k.setze_zahl(g, gsp, sp as f64);
        k.setze_zahl(g, gze, ze as f64);
        k.setze_zahlen(g, gh, &hoehen);
        assert_eq!(k.komp_haenge(g, land), 0);
        let f = k.komp_neu(n.f);
        k.setze_text(f, n.f_form, b"netz");
        k.setze_zahl(f, n.f_aus, 0.0);
        assert_eq!(k.komp_haenge(f, land), 0);
        (land, hoehen)
    }
    fn strahl(k: &mut Kern, n: &N, p: [f64; 3], r: [f64; 3]) -> (i32, i32) {
        let t = k.teil_neu(3);
        k.teil_lage(t, p[0], p[1], p[2]);
        let s = k.komp_neu(n.st);
        k.setze_zahl(s, n.rx, r[0]);
        k.setze_zahl(s, n.ry, r[1]);
        k.setze_zahl(s, n.rz, r[2]);
        assert_eq!(k.komp_haenge(s, t), 0);
        (t, s)
    }
    fn treffer(k: &mut Kern, n: &N, s: i32) -> (f64, f64, [f64; 3], [f64; 3]) {
        (
            k.hole_zahl(s, n.getroffen),
            k.hole_zahl(s, n.abstand),
            [k.hole_zahl(s, n.px), k.hole_zahl(s, n.py), k.hole_zahl(s, n.pz)],
            [k.hole_zahl(s, n.nx), k.hole_zahl(s, n.ny), k.hole_zahl(s, n.nz)],
        )
    }
    fn nah(a: [f64; 3], b: [f64; 3], e: f64) -> bool {
        (0..3).all(|i| (a[i] - b[i]).abs() <= e)
    }

    #[test]
    fn schema_typnummern_braucht_lesefelder() {
        let mut k = welt();
        let n = nummern(&mut k);
        assert_eq!((n.g, n.st), (33, 34), "Typnummern in Merge-Reihenfolge nach Schwung (32)");
        let art = ARTEN.iter().find(|a| a.schema.name == "Figur").unwrap();
        assert!(art.takt.is_some() && art.nachlauf.is_none() && art.bild.is_none() && art.lies.is_some());
        let art = ARTEN.iter().find(|a| a.schema.name == "Strahl").unwrap();
        assert!(art.takt.is_none() && art.nachlauf.is_none() && art.bild.is_none() && art.lies.is_some());
        let t = k.teil_neu(3);
        let g = k.komp_neu(n.g);
        assert!(k.komp_haenge(g, t) < 0);
        assert_eq!(k.fehler_text(), "Figur braucht einen Fuehler am selben Teil.");
        let f = k.komp_neu(n.f);
        assert_eq!(k.komp_haenge(f, t), 0);
        assert_eq!(k.komp_haenge(g, t), 0);
        assert_eq!(
            (k.hole_zahl(g, n.schwer), k.hole_zahl(g, n.stufe), k.hole_zahl(g, n.hang), k.hole_zahl(g, n.haut), k.hole_zahl(g, n.mitfahren)),
            (9.81, 0.3, 45.0, 0.02, 1.0)
        );
        assert!(k.setze_zahl(g, n.boden_an, 1.0) < 0);
        assert_eq!(k.fehler_text(), "Figur.amBoden kann man nur lesen.");
        assert!(k.setze_zahl(g, n.hang, 95.0) < 0);
        let t2 = k.teil_neu(2);
        let s2 = k.komp_neu(n.st);
        assert!(k.komp_haenge(s2, t2) < 0, "Strahl nur 3D");
        let (_, s) = strahl(&mut k, &n, [0.0, 5.0, 0.0], [0.0, -1.0, 0.0]);
        assert_eq!((k.hole_zahl(s, n.ry), k.hole_zahl(s, n.laenge), k.hole_zahl(s, n.s_maske)), (-1.0, 1000.0, 4294967295.0));
        assert!(k.setze_zahl(s, n.abstand, 1.0) < 0);
        assert!(k.setze_text(s, n.achsen, b"kamera") < 0);
        assert_eq!(k.fehler_text(), "Strahl.achsen kennt 'kamera' nicht. Erlaubt: welt, teil.");
    }

    #[test]
    fn faellt_landet_und_steht() {
        let mut k = welt();
        let n = nummern(&mut k);
        let b = boden(&mut k, &n);
        let (t, g) = figur(&mut k, &n, [0.0, 2.0, 0.0]);
        let mut gelandet = 0;
        for i in 0..120 {
            k.takt();
            if gelandet == 0 && k.hole_zahl(g, n.boden_an) == 1.0 {
                gelandet = i;
            }
        }
        // Fall aus 2 m: √(2 · 2 / 9.81) ≈ 0,64 s ≈ 38 Takte
        assert!((35..=42).contains(&gelandet), "gelandet nach {} Takten", gelandet);
        let y = fuss(&mut k, t);
        assert!((y - 0.02).abs() < 0.005, "steht mit Haut über dem Boden: {}", y);
        assert_eq!(k.hole_zahl(g, n.boden), b as f64);
        assert_eq!((k.hole_zahl(g, n.bny), k.hole_zahl(g, n.ty)), (1.0, 0.0));
        assert!(k.hole_zahl(g, n.boden_h).abs() < 0.02);
        takte(&mut k, 60);
        assert_eq!(fuss(&mut k, t), y, "steht still (bitgleich)");
        // ohne Schwerkraft schwebt sie
        let (t2, g2) = figur(&mut k, &n, [5.0, 3.0, 0.0]);
        k.setze_zahl(g2, n.schwer, 0.0);
        takte(&mut k, 30);
        assert_eq!(fuss(&mut k, t2), 3.0);
        assert_eq!(k.hole_zahl(g2, n.boden_an), 0.0);
        // entfernter Boden liest sich als karton
        k.teil_entferne(b);
        assert_eq!(k.hole_zahl(g, n.boden), 0.0);
        takte(&mut k, 20);
        assert!(fuss(&mut k, t) < -0.3, "fällt ohne Boden");
    }

    #[test]
    fn laeuft_und_gleitet_an_der_wand() {
        let mut k = welt();
        let n = nummern(&mut k);
        boden(&mut k, &n);
        // Wand entlang x bei z = −2 (Vorderseite z = −1.5)
        block(&mut k, &n, [0.0, 1.5, -2.0], [40.0, 3.0, 1.0]);
        let (t, g) = figur(&mut k, &n, [0.0, 0.0, 0.0]);
        takte(&mut k, 5);
        k.setze_zahl(g, n.lx, 3.0);
        takte(&mut k, 30);
        assert!((k.hole_zahl(g, n.tx) - 3.0).abs() < 1e-9, "läuft mit Wunschtempo: {}", k.hole_zahl(g, n.tx));
        assert!((k.teil_hole(t, tf::X) - 1.5).abs() < 1e-9);
        // schräg in die Wand: gleitet mit dem Anteil entlang der Wand weiter
        k.setze_zahl(g, n.lz, -3.0);
        takte(&mut k, 60);
        let z = k.teil_hole(t, tf::Z);
        assert!((z - (-1.5 + 0.32)).abs() < 0.01, "an der Wand: z = {}", z);
        assert!((k.hole_zahl(g, n.tx) - 3.0).abs() < 1e-6, "gleitet mit vollem x-Tempo: {}", k.hole_zahl(g, n.tx));
        assert_eq!(k.hole_zahl(g, n.wand), 1.0);
        assert_eq!(k.hole_zahl(g, n.boden_an), 1.0);
        assert!(fuss(&mut k, t).abs() < 0.03, "bleibt am Boden: {}", fuss(&mut k, t));
        // geradewegs in die Wand: steht
        k.setze_zahl(g, n.lx, 0.0);
        let x = k.teil_hole(t, tf::X);
        takte(&mut k, 10);
        assert!((k.teil_hole(t, tf::X) - x).abs() < 1e-9 && (k.teil_hole(t, tf::Z) - z).abs() < 1e-6);
        assert!(k.hole_zahl(g, n.tx).abs() < 1e-6 && k.hole_zahl(g, n.tz).abs() < 1e-6);
    }

    #[test]
    fn treppe_hoch_und_runter() {
        let mut k = welt();
        let n = nummern(&mut k);
        boden(&mut k, &n);
        // 6 Stufen à 0.2 hoch, 0.4 tief ab x = 1; danach ein Absatz; dazu eine Stufe 0.5 (zu hoch) bei z = 6
        for i in 0..6 {
            let h = 0.2 * (i + 1) as f64;
            block(&mut k, &n, [1.2 + 0.4 * i as f64, h / 2.0, 0.0], [0.4, h, 3.0]);
        }
        block(&mut k, &n, [5.0, 0.6, 0.0], [3.2, 1.2, 3.0]);
        block(&mut k, &n, [2.0, 0.25, 6.0], [1.0, 0.5, 3.0]);
        let (t, g) = figur(&mut k, &n, [-1.0, 0.0, 0.0]);
        let (t2, g2) = figur(&mut k, &n, [-1.0, 0.0, 6.0]);
        takte(&mut k, 10);
        k.setze_zahl(g, n.lx, 2.0);
        k.setze_zahl(g2, n.lx, 2.0);
        let mut am_boden = 0;
        for _ in 0..200 {
            k.takt();
            am_boden += k.hole_zahl(g, n.boden_an) as usize;
        }
        assert!(k.teil_hole(t, tf::X) > 4.5, "oben angekommen: x = {}", k.teil_hole(t, tf::X));
        assert!((fuss(&mut k, t) - 1.22).abs() < 0.03, "auf dem Absatz: {}", fuss(&mut k, t));
        assert!(am_boden >= 190, "die Treppe hinauf fast immer am Boden: {} von 200", am_boden);
        // zu hohe Stufe: bleibt davor
        assert!(k.teil_hole(t2, tf::X) < 1.5 - 0.3 + 0.01, "0.5 ist zu hoch: x = {}", k.teil_hole(t2, tf::X));
        assert!(fuss(&mut k, t2).abs() < 0.03);
        assert_eq!(k.hole_zahl(g2, n.wand), 1.0);
        // hinunter: klebt an jeder Stufe (nie in der Luft)
        k.setze_zahl(g, n.lx, -2.0);
        let mut luft = 0;
        let mut tiefster = f64::INFINITY;
        for _ in 0..200 {
            k.takt();
            if k.hole_zahl(g, n.boden_an) == 0.0 {
                luft += 1;
            }
            let y = fuss(&mut k, t);
            if y < tiefster {
                tiefster = y;
            }
        }
        assert_eq!(luft, 0, "Treppe hinab ohne Abheben");
        assert!(k.teil_hole(t, tf::X) < 0.0 && fuss(&mut k, t).abs() < 0.03);
        assert!(tiefster > -0.01, "nie unter den Boden: {}", tiefster);
        // mit stufe 0 kommt sie nicht hinauf
        k.setze_zahl(g, n.stufe, 0.0);
        k.setze_zahl(g, n.lx, 2.0);
        takte(&mut k, 90);
        assert!(k.teil_hole(t, tf::X) < 1.0, "ohne Stufe: x = {}", k.teil_hole(t, tf::X));
    }

    #[test]
    fn hang_begehbar_und_zu_steil() {
        // Rampen als Gelände in +x: 30° (begehbar), genau 45° (gerade noch), 60° (zu steil)
        for &(grad, hinauf) in &[(30.0, true), (45.0, true), (60.0, false)] {
            let mut k = welt();
            let n = nummern(&mut k);
            let neig = libm::tan(grad * crate::welt::GRAD);
            gelaende(&mut k, &n, 21, 9, |x, _| if x > 0.0 { x * neig } else { 0.0 });
            let (t, g) = figur(&mut k, &n, [-4.0, 0.5, 0.0]);
            takte(&mut k, 40);
            assert_eq!(k.hole_zahl(g, n.boden_an), 1.0, "{}°: steht vor dem Hang", grad);
            k.setze_zahl(g, n.lx, 2.0);
            let mut wand = 0;
            for i in 0..240 {
                k.takt();
                if i >= 180 {
                    wand += k.hole_zahl(g, n.wand) as usize;
                }
            }
            let x = k.teil_hole(t, tf::X);
            if hinauf {
                assert!(x > 3.0, "{}°: geht hinauf (x = {})", grad, x);
                let y = fuss(&mut k, t);
                assert!(y > x * neig - 0.5, "{}°: auf dem Hang (y = {}, x = {})", grad, y, x);
                assert!((k.hole_zahl(g, n.bny) - libm::cos(grad * crate::welt::GRAD)).abs() < 1e-6, "{}°: Normale {}", grad, k.hole_zahl(g, n.bny));
            } else {
                assert!(x < 0.6, "{}°: kommt nicht hinauf (x = {})", grad, x);
                assert!(wand > 0, "{}°: stößt an den Hang", grad);
                // oben abgesetzt rutscht sie hinunter
                k.setze_zahl(g, n.lx, 0.0);
                k.teil_lage(t, 2.0, 2.0 * neig + 1.6, 0.0);
                takte(&mut k, 90);
                assert!(k.teil_hole(t, tf::X) < 0.6, "{}°: rutscht hinab (x = {})", grad, k.teil_hole(t, tf::X));
            }
        }
    }

    #[test]
    fn faehrt_mit_plattformen() {
        let mut k = welt();
        let n = nummern(&mut k);
        boden(&mut k, &n);
        // kinematische Plattform (Schwung) fährt in +x, ein Aufzug (vom Programm gesetzt) fährt hoch
        let (p, _) = block(&mut k, &n, [0.0, 0.5, 0.0], [3.0, 0.2, 3.0]);
        let s = k.komp_neu(n.sw);
        assert_eq!(k.komp_haenge(s, p), 0);
        let art = feld(&mut k, n.sw, "art");
        k.setze_text(s, art, b"kinematisch");
        let (t, g) = figur(&mut k, &n, [0.0, 0.62, 0.0]);
        let (auf, _) = block(&mut k, &n, [8.0, 0.5, 0.0], [2.0, 0.2, 2.0]);
        let (t2, g2) = figur(&mut k, &n, [8.0, 0.62, 0.0]);
        let (t3, g3) = figur(&mut k, &n, [0.5, 0.62, 0.8]);
        k.setze_zahl(g3, n.mitfahren, 0.0);
        takte(&mut k, 20);
        assert_eq!((k.hole_zahl(g, n.boden), k.hole_zahl(g2, n.boden)), (p as f64, auf as f64));
        let tx = feld(&mut k, n.sw, "tempoX");
        k.setze_zahl(s, tx, 1.5);
        let x0 = k.teil_hole(t, tf::X);
        let x3 = k.teil_hole(t3, tf::X);
        for i in 0..60 {
            k.teil_lage(auf, 8.0, 0.5 + (i + 1) as f64 * 0.02, 0.0);
            k.takt();
            assert_eq!(k.hole_zahl(g2, n.boden_an), 1.0, "Aufzug: am Boden in Takt {}", i);
        }
        let dx = k.teil_hole(t, tf::X) - x0;
        assert!((dx - 1.5).abs() < 0.03, "fährt mit: {}", dx);
        assert!(k.hole_zahl(g, n.tx).abs() < 1e-6, "tempo ohne Mitfahren: {}", k.hole_zahl(g, n.tx));
        assert!((fuss(&mut k, t2) - (0.6 + 1.2 + 0.02)).abs() < 0.02, "Aufzug oben: {}", fuss(&mut k, t2));
        assert!((k.teil_hole(t3, tf::X) - x3).abs() < 1.0, "ohne mitfahren fährt sie nicht mit: {}", k.teil_hole(t3, tf::X) - x3);
    }

    #[test]
    fn springt_nur_am_boden_und_stoesst_an_die_decke() {
        let mut k = welt();
        let n = nummern(&mut k);
        boden(&mut k, &n);
        let (t, g) = figur(&mut k, &n, [0.0, 0.0, 0.0]);
        takte(&mut k, 10);
        let y0 = fuss(&mut k, t);
        k.setze_zahl(g, n.sprung, 5.0);
        let mut hoch = y0;
        let mut landung = 0;
        for i in 0..90 {
            k.takt();
            assert_eq!(k.hole_zahl(g, n.sprung), 0.0, "sprung wird verbraucht");
            let y = fuss(&mut k, t);
            if y > hoch {
                hoch = y;
            }
            if i > 2 && landung == 0 && k.hole_zahl(g, n.boden_an) == 1.0 {
                landung = i;
            }
        }
        let soll = 25.0 / (2.0 * 9.81);
        assert!((hoch - y0 - soll).abs() < 0.06, "Sprunghöhe {} statt {}", hoch - y0, soll);
        assert!((58..=64).contains(&landung), "landet nach {} Takten", landung);
        // in der Luft zählt kein Sprung
        k.setze_zahl(g, n.schwer, 0.0);
        k.teil_lage(t, 0.0, 3.0, 0.0);
        takte(&mut k, 2);
        k.setze_zahl(g, n.sprung, 5.0);
        takte(&mut k, 5);
        assert_eq!(k.teil_hole(t, tf::Y), 3.0);
        // Decke: Sprung unter einem Brett 1 m über dem Kopf
        let (t2, g2) = figur(&mut k, &n, [6.0, 0.0, 0.0]);
        block(&mut k, &n, [6.0, 2.9, 0.0], [2.0, 0.2, 2.0]);
        takte(&mut k, 10);
        k.setze_zahl(g2, n.sprung, 6.0);
        let mut decke = false;
        let mut hoch = 0.0f64;
        for _ in 0..60 {
            k.takt();
            decke |= k.hole_zahl(g2, n.decke) == 1.0;
            hoch = hoch.max(fuss(&mut k, t2));
        }
        assert!(decke, "anDecke");
        assert!(hoch < 2.8 - 1.8 + 0.01, "Kopf bleibt unter dem Brett: Fuß {}", hoch);
        assert!(fuss(&mut k, t2).abs() < 0.03 && k.hole_zahl(g2, n.boden_an) == 1.0, "wieder unten");
    }

    #[test]
    fn figuren_untereinander_und_schieben() {
        let mut k = welt();
        let n = nummern(&mut k);
        boden(&mut k, &n);
        let (a, ga) = figur(&mut k, &n, [-2.0, 0.0, 0.0]);
        let (b, gb) = figur(&mut k, &n, [2.0, 0.0, 0.0]);
        takte(&mut k, 5);
        k.setze_zahl(ga, n.lx, 2.0);
        k.setze_zahl(gb, n.lx, -2.0);
        takte(&mut k, 90);
        let abstand = k.teil_hole(b, tf::X) - k.teil_hole(a, tf::X);
        assert!(abstand > 0.3 + 0.32 - 1e-6, "laufen nicht ineinander (Haut der laufenden Figur): {}", abstand);
        assert_eq!((k.hole_zahl(ga, n.wand), k.hole_zahl(gb, n.wand)), (1.0, 1.0));
        // dynamische Kiste: hält die Figur auf wie eine Wand, `schieben` stößt sie an
        let (kiste, _) = block(&mut k, &n, [0.0, 0.5, 5.0], [1.0, 1.0, 1.0]);
        let ks = k.komp_neu(n.sw);
        assert_eq!(k.komp_haenge(ks, kiste), 0);
        let sg = feld(&mut k, n.sw, "schwerkraft");
        k.setze_zahl(ks, sg, 9.81);
        let (c, gc) = figur(&mut k, &n, [-2.0, 0.0, 5.0]);
        let (kiste2, _) = block(&mut k, &n, [0.0, 0.5, 9.0], [1.0, 1.0, 1.0]);
        let ks2 = k.komp_neu(n.sw);
        assert_eq!(k.komp_haenge(ks2, kiste2), 0);
        k.setze_zahl(ks2, sg, 9.81);
        let (c2, gc2) = figur(&mut k, &n, [-2.0, 0.0, 9.0]);
        k.setze_zahl(gc, n.schieben, 15.0);
        takte(&mut k, 10);
        k.setze_zahl(gc, n.lx, 2.0);
        k.setze_zahl(gc2, n.lx, 2.0);
        takte(&mut k, 120);
        assert!(k.teil_hole(kiste, tf::X) > 1.0, "Kiste geschoben: {}", k.teil_hole(kiste, tf::X));
        assert!(k.teil_hole(kiste, tf::X) - k.teil_hole(c, tf::X) > 0.5 + 0.3 - 0.01, "Figur bleibt vor der Kiste");
        assert!(k.teil_hole(kiste2, tf::X).abs() < 0.05, "ohne schieben bleibt die Kiste: {}", k.teil_hole(kiste2, tf::X));
        assert!((k.teil_hole(c2, tf::X) - (-0.5 - 0.32)).abs() < 0.01, "steht vor der Kiste: {}", k.teil_hole(c2, tf::X));
        assert_eq!(k.hole_zahl(gc2, n.wand), 1.0);
    }

    #[test]
    fn strahl_gegen_jede_form() {
        let mut k = welt();
        let n = nummern(&mut k);
        // Kugel r 1 bei (0, 0, 0) – Fühler-Standard ist ausloeser ja: zählt nur mit Strahl.ausloeser ja
        let ku = k.teil_neu(3);
        let f = k.komp_neu(n.f);
        k.setze_text(f, n.f_form, b"kugel");
        k.setze_zahl(f, n.f_radius, 1.0);
        k.komp_haenge(f, ku);
        let (_, s) = strahl(&mut k, &n, [0.0, 5.0, 0.0], [0.0, -1.0, 0.0]);
        assert_eq!(k.hole_zahl(s, n.getroffen), 0.0, "Auslöser übergangen");
        k.setze_zahl(s, n.s_aus, 1.0);
        let (g, d, p, nn) = treffer(&mut k, &n, s);
        assert_eq!((g, d, p, nn), (ku as f64, 4.0, [0.0, 1.0, 0.0], [0.0, 1.0, 0.0]));
        k.setze_zahl(f, n.f_aus, 0.0);
        k.setze_zahl(s, n.s_aus, 0.0);
        assert_eq!(k.hole_zahl(s, n.getroffen), ku as f64);
        // von der Seite: Normale = Richtung von der Mitte
        let (ts, s2) = strahl(&mut k, &n, [-5.0, 0.6, 0.0], [1.0, 0.0, 0.0]);
        let (g, d, p, nn) = treffer(&mut k, &n, s2);
        assert_eq!(g, ku as f64);
        assert!((d - (5.0 - 0.8)).abs() < 1e-12 && nah(p, [-0.8, 0.6, 0.0], 1e-12) && nah(nn, [-0.8, 0.6, 0.0], 1e-12), "{} {:?} {:?}", d, p, nn);
        // gedrehter Kasten 2 × 2 × 2 bei (6, 0, 0), um y 45°: Kante zeigt zum Strahl
        let (kb, _) = block(&mut k, &n, [6.0, 0.0, 0.0], [2.0, 2.0, 2.0]);
        k.teil_setze(kb, tf::DREHUNG, 45.0);
        k.teil_lage(ts, 3.0, 0.0, 0.0);
        let (g, d, _, nn) = treffer(&mut k, &n, s2);
        assert_eq!(g, kb as f64);
        assert!((d - (3.0 - libm::sqrt(2.0))).abs() < 1e-9, "Kastenkante bei {}", d);
        assert!(nn[1].abs() < 1e-12 && (nn[0] + libm::sqrt(0.5)).abs() < 1e-9, "Fläche: {:?}", nn);
        // Kapsel (Achse y, r 0.5, Höhe 3) bei (0, 0, 6): Mantel von der Seite, Kuppe von oben
        let kt = k.teil_neu(3);
        k.teil_lage(kt, 0.0, 0.0, 6.0);
        let kf = k.komp_neu(n.f);
        k.setze_text(kf, n.f_form, b"kapsel");
        k.setze_zahl(kf, n.f_radius, 0.5);
        k.setze_zahl(kf, n.f_hoehe, 3.0);
        k.setze_zahl(kf, n.f_aus, 0.0);
        k.komp_haenge(kf, kt);
        let (_, s3) = strahl(&mut k, &n, [0.0, 1.0, 10.0], [0.0, 0.0, -1.0]);
        let (g, d, _, nn) = treffer(&mut k, &n, s3);
        assert_eq!(g, kt as f64);
        assert!((d - 3.5).abs() < 1e-12 && nah(nn, [0.0, 0.0, 1.0], 1e-12), "Mantel {} {:?}", d, nn);
        let (_, s4) = strahl(&mut k, &n, [0.0, 10.0, 6.0], [0.0, -1.0, 0.0]);
        let (g, d, _, nn) = treffer(&mut k, &n, s4);
        assert_eq!(g, kt as f64);
        assert!((d - 8.5).abs() < 1e-12 && nah(nn, [0.0, 1.0, 0.0], 1e-12), "Kuppe {} {:?}", d, nn);
        // Netz: schräges Dreieck aus einem eigenen Netz (Vorderseite oben), Rückseite trifft nicht
        let rampe = k.form_eigene(&[0.0, 0.0, 0.0, 4.0, 0.0, 0.0, 4.0, 2.0, -4.0], &[0.0, 1.0, 2.0], 0);
        assert!(rampe > 0, "{}", k.fehler_text());
        let rt = k.teil_neu(3);
        k.teil_lage(rt, 10.0, 0.0, 10.0);
        let rk = k.komp_neu(n.kp);
        k.setze_zahl(rk, n.kp_form, rampe as f64);
        k.komp_haenge(rk, rt);
        let rf = k.komp_neu(n.f);
        k.setze_text(rf, n.f_form, b"netz");
        k.setze_zahl(rf, n.f_aus, 0.0);
        k.komp_haenge(rf, rt);
        let (rs, s5) = strahl(&mut k, &n, [13.0, 5.0, 8.0], [0.0, -1.0, 0.0]);
        let (g, d, p, nn) = treffer(&mut k, &n, s5);
        assert_eq!(g, rt as f64, "Netz von oben");
        // Ebene durch (0,0,0), (4,0,0), (4,2,−4): y = −z/2 → bei z = −2 (lokal) y = 1
        assert!((p[1] - 1.0).abs() < 1e-9 && (d - 4.0).abs() < 1e-9, "{:?}", p);
        assert!((nn[1] - 2.0 / libm::sqrt(5.0)).abs() < 1e-9 && (nn[2] - 1.0 / libm::sqrt(5.0)).abs() < 1e-9, "{:?}", nn);
        k.teil_lage(rs, 13.0, -5.0, 8.0);
        k.setze_zahl(s5, n.ry, 1.0);
        assert_eq!(k.hole_zahl(s5, n.getroffen), 0.0, "Rückseite");
        // achsen teil: Strahl-Teil um x geneigt → richtung (0, −1, 0) zeigt in Weltachsen nach −z
        let (at, s6) = strahl(&mut k, &n, [0.0, 0.0, 20.0], [0.0, -1.0, 0.0]);
        k.setze_text(s6, n.achsen, b"teil");
        k.teil_setze(at, tf::NEIGUNG, 90.0);
        let mut richtung = (0.0, 0.0);
        for neig in [90.0, -90.0] {
            k.teil_setze(at, tf::NEIGUNG, neig);
            if k.hole_zahl(s6, n.getroffen) == kt as f64 {
                richtung = (neig, k.hole_zahl(s6, n.abstand));
            }
        }
        assert!((richtung.1 - (20.0 - 6.5)).abs() < 1e-9, "achsen teil: {:?}", richtung);
        k.teil_setze(at, tf::NEIGUNG, richtung.0);
        // Maske: Gruppe 3 nur mit Bit 2
        k.setze_zahl(kf, n.f_gruppe, 3.0);
        k.setze_zahl(s6, n.s_maske, 3.0);
        assert_eq!(k.hole_zahl(s6, n.getroffen), ku as f64, "an der Kapsel vorbei bis zur Kugel");
        k.setze_zahl(s6, n.s_maske, 4.0);
        assert_eq!(k.hole_zahl(s6, n.getroffen), kt as f64);
        // eigenes Teil nie; Länge zu kurz; Richtung 0; loser Strahl
        let fe = k.komp_neu(n.f);
        k.setze_text(fe, n.f_form, b"kugel");
        k.setze_zahl(fe, n.f_radius, 2.0);
        k.setze_zahl(fe, n.f_aus, 0.0);
        k.komp_haenge(fe, at);
        assert_eq!(k.hole_zahl(s6, n.getroffen), kt as f64, "eigenes Teil zählt nicht");
        k.setze_zahl(s6, n.laenge, 10.0);
        assert_eq!(treffer(&mut k, &n, s6), (0.0, 0.0, [0.0; 3], [0.0; 3]), "zu kurz: alles 0");
        k.setze_zahl(s6, n.laenge, 1000.0);
        k.setze_zahl(s6, n.ry, 0.0);
        assert_eq!(k.hole_zahl(s6, n.getroffen), 0.0, "Richtung 0");
        let los = k.komp_neu(n.st);
        assert_eq!(k.hole_zahl(los, n.getroffen), 0.0);
        // Gleichstand: zwei gleiche Kugeln an derselben Stelle → kleinere ID
        let mut kugeln = Vec::new();
        for _ in 0..2 {
            let t = k.teil_neu(3);
            k.teil_lage(t, 30.0, 0.0, 0.0);
            let f = k.komp_neu(n.f);
            k.setze_text(f, n.f_form, b"kugel");
            k.setze_zahl(f, n.f_radius, 1.0);
            k.setze_zahl(f, n.f_aus, 0.0);
            k.komp_haenge(f, t);
            kugeln.push(t);
        }
        let (_, s7) = strahl(&mut k, &n, [30.0, 5.0, 0.0], [0.0, -1.0, 0.0]);
        assert_eq!(k.hole_zahl(s7, n.getroffen), kugeln[0] as f64);
        // unsichtbar trifft nicht
        k.teil_setze(kugeln[0], tf::SICHTBAR, 0.0);
        assert_eq!(k.hole_zahl(s7, n.getroffen), kugeln[1] as f64);
        // ein Strahl in einer Kugel trifft sie nicht (nur der Eintritt zählt)
        k.teil_lage(kugeln[1], 30.0, 5.0, 0.0);
        k.setze_zahl(s7, n.rz, 0.0);
        assert_eq!(k.hole_zahl(s7, n.getroffen), 0.0);
    }

    #[test]
    fn hoehe_ueber_gelaende_wie_das_netz() {
        let mut k = welt();
        let n = nummern(&mut k);
        let h = |x: f64, z: f64| libm::sin(x * 0.7) * 1.3 + libm::cos(z * 0.45) * 0.8 + x * 0.05;
        let (land, hoehen) = gelaende(&mut k, &n, 33, 25, h);
        k.teil_lage(land, 2.0, -1.0, 3.0);
        k.takt(); // Netz bauen
        let (lt, lot) = strahl(&mut k, &n, [0.0, 500.0, 0.0], [0.0, -1.0, 0.0]);
        let mut i = 0;
        for a in 0..23 {
            for b in 0..17 {
                let (x, z) = (-13.7 + a as f64 * 1.21, -9.3 + b as f64 * 1.07);
                k.teil_lage(lt, x + 2.0, 500.0, z + 3.0);
                let soll = crate::komponenten::gelaende::hoehe(&hoehen, 33, 25, 1.0, x, z).unwrap() - 1.0;
                assert_eq!(k.hole_zahl(lot, n.getroffen), land as f64);
                let y = k.hole_zahl(lot, n.py);
                assert!((y - soll).abs() < 1e-9, "({}, {}): {} gegen {}", x, z, y, soll);
                assert!((k.hole_zahl(lot, n.abstand) - (500.0 - y)).abs() < 1e-9);
                assert!(k.hole_zahl(lot, n.ny) > 0.0);
                i += 1;
            }
        }
        assert_eq!(i, 391);
        // neben dem Gelände: kein Treffer
        k.teil_lage(lt, 40.0, 500.0, 0.0);
        assert_eq!(k.hole_zahl(lot, n.getroffen), 0.0);
        // schräger Strahl übers Gelände: trifft dort, wo die Höhe des Netzes gleich der Strahlhöhe ist
        k.teil_lage(lt, -12.0, 6.0, 1.0);
        k.setze_zahl(lot, n.rx, 1.0);
        k.setze_zahl(lot, n.ry, -0.3);
        assert_eq!(k.hole_zahl(lot, n.getroffen), land as f64);
        let (px, py, pz) = (k.hole_zahl(lot, n.px), k.hole_zahl(lot, n.py), k.hole_zahl(lot, n.pz));
        let netz = crate::komponenten::gelaende::hoehe(&hoehen, 33, 25, 1.0, px - 2.0, pz - 3.0).unwrap() - 1.0;
        assert!((py - netz).abs() < 1e-9, "schräg: {} gegen {}", py, netz);
        // davor ist der Strahl noch über dem Netz
        let l = libm::sqrt(1.09);
        let ab = k.hole_zahl(lot, n.abstand);
        for s in 1..40 {
            let t = ab * s as f64 / 40.0;
            let (x, y) = (-12.0 + t / l, 6.0 - 0.3 * t / l);
            if let Some(hh) = crate::komponenten::gelaende::hoehe(&hoehen, 33, 25, 1.0, x - 2.0, 1.0 - 3.0) {
                assert!(y >= hh - 1.0 - 1e-9, "vorher über dem Netz bei t = {}", t);
            }
        }
    }

    #[test]
    fn strahl_aus_der_maus_und_zwischenergebnis() {
        let mut k = welt();
        let n = nummern(&mut k);
        // Kamera (Teil 1) bei (0, 2, 10) blickt nach −z; Ziel: Kasten bei (0, 2, 0)
        k.teil_lage(1, 0.0, 2.0, 10.0);
        k.teil_schaue(1, 0.0, 2.0, 0.0);
        let (kb, _) = block(&mut k, &n, [0.0, 2.0, 0.0], [2.0, 2.0, 2.0]);
        let (_, s) = strahl(&mut k, &n, [50.0, 50.0, 50.0], [0.0, -1.0, 0.0]);
        k.setze_zahl(s, n.maus, 1.0);
        k.eingabe(320.0, 180.0, 0);
        let (g, d, p, _) = treffer(&mut k, &n, s);
        assert_eq!(g, kb as f64);
        assert!((d - 9.0).abs() < 1e-9 && nah(p, [0.0, 2.0, 1.0], 1e-9), "Mitte: {} {:?}", d, p);
        // rechter Rand in Bildmitte-Höhe: Richtung (tan 30° · 640/360, 0, −1)
        k.eingabe(640.0, 180.0, 0);
        let f = libm::tan(30.0 * crate::welt::GRAD) * 640.0 / 360.0;
        assert_eq!(k.hole_zahl(s, n.getroffen), 0.0, "am Rand vorbei");
        let (bx, _) = block(&mut k, &n, [f * 10.0, 2.0, 0.0], [1.0, 1.0, 1.0]);
        let (g, _, p, _) = treffer(&mut k, &n, s);
        assert_eq!(g, bx as f64);
        assert!((p[0] / (10.0 - p[2]) - f).abs() < 1e-9 && (p[1] - 2.0).abs() < 1e-9, "{:?}", p);
        // Zwischenergebnis: gleich bis zur nächsten Änderung, dann neu
        let stand = k.welt.as_ref().unwrap().stand;
        for _ in 0..5 {
            assert_eq!(k.hole_zahl(s, n.getroffen), bx as f64);
        }
        assert_eq!(k.welt.as_ref().unwrap().stand, stand, "Lesen ändert nichts");
        k.teil_lage(bx, 30.0, 0.0, 0.0);
        assert_eq!(k.hole_zahl(s, n.getroffen), 0.0, "nach dem Verschieben neu gerechnet");
        // Szenen-Hash: Lesen ändert ihn nicht
        let h = k.hash_szene();
        let _ = treffer(&mut k, &n, s);
        assert_eq!(k.hash_szene(), h);
    }

    /// Ohne Figur und Strahl ändern die neuen Arten nichts: dieselbe Szene mit und ohne die beiden in der Registry → gleicher
    /// Hash und gleiches Bildpaket über viele Takte (Schwung, Fühler, Körper).
    #[test]
    fn ohne_figur_byte_gleich() {
        use crate::abi::szenen_hash;
        use crate::paket::{baue, Bildbau, Gesendet};
        use crate::welt::Welt;
        let pos = ARTEN.iter().position(|a| a.schema.name == "Figur").unwrap();
        assert_eq!(ARTEN[pos + 1].schema.name, "Strahl");
        let ohne: &'static [&'static crate::komponenten::Art] = &ARTEN[..pos];
        let mit: &'static [&'static crate::komponenten::Art] = &ARTEN[..pos + 2];
        let lauf = |r: &'static [&'static crate::komponenten::Art]| -> (u64, Vec<u8>) {
            let mut w = Welt::neu(320, 180, String::from("F"), r);
            let i = |name: &str| r.iter().position(|a| a.schema.name == name).unwrap();
            let (fi, ki, si) = (i("Fuehler"), i("Koerper"), i("Schwung"));
            let netz = w.ressourcen.form(crate::formen::netz_aus(&crate::formen::FormDaten { art: 1, teile: 0, dicke: 0.0, glatt: false, punkte: Vec::new(), dreiecke: Vec::new() }));
            for e in 0..6u32 {
                let t = w.teil_neu(true);
                w.lage_setzen(t, e as f64 * 1.5, if e == 0 { -0.5 } else { 1.0 + e as f64 }, 0.0);
                let h = w.komp_neu(ki);
                let z = w.komp_ort[h as usize].zeile as usize;
                w.speicher[ki].zahl_mut(crate::komponenten::koerper::FORM)[z] = netz as f64;
                w.komp_haenge(h, t).unwrap();
                let h = w.komp_neu(fi);
                let z = w.komp_ort[h as usize].zeile as usize;
                w.speicher[fi].zahl_mut(crate::komponenten::fuehler::AUSLOESER)[z] = 0.0;
                w.komp_haenge(h, t).unwrap();
                if e > 0 {
                    let h = w.komp_neu(si);
                    let z = w.komp_ort[h as usize].zeile as usize;
                    w.speicher[si].zahl_mut(crate::komponenten::schwung::SCHWERKRAFT)[z] = 9.81;
                    w.komp_haenge(h, t).unwrap();
                }
            }
            let (mut bau, mut ges, mut aus) = (Bildbau::default(), Gesendet::default(), Vec::new());
            for b in 0..30 {
                w.takt();
                baue(&mut w, &mut bau, &mut ges, &mut aus, b);
            }
            (szenen_hash(&mut w), aus)
        };
        assert_eq!(lauf(ohne), lauf(mit));
    }
}

/// H-K16: Modelle (glTF → Modellteig → Teile), `Etikett`, `teil.finde`. Testmodelle aus `scripts/modelle-test.js`, gebacken mit
/// dem Vorbacker `herd-teigling` (Dev-Abhängigkeit).
mod hk16 {
    use super::*;

    macro_rules! tm {
        ($n:literal) => {
            include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../teigling/testmodelle/", $n)) as &[u8]
        };
    }

    pub fn teig(glb: &[u8]) -> Vec<u8> {
        herd_teigling::modell::vorbacken(glb)
    }

    fn name_von(k: &mut Kern, teil: i32) -> String {
        let te = typ(k, "Etikett");
        let e = k.komp_von(teil, te);
        if e <= 0 {
            return String::from("-");
        }
        let f = feld(k, te, "name");
        text(k, e, f)
    }

    fn kinder(k: &mut Kern, teil: i32) -> Vec<i32> {
        let mut b = [0u32; 64];
        let n = k.teil_kinder(teil, &mut b);
        b[..n as usize].iter().map(|&x| x as i32).collect()
    }

    fn knoten_nr(k: &Kern, teil: i32) -> f64 {
        let w = k.welt.as_ref().unwrap();
        let a = w.art_index("Etikett").unwrap();
        let z = w.zeile_opt(teil as u32).unwrap();
        let kz = w.komp_zeile(z, a).unwrap();
        w.speicher[a].zahl(crate::komponenten::etikett::KNOTEN)[kz]
    }

    #[test]
    fn wuerfel_teile_belag_hash() {
        let t = teig(tm!("wuerfel.glb"));
        let mut k = Kern::neu();
        assert!(k.modell_teig(&t) < 0);
        assert_eq!(k.fehler_code(), 3); // vor neu Herd
        let mut k = welt();
        let vor = k.hash_szene();
        let m = k.modell_teig(&t);
        assert_eq!(m, 1);
        assert_ne!(k.hash_szene(), vor);
        // Ressourcen: ein Netz (Form 1); Vorlage-Teil 1 mit Belag-Teil 2
        assert_eq!(k.ressource_hole(1, 1), 1.0);
        assert_eq!(k.ressource_hole(1, 4), 24.0);
        assert_eq!((k.modell_info(m, 1), k.modell_info(m, 3), k.modell_info(m, 7), k.modell_info(m, 8)), (1.0, 1.0, 1.0, 24.0));
        assert_eq!((k.modell_info(m, 4), k.modell_info(m, 5), k.modell_info(m, 6)), (1.0, 1.0, 1.0));
        let (vorlage, belag) = (k.modell_info(m, 10) as i32, k.modell_info(m, 100) as i32);
        assert_eq!(belag, vorlage + 1);
        assert_eq!(k.teil_hole(belag, tf::RUHT), 1.0);
        assert_eq!(name_von(&mut k, belag), "Tomate");
        let bt = typ(&mut k, "Belag");
        let bk = k.komp_von(belag, bt);
        let (ff, fg, fm) = (feld(&mut k, bt, "farbe"), feld(&mut k, bt, "glanz"), feld(&mut k, bt, "modell"));
        // linear (0.8, 0.1, 0.05) → sRGB (231, 89, 63)
        assert_eq!(text(&mut k, bk, ff), "#e7593fff");
        assert_eq!((k.hole_zahl(bk, fg), k.hole_zahl(bk, fm)), (0.5, 1.0));
        let mut b = [0u8; 32];
        let n = k.modell_text(m, 1, 0, &mut b);
        assert_eq!(&b[..n as usize], b"Wuerfel");
        assert_eq!(k.modell_text(m, 3, 0, &mut b), 6);
        assert!(k.modell_text(m, 1, 1, &mut b) < 0);
        assert!(k.modell_info(2, 1).is_nan());
        assert_eq!(k.fehler_text(), "Modell 2 gibt es nicht.");
        // Instanz: Wurzel (ohne Etikett) → Knoten-Teil mit Etikett, Koerper (Form 1, Belag)
        let r = k.modell_teil(m, 1.0, 2.0, 3.0);
        assert_eq!(r, belag + 1);
        assert_eq!((k.teil_hole(r, tf::X), k.teil_hole(r, tf::Z)), (1.0, 3.0));
        let ki = kinder(&mut k, r);
        assert_eq!(ki, [r + 1]);
        let kn = r + 1;
        assert_eq!(name_von(&mut k, kn), "Wuerfel");
        assert_eq!(knoten_nr(&k, kn), 1.0);
        let kt = typ(&mut k, "Koerper");
        let kk = k.komp_von(kn, kt);
        assert!(kk > 0);
        let (kf, kb) = (feld(&mut k, kt, "form"), feld(&mut k, kt, "belag"));
        assert_eq!((k.hole_zahl(kk, kf), k.hole_zahl(kk, kb)), (1.0, belag as f64));
        // der Belag unter der ruhenden Vorlage wirkt: ZUSATZ3D mit pbr-Bit für die eine Instanz
        k.bild(1);
        let l = Leser::neu(k.paket()).unwrap();
        let z: Vec<&[u8]> = l.abschnitte().filter(|a| a.0 == abschnitt::ZUSATZ3D).map(|a| a.1).collect();
        assert_eq!(z.len(), 1);
        assert_eq!(z[0].len(), 16);
        assert_eq!(z[0][12] & 1, 1);
        // finde: Wurzel eingeschlossen, sonst 0; Etikett auch selbst verwendbar
        assert_eq!(k.teil_finde(r, b"Wuerfel"), kn);
        assert_eq!(k.teil_finde(r, b"Nichts"), 0);
        assert_eq!(k.teil_finde(kn, b"Wuerfel"), kn);
        assert!(k.teil_finde(999, b"x") < 0);
        // Kopie: neue Teile, Etikett samt Knotennummer, derselbe Belag
        let c = k.teil_kopie(r);
        let ck = kinder(&mut k, c);
        assert_eq!(name_von(&mut k, ck[0]), "Wuerfel");
        assert_eq!(knoten_nr(&k, ck[0]), 1.0);
        let ckk = k.komp_von(ck[0], kt);
        assert_eq!(k.hole_zahl(ckk, kb), belag as f64);
        // dasselbe Programm zweimal → derselbe Szenen-Hash (Teil-IDs in fester Knotenfolge)
        let mut k2 = welt();
        let m2 = k2.modell_teig(&t);
        k2.modell_teil(m2, 1.0, 2.0, 3.0);
        k2.teil_kopie(r);
        assert_eq!(k2.hash_szene(), k.hash_szene());
    }

    #[test]
    fn hierarchie_lage_lichter_primitiven() {
        let mut k = welt();
        let m = k.modell_teig(&teig(tm!("hierarchie.glb")));
        assert_eq!(m, 1);
        assert_eq!(k.modell_info(m, 1), 11.0);
        assert_eq!(k.modell_info(m, 3), 2.0);
        let r = k.modell_teil(m, 0.0, 0.0, 0.0);
        let tisch = k.teil_finde(r, b"Tisch");
        assert_eq!(k.teil_hole(tisch, tf::ELTERN), r as f64);
        let b3 = k.teil_finde(r, b"Bein.3");
        assert_eq!(k.teil_hole(b3, tf::ELTERN), tisch as f64);
        let lage: Vec<f64> = (1..=9).map(|f| k.teil_hole(b3, f)).collect();
        assert_eq!(lage, [0.4f32 as f64, -0.375, -0.4f32 as f64, 0.0, 0.0, 0.0, 0.1f32 as f64, 0.75, 0.1f32 as f64]);
        let platte = k.teil_finde(r, b"Platte");
        assert!((k.teil_hole(platte, tf::DREHUNG) - 45.0).abs() < 1e-5);
        assert_eq!(k.teil_hole(platte, tf::NEIGUNG), 0.0);
        // zwei Primitiven → zwei Kind-Teile mit Koerper, ohne Etikett
        let pk = kinder(&mut k, platte);
        assert_eq!(pk.len(), 2);
        let kt = typ(&mut k, "Koerper");
        assert!(k.komp_von(platte, kt) == 0 && k.komp_von(pk[0], kt) > 0 && k.komp_von(pk[1], kt) > 0);
        assert_eq!(name_von(&mut k, pk[0]), "-");
        // Matrix-Knoten: 90° um x, Größe y = 2
        let lampe = k.teil_finde(r, b"Lampe");
        assert!((k.teil_hole(lampe, tf::NEIGUNG) - 90.0).abs() < 1e-9);
        assert_eq!((k.teil_hole(lampe, tf::Y), k.teil_hole(lampe, tf::GROESSE_Y)), (0.5, 2.0));
        // Lichter: Spot (Kegel = 0.6 rad, Rand 1 − 0.3/0.6), Punkt; die Sonne entfällt
        let lt = typ(&mut k, "Licht");
        let (fk, fr, fw, fs) = (feld(&mut k, lt, "kegel"), feld(&mut k, lt, "kegelRand"), feld(&mut k, lt, "reichweite"), feld(&mut k, lt, "staerke"));
        let l1 = k.komp_von(lampe, lt);
        assert!((k.hole_zahl(l1, fk) - 0.6f32 as f64 / crate::welt::GRAD).abs() < 1e-9);
        assert!((k.hole_zahl(l1, fr) - 0.5).abs() < 1e-6);
        assert_eq!(k.hole_zahl(l1, fw), 8.0);
        assert!((k.hole_zahl(l1, fs) - 256.0 * 20.0 / (9.0 * 64.0)).abs() < 1e-9);
        let gb = k.teil_finde(r, b"Gluehbirne");
        let l2 = k.komp_von(gb, lt);
        assert_eq!(k.hole_zahl(l2, fk), 0.0);
        assert!((k.hole_zahl(l2, fw) - 4.0 * 5f64.sqrt()).abs() < 1e-9);
        let sonne = k.teil_finde(r, b"Sonne");
        assert!(sonne > 0 && k.komp_von(sonne, lt) == 0);
        // Spiegelung (Größe −1) bleibt, Waise (andere Szene) fehlt
        let sp = k.teil_finde(r, b"Gespiegelt");
        assert_eq!(k.teil_hole(sp, tf::GROESSE_X), -1.0);
        assert!((k.teil_hole(sp, tf::DREHUNG) - 90.0).abs() < 1e-5);
        assert_eq!(k.teil_finde(r, b"Waise"), 0);
        // leerer Name: findet das erste Teil mit leerem Etikett (Knoten 10), nicht die Wurzel ohne Etikett
        let leer = k.teil_finde(r, b"");
        assert_eq!(knoten_nr(&k, leer), 10.0);
        // Hülle der Ruhelage: Platte (gedreht, 1 × 0.05 × 1) und Beine, Gespiegelt bei z = −2
        let (b, h, t) = (k.modell_info(m, 4), k.modell_info(m, 5), k.modell_info(m, 6));
        assert!((b - 2f64.sqrt()).abs() < 1e-6, "breite {}", b);
        assert!((h - 1.275).abs() < 1e-6, "hoehe {}", h); // Beine/Platte 0 … 0.775, Gespiegelt −0.5 … 0.5
        assert!(t > 2.0, "tiefe {}", t);
        // Folgen: keine; Namen der Knoten in Tiefensuche
        assert_eq!(k.modell_info(m, 2), 0.0);
    }

    #[test]
    fn texturen_palette_quant_haut_folgen() {
        let mut k = welt();
        // textur-eingebettet: Grundfarbe, Relief, Stoff und Leuchten als Texturen (Stoff/Leuchten seit H-K26)
        let m = k.modell_teig(&teig(tm!("textur-eingebettet.gltf")));
        assert_eq!(k.modell_info(m, 9), 4.0); // Grundfarbe, Relief, Stoff, Leuchten (H-K26)
        let belag = k.modell_info(m, 100) as i32;
        let bt = typ(&mut k, "Belag");
        let bk = k.komp_von(belag, bt);
        let (fb, fr, fk) = (feld(&mut k, bt, "bild"), feld(&mut k, bt, "relief"), feld(&mut k, bt, "kachel"));
        let (bild, relief) = (k.hole_zahl(bk, fb), k.hole_zahl(bk, fr));
        assert!(bild > 0.0 && relief > 0.0 && bild != relief);
        assert_eq!((k.ressource_hole(bild as i32, 2), k.ressource_hole(relief as i32, 2)), (8.0, 4.0));
        assert_eq!(k.hole_zahl(bk, fk), 1.0); // REPEAT und UV bis 2
        // Eckfarben → Paletten-Bild als Grundfarbe; Ersatz-Material für die Primitive ohne Material
        let m2 = k.modell_teig(&teig(tm!("farben.glb")));
        assert_eq!(k.modell_info(m2, 3), 2.0);
        let bt2 = k.modell_info(m2, 100) as i32;
        let b2 = k.komp_von(bt2, bt);
        let pal = k.hole_zahl(b2, fb) as i32;
        assert_eq!(k.ressource_hole(pal, 2), 6.0);
        // quantisiert: Netze ohne Normalen bekommen glatte (Fächer), Lage über die Knotengröße
        let m3 = k.modell_teig(&teig(tm!("quant.glb")));
        assert_eq!(k.modell_info(m3, 7), 2.0);
        let r3 = k.modell_teil(m3, 0.0, 0.0, 0.0);
        let q = k.teil_finde(r3, b"Quant");
        assert_eq!(k.teil_hole(q, tf::GROESSE_X), 0.001f32 as f64);
        assert!((k.modell_info(m3, 4) - 1.0).abs() < 1e-6);
        // Haut und Folgen werden mitgenommen (Daten für H-K23a/b)
        let m4 = k.modell_teig(&teig(tm!("haut.glb")));
        assert_eq!(k.modell_info(m4, 1), 3.0);
        let m5 = k.modell_teig(&teig(tm!("folge.glb")));
        assert_eq!(k.modell_info(m5, 2), 2.0);
        let mut b = [0u8; 16];
        let n = k.modell_text(m5, 2, 1, &mut b);
        assert_eq!(&b[..n as usize], b"Drehen");
        let w = k.welt.as_ref().unwrap();
        assert_eq!(w.ressourcen.modelle[m4 as usize - 1].haeute[0].gelenke, [1, 2]);
        assert!(w.ressourcen.modelle[m4 as usize - 1].netz_haut[0].is_some());
        assert_eq!(w.ressourcen.modelle[m5 as usize - 1].folgen[1].kanaele.len(), 2);
        // Bildpaket: Texturen und Netze wie bei Bildchen.laden/eigenen Formen, ohne neue Abschnitte
        let r = k.modell_teil(m, 0.0, 0.0, 0.0);
        assert!(r > 0);
        k.bild(1);
        let l = Leser::neu(k.paket()).unwrap();
        let n_tex = l.abschnitte().filter(|a| a.0 == abschnitt::TEXTUR).count();
        assert_eq!(n_tex, 2 + 2 + 2); // Grundfarbe, Relief, Stoff, Leuchten (H-K26), zwei Paletten (Bunt, Ersatz)
    }

    #[test]
    fn fehler_teige_und_verdorbene() {
        let mut k = welt();
        for (glb, code, text) in [
            (tm!("fehler-draco.glb"), 64, "braucht die Erweiterung KHR_draco_mesh_compression – die kann der Herd nicht."),
            (tm!("fehler-kaputt.glb"), 63, "ist kein lesbares Modell (glTF 2.0)."),
            (tm!("fehler-zu-gross.glb"), 65, "ist zu groß (600 000 Ecken) – höchstens 500 000 Ecken."),
            (tm!("fehler-bild-zu-gross.glb"), 66, "(Bild 2) ist zu groß (2400 × 800) – höchstens 2048 × 2048 Pixel."),
            (tm!("fehler-fehlt.gltf"), 67, "braucht die Datei fehlt.bin – die liegt nicht in der Kiste."),
        ] {
            assert_eq!(k.modell_teig(&teig(glb)), -2);
            assert_eq!((k.fehler_code(), k.fehler_text()), (code, text));
        }
        assert_eq!(k.modell_teig(b"TEIGMODL"), -2);
        assert_eq!(k.fehler_code(), 63);
        // verdorbene Teige: nie eine Panik, nie halb angelegt
        let echt = teig(tm!("hierarchie.glb"));
        let vorher = (k.welt.as_ref().unwrap().ressourcen.liste.len(), k.hash_szene());
        let mut z: u64 = 0x2545_F491_4F6C_DD1D;
        for runde in 0..3000 {
            z ^= z << 13;
            z ^= z >> 7;
            z ^= z << 17;
            let mut v = echt.clone();
            let i = 64 + (z % (v.len() as u64 - 64)) as usize;
            if runde % 3 == 0 {
                v.truncate(i);
            } else {
                v[i] ^= 1 << (z >> 40) % 8;
                let j = (i * 7) % v.len();
                v[j] = (z >> 20) as u8;
            }
            let r = k.modell_teig(&v);
            if r < 0 {
                assert_eq!(k.fehler_code(), 63, "Runde {}", runde);
            }
        }
        // nur gültige Varianten legen etwas an; der Zustand bleibt erklärbar (kein Absturz)
        assert!(k.welt.as_ref().unwrap().ressourcen.liste.len() >= vorher.0);
    }
}

/// H-K25: Funken-Aufprall (`kollision`, `aufprall`, `abprall`) gegen die Ebene `boden` und gegen die Welt (Fühler, Gelände).
mod hk25 {
    use super::*;
    use crate::komponenten::funken;

    fn setze(k: &mut Kern, c: i32, t: i32, werte: &[(&str, f64)]) {
        for &(n, v) in werte {
            let f = feld(k, t, n);
            assert_eq!(k.setze_zahl(c, f, v), 0, "{} = {}", n, v);
        }
    }
    fn setze_t(k: &mut Kern, c: i32, t: i32, n: &str, v: &str) {
        let f = feld(k, t, n);
        assert_eq!(k.setze_text(c, f, v.as_bytes()), 0, "{} = {}", n, v);
    }
    /// Sprüher bei p nach unten (Tempo 6, Schwerkraft 9.81, Lebensdauer 3 s), Volumen `vol` (0 = Strahl), Saat 7; gibt (Typ, Teil, Komp)
    fn spruehser(k: &mut Kern, p: [f64; 3], vol: f64) -> (i32, i32, i32) {
        let fu = typ(k, "Funken");
        let t = k.teil_neu(3);
        k.teil_lage(t, p[0], p[1], p[2]);
        let c = k.komp_neu(fu);
        setze(k, c, fu, &[("rate", 120.0), ("lebensdauer", 3.0), ("tempo", 6.0), ("richtungY", -1.0), ("streuung", 0.0), ("schwerkraft", 9.81), ("volumen", vol), ("saat", 7.0)]);
        assert_eq!(k.komp_haenge(c, t), 0);
        (fu, t, c)
    }
    /// Teilchen des ersten Funken-Emitters (je 8 Zahlen)
    fn teilchen(k: &Kern, fu: i32) -> Vec<[f64; 8]> {
        let s = &k.welt.as_ref().unwrap().speicher[fu as usize - 1];
        s.puffer(funken::TEILCHEN)[0].chunks_exact(8).map(|c| c.try_into().unwrap()).collect()
    }
    fn haupt(v: &[[f64; 8]]) -> Vec<[f64; 8]> {
        v.iter().filter(|p| p[7] > 0.0).copied().collect()
    }
    fn spritzer(v: &[[f64; 8]]) -> usize {
        v.iter().filter(|p| p[7] < 0.0).count()
    }
    fn takte(k: &mut Kern, n: usize) {
        for _ in 0..n {
            k.takt();
        }
    }
    /// fester Kasten (Mitte p, Größe g) mit Fühler, auf Wunsch Würfel-Körper (sonst die Fühler-Maße)
    fn kasten(k: &mut Kern, p: [f64; 3], g: [f64; 3], ausloeser: bool) -> (i32, i32) {
        let fi = typ(k, "Fuehler");
        let t = k.teil_neu(3);
        k.teil_lage(t, p[0], p[1], p[2]);
        let f = k.komp_neu(fi);
        setze_t(k, f, fi, "form", "kasten");
        setze(k, f, fi, &[("breite", g[0]), ("hoehe", g[1]), ("tiefe", g[2]), ("ausloeser", if ausloeser { 1.0 } else { 0.0 })]);
        assert_eq!(k.komp_haenge(f, t), 0);
        (t, f)
    }

    #[test]
    fn schema_standard_und_byte_gleich() {
        let mut k = welt();
        let fu = typ(&mut k, "Funken");
        let c = k.komp_neu(fu);
        for (n, v) in [("kollision", "keine"), ("aufprall", "vergehen")] {
            let f = feld(&mut k, fu, n);
            assert_eq!(text(&mut k, c, f), v);
        }
        let ab = feld(&mut k, fu, "abprall");
        assert_eq!(k.hole_zahl(c, ab), 0.3);
        assert!(k.setze_zahl(c, ab, 1.5) < 0);
        let ko = feld(&mut k, fu, "kollision");
        assert!(k.setze_text(c, ko, b"wand") < 0);
        // Standardwerte ausdrücklich gesetzt (mit dem alten Aufschlag) = nichts gesetzt: Hash und Paket gleich
        let lauf = |setzen: bool| {
            let mut k = welt();
            let (fu, _, c) = spruehser(&mut k, [0.0, 3.0, 0.0], 1.0);
            setze(&mut k, c, fu, &[("aufschlag", 1.0), ("boden", 0.2)]);
            if setzen {
                setze_t(&mut k, c, fu, "kollision", "keine");
                setze_t(&mut k, c, fu, "aufprall", "vergehen");
                setze(&mut k, c, fu, &[("abprall", 0.3)]);
            }
            takte(&mut k, 60);
            k.bild(1);
            (k.hash_szene(), k.paket().to_vec())
        };
        assert_eq!(lauf(false), lauf(true));
    }

    #[test]
    fn boden_vergehen_mit_spritzern() {
        let mut k = welt();
        let (fu, _, c) = spruehser(&mut k, [0.0, 3.0, 0.0], 1.0);
        setze_t(&mut k, c, fu, "kollision", "boden");
        setze(&mut k, c, fu, &[("boden", 0.5), ("spritzer", 4.0)]);
        let mut spritzer_gesehen = 0;
        for _ in 0..90 {
            k.takt();
            let v = teilchen(&k, fu);
            assert!(haupt(&v).iter().all(|p| p[1] >= 0.5), "kein Tropfen unter dem Boden");
            spritzer_gesehen = spritzer_gesehen.max(spritzer(&v));
            // Spritzer starten 5 mm über dem Boden und vergehen unter ihm
            assert!(v.iter().filter(|p| p[7] < 0.0).all(|p| p[1] >= 0.5));
        }
        assert!(spritzer_gesehen > 20, "{}", spritzer_gesehen);
    }

    #[test]
    fn boden_abprallen_und_gleiten() {
        let mut k = welt();
        let (fu, _, c) = spruehser(&mut k, [0.0, 2.0, 0.0], 0.0);
        setze_t(&mut k, c, fu, "kollision", "boden");
        setze_t(&mut k, c, fu, "aufprall", "abprallen");
        setze(&mut k, c, fu, &[("abprall", 0.5), ("spritzer", 0.0), ("richtungX", 0.3)]);
        takte(&mut k, 20);
        // Ausstoß aus, dann fallen und springen lassen
        let ak = feld(&mut k, fu, "aktiv");
        k.setze_zahl(c, ak, 0.0);
        let mut hoch = false;
        for _ in 0..140 {
            k.takt();
            for p in teilchen(&k, fu) {
                assert!(p[1] >= 0.0, "über dem Boden: {:?}", p);
                // nach dem Aufprall höchstens abprall² der Fallhöhe (+ Startschwung)
                if p[4] > 0.0 {
                    hoch = true;
                    assert!(p[1] < 1.5, "{:?}", p);
                }
            }
        }
        assert!(hoch, "Teilchen springen zurück");
        // am Ende gleiten sie auf dem Boden (Normaltempo ≈ 0, waagerecht weiter)
        let v = teilchen(&k, fu);
        assert!(!v.is_empty());
        assert!(v.iter().all(|p| p[1] < 0.05 && p[0] > 0.0), "{:?}", &v[..1]);
    }

    #[test]
    fn boden_liegen_bleibt_bis_zum_ende() {
        let mut k = welt();
        let (fu, _, c) = spruehser(&mut k, [0.0, 1.0, 0.0], 2.0);
        setze_t(&mut k, c, fu, "kollision", "boden");
        setze_t(&mut k, c, fu, "aufprall", "liegen");
        setze(&mut k, c, fu, &[("boden", 0.25), ("spritzer", 0.0), ("lebensdauer", 1.0)]);
        takte(&mut k, 50);
        let v = teilchen(&k, fu);
        let liegend: Vec<_> = v.iter().filter(|p| p[6] < 0.0).collect();
        assert!(liegend.len() > 20);
        for p in &liegend {
            assert_eq!(p[1], 0.25 + 0.002);
            assert_eq!([p[3], p[4], p[5]], [0.0; 3]);
        }
        // Lebensdauer läuft weiter: ohne Ausstoß sind nach 1 s alle weg
        let ak = feld(&mut k, fu, "aktiv");
        k.setze_zahl(c, ak, 0.0);
        takte(&mut k, 61);
        assert!(teilchen(&k, fu).is_empty());
        // Bild: liegende Teilchen werden gezeichnet (Alter als Betrag)
        k.setze_zahl(c, ak, 1.0);
        takte(&mut k, 30);
        k.bild(1);
        let (n, ..) = teilchen_3d(&k).unwrap();
        assert!(n > 0);
    }

    #[test]
    fn welt_kasten_dach_und_ausloeser() {
        // Dach 2 × 0,2 × 2 mit Oberkante y = 1 unter einem Sprüher mit Volumen 2: innen landet alles auf dem Dach, außen fällt es vorbei
        for ausloeser in [false, true] {
            let mut k = welt();
            kasten(&mut k, [0.0, 0.9, 0.0], [2.0, 0.2, 2.0], ausloeser);
            let (fu, _, c) = spruehser(&mut k, [0.0, 3.0, 0.0], 2.0);
            setze_t(&mut k, c, fu, "kollision", "welt");
            let mut unter_dach = 0;
            let mut spritzer_max = 0;
            for _ in 0..90 {
                k.takt();
                let v = teilchen(&k, fu);
                for p in haupt(&v) {
                    if p[0].abs() < 0.99 && p[2].abs() < 0.99 && p[1] < 1.0 {
                        unter_dach += 1;
                    }
                }
                spritzer_max = spritzer_max.max(spritzer(&v));
            }
            if ausloeser {
                assert!(unter_dach > 0, "Auslöser halten nichts auf");
                assert_eq!(spritzer_max, 0);
            } else {
                assert_eq!(unter_dach, 0, "nichts durch das Dach");
                assert!(spritzer_max > 0);
            }
        }
    }

    #[test]
    fn welt_ebene_als_kasten_dicke_null() {
        // Körper `Form.ebene()` mit Fühler: Kasten der Dicke 0 – Funken prallen nach oben ab, Spritzer steigen auf
        let mut k = welt();
        let kp = typ(&mut k, "Koerper");
        let fi = typ(&mut k, "Fuehler");
        let ebene = k.form_grund(5, 4.0, 0.0);
        assert!(ebene > 0);
        let t = k.teil_neu(3);
        k.teil_groesse(t, 12.0, 1.0, 12.0);
        let c = k.komp_neu(kp);
        let kform = feld(&mut k, kp, "form");
        k.setze_zahl(c, kform, ebene as f64);
        assert_eq!(k.komp_haenge(c, t), 0);
        let f = k.komp_neu(fi);
        setze(&mut k, f, fi, &[("ausloeser", 0.0)]);
        assert_eq!(k.komp_haenge(f, t), 0);
        let (fu, _, c) = spruehser(&mut k, [0.0, 2.0, 0.0], 1.0);
        setze_t(&mut k, c, fu, "kollision", "welt");
        setze_t(&mut k, c, fu, "aufprall", "abprallen");
        setze(&mut k, c, fu, &[("abprall", 0.5), ("spritzer", 2.0)]);
        let mut hoch = false;
        for _ in 0..90 {
            k.takt();
            for p in teilchen(&k, fu) {
                assert!(p[1] >= 0.0, "nicht durch die Ebene: {:?}", p);
                hoch |= p[7] > 0.0 && p[4] > 0.0;
            }
        }
        assert!(hoch, "prallen nach oben ab");
    }

    #[test]
    fn welt_kugel_netz_und_gelaende_liegen() {
        let mut k = welt();
        let fi = typ(&mut k, "Fuehler");
        // Kugel r = 0,5 bei (−3, 1, 0)
        let kt = k.teil_neu(3);
        k.teil_lage(kt, -3.0, 1.0, 0.0);
        let kf = k.komp_neu(fi);
        setze_t(&mut k, kf, fi, "form", "kugel");
        setze(&mut k, kf, fi, &[("radius", 0.5), ("ausloeser", 0.0)]);
        assert_eq!(k.komp_haenge(kf, kt), 0);
        // Würfel-Netz 1 × 1 × 1 bei (3, 1, 0)
        let kp = typ(&mut k, "Koerper");
        let wuerfel = k.form_grund(1, 0.0, 0.0);
        let nt = k.teil_neu(3);
        k.teil_lage(nt, 3.0, 1.0, 0.0);
        let nk = k.komp_neu(kp);
        let kform = feld(&mut k, kp, "form");
        k.setze_zahl(nk, kform, wuerfel as f64);
        assert_eq!(k.komp_haenge(nk, nt), 0);
        let nf = k.komp_neu(fi);
        setze_t(&mut k, nf, fi, "form", "netz");
        setze(&mut k, nf, fi, &[("ausloeser", 0.0)]);
        assert_eq!(k.komp_haenge(nf, nt), 0);
        // schiefes Gelände y = 0,2 · x − 1 (Dreiecke einer Ebene: exakt)
        let gt = typ(&mut k, "Gelaende");
        let (gh, gsp, gze) = (feld(&mut k, gt, "hoehen"), feld(&mut k, gt, "spalten"), feld(&mut k, gt, "zeilen"));
        let (sp, ze) = (17usize, 17usize);
        let mut hoehen = Vec::new();
        for _ in 0..ze {
            for i in 0..sp {
                hoehen.push(0.2 * (i as f64 - 8.0) - 1.0);
            }
        }
        let land = k.teil_neu(3);
        let g = k.komp_neu(gt);
        k.setze_zahl(g, gsp, sp as f64);
        k.setze_zahl(g, gze, ze as f64);
        k.setze_zahlen(g, gh, &hoehen);
        assert_eq!(k.komp_haenge(g, land), 0);
        let lf = k.komp_neu(fi);
        setze_t(&mut k, lf, fi, "form", "netz");
        setze(&mut k, lf, fi, &[("ausloeser", 0.0)]);
        assert_eq!(k.komp_haenge(lf, land), 0);
        let (fu, _, c) = spruehser(&mut k, [0.0, 4.0, 0.0], 4.0);
        setze_t(&mut k, c, fu, "kollision", "welt");
        setze_t(&mut k, c, fu, "aufprall", "liegen");
        setze(&mut k, c, fu, &[("rate", 600.0), ("spritzer", 0.0)]);
        takte(&mut k, 120);
        let v = teilchen(&k, fu);
        let liegend: Vec<_> = v.iter().filter(|p| p[6] < 0.0).copied().collect();
        assert!(liegend.len() > 500, "{}", liegend.len());
        let (mut auf_kugel, mut auf_netz, mut auf_land) = (0, 0, 0);
        for p in &liegend {
            let dk = ((p[0] + 3.0).powi(2) + (p[1] - 1.0).powi(2) + p[2].powi(2)).sqrt();
            let im_netz = (p[0] - 3.0).abs() < 0.5 && (p[1] - 1.0).abs() < 0.5 && p[2].abs() < 0.5;
            assert!(dk > 0.5 && !im_netz, "{:?}", p);
            if (dk - 0.502).abs() < 1e-6 {
                auf_kugel += 1;
            } else if (p[1] - 1.502).abs() < 1e-9 && (p[0] - 3.0).abs() <= 0.5 {
                auf_netz += 1;
            } else {
                // auf dem Hang: 2 mm entlang der Normale (−0,2, 1, 0)/|…| über y = 0,2 x − 1
                let l = (1.0f64 + 0.04).sqrt();
                let d = (p[1] - (0.2 * p[0] - 1.0)) / l;
                assert!((d - 0.002).abs() < 1e-6, "{:?} {}", p, d);
                auf_land += 1;
            }
        }
        assert!(auf_kugel > 5 && auf_netz > 5 && auf_land > 100, "{} {} {}", auf_kugel, auf_netz, auf_land);
        // nichts fällt durch das Gelände
        assert!(v.iter().all(|p| p[1] > 0.2 * p[0] - 1.0));
    }

    #[test]
    fn welt_im_raum_des_teils_und_figur_ignoriert() {
        // Sprüher mit weltlage nein, gedreht und verschoben; Dach in Welt unter ihm
        let mut k = welt();
        kasten(&mut k, [5.0, 0.0, 0.0], [8.0, 0.2, 8.0], false);
        let (fu, t, c) = spruehser(&mut k, [5.0, 2.0, 0.0], 1.0);
        k.teil_setze(t, tf::DREHUNG, 30.0);
        k.teil_groesse(t, 2.0, 1.0, 2.0);
        setze(&mut k, c, fu, &[("weltlage", 0.0)]);
        setze_t(&mut k, c, fu, "kollision", "welt");
        takte(&mut k, 90);
        let welt_y: Vec<f64> = teilchen(&k, fu).iter().filter(|p| p[7] > 0.0).map(|p| p[1] + 2.0).collect();
        assert!(!welt_y.is_empty());
        assert!(welt_y.iter().all(|y| *y >= 0.1), "nichts durch das Dach im Raum des Teils");
        // eine Figur (und ein dynamischer Körper) ist kein Ziel: Tropfen fallen durch sie hindurch
        let mut k = welt();
        let fi = typ(&mut k, "Fuehler");
        let ft = k.teil_neu(3);
        k.teil_lage(ft, 0.0, 0.0, 0.0);
        let ff = k.komp_neu(fi);
        setze_t(&mut k, ff, fi, "form", "kapsel");
        setze(&mut k, ff, fi, &[("radius", 1.0), ("hoehe", 2.0), ("ausloeser", 0.0)]);
        assert_eq!(k.komp_haenge(ff, ft), 0);
        let fg = typ(&mut k, "Figur");
        let g = k.komp_neu(fg);
        let schw = feld(&mut k, fg, "schwerkraft");
        k.setze_zahl(g, schw, 0.0);
        assert_eq!(k.komp_haenge(g, ft), 0);
        let (fu, _, c) = spruehser(&mut k, [0.0, 3.0, 0.0], 0.0);
        setze_t(&mut k, c, fu, "kollision", "welt");
        takte(&mut k, 60);
        assert!(teilchen(&k, fu).iter().any(|p| p[1] < -1.0), "durch die Figur");
    }

    #[test]
    fn spritzer_grenze_je_takt_und_bitgleich() {
        let lauf = || {
            let mut k = welt();
            kasten(&mut k, [0.0, -0.1, 0.0], [20.0, 0.2, 20.0], false);
            let (fu, _, c) = spruehser(&mut k, [0.0, 0.5, 0.0], 8.0);
            setze_t(&mut k, c, fu, "kollision", "welt");
            setze(&mut k, c, fu, &[("rate", 60_000.0), ("spritzer", 16.0), ("tempo", 30.0)]);
            let mut max_neu = 0;
            for _ in 0..30 {
                k.takt();
                let v = teilchen(&k, fu);
                // neue Spritzer tragen Alter 0
                let neu = v.iter().filter(|p| p[7] < 0.0 && p[6] == 0.0).count();
                max_neu = max_neu.max(neu);
                assert!(v.len() <= funken::MAX_TEILCHEN);
            }
            assert!(max_neu > 0 && max_neu <= funken::SPRITZ_MAX_TAKT, "{}", max_neu);
            k.bild(1);
            (k.hash_szene(), k.paket().to_vec())
        };
        assert_eq!(lauf(), lauf());
    }
}

/// H-K24: Bildschirmraum – `Stimmung.verdeckung`, `verdeckungWeite`, `bildspiegel`, Abschnitt BILDRAUM.
mod hk24 {
    use super::*;

    fn f(d: &[u8], o: usize) -> f32 {
        f32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }
    fn abschnitt_von(k: &Kern, art: u32) -> Option<Vec<u8>> {
        Leser::neu(k.paket()).unwrap().abschnitte().find(|(a, _)| *a == art).map(|(_, d)| d.to_vec())
    }
    /// Boden und Würfel, Kamera mit nah 0.2 / fern 80, Stimmung; liefert (Stimmung, verdeckung, verdeckungWeite, bildspiegel).
    fn szene(k: &mut Kern) -> (i32, i32, i32, i32) {
        let kt = typ(k, "Koerper");
        let form = feld(k, kt, "form");
        let ebene = k.form_grund(5, 0.0, 0.0);
        let wuerfel = k.form_grund(1, 0.0, 0.0);
        k.teil_lage(1, 0.0, 2.0, 8.0);
        k.teil_schaue(1, 0.0, 0.5, 0.0);
        let kam = typ(k, "Kamera");
        let kc = k.komp_von(1, kam);
        let (fnah, ffern) = (feld(k, kam, "nah"), feld(k, kam, "fern"));
        assert_eq!(k.setze_zahl(kc, fnah, 0.2), 0);
        assert_eq!(k.setze_zahl(kc, ffern, 80.0), 0);
        for (fo, gr) in [(ebene, 30.0), (wuerfel, 1.0)] {
            let t = k.teil_neu(3);
            k.teil_groesse(t, gr, 1.0, gr);
            let c = k.komp_neu(kt);
            assert_eq!(k.setze_zahl(c, form, fo as f64), 0);
            assert_eq!(k.komp_haenge(c, t), 0);
        }
        let st = typ(k, "Stimmung");
        let t = k.teil_neu(3);
        let s = k.komp_neu(st);
        assert_eq!(k.komp_haenge(s, t), 0);
        (s, feld(k, st, "verdeckung"), feld(k, st, "verdeckungWeite"), feld(k, st, "bildspiegel"))
    }

    #[test]
    fn ohne_nutzung_byte_gleich() {
        // Standard (alles 0) und ausdrücklich auf den Standard gesetzt: kein BILDRAUM, Paket und Hash gleich
        let lauf = |setzen: bool| {
            let mut k = welt();
            let (s, v, vw, b) = szene(&mut k);
            if setzen {
                assert_eq!(k.setze_zahl(s, v, 0.0), 0);
                assert_eq!(k.setze_zahl(s, vw, 0.5), 0);
                assert_eq!(k.setze_zahl(s, b, 0.0), 0);
            }
            k.bild(1);
            k.bild(1);
            let st = abschnitt_von(&k, abschnitt::STIMMUNG).expect("STIMMUNG");
            assert_eq!(st.len(), crate::komponenten::stimmung::STIMMUNG_BYTES);
            assert!(abschnitt_von(&k, abschnitt::BILDRAUM).is_none());
            (k.hash_szene(), k.paket().to_vec())
        };
        let (h, p) = lauf(false);
        assert_eq!((h, p.clone()), lauf(true));
        // nur die Weite geändert: kein Abschnitt (sie wirkt nur mit Verdeckung), Paket byte-gleich
        let mut k = welt();
        let (s, _, vw, _) = szene(&mut k);
        assert_eq!(k.setze_zahl(s, vw, 1.5), 0);
        k.bild(1);
        k.bild(1);
        assert!(abschnitt_von(&k, abschnitt::BILDRAUM).is_none());
        assert_eq!(k.paket(), &p[..]);
    }

    #[test]
    fn abschnitt_mit_verdeckung_und_bildspiegel() {
        let mut k = welt();
        let (s, v, vw, b) = szene(&mut k);
        k.bild(1);
        k.bild(1);
        let ohne = k.paket().to_vec();
        let h0 = k.hash_szene();
        assert_eq!(k.setze_zahl(s, v, 1.25), 0);
        assert_eq!(k.setze_zahl(s, vw, 0.75), 0);
        k.bild(1);
        assert_ne!(k.hash_szene(), h0);
        let d = abschnitt_von(&k, abschnitt::BILDRAUM).expect("BILDRAUM");
        assert_eq!(d.len(), crate::komponenten::stimmung::BILDRAUM_BYTES);
        assert_eq!([f(&d, 0), f(&d, 4), f(&d, 8), f(&d, 12)], [1.25, 0.75, 0.0, 1.0]);
        assert_eq!([f(&d, 16), f(&d, 20), f(&d, 24), f(&d, 28)], [0.2, 80.0, 0.0, 0.0]);
        // BILDRAUM steht direkt hinter STIMMUNG; das Paket wächst um genau diesen Abschnitt (8 + 32 Bytes)
        let arten: Vec<u32> = Leser::neu(k.paket()).unwrap().abschnitte().map(|(a, _)| a).collect();
        let i = arten.iter().position(|&a| a == abschnitt::STIMMUNG).unwrap();
        assert_eq!(arten[i + 1], abschnitt::BILDRAUM);
        assert_eq!(k.paket().len(), ohne.len() + 40);
        // nur Bildraum-Spiegelung
        assert_eq!(k.setze_zahl(s, v, 0.0), 0);
        assert_eq!(k.setze_zahl(s, b, 0.6), 0);
        k.bild(1);
        let d = abschnitt_von(&k, abschnitt::BILDRAUM).expect("BILDRAUM");
        assert_eq!([f(&d, 0), f(&d, 8)], [0.0, 0.6]);
        // Bereiche: verdeckung 0 … 2, bildspiegel 0 … 1, Weite > 0
        assert!(k.setze_zahl(s, v, 2.5) < 0);
        assert!(k.setze_zahl(s, b, 1.5) < 0);
        assert!(k.setze_zahl(s, vw, 0.0) < 0);
        // wieder aus → Paket und Hash wie ohne
        assert_eq!(k.setze_zahl(s, b, 0.0), 0);
        assert_eq!(k.setze_zahl(s, vw, 0.5), 0);
        k.bild(1);
        assert!(abschnitt_von(&k, abschnitt::BILDRAUM).is_none());
        assert_eq!(k.hash_szene(), h0);
    }
}

// ================================================================ H-K23a Puppe (HERD.md §13.3, Nachtrag K-161)
mod hk23a {
    use super::*;

    const PUPPE: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../teigling/testmodelle/puppe.glb"));

    /// Welt mit Puppen-Modell, einem Modell-Teil und einer Puppe (noch nicht angehängt) → (Kern, Wurzel, Puppe).
    fn aufbau(folge: &str) -> (Kern, i32, i32) {
        let mut k = welt();
        let m = k.modell_teig(&super::hk16::teig(PUPPE));
        assert_eq!(m, 1);
        assert_eq!(k.modell_info(m, 2), 3.0);
        let t = k.modell_teil(m, 0.0, 0.0, 0.0);
        let tp = typ(&mut k, "Puppe");
        let p = k.komp_neu(tp);
        setze(&mut k, p, "folge", folge);
        (k, t, p)
    }
    fn setze(k: &mut Kern, p: i32, f: &str, t: &str) {
        let tp = typ(k, "Puppe");
        let fe = feld(k, tp, f);
        assert_eq!(k.setze_text(p, fe, t.as_bytes()), 0);
    }
    fn zahl(k: &mut Kern, p: i32, f: &str, v: f64) {
        let tp = typ(k, "Puppe");
        let fe = feld(k, tp, f);
        assert_eq!(k.setze_zahl(p, fe, v), 0);
    }
    fn lies(k: &mut Kern, p: i32, f: &str) -> f64 {
        let tp = typ(k, "Puppe");
        let fe = feld(k, tp, f);
        k.hole_zahl(p, fe)
    }
    fn teil(k: &mut Kern, t: i32, name: &str) -> i32 {
        let x = k.teil_finde(t, name.as_bytes());
        assert!(x > 0, "{}", name);
        x
    }
    fn nah(a: f64, b: f64, eps: f64) -> bool {
        (a - b).abs() <= eps
    }

    #[test]
    fn stuetzstellen_exakt_linear_step_kubisch() {
        let (mut k, t, p) = aufbau("Winken");
        zahl(&mut k, p, "zeit", 0.5);
        assert_eq!(k.komp_haenge(p, t), 0);
        let arm = teil(&mut k, t, "Arm");
        assert_eq!(k.teil_hole(arm, tf::ROLLEN), 0.0);
        assert_eq!(k.takt(), 0);
        // erster Takt: genau an der gesetzten Zeit, ohne Vorlauf; Stützstelle 90° (f32-Quaternion)
        assert_eq!(lies(&mut k, p, "zeit"), 0.5);
        assert_eq!(lies(&mut k, p, "dauer"), 1.0);
        assert!(nah(k.teil_hole(arm, tf::ROLLEN), 90.0, 1e-5));
        // Lage/Größe des Arms hat die Folge nicht → unverändert
        assert_eq!((k.teil_hole(arm, tf::X), k.teil_hole(arm, tf::GROESSE_X)), (0.75, 0.5));
        // Slerp in der Mitte: 45°
        zahl(&mut k, p, "zeit", 0.25);
        k.takt();
        assert_eq!(lies(&mut k, p, "zeit"), 0.25);
        assert!(nah(k.teil_hole(arm, tf::ROLLEN), 45.0, 1e-5));
        // STEP (Größe des Kopfs) und CUBICSPLINE → Stützwerte linear (Lage des Körpers)
        setze(&mut k, p, "folge", "Nicken");
        zahl(&mut k, p, "blende", 0.0);
        zahl(&mut k, p, "zeit", 0.3);
        k.takt();
        let (kopf, koerper) = (teil(&mut k, t, "Kopf"), teil(&mut k, t, "Koerper"));
        assert_eq!(lies(&mut k, p, "zeit"), 0.3);
        assert_eq!(k.teil_hole(kopf, tf::GROESSE_Y), 0.8f32 as f64);
        assert_eq!(k.teil_hole(koerper, tf::Y), 0.3);
        zahl(&mut k, p, "zeit", 0.2);
        k.takt();
        assert_eq!(k.teil_hole(kopf, tf::GROESSE_Y), 0.5);
        // Arm ohne Kanal in „Nicken“ bleibt, wo „Winken“ ihn ließ
        assert!(nah(k.teil_hole(arm, tf::ROLLEN), 45.0, 1e-5));
    }

    #[test]
    fn schleife_fertig_und_halten() {
        let (mut k, t, p) = aufbau("Winken");
        k.komp_haenge(p, t);
        let mut ereignisse = Vec::new();
        for i in 0..130 {
            k.takt();
            if lies(&mut k, p, "fertig") == 1.0 {
                ereignisse.push(i);
            }
        }
        // Takt 0 ohne Vorlauf, dann 60 · DT = 1 s je Runde
        assert_eq!(ereignisse, [60, 120]);
        assert!(lies(&mut k, p, "zeit") < 1.0);
        // ohne Schleife: hält am Ende, fertig genau einmal
        let (mut k, t, p) = aufbau("Winken");
        zahl(&mut k, p, "schleife", 0.0);
        k.komp_haenge(p, t);
        let mut n = 0;
        for _ in 0..100 {
            k.takt();
            n += lies(&mut k, p, "fertig") as i32;
        }
        assert_eq!((n, lies(&mut k, p, "zeit")), (1, 1.0));
        let arm = teil(&mut k, t, "Arm");
        assert!(nah(k.teil_hole(arm, tf::ROLLEN), 0.0, 1e-5));
        // rückwärts: Ende bei 0
        zahl(&mut k, p, "tempo", -2.0);
        zahl(&mut k, p, "zeit", 0.5);
        let mut fertig_bei = None;
        for i in 0..40 {
            k.takt();
            if lies(&mut k, p, "fertig") == 1.0 {
                fertig_bei = Some(i);
            }
        }
        assert_eq!((fertig_bei, lies(&mut k, p, "zeit")), (Some(15), 0.0));
    }

    #[test]
    fn ueberblenden_und_ruhelage() {
        let (mut k, t, p) = aufbau("Winken");
        zahl(&mut k, p, "zeit", 0.5);
        zahl(&mut k, p, "laeuft", 0.0);
        k.komp_haenge(p, t);
        k.takt();
        let arm = teil(&mut k, t, "Arm");
        assert!(nah(k.teil_hole(arm, tf::ROLLEN), 90.0, 1e-5));
        // Wechsel nach "" (Ruhelage) blendet in 0.2 s = 12 Takten zurück
        setze(&mut k, p, "folge", "");
        k.takt();
        assert!(nah(k.teil_hole(arm, tf::ROLLEN), 90.0, 1e-5));
        for _ in 0..6 {
            k.takt();
        }
        // laeuft nein: die alte Folge steht; halber Weg (Slerp) zur Ruhelage
        assert!(nah(k.teil_hole(arm, tf::ROLLEN), 45.0, 1e-4), "{}", k.teil_hole(arm, tf::ROLLEN));
        for _ in 0..6 {
            k.takt();
        }
        assert!(nah(k.teil_hole(arm, tf::ROLLEN), 0.0, 1e-9));
        assert_eq!(lies(&mut k, p, "dauer"), 0.0);
        // danach schreibt die Puppe nichts mehr
        k.teil_setze(arm, tf::ROLLEN, 30.0);
        k.takt();
        assert_eq!(k.teil_hole(arm, tf::ROLLEN), 30.0);
        // Überblenden zwischen zwei Folgen: Winken (Arm) → Welle (Arm ±45°, Kette); beide laufen weiter
        setze(&mut k, p, "folge", "Winken");
        zahl(&mut k, p, "laeuft", 1.0);
        k.takt();
        zahl(&mut k, p, "blende", 0.5);
        setze(&mut k, p, "folge", "Welle");
        k.takt();
        assert_eq!(lies(&mut k, p, "zeit"), 0.0);
        assert_eq!(lies(&mut k, p, "dauer"), 2.0);
        let glied = teil(&mut k, t, "Glied.1");
        for _ in 0..30 {
            k.takt();
        }
        // nach dem Blenden genau die neue Folge: Glied 1 hat Phase 5° → bei 0.5 s 25°
        assert!(nah(k.teil_hole(glied, tf::NEIGUNG), 25.0, 1e-4), "{}", k.teil_hole(glied, tf::NEIGUNG));
        assert!(nah(k.teil_hole(arm, tf::ROLLEN), 45.0, 1e-4), "{}", k.teil_hole(arm, tf::ROLLEN));
        // Welle dreht den Körper um y: 0.5 s → 120°
        let koerper = teil(&mut k, t, "Koerper");
        assert!(nah(k.teil_hole(koerper, tf::DREHUNG), 120.0, 1e-4), "{}", k.teil_hole(koerper, tf::DREHUNG));
    }

    #[test]
    fn kopie_unabhaengig_hand_und_fremde_teile() {
        let (mut k, t, p) = aufbau("Winken");
        zahl(&mut k, p, "zeit", 0.5);
        zahl(&mut k, p, "laeuft", 0.0);
        k.komp_haenge(p, t);
        // etwas an die Hand hängen (fremdes Teil ohne Etikett) und ein zweites Modell darunter
        let hand = teil(&mut k, t, "Hand");
        let ding = k.teil_neu(3);
        k.teil_haenge(ding, hand);
        k.teil_setze(ding, tf::X, 0.25);
        let fremd = k.modell_teil(1, 0.0, 0.0, 0.0);
        k.teil_haenge(fremd, hand);
        k.takt();
        let arm = teil(&mut k, t, "Arm");
        assert!(nah(k.teil_hole(arm, tf::ROLLEN), 90.0, 1e-5));
        assert_eq!(k.teil_hole(ding, tf::X), 0.25);
        // das fremde Modell unter der Hand bleibt unberührt (seine Wurzel trägt kein Etikett)
        let fremd_arm = k.teil_finde(fremd, b"Arm");
        assert_eq!(k.teil_hole(fremd_arm, tf::ROLLEN), 0.0);
        // die Hand trägt das Ding mit: Arm um 90° gedreht → Ding über dem Arm
        assert!(k.teil_hole(ding, tf::WELT_Y) > 0.2, "{}", k.teil_hole(ding, tf::WELT_Y));
        // Kopie: eigene Zuordnung, eigene Zeit
        let t2 = k.teil_kopie(t);
        let tp = typ(&mut k, "Puppe");
        let p2 = k.komp_von(t2, tp);
        assert!(p2 > 0 && p2 != p);
        zahl(&mut k, p2, "zeit", 0.25);
        k.takt();
        let arm2 = teil(&mut k, t2, "Arm");
        assert_ne!(arm2, arm);
        assert!(nah(k.teil_hole(arm2, tf::ROLLEN), 45.0, 1e-5));
        assert!(nah(k.teil_hole(arm, tf::ROLLEN), 90.0, 1e-5));
    }

    #[test]
    fn ohne_modell_ohne_wirkung_und_unbekannte_folge() {
        let mut k = welt();
        let t = k.teil_neu(3);
        let tp = typ(&mut k, "Puppe");
        let p = k.komp_neu(tp);
        assert_eq!(k.komp_haenge(p, t), 0);
        k.takt();
        assert_eq!(lies(&mut k, p, "dauer"), 0.0);
        let (mut k, t, p) = aufbau("Gibtsnicht");
        k.komp_haenge(p, t);
        let arm = teil(&mut k, t, "Arm");
        k.takt();
        assert_eq!((lies(&mut k, p, "dauer"), lies(&mut k, p, "zeit")), (0.0, 0.0));
        assert_eq!(k.teil_hole(arm, tf::ROLLEN), 0.0);
        // 2D-Teil: Raum passt nicht
        let t = k.teil_neu(2);
        let p = k.komp_neu(tp);
        assert!(k.komp_haenge(p, t) < 0);
    }

    #[test]
    fn slerp_und_euler_quat() {
        use crate::komponenten::puppe::{euler_quat, slerp};
        let q = euler_quat(30.0, 20.0, 10.0);
        let (d, n, r) = crate::modell::euler(crate::modell::quat_matrix(q));
        assert!(nah(d, 30.0, 1e-9) && nah(n, 20.0, 1e-9) && nah(r, 10.0, 1e-9));
        let a = euler_quat(0.0, 0.0, 0.0);
        let b = euler_quat(0.0, 0.0, 170.0);
        // kürzester Weg auch mit umgekehrtem Vorzeichen
        let bm = [-b[0], -b[1], -b[2], -b[3]];
        let r1 = crate::modell::euler(crate::modell::quat_matrix(slerp(a, b, 0.5))).2;
        let r2 = crate::modell::euler(crate::modell::quat_matrix(slerp(a, bm, 0.5))).2;
        assert!(nah(r1, 85.0, 1e-9) && nah(r2, 85.0, 1e-9));
        assert_eq!(slerp(a, b, 1.0), b);
        assert_eq!(slerp(a, b, 0.0), a);
    }
}

/// H-K26: Belag-Karten (Normal-, Stoff-, Leucht-Karte, Schwelle, beidseitig) – Abschnitt KARTEN3D und Zug-Merkmale nur bei
/// Nutzung, sonst Paket und Hash byte-gleich; Modell-Abbildung der glTF-Karten.
mod hk26 {
    use super::*;
    use crate::paket::{zug, KARTEN3D_BYTES};

    fn karten(k: &Kern) -> Option<Vec<[u32; 4]>> {
        let l = Leser::neu(k.paket()).unwrap();
        let (_, d) = l.abschnitte().find(|(a, _)| *a == abschnitt::KARTEN3D)?;
        Some(d.chunks_exact(KARTEN3D_BYTES).map(|c| [0, 4, 8, 12].map(|o| u32::from_le_bytes([c[o], c[o + 1], c[o + 2], c[o + 3]]))).collect())
    }

    fn zuege(k: &Kern) -> Vec<[u32; 4]> {
        let l = Leser::neu(k.paket()).unwrap();
        let (_, d) = l.abschnitte().find(|(a, _)| *a == abschnitt::ZUEGE3D).unwrap();
        d.chunks_exact(16).map(|c| [0, 4, 8, 12].map(|o| u32::from_le_bytes([c[o], c[o + 1], c[o + 2], c[o + 3]]))).collect()
    }

    #[test]
    fn karten_nur_bei_nutzung() {
        let mut k = welt();
        let kt = typ(&mut k, "Koerper");
        let bt = typ(&mut k, "Belag");
        let (form, belag) = (feld(&mut k, kt, "form"), feld(&mut k, kt, "belag"));
        let f: Vec<i32> = ["normalKarte", "normalStaerke", "stoffKarte", "leuchtKarte", "leuchtFarbe", "schwelle", "beidseitig", "farbe"]
            .iter()
            .map(|n| feld(&mut k, bt, n))
            .collect();
        let w = k.form_grund(1, 0.0, 0.0);
        let bt_teil = k.teil_neu(3);
        let b = k.komp_neu(bt);
        assert_eq!(k.komp_haenge(b, bt_teil), 0);
        let mut koerper = Vec::new();
        for i in 0..2 {
            let t = k.teil_neu(3);
            k.teil_lage(t, i as f64 * 2.0 - 1.0, 0.5, 0.0);
            let c = k.komp_neu(kt);
            assert_eq!(k.setze_zahl(c, form, w as f64), 0);
            assert_eq!(k.komp_haenge(c, t), 0);
            koerper.push((c, t));
        }
        assert_eq!(k.setze_zahl(koerper[0].0, belag, bt_teil as f64), 0);
        k.bild(1);
        k.bild(2);
        let (h, p) = (k.hash_szene(), k.paket().to_vec());
        assert!(karten(&k).is_none());
        assert!(zuege(&k).iter().all(|z| z[0] & !zug::ART == 0));
        // Standardwerte gesetzt: nichts ändert sich
        assert_eq!(k.setze_zahl(b, f[1], 1.0), 0);
        assert_eq!(k.setze_text(b, f[4], b"weiss"), 0);
        assert_eq!(k.setze_zahl(b, f[5], 0.0), 0);
        assert_eq!(k.setze_zahl(b, f[6], 0.0), 0);
        k.bild(2);
        assert_eq!((k.hash_szene(), k.paket()), (h, &p[..]));
        assert!(k.setze_zahl(b, f[5], 1.5) < 0);
        assert!(k.setze_zahl(b, f[1], 4.0) < 0);
        // Karten aus Teiglingen, Stärke, Leuchtfarbe, Schwelle
        let normal = k.bildchen_teigling(&crate::teigling::tests::teigling(64, 64, 0));
        let stoff = k.bildchen_teigling(&crate::teigling::tests::teigling(32, 32, 0));
        let leucht = k.bildchen_teigling(&crate::teigling::tests::teigling(16, 16, 0));
        assert!(normal > 0 && stoff > 0 && leucht > 0);
        for (i, v) in [(0, normal), (2, stoff), (3, leucht)] {
            assert_eq!(k.setze_zahl(b, f[i], v as f64), 0);
        }
        assert_eq!(k.setze_zahl(b, f[1], 0.5), 0);
        assert_eq!(k.setze_text(b, f[4], b"#ff800000"), 0);
        assert_eq!(k.setze_zahl(b, f[5], 0.3), 0);
        k.bild(3);
        assert_ne!(k.hash_szene(), h);
        let ka = karten(&k).expect("Karten → KARTEN3D");
        assert_eq!(ka.len(), 2);
        let marke = 1 << 16 | 1 << 17;
        assert_eq!((ka[1][0] & marke, ka[1][0] >> 24), (marke, 32));
        assert_eq!((ka[1][1] & marke, ka[1][1] >> 24), (marke, 0));
        assert_eq!(ka[1][2] & marke, marke);
        assert_eq!(ka[1][3], 0xFF80_0000 | 77); // 0.3 · 255 + 0.5 → 77
        assert_eq!(ka[0], [0; 4]); // einseitig sortiert hinter den Körper ohne Karten (gleiches Netz)
        // einseitig (Karten, beidseitig nein): FEST-Zug mit Merkmal, der Körper ohne Belag ohne
        let z = zuege(&k);
        let fest: Vec<u32> = z.iter().filter(|z| z[0] & zug::ART == zug::FEST).map(|z| z[0] & !zug::ART).collect();
        assert_eq!(fest, [0, zug::EINSEITIG]);
        // gespiegelt (Größe x < 0) → GEDREHT; beidseitig ja → keine Merkmale, Bit 24 in Wort 1
        k.teil_groesse(koerper[0].1, -1.0, 1.0, 1.0);
        k.bild(4);
        assert!(zuege(&k).iter().any(|z| z[0] == zug::FEST | zug::EINSEITIG | zug::GEDREHT));
        assert_eq!(k.setze_zahl(b, f[6], 1.0), 0);
        k.bild(5);
        assert!(zuege(&k).iter().all(|z| z[0] & !zug::ART == 0));
        assert_eq!(karten(&k).unwrap()[0][1] >> 24, 1);
        // Schwelle macht Durchsichtiges deckend (FEST) und teilt sich durch die Deckkraft der Farbe
        assert_eq!(k.setze_text(b, f[7], b"#ffffff80"), 0);
        k.bild(6);
        assert!(!zuege(&k).iter().any(|z| z[0] & zug::ART == zug::DURCH));
        assert_eq!(karten(&k).unwrap()[0][3] & 0xFF, 152); // 0.3 / (128/255) · 255 + 0.5
        // Deckkraft unter der Schwelle → nicht gezeichnet
        assert_eq!(k.setze_text(b, f[7], b"#ffffff40"), 0);
        k.bild(7);
        assert!(karten(&k).is_none());
        // Belag gelöst → ohne Abschnitt
        assert_eq!(k.setze_text(b, f[7], b"#ffffffff"), 0);
        assert_eq!(k.setze_zahl(koerper[0].0, belag, 0.0), 0);
        k.bild(8);
        assert!(karten(&k).is_none());
    }

    #[test]
    fn modell_karten() {
        let mut k = welt();
        // textur-eingebettet.gltf: Normal (0.8), Metall/Rauheit, Verdeckung, Leuchten, MASK 0.3, doubleSided
        let t = super::hk16::teig(include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../teigling/testmodelle/textur-eingebettet.gltf")));
        let m = k.modell_teig(&t);
        assert!(m > 0);
        let belag = k.modell_info(m, 100) as i32;
        let bt = typ(&mut k, "Belag");
        let bk = k.komp_von(belag, bt);
        let werte: Vec<f64> = ["normalStaerke", "stoffKarte", "leuchtKarte", "schwelle", "beidseitig", "leuchten", "relief"]
            .iter()
            .map(|n| {
                let f = feld(&mut k, bt, n);
                k.hole_zahl(bk, f)
            })
            .collect();
        assert_eq!(werte[0], 0.800000011920929);
        assert!(werte[1] > 0.0 && werte[2] > 0.0 && werte[1] != werte[2] && werte[6] > 0.0);
        assert_eq!((werte[3], werte[4], werte[5]), (0.30000001192092896, 1.0, 1.0));
        let lf = feld(&mut k, bt, "leuchtFarbe");
        assert_eq!(text(&mut k, bk, lf), "weiss");
        // Modell ohne Karten (wuerfel.glb): kein KARTEN3D
        let m2 = k.modell_teig(&super::hk16::teig(include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../teigling/testmodelle/wuerfel.glb"))));
        assert!(k.modell_teil(m2, 0.0, 0.0, 0.0) > 0);
        k.bild(1);
        assert!(karten(&k).is_none());
        assert!(k.modell_teil(m, 0.0, 0.0, -2.0) > 0);
        k.bild(2);
        assert!(karten(&k).is_some());
    }
}

/// H-K23b: Haut (Skinning) – Gelenk-Palette relativ zum Körper-Teil, Abschnitte HAUT/GELENKE und Zug-Merkmal HAUT nur bei
/// gehäuteten Netzen, Rückfall auf starr ohne Gelenk-Teil.
mod hk23b {
    use super::*;
    use crate::paket::{zug, ZUSATZ3D_BYTES};

    const FIGUR: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../teigling/testmodelle/figur.glb"));
    const PUPPE: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../teigling/testmodelle/puppe.glb"));

    fn abschnitte(k: &Kern, art: u32) -> Vec<Vec<u8>> {
        Leser::neu(k.paket()).unwrap().abschnitte().filter(|(a, _)| *a == art).map(|(_, d)| d.to_vec()).collect()
    }
    fn u32_at(d: &[u8], o: usize) -> u32 {
        u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }
    fn zuege(k: &Kern) -> Vec<[u32; 4]> {
        abschnitte(k, abschnitt::ZUEGE3D).concat().chunks_exact(16).map(|c| [0, 4, 8, 12].map(|o| u32_at(c, o))).collect()
    }
    fn palette(k: &Kern) -> Vec<[f32; 12]> {
        let d = abschnitte(k, abschnitt::GELENKE).concat();
        if d.is_empty() {
            return Vec::new();
        }
        let n = u32_at(&d, 0) as usize;
        assert_eq!(d.len(), 4 + n * 48);
        d[4..].chunks_exact(48).map(|c| core::array::from_fn(|i| f32::from_le_bytes([c[i * 4], c[i * 4 + 1], c[i * 4 + 2], c[i * 4 + 3]]))).collect()
    }
    /// Gelenk-Nummer (Index in der Haut) zu einem Knotennamen: Knoten 0 = Figur, 1 … 60 = Gelenke in Haut-Reihenfolge
    fn gelenk(k: &mut Kern, m: i32, name: &str) -> usize {
        let mut aus = [0u8; 64];
        for i in 1..=60 {
            let n = k.modell_text(m, 1, i, &mut aus) as usize;
            if &aus[..n] == name.as_bytes() {
                return i as usize - 1;
            }
        }
        panic!("{}", name)
    }
    fn figur() -> (Kern, i32, i32) {
        let mut k = welt();
        let m = k.modell_teig(&super::hk16::teig(FIGUR));
        assert_eq!(m, 1);
        let t = k.modell_teil(m, 1.0, 0.0, -1.0);
        (k, m, t)
    }
    fn nah(a: f32, b: f32) -> bool {
        (a - b).abs() <= 1e-5
    }

    #[test]
    fn ohne_haut_kein_abschnitt_kein_merkmal() {
        let mut k = welt();
        let m = k.modell_teig(&super::hk16::teig(PUPPE));
        k.modell_teil(m, 0.0, 0.0, 0.0);
        k.bild(1);
        k.bild(2);
        assert!(abschnitte(&k, abschnitt::HAUT).is_empty() && abschnitte(&k, abschnitt::GELENKE).is_empty());
        assert!(zuege(&k).iter().all(|z| z[0] & zug::HAUT == 0));
    }

    #[test]
    fn ruhelage_palette_eins_haut_einmal() {
        let (mut k, _, _) = figur();
        k.bild(1);
        let h = abschnitte(&k, abschnitt::HAUT);
        assert_eq!(h.len(), 1);
        let ecken = u32_at(&h[0], 4) as usize;
        assert_eq!((ecken, h[0].len()), (1440, 8 + 1440 * 16));
        // Ruhelage: Welt(Gelenk) · inverse Bindematrix = Lage der Wurzel = Welt des Körper-Teils → Einheitsmatrix
        let p = palette(&k);
        assert_eq!(p.len(), 60);
        for m in &p {
            for (i, &x) in m.iter().enumerate() {
                assert!(nah(x, if i % 5 == 0 { 1.0 } else { 0.0 }), "{:?}", m);
            }
        }
        let z = zuege(&k);
        assert!(z.iter().any(|z| z[0] & zug::ART == zug::FEST && z[0] & zug::HAUT != 0));
        assert!(z.iter().any(|z| z[0] & 0xFF == zug::SCHATTEN && z[0] & zug::HAUT != 0));
        // HAUT einmal je Netz, GELENKE je Bild; nach paket_voll wieder
        k.bild(2);
        assert!(abschnitte(&k, abschnitt::HAUT).is_empty());
        assert_eq!(palette(&k).len(), 60);
        k.paket_voll();
        k.bild(3);
        assert_eq!(abschnitte(&k, abschnitt::HAUT).len(), 1);
    }

    #[test]
    fn gelenk_dreht_die_haut() {
        let (mut k, m, t) = figur();
        let arm = k.teil_finde(t, b"Oberarm.L");
        assert!(arm > 0);
        assert_eq!(k.teil_setze(arm, tf::ROLLEN, 90.0), 0);
        k.bild(1);
        let p = palette(&k);
        let (ga, gu, gb) = (gelenk(&mut k, m, "Oberarm.L"), gelenk(&mut k, m, "Unterarm.L"), gelenk(&mut k, m, "Becken"));
        // Oberarm und Unterarm um z gedreht (Drehteil ±Rz(90°)), das Becken bleibt Einheit
        for g in [ga, gu] {
            let r = &p[g];
            assert!(nah(r[0], 0.0) && nah(r[1].abs(), 1.0) && nah(r[4].abs(), 1.0) && nah(r[5], 0.0) && nah(r[10], 1.0), "{:?}", r);
            assert_eq!(r[1], -r[4]);
        }
        assert!(nah(p[gb][0], 1.0) && nah(p[gb][3], 0.0));
        // Drehpunkt = Kopf des Oberarms (Ruhelage relativ zur Figur): bleibt an seinem Platz
        let r = &p[ga];
        let kopf = [0.04f32 + 0.14, 1.48 - 0.0, 0.0];
        let q = [0, 1, 2].map(|z| r[z * 4] * kopf[0] + r[z * 4 + 1] * kopf[1] + r[z * 4 + 2] * kopf[2] + r[z * 4 + 3]);
        assert!((0..3).all(|i| (q[i] - kopf[i]).abs() < 1e-4), "{:?}", q);
    }

    #[test]
    fn kopie_eigene_palettenzeilen() {
        let (mut k, _, t) = figur();
        let c = k.teil_kopie(t);
        k.teil_lage(c, -1.0, 0.0, -1.0);
        k.bild(1);
        assert_eq!(palette(&k).len(), 120);
        // erste Palettenzeile je Instanz in ZUSATZ3D.merkmale Bits 16–31: 0 und 60
        let z = abschnitte(&k, abschnitt::ZUSATZ3D).concat();
        let n = abschnitte(&k, abschnitt::INST3D).concat().len() / INST3D_BYTES;
        assert_eq!(z.len(), n * ZUSATZ3D_BYTES);
        let mut basen: Vec<u32> = zuege(&k)
            .iter()
            .filter(|zg| zg[0] & zug::ART == zug::FEST && zg[0] & zug::HAUT != 0)
            .flat_map(|zg| (zg[2]..zg[2] + zg[3]).map(|i| u32_at(&z, i as usize * ZUSATZ3D_BYTES + 12) >> 16))
            .collect();
        basen.sort();
        assert_eq!(basen, [0, 60]);
        assert_eq!(abschnitte(&k, abschnitt::HAUT).len(), 1);
    }

    #[test]
    fn fehlendes_gelenk_starr_wie_vorher() {
        let (mut k, _, t) = figur();
        let hand = k.teil_finde(t, b"Hand.L");
        assert_eq!(k.teil_entferne(hand), 0);
        k.bild(1);
        assert!(palette(&k).is_empty() && abschnitte(&k, abschnitt::HAUT).is_empty());
        assert!(zuege(&k).iter().all(|z| z[0] & zug::HAUT == 0));
    }
}

mod hk22 {
    use super::*;

    /// Welt, ein Teil (3D oder 2D) an (x, y, z) mit einem Schall (Klang-ID `klang`) → (Kern, Teil, Schall).
    fn aufbau(drei_d: bool, x: f64, y: f64, z: f64, klang: f64) -> (Kern, i32, i32) {
        let mut k = welt();
        let t = k.teil_neu(if drei_d { 3 } else { 2 });
        assert_eq!(k.teil_lage(t, x, y, z), 0);
        let ts = typ(&mut k, "Schall");
        let s = k.komp_neu(ts);
        zahl(&mut k, s, "klang", klang);
        assert_eq!(k.komp_haenge(s, t), 0);
        (k, t, s)
    }
    fn zahl(k: &mut Kern, s: i32, f: &str, v: f64) {
        let ts = typ(k, "Schall");
        let fe = feld(k, ts, f);
        assert_eq!(k.setze_zahl(s, fe, v), 0, "{} = {}", f, v);
    }
    fn lies(k: &mut Kern, s: i32, f: &str) -> f64 {
        let ts = typ(k, "Schall");
        let fe = feld(k, ts, f);
        k.hole_zahl(s, fe)
    }
    /// bild + Klangbild als Einträge zu je 7 Zahlen
    fn klangbild(k: &mut Kern, nr: i32) -> Vec<[f64; 7]> {
        k.bild(nr);
        let mut v = vec![0.0; 64];
        let n = k.klangbild(&mut v) as usize;
        assert!(n <= v.len() && n % 7 == 0);
        // wiederholtes Lesen liefert dasselbe; zu kleiner Puffer → nur die Länge (Retry)
        let mut w = vec![0.0; 64];
        assert_eq!(k.klangbild(&mut w) as usize, n);
        assert_eq!(v[..n], w[..n]);
        if n > 0 {
            let mut klein = vec![-1.0; n - 1];
            assert_eq!(k.klangbild(&mut klein) as usize, n);
            assert!(klein.iter().all(|x| *x == -1.0));
        }
        v[..n].chunks(7).map(|c| [c[0], c[1], c[2], c[3], c[4], c[5], c[6]]).collect()
    }
    fn r(x: f64) -> f64 {
        libm::floor(x * 1024.0 + 0.5) / 1024.0
    }

    #[test]
    fn feldtyp_klang_prueft_ganzzahlen() {
        let (mut k, _, s) = aufbau(true, 0.0, 0.0, 0.0, 7.0);
        let ts = typ(&mut k, "Schall");
        let fk = feld(&mut k, ts, "klang");
        assert_eq!(k.hole_zahl(s, fk), 7.0);
        for falsch in [1.5, -1.0, f64::NAN, 5e9] {
            assert!(k.setze_zahl(s, fk, falsch) < 0);
            assert!(k.fehler_text().contains("braucht einen Klang"), "{}", k.fehler_text());
            k.fehler_neu();
        }
        assert_eq!(k.setze_zahl(s, fk, 0.0), 0);
        let j = crate::abi::schema_json(false);
        assert!(j.contains("{\"nummer\": 13, \"name\": \"klang\", \"erwartet\": \"einen Klang\"}"), "{}", &j[..400]);
        assert!(j.contains("\"name\": \"klang\", \"typ\": \"klang\", \"standard\": null"));
        // Lesefelder lassen sich nicht setzen
        let fp = feld(&mut k, ts, "pegel");
        assert!(k.setze_zahl(s, fp, 1.0) < 0);
        k.fehler_neu();
    }

    #[test]
    fn pegel_und_panorama_an_der_kamera() {
        // Standard-Kamera (Teil 1) bei (0, 3, 8), Rechts-Achse +x
        let (mut k, t, s) = aufbau(true, 4.0, 3.0, 8.0, 7.0);
        let soll = r((26.0f64 / 29.0) * (26.0 / 29.0));
        assert_eq!(lies(&mut k, s, "pegel"), soll);
        assert_eq!(lies(&mut k, s, "panorama"), 1.0);
        // links, halbe Lautstärke
        k.teil_lage(t, -4.0, 3.0, 8.0);
        zahl(&mut k, s, "lautstaerke", 0.5);
        assert_eq!(lies(&mut k, s, "pegel"), r(0.5 * (26.0 / 29.0) * (26.0 / 29.0)));
        assert_eq!(lies(&mut k, s, "panorama"), -1.0);
        // innerhalb von nah: voll, Panorama weich zur Mitte
        zahl(&mut k, s, "lautstaerke", 1.0);
        zahl(&mut k, s, "nah", 2.0);
        k.teil_lage(t, 1.0, 3.0, 8.0);
        assert_eq!((lies(&mut k, s, "pegel"), lies(&mut k, s, "panorama")), (1.0, 0.5));
        // am Ort des Hörers: Mitte; ab weite stumm
        k.teil_lage(t, 0.0, 3.0, 8.0);
        assert_eq!((lies(&mut k, s, "pegel"), lies(&mut k, s, "panorama")), (1.0, 0.0));
        k.teil_lage(t, 0.0, 3.0, 38.0);
        assert_eq!(lies(&mut k, s, "pegel"), 0.0);
        // eigene Kamera: schaut entlang +x → Rechts-Achse +z (die Standard-Kamera, Teil 1, ist aus)
        let kt = k.teil_neu(3);
        k.teil_lage(kt, 0.0, 0.0, 0.0);
        k.teil_schaue(kt, 10.0, 0.0, 0.0);
        let tk = typ(&mut k, "Kamera");
        let kk = k.komp_neu(tk);
        k.komp_haenge(kk, kt);
        let fa = feld(&mut k, tk, "aktiv");
        let k1 = k.komp_von(1, tk);
        assert_eq!(k.setze_zahl(k1, fa, 0.0), 0);
        k.teil_lage(t, 0.0, 0.0, 5.0);
        zahl(&mut k, s, "nah", 1.0);
        assert_eq!(lies(&mut k, s, "panorama"), 1.0);
        assert_eq!(lies(&mut k, s, "pegel"), r((25.0f64 / 29.0) * (25.0 / 29.0)));
    }

    #[test]
    fn klangbild_start_raum_stopp() {
        let (mut k, t, s) = aufbau(true, 4.0, 3.0, 8.0, 7.0);
        let hash0 = k.hash_szene();
        let p0 = r((26.0f64 / 29.0) * (26.0 / 29.0));
        assert_eq!(klangbild(&mut k, 0), vec![[1.0, s as f64, 7.0, p0, 1.0, 1.0, 1.0]]);
        // das Klangbild ändert den Szenen-Hash nicht
        assert_eq!(k.hash_szene(), hash0);
        // unverändert → leer
        k.takt();
        assert!(klangbild(&mut k, 1).is_empty());
        // Lage, Tonhöhe → raum
        k.teil_lage(t, -4.0, 3.0, 8.0);
        zahl(&mut k, s, "tonhoehe", 2.0);
        k.takt();
        assert_eq!(klangbild(&mut k, 2), vec![[2.0, s as f64, 7.0, p0, -1.0, 2.0, 1.0]]);
        // spielt nein → stopp; ja → start (Schleife aus gilt ab dem Start)
        zahl(&mut k, s, "spielt", 0.0);
        k.takt();
        assert_eq!(klangbild(&mut k, 3), vec![[3.0, s as f64, 7.0, p0, -1.0, 2.0, 0.0]]);
        zahl(&mut k, s, "spielt", 1.0);
        zahl(&mut k, s, "schleife", 0.0);
        k.takt();
        assert_eq!(klangbild(&mut k, 4), vec![[1.0, s as f64, 7.0, p0, -1.0, 2.0, 0.0]]);
        // nein → ja zwischen zwei Bildern (zwei Takte): Neustart von vorn
        zahl(&mut k, s, "spielt", 0.0);
        k.takt();
        zahl(&mut k, s, "spielt", 1.0);
        k.takt();
        let e = klangbild(&mut k, 5);
        assert_eq!(e.iter().map(|x| x[0]).collect::<Vec<_>>(), vec![3.0, 1.0]);
        // anderer Klang → stopp + start
        zahl(&mut k, s, "klang", 9.0);
        k.takt();
        let e = klangbild(&mut k, 6);
        assert_eq!((e[0][0], e[0][2], e[1][0], e[1][2]), (3.0, 7.0, 1.0, 9.0));
        // Klang 0 → stopp, Teil entfernt → stopp (die Komponente ist weg)
        zahl(&mut k, s, "klang", 0.0);
        k.takt();
        assert_eq!(klangbild(&mut k, 7)[0][0], 3.0);
        zahl(&mut k, s, "klang", 9.0);
        k.takt();
        assert_eq!(klangbild(&mut k, 8)[0][0], 1.0);
        assert_eq!(k.teil_entferne(t), 0);
        k.takt();
        assert_eq!(klangbild(&mut k, 9), vec![[3.0, s as f64, 9.0, p0, -1.0, 2.0, 0.0]]);
        k.takt();
        assert!(klangbild(&mut k, 10).is_empty());
    }

    #[test]
    fn klangbild_nach_handle_und_ruhe() {
        let (mut k, t, s) = aufbau(true, 0.0, 3.0, 8.0, 3.0);
        let t2 = k.teil_neu(3);
        let ts = typ(&mut k, "Schall");
        let s2 = k.komp_neu(ts);
        zahl(&mut k, s2, "klang", 4.0);
        k.komp_haenge(s2, t2);
        let e = klangbild(&mut k, 0);
        assert_eq!(e.iter().map(|x| (x[0], x[1])).collect::<Vec<_>>(), vec![(1.0, s as f64), (1.0, s2 as f64)]);
        // ruhendes Teil (Vorlage) → stopp, wieder wach → start
        let tv = typ(&mut k, "Vorlage");
        let v = k.komp_neu(tv);
        k.komp_haenge(v, t);
        k.takt();
        assert_eq!(klangbild(&mut k, 1), vec![[3.0, s as f64, 3.0, 1.0, 0.0, 1.0, 0.0]]);
        k.komp_loese(v);
        k.takt();
        assert_eq!(klangbild(&mut k, 2)[0][..2], [1.0, s as f64]);
        // gelöster Schall → stopp
        k.komp_loese(s2);
        k.takt();
        assert_eq!(klangbild(&mut k, 3)[0][..2], [3.0, s2 as f64]);
    }

    #[test]
    fn zwei_d_spielfeld_und_blick() {
        // Spielfeld 640 × 360: Hörer in der Mitte (320, 180)
        let (mut k, _, s) = aufbau(false, 420.0, 180.0, 0.0, 5.0);
        zahl(&mut k, s, "weite", 400.0);
        assert_eq!(lies(&mut k, s, "pegel"), r((300.0f64 / 399.0) * (300.0 / 399.0)));
        assert_eq!(lies(&mut k, s, "panorama"), 1.0);
        // Blick auf (420, 100): Quelle genau darunter → Mitte; gedrehter Blick dreht die Rechts-Achse
        let bt = k.teil_neu(2);
        k.teil_lage(bt, 420.0, 100.0, 0.0);
        let tb = typ(&mut k, "Blick");
        let b = k.komp_neu(tb);
        k.komp_haenge(b, bt);
        assert_eq!(lies(&mut k, s, "panorama"), 0.0);
        assert_eq!(lies(&mut k, s, "pegel"), r((320.0f64 / 399.0) * (320.0 / 399.0)));
        k.teil_setze(bt, tf::DREHUNG, 90.0);
        let p = lies(&mut k, s, "panorama");
        assert!(p == 1.0 || p == -1.0, "{}", p);
        let e = klangbild(&mut k, 0);
        assert_eq!(e[0][0..5], [1.0, s as f64, 5.0, r((320.0f64 / 399.0) * (320.0 / 399.0)), p]);
    }

    #[test]
    fn stumm_hinter_weite_ohne_raum() {
        // hinter weite: Pegel 0 – ein wanderndes Panorama meldet nichts, bis der Schall wieder hörbar wird
        let (mut k, t, s) = aufbau(true, 0.0, 3.0, -40.0, 7.0);
        assert_eq!(klangbild(&mut k, 0), vec![[1.0, s as f64, 7.0, 0.0, 0.0, 1.0, 1.0]]);
        k.teil_lage(t, 40.0, 3.0, 8.0);
        k.takt();
        assert!(klangbild(&mut k, 1).is_empty());
        k.teil_lage(t, 10.0, 3.0, 8.0);
        k.takt();
        assert_eq!(klangbild(&mut k, 2), vec![[2.0, s as f64, 7.0, r((20.0f64 / 29.0) * (20.0 / 29.0)), 1.0, 1.0, 1.0]]);
    }
}

/// H-K27: `Wind` und `Streu` – Wiegen im Vertex-Shader, Streu-Instanzen als Ressource, je Bild die sichtbaren Zellen.
mod hk27 {
    use super::*;
    use crate::paket::{zug, KARTEN3D_BYTES, ZUSATZ3D_BYTES};

    fn abschnitt_von(k: &Kern, art: u32) -> Option<Vec<u8>> {
        let l = Leser::neu(k.paket()).unwrap();
        let d = l.abschnitte().find(|(a, _)| *a == art).map(|(_, d)| d.to_vec());
        d
    }
    fn u32_at(d: &[u8], o: usize) -> u32 {
        u32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }
    fn f32_at(d: &[u8], o: usize) -> f32 {
        f32::from_le_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
    }
    /// STREU3D: je Eintrag (Ressource, Netz, Merkmale, Schatten, Läufe)
    fn streu3d(k: &Kern) -> Vec<(u32, u32, u32, u32, Vec<[u32; 2]>)> {
        let Some(d) = abschnitt_von(k, abschnitt::STREU3D) else { return Vec::new() };
        let mut o = 4;
        let mut v = Vec::new();
        for _ in 0..u32_at(&d, 0) {
            let n = u32_at(&d, o + 16) as usize;
            let l = (0..n).map(|i| [u32_at(&d, o + 20 + i * 8), u32_at(&d, o + 24 + i * 8)]).collect();
            v.push((u32_at(&d, o), u32_at(&d, o + 4), u32_at(&d, o + 8), u32_at(&d, o + 12), l));
            o += 20 + n * 8;
        }
        v
    }

    struct Szene {
        k: Kern,
        streu: i32,
        f: [i32; 10],
        gel: i32,
    }

    /// Kamera bei (0, 6, 22) auf den Ursprung, Gelände 17 × 17 (weite 2, sanft geneigt, rechts ein steiler Rand), Halme darauf.
    fn szene(anzahl: f64) -> Szene {
        let mut k = welt();
        let st = typ(&mut k, "Streu");
        let gt = typ(&mut k, "Gelaende");
        let bt = typ(&mut k, "Belag");
        let f = ["form", "belag", "anzahl", "breite", "tiefe", "gelaende", "hang", "dichte", "sichtweite", "saat"].map(|n| feld(&mut k, st, n));
        k.teil_lage(1, 0.0, 6.0, 22.0);
        k.teil_schaue(1, 0.0, 0.0, 0.0);
        let g = k.teil_neu(3);
        let gc = k.komp_neu(gt);
        let (gh, gsp, gze, gw) = (feld(&mut k, gt, "hoehen"), feld(&mut k, gt, "spalten"), feld(&mut k, gt, "zeilen"), feld(&mut k, gt, "weite"));
        let hoehen: Vec<f64> = (0..17 * 17).map(|i| (i % 17) as f64 * 0.25 + if i % 17 >= 14 { ((i % 17) - 13) as f64 * 6.0 } else { 0.0 }).collect();
        assert_eq!(k.setze_zahlen(gc, gh, &hoehen), 0);
        for (ff, v) in [(gsp, 17.0), (gze, 17.0), (gw, 2.0)] {
            assert_eq!(k.setze_zahl(gc, ff, v), 0);
        }
        assert_eq!(k.komp_haenge(gc, g), 0);
        let bteil = k.teil_neu(3);
        let b = k.komp_neu(bt);
        assert_eq!(k.komp_haenge(b, bteil), 0);
        let halm = k.form_eigene(&[-0.05, 0.0, 0.0, 0.05, 0.0, 0.0, 0.0, 1.0, 0.0], &[0.0, 1.0, 2.0], 0);
        let t = k.teil_neu(3);
        let c = k.komp_neu(st);
        for (i, v) in [(0, halm as f64), (1, bteil as f64), (2, anzahl), (3, 30.0), (4, 30.0), (5, g as f64)] {
            assert_eq!(k.setze_zahl(c, f[i], v), 0);
        }
        assert_eq!(k.komp_haenge(c, t), 0);
        Szene { k, streu: c, f, gel: g }
    }

    #[test]
    fn typnummern_und_grenzen() {
        let mut k = welt();
        // Typnummern in Merge-Reihenfolge (HERD.md §13.1, §11.1): nach Schall 37
        assert_eq!(typ(&mut k, "Wind"), 38);
        assert_eq!(typ(&mut k, "Streu"), 39);
        let st = typ(&mut k, "Streu");
        let n = feld(&mut k, st, "anzahl");
        let t2 = k.teil_neu(2);
        let c = k.komp_neu(st);
        assert!(k.komp_haenge(c, t2) < 0);
        assert!(k.setze_zahl(c, n, 200001.0) < 0);
        assert!(k.setze_zahl(c, n, 1.5) < 0);
        assert_eq!(k.hole_zahl(c, n), 1000.0);
        let wt = typ(&mut k, "Wind");
        let w = k.komp_neu(wt);
        let staerke = feld(&mut k, wt, "staerke");
        assert!(k.setze_zahl(w, staerke, 6.0) < 0);
    }

    /// Ohne Wind und Streu ändert sich nichts; `wiegen` 0 = Standard (Paket byte-gleich); Wind allein schreibt nur WIND.
    #[test]
    fn ohne_nutzung_byte_gleich() {
        let mut k = welt();
        let kt = typ(&mut k, "Koerper");
        let bt = typ(&mut k, "Belag");
        let wt = typ(&mut k, "Wind");
        let (form, belag) = (feld(&mut k, kt, "form"), feld(&mut k, kt, "belag"));
        let wiegen = feld(&mut k, bt, "wiegen");
        let w = k.form_grund(1, 0.0, 0.0);
        let bteil = k.teil_neu(3);
        let b = k.komp_neu(bt);
        assert_eq!(k.komp_haenge(b, bteil), 0);
        let t = k.teil_neu(3);
        let c = k.komp_neu(kt);
        assert_eq!(k.setze_zahl(c, form, w as f64), 0);
        assert_eq!(k.setze_zahl(c, belag, bteil as f64), 0);
        assert_eq!(k.komp_haenge(c, t), 0);
        k.takt();
        k.bild(5);
        k.bild(5);
        let (h, p) = (k.hash_szene(), k.paket().to_vec());
        assert!(abschnitt_von(&k, abschnitt::WIND).is_none() && abschnitt_von(&k, abschnitt::STREU3D).is_none());
        assert_eq!(k.setze_zahl(b, wiegen, 0.0), 0);
        k.takt();
        k.bild(5);
        assert_eq!((k.hash_szene(), k.paket()), (h, &p[..]));
        // wiegen → ZUSATZ3D.merkmale Bits 2–7 (Züge ohne eigene Merkmale)
        assert_eq!(k.setze_zahl(b, wiegen, 0.5), 0);
        k.bild(5);
        let z = abschnitt_von(&k, abschnitt::ZUSATZ3D).unwrap();
        assert_eq!(z.len(), ZUSATZ3D_BYTES);
        assert_eq!((u32_at(&z, 12) >> 2) & 63, 32);
        assert!(abschnitt_von(&k, abschnitt::ZUEGE3D).unwrap().chunks_exact(16).all(|q| u32_at(q, 0) & !zug::ART == 0));
        assert!(k.setze_zahl(b, wiegen, 1.5) < 0);
        // Wind: Abschnitt WIND (Richtung normiert, Phase aus der Bildnummer), sonst nichts anders
        assert_eq!(k.setze_zahl(b, wiegen, 0.0), 0);
        let lt = k.teil_neu(3);
        let wk = k.komp_neu(wt);
        let (rx, rz, ws) = (feld(&mut k, wt, "richtungX"), feld(&mut k, wt, "richtungZ"), feld(&mut k, wt, "staerke"));
        assert_eq!(k.setze_zahl(wk, rx, 3.0), 0);
        assert_eq!(k.setze_zahl(wk, rz, 4.0), 0);
        assert_eq!(k.setze_zahl(wk, ws, 2.0), 0);
        assert_eq!(k.komp_haenge(wk, lt), 0);
        k.bild(30);
        let d = abschnitt_von(&k, abschnitt::WIND).unwrap();
        assert_eq!(d.len(), crate::komponenten::wind::WIND_BYTES);
        assert_eq!([f32_at(&d, 0), f32_at(&d, 4), f32_at(&d, 8), f32_at(&d, 12)], [0.6, 0.8, 2.0, 1.0]);
        // 30 Bilder = 0,5 s · 0,5 Hz → Phase π/2
        assert!((f32_at(&d, 20) - core::f32::consts::FRAC_PI_2).abs() < 1e-6);
        let sonst = |b: &[u8]| -> Vec<(u32, Vec<u8>)> { Leser::neu(b).unwrap().abschnitte().filter(|(a, _)| *a != abschnitt::WIND && *a != abschnitt::SZENE).map(|(a, d)| (a, d.to_vec())).collect() };
        assert_eq!(sonst(k.paket()), sonst(&p));
    }

    /// Punkte: einmal je Stand als Ressource, auf der Geländehöhe, bitgleich zwischen zwei Welten; Hang und Dichte dünnen aus.
    #[test]
    fn punkte_ressource_und_gelaende() {
        let mut a = szene(4000.0);
        a.k.takt();
        a.k.bild(1);
        let r = abschnitt_von(&a.k, abschnitt::STREU).expect("STREU im ersten Bild");
        let (id, n) = (u32_at(&r, 0), u32_at(&r, 4) as usize);
        assert_eq!(id, 1);
        assert_eq!(r.len(), 8 + n * (INST3D_BYTES + ZUSATZ3D_BYTES + KARTEN3D_BYTES));
        // der steile Rand (letzte Spalten) bleibt kahl: weniger als alle
        assert!(n > 2500 && n < 4000, "{n}");
        // jede Instanz steht auf der Höhe des Geländes (Dreiecksebene), aufrecht
        let hoehen: Vec<f64> = (0..17 * 17).map(|i| (i % 17) as f64 * 0.25 + if i % 17 >= 14 { ((i % 17) - 13) as f64 * 6.0 } else { 0.0 }).collect();
        for i in (0..n).step_by(97) {
            let o = 8 + i * INST3D_BYTES;
            let (x, y, z) = (f32_at(&r, o + 12) as f64, f32_at(&r, o + 28) as f64, f32_at(&r, o + 44) as f64);
            let soll = crate::komponenten::gelaende::hoehe(&hoehen, 17, 17, 2.0, x, z).unwrap();
            assert!((y - soll).abs() < 1e-4, "{y} {soll}");
            assert_eq!(f32_at(&r, o + 4), 0.0);
            assert_eq!(f32_at(&r, o + 16), 0.0);
        }
        // zweites Bild: keine Ressource mehr, Läufe ja
        a.k.bild(2);
        assert!(abschnitt_von(&a.k, abschnitt::STREU).is_none());
        let s = streu3d(&a.k);
        assert_eq!(s.len(), 1);
        assert_eq!((s[0].0, s[0].2, s[0].3), (1, 0, 0));
        assert!(s[0].4.iter().all(|l| l[1] > 0 && (l[0] + l[1]) as usize <= n));
        // nach paket_voll erneut
        a.k.paket_voll();
        a.k.bild(2);
        assert_eq!(abschnitt_von(&a.k, abschnitt::STREU).unwrap(), r);
        // bitgleich: zweite Welt, gleiche Hashes
        let mut b = szene(4000.0);
        b.k.takt();
        b.k.bild(1);
        assert_eq!(a.k.hash_szene(), b.k.hash_szene());
        assert_eq!(abschnitt_von(&b.k, abschnitt::STREU).unwrap(), r);
        // gleiche Werte erneut setzen baut nicht neu; neue Werte → derselbe Platz, neuer Stand, erneut gesendet
        assert_eq!(a.k.setze_zahl(a.streu, a.f[2], 4000.0), 0);
        a.k.takt();
        a.k.bild(3);
        assert!(abschnitt_von(&a.k, abschnitt::STREU).is_none());
        assert_eq!(a.k.setze_zahl(a.streu, a.f[6], 5.0), 0);
        a.k.takt();
        a.k.bild(4);
        assert!(streu3d(&a.k).is_empty(), "alles steiler als 5°");
        assert_eq!(a.k.setze_zahl(a.streu, a.f[6], 40.0), 0);
        assert_eq!(a.k.setze_zahl(a.streu, a.f[2], 2000.0), 0);
        a.k.takt();
        a.k.bild(4);
        let r2 = abschnitt_von(&a.k, abschnitt::STREU).unwrap();
        assert_eq!(u32_at(&r2, 0), 1);
        assert!((u32_at(&r2, 4) as usize) < n);
        // Gelände bewegt → neu (alle Punkte 1 höher); Dichte schwarz → leer (nichts gezeichnet)
        a.k.teil_lage(a.gel, 0.0, 1.0, 0.0);
        a.k.takt();
        a.k.bild(5);
        let r3 = abschnitt_von(&a.k, abschnitt::STREU).unwrap();
        assert_eq!(f32_at(&r3, 8 + 28), f32_at(&r2, 8 + 28) + 1.0);
        let schwarz = a.k.bildchen_rgba(2, 2, &[0, 0, 0, 255].repeat(4));
        assert_eq!(a.k.setze_zahl(a.streu, a.f[7], schwarz as f64), 0);
        a.k.takt();
        a.k.bild(6);
        assert!(streu3d(&a.k).is_empty());
        // Saat: andere Punkte
        let mut c = szene(4000.0);
        assert_eq!(c.k.setze_zahl(c.streu, c.f[9], 99.0), 0);
        c.k.takt();
        c.k.bild(1);
        assert_ne!(abschnitt_von(&c.k, abschnitt::STREU).unwrap(), r);
    }

    /// Sichtweite: ferne Zellen fallen weg, ab der Hälfte ausgedünnt; 100 000 Halme in wenigen Läufen.
    #[test]
    fn sichtweite_und_laeufe() {
        let mut a = szene(100000.0);
        assert_eq!(a.k.setze_zahl(a.streu, a.f[8], 0.0), 0);
        a.k.takt();
        a.k.bild(1);
        let alle: u32 = streu3d(&a.k)[0].4.iter().map(|l| l[1]).sum();
        let laeufe = streu3d(&a.k)[0].4.len();
        assert!(laeufe <= 16, "{laeufe}");
        assert_eq!(a.k.setze_zahl(a.streu, a.f[8], 20.0), 0);
        a.k.bild(2);
        let s = streu3d(&a.k);
        let nah: u32 = s[0].4.iter().map(|l| l[1]).sum();
        assert!(nah > 0 && nah < alle / 2, "{nah} {alle}");
        assert!(s[0].4.len() <= 64);
    }
}
