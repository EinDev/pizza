// 3D beleuchtet (INST3D, 72 Bytes je Instanz): Halbkugel-Umgebungslicht, Sonne (Lambert + Blinn-Phong) mit weichem
// PCF-Schatten, bis zu 8 Punktlichter, Eigenleuchten, Atlas-Textur (pixelscharf), linearer Nebel. Linear rechnen, sRGB ausgeben.
// Material-Zusatz (ZUSATZ3D, 16 Bytes je Instanz, alles 0 = wie oben): Kachelung (uv oder Welt-Abbildung nach der größten
// Normalenkomponente), Relief (Normale + Rauheit, Tangenten aus der Abbildung bzw. aus den Bildschirmableitungen), Modell pbr
// (GGX + Smith + Schlick, Metall, Umgebungsglanz), Nässe (Pfützen aus Rauschen in Weltlage, feuchte Flächen dunkler und glatter).

// Schatten-Tiefentextur: Schichten à 2048² – Schicht 0 = Sonne (v1) bzw. die Kaskaden, dahinter die Atlas-Seiten der
// Punkt-/Spot-Kacheln (H-K18); ein Textur-Array, eine Textureinheit, ein Vergleichs-Sampler
@group(0) @binding(2) var schatten_t: texture_depth_2d_array;
@group(0) @binding(3) var vergleich: sampler_comparison;

// Schatten für Punkt-/Spotlichter und Sonnen-Kaskaden (Abschnitt SCHATTENLICHTER, Bindung 18; ohne Abschnitt Nullen → v1)
struct SchattenAnsicht {
    vp: mat4x4<f32>,
    rect: vec4<f32>,    // Schicht, x, y, Kante (Texel)
    texel: vec4<f32>,   // x = Weltmaß eines Texels (Kaskade) bzw. je Einheit Abstand (Kachel)
}
struct Schattenlichter {
    kopf: vec4<f32>,                        // an, Kaskaden (0 = Sonne über SZENE), Weichheit der Sonne, Ansichten
    kaskaden: array<vec4<f32>, 4>,          // Normalenversatz (Welt), Tiefen-Bias
    plaetze: array<vec4<f32>, 8>,           // erste Ansicht, Zahl (1 Spot, 6 Würfel), Weichheit
    ansichten: array<SchattenAnsicht, 52>,  // erst die Kaskaden, dann die Kacheln
}
@group(0) @binding(18) var<uniform> schatten2: Schattenlichter;
@group(0) @binding(4) var atlas: texture_2d_array<f32>;

// Viele Lichter (Abschnitt LICHTER, Clustered Forward): Kopf, je Licht 3 Texel (pos+reichweite, farbe+cos außen,
// richtung+cos innen) und die Zellen-Wörter (Köpfe `versatz << 8 | anzahl`, dann Licht-Indizes). raster.w = 0 → aus.
// Im Spiegeldurchgang ist Bindung 14 der Kopf von LICHTER_SPIEGEL (H-K21, spiegelGuete voll): Zellen der gespiegelten Kamera
// ab Wort frei.x derselben Zellen-Textur; ohne (einfach) Nullen → die 8 Lichter aus SZENE.
struct Lichter {
    raster: vec4<f32>,   // Kacheln x, y, Scheiben z, Anzahl Lichter
    tiefe: vec4<f32>,    // nah, Scheiben je ln-Einheit, fern, 0
    vorn: vec4<f32>,     // Blickrichtung der Kamera
    frei: vec4<f32>,     // x = erstes Wort der Zellen-Tabelle (LICHTER: 0)
}
@group(0) @binding(14) var<uniform> lichter: Lichter;
@group(0) @binding(15) var lichter_t: texture_2d<f32>;
@group(0) @binding(16) var zellen_t: texture_2d<u32>;
// Kachelung über eigen_s (wiederholend, trilinear, anisotrop wenn möglich) mit textureSampleGrad (Ableitungen vorab berechnet)

fn eigen_kachel(k: u32, s: i32, uv: vec2<f32>, gx: vec2<f32>, gy: vec2<f32>) -> vec4<f32> {
    var r = vec4<f32>(0.0);
    switch k {
        case 0u: { r = textureSampleGrad(eigen0, eigen_s, uv, s, gx, gy); }
        case 1u: { r = textureSampleGrad(eigen1, eigen_s, uv, s, gx, gy); }
        case 2u: { r = textureSampleGrad(eigen2, eigen_s, uv, s, gx, gy); }
        case 3u: { r = textureSampleGrad(eigen3, eigen_s, uv, s, gx, gy); }
        default: { r = textureSampleGrad(eigen4, eigen_s, uv, s, gx, gy); }
    }
    return vec4<f32>(r.rgb / max(r.a, 1.0 / 512.0), r.a);
}

// Welt-Abbildung: Kachelkoordinate und Tangenten (T = u-Richtung, B = Bild-oben) je nach größter Normalenkomponente
fn welt_uv(p: vec3<f32>, ng: vec3<f32>) -> vec2<f32> {
    let an = abs(ng);
    let ist_y = an.y >= an.x && an.y >= an.z;
    let ist_x = !ist_y && an.x >= an.z;
    let uy = vec2<f32>(p.x, select(-p.z, p.z, ng.y > 0.0));
    let ux = vec2<f32>(select(p.z, -p.z, ng.x > 0.0), -p.y);
    let uz = vec2<f32>(select(-p.x, p.x, ng.z > 0.0), -p.y);
    return select(select(uz, ux, ist_x), uy, ist_y);
}
fn welt_t(ng: vec3<f32>) -> vec3<f32> {
    let an = abs(ng);
    let ist_y = an.y >= an.x && an.y >= an.z;
    let ist_x = !ist_y && an.x >= an.z;
    let tx = vec3<f32>(0.0, 0.0, select(1.0, -1.0, ng.x > 0.0));
    let tz = vec3<f32>(select(-1.0, 1.0, ng.z > 0.0), 0.0, 0.0);
    return select(select(tz, tx, ist_x), vec3<f32>(1.0, 0.0, 0.0), ist_y);
}
fn welt_b(ng: vec3<f32>) -> vec3<f32> {
    let an = abs(ng);
    let ist_y = an.y >= an.x && an.y >= an.z;
    return select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0, 0.0, select(1.0, -1.0, ng.y > 0.0)), ist_y);
}

