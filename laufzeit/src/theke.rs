//! Theke – UI-Framework (THEKE.md, Protokoll v1). Port von uiNeu/uiBaum/uiAendere/uiBediene des Interpreters.
//! Nachrichten gehen als JSON über den Import `ui_senden`, Ereignisse kommen über `ui_warte`.

use crate::klassen::*;
use crate::namen::*;
use crate::ops::*;
use crate::std_m::{a, arg};
use crate::text::*;
use crate::wert::*;
use crate::{sig, zahl as zl};
use alloc::string::String;
use alloc::vec::Vec;

pub const A_THEKE: u32 = 24;
pub const A_ZUTAT: u32 = 25;

const ARTEN: [&str; 6] = ["schild", "knopf", "eingabe", "haken", "stapel", "reihe"];
const ART_NAMEN: [u32; 6] = [N_G_SCHILD, N_G_KNOPF, N_G_EINGABE, N_G_HAKEN, N_G_STAPEL, N_G_REIHE];
const STIL_NAMEN: [&str; 6] = ["breite", "hoehe", "abstand", "ausrichtung", "schrift", "farbe"];

#[repr(C)]
pub struct UiTheke { pub art: u32, pub gezeigt: u32, pub geschlossen: u32, pub _r: u32, pub titel: W, pub breite: f64, pub hoehe: f64, pub wurzel: W }
#[repr(C)]
pub struct UiZutat {
    pub art: u32, pub zart: u32, pub id: W, pub eltern: W, pub sichtbar: bool, pub an: bool, pub aktiv: bool,
    pub stil: Vec<(u32, W)>, pub text: W, pub wert: W, pub platzhalter: W, pub kinder: Vec<W>,
    pub bei_klick: W, pub bei_aenderung: W, pub bei_enter: W,
}

