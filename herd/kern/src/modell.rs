//! Modelle im Kern (H-K16, HERD.md §13.3, K-161): `modell_teig` prüft einen **Modellteig** (Format im Vorbacker
//! `herd/teigling/src/modell.rs`) vollständig – Magie, Längen, jeden Index – und legt an:
//! - je Netz eine normale Form-Ressource (fehlen Normalen, glatte wie `formen::netz_glatt`),
//! - je Grundfarb- bzw. Relief-Bild eine eigene Textur (Teigling wie `Bildchen.laden`; Stoff- und Leucht-Bilder bleiben bis
//!   H-K26 nur im Modell),
//! - eine ruhende `Vorlage`-Wurzel mit je Material einem Teil mit `Belag` (geteilt von allen Instanzen) und `Etikett`.
//!
//! `modell_teil` baut daraus ein Teil je Knoten (Tiefensuche, feste IDs) unter einer neuen 3D-Wurzel: Lage aus TRS bzw. der
//! zerlegten Matrix (Quaternion → `drehung`/`neigung`/`rollen` für `T · Ry · Rx · Rz · S`, f64 mit `libm`), `Etikett` mit Name
//! und Knotennummer, `Koerper` je Primitive (mehrere als Kind-Teile), `Licht` aus `KHR_lights_punctual` (Richtungslichter
//! entfallen – die Sonne ist global). Modelle haben eigene IDs (1 …), getrennt von Formen/Bildchen.

use alloc::string::String;
use alloc::vec::Vec;

use crate::fehler::{self, Erg};
use crate::formen::Netz;
use crate::mathe::{fin, V3};
use crate::welt::GRAD;

pub const MAGIE: [u8; 8] = *b"TEIGMODL";
pub const VERSION: u16 = 1;
const KOPF: usize = 64;

