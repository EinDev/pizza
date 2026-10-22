//! Wertdarstellung (NaN-Boxing in u64) und Heap-Objekte.
//!
//! Zahl: f64-Bits (NaN kanonisch 0x7FF8…). Alles ≥ 0xFFFC_0000_0000_0000 ist markiert:
//!   KARTON 0xFFFC…0 · NEIN/JA 0xFFFD…0/1 · Zeiger 0xFFFE_0000_xxxxxxxx · Sonderwerte 0xFFFF…

use alloc::vec::Vec;

pub type W = u64;

pub const MARKE: u64 = 0xFFFC_0000_0000_0000;
pub const KARTON: W = 0xFFFC_0000_0000_0000;
pub const NEIN: W = 0xFFFD_0000_0000_0000;
pub const JA: W = 0xFFFD_0000_0000_0001;
pub const PTR: u64 = 0xFFFE_0000_0000_0000;
pub const UNDEF: W = 0xFFFF_0000_0000_0000;
pub const WEG: W = 0xFFFF_0000_0000_0001;
pub const AUTO: W = 0xFFFF_0000_0000_0002;
/// Methodenliste auf `dies` (nur intern zwischen rt_ncall_ziel und rt_rufe_ziel): MLISTE | (klasse<<16 | name)
pub const MLISTE: u64 = 0xFFFF_0001_0000_0000;
pub const NAN: W = 0x7FF8_0000_0000_0000;

#[inline(always)] pub fn zahl(x: f64) -> W { if x != x { NAN } else { x.to_bits() } }
#[inline(always)] pub fn ist_zahl(w: W) -> bool { w < MARKE }
#[inline(always)] pub fn f(w: W) -> f64 { f64::from_bits(w) }
#[inline(always)] pub fn bool_w(b: bool) -> W { if b { JA } else { NEIN } }
#[inline(always)] pub fn ist_bool(w: W) -> bool { (w >> 32) == 0xFFFD_0000 }
#[inline(always)] pub fn ist_ptr(w: W) -> bool { (w >> 32) == 0xFFFE_0000 }
#[inline(always)] pub fn ptr_w(p: u32) -> W { PTR | p as u64 }
#[inline(always)] pub fn p(w: W) -> u32 { w as u32 }

// Objektarten (K-105: Pizza/Sicht/Belag/Stück entfernt, Nummern kompakt neu vergeben; A_TEXT = 1 ist im Compiler
// fest verdrahtet – backend-wasm.js schreibt Textkonstanten mit art 1 –, alle anderen Nummern sind rein laufzeitintern;
// A_THEKE/A_ZUTAT stehen in theke.rs, A_ZUFALL/A_KAMMER in vorrat.rs)
pub const A_TEXT: u32 = 1;
pub const A_BLECH: u32 = 2;
pub const A_KARTE: u32 = 3;
pub const A_DAUER: u32 = 4;
pub const A_OBJ: u32 = 5;
pub const A_ENUMW: u32 = 6;
pub const A_KLASSE: u32 = 7;
pub const A_ENUMT: u32 = 8;
pub const A_REZEPTUR: u32 = 9;
pub const A_MODUL: u32 = 10;
pub const A_FUNKTION: u32 = 11;
pub const A_GEBUNDEN: u32 = 12;
pub const A_NATIV: u32 = 13;
pub const A_TEIG: u32 = 14;
pub const A_LIEF: u32 = 15;
pub const A_ZUST: u32 = 16;
pub const A_RESTE: u32 = 17;
pub const A_ROH: u32 = 18;
pub const A_ZELLE: u32 = 19;

#[inline(always)]
pub fn art(w: W) -> u32 {
    if !ist_ptr(w) { return 0; }
    unsafe { *(p(w) as *const u32) }
}

pub fn neu<T: 'static>(v: T) -> &'static mut T {
    let q = crate::alloc_roh(core::mem::size_of::<T>() as u32, core::mem::align_of::<T>() as u32) as *mut T;
    unsafe { q.write(v); &mut *q }
}
pub fn neu_w<T: 'static>(v: T) -> W { ptr_w(neu(v) as *mut T as u32) }

#[inline(always)]
pub fn obj<T>(w: W) -> &'static mut T { unsafe { &mut *(p(w) as *mut T) } }

#[repr(C)] pub struct Text { pub art: u32, pub len: u32, pub info: u32, pub daten: u32 }
#[repr(C)] pub struct Blech { pub art: u32, pub _r: u32, pub v: Vec<W> }
pub use crate::karte::Karte;
#[repr(C)] pub struct Dauer { pub art: u32, pub _r: u32, pub ms: f64 }
#[repr(C)] pub struct Feld { pub w: W, pub info: u32, pub besitzer: u32 }
#[repr(C)] pub struct Obj { pub art: u32, pub klasse: u32, pub nr: f64, pub felder: Vec<Feld>, pub zugeklappt: u32, pub nachricht: W, pub cache: u32 }
#[repr(C)] pub struct EnumW { pub art: u32, pub e: u32, pub name: W, pub pos: f64 }
#[repr(C)] pub struct Ref { pub art: u32, pub id: u32 }
#[repr(C)] pub struct Funktion { pub art: u32, pub fnid: u32, pub dies: W, pub unten: W, pub n: u32, pub _r: u32 }
#[repr(C)] pub struct Gebunden { pub art: u32, pub klasse: i32, pub obj: W, pub name: u32, pub global: u32 }
#[repr(C)] pub struct Nativ { pub art: u32, pub was: u32, pub empf: W, pub name: u32, pub modul: u32 }
#[repr(C)] pub struct Teig { pub art: u32, pub fertig: u32, pub auf: u32, pub _r: u32, pub fnw: W, pub wert: W }
/// K-127: `prio` ordnet die wennDa-Phase. ÜBERGANG (K-127): `trinkgeld` (Summe, Budgetfaktor von warte) entfällt in Phase B.
#[repr(C)] pub struct Lief { pub art: u32, pub nr: u32, pub fnw: W, pub prio: f64, pub trinkgeld: f64, pub zust: W, pub rueckruf: W }
#[repr(C)] pub struct Zust { pub art: u32, pub puenktlich: u32, pub wert: W, pub fehler: W, pub fzeile: i32, pub fpos: i32 }
#[repr(C)] pub struct Reste { pub art: u32, pub matschig: u32, pub wert: W }
#[repr(C)] pub struct Roh { pub art: u32, pub _r: u32, pub teil: W, pub zeit: W }
#[repr(C)] pub struct Zelle { pub art: u32, pub _r: u32, pub w: W }

pub fn dauer(ms: f64) -> W { neu_w(Dauer { art: A_DAUER, _r: 0, ms }) }
pub fn blech(v: Vec<W>) -> W { neu_w(Blech { art: A_BLECH, _r: 0, v }) }
pub fn blech_v(w: W) -> &'static mut Vec<W> { &mut obj::<Blech>(w).v }
pub fn dauer_ms(w: W) -> f64 { obj::<Dauer>(w).ms }
