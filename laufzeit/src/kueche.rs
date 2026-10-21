//! Küchenbrigade (SPEC §17, THREADS.md §4.3–§4.5): `blech.brigade(fn)`.
//!
//! Ablauf: **Anschnitt** (Zähler merken, n Saaten ziehen, Auftrag anlegen, statische Laufzeitdaten sichern,
//! `ZUSTAND.gefroren := HEAP_TOP`) → **Stücke** (je `kueche_stueck`: Küchenzustand aus dem Auftrag herstellen,
//! `fn(bᵢ)` rufen, Ergebnis/Abbruch + gepufferte Ereignisse als **Bericht** schreiben) → **Zusammenführen** (D2–D15).
//!
//! Stücke laufen entweder in Klon-Instanzen des Hosts (Import `kueche_auftrag` liefert 0, Berichte über `kueche_bericht`)
//! oder – ohne Köche (`-1`) – nacheinander in dieser Instanz („Inline-Pfad“, gleicher Code, gleicher Zustands-Reset).
//!
//! Einfrieren per Adresse: alles unterhalb `ZUSTAND.gefroren` gehört der Hauptküche (S1); jede verändernde Operation
//! prüft das als **erste** eigene Prüfung (K-101/4) und wirft sonst die `KüchenAnanas`.

use crate::klassen::*;
use crate::namen::*;
use crate::ops::*;
use crate::text::*;
use crate::wert::*;
use crate::z;
use alloc::vec::Vec;

// ---------------------------------------------------------------- Host-Importe (Gruppe `kueche`, HOST-ABI §2)
#[link(wasm_import_module = "pizza")]
extern "C" {
    fn kueche_auftrag(auftrag: u32, n: i32) -> i32;
    fn kueche_bericht(i: i32, puffer: *mut u8, kap: i32) -> i32;
}

// ---------------------------------------------------------------- Wachen (SPEC §17.3)
pub const T_BLECH: &str = "Dieses Blech gehört der Hauptküche – nimm eine kopie().";
pub const T_KARTE: &str = "Diese Speisekarte gehört der Hauptküche – ein Koch darf sie nur lesen.";
pub const T_PIZZA: &str = "Diese Pizza gehört der Hauptküche – ein Koch darf sie nur ansehen.";
pub const T_TEIG: &str = "Dieser Teig gehört der Hauptküche – ein Koch darf ihn nur ansehen.";
pub const T_LIEF: &str = "Diese Lieferung gehört der Hauptküche – ein Koch darf sie nur ansehen.";
pub const T_ZUFALL: &str = "Dieser Zufall gehört der Hauptküche – nimm Zufall direkt oder neu Zufall().";
pub const T_CALZONE: &str = "Diese Calzone gehört der Hauptküche – ein Koch darf sie nicht aufklappen.";
pub const T_EINGABE: &str = "Bestellannahme gibt es nur in der Hauptküche.";
pub const T_THEKE: &str = "Die Theke gibt es nur in der Hauptküche.";
pub const T_KAMMER_NEU: &str = "Neue Vorratskammern gibt es nur in der Hauptküche.";

/// Wirft die KüchenAnanas, wenn `w` ein Objekt der Hauptküche ist (true = geworfen).
#[inline]
pub fn wache(w: W, t: &str) -> bool {
    if crate::gefroren_w(w) { wirf_ananas(K_KUECHE, t); return true; }
    false
}
/// S4: nur in der Hauptküche (true = geworfen).
#[inline]
pub fn nur_hauptkueche(t: &str) -> bool {
    if crate::in_kueche() { wirf_ananas(K_KUECHE, t); return true; }
    false
}
/// `'<n>' gehört der Hauptküche – ein Koch darf es nur lesen.` (Variable, Feld, statisches Feld)
pub fn wirf_variable(name: u32) {
    let mut t = Tb::neu();
    t.s("'").name(name).s("' gehört der Hauptküche – ein Koch darf es nur lesen.");
    wirf_tb(K_KUECHE, &t);
}
/// Für den Programmcode: Zuweisung/schieb an eine Variable der Hauptküche (globale Variable, gefangene Zelle).
#[no_mangle]
pub extern "C" fn rt_kueche_var(name: u32) { wirf_variable(name_id(ptr_w(name))); }
/// `Die Vorratskammer 'x' gehört der Hauptküche – ein Koch darf nur nachsehen.` – Kammern entstehen nur in der Hauptküche.
pub fn wache_kammer(name: &[u8]) -> bool {
    if !crate::in_kueche() { return false; }
    let mut t = Tb::neu();
    t.s("Die Vorratskammer '").b(name).s("' gehört der Hauptküche – ein Koch darf nur nachsehen.");
    wirf_tb(K_KUECHE, &t);
    true
}

