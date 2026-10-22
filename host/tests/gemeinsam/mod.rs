//! Gemeinsame Hilfen für die Integrationstests: jeder gestartete Host/jede EXE läuft mit `PIZZA_KEIN_DIALOG=1`
//! (nie ein Meldungsfenster, nie ein sichtbares Theke-Fenster, keine Windows-Fehlerdialoge). Zusätzlich schaltet der
//! Testprozess selbst die Windows-Fehlerdialoge ab – Kinder erben den Fehlermodus (auch für Ladefehler vor `main`).

use std::process::Command;

#[allow(dead_code)]
pub fn befehl<S: AsRef<std::ffi::OsStr>>(programm: S) -> Command {
    fehlerdialoge_aus();
    let mut c = Command::new(programm);
    c.env("PIZZA_KEIN_DIALOG", "1");
    c
}

fn fehlerdialoge_aus() {
    #[cfg(windows)]
    {
        static EINMAL: std::sync::Once = std::sync::Once::new();
        EINMAL.call_once(|| {
            #[link(name = "kernel32")]
            extern "system" {
                fn SetErrorMode(modus: u32) -> u32;
            }
            // SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX
            unsafe {
                SetErrorMode(0x0001 | 0x0002 | 0x8000);
            }
        });
    }
}
