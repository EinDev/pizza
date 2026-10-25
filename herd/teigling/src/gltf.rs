//! glTF-2.0-Leser des Vorbackers (H-K16, HERD.md §13.3): `.glb` und `.gltf` (Puffer/Bilder eingebettet, als `data:`-URI oder
//! als Datei im Quellpaket) → [`Modell`] (Zwischenform, daraus schreibt `modell.rs` den Modellteig).
//!
//! **Untermenge** (Entscheidung): Dreiecke (Streifen/Fächer → Liste, ohne Indizes → Indizes), `POSITION`, `NORMAL`,
//! `TEXCOORD_0`, `COLOR_0`, `JOINTS_0`/`WEIGHTS_0`, `KHR_mesh_quantization`, Sparse-Accessoren, `KHR_lights_punctual`,
//! `KHR_materials_emissive_strength`, Häute, Animationen (Lage/Drehung/Größe; `CUBICSPLINE` → nur die Stützwerte).
//! Nicht: Draco, meshopt, KTX2/Basis, Morph-Ziele, `TEXCOORD_1`, Kameras, mehrere Szenen. Pflicht-Erweiterungen außerhalb der
//! Untermenge → Fehler; benutzte, nicht verlangte werden still übergangen.
//!
//! **Sicherheit:** Die Quelle ist nicht vertrauenswürdig. Jede Länge, jeder Index und jede Größe wird mit geprüfter Arithmetik
//! gegen die Puffer und die Grenzen ([`GRENZEN`]) geprüft, bevor etwas angelegt wird; es gibt keine Panik-Pfade (Fuzz-Tests in
//! `tests.rs`). **Determinismus:** f32-Werte werden kopiert; gerechnet wird nur mit + − × ÷ (IEEE, feste Reihenfolge), Farben
//! linear → sRGB über eine feste Tabelle (`srgb.rs`).

use alloc::string::{String, ToString};
use alloc::vec;
use alloc::vec::Vec;

use crate::json::{self, Dok, W};
use crate::{jpeg, png, Bild};

/// Grenzen je Modell (HERD.md §13.3 H-K16).
pub mod grenze {
    /// Quellpaket (Hauptdatei + alle benutzten Dateien) in Bytes
    pub const QUELLE: usize = 32 * 1024 * 1024;
    pub const ECKEN: u64 = 500_000;
    pub const DREIECKE: u64 = 1_000_000;
    pub const KNOTEN: u64 = 1_024;
    pub const MATERIALIEN: u64 = 64;
    pub const BILDER: u64 = 32;
    pub const HAEUTE: u64 = 4;
    pub const GELENKE: u64 = 256;
    pub const FOLGEN: u64 = 64;
    /// Elemente eines Accessors (Schutz vor riesigen Sparse-Accessoren ohne Puffer)
    pub const ACCESSOR: u64 = 1 << 24;
    /// Stützstellen aller Folgen zusammen
    pub const STUETZEN: u64 = 1 << 22;
}

/// Unterstützte Erweiterungen (dürfen in `extensionsRequired` stehen).
pub const ERWEITERUNGEN: &[&str] = &["KHR_mesh_quantization", "KHR_lights_punctual", "KHR_materials_emissive_strength"];

/// Warum eine Quelle kein Modell wird (Text: `modell.rs`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MFehler {
    KeinModell,
    Erweiterung(String),
    /// (Wert, Grenze, Einheit im Plural, z. B. "Ecken")
    ZuGross(u64, u64, &'static str),
    /// Bild Nummer (1 …) im Modell
    Bild(u32, crate::Fehler),
    /// URI einer fehlenden Datei
    DateiFehlt(String),
}

type Erg<T> = Result<T, MFehler>;

fn kein<T>() -> Erg<T> {
    Err(MFehler::KeinModell)
}

