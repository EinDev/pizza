//! Klang-Wiedergabe des nativen Hosts (SPEC §18.8, K-153): **Mischer** (Spuren mit Lautstärke, Tonhöhe, Panorama, Raum am
//! Hörer = Kamera des Herds) und Ziel – das Gerät oder eine WAV-Datei (`--klang-datei`). Nicht Teil der Bitgleichheit.
//!
//! - **Gerät:** Windows `waveOut` (winmm.dll, zur Laufzeit geladen), Linux ALSA (`libasound.so.2` per `dlopen`, kein
//!   Link-Zwang, K-130). Geöffnet erst beim ersten Klang-Ereignis; geht es nicht, eine Meldung auf stderr und das Programm
//!   läuft stumm weiter. Tests, JSON-Modus, `--ui-ereignisse`, `--herd-bilder` und `PIZZA_KLANG=0` öffnen nie ein Gerät.
//! - **Datei:** `--klang-datei=x.wav` mischt im Programm-Thread mit, getaktet von den Herd-Bildern (je Takt 800 Frames bei
//!   48 kHz) – so lässt sich ein Spiel offline (`--herd-bilder`) anhören. Ohne Herd beginnt alles bei 0 und läuft aus.
//! - **Hörer:** aus dem SZENE-Block jedes Bildpakets (`kamera` und die Rechts-Achse der Ansicht), Formel `herd_klang::raum`
//!   – dieselbe wie im Browser (`site/js/klang/spieler.js`).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use herd_klang::{raum, Hoerer, RATE};

/// Frames je Takt (48 kHz / 60).
pub const FRAMES_JE_TAKT: usize = RATE / 60;

// ---------------------------------------------------------------- JSON (Ereignisse des Moduls, feste Form)

/// Rohwert eines Felds (`"name":…`) im flachen Ereignis-JSON.
fn feld<'a>(json: &'a str, name: &str) -> Option<&'a str> {
    let schluessel = format!("\"{}\":", name);
    let rest = &json[json.find(&schluessel)? + schluessel.len()..];
    let rest = rest.trim_start();
    let ende = if rest.starts_with('[') {
        rest.find(']')? + 1
    } else if let Some(r) = rest.strip_prefix('"') {
        r.find('"')? + 2
    } else {
        rest.find([',', '}']).unwrap_or(rest.len())
    };
    Some(rest[..ende].trim())
}
fn zahl(json: &str, name: &str) -> Option<f64> {
    feld(json, name)?.parse().ok()
}
fn text<'a>(json: &'a str, name: &str) -> Option<&'a str> {
    feld(json, name)?.strip_prefix('"')?.strip_suffix('"')
}
fn lage(json: &str) -> Option<(f64, f64, f64)> {
    let v = feld(json, "lage")?;
    let v = v.strip_prefix('[')?.strip_suffix(']')?;
    let mut it = v.split(',').map(|x| x.trim().parse::<f64>().ok());
    Some((it.next()??, it.next()??, it.next()??))
}

/// Hörer aus einem Bildpaket (Abschnitt SZENE = 10: `ansicht_proj` spaltenweise, `kamera` ab Byte 128); None ohne SZENE.
pub fn hoerer_aus_paket(p: &[u8]) -> Option<Hoerer> {
    let u32_an = |i: usize| -> Option<u32> { Some(u32::from_le_bytes(p.get(i..i + 4)?.try_into().ok()?)) };
    let f32_an = |i: usize| -> Option<f64> { Some(f32::from_le_bytes(p.get(i..i + 4)?.try_into().ok()?) as f64) };
    if p.get(0..4)? != b"HZP1" {
        return None;
    }
    let n = u32_an(20)? as usize;
    let mut i = 32;
    for _ in 0..n {
        let (art, laenge) = (u32_an(i)?, u32_an(i + 4)? as usize);
        let d = i + 8;
        if art == 10 {
            let (rx, ry, rz) = (f32_an(d)?, f32_an(d + 16)?, f32_an(d + 32)?);
            let l = (rx * rx + ry * ry + rz * rz).sqrt();
            let (rx, ry, rz) = if l > 1e-9 { (rx / l, ry / l, rz / l) } else { (1.0, 0.0, 0.0) };
            return Some(Hoerer { x: f32_an(d + 128)?, y: f32_an(d + 132)?, z: f32_an(d + 136)?, rechts_x: rx, rechts_y: ry, rechts_z: rz });
        }
        i = d + ((laenge + 3) & !3);
    }
    None
}

