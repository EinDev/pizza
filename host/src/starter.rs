//! Linux-Starter (Feature `starter`): ein Binary ohne GTK-/WebKitGTK-Abhängigkeit, das den Theke-Teil
//! (das vollständige `pizza-host` mit wry/tao, dynamisch gegen WebKitGTK 4.1 gelinkt) als Bytes eingebettet trägt.
//!
//! Warum: Ein gegen WebKitGTK gelinktes ELF startet ohne `libwebkit2gtk-4.1.so.0` gar nicht – der System-Lader
//! meldet nur „error while loading shared libraries …“, auch für Programme ohne Theke. Der Starter braucht nur glibc:
//! - Programm ohne Theke (keine Importe `pizza.ui_*`): läuft direkt im Starter (wasmi), WebKitGTK wird nie angefasst.
//! - Programm mit Theke: Probe `dlopen("libwebkit2gtk-4.1.so.0")`. Fehlt sie → verständliche Meldung, Exit 2
//!   (K-083: kein stiller Konsolenbetrieb), ebenso ohne Anzeige (K-096). Sonst wird der Theke-Teil in eine `memfd`-Datei geschrieben (bei einer
//!   EXE samt angehängtem `.pkarton`) und per `exec` mit denselben Argumenten gestartet – er verhält sich genau wie
//!   bisher (Fenster, Exit-Code des Programms). Nichts landet auf der Platte, `/tmp` mit `noexec` stört nicht.
//!
//! Gebaut von `baue-ziele.sh` (linux-x64): erst `pizza-host` mit Theke, dann dieser Starter mit
//! `PIZZA_THEKE_EXE=<pfad>` (build.rs bettet die Datei ein). Ausgeliefert wird nur der Starter – eine Datei.

use std::ffi::{c_char, c_int, c_uint, c_void, CStr};
use std::io::Write;

mod eingebettet {
    include!(concat!(env!("OUT_DIR"), "/theke_exe.rs"));
}

/// Meldung, wenn WebKitGTK fehlt. Wortlaut abgestimmt mit `voraussetzung()` in `baue-ziele.sh` (ziele.json).
pub const WEBKIT_FEHLT: &str = "Dieses Programm braucht WebKitGTK 4.1 für sein Theke-Fenster. Installieren mit: \
sudo apt install libwebkit2gtk-4.1-0 (Debian/Ubuntu) bzw. sudo dnf install webkit2gtk4.1 (Fedora).";

/// Bibliothek, gegen die der Theke-Teil gelinkt ist (zieht GTK 3, libsoup 3, JavaScriptCore mit).
const WEBKIT_SO: &CStr = c"libwebkit2gtk-4.1.so.0";

const RTLD_NOW: c_int = 2;
const MFD_CLOEXEC: c_uint = 1;

extern "C" {
    fn dlopen(datei: *const c_char, flags: c_int) -> *mut c_void;
    fn dlerror() -> *mut c_char;
    fn memfd_create(name: *const c_char, flags: c_uint) -> c_int;
}

/// Ist der Theke-Teil in diesem Build enthalten?
pub fn theke_teil_vorhanden() -> bool {
    !eingebettet::THEKE_EXE.is_empty()
}

/// Lässt sich WebKitGTK 4.1 samt Abhängigkeiten laden? `Err` = Meldung des Laders (für `--debug`).
/// `PIZZA_TEST_OHNE_WEBKIT=1` tut so, als fehle es (Tests).
pub fn webkit_vorhanden() -> Result<(), String> {
    if std::env::var_os("PIZZA_TEST_OHNE_WEBKIT").is_some() {
        return Err("PIZZA_TEST_OHNE_WEBKIT".into());
    }
    // Absichtlich nie dlclose: dieselbe Bibliothek lädt gleich der Theke-Teil (nach exec ohnehin neu).
    let h = unsafe { dlopen(WEBKIT_SO.as_ptr(), RTLD_NOW) };
    if !h.is_null() {
        return Ok(());
    }
    let e = unsafe { dlerror() };
    Err(if e.is_null() { "dlopen fehlgeschlagen".into() } else { unsafe { CStr::from_ptr(e) }.to_string_lossy().into_owned() })
}

/// Startet den Theke-Teil an Stelle dieses Prozesses (kehrt nur bei einem Fehler zurück, dann mit Exit-Code 2
/// nach einer Meldung). `pkarton`: bei einer EXE das eingebettete Programm (wird wieder angehängt), sonst `None`
/// (der Theke-Teil liest die Datei aus den Argumenten selbst).
pub fn theke_starten(pkarton: Option<&[u8]>, debug: bool) -> i32 {
    let melde = |text: &str, detail: Option<String>| crate::anzeige::abbruch(text, detail.as_deref(), debug);
    if !theke_teil_vorhanden() {
        return melde("Dieser pizza-host wurde ohne Theke-Teil gebaut – Programme mit Theke-Fenster laufen damit nicht.", None);
    }
    if let Err(e) = webkit_vorhanden() {
        return melde(WEBKIT_FEHLT, Some(e));
    }
    // K-096: ohne Anzeige (z. B. SSH) gar nicht erst den Theke-Teil starten (der prüft es sonst selbst).
    if !crate::anzeige::anzeige_vorhanden() {
        return melde(crate::anzeige::KEINE_ANZEIGE, None);
    }
    match exec_theke(pkarton) {
        Ok(nie) => match nie {},
        Err(e) => melde("Das Theke-Fenster konnte nicht gestartet werden.", Some(e.to_string())),
    }
}

enum Nie {}

fn exec_theke(pkarton: Option<&[u8]>) -> std::io::Result<Nie> {
    use std::os::fd::FromRawFd;
    use std::os::unix::process::CommandExt;

    let fd = unsafe { memfd_create(c"pizza-theke".as_ptr(), MFD_CLOEXEC) };
    if fd < 0 {
        return Err(std::io::Error::last_os_error());
    }
    // Eigentum am fd: nach exec schließt ihn der Kern (CLOEXEC), bei einem Fehler der Drop von `datei`.
    let mut datei = unsafe { std::fs::File::from_raw_fd(fd) };
    match pkarton {
        Some(p) => datei.write_all(&crate::karton::baue_exe(eingebettet::THEKE_EXE, p, true))?,
        None => datei.write_all(eingebettet::THEKE_EXE)?,
    }
    datei.flush()?;
    let mut argv = std::env::args_os();
    let arg0 = argv.next().unwrap_or_else(|| "pizza".into());
    let _ = std::io::stdout().flush();
    let _ = std::io::stderr().flush();
    let e = std::process::Command::new(format!("/proc/self/fd/{}", fd)).arg0(arg0).args(argv).exec();
    drop(datei);
    Err(e)
}
