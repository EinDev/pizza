//! `Streu` (3D, H-K27): viele gleiche Kleinteile (Gras, Blumen, Steine) wie Unitys Terrain-Details – `anzahl` Punkte aus dem
//! Kern-Zufall im Rechteck `breite × tiefe` um die Lage des Teils, je Punkt eine Instanz der Form `form` mit dem Material des
//! `belag` (ohne: weiß, Glanz 0.3), aufrecht, um y zufällig gedreht (`drehen`), Größe `groesse` ± `groesseStreuung`. Mit
//! `gelaende` (Teil mit `Gelaende`) stehen die Punkte auf dessen Höhe (Dreiecksebene wie `gelaende::hoehe`), Punkte neben dem
//! Gelände und an Hängen steiler als `hang` Grad entfallen; `dichte` (Bildchen über die Fläche, Zeile 0 hinten bei −z):
//! Helligkeit · Deckkraft = Wahrscheinlichkeit, dass ein Punkt bleibt. Je Punkt werden immer 5 Zufallszahlen gezogen – eine
//! andere `dichte` oder ein anderer `hang` verschiebt die übrigen Punkte nicht.
//!
//! Takt-System: Punkte nur bei geänderten Eingaben neu (Prüfwert wie `Gelaende` über die Felder, die Welt-Matrix des Teils,
//! das Material des Belags sowie Prüfwert und Welt-Matrix des Geländes) – fertige Instanzen (INST3D + ZUSATZ3D + KARTEN3D) als
//! Ressource `STREU` in Zellen von 8 × 8 Einheiten, einmal übertragen; je Bild nur die sichtbaren Zellen (Abschnitt `STREU3D`:
//! Sichtkörper, `sichtweite`; ab der halben Sichtweite ausgedünnt – ein Anfangsstück jeder Zelle, die in Ziehreihenfolge liegt).
//! Ein Neubau überschreibt die eigene Ressource (neuer Stand, das Paket sendet erneut); eine Kopie teilt sie, bis sich ihre
//! Eingaben ändern. Rein sichtbar: keine Hülle, keine Kollision, kein `trifft`. Immer deckend (Deckkraft der Farbe zählt nicht,
//! Ausschnitt über `Belag.schwelle`); im Wind schwingen die Instanzen mit `Belag.wiegen`.

use alloc::vec::Vec;

use super::*;
use crate::hash::{PRIM, START};
use crate::paket::{put_f32, put_u32, zug, StreuB};
use crate::ressourcen::{StreuDaten, StreuZelle, TEXTUR_MARKE};
use crate::schema::{Feld, Genus, Raum, Schema};

pub const FORM: usize = 0;
pub const BELAG: usize = 1;
pub const ANZAHL: usize = 2;
pub const BREITE: usize = 3;
pub const TIEFE: usize = 4;
pub const GELAENDE: usize = 5;
pub const HANG: usize = 6;
pub const GROESSE: usize = 7;
pub const GROESSE_STREUUNG: usize = 8;
pub const DREHEN: usize = 9;
pub const DICHTE: usize = 10;
pub const SICHTWEITE: usize = 11;
pub const SCHATTEN: usize = 12;
pub const SAAT: usize = 13;
/// verborgen: ID der Streu-Ressource (0 = noch keine) und Prüfwert beim letzten Bau (untere/obere 32 Bit)
pub const STREU: usize = 14;
pub const PRUEF_LO: usize = 15;
pub const PRUEF_HI: usize = 16;

/// Kante einer Zelle (Einheiten)
pub const ZELLE: f64 = 8.0;
/// Bytes je Instanz in der Ressource: INST3D + ZUSATZ3D + KARTEN3D
pub const INSTANZ_BYTES: usize = crate::paket::INST3D_BYTES + crate::paket::ZUSATZ3D_BYTES + crate::paket::KARTEN3D_BYTES;

