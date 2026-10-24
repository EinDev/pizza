//! Ereignisse (Schema wie ARCHITEKTUR.md §1) und ihre Ausgabe als Text oder JSON-Zeilen.

use std::io::{self, IsTerminal, Write};

#[derive(Debug, Clone, PartialEq)]
pub enum Ereignis {
    /// `umbruch: false` für `Bote.schreibe` (EINGABE.md §2).
    Ausgabe { text: String, umbruch: bool },
    /// Gelesene Eingabezeile (`None` = EOF).
    Eingabe { text: Option<String> },
    Leeren,
    /// Theke-Nachricht an den Renderer (rohes JSON-Objekt, THEKE.md §3/§4).
    Ui { nachricht: String },
    Fehlerausgabe { text: String },
    /// `datei` (SPEC §2.6, HOST-ABI v2): Projektpfad der Datei zu `zeile`/`spalte`, `None` bei Ein-Datei-Programmen.
    Warnung { code: String, text: String, datei: Option<String>, zeile: Option<i32>, spalte: Option<i32> },
    /// `detail`: optionale motorspezifische Einzelheiten (K-014), nicht Teil des Vergleichs.
    Fehler { code: String, art: String, text: String, datei: Option<String>, zeile: Option<i32>, spalte: Option<i32>, detail: Option<String> },
    Panik { text: String },
    /// Änderung einer Vorratskammer (K-080): `aenderung` = rohes JSON `{"schluessel":…,"wert":…}` vom Modul.
    Vorrat { name: String, aenderung: String },
    /// Herd-Fenster-Ereignis (SPEC §18.7, HOST-ABI §2 `herd_senden`): rohes JSON des Moduls **ohne** `typ`, `art` zuerst
    /// (`{"art":"bild","bildnummer":…,"szene":…,"paket":…}`) → `{"typ":"herd","art":…,…}`; Bildpaket-Bytes nie im Ereignis.
    Herd { daten: String },
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

fn json_opt_text(v: &Option<String>) -> String {
    match v {
        Some(t) => json_text(t),
        None => "null".into(),
    }
}

fn json_opt(v: Option<i32>) -> String {
    match v {
        Some(n) => n.to_string(),
        None => "null".into(),
    }
}

/// Zahl wie JS `String(x)` (ECMAScript Number::toString, kürzeste Rundreise-Darstellung):
/// `1e+21`, `1e-7`, `-0` → `0`, `0.30000000000000004`. In JSON werden NaN/±Infinity zu `null` (wie `JSON.stringify`).
pub fn js_zahl(x: f64) -> String {
    if x.is_nan() {
        return "NaN".into();
    }
    if x == 0.0 {
        return "0".into();
    }
    if x.is_infinite() {
        return if x > 0.0 { "Infinity".into() } else { "-Infinity".into() };
    }
    let vorzeichen = if x < 0.0 { "-" } else { "" };
    // Rust liefert mit {:e} die kürzesten Ziffern, die eindeutig zurückführen: "d.ddde±x".
    let e = format!("{:e}", x.abs());
    let (mantisse, exp) = e.split_once('e').unwrap_or((&e, "0"));
    let ziffern: String = mantisse.chars().filter(|c| c.is_ascii_digit()).collect();
    let k = ziffern.len() as i32;
    let n = exp.parse::<i32>().unwrap_or(0) + 1;
    let rumpf = if k <= n && n <= 21 {
        format!("{}{}", ziffern, "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &ziffern[..n as usize], &ziffern[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{}", "0".repeat((-n) as usize), ziffern)
    } else {
        let e = n - 1;
        let es = if e >= 0 { format!("+{}", e) } else { e.to_string() };
        if k == 1 {
            format!("{}e{}", ziffern, es)
        } else {
            format!("{}.{}e{}", &ziffern[..1], &ziffern[1..], es)
        }
    };
    format!("{}{}", vorzeichen, rumpf)
}

/// Zahl als JSON-Wert wie `JSON.stringify`.
pub fn json_zahl(x: f64) -> String {
    if x.is_finite() {
        js_zahl(x)
    } else {
        "null".into()
    }
}

#[cfg(test)]
mod tests {
    use super::js_zahl;