// ---------------------------------------------------------------- Ereignispuffer der Küche (D4/D5)
pub const EV_AUSGABE: u8 = 1;
pub const EV_SCHREIBE: u8 = 2;
pub const EV_FEHLERAUSGABE: u8 = 3;
pub const EV_LEEREN: u8 = 4;
pub const EV_WARNUNG: u8 = 5;

/// Gepufferte Ereignisse der laufenden Küche (liegt im statischen Bereich → wird je Stück zurückgesetzt).
static mut EREIGNISSE: Vec<u8> = Vec::new();
/// Methode einer W0003-Warnung (D5: „einmal pro Methode“), sonst -1; gesetzt von `rufe_decl`.
pub static mut WARN_METH: i32 = -1;
/// Basis der Rahmen (Ofen/Lieferung) der laufenden Küche: `zwischenstand` wirkt nur auf Öfen ab hier (SPEC §17.2).
pub static mut FRAME_BASIS: u32 = 0;
/// Länge der Namenstabelle beim Anschnitt: IDs darunter gelten auch in der Hauptküche (dürfen in Texte geschrieben werden).
pub static mut NAMEN_BASIS: u32 = 0;
/// Basis des Kühlschranks der laufenden Küche: Einträge darunter gehören der Hauptküche (D12, copy-on-write).
pub static mut CACHE_BASIS: u32 = 0;

fn pu32(b: &mut Vec<u8>, x: u32) { b.extend_from_slice(&x.to_le_bytes()); }
fn pi32(b: &mut Vec<u8>, x: i32) { b.extend_from_slice(&x.to_le_bytes()); }
fn pf64(b: &mut Vec<u8>, x: f64) { b.extend_from_slice(&x.to_bits().to_le_bytes()); }
fn pbytes(b: &mut Vec<u8>, x: &[u8]) { pu32(b, x.len() as u32); b.extend_from_slice(x); }

pub fn ereignis(art: u8, text: &[u8]) {
    unsafe {
        EREIGNISSE.push(art);
        if art != EV_LEEREN { pbytes(&mut EREIGNISSE, text); }
    }
}
pub fn ereignis_warnung(code: &[u8], text: &[u8], zz: i32, ss: i32) {
    unsafe {
        EREIGNISSE.push(EV_WARNUNG);
        pi32(&mut EREIGNISSE, WARN_METH);
        pi32(&mut EREIGNISSE, zz);
        pi32(&mut EREIGNISSE, ss);
        pbytes(&mut EREIGNISSE, code);
        pbytes(&mut EREIGNISSE, text);
    }
}

// ---------------------------------------------------------------- Leser
struct Leser<'a> { b: &'a [u8], i: usize }
impl<'a> Leser<'a> {
    fn u8(&mut self) -> u8 { let x = self.b[self.i]; self.i += 1; x }
    fn u32(&mut self) -> u32 { let mut a = [0u8; 4]; a.copy_from_slice(&self.b[self.i..self.i + 4]); self.i += 4; u32::from_le_bytes(a) }
    fn i32(&mut self) -> i32 { self.u32() as i32 }
    fn u64(&mut self) -> u64 { let mut a = [0u8; 8]; a.copy_from_slice(&self.b[self.i..self.i + 8]); self.i += 8; u64::from_le_bytes(a) }
    fn f64(&mut self) -> f64 { f64::from_bits(self.u64()) }
    fn bytes(&mut self) -> &'a [u8] { let n = self.u32() as usize; let r = &self.b[self.i..self.i + n]; self.i += n; r }
}

// ---------------------------------------------------------------- Kartonformat PKF1 (HOST-ABI Anhang A)
const P_KARTON: u8 = 0;
const P_NEIN: u8 = 1;
const P_JA: u8 = 2;
const P_ZAHL: u8 = 3;
const P_AUTO: u8 = 4;
const P_TEXT: u8 = 5;
const P_DAUER: u8 = 6;
const P_FEST: u8 = 7;
const P_MODUL: u8 = 8;
const P_TYP: u8 = 9;
const P_ENUMW: u8 = 10;
const P_BELAG: u8 = 11;
const P_WEG: u8 = 12;
const P_UNDEF: u8 = 13;
const P_BLECH: u8 = 20;
const P_KARTE: u8 = 21;
const P_PIZZA: u8 = 22;
const P_SICHT: u8 = 23;
const P_OBJ: u8 = 24;
const P_ROH: u8 = 25;
const P_REF: u8 = 30;

