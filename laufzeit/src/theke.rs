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

pub const A_THEKE: u32 = 20;
pub const A_ZUTAT: u32 = 21;
/// Theke v5 (K-116): Zettel – beobachtbarer Wert (22/23 sind A_ZUFALL/A_KAMMER in vorrat.rs)
pub const A_ZETTEL: u32 = 24;

/// Zettel (K-116): `neu Zettel(wert = karton)`, `wert()`, `setze(w)`; Textform `Zettel(<Textform>)`
#[repr(C)]
pub struct Zettel { pub art: u32, pub _r: u32, pub wert: W }

/// Felder als Quellen/Bindungsziele (K-116): 0 = Zettel.wert, 1 … 15 Zutat-Eigenschaften (Name = Protokollfeld),
/// Stile ab F_STIL + Stilindex (nur über `bindeStil`).
const F_ZETTEL: u32 = 0;
const F_TEXT: u32 = 1;
const F_WERT: u32 = 2;
const F_AN: u32 = 3;
const F_AKTIV: u32 = 4;
const F_SICHTBAR: u32 = 5;
const F_HINWEIS: u32 = 6;
const F_UEBERGANG: u32 = 7;
const F_INTERVALL: u32 = 8;
const F_TITEL: u32 = 9;
const F_KLAPPBAR: u32 = 10;
const F_ZU: u32 = 11;
const F_GEWAEHLT: u32 = 12;
const F_OPTIONEN: u32 = 13;
const F_SPALTEN: u32 = 14;
const F_ZEILEN: u32 = 15;
const F_STIL: u32 = 32;
const FELD_NAMEN: [&str; 16] = ["wert", "text", "wert", "an", "aktiv", "sichtbar", "hinweis", "uebergang", "intervall", "titel", "klappbar", "zu", "gewaehlt", "optionen", "spalten", "zeilen"];

/// Bindung (K-116): Zutat + Feld ← Ausdruck; Quellen (Objekt, Feld) werden bei jeder Auswertung neu erfasst.
struct Bindung { zutat: W, feld: u32, fnw: W, dirty: bool, quellen: Vec<(W, u32)>, knoten: i32 }
/// alle Bindungen in Registrierungsreihenfolge (Ersetzen = alte entfernen, neue anhängen)
static mut BINDUNGEN: Vec<Bindung> = Vec::new();
/// Index der gerade rechnenden Bindung (-1 = keine): Getter registrieren Quellen, Setter werfen (K-118)
static mut AKTIV: i32 = -1;
/// Wiedereintrittsschutz der Auswertung an Synchronisationspunkten
static mut AUSWERTUNG: bool = false;
const DURCHLAEUFE_MAX: u32 = 100;

/// zart: 0 schild, 1 knopf, 2 eingabe, 3 haken, 4 stapel, 5 reihe, 6 takt, 7 fortschritt, 8 abschnitt, 9 tabelle, 10 reiter,
/// v4 (K-109/K-110): 11 auswahl, 12 tastatur
const ARTEN: [&str; 13] = ["schild", "knopf", "eingabe", "haken", "stapel", "reihe", "takt", "fortschritt", "abschnitt", "tabelle", "reiter", "auswahl", "tastatur"];
const ART_NAMEN: [u32; 13] = [N_G_SCHILD, N_G_KNOPF, N_G_EINGABE, N_G_HAKEN, N_G_STAPEL, N_G_REIHE, N_G_TAKT, N_G_FORTSCHRITT, N_G_ABSCHNITT, N_G_TABELLE, N_G_REITER, N_G_AUSWAHL, N_G_TASTATUR];
fn behaelter(zart: u32) -> bool { matches!(zart, 4 | 5 | 8 | 10) }
/// K-068/K-113: Stil-Whitelist in verbindlicher Reihenfolge (Fehlertext „Erlaubt: …“)
const STIL_NAMEN: [&str; 8] = ["breite", "hoehe", "abstand", "ausrichtung", "schrift", "farbe", "zeilen", "mindestbreite"];
/// Art je Stil: 0 = Zahl ≥ 0, 1 = Vokabular (ausrichtung/schrift/farbe), 2 = ganze Zahl ≥ 1 (zeilen)
const STIL_ART: [u8; 8] = [0, 0, 0, 1, 1, 1, 2, 0];
const STIL_ERLAUBT: &str = "breite, hoehe, abstand, ausrichtung, schrift, farbe, zeilen, mindestbreite";

#[repr(C)]
pub struct UiTheke { pub art: u32, pub gezeigt: u32, pub geschlossen: u32, pub _r: u32, pub titel: W, pub breite: f64, pub hoehe: f64, pub wurzel: W }
#[repr(C)]
pub struct UiZutat {
    pub art: u32, pub zart: u32, pub id: W, pub eltern: W, pub sichtbar: bool, pub an: bool, pub aktiv: bool,
    pub stil: Vec<(u32, W)>, pub stil_null: Vec<u32>, pub text: W, pub wert: W, pub platzhalter: W, pub kinder: Vec<W>,
    pub bei_klick: W, pub bei_aenderung: W, pub bei_enter: W,
    pub hinweis: W, pub intervall: f64, pub bei_takt: W, pub fortschritt: f64, pub titel: W, pub titel_liste: Vec<W>,
    pub gewaehlt: f64, pub spalten: Vec<W>, pub zeilen: Vec<Vec<W>>, pub uebergang: bool,
    // Theke v4: Abschnitt klappbar/zu (K-108), Auswahl-Optionen (K-109), Tastatur-Rückruf (K-110)
    pub klappbar: bool, pub zu: bool, pub optionen: Vec<W>, pub bei_taste: W,
}