/// Eine Netz-Primitive (Dreiecksliste).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Prim {
    /// x, y, z je Ecke
    pub pos: Vec<f32>,
    /// x, y, z je Ecke; `None` = Normalen fehlen (der Kern rechnet glatte)
    pub nor: Option<Vec<f32>>,
    /// u, v je Ecke (glTF: (0, 0) = oben links)
    pub uv: Vec<f32>,
    pub idx: Vec<u32>,
    /// Material im Modell (`None` = ohne)
    pub material: Option<u32>,
    /// Haut: je Ecke 4 × Gelenk und 4 × Gewicht (Summe 65 535)
    pub gelenke: Option<Vec<u16>>,
    pub gewichte: Option<Vec<u16>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Material {
    pub name: String,
    /// `baseColorFactor` (linear)
    pub farbe: [f32; 4],
    pub metall: f32,
    pub rauheit: f32,
    /// `emissiveFactor` (linear)
    pub leucht: [f32; 3],
    /// `KHR_materials_emissive_strength`
    pub leucht_staerke: f32,
    pub normal_staerke: f32,
    pub schwelle: f32,
    /// 0 OPAQUE, 1 MASK, 2 BLEND
    pub alpha: u8,
    pub beidseitig: bool,
    /// Bild wiederholen (Sampler REPEAT und UV außerhalb 0 … 1)
    pub wiederholen: bool,
    /// Bild-Indizes im Modell: Grundfarbe (bzw. Paletten-Bild), Relief (Normale x, y + Rauheit), Stoff (Verdeckung, Rauheit,
    /// Metall), Leuchten
    pub bild_farbe: Option<u32>,
    pub bild_relief: Option<u32>,
    pub bild_stoff: Option<u32>,
    pub bild_leucht: Option<u32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Knoten {
    pub name: String,
    pub eltern: Option<u32>,
    pub mesh: Option<u32>,
    pub licht: Option<u32>,
    pub haut: Option<u32>,
    /// `true`: `werte` = Matrix (16, spaltenweise); sonst Lage (3), Drehung (Quaternion x, y, z, w), Größe (3)
    pub matrix: bool,
    pub werte: [f32; 16],
}

#[derive(Clone, Debug, PartialEq)]
pub struct Licht {
    pub name: String,
    /// 0 Punkt, 1 Spot, 2 Richtung
    pub art: u8,
    pub farbe: [f32; 3],
    pub staerke: f32,
    /// 0 = unbegrenzt
    pub reichweite: f32,
    pub innen: f32,
    pub aussen: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Haut {
    /// Knoten-Indizes (Modell-Reihenfolge)
    pub gelenke: Vec<u32>,
    pub skelett: Option<u32>,
    /// 16 je Gelenk, spaltenweise
    pub ibm: Vec<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Kanal {
    pub knoten: u32,
    /// 0 Lage, 1 Drehung, 2 Größe
    pub pfad: u8,
    /// 0 linear, 1 Stufe
    pub art: u8,
    pub zeiten: Vec<f32>,
    /// 3 bzw. 4 je Zeit
    pub werte: Vec<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Folge {
    pub name: String,
    pub kanaele: Vec<Kanal>,
}

/// Ein Bild im Modell: dekodiert (RGBA8) und woher (SHA-256 der Quelle, für den Teigling-Kopf).
#[derive(Clone, Debug, PartialEq)]
pub struct ModellBild {
    pub bild: Bild,
    pub jpeg: bool,
    pub sha: [u8; 32],
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Modell {
    pub bilder: Vec<ModellBild>,
    pub materialien: Vec<Material>,
    pub netze: Vec<Prim>,
    /// je Mesh die Netz-Indizes seiner Primitiven
    pub meshes: Vec<Vec<u32>>,
    /// Tiefensuche über die Standardszene in Dateireihenfolge
    pub knoten: Vec<Knoten>,
    pub lichter: Vec<Licht>,
    pub haeute: Vec<Haut>,
    pub folgen: Vec<Folge>,
    /// Eckfarben wurden in ein Paletten-Bild gebacken
    pub palette: bool,
}

// ------------------------------------------------------------------------------------------------ Quellpaket

/// Magie des Quellpakets (Hauptdatei + benutzte Dateien; SHA-256 darüber steht im Modellteig).
pub const QUELL_MAGIE: [u8; 8] = *b"TEIGQUEL";

/// Ein zerlegtes Quellpaket: Hauptdatei und (URI wie in der Datei, Bytes).
pub struct Quelle<'a> {
    pub haupt: &'a [u8],
    pub dateien: Vec<(&'a str, &'a [u8])>,
}

fn u32_at(t: &[u8], i: usize) -> Option<u32> {
    let b = t.get(i..i.checked_add(4)?)?;
    Some(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

/// Quellpaket bauen: ohne weitere Dateien die Hauptdatei selbst (SHA-256 = SHA-256 der Datei, wie bei Bildern), sonst
/// `"TEIGQUEL"`, `u32 n`, `u32 länge` + Hauptdatei, n × (`u32` URI-Länge, URI, `u32` Länge, Bytes) in der Reihenfolge von
/// [`braucht`] (nur vorhandene Dateien).
pub fn quellpaket(haupt: &[u8], dateien: &[(&str, &[u8])]) -> Vec<u8> {
    if dateien.is_empty() {
        return haupt.to_vec();
    }
    let mut v = Vec::with_capacity(16 + haupt.len() + dateien.iter().map(|d| 8 + d.0.len() + d.1.len()).sum::<usize>());
    v.extend_from_slice(&QUELL_MAGIE);
    v.extend_from_slice(&(dateien.len() as u32).to_le_bytes());
    v.extend_from_slice(&(haupt.len() as u32).to_le_bytes());
    v.extend_from_slice(haupt);
    for (u, b) in dateien {
        v.extend_from_slice(&(u.len() as u32).to_le_bytes());
        v.extend_from_slice(u.as_bytes());
        v.extend_from_slice(&(b.len() as u32).to_le_bytes());
        v.extend_from_slice(b);
    }
    v
}

/// Quellpaket zerlegen. Ohne Magie gilt die ganze Eingabe als Hauptdatei ohne weitere Dateien (`.glb` direkt).
pub fn zerlege(p: &[u8]) -> Option<Quelle<'_>> {
    if p.len() < 8 || p[..8] != QUELL_MAGIE {
        return Some(Quelle { haupt: p, dateien: Vec::new() });
    }
    let n = u32_at(p, 8)? as usize;
    let hl = u32_at(p, 12)? as usize;
    let mut o = 16usize;
    let haupt = p.get(o..o.checked_add(hl)?)?;
    o += hl;
    if n > 4096 {
        return None;
    }
    let mut dateien = Vec::with_capacity(n);
    for _ in 0..n {
        let ul = u32_at(p, o)? as usize;
        o += 4;
        let u = core::str::from_utf8(p.get(o..o.checked_add(ul)?)?).ok()?;
        o += ul;
        let bl = u32_at(p, o)? as usize;
        o += 4;
        let b = p.get(o..o.checked_add(bl)?)?;
        o += bl;
        dateien.push((u, b));
    }
    if o != p.len() {
        return None;
    }
    Some(Quelle { haupt, dateien })
}

// ------------------------------------------------------------------------------------------------ Hauptdatei

const GLB_MAGIE: u32 = 0x4654_6C67; // "glTF"
const CHUNK_JSON: u32 = 0x4E4F_534A;
const CHUNK_BIN: u32 = 0x004E_4942;

/// `.glb` → (JSON-Bytes, BIN-Chunk); `.gltf` → (Bytes, None). `None` = beschädigtes GLB.
pub fn hauptdatei(q: &[u8]) -> Option<(&[u8], Option<&[u8]>)> {
    if q.len() >= 4 && u32_at(q, 0) == Some(GLB_MAGIE) {
        if u32_at(q, 4)? != 2 || u32_at(q, 8)? as usize != q.len() {
            return None;
        }
        let mut o = 12usize;
        let mut json = None;
        let mut bin = None;
        let mut erster = true;
        while o < q.len() {
            let l = u32_at(q, o)? as usize;
            let t = u32_at(q, o + 4)?;
            let d = q.get(o + 8..(o + 8).checked_add(l)?)?;
            if erster && t != CHUNK_JSON {
                return None;
            }
            if t == CHUNK_JSON && json.is_none() {
                json = Some(d);
            } else if t == CHUNK_BIN && bin.is_none() && !erster {
                bin = Some(d);
            }
            erster = false;
            o = o + 8 + l;
        }
        // JSON-Chunk mit Leerzeichen aufgefüllt (Spezifikation): Füllung entfernen
        let j = json?;
        let mut e = j.len();
        while e > 0 && matches!(j[e - 1], b' ' | 0) {
            e -= 1;
        }
        Some((&j[..e], bin))
    } else {
        Some((q, None))
    }
}

/// `true`, wenn die Bytes wie ein glTF aussehen (GLB-Magie oder ein JSON-Objekt am Anfang) – für die Vorschau im Dateibaum.
pub fn ist_gltf(q: &[u8]) -> bool {
    if q.len() >= 4 && u32_at(q, 0) == Some(GLB_MAGIE) {
        return true;
    }
    let q = if q.starts_with(&[0xEF, 0xBB, 0xBF]) { &q[3..] } else { q };
    q.iter().find(|c| !matches!(c, b' ' | b'\t' | b'\n' | b'\r')) == Some(&b'{')
}

/// Prozent-Kodierung entfernen (`%20` → Leerzeichen); ungültig → `None`.
fn prozent(u: &str) -> Option<String> {
    let b = u.as_bytes();
    let mut aus = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let h = core::str::from_utf8(b.get(i + 1..i + 3)?).ok()?;
            aus.push(u8::from_str_radix(h, 16).ok()?);
            i += 3;
        } else {
            aus.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(aus).ok()
}

/// Löst eine relative URI gegen den Ordner von `pfad` auf (Projektpfad, PROJEKTE §1.3). `None` = absolut, mit Schema, oder
/// außerhalb des Projekts.
pub fn loese(pfad: &str, uri: &str) -> Option<String> {
    if uri.is_empty() || uri.contains(':') || uri.starts_with('/') || uri.contains('\\') || uri.contains('?') || uri.contains('#') {
        return None;
    }
    let u = prozent(uri)?;
    let mut teile: Vec<&str> = pfad.split('/').collect();
    teile.pop();
    for s in u.split('/') {
        match s {
            "" | "." => {}
            ".." => {
                teile.pop()?;
            }
            _ => teile.push(s),
        }
    }
    if teile.is_empty() {
        return None;
    }
    Some(teile.join("/"))
}

/// Die Dateien, die ein `.gltf` außer sich selbst braucht: (URI, Projektpfad) in Reihenfolge (Puffer, dann Bilder; jede URI
/// einmal). `data:`-URIs und nicht auflösbare URIs fehlen (letztere meldet `vorbacken`). Kein lesbares JSON → leer.
pub fn braucht(pfad: &str, haupt: &[u8]) -> Vec<(String, String)> {
    let mut aus: Vec<(String, String)> = Vec::new();
    let Some((j, _)) = hauptdatei(haupt) else { return aus };
    let Some(d) = json::lies(j) else { return aus };
    let w = W::wurzel(&d);
    for liste in ["buffers", "images"] {
        let Some(l) = w.feld(liste) else { continue };
        for i in 0..l.laenge().unwrap_or(0) {
            let Some(u) = l.el(i).and_then(|e| e.feld("uri")).and_then(|u| u.text()) else { continue };
            if u.starts_with("data:") || aus.iter().any(|(a, _)| a == u) {
                continue;
            }
            if let Some(p) = loese(pfad, u) {
                aus.push((u.to_string(), p));
            }
        }
    }
    aus
}

// ------------------------------------------------------------------------------------------------ Base64 (data:-URIs)

fn b64_wert(c: u8) -> Option<u32> {
    Some(match c {
        b'A'..=b'Z' => (c - b'A') as u32,
        b'a'..=b'z' => (c - b'a' + 26) as u32,
        b'0'..=b'9' => (c - b'0' + 52) as u32,
        b'+' | b'-' => 62,
        b'/' | b'_' => 63,
        _ => return None,
    })
}

/// Base64 (Standard und URL-Alphabet, `=` optional am Ende) → Bytes.
pub fn base64(t: &[u8]) -> Option<Vec<u8>> {
    let mut e = t.len();
    while e > 0 && t[e - 1] == b'=' {
        e -= 1;
    }
    if t.len() - e > 2 {
        return None;
    }
    let t = &t[..e];
    let mut aus = Vec::with_capacity(t.len() / 4 * 3 + 3);
    let mut acc = 0u32;
    let mut n = 0;
    for &c in t {
        acc = acc << 6 | b64_wert(c)?;
        n += 1;
        if n == 4 {
            aus.extend_from_slice(&[(acc >> 16) as u8, (acc >> 8) as u8, acc as u8]);
            acc = 0;
            n = 0;
        }
    }
    match n {
        0 => {}
        2 => aus.push((acc >> 4) as u8),
        3 => aus.extend_from_slice(&[(acc >> 10) as u8, (acc >> 2) as u8]),
        _ => return None,
    }
    Some(aus)
}

/// `data:[<mime>][;base64],<daten>` → Bytes (nur base64).
fn data_uri(u: &str) -> Option<Vec<u8>> {
    let rest = u.strip_prefix("data:")?;
    let komma = rest.find(',')?;
    if !rest[..komma].ends_with(";base64") {
        return None;
    }
    base64(rest[komma + 1..].as_bytes())
}

// ------------------------------------------------------------------------------------------------ Leser

struct Leser<'a> {
    w: W<'a>,
    puffer: Vec<Vec<u8>>,
    /// Bin-Chunk für Puffer 0 ohne URI
    quelle: &'a Quelle<'a>,
}

fn opt_idx(w: Option<W>) -> Erg<Option<usize>> {
    match w {
        None => Ok(None),
        Some(v) => match v.ganz() {
            Some(i) if i < 1 << 31 => Ok(Some(i as usize)),
            _ => kein(),
        },
    }
}

fn opt_f32(w: Option<W>, standard: f32) -> Erg<f32> {
    match w {
        None => Ok(standard),
        Some(v) => v.f32().ok_or(MFehler::KeinModell),
    }
}

fn f32_feld<const N: usize>(w: Option<W>, standard: [f32; N]) -> Erg<[f32; N]> {
    match w {
        None => Ok(standard),
        Some(v) => {
            if v.laenge() != Some(N) {
                return kein();
            }
            let mut a = [0f32; N];
            for (i, x) in a.iter_mut().enumerate() {
                *x = v.el(i).and_then(|e| e.f32()).ok_or(MFehler::KeinModell)?;
            }
            Ok(a)
        }
    }
}

fn name(w: W) -> String {
    w.feld("name").and_then(|n| n.text()).unwrap_or("").to_string()
}

/// Gelesener Accessor: Werte als f32 (normalisiert bzw. ganzzahlig umgewandelt) oder – für Indizes/Gelenke – als u32.
struct Acc {
    anzahl: usize,
    komp: usize,
    f: Vec<f32>,
    u: Vec<u32>,
    /// Komponententyp (5120 … 5126)
    typ: u32,
    normiert: bool,
}

fn komp_anzahl(t: &str) -> Option<usize> {
    Some(match t {
        "SCALAR" => 1,
        "VEC2" => 2,
        "VEC3" => 3,
        "VEC4" => 4,
        "MAT2" => 4,
        "MAT3" => 9,
        "MAT4" => 16,
        _ => return None,
    })
}

fn typ_groesse(t: u32) -> Option<usize> {
    Some(match t {
        5120 | 5121 => 1,
        5122 | 5123 => 2,
        5125 | 5126 => 4,
        _ => return None,
    })
}

/// Eine Komponente lesen: (f32-Wert, u32-Wert).
fn komp_lesen(b: &[u8], o: usize, typ: u32, normiert: bool) -> (f32, u32) {
    match typ {
        5120 => {
            let v = b[o] as i8;
            (if normiert { (v as f32 / 127.0).max(-1.0) } else { v as f32 }, v as i32 as u32)
        }
        5121 => {
            let v = b[o];
            (if normiert { v as f32 / 255.0 } else { v as f32 }, v as u32)
        }
        5122 => {
            let v = i16::from_le_bytes([b[o], b[o + 1]]);
            (if normiert { (v as f32 / 32767.0).max(-1.0) } else { v as f32 }, v as i32 as u32)
        }
        5123 => {
            let v = u16::from_le_bytes([b[o], b[o + 1]]);
            (if normiert { v as f32 / 65535.0 } else { v as f32 }, v as u32)
        }
        5125 => {
            let v = u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]);
            (v as f32, v)
        }
        _ => {
            let v = f32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]);
            (if v.is_finite() { v } else { 0.0 }, 0)
        }
    }
}

