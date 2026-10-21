//! Pizzen & Beläge, Schritte/Budgets, Ofen, Teig, Lieferung, Kühlschrank, Eingabe, Zufall.

use crate::klassen::*;
use crate::namen::*;
use crate::ops::*;
use crate::std_m::{a, arg};
use crate::text::*;
use crate::wert::*;
use crate::{sig, z};
use alloc::vec::Vec;

// ---------------------------------------------------------------- Beläge
pub static mut BELAEGE: Vec<(u32, W)> = Vec::new();
pub const TABELLE: [(u32, f64, &[u32]); 24] = [
    (N_G_TOMATE, 1.00, &[]), (N_G_MOZZARELLA, 1.50, &[N_G_TOMATE]), (N_G_KAESE, 1.00, &[N_G_TOMATE]),
    (N_G_BASILIKUM, 0.50, &[N_G_MOZZARELLA]), (N_G_SALAMI, 1.50, &[]), (N_G_SCHINKEN, 1.50, &[]), (N_G_PILZE, 1.00, &[]),
    (N_G_OLIVEN, 1.00, &[]), (N_G_ZWIEBELN, 0.50, &[]), (N_G_PAPRIKA, 0.80, &[]), (N_G_CHILI, 0.50, &[]),
    (N_G_PEPERONI, 0.80, &[]), (N_G_RUCOLA, 1.00, &[N_G_MOZZARELLA]), (N_G_PARMESAN, 1.20, &[N_G_TOMATE]),
    (N_G_GORGONZOLA, 1.50, &[N_G_TOMATE]), (N_G_THUNFISCH, 2.00, &[]), (N_G_SARDELLEN, 1.80, &[]),
    (N_G_ARTISCHOCKEN, 1.50, &[]), (N_G_SPINAT, 1.00, &[]), (N_G_EI, 0.80, &[]), (N_G_MAIS, 0.50, &[]),
    (N_G_KNOBLAUCH, 0.30, &[]), (N_G_KAPERN, 0.70, &[]), (N_G_ANANAS, f64::NAN, &[]),
];

pub fn belaege_init() {
    unsafe {
        if !BELAEGE.is_empty() { return; }
        for &(n, p, nach) in TABELLE.iter() {
            let b = neu_w(Belag { art: A_BELAG, id: n, name: name_text(n), preis: if p != p { 0.0 } else { p }, nach: nach.to_vec(), methoden: Vec::new() });
            BELAEGE.push((n, b));
        }
    }
}
pub fn belag_nach_name(id: u32) -> Option<W> {
    unsafe { for &(n, b) in BELAEGE.iter().rev() { if n == id { return Some(b); } } }
    None
}
pub fn tabellen_preis(id: u32) -> Option<f64> {
    for &(n, p, _) in TABELLE.iter() { if n == id { return if p != p { None } else { Some(p) }; } }
    None
}
pub fn standard_preis(b: W) -> f64 {
    let be = obj::<Belag>(b);
    if let Some(p) = tabellen_preis(be.id) { return p; }
    be.preis
}

/// neuePizza(s)
pub fn neue_pizza(s: Vec<W>) -> W {
    for &x in s.iter() { if obj::<Belag>(x).id == N_G_ANANAS { wirf_panik(); return KARTON; } }
    for i in 0..s.len() {
        let x = obj::<Belag>(s[i]);
        if x.nach.is_empty() { continue; }
        for j in i + 1..s.len() {
            let y = obj::<Belag>(s[j]);
            if x.nach.contains(&y.id) {
                let mut t = Tb::neu();
                t.s("'").t(x.name).s("' liegt unter '").t(y.name).s("'. Das ist keine Pizza, das ist ein Auflauf.");
                wirf_pf("B0012", t.fertig(), z().pos);
                return KARTON;
            }
        }
    }
    neu_w(Pizza { art: A_PIZZA, uebrig: 8, s })
}