// Ganzzahl-Hash → [0, 1) und Wertrauschen (für Pfützen; gleich auf allen Schnittstellen)
fn h2(p: vec2<f32>) -> f32 {
    let q = bitcast<vec2<u32>>(vec2<i32>(p));
    var h = (q.x * 1597334677u) ^ (q.y * 3812015801u);
    h = h * 747796405u + 2891336453u;
    h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
    h = (h >> 22u) ^ h;
    return f32(h & 16777215u) / 16777216.0;
}
fn rauschen2(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (vec2<f32>(3.0) - 2.0 * f);
    let a = h2(i);
    let b = h2(i + vec2<f32>(1.0, 0.0));
    let c = h2(i + vec2<f32>(0.0, 1.0));
    let d = h2(i + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const PI: f32 = 3.14159265;

// Regenringe (Stimmung.regen): zwei Lagen Zellen (0,6 m und 0,37 m), je Zelle und Takt (0,8 s, Phase je Zelle) ein
// Tropfen an zufälliger Stelle mit Wahrscheinlichkeit ~ regen; der Ring läuft nach außen und verebbt. Liefert die Neigung
// der Normale (x, z) – Summe der Ableitungen der Wellen, aus dem Ganzzahl-Hash (gleich auf allen Schnittstellen).
fn regenringe(p: vec2<f32>, zeit: f32, regen: f32) -> vec2<f32> {
    var g = vec2<f32>(0.0);
    for (var lage = 0; lage < 2; lage = lage + 1) {
        let gr = select(0.6, 0.37, lage == 1);
        let versatz = select(vec2<f32>(0.0), vec2<f32>(113.0, 71.0), lage == 1);
        let q = p / gr;
        let basis = floor(q);
        for (var j = -1; j <= 1; j = j + 1) {
            for (var i = -1; i <= 1; i = i + 1) {
                let zelle = basis + vec2<f32>(f32(i), f32(j)) + versatz;
                let phase = h2(zelle + vec2<f32>(37.0, 11.0));
                let t = zeit / 0.8 + phase;
                let runde = floor(t);
                let tt = t - runde;
                let k = zelle + vec2<f32>(runde * 7.0, runde * 13.0);
                if (h2(k + vec2<f32>(3.0, 5.0)) < regen * 0.85 + 0.05) {
                    let mitte = (zelle - versatz + vec2<f32>(0.15, 0.15) + vec2<f32>(h2(k), h2(k + vec2<f32>(19.0, 2.0))) * 0.7) * gr;
                    let d = p - mitte;
                    let l = length(d);
                    let radius = tt * 0.42 * gr;
                    let x = (l - radius) / (0.05 * gr);
                    // Welle sin(2x) · e^(−x²) → Ableitung nach l, verebbend mit dem Alter
                    let e = exp(-x * x);
                    let ab = (2.0 * cos(2.0 * x) - 2.0 * x * sin(2.0 * x)) * e;
                    let alt = (1.0 - tt) * (1.0 - tt);
                    g = g + d / max(l, 1e-4) * (ab * alt * 0.22);
                }
            }
        }
    }
    return g * min(regen * 1.5 + 0.25, 1.0);
}

// GGX-Glanz (Smith-Sichtbarkeit nach Heitz, Fresnel nach Schlick), schon × π × N·L (Lambert ohne 1/π wie die Engine)
fn ggx(n: vec3<f32>, v: vec3<f32>, l: vec3<f32>, rauh: f32, f0: vec3<f32>) -> vec3<f32> {
    let h = normalize(l + v);
    let ndl = max(dot(n, l), 0.0);
    let ndv = max(dot(n, v), 1e-4);
    let ndh = max(dot(n, h), 0.0);
    let vdh = max(dot(v, h), 0.0);
    let a = rauh * rauh;
    let a2 = a * a;
    let q = ndh * ndh * (a2 - 1.0) + 1.0;
    let d = a2 / (PI * q * q);
    let sicht = 0.5 / max(ndl * sqrt(ndv * ndv * (1.0 - a2) + a2) + ndv * sqrt(ndl * ndl * (1.0 - a2) + a2), 1e-5);
    let f = f0 + (vec3<f32>(1.0) - f0) * pow(1.0 - vdh, 5.0);
    return f * (d * sicht * PI * ndl);
}

fn zellwort(i: u32) -> u32 {
    return textureLoad(zellen_t, vec2<i32>(i32(i & 1023u), i32(i >> 10u)), 0).x;
}
fn licht_texel(i: u32, k: u32) -> vec4<f32> {
    return textureLoad(lichter_t, vec2<i32>(i32((i & 63u) * 3u + k), i32(i >> 6u)), 0);
}
// Index der Zelle (Kachel x, y aus der NDC-Lage, Scheibe aus der Tiefe entlang der Blickrichtung) – wie `herd_kern::lichter`
fn zelle(welt: vec3<f32>) -> u32 {
    let n = lichter.raster.xyz;
    let clip = szene.ansicht_proj * vec4<f32>(welt, 1.0);
    let ndc = clip.xy / max(clip.w, 1e-6);
    let tx = u32(clamp(floor((ndc.x * 0.5 + 0.5) * n.x), 0.0, n.x - 1.0));
    let ty = u32(clamp(floor((ndc.y * 0.5 + 0.5) * n.y), 0.0, n.y - 1.0));
    let d = max(dot(welt - szene.kamera.xyz, lichter.vorn.xyz), lichter.tiefe.x);
    let s = u32(clamp(floor(log(d / lichter.tiefe.x) * lichter.tiefe.y), 0.0, n.z - 1.0));
    return u32(lichter.frei.x) + (s * u32(n.y) + ty) * u32(n.x) + tx;
}

struct EinNetz {
    @location(0) pos: vec3<f32>,
    @location(1) normale: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) z0: vec4<f32>,       // Welt-Matrix zeilenweise (3 × 4)
    @location(4) z1: vec4<f32>,
    @location(5) z2: vec4<f32>,
    @location(6) farbe: vec4<f32>,    // sRGB
    @location(7) material: vec2<f32>, // glanz, leuchten
    @location(8) uvbox: vec4<u32>,    // Atlas-Pixel u0 v0 u1 v1
    @location(9) textur: u32,         // Bits 0–15 Seite, Bit 16 = hat Textur, Bit 17 = eigene Textur (PD3)
    @location(10) relief: u32,        // ZUSATZ3D: Relief wie textur (0 = keins)
    @location(11) km: vec2<f32>,      // kachel, metall
    @location(12) merkmale: u32,      // Bit 0 pbr, Bit 1 Welt-Abbildung, Bits 8–15 nass · 255
    @location(13) karten: vec4<u32>,  // KARTEN3D (H-K26): normal, stoff, leucht (Kennwörter wie relief), leuchtfarbe|schwelle
}

struct AusNetz {
    @builtin(position) pos: vec4<f32>,
    @location(0) welt: vec3<f32>,
    @location(1) normale: vec3<f32>,
    @location(2) uv: vec2<f32>,                         // Atlas-Pixel relativ zu (u0, v0)
    @location(3) @interpolate(flat) farbe: vec4<f32>,   // linear rgb, a
    @location(4) @interpolate(flat) material: vec2<f32>,
    @location(5) @interpolate(flat) uvbox: vec4<f32>,
    @location(6) @interpolate(flat) textur: u32,
    @location(7) roh: vec2<f32>,                        // Netz-UV 0 … 1
    @location(8) @interpolate(flat) zus: vec4<u32>,     // relief, kachel (Bits), metall (Bits), merkmale
    @location(9) @interpolate(flat) karten: vec4<u32>,  // KARTEN3D (H-K26)
}

@vertex
fn vs_licht(e: EinNetz) -> AusNetz {
    let p = vec4<f32>(e.pos, 1.0);
    let w = vec3<f32>(dot(e.z0, p), dot(e.z1, p), dot(e.z2, p));
    // Normalenmatrix = Kofaktoren der 3 × 3 (Spalten c0, c1, c2 → c1×c2, c2×c0, c0×c1)
    let c0 = vec3<f32>(e.z0.x, e.z1.x, e.z2.x);
    let c1 = vec3<f32>(e.z0.y, e.z1.y, e.z2.y);
    let c2 = vec3<f32>(e.z0.z, e.z1.z, e.z2.z);
    let n = cross(c1, c2) * e.normale.x + cross(c2, c0) * e.normale.y + cross(c0, c1) * e.normale.z;
    var a: AusNetz;
    a.pos = szene.ansicht_proj * vec4<f32>(w, 1.0);
    a.welt = w;
    a.normale = n;
    let box = vec4<f32>(e.uvbox);
    a.uv = e.uv * (box.zw - box.xy);
    a.farbe = vec4<f32>(zu_linear(e.farbe.rgb), e.farbe.a);
    a.material = e.material;
    a.uvbox = box;
    a.textur = e.textur;
    a.roh = e.uv;
    a.zus = vec4<u32>(e.relief, bitcast<u32>(e.km.x), bitcast<u32>(e.km.y), e.merkmale);
    a.karten = e.karten;
    return a;
}

// Weicher PCF-Zeltfilter über 5 × 5 Texel aus 9 bilinearen Vergleichen (Castaño, „Shadow Mapping Summary“, 2013):
// glatte Kanten ohne Treppen, auch bei großen Texeln (flache Sonne).
fn zeltfilter(uv: vec2<f32>, bezug: f32) -> f32 {
    let t = szene.schatten.x;                  // 1 / Größe
    let p = uv / t;                            // Texel-Koordinaten
    let basis = floor(p + vec2<f32>(0.5));
    let st = p + vec2<f32>(0.5) - basis;
    let b = (basis - vec2<f32>(0.5)) * t;
    let w0 = vec2<f32>(4.0) - 3.0 * st;
    let w1 = vec2<f32>(7.0);
    let w2 = vec2<f32>(1.0) + 3.0 * st;
    let o0 = (vec2<f32>(3.0) - 2.0 * st) / w0 - vec2<f32>(2.0);
    let o1 = (vec2<f32>(3.0) + st) / w1;
    let o2 = st / w2 + vec2<f32>(2.0);
    var summe = 0.0;
    summe = summe + w0.x * w0.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o0.x, o0.y) * t, 0, bezug);
    summe = summe + w1.x * w0.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o1.x, o0.y) * t, 0, bezug);
    summe = summe + w2.x * w0.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o2.x, o0.y) * t, 0, bezug);
    summe = summe + w0.x * w1.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o0.x, o1.y) * t, 0, bezug);
    summe = summe + w1.x * w1.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o1.x, o1.y) * t, 0, bezug);
    summe = summe + w2.x * w1.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o2.x, o1.y) * t, 0, bezug);
    summe = summe + w0.x * w2.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o0.x, o2.y) * t, 0, bezug);
    summe = summe + w1.x * w2.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o1.x, o2.y) * t, 0, bezug);
    summe = summe + w2.x * w2.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o2.x, o2.y) * t, 0, bezug);
    return summe / 144.0;
}

