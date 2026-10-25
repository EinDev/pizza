//! Klang (SPEC §18.8, HERD.md §12.4 H-K14, K-153): dünne Anbindung an den Klang-Erzeuger über die Importgruppe `klang`
//! (HOST-ABI §2). Synthese, Wertebereiche der Klänge und ihre Fehlertexte leben im Erzeuger (`herd/klang`); hier stehen
//! Sprachtypen, Spuren (Zustand in simulierter Zeit), Ereignisse und die Rückrufe `beimEnde`.
//!
//! Spiegel von `site/js/pizza.js` (Abschnitte `klang/kern.js`, `klang/tabellen.js`): dieselbe Folge von Erzeuger-Aufrufen
//! ⇒ dieselben PCM-Hashes und Ereignisse. Importe: Modul `klang` = die Exporte von `klang.wasm` unter gleichem Namen (Zeiger
//! zeigen in den Speicher **des Erzeugers**), Modul `pizza`: `klang_kern`, `klang_schreibe`/`klang_lies`, `klang_senden`.

use crate::klassen::*;
use crate::ops::*;
use crate::text::*;
use crate::wert::*;
use crate::namen::*;
use crate::{sig, z, zahl as zl};
use alloc::vec::Vec;

pub const A_KLANG: u32 = 45;
pub const A_SPUR: u32 = 46;

#[repr(C)] pub struct KObj { pub art: u32, pub id: u32, pub dauer: f64, pub hash: [u8; 16] }
#[repr(C)] pub struct SObj {
    pub art: u32, pub nr: u32, pub klang: W, pub laut: f64, pub ton: f64, pub pan: f64, pub lage: [f64; 3], pub reichweite: f64,
    pub start: f64, pub ende: f64, pub ende_fn: W, pub hat_lage: u8, pub schleife: u8, pub gestoppt: u8, pub gemeldet: u8,
}

pub const T_KLANG: &str = "Den Klang gibt es nur in der Hauptküche.";

// ---------------------------------------------------------------- Importe
#[link(wasm_import_module = "klang")]
extern "C" {
    #[link_name = "puffer"] fn k_puffer(len: i32) -> i32;
    #[link_name = "fehler_art"] fn k_fehler_art() -> i32;
    #[link_name = "fehler_text"] fn k_fehler_text(p: i32, kap: i32) -> i32;
    #[link_name = "fehler_neu"] fn k_fehler_neu() -> i32;
    #[link_name = "ton"] fn k_ton(fr: f64, d: f64, wp: i32, wl: i32, laut: f64, bis: f64, an: f64, aus: f64) -> i32;
    #[link_name = "rauschen"] fn k_rauschen(d: f64, ap: i32, al: i32, laut: f64, an: f64, aus: f64, saat: f64) -> i32;
    #[link_name = "stille"] fn k_stille(d: f64) -> i32;
    #[link_name = "noten"] fn k_noten(tp: i32, tl: i32, tempo: f64, wp: i32, wl: i32, laut: f64) -> i32;
    #[link_name = "huelle"] fn k_huelle(id: i32, an: f64, ab: f64, halten: f64, aus: f64) -> i32;
    #[link_name = "tiefpass"] fn k_tiefpass(id: i32, fr: f64, q: f64) -> i32;
    #[link_name = "hochpass"] fn k_hochpass(id: i32, fr: f64, q: f64) -> i32;
    #[link_name = "verstaerke"] fn k_verstaerke(id: i32, faktor: f64) -> i32;
    #[link_name = "mische"] fn k_mische(a: i32, b: i32, ab: f64) -> i32;
    #[link_name = "dann"] fn k_dann(a: i32, b: i32) -> i32;
    #[link_name = "wiederhole"] fn k_wiederhole(id: i32, n: f64) -> i32;
    #[link_name = "nahtlos"] fn k_nahtlos(id: i32, u: f64) -> i32;
    #[link_name = "dauer"] fn k_dauer(id: i32) -> f64;
    #[link_name = "hash"] fn k_hash(id: i32, p: i32) -> i32;
    #[link_name = "laden"] fn k_laden(pp: i32, pl: i32, tp: i32, tl: i32) -> i32;
}

#[link(wasm_import_module = "pizza")]
extern "C" {
    /// 1 = Erzeuger da; 0 = fehlt (pflicht = 1: der Host hat `fehler HOST` gemeldet)
    fn klang_kern(pflicht: i32) -> i32;
    /// Kopierweg Programm → Erzeuger
    fn klang_schreibe(kern: i32, prog: *const u8, len: i32);
    /// Kopierweg Erzeuger → Programm
    fn klang_lies(prog: *mut u8, kern: i32, len: i32);
    /// Ereignis (JSON ohne `typ`) an den Host; klang > 0: PCM dieses Klangs für die Wiedergabe (nur „spiele“)
    fn klang_senden(p: *const u8, n: i32, klang: i32);
}

