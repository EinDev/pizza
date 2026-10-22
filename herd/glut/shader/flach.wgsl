// 2D: alle Instanzen (INST2D, 56 Bytes) in einem Draw-Call – Uber-Shader nach `art`:
// 1 Rechteck (SDF, Rundung, Umriss), 2 Kreis (SDF, Umriss; auch Partikel), 3 Bild (Atlas, pixelscharf), 4 Glyphe (SDF-Schrift).
// Ecken aus vertex_index (6 je Instanz), Kantenglättung über die Bildschirmableitung des Abstands. Ausgabe in sRGB.

@group(0) @binding(4) var atlas: texture_2d_array<f32>;
@group(0) @binding(5) var schrift: texture_2d<f32>;
@group(0) @binding(6) var linear: sampler;

struct EinFlach {
    @builtin(vertex_index) ecke: u32,
    @location(0) m: vec4<f32>,       // m00 m10 m01 m11 (Spalten = lokale Achsen)
    @location(1) t: vec2<f32>,       // Mitte (Spielfeld-Pixel)
    @location(2) h: vec2<f32>,       // halbe Ausdehnung (lokal)
    @location(3) p: vec2<f32>,       // Rundung, Umriss
    @location(4) farbe: vec4<f32>,   // sRGB, nicht vormultipliziert
    @location(5) art: u32,           // art | seite << 8
    @location(6) uv: vec4<u32>,      // Atlas-Pixel u0 v0 u1 v1
}

struct AusFlach {
    @builtin(position) pos: vec4<f32>,
    @location(0) lokal: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) @interpolate(flat) h: vec2<f32>,
    @location(3) @interpolate(flat) p: vec2<f32>,
    @location(4) @interpolate(flat) farbe: vec4<f32>,
    @location(5) @interpolate(flat) art: u32,
    @location(6) @interpolate(flat) uvbox: vec4<f32>,
}

@vertex
fn vs_flach(e: EinFlach) -> AusFlach {
    var ecken = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0),
    );
    let c = ecken[e.ecke % 6u];
    let art = e.art & 255u;
    let m = mat2x2<f32>(e.m.xy, e.m.zw);
    // Saum für die Kantenglättung: ein Gerätepixel (mindestens ein Spielfeldpixel) in lokalen Einheiten
    let px = max(1.0, 1.0 / max(ansicht.a.x, 0.0001));
    let sx = max(length(e.m.xy), 0.000001);
    let sy = max(length(e.m.zw), 0.000001);
    let saum = select(vec2<f32>(0.0), vec2<f32>(px / sx, px / sy), art <= 2u);
    let lokal = c * (e.h + saum);
    let feld = m * lokal + e.t;
    var a: AusFlach;
    a.pos = vec4<f32>(feld.x * szene.feld.z * 2.0 - 1.0, 1.0 - feld.y * szene.feld.w * 2.0, 0.0, 1.0);
    a.lokal = lokal;
    let uv0 = vec2<f32>(e.uv.xy);
    let uv1 = vec2<f32>(e.uv.zw);
    a.uv = mix(uv0, uv1, (c + vec2<f32>(1.0)) * 0.5);
    a.h = e.h;
    a.p = e.p;
    a.farbe = e.farbe;
    a.art = e.art;
    a.uvbox = vec4<f32>(uv0, uv1);
    return a;
}

fn abstand_rechteck(q: vec2<f32>, h: vec2<f32>, r: f32) -> f32 {
    let d = abs(q) - h + vec2<f32>(r);
    return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0) - r;
}

@fragment
fn fs_flach(a: AusFlach) -> @location(0) vec4<f32> {
    let art = a.art & 255u;
    let seite = i32(a.art >> 8u);
    // Abstand zur Form (Spielfeld… lokale Einheiten); Ableitungen nur hier oben (gleichförmiger Kontrollfluss)
    let rund = clamp(a.p.x, 0.0, min(a.h.x, a.h.y));
    let d_rechteck = abstand_rechteck(a.lokal, a.h, rund);
    let d_kreis = length(a.lokal) - a.h.x;
    var d = select(d_kreis, d_rechteck, art == 1u);
    let umriss = a.p.y;
    d = select(d, abs(d + umriss * 0.5) - umriss * 0.5, umriss > 0.0);
    let breite = max(fwidth(d), 0.00001);
    let deck_form = clamp(0.5 - d / breite, 0.0, 1.0);

    // Glyphe: SDF bilinear, Kante 0.5; Glättung aus der Ableitung (scharf in jeder Größe)
    let groesse = vec2<f32>(max(ansicht.a.z, 1.0), max(ansicht.a.w, 1.0));
    let sdf = textureSampleLevel(schrift, linear, a.uv / groesse, 0.0).r;
    let sw = max(fwidth(sdf), 0.0001);
    let deck_glyphe = clamp((sdf - 0.5) / sw + 0.5, 0.0, 1.0);

    // Bild: nächster Nachbar, auf das Rechteck geklemmt
    let texel = clamp(floor(a.uv), a.uvbox.xy, max(a.uvbox.zw - vec2<f32>(1.0), a.uvbox.xy));
    let bild = textureLoad(atlas, vec2<i32>(texel), seite, 0);

    var f = a.farbe;
    if (art == 3u) {
        f = f * bild;
    } else if (art == 4u) {
        f.a = f.a * deck_glyphe;
    } else {
        f.a = f.a * deck_form;
    }
    if (f.a <= 0.0) {
        discard;
    }
    return f;
}
