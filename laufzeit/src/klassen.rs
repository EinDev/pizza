//! Objektmodell: Klassen, Methoden, Felder, Aufrufe (Port von registriere/instanziiere/rufeDecl/…).

use crate::namen::*;
use crate::ops::*;
use crate::text::*;
use crate::wert::*;
use crate::{args_pop, args_push, z};
use alloc::vec::Vec;

pub struct Param { pub name: u32, pub typ: u32, pub nie_karton: bool, pub gebacken: bool }
pub struct FnInfo { pub tab: u32, pub params: Vec<Param>, pub name: u32 }
pub struct Methode {
    pub name: u32, pub klasse: i32, pub belag: i32, pub fnid: i32, pub statisch: bool, pub sicht: u8,
    pub haltbar: f64, pub veraltet: W, pub gewarnt: bool, pub hat_unten: bool,
}
pub struct FeldInfo { pub name: u32, pub typ: u32, pub gebacken: bool, pub sicht: u8, pub klasse: u32 }
pub struct Klasse {
    pub name: u32, pub basis: i32, pub erfuellt: Vec<u32>, pub rohling: bool, pub gebacken: bool, pub calzone: bool,
    pub eingebaut: bool, pub felder: Vec<u32>, pub feld_init: i32, pub statisch: Vec<(u32, u32)>,
    pub methoden: Vec<(u32, Vec<u32>)>, pub ktoren: Vec<u32>, pub zaehler: f64, pub wert: W,
}
pub struct Rezeptur { pub name: u32, pub basen: Vec<u32>, pub methoden: Vec<u32>, pub wert: W }
pub struct EnumT { pub name: u32, pub werte: Vec<W>, pub wert: W }

pub const SICHT_GEHEIM: u8 = 1;
pub const MAX_STAPEL: i32 = 1500;
pub const SICHT_FAMILIE: u8 = 2;

pub static mut FNS: Vec<FnInfo> = Vec::new();
pub static mut METH: Vec<Methode> = Vec::new();
pub static mut FELDINFO: Vec<FeldInfo> = Vec::new();
pub static mut KLASSEN: Vec<Klasse> = Vec::new();
pub static mut REZ: Vec<Rezeptur> = Vec::new();
pub static mut ENUMS: Vec<EnumT> = Vec::new();
/// Namensauflösung wie `this.klassen` (Map: spätere Einträge überschreiben): (name, art 0=Klasse 1=Rezeptur 2=Enum, idx)
pub static mut KLASSEN_NAME: Vec<(u32, u8, u32)> = Vec::new();
/// Statische Feld-Variablen
pub static mut STATFELD: Vec<Feld> = Vec::new();
/// Top-Level-Methoden: name → Methoden
pub static mut GLOBAL_FN: Vec<(u32, Vec<u32>)> = Vec::new();
pub static mut INSTANZEN: f64 = 0.0;

#[inline] pub fn kl(i: u32) -> &'static mut Klasse { unsafe { &mut KLASSEN[i as usize] } }
#[inline] pub fn meth(i: u32) -> &'static mut Methode { unsafe { &mut METH[i as usize] } }
#[inline] pub fn fnx(i: u32) -> &'static mut FnInfo { unsafe { &mut FNS[i as usize] } }
#[inline] pub fn finfo(i: u32) -> &'static FeldInfo { unsafe { &FELDINFO[i as usize] } }
#[inline] pub fn rez(i: u32) -> &'static mut Rezeptur { unsafe { &mut REZ[i as usize] } }
#[inline] pub fn enm(i: u32) -> &'static mut EnumT { unsafe { &mut ENUMS[i as usize] } }

pub fn klasse_eintrag(name: u32) -> Option<(u8, u32)> {
    unsafe {
        for &(n, a, i) in KLASSEN_NAME.iter().rev() { if n == name { return Some((a, i)); } }
    }
    None
}
pub fn klasse_nach_name(name: u32) -> Option<i32> {
    match klasse_eintrag(name) { Some((0, i)) => Some(i as i32), _ => None }
}
pub fn klasse_wert(name: u32) -> Option<W> {
    match klasse_eintrag(name) {
        Some((0, i)) => Some(kl(i).wert),
        Some((1, i)) => Some(rez(i).wert),
        Some((2, i)) => Some(enm(i).wert),
        _ => None,
    }
}

pub fn neue_klasse(name: u32, eingebaut: bool) -> u32 {
    unsafe {
        let id = KLASSEN.len() as u32;
        let wert = neu_w(Ref { art: A_KLASSE, id });
        KLASSEN.push(Klasse {
            name, basis: -1, erfuellt: Vec::new(), rohling: false, gebacken: false, calzone: false, eingebaut,
            felder: Vec::new(), feld_init: -1, statisch: Vec::new(), methoden: Vec::new(), ktoren: Vec::new(), zaehler: 0.0, wert,
        });
        KLASSEN_NAME.push((name, 0, id));
        id
    }
}

pub fn eingebaute_klassen() {
    unsafe {
        if !KLASSEN.is_empty() { return; }
        for (i, &(n, b)) in ANANAS_BAUM.iter().enumerate() {
            let k = neue_klasse(n, true);
            let _ = i;
            kl(k).basis = b;
        }
    }
}