// ---- H-K18: freier Zeltfilter (Kacheln, Kaskaden, schattenWeich ≠ 1) ----
// eine bilineare Vergleichs-Abtastung an Texel-Lage p (Schicht s), auf [lo, hi] geklemmt (kein Übersprechen zur Nachbarkachel)
fn schatten_probe(p: vec2<f32>, s: i32, lo: vec2<f32>, hi: vec2<f32>, groesse: f32, bezug: f32) -> f32 {
    return textureSampleCompareLevel(schatten_t, vergleich, clamp(p, lo, hi) / groesse, s, bezug);
}

// Zeltfilter wie `zeltfilter` (9 bilineare Vergleiche, Castaño 2013), aber mit Texel-Schritt w (Radius ≈ 2,5 · w Texel);
// w = 0: ein bilinearer Vergleich. p = Texel-Lage in der Schicht.
fn zelt_frei(p: vec2<f32>, s: i32, lo: vec2<f32>, hi: vec2<f32>, w: f32, bezug: f32) -> f32 {
    let g = f32(textureDimensions(schatten_t).x);
    if (w < 0.01) {
        return schatten_probe(p, s, lo, hi, g, bezug);
    }
    let q = p / w;
    let basis = floor(q + vec2<f32>(0.5));
    let st = q + vec2<f32>(0.5) - basis;
    let b = (basis - vec2<f32>(0.5)) * w;
    let w0 = vec2<f32>(4.0) - 3.0 * st;
    let w1 = vec2<f32>(7.0);
    let w2 = vec2<f32>(1.0) + 3.0 * st;
    let o0 = ((vec2<f32>(3.0) - 2.0 * st) / w0 - vec2<f32>(2.0)) * w;
    let o1 = ((vec2<f32>(3.0) + st) / w1) * w;
    let o2 = (st / w2 + vec2<f32>(2.0)) * w;
    var summe = 0.0;
    summe = summe + w0.x * w0.y * schatten_probe(b + vec2<f32>(o0.x, o0.y), s, lo, hi, g, bezug);
    summe = summe + w1.x * w0.y * schatten_probe(b + vec2<f32>(o1.x, o0.y), s, lo, hi, g, bezug);
    summe = summe + w2.x * w0.y * schatten_probe(b + vec2<f32>(o2.x, o0.y), s, lo, hi, g, bezug);
    summe = summe + w0.x * w1.y * schatten_probe(b + vec2<f32>(o0.x, o1.y), s, lo, hi, g, bezug);
    summe = summe + w1.x * w1.y * schatten_probe(b + vec2<f32>(o1.x, o1.y), s, lo, hi, g, bezug);
    summe = summe + w2.x * w1.y * schatten_probe(b + vec2<f32>(o2.x, o1.y), s, lo, hi, g, bezug);
    summe = summe + w0.x * w2.y * schatten_probe(b + vec2<f32>(o0.x, o2.y), s, lo, hi, g, bezug);
    summe = summe + w1.x * w2.y * schatten_probe(b + vec2<f32>(o1.x, o2.y), s, lo, hi, g, bezug);
    summe = summe + w2.x * w2.y * schatten_probe(b + vec2<f32>(o2.x, o2.y), s, lo, hi, g, bezug);
    return summe / 144.0;
}

