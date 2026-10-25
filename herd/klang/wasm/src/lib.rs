//! Wasm-Hülle des Klang-Erzeugers (`site/js/herd/klang.wasm`, H-K14, K-153): keine Importe, exportiert `memory` und die
//! Methoden von [`herd_klang::Abi`] unter gleichem Namen. Texte und Hashes gehen über den Austauschpuffer `puffer(len)`
//! (Zeiger in diesem Speicher); Ergebnis `id ≥ 1` oder `-1` = Fehler (`fehler_art`, `fehler_text` mit Retry, `fehler_neu`).
//!
//! | Export | Signatur |
//! |---|---|
//! | `abi_version` | `() → i32` (1) |
//! | `puffer` | `(len) → ptr` |
//! | `fehler_art`, `fehler_neu` | `() → i32` |
//! | `fehler_text` | `(ptr, kap) → len` |
//! | `ton` | `(frequenz f64, dauer f64, welle_ptr, welle_len, lautstaerke f64, bis f64, anschlag f64, ausklang f64) → id` |
//! | `rauschen` | `(dauer f64, art_ptr, art_len, lautstaerke f64, anschlag f64, ausklang f64, saat f64) → id` |
//! | `stille` | `(dauer f64) → id` |
//! | `noten` | `(text_ptr, text_len, tempo f64, welle_ptr, welle_len, lautstaerke f64) → id` |
//! | `huelle` | `(id, anschlag f64, abfall f64, halten f64, ausklang f64) → id` |
//! | `tiefpass`, `hochpass` | `(id, frequenz f64, guete f64) → id` |
//! | `verstaerke` | `(id, faktor f64) → id` |
//! | `mische` | `(a, b, ab f64) → id` · `dann` `(a, b) → id` |
//! | `wiederhole` | `(id, n f64) → id` · `nahtlos` `(id, ueberblendung f64) → id` |
//! | `dauer` | `(id) → f64` (Sekunden; NaN = unbekannt) |
//! | `hash` | `(id, ptr) → 16` (Hex-Ziffern nach ptr; −1 = unbekannt) |
//! | `pcm`, `pcm_laenge` | `(id) → ptr` bzw. Bytes (i16 LE; erzeugt mono 48 kHz, geladen verschachtelt mit eigener Rate) |
//! | `laden` | `(pfad_ptr, pfad_len, teig_ptr, teig_len) → id` (Klangteig, H-K19a) |
//! | `rate`, `kanaele` | `(id) → i32` (Hz bzw. 1/2; 0 = unbekannt) |
//!
//! Wird nur für `wasm32v1-none` gebaut (`node herd/baue.js`); nativ ist die Crate leer. Allocator wie in `herd/kern-wasm`.

#![cfg_attr(target_arch = "wasm32", no_std)]

#[cfg(target_arch = "wasm32")]
mod wasm {
    extern crate alloc;

