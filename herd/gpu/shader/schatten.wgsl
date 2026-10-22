// Schatten-Tiefe aus Sicht der Sonne. Bildchen-Pixel mit Deckkraft < ½ werfen keinen Schatten.

struct EinSchatten {
    @location(0) pos: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) m0: vec4<f32>,
    @location(4) m1: vec4<f32>,
    @location(5) m2: vec4<f32>,
    @location(6) m3: vec4<f32>,
    @location(11) material: vec4<f32>,
}

struct AusSchatten {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) textur: f32,
}

@group(0) @binding(0) var<uniform> szene: Szene;
@group(0) @binding(1) var<uniform> geraet: Geraet;
@group(1) @binding(0) var bild_t: texture_2d<f32>;
@group(1) @binding(1) var bild_s: sampler;

@vertex
fn vs_schatten(e: EinSchatten) -> AusSchatten {
    let m = mat4x4<f32>(e.m0, e.m1, e.m2, e.m3);
    var p = szene.licht_proj * (m * vec4<f32>(e.pos, 1.0));
    p.z = p.z * geraet.z.x + p.w * geraet.z.y;
    var a: AusSchatten;
    a.pos = p;
    a.uv = e.uv;
    a.textur = e.material.z;
    return a;
}

@fragment
fn fs_schatten(a: AusSchatten) {
    let t = textureSample(bild_t, bild_s, a.uv);
    if (a.textur > 0.5 && t.a < 0.5) {
        discard;
    }
}