static mut THEKE: W = KARTON;
static mut ZUTATEN: Vec<(W, W)> = Vec::new();
static mut ID_ZAEHLER: u32 = 0;
/// offene Änderungen: (Zutat-ID, [(Feld, JSON-Wert)])
static mut OFFEN: Vec<(W, Vec<(&'static str, String)>)> = Vec::new();

#[link(wasm_import_module = "pizza")]
extern "C" {
    fn ui_senden(p: *const u8, n: usize);
    fn ui_warte(p: *mut u8, kap: i32) -> i32;
}

fn zutat(w: W) -> &'static mut UiZutat { obj::<UiZutat>(w) }
pub fn ist_zutat(w: W) -> bool { art(w) == A_ZUTAT }
pub fn ist_theke(w: W) -> bool { art(w) == A_THEKE }
pub fn art_name(w: W) -> u32 { ART_NAMEN[zutat(w).zart as usize] }

// ---------------------------------------------------------------- JSON
fn json_text(s: &[u8], out: &mut String) {
    out.push('"');
    let st = unsafe { core::str::from_utf8_unchecked(s) };
    for c in st.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                let h = b"0123456789abcdef";
                out.push_str("\\u00");
                out.push(h[(c as usize >> 4) & 15] as char);
                out.push(h[c as usize & 15] as char);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}
fn json_zahl(x: f64, out: &mut String) {
    let mut b = Vec::new();
    if x.is_finite() { zl::js_text(x, &mut b); } else { b.extend_from_slice(b"null"); }
    out.push_str(unsafe { core::str::from_utf8_unchecked(&b) });
}
fn json_wert(w: W, out: &mut String) {
    if art(w) == A_TEXT { json_text(bytes(w), out); }
    else if ist_bool(w) { out.push_str(if w == JA { "true" } else { "false" }); }
    else if ist_zahl(w) { json_zahl(f(w), out); }
    else { out.push_str("null"); }
}
fn stil_json(z: &UiZutat, out: &mut String) {
    out.push('{');
    for (i, &(k, v)) in z.stil.iter().enumerate() {
        if i > 0 { out.push(','); }
        json_text(STIL_NAMEN[k as usize].as_bytes(), out);
        out.push(':');
        json_wert(v, out);
    }
    out.push('}');
}

fn baum(w: W, out: &mut String) {
    let z = zutat(w);
    out.push_str("{\"id\":"); json_text(bytes(z.id), out);
    out.push_str(",\"art\":"); json_text(ARTEN[z.zart as usize].as_bytes(), out);
    match z.zart {
        0 => { out.push_str(",\"text\":"); json_text(bytes(z.text), out); }
        1 => { out.push_str(",\"text\":"); json_text(bytes(z.text), out); if !z.aktiv { out.push_str(",\"aktiv\":false"); } }
        2 => { out.push_str(",\"wert\":"); json_text(bytes(z.wert), out); if !bytes(z.platzhalter).is_empty() { out.push_str(",\"platzhalter\":"); json_text(bytes(z.platzhalter), out); } }
        3 => { out.push_str(",\"text\":"); json_text(bytes(z.text), out); out.push_str(if z.an { ",\"an\":true" } else { ",\"an\":false" }); }
        _ => {}
    }
    if !z.sichtbar { out.push_str(",\"sichtbar\":false"); }
    if !z.stil.is_empty() { out.push_str(",\"stil\":"); stil_json(z, out); }
    if z.zart >= 4 {
        out.push_str(",\"kinder\":[");
        for (i, &k) in z.kinder.iter().enumerate() { if i > 0 { out.push(','); } baum(k, out); }
        out.push(']');
    }
    out.push('}');
}

fn sende(s: &str) { unsafe { ui_senden(s.as_ptr(), s.len()); } }

fn fenster_nachricht(t: &UiTheke) {
    let mut o = String::from("{\"v\":1,\"op\":\"fenster\",\"titel\":");
    json_text(bytes(t.titel), &mut o);
    o.push_str(",\"breite\":"); json_zahl(t.breite, &mut o);
    o.push_str(",\"hoehe\":"); json_zahl(t.hoehe, &mut o);
    o.push('}');
    sende(&o);
}

pub fn ui_flush() {
    unsafe {
        if OFFEN.is_empty() { return; }
        let mut o = String::from("{\"v\":1,\"op\":\"aendere\",\"aenderungen\":[");
        for (i, (id, felder)) in OFFEN.iter().enumerate() {
            if i > 0 { o.push(','); }
            o.push_str("{\"id\":"); json_text(bytes(*id), &mut o);
            for (k, v) in felder.iter() { o.push(','); json_text(k.as_bytes(), &mut o); o.push(':'); o.push_str(v); }
            o.push('}');
        }
        o.push_str("]}");
        OFFEN.clear();
        sende(&o);
    }
}

fn angezeigt(w: W) -> bool {
    let t = unsafe { THEKE };
    if t == KARTON { return false; }
    let th = obj::<UiTheke>(t);
    if th.gezeigt == 0 || th.geschlossen != 0 { return false; }
    let mut x = w;
    while zutat(x).eltern != KARTON { x = zutat(x).eltern; }
    x == th.wurzel
}

fn aendere(w: W, feld: &'static str, json: String) {
    if !angezeigt(w) { return; }
    let id = zutat(w).id;
    unsafe {
        let e = match OFFEN.iter_mut().position(|(i, _)| bytes(*i) == bytes(id)) {
            Some(p) => p,
            None => { OFFEN.push((id, Vec::new())); OFFEN.len() - 1 }
        };
        let felder = &mut OFFEN[e].1;
        match felder.iter_mut().find(|(k, _)| *k == feld) { Some(x) => x.1 = json, None => felder.push((feld, json)) }
    }
}
fn aendere_kinder(w: W) {
    let mut o = String::from("[");
    for (i, &k) in zutat(w).kinder.iter().enumerate() { if i > 0 { o.push(','); } baum(k, &mut o); }
    o.push(']');
    aendere(w, "kinder", o);
}
fn jtext(w: W) -> String { let mut o = String::new(); json_text(bytes(w), &mut o); o }
fn jbool(b: bool) -> String { String::from(if b { "true" } else { "false" }) }

fn ui_funktion(f: W, wo: &str) -> Option<W> {
    if f == KARTON || f == UNDEF { return Some(KARTON); }
    if ist_funktion(f) { return Some(f); }
    let mut t = Tb::neu();
    t.s(wo).s("() braucht eine Funktion, z. B. () -> { … }.");
    wirf_tb(K_TYP, &t);
    None
}

fn finde_id(id: &[u8]) -> Option<W> { unsafe { ZUTATEN.iter().find(|(i, _)| bytes(*i) == id).map(|x| x.1) } }

fn kind(c: W, k: W) -> bool {
    if !ist_zutat(k) {
        let mut t = Tb::neu();
        t.s("In ").name(art_name(c)).s(" passen nur Zutaten, nicht ");
        darstellung(k, &mut t);
        t.s(".");
        wirf_tb(K_TYP, &t);
        return false;
    }
    let mut x = c;
    loop {
        if x == k {
            let mut t = Tb::neu(); t.s("Die Zutat '").t(zutat(k).id).s("' kann nicht in sich selbst liegen.");
            wirf_tb(K_LAUFZEIT, &t);
            return false;
        }
        x = zutat(x).eltern;
        if x == KARTON { break; }
    }
    let th = unsafe { THEKE };
    if zutat(k).eltern != KARTON || (th != KARTON && obj::<UiTheke>(th).wurzel == k) {
        let mut t = Tb::neu(); t.s("Die Zutat '").t(zutat(k).id).s("' liegt schon woanders auf der Theke.");
        wirf_tb(K_LAUFZEIT, &t);
        return false;
    }
    zutat(k).eltern = c;
    zutat(c).kinder.push(k);
    true
}

pub fn neu_moeglich(id: u32) -> bool { matches!(id, N_G_SCHILD | N_G_KNOPF | N_G_EINGABE | N_G_HAKEN | N_G_STAPEL | N_G_REIHE | N_G_ZUTAT | N_G_THEKE) }

/// `neu X(…)` für Theke-Klassen (nur wenn keine gleichnamige eigene Klasse existiert). None = keine Theke-Klasse.
pub fn neu(id: u32, pos: &[W], ben: &Ben) -> Option<W> {
    let zart = match id {
        N_G_SCHILD => 0, N_G_KNOPF => 1, N_G_EINGABE => 2, N_G_HAKEN => 3, N_G_STAPEL => 4, N_G_REIHE => 5,
        N_G_ZUTAT => { wirf_ananas(K_ROHLING, "Ein Rohling ist nicht essbar."); return Some(KARTON); }
        N_G_THEKE => return Some(neue_theke(pos, ben)),
        _ => return None,
    };
    Some(neue_zutat(zart, pos, ben))
}

fn neue_theke(pos: &[W], ben: &Ben) -> W {
    if unsafe { THEKE } != KARTON { wirf_ananas(K_LAUFZEIT, "Es gibt nur eine Theke pro Programm."); return KARTON; }
    let titel = arg(pos, ben, 0, N_TITEL);
    let br = arg(pos, ben, 1, N_BREITE);
    let ho = arg(pos, ben, 2, N_HOEHE);
    let titel = if titel == UNDEF || titel == KARTON { neu_str("") } else { text(titel) };
    if sig() { return KARTON; }
    let b = if br == UNDEF || br == KARTON { 480.0 } else { match ganz_pruefen(br, "Theke(breite: …)") { Some(x) => x, None => return KARTON } };
    let h = if ho == UNDEF || ho == KARTON { 360.0 } else { match ganz_pruefen(ho, "Theke(hoehe: …)") { Some(x) => x, None => return KARTON } };
    let t = neu_w(UiTheke { art: A_THEKE, gezeigt: 0, geschlossen: 0, _r: 0, titel, breite: b, hoehe: h, wurzel: KARTON });
    unsafe { THEKE = t; }
    t
}

fn neue_zutat(zart: u32, pos: &[W], ben: &Ben) -> W {
    let id_arg = ben.iter().find(|(n, _)| *n == N_ID).map(|x| x.1).unwrap_or(UNDEF);
    let id;
    if id_arg != UNDEF && id_arg != KARTON {
        id = text(id_arg);
        if sig() { return KARTON; }
        if bytes(id).is_empty() { wirf_ananas(K_LAUFZEIT, "Eine Zutat-ID darf nicht leer sein."); return KARTON; }
        if finde_id(bytes(id)).is_some() { let mut t = Tb::neu(); t.s("Die ID '").t(id).s("' gibt es schon."); wirf_tb(K_LAUFZEIT, &t); return KARTON; }
    } else {
        loop {
            unsafe { ID_ZAEHLER += 1; }
            let mut t = Tb::neu(); t.s("z").n(unsafe { ID_ZAEHLER } as f64);
            let c = t.fertig();
            if finde_id(bytes(c)).is_none() { id = c; break; }
        }
    }
    let leer = neu_str("");
    let z = neu_w(UiZutat {
        art: A_ZUTAT, zart, id, eltern: KARTON, sichtbar: true, an: false, aktiv: true, stil: Vec::new(),
        text: leer, wert: leer, platzhalter: leer, kinder: Vec::new(), bei_klick: KARTON, bei_aenderung: KARTON, bei_enter: KARTON,
    });
    let txt = |w: W| -> W { if w == UNDEF { neu_str("") } else { text(w) } };
    match zart {
        0 => { zutat(z).text = txt(arg(pos, ben, 0, N_TEXT)); }
        1 => {
            zutat(z).text = txt(arg(pos, ben, 0, N_TEXT));
            if sig() { return KARTON; }
            match ui_funktion(arg(pos, ben, 1, N_BEIKLICK), "Knopf") { Some(f) => zutat(z).bei_klick = f, None => return KARTON }
        }
        2 => {
            let w = arg(pos, ben, 0, N_WERT);
            zutat(z).wert = if w == UNDEF || w == KARTON { neu_str("") } else { text(w) };
            if sig() { return KARTON; }
            let ph = arg(pos, ben, 1, N_PLATZHALTER);
            zutat(z).platzhalter = if ph == UNDEF || ph == KARTON { neu_str("") } else { text(ph) };
        }
        3 => {
            zutat(z).text = txt(arg(pos, ben, 0, N_TEXT));
            if sig() { return KARTON; }
            let an = arg(pos, ben, 1, N_AN);
            zutat(z).an = if an == UNDEF || an == KARTON { false } else { let b = bool_pruefen(an); if sig() { return KARTON; } b };
        }
        _ => {
            let b = arg(pos, ben, 0, N_KINDER);
            if b != UNDEF && b != KARTON {
                if art(b) != A_BLECH {
                    let mut t = Tb::neu(); t.name(ART_NAMEN[zart as usize]).s(" braucht ein Blech mit Zutaten, nicht "); darstellung(b, &mut t); t.s(".");
                    wirf_tb(K_TYP, &t);
                    return KARTON;
                }
                let n = blech_v(b).len();
                for i in 0..n { let k = blech_v(b)[i]; if !kind(z, k) { return KARTON; } }
            }
        }
    }
    if sig() { return KARTON; }
    unsafe { ZUTATEN.push((id, z)); }
    z
}

pub fn tabelle_hat(o: W, id: u32) -> bool {
    if ist_theke(o) { return matches!(id, N_ZEIGE | N_BEDIENE | N_SCHLIESSE | N_SETZETITEL | N_TITEL | N_ALSTEXT); }
    let z = zutat(o);
    if matches!(id, N_ID | N_SICHTBAR | N_STIL | N_ALSTEXT) { return true; }
    match z.zart {
        0 => matches!(id, N_TEXT | N_SETZETEXT),
        1 => matches!(id, N_TEXT | N_SETZETEXT | N_BEIKLICK | N_AKTIV),
        2 => matches!(id, N_WERT | N_SETZEWERT | N_BEIAENDERUNG | N_BEIENTER),
        3 => matches!(id, N_TEXT | N_SETZETEXT | N_AN | N_SETZEAN | N_BEIAENDERUNG),
        _ => matches!(id, N_HINZU | N_LEEREN),
    }
}

pub fn methode(o: W, id: u32, pos: &[W], knoten: i32) -> W {
    if !tabelle_hat(o, id) { return crate::std_m::nicht_gefunden(o, id); }
    if ist_theke(o) { return theke_methode(o, id, pos, knoten); }
    let z = zutat(o);
    match id {
        N_ID => z.id,
        N_ALSTEXT => text(o),
        N_SICHTBAR => {
            if pos.is_empty() { return bool_w(z.sichtbar); }
            let b = bool_pruefen(pos[0]); if sig() { return KARTON; }
            zutat(o).sichtbar = b; aendere(o, "sichtbar", jbool(b)); o
        }
        N_STIL => {
            let k = text(a(pos, 0)); if sig() { return KARTON; }
            let ks = s(k);
            let ki = match STIL_NAMEN.iter().position(|&n| n == ks) {
                Some(i) => i as u32,
                None => {
                    let mut t = Tb::neu(); t.s("Stil '").t(k).s("' gibt es nicht. Erlaubt: breite, hoehe, abstand, ausrichtung, schrift, farbe.");
                    wirf_tb(K_LAUFZEIT, &t); return KARTON;
                }
            };
            let mut w = a(pos, 1);
            if ki <= 2 {
                if !(ist_zahl(w) && f(w) >= 0.0 && f(w).is_finite()) {
                    let mut t = Tb::neu(); t.s("Stil '").t(k).s("' braucht eine Zahl ≥ 0, nicht "); darstellung(w, &mut t); t.s(".");
                    wirf_tb(K_TYP, &t); return KARTON;
                }
            } else {
                w = text(w); if sig() { return KARTON; }
                let erlaubt: &[&str] = match ki { 3 => &["links", "mitte", "rechts"], 4 => &["klein", "normal", "gross", "mono"], _ => &["tomate", "basilikum", "mozzarella", "kruste", "normal"] };
                if !erlaubt.contains(&s(w)) {
                    let mut t = Tb::neu(); t.s("Wert '").t(w).s("' ist für Stil '").t(k).s("' nicht erlaubt. Erlaubt: ");
                    for (i, e) in erlaubt.iter().enumerate() { if i > 0 { t.s(", "); } t.s(e); }
                    t.s(".");
                    wirf_tb(K_LAUFZEIT, &t); return KARTON;
                }
            }
            let z = zutat(o);
            match z.stil.iter_mut().find(|x| x.0 == ki) { Some(x) => x.1 = w, None => z.stil.push((ki, w)) }
            let mut j = String::new(); stil_json(z, &mut j);
            aendere(o, "stil", j);
            o
        }
        N_TEXT => z.text,
        N_SETZETEXT => { let t = text(a(pos, 0)); if sig() { return KARTON; } zutat(o).text = t; aendere(o, "text", jtext(t)); o }
        N_BEIKLICK => { match ui_funktion(a(pos, 0), "beiKlick") { Some(f) => { zutat(o).bei_klick = f; o } None => KARTON } }
        N_AKTIV => {
            if pos.is_empty() { return bool_w(z.aktiv); }
            let b = bool_pruefen(pos[0]); if sig() { return KARTON; }
            zutat(o).aktiv = b; aendere(o, "aktiv", jbool(b)); o
        }
        N_WERT => z.wert,
        N_SETZEWERT => { let t = text(a(pos, 0)); if sig() { return KARTON; } zutat(o).wert = t; aendere(o, "wert", jtext(t)); o }
        N_BEIAENDERUNG => { match ui_funktion(a(pos, 0), "beiAenderung") { Some(f) => { zutat(o).bei_aenderung = f; o } None => KARTON } }
        N_BEIENTER => { match ui_funktion(a(pos, 0), "beiEnter") { Some(f) => { zutat(o).bei_enter = f; o } None => KARTON } }
        N_AN => bool_w(z.an),
        N_SETZEAN => { let b = bool_pruefen(a(pos, 0)); if sig() { return KARTON; } zutat(o).an = b; aendere(o, "an", jbool(b)); o }
        N_HINZU => { if !kind(o, a(pos, 0)) { return KARTON; } aendere_kinder(o); o }
        N_LEEREN => {
            let n = zutat(o).kinder.len();
            for i in 0..n { let k = zutat(o).kinder[i]; zutat(k).eltern = KARTON; }
            zutat(o).kinder = Vec::new();
            aendere_kinder(o);
            o
        }
        _ => crate::std_m::nicht_gefunden(o, id),
    }
}

fn theke_methode(t: W, id: u32, pos: &[W], knoten: i32) -> W {
    match id {
        N_ZEIGE => { zeige(t, a(pos, 0)); t }
        N_BEDIENE => { bediene(t, knoten); KARTON }
        N_SCHLIESSE => { schliesse(t); KARTON }
        N_SETZETITEL => {
            let x = text(a(pos, 0)); if sig() { return KARTON; }
            let th = obj::<UiTheke>(t);
            th.titel = x;
            if th.gezeigt != 0 && th.geschlossen == 0 { ui_flush(); fenster_nachricht(obj::<UiTheke>(t)); }
            t
        }
        N_TITEL => obj::<UiTheke>(t).titel,
        N_ALSTEXT => text(t),
        _ => crate::std_m::nicht_gefunden(t, id),
    }
}

fn zeige(t: W, z: W) {
    if !ist_zutat(z) {
        let mut x = Tb::neu(); x.s("zeige() braucht eine Zutat, nicht "); darstellung(z, &mut x); x.s(".");
        wirf_tb(K_TYP, &x); return;
    }
    if zutat(z).eltern != KARTON {
        let mut x = Tb::neu(); x.s("Die Zutat '").t(zutat(z).id).s("' liegt schon in einem Behälter und kann nicht die Wurzel sein.");
        wirf_tb(K_LAUFZEIT, &x); return;
    }
    unsafe { OFFEN.clear(); }
    let th = obj::<UiTheke>(t);
    th.wurzel = z;
    if th.gezeigt == 0 || th.geschlossen != 0 {
        th.gezeigt = 1; th.geschlossen = 0;
        fenster_nachricht(th);
    }
    let mut o = String::from("{\"v\":1,\"op\":\"baum\",\"wurzel\":");
    baum(z, &mut o);
    o.push('}');
    sende(&o);
}

fn schliesse(t: W) {
    let th = obj::<UiTheke>(t);
    if th.gezeigt == 0 || th.geschlossen != 0 { th.geschlossen = 1; return; }
    ui_flush();
    sende("{\"v\":1,\"op\":\"schliesse\"}");
    let th = obj::<UiTheke>(t);
    th.geschlossen = 1; th.gezeigt = 0;
}

/// nächstes Ereignis (JSON-Bytes) oder None = geschlossen
fn naechstes() -> Option<Vec<u8>> {
    let mut puf: Vec<u8> = alloc::vec![0u8; 4096];
    loop {
        let n = unsafe { ui_warte(puf.as_mut_ptr(), puf.len() as i32) };
        if n < 0 { return None; }
        let n = n as usize;
        if n > puf.len() { puf = alloc::vec![0u8; n]; continue; }
        puf.truncate(n);
        return Some(puf);
    }
}

fn bediene(t: W, knoten: i32) {
    if obj::<UiTheke>(t).wurzel == KARTON { wirf_ananas(K_LAUFZEIT, "Die Theke ist leer."); return; }
    if obj::<UiTheke>(t).geschlossen != 0 { return; }
    if unsafe { ui_warte(core::ptr::null_mut(), -1) } <= 0 {
        ui_flush();
        crate::start::warnung("W0100", "Keine Theke verfügbar – Fenster wird nicht angezeigt.", knoten);
        return;
    }
    loop {
        ui_flush();
        if obj::<UiTheke>(t).geschlossen != 0 { return; }
        let ev = naechstes();
        let ev = match ev { Some(e) => e, None => b"{\"typ\":\"geschlossen\"}".to_vec() };
        let felder = json_objekt(&ev);
        let typ = feld_text(&felder, "typ");
        if typ.as_deref() == Some("geschlossen") || felder.is_none() {
            unsafe { OFFEN.clear(); }
            let th = obj::<UiTheke>(t);
            th.geschlossen = 1; th.gezeigt = 0;
            return;
        }
        verteile(&felder, knoten);
        if obj::<UiTheke>(t).geschlossen == 0 { ui_flush(); }
        if sig() { return; }
    }
}

/// Einfacher JSON-Objektleser: (Schlüssel, Wert) mit Wert als Text ("s:…"), Bool ("b:1"), Zahl ("n:…") oder null
fn json_objekt(b: &[u8]) -> Option<Vec<(String, String)>> {
    let st = core::str::from_utf8(b).ok()?;
    let c: Vec<char> = st.chars().collect();
    let mut i = 0;
    let ws = |i: &mut usize| { while *i < c.len() && c[*i].is_whitespace() { *i += 1; } };
    let lies_text = |i: &mut usize| -> Option<String> {
        if c.get(*i) != Some(&'"') { return None; }
        *i += 1;
        let mut o = String::new();
        while *i < c.len() {
            let ch = c[*i];
            if ch == '"' { *i += 1; return Some(o); }
            if ch == '\\' {
                *i += 1;
                match c.get(*i)? {
                    'n' => o.push('\n'), 't' => o.push('\t'), 'r' => o.push('\r'), 'b' => o.push('\u{8}'), 'f' => o.push('\u{c}'),
                    'u' => {
                        let h: String = c.get(*i + 1..*i + 5)?.iter().collect();
                        let v = u32::from_str_radix(&h, 16).ok()?;
                        *i += 4;
                        let mut cp = v;
                        if (0xD800..0xDC00).contains(&v) && c.get(*i + 1) == Some(&'\\') && c.get(*i + 2) == Some(&'u') {
                            let h2: String = c.get(*i + 3..*i + 7)?.iter().collect();
                            let lo = u32::from_str_radix(&h2, 16).ok()?;
                            if (0xDC00..0xE000).contains(&lo) { cp = 0x10000 + ((v - 0xD800) << 10) + (lo - 0xDC00); *i += 6; }
                        }
                        o.push(core::char::from_u32(cp).unwrap_or('\u{fffd}'));
                    }
                    x => o.push(*x),
                }
                *i += 1;
                continue;
            }
            o.push(ch);
            *i += 1;
        }
        None
    };
    ws(&mut i);
    if c.get(i) != Some(&'{') { return None; }
    i += 1;
    let mut r = Vec::new();
    loop {
        ws(&mut i);
        if c.get(i) == Some(&'}') { break; }
        let k = lies_text(&mut i)?;
        ws(&mut i);
        if c.get(i) != Some(&':') { return None; }
        i += 1;
        ws(&mut i);
        let v = match c.get(i)? {
            '"' => { let t = lies_text(&mut i)?; let mut s = String::from("s:"); s.push_str(&t); s }
            't' => { i += 4; String::from("b:1") }
            'f' => { i += 5; String::from("b:0") }
            'n' => { i += 4; String::from("x:") }
            '{' | '[' => {
                let mut tiefe = 0; let mut im_text = false;
                while i < c.len() {
                    let ch = c[i];
                    if im_text { if ch == '\\' { i += 1; } else if ch == '"' { im_text = false; } }
                    else if ch == '"' { im_text = true; } else if ch == '{' || ch == '[' { tiefe += 1; } else if ch == '}' || ch == ']' { tiefe -= 1; if tiefe == 0 { i += 1; break; } }
                    i += 1;
                }
                String::from("x:")
            }
            _ => { let st = i; while i < c.len() && !matches!(c[i], ',' | '}') && !c[i].is_whitespace() { i += 1; } let mut s = String::from("n:"); s.extend(c[st..i].iter()); s }
        };
        r.push((k, v));
        ws(&mut i);
        if c.get(i) == Some(&',') { i += 1; continue; }
        if c.get(i) == Some(&'}') { break; }
        return None;
    }
    Some(r)
}
fn feld<'a>(f: &'a Option<Vec<(String, String)>>, k: &str) -> Option<&'a str> {
    f.as_ref()?.iter().rev().find(|(x, _)| x == k).map(|x| x.1.as_str())
}
fn feld_text(f: &Option<Vec<(String, String)>>, k: &str) -> Option<String> {
    let v = feld(f, k)?;
    if let Some(t) = v.strip_prefix("s:") { Some(String::from(t)) } else { None }
}
/// `String(ev.wert)` (für Eingabe): Text roh, Zahl als JS-Zahltext, Bool ja als "true"/"false"
fn wert_als_text(f: &Option<Vec<(String, String)>>) -> Option<W> {
    let v = feld(f, "wert")?;
    if let Some(t) = v.strip_prefix("s:") { return Some(neu_str(t)); }
    if v == "b:1" { return Some(neu_str("true")); }
    if v == "b:0" { return Some(neu_str("false")); }
    if let Some(n) = v.strip_prefix("n:") {
        let x: f64 = n.parse().unwrap_or(f64::NAN);
        let mut b = Vec::new(); zl::js_text(x, &mut b);
        return Some(neu_text(&b));
    }
    None
}

