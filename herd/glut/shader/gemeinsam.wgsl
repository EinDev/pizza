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

// Stimmung (Abschnitt STIMMUNG, 64 B, an Bindung 17; ohne Abschnitt 0 → v1): mit Stimmung geben die 3D-Shader **linear** (HDR)
// aus, Belichtung/Tonkurve/Bloom macht der Abschluss (nachbild.wgsl). Dazu exponentieller Höhennebel.
struct Stimmung {
    a: vec4<f32>,       // belichtung, bloom, bloomSchwelle, bloomWeite
    nebel: vec4<f32>,   // dichte, hoehe, abfall, fern
    farbe: vec4<f32>,   // nebelFarbe linear, saettigung
    b: vec4<f32>,       // vignette, koernung, zeit, an
    spiegel: vec4<f32>, // spiegelung, spiegelHoehe, regen, spiegelGuete (0 einfach, 1 voll)
}
@group(0) @binding(17) var<uniform> stimmung: Stimmung;
// Spiegelbild (Stimmung.spiegelung): die gespiegelte Szene, halbe Größe (voll: volle), linear (im Spiegeldurchgang selbst ein
// Platzhalter)
@group(0) @binding(19) var spiegel_t: texture_2d<f32>;

// Bildschirmraum (H-K24, Abschnitt BILDRAUM; Glut-Block an Bindung 22 im Haupt- und Bildraum-Layout, ohne Abschnitt Nullen):
// a = Kern (verdeckung, verdeckungWeite, bildspiegel, an), b = (nah, fern, Verdeckung an, Bildraum-Spiegelung an),
// inv = Inverse von ansicht_proj (Glut, f64 gerechnet), ziel = eingepasstes Spielfeld in Zielpixeln (x, y, b, h),
// groesse = Zielgröße (b, h, 1/b, 1/h).
struct Bildraum {
    a: vec4<f32>,
    b: vec4<f32>,
    inv: mat4x4<f32>,
    ziel: vec4<f32>,
    groesse: vec4<f32>,
}
@group(0) @binding(22) var<uniform> bildraum: Bildraum;

// Spiegeldurchgang: SZENE.zahlen.y = 1, zahlen.z = Höhe der Ebene (die Glut schreibt eine gespiegelte Kopie von SZENE)
fn im_spiegel() -> bool {
    return szene.zahlen.y > 0.5;
}

fn hdr_an() -> bool {
    return stimmung.b.w > 0.5;
}

// Anteil des Höhennebels auf dem Weg von c nach p: Dichte(y) = dichte · e^(−abfall · (y − hoehe)), geschlossen integriert
fn hoehennebel(c: vec3<f32>, p: vec3<f32>) -> f32 {
    let dichte = stimmung.nebel.x;
    let abfall = max(stimmung.nebel.z, 1e-4);
    let v = p - c;
    let l = length(v);
    let k = clamp(abfall * v.y, -60.0, 60.0);
    let faktor = select((1.0 - exp(-k)) / k, 1.0 - 0.5 * k, abs(k) < 1e-3);
    let basis = dichte * exp(clamp(-abfall * (c.y - stimmung.nebel.y), -60.0, 60.0));
    let tau = max(basis * l * faktor, 0.0);
    return select(0.0, 1.0 - exp(-tau), dichte > 0.0);
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

// Rauschen gegen Farbstufen in Verläufen (±½ Stufe), nur von der Pixelposition abhängig.
fn rauschen(p: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715)))) - 0.5;
}

// ---- Wind (H-K27) ----
// Block WIND (Bindung 24 in licht.wgsl und schatten.wgsl, ohne Abschnitt Nullen): a = Richtung x, z (normiert), staerke, 1 = an ·
// b = boeen, Phase der Welle (Bogenmaß), Böen-Versatz (Rauschzellen 0 … 256), tempo. Ausschlag einer Ecke in Welt: quadratisch mit
// der Höhe `h` über dem Netz-Ursprung (Welt-Maß), Phase aus der Weltlage `o` der Instanz, Böen aus Wertrauschen (Ganzzahl-Hash, in
// Windrichtung mit dem Versatz wandernd, Zellen in Windrichtung mod 256 – nahtlos, wenn der Versatz umläuft); die Spitze sinkt
// dabei etwas ab (Länge bleibt ungefähr). `wiegen` aus ZUSATZ3D.merkmale Bits 2–7 (· 63).
fn wind_hash(x: i32, y: i32) -> f32 {
    var h = (bitcast<u32>(x) & 255u) * 374761393u + bitcast<u32>(y) * 668265263u;
    h = (h ^ (h >> 13u)) * 1274126177u;
    h = h ^ (h >> 16u);
    return f32(h & 65535u) / 65535.0;
}

fn wind_boe(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = p - i;
    let u = f * f * (3.0 - 2.0 * f);
    let x = i32(i.x);
    let y = i32(i.y);
    return mix(mix(wind_hash(x, y), wind_hash(x + 1, y), u.x), mix(wind_hash(x, y + 1), wind_hash(x + 1, y + 1), u.x), u.y);
}

