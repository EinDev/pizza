//! Registrierung (vom generierten Programmcode aufgerufen), Warnungen, Programmablauf und Programmende.

use crate::klassen::*;
use crate::namen::*;
use crate::ops::*;
use crate::text::*;
use crate::wert::*;
use crate::{sig, z};
use alloc::vec::Vec;

/// Positionstabelle: Zeiger auf u32-Paare (zeile, spalte); Index 0 = unbekannt
#[no_mangle]
pub static mut POS_TABELLE: u32 = 0;
static mut POS_N: u32 = 0;

pub fn pos_zs(pos: i32) -> (i32, i32) {
    unsafe {
        if pos <= 0 || POS_TABELLE == 0 || pos as u32 >= POS_N { return (0, 0); }
        let p = (POS_TABELLE + pos as u32 * 8) as *const i32;
        (*p, *p.add(1))
    }
}

static mut WARN_SET: Vec<(&'static str, i32, i32)> = Vec::new();
static mut WARN_W: Vec<(W, i32, i32)> = Vec::new();

fn warn_neu(code_s: Option<&'static str>, code_w: W, z_: i32, s_: i32) -> bool {
    unsafe {
        match code_s {
            Some(c) => { if WARN_SET.iter().any(|&(x, a, b)| x == c && a == z_ && b == s_) { return false; } WARN_SET.push((c, z_, s_)); }
            None => {
                if WARN_W.iter().any(|&(x, a, b)| bytes(x) == bytes(code_w) && a == z_ && b == s_) { return false; }
                if WARN_SET.iter().any(|&(x, a, b)| x.as_bytes() == bytes(code_w) && a == z_ && b == s_) { return false; }
                WARN_W.push((code_w, z_, s_));
            }
        }
    }
    true
}

/// warnung(code, text, node): knoten = Positions-ID (0 → aktuelle Position)
pub fn warnung_w(code: &'static str, t: W, knoten: i32) {
    let pos = if knoten > 0 { knoten } else { z().pos };
    let (zz, ss) = pos_zs(pos);
    if !warn_neu(Some(code), KARTON, zz, ss) { return; }
    let mut tb = Tb::neu();
    tb.s(code).s(": ").t(t);
    crate::host_warnung(code.as_bytes(), &tb.0, zz, ss);
}
pub fn warnung(code: &'static str, t: &str, knoten: i32) { warnung_w(code, neu_str(t), knoten); }

// ---------------------------------------------------------------- Registrierung
static mut STAT_WARN: Vec<(W, W, i32)> = Vec::new();
static mut STARTFEHLER: Option<(W, W, i32)> = None;
static mut USER_KLASSEN: Vec<u32> = Vec::new();
static mut METH_POS: Vec<(u32, i32)> = Vec::new();

fn init() {
    namen_init();
    eingebaute_klassen();
    crate::pf::belaege_init();
    crate::argstapel_init();
}

#[no_mangle]
pub extern "C" fn rt_pos(tab: u32, n: u32) { unsafe { POS_TABELLE = tab; POS_N = n; } init(); }

#[no_mangle]
pub extern "C" fn rt_fn(tab: i32, name: u32) -> i32 {
    init();
    unsafe {
        FNS.push(FnInfo { tab: tab as u32, params: Vec::new(), name: if name != 0 { name_id(ptr_w(name)) } else { 0 } });
        (FNS.len() - 1) as i32
    }
}
/// flags: 1 = @NieKarton, 2 = gebacken
#[no_mangle]
pub extern "C" fn rt_param(f: i32, name: u32, typ: u32, flags: i32) {
    let p = Param { name: name_id(ptr_w(name)), typ: if typ != 0 { name_id(ptr_w(typ)) } else { 0 }, nie_karton: flags & 1 != 0, gebacken: flags & 2 != 0 };
    fnx(f as u32).params.push(p);
}
/// flags: 1 rohling, 2 gebacken, 4 calzone
#[no_mangle]
pub extern "C" fn rt_klasse(name: u32, flags: i32) -> i32 {
    init();
    let k = neue_klasse(name_id(ptr_w(name)), false);
    let kk = kl(k);
    kk.rohling = flags & 1 != 0;
    kk.gebacken = flags & 2 != 0;
    kk.calzone = flags & 4 != 0;
    unsafe { USER_KLASSEN.push(k); }
    k as i32
}
/// Klassenreferenz nach Namen (für Basisklassen; zur Laufzeit wie this.klassen.get)
#[no_mangle]
pub extern "C" fn rt_klasse_basis(k: i32, basis_name: u32) {
    if let Some(b) = klasse_nach_name(name_id(ptr_w(basis_name))) { kl(k as u32).basis = b; }
}
#[no_mangle]
pub extern "C" fn rt_klasse_erfuellt(k: i32, rez_name: u32) {
    if let Some((1, r)) = klasse_eintrag(name_id(ptr_w(rez_name))) { kl(k as u32).erfuellt.push(r); }
}
/// flags: 1 gebacken, 2 statisch; sicht 0/1/2
#[no_mangle]
pub extern "C" fn rt_feld(k: i32, name: u32, typ: u32, flags: i32, sicht: i32) {
    unsafe {
        let id = name_id(ptr_w(name));
        let t = if typ != 0 { name_id(ptr_w(typ)) } else { 0 };
        FELDINFO.push(FeldInfo { name: id, typ: t, gebacken: flags & 1 != 0, sicht: sicht as u8, klasse: k as u32 });
        let fi = (FELDINFO.len() - 1) as u32;
        if flags & 2 != 0 {
            STATFELD.push(Feld { w: standard_wert(t), info: fi, besitzer: 0 });
            let si = (STATFELD.len() - 1) as u32;
            let kk = kl(k as u32);
            match kk.statisch.iter_mut().find(|x| x.0 == id) { Some(x) => x.1 = si, None => kk.statisch.push((id, si)) }
        } else {
            kl(k as u32).felder.push(fi);
        }
    }
}
#[no_mangle]
pub extern "C" fn rt_klasse_feldinit(k: i32, f: i32) { kl(k as u32).feld_init = f; }

/// Methode registrieren. k = -1 → Top-Level-Methode. f = -1 → Rohling. flags: 1 statisch. nparam nur für Rohlinge.
#[no_mangle]
pub extern "C" fn rt_methode(k: i32, name: u32, f: i32, flags: i32, sicht: i32, nparam: i32, pos: i32) -> i32 {
    unsafe {
        let id = name_id(ptr_w(name));
        METH.push(Methode { name: id, klasse: k, belag: -1, fnid: f, statisch: flags & 1 != 0 || k < 0, sicht: sicht as u8, haltbar: -1.0, veraltet: UNDEF, gewarnt: false, hat_unten: false });
        let m = (METH.len() - 1) as u32;
        if f < 0 { ROHLING_PARAMS.push((m, nparam as u32)); }
        METH_POS.push((m, pos));
        if k >= 0 {
            let kk = kl(k as u32);
            match kk.methoden.iter_mut().find(|x| x.0 == id) { Some(x) => x.1.push(m), None => kk.methoden.push((id, alloc::vec![m])) }
        } else {
            match GLOBAL_FN.iter_mut().find(|x| x.0 == id) { Some(x) => x.1.push(m), None => GLOBAL_FN.push((id, alloc::vec![m])) }
        }
        m as i32
    }
}
#[no_mangle]
pub extern "C" fn rt_ktor(k: i32, f: i32, hat_unten: i32) -> i32 {
    unsafe {
        METH.push(Methode { name: kl(k as u32).name, klasse: k, belag: -1, fnid: f, statisch: false, sicht: 0, haltbar: -1.0, veraltet: UNDEF, gewarnt: false, hat_unten: hat_unten != 0 });
        let m = (METH.len() - 1) as u32;
        kl(k as u32).ktoren.push(m);
        m as i32
    }
}
/// Methode-Sichtbarkeit nachträglich (Ktoren)
#[no_mangle]
pub extern "C" fn rt_methode_haltbar(m: i32, ms: W) -> i32 {
    if ms == UNDEF { meth(m as u32).haltbar = f64::INFINITY; return 1; }
    match dauer_ms_pruefen(ms, "@Kühlschrank(haltbar: …)") {
        Some(x) => { meth(m as u32).haltbar = x; 1 }
        None => 0,
    }
}
#[no_mangle]
pub extern "C" fn rt_methode_veraltet(m: i32, grund: W) {
    let g = if grund == UNDEF { neu_str("") } else { text(grund) };
    if sig() { return; }
    meth(m as u32).veraltet = g;
}
#[no_mangle]
pub extern "C" fn rt_rezeptur(name: u32) -> i32 {
    init();
    unsafe {
        let id = REZ.len() as u32;
        let w = neu_w(Ref { art: A_REZEPTUR, id });
        REZ.push(Rezeptur { name: name_id(ptr_w(name)), basen: Vec::new(), methoden: Vec::new(), wert: w });
        KLASSEN_NAME.push((name_id(ptr_w(name)), 1, id));
        id as i32
    }
}
#[no_mangle]
pub extern "C" fn rt_rezeptur_basis(r: i32, basis_name: u32) {
    if let Some((1, b)) = klasse_eintrag(name_id(ptr_w(basis_name))) { rez(r as u32).basen.push(b); }
}
#[no_mangle]
pub extern "C" fn rt_enum(name: u32, werte: u32, n: u32) -> i32 {
    init();
    unsafe {
        let id = ENUMS.len() as u32;
        let w = neu_w(Ref { art: A_ENUMT, id });
        let mut ws = Vec::new();
        for i in 0..n {
            let t = *((werte + i * 4) as *const u32);
            ws.push(neu_w(EnumW { art: A_ENUMW, e: id, name: ptr_w(t), pos: (i + 1) as f64 }));
        }
        ENUMS.push(EnumT { name: name_id(ptr_w(name)), werte: ws, wert: w });
        KLASSEN_NAME.push((name_id(ptr_w(name)), 2, id));
        id as i32
    }
}
/// Eigener Belag; nach = Array von Text-Zeigern (n < 0: Tabellenwert verwenden)
#[no_mangle]
pub extern "C" fn rt_belag(name: u32, nach: u32, n: i32) -> W {
    init();
    let id = name_id(ptr_w(name));
    let tab = crate::pf::TABELLE.iter().find(|x| x.0 == id);
    let preis = match tab { Some(&(_, p, _)) if p == p => p, _ => 1.0 };
    let nach_v: Vec<u32> = if n < 0 { tab.map(|t| t.2.to_vec()).unwrap_or_default() } else {
        (0..n as u32).map(|i| name_id(ptr_w(unsafe { *((nach + i * 4) as *const u32) }))).collect()
    };
    let b = neu_w(Belag { art: A_BELAG, id, name: name_text(id), preis, nach: nach_v, methoden: Vec::new() });
    unsafe { crate::pf::BELAEGE.push((id, b)); }
    b
}
#[no_mangle]
pub extern "C" fn rt_belag_methode(b: W, name: u32, f: i32) -> i32 {
    unsafe {
        let id = name_id(ptr_w(name));
        METH.push(Methode { name: id, klasse: -1, belag: 0, fnid: f, statisch: false, sicht: 0, haltbar: -1.0, veraltet: UNDEF, gewarnt: false, hat_unten: false });
        let m = (METH.len() - 1) as u32;
        let be = obj::<Belag>(b);
        match be.methoden.iter_mut().find(|x| x.0 == id) { Some(x) => x.1 = m, None => be.methoden.push((id, m)) }
        m as i32
    }
}
#[no_mangle]
pub extern "C" fn rt_warnung_statisch(code: u32, t: u32, pos: i32) { unsafe { STAT_WARN.push((ptr_w(code), ptr_w(t), pos)); } }
#[no_mangle]
pub extern "C" fn rt_startfehler(code: u32, t: u32, pos: i32) { unsafe { STARTFEHLER = Some((ptr_w(code), ptr_w(t), pos)); } }

/// Gebunden-Wert einer Top-Level-Methode (globale Variable)
#[no_mangle]
pub extern "C" fn rt_global_fn(name: u32) -> W {
    neu_w(Gebunden { art: A_GEBUNDEN, klasse: -1, obj: KARTON, name: name_id(ptr_w(name)), global: 1 })
}

// ---------------------------------------------------------------- Ablauf
pub const BANNER: &str = "╔══════════════════════════════════════════════╗\n║   🍍  PIZZA-VM KERNEL PANIC  🍍              ║\n║                                              ║\n║   Fataler Fehler: ANANAS_AUF_PIZZA           ║\n║   Adresse 0xPIZZA → Ofen überhitzt           ║\n║   Der Pizzaiolo hat den Raum verlassen.      ║\n║                                              ║\n║   Core dumped → reste.kaltepizza             ║\n╚══════════════════════════════════════════════╝\nExit-Code: 39";

/// Programmablauf. vorbereiten/oben = Funktions-IDs (-1 = keine). oben liefert den Wert der globalen Variable `hauptgang`.
#[no_mangle]
pub extern "C" fn rt_lauf(vorbereiten: i32, oben: i32) -> i32 {
    init();
    let zz = z();
    zz.schritte = 0.0; zz.offset = 0.0; zz.sig = 0; zz.pos = 0; zz.tiefe = 0;
    crate::pf::neu_grenze();
    unsafe {
        for &(c, t, pos) in STAT_WARN.iter() {
            let (a, b) = pos_zs(pos);
            if warn_neu(None, c, a, b) { crate::host_warnung(bytes(c), bytes(t), a, b); }
        }
        if let Some((c, t, pos)) = STARTFEHLER {
            let (a, b) = pos_zs(pos);
            crate::host_fehler(1, bytes(c), bytes(t), a, b);
            return 2;
        }
    }
    'lauf: {
        if vorbereiten >= 0 { rufe_tab(vorbereiten as u32, 0, KARTON, KARTON, &[]); if sig() { break 'lauf; } }
        let hg = if oben >= 0 { rufe_tab(oben as u32, 0, KARTON, KARTON, &[]) } else { UNDEF };
        if sig() { break 'lauf; }
        // hauptgang suchen
        let mut haupt: i64 = -1;
        unsafe {
            for &k in USER_KLASSEN.iter() {
                if let Some(l) = kl(k).methoden.iter().find(|x| x.0 == N_HAUPTGANG) { haupt = l.1[0] as i64; break; }
            }
        }
        if haupt < 0 && art(hg) == A_GEBUNDEN { let g = obj::<Gebunden>(hg); let l = gebunden_liste(g); if !l.is_empty() { haupt = l[0] as i64; } }
        if haupt >= 0 {
            let m = haupt as u32;
            unsafe { if let Some(&(_, p)) = METH_POS.iter().find(|x| x.0 == m) { zz.pos = p; } }
            let me = meth(m);
            let np = if me.fnid >= 0 { fnx(me.fnid as u32).params.len() } else { 0 };
            let args = unsafe { blech(crate::ARGS.clone()) };
            let pos: Vec<W> = if np > 0 { alloc::vec![args] } else { Vec::new() };
            let dies = if me.statisch || me.klasse < 0 { KARTON } else { instanziiere(me.klasse as u32, &[], &[], 0) };
            if sig() { break 'lauf; }
            rufe_decl(m, dies, &pos, &[], 0, 0);
            if sig() { break 'lauf; }
        }
        crate::pf::lieferungen_nach_ende();
        if !sig() { crate::theke::ui_flush(); }
    }
    ende()
}

fn ende() -> i32 {
    let s = z().sig;
    if s == 0 { return 0; }
    unsafe {
        match s {
            SIG_PANIK => { crate::host_panik(BANNER.as_bytes()); 39 }
            SIG_PF => {
                let mut t = Tb::neu();
                t.s("PizzaFehler ").s(PF_CODE).s(": ").t(PF_TEXT);
                let (a, b) = pos_zs(PF_POS);
                crate::host_fehler(1, PF_CODE.as_bytes(), &t.0, a, b);
                2
            }
            SIG_LIMIT => {
                let (a, b) = pos_zs(z().pos);
                crate::host_fehler(3, b"P0002", "PizzaFehler P0002: Die Pizza ist noch im Ofen. (Schrittlimit erreicht – Endlosschleife?)".as_bytes(), a, b);
                3
            }
            SIG_ANANAS => {
                let o = WURF_OBJ;
                let pos = WURF_POS;
                z().sig = 0;
                let ob = obj::<Obj>(o);
                let mut t = Tb::neu();
                t.s("Ungefangene Ananas – ");
                if ist_ananas_klasse(ob.klasse as i32) {
                    t.name(kl(ob.klasse).name).s(": ").t(text(ob.nachricht));
                } else {
                    let b = obj_text(o);
                    if sig() { z().sig = 0; t.name(kl(ob.klasse).name).s("@").n(ob.nr); } else { t.t(b); }
                }
                let (a, b) = pos_zs(pos);
                if a > 0 { t.s(" (Zeile ").n(a as f64).s(")"); }
                crate::host_fehler(2, bytes(name_text(kl(ob.klasse).name)), &t.0, a, b);
                1
            }
            _ => {
                let (a, b) = pos_zs(z().pos);
                let mut t = Tb::neu();
                t.s("Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen: [object Object]");
                if a > 0 { t.s(" (Zeile ").n(a as f64).s(")"); }
                crate::host_fehler(2, b"LaufzeitAnanas", &t.0, a, b);
                1
            }
        }
    }
}
