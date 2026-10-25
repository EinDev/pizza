//! Tests des Modell-Vorbackers (H-K16): Testmodelle aus `scripts/modelle-test.js` (eingecheckt unter `testmodelle/`), jede
//! unterstützte Art, jede Fehlerart, goldene Modellteige (`golden-modelle.txt`, dieselbe Liste prüft `node herd/test-teigling.js`
//! gegen `teigling.wasm`) und Fuzz-Läufe (verdorbene Quellen brechen nie ab).

use crate::gltf::{self, MFehler};
use crate::modell::{self, lies_kopf};
use alloc::string::String;
use alloc::vec::Vec;

macro_rules! tm {
    ($n:literal) => {
        include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/testmodelle/", $n)) as &[u8]
    };
}

/// (Name, Hauptdatei, Dateien des Ordners für `.gltf`)
pub fn testmodelle() -> Vec<(&'static str, &'static [u8])> {
    alloc::vec![
        ("wuerfel.glb", tm!("wuerfel.glb")),
        ("hierarchie.glb", tm!("hierarchie.glb")),
        ("textur.gltf", tm!("textur.gltf")),
        ("textur-eingebettet.gltf", tm!("textur-eingebettet.gltf")),
        ("farben.glb", tm!("farben.glb")),
        ("haut.glb", tm!("haut.glb")),
        ("folge.glb", tm!("folge.glb")),
        ("quant.glb", tm!("quant.glb")),
        ("figur.glb", tm!("figur.glb")),
        ("fehler-draco.glb", tm!("fehler-draco.glb")),
        ("fehler-kaputt.glb", tm!("fehler-kaputt.glb")),
        ("fehler-zu-gross.glb", tm!("fehler-zu-gross.glb")),
        ("fehler-bild-kaputt.glb", tm!("fehler-bild-kaputt.glb")),
        ("fehler-bild-zu-gross.glb", tm!("fehler-bild-zu-gross.glb")),
        ("fehler-fehlt.gltf", tm!("fehler-fehlt.gltf")),
    ]
}

/// Dateien neben den Testmodellen (für `.gltf`)
fn nebendatei(pfad: &str) -> Option<&'static [u8]> {
    Some(match pfad {
        "textur.bin" => tm!("textur.bin"),
        "bilder/farbe.png" => tm!("bilder/farbe.png"),
        "bilder/normale.png" => tm!("bilder/normale.png"),
        "bilder/mr.png" => tm!("bilder/mr.png"),
        "bilder/oc.png" => tm!("bilder/oc.png"),
        "bilder/leucht.png" => tm!("bilder/leucht.png"),
        _ => return None,
    })
}

/// Quellpaket wie die JS-Hülle es baut: `braucht` → vorhandene Dateien in dieser Reihenfolge.
pub fn paket_fuer(name: &str, haupt: &[u8], hole: &dyn Fn(&str) -> Option<Vec<u8>>) -> Vec<u8> {
    let br = gltf::braucht(name, haupt);
    let daten: Vec<(String, Vec<u8>)> = br.into_iter().filter_map(|(u, p)| hole(&p).map(|b| (u, b))).collect();
    let refs: Vec<(&str, &[u8])> = daten.iter().map(|(u, b)| (u.as_str(), b.as_slice())).collect();
    gltf::quellpaket(haupt, &refs)
}

fn paket(name: &str, haupt: &[u8]) -> Vec<u8> {
    paket_fuer(name, haupt, &|p| nebendatei(p).map(|b| b.to_vec()))
}

fn lies(name: &str) -> Result<gltf::Modell, MFehler> {
    let h = testmodelle().into_iter().find(|t| t.0 == name).unwrap().1;
    gltf::lies(&paket(name, h))
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| alloc::format!("{:02x}", x)).collect()
}

