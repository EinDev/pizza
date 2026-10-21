//! Einstiegspunkte für den erzeugten Programmcode (Ausdrücke/Anweisungen, die nicht inline erzeugt werden).

use crate::klassen::*;
use crate::namen::*;
use crate::ops::*;
use crate::text::*;
use crate::wert::*;
use crate::{args_pop, args_von, sig, z};
use alloc::vec::Vec;

#[no_mangle] pub extern "C" fn rt_bool_fehler(w: W) { bool_pruefen(w); }
#[no_mangle] pub extern "C" fn rt_stapel() { wirf_ananas(K_LAUFZEIT, "Zu viele Pizzen übereinander (Stapelüberlauf)."); }
#[no_mangle] pub extern "C" fn rt_bin(op: i32, a: W, b: W, knoten: i32) -> W { let r = binaer(op, a, b, knoten); crate::speicher_pruefen(); r }
#[no_mangle] pub extern "C" fn rt_un(op: i32, v: W) -> W { unaer(op, v) }
#[no_mangle] pub extern "C" fn rt_gleich(a: W, b: W) -> i32 { gleich(a, b) as i32 }
#[no_mangle] pub extern "C" fn rt_dauer(ms: f64) -> W { dauer(ms) }
#[no_mangle] pub extern "C" fn rt_panik() { wirf_panik(); }

#[no_mangle]
pub extern "C" fn rt_blech_aus(args: u32, n: u32) -> W {
    let v = args_von(args, n).to_vec();
    args_pop(args);
    let r = blech(v);
    crate::speicher_pruefen();
    r
}

#[no_mangle]
pub extern "C" fn rt_bereich(a: W, b: W) -> W {
    let x = match zahl_pruefen(a, "Bereich [a .. b]") { Some(x) => x, None => return KARTON };
    let y = match zahl_pruefen(b, "Bereich [a .. b]") { Some(x) => x, None => return KARTON };
    if (y - x).abs() > 10000000.0 { wirf_ananas(K_RECHEN, "Der Bereich ist zu groß für ein Blech."); return KARTON; }
    let n = crate::zahl::floor((y - x).abs()) as usize + 1;
    let mut r = Vec::with_capacity(n);
    if x <= y { let mut i = x; while i <= y { r.push(zahl(i)); i += 1.0; } }
    else { let mut i = x; while i >= y { r.push(zahl(i)); i -= 1.0; } }
    let w = blech(r);
    crate::speicher_pruefen();
    w
}

#[no_mangle]
pub extern "C" fn rt_zelle(w: W) -> W { neu_w(Zelle { art: A_ZELLE, _r: 0, w }) }

/// Closure: Funktion-Objekt mit n Zellen (Offset 32 + 8i, vom Programmcode befüllt)
#[no_mangle]
pub extern "C" fn rt_lambda(fnid: i32, dies: W, unten: W, n: i32) -> W {
    let q = crate::alloc_roh(32 + 8 * n as u32, 8);
    unsafe {
        let f = q as *mut Funktion;
        (*f).art = A_FUNKTION;
        (*f).fnid = fnid as u32;
        (*f).dies = dies;
        (*f).unten = unten;
        (*f).n = n as u32;
    }
    ptr_w(q as u32)
}

#[no_mangle] pub extern "C" fn rt_dies_fehler() { wirf_ananas(K_LAUFZEIT, "'dies' gibt es hier nicht – wir sind in keiner Instanz."); }

/// aUnten
#[no_mangle]
pub extern "C" fn rt_unten(dies: W, unten: W) -> W {
    if unten != KARTON { return unten; }
    if dies != KARTON { return dies; }
    wirf_ananas(K_LAUFZEIT, "'unten' gibt es hier nicht.");
    KARTON
}

