//! Signale, Ananas, Textform, Vergleiche, Operatoren (Port von Laufzeit.text/gleich/vergleiche/binaer).

use crate::klassen::*;
use crate::namen::*;
use crate::text::*;
use crate::wert::*;
use crate::{z, zahl};
use alloc::vec::Vec;

// ---------------------------------------------------------------- Signale
pub const SIG_ANANAS: i32 = 1;
pub const SIG_BUDGET: i32 = 2;
/// 3 war der PizzaFehler zur Laufzeit (B0012); seit K-105 entsteht keiner mehr – Nummer bleibt reserviert, damit die
/// Signalnummern des Backends (IR.md §6) stabil bleiben.
pub const SIG_PF_RESERVIERT: i32 = 3;
pub const SIG_LIMIT: i32 = 4;
pub const SIG_PANIK: i32 = 5;

pub static mut WURF_OBJ: W = KARTON;
pub static mut WURF_POS: i32 = 0;
pub static mut BUDGET_FRAME: u32 = 0;

pub fn setze_sig(s: i32) { unsafe { if crate::ZUSTAND.sig == 0 { crate::ZUSTAND.sig = s; } } }

/// Wirft eine fertige Ananas (Objekt) mit Position.
pub fn wirf_obj(o: W, pos: i32) {
    unsafe {
        if crate::ZUSTAND.sig != 0 { return; }
        WURF_OBJ = o;
        WURF_POS = pos;
        crate::ZUSTAND.sig = SIG_ANANAS;
    }
}

/// `this.ananas(typ, text)` – Klasse nach Namen (wie Map-Lookup im Interpreter).
pub fn ananas_obj(kname: u32, t: W) -> W {
    let k = klasse_nach_name(kname).unwrap_or(K_LAUFZEIT as i32) as u32;
    let kl = kl(k);
    kl.zaehler += 1.0;
    neu_w(Obj { art: A_OBJ, klasse: k, nr: kl.zaehler, felder: Vec::new(), zugeklappt: 0, nachricht: t, cache: 0 })
}
pub fn wirf_ananas_w(knr: u32, t: W) {
    if crate::sig() { return; }
    let kname = ANANAS_BAUM[knr as usize].0;
    let o = ananas_obj(kname, t);
    wirf_obj(o, z().pos);
}
pub fn wirf_ananas(knr: u32, t: &str) { if crate::sig() { return; } wirf_ananas_w(knr, neu_str(t)); }
pub fn wirf_tb(knr: u32, tb: &Tb) { if crate::sig() { return; } wirf_ananas_w(knr, tb.fertig()); }
pub fn wirf_leer() { wirf_ananas(K_LEERERKARTON, "Der Karton ist leer."); }
pub fn wirf_panik() { setze_sig(SIG_PANIK); }
pub fn wirf_weg(name: u32) {
    let mut t = Tb::neu();
    t.s("'").name(name).s("' wurde weggeschoben – der Karton ist leer.");
    wirf_tb(K_LEERERKARTON, &t);
}

// ---------------------------------------------------------------- Typnamen & Text
pub fn typ_name(v: W, tb: &mut Tb) {
    if v == KARTON || v == UNDEF { tb.s("karton"); return; }
    if ist_zahl(v) { tb.s(if zahl::ist_ganz(f(v)) { "salami" } else { "funghi" }); return; }
    if ist_bool(v) { tb.s("diavolo"); return; }
    if v == AUTO { tb.s("Unbekanntes"); return; }
    match art(v) {
        A_TEXT => { tb.s("margherita"); }
        A_BLECH => { tb.s("Blech"); }
        A_KARTE => { tb.s("Speisekarte"); }
        A_DAUER => { tb.s("Dauer"); }
        A_OBJ => { tb.name(kl(obj::<Obj>(v).klasse).name); }
        A_ENUMW => { tb.name(enm(obj::<EnumW>(v).e).name); }
        A_KLASSE => { tb.s("Klasse ").name(kl(obj::<Ref>(v).id).name); }
        A_ENUMT => { tb.s("Klasse ").name(enm(obj::<Ref>(v).id).name); }
        A_REZEPTUR => { tb.s("Klasse ").name(rez(obj::<Ref>(v).id).name); }
        A_MODUL => { tb.name(obj::<Ref>(v).id); }
        A_FUNKTION | A_GEBUNDEN | A_NATIV => { tb.s("Funktion"); }
        A_TEIG => { tb.s("Teig"); }
        A_LIEF => { tb.s("Lieferung"); }
        A_ZUST => { tb.s("Zustellung"); }
        A_RESTE => { tb.s("Reste"); }
        A_ROH => { tb.s("Rohling"); }
        crate::theke::A_THEKE | crate::theke::A_ZUTAT => crate::theke::typ_name(v, tb),
        crate::vorrat::A_ZUFALL => { tb.s("Zufall"); }
        crate::vorrat::A_KAMMER => { tb.s("Vorratskammer"); }
        _ => { tb.s("Unbekanntes"); }
    }
}
pub fn typ_name_w(v: W) -> W { let mut t = Tb::neu(); typ_name(v, &mut t); t.fertig() }