    use alloc::vec::Vec;
    use core::alloc::{GlobalAlloc, Layout};
    use core::cell::UnsafeCell;
    use herd_klang::Abi;

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
        abi: Option<Abi>,
        puffer: Vec<u8>,
    }
    struct Global(UnsafeCell<Zustand>);
    unsafe impl Sync for Global {}
    static Z: Global = Global(UnsafeCell::new(Zustand { abi: None, puffer: Vec::new() }));

    fn z() -> &'static mut Zustand {
        unsafe { &mut *Z.0.get() }
    }
    fn a() -> &'static mut Abi {
        z().abi.get_or_insert_with(Abi::neu)
    }
    fn t<'x>(p: i32, l: i32) -> &'x str {
        if l <= 0 || p == 0 {
            return "";
        }
        let b = unsafe { core::slice::from_raw_parts(p as usize as *const u8, l as usize) };
        core::str::from_utf8(b).unwrap_or("\u{fffd}")
    }

    #[no_mangle]
    pub extern "C" fn abi_version() -> i32 {
        1
    }
    #[no_mangle]
    pub extern "C" fn puffer(laenge: i32) -> i32 {
        let z = z();
        let n = laenge.max(1) as usize;
        if z.puffer.len() < n {
            z.puffer = Vec::new();
            z.puffer.resize(n, 0);
        }
        z.puffer.as_ptr() as usize as i32
    }
    #[no_mangle]
    pub extern "C" fn fehler_art() -> i32 {
        a().fehler_art()
    }
    #[no_mangle]
    pub extern "C" fn fehler_neu() -> i32 {
        a().fehler_neu()
    }
    #[no_mangle]
    pub extern "C" fn fehler_text(p: i32, kap: i32) -> i32 {
        let s = a().fehler_text().as_bytes();
        if s.len() <= kap.max(0) as usize && p != 0 {
            unsafe { core::ptr::copy_nonoverlapping(s.as_ptr(), p as usize as *mut u8, s.len()) };
        }
        s.len() as i32
    }
    #[no_mangle]
    #[allow(clippy::too_many_arguments)]
    pub extern "C" fn ton(fr: f64, d: f64, wp: i32, wl: i32, laut: f64, bis: f64, an: f64, aus: f64) -> i32 {
        a().ton(fr, d, t(wp, wl), laut, bis, an, aus)
    }
    #[no_mangle]
    pub extern "C" fn rauschen(d: f64, ap: i32, al: i32, laut: f64, an: f64, aus: f64, saat: f64) -> i32 {
        a().rauschen(d, t(ap, al), laut, an, aus, saat)
    }
    #[no_mangle]
    pub extern "C" fn stille(d: f64) -> i32 {
        a().stille(d)
    }
    #[no_mangle]
    pub extern "C" fn noten(tp: i32, tl: i32, tempo: f64, wp: i32, wl: i32, laut: f64) -> i32 {
        a().noten(t(tp, tl), tempo, t(wp, wl), laut)
    }
    #[no_mangle]
    pub extern "C" fn huelle(id: i32, an: f64, ab: f64, halten: f64, aus: f64) -> i32 {
        a().huelle(id, an, ab, halten, aus)
    }
    #[no_mangle]
    pub extern "C" fn tiefpass(id: i32, fr: f64, q: f64) -> i32 {
        a().tiefpass(id, fr, q)
    }
    #[no_mangle]
    pub extern "C" fn hochpass(id: i32, fr: f64, q: f64) -> i32 {
        a().hochpass(id, fr, q)
    }
    #[no_mangle]
    pub extern "C" fn verstaerke(id: i32, faktor: f64) -> i32 {
        a().verstaerke(id, faktor)
    }
    #[no_mangle]
    pub extern "C" fn mische(x: i32, y: i32, ab: f64) -> i32 {
        a().mische(x, y, ab)
    }
    #[no_mangle]
    pub extern "C" fn dann(x: i32, y: i32) -> i32 {
        a().dann(x, y)
    }
    #[no_mangle]
    pub extern "C" fn wiederhole(id: i32, n: f64) -> i32 {
        a().wiederhole(id, n)
    }
    #[no_mangle]
    pub extern "C" fn nahtlos(id: i32, u: f64) -> i32 {
        a().nahtlos(id, u)
    }
    #[no_mangle]
    pub extern "C" fn dauer(id: i32) -> f64 {
        a().dauer(id)
    }
    #[no_mangle]
    pub extern "C" fn hash(id: i32, p: i32) -> i32 {
        match a().hash(id) {
            Some(h) => {
                unsafe { core::ptr::copy_nonoverlapping(h.as_ptr(), p as usize as *mut u8, 16) };
                16
            }
            None => -1,
        }
    }
    #[no_mangle]
    pub extern "C" fn laden(pp: i32, pl: i32, tp: i32, tl: i32) -> i32 {
        let teig: &[u8] = if tl <= 0 || tp == 0 { &[] } else { unsafe { core::slice::from_raw_parts(tp as usize as *const u8, tl as usize) } };
        a().laden(t(pp, pl), teig)
    }
    #[no_mangle]
    pub extern "C" fn rate(id: i32) -> i32 {
        a().rate(id)
    }
    #[no_mangle]
    pub extern "C" fn kanaele(id: i32) -> i32 {
        a().kanaele(id)
    }
    #[no_mangle]
    pub extern "C" fn pcm(id: i32) -> i32 {
        a().pcm(id).as_ptr() as usize as i32
    }
    #[no_mangle]
    pub extern "C" fn pcm_laenge(id: i32) -> i32 {
        (a().pcm(id).len() * 2) as i32
    }
}
