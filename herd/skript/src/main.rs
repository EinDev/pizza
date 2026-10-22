//! herd-skript: spielt ein Szenen-Skript gegen den nativen Herd-Kern.
//!   herd-skript <datei.herd> [NAME=zahl …] [--nur-bilder]   – Zeilen wie `node herd/skript.js` (Determinismus-Test)
//!   herd-skript <datei.herd> [NAME=zahl …] --mess            – Zeiten je Takt und Bild (ohne Hashes), JSON

use std::time::Instant;

use herd_kern::Kern;
use herd_skript::{lies, Ausgabe, Spieler, Wert, Zeilen};

#[derive(Default)]
struct Messung {
    t0: Option<Instant>,
    takt: Vec<f64>,
    bild: Vec<f64>,
    bytes: u64,
    /// Takte seit dem letzten Bild (Kern-Zeit je Bild = Takte + Bild)
    offen: f64,
    je_bild: Vec<f64>,
}

impl Ausgabe for Messung {
    fn vor_takt(&mut self) {
        self.t0 = Some(Instant::now());
    }
    fn nach_takt(&mut self) {
        let d = self.t0.take().map(|t| t.elapsed().as_secs_f64() * 1e3).unwrap_or(0.0);
        self.takt.push(d);
        self.offen += d;
    }
    fn vor_bild(&mut self) {
        self.t0 = Some(Instant::now());
    }
    fn ruf(&mut self, _z: usize, name: &str, w: &Wert) {
        if name == "bild" {
            let d = self.t0.take().map(|t| t.elapsed().as_secs_f64() * 1e3).unwrap_or(0.0);
            self.bild.push(d);
            self.je_bild.push(self.offen + d);
            self.offen = 0.0;
            if let Wert::I(n) = w {
                self.bytes += *n as u64;
            }
        }
    }
    fn bild(&mut self, _k: &mut Kern, _nr: u32) {}
}

fn mittel(v: &[f64]) -> f64 {
    if v.is_empty() {
        0.0
    } else {
        v.iter().sum::<f64>() / v.len() as f64
    }
}
fn median(v: &[f64]) -> f64 {
    if v.is_empty() {
        return 0.0;
    }
    let mut s = v.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap());
    s[s.len() / 2]
}

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let Some(datei) = a.iter().find(|x| !x.starts_with("--") && !x.contains('=')) else {
        eprintln!("Aufruf: herd-skript <datei.herd> [NAME=zahl …] [--nur-bilder] [--mess]");
        std::process::exit(2);
    };
    let vorgaben: Vec<(String, f64)> = a
        .iter()
        .filter_map(|x| x.split_once('=').filter(|_| !x.starts_with("--")))
        .map(|(n, w)| (n.to_string(), w.parse::<f64>().unwrap_or_else(|_| panic!("Zahl in {}={}", n, w))))
        .collect();
    let text = std::fs::read_to_string(datei).unwrap_or_else(|e| panic!("{}: {}", datei, e));
    let skript = lies(&text).unwrap_or_else(|e| {
        eprintln!("{}: {}", datei, e);
        std::process::exit(2);
    });
    let mut sp = Spieler::neu(&vorgaben);
    if a.iter().any(|x| x == "--mess") {
        let mut m = Messung::default();
        let t = Instant::now();
        if let Err(e) = sp.spiele(&skript, &mut m) {
            eprintln!("{}", e);
            std::process::exit(1);
        }
        // --setter: Kosten eines Setters (teil_lage) direkt am Kern, ohne Skript-Auswertung – über alle Teile ab ID 3
        if a.iter().any(|x| x == "--setter") {
            let n = sp.kern.welt_hole(4) as i32;
            let runden = 60;
            let t = Instant::now();
            for r in 0..runden {
                for id in 3..n {
                    sp.kern.teil_lage(id, (id % 1280) as f64 + r as f64, (id % 720) as f64, 0.0);
                }
            }
            let ns = t.elapsed().as_secs_f64() * 1e9 / (runden as f64 * (n - 3).max(1) as f64);
            println!("{{\"setter_ns\":{:.1},\"aufrufe\":{}}}", ns, runden * (n - 3).max(0));
        }
        // erstes Bild (alle Ressourcen, Aufwärmen) nicht mitzählen
        let jb = if m.je_bild.len() > 1 { &m.je_bild[1..] } else { &m.je_bild[..] };
        println!(
            "{{\"datei\":{:?},\"takte\":{},\"bilder\":{},\"takt_ms\":{:.4},\"bild_ms\":{:.4},\"kern_je_bild_ms\":{:.4},\"kern_je_bild_median_ms\":{:.4},\"paket_bytes\":{},\"gesamt_s\":{:.3},\"teile\":{}}}",
            datei,
            m.takt.len(),
            m.bild.len(),
            mittel(&m.takt),
            mittel(if m.bild.len() > 1 { &m.bild[1..] } else { &m.bild }),
            mittel(jb),
            median(jb),
            if m.bild.is_empty() { 0 } else { m.bytes / m.bild.len() as u64 },
            t.elapsed().as_secs_f64(),
            sp.kern.welt_hole(5),
        );
        return;
    }
    let mut z = Zeilen { nur_bilder: a.iter().any(|x| x == "--nur-bilder"), ..Default::default() };
    let r = sp.spiele(&skript, &mut z);
    use std::io::Write;
    let mut o = std::io::BufWriter::new(std::io::stdout().lock());
    for l in &z.zeilen {
        let _ = writeln!(o, "{}", l);
    }
    if let Err(e) = r {
        let _ = writeln!(o, "FEHLER {}", e);
        let _ = o.flush();
        std::process::exit(1);
    }
}
