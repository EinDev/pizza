//! Theke (THEKE.md §4): eigenes Fenster über die System-WebView (wry + tao).
//!
//! - Das Wasm-Programm läuft in einem eigenen Thread, der Hauptthread wartet auf die erste UI-Nachricht.
//! - Erst dann entstehen Event-Loop, Fenster und WebView (Programme ohne Theke bleiben reine Konsolenprogramme).
//! - Host → Renderer: `window.pizzaThekeEmpfange(<json>)`; Renderer → Host: `window.ipc.postMessage(<json-text>)`.
//! - Fenster schließen → Ereignis `{"typ":"geschlossen"}`, das Fenster verschwindet, das Programm läuft weiter.
//! - Kein Fenster möglich (keine Anzeige, WebView2/WebKitGTK fehlt) → verständliche Meldung, `ui_warte` liefert -1.

use std::io::Write;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::WindowBuilder;
use wry::{PageLoadEvent, WebContext, WebViewBuilder};

use crate::laufen::Ui;

/// Eingebetteter Renderer (build.rs: `site/js/theke/fenster.html` inkl. Skripte, sonst `theke-ersatz.html`).
pub const RENDERER_HTML: &str = include_str!(concat!(env!("OUT_DIR"), "/theke.html"));

const GESCHLOSSEN: &str = "{\"typ\":\"geschlossen\"}";

enum AnHaupt {
    Nachricht(String),
    Fertig(i32),
}

#[derive(Debug)]
enum Fe {
    Nachricht(String),
    Geladen,
    Fertig(i32),
}

/// Gibt es überhaupt eine Anzeige? (Linux ohne DISPLAY/WAYLAND_DISPLAY → nein; `PIZZA_THEKE=0` schaltet ab.)
pub fn anzeige_verfuegbar() -> bool {
    if std::env::var("PIZZA_THEKE").map(|v| v == "0").unwrap_or(false) {
        return false;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let gesetzt = |n: &str| std::env::var_os(n).map(|v| !v.is_empty()).unwrap_or(false);
        if !gesetzt("DISPLAY") && !gesetzt("WAYLAND_DISPLAY") {
            return false;
        }
    }
    true
}

/// Führt `lauf` (das Programm) in einem eigenen Thread aus und betreibt bei Bedarf das Fenster im
/// aufrufenden (Haupt-)Thread. Liefert den Exit-Code (kehrt ggf. nie zurück, sondern beendet den Prozess).
pub fn starte<F>(lauf: F) -> i32
where
    F: FnOnce(Option<Ui>) -> i32 + Send + 'static,
{
    if !anzeige_verfuegbar() {
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

    let mut von_tx = Some(von_tx);
    let mut rx = rx;
    loop {
        match rx.recv() {
            Err(_) => {
                let _ = programm.join();
                return 1;
            }
            Ok(AnHaupt::Fertig(code)) => {
                let _ = programm.join();
                return code;
            }
            Ok(AnHaupt::Nachricht(m)) => {
                let Some(von) = von_tx.take() else { continue }; // Fenster schon gescheitert → verwerfen
                match fenster(m, rx, von) {
                    Ok(never) => match never {},
                    Err((meldung, zurueck)) => {
                        let _ = std::io::stdout().flush();
                        eprintln!("{}", meldung);
                        // `von` ist weg → ui_warte liefert -1, das Programm läuft als Konsolenprogramm weiter.
                        rx = zurueck;
                    }
                }
            }
        }
    }
}

enum Nie {}

/// Datenordner der WebView: %LOCALAPPDATA%\pizza\theke bzw. $XDG_CACHE_HOME/pizza/theke (sonst temp).
fn datenordner() -> Option<std::path::PathBuf> {
    let basis = std::env::var_os("LOCALAPPDATA")
        .or_else(|| std::env::var_os("XDG_CACHE_HOME"))
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".cache")))
        .unwrap_or_else(std::env::temp_dir);
    Some(basis.join("pizza").join("theke"))
}

/// Öffnet Fenster + WebView und betreibt die Event-Loop (kehrt bei Erfolg nie zurück).
fn fenster(erste: String, rx: Receiver<AnHaupt>, von: Sender<String>) -> Result<Nie, (String, Receiver<AnHaupt>)> {
    let event_loop = EventLoopBuilder::<Fe>::with_user_event().build();
    let fenster = match WindowBuilder::new()
        .with_title("pizza – Theke")
        .with_inner_size(LogicalSize::new(480.0, 360.0))
        .with_visible(false)
        .build(&event_loop)
    {
        Ok(w) => w,
        Err(e) => return Err((format!("Theke: Fenster konnte nicht geöffnet werden ({}). Das Programm läuft ohne Fenster weiter.", e), rx)),
    };

    // WebView-Daten nicht neben die EXE legen (Downloads-Ordner!), sondern ins Benutzer-Cache-Verzeichnis.
    let mut kontext = WebContext::new(datenordner());
    let proxy = event_loop.create_proxy();
    let ipc_von = von.clone();
    let builder = WebViewBuilder::new_with_web_context(&mut kontext)
        .with_html(RENDERER_HTML)
        .with_ipc_handler(move |req| {
            let _ = ipc_von.send(req.body().clone());
        })
        .with_on_page_load_handler({
            let p = proxy.clone();
            move |ev, _url| {
                if let PageLoadEvent::Finished = ev {
                    let _ = p.send_event(Fe::Geladen);
                }
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
            #[cfg(windows)]
            let hinweis = "Theke: Die Microsoft-Edge-WebView2-Runtime fehlt oder ist defekt – das Fenster kann nicht angezeigt werden.\n\
                           Download: https://developer.microsoft.com/microsoft-edge/webview2/ (\"Evergreen Bootstrapper\").\n\
                           Das Programm läuft ohne Fenster weiter.";
            #[cfg(not(windows))]
            let hinweis = "Theke: Die WebView (WebKitGTK 4.1) konnte nicht gestartet werden – ist libwebkit2gtk-4.1 installiert?\n\
                           Das Programm läuft ohne Fenster weiter.";
            return Err((format!("{} ({})", hinweis, e), rx));
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

    let mut geladen = false;
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
                            fenster.set_visible(true);
                            fenster.set_focus();
                        }
                        Some("schliesse") => {
                            zu = true;
                            fenster.set_visible(false);
                        }
                        _ => {}
                    }
                }
                if geladen {
                    let _ = webview.evaluate_script(&format!("window.pizzaThekeEmpfange({});", m.trim()));
                } else {
                    warteschlange.push(m);
                }
            }
            Event::UserEvent(Fe::Geladen) => {
                geladen = true;
                for m in warteschlange.drain(..) {
                    let _ = webview.evaluate_script(&format!("window.pizzaThekeEmpfange({});", m.trim()));
                }
                // Smoke-Test (CI/xvfb): ersten Knopf automatisch klicken → kompletter Rundweg über die WebView.
                if std::env::var_os("PIZZA_THEKE_SMOKE").is_some() {
                    let _ = webview.evaluate_script(
                        "setTimeout(function(){var b=document.querySelector('button');if(b)b.click();},300);",
                    );
                }
            }
            Event::UserEvent(Fe::Fertig(code)) => {
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