// Sonne mit Abschnitt SCHATTENLICHTER: Kaskaden (die erste, die den Punkt mit Filterrand enthält; am Rand der letzten weich
// ausgeblendet) oder die v1-Matrix aus SZENE mit anderer Weichheit
fn sonne_neu(welt: vec3<f32>, n: vec3<f32>, ndl: f32) -> f32 {
    if (szene.sonne_richtung.w < 0.5) {
        return 1.0;
    }
    let k = u32(schatten2.kopf.y + 0.5);
    let w = schatten2.kopf.z;
    let schief = 0.5 + 1.5 * (1.0 - ndl);
    if (k == 0u) {
        let lp = szene.licht_proj * vec4<f32>(welt + n * (szene.schatten.y * schief), 1.0);
        let ndc = lp.xyz / lp.w;
        let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
        let g = 1.0 / szene.schatten.x;
        let s = zelt_frei(uv * g, 0, vec2<f32>(0.5), vec2<f32>(g - 0.5), w, ndc.z - szene.schatten.z);
        let rand = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
        let ergebnis = mix(1.0, s, clamp(rand * 40.0, 0.0, 1.0));
        return select(ergebnis, 1.0, rand <= 0.0 || ndc.z >= 1.0 || ndc.z <= 0.0);
    }
    for (var c = 0u; c < 4u; c = c + 1u) {
        if (c < k) {
            let kp = schatten2.kaskaden[c];
            let a = schatten2.ansichten[c];
            let lp = a.vp * vec4<f32>(welt + n * (kp.x * schief), 1.0);
            let ndc = lp.xyz / lp.w;
            let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
            let g = a.rect.w;
            let innen = (2.5 * max(w, 0.4) + 2.0) / g;
            let rand = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
            if (rand > innen && ndc.z < 1.0 && ndc.z > 0.0) {
                let s = zelt_frei(uv * g, i32(a.rect.x + 0.5), vec2<f32>(0.5), vec2<f32>(g - 0.5), w, ndc.z - kp.y);
                if (c + 1u == k) {
                    return mix(1.0, s, clamp((rand - innen) * 40.0, 0.0, 1.0));
                }
                return s;
            }
        }
    }
    return 1.0;
}

// Anteil Licht eines Punkt-/Spotlichts mit Schatten-Platz `platz` (0 … 7) am Weltpunkt: Würfelseite nach der größten Achse
// (keine Cube-Map), Normalen- und Lichtversatz in Texeln der Kachel, Zeltfilter innerhalb der Kachel
fn punktschatten(platz: u32, welt: vec3<f32>, n: vec3<f32>, lpos: vec3<f32>) -> f32 {
    let p = schatten2.plaetze[platz];
    let d = welt - lpos;
    let ad = abs(d);
    var seite = 0u;
    if (p.y > 1.5) {
        if (ad.x >= ad.y && ad.x >= ad.z) {
            seite = select(1u, 0u, d.x > 0.0);
        } else if (ad.y >= ad.z) {
            seite = select(3u, 2u, d.y > 0.0);
        } else {
            seite = select(5u, 4u, d.z > 0.0);
        }
    }
    let a = schatten2.ansichten[u32(p.x + 0.5) + seite];
    let abst = length(d);
    // Weltmaß eines Texels an dieser Stelle, mal Filterbreite (breite Zelte brauchen mehr Abstand gegen Akne)
    let tw = a.texel.x * abst * (1.0 + p.z);
    let ld = -d / max(abst, 1e-4);
    let ndl = max(dot(n, ld), 0.0);
    let q = welt + n * (tw * (0.75 + 1.5 * (1.0 - ndl))) + ld * tw;
    let c = a.vp * vec4<f32>(q, 1.0);
    let ndc = c.xyz / max(c.w, 1e-6);
    let aussen = c.w <= 1e-6 || ndc.z >= 1.0 || ndc.z <= 0.0 || abs(ndc.x) >= 1.0 || abs(ndc.y) >= 1.0;
    let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    let r = a.rect;
    let s = zelt_frei(r.yz + uv * r.w, i32(r.x + 0.5), r.yz + vec2<f32>(0.5), r.yz + vec2<f32>(r.w - 0.5), p.z, ndc.z);
    return select(s, 1.0, aussen);
}

// Schatten-Faktor eines Zellen-Eintrags (Bits 16 … 19 = Platz + 1, 0 = ohne Schatten)
fn zellschatten(wort: u32, welt: vec3<f32>, n: vec3<f32>, lpos: vec3<f32>) -> f32 {
    let platz = wort >> 16u;
    if (platz == 0u) {
        return 1.0;
    }
    return punktschatten(platz - 1u, welt, n, lpos);
}

// Anteil Sonnenlicht (1 = voll beleuchtet).
fn sonnenlicht(welt: vec3<f32>, n: vec3<f32>, ndl: f32) -> f32 {
    // H-K18: Kaskaden oder andere Weichheit über den Abschnitt SCHATTENLICHTER (sonne_neu); sonst unverändert v1
    if (schatten2.kopf.x > 0.5 && (schatten2.kopf.y > 0.5 || schatten2.kopf.z != 1.0)) {
        return sonne_neu(welt, n, ndl);
    }
    // Normalenversatz gegen Akne: ein halber Texel, bei streifendem Licht bis 2 Texel (mehr löst Schatten ab)
    let versatz = n * (szene.schatten.y * (0.5 + 1.5 * (1.0 - ndl)));
    let lp = szene.licht_proj * vec4<f32>(welt + versatz, 1.0);
    let ndc = lp.xyz / lp.w;
    let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    let bezug = ndc.z - szene.schatten.z;
    let s = zeltfilter(uv, bezug);
    // am Rand der Shadow-Map weich ausblenden
    let rand = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    let blende = clamp(rand * 40.0, 0.0, 1.0);
    let ergebnis = mix(1.0, s, blende);
    let aus = szene.sonne_richtung.w < 0.5 || rand <= 0.0 || ndc.z >= 1.0 || ndc.z <= 0.0;
    return select(ergebnis, 1.0, aus);
}

// Oberfläche eines pbr-Fragments nach Nässe, Pfützen und Regen (auch für den Bildraum-Vorlauf, H-K24)
struct PbrFlaeche {
    n: vec3<f32>,
    albedo: vec3<f32>,
    rauh: f32,
}

// Physikalisches Licht (Modell pbr): Rauheit aus glanz bzw. Relief, Metall, Nässe (Pfützen auf nach oben zeigenden Flächen,
// feuchte Flächen dunkler und glatter); Sonne, Lichter (Zellen oder die 8 aus SZENE), Halbkugel-Umgebung diffus und gespiegelt.
fn pbr_flaeche(welt: vec3<f32>, n0: vec3<f32>, ng: vec3<f32>, albedo0: vec3<f32>, glanz: f32, karte: f32, hat_karte: bool,
               nass: f32) -> PbrFlaeche {
    var n = n0;
    var albedo = albedo0;
    var rauh = select(1.0 - glanz, karte * (2.0 - 2.0 * glanz), hat_karte);
    // Nässe: Pfützen (Rauschen in Weltlage, nur auf Flächen nach oben), sonst feucht
    let rp = rauschen2(welt.xz * 0.23) * 0.62 + rauschen2(welt.xz * 0.61 + vec2<f32>(17.0, 3.0)) * 0.28 + rauschen2(welt.xz * 1.9) * 0.1;
    let schwelle = 1.0 - 0.55 * nass;
    let pfuetze = select(0.0, smoothstep(schwelle, schwelle + 0.035, rp) * smoothstep(0.75, 0.9, ng.y), nass > 0.0);
    rauh = rauh * (1.0 - 0.45 * nass);
    albedo = albedo * (1.0 - 0.3 * nass);
    rauh = mix(rauh, 0.05, pfuetze);
    albedo = albedo * (1.0 - 0.55 * pfuetze);
    n = normalize(mix(n, ng, pfuetze));
    // Regen (Stimmung.regen): Ringe auf nassen Flächen nach oben (in Pfützen voll, auf feuchtem Belag schwächer),
    // Rinnsale an nassen Wänden (glatter, etwas dunkler, laufen nach unten)
    let regen = select(0.0, stimmung.spiegel.z, hdr_an() && !im_spiegel());
    if (regen > 0.0 && nass > 0.0) {
        let oben = smoothstep(0.75, 0.9, ng.y);
        if (oben > 0.0) {
            let g = regenringe(welt.xz, stimmung.b.z, regen) * (oben * mix(0.3, 1.0, pfuetze));
            n = normalize(n + vec3<f32>(g.x, 0.0, g.y));
        }
        let wand = 1.0 - smoothstep(0.3, 0.6, abs(ng.y));
        if (wand > 0.0) {
            let u = dot(welt.xz, normalize(vec2<f32>(-ng.z, ng.x) + vec2<f32>(1e-5, 0.0)));
            let fluss = rauschen2(vec2<f32>(u * 7.0, welt.y * 0.8 + stimmung.b.z * 1.3));
            let rinnsal = smoothstep(0.62, 0.8, fluss) * smoothstep(0.35, 0.6, rauschen2(vec2<f32>(u * 2.3, 5.0))) * wand * regen * nass;
            rauh = mix(rauh, 0.08, rinnsal);
            albedo = albedo * (1.0 - 0.25 * rinnsal);
        }
    }
    rauh = clamp(rauh, 0.045, 1.0);
    return PbrFlaeche(n, albedo, rauh);
}

