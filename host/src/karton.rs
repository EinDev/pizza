//! Eingebettetes `.pkarton` in einer EXE.
//!
//! Format (am Dateiende angehängt):
//! ```text
//! [Host-Binary][pkarton-Bytes][u64 LE Länge der pkarton-Bytes][8 Byte Magie "PKARTON1"]
//! ```
//! Windows/Linux/macOS-Lader ignorieren angehängte Daten (Overlay), daher bleibt die EXE startfähig.
//!
//! Windows (PE): Beim Einbetten wird das Subsystem im PE-Kopf gesetzt – **WINDOWS (2)** für Programme mit Theke
//! (Importgruppe `theke`, HOST-ABI §2: kein Terminal beim Doppelklick), sonst **CONSOLE (3)** (Terminal für
//! `Bote.sage`/`Bestellannahme`). Andere Formate (ELF …) bleiben unverändert.

use std::fs;
use std::io;
use std::path::Path;

pub const MAGIE: &[u8; 8] = b"PKARTON1";
const ANHANG: usize = 16;

/// Sucht ein angehängtes `.pkarton` in den Bytes einer Datei.
pub fn finde_angehaengt(daten: &[u8]) -> Option<&[u8]> {
    if daten.len() < ANHANG {
        return None;
    }
    let ende = daten.len();
    if &daten[ende - 8..] != MAGIE {
        return None;
    }
    let mut l = [0u8; 8];
    l.copy_from_slice(&daten[ende - 16..ende - 8]);
    let len = u64::from_le_bytes(l) as usize;
    if len > ende - ANHANG {
        return None;
    }
    Some(&daten[ende - ANHANG - len..ende - ANHANG])
}

/// Pfad, unter dem sich das laufende Binary lesen lässt. Linux: `/proc/self/exe` – funktioniert auch für den
/// Theke-Teil, den der Starter aus einer `memfd`-Datei startet (`current_exe` wäre dort `/memfd:… (deleted)`).
fn eigenes_binary() -> io::Result<std::path::PathBuf> {
    #[cfg(target_os = "linux")]
    {
        let p = std::path::PathBuf::from("/proc/self/exe");
        if p.exists() {
            return Ok(p);
        }
    }
    std::env::current_exe()
}

/// Liest das Ende des eigenen Binaries und liefert ein eingebettetes `.pkarton`, falls vorhanden
/// (es werden nur die letzten 16 Bytes und ggf. der Anhang gelesen).
pub fn eingebettet() -> Option<Vec<u8>> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = fs::File::open(eigenes_binary().ok()?).ok()?;
    let groesse = f.metadata().ok()?.len();
    if groesse < ANHANG as u64 {
        return None;
    }
    let mut fuss = [0u8; ANHANG];
    f.seek(SeekFrom::Start(groesse - ANHANG as u64)).ok()?;
    f.read_exact(&mut fuss).ok()?;
    if &fuss[8..] != MAGIE {
        return None;
    }
    let len = u64::from_le_bytes(fuss[..8].try_into().ok()?);
    if len > groesse - ANHANG as u64 {
        return None;
    }
    let mut daten = vec![0u8; len as usize];
    f.seek(SeekFrom::Start(groesse - ANHANG as u64 - len)).ok()?;
    f.read_exact(&mut daten).ok()?;
    Some(daten)
}

/// PE-Subsystem „Windows-GUI“ (kein Terminal).
pub const SUBSYSTEM_FENSTER: u16 = 2;
/// PE-Subsystem „Konsole“ (Terminal).
pub const SUBSYSTEM_KONSOLE: u16 = 3;

/// Position des Subsystem-Felds im PE-Kopf (`e_lfanew + 4 + 20 + 68`) oder `None`, wenn die Bytes kein PE sind.
fn subsystem_pos(b: &[u8]) -> Option<usize> {
    if b.len() < 0x40 || &b[..2] != b"MZ" {
        return None;
    }
    let pe = u32::from_le_bytes(b[0x3c..0x40].try_into().ok()?) as usize;
    let opt = pe.checked_add(24)?;
    if b.len() < opt + 70 || &b[pe..pe + 4] != b"PE\0\0" {
        return None;
    }
    let magie = u16::from_le_bytes([b[opt], b[opt + 1]]);
    if magie != 0x10b && magie != 0x20b {
        return None;
    }
    Some(opt + 68)
}

