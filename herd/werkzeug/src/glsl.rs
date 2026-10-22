//! Erzeugt die GLSL-ES-3.0-Fassung der Herd-Shader für WebGL2 (`site/js/herd/shader.js`) mit naga.

use std::collections::BTreeMap;
use std::fmt::Write as _;

use naga::back::glsl;
use naga::valid::{Capabilities, ValidationFlags, Validator};
use naga::ShaderStage;

fn bindung(m: &naga::Module, h: naga::Handle<naga::GlobalVariable>) -> String {
    match &m.global_variables[h].binding {
        Some(b) => format!("{{ \"gruppe\": {}, \"bindung\": {} }}", b.group, b.binding),
        None => "null".into(),
    }
}

fn js_text(s: &str) -> String {
    let mut o = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => {}
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

/// Übersetzt ein Programm; liefert (GLSL, Uniform-Blöcke, Texturen) je Stufe.
fn uebersetze(name: &str, quelle: &str, einstieg: &str, stufe: ShaderStage) -> Result<(String, BTreeMap<String, String>, BTreeMap<String, String>), String> {
    let modul = naga::front::wgsl::parse_str(quelle).map_err(|e| format!("{}: {}", name, e.emit_to_string(quelle)))?;
    let info = Validator::new(ValidationFlags::all(), Capabilities::empty())
        .validate(&modul)
        .map_err(|e| format!("{}: {:?}", name, e))?;
    let optionen = glsl::Options {
        version: glsl::Version::Embedded { version: 300, is_webgl: true },
        writer_flags: glsl::WriterFlags::empty(),
        ..Default::default()
    };
    let pipeline = glsl::PipelineOptions { shader_stage: stufe, entry_point: einstieg.into(), multiview: None };
    let mut text = String::new();
    let mut w = glsl::Writer::new(&mut text, &modul, &info, &optionen, &pipeline, naga::proc::BoundsCheckPolicies::default())
        .map_err(|e| format!("{}/{}: {:?}", name, einstieg, e))?;
    let refl = w.write().map_err(|e| format!("{}/{}: {:?}", name, einstieg, e))?;
    let mut bloecke = BTreeMap::new();
    for (h, n) in &refl.uniforms {
        bloecke.insert(n.clone(), bindung(&modul, *h));
    }
    let mut texturen = BTreeMap::new();
    for (n, t) in &refl.texture_mapping {
        let s = t.sampler.map(|s| bindung(&modul, s)).unwrap_or_else(|| "null".into());
        texturen.insert(n.clone(), format!("{{ \"textur\": {}, \"sampler\": {} }}", bindung(&modul, t.texture), s));
    }
    Ok((text, bloecke, texturen))
}

fn objekt(m: &BTreeMap<String, String>) -> String {
    let teile: Vec<String> = m.iter().map(|(k, v)| format!("{}: {}", js_text(k), v)).collect();
    format!("{{ {} }}", teile.join(", "))
}

/// Inhalt von `site/js/herd/shader.js`.
pub fn erzeuge() -> Result<String, String> {
    let mut js = String::new();
    js.push_str("/* GENERIERT von `herd-bild glsl` (naga, WGSL → GLSL ES 3.0) – nicht von Hand ändern.\n");
    js.push_str(" * Quelle: herd/kern/shader/*.wgsl. Bindungen: {gruppe, bindung} wie in WGSL; WebGL2 setzt sie per\n");
    js.push_str(" * uniformBlockBinding (Blöcke) bzw. Textureinheit (kombinierte Sampler) selbst. Siehe herd/README.md. */\n");
    js.push_str("(function (root) {\n  'use strict';\n  var shader = {\n");
    for (name, quelle, vs, fs) in herd_kern::shader::PROGRAMME {
        let (v, vb, vt) = uebersetze(name, quelle, vs, ShaderStage::Vertex)?;
        let (f, fb, ft) = uebersetze(name, quelle, fs, ShaderStage::Fragment)?;
        let mut bloecke = vb;
        bloecke.extend(fb);
        let mut texturen = vt;
        texturen.extend(ft);
        let _ = writeln!(js, "    {}: {{", name);
        let _ = writeln!(js, "      vertex: {},", js_text(&v));
        let _ = writeln!(js, "      fragment: {},", js_text(&f));
        let _ = writeln!(js, "      bloecke: {},", objekt(&bloecke));
        let _ = writeln!(js, "      texturen: {}", objekt(&texturen));
        js.push_str("    },\n");
    }
    js.push_str("  };\n");
    js.push_str("  if (typeof module === 'object' && module && module.exports) module.exports = shader;\n");
    js.push_str("  else root.HerdShader = shader;\n");
    js.push_str("})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));\n");
    Ok(js)
}
