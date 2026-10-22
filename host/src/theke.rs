//! Theke (THEKE.md §4): eigenes Fenster über die System-WebView (wry + tao).
//!
//! - Das Wasm-Programm läuft in einem eigenen Thread; der Hauptthread wartet auf die erste UI-Nachricht.
//!   Erst dann entstehen Event-Loop, Fenster und WebView (Programme ohne Theke bleiben reine Konsolenprogramme).
//! - Renderer = unverändert `site/js/theke/` (eine Render-Engine für Browser und nativ), eingebettet per build.rs
//!   und ausgeliefert über das Custom-Protocol `theke://lokal/…` (WebView2: `http://theke.localhost/…`), damit
//!   die CSP der Seite (`script-src 'self'`) passt – kein Server, kein Netzwerk.
//! - Brücke (site/js/theke/README.md): Seite → Host `window.ipc.postMessage(json)`, zuerst einmal `{"typ":"bereit"}`
//!   (nicht ans Programm); Host → Seite `pizzaThekeEmpfange(<JSON als JS-String>)`, gepuffert bis `bereit`.
//! - Nutzer schließt das Fenster → Host schickt `{"typ":"geschlossen"}` an `ui_warte`; `op: "schliesse"` → Fenster zu.
//! - Programmende → Fenster zu, Prozess endet mit dem Exit-Code des Programms.
//! - Kein Fenster möglich (keine Anzeige, WebView2/WebKitGTK fehlt) → verständliche Meldung, Exit 2 (K-096):
//!   vorab per [`fenster_moeglich`] (main.rs, nur für Programme mit Theke), sonst beim Öffnen des Fensters.

use std::borrow::Cow;
use std::io::Write;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::WindowBuilder;
use wry::http::{header::CONTENT_TYPE, Response, StatusCode};
use wry::{WebContext, WebViewBuilder};

use crate::laufen::Ui;

mod dateien {
    include!(concat!(env!("OUT_DIR"), "/theke_dateien.rs"));
}

const GESCHLOSSEN: &str = "{\"typ\":\"geschlossen\"}";
const START_URL: &str = "theke://lokal/fenster.html";

enum AnHaupt {
    Nachricht(String),
    Fertig(i32),
}

#[derive(Debug)]
enum Fe {
    Nachricht(String),
    Bereit,
    Fertig(i32),
}

/// Gibt es überhaupt eine Anzeige? (Linux ohne DISPLAY/WAYLAND_DISPLAY → nein; `PIZZA_THEKE=0` schaltet ab.)
pub fn anzeige_verfuegbar() -> bool {
    !crate::anzeige::theke_abgeschaltet() && crate::anzeige::anzeige_vorhanden()
}

/// Vorprüfung für Programme mit Theke (K-096), bevor das Programm startet: Anzeige da (Linux), WebView2-Runtime
/// installiert (Windows)? `Err((meldung, detail))` → Abbruch mit Exit 2. `PIZZA_TEST_OHNE_WEBVIEW2=1` (Windows)
/// tut so, als fehle die Runtime (Tests).
pub fn fenster_moeglich() -> Result<(), (&'static str, Option<String>)> {
    if !crate::anzeige::anzeige_vorhanden() {
        return Err((crate::anzeige::KEINE_ANZEIGE, None));
    }
    #[cfg(windows)]
    {
        if std::env::var_os("PIZZA_TEST_OHNE_WEBVIEW2").is_some() {
            return Err((crate::anzeige::WEBVIEW2_FEHLT, Some("PIZZA_TEST_OHNE_WEBVIEW2".into())));
        }
        if let Err(e) = wry::webview_version() {
            return Err((crate::anzeige::WEBVIEW2_FEHLT, Some(e.to_string())));
        }
    }
    Ok(())
}

/// Datenordner der WebView (Nutzerentscheidung): `%LOCALAPPDATA%\pizza\theke` bzw. `$XDG_DATA_HOME/pizza/theke`
/// (`~/.local/share/pizza/theke`), nie neben der EXE. Wird vorab angelegt.
fn datenordner() -> Option<std::path::PathBuf> {
    let basis = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from)
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(std::path::PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".local").join("share")))
    };
    let p = basis.unwrap_or_else(std::env::temp_dir).join("pizza").join("theke");
    std::fs::create_dir_all(&p).ok()?;
    Some(p)
}

