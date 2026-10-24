// 2D: alle Instanzen (INST2D, 56 Bytes) in einem Draw-Call – Uber-Shader nach `art`:
// 1 Rechteck (SDF, Rundung, Umriss), 2 Kreis (SDF, Umriss; auch Partikel), 3 Bild (Atlas, pixelscharf), 4 Glyphe (SDF-Schrift),
// 5 Dreieck (Vieleck, H-K3b: Ecken A = t, B = m.xy, C = m.zw in Spielfeld-Pixeln, Kantenglättung nur an den Außenkanten p.x),
// 6 Texturbild (PD3: eigene Textur; `seite` = Glut-Kennung Klasse << 21 | Schicht, `uv` in Pixeln der Stufe 0, gemeinsam.wgsl).
// Ecken aus vertex_index (6 je Instanz), Kantenglättung über die Bildschirmableitung des Abstands. Ausgabe in sRGB.

@group(0) @binding(4) var atlas: texture_2d_array<f32>;
@group(0) @binding(5) var schrift: texture_2d<f32>;
@group(0) @binding(6) var linear: sampler;

struct EinFlach {
    @builtin(vertex_index) ecke: u32,
    @location(0) m: vec4<f32>,       // m00 m10 m01 m11 (Spalten = lokale Achsen)
    @location(1) t: vec2<f32>,       // Mitte (Spielfeld-Pixel)
    @location(2) h: vec2<f32>,       // halbe Ausdehnung (lokal)
    @location(3) p: vec2<f32>,       // Rundung, Umriss
    @location(4) farbe: vec4<f32>,   // sRGB, nicht vormultipliziert
    @location(5) art: u32,           // art | seite << 8
    @location(6) uv: vec4<u32>,      // Atlas-Pixel u0 v0 u1 v1
}

struct AusFlach {
    @builtin(position) pos: vec4<f32>,
    @location(0) lokal: vec2<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) @interpolate(flat) h: vec2<f32>,
    @location(3) @interpolate(flat) p: vec2<f32>,
    @location(4) @interpolate(flat) farbe: vec4<f32>,
    @location(5) @interpolate(flat) art: u32,
    @location(6) @interpolate(flat) uvbox: vec4<f32>,
}

@vertex
fn vs_flach(e: EinFlach) -> AusFlach {
    var ecken = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0),
    );
    let c = ecken[e.ecke % 6u];
    let art = e.art & 255u;
    let m = mat2x2<f32>(e.m.xy, e.m.zw);
    // Saum für die Kantenglättung: ein Gerätepixel (mindestens ein Spielfeldpixel) in lokalen Einheiten
    let px = max(1.0, 1.0 / max(ansicht.a.x, 0.0001));
    let sx = max(length(e.m.xy), 0.000001);
    let sy = max(length(e.m.zw), 0.000001);
    let saum = select(vec2<f32>(0.0), vec2<f32>(px / sx, px / sy), art <= 2u);
    var lokal = c * (e.h + saum);
    var feld = m * lokal + e.t;
    let uv0 = vec2<f32>(e.uv.xy);
    let uv1 = vec2<f32>(e.uv.zw);
    var uvbox = vec4<f32>(uv0, uv1);
    if (art == 5u) {
        let d = dreieck_ecke(e.ecke % 6u, e.t, e.m.xy, e.m.zw, u32(e.p.x + 0.5), px);
        feld = d.feld;
        lokal = d.bary;
        uvbox = d.hoehen;
    }
    var a: AusFlach;
    a.pos = vec4<f32>(feld.x * szene.feld.z * 2.0 - 1.0, 1.0 - feld.y * szene.feld.w * 2.0, 0.0, 1.0);
    a.lokal = lokal;
    a.uv = mix(uv0, uv1, (c + vec2<f32>(1.0)) * 0.5);
    a.h = e.h;
    a.p = e.p;
    a.farbe = e.farbe;
    a.art = e.art;
    a.uvbox = uvbox;
    return a;
}

struct DreieckEcke {
    feld: vec2<f32>,
    // baryzentrische Koordinaten (λB, λC) der Ecke bezogen auf das ursprüngliche Dreieck
    bary: vec2<f32>,
    // Höhen über den Kanten BC (zu A), CA (zu B), AB (zu C) in Spielfeld-Pixeln; 0 = Innenkante (keine Glättung)
    hoehen: vec4<f32>,
}