// Anteil der planaren Spiegelung (Stimmung.spiegelung) an einer Fläche: nach oben zeigend, auf Höhe der Spiegelebene
// Höhenfenster um die Ebene: einfach voll bis 0,05, aus ab 0,3; voll (H-K21) voll bis 0,2, aus ab 0,45 – Gehwege (0,15)
// spiegeln dann ganz (eine Ebene für alles; Restfehler: Versatz 2 · Höhenunterschied im Spiegelbild)
fn auf_spiegelebene(welt: vec3<f32>, ng: vec3<f32>) -> f32 {
    let voll = stimmung.spiegel.w > 0.5;
    let fenster = select(vec2<f32>(0.05, 0.3), vec2<f32>(0.2, 0.45), voll);
    return (1.0 - smoothstep(fenster.x, fenster.y, abs(welt.y - stimmung.spiegel.y))) * smoothstep(0.7, 0.95, ng.y);
}

// Gewicht des Umgebungsglanzes (Fresnel-Schlick mit Rauheit × Glätte²) – fs_licht und der Bildraum-Vorlauf (SSR) gleich
fn umgebungsglanz(n: vec3<f32>, v: vec3<f32>, rauh: f32, f0: vec3<f32>) -> vec3<f32> {
    let ndv = max(dot(n, v), 1e-4);
    let fu = f0 + (max(vec3<f32>(1.0 - rauh), f0) - f0) * pow(1.0 - ndv, 5.0);
    return fu * (1.0 - rauh) * (1.0 - rauh);
}

// ao: Verdeckung (H-K24, SSAO) auf Umgebungslicht diffus und gespiegelt, nur bei ao_an (sonst rechnet alles wie vorher)
fn pbr_licht(welt: vec3<f32>, n0: vec3<f32>, ng: vec3<f32>, v: vec3<f32>, albedo0: vec3<f32>, glanz: f32, karte: f32, hat_karte: bool,
             metall: f32, nass: f32, sonne: f32, pos: vec2<f32>, ao: f32, ao_an: bool) -> vec3<f32> {
    let fl = pbr_flaeche(welt, n0, ng, albedo0, glanz, karte, hat_karte, nass);
    let n = fl.n;
    let albedo = fl.albedo;
    let rauh = fl.rauh;
    let f0 = mix(vec3<f32>(0.04), albedo, metall);
    let diff = albedo * (1.0 - metall);

    // Umgebung: diffus aus der Halbkugel, gespiegelt aus der Halbkugel in Spiegelrichtung (rauh → matter)
    let ndv = max(dot(n, v), 1e-4);
    let r = reflect(-v, n);
    let um0 = mix(szene.umgebung_unten.rgb, szene.umgebung_oben.rgb, n.y * 0.5 + 0.5);
    let ur0 = mix(szene.umgebung_unten.rgb, szene.umgebung_oben.rgb, smoothstep(-0.4, 0.7, r.y)) * 2.2;
    let um = select(um0, um0 * ao, ao_an);
    let ur = select(ur0, ur0 * ao, ao_an);
    let fu = f0 + (max(vec3<f32>(1.0 - rauh), f0) - f0) * pow(1.0 - ndv, 5.0);
    var c = diff * um + ur * fu * (1.0 - rauh) * (1.0 - rauh);
    // Spiegelung (Stimmung): nach oben zeigende Flächen auf Höhe der Spiegelebene nehmen das Spiegelbild an derselben
    // Bildschirmstelle (verzerrt vom Relief, unscharf mit der Rauheit), gewichtet mit Fresnel und Glätte
    let spiegeln = hdr_an() && stimmung.spiegel.x > 0.0 && !im_spiegel();
    let voll = stimmung.spiegel.w > 0.5;
    let auf_ebene = auf_spiegelebene(welt, ng);
    if (spiegeln && auf_ebene > 0.0) {
        // Spiegelbild in halber Größe, bei spiegelGuete voll (spiegel.w = 1, H-K21) in voller
        let dim = vec2<f32>(textureDimensions(spiegel_t)) * select(2.0, 1.0, voll);
        let uv = pos / dim + (n.xz - ng.xz) * vec2<f32>(0.05, -0.05);
        let r = rauh * rauh * 0.035;
        var bild = textureSampleLevel(spiegel_t, eigen_s, uv, 0.0).rgb * 0.4;
        bild = bild + (textureSampleLevel(spiegel_t, eigen_s, uv + vec2<f32>(r, 0.0), 0.0).rgb
                     + textureSampleLevel(spiegel_t, eigen_s, uv - vec2<f32>(r, 0.0), 0.0).rgb
                     + textureSampleLevel(spiegel_t, eigen_s, uv + vec2<f32>(0.0, r * 2.0), 0.0).rgb
                     + textureSampleLevel(spiegel_t, eigen_s, uv - vec2<f32>(0.0, r * 2.0), 0.0).rgb) * 0.15;
        let glatt = (1.0 - rauh) * (1.0 - rauh);
        c = c + bild * fu * glatt * auf_ebene * stimmung.spiegel.x;
    }

    // Sonne
    let l = szene.sonne_richtung.xyz;
    let ndl = max(dot(n, l), 0.0);
    c = c + szene.sonne_farbe.rgb * sonne * (diff * ndl + ggx(n, v, l, rauh, f0));

    // Lichter (im Spiegeldurchgang die Spiegel-Zellen bei spiegelGuete voll, sonst die 8 aus SZENE)
    if (lichter.raster.w > 0.5) {
        let kopf = zellwort(zelle(welt));
        let erstes = kopf >> 8u;
        let zahl = kopf & 255u;
        for (var j = 0u; j < zahl; j = j + 1u) {
            let wort = zellwort(erstes + j);
            let li = wort & 65535u;
            let lp = licht_texel(li, 0u);
            let lf = licht_texel(li, 1u);
            let lr = licht_texel(li, 2u);
            let d = lp.xyz - welt;
            let abst = length(d);
            let ld = d / max(abst, 0.0001);
            let x = clamp(1.0 - abst / max(lp.w, 0.0001), 0.0, 1.0);
            var daempf = x * x * smoothstep(lf.w, lr.w, dot(-ld, lr.xyz));
            if ((wort >> 16u) != 0u && daempf > 0.0) {
                daempf = daempf * zellschatten(wort, welt, n, lp.xyz);
            }
            // Lichtgröße: Glanzpunkte nie schärfer als eine kleine Leuchte (Rauheit ≥ 0.1 für Punktlichter)
            c = c + lf.rgb * daempf * (diff * max(dot(n, ld), 0.0) + ggx(n, v, ld, max(rauh, 0.1), f0));
        }
    } else {
        let anzahl = i32(szene.zahlen.x + 0.5);
        for (var i = 0; i < 8; i = i + 1) {
            if (i < anzahl) {
                let lp = szene.licht_pos[i];
                let d = lp.xyz - welt;
                let abst = length(d);
                let ld = d / max(abst, 0.0001);
                let x = clamp(1.0 - abst / max(lp.w, 0.0001), 0.0, 1.0);
                c = c + szene.licht_farbe[i].rgb * (x * x) * (diff * max(dot(n, ld), 0.0) + ggx(n, v, ld, max(rauh, 0.1), f0));
            }
        }
    }
    return c;
}

