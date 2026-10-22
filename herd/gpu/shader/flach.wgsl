// 2D: Farbe, Bildchen (nächster Nachbar, pixelscharf), SDF-Schrift (kantengeglättet). Ausgabe direkt in sRGB.

struct EinFlach {
    @location(0) pos: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) farbe: vec4<f32>,
    @location(3) art: f32,
}

struct AusFlach {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) farbe: vec4<f32>,
    @location(2) art: f32,
}

@group(0) @binding(0) var schrift_t: texture_2d<f32>;
@group(0) @binding(1) var schrift_s: sampler;
@group(1) @binding(0) var bild_t: texture_2d<f32>;
@group(1) @binding(1) var bild_s: sampler;

@vertex
fn vs_flach(e: EinFlach) -> AusFlach {
    var a: AusFlach;
    a.pos = vec4<f32>(e.pos, 0.0, 1.0);
    a.uv = e.uv;
    a.farbe = e.farbe;
    a.art = e.art;
    return a;
}

@fragment
fn fs_flach(a: AusFlach) -> @location(0) vec4<f32> {
    let abstand = textureSample(schrift_t, schrift_s, a.uv).r;
    let bild = textureSample(bild_t, bild_s, a.uv);
    // Kantenbreite aus der Ableitung: scharf in jeder Größe
    let w = max(fwidth(abstand) * 0.75, 0.0001);
    let deckung = smoothstep(0.5 - w, 0.5 + w, abstand);
    var f = a.farbe;
    if (a.art > 1.5) {
        f.a = f.a * deckung;
    } else if (a.art > 0.5) {
        f = f * bild;
    }
    return f;
}
