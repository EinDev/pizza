//! Farben (SPEC §18.5): Palettennamen oder `#rgb`/`#rrggbb`/`#rrggbbaa`. Im Kern als RGBA8 (sRGB), gepackt
//! `0xRRGGBBAA` (R im höchsten Byte).

/// Palette in fester Reihenfolge (auch Reihenfolge der Bildchen-Zeichen).
pub const PALETTE: [(&str, u32); 17] = [
    ("weiss", 0xFFFFFFFF),
    ("schwarz", 0x000000FF),
    ("grau", 0x8A8580FF),
    ("ofen", 0x2F2A26FF),
    ("tomate", 0xD9452BFF),
    ("salami", 0xA83232FF),
    ("schinken", 0xF2A0A0FF),
    ("basilikum", 0x3E8E41FF),
    ("oliven", 0x6B7A2AFF),
    ("mozzarella", 0xFFF6E0FF),
    ("teig", 0xE8C48AFF),
    ("kruste", 0xC8955AFF),
    ("ananas", 0xF5C518FF),
    ("senf", 0xF2B33DFF),
    ("himmel", 0x8EC9F0FF),
    ("wasser", 0x2E6FD9FF),
    ("aubergine", 0x5B2A6EFF),
];

/// Standard-Zeichen der Bildchen: `w s g o t r p b l m e k a y h u v` = Palette in obiger Reihenfolge.
pub const BILDCHEN_ZEICHEN: [char; 17] = ['w', 's', 'g', 'o', 't', 'r', 'p', 'b', 'l', 'm', 'e', 'k', 'a', 'y', 'h', 'u', 'v'];

pub const WEISS: u32 = 0xFFFFFFFF;
pub const OFEN: u32 = 0x2F2A26FF;
pub const MOZZARELLA: u32 = 0xFFF6E0FF;

fn hex(c: u8) -> Option<u32> {
    match c {
        b'0'..=b'9' => Some((c - b'0') as u32),
        b'a'..=b'f' => Some((c - b'a' + 10) as u32),
        b'A'..=b'F' => Some((c - b'A' + 10) as u32),
        _ => None,
    }
}

/// Text → RGBA8 gepackt; `None` = unbekannt.
pub fn lies(t: &str) -> Option<u32> {
    for (n, w) in PALETTE {
        if n == t {
            return Some(w);
        }
    }
    let b = t.as_bytes();
    if b.first() != Some(&b'#') {
        return None;
    }
    let h = &b[1..];
    let mut v = [0u32; 8];
    for (i, c) in h.iter().enumerate() {
        if i >= 8 {
            return None;
        }
        v[i] = hex(*c)?;
    }
    match h.len() {
        3 => Some((v[0] * 17) << 24 | (v[1] * 17) << 16 | (v[2] * 17) << 8 | 0xFF),
        6 => Some((v[0] << 4 | v[1]) << 24 | (v[2] << 4 | v[3]) << 16 | (v[4] << 4 | v[5]) << 8 | 0xFF),
        8 => Some((v[0] << 4 | v[1]) << 24 | (v[2] << 4 | v[3]) << 16 | (v[4] << 4 | v[5]) << 8 | (v[6] << 4 | v[7])),
        _ => None,
    }
}

/// Kanonische Textform `#rrggbbaa` (Kleinbuchstaben).
pub fn text(rgba: u32) -> alloc::string::String {
    alloc::format!("#{:08x}", rgba)
}

/// RGBA8 gepackt → Bytes [r, g, b, a].
pub fn bytes(rgba: u32) -> [u8; 4] {
    rgba.to_be_bytes()
}

/// sRGB-Byte → linearer Wert (f64, deterministisch über libm).
pub fn linear(b: u8) -> f64 {
    let c = b as f64 / 255.0;
    if c <= 0.04045 {
        c / 12.92
    } else {
        libm::pow((c + 0.055) / 1.055, 2.4)
    }
}

/// RGB linear (f64).
pub fn rgb_linear(rgba: u32) -> [f64; 3] {
    let b = bytes(rgba);
    [linear(b[0]), linear(b[1]), linear(b[2])]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn farben_lesen() {
        assert_eq!(lies("tomate"), Some(0xD9452BFF));
        assert_eq!(lies("#fff"), Some(0xFFFFFFFF));
        assert_eq!(lies("#12AbCd"), Some(0x12ABCDFF));
        assert_eq!(lies("#12abcd80"), Some(0x12ABCD80));
        assert_eq!(lies("lila"), None);
        assert_eq!(lies("#12345"), None);
        assert_eq!(lies("#ggg"), None);
        assert_eq!(text(0x12ABCD80), "#12abcd80");
    }
}
