// Nachbild (Abschnitt STIMMUNG): Bloom-Kette und Abschluss. Eigenständig (ohne gemeinsam.wgsl), eigenes Bind-Layout:
// 0 = Quelle (HDR bzw. Bloom-Stufe), 1 = Sampler linear (Rand geklemmt), 2 = Stimmung (64 B), 3 = Bloom-Stufe 0 (nur Abschluss).
// Bloom nach Jimenez („Next Generation Post Processing in Call of Duty: Advanced Warfare“, 2014): Vorfilter mit weicher
// Schwelle und Karis-Mittel (keine Glühwürmchen), 13-Abtastungen-Verkleinern, Zelt-Vergrößern additiv. Abschluss:
// Belichtung, ACES (Hill-Anpassung von RRT + ODT), Sättigung, Vignette, Filmkorn, sRGB, Rauschen gegen Farbstufen.

struct Stimmung {
    a: vec4<f32>,       // belichtung, bloom, bloomSchwelle, bloomWeite
    nebel: vec4<f32>,   // dichte, hoehe, abfall, fern
    farbe: vec4<f32>,   // nebelFarbe linear, saettigung
    b: vec4<f32>,       // vignette, koernung, zeit, an
    spiegel: vec4<f32>, // spiegelung, spiegelHoehe, regen, spiegelGuete
}

@group(0) @binding(0) var quelle: texture_2d<f32>;
@group(0) @binding(1) var s_lin: sampler;
@group(0) @binding(2) var<uniform> st: Stimmung;
@group(0) @binding(3) var bloom_t: texture_2d<f32>;

const BLOOM_STUFEN: f32 = 6.0;

