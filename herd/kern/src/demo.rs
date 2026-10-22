//! Demo-Szenen für Tests, Referenzbilder und Sichtprüfung (unabhängig vom Interpreter gebaut).

use alloc::vec::Vec;

use crate::kodierer::palette::*;
use crate::kodierer::{bildchen_aus_zeilen, Bild, Nachricht};

pub struct Szene {
    pub name: &'static str,
    pub nachrichten: Vec<Vec<u8>>,
}

pub const PIZZA: [&str; 16] = [
    ".....kkkkkk.....",
    "...kkeeeeeekk...",
    "..keetmmmmteek..",
    ".ketmmrrmmmmtek.",
    ".kemmrrrrmbmmek.",
    "kemmmrrrmmbbmmek",
    "ketmmmmmmmmmmtek",
    "kemmbmmmmrrmmmek",
    "kemmbbmmrrrrmmek",
    "ketmmmmmrrrrmtek",
    "kemmrrmmmrrmmmek",
    ".kemrrrrmmmbmek.",
    ".ketmrrmmmbbtek.",
    "..keetmmmmteek..",
    "...kkeeeeeekk...",
    ".....kkkkkk.....",
];

pub const PILZ: [&str; 8] = ["..rrrr..", ".rrwrrr.", "rwrrrrwr", "rrrrwrrr", "..mmmm..", "..mmmm..", "..mmmm..", "...mm..."];

fn bildchen(id: u32, zeilen: &[&str]) -> Vec<u8> {
    let (b, h, rgba) = bildchen_aus_zeilen(zeilen);
    Nachricht::bildchen(id, b, h, &rgba)
}

fn fliesen(id: u32) -> Vec<u8> {
    let mut z: Vec<alloc::string::String> = Vec::new();
    for y in 0..8 {
        let mut s = alloc::string::String::new();
        for x in 0..8 {
            s.push(if (x + y) % 2 == 0 { 'e' } else { 'k' });
        }
        z.push(s);
    }
    let r: Vec<&str> = z.iter().map(|s| s.as_str()).collect();
    bildchen(id, &r)
}

