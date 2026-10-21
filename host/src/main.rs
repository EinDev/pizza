//! pizza-host – nativer Host für kompilierte pizza-Programme (`.pkarton`).
//!
//! ```text
//! pizza-host [optionen] programm.pkarton [args…]
//! pizza-host [--vorrat=ordner] --vorrat-loeschen <name> | --vorrat-loeschen-alle
//! pizza-host exe programm.pkarton -o programm.exe
//! ```
//! Optionen, Texte und Exit-Codes wie `bin/pizza.js` (K-082/K-088); eine EXE (eingebettetes Programm) versteht
//! dieselben Optionen direkt hinter dem Programmnamen, alles ab dem ersten Nicht-Options-Argument geht an `hauptgang`.

use std::path::PathBuf;
use std::process::ExitCode;

use pizzahost::ereignis::Senke;
use pizzahost::{karton, laufen};

const OPTIONEN: &str = "Optionen:
  --saat=N             feste Zufallssaat (ohne Option: echte Saat, Anzeige \"Saat: N\" auf stderr)
  --vorrat=ordner      Vorratskammern in diesem Ordner (Standard: %APPDATA%\\pizza\\vorrat bzw. $XDG_DATA_HOME/pizza/vorrat)
  --kein-vorrat        nichts lesen, nichts speichern (W0101)
  --vorrat-loeschen <name>  Vorratskammer <name> löschen (ohne Programmlauf)
  --vorrat-loeschen-alle    alle Vorratskammern löschen (ohne Programmlauf)
  --eingabe datei      Eingabezeilen aus Datei statt stdin (danach EOF)
  --schritte=N         Schrittlimit (Standard: 5000000)
  --echtzeit=N         Test: Uhr.echt() liefert fest N ms (sonst Systemzeit)
  --info               am Ende Exit-Code, Schritte und Uhr nach stderr
  --debug              technische Details interner Fehler zeigen
  --ereignisse-json    alle Ereignisse als JSON-Zeilen auf stdout (inkl. ende; ohne --saat feste Saat 42)
  --ui-ereignisse d    Theke ohne Fenster: Renderer-Ereignisse aus Datei d (JSON-Lines)
  --hilfe              diese Hilfe";

fn hilfe(eingebettet: bool) -> String {
    if eingebettet {
        let name = std::env::current_exe()
            .ok()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
            .unwrap_or_else(|| "programm".into());
        format!(
            "{n} – pizza-Programm\n\nAufruf:\n  {n} [optionen] [args…]\n  {n} [--vorrat=ordner] --vorrat-loeschen <name>\n  {n} [--vorrat=ordner] --vorrat-loeschen-alle\n\n{o}",
            n = name,
            o = OPTIONEN
        )
    } else {
        format!(
            "pizza-host – führt kompilierte pizza-Programme (.pkarton) aus\n\nAufruf:\n  pizza-host [--info] [--schritte=N] [--saat=N] [--vorrat=ordner | --kein-vorrat] [--eingabe datei] programm.pkarton [args…]\n  pizza-host [--vorrat=ordner] --vorrat-loeschen <name>\n  pizza-host [--vorrat=ordner] --vorrat-loeschen-alle\n  pizza-host exe programm.pkarton -o programm.exe\n\n{}",
            OPTIONEN
        )
    }
}

fn beende(code: i32) -> ExitCode {
    ExitCode::from((code & 0xff) as u8)
}

/// Was `--vorrat-loeschen…` löschen soll (K-088).
enum Loeschen {
    Eine(String),
    Alle,
}

/// Ergebnis der Kommandozeile.
#[derive(Default)]
struct Aufruf {
    json: bool,
    info: bool,
    debug: bool,
    opt: laufen::Optionen,
    vorrat_ordner: Option<PathBuf>,
    kein_vorrat: bool,
    loeschen: Option<Loeschen>,
    datei: Option<String>,
    args: Vec<String>,
}

/// Zahl wie JS `Number(text)` (für `--saat`/`--echtzeit`, wie bin/pizza.js): leer → 0, ungültig → NaN.
fn js_number(t: &str) -> f64 {
    let t = t.trim();
    if t.is_empty() {
        return 0.0;
    }
    for (p, basis) in [("0x", 16), ("0X", 16), ("0o", 8), ("0O", 8), ("0b", 2), ("0B", 2)] {
        if let Some(z) = t.strip_prefix(p) {
            return u128::from_str_radix(z, basis).map(|n| n as f64).unwrap_or(f64::NAN);
        }
    }
    let (vz, rumpf) = match t.strip_prefix('-') {
        Some(r) => (-1.0, r),
        None => (1.0, t.strip_prefix('+').unwrap_or(t)),
    };
    if rumpf == "Infinity" {
        return vz * f64::INFINITY;
    }
    // Rust akzeptiert zusätzlich „inf“/„nan“ – JS nicht.
    if !rumpf.bytes().all(|b| b.is_ascii_digit() || matches!(b, b'.' | b'e' | b'E' | b'+' | b'-')) {
        return f64::NAN;
    }
    rumpf.parse::<f64>().map(|x| vz * x).unwrap_or(f64::NAN)
}

/// Standardordner der Vorratskammern (K-081, wie bin/pizza.js).
fn vorrat_standard_ordner() -> Option<PathBuf> {
    let env = |k: &str| std::env::var_os(k).filter(|v| !v.is_empty()).map(PathBuf::from);
    let basis = if cfg!(windows) {
        env("APPDATA").or_else(|| env("USERPROFILE").map(|h| h.join("AppData").join("Roaming")))?
    } else {
        env("XDG_DATA_HOME").or_else(|| env("HOME").map(|h| h.join(".local").join("share")))?
    };
    Some(basis.join("pizza").join("vorrat"))
}

/// Liest die Optionen (bis zum ersten Nicht-Options-Argument, wie bin/pizza.js). `eingebettet`: kein Dateiname,
/// alle weiteren Argumente gehören dem Programm. `Err` = sofort mit diesem Code beenden (Hilfe/Fehler ausgegeben).
fn lies_aufruf(argv: Vec<String>, eingebettet: bool) -> Result<Aufruf, ExitCode> {
    let mut a = Aufruf::default();
    let mut optionen_zu = false;
    let mut argv = argv.into_iter();
    let fehler = |t: &str| {
        eprintln!("{}", t);
        Err(beende(2))
    };
    while let Some(x) = argv.next() {
        if !optionen_zu && x.starts_with("--") {
            match x.as_str() {
                "--ui-ereignisse" => {
                    let Some(pfad) = argv.next() else {
                        return fehler("--ui-ereignisse braucht eine Datei.");
                    };
                    match std::fs::read_to_string(&pfad) {
                        Ok(t) => {
                            let z = laufen::zeilen(&t).into_iter().filter(|l| !l.trim().is_empty()).collect();
                            a.opt.ui = Some(laufen::Ui::Vorgabe(z));
                        }
                        Err(e) => return fehler(&format!("UI-Ereignisdatei nicht lesbar: {} ({})", pfad, e)),
                    }
                }
                s if s == "--eingabe" || s.starts_with("--eingabe=") => {
                    let pfad = if s == "--eingabe" { argv.next().unwrap_or_default() } else { s[10..].to_string() };
                    if pfad.is_empty() {
                        return fehler("--eingabe braucht eine Datei.");
                    }
                    match std::fs::read_to_string(&pfad) {
                        Ok(t) => a.opt.eingabe = Some(laufen::zeilen(&t)),
                        Err(e) => return fehler(&format!("Eingabedatei nicht lesbar: {} ({})", pfad, e)),
                    }
                }
                "--ereignisse-json" => a.json = true,
                "--info" => a.info = true,
                "--debug" => a.debug = true,
                "--kein-vorrat" => a.kein_vorrat = true,
                "--vorrat-loeschen-alle" => a.loeschen = Some(Loeschen::Alle),
                s if s == "--vorrat-loeschen" || s.starts_with("--vorrat-loeschen=") => {
                    let n = if s == "--vorrat-loeschen" { argv.next() } else { Some(s[18..].to_string()) };
                    let Some(n) = n else {
                        return fehler("--vorrat-loeschen braucht einen Kammernamen (alle Kammern: --vorrat-loeschen-alle).");
                    };
                    a.loeschen = Some(Loeschen::Eine(n));
                }
                s if s.starts_with("--vorrat=") => a.vorrat_ordner = Some(PathBuf::from(&s[9..])),
                s if s.starts_with("--saat=") => {
                    let n = js_number(&s[7..]);
                    if !n.is_finite() || n.fract() != 0.0 {
                        return fehler("--saat braucht eine Ganzzahl.");
                    }
                    a.opt.saat = Some(if n == 0.0 { 0.0 } else { n });
                }
                s if s.starts_with("--echtzeit=") => {
                    let n = js_number(&s[11..]);
                    if !n.is_finite() {
                        return fehler("--echtzeit braucht eine Zahl (ms seit 1970).");
                    }
                    a.opt.echtzeit = Some(n);
                }
                s if s.starts_with("--schritte=") => match s[11..].parse::<f64>() {
                    Ok(n) => a.opt.schritt_limit = Some(n),
                    Err(_) => return fehler(&format!("Ungültiges Schrittlimit: {}", s)),
                },
                "--hilfe" | "--help" => {
                    println!("{}", hilfe(eingebettet));
                    return Err(ExitCode::SUCCESS);
                }
                _ => return fehler(&format!("Unbekannte Option: {}\n\n{}", x, hilfe(eingebettet))),
            }
        } else if !eingebettet && a.datei.is_none() {
            optionen_zu = true;
            a.datei = Some(x);
        } else {
            optionen_zu = true;
            a.args.push(x);
        }
    }
    Ok(a)
}

/// `--vorrat-loeschen <name>` / `--vorrat-loeschen-alle` (K-088): gleiche Texte und Exit-Codes wie bin/pizza.js.
fn vorrat_loeschen(ordner: Option<PathBuf>, was: Loeschen) -> ExitCode {
    let gueltig = |n: &str| (1..=40).contains(&n.len()) && n.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    let ordner = ordner.unwrap_or_default();
    match was {
        Loeschen::Alle => {
            if let Ok(eintraege) = std::fs::read_dir(&ordner) {
                for e in eintraege.flatten() {
                    let name = e.file_name().to_string_lossy().into_owned();
                    if let Some(k) = name.strip_suffix(".json") {
                        if gueltig(k) {
                            let _ = std::fs::remove_file(e.path());
                        }
                    }
                }
            }
            println!("Alle Vorräte gelöscht.");
            ExitCode::SUCCESS
        }
        Loeschen::Eine(n) => {
            if !gueltig(&n) {
                eprintln!("Ungültiger Kammername '{}' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).", n);
                return beende(2);
            }
            let datei = ordner.join(format!("{}.json", n));
            if !datei.exists() {
                println!("Vorrat '{}' gibt es nicht.", n);
                return ExitCode::SUCCESS;
            }
            if std::fs::remove_file(&datei).is_err() {
                eprintln!("Vorrat '{}' konnte nicht gelöscht werden.", n);
                return beende(1);
            }
            println!("Vorrat '{}' gelöscht.", n);
            ExitCode::SUCCESS
        }
    }
}

/// Zufällige Saat (K-077): 32 Bit aus dem zufällig verschlüsselten Hasher der Standardbibliothek und der Uhrzeit.
fn echte_saat() -> f64 {
    use std::hash::{BuildHasher, Hasher};
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    if let Ok(d) = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        h.write_u128(d.as_nanos());
    }
    h.write_u32(std::process::id());
    let x = h.finish();
    ((x ^ (x >> 32)) as u32) as f64
}

