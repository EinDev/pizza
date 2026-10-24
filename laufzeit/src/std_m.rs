//! Standardbibliothek: Methodentabellen (ZAHL_M, TEXT_M, BLECH_M, …) und Module (Bote, Uhr, Mathe, …).

use crate::klassen::*;
use crate::namen::*;
use crate::ops::*;
use crate::text::*;
use crate::wert::*;
use crate::zahl::*;
use crate::{sig, z};
use alloc::string::String;
use alloc::vec::Vec;

#[inline] pub fn a(pos: &[W], i: usize) -> W { if i < pos.len() { pos[i] } else { UNDEF } }
pub fn arg(pos: &[W], ben: &Ben, i: usize, name: u32) -> W {
    if i < pos.len() { return pos[i]; }
    for &(n, w) in ben.iter() { if n == name { return w; } }
    UNDEF
}
fn nn(w: W) -> W { if w == UNDEF { KARTON } else { w } }

pub fn schneide(b: W, n: usize) -> W {
    let v = blech_v(b);
    let len = v.len();
    let basis = len / n;
    let extra = len % n;
    let mut r = Vec::with_capacity(n);
    let mut i = 0;
    for j in 0..n {
        let g = basis + if j < extra { 1 } else { 0 };
        r.push(blech(v[i..i + g].to_vec()));
        i += g;
    }
    blech(r)
}

fn js_upper(s: &str) -> W {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() { for u in c.to_uppercase() { o.push(u); } }
    neu_str(&o)
}
fn js_lower(s: &str) -> W {
    let mut o = String::with_capacity(s.len());
    let cs: Vec<char> = s.chars().collect();
    for (i, &c) in cs.iter().enumerate() {
        if c == 'Σ' {
            let vor = i > 0 && cs[..i].iter().rev().find(|x| !x.is_ascii_punctuation() || x.is_alphabetic()).map_or(false, |x| x.is_alphabetic());
            let nach = cs.get(i + 1).map_or(false, |x| x.is_alphabetic());
            if vor && !nach { o.push('ς'); continue; }
        }
        for u in c.to_lowercase() { o.push(u); }
    }
    neu_str(&o)
}

fn split(s: &str, t: &str) -> Vec<W> {
    if t.is_empty() { return s.chars().map(|c| { let mut b = [0u8; 4]; neu_str(c.encode_utf8(&mut b)) }).collect(); }
    s.split(t).map(neu_str).collect()
}

pub fn nicht_gefunden(o: W, name: u32) -> W {
    let mut t = Tb::neu();
    t.s("Methode '").name(name).s("' gibt es auf ");
    typ_name(o, &mut t);
    t.s(" nicht.");
    wirf_tb(K_LAUFZEIT, &t);
    KARTON
}

/// Ruft einen Rückruf und prüft danach auf Signale
pub fn rufe1(f: W, x: &[W], knoten: i32) -> Option<W> {
    if sig() { return None; }
    let r = rufe(f, x, &[], knoten);
    if sig() { None } else { Some(r) }
}

// ---------------------------------------------------------------- Tabellen
pub fn tabelle_hat(o: W, id: u32) -> bool {
    if ist_zahl(o) { return matches!(id, N_WAEHRUNG | N_RUNDEN | N_ABS | N_ALSTEXT | N_GANZ | N_TAUSENDER | N_KOMPAKT); }
    if ist_bool(o) { return id == N_ALSTEXT; }
    match art(o) {
        A_TEXT => matches!(id, N_LAENGE | N_GROSS | N_KLEIN | N_ENTHAELT | N_ZERLEGE | N_ERSETZE | N_TRIMME | N_ZEICHEN | N_WIEDERHOLE | N_BEGINNTMIT | N_ENDETMIT | N_ALSZAHL | N_ALSTEXT | N_ISTLEER),
        A_DAUER => matches!(id, N_INMS | N_INSEKUNDEN | N_INMINUTEN | N_ALSTEXT),
        A_BLECH => matches!(id, N_LAENGE | N_STUECK | N_HINZU | N_ENTFERNE | N_SETZE | N_ENTHAELT | N_BELEGE | N_FILTERE | N_ZUSAMMENKLAPPEN | N_SUMME | N_ERSTES | N_LETZTES | N_UMDREHEN | N_SORTIERE | N_VERBINDE | N_ISTLEER | N_SCHNEIDE | N_KOPIE | N_ALSTEXT | N_BRIGADE),
        A_KARTE => matches!(id, N_LEGE | N_HOLE | N_HAT | N_ENTFERNE | N_SCHLUESSEL | N_WERTE | N_LAENGE | N_ISTLEER | N_ALSTEXT),
        A_ENUMW => matches!(id, N_NAME | N_POSITION | N_ALSTEXT),
        A_TEIG => matches!(id, N_GEHENLASSEN | N_BACKEN | N_ISTAUFGEGANGEN | N_ALSTEXT),
        A_LIEF => matches!(id, N_PRIORITAET | N_WARTE | N_WENNDA | N_ISTGELIEFERT | N_ALSTEXT),
        A_ZUST => matches!(id, N_PUENKTLICH | N_WERT | N_ODERGRATIS | N_ALSTEXT),
        A_RESTE => matches!(id, N_WERT | N_ISTMATSCHIG | N_ALSTEXT),
        A_ROH => matches!(id, N_TEILERGEBNIS | N_VERBRAUCHTEZEIT | N_ALSTEXT),
        A_FUNKTION | A_GEBUNDEN | A_NATIV => matches!(id, N_MIKROWELLE | N_FRISCH | N_RUFE | N_ALSTEXT),
        crate::theke::A_THEKE | crate::theke::A_ZUTAT | crate::theke::A_ZETTEL => crate::theke::tabelle_hat(o, id),
        crate::herd::A_HERD..=crate::herd::A_BILDCHEN => crate::herd::tabelle_hat(o, id),
        crate::vorrat::A_ZUFALL => crate::vorrat::hat_methode(id),
        crate::vorrat::A_KAMMER => crate::vorrat::tabelle_hat(id),
        _ => false,
    }
}

