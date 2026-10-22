//! Zeichenliste: das Ergebnis eines Bildes (Format in `herd/README.md`, Abschnitt „Zeichenliste“).
//! Alles Little Endian, feldweise geschrieben (keine Struct-Casts, kein Padding mit Zufallsinhalt).

use alloc::vec::Vec;

/// „HZL1“
pub const MAGIE: u32 = u32::from_le_bytes(*b"HZL1");
pub const VERSION: u32 = 1;
pub const KOPF_BYTES: usize = 128;

/// Größe des Uniform-Blocks `Szene` (Bytes).
pub const SZENE_BYTES: usize = 560;
/// Bytes je 2D-Ecke: x, y (NDC), u, v, RGBA8 (sRGB), art (f32).
pub const ECKE2D_BYTES: usize = 24;
/// Bytes je 3D-Ecke eines Netzes: Position, Normale, UV.
pub const ECKE3D_BYTES: usize = 32;
/// Bytes je Instanz: Modell (mat4), Normalenmatrix (3 × vec4), Farbe (vec4), Material (vec4).
pub const INSTANZ_BYTES: usize = 144;
/// Bytes je Zeichenzug.
pub const ZUG_BYTES: usize = 32;
pub const NETZ_BYTES: usize = 16;
pub const TEXTUR_BYTES: usize = 24;

/// Durchgänge in Zeichenreihenfolge.
pub mod durchgang {
    pub const SCHATTEN: u32 = 0;
    pub const HIMMEL: u32 = 1;
    pub const UNDURCHSICHTIG: u32 = 2;
    pub const DURCHSICHTIG: u32 = 3;
    pub const FLACH: u32 = 4;
}

/// Kopf-Flags.
pub mod flag {
    pub const DREI_D: u32 = 1;
    pub const SCHATTEN: u32 = 2;
}

/// Texturformate und Filter.
pub mod textur {
    pub const RGBA8: u32 = 0;
    pub const R8: u32 = 1;
    pub const NAECHSTER: u32 = 0;
    pub const LINEAR: u32 = 1;
    /// Weiße 1×1-Textur (Platzhalter für „kein Bildchen“).
    pub const WEISS: u32 = 0;
    /// Schriftatlas (R8, linear).
    pub const SCHRIFT: u32 = 0xFFFF_FFFF;
}

/// Abschnitte (Index in der Abschnittstabelle des Kopfs).
pub mod abschnitt {
    pub const SZENE: usize = 0;
    pub const ECKEN2D: usize = 1;
    pub const INDIZES2D: usize = 2;
    pub const INSTANZEN: usize = 3;
    pub const ZUEGE: usize = 4;
    pub const NETZE: usize = 5;
    pub const TEXTUREN: usize = 6;
    pub const ANZAHL: usize = 8;
}

/// Schreibhilfe für Byte-Puffer.
pub trait Schreibe {
    fn u32(&mut self, v: u32);
    fn f32(&mut self, v: f32);
    fn u8x4(&mut self, v: [u8; 4]);
    fn f32s(&mut self, v: &[f32]) {
        for x in v {
            self.f32(*x);
        }
    }
}

impl Schreibe for Vec<u8> {
    #[inline]
    fn u32(&mut self, v: u32) {
        self.extend_from_slice(&v.to_le_bytes());
    }
    #[inline]
    fn f32(&mut self, v: f32) {
        // Zahlen, die nicht endlich sind, und −0 werden 0 (bitgleich nativ = Wasm).
        let v = crate::mathe::fin(v);
        self.extend_from_slice(&v.to_le_bytes());
    }
    #[inline]
    fn u8x4(&mut self, v: [u8; 4]) {
        self.extend_from_slice(&v);
    }
}

/// Ein Zeichenzug.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub struct Zug {
    pub durchgang: u32,
    /// Netz-ID (3D) bzw. 0 (Himmel, 2D).
    pub netz: u32,
    /// Textur-ID (0 = weiß).
    pub textur: u32,
    pub erster_index: u32,
    pub index_anzahl: u32,
    pub erste_instanz: u32,
    pub instanz_anzahl: u32,
    /// 0 beide Seiten, 1 nur Rückseiten, 2 nur Vorderseiten.
    pub seiten: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NetzEintrag {
    pub id: u32,
    pub version: u32,
    pub ecken: u32,
    pub indizes: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TexturEintrag {
    pub id: u32,
    pub version: u32,
    pub breite: u32,
    pub hoehe: u32,
    pub format: u32,
    pub filter: u32,
}

/// Lesesicht auf eine fertige Zeichenliste (für die GPU-Schicht und Tests).
#[derive(Clone, Copy)]
pub struct Ansicht<'a> {
    pub b: &'a [u8],
}