pub static ART: Art = Art {
    schema: Schema {
        name: "Streu",
        genus: Genus::F,
        raum: Raum::Drei,
        braucht: &[],
        felder: &[
            Feld::form("form"),
            Feld::teil("belag"),
            Feld::ganz("anzahl", 1000.0).bereich(0.0, 200000.0),
            Feld::zahl("breite", 20.0).bereich(0.0, 2048.0),
            Feld::zahl("tiefe", 20.0).bereich(0.0, 2048.0),
            Feld::teil("gelaende"),
            Feld::zahl("hang", 40.0).bereich(0.0, 90.0),
            Feld::zahl("groesse", 1.0).bereich(0.0, 1000.0),
            Feld::zahl("groesseStreuung", 0.3).bereich(0.0, 1.0),
            Feld::diavolo("drehen", true),
            Feld::bildchen("dichte"),
            Feld::zahl("sichtweite", 60.0).bereich(0.0, 100000.0),
            Feld::diavolo("schatten", false),
            Feld::ganz("saat", 0.0).bereich(0.0, 4294967295.0),
            Feld::intern("streu", 0.0),
            Feld::intern("pruefLo", 0.0),
            Feld::intern("pruefHi", 0.0),
        ],
    },
    takt: Some(takt),
    bild: Some(bild),
    ..Art::LEER
};

#[inline]
fn transf(m: &[f64; 12], p: [f64; 3]) -> [f64; 3] {
    [
        m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
        m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
        m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
    ]
}

/// Normale unter der 3 × 3 von `m` (Kofaktoren, wie im Shader)
fn normale(m: &[f64; 12], n: [f64; 3]) -> [f64; 3] {
    let c0 = [m[0], m[4], m[8]];
    let c1 = [m[1], m[5], m[9]];
    let c2 = [m[2], m[6], m[10]];
    let k = |a: [f64; 3], b: [f64; 3]| [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    let (a, b, c) = (k(c1, c2), k(c2, c0), k(c0, c1));
    [a[0] * n[0] + b[0] * n[1] + c[0] * n[2], a[1] * n[0] + b[1] * n[1] + c[1] * n[2], a[2] * n[0] + b[2] * n[1] + c[2] * n[2]]
}

/// Material-Vorlage: Bytes 48 … 71 einer INST3D (Farbe, Glanz, Leuchten, Atlas-Rechteck, Textur-Wort), ZUSATZ3D, KARTEN3D,
/// Zug-Merkmale. Deckkraft der Farbe 0 → `None` (zeichnet nichts).
fn vorlage(w: &Welt, belag: f64) -> Option<([u8; 24], [u32; 4], [u32; 4], u32)> {
    let (farbe, glanz, leuchten, bild, zusatz, karten) = super::belag::material(w, belag).unwrap_or((crate::farbe::WEISS, 0.3, 0.0, 0.0, [0; 4], [0; 4]));
    if farbe & 0xFF == 0 {
        return None;
    }
    let mut k = Vec::with_capacity(24);
    k.extend_from_slice(&(farbe | 0xFF).to_be_bytes());
    put_f32(&mut k, glanz);
    put_f32(&mut k, leuchten);
    let (uv, seite) = match w.ressourcen.bildchen(bild as u32) {
        Some(t) => ([t.x as u16, t.y as u16, (t.x + t.breite) as u16, (t.y + t.hoehe) as u16], t.seite as i64),
        None => ([0; 4], -1),
    };
    for x in uv {
        k.extend_from_slice(&x.to_le_bytes());
    }
    put_u32(&mut k, if seite < 0 {
        0
    } else if seite as u32 & TEXTUR_MARKE != 0 {
        (seite as u32 & 0xFFFF) | 1 << 16 | 1 << 17
    } else {
        (seite as u32 & 0xFFFF) | 1 << 16
    });
    // einseitig wie `Koerper3::seiten` (Instanzen sind nie gespiegelt)
    let merkmale = if karten == [0; 4] || karten[1] & 1 << 24 != 0 { 0 } else { zug::EINSEITIG };
    let mut kopf = [0u8; 24];
    kopf.copy_from_slice(&k);
    Some((kopf, zusatz, karten, merkmale))
}

/// Prüfwert der Eingaben (FNV-1a je 64-Bit-Wort).
fn pruefwert(s: &Speicher, z: usize, m: &[f64; 12], v: &Option<([u8; 24], [u32; 4], [u32; 4], u32)>, gel: Option<([f64; 12], f64, f64)>) -> u64 {
    let mut h = START;
    let mut mische = |x: u64| {
        h ^= x;
        h = h.wrapping_mul(PRIM);
    };
    for f in [FORM, BELAG, ANZAHL, BREITE, TIEFE, GELAENDE, HANG, GROESSE, GROESSE_STREUUNG, DREHEN, DICHTE, SAAT] {
        mische(s.zahl(f)[z].to_bits());
    }
    if s.zahl(SAAT)[z] == 0.0 {
        mische(s.teil[z] as u64);
    }
    for x in m {
        mische(x.to_bits());
    }
    match v {
        Some((k, zu, ka, me)) => {
            for c in k.chunks_exact(8) {
                mische(u64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]]));
            }
            for x in zu.iter().chain(ka.iter()) {
                mische(*x as u64);
            }
            mische(*me as u64 | 1 << 40);
        }
        None => mische(0),
    }
    if let Some((g, lo, hi)) = gel {
        for x in g {
            mische(x.to_bits());
        }
        mische(lo.to_bits());
        mische(hi.to_bits());
    }
    h
}