pub fn modul_hat(m: u32, id: u32) -> bool {
    match m {
        N_G_BOTE => matches!(id, N_SCHREIBE | N_LEEREN | N_SAGE | N_FEHLER),
        N_G_BESTELLANNAHME => matches!(id, N_LIES | N_FRAGE | N_LIESZAHL | N_FRAGEZAHL | N_HATMEHR),
        N_G_UHR => matches!(id, N_JETZT | N_VORSPULEN | N_ECHT | N_ZONE),
        N_G_MATHE => matches!(id, N_WURZEL | N_MAX | N_MIN | N_ABS | N_RUNDEN | N_BODEN | N_DECKE | N_POTENZ | N_LOG | N_LOG10 | N_LOG2 | N_EXP
            | N_SIN | N_COS | N_TAN | N_ASIN | N_ACOS | N_ATAN | N_ATAN2 | N_BOGEN | N_GRAD),
        N_G_ZUFALL => crate::vorrat::hat_methode(id),
        N_G_SPIEGEL => id == N_FELDER,
        N_G_ZETTEL => id == N_AUS,   // K-125
        _ => (crate::kiste::ist_modul(m) && crate::kiste::modul_hat(m, id)) || (crate::herd::ist_modul(m) && crate::herd::modul_hat(m, id)),
    }
}

pub fn ist_obj_nativ(o: W, id: u32) -> bool {
    (ist_ananas_klasse(obj::<Obj>(o).klasse as i32) && matches!(id, N_NACHRICHT | N_HOLENACHRICHT | N_TYP | N_ALSTEXT))
        || matches!(id, N_ALSTEXT | N_AUFKLAPPEN)
}

/// ANANAS_M / OBJ_M
pub fn ananas_obj_methode(o: W, id: u32, _pos: &[W], _ben: &Ben, knoten: i32) -> Option<W> {
    let ob = obj::<Obj>(o);
    if ist_ananas_klasse(ob.klasse as i32) {
        match id {
            N_NACHRICHT | N_HOLENACHRICHT => return Some(ob.nachricht),
            N_TYP => return Some(name_text(kl(ob.klasse).name)),
            N_ALSTEXT => { let mut t = Tb::neu(); t.name(kl(ob.klasse).name).s(": ").t(ob.nachricht); return Some(t.fertig()); }
            _ => {}
        }
    }
    match id {
        N_ALSTEXT => { let mut t = Tb::neu(); t.name(kl(ob.klasse).name).s("@").n(ob.nr); Some(t.fertig()) }
        N_AUFKLAPPEN => {
            if !ist_calzone(ob.klasse as i32) {
                let mut t = Tb::neu();
                t.s("Nur eine Calzone lässt sich aufklappen – '").name(kl(ob.klasse).name).s("' ist keine.");
                wirf_tb(K_LAUFZEIT, &t);
                return Some(KARTON);
            }
            if crate::kueche::wache(o, crate::kueche::T_CALZONE) { return Some(KARTON); }
            crate::start::warnung("W0013", "Garantie erloschen. Das ist jetzt eine ganz normale Pizza.", knoten);
            ob.zugeklappt = 0;
            Some(o)
        }
        _ => None,
    }
}

