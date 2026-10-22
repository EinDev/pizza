// Himmel: senkrechter Verlauf hinter der 3D-Szene (ein Dreieck über das ganze Spielfeld, ohne Puffer).

struct AusHimmel {
    @builtin(position) pos: vec4<f32>,
    @location(0) t: f32,
}

@group(0) @binding(0) var<uniform> szene: Szene;

@vertex
fn vs_himmel(@builtin(vertex_index) i: u32) -> AusHimmel {
    let x = f32((i << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(i & 2u) * 2.0 - 1.0;
    var a: AusHimmel;
    a.pos = vec4<f32>(x, y, 0.0, 1.0);
    a.t = 0.5 - 0.5 * y;
    return a;
}

@fragment
fn fs_himmel(a: AusHimmel) -> @location(0) vec4<f32> {
    let t = clamp(a.t, 0.0, 1.0);
    // weicher Übergang (Smoothstep) wirkt natürlicher als ein linearer Verlauf
    let s = t * t * (3.0 - 2.0 * t);
    let c = mix(szene.himmel_oben.rgb, szene.himmel_unten.rgb, s);
    return vec4<f32>(zu_srgb(c) + vec3<f32>(rauschen(a.pos.xy) / 255.0), 1.0);
}
