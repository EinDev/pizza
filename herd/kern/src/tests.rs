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
        assert_eq!(FELDTYPEN.len(), 12);
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
    const NACHTRAEGE: &[(&str, &str)] = &[("Koerper", "belag")];

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
        assert_eq!(k.fehler_text(), "Fuehler.form kennt 'dreieck' nicht. Erlaubt: auto, kreis, rechteck, kasten, kugel.");
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