/// Aufruf eines Nativ-Funktionswerts
pub fn nativ_rufen(fw: W, pos: &[W], ben: &Ben, knoten: i32) -> W {
    let n = obj::<Nativ>(fw);
    match n.was {
        0 => {
            let o = n.empf;
            match art(o) {
                A_OBJ => obj_methode(o, n.name, pos, ben, knoten, n.modul as i32, true),
                A_ENUMT => blech(enm(obj::<Ref>(o).id).werte.clone()),
                _ => tabellen_methode(o, n.name, pos, ben, knoten, true),
            }
        }
        N_TEIG => match funktion_arg(a(pos, 0), "teig") {
            Some(f) => neu_w(Teig { art: A_TEIG, fertig: 0, auf: 0, _r: 0, fnw: f, wert: KARTON }),
            None => KARTON,
        },
        N_BESTELLE => match funktion_arg(a(pos, 0), "bestelle") {
            Some(f) => crate::pf::bestelle(f),
            None => KARTON,
        },
        N_ZWISCHENSTAND => { crate::pf::zwischenstand(nn(a(pos, 0))); KARTON }
        N_SCHIEB => { wirf_ananas(K_LAUFZEIT, "schieb braucht einen Variablennamen: schieb(p)."); KARTON }
        _ => KARTON,
    }
}

pub fn globaler_wert(id: u32) -> Option<W> {
    static mut CACHE: Vec<(u32, W)> = Vec::new();
    unsafe {
        for &(n, w) in CACHE.iter() { if n == id { return Some(w); } }
        let w = match id {
            N_G_BOTE | N_G_BESTELLANNAHME | N_G_UHR | N_G_MATHE | N_G_ZUFALL | N_G_SPIEGEL | N_G_ZETTEL => neu_w(Ref { art: A_MODUL, id }),
            N_TEIG | N_BESTELLE | N_ZWISCHENSTAND | N_SCHIEB => neu_w(Nativ { art: A_NATIV, was: id, empf: KARTON, name: id, modul: 0 }),
            _ => return None,
        };
        CACHE.push((id, w));
        Some(w)
    }
}

/// globalerName(name): Module/eingebaute Funktionen, Klassen (auch die eingebauten Ananas), sonst „ist nicht definiert“
/// (K-105: großgeschriebene Namen sind gewöhnliche Namen – keine Beläge, keine UnbekannterBelagAnanas mehr).
#[no_mangle]
pub extern "C" fn rt_global_name(name: u32) -> W {
    let id = name_id(ptr_w(name));
    global_name(id)
}
pub fn global_name(id: u32) -> W {
    // K-125: eine eigene Klasse Zettel hat Vorrang vor dem eingebauten Zettel (K-116)
    if id == N_G_ZETTEL { if let Some(w) = klasse_wert(id) { return w; } }
    if let Some(w) = globaler_wert(id) { return w; }
    if let Some(w) = klasse_wert(id) { return w; }
    // Kiste (SPEC §11.2, K-146): eingebautes Modul – eine eigene Klasse `Kiste` hat Vorrang
    if let Some(w) = crate::kiste::modul_wert(id) { return w; }
    // Herd (SPEC §18): statisch Herd.farbe, Form.wuerfel, Bildchen.laden … (eine eigene Klasse gleichen Namens hat Vorrang)
    if let Some(w) = crate::herd::modul_wert(id) { return w; }
    let mut t = Tb::neu();
    t.s("'").name(id).s("' ist nicht definiert.");
    wirf_tb(K_LAUFZEIT, &t);
    KARTON
}

fn mathe_extrem(pos: &[W], max: bool, wo: &str) -> W {
    if pos.is_empty() { wirf_ananas(K_RECHEN, if max { "max() ohne Zahlen?" } else { "min() ohne Zahlen?" }); return KARTON; }
    let mut xs = Vec::with_capacity(pos.len());
    for &p in pos { match zahl_pruefen(p, wo) { Some(x) => xs.push(x), None => return KARTON } }
    let mut r = if max { f64::NEG_INFINITY } else { f64::INFINITY };
    for &x in xs.iter() {
        if x != x { return zahl(x); }
        if max {
            if x > r || (x == 0.0 && r == 0.0 && r.is_sign_negative() && !x.is_sign_negative()) { r = x; }
        } else if x < r || (x == 0.0 && r == 0.0 && !r.is_sign_negative() && x.is_sign_negative()) { r = x; }
    }
    zahl(r)
}

fn bote_text(pos: &[W]) -> Option<Vec<u8>> {
    let mut t = Tb::neu();
    for (i, &x) in pos.iter().enumerate() {
        if i > 0 { t.s(" "); }
        text_in(x, &mut t);
        if sig() { return None; }
    }
    Some(t.0)
}

