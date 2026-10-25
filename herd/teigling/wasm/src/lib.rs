//! Wasm-Hülle des Vorbackers (`site/js/herd/teigling.wasm`, PROJEKTE.md §5.3): keine Importe, exportiert `memory` und
//!
//! | Export | Signatur | Bedeutung |
//! |---|---|---|
//! | `abi_version` | `() → i32` | 1 |
//! | `teigling_version` | `() → i32` | Formatversion der erzeugten Teiglinge (1) |
//! | `puffer` | `(len) → ptr` | Eingabepuffer ≥ len Bytes, gültig bis zum nächsten `puffer` |
//! | `vorbacken` | `(ptr, len) → len` | Teigling der Quelle bauen; Bytes ab `ergebnis()`, gültig bis zum nächsten Aufruf |
//! | `sha256` | `(ptr, len) → 32` | SHA-256 der Bytes; Ergebnis ab `ergebnis()` |
//! | `ergebnis` | `() → ptr` | Zeiger auf das letzte Ergebnis |
//! | `freigeben` | `() → 0` | Ein- und Ausgabepuffer freigeben |
//! | `modell_version` | `() → i32` | Formatversion der Modellteige (1, H-K16; Cache-Schlüssel `modell/1`) |
//! | `modell_vorbacken` | `(ptr, len) → len` | Modellteig aus einem Quellpaket (`TEIGQUEL …`) oder direkt aus einer `.glb` |
//! | `modell_braucht` | `(ptr, len) → len` | Eingabe: Pfad, NUL, Hauptdatei → Text „URI ⇥ Projektpfad“ je Zeile (was ein `.gltf` braucht) |
//! | `klang_version` | `() → i32` | Formatversion der Klangteige (1, H-K19a; Cache-Schlüssel `klang/1`) |
//! | `klang_vorbacken` | `(ptr, len) → len` | Klangteig aus einer WAV-, FLAC- oder OGG-Vorbis-Datei (bei Fehlern ein Fehler-Klangteig mit fertigem Text) |
//!
//! `abi_version` bleibt 1: die Modell- und Klang-Exporte sind Zusatz; Hüllen erkennen sie an `modell_version` bzw.
//! `klang_version`.
//!
//! Wird nur für `wasm32v1-none` gebaut (`node herd/baue.js`); nativ ist die Crate leer. Der Allocator ist derselbe wie in
//! `herd/kern-wasm` (Größenklassen 2^k, Nachschub per `memory.grow`).

#![cfg_attr(target_arch = "wasm32", no_std)]

#[cfg(target_arch = "wasm32")]
mod wasm {
    extern crate alloc;

    use alloc::vec::Vec;
    use core::alloc::{GlobalAlloc, Layout};
    use core::cell::UnsafeCell;

    const KLASSEN: usize = 32;
    const SEITE: usize = 65536;

    struct Halde {
        frei: [usize; KLASSEN],
        zeiger: usize,
        ende: usize,
    }

    struct Alloc(UnsafeCell<Halde>);
    unsafe impl Sync for Alloc {}

    #[global_allocator]
    static ALLOC: Alloc = Alloc(UnsafeCell::new(Halde { frei: [0; KLASSEN], zeiger: 0, ende: 0 }));

    fn klasse(l: &Layout) -> usize {
        let g = if l.size() > l.align() { l.size() } else { l.align() };
        let g = if g < 16 { 16 } else { g };
        (usize::BITS - (g - 1).leading_zeros()) as usize
    }