/// `this.text(v)` – hängt an tb an. Kann Benutzercode (alsText) aufrufen → danach sig prüfen.
pub fn text_in(v: W, tb: &mut Tb) {
    if crate::sig() { return; }
    if v == KARTON || v == UNDEF || v == WEG { tb.s("karton"); return; }
    if ist_zahl(v) { tb.n(f(v)); return; }
    if ist_bool(v) { tb.s(if v == JA { "ja" } else { "nein" }); return; }
    if v == AUTO { tb.s("auto"); return; }
    match art(v) {
        A_TEXT => { tb.t(v); }
        A_BLECH => {
            tb.s("[");
            let mut i = 0;
            while i < blech_v(v).len() {
                if i > 0 { tb.s(", "); }
                let x = blech_v(v)[i];
                text_in(x, tb);
                if crate::sig() { return; }
                i += 1;
            }
            tb.s("]");
        }
        A_KARTE => {
            tb.s("{");
            let mut i = 0;
            let mut erst = true;
            while i < obj::<Karte>(v).k.len() {
                let (k, w) = { let m = obj::<Karte>(v); (m.k[i], m.v[i]) };
                if k == UNDEF { i += 1; continue; }
                if !erst { tb.s(", "); }
                erst = false;
                text_in(k, tb);
                tb.s(": ");
                text_in(w, tb);
                if crate::sig() { return; }
                i += 1;
            }
            tb.s("}");
        }
        A_DAUER => { zahl::dauer_text(dauer_ms(v), &mut tb.0); }
        A_ENUMW => { tb.t(obj::<EnumW>(v).name); }
        A_OBJ => { let t = obj_text(v); if !crate::sig() { tb.t(t); } }
        A_KLASSE => { tb.name(kl(obj::<Ref>(v).id).name); }
        A_ENUMT => { tb.name(enm(obj::<Ref>(v).id).name); }
        A_REZEPTUR => { tb.name(rez(obj::<Ref>(v).id).name); }
        A_MODUL => { tb.name(obj::<Ref>(v).id); }
        A_FUNKTION | A_GEBUNDEN | A_NATIV => { tb.s("<Funktion>"); }
        A_TEIG => {
            let t = obj::<Teig>(v);
            if t.fertig != 0 { tb.s("Teig("); text_in(t.wert, tb); tb.s(")"); } else { tb.s("Teig(roh)"); }
        }
        A_LIEF => { tb.s("Lieferung #").n(obj::<Lief>(v).nr as f64); }
        A_ZUST => {
            let zs = obj::<Zust>(v);
            if zs.puenktlich != 0 {
                tb.s("Zustellung(");
                if zs.fehler != KARTON { tb.s("Ananas"); } else { text_in(zs.wert, tb); }
                tb.s(")");
            } else { tb.s("Zustellung(zu spät)"); }
        }
        A_RESTE => { tb.s("Reste("); text_in(obj::<Reste>(v).wert, tb); tb.s(")"); }
        A_ROH => { tb.s("Roh("); text_in(obj::<Roh>(v).teil, tb); tb.s(")"); }
        A_ZELLE => { text_in(obj::<Zelle>(v).w, tb); }
        crate::theke::A_THEKE | crate::theke::A_ZUTAT => crate::theke::text_in(v, tb),
        crate::vorrat::A_ZUFALL | crate::vorrat::A_KAMMER => crate::vorrat::text_in(v, tb),
        _ => { tb.s("?"); }
    }
}

pub fn text(v: W) -> W {
    if art(v) == A_TEXT { return v; }
    let mut t = Tb::neu();
    text_in(v, &mut t);
    t.fertig()
}

