// Herd-Shader: gemeinsamer Teil. Jedes Programm = gemeinsam.wgsl + <programm>.wgsl (WGSL ist die einzige Quelle;
// die GLSL-ES-3.0-Fassung für WebGL2 erzeugt `herd-bild glsl` mit naga). Layout der Blöcke: herd/README.md.

// Uniform-Block `Szene` (560 Bytes, std140-gleich), geschrieben vom Kern.
struct Szene {
    ansicht_proj: mat4x4<f32>,
    licht_proj: mat4x4<f32>,
    kamera: vec4<f32>,
    sonne_richtung: vec4<f32>,   // xyz zur Sonne hin (normiert), w = Schatten an (1) / aus (0)
    sonne_farbe: vec4<f32>,      // linear × Stärke
    umgebung_oben: vec4<f32>,    // linear × Stärke
    umgebung_unten: vec4<f32>,
    nebel_farbe: vec4<f32>,      // linear, w = Nebel an
    nebel: vec4<f32>,            // von, bis, 1/(bis − von)
    himmel_oben: vec4<f32>,      // linear
    himmel_unten: vec4<f32>,
    schatten: vec4<f32>,         // 1/Größe, Normalenversatz (Welt), Tiefen-Bias, Texel (Welt)
    zahlen: vec4<f32>,           // x = Anzahl Punktlichter
    licht_pos: array<vec4<f32>, 8>,   // xyz, w = Reichweite
    licht_farbe: array<vec4<f32>, 8>, // linear
}

// Uniform-Block `Geraet` (16 Bytes), geschrieben von der GPU-Schicht – die einzige API-abhängige Angabe:
// x = z-Skala, y = z-Versatz (Clip-z' = z·x + w·y), z = Vorzeichen der Schatten-v-Achse.
// wgpu: (1, 0, 1, 0) · WebGL2: (2, −1, −1, 0)
struct Geraet {
    z: vec4<f32>,
}

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

// Rauschen gegen Farbstufen in Verläufen (±½ Stufe), abhängig nur von der Pixelposition.
fn rauschen(p: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715)))) - 0.5;
}
