// 3D-Teilchen (`Funken`, Abschnitt TEILCHEN3D, 20 Bytes je Teilchen): kamerazugewandte Vierecke, 6 Ecken aus vertex_index.
// Rechts/oben der Kamera aus den Zeilen 0/1 von ansicht_proj (Projektion symmetrisch → Zeile 0 ∥ rechts, Zeile 1 ∥ oben).
// Tiefe testen, nicht schreiben; Nebel ja, keine Schatten. leuchtend: weicher Schein mit heißem Kern, additiv gemischt,
// im Nebel ausgeblendet. deckend: runde Scheibe mit weichem Rand, „source over“ (Kern sortiert von hinten nach vorn).

struct EinFunke {
    @builtin(vertex_index) ecke: u32,
    @location(0) pos: vec3<f32>,     // Weltlage
    @location(1) r: f32,             // halbe Größe (Welt)
    @location(2) farbe: vec4<f32>,   // sRGB, nicht vormultipliziert
}

struct AusFunke {
    @builtin(position) pos: vec4<f32>,
    @location(0) lokal: vec2<f32>,                      // −1 … 1 über das Viereck
    @location(1) @interpolate(flat) farbe: vec4<f32>,   // linear rgb, a
    @location(2) @interpolate(flat) nebel: f32,         // Nebelanteil 0 … 1
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
    let welt = e.pos + (rechts * c.x + oben * c.y) * e.r;
    var a: AusFunke;
    a.pos = m * vec4<f32>(welt, 1.0);
    a.lokal = c;
    a.farbe = vec4<f32>(zu_linear(e.farbe.rgb), e.farbe.a);
    var f = 0.0;
    if (szene.nebel_farbe.w > 0.5) {
        f = clamp((length(szene.kamera.xyz - e.pos) - szene.nebel.x) * szene.nebel.z, 0.0, 1.0);
    }
    a.nebel = f;
    return a;
}

// leuchtend: Schein (1 − r²)² plus heißer, fast weißer Kern; Ausgabe vormultipliziert (Mischen One/One)
@fragment
fn fs_leuchtend(a: AusFunke) -> @location(0) vec4<f32> {
    let r2 = dot(a.lokal, a.lokal);
    let q = clamp(1.0 - r2, 0.0, 1.0);
    let schein = q * q;
    let kern = q * q * q * q * q * q * q * q;
    let heiss = mix(a.farbe.rgb, vec3<f32>(1.0, 0.96, 0.86), 0.65);
    let licht = (a.farbe.rgb * schein * 0.85 + heiss * kern) * (a.farbe.a * (1.0 - a.nebel));
    if (r2 >= 1.0) {
        discard;
    }
    return vec4<f32>(zu_srgb(licht), 0.0);
}

// deckend: Scheibe, Rand über die Bildschirmableitung geglättet (Ableitung vor jeder Verzweigung)
@fragment
fn fs_deckend(a: AusFunke) -> @location(0) vec4<f32> {
    let r = length(a.lokal);
    let breite = max(fwidth(r) * 1.5, 0.12);
    let deck = a.farbe.a * (1.0 - smoothstep(1.0 - breite, 1.0, r));
    let woelbung = 0.82 + 0.18 * sqrt(max(1.0 - r * r, 0.0));
    let farbe = mix(a.farbe.rgb * woelbung, szene.nebel_farbe.rgb, a.nebel);
    if (deck <= 0.002) {
        discard;
    }
    return vec4<f32>(zu_srgb(farbe) + vec3<f32>(rauschen(a.pos.xy) / 255.0), deck);
}