/// Adresse → Index der bereits geschriebenen Objekte (offene Hashtabelle; Teilung/Zyklen bleiben erhalten).
struct Memo { k: Vec<u32>, v: Vec<u32>, n: u32 }
impl Memo {
    fn neu() -> Memo { Memo { k: alloc::vec![0; 64], v: alloc::vec![0; 64], n: 0 } }
    fn h(a: u32, m: usize) -> usize { ((a >> 3).wrapping_mul(0x9E37_79B1) as usize) & (m - 1) }
    fn finde(&self, a: u32) -> Option<u32> {
        let m = self.k.len();
        let mut i = Memo::h(a, m);
        loop {
            let x = self.k[i];
            if x == 0 { return None; }
            if x == a { return Some(self.v[i]); }
            i = (i + 1) & (m - 1);
        }
    }
    fn setze(&mut self, a: u32) -> u32 {
        if (self.n as usize + 1) * 2 > self.k.len() {
            let alt_k = core::mem::take(&mut self.k);
            let alt_v = core::mem::take(&mut self.v);
            let m = alt_k.len() * 2;
            self.k = alloc::vec![0; m];
            self.v = alloc::vec![0; m];
            for j in 0..alt_k.len() { if alt_k[j] != 0 { self.einfuegen(alt_k[j], alt_v[j]); } }
        }
        let idx = self.n;
        self.einfuegen(a, idx);
        self.n += 1;
        idx
    }
    fn einfuegen(&mut self, a: u32, idx: u32) {
        let m = self.k.len();
        let mut i = Memo::h(a, m);
        while self.k[i] != 0 { i = (i + 1) & (m - 1); }
        self.k[i] = a; self.v[i] = idx;
    }
}

/// `<Art>` eines nicht kartonfähigen Werts (SPEC §17.5, abschließende Liste K-101/1).
fn karton_art(w: W) -> Option<&'static str> {
    match art(w) {
        A_FUNKTION | A_GEBUNDEN | A_NATIV => Some("Eine Funktion"),
        A_TEIG => Some("Ein Teig"),
        A_LIEF => Some("Eine Lieferung"),
        A_ZUST => Some("Eine Zustellung"),
        A_STUECK => Some("Ein Stück"),
        A_RESTE => Some("Reste"),
        crate::vorrat::A_ZUFALL => Some("Ein Zufall"),
        crate::vorrat::A_KAMMER => Some("Eine Vorratskammer"),
        crate::theke::A_THEKE | crate::theke::A_ZUTAT => Some("Eine Theke-Zutat"),
        _ => None,
    }
}

/// Schreibt `w` tief kopierbar (Tiefensuche in Kartonreihenfolge). Err = erster nicht kartonfähiger Teilwert.
struct Schreiber { b: Vec<u8>, memo: Memo, grenze: u32 }
impl Schreiber {
    fn neu(grenze: u32) -> Schreiber { let mut b = Vec::new(); b.extend_from_slice(b"PKF1"); Schreiber { b, memo: Memo::neu(), grenze } }
    fn fest(&self, w: W) -> bool { p(w) < self.grenze }
    fn wert(&mut self, w: W) -> Result<(), W> {
        let b = &mut self.b;
        if w == KARTON { b.push(P_KARTON); return Ok(()); }
        if w == UNDEF { b.push(P_UNDEF); return Ok(()); }
        if w == WEG { b.push(P_WEG); return Ok(()); }
        if w == AUTO { b.push(P_AUTO); return Ok(()); }
        if ist_zahl(w) { b.push(P_ZAHL); pf64(b, f(w)); return Ok(()); }
        if ist_bool(w) { b.push(if w == JA { P_JA } else { P_NEIN }); return Ok(()); }
        if !ist_ptr(w) { b.push(P_KARTON); return Ok(()); }
        let a = art(w);
        match a {
            A_TEXT | A_DAUER | A_BELAG | A_KLASSE | A_ENUMT | A_ENUMW | A_REZEPTUR | A_MODUL => {
                if self.fest(w) { self.b.push(P_FEST); self.b.extend_from_slice(&w.to_le_bytes()); return Ok(()); }
                let b = &mut self.b;
                match a {
                    A_TEXT => { b.push(P_TEXT); pbytes(b, bytes(w)); }
                    A_DAUER => { b.push(P_DAUER); pf64(b, dauer_ms(w)); }
                    A_MODUL => { b.push(P_MODUL); pu32(b, obj::<Ref>(w).id); }
                    A_KLASSE | A_ENUMT | A_REZEPTUR => { b.push(P_TYP); pu32(b, a); pu32(b, obj::<Ref>(w).id); }
                    A_ENUMW => { let e = obj::<EnumW>(w); b.push(P_ENUMW); pu32(b, e.e); pf64(b, e.pos); }
                    _ => { b.push(P_BELAG); pu32(b, obj::<Belag>(w).id); }
                }
                return Ok(());
            }
            A_BLECH | A_KARTE | A_PIZZA | A_SICHT | A_OBJ | A_ROH => {}
            _ => {
                return Err(match karton_art(w) { Some(t) => neu_str(t), None => typ_name_w(w) });
            }
        }
        if let Some(i) = self.memo.finde(p(w)) { self.b.push(P_REF); pu32(&mut self.b, i); return Ok(()); }
        self.memo.setze(p(w));
        match a {
            A_BLECH => {
                self.b.push(P_BLECH);
                let v = blech_v(w);
                pu32(&mut self.b, v.len() as u32);
                for i in 0..v.len() { self.wert(blech_v(w)[i])?; }
            }
            A_KARTE => {
                self.b.push(P_KARTE);
                let m = crate::karte::karte(w);
                pu32(&mut self.b, m.n);
                for i in 0..m.k.len() {
                    let (k, v) = { let m = crate::karte::karte(w); (m.k[i], m.v[i]) };
                    if k == UNDEF { continue; }
                    self.wert(k)?;
                    self.wert(v)?;
                }
            }
            A_PIZZA => {
                let pz = obj::<Pizza>(w);
                self.b.push(P_PIZZA);
                pi32(&mut self.b, pz.uebrig);
                pu32(&mut self.b, pz.s.len() as u32);
                for &x in pz.s.iter() { self.b.extend_from_slice(&x.to_le_bytes()); }
            }
            A_SICHT => {
                let si = obj::<Sicht>(w);
                self.b.push(P_SICHT);
                pu32(&mut self.b, si.k);
                self.wert(si.pizza)?;
            }
            A_ROH => {
                let r = obj::<Roh>(w);
                self.b.push(P_ROH);
                let (teil, zeit) = (r.teil, r.zeit);
                self.wert(teil)?;
                self.wert(zeit)?;
            }
            _ => {
                let o = obj::<Obj>(w);
                self.b.push(P_OBJ);
                pu32(&mut self.b, o.klasse);
                pf64(&mut self.b, o.nr);
                pu32(&mut self.b, o.zugeklappt);
                let nachricht = o.nachricht;
                self.wert(nachricht)?;
                let n = o.felder.len();
                pu32(&mut self.b, n as u32);
                for i in 0..n {
                    let fe = &obj::<Obj>(w).felder[i];
                    let (fw, info, selbst) = (fe.w, fe.info, fe.besitzer == p(w));
                    pu32(&mut self.b, info);
                    self.b.push(selbst as u8);
                    self.wert(fw)?;
                }
            }
        }
        Ok(())
    }
}