// Dreieck (art 5): Außenkanten (Maske Bit 0 = A→B, 1 = B→C, 2 = C→A) um den Saum `px` nach außen versetzt, damit die
// Kantenglättung nach außen Platz hat; Innenkanten bleiben exakt (Nachbardreiecke teilen sie lückenlos). Der Versatz einer Ecke ist
// auf 2 Saumbreiten je Kante begrenzt (bei spitzen Dreiecken glättet die Kante dann nur nach innen). Ecken 3 … 5 fallen auf A (leer).
fn dreieck_ecke(i: u32, pa: vec2<f32>, pb: vec2<f32>, pc: vec2<f32>, maske: u32, px: f32) -> DreieckEcke {
    let det = abs((pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x));
    let l_ab = length(pb - pa);
    let l_bc = length(pc - pb);
    let l_ca = length(pa - pc);
    let h_ab = det / max(l_ab, 0.000001);
    let h_bc = det / max(l_bc, 0.000001);
    let h_ca = det / max(l_ca, 0.000001);
    let gut = det > 0.000001;
    let m_ab = gut && (maske & 1u) != 0u;
    let m_bc = gut && (maske & 2u) != 0u;
    let m_ca = gut && (maske & 4u) != 0u;
    // Versatz in baryzentrischen Einheiten: a_a für BC (gegenüber A), a_b für CA, a_c für AB
    let a_a = select(0.0, min(px / max(h_bc, 0.000001), 2.0 * px / max(max(l_ab, l_ca), 0.000001)), m_bc);
    let a_b = select(0.0, min(px / max(h_ca, 0.000001), 2.0 * px / max(max(l_ab, l_bc), 0.000001)), m_ca);
    let a_c = select(0.0, min(px / max(h_ab, 0.000001), 2.0 * px / max(max(l_bc, l_ca), 0.000001)), m_ab);
    var r: DreieckEcke;
    r.feld = pa + a_b * (pa - pb) + a_c * (pa - pc);
    r.bary = vec2<f32>(-a_b, -a_c);
    if (i == 1u) {
        r.feld = pb + a_a * (pb - pa) + a_c * (pb - pc);
        r.bary = vec2<f32>(1.0 + a_a + a_c, -a_c);
    } else if (i == 2u) {
        r.feld = pc + a_a * (pc - pa) + a_b * (pc - pb);
        r.bary = vec2<f32>(-a_b, 1.0 + a_a + a_b);
    }
    if (!gut) {
        r.feld = pa;
    }
    r.hoehen = vec4<f32>(select(0.0, h_bc, m_bc), select(0.0, h_ca, m_ca), select(0.0, h_ab, m_ab), 0.0);
    return r;
}

// Abstand (Spielfeld-Pixel, außen positiv) zur nächstliegenden Außenkante eines Dreiecks; ohne Außenkante weit innen.
fn abstand_dreieck(bary: vec2<f32>, hoehen: vec4<f32>) -> f32 {
    let l_a = 1.0 - bary.x - bary.y;
    var d = -1000000.0;
    d = select(d, max(d, -l_a * hoehen.x), hoehen.x > 0.0);
    d = select(d, max(d, -bary.x * hoehen.y), hoehen.y > 0.0);
    d = select(d, max(d, -bary.y * hoehen.z), hoehen.z > 0.0);
    return d;
}

fn abstand_rechteck(q: vec2<f32>, h: vec2<f32>, r: f32) -> f32 {
    let d = abs(q) - h + vec2<f32>(r);
    return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0) - r;
}

@fragment
fn fs_flach(a: AusFlach) -> @location(0) vec4<f32> {
    let art = a.art & 255u;
    let seite = i32(a.art >> 8u);
    // Abstand zur Form (Spielfeld… lokale Einheiten); Ableitungen nur hier oben (gleichförmiger Kontrollfluss)
    let rund = clamp(a.p.x, 0.0, min(a.h.x, a.h.y));
    let d_rechteck = abstand_rechteck(a.lokal, a.h, rund);
    let d_kreis = length(a.lokal) - a.h.x;
    var d = select(d_kreis, d_rechteck, art == 1u);
    d = select(d, abstand_dreieck(a.lokal, a.uvbox), art == 5u);
    let umriss = a.p.y;
    d = select(d, abs(d + umriss * 0.5) - umriss * 0.5, umriss > 0.0);
    let breite = max(fwidth(d), 0.00001);
    let deck_form = clamp(0.5 - d / breite, 0.0, 1.0);

    // Glyphe: SDF bilinear, Kante 0.5; Glättung aus der Ableitung (scharf in jeder Größe)
    let groesse = vec2<f32>(max(ansicht.a.z, 1.0), max(ansicht.a.w, 1.0));
    let sdf = textureSampleLevel(schrift, linear, a.uv / groesse, 0.0).r;
    let sw = max(fwidth(sdf), 0.0001);
    let deck_glyphe = clamp((sdf - 0.5) / sw + 0.5, 0.0, 1.0);
    // eigene Textur: Stufe aus den Ableitungen (hier oben, gleichförmiger Kontrollfluss)
    let lambda = eigen_lambda(a.uv);

    // Bild: nächster Nachbar, auf das Rechteck geklemmt
    // (Dreiecke tragen in `uvbox` Kantenhöhen statt Atlas-Pixeln → dort Texel 0, das Ergebnis bleibt ungenutzt;
    // Texturbilder lesen den Atlas nicht – Seite 0 statt der Kennung)
    let ub = select(a.uvbox, vec4<f32>(0.0), art == 5u);
    let texel = clamp(floor(a.uv), ub.xy, max(ub.zw - vec2<f32>(1.0), ub.xy));
    let bild = textureLoad(atlas, vec2<i32>(texel), select(seite, 0, art == 6u), 0);

    var f = a.farbe;
    if (art == 3u) {
        f = f * bild;
    } else if (art == 6u) {
        let k = u32(seite) >> 21u;
        if (k > 4u) {
            discard;
        }
        f = f * eigen_abtasten(k, seite & 0x1FFFFF, a.uv, a.uvbox, lambda);
    } else if (art == 4u) {
        f.a = f.a * deck_glyphe;
    } else {
        f.a = f.a * deck_form;
    }
    if (f.a <= 0.0) {
        discard;
    }
    return f;
}