fn lu32(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}
fn lf32(b: &[u8], i: usize) -> f32 {
    f32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

impl<'a> Ansicht<'a> {
    /// Prüft Magie, Version und Abschnittsgrenzen.
    pub fn neu(b: &'a [u8]) -> Option<Self> {
        if b.len() < KOPF_BYTES || lu32(b, 0) != MAGIE || lu32(b, 4) != VERSION {
            return None;
        }
        for a in 0..abschnitt::ANZAHL {
            let (o, l) = (lu32(b, 64 + a * 8) as usize, lu32(b, 68 + a * 8) as usize);
            if o.checked_add(l).map(|e| e > b.len()).unwrap_or(true) {
                return None;
            }
        }
        Some(Ansicht { b })
    }
    pub fn u32_bei(&self, i: usize) -> u32 {
        lu32(self.b, i)
    }
    pub fn bildnummer(&self) -> u32 {
        lu32(self.b, 8)
    }
    pub fn ziel(&self) -> (u32, u32) {
        (lu32(self.b, 12), lu32(self.b, 16))
    }
    /// Spielfeld-Rechteck in Gerätepixeln (x, y, b, h), Ursprung oben links.
    pub fn ansichtsfenster(&self) -> [u32; 4] {
        [lu32(self.b, 20), lu32(self.b, 24), lu32(self.b, 28), lu32(self.b, 32)]
    }
    /// Löschfarbe (sRGB 0 … 1).
    pub fn klar(&self) -> [f32; 4] {
        [lf32(self.b, 36), lf32(self.b, 40), lf32(self.b, 44), lf32(self.b, 48)]
    }
    pub fn flags(&self) -> u32 {
        lu32(self.b, 52)
    }
    pub fn schatten_groesse(&self) -> u32 {
        lu32(self.b, 56)
    }
    pub fn abschnitt(&self, a: usize) -> &'a [u8] {
        let (o, l) = (lu32(self.b, 64 + a * 8) as usize, lu32(self.b, 68 + a * 8) as usize);
        &self.b[o..o + l]
    }
    pub fn zuege(&self) -> impl Iterator<Item = Zug> + 'a {
        let z = self.abschnitt(abschnitt::ZUEGE);
        (0..z.len() / ZUG_BYTES).map(move |k| {
            let i = k * ZUG_BYTES;
            Zug {
                durchgang: lu32(z, i),
                netz: lu32(z, i + 4),
                textur: lu32(z, i + 8),
                erster_index: lu32(z, i + 12),
                index_anzahl: lu32(z, i + 16),
                erste_instanz: lu32(z, i + 20),
                instanz_anzahl: lu32(z, i + 24),
                seiten: lu32(z, i + 28),
            }
        })
    }
    pub fn netze(&self) -> impl Iterator<Item = NetzEintrag> + 'a {
        let z = self.abschnitt(abschnitt::NETZE);
        (0..z.len() / NETZ_BYTES).map(move |k| {
            let i = k * NETZ_BYTES;
            NetzEintrag { id: lu32(z, i), version: lu32(z, i + 4), ecken: lu32(z, i + 8), indizes: lu32(z, i + 12) }
        })
    }
    pub fn texturen(&self) -> impl Iterator<Item = TexturEintrag> + 'a {
        let z = self.abschnitt(abschnitt::TEXTUREN);
        (0..z.len() / TEXTUR_BYTES).map(move |k| {
            let i = k * TEXTUR_BYTES;
            TexturEintrag {
                id: lu32(z, i),
                version: lu32(z, i + 4),
                breite: lu32(z, i + 8),
                hoehe: lu32(z, i + 12),
                format: lu32(z, i + 16),
                filter: lu32(z, i + 20),
            }
        })
    }
}

/// FNV-1a 64 Bit.
#[derive(Clone, Copy)]
pub struct Fnv(pub u64);

impl Fnv {
    pub const fn neu() -> Self {
        Fnv(0xcbf2_9ce4_8422_2325)
    }
    pub fn dazu(&mut self, b: &[u8]) {
        let mut h = self.0;
        for x in b {
            h ^= *x as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
        self.0 = h;
    }
}

pub fn fnv(b: &[u8]) -> u64 {
    let mut f = Fnv::neu();
    f.dazu(b);
    f.0
}