// ---------------------------------------------------------------- Hierarchie
pub fn ist_ananas_klasse(k: i32) -> bool {
    let mut c = k;
    while c >= 0 { if c as u32 == K_ANANAS { return true; } c = kl(c as u32).basis; }
    false
}
pub fn ist_calzone(k: i32) -> bool {
    let mut c = k;
    while c >= 0 { if kl(c as u32).calzone { return true; } c = kl(c as u32).basis; }
    false
}
pub fn rezeptur_erbt(r: u32, ziel: u32) -> bool {
    if r == ziel { return true; }
    for &b in rez(r).basen.iter() { if rezeptur_erbt(b, ziel) { return true; } }
    false
}
/// instanzVon(v, k) für Eintrag (art, idx)
pub fn instanz_von(v: W, e: (u8, u32)) -> bool {
    match e.0 {
        0 => {
            if art(v) != A_OBJ { return false; }
            let mut c = obj::<Obj>(v).klasse as i32;
            while c >= 0 { if c as u32 == e.1 { return true; } c = kl(c as u32).basis; }
            false
        }
        2 => art(v) == A_ENUMW && obj::<EnumW>(v).e == e.1,
        _ => {
            if art(v) != A_OBJ { return false; }
            let mut c = obj::<Obj>(v).klasse as i32;
            while c >= 0 {
                for &r in kl(c as u32).erfuellt.iter() { if rezeptur_erbt(r, e.1) { return true; } }
                c = kl(c as u32).basis;
            }
            false
        }
    }
}

pub fn finde_methode_liste(k: i32, name: u32) -> Option<(u32, &'static Vec<u32>)> {
    let mut c = k;
    while c >= 0 {
        for (n, l) in kl(c as u32).methoden.iter() { if *n == name { return Some((c as u32, l)); } }
        c = kl(c as u32).basis;
    }
    None
}
pub fn methoden_von(k: u32, name: u32) -> &'static Vec<u32> {
    for (n, l) in kl(k).methoden.iter() { if *n == name { return l; } }
    unreachable_vec()
}
fn unreachable_vec() -> &'static Vec<u32> { static mut L: Vec<u32> = Vec::new(); unsafe { &L } }
pub fn global_liste(name: u32) -> Option<&'static Vec<u32>> {
    unsafe { for (n, l) in GLOBAL_FN.iter() { if *n == name { return Some(l); } } }
    None
}

pub fn waehle(l: &[u32], n: usize) -> u32 {
    if l.len() == 1 { return l[0]; }
    for &m in l { let me = meth(m); if me.fnid >= 0 && fnx(me.fnid as u32).params.len() == n { return m; } if me.fnid < 0 && param_anzahl(m) == n { return m; } }
    l[0]
}
pub static mut ROHLING_PARAMS: Vec<(u32, u32)> = Vec::new();
fn param_anzahl(m: u32) -> usize { unsafe { for &(mm, n) in ROHLING_PARAMS.iter() { if mm == m { return n as usize; } } } 0 }

pub fn statisches_feld(k: i32, name: u32) -> Option<u32> {
    let mut c = k;
    while c >= 0 {
        for &(n, i) in kl(c as u32).statisch.iter() { if n == name { return Some(i); } }
        c = kl(c as u32).basis;
    }
    None
}
#[inline] pub fn statfeld(i: u32) -> &'static mut Feld { unsafe { &mut STATFELD[i as usize] } }

pub fn obj_feld(o: W, name: u32) -> Option<&'static mut Feld> {
    let ob = obj::<Obj>(o);
    for fe in ob.felder.iter_mut() { if finfo(fe.info).name == name { return Some(fe); } }
    None
}

// ---------------------------------------------------------------- Typprüfung
pub fn standard_wert(typ: u32) -> W {
    match typ { N_SALAMI | N_FUNGHI => zahl(0.0), N_DIAVOLO => NEIN, _ => KARTON }
}

/// pruefeTyp(typ, v, name) – typ = Namens-ID des Typs (0 = keine Prüfung)
pub fn pruefe_typ(typ: u32, v: W, name: u32) -> bool {
    if typ == 0 { return true; }
    let was: &str;
    let mut was_k: u32 = 0;
    match typ {
        N_SALAMI => {
            if ist_zahl(v) && crate::zahl::ist_ganz(f(v)) { return true; }
            was = if ist_zahl(v) { "keine Ganzzahl" } else { "keine Zahl" };
        }
        N_FUNGHI => { if ist_zahl(v) { return true; } was = "keine Zahl"; }
        N_MARGHERITA => { if art(v) == A_TEXT || v == KARTON { return true; } was = "kein Text"; }
        N_DIAVOLO => { if ist_bool(v) { return true; } was = "kein Wahrheitswert"; }
        N_HAWAII => { wirf_panik(); return false; }
        N_G_DAUER => { if v == KARTON || art(v) == A_DAUER { return true; } was = "keine Dauer"; }
        N_G_PIZZA => { if v == KARTON || art(v) == A_PIZZA { return true; } was = "keine Pizza"; }
        N_G_ZUFALL => {
            if v == KARTON || crate::vorrat::ist_zufall(v) || klasse_eintrag(typ).is_some() { return true; }
            was = "kein Zufall";
        }
        N_G_VORRATSKAMMER if klasse_eintrag(typ).is_none() => {
            if v == KARTON || crate::vorrat::ist_kammer(v) { return true; }
            was = "keine Vorratskammer";
        }
        _ => {
            if klasse_eintrag(typ).is_none() {
                if let Some(ok) = crate::theke::typ_passt(typ, v) {
                    if v == KARTON || ok { return true; }
                    let mut t = Tb::neu();
                    t.s("'").name(name).s("' ist ").name(typ).s(", aber der Wert ");
                    darstellung(v, &mut t);
                    if crate::sig() { return false; }
                    t.s(" ist kein(e) ").name(typ).s(".");
                    wirf_tb(K_TYP, &t);
                    return false;
                }
            }
            let e = match klasse_eintrag(typ) { None => return true, Some(e) => e };
            if v == KARTON || instanz_von(v, e) { return true; }
            was = "kein(e) ";
            was_k = match e.0 { 0 => kl(e.1).name, 1 => rez(e.1).name, _ => enm(e.1).name };
        }
    }
    let mut t = Tb::neu();
    t.s("'").name(name).s("' ist ").name(typ).s(", aber der Wert ");
    darstellung(v, &mut t);
    if crate::sig() { return false; }
    t.s(" ist ").s(was);
    if was_k != 0 { t.name(was_k); }
    t.s(".");
    wirf_tb(K_TYP, &t);
    false
}