/// `objText(o)`
pub fn obj_text(o: W) -> W {
    let ob = obj::<Obj>(o);
    if let Some((_, l)) = finde_methode_liste(ob.klasse as i32, N_ALSTEXT) {
        let m = waehle(l, 0);
        let me = meth(m);
        if me.fnid >= 0 && fnx(me.fnid as u32).params.len() == 0 {
            let r = rufe_decl(m, o, &[], &[], 0, 0);
            if crate::sig() { return KARTON; }
            return text(r);
        }
    }
    let mut t = Tb::neu();
    if ist_ananas_klasse(ob.klasse as i32) { t.name(kl(ob.klasse).name).s(": ").t(text(ob.nachricht)); }
    else { t.name(kl(ob.klasse).name).s("@").n(ob.nr); }
    t.fertig()
}

/// `darstellung(v)`: Text in Anführungszeichen, sonst text(v), bei Wurf typName.
pub fn darstellung(v: W, tb: &mut Tb) {
    if art(v) == A_TEXT { tb.s("\"").t(v).s("\""); return; }
    if crate::sig() { return; }
    let mut t = Tb::neu();
    text_in(v, &mut t);
    if crate::sig() {
        crate::z().sig = 0;
        typ_name(v, tb);
    } else { tb.b(&t.0); }
}

// ---------------------------------------------------------------- Prüfungen
pub fn bool_pruefen(v: W) -> bool {
    if v == JA { return true; }
    if v == NEIN { return false; }
    let mut t = Tb::neu();
    t.s("Erwartet diavolo (ja/nein), bekam ");
    darstellung(v, &mut t);
    t.s(".");
    wirf_tb(K_TYP, &t);
    false
}
pub fn zahl_pruefen(v: W, wo: &str) -> Option<f64> {
    if ist_zahl(v) { return Some(f(v)); }
    let mut t = Tb::neu();
    t.s(wo).s(" braucht eine Zahl, nicht ");
    darstellung(v, &mut t);
    t.s(".");
    wirf_tb(K_TYP, &t);
    None
}
pub fn ganz_pruefen(v: W, wo: &str) -> Option<f64> {
    if ist_zahl(v) && zahl::ist_ganz(f(v)) { return Some(f(v)); }
    let mut t = Tb::neu();
    t.s(wo).s(" braucht eine Ganzzahl, nicht ");
    darstellung(v, &mut t);
    t.s(".");
    wirf_tb(K_TYP, &t);
    None
}
pub fn dauer_ms_pruefen(v: W, wo: &str) -> Option<f64> {
    if art(v) == A_DAUER { return Some(dauer_ms(v)); }
    if ist_zahl(v) { return Some(f(v)); }
    let mut t = Tb::neu();
    t.s(wo).s(" braucht eine Dauer, nicht ");
    darstellung(v, &mut t);
    t.s(".");
    wirf_tb(K_TYP, &t);
    None
}
pub fn ist_funktion(v: W) -> bool { matches!(art(v), A_FUNKTION | A_GEBUNDEN | A_NATIV) }
pub fn funktion_arg(v: W, wo: &str) -> Option<W> {
    if ist_funktion(v) { return Some(v); }
    let mut t = Tb::neu();
    t.s(wo).s("() braucht eine Funktion, z. B. () -> (42).");
    wirf_tb(K_TYP, &t);
    None
}
pub fn index_pruefen(len: usize, i: W) -> Option<usize> {
    if ist_zahl(i) {
        let x = f(i);
        if zahl::ist_ganz(x) && x >= 1.0 && x <= len as f64 { return Some(x as usize); }
    }
    let mut t = Tb::neu();
    t.s("Stück ");
    text_in(i, &mut t);
    if crate::sig() { return None; }
    t.s(" gibt es nicht – das Blech hat ").n(len as f64).s(if len == 1 { " Stück." } else { " Stücke." });
    wirf_tb(K_KEINSTUECK, &t);
    None
}
pub fn schluessel(k: W) -> W { if k == UNDEF { KARTON } else { k } }

// ---------------------------------------------------------------- Gleichheit & Vergleich
/// SameValueZero (Map-Schlüssel)
pub fn same_value_zero(a: W, b: W) -> bool {
    if a == b { return true; }
    if ist_zahl(a) && ist_zahl(b) { let (x, y) = (f(a), f(b)); return x == y || (x != x && y != y); }
    if art(a) == A_TEXT && art(b) == A_TEXT { return bytes(a) == bytes(b); }
    false
}

/// `===`
pub fn strikt_gleich(a: W, b: W) -> bool {
    if ist_zahl(a) && ist_zahl(b) { return f(a) == f(b); }
    if a == b { return true; }
    if art(a) == A_TEXT && art(b) == A_TEXT { return bytes(a) == bytes(b); }
    false
}

