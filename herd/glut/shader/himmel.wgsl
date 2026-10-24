// Himmel hinter der 3D-Szene: Verlauf nach der **Blickrichtung** (Horizont = himmel_unten, Zenit = himmel_oben,
// unter dem Horizont himmel_unten) – so geht nebliger Boden (Nebelfarbe = himmel_unten) nahtlos in den Himmel über.
// Ein Dreieck über das ganze Spielfeld, ohne Puffer; die Blickstrahlen kommen aus der Inversen von ansicht_proj.

struct AusHimmel {
    @builtin(position) pos: vec4<f32>,
    @location(0) strahl: vec3<f32>,
}

fn inverse4(m: mat4x4<f32>) -> mat4x4<f32> {
    let a00 = m[0][0]; let a01 = m[0][1]; let a02 = m[0][2]; let a03 = m[0][3];
    let a10 = m[1][0]; let a11 = m[1][1]; let a12 = m[1][2]; let a13 = m[1][3];
    let a20 = m[2][0]; let a21 = m[2][1]; let a22 = m[2][2]; let a23 = m[2][3];
    let a30 = m[3][0]; let a31 = m[3][1]; let a32 = m[3][2]; let a33 = m[3][3];
    let b00 = a00 * a11 - a01 * a10; let b01 = a00 * a12 - a02 * a10;
    let b02 = a00 * a13 - a03 * a10; let b03 = a01 * a12 - a02 * a11;
    let b04 = a01 * a13 - a03 * a11; let b05 = a02 * a13 - a03 * a12;
    let b06 = a20 * a31 - a21 * a30; let b07 = a20 * a32 - a22 * a30;
    let b08 = a20 * a33 - a23 * a30; let b09 = a21 * a32 - a22 * a31;
    let b10 = a21 * a33 - a23 * a31; let b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    let k = select(1.0 / det, 0.0, abs(det) < 1e-30);
    return mat4x4<f32>(
        vec4<f32>(a11 * b11 - a12 * b10 + a13 * b09, a02 * b10 - a01 * b11 - a03 * b09, a31 * b05 - a32 * b04 + a33 * b03, a22 * b04 - a21 * b05 - a23 * b03) * k,
        vec4<f32>(a12 * b08 - a10 * b11 - a13 * b07, a00 * b11 - a02 * b08 + a03 * b07, a32 * b02 - a30 * b05 - a33 * b01, a20 * b05 - a22 * b02 + a23 * b01) * k,
        vec4<f32>(a10 * b10 - a11 * b08 + a13 * b06, a01 * b08 - a00 * b10 - a03 * b06, a30 * b04 - a31 * b02 + a33 * b00, a21 * b02 - a20 * b04 - a23 * b00) * k,
        vec4<f32>(a11 * b07 - a10 * b09 - a12 * b06, a00 * b09 - a01 * b07 + a02 * b06, a31 * b01 - a30 * b03 - a32 * b00, a20 * b03 - a21 * b01 + a22 * b00) * k,
    );
}