/// Antwort des Custom-Protocols `theke://lokal/<datei>` aus den eingebetteten Renderer-Dateien.
fn ausliefern(pfad: &str) -> Response<Cow<'static, [u8]>> {
    let name = pfad.trim_start_matches('/');
    let name = if name.is_empty() { "fenster.html" } else { name };
    match dateien::DATEIEN.iter().find(|(n, _, _)| *n == name) {
        Some((_, mime, inhalt)) => Response::builder()
            .header(CONTENT_TYPE, *mime)
            .body(Cow::Borrowed(*inhalt))
            .unwrap_or_else(|_| Response::new(Cow::Borrowed(&[][..]))),
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(CONTENT_TYPE, "text/plain")
            .body(Cow::Borrowed(&b"nicht gefunden"[..]))
            .unwrap_or_else(|_| Response::new(Cow::Borrowed(&[][..]))),
    }
}

/// Führt `lauf` (das Programm) in einem eigenen Thread aus und betreibt bei Bedarf das Fenster im
/// aufrufenden (Haupt-)Thread. Liefert den Exit-Code (oder beendet den Prozess selbst mit ihm).
/// Scheitert das Fenster, endet der Prozess mit Meldung und Exit 2 (K-096); `debug` zeigt dann das Detail.
pub fn starte<F>(debug: bool, lauf: F) -> i32
where
    F: FnOnce(Option<Ui>) -> i32 + Send + 'static,
{
    // Ohne Anzeige kommen hier nur Programme ohne Theke an (die Vorprüfung in main.rs hat Theke-Programme
    // schon abgebrochen) oder `PIZZA_THEKE=0` (Tests/CI → W0100).
    if !anzeige_verfuegbar() || dateien::DATEIEN.is_empty() {
        return lauf(None);
    }
    let (tx, rx) = mpsc::channel::<AnHaupt>();
    let (von_tx, von_rx) = mpsc::channel::<String>();
    let tx_ui = tx.clone();
    let ui = Ui::Fenster {
        an: Box::new(move |m| {
            let _ = tx_ui.send(AnHaupt::Nachricht(m));
        }),
        von: von_rx,
    };
    let programm = thread::Builder::new()
        .name("pizza-programm".into())
        .stack_size(16 * 1024 * 1024)
        .spawn(move || {
            let code = lauf(Some(ui));
            let _ = tx.send(AnHaupt::Fertig(code));
        })
        .expect("Programm-Thread");

    match rx.recv() {
        Err(_) => {
            let _ = programm.join();
            1
        }
        Ok(AnHaupt::Fertig(code)) => {
            let _ = programm.join();
            code
        }
        Ok(AnHaupt::Nachricht(m)) => match fenster(m, rx, von_tx) {
            Ok(nie) => match nie {},
            Err((meldung, detail)) => {
                // K-096: kein stiller Weiterlauf ohne Fenster → Meldung (Theke-EXE ohne Terminal unter Windows:
                // zusätzlich Meldungsfenster) und sofort Exit 2 – nicht zurückkehren, sonst liefe der Programm-Thread weiter.
                let code = crate::anzeige::abbruch(meldung, Some(&detail), debug);
                let _ = std::io::stdout().flush();
                let _ = std::io::stderr().flush();
                std::process::exit(code);
            }
        },
    }
}

enum Nie {}