// ---------------------------------------------------------------- Mischer

/// PCM eines Klangs: Samples (verschachtelt), Abtastrate, Kanäle (H-K19a: geladene Klänge mit eigener Rate, mono/stereo).
#[derive(Clone)]
struct KlangDaten {
    pcm: Arc<[i16]>,
    rate: u32,
    kanaele: usize,
}

/// PCM-Übergabe an die Wiedergabe: Samples, Abtastrate (Hz), Kanäle.
pub type Pcm<'a> = (&'a [i16], u32, u8);

struct Stimme {
    spur: u32,
    pcm: Arc<[i16]>,
    /// Kanäle der PCM (1 oder 2)
    kanaele: usize,
    /// Quell-Frames je Geräte-Frame bei Tonhöhe 1 (Quellrate / 48 000) – das Umrechnen auf die Geräterate
    schritt: f64,
    /// Lage in Quell-Frames
    pos: f64,
    laut: f64,
    ton: f64,
    pan: f64,
    lage: Option<(f64, f64, f64)>,
    reichweite: f64,
    schleife: bool,
    /// gestoppt: in einem Block auf 0 ausblenden, dann weg
    aus: bool,
    gl: f32,
    gr: f32,
    tief: f32,
    tief_r: f32,
    neu: bool,
}

impl Stimme {
    fn frames(&self) -> usize {
        self.pcm.len() / self.kanaele
    }
    /// Sample (−1 … 1) von Kanal `k` an Frame `i`
    fn wert(&self, i: usize, k: usize) -> f32 {
        self.pcm[i * self.kanaele + k] as f32 / 32767.0
    }
}

/// Mischt alle laufenden Spuren zu Stereo (f32, verschränkt).
pub struct Mischer {
    klaenge: HashMap<String, KlangDaten>,
    stimmen: Vec<Stimme>,
    hoerer: Hoerer,
    /// Gesamtlautstärke (0 … 1)
    pub laut: f32,
}

impl Default for Mischer {
    fn default() -> Mischer {
        Mischer { klaenge: HashMap::new(), stimmen: Vec::new(), hoerer: Hoerer::default(), laut: 0.8 }
    }
}

impl Mischer {
    /// Ein Ereignis des Moduls (`spiele` mit PCM, `stoppe`, `setze`).
    pub fn ereignis(&mut self, json: &str, pcm: Option<Pcm<'_>>) {
        let art = text(json, "art").unwrap_or("");
        let spur = zahl(json, "spur").unwrap_or(0.0) as u32;
        match art {
            "spiele" => {
                let hash = text(json, "klang").unwrap_or("").to_string();
                if let Some((p, rate, kanaele)) = pcm {
                    let kanaele = (kanaele as usize).clamp(1, 2);
                    let rate = if rate == 0 { RATE as u32 } else { rate };
                    if p.len() >= kanaele {
                        self.klaenge.entry(hash.clone()).or_insert_with(|| KlangDaten { pcm: Arc::from(p), rate, kanaele });
                    }
                }
                let Some(k) = self.klaenge.get(&hash).cloned() else { return };
                self.stimmen.push(Stimme {
                    spur,
                    pcm: k.pcm,
                    kanaele: k.kanaele,
                    schritt: k.rate as f64 / RATE as f64,
                    pos: 0.0,
                    laut: zahl(json, "lautstaerke").unwrap_or(1.0),
                    ton: zahl(json, "tonhoehe").unwrap_or(1.0),
                    pan: zahl(json, "panorama").unwrap_or(0.0),
                    lage: None,
                    reichweite: 30.0,
                    schleife: feld(json, "schleife") == Some("true"),
                    aus: false,
                    gl: 0.0,
                    gr: 0.0,
                    tief: 0.0,
                    tief_r: 0.0,
                    neu: true,
                });
            }
            "stoppe" => {
                for s in self.stimmen.iter_mut().filter(|s| s.spur == spur) {
                    s.aus = true;
                }
            }
            "setze" => {
                for s in self.stimmen.iter_mut().filter(|s| s.spur == spur) {
                    s.laut = zahl(json, "lautstaerke").unwrap_or(s.laut);
                    s.ton = zahl(json, "tonhoehe").unwrap_or(s.ton);
                    s.pan = zahl(json, "panorama").unwrap_or(s.pan);
                    s.lage = lage(json);
                    s.reichweite = zahl(json, "reichweite").unwrap_or(s.reichweite);
                }
            }
            // H-K22 Schall: Pegel und Panorama hat der Kern schon am Hörer gerechnet – keine Lage, kein Raum hier
            "raum" => {
                for s in self.stimmen.iter_mut().filter(|s| s.spur == spur) {
                    s.laut = zahl(json, "lautstaerke").unwrap_or(s.laut);
                    s.ton = zahl(json, "tonhoehe").unwrap_or(s.ton);
                    s.pan = zahl(json, "panorama").unwrap_or(s.pan);
                }
            }
            _ => {}
        }
    }

