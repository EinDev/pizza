//! Herd-Fenster und Offscreen-Bilder (Feature `herd`, HERD.md §7.1, K-130).
//!
//! **Fenster:** Programm-Thread = wasmi + Kern, Hauptthread = winit-Ereignisschleife + Glut (`Ziel::Fenster`, wgpu).
//! Je Bild wandert das Bildpaket über die Ereignisschleife (`EventLoopProxy`) zum Hauptthread; dort wird es gezeichnet
//! und präsentiert (vsync), **danach** fordert der Hauptthread den nächsten Takt an (`{"typ":"takt","anzahl":n,…}`,
//! Nachholregel ≤ 4 wie `site/js/herd/zeichner.js`). Das Fenster entsteht erst beim ersten `fenster`, Größe = Spielfeld
//! (passend zum Bildschirm verkleinert), frei veränderbar; die Glut passt das Spielfeld seitentreu ein (Ränder = Hintergrund).
//! Eingabe: Tasten (Namen wie `Tastatur`, K-110), Maus/Touch in Spielfeld-Koordinaten, Fokusverlust = alles losgelassen.
//! Schließen = `{"typ":"geschlossen"}`, Programmende = Fenster zu (Prozess endet mit dem Exit-Code).
//! Adapter: echte GPU (Standard nur hier), ohne passenden Adapter Software (WARP/lavapipe); `HERD_SOFTWARE=1` und
//! `PIZZA_KEIN_DIALOG` (Tests) erzwingen Software, `PIZZA_KEIN_DIALOG` hält das Fenster zudem unsichtbar.
//!
//! **Offscreen** (`--herd-bilder=ordner [--herd-nur=n,m]`): ohne Fenster, Glut im Programm-Thread auf dem
//! Software-Adapter, PNG je gesendetem Bild (`bild-<nr>.png`, Spielfeldgröße).
//!
//! Die reinen Teile (Tastennamen, Takt-Planung, Koordinaten, Takt-JSON) sind fensterfrei und werden ohne Fenster getestet.