// ---------------------------------------------------------------- Zustand
const MOD_NAMEN: [&str; 5] = ["ton", "rauschen", "stille", "noten", "laden"];
const KLANG_NAMEN: [&str; 12] = ["huelle", "tiefpass", "hochpass", "verstaerke", "mische", "dann", "wiederhole", "nahtlos", "dauer", "id",
    "spiele", "alsText"];
const SPUR_NAMEN: [&str; 15] = ["stoppe", "laeuft", "lautstaerke", "setzeLautstaerke", "tonhoehe", "setzeTonhoehe", "panorama",
    "setzePanorama", "setzeLage", "reichweite", "setzeReichweite", "klang", "beimEnde", "id", "alsText"];

struct Tabs { m: Vec<u8>, k: Vec<u8>, s: Vec<u8>, id_klang: u32, id_spur: u32 }
static mut TABS: Option<Tabs> = None;
/// 0 = noch nicht versucht, 1 = geladen, 2 = fehlt
static mut ZUSTAND_K: u8 = 0;
/// 0 = Programm ohne Gruppe klang, 1 = Gruppe klang, 2 = Erzeuger vor dem Start Pflicht
static mut NOETIG: i32 = 0;
static mut SPUR_NR: u32 = 0;
/// bis zum nächsten Herd-Bild gesammelte Ereignisse (JSON, Klang-ID)
static mut WARTE: Vec<(Vec<u8>, i32)> = Vec::new();
/// Spuren mit beimEnde, nach Nummer
static mut ENDEN: Vec<W> = Vec::new();
/// H-K22: Klang-ID → Klang (Feldtyp `klang`), Index = ID
static mut KLAENGE: Vec<W> = Vec::new();
/// H-K22: Schall-Handle → Spur (aus dem Klangbild des Kerns)
static mut SCHALL: Vec<(u32, W)> = Vec::new();

fn nid(s: &str) -> u32 { name_id(neu_str(s)) }
fn tab(t: &mut Vec<u8>, namen: &[&str]) {
    for (i, n) in namen.iter().enumerate() {
        let id = nid(n) as usize;
        if t.len() <= id { t.resize(id + 1, 0); }
        t[id] = i as u8 + 1;
    }
}
fn tabs() -> &'static Tabs {
    unsafe {
        if TABS.is_none() {
            let mut t = Tabs { m: Vec::new(), k: Vec::new(), s: Vec::new(), id_klang: nid("Klang"), id_spur: nid("Spur") };
            tab(&mut t.m, &MOD_NAMEN);
            tab(&mut t.k, &KLANG_NAMEN);
            tab(&mut t.s, &SPUR_NAMEN);
            TABS = Some(t);
        }
        TABS.as_ref().unwrap()
    }
}
fn code(t: &[u8], id: u32) -> usize { t.get(id as usize).copied().unwrap_or(0) as usize }

/// Erzeuger holen (lazy). pflicht: fehlt er, meldet der Host den HOST-Fehler (nur vor dem Start).
fn lade(pflicht: bool) -> bool {
    unsafe {
        if ZUSTAND_K == 1 { return true; }
        if ZUSTAND_K == 2 && !pflicht { return false; }
        if crate::in_kueche() { return false; }
        if klang_kern(if pflicht { 1 } else { 0 }) != 1 { ZUSTAND_K = 2; return false; }
        ZUSTAND_K = 1;
        true
    }
}
/// vom Programm gesetzt, wenn es die Gruppe klang importiert: pflicht = 1, wenn es `Klang.…` enthält (Startprüfung)
#[no_mangle]
pub extern "C" fn rt_klang_noetig(pflicht: i32) { unsafe { NOETIG = if pflicht == 1 { 2 } else { 1 }; } }
/// vor `vorbereiten`: false = Erzeuger fehlt (Host hat gemeldet) → Exit 2
pub fn start() -> bool { if unsafe { NOETIG } == 2 { lade(true) } else { true } }
fn erzeuger_noetig() -> bool {
    if lade(false) { return true; }
    wirf_ananas(K_LAUFZEIT, "Interner Fehler im Klang: der Klang-Erzeuger fehlt (klang.wasm).");
    false
}

