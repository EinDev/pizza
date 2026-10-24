//! Herd – Spiel-Engine (SPEC §18, HERD.md, herd/README.md §3): dünne Anbindung an den Herd-Kern über die
//! Importgruppe `herd` (HOST-ABI §2). Szene, Systeme, Prüfungen und Fehlertexte leben im Kern; hier stehen nur
//! Sprachtypen, Objektidentität (Handle → Objekt), Textformen, Spielschleife, Eingabe und Fenster-Ereignisse.
//!
//! Spiegel von `site/js/pizza.js` (Abschnitt HERD): dieselbe Folge von Kern-Aufrufen ⇒ bitgleiche Szenen-/Paket-Hashes.
//! Komponenten kommen generisch aus dem Schema des geladenen Kerns (`schema_json`) – eine neue Komponente braucht
//! hier keine Änderung (HERD.md §9).
//!
//! Importe: Modul `herd` = die Exporte von `kern.wasm` unter gleichem Namen (Zeiger zeigen in den Speicher **des
//! Kerns**; die Laufzeit dereferenziert sie nie), Modul `pizza`: `herd_kern`, `herd_schreibe`/`herd_lies`
//! (Kopierweg Programm-Speicher ↔ Kern-Speicher), `herd_warte`, `herd_senden`.

use crate::klassen::*;
use crate::ops::*;
use crate::namen::*;
use crate::text::*;
use crate::wert::*;
use crate::{sig, z, zahl as zl};
use alloc::string::String;
use alloc::vec::Vec;

pub const A_HERD: u32 = 40;
pub const A_TEIL: u32 = 41;
pub const A_KOMP: u32 = 42;
pub const A_FORM: u32 = 43;
pub const A_BILDCHEN: u32 = 44;

#[repr(C)] pub struct HWelt { pub art: u32, pub _r: u32 }
#[repr(C)] pub struct HTeil { pub art: u32, pub id: u32 }
#[repr(C)] pub struct HKomp { pub art: u32, pub h: u32, pub typ: u32, pub teil: u32 }
#[repr(C)] pub struct HForm { pub art: u32, pub id: u32 }
#[repr(C)] pub struct HBildchen { pub art: u32, pub id: u32, pub breite: f64, pub hoehe: f64 }

pub const T_HERD: &str = "Den Herd gibt es nur in der Hauptküche.";
const W0104: &str = "Kein Herd verfügbar – Fenster wird nicht angezeigt.";

// ---------------------------------------------------------------- Importe
#[link(wasm_import_module = "herd")]
extern "C" {
    #[link_name = "puffer"] fn k_puffer(len: i32) -> i32;
    #[link_name = "fehler_art"] fn k_fehler_art() -> i32;
    #[link_name = "fehler_text"] fn k_fehler_text(p: i32, kap: i32) -> i32;
    #[link_name = "fehler_neu"] fn k_fehler_neu() -> i32;
    #[link_name = "melde_typfehler"] fn k_melde_typfehler(typ: i32, feld: i32, p: i32, n: i32) -> i32;
    #[link_name = "welt_neu"] fn k_welt_neu(b: f64, h: f64, p: i32, n: i32) -> i32;
    #[link_name = "welt_titel"] fn k_welt_titel(p: i32, n: i32) -> i32;
    #[link_name = "welt_hintergrund"] fn k_welt_hintergrund(p: i32, n: i32) -> i32;
    #[link_name = "welt_himmel"] fn k_welt_himmel(op: i32, on: i32, up: i32, un: i32) -> i32;
    #[link_name = "welt_umgebung"] fn k_welt_umgebung(p: i32, n: i32, s: f64) -> i32;
    #[link_name = "welt_nebel"] fn k_welt_nebel(p: i32, n: i32, von: f64, bis: f64) -> i32;
    #[link_name = "teil_neu"] fn k_teil_neu(raum: i32) -> i32;
    #[link_name = "teil_entferne"] fn k_teil_entferne(t: i32) -> i32;
    #[link_name = "teil_kopie"] fn k_teil_kopie(t: i32) -> i32;
    #[link_name = "teil_haenge"] fn k_teil_haenge(t: i32, an: i32) -> i32;
    #[link_name = "teil_kinder"] fn k_teil_kinder(t: i32, p: i32, kap: i32) -> i32;
    #[link_name = "teil_setze"] fn k_teil_setze(t: i32, feld: i32, w: f64) -> i32;
    #[link_name = "teil_hole"] fn k_teil_hole(t: i32, feld: i32) -> f64;
    #[link_name = "teil_lage"] fn k_teil_lage(t: i32, x: f64, y: f64, z: f64) -> i32;
    #[link_name = "teil_verschiebe"] fn k_teil_verschiebe(t: i32, x: f64, y: f64, z: f64) -> i32;
    #[link_name = "teil_groesse"] fn k_teil_groesse(t: i32, x: f64, y: f64, z: f64) -> i32;
    #[link_name = "teil_schaue"] fn k_teil_schaue(t: i32, x: f64, y: f64, z: f64) -> i32;
    #[link_name = "teil_trifft"] fn k_teil_trifft(a: i32, b: i32) -> i32;
    #[link_name = "komp_neu"] fn k_komp_neu(typ: i32) -> i32;
    #[link_name = "komp_haenge"] fn k_komp_haenge(k: i32, t: i32) -> i32;
    #[link_name = "komp_loese"] fn k_komp_loese(k: i32) -> i32;
    #[link_name = "komp_von"] fn k_komp_von(t: i32, typ: i32) -> i32;
    #[link_name = "komp_info"] fn k_komp_info(k: i32, was: i32) -> i32;
    #[link_name = "typ_nummer"] fn k_typ_nummer(p: i32, n: i32) -> i32;
    #[link_name = "feld_nummer"] fn k_feld_nummer(typ: i32, p: i32, n: i32) -> i32;
    #[link_name = "setze_zahl"] fn k_setze_zahl(k: i32, feld: i32, w: f64) -> i32;
    #[link_name = "hole_zahl"] fn k_hole_zahl(k: i32, feld: i32) -> f64;
    #[link_name = "setze_text"] fn k_setze_text(k: i32, feld: i32, p: i32, n: i32) -> i32;
    #[link_name = "hole_text"] fn k_hole_text(k: i32, feld: i32, p: i32, kap: i32) -> i32;
    #[link_name = "setze_liste"] fn k_setze_liste(k: i32, feld: i32, p: i32, n: i32) -> i32;
    #[link_name = "hole_liste"] fn k_hole_liste(k: i32, feld: i32, p: i32, kap: i32) -> i32;
    #[link_name = "setze_zahlen"] fn k_setze_zahlen(k: i32, feld: i32, p: i32, n: i32) -> i32;
    #[link_name = "hole_zahlen"] fn k_hole_zahlen(k: i32, feld: i32, p: i32, kap: i32) -> i32;
    #[link_name = "form_grund"] fn k_form_grund(art: i32, teile: f64, dicke: f64) -> i32;
    #[link_name = "form_eigene"] fn k_form_eigene(pp: i32, pn: i32, dp: i32, dn: i32, glatt: i32) -> i32;
    #[link_name = "bildchen_neu"] fn k_bildchen_neu(zp: i32, zn: i32, fp: i32, fn_: i32) -> i32;
    #[link_name = "bildchen_teigling"] fn k_bildchen_teigling(p: i32, n: i32) -> i32;
    #[link_name = "ressource_hole"] fn k_ressource_hole(id: i32, was: i32) -> f64;
    #[link_name = "takt"] fn k_takt() -> i32;
    #[link_name = "bild"] fn k_bild(n: i32) -> i32;
    #[link_name = "paket_voll"] fn k_paket_voll() -> i32;
    #[link_name = "hash_szene"] fn k_hash_szene(p: i32) -> i32;
    #[link_name = "hash_paket"] fn k_hash_paket(p: i32) -> i32;
    #[link_name = "schema_json"] fn k_schema_json(p: i32, kap: i32) -> i32;
}

#[link(wasm_import_module = "pizza")]
extern "C" {
    /// 1 = Kern da; 0 = fehlt (pflicht = 1: der Host hat `fehler HOST` gemeldet, K-128)
    fn herd_kern(pflicht: i32) -> i32;
    /// Kopierweg Programm → Kern: `len` Bytes ab `prog` nach `kern` (Zeiger im Kern-Speicher)
    fn herd_schreibe(kern: i32, prog: *const u8, len: i32);
    /// Kopierweg Kern → Programm
    fn herd_lies(prog: *mut u8, kern: i32, len: i32);
    /// wie ui_warte (K-013-Retry, kap = -1 → Abfrage „Renderer da?“)
    fn herd_warte(p: *mut u8, kap: i32) -> i32;
    /// Ereignis (JSON ohne `typ`) an den Host; paket_len ≥ 0: Bildpaket liegt im Kern ab `bild_zeiger()`
    fn herd_senden(p: *const u8, n: i32, paket_len: i32);
}

// ---------------------------------------------------------------- Schema (generisch aus dem Kern)
const HF_ZAHL: u8 = 1;
const HF_GANZ: u8 = 2;
const HF_DIAVOLO: u8 = 3;
const HF_TEXT: u8 = 4;
const HF_WAHL: u8 = 5;
const HF_FARBE: u8 = 6;
const HF_TEIL: u8 = 7;
const HF_FORM: u8 = 8;
const HF_BILDCHEN: u8 = 9;
const HF_LISTE: u8 = 10;
const HF_TEIL_LISTE: u8 = 11;
const HF_ZAHL_LISTE: u8 = 12;

struct HFeld { name: W, nummer: u32, t: u8, typ: W, get_id: u32, set_id: u32 }
struct HArt { name: W, nummer: u32, name_id: u32, felder: Vec<HFeld> }

struct Kern {
    arten: Vec<HArt>,            // in Schema-Reihenfolge; HKomp.typ = Index (ein Name je Eintrag, Typnummer in HArt.nummer)
    teil_m: Vec<u8>,             // Namens-ID → Teil-Methode (1 …)
    herd_m: Vec<u8>,             // Namens-ID → Herd-Methode
    zugriff: Vec<u16>,           // Namens-ID → Index + 1 (teil.<komponente>())
    teile: Vec<W>,               // Teil-ID → Objekt (Identität)
    komps: Vec<W>,               // Handle → Objekt
    res: Vec<W>,                 // Ressourcen-ID → Form | Bildchen
    id_hole: u32, id_setze: u32, id_teil: u32, id_breite: u32, id_hoehe: u32, id_id: u32, id_farbe: u32,
    id_herd: u32, id_teilk: u32, id_form: u32, id_bildchen: u32,
}

