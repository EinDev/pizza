//! Bindungswächter (H-K15, HERD.md §13.1 Regel 4, `herd/README.md` §9 „Bindungen und Einheiten“): übersetzt jeden
//! Einstiegspunkt aller Programme mit naga nach GLSL ES 3.00 – wie wgpu für WebGL2 – und zählt je Shader-Stufe die
//! Textureinheiten (GLSL-Sampler: je benutzter Textur einer, `textureLoad` und Abtastungen derselben Textur teilen ihn) und die
//! Uniform-Blöcke. Grenzen = WebGL2-Minimum: Fragment ≤ 16, Vertex ≤ 16, eine Pipeline zusammen ≤ 32 Einheiten, ≤ 12
//! Uniform-Blöcke je Stufe. Jedes Programm hat genau einen Vertex-Einstiegspunkt; jede Pipeline = er + ein Fragment-Einstieg.
//!
//! Dazu die **Layouts** (`layout_haupt` …), denn wgpu-GL vergibt die Textureinheiten nicht je Shader, sondern je
//! Pipeline-Layout: jede Textur-Bindung des Layouts bekommt eine eigene Einheit (über alle Stufen, wgpu-hal
//! `MAX_TEXTURE_SLOTS` = 16), ebenso jeder Sampler (≤ 16); Uniform-Puffer ≤ 12 je Stufe (wgpu-Grenze). Jeder Einstiegspunkt
//! darf nur Bindungen seines Layouts in dessen Sichtbarkeit benutzen.

use super::{layout_bildraum, layout_haupt, layout_nachbild, layout_schatten, BILDRAUM, FLACH, FUNKEN, GEMEINSAM, HIMMEL, LICHT, NACHBILD, SCHATTEN};
use naga::back::glsl;

const EINHEITEN_STUFE: usize = 16;
const EINHEITEN_ZUSAMMEN: usize = 32;
const BLOECKE_STUFE: usize = 12;
/// wgpu-hal (GL): Textureinheiten und Sampler je Pipeline-Layout, über alle Stufen
const LAYOUT_TEXTUREN: usize = 16;
const LAYOUT_SAMPLER: usize = 16;

struct Stufe {
    name: String,
    vertex: bool,
    /// (Bindung der Textur, Bindung des Samplers oder None bei nur `textureLoad`), nach Bindung sortiert
    einheiten: Vec<(u32, Option<u32>)>,
    bloecke: Vec<u32>,
    /// alle benutzten Bindungen (Texturen, Sampler, Uniform-Blöcke)
    benutzt: Vec<u32>,
}

fn bindung(m: &naga::Module, h: naga::Handle<naga::GlobalVariable>) -> u32 {
    m.global_variables[h].binding.as_ref().map(|b| b.binding).expect("Bindung")
}