pub fn modul_methode(m: u32, name: u32, pos: &[W], ben: &Ben, knoten: i32) -> W {
    // Küchenbrigade S4: Bestellannahme nur in der Hauptküche (auch hatMehr)
    if m == N_G_BESTELLANNAHME && modul_hat(m, name) && crate::kueche::nur_hauptkueche(crate::kueche::T_EINGABE) { return KARTON; }
    match (m, name) {
        (N_G_BOTE, N_SAGE) => { if let Some(b) = bote_text(pos) { crate::host_ausgabe(&b); } KARTON }
        (N_G_BOTE, N_SCHREIBE) => { if let Some(b) = bote_text(pos) { crate::host_schreibe(&b); } KARTON }
        (N_G_BOTE, N_FEHLER) => { if let Some(b) = bote_text(pos) { crate::host_fehlerausgabe(&b); } KARTON }
        (N_G_BOTE, N_LEEREN) => { crate::host_leeren(); KARTON }
        (N_G_BESTELLANNAHME, N_LIES) => crate::pf::lies_zeile(None, 0),
        (N_G_BESTELLANNAHME, N_FRAGE) => { let t = arg(pos, ben, 0, N_TEXT); let p = if t == UNDEF { neu_str("") } else { text(t) }; if sig() { return KARTON; } crate::pf::lies_zeile(Some(p), 0) }
        (N_G_BESTELLANNAHME, N_LIESZAHL) => { let z = crate::pf::lies_zeile(None, 1); crate::pf::eingabe_zahl(z, arg(pos, ben, 0, N_ERSATZ)) }
        (N_G_BESTELLANNAHME, N_FRAGEZAHL) => { let t = arg(pos, ben, 0, N_TEXT); let p = if t == UNDEF { neu_str("") } else { text(t) }; if sig() { return KARTON; } let z = crate::pf::lies_zeile(Some(p), 1); crate::pf::eingabe_zahl(z, arg(pos, ben, 1, N_ERSATZ)) }
        (N_G_BESTELLANNAHME, N_HATMEHR) => bool_w(crate::pf::hat_mehr()),
        (N_G_UHR, N_JETZT) => dauer(z().schritte + z().offset),
        (N_G_UHR, N_ECHT) => dauer(crate::host_echtzeit()),
        (N_G_UHR, N_ZONE) => dauer(crate::host_zone()),   // K-154
        (N_G_UHR, N_VORSPULEN) => {
            let ms = match dauer_ms_pruefen(a(pos, 0), "Uhr.vorspulen") { Some(x) => js_round(x), None => return KARTON };
            if ms < 0.0 { wirf_ananas(K_RECHEN, "Die Uhr lässt sich nicht zurückdrehen."); return KARTON; }
            z().offset += ms;
            crate::pf::neu_grenze();
            if z().schritte > z().grenze { crate::pf::grenze_erreicht(); }
            KARTON
        }
        (N_G_MATHE, N_WURZEL) => match zahl_pruefen(a(pos, 0), "wurzel") { Some(x) => zahl(sqrt(x)), None => KARTON },
        // K-111: wie Math.log/log10/log2/exp (bitgleich, zahl.rs)
        (N_G_MATHE, N_LOG) => match zahl_pruefen(a(pos, 0), "log") { Some(x) => zahl(log(x)), None => KARTON },
        (N_G_MATHE, N_LOG10) => match zahl_pruefen(a(pos, 0), "log10") { Some(x) => zahl(log10(x)), None => KARTON },
        (N_G_MATHE, N_LOG2) => match zahl_pruefen(a(pos, 0), "log2") { Some(x) => zahl(log2(x)), None => KARTON },
        (N_G_MATHE, N_EXP) => match zahl_pruefen(a(pos, 0), "exp") { Some(x) => zahl(exp(x)), None => KARTON },
        // K-137: Winkelfunktionen (fdlibm, bitgleich zum Interpreter) und Grad/Bogenmaß
        (N_G_MATHE, N_SIN) => match zahl_pruefen(a(pos, 0), "sin") { Some(x) => zahl(sin(x)), None => KARTON },
        (N_G_MATHE, N_COS) => match zahl_pruefen(a(pos, 0), "cos") { Some(x) => zahl(cos(x)), None => KARTON },
        (N_G_MATHE, N_TAN) => match zahl_pruefen(a(pos, 0), "tan") { Some(x) => zahl(tan(x)), None => KARTON },
        (N_G_MATHE, N_ASIN) => match zahl_pruefen(a(pos, 0), "asin") { Some(x) => zahl(asin(x)), None => KARTON },
        (N_G_MATHE, N_ACOS) => match zahl_pruefen(a(pos, 0), "acos") { Some(x) => zahl(acos(x)), None => KARTON },
        (N_G_MATHE, N_ATAN) => match zahl_pruefen(a(pos, 0), "atan") { Some(x) => zahl(atan(x)), None => KARTON },
        (N_G_MATHE, N_ATAN2) => {
            let y = match zahl_pruefen(a(pos, 0), "atan2") { Some(x) => x, None => return KARTON };
            let x = match zahl_pruefen(a(pos, 1), "atan2") { Some(x) => x, None => return KARTON };
            zahl(atan2(y, x))
        }
        (N_G_MATHE, N_BOGEN) => match zahl_pruefen(a(pos, 0), "bogen") { Some(x) => zahl(bogen(x)), None => KARTON },
        (N_G_MATHE, N_GRAD) => match zahl_pruefen(a(pos, 0), "grad") { Some(x) => zahl(grad(x)), None => KARTON },
        (N_G_MATHE, N_MAX) => mathe_extrem(pos, true, "max"),
        (N_G_MATHE, N_MIN) => mathe_extrem(pos, false, "min"),
        (N_G_MATHE, N_ABS) => match zahl_pruefen(a(pos, 0), "abs") { Some(x) => zahl(x.abs()), None => KARTON },
        (N_G_MATHE, N_RUNDEN) => {
            let x = match zahl_pruefen(a(pos, 0), "runden") { Some(x) => x, None => return KARTON };
            let n = if pos.len() > 1 { match ganz_pruefen(pos[1], "runden") { Some(n) => n, None => return KARTON } } else { 0.0 };
            zahl(runde_auf(x, n))
        }
        (N_G_MATHE, N_BODEN) => match zahl_pruefen(a(pos, 0), "boden") { Some(x) => zahl(floor(x)), None => KARTON },
        (N_G_MATHE, N_DECKE) => match zahl_pruefen(a(pos, 0), "decke") { Some(x) => zahl(ceil(x)), None => KARTON },
        (N_G_MATHE, N_POTENZ) => {
            let x = match zahl_pruefen(a(pos, 0), "potenz") { Some(x) => x, None => return KARTON };
            let y = match zahl_pruefen(a(pos, 1), "potenz") { Some(x) => x, None => return KARTON };
            zahl(js_pow(x, y))
        }
        (N_G_ZUFALL, _) if crate::vorrat::hat_methode(name) => crate::vorrat::modul_methode(name, pos),
        (N_G_ZETTEL, N_AUS) => crate::theke::zettel_aus(pos, knoten),
        (N_G_SPIEGEL, N_FELDER) => {
            let o = a(pos, 0);
            if o == KARTON || o == UNDEF { wirf_leer(); return KARTON; }
            if art(o) != A_OBJ {
                let mut t = Tb::neu(); t.s("Spiegel.felder braucht ein Objekt, nicht "); darstellung(o, &mut t); t.s(".");
                wirf_tb(K_TYP, &t); return KARTON;
            }
            if obj::<Obj>(o).zugeklappt != 0 { wirf_ananas(K_ZUGEKLAPPT, "Die Calzone ist zu. Nutze aufklappen()."); return KARTON; }
            let r = crate::karte::neu_karte();
            for fe in obj::<Obj>(o).felder.iter() { crate::karte::lege(crate::karte::karte(r), name_text(finfo(fe.info).name), if fe.w == WEG { KARTON } else { fe.w }); }
            r
        }
        _ if crate::kiste::ist_modul(m) && crate::kiste::modul_hat(m, name) => crate::kiste::modul_methode(name, pos, ben),
        _ if crate::herd::ist_modul(m) && crate::herd::modul_hat(m, name) => crate::herd::modul_methode(m, name, pos, ben),
        _ => {
            let _ = knoten;
            let mut t = Tb::neu();
            t.s("Methode '").name(name).s("' gibt es bei ").name(m).s(" nicht.");
            wirf_tb(K_LAUFZEIT, &t);
            KARTON
        }
    }
}