// ---------------------------------------------------------------- Zugriff
pub fn pruefe_zugriff(fi: &FeldInfo, o: W, ctxk: i32, name: u32) -> bool {
    if fi.sicht == 0 { return true; }
    if fi.sicht == SICHT_GEHEIM {
        if ctxk == fi.klasse as i32 { return true; }
        if art(o) == A_OBJ && obj::<Obj>(o).zugeklappt == 0 && ist_calzone(obj::<Obj>(o).klasse as i32) { return true; }
        let mut t = Tb::neu();
        t.s("'").name(name).s("' ist geheimrezept in '").name(kl(fi.klasse).name).s("' – Zugriff verweigert.");
        wirf_tb(K_ZUGRIFFS, &t);
        return false;
    }
    let mut k = ctxk;
    while k >= 0 { if k as u32 == fi.klasse { return true; } k = kl(k as u32).basis; }
    if art(o) == A_OBJ && obj::<Obj>(o).zugeklappt == 0 && ist_calzone(obj::<Obj>(o).klasse as i32) { return true; }
    let mut t = Tb::neu();
    t.s("'").name(name).s("' ist familienrezept in '").name(kl(fi.klasse).name).s("' – nur für die Familie.");
    wirf_tb(K_ZUGRIFFS, &t);
    false
}

pub fn pruefe_methoden_zugriff(m: u32, ctxk: i32) -> bool {
    let me = meth(m);
    if me.sicht == 0 || me.klasse < 0 { return true; }
    if me.sicht == SICHT_GEHEIM {
        if ctxk == me.klasse { return true; }
        let mut t = Tb::neu();
        t.s("Methode '").name(me.name).s("' ist geheimrezept in '").name(kl(me.klasse as u32).name).s("' – Zugriff verweigert.");
        wirf_tb(K_ZUGRIFFS, &t);
        return false;
    }
    let mut k = ctxk;
    while k >= 0 { if k == me.klasse { return true; } k = kl(k as u32).basis; }
    let mut t = Tb::neu();
    t.s("Methode '").name(me.name).s("' ist familienrezept in '").name(kl(me.klasse as u32).name).s("' – nur für die Familie.");
    wirf_tb(K_ZUGRIFFS, &t);
    false
}

// ---------------------------------------------------------------- Aufrufe
pub type Ben = [(u32, W)];

pub fn anzahl(pos: &[W], ben: &Ben) -> usize { pos.len() + ben.len() }

fn erwartet_meldung(prefix: &dyn Fn(&mut Tb), n: usize, bekam: usize) {
    let mut t = Tb::neu();
    prefix(&mut t);
    t.s(" erwartet ").n(n as f64).s(if n == 1 { " Argument" } else { " Argumente" }).s(", bekam ").n(bekam as f64).s(".");
    wirf_tb(K_LAUFZEIT, &t);
}

/// bindeParameter → gebundene Argumente in Parameterreihenfolge, direkt auf dem Argumentstapel (Zeiger)
pub fn binde(fnid: u32, pos: &[W], ben: &Ben, prefix: &dyn Fn(&mut Tb), strikt: bool) -> Option<u32> {
    let ps = &fnx(fnid).params;
    for &(k, _) in ben.iter() {
        if !ps.iter().any(|p| p.name == k) {
            let mut t = Tb::neu();
            prefix(&mut t);
            t.s(" hat keinen Parameter '").name(k).s("'.");
            wirf_tb(K_LAUFZEIT, &t);
            return None;
        }
    }
    if strikt && pos.len() > ps.len() { erwartet_meldung(prefix, ps.len(), anzahl(pos, ben)); return None; }
    let blk = crate::rt_args(ps.len() as u32);
    for (i, p) in ps.iter().enumerate() {
        let v = if i < pos.len() { pos[i] } else {
            match ben.iter().rev().find(|(n, _)| *n == p.name) {
                Some(&(_, w)) => w,
                None => { if strikt { args_pop(blk); erwartet_meldung(prefix, ps.len(), anzahl(pos, ben)); return None; } KARTON }
            }
        };
        if p.nie_karton && v == KARTON {
            args_pop(blk);
            let mut t = Tb::neu();
            t.s("Parameter '").name(p.name).s("' ist @NieKarton – aber es kam ein leerer Karton.");
            wirf_tb(K_LEERERKARTON, &t);
            return None;
        }
        if p.typ != 0 && !pruefe_typ(p.typ, v, p.name) { args_pop(blk); return None; }
        unsafe { *((blk + 8 * i as u32) as *mut W) = v; }
    }
    Some(blk)
}

