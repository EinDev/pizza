//! Ereignisse (Schema wie ARCHITEKTUR.md §1) und ihre Ausgabe als Text oder JSON-Zeilen.

use std::io::{self, IsTerminal, Write};

#[derive(Debug, Clone, PartialEq)]
pub enum Ereignis {
    /// `umbruch: false` für `Bote.schreibe` (EINGABE.md §2).
    Ausgabe { text: String, umbruch: bool },
    /// Gelesene Eingabezeile (`None` = EOF).
    Eingabe { text: Option<String> },
    Leeren,
    Fehlerausgabe { text: String },
    Warnung { code: String, text: String, zeile: Option<i32>, spalte: Option<i32> },
    Fehler { code: String, art: String, text: String, zeile: Option<i32>, spalte: Option<i32> },
    Panik { text: String },
    Ende { exit_code: i32, schritte: f64, zeit_ms: f64 },
}

/// JSON-String-Escape wie `JSON.stringify` (nur `"`, `\`, Steuerzeichen; Unicode bleibt roh).
pub fn json_text(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\t' => o.push_str("\\t"),
            '\u{8}' => o.push_str("\\b"),
            '\u{c}' => o.push_str("\\f"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

fn json_opt(v: Option<i32>) -> String {
    match v {
        Some(n) => n.to_string(),
        None => "null".into(),
    }
}

/// Zahl wie JS `String(x)` für die in `ende` vorkommenden (ganzzahligen) Werte.
pub fn json_zahl(x: f64) -> String {
    if x.is_finite() && x.fract() == 0.0 && x.abs() < 1e21 {
        format!("{}", x as i64)
    } else if x.is_finite() {
        format!("{}", x)
    } else {
        "null".into()
    }
}

impl Ereignis {
    pub fn als_json(&self) -> String {
        match self {
            Ereignis::Ausgabe { text, umbruch: true } => format!("{{\"typ\":\"ausgabe\",\"text\":{}}}", json_text(text)),
            Ereignis::Ausgabe { text, umbruch: false } => {
                format!("{{\"typ\":\"ausgabe\",\"text\":{},\"umbruch\":false}}", json_text(text))
            }
            Ereignis::Eingabe { text } => format!(
                "{{\"typ\":\"eingabe\",\"text\":{}}}",
                text.as_deref().map(json_text).unwrap_or_else(|| "null".into())
            ),
            Ereignis::Leeren => "{\"typ\":\"leeren\"}".to_string(),
            Ereignis::Fehlerausgabe { text } => {
                format!("{{\"typ\":\"fehlerausgabe\",\"text\":{}}}", json_text(text))
            }
            Ereignis::Warnung { code, text, zeile, spalte } => format!(
                "{{\"typ\":\"warnung\",\"code\":{},\"text\":{},\"zeile\":{},\"spalte\":{}}}",
                json_text(code),
                json_text(text),
                json_opt(*zeile),
                json_opt(*spalte)
            ),
            Ereignis::Fehler { code, art, text, zeile, spalte } => format!(
                "{{\"typ\":\"fehler\",\"code\":{},\"art\":{},\"text\":{},\"zeile\":{},\"spalte\":{}}}",
                json_text(code),
                json_text(art),
                json_text(text),
                json_opt(*zeile),
                json_opt(*spalte)
            ),
            Ereignis::Panik { text } => format!("{{\"typ\":\"panik\",\"text\":{}}}", json_text(text)),
            Ereignis::Ende { exit_code, schritte, zeit_ms } => format!(
                "{{\"typ\":\"ende\",\"exitCode\":{},\"schritte\":{},\"zeitMs\":{}}}",
                exit_code,
                json_zahl(*schritte),
                json_zahl(*zeit_ms)
            ),
        }
    }
}

/// Wohin Ereignisse gehen.
pub enum Senke {
    /// Menschlich lesbar: stdout/stderr wie `bin/pizza.js` (Farbe nur bei TTY und ohne NO_COLOR).
    Konsole { farbe: bool, info: bool },
    /// Eine JSON-Zeile pro Ereignis auf stdout.
    Json,
    /// Sammeln (Tests).
    Sammeln(Vec<Ereignis>),
}

impl Senke {
    pub fn konsole(info: bool) -> Self {
        let farbe = io::stderr().is_terminal() && std::env::var_os("NO_COLOR").is_none();
        Senke::Konsole { farbe, info }
    }

    pub fn sende(&mut self, e: Ereignis) {
        match self {
            Senke::Sammeln(v) => v.push(e),
            Senke::Json => {
                let mut out = io::stdout().lock();
                let _ = writeln!(out, "{}", e.als_json());
                let _ = out.flush();
            }
            Senke::Konsole { farbe, info } => {
                let f = |code: &str, t: &str| {
                    if *farbe {
                        format!("\x1b[{}m{}\x1b[0m", code, t)
                    } else {
                        t.to_string()
                    }
                };
                let pos = |z: &Option<i32>, s: &Option<i32>| match z {
                    Some(z) => match s {
                        Some(s) => format!(" (Zeile {}, Spalte {})", z, s),
                        None => format!(" (Zeile {})", z),
                    },
                    None => String::new(),
                };
                match &e {
                    Ereignis::Ausgabe { text, umbruch } => {
                        let mut out = io::stdout().lock();
                        if *umbruch {
                            let _ = writeln!(out, "{}", text);
                        } else {
                            let _ = write!(out, "{}", text);
                            let _ = out.flush();
                        }
                    }
                    // Kein Echo: das macht das Terminal.
                    Ereignis::Eingabe { .. } => {}
                    Ereignis::Leeren => {
                        let mut out = io::stdout().lock();
                        if out.is_terminal() {
                            let _ = write!(out, "\x1b[2J\x1b[3J\x1b[H");
                        }
                        let _ = out.flush();
                    }
                    Ereignis::Fehlerausgabe { text } => {
                        let _ = io::stdout().flush();
                        let _ = writeln!(io::stderr(), "{}", f("31", text));
                    }
                    Ereignis::Warnung { text, zeile, spalte, .. } => {
                        let _ = io::stdout().flush();
                        let _ = writeln!(io::stderr(), "{}{}", f("33", &format!("⚠ {}", text)), f("90", &pos(zeile, spalte)));
                    }
                    Ereignis::Fehler { art, text, zeile, spalte, .. } => {
                        let _ = io::stdout().flush();
                        let p = if art == "syntax" || art == "pizzafehler" { f("90", &pos(zeile, spalte)) } else { String::new() };
                        let _ = writeln!(io::stderr(), "{}{}", f("1;31", text), p);
                    }
                    Ereignis::Panik { text } => {
                        // Banner nach stderr wie bin/pizza.js und HOST-ABI §7 (Farbe nur bei TTY).
                        let _ = io::stdout().flush();
                        let _ = writeln!(io::stderr(), "{}", f("1;33;41", text));
                    }
                    Ereignis::Ende { exit_code, schritte, zeit_ms } => {
                        let _ = io::stdout().flush();
                        if *info {
                            let _ = writeln!(
                                io::stderr(),
                                "{}",
                                f("90", &format!("— Exit-Code {} · {} Schritte · Uhr {} ms", exit_code, json_zahl(*schritte), json_zahl(*zeit_ms)))
                            );
                        }
                    }
                }
            }
        }
    }
}