/// Pizza-Literal: Belagnamen (Text-Zeiger) im Speicher
#[no_mangle]
pub extern "C" fn rt_pizza(namen: u32, n: u32) -> W {
    let mut s = Vec::with_capacity(n as usize);
    for i in 0..n {
        let id = name_id(ptr_w(unsafe { *((namen + i * 4) as *const u32) }));
        match belag_nach_name(id) {
            Some(b) => s.push(b),
            None => {
                let mut t = Tb::neu();
                t.s("'").name(id).s("' steht nicht auf der Zutatenliste.");
                wirf_tb(K_UNBEKANNTERBELAG, &t);
                return KARTON;
            }
        }
    }
    let r = neue_pizza(s);
    crate::speicher_pruefen();
    r
}

pub fn belag_methode(b: W, name: u32) -> Option<u32> {
    for &(n, m) in obj::<Belag>(b).methoden.iter() { if n == name { return Some(m); } }
    None
}

pub fn pizza_hat_methode(pz: W, name: u32) -> bool {
    if name == N_PREIS || matches!(name, N_BELAEGE | N_HAT | N_ANZAHLBELAEGE | N_ALSTEXT | N_UEBRIG | N_BESCHREIBUNG) { return true; }
    obj::<Pizza>(pz).s.iter().any(|&b| belag_methode(b, name).is_some())
}

fn belag_aufruf(m: u32, pz: W, k: usize, pos: &[W], ben: &Ben) -> W {
    let sicht = neu_w(Sicht { art: A_SICHT, k: k as u32, pizza: pz });
    fuehre_aus(m, pz, sicht, pos, ben)
}

pub fn preis_bis(pz: W, k: usize) -> W {
    if k == 0 { return zahl(5.0); }
    let b = obj::<Pizza>(pz).s[k - 1];
    if let Some(m) = belag_methode(b, N_PREIS) { return belag_aufruf(m, pz, k - 1, &[], &[]); }
    let unten = preis_bis(pz, k - 1);
    if sig() { return KARTON; }
    // runde2(preisBis + standardPreis) – mit JS-`+` (auch wenn unten kein Zahlwert ist)
    let summe = binaer(OP_PLUS, unten, zahl(standard_preis(b)), 0);
    if sig() { return KARTON; }
    if ist_zahl(summe) { zahl(crate::zahl::runde2(f(summe))) } else { zahl(f64::NAN) }
}

/// pizzaAufruf(p, k, name, …)
pub fn pizza_aufruf(pz: W, k: usize, name: u32, pos: &[W], ben: &Ben, _knoten: i32) -> W {
    if name == N_PREIS { return preis_bis(pz, k); }
    let s = &obj::<Pizza>(pz).s;
    let mut i = k;
    while i >= 1 {
        if let Some(m) = belag_methode(s[i - 1], name) { return belag_aufruf(m, pz, i - 1, pos, ben); }
        i -= 1;
    }
    match name {
        N_BELAEGE => blech(s[..k].iter().map(|&b| obj::<Belag>(b).name).collect()),
        N_HAT => {
            let x = a(pos, 0);
            let n = if art(x) == A_BELAG { obj::<Belag>(x).name } else { let t = text(x); if sig() { return KARTON; } t };
            bool_w(s[..k].iter().any(|&b| bytes(obj::<Belag>(b).name) == bytes(n)))
        }
        N_ANZAHLBELAEGE => zahl(k as f64),
        N_ALSTEXT => { let mut t = Tb::neu(); pizza_text(s, k, &mut t); t.fertig() }
        N_UEBRIG => zahl(obj::<Pizza>(pz).uebrig as f64),
        N_BESCHREIBUNG => neu_str("Teig"),
        _ => {
            let mut t = Tb::neu();
            t.s("Methode '").name(name).s("' gibt es auf Pizza nicht.");
            wirf_tb(K_LAUFZEIT, &t);
            KARTON
        }
    }
}

