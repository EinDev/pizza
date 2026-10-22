// 3D beleuchtet: Halbkugel-Umgebungslicht, Sonne (Lambert + Blinn-Phong) mit weichem PCF-Schatten, bis zu 8 Punktlichter,
// Eigenleuchten, Bildchen-Textur (pixelscharf), linearer Nebel. Rechnet linear, gibt sRGB aus.

struct EinNetz {
    @location(0) pos: vec3<f32>,
    @location(1) normale: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) m0: vec4<f32>,
    @location(4) m1: vec4<f32>,
    @location(5) m2: vec4<f32>,
    @location(6) m3: vec4<f32>,
    @location(7) n0: vec4<f32>,
    @location(8) n1: vec4<f32>,
    @location(9) n2: vec4<f32>,
    @location(10) farbe: vec4<f32>,
    @location(11) material: vec4<f32>,
}

struct AusNetz {
    @builtin(position) pos: vec4<f32>,
    @location(0) welt: vec3<f32>,
    @location(1) normale: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) farbe: vec4<f32>,
    @location(4) material: vec4<f32>,
}

@group(0) @binding(0) var<uniform> szene: Szene;
@group(0) @binding(1) var<uniform> geraet: Geraet;
@group(0) @binding(2) var schatten_t: texture_depth_2d;
@group(0) @binding(3) var schatten_s: sampler_comparison;
@group(1) @binding(0) var bild_t: texture_2d<f32>;
@group(1) @binding(1) var bild_s: sampler;

@vertex
fn vs_licht(e: EinNetz) -> AusNetz {
    let m = mat4x4<f32>(e.m0, e.m1, e.m2, e.m3);
    let w = m * vec4<f32>(e.pos, 1.0);
    let nm = mat3x3<f32>(e.n0.xyz, e.n1.xyz, e.n2.xyz);
    var p = szene.ansicht_proj * w;
    p.z = p.z * geraet.z.x + p.w * geraet.z.y;
    var a: AusNetz;
    a.pos = p;
    a.welt = w.xyz;
    a.normale = nm * e.normale;
    a.uv = e.uv;
    a.farbe = e.farbe;
    a.material = e.material;
    return a;
}

// Anteil Sonnenlicht (1 = voll beleuchtet). 4×4 Abfragen mit Hardware-Vergleich (bilinear) → weiche Kante.
fn sonnenlicht(welt: vec3<f32>, n: vec3<f32>, ndl: f32) -> f32 {
    // Normalenversatz wächst bei streifendem Licht (gegen Akne, ohne die Schatten abzulösen)
    let versatz = n * szene.schatten.y * (0.6 + 1.4 * (1.0 - ndl));
    let lp = szene.licht_proj * vec4<f32>(welt + versatz, 1.0);
    let ndc = lp.xyz / lp.w;
    let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5 * geraet.z.z);
    let bezug = ndc.z - szene.schatten.z;
    let t = szene.schatten.x;
    var summe = 0.0;
    for (var j = 0; j < 4; j = j + 1) {
        for (var i = 0; i < 4; i = i + 1) {
            let o = (vec2<f32>(f32(i), f32(j)) - vec2<f32>(1.5)) * (t * 1.25);
            summe = summe + textureSampleCompare(schatten_t, schatten_s, uv + o, bezug);
        }
    }
    let s = summe / 16.0;
    // am Rand der Shadow-Map weich ausblenden
    let rand = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    let blende = clamp(rand * 25.0, 0.0, 1.0);
    let ergebnis = mix(1.0, s, blende);
    let aus = szene.sonne_richtung.w < 0.5 || rand <= 0.0 || ndc.z >= 1.0;
    return select(ergebnis, 1.0, aus);
}

fn weich(c: vec3<f32>) -> vec3<f32> {
    // oberhalb 0,8 weich gegen 1 laufen lassen (keine harten Überstrahlungen)
    let k = max(c, vec3<f32>(0.6001));
    let oben = vec3<f32>(1.0) - vec3<f32>(0.04) / (k - vec3<f32>(0.6));
    return select(c, oben, c > vec3<f32>(0.8));
}

@fragment
fn fs_licht(a: AusNetz, @builtin(front_facing) vorne: bool) -> @location(0) vec4<f32> {
    let tex = textureSample(bild_t, bild_s, a.uv);
    var n = normalize(a.normale);
    if (!vorne) {
        n = -n;
    }
    let l = szene.sonne_richtung.xyz;
    let ndl = max(dot(n, l), 0.0);
    let sonne = sonnenlicht(a.welt, n, ndl);

    let hat_textur = a.material.z > 0.5;
    if (hat_textur && tex.a < 0.5) {
        discard;
    }
    var albedo = a.farbe.rgb;
    if (hat_textur) {
        albedo = albedo * zu_linear(tex.rgb);
    }
    let glanz = a.material.x;
    let leuchten = a.material.y;
    let v = normalize(szene.kamera.xyz - a.welt);
    let hart = exp2(2.0 + glanz * 8.0);
    let staerke = glanz * glanz * 0.8 + glanz * 0.2;

    // Umgebung (Halbkugel)
    let himmel = mix(szene.umgebung_unten.rgb, szene.umgebung_oben.rgb, n.y * 0.5 + 0.5);
    var diffus = himmel;
    var glanzlicht = vec3<f32>(0.0);

    // Sonne
    let h = normalize(l + v);
    let spiegel = pow(max(dot(n, h), 0.0), hart) * staerke * min(ndl * 4.0, 1.0);
    diffus = diffus + szene.sonne_farbe.rgb * (ndl * sonne);
    glanzlicht = glanzlicht + szene.sonne_farbe.rgb * (spiegel * sonne);

    // Punktlichter
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
            let sp = pow(max(dot(n, hl), 0.0), hart) * staerke * min(nl * 4.0, 1.0);
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