pub fn gleich(a: W, b: W) -> bool {
    if strikt_gleich(a, b) { return true; }
    if a == KARTON || b == KARTON { return false; }
    if !ist_ptr(a) || !ist_ptr(b) || art(a) == A_TEXT || art(b) == A_TEXT { return false; }
    if art(a) == A_DAUER && art(b) == A_DAUER { return dauer_ms(a) == dauer_ms(b); }
    false
}

/// `vergleiche(a, b)` → -1/0/1 (bzw. Differenz bei Enums); None = geworfen
pub fn vergleiche(a: W, b: W) -> Option<f64> {
    if ist_zahl(a) && ist_zahl(b) { let (x, y) = (f(a), f(b)); return Some(if x < y { -1.0 } else if x > y { 1.0 } else { 0.0 }); }
    if art(a) == A_TEXT && art(b) == A_TEXT {
        return Some(match vergleich(s(a), s(b)) { core::cmp::Ordering::Less => -1.0, core::cmp::Ordering::Greater => 1.0, _ => 0.0 });
    }
    if art(a) == A_DAUER && art(b) == A_DAUER { let (x, y) = (dauer_ms(a), dauer_ms(b)); return Some(if x < y { -1.0 } else if x > y { 1.0 } else { 0.0 }); }
    if art(a) == A_ENUMW && art(b) == A_ENUMW && obj::<EnumW>(a).e == obj::<EnumW>(b).e { return Some(obj::<EnumW>(a).pos - obj::<EnumW>(b).pos); }
    let mut t = Tb::neu();
    typ_name(a, &mut t); t.s(" und "); typ_name(b, &mut t); t.s(" kann man nicht vergleichen.");
    wirf_tb(K_TYP, &t);
    None
}

fn teilen_null() { wirf_ananas(K_RECHEN, "Durch null teilen? Das ergibt keine Stücke."); }

pub const OP_PLUS: i32 = 0;
pub const OP_MINUS: i32 = 1;
pub const OP_MAL: i32 = 2;
pub const OP_DURCH: i32 = 3;
pub const OP_REST: i32 = 4;
pub const OP_GL: i32 = 5;
pub const OP_UNGL: i32 = 6;
pub const OP_KL: i32 = 7;
pub const OP_KLG: i32 = 8;
pub const OP_GR: i32 = 9;
pub const OP_GRG: i32 = 10;

