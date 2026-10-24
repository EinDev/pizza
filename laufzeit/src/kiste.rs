//! Kiste – Projektdateien im Modul (SPEC §11.2, K-146; PROJEKTE.md §5.6, PA2) und Standard-Argumente (SPEC §2.1, K-141).
//!
//! Der Compiler legt die Inhalte aller Kiste-Dateien (Texte als UTF-8, Bilder als vorgebackene Teiglinge, je Quell-Hash einmal)
//! in ein **passives Datensegment** des Programms; die Tabelle (Pfad → Art, Offset, Länge, nach Bytefolge sortiert) liegt in den
//! Programmdaten. Gelesen wird über eine kleine Programmfunktion `(ziel, offset, länge)` mit `memory.init` (Rust kennt den
//! Segment-Index nicht) – aufgerufen über ihren Tabellenindex. Das Segment wird nie verworfen (`data.drop`): Küchen-Klone und
//! wiederholtes Lesen brauchen es. Das Format gehört der Laufzeit (HOST-ABI §1), kein Host liest es.

use crate::klassen::Ben;
use crate::ops::*;
use crate::namen::*;
use crate::text::*;
use crate::wert::*;
use crate::sig;
use alloc::vec::Vec;

/// Art eines Kiste-Eintrags (vom Compiler gesetzt, nach Endung): Text (`.pizza .txt .json .csv .md`), Bild (Teigling) oder sonst
pub const ART_TEXT: u32 = 0;
pub const ART_BILD: u32 = 1;
pub const ART_SONST: u32 = 2;

#[derive(Clone, Copy)]
pub struct Eintrag { pub pfad: W, pub art: u32, pub off: u32, pub len: u32 }

static mut KISTE: Vec<Eintrag> = Vec::new();
/// Tabellenindex der Kopierfunktion `(ziel: i32, offset: i32, länge: i32)` (0 = keine Kiste)
static mut KOPIERE: u32 = 0;
static mut STD_ARGS: Vec<W> = Vec::new();

/// vom Programm gesetzt: `n` Einträge ab `tab` zu je 4 × u32 (Text-Zeiger Pfad, Art, Offset, Länge), sortiert nach Bytefolge
#[no_mangle]
pub extern "C" fn rt_kiste(kopiere: u32, tab: u32, n: u32) {
    unsafe {
        KOPIERE = kopiere;
        KISTE.clear();
        for i in 0..n {
            let q = (tab + i * 16) as *const u32;
            KISTE.push(Eintrag { pfad: ptr_w(*q), art: *q.add(1), off: *q.add(2), len: *q.add(3) });
        }
    }
}

/// Standard-Argumente aus `pizza.json` (SPEC §2.1): `n` Text-Zeiger ab `tab`; gelten, wenn der Host keine Argumente übergibt
#[no_mangle]
pub extern "C" fn rt_standard_args(tab: u32, n: u32) {
    unsafe {
        STD_ARGS.clear();
        for i in 0..n { STD_ARGS.push(ptr_w(*((tab + i * 4) as *const u32))); }
    }
}
/// Argumente für `hauptgang`: die des Hosts, sonst die Standard-Argumente des Moduls
pub fn args() -> Vec<W> {
    unsafe { if crate::ARGS.is_empty() { STD_ARGS.clone() } else { crate::ARGS.clone() } }
}

/// Eintrag zu einem Pfad (Tabelle nach Bytefolge sortiert → binäre Suche)
pub fn finde(pfad: &[u8]) -> Option<Eintrag> {
    unsafe { KISTE.binary_search_by(|e| bytes(e.pfad).cmp(pfad)).ok().map(|i| KISTE[i]) }
}

/// `len` Bytes ab `off` des Datensegments nach `ziel` (Programm-Speicher)
pub fn lies(ziel: *mut u8, off: u32, len: u32) {
    if len == 0 { return; }
    unsafe {
        let f: extern "C" fn(i32, i32, i32) = core::mem::transmute(KOPIERE as usize);
        f(ziel as i32, off as i32, len as i32);
    }
}

/// Inhalt eines Eintrags in kleinen Stücken an `ziel` übergeben (Bilder: in den Kern-Speicher, ohne den Heap zu belasten)
pub fn stueckweise(e: &Eintrag, mut ziel: impl FnMut(u32, &[u8])) {
    static mut PUF: u32 = 0;
    const STUECK: u32 = 1 << 16;
    unsafe {
        if PUF == 0 { PUF = crate::alloc_roh(STUECK, 8) as u32; }
        let mut o = 0;
        while o < e.len {
            let n = if e.len - o < STUECK { e.len - o } else { STUECK };
            lies(PUF as *mut u8, e.off + o, n);
            ziel(o, core::slice::from_raw_parts(PUF as *const u8, n as usize));
            o += n;
        }
    }
}

