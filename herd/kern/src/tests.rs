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
        // v1-Komponenten tragen keine neuen Schlüssel
        let ohne = crate::abi::schema_json(false);
        assert!(!ohne.contains("\"lesen\"") && !ohne.contains("\"nachtrag\""));
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

    #[test]
    fn v1_arten_ohne_neue_eigenschaften() {
        for a in ARTEN.iter().filter(|a| !a.nur_test) {
            assert!(a.nachlauf.is_none(), "{}", a.schema.name);
            for f in a.schema.felder {
                assert!(!f.lesen && !f.nachtrag, "{}.{}", a.schema.name, f.name);
                assert!(!matches!(f.typ, Typ::TeilListe | Typ::ZahlListe));
            }
        }
    }
}
