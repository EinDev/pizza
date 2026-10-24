// 3D beleuchtet (INST3D, 72 Bytes je Instanz): Halbkugel-Umgebungslicht, Sonne (Lambert + Blinn-Phong) mit weichem
// PCF-Schatten, bis zu 8 Punktlichter, Eigenleuchten, Atlas-Textur (pixelscharf), linearer Nebel. Linear rechnen, sRGB ausgeben.
// Material-Zusatz (ZUSATZ3D, 16 Bytes je Instanz, alles 0 = wie oben): Kachelung (uv oder Welt-Abbildung nach der größten
// Normalenkomponente), Relief (Normale + Rauheit, Tangenten aus der Abbildung bzw. aus den Bildschirmableitungen), Modell pbr
// (GGX + Smith + Schlick, Metall, Umgebungsglanz), Nässe (Pfützen aus Rauschen in Weltlage, feuchte Flächen dunkler und glatter).

@group(0) @binding(2) var schatten_t: texture_depth_2d;
@group(0) @binding(3) var vergleich: sampler_comparison;
@group(0) @binding(4) var atlas: texture_2d_array<f32>;

// Viele Lichter (Abschnitt LICHTER, Clustered Forward): Kopf, je Licht 3 Texel (pos+reichweite, farbe+cos außen,
// richtung+cos innen) und die Zellen-Wörter (Köpfe `versatz << 8 | anzahl`, dann Licht-Indizes). raster.w = 0 → aus.
struct Lichter {
    raster: vec4<f32>,   // Kacheln x, y, Scheiben z, Anzahl Lichter
    tiefe: vec4<f32>,    // nah, Scheiben je ln-Einheit, fern, 0
    vorn: vec4<f32>,     // Blickrichtung der Kamera
    frei: vec4<f32>,
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
    return (s * u32(n.y) + ty) * u32(n.x) + tx;
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

// Physikalisches Licht (Modell pbr): Rauheit aus glanz bzw. Relief, Metall, Nässe (Pfützen auf nach oben zeigenden Flächen,
// feuchte Flächen dunkler und glatter); Sonne, Lichter (Zellen oder die 8 aus SZENE), Halbkugel-Umgebung diffus und gespiegelt.
fn pbr_licht(welt: vec3<f32>, n0: vec3<f32>, ng: vec3<f32>, v: vec3<f32>, albedo0: vec3<f32>, glanz: f32, karte: f32, hat_karte: bool,
             metall: f32, nass: f32, sonne: f32) -> vec3<f32> {
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
    rauh = clamp(rauh, 0.045, 1.0);
    let f0 = mix(vec3<f32>(0.04), albedo, metall);
    let diff = albedo * (1.0 - metall);

    // Umgebung: diffus aus der Halbkugel, gespiegelt aus der Halbkugel in Spiegelrichtung (rauh → matter)
    let ndv = max(dot(n, v), 1e-4);
    let r = reflect(-v, n);
    let um = mix(szene.umgebung_unten.rgb, szene.umgebung_oben.rgb, n.y * 0.5 + 0.5);
    let ur = mix(szene.umgebung_unten.rgb, szene.umgebung_oben.rgb, smoothstep(-0.4, 0.7, r.y)) * 2.2;
    let fu = f0 + (max(vec3<f32>(1.0 - rauh), f0) - f0) * pow(1.0 - ndv, 5.0);
    var c = diff * um + ur * fu * (1.0 - rauh) * (1.0 - rauh);

    // Sonne
    let l = szene.sonne_richtung.xyz;
    let ndl = max(dot(n, l), 0.0);
    c = c + szene.sonne_farbe.rgb * sonne * (diff * ndl + ggx(n, v, l, rauh, f0));

    // Lichter
    if (lichter.raster.w > 0.5) {
        let kopf = zellwort(zelle(welt));
        let erstes = kopf >> 8u;
        let zahl = kopf & 255u;
        for (var j = 0u; j < zahl; j = j + 1u) {
            let li = zellwort(erstes + j);
            let lp = licht_texel(li, 0u);
            let lf = licht_texel(li, 1u);
            let lr = licht_texel(li, 2u);
            let d = lp.xyz - welt;
            let abst = length(d);
            let ld = d / max(abst, 0.0001);
            let x = clamp(1.0 - abst / max(lp.w, 0.0001), 0.0, 1.0);
            let daempf = x * x * smoothstep(lf.w, lr.w, dot(-ld, lr.xyz));
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

@fragment
fn fs_licht(a: AusNetz, @builtin(front_facing) vorne: bool) -> @location(0) vec4<f32> {
    // Bit 17 = eigene Textur (PD3): Bits 0–15 = Glut-Kennung Klasse << 13 | Schicht (Klasse 7 = unbekannt → ohne Textur)
    let eigen = (a.textur & 131072u) != 0u;
    let klasse = (a.textur >> 13u) & 7u;
    let hat_textur = (a.textur & 65536u) != 0u && (!eigen || klasse <= 4u);
    let lambda = eigen_lambda(a.uv);
    // Material-Zusatz: Kachelkoordinate und Ableitungen im gleichförmigen Kontrollfluss (vor jedem discard)
    let kachel = bitcast<f32>(a.zus.y);
    let metall = bitcast<f32>(a.zus.z);
    let merkmale = a.zus.w;
    let pbr = (merkmale & 1u) != 0u;
    let welt_modus = (merkmale & 2u) != 0u;
    let nass = f32((merkmale >> 8u) & 255u) / 255.0;
    let kacheln = kachel > 0.0;
    var ng = normalize(a.normale);
    if (!vorne) {
        ng = -ng;
    }
    let uvs = select(a.roh, select(a.roh * kachel, welt_uv(a.welt, ng) / max(kachel, 1e-4), welt_modus), kacheln);
    let gx = dpdx(uvs);
    let gy = dpdy(uvs);
    let px = dpdx(a.welt);
    let py = dpdy(a.welt);
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
    if (hat_textur && tex.a < 0.5) {
        discard;
    }
    var n = normalize(a.normale);
    if (!vorne) {
        n = -n;
    }
    // Relief (eigene Textur, Glut-Kennung wie textur): Normale aus R, G (OpenGL: G = Bild-oben), Rauheit aus B
    let r_eigen = (a.zus.x & 131072u) != 0u;
    let r_klasse = (a.zus.x >> 13u) & 7u;
    let hat_relief = (a.zus.x & 65536u) != 0u && r_eigen && r_klasse <= 4u;
    var rauh_karte = 1.0;
    if (hat_relief) {
        let rel = eigen_kachel(r_klasse, i32(a.zus.x & 8191u), uvs, gx, gy);
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
        let nt = vec2<f32>(rel.r * 2.0 - 1.0, rel.g * 2.0 - 1.0);
        let nz = sqrt(max(1.0 - dot(nt, nt), 0.0));
        n = normalize(tt * nt.x + bb * nt.y + ng * nz);
        rauh_karte = rel.b;
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
    var pbr_farbe = vec3<f32>(0.0);
    if (pbr) {
        pbr_farbe = pbr_licht(a.welt, n, ng, v, albedo, glanz, rauh_karte, hat_relief, metall, nass, sonne);
    } else {

    // Sonne
    let h = normalize(l + v);
    let spiegel = pow(max(dot(n, h), 0.0), hart) * staerke * norm * min(ndl * 4.0, 1.0);
    diffus = diffus + szene.sonne_farbe.rgb * (ndl * sonne);
    glanzlicht = glanzlicht + szene.sonne_farbe.rgb * (spiegel * sonne);

    // Punktlichter (weicher Abfall bis zur Reichweite): viele über die Zellen-Tabelle, sonst die 8 aus SZENE (v1)
    if (lichter.raster.w > 0.5) {
        let kopf = zellwort(zelle(a.welt));
        let erstes = kopf >> 8u;
        let zahl = kopf & 255u;
        for (var j = 0u; j < zahl; j = j + 1u) {
            let li = zellwort(erstes + j);
            let lp = licht_texel(li, 0u);
            let lf = licht_texel(li, 1u);
            let lr = licht_texel(li, 2u);
            let d = lp.xyz - a.welt;
            let abst = length(d);
            let ld = d / max(abst, 0.0001);
            let x = clamp(1.0 - abst / max(lp.w, 0.0001), 0.0, 1.0);
            // Spot: weicher Rand zwischen cos(außen) und cos(innen); Punktlicht: außen −2, innen −1.5 → immer 1
            let kegel = smoothstep(lf.w, lr.w, dot(-ld, lr.xyz));
            let daempf = x * x * kegel;
            let nl = max(dot(n, ld), 0.0);
            let hl = normalize(ld + v);
            let sp = pow(max(dot(n, hl), 0.0), hart) * staerke * norm * min(nl * 4.0, 1.0);
            diffus = diffus + lf.rgb * (nl * daempf);
            glanzlicht = glanzlicht + lf.rgb * (sp * daempf);
        }
    }
    let anzahl = select(i32(szene.zahlen.x + 0.5), 0, lichter.raster.w > 0.5);
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
    farbe = mix(farbe, albedo, min(leuchten, 1.0)) + albedo * max(leuchten - 1.0, 0.0);

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