#[test]
fn wuerfel() {
    let m = lies("wuerfel.glb").unwrap();
    assert_eq!((m.netze.len(), m.knoten.len(), m.materialien.len(), m.bilder.len()), (1, 1, 1, 0));
    let n = &m.netze[0];
    assert_eq!((n.pos.len() / 3, n.idx.len() / 3), (24, 12));
    assert!(n.nor.is_some());
    assert_eq!(m.materialien[0].name, "Tomate");
    assert_eq!(m.materialien[0].farbe, [0.8, 0.1, 0.05, 1.0]);
    assert_eq!((m.materialien[0].metall, m.materialien[0].rauheit), (0.0, 0.5));
    assert_eq!(m.knoten[0].name, "Wuerfel");
    assert_eq!(m.knoten[0].werte[..10], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0]);
    let t = modell::vorbacken(tm!("wuerfel.glb"));
    let k = lies_kopf(&t).unwrap();
    assert_eq!((k.ecken, k.dreiecke, k.knoten, k.netze, k.materialien, k.bilder), (24, 12, 1, 1, 1, 0));
    assert_eq!(k.sha256, crate::sha256(tm!("wuerfel.glb")));
    assert!(k.fehler.is_none());
}

#[test]
fn hierarchie_lichter_szene() {
    let m = lies("hierarchie.glb").unwrap();
    let namen: Vec<&str> = m.knoten.iter().map(|k| k.name.as_str()).collect();
    assert_eq!(namen, ["Tisch", "Bein.1", "Bein.2", "Bein.3", "Bein.4", "Platte", "Lampe", "Gluehbirne", "Sonne", "", "Gespiegelt"]);
    let eltern: Vec<Option<u32>> = m.knoten.iter().map(|k| k.eltern).collect();
    assert_eq!(eltern, [None, Some(0), Some(0), Some(0), Some(0), Some(0), Some(0), None, None, None, Some(9)]);
    // geteiltes Mesh einmal, Platte mit zwei Primitiven, Waise (andere Szene) fehlt
    assert_eq!(m.meshes, [alloc::vec![0], alloc::vec![1, 2]]);
    assert_eq!(m.knoten[1].mesh, Some(0));
    assert_eq!(m.knoten[5].mesh, Some(1));
    assert_eq!(m.knoten[10].mesh, Some(0));
    // unbenutztes Material entfällt; Glas: Mischen, Leuchten mit Stärke
    assert_eq!(m.materialien.len(), 2);
    assert_eq!((m.materialien[1].name.as_str(), m.materialien[1].alpha, m.materialien[1].leucht_staerke), ("Glas", 2, 4.0));
    assert_eq!(m.netze[2].material, Some(1));
    assert!(m.knoten[6].matrix);
    assert_eq!(m.knoten[6].werte[13], 0.5);
    let arten: Vec<u8> = m.lichter.iter().map(|l| l.art).collect();
    assert_eq!(arten, [1, 0, 2]);
    assert_eq!((m.knoten[6].licht, m.knoten[7].licht, m.knoten[8].licht), (Some(0), Some(1), Some(2)));
    assert_eq!((m.lichter[0].reichweite, m.lichter[0].innen, m.lichter[0].aussen, m.lichter[1].reichweite), (8.0, 0.3, 0.6, 0.0));
}

