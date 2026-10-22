//! Erzeugt den SDF-Schriftatlas (`herd/kern/schrift/atlas.bin`, Format siehe `herd/kern/src/schrift.rs`).
//!
//! Verfahren: Glyphe hochaufgelöst (8×) nach der Nonzero-Regel rastern (überlappende Konturen variabler Schriften sind
//! damit kein Problem), exakte euklidische Abstandstransformation (Felzenszwalb) innen und außen, je Atlas-Texel
//! Mittelwert der vier mittleren Abtastungen. Kerning aus der GPOS-Funktion `kern` (Paar-Anpassung).

use std::collections::BTreeMap;

use ttf_parser::{Face, GlyphId, OutlineBuilder, Tag};

pub const SCHRIFT: &[u8] = include_bytes!("../schrift/Nunito[wght].ttf");
/// Gewicht der variablen Schrift (Nunito: 200 … 1000).
pub const GEWICHT: f32 = 700.0;
/// Atlas-Pixel je em und Abstandsspanne (Pixel bis zum Rand des Wertebereichs).
pub const EM: f32 = 42.0;
pub const SPANNE: f32 = 6.0;
const UEBER: usize = 8;
const ATLAS_BREITE: usize = 512;

/// Zeichenvorrat nach HERD.md §6.1.
pub fn zeichenvorrat() -> Vec<char> {
    let mut v: Vec<char> = (0x20u8..=0x7E).map(|b| b as char).collect();
    v.extend("ÄÖÜäöüß€°·–—„“‚‘…×÷".chars());
    // gängige Ergänzungen, die die Schrift hat (bequem für Spiele): ” ’ « » ± § ¿ ¡ © é è à ç ñ
    v.extend("”’«»±§©éèêàâçñ".chars());
    v.sort();
    v.dedup();
    v
}

#[derive(Default)]
struct Umriss {
    linien: Vec<[f32; 4]>,
    start: (f32, f32),
    pos: (f32, f32),
}

impl Umriss {
    fn linie(&mut self, x: f32, y: f32) {
        self.linien.push([self.pos.0, self.pos.1, x, y]);
        self.pos = (x, y);
    }
}

impl OutlineBuilder for Umriss {
    fn move_to(&mut self, x: f32, y: f32) {
        self.start = (x, y);
        self.pos = (x, y);
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.linie(x, y);
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        let (x0, y0) = self.pos;
        let n = 16;
        for k in 1..=n {
            let t = k as f32 / n as f32;
            let a = (1.0 - t) * (1.0 - t);
            let b = 2.0 * (1.0 - t) * t;
            let c = t * t;
            self.linie(a * x0 + b * x1 + c * x, a * y0 + b * y1 + c * y);
        }
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        let (x0, y0) = self.pos;
        let n = 24;
        for k in 1..=n {
            let t = k as f32 / n as f32;
            let u = 1.0 - t;
            let (a, b, c, d) = (u * u * u, 3.0 * u * u * t, 3.0 * u * t * t, t * t * t);
            self.linie(a * x0 + b * x1 + c * x2 + d * x, a * y0 + b * y1 + c * y2 + d * y);
        }
    }
    fn close(&mut self) {
        if self.pos != self.start {
            let (x, y) = self.start;
            self.linie(x, y);
        }
    }
}

/// 1D-Abstandstransformation (Felzenszwalb & Huttenlocher), quadratische Abstände.
fn edt_1d(f: &[f32], d: &mut [f32], v: &mut [usize], z: &mut [f32]) {
    let n = f.len();
    let mut k = 0usize;
    v[0] = 0;
    z[0] = f32::NEG_INFINITY;
    z[1] = f32::INFINITY;
    for q in 1..n {
        let mut s;
        loop {
            let p = v[k];
            s = ((f[q] + (q * q) as f32) - (f[p] + (p * p) as f32)) / (2.0 * q as f32 - 2.0 * p as f32);
            if s <= z[k] && k > 0 {
                k -= 1;
            } else {
                break;
            }
        }
        k += 1;
        v[k] = q;
        z[k] = s;
        z[k + 1] = f32::INFINITY;
    }
    k = 0;
    for q in 0..n {
        while z[k + 1] < q as f32 {
            k += 1;
        }
        let p = v[k];
        d[q] = (q as f32 - p as f32) * (q as f32 - p as f32) + f[p];
    }
}

/// Quadratischer Abstand jedes Pixels zum nächsten Pixel mit `ziel == true`.
fn edt(ziel: &[bool], b: usize, h: usize) -> Vec<f32> {
    const INF: f32 = 1e20;
    let mut g: Vec<f32> = ziel.iter().map(|&t| if t { 0.0 } else { INF }).collect();
    let n = b.max(h);
    let mut f = vec![0f32; n];
    let mut d = vec![0f32; n];
    let mut v = vec![0usize; n];
    let mut z = vec![0f32; n + 1];
    for x in 0..b {
        for y in 0..h {
            f[y] = g[y * b + x];
        }
        edt_1d(&f[..h], &mut d[..h], &mut v, &mut z);
        for y in 0..h {
            g[y * b + x] = d[y];
        }
    }
    for y in 0..h {
        f[..b].copy_from_slice(&g[y * b..y * b + b]);
        edt_1d(&f[..b], &mut d[..b], &mut v, &mut z);
        g[y * b..y * b + b].copy_from_slice(&d[..b]);
    }
    g
}

