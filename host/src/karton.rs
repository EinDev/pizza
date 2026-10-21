//! Eingebettetes `.pkarton` in einer EXE.
//!
//! Format (am Dateiende angehängt):
//! ```text
//! [Host-Binary][pkarton-Bytes][u64 LE Länge der pkarton-Bytes][8 Byte Magie "PKARTON1"]
//! ```
//! Windows/Linux/macOS-Lader ignorieren angehängte Daten (Overlay), daher bleibt die EXE startfähig.

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

/// Liest das Ende des eigenen Binaries und liefert ein eingebettetes `.pkarton`, falls vorhanden
/// (es werden nur die letzten 16 Bytes und ggf. der Anhang gelesen).
pub fn eingebettet() -> Option<Vec<u8>> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = fs::File::open(std::env::current_exe().ok()?).ok()?;
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

/// Hängt `pkarton` an ein Host-Binary an (ein evtl. schon vorhandener Anhang wird ersetzt).
pub fn baue_exe(host: &[u8], pkarton: &[u8]) -> Vec<u8> {
    let basis: &[u8] = match finde_angehaengt(host) {
        Some(alt) => &host[..host.len() - ANHANG - alt.len()],
        None => host,
    };
    let mut o = Vec::with_capacity(basis.len() + pkarton.len() + ANHANG);
    o.extend_from_slice(basis);
    o.extend_from_slice(pkarton);
    o.extend_from_slice(&(pkarton.len() as u64).to_le_bytes());
    o.extend_from_slice(MAGIE);
    o
}

/// Schreibt eine EXE aus dem laufenden Host-Binary + `.pkarton`.
pub fn schreibe_exe(pkarton: &[u8], ziel: &Path) -> io::Result<()> {
    let host = fs::read(std::env::current_exe()?)?;
    let exe = baue_exe(&host, pkarton);
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
        let exe = baue_exe(&host, b"\0asm1234");
        assert_eq!(finde_angehaengt(&exe), Some(&b"\0asm1234"[..]));
        // Erneutes Einbetten ersetzt den alten Anhang.
        let exe2 = baue_exe(&exe, b"neu");
        assert_eq!(finde_angehaengt(&exe2), Some(&b"neu"[..]));
        assert_eq!(&exe2[..host.len()], &host[..]);
        assert_eq!(exe2.len(), host.len() + 3 + 16);
    }
}
