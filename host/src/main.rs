//! pizza-host – nativer Host für kompilierte pizza-Programme (`.pkarton`).
//!
//! ```text
//! pizza-host [--ereignisse-json] [--info] programm.pkarton [args…]
//! pizza-host exe programm.pkarton -o programm.exe
//! ```

use std::path::PathBuf;
use std::process::ExitCode;

use pizzahost::ereignis::Senke;
use pizzahost::{karton, laufen};

const HILFE: &str = "pizza-host – führt kompilierte pizza-Programme (.pkarton) aus

Aufruf:
  pizza-host [--ereignisse-json] [--info] [--schritte=N] programm.pkarton [args…]
  pizza-host exe programm.pkarton -o programm.exe

Optionen:
  --ereignisse-json  alle Ereignisse als JSON-Zeilen auf stdout (inkl. ende)
  --info             am Ende Exit-Code, Schritte und Uhr nach stderr
  --schritte=N       Schrittlimit (Standard: 5000000)
  --hilfe            diese Hilfe";

fn beende(code: i32) -> ExitCode {
    ExitCode::from((code & 0xff) as u8)
}

fn main() -> ExitCode {
    let argv: Vec<String> = std::env::args().skip(1).collect();

    // Eigenständige EXE: angehängtes .pkarton gefunden → alle Argumente gehören dem Programm.
    if let Some(pkarton) = karton::eingebettet() {
        let mut senke = if std::env::var_os("PIZZA_EREIGNISSE_JSON").is_some() { Senke::Json } else { Senke::konsole(false) };
        let code = laufen::fuehre_aus(&pkarton, &argv, &laufen::Optionen::default(), &mut senke);
        return beende(code);
    }

    if argv.first().map(|s| s.as_str()) == Some("exe") {
        return exe_befehl(&argv[1..]);
    }

    let mut json = false;
    let mut info = false;
    let mut opt = laufen::Optionen::default();
    let mut datei: Option<String> = None;
    let mut prog_args = Vec::new();
    for a in argv {
        if datei.is_none() && a.starts_with("--") {
            match a.as_str() {
                "--ereignisse-json" => json = true,
                "--info" => info = true,
                "--hilfe" | "--help" => {
                    println!("{}", HILFE);
                    return ExitCode::SUCCESS;
                }
                s if s.starts_with("--schritte=") => match s[11..].parse::<f64>() {
                    Ok(n) => opt.schritt_limit = Some(n),
                    Err(_) => {
                        eprintln!("Ungültiges Schrittlimit: {}", s);
                        return beende(2);
                    }
                },
                _ => {
                    eprintln!("Unbekannte Option: {}\n\n{}", a, HILFE);
                    return beende(2);
                }
            }
        } else if datei.is_none() {
            datei = Some(a);
        } else {
            prog_args.push(a);
        }
    }
    let Some(datei) = datei else {
        eprintln!("{}", HILFE);
        return beende(2);
    };
    let pkarton = match std::fs::read(&datei) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("Datei nicht lesbar: {} ({})", datei, e);
            return beende(2);
        }
    };
    let mut senke = if json { Senke::Json } else { Senke::konsole(info) };
    beende(laufen::fuehre_aus(&pkarton, &prog_args, &opt, &mut senke))
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