static mut KERN: Option<Kern> = None;
/// 0 = noch nicht versucht, 1 = geladen, 2 = fehlt
static mut ZUSTAND_K: u8 = 0;
/// 0 = Programm ohne Gruppe herd, 1 = Gruppe herd, 2 = Kern vor dem Start Pflicht
static mut NOETIG: i32 = 0;

/// Welt-Zustand der Sprache (eine Welt je Programm)
struct Welt {
    w: W, titel: W, breite: f64, hoehe: f64, offen: bool, bildnummer: f64, schliessen: bool, im_rueckruf: bool,
    tasten: Vec<Vec<u8>>, vor_tasten: Vec<Vec<u8>>, maus_x: f64, maus_y: f64, knoepfe: u32, vor_knoepfe: u32, erster: bool,
}
static mut WELT: Option<Welt> = None;

const TEIL_NAMEN: [&str; 32] = ["x", "y", "z", "setzeLage", "verschiebe", "drehung", "setzeDrehung", "neigung", "setzeNeigung",
    "rollen", "setzeRollen", "schaueAuf", "groesse", "groesseX", "groesseY", "groesseZ", "setzeGroesse", "ebene", "setzeEbene",
    "sichtbar", "haenge", "eltern", "kinder", "entferne", "entfernt", "kopie", "trifft", "mit", "ohne", "raum", "id", "alsText"];
const HERD_NAMEN: [&str; 30] = ["backe", "schliesse", "titel", "setzeTitel", "breite", "hoehe", "bildnummer", "zeit", "taste",
    "gedrueckt", "losgelassen", "mausX", "mausY", "maus", "klick", "hintergrund", "himmel", "umgebung", "nebel", "kamera", "sonne",
    "rechteck", "kreis", "text", "bild", "gruppe", "koerper", "licht", "raum", "alsText"];
const FORM_MOD_NAMEN: [&str; 6] = ["wuerfel", "kugel", "zylinder", "kegel", "ebene", "ring"];

fn nid(s: &str) -> u32 { name_id(neu_str(s)) }
fn tab_setze(t: &mut Vec<u8>, id: u32, c: u8) { if t.len() <= id as usize { t.resize(id as usize + 1, 0); } t[id as usize] = c; }
fn erster_gross(s: &str) -> String { let mut o = String::new(); let mut c = s.chars(); if let Some(x) = c.next() { for u in x.to_uppercase() { o.push(u); } } o.push_str(c.as_str()); o }
fn erster_klein(s: &str) -> String { let mut o = String::new(); let mut c = s.chars(); if let Some(x) = c.next() { for u in x.to_lowercase() { o.push(u); } } o.push_str(c.as_str()); o }

fn k() -> &'static mut Kern { unsafe { KERN.as_mut().unwrap() } }
fn geladen() -> bool { unsafe { ZUSTAND_K == 1 } }

/// Kern holen (lazy). pflicht = 1: fehlt er, meldet der Host den HOST-Fehler (nur vor dem Start).
fn lade(pflicht: bool) -> bool {
    unsafe {
        if ZUSTAND_K == 1 { return true; }
        if ZUSTAND_K == 2 && !pflicht { return false; }
        if crate::in_kueche() { return false; }   // Klone rufen nie Herd-Importe (Trap)
        if herd_kern(if pflicht { 1 } else { 0 }) != 1 { ZUSTAND_K = 2; return false; }
        let roh = match lies_text(|p, kap| k_schema_json(p, kap)) { Some(b) => b, None => { ZUSTAND_K = 2; return false; } };
        let j = match Json::lies(&roh) { Some(j) => j, None => { ZUSTAND_K = 2; return false; } };
        let mut kern = Kern {
            arten: Vec::new(), teil_m: Vec::new(), herd_m: Vec::new(), zugriff: Vec::new(), teile: Vec::new(), komps: Vec::new(), res: Vec::new(),
            id_hole: nid("hole"), id_setze: nid("setze"), id_teil: nid("teil"), id_breite: nid("breite"), id_hoehe: nid("hoehe"), id_id: nid("id"),
            id_farbe: nid("farbe"), id_herd: nid("Herd"), id_teilk: nid("Teil"), id_form: nid("Form"), id_bildchen: nid("Bildchen"),
        };
        for (i, n) in TEIL_NAMEN.iter().enumerate() { tab_setze(&mut kern.teil_m, nid(n), i as u8 + 1); }
        for (i, n) in HERD_NAMEN.iter().enumerate() { tab_setze(&mut kern.herd_m, nid(n), i as u8 + 1); }
        if let Some(Json::A(ks)) = j.feld("komponenten") {
            for kj in ks.iter() {
                let name = kj.text("name").unwrap_or_default();
                let nummer = kj.zahl("nummer").unwrap_or(0.0) as u32;
                let mut art = HArt { name: neu_str(&name), nummer, name_id: nid(&name), felder: Vec::new() };
                if let Some(Json::A(fs)) = kj.feld("felder") {
                    for fj in fs.iter() {
                        let fname = fj.text("name").unwrap_or_default();
                        let typ = fj.text("typ").unwrap_or_default();
                        let t = match typ.as_str() {
                            "zahl" => HF_ZAHL, "ganz" => HF_GANZ, "diavolo" => HF_DIAVOLO, "text" => HF_TEXT, "wahl" => HF_WAHL,
                            "farbe" => HF_FARBE, "teil" => HF_TEIL, "form" => HF_FORM, "bildchen" => HF_BILDCHEN, "bildchen-liste" => HF_LISTE,
                            "teil-liste" => HF_TEIL_LISTE, "zahl-liste" => HF_ZAHL_LISTE, _ => 0,
                        };
                        let mut setter = String::from("setze");
                        setter.push_str(&erster_gross(&fname));
                        art.felder.push(HFeld { name: neu_str(&fname), nummer: fj.zahl("nummer").unwrap_or(0.0) as u32, t, typ: neu_str(&typ), get_id: nid(&fname), set_id: nid(&setter) });
                    }
                }
                let zid = nid(&erster_klein(&name));
                if kern.zugriff.len() <= zid as usize { kern.zugriff.resize(zid as usize + 1, 0); }
                kern.zugriff[zid as usize] = (kern.arten.len() + 1) as u16;
                kern.arten.push(art);
            }
        }
        KERN = Some(kern);
        ZUSTAND_K = 1;
        true
    }
}

/// vom Programm gesetzt, wenn es die Gruppe herd importiert: pflicht = 1, wenn es `neu Herd/Form/Bildchen` oder
/// `Form.…`/`Herd.…` enthält (Startprüfung K-128), sonst 0
#[no_mangle]
pub extern "C" fn rt_herd_noetig(pflicht: i32) { unsafe { NOETIG = if pflicht == 1 { 2 } else { 1 }; } }
/// vor `vorbereiten`: false = Kern fehlt (Host hat gemeldet) → Exit 2. Mit Gruppe herd wird das Schema immer schon hier
/// geladen (reine Lese-Aufrufe, ändert keinen Hash): Komponentennamen sind dann – wie im Interpreter – von Anfang an bekannt,
/// auch für Typprüfungen und für Küchen-Klone (die den Kern nie rufen dürfen).
pub fn start() -> bool { match unsafe { NOETIG } { 2 => lade(true), 1 => { lade(false); true } _ => true } }

/// für Ressourcen/Komponenten zur Laufzeit: Kern muss da sein
fn kern_noetig() -> bool {
    if lade(false) { return true; }
    wirf_ananas(K_LAUFZEIT, "Interner Fehler im Herd: der Herd-Kern fehlt (kern.wasm).");
    false
}

// ---------------------------------------------------------------- Kopierweg und Fehlerprotokoll
fn kp(len: usize) -> i32 { unsafe { k_puffer(if len == 0 { 1 } else { len as i32 }) } }
/// Bytes in den Austauschpuffer des Kerns → (Zeiger, Länge)
fn kt(b: &[u8]) -> (i32, i32) {
    let p = kp(b.len());
    if !b.is_empty() { unsafe { herd_schreibe(p, b.as_ptr(), b.len() as i32); } }
    (p, b.len() as i32)
}
fn lies_text(f: impl Fn(i32, i32) -> i32) -> Option<Vec<u8>> {
    let mut kap: i32 = 64;
    loop {
        let p = kp(kap as usize);
        let n = f(p, kap);
        if n < 0 { return None; }
        if n <= kap {
            let mut v = alloc::vec![0u8; n as usize];
            if n > 0 { unsafe { herd_lies(v.as_mut_ptr(), p, n); } }
            return Some(v);
        }
        kap = n;
    }
}
fn lies_liste(f: impl Fn(i32, i32) -> i32) -> Option<Vec<u32>> {
    let mut kap: i32 = 16;
    loop {
        let p = kp(kap as usize * 4);
        let n = f(p, kap);
        if n < 0 { return None; }
        if n <= kap {
            let mut b = alloc::vec![0u8; n as usize * 4];
            if n > 0 { unsafe { herd_lies(b.as_mut_ptr(), p, n * 4); } }
            return Some(b.chunks(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect());
        }
        kap = n;
    }
}
fn lies_zahlen(f: impl Fn(i32, i32) -> i32) -> Option<Vec<f64>> {
    let mut kap: i32 = 16;
    loop {
        let p = kp(kap as usize * 8);
        let n = f(p, kap);
        if n < 0 { return None; }
        if n <= kap {
            let mut b = alloc::vec![0u8; n as usize * 8];
            if n > 0 { unsafe { herd_lies(b.as_mut_ptr(), p, n * 8); } }
            return Some(b.chunks(8).map(|c| f64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]])).collect());
        }
        kap = n;
    }
}
fn hash(f: impl Fn(i32) -> i32) -> Vec<u8> {
    let p = kp(16);
    f(p);
    let mut v = alloc::vec![0u8; 16];
    unsafe { herd_lies(v.as_mut_ptr(), p, 16); }
    v
}

