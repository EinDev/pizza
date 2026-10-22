//! Wasm-Hülle des Herd-Kerns: die Exporte des Herd-ABI (herd/README.md), keine Importe, eigener kleiner Allocator.
//! Jeder Export ruft genau die gleichnamige Methode von `herd_kern::Kern`.
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
        /// Austauschpuffer für Texte/Listen (8-Byte-ausgerichtet)
        puffer: Vec<u64>,
    }
    struct Global(UnsafeCell<Zustand>);
    unsafe impl Sync for Global {}
    static Z: Global = Global(UnsafeCell::new(Zustand { kern: None, puffer: Vec::new() }));

    fn z() -> &'static mut Zustand {
        unsafe { &mut *Z.0.get() }
    }
    fn k() -> &'static mut Kern {
        z().kern.get_or_insert_with(Kern::neu)
    }
    fn b<'a>(p: i32, l: i32) -> &'a [u8] {
        if l <= 0 || p == 0 {
            &[]
        } else {
            unsafe { core::slice::from_raw_parts(p as usize as *const u8, l as usize) }
        }
    }
    fn bm<'a>(p: i32, l: i32) -> &'a mut [u8] {
        if l <= 0 || p == 0 {
            &mut []
        } else {
            unsafe { core::slice::from_raw_parts_mut(p as usize as *mut u8, l as usize) }
        }
    }
    fn zahlen(p: i32, n: i32) -> Vec<f64> {
        b(p, n.max(0) * 8).chunks_exact(8).map(|c| f64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]])).collect()
    }
    fn ids(p: i32, n: i32) -> Vec<u32> {
        b(p, n.max(0) * 4).chunks_exact(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect()
    }
    /// Text-Ausgabe mit Retry (K-013): passt er nicht, wird nichts geschrieben.
    fn text_aus(t: &[u8], p: i32, kap: i32) -> i32 {
        if t.len() as i64 <= kap as i64 {
            bm(p, t.len() as i32).copy_from_slice(t);
        }
        t.len() as i32
    }
    fn ids_aus(v: &[u32], p: i32) {
        let ziel = bm(p, v.len() as i32 * 4);
        for (i, x) in v.iter().enumerate() {
            ziel[i * 4..i * 4 + 4].copy_from_slice(&x.to_le_bytes());
        }
    }

    macro_rules! export {
        ($(fn $name:ident($($a:ident: $t:ty),*) -> $r:ty $body:block)*) => {
            $(
                #[no_mangle]
                pub extern "C" fn $name($($a: $t),*) -> $r $body
            )*
        };
    }

    export! {
        fn abi_version() -> i32 { 1 }
        fn puffer(laenge: i32) -> i32 {
            let p = &mut z().puffer;
            let n = (laenge.max(0) as usize).div_ceil(8).max(1);
            if p.len() < n {
                p.resize(n, 0);
            }
            p.as_mut_ptr() as usize as i32
        }

        fn fehler_art() -> i32 { k().fehler_art() }
        fn fehler_code() -> i32 { k().fehler_code() }
        fn fehler_neu() -> i32 { k().fehler_neu() }
        fn fehler_text(p: i32, kap: i32) -> i32 { text_aus(k().fehler_text().as_bytes(), p, kap) }
        fn melde_typfehler(typ: i32, feld: i32, p: i32, l: i32) -> i32 { k().melde_typfehler(typ, feld, b(p, l)) }

        fn welt_neu(breite: f64, hoehe: f64, p: i32, l: i32) -> i32 { k().welt_neu(breite, hoehe, b(p, l)) }
        fn welt_titel(p: i32, l: i32) -> i32 { k().welt_titel(b(p, l)) }
        fn welt_hintergrund(p: i32, l: i32) -> i32 { k().welt_hintergrund(b(p, l)) }
        fn welt_himmel(op: i32, ol: i32, up: i32, ul: i32) -> i32 { k().welt_himmel(b(op, ol), b(up, ul)) }
        fn welt_umgebung(p: i32, l: i32, staerke: f64) -> i32 { k().welt_umgebung(b(p, l), staerke) }
        fn welt_nebel(p: i32, l: i32, von: f64, bis: f64) -> i32 { k().welt_nebel(b(p, l), von, bis) }
        fn welt_hole(was: i32) -> f64 { k().welt_hole(was) }

        fn teil_neu(raum: i32) -> i32 { k().teil_neu(raum) }
        fn teil_entferne(teil: i32) -> i32 { k().teil_entferne(teil) }
        fn teil_kopie(teil: i32) -> i32 { k().teil_kopie(teil) }
        fn teil_haenge(teil: i32, an: i32) -> i32 { k().teil_haenge(teil, an) }
        fn teil_kinder(teil: i32, p: i32, kap: i32) -> i32 {
            let mut v = alloc::vec![0u32; kap.max(0) as usize];
            let n = k().teil_kinder(teil, &mut v);
            if n >= 0 && n <= kap { ids_aus(&v[..n as usize], p); }
            n
        }
        fn teil_setze(teil: i32, feld: i32, wert: f64) -> i32 { k().teil_setze(teil, feld, wert) }
        fn teil_hole(teil: i32, feld: i32) -> f64 { k().teil_hole(teil, feld) }
        fn teil_lage(teil: i32, x: f64, y: f64, zz: f64) -> i32 { k().teil_lage(teil, x, y, zz) }
        fn teil_verschiebe(teil: i32, x: f64, y: f64, zz: f64) -> i32 { k().teil_verschiebe(teil, x, y, zz) }
        fn teil_groesse(teil: i32, x: f64, y: f64, zz: f64) -> i32 { k().teil_groesse(teil, x, y, zz) }
        fn teil_schaue(teil: i32, x: f64, y: f64, zz: f64) -> i32 { k().teil_schaue(teil, x, y, zz) }
        fn teil_trifft(a: i32, bb: i32) -> i32 { k().teil_trifft(a, bb) }

        fn komp_neu(typ: i32) -> i32 { k().komp_neu(typ) }
        fn komp_haenge(komp: i32, teil: i32) -> i32 { k().komp_haenge(komp, teil) }
        fn komp_loese(komp: i32) -> i32 { k().komp_loese(komp) }
        fn komp_von(teil: i32, typ: i32) -> i32 { k().komp_von(teil, typ) }
        fn komp_info(komp: i32, was: i32) -> i32 { k().komp_info(komp, was) }
        fn typ_nummer(p: i32, l: i32) -> i32 { k().typ_nummer(b(p, l)) }
        fn feld_nummer(typ: i32, p: i32, l: i32) -> i32 { k().feld_nummer(typ, b(p, l)) }

        fn setze_zahl(komp: i32, feld: i32, wert: f64) -> i32 { k().setze_zahl(komp, feld, wert) }
        fn hole_zahl(komp: i32, feld: i32) -> f64 { k().hole_zahl(komp, feld) }
        fn setze_text(komp: i32, feld: i32, p: i32, l: i32) -> i32 { k().setze_text(komp, feld, b(p, l)) }
        fn hole_text(komp: i32, feld: i32, p: i32, kap: i32) -> i32 { k().hole_text(komp, feld, bm(p, kap)) }
        fn setze_liste(komp: i32, feld: i32, p: i32, n: i32) -> i32 { k().setze_liste(komp, feld, &ids(p, n)) }
        fn hole_liste(komp: i32, feld: i32, p: i32, kap: i32) -> i32 {
            let mut v = alloc::vec![0u32; kap.max(0) as usize];
            let n = k().hole_liste(komp, feld, &mut v);
            if n >= 0 && n <= kap { ids_aus(&v[..n as usize], p); }
            n
        }

        fn form_grund(art: i32, teile: f64, dicke: f64) -> i32 { k().form_grund(art, teile, dicke) }
        fn form_eigene(pp: i32, pn: i32, dp: i32, dn: i32, glatt: i32) -> i32 { k().form_eigene(&zahlen(pp, pn), &zahlen(dp, dn), glatt) }
        fn bildchen_neu(zp: i32, zl: i32, fp: i32, fl: i32) -> i32 { k().bildchen_neu(b(zp, zl), b(fp, fl)) }
        fn bildchen_rgba(breite: i32, hoehe: i32, p: i32) -> i32 { k().bildchen_rgba(breite, hoehe, b(p, breite.max(0).saturating_mul(hoehe.max(0)).saturating_mul(4))) }
        fn ressource_hole(id: i32, was: i32) -> f64 { k().ressource_hole(id, was) }

        fn takt() -> i32 { k().takt() }
        fn bild(bildnummer: i32) -> i32 { k().bild(bildnummer) }
        fn bild_zeiger() -> i32 { k().paket().as_ptr() as usize as i32 }
        fn paket_voll() -> i32 { k().paket_voll() }
        fn hash_szene(p: i32) -> i32 { let h = k().hash_szene(); text_aus(&herd_kern::hash::hex(h), p, 16) }
        fn hash_paket(p: i32) -> i32 { let h = k().hash_paket(); text_aus(&herd_kern::hash::hex(h), p, 16) }
        fn schema_json(p: i32, kap: i32) -> i32 { text_aus(k().schema_json().as_bytes(), p, kap) }
    }
}
