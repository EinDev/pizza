// 3D-Teilchen (`Funken`, Abschnitt TEILCHEN3D, 20 Bytes je Teilchen): kamerazugewandte Vierecke, 6 Ecken aus vertex_index.
// Rechts/oben der Kamera aus den Zeilen 0/1 von ansicht_proj (Projektion symmetrisch → Zeile 0 ∥ rechts, Zeile 1 ∥ oben).
// Tiefe testen, nicht schreiben; Nebel ja, keine Schatten. leuchtend: weicher Schein mit heißem Kern, additiv gemischt,
// im Nebel ausgeblendet. deckend: runde Scheibe mit weichem Rand, „source over“ (Kern sortiert von hinten nach vorn).
// Zusatz (Abschnitt ZUSATZ_TEILCHEN, 16 B je Teilchen, sonst Nullen = wie oben): `strich` ≠ 0 → Strich entlang der Bewegung
// (Achse in der Welt, um sie zur Kamera gedreht, mindestens ~1 Gerätepixel breit – dünner wird er blasser statt zu flimmern),
// zum Schwanz hin auslaufend; `licht` > 0 → die Farbe wird mit Umgebung, Nebelfarbe und den Lichtern am Teilchen (Zellen bzw.
// die 8 aus SZENE) beleuchtet, Lichter hinter dem Teilchen (gegen das Licht gesehen) stärker – Vorwärtsstreuung im Tropfen.

// Viele Lichter (wie licht.wgsl): Kopf, Lichter-Texel, Zellen – hier schon im Vertex-Shader gelesen (nur textureLoad)
struct Lichter {
    raster: vec4<f32>,
    tiefe: vec4<f32>,
    vorn: vec4<f32>,
    frei: vec4<f32>,
}
@group(0) @binding(14) var<uniform> lichter: Lichter;
@group(0) @binding(15) var lichter_t: texture_2d<f32>;
@group(0) @binding(16) var zellen_t: texture_2d<u32>;

fn zellwort(i: u32) -> u32 {
    return textureLoad(zellen_t, vec2<i32>(i32(i & 1023u), i32(i >> 10u)), 0).x;
}
fn licht_texel(i: u32, k: u32) -> vec4<f32> {
    return textureLoad(lichter_t, vec2<i32>(i32((i & 63u) * 3u + k), i32(i >> 6u)), 0);
}
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

struct EinFunke {
    @builtin(vertex_index) ecke: u32,
    @location(0) pos: vec3<f32>,     // Weltlage (gestreckt: Mitte des Strichs)
    @location(1) r: f32,             // halbe Größe (Welt)
    @location(2) farbe: vec4<f32>,   // sRGB, nicht vormultipliziert
    @location(3) strich: vec3<f32>,  // ZUSATZ_TEILCHEN: halbe Strichachse (Welt), Kopf = pos + strich
    @location(4) merkmale: u32,      // Bits 0–7 licht · 255
}

struct AusFunke {
    @builtin(position) pos: vec4<f32>,
    @location(0) lokal: vec2<f32>,                      // −1 … 1 über das Viereck (gestreckt: x quer, y Schwanz → Kopf)
    @location(1) @interpolate(flat) farbe: vec4<f32>,   // linear rgb, a
    @location(2) @interpolate(flat) nebel: f32,         // Nebelanteil 0 … 1
    @location(3) @interpolate(flat) zusatz: vec4<f32>,  // gestreckt (0/1), Deckkraft-Faktor (Mindestbreite), Kappe (Anteil), 0
}

// Licht am Teilchen: Umgebung (Halbkugel oben) und Nebelfarbe als Grund, Sonne und Lichter mit Abfall und Kegel,
// gewichtet mit einer Vorwärtsstreuung (Licht hinter dem Teilchen, von der Kamera aus gesehen, zählt bis 4-fach)
fn streuung(blick: vec3<f32>, zum_licht: vec3<f32>) -> f32 {
    let g = max(dot(blick, zum_licht), 0.0);
    let g2 = g * g;
    return 0.35 + 3.65 * g2 * g2 * g2;
}

fn teilchen_licht(p: vec3<f32>) -> vec3<f32> {
    let blick = normalize(p - szene.kamera.xyz);
    var c = szene.umgebung_oben.rgb + szene.umgebung_unten.rgb * 0.5;
    if (hdr_an()) {
        c = c + stimmung.farbe.rgb * 0.6;
    } else if (szene.nebel_farbe.w > 0.5) {
        c = c + szene.nebel_farbe.rgb * 0.3;
    }
    c = c + szene.sonne_farbe.rgb * streuung(blick, szene.sonne_richtung.xyz) * 0.5;
    if (lichter.raster.w > 0.5) {
        let kopf = zellwort(zelle(p));
        let erstes = kopf >> 8u;
        let zahl = kopf & 255u;
        for (var j = 0u; j < zahl; j = j + 1u) {
            let li = zellwort(erstes + j) & 65535u;
            let lp = licht_texel(li, 0u);
            let lf = licht_texel(li, 1u);
            let lr = licht_texel(li, 2u);
            let d = lp.xyz - p;
            let abst = length(d);
            let ld = d / max(abst, 0.0001);
            let x = clamp(1.0 - abst / max(lp.w, 0.0001), 0.0, 1.0);
            let daempf = x * x * smoothstep(lf.w, lr.w, dot(-ld, lr.xyz));
            c = c + lf.rgb * (daempf * streuung(blick, ld));
        }
    } else {
        let anzahl = i32(szene.zahlen.x + 0.5);
        for (var i = 0; i < 8; i = i + 1) {
            if (i < anzahl) {
                let lp = szene.licht_pos[i];
                let d = lp.xyz - p;
                let abst = length(d);
                let ld = d / max(abst, 0.0001);
                let x = clamp(1.0 - abst / max(lp.w, 0.0001), 0.0, 1.0);
                c = c + szene.licht_farbe[i].rgb * (x * x * streuung(blick, ld));
            }
        }
    }
    return c;
}

