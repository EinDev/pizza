//! Mipmaps v1 (PROJEKTE.md §5.3): jede Stufe halbiert Breite und Höhe (abgerundet, mindestens 1). Jedes Zielpixel aus dem
//! 2 × 2-Block der Vorstufe ab `(2x, 2y)`; fehlt eine Spalte/Zeile (Vorstufe 1 breit bzw. hoch), wird die letzte wiederholt.
//! **Alpha-gewichtet, nur Ganzzahlen:** `a = (Σa + 2) >> 2`, je Farbkanal `c = Σa > 0 ? (Σ c·a + Σa/2) / Σa : 0`.
//! Gerechnet in den gespeicherten (sRGB-kodierten) Werten, ohne Linearisierung.

/// Halbiert `quelle` (`b × h` RGBA8) nach `ziel` (`max(b/2,1) × max(h/2,1)` RGBA8).
pub fn halbiere(quelle: &[u8], b: u32, h: u32, ziel: &mut [u8]) {
    let (b, h) = (b as usize, h as usize);
    let nb = if b > 1 { b / 2 } else { 1 };
    let nh = if h > 1 { h / 2 } else { 1 };
    debug_assert_eq!(quelle.len(), b * h * 4);
    debug_assert_eq!(ziel.len(), nb * nh * 4);
    for y in 0..nh {
        let y0 = 2 * y;
        let y1 = if y0 + 1 < h { y0 + 1 } else { h - 1 };
        for x in 0..nb {
            let x0 = 2 * x;
            let x1 = if x0 + 1 < b { x0 + 1 } else { b - 1 };
            let p = [(y0 * b + x0) * 4, (y0 * b + x1) * 4, (y1 * b + x0) * 4, (y1 * b + x1) * 4];
            let mut sa = 0u32;
            let mut sc = [0u32; 3];
            for &i in &p {
                let a = quelle[i + 3] as u32;
                sa += a;
                for k in 0..3 {
                    sc[k] += quelle[i + k] as u32 * a;
                }
            }
            let o = (y * nb + x) * 4;
            for k in 0..3 {
                ziel[o + k] = if sa > 0 { ((sc[k] + sa / 2) / sa) as u8 } else { 0 };
            }
            ziel[o + 3] = ((sa + 2) >> 2) as u8;
        }
    }
}