#[test]
fn texturen_extern_gleich_eingebettet() {
    let br = gltf::braucht("modelle/textur.gltf", tm!("textur.gltf"));
    assert_eq!(br.iter().map(|(u, p)| (u.as_str(), p.as_str())).collect::<Vec<_>>(), [
        ("textur.bin", "modelle/textur.bin"),
        ("bilder/farbe.png", "modelle/bilder/farbe.png"),
        ("bilder/normale.png", "modelle/bilder/normale.png"),
        ("bilder/mr.png", "modelle/bilder/mr.png"),
        ("bilder/oc.png", "modelle/bilder/oc.png"),
        ("bilder/leucht.png", "modelle/bilder/leucht.png"),
    ]);
    assert!(gltf::braucht("x.gltf", tm!("textur-eingebettet.gltf")).is_empty());
    let a = lies("textur.gltf").unwrap();
    let b = lies("textur-eingebettet.gltf").unwrap();
    assert_eq!(a, b);
    let ma = &a.materialien[0];
    // Grundfarbe, Relief (Normale + Rauheit), Stoff, Leuchten
    assert_eq!((ma.bild_farbe, ma.bild_relief, ma.bild_stoff, ma.bild_leucht), (Some(0), Some(1), Some(2), Some(3)));
    assert!(ma.wiederholen && ma.beidseitig && ma.alpha == 1 && ma.schwelle == 0.3 && ma.normal_staerke == 0.8);
    assert_eq!((a.bilder[0].bild.breite, a.bilder[1].bild.breite, a.bilder[2].bild.breite), (8, 4, 4));
    // Relief-Texel (1, 2): Normale aus normale.png (128+16(x−2), 128+16(y−2)), B = mr.G / 2 aufgerundet (G = 40 + 40x)
    let r = &a.bilder[1].bild.rgba[(2 * 4 + 1) * 4..(2 * 4 + 1) * 4 + 4];
    assert_eq!(r, [112, 128, 40, 255]);
    // Stoff-Texel (3, 1): R Verdeckung (oc.png 2 × 2, nächster Nachbar → (1, 0) = 255), G Rauheit, B Metall aus mr.png
    let s = &a.bilder[2].bild.rgba[(4 + 3) * 4..(4 + 3) * 4 + 4];
    assert_eq!(s, [255, 160, 60, 255]);
    // ohne Nebendateien: die fehlende Datei wird genannt
    let ohne = gltf::lies(&gltf::quellpaket(tm!("textur.gltf"), &[]));
    assert_eq!(ohne, Err(MFehler::DateiFehlt("textur.bin".into())));
}

#[test]
fn eckfarben_palette() {
    let m = lies("farben.glb").unwrap();
    assert!(m.palette);
    assert_eq!(m.materialien.len(), 2); // Bunt + Ersatz für die Primitive ohne Material
    assert_eq!((m.materialien[1].name.as_str(), m.materialien[1].metall, m.materialien[1].rauheit), ("", 0.0, 0.7));
    let p = &m.bilder[m.materialien[0].bild_farbe.unwrap() as usize].bild;
    // weiß zuerst, dann sortiert: (0,0,255) (0,255,0) (10→sRGB,…,128) (255,0,0) (255,255,0)
    assert_eq!((p.breite, p.hoehe), (6, 1));
    assert_eq!(&p.rgba[..4], [255, 255, 255, 255]);
    assert_eq!(&p.rgba[4..8], [0, 0, 255, 255]);
    let s10 = crate::srgb::LINEAR_ZU_SRGB[((10.0f32 / 255.0) * 4095.0 + 0.5) as usize];
    assert_eq!(&p.rgba[12..16], [s10, s10, s10, 128]);
    // Seite 0 (rot) → Texel 4, Mitte (4.5 / 6, 0.5)
    let n = &m.netze[0];
    assert_eq!((n.uv[0], n.uv[1]), (4.5 / 6.0, 0.5));
    // weiße Seite → Texel 0
    assert_eq!(n.uv[16 * 2], 0.5 / 6.0);
    let p2 = &m.bilder[m.materialien[1].bild_farbe.unwrap() as usize].bild;
    assert_eq!((p2.breite, p2.hoehe), (3, 1));
}

