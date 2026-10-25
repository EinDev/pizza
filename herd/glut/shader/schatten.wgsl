// Schatten-Tiefe aus Sicht der Sonne bzw. einer Schatten-Ansicht (H-K18). Textur-Texel mit Deckkraft < ½ (bzw. unter der `schwelle`
// des Belags, H-K26) werfen keinen Schatten.

@group(0) @binding(4) var atlas: texture_2d_array<f32>;
// Ansicht·Projektion dieses Zugs (dynamischer Versatz je Ansicht; Eintrag 0 = licht_proj aus SZENE, v1)
struct SchattenZug {
    vp: mat4x4<f32>,
}
@group(0) @binding(20) var<uniform> schatten_zug: SchattenZug;

struct EinSchatten {
    @location(0) pos: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) z0: vec4<f32>,
    @location(4) z1: vec4<f32>,
    @location(5) z2: vec4<f32>,
    @location(8) uvbox: vec4<u32>,
    @location(9) textur: u32,
    @location(13) karten: vec4<u32>,  // KARTEN3D (H-K26): Schwelle in Wort 3, Bits 0–7
}

struct AusSchatten {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) @interpolate(flat) uvbox: vec4<f32>,
    @location(2) @interpolate(flat) textur: u32,
    @location(3) @interpolate(flat) schwelle: u32,
}

@vertex
fn vs_schatten(e: EinSchatten) -> AusSchatten {
    let p = vec4<f32>(e.pos, 1.0);
    let w = vec3<f32>(dot(e.z0, p), dot(e.z1, p), dot(e.z2, p));
    var a: AusSchatten;
    a.pos = schatten_zug.vp * vec4<f32>(w, 1.0);
    let box = vec4<f32>(e.uvbox);
    a.uv = e.uv * (box.zw - box.xy);
    a.uvbox = box;
    a.textur = e.textur;
    a.schwelle = e.karten.w & 255u;
    return a;
}

// Haut (H-K23b): wie vs_haut in licht.wgsl – Palette an Bindung 23, Gelenke + Gewichte @14/@15, Palettenzeile in
// ZUSATZ3D.merkmale (@12) Bits 16–31
@group(0) @binding(23) var gelenke_t: texture_2d<f32>;

struct EinHaut {
    @location(14) gelenk: vec4<u32>,
    @location(15) gewicht: vec4<f32>,
}

fn gelenk_zeile(j: u32, r: u32) -> vec4<f32> {
    return textureLoad(gelenke_t, vec2<i32>(i32((j & 255u) * 3u + r), i32(j >> 8u)), 0);
}

@vertex
fn vs_schatten_haut(e: EinSchatten, h: EinHaut, @location(12) merkmale: u32) -> AusSchatten {
    let basis = merkmale >> 16u;
    let p0 = vec4<f32>(e.pos, 1.0);
    var ph = vec3<f32>(0.0);
    for (var k = 0u; k < 4u; k = k + 1u) {
        let g = h.gewicht[k];
        if (g > 0.0) {
            let j = basis + h.gelenk[k];
            ph = ph + g * vec3<f32>(dot(gelenk_zeile(j, 0u), p0), dot(gelenk_zeile(j, 1u), p0), dot(gelenk_zeile(j, 2u), p0));
        }
    }
    let p = vec4<f32>(ph, 1.0);
    let w = vec3<f32>(dot(e.z0, p), dot(e.z1, p), dot(e.z2, p));
    var a: AusSchatten;
    a.pos = schatten_zug.vp * vec4<f32>(w, 1.0);
    let box = vec4<f32>(e.uvbox);
    a.uv = e.uv * (box.zw - box.xy);
    a.uvbox = box;
    a.textur = e.textur;
    a.schwelle = e.karten.w & 255u;
    return a;
}

@fragment
fn fs_schatten(a: AusSchatten) {
    if ((a.textur & 65536u) != 0u) {
        let groesse = a.uvbox.zw - a.uvbox.xy;
        let texel = a.uvbox.xy + clamp(a.uv, vec2<f32>(0.5), max(groesse - vec2<f32>(0.5), vec2<f32>(0.5)));
        // Bit 17 = eigene Textur (PD3): Kennung Klasse << 13 | Schicht, Stufe 0 (Klasse 7 = unbekannt → wirft Schatten)
        let eigen = (a.textur & 131072u) != 0u;
        let klasse = (a.textur >> 13u) & 7u;
        var tex = textureLoad(atlas, vec2<i32>(floor(texel)), select(i32(a.textur & 65535u), 0, eigen), 0);
        if (eigen) {
            tex = select(vec4<f32>(1.0), eigen_lade(klasse, vec2<i32>(floor(texel)), i32(a.textur & 8191u)), klasse <= 4u);
        }
        // Ausschnitt (H-K26): mit Schwelle gilt sie, sonst ½
        if (tex.a < select(0.5, f32(a.schwelle) / 255.0, a.schwelle != 0u)) {
            discard;
        }
    }
}
