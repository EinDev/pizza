//! Bettet den Theke-Renderer (`site/js/theke/`: fenster.html, fenster.js, fenster.css, theke.js, theke.css)
//! unverändert ein – es gibt nur EINE Render-Engine für Browser und nativ. Der Host liefert die Dateien über das
//! Custom-Protocol `theke://` aus (siehe src/theke.rs). Anderes Verzeichnis: `PIZZA_THEKE_DIR`.
//! Ohne Feature `theke` wird nichts eingebettet. Feature `starter` (Linux): bettet den Theke-Teil aus
//! `PIZZA_THEKE_EXE` ein (siehe src/starter.rs).

use std::env;
use std::fmt::Write as _;
use std::fs;
use std::path::PathBuf;

const DATEIEN: [(&str, &str); 5] = [
    ("fenster.html", "text/html; charset=utf-8"),
    ("fenster.js", "text/javascript; charset=utf-8"),
    ("fenster.css", "text/css; charset=utf-8"),
    ("theke.js", "text/javascript; charset=utf-8"),
    ("theke.css", "text/css; charset=utf-8"),
];

fn main() {
    let host = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let aus = PathBuf::from(env::var("OUT_DIR").unwrap()).join("theke_dateien.rs");
    println!("cargo:rerun-if-env-changed=PIZZA_THEKE_DIR");
    println!("cargo:rerun-if-changed=build.rs");

    let mut code = String::from("/// Eingebettete Renderer-Dateien: (Pfad, MIME-Typ, Inhalt).\npub const DATEIEN: &[(&str, &str, &[u8])] = &[\n");
    if env::var_os("CARGO_FEATURE_THEKE").is_some() {
        let dir = env::var_os("PIZZA_THEKE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| host.join("..").join("site").join("js").join("theke"));
        for (name, mime) in DATEIEN {
            let p = dir.join(name);
            println!("cargo:rerun-if-changed={}", p.display());
            let p = fs::canonicalize(&p).unwrap_or_else(|_| {
                panic!(
                    "Theke-Renderer fehlt: {} – site/js/theke/ bereitstellen (PIZZA_THEKE_DIR) oder ohne Fenster bauen: --no-default-features",
                    p.display()
                )
            });
            writeln!(code, "    ({:?}, {:?}, include_bytes!({:?})),", name, mime, p.display().to_string()).unwrap();
        }
    }
    code.push_str("];\n");
    fs::write(aus, code).unwrap();

    // Linux-Starter (Feature `starter`, src/starter.rs): Theke-Teil (fertiges pizza-host mit Feature `theke`) einbetten.
    // Ohne PIZZA_THEKE_EXE bleibt er leer – Theke-Programme melden dann „ohne Theke-Teil gebaut“.
    println!("cargo:rerun-if-env-changed=PIZZA_THEKE_EXE");
    let mut exe = String::from("/// Eingebetteter Theke-Teil (ELF) für den Linux-Starter.\npub const THEKE_EXE: &[u8] = ");
    match env::var_os("PIZZA_THEKE_EXE").filter(|_| env::var_os("CARGO_FEATURE_STARTER").is_some()) {
        Some(p) => {
            let p = fs::canonicalize(PathBuf::from(&p))
                .unwrap_or_else(|_| panic!("PIZZA_THEKE_EXE fehlt: {}", PathBuf::from(&p).display()));
            println!("cargo:rerun-if-changed={}", p.display());
            writeln!(exe, "include_bytes!({:?});", p.display().to_string()).unwrap();
        }
        None => exe.push_str("&[];\n"),
    }
    fs::write(PathBuf::from(env::var("OUT_DIR").unwrap()).join("theke_exe.rs"), exe).unwrap();
}