    pub fn setze_hoerer(&mut self, h: Hoerer) {
        self.hoerer = h;
    }

    /// Laufende Spuren (für Tests).
    pub fn anzahl(&self) -> usize {
        self.stimmen.len()
    }

    /// `aus.len() / 2` Frames mischen (überschreibt `aus`).
    pub fn mische(&mut self, aus: &mut [f32]) {
        for x in aus.iter_mut() {
            *x = 0.0;
        }
        let frames = aus.len() / 2;
        if frames == 0 {
            return;
        }
        let h = self.hoerer;
        let gesamt = self.laut;
        for s in self.stimmen.iter_mut() {
            // Ziel-Werte dieses Blocks
            let (mut g, mut pan, mut fc) = (s.laut, s.pan, 20_000.0);
            if let Some(l) = s.lage {
                let (gr, pr, tr) = raum(l, s.reichweite, &h);
                g *= gr;
                pan = (pan + pr).clamp(-1.0, 1.0);
                fc = tr;
            }
            if s.aus {
                g = 0.0;
            }
            let w = (pan + 1.0) * std::f64::consts::FRAC_PI_4;
            let (zl, zr) = ((g * w.cos()) as f32 * gesamt, (g * w.sin()) as f32 * gesamt);
            if s.neu {
                s.gl = zl;
                s.gr = zr;
                s.neu = false;
            }
            let a = if fc >= 19_000.0 { 1.0 } else { (1.0 - (-2.0 * std::f64::consts::PI * fc / RATE as f64).exp()) as f32 };
            let (dl, dr) = ((zl - s.gl) / frames as f32, (zr - s.gr) / frames as f32);
            let n = s.frames();
            // Stereo-Klänge ohne Lage behalten links/rechts (Panorama als Balance, Mitte = volle Stärke); mit Lage mono gemischt
            let stereo = s.kanaele == 2 && s.lage.is_none();
            let schritt = s.ton * s.schritt;
            for f in 0..frames {
                if s.pos >= n as f64 {
                    if s.schleife && n > 0 {
                        s.pos -= n as f64;
                    } else {
                        break;
                    }
                }
                let i = s.pos as usize;
                let t = (s.pos - i as f64) as f32;
                let j = if i + 1 < n { Some(i + 1) } else if s.schleife { Some(0) } else { None };
                let lies = |k: usize| {
                    let a0 = s.wert(i, k);
                    let a1 = j.map(|j| s.wert(j, k)).unwrap_or(0.0);
                    a0 + (a1 - a0) * t
                };
                let (xl, xr) = if s.kanaele == 2 { (lies(0), lies(1)) } else { let x = lies(0); (x, x) };
                s.gl += dl;
                s.gr += dr;
                if stereo {
                    s.tief += a * (xl - s.tief);
                    s.tief_r += a * (xr - s.tief_r);
                    aus[2 * f] += s.tief * s.gl * std::f32::consts::SQRT_2;
                    aus[2 * f + 1] += s.tief_r * s.gr * std::f32::consts::SQRT_2;
                } else {
                    let x = if s.kanaele == 2 { (xl + xr) * 0.5 } else { xl };
                    s.tief += a * (x - s.tief);
                    aus[2 * f] += s.tief * s.gl;
                    aus[2 * f + 1] += s.tief * s.gr;
                }
                s.pos += schritt;
            }
        }
        self.stimmen.retain(|s| !s.aus && (s.schleife || s.pos < s.frames() as f64));
        for x in aus.iter_mut() {
            *x = x.clamp(-1.0, 1.0);
        }
    }
}

/// f32 (−1 … 1) → i16
fn als_i16(x: f32) -> i16 {
    (x * 32767.0).round().clamp(-32768.0, 32767.0) as i16
}