    unsafe impl GlobalAlloc for Alloc {
        unsafe fn alloc(&self, l: Layout) -> *mut u8 {
            let h = &mut *self.0.get();
            let k = klasse(&l);
            if k >= KLASSEN {
                return core::ptr::null_mut();
            }
            if h.frei[k] != 0 {
                let p = h.frei[k];
                h.frei[k] = *(p as *const usize);
                return p as *mut u8;
            }
            let groesse = 1usize << k;
            let ausr = if groesse < 4096 { groesse } else { 4096 };
            let mut p = (h.zeiger + ausr - 1) & !(ausr - 1);
            if p + groesse > h.ende || h.ende == 0 {
                let noetig = groesse + ausr;
                let seiten = noetig.div_ceil(SEITE);
                let alt = core::arch::wasm32::memory_grow(0, seiten);
                if alt == usize::MAX {
                    return core::ptr::null_mut();
                }
                let basis = alt * SEITE;
                if basis != h.ende {
                    h.zeiger = basis;
                }
                h.ende = basis + seiten * SEITE;
                p = (h.zeiger + ausr - 1) & !(ausr - 1);
                if p + groesse > h.ende {
                    return core::ptr::null_mut();
                }
            }
            h.zeiger = p + groesse;
            p as *mut u8
        }
        unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
            let h = &mut *self.0.get();
            let k = klasse(&l);
            *(p as *mut usize) = h.frei[k];
            h.frei[k] = p as usize;
        }
        unsafe fn realloc(&self, p: *mut u8, l: Layout, neu: usize) -> *mut u8 {
            let nl = Layout::from_size_align_unchecked(neu, l.align());
            if klasse(&nl) == klasse(&l) {
                return p;
            }
            let q = self.alloc(nl);
            if !q.is_null() {
                let n = if l.size() < neu { l.size() } else { neu };
                core::ptr::copy_nonoverlapping(p, q, n);
                self.dealloc(p, l);
            }
            q
        }
    }

    #[panic_handler]
    fn panik(_: &core::panic::PanicInfo) -> ! {
        core::arch::wasm32::unreachable()
    }

    struct Zustand {
        ein: Vec<u8>,
        aus: Vec<u8>,
    }
    struct Global(UnsafeCell<Zustand>);
    unsafe impl Sync for Global {}
    static Z: Global = Global(UnsafeCell::new(Zustand { ein: Vec::new(), aus: Vec::new() }));

    fn z() -> &'static mut Zustand {
        unsafe { &mut *Z.0.get() }
    }
    fn b<'a>(p: i32, l: i32) -> &'a [u8] {
        if l <= 0 || p == 0 {
            &[]
        } else {
            unsafe { core::slice::from_raw_parts(p as usize as *const u8, l as usize) }
        }
    }

    #[no_mangle]
    pub extern "C" fn abi_version() -> i32 {
        1
    }
    #[no_mangle]
    pub extern "C" fn teigling_version() -> i32 {
        herd_teigling::VERSION as i32
    }
    #[no_mangle]
    pub extern "C" fn puffer(laenge: i32) -> i32 {
        let z = z();
        z.ein = Vec::new();
        z.ein.resize(laenge.max(1) as usize, 0);
        z.ein.as_ptr() as usize as i32
    }
    #[no_mangle]
    pub extern "C" fn vorbacken(p: i32, l: i32) -> i32 {
        let t = herd_teigling::vorbacken(b(p, l));
        let z = z();
        z.aus = t;
        z.aus.len() as i32
    }
    #[no_mangle]
    pub extern "C" fn sha256(p: i32, l: i32) -> i32 {
        let h = herd_teigling::sha256(b(p, l));
        let z = z();
        z.aus = h.to_vec();
        32
    }
    #[no_mangle]
    pub extern "C" fn modell_version() -> i32 {
        herd_teigling::modell::VERSION as i32
    }
    #[no_mangle]
    pub extern "C" fn modell_vorbacken(p: i32, l: i32) -> i32 {
        let t = herd_teigling::modell::vorbacken(b(p, l));
        let z = z();
        z.aus = t;
        z.aus.len() as i32
    }
    #[no_mangle]
    pub extern "C" fn modell_braucht(p: i32, l: i32) -> i32 {
        let e = b(p, l);
        let n = e.iter().position(|&c| c == 0).unwrap_or(e.len());
        let pfad = core::str::from_utf8(&e[..n]).unwrap_or("");
        let haupt = if n < e.len() { &e[n + 1..] } else { &[][..] };
        let t = herd_teigling::modell::braucht_text(pfad, haupt);
        let z = z();
        z.aus = t.into_bytes();
        z.aus.len() as i32
    }
    #[no_mangle]
    pub extern "C" fn klang_version() -> i32 {
        herd_teigling::klang::VERSION as i32
    }
    #[no_mangle]
    pub extern "C" fn klang_vorbacken(p: i32, l: i32) -> i32 {
        let t = herd_teigling::klang::vorbacken(b(p, l));
        let z = z();
        z.aus = t;
        z.aus.len() as i32
    }
    #[no_mangle]
    pub extern "C" fn ergebnis() -> i32 {
        z().aus.as_ptr() as usize as i32
    }
    #[no_mangle]
    pub extern "C" fn freigeben() -> i32 {
        let z = z();
        z.ein = Vec::new();
        z.aus = Vec::new();
        0
    }
}