/// Math.pow (JS-Sonderfälle)
pub fn js_pow(x: f64, y: f64) -> f64 {
    if y != y { return f64::NAN; }
    if y == 0.0 { return 1.0; }
    if (x == 1.0 || x == -1.0) && y.is_infinite() { return f64::NAN; }
    libm::pow(x, y)
}

/// Methoden der Tabellen-Typen (und Module)
pub fn tabellen_methode(o: W, id: u32, pos: &[W], ben: &Ben, knoten: i32, _sc: bool) -> W {
    if ist_zahl(o) {
        let x = f(o);
        return match id {
            // K-127: Geldformat mit frei wählbarem Symbol (vormals euro())
            N_WAEHRUNG => {
                let sym = arg(pos, ben, 0, N_SYMBOL);
                let k = arg(pos, ben, 1, N_KOMPAKT);
                let mut kompakt = false;
                if k != UNDEF && k != KARTON { kompakt = bool_pruefen(k); if sig() { return KARTON; } }
                let mut v = Vec::new();
                if kompakt { kompakt_text(x, 2, &mut v); } else { betrag_text(x, &mut v); }
                if sym != UNDEF && sym != KARTON {
                    let mut st = Tb::neu();
                    text_in(sym, &mut st);
                    if sig() { return KARTON; }
                    let st = st.fertig();
                    if !bytes(st).is_empty() { v.push(b' '); v.extend_from_slice(bytes(st)); }
                }
                neu_text(&v)
            }
            N_TAUSENDER | N_KOMPAKT => {
                let wo = if id == N_TAUSENDER { "tausender" } else { "kompakt" };
                let n = arg(pos, ben, 0, N_STELLEN);
                let n = if n == UNDEF || n == KARTON { if id == N_TAUSENDER { 0.0 } else { 2.0 } } else {
                    let k = match ganz_pruefen(n, wo) { Some(k) => k, None => return KARTON };
                    if k < 0.0 || k > 20.0 {
                        let mut t = Tb::neu(); t.s(wo).s(": Nachkommastellen müssen zwischen 0 und 20 liegen, nicht ").n(k).s(".");
                        wirf_tb(K_RECHEN, &t); return KARTON;
                    }
                    k
                };
                let mut b = Vec::new();
                if id == N_TAUSENDER { tausender_text(x, n as u32, &mut b); } else { kompakt_text(x, n as u32, &mut b); }
                neu_text(&b)
            }
            N_RUNDEN => {
                let n = arg(pos, ben, 0, N_STELLEN);
                let n = if n == UNDEF { 0.0 } else { match ganz_pruefen(n, "runden") { Some(n) => n, None => return KARTON } };
                zahl(runde_auf(x, n))
            }
            N_ABS => zahl(x.abs()),
            N_ALSTEXT => text(o),
            N_GANZ => { let r = trunc(x); zahl(if r == 0.0 { 0.0 } else { r }) }
            _ => nicht_gefunden(o, id),
        };
    }
    if ist_bool(o) {
        return if id == N_ALSTEXT { text(o) } else { nicht_gefunden(o, id) };
    }
    match art(o) {
        A_TEXT => text_methode(o, id, pos, knoten),
        A_DAUER => {
            let ms = dauer_ms(o);
            match id {
                N_INMS => zahl(ms),
                N_INSEKUNDEN => zahl(ms / 1000.0),
                N_INMINUTEN => zahl(ms / 60000.0),
                N_ALSTEXT => text(o),
                _ => nicht_gefunden(o, id),
            }
        }
        A_BLECH => blech_methode(o, id, pos, ben, knoten),
        A_KARTE => karte_methode(o, id, pos, ben),
        A_ENUMW => match id {
            N_NAME | N_ALSTEXT => obj::<EnumW>(o).name,
            N_POSITION => zahl(obj::<EnumW>(o).pos),
            _ => nicht_gefunden(o, id),
        },
        A_MODUL => modul_methode(obj::<Ref>(o).id, id, pos, ben, knoten),
        A_TEIG | A_LIEF | A_ZUST | A_RESTE | A_ROH => crate::pf::pf_methode(o, id, pos, ben, knoten),
        crate::theke::A_THEKE | crate::theke::A_ZUTAT | crate::theke::A_ZETTEL => crate::theke::methode(o, id, pos, ben, knoten),
        crate::herd::A_HERD..=crate::herd::A_BILDCHEN => crate::herd::methode(o, id, pos, ben, knoten),
        crate::vorrat::A_ZUFALL => crate::vorrat::objekt_methode(o, id, pos),
        crate::vorrat::A_KAMMER => crate::vorrat::kammer_methode(o, id, pos, ben),
        A_FUNKTION | A_GEBUNDEN | A_NATIV => match id {
            N_MIKROWELLE | N_FRISCH => {
                let modus = if id == N_MIKROWELLE { 1 } else { 2 };
                if art(o) == A_GEBUNDEN {
                    let g = obj::<Gebunden>(o);
                    let l = gebunden_liste(g);
                    return rufe_decl(waehle(l, anzahl(pos, ben)), g.obj, pos, ben, knoten, modus);
                }
                let r = rufe(o, pos, ben, knoten);
                if modus == 1 { if sig() { return KARTON; } neu_w(Reste { art: A_RESTE, matschig: 0, wert: r }) } else { r }
            }
            N_RUFE => rufe(o, pos, ben, knoten),
            N_ALSTEXT => neu_str("<Funktion>"),
            _ => nicht_gefunden(o, id),
        },
        _ => nicht_gefunden(o, id),
    }
}

