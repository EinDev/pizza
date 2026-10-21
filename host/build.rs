//! Bettet den Theke-Renderer (`site/js/theke/fenster.html` samt referenzierter Skripte/Stile) als eine
//! HTML-Datei ein. Fehlt der Renderer, wird `theke-ersatz.html` verwendet.
//! Eigene Quelle: Umgebungsvariable `PIZZA_THEKE_DIR` (Verzeichnis mit `fenster.html`).

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    let host = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let aus = PathBuf::from(env::var("OUT_DIR").unwrap()).join("theke.html");
    println!("cargo:rerun-if-env-changed=PIZZA_THEKE_DIR");
    println!("cargo:rerun-if-changed=theke-ersatz.html");

    let dir = env::var_os("PIZZA_THEKE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| host.join("..").join("site").join("js").join("theke"));
    println!("cargo:rerun-if-changed={}", dir.display());
    let fenster = dir.join("fenster.html");
    let html = if fenster.is_file() {
        println!("cargo:rerun-if-changed={}", fenster.display());
        einbetten(&fs::read_to_string(&fenster).unwrap(), &dir)
    } else {
        println!("cargo:warning=Theke-Renderer {} fehlt – nutze theke-ersatz.html", fenster.display());
        fs::read_to_string(host.join("theke-ersatz.html")).unwrap()
    };
    fs::write(aus, html).unwrap();
}

/// Ersetzt `<script src="x.js"></script>` und `<link rel="stylesheet" href="y.css">` durch Inline-Inhalte
/// (nur relative Pfade innerhalb des Renderer-Verzeichnisses).
fn einbetten(html: &str, dir: &Path) -> String {
    let mut o = String::with_capacity(html.len() * 4);
    let mut rest = html;
    while let Some(i) = rest.find('<') {
        o.push_str(&rest[..i]);
        rest = &rest[i..];
        let ende = match rest.find('>') {
            Some(e) => e + 1,
            None => break,
        };
        let tag = &rest[..ende];
        let klein = tag.to_ascii_lowercase();
        if klein.starts_with("<script") {
            if let Some(src) = attribut(tag, "src") {
                if let Some(inhalt) = lies(dir, &src) {
                    // zugehöriges </script> überspringen
                    let nach = &rest[ende..];
                    let schluss = nach.to_ascii_lowercase().find("</script>").map(|p| p + "</script>".len()).unwrap_or(0);
                    o.push_str("<script>\n");
                    o.push_str(&inhalt.replace("</script", "<\\/script"));
                    o.push_str("\n</script>");
                    rest = &nach[schluss..];
                    continue;
                }
            }
        } else if klein.starts_with("<link") && klein.contains("stylesheet") {
            if let Some(href) = attribut(tag, "href") {
                if let Some(inhalt) = lies(dir, &href) {
                    o.push_str("<style>\n");
                    o.push_str(&inhalt);
                    o.push_str("\n</style>");
                    rest = &rest[ende..];
                    continue;
                }
            }
        }
        o.push_str(tag);
        rest = &rest[ende..];
    }
    o.push_str(rest);
    o
}

fn attribut(tag: &str, name: &str) -> Option<String> {
    let klein = tag.to_ascii_lowercase();
    let start = klein.find(&format!("{}=", name))? + name.len() + 1;
    let wert = &tag[start..];
    let q = wert.chars().next()?;
    if q == '"' || q == '\'' {
        let e = wert[1..].find(q)?;
        Some(wert[1..1 + e].to_string())
    } else {
        Some(wert.split(|c: char| c.is_whitespace() || c == '>').next()?.to_string())
    }
}

fn lies(dir: &Path, rel: &str) -> Option<String> {
    if rel.contains("://") || rel.starts_with('/') || rel.starts_with("data:") {
        return None;
    }
    let rel = rel.split(['?', '#']).next()?;
    let p = dir.join(rel);
    println!("cargo:rerun-if-changed={}", p.display());
    match fs::read_to_string(&p) {
        Ok(s) => Some(s),
        Err(_) => {
            println!("cargo:warning=Theke: {} nicht gefunden (bleibt als Verweis)", p.display());
            None
        }
    }
}
