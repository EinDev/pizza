// Bildschirmraum (H-K24, Abschnitt BILDRAUM): Verdeckung (SSAO) und Bildraum-Spiegelung (SSR). Programm = gemeinsam.wgsl + diese
// Datei, eigenes Layout `bildraum` (herd/README.md §9): 0 SZENE, 17 STIMMUNG, 22 Bildraum-Block (Glut), 23 Tiefe des Vorlaufs
// (Depth32Float, nur textureLoad), 24 Normale + Rauheit (Rgb10a2), 25 Glanz-Gewicht + SSR-Anteil (Rgba8), 26 Quelle (Verdeckung
// bzw. Farbstufe), 27 Sampler linear (Rand geklemmt), 28 … 32 Farbstufen 0 … 4 der HDR-Kopie, 33 Sampler nächster Nachbar (Tiefe).
// Alle Durchgänge sind Vollbild-Dreiecke mit dem Viewport des eingepassten Spielfelds (Verdeckung: halbe Größe); Pixel-
// Koordinaten sind Zielpixel wie im Vorlauf. Zufall nur aus einem Ganzzahl-Hash der Pixelstelle – gleich auf allen Schnittstellen.

@group(0) @binding(23) var tiefe_t: texture_2d<f32>;
@group(0) @binding(24) var normale_t: texture_2d<f32>;
@group(0) @binding(25) var gewicht_t: texture_2d<f32>;
@group(0) @binding(26) var quelle_t: texture_2d<f32>;
@group(0) @binding(27) var lin_s: sampler;
@group(0) @binding(28) var farbe0: texture_2d<f32>;
@group(0) @binding(29) var farbe1: texture_2d<f32>;
@group(0) @binding(30) var farbe2: texture_2d<f32>;
@group(0) @binding(31) var farbe3: texture_2d<f32>;
@group(0) @binding(32) var farbe4: texture_2d<f32>;
// Tiefe über einen eigenen Sampler (nächster Nachbar) statt textureLoad: unter WebGL2 läge an der Einheit sonst womöglich noch
// der Vergleichs-Sampler der Schatten (TEXTURE_COMPARE_MODE) – texelFetch auf einer Tiefentextur wäre dann undefiniert
@group(0) @binding(33) var punkt_s: sampler;

struct AusVoll {
    @builtin(position) pos: vec4<f32>,
}