use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::mpsc::{self, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use herd_glut::{Adapter, Glut, Optionen as GlutOptionen, Ziel};
use winit::application::ApplicationHandler;
use winit::dpi::{LogicalSize, PhysicalPosition, PhysicalSize};
use winit::event::{ElementState, MouseButton, TouchPhase, WindowEvent};
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::keyboard::{Key, NamedKey, PhysicalKey};
use winit::window::{Window, WindowId};

use crate::ereignis::{json_text, json_zahl};
use crate::herd::{HerdAnbindung, Messung};
use crate::laufen::Ui;

/// Ein Takt = 1/60 s (SPEC §18.2).
pub const SCHRITT: Duration = Duration::from_nanos(16_666_667);
/// Höchstens so viele Takte holt ein Bild nach (K-132).
pub const MAX_NACHHOLEN: u64 = 4;

const GESCHLOSSEN: &str = "{\"typ\":\"geschlossen\"}";

// ================================================================ reine Teile (ohne Fenster testbar)

/// Tastenname nach K-110 aus dem logischen Schlüssel (wie `herdTastenName` in ui/src/herd.js); `None` = nicht senden
/// (Modifikatoren, tote Tasten, Unbekanntes).
pub fn tastenname(key: &Key) -> Option<String> {
    match key {
        Key::Character(s) if !s.is_empty() => Some(if s.as_str() == " " { "Leertaste".into() } else { s.to_string() }),
        Key::Named(n) => {
            let deutsch = match n {
                NamedKey::Space => "Leertaste",
                NamedKey::ArrowLeft => "Links",
                NamedKey::ArrowRight => "Rechts",
                NamedKey::ArrowUp => "Hoch",
                NamedKey::ArrowDown => "Runter",
                NamedKey::Backspace => "Rücktaste",
                NamedKey::Delete => "Entfernen",
                NamedKey::Home => "Pos1",
                NamedKey::End => "Ende",
                NamedKey::PageUp => "BildHoch",
                NamedKey::PageDown => "BildRunter",
                NamedKey::Shift
                | NamedKey::Control
                | NamedKey::Alt
                | NamedKey::AltGraph
                | NamedKey::Meta
                | NamedKey::Super
                | NamedKey::Hyper
                | NamedKey::CapsLock
                | NamedKey::NumLock
                | NamedKey::ScrollLock
                | NamedKey::Fn
                | NamedKey::FnLock
                | NamedKey::Symbol
                | NamedKey::SymbolLock => return None,
                // Übrige benannte Tasten: W3C-Name wie `e.key` im Browser (Enter, Escape, Tab, F1 …, Insert …).
                andere => return Some(format!("{:?}", andere)),
            };
            Some(deutsch.into())
        }
        _ => None,
    }
}

/// Takt-Planung wie `taktAnfordern` in `site/js/herd/zeichner.js`: 60 Takte je Sekunde ab dem ersten Takt, ein Bild
/// holt höchstens [`MAX_NACHHOLEN`] Takte nach (der Rest verfällt), schneller als 60 Hz → warten.
#[derive(Debug, Default)]
pub struct Taktgeber {
    t0: Option<Instant>,
    gesendet: u64,
}

impl Taktgeber {
    /// Anzahl Takte für das nächste Bild oder `None` (noch zu früh – dann bis [`Taktgeber::faellig`] warten).
    pub fn anfordern(&mut self, jetzt: Instant) -> Option<u32> {
        let Some(t0) = self.t0 else {
            self.t0 = Some(jetzt);
            self.gesendet = 1;
            return Some(1);
        };
        let soll = (jetzt.saturating_duration_since(t0).as_nanos() / SCHRITT.as_nanos()) as u64 + 1;
        if soll.saturating_sub(self.gesendet) > MAX_NACHHOLEN {
            self.gesendet = soll - MAX_NACHHOLEN;
        }
        let anzahl = soll.saturating_sub(self.gesendet);
        if anzahl < 1 {
            return None;
        }
        self.gesendet = soll;
        Some(anzahl as u32)
    }

    /// Ab wann der nächste Takt fällig ist.
    pub fn faellig(&self) -> Option<Instant> {
        self.t0.map(|t0| t0 + SCHRITT * self.gesendet as u32)
    }

    pub fn zuruecksetzen(&mut self) {
        *self = Taktgeber::default();
    }
}

/// Eingabezustand zwischen zwei Takten (wie `zeichner.js`): gehaltene Tasten, kurz gedrückte (auch wieder losgelassene)
/// Tasten, Maus in Spielfeld-Koordinaten, Knöpfe (1 links, 2 rechts, 4 Mitte; Touch = 1).
#[derive(Debug, Default)]
pub struct Eingabe {
    gehalten: Vec<String>,
    kurz: Vec<String>,
    pub maus: (f64, f64),
    knoepfe: u32,
    knoepfe_kurz: u32,
}

impl Eingabe {
    pub fn taste(&mut self, name: &str, unten: bool) {
        if unten {
            if !self.gehalten.iter().any(|t| t == name) {
                self.gehalten.push(name.to_string());
            }
            if !self.kurz.iter().any(|t| t == name) {
                self.kurz.push(name.to_string());
            }
        } else {
            self.gehalten.retain(|t| t != name);
        }
    }

    pub fn knopf(&mut self, bit: u32, unten: bool) {
        if unten {
            self.knoepfe |= bit;
            self.knoepfe_kurz |= bit;
        } else {
            self.knoepfe &= !bit;
        }
    }

    /// Fokusverlust: alles losgelassen.
    pub fn loslassen(&mut self) {
        self.gehalten.clear();
        self.knoepfe = 0;
    }

    /// `{"typ":"takt","anzahl":n,"tasten":[…],"maus":[x,y],"knoepfe":k}`; setzt die „kurz“-Mengen zurück.
    pub fn takt_json(&mut self, anzahl: u32) -> String {
        let mut tasten: Vec<&String> = self.gehalten.iter().collect();
        tasten.extend(self.kurz.iter().filter(|k| !self.gehalten.contains(k)));
        let liste: Vec<String> = tasten.iter().map(|t| json_text(t)).collect();
        let s = format!(
            "{{\"typ\":\"takt\",\"anzahl\":{},\"tasten\":[{}],\"maus\":[{},{}],\"knoepfe\":{}}}",
            anzahl,
            liste.join(","),
            json_zahl(self.maus.0),
            json_zahl(self.maus.1),
            self.knoepfe | self.knoepfe_kurz
        );
        self.kurz.clear();
        self.knoepfe_kurz = 0;
        s
    }
}

/// Gerätepixel im Fenster → Spielfeld-Koordinaten (seitentreu eingepasst wie die Glut, `spielfeld()` in ui/src/herd.js).
pub fn spielfeld_punkt(px: f64, py: f64, ziel: (u32, u32), feld: (f64, f64)) -> (f64, f64) {
    let (b, h) = (ziel.0.max(1) as f64, ziel.1.max(1) as f64);
    let s = (b / feld.0).min(h / feld.1);
    let s = if s.is_finite() && s > 0.0 { s } else { 1.0 };
    let ox = (b - feld.0 * s) / 2.0;
    let oy = (h - feld.1 * s) / 2.0;
    ((px - ox) / s, (py - oy) / s)
}

/// Anfangsgröße des Fensters (logische Pixel): das Spielfeld, bei Bedarf seitentreu auf 90 % des Bildschirms verkleinert.
pub fn fenstergroesse(feld: (f64, f64), bildschirm: Option<(f64, f64)>) -> (f64, f64) {
    let (b, h) = (feld.0.max(64.0), feld.1.max(64.0));
    match bildschirm {
        Some((mb, mh)) if mb > 0.0 && mh > 0.0 => {
            let s = (mb * 0.9 / b).min(mh * 0.9 / h).min(1.0);
            ((b * s).floor().max(64.0), (h * s).floor().max(64.0))
        }
        _ => (b, h),
    }
}

/// Zahl aus dem Ereignis-JSON des Moduls (`"breite":640`).
fn json_feld_zahl(json: &str, feld: &str) -> Option<f64> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    v.get(feld)?.as_f64()
}