struct AusVoll {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_voll(@builtin(vertex_index) i: u32) -> AusVoll {
    let x = f32((i << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(i & 2u) * 2.0 - 1.0;
    var a: AusVoll;
    a.pos = vec4<f32>(x, y, 0.0, 1.0);
    a.uv = vec2<f32>(x * 0.5 + 0.5, 0.5 - y * 0.5);
    return a;
}

fn probe(uv: vec2<f32>) -> vec3<f32> {
    return textureSampleLevel(quelle, s_lin, uv, 0.0).rgb;
}

fn helligkeit(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// 13 Abtastungen: Mitte, 4 innere Diagonalen (±1 Texel), 8 äußere (±2 Texel) – Gewichte 0.5 innen, 0.125 je äußere 2×2-Gruppe
fn dreizehn(uv: vec2<f32>, t: vec2<f32>, karis: bool) -> vec3<f32> {
    let a = probe(uv + t * vec2<f32>(-2.0, -2.0));
    let b = probe(uv + t * vec2<f32>(0.0, -2.0));
    let c = probe(uv + t * vec2<f32>(2.0, -2.0));
    let d = probe(uv + t * vec2<f32>(-2.0, 0.0));
    let e = probe(uv);
    let f = probe(uv + t * vec2<f32>(2.0, 0.0));
    let g = probe(uv + t * vec2<f32>(-2.0, 2.0));
    let h = probe(uv + t * vec2<f32>(0.0, 2.0));
    let i = probe(uv + t * vec2<f32>(2.0, 2.0));
    let j = probe(uv + t * vec2<f32>(-1.0, -1.0));
    let k = probe(uv + t * vec2<f32>(1.0, -1.0));
    let l = probe(uv + t * vec2<f32>(-1.0, 1.0));
    let m = probe(uv + t * vec2<f32>(1.0, 1.0));
    let g0 = (j + k + l + m) * 0.25;
    let g1 = (a + b + d + e) * 0.25;
    let g2 = (b + c + e + f) * 0.25;
    let g3 = (d + e + g + h) * 0.25;
    let g4 = (e + f + h + i) * 0.25;
    if (karis) {
        // Karis-Mittel: jede Gruppe nach 1/(1 + Helligkeit) gewichtet – einzelne sehr helle Pixel flackern nicht
        let w0 = 0.5 / (1.0 + helligkeit(g0));
        let w1 = 0.125 / (1.0 + helligkeit(g1));
        let w2 = 0.125 / (1.0 + helligkeit(g2));
        let w3 = 0.125 / (1.0 + helligkeit(g3));
        let w4 = 0.125 / (1.0 + helligkeit(g4));
        return (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
    }
    return g0 * 0.5 + (g1 + g2 + g3 + g4) * 0.125;
}

@fragment
fn fs_vorfilter(a: AusVoll) -> @location(0) vec4<f32> {
    let t = 1.0 / vec2<f32>(textureDimensions(quelle));
    let c = max(dreizehn(a.uv, t, true), vec3<f32>(0.0)) * st.a.x;
    // weiche Schwelle (Knie = halbe Schwelle)
    let schwelle = st.a.z;
    let knie = schwelle * 0.5 + 1e-4;
    let hell = max(max(c.r, c.g), c.b);
    var weich = clamp(hell - schwelle + knie, 0.0, 2.0 * knie);
    weich = weich * weich / (4.0 * knie);
    let anteil = max(weich, hell - schwelle) / max(hell, 1e-4);
    return vec4<f32>(c * anteil, 1.0);
}

@fragment
fn fs_ab(a: AusVoll) -> @location(0) vec4<f32> {
    let t = 1.0 / vec2<f32>(textureDimensions(quelle));
    return vec4<f32>(dreizehn(a.uv, t, false), 1.0);
}

// Zelt 3 × 3 aus der kleineren Stufe, additiv in die größere gemischt; bloomWeite gewichtet die breiteren Stufen
@fragment
fn fs_auf(a: AusVoll) -> @location(0) vec4<f32> {
    let t = 1.0 / vec2<f32>(textureDimensions(quelle));
    var s = probe(a.uv) * 4.0;
    s = s + (probe(a.uv + vec2<f32>(-t.x, 0.0)) + probe(a.uv + vec2<f32>(t.x, 0.0)) + probe(a.uv + vec2<f32>(0.0, -t.y)) + probe(a.uv + vec2<f32>(0.0, t.y))) * 2.0;
    s = s + probe(a.uv - t) + probe(a.uv + t) + probe(a.uv + vec2<f32>(t.x, -t.y)) + probe(a.uv + vec2<f32>(-t.x, t.y));
    return vec4<f32>(s * (st.a.w / 16.0), 1.0);
}

// ACES (Stephen Hill): sRGB → ACES-Eingang, RRT+ODT-Näherung, zurück
fn aces(c: vec3<f32>) -> vec3<f32> {
    let ein = mat3x3<f32>(
        vec3<f32>(0.59719, 0.07600, 0.02840),
        vec3<f32>(0.35458, 0.90834, 0.13383),
        vec3<f32>(0.04823, 0.01566, 0.83777),
    );
    let aus = mat3x3<f32>(
        vec3<f32>(1.60475, -0.10208, -0.00327),
        vec3<f32>(-0.53108, 1.10813, -0.07276),
        vec3<f32>(-0.07367, -0.00605, 1.07602),
    );
    let v = ein * c;
    let r = (v * (v + vec3<f32>(0.0245786)) - vec3<f32>(0.000090537)) / (v * (0.983729 * v + vec3<f32>(0.4329510)) + vec3<f32>(0.238081));
    return clamp(aus * r, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn zu_srgb_n(c: vec3<f32>) -> vec3<f32> {
    let k = max(c, vec3<f32>(0.0));
    let hoch = 1.055 * pow(k, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
    let tief = k * 12.92;
    return select(hoch, tief, k <= vec3<f32>(0.0031308));
}

fn hash2(p: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715))));
}

// Abschluss: Pixel des HDR-Bilds 1 : 1 (gleiche Größe wie das Ziel), Bloom-Stufe 0 bilinear
@fragment
fn fs_abschluss(a: AusVoll) -> @location(0) vec4<f32> {
    let groesse = vec2<f32>(textureDimensions(quelle));
    let uv = a.pos.xy / groesse;
    let hdr = textureSampleLevel(quelle, s_lin, uv, 0.0).rgb;
    let bl = textureSampleLevel(bloom_t, s_lin, uv, 0.0).rgb;
    let w = st.a.w;
    let summe = select((1.0 - pow(w, BLOOM_STUFEN)) / max(1.0 - w, 1e-4), BLOOM_STUFEN, w > 0.9999);
    var c = hdr * st.a.x + select(vec3<f32>(0.0), bl * (st.a.y / summe), st.a.y > 0.0);
    c = aces(max(c, vec3<f32>(0.0)));
    // Sättigung (im Abbild, 0 = grau, 2 = doppelt)
    let l = helligkeit(c);
    c = clamp(mix(vec3<f32>(l), c, st.farbe.w), vec3<f32>(0.0), vec3<f32>(1.0));
    // Vignette: zu den Ecken dunkler (Seitenverhältnis berücksichtigt)
    let m = (uv - vec2<f32>(0.5)) * vec2<f32>(groesse.x / groesse.y, 1.0);
    c = c * (1.0 - st.b.x * smoothstep(0.35, 1.05, length(m) * 1.25));
    var s = zu_srgb_n(c);
    // Filmkorn (je Bild anders) und Rauschen gegen Farbstufen (±½ Stufe)
    let korn = hash2(a.pos.xy + vec2<f32>(fract(st.b.z * 7.13) * 619.0, fract(st.b.z * 3.71) * 283.0)) - 0.5;
    s = s + vec3<f32>(korn * st.b.y * 0.12 + (hash2(a.pos.xy) - 0.5) / 255.0);
    return vec4<f32>(s, 1.0);
}