fn main() -> ExitCode {
    let argv: Vec<String> = std::env::args().skip(1).collect();

    // Eigenständige EXE: angehängtes .pkarton gefunden → gleiche Optionen wie die CLI, der Rest gehört dem Programm.
    let eingebettet = karton::eingebettet();
    if eingebettet.is_none() && argv.first().map(|s| s.as_str()) == Some("exe") {
        return exe_befehl(&argv[1..]);
    }
    let mut a = match lies_aufruf(argv, eingebettet.is_some()) {
        Ok(a) => a,
        Err(code) => return code,
    };
    let ordner = a.vorrat_ordner.take().or_else(vorrat_standard_ordner);
    if let Some(was) = a.loeschen.take() {
        return vorrat_loeschen(ordner, was);
    }
    let (pkarton, json) = match eingebettet {
        Some(p) => (p, a.json || std::env::var_os("PIZZA_EREIGNISSE_JSON").is_some()),
        None => {
            let Some(datei) = a.datei.take() else {
                eprintln!("{}", hilfe(false));
                return beende(2);
            };
            match std::fs::read(&datei) {
                Ok(b) => (b, a.json),
                Err(e) => {
                    eprintln!("Datei nicht lesbar: {} ({})", datei, e);
                    return beende(2);
                }
            }
        }
    };
    let mut opt = a.opt;
    // K-081: eine Datei je Kammer im Nutzer-Datenordner; --kein-vorrat → nur im Speicher (W0101).
    opt.vorrat = if a.kein_vorrat { None } else { ordner };
    // K-077: ohne --saat echte Saat + „Saat: N“; im JSON-Modus (Maschinen/Tests) wie fehlendes optionen.zufallsSaat → 42.
    if opt.saat.is_none() && !json {
        opt.saat = Some(echte_saat());
        opt.saat_zeigen = true;
    }
    let senke = if json {
        Senke::Json
    } else {
        match Senke::konsole(a.info) {
            Senke::Konsole { farbe, info, .. } => Senke::Konsole { farbe, info, debug: a.debug },
            s => s,
        }
    };
    beende(ausfuehren(pkarton, a.args, opt, senke))
}