/// Kern-Fehler → Ananas (Art 1 TypAnanas, 2 LaufzeitAnanas, 3 intern); setzt die NaN-Markierung zurück
fn fehler() { fehler_mit(&[]); }
/// wie `fehler`, mit `<praefix> ` vor dem Kern-Text (Bildchen.laden: Pfad vor Code 61/62, herd/README.md §3)
fn fehler_mit(praefix: &[u8]) {
    let art = unsafe { k_fehler_art() };
    let text = lies_text(|p, kap| unsafe { k_fehler_text(p, kap) }).unwrap_or_default();
    unsafe { k_fehler_neu(); }
    let mut t = Tb::neu();
    if !praefix.is_empty() && art != 3 { t.b(praefix).s(" "); }
    match art {
        1 => { t.b(&text); wirf_tb(K_TYP, &t); }
        2 => { t.b(&text); wirf_tb(K_LAUFZEIT, &t); }
        _ => { t.s("Interner Fehler im Herd: ").b(&text); wirf_tb(K_LAUFZEIT, &t); }
    }
}
fn hi(r: i32) -> Option<i32> { if r < 0 { fehler(); None } else { Some(r) } }
fn hf(r: f64) -> Option<f64> { if r != r && unsafe { k_fehler_neu() } == 1 { fehler(); None } else { Some(r) } }

// ---------------------------------------------------------------- Argumente (Sprachtypen)
fn argn(pos: &[W], ben: &Ben, i: usize, name: &str) -> W {
    if i < pos.len() { return pos[i]; }
    for &(n, w) in ben.iter() { if bytes(name_text(n)) == name.as_bytes() { return w; } }
    UNDEF
}
fn leer(v: W) -> bool { v == UNDEF || v == KARTON }
/// herdZahl: Zahl verlangt; fehlend/karton → std (None = keiner → Fehler)
fn zahl_arg(v: W, wo: &str, param: &str, std: Option<f64>) -> Option<f64> {
    if leer(v) { if let Some(s) = std { return Some(s); } }
    else if ist_zahl(v) { return Some(f(v)); }
    let mut t = Tb::neu();
    t.s(wo).s("() braucht eine Zahl für '").s(param).s("', nicht ");
    darstellung(if v == UNDEF { KARTON } else { v }, &mut t);
    if sig() { return None; }
    t.s(".");
    wirf_tb(K_TYP, &t);
    None
}
/// herdZahl mit Standard null: Some(None) = fehlt
fn zahl_opt(v: W, wo: &str, param: &str) -> Option<Option<f64>> {
    if leer(v) { return Some(None); }
    zahl_arg(v, wo, param, None).map(Some)
}
fn textform(v: W) -> Option<W> { let t = text(if v == UNDEF { KARTON } else { v }); if sig() { None } else { Some(t) } }
fn farb_text(v: W) -> Option<W> { if art(v) == A_TEXT { Some(v) } else { textform(v) } }

// ---------------------------------------------------------------- Objekte (Identität)
fn teil_obj(id: u32) -> W {
    let kk = k();
    let i = id as usize;
    if kk.teile.len() <= i { kk.teile.resize(i + 1, KARTON); }
    if kk.teile[i] == KARTON { kk.teile[i] = neu_w(HTeil { art: A_TEIL, id }); }
    kk.teile[i]
}
fn komp_obj(h: u32, typ: u32) -> W {
    let kk = k();
    let i = h as usize;
    if kk.komps.len() <= i { kk.komps.resize(i + 1, KARTON); }
    if kk.komps[i] == KARTON { kk.komps[i] = neu_w(HKomp { art: A_KOMP, h, typ, teil: 0 }); }
    kk.komps[i]
}
fn res_setze(id: u32, w: W) { let kk = k(); let i = id as usize; if kk.res.len() <= i { kk.res.resize(i + 1, KARTON); } kk.res[i] = w; }
fn res_hole(id: u32) -> W { k().res.get(id as usize).copied().unwrap_or(KARTON) }
fn form_obj(r: i32) -> W {
    let id = match hi(r) { Some(i) => i as u32, None => return KARTON };
    let w = res_hole(id);
    if w != KARTON { return w; }
    let w = neu_w(HForm { art: A_FORM, id });
    res_setze(id, w);
    w
}
fn art_von(typ: u32) -> &'static HArt { &k().arten[typ as usize] }
fn art_nach_name(b: &[u8]) -> Option<u32> { k().arten.iter().position(|a| bytes(a.name) == b).map(|i| i as u32) }

pub fn ist_herd_obj(w: W) -> bool { matches!(art(w), A_HERD | A_TEIL | A_KOMP | A_FORM | A_BILDCHEN) }

// ---------------------------------------------------------------- Textformen, Typen
pub fn text_in(v: W, tb: &mut Tb) {
    match art(v) {
        A_TEIL => { tb.s("Teil(").n(obj::<HTeil>(v).id as f64).s(")"); }
        A_KOMP => {
            // lose: <Name>(); zerstört: das Teil, an dem sie zuletzt hing
            let o = obj::<HKomp>(v);
            let mut t = o.teil as i32;
            // Küchen-Klone rufen keine Herd-Importe (Trap) – dort gilt das zuletzt bekannte Teil
            if !crate::in_kueche() && unsafe { k_komp_info(o.h as i32, 3) } != 1 { t = unsafe { k_komp_info(o.h as i32, 2) }; }
            tb.t(art_von(o.typ).name).s("(");
            if t > 0 { tb.n(t as f64); }
            tb.s(")");
        }
        A_HERD => { tb.s("Herd("); if let Some(w) = unsafe { WELT.as_ref() } { tb.t(w.titel); } tb.s(")"); }
        A_FORM => { tb.s("Form(").n(obj::<HForm>(v).id as f64).s(")"); }
        A_BILDCHEN => { let b = obj::<HBildchen>(v); tb.s("Bildchen(").n(b.breite).s("×").n(b.hoehe).s(")"); }
        _ => { tb.s("?"); }
    }
}
pub fn typ_name(v: W, tb: &mut Tb) {
    match art(v) {
        A_HERD => { tb.s("Herd"); }
        A_TEIL => { tb.s("Teil"); }
        A_FORM => { tb.s("Form"); }
        A_BILDCHEN => { tb.s("Bildchen"); }
        A_KOMP => { tb.t(art_von(obj::<HKomp>(v).typ).name); }
        _ => { tb.s("Unbekanntes"); }
    }
}
/// `<Art>` eines nicht kartonfähigen Werts (Küchenbrigade)
pub fn karton_art(v: W) -> &'static str {
    match art(v) { A_HERD => "Ein Herd", A_TEIL => "Ein Teil", A_KOMP => "Eine Komponente", A_FORM => "Eine Form", _ => "Ein Bildchen" }
}
/// Typprüfung für Herd-Typen (eigene Klassen hat der Aufrufer schon ausgeschlossen); None = kein Herd-Typ
pub fn typ_passt(typ: u32, v: W) -> Option<bool> {
    let n = bytes(name_text(typ));
    let fest = match n { b"Herd" => Some(A_HERD), b"Teil" => Some(A_TEIL), b"Form" => Some(A_FORM), b"Bildchen" => Some(A_BILDCHEN), _ => None };
    if let Some(a) = fest { return Some(art(v) == a); }
    if !geladen() { return None; }
    let nr = art_nach_name(n)?;
    Some(art(v) == A_KOMP && obj::<HKomp>(v).typ == nr)
}

// ---------------------------------------------------------------- Module Herd, Form und Bildchen (statisch)
fn modul_art(m: u32) -> u8 { match bytes(name_text(m)) { b"Herd" => 1, b"Form" => 2, b"Bildchen" => 3, _ => 0 } }
/// globaler Name Herd/Form/Bildchen (nach eigenen Klassen; der Aufrufer prüft die Reihenfolge)
pub fn modul_wert(id: u32) -> Option<W> {
    static mut CACHE: [W; 4] = [KARTON; 4];
    let m = modul_art(id);
    if m == 0 { return None; }
    unsafe {
        if CACHE[m as usize] == KARTON { CACHE[m as usize] = neu_w(Ref { art: A_MODUL, id }); }
        Some(CACHE[m as usize])
    }
}
pub fn modul_hat(m: u32, id: u32) -> bool {
    let n = bytes(name_text(id));
    match modul_art(m) {
        1 => n == b"farbe",
        2 => FORM_MOD_NAMEN.iter().any(|x| x.as_bytes() == n),
        3 => n == b"laden",
        _ => false,
    }
}
pub fn ist_modul(m: u32) -> bool { modul_art(m) != 0 }
pub fn modul_methode(m: u32, id: u32, pos: &[W], ben: &Ben) -> W {
    if crate::kueche::nur_hauptkueche(T_HERD) { return KARTON; }
    let n = bytes(name_text(id));
    if modul_art(m) == 1 {
        // Herd.farbe(r, g, b, a = 1) → "#rrggbbaa" (reine Hilfe, kein Kern-Aufruf)
        let mut s = String::from("#");
        for (i, p) in ["r", "g", "b"].iter().enumerate() {
            let x = match zahl_arg(argn(pos, ben, i, p), "farbe", p, None) { Some(x) => x, None => return KARTON };
            hex(zl::js_round(js_min(255.0, js_max(0.0, zl::js_round(x)))), &mut s);
        }
        let al = match zahl_arg(argn(pos, ben, 3, "a"), "farbe", "a", Some(1.0)) { Some(x) => x, None => return KARTON };
        hex(zl::js_round(js_min(1.0, js_max(0.0, al)) * 255.0), &mut s);
        return neu_str(&s);
    }
    if modul_art(m) == 3 { return bildchen_laden(pos, ben); }
    if !kern_noetig() { return KARTON; }
    let r = unsafe {
        match n {
            b"wuerfel" => k_form_grund(1, 0.0, 0.0),
            b"ebene" => k_form_grund(5, 0.0, 0.0),
            b"kugel" | b"zylinder" | b"kegel" => {
                let (art, std, wo) = match n { b"kugel" => (2, 24.0, "kugel"), b"zylinder" => (3, 32.0, "zylinder"), _ => (4, 32.0, "kegel") };
                match zahl_arg(argn(pos, ben, 0, "teile"), wo, "teile", Some(std)) { Some(t) => k_form_grund(art, t, 0.0), None => return KARTON }
            }
            _ => {
                let d = match zahl_arg(argn(pos, ben, 0, "dicke"), "ring", "dicke", Some(0.3)) { Some(x) => x, None => return KARTON };
                let t = match zahl_arg(argn(pos, ben, 1, "teile"), "ring", "teile", Some(32.0)) { Some(x) => x, None => return KARTON };
                k_form_grund(6, t, d)
            }
        }
    };
    form_obj(r)
}
fn js_max(a: f64, b: f64) -> f64 { if a != a || b != b { f64::NAN } else if a > b { a } else { b } }
fn js_min(a: f64, b: f64) -> f64 { if a != a || b != b { f64::NAN } else if a < b { a } else { b } }
fn hex(v: f64, s: &mut String) {
    if v != v { s.push_str("NaN"); return; }
    let n = v as u32;
    let h = b"0123456789abcdef";
    if n >= 16 { s.push(h[((n >> 4) & 15) as usize] as char); } else { s.push('0'); }
    s.push(h[(n & 15) as usize] as char);
}

