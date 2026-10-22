//! herd-bild: Werkzeuge rund um den Herd-Kern.
//!   herd-bild atlas                 – Schriftatlas neu erzeugen (herd/kern/schrift/atlas.bin)
//!   herd-bild glsl <datei.js>       – GLSL-ES-3.0-Fassung der Shader (naga) schreiben
//!   herd-bild demo <ordner> [BxH] [--gpu] – Demo-Szenen als PNG rendern (Software-Adapter bevorzugt) und Zeiten messen
//!   herd-bild bild <nachrichten.bin> <ordner> [BxH] – letztes Bild einer Nachrichten-Datei (je u32-LE-Länge + Bytes) als PNG

mod atlas;
mod glsl;

use std::path::Path;
use std::time::Instant;

use herd_gpu::{HerdGpu, Optionen};
use herd_kern::Kern;

fn schreibe_png(pfad: &Path, b: u32, h: u32, rgba: &[u8]) {
    let f = std::fs::File::create(pfad).expect("PNG-Datei");
    let mut e = png::Encoder::new(std::io::BufWriter::new(f), b, h);
    e.set_color(png::ColorType::Rgba);
    e.set_depth(png::BitDepth::Eight);
    e.write_header().unwrap().write_image_data(rgba).unwrap();
}

fn groesse(a: Option<&String>) -> (u32, u32) {
    a.and_then(|s| s.split_once('x')).and_then(|(b, h)| Some((b.parse().ok()?, h.parse().ok()?))).unwrap_or((640, 360))
}

fn rendere(gpu: &mut HerdGpu, name: &str, nachrichten: &[&[u8]], ordner: &Path, (b, h): (u32, u32)) {
    let mut k = Kern::neu();
    for n in nachrichten {
        if let Err(e) = k.nachricht(n) {
            eprintln!("{}: Nachricht abgelehnt: {:?}", name, e);
        }
    }
    let t0 = Instant::now();
    k.bereite(b, h);
    let t_kern = t0.elapsed();
    let _ = gpu.bild(&k).expect("Bild"); // warm (Pipelines, Hochladen)
    let n = 10;
    let t1 = Instant::now();
    let mut rgba = Vec::new();
    for _ in 0..n {
        k.bereite(b, h);
        rgba = gpu.bild(&k).expect("Bild");
    }
    let t_ges = t1.elapsed() / n;
    schreibe_png(&ordner.join(format!("{}.png", name)), b, h, &rgba);
    println!("{:<8} {}×{}  Kern {:>7.3} ms  Kern+GPU+Auslesen {:>7.3} ms  fnv {:016x}", name, b, h, t_kern.as_secs_f64() * 1e3, t_ges.as_secs_f64() * 1e3, k.fnv());
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    match a.get(1).map(|s| s.as_str()) {
        Some("atlas") => {
            let ziel = Path::new(env!("CARGO_MANIFEST_DIR")).join("../kern/schrift/atlas.bin");
            std::fs::write(&ziel, atlas::baue()).expect("Atlas schreiben");
        }
        Some("glsl") => {
            let js = glsl::erzeuge().unwrap_or_else(|e| panic!("{}", e));
            std::fs::write(a.get(2).expect("Zieldatei"), js).expect("schreiben");
        }
        Some("demo") => {
            let ordner = Path::new(a.get(2).expect("Ordner"));
            std::fs::create_dir_all(ordner).unwrap();
            let gpu_echt = a.iter().any(|x| x == "--gpu");
            let mut gpu = HerdGpu::neu(&Optionen { software_bevorzugen: !gpu_echt, ..Default::default() }).unwrap_or_else(|e| panic!("{}", e));
            let i = gpu.adapter_info();
            println!("Adapter: {} ({:?}, {:?})", i.name, i.backend, i.device_type);
            for s in herd_kern::demo::alle() {
                let n: Vec<&[u8]> = s.nachrichten.iter().map(|v| v.as_slice()).collect();
                rendere(&mut gpu, s.name, &n, ordner, groesse(a.get(3).filter(|x| !x.starts_with("--"))));
            }
        }
        Some("bild") => {
            let d = std::fs::read(a.get(2).expect("Datei")).expect("lesen");
            let n = herd_kern::kodierer::datei_lesen(&d).expect("Nachrichten-Datei abgeschnitten");
            let ordner = Path::new(a.get(3).expect("Ordner"));
            std::fs::create_dir_all(ordner).unwrap();
            let mut gpu = HerdGpu::neu(&Optionen { software_bevorzugen: true, ..Default::default() }).unwrap_or_else(|e| panic!("{}", e));
            rendere(&mut gpu, "bild", &n, ordner, groesse(a.get(4)));
        }
        _ => eprintln!("Aufruf: herd-bild atlas | glsl <datei.js> | demo <ordner> [BxH] [--gpu] | bild <datei> <ordner> [BxH]"),
    }
}