/// `binaer(op, a, b, n)`; knoten = Positions-ID des Operator-Knotens (für S0007)
pub fn binaer(op: i32, a: W, b: W, knoten: i32) -> W {
    let zz = ist_zahl(a) && ist_zahl(b);
    match op {
        OP_PLUS => {
            if zz { return zahl(f(a) + f(b)); }
            if art(a) == A_TEXT || art(b) == A_TEXT {
                let ta = text(a);
                if crate::sig() { return KARTON; }
                let tb2 = text(b);
                if crate::sig() { return KARTON; }
                return crate::text::verkette(bytes(ta), bytes(tb2), ta);
            }
            if art(a) == A_DAUER && art(b) == A_DAUER { return dauer(dauer_ms(a) + dauer_ms(b)); }
            let mut t = Tb::neu();
            typ_name(a, &mut t); t.s(" und "); typ_name(b, &mut t); t.s(" kann man nicht addieren.");
            wirf_tb(K_TYP, &t);
            KARTON
        }
        OP_MINUS => {
            if zz { return zahl(f(a) - f(b)); }
            if art(a) == A_DAUER && art(b) == A_DAUER { return dauer(dauer_ms(a) - dauer_ms(b)); }
            let mut t = Tb::neu();
            typ_name(b, &mut t); t.s(" kann man nicht von "); typ_name(a, &mut t); t.s(" abziehen.");
            wirf_tb(K_TYP, &t);
            KARTON
        }
        OP_MAL => {
            if zz { return zahl(f(a) * f(b)); }
            if art(a) == A_DAUER && ist_zahl(b) { return dauer(dauer_ms(a) * f(b)); }
            if ist_zahl(a) && art(b) == A_DAUER { return dauer(f(a) * dauer_ms(b)); }
            let mut t = Tb::neu();
            typ_name(a, &mut t); t.s(" und "); typ_name(b, &mut t); t.s(" kann man nicht multiplizieren.");
            wirf_tb(K_TYP, &t);
            KARTON
        }
        OP_DURCH => {
            if zz {
                if f(b) == 0.0 { teilen_null(); return KARTON; }
                return zahl(f(a) / f(b));
            }
            if art(a) == A_DAUER && ist_zahl(b) {
                if f(b) == 0.0 { teilen_null(); return KARTON; }
                return dauer(dauer_ms(a) / f(b));
            }
            if art(a) == A_DAUER && art(b) == A_DAUER {
                if dauer_ms(b) == 0.0 { teilen_null(); return KARTON; }
                return zahl(dauer_ms(a) / dauer_ms(b));
            }
            if art(a) == A_BLECH && ist_zahl(b) {
                if f(b) == 0.0 { teilen_null(); return KARTON; }
                let k = match ganz_pruefen(b, "Blech / n") { Some(k) => k, None => return KARTON };
                if k < 0.0 {
                    let mut t = Tb::neu(); t.s("In ").n(k).s(" Stücke teilen? Das geht nicht.");
                    wirf_tb(K_STREIT, &t);
                    return KARTON;
                }
                if k == 7.0 { crate::start::warnung("S0007", "7 Stücke? Wer schneidet eine Pizza in 7 Stücke?", knoten); }
                let len = blech_v(a).len();
                if (len as f64) % k != 0.0 {
                    let mut t = Tb::neu(); t.n(len as f64).s(" Stücke lassen sich nicht fair durch ").n(k).s(" teilen.");
                    wirf_tb(K_STREIT, &t);
                    return KARTON;
                }
                return crate::std_m::schneide(a, k as usize);
            }
            let mut t = Tb::neu();
            typ_name(a, &mut t); t.s(" kann man nicht durch "); typ_name(b, &mut t); t.s(" teilen.");
            wirf_tb(K_TYP, &t);
            KARTON
        }
        OP_REST => {
            if zz {
                if f(b) == 0.0 { teilen_null(); return KARTON; }
                return zahl(f(a) % f(b));
            }
            wirf_ananas(K_TYP, "% geht nur mit Zahlen.");
            KARTON
        }
        OP_GL => bool_w(if zz { f(a) == f(b) } else { gleich(a, b) }),
        OP_UNGL => bool_w(if zz { f(a) != f(b) } else { !gleich(a, b) }),
        OP_KL | OP_KLG | OP_GR | OP_GRG => {
            if zz {
                let (x, y) = (f(a), f(b));
                return bool_w(match op { OP_KL => x < y, OP_KLG => x <= y, OP_GR => x > y, _ => x >= y });
            }
            match vergleiche(a, b) {
                Some(c) => bool_w(match op { OP_KL => c < 0.0, OP_KLG => c <= 0.0, OP_GR => c > 0.0, _ => c >= 0.0 }),
                None => KARTON,
            }
        }
        _ => KARTON,
    }
}

/// Unär: 0 = `!`, 1 = `-`
pub fn unaer(op: i32, v: W) -> W {
    if op == 0 {
        if v == JA { return NEIN; }
        if v == NEIN { return JA; }
        bool_pruefen(v);
        return KARTON;
    }
    if ist_zahl(v) { return zahl(-f(v)); }
    if art(v) == A_DAUER { return dauer(-dauer_ms(v)); }
    let mut t = Tb::neu();
    typ_name(v, &mut t); t.s(" kann man nicht negieren.");
    wirf_tb(K_TYP, &t);
    KARTON
}

/// Textform eines Werts (für Tests/Host-Werkzeuge)
#[no_mangle]
pub extern "C" fn rt_text(w: W) -> W { crate::start_init(); text(w) }
/// Methodenaufruf auf eingebautem Wert ohne Argumente/mit Argumenten (für Tests)
#[no_mangle]
pub extern "C" fn rt_test_euro(x: f64) -> W { let mut b = Vec::new(); zahl::euro_text(x, &mut b); crate::text::neu_text(&b) }
#[no_mangle]
pub extern "C" fn rt_test_dauer(x: f64) -> W { let mut b = Vec::new(); zahl::dauer_text(x, &mut b); crate::text::neu_text(&b) }
#[no_mangle]
pub extern "C" fn rt_test_runden(x: f64, n: f64) -> f64 { zahl::runde_auf(x, n) }
#[no_mangle]
pub extern "C" fn rt_test_alszahl(t: W) -> W { let r = crate::std_m::tabellen_methode(t, N_ALSZAHL, &[], &[], 0, false); if crate::sig() { crate::z().sig = 0; return KARTON; } r }