// ---------------------------------------------------------------- Schritte & Budgets
pub struct Frame { pub id: u32, pub ofen: bool, pub ende: f64, pub zwischen: W, pub tot: bool }
pub static mut FRAMES: Vec<Frame> = Vec::new();
static mut FRAME_NR: u32 = 0;

pub fn neu_grenze() {
    let mut g = z().limit;
    unsafe {
        for fr in FRAMES.iter() { if !fr.tot { let x = fr.ende - z().offset; if x < g { g = x; } } }
    }
    z().grenze = g;
}

pub fn grenze_erreicht() {
    if z().schritte > z().limit { setze_sig(SIG_LIMIT); return; }
    let uhr = z().schritte + z().offset;
    unsafe {
        for i in 0..FRAMES.len() {
            if !FRAMES[i].tot && uhr > FRAMES[i].ende {
                for j in i..FRAMES.len() { FRAMES[j].tot = true; }
                neu_grenze();
                BUDGET_FRAME = FRAMES[i].id;
                setze_sig(SIG_BUDGET);
                return;
            }
        }
    }
    neu_grenze();
}

/// Langsamer Pfad der Schrittprüfung: das Programm hat `schritte += k` gerechnet und `schritte > grenze` gesehen.
/// flags & 1: das Bündel beginnt mit einer Anweisung (deren Position `pos_neu` erst nach dem ersten Schritt gilt).
#[no_mangle]
pub extern "C" fn rt_grenze(k: i32, flags: i32, pos_neu: i32) {
    let zz = z();
    let s0 = zz.schritte - k as f64;
    let g = crate::zahl::floor(zz.grenze);
    let mut s = g + 1.0;
    if s < s0 + 1.0 { s = s0 + 1.0; }
    if s > zz.schritte { s = zz.schritte; }
    if flags & 1 != 0 && s > s0 + 1.0 { zz.pos = pos_neu; }
    zz.schritte = s;
    grenze_erreicht();
    // nicht überschritten (veraltete Grenze): restliche Schritte nachtragen
    if zz.sig == 0 {
        let rest = (s0 + k as f64) - s;
        if rest > 0.0 {
            zz.schritte = s0 + k as f64;
            if zz.schritte > zz.grenze { rt_grenze(rest as i32, 0, pos_neu); }
        }
        if flags & 1 != 0 && zz.sig == 0 { zz.pos = pos_neu; }
    }
}

pub fn push_frame(ofen: bool, budget: f64) -> u32 {
    unsafe {
        FRAME_NR += 1;
        let id = FRAME_NR;
        FRAMES.push(Frame { id, ofen, ende: z().schritte + z().offset + budget, zwischen: KARTON, tot: false });
        neu_grenze();
        id
    }
}
pub fn pop_frame(id: u32) {
    unsafe {
        if let Some(i) = FRAMES.iter().rposition(|f| f.id == id) { FRAMES.remove(i); }
    }
    neu_grenze();
}
fn frame(id: u32) -> Option<&'static mut Frame> { unsafe { FRAMES.iter_mut().find(|f| f.id == id) } }

pub fn zwischenstand(w: W) {
    unsafe { for fr in FRAMES.iter_mut().rev() { if fr.ofen { fr.zwischen = w; break; } } }
}

// ---------------------------------------------------------------- Ofen
struct OfenRec { temp: f64, zeit_ms: f64, start_uhr: f64, z0: i32, frame: u32, budget: f64 }
static mut OEFEN: Vec<OfenRec> = Vec::new();