fn verteile(ev: &Option<Vec<(String, String)>>, knoten: i32) {
    let id = match feld_text(ev, "id") { Some(i) => i, None => return };
    let z = match finde_id(id.as_bytes()) { Some(z) => z, None => return };
    let typ = feld_text(ev, "typ").unwrap_or_default();
    let zz = zutat(z);
    match typ.as_str() {
        "klick" => {
            if zz.zart == 1 && zz.aktiv && zz.bei_klick != KARTON { rufe(zz.bei_klick, &[], &[], knoten); }
        }
        "aenderung" => {
            if zz.zart == 2 {
                zutat(z).wert = wert_als_text(ev).unwrap_or_else(|| neu_str(""));
                let (f, w) = (zutat(z).bei_aenderung, zutat(z).wert);
                if f != KARTON { rufe(f, &[w], &[], knoten); }
            } else if zz.zart == 3 {
                let v = feld(ev, "wert");
                zutat(z).an = v == Some("b:1") || v == Some("s:true");
                let (f, w) = (zutat(z).bei_aenderung, bool_w(zutat(z).an));
                if f != KARTON { rufe(f, &[w], &[], knoten); }
            }
        }
        "enter" => {
            if zz.zart == 2 {
                if let Some(w) = wert_als_text(ev) { zutat(z).wert = w; }
                let (f, w) = (zutat(z).bei_enter, zutat(z).wert);
                if f != KARTON { rufe(f, &[w], &[], knoten); }
            }
        }
        _ => {}
    }
}

/// Textform: Theke(titel) / Schild(z1)
pub fn text_in(v: W, tb: &mut Tb) {
    if ist_theke(v) { tb.s("Theke(").t(obj::<UiTheke>(v).titel).s(")"); }
    else { tb.name(art_name(v)).s("(").t(zutat(v).id).s(")"); }
}
pub fn typ_name(v: W, tb: &mut Tb) {
    if ist_theke(v) { tb.s("Theke"); } else { tb.name(art_name(v)); }
}
/// pruefeTyp für die Theke-Typnamen ohne eigene Klasse
pub fn typ_passt(typ: u32, v: W) -> Option<bool> {
    match typ {
        N_G_THEKE => Some(ist_theke(v)),
        N_G_ZUTAT => Some(ist_zutat(v)),
        N_G_SCHILD | N_G_KNOPF | N_G_EINGABE | N_G_HAKEN | N_G_STAPEL | N_G_REIHE => Some(ist_zutat(v) && art_name(v) == typ),
        _ => None,
    }
}