/// Liest einen PKF-Wert in die aktuelle Küche (neue Objekte; feste Werte unverändert).
fn lies_wert(l: &mut Leser, memo: &mut Vec<W>) -> W {
    match l.u8() {
        P_KARTON => KARTON,
        P_NEIN => NEIN,
        P_JA => JA,
        P_ZAHL => zahl(l.f64()),
        P_AUTO => AUTO,
        P_UNDEF => UNDEF,
        P_WEG => WEG,
        P_TEXT => neu_text(l.bytes()),
        P_DAUER => dauer(l.f64()),
        P_FEST => l.u64(),
        P_MODUL => neu_w(Ref { art: A_MODUL, id: l.u32() }),
        P_TYP => {
            let a = l.u32();
            let id = l.u32();
            match a { A_KLASSE => kl(id).wert, A_ENUMT => enm(id).wert, _ => rez(id).wert }
        }
        P_ENUMW => { let e = l.u32(); let pos = l.f64(); enm(e).werte[pos as usize - 1] }
        P_BELAG => {
            let id = l.u32();
            unsafe { crate::pf::BELAEGE.iter().find(|x| x.0 == id).map(|x| x.1).unwrap_or(KARTON) }
        }
        P_REF => memo[l.u32() as usize],
        P_BLECH => {
            let n = l.u32() as usize;
            let b = blech(Vec::with_capacity(n));
            memo.push(b);
            for _ in 0..n { let x = lies_wert(l, memo); blech_v(b).push(x); }
            b
        }
        P_KARTE => {
            let n = l.u32() as usize;
            let m = crate::karte::neu_karte();
            memo.push(m);
            for _ in 0..n {
                let k = lies_wert(l, memo);
                let v = lies_wert(l, memo);
                crate::karte::lege(crate::karte::karte(m), k, v);
            }
            m
        }
        P_PIZZA => {
            let uebrig = l.i32();
            let n = l.u32() as usize;
            let mut s = Vec::with_capacity(n);
            for _ in 0..n { s.push(l.u64()); }
            let w = neu_w(Pizza { art: A_PIZZA, uebrig, s });
            memo.push(w);
            w
        }
        P_SICHT => {
            let k = l.u32();
            let w = neu_w(Sicht { art: A_SICHT, k, pizza: KARTON });
            memo.push(w);
            let pz = lies_wert(l, memo);
            obj::<Sicht>(w).pizza = pz;
            w
        }
        P_ROH => {
            let w = neu_w(Roh { art: A_ROH, _r: 0, teil: KARTON, zeit: KARTON });
            memo.push(w);
            let teil = lies_wert(l, memo);
            let zeit = lies_wert(l, memo);
            let r = obj::<Roh>(w);
            r.teil = teil; r.zeit = zeit;
            w
        }
        P_OBJ => {
            let klasse = l.u32();
            let nr = l.f64();
            let zugeklappt = l.u32();
            let w = neu_w(Obj { art: A_OBJ, klasse, nr, felder: Vec::new(), zugeklappt, nachricht: KARTON, cache: 0 });
            memo.push(w);
            let nachricht = lies_wert(l, memo);
            obj::<Obj>(w).nachricht = nachricht;
            let n = l.u32() as usize;
            let mut felder = Vec::with_capacity(n);
            for _ in 0..n {
                let info = l.u32();
                let selbst = l.u8() != 0;
                let fw = lies_wert(l, memo);
                felder.push(Feld { w: fw, info, besitzer: if selbst { p(w) } else { 0 } });
            }
            obj::<Obj>(w).felder = felder;
            w
        }
        _ => core::arch::wasm32::unreachable(),
    }
}