#[derive(Clone, Debug, Default)]
pub struct MMaterial {
    pub name: String,
    /// sRGB 0xRRGGBBAA
    pub farbe: u32,
    pub glanz: f64,
    pub metall: f64,
    pub leuchten: f64,
    pub strahlen: f64,
    pub kachel: f64,
    /// Bild-Indizes im Modell
    pub bild: Option<u32>,
    pub relief: Option<u32>,
    pub stoff: Option<u32>,
    pub leucht_bild: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct MKnoten {
    pub name: String,
    pub eltern: Option<u32>,
    pub mesh: Option<u32>,
    pub licht: Option<u32>,
    pub haut: Option<u32>,
    /// x, y, z, drehung, neigung, rollen (Grad), groesseX/Y/Z
    pub lage: [f64; 9],
}

#[derive(Clone, Debug, Default)]
pub struct MLicht {
    /// 0 Punkt, 1 Spot, 2 Richtung (entfällt)
    pub art: u8,
    pub farbe: u32,
    pub staerke: f64,
    pub reichweite: f64,
    pub kegel: f64,
    pub kegel_rand: f64,
}

#[derive(Clone, Debug, Default)]
pub struct MHaut {
    pub gelenke: Vec<u32>,
    pub skelett: Option<u32>,
    pub ibm: Vec<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct MKanal {
    pub knoten: u32,
    pub pfad: u8,
    pub art: u8,
    pub zeiten: Vec<f32>,
    pub werte: Vec<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct MFolge {
    pub name: String,
    pub kanaele: Vec<MKanal>,
}

/// Ein geladenes Modell (Ressource mit eigener ID).
#[derive(Clone, Debug, Default)]
pub struct Modell {
    /// Form-Ressource je Netz
    pub netze: Vec<u32>,
    /// Material je Netz
    pub netz_material: Vec<Option<u32>>,
    /// Haut je Netz: je Ecke 4 × Gelenk, 4 × Gewicht (auf 65 535 normiert; ab H-K23b)
    pub netz_haut: Vec<Option<Vec<u16>>>,
    pub meshes: Vec<Vec<u32>>,
    /// Bildchen-Ressource je Modellbild (nur Grundfarbe/Relief, sonst `None`)
    pub bilder: Vec<Option<u32>>,
    /// Teigling-Bytes der übrigen Bilder (Stoff, Leuchten; ab H-K26)
    pub weitere_bilder: Vec<(u32, Vec<u8>)>,
    pub materialien: Vec<MMaterial>,
    pub knoten: Vec<MKnoten>,
    pub lichter: Vec<MLicht>,
    pub haeute: Vec<MHaut>,
    pub folgen: Vec<MFolge>,
    /// Teil der ruhenden Vorlage-Wurzel und je Material das Belag-Teil
    pub vorlage: u32,
    pub belaege: Vec<u32>,
    /// Hülle der Ruhelage relativ zur Wurzel: min x, y, z, max x, y, z
    pub huelle: [f64; 6],
}

// ------------------------------------------------------------------------------------------------ Lesen

struct L<'a> {
    t: &'a [u8],
    p: usize,
}

type R<T> = Result<T, ()>;

impl<'a> L<'a> {
    fn bytes(&mut self, n: usize) -> R<&'a [u8]> {
        let e = self.p.checked_add(n).ok_or(())?;
        let b = self.t.get(self.p..e).ok_or(())?;
        self.p = e;
        Ok(b)
    }
    fn u8(&mut self) -> R<u8> {
        Ok(self.bytes(1)?[0])
    }
    fn u16(&mut self) -> R<u16> {
        let b = self.bytes(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }
    fn u32(&mut self) -> R<u32> {
        let b = self.bytes(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }
    fn i32(&mut self, grenze: usize) -> R<Option<u32>> {
        let v = self.u32()? as i32;
        if v == -1 {
            Ok(None)
        } else if v >= 0 && (v as usize) < grenze {
            Ok(Some(v as u32))
        } else {
            Err(())
        }
    }
    fn f32(&mut self) -> R<f32> {
        Ok(f32::from_bits(self.u32()?))
    }
    /// endliche f32 (nicht endliche → 0)
    fn f(&mut self) -> R<f64> {
        let v = self.f32()?;
        Ok(if v.is_finite() { v as f64 } else { 0.0 })
    }
    fn name(&mut self) -> R<String> {
        let n = self.u16()? as usize;
        if n > 200 {
            return Err(());
        }
        Ok(String::from(core::str::from_utf8(self.bytes(n)?).map_err(|_| ())?))
    }
    /// Anzahl mit Mindestgröße je Eintrag (gegen riesige Zähler)
    fn anzahl(&mut self, min_bytes: usize) -> R<usize> {
        let n = self.u32()? as usize;
        if n.checked_mul(min_bytes).ok_or(())? > self.t.len() - self.p {
            return Err(());
        }
        Ok(n)
    }
}

/// linear → sRGB 0 … 255 (IEC 61966-2-1, f64 mit `libm::pow`)
fn srgb(c: f64) -> u32 {
    let c = c.clamp(0.0, 1.0);
    let s = if c <= 0.0031308 { 12.92 * c } else { 1.055 * libm::pow(c, 1.0 / 2.4) - 0.055 };
    libm::floor(s.clamp(0.0, 1.0) * 255.0 + 0.5) as u32
}

fn farbe(r: f64, g: f64, b: f64, a: f64) -> u32 {
    let a8 = libm::floor(a.clamp(0.0, 1.0) * 255.0 + 0.5) as u32;
    srgb(r) << 24 | srgb(g) << 16 | srgb(b) << 8 | a8
}

/// Rotationsmatrix (zeilenweise r[i][j]) → (drehung, neigung, rollen) in Grad für R = Ry(d) · Rx(n) · Rz(r).
pub fn euler(r: [[f64; 3]; 3]) -> (f64, f64, f64) {
    let sx = (-r[1][2]).clamp(-1.0, 1.0);
    let n = libm::asin(sx);
    if libm::fabs(sx) < 0.999_999_9 {
        (libm::atan2(r[0][2], r[2][2]) / GRAD, n / GRAD, libm::atan2(r[1][0], r[1][1]) / GRAD)
    } else {
        // Kardanische Sperre: rollen = 0, die ganze Drehung um y
        (libm::atan2(-r[2][0], r[0][0]) / GRAD, n / GRAD, 0.0)
    }
}

/// Quaternion (x, y, z, w) → Rotationsmatrix (normiert; Nullquaternion → Einheit).
pub fn quat_matrix(q: [f64; 4]) -> [[f64; 3]; 3] {
    let l = libm::sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    if !(l > 1e-12) {
        return [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
    }
    let (x, y, z, w) = (q[0] / l, q[1] / l, q[2] / l, q[3] / l);
    [
        [1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y - z * w), 2.0 * (x * z + y * w)],
        [2.0 * (x * y + z * w), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z - x * w)],
        [2.0 * (x * z - y * w), 2.0 * (y * z + x * w), 1.0 - 2.0 * (x * x + y * y)],
    ]
}

/// Knoten-Werte (TRS bzw. Matrix spaltenweise) → Lage-Feld des Teils. Matrix: Größe = Spaltenlängen, Spiegelung (det < 0) in
/// `groesseX`, Scherung geht verloren (Entscheidung).
pub fn knoten_lage(matrix: bool, v: &[f64; 16]) -> [f64; 9] {
    let (t, r, s) = if matrix {
        let c = [[v[0], v[1], v[2]], [v[4], v[5], v[6]], [v[8], v[9], v[10]]];
        let len = |a: [f64; 3]| libm::sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
        let mut s = [len(c[0]), len(c[1]), len(c[2])];
        let det = c[0][0] * (c[1][1] * c[2][2] - c[1][2] * c[2][1]) - c[1][0] * (c[0][1] * c[2][2] - c[0][2] * c[2][1])
            + c[2][0] * (c[0][1] * c[1][2] - c[0][2] * c[1][1]);
        if det < 0.0 {
            s[0] = -s[0];
        }
        let r = if s.iter().all(|x| libm::fabs(*x) > 1e-12) {
            let mut r = [[0.0; 3]; 3];
            for j in 0..3 {
                for i in 0..3 {
                    r[i][j] = c[j][i] / s[j];
                }
            }
            r
        } else {
            [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
        };
        ([v[12], v[13], v[14]], r, s)
    } else {
        ([v[0], v[1], v[2]], quat_matrix([v[3], v[4], v[5], v[6]]), [v[7], v[8], v[9]])
    };
    let (d, n, ro) = euler(r);
    [t[0], t[1], t[2], d, n, ro, s[0], s[1], s[2]]
}

/// Ergebnis der Prüfung (noch ohne Ressourcen).
pub struct Teig {
    pub netze: Vec<(Netz, Option<u32>, Option<Vec<u16>>)>,
    pub meshes: Vec<Vec<u32>>,
    pub bilder: Vec<crate::teigling::Geprueft>,
    pub bild_bytes: Vec<Vec<u8>>,
    pub materialien: Vec<MMaterial>,
    pub knoten: Vec<MKnoten>,
    pub lichter: Vec<MLicht>,
    pub haeute: Vec<MHaut>,
    pub folgen: Vec<MFolge>,
}

fn kein() -> crate::fehler::Fehler {
    fehler::modell(1, "ist kein lesbares Modell (glTF 2.0).")
}

/// Prüft einen Modellteig vollständig. Fehler-Teig → dessen Code und Text (63 …), ungültig → 63.
pub fn pruefe(t: &[u8]) -> Erg<Teig> {
    if t.len() < KOPF || t[..8] != MAGIE || u16::from_le_bytes([t[8], t[9]]) != VERSION || t[11] != 0 {
        return Err(kein());
    }
    if t[10] == 255 {
        let mut l = L { t, p: KOPF };
        let (code, n) = (l.u16().map_err(|_| kein())?, l.u16().map_err(|_| kein())? as usize);
        let text = l.bytes(n).ok().and_then(|b| core::str::from_utf8(b).ok());
        return match text {
            Some(s) if (1..=5).contains(&code) && l.p == t.len() => Err(fehler::modell(code as i32, s)),
            _ => Err(kein()),
        };
    }
    if t[10] != 0 {
        return Err(kein());
    }
    lies_teig(t).map_err(|_| kein())
}

fn lies_teig(t: &[u8]) -> R<Teig> {
    let mut l = L { t, p: KOPF };
    // Bilder (eingebettete Teiglinge)
    let n = l.anzahl(4 + 52)?;
    let mut bilder = Vec::with_capacity(n);
    let mut bild_bytes = Vec::with_capacity(n);
    for _ in 0..n {
        let len = l.u32()? as usize;
        let b = l.bytes(len)?;
        bilder.push(crate::teigling::pruefe(b).map_err(|_| ())?);
        bild_bytes.push(b.to_vec());
    }
    let nb = bilder.len();
    // Materialien
    let n = l.anzahl(70)?;
    let mut materialien = Vec::with_capacity(n);
    for _ in 0..n {
        let mut c = [0f64; 4];
        for x in c.iter_mut() {
            *x = l.f()?;
        }
        let (metall, rauheit) = (l.f()?, l.f()?);
        let le = [l.f()?, l.f()?, l.f()?];
        let (leucht_staerke, _normal, _schwelle) = (l.f()?, l.f()?, l.f()?);
        let (alpha, _beidseitig, wiederholen, _) = (l.u8()?, l.u8()?, l.u8()?, l.u8()?);
        if alpha > 2 {
            return Err(());
        }
        let (bild, relief, stoff, leucht_bild) = (l.i32(nb)?, l.i32(nb)?, l.i32(nb)?, l.i32(nb)?);
        let name = l.name()?;
        // deckend: Deckkraft 1 (glTF ignoriert dann Alpha)
        let a = if alpha == 0 { 1.0 } else { c[3] };
        let mut leuchten = le[0].max(le[1]).max(le[2]);
        leuchten = leuchten.clamp(0.0, 1.0);
        materialien.push(MMaterial {
            name,
            farbe: farbe(c[0], c[1], c[2], a),
            glanz: (1.0 - rauheit).clamp(0.0, 1.0),
            metall: metall.clamp(0.0, 1.0),
            leuchten,
            strahlen: if leuchten > 0.0 { leucht_staerke.clamp(0.0, 1000.0) } else { 1.0 },
            kachel: if wiederholen != 0 { 1.0 } else { 0.0 },
            bild,
            relief,
            stoff,
            leucht_bild,
        });
    }
    let nm = materialien.len();
    // Netze
    let n = l.anzahl(16)?;
    let mut netze = Vec::with_capacity(n);
    for _ in 0..n {
        let (ne, ni, flags) = (l.u32()? as usize, l.u32()? as usize, l.u32()?);
        let material = l.i32(nm)?;
        if flags > 3 || ni % 3 != 0 || ne > 500_000 || ni > 3_000_000 {
            return Err(());
        }
        let ecken = l.bytes(ne.checked_mul(32).ok_or(())?)?;
        let idx_b = l.bytes(ni * 4)?;
        let mut idx = Vec::with_capacity(ni);
        for k in 0..ni {
            let i = u32::from_le_bytes([idx_b[k * 4], idx_b[k * 4 + 1], idx_b[k * 4 + 2], idx_b[k * 4 + 3]]);
            if i as usize >= ne {
                return Err(());
            }
            idx.push(i);
        }
        let haut = if flags & 2 != 0 {
            let b = l.bytes(ne * 16)?;
            Some(b.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect())
        } else {
            None
        };
        let f = |k: usize| fin(f32::from_le_bytes([ecken[k * 4], ecken[k * 4 + 1], ecken[k * 4 + 2], ecken[k * 4 + 3]]));
        let netz = if flags & 1 != 0 {
            let mut p = Vec::with_capacity(ne * 3);
            let mut uv = Vec::with_capacity(ne * 2);
            for e in 0..ne {
                p.extend_from_slice(&[f(e * 8), f(e * 8 + 1), f(e * 8 + 2)]);
                uv.extend_from_slice(&[f(e * 8 + 6), f(e * 8 + 7)]);
            }
            crate::formen::netz_glatt(&p, &uv, &idx)
        } else {
            let mut b = Vec::with_capacity(ne * 32);
            let mut mi = V3::neu(f32::MAX, f32::MAX, f32::MAX);
            let mut ma = V3::neu(f32::MIN, f32::MIN, f32::MIN);
            for e in 0..ne {
                for k in 0..8 {
                    b.extend_from_slice(&f(e * 8 + k).to_le_bytes());
                }
                let p = V3::neu(f(e * 8), f(e * 8 + 1), f(e * 8 + 2));
                mi = mi.min(p);
                ma = ma.max(p);
            }
            if ne == 0 {
                mi = V3::default();
                ma = V3::default();
            }
            let mut ib = Vec::with_capacity(ni * 4);
            for &i in &idx {
                ib.extend_from_slice(&i.to_le_bytes());
            }
            Netz { ecken: b, indizes: ib, ecken_anzahl: ne as u32, index_anzahl: ni as u32, min: mi, max: ma }
        };
        netze.push((netz, material, haut));
    }
    let nn = netze.len();
    // Meshes
    let n = l.anzahl(4)?;
    let mut meshes = Vec::with_capacity(n);
    for _ in 0..n {
        let k = l.anzahl(4)?;
        let mut v = Vec::with_capacity(k);
        for _ in 0..k {
            let x = l.u32()?;
            if x as usize >= nn {
                return Err(());
            }
            v.push(x);
        }
        meshes.push(v);
    }
    // Knoten
    let n = l.anzahl(86)?;
    if n > 1024 {
        return Err(());
    }
    let mut knoten = Vec::with_capacity(n);
    let mut licht_idx = Vec::new();
    let mut haut_idx = Vec::new();
    for i in 0..n {
        let eltern = l.i32(i)?; // Eltern stehen in der Tiefensuche immer vorher
        let mesh = l.i32(meshes.len())?;
        let licht = l.i32(u32::MAX as usize >> 1)?;
        let haut = l.i32(u32::MAX as usize >> 1)?;
        let matrix = l.u32()?;
        if matrix > 1 {
            return Err(());
        }
        let mut v = [0f64; 16];
        for x in v.iter_mut() {
            *x = l.f()?;
        }
        let name = l.name()?;
        licht_idx.push(licht);
        haut_idx.push(haut);
        knoten.push(MKnoten { name, eltern, mesh, licht, haut, lage: knoten_lage(matrix == 1, &v) });
    }
    // Lichter
    let n = l.anzahl(34)?;
    let mut lichter = Vec::with_capacity(n);
    for _ in 0..n {
        let art = l.u8()?;
        l.bytes(3)?;
        if art > 2 {
            return Err(());
        }
        let (r, g, b) = (l.f()?, l.f()?, l.f()?);
        let (staerke, reichweite, innen, aussen) = (l.f()?.max(0.0), l.f()?.max(0.0), l.f()?, l.f()?);
        let _ = l.name()?;
        // Reichweite: `range` oder dort, wo die Beleuchtung I/d² auf 1/16 fällt (4 √I); Stärke so, dass (1 − d/r)² bei d = r/4
        // dieselbe Beleuchtung gibt wie I/d² (Entscheidung, Doku)
        let rw = if reichweite > 0.0 { reichweite } else { 4.0 * libm::sqrt(staerke) }.clamp(0.5, 1000.0);
        let st = (256.0 * staerke / (9.0 * rw * rw)).clamp(0.0, 100.0);
        let aussen_g = (aussen / GRAD).clamp(0.0, 90.0);
        let rand = if aussen > 0.0 { (1.0 - innen / aussen).clamp(0.0, 1.0) } else { 0.0 };
        lichter.push(MLicht { art, farbe: farbe(r, g, b, 1.0), staerke: st, reichweite: rw, kegel: if art == 1 { aussen_g } else { 0.0 }, kegel_rand: rand });
    }
    if licht_idx.iter().flatten().any(|&x| x as usize >= lichter.len()) {
        return Err(());
    }
    // Häute
    let n = l.anzahl(8)?;
    let mut haeute = Vec::with_capacity(n);
    for _ in 0..n {
        let g = l.anzahl(68)?;
        if g == 0 || g > 256 {
            return Err(());
        }
        let skelett = l.i32(knoten.len())?;
        let mut gelenke = Vec::with_capacity(g);
        for _ in 0..g {
            let x = l.u32()?;
            if x as usize >= knoten.len() {
                return Err(());
            }
            gelenke.push(x);
        }
        let mut ibm = Vec::with_capacity(g * 16);
        for _ in 0..g * 16 {
            ibm.push(l.f32()?);
        }
        haeute.push(MHaut { gelenke, skelett, ibm });
    }
    if haut_idx.iter().flatten().any(|&x| x as usize >= haeute.len()) {
        return Err(());
    }
    // Folgen
    let n = l.anzahl(6)?;
    let mut folgen = Vec::with_capacity(n);
    for _ in 0..n {
        let name = l.name()?;
        let k = l.anzahl(12)?;
        let mut kanaele = Vec::with_capacity(k);
        for _ in 0..k {
            let knoten_nr = l.u32()?;
            let (pfad, art) = (l.u8()?, l.u8()?);
            l.u16()?;
            let s = l.anzahl(4)?;
            if knoten_nr as usize >= knoten.len() || pfad > 2 || art > 1 {
                return Err(());
            }
            let breite = if pfad == 1 { 4 } else { 3 };
            let mut zeiten = Vec::with_capacity(s);
            for _ in 0..s {
                zeiten.push(l.f32()?);
            }
            let mut werte = Vec::with_capacity(s * breite);
            for _ in 0..s.checked_mul(breite).ok_or(())? {
                werte.push(l.f32()?);
            }
            kanaele.push(MKanal { knoten: knoten_nr, pfad, art, zeiten, werte });
        }
        folgen.push(MFolge { name, kanaele });
    }
    if l.p != t.len() {
        return Err(());
    }
    Ok(Teig { netze, meshes, bilder, bild_bytes, materialien, knoten, lichter, haeute, folgen })
}

/// Hülle der Ruhelage (relativ zur Wurzel) aus den Netz-Hüllen aller Knoten mit Mesh.
pub fn huelle(knoten: &[MKnoten], meshes: &[Vec<u32>], netze: &[(V3, V3)]) -> [f64; 6] {
    let mut welt: Vec<[f64; 12]> = Vec::with_capacity(knoten.len());
    let mut h = [f64::MAX, f64::MAX, f64::MAX, f64::MIN, f64::MIN, f64::MIN];
    let mut leer = true;
    for k in knoten {
        let lokal = crate::welt::lokal_3d(&k.lage);
        let m = match k.eltern {
            Some(e) => crate::welt::mal_3d(&welt[e as usize], &lokal),
            None => lokal,
        };
        if let Some(me) = k.mesh {
            for &ni in &meshes[me as usize] {
                let (a, b) = netze[ni as usize];
                for e in 0..8 {
                    let p = [if e & 1 == 0 { a.x } else { b.x } as f64, if e & 2 == 0 { a.y } else { b.y } as f64, if e & 4 == 0 { a.z } else { b.z } as f64];
                    for i in 0..3 {
                        let v = m[i * 4] * p[0] + m[i * 4 + 1] * p[1] + m[i * 4 + 2] * p[2] + m[i * 4 + 3];
                        h[i] = h[i].min(v);
                        h[i + 3] = h[i + 3].max(v);
                    }
                    leer = false;
                }
            }
        }
        welt.push(m);
    }
    if leer {
        [0.0; 6]
    } else {
        h
    }
}