fn text_methode(o: W, id: u32, pos: &[W], _knoten: i32) -> W {
    let st = s(o);
    match id {
        N_LAENGE => zahl(zeichen_anzahl(bytes(o)) as f64),
        N_GROSS => js_upper(st),
        N_KLEIN => js_lower(st),
        N_ENTHAELT => { let t = text(a(pos, 0)); if sig() { return KARTON; } bool_w(st.contains(s(t))) }
        N_ZERLEGE => {
            let t = if pos.is_empty() { neu_str("") } else { text(pos[0]) };
            if sig() { return KARTON; }
            blech(split(st, s(t)))
        }
        N_ERSETZE => {
            let x = text(a(pos, 0)); if sig() { return KARTON; }
            let y = text(a(pos, 1)); if sig() { return KARTON; }
            if bytes(x).is_empty() { return o; } // K-076: leerer Suchtext ersetzt nichts
            let teile = split(st, s(x));
            let mut t = Tb::neu();
            for (i, &w) in teile.iter().enumerate() { if i > 0 { t.t(y); } t.t(w); }
            t.fertig()
        }
        N_TRIMME => neu_str(js_trim(st)),
        N_ZEICHEN => {
            let n = zeichen_anzahl(bytes(o));
            let i = a(pos, 0);
            if !(ist_zahl(i) && ist_ganz(f(i)) && f(i) >= 1.0 && f(i) <= n as f64) {
                let mut t = Tb::neu();
                t.s("Zeichen ");
                text_in(i, &mut t);
                if sig() { return KARTON; }
                t.s(" gibt es nicht – der Text hat ").n(n as f64).s(" Zeichen.");
                wirf_tb(K_KEINSTUECK, &t);
                return KARTON;
            }
            let c = st.chars().nth(f(i) as usize - 1).unwrap();
            let mut b = [0u8; 4];
            neu_str(c.encode_utf8(&mut b))
        }
        N_WIEDERHOLE => {
            let n = match ganz_pruefen(a(pos, 0), "wiederhole") { Some(n) => n, None => return KARTON };
            if n < 0.0 { wirf_ananas(K_RECHEN, "Negativ oft wiederholen? Das geht nicht."); return KARTON; }
            let b = bytes(o);
            if (b.len() as f64) * n > 512.0 * 1024.0 * 1024.0 { wirf_ananas(K_LAUFZEIT, "Der Kühlschrank ist voll (Speicherlimit erreicht)."); return KARTON; }
            let mut v = Vec::with_capacity(b.len() * n as usize);
            for _ in 0..(n as usize) { v.extend_from_slice(b); }
            neu_text(&v)
        }
        N_BEGINNTMIT => { let t = text(a(pos, 0)); if sig() { return KARTON; } bool_w(st.starts_with(s(t))) }
        N_ENDETMIT => { let t = text(a(pos, 0)); if sig() { return KARTON; } bool_w(st.ends_with(s(t))) }
        N_ALSZAHL => match zahl_aus_text(st) {
            Some(v) => zahl(v),
            None => { let mut m = Tb::neu(); m.s("\"").t(o).s("\" ist keine Zahl."); wirf_tb(K_TYP, &m); KARTON }
        },
        N_ALSTEXT => o,
        N_ISTLEER => bool_w(bytes(o).is_empty()),
        _ => nicht_gefunden(o, id),
    }
}