struct Glyphbild {
    zeichen: char,
    vorschub: f32,
    links: f32,
    oben: f32,
    b: usize,
    h: usize,
    werte: Vec<u8>,
}

fn rastere(face: &Face, c: char, s: f32) -> Option<Glyphbild> {
    let gid = face.glyph_index(c)?;
    let upem = face.units_per_em() as f32;
    let vorschub = face.glyph_hor_advance(gid).unwrap_or(0) as f32 / upem;
    let mut u = Umriss::default();
    let bbox = face.outline_glyph(gid, &mut u);
    let Some(bb) = bbox else {
        return Some(Glyphbild { zeichen: c, vorschub, links: 0.0, oben: 0.0, b: 0, h: 0, werte: Vec::new() });
    };
    let pad = SPANNE + 1.0;
    let x0 = (bb.x_min as f32 * s - pad).floor();
    let x1 = (bb.x_max as f32 * s + pad).ceil();
    let y0 = (bb.y_min as f32 * s - pad).floor();
    let y1 = (bb.y_max as f32 * s + pad).ceil();
    let (b, h) = ((x1 - x0) as usize, (y1 - y0) as usize);
    let (bh, hh) = (b * UEBER, h * UEBER);
    // Linien in Hochauflösungs-Pixel (y nach unten)
    let k = s * UEBER as f32;
    let lin: Vec<[f32; 4]> = u
        .linien
        .iter()
        .map(|l| [l[0] * k - x0 * UEBER as f32, y1 * UEBER as f32 - l[1] * k, l[2] * k - x0 * UEBER as f32, y1 * UEBER as f32 - l[3] * k])
        .collect();
    let mut innen = vec![false; bh * hh];
    let mut kreuzungen: Vec<(f32, i32)> = Vec::new();
    for y in 0..hh {
        let py = y as f32 + 0.5;
        kreuzungen.clear();
        for l in &lin {
            let (ya, yb) = (l[1], l[3]);
            if (ya <= py && yb > py) || (yb <= py && ya > py) {
                let t = (py - ya) / (yb - ya);
                let x = l[0] + t * (l[2] - l[0]);
                kreuzungen.push((x, if yb > ya { 1 } else { -1 }));
            }
        }
        kreuzungen.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        let mut w = 0;
        for i in 0..kreuzungen.len() {
            w += kreuzungen[i].1;
            if w != 0 && i + 1 < kreuzungen.len() {
                let xa = (kreuzungen[i].0 - 0.5).ceil().max(0.0) as usize;
                let xb = ((kreuzungen[i + 1].0 - 0.5).ceil().max(0.0) as usize).min(bh);
                for x in xa..xb {
                    innen[y * bh + x] = true;
                }
            }
        }
    }
    let aussen: Vec<bool> = innen.iter().map(|&t| !t).collect();
    let bis_innen = edt(&innen, bh, hh);
    let bis_aussen = edt(&aussen, bh, hh);
    let abstand = |i: usize| -> f32 {
        if innen[i] {
            (bis_aussen[i].sqrt() - 0.5) / UEBER as f32
        } else {
            -(bis_innen[i].sqrt() - 0.5) / UEBER as f32
        }
    };
    let mut werte = vec![0u8; b * h];
    let m = UEBER / 2;
    for ty in 0..h {
        for tx in 0..b {
            let mut summe = 0.0;
            for (dy, dx) in [(m - 1, m - 1), (m - 1, m), (m, m - 1), (m, m)] {
                summe += abstand((ty * UEBER + dy) * bh + tx * UEBER + dx);
            }
            let d = summe / 4.0;
            let v = (0.5 + d / (2.0 * SPANNE)).clamp(0.0, 1.0);
            werte[ty * b + tx] = (v * 255.0).round() as u8;
        }
    }
    Some(Glyphbild { zeichen: c, vorschub, links: x0 / EM, oben: y1 / EM, b, h, werte })
}