// ---------------------------------------------------------------- Kopierweg, Fehler
fn kp(len: usize) -> i32 { unsafe { k_puffer(if len == 0 { 1 } else { len as i32 }) } }
/// zwei Texte nacheinander in den Austauschpuffer → (p1, l1, p2, l2)
fn texte(a: &[u8], b: &[u8]) -> (i32, i32, i32, i32) {
    let p = kp(a.len() + b.len() + 1);
    let mut v = Vec::with_capacity(a.len() + b.len());
    v.extend_from_slice(a);
    v.extend_from_slice(b);
    if !v.is_empty() { unsafe { klang_schreibe(p, v.as_ptr(), v.len() as i32); } }
    (p, a.len() as i32, p + a.len() as i32, b.len() as i32)
}
fn fehler() {
    let art = unsafe { k_fehler_art() };
    let mut kap: i32 = 64;
    let text = loop {
        let p = kp(kap as usize);
        let n = unsafe { k_fehler_text(p, kap) };
        if n <= kap {
            let mut v = alloc::vec![0u8; n.max(0) as usize];
            if n > 0 { unsafe { klang_lies(v.as_mut_ptr(), p, n); } }
            break v;
        }
        kap = n;
    };
    unsafe { k_fehler_neu(); }
    let mut t = Tb::neu();
    t.b(&text);
    wirf_tb(if art == 1 { K_TYP } else { K_LAUFZEIT }, &t);
}
/// Erzeuger-Ergebnis → neuer Klang (oder Ananas)
fn klang_neu(r: i32) -> W {
    if r < 0 { fehler(); return KARTON; }
    let p = kp(16);
    let mut h = [0u8; 16];
    unsafe {
        k_hash(r, p);
        klang_lies(h.as_mut_ptr(), p, 16);
    }
    let o = neu_w(KObj { art: A_KLANG, id: r as u32, dauer: unsafe { k_dauer(r) }, hash: h });
    unsafe {
        let i = r as usize;
        if KLAENGE.len() <= i { KLAENGE.resize(i + 1, KARTON); }
        KLAENGE[i] = o;
    }
    o
}

// ---------------------------------------------------------------- Argumente
fn argn(pos: &[W], ben: &Ben, i: usize, name: &str) -> W {
    if i < pos.len() { return pos[i]; }
    for &(n, w) in ben.iter() { if bytes(name_text(n)) == name.as_bytes() { return w; } }
    UNDEF
}
fn leer(v: W) -> bool { v == UNDEF || v == KARTON }
fn typ_fehler(wo: &str, was: &str, param: &str, v: W) {
    let mut t = Tb::neu();
    t.s(wo).s("() braucht ").s(was).s(" für '").s(param).s("', nicht ");
    darstellung(if v == UNDEF { KARTON } else { v }, &mut t);
    if sig() { return; }
    t.s(".");
    wirf_tb(K_TYP, &t);
}
fn zahl_arg(v: W, wo: &str, param: &str, std: Option<f64>) -> Option<f64> {
    if leer(v) { if let Some(s) = std { return Some(s); } } else if ist_zahl(v) { return Some(f(v)); }
    typ_fehler(wo, "eine Zahl", param, v);
    None
}
fn text_arg(v: W, wo: &str, param: &str, std: Option<&'static str>) -> Option<Vec<u8>> {
    if leer(v) { if let Some(s) = std { return Some(s.as_bytes().to_vec()); } } else if art(v) == A_TEXT { return Some(bytes(v).to_vec()); }
    typ_fehler(wo, "einen Text", param, v);
    None
}
fn klang_arg(v: W, wo: &str, param: &str) -> Option<i32> {
    if art(v) == A_KLANG { return Some(obj::<KObj>(v).id as i32); }
    typ_fehler(wo, "einen Klang", param, v);
    None
}
fn bereich(wo: &str, was: &str, w: f64, min: f64, max: f64) -> Option<f64> {
    if w >= min && w <= max { return Some(w); }
    let mut t = Tb::neu();
    t.s(wo).s("() braucht ").s(was).s(" von ").n(min).s(" bis ").n(max).s(", nicht ").n(w).s(".");
    wirf_tb(K_LAUFZEIT, &t);
    None
}

// ---------------------------------------------------------------- Zeit, Ereignisse
/// simulierte Zeit (Sekunden): mit Herd die Bildzeit (herd.zeit()), sonst die Uhr des Programms (Uhr.jetzt())
fn jetzt() -> f64 {
    match crate::herd::bildzeit() { Some(b) => b / 60.0, None => (z().schritte + z().offset) / 1000.0 }
}
fn laeuft(s: &SObj) -> bool { s.gestoppt == 0 && jetzt() < s.ende }