// ---------------------------------------------------------------- Auftrag
/// Alles, was ein Stück braucht (liegt unterhalb von `gefroren`, wird von Stücken nie verändert).
pub struct Auftrag {
    pub n: u32,
    pub blech: W,
    pub f: W,
    pub knoten: i32,
    pub s0: f64,
    pub off0: f64,
    pub t0: f64,
    pub n0: f64,
    pub l0: f64,
    /// Heap-Spitze, auf die jedes Stück zurückgesetzt wird (Inline-Pfad: wächst um die gesicherten Berichte)
    pub frozen: u32,
    /// Grenze beim Anschnitt (Kartonformat: Werte darunter sind „fest“)
    pub frozen0: u32,
    /// `gefroren` der umgebenden Küche (0 = Hauptküche)
    pub frozen_alt: u32,
    /// Länge des Ereignispuffers beim Anschnitt (verschachtelte Brigade)
    pub ev0: u32,
    /// D13: so viel darf jedes Stück neu belegen
    pub speicher_neu: u32,
    pub saaten: Vec<f64>,
    pub zaehler: Vec<f64>,
    pub tot: Vec<bool>,
    pub gewarnt: Vec<bool>,
    pub frame_basis: u32,
    pub cache_basis: u32,
    /// Kopie der veränderlichen statischen Laufzeitdaten [STATISCH_START, __heap_base)
    pub statisch: Vec<u8>,
}

extern "C" { static __heap_base: u8; }
fn statisch_bereich() -> (u32, u32) {
    let ende = unsafe { core::ptr::addr_of!(__heap_base) as u32 };
    let start = unsafe { crate::STATISCH_START };
    // ohne Linker-Angabe (Laufzeit allein, z. B. baue.js): ab ZUSTAND – liegt am Anfang von .data
    let start = if start == 0 || start > ende { core::ptr::addr_of!(crate::ZUSTAND) as u32 } else { start };
    (start, ende)
}

/// Stellt den Zustand der Hauptküche beim Anschnitt wieder her (vor jedem Stück und nach den Stücken im Inline-Pfad).
fn wiederherstellen(a: &Auftrag) {
    unsafe {
        let ende_alt = crate::HEAP_ENDE;
        let (s, _) = statisch_bereich();
        core::ptr::copy_nonoverlapping(a.statisch.as_ptr(), s as *mut u8, a.statisch.len());
        crate::HEAP_ENDE = ende_alt;
        crate::HEAP_TOP = a.frozen;
        z().gefroren = a.frozen;
        for (i, &x) in a.zaehler.iter().enumerate() { KLASSEN[i].zaehler = x; }
        for (i, &x) in a.tot.iter().enumerate() { crate::pf::FRAMES[i].tot = x; }
        for (i, &x) in a.gewarnt.iter().enumerate() { METH[i].gewarnt = x; }
    }
}

// ---------------------------------------------------------------- Stück (D1)
const ST_OK: u32 = 0;
const ST_ANANAS: u32 = 1;
const ST_BUDGET: u32 = 2;
const ST_PF: u32 = 3;
const ST_LIMIT: u32 = 4;
const ST_PANIK: u32 = 5;
const ST_WURF_KARTON: u32 = 6;

static mut BERICHT_LEN: u32 = 0;

