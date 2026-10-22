//! herd-bild: Werkzeuge rund um Kern und Glut. Rendert **nur offscreen** und standardmäßig mit dem **Software-Adapter**
//! (WARP/lavapipe); die echte GPU nur mit `--gpu` bzw. `HERD_GPU=1` (vom Nutzer selbst zu starten). `HERD_SOFTWARE=1`
//! erzwingt immer Software.
//!
//!   herd-bild bild <skript.herd> <ordner> [--bilder=1,60] [--groesse=1280x720] [--ohne-instancing] [--msaa=1] [--gpu] [VAR=zahl …]
//!       spielt das Skript (herd/README.md §7.1) und schreibt die gewählten Bilder (Standard: das letzte) als PNG
//!   herd-bild bench <skript.herd> [--groesse=640x360] [--ohne-instancing] [--gpu] [VAR=zahl …]
//!       Glut-Zeit je Bild (Hochladen + Zeichnen + Warten, ohne Auslesen), Draw-Calls, Instanzen – JSON
//!   herd-bild referenz [ordner]      – Referenzbilder tests/herd/bilder/*.herd → *.png neu schreiben
//!   herd-bild atlas                  – Schriftatlas neu erzeugen (herd/kern/schrift/atlas.bin)

mod atlas;

use std::path::{Path, PathBuf};
use std::time::Instant;

use herd_glut::{Adapter, Glut, Optionen, Statistik, Ziel};
use herd_kern::Kern;
use herd_skript::{lies, Ausgabe, Spieler};

pub fn schreibe_png(pfad: &Path, b: u32, h: u32, rgba: &[u8]) {
    let f = std::fs::File::create(pfad).unwrap_or_else(|e| panic!("{}: {}", pfad.display(), e));
    let mut e = png::Encoder::new(std::io::BufWriter::new(f), b, h);
    e.set_color(png::ColorType::Rgba);
    e.set_depth(png::BitDepth::Eight);
    e.write_header().unwrap().write_image_data(rgba).unwrap();
}

pub fn lies_png(pfad: &Path) -> Option<(u32, u32, Vec<u8>)> {
    let d = png::Decoder::new(std::io::BufReader::new(std::fs::File::open(pfad).ok()?));
    let mut r = d.read_info().ok()?;
    let mut buf = vec![0u8; r.output_buffer_size()?];
    let info = r.next_frame(&mut buf).ok()?;
    if info.color_type != png::ColorType::Rgba || info.bit_depth != png::BitDepth::Eight {
        return None;
    }
    buf.truncate(info.buffer_size());
    Some((info.width, info.height, buf))
}

/// Aufrufoptionen (gemeinsam für `bild`, `bench`, `referenz`).
#[derive(Clone, Debug)]
pub struct Aufruf {
    pub bilder: Option<Vec<u32>>,
    pub groesse: (u32, u32),
    pub glut: Optionen,
    pub vorgaben: Vec<(String, f64)>,
}

impl Aufruf {
    fn aus(a: &[String], standard: (u32, u32)) -> Aufruf {
        let wert = |name: &str| a.iter().find_map(|x| x.strip_prefix(&format!("--{}=", name)).map(|s| s.to_string()));
        let gpu = a.iter().any(|x| x == "--gpu") || std::env::var("HERD_GPU").map(|v| v == "1").unwrap_or(false);
        let groesse = wert("groesse").and_then(|s| s.split_once('x').and_then(|(b, h)| Some((b.parse().ok()?, h.parse().ok()?)))).unwrap_or(standard);
        Aufruf {
            bilder: wert("bilder").map(|s| s.split(',').filter_map(|x| x.parse().ok()).collect()),
            groesse,
            glut: Optionen {
                adapter: if gpu { Adapter::Gpu } else { Adapter::Software },
                msaa: wert("msaa").and_then(|s| s.parse().ok()).unwrap_or(herd_glut::MSAA_STANDARD),
                instancing: !a.iter().any(|x| x == "--ohne-instancing"),
                vsync: false,
            },
            vorgaben: a
                .iter()
                .filter(|x| !x.starts_with("--"))
                .filter_map(|x| x.split_once('='))
                .filter_map(|(n, w)| Some((n.to_string(), w.parse::<f64>().ok()?)))
                .collect(),
        }
    }
}

/// Kopfzeile eines Referenz-Skripts: `#! bild 30 groesse 1280x720` (welches Bild, welche Größe).
pub fn kopf(text: &str) -> (Option<u32>, Option<(u32, u32)>) {
    let mut bild = None;
    let mut groesse = None;
    for z in text.lines().filter_map(|z| z.strip_prefix("#!")) {
        let w: Vec<&str> = z.split_whitespace().collect();
        for p in w.windows(2) {
            match p[0] {
                "bild" => bild = p[1].parse().ok(),
                "groesse" => groesse = p[1].split_once('x').and_then(|(b, h)| Some((b.parse().ok()?, h.parse().ok()?))),
                _ => {}
            }
        }
    }
    (bild, groesse)
}