/// Alle 2D-Formen, Umrisse, Rundungen, Lage-Stapel, Bildchen und etwas Text.
pub fn zwei_d() -> Szene {
    let mut n = Vec::new();
    n.push(bildchen(1, &PIZZA));
    n.push(bildchen(2, &PILZ));
    n.push(Nachricht::fenster(640, 360, "Herd 2D"));
    let mut b = Bild::neu(1);
    b.hintergrund(MOZZARELLA);
    // Rechtecke
    b.rechteck(20.0, 20.0, 110.0, 60.0, TOMATE, 0.0, 0.0);
    b.rechteck(145.0, 20.0, 110.0, 60.0, BASILIKUM, 0.0, 18.0);
    b.rechteck(270.0, 20.0, 110.0, 60.0, WASSER, 4.0, 0.0);
    b.rechteck(395.0, 20.0, 110.0, 60.0, AUBERGINE, 6.0, 20.0);
    b.rechteck(520.0, 20.0, 100.0, 60.0, ANANAS, 0.0, 30.0);
    // Kreise
    b.kreis(60.0, 130.0, 36.0, SALAMI, 0.0);
    b.kreis(150.0, 130.0, 36.0, KRUSTE, 6.0);
    b.kreis(230.0, 130.0, 22.0, SENF, 0.0);
    b.kreis(230.0, 130.0, 10.0, OFEN, 0.0);
    b.kreis(290.0, 130.0, 4.0, OFEN, 0.0);
    b.kreis(305.0, 130.0, 2.0, OFEN, 0.0);
    // halbdurchsichtige Überlappung
    b.kreis(360.0, 125.0, 30.0, mit_alpha(TOMATE, 160), 0.0);
    b.kreis(390.0, 125.0, 30.0, mit_alpha(WASSER, 160), 0.0);
    b.kreis(375.0, 150.0, 30.0, mit_alpha(ANANAS, 160), 0.0);
    // Linien
    b.linie(440.0, 100.0, 620.0, 110.0, 2.0, OFEN);
    b.linie(440.0, 120.0, 620.0, 140.0, 8.0, TOMATE);
    b.linie(440.0, 160.0, 620.0, 145.0, 16.0, mit_alpha(BASILIKUM, 200));
    b.linie(450.0, 175.0, 450.0, 175.0, 10.0, AUBERGINE);
    // Vielecke: Dreieck, Stern (konkav), L, Umriss
    b.vieleck(&[30.0, 280.0, 90.0, 190.0, 120.0, 280.0], TEIG, 0.0);
    let mut stern = Vec::new();
    for k in 0..10 {
        let w = core::f64::consts::PI * 2.0 * k as f64 / 10.0 - core::f64::consts::PI / 2.0;
        let r = if k % 2 == 0 { 48.0 } else { 20.0 };
        stern.push(185.0 + r * libm::cos(w));
        stern.push(240.0 + r * libm::sin(w));
    }
    b.vieleck(&stern, ANANAS, 0.0);
    b.vieleck(&stern, OFEN, 2.0);
    b.vieleck(&[250.0, 195.0, 330.0, 195.0, 330.0, 220.0, 275.0, 220.0, 275.0, 285.0, 250.0, 285.0], OLIVEN, 0.0);
    b.vieleck(&[345.0, 200.0, 420.0, 200.0, 400.0, 285.0, 360.0, 285.0, 382.0, 240.0], SCHINKEN, 5.0);
    // Lage-Stapel: Fächer gedrehter Quadrate
    b.merke();
    b.schiebe(500.0, 245.0);
    for k in 0..8 {
        b.merke();
        b.drehe(k as f64 * 11.25);
        b.skaliere(1.0 - k as f64 * 0.08, 1.0 - k as f64 * 0.08);
        let c = if k % 2 == 0 { TOMATE } else { MOZZARELLA };
        b.rechteck(-40.0, -40.0, 80.0, 80.0, c, 0.0, 6.0);
        b.zurueck();
    }
    b.zurueck();
    // Bildchen
    b.bild(1, 560.0, 190.0, 3.0, WEISS);
    b.bild(2, 600.0, 250.0, 4.0, WEISS);
    b.bild(1, 560.0, 245.0, 1.0, WEISS);
    b.bild(1, 560.0, 265.0, 2.0, mit_alpha(WEISS, 128));
    // Text
    b.text("Herd 2D – Formen, Umrisse & Bildchen", 20.0, 300.0, 22.0, OFEN, 0);
    b.text("klein: 12 px · Größe ÄÖÜ äöü ß € 3×4÷2 „Pizza“ …", 20.0, 330.0, 12.0, GRAU, 0);
    b.text("rechts", 620.0, 330.0, 14.0, SALAMI, 2);
    n.push(b.fertig());
    Szene { name: "zwei-d", nachrichten: n }
}

/// Text in vielen Größen, Ausrichtungen, Farben, auf hell und dunkel.
pub fn text() -> Szene {
    let mut n = Vec::new();
    n.push(Nachricht::fenster(640, 360, "Herd Text"));
    let mut b = Bild::neu(7);
    b.hintergrund(MOZZARELLA);
    b.rechteck(330.0, 0.0, 310.0, 360.0, OFEN, 0.0, 0.0);
    let mut y = 10.0;
    for g in [10.0, 12.0, 14.0, 16.0, 20.0, 24.0, 32.0, 48.0, 72.0] {
        b.text("Pizza Herd", 12.0, y, g, OFEN, 0);
        y += g * 1.2;
    }
    b.text("Links", 345.0, 16.0, 20.0, MOZZARELLA, 0);
    b.text("Mitte", 485.0, 46.0, 20.0, ANANAS, 1);
    b.text("Rechts", 625.0, 76.0, 20.0, SCHINKEN, 2);
    b.text("ÄÖÜ äöü ß € ° · – — „“ ‚‘ … × ÷", 345.0, 112.0, 18.0, WEISS, 0);
    b.text("!\"#$%&'()*+,-./0123456789:;<=>?@", 345.0, 142.0, 14.0, HIMMEL, 0);
    b.text("ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`", 345.0, 164.0, 14.0, HIMMEL, 0);
    b.text("abcdefghijklmnopqrstuvwxyz{|}~", 345.0, 186.0, 14.0, HIMMEL, 0);
    b.text("Zwei Zeilen:\nPunkte 1234", 345.0, 215.0, 16.0, TEIG, 0);
    b.merke();
    b.schiebe(480.0, 300.0);
    b.drehe(-12.0);
    b.text("gedreht!", 0.0, -20.0, 36.0, TOMATE, 1);
    b.zurueck();
    b.text("Unbekannt: \u{4e2d} → ?", 345.0, 330.0, 14.0, GRAU, 0);
    n.push(b.fertig());
    Szene { name: "text", nachrichten: n }
}