fn json_feld_text(json: &str, feld: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    Some(v.get(feld)?.as_str()?.to_string())
}

/// Software-Adapter erzwungen? (`HERD_SOFTWARE=1`; `PIZZA_KEIN_DIALOG` = Tests/Agenten: nie die echte GPU.)
fn nur_software() -> bool {
    std::env::var("HERD_SOFTWARE").map(|v| v == "1").unwrap_or(false) || crate::konsole::dialoge_unterdrueckt()
}

// ================================================================ Offscreen (`--herd-bilder`)

/// Bildnummer aus dem `bild`-Ereignis.
fn bildnummer(json: &str) -> Option<u64> {
    json_feld_zahl(json, "bildnummer").filter(|n| *n >= 0.0 && n.fract() == 0.0).map(|n| n as u64)
}

/// RGBA8 (Zeilen von oben) als PNG.
pub fn schreibe_png(pfad: &std::path::Path, breite: u32, hoehe: u32, rgba: &[u8]) -> std::io::Result<()> {
    let datei = std::fs::File::create(pfad)?;
    let mut enc = png::Encoder::new(std::io::BufWriter::new(datei), breite, hoehe);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let mut w = enc.write_header().map_err(std::io::Error::other)?;
    w.write_image_data(rgba).map_err(std::io::Error::other)?;
    w.finish().map_err(std::io::Error::other)?;
    Ok(())
}

/// Offscreen-Renderer im Programm-Thread: zeichnet **jedes** Bild (Ressourcen kommen als Deltas) auf dem
/// Software-Adapter und speichert die gewählten (`nur`, sonst alle) als `<ordner>/bild-<nr>.png`.
pub fn offscreen(ordner: PathBuf, nur: Option<Vec<u64>>, messung: Option<Arc<Messung>>) -> HerdAnbindung {
    let mut glut: Option<(Glut, u32, u32)> = None;
    let mut gescheitert = false;
    HerdAnbindung(Box::new(move |art, json, paket| match art {
        "fenster" => {
            glut = None;
            if gescheitert {
                return;
            }
            let b = json_feld_zahl(json, "breite").unwrap_or(640.0).clamp(1.0, 8192.0) as u32;
            let h = json_feld_zahl(json, "hoehe").unwrap_or(360.0).clamp(1.0, 8192.0) as u32;
            let opt = GlutOptionen { adapter: Adapter::Software, ..Default::default() };
            match Glut::neu(Ziel::Offscreen { breite: b, hoehe: h }, &opt) {
                Ok(g) => glut = Some((g, b, h)),
                Err(e) => {
                    gescheitert = true;
                    eprintln!("Herd-Bilder: keine Glut ({}) – es werden keine Bilder gespeichert.", e);
                }
            }
        }
        "bild" => {
            let (Some((g, b, h)), Some(p)) = (glut.as_mut(), paket) else { return };
            let t = Instant::now();
            let stat = match g.bild(p) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Herd-Bilder: Bild nicht gezeichnet ({}).", e);
                    return;
                }
            };
            let nr = bildnummer(json).unwrap_or(0);
            if nur.as_ref().is_none_or(|n| n.contains(&nr)) {
                match g.lies_pixel() {
                    Ok(px) => {
                        let _ = std::fs::create_dir_all(&ordner);
                        let pfad = ordner.join(format!("bild-{}.png", nr));
                        if let Err(e) = schreibe_png(&pfad, *b, *h, &px) {
                            eprintln!("Herd-Bilder: {} nicht geschrieben ({}).", pfad.display(), e);
                        }
                    }
                    Err(e) => eprintln!("Herd-Bilder: Pixel nicht lesbar ({}).", e),
                }
            } else if messung.is_some() {
                let _ = g.warte();
            }
            if let Some(m) = &messung {
                m.glut(t.elapsed(), stat.draw_calls, stat.instanzen_2d, stat.instanzen_3d);
            }
        }
        "schliesse" => glut = None,
        _ => {}
    }))
}