fn stufen(programm: &str, quelle: &str) -> Vec<Stufe> {
    let modul = naga::front::wgsl::parse_str(quelle).unwrap_or_else(|e| panic!("{programm}: {}", e.emit_to_string(quelle)));
    let info = naga::valid::Validator::new(naga::valid::ValidationFlags::all(), naga::valid::Capabilities::empty())
        .validate(&modul)
        .unwrap_or_else(|e| panic!("{programm}: {e:?}"));
    let optionen = glsl::Options {
        version: glsl::Version::Embedded { version: 300, is_webgl: true },
        writer_flags: glsl::WriterFlags::ADJUST_COORDINATE_SPACE | glsl::WriterFlags::FORCE_POINT_SIZE,
        binding_map: Default::default(),
        zero_initialize_workgroup_memory: true,
    };
    let mut aus = Vec::new();
    for ep in &modul.entry_points {
        let po = glsl::PipelineOptions { shader_stage: ep.stage, entry_point: ep.name.clone(), multiview: None };
        let mut text = String::new();
        let mut w = glsl::Writer::new(&mut text, &modul, &info, &optionen, &po, Default::default())
            .unwrap_or_else(|e| panic!("{programm}/{}: {e:?}", ep.name));
        let r = w.write().unwrap_or_else(|e| panic!("{programm}/{}: {e:?}", ep.name));
        let mut einheiten: Vec<(u32, Option<u32>)> = r.texture_mapping.values().map(|t| (bindung(&modul, t.texture), t.sampler.map(|s| bindung(&modul, s)))).collect();
        einheiten.sort();
        let mut bloecke: Vec<u32> = r.uniforms.keys().map(|&h| bindung(&modul, h)).collect();
        bloecke.sort();
        // HERD_GLSL_AUS=<ordner>: übersetzte GLSL-Texte zum Nachsehen ablegen
        if let Ok(d) = std::env::var("HERD_GLSL_AUS") {
            std::fs::write(format!("{d}/{programm}_{}.glsl", ep.name), &text).unwrap();
        }
        // Gegenprobe am GLSL-Text: je Einheit genau eine `uniform … sampler…`-Zeile
        let im_text = text.lines().filter(|z| z.trim_start().starts_with("uniform ") && z.contains("sampler")).count();
        assert_eq!(im_text, einheiten.len(), "{programm}/{}: GLSL-Sampler im Text ≠ Reflexion", ep.name);
        let mut benutzt: Vec<u32> = einheiten.iter().flat_map(|&(t, s)| std::iter::once(t).chain(s)).chain(bloecke.iter().copied()).collect();
        benutzt.sort();
        benutzt.dedup();
        aus.push(Stufe { name: format!("{programm}/{}", ep.name), vertex: ep.stage == naga::ShaderStage::Vertex, einheiten, bloecke, benutzt });
    }
    aus
}

fn liste(e: &[(u32, Option<u32>)]) -> String {
    e.iter().map(|(t, s)| match s {
        Some(s) => format!("{t}+{s}"),
        None => format!("{t}"),
    }).collect::<Vec<_>>().join(" ")
}

