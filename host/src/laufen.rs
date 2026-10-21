//! Ausführung eines `.pkarton` gemäß HOST-ABI.md v1 mit wasmi.

use std::collections::VecDeque;
use std::io::BufRead;

use wasmi::{Caller, Config, Engine, Extern, Linker, Module, Store};

use crate::ereignis::{Ereignis, Senke};

/// Unterstützte ABI-Version (HOST-ABI.md §9).
pub const ABI_VERSION: i32 = 1;

#[derive(Debug, Clone, Default)]
pub struct Optionen {
    /// Schrittlimit (`limit_setzen`); `None` → Standard des Moduls (5 000 000).
    pub schritt_limit: Option<f64>,
    /// Heap-Obergrenze in MiB (`speicher_limit_setzen`); `None` → Standard des Moduls (64).
    pub speicher_mib: Option<i32>,
    /// Vorgegebene Eingabezeilen (`--eingabe datei`); `None` → zeilenweise von stdin.
    pub eingabe: Option<Vec<String>>,
}

/// Quelle für `pizza.eingabe` (EINGABE.md §4).
enum Quelle {
    Stdin { eof: bool },
    Zeilen(VecDeque<String>),
}

impl Quelle {
    fn naechste(&mut self) -> Option<String> {
        match self {
            Quelle::Zeilen(z) => z.pop_front(),
            Quelle::Stdin { eof } => {
                if *eof {
                    return None;
                }
                let mut roh = Vec::new();
                match std::io::stdin().lock().read_until(b'\n', &mut roh) {
                    Ok(0) | Err(_) => {
                        *eof = true;
                        None
                    }
                    Ok(_) => {
                        if roh.last() == Some(&b'\n') {
                            roh.pop();
                        }
                        if roh.last() == Some(&b'\r') {
                            roh.pop();
                        }
                        Some(String::from_utf8_lossy(&roh).into_owned())
                    }
                }
            }
        }
    }
}

/// Zerlegt den Inhalt einer Eingabedatei in Zeilen (wie `split(/\r?\n/)`, ohne leere Schlusszeile).
pub fn zeilen(inhalt: &str) -> Vec<String> {
    let mut v: Vec<String> = inhalt.split('\n').map(|z| z.strip_suffix('\r').unwrap_or(z).to_string()).collect();
    if v.last().map(|z| z.is_empty()) == Some(true) {
        v.pop();
    }
    v
}

struct Zustand {
    senke: Senke,
    quelle: Quelle,
    /// Gelesene, aber noch nicht abgeholte Zeile (Puffer war zu klein, K-013).
    wartend: Option<String>,
    /// Gesetzt, wenn `panik` gemeldet wurde und der Host abgebrochen hat.
    panik: bool,
}

/// Marker-Fehler, mit dem der Host nach `panik` den Lauf abbricht.
#[derive(Debug)]
struct PanikAbbruch;
impl std::fmt::Display for PanikAbbruch {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Hawaii-Panik")
    }
}
impl wasmi::errors::HostError for PanikAbbruch {}

fn engine() -> Engine {
    let mut c = Config::default();
    // Erlaubte Features laut WASM.md §1.4 / HOST-ABI.md §1 – alles andere aus.
    c.wasm_mutable_global(true)
        .wasm_sign_extension(true)
        .wasm_saturating_float_to_int(true)
        .wasm_multi_value(true)
        .wasm_bulk_memory(true)
        .wasm_reference_types(false)
        .wasm_multi_memory(false)
        .wasm_tail_call(false)
        .wasm_extended_const(false)
        .wasm_wide_arithmetic(false)
        .wasm_custom_page_sizes(false)
        .ignore_custom_sections(true);
    // HOST-ABI §6: ≥ 16 384 verschachtelte Aufrufe, ≥ 4 MiB Wert-Stapel.
    c.set_max_recursion_depth(65_536);
    c.set_max_stack_height(64 * 1024 * 1024);
    Engine::new(&c)
}

/// Prüft, ob die Bytes ein für diesen Host gültiges Modul sind.
pub fn pruefe(pkarton: &[u8]) -> Result<(), String> {
    if pkarton.len() < 8 || &pkarton[..4] != b"\0asm" {
        return Err("keine WebAssembly-Magie (\\0asm)".into());
    }
    Module::new(&engine(), pkarton).map(|_| ()).map_err(|e| e.to_string())
}

fn text(caller: &Caller<'_, Zustand>, ptr: i32, len: i32) -> String {
    let Some(Extern::Memory(mem)) = caller.get_export("memory") else {
        return String::new();
    };
    let daten = mem.data(caller);
    let (p, n) = (ptr as u32 as usize, len as u32 as usize);
    match daten.get(p..p.saturating_add(n)) {
        Some(b) => String::from_utf8_lossy(b).into_owned(),
        None => String::new(),
    }
}

fn pos(x: i32) -> Option<i32> {
    if x > 0 {
        Some(x)
    } else {
        None
    }
}

const ARTEN: [&str; 4] = ["syntax", "pizzafehler", "ananas", "limit"];

/// Fester Text interner Fehler eines laufenden Programms (K-014).
pub const INTERNER_FEHLER: &str = "Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.";