fn formen(n: &mut Vec<Vec<u8>>) {
    n.push(Nachricht::grundform(1, 1, 0, 0.0)); // würfel
    n.push(Nachricht::grundform(2, 2, 32, 0.0)); // kugel
    n.push(Nachricht::grundform(3, 3, 32, 0.0)); // zylinder
    n.push(Nachricht::grundform(4, 4, 32, 0.0)); // kegel
    n.push(Nachricht::grundform(5, 5, 0, 0.0)); // ebene
    n.push(Nachricht::grundform(6, 6, 48, 0.3)); // ring
    n.push(bildchen(7, &PIZZA));
    n.push(fliesen(8));
    // eigene Form: vierseitige Pyramide (flach)
    n.push(Nachricht::eigene_form(
        9,
        &[-0.5, 0.0, -0.5, 0.5, 0.0, -0.5, 0.5, 0.0, 0.5, -0.5, 0.0, 0.5, 0.0, 0.9, 0.0],
        &[0, 1, 2, 0, 2, 3, 3, 2, 4, 2, 1, 4, 1, 0, 4, 0, 3, 4],
        false,
    ));
}

/// Alle Grundformen, Sonne mit Schatten, Punktlichter, Nebel, Himmel, Textur, Durchsichtiges, HUD.
pub fn drei_d() -> Szene {
    let mut n = Vec::new();
    formen(&mut n);
    n.push(Nachricht::fenster(640, 360, "Herd 3D"));
    let mut b = Bild::neu(42);
    b.himmel(HIMMEL, MOZZARELLA);
    b.kamera(5.2, 3.6, 7.4, 0.3, 0.5, 0.0, 50.0);
    b.sonne(0.55, 1.0, 0.35, WEISS, 1.0, true);
    b.nebel(MOZZARELLA, 14.0, 34.0);
    b.licht(-1.2, 1.4, 2.2, ANANAS, 4.0);
    b.licht(2.6, 0.8, -1.4, TOMATE, 3.5);
    // Boden: gefliest (Textur), groß
    b.zeichne(5, [0.0, 0.0, 0.0], [40.0, 1.0, 40.0], 0.0, 0.0, 0.0, WEISS, 0.1, 0.0, 8);
    // Formen
    b.zeichne(1, [-2.2, 0.5, 0.0], [1.0, 1.0, 1.0], 30.0, 0.0, 0.0, WEISS, 0.3, 0.0, 7);
    b.zeichne(2, [-0.6, 0.6, 1.4], [1.2, 1.2, 1.2], 0.0, 0.0, 0.0, TOMATE, 0.9, 0.0, 0);
    b.zeichne(3, [0.9, 0.6, -0.4], [0.9, 1.2, 0.9], 0.0, 0.0, 0.0, KRUSTE, 0.3, 0.0, 0);
    b.zeichne(4, [2.4, 0.6, 0.6], [0.9, 1.2, 0.9], 0.0, 0.0, 0.0, ANANAS, 0.5, 0.0, 0);
    b.zeichne(6, [0.4, 0.17, 2.6], [1.6, 1.6, 1.6], 0.0, 0.0, 0.0, KRUSTE, 0.4, 0.0, 0);
    b.zeichne(9, [-1.4, 0.0, -2.2], [1.4, 1.4, 1.4], 20.0, 0.0, 0.0, AUBERGINE, 0.5, 0.0, 0);
    b.zeichne(1, [-3.6, 0.35, 2.0], [0.7, 0.7, 0.7], -15.0, 0.0, 0.0, BASILIKUM, 0.2, 0.0, 0);
    // schwebender, gekippter Ring und leuchtende Kugeln an den Punktlichtern
    b.zeichne(6, [2.4, 1.9, -1.6], [1.0, 1.0, 1.0], 20.0, 60.0, 0.0, SALAMI, 0.7, 0.0, 0);
    b.zeichne(2, [-1.2, 1.4, 2.2], [0.18, 0.18, 0.18], 0.0, 0.0, 0.0, ANANAS, 0.0, 1.0, 0);
    b.zeichne(2, [2.6, 0.8, -1.4], [0.18, 0.18, 0.18], 0.0, 0.0, 0.0, TOMATE, 0.0, 1.0, 0);
    // durchsichtig
    b.zeichne(2, [1.7, 0.7, 2.3], [1.4, 1.4, 1.4], 0.0, 0.0, 0.0, mit_alpha(WASSER, 110), 0.9, 0.0, 0);
    b.zeichne(1, [-0.9, 0.9, -0.9], [0.6, 1.8, 0.6], 45.0, 0.0, 0.0, mit_alpha(HIMMEL, 140), 0.6, 0.0, 0);
    // weit hinten im Nebel
    for k in 0..6 {
        b.zeichne(3, [-8.0 + k as f64 * 3.5, 1.0, -16.0], [0.8, 2.0, 0.8], 0.0, 0.0, 0.0, MOZZARELLA, 0.2, 0.0, 0);
    }
    // HUD
    b.rechteck(12.0, 12.0, 196.0, 58.0, mit_alpha(OFEN, 200), 0.0, 12.0);
    b.text("Herd 3D", 26.0, 18.0, 22.0, MOZZARELLA, 0);
    b.text("Sonne · Schatten · Nebel", 26.0, 46.0, 13.0, TEIG, 0);
    b.rechteck(540.0, 14.0, 86.0, 30.0, mit_alpha(MOZZARELLA, 230), 2.0, 15.0);
    b.text("1234 P", 583.0, 19.0, 16.0, OFEN, 1);
    b.bild(7, 600.0, 310.0, 2.0, WEISS);
    n.push(b.fertig());
    Szene { name: "drei-d", nachrichten: n }
}

