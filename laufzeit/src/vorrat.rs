//! Zufall (K-077/K-078) und Vorratskammer (K-079/K-080/K-081).

use crate::klassen::*;
use crate::namen::*;
use crate::ops::*;
use crate::std_m::{a, arg};
use crate::text::*;
use crate::wert::*;
use crate::{sig, zahl as zl};
use alloc::string::String;
use alloc::vec::Vec;

pub const A_ZUFALL: u32 = 22;
pub const A_KAMMER: u32 = 23;

// ================================================================ Zufall
#[repr(C)]
pub struct ZufallGen { pub art: u32, pub zustand: u32, pub saat: f64 }

static mut GLOBAL: ZufallGen = ZufallGen { art: A_ZUFALL, zustand: 42, saat: 42.0 };

fn norm_saat(n: f64) -> f64 { let m = 4294967296.0; ((n % m) + m) % m }
fn neuer_gen(saat: f64) -> ZufallGen {
    let s = norm_saat(saat);
    ZufallGen { art: A_ZUFALL, zustand: s as u32, saat: s }
}

fn r(g: &mut ZufallGen) -> f64 { zl::mulberry32(&mut g.zustand) }
pub fn global_r() -> f64 { unsafe { r(&mut GLOBAL) } }

/// Export: Saat vor dem Start setzen (optionen.zufallsSaat). Nicht-Ganzzahlen werden ignoriert (42).
#[no_mangle]
pub extern "C" fn saat_setzen(saat: f64) {
    if zl::ist_ganz(saat) { unsafe { GLOBAL = neuer_gen(saat); } }
}

pub fn ist_zufall(w: W) -> bool { art(w) == A_ZUFALL }

const GEN_METHODEN: [u32; 7] = [N_ZAHL, N_KOMMAZAHL, N_WAHR, N_WAEHLE, N_MISCHE, N_SAAT, N_ALSTEXT];
pub fn hat_methode(id: u32) -> bool { GEN_METHODEN.contains(&id) }

fn gen_methode(g: &mut ZufallGen, gw: W, id: u32, pos: &[W]) -> W {
    match id {
        N_ZAHL => {
            let mut x = match ganz_pruefen(a(pos, 0), "Zufall.zahl") { Some(x) => x, None => return KARTON };
            let mut y = match ganz_pruefen(a(pos, 1), "Zufall.zahl") { Some(x) => x, None => return KARTON };
            if x > y { core::mem::swap(&mut x, &mut y); }
            zahl(x + zl::floor(r(g) * (y - x + 1.0)))
        }
        N_KOMMAZAHL => {
            if pos.is_empty() { return zahl(r(g)); }
            let mut x = match zahl_pruefen(a(pos, 0), "Zufall.kommazahl") { Some(x) => x, None => return KARTON };
            let mut y = match zahl_pruefen(a(pos, 1), "Zufall.kommazahl") { Some(x) => x, None => return KARTON };
            if x > y { core::mem::swap(&mut x, &mut y); }
            zahl(x + r(g) * (y - x))
        }
        N_WAHR => {
            let p = match zahl_pruefen(a(pos, 0), "Zufall.wahr") { Some(x) => x, None => return KARTON };
            bool_w(r(g) < p)
        }
        N_WAEHLE => {
            let b = a(pos, 0);
            if art(b) != A_BLECH {
                let mut t = Tb::neu(); t.s("Zufall.wähle braucht ein Blech, nicht "); darstellung(b, &mut t); t.s(".");
                wirf_tb(K_TYP, &t); return KARTON;
            }
            let n = blech_v(b).len();
            if n == 0 { wirf_ananas(K_KEINSTUECK, "Das Blech ist leer – kein Stück da."); return KARTON; }
            let i = zl::floor(r(g) * n as f64) as usize;
            blech_v(b)[i]
        }
        N_MISCHE => {
            let b = a(pos, 0);
            if art(b) != A_BLECH {
                let mut t = Tb::neu(); t.s("Zufall.mische braucht ein Blech, nicht "); darstellung(b, &mut t); t.s(".");
                wirf_tb(K_TYP, &t); return KARTON;
            }
            let mut c = blech_v(b).clone();
            let mut i = c.len();
            while i > 1 {
                i -= 1;
                let j = zl::floor(r(g) * (i + 1) as f64) as usize;
                c.swap(i, j);
            }
            blech(c)
        }
        N_SAAT => zahl(g.saat),
        N_ALSTEXT => { let mut t = Tb::neu(); t.s("Zufall(").n(g.saat).s(")"); let _ = gw; t.fertig() }
        _ => KARTON,
    }
}

