// Herd-Glut: gemeinsamer Teil aller Shader. Jedes Programm = gemeinsam.wgsl + <programm>.wgsl.
// Layout des Uniform-Blocks SZENE: herd/README.md §4 (592 Bytes, geschrieben vom Kern, f32, std140-gleich).

struct Szene {
    ansicht_proj: mat4x4<f32>,
    licht_proj: mat4x4<f32>,
    kamera: vec4<f32>,
    sonne_richtung: vec4<f32>,   // xyz zur Sonne (normiert), w = 1 Schatten an
    sonne_farbe: vec4<f32>,      // linear × Stärke
    umgebung_oben: vec4<f32>,    // linear × Stärke
    umgebung_unten: vec4<f32>,
    nebel_farbe: vec4<f32>,      // linear, w = 1 an
    nebel: vec4<f32>,            // von, bis, 1/(bis − von)
    himmel_oben: vec4<f32>,      // linear
    himmel_unten: vec4<f32>,
    hintergrund: vec4<f32>,      // sRGB
    schatten: vec4<f32>,         // 1/Größe, Normalenversatz (Welt), Tiefen-Bias, Texel (Welt)
    feld: vec4<f32>,             // breite, hoehe, 1/breite, 1/hoehe
    zahlen: vec4<f32>,           // x = Anzahl Punktlichter
    licht_pos: array<vec4<f32>, 8>,   // xyz, w = Reichweite
    licht_farbe: array<vec4<f32>, 8>, // linear × Stärke
}

// Uniform-Block der Glut (nicht vom Kern): x = Gerätepixel je Spielfeldpixel, y = Atlas-Kantenlänge,
// z = Breite, w = Höhe der Schrift-Textur.
struct Ansicht {
    a: vec4<f32>,
}

@group(0) @binding(0) var<uniform> szene: Szene;
@group(0) @binding(1) var<uniform> ansicht: Ansicht;

fn zu_srgb(c: vec3<f32>) -> vec3<f32> {
    let k = max(c, vec3<f32>(0.0));
    let hoch = 1.055 * pow(k, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
    let tief = k * 12.92;
    return select(hoch, tief, k <= vec3<f32>(0.0031308));
}

fn zu_linear(c: vec3<f32>) -> vec3<f32> {
    let hoch = pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
    let tief = c / 12.92;
    return select(hoch, tief, c <= vec3<f32>(0.04045));
}

// Rauschen gegen Farbstufen in Verläufen (±½ Stufe), nur von der Pixelposition abhängig.
fn rauschen(p: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715)))) - 0.5;
}
