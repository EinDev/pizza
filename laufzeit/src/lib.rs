//! pizzaiolo-Laufzeit: Werte, Texte, Standardbibliothek, Objektmodell, Pizza-Funktionen.
//! Wird vom Compiler mit dem Programmcode zu EINEM Wasm-Modul gelinkt (HOST-ABI.md).
#![no_std]
#![allow(static_mut_refs, clippy::missing_safety_doc, dead_code)]
extern crate alloc;

pub mod zahl;
pub mod namen;
pub mod wert;
pub mod text;
pub mod ops;
pub mod klassen;
pub mod std_m;
pub mod pf;
pub mod sort;
pub mod start;
pub mod programm;

use core::panic::PanicInfo;
use wert::*;

#[panic_handler]
fn panik_handler(_: &PanicInfo) -> ! { core::arch::wasm32::unreachable() }

// ---------------------------------------------------------------- Host-Imports
#[link(wasm_import_module = "pizza")]
extern "C" {
    fn ausgabe(p: *const u8, n: usize);
    fn fehlerausgabe(p: *const u8, n: usize);
    fn warnung(cp: *const u8, cn: usize, tp: *const u8, tn: usize, z: i32, s: i32);
    fn fehler(art: i32, cp: *const u8, cn: usize, tp: *const u8, tn: usize, z: i32, s: i32);
    fn panik(p: *const u8, n: usize);
    fn schreibe(p: *const u8, n: usize);
    fn leeren();
    fn eingabe(art: i32, pp: *const u8, pn: i32, bp: *mut u8, kap: i32) -> i32;
}

pub fn host_ausgabe(b: &[u8]) { unsafe { ausgabe(b.as_ptr(), b.len()) } }
pub fn host_fehlerausgabe(b: &[u8]) { unsafe { fehlerausgabe(b.as_ptr(), b.len()) } }
pub fn host_schreibe(b: &[u8]) { unsafe { schreibe(b.as_ptr(), b.len()) } }
pub fn host_leeren() { unsafe { leeren() } }
pub fn host_warnung(code: &[u8], t: &[u8], z: i32, s: i32) { unsafe { warnung(code.as_ptr(), code.len(), t.as_ptr(), t.len(), z, s) } }
pub fn host_fehler(art: i32, code: &[u8], t: &[u8], z: i32, s: i32) { unsafe { fehler(art, code.as_ptr(), code.len(), t.as_ptr(), t.len(), z, s) } }
pub fn host_panik(t: &[u8]) { unsafe { panik(t.as_ptr(), t.len()) } }
pub fn host_eingabe(art: i32, prompt: Option<&[u8]>, puf: &mut [u8]) -> i32 {
    unsafe {
        match prompt {
            Some(p) => eingabe(art, p.as_ptr(), p.len() as i32, puf.as_mut_ptr(), puf.len() as i32),
            None => eingabe(art, core::ptr::null(), -1, puf.as_mut_ptr(), puf.len() as i32),
        }
    }
}

// ---------------------------------------------------------------- Zustand (vom Programmcode direkt adressiert)
#[repr(C)]
pub struct Zustand {
    pub schritte: f64,  // 0
    pub grenze: f64,    // 8
    pub offset: f64,    // 16
    pub rueck: u64,     // 24
    pub sig: i32,       // 32  0 keins, 1 Ananas, 2 Budget, 3 PizzaFehler, 4 Limit, 5 Panik
    pub pos: i32,       // 36  aktuelle Position (Index in Positionstabelle)
    pub tiefe: i32,     // 40
    pub argtop: u32,    // 44  Argumentstapel-Spitze
    pub limit: f64,     // 48
}

#[no_mangle]
pub static mut ZUSTAND: Zustand = Zustand { schritte: 0.0, grenze: 5e6, offset: 0.0, rueck: KARTON, sig: 0, pos: 0, tiefe: 0, argtop: 0, limit: 5e6 };

#[inline(always)]
pub fn z() -> &'static mut Zustand { unsafe { &mut ZUSTAND } }
#[inline(always)]
pub fn sig() -> bool { unsafe { ZUSTAND.sig != 0 } }

// ---------------------------------------------------------------- Speicher (Bump-Allocator mit Obergrenze)
extern "C" { static __heap_base: u8; }

/// Vom Linker per Datensegment gesetzt: Beginn des Heaps (nach den Programmdaten).
#[no_mangle]
pub static mut HEAP_START: u32 = 0;
static mut HEAP_TOP: u32 = 0;
static mut HEAP_ENDE: u32 = 0;
static mut SPEICHER_LIMIT: u32 = 1024 << 20;
static mut VOLL_MELDEN: bool = false;
const RESERVE: u32 = 64 << 20;

fn heap_init() {
    unsafe {
        if HEAP_TOP == 0 {
            let basis = core::ptr::addr_of!(__heap_base) as u32;
            let s = if HEAP_START > basis { HEAP_START } else { basis };
            HEAP_START = (s + 15) & !15;
            HEAP_TOP = HEAP_START;
            HEAP_ENDE = (core::arch::wasm32::memory_size(0) as u32) << 16;
        }
    }
}