    #[test]
    fn zahlen_wie_js() {
        let faelle: [(f64, &str); 16] = [
            (0.0, "0"),
            (-0.0, "0"),
            (160.0, "160"),
            (-3.0, "-3"),
            (0.1 + 0.2, "0.30000000000000004"),
            (1e21, "1e+21"),
            (1e20, "100000000000000000000"),
            (123456789012345680000.0, "123456789012345680000"),
            (1e-7, "1e-7"),
            (1.5e-7, "1.5e-7"),
            (0.000001, "0.000001"),
            (10.5, "10.5"),
            (1.7976931348623157e308, "1.7976931348623157e+308"),
            (5e-324, "5e-324"),
            (f64::NAN, "NaN"),
            (f64::NEG_INFINITY, "-Infinity"),
        ];
        for (x, s) in faelle {
            assert_eq!(js_zahl(x), s, "{:?}", x);
        }
    }

    /// K-083: gleiche Meldungszeile wie `meldungText` in bin/pizza.js.
    #[test]
    fn meldung_wie_cli() {
        let m = |t: &str, z: Option<i32>, s: Option<i32>| super::meldung_text(t, None, z, s);
        let w = "W0101: Keine Vorratskammer verfügbar – Zustand wird nicht gespeichert.";
        assert_eq!(m(w, Some(1), Some(19)), format!("{} (Zeile 1, Spalte 19)", w));
        assert_eq!(m(w, None, Some(19)), w);
        assert_eq!(m("W0032: x", Some(2), None), "W0032: x (Zeile 2)");
        let a = "Ungefangene Ananas – RechenAnanas: Durch null teilen? Das ergibt keine Stücke.";
        assert_eq!(m(&format!("{} (Zeile 4)", a), Some(4), Some(1)), format!("{} (Zeile 4, Spalte 1)", a));
        // andere Zeile im Text → nicht ersetzen, anhängen
        assert_eq!(m(&format!("{} (Zeile 3)", a), Some(4), Some(1)), format!("{} (Zeile 3) (Zeile 4, Spalte 1)", a));
        assert_eq!(m("x(Zeile 4)", Some(4), Some(1)), "x(Zeile 4) (Zeile 4, Spalte 1)");
        let p = "PizzaFehler P0001: Erwartet ';' nach Anweisung, gefunden 'Bote'";
        assert_eq!(m(p, Some(1), Some(13)), format!("{} (Zeile 1, Spalte 13)", p));
        let l = "PizzaFehler P0002: Die Pizza ist noch im Ofen. (Schrittlimit erreicht – Endlosschleife?)";
        assert_eq!(m(l, Some(1), Some(1)), format!("{} (Zeile 1, Spalte 1)", l));
        // SPEC §2.6: mit Datei (auch für die Hauptdatei eines Mehrdatei-Programms), Datei ohne Zeile
        let md = super::meldung_text;
        assert_eq!(md("W0004: x", Some("hauptgang.pizza"), Some(3), Some(1)), "W0004: x (hauptgang.pizza, Zeile 3, Spalte 1)");
        assert_eq!(md("PizzaFehler P0015: y", Some("pizza.json"), None, None), "PizzaFehler P0015: y (pizza.json)");
        let n = "Ungefangene Ananas – StreitAnanas: z";
        assert_eq!(md(&format!("{} (rezepte/teig.pizza, Zeile 12)", n), Some("rezepte/teig.pizza"), Some(12), Some(5)), format!("{} (rezepte/teig.pizza, Zeile 12, Spalte 5)", n));
        assert_eq!(md(&format!("{} (Zeile 12)", n), Some("hauptgang.pizza"), Some(12), Some(5)), format!("{} (hauptgang.pizza, Zeile 12, Spalte 5)", n));
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
            Ereignis::Ui { nachricht } => format!("{{\"typ\":\"ui\",\"nachricht\":{}}}", nachricht.trim()),
            Ereignis::Fehlerausgabe { text } => {
                format!("{{\"typ\":\"fehlerausgabe\",\"text\":{}}}", json_text(text))
            }
            // SPEC §2.6: `datei` steht immer im Ereignis, direkt vor `zeile`
            Ereignis::Warnung { code, text, datei, zeile, spalte } => format!(
                "{{\"typ\":\"warnung\",\"code\":{},\"text\":{},\"datei\":{},\"zeile\":{},\"spalte\":{}}}",
                json_text(code),
                json_text(text),
                json_opt_text(datei),
                json_opt(*zeile),
                json_opt(*spalte)
            ),
            Ereignis::Fehler { code, art, text, datei, zeile, spalte, detail } => format!(
                "{{\"typ\":\"fehler\",\"code\":{},\"art\":{},\"text\":{},\"datei\":{},\"zeile\":{},\"spalte\":{}{}}}",
                json_text(code),
                json_text(art),
                json_text(text),
                json_opt_text(datei),
                json_opt(*zeile),
                json_opt(*spalte),
                match detail {
                    Some(d) => format!(",\"detail\":{}", json_text(d)),
                    None => String::new(),
                }
            ),
            Ereignis::Panik { text } => format!("{{\"typ\":\"panik\",\"text\":{}}}", json_text(text)),
            Ereignis::Vorrat { name, aenderung } => {
                // {"typ":"vorrat","name":…,"schluessel":…,"wert":…} – Felder aus dem Änderungsobjekt des Moduls.
                let rest = aenderung.trim().strip_prefix('{').unwrap_or("}").trim_start();
                let rest = if rest.starts_with('}') { rest.to_string() } else { format!(",{}", rest) };
                format!("{{\"typ\":\"vorrat\",\"name\":{}{}", json_text(name), rest)
            }
            Ereignis::Herd { daten } => {
                let rest = daten.trim().strip_prefix('{').unwrap_or("}").trim_start();
                let rest = if rest.starts_with('}') { rest.to_string() } else { format!(",{}", rest) };
                format!("{{\"typ\":\"herd\"{}", rest)
            }
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
    /// `debug`: technische Details interner Fehler (`detail`) zeigen (`--debug`, K-083).
    Konsole { farbe: bool, info: bool, debug: bool },
    /// Eine JSON-Zeile pro Ereignis auf stdout.
    Json,
    /// Sammeln (Tests).
    Sammeln(Vec<Ereignis>),
}

/// Meldungszeile für Warnungen und Fehler wie `meldungText` in bin/pizza.js (K-083, SPEC §2.6, HOST-ABI §7):
/// `<text> (Zeile Z, Spalte S)` bzw. `<text> (<datei>, Zeile Z, Spalte S)`, sobald `datei` gesetzt ist; Datei ohne Zeile: `(<datei>)`.
/// Endet der Text schon auf ` (Zeile N)` bzw. ` (<pfad>, Zeile N)` mit derselben Zeile (ungefangene Ananas), ersetzt der Ort diese Angabe.
pub fn meldung_text(text: &str, datei: Option<&str>, zeile: Option<i32>, spalte: Option<i32>) -> String {
    if zeile.is_none() && datei.is_none() {
        return text.to_string();
    }
    let mut ort: Vec<String> = Vec::new();
    if let Some(d) = datei {
        ort.push(d.to_string());
    }
    if let Some(z) = zeile {
        ort.push(match spalte {
            Some(s) => format!("Zeile {}, Spalte {}", z, s),
            None => format!("Zeile {}", z),
        });
    }
    let pos = format!(" ({})", ort.join(", "));
    // JS: /\s\((?:([^()]*), )?Zeile (\d+)\)$/ und Number(N) === zeile
    if let (Some(z), Some(rumpf)) = (zeile, text.strip_suffix(')')) {
        if let Some(i) = rumpf.rfind("Zeile ") {
            let ziffern = &rumpf[i + 6..];
            let vor = &rumpf[..i];
            if !ziffern.is_empty() && ziffern.bytes().all(|b| b.is_ascii_digit()) && ziffern.parse::<f64>().ok() == Some(z as f64) {
                // vor endet auf "(" oder auf "(<pfad>, " (Pfad ohne Klammern)
                let klammer = if let Some(v) = vor.strip_suffix('(') {
                    Some(v.len())
                } else if let Some(v) = vor.strip_suffix(", ") {
                    v.rfind('(').filter(|&j| !v[j + 1..].contains(')'))
                } else {
                    None
                };
                if let Some(j) = klammer {
                    let davor = &vor[..j];
                    if let Some(ws) = davor.chars().next_back().filter(|c| c.is_whitespace()) {
                        return format!("{}{}", &davor[..davor.len() - ws.len_utf8()], pos);
                    }
                }
            }
        }
    }
    format!("{}{}", text, pos)
}

/// `--info`-Zeile am Ende (wie bin/pizza.js), bei Programmen mit Küchenbrigade zusätzlich ` · Köche: N`.
pub fn info_zeile(exit_code: i32, schritte: f64, zeit_ms: f64, koeche: Option<usize>) -> String {
    let mut t = format!("— Exit-Code {} · {} Schritte · Uhr {} ms", exit_code, json_zahl(schritte), json_zahl(zeit_ms));
    if let Some(k) = koeche {
        t.push_str(&format!(" · Köche: {}", k));
    }
    t
}

impl Senke {
    pub fn konsole(info: bool) -> Self {
        let farbe = io::stderr().is_terminal() && std::env::var_os("NO_COLOR").is_none();
        Senke::Konsole { farbe, info, debug: false }
    }