/// Ruft eine kompilierte Funktion mit bereits auf dem Argumentstapel liegenden Argumenten (gibt sie danach frei).
pub fn rufe_tab_p(fnid: u32, env: u32, dies: W, unten: W, p: u32) -> W {
    let tab = fnx(fnid).tab;
    let fp: extern "C" fn(i32, i64, i64, i32) -> i64 = unsafe { core::mem::transmute(tab as usize) };
    let r = fp(env as i32, dies as i64, unten as i64, p as i32) as u64;
    args_pop(p);
    r
}

/// Ruft eine kompilierte Funktion (Tabellenindex) mit gebundenen Argumenten.
pub fn rufe_tab(fnid: u32, env: u32, dies: W, unten: W, args: &[W]) -> W {
    let tab = fnx(fnid).tab;
    let p = args_push(args);
    let fp: extern "C" fn(i32, i64, i64, i32) -> i64 = unsafe { core::mem::transmute(tab as usize) };
    let r = fp(env as i32, dies as i64, unten as i64, p as i32) as u64;
    args_pop(p);
    r
}

pub fn methode_prefix(m: u32) -> impl Fn(&mut Tb) { move |t: &mut Tb| { t.s("Methode '").name(meth(m).name).s("'"); } }

/// fuehreAus(m, ctx, pos, ben)
pub fn fuehre_aus(m: u32, dies: W, unten: W, pos: &[W], ben: &Ben) -> W {
    let fnid = meth(m).fnid as u32;
    let p = match binde(fnid, pos, ben, &methode_prefix(m), true) { Some(a) => a, None => return KARTON };
    rufe_tab_p(fnid, 0, dies, unten, p)
}

/// rufeDecl(m, dies, pos, ben, node, modus) – modus 0 normal, 1 mikrowelle, 2 frisch
pub fn rufe_decl(m: u32, dies: W, pos: &[W], ben: &Ben, knoten: i32, modus: u32) -> W {
    let me = meth(m);
    if me.veraltet != UNDEF && !me.gewarnt {
        me.gewarnt = true;
        let mut t = Tb::neu();
        t.s("Methode '").name(me.name).s("' ist veraltet.");
        if crate::text::bytes(me.veraltet).len() > 0 { t.s(" Grund: ").t(me.veraltet); }
        unsafe { crate::kueche::WARN_METH = m as i32; }
        crate::start::warnung_w("W0003", t.fertig(), knoten);
        unsafe { crate::kueche::WARN_METH = -1; }
    }
    if me.fnid < 0 {
        let mut t = Tb::neu();
        t.s("Methode '").name(me.name).s("' ist ein Rohling – sie hat keinen Rumpf.");
        wirf_tb(K_ROHLING, &t);
        return KARTON;
    }
    if me.haltbar >= 0.0 || modus != 0 { return crate::pf::kuehlschrank(m, dies, pos, ben, knoten, modus); }
    if !me.statisch && dies == KARTON && me.klasse >= 0 {
        braucht_instanz(m);
        return KARTON;
    }
    fuehre_aus(m, if me.statisch { KARTON } else { dies }, KARTON, pos, ben)
}
pub fn braucht_instanz(m: u32) {
    let mut t = Tb::neu();
    t.s("Methode '").name(meth(m).name).s("' braucht eine Pizza-Instanz (dies) – sie ist nicht tiefkühl.");
    wirf_tb(K_LAUFZEIT, &t);
}

/// rufeLambda
pub fn rufe_lambda(fw: W, pos: &[W], ben: &Ben) -> W {
    let fo = obj::<Funktion>(fw);
    let blk = match binde(fo.fnid, pos, ben, &|t: &mut Tb| { t.s("Die Funktion"); }, false) { Some(a) => a, None => return KARTON };
    rufe_tab_p(fo.fnid, p(fw), fo.dies, fo.unten, blk)
}

pub fn gebunden_liste(g: &Gebunden) -> &'static Vec<u32> {
    if g.global != 0 { global_liste(g.name).unwrap_or(unreachable_vec()) } else { methoden_von(g.klasse as u32, g.name) }
}

/// rufe(f, pos, ben, node)
pub fn rufe(fw: W, pos: &[W], ben: &Ben, knoten: i32) -> W {
    match art(fw) {
        A_FUNKTION => rufe_lambda(fw, pos, ben),
        A_GEBUNDEN => {
            let g = obj::<Gebunden>(fw);
            let l = gebunden_liste(g);
            rufe_decl(waehle(l, anzahl(pos, ben)), g.obj, pos, ben, knoten, 0)
        }
        A_NATIV => {
            let t = crate::z().tiefe;
            if t + 1 > MAX_STAPEL { crate::programm::rt_stapel(); return KARTON; }
            crate::z().tiefe = t + 1;
            let r = crate::std_m::nativ_rufen(fw, pos, ben, knoten);
            crate::z().tiefe = t;
            r
        }
        _ => {
            if fw == KARTON || fw == UNDEF { wirf_leer(); return KARTON; }
            let mut t = Tb::neu();
            darstellung(fw, &mut t);
            t.s(" ist keine Funktion – das kann man nicht aufrufen.");
            wirf_tb(K_TYP, &t);
            KARTON
        }
    }
}