fn senden(json: Vec<u8>, id: i32) {
    if crate::herd::fenster_offen() { unsafe { WARTE.push((json, id)); } return; }
    unsafe { klang_senden(json.as_ptr(), json.len() as i32, id); }
}
/// gesammelte Ereignisse hinaus (vor jedem Herd-Bild, vor schliesse, am Programmende)
pub fn flush() {
    let w = unsafe { core::mem::take(&mut WARTE) };
    for (json, id) in w { unsafe { klang_senden(json.as_ptr(), json.len() as i32, id); } }
}
pub fn ende() { flush(); }

fn jz(x: f64, out: &mut Vec<u8>) { zl::js_text(x, out); }
fn setze_ereignis(s: &SObj) {
    if !laeuft(s) { return; }
    let mut b: Vec<u8> = Vec::from(&b"{\"art\":\"setze\",\"spur\":"[..]);
    jz(s.nr as f64, &mut b);
    b.extend_from_slice(b",\"lautstaerke\":");
    jz(s.laut, &mut b);
    b.extend_from_slice(b",\"tonhoehe\":");
    jz(s.ton, &mut b);
    b.extend_from_slice(b",\"panorama\":");
    jz(s.pan, &mut b);
    b.extend_from_slice(b",\"lage\":");
    if s.hat_lage != 0 {
        b.push(b'[');
        jz(s.lage[0], &mut b);
        b.push(b',');
        jz(s.lage[1], &mut b);
        b.push(b',');
        jz(s.lage[2], &mut b);
        b.push(b']');
    } else {
        b.extend_from_slice(b"null");
    }
    b.extend_from_slice(b",\"reichweite\":");
    jz(s.reichweite, &mut b);
    b.push(b'}');
    senden(b, 0);
}

// ---------------------------------------------------------------- Modul Klang (statisch)
pub fn modul_wert(id: u32) -> Option<W> {
    static mut CACHE: W = KARTON;
    if id != tabs().id_klang { return None; }
    unsafe {
        if CACHE == KARTON { CACHE = neu_w(Ref { art: A_MODUL, id }); }
        Some(CACHE)
    }
}
pub fn ist_modul(m: u32) -> bool { m == tabs().id_klang }
pub fn modul_hat(m: u32, id: u32) -> bool { ist_modul(m) && code(&tabs().m, id) != 0 }
pub fn modul_methode(id: u32, pos: &[W], ben: &Ben) -> W {
    if crate::kueche::nur_hauptkueche(T_KLANG) { return KARTON; }
    macro_rules! z { ($i:expr, $n:expr, $wo:expr) => { match zahl_arg(argn(pos, ben, $i, $n), $wo, $n, None) { Some(x) => x, None => return KARTON } };
                     ($i:expr, $n:expr, $wo:expr, $s:expr) => { match zahl_arg(argn(pos, ben, $i, $n), $wo, $n, Some($s)) { Some(x) => x, None => return KARTON } }; }
    macro_rules! t { ($i:expr, $n:expr, $wo:expr, $s:expr) => { match text_arg(argn(pos, ben, $i, $n), $wo, $n, $s) { Some(x) => x, None => return KARTON } }; }
    match MOD_NAMEN[code(&tabs().m, id) - 1] {
        "ton" => {
            let fr = z!(0, "frequenz", "ton");
            let d = z!(1, "dauer", "ton");
            let w = t!(2, "welle", "ton", Some("sinus"));
            let laut = z!(3, "lautstaerke", "ton", 0.5);
            let bis = z!(4, "bis", "ton", 0.0);
            let an = z!(5, "anschlag", "ton", 0.005);
            let aus = z!(6, "ausklang", "ton", 0.02);
            if !erzeuger_noetig() { return KARTON; }
            let (p, l, _, _) = texte(&w, b"");
            klang_neu(unsafe { k_ton(fr, d, p, l, laut, bis, an, aus) })
        }
        "rauschen" => {
            let d = z!(0, "dauer", "rauschen");
            let a = t!(1, "art", "rauschen", Some("weiss"));
            let laut = z!(2, "lautstaerke", "rauschen", 0.5);
            let an = z!(3, "anschlag", "rauschen", 0.005);
            let aus = z!(4, "ausklang", "rauschen", 0.02);
            let saat = z!(5, "saat", "rauschen", 1.0);
            if !erzeuger_noetig() { return KARTON; }
            let (p, l, _, _) = texte(&a, b"");
            klang_neu(unsafe { k_rauschen(d, p, l, laut, an, aus, saat) })
        }
        "stille" => {
            let d = z!(0, "dauer", "stille");
            if !erzeuger_noetig() { return KARTON; }
            klang_neu(unsafe { k_stille(d) })
        }
        "laden" => laden(argn(pos, ben, 0, "pfad")),
        _ => {
            let tx = t!(0, "text", "noten", None);
            let tempo = z!(1, "tempo", "noten", 120.0);
            let w = t!(2, "welle", "noten", Some("rechteck"));
            let laut = z!(3, "lautstaerke", "noten", 0.3);
            if !erzeuger_noetig() { return KARTON; }
            let (p1, l1, p2, l2) = texte(&tx, &w);
            klang_neu(unsafe { k_noten(p1, l1, tempo, p2, l2, laut) })
        }
    }
}