#[test]
fn haut_und_folgen() {
    let m = lies("haut.glb").unwrap();
    assert_eq!(m.haeute.len(), 1);
    assert_eq!(m.haeute[0].gelenke, [1, 2]);
    assert_eq!(m.haeute[0].skelett, Some(1));
    assert_eq!(m.haeute[0].ibm[29], -1.0);
    let n = &m.netze[0];
    let (g, w) = (n.gelenke.as_ref().unwrap(), n.gewichte.as_ref().unwrap());
    assert_eq!(&g[..4], [0, 1, 0, 0]);
    for e in 0..10 {
        assert_eq!(w[e * 4..e * 4 + 4].iter().map(|&x| x as u32).sum::<u32>(), 65535);
    }
    assert_eq!(&w[2 * 4..2 * 4 + 4], [49151, 16384, 0, 0]); // t = 0.25 → 16383.75 → 16384, Rest an das größte
    assert_eq!(m.knoten[0].haut, Some(0));

    let f = lies("folge.glb").unwrap();
    assert_eq!(f.folgen.len(), 2);
    assert_eq!((f.folgen[0].name.as_str(), f.folgen[0].kanaele.len()), ("Auf", 1));
    let d = &f.folgen[1];
    assert_eq!(d.kanaele.len(), 2);
    assert_eq!((d.kanaele[0].pfad, d.kanaele[0].art, d.kanaele[0].werte.len()), (1, 1, 12));
    assert_eq!((d.kanaele[1].pfad, d.kanaele[1].art), (2, 0));
    assert_eq!(d.kanaele[1].werte, [1.0, 1.0, 1.0, 2.0, 2.0, 2.0, 1.0, 1.0, 1.0]);
    assert_eq!(f.folgen[0].kanaele[0].zeiten, [0.0, 1.0, 2.0]);
}

#[test]
fn quantisiert_streifen_faecher_sparse() {
    let m = lies("quant.glb").unwrap();
    assert_eq!(m.netze.len(), 2); // Linien entfallen
    let s = &m.netze[0];
    assert_eq!(s.idx, [0, 1, 2, 2, 1, 3]);
    assert_eq!(&s.pos[3..6], [1000.0, 0.0, 0.0]);
    assert_eq!(&s.nor.as_ref().unwrap()[..3], [0.0, 0.0, 1.0]);
    assert_eq!(&s.uv[..2], [0.0, 1.0]);
    let f = &m.netze[1];
    assert!(f.nor.is_none());
    assert_eq!(f.idx, [0, 1, 2, 0, 2, 3]);
    assert_eq!(&f.pos[6..9], [1.0, 0.5, -1.0]);
    assert_eq!(m.knoten[0].werte[7], 0.001);
}

fn text_von(name: &str) -> (u16, String) {
    let h = testmodelle().into_iter().find(|t| t.0 == name).unwrap().1;
    let t = modell::vorbacken(&paket(name, h));
    lies_kopf(&t).unwrap().fehler.unwrap()
}

#[test]
fn fehlerarten_mit_text() {
    assert_eq!(text_von("fehler-draco.glb"), (2, "braucht die Erweiterung KHR_draco_mesh_compression – die kann der Herd nicht.".into()));
    assert_eq!(text_von("fehler-kaputt.glb"), (1, "ist kein lesbares Modell (glTF 2.0).".into()));
    assert_eq!(text_von("fehler-zu-gross.glb"), (3, "ist zu groß (600 000 Ecken) – höchstens 500 000 Ecken.".into()));
    assert_eq!(text_von("fehler-bild-kaputt.glb"), (4, "(Bild 2) ist kein lesbares Bild (PNG oder JPEG).".into()));
    assert_eq!(text_von("fehler-bild-zu-gross.glb"), (4, "(Bild 2) ist zu groß (2400 × 800) – höchstens 2048 × 2048 Pixel.".into()));
    assert_eq!(text_von("fehler-fehlt.gltf"), (5, "braucht die Datei fehlt.bin – die liegt nicht in der Kiste.".into()));
    let t = modell::vorbacken(b"kein Modell");
    assert_eq!(lies_kopf(&t).unwrap().fehler.unwrap().0, 1);
    assert_eq!(t.len(), 68 + "ist kein lesbares Modell (glTF 2.0).".len());
    assert_eq!(modell::tausender(1_000_000), "1 000 000");
    assert_eq!(modell::tausender(999), "999");
    assert_eq!(modell::fehler_text(&MFehler::ZuGross(40 * 1048576 + 1, 32 * 1048576, "Bytes")).1, "ist zu groß (40,1 MB) – höchstens 32 MB.");
}