/// objMethode(o, name, pos, ben, node, sc)
pub fn obj_methode(o: W, name: u32, pos: &[W], ben: &Ben, knoten: i32, ctxk: i32, mit_sc: bool) -> W {
    let ob = obj::<Obj>(o);
    if let Some((_, l)) = finde_methode_liste(ob.klasse as i32, name) {
        let m = waehle(l, anzahl(pos, ben));
        if meth(m).sicht != 0 && mit_sc && !pruefe_methoden_zugriff(m, ctxk) { return KARTON; }
        return rufe_decl(m, o, pos, ben, knoten, 0);
    }
    if let Some(fe) = obj_feld(o, name) {
        if ist_funktion(fe.w) { return rufe(fe.w, pos, ben, knoten); }
    }
    if let Some(r) = crate::std_m::ananas_obj_methode(o, name, pos, ben, knoten) { return r; }
    let mut t = Tb::neu();
    t.s("Methode '").name(name).s("' gibt es auf ").name(kl(ob.klasse).name).s(" nicht.");
    wirf_tb(K_LAUFZEIT, &t);
    KARTON
}

/// statischerAufruf(k, name, …)
pub fn statischer_aufruf(k: u32, name: u32, pos: &[W], ben: &Ben, knoten: i32, ctxk: i32, ctxd: W, mit_sc: bool) -> W {
    if let Some((_, l)) = finde_methode_liste(k as i32, name) {
        let m = waehle(l, anzahl(pos, ben));
        if meth(m).sicht != 0 && mit_sc && !pruefe_methoden_zugriff(m, ctxk) { return KARTON; }
        let me = meth(m);
        let mut dies = KARTON;
        if !me.statisch && mit_sc && art(ctxd) == A_OBJ && instanz_von(ctxd, (0, me.klasse as u32)) { dies = ctxd; }
        return rufe_decl(m, dies, pos, ben, knoten, 0);
    }
    if let Some(i) = statisches_feld(k as i32, name) {
        let w = statfeld(i).w;
        if ist_funktion(w) { return rufe(w, pos, ben, knoten); }
    }
    let mut t = Tb::neu();
    t.s("Methode '").name(name).s("' gibt es in Klasse ").name(kl(k).name).s(" nicht.");
    wirf_tb(K_LAUFZEIT, &t);
    KARTON
}

/// rufeMethode(o, name, pos, ben, node, sc)
pub fn rufe_methode(o: W, name: u32, pos: &[W], ben: &Ben, knoten: i32, ctxk: i32, ctxd: W, mit_sc: bool) -> W {
    if o == KARTON || o == UNDEF { wirf_leer(); return KARTON; }
    match art(o) {
        A_OBJ => obj_methode(o, name, pos, ben, knoten, ctxk, mit_sc),
        A_PIZZA => { let n = obj::<Pizza>(o).s.len(); crate::pf::pizza_aufruf(o, n, name, pos, ben, knoten) }
        A_SICHT => { let si = obj::<Sicht>(o); crate::pf::pizza_aufruf(si.pizza, si.k as usize, name, pos, ben, knoten) }
        A_KLASSE => statischer_aufruf(obj::<Ref>(o).id, name, pos, ben, knoten, ctxk, ctxd, mit_sc),
        A_ENUMT => {
            if name == N_WERTE { return blech(enm(obj::<Ref>(o).id).werte.clone()); }
            let mut t = Tb::neu();
            t.s("Methode '").name(name).s("' gibt es bei ").name(enm(obj::<Ref>(o).id).name).s(" nicht.");
            wirf_tb(K_LAUFZEIT, &t);
            KARTON
        }
        A_REZEPTUR => { wirf_ananas(K_LAUFZEIT, "Eine Rezeptur kann man nicht aufrufen – sie ist nur ein Rezept."); KARTON }
        _ => crate::std_m::tabellen_methode(o, name, pos, ben, knoten, true),
    }
}

// ---------------------------------------------------------------- Objekte
pub fn instanziiere(k: u32, pos: &[W], ben: &Ben, knoten: i32) -> W {
    if kl(k).rohling { wirf_ananas(K_ROHLING, "Ein Rohling ist nicht essbar."); return KARTON; }
    unsafe { INSTANZEN += 1.0; }
    let mut kette = Vec::new();
    let mut c = k as i32;
    while c >= 0 { kette.push(c as u32); c = kl(c as u32).basis; }
    let mut felder: Vec<Feld> = Vec::new();
    let o = neu_w(Obj { art: A_OBJ, klasse: k, nr: unsafe { INSTANZEN }, felder: Vec::new(), zugeklappt: ist_calzone(k as i32) as u32, nachricht: neu_str(""), cache: 0 });
    for &c in kette.iter().rev() {
        for &fi in kl(c).felder.iter() {
            let info = finfo(fi);
            let fe = Feld { w: standard_wert(info.typ), info: fi, besitzer: p(o) };
            match felder.iter_mut().find(|x| finfo(x.info).name == info.name) {
                Some(x) => *x = fe,
                None => felder.push(fe),
            }
        }
    }
    obj::<Obj>(o).felder = felder;
    konstruiere(k, o, pos, ben, knoten);
    o
}