/// Pfad → schon geladener Klang (H-K19a, wie `MODELLE` in herd.rs)
static mut GELADEN: Vec<(W, W)> = Vec::new();

/// `Klang.laden(pfad)` (H-K19a, auch ohne Herd): Klangteig aus der Kiste (Datensegment) über den Kopierweg in den Erzeuger,
/// dann `laden`. Reihenfolge wie im Interpreter: kein Text → TypAnanas · Erzeuger · schon geladen · fehlt in der Kiste · keine
/// Klang-Endung (leerer Teig) bzw. Fehler-Klangteig → Text des Erzeugers („<pfad> ist kein lesbarer Klang …“).
fn laden(pw: W) -> W {
    if art(pw) != A_TEXT {
        let mut t = Tb::neu();
        t.s("Klang.laden() braucht einen Text für 'pfad', nicht ");
        darstellung(if pw == UNDEF { KARTON } else { pw }, &mut t);
        if sig() { return KARTON; }
        t.s(".");
        wirf_tb(K_TYP, &t);
        return KARTON;
    }
    if !erzeuger_noetig() { return KARTON; }
    let pb = bytes(pw);
    if let Some(&(_, w)) = unsafe { (*core::ptr::addr_of!(GELADEN)).iter().find(|x| bytes(x.0) == pb) } { return w; }
    let e = match crate::kiste::finde(pb) {
        Some(e) => e,
        None => {
            let mut t = Tb::neu();
            t.s("Die Datei \"").b(pb).s("\" liegt nicht in der Kiste.");
            wirf_tb(K_LAUFZEIT, &t);
            return KARTON;
        }
    };
    let tl = if e.art == crate::kiste::ART_KLANG { e.len as usize } else { 0 };
    let p = kp(pb.len() + tl + 1);
    unsafe { klang_schreibe(p, pb.as_ptr(), pb.len() as i32); }
    let tp = p + pb.len() as i32;
    if tl > 0 { crate::kiste::stueckweise(&e, |o, b| unsafe { klang_schreibe(tp + o as i32, b.as_ptr(), b.len() as i32) }); }
    let w = klang_neu(unsafe { k_laden(p, pb.len() as i32, tp, tl as i32) });
    if w == KARTON { return KARTON; }
    unsafe { (*core::ptr::addr_of_mut!(GELADEN)).push((neu_text(pb), w)); }
    w
}

// ---------------------------------------------------------------- Objekte
pub fn ist_klang_obj(w: W) -> bool { matches!(art(w), A_KLANG | A_SPUR) }
pub fn text_in(v: W, tb: &mut Tb) {
    if art(v) == A_KLANG { tb.s("Klang(").n(obj::<KObj>(v).id as f64).s(")"); } else { tb.s("Spur(").n(obj::<SObj>(v).nr as f64).s(")"); }
}
pub fn typ_name(v: W, tb: &mut Tb) { tb.s(if art(v) == A_KLANG { "Klang" } else { "Spur" }); }
pub fn karton_art(v: W) -> &'static str { if art(v) == A_KLANG { "Ein Klang" } else { "Eine Spur" } }
/// Typprüfung für Klang/Spur (eigene Klassen hat der Aufrufer schon ausgeschlossen); None = kein Klang-Typ
pub fn typ_passt(typ: u32, v: W) -> Option<bool> {
    let t = tabs();
    if typ == t.id_klang { return Some(art(v) == A_KLANG); }
    if typ == t.id_spur { return Some(art(v) == A_SPUR); }
    None
}
/// `neu Klang()` / `neu Spur()` (ohne eigene Klasse) → RohlingAnanas
pub fn neu_moeglich(id: u32) -> bool { let t = tabs(); id == t.id_klang || id == t.id_spur }
pub fn neu(id: u32) -> W {
    let mut t = Tb::neu();
    t.s("'").name(id).s("' kann man nicht mit neu backen.");
    wirf_tb(K_ROHLING, &t);
    KARTON
}