// ---------------------------------------------------------------- neu <Herd-Klasse>
/// Ist `id` (ohne eigene Klasse) eine Herd-Klasse? Komponenten nur aus dem Schema des geladenen Kerns.
pub fn neu_moeglich(id: u32) -> bool {
    match bytes(name_text(id)) {
        b"Herd" | b"Teil" | b"Form" | b"Bildchen" => true,
        n => {
            if !geladen() { if crate::in_kueche() || unsafe { ZUSTAND_K } == 2 { return false; } if !lade(false) { return false; } }
            art_nach_name(n).is_some()
        }
    }
}
pub fn neu(id: u32, pos: &[W], ben: &Ben) -> W {
    if crate::kueche::nur_hauptkueche(T_HERD) { return KARTON; }
    let n = bytes(name_text(id));
    if n == b"Teil" { wirf_ananas(K_ROHLING, "'Teil' kann man nicht mit neu backen."); return KARTON; }
    if !kern_noetig() { return KARTON; }
    match n {
        b"Herd" => neuer_herd(pos, ben),
        b"Form" => neue_form(pos, ben),
        b"Bildchen" => neues_bildchen(pos, ben),
        _ => {
            let nr = match art_nach_name(n) { Some(x) => x, None => return KARTON };
            let ar = art_von(nr);
            // unbekannte benannte Argumente zuerst (Kern-Text), dann komp_neu und Felder in Schema-Reihenfolge
            for &(bn, _) in ben.iter() {
                if !ar.felder.iter().any(|f| f.get_id == bn) { feld_nach_name(ar, name_text(bn)); return KARTON; }
            }
            let h = match hi(unsafe { k_komp_neu(ar.nummer as i32) }) { Some(h) => h as u32, None => return KARTON };
            let o = komp_obj(h, nr);
            for (i, f) in ar.felder.iter().enumerate() {
                let w = argn(pos, ben, i, s(f.name));
                if !leer(w) && !setze(h, ar, f, w) { return KARTON; }
            }
            o
        }
    }
}
fn neuer_herd(pos: &[W], ben: &Ben) -> W {
    let tw = argn(pos, ben, 0, "titel");
    let titel = if tw == UNDEF { neu_str("") } else { match textform(tw) { Some(t) => t, None => return KARTON } };
    let b = argn(pos, ben, 1, "breite");
    let b = if leer(b) { 640.0 } else if ist_zahl(b) { f(b) } else { match ganz_pruefen(b, "Herd(breite: …)") { Some(x) => x, None => return KARTON } };
    let h = argn(pos, ben, 2, "hoehe");
    let h = if leer(h) { 360.0 } else if ist_zahl(h) { f(h) } else { match ganz_pruefen(h, "Herd(hoehe: …)") { Some(x) => x, None => return KARTON } };
    let (p, n) = kt(bytes(titel));
    if hi(unsafe { k_welt_neu(b, h, p, n) }).is_none() { return KARTON; }
    let w = neu_w(HWelt { art: A_HERD, _r: 0 });
    unsafe {
        WELT = Some(Welt { w, titel, breite: b, hoehe: h, offen: false, bildnummer: 0.0, schliessen: false, im_rueckruf: false,
            tasten: Vec::new(), vor_tasten: Vec::new(), maus_x: 0.0, maus_y: 0.0, knoepfe: 0, vor_knoepfe: 0, erster: false });
    }
    w
}
fn zahlen_blech(w: W) -> Option<&'static Vec<W>> { if art(w) == A_BLECH && blech_v(w).iter().all(|&x| ist_zahl(x)) { Some(blech_v(w)) } else { None } }
fn neue_form(pos: &[W], ben: &Ben) -> W {
    let pu = argn(pos, ben, 0, "punkte");
    let dr = argn(pos, ben, 1, "dreiecke");
    let gl = argn(pos, ben, 2, "glatt");
    let glatt = if leer(gl) { false } else { let b = bool_pruefen(gl); if sig() { return KARTON; } b };
    // kein Zahlen-Blech → eine Länge, die nicht durch 3 teilbar ist: der Kern meldet seinen Text (Code 42/43)
    let pz = zahlen_blech(pu);
    let dz = zahlen_blech(dr);
    let np = pz.map(|v| v.len()).unwrap_or(1);
    let nd = dz.map(|v| v.len()).unwrap_or(1);
    let mut b: Vec<u8> = Vec::with_capacity((np + nd) * 8);
    for i in 0..np { let x = pz.map(|v| f(v[i])).unwrap_or(0.0); b.extend_from_slice(&x.to_le_bytes()); }
    for i in 0..nd { let x = dz.map(|v| f(v[i])).unwrap_or(0.0); b.extend_from_slice(&x.to_le_bytes()); }
    let p = kp(b.len().max(8));
    unsafe { herd_schreibe(p, b.as_ptr(), b.len() as i32); }
    form_obj(unsafe { k_form_eigene(p, np as i32, p + np as i32 * 8, nd as i32, glatt as i32) })
}
fn neues_bildchen(pos: &[W], ben: &Ben) -> W {
    let zw = argn(pos, ben, 0, "zeilen");
    let fw = argn(pos, ben, 1, "farben");
    // kein Blech aus Texten → keine Zeilen: der Kern meldet „braucht Zeilen als nicht leeres Blech aus Texten“
    let zeilen: Vec<W> = if art(zw) == A_BLECH && blech_v(zw).iter().all(|&x| art(x) == A_TEXT) { blech_v(zw).clone() } else { Vec::new() };
    let mut farben: Vec<W> = Vec::new();
    if !leer(fw) {
        if art(fw) != A_KARTE {
            let mut t = Tb::neu();
            t.s("Bildchen() braucht eine Speisekarte für 'farben', nicht ");
            darstellung(fw, &mut t);
            if sig() { return KARTON; }
            t.s(".");
            wirf_tb(K_TYP, &t);
            return KARTON;
        }
        let mut i = 0;
        while i < crate::karte::karte(fw).k.len() {
            let (kk, vv) = { let m = crate::karte::karte(fw); (m.k[i], m.v[i]) };
            i += 1;
            if kk == UNDEF { continue; }
            let a1 = match textform(kk) { Some(t) => t, None => return KARTON };
            let a2 = match farb_text(vv) { Some(t) => t, None => return KARTON };
            farben.push(a1); farben.push(a2);
        }
    }
    let mut b: Vec<u8> = Vec::new();
    let mut zl_ = 0;
    for (i, &t) in zeilen.iter().chain(farben.iter()).enumerate() {
        let x = bytes(t);
        b.extend_from_slice(&(x.len() as u32).to_le_bytes());
        b.extend_from_slice(x);
        if i + 1 == zeilen.len() { zl_ = b.len(); }
    }
    let p = kp(b.len().max(4));
    if !b.is_empty() { unsafe { herd_schreibe(p, b.as_ptr(), b.len() as i32); } }
    let n = b.len() as i32;
    let id = match hi(unsafe { k_bildchen_neu(p, zl_ as i32, p + zl_ as i32, n - zl_ as i32) }) { Some(i) => i as u32, None => return KARTON };
    let br = match hf(unsafe { k_ressource_hole(id as i32, 2) }) { Some(x) => x, None => return KARTON };
    let ho = match hf(unsafe { k_ressource_hole(id as i32, 3) }) { Some(x) => x, None => return KARTON };
    let w = neu_w(HBildchen { art: A_BILDCHEN, id, breite: br, hoehe: ho });
    res_setze(id, w);
    w
}

/// Pfad → schon geladenes Bildchen (gleicher Pfad = dasselbe Bildchen, keine neue Ressource; SPEC §18.5)
static mut GELADEN: Vec<(W, W)> = Vec::new();

/// `Bildchen.laden(pfad)` (SPEC §18.5, K-145): Teigling aus der Kiste (Datensegment) über den Kopierweg in den Kern,
/// dann `bildchen_teigling`. Prüfreihenfolge: kein Text → TypAnanas · vor `neu Herd` (Kern-Text) · fehlt in der Kiste ·
/// kein Bild / Fehler-Teigling (Kern-Codes 61/62, mit Pfad davor).
fn bildchen_laden(pos: &[W], ben: &Ben) -> W {
    let pw = argn(pos, ben, 0, "pfad");
    if art(pw) != A_TEXT {
        let mut t = Tb::neu();
        t.s("Bildchen.laden() braucht einen Text für 'pfad', nicht ");
        darstellung(if pw == UNDEF { KARTON } else { pw }, &mut t);
        if sig() { return KARTON; }
        t.s(".");
        wirf_tb(K_TYP, &t);
        return KARTON;
    }
    if !kern_noetig() { return KARTON; }
    // vor neu Herd: der Kern meldet „Erst braucht es einen Herd (neu Herd(…)).“ (Welt fehlt, die Bytes prüft er dann nicht)
    if unsafe { WELT.is_none() } { let _ = hi(unsafe { k_bildchen_teigling(kp(1), 0) }); return KARTON; }
    let pb = bytes(pw);
    if let Some(&(_, w)) = unsafe { GELADEN.iter().find(|x| bytes(x.0) == pb) } { return w; }
    let e = match crate::kiste::finde(pb) {
        Some(e) => e,
        None => {
            let mut t = Tb::neu();
            t.s("Die Datei \"").b(pb).s("\" liegt nicht in der Kiste.");
            wirf_tb(K_LAUFZEIT, &t);
            return KARTON;
        }
    };
    if e.art != crate::kiste::ART_BILD {
        let mut t = Tb::neu();
        t.b(pb).s(" ist kein lesbares Bild (PNG oder JPEG).");
        wirf_tb(K_LAUFZEIT, &t);
        return KARTON;
    }
    // Kopierweg: Datensegment → (Stück für Stück) → Kern-Speicher (HOST-ABI §2 `bildchen_teigling`)
    let kz = kp(e.len as usize);
    crate::kiste::stueckweise(&e, |o, b| unsafe { herd_schreibe(kz + o as i32, b.as_ptr(), b.len() as i32) });
    let r = unsafe { k_bildchen_teigling(kz, e.len as i32) };
    if r < 0 { fehler_mit(pb); return KARTON; }
    let id = r as u32;
    let br = match hf(unsafe { k_ressource_hole(id as i32, 2) }) { Some(x) => x, None => return KARTON };
    let ho = match hf(unsafe { k_ressource_hole(id as i32, 3) }) { Some(x) => x, None => return KARTON };
    let w = neu_w(HBildchen { art: A_BILDCHEN, id, breite: br, hoehe: ho });
    res_setze(id, w);
    unsafe { GELADEN.push((neu_text(pb), w)); }
    w
}