impl<'a> Leser<'a> {
    fn liste(&self, k: &str) -> usize {
        self.w.feld(k).and_then(|l| l.laenge()).unwrap_or(0)
    }
    fn el(&self, k: &str, i: usize) -> Erg<W<'a>> {
        self.w.feld(k).and_then(|l| l.el(i)).ok_or(MFehler::KeinModell)
    }

    fn datei(&self, uri: &str) -> Erg<Vec<u8>> {
        if uri.starts_with("data:") {
            return data_uri(uri).ok_or(MFehler::KeinModell);
        }
        match self.quelle.dateien.iter().find(|(u, _)| *u == uri) {
            Some((_, b)) => Ok(b.to_vec()),
            None => Err(MFehler::DateiFehlt(uri.to_string())),
        }
    }

    fn lade_puffer(&mut self, bin: Option<&[u8]>) -> Erg<()> {
        for i in 0..self.liste("buffers") {
            let b = self.el("buffers", i)?;
            let laenge = b.feld("byteLength").and_then(|l| l.ganz()).ok_or(MFehler::KeinModell)? as usize;
            let daten = match b.feld("uri") {
                Some(u) => self.datei(u.text().ok_or(MFehler::KeinModell)?)?,
                None if i == 0 && bin.is_some() => bin.unwrap_or(&[]).to_vec(),
                None => return kein(),
            };
            if daten.len() < laenge {
                return kein();
            }
            self.puffer.push(daten);
        }
        Ok(())
    }

    /// Bytes einer bufferView: (Daten, Schrittweite).
    fn ansicht(&self, i: usize) -> Erg<(&[u8], Option<usize>)> {
        let v = self.el("bufferViews", i)?;
        let p = opt_idx(v.feld("buffer"))?.ok_or(MFehler::KeinModell)?;
        let off = v.feld("byteOffset").map(|o| o.ganz().ok_or(MFehler::KeinModell)).transpose()?.unwrap_or(0) as usize;
        let len = v.feld("byteLength").and_then(|l| l.ganz()).ok_or(MFehler::KeinModell)? as usize;
        let schritt = v.feld("byteStride").map(|s| s.ganz().ok_or(MFehler::KeinModell)).transpose()?.map(|s| s as usize);
        if let Some(s) = schritt {
            if !(4..=252).contains(&s) {
                return kein();
            }
        }
        let buf = self.puffer.get(p).ok_or(MFehler::KeinModell)?;
        let d = buf.get(off..off.checked_add(len).ok_or(MFehler::KeinModell)?).ok_or(MFehler::KeinModell)?;
        Ok((d, schritt))
    }

    /// Rohdaten lesen: `anzahl` Elemente à `komp` Komponenten ab `off` in `d` mit Schrittweite.
    fn lies_roh(d: &[u8], off: usize, schritt: Option<usize>, anzahl: usize, komp: usize, typ: u32, normiert: bool, f: &mut Vec<f32>, u: &mut Vec<u32>) -> Erg<()> {
        let g = typ_groesse(typ).ok_or(MFehler::KeinModell)?;
        let el = komp.checked_mul(g).ok_or(MFehler::KeinModell)?;
        let s = schritt.unwrap_or(el);
        if s < el && anzahl > 1 {
            return kein();
        }
        if anzahl > 0 {
            let ende = off
                .checked_add(s.checked_mul(anzahl - 1).ok_or(MFehler::KeinModell)?)
                .and_then(|x| x.checked_add(el))
                .ok_or(MFehler::KeinModell)?;
            if ende > d.len() {
                return kein();
            }
        }
        f.reserve(anzahl * komp);
        u.reserve(anzahl * komp);
        for i in 0..anzahl {
            let b = off + i * s;
            for k in 0..komp {
                let (a, c) = komp_lesen(d, b + k * g, typ, normiert);
                f.push(a);
                u.push(c);
            }
        }
        Ok(())
    }

    fn accessor(&self, i: usize) -> Erg<Acc> {
        let a = self.el("accessors", i)?;
        let typ = a.feld("componentType").and_then(|t| t.ganz()).ok_or(MFehler::KeinModell)? as u32;
        typ_groesse(typ).ok_or(MFehler::KeinModell)?;
        let normiert = a.feld("normalized").map(|n| n.bool().ok_or(MFehler::KeinModell)).transpose()?.unwrap_or(false);
        let anzahl = a.feld("count").and_then(|c| c.ganz()).ok_or(MFehler::KeinModell)?;
        if anzahl == 0 || anzahl > grenze::ACCESSOR {
            return kein();
        }
        let anzahl = anzahl as usize;
        let komp = komp_anzahl(a.feld("type").and_then(|t| t.text()).ok_or(MFehler::KeinModell)?).ok_or(MFehler::KeinModell)?;
        let off = a.feld("byteOffset").map(|o| o.ganz().ok_or(MFehler::KeinModell)).transpose()?.unwrap_or(0) as usize;
        let mut f = Vec::new();
        let mut u = Vec::new();
        match opt_idx(a.feld("bufferView"))? {
            Some(v) => {
                let (d, s) = self.ansicht(v)?;
                Self::lies_roh(d, off, s, anzahl, komp, typ, normiert, &mut f, &mut u)?;
            }
            None => {
                f = vec![0.0; anzahl * komp];
                u = vec![0; anzahl * komp];
            }
        }
        if let Some(sp) = a.feld("sparse") {
            let n = sp.feld("count").and_then(|c| c.ganz()).ok_or(MFehler::KeinModell)? as usize;
            if n == 0 || n > anzahl {
                return kein();
            }
            let ix = sp.feld("indices").ok_or(MFehler::KeinModell)?;
            let (d, _) = self.ansicht(opt_idx(ix.feld("bufferView"))?.ok_or(MFehler::KeinModell)?)?;
            let it = ix.feld("componentType").and_then(|t| t.ganz()).ok_or(MFehler::KeinModell)? as u32;
            if !matches!(it, 5121 | 5123 | 5125) {
                return kein();
            }
            let io = ix.feld("byteOffset").map(|o| o.ganz().ok_or(MFehler::KeinModell)).transpose()?.unwrap_or(0) as usize;
            let (mut _f, mut iu) = (Vec::new(), Vec::new());
            Self::lies_roh(d, io, None, n, 1, it, false, &mut _f, &mut iu)?;
            let vw = sp.feld("values").ok_or(MFehler::KeinModell)?;
            let (d, _) = self.ansicht(opt_idx(vw.feld("bufferView"))?.ok_or(MFehler::KeinModell)?)?;
            let vo = vw.feld("byteOffset").map(|o| o.ganz().ok_or(MFehler::KeinModell)).transpose()?.unwrap_or(0) as usize;
            let (mut vf, mut vu) = (Vec::new(), Vec::new());
            Self::lies_roh(d, vo, None, n, komp, typ, normiert, &mut vf, &mut vu)?;
            for (k, &ziel) in iu.iter().enumerate() {
                let z = ziel as usize;
                if z >= anzahl {
                    return kein();
                }
                for c in 0..komp {
                    f[z * komp + c] = vf[k * komp + c];
                    u[z * komp + c] = vu[k * komp + c];
                }
            }
        }
        Ok(Acc { anzahl, komp, f, u, typ, normiert })
    }
}