/// Gelände zur Streu: (Zeile des Teils, Zeile der `Gelaende`-Komponente).
fn gelaende_von(w: &Welt, teil: f64) -> Option<(usize, usize)> {
    if teil == 0.0 {
        return None;
    }
    let a = w.art_index(super::gelaende::ART.schema.name)?;
    let gz = w.zeile_opt(teil as u32)?;
    Some((gz, w.komp_zeile(gz, a)?))
}

/// System: Punkte neu, wenn sich die Eingaben seit dem letzten Bau geändert haben (oder noch keine da sind). Läuft wie
/// `Gelaende` auch in ruhenden Teilen (reiner Cache der eigenen Eingaben – Kopien teilen die Ressource).
fn takt(w: &mut Welt, s: &mut Speicher) {
    for z in 0..s.len() {
        let teil = s.teil[z];
        if teil == 0 {
            continue;
        }
        let Some(tz) = w.zeile_opt(teil) else { continue };
        w.aktualisiere(tz);
        let gel = gelaende_von(w, s.zahl(GELAENDE)[z]);
        if let Some((gz, _)) = gel {
            w.aktualisiere(gz);
        }
        let ga = w.art_index(super::gelaende::ART.schema.name);
        let gel_pruef = gel.map(|(gz, kz)| {
            let gs = &w.speicher[ga.unwrap()];
            (w.teile.welt[gz], gs.zahl(super::gelaende::PRUEF_LO)[kz] + gs.zahl(super::gelaende::NETZ)[kz] * 4294967296.0, gs.zahl(super::gelaende::PRUEF_HI)[kz])
        });
        let m = w.teile.welt[tz];
        let v = vorlage(w, s.zahl(BELAG)[z]);
        let p = pruefwert(s, z, &m, &v, gel_pruef);
        let (lo, hi) = ((p & 0xFFFF_FFFF) as f64, (p >> 32) as f64);
        if s.zahl(STREU)[z] != 0.0 && s.zahl(PRUEF_LO)[z] == lo && s.zahl(PRUEF_HI)[z] == hi {
            continue;
        }
        let daten = erzeuge(w, s, z, &m, gel, &v);
        // eigene, nicht geteilte Ressource überschreiben, sonst eine neue anlegen
        let alt = s.zahl(STREU)[z] as u32;
        let geteilt = alt != 0 && (0..s.len()).any(|k| k != z && s.zahl(STREU)[k] as u32 == alt);
        let res = &mut w.ressourcen;
        res.hash.u8(3);
        res.hash.u32(daten.anzahl);
        res.hash.bytes(&daten.daten);
        let id = match res.streu.get_mut((alt as usize).wrapping_sub(1)) {
            Some(r) if !geteilt && r.besitzer == teil => {
                let stand = r.stand + 1;
                *r = StreuDaten { stand, ..daten };
                alt
            }
            _ => {
                res.streu.push(StreuDaten { stand: 1, ..daten });
                res.streu.len() as u32
            }
        };
        s.zahl_mut(STREU)[z] = id as f64;
        s.zahl_mut(PRUEF_LO)[z] = lo;
        s.zahl_mut(PRUEF_HI)[z] = hi;
    }
}