// ---------------------------------------------------------------- Felder setzen/lesen (generisch nach Feldtyp)
/// Feld nach Name (hole/setze); unbekannt → Kern-Text „<Name> hat kein Feld 'x'.“
fn feld_nach_name(ar: &'static HArt, n: W) -> Option<&'static HFeld> {
    let name = textform(n)?;
    let id = name_id(name);
    if let Some(f) = ar.felder.iter().find(|f| f.get_id == id) { return Some(f); }
    let (p, l) = kt(bytes(name));
    hi(unsafe { k_feld_nummer(ar.nummer as i32, p, l) })?;
    let mut t = Tb::neu();
    t.s("Interner Fehler im Herd: Feld '").t(name).s("' fehlt im Schema.");
    wirf_tb(K_LAUFZEIT, &t);
    None
}
fn typfehler(ar: &HArt, fd: &HFeld, v: W) {
    let mut t = Tb::neu();
    darstellung(if v == UNDEF { KARTON } else { v }, &mut t);
    if sig() { return; }
    let (p, n) = kt(&t.0);
    unsafe { k_melde_typfehler(ar.nummer as i32, fd.nummer as i32, p, n); }
    fehler();
}
/// true = gesetzt; false = geworfen
fn setze(h: u32, ar: &HArt, fd: &HFeld, v: W) -> bool {
    let (hh, fn_) = (h as i32, fd.nummer as i32);
    let r = unsafe {
        match fd.t {
            HF_ZAHL | HF_GANZ => { if !ist_zahl(v) { typfehler(ar, fd, v); return false; } k_setze_zahl(hh, fn_, f(v)) }
            HF_DIAVOLO => { if !ist_bool(v) { typfehler(ar, fd, v); return false; } k_setze_zahl(hh, fn_, if v == JA { 1.0 } else { 0.0 }) }
            HF_TEXT | HF_WAHL | HF_FARBE => {
                if fd.t != HF_TEXT && art(v) != A_TEXT { typfehler(ar, fd, v); return false; }
                let t = if fd.t == HF_TEXT { match textform(v) { Some(t) => t, None => return false } } else { v };
                let (p, n) = kt(bytes(t));
                k_setze_text(hh, fn_, p, n)
            }
            HF_TEIL | HF_FORM | HF_BILDCHEN => {
                let soll = match fd.t { HF_TEIL => A_TEIL, HF_FORM => A_FORM, _ => A_BILDCHEN };
                let id = if leer(v) { 0 } else if art(v) == soll { obj::<HTeil>(v).id } else { typfehler(ar, fd, v); return false; };
                k_setze_zahl(hh, fn_, id as f64)
            }
            HF_LISTE => {
                if art(v) != A_BLECH || !blech_v(v).iter().all(|&x| art(x) == A_BILDCHEN) { typfehler(ar, fd, v); return false; }
                let mut b: Vec<u8> = Vec::new();
                for &x in blech_v(v).iter() { b.extend_from_slice(&obj::<HBildchen>(x).id.to_le_bytes()); }
                let p = kp(b.len().max(4));
                if !b.is_empty() { herd_schreibe(p, b.as_ptr(), b.len() as i32); }
                k_setze_liste(hh, fn_, p, blech_v(v).len() as i32)
            }
            HF_TEIL_LISTE => {
                if art(v) != A_BLECH || !blech_v(v).iter().all(|&x| art(x) == A_TEIL) { typfehler(ar, fd, v); return false; }
                let mut b: Vec<u8> = Vec::new();
                for &x in blech_v(v).iter() { b.extend_from_slice(&obj::<HTeil>(x).id.to_le_bytes()); }
                let p = kp(b.len().max(4));
                if !b.is_empty() { herd_schreibe(p, b.as_ptr(), b.len() as i32); }
                k_setze_liste(hh, fn_, p, blech_v(v).len() as i32)
            }
            HF_ZAHL_LISTE => {
                if art(v) != A_BLECH || !blech_v(v).iter().all(|&x| ist_zahl(x)) { typfehler(ar, fd, v); return false; }
                let mut b: Vec<u8> = Vec::new();
                for &x in blech_v(v).iter() { b.extend_from_slice(&f(x).to_le_bytes()); }
                let p = kp(b.len().max(8));
                if !b.is_empty() { herd_schreibe(p, b.as_ptr(), b.len() as i32); }
                k_setze_zahlen(hh, fn_, p, blech_v(v).len() as i32)
            }
            _ => {
                let mut t = Tb::neu();
                t.s("Interner Fehler im Herd: Feldtyp '").t(fd.typ).s("' kennt diese Sprache noch nicht.");
                wirf_tb(K_LAUFZEIT, &t);
                return false;
            }
        }
    };
    hi(r).is_some()
}
fn hole(h: u32, fd: &HFeld) -> W {
    let (hh, fn_) = (h as i32, fd.nummer as i32);
    unsafe {
        match fd.t {
            HF_ZAHL | HF_GANZ => match hf(k_hole_zahl(hh, fn_)) { Some(x) => zahl(x), None => KARTON },
            HF_DIAVOLO => match hf(k_hole_zahl(hh, fn_)) { Some(x) => bool_w(x != 0.0), None => KARTON },
            HF_TEXT | HF_WAHL | HF_FARBE => match lies_text(|p, kap| k_hole_text(hh, fn_, p, kap)) { Some(b) => neu_text(&b), None => { fehler(); KARTON } },
            HF_TEIL => match hf(k_hole_zahl(hh, fn_)) { Some(x) => if x == 0.0 { KARTON } else { teil_obj(x as u32) }, None => KARTON },
            HF_FORM | HF_BILDCHEN => match hf(k_hole_zahl(hh, fn_)) { Some(x) => if x == 0.0 { KARTON } else { res_hole(x as u32) }, None => KARTON },
            HF_LISTE => match lies_liste(|p, kap| k_hole_liste(hh, fn_, p, kap)) {
                Some(ids) => blech(ids.iter().map(|&i| res_hole(i)).collect()),
                None => { fehler(); KARTON }
            },
            HF_TEIL_LISTE => match lies_liste(|p, kap| k_hole_liste(hh, fn_, p, kap)) {
                Some(ids) => blech(ids.iter().map(|&i| teil_obj(i)).collect()),
                None => { fehler(); KARTON }
            },
            HF_ZAHL_LISTE => match lies_zahlen(|p, kap| k_hole_zahlen(hh, fn_, p, kap)) {
                Some(xs) => blech(xs.iter().map(|&x| zahl(x)).collect()),
                None => { fehler(); KARTON }
            },
            _ => {
                let mut t = Tb::neu();
                t.s("Interner Fehler im Herd: Feldtyp '").t(fd.typ).s("' kennt diese Sprache noch nicht.");
                wirf_tb(K_LAUFZEIT, &t);
                KARTON
            }
        }
    }
}

// ---------------------------------------------------------------- Methoden
pub fn tabelle_hat(o: W, id: u32) -> bool {
    if !geladen() { return false; }
    let kk = k();
    let i = id as usize;
    match art(o) {
        A_TEIL => kk.teil_m.get(i).copied().unwrap_or(0) != 0 || kk.zugriff.get(i).copied().unwrap_or(0) != 0,
        A_HERD => kk.herd_m.get(i).copied().unwrap_or(0) != 0,
        A_KOMP => {
            let ar = art_von(obj::<HKomp>(o).typ);
            id == kk.id_hole || id == kk.id_setze || id == kk.id_teil || id == crate::namen::N_ALSTEXT
                || ar.felder.iter().any(|f| f.get_id == id || f.set_id == id)
        }
        A_FORM => id == kk.id_id || id == crate::namen::N_ALSTEXT,
        A_BILDCHEN => id == kk.id_id || id == kk.id_breite || id == kk.id_hoehe || id == crate::namen::N_ALSTEXT,
        _ => false,
    }
}

pub fn methode(o: W, id: u32, pos: &[W], ben: &Ben, knoten: i32) -> W {
    if !tabelle_hat(o, id) { return crate::std_m::nicht_gefunden(o, id); }
    if crate::kueche::nur_hauptkueche(T_HERD) { return KARTON; }
    match art(o) {
        A_TEIL => teil_methode(o, id, pos, ben),
        A_HERD => herd_methode(o, id, pos, ben, knoten),
        A_KOMP => komp_methode(o, id, pos, ben),
        A_FORM => if id == crate::namen::N_ALSTEXT { text(o) } else { zahl(obj::<HForm>(o).id as f64) },
        _ => {
            let b = obj::<HBildchen>(o);
            let kk = k();
            if id == kk.id_breite { zahl(b.breite) } else if id == kk.id_hoehe { zahl(b.hoehe) } else if id == kk.id_id { zahl(b.id as f64) } else { text(o) }
        }
    }
}

fn komp_methode(o: W, id: u32, pos: &[W], ben: &Ben) -> W {
    let kk = k();
    let ko = obj::<HKomp>(o);
    let ar = art_von(ko.typ);
    let h = ko.h;
    if let Some(f) = ar.felder.iter().find(|f| f.get_id == id) { return hole(h, f); }
    if let Some(f) = ar.felder.iter().find(|f| f.set_id == id) {
        if setze_wert(h, ar, f, if pos.is_empty() { KARTON } else { pos[0] }) { return o; }
        return KARTON;
    }
    if id == kk.id_hole {
        return match feld_nach_name(ar, argn(pos, ben, 0, "feld")) { Some(f) => hole(h, f), None => KARTON };
    }
    if id == kk.id_setze {
        let f = match feld_nach_name(ar, argn(pos, ben, 0, "feld")) { Some(f) => f, None => return KARTON };
        let w = argn(pos, ben, 1, "wert");
        if setze_wert(h, ar, f, if w == UNDEF { KARTON } else { w }) { return o; }
        return KARTON;
    }
    if id == kk.id_teil {
        // zerstört (komp_info 3) → Kern-Text „Teil 7 ist schon entfernt.“ über das zuletzt bekannte Teil
        if unsafe { k_komp_info(h as i32, 3) } == 1 && hf(unsafe { k_teil_hole(ko.teil as i32, 1) }).is_none() { return KARTON; }
        let t = match hi(unsafe { k_komp_info(h as i32, 2) }) { Some(t) => t as u32, None => return KARTON };
        ko.teil = t;
        return if t == 0 { KARTON } else { teil_obj(t) };
    }
    text(o)
}
/// Setter: karton setzt (Feldtyp entscheidet: teil/form/bildchen → 0, sonst Typfehler)
fn setze_wert(h: u32, ar: &HArt, f: &HFeld, v: W) -> bool { setze(h, ar, f, v) }

fn teil_id_arg(v: W, wo: &str, param: &str) -> Option<i32> {
    if leer(v) { return Some(0); }
    if art(v) == A_TEIL { return Some(obj::<HTeil>(v).id as i32); }
    let mut t = Tb::neu();
    t.s(wo).s("() braucht ein Teil für '").s(param).s("', nicht ");
    darstellung(v, &mut t);
    if sig() { return None; }
    t.s(".");
    wirf_tb(K_TYP, &t);
    None
}
fn typ_fehler_arg(wo: &str, was: &str, param: &str, v: W) {
    let mut t = Tb::neu();
    t.s(wo).s("() braucht ").s(was).s(" für '").s(param).s("', nicht ");
    darstellung(if v == UNDEF { KARTON } else { v }, &mut t);
    if sig() { return; }
    t.s(".");
    wirf_tb(K_TYP, &t);
}
fn komp_von(t: W, nr: u32) -> W {
    let h = match hi(unsafe { k_komp_von(obj::<HTeil>(t).id as i32, art_von(nr).nummer as i32) }) { Some(h) => h as u32, None => return KARTON };
    if h == 0 { return KARTON; }
    let o = komp_obj(h, nr);
    obj::<HKomp>(o).teil = obj::<HTeil>(t).id;
    o
}

fn teil_methode(t: W, id: u32, pos: &[W], ben: &Ben) -> W {
    let kk = k();
    let tid = obj::<HTeil>(t).id as i32;
    let code = kk.teil_m.get(id as usize).copied().unwrap_or(0);
    if code == 0 { return komp_von(t, kk.zugriff[id as usize] as u32 - 1); }
    let lies = |feld: i32| -> W { match hf(unsafe { k_teil_hole(tid, feld) }) { Some(x) => zahl(x), None => KARTON } };
    let ok = |r: i32| -> W { if hi(r).is_some() { t } else { KARTON } };
    macro_rules! z { ($i:expr, $n:expr, $wo:expr) => { match zahl_arg(argn(pos, ben, $i, $n), $wo, $n, None) { Some(x) => x, None => return KARTON } };
                     ($i:expr, $n:expr, $wo:expr, $s:expr) => { match zahl_arg(argn(pos, ben, $i, $n), $wo, $n, Some($s)) { Some(x) => x, None => return KARTON } }; }
    unsafe {
        match TEIL_NAMEN[code as usize - 1] {
            "x" => lies(1), "y" => lies(2), "z" => lies(3),
            "setzeLage" => { let x = z!(0, "x", "setzeLage"); let y = z!(1, "y", "setzeLage"); let zz = z!(2, "z", "setzeLage", 0.0); ok(k_teil_lage(tid, x, y, zz)) }
            "verschiebe" => { let x = z!(0, "dx", "verschiebe"); let y = z!(1, "dy", "verschiebe"); let zz = z!(2, "dz", "verschiebe", 0.0); ok(k_teil_verschiebe(tid, x, y, zz)) }
            "drehung" => lies(4),
            "setzeDrehung" => { let g = z!(0, "g", "setzeDrehung"); ok(k_teil_setze(tid, 4, g)) }
            "neigung" => lies(5),
            "setzeNeigung" => { let g = z!(0, "g", "setzeNeigung"); ok(k_teil_setze(tid, 5, g)) }
            "rollen" => lies(6),
            "setzeRollen" => { let g = z!(0, "g", "setzeRollen"); ok(k_teil_setze(tid, 6, g)) }
            "schaueAuf" => { let x = z!(0, "x", "schaueAuf"); let y = z!(1, "y", "schaueAuf"); let zz = z!(2, "z", "schaueAuf"); ok(k_teil_schaue(tid, x, y, zz)) }
            "groesse" | "groesseX" => lies(7), "groesseY" => lies(8), "groesseZ" => lies(9),
            "setzeGroesse" => {
                let sx = z!(0, "sx", "setzeGroesse");
                let sy = z!(1, "sy", "setzeGroesse", sx);
                let sz = z!(2, "sz", "setzeGroesse", sx);
                ok(k_teil_groesse(tid, sx, sy, sz))
            }
            "ebene" => lies(10),
            "setzeEbene" => { let n = z!(0, "n", "setzeEbene"); ok(k_teil_setze(tid, 10, n)) }
            "sichtbar" => {
                let d = argn(pos, ben, 0, "d");
                if d == UNDEF { return match hf(k_teil_hole(tid, 11)) { Some(x) => bool_w(x != 0.0), None => KARTON }; }
                let b = bool_pruefen(d);
                if sig() { return KARTON; }
                ok(k_teil_setze(tid, 11, if b { 1.0 } else { 0.0 }))
            }
            "haenge" => { let an = match teil_id_arg(argn(pos, ben, 0, "an"), "haenge", "an") { Some(x) => x, None => return KARTON }; ok(k_teil_haenge(tid, an)) }
            "eltern" => match hf(k_teil_hole(tid, 13)) { Some(x) => if x == 0.0 { KARTON } else { teil_obj(x as u32) }, None => KARTON },
            "kinder" => match lies_liste(|p, kap| k_teil_kinder(tid, p, kap)) { Some(ids) => blech(ids.iter().map(|&i| teil_obj(i)).collect()), None => { fehler(); KARTON } },
            "entferne" => { hi(k_teil_entferne(tid)); KARTON }
            "entfernt" => match hf(k_teil_hole(tid, 14)) { Some(x) => bool_w(x != 0.0), None => KARTON },
            "kopie" => match hi(k_teil_kopie(tid)) { Some(i) => teil_obj(i as u32), None => KARTON },
            "trifft" => {
                let b = argn(pos, ben, 0, "anderes");
                if art(b) != A_TEIL { typ_fehler_arg("trifft", "ein Teil", "anderes", b); return KARTON; }
                match hi(k_teil_trifft(tid, obj::<HTeil>(b).id as i32)) { Some(r) => bool_w(r == 1), None => KARTON }
            }
            "mit" => {
                let ko = argn(pos, ben, 0, "komponente");
                if art(ko) != A_KOMP { typ_fehler_arg("mit", "eine Komponente", "komponente", ko); return KARTON; }
                if hi(k_komp_haenge(obj::<HKomp>(ko).h as i32, tid)).is_none() { return KARTON; }
                obj::<HKomp>(ko).teil = tid as u32;
                ko
            }
            "ohne" => {
                let n = argn(pos, ben, 0, "name");
                let nr = if art(n) == A_KOMP { obj::<HKomp>(n).typ } else {
                    let name = match textform(n) { Some(x) => x, None => return KARTON };
                    match art_nach_name(bytes(name)) {
                        Some(x) => x,
                        None => {   // unbekannt → Kern-Text „Eine Komponente 'X' gibt es nicht.“ (typ_nummer, Code 19)
                            let (p, l) = kt(bytes(name));
                            if hi(k_typ_nummer(p, l)).is_none() { return KARTON; }
                            let mut tb = Tb::neu();
                            tb.s("Interner Fehler im Herd: Komponente ").t(name).s(" fehlt im Schema.");
                            wirf_tb(K_LAUFZEIT, &tb);
                            return KARTON;
                        }
                    }
                };
                let h = match hi(k_komp_von(tid, art_von(nr).nummer as i32)) { Some(h) => h as u32, None => return KARTON };
                if h == 0 { return KARTON; }
                let o = komp_obj(h, nr);
                if hi(k_komp_loese(h as i32)).is_none() { return KARTON; }
                obj::<HKomp>(o).teil = 0;
                o
            }
            "raum" => match hf(k_teil_hole(tid, 12)) { Some(x) => neu_str(if x == 3.0 { "3D" } else { "2D" }), None => KARTON },
            "id" => match hf(k_teil_hole(tid, 12)) { Some(_) => zahl(tid as f64), None => KARTON },
            _ => text(t),
        }
    }
}

fn welt() -> &'static mut Welt { unsafe { WELT.as_mut().unwrap() } }

fn herd_methode(hw: W, id: u32, pos: &[W], ben: &Ben, knoten: i32) -> W {
    let code = k().herd_m.get(id as usize).copied().unwrap_or(0);
    macro_rules! z { ($i:expr, $n:expr, $wo:expr) => { match zahl_arg(argn(pos, ben, $i, $n), $wo, $n, None) { Some(x) => x, None => return KARTON } };
                     ($i:expr, $n:expr, $wo:expr, $s:expr) => { match zahl_arg(argn(pos, ben, $i, $n), $wo, $n, Some($s)) { Some(x) => x, None => return KARTON } }; }
    macro_rules! zo { ($i:expr, $n:expr, $wo:expr) => { match zahl_opt(argn(pos, ben, $i, $n), $wo, $n) { Some(x) => x, None => return KARTON } }; }
    let h = welt();
    unsafe {
        match HERD_NAMEN[code as usize - 1] {
            "backe" => { let f0 = argn(pos, ben, 0, "fn"); backe(if leer(f0) { KARTON } else { f0 }, knoten); KARTON }
            "schliesse" => { if h.im_rueckruf { h.schliessen = true; } else { schliesse_fenster(); } KARTON }
            "titel" => h.titel,
            "setzeTitel" => {
                let t = match textform(argn(pos, ben, 0, "t")) { Some(t) => t, None => return KARTON };
                let (p, n) = kt(bytes(t));
                if hi(k_welt_titel(p, n)).is_none() { return KARTON; }
                h.titel = t;
                if h.offen { sende_fenster(); }
                hw
            }
            "breite" => zahl(h.breite),
            "hoehe" => zahl(h.hoehe),
            "bildnummer" => zahl(h.bildnummer),
            "zeit" => zahl(h.bildnummer / 60.0),
            "taste" => match taste(argn(pos, ben, 0, "n")) { Some(n) => bool_w(enthaelt(&h.tasten, &n)), None => KARTON },
            "gedrueckt" => match taste(argn(pos, ben, 0, "n")) { Some(n) => bool_w(h.erster && enthaelt(&h.tasten, &n) && !enthaelt(&h.vor_tasten, &n)), None => KARTON },
            "losgelassen" => match taste(argn(pos, ben, 0, "n")) { Some(n) => bool_w(h.erster && !enthaelt(&h.tasten, &n) && enthaelt(&h.vor_tasten, &n)), None => KARTON },
            "mausX" => zahl(h.maus_x),
            "mausY" => zahl(h.maus_y),
            "maus" => match maus_bit(argn(pos, ben, 0, "k"), "maus") { Some(b) => bool_w(h.knoepfe & b != 0), None => KARTON },
            "klick" => match maus_bit(argn(pos, ben, 0, "k"), "klick") { Some(b) => bool_w(h.erster && h.knoepfe & b != 0 && h.vor_knoepfe & b == 0), None => KARTON },
            "hintergrund" => {
                let fa = match farb_text(argn(pos, ben, 0, "f")) { Some(x) => x, None => return KARTON };
                let (p, n) = kt(bytes(fa));
                if hi(k_welt_hintergrund(p, n)).is_none() { return KARTON; }
                hw
            }
            "himmel" => {
                let o = match farb_text(argn(pos, ben, 0, "oben")) { Some(x) => x, None => return KARTON };
                let uw = argn(pos, ben, 1, "unten");
                let u = if leer(uw) { neu_str("") } else { match farb_text(uw) { Some(x) => x, None => return KARTON } };
                // beide Texte in einen Austauschpuffer
                let mut b: Vec<u8> = Vec::new();
                b.extend_from_slice(bytes(o));
                b.extend_from_slice(bytes(u));
                let (p, _) = kt(&b);
                let lo = bytes(o).len() as i32;
                if hi(k_welt_himmel(p, lo, p + lo, bytes(u).len() as i32)).is_none() { return KARTON; }
                hw
            }
            "umgebung" => {
                let fa = match farb_text(argn(pos, ben, 0, "f")) { Some(x) => x, None => return KARTON };
                let st = z!(1, "staerke", "umgebung", 0.35);
                let (p, n) = kt(bytes(fa));
                if hi(k_welt_umgebung(p, n, st)).is_none() { return KARTON; }
                hw
            }
            "nebel" => {
                let fa = match farb_text(argn(pos, ben, 0, "f")) { Some(x) => x, None => return KARTON };
                let von = z!(1, "von", "nebel");
                let bis = z!(2, "bis", "nebel");
                let (p, n) = kt(bytes(fa));
                if hi(k_welt_nebel(p, n, von, bis)).is_none() { return KARTON; }
                hw
            }
            "kamera" => teil_obj(1),
            "sonne" => teil_obj(2),
            // Fabriken (Teil anlegen + Komponente anhängen; Reihenfolge der Kern-Aufrufe ist Vertrag für alle Motoren)
            "rechteck" => {
                let x = z!(0, "x", "rechteck"); let y = z!(1, "y", "rechteck");
                let b = z!(2, "b", "rechteck"); let ho = z!(3, "h", "rechteck");
                let ru = zo!(5, "rundung", "rechteck"); let um = zo!(6, "umriss", "rechteck");
                fabrik(2, x, y, 0.0, "Rechteck", &[("breite", zahl(b)), ("hoehe", zahl(ho)), ("farbe", argn(pos, ben, 4, "farbe")), ("rundung", opt_w(ru)), ("umriss", opt_w(um))])
            }
            "kreis" => {
                let x = z!(0, "x", "kreis"); let y = z!(1, "y", "kreis");
                let r = z!(2, "r", "kreis");
                let um = zo!(4, "umriss", "kreis");
                fabrik(2, x, y, 0.0, "Kreis", &[("radius", zahl(r)), ("farbe", argn(pos, ben, 3, "farbe")), ("umriss", opt_w(um))])
            }
            "text" => {
                let tw = argn(pos, ben, 0, "t");
                let x = z!(1, "x", "text"); let y = z!(2, "y", "text");
                let g = zo!(3, "groesse", "text");
                let inhalt = if tw == UNDEF { KARTON } else { match textform(tw) { Some(t) => t, None => return KARTON } };
                fabrik(2, x, y, 0.0, "Text", &[("inhalt", inhalt), ("groesse", opt_w(g)), ("farbe", argn(pos, ben, 4, "farbe")), ("ausrichtung", argn(pos, ben, 5, "ausrichtung"))])
            }
            "bild" => {
                let b = argn(pos, ben, 0, "b");
                let x = z!(1, "x", "bild"); let y = z!(2, "y", "bild");
                let g = zo!(3, "groesse", "bild");
                fabrik(2, x, y, 0.0, "Bild", &[("bildchen", b), ("groesse", opt_w(g))])
            }
            "gruppe" => { let x = z!(0, "x", "gruppe", 0.0); let y = z!(1, "y", "gruppe", 0.0); fabrik(2, x, y, 0.0, "", &[]) }
            "koerper" => {
                let form = argn(pos, ben, 0, "form");
                let x = z!(1, "x", "koerper", 0.0); let y = z!(2, "y", "koerper", 0.0); let zz = z!(3, "z", "koerper", 0.0);
                let gl = zo!(5, "glanz", "koerper"); let le = zo!(6, "leuchten", "koerper");
                fabrik(3, x, y, zz, "Koerper", &[("form", form), ("farbe", argn(pos, ben, 4, "farbe")), ("glanz", opt_w(gl)), ("leuchten", opt_w(le)), ("bild", argn(pos, ben, 7, "bild"))])
            }
            "licht" => {
                let x = z!(0, "x", "licht"); let y = z!(1, "y", "licht"); let zz = z!(2, "z", "licht");
                let rw = zo!(4, "reichweite", "licht");
                fabrik(3, x, y, zz, "Licht", &[("farbe", argn(pos, ben, 3, "farbe")), ("reichweite", opt_w(rw))])
            }
            "raum" => { let x = z!(0, "x", "raum", 0.0); let y = z!(1, "y", "raum", 0.0); let zz = z!(2, "z", "raum", 0.0); fabrik(3, x, y, zz, "", &[]) }
            _ => text(hw),
        }
    }
}
fn opt_w(x: Option<f64>) -> W { match x { Some(v) => zahl(v), None => KARTON } }
fn taste(n: W) -> Option<Vec<u8>> { textform(n).map(|t| bytes(t).to_vec()) }
fn enthaelt(l: &[Vec<u8>], n: &[u8]) -> bool { l.iter().any(|x| x.as_slice() == n) }
fn maus_bit(kw: W, wo: &str) -> Option<u32> {
    let n = zahl_arg(kw, wo, "k", Some(1.0))?;
    if n == 1.0 { return Some(1); }
    if n == 2.0 { return Some(2); }
    if n == 3.0 { return Some(4); }
    let mut t = Tb::neu();
    t.s("Maustaste ").n(n).s(" gibt es nicht (1 links, 2 rechts, 3 Mitte).");
    wirf_tb(K_LAUFZEIT, &t);
    None
}

/// Fabrik (README §3, Vertrag für alle Motoren): teil_neu → teil_lage → komp_neu → Setter in Schema-Reihenfolge
/// (fehlende/karton-Werte ohne Aufruf) → komp_haenge
fn fabrik(raum: i32, x: f64, y: f64, zz: f64, art_name: &str, felder: &[(&str, W)]) -> W {
    if !kern_noetig() { return KARTON; }
    let id = match hi(unsafe { k_teil_neu(raum) }) { Some(i) => i, None => return KARTON };
    if hi(unsafe { k_teil_lage(id, x, y, zz) }).is_none() { return KARTON; }
    if !art_name.is_empty() {
        let nr = match art_nach_name(art_name.as_bytes()) {
            Some(n) => n,
            None => {
                let mut t = Tb::neu();
                t.s("Interner Fehler im Herd: Komponente ").s(art_name).s(" fehlt im Schema.");
                wirf_tb(K_LAUFZEIT, &t);
                return KARTON;
            }
        };
        let ar = art_von(nr);
        let h = match hi(unsafe { k_komp_neu(ar.nummer as i32) }) { Some(h) => h as u32, None => return KARTON };
        for &(n, w) in felder.iter() {
            if leer(w) { continue; }
            let fd = match ar.felder.iter().find(|f| bytes(f.name) == n.as_bytes()) { Some(f) => f, None => continue };
            if !setze(h, ar, fd, w) { return KARTON; }
        }
        if hi(unsafe { k_komp_haenge(h as i32, id) }).is_none() { return KARTON; }
    }
    teil_obj(id as u32)
}

// ---------------------------------------------------------------- Spielschleife (SPEC §18.2)
fn json_zahl(x: f64, out: &mut Vec<u8>) { zl::js_text(x, out); }
fn sende(json: &[u8], paket_len: i32) { unsafe { herd_senden(json.as_ptr(), json.len() as i32, paket_len); } }
fn sende_fenster() {
    let h = welt();
    let mut s = String::from("{\"art\":\"fenster\",\"titel\":");
    crate::theke::json_text(bytes(h.titel), &mut s);
    let mut b = s.into_bytes();
    b.extend_from_slice(b",\"breite\":");
    json_zahl(h.breite, &mut b);
    b.extend_from_slice(b",\"hoehe\":");
    json_zahl(h.hoehe, &mut b);
    b.push(b'}');
    sende(&b, -1);
}
fn oeffne() {
    welt().offen = true;
    unsafe { k_paket_voll(); }   // neues Fenster: das nächste Paket enthält wieder alle Ressourcen
    sende_fenster();
}
fn schliesse_fenster() {
    let h = welt();
    if !h.offen { return; }
    h.offen = false;
    sende(b"{\"art\":\"schliesse\"}", -1);
}
fn bild() -> bool {
    let h = welt();
    let len = match hi(unsafe { k_bild(h.bildnummer as i32) }) { Some(l) => l, None => return false };
    let sz = hash(|p| unsafe { k_hash_szene(p) });
    let pa = hash(|p| unsafe { k_hash_paket(p) });
    let mut b: Vec<u8> = Vec::from(&b"{\"art\":\"bild\",\"bildnummer\":"[..]);
    json_zahl(h.bildnummer, &mut b);
    b.extend_from_slice(b",\"szene\":\"");
    b.extend_from_slice(&sz);
    b.extend_from_slice(b"\",\"paket\":\"");
    b.extend_from_slice(&pa);
    b.extend_from_slice(b"\"}");
    sende(&b, len);
    true
}
fn naechstes() -> Option<Vec<u8>> {
    let mut puf: Vec<u8> = alloc::vec![0u8; 1024];
    loop {
        let n = unsafe { herd_warte(puf.as_mut_ptr(), puf.len() as i32) };
        if n < 0 { return None; }
        let n = n as usize;
        if n > puf.len() { puf = alloc::vec![0u8; n]; continue; }
        puf.truncate(n);
        return Some(puf);
    }
}
fn eingabe(ev: &Json) {
    let h = welt();
    h.vor_tasten = h.tasten.clone();
    h.vor_knoepfe = h.knoepfe;
    if let Some(Json::A(t)) = ev.feld("tasten") {
        if t.iter().all(|x| matches!(x, Json::S(_))) {
            h.tasten = t.iter().map(|x| if let Json::S(s) = x { s.as_bytes().to_vec() } else { Vec::new() }).collect();
        }
    }
    if let Some(Json::A(m)) = ev.feld("maus") {
        if let [Json::N(x), Json::N(y)] = m.as_slice() { if x.is_finite() && y.is_finite() { h.maus_x = *x; h.maus_y = *y; } }
    }
    if let Some(Json::N(kn)) = ev.feld("knoepfe") {
        if zl::ist_ganz(*kn) && *kn >= 0.0 && *kn <= 7.0 { h.knoepfe = *kn as u32; }
    }
}
fn backe(fw: W, knoten: i32) {
    if fw != KARTON && !ist_funktion(fw) { wirf_ananas(K_TYP, "backe() braucht eine Funktion, z. B. () -> { … }."); return; }
    if !welt().offen { oeffne(); }
    if unsafe { herd_warte(core::ptr::null_mut(), -1) } <= 0 {   // ohne Renderer (wie K-063)
        crate::start::warnung("W0104", W0104, knoten);
        schliesse_fenster();
        return;
    }
    loop {
        let ev = match naechstes().and_then(|b| Json::lies(&b)) { Some(j) => j, None => { welt().offen = false; return; } };
        let typ = match &ev { Json::O(_) => ev.text("typ"), _ => None };
        if !matches!(ev, Json::O(_) | Json::A(_)) { welt().offen = false; return; }
        if typ.as_deref() == Some("geschlossen") { welt().offen = false; return; }
        if typ.as_deref() != Some("takt") { continue; }
        eingabe(&ev);
        let n = match ev.feld("anzahl") { Some(Json::N(a)) if zl::ist_ganz(*a) && *a >= 1.0 => if *a > 4.0 { 4 } else { *a as u32 }, _ => 1 };
        for i in 0..n {
            let h = welt();
            h.bildnummer += 1.0;
            h.erster = i == 0;
            // K-087: jeder Takt beginnt mit frischem Schrittbudget (P0002 je Takt)
            unsafe { crate::pf::LIMIT_BASIS = z().schritte; }
            crate::pf::neu_grenze();
            if fw != KARTON {
                h.im_rueckruf = true;
                rufe(fw, &[], &[], knoten);
                if z().sig == SIG_PANIK { welt().schliessen = false; }   // Panik beendet sofort – kein schliesse (§18.2)
                let h = welt();
                h.im_rueckruf = false;
                h.erster = false;
                if h.schliessen {
                    h.schliessen = false;
                    schliesse_fenster();   // nur ein Host-Aufruf – ein schwebendes Signal bleibt
                }
                if sig() { return; }
                if !welt().offen { return; }   // schliesse() im Rückruf: Systeme und Bild entfallen
            }
            welt().erster = false;
            if hi(unsafe { k_takt() }).is_none() { return; }
        }
        if !bild() { return; }
    }
}
/// Programmende (wie K-061): offenes Fenster schließen (nicht bei Panik – der Aufrufer prüft das)
pub fn ende() { if unsafe { WELT.is_some() } { schliesse_fenster(); } }

// ---------------------------------------------------------------- JSON (Schema und takt-Ereignisse)
pub enum Json { N(f64), S(String), B(bool), Null, A(Vec<Json>), O(Vec<(String, Json)>) }
impl Json {
    pub fn lies(b: &[u8]) -> Option<Json> {
        let mut i = 0;
        let j = wert(b, &mut i)?;
        leer_weg(b, &mut i);
        if i == b.len() { Some(j) } else { None }
    }
    pub fn feld(&self, k: &str) -> Option<&Json> { if let Json::O(v) = self { v.iter().rev().find(|x| x.0 == k).map(|x| &x.1) } else { None } }
    fn text(&self, k: &str) -> Option<String> { if let Some(Json::S(s)) = self.feld(k) { Some(s.clone()) } else { None } }
    fn zahl(&self, k: &str) -> Option<f64> { if let Some(Json::N(x)) = self.feld(k) { Some(*x) } else { None } }
}
fn leer_weg(b: &[u8], i: &mut usize) { while *i < b.len() && matches!(b[*i], b' ' | b'\t' | b'\n' | b'\r') { *i += 1; } }
fn wert(b: &[u8], i: &mut usize) -> Option<Json> {
    leer_weg(b, i);
    let c = *b.get(*i)?;
    match c {
        b'{' => {
            *i += 1;
            let mut v = Vec::new();
            leer_weg(b, i);
            if b.get(*i) == Some(&b'}') { *i += 1; return Some(Json::O(v)); }
            loop {
                leer_weg(b, i);
                let k = match wert(b, i)? { Json::S(s) => s, _ => return None };
                leer_weg(b, i);
                if b.get(*i) != Some(&b':') { return None; }
                *i += 1;
                let w = wert(b, i)?;
                v.push((k, w));
                leer_weg(b, i);
                match b.get(*i) { Some(b',') => { *i += 1; } Some(b'}') => { *i += 1; return Some(Json::O(v)); } _ => return None }
            }
        }
        b'[' => {
            *i += 1;
            let mut v = Vec::new();
            leer_weg(b, i);
            if b.get(*i) == Some(&b']') { *i += 1; return Some(Json::A(v)); }
            loop {
                v.push(wert(b, i)?);
                leer_weg(b, i);
                match b.get(*i) { Some(b',') => { *i += 1; } Some(b']') => { *i += 1; return Some(Json::A(v)); } _ => return None }
            }
        }
        b'"' => {
            *i += 1;
            let mut s: Vec<u8> = Vec::new();
            loop {
                let c = *b.get(*i)?;
                *i += 1;
                match c {
                    b'"' => return String::from_utf8(s).ok().map(Json::S),
                    b'\\' => {
                        let e = *b.get(*i)?;
                        *i += 1;
                        match e {
                            b'"' => s.push(b'"'), b'\\' => s.push(b'\\'), b'/' => s.push(b'/'), b'b' => s.push(8), b'f' => s.push(12),
                            b'n' => s.push(b'\n'), b'r' => s.push(b'\r'), b't' => s.push(b'\t'),
                            b'u' => {
                                let mut cp = hex4(b, i)?;
                                if (0xD800..0xDC00).contains(&cp) && b.get(*i) == Some(&b'\\') && b.get(*i + 1) == Some(&b'u') {
                                    let save = *i;
                                    *i += 2;
                                    let lo = hex4(b, i)?;
                                    if (0xDC00..0xE000).contains(&lo) { cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00); } else { *i = save; }
                                }
                                let ch = char::from_u32(cp).unwrap_or('\u{FFFD}');
                                let mut buf = [0u8; 4];
                                s.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
                            }
                            _ => return None,
                        }
                    }
                    _ => s.push(c),
                }
            }
        }
        b't' => { if b[*i..].starts_with(b"true") { *i += 4; Some(Json::B(true)) } else { None } }
        b'f' => { if b[*i..].starts_with(b"false") { *i += 5; Some(Json::B(false)) } else { None } }
        b'n' => { if b[*i..].starts_with(b"null") { *i += 4; Some(Json::Null) } else { None } }
        _ => {
            let a0 = *i;
            while *i < b.len() && matches!(b[*i], b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9') { *i += 1; }
            if a0 == *i { return None; }
            let t = core::str::from_utf8(&b[a0..*i]).ok()?;
            t.parse::<f64>().ok().map(Json::N)
        }
    }
}
fn hex4(b: &[u8], i: &mut usize) -> Option<u32> {
    let mut v = 0u32;
    for _ in 0..4 {
        let c = *b.get(*i)?;
        *i += 1;
        v = v * 16 + match c { b'0'..=b'9' => (c - b'0') as u32, b'a'..=b'f' => (c - b'a' + 10) as u32, b'A'..=b'F' => (c - b'A' + 10) as u32, _ => return None };
    }
    Some(v)
}