/// Führt Stück i (1 … n) aus und liefert den Bericht (Zeiger; Länge über `rt_kueche_laenge`).
/// Export `kueche_stueck` (vom Compiler als multi-value-Hülle erzeugt) – für Klon-Instanzen des Hosts.
#[no_mangle]
pub extern "C" fn rt_kueche_stueck(auftrag: u32, i: i32) -> u32 {
    let a = unsafe { &*(auftrag as *const Auftrag) };
    let b = stueck(a, (i - 1) as usize);
    let len = b.len() as u32;
    let ptr = b.as_ptr() as u32;
    core::mem::forget(b);
    unsafe { BERICHT_LEN = len; }
    ptr
}
#[no_mangle]
pub extern "C" fn rt_kueche_laenge() -> u32 { unsafe { BERICHT_LEN } }

fn stueck(a: &Auftrag, i: usize) -> Vec<u8> {
    wiederherstellen(a);
    unsafe {
        crate::vorrat::saat_global(a.saaten[i]);
        crate::SPEICHER_LIMIT = (crate::HEAP_TOP - crate::HEAP_START).saturating_add(a.speicher_neu);
        crate::VOLL_MELDEN = false;
        FRAME_BASIS = a.frame_basis;
        CACHE_BASIS = a.cache_basis;
        NAMEN_BASIS = NAMENS_TEXT.len() as u32;
        WARN_METH = -1;
    }
    let x = blech_v(a.blech)[i];
    let v = crate::klassen::rufe(a.f, &[x], &[], a.knoten);
    crate::speicher_pruefen();
    // ---- Ergebnis bzw. Abbruch in den Karton
    let mut status = ST_OK;
    let mut nutz: Vec<u8> = Vec::new();
    let s = z().sig;
    if s == 0 {
        let mut sch = Schreiber::neu(a.frozen0);
        match sch.wert(v) {
            Ok(()) => { nutz = sch.b; }
            Err(art_t) => {
                // §17.5: die Ananas entsteht in der Küche, an der Position des brigade-Aufrufs, ohne Schritte
                z().pos = a.knoten;
                let mut t = Tb::neu();
                t.t(art_t).s(" passt in keinen Karton – nur Werte können die Küche verlassen.");
                wirf_tb(K_KUECHE, &t);
            }
        }
    }
    let s = z().sig;
    if s == SIG_ANANAS {
        let (o, pos) = unsafe { (WURF_OBJ, WURF_POS) };
        let mut sch = Schreiber::neu(a.frozen0);
        match sch.wert(o) {
            Ok(()) => { status = ST_ANANAS; pi32(&mut nutz, pos); nutz.extend_from_slice(&sch.b); }
            Err(_) => { status = ST_WURF_KARTON; }
        }
    } else if s == SIG_BUDGET {
        status = ST_BUDGET;
        pu32(&mut nutz, unsafe { BUDGET_FRAME });
    } else if s == SIG_PF {
        status = ST_PF;
        unsafe {
            pi32(&mut nutz, PF_POS);
            pbytes(&mut nutz, PF_CODE.as_bytes());
            let t = PF_TEXT;
            pbytes(&mut nutz, if art(t) == A_TEXT { bytes(t) } else { b"" });
        }
    } else if s == SIG_LIMIT {
        status = ST_LIMIT;
        pi32(&mut nutz, z().pos);
    } else if s == SIG_PANIK {
        status = ST_PANIK;
    }
    // ---- Bericht
    let mut b: Vec<u8> = Vec::new();
    pu32(&mut b, status);
    pf64(&mut b, z().schritte - a.s0);
    pf64(&mut b, z().schritte + z().offset - a.t0);
    pf64(&mut b, unsafe { INSTANZEN } - a.n0);
    pf64(&mut b, unsafe { crate::pf::LIEFER_NR } as f64 - a.l0);
    pu32(&mut b, a.zaehler.len() as u32);
    for (j, &z0) in a.zaehler.iter().enumerate() { pf64(&mut b, kl(j as u32).zaehler - z0); }
    unsafe {
        let ev = &EREIGNISSE[(a.ev0 as usize).min(EREIGNISSE.len())..];
        pbytes(&mut b, ev);
    }
    b.extend_from_slice(&nutz);
    b
}