// sanfte Schulter oberhalb 0,8 (keine harten Überstrahlungen)
fn weich(c: vec3<f32>) -> vec3<f32> {
    let k = max(c, vec3<f32>(0.6001));
    let oben = vec3<f32>(1.0) - vec3<f32>(0.04) / (k - vec3<f32>(0.6));
    return select(c, oben, c > vec3<f32>(0.8));
}

// Oberfläche eines Fragments (fs_licht und Bildraum-Vorlauf): Normale (Vorderseite, Relief), geometrische Normale, Textur,
// Material-Zusatz. Ableitungen im gleichförmigen Kontrollfluss vor dem ersten discard (Aufruf am Anfang des Fragment-Shaders).
struct Oberflaeche {
    n: vec3<f32>,
    ng: vec3<f32>,
    tex: vec4<f32>,
    hat_textur: bool,
    // Rauheitskarte (Relief B bzw. Stoff-Karte G / 2): Rauheit = Karte · (2 − 2 · glanz)
    rauh_karte: f32,
    hat_relief: bool,
    pbr: bool,
    metall: f32,
    nass: f32,
    // H-K26: Stoff-Karte (R Verdeckung, G Rauheit, B Metall) und Eigenleuchten aus der Leucht-Karte (linear, mal leuchtFarbe)
    stoff: vec4<f32>,
    hat_stoff: bool,
    leucht: vec3<f32>,
    hat_leucht: bool,
}

// Kennwort einer Karte (Relief, KARTEN3D): eigene Textur einer bekannten Klasse
fn karte_da(k: u32) -> bool {
    return (k & 65536u) != 0u && (k & 131072u) != 0u && ((k >> 13u) & 7u) <= 4u;
}

