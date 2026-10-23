//! Wanduhr für `Uhr.echt()` (K-087) und `Uhr.zone()` (K-154): feste Testwerte oder Systemzeit/Zeitzone.
//!
//! `zone_ms` = Ortszeit − UTC in ms (ganze Minuten, Sommerzeit berücksichtigt) zum aktuellen Zeitpunkt – wie im Browser
//! `-new Date().getTimezoneOffset() * 60000`. Windows: `SystemTimeToTzSpecificLocalTime` (aktuelle Zeitzone samt
//! Sommerzeitregel), Unix: `localtime_r` → `tm_gmtoff`. Keine Crates, nur die Systemfunktionen.

/// Feste Werte der Wanduhr eines Laufs (`--echtzeit=N`, `--zone=N`); `None` → System.
#[derive(Clone, Copy, Debug, Default)]
pub struct Wanduhr {
    pub echtzeit: Option<f64>,
    pub zone: Option<f64>,
}

impl Wanduhr {
    /// Wert von `echtzeit_ms`: fester Wert (gerundet wie Math.round) oder ganze ms seit 1970.
    pub fn echtzeit_ms(&self) -> f64 {
        match self.echtzeit {
            Some(x) if x.is_finite() => (x + 0.5).floor(),
            _ => systemzeit_ms(),
        }
    }

    /// Wert von `zone_ms`: fester Wert (gerundet) · bei fester Wanduhr ohne `zone` 0 (Tests bleiben deterministisch) ·
    /// sonst der Versatz der Ortszeit zu UTC jetzt.
    pub fn zone_ms(&self) -> f64 {
        match (self.zone, self.echtzeit) {
            (Some(z), _) if z.is_finite() => (z + 0.5).floor(),
            (_, Some(e)) if e.is_finite() => 0.0,
            _ => ortsversatz_minuten() as f64 * 60_000.0,
        }
    }
}

/// Ganze Millisekunden seit 1970-01-01 (Systemzeit).
pub fn systemzeit_ms() -> f64 {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(d) => d.as_millis() as f64,
        Err(_) => 0.0,
    }
}

/// Ortszeit − UTC in ganzen Minuten (positiv östlich von Greenwich); 0, wenn das System nichts liefert.
#[cfg(windows)]
pub fn ortsversatz_minuten() -> i64 {
    #[repr(C)]
    #[derive(Default)]
    struct SystemTime {
        jahr: u16,
        monat: u16,
        wochentag: u16,
        tag: u16,
        stunde: u16,
        minute: u16,
        sekunde: u16,
        ms: u16,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetSystemTime(st: *mut SystemTime);
        fn SystemTimeToTzSpecificLocalTime(tz: *const core::ffi::c_void, utc: *const SystemTime, lokal: *mut SystemTime) -> i32;
        fn SystemTimeToFileTime(st: *const SystemTime, ft: *mut u64) -> i32;
    }
    let mut utc = SystemTime::default();
    let mut lokal = SystemTime::default();
    let (mut f_utc, mut f_lokal) = (0u64, 0u64);
    // SAFETY: Zeiger auf gültige, korrekt ausgerichtete Strukturen (SYSTEMTIME = 8 × WORD, FILETIME = 2 × DWORD = u64).
    let ok = unsafe {
        GetSystemTime(&mut utc);
        SystemTimeToTzSpecificLocalTime(core::ptr::null(), &utc, &mut lokal) != 0
            && SystemTimeToFileTime(&utc, &mut f_utc) != 0
            && SystemTimeToFileTime(&lokal, &mut f_lokal) != 0
    };
    if !ok {
        return 0;
    }
    // FILETIME: 100-ns-Schritte → Minuten (gerundet)
    let d = f_lokal as i64 - f_utc as i64;
    (d as f64 / 600_000_000.0).round() as i64
}

/// Ortszeit − UTC in ganzen Minuten (positiv östlich von Greenwich); 0, wenn das System nichts liefert.
#[cfg(unix)]
pub fn ortsversatz_minuten() -> i64 {
    use core::ffi::{c_char, c_int, c_long};
    // `struct tm` von glibc/musl/BSD: neun int, dann tm_gmtoff (long) und tm_zone.
    #[repr(C)]
    struct Tm {
        sek: c_int,
        min: c_int,
        std: c_int,
        tag: c_int,
        mon: c_int,
        jahr: c_int,
        wtag: c_int,
        jtag: c_int,
        sommer: c_int,
        gmtoff: c_long,
        zone: *const c_char,
    }
    extern "C" {
        fn tzset();
        fn time(t: *mut i64) -> i64;
        fn localtime_r(t: *const i64, tm: *mut Tm) -> *mut Tm;
    }
    let mut tm = Tm { sek: 0, min: 0, std: 0, tag: 0, mon: 0, jahr: 0, wtag: 0, jtag: 0, sommer: 0, gmtoff: 0, zone: core::ptr::null() };
    // SAFETY: time_t ist auf allen unterstützten Unix-Zielen (64 Bit) i64; tm ist eine gültige, beschreibbare Struktur.
    let ok = unsafe {
        tzset();
        let t = time(core::ptr::null_mut());
        !localtime_r(&t, &mut tm).is_null()
    };
    if !ok {
        return 0;
    }
    (tm.gmtoff as f64 / 60.0).round() as i64
}

#[cfg(not(any(windows, unix)))]
pub fn ortsversatz_minuten() -> i64 {
    0
}