#[test]
fn uri_aufloesen() {
    assert_eq!(gltf::loese("modelle/a.gltf", "b.bin").as_deref(), Some("modelle/b.bin"));
    assert_eq!(gltf::loese("modelle/a.gltf", "../bilder/x.png").as_deref(), Some("bilder/x.png"));
    assert_eq!(gltf::loese("modelle/a.gltf", "./t%20x.bin").as_deref(), Some("modelle/t x.bin"));
    assert_eq!(gltf::loese("a.gltf", "../x.bin"), None);
    assert_eq!(gltf::loese("a.gltf", "http://x/y.bin"), None);
    assert_eq!(gltf::loese("a.gltf", "/y.bin"), None);
    assert_eq!(gltf::base64(b"aGFsbG8="), Some(b"hallo".to_vec()));
    assert_eq!(gltf::base64(b"aGFsbG8"), Some(b"hallo".to_vec()));
    assert_eq!(gltf::base64(b"a"), None);
    assert!(gltf::ist_gltf(tm!("wuerfel.glb")) && gltf::ist_gltf(tm!("textur.gltf")) && !gltf::ist_gltf(b"\x89PNG"));
}

const GOLDEN: &str = include_str!("../golden-modelle.txt");

/// Goldene Modellteige (Name, SHA-256, Länge) – `SCHREIBE_GOLDEN=1 cargo test -p herd-teigling` schreibt die Liste neu.
#[test]
fn goldene_modellteige() {
    let ist: String = testmodelle()
        .iter()
        .map(|(n, h)| {
            let t = modell::vorbacken(&paket(n, h));
            alloc::format!("{} {} {}\n", n, hex(&crate::sha256(&t)), t.len())
        })
        .collect();
    if std::env::var("SCHREIBE_GOLDEN").is_ok() {
        std::fs::write(concat!(env!("CARGO_MANIFEST_DIR"), "/golden-modelle.txt"), &ist).unwrap();
        return;
    }
    let soll: Vec<&str> = GOLDEN.lines().map(|z| z.trim()).filter(|z| !z.is_empty() && !z.starts_with('#')).collect();
    for (i, z) in ist.lines().enumerate() {
        assert_eq!(Some(z), soll.get(i).copied(), "goldener Modellteig {} weicht ab", i);
    }
    assert_eq!(ist.lines().count(), soll.len());
}

/// Fuzz: Bytes kippen, kürzen, verlängern, JSON-Zeichen tauschen – jede Eingabe ergibt einen Modellteig oder Fehler-Teig, nie
/// eine Panik; der Kopf ist immer lesbar.
#[test]
fn verdorbene_modelle_brechen_nie_ab() {
    let mut z: u64 = 0x9E37_79B9_7F4A_7C15;
    let mut zufall = move || {
        z ^= z << 13;
        z ^= z >> 7;
        z ^= z << 17;
        z
    };
    let mut n = 0;
    for (name, h) in testmodelle() {
        let p = paket(name, h);
        for runde in 0..400 {
            let mut v = p.clone();
            match runde % 5 {
                0 => {
                    for _ in 0..1 + zufall() % 4 {
                        let i = (zufall() % v.len() as u64) as usize;
                        v[i] ^= 1 << (zufall() % 8);
                    }
                }
                1 => {
                    let l = (zufall() % v.len() as u64) as usize;
                    v.truncate(l);
                }
                2 => {
                    let i = (zufall() % v.len() as u64) as usize;
                    v[i] = b"0123456789{}[],:\"-.e9"[(zufall() % 21) as usize];
                }
                3 => {
                    let i = (zufall() % v.len() as u64) as usize;
                    let x = [0xFF, 0xFF, 0xFF, 0x7F];
                    for (k, b) in x.iter().enumerate() {
                        if i + k < v.len() {
                            v[i + k] = *b;
                        }
                    }
                }
                _ => {
                    let i = (zufall() % v.len() as u64) as usize;
                    let e = v[i..].to_vec();
                    v.truncate(i);
                    v.extend_from_slice(&e[..e.len() / 2]);
                    v.extend_from_slice(&e);
                }
            }
            let t = modell::vorbacken(&v);
            assert!(lies_kopf(&t).is_some(), "{} Runde {}", name, runde);
            n += 1;
        }
    }
    assert_eq!(n, testmodelle().len() * 400);
}
