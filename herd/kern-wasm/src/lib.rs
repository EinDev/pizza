//! Wasm-Hülle des Herd-Kerns: Exporte `hz_*` (siehe herd/README.md), keine Importe, eigener kleiner Allocator.
//! Wird nur für `wasm32v1-none` gebaut (`node herd/baue.js`); nativ ist die Crate leer.

#![cfg_attr(target_arch = "wasm32", no_std)]

#[cfg(target_arch = "wasm32")]
mod wasm {
    extern crate alloc;

    use alloc::vec::Vec;
    use core::alloc::{GlobalAlloc, Layout};
    use core::cell::UnsafeCell;
    use herd_kern::Kern;

    // ---------------- Allocator: Größenklassen 2^k mit Freilisten, Nachschub per memory.grow ----------------

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

    // ---------------- Zustand ----------------

    struct Zustand {
        kern: Option<Kern>,
        puffer: Vec<u8>,
    }
    struct Global(UnsafeCell<Zustand>);
    unsafe impl Sync for Global {}
    static Z: Global = Global(UnsafeCell::new(Zustand { kern: None, puffer: Vec::new() }));

    fn z() -> &'static mut Zustand {
        unsafe { &mut *Z.0.get() }
    }
    fn kern() -> &'static mut Kern {
        z().kern.get_or_insert_with(Kern::neu)
    }

    // ---------------- Exporte ----------------

    /// Version des Zeichenlisten-Formats.
    #[no_mangle]
    pub extern "C" fn hz_version() -> u32 {
        herd_kern::liste::VERSION
    }

    /// Eingabepuffer für eine Nachricht von `laenge` Bytes; der Zeiger gilt bis zum nächsten `hz_puffer`.
    #[no_mangle]
    pub extern "C" fn hz_puffer(laenge: u32) -> *mut u8 {
        let p = &mut z().puffer;
        p.clear();
        p.resize(laenge as usize, 0);
        p.as_mut_ptr()
    }

    /// Verarbeitet die ersten `laenge` Bytes des Eingabepuffers. Ergebnis: Nachrichtenart 1 … 5 oder Fehler < 0.
    #[no_mangle]
    pub extern "C" fn hz_nachricht(laenge: u32) -> i32 {
        let zs = z();
        let n = (laenge as usize).min(zs.puffer.len());
        let k = zs.kern.get_or_insert_with(Kern::neu);
        match k.nachricht(&zs.puffer[..n]) {
            Ok(a) => a as i32,
            Err(f) => f as i32,
        }
    }

    /// Bereitet das letzte Bild für `breite × hoehe` Gerätepixel vor; Ergebnis: Länge der Zeichenliste.
    #[no_mangle]
    pub extern "C" fn hz_bereite(breite: u32, hoehe: u32) -> u32 {
        kern().bereite(breite, hoehe).len() as u32
    }

    #[no_mangle]
    pub extern "C" fn hz_liste() -> *const u8 {
        kern().liste().as_ptr()
    }

    #[no_mangle]
    pub extern "C" fn hz_liste_laenge() -> u32 {
        kern().liste().len() as u32
    }

    /// Ecken des Netzes `id` (Länge = ecken × 32 laut Netztabelle) oder 0.
    #[no_mangle]
    pub extern "C" fn hz_netz_ecken(id: u32) -> *const u8 {
        kern().netz(id).map(|n| n.0.as_ptr()).unwrap_or(core::ptr::null())
    }

    /// Indizes des Netzes `id` (u32, Länge = indizes × 4) oder 0.
    #[no_mangle]
    pub extern "C" fn hz_netz_indizes(id: u32) -> *const u8 {
        kern().netz(id).map(|n| n.1.as_ptr()).unwrap_or(core::ptr::null())
    }

    /// Texturdaten `id` (RGBA8 bzw. R8) oder 0.
    #[no_mangle]
    pub extern "C" fn hz_textur(id: u32) -> *const u8 {
        kern().textur(id).map(|t| t.as_ptr()).unwrap_or(core::ptr::null())
    }

    /// Fensterangaben: 0 Breite, 1 Höhe, 2 Zeiger auf den Titel (UTF-8), 3 Titellänge, 4 offen (0/1). Ohne `fenster` 0.
    #[no_mangle]
    pub extern "C" fn hz_fenster(was: u32) -> u32 {
        let k = kern();
        if was == 4 {
            return k.offen() as u32;
        }
        match k.fenster() {
            None => 0,
            Some(f) => match was {
                0 => f.breite as u32,
                1 => f.hoehe as u32,
                2 => f.titel.as_ptr() as u32,
                3 => f.titel.len() as u32,
                _ => 0,
            },
        }
    }

    /// FNV-1a 64 über Zeichenliste + Ressourcendaten (wie `Kern::fnv`).
    #[no_mangle]
    pub extern "C" fn hz_fnv() -> u64 {
        kern().fnv()
    }

    /// Vergisst alles (neuer Kern, z. B. für ein neues Programm).
    #[no_mangle]
    pub extern "C" fn hz_zuruecksetzen() {
        z().kern = Some(Kern::neu());
    }
}