pub fn tabelle_hat(o: W, id: u32) -> bool {
    let t = tabs();
    if art(o) == A_KLANG { code(&t.k, id) != 0 } else { code(&t.s, id) != 0 }
}
pub fn methode(o: W, id: u32, pos: &[W], ben: &Ben, _knoten: i32) -> W {
    if !tabelle_hat(o, id) { return crate::std_m::nicht_gefunden(o, id); }
    if crate::kueche::nur_hauptkueche(T_KLANG) { return KARTON; }
    if art(o) == A_KLANG { klang_methode(o, id, pos, ben) } else { spur_methode(o, id, pos, ben) }
}

fn klang_methode(o: W, id: u32, pos: &[W], ben: &Ben) -> W {
    let k = obj::<KObj>(o);
    let kid = k.id as i32;
    macro_rules! z { ($i:expr, $n:expr, $wo:expr) => { match zahl_arg(argn(pos, ben, $i, $n), $wo, $n, None) { Some(x) => x, None => return KARTON } };
                     ($i:expr, $n:expr, $wo:expr, $s:expr) => { match zahl_arg(argn(pos, ben, $i, $n), $wo, $n, Some($s)) { Some(x) => x, None => return KARTON } }; }
    macro_rules! k { ($i:expr, $n:expr, $wo:expr) => { match klang_arg(argn(pos, ben, $i, $n), $wo, $n) { Some(x) => x, None => return KARTON } }; }
    unsafe {
        match KLANG_NAMEN[code(&tabs().k, id) - 1] {
            "huelle" => {
                let an = z!(0, "anschlag", "huelle", 0.0);
                let ab = z!(1, "abfall", "huelle", 0.0);
                let ha = z!(2, "halten", "huelle", 1.0);
                let aus = z!(3, "ausklang", "huelle", 0.0);
                klang_neu(k_huelle(kid, an, ab, ha, aus))
            }
            "tiefpass" => { let fr = z!(0, "frequenz", "tiefpass"); let q = z!(1, "guete", "tiefpass", 0.707); klang_neu(k_tiefpass(kid, fr, q)) }
            "hochpass" => { let fr = z!(0, "frequenz", "hochpass"); let q = z!(1, "guete", "hochpass", 0.707); klang_neu(k_hochpass(kid, fr, q)) }
            "verstaerke" => { let fa = z!(0, "faktor", "verstaerke"); klang_neu(k_verstaerke(kid, fa)) }
            "mische" => { let b = k!(0, "anderer", "mische"); let ab = z!(1, "ab", "mische", 0.0); klang_neu(k_mische(kid, b, ab)) }
            "dann" => { let b = k!(0, "anderer", "dann"); klang_neu(k_dann(kid, b)) }
            "wiederhole" => { let n = z!(0, "n", "wiederhole"); klang_neu(k_wiederhole(kid, n)) }
            "nahtlos" => { let u = z!(0, "ueberblendung", "nahtlos", 0.05); klang_neu(k_nahtlos(kid, u)) }
            "dauer" => zahl(k.dauer),
            "id" => zahl(k.id as f64),
            "spiele" => spiele(o, pos, ben),
            _ => text(o),
        }
    }
}

// k.spiele(lautstaerke: 1, schleife: nein, tonhoehe: 1, panorama: 0) → Spur
fn spiele(o: W, pos: &[W], ben: &Ben) -> W {
    let laut = match zahl_arg(argn(pos, ben, 0, "lautstaerke"), "spiele", "lautstaerke", Some(1.0)) { Some(x) => x, None => return KARTON };
    let laut = match bereich("spiele", "eine Lautstärke", laut, 0.0, 2.0) { Some(x) => x, None => return KARTON };
    let sw = argn(pos, ben, 1, "schleife");
    let schleife = if leer(sw) { false } else { let b = bool_pruefen(sw); if sig() { return KARTON; } b };
    let ton = match zahl_arg(argn(pos, ben, 2, "tonhoehe"), "spiele", "tonhoehe", Some(1.0)) { Some(x) => x, None => return KARTON };
    let ton = match bereich("spiele", "eine Tonhöhe", ton, 0.125, 8.0) { Some(x) => x, None => return KARTON };
    let pan = match zahl_arg(argn(pos, ben, 3, "panorama"), "spiele", "panorama", Some(0.0)) { Some(x) => x, None => return KARTON };
    let pan = match bereich("spiele", "ein Panorama", pan, -1.0, 1.0) { Some(x) => x, None => return KARTON };
    spur_neu(o, laut, ton, pan, schleife)
}