/// Takte für `--herd-bilder` ohne `--ui-ereignisse`: `{"typ":"takt","anzahl":1}` bis Bild `bis`, danach `geschlossen`.
pub fn offscreen_takte(bis: u64) -> std::collections::VecDeque<String> {
    (0..bis.max(1)).map(|_| "{\"typ\":\"takt\",\"anzahl\":1}".to_string()).collect()
}

// ================================================================ Fenster

/// Vom Programm-Thread an den Hauptthread.
#[derive(Debug)]
pub enum AnFenster {
    Fenster { titel: String, breite: f64, hoehe: f64 },
    Bild(Vec<u8>),
    Schliesse,
    Fertig(i32),
}

/// Vorprüfung vor dem ersten Wasm-Befehl (K-130 wie K-096): Anzeige da, Ereignisschleife erzeugbar, Grafikadapter da.
/// `Err((meldung, detail))` → Abbruch mit Exit 2. Testhilfen: `PIZZA_TEST_OHNE_ANZEIGE=1`, `PIZZA_TEST_OHNE_GRAFIK=1`
/// (vor jedem Zugriff auf Anzeige/GPU).
pub fn vorpruefung() -> Result<EventLoop<AnFenster>, (&'static str, Option<String>)> {
    if std::env::var_os("PIZZA_TEST_OHNE_ANZEIGE").is_some() {
        return Err((crate::anzeige::HERD_KEINE_ANZEIGE, Some("PIZZA_TEST_OHNE_ANZEIGE".into())));
    }
    if std::env::var_os("PIZZA_TEST_OHNE_GRAFIK").is_some() {
        return Err((crate::anzeige::HERD_KEINE_GRAFIK, Some("PIZZA_TEST_OHNE_GRAFIK".into())));
    }
    if !crate::anzeige::anzeige_vorhanden() {
        return Err((crate::anzeige::HERD_KEINE_ANZEIGE, None));
    }
    let el = EventLoop::<AnFenster>::with_user_event().build().map_err(|e| (crate::anzeige::HERD_KEINE_ANZEIGE, Some(e.to_string())))?;
    adapter_da().map_err(|d| (crate::anzeige::HERD_KEINE_GRAFIK, Some(d)))?;
    Ok(el)
}

/// Gibt es irgendeinen Grafikadapter (GPU oder Software)? Wegwerf-Instanz, ohne Fläche, ohne Zeichnen.
fn adapter_da() -> Result<(), String> {
    use herd_glut::wgpu;
    let mut d = wgpu::InstanceDescriptor::new_without_display_handle();
    let standard = if cfg!(windows) {
        wgpu::Backends::DX12
    } else if cfg!(target_os = "linux") {
        wgpu::Backends::VULKAN | wgpu::Backends::GL
    } else {
        wgpu::Backends::PRIMARY
    };
    d.backends = wgpu::Backends::from_env().unwrap_or(standard);
    let inst = wgpu::Instance::new(d);
    let mut fehler = Vec::new();
    for software in [nur_software(), true] {
        let r = pollster::block_on(inst.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: if software { wgpu::PowerPreference::LowPower } else { wgpu::PowerPreference::HighPerformance },
            force_fallback_adapter: software,
            compatible_surface: None,
            ..Default::default()
        }));
        match r {
            Ok(_) => return Ok(()),
            Err(e) => fehler.push(e.to_string()),
        }
    }
    Err(fehler.join("; "))
}

