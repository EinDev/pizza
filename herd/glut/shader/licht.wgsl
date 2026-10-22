// 3D beleuchtet (INST3D, 72 Bytes je Instanz): Halbkugel-Umgebungslicht, Sonne (Lambert + Blinn-Phong) mit weichem
// PCF-Schatten, bis zu 8 Punktlichter, Eigenleuchten, Atlas-Textur (pixelscharf), linearer Nebel. Linear rechnen, sRGB ausgeben.

@group(0) @binding(2) var schatten_t: texture_depth_2d;
@group(0) @binding(3) var vergleich: sampler_comparison;
@group(0) @binding(4) var atlas: texture_2d_array<f32>;

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
    @location(9) textur: u32,         // Bits 0–15 Seite, Bit 16 = hat Textur
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
    summe = summe + w0.x * w0.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o0.x, o0.y) * t, bezug);
    summe = summe + w1.x * w0.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o1.x, o0.y) * t, bezug);
    summe = summe + w2.x * w0.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o2.x, o0.y) * t, bezug);
    summe = summe + w0.x * w1.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o0.x, o1.y) * t, bezug);
    summe = summe + w1.x * w1.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o1.x, o1.y) * t, bezug);
    summe = summe + w2.x * w1.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o2.x, o1.y) * t, bezug);
    summe = summe + w0.x * w2.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o0.x, o2.y) * t, bezug);
    summe = summe + w1.x * w2.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o1.x, o2.y) * t, bezug);
    summe = summe + w2.x * w2.y * textureSampleCompareLevel(schatten_t, vergleich, b + vec2<f32>(o2.x, o2.y) * t, bezug);
    return summe / 144.0;
}

// Anteil Sonnenlicht (1 = voll beleuchtet).
fn sonnenlicht(welt: vec3<f32>, n: vec3<f32>, ndl: f32) -> f32 {
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

// sanfte Schulter oberhalb 0,8 (keine harten Überstrahlungen)
fn weich(c: vec3<f32>) -> vec3<f32> {
    let k = max(c, vec3<f32>(0.6001));
    let oben = vec3<f32>(1.0) - vec3<f32>(0.04) / (k - vec3<f32>(0.6));
    return select(c, oben, c > vec3<f32>(0.8));
}

@fragment
fn fs_licht(a: AusNetz, @builtin(front_facing) vorne: bool) -> @location(0) vec4<f32> {
    let hat_textur = (a.textur & 65536u) != 0u;
    let groesse = a.uvbox.zw - a.uvbox.xy;
    let texel = a.uvbox.xy + clamp(a.uv, vec2<f32>(0.5), max(groesse - vec2<f32>(0.5), vec2<f32>(0.5)));
    let tex = textureLoad(atlas, vec2<i32>(floor(texel)), i32(a.textur & 65535u), 0);
    if (hat_textur && tex.a < 0.5) {
        discard;
    }
    var n = normalize(a.normale);
    if (!vorne) {
        n = -n;
    }
    let l = szene.sonne_richtung.xyz;
    let ndl = max(dot(n, l), 0.0);
    let sonne = sonnenlicht(a.welt, n, ndl);

    var albedo = a.farbe.rgb;
    if (hat_textur) {
        albedo = albedo * zu_linear(tex.rgb);
    }
    let glanz = a.material.x;
    let leuchten = a.material.y;
    let v = normalize(szene.kamera.xyz - a.welt);
    let hart = exp2(3.0 + glanz * 7.0);
    let staerke = glanz * glanz * 0.9 + glanz * 0.1;
    let norm = (hart + 8.0) / 25.0; // energieerhaltend genähert: kleine Glanzpunkte heller

    // Umgebung (Halbkugel)
    let himmel = mix(szene.umgebung_unten.rgb, szene.umgebung_oben.rgb, n.y * 0.5 + 0.5);
    var diffus = himmel;
    var glanzlicht = vec3<f32>(0.0);

    // Sonne
    let h = normalize(l + v);
    let spiegel = pow(max(dot(n, h), 0.0), hart) * staerke * norm * min(ndl * 4.0, 1.0);
    diffus = diffus + szene.sonne_farbe.rgb * (ndl * sonne);
    glanzlicht = glanzlicht + szene.sonne_farbe.rgb * (spiegel * sonne);

    // Punktlichter (weicher Abfall bis zur Reichweite)
    let anzahl = i32(szene.zahlen.x + 0.5);
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

    var farbe = albedo * diffus + glanzlicht;
    farbe = mix(farbe, albedo, leuchten);

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
    return vec4<f32>(zu_srgb(weich(farbe)) + vec3<f32>(rauschen(a.pos.xy) / 255.0), deck);
}