// ---------------------------------------------------------------- brigade (Anschnitt → Stücke → Zusammenführen)
pub fn brigade(o: W, f: W, knoten: i32) -> W {
    let n = blech_v(o).len();
    if n == 0 { return blech(Vec::new()); }
    // keine Funktion → derselbe Fehler wie bei belege (vor dem Anschnitt, ohne Zufallsziehung)
    if !ist_funktion(f) { let x = blech_v(o)[0]; rufe(f, &[x], &[], knoten); return KARTON; }
    // ---- Anschnitt
    let zz = z();
    let saaten: Vec<f64> = (0..n).map(|_| crate::zahl::floor(crate::vorrat::global_r() * 4294967296.0)).collect();
    let (s, e) = statisch_bereich();
    let benutzt = unsafe { crate::HEAP_TOP.saturating_sub(crate::HEAP_START) };
    let rest = unsafe { crate::SPEICHER_LIMIT.saturating_sub(benutzt) };
    let mut berichte: Vec<(u32, u32)> = Vec::with_capacity(n);
    // Auftrag auf den Heap (Klone lesen ihn aus ihrer Speicherkopie)
    let auftrag: &mut Auftrag = neu(Auftrag {
        n: n as u32,
        blech: o,
        f,
        knoten,
        s0: zz.schritte,
        off0: zz.offset,
        t0: zz.schritte + zz.offset,
        n0: unsafe { INSTANZEN },
        l0: unsafe { crate::pf::LIEFER_NR } as f64,
        frozen: 0,
        frozen0: 0,
        frozen_alt: zz.gefroren,
        ev0: unsafe { EREIGNISSE.len() as u32 },
        speicher_neu: if rest < (256 << 20) { rest } else { 256 << 20 },
        saaten,
        zaehler: unsafe { KLASSEN.iter().map(|k| k.zaehler).collect() },
        tot: unsafe { crate::pf::FRAMES.iter().map(|f| f.tot).collect() },
        gewarnt: unsafe { METH.iter().map(|m| m.gewarnt).collect() },
        frame_basis: unsafe { crate::pf::FRAMES.len() as u32 },
        cache_basis: crate::pf::cache_laenge(),
        statisch: alloc::vec![0u8; (e - s) as usize],
    });
    let top = unsafe { (crate::HEAP_TOP + 15) & !15 };
    unsafe { crate::HEAP_TOP = top; }
    auftrag.frozen = top;
    auftrag.frozen0 = top;
    zz.gefroren = top;
    unsafe { core::ptr::copy_nonoverlapping(s as *const u8, auftrag.statisch.as_mut_ptr(), (e - s) as usize); }
    let ap = auftrag as *mut Auftrag as u32;
    // ---- Stücke: Köche des Hosts (nur in der Hauptküche gefragt; innere Brigaden laufen immer inline)
    let koeche = if auftrag.frozen_alt == 0 { unsafe { kueche_auftrag(ap, n as i32) } } else { -1 };
    if koeche == 0 {
        // Berichte liegen beim Host; die Hauptinstanz hat nichts verändert
        zz.gefroren = auftrag.frozen_alt;
        let mut puf: Vec<u8> = alloc::vec![0u8; 1 << 16];
        let mut alle: Vec<Vec<u8>> = Vec::new();
        for i in 1..=n {
            let mut len = unsafe { kueche_bericht(i as i32, puf.as_mut_ptr(), puf.len() as i32) };
            if len == -2 { break; }
            if len as usize > puf.len() {
                puf = alloc::vec![0u8; len as usize];
                len = unsafe { kueche_bericht(i as i32, puf.as_mut_ptr(), puf.len() as i32) };
            }
            if len < 0 { break; }
            let b = puf[..len as usize].to_vec();
            let ok = bericht_status(&b) == ST_OK;
            alle.push(b);
            if !ok { break; }
        }
        let refs: Vec<&[u8]> = alle.iter().map(|b| &b[..]).collect();
        return zusammenfuehren(auftrag, &refs);
    }
    // Inline-Pfad: Stücke nacheinander in dieser Instanz, Berichte hinter die Grenze retten
    for i in 0..n {
        let b = stueck(auftrag, i);
        let len = b.len() as u32;
        let ok = bericht_status(&b) == ST_OK;
        let ziel = auftrag.frozen;
        unsafe { core::ptr::copy(b.as_ptr(), ziel as *mut u8, len as usize); }
        core::mem::forget(b);
        berichte.push((ziel, len));
        auftrag.frozen = (ziel + len + 15) & !15;
        if !ok { break; }
    }
    wiederherstellen(auftrag);
    zz.gefroren = auftrag.frozen_alt;
    let refs: Vec<&[u8]> = berichte.iter().map(|&(p, l)| unsafe { core::slice::from_raw_parts(p as *const u8, l as usize) }).collect();
    zusammenfuehren(auftrag, &refs)
}

fn bericht_status(b: &[u8]) -> u32 { u32::from_le_bytes([b[0], b[1], b[2], b[3]]) }

/// D5: Warnung eines Stücks nur, wenn sie in der Hauptküche bzw. einem früheren Stück noch nicht erschien.
fn warnung_weiter(meth: i32, code: &[u8], text: &[u8], zz: i32, ss: i32) {
    if meth >= 0 {
        let me = crate::klassen::meth(meth as u32);
        if me.gewarnt { return; }
        me.gewarnt = true;
    }
    if !crate::start::warn_neu_bytes(code, zz, ss) { return; }
    unsafe {
        let alt = WARN_METH;
        WARN_METH = meth;
        crate::host_warnung(code, text, zz, ss);
        WARN_METH = alt;
    }
}

