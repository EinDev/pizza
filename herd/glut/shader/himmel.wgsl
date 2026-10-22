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
