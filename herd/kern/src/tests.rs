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
    assert!(k.hole_zahl(c, 7).is_nan());
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