/// Zusammenführen in Stückreihenfolge (D2–D15).
fn zusammenfuehren(a: &Auftrag, berichte: &[&[u8]]) -> W {
    let zz = z();
    let mut summe = 0.0;
    let mut max_d = 0.0;
    let mut max_c = 0.0;
    let mut max_l = 0.0;
    let mut max_z: Vec<f64> = alloc::vec![0.0; a.zaehler.len()];
    let mut r: Vec<W> = Vec::with_capacity(a.n as usize);
    let mut abbruch: Option<(u32, usize, usize)> = None; // (status, bericht, offset der Nutzlast)
    for (bi, b) in berichte.iter().enumerate() {
        let mut l = Leser { b, i: 0 };
        let status = l.u32();
        let s = l.f64(); let d = l.f64(); let c = l.f64(); let li = l.f64();
        let nz = l.u32() as usize;
        for j in 0..nz { let x = l.f64(); if j < max_z.len() && x > max_z[j] { max_z[j] = x; } }
        let ev = l.bytes();
        // Ereignisse in Auftretensreihenfolge (D4) – in der Hauptküche an den Host, in einer Küche in deren Puffer
        let mut e = Leser { b: ev, i: 0 };
        while e.i < ev.len() {
            match e.u8() {
                EV_AUSGABE => crate::host_ausgabe(e.bytes()),
                EV_SCHREIBE => crate::host_schreibe(e.bytes()),
                EV_FEHLERAUSGABE => crate::host_fehlerausgabe(e.bytes()),
                EV_LEEREN => crate::host_leeren(),
                _ => {
                    let m = e.i32(); let z1 = e.i32(); let s1 = e.i32();
                    let code = e.bytes(); let text = e.bytes();
                    warnung_weiter(m, code, text, z1, s1);
                }
            }
        }
        summe += s;
        if d > max_d { max_d = d; }
        if c > max_c { max_c = c; }
        if li > max_l { max_l = li; }
        if status != ST_OK { abbruch = Some((status, bi, l.i)); break; }
        let mut memo = Vec::new();
        if l.b.len() < l.i + 4 || &l.b[l.i..l.i + 4] != b"PKF1" { core::arch::wasm32::unreachable(); }
        l.i += 4;
        r.push(lies_wert(&mut l, &mut memo));
    }
    // ---- Zähler, Uhr (D6, D10)
    zz.schritte = a.s0 + summe;
    zz.offset = a.t0 + max_d - zz.schritte;
    unsafe {
        INSTANZEN = a.n0 + max_c;
        crate::pf::LIEFER_NR = (a.l0 + max_l) as u32;
        for (j, &z0) in a.zaehler.iter().enumerate() { KLASSEN[j].zaehler = z0 + max_z[j]; }
    }
    crate::pf::neu_grenze();
    if let Some((status, bi, off)) = abbruch {
        let mut l = Leser { b: berichte[bi], i: off };
        match status {
            ST_ANANAS => {
                let pos = l.i32();
                l.i += 4; // PKF1
                let mut memo = Vec::new();
                let o = lies_wert(&mut l, &mut memo);
                wirf_obj(o, pos);
            }
            ST_WURF_KARTON => {
                zz.pos = a.knoten;
                wirf_ananas(K_KUECHE, "Was der Koch geworfen hat, passt in keinen Karton.");
            }
            ST_BUDGET => {
                let id = l.u32();
                unsafe {
                    if let Some(i) = crate::pf::FRAMES.iter().position(|f| f.id == id) {
                        for j in i..crate::pf::FRAMES.len() { crate::pf::FRAMES[j].tot = true; }
                    }
                    crate::pf::neu_grenze();
                    BUDGET_FRAME = id;
                }
                setze_sig(SIG_BUDGET);
            }
            ST_PF => {
                let pos = l.i32();
                let code = l.bytes();
                let text = l.bytes();
                let cw = neu_text(code);
                wirf_pf(s(cw), neu_text(text), pos);
            }
            ST_LIMIT => { setze_sig(SIG_LIMIT); }
            _ => { wirf_panik(); }
        }
        return KARTON;
    }
    // D7: Summe aller Stücke über dem Limit → P0002 am brigade-Aufruf
    if zz.schritte > unsafe { crate::pf::LIMIT_BASIS } + zz.limit {
        zz.pos = a.knoten;
        setze_sig(SIG_LIMIT);
        return KARTON;
    }
    while r.len() < a.n as usize { r.push(KARTON); }
    blech(r)
}
