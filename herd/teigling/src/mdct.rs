//! Inverse MDCT für Vorbis (H-K19b): `y[n] = Σ_k X[k] · cos(2π/N · (n + 1/2 + N/4) · (k + 1/2))`, ohne Skalierung (wie
//! libvorbis/stb_vorbis). Weg: DCT-IV der Länge N/2 über eine komplexe Radix-2-FFT der Länge N/4 (Vor- und Nachdrehung),
//! danach die Symmetrien der DCT-IV auf N Werte ausgerollt.
//!
//! **Determinismus (HERD.md §13.1 Regel 5):** gerechnet wird in f32 nur mit + − × in fester Reihenfolge (keine FMA – Rust
//! zieht nie zusammen); die Dreh- und FFT-Faktoren entstehen einmal beim Anlegen mit `libm` in f64 und werden auf f32
//! gerundet. Nativ und in `teigling.wasm` also dieselben Bits.

use alloc::vec;
use alloc::vec::Vec;

#[derive(Clone, Copy, Default)]
struct K {
    re: f32,
    im: f32,
}

#[inline]
fn mal(a: K, b: K) -> K {
    K { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

pub(crate) struct Imdct {
    n: usize,
    /// exp(−iπ(8k+1)/(4N)), k < N/4 (Vor- und Nachdrehung)
    dreh: Vec<K>,
    /// exp(−2πi·j/(N/4)), j < N/8
    w: Vec<K>,
    /// Bitumkehr der FFT-Indizes (N/4)
    umkehr: Vec<u32>,
    z: Vec<K>,
    c: Vec<f32>,
}

impl Imdct {
    /// `n` = Blockgröße (Zweierpotenz 64 … 8192).
    pub(crate) fn neu(n: usize) -> Imdct {
        debug_assert!(n.is_power_of_two() && (64..=8192).contains(&n));
        let n4 = n / 4;
        let pi = core::f64::consts::PI;
        let dreh = (0..n4)
            .map(|k| {
                let t = pi * (8 * k + 1) as f64 / (4 * n) as f64;
                K { re: libm::cos(t) as f32, im: -libm::sin(t) as f32 }
            })
            .collect();
        let w = (0..n4 / 2)
            .map(|j| {
                let t = 2.0 * pi * j as f64 / n4 as f64;
                K { re: libm::cos(t) as f32, im: -libm::sin(t) as f32 }
            })
            .collect();
        let bits = n4.trailing_zeros();
        let umkehr = (0..n4 as u32).map(|i| if bits == 0 { 0 } else { i.reverse_bits() >> (32 - bits) }).collect();
        Imdct { n, dreh, w, umkehr, z: vec![K::default(); n4], c: vec![0.0; n / 2] }
    }

    /// `x` (N/2 Spektralwerte) → `y` (N Zeitwerte).
    pub(crate) fn rueck(&mut self, x: &[f32], y: &mut [f32]) {
        let n = self.n;
        let (m, n4) = (n / 2, n / 4);
        debug_assert!(x.len() >= m && y.len() >= n);
        // Vordrehung, gleich in Bitumkehr-Reihenfolge abgelegt
        for k in 0..n4 {
            let v = K { re: x[2 * k], im: x[m - 1 - 2 * k] };
            self.z[self.umkehr[k] as usize] = mal(v, self.dreh[k]);
        }
        // FFT (Zeitdezimierung, Radix 2)
        let mut laenge = 2;
        while laenge <= n4 {
            let halb = laenge / 2;
            let schritt = n4 / laenge;
            let mut s = 0;
            while s < n4 {
                for j in 0..halb {
                    let t = mal(self.z[s + j + halb], self.w[j * schritt]);
                    let a = self.z[s + j];
                    self.z[s + j] = K { re: a.re + t.re, im: a.im + t.im };
                    self.z[s + j + halb] = K { re: a.re - t.re, im: a.im - t.im };
                }
                s += laenge;
            }
            laenge *= 2;
        }
        // Nachdrehung → DCT-IV c[0 … N/2)
        for k in 0..n4 {
            let u = mal(self.z[k], self.dreh[k]);
            self.c[2 * k] = u.re;
            self.c[m - 1 - 2 * k] = -u.im;
        }
        // ausrollen: y = c[N/4 …], −c rückwärts, −c[… N/4)
        let c = &self.c;
        for i in 0..n4 {
            y[i] = c[n4 + i];
        }
        for j in 0..m {
            y[n4 + j] = -c[m - 1 - j];
        }
        for j in 0..n4 {
            y[3 * n4 + j] = -c[j];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Gegen die Definition (f64, O(N²)).
    #[test]
    fn imdct_wie_definition() {
        for &n in &[64usize, 128, 256, 2048] {
            let x: Vec<f32> = (0..n / 2).map(|k| (((k * 7919 + 13) % 1000) as f32 - 500.0) / 250.0).collect();
            let mut y = vec![0.0f32; n];
            let mut m = Imdct::neu(n);
            m.rueck(&x, &mut y);
            let pi = core::f64::consts::PI;
            let mut max = 0.0f64;
            for (i, &yi) in y.iter().enumerate() {
                let mut s = 0.0f64;
                for (k, &xk) in x.iter().enumerate() {
                    s += xk as f64 * libm::cos(2.0 * pi / n as f64 * (i as f64 + 0.5 + n as f64 / 4.0) * (k as f64 + 0.5));
                }
                max = max.max((s - yi as f64).abs());
            }
            assert!(max < 1e-3 * (n as f64).sqrt(), "n = {}: Abweichung {}", n, max);
        }
    }
}