pub fn konstruiere(k: u32, o: W, pos: &[W], ben: &Ben, knoten: i32) {
    if crate::sig() { return; }
    let kk = kl(k);
    if k == K_ANANAS && kk.eingebaut {
        obj::<Obj>(o).nachricht = if !pos.is_empty() && pos[0] != KARTON { text(pos[0]) } else { neu_str("") };
        return;
    }
    if kk.ktoren.is_empty() {
        if kk.basis >= 0 { konstruiere(kk.basis as u32, o, pos, ben, knoten); }
        else if !pos.is_empty() || !ben.is_empty() {
            let mut t = Tb::neu();
            t.s("Klasse '").name(kk.name).s("' hat keinen Konstruktor, bekam aber Argumente.");
            wirf_tb(K_LAUFZEIT, &t);
            return;
        }
        if crate::sig() { return; }
        feld_init(k, o);
        return;
    }
    let m = waehle(&kk.ktoren, anzahl(pos, ben));
    let fnid = meth(m).fnid as u32;
    let blk = match binde(fnid, pos, ben, &|t: &mut Tb| { t.s("Konstruktor von '").name(kl(k).name).s("'"); }, true) { Some(a) => a, None => return };
    if !meth(m).hat_unten {
        if kk.basis >= 0 { konstruiere(kk.basis as u32, o, &[], &[], knoten); if crate::sig() { args_pop(blk); return; } }
        feld_init(k, o);
        if crate::sig() { args_pop(blk); return; }
    }
    rufe_tab_p(fnid, 0, o, KARTON, blk);
}

pub fn feld_init(k: u32, o: W) {
    let fi = kl(k).feld_init;
    if fi >= 0 { rufe_tab(fi as u32, 0, o, KARTON, &[]); }
}

// ---------------------------------------------------------------- Exports für den Programmcode

#[inline]
pub fn ben_von(namen: u32, werte: u32, n: u32) -> Vec<(u32, W)> {
    let mut r = Vec::with_capacity(n as usize);
    for i in 0..n {
        let nt = unsafe { *((namen + i * 4) as *const u32) };
        let w = unsafe { *((werte + i * 8) as *const W) };
        // spätere gleichnamige überschreiben (Objekt-Semantik), Reihenfolge der ersten Nennung bleibt
        let id = name_id(ptr_w(nt));
        match r.iter_mut().find(|(k, _): &&mut (u32, W)| *k == id) { Some(x) => x.1 = w, None => r.push((id, w)) }
    }
    r
}

/// Methodenaufruf `o.name(args)`. args: npos Werte, dann nben Werte (Namen in bennamen).
#[no_mangle]
pub extern "C" fn rt_mcall(o: W, name: u32, args: u32, npos: u32, bennamen: u32, nben: u32, knoten: i32, ctxk: i32, ctxd: W) -> W {
    let pos = crate::args_von(args, npos);
    let ben = ben_von(bennamen, args + npos * 8, nben);
    let r = rufe_methode(o, name_id(ptr_w(name)), pos, &ben, knoten, ctxk, ctxd, true);
    args_pop(args);
    crate::speicher_pruefen();
    r
}

/// Funktionswert aufrufen `f(args)`
#[no_mangle]
pub extern "C" fn rt_rufe(fw: W, args: u32, npos: u32, bennamen: u32, nben: u32, knoten: i32) -> W {
    let pos = crate::args_von(args, npos);
    let ben = ben_von(bennamen, args + npos * 8, nben);
    let r = rufe(fw, pos, &ben, knoten);
    args_pop(args);
    crate::speicher_pruefen();
    r
}

/// aufrufZiel ohne lokale Variablen: Methoden des Kontexts / Pizza-Methoden. UNDEF → Name als Wert auflösen.
#[no_mangle]
pub extern "C" fn rt_ncall_ziel(name: u32, ctxd: W, ctxk: i32) -> W {
    let id = name_id(ptr_w(name));
    if ctxk >= 0 {
        let d = art(ctxd) == A_OBJ;
        let start = if d { obj::<Obj>(ctxd).klasse as i32 } else { ctxk };
        let mut gef = finde_methode_liste(start, id);
        if gef.is_none() && d { gef = finde_methode_liste(ctxk, id); }
        if let Some((k, _)) = gef { return MLISTE | ((k as u64) << 16) | id as u64; }
    } else if art(ctxd) == A_PIZZA {
        if crate::pf::pizza_hat_methode(ctxd, id) { return PIZZAM | id as u64; }
    }
    UNDEF
}

/// namenAufruf mit aufgelöstem Ziel
#[no_mangle]
pub extern "C" fn rt_rufe_ziel(fw: W, args: u32, npos: u32, bennamen: u32, nben: u32, knoten: i32, ctxd: W, ctxk: i32) -> W {
    let pos = crate::args_von(args, npos);
    let ben = ben_von(bennamen, args + npos * 8, nben);
    let r = if (fw >> 32) == (MLISTE >> 32) {
        let k = ((fw >> 16) & 0xFFFF) as u32;
        let id = (fw & 0xFFFF) as u32;
        let l = methoden_von(k, id);
        let dobj = if art(ctxd) == A_OBJ { ctxd } else { KARTON };
        let m = waehle(l, anzahl(pos, &ben));
        if meth(l[0]).sicht != 0 && !pruefe_methoden_zugriff(m, ctxk) { KARTON } else { rufe_decl(m, dobj, pos, &ben, knoten, 0) }
    } else if (fw >> 32) == (PIZZAM >> 32) {
        let id = (fw & 0xFFFF_FFFF) as u32;
        let n = obj::<Pizza>(ctxd).s.len();
        crate::pf::pizza_aufruf(ctxd, n, id, pos, &ben, knoten)
    } else if art(fw) == A_GEBUNDEN && {
        let g = obj::<Gebunden>(fw);
        let l = gebunden_liste(g);
        !l.is_empty() && meth(l[0]).sicht != 0
    } {
        let g = obj::<Gebunden>(fw);
        let l = gebunden_liste(g);
        let m = waehle(l, anzahl(pos, &ben));
        if !pruefe_methoden_zugriff(m, ctxk) { KARTON } else { rufe_decl(m, g.obj, pos, &ben, knoten, 0) }
    } else {
        rufe(fw, pos, &ben, knoten)
    };
    args_pop(args);
    crate::speicher_pruefen();
    r
}