/// Führt `lauf` im Programm-Thread aus und betreibt das Herd-Fenster im Hauptthread (kehrt bei Erfolg nie zurück:
/// Programmende beendet den Prozess mit seinem Exit-Code). `lauf` bekommt die Ereignisquelle und die Anbindung.
pub fn starte<F>(el: EventLoop<AnFenster>, debug: bool, messung: Option<Arc<Messung>>, lauf: F) -> i32
where
    F: FnOnce(Ui, HerdAnbindung) -> i32 + Send + 'static,
{
    let proxy = el.create_proxy();
    let (von_tx, von_rx) = mpsc::channel::<String>();
    let ui = Ui::Fenster { an: Box::new(|_| {}), von: von_rx };
    let p = proxy.clone();
    let anbindung = HerdAnbindung(Box::new(move |art, json, paket| {
        let n = match art {
            "fenster" => AnFenster::Fenster {
                titel: json_feld_text(json, "titel").unwrap_or_default(),
                breite: json_feld_zahl(json, "breite").unwrap_or(640.0),
                hoehe: json_feld_zahl(json, "hoehe").unwrap_or(360.0),
            },
            "bild" => match paket {
                Some(b) => AnFenster::Bild(b.to_vec()),
                None => return,
            },
            "schliesse" => AnFenster::Schliesse,
            _ => return,
        };
        let _ = p.send_event(n);
    }));
    let fertig = proxy.clone();
    let _programm = thread::Builder::new()
        .name("pizza-programm".into())
        .stack_size(16 * 1024 * 1024)
        .spawn(move || {
            let code = lauf(ui, anbindung);
            let _ = fertig.send_event(AnFenster::Fertig(code));
        })
        .expect("Programm-Thread");
    let mut app = App {
        von: von_tx,
        debug,
        messung,
        unsichtbar: std::env::var_os("PIZZA_HERD_UNSICHTBAR").is_some() || crate::konsole::dialoge_unterdrueckt(),
        fenster: None,
        glut: None,
        feld: (640.0, 360.0),
        takt: Taktgeber::default(),
        eingabe: Eingabe::default(),
        tasten: HashMap::new(),
        paket: None,
        ausstehend: false,
        zu: false,
    };
    if let Err(e) = el.run_app(&mut app) {
        return crate::anzeige::abbruch(crate::anzeige::HERD_FENSTER_FEHLGESCHLAGEN, Some(&e.to_string()), debug);
    }
    1
}

struct App {
    /// Ereignisse an das Programm (`herd_warte`).
    von: Sender<String>,
    debug: bool,
    messung: Option<Arc<Messung>>,
    unsichtbar: bool,
    fenster: Option<Arc<Window>>,
    glut: Option<Glut>,
    feld: (f64, f64),
    takt: Taktgeber,
    eingabe: Eingabe,
    /// Gedrückte Tasten nach physischer Taste → Name beim Drücken (Loslassen trifft dieselbe Taste, auch wenn sich
    /// der logische Name inzwischen geändert hat, z. B. Umschalt losgelassen).
    tasten: HashMap<PhysicalKey, String>,
    /// Empfangenes, noch nicht gezeichnetes Bildpaket.
    paket: Option<Vec<u8>>,
    /// Takt angefordert, Bild noch nicht da.
    ausstehend: bool,
    /// `geschlossen` schon gesendet.
    zu: bool,
}

/// Abbruch: Meldung (ohne Terminal als Meldungsfenster, außer `PIZZA_KEIN_DIALOG`), Exit 2 – sofort, damit der
/// Programm-Thread nicht ohne Fenster weiterläuft (K-130/K-096).
fn abbruch_sofort(meldung: &str, detail: &str, debug: bool) -> ! {
    let code = crate::anzeige::abbruch(meldung, Some(detail), debug);
    let _ = std::io::stdout().flush();
    let _ = std::io::stderr().flush();
    std::process::exit(code);
}