/// Vor dem Ofen: Argumente prüfen (Würfe hier sind NICHT vom eigenen verbrannt fangbar). Liefert Ofen-ID.
#[no_mangle]
pub extern "C" fn rt_ofen_vor(temp: W, zeit: W) -> i32 {
    let temp = if temp == UNDEF || temp == KARTON { zahl(250.0) } else { temp };
    let zeit = if zeit == UNDEF || zeit == KARTON { dauer(60000.0) } else { zeit };
    let zeit_ms = match dauer_ms_pruefen(zeit, "ofen(zeit: …)") { Some(x) => x, None => return -1 };
    let t = match zahl_pruefen(temp, "ofen(temperatur: …)") { Some(x) => x, None => return -1 };
    unsafe {
        OEFEN.push(OfenRec { temp: t, zeit_ms, start_uhr: z().schritte + z().offset, z0: z().pos, frame: 0, budget: 0.0 });
        (OEFEN.len() - 1) as i32
    }
}
/// Im äußeren try: Temperatur prüfen, Frame anlegen
#[no_mangle]
pub extern "C" fn rt_ofen_an(id: i32) {
    let o = unsafe { &mut OEFEN[id as usize] };
    if o.temp > 485.0 { wirf_ananas(K_VERBRANNT, "Zu heiß! Selbst Neapel hat Grenzen."); return; }
    o.budget = crate::zahl::floor(o.zeit_ms * o.temp / 250.0);
    o.frame = push_frame(true, o.budget);
}
/// Nach dem Block (auch bei Signal). Rückgabe 1 = roh-Zweig ausführen.
#[no_mangle]
pub extern "C" fn rt_ofen_aus(id: i32, hat_roh: i32) -> i32 {
    let o = unsafe { &mut OEFEN[id as usize] };
    if o.frame == 0 { return 0; } // Temperatur-Ananas: kein Frame
    let mut r = 0;
    let fr_id = o.frame;
    unsafe {
        if crate::ZUSTAND.sig == SIG_BUDGET && BUDGET_FRAME == fr_id {
            z().pos = o.z0;
            crate::ZUSTAND.sig = 0;
            if hat_roh != 0 {
                let zw = frame(fr_id).map(|f| f.zwischen).unwrap_or(KARTON);
                let d = dauer(z().schritte + z().offset - o.start_uhr);
                OFEN_ROH = neu_w(Roh { art: A_ROH, _r: 0, teil: zw, zeit: d });
                r = 1;
            } else {
                let mut t = Tb::neu();
                t.s("Zu lange im Ofen: Budget von ").n(o.budget).s(" Schritten überschritten.");
                wirf_tb(K_VERBRANNT, &t);
            }
        }
    }
    pop_frame(fr_id);
    r
}
pub static mut OFEN_ROH: W = KARTON;
#[no_mangle]
pub extern "C" fn rt_ofen_roh() -> W { unsafe { OFEN_ROH } }
#[no_mangle]
pub extern "C" fn rt_ofen_ende(id: i32) { unsafe { OEFEN.truncate(id as usize); } }

// ---------------------------------------------------------------- Teig, Lieferung, Zustellung, …
pub static mut LIEFERUNGEN: Vec<W> = Vec::new();
static mut LIEFER_NR: u32 = 0;

pub fn bestelle(f: W) -> W {
    unsafe {
        LIEFER_NR += 1;
        let l = neu_w(Lief { art: A_LIEF, nr: LIEFER_NR, fnw: f, trinkgeld: 0.0, zust: KARTON, rueckruf: KARTON });
        LIEFERUNGEN.push(l);
        l
    }
}

fn zustellung(p: bool, w: W, fehler: W, fpos: i32) -> W {
    neu_w(Zust { art: A_ZUST, puenktlich: p as u32, wert: w, fehler, fzeile: 0, fpos })
}

fn liefere(l: W, budget: f64, knoten: i32) -> W {
    let fr = push_frame(false, budget);
    let fnw = obj::<Lief>(l).fnw;
    let v = rufe(fnw, &[], &[], knoten);
    let zs;
    unsafe {
        let s = crate::ZUSTAND.sig;
        if s == 0 { zs = zustellung(true, v, KARTON, 0); }
        else if s == SIG_BUDGET && BUDGET_FRAME == fr { crate::ZUSTAND.sig = 0; zs = zustellung(false, KARTON, KARTON, 0); }
        else if s == SIG_ANANAS { crate::ZUSTAND.sig = 0; zs = zustellung(true, KARTON, WURF_OBJ, WURF_POS); }
        else { pop_frame(fr); return KARTON; }
    }
    pop_frame(fr);
    obj::<Lief>(l).zust = zs;
    zs
}