// ---------------------------------------------------------------- Wiedergabe

enum Ziel {
    Geraet,
    Datei { pfad: PathBuf, daten: Vec<i16>, bild: u64 },
}

/// Wiedergabe eines Laufs (geteilt zwischen Programm-Thread und Gerät).
pub struct Wiedergabe {
    mischer: Mutex<Mischer>,
    ziel: Mutex<Ziel>,
    laeuft: AtomicBool,
    gestartet: AtomicBool,
    halt: Arc<AtomicBool>,
    faden: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl std::fmt::Debug for Wiedergabe {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Wiedergabe")
    }
}

impl Wiedergabe {
    /// Wiedergabe über das Gerät (geöffnet beim ersten Ereignis).
    pub fn geraet() -> Arc<Wiedergabe> {
        let w = Wiedergabe::mit(Ziel::Geraet);
        // Prüfhilfe `PIZZA_KLANG_STILL=1`: das Gerät läuft, gespielt wird Stille (Gerätepfad testen, ohne etwas zu hören)
        if std::env::var("PIZZA_KLANG_STILL").map(|v| v == "1").unwrap_or(false) {
            w.mischer().laut = 0.0;
        }
        w
    }
    /// Wiedergabe in eine WAV-Datei (48 kHz, 16 Bit, stereo), geschrieben bei [`Wiedergabe::ende`].
    pub fn datei(pfad: PathBuf) -> Arc<Wiedergabe> {
        Wiedergabe::mit(Ziel::Datei { pfad, daten: Vec::new(), bild: 0 })
    }
    fn mit(ziel: Ziel) -> Arc<Wiedergabe> {
        Arc::new(Wiedergabe {
            mischer: Mutex::new(Mischer::default()),
            ziel: Mutex::new(ziel),
            laeuft: AtomicBool::new(true),
            gestartet: AtomicBool::new(false),
            halt: Arc::new(AtomicBool::new(false)),
            faden: Mutex::new(None),
        })
    }

    fn mischer(&self) -> std::sync::MutexGuard<'_, Mischer> {
        self.mischer.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Ereignis des Moduls (Programm-Thread).
    pub fn ereignis(self: &Arc<Self>, json: &str, pcm: Option<Pcm<'_>>) {
        if !self.laeuft.load(Ordering::Relaxed) {
            return;
        }
        self.mischer().ereignis(json, pcm);
        let geraet = matches!(*self.ziel.lock().unwrap_or_else(|e| e.into_inner()), Ziel::Geraet);
        if geraet && !self.gestartet.swap(true, Ordering::Relaxed) {
            let w = self.clone();
            let halt = self.halt.clone();
            let faden = std::thread::Builder::new().name("klang".into()).spawn(move || {
                if let Err(grund) = geraet::spiele(&w, &halt) {
                    eprintln!("Kein Ton: {} – das Programm läuft stumm weiter.", grund);
                }
            });
            if let Ok(f) = faden {
                *self.faden.lock().unwrap_or_else(|e| e.into_inner()) = Some(f);
            }
        }
    }

    /// Ein Herd-Bild wurde gesendet: Hörer aus dem Bildpaket; bei Datei-Ziel die Takte bis hierher mischen.
    pub fn bild(&self, bildnummer: u64, paket: Option<&[u8]>) {
        if let Some(h) = paket.and_then(hoerer_aus_paket) {
            self.mischer().setze_hoerer(h);
        }
        let mut z = self.ziel.lock().unwrap_or_else(|e| e.into_inner());
        if let Ziel::Datei { daten, bild, .. } = &mut *z {
            if bildnummer > *bild {
                let frames = (bildnummer - *bild) as usize * FRAMES_JE_TAKT;
                *bild = bildnummer;
                let mut puf = vec![0f32; frames * 2];
                self.mischer().mische(&mut puf);
                daten.extend(puf.iter().map(|&x| als_i16(x)));
            }
        }
    }