fn pruefe_erweiterungen(w: W) -> Erg<()> {
    if let Some(l) = w.feld("extensionsRequired") {
        for i in 0..l.laenge().ok_or(MFehler::KeinModell)? {
            let e = l.el(i).and_then(|e| e.text()).ok_or(MFehler::KeinModell)?;
            if !ERWEITERUNGEN.contains(&e) {
                return Err(MFehler::Erweiterung(e.to_string()));
            }
        }
    }
    Ok(())
}

/// Szene → Knotenreihenfolge (Tiefensuche in Dateireihenfolge) und Eltern. Prüft, dass der Graph ein Wald ist.
fn knotenfolge(w: W) -> Erg<(Vec<usize>, Vec<Option<u32>>)> {
    let n = w.feld("nodes").and_then(|l| l.laenge()).unwrap_or(0);
    if n as u64 > 1 << 20 {
        return kein();
    }
    let kinder = |i: usize| -> Erg<Vec<usize>> {
        let k = match w.feld("nodes").and_then(|l| l.el(i)).and_then(|e| e.feld("children")) {
            None => return Ok(Vec::new()),
            Some(k) => k,
        };
        let mut v = Vec::new();
        for j in 0..k.laenge().ok_or(MFehler::KeinModell)? {
            let c = opt_idx(k.el(j))?.ok_or(MFehler::KeinModell)?;
            if c >= n {
                return kein();
            }
            v.push(c);
        }
        Ok(v)
    };
    let wurzeln: Vec<usize> = match w.feld("scenes").and_then(|s| s.laenge()) {
        Some(sn) if sn > 0 => {
            let s = opt_idx(w.feld("scene"))?.unwrap_or(0);
            let sz = w.feld("scenes").and_then(|l| l.el(s)).ok_or(MFehler::KeinModell)?;
            let mut v = Vec::new();
            if let Some(l) = sz.feld("nodes") {
                for j in 0..l.laenge().ok_or(MFehler::KeinModell)? {
                    let c = opt_idx(l.el(j))?.ok_or(MFehler::KeinModell)?;
                    if c >= n {
                        return kein();
                    }
                    v.push(c);
                }
            }
            v
        }
        _ => {
            // keine Szene: alle Knoten ohne Eltern in Indexreihenfolge
            let mut hat_eltern = vec![false; n];
            for i in 0..n {
                for c in kinder(i)? {
                    hat_eltern[c] = true;
                }
            }
            (0..n).filter(|&i| !hat_eltern[i]).collect()
        }
    };
    let mut besucht = vec![false; n];
    let mut folge = Vec::new();
    let mut eltern = Vec::new();
    // expliziter Stapel (keine Rekursion): (Knoten, Eltern-Position in `folge`)
    let mut stapel: Vec<(usize, Option<u32>)> = wurzeln.iter().rev().map(|&r| (r, None)).collect();
    while let Some((k, e)) = stapel.pop() {
        if besucht[k] {
            return kein();
        }
        besucht[k] = true;
        if folge.len() as u64 >= grenze::KNOTEN {
            return Err(MFehler::ZuGross((n as u64).max(grenze::KNOTEN + 1), grenze::KNOTEN, "Knoten"));
        }
        let pos = folge.len() as u32;
        folge.push(k);
        eltern.push(e);
        for &c in kinder(k)?.iter().rev() {
            stapel.push((c, Some(pos)));
        }
    }
    Ok((folge, eltern))
}