fn oberflaeche(a: AusNetz, vorne: bool) -> Oberflaeche {
    // Bit 17 = eigene Textur (PD3): Bits 0–15 = Glut-Kennung Klasse << 13 | Schicht (Klasse 7 = unbekannt → ohne Textur)
    let eigen = (a.textur & 131072u) != 0u;
    let klasse = (a.textur >> 13u) & 7u;
    let hat_textur = (a.textur & 65536u) != 0u && (!eigen || klasse <= 4u);
    let lambda = eigen_lambda(a.uv);
    // Material-Zusatz: Kachelkoordinate und Ableitungen im gleichförmigen Kontrollfluss (vor jedem discard)
    let kachel = bitcast<f32>(a.zus.y);
    var metall = bitcast<f32>(a.zus.z);
    let merkmale = a.zus.w;
    let pbr = (merkmale & 1u) != 0u;
    let welt_modus = (merkmale & 2u) != 0u;
    let nass = f32((merkmale >> 8u) & 255u) / 255.0;
    let kacheln = kachel > 0.0;
    // Spiegeldurchgang: die Spiegelmatrix dreht den Umlaufsinn – bei spiegelGuete voll (H-K21) zählt die echte Vorderseite
    // (einfach bleibt wie bisher, damit seine Bilder gleich bleiben)
    let vorn = vorne != (im_spiegel() && stimmung.spiegel.w > 0.5);
    var ng = normalize(a.normale);
    if (!vorn) {
        ng = -ng;
    }
    let uvs = select(a.roh, select(a.roh * kachel, welt_uv(a.welt, ng) / max(kachel, 1e-4), welt_modus), kacheln);
    let gx = dpdx(uvs);
    let gy = dpdy(uvs);
    let px = dpdx(a.welt);
    let py = dpdy(a.welt);
    // Spiegeldurchgang: nur was über der Ebene liegt (die Ebene selbst nicht)
    if (im_spiegel() && a.welt.y < szene.zahlen.z + 0.03) {
        discard;
    }
    // voll (H-K21): Oberseiten niedriger Platten (Gehweg, Bordstein, Stufen bis 0,5 über der Ebene) von unten gesehen weglassen –
    // so spiegeln Pfützen auf ihnen die Szene dahinter (an der Ebene gespiegelt, Versatz 2 · Höhenunterschied) statt das Innere
    // der Platte
    if (im_spiegel() && stimmung.spiegel.w > 0.5 && !vorn && normalize(a.normale).y > 0.5 && a.welt.y < szene.zahlen.z + 0.5) {
        discard;
    }
    let groesse = a.uvbox.zw - a.uvbox.xy;
    let texel = a.uvbox.xy + clamp(a.uv, vec2<f32>(0.5), max(groesse - vec2<f32>(0.5), vec2<f32>(0.5)));
    var tex = textureLoad(atlas, vec2<i32>(floor(texel)), select(i32(a.textur & 65535u), 0, eigen), 0);
    if (eigen && klasse <= 4u) {
        tex = eigen_abtasten(klasse, i32(a.textur & 8191u), a.uvbox.xy + a.uv, a.uvbox, lambda);
    }
    if (kacheln && hat_textur) {
        if (eigen) {
            // eigene Textur wiederholt (das Bild füllt seine Schicht: quadratische Zweierpotenz), trilinear + anisotrop
            tex = eigen_kachel(klasse, i32(a.textur & 8191u), uvs, gx, gy);
        } else {
            let tk = a.uvbox.xy + clamp(fract(uvs) * groesse, vec2<f32>(0.5), max(groesse - vec2<f32>(0.5), vec2<f32>(0.5)));
            tex = textureLoad(atlas, vec2<i32>(floor(tk)), i32(a.textur & 65535u), 0);
        }
    }
    // Ausschnitt (H-K26, `schwelle` > 0; der Kern hat sie schon durch die Deckkraft der Farbe geteilt): Bild-Deckkraft darunter
    // verworfen; ohne Schwelle wie bisher: Texel unter ½ Deckkraft verworfen
    let schwelle = f32(a.karten.w & 255u) / 255.0;
    if (schwelle > 0.0) {
        if (select(1.0, tex.a, hat_textur) < schwelle) {
            discard;
        }
    } else if (hat_textur && tex.a < 0.5) {
        discard;
    }
    var n = normalize(a.normale);
    if (!vorn) {
        n = -n;
    }
    // Relief (eigene Textur, Glut-Kennung wie textur): Normale aus R, G (OpenGL: G = Bild-oben), Rauheit aus B;
    // Normal-Karte (H-K26): Normale aus R, G, B (Tangentenraum wie glTF), hat Vorrang vor der Normale des Reliefs;
    // normalStaerke (KARTEN3D Wort 0, Bits 24–31 / 64; ohne Abschnitt 1) wirkt auf beide
    let hat_relief = karte_da(a.zus.x);
    let hat_normal = karte_da(a.karten.x);
    let staerke = select(1.0, f32(a.karten.x >> 24u) / 64.0, any(a.karten != vec4<u32>(0u)));
    var rauh_karte = 1.0;
    if (hat_relief || hat_normal) {
        var tt = welt_t(ng);
        var bb = welt_b(ng);
        if (!welt_modus) {
            // Tangenten aus den Ableitungen (Schüler 2006; die Bildschirm-y-Achse zeigt hier nach unten, daher beide Vorzeichen
            // gedreht): t = −(Richtung wachsender u), b = −(Richtung wachsender v) = Bild-oben
            let dp2 = cross(py, ng);
            let dp1 = cross(ng, px);
            let t = dp2 * gx.x + dp1 * gy.x;
            let b = dp2 * gx.y + dp1 * gy.y;
            let k = inverseSqrt(max(max(dot(t, t), dot(b, b)), 1e-20));
            tt = -t * k;
            bb = b * k;
        }
        if (hat_relief) {
            let rel = eigen_kachel((a.zus.x >> 13u) & 7u, i32(a.zus.x & 8191u), uvs, gx, gy);
            let nt = vec2<f32>(rel.r * 2.0 - 1.0, rel.g * 2.0 - 1.0);
            let nz = sqrt(max(1.0 - dot(nt, nt), 0.0));
            let ns = nt * staerke;
            n = normalize(tt * ns.x + bb * ns.y + ng * nz);
            rauh_karte = rel.b;
        }
        if (hat_normal) {
            let nk = eigen_kachel((a.karten.x >> 13u) & 7u, i32(a.karten.x & 8191u), uvs, gx, gy);
            let nt = vec3<f32>((nk.r * 2.0 - 1.0) * staerke, (nk.g * 2.0 - 1.0) * staerke, nk.b * 2.0 - 1.0);
            n = normalize(tt * nt.x + bb * nt.y + ng * nt.z);
        }
    }
    // Stoff-Karte (H-K26): R Verdeckung (Umgebungslicht), G Rauheit (Vorrang vor dem Relief), B Metall – mal glanz/metall
    let hat_stoff = karte_da(a.karten.y);
    var stoff = vec4<f32>(1.0);
    if (hat_stoff) {
        stoff = eigen_kachel((a.karten.y >> 13u) & 7u, i32(a.karten.y & 8191u), uvs, gx, gy);
        rauh_karte = stoff.g * 0.5;
        metall = metall * stoff.b;
    }
    // Leucht-Karte (H-K26): Eigenleuchten = Karte (sRGB) · leuchtFarbe (KARTEN3D Wort 3, Bits 8–31)
    let hat_leucht = karte_da(a.karten.z);
    var leucht = vec3<f32>(0.0);
    if (hat_leucht) {
        let lk = eigen_kachel((a.karten.z >> 13u) & 7u, i32(a.karten.z & 8191u), uvs, gx, gy);
        let w = a.karten.w;
        let lf = vec3<f32>(f32((w >> 24u) & 255u), f32((w >> 16u) & 255u), f32((w >> 8u) & 255u)) / 255.0;
        leucht = zu_linear(lk.rgb) * zu_linear(lf);
    }
    return Oberflaeche(n, ng, tex, hat_textur, rauh_karte, hat_relief || hat_stoff, pbr, metall, nass, stoff, hat_stoff, leucht, hat_leucht);
}

// Verdeckung (H-K24): fertiges SSAO-Bild in halber Zielgröße, bilinear an der Pixelstelle
@group(0) @binding(21) var verdeckung_t: texture_2d<f32>;
@group(0) @binding(6) var lin_s: sampler;

fn verdeckung_bei(pos: vec2<f32>) -> f32 {
    return textureSampleLevel(verdeckung_t, lin_s, pos * bildraum.groesse.zw, 0.0).r;
}

// Oktaeder-Kodierung einer Einheitsnormale nach [0, 1]² (Bildraum-Vorlauf)
fn oktaeder(n: vec3<f32>) -> vec2<f32> {
    let p = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));
    let s = select(vec2<f32>(-1.0), vec2<f32>(1.0), p >= vec2<f32>(0.0));
    let q = select(p, (vec2<f32>(1.0) - abs(p.yx)) * s, n.z < 0.0);
    return q * 0.5 + vec2<f32>(0.5);
}

// Bildraum-Vorlauf (H-K24): FEST ohne MSAA in Tiefe + zwei Bilder – 0 (Rgb10a2): Normale oktaedrisch, Rauheit, pbr;
// 1 (Rgba8): Gewicht des Umgebungsglanzes (wie pbr_licht, für SSR) und Anteil, den SSR übernimmt (1 − planare Spiegelung)
struct AusVorlauf {
    @location(0) normale: vec4<f32>,
    @location(1) gewicht: vec4<f32>,
}

@fragment
fn fs_vorlauf(a: AusNetz, @builtin(front_facing) vorne: bool) -> AusVorlauf {
    let o = oberflaeche(a, vorne);
    var aus: AusVorlauf;
    aus.normale = vec4<f32>(oktaeder(o.n), 1.0, 0.0);
    aus.gewicht = vec4<f32>(0.0);
    if (o.pbr) {
        var albedo = a.farbe.rgb;
        if (o.hat_textur) {
            albedo = albedo * zu_linear(o.tex.rgb);
        }
        let fl = pbr_flaeche(a.welt, o.n, o.ng, albedo, a.material.x, o.rauh_karte, o.hat_relief, o.nass);
        let f0 = mix(vec3<f32>(0.04), fl.albedo, o.metall);
        let v = normalize(szene.kamera.xyz - a.welt);
        // auf der Ebene der planaren Spiegelung hat diese Vorrang (Boden, Pfützen); SSR übernimmt den Rest
        let planar = select(0.0, auf_spiegelebene(a.welt, o.ng), stimmung.spiegel.x > 0.0);
        aus.normale = vec4<f32>(oktaeder(fl.n), fl.rauh, 1.0);
        aus.gewicht = vec4<f32>(clamp(umgebungsglanz(fl.n, v, fl.rauh, f0), vec3<f32>(0.0), vec3<f32>(1.0)), 1.0 - planar);
    }
    return aus;
}