/// Neue Spur von Klang `o` und Ereignis „spiele“ (k.spiele und Schall-Start)
fn spur_neu(o: W, laut: f64, ton: f64, pan: f64, schleife: bool) -> W {
    let k = obj::<KObj>(o);
    let nr = unsafe { SPUR_NR += 1; SPUR_NR };
    let start = jetzt();
    let ende = if schleife { f64::INFINITY } else { start + k.dauer / ton };
    let s = neu_w(SObj { art: A_SPUR, nr, klang: o, laut, ton, pan, lage: [0.0; 3], reichweite: 30.0, start, ende, ende_fn: KARTON,
        hat_lage: 0, schleife: schleife as u8, gestoppt: 0, gemeldet: 0 });
    let mut b: Vec<u8> = Vec::from(&b"{\"art\":\"spiele\",\"spur\":"[..]);
    jz(nr as f64, &mut b);
    b.extend_from_slice(b",\"klang\":\"");
    b.extend_from_slice(&k.hash);
    b.extend_from_slice(b"\",\"lautstaerke\":");
    jz(laut, &mut b);
    b.extend_from_slice(b",\"tonhoehe\":");
    jz(ton, &mut b);
    b.extend_from_slice(b",\"panorama\":");
    jz(pan, &mut b);
    b.extend_from_slice(if schleife { b",\"schleife\":true}" } else { b",\"schleife\":false}" });
    senden(b, k.id as i32);
    s
}

fn spur_methode(o: W, id: u32, pos: &[W], ben: &Ben) -> W {
    let s = obj::<SObj>(o);
    macro_rules! z { ($i:expr, $n:expr, $wo:expr) => { match zahl_arg(argn(pos, ben, $i, $n), $wo, $n, None) { Some(x) => x, None => return KARTON } };
                     ($i:expr, $n:expr, $wo:expr, $s:expr) => { match zahl_arg(argn(pos, ben, $i, $n), $wo, $n, Some($s)) { Some(x) => x, None => return KARTON } }; }
    macro_rules! b { ($wo:expr, $was:expr, $w:expr, $min:expr, $max:expr) => { match bereich($wo, $was, $w, $min, $max) { Some(x) => x, None => return KARTON } }; }
    match SPUR_NAMEN[code(&tabs().s, id) - 1] {
        "stoppe" => {
            let lief = laeuft(s);
            s.gestoppt = 1;
            if lief {
                let mut b: Vec<u8> = Vec::from(&b"{\"art\":\"stoppe\",\"spur\":"[..]);
                jz(s.nr as f64, &mut b);
                b.push(b'}');
                senden(b, 0);
            }
            o
        }
        "laeuft" => bool_w(laeuft(s)),
        "lautstaerke" => zahl(s.laut),
        "setzeLautstaerke" => { let v = z!(0, "v", "setzeLautstaerke"); s.laut = b!("setzeLautstaerke", "eine Lautstärke", v, 0.0, 2.0); setze_ereignis(s); o }
        "tonhoehe" => zahl(s.ton),
        "setzeTonhoehe" => {
            let t = z!(0, "t", "setzeTonhoehe");
            let t = b!("setzeTonhoehe", "eine Tonhöhe", t, 0.125, 8.0);
            let j = jetzt();
            if s.schleife == 0 && s.gestoppt == 0 && j < s.ende { s.ende = j + (s.ende - j) * s.ton / t; }
            s.ton = t;
            setze_ereignis(s);
            o
        }
        "panorama" => zahl(s.pan),
        "setzePanorama" => { let p = z!(0, "p", "setzePanorama"); s.pan = b!("setzePanorama", "ein Panorama", p, -1.0, 1.0); setze_ereignis(s); o }
        "setzeLage" => {
            let x = z!(0, "x", "setzeLage");
            let y = z!(1, "y", "setzeLage");
            let zz = z!(2, "z", "setzeLage", 0.0);
            s.lage = [x, y, zz];
            s.hat_lage = 1;
            setze_ereignis(s);
            o
        }
        "reichweite" => zahl(s.reichweite),
        "setzeReichweite" => { let r = z!(0, "r", "setzeReichweite"); s.reichweite = b!("setzeReichweite", "eine Reichweite", r, 1.0, 10000.0); setze_ereignis(s); o }
        "klang" => s.klang,
        "beimEnde" => {
            let fw = argn(pos, ben, 0, "fn");
            let fw = if leer(fw) { KARTON } else { fw };
            if fw != KARTON && !ist_funktion(fw) { wirf_ananas(K_TYP, "beimEnde() braucht eine Funktion, z. B. () -> { … }."); return KARTON; }
            s.ende_fn = fw;
            unsafe {
                if fw != KARTON && !ENDEN.iter().any(|&x| x == o) {
                    let i = ENDEN.iter().position(|&x| obj::<SObj>(x).nr > s.nr).unwrap_or(ENDEN.len());
                    ENDEN.insert(i, o);
                }
            }
            o
        }
        "id" => zahl(s.nr as f64),
        _ => text(o),
    }
}