/// aUntenCall: unten(…) im Konstruktor
#[no_mangle]
pub extern "C" fn rt_unten_call(args: u32, npos: u32, bennamen: u32, nben: u32, ctxd: W, ctxk: i32, ktor: i32) -> W {
    let pos = args_von(args, npos);
    let ben = ben_von(bennamen, args + npos * 8, nben);
    'x: {
        if ktor == 0 || ctxk < 0 || art(ctxd) != A_OBJ { wirf_ananas(K_LAUFZEIT, "unten(…) geht nur im Konstruktor."); break 'x; }
        let k = kl(ctxk as u32);
        if k.basis >= 0 { konstruiere(k.basis as u32, ctxd, pos, &ben, 0); }
        else if !pos.is_empty() {
            let mut t = Tb::neu();
            t.s("Klasse '").name(k.name).s("' hat keine Basisklasse für unten(…).");
            wirf_tb(K_LAUFZEIT, &t);
            break 'x;
        }
        if sig() { break 'x; }
        feld_init(ctxk as u32, ctxd);
    }
    args_pop(args);
    crate::speicher_pruefen();
    KARTON
}

/// untenAufruf: unten.m(…)
#[no_mangle]
pub extern "C" fn rt_unten_m(name: u32, args: u32, npos: u32, bennamen: u32, nben: u32, knoten: i32, ctxd: W, unten: W, ctxk: i32) -> W {
    let id = name_id(ptr_w(name));
    let pos = args_von(args, npos);
    let ben = ben_von(bennamen, args + npos * 8, nben);
    let r = 'x: {
        if unten != KARTON { break 'x rufe_methode(unten, id, pos, &ben, knoten, ctxk, ctxd, true); }
        if ctxk < 0 || kl(ctxk as u32).basis < 0 { wirf_ananas(K_LAUFZEIT, "'unten' gibt es hier nicht – keine Basisklasse."); break 'x KARTON; }
        let basis = kl(ctxk as u32).basis;
        if let Some((_, l)) = finde_methode_liste(basis, id) {
            let m = waehle(l, anzahl(pos, &ben));
            let d = if meth(m).statisch { KARTON } else { ctxd };
            break 'x rufe_decl(m, d, pos, &ben, knoten, 0);
        }
        if art(ctxd) == A_OBJ {
            if ist_ananas_klasse(basis) && matches!(id, N_NACHRICHT | N_HOLENACHRICHT | N_TYP | N_ALSTEXT) {
                if let Some(r) = crate::std_m::ananas_obj_methode(ctxd, id, pos, &ben, knoten) { break 'x r; }
            }
            if matches!(id, N_ALSTEXT | N_AUFKLAPPEN) {
                // OBJ_M (alsText: Klassenname@N)
                let ob = obj::<Obj>(ctxd);
                if id == N_ALSTEXT { let mut t = Tb::neu(); t.name(kl(ob.klasse).name).s("@").n(ob.nr); break 'x t.fertig(); }
                if let Some(r) = crate::std_m::ananas_obj_methode(ctxd, id, pos, &ben, knoten) { break 'x r; }
            }
        }
        let mut t = Tb::neu();
        t.s("Methode '").name(id).s("' gibt es in der Basisklasse '").name(kl(basis as u32).name).s("' nicht.");
        wirf_tb(K_LAUFZEIT, &t);
        KARTON
    };
    args_pop(args);
    crate::speicher_pruefen();
    r
}

/// aNeu (ohne Hawaii, das der Compiler vorher prüft)
#[no_mangle]
pub extern "C" fn rt_neu(typ: u32, args: u32, npos: u32, bennamen: u32, nben: u32, knoten: i32) -> W {
    let id = name_id(ptr_w(typ));
    let pos = args_von(args, npos);
    let ben = ben_von(bennamen, args + npos * 8, nben);
    let r = match id {
        N_G_BLECH => blech(if !pos.is_empty() && art(pos[0]) == A_BLECH { blech_v(pos[0]).clone() } else { Vec::new() }),
        N_G_SPEISEKARTE => crate::karte::neu_karte(),
        N_G_PIZZA => crate::pf::neue_pizza(Vec::new()),
        // Küchenbrigade S4 (neu Zutat() bleibt RohlingAnanas, K-101/3)
        _ if klasse_eintrag(id).is_none() && crate::theke::neu_moeglich(id) && id != N_G_ZUTAT && crate::kueche::nur_hauptkueche(crate::kueche::T_THEKE) => KARTON,
        _ if klasse_eintrag(id).is_none() && crate::theke::neu_moeglich(id) => crate::theke::neu(id, pos, &ben).unwrap_or(KARTON),
        N_G_ZUFALL if klasse_eintrag(id).is_none() => crate::vorrat::neu_zufall(pos, &ben),
        N_G_VORRATSKAMMER if klasse_eintrag(id).is_none() => if crate::kueche::nur_hauptkueche(crate::kueche::T_KAMMER_NEU) { KARTON } else { crate::vorrat::neue_kammer(pos, &ben, knoten) },
        _ => match klasse_eintrag(id) {
            None => {
                let mut t = Tb::neu();
                t.s("Klasse '").name(id).s("' steht nicht auf der Speisekarte.");
                wirf_tb(K_UNBEKANNTEPIZZA, &t);
                KARTON
            }
            Some((0, k)) => instanziiere(k, pos, &ben, knoten),
            Some(_) => {
                let mut t = Tb::neu();
                t.s("'").name(id).s("' kann man nicht mit neu backen.");
                wirf_tb(K_ROHLING, &t);
                KARTON
            }
        },
    };
    args_pop(args);
    crate::speicher_pruefen();
    r
}

/// sWirf
#[no_mangle]
pub extern "C" fn rt_wirf(v: W, pos: i32) {
    if art(v) == A_OBJ { wirf_obj(v, pos); return; }
    if v == KARTON || v == UNDEF { wirf_leer(); return; }
    let mut t = Tb::neu();
    t.s("Werfen kann man nur Ananas (Objekte), nicht ");
    darstellung(v, &mut t);
    t.s(".");
    wirf_tb(K_TYP, &t);
}

/// findeFang: passt die schwebende Ananas zum Typ (0 = untypisiert)?
#[no_mangle]
pub extern "C" fn rt_fang_passt(typ: u32) -> i32 {
    unsafe {
        if crate::ZUSTAND.sig != SIG_ANANAS { return 0; }
        if typ == 0 { return 1; }
        match klasse_eintrag(name_id(ptr_w(typ))) { Some(e) => instanz_von(WURF_OBJ, e) as i32, None => 0 }
    }
}
#[no_mangle]
pub extern "C" fn rt_fang_obj() -> W { unsafe { crate::ZUSTAND.sig = 0; WURF_OBJ } }

struct Gesichert { sig: i32, obj: W, pos: i32, frame: u32, pfc: &'static str, pft: W, pfp: i32 }
static mut GESICHERT: Vec<Gesichert> = Vec::new();
#[no_mangle]
pub extern "C" fn rt_sig_sichern() -> i32 {
    unsafe {
        GESICHERT.push(Gesichert { sig: crate::ZUSTAND.sig, obj: WURF_OBJ, pos: WURF_POS, frame: BUDGET_FRAME, pfc: PF_CODE, pft: PF_TEXT, pfp: PF_POS });
        crate::ZUSTAND.sig = 0;
        (GESICHERT.len() - 1) as i32
    }
}
#[no_mangle]
pub extern "C" fn rt_sig_wieder(h: i32) {
    unsafe {
        let g = &GESICHERT[h as usize];
        if crate::ZUSTAND.sig == 0 {
            crate::ZUSTAND.sig = g.sig; WURF_OBJ = g.obj; WURF_POS = g.pos; BUDGET_FRAME = g.frame; PF_CODE = g.pfc; PF_TEXT = g.pft; PF_POS = g.pfp;
        }
        GESICHERT.truncate(h as usize);
    }
}
#[no_mangle]
pub extern "C" fn rt_sig_verwerfen(h: i32) { unsafe { GESICHERT.truncate(h as usize); } }

/// pruefeTyp(typ, v, name) → 1 = ok
#[no_mangle]
pub extern "C" fn rt_typ_pruefen(typ: u32, v: W, name: u32) -> i32 {
    if typ == 0 { return 1; }
    pruefe_typ(name_id(ptr_w(typ)), v, name_id(ptr_w(name))) as i32
}
#[no_mangle] pub extern "C" fn rt_besitz(v: W) { if art(v) == A_PIZZA { wirf_besitz(); } }
#[no_mangle]
pub extern "C" fn rt_gebacken(name: u32) {
    let mut t = Tb::neu();
    t.s("'").t(ptr_w(name)).s("' ist gebacken und kann nicht mehr verändert werden.");
    wirf_tb(K_GEBACKEN, &t);
}
#[no_mangle] pub extern "C" fn rt_weg(name: u32) { wirf_weg(name_id(ptr_w(name))); }
#[no_mangle]
pub extern "C" fn rt_nicht_definiert(name: u32) {
    let mut t = Tb::neu();
    t.s("'").t(ptr_w(name)).s("' ist nicht definiert.");
    wirf_tb(K_LAUFZEIT, &t);
}
#[no_mangle]
pub extern "C" fn rt_schieb_fehler() { wirf_ananas(K_LAUFZEIT, "schieb braucht genau einen Variablennamen: schieb(p)."); }

/// Liste für `für (x : quelle)`
#[no_mangle]
pub extern "C" fn rt_fuer_liste(q: W) -> W {
    let r = match art(q) {
        A_BLECH => blech(blech_v(q).clone()),
        A_TEXT => blech(s(q).chars().map(|c| { let mut b = [0u8; 4]; neu_str(c.encode_utf8(&mut b)) }).collect()),
        A_KARTE => blech(crate::karte::schluessel(obj::<Karte>(q))),
        A_ENUMT => blech(enm(obj::<Ref>(q).id).werte.clone()),
        A_PIZZA => blech(obj::<Pizza>(q).s.clone()),
        _ => {
            if q == KARTON || q == UNDEF { wirf_leer(); return KARTON; }
            let mut t = Tb::neu();
            t.s("Über ");
            typ_name(q, &mut t);
            t.s(" kann man nicht laufen.");
            wirf_tb(K_TYP, &t);
            KARTON
        }
    };
    crate::speicher_pruefen();
    r
}
#[no_mangle] pub extern "C" fn rt_blech_len(b: W) -> i32 { blech_v(b).len() as i32 }
#[no_mangle] pub extern "C" fn rt_blech_get(b: W, i: i32) -> W { blech_v(b)[i as usize] }

/// Enum-Label in wähle: 0 = kein Enum-Wert (Label normal auswerten), 1 = Treffer, 2 = kein Treffer
#[no_mangle]
pub extern "C" fn rt_enum_label(v: W, name: u32) -> i32 {
    if art(v) != A_ENUMW { return 0; }
    if bytes(obj::<EnumW>(v).name) == bytes(ptr_w(name)) { 1 } else { 2 }
}

/// schieb auf Feld (Kontext): 0 = kein Feld gefunden
#[no_mangle]
pub extern "C" fn rt_schieb_feld(name: u32, ctxd: W, ctxk: i32) -> W {
    let id = name_id(ptr_w(name));
    match feld_ctx_ziel(id, ctxd, ctxk) {
        None => UNDEF,
        Some(fe) => {
            if sig() { return KARTON; }
            if fe.w == WEG { wirf_weg(id); return KARTON; }
            if crate::gefroren(fe as *mut Feld as u32) { crate::kueche::wirf_variable(id); return KARTON; }
            let w = fe.w;
            fe.w = WEG;
            w
        }
    }
}

#[no_mangle] pub extern "C" fn rt_zustand() -> u32 { unsafe { core::ptr::addr_of!(crate::ZUSTAND) as u32 } }
#[no_mangle] pub extern "C" fn rt_sig() -> i32 { z().sig }