    /// Programmende: Gerät anhalten bzw. Datei schreiben (Rest bis höchstens 10 s auslaufen lassen).
    pub fn ende(&self) {
        self.laeuft.store(false, Ordering::Relaxed);
        // Gerät: Spuren ohne Schleife ausklingen lassen (höchstens 10 s) – ein Programm ohne Herd ist sonst schneller fertig
        // als sein erster Ton
        if self.gestartet.load(Ordering::Relaxed) {
            let t0 = std::time::Instant::now();
            while t0.elapsed() < std::time::Duration::from_secs(10) && self.mischer().stimmen.iter().any(|s| !s.schleife) {
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
        }
        self.halt.store(true, Ordering::Relaxed);
        if let Some(f) = self.faden.lock().unwrap_or_else(|e| e.into_inner()).take() {
            let _ = f.join();
        }
        let mut z = self.ziel.lock().unwrap_or_else(|e| e.into_inner());
        if let Ziel::Datei { pfad, daten, bild } = &mut *z {
            let mut puf = vec![0f32; FRAMES_JE_TAKT * 2];
            // ohne Herd-Bilder: mindestens 5 s (Schleifen hörbar), sonst bis die letzte Spur ohne Schleife aus ist
            let mindestens = if *bild == 0 { 300 } else { 0 };
            for i in 0..600 {
                let mut m = self.mischer();
                if i >= mindestens && m.stimmen.iter().all(|s| s.schleife) {
                    break;
                }
                m.mische(&mut puf);
                drop(m);
                daten.extend(puf.iter().map(|&x| als_i16(x)));
            }
            if let Err(e) = std::fs::write(&*pfad, wav(daten)) {
                eprintln!("Klang-Datei {} lässt sich nicht schreiben: {}", pfad.display(), e);
            }
        }
    }

    /// Mischt einen Block (Gerät).
    fn block(&self, puf: &mut [f32]) {
        self.mischer().mische(puf);
    }
}

/// WAV-Datei (RIFF, PCM 16 Bit, stereo, 48 kHz).
pub fn wav(daten: &[i16]) -> Vec<u8> {
    let n = (daten.len() * 2) as u32;
    let mut b = Vec::with_capacity(44 + n as usize);
    b.extend_from_slice(b"RIFF");
    b.extend_from_slice(&(36 + n).to_le_bytes());
    b.extend_from_slice(b"WAVEfmt ");
    b.extend_from_slice(&16u32.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&2u16.to_le_bytes());
    b.extend_from_slice(&(RATE as u32).to_le_bytes());
    b.extend_from_slice(&(RATE as u32 * 4).to_le_bytes());
    b.extend_from_slice(&4u16.to_le_bytes());
    b.extend_from_slice(&16u16.to_le_bytes());
    b.extend_from_slice(b"data");
    b.extend_from_slice(&n.to_le_bytes());
    for s in daten {
        b.extend_from_slice(&s.to_le_bytes());
    }
    b
}

// ---------------------------------------------------------------- Geräte

/// Frames je Geräte-Puffer (20 ms).
const BLOCK: usize = 960;

#[cfg(windows)]
mod geraet {
    //! Windows: `waveOut` aus winmm.dll (zur Laufzeit geladen), Ereignis-Rückruf, vier Puffer à 20 ms.
    use super::{als_i16, Wiedergabe, BLOCK};
    use herd_klang::RATE;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[repr(C)]
    struct WaveFormat {
        format: u16,
        kanaele: u16,
        rate: u32,
        bytes_je_s: u32,
        block: u16,
        bits: u16,
        extra: u16,
    }
    #[repr(C)]
    struct WaveHdr {
        daten: *mut u8,
        laenge: u32,
        aufgenommen: u32,
        nutzer: usize,
        flags: u32,
        schleifen: u32,
        naechster: *mut WaveHdr,
        reserviert: usize,
    }
    const WHDR_DONE: u32 = 1;
    const CALLBACK_EVENT: u32 = 0x0005_0000;
    const WAVE_MAPPER: u32 = 0xFFFF_FFFF;
    type Open = unsafe extern "system" fn(*mut usize, u32, *const WaveFormat, usize, usize, u32) -> u32;
    type Hdr = unsafe extern "system" fn(usize, *mut WaveHdr, u32) -> u32;
    type Einfach = unsafe extern "system" fn(usize) -> u32;

    #[link(name = "kernel32")]
    extern "system" {
        fn LoadLibraryW(name: *const u16) -> isize;
        fn GetProcAddress(m: isize, name: *const u8) -> *const core::ffi::c_void;
        fn CreateEventW(attr: *const core::ffi::c_void, manuell: i32, start: i32, name: *const u16) -> isize;
        fn WaitForSingleObject(h: isize, ms: u32) -> u32;
        fn CloseHandle(h: isize) -> i32;
    }