/// Führt das Programm aus – mit Theke-Fenster (eigener Programm-Thread, Fenster im Hauptthread),
/// sofern das Feature aktiv ist und keine vorgegebenen UI-Ereignisse genutzt werden.
fn ausfuehren(pkarton: Vec<u8>, args: Vec<String>, opt: laufen::Optionen, senke: Senke) -> i32 {
    // Maschinenlesbarer Modus (--ereignisse-json, Differenztests) öffnet kein Fenster, außer PIZZA_THEKE=1:
    // ohne --ui-ereignisse gilt dann „kein Renderer“ (W0100) – wie im Interpreter ohne uiEreignisse.
    #[cfg(feature = "theke")]
    let fenster_erlaubt = !matches!(senke, Senke::Json) || std::env::var("PIZZA_THEKE").map(|v| v == "1").unwrap_or(false);
    #[cfg(feature = "theke")]
    if opt.ui.is_none() && fenster_erlaubt {
        return pizzahost::theke::starte(move |ui| {
            let mut opt = opt;
            let mut senke = senke;
            opt.ui = ui;
            laufen::fuehre_aus(&pkarton, &args, opt, &mut senke)
        });
    }
    let mut senke = senke;
    laufen::fuehre_aus(&pkarton, &args, opt, &mut senke)
}