/// Gültige Exit-Codes (SPEC §12, K-046).
const EXIT_CODES: [i32; 5] = [0, 1, 2, 3, 39];

fn interner_fehler(detail: String) -> Ereignis {
    Ereignis::Fehler {
        code: "LaufzeitAnanas".into(),
        art: "ananas".into(),
        text: INTERNER_FEHLER.into(),
        zeile: None,
        spalte: None,
        detail: Some(detail),
    }
}

/// Ladefehler vor dem Start (Modul ungültig, falsche ABI-Version …): K-043 – `code HOST`, `art intern`, Exit 2.
fn ladefehler(senke: &mut Senke, grund: String) -> i32 {
    senke.sende(Ereignis::Fehler {
        code: "HOST".into(),
        art: "intern".into(),
        text: format!("PizzaFehler HOST: {}", grund),
        zeile: None,
        spalte: None,
        detail: None,
    });
    senke.sende(Ereignis::Ende { exit_code: 2, schritte: 0.0, zeit_ms: 0.0 });
    2
}

/// Führt ein `.pkarton` aus, sendet alle Ereignisse (inkl. `ende`) an `senke` und liefert den Exit-Code.
pub fn fuehre_aus(pkarton: &[u8], args: &[String], opt: &Optionen, senke: &mut Senke) -> i32 {
    let engine = engine();
    let module = match Module::new(&engine, pkarton) {
        Ok(m) => m,
        Err(e) => return ladefehler(senke, format!("kein gültiges .pkarton: {}", e)),
    };
    let quelle = match &opt.eingabe {
        Some(z) => Quelle::Zeilen(z.iter().cloned().collect()),
        None => Quelle::Stdin { eof: false },
    };
    let zustand = Zustand { senke: std::mem::replace(senke, Senke::Sammeln(Vec::new())), quelle, wartend: None, panik: false };
    let mut store = Store::new(&engine, zustand);
    let code = lauf(&mut store, &module, args, opt);
    *senke = std::mem::replace(&mut store.data_mut().senke, Senke::Sammeln(Vec::new()));
    code
}