fn inhalt(e: &Eintrag) -> Vec<u8> {
    let mut v = alloc::vec![0u8; e.len as usize];
    lies(v.as_mut_ptr(), e.off, e.len);
    v
}

// ---------------------------------------------------------------- Modul Kiste (SPEC §11.2)
fn ist_kiste(m: u32) -> bool { bytes(name_text(m)) == b"Kiste" }
/// globaler Name `Kiste` (nach eigenen Klassen – eine eigene Klasse `Kiste` hat Vorrang, der Aufrufer prüft die Reihenfolge)
pub fn modul_wert(id: u32) -> Option<W> {
    static mut W_KISTE: W = KARTON;
    if !ist_kiste(id) { return None; }
    unsafe {
        if W_KISTE == KARTON { W_KISTE = neu_w(Ref { art: A_MODUL, id }); }
        Some(W_KISTE)
    }
}
pub fn ist_modul(m: u32) -> bool { ist_kiste(m) }
pub fn modul_hat(m: u32, id: u32) -> bool {
    ist_kiste(m) && matches!(bytes(name_text(id)), b"text" | b"zeilen" | b"gibts" | b"liste")
}

fn argn(pos: &[W], ben: &Ben, i: usize, name: &str) -> W {
    if i < pos.len() { return pos[i]; }
    for &(n, w) in ben.iter() { if bytes(name_text(n)) == name.as_bytes() { return w; } }
    UNDEF
}
/// Argument muss ein Text sein: `TypAnanas: Kiste.text() braucht einen Text für 'pfad', nicht 5.`
fn text_arg(v: W, wo: &str, param: &str) -> Option<W> {
    if art(v) == A_TEXT { return Some(v); }
    let mut t = Tb::neu();
    t.s("Kiste.").s(wo).s("() braucht einen Text für '").s(param).s("', nicht ");
    darstellung(if v == UNDEF { KARTON } else { v }, &mut t);
    if sig() { return None; }
    t.s(".");
    wirf_tb(K_TYP, &t);
    None
}
/// Texteintrag lesen (text/zeilen): fehlt → „liegt nicht in der Kiste“, keine Text-Endung → „ist kein Text“
fn text_lesen(p: W) -> Option<Vec<u8>> {
    let pb = bytes(p);
    match finde(pb) {
        None => {
            let mut t = Tb::neu();
            t.s("Die Datei \"").b(pb).s("\" liegt nicht in der Kiste.");
            wirf_tb(K_LAUFZEIT, &t);
            None
        }
        Some(e) if e.art != ART_TEXT => {
            let mut t = Tb::neu();
            t.b(pb).s(" ist kein Text.");
            wirf_tb(K_LAUFZEIT, &t);
            None
        }
        Some(e) => Some(inhalt(&e)),
    }
}

pub fn modul_methode(id: u32, pos: &[W], ben: &Ben) -> W {
    let n = bytes(name_text(id));
    match n {
        b"text" => {
            let p = match text_arg(argn(pos, ben, 0, "pfad"), "text", "pfad") { Some(p) => p, None => return KARTON };
            match text_lesen(p) { Some(b) => neu_text(&b), None => KARTON }
        }
        b"zeilen" => {
            let p = match text_arg(argn(pos, ben, 0, "pfad"), "zeilen", "pfad") { Some(p) => p, None => return KARTON };
            let b = match text_lesen(p) { Some(b) => b, None => return KARTON };
            let mut z: Vec<W> = b.split(|&c| c == b'\n').map(neu_text).collect();
            if b.is_empty() || b[b.len() - 1] == b'\n' { z.pop(); }
            let r = blech(z);
            crate::speicher_pruefen();
            r
        }
        b"gibts" => {
            let p = match text_arg(argn(pos, ben, 0, "pfad"), "gibts", "pfad") { Some(p) => p, None => return KARTON };
            bool_w(finde(bytes(p)).is_some())
        }
        _ => {
            // liste(ordner = ""): alle Pfade unter ordner (rekursiv), Bytefolge; ungültiger/unbekannter Ordner → leeres Blech
            let o = argn(pos, ben, 0, "ordner");
            let ob: &[u8] = if o == UNDEF { b"" } else { match text_arg(o, "liste", "ordner") { Some(t) => bytes(t), None => return KARTON } };
            let mut r: Vec<W> = Vec::new();
            unsafe {
                for e in KISTE.iter() {
                    let pb = bytes(e.pfad);
                    if ob.is_empty() || (pb.len() > ob.len() + 1 && pb.starts_with(ob) && pb[ob.len()] == b'/') { r.push(neu_text(pb)); }
                }
            }
            let w = blech(r);
            crate::speicher_pruefen();
            w
        }
    }
}
