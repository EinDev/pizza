//! FNV-1a (64 Bit) – Szenen- und Paket-Hash (SPEC §18.7). NaN wird vor dem Hashen kanonisch gemacht (Nutzlast und
//! Vorzeichen von NaN dürfen sich zwischen nativ und Wasm unterscheiden).

pub const START: u64 = 0xcbf2_9ce4_8422_2325;
pub const PRIM: u64 = 0x0000_0100_0000_01b3;

#[derive(Clone, Copy, Debug)]
pub struct Fnv(pub u64);

impl Default for Fnv {
    fn default() -> Self {
        Fnv(START)
    }
}

impl Fnv {
    #[inline]
    pub fn bytes(&mut self, b: &[u8]) {
        let mut h = self.0;
        for x in b {
            h ^= *x as u64;
            h = h.wrapping_mul(PRIM);
        }
        self.0 = h;
    }
    #[inline]
    pub fn u8(&mut self, x: u8) {
        self.bytes(&[x]);
    }
    #[inline]
    pub fn u32(&mut self, x: u32) {
        self.bytes(&x.to_le_bytes());
    }
    #[inline]
    pub fn i32(&mut self, x: i32) {
        self.bytes(&x.to_le_bytes());
    }
    /// f64 mit kanonischem NaN (0x7FF8…0) und unverändertem ±0.
    #[inline]
    pub fn f64(&mut self, x: f64) {
        let b = if x.is_nan() { 0x7FF8_0000_0000_0000u64 } else { x.to_bits() };
        self.bytes(&b.to_le_bytes());
    }
    pub fn text(&mut self, t: &str) {
        self.u32(t.len() as u32);
        self.bytes(t.as_bytes());
    }
}

/// FNV-1a 64 über Bytes.
pub fn fnv(b: &[u8]) -> u64 {
    let mut h = Fnv::default();
    h.bytes(b);
    h.0
}

/// 16 Hex-Ziffern (Kleinbuchstaben).
pub fn hex(h: u64) -> [u8; 16] {
    let mut a = [0u8; 16];
    for (i, z) in a.iter_mut().enumerate() {
        let n = ((h >> (60 - 4 * i)) & 0xF) as u8;
        *z = if n < 10 { b'0' + n } else { b'a' + n - 10 };
    }
    a
}

#[cfg(test)]
mod tests {
    #[test]
    fn bekannte_werte() {
        assert_eq!(super::fnv(b""), 0xcbf29ce484222325);
        assert_eq!(super::fnv(b"a"), 0xaf63dc4c8601ec8c);
        assert_eq!(&super::hex(0x0123456789abcdef), b"0123456789abcdef");
    }
}