/// Rendert die gewählten Bilder eines Skripts. Nicht gewählte Bilder werden nicht gezeichnet; danach `paket_voll`,
/// damit das nächste gezeichnete Paket alle Ressourcen enthält.
struct Renderer<'a> {
    glut: &'a mut Glut,
    bilder: Option<&'a [u32]>,
    letztes: Option<(u32, Vec<u8>)>,
    ergebnisse: Vec<(u32, Vec<u8>)>,
    fehler: Option<String>,
}

impl Ausgabe for Renderer<'_> {
    fn bild(&mut self, kern: &mut Kern, nr: u32) {
        match self.bilder {
            Some(l) if !l.contains(&nr) => {
                kern.paket_voll();
            }
            _ => {
                let r = self.glut.bild(kern.paket()).and_then(|_| self.glut.lies_pixel());
                match r {
                    Ok(px) => {
                        if self.bilder.is_some() {
                            self.ergebnisse.push((nr, px));
                        } else {
                            self.letztes = Some((nr, px));
                        }
                    }
                    Err(e) => self.fehler = Some(e.to_string()),
                }
            }
        }
    }
}

/// Spielt ein Skript und liefert die gerenderten Bilder (Nummer, RGBA). Ohne Auswahl: nur das letzte.
pub fn rendere(glut: &mut Glut, text: &str, auf: &Aufruf) -> Result<Vec<(u32, Vec<u8>)>, String> {
    let skript = lies(text)?;
    let mut sp = Spieler::neu(&auf.vorgaben);
    // ohne Auswahl wird jedes Bild gezeichnet (das letzte bleibt) – dafür hier nur das letzte behalten
    let mut r = Renderer { glut, bilder: auf.bilder.as_deref(), letztes: None, ergebnisse: Vec::new(), fehler: None };
    sp.spiele(&skript, &mut r)?;
    if let Some(f) = r.fehler {
        return Err(f);
    }
    let mut aus = r.ergebnisse;
    if let Some(l) = r.letztes {
        aus.push(l);
    }
    Ok(aus)
}

pub fn neue_glut(auf: &Aufruf) -> Result<Glut, herd_glut::Fehler> {
    Glut::neu(Ziel::Offscreen { breite: auf.groesse.0, hoehe: auf.groesse.1 }, &auf.glut)
}

/// Glut-Messung: jedes Bild hochladen + zeichnen + auf die GPU warten (ohne Auslesen).
struct Bank<'a> {
    glut: &'a mut Glut,
    zeiten: Vec<f64>,
    stat: Statistik,
    fehler: Option<String>,
}

impl Ausgabe for Bank<'_> {
    fn bild(&mut self, kern: &mut Kern, _nr: u32) {
        let t = Instant::now();
        match self.glut.bild(kern.paket()).and_then(|s| self.glut.warte().map(|_| s)) {
            Ok(s) => {
                self.zeiten.push(t.elapsed().as_secs_f64() * 1e3);
                self.stat = s;
            }
            Err(e) => self.fehler = Some(e.to_string()),
        }
    }
}

fn mittel(v: &[f64]) -> f64 {
    if v.is_empty() {
        0.0
    } else {
        v.iter().sum::<f64>() / v.len() as f64
    }
}