fn dreiecke(modus: u64, idx: Vec<u32>) -> Erg<Vec<u32>> {
    Ok(match modus {
        4 => {
            let n = idx.len() / 3 * 3;
            let mut v = idx;
            v.truncate(n);
            v
        }
        5 => {
            let mut v = Vec::with_capacity(idx.len().saturating_sub(2) * 3);
            for i in 2..idx.len() {
                if i % 2 == 0 {
                    v.extend_from_slice(&[idx[i - 2], idx[i - 1], idx[i]]);
                } else {
                    v.extend_from_slice(&[idx[i - 1], idx[i - 2], idx[i]]);
                }
            }
            v
        }
        6 => {
            let mut v = Vec::with_capacity(idx.len().saturating_sub(2) * 3);
            for i in 2..idx.len() {
                v.extend_from_slice(&[idx[0], idx[i - 1], idx[i]]);
            }
            v
        }
        _ => return kein(),
    })
}

/// Quantisieren 0 … 1 → 0 … 4095 (f32: × und +, dann abschneiden) → sRGB-Tabelle.
fn srgb8(c: f32) -> u8 {
    let c = if c > 1.0 { 1.0 } else if c > 0.0 { c } else { 0.0 };
    crate::srgb::LINEAR_ZU_SRGB[(c * 4095.0 + 0.5) as usize]
}

fn alpha8(a: f32) -> u8 {
    let a = if a > 1.0 { 1.0 } else if a > 0.0 { a } else { 0.0 };
    (a * 255.0 + 0.5) as u8
}

/// Gewichte (Summe beliebig) → u16 mit Summe 65 535 (Rest an das größte; alles 0 → [65535, 0, 0, 0]).
fn gewichte_u16(w: [f32; 4]) -> [u16; 4] {
    let mut s = 0f32;
    for x in w {
        s += if x > 0.0 { x } else { 0.0 };
    }
    if !(s > 0.0) {
        return [65535, 0, 0, 0];
    }
    let mut q = [0u32; 4];
    let mut summe = 0u32;
    let mut groesst = 0;
    for k in 0..4 {
        let x = if w[k] > 0.0 { w[k] / s } else { 0.0 };
        q[k] = ((x * 65535.0 + 0.5) as u32).min(65535);
        summe += q[k];
        if q[k] > q[groesst] {
            groesst = k;
        }
    }
    let rest = 65535i64 - summe as i64;
    q[groesst] = (q[groesst] as i64 + rest).clamp(0, 65535) as u32;
    [q[0] as u16, q[1] as u16, q[2] as u16, q[3] as u16]
}

/// Bild dekodieren (PNG oder JPEG, Kanten ≤ 2048).
fn dekodiere_bild(b: &[u8], nr: u32) -> Erg<ModellBild> {
    let r = if png::ist_png(b) {
        png::dekodiere(b).map(|x| (x, false))
    } else if jpeg::ist_jpeg(b) {
        jpeg::dekodiere(b).map(|x| (x, true))
    } else {
        Err(crate::Fehler::KeinBild)
    };
    match r {
        Ok((bild, jpeg)) => Ok(ModellBild { bild, jpeg, sha: crate::sha256(b) }),
        Err(f) => Err(MFehler::Bild(nr, f)),
    }
}

/// Bild aus RGBA-Pixeln (abgeleitete Bilder: Relief, Stoff, Palette); SHA-256 über die Pixel.
fn eigenes_bild(breite: u32, hoehe: u32, rgba: Vec<u8>) -> ModellBild {
    let sha = crate::sha256(&rgba);
    ModellBild { bild: Bild { breite, hoehe, rgba }, jpeg: false, sha }
}

/// Texel (x, y) eines Bildes in die Größe eines anderen abgebildet (nächster Nachbar, ganzzahlig).
fn texel(b: &Bild, x: u32, y: u32, zb: u32, zh: u32) -> &[u8] {
    let sx = (x as u64 * b.breite as u64 / zb as u64) as usize;
    let sy = (y as u64 * b.hoehe as u64 / zh as u64) as usize;
    let o = (sy * b.breite as usize + sx) * 4;
    &b.rgba[o..o + 4]
}