/// Abendstimmung: tiefe Sonne, viele Punktlichter, Nebel.
pub fn abend() -> Szene {
    let mut n = Vec::new();
    formen(&mut n);
    n.push(Nachricht::fenster(640, 360, "Herd Abend"));
    let mut b = Bild::neu(99);
    b.himmel(AUBERGINE, SENF);
    b.kamera(0.0, 4.5, 9.0, 0.0, 0.3, 0.0, 55.0);
    b.sonne(-1.0, 0.35, -0.6, SENF, 0.7, true);
    b.umgebung(AUBERGINE, 0.5);
    b.nebel(mit_alpha(SALAMI, 255), 10.0, 26.0);
    let farben = [TOMATE, ANANAS, BASILIKUM, WASSER, SCHINKEN, SENF, HIMMEL, MOZZARELLA];
    for (k, f) in farben.iter().enumerate() {
        let w = k as f64 * core::f64::consts::PI * 2.0 / 8.0;
        let (x, z) = (3.2 * libm::cos(w), 3.2 * libm::sin(w));
        b.licht(x, 0.6, z, *f, 3.0);
        b.zeichne(2, [x, 0.6, z], [0.22, 0.22, 0.22], 0.0, 0.0, 0.0, *f, 0.0, 1.0, 0);
    }
    b.zeichne(5, [0.0, 0.0, 0.0], [30.0, 1.0, 30.0], 0.0, 0.0, 0.0, TEIG, 0.2, 0.0, 0);
    // Pizza in der Mitte: Teig-Zylinder mit Krustenring
    b.zeichne(3, [0.0, 0.08, 0.0], [3.0, 0.16, 3.0], 0.0, 0.0, 0.0, TOMATE, 0.4, 0.0, 0);
    b.zeichne(6, [0.0, 0.16, 0.0], [3.3, 2.2, 3.3], 0.0, 0.0, 0.0, KRUSTE, 0.3, 0.0, 0);
    for k in 0..7 {
        let w = k as f64 * 0.9;
        let r = if k == 0 { 0.0 } else { 0.9 };
        b.zeichne(3, [r * libm::cos(w), 0.19, r * libm::sin(w)], [0.4, 0.04, 0.4], 0.0, 0.0, 0.0, SALAMI, 0.5, 0.0, 0);
    }
    for k in 0..12 {
        let w = k as f64 * 0.52;
        b.zeichne(1, [6.0 * libm::cos(w), 0.5, 6.0 * libm::sin(w) - 2.0], [0.8, 1.0 + (k % 3) as f64 * 0.6, 0.8], k as f64 * 20.0, 0.0, 0.0, OFEN, 0.2, 0.0, 0);
    }
    b.text("Abend im Ofen", 320.0, 320.0, 28.0, MOZZARELLA, 1);
    n.push(b.fertig());
    Szene { name: "abend", nachrichten: n }
}

pub fn alle() -> Vec<Szene> {
    alloc::vec![zwei_d(), text(), drei_d(), abend()]
}