fn adapter_zeile(g: &Glut) -> String {
    let i = g.adapter_info();
    format!("{} ({:?}, {:?}), MSAA {}×", i.name, i.backend, i.device_type, g.msaa())
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let rest: Vec<String> = a.iter().skip(2).cloned().collect();
    match a.get(1).map(|s| s.as_str()) {
        Some("atlas") => {
            let ziel = Path::new(env!("CARGO_MANIFEST_DIR")).join("../kern/schrift/atlas.bin");
            std::fs::write(&ziel, atlas::baue()).expect("Atlas schreiben");
        }
        Some("bild") => {
            let pos: Vec<&String> = rest.iter().filter(|x| !x.starts_with("--") && !x.contains('=')).collect();
            let (Some(skript), Some(ordner)) = (pos.first(), pos.get(1)) else {
                eprintln!("Aufruf: herd-bild bild <skript.herd> <ordner> [--bilder=…] [--groesse=BxH] [--ohne-instancing] [--gpu]");
                std::process::exit(2);
            };
            let text = std::fs::read_to_string(skript).unwrap_or_else(|e| panic!("{}: {}", skript, e));
            let (kb, kg) = kopf(&text);
            let mut auf = Aufruf::aus(&rest, kg.unwrap_or((1280, 720)));
            if auf.bilder.is_none() {
                auf.bilder = kb.map(|b| vec![b]);
            }
            let mut glut = neue_glut(&auf).unwrap_or_else(|e| {
                eprintln!("{}", e);
                std::process::exit(2);
            });
            eprintln!("Adapter: {}", adapter_zeile(&glut));
            std::fs::create_dir_all(ordner).unwrap();
            let name = Path::new(skript).file_stem().unwrap().to_string_lossy().to_string();
            let t = Instant::now();
            let bilder = rendere(&mut glut, &text, &auf).unwrap_or_else(|e| {
                eprintln!("{}", e);
                std::process::exit(1);
            });
            for (nr, px) in &bilder {
                let p = PathBuf::from(ordner).join(format!("{}-{}.png", name, nr));
                schreibe_png(&p, auf.groesse.0, auf.groesse.1, px);
                println!("{}", p.display());
            }
            let s = glut.statistik();
            eprintln!("{:.2} s; letztes Bild: {} Draw-Calls ({} Schatten), {} 2D-/{} 3D-Instanzen, {} Dreiecke", t.elapsed().as_secs_f64(), s.draw_calls, s.schatten_draw_calls, s.instanzen_2d, s.instanzen_3d, s.dreiecke);
        }
        Some("bench") => {
            let Some(skript) = rest.iter().find(|x| !x.starts_with("--") && !x.contains('=')) else {
                eprintln!("Aufruf: herd-bild bench <skript.herd> [--groesse=BxH] [--ohne-instancing] [--gpu] [VAR=zahl]");
                std::process::exit(2);
            };
            let auf = Aufruf::aus(&rest, (640, 360));
            let text = std::fs::read_to_string(skript).unwrap_or_else(|e| panic!("{}: {}", skript, e));
            let mut glut = neue_glut(&auf).unwrap_or_else(|e| {
                eprintln!("{}", e);
                std::process::exit(2);
            });
            let adapter = adapter_zeile(&glut);
            let skript_l = lies(&text).unwrap_or_else(|e| panic!("{}", e));
            let mut sp = Spieler::neu(&auf.vorgaben);
            let mut b = Bank { glut: &mut glut, zeiten: Vec::new(), stat: Statistik::default(), fehler: None };
            let t = Instant::now();
            sp.spiele(&skript_l, &mut b).unwrap_or_else(|e| panic!("{}", e));
            if let Some(f) = b.fehler {
                eprintln!("{}", f);
                std::process::exit(1);
            }
            // erstes Bild (Pipelines, Ressourcen) getrennt
            let erstes = b.zeiten.first().copied().unwrap_or(0.0);
            let rest_z = if b.zeiten.len() > 1 { &b.zeiten[1..] } else { &b.zeiten[..] };
            let mut sortiert = rest_z.to_vec();
            sortiert.sort_by(|x, y| x.partial_cmp(y).unwrap());
            let median = sortiert.get(sortiert.len() / 2).copied().unwrap_or(0.0);
            let s = b.stat;
            println!(
                "{{\"skript\":{:?},\"adapter\":{:?},\"groesse\":\"{}x{}\",\"instancing\":{},\"bilder\":{},\"erstes_ms\":{:.2},\"glut_ms\":{:.3},\"glut_median_ms\":{:.3},\"draw_calls\":{},\"schatten_draw_calls\":{},\"inst2d\":{},\"inst3d\":{},\"dreiecke\":{},\"gesamt_s\":{:.2}}}",
                skript,
                adapter,
                auf.groesse.0,
                auf.groesse.1,
                auf.glut.instancing,
                b.zeiten.len(),
                erstes,
                mittel(rest_z),
                median,
                s.draw_calls,
                s.schatten_draw_calls,
                s.instanzen_2d,
                s.instanzen_3d,
                s.dreiecke,
                t.elapsed().as_secs_f64()
            );
        }
        Some("referenz") => {
            let ordner = rest.iter().find(|x| !x.starts_with("--")).map(PathBuf::from).unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/herd/bilder"));
            let auf0 = Aufruf::aus(&rest, (1280, 720));
            for e in std::fs::read_dir(&ordner).unwrap() {
                let p = e.unwrap().path();
                if p.extension().map(|x| x != "herd").unwrap_or(true) {
                    continue;
                }
                let text = std::fs::read_to_string(&p).unwrap();
                let (kb, kg) = kopf(&text);
                let auf = Aufruf { bilder: kb.map(|b| vec![b]), groesse: kg.unwrap_or((1280, 720)), ..auf0.clone() };
                let mut glut = neue_glut(&auf).unwrap_or_else(|e| panic!("{}", e));
                let bilder = rendere(&mut glut, &text, &auf).unwrap_or_else(|e| panic!("{}: {}", p.display(), e));
                let (_, px) = bilder.last().expect("kein Bild");
                let ziel = p.with_extension("png");
                schreibe_png(&ziel, auf.groesse.0, auf.groesse.1, px);
                println!("{}", ziel.display());
            }
        }
        _ => {
            eprintln!("Aufruf: herd-bild bild <skript> <ordner> [Optionen] | bench <skript> [Optionen] | referenz [ordner] | atlas");
            std::process::exit(2);
        }
    }
}

#[cfg(test)]
mod tests;