/// Modul `Zufall.m(…)`: Methoden auf dem globalen Strom; `saat(n)` setzt ihn neu.
pub fn modul_methode(id: u32, pos: &[W]) -> W {
    if id == N_SAAT && !pos.is_empty() {
        let n = match ganz_pruefen(pos[0], "Zufall.saat") { Some(x) => x, None => return KARTON };
        unsafe { GLOBAL = neuer_gen(n); }
        return KARTON;
    }
    unsafe { gen_methode(&mut GLOBAL, KARTON, id, pos) }
}

/// Methode auf einem eigenen Generator (`neu Zufall(…)`)
pub fn objekt_methode(o: W, id: u32, pos: &[W]) -> W {
    if !hat_methode(id) { return crate::std_m::nicht_gefunden(o, id); }
    gen_methode(obj::<ZufallGen>(o), o, id, pos)
}

/// `neu Zufall(saat?)`
pub fn neu_zufall(pos: &[W], ben: &Ben) -> W {
    let sa = arg(pos, ben, 0, N_SAAT);
    if sa == UNDEF || sa == KARTON {
        let s = zl::floor(global_r() * 4294967296.0);
        return neu_w(neuer_gen(s));
    }
    match ganz_pruefen(sa, "Zufall") { Some(x) => neu_w(neuer_gen(x)), None => KARTON }
}

// ================================================================ JSON (Wertform der Vorratskammer)
#[derive(Clone)]
pub enum J { Null, Bool(bool), Num(f64), Str(String), Arr(Vec<J>), Obj(Vec<(String, J)>) }

fn j_text(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""), '\\' => out.push_str("\\\\"), '\n' => out.push_str("\\n"), '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"), '\u{8}' => out.push_str("\\b"), '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => { let h = b"0123456789abcdef"; out.push_str("\\u00"); out.push(h[(c as usize >> 4) & 15] as char); out.push(h[c as usize & 15] as char); }
            c => out.push(c),
        }
    }
    out.push('"');
}
pub fn j_schreibe(j: &J, out: &mut String) {
    match j {
        J::Null => out.push_str("null"),
        J::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        J::Num(x) => { if x.is_finite() { let mut b = Vec::new(); zl::js_text(*x, &mut b); out.push_str(unsafe { core::str::from_utf8_unchecked(&b) }); } else { out.push_str("null"); } }
        J::Str(s) => j_text(s, out),
        J::Arr(v) => { out.push('['); for (i, x) in v.iter().enumerate() { if i > 0 { out.push(','); } j_schreibe(x, out); } out.push(']'); }
        J::Obj(v) => { out.push('{'); for (i, (k, x)) in v.iter().enumerate() { if i > 0 { out.push(','); } j_text(k, out); out.push(':'); j_schreibe(x, out); } out.push('}'); }
    }
}

