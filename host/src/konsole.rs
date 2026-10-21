//! Terminal-Anbindung unter Windows.
//!
//! Eine EXE mit Theke wird mit Subsystem WINDOWS gebaut (karton.rs): Per Doppelklick erscheint kein Terminal.
//! Wird sie aus einem Terminal gestartet, hängt sie sich mit `AttachConsole(ATTACH_PARENT_PROCESS)` an dessen
//! Konsole und schreibt ihre Ausgaben dort hinein. Ohne Eltern-Terminal gehen Konsolen-Ausgaben verloren (gewollt).
//! Konsolenprogramme (Subsystem CONSOLE, auch `pizza-host` selbst) bekommen ihr Terminal vom Betriebssystem
//! (eigenes Fenster beim Doppelklick, sonst das des Aufrufers) – dort ist `anhaengen` wirkungslos.
//! Andere Systeme: nichts zu tun.

/// Hängt einen Prozess ohne Konsole an das Terminal des Eltern-Prozesses und setzt fehlende Standard-Handles
/// (stdin/stdout/stderr) auf `CONIN$`/`CONOUT$`. Umgeleitete Handles (`> datei`, Pipes) bleiben unangetastet.
/// Muss vor jeder Ausgabe aufgerufen werden.
pub fn anhaengen() {
    #[cfg(windows)]
    win::anhaengen();
}

/// Meldung für den Nutzer, die nicht verloren gehen darf (z. B. „WebView2 fehlt“): nach stderr – und unter
/// Windows zusätzlich als Meldungsfenster, wenn es kein Terminal/keine Umleitung für stderr gibt (Doppelklick).
pub fn wichtige_meldung(text: &str) {
    use std::io::Write;
    let _ = std::io::stdout().flush();
    let _ = writeln!(std::io::stderr(), "{}", text);
    #[cfg(windows)]
    if !win::stderr_vorhanden() {
        win::meldungsfenster(text);
    }
}

#[cfg(windows)]
mod win {
    use std::ffi::c_void;

    type Handle = *mut c_void;
    const ATTACH_PARENT_PROCESS: u32 = u32::MAX; // (DWORD)-1
    const STD_INPUT_HANDLE: u32 = -10i32 as u32;
    const STD_OUTPUT_HANDLE: u32 = -11i32 as u32;
    const STD_ERROR_HANDLE: u32 = -12i32 as u32;
    const GENERIC_READ: u32 = 0x8000_0000;
    const GENERIC_WRITE: u32 = 0x4000_0000;
    const FILE_SHARE_READ: u32 = 1;
    const FILE_SHARE_WRITE: u32 = 2;
    const OPEN_EXISTING: u32 = 3;
    const INVALID_HANDLE_VALUE: Handle = -1isize as Handle;
    const MB_OK_ICONERROR: u32 = 0x10;

    #[link(name = "kernel32")]
    extern "system" {
        fn AttachConsole(pid: u32) -> i32;
        fn GetConsoleWindow() -> Handle;
        fn GetStdHandle(n: u32) -> Handle;
        fn SetStdHandle(n: u32, h: Handle) -> i32;
        fn CreateFileW(name: *const u16, zugriff: u32, teilen: u32, sa: *mut c_void, art: u32, flags: u32, vorlage: Handle) -> Handle;
    }
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(fenster: Handle, text: *const u16, titel: *const u16, art: u32) -> i32;
    }

    fn breit(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn gueltig(h: Handle) -> bool {
        !h.is_null() && h != INVALID_HANDLE_VALUE
    }

    pub fn anhaengen() {
        unsafe {
            // Konsolenprozess (Subsystem CONSOLE) → hat schon ein Terminal, nichts tun.
            if !GetConsoleWindow().is_null() {
                return;
            }
            // Geerbte Handles (`> datei`, Pipes) vorher merken: AttachConsole ersetzt sie u. U. durch die Konsole.
            let geerbt = [STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE].map(|n| GetStdHandle(n));
            if AttachConsole(ATTACH_PARENT_PROCESS) == 0 {
                return; // kein Eltern-Terminal (Doppelklick) → ohne Konsole weiter
            }
            let zugriff = GENERIC_READ | GENERIC_WRITE;
            for (i, (n, name)) in [(STD_INPUT_HANDLE, "CONIN$"), (STD_OUTPUT_HANDLE, "CONOUT$"), (STD_ERROR_HANDLE, "CONOUT$")]
                .into_iter()
                .enumerate()
            {
                if gueltig(geerbt[i]) {
                    SetStdHandle(n, geerbt[i]); // umgeleitet → behalten
                    continue;
                }
                let w = breit(name);
                let h = CreateFileW(w.as_ptr(), zugriff, FILE_SHARE_READ | FILE_SHARE_WRITE, std::ptr::null_mut(), OPEN_EXISTING, 0, std::ptr::null_mut());
                if gueltig(h) {
                    SetStdHandle(n, h);
                }
            }
        }
    }

    pub fn stderr_vorhanden() -> bool {
        unsafe { gueltig(GetStdHandle(STD_ERROR_HANDLE)) }
    }

    pub fn meldungsfenster(text: &str) {
        let t = breit(text);
        let titel = breit("pizza");
        unsafe {
            MessageBoxW(std::ptr::null_mut(), t.as_ptr(), titel.as_ptr(), MB_OK_ICONERROR);
        }
    }
}