@vertex
fn vs_himmel(@builtin(vertex_index) i: u32) -> AusHimmel {
    let x = f32((i << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(i & 2u) * 2.0 - 1.0;
    var a: AusHimmel;
    a.pos = vec4<f32>(x, y, 0.0, 1.0);
    // Punkt auf dem Strahl (homogen) minus Kamera·w: linear im Bildraum, also unverzerrt interpolierbar
    let p = inverse4(szene.ansicht_proj) * vec4<f32>(x, y, 0.5, 1.0);
    a.strahl = p.xyz - szene.kamera.xyz * p.w;
    return a;
}

@fragment
fn fs_himmel(a: AusHimmel) -> @location(0) vec4<f32> {
    let d = normalize(a.strahl);
    let h = clamp(d.y, 0.0, 1.0);
    // schnell weg vom Horizont, dann sanft zum Zenit
    let t = 1.0 - pow(1.0 - h, 8.0);
    let c = mix(szene.himmel_unten.rgb, szene.himmel_oben.rgb, t);
    return vec4<f32>(zu_srgb(c) + vec3<f32>(rauschen(a.pos.xy) / 255.0), 1.0);
}

// ---- Himmelszelt (H-K11b, Abschnitt HIMMELSZELT, 208 Bytes, herd/README.md §4) ----
// Skybox ohne Cube-Map (WebGL2-tauglich): die Blickrichtung wählt eine der sechs Würfelseiten (größte Komponente) und deren
// Koordinate (aufgeklapptes Kreuz um `vorn` = −z). Seite mit Bild: Atlas (`textureLoad`, bilinear von Hand, vormultipliziert)
// oder eigene Textur (PD3-Arrays, bilinear je Stufe, trilinear beim Verkleinern); die Deckkraft des Bildes mischt über den
// prozeduralen Himmel. Ohne Bild: Verlauf unten → horizont → oben, Sonnenscheibe mit Schein, Sterne aus Hash-Rauschen je Zelle
// der Würfelseite (Größe in Bildschirmpixeln, damit sie auf jedem Adapter gleich weich aussehen). Alle Ableitungen am Anfang
// im gleichförmigen Kontrollfluss, danach nur explizite Stufen.

struct Zelt {
    oben: vec4<f32>,         // linear
    horizont: vec4<f32>,
    boden: vec4<f32>,
    sonne: vec4<f32>,        // xyz zur Sonne (normiert), w = halber Scheibenwinkel (Bogenmaß, 0 = aus)
    sonne_farbe: vec4<f32>,  // linear, w = Sterne 0 … 1
    box: array<vec4<u32>, 6>,   // Atlas-/Textur-Rechteck u0 v0 u1 v1 (Pixel) je Seite
    wort: array<vec4<u32>, 2>,  // je Seite wie INST3D.textur: Bit 16 Bild, Bit 17 eigene Textur (Glut: Klasse << 13 | Schicht)
}

@group(0) @binding(4) var atlas: texture_2d_array<f32>;
@group(0) @binding(13) var<uniform> zelt: Zelt;

// Zellen je Seitenkante für die Sterne
const STERN_ZELLEN: f32 = 128.0;

fn zelt_hash(x: u32) -> u32 {
    let h = x * 747796405u + 2891336453u;
    let w = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
    return (w >> 22u) ^ w;
}

fn zelt_zufall(h: u32) -> f32 {
    return f32(h & 16777215u) / 16777216.0;
}

// Atlas bilinear (vormultipliziert gemischt), Punkt `p` und Rechteck `b` in Atlas-Pixeln, Seite `s`
fn zelt_atlas(s: i32, p: vec2<f32>, b: vec4<f32>) -> vec4<f32> {
    let lo = b.xy;
    let hi = max(b.zw - vec2<f32>(1.0), lo);
    let f = p - vec2<f32>(0.5);
    let i0 = floor(f);
    let w = f - i0;
    let a0 = clamp(i0, lo, hi);
    let a1 = clamp(i0 + vec2<f32>(1.0), lo, hi);
    let c00 = textureLoad(atlas, vec2<i32>(i32(a0.x), i32(a0.y)), s, 0);
    let c10 = textureLoad(atlas, vec2<i32>(i32(a1.x), i32(a0.y)), s, 0);
    let c01 = textureLoad(atlas, vec2<i32>(i32(a0.x), i32(a1.y)), s, 0);
    let c11 = textureLoad(atlas, vec2<i32>(i32(a1.x), i32(a1.y)), s, 0);
    let p00 = vec4<f32>(c00.rgb * c00.a, c00.a);
    let p10 = vec4<f32>(c10.rgb * c10.a, c10.a);
    let p01 = vec4<f32>(c01.rgb * c01.a, c01.a);
    let p11 = vec4<f32>(c11.rgb * c11.a, c11.a);
    let c = mix(mix(p00, p10, w.x), mix(p01, p11, w.x), w.y);
    return vec4<f32>(c.rgb / max(c.a, 1.0 / 512.0), c.a);
}

// eigene Textur: bilinear auf Stufe 0 beim Vergrößern (der Himmel wird stark vergrößert – weich statt pixelscharf),
// trilinear zwischen zwei Stufen beim Verkleinern
fn zelt_eigen(k: u32, s: i32, p: vec2<f32>, b: vec4<f32>, lambda: f32) -> vec4<f32> {
    let g = max(b.zw - b.xy, vec2<f32>(1.0));
    let oben = min(floor(log2(max(g.x, g.y))), f32(7u + k));
    let l = clamp(lambda, 0.0, oben);
    let l0 = floor(l);
    var c = eigen_bilinear(k, s, p, b, l0);
    if (l0 < oben) {
        c = mix(c, eigen_bilinear(k, s, p, b, l0 + 1.0), l - l0);
    }
    return vec4<f32>(c.rgb / max(c.a, 1.0 / 512.0), c.a);
}

@fragment
fn fs_zelt(a: AusHimmel) -> @location(0) vec4<f32> {
    let d = normalize(a.strahl);
    // Winkel je Bildschirmpixel (gleichförmiger Kontrollfluss)
    let px = max(max(length(dpdx(d)), length(dpdy(d))), 1e-6);

    // Würfelseite: 0 rechts (+x), 1 links (−x), 2 oben (+y), 3 unten (−y), 4 vorn (−z), 5 hinten (+z)
    let ad = max(abs(d), vec3<f32>(1e-6));
    let x_gross = ad.x >= ad.y && ad.x >= ad.z;
    let y_gross = !x_gross && ad.y >= ad.z;
    let seite = select(select(select(4u, 5u, d.z > 0.0), select(3u, 2u, d.y > 0.0), y_gross), select(1u, 0u, d.x > 0.0), x_gross);
    let ux = vec2<f32>(select(-d.z, d.z, d.x > 0.0), -d.y) / ad.x;
    let uy = vec2<f32>(d.x, select(d.z, -d.z, d.y > 0.0)) / ad.y;
    let uz = vec2<f32>(select(d.x, -d.x, d.z > 0.0), -d.y) / ad.z;
    let u = select(select(uz, uy, y_gross), ux, x_gross);   // −1 … 1 auf der Seite
    let st = clamp(u * 0.5 + vec2<f32>(0.5), vec2<f32>(0.0), vec2<f32>(1.0));

    // ---- prozedural ----
    let h = d.y;
    let nach_oben = 1.0 - pow(1.0 - clamp(h, 0.0, 1.0), 2.5);
    let nach_unten = 1.0 - pow(1.0 - clamp(-h, 0.0, 1.0), 4.0);
    var c = select(mix(zelt.horizont.rgb, zelt.boden.rgb, nach_unten), mix(zelt.horizont.rgb, zelt.oben.rgb, nach_oben), h >= 0.0);
    // Sterne: Zellen gleich im Winkel (atan der Seitenkoordinate), je Zelle höchstens einer, weich, 1,3 … 2,5 Pixel Radius,
    // meist schwach, zum Horizont hin ausgeblendet
    let sterne = zelt.sonne_farbe.w;
    let wk = vec2<f32>(atan(u.x), atan(u.y)) * (4.0 / 3.14159265);   // −1 … 1, gleich im Winkel
    let zelle = (wk * 0.5 + vec2<f32>(0.5)) * STERN_ZELLEN;
    let zi = clamp(floor(zelle), vec2<f32>(0.0), vec2<f32>(STERN_ZELLEN - 1.0));
    let n = u32(STERN_ZELLEN);
    let h0 = zelt_hash(u32(zi.x) + u32(zi.y) * n + seite * n * n);
    let h1 = zelt_hash(h0);
    let h2 = zelt_hash(h1);
    let mitte = vec2<f32>(0.25) + 0.5 * vec2<f32>(zelt_zufall(h1), zelt_zufall(h2));
    // Abstand in Bogenmaß: eine Zelle = (π/2) / STERN_ZELLEN
    let abstand = length(zelle - zi - mitte) * (1.5707963 / STERN_ZELLEN);
    let hell = zelt_zufall(zelt_hash(h2));
    let radius = (1.3 + 1.2 * hell) * px;
    let q = clamp(1.0 - abstand / radius, 0.0, 1.0);
    let da = select(0.0, 1.0, zelt_zufall(h0) < 0.035);
    let stern = da * q * q * (0.15 + 0.85 * hell * hell * hell) * sterne * smoothstep(0.02, 0.3, h);
    c = c + vec3<f32>(1.0, 0.97, 0.9) * stern * 1.8;
    // Sonne: Scheibe (Rand ein Pixel weich, der Horizont schneidet sie ab – sie geht unter) und Schein
    let r = zelt.sonne.w;
    let winkel = acos(clamp(dot(d, zelt.sonne.xyz), -1.0, 1.0));
    let an = select(0.0, 1.0, r > 0.0);
    let ueber = smoothstep(-px, px, h);
    let schein = an * 0.35 * exp(-max(winkel - r, 0.0) / (3.0 * r + 0.03)) * (0.35 + 0.65 * ueber);
    let scheibe = an * ueber * (1.0 - smoothstep(r - px, r + px, winkel));
    c = c + zelt.sonne_farbe.rgb * schein;
    c = mix(c, mix(zelt.sonne_farbe.rgb, vec3<f32>(1.0), 0.6) * 1.15, scheibe);

    // ---- Bild der Seite ----
    let wort = zelt.wort[seite / 4u][seite % 4u];
    let b = vec4<f32>(zelt.box[seite]);
    let p = b.xy + st * (b.zw - b.xy);
    // Stufe aus dem Winkel je Pixel: in der Mitte der Seite liegen eine halbe Kante Texel je Bogenmaß
    let lambda = log2(px * 0.5 * max(max(b.z - b.x, b.w - b.y), 1.0));
    let eigen = (wort & 131072u) != 0u;
    let klasse = (wort >> 13u) & 7u;
    let hat = (wort & 65536u) != 0u && (!eigen || klasse <= 4u);
    if (hat) {
        var t = vec4<f32>(0.0);
        if (eigen) {
            t = zelt_eigen(klasse, i32(wort & 8191u), p, b, lambda);
        } else {
            t = zelt_atlas(i32(wort & 65535u), p, b);
        }
        c = mix(c, zu_linear(t.rgb), t.a);
    }
    return vec4<f32>(zu_srgb(c) + vec3<f32>(rauschen(a.pos.xy) / 255.0), 1.0);
}