/// Öffnet Fenster + WebView und betreibt die Event-Loop (kehrt bei Erfolg nie zurück).
/// `Err((meldung, detail))`: kein Fenster möglich.
fn fenster(erste: String, rx: Receiver<AnHaupt>, von: Sender<String>) -> Result<Nie, (&'static str, String)> {
    #[cfg(windows)]
    const FEHLT: &str = crate::anzeige::WEBVIEW2_FEHLT;
    #[cfg(not(windows))]
    const FEHLT: &str = crate::anzeige::FENSTER_FEHLGESCHLAGEN;
    // Test-/CI-Modus: Fenster nie sichtbar machen (Smoke-Test ohne aufpoppende Fenster).
    // PIZZA_KEIN_DIALOG schließt das ein: Tests lösen nie ein sichtbares Fenster aus.
    let unsichtbar = std::env::var_os("PIZZA_THEKE_UNSICHTBAR").is_some() || crate::konsole::dialoge_unterdrueckt();
    let event_loop = EventLoopBuilder::<Fe>::with_user_event().build();
    let fenster = match WindowBuilder::new()
        .with_title("Theke")
        .with_inner_size(LogicalSize::new(480.0, 360.0))
        .with_visible(false)
        .build(&event_loop)
    {
        Ok(w) => w,
        Err(e) => return Err((FEHLT, e.to_string())),
    };

    let proxy = event_loop.create_proxy();
    let mut kontext = WebContext::new(datenordner());
    let ipc_von = von.clone();
    let ipc_proxy = proxy.clone();
    let builder = WebViewBuilder::new_with_web_context(&mut kontext)
        .with_custom_protocol("theke".into(), |_id, req| ausliefern(req.uri().path()))
        .with_url(START_URL)
        .with_ipc_handler(move |req| {
            let text = req.body();
            let kompakt: String = text.chars().filter(|c| !c.is_whitespace()).collect();
            if kompakt.contains("\"typ\":\"bereit\"") {
                let _ = ipc_proxy.send_event(Fe::Bereit);
            } else {
                let _ = ipc_von.send(text.clone());
            }
        });

    #[cfg(not(all(unix, not(target_os = "macos"))))]
    let webview = builder.build(&fenster);
    #[cfg(all(unix, not(target_os = "macos")))]
    let webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        match fenster.default_vbox() {
            Some(vbox) => builder.build_gtk(vbox),
            None => Err(wry::Error::MessageSender),
        }
    };
    let webview = match webview {
        Ok(w) => w,
        Err(e) => {
            drop(fenster);
            return Err((FEHLT, e.to_string()));
        }
    };

    // Programm-Nachrichten in die Event-Loop weiterreichen.
    {
        let p = proxy.clone();
        thread::Builder::new()
            .name("pizza-theke-bruecke".into())
            .spawn(move || {
                for m in rx {
                    let fe = match m {
                        AnHaupt::Nachricht(n) => Fe::Nachricht(n),
                        AnHaupt::Fertig(c) => Fe::Fertig(c),
                    };
                    let fertig = matches!(fe, Fe::Fertig(_));
                    if p.send_event(fe).is_err() || fertig {
                        break;
                    }
                }
            })
            .expect("Brücken-Thread");
    }

    // Host → Seite: Protokoll-JSON doppelt kodiert als JS-String (README der Theke).
    let empfange = move |wv: &wry::WebView, m: &str| {
        let js = format!("pizzaThekeEmpfange({});", serde_json::to_string(m).unwrap_or_else(|_| "\"\"".into()));
        let _ = wv.evaluate_script(&js);
    };

    let mut bereit = false;
    let mut warteschlange: Vec<String> = Vec::new();
    let mut zu = false;
    let _ = proxy.send_event(Fe::Nachricht(erste));

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(Fe::Nachricht(m)) => {
                // Fenster-Steuerung aus der Nachricht (THEKE.md §3).
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&m) {
                    match v.get("op").and_then(|o| o.as_str()) {
                        Some("fenster") => {
                            if let Some(t) = v.get("titel").and_then(|t| t.as_str()) {
                                fenster.set_title(t);
                            }
                            let b = v.get("breite").and_then(|x| x.as_f64());
                            let h = v.get("hoehe").and_then(|x| x.as_f64());
                            if b.is_some() || h.is_some() {
                                fenster.set_inner_size(LogicalSize::new(b.unwrap_or(480.0), h.unwrap_or(360.0)));
                            }
                        }
                        Some("baum") => {
                            zu = false;
                            if !unsichtbar {
                                fenster.set_visible(true);
                                fenster.set_focus();
                            }
                        }
                        Some("schliesse") => {
                            zu = true;
                            fenster.set_visible(false);
                        }
                        _ => {}
                    }
                }
                if bereit {
                    empfange(&webview, &m);
                } else {
                    warteschlange.push(m);
                }
            }
            Event::UserEvent(Fe::Bereit) => {
                bereit = true;
                for m in warteschlange.drain(..) {
                    empfange(&webview, &m);
                }
                // Smoke-Test (CI/xvfb): ersten Knopf automatisch klicken → kompletter Rundweg über die WebView.
                if std::env::var_os("PIZZA_THEKE_SMOKE").is_some() {
                    let _ = webview.evaluate_script(
                        "setTimeout(function(){var b=document.querySelector('button');if(b)b.click();},300);",
                    );
                }
            }
            Event::UserEvent(Fe::Fertig(code)) => {
                // Programmende = Fenster zu, Prozess endet mit dem Exit-Code des Programms.
                fenster.set_visible(false);
                let _ = std::io::stdout().flush();
                let _ = std::io::stderr().flush();
                std::process::exit(code & 0xff);
            }
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
                fenster.set_visible(false);
                if !zu {
                    zu = true;
                    let _ = von.send(GESCHLOSSEN.to_string());
                }
            }
            _ => {}
        }
    });
}
