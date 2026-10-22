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

/// `PIZZA_KEIN_DIALOG=1` (Tests/CI/Agenten): nie ein sichtbarer Dialog – kein Meldungsfenster (Meldung nur auf
/// stderr), keine Windows-Fehlerdialoge (`SetErrorMode`, WER ohne UI), Theke-Fenster bleibt unsichtbar.
/// Für echte Nutzer bleibt K-096 (Meldungsfenster beim Doppelklick) unverändert.
pub fn dialoge_unterdrueckt() -> bool {
    std::env::var_os("PIZZA_KEIN_DIALOG").map(|v| !v.is_empty() && v != "0").unwrap_or(false)
}

/// Unterdrückt mit `PIZZA_KEIN_DIALOG` die Windows-Fehlerdialoge dieses Prozesses (und seiner Kinder, die den
/// Fehlermodus erben): kritische Fehler, Absturz-Dialog („funktioniert nicht mehr“), Datei-öffnen-Fehler, WER-UI.
/// Muss früh in `main` laufen. Ohne die Variable bzw. auf anderen Systemen: nichts.
pub fn dialoge_abschalten_falls_gewuenscht() {
    #[cfg(windows)]
    if dialoge_unterdrueckt() {
        win::fehlerdialoge_aus();
    }
}

/// Entscheidung für das Meldungsfenster (K-096): nur ohne stderr (Doppelklick, kein Terminal) und nicht unterdrückt.
pub fn meldungsfenster_zeigen(stderr_da: bool, unterdrueckt: bool) -> bool {
    !stderr_da && !unterdrueckt
}

/// Meldung für den Nutzer, die nicht verloren gehen darf (z. B. „WebView2 fehlt“): nach stderr – und unter
/// Windows zusätzlich als Meldungsfenster, wenn es kein Terminal/keine Umleitung für stderr gibt (Doppelklick).
/// `PIZZA_KEIN_DIALOG=1` unterdrückt das Fenster (nur stderr).
pub fn wichtige_meldung(text: &str) {
    use std::io::Write;
    let _ = std::io::stdout().flush();
    let _ = writeln!(std::io::stderr(), "{}", text);
    #[cfg(windows)]
    {
        let stderr_da = win::stderr_vorhanden();
        if meldungsfenster_zeigen(stderr_da, dialoge_unterdrueckt()) {
            win::meldungsfenster(text);
        } else if !stderr_da {
            // Nur im Test sichtbar (PIZZA_TEST_KEIN_STDERR): belegt, dass hier sonst das Meldungsfenster käme.
            let _ = writeln!(std::io::stderr(), "(Meldungsfenster unterdrückt: PIZZA_KEIN_DIALOG)");
        }
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
        fn SetErrorMode(modus: u32) -> u32;
        fn WerSetFlags(flags: u32) -> i32;
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
        // Test-Schalter: simuliert den Doppelklick-Fall ohne stderr.
        // Wirkt nur zusammen mit PIZZA_KEIN_DIALOG – so kann der Schalter nie ein echtes Meldungsfenster auslösen.
        if std::env::var_os("PIZZA_TEST_KEIN_STDERR").is_some() && super::dialoge_unterdrueckt() {
            return false;
        }
        unsafe { gueltig(GetStdHandle(STD_ERROR_HANDLE)) }
    }

    pub fn fehlerdialoge_aus() {
        const SEM_FAILCRITICALERRORS: u32 = 0x0001;
        const SEM_NOGPFAULTERRORBOX: u32 = 0x0002;
        const SEM_NOOPENFILEERRORBOX: u32 = 0x8000;
        const WER_FAULT_REPORTING_NO_UI: u32 = 0x0020;
        unsafe {
            SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
            WerSetFlags(WER_FAULT_REPORTING_NO_UI);
        }
    }

    pub fn meldungsfenster(text: &str) {
        let t = breit(text);
        let titel = breit("pizza");
        unsafe {
            MessageBoxW(std::ptr::null_mut(), t.as_ptr(), titel.as_ptr(), MB_OK_ICONERROR);
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn meldungsfenster_nur_ohne_stderr_und_ohne_unterdrueckung() {
        use super::meldungsfenster_zeigen as z;
        assert!(z(false, false)); // Doppelklick, echter Nutzer (K-096)
        assert!(!z(true, false)); // Terminal/Umleitung
        assert!(!z(false, true)); // PIZZA_KEIN_DIALOG
        assert!(!z(true, true));
    }
}