fn wiegen_versatz(a: vec4<f32>, b: vec4<f32>, merkmale: u32, o: vec3<f32>, h: f32) -> vec3<f32> {
    let wiegen = f32((merkmale >> 2u) & 63u) / 63.0;
    let d = a.xy;
    let laengs = dot(o.xz, d);
    let quer = dot(o.xz, vec2<f32>(-d.y, d.x));
    let ph = b.y - 0.45 * laengs;
    let welle = 0.72 + 0.2 * sin(ph) + 0.08 * sin(2.7 * ph + 0.9 * quer);
    let boe = mix(1.0, 0.2 + 1.6 * wind_boe(vec2<f32>(laengs * 0.06 - b.z, quer * 0.06)), b.x);
    let aus = min(wiegen * a.z * 0.3 * h * h * welle * boe, 1.5 * h);
    let senk = min(aus * aus / (2.0 * max(h, 0.001)), 0.5 * h);
    return vec3<f32>(d.x * aus, -senk, d.y * aus);
}

// ---- Eigene Texturen (TEXTUR, PROJEKTE PD3) ----
// Fünf Größenklassen (Kante 128 · 2^k, k = 0 … 4), je ein Textur-Array mit voller Mip-Kette; ein Bild = eine Schicht, Stufe i
// des Teiglings liegt bei (0, 0) der Mip-Ebene i, **vormultipliziert** gespeichert. Abtastung: vergrößern nächster Nachbar
// (Stufe 0, pixelscharf), verkleinern trilinear (zwei bilineare Stufen, je auf das Bildrechteck dieser Stufe geklemmt – kein
// Übersprechen zwischen Rahmen-Neunteln oder in den leeren Rest der Schicht). Die Stufe λ kommt aus den Bildschirmableitungen der
// Texel-Koordinaten (`eigen_lambda`, im gleichförmigen Kontrollfluss am Anfang des Fragment-Shaders), danach nur explizite
// Stufen – damit dürfen die Abtastungen in Verzweigungen stehen (naga/WebGL2) und WebGPU, WebGL2 und nativ rechnen gleich.
@group(0) @binding(7) var eigen0: texture_2d_array<f32>;
@group(0) @binding(8) var eigen1: texture_2d_array<f32>;
@group(0) @binding(9) var eigen2: texture_2d_array<f32>;
@group(0) @binding(10) var eigen3: texture_2d_array<f32>;
@group(0) @binding(11) var eigen4: texture_2d_array<f32>;
@group(0) @binding(12) var eigen_s: sampler;

// Stufe (log2 der Texel je Gerätepixel, isotrop) aus den Ableitungen der Texel-Koordinaten `t` (Pixel der Stufe 0).
fn eigen_lambda(t: vec2<f32>) -> f32 {
    let dx = dpdx(t);
    let dy = dpdy(t);
    return 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-12));
}

fn eigen_lade(k: u32, t: vec2<i32>, s: i32) -> vec4<f32> {
    var r = vec4<f32>(0.0);
    switch k {
        case 0u: { r = textureLoad(eigen0, t, s, 0); }
        case 1u: { r = textureLoad(eigen1, t, s, 0); }
        case 2u: { r = textureLoad(eigen2, t, s, 0); }
        case 3u: { r = textureLoad(eigen3, t, s, 0); }
        default: { r = textureLoad(eigen4, t, s, 0); }
    }
    return r;
}

fn eigen_probe(k: u32, uv: vec2<f32>, s: i32, stufe: f32) -> vec4<f32> {
    var r = vec4<f32>(0.0);
    switch k {
        case 0u: { r = textureSampleLevel(eigen0, eigen_s, uv, s, stufe); }
        case 1u: { r = textureSampleLevel(eigen1, eigen_s, uv, s, stufe); }
        case 2u: { r = textureSampleLevel(eigen2, eigen_s, uv, s, stufe); }
        case 3u: { r = textureSampleLevel(eigen3, eigen_s, uv, s, stufe); }
        default: { r = textureSampleLevel(eigen4, eigen_s, uv, s, stufe); }
    }
    return r;
}

// bilinear in Stufe `stufe` (ganzzahlig), Punkt `p` und Rechteck `box` (u0 v0 u1 v1) in Pixeln der Stufe 0
fn eigen_bilinear(k: u32, s: i32, p: vec2<f32>, box: vec4<f32>, stufe: f32) -> vec4<f32> {
    let f = exp2(stufe);
    let lo = box.xy / f + vec2<f32>(0.5);
    let hi = max(floor(box.zw / f) - vec2<f32>(0.5), lo);
    let q = clamp(p / f, lo, hi);
    let kante = f32(128u << k) / f;
    return eigen_probe(k, q / kante, s, stufe);
}

// Farbe (nicht vormultipliziert) des Bildes in Klasse `k`, Schicht `s` am Punkt `p` (Pixel der Stufe 0), geklemmt auf `box`.
fn eigen_abtasten(k: u32, s: i32, p: vec2<f32>, box: vec4<f32>, lambda: f32) -> vec4<f32> {
    var c: vec4<f32>;
    // bis 1/16 Stufe über 0 (Rechenrauschen bei 1 : 1) gilt als Vergrößerung
    if (lambda <= 0.0625) {
        let t = clamp(floor(p), box.xy, max(box.zw - vec2<f32>(1.0), box.xy));
        c = eigen_lade(k, vec2<i32>(t), s);
    } else {
        let g = max(box.zw - box.xy, vec2<f32>(1.0));
        let oben = min(floor(log2(max(g.x, g.y))), f32(7u + k));
        let l = min(lambda, oben);
        let l0 = floor(l);
        c = eigen_bilinear(k, s, p, box, l0);
        if (l0 < oben) {
            c = mix(c, eigen_bilinear(k, s, p, box, l0 + 1.0), l - l0);
        }
    }
    return vec4<f32>(c.rgb / max(c.a, 1.0 / 512.0), c.a);
}