pub fn lieferungen_nach_ende() {
    loop {
        if sig() { return; }
        let mut beste: Option<W> = None;
        unsafe {
            for &l in LIEFERUNGEN.iter() {
                let li = obj::<Lief>(l);
                if li.rueckruf == KARTON || li.zust != KARTON { continue; }
                match beste {
                    None => beste = Some(l),
                    Some(b) => {
                        let bi = obj::<Lief>(b);
                        if li.trinkgeld > bi.trinkgeld || (li.trinkgeld == bi.trinkgeld && li.nr < bi.nr) { beste = Some(l); }
                    }
                }
            }
        }
        let l = match beste { None => return, Some(l) => l };
        let v = rufe(obj::<Lief>(l).fnw, &[], &[], 0);
        if sig() { return; }
        obj::<Lief>(l).zust = zustellung(true, v, KARTON, 0);
        rufe(obj::<Lief>(l).rueckruf, &[v], &[], 0);
    }
}

fn wirf_zust_fehler(zs: &Zust) { wirf_obj(zs.fehler, zs.fpos); }

pub fn pf_methode(o: W, id: u32, pos: &[W], ben: &Ben, knoten: i32) -> W {
    match art(o) {
        A_TEIG => {
            let t = obj::<Teig>(o);
            match id {
                N_GEHENLASSEN => {
                    if t.fertig == 0 { let w = rufe(t.fnw, &[], &[], knoten); if sig() { return KARTON; } let t = obj::<Teig>(o); t.wert = w; t.fertig = 1; }
                    obj::<Teig>(o).auf = 1;
                    o
                }
                N_BACKEN => {
                    if t.auf == 0 { crate::start::warnung("T0007", "Teig wird gebacken, ohne gehen gelassen worden zu sein. Das schmeckt flach.", knoten); }
                    if obj::<Teig>(o).fertig == 0 { let w = rufe(obj::<Teig>(o).fnw, &[], &[], knoten); if sig() { return KARTON; } let t = obj::<Teig>(o); t.wert = w; t.fertig = 1; }
                    obj::<Teig>(o).wert
                }
                N_ISTAUFGEGANGEN => bool_w(t.auf != 0),
                N_ALSTEXT => text(o),
                _ => KARTON,
            }
        }
        A_LIEF => {
            let l = obj::<Lief>(o);
            match id {
                N_TRINKGELD => {
                    let n = a(pos, 0);
                    if !ist_zahl(n) {
                        let mut t = Tb::neu(); t.s("Trinkgeld muss eine Zahl sein, nicht "); darstellung(n, &mut t); t.s(".");
                        wirf_tb(K_TYP, &t); return KARTON;
                    }
                    l.trinkgeld += f(n);
                    o
                }
                N_WARTE => {
                    if l.zust != KARTON { return l.zust; }
                    let max = arg(pos, ben, 0, N_MAX);
                    let mut budget = f64::INFINITY;
                    if max != UNDEF && max != KARTON {
                        match dauer_ms_pruefen(max, "warte(max: …)") { Some(ms) => budget = crate::zahl::floor(ms * (1.0 + l.trinkgeld / 10.0)), None => return KARTON }
                    }
                    let zs = liefere(o, budget, knoten);
                    if sig() { return KARTON; }
                    let l = obj::<Lief>(o);
                    let zz = obj::<Zust>(zs);
                    if l.rueckruf != KARTON && zz.puenktlich != 0 && zz.fehler == KARTON { rufe(l.rueckruf, &[zz.wert], &[], knoten); }
                    zs
                }
                N_WENNDA => {
                    l.rueckruf = if pos.is_empty() { KARTON } else { pos[0] };
                    if l.zust != KARTON {
                        let zz = obj::<Zust>(l.zust);
                        if zz.puenktlich != 0 && zz.fehler == KARTON { rufe(l.rueckruf, &[zz.wert], &[], knoten); }
                    }
                    o
                }
                N_ISTGELIEFERT => bool_w(l.zust != KARTON),
                N_ALSTEXT => text(o),
                _ => KARTON,
            }
        }
        A_ZUST => {
            let zs = obj::<Zust>(o);
            match id {
                N_PUENKTLICH => bool_w(zs.puenktlich != 0),
                N_WERT => {
                    if zs.fehler != KARTON { wirf_zust_fehler(zs); return KARTON; }
                    if zs.puenktlich == 0 { wirf_ananas(K_LIEFER, "Zu spät – die Pizza ist kalt."); return KARTON; }
                    zs.wert
                }
                N_ODERGRATIS => {
                    if zs.fehler != KARTON { wirf_zust_fehler(zs); return KARTON; }
                    if zs.puenktlich == 0 { return if pos.is_empty() { KARTON } else { pos[0] }; }
                    zs.wert
                }
                N_ALSTEXT => text(o),
                _ => KARTON,
            }
        }
        A_STUECK => {
            let st = obj::<Stueck>(o);
            match id {
                N_PIZZA => st.pizza,
                N_ESSEN => {
                    if st.gegessen != 0 { wirf_ananas(K_STREIT, "Dieses Stück ist schon gegessen."); return KARTON; }
                    st.gegessen = 1;
                    KARTON
                }
                N_ISTGEGESSEN => bool_w(st.gegessen != 0),
                N_ALSTEXT => text(o),
                _ => KARTON,
            }
        }
        A_RESTE => {
            let r = obj::<Reste>(o);
            match id { N_WERT => r.wert, N_ISTMATSCHIG => bool_w(r.matschig != 0), N_ALSTEXT => text(o), _ => KARTON }
        }
        A_ROH => {
            let r = obj::<Roh>(o);
            match id { N_TEILERGEBNIS => r.teil, N_VERBRAUCHTEZEIT => r.zeit, N_ALSTEXT => text(o), _ => KARTON }
        }
        _ => KARTON,
    }
}