// ---------------------------------------------------------------- beimEnde (nach den Kniffen jedes Takts, herd.rs backe)
pub fn hat_enden() -> bool { unsafe { !ENDEN.is_empty() } }
/// Spuren nach Nummer, die bis jetzt ausgelaufen sind (nicht gestoppt, ohne Schleife), je einmal; Schnappschuss zu Beginn.
/// Ein schliesse() im Rückruf beendet die Phase (der Aufrufer prüft das wie bei den Kniffen).
pub fn ende_phase(knoten: i32) {
    let j = jetzt();
    let faellig: Vec<W> = unsafe {
        ENDEN.iter().copied().filter(|&w| {
            let s = obj::<SObj>(w);
            s.ende_fn != KARTON && s.gemeldet == 0 && s.gestoppt == 0 && s.schleife == 0 && j >= s.ende
        }).collect()
    };
    if faellig.is_empty() { return; }
    for &w in faellig.iter() { obj::<SObj>(w).gemeldet = 1; }
    unsafe { ENDEN.retain(|&w| obj::<SObj>(w).gemeldet == 0); }
    for &w in faellig.iter() {
        rufe(obj::<SObj>(w).ende_fn, &[], &[], knoten);
        if sig() || crate::herd::schliessen_angefordert() { return; }
    }
}

// ---------------------------------------------------------------- Schall (H-K22): Feldtyp klang, Klangbild → Spuren
/// Erzeuger geladen? (dann kann es Klänge und damit laufende Schalle geben)
pub fn geladen() -> bool { unsafe { ZUSTAND_K == 1 } }
/// Klang-ID eines Klangs (Feldtyp `klang`), None = kein Klang
pub fn klang_id(v: W) -> Option<u32> { if art(v) == A_KLANG { Some(obj::<KObj>(v).id) } else { None } }
/// Klang zur ID (Feldtyp `klang` lesen), KARTON = unbekannt
pub fn klang_von_id(id: u32) -> W { unsafe { KLAENGE.get(id as usize).copied().unwrap_or(KARTON) } }
/// Klangbild des letzten Herd-Bilds (je Eintrag art 1 start · 2 raum · 3 stopp, Komponente, Klang-ID, Pegel, Panorama, Tonhöhe,
/// Schleife) → eigene Spuren je Schall, Ereignisse spiele/raum/stoppe; raum nur, solange die Spur läuft. Spiegel des
/// Interpreters (klang/kern.js schallBild).
pub fn schall_bild() {
    let Some(z) = crate::herd::klangbild_lesen() else { return };
    let mut i = 0;
    while i + 7 <= z.len() {
        let (a, h, id, laut, pan, ton, schleife) = (z[i], z[i + 1] as u32, z[i + 2], z[i + 3], z[i + 4], z[i + 5], z[i + 6] != 0.0);
        i += 7;
        if a == 1.0 {
            let o = klang_von_id(id as u32);
            if o == KARTON { continue; }
            let s = spur_neu(o, laut, ton, pan, schleife);
            unsafe {
                match SCHALL.iter().position(|x| x.0 == h) { Some(p) => SCHALL[p].1 = s, None => SCHALL.push((h, s)) }
            }
            continue;
        }
        let Some(p) = (unsafe { SCHALL.iter().position(|x| x.0 == h) }) else { continue };
        let o = unsafe { SCHALL[p].1 };
        let s = obj::<SObj>(o);
        if a == 2.0 {
            let j = jetzt();
            if s.schleife == 0 && s.gestoppt == 0 && j < s.ende { s.ende = j + (s.ende - j) * s.ton / ton; }
            s.ton = ton;
            s.laut = laut;
            s.pan = pan;
            if laeuft(s) {
                let mut b: Vec<u8> = Vec::from(&b"{\"art\":\"raum\",\"spur\":"[..]);
                jz(s.nr as f64, &mut b);
                b.extend_from_slice(b",\"lautstaerke\":");
                jz(laut, &mut b);
                b.extend_from_slice(b",\"tonhoehe\":");
                jz(ton, &mut b);
                b.extend_from_slice(b",\"panorama\":");
                jz(pan, &mut b);
                b.push(b'}');
                senden(b, 0);
            }
        } else if a == 3.0 {
            unsafe { SCHALL.remove(p); }
            let lief = laeuft(s);
            s.gestoppt = 1;
            if lief {
                let mut b: Vec<u8> = Vec::from(&b"{\"art\":\"stoppe\",\"spur\":"[..]);
                jz(s.nr as f64, &mut b);
                b.push(b'}');
                senden(b, 0);
            }
        }
    }
}