    pub fn spiele(w: &Wiedergabe, halt: &AtomicBool) -> Result<(), String> {
        unsafe {
            let name: Vec<u16> = "winmm.dll\0".encode_utf16().collect();
            let dll = LoadLibraryW(name.as_ptr());
            if dll == 0 {
                return Err("winmm.dll fehlt".into());
            }
            let f = |n: &[u8]| GetProcAddress(dll, n.as_ptr());
            let (o, p, wr, up, rs, cl) = (f(b"waveOutOpen\0"), f(b"waveOutPrepareHeader\0"), f(b"waveOutWrite\0"), f(b"waveOutUnprepareHeader\0"), f(b"waveOutReset\0"), f(b"waveOutClose\0"));
            if [o, p, wr, up, rs, cl].iter().any(|x| x.is_null()) {
                return Err("waveOut fehlt in winmm.dll".into());
            }
            let (open, prep, write, unprep, reset, close): (Open, Hdr, Hdr, Hdr, Einfach, Einfach) = (
                core::mem::transmute(o),
                core::mem::transmute(p),
                core::mem::transmute(wr),
                core::mem::transmute(up),
                core::mem::transmute(rs),
                core::mem::transmute(cl),
            );
            let ereignis = CreateEventW(core::ptr::null(), 0, 0, core::ptr::null());
            let fmt = WaveFormat { format: 1, kanaele: 2, rate: RATE as u32, bytes_je_s: RATE as u32 * 4, block: 4, bits: 16, extra: 0 };
            let mut h: usize = 0;
            if open(&mut h, WAVE_MAPPER, &fmt, ereignis as usize, 0, CALLBACK_EVENT) != 0 {
                CloseHandle(ereignis);
                return Err("kein Audiogerät (waveOutOpen)".into());
            }
            let mut puffer: Vec<Vec<i16>> = (0..4).map(|_| vec![0i16; BLOCK * 2]).collect();
            let mut kopf: Vec<WaveHdr> = puffer
                .iter_mut()
                .map(|b| WaveHdr { daten: b.as_mut_ptr() as *mut u8, laenge: (BLOCK * 4) as u32, aufgenommen: 0, nutzer: 0, flags: 0, schleifen: 0, naechster: core::ptr::null_mut(), reserviert: 0 })
                .collect();
            let gr = core::mem::size_of::<WaveHdr>() as u32;
            for k in kopf.iter_mut() {
                prep(h, k, gr);
                k.flags |= WHDR_DONE;
            }
            let mut mix = vec![0f32; BLOCK * 2];
            while !halt.load(Ordering::Relaxed) {
                let mut geschrieben = false;
                for (i, k) in kopf.iter_mut().enumerate() {
                    if k.flags & WHDR_DONE != 0 {
                        w.block(&mut mix);
                        for (z, &x) in puffer[i].iter_mut().zip(mix.iter()) {
                            *z = als_i16(x);
                        }
                        k.flags &= !WHDR_DONE;
                        write(h, k, gr);
                        geschrieben = true;
                    }
                }
                if !geschrieben {
                    WaitForSingleObject(ereignis, 50);
                }
            }
            reset(h);
            for k in kopf.iter_mut() {
                unprep(h, k, gr);
            }
            close(h);
            CloseHandle(ereignis);
            Ok(())
        }
    }
}

#[cfg(target_os = "linux")]
mod geraet {
    //! Linux: ALSA aus `libasound.so.2` per `dlopen` (keine NEEDED-Bibliothek, K-130), Gerät „default“, 60 ms Latenz.
    use super::{als_i16, Wiedergabe, BLOCK};
    use core::ffi::{c_char, c_int, c_long, c_uint, c_ulong, c_void};
    use herd_klang::RATE;
    use std::sync::atomic::{AtomicBool, Ordering};

    extern "C" {
        fn dlopen(name: *const c_char, flags: c_int) -> *mut c_void;
        fn dlsym(h: *mut c_void, name: *const c_char) -> *mut c_void;
    }
    type Open = unsafe extern "C" fn(*mut *mut c_void, *const c_char, c_int, c_int) -> c_int;
    type Params = unsafe extern "C" fn(*mut c_void, c_int, c_int, c_uint, c_uint, c_int, c_uint) -> c_int;
    type Writei = unsafe extern "C" fn(*mut c_void, *const c_void, c_ulong) -> c_long;
    type Recover = unsafe extern "C" fn(*mut c_void, c_int, c_int) -> c_int;
    type Close = unsafe extern "C" fn(*mut c_void) -> c_int;

