//! 3D: Kamera, Licht, Sonnenschatten (Lichtkamera deterministisch aus Kamerafrustum und Szene), Nebel, Himmel,
//! Instanzen (undurchsichtige gebündelt, durchsichtige von hinten nach vorn).

use alloc::collections::BTreeMap;
use alloc::vec::Vec;

use crate::formen::Netz;
use crate::lesen::{Befehl, Zeichne};
use crate::liste::{durchgang, textur, Schreibe, Zug, SZENE_BYTES};
use crate::mathe::*;

/// Kantenlänge der Shadow-Map in Texeln.
pub const SCHATTEN_GROESSE: u32 = 2048;
/// Höchstzahl Punktlichter je Bild.
pub const MAX_LICHTER: usize = 8;
/// Weiteste Entfernung (Welt-Einheiten), bis zu der die Sonne Schatten wirft.
pub const SCHATTEN_WEITE: f32 = 80.0;

pub const HIMMEL_STANDARD: [u8; 4] = [0x8E, 0xC9, 0xF0, 0xFF];
pub const MOZZARELLA: [u8; 4] = [0xFF, 0xF6, 0xE0, 0xFF];

#[derive(Clone, Copy)]
struct Licht {
    pos: V3,
    farbe: [u8; 4],
    reichweite: f32,
}

/// Gesammelte 3D-Befehle eines Bildes (letzter Aufruf zählt; Lichter in Reihenfolge, höchstens 8).
#[derive(Default)]
pub struct Sammlung<'a> {
    pub vorhanden: bool,
    kamera: Option<(V3, V3, f32)>,
    himmel: Option<([u8; 4], [u8; 4])>,
    sonne: Option<(V3, [u8; 4], f32, bool)>,
    lichter: Vec<Licht>,
    umgebung: Option<([u8; 4], f32)>,
    nebel: Option<([u8; 4], f32, f32)>,
    zeichne: Vec<&'a Zeichne>,
}

impl<'a> Sammlung<'a> {
    /// Nimmt einen 3D-Befehl auf; `false` für 2D-Befehle.
    pub fn nimm(&mut self, b: &'a Befehl) -> bool {
        match b {
            Befehl::Kamera { x, y, z, zx, zy, zz, sicht } => {
                self.kamera = Some((V3::neu(*x, *y, *z), V3::neu(*zx, *zy, *zz), *sicht))
            }
            Befehl::Himmel(o, u) => self.himmel = Some((*o, *u)),
            Befehl::Sonne { x, y, z, farbe, staerke, schatten } => {
                self.sonne = Some((V3::neu(*x, *y, *z), *farbe, *staerke, *schatten))
            }
            Befehl::Licht { x, y, z, farbe, reichweite } => {
                if self.lichter.len() < MAX_LICHTER {
                    self.lichter.push(Licht { pos: V3::neu(*x, *y, *z), farbe: *farbe, reichweite: *reichweite });
                }
            }
            Befehl::Umgebung(f, s) => self.umgebung = Some((*f, *s)),
            Befehl::Nebel(f, v, b) => self.nebel = Some((*f, *v, *b)),
            Befehl::Zeichne(z) => self.zeichne.push(z),
            _ => return false,
        }
        self.vorhanden = true;
        true
    }
}

pub struct Ergebnis {
    pub szene: Vec<u8>,
    pub instanzen: Vec<u8>,
    pub zuege: Vec<Zug>,
    pub schatten: bool,
}

struct Inst {
    netz: u32,
    textur: u32,
    modell: M4,
    farbe: [f32; 4],
    material: [f32; 4],
    min: V3,
    max: V3,
    mitte: V3,
    reihe: usize,
}

fn lin(c: [u8; 4]) -> [f32; 3] {
    [srgb_linear(c[0]), srgb_linear(c[1]), srgb_linear(c[2])]
}

fn ecken_box(mi: V3, ma: V3) -> [V3; 8] {
    let mut e = [V3::default(); 8];
    for (k, p) in e.iter_mut().enumerate() {
        *p = V3::neu(
            if k & 1 == 0 { mi.x } else { ma.x },
            if k & 2 == 0 { mi.y } else { ma.y },
            if k & 4 == 0 { mi.z } else { ma.z },
        );
    }
    e
}