fn exe_befehl(args: &[String]) -> ExitCode {
    let mut eingabe: Option<&str> = None;
    let mut ausgabe: Option<PathBuf> = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "-o" if i + 1 < args.len() => {
                ausgabe = Some(PathBuf::from(&args[i + 1]));
                i += 1;
            }
            s if eingabe.is_none() && !s.starts_with('-') => eingabe = Some(s),
            s => {
                eprintln!("Unerwartetes Argument: {}\nAufruf: pizza-host exe programm.pkarton -o programm.exe", s);
                return beende(2);
            }
        }
        i += 1;
    }
    let Some(eingabe) = eingabe else {
        eprintln!("Aufruf: pizza-host exe programm.pkarton -o programm.exe");
        return beende(2);
    };
    let ausgabe = ausgabe.unwrap_or_else(|| {
        let mut p = PathBuf::from(eingabe);
        p.set_extension(std::env::consts::EXE_EXTENSION);
        p
    });
    let pkarton = match std::fs::read(eingabe) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("Datei nicht lesbar: {} ({})", eingabe, e);
            return beende(2);
        }
    };
    if let Err(e) = laufen::pruefe(&pkarton) {
        eprintln!("Kein gültiges .pkarton: {}", e);
        return beende(2);
    }
    match karton::schreibe_exe(&pkarton, &ausgabe) {
        Ok(()) => {
            eprintln!("EXE geschrieben: {}", ausgabe.display());
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("EXE konnte nicht geschrieben werden: {} ({})", ausgabe.display(), e);
            beende(2)
        }
    }
}