    pub fn spiele(w: &Wiedergabe, halt: &AtomicBool) -> Result<(), String> {
        unsafe {
            let lib = dlopen(c"libasound.so.2".as_ptr(), 2);
            if lib.is_null() {
                return Err("libasound.so.2 fehlt (ALSA)".into());
            }
            let f = |n: &core::ffi::CStr| dlsym(lib, n.as_ptr());
            let (o, p, wr, rc, cl) = (f(c"snd_pcm_open"), f(c"snd_pcm_set_params"), f(c"snd_pcm_writei"), f(c"snd_pcm_recover"), f(c"snd_pcm_close"));
            if [o, p, wr, rc, cl].iter().any(|x| x.is_null()) {
                return Err("ALSA-Funktionen fehlen".into());
            }
            let (open, params, writei, recover, close): (Open, Params, Writei, Recover, Close) =
                (core::mem::transmute(o), core::mem::transmute(p), core::mem::transmute(wr), core::mem::transmute(rc), core::mem::transmute(cl));
            let mut pcm: *mut c_void = core::ptr::null_mut();
            if open(&mut pcm, c"default".as_ptr(), 0, 0) < 0 {
                return Err("kein Audiogerät (snd_pcm_open)".into());
            }
            // S16_LE = 2, RW_INTERLEAVED = 3, stereo, 48 kHz, Resampling erlaubt, 60 ms
            if params(pcm, 2, 3, 2, RATE as c_uint, 1, 60_000) < 0 {
                close(pcm);
                return Err("Audiogerät lehnt 48 kHz stereo ab".into());
            }
            let mut mix = vec![0f32; BLOCK * 2];
            let mut aus = vec![0i16; BLOCK * 2];
            while !halt.load(Ordering::Relaxed) {
                w.block(&mut mix);
                for (z, &x) in aus.iter_mut().zip(mix.iter()) {
                    *z = als_i16(x);
                }
                let mut rest = 0usize;
                while rest < BLOCK && !halt.load(Ordering::Relaxed) {
                    let n = writei(pcm, aus[rest * 2..].as_ptr() as *const c_void, (BLOCK - rest) as c_ulong);
                    if n < 0 {
                        if recover(pcm, n as c_int, 1) < 0 {
                            close(pcm);
                            return Err("Audiogerät verloren".into());
                        }
                    } else {
                        rest += n as usize;
                    }
                }
            }
            close(pcm);
            Ok(())
        }
    }
}

#[cfg(not(any(windows, target_os = "linux")))]
mod geraet {
    use super::Wiedergabe;
    use std::sync::atomic::AtomicBool;
    pub fn spiele(_w: &Wiedergabe, _halt: &AtomicBool) -> Result<(), String> {
        Err("auf diesem System gibt es noch keine Tonausgabe".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ton(k: &mut herd_klang::Klaenge) -> Vec<i16> {
        let id = k.ton(440.0, 0.1, "sinus", 0.5, 0.0, 0.0, 0.0).unwrap();
        k.pcm(id).unwrap().to_vec()
    }

    #[test]
    fn json_felder() {
        let j = "{\"art\":\"setze\",\"spur\":3,\"lautstaerke\":0.5,\"tonhoehe\":1,\"panorama\":-0.25,\"lage\":[1,2.5,-3],\"reichweite\":30}";
        assert_eq!(text(j, "art"), Some("setze"));
        assert_eq!(zahl(j, "spur"), Some(3.0));
        assert_eq!(zahl(j, "panorama"), Some(-0.25));
        assert_eq!(lage(j), Some((1.0, 2.5, -3.0)));
        assert_eq!(lage("{\"lage\":null}"), None);
    }

    #[test]
    fn mischen_spielen_stoppen() {
        let mut k = herd_klang::Klaenge::neu();
        let p = ton(&mut k);
        let mut m = Mischer::default();
        m.ereignis("{\"art\":\"spiele\",\"spur\":1,\"klang\":\"aa\",\"lautstaerke\":1,\"tonhoehe\":1,\"panorama\":0,\"schleife\":false}", Some((&p, 48_000, 1)));
        m.ereignis("{\"art\":\"spiele\",\"spur\":2,\"klang\":\"aa\",\"lautstaerke\":1,\"tonhoehe\":2,\"panorama\":1,\"schleife\":true}", None);
        assert_eq!(m.anzahl(), 2);
        let mut puf = vec![0f32; 2 * 2400];
        m.mische(&mut puf);
        assert!(puf.iter().any(|&x| x.abs() > 0.05), "es klingt");
        // Spur 2 ganz rechts: links nur Spur 1
        m.mische(&mut puf);
        assert_eq!(m.anzahl(), 1, "Spur 1 ist nach 0.1 s aus");
        m.ereignis("{\"art\":\"stoppe\",\"spur\":2}", None);
        m.mische(&mut puf);
        assert_eq!(m.anzahl(), 0);
    }

    /// H-K22 Schall: „raum“ setzt Pegel, Tonhöhe und Panorama (vom Kern am Hörer gerechnet), ohne Lage
    #[test]
    fn raum_setzt_pegel_und_panorama() {
        let mut k = herd_klang::Klaenge::neu();
        let p = ton(&mut k);
        let mut m = Mischer::default();
        m.ereignis("{\"art\":\"spiele\",\"spur\":1,\"klang\":\"aa\",\"lautstaerke\":1,\"tonhoehe\":1,\"panorama\":0,\"schleife\":true}", Some((&p, 48_000, 1)));
        m.ereignis("{\"art\":\"raum\",\"spur\":1,\"lautstaerke\":0.5,\"tonhoehe\":1.25,\"panorama\":1}", None);
        assert_eq!((m.stimmen[0].laut, m.stimmen[0].ton, m.stimmen[0].pan, m.stimmen[0].lage), (0.5, 1.25, 1.0, None));
        let mut puf = vec![0f32; 2 * 2400];
        m.mische(&mut puf);
        m.mische(&mut puf);
        assert!(puf.iter().step_by(2).all(|&x| x.abs() < 1e-6), "links still");
        assert!(puf.iter().skip(1).step_by(2).any(|&x| x.abs() > 0.02), "rechts klingt");
    }

    /// H-K19a: geladener Klang mit eigener Rate (24 kHz → halb so viele Quell-Frames je Geräte-Frame) und Stereo
    #[test]
    fn eigene_rate_und_stereo() {
        let mut m = Mischer::default();
        // 0,1 s Stereo bei 24 kHz: links laut, rechts still
        let p: Vec<i16> = (0..2400).flat_map(|i| [if i % 2 == 0 { 20_000 } else { -20_000 }, 0]).collect();
        let spiele = |spur: u32| format!("{{\"art\":\"spiele\",\"spur\":{},\"klang\":\"st\",\"lautstaerke\":1,\"tonhoehe\":1,\"panorama\":0,\"schleife\":false}}", spur);
        m.ereignis(&spiele(1), Some((&p, 24_000, 2)));
        let mut puf = vec![0f32; 2 * 4800];
        m.mische(&mut puf);
        assert!(puf.iter().step_by(2).any(|&x| x.abs() > 0.1), "links klingt");
        assert!(puf.iter().skip(1).step_by(2).all(|&x| x.abs() < 1e-6), "rechts still");
        assert_eq!(m.anzahl(), 0, "0,1 s bei 24 kHz sind nach 4800 Geräte-Frames vorbei");
        m.ereignis(&spiele(2), None);
        let mut kurz = vec![0f32; 2 * 4799];
        m.mische(&mut kurz);
        assert_eq!(m.anzahl(), 1, "ein Frame fehlt noch");
    }

    #[test]
    fn hoerer_aus_bildpaket() {
        let mut k = herd_kern::Kern::neu();
        let t = b"";
        assert!(k.welt_neu(320.0, 180.0, t) >= 0);
        let n = k.bild(1);
        assert!(n > 0);
        let h = hoerer_aus_paket(k.paket()).expect("SZENE");
        assert!((h.rechts_x * h.rechts_x + h.rechts_y * h.rechts_y + h.rechts_z * h.rechts_z - 1.0).abs() < 1e-6);
        assert!(hoerer_aus_paket(b"XXXX").is_none());
    }

    #[test]
    fn wav_kopf() {
        let b = wav(&[0, 1, 2, 3]);
        assert_eq!(&b[0..4], b"RIFF");
        assert_eq!(b.len(), 44 + 8);
        assert_eq!(u32::from_le_bytes(b[24..28].try_into().unwrap()), 48_000);
    }
}