impl App {
    fn oeffne(&mut self, el: &ActiveEventLoop, titel: &str, breite: f64, hoehe: f64) {
        self.schliesse();
        self.feld = (breite.max(1.0), hoehe.max(1.0));
        let bildschirm = el.primary_monitor().map(|m| {
            let s = m.scale_factor().max(0.1);
            (m.size().width as f64 / s, m.size().height as f64 / s)
        });
        let (b, h) = fenstergroesse(self.feld, bildschirm);
        let attr = Window::default_attributes().with_title(titel).with_inner_size(LogicalSize::new(b, h)).with_visible(false);
        let fenster = match el.create_window(attr) {
            Ok(f) => Arc::new(f),
            Err(e) => abbruch_sofort(crate::anzeige::HERD_FENSTER_FEHLGESCHLAGEN, &e.to_string(), self.debug),
        };
        let groesse = fenster.inner_size();
        let ziel = |f: &Arc<Window>| Ziel::Fenster { fenster: f.clone(), breite: groesse.width.max(1), hoehe: groesse.height.max(1) };
        let mut opt = GlutOptionen { adapter: Adapter::Gpu, vsync: true, ..Default::default() };
        if nur_software() {
            opt.adapter = Adapter::Software;
        }
        let glut = match Glut::neu(ziel(&fenster), &opt) {
            Ok(g) => g,
            // Keine (passende) GPU → Software-Rückfall (WARP/lavapipe), sonst Meldung + Exit 2.
            Err(e1) => {
                opt.adapter = Adapter::Software;
                match Glut::neu(ziel(&fenster), &opt) {
                    Ok(g) => g,
                    Err(e2) => abbruch_sofort(crate::anzeige::HERD_KEINE_GRAFIK, &format!("{}; {}", e1, e2), self.debug),
                }
            }
        };
        if !self.unsichtbar {
            fenster.set_visible(true);
            fenster.focus_window();
        }
        self.glut = Some(glut);
        self.fenster = Some(fenster);
        self.takt.zuruecksetzen();
        self.eingabe = Eingabe::default();
        self.tasten.clear();
        self.paket = None;
        self.ausstehend = false;
        self.zu = false;
        self.takt_anfordern(el);
    }

    fn schliesse(&mut self) {
        self.glut = None;
        if let Some(f) = self.fenster.take() {
            f.set_visible(false);
        }
        self.paket = None;
    }

    /// Nächsten Takt anfordern, sobald er fällig ist (sonst Weckzeit setzen).
    fn takt_anfordern(&mut self, el: &ActiveEventLoop) {
        if self.ausstehend || self.zu || self.glut.is_none() {
            return;
        }
        match self.takt.anfordern(Instant::now()) {
            Some(n) => {
                let json = self.eingabe.takt_json(n);
                if self.von.send(json).is_ok() {
                    self.ausstehend = true;
                }
                el.set_control_flow(ControlFlow::Wait);
            }
            None => {
                if let Some(t) = self.takt.faellig() {
                    el.set_control_flow(ControlFlow::WaitUntil(t));
                }
            }
        }
    }

    fn zeichne(&mut self) {
        let (Some(g), Some(p)) = (self.glut.as_mut(), self.paket.take()) else { return };
        let t = Instant::now();
        match g.bild(&p) {
            Ok(stat) => {
                if let Some(m) = &self.messung {
                    m.glut(t.elapsed(), stat.draw_calls, stat.instanzen_2d, stat.instanzen_3d);
                }
            }
            Err(e) => {
                // wie im Browser: Meldung, Fenster zu, das Programm bekommt `geschlossen`
                eprintln!("Der Herd konnte nicht zeichnen: {}", e);
                self.schliesse();
                self.geschlossen();
            }
        }
    }

    fn geschlossen(&mut self) {
        if !self.zu {
            self.zu = true;
            let _ = self.von.send(GESCHLOSSEN.to_string());
        }
    }

    fn punkt(&self, p: PhysicalPosition<f64>) -> (f64, f64) {
        let groesse = self.fenster.as_ref().map(|f| f.inner_size()).unwrap_or(PhysicalSize::new(1, 1));
        spielfeld_punkt(p.x, p.y, (groesse.width, groesse.height), self.feld)
    }
}

impl ApplicationHandler<AnFenster> for App {
    fn resumed(&mut self, _el: &ActiveEventLoop) {}