/// glTF-Quelle (Quellpaket oder `.glb`) → Modell.
pub fn lies(paket: &[u8]) -> Erg<Modell> {
    if paket.len() > grenze::QUELLE {
        return Err(MFehler::ZuGross(paket.len() as u64, grenze::QUELLE as u64, "Bytes"));
    }
    let quelle = zerlege(paket).ok_or(MFehler::KeinModell)?;
    let (j, bin) = hauptdatei(quelle.haupt).ok_or(MFehler::KeinModell)?;
    let dok: Dok = json::lies(j).ok_or(MFehler::KeinModell)?;
    let w = W::wurzel(&dok);
    if !w.ist_objekt() {
        return kein();
    }
    let version = w.feld("asset").and_then(|a| a.feld("version")).and_then(|v| v.text()).ok_or(MFehler::KeinModell)?;
    if !version.starts_with("2.") {
        return kein();
    }
    pruefe_erweiterungen(w)?;
    let mut l = Leser { w, puffer: Vec::new(), quelle: &quelle };
    l.lade_puffer(bin)?;

    let (folge, eltern) = knotenfolge(w)?;
    let mut pos_von = vec![u32::MAX; l.liste("nodes")];
    for (p, &k) in folge.iter().enumerate() {
        pos_von[k] = p as u32;
    }

    let mut m = Modell::default();
    // Meshes (nur benutzte) → Netze; Materialien und Bilder in Reihenfolge der ersten Benutzung
    let mut mesh_von: Vec<Option<u32>> = vec![None; l.liste("meshes")];
    let mut mat_von: Vec<Option<u32>> = vec![None; l.liste("materials")];
    let mut mat_quelle: Vec<usize> = Vec::new(); // Modell-Material → glTF-Material
    let mut ersatz: Option<u32> = None;
    let mut prim_farbig: Vec<bool> = Vec::new(); // je Netz: hat COLOR_0
    let mut prim_farben: Vec<Vec<[u8; 4]>> = Vec::new();
    let (mut ecken, mut drei) = (0u64, 0u64);
    for &k in &folge {
        let kn = l.el("nodes", k)?;
        let Some(mi) = opt_idx(kn.feld("mesh"))? else { continue };
        if mi >= mesh_von.len() {
            return kein();
        }
        if mesh_von[mi].is_some() {
            continue;
        }
        let mesh = l.el("meshes", mi)?;
        let prims = mesh.feld("primitives").ok_or(MFehler::KeinModell)?;
        let mut liste = Vec::new();
        for pi in 0..prims.laenge().ok_or(MFehler::KeinModell)? {
            let p = prims.el(pi).ok_or(MFehler::KeinModell)?;
            let modus = p.feld("mode").map(|x| x.ganz().ok_or(MFehler::KeinModell)).transpose()?.unwrap_or(4);
            if modus > 6 {
                return kein();
            }
            if modus < 4 {
                continue; // Punkte und Linien entfallen
            }
            let at = p.feld("attributes").ok_or(MFehler::KeinModell)?;
            let pa = l.accessor(opt_idx(at.feld("POSITION"))?.ok_or(MFehler::KeinModell)?)?;
            if pa.komp != 3 || (pa.typ != 5126 && !matches!(pa.typ, 5120..=5123)) {
                return kein();
            }
            let n = pa.anzahl;
            ecken += n as u64;
            if ecken > grenze::ECKEN {
                return Err(MFehler::ZuGross(ecken, grenze::ECKEN, "Ecken"));
            }
            let nor = match opt_idx(at.feld("NORMAL"))? {
                Some(a) => {
                    let x = l.accessor(a)?;
                    if x.komp != 3 || x.anzahl != n {
                        return kein();
                    }
                    Some(x.f)
                }
                None => None,
            };
            let mut uv = match opt_idx(at.feld("TEXCOORD_0"))? {
                Some(a) => {
                    let x = l.accessor(a)?;
                    if x.komp != 2 || x.anzahl != n {
                        return kein();
                    }
                    x.f
                }
                None => vec![0.0; n * 2],
            };
            let farben = match opt_idx(at.feld("COLOR_0"))? {
                Some(a) => {
                    let x = l.accessor(a)?;
                    if !(x.komp == 3 || x.komp == 4) || x.anzahl != n || !(x.typ == 5126 || (x.normiert && matches!(x.typ, 5121 | 5123))) {
                        return kein();
                    }
                    let mut v = Vec::with_capacity(n);
                    for e in 0..n {
                        let c = &x.f[e * x.komp..e * x.komp + x.komp];
                        v.push([srgb8(c[0]), srgb8(c[1]), srgb8(c[2]), if x.komp == 4 { alpha8(c[3]) } else { 255 }]);
                    }
                    Some(v)
                }
                None => None,
            };
            let (gelenke, gewichte) = match (opt_idx(at.feld("JOINTS_0"))?, opt_idx(at.feld("WEIGHTS_0"))?) {
                (Some(ja), Some(wa)) => {
                    let jx = l.accessor(ja)?;
                    let wx = l.accessor(wa)?;
                    if jx.komp != 4 || wx.komp != 4 || jx.anzahl != n || wx.anzahl != n || !matches!(jx.typ, 5121 | 5123) {
                        return kein();
                    }
                    let mut g = Vec::with_capacity(n * 4);
                    let mut gw = Vec::with_capacity(n * 4);
                    for e in 0..n {
                        for c in 0..4 {
                            g.push(jx.u[e * 4 + c] as u16);
                        }
                        gw.extend_from_slice(&gewichte_u16([wx.f[e * 4], wx.f[e * 4 + 1], wx.f[e * 4 + 2], wx.f[e * 4 + 3]]));
                    }
                    (Some(g), Some(gw))
                }
                _ => (None, None),
            };
            let idx = match opt_idx(p.feld("indices"))? {
                Some(a) => {
                    let x = l.accessor(a)?;
                    if x.komp != 1 || !matches!(x.typ, 5121 | 5123 | 5125) {
                        return kein();
                    }
                    x.u
                }
                None => (0..n as u32).collect(),
            };
            if idx.iter().any(|&i| i as usize >= n) {
                return kein();
            }
            let idx = dreiecke(modus, idx)?;
            drei += idx.len() as u64 / 3;
            if drei > grenze::DREIECKE {
                return Err(MFehler::ZuGross(drei, grenze::DREIECKE, "Dreiecke"));
            }
            let material = match opt_idx(p.feld("material"))? {
                None if farben.is_some() => {
                    // Eckfarben ohne Material: ein gemeinsames Ersatz-Material (weiß, nicht metallisch, Rauheit 0.7)
                    if ersatz.is_none() {
                        if mat_quelle.len() as u64 >= grenze::MATERIALIEN {
                            return Err(MFehler::ZuGross(grenze::MATERIALIEN + 1, grenze::MATERIALIEN, "Materialien"));
                        }
                        ersatz = Some(mat_quelle.len() as u32);
                        mat_quelle.push(usize::MAX);
                    }
                    ersatz
                }
                Some(g) => {
                    if g >= mat_von.len() {
                        return kein();
                    }
                    if mat_von[g].is_none() {
                        if mat_quelle.len() as u64 >= grenze::MATERIALIEN {
                            return Err(MFehler::ZuGross(grenze::MATERIALIEN + 1, grenze::MATERIALIEN, "Materialien"));
                        }
                        mat_von[g] = Some(mat_quelle.len() as u32);
                        mat_quelle.push(g);
                    }
                    mat_von[g]
                }
                None => None,
            };
            if uv.len() != n * 2 {
                uv = vec![0.0; n * 2];
            }
            prim_farbig.push(farben.is_some());
            prim_farben.push(farben.unwrap_or_default());
            liste.push(m.netze.len() as u32);
            m.netze.push(Prim { pos: pa.f, nor, uv, idx, material, gelenke, gewichte });
        }
        mesh_von[mi] = Some(m.meshes.len() as u32);
        m.meshes.push(liste);
    }

    // Bilder: glTF-Bild → dekodiert (einmal), Texturen → Bild-Index im glTF
    let n_bilder = l.liste("images");
    let mut dekodiert: Vec<Option<ModellBild>> = vec![None; n_bilder];
    let mut benutzte_bilder = 0u64;
    let textur_bild = |t: Option<W>| -> Erg<Option<(usize, bool)>> {
        let Some(ti) = t else { return Ok(None) };
        if opt_idx(ti.feld("texCoord"))?.unwrap_or(0) != 0 {
            return Ok(None); // TEXCOORD_1 nicht unterstützt
        }
        let tx = opt_idx(ti.feld("index"))?.ok_or(MFehler::KeinModell)?;
        let tex = w.feld("textures").and_then(|l| l.el(tx)).ok_or(MFehler::KeinModell)?;
        let Some(src) = opt_idx(tex.feld("source"))? else { return Ok(None) };
        if src >= n_bilder {
            return kein();
        }
        let wiederholen = match opt_idx(tex.feld("sampler"))? {
            Some(s) => {
                let sm = w.feld("samplers").and_then(|l| l.el(s)).ok_or(MFehler::KeinModell)?;
                let ws = opt_idx(sm.feld("wrapS"))?.unwrap_or(10497);
                let wt = opt_idx(sm.feld("wrapT"))?.unwrap_or(10497);
                ws != 33071 || wt != 33071
            }
            None => true,
        };
        Ok(Some((src, wiederholen)))
    };
    let mut bild_aus = |src: usize, d: &mut Vec<Option<ModellBild>>| -> Erg<()> {
        if d[src].is_some() {
            return Ok(());
        }
        benutzte_bilder += 1;
        if benutzte_bilder > grenze::BILDER {
            return Err(MFehler::ZuGross(benutzte_bilder, grenze::BILDER, "Bilder"));
        }
        let im = l.el("images", src)?;
        let nr = src as u32 + 1;
        let bytes = match (im.feld("uri"), opt_idx(im.feld("bufferView"))?) {
            (Some(u), _) => match l.datei(u.text().ok_or(MFehler::KeinModell)?) {
                Ok(b) => b,
                Err(MFehler::KeinModell) => return Err(MFehler::Bild(nr, crate::Fehler::KeinBild)),
                Err(e) => return Err(e),
            },
            (None, Some(v)) => l.ansicht(v)?.0.to_vec(),
            _ => return kein(),
        };
        d[src] = Some(dekodiere_bild(&bytes, nr)?);
        Ok(())
    };

    // Modellbilder in fester Reihenfolge; gleiche Ableitung → derselbe Index
    #[derive(PartialEq, Clone, Copy)]
    enum Herkunft {
        Direkt(usize),
        Relief(Option<usize>, Option<usize>),
        Stoff(Option<usize>, Option<usize>),
        Palette(u32),
    }
    let mut herkunft: Vec<Herkunft> = Vec::new();
    let mut nimm = |h: Herkunft, bilder: &mut Vec<ModellBild>, mach: &mut dyn FnMut() -> ModellBild| -> u32 {
        if let Some(i) = herkunft.iter().position(|x| *x == h) {
            return i as u32;
        }
        herkunft.push(h);
        bilder.push(mach());
        (herkunft.len() - 1) as u32
    };

    for (mi, &g) in mat_quelle.iter().enumerate() {
        let ma = if g == usize::MAX { None } else { Some(l.el("materials", g)?) };
        let mf = |k: &str| ma.and_then(|m| m.feld(k));
        let pbr = mf("pbrMetallicRoughness");
        let farbe = f32_feld(pbr.and_then(|p| p.feld("baseColorFactor")), [1.0; 4])?;
        let metall = opt_f32(pbr.and_then(|p| p.feld("metallicFactor")), if ma.is_none() { 0.0 } else { 1.0 })?;
        let rauheit = opt_f32(pbr.and_then(|p| p.feld("roughnessFactor")), if ma.is_none() { 0.7 } else { 1.0 })?;
        let leucht = f32_feld(mf("emissiveFactor"), [0.0; 3])?;
        let leucht_staerke = opt_f32(mf("extensions").and_then(|e| e.feld("KHR_materials_emissive_strength")).and_then(|e| e.feld("emissiveStrength")), 1.0)?;
        let normal = mf("normalTexture");
        let normal_staerke = opt_f32(normal.and_then(|n| n.feld("scale")), 1.0)?;
        let schwelle = opt_f32(mf("alphaCutoff"), 0.5)?;
        let alpha = match mf("alphaMode").map(|a| a.text().ok_or(MFehler::KeinModell)).transpose()? {
            None | Some("OPAQUE") => 0,
            Some("MASK") => 1,
            Some("BLEND") => 2,
            _ => return kein(),
        };
        let beidseitig = mf("doubleSided").map(|b| b.bool().ok_or(MFehler::KeinModell)).transpose()?.unwrap_or(false);
        let grund = textur_bild(pbr.and_then(|p| p.feld("baseColorTexture")))?;
        let mr = textur_bild(pbr.and_then(|p| p.feld("metallicRoughnessTexture")))?.map(|x| x.0);
        let nt = textur_bild(normal)?.map(|x| x.0);
        let ot = textur_bild(mf("occlusionTexture"))?.map(|x| x.0);
        let et = textur_bild(mf("emissiveTexture"))?.map(|x| x.0);
        for s in [grund.map(|x| x.0), mr, nt, ot, et].into_iter().flatten() {
            bild_aus(s, &mut dekodiert)?;
        }
        let netze_mit: Vec<usize> = (0..m.netze.len()).filter(|&i| m.netze[i].material == Some(mi as u32)).collect();
        // Grundfarbe: Bild, sonst Paletten-Bild aus den Eckfarben
        let mut bild_farbe = None;
        let mut wiederholen = false;
        let farbig = netze_mit.iter().any(|&i| prim_farbig[i]);
        if let Some((s, wd)) = grund {
            let b = dekodiert[s].clone().ok_or(MFehler::KeinModell)?;
            bild_farbe = Some(nimm(Herkunft::Direkt(s), &mut m.bilder, &mut || b.clone()));
            wiederholen = wd && netze_mit.iter().any(|&i| m.netze[i].uv.iter().any(|&x| !(0.0..=1.0).contains(&x)));
        } else if farbig {
            // Palette: weiß zuerst, dann alle Farben sortiert (Bytefolge), jede einmal; uv = Texelmitte
            let mut farben: Vec<[u8; 4]> = vec![[255; 4]];
            for &i in &netze_mit {
                farben.extend_from_slice(&prim_farben[i]);
            }
            farben[1..].sort_unstable();
            farben.dedup();
            let weiss_doppelt = farben[1..].binary_search(&[255; 4]).ok().map(|p| p + 1);
            if let Some(p) = weiss_doppelt {
                farben.remove(p);
            }
            let n = farben.len() as u32;
            let breite = n.min(2048);
            let hoehe = n.div_ceil(breite);
            if hoehe > 2048 {
                return Err(MFehler::ZuGross(n as u64, 2048 * 2048, "Farben"));
            }
            let mut rgba = vec![0u8; (breite * hoehe * 4) as usize];
            for (i, f) in farben.iter().enumerate() {
                rgba[i * 4..i * 4 + 4].copy_from_slice(f);
            }
            for i in (n as usize)..((breite * hoehe) as usize) {
                rgba[i * 4..i * 4 + 4].copy_from_slice(&[255; 4]);
            }
            let (bf, hf) = (breite as f32, hoehe as f32);
            let uv_von = |f: &[u8; 4]| -> (f32, f32) {
                let i = if *f == [255; 4] { 0 } else { 1 + farben[1..].binary_search(f).unwrap_or(0) } as u32;
                (((i % breite) as f32 + 0.5) / bf, ((i / breite) as f32 + 0.5) / hf)
            };
            for &i in &netze_mit {
                let n = m.netze[i].pos.len() / 3;
                for e in 0..n {
                    let (u, v) = if prim_farbig[i] { uv_von(&prim_farben[i][e]) } else { uv_von(&[255; 4]) };
                    m.netze[i].uv[e * 2] = u;
                    m.netze[i].uv[e * 2 + 1] = v;
                }
            }
            let bild = eigenes_bild(breite, hoehe, rgba);
            m.palette = true;
            bild_farbe = Some(nimm(Herkunft::Palette(mi as u32), &mut m.bilder, &mut || bild.clone()));
        }
        // Relief (Normale x, y + Rauheit) – nicht, wenn die UV der Palette gehört
        let bild_relief = if (nt.is_some() || mr.is_some()) && !(grund.is_none() && farbig) {
            let nb = nt.and_then(|s| dekodiert[s].as_ref()).map(|b| &b.bild);
            let rb = mr.and_then(|s| dekodiert[s].as_ref()).map(|b| &b.bild);
            let (zb, zh) = nb.or(rb).map(|b| (b.breite, b.hoehe)).unwrap_or((1, 1));
            let mut mach = || {
                let mut rgba = Vec::with_capacity((zb * zh * 4) as usize);
                for y in 0..zh {
                    for x in 0..zb {
                        let (r, g) = match nb {
                            Some(b) => {
                                let t = texel(b, x, y, zb, zh);
                                (t[0], t[1])
                            }
                            None => (128, 128),
                        };
                        let bb = match rb {
                            Some(b) => (texel(b, x, y, zb, zh)[1] as u32).div_ceil(2) as u8,
                            None => 128,
                        };
                        rgba.extend_from_slice(&[r, g, bb, 255]);
                    }
                }
                eigenes_bild(zb, zh, rgba)
            };
            Some(nimm(Herkunft::Relief(nt, mr), &mut m.bilder, &mut mach))
        } else {
            None
        };
        // Stoff (R Verdeckung, G Rauheit, B Metall) – ab H-K26 benutzt
        let bild_stoff = if ot.is_some() || mr.is_some() {
            let ob = ot.and_then(|s| dekodiert[s].as_ref()).map(|b| &b.bild);
            let rb = mr.and_then(|s| dekodiert[s].as_ref()).map(|b| &b.bild);
            let (zb, zh) = rb.or(ob).map(|b| (b.breite, b.hoehe)).unwrap_or((1, 1));
            let mut mach = || {
                let mut rgba = Vec::with_capacity((zb * zh * 4) as usize);
                for y in 0..zh {
                    for x in 0..zb {
                        let r = ob.map(|b| texel(b, x, y, zb, zh)[0]).unwrap_or(255);
                        let (g, b) = rb.map(|b| {
                            let t = texel(b, x, y, zb, zh);
                            (t[1], t[2])
                        }).unwrap_or((255, 255));
                        rgba.extend_from_slice(&[r, g, b, 255]);
                    }
                }
                eigenes_bild(zb, zh, rgba)
            };
            Some(nimm(Herkunft::Stoff(ot, mr), &mut m.bilder, &mut mach))
        } else {
            None
        };
        let bild_leucht = match et {
            Some(s) => {
                let b = dekodiert[s].clone().ok_or(MFehler::KeinModell)?;
                Some(nimm(Herkunft::Direkt(s), &mut m.bilder, &mut || b.clone()))
            }
            None => None,
        };
        m.materialien.push(Material {
            name: ma.map(name).unwrap_or_default(),
            farbe,
            metall,
            rauheit,
            leucht,
            leucht_staerke,
            normal_staerke,
            schwelle,
            alpha,
            beidseitig,
            wiederholen,
            bild_farbe,
            bild_relief,
            bild_stoff,
            bild_leucht,
        });
    }

    // Lichter (KHR_lights_punctual), nur benutzte, in Reihenfolge der Benutzung
    let lichter_w = w.feld("extensions").and_then(|e| e.feld("KHR_lights_punctual")).and_then(|e| e.feld("lights"));
    let mut licht_von: Vec<Option<u32>> = vec![None; lichter_w.and_then(|l| l.laenge()).unwrap_or(0)];
    // Häute
    let mut haut_von: Vec<Option<u32>> = vec![None; l.liste("skins")];

    for (p, &k) in folge.iter().enumerate() {
        let kn = l.el("nodes", k)?;
        let mesh = match opt_idx(kn.feld("mesh"))? {
            Some(mi) => mesh_von[mi],
            None => None,
        };
        let licht = match opt_idx(kn.feld("extensions").and_then(|e| e.feld("KHR_lights_punctual")).and_then(|e| e.feld("light")))? {
            Some(li) => {
                if li >= licht_von.len() {
                    return kein();
                }
                if licht_von[li].is_none() {
                    let lw = lichter_w.and_then(|l| l.el(li)).ok_or(MFehler::KeinModell)?;
                    let art = match lw.feld("type").and_then(|t| t.text()) {
                        Some("point") => 0,
                        Some("spot") => 1,
                        Some("directional") => 2,
                        _ => return kein(),
                    };
                    let spot = lw.feld("spot");
                    let aussen = opt_f32(spot.and_then(|s| s.feld("outerConeAngle")), core::f32::consts::FRAC_PI_4)?;
                    let innen = opt_f32(spot.and_then(|s| s.feld("innerConeAngle")), 0.0)?;
                    licht_von[li] = Some(m.lichter.len() as u32);
                    m.lichter.push(Licht {
                        name: name(lw),
                        art,
                        farbe: f32_feld(lw.feld("color"), [1.0; 3])?,
                        staerke: opt_f32(lw.feld("intensity"), 1.0)?,
                        reichweite: opt_f32(lw.feld("range"), 0.0)?,
                        innen,
                        aussen,
                    });
                }
                licht_von[li]
            }
            None => None,
        };
        let haut = match opt_idx(kn.feld("skin"))? {
            Some(si) if mesh.is_some() => {
                if si >= haut_von.len() {
                    return kein();
                }
                if haut_von[si].is_none() {
                    if m.haeute.len() as u64 >= grenze::HAEUTE {
                        return Err(MFehler::ZuGross(grenze::HAEUTE + 1, grenze::HAEUTE, "Häute"));
                    }
                    let sk = l.el("skins", si)?;
                    let jl = sk.feld("joints").ok_or(MFehler::KeinModell)?;
                    let n = jl.laenge().ok_or(MFehler::KeinModell)?;
                    if n == 0 {
                        return kein();
                    }
                    if n as u64 > grenze::GELENKE {
                        return Err(MFehler::ZuGross(n as u64, grenze::GELENKE, "Gelenke"));
                    }
                    let mut gelenke = Vec::with_capacity(n);
                    for j in 0..n {
                        let g = opt_idx(jl.el(j))?.ok_or(MFehler::KeinModell)?;
                        let gp = *pos_von.get(g).ok_or(MFehler::KeinModell)?;
                        if gp == u32::MAX {
                            return kein(); // Gelenk außerhalb der Szene
                        }
                        gelenke.push(gp);
                    }
                    let skelett = match opt_idx(sk.feld("skeleton"))? {
                        Some(s) => {
                            let sp = *pos_von.get(s).ok_or(MFehler::KeinModell)?;
                            if sp == u32::MAX { None } else { Some(sp) }
                        }
                        None => None,
                    };
                    let ibm = match opt_idx(sk.feld("inverseBindMatrices"))? {
                        Some(a) => {
                            let x = l.accessor(a)?;
                            if x.komp != 16 || x.typ != 5126 || x.anzahl < n {
                                return kein();
                            }
                            x.f[..n * 16].to_vec()
                        }
                        None => {
                            let mut v = Vec::with_capacity(n * 16);
                            for _ in 0..n {
                                v.extend_from_slice(&[1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]);
                            }
                            v
                        }
                    };
                    haut_von[si] = Some(m.haeute.len() as u32);
                    m.haeute.push(Haut { gelenke, skelett, ibm });
                }
                haut_von[si]
            }
            _ => None,
        };
        let (matrix, werte) = match kn.feld("matrix") {
            Some(mx) => (true, f32_feld(Some(mx), [0.0; 16])?),
            None => {
                let t = f32_feld(kn.feld("translation"), [0.0; 3])?;
                let r = f32_feld(kn.feld("rotation"), [0.0, 0.0, 0.0, 1.0])?;
                let s = f32_feld(kn.feld("scale"), [1.0; 3])?;
                let mut v = [0f32; 16];
                v[..3].copy_from_slice(&t);
                v[3..7].copy_from_slice(&r);
                v[7..10].copy_from_slice(&s);
                (false, v)
            }
        };
        m.knoten.push(Knoten { name: name(kn), eltern: eltern[p], mesh, licht, haut, matrix, werte });
    }

    // Folgen (Animationen): Kanäle auf Knoten der Szene, Pfade Lage/Drehung/Größe
    let n_folgen = l.liste("animations");
    if n_folgen as u64 > grenze::FOLGEN {
        return Err(MFehler::ZuGross(n_folgen as u64, grenze::FOLGEN, "Folgen"));
    }
    let mut stuetzen = 0u64;
    for fi in 0..n_folgen {
        let an = l.el("animations", fi)?;
        let samp = an.feld("samplers").ok_or(MFehler::KeinModell)?;
        let kan = an.feld("channels").ok_or(MFehler::KeinModell)?;
        let mut kanaele = Vec::new();
        for ci in 0..kan.laenge().ok_or(MFehler::KeinModell)? {
            let c = kan.el(ci).ok_or(MFehler::KeinModell)?;
            let ziel = c.feld("target").ok_or(MFehler::KeinModell)?;
            let pfad = match ziel.feld("path").and_then(|p| p.text()) {
                Some("translation") => 0,
                Some("rotation") => 1,
                Some("scale") => 2,
                Some("weights") => continue,
                _ => return kein(),
            };
            let Some(kn) = opt_idx(ziel.feld("node"))? else { continue };
            let kp = *pos_von.get(kn).ok_or(MFehler::KeinModell)?;
            if kp == u32::MAX {
                continue;
            }
            let s = samp.el(opt_idx(c.feld("sampler"))?.ok_or(MFehler::KeinModell)?).ok_or(MFehler::KeinModell)?;
            let art_text = s.feld("interpolation").map(|i| i.text().ok_or(MFehler::KeinModell)).transpose()?.unwrap_or("LINEAR");
            let (art, kubisch) = match art_text {
                "LINEAR" => (0, false),
                "STEP" => (1, false),
                "CUBICSPLINE" => (0, true),
                _ => return kein(),
            };
            let ein = l.accessor(opt_idx(s.feld("input"))?.ok_or(MFehler::KeinModell)?)?;
            let aus = l.accessor(opt_idx(s.feld("output"))?.ok_or(MFehler::KeinModell)?)?;
            let k = if pfad == 1 { 4 } else { 3 };
            if ein.komp != 1 || ein.typ != 5126 || aus.komp != k {
                return kein();
            }
            let n = ein.anzahl;
            let faktor = if kubisch { 3 } else { 1 };
            if aus.anzahl != n * faktor {
                return kein();
            }
            stuetzen += n as u64;
            if stuetzen > grenze::STUETZEN {
                return Err(MFehler::ZuGross(stuetzen, grenze::STUETZEN, "Stützstellen"));
            }
            let werte = if kubisch {
                let mut v = Vec::with_capacity(n * k);
                for i in 0..n {
                    v.extend_from_slice(&aus.f[(i * 3 + 1) * k..(i * 3 + 2) * k]);
                }
                v
            } else {
                aus.f
            };
            kanaele.push(Kanal { knoten: kp, pfad, art, zeiten: ein.f, werte });
        }
        m.folgen.push(Folge { name: name(an), kanaele });
    }
    Ok(m)
}