@fragment
fn fs_licht(a: AusNetz, @builtin(front_facing) vorne: bool) -> @location(0) vec4<f32> {
    let o = oberflaeche(a, vorne);
    let n = o.n;
    let ng = o.ng;
    let tex = o.tex;
    let hat_textur = o.hat_textur;
    let pbr = o.pbr;
    // Verdeckung (H-K24): nur im Hauptbild, nur Undurchsichtiges (DURCH liegt vor der Fläche, deren Verdeckung im Bild steht)
    let ao_an0 = bildraum.b.z > 0.5 && !im_spiegel() && a.farbe.a > 0.999;
    var ao0 = 1.0;
    if (ao_an0) {
        ao0 = verdeckung_bei(a.pos.xy);
    }
    // Stoff-Karte (H-K26): ihre Verdeckung (R) wirkt wie SSAO aufs Umgebungslicht
    let ao_an = ao_an0 || o.hat_stoff;
    let ao = ao0 * o.stoff.r;
    let l = szene.sonne_richtung.xyz;
    let ndl = max(dot(n, l), 0.0);
    let sonne = sonnenlicht(a.welt, n, ndl);

    var albedo = a.farbe.rgb;
    if (hat_textur) {
        albedo = albedo * zu_linear(tex.rgb);
    }
    // klassisch: die Rauheit der Stoff-Karte (G) mindert den Glanz (pbr nimmt sie über rauh_karte)
    let glanz = select(a.material.x, 1.0 - (1.0 - a.material.x) * o.stoff.g, o.hat_stoff && !pbr);
    let leuchten = a.material.y;
    let v = normalize(szene.kamera.xyz - a.welt);
    let hart = exp2(3.0 + glanz * 7.0);
    let staerke = glanz * glanz * 0.9 + glanz * 0.1;
    let norm = (hart + 8.0) / 25.0; // energieerhaltend genähert: kleine Glanzpunkte heller

    // Umgebung (Halbkugel)
    let himmel0 = mix(szene.umgebung_unten.rgb, szene.umgebung_oben.rgb, n.y * 0.5 + 0.5);
    let himmel = select(himmel0, himmel0 * ao, ao_an);
    var diffus = himmel;
    var glanzlicht = vec3<f32>(0.0);
    var pbr_farbe = vec3<f32>(0.0);
    if (pbr) {
        pbr_farbe = pbr_licht(a.welt, n, ng, v, albedo, glanz, o.rauh_karte, o.hat_relief, o.metall, o.nass, sonne, a.pos.xy, ao, ao_an);
    } else {

    // Sonne
    let h = normalize(l + v);
    let spiegel = pow(max(dot(n, h), 0.0), hart) * staerke * norm * min(ndl * 4.0, 1.0);
    diffus = diffus + szene.sonne_farbe.rgb * (ndl * sonne);
    glanzlicht = glanzlicht + szene.sonne_farbe.rgb * (spiegel * sonne);

    // Punktlichter (weicher Abfall bis zur Reichweite): viele über die Zellen-Tabelle, sonst die 8 aus SZENE (v1);
    // im Spiegeldurchgang die Zellen der gespiegelten Kamera (spiegelGuete voll), sonst die 8 nächsten aus SZENE
    let zellen_an = lichter.raster.w > 0.5;
    if (zellen_an) {
        let kopf = zellwort(zelle(a.welt));
        let erstes = kopf >> 8u;
        let zahl = kopf & 255u;
        for (var j = 0u; j < zahl; j = j + 1u) {
            let wort = zellwort(erstes + j);
            let li = wort & 65535u;
            let lp = licht_texel(li, 0u);
            let lf = licht_texel(li, 1u);
            let lr = licht_texel(li, 2u);
            let d = lp.xyz - a.welt;
            let abst = length(d);
            let ld = d / max(abst, 0.0001);
            let x = clamp(1.0 - abst / max(lp.w, 0.0001), 0.0, 1.0);
            // Spot: weicher Rand zwischen cos(außen) und cos(innen); Punktlicht: außen −2, innen −1.5 → immer 1
            let kegel = smoothstep(lf.w, lr.w, dot(-ld, lr.xyz));
            var daempf = x * x * kegel;
            if ((wort >> 16u) != 0u && daempf > 0.0) {
                daempf = daempf * zellschatten(wort, a.welt, n, lp.xyz);
            }
            let nl = max(dot(n, ld), 0.0);
            let hl = normalize(ld + v);
            let sp = pow(max(dot(n, hl), 0.0), hart) * staerke * norm * min(nl * 4.0, 1.0);
            diffus = diffus + lf.rgb * (nl * daempf);
            glanzlicht = glanzlicht + lf.rgb * (sp * daempf);
        }
    }
    let anzahl = select(i32(szene.zahlen.x + 0.5), 0, zellen_an);
    for (var i = 0; i < 8; i = i + 1) {
        if (i < anzahl) {
            let lp = szene.licht_pos[i];
            let d = lp.xyz - a.welt;
            let abst = length(d);
            let ld = d / max(abst, 0.0001);
            let x = clamp(1.0 - abst / max(lp.w, 0.0001), 0.0, 1.0);
            let daempf = x * x;
            let nl = max(dot(n, ld), 0.0);
            let hl = normalize(ld + v);
            let sp = pow(max(dot(n, hl), 0.0), hart) * staerke * norm * min(nl * 4.0, 1.0);
            diffus = diffus + szene.licht_farbe[i].rgb * (nl * daempf);
            glanzlicht = glanzlicht + szene.licht_farbe[i].rgb * (sp * daempf);
        }
    }
    }

    var farbe = select(albedo * diffus + glanzlicht, pbr_farbe, pbr);
    // leuchten ≤ 1 wie v1 (zur Eigenfarbe mischen), darüber strahlt es (Koerper.strahlen, für Bloom): albedo · leuchten
    // mit Leucht-Karte (H-K26): Karte · leuchtFarbe · leuchten (× strahlen) additiv wie glTF emissive
    if (o.hat_leucht) {
        farbe = farbe + o.leucht * leuchten;
    } else {
        farbe = mix(farbe, albedo, min(leuchten, 1.0)) + albedo * max(leuchten - 1.0, 0.0);
    }

    // Nebel
    if (szene.nebel_farbe.w > 0.5) {
        let abstand = length(szene.kamera.xyz - a.welt);
        let f = clamp((abstand - szene.nebel.x) * szene.nebel.z, 0.0, 1.0);
        farbe = mix(farbe, szene.nebel_farbe.rgb, f);
    }

    var deck = a.farbe.a;
    if (hat_textur) {
        deck = deck * tex.a;
    }
    if (hdr_an()) {
        // linear ins HDR-Ziel; Höhennebel zur Nebelfarbe
        return vec4<f32>(mix(farbe, stimmung.farbe.rgb, hoehennebel(szene.kamera.xyz, a.welt)), deck);
    }
    return vec4<f32>(zu_srgb(weich(farbe)) + vec3<f32>(rauschen(a.pos.xy) / 255.0), deck);
}