/// Liest ein Feld des Kontexts (feldImKontext + weg-Prüfung); UNDEF = nicht gefunden.
#[no_mangle]
pub extern "C" fn rt_feld_ctx(name: u32, ctxd: W, ctxk: i32) -> W {
    let id = name_id(ptr_w(name));
    match feld_ctx_ziel(id, ctxd, ctxk) {
        None => UNDEF,
        Some(fe) => {
            if crate::sig() { return KARTON; }
            if fe.w == WEG { wirf_weg(id); return KARTON; }
            fe.w
        }
    }
}

/// feldImKontext(ctx, name) → Feld (mit Zugriffsprüfung bei geheimrezept)
pub fn feld_ctx_ziel(id: u32, ctxd: W, ctxk: i32) -> Option<&'static mut Feld> {
    if art(ctxd) == A_OBJ {
        if let Some(fe) = obj_feld(ctxd, id) {
            let fi = finfo(fe.info);
            if fi.sicht == SICHT_GEHEIM && fi.klasse as i32 != ctxk { pruefe_zugriff(fi, ctxd, ctxk, id); }
            return Some(fe);
        }
    }
    if let Some(i) = statisches_feld(ctxk, id) {
        let fe = statfeld(i);
        let fi = finfo(fe.info);
        if fi.sicht == SICHT_GEHEIM && fi.klasse as i32 != ctxk { pruefe_zugriff(fi, KARTON, ctxk, id); }
        return Some(fe);
    }
    None
}

/// Zuweisungsziel im Kontext: liefert Zeiger auf das Feld (0 = nicht gefunden)
#[no_mangle]
pub extern "C" fn rt_feld_ctx_ziel(name: u32, ctxd: W, ctxk: i32) -> u32 {
    let id = name_id(ptr_w(name));
    match feld_ctx_ziel(id, ctxd, ctxk) { None => 0, Some(fe) => fe as *mut Feld as u32 }
}

/// zielVar für `a.b`: Feld eines Objekts oder einer Klasse
#[no_mangle]
pub extern "C" fn rt_mem_ziel(o: W, name: u32, ctxk: i32) -> u32 {
    let id = name_id(ptr_w(name));
    if o == KARTON || o == UNDEF { wirf_leer(); return 0; }
    match art(o) {
        A_OBJ => {
            let fe: &mut Feld = match obj_feld(o, id) {
                Some(fe) => fe,
                None => match statisches_feld(obj::<Obj>(o).klasse as i32, id) {
                    Some(i) => statfeld(i),
                    None => {
                        let mut t = Tb::neu();
                        t.s("Feld '").name(id).s("' gibt es auf ").name(kl(obj::<Obj>(o).klasse).name).s(" nicht.");
                        wirf_tb(K_LAUFZEIT, &t);
                        return 0;
                    }
                },
            };
            let fi = finfo(fe.info);
            if fi.sicht != 0 && !pruefe_zugriff(fi, o, ctxk, id) { return 0; }
            fe as *mut Feld as u32
        }
        A_KLASSE => {
            let k = obj::<Ref>(o).id;
            match statisches_feld(k as i32, id) {
                Some(i) => {
                    let fe = statfeld(i);
                    let fi = finfo(fe.info);
                    if fi.sicht != 0 && !pruefe_zugriff(fi, KARTON, ctxk, id) { return 0; }
                    fe as *mut Feld as u32
                }
                None => {
                    let mut t = Tb::neu();
                    t.s("Feld '").name(id).s("' gibt es in Klasse ").name(kl(k).name).s(" nicht.");
                    wirf_tb(K_LAUFZEIT, &t);
                    0
                }
            }
        }
        _ => {
            let mut t = Tb::neu();
            t.s("Auf ");
            typ_name(o, &mut t);
            t.s(" kann man keine Felder setzen.");
            wirf_tb(K_TYP, &t);
            0
        }
    }
}

/// Wert eines Felds lesen (für zusammengesetzte Zuweisung): weg → Ananas
#[no_mangle]
pub extern "C" fn rt_feldvar_lesen(fe: u32, name: u32) -> W {
    let fe = unsafe { &*(fe as *const Feld) };
    if fe.w == WEG { wirf_weg(name_id(ptr_w(name))); return KARTON; }
    fe.w
}

/// schreibeVar(v, w, sc, name) für Felder
#[no_mangle]
pub extern "C" fn rt_feldvar_schreiben(fe: u32, w: W, name: u32, ctxd: W, ktor: i32) {
    // Küchenbrigade S3: Feld (auch statisch) der Hauptküche – Wache vor gebacken/Typ (K-101/4)
    if crate::gefroren(fe) { crate::kueche::wirf_variable(name_id(ptr_w(name))); return; }
    let fe = unsafe { &mut *(fe as *mut Feld) };
    let fi = finfo(fe.info);
    let id = name_id(ptr_w(name));
    if fi.gebacken {
        if !(fe.besitzer != 0 && ktor != 0 && art(ctxd) == A_OBJ && p(ctxd) == fe.besitzer) {
            let mut t = Tb::neu();
            t.s("'").name(id).s("' ist gebacken und kann nicht mehr verändert werden.");
            wirf_tb(K_GEBACKEN, &t);
            return;
        }
    }
    if fi.typ != 0 && !pruefe_typ(fi.typ, w, id) { return; }
    fe.w = w;
}