// ---------------------------------------------------------------- Kühlschrank
struct CacheEintrag { halter: u64, m: u32, key: Vec<u8>, w: W, t: f64 }
static mut CACHE: Vec<CacheEintrag> = Vec::new();

fn cache_teil(v: W, out: &mut Vec<u8>) {
    if v == KARTON || v == UNDEF { out.push(b'k'); return; }
    if art(v) == A_TEXT { out.push(b't'); out.extend_from_slice(bytes(v)); return; }
    if ist_zahl(v) { out.push(b'z'); crate::zahl::js_text(f(v), out); return; }
    if ist_bool(v) { out.push(if v == JA { b'j' } else { b'n' }); return; }
    if art(v) == A_OBJ { let o = obj::<Obj>(v); out.push(b'o'); out.extend_from_slice(bytes(name_text(kl(o.klasse).name))); out.push(b'@'); crate::zahl::js_text(o.nr, out); return; }
    let mut t = Tb::neu();
    text_in(v, &mut t);
    if sig() { z().sig = 0; out.extend_from_slice(b"x?"); return; }
    out.push(b'x');
    out.extend_from_slice(&t.0);
}

pub fn kuehlschrank(m: u32, dies: W, pos: &[W], ben: &Ben, _knoten: i32, modus: u32) -> W {
    let me = meth(m);
    let rechne = |p: &[W], b: &Ben| -> W {
        let me = meth(m);
        if !me.statisch && dies == KARTON && me.klasse >= 0 { braucht_instanz(m); return KARTON; }
        fuehre_aus(m, dies, KARTON, p, b)
    };
    let reste = |w: W, matschig: bool| -> W { neu_w(Reste { art: A_RESTE, matschig: matschig as u32, wert: w }) };
    if me.haltbar < 0.0 {
        let v = rechne(pos, ben);
        if sig() { return KARTON; }
        return if modus == 1 { reste(v, false) } else { v };
    }
    let halter: u64 = if dies != KARTON && ist_ptr(dies) { dies } else if me.klasse >= 0 { 0x1_0000_0000 | me.klasse as u64 } else { 0x2_0000_0000 };
    let mut key = Vec::new();
    let geordnet: Vec<W>;
    let teile: &[W] = if ben.is_empty() { pos } else {
        let ps = &fnx(me.fnid as u32).params;
        geordnet = ps.iter().enumerate().map(|(i, p)| if i < pos.len() { pos[i] } else { ben.iter().find(|(n, _)| *n == p.name).map(|x| x.1).unwrap_or(KARTON) }).collect();
        &geordnet
    };
    for (i, &v) in teile.iter().enumerate() {
        if i > 0 { key.push(1); }
        cache_teil(v, &mut key);
    }
    let idx = unsafe { CACHE.iter().position(|e| e.halter == halter && e.m == m && e.key == key) };
    let jetzt = || z().schritte + z().offset;
    match idx {
        Some(i) if modus != 2 => {
            let (w, t) = unsafe { (CACHE[i].w, CACHE[i].t) };
            if jetzt() - t <= me.haltbar { return if modus == 1 { reste(w, false) } else { w }; }
            let v = rechne(pos, ben);
            if sig() { return KARTON; }
            unsafe { CACHE[i].w = v; CACHE[i].t = jetzt(); }
            if modus == 1 { reste(w, true) } else { v }
        }
        _ => {
            let v = rechne(pos, ben);
            if sig() { return KARTON; }
            unsafe {
                match idx { Some(i) => { CACHE[i].w = v; CACHE[i].t = jetzt(); } None => CACHE.push(CacheEintrag { halter, m, key, w: v, t: jetzt() }) }
            }
            if modus == 1 { reste(v, false) } else { v }
        }
    }
}