    /// Hinweiszeile der Hülle (kein Ereignis), z. B. `Saat: N` (K-077): Konsole → stderr (grau bei TTY),
    /// JSON → stderr ohne Farbe, Sammeln → verworfen.
    pub fn hinweis(&mut self, text: &str) {
        let _ = io::stdout().flush();
        match self {
            Senke::Sammeln(_) => {}
            Senke::Json => {
                let _ = writeln!(io::stderr(), "{}", text);
            }
            Senke::Konsole { farbe, .. } => {
                let t = if *farbe { format!("[90m{}[0m", text) } else { text.to_string() };
                let _ = writeln!(io::stderr(), "{}", t);
            }
        }
    }

    /// Sendet `ende`; `koeche` = tatsächlich genutzte Köche bei Programmen mit Gruppe `kueche` (SPEC §17.7, K-100) –
    /// erscheint nur in der `--info`-Zeile (` · Köche: N`), nie im Ereignis selbst (JSON unverändert).
    pub fn ende(&mut self, exit_code: i32, schritte: f64, zeit_ms: f64, koeche: Option<usize>) {
        match (&*self, koeche) {
            (Senke::Konsole { farbe, info: true, .. }, Some(_)) => {
                let _ = io::stdout().flush();
                let t = info_zeile(exit_code, schritte, zeit_ms, koeche);
                let t = if *farbe { format!("[90m{}[0m", t) } else { t };
                let _ = writeln!(io::stderr(), "{}", t);
            }
            _ => self.sende(Ereignis::Ende { exit_code, schritte, zeit_ms }),
        }
    }