/// Feld direkt setzen (feldInit / statische Initialisierung, nach Typprüfung)
#[no_mangle]
pub extern "C" fn rt_feld_init(o: W, k: i32, name: u32, w: W) {
    let id = name_id(ptr_w(name));
    let fe = if o != KARTON { obj_feld(o, id) } else { statisches_feld(k, id).map(statfeld) };
    if let Some(fe) = fe {
        let fi = finfo(fe.info);
        if fi.typ != 0 && !pruefe_typ(fi.typ, w, id) { return; }
        fe.w = w;
    }
}

/// mitglied(o, name, n, sc) – Feldzugriff `o.name`
#[no_mangle]
pub extern "C" fn rt_mem(o: W, name: u32, ctxk: i32) -> W {
    let id = name_id(ptr_w(name));
    let r = mitglied(o, id, ctxk);
    crate::speicher_pruefen();
    r
}

pub fn mitglied(o: W, id: u32, ctxk: i32) -> W {
    if o == KARTON || o == UNDEF { wirf_leer(); return KARTON; }
    match art(o) {
        A_OBJ => {
            let ob = obj::<Obj>(o);
            if let Some(fe) = obj_feld(o, id) {
                let fi = finfo(fe.info);
                if fi.sicht != 0 && !pruefe_zugriff(fi, o, ctxk, id) { return KARTON; }
                if fe.w == WEG { wirf_weg(id); return KARTON; }
                return fe.w;
            }
            if let Some(i) = statisches_feld(ob.klasse as i32, id) {
                let fe = statfeld(i);
                let fi = finfo(fe.info);
                if fi.sicht != 0 && !pruefe_zugriff(fi, KARTON, ctxk, id) { return KARTON; }
                return fe.w;
            }
            if let Some((k, _)) = finde_methode_liste(ob.klasse as i32, id) {
                return neu_w(Gebunden { art: A_GEBUNDEN, klasse: k as i32, obj: o, name: id, global: 0 });
            }
            if crate::std_m::ist_obj_nativ(o, id) {
                return neu_w(Nativ { art: A_NATIV, was: 0, empf: o, name: id, modul: ctxk as u32 });
            }
            let mut t = Tb::neu();
            t.s("Feld '").name(id).s("' gibt es auf ").name(kl(ob.klasse).name).s(" nicht.");
            wirf_tb(K_LAUFZEIT, &t);
            KARTON
        }
        A_KLASSE => {
            let k = obj::<Ref>(o).id;
            if let Some(i) = statisches_feld(k as i32, id) {
                let fe = statfeld(i);
                let fi = finfo(fe.info);
                if fi.sicht != 0 && !pruefe_zugriff(fi, KARTON, ctxk, id) { return KARTON; }
                return fe.w;
            }
            if let Some((kk, _)) = finde_methode_liste(k as i32, id) {
                return neu_w(Gebunden { art: A_GEBUNDEN, klasse: kk as i32, obj: KARTON, name: id, global: 0 });
            }
            let mut t = Tb::neu();
            t.s("Feld '").name(id).s("' gibt es in Klasse ").name(kl(k).name).s(" nicht.");
            wirf_tb(K_LAUFZEIT, &t);
            KARTON
        }
        A_ENUMT => {
            let e = enm(obj::<Ref>(o).id);
            for &w in e.werte.iter() { if obj::<EnumW>(w).name == name_text(id) || bytes(obj::<EnumW>(w).name) == bytes(name_text(id)) { return w; } }
            if id == N_WERTE { return neu_w(Nativ { art: A_NATIV, was: 0, empf: o, name: id, modul: u32::MAX }); }
            let mut t = Tb::neu();
            t.s("'").name(id).s("' gibt es in ").name(e.name).s(" nicht.");
            wirf_tb(K_LAUFZEIT, &t);
            KARTON
        }
        A_MODUL => {
            let m = obj::<Ref>(o).id;
            if m == N_G_MATHE && id == N_G_PI { return zahl(core::f64::consts::PI); }
            if crate::std_m::modul_hat(m, id) { return neu_w(Nativ { art: A_NATIV, was: 0, empf: o, name: id, modul: u32::MAX }); }
            let mut t = Tb::neu();
            t.s("'").name(id).s("' gibt es bei ").name(m).s(" nicht.");
            wirf_tb(K_LAUFZEIT, &t);
            KARTON
        }
        A_PIZZA | A_SICHT => neu_w(Nativ { art: A_NATIV, was: 0, empf: o, name: id, modul: ctxk as u32 }),
        _ => {
            if crate::std_m::tabelle_hat(o, id) { return neu_w(Nativ { art: A_NATIV, was: 0, empf: o, name: id, modul: u32::MAX }); }
            let mut t = Tb::neu();
            t.s("Feld '").name(id).s("' gibt es auf ");
            typ_name(o, &mut t);
            t.s(" nicht.");
            wirf_tb(K_LAUFZEIT, &t);
            KARTON
        }
    }
}