// ---------------------------------------------------------------- Eingabe
static mut EOF_GESEHEN: bool = false;
pub fn lies_zeile(prompt: Option<W>, art: i32) -> W {
    if let Some(p) = prompt { crate::host_schreibe(bytes(p)); }
    let mut puf: Vec<u8> = alloc::vec![0u8; 65536];
    let n = crate::host_eingabe(art, prompt.map(bytes), &mut puf);
    if n < 0 { unsafe { EOF_GESEHEN = true; } return KARTON; }
    let mut n = n as usize;
    if n > puf.len() { n = puf.len(); }
    // \r?\n am Ende entfernen
    if n > 0 && puf[n - 1] == b'\n' { n -= 1; if n > 0 && puf[n - 1] == b'\r' { n -= 1; } }
    neu_text(&puf[..n])
}
pub fn hat_mehr() -> bool { let mut leer: [u8; 0] = []; crate::host_eingabe(2, None, &mut leer) > 0 }
pub fn eingabe_zahl(zeile: W, ersatz: W) -> W {
    if sig() { return KARTON; }
    if zeile == KARTON { return if ersatz == UNDEF { KARTON } else { ersatz }; }
    match crate::zahl::zahl_aus_text(s(zeile)) {
        Some(v) => zahl(v),
        None => { let mut m = Tb::neu(); m.s("'").t(zeile).s("' ist keine Zahl."); wirf_tb(K_TYP, &m); KARTON }
    }
}

// ---------------------------------------------------------------- Zufall
static mut ZUFALL: u32 = 42;
pub fn zufall() -> f64 { unsafe { crate::zahl::mulberry32(&mut ZUFALL) } }