fn lauf(store: &mut Store<Zustand>, module: &Module, args: &[String], opt: &Optionen) -> i32 {
    let mut linker = <Linker<Zustand>>::new(store.engine());
    // Nicht importierte Host-Funktionen stören nicht; fehlende Imports melden wir klar.
    linker.allow_shadowing(true);
    let r = (|| -> Result<(), wasmi::errors::LinkerError> {
        linker.func_wrap("pizza", "ausgabe", |mut c: Caller<'_, Zustand>, p: i32, n: i32| {
            let t = text(&c, p, n);
            c.data_mut().senke.sende(Ereignis::Ausgabe { text: t, umbruch: true });
        })?;
        linker.func_wrap("pizza", "schreibe", |mut c: Caller<'_, Zustand>, p: i32, n: i32| {
            let t = text(&c, p, n);
            c.data_mut().senke.sende(Ereignis::Ausgabe { text: t, umbruch: false });
        })?;
        linker.func_wrap("pizza", "leeren", |mut c: Caller<'_, Zustand>| {
            c.data_mut().senke.sende(Ereignis::Leeren);
        })?;
        linker.func_wrap(
            "pizza",
            "eingabe",
            |mut c: Caller<'_, Zustand>, _art: i32, _pp: i32, _pn: i32, puffer: i32, kap: i32| -> Result<i32, wasmi::Error> {
                // K-011: Der Prompt wurde vom Modul bereits per `schreibe` ausgegeben – hier nur Info.
                let d = c.data_mut();
                let zeile = match d.wartend.take() {
                    Some(z) => Some(z),
                    None => d.quelle.naechste(),
                };
                let Some(zeile) = zeile else {
                    c.data_mut().senke.sende(Ereignis::Eingabe { text: None });
                    return Ok(-1);
                };
                // K-013: Passt die Zeile nicht in den Puffer, nichts schreiben, Zeile behalten und die
                // benötigte Länge melden – das Modul ruft mit größerem Puffer erneut.
                let n = zeile.len();
                if n > kap.max(0) as usize {
                    c.data_mut().wartend = Some(zeile);
                    return Ok(n as i32);
                }
                let Some(Extern::Memory(mem)) = c.get_export("memory") else {
                    return Err(wasmi::Error::new("Export 'memory' fehlt"));
                };
                mem.write(&mut c, puffer as u32 as usize, zeile.as_bytes())?;
                c.data_mut().senke.sende(Ereignis::Eingabe { text: Some(zeile) });
                Ok(n as i32)
            },
        )?;
        linker.func_wrap("pizza", "fehlerausgabe", |mut c: Caller<'_, Zustand>, p: i32, n: i32| {
            let t = text(&c, p, n);
            c.data_mut().senke.sende(Ereignis::Fehlerausgabe { text: t });
        })?;
        linker.func_wrap(
            "pizza",
            "warnung",
            |mut c: Caller<'_, Zustand>, cp: i32, cn: i32, tp: i32, tn: i32, z: i32, s: i32| {
                let code = text(&c, cp, cn);
                let t = text(&c, tp, tn);
                c.data_mut().senke.sende(Ereignis::Warnung { code, text: t, zeile: pos(z), spalte: pos(s) });
            },
        )?;
        linker.func_wrap(
            "pizza",
            "fehler",
            |mut c: Caller<'_, Zustand>, art: i32, cp: i32, cn: i32, tp: i32, tn: i32, z: i32, s: i32| {
                let code = text(&c, cp, cn);
                let t = text(&c, tp, tn);
                let art = ARTEN.get(art as usize).copied().unwrap_or("ananas").to_string();
                c.data_mut().senke.sende(Ereignis::Fehler { code, art, text: t, zeile: pos(z), spalte: pos(s), detail: None });
            },
        )?;
        linker.func_wrap("pizza", "panik", |mut c: Caller<'_, Zustand>, p: i32, n: i32| -> Result<(), wasmi::Error> {
            let t = text(&c, p, n);
            let d = c.data_mut();
            d.senke.sende(Ereignis::Panik { text: t });
            d.panik = true;
            // HOST-ABI §2: Host darf sofort abbrechen → Exit 39.
            Err(wasmi::Error::host(PanikAbbruch))
        })?;
        Ok(())
    })();
    if let Err(e) = r {
        return ladefehler(&mut store.data_mut().senke, format!("Linker: {}", e));
    }

    let inst = match linker.instantiate_and_start(&mut *store, module) {
        Ok(i) => i,
        Err(e) => return ladefehler(&mut store.data_mut().senke, format!("Instanziierung fehlgeschlagen: {}", e)),
    };

    // ABI-Version prüfen (falls exportiert).
    if let Ok(f) = inst.get_typed_func::<(), i32>(&*store, "abi_version") {
        match f.call(&mut *store, ()) {
            Ok(ABI_VERSION) => {}
            Ok(v) => {
                return ladefehler(
                    &mut store.data_mut().senke,
                    format!("Unbekannte ABI-Version {} (dieser Host kann ABI {}). Bitte pizza-host aktualisieren.", v, ABI_VERSION),
                )
            }
            Err(e) => return ladefehler(&mut store.data_mut().senke, format!("abi_version: {}", e)),
        }
    }

    // Pflicht-Exports.
    let start = match inst.get_typed_func::<(), i32>(&*store, "start") {
        Ok(f) => f,
        Err(e) => return ladefehler(&mut store.data_mut().senke, format!("Export 'start' fehlt: {}", e)),
    };
    let memory = match inst.get_memory(&*store, "memory") {
        Some(m) => m,
        None => return ladefehler(&mut store.data_mut().senke, "Export 'memory' fehlt".into()),
    };
    let schritte_f = inst.get_typed_func::<(), f64>(&*store, "schritte").ok();
    let zeit_f = inst.get_typed_func::<(), f64>(&*store, "zeitMs").ok();

    let mut vorbereitung = || -> Result<(), wasmi::Error> {
        if let Some(n) = opt.schritt_limit {
            if let Ok(f) = inst.get_typed_func::<f64, ()>(&*store, "limit_setzen") {
                f.call(&mut *store, n)?;
            }
        }
        if let Some(m) = opt.speicher_mib {
            if let Ok(f) = inst.get_typed_func::<i32, ()>(&*store, "speicher_limit_setzen") {
                f.call(&mut *store, m)?;
            }
        }
        if !args.is_empty() {
            let puffer = inst.get_typed_func::<i32, i32>(&*store, "arg_puffer")?;
            let fertig = inst.get_typed_func::<i32, ()>(&*store, "arg_fertig")?;
            for a in args {
                let b = a.as_bytes();
                let p = puffer.call(&mut *store, b.len() as i32)?;
                // Speicher-Ansicht NACH dem Aufruf holen (memory kann gewachsen sein).
                memory.write(&mut *store, p as u32 as usize, b)?;
                fertig.call(&mut *store, b.len() as i32)?;
            }
        }
        Ok(())
    };
    let ergebnis = vorbereitung().and_then(|_| start.call(&mut *store, ()));

    let exit_code = match ergebnis {
        Ok(c) => c,
        Err(_) if store.data().panik => 39,
        Err(e) => {
            store.data_mut().senke.sende(interner_fehler(trap_text(&e)));
            1
        }
    };
    // K-046: nur 0, 1, 2, 3, 39 sind gültig – alles andere ist ein interner Fehler.
    let exit_code = if EXIT_CODES.contains(&exit_code) {
        exit_code
    } else {
        store.data_mut().senke.sende(interner_fehler(format!("ungültiger Exit-Code {} vom Modul", exit_code)));
        1
    };
    let schritte = schritte_f.and_then(|f| f.call(&mut *store, ()).ok()).unwrap_or(0.0);
    let zeit_ms = zeit_f.and_then(|f| f.call(&mut *store, ()).ok()).unwrap_or(0.0);
    store.data_mut().senke.sende(Ereignis::Ende { exit_code, schritte, zeit_ms });
    exit_code
}

fn trap_text(e: &wasmi::Error) -> String {
    e.to_string()
}
