//! Texte (UTF-8) und interne Namen.

use crate::namen::NAMEN;
use crate::wert::*;
use alloc::vec::Vec;

pub fn neu_text(b: &[u8]) -> W {
    let q = crate::alloc_roh(16 + b.len() as u32, 8);
    unsafe {
        let t = q as *mut Text;
        (*t).art = A_TEXT;
        (*t).len = b.len() as u32;
        (*t).info = 0;
        (*t).daten = q as u32 + 16;
        core::ptr::copy_nonoverlapping(b.as_ptr(), q.add(16), b.len());
    }
    ptr_w(q as u32)
}
pub fn neu_str(s: &str) -> W { neu_text(s.as_bytes()) }

// ---------------------------------------------------------------- Verkettung mit Anhänge-Arena
// Ergebnisse von a + b liegen in einer Arena; endet a genau an deren Spitze, wird b nur angehängt
// (Texte bleiben unveränderlich: a behält seine Länge, das Ergebnis teilt sich das Präfix).
static mut ARENA_TOP: u32 = 0;
static mut ARENA_ENDE: u32 = 0;

pub fn verkette(a: &[u8], b: &[u8], a_w: W) -> W {
    unsafe {
        let n = a.len() + b.len();
        let a_ende = if art(a_w) == A_TEXT { (*(p(a_w) as *const Text)).daten + (*(p(a_w) as *const Text)).len } else { 0 };
        let start;
        if a_ende != 0 && a_ende == ARENA_TOP && ARENA_TOP as usize + b.len() <= ARENA_ENDE as usize {
            core::ptr::copy_nonoverlapping(b.as_ptr(), ARENA_TOP as *mut u8, b.len());
            start = a_ende - a.len() as u32;
            ARENA_TOP += b.len() as u32;
        } else {
            if ARENA_TOP as usize + n > ARENA_ENDE as usize {
                // Riesentexte (z. B. `t += t` in einer Schleife): erst ohne Anhänge-Reserve versuchen, sonst
                // fangbare Kühlschrank-Ananas statt Trap in alloc_roh (Fuzz-Fund gueltig-s42-266).
                let mut groesse = core::cmp::max(1u64 << 16, 2 * n as u64);
                if groesse > u32::MAX as u64 || !crate::speicher_passt(groesse as u32 + 16) { groesse = n as u64; }
                if groesse > u32::MAX as u64 || !crate::speicher_passt(groesse as u32 + 16) {
                    crate::ops::wirf_ananas(crate::namen::K_LAUFZEIT, "Der Kühlschrank ist voll (Speicherlimit erreicht).");
                    return KARTON;
                }
                let groesse = groesse as u32;
                ARENA_TOP = crate::alloc_roh(groesse, 8) as u32;
                ARENA_ENDE = ARENA_TOP + groesse;
            }
            start = ARENA_TOP;
            core::ptr::copy_nonoverlapping(a.as_ptr(), start as *mut u8, a.len());
            core::ptr::copy_nonoverlapping(b.as_ptr(), (start as usize + a.len()) as *mut u8, b.len());
            ARENA_TOP += n as u32;
        }
        let q = crate::alloc_roh(16, 8);
        let t = q as *mut Text;
        (*t).art = A_TEXT; (*t).len = n as u32; (*t).info = 0; (*t).daten = start;
        ptr_w(q as u32)
    }
}

#[inline]
pub fn bytes(w: W) -> &'static [u8] {
    unsafe {
        let t = p(w) as *const Text;
        core::slice::from_raw_parts((*t).daten as *const u8, (*t).len as usize)
    }
}
pub fn s(w: W) -> &'static str { unsafe { core::str::from_utf8_unchecked(bytes(w)) } }
pub fn ist_text(w: W) -> bool { art(w) == A_TEXT }

// ---------------------------------------------------------------- Namen
/// Name-ID → Text-Zeiger (Wert)
pub static mut NAMENS_TEXT: Vec<W> = Vec::new();

pub fn namen_init() {
    unsafe {
        if NAMENS_TEXT.is_empty() {
            for n in NAMEN.iter() { NAMENS_TEXT.push(neu_str(n)); }
            for i in 1..NAMENS_TEXT.len() { (*(p(NAMENS_TEXT[i]) as *mut Text)).info = i as u32; }
        }
    }
}

/// Liefert die Namens-ID eines (Programm-)Textes; vergibt bei Bedarf eine neue.
pub fn name_id(w: W) -> u32 {
    unsafe {
        let t = p(w) as *mut Text;
        if (*t).info != 0 { return (*t).info; }
        namen_init();
        let b = bytes(w);
        for i in 1..NAMENS_TEXT.len() {
            if bytes(NAMENS_TEXT[i]) == b { (*t).info = i as u32; return i as u32; }
        }
        NAMENS_TEXT.push(w);
        let id = (NAMENS_TEXT.len() - 1) as u32;
        (*t).info = id;
        id
    }
}
pub fn name_text(id: u32) -> W { unsafe { NAMENS_TEXT[id as usize] } }
pub fn name_s(id: u32) -> &'static str { s(name_text(id)) }

// ---------------------------------------------------------------- Bauen
pub struct Tb(pub Vec<u8>);
impl Tb {
    pub fn neu() -> Tb { Tb(Vec::new()) }
    pub fn s(&mut self, x: &str) -> &mut Tb { self.0.extend_from_slice(x.as_bytes()); self }
    pub fn b(&mut self, x: &[u8]) -> &mut Tb { self.0.extend_from_slice(x); self }
    pub fn t(&mut self, w: W) -> &mut Tb { self.0.extend_from_slice(bytes(w)); self }
    pub fn n(&mut self, x: f64) -> &mut Tb { crate::zahl::js_text(x, &mut self.0); self }
    pub fn name(&mut self, id: u32) -> &mut Tb { self.0.extend_from_slice(bytes(name_text(id))); self }
    pub fn fertig(&self) -> W { neu_text(&self.0) }
}

pub fn zeichen_anzahl(b: &[u8]) -> usize { b.iter().filter(|&&c| (c & 0xC0) != 0x80).count() }

/// JS-Stringvergleich (UTF-16-Codeeinheiten-Reihenfolge)
pub fn vergleich(a: &str, b: &str) -> core::cmp::Ordering {
    let mut x = a.chars();
    let mut y = b.chars();
    loop {
        match (x.next(), y.next()) {
            (None, None) => return core::cmp::Ordering::Equal,
            (None, Some(_)) => return core::cmp::Ordering::Less,
            (Some(_), None) => return core::cmp::Ordering::Greater,
            (Some(c), Some(d)) => {
                if c != d {
                    let mut ca = [0u16; 2];
                    let mut da = [0u16; 2];
                    let e1 = c.encode_utf16(&mut ca);
                    let e2 = d.encode_utf16(&mut da);
                    return (&*e1).cmp(&*e2);
                }
            }
        }
    }
}