pub fn alloc_roh(groesse: u32, ausr: u32) -> *mut u8 {
    unsafe {
        heap_init();
        let a = if ausr < 8 { 8 } else { ausr };
        let p = (HEAP_TOP + a - 1) & !(a - 1);
        let neu = p.checked_add(groesse).unwrap_or(u32::MAX);
        let benutzt = neu - HEAP_START;
        if benutzt > SPEICHER_LIMIT.saturating_add(RESERVE) { core::arch::wasm32::unreachable(); }
        if benutzt > SPEICHER_LIMIT { VOLL_MELDEN = true; }
        if neu > HEAP_ENDE {
            let fehlt = neu - HEAP_ENDE;
            let seiten = (fehlt + 0xFFFF) >> 16;
            let seiten = if seiten < 16 { 16 } else { seiten };
            if core::arch::wasm32::memory_grow(0, seiten as usize) == usize::MAX { core::arch::wasm32::unreachable(); }
            HEAP_ENDE += seiten << 16;
        }
        HEAP_TOP = neu;
        p as *mut u8
    }
}

/// Prüft, ob das Speicherlimit überschritten wurde, und wirft dann die Kühlschrank-Ananas.
pub fn speicher_pruefen() {
    unsafe {
        if VOLL_MELDEN && ZUSTAND.sig == 0 {
            VOLL_MELDEN = false;
            ops::wirf_ananas(namen::K_LAUFZEIT, "Der Kühlschrank ist voll (Speicherlimit erreicht).");
        }
    }
}

struct Bump;
unsafe impl core::alloc::GlobalAlloc for Bump {
    unsafe fn alloc(&self, l: core::alloc::Layout) -> *mut u8 { alloc_roh(l.size() as u32, l.align() as u32) }
    unsafe fn dealloc(&self, _p: *mut u8, _l: core::alloc::Layout) {}
    unsafe fn realloc(&self, p: *mut u8, l: core::alloc::Layout, neu: usize) -> *mut u8 {
        let q = alloc_roh(neu as u32, l.align() as u32);
        core::ptr::copy_nonoverlapping(p, q, if neu < l.size() { neu } else { l.size() });
        q
    }
}
#[global_allocator]
static ALLOC: Bump = Bump;

// ---------------------------------------------------------------- Argumentstapel
pub const ARGSTAPEL_GROESSE: u32 = 1 << 20;
static mut ARGSTAPEL: u32 = 0;
static mut ARGSTAPEL_ENDE: u32 = 0;

pub fn argstapel_init() {
    unsafe {
        if ARGSTAPEL == 0 {
            ARGSTAPEL = alloc_roh(ARGSTAPEL_GROESSE, 16) as u32;
            ARGSTAPEL_ENDE = ARGSTAPEL + ARGSTAPEL_GROESSE;
            ZUSTAND.argtop = ARGSTAPEL;
        }
    }
}

/// Reserviert n Werte auf dem Argumentstapel (vom Programmcode für Aufrufe genutzt).
#[no_mangle]
pub extern "C" fn rt_args(n: u32) -> u32 {
    unsafe {
        let p = ZUSTAND.argtop;
        let neu = p + n * 8;
        if neu > ARGSTAPEL_ENDE { core::arch::wasm32::unreachable(); }
        ZUSTAND.argtop = neu;
        p
    }
}

pub fn args_von(p: u32, n: u32) -> &'static [W] {
    unsafe { core::slice::from_raw_parts(p as *const W, n as usize) }
}

/// Legt Werte auf den Argumentstapel (für Rückrufe aus der Laufzeit).
pub fn args_push(w: &[W]) -> u32 {
    let p = rt_args(w.len() as u32);
    unsafe { core::ptr::copy_nonoverlapping(w.as_ptr(), p as *mut W, w.len()); }
    p
}
pub fn args_pop(p: u32) { unsafe { ZUSTAND.argtop = p; } }

// ---------------------------------------------------------------- ABI-Exports
#[no_mangle]
pub extern "C" fn abi_version() -> i32 { 1 }

#[no_mangle]
pub extern "C" fn limit_setzen(n: f64) {
    let l = if n > 0.0 { n } else { 5e6 };
    z().limit = l;
    z().grenze = l;
}

#[no_mangle]
pub extern "C" fn speicher_limit_setzen(mib: i32) {
    unsafe { if mib > 0 && mib <= 3072 { SPEICHER_LIMIT = (mib as u32) << 20; } }
}

static mut ARG_PUF: u32 = 0;
pub static mut ARGS: alloc::vec::Vec<W> = alloc::vec::Vec::new();

#[no_mangle]
pub extern "C" fn arg_puffer(len: i32) -> i32 {
    let p = alloc_roh(if len > 0 { len as u32 } else { 0 }, 8) as u32;
    unsafe { ARG_PUF = p; }
    p as i32
}

#[no_mangle]
pub extern "C" fn arg_fertig(len: i32) {
    unsafe {
        let b = core::slice::from_raw_parts(ARG_PUF as *const u8, if len > 0 { len as usize } else { 0 });
        let t = text::neu_text(b);
        ARGS.push(t);
    }
}

#[no_mangle]
pub extern "C" fn schritte() -> f64 { z().schritte }

#[no_mangle]
pub extern "C" fn zeitMs() -> f64 { z().schritte + z().offset }

/// Adressen für den Linker/Compiler (zur Build-Zeit ausgelesen).
#[no_mangle]
pub extern "C" fn rt_info(i: i32) -> i32 {
    unsafe {
        match i {
            0 => core::ptr::addr_of!(ZUSTAND) as i32,
            1 => core::ptr::addr_of!(HEAP_START) as i32,
            2 => core::ptr::addr_of!(__heap_base) as i32,
            3 => core::ptr::addr_of!(start::POS_TABELLE) as i32,
            _ => 0,
        }
    }
}

pub fn start_init() { text::namen_init(); klassen::eingebaute_klassen(); pf::belaege_init(); argstapel_init(); }