fn karte_methode(o: W, id: u32, pos: &[W], ben: &Ben) -> W {
    use crate::karte as ka;
    if matches!(id, N_LEGE | N_ENTFERNE) && crate::kueche::wache(o, crate::kueche::T_KARTE) { return KARTON; }
    let m = ka::karte(o);
    match id {
        N_LEGE => { let k = schluessel(a(pos, 0)); ka::lege(m, k, if pos.len() > 1 { pos[1] } else { KARTON }); o }
        // K-095: hole(k[, ersatz]) – Ersatzwert (positional oder benannt) nur, wenn der Schlüssel fehlt.
        N_HOLE => { let k = schluessel(a(pos, 0)); match ka::finde(m, k) { Some(i) => m.v[i], None => nn(arg(pos, ben, 1, N_ERSATZ)) } }
        N_HAT => { let k = schluessel(a(pos, 0)); bool_w(ka::finde(m, k).is_some()) }
        N_ENTFERNE => { let k = schluessel(a(pos, 0)); ka::entferne(m, k) }
        N_SCHLUESSEL => blech(ka::schluessel(m)),
        N_WERTE => blech(ka::werte(m)),
        N_LAENGE => zahl(ka::laenge(m) as f64),
        N_ISTLEER => bool_w(ka::laenge(m) == 0),
        N_ALSTEXT => text(o),
        _ => nicht_gefunden(o, id),
    }
}

