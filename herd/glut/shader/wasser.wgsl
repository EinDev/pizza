// Wasser (H-K28, Abschnitt WASSER, eigenes Layout `wasser`: herd/README.md §9). Programm = gemeinsam.wgsl + wasser.wgsl.
// Raster aus `vertex_index` (keine Geometrie in der Glut), je Fläche eine Instanz. Gerstner-Wellen im Vertex-Shader mit
// **derselben Formel** wie der Kern (`komponenten/wasser.rs`, dort f64): vier Wellen, Richtung um die Grundrichtung gedreht,
// Länge/Höhe als feste Anteile, Querweite s = min(a, 0,15/k), Phase gerastet vom Kern. Normale analytisch je Fragment am
// Ruhepunkt + Detail-Rauschen; Farbe: Brechung und Tiefe aus den Kopien (Szenenfarbe nach FEST, Tiefe des Vorlaufs), Spiegelung
// planar (Stimmung.spiegelung) sonst Himmel, Sonnenglanz, Schaum an der Uferlinie (Tiefendifferenz) und auf Wellenkämmen.

struct Flaeche {
    a: vec4<f32>,   // mitte xyz, wellen
    b: vec4<f32>,   // halbe Breite, halbe Tiefe, wellenLaenge, klarheit
    c: vec4<f32>,   // Grundrichtung x, z, schaum, brechung
    d: vec4<u32>,   // farbe (0xRRGGBBAA, sRGB), tiefenFarbe, Phasen 0|1 << 16, 2|3 << 16
}

struct WasserBlock {
    kopf: vec4<f32>,      // anzahl, nah, fern, zeit (s)
    glut: vec4<f32>,      // 1 = Kopien (Brechung, Tiefe, Uferschaum), 1 = Himmelszelt gilt, 0, 0
    flaechen: array<Flaeche, 8>,
}

// Anfang des Uniform-Blocks HIMMELSZELT (H-K11b, himmel.wgsl): nur die Farben des Verlaufs
struct ZeltFarben {
    oben: vec4<f32>,
    horizont: vec4<f32>,
    boden: vec4<f32>,
}

@group(0) @binding(13) var<uniform> zelt_f: ZeltFarben;
@group(0) @binding(25) var<uniform> wasser: WasserBlock;
@group(0) @binding(26) var farbe_t: texture_2d<f32>;
@group(0) @binding(27) var tiefe_t: texture_2d<f32>;
@group(0) @binding(28) var punkt_s: sampler;

// Raster je Fläche (Zellen je Kante) – feiner als die kürzeste Welle (0,27 · wellenLaenge) braucht es nicht: die Normale rechnet
// das Fragment selbst
const RASTER: u32 = 128u;
const ZWEI_PI: f32 = 6.28318530718;
// je Welle: Drehung gegen die Grundrichtung (Bogenmaß), Anteil an wellenLaenge und an wellen (wie DREH/LAENGE/HOEHE im Kern)
fn welle_p(w: u32) -> vec3<f32> {
    return select(select(select(vec3<f32>(1.1, 0.27, 0.1), vec3<f32>(-0.4, 0.41, 0.15), w == 2u), vec3<f32>(0.55, 0.63, 0.25), w == 1u), vec3<f32>(0.0, 1.0, 0.5), w == 0u);
}

struct AusWasser {
    @builtin(position) pos: vec4<f32>,
    @location(0) welt: vec3<f32>,
    @location(1) ruhe: vec2<f32>,
    @location(2) @interpolate(flat) i: u32,
}

fn phase(f: Flaeche, w: u32) -> f32 {
    let wort = select(f.d.z, f.d.w, w >= 2u);
    let p = select(wort & 65535u, wort >> 16u, (w & 1u) == 1u);
    return f32(p) * (ZWEI_PI / 65536.0);
}

fn welle_d(f: Flaeche, w: u32) -> vec2<f32> {
    let c = cos(welle_p(w).x);
    let s = sin(welle_p(w).x);
    let r = f.c.xy;
    return vec2<f32>(r.x * c - r.y * s, r.x * s + r.y * c);
}

// Querversatz (x, z) und Höhe (y) am Ruhepunkt q (Welt x, z)
fn versatz(f: Flaeche, q: vec2<f32>) -> vec3<f32> {
    var o = vec3<f32>(0.0);
    for (var w = 0u; w < 4u; w = w + 1u) {
        let d = welle_d(f, w);
        let k = ZWEI_PI / (f.b.z * welle_p(w).y);
        let a = f.a.w * welle_p(w).z;
        let s = min(a, 0.15 / k);
        let th = k * dot(d, q) - phase(f, w);
        o = o + vec3<f32>(s * d.x * cos(th), a * sin(th), s * d.y * cos(th));
    }
    return o;
}