struct Parser<'a> { b: &'a [u8], i: usize }
impl<'a> Parser<'a> {
    fn ws(&mut self) { while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\t' | b'\n' | b'\r') { self.i += 1; } }
    fn wert(&mut self) -> Option<J> {
        self.ws();
        let c = *self.b.get(self.i)?;
        match c {
            b'n' => { self.i += 4; Some(J::Null) }
            b't' => { self.i += 4; Some(J::Bool(true)) }
            b'f' => { self.i += 5; Some(J::Bool(false)) }
            b'"' => Some(J::Str(self.text()?)),
            b'[' => {
                self.i += 1;
                let mut v = Vec::new();
                self.ws();
                if self.b.get(self.i) == Some(&b']') { self.i += 1; return Some(J::Arr(v)); }
                loop {
                    v.push(self.wert()?);
                    self.ws();
                    match self.b.get(self.i)? { b',' => { self.i += 1; } b']' => { self.i += 1; return Some(J::Arr(v)); } _ => return None }
                }
            }
            b'{' => {
                self.i += 1;
                let mut v: Vec<(String, J)> = Vec::new();
                self.ws();
                if self.b.get(self.i) == Some(&b'}') { self.i += 1; return Some(J::Obj(v)); }
                loop {
                    self.ws();
                    let k = self.text()?;
                    self.ws();
                    if self.b.get(self.i) != Some(&b':') { return None; }
                    self.i += 1;
                    let w = self.wert()?;
                    match v.iter_mut().find(|(x, _)| *x == k) { Some(e) => e.1 = w, None => v.push((k, w)) }
                    self.ws();
                    match self.b.get(self.i)? { b',' => { self.i += 1; } b'}' => { self.i += 1; return Some(J::Obj(v)); } _ => return None }
                }
            }
            _ => {
                let st = self.i;
                while self.i < self.b.len() && matches!(self.b[self.i], b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9') { self.i += 1; }
                let t = core::str::from_utf8(&self.b[st..self.i]).ok()?;
                Some(J::Num(t.parse().ok()?))
            }
        }
    }
    fn text(&mut self) -> Option<String> {
        if self.b.get(self.i) != Some(&b'"') { return None; }
        self.i += 1;
        let mut o: Vec<u8> = Vec::new();
        loop {
            let c = *self.b.get(self.i)?;
            self.i += 1;
            match c {
                b'"' => return String::from_utf8(o).ok(),
                b'\\' => {
                    let e = *self.b.get(self.i)?;
                    self.i += 1;
                    match e {
                        b'n' => o.push(b'\n'), b't' => o.push(b'\t'), b'r' => o.push(b'\r'), b'b' => o.push(8), b'f' => o.push(12),
                        b'u' => {
                            let h = core::str::from_utf8(self.b.get(self.i..self.i + 4)?).ok()?;
                            let mut cp = u32::from_str_radix(h, 16).ok()?;
                            self.i += 4;
                            if (0xD800..0xDC00).contains(&cp) && self.b.get(self.i) == Some(&b'\\') && self.b.get(self.i + 1) == Some(&b'u') {
                                let h2 = core::str::from_utf8(self.b.get(self.i + 2..self.i + 6)?).ok()?;
                                let lo = u32::from_str_radix(h2, 16).ok()?;
                                if (0xDC00..0xE000).contains(&lo) { cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00); self.i += 6; }
                            }
                            let ch = core::char::from_u32(cp).unwrap_or('\u{fffd}');
                            let mut b = [0u8; 4];
                            o.extend_from_slice(ch.encode_utf8(&mut b).as_bytes());
                        }
                        x => o.push(x),
                    }
                }
                x => o.push(x),
            }
        }
    }
}
pub fn j_lies(b: &[u8]) -> Option<J> { let mut p = Parser { b, i: 0 }; p.wert() }

// ================================================================ Vorratskammer
#[repr(C)]
/// K-106: `name` = Kammername, `raum` = Namensraum (Text) oder KARTON, `kennung` = `name` bzw. `raum/name`
/// (Schlüssel im HOST-ABI, in der Serialisierung, in Ananas-Texten und der Textform).
pub struct Kammer { pub art: u32, pub _r: u32, pub name: W, pub raum: W, pub kennung: W, pub daten: Vec<(String, J)> }

static mut KAMMERN: Vec<W> = Vec::new();
static mut W0101: bool = false;

#[link(wasm_import_module = "pizza")]
extern "C" {
    fn vorrat_lesen(np: *const u8, nn: usize, p: *mut u8, kap: i32) -> i32;
    fn vorrat_schreiben(np: *const u8, nn: usize, jp: *const u8, jn: usize, ep: *const u8, en: usize) -> i32;
}

pub fn ist_kammer(w: W) -> bool { art(w) == A_KAMMER }
fn kammer(w: W) -> &'static mut Kammer { obj::<Kammer>(w) }

fn text_sicher(v: W, tb: &mut Tb) {
    let mut t = Tb::neu();
    crate::ops::text_in(v, &mut t);
    if sig() { crate::z().sig = 0; typ_name(v, tb); } else { tb.b(&t.0); }
}

fn nicht_einlagerbar(v: W) {
    let mut t = Tb::neu();
    t.s("'");
    text_sicher(v, &mut t);
    t.s("' lässt sich nicht einlagern (erlaubt: Zahlen, Texte, Wahrheitswerte, karton, Bleche und Speisekarten daraus).");
    wirf_tb(K_TYP, &t);
}

/// Pizza-Wert → JSON (K-080); None = geworfen
pub fn einlagern(v: W) -> Option<J> {
    if v == KARTON || v == UNDEF { return Some(J::Null); }
    if ist_zahl(v) {
        let x = f(v);
        if !x.is_finite() { nicht_einlagerbar(v); return None; }
        return Some(J::Num(if x == 0.0 { 0.0 } else { x }));
    }
    if ist_bool(v) { return Some(J::Bool(v == JA)); }
    match art(v) {
        A_TEXT => Some(J::Str(String::from(s(v)))),
        A_BLECH => {
            let n = blech_v(v).len();
            let mut r = Vec::with_capacity(n);
            for i in 0..n { r.push(einlagern(blech_v(v)[i])?); }
            Some(J::Arr(r))
        }
        A_KARTE => {
            let schl = crate::karte::schluessel(crate::karte::karte(v));
            let mut paare = Vec::new();
            for k in schl {
                if art(k) != A_TEXT { nicht_einlagerbar(v); return None; }
                let m = crate::karte::karte(v);
                let w = match crate::karte::finde(m, k) { Some(i) => m.v[i], None => KARTON };
                paare.push(J::Arr(alloc::vec![J::Str(String::from(s(k))), einlagern(w)?]));
            }
            Some(J::Obj(alloc::vec![(String::from("speisekarte"), J::Arr(paare))]))
        }
        _ => { nicht_einlagerbar(v); None }
    }
}

/// JSON → neuer Pizza-Wert (tiefe Kopie)
pub fn auslagern(j: &J) -> W {
    match j {
        J::Null => KARTON,
        J::Bool(b) => bool_w(*b),
        J::Num(x) => zahl(*x),
        J::Str(t) => neu_str(t),
        J::Arr(v) => blech(v.iter().map(auslagern).collect()),
        J::Obj(o) => {
            match o.iter().find(|(k, _)| k == "speisekarte") {
                Some((_, J::Arr(paare))) => {
                    let m = crate::karte::neu_karte();
                    for p in paare {
                        if let J::Arr(pv) = p {
                            if let Some(J::Str(k)) = pv.get(0) {
                                let w = pv.get(1).map(auslagern).unwrap_or(KARTON);
                                crate::karte::lege(crate::karte::karte(m), neu_str(k), w);
                            }
                        }
                    }
                    m
                }
                _ => KARTON,
            }
        }
    }
}

fn serialisiere(k: &Kammer) -> String {
    let mut o = String::from("{\"v\":1,\"name\":");
    j_text(s(k.kennung), &mut o);
    o.push_str(",\"eintraege\":[");
    for (i, (s_, w)) in k.daten.iter().enumerate() {
        if i > 0 { o.push(','); }
        o.push('[');
        j_text(s_, &mut o);
        o.push(',');
        j_schreibe(w, &mut o);
        o.push(']');
    }
    o.push_str("]}");
    o
}

fn schluessel_pruefen(v: W) -> Option<String> {
    if art(v) == A_TEXT { return Some(String::from(s(v))); }
    let mut t = Tb::neu();
    t.s("Schlüssel einer Vorratskammer müssen Texte sein, nicht ");
    darstellung(v, &mut t);
    t.s(".");
    wirf_tb(K_TYP, &t);
    None
}

/// kammerGeaendert: Größenprüfung (mit Rückgängig), Ereignis + Speichern über den Host
fn geaendert(kw: W, schl: Option<&str>, wert: Option<&J>, rueck: Option<&dyn Fn(&mut Kammer)>) -> bool {
    let k = kammer(kw);
    let json = serialisiere(k);
    if json.len() > 1048576 {
        if let Some(r) = rueck {
            r(kammer(kw));
            let mut t = Tb::neu(); t.s("Die Vorratskammer '").t(k.kennung).s("' ist voll (Limit 1 MiB).");
            wirf_tb(K_LAUFZEIT, &t);
            return false;
        }
    }
    let mut e = String::from("{\"schluessel\":");
    match schl { Some(x) => j_text(x, &mut e), None => e.push_str("null") }
    e.push_str(",\"wert\":");
    match wert { Some(w) => j_schreibe(w, &mut e), None => e.push_str("null") }
    e.push('}');
    let name = bytes(k.kennung);
    let r = unsafe { vorrat_schreiben(name.as_ptr(), name.len(), json.as_ptr(), json.len(), e.as_ptr(), e.len()) };
    if r < 0 {
        let mut t = Tb::neu(); t.s("Die Vorratskammer '").t(kammer(kw).kennung).s("' konnte nicht gespeichert werden.");
        wirf_tb(K_LAUFZEIT, &t);
        return false;
    }
    true
}

/// `[a-z0-9-]{1,40}` (Kammername und Namensraum, K-079/K-106)
fn kennung_teil_ok(b: &[u8]) -> bool {
    !b.is_empty() && b.len() <= 40 && b.iter().all(|&c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

/// `neu Vorratskammer(name[, namensraum])` (K-079, K-106)
pub fn neue_kammer(pos: &[W], ben: &Ben, knoten: i32) -> W {
    let n = arg(pos, ben, 0, N_NAME);
    let name = if n == UNDEF || n == KARTON { neu_str("") } else { text(n) };
    if sig() { return KARTON; }
    if !kennung_teil_ok(bytes(name)) {
        let mut t = Tb::neu(); t.s("Ungültiger Kammername '").t(name).s("' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).");
        wirf_tb(K_LAUFZEIT, &t);
        return KARTON;
    }
    // K-106: Namensraum (positional oder benannt) – geprüft nach dem Kammernamen; fehlend/karton = ohne.
    let r = arg(pos, ben, 1, N_NAMENSRAUM);
    let raum = if r == UNDEF || r == KARTON { KARTON } else { text(r) };
    if sig() { return KARTON; }
    let kennung = if raum == KARTON { name } else {
        if !kennung_teil_ok(bytes(raum)) {
            let mut t = Tb::neu(); t.s("Ungültiger Namensraum '").t(raum).s("' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).");
            wirf_tb(K_LAUFZEIT, &t);
            return KARTON;
        }
        let mut t = Tb::neu(); t.t(raum).s("/").t(name); t.fertig()
    };
    let nb = bytes(kennung);
    unsafe {
        for &k in KAMMERN.iter() { if bytes(kammer(k).kennung) == nb { return k; } }
    }
    let verfuegbar = unsafe { vorrat_lesen(nb.as_ptr(), nb.len(), core::ptr::null_mut(), -1) } > 0;
    if !verfuegbar && unsafe { !W0101 } {
        unsafe { W0101 = true; }
        crate::start::warnung("W0101", "Keine Vorratskammer verfügbar – Zustand wird nicht gespeichert.", knoten);
    }
    let mut daten: Vec<(String, J)> = Vec::new();
    if verfuegbar {
        let mut puf: Vec<u8> = alloc::vec![0u8; 4096];
        loop {
            let l = unsafe { vorrat_lesen(nb.as_ptr(), nb.len(), puf.as_mut_ptr(), puf.len() as i32) };
            if l < 0 { break; }
            let l = l as usize;
            if l > puf.len() { puf = alloc::vec![0u8; l]; continue; }
            if let Some(J::Arr(eintraege)) = j_lies(&puf[..l]) {
                for p in eintraege {
                    if let J::Arr(pv) = p {
                        if let Some(J::Str(k)) = pv.get(0) {
                            let w = pv.get(1).cloned().unwrap_or(J::Null);
                            match daten.iter_mut().find(|(x, _)| x == k) { Some(e) => e.1 = w, None => daten.push((k.clone(), w)) }
                        }
                    }
                }
            }
            break;
        }
    }
    let k = neu_w(Kammer { art: A_KAMMER, _r: 0, name, raum, kennung, daten });
    unsafe { KAMMERN.push(k); }
    k
}

pub fn tabelle_hat(id: u32) -> bool { matches!(id, N_LEGE | N_HOLE | N_HAT | N_ENTFERNE | N_SCHLUESSEL | N_LAENGE | N_LEEREN | N_NAME | N_NAMENSRAUM | N_ALSTEXT) }

pub fn kammer_methode(o: W, id: u32, pos: &[W], ben: &Ben) -> W {
    match id {
        N_LEGE => {
            let s_ = match schluessel_pruefen(a(pos, 0)) { Some(x) => x, None => return KARTON };
            let w = match einlagern(if pos.len() > 1 { pos[1] } else { KARTON }) { Some(x) => x, None => return KARTON };
            let k = kammer(o);
            let alt = k.daten.iter().find(|(x, _)| *x == s_).map(|e| e.1.clone());
            match k.daten.iter_mut().find(|(x, _)| *x == s_) { Some(e) => e.1 = w.clone(), None => k.daten.push((s_.clone(), w.clone())) }
            let sk = s_.clone();
            let rueck = move |k: &mut Kammer| {
                match &alt {
                    None => { k.daten.retain(|(x, _)| *x != sk); }
                    Some(a) => { if let Some(e) = k.daten.iter_mut().find(|(x, _)| *x == sk) { e.1 = a.clone(); } }
                }
            };
            geaendert(o, Some(&s_), Some(&w), Some(&rueck));
            o
        }
        N_HOLE => {
            let s_ = match schluessel_pruefen(a(pos, 0)) { Some(x) => x, None => return KARTON };
            if let Some((_, w)) = kammer(o).daten.iter().find(|(x, _)| *x == s_) { return auslagern(&w.clone()); }
            let e = arg(pos, ben, 1, N_ERSATZ);
            if e == UNDEF { KARTON } else { e }
        }
        N_HAT => { let s_ = match schluessel_pruefen(a(pos, 0)) { Some(x) => x, None => return KARTON }; bool_w(kammer(o).daten.iter().any(|(x, _)| *x == s_)) }
        N_ENTFERNE => {
            let s_ = match schluessel_pruefen(a(pos, 0)) { Some(x) => x, None => return KARTON };
            let k = kammer(o);
            let i = match k.daten.iter().position(|(x, _)| *x == s_) { Some(i) => i, None => return KARTON };
            let (_, alt) = k.daten.remove(i);
            geaendert(o, Some(&s_), None, None);
            if sig() { return KARTON; }
            auslagern(&alt)
        }
        N_SCHLUESSEL => blech(kammer(o).daten.iter().map(|(x, _)| neu_str(x)).collect()),
        N_LAENGE => zahl(kammer(o).daten.len() as f64),
        N_LEEREN => { kammer(o).daten.clear(); geaendert(o, None, None, None); o }
        N_NAME => kammer(o).name,
        N_NAMENSRAUM => kammer(o).raum,
        N_ALSTEXT => text(o),
        _ => crate::std_m::nicht_gefunden(o, id),
    }
}

pub fn text_in(v: W, tb: &mut Tb) {
    if ist_zufall(v) { tb.s("Zufall(").n(obj::<ZufallGen>(v).saat).s(")"); }
    else { tb.s("Vorratskammer(").t(kammer(v).kennung).s(")"); }
}