fn blech_methode(o: W, id: u32, pos: &[W], ben: &Ben, knoten: i32) -> W {
    // Küchenbrigade S3: Blech der Hauptküche nur lesen (Wache vor der Indexprüfung, K-101/4)
    if matches!(id, N_HINZU | N_ENTFERNE | N_SETZE) && crate::kueche::wache(o, crate::kueche::T_BLECH) { return KARTON; }
    let b = blech_v(o);
    match id {
        N_LAENGE => zahl(b.len() as f64),
        N_STUECK => match index_pruefen(b.len(), a(pos, 0)) { Some(i) => b[i - 1], None => KARTON },
        N_HINZU => { b.push(if pos.is_empty() { KARTON } else { pos[0] }); o }
        N_ENTFERNE => match index_pruefen(b.len(), a(pos, 0)) { Some(i) => b.remove(i - 1), None => KARTON },
        N_SETZE => match index_pruefen(b.len(), a(pos, 0)) { Some(i) => { b[i - 1] = if pos.len() > 1 { pos[1] } else { KARTON }; o } None => KARTON },
        N_ENTHAELT => { let x = a(pos, 0); bool_w(b.iter().any(|&y| gleich(y, x))) }
        N_BELEGE => {
            let f = a(pos, 0);
            let n0 = b.len();
            let mut r = Vec::with_capacity(n0);
            let mut i = 0;
            while i < blech_v(o).len() {
                let x = blech_v(o)[i];
                match rufe1(f, &[x], knoten) { Some(v) => r.push(v), None => return KARTON }
                i += 1;
            }
            while r.len() < n0 { r.push(KARTON); }
            blech(r)
        }
        N_BRIGADE => crate::kueche::brigade(o, a(pos, 0), knoten),
        N_FILTERE => {
            let f = a(pos, 0);
            let mut r = Vec::new();
            let mut i = 0;
            while i < blech_v(o).len() {
                let x = blech_v(o)[i];
                let v = match rufe1(f, &[x], knoten) { Some(v) => v, None => return KARTON };
                let ok = bool_pruefen(v);
                if sig() { return KARTON; }
                if ok { r.push(x); }
                i += 1;
            }
            blech(r)
        }
        N_ZUSAMMENKLAPPEN => {
            let f = a(pos, 0);
            let start = arg(pos, ben, 1, N_START);
            let mut i = 0;
            let mut acc;
            if start != UNDEF { acc = start; } else { if b.is_empty() { return KARTON; } acc = b[0]; i = 1; }
            while i < blech_v(o).len() {
                let x = blech_v(o)[i];
                acc = match rufe1(f, &[acc, x], knoten) { Some(v) => v, None => return KARTON };
                i += 1;
            }
            acc
        }
        N_SUMME => {
            if !b.is_empty() && art(b[0]) == A_DAUER {
                let mut s = 0.0;
                for &x in b.iter() { s += if art(x) == A_DAUER { dauer_ms(x) } else { f64::NAN }; }
                return dauer(s);
            }
            let mut s = 0.0;
            for &x in b.iter() {
                if !ist_zahl(x) {
                    let mut t = Tb::neu(); t.s("summe() geht nur mit Zahlen, aber im Blech liegt "); darstellung(x, &mut t); t.s(".");
                    wirf_tb(K_TYP, &t); return KARTON;
                }
                s += f(x);
            }
            zahl(s)
        }
        N_ERSTES => { if b.is_empty() { wirf_ananas(K_KEINSTUECK, "Das Blech ist leer – kein Stück da."); return KARTON; } b[0] }
        N_LETZTES => { if b.is_empty() { wirf_ananas(K_KEINSTUECK, "Das Blech ist leer – kein Stück da."); return KARTON; } b[b.len() - 1] }
        N_UMDREHEN => { let mut r = b.clone(); r.reverse(); blech(r) }
        N_SORTIERE => {
            let f = a(pos, 0);
            let mut r = b.clone();
            if f != UNDEF && f != KARTON {
                crate::sort::sortiere(&mut r, &mut |x, y| {
                    let v = rufe1(f, &[x, y], knoten)?;
                    if !ist_zahl(v) { wirf_ananas(K_TYP, "Die Sortierfunktion muss eine Zahl liefern."); return None; }
                    Some(crate::wert::f(v))
                });
            } else {
                crate::sort::sortiere(&mut r, &mut |x, y| vergleiche(x, y));
            }
            if sig() { return KARTON; }
            blech(r)
        }
        N_VERBINDE => {
            let t = if pos.is_empty() { neu_str("") } else { text(pos[0]) };
            if sig() { return KARTON; }
            let mut tb = Tb::neu();
            let mut i = 0;
            while i < blech_v(o).len() {
                if i > 0 { tb.t(t); }
                let x = blech_v(o)[i];
                text_in(x, &mut tb);
                if sig() { return KARTON; }
                i += 1;
            }
            tb.fertig()
        }
        N_ISTLEER => bool_w(b.is_empty()),
        N_SCHNEIDE => {
            // K-127: n ist Pflicht (kein `auto`, kein Standard 8), keine Warnung bei 7
            let n = a(pos, 0);
            let n = if n == UNDEF { KARTON } else { n };
            let k = match ganz_pruefen(n, "schneide") { Some(k) => k, None => return KARTON };
            if k < 1.0 { let mut t = Tb::neu(); t.s("In ").n(k).s(" Stücke schneiden? Das geht nicht."); wirf_tb(K_STREIT, &t); return KARTON; }
            schneide(o, k as usize)
        }
        N_KOPIE => blech(b.clone()),
        N_ALSTEXT => text(o),
        _ => nicht_gefunden(o, id),
    }
}