/// Baut Uniforms, Instanzen und 3D-Zeichenzüge. `seiten` = Breite/Höhe des Spielfelds, `hg` = gesetzter Hintergrund.
pub fn baue(
    s: &Sammlung,
    netze: &BTreeMap<u32, Netz>,
    hat_textur: impl Fn(u32) -> bool,
    seiten: f32,
    hg: Option<[u8; 4]>,
) -> Ergebnis {
    // ---- Kamera ----
    let (auge, ziel, sicht) = s.kamera.unwrap_or((V3::neu(0.0, 3.0, 8.0), V3::default(), 60.0));
    let sicht = klemme(if sicht == 0.0 { 60.0 } else { sicht }, 1.0, 170.0);
    let ansicht = M4::blick(auge, ziel, V3::neu(0.0, 1.0, 0.0));
    let blick = ziel.minus(auge).norm_oder(V3::neu(0.0, 0.0, -1.0));

    // ---- Instanzen ----
    let mut inst: Vec<Inst> = Vec::new();
    for (reihe, z) in s.zeichne.iter().enumerate() {
        let Some(n) = netze.get(&z.form) else { continue };
        if z.farbe[3] == 0 || n.index_anzahl == 0 {
            continue;
        }
        let m = M4::verschiebung(V3::neu(z.pos[0], z.pos[1], z.pos[2]))
            .mal(&M4::dreh_y(bogen(z.drehung)))
            .mal(&M4::dreh_x(bogen(z.neigung)))
            .mal(&M4::dreh_z(bogen(z.rollen)))
            .mal(&M4::skalierung(V3::neu(z.groesse[0], z.groesse[1], z.groesse[2])));
        let mut mi = V3::neu(f32::MAX, f32::MAX, f32::MAX);
        let mut ma = V3::neu(f32::MIN, f32::MIN, f32::MIN);
        for e in ecken_box(n.min, n.max) {
            let p = m.punkt(e);
            mi = mi.min(p);
            ma = ma.max(p);
        }
        let mit_textur = z.bildchen != 0 && hat_textur(z.bildchen);
        let l = lin(z.farbe);
        inst.push(Inst {
            netz: z.form,
            textur: if mit_textur { z.bildchen } else { textur::WEISS },
            modell: m,
            farbe: [l[0], l[1], l[2], z.farbe[3] as f32 / 255.0],
            material: [klemme(z.glanz, 0.0, 1.0), klemme(z.leuchten, 0.0, 1.0), if mit_textur { 1.0 } else { 0.0 }, 0.0],
            min: mi,
            max: ma,
            mitte: mi.plus(ma).mal(0.5),
            reihe,
        });
    }

    // ---- Nah/Fern aus der Szene ----
    let mut weiteste = 0.0f32;
    for i in &inst {
        for e in ecken_box(i.min, i.max) {
            weiteste = max(weiteste, e.minus(auge).laenge());
        }
    }
    let fern = klemme(weiteste * 1.1 + 1.0, 10.0, 100_000.0);
    let nah = max(0.05, fern / 20_000.0);
    let proj = M4::perspektive(bogen(sicht), seiten, nah, fern);
    let ansicht_proj = proj.mal(&ansicht);

    // ---- Licht ----
    let (sonne_dir, sonne_farbe, sonne_staerke, sonne_schatten) =
        s.sonne.unwrap_or((V3::neu(0.5, 1.0, 0.3), [255, 255, 255, 255], 1.0, true));
    let l = sonne_dir.norm_oder(V3::neu(0.5, 1.0, 0.3).norm_oder(V3::neu(0.0, 1.0, 0.0)));
    let (himmel_o, himmel_u) = match (s.himmel, hg) {
        (Some(h), _) => h,
        (None, Some(c)) => (c, c),
        (None, None) => (HIMMEL_STANDARD, MOZZARELLA),
    };
    let (umg_farbe, umg_staerke) = s.umgebung.unwrap_or((himmel_o, 0.35));

    // ---- Sortieren ----
    let mut fest: Vec<&Inst> = inst.iter().filter(|i| i.farbe[3] >= 1.0).collect();
    fest.sort_by(|a, b| (a.netz, a.textur, a.reihe).cmp(&(b.netz, b.textur, b.reihe)));
    let mut durch: Vec<(u32, &Inst)> = inst
        .iter()
        .filter(|i| i.farbe[3] < 1.0)
        .map(|i| {
            // Tiefe entlang der Blickrichtung als ordnungstreue Bits (größer = weiter weg)
            let t = fin(i.mitte.minus(auge).punkt(blick));
            let bits = t.to_bits();
            let key = if bits & 0x8000_0000 != 0 { !bits } else { bits | 0x8000_0000 };
            (key, i)
        })
        .collect();
    durch.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.reihe.cmp(&b.1.reihe)));

    // ---- Sonnenschatten ----
    let mut licht_proj = M4::EINS;
    let mut schatten = false;
    let mut texel_welt = 0.0f32;
    let mut tiefe_spanne = 1.0f32;
    if sonne_schatten && sonne_staerke > 0.0 && !fest.is_empty() {
        let oben = if betrag(l.y) > 0.99 { V3::neu(0.0, 0.0, 1.0) } else { V3::neu(0.0, 1.0, 0.0) };
        let lv = M4::blick(V3::default(), l.mal(-1.0), oben);
        let mut bmin = V3::neu(f32::MAX, f32::MAX, f32::MAX);
        let mut bmax = V3::neu(f32::MIN, f32::MIN, f32::MIN);
        for i in &fest {
            bmin = bmin.min(i.min);
            bmax = bmax.max(i.max);
        }
        // Szene im Lichtraum
        let mut smin = V3::neu(f32::MAX, f32::MAX, f32::MAX);
        let mut smax = V3::neu(f32::MIN, f32::MIN, f32::MIN);
        let mut d = 0.0f32;
        for e in ecken_box(bmin, bmax) {
            let p = lv.punkt(e);
            smin = smin.min(p);
            smax = smax.max(p);
            d = max(d, e.minus(auge).laenge());
        }
        // Kamerafrustum bis zur Schattenweite
        let mut d = min(d, SCHATTEN_WEITE);
        if let Some((_, _, bis)) = s.nebel {
            if bis > 0.0 {
                d = min(d, bis);
            }
        }
        let d = max(d, nah + 0.1);
        let rechts = blick.kreuz(V3::neu(0.0, 1.0, 0.0)).norm_oder(V3::neu(1.0, 0.0, 0.0));
        let hoch = rechts.kreuz(blick);
        let th = tan(bogen(sicht) * 0.5);
        let mut fmin = V3::neu(f32::MAX, f32::MAX, f32::MAX);
        let mut fmax = V3::neu(f32::MIN, f32::MIN, f32::MIN);
        for z in [nah, d] {
            let (hh, hb) = (th * z, th * z * seiten);
            for (sx, sy) in [(-1.0f32, -1.0f32), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)] {
                let p = auge.plus(blick.mal(z)).plus(rechts.mal(hb * sx)).plus(hoch.mal(hh * sy));
                let q = lv.punkt(p);
                fmin = fmin.min(q);
                fmax = fmax.max(q);
            }
        }
        let x0 = max(smin.x, fmin.x);
        let x1 = min(smax.x, fmax.x);
        let y0 = max(smin.y, fmin.y);
        let y1 = min(smax.y, fmax.y);
        if x1 > x0 && y1 > y0 {
            let groesse = max(max(x1 - x0, y1 - y0) * 1.04, 0.01);
            let s_ = exp2(decke(log2(groesse) * 4.0) / 4.0);
            let texel = s_ / SCHATTEN_GROESSE as f32;
            let cx = boden((x0 + x1) * 0.5 / texel) * texel;
            let cy = boden((y0 + y1) * 0.5 / texel) * texel;
            let rand = max((smax.z - smin.z) * 0.01, 0.05);
            let nah_l = -smax.z - rand;
            let fern_l = -smin.z + rand;
            let p = M4::ortho(cx - s_ * 0.5, cx + s_ * 0.5, cy - s_ * 0.5, cy + s_ * 0.5, nah_l, fern_l);
            licht_proj = p.mal(&lv);
            schatten = true;
            texel_welt = texel;
            tiefe_spanne = fern_l - nah_l;
        }
    }

    // ---- Uniform-Block Szene ----
    let mut u: Vec<u8> = Vec::with_capacity(SZENE_BYTES);
    u.f32s(&ansicht_proj.m);
    u.f32s(&licht_proj.m);
    u.f32s(&[auge.x, auge.y, auge.z, 0.0]);
    u.f32s(&[l.x, l.y, l.z, if schatten { 1.0 } else { 0.0 }]);
    let sf = lin(sonne_farbe);
    let st = max(sonne_staerke, 0.0);
    u.f32s(&[sf[0] * st, sf[1] * st, sf[2] * st, 0.0]);
    let uf = lin(umg_farbe);
    let us = max(umg_staerke, 0.0);
    u.f32s(&[uf[0] * us, uf[1] * us, uf[2] * us, 0.0]);
    u.f32s(&[uf[0] * us * 0.45, uf[1] * us * 0.42, uf[2] * us * 0.38, 0.0]);
    match s.nebel {
        Some((f, von, bis)) if bis > von => {
            let nf = lin(f);
            u.f32s(&[nf[0], nf[1], nf[2], 1.0]);
            u.f32s(&[von, bis, 1.0 / (bis - von), 0.0]);
        }
        _ => {
            u.f32s(&[0.0, 0.0, 0.0, 0.0]);
            u.f32s(&[0.0, 0.0, 0.0, 0.0]);
        }
    }
    let ho = lin(himmel_o);
    let hu = lin(himmel_u);
    u.f32s(&[ho[0], ho[1], ho[2], 1.0]);
    u.f32s(&[hu[0], hu[1], hu[2], 1.0]);
    // Schatten: Texelgröße (UV), Normalenversatz (Welt), Tiefen-Bias (NDC), Texel (Welt)
    let bias = if schatten { texel_welt * 1.0 / tiefe_spanne } else { 0.0 };
    u.f32s(&[1.0 / SCHATTEN_GROESSE as f32, texel_welt * 1.6, bias, texel_welt]);
    u.f32s(&[s.lichter.len() as f32, 0.0, 0.0, 0.0]);
    for k in 0..MAX_LICHTER {
        match s.lichter.get(k) {
            Some(li) => u.f32s(&[li.pos.x, li.pos.y, li.pos.z, max(li.reichweite, 0.0)]),
            None => u.f32s(&[0.0; 4]),
        }
    }
    for k in 0..MAX_LICHTER {
        match s.lichter.get(k) {
            Some(li) => {
                let c = lin(li.farbe);
                u.f32s(&[c[0], c[1], c[2], 0.0]);
            }
            None => u.f32s(&[0.0; 4]),
        }
    }
    debug_assert_eq!(u.len(), SZENE_BYTES);

    // ---- Instanzen und Züge ----
    let mut instanzen: Vec<u8> = Vec::with_capacity(inst.len() * crate::liste::INSTANZ_BYTES);
    let schreib = |b: &mut Vec<u8>, i: &Inst| {
        b.f32s(&i.modell.m);
        for v in i.modell.normalen_matrix() {
            b.f32s(&[v.x, v.y, v.z, 0.0]);
        }
        b.f32s(&i.farbe);
        b.f32s(&i.material);
    };
    let mut buendel: Vec<Zug> = Vec::new();
    for (k, i) in fest.iter().enumerate() {
        schreib(&mut instanzen, i);
        let n = netze.get(&i.netz).map(|n| n.index_anzahl).unwrap_or(0);
        match buendel.last_mut() {
            Some(z) if z.netz == i.netz && z.textur == i.textur => z.instanz_anzahl += 1,
            _ => buendel.push(Zug {
                durchgang: durchgang::UNDURCHSICHTIG,
                netz: i.netz,
                textur: i.textur,
                erster_index: 0,
                index_anzahl: n,
                erste_instanz: k as u32,
                instanz_anzahl: 1,
                seiten: 0,
            }),
        }
    }
    let mut zuege = Vec::new();
    if schatten {
        for z in &buendel {
            zuege.push(Zug { durchgang: durchgang::SCHATTEN, ..*z });
        }
    }
    zuege.push(Zug {
        durchgang: durchgang::HIMMEL,
        netz: 0,
        textur: textur::WEISS,
        erster_index: 0,
        index_anzahl: 3,
        erste_instanz: 0,
        instanz_anzahl: 1,
        seiten: 0,
    });
    zuege.extend_from_slice(&buendel);
    let basis = fest.len() as u32;
    for (k, (_, i)) in durch.iter().enumerate() {
        schreib(&mut instanzen, i);
        let n = netze.get(&i.netz).map(|n| n.index_anzahl).unwrap_or(0);
        for seite in [1u32, 2] {
            zuege.push(Zug {
                durchgang: durchgang::DURCHSICHTIG,
                netz: i.netz,
                textur: i.textur,
                erster_index: 0,
                index_anzahl: n,
                erste_instanz: basis + k as u32,
                instanz_anzahl: 1,
                seiten: seite,
            });
        }
    }
    Ergebnis { szene: u, instanzen, zuege, schatten }
}