    fn user_event(&mut self, el: &ActiveEventLoop, e: AnFenster) {
        match e {
            AnFenster::Fenster { titel, breite, hoehe } => self.oeffne(el, &titel, breite, hoehe),
            AnFenster::Bild(p) => {
                // Zeichnen und präsentieren (vsync), danach den nächsten Takt anfordern (HERD.md §7.1).
                self.ausstehend = false;
                if self.fenster.is_some() {
                    self.paket = Some(p);
                    self.zeichne();
                    self.takt_anfordern(el);
                }
            }
            AnFenster::Schliesse => {
                self.schliesse();
                self.ausstehend = false;
            }
            AnFenster::Fertig(code) => {
                // Programmende = Fenster zu, Prozess endet mit dem Exit-Code des Programms.
                self.schliesse();
                let _ = std::io::stdout().flush();
                let _ = std::io::stderr().flush();
                std::process::exit(code & 0xff);
            }
        }
    }

    fn window_event(&mut self, _el: &ActiveEventLoop, _id: WindowId, e: WindowEvent) {
        match e {
            WindowEvent::Resized(g) => {
                if let Some(glut) = self.glut.as_mut() {
                    glut.groesse(g.width.max(1), g.height.max(1));
                }
            }
            WindowEvent::CloseRequested => {
                self.schliesse();
                self.geschlossen();
            }
            WindowEvent::Focused(false) => self.eingabe.loslassen(),
            WindowEvent::KeyboardInput { event, .. } => {
                if event.repeat {
                    return;
                }
                match event.state {
                    ElementState::Pressed => {
                        if let Some(n) = tastenname(&event.logical_key) {
                            self.eingabe.taste(&n, true);
                            self.tasten.insert(event.physical_key, n);
                        }
                    }
                    ElementState::Released => {
                        if let Some(n) = self.tasten.remove(&event.physical_key).or_else(|| tastenname(&event.logical_key)) {
                            self.eingabe.taste(&n, false);
                        }
                    }
                }
            }
            WindowEvent::CursorMoved { position, .. } => self.eingabe.maus = self.punkt(position),
            WindowEvent::MouseInput { state, button, .. } => {
                let bit = match button {
                    MouseButton::Left => 1,
                    MouseButton::Right => 2,
                    MouseButton::Middle => 4,
                    _ => 0,
                };
                if bit != 0 {
                    self.eingabe.knopf(bit, state == ElementState::Pressed);
                }
            }
            WindowEvent::Touch(t) => {
                self.eingabe.maus = self.punkt(t.location);
                match t.phase {
                    TouchPhase::Started => self.eingabe.knopf(1, true),
                    TouchPhase::Moved => {}
                    TouchPhase::Ended => self.eingabe.knopf(1, false),
                    TouchPhase::Cancelled => self.eingabe.loslassen(),
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, el: &ActiveEventLoop) {
        // Wartezeit auf den nächsten Takt abgelaufen (schneller als 60 Hz) → jetzt anfordern.
        if !self.ausstehend && self.paket.is_none() {
            if let Some(t) = self.takt.faellig() {
                if Instant::now() >= t {
                    self.takt_anfordern(el);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tastennamen_wie_k110() {
        assert_eq!(tastenname(&Key::Named(NamedKey::Space)).as_deref(), Some("Leertaste"));
        assert_eq!(tastenname(&Key::Named(NamedKey::ArrowLeft)).as_deref(), Some("Links"));
        assert_eq!(tastenname(&Key::Named(NamedKey::ArrowDown)).as_deref(), Some("Runter"));
        assert_eq!(tastenname(&Key::Named(NamedKey::Backspace)).as_deref(), Some("Rücktaste"));
        assert_eq!(tastenname(&Key::Named(NamedKey::PageDown)).as_deref(), Some("BildRunter"));
        assert_eq!(tastenname(&Key::Named(NamedKey::Enter)).as_deref(), Some("Enter"));
        assert_eq!(tastenname(&Key::Named(NamedKey::Escape)).as_deref(), Some("Escape"));
        assert_eq!(tastenname(&Key::Named(NamedKey::F5)).as_deref(), Some("F5"));
        assert_eq!(tastenname(&Key::Character("a".into())).as_deref(), Some("a"));
        assert_eq!(tastenname(&Key::Character("Ä".into())).as_deref(), Some("Ä"));
        assert_eq!(tastenname(&Key::Character(" ".into())).as_deref(), Some("Leertaste"));
        assert_eq!(tastenname(&Key::Named(NamedKey::Shift)), None);
        assert_eq!(tastenname(&Key::Named(NamedKey::CapsLock)), None);
        assert_eq!(tastenname(&Key::Dead(Some('^'))), None);
    }

    #[test]
    fn takt_nachholen_hoechstens_vier() {
        let mut t = Taktgeber::default();
        let t0 = Instant::now();
        assert_eq!(t.anfordern(t0), Some(1));
        // zu früh
        assert_eq!(t.anfordern(t0 + Duration::from_millis(5)), None);
        assert_eq!(t.faellig(), Some(t0 + SCHRITT));
        // genau ein Takt später
        assert_eq!(t.anfordern(t0 + SCHRITT), Some(1));
        // 2 Takte Rückstand
        assert_eq!(t.anfordern(t0 + SCHRITT * 3), Some(2));
        // weit zurück: höchstens 4, Rest verfällt
        assert_eq!(t.anfordern(t0 + SCHRITT * 30), Some(4));
        assert_eq!(t.anfordern(t0 + SCHRITT * 31), Some(1));
    }

    #[test]
    fn takt_json_mit_kurz_gedrueckt() {
        let mut e = Eingabe::default();
        assert_eq!(e.takt_json(1), "{\"typ\":\"takt\",\"anzahl\":1,\"tasten\":[],\"maus\":[0,0],\"knoepfe\":0}");
        e.taste("Rechts", true);
        e.taste("Leertaste", true);
        e.taste("Leertaste", false); // kurz gedrückt: kommt einmal mit
        e.knopf(1, true);
        e.knopf(1, false);
        e.maus = (12.5, 3.0);
        assert_eq!(
            e.takt_json(2),
            "{\"typ\":\"takt\",\"anzahl\":2,\"tasten\":[\"Rechts\",\"Leertaste\"],\"maus\":[12.5,3],\"knoepfe\":1}"
        );
        assert_eq!(e.takt_json(1), "{\"typ\":\"takt\",\"anzahl\":1,\"tasten\":[\"Rechts\"],\"maus\":[12.5,3],\"knoepfe\":0}");
        e.knopf(2, true);
        e.loslassen();
        assert_eq!(e.takt_json(1), "{\"typ\":\"takt\",\"anzahl\":1,\"tasten\":[],\"maus\":[12.5,3],\"knoepfe\":2}");
        assert_eq!(e.takt_json(1), "{\"typ\":\"takt\",\"anzahl\":1,\"tasten\":[],\"maus\":[12.5,3],\"knoepfe\":0}");
    }

    #[test]
    fn spielfeld_seitentreu_mit_raendern() {
        // Fenster 1000 × 400 für Spielfeld 640 × 360: Skalierung 400/360, Rand links/rechts
        let s = 400.0 / 360.0;
        let ox = (1000.0 - 640.0 * s) / 2.0;
        let (x, y) = spielfeld_punkt(ox, 0.0, (1000, 400), (640.0, 360.0));
        assert!(x.abs() < 1e-9 && y.abs() < 1e-9);
        let (x, y) = spielfeld_punkt(500.0, 200.0, (1000, 400), (640.0, 360.0));
        assert!((x - 320.0).abs() < 1e-9 && (y - 180.0).abs() < 1e-9);
        // HiDPI: doppelte Gerätepixel → gleiche Spielfeld-Koordinaten
        let (x, y) = spielfeld_punkt(640.0, 360.0, (1280, 720), (640.0, 360.0));
        assert!((x - 320.0).abs() < 1e-9 && (y - 180.0).abs() < 1e-9);
    }

    #[test]
    fn fenstergroesse_passt_auf_den_bildschirm() {
        assert_eq!(fenstergroesse((640.0, 360.0), Some((1920.0, 1080.0))), (640.0, 360.0));
        assert_eq!(fenstergroesse((4000.0, 1000.0), Some((2000.0, 1000.0))), (1800.0, 450.0));
        assert_eq!(fenstergroesse((640.0, 360.0), None), (640.0, 360.0));
    }

    #[test]
    fn offscreen_takte_bis_bild() {
        let t = offscreen_takte(3);
        assert_eq!(t.len(), 3);
        assert_eq!(t[0], "{\"typ\":\"takt\",\"anzahl\":1}");
    }
}