#[test]
fn bindungswaechter() {
    let haupt = layout_haupt();
    let schatten = layout_schatten();
    let nach = layout_nachbild();
    let bild = layout_bildraum();
    let layouts: [(&str, &[wgpu::BindGroupLayoutEntry]); 4] = [("haupt", &haupt), ("schatten", &schatten), ("nachbild", &nach), ("bildraum", &bild)];
    let programme: [(&str, String, &[wgpu::BindGroupLayoutEntry]); 7] = [
        ("flach", format!("{GEMEINSAM}\n{FLACH}"), &haupt),
        ("himmel", format!("{GEMEINSAM}\n{HIMMEL}"), &haupt),
        ("licht", format!("{GEMEINSAM}\n{LICHT}"), &haupt),
        ("schatten", format!("{GEMEINSAM}\n{SCHATTEN}"), &schatten),
        ("funken", format!("{GEMEINSAM}\n{FUNKEN}"), &haupt),
        ("nachbild", NACHBILD.to_string(), &nach),
        ("bildraum", format!("{GEMEINSAM}\n{BILDRAUM}"), &bild),
    ];
    let mut fehler = Vec::new();
    println!("{:<10} {:>9} {:>8}  Uniform-Puffer VS/FS", "Layout", "Texturen", "Sampler");
    for (name, l) in &layouts {
        let zahl = |f: &dyn Fn(&wgpu::BindGroupLayoutEntry) -> bool| l.iter().filter(|e| f(e)).count();
        let tex = zahl(&|e| matches!(e.ty, wgpu::BindingType::Texture { .. }));
        let sam = zahl(&|e| matches!(e.ty, wgpu::BindingType::Sampler(_)));
        let ubo = |st: wgpu::ShaderStages| zahl(&|e| matches!(e.ty, wgpu::BindingType::Buffer { .. }) && e.visibility.contains(st));
        let (uv, uf) = (ubo(wgpu::ShaderStages::VERTEX), ubo(wgpu::ShaderStages::FRAGMENT));
        println!("{name:<10} {tex:>6}/16 {sam:>5}/16  {uv}/12 {uf}/12");
        if tex > LAYOUT_TEXTUREN {
            fehler.push(format!("Layout {name}: {tex} Textur-Bindungen > {LAYOUT_TEXTUREN} (wgpu-GL: eine Einheit je Bindung)"));
        }
        if sam > LAYOUT_SAMPLER {
            fehler.push(format!("Layout {name}: {sam} Sampler > {LAYOUT_SAMPLER}"));
        }
        if uv.max(uf) > BLOECKE_STUFE {
            fehler.push(format!("Layout {name}: {} Uniform-Puffer je Stufe > {BLOECKE_STUFE}", uv.max(uf)));
        }
    }
    println!();
    println!("{:<26} {:>9} {:>7}  Einheiten (Textur+Sampler)", "Einstiegspunkt", "Einheiten", "Blöcke");
    for (programm, quelle, layout) in &programme {
        let st = stufen(programm, quelle);
        let vs: Vec<&Stufe> = st.iter().filter(|s| s.vertex).collect();
        // licht/schatten haben je zwei (H-K23b: `vs_haut`, `vs_schatten_haut`): jede Kombination VS + FS zählt
        assert!(!vs.is_empty(), "{programm}: kein Vertex-Einstiegspunkt");
        for s in &st {
            println!("{:<26} {:>6}/16 {:>4}/12  {}", s.name, s.einheiten.len(), s.bloecke.len(), liste(&s.einheiten));
            let stufe = if s.vertex { wgpu::ShaderStages::VERTEX } else { wgpu::ShaderStages::FRAGMENT };
            for b in &s.benutzt {
                match layout.iter().find(|e| e.binding == *b) {
                    None => fehler.push(format!("{}: Bindung {b} fehlt im Layout", s.name)),
                    Some(e) if !e.visibility.contains(stufe) => fehler.push(format!("{}: Bindung {b} im Layout nicht für diese Stufe sichtbar", s.name)),
                    _ => {}
                }
            }
            if s.einheiten.len() > EINHEITEN_STUFE {
                fehler.push(format!("{}: {} Textureinheiten > {EINHEITEN_STUFE}", s.name, s.einheiten.len()));
            }
            if s.bloecke.len() > BLOECKE_STUFE {
                fehler.push(format!("{}: {} Uniform-Blöcke > {BLOECKE_STUFE}", s.name, s.bloecke.len()));
            }
            for v in vs.iter().filter(|_| !s.vertex) {
                if s.einheiten.len() + v.einheiten.len() > EINHEITEN_ZUSAMMEN {
                    fehler.push(format!("{} + {}: zusammen {} Einheiten > {EINHEITEN_ZUSAMMEN}", v.name, s.name, s.einheiten.len() + v.einheiten.len()));
                }
            }
        }
    }
    assert!(fehler.is_empty(), "Bindungs-Budget überschritten (herd/README.md §9):\n{}", fehler.join("\n"));
}

/// Vertex-Attribute je Pipeline (WebGL2-Minimum `MAX_VERTEX_ATTRIBS` = 16, Orte 0 … 15): `vs_haut` nimmt alle 16 (H-K23b).
#[test]
fn vertex_attribute() {
    let mut fehler = Vec::new();
    for (name, l) in [
        ("licht", super::licht_layouts().to_vec()),
        ("licht haut", super::licht_haut_layouts().to_vec()),
        ("schatten haut", super::schatten_haut_layouts().to_vec()),
    ] {
        let orte: Vec<u32> = l.iter().flatten().flat_map(|b| b.attributes.iter().map(|a| a.shader_location)).collect();
        println!("{name:<14} {:>2}/16 Attribute", orte.len());
        if orte.len() > 16 || orte.iter().any(|&o| o >= 16) {
            fehler.push(format!("{name}: {} Attribute, Orte {orte:?}", orte.len()));
        }
    }
    assert!(fehler.is_empty(), "Vertex-Attribute über dem WebGL2-Minimum:\n{}", fehler.join("\n"));
}