static mut THEKE: W = KARTON;
static mut ZUTATEN: Vec<(W, W)> = Vec::new();
static mut ID_ZAEHLER: u32 = 0;
/// offene Änderungen: (Zutat-ID, [(Feld, JSON-Wert)])
static mut OFFEN: Vec<(W, Vec<(&'static str, String)>)> = Vec::new();
/// gepufferte Animationen (K-090): fertige JSON-Einträge in Aufrufreihenfolge, höchstens ANIM_MAX je Nachricht
static mut ANIM: Vec<String> = Vec::new();
const ANIM_MAX: usize = 32;
/// Theke v3 (K-090): Animationsarten (Laufzeit-Liste; die Renderer-Registry kennt dieselben Namen)
const ANIMATIONEN: [&str; 6] = ["puls", "huepfen", "wackeln", "funkeln", "einblenden", "aufpoppen"];
const FARBEN: [&str; 5] = ["tomate", "basilikum", "mozzarella", "kruste", "normal"];

#[link(wasm_import_module = "pizza")]
extern "C" {
    fn ui_senden(p: *const u8, n: usize);
    fn ui_warte(p: *mut u8, kap: i32) -> i32;
}

fn zutat(w: W) -> &'static mut UiZutat { obj::<UiZutat>(w) }
pub fn ist_zutat(w: W) -> bool { art(w) == A_ZUTAT }
pub fn ist_theke(w: W) -> bool { art(w) == A_THEKE }
pub fn ist_zettel(w: W) -> bool { art(w) == A_ZETTEL }
pub fn art_name(w: W) -> u32 { ART_NAMEN[zutat(w).zart as usize] }

// ---------------------------------------------------------------- Bindungen (Theke v5, K-116 … K-118)
/// bindbare Eigenschaften je Art (Reihenfolge = Fehlertext „Bindbar: …“); `sichtbar, hinweis` kommen für jede Zutat dazu
fn bindbar(zart: u32) -> Vec<u32> {
    let mut v: Vec<u32> = match zart {
        0 => alloc::vec![F_TEXT], 1 => alloc::vec![F_TEXT, F_AKTIV], 2 => alloc::vec![F_WERT], 3 => alloc::vec![F_TEXT, F_AN],
        6 => alloc::vec![F_AKTIV, F_INTERVALL], 7 => alloc::vec![F_WERT, F_TEXT], 8 => alloc::vec![F_TITEL, F_KLAPPBAR, F_ZU],
        9 => alloc::vec![F_SPALTEN, F_ZEILEN], 10 => alloc::vec![F_GEWAEHLT], 11 => alloc::vec![F_OPTIONEN, F_GEWAEHLT, F_AKTIV],
        12 => alloc::vec![F_AKTIV], _ => Vec::new(),
    };
    v.push(F_SICHTBAR); v.push(F_HINWEIS);
    v
}
/// `'text'` bzw. `Stil 'farbe'` (Fehlertexte K-116/K-118)
fn feld_in(feld: u32, tb: &mut Tb) {
    if feld >= F_STIL { tb.s("Stil '").s(STIL_NAMEN[(feld - F_STIL) as usize]).s("'"); } else { tb.s("'").s(FELD_NAMEN[feld as usize]).s("'"); }
}
/// Ein Getter wurde gelesen: Quelle (Objekt, Feld) der gerade rechnenden Bindung (außerhalb einer Bindung nichts)
fn quelle(o: W, feld: u32) {
    unsafe {
        if AKTIV < 0 { return; }
        let b = &mut BINDUNGEN[AKTIV as usize];
        if !b.quellen.iter().any(|&(x, f)| x == o && f == feld) { b.quellen.push((o, feld)); }
    }
}
/// (Objekt, Feld) hat sich wirklich geändert: alle lesenden Bindungen werden schmutzig
fn schmutzig(o: W, feld: u32) {
    unsafe { for b in BINDUNGEN.iter_mut() { if b.quellen.iter().any(|&(x, f)| x == o && f == feld) { b.dirty = true; } } }
}
fn bindung_index(o: W, feld: u32) -> Option<usize> { unsafe { BINDUNGEN.iter().position(|b| b.zutat == o && b.feld == feld) } }
/// K-116 „eine Eigenschaft hat einen Schreiber“: Setter auf eine gebundene Eigenschaft (true = geworfen)
fn gebunden(o: W, feld: u32) -> bool {
    if bindung_index(o, feld).is_none() { return false; }
    let mut t = Tb::neu();
    feld_in(feld, &mut t); t.s(" von "); text_in(o, &mut t); t.s(" ist gebunden – setze den Zettel, nicht die Zutat.");
    wirf_tb(K_LAUFZEIT, &t);
    true
}
/// K-118 „eine Bindung rechnet nur“: in einer Bindung sind Zustandsänderungen verboten (true = geworfen).
/// Überladene Getter/Setter (aktiv, sichtbar, hinweis, uebergang, klappbar, zu) sind ohne Argument erlaubt.
fn nur_rechnen(id: u32, pos: &[W]) -> bool {
    if unsafe { AKTIV } < 0 { return false; }
    let verboten = matches!(id, N_SETZETEXT | N_SETZEWERT | N_SETZEAN | N_SETZEINTERVALL | N_SETZETITEL | N_WAEHLE_ASCII | N_SETZEOPTIONEN
        | N_SETZESPALTEN | N_SETZEZEILEN | N_HINZU | N_LEEREN | N_BINDE | N_BINDESTIL | N_ANIMIERE | N_STIL | N_SCHWEBE | N_ZEIGE | N_BEDIENE | N_SCHLIESSE | N_SETZE)
        || (matches!(id, N_AKTIV | N_SICHTBAR | N_HINWEIS | N_UEBERGANG | N_KLAPPBAR | N_ZU) && !pos.is_empty());
    if !verboten { return false; }
    let mut t = Tb::neu();
    t.s("Eine Bindung rechnet nur – '").name(id).s("' ist darin nicht erlaubt.");
    wirf_tb(K_LAUFZEIT, &t);
    true
}

/// `binde(eigenschaft, fn)` / `bindeStil(schlüssel, fn)`: karton löst, sonst neue Registrierung mit sofortiger erster Auswertung
fn binde(o: W, id: u32, pos: &[W], knoten: i32) -> W {
    let stil = id == N_BINDESTIL;
    let name = text(a(pos, 0)); if sig() { return KARTON; }
    let feld = if stil {
        match stil_index(name) { Some(ki) => F_STIL + ki, None => return KARTON }
    } else {
        let liste = bindbar(zutat(o).zart);
        match liste.iter().find(|&&f| FELD_NAMEN[f as usize] == s(name)) {
            Some(&f) => f,
            None => {
                let mut t = Tb::neu();
                t.s("'").t(name).s("' lässt sich an "); text_in(o, &mut t); t.s(" nicht binden. Bindbar: ");
                for (i, &f) in liste.iter().enumerate() { if i > 0 { t.s(", "); } t.s(FELD_NAMEN[f as usize]); }
                t.s(".");
                wirf_tb(K_LAUFZEIT, &t);
                return KARTON;
            }
        }
    };
    let fnw = match ui_funktion(a(pos, 1), if stil { "bindeStil" } else { "binde" }) { Some(f) => f, None => return KARTON };
    unsafe {
        if let Some(i) = bindung_index(o, feld) { BINDUNGEN.remove(i); }
        if fnw == KARTON { return o; }
        BINDUNGEN.push(Bindung { zutat: o, feld, fnw, dirty: false, quellen: Vec::new(), knoten });
        let i = BINDUNGEN.len() - 1;
        let r = match rechne(i) { Some(r) => r, None => return KARTON };
        // W0103 (K-118, je Aufrufstelle): ohne Quelle rechnet die Bindung nie wieder – geprüft nach dem Ausdruck,
        // vor der Setter-Prüfung des Ergebnisses (wirft die, kommt die Warnung trotzdem – wie im Interpreter)
        if BINDUNGEN[i].quellen.is_empty() {
            let mut t = Tb::neu();
            t.s("Die Bindung "); feld_in(feld, &mut t); t.s(" von "); text_in(o, &mut t); t.s(" liest weder Zettel noch Zutat – sie rechnet nur einmal.");
            crate::start::warnung_w("W0103", t.fertig(), knoten);
        }
        if !setze_feld(o, feld, r, true) { return KARTON; }
    }
    o
}

/// Ausdruck einer Bindung rufen (0 Argumente): Quellen neu erfassen, währenddessen ist die Bindung AKTIV.
/// None = der Ausdruck hat geworfen (die Bindung bleibt sauber, das Signal propagiert).
fn rechne(i: usize) -> Option<W> {
    let (fnw, knoten) = unsafe { let b = &mut BINDUNGEN[i]; b.quellen.clear(); (b.fnw, b.knoten) };
    let vorher = unsafe { AKTIV };
    unsafe { AKTIV = i as i32; }
    let r = rufe(fnw, &[], &[], knoten);
    unsafe { AKTIV = vorher; }
    if sig() { None } else { Some(r) }
}
/// Eine Bindung auswerten: Ausdruck rufen, Ergebnis wie der gleichnamige Setter prüfen/umwandeln und setzen (K-117).
fn auswerte(i: usize) {
    let (o, feld) = unsafe { (BINDUNGEN[i].zutat, BINDUNGEN[i].feld) };
    if let Some(r) = rechne(i) { setze_feld(o, feld, r, true); }
}

/// K-116: Auswertung am Synchronisationspunkt – höchstens 100 Durchläufe, je Durchlauf alle Bindungen in Registrierungsreihenfolge,
/// jede schmutzige wird vor der Auswertung sauber markiert. Danach noch schmutzig → LaufzeitAnanas (erste schmutzige Bindung).
fn bindungen_auswerten() {
    unsafe {
        if AUSWERTUNG || sig() || BINDUNGEN.is_empty() { return; }
        AUSWERTUNG = true;
        let mut durchlauf = 0;
        while durchlauf < DURCHLAEUFE_MAX {
            let mut etwas = false;
            let mut i = 0;
            while i < BINDUNGEN.len() {
                if BINDUNGEN[i].dirty {
                    BINDUNGEN[i].dirty = false;
                    etwas = true;
                    auswerte(i);
                    if sig() { AUSWERTUNG = false; return; }
                }
                i += 1;
            }
            if !etwas { break; }
            durchlauf += 1;
        }
        AUSWERTUNG = false;
        if durchlauf >= DURCHLAEUFE_MAX {
            if let Some(b) = BINDUNGEN.iter().find(|b| b.dirty) {
                let mut t = Tb::neu();
                t.s("Die Bindungen kommen nicht zur Ruhe – "); feld_in(b.feld, &mut t); t.s(" von "); text_in(b.zutat, &mut t); t.s(" hängt von sich selbst ab.");
                wirf_tb(K_LAUFZEIT, &t);
            }
        }
    }
}

// ---------------------------------------------------------------- zentrale Schreibstelle (K-117: nur echte Änderungen)
fn geaendert(o: W, feld: u32, nachricht: bool, json: String) {
    schmutzig(o, feld);
    if nachricht { aendere(o, FELD_NAMEN[feld as usize], json); }
}
fn liste_gleich(a: &[W], b: &[W]) -> bool { a.len() == b.len() && a.iter().zip(b.iter()).all(|(x, y)| bytes(*x) == bytes(*y)) }
fn schreibe_text(o: W, feld: u32, t: W, nachricht: bool) {
    let z = zutat(o);
    let alt = match feld { F_TEXT => z.text, F_WERT => z.wert, F_HINWEIS => z.hinweis, _ => z.titel };
    if bytes(alt) == bytes(t) { return; }
    match feld { F_TEXT => z.text = t, F_WERT => z.wert = t, F_HINWEIS => z.hinweis = t, _ => z.titel = t }
    geaendert(o, feld, nachricht, jtext(t));
}
fn schreibe_bool(o: W, feld: u32, b: bool, nachricht: bool) {
    let z = zutat(o);
    let alt = match feld { F_AN => z.an, F_AKTIV => z.aktiv, F_SICHTBAR => z.sichtbar, F_UEBERGANG => z.uebergang, F_KLAPPBAR => z.klappbar, _ => z.zu };
    if alt == b { return; }
    match feld { F_AN => z.an = b, F_AKTIV => z.aktiv = b, F_SICHTBAR => z.sichtbar = b, F_UEBERGANG => z.uebergang = b, F_KLAPPBAR => z.klappbar = b, _ => z.zu = b }
    geaendert(o, feld, nachricht, jbool(b));
}
fn schreibe_zahl(o: W, feld: u32, x: f64, nachricht: bool) {
    let z = zutat(o);
    let alt = match feld { F_INTERVALL => z.intervall, F_WERT => z.fortschritt, _ => z.gewaehlt };
    if alt == x { return; }
    match feld { F_INTERVALL => z.intervall = x, F_WERT => z.fortschritt = x, _ => z.gewaehlt = x }
    geaendert(o, feld, nachricht, jzahl(x));
}
/// spalten / optionen / Reiter-titel
fn schreibe_liste(o: W, feld: u32, v: Vec<W>, nachricht: bool) {
    let z = zutat(o);
    let alt = match feld { F_SPALTEN => &z.spalten, F_OPTIONEN => &z.optionen, _ => &z.titel_liste };
    if liste_gleich(alt, &v) { return; }
    let j = jliste(&v);
    match feld { F_SPALTEN => z.spalten = v, F_OPTIONEN => z.optionen = v, _ => z.titel_liste = v }
    geaendert(o, feld, nachricht, j);
}
fn schreibe_zeilen(o: W, v: Vec<Vec<W>>, nachricht: bool) {
    let z = zutat(o);
    if z.zeilen.len() == v.len() && z.zeilen.iter().zip(v.iter()).all(|(a, b)| liste_gleich(a, b)) { return; }
    let j = jzeilen(&v);
    z.zeilen = v;
    geaendert(o, F_ZEILEN, nachricht, j);
}
fn stil_wert_gleich(a: W, b: W) -> bool {
    if ist_zahl(a) && ist_zahl(b) { return f(a) == f(b); }
    if art(a) == A_TEXT && art(b) == A_TEXT { return bytes(a) == bytes(b); }
    a == b
}
/// Stil setzen (Some) oder entfernen (None, K-075); K-117: Entfernen eines nicht gesetzten Schlüssels ändert nichts (kein `null`)
fn schreibe_stil(o: W, ki: u32, w: Option<W>, nachricht: bool) {
    let z = zutat(o);
    let pos = z.stil.iter().position(|x| x.0 == ki);
    match w {
        None => {
            match pos { Some(i) => { z.stil.remove(i); } None => return }
            if !z.stil_null.contains(&ki) { z.stil_null.push(ki); }
        }
        Some(w) => {
            match pos {
                Some(i) => { if stil_wert_gleich(z.stil[i].1, w) { return; } z.stil[i].1 = w; }
                None => z.stil.push((ki, w)),
            }
            if let Some(i) = z.stil_null.iter().position(|&x| x == ki) { z.stil_null.remove(i); }
        }
    }
    schmutzig(o, F_STIL + ki);
    if nachricht { let mut j = String::new(); stil_json(zutat(o), &mut j, true); aendere(o, "stil", j); }
}

/// Stilschlüssel → Index (K-068/K-113), sonst `Stil 'x' gibt es nicht. Erlaubt: …`
fn stil_index(k: W) -> Option<u32> {
    match STIL_NAMEN.iter().position(|&n| n == s(k)) {
        Some(i) => Some(i as u32),
        None => {
            let mut t = Tb::neu(); t.s("Stil '").t(k).s("' gibt es nicht. Erlaubt: ").s(STIL_ERLAUBT).s(".");
            wirf_tb(K_LAUFZEIT, &t); None
        }
    }
}
/// Stilwert prüfen: Zahlstile (breite, hoehe, abstand, mindestbreite) Zahl ≥ 0; zeilen ganze Zahl ≥ 1; sonst Vokabular (als Textform)
fn stil_wert(ki: u32, k: W, w: W) -> Option<W> {
    if STIL_ART[ki as usize] == 0 {
        if !(ist_zahl(w) && f(w) >= 0.0 && f(w).is_finite()) {
            let mut t = Tb::neu(); t.s("Stil '").t(k).s("' braucht eine Zahl ≥ 0, nicht "); darstellung(w, &mut t); t.s(".");
            wirf_tb(K_TYP, &t); return None;
        }
        return Some(w);
    }
    if STIL_ART[ki as usize] == 2 {
        if !(ist_zahl(w) && zl::ist_ganz(f(w)) && f(w) >= 1.0) {
            let mut t = Tb::neu(); t.s("Stil '").t(k).s("' braucht eine ganze Zahl ≥ 1, nicht "); darstellung(w, &mut t); t.s(".");
            wirf_tb(K_TYP, &t); return None;
        }
        return Some(w);
    }
    let w = text(w); if sig() { return None; }
    let erlaubt: &[&str] = match ki { 3 => &["links", "mitte", "rechts"], 4 => &["klein", "normal", "gross", "mono", "riesig"], _ => &["tomate", "basilikum", "mozzarella", "kruste", "normal"] };
    if !erlaubt.contains(&s(w)) {
        let mut t = Tb::neu(); t.s("Wert '").t(w).s("' ist für Stil '").t(k).s("' nicht erlaubt. Erlaubt: ");
        for (i, e) in erlaubt.iter().enumerate() { if i > 0 { t.s(", "); } t.s(e); }
        t.s(".");
        wirf_tb(K_LAUFZEIT, &t); return None;
    }
    Some(w)
}

/// Setter-Argument bzw. Bindungsergebnis wie der gleichnamige Setter prüfen/umwandeln und über die zentrale Schreibstelle
/// setzen (K-116/K-117). false = geworfen. Die Gebunden-Prüfung (K-116) macht der Setter vorher (`setter`).
/// geprüfter/umgewandelter Wert eines Felds (Ergebnis von `umwandeln`), bereit für die zentrale Schreibstelle
enum Feldwert { T(W), B(bool), Z(f64), L(Vec<W>), ZZ(Vec<Vec<W>>), S(Option<W>) }
/// Setter-Argument bzw. Bindungsergebnis wie der gleichnamige Setter prüfen und umwandeln (K-116). None = geworfen.
fn umwandeln(o: W, feld: u32, w: W) -> Option<Feldwert> {
    let zart = zutat(o).zart;
    if feld >= F_STIL {
        let ki = feld - F_STIL;
        if w == KARTON || w == UNDEF { return Some(Feldwert::S(None)); }
        return stil_wert(ki, neu_str(STIL_NAMEN[ki as usize]), w).map(|x| Feldwert::S(Some(x)));
    }
    Some(match feld {
        // K-102: text des Fortschritts ist ein optionales Feld – karton/fehlend → ""; sonst Textform (karton → "karton")
        F_TEXT if zart == 7 && (w == UNDEF || w == KARTON) => Feldwert::T(neu_str("")),
        F_HINWEIS if w == UNDEF || w == KARTON => Feldwert::T(neu_str("")),
        F_TEXT | F_WERT | F_TITEL | F_HINWEIS if !(feld == F_WERT && zart == 7) => { let t = text(w); if sig() { return None; } Feldwert::T(t) }
        F_WERT => Feldwert::Z(fortschritt_wert(w)?),
        F_AN | F_AKTIV | F_SICHTBAR | F_UEBERGANG | F_KLAPPBAR | F_ZU => { let b = bool_pruefen(w); if sig() { return None; } Feldwert::B(b) }
        F_INTERVALL => Feldwert::Z(takt_intervall(w)?),
        F_GEWAEHLT if zart == 10 => Feldwert::Z(reiter_seite(w, zutat(o).kinder.len())? as f64),
        F_GEWAEHLT => Feldwert::Z(auswahl_index(w, zutat(o).optionen.len())?),
        F_OPTIONEN => Feldwert::L(auswahl_optionen(w)?),
        F_SPALTEN => Feldwert::L(tabellen_zeile(w, "setzeSpalten")?),
        F_ZEILEN => Feldwert::ZZ(tabellen_zeilen(w)?),
        _ => return None,
    })
}
/// zentrale Schreibstelle (K-117): nur echte Änderungen – Bindungen schmutzig, Nachricht bei gezeigter Zutat
fn schreibe(o: W, feld: u32, v: Feldwert, nachricht: bool) {
    match v {
        Feldwert::T(t) => schreibe_text(o, feld, t, nachricht),
        Feldwert::B(b) => schreibe_bool(o, feld, b, nachricht),
        Feldwert::Z(x) => schreibe_zahl(o, feld, x, nachricht),
        Feldwert::L(l) => schreibe_liste(o, feld, l, nachricht),
        Feldwert::ZZ(z) => schreibe_zeilen(o, z, nachricht),
        Feldwert::S(st) => schreibe_stil(o, feld - F_STIL, st, nachricht),
    }
}
/// Bindungsergebnis prüfen/umwandeln und setzen (ohne Gebunden-Prüfung). false = geworfen.
fn setze_feld(o: W, feld: u32, w: W, nachricht: bool) -> bool {
    match umwandeln(o, feld, w) { Some(v) => { schreibe(o, feld, v, nachricht); true } None => false }
}
/// Zutat-Setter: Argument prüfen/umwandeln, dann Gebunden-Prüfung (K-116, wie der Interpreter: erst TypAnanas, dann „ist gebunden“),
/// dann setzen; liefert die Zutat (verkettbar) oder KARTON nach Ananas
fn setter(o: W, feld: u32, w: W) -> W {
    let v = match umwandeln(o, feld, w) { Some(v) => v, None => return KARTON };
    if gebunden(o, feld) { return KARTON; }
    schreibe(o, feld, v, true);
    o
}

/// Nach einem Rückruf wird immer gesendet (K-057, auch bei Ananas) – wie `try/finally` im Interpreter: wirft die Auswertung
/// einer Bindung selbst, ersetzt ihr Signal das des Rückrufs; sonst bleibt das ursprüngliche Signal samt Wurfobjekt.
fn flush_nach_rueckruf() {
    let s0 = crate::z().sig;
    if s0 == 0 { ui_flush(); return; }
    let (o0, p0) = unsafe { (WURF_OBJ, WURF_POS) };
    crate::z().sig = 0;
    ui_flush();
    if crate::z().sig == 0 { crate::z().sig = s0; unsafe { WURF_OBJ = o0; WURF_POS = p0; } }
}

// ---------------------------------------------------------------- Zettel (K-116)
fn neuer_zettel(pos: &[W], ben: &Ben) -> W {
    let w = arg(pos, ben, 0, N_WERT);
    neu_w(Zettel { art: A_ZETTEL, _r: 0, wert: if w == UNDEF { KARTON } else { w } })
}
fn zettel_methode(o: W, id: u32, pos: &[W]) -> W {
    // Küchenbrigade S4: Zettel gibt es nur in der Hauptküche (auch Getter)
    if crate::kueche::nur_hauptkueche(crate::kueche::T_ZETTEL) { return KARTON; }
    match id {
        N_WERT => { quelle(o, F_ZETTEL); obj::<Zettel>(o).wert }
        N_SETZE => {
            if nur_rechnen(id, pos) { return KARTON; }
            let w = a(pos, 0);
            let w = if w == UNDEF { KARTON } else { w };
            let z = obj::<Zettel>(o);
            // K-116/K-117: nur ein ungleicher Wert (Gleichheit wie ==) meldet die Änderung
            if !gleich(z.wert, w) { z.wert = w; schmutzig(o, F_ZETTEL); }
            o
        }
        N_ALSTEXT => text(o),
        _ => crate::std_m::nicht_gefunden(o, id),
    }
}

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
fn stil_json(z: &UiZutat, out: &mut String, mit_null: bool) {
    out.push('{');
    let mut i = 0;
    for &(k, v) in z.stil.iter() {
        if i > 0 { out.push(','); }
        i += 1;
        json_text(STIL_NAMEN[k as usize].as_bytes(), out);
        out.push(':');
        json_wert(v, out);
    }
    if mit_null {
        for &k in z.stil_null.iter() {
            if i > 0 { out.push(','); }
            i += 1;
            json_text(STIL_NAMEN[k as usize].as_bytes(), out);
            out.push_str(":null");
        }
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
        6 => { out.push_str(",\"intervall\":"); json_zahl(z.intervall, out); if !z.aktiv { out.push_str(",\"aktiv\":false"); } }
        7 => { out.push_str(",\"wert\":"); json_zahl(z.fortschritt, out); if !bytes(z.text).is_empty() { out.push_str(",\"text\":"); json_text(bytes(z.text), out); } }
        8 => {
            out.push_str(",\"titel\":"); json_text(bytes(z.titel), out);
            // K-108: nur bei Abweichung vom Standard (nein)
            if z.klappbar { out.push_str(",\"klappbar\":true"); }
            if z.zu { out.push_str(",\"zu\":true"); }
        }
        9 => { out.push_str(",\"spalten\":"); out.push_str(&jliste(&z.spalten)); out.push_str(",\"zeilen\":"); out.push_str(&jzeilen(&z.zeilen)); }
        10 => { out.push_str(",\"titel\":"); out.push_str(&jliste(&z.titel_liste)); out.push_str(",\"gewaehlt\":"); json_zahl(z.gewaehlt, out); }
        11 => { out.push_str(",\"optionen\":"); out.push_str(&jliste(&z.optionen)); out.push_str(",\"gewaehlt\":"); json_zahl(z.gewaehlt, out); if !z.aktiv { out.push_str(",\"aktiv\":false"); } }
        12 => { if !z.aktiv { out.push_str(",\"aktiv\":false"); } }
        _ => {}
    }
    if !bytes(z.hinweis).is_empty() { out.push_str(",\"hinweis\":"); json_text(bytes(z.hinweis), out); }
    if !z.sichtbar { out.push_str(",\"sichtbar\":false"); }
    if z.uebergang { out.push_str(",\"uebergang\":true"); }
    if !z.stil.is_empty() { out.push_str(",\"stil\":"); stil_json(z, out, false); }
    zutat(w).stil_null = Vec::new();
    if behaelter(z.zart) {
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

/// Programmende: letzte Änderungen senden, offenes Fenster schließen
pub fn ui_ende() {
    ui_flush();
    if sig() { return; }
    let t = unsafe { THEKE };
    if t == KARTON { return; }
    let th = obj::<UiTheke>(t);
    if th.gezeigt != 0 && th.geschlossen == 0 {
        sende("{\"v\":1,\"op\":\"schliesse\"}");
        th.geschlossen = 1;
        th.gezeigt = 0;
    }
}

pub fn ui_flush() {
    // K-116: Bindungen zuerst – die Nachricht zeigt den Zustand am Synchronisationspunkt (K-115)
    bindungen_auswerten();
    if sig() { return; }
    unsafe {
        if OFFEN.is_empty() && ANIM.is_empty() { return; }
        for (id, felder) in OFFEN.iter() {
            if felder.iter().any(|(k, _)| *k == "stil") { if let Some(z) = finde_id(bytes(*id)) { zutat(z).stil_null = Vec::new(); } }
        }
        let mut o = String::from("{\"v\":1,\"op\":\"aendere\",\"aenderungen\":[");
        for (i, (id, felder)) in OFFEN.iter().enumerate() {
            if i > 0 { o.push(','); }
            o.push_str("{\"id\":"); json_text(bytes(*id), &mut o);
            for (k, v) in felder.iter() {
                o.push(','); json_text(k.as_bytes(), &mut o); o.push(':');
                // K-115: kinder ist nur vorgemerkt – die Liste entsteht jetzt aus dem aktuellen Zustand der Teilbäume
                if *k == "kinder" { kinder_json(finde_id(bytes(*id)).unwrap(), &mut o); } else { o.push_str(v); }
            }
            o.push('}');
        }
        o.push(']');
        if !ANIM.is_empty() {
            o.push_str(",\"animationen\":[");
            for (i, e) in ANIM.iter().enumerate() { if i > 0 { o.push(','); } o.push_str(e); }
            o.push(']');
            ANIM.clear();
        }
        o.push('}');
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
/// K-115: nur vormerken – `ui_flush` schreibt die Liste beim Senden (Zustand am Synchronisationspunkt).
fn aendere_kinder(w: W) { aendere(w, "kinder", String::new()); }
fn kinder_json(w: W, out: &mut String) {
    out.push('[');
    let n = zutat(w).kinder.len();
    for i in 0..n { if i > 0 { out.push(','); } let k = zutat(w).kinder[i]; baum(k, out); }
    out.push(']');
}
fn jtext(w: W) -> String { let mut o = String::new(); json_text(bytes(w), &mut o); o }
fn jzahl(x: f64) -> String { let mut o = String::new(); json_zahl(x, &mut o); o }
fn jliste(v: &[W]) -> String { let mut o = String::from("["); for (i, &w) in v.iter().enumerate() { if i > 0 { o.push(','); } json_text(bytes(w), &mut o); } o.push(']'); o }
fn jzeilen(v: &[Vec<W>]) -> String { let mut o = String::from("["); for (i, z) in v.iter().enumerate() { if i > 0 { o.push(','); } o.push_str(&jliste(z)); } o.push(']'); o }
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

pub fn neu_moeglich(id: u32) -> bool { matches!(id, N_G_SCHILD | N_G_KNOPF | N_G_EINGABE | N_G_HAKEN | N_G_STAPEL | N_G_REIHE | N_G_TAKT | N_G_FORTSCHRITT | N_G_ABSCHNITT | N_G_TABELLE | N_G_REITER | N_G_AUSWAHL | N_G_TASTATUR | N_G_ZUTAT | N_G_THEKE | N_G_ZETTEL) }

/// `neu X(…)` für Theke-Klassen (nur wenn keine gleichnamige eigene Klasse existiert). None = keine Theke-Klasse.
pub fn neu(id: u32, pos: &[W], ben: &Ben) -> Option<W> {
    let zart = match id {
        N_G_SCHILD => 0, N_G_KNOPF => 1, N_G_EINGABE => 2, N_G_HAKEN => 3, N_G_STAPEL => 4, N_G_REIHE => 5,
        N_G_TAKT => 6, N_G_FORTSCHRITT => 7, N_G_ABSCHNITT => 8, N_G_TABELLE => 9, N_G_REITER => 10,
        N_G_AUSWAHL => 11, N_G_TASTATUR => 12,
        N_G_ZUTAT => { wirf_ananas(K_ROHLING, "Ein Rohling ist nicht essbar."); return Some(KARTON); }
        N_G_THEKE => return Some(neue_theke(pos, ben)),
        N_G_ZETTEL => return Some(neuer_zettel(pos, ben)),
        _ => return None,
    };
    Some(neue_zutat(zart, pos, ben))
}

fn neue_theke(pos: &[W], ben: &Ben) -> W {
    if unsafe { THEKE } != KARTON { wirf_ananas(K_LAUFZEIT, "Es gibt nur eine Theke pro Programm."); return KARTON; }
    let titel = arg(pos, ben, 0, N_TITEL);
    let br = arg(pos, ben, 1, N_BREITE);
    let ho = arg(pos, ben, 2, N_HOEHE);
    let titel = if titel == UNDEF { neu_str("") } else { text(titel) };  // K-102: karton → "karton" (Zustandsfeld)
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
        art: A_ZUTAT, zart, id, eltern: KARTON, sichtbar: true, an: false, aktiv: true, stil: Vec::new(), stil_null: Vec::new(),
        text: leer, wert: leer, platzhalter: leer, kinder: Vec::new(), bei_klick: KARTON, bei_aenderung: KARTON, bei_enter: KARTON,
        hinweis: leer, intervall: 1000.0, bei_takt: KARTON, fortschritt: 0.0, titel: leer, titel_liste: Vec::new(), gewaehlt: 1.0,
        spalten: Vec::new(), zeilen: Vec::new(), uebergang: false,
        klappbar: false, zu: false, optionen: Vec::new(), bei_taste: KARTON,
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
            zutat(z).wert = if w == UNDEF { neu_str("") } else { text(w) };  // K-102: karton → "karton" (Zustandsfeld)
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
        6 => {
            let d = arg(pos, ben, 0, N_INTERVALL);
            match takt_intervall(if d == UNDEF { KARTON } else { d }) { Some(x) => zutat(z).intervall = x, None => return KARTON }
            match ui_funktion(arg(pos, ben, 1, N_BEITAKT), "Takt") { Some(f) => zutat(z).bei_takt = f, None => return KARTON }
        }
        7 => {
            match fortschritt_wert(arg(pos, ben, 0, N_WERT)) { Some(x) => zutat(z).fortschritt = x, None => return KARTON }
            let t = arg(pos, ben, 1, N_TEXT);
            zutat(z).text = if t == UNDEF || t == KARTON { neu_str("") } else { text(t) };
        }
        9 => {
            match tabellen_zeile(arg(pos, ben, 0, N_SPALTEN), "Spalten") { Some(x) => zutat(z).spalten = x, None => return KARTON }
            match tabellen_zeilen(arg(pos, ben, 1, N_ZEILEN)) { Some(x) => zutat(z).zeilen = x, None => return KARTON }
        }
        // K-109: neu Auswahl(optionen, gewaehlt: 1)
        11 => {
            match auswahl_optionen(arg(pos, ben, 0, N_OPTIONEN)) { Some(x) => zutat(z).optionen = x, None => return KARTON }
            let g = arg(pos, ben, 1, N_GEWAEHLT);
            if g != UNDEF && g != KARTON {
                match auswahl_index(g, zutat(z).optionen.len()) { Some(n) => zutat(z).gewaehlt = n, None => return KARTON }
            }
        }
        // K-110: neu Tastatur(beiTaste?)
        12 => {
            match ui_funktion(arg(pos, ben, 0, N_BEITASTE), "Tastatur") { Some(f) => zutat(z).bei_taste = f, None => return KARTON }
        }
        8 | 10 => {
            let t = arg(pos, ben, 0, N_TITEL);
            if zart == 8 { zutat(z).titel = if t == UNDEF { neu_str("") } else { text(t) }; }  // K-102: karton → "karton" (Zustandsfeld)
            else { match tabellen_zeile(t, "Titel") { Some(x) => zutat(z).titel_liste = x, None => return KARTON } }
            if sig() { return KARTON; }
            let b = arg(pos, ben, 1, if zart == 8 { N_KINDER } else { N_SEITEN });
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

fn takt_intervall(d: W) -> Option<f64> {
    if art(d) != A_DAUER {
        let mut t = Tb::neu(); t.s("Ein Takt braucht eine Dauer, nicht "); darstellung(d, &mut t); t.s(".");
        wirf_tb(K_TYP, &t); return None;
    }
    let ms = zl::js_round(dauer_ms(d));
    if !(ms >= 100.0) {
        let mut t = Tb::neu(); t.s("Ein Takt braucht mindestens 100ms, nicht "); zl::dauer_text(dauer_ms(d), &mut t.0); t.s(".");
        wirf_tb(K_LAUFZEIT, &t); return None;
    }
    Some(ms)
}
fn fortschritt_wert(w: W) -> Option<f64> {
    if w == UNDEF || w == KARTON { return Some(0.0); }
    if !ist_zahl(w) {
        let mut t = Tb::neu(); t.s("Ein Fortschritt braucht eine Zahl zwischen 0 und 1, nicht "); darstellung(w, &mut t); t.s(".");
        wirf_tb(K_TYP, &t); return None;
    }
    let x = f(w);
    if x != x { return Some(0.0); }
    Some(if x < 0.0 { 0.0 } else if x > 1.0 { 1.0 } else { x })
}
fn tabellen_zeile(b: W, wo: &str) -> Option<Vec<W>> {
    if b == UNDEF || b == KARTON { return Some(Vec::new()); }
    if art(b) != A_BLECH {
        let mut t = Tb::neu(); t.s("Tabelle.").s(wo).s(" braucht ein Blech, nicht "); darstellung(b, &mut t); t.s(".");
        wirf_tb(K_TYP, &t); return None;
    }
    let mut r = Vec::new();
    let mut i = 0;
    while i < blech_v(b).len() { let x = text(blech_v(b)[i]); if sig() { return None; } r.push(x); i += 1; }
    Some(r)
}
/// K-109: Optionen einer Auswahl – Blech → Textformen (karton → "karton"), fehlend/karton → [], sonst TypAnanas
fn auswahl_optionen(b: W) -> Option<Vec<W>> {
    if b == UNDEF || b == KARTON { return Some(Vec::new()); }
    if art(b) != A_BLECH {
        let mut t = Tb::neu(); t.s("Auswahl braucht ein Blech mit Optionen, nicht "); darstellung(b, &mut t); t.s(".");
        wirf_tb(K_TYP, &t); return None;
    }
    let mut r = Vec::new();
    let mut i = 0;
    while i < blech_v(b).len() { let x = text(blech_v(b)[i]); if sig() { return None; } r.push(x); i += 1; }
    Some(r)
}
/// K-109: `n` ganze Zahl 1 … anzahl, sonst KeinStückAnanas „Option 7 gibt es nicht – die Auswahl hat 4 Optionen.“
fn auswahl_index(n: W, anzahl: usize) -> Option<f64> {
    if ist_zahl(n) && zl::ist_ganz(f(n)) && f(n) >= 1.0 && f(n) <= anzahl as f64 { return Some(f(n)); }
    let mut t = Tb::neu(); t.s("Option "); text_in_ops(n, &mut t); if sig() { return None; }
    t.s(" gibt es nicht – die Auswahl hat ").n(anzahl as f64).s(if anzahl == 1 { " Option." } else { " Optionen." });
    wirf_tb(K_KEINSTUECK, &t);
    None
}
/// K-107: `n` ganze Zahl 1 … Seitenzahl, sonst KeinStückAnanas „Seite 7 gibt es nicht – der Reiter hat 2 Seiten.“
fn reiter_seite(n: W, anzahl: usize) -> Option<usize> {
    if ist_zahl(n) && zl::ist_ganz(f(n)) && f(n) >= 1.0 && f(n) <= anzahl as f64 { return Some(f(n) as usize); }
    let mut t = Tb::neu(); t.s("Seite "); text_in_ops(n, &mut t); if sig() { return None; }
    t.s(" gibt es nicht – der Reiter hat ").n(anzahl as f64).s(if anzahl == 1 { " Seite." } else { " Seiten." });
    wirf_tb(K_KEINSTUECK, &t);
    None
}
fn tabellen_zeilen(b: W) -> Option<Vec<Vec<W>>> {
    if b == UNDEF || b == KARTON { return Some(Vec::new()); }
    if art(b) != A_BLECH {
        let mut t = Tb::neu(); t.s("Tabelle-Zeilen brauchen ein Blech aus Blechen, nicht "); darstellung(b, &mut t); t.s(".");
        wirf_tb(K_TYP, &t); return None;
    }
    let mut r = Vec::new();
    let mut i = 0;
    while i < blech_v(b).len() { r.push(tabellen_zeile(blech_v(b)[i], "setzeZeilen")?); i += 1; }
    Some(r)
}

pub fn tabelle_hat(o: W, id: u32) -> bool {
    if ist_theke(o) { return matches!(id, N_ZEIGE | N_BEDIENE | N_SCHLIESSE | N_SETZETITEL | N_TITEL | N_ALSTEXT | N_SCHWEBE); }
    if ist_zettel(o) { return matches!(id, N_WERT | N_SETZE | N_ALSTEXT); }
    let z = zutat(o);
    if matches!(id, N_ID | N_SICHTBAR | N_STIL | N_ALSTEXT | N_HINWEIS | N_UEBERGANG | N_ANIMIERE | N_BINDE | N_BINDESTIL) { return true; }
    match z.zart {
        0 => matches!(id, N_TEXT | N_SETZETEXT),
        1 => matches!(id, N_TEXT | N_SETZETEXT | N_BEIKLICK | N_AKTIV),
        2 => matches!(id, N_WERT | N_SETZEWERT | N_BEIAENDERUNG | N_BEIENTER),
        3 => matches!(id, N_TEXT | N_SETZETEXT | N_AN | N_SETZEAN | N_BEIAENDERUNG),
        6 => matches!(id, N_AKTIV | N_INTERVALL | N_SETZEINTERVALL | N_BEITAKT),
        7 => matches!(id, N_WERT | N_SETZEWERT | N_TEXT | N_SETZETEXT),
        8 => matches!(id, N_HINZU | N_LEEREN | N_TITEL | N_SETZETITEL | N_KLAPPBAR | N_ZU | N_BEIAENDERUNG),
        9 => matches!(id, N_SPALTEN | N_SETZESPALTEN | N_ZEILEN | N_SETZEZEILEN),
        10 => matches!(id, N_WAEHLE_ASCII | N_GEWAEHLT | N_BEIAENDERUNG | N_TITEL | N_SETZETITEL),
        11 => matches!(id, N_OPTIONEN | N_SETZEOPTIONEN | N_WAEHLE_ASCII | N_GEWAEHLT | N_BEIAENDERUNG | N_AKTIV),
        12 => matches!(id, N_BEITASTE | N_AKTIV),
        _ => matches!(id, N_HINZU | N_LEEREN),
    }
}

pub fn methode(o: W, id: u32, pos: &[W], ben: &Ben, knoten: i32) -> W {
    if !tabelle_hat(o, id) { return crate::std_m::nicht_gefunden(o, id); }
    if ist_zettel(o) { return zettel_methode(o, id, pos); }
    // Küchenbrigade S4: die Theke gibt es nur in der Hauptküche (auch Getter)
    if crate::kueche::nur_hauptkueche(crate::kueche::T_THEKE) { return KARTON; }
    // K-118: eine Bindung rechnet nur – Zustandsänderungen und Senden sind in ihr verboten
    if nur_rechnen(id, pos) { return KARTON; }
    if ist_theke(o) { return theke_methode(o, id, pos, ben, knoten); }
    let z = zutat(o);
    let zart = z.zart;
    // Getter registrieren sich als Quelle der rechnenden Bindung (K-116); Setter laufen über `setter` (K-116/K-117)
    match (zart, id) {
        (_, N_BINDE) | (_, N_BINDESTIL) => return binde(o, id, pos, knoten),
        (_, N_HINWEIS) => {
            if pos.is_empty() { quelle(o, F_HINWEIS); return z.hinweis; }
            return setter(o, F_HINWEIS, pos[0]);
        }
        (_, N_UEBERGANG) => {
            if pos.is_empty() { quelle(o, F_UEBERGANG); return bool_w(z.uebergang); }
            return setter(o, F_UEBERGANG, pos[0]);
        }
        (_, N_ANIMIERE) => {
            let a_ = arg(pos, ben, 0, N_ART);
            let art_ = text(if a_ == UNDEF { KARTON } else { a_ }); if sig() { return KARTON; }
            if !ANIMATIONEN.contains(&s(art_)) {
                let mut t = Tb::neu(); t.s("Animation '").t(art_).s("' gibt es nicht. Erlaubt: puls, huepfen, wackeln, funkeln, einblenden, aufpoppen.");
                wirf_tb(K_LAUFZEIT, &t); return KARTON;
            }
            let dauer_ = match anim_dauer(arg(pos, ben, 1, N_DAUER), "animiere") { Some(d) => d, None => return KARTON };
            if !anim_offen(o, knoten) { return o; }
            let mut e = String::from("{\"id\":"); json_text(bytes(zutat(o).id), &mut e);
            e.push_str(",\"art\":"); json_text(bytes(art_), &mut e);
            if let Some(ms) = dauer_ { e.push_str(",\"dauer\":"); json_zahl(ms, &mut e); }
            e.push('}');
            anim_puffer(e);
            return o;
        }
        (6, N_INTERVALL) => { quelle(o, F_INTERVALL); return dauer(z.intervall); }
        (6, N_SETZEINTERVALL) => return setter(o, F_INTERVALL, a(pos, 0)),
        (6, N_BEITAKT) => { match ui_funktion(a(pos, 0), "beiTakt") { Some(f) => { zutat(o).bei_takt = f; return o; } None => return KARTON } }
        (7, N_WERT) => { quelle(o, F_WERT); return zahl(z.fortschritt); }
        (7, N_SETZEWERT) => return setter(o, F_WERT, a(pos, 0)),
        // K-102: text des Fortschritts ist ein optionales Feld (K-067) – karton/fehlend löscht den Text (in setze_feld)
        (7, N_SETZETEXT) => return setter(o, F_TEXT, a(pos, 0)),
        (8, N_TITEL) => { quelle(o, F_TITEL); return z.titel; }
        (8, N_SETZETITEL) => return setter(o, F_TITEL, a(pos, 0)),
        // K-108: klappbar(d)/klappbar(), zu(d)/zu() – Getter/Setter wie aktiv/sichtbar
        (8, N_KLAPPBAR) => {
            if pos.is_empty() { quelle(o, F_KLAPPBAR); return bool_w(z.klappbar); }
            return setter(o, F_KLAPPBAR, pos[0]);
        }
        (8, N_ZU) => {
            if pos.is_empty() { quelle(o, F_ZU); return bool_w(z.zu); }
            return setter(o, F_ZU, pos[0]);
        }
        // K-107: Reiter.setzeTitel(n, text) / titel(n) – Titelliste wird mit "" aufgefüllt, Nachricht als ganze Liste
        (10, N_SETZETITEL) => {
            let n = match reiter_seite(a(pos, 0), z.kinder.len()) { Some(n) => n, None => return KARTON };
            let mut neu = z.titel_liste.clone();
            while neu.len() < n { neu.push(neu_str("")); }
            let t = text(a(pos, 1)); if sig() { return KARTON; }
            neu[n - 1] = t;
            schreibe_liste(o, F_TITEL, neu, true);
            return o;
        }
        (10, N_TITEL) => {
            let n = match reiter_seite(a(pos, 0), z.kinder.len()) { Some(n) => n, None => return KARTON };
            quelle(o, F_TITEL);   // Quelle erst nach gültiger Seite (wie der Interpreter)
            return if n <= z.titel_liste.len() { z.titel_liste[n - 1] } else { neu_str("") };
        }
        // K-109: Auswahl
        (11, N_OPTIONEN) => { quelle(o, F_OPTIONEN); return blech(z.optionen.clone()); }
        (11, N_SETZEOPTIONEN) => return setter(o, F_OPTIONEN, a(pos, 0)),
        (10, N_WAEHLE_ASCII) | (11, N_WAEHLE_ASCII) => return setter(o, F_GEWAEHLT, a(pos, 0)),
        (10, N_GEWAEHLT) | (11, N_GEWAEHLT) => { quelle(o, F_GEWAEHLT); return zahl(z.gewaehlt); }
        // K-110: Tastatur
        (12, N_BEITASTE) => { match ui_funktion(a(pos, 0), "beiTaste") { Some(f) => { zutat(o).bei_taste = f; return o; } None => return KARTON } }
        (9, N_SPALTEN) => { quelle(o, F_SPALTEN); return blech(z.spalten.clone()); }
        (9, N_SETZESPALTEN) => return setter(o, F_SPALTEN, a(pos, 0)),
        (9, N_ZEILEN) => { quelle(o, F_ZEILEN); return blech(z.zeilen.iter().map(|r| blech(r.clone())).collect()); }
        (9, N_SETZEZEILEN) => return setter(o, F_ZEILEN, a(pos, 0)),
        (10, N_BEIAENDERUNG) => { match ui_funktion(a(pos, 0), "beiAenderung") { Some(f) => { zutat(o).bei_aenderung = f; return o; } None => return KARTON } }
        _ => {}
    }
    match id {
        N_ID => z.id,
        N_ALSTEXT => text(o),
        N_SICHTBAR => {
            if pos.is_empty() { quelle(o, F_SICHTBAR); return bool_w(z.sichtbar); }
            setter(o, F_SICHTBAR, pos[0])
        }
        N_STIL => {
            let k = text(a(pos, 0)); if sig() { return KARTON; }
            let ki = match stil_index(k) { Some(i) => i, None => return KARTON };
            setter(o, F_STIL + ki, a(pos, 1))
        }
        N_TEXT => { quelle(o, F_TEXT); z.text }
        N_SETZETEXT => setter(o, F_TEXT, a(pos, 0)),
        N_BEIKLICK => { match ui_funktion(a(pos, 0), "beiKlick") { Some(f) => { zutat(o).bei_klick = f; o } None => KARTON } }
        N_AKTIV => {
            if pos.is_empty() { quelle(o, F_AKTIV); return bool_w(z.aktiv); }
            setter(o, F_AKTIV, pos[0])
        }
        N_WERT => { quelle(o, F_WERT); z.wert }
        N_SETZEWERT => setter(o, F_WERT, a(pos, 0)),
        N_BEIAENDERUNG => { match ui_funktion(a(pos, 0), "beiAenderung") { Some(f) => { zutat(o).bei_aenderung = f; o } None => KARTON } }
        N_BEIENTER => { match ui_funktion(a(pos, 0), "beiEnter") { Some(f) => { zutat(o).bei_enter = f; o } None => KARTON } }
        N_AN => { quelle(o, F_AN); bool_w(z.an) }
        N_SETZEAN => setter(o, F_AN, a(pos, 0)),
        // K-117: hinzu ändert immer, leeren() eines leeren Behälters nicht
        N_HINZU => { if !kind(o, a(pos, 0)) { return KARTON; } aendere_kinder(o); o }
        N_LEEREN => {
            let n = zutat(o).kinder.len();
            if n == 0 { return o; }
            for i in 0..n { let k = zutat(o).kinder[i]; zutat(k).eltern = KARTON; }
            zutat(o).kinder = Vec::new();
            aendere_kinder(o);
            o
        }
        _ => crate::std_m::nicht_gefunden(o, id),
    }
}

fn theke_methode(t: W, id: u32, pos: &[W], ben: &Ben, knoten: i32) -> W {
    match id {
        N_SCHWEBE => { schwebe(pos, ben, knoten); if sig() { KARTON } else { t } }
        N_ZEIGE => { zeige(t, a(pos, 0)); t }
        N_BEDIENE => { bediene(t, knoten); KARTON }
        N_SCHLIESSE => { schliesse(t); KARTON }
        N_SETZETITEL => {
            let x = text(a(pos, 0)); if sig() { return KARTON; }
            let th = obj::<UiTheke>(t);
            th.titel = x;
            if th.gezeigt != 0 && th.geschlossen == 0 { ui_flush(); if sig() { return KARTON; } fenster_nachricht(obj::<UiTheke>(t)); }
            t
        }
        N_TITEL => obj::<UiTheke>(t).titel,
        N_ALSTEXT => text(t),
        _ => crate::std_m::nicht_gefunden(t, id),
    }
}

/// K-090: Dauer einer Animation – Dauer, ganze ms (K-047), 50 ms … 5 s; karton/fehlend → Some(None) (Standard des Renderers)
fn anim_dauer(d: W, wo: &str) -> Option<Option<f64>> {
    if d == UNDEF || d == KARTON { return Some(None); }
    if art(d) != A_DAUER {
        let mut t = Tb::neu(); t.s(wo).s("(dauer: …) braucht eine Dauer, nicht "); darstellung(d, &mut t); t.s(".");
        wirf_tb(K_TYP, &t); return None;
    }
    let ms = zl::js_round(dauer_ms(d));
    if !(ms >= 50.0 && ms <= 5000.0) {
        let mut t = Tb::neu(); t.s("Eine Animation dauert 50ms bis 5s, nicht "); zl::dauer_text(dauer_ms(d), &mut t.0); t.s(".");
        wirf_tb(K_LAUFZEIT, &t); return None;
    }
    Some(Some(ms))
}

/// K-090: Animation nur bei offener Theke und gezeigter Zutat (z == KARTON: Fenstermitte), sonst W0102 je Aufrufstelle
fn anim_offen(z: W, knoten: i32) -> bool {
    let t = unsafe { THEKE };
    if t == KARTON || obj::<UiTheke>(t).gezeigt == 0 || obj::<UiTheke>(t).geschlossen != 0 {
        crate::start::warnung("W0102", "Animation entfällt – die Theke ist nicht offen.", knoten);
        return false;
    }
    if z != KARTON && !angezeigt(z) {
        let mut x = Tb::neu(); x.s("Animation entfällt – '").t(zutat(z).id).s("' liegt nicht auf der Theke.");
        crate::start::warnung_w("W0102", x.fertig(), knoten);
        return false;
    }
    true
}

fn anim_puffer(e: String) { unsafe { if ANIM.len() < ANIM_MAX { ANIM.push(e); } } }

fn schwebe(pos: &[W], ben: &Ben, knoten: i32) {
    let tx = arg(pos, ben, 0, N_TEXT);
    let txt = text(if tx == UNDEF { KARTON } else { tx }); if sig() { return; }
    let mut bei = arg(pos, ben, 1, N_BEI);
    if bei == UNDEF { bei = KARTON; }
    if bei != KARTON && !ist_zutat(bei) {
        let mut t = Tb::neu(); t.s("schwebe(bei: …) braucht eine Zutat, nicht "); darstellung(bei, &mut t); t.s(".");
        wirf_tb(K_TYP, &t); return;
    }
    let mut farbe = arg(pos, ben, 2, N_FARBE);
    if farbe == UNDEF { farbe = KARTON; }
    if farbe != KARTON {
        farbe = text(farbe); if sig() { return; }
        if !FARBEN.contains(&s(farbe)) {
            let mut t = Tb::neu(); t.s("Wert '").t(farbe).s("' ist für Stil 'farbe' nicht erlaubt. Erlaubt: tomate, basilikum, mozzarella, kruste, normal.");
            wirf_tb(K_LAUFZEIT, &t); return;
        }
    }
    let dauer_ = match anim_dauer(arg(pos, ben, 3, N_DAUER), "schwebe") { Some(d) => d, None => return };
    if !anim_offen(bei, knoten) { return; }
    let mut e = String::from("{\"art\":\"schwebe\",\"text\":"); json_text(bytes(txt), &mut e);
    if bei != KARTON { e.push_str(",\"id\":"); json_text(bytes(zutat(bei).id), &mut e); }
    if farbe != KARTON { e.push_str(",\"farbe\":"); json_text(bytes(farbe), &mut e); }
    if let Some(ms) = dauer_ { e.push_str(",\"dauer\":"); json_zahl(ms, &mut e); }
    e.push('}');
    anim_puffer(e);
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
    // K-116: Bindungen vor dem baum auswerten (Nachricht = Zustand am Synchronisationspunkt)
    bindungen_auswerten();
    if sig() { return; }
    unsafe { OFFEN.clear(); ANIM.clear(); }
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
    if sig() { return; }
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
        if sig() { return; }
        crate::start::warnung("W0100", "Keine Theke verfügbar – Fenster wird nicht angezeigt.", knoten);
        return;
    }
    loop {
        ui_flush();
        if sig() { return; }
        if obj::<UiTheke>(t).geschlossen != 0 { return; }
        let ev = naechstes();
        let ev = match ev { Some(e) => e, None => b"{\"typ\":\"geschlossen\"}".to_vec() };
        let felder = json_objekt(&ev);
        let typ = feld_text(&felder, "typ");
        if typ.as_deref() == Some("geschlossen") || felder.is_none() {
            unsafe { OFFEN.clear(); ANIM.clear(); }
            let th = obj::<UiTheke>(t);
            th.geschlossen = 1; th.gezeigt = 0;
            return;
        }
        verteile(&felder, knoten);
        if obj::<UiTheke>(t).geschlossen == 0 { flush_nach_rueckruf(); }
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
    // nur gezeigte Zutaten bekommen Ereignisse (K-057/K-084)
    if !angezeigt(z) { return; }
    // K-087: jeder Rückruf beginnt mit frischem Schrittbudget
    unsafe { crate::pf::LIMIT_BASIS = crate::z().schritte; }
    crate::pf::neu_grenze();
    let typ = feld_text(ev, "typ").unwrap_or_default();
    let zz = zutat(z);
    match typ.as_str() {
        "takt" => {
            if zz.zart == 6 && zz.aktiv && zz.bei_takt != KARTON {
                let anzahl = match feld(ev, "anzahl") {
                    Some(v) if v.starts_with("n:") => { let x: f64 = v[2..].parse().unwrap_or(0.0); if zl::ist_ganz(x) && x >= 1.0 { x } else { 1.0 } }
                    _ => 1.0,
                };
                rufe(zz.bei_takt, &[zahl(anzahl)], &[], knoten);
            }
        }
        "klick" => {
            if zz.zart == 1 && zz.aktiv && zz.bei_klick != KARTON { rufe(zz.bei_klick, &[], &[], knoten); }
        }
        // K-110: Taste nur für eine aktive Tastatur mit Rückruf und nicht-leerem Text
        "taste" => {
            if zz.zart == 12 && zz.aktiv && zz.bei_taste != KARTON {
                if let Some(t) = feld_text(ev, "taste") {
                    if !t.is_empty() { rufe(zz.bei_taste, &[neu_str(&t)], &[], knoten); }
                }
            }
        }
        "aenderung" => {
            if zz.zart == 2 {
                // K-116/K-117: Renderer-Werte gehen über die zentrale Schreibstelle (Bindungen werden schmutzig, keine Nachricht)
                schreibe_text(z, F_WERT, wert_als_text(ev).unwrap_or_else(|| neu_str("")), false);
                let (f, w) = (zutat(z).bei_aenderung, zutat(z).wert);
                if f != KARTON { rufe(f, &[w], &[], knoten); }
            } else if zz.zart == 10 {
                if let Some(v) = feld(ev, "wert") {
                    if let Some(nt) = v.strip_prefix("n:") {
                        let n: f64 = nt.parse().unwrap_or(f64::NAN);
                        if zl::ist_ganz(n) && n >= 1.0 && n <= zutat(z).kinder.len() as f64 {
                            schreibe_zahl(z, F_GEWAEHLT, n, false);
                            let f_ = zutat(z).bei_aenderung;
                            if f_ != KARTON { rufe(f_, &[zahl(n)], &[], knoten); }
                        }
                    }
                }
            } else if zz.zart == 3 {
                let v = feld(ev, "wert");
                schreibe_bool(z, F_AN, v == Some("b:1") || v == Some("s:true"), false);
                let (f, w) = (zutat(z).bei_aenderung, bool_w(zutat(z).an));
                if f != KARTON { rufe(f, &[w], &[], knoten); }
            } else if zz.zart == 8 {
                // K-108: nur ein klappbarer Abschnitt nimmt das Ereignis an; wert = neuer zu-Zustand (wie Haken)
                if zz.klappbar {
                    let v = feld(ev, "wert");
                    schreibe_bool(z, F_ZU, v == Some("b:1") || v == Some("s:true"), false);
                    let (f, w) = (zutat(z).bei_aenderung, bool_w(zutat(z).zu));
                    if f != KARTON { rufe(f, &[w], &[], knoten); }
                }
            } else if zz.zart == 11 {
                // K-109: aktive Auswahl, ganzer wert in 1 … Anzahl
                if zz.aktiv {
                    if let Some(v) = feld(ev, "wert") {
                        if let Some(nt) = v.strip_prefix("n:") {
                            let n: f64 = nt.parse().unwrap_or(f64::NAN);
                            if zl::ist_ganz(n) && n >= 1.0 && n <= zutat(z).optionen.len() as f64 {
                                schreibe_zahl(z, F_GEWAEHLT, n, false);
                                let f_ = zutat(z).bei_aenderung;
                                if f_ != KARTON { rufe(f_, &[zahl(n)], &[], knoten); }
                            }
                        }
                    }
                }
            }
        }
        "enter" => {
            if zz.zart == 2 {
                if let Some(w) = wert_als_text(ev) { schreibe_text(z, F_WERT, w, false); }
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
    else if ist_zettel(v) { tb.s("Zettel("); text_in_ops(obj::<Zettel>(v).wert, tb); tb.s(")"); }
    else { tb.name(art_name(v)).s("(").t(zutat(v).id).s(")"); }
}
pub fn typ_name(v: W, tb: &mut Tb) {
    if ist_theke(v) { tb.s("Theke"); } else if ist_zettel(v) { tb.s("Zettel"); } else { tb.name(art_name(v)); }
}
/// pruefeTyp für die Theke-Typnamen ohne eigene Klasse
pub fn typ_passt(typ: u32, v: W) -> Option<bool> {
    match typ {
        N_G_THEKE => Some(ist_theke(v)),
        N_G_ZUTAT => Some(ist_zutat(v)),
        N_G_ZETTEL => Some(ist_zettel(v)),
        N_G_SCHILD | N_G_KNOPF | N_G_EINGABE | N_G_HAKEN | N_G_STAPEL | N_G_REIHE | N_G_TAKT | N_G_FORTSCHRITT | N_G_ABSCHNITT | N_G_TABELLE | N_G_REITER | N_G_AUSWAHL | N_G_TASTATUR => Some(ist_zutat(v) && art_name(v) == typ),
        _ => None,
    }
}

fn text_in_ops(v: W, tb: &mut Tb) { crate::ops::text_in(v, tb) }