// Normale der verschobenen Fläche am Ruhepunkt q (Ableitungen nach x und z)
fn normale(f: Flaeche, q: vec2<f32>) -> vec3<f32> {
    var dx = vec3<f32>(1.0, 0.0, 0.0);
    var dz = vec3<f32>(0.0, 0.0, 1.0);
    for (var w = 0u; w < 4u; w = w + 1u) {
        let d = welle_d(f, w);
        let k = ZWEI_PI / (f.b.z * welle_p(w).y);
        let a = f.a.w * welle_p(w).z;
        let s = min(a, 0.15 / k);
        let th = k * dot(d, q) - phase(f, w);
        let sn = sin(th) * k;
        let cs = cos(th) * k;
        dx = dx + vec3<f32>(-s * d.x * d.x * sn, a * d.x * cs, -s * d.x * d.y * sn);
        dz = dz + vec3<f32>(-s * d.x * d.y * sn, a * d.y * cs, -s * d.y * d.y * sn);
    }
    return normalize(cross(dz, dx));
}

@vertex
fn vs_wasser(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> AusWasser {
    let f = wasser.flaechen[ii];
    let zelle = vi / 6u;
    let ecke = vi % 6u;
    // zwei Dreiecke je Zelle: (0,0) (1,0) (0,1) · (1,0) (1,1) (0,1)
    let ox = select(0u, 1u, ecke == 1u || ecke == 3u || ecke == 4u);
    let oz = select(0u, 1u, ecke == 2u || ecke == 4u || ecke == 5u);
    let uv = vec2<f32>(f32(zelle % RASTER + ox), f32(zelle / RASTER + oz)) / f32(RASTER);
    let q = f.a.xz + (uv * 2.0 - vec2<f32>(1.0)) * f.b.xy;
    let o = versatz(f, q);
    let w = vec3<f32>(q.x + o.x, f.a.y + o.y, q.y + o.z);
    var a: AusWasser;
    a.pos = szene.ansicht_proj * vec4<f32>(w, 1.0);
    a.welt = w;
    a.ruhe = q;
    a.i = ii;
    return a;
}

fn farbe_aus(c: u32) -> vec3<f32> {
    return zu_linear(vec3<f32>(f32(c >> 24u), f32((c >> 16u) & 255u), f32((c >> 8u) & 255u)) / 255.0);
}

fn w_hash(x: i32, y: i32) -> f32 {
    var h = bitcast<u32>(x) * 374761393u + bitcast<u32>(y) * 668265263u;
    h = (h ^ (h >> 13u)) * 1274126177u;
    h = h ^ (h >> 16u);
    return f32(h & 65535u) / 65535.0;
}

fn w_rauschen(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = p - i;
    let u = f * f * (3.0 - 2.0 * f);
    let x = i32(i.x);
    let y = i32(i.y);
    return mix(mix(w_hash(x, y), w_hash(x + 1, y), u.x), mix(w_hash(x, y + 1), w_hash(x + 1, y + 1), u.x), u.y);
}

// Tiefe 0 … 1 → Abstand entlang der Blickrichtung (Perspektive des Kerns: nah, fern aus dem Kopf)
fn w_linear(d: f32) -> f32 {
    let n = wasser.kopf.y;
    let f = wasser.kopf.z;
    return n * f / (f - d * (f - n));
}

fn himmel_in(r: vec3<f32>) -> vec3<f32> {
    if (wasser.glut.y > 0.5) {
        let h = r.y;
        let nach_oben = 1.0 - pow(1.0 - clamp(h, 0.0, 1.0), 2.5);
        let nach_unten = 1.0 - pow(1.0 - clamp(-h, 0.0, 1.0), 4.0);
        return select(mix(zelt_f.horizont.rgb, zelt_f.boden.rgb, nach_unten), mix(zelt_f.horizont.rgb, zelt_f.oben.rgb, nach_oben), h >= 0.0);
    }
    let t = 1.0 - pow(1.0 - clamp(r.y, 0.0, 1.0), 8.0);
    return mix(szene.himmel_unten.rgb, szene.himmel_oben.rgb, t);
}

@fragment
fn fs_wasser(a: AusWasser) -> @location(0) vec4<f32> {
    let f = wasser.flaechen[a.i];
    let zeit = wasser.kopf.w;
    // Detail: zwei Lagen Wertrauschen, in Wellenrichtung wandernd (Gradient über Differenzen)
    let p1 = a.ruhe * 1.7 + f.c.xy * zeit * 0.6;
    let p2 = a.ruhe * 4.3 - vec2<f32>(f.c.y, -f.c.x) * zeit * 0.9;
    let e = 0.05;
    let r0 = w_rauschen(p1) + 0.5 * w_rauschen(p2);
    let rx = w_rauschen(p1 + vec2<f32>(e, 0.0)) + 0.5 * w_rauschen(p2 + vec2<f32>(e, 0.0)) - r0;
    let rz = w_rauschen(p1 + vec2<f32>(0.0, e)) + 0.5 * w_rauschen(p2 + vec2<f32>(0.0, e)) - r0;
    let ruhig = clamp(f.a.w * 4.0 + 0.15, 0.15, 1.0);
    let n = normalize(normale(f, a.ruhe) - vec3<f32>(rx, 0.0, rz) / e * 0.06 * ruhig);
    let v = normalize(szene.kamera.xyz - a.welt);
    let ndv = max(dot(n, v), 0.0);
    let fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    let l = szene.sonne_richtung.xyz;
    let licht = szene.umgebung_oben.rgb + szene.sonne_farbe.rgb * max(l.y, 0.0) * 0.6;

    // Spiegelung: planar (gleiche Bildschirmstelle wie fs_licht, um die Wellen-Normale verzerrt), sonst Himmel
    let r = reflect(-v, n);
    var spiegel = himmel_in(r);
    let planar = hdr_an() && stimmung.spiegel.x > 0.0 && abs(f.a.y - stimmung.spiegel.y) < 0.6 + f.a.w;
    if (planar) {
        let voll = stimmung.spiegel.w > 0.5;
        let dim = vec2<f32>(textureDimensions(spiegel_t)) * select(2.0, 1.0, voll);
        let uv = a.pos.xy / dim + n.xz * vec2<f32>(0.05, -0.05);
        let bild = textureSampleLevel(spiegel_t, eigen_s, clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0)), 0.0).rgb;
        spiegel = mix(spiegel, bild, stimmung.spiegel.x);
    }

    // Wasserkörper: Brechung + Tiefe aus den Kopien, sonst deckend aus Farbe und Tiefenfarbe
    let hell = farbe_aus(f.d.x) * licht;
    let tief = farbe_aus(f.d.y) * licht;
    let klar = max(f.b.w, 0.01);
    var koerper = mix(hell, tief, 0.75);
    var ufer = 0.0;
    if (wasser.glut.x > 0.5) {
        let groesse = vec2<f32>(textureDimensions(farbe_t));
        let uv0 = a.pos.xy / groesse;
        let zw = w_linear(a.pos.z);
        let z0 = w_linear(textureSampleLevel(tiefe_t, punkt_s, uv0, 0.0).x);
        let weg0 = max(z0 - zw, 0.0);
        // Brechung: Versatz nach der Normale, mit der Tiefe bis 1 Einheit wachsend; liegt dort etwas vor dem Wasser, unverzerrt
        var uv = clamp(uv0 + n.xz * f.c.w * min(weg0, 1.0), vec2<f32>(0.0), vec2<f32>(1.0));
        var zs = w_linear(textureSampleLevel(tiefe_t, punkt_s, uv, 0.0).x);
        if (zs < zw) {
            uv = uv0;
            zs = z0;
        }
        var szene_c = textureSampleLevel(farbe_t, eigen_s, uv, 0.0).rgb;
        if (!hdr_an()) {
            szene_c = zu_linear(szene_c);
        }
        // Weg durchs Wasser entlang des Blicks
        let weg = max(zs - zw, 0.0) * length(szene.kamera.xyz - a.welt) / max(zw, 1e-4);
        let durch = exp(-weg / klar);
        koerper = mix(mix(hell, tief, 0.75), szene_c * mix(vec3<f32>(1.0), farbe_aus(f.d.x) * 1.6, clamp(weg / (klar * 2.0), 0.0, 0.6)), durch);
        ufer = 1.0 - smoothstep(0.0, 0.08 + 0.5 * f.c.z, weg0);
    }

    // Sonnenglanz (scharf + weich), nur über dem Horizont
    let h = normalize(l + v);
    let glanz = (pow(max(dot(n, h), 0.0), 600.0) * 6.0 + pow(max(dot(n, h), 0.0), 60.0) * 0.25) * select(0.0, 1.0, l.y > 0.0);
    var c = mix(koerper, spiegel, fresnel) + szene.sonne_farbe.rgb * glanz;

    // Schaum: Uferlinie (Tiefendifferenz) und Wellenkämme, fleckig aus dem Rauschen
    let kamm = smoothstep(0.55, 0.95, (a.welt.y - f.a.y) / max(f.a.w, 1e-3)) * select(0.0, 1.0, f.a.w > 0.0);
    let flecken = smoothstep(0.35, 0.75, w_rauschen(a.ruhe * 3.1 + f.c.xy * zeit * 0.3) * 0.7 + r0 * 0.3);
    let schaum = clamp((ufer * 1.2 + kamm * 0.8) * f.c.z * 2.0 * (0.4 + 0.9 * flecken), 0.0, 1.0);
    c = mix(c, licht * 0.95, schaum);

    // Nebel wie fs_licht
    if (szene.nebel_farbe.w > 0.5) {
        let abstand = length(szene.kamera.xyz - a.welt);
        let nf = clamp((abstand - szene.nebel.x) * szene.nebel.z, 0.0, 1.0);
        c = mix(c, szene.nebel_farbe.rgb, nf);
    }
    if (hdr_an()) {
        return vec4<f32>(mix(c, stimmung.farbe.rgb, hoehennebel(szene.kamera.xyz, a.welt)), 1.0);
    }
    return vec4<f32>(zu_srgb(c) + vec3<f32>(rauschen(a.pos.xy) / 255.0), 1.0);
}