@vertex
fn vs_funke(e: EinFunke) -> AusFunke {
    var ecken = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0),
    );
    let c = ecken[e.ecke % 6u];
    let m = szene.ansicht_proj;
    let rechts = normalize(vec3<f32>(m[0][0], m[1][0], m[2][0]));
    let oben = normalize(vec3<f32>(m[0][1], m[1][1], m[2][1]));
    var welt = e.pos + (rechts * c.x + oben * c.y) * e.r;
    var zusatz = vec4<f32>(0.0);
    // Strich: Achse um sich selbst zur Kamera gedreht; schaut man fast entlang der Achse, bleibt es ein rundes Teilchen
    let l = length(e.strich);
    if (l > 1e-6) {
        let achse = e.strich / l;
        let quer0 = cross(achse, normalize(szene.kamera.xyz - e.pos));
        let ql = length(quer0);
        if (ql > 0.05) {
            let quer = quer0 / ql;
            // Mindestbreite ~0,6 Gerätepixel: Weltmaß eines Pixels in dieser Tiefe aus der Projektion (Zeile 1 = P11 · oben)
            let w = (m * vec4<f32>(e.pos, 1.0)).w;
            let p11 = length(vec3<f32>(m[0][1], m[1][1], m[2][1]));
            let px = 2.0 * max(w, 1e-4) / max(p11 * szene.feld.y * ansicht.a.x, 1.0);
            let r = max(e.r, 0.6 * px);
            let lang = l + r;
            welt = e.pos + quer * (c.x * r) + achse * (c.y * lang);
            zusatz = vec4<f32>(1.0, e.r / r, r / lang, 0.0);
        }
    }
    var a: AusFunke;
    a.pos = m * vec4<f32>(welt, 1.0);
    a.lokal = c;
    a.farbe = vec4<f32>(zu_linear(e.farbe.rgb), e.farbe.a);
    let licht = f32(e.merkmale & 255u) / 255.0;
    if (licht > 0.0) {
        a.farbe = vec4<f32>(mix(a.farbe.rgb, a.farbe.rgb * teilchen_licht(e.pos), licht), a.farbe.a);
    }
    var f = 0.0;
    if (szene.nebel_farbe.w > 0.5) {
        f = clamp((length(szene.kamera.xyz - e.pos) - szene.nebel.x) * szene.nebel.z, 0.0, 1.0);
    }
    if (hdr_an()) {
        f = 1.0 - (1.0 - f) * (1.0 - hoehennebel(szene.kamera.xyz, e.pos));
    }
    a.nebel = f;
    a.zusatz = zusatz;
    return a;
}

// Form eines Strichs: quer weich (1 − x²), längs vom Schwanz (y = −1) zum Kopf ansteigend, Kopf und Schwanz gerundet
fn strich_form(a: AusFunke) -> f32 {
    let quer = clamp(1.0 - a.lokal.x * a.lokal.x, 0.0, 1.0);
    let k = a.zusatz.z;
    let laengs = smoothstep(-1.0, 0.55, a.lokal.y) * (1.0 - smoothstep(1.0 - 1.6 * k, 1.0, a.lokal.y));
    return quer * laengs * a.zusatz.y;
}

// leuchtend: Schein (1 − r²)² plus heißer, fast weißer Kern; Ausgabe vormultipliziert (Mischen One/One)
@fragment
fn fs_leuchtend(a: AusFunke) -> @location(0) vec4<f32> {
    if (a.zusatz.x > 0.5) {
        let s = strich_form(a);
        if (s <= 0.0) {
            discard;
        }
        let licht = a.farbe.rgb * (s * a.farbe.a * (1.0 - a.nebel));
        if (hdr_an()) {
            return vec4<f32>(licht, 0.0);
        }
        return vec4<f32>(zu_srgb(licht), 0.0);
    }
    let r2 = dot(a.lokal, a.lokal);
    let q = clamp(1.0 - r2, 0.0, 1.0);
    let schein = q * q;
    let kern = q * q * q * q * q * q * q * q;
    let heiss = mix(a.farbe.rgb, vec3<f32>(1.0, 0.96, 0.86), 0.65);
    let licht = (a.farbe.rgb * schein * 0.85 + heiss * kern) * (a.farbe.a * (1.0 - a.nebel));
    if (r2 >= 1.0) {
        discard;
    }
    if (hdr_an()) {
        return vec4<f32>(licht, 0.0);
    }
    return vec4<f32>(zu_srgb(licht), 0.0);
}

// deckend: Scheibe, Rand über die Bildschirmableitung geglättet (Ableitung vor jeder Verzweigung)
@fragment
fn fs_deckend(a: AusFunke) -> @location(0) vec4<f32> {
    let r = length(a.lokal);
    let breite = max(fwidth(r) * 1.5, 0.12);
    var deck = a.farbe.a * (1.0 - smoothstep(1.0 - breite, 1.0, r));
    var woelbung = 0.82 + 0.18 * sqrt(max(1.0 - r * r, 0.0));
    if (a.zusatz.x > 0.5) {
        deck = a.farbe.a * strich_form(a);
        woelbung = 1.0;
    }
    let farbe = mix(a.farbe.rgb * woelbung, szene.nebel_farbe.rgb, a.nebel);
    if (deck <= 0.002) {
        discard;
    }
    if (hdr_an()) {
        return vec4<f32>(farbe, deck);
    }
    return vec4<f32>(zu_srgb(farbe) + vec3<f32>(rauschen(a.pos.xy) / 255.0), deck);
}