fn kerning(face: &Face, zeichen: &[char]) -> BTreeMap<(u32, u32), f32> {
    use ttf_parser::gpos::{PairAdjustment, PositioningSubtable};
    let mut aus = BTreeMap::new();
    let Some(gpos) = face.tables().gpos else { return aus };
    let upem = face.units_per_em() as f32;
    let glyphen: Vec<(char, GlyphId)> = zeichen.iter().filter_map(|&c| face.glyph_index(c).map(|g| (c, g))).collect();
    let mut lookups: Vec<u16> = Vec::new();
    for f in gpos.features {
        if f.tag == Tag::from_bytes(b"kern") {
            for i in f.lookup_indices {
                if !lookups.contains(&i) {
                    lookups.push(i);
                }
            }
        }
    }
    lookups.sort();
    for li in lookups {
        let Some(lookup) = gpos.lookups.get(li) else { continue };
        for si in 0..lookup.subtables.len() {
            let Some(PositioningSubtable::Pair(pa)) = lookup.subtables.get::<PositioningSubtable>(si) else { continue };
            for &(ca, ga) in &glyphen {
                for &(cb, gb) in &glyphen {
                    let key = (ca as u32, cb as u32);
                    if aus.contains_key(&key) {
                        continue;
                    }
                    let wert = match &pa {
                        PairAdjustment::Format1 { coverage, sets } => coverage
                            .get(ga)
                            .and_then(|i| sets.get(i))
                            .and_then(|set| set.get(gb))
                            .map(|(a, _)| a.x_advance),
                        PairAdjustment::Format2 { coverage, classes, matrix } => {
                            if coverage.get(ga).is_some() {
                                matrix.get((classes.0.get(ga), classes.1.get(gb))).map(|(a, _)| a.x_advance)
                            } else {
                                None
                            }
                        }
                    };
                    if let Some(w) = wert {
                        if w != 0 {
                            aus.insert(key, w as f32 / upem);
                        }
                    }
                }
            }
        }
    }
    aus
}

/// Baut den Atlas und gibt die Bytes zurück.
pub fn baue() -> Vec<u8> {
    let mut face = Face::parse(SCHRIFT, 0).expect("Schrift lesbar");
    face.set_variation(Tag::from_bytes(b"wght"), GEWICHT);
    let upem = face.units_per_em() as f32;
    let s = EM / upem;
    let zeichen = zeichenvorrat();
    let glyphen: Vec<Glyphbild> = zeichen.iter().filter_map(|&c| rastere(&face, c, s)).collect();
    // Packen: Regale, nach Höhe absteigend (stabil nach Zeichen)
    let mut reihe: Vec<usize> = (0..glyphen.len()).collect();
    reihe.sort_by(|&a, &b| glyphen[b].h.cmp(&glyphen[a].h).then(glyphen[a].zeichen.cmp(&glyphen[b].zeichen)));
    let mut pos = vec![(0usize, 0usize); glyphen.len()];
    let (mut x, mut y, mut regal) = (1usize, 1usize, 0usize);
    for &i in &reihe {
        let g = &glyphen[i];
        if g.b == 0 {
            continue;
        }
        if x + g.b + 1 > ATLAS_BREITE {
            x = 1;
            y += regal + 1;
            regal = 0;
        }
        pos[i] = (x, y);
        x += g.b + 1;
        regal = regal.max(g.h);
    }
    let hoehe = y + regal + 1;
    let mut pixel = vec![0u8; ATLAS_BREITE * hoehe];
    for (i, g) in glyphen.iter().enumerate() {
        let (px, py) = pos[i];
        for yy in 0..g.h {
            pixel[(py + yy) * ATLAS_BREITE + px..(py + yy) * ATLAS_BREITE + px + g.b].copy_from_slice(&g.werte[yy * g.b..yy * g.b + g.b]);
        }
    }
    let kern = kerning(&face, &zeichen);

    let mut a = Vec::new();
    a.extend_from_slice(b"HZS1");
    a.extend_from_slice(&(ATLAS_BREITE as u16).to_le_bytes());
    a.extend_from_slice(&(hoehe as u16).to_le_bytes());
    for v in [EM, SPANNE, face.ascender() as f32 / upem, face.descender() as f32 / upem, face.line_gap() as f32 / upem] {
        a.extend_from_slice(&v.to_le_bytes());
    }
    a.extend_from_slice(&(glyphen.len() as u32).to_le_bytes());
    for (i, g) in glyphen.iter().enumerate() {
        let (px, py) = pos[i];
        a.extend_from_slice(&(g.zeichen as u32).to_le_bytes());
        for v in [g.vorschub, g.links, g.oben] {
            a.extend_from_slice(&v.to_le_bytes());
        }
        for v in [px as u16, py as u16, g.b as u16, g.h as u16] {
            a.extend_from_slice(&v.to_le_bytes());
        }
    }
    a.extend_from_slice(&(kern.len() as u32).to_le_bytes());
    for ((x, y), w) in &kern {
        a.extend_from_slice(&x.to_le_bytes());
        a.extend_from_slice(&y.to_le_bytes());
        a.extend_from_slice(&w.to_le_bytes());
    }
    a.extend_from_slice(&pixel);
    eprintln!(
        "Atlas: {} Glyphen, {} Unterschneidungspaare, {}×{} Pixel, {} Bytes",
        glyphen.len(),
        kern.len(),
        ATLAS_BREITE,
        hoehe,
        a.len()
    );
    a
}