    pub fn sende(&mut self, e: Ereignis) {
        match self {
            Senke::Sammeln(v) => v.push(e),
            Senke::Json => {
                let mut out = io::stdout().lock();
                let _ = writeln!(out, "{}", e.als_json());
                let _ = out.flush();
            }
            Senke::Konsole { farbe, info, debug } => {
                let f = |code: &str, t: &str| {
                    if *farbe {
                        format!("\x1b[{}m{}\x1b[0m", code, t)
                    } else {
                        t.to_string()
                    }
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
                    // Kein Echo: das macht das Terminal. UI-Nachrichten gehen ans Fenster, nicht auf die Konsole.
                    // Vorrat: wird gespeichert, nicht angezeigt (wie bin/pizza.js).
                    // Herd: Fenster-Ereignisse gehen an den Renderer.
                    Ereignis::Eingabe { .. } | Ereignis::Ui { .. } | Ereignis::Vorrat { .. } | Ereignis::Herd { .. } => {}
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
                    Ereignis::Warnung { text, datei, zeile, spalte, .. } => {
                        let _ = io::stdout().flush();
                        let _ = writeln!(io::stderr(), "{}", f("33", &meldung_text(text, datei.as_deref(), *zeile, *spalte)));
                    }
                    Ereignis::Fehler { text, datei, zeile, spalte, .. } => {
                        let _ = io::stdout().flush();
                        let _ = writeln!(io::stderr(), "{}", f("1;31", &meldung_text(text, datei.as_deref(), *zeile, *spalte)));
                        if let (true, Ereignis::Fehler { detail: Some(d), .. }) = (*debug, &e) {
                            let _ = writeln!(io::stderr(), "{}", f("90", &format!("detail: {}", d)));
                        }
                    }
                    Ereignis::Panik { text } => {
                        // Banner nach stderr wie bin/pizza.js und HOST-ABI §7 (Farbe nur bei TTY).
                        let _ = io::stdout().flush();
                        let _ = writeln!(io::stderr(), "{}", f("1;33;41", text));
                    }
                    Ereignis::Ende { exit_code, schritte, zeit_ms } => {
                        let _ = io::stdout().flush();
                        if *info {
                            let _ = writeln!(io::stderr(), "{}", f("90", &info_zeile(*exit_code, *schritte, *zeit_ms, None)));
                        }
                    }
                }
            }
        }
    }
}
