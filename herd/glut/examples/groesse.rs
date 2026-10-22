//! Kleinstes Programm mit Kern + Glut (für die Größenmessung, `cargo build --profile klein -p herd-glut --example groesse`):
//! eine Szene anlegen, ein Bild offscreen auf dem Software-Adapter zeichnen und ein Pixel ausgeben.
use herd_glut::{Glut, Optionen, Ziel};
use herd_kern::Kern;

fn main() {
    let mut k = Kern::neu();
    k.welt_neu(320.0, 180.0, b"Groesse");
    let w = k.form_grund(1, 0.0, 0.0);
    let t = k.teil_neu(3);
    let koerper = k.typ_nummer(b"Koerper");
    let c = k.komp_neu(koerper);
    k.setze_zahl(c, 1, w as f64);
    k.komp_haenge(c, t);
    k.bild(1);
    match Glut::neu(Ziel::Offscreen { breite: 320, hoehe: 180 }, &Optionen::default()) {
        Ok(mut g) => {
            g.bild(k.paket()).expect("Bild");
            let px = g.lies_pixel().expect("Pixel");
            println!("Mitte: {:?}", &px[(90 * 320 + 160) * 4..(90 * 320 + 160) * 4 + 4]);
        }
        Err(e) => eprintln!("{}", e),
    }
}