/// Subsystem eines PE-Binaries (2 = Fenster, 3 = Konsole) oder `None` (kein PE).
pub fn subsystem(b: &[u8]) -> Option<u16> {
    subsystem_pos(b).map(|p| u16::from_le_bytes([b[p], b[p + 1]]))
}

/// Hängt `pkarton` an ein Host-Binary an (ein evtl. schon vorhandener Anhang wird ersetzt).
/// `theke`: das Programm importiert die Gruppe `theke` → bei PE-Binaries Subsystem WINDOWS, sonst CONSOLE.
pub fn baue_exe(host: &[u8], pkarton: &[u8], theke: bool) -> Vec<u8> {
    let basis: &[u8] = match finde_angehaengt(host) {
        Some(alt) => &host[..host.len() - ANHANG - alt.len()],
        None => host,
    };
    let mut o = Vec::with_capacity(basis.len() + pkarton.len() + ANHANG);
    o.extend_from_slice(basis);
    if let Some(p) = subsystem_pos(&o) {
        let wert = if theke { SUBSYSTEM_FENSTER } else { SUBSYSTEM_KONSOLE };
        o[p..p + 2].copy_from_slice(&wert.to_le_bytes());
    }
    o.extend_from_slice(pkarton);
    o.extend_from_slice(&(pkarton.len() as u64).to_le_bytes());
    o.extend_from_slice(MAGIE);
    o
}

/// Schreibt eine EXE aus dem laufenden Host-Binary + `.pkarton`.
pub fn schreibe_exe(pkarton: &[u8], theke: bool, ziel: &Path) -> io::Result<()> {
    let host = fs::read(eigenes_binary()?)?;
    let exe = baue_exe(&host, pkarton, theke);
    fs::write(ziel, exe)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut p = fs::metadata(ziel)?.permissions();
        p.set_mode(0o755);
        fs::set_permissions(ziel, p)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anhaengen_und_finden() {
        let host = b"MZ-binaer-inhalt".to_vec();
        assert!(finde_angehaengt(&host).is_none());
        let exe = baue_exe(&host, b"\0asm1234", false);
        assert_eq!(finde_angehaengt(&exe), Some(&b"\0asm1234"[..]));
        // Erneutes Einbetten ersetzt den alten Anhang.
        let exe2 = baue_exe(&exe, b"neu", true);
        assert_eq!(finde_angehaengt(&exe2), Some(&b"neu"[..]));
        assert_eq!(&exe2[..host.len()], &host[..]);
        assert_eq!(exe2.len(), host.len() + 3 + 16);
        assert_eq!(subsystem(&exe2), None); // kein PE → unverändert
    }

    /// Minimaler PE-Kopf: MZ, e_lfanew = 0x40, „PE\0\0“, COFF-Kopf, optionaler Kopf PE32+ mit Subsystem 3.
    fn pe_attrappe() -> Vec<u8> {
        let mut b = vec![0u8; 0x40 + 24 + 240];
        b[..2].copy_from_slice(b"MZ");
        b[0x3c..0x40].copy_from_slice(&0x40u32.to_le_bytes());
        b[0x40..0x44].copy_from_slice(b"PE\0\0");
        b[0x58..0x5a].copy_from_slice(&0x20bu16.to_le_bytes());
        b[0x58 + 68..0x58 + 70].copy_from_slice(&3u16.to_le_bytes());
        b
    }

    #[test]
    fn subsystem_nach_theke() {
        let host = pe_attrappe();
        assert_eq!(subsystem(&host), Some(SUBSYSTEM_KONSOLE));
        let mit = baue_exe(&host, b"\0asm", true);
        assert_eq!(subsystem(&mit), Some(SUBSYSTEM_FENSTER));
        assert_eq!(finde_angehaengt(&mit), Some(&b"\0asm"[..]));
        // Aus einer Theke-EXE eine Konsolen-EXE bauen → wieder CONSOLE (deterministisch).
        let ohne = baue_exe(&mit, b"\0asm", false);
        assert_eq!(subsystem(&ohne), Some(SUBSYSTEM_KONSOLE));
        assert_eq!(ohne, baue_exe(&host, b"\0asm", false));
    }

    #[cfg(windows)]
    #[test]
    fn eigenes_binary_ist_konsole() {
        let b = fs::read(std::env::current_exe().unwrap()).unwrap();
        assert_eq!(subsystem(&b), Some(SUBSYSTEM_KONSOLE));
    }
}