@vertex
fn vs_bildraum(@builtin(vertex_index) i: u32) -> AusVoll {
    let x = f32((i << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(i & 2u) * 2.0 - 1.0;
    var a: AusVoll;
    a.pos = vec4<f32>(x, y, 0.0, 1.0);
    return a;
}

const PI2: f32 = 6.28318531;

// Ganzzahl-Hash (PCG) einer Pixelstelle → [0, 1)
fn pixel_hash(p: vec2<i32>, salz: u32) -> f32 {
    var h = ((bitcast<u32>(p.x) * 1597334677u) ^ (bitcast<u32>(p.y) * 3812015801u)) ^ (salz * 2654435761u);
    h = h * 747796405u + 2891336453u;
    h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
    h = (h >> 22u) ^ h;
    return f32(h & 16777215u) / 16777216.0;
}

fn tiefe_bei(p: vec2<i32>) -> f32 {
    let g = vec2<i32>(textureDimensions(tiefe_t));
    let q = clamp(p, vec2<i32>(0), g - vec2<i32>(1));
    return textureSampleLevel(tiefe_t, punkt_s, (vec2<f32>(q) + vec2<f32>(0.5)) / vec2<f32>(g), 0.0).x;
}

// Tiefe 0 … 1 → Abstand entlang der Blickrichtung (Perspektive des Kerns: nah, fern)
fn linear(d: f32) -> f32 {
    let n = bildraum.b.x;
    let f = bildraum.b.y;
    return n * f / (f - d * (f - n));
}

// Zielpixel → NDC des eingepassten Spielfelds
fn ndc_von(px: vec2<f32>) -> vec2<f32> {
    let q = (px - bildraum.ziel.xy) / bildraum.ziel.zw;
    return vec2<f32>(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0);
}

fn welt_von(px: vec2<f32>, d: f32) -> vec3<f32> {
    let h = bildraum.inv * vec4<f32>(ndc_von(px), d, 1.0);
    return h.xyz / h.w;
}

// Clip-Lage → Zielpixel
fn pixel_von(c: vec4<f32>) -> vec2<f32> {
    let ndc = c.xy / c.w;
    return bildraum.ziel.xy + vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * bildraum.ziel.zw;
}

fn oktaeder_zurueck(e: vec2<f32>) -> vec3<f32> {
    let f = e * 2.0 - vec2<f32>(1.0);
    var n = vec3<f32>(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
    let t = clamp(-n.z, 0.0, 1.0);
    n.x = n.x + select(t, -t, n.x >= 0.0);
    n.y = n.y + select(t, -t, n.y >= 0.0);
    return normalize(n);
}

// ---------------- Verdeckung (SSAO): halbe Größe, 12 Abtastungen in der Halbkugel um die Normale ----------------

@fragment
fn fs_verdeckung(a: AusVoll) -> @location(0) vec4<f32> {
    let hp = vec2<i32>(floor(a.pos.xy));
    let ip = hp * 2;
    let d = tiefe_bei(ip);
    if (d >= 1.0) {
        return vec4<f32>(1.0);
    }
    let px = vec2<f32>(ip) + vec2<f32>(0.5);
    let p = welt_von(px, d);
    let n = oktaeder_zurueck(textureLoad(normale_t, ip, 0).xy);
    let zp = linear(d);
    let r = bildraum.a.y;
    // Drehung um die Normale aus dem Pixel-Hash (kein Geräte-Zufall)
    let w = pixel_hash(hp, 7u) * PI2;
    let hilfs = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), abs(n.x) > 0.8);
    let t0 = normalize(cross(n, hilfs));
    let b0 = cross(n, t0);
    let t = t0 * cos(w) + b0 * sin(w);
    let b = cross(n, t);
    var belegt = 0.0;
    for (var i = 0; i < 12; i = i + 1) {
        // Halbkugel: goldener Winkel, Höhe gleichmäßig, Länge zur Mitte hin dichter
        let fi = f32(i);
        let u = (fi + 0.5) / 12.0;
        let hoehe = 0.15 + 0.85 * fract(fi * 0.618034 + 0.31);
        let quer = sqrt(max(1.0 - hoehe * hoehe, 0.0));
        let ww = fi * 2.39996323;
        let laenge = mix(0.12, 1.0, u * u);
        let k = vec3<f32>(cos(ww) * quer, sin(ww) * quer, hoehe) * laenge;
        let s = p + (t * k.x + b * k.y + n * k.z) * r;
        let c = szene.ansicht_proj * vec4<f32>(s, 1.0);
        if (c.w > bildraum.b.x) {
            let q = pixel_von(c);
            let zs = linear(tiefe_bei(vec2<i32>(floor(q))));
            // verdeckt, wenn die Szene an dieser Stelle näher liegt als die Abtastung; ferne Kanten zählen nicht
            let bereich = smoothstep(0.0, 1.0, r / max(abs(zp - zs), 1e-4));
            belegt = belegt + select(0.0, bereich, zs < c.w - (0.02 * r + 0.002 * zp));
        }
    }
    let ao = pow(clamp(1.0 - belegt / 12.0, 0.0, 1.0), bildraum.a.x);
    return vec4<f32>(ao, ao, ao, 1.0);
}

// zweimal 1D bilateral weichzeichnen (7 Abtastungen, Gewicht nach Abstand und Tiefenunterschied)
fn weich(a: AusVoll, richtung: vec2<i32>) -> vec4<f32> {
    let hp = vec2<i32>(floor(a.pos.xy));
    let d = tiefe_bei(hp * 2);
    if (d >= 1.0) {
        return vec4<f32>(1.0);
    }
    let zc = linear(d);
    let g = vec2<i32>(textureDimensions(quelle_t)) - vec2<i32>(1);
    var summe = 0.0;
    var gewichte = 0.0;
    for (var j = -3; j <= 3; j = j + 1) {
        let q = clamp(hp + richtung * j, vec2<i32>(0), g);
        let v = textureLoad(quelle_t, q, 0).r;
        let z = linear(tiefe_bei(q * 2));
        let fj = f32(j);
        let wg = exp(-fj * fj / 4.5) * exp(-abs(z - zc) / (0.02 * zc + 0.02));
        summe = summe + v * wg;
        gewichte = gewichte + wg;
    }
    let ao = summe / max(gewichte, 1e-5);
    return vec4<f32>(ao, ao, ao, 1.0);
}

@fragment
fn fs_weich_x(a: AusVoll) -> @location(0) vec4<f32> {
    return weich(a, vec2<i32>(1, 0));
}

@fragment
fn fs_weich_y(a: AusVoll) -> @location(0) vec4<f32> {
    return weich(a, vec2<i32>(0, 1));
}

// ---------------- Bildraum-Spiegelung (SSR) ----------------

// Farbstufen der HDR-Kopie: halbe Größe je Stufe; 4 bilineare Abtastungen der größeren Stufe (Kasten 4 × 4)
@fragment
fn fs_verkleinern(a: AusVoll) -> @location(0) vec4<f32> {
    let t = 1.0 / vec2<f32>(textureDimensions(quelle_t));
    let uv = a.pos.xy * 2.0 * t;
    var c = textureSampleLevel(quelle_t, lin_s, uv + vec2<f32>(-t.x, -t.y), 0.0).rgb;
    c = c + textureSampleLevel(quelle_t, lin_s, uv + vec2<f32>(t.x, -t.y), 0.0).rgb;
    c = c + textureSampleLevel(quelle_t, lin_s, uv + vec2<f32>(-t.x, t.y), 0.0).rgb;
    c = c + textureSampleLevel(quelle_t, lin_s, uv + vec2<f32>(t.x, t.y), 0.0).rgb;
    return vec4<f32>(c * 0.25, 1.0);
}

fn farbstufe(i: i32, uv: vec2<f32>) -> vec3<f32> {
    var c = vec3<f32>(0.0);
    switch i {
        case 0: { c = textureSampleLevel(farbe0, lin_s, uv, 0.0).rgb; }
        case 1: { c = textureSampleLevel(farbe1, lin_s, uv, 0.0).rgb; }
        case 2: { c = textureSampleLevel(farbe2, lin_s, uv, 0.0).rgb; }
        case 3: { c = textureSampleLevel(farbe3, lin_s, uv, 0.0).rgb; }
        default: { c = textureSampleLevel(farbe4, lin_s, uv, 0.0).rgb; }
    }
    return c;
}

const SCHRITTE: i32 = 48;
const HALBIERUNGEN: i32 = 6;

// Strahlmarsch im Bildschirmraum (perspektivisch richtig über 1/w): höchstens 48 Schritte bis zum Bildrand + 6 Halbierungen,
// Startversatz aus dem Pixel-Hash. Ergebnis additiv ins HDR-Bild vor dem Durchsichtigen: (Treffer − Umgebungsglanz aus
// fs_licht) × Gewicht – ein Fehltreffer, der Bildrand und die Rückseite lassen also die Umgebung (Himmelszelt/Halbkugel) bzw.
// auf der Spiegelebene die planare Spiegelung stehen.
@fragment
fn fs_bildspiegel(a: AusVoll) -> @location(0) vec4<f32> {
    let ip = vec2<i32>(floor(a.pos.xy));
    let g = textureLoad(gewicht_t, ip, 0);
    let staerke = bildraum.a.z * g.a;
    if (staerke <= 0.001 || max(g.r, max(g.g, g.b)) < 0.002) {
        return vec4<f32>(0.0);
    }
    let nr = textureLoad(normale_t, ip, 0);
    let rauh = nr.z;
    let d = tiefe_bei(ip);
    if (d >= 1.0 || rauh > 0.8) {
        return vec4<f32>(0.0);
    }
    let n = oktaeder_zurueck(nr.xy);
    let px = vec2<f32>(ip) + vec2<f32>(0.5);
    let p = welt_von(px, d);
    let v = normalize(p - szene.kamera.xyz);
    let r = reflect(v, n);
    let nah = bildraum.b.x;
    // Strahl bis zur halben Sichtweite, vor der Nahebene gekappt
    let c0 = szene.ansicht_proj * vec4<f32>(p, 1.0);
    var lang = bildraum.b.y * 0.5;
    var c1 = szene.ansicht_proj * vec4<f32>(p + r * lang, 1.0);
    if (c1.w < nah * 1.5) {
        lang = lang * (c0.w - nah * 1.5) / max(c0.w - c1.w, 1e-5);
        c1 = szene.ansicht_proj * vec4<f32>(p + r * lang, 1.0);
    }
    let s0 = pixel_von(c0);
    let s1 = pixel_von(c1);
    let k0 = 1.0 / c0.w;
    let k1 = 1.0 / c1.w;
    let dir = s1 - s0;
    // am Rand des Spielfelds abschneiden
    let lo = bildraum.ziel.xy + vec2<f32>(0.5);
    let hi = bildraum.ziel.xy + bildraum.ziel.zw - vec2<f32>(0.5);
    var tmax = 1.0;
    if (dir.x > 1e-4) { tmax = min(tmax, (hi.x - s0.x) / dir.x); }
    if (dir.x < -1e-4) { tmax = min(tmax, (lo.x - s0.x) / dir.x); }
    if (dir.y > 1e-4) { tmax = min(tmax, (hi.y - s0.y) / dir.y); }
    if (dir.y < -1e-4) { tmax = min(tmax, (lo.y - s0.y) / dir.y); }
    if (length(dir) * tmax < 2.0) {
        return vec4<f32>(0.0);
    }
    let versatz = pixel_hash(ip, 11u);
    // erst ab 2,5 Pixeln Abstand suchen (die eigene Fläche ist sonst wegen Rasterung und Tiefengenauigkeit „getroffen“)
    let t0 = min(2.5 / length(dir), tmax);
    var t_alt = 0.0;
    var z_alt = c0.w;
    var t_hit = -1.0;
    // erster Schritt, an dem der Strahl knapp hinter einer Fläche verschwand (Ersatz, wenn er nie sichtbar auftrifft)
    var t_hinter = -1.0;
    var t_vor_hinter = 0.0;
    for (var i = 0; i < SCHRITTE; i = i + 1) {
        let t = t0 + (tmax - t0) * (f32(i) + versatz) / f32(SCHRITTE);
        let s = s0 + dir * t;
        let z = 1.0 / mix(k0, k1, t);
        let ds = tiefe_bei(vec2<i32>(floor(s)));
        if (ds < 1.0) {
            let zs = linear(ds);
            // Treffer: hinter der Fläche (mit kleinem Abstand), und entweder dünn genug dahinter oder in diesem Schritt durch
            // ihre Vorderseite getreten (der vorige Strahlpunkt lag noch davor)
            let dicke = max(abs(z - z_alt) * 1.5, 0.08 + 0.02 * zs);
            let eps = 0.003 + 0.002 * zs;
            if (z > zs + eps) {
                if (z - zs < dicke || z_alt <= zs) {
                    t_hit = t;
                    break;
                }
                // nur knapp dahinter (Gurtbogen vor dem Gewölbe), nicht weit hinter einem frei stehenden Ding (Säule, Leuchtband)
                if (t_hinter < 0.0 && z - zs < 0.6 + 0.05 * zs) {
                    t_hinter = t;
                    t_vor_hinter = t_alt;
                }
            }
        }
        t_alt = t;
        z_alt = z;
    }
    // Strahl lief hinter einem Vordergrund entlang und kam nicht wieder hervor: die verdeckende Kante nehmen (gestreckt) statt
    // der Umgebung – in geschlossenen Räumen wären das sonst helle Körner an jedem Bogen
    if (t_hit < 0.0 && t_hinter >= 0.0) {
        t_hit = t_hinter;
        t_alt = t_vor_hinter;
    }
    if (t_hit < 0.0) {
        return vec4<f32>(0.0);
    }
    // Halbierungen zwischen dem letzten freien und dem ersten verdeckten Schritt
    var tl = t_alt;
    var th = t_hit;
    for (var j = 0; j < HALBIERUNGEN; j = j + 1) {
        let tm = 0.5 * (tl + th);
        let s = s0 + dir * tm;
        let z = 1.0 / mix(k0, k1, tm);
        let zs = linear(tiefe_bei(vec2<i32>(floor(s))));
        if (z > zs) {
            th = tm;
        } else {
            tl = tm;
        }
    }
    let sh = s0 + dir * th;
    let ih = vec2<i32>(floor(sh));
    // Vertrauen: Rückseiten (die getroffene Fläche schaut deutlich vom Strahl weg; streifend getroffene Flächen zählen),
    // Strahlen zur Kamera, Bildrand
    let nh = oktaeder_zurueck(textureLoad(normale_t, ih, 0).xy);
    var vertrauen = 1.0 - smoothstep(0.2, 0.6, dot(nh, r));
    vertrauen = vertrauen * smoothstep(-0.6, -0.1, dot(r, v));
    let q = (sh - bildraum.ziel.xy) / bildraum.ziel.zw;
    let rand = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
    vertrauen = vertrauen * smoothstep(0.0, 0.08, rand);
    vertrauen = vertrauen * (1.0 - smoothstep(0.55, 0.8, rauh));
    if (vertrauen <= 0.001) {
        return vec4<f32>(0.0);
    }
    // Farbe aus der Stufe nach Rauheit (unscharf), zwei Stufen gemischt
    let uv = sh * bildraum.groesse.zw;
    let stufe = clamp(rauh * 7.0, 0.0, 4.0);
    let s0i = i32(floor(stufe));
    var treffer = farbstufe(s0i, uv);
    if (s0i < 4) {
        treffer = mix(treffer, farbstufe(s0i + 1, uv), stufe - f32(s0i));
    }
    // ersetzt den Umgebungsglanz aus fs_licht (Halbkugel in Spiegelrichtung × Verdeckung), Nebel wie dort
    var um = mix(szene.umgebung_unten.rgb, szene.umgebung_oben.rgb, smoothstep(-0.4, 0.7, r.y)) * 2.2;
    if (bildraum.b.z > 0.5) {
        um = um * textureSampleLevel(quelle_t, lin_s, px * bildraum.groesse.zw, 0.0).r;
    }
    var klar = 1.0 - hoehennebel(szene.kamera.xyz, p);
    if (szene.nebel_farbe.w > 0.5) {
        klar = klar * (1.0 - clamp((length(szene.kamera.xyz - p) - szene.nebel.x) * szene.nebel.z, 0.0, 1.0));
    }
    return vec4<f32>((treffer - um) * g.rgb * (staerke * vertrauen * klar), 0.0);
}