/// Zieht die Punkte und baut die Instanzen, nach Zellen geordnet.
fn erzeuge(w: &Welt, s: &Speicher, z: usize, m: &[f64; 12], gel: Option<(usize, usize)>, v: &Option<([u8; 24], [u32; 4], [u32; 4], u32)>) -> StreuDaten {
    let teil = s.teil[z];
    let leer = StreuDaten { besitzer: teil, ..StreuDaten::default() };
    let Some((kopf, zusatz, karten, merkmale)) = v else { return leer };
    let n = s.zahl(ANZAHL)[z] as u32;
    let (b, t) = (s.zahl(BREITE)[z], s.zahl(TIEFE)[z]);
    if n == 0 || !(b > 0.0) || !(t > 0.0) {
        return leer;
    }
    let (g0, gs) = (s.zahl(GROESSE)[z], s.zahl(GROESSE_STREUUNG)[z]);
    let drehen = s.zahl(DREHEN)[z] != 0.0;
    let hang = s.zahl(HANG)[z];
    let cos_hang = libm::cos(hang * crate::welt::GRAD);
    let saat = s.zahl(SAAT)[z];
    let mut zst: u32 = if saat == 0.0 { teil } else { saat as u32 };
    let nx = (libm::ceil(b / ZELLE) as u32).max(1);
    let nz = (libm::ceil(t / ZELLE) as u32).max(1);
    let dichte = w.ressourcen.bildchen(s.zahl(DICHTE)[z] as u32).filter(|d| d.breite > 0 && d.hoehe > 0 && d.rgba.len() >= (d.breite * d.hoehe * 4) as usize);
    // Gelände: Höhen, Raster, Welt-Matrix und ihre Inverse
    let gs_art = w.art_index(super::gelaende::ART.schema.name);
    let gelaende = gel.and_then(|(gz, kz)| {
        let gsp = &w.speicher[gs_art?];
        let g = w.teile.welt[gz];
        let inv = crate::kollision3d::invers(&g)?;
        Some((&gsp.puffer(super::gelaende::HOEHEN)[kz], gsp.zahl(super::gelaende::SPALTEN)[kz] as u32, gsp.zahl(super::gelaende::ZEILEN)[kz] as u32, gsp.zahl(super::gelaende::WEITE)[kz], g, inv))
    });
    if gel.is_some() && gelaende.is_none() {
        return leer;
    }
    // (Zelle, Lage, Größe, cos, sin) in Ziehreihenfolge, dann stabil nach Zelle sortiert
    let mut punkte: Vec<(u32, [f64; 3], f64, f64, f64)> = Vec::with_capacity(n as usize);
    for _ in 0..n {
        let r1 = super::partikel::zufall(&mut zst);
        let r2 = super::partikel::zufall(&mut zst);
        let r3 = super::partikel::zufall(&mut zst);
        let r4 = super::partikel::zufall(&mut zst);
        let r5 = super::partikel::zufall(&mut zst);
        if let Some(d) = dichte {
            let px = ((r1 * d.breite as f64) as u32).min(d.breite - 1);
            let py = ((r2 * d.hoehe as f64) as u32).min(d.hoehe - 1);
            let o = ((py * d.breite + px) * 4) as usize;
            let c = &d.rgba[o..o + 4];
            let p = (c[0] as f64 + c[1] as f64 + c[2] as f64) / 765.0 * (c[3] as f64 / 255.0);
            if r3 >= p {
                continue;
            }
        }
        let (lx, lz) = ((r1 - 0.5) * b, (r2 - 0.5) * t);
        let mut pw = transf(m, [lx, 0.0, lz]);
        if let Some((hoehen, sp, ze, we, g, inv)) = &gelaende {
            let q = transf(inv, pw);
            let Some((y, nl)) = super::gelaende::ebene(hoehen, *sp, *ze, *we, q[0], q[2]) else { continue };
            pw = transf(g, [q[0], y, q[2]]);
            if hang < 90.0 {
                let nw = normale(g, nl);
                let l = libm::sqrt(nw[0] * nw[0] + nw[1] * nw[1] + nw[2] * nw[2]);
                if !(l > 0.0) || nw[1] / l < cos_hang {
                    continue;
                }
            }
        }
        let gr = g0 * (1.0 + gs * (2.0 * r4 - 1.0));
        if !(gr > 0.0) {
            continue;
        }
        let (c, sn) = if drehen {
            let a = r5 * 2.0 * core::f64::consts::PI;
            (libm::cos(a), libm::sin(a))
        } else {
            (1.0, 0.0)
        };
        let ci = (((lx / b + 0.5) * nx as f64) as u32).min(nx - 1);
        let cj = (((lz / t + 0.5) * nz as f64) as u32).min(nz - 1);
        punkte.push((cj * nx + ci, pw, gr, c, sn));
    }
    punkte.sort_by_key(|p| p.0);
    // Netz-Kasten fürs Culling (ohne Netz: Einheitswürfel)
    let (mn, mx) = match w.ressourcen.netz(s.zahl(FORM)[z] as u32) {
        Some(nz) => ([nz.min.x as f64, nz.min.y as f64, nz.min.z as f64], [nz.max.x as f64, nz.max.y as f64, nz.max.z as f64]),
        None => ([-0.5; 3], [0.5; 3]),
    };
    let quer = [mn[0], mx[0], mn[2], mx[2]].iter().fold(0.0f64, |a, &x| if betrag(x) > a { betrag(x) } else { a }) * core::f64::consts::SQRT_2;
    let anzahl = punkte.len();
    let mut daten = Vec::with_capacity(anzahl * INSTANZ_BYTES);
    let mut zellen: Vec<StreuZelle> = Vec::new();
    for (i, &(zelle, p, gr, c, sn)) in punkte.iter().enumerate() {
        for x in [c * gr, 0.0, sn * gr, p[0], 0.0, gr, 0.0, p[1], -sn * gr, 0.0, c * gr, p[2]] {
            put_f32(&mut daten, x);
        }
        daten.extend_from_slice(kopf);
        let lo = [p[0] - quer * gr, p[1] + mn[1] * gr, p[2] - quer * gr];
        let hi = [p[0] + quer * gr, p[1] + mx[1] * gr, p[2] + quer * gr];
        match zellen.last_mut() {
            Some(zl) if zl.nummer == zelle => {
                zl.anzahl += 1;
                for a in 0..3 {
                    if lo[a] < zl.min[a] {
                        zl.min[a] = lo[a];
                    }
                    if hi[a] > zl.max[a] {
                        zl.max[a] = hi[a];
                    }
                }
            }
            _ => zellen.push(StreuZelle { erste: i as u32, anzahl: 1, min: lo, max: hi, nummer: zelle }),
        }
    }
    for _ in 0..anzahl {
        for x in zusatz {
            put_u32(&mut daten, *x);
        }
    }
    for _ in 0..anzahl {
        for x in karten {
            put_u32(&mut daten, *x);
        }
    }
    StreuDaten { besitzer: teil, stand: 0, anzahl: anzahl as u32, merkmale: *merkmale, daten, zellen }
}

fn bild(w: &Welt, s: &Speicher, b: &mut Bildbau) {
    for z in 0..s.len() {
        if sichtbar(w, s.teil[z]).is_none() {
            continue;
        }
        let id = s.zahl(STREU)[z] as u32;
        let Some(r) = w.ressourcen.streu.get((id as usize).wrapping_sub(1)) else { continue };
        let netz = s.zahl(FORM)[z] as u32;
        match w.ressourcen.netz(netz) {
            Some(n) if n.index_anzahl > 0 && r.anzahl > 0 => {}
            _ => continue,
        }
        b.streu.push(StreuB { teil: s.teil[z], id, netz, sichtweite: s.zahl(SICHTWEITE)[z], schatten: s.zahl(SCHATTEN)[z] != 0.0 });
    }
}
