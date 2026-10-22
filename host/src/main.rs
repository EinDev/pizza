//! pizza-host – nativer Host für kompilierte pizza-Programme (`.pkarton`).
//!
//! ```text
//! pizza-host [optionen] programm.pkarton [args…]
//! pizza-host [--vorrat=ordner] --vorrat-loeschen <kennung> | --vorrat-loeschen-alle
//! pizza-host exe programm.pkarton -o programm.exe
//! ```
//! Optionen, Texte und Exit-Codes wie `bin/pizza.js` (K-082/K-088); eine EXE (eingebettetes Programm) versteht
//! dieselben Optionen direkt hinter dem Programmnamen, alles ab dem ersten Nicht-Options-Argument geht an `hauptgang`;
//! `--` beendet die Optionen (z. B. `programm.exe -- --x`), alles danach geht unverändert an `hauptgang`.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use pizzahost::ereignis::Senke;
use pizzahost::{karton, konsole, laufen};

const OPTIONEN: &str = "Optionen:
  --saat=N             feste Zufallssaat (ohne Option: echte Saat, Anzeige \"Saat: N\" auf stderr)
  --vorrat=ordner      Vorratskammern in diesem Ordner (Standard: %APPDATA%\\pizza\\vorrat bzw. $XDG_DATA_HOME/pizza/vorrat)
  --kein-vorrat        nichts lesen, nichts speichern (W0101)
  --vorrat-loeschen <kennung>  Vorratskammer löschen (ohne Programmlauf); Kennung name oder raum/name (K-106)
  --vorrat-loeschen-alle    alle Vorratskammern löschen, auch die mit Namensraum (ohne Programmlauf)
  --eingabe datei      Eingabezeilen aus Datei statt stdin (danach EOF)
  --schritte=N         Schrittlimit (Standard: 5000000)
  --koeche=N           Köche der Küchenbrigade: auto (Standard, logische Kerne, höchstens 16) oder 1 … 64 (1 = aus)
  --echtzeit=N         Test: Uhr.echt() liefert fest N ms (sonst Systemzeit)
  --kuechen-chaos=N    Test: Stücke der Küchenbrigade in zufälliger Reihenfolge (Saat N) – Ergebnis muss gleich sein
  --info               am Ende Exit-Code, Schritte und Uhr nach stderr (bei Küchenbrigade auch Köche: N)
  --debug              technische Details interner Fehler zeigen
  --ereignisse-json    alle Ereignisse als JSON-Zeilen auf stdout (inkl. ende; ohne --saat feste Saat 42)
  --ui-ereignisse d    Theke/Herd ohne Fenster: Renderer-Ereignisse aus Datei d (JSON-Lines, z. B. takt-Zeilen)
  --herd-bilder=ordner Herd ohne Fenster: gesendete Bilder als PNG (bild-<nr>.png, Software-Adapter); ohne
                       --ui-ereignisse Takte bis Bild 60 bzw. bis zur höchsten Nummer aus --herd-nur
  --herd-nur=n,m       mit --herd-bilder: nur diese Bildnummern speichern
  --herd-messung       Herd: je Sekunde Bildzeit, Anteil Programm/Kern/Glut, Draw-Calls, Instanzen auf stderr
  --hilfe              diese Hilfe
  --version            Version anzeigen
  --                   Ende der Optionen: alles danach geht unverändert an hauptgang(args)
                       (nur das erste -- zählt, ein späteres bleibt Argument)";

fn hilfe(eingebettet: bool) -> String {
    if eingebettet {
        let name = std::env::current_exe()
            .ok()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
            .unwrap_or_else(|| "programm".into());
        format!(
            "{n} – pizza-Programm\n\nAufruf:\n  {n} [optionen] [--] [args…]\n  {n} [--vorrat=ordner] --vorrat-loeschen <name>\n  {n} [--vorrat=ordner] --vorrat-loeschen-alle\n\n{o}",
            n = name,
            o = OPTIONEN
        )
    } else {
        format!(
            "pizza-host – führt kompilierte pizza-Programme (.pkarton) aus\n\nAufruf:\n  pizza-host [--info] [--schritte=N] [--saat=N] [--koeche=N] [--vorrat=ordner | --kein-vorrat] [--eingabe datei] programm.pkarton [--] [args…]\n  pizza-host [--vorrat=ordner] --vorrat-loeschen <name>\n  pizza-host [--vorrat=ordner] --vorrat-loeschen-alle\n  pizza-host exe programm.pkarton -o programm.exe\n\n{}",
            OPTIONEN
        )
    }
}

/// `--version`: Sprach-/Host-Version (= Paketversion, gleich `PizzaLang.version`).
fn version(eingebettet: bool) -> String {
    let v = env!("CARGO_PKG_VERSION");
    if eingebettet {
        let name = std::env::current_exe()
            .ok()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
            .unwrap_or_else(|| "programm".into());
        format!("{} – pizza-Programm (pizza {})", name, v)
    } else {
        format!("pizza-host {} (pizza {})", v, v)
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
    /// `--herd-bilder=ordner`: Offscreen-PNGs statt Fenster.
    herd_bilder: Option<PathBuf>,
    /// `--herd-nur=n,m`: nur diese Bildnummern speichern.
    herd_nur: Option<Vec<u64>>,
    /// `--herd-messung`.
    herd_messung: bool,
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
    let mut strich = false;
    let mut argv = argv.into_iter();
    let fehler = |t: &str| {
        eprintln!("{}", t);
        Err(beende(2))
    };
    while let Some(x) = argv.next() {
        // `--` beendet die Optionen (wie bin/pizza.js): das erste `--` vor dem ersten Programmargument wird verbraucht,
        // alles danach geht unverändert an `hauptgang(args)`; ein späteres `--` bleibt Argument.
        if x == "--" && !strich && a.args.is_empty() {
            strich = true;
            optionen_zu = true;
            continue;
        }
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
                "--herd-messung" => a.herd_messung = true,
                s if s.starts_with("--herd-bilder=") => {
                    if s.len() == 14 {
                        return fehler("--herd-bilder braucht einen Ordner.");
                    }
                    a.herd_bilder = Some(PathBuf::from(&s[14..]));
                }
                s if s.starts_with("--herd-nur=") => {
                    let nr: Result<Vec<u64>, _> = s[11..].split(',').map(|n| n.trim().parse::<u64>()).collect();
                    match nr {
                        Ok(v) if !v.is_empty() => a.herd_nur = Some(v),
                        _ => return fehler("--herd-nur braucht Bildnummern, z. B. --herd-nur=1,60."),
                    }
                }
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
                s if s.starts_with("--koeche=") => match &s[9..] {
                    "auto" => a.opt.koeche = None,
                    n => match n.parse::<usize>() {
                        Ok(k) if (1..=64).contains(&k) => a.opt.koeche = Some(k),
                        _ => return fehler("--koeche braucht auto oder eine Zahl von 1 bis 64."),
                    },
                },
                s if s.starts_with("--kuechen-chaos=") => match s[16..].parse::<u64>() {
                    Ok(n) => a.opt.kuechen_chaos = Some(n),
                    Err(_) => return fehler("--kuechen-chaos braucht eine Ganzzahl ≥ 0."),
                },
                s if s.starts_with("--schritte=") => match s[11..].parse::<f64>() {
                    Ok(n) => a.opt.schritt_limit = Some(n),
                    Err(_) => return fehler(&format!("Ungültiges Schrittlimit: {}", s)),
                },
                "--hilfe" | "--help" => {
                    println!("{}", hilfe(eingebettet));
                    return Err(ExitCode::SUCCESS);
                }
                "--version" => {
                    println!("{}", version(eingebettet));
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

/// Löscht in `ordner` alle `<name>.json` mit gültigem Kammernamen (K-088); Fehler werden ignoriert.
fn vorrat_kammern_loeschen(ordner: &Path) {
    let Ok(eintraege) = std::fs::read_dir(ordner) else { return };
    for e in eintraege.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if let Some(k) = name.strip_suffix(".json") {
            if laufen::vorrat_teil_gueltig(k) {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
}

/// `--vorrat-loeschen <kennung>` / `--vorrat-loeschen-alle` (K-088/K-106): gleiche Texte und Exit-Codes wie bin/pizza.js.
/// Kennung `name` oder `raum/name` (geprüft über `laufen::vorrat_kennung`, Pfad nur aus den geprüften Teilen);
/// `-alle` erfasst zusätzlich `<ordner>/<raum>/<name>.json` (eine Ebene tief) und entfernt leer gewordene Raum-Ordner.
fn vorrat_loeschen(ordner: Option<PathBuf>, was: Loeschen) -> ExitCode {
    let ordner = ordner.unwrap_or_default();
    match was {
        Loeschen::Alle => {
            vorrat_kammern_loeschen(&ordner);
            if let Ok(eintraege) = std::fs::read_dir(&ordner) {
                for e in eintraege.flatten() {
                    let raum = e.file_name().to_string_lossy().into_owned();
                    // Nur echte Ordner (keine Verknüpfungen) mit gültigem Raumnamen, nur eine Ebene tief.
                    if laufen::vorrat_teil_gueltig(&raum) && e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        let raum_ordner = ordner.join(&raum);
                        vorrat_kammern_loeschen(&raum_ordner);
                        // Nur leer gewordene Raum-Ordner verschwinden (remove_dir scheitert sonst – ignoriert).
                        let _ = std::fs::remove_dir(&raum_ordner);
                    }
                }
            }
            println!("Alle Vorräte gelöscht.");
            ExitCode::SUCCESS
        }
        Loeschen::Eine(n) => {
            let Some(datei) = laufen::vorrat_pfad(&ordner, &n) else {
                eprintln!("Ungültiger Kammername '{}' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen, mit Namensraum 'raum/name').", n);
                return beende(2);
            };
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
    // PIZZA_KEIN_DIALOG (Tests/CI): Windows-Fehlerdialoge aus, bevor irgendetwas schiefgehen kann.
    konsole::dialoge_abschalten_falls_gewuenscht();
    // Theke-EXE (Subsystem WINDOWS) aus einem Terminal gestartet → Ausgaben dorthin (vor jeder Ausgabe).
    konsole::anhaengen();
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
    let ist_exe = eingebettet.is_some();
    let debug = a.debug;
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
    let herd = HerdAufruf { bilder: a.herd_bilder.take(), nur: a.herd_nur.take(), messung: a.herd_messung };
    beende(ausfuehren(pkarton, ist_exe, debug, a.args, opt, senke, herd))
}

/// Herd-Optionen der Kommandozeile.
struct HerdAufruf {
    bilder: Option<PathBuf>,
    nur: Option<Vec<u64>>,
    messung: bool,
}

/// Programm mit Gruppe herd (SPEC §18, HERD.md §7.1, K-130):
/// - `--herd-bilder=ordner`: fensterlos, Offscreen-PNGs (Takte aus `--ui-ereignisse`, sonst bis Bild 60 / höchstes `--herd-nur`);
/// - Fensterbetrieb (Standard): Vorprüfung vor dem ersten Wasm-Befehl (Anzeige, Grafikadapter) → Meldung + Exit 2, sonst
///   Programm-Thread + winit-Fenster im Hauptthread;
/// - fensterlos mit W0104: JSON-Modus (außer `PIZZA_HERD=1`), `--ui-ereignisse`, `PIZZA_HERD=0`, Build ohne Feature `herd`.
#[allow(unused_variables, unused_mut)]
fn ausfuehren_herd(pkarton: Vec<u8>, debug: bool, args: Vec<String>, mut opt: laufen::Optionen, mut senke: Senke, herd: HerdAufruf) -> i32 {
    let messung = herd.messung.then(|| std::sync::Arc::new(pizzahost::herd::Messung::default()));
    opt.herd_messung = messung.clone();
    #[cfg(feature = "herd")]
    {
        if let Some(ordner) = herd.bilder {
            if opt.ui.is_none() {
                let bis = herd.nur.as_ref().and_then(|n| n.iter().max().copied()).unwrap_or(60);
                opt.ui = Some(laufen::Ui::Vorgabe(pizzahost::herd_fenster::offscreen_takte(bis)));
            }
            opt.herd = Some(pizzahost::herd_fenster::offscreen(ordner, herd.nur, messung));
            return laufen::fuehre_aus(&pkarton, &args, opt, &mut senke);
        }
        let fenster_erlaubt = !matches!(senke, Senke::Json) || std::env::var("PIZZA_HERD").map(|v| v == "1").unwrap_or(false);
        if opt.ui.is_none() && fenster_erlaubt && !pizzahost::anzeige::herd_abgeschaltet() {
            let el = match pizzahost::herd_fenster::vorpruefung() {
                Ok(el) => el,
                Err((meldung, detail)) => return pizzahost::anzeige::abbruch(meldung, detail.as_deref(), debug),
            };
            return pizzahost::herd_fenster::starte(el, debug, messung, move |ui, anbindung| {
                let mut opt = opt;
                let mut senke = senke;
                opt.ui = Some(ui);
                opt.herd = Some(anbindung);
                laufen::fuehre_aus(&pkarton, &args, opt, &mut senke)
            });
        }
    }
    #[cfg(not(feature = "herd"))]
    if herd.bilder.is_some() {
        eprintln!("Dieser pizza-host wurde ohne Herd-Fenster gebaut (Feature herd) – --herd-bilder geht damit nicht.");
        return 2;
    }
    laufen::fuehre_aus(&pkarton, &args, opt, &mut senke)
}

/// Führt das Programm aus – mit Theke-Fenster (eigener Programm-Thread, Fenster im Hauptthread),
/// sofern das Feature aktiv ist und keine vorgegebenen UI-Ereignisse genutzt werden.
/// Linux-Starter (Feature `starter`): Programme mit Theke übernimmt der eingebettete Theke-Teil (src/starter.rs).
#[allow(unused_variables)]
fn ausfuehren(pkarton: Vec<u8>, ist_exe: bool, debug: bool, args: Vec<String>, opt: laufen::Optionen, senke: Senke, herd: HerdAufruf) -> i32 {
    // Herd zuerst: auch der Linux-Starter führt Herd-Programme selbst aus (winit/wgpu laden alles per dlopen, K-130),
    // nie über den Theke-Teil. Theke + Herd in einem Programm ist P0013 (kommt nie bis hierher) – dann gilt der Herd.
    if laufen::braucht_herd(&pkarton) {
        return ausfuehren_herd(pkarton, debug, args, opt, senke, herd);
    }
    // Maschinenlesbarer Modus (--ereignisse-json, Differenztests) öffnet kein Fenster, außer PIZZA_THEKE=1:
    // ohne --ui-ereignisse gilt dann „kein Renderer“ (W0100) – wie im Interpreter ohne uiEreignisse.
    // Ohne Feature `theke`/`starter` (Entwickler-Build `--no-default-features`) ebenfalls W0100.
    #[cfg(any(feature = "theke", feature = "starter"))]
    let fenster_erlaubt = !matches!(senke, Senke::Json) || std::env::var("PIZZA_THEKE").map(|v| v == "1").unwrap_or(false);
    // Starter: vor dem ersten Wasm-Befehl entscheiden (gleiches Kriterium wie das PE-Subsystem: Importgruppe theke).
    // Fehlt WebKitGTK oder die Anzeige → Meldung + Exit 2 (K-083/K-096); sonst ersetzt der Theke-Teil diesen Prozess
    // (gleiche Argumente).
    #[cfg(all(feature = "starter", not(feature = "theke"), target_os = "linux"))]
    if opt.ui.is_none() && fenster_erlaubt && !pizzahost::anzeige::theke_abgeschaltet() && laufen::braucht_theke(&pkarton) {
        return pizzahost::starter::theke_starten(ist_exe.then_some(&pkarton[..]), debug);
    }
    #[cfg(feature = "theke")]
    if opt.ui.is_none() && fenster_erlaubt {
        // K-096 (Nutzerentscheidung): Programm mit Theke, aber kein Fenster möglich (keine Anzeige, WebView2 fehlt)
        // → Abbruch vor dem ersten Wasm-Befehl statt W0100. `PIZZA_THEKE=0` (Tests/CI) bleibt fensterlos (W0100).
        // Programme ohne Theke laufen immer, auch ohne Anzeige.
        if !pizzahost::anzeige::theke_abgeschaltet() && laufen::braucht_theke(&pkarton) {
            if let Err((meldung, detail)) = pizzahost::theke::fenster_moeglich() {
                return pizzahost::anzeige::abbruch(meldung, detail.as_deref(), debug);
            }
        }
        return pizzahost::theke::starte(debug, move |ui| {
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
    // PE-Subsystem WINDOWS für Programme mit Fenster (Theke oder Herd).
    match karton::schreibe_exe(&pkarton, laufen::braucht_fenster(&pkarton), &ausgabe) {
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
