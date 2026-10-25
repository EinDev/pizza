//! Herd (SPEC §18, HERD.md §7.1, HOST-ABI §2 Gruppe `herd`): der **native Kern** als wasmi-Hostfunktionen.
//!
//! - Modul `herd`: je Export von `kern.wasm` eine Hostfunktion mit gleichem Namen und gleicher Signatur, die die
//!   gleichnamige Methode von [`herd_kern::Kern`] ruft (herd/README.md §3). Alle Zeiger zeigen in den **Kern-Speicher**:
//!   hier ein Host-`Vec<u8>` (`puffer(len)` liefert einen festen Versatz darin, nie 0 – 0 heißt „leer“ wie in kern-wasm).
//!   Das Bildpaket liegt virtuell ab [`PAKET_BASIS`] (`bild_zeiger()`), gelesen wird es direkt aus `Kern::paket()`.
//! - Modul `pizza`: `herd_kern`, `herd_schreibe`/`herd_lies` (Kopierweg Programm ↔ Kern), `herd_warte` (= `ui_warte`,
//!   gleiche Quelle), `herd_senden` (Ereignis `herd` + Bildpaket an den Renderer, siehe [`HerdAnbindung`]).
//! - Der Kern entsteht erst beim ersten Aufruf (wie kern-wasm); ein Lauf = eine Welt.
//! - Test `PIZZA_TEST_OHNE_HERD_KERN=1`: der Kern „fehlt“ – `herd_kern(1)` meldet den HOST-Fehler (K-128), alle
//!   `herd.*` sind Trap (wie die Platzhalter des JS-Hosts).

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use herd_kern::Kern;
use wasmi::{Caller, Extern, Linker};

use crate::ereignis::Ereignis;
use crate::laufen::Zustand;

/// Text des HOST-Fehlers, wenn der Kern fehlt (HOST-ABI §2, K-128).
pub const KERN_FEHLT: &str = "PizzaFehler HOST: Der Herd-Kern fehlt (kern.wasm).";

/// Versatz des Austauschpuffers im (nachgebildeten) Kern-Speicher – 8-Byte-ausgerichtet, nie 0.
const PUFFER_BASIS: usize = 8;
/// Virtuelle Adresse des Bildpakets (`bild_zeiger()`); darunter liegt der Austauschpuffer.
pub const PAKET_BASIS: usize = 0x4000_0000;

/// Namen aller Kern-Exporte (`kern.wasm`, herd/README.md §3) = bekannte Importe des Moduls `herd`.
/// Die Laufzeit importiert davon 55 (HOST-ABI §2, inkl. `bildchen_teigling` für `Bildchen.laden`, `eingabe` (H-K12) und die
/// Modell-Exporte `modell_teig`, `modell_teil`, `modell_info`, `modell_text`, `teil_finde` (H-K16)); die übrigen (`abi_version`,
/// `fehler_code`, `welt_hole`, `bildchen_rgba`, `bild_zeiger`) stellt der Host ebenfalls bereit – ein Programm darf jeden Export binden.
pub const IMPORTE_HERD: [&str; 60] = [
    "abi_version", "puffer", "fehler_art", "fehler_code", "fehler_text", "fehler_neu", "melde_typfehler",
    "welt_neu", "welt_titel", "welt_hintergrund", "welt_himmel", "welt_umgebung", "welt_nebel", "welt_hole",
    "teil_neu", "teil_entferne", "teil_kopie", "teil_haenge", "teil_kinder", "teil_setze", "teil_hole", "teil_lage",
    "teil_verschiebe", "teil_groesse", "teil_schaue", "teil_trifft",
    "komp_neu", "komp_haenge", "komp_loese", "komp_von", "komp_info", "typ_nummer", "feld_nummer",
    "setze_zahl", "hole_zahl", "setze_text", "hole_text", "setze_liste", "hole_liste", "setze_zahlen", "hole_zahlen",
    "form_grund", "form_eigene", "bildchen_neu", "bildchen_rgba", "bildchen_teigling", "ressource_hole",
    "modell_teig", "modell_teil", "modell_info", "modell_text", "teil_finde",
    "eingabe", "takt", "bild", "bild_zeiger", "paket_voll", "hash_szene", "hash_paket", "schema_json",
];

/// Bekannte Importe `pizza.herd_*` (HOST-ABI §2).
pub const IMPORTE_PIZZA: [&str; 5] = ["herd_kern", "herd_schreibe", "herd_lies", "herd_warte", "herd_senden"];

/// Importiert das Modul die Gruppe `herd` (Modul `herd` oder `pizza.herd_*`)? Entscheidet über Fenster, Starter und
/// PE-Subsystem (wie `braucht_theke`).
pub fn importiert_herd(module: &wasmi::Module) -> bool {
    module.imports().any(|i| i.module() == "herd" || (i.module() == "pizza" && i.name().starts_with("herd_")))
}

/// Ziel der `herd_senden`-Ereignisse (Fenster, Offscreen-PNGs): `(art, json ohne typ, Bildpaket bei „bild“)`.
/// Läuft im Programm-Thread; das Paket ist nur während des Aufrufs gültig.
pub struct HerdAnbindung(pub Box<dyn FnMut(&str, &str, Option<&[u8]>) + Send>);

impl std::fmt::Debug for HerdAnbindung {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("HerdAnbindung")
    }
}

// ---------------------------------------------------------------- Messung (`--herd-messung`)

/// Zahlen einer Messsekunde: Bilder, Zeiten (Programm-Thread: Programm/Kern, Renderer: Glut), Statistik des letzten Bildes.
#[derive(Default, Clone, Copy)]
struct MessWerte {
    bilder: u32,
    takte: u32,
    programm: Duration,
    kern: Duration,
    glut: Duration,
    gezeichnet: u32,
    draw_calls: u32,
    instanzen_2d: u32,
    instanzen_3d: u32,
}

/// So viele erste Bilder je Fenster beschreibt `--herd-messung` einzeln („Anlauf“, HERD.md §6).
pub const ANLAUF_BILDER: u32 = 30;

/// Anlauf eines Fensters: Zeitpunkt des `fenster`; je Bild die Programm-Zahlen (Takte, Programm, Kern) und die Glut-Zahlen
/// (Zeitpunkt, Glut-Zeit). Programm-Thread und Renderer melden in beliebiger Reihenfolge; gedruckt wird Bild k, sobald beide
/// Seiten es gemeldet haben.
#[derive(Default)]
struct Anlauf {
    start: Option<Instant>,
    programm: Vec<(u32, Duration, Duration)>,
    glut: Vec<(Instant, Duration)>,
    gedruckt: usize,
}

/// `--herd-messung` (HERD.md §6): je Sekunde Bildzeit, Anteil Programm/Kern/Glut, Draw-Calls, Instanzen auf stderr; dazu je
/// Fenster der **Anlauf** – Glut-Anlegen und die ersten [`ANLAUF_BILDER`] Bilder einzeln (Abstand, Takte, Programm/Kern/Glut).
/// Programm-Thread und Renderer (Fenster-Hauptthread bzw. Offscreen im Programm-Thread) tragen bei; wer nach Ablauf
/// einer Sekunde zuerst beiträgt, schreibt die Zeile.
pub struct Messung {
    werte: Mutex<(MessWerte, Instant)>,
    anlauf: Mutex<Anlauf>,
}

impl Default for Messung {
    fn default() -> Self {
        Messung { werte: Mutex::new((MessWerte::default(), Instant::now())), anlauf: Mutex::new(Anlauf::default()) }
    }
}

impl std::fmt::Debug for Messung {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Messung")
    }
}

/// Millisekunden mit Komma (deutsch), zwei Nachkommastellen.
fn ms(d: Duration, n: u32) -> String {
    let x = if n == 0 { 0.0 } else { d.as_secs_f64() * 1000.0 / n as f64 };
    format!("{:.2}", x).replace('.', ",")
}

impl Messung {
    /// Renderer: ein Fenster beginnt (Anlauf von vorn).
    pub fn fenster(&self) {
        let mut a = self.anlauf.lock().unwrap_or_else(|e| e.into_inner());
        *a = Anlauf { start: Some(Instant::now()), ..Default::default() };
    }

    /// Renderer: Glut angelegt (in `dauer`, inkl. Pipelines).
    pub fn glut_bereit(&self, dauer: Duration) {
        eprintln!("Herd-Anlauf: Glut angelegt in {} ms", ms(dauer, 1));
    }

    /// Programm-Thread: ein Bild fertig (Takt angenommen → Bild gesendet), davon `kern` im Kern.
    pub fn programm(&self, takte: u32, gesamt: Duration, kern: Duration) {
        {
            let mut a = self.anlauf.lock().unwrap_or_else(|e| e.into_inner());
            if a.programm.len() < ANLAUF_BILDER as usize {
                a.programm.push((takte, gesamt.saturating_sub(kern), kern));
                Messung::anlauf_drucken(&mut a);
            }
        }
        let mut g = self.werte.lock().unwrap_or_else(|e| e.into_inner());
        g.0.bilder += 1;
        g.0.takte += takte;
        g.0.kern += kern;
        g.0.programm += gesamt.saturating_sub(kern);
        drop(g);
        self.melde_wenn_faellig();
    }

    /// Renderer: ein Bild gezeichnet (Zeit in der Glut, Statistik).
    pub fn glut(&self, zeit: Duration, draw_calls: u32, instanzen_2d: u32, instanzen_3d: u32) {
        {
            let mut a = self.anlauf.lock().unwrap_or_else(|e| e.into_inner());
            if a.glut.len() < ANLAUF_BILDER as usize {
                a.glut.push((Instant::now(), zeit));
                Messung::anlauf_drucken(&mut a);
            }
        }
        let mut g = self.werte.lock().unwrap_or_else(|e| e.into_inner());
        g.0.gezeichnet += 1;
        g.0.glut += zeit;
        g.0.draw_calls = draw_calls;
        g.0.instanzen_2d = instanzen_2d;
        g.0.instanzen_3d = instanzen_3d;
        drop(g);
        self.melde_wenn_faellig();
    }

    /// Anlauf: die ersten [`ANLAUF_BILDER`] Bilder eines Fensters je eine Zeile, z. B.
    /// `Herd-Anlauf: Bild 1 · 52,10 ms nach Fenster · Abstand 52,10 ms · 1 Takt · Programm 3,20 ms · Kern 1,10 ms · Glut 40,02 ms`
    /// (Zeitpunkte = Ende des Zeichnens; Abstand = zum vorigen Bild, beim ersten zum `fenster`).
    fn anlauf_drucken(a: &mut Anlauf) {
        let start = *a.start.get_or_insert_with(Instant::now);
        while a.gedruckt < a.programm.len().min(a.glut.len()) {
            let k = a.gedruckt;
            let (takte, programm, kern) = a.programm[k];
            let (zeitpunkt, glut) = a.glut[k];
            let vorher = if k == 0 { start } else { a.glut[k - 1].0 };
            eprintln!(
                "Herd-Anlauf: Bild {} · {} ms nach Fenster · Abstand {} ms · {} Takt{} · Programm {} ms · Kern {} ms · Glut {} ms",
                k + 1,
                ms(zeitpunkt.saturating_duration_since(start), 1),
                ms(zeitpunkt.saturating_duration_since(vorher), 1),
                takte,
                if takte == 1 { "" } else { "e" },
                ms(programm, 1),
                ms(kern, 1),
                ms(glut, 1)
            );
            a.gedruckt += 1;
        }
    }

    /// Eine Zeile je Sekunde nach stderr.
    fn melde_wenn_faellig(&self) {
        let mut g = self.werte.lock().unwrap_or_else(|e| e.into_inner());
        let vergangen = g.1.elapsed();
        if vergangen < Duration::from_secs(1) {
            return;
        }
        let w = g.0;
        g.0 = MessWerte { draw_calls: w.draw_calls, instanzen_2d: w.instanzen_2d, instanzen_3d: w.instanzen_3d, ..Default::default() };
        g.1 = Instant::now();
        drop(g);
        eprintln!("{}", messzeile(&w, vergangen));
    }
}

/// `Herd: 60 Bilder/s (60 Takte) · Bildzeit 16,67 ms · Programm 1,20 ms (7 %) · Kern 0,85 ms (5 %) · Glut 2,10 ms (13 %) · 4 Draw-Calls · 10000 Instanzen (2D 10000, 3D 0)`
fn messzeile(w: &MessWerte, dauer: Duration) -> String {
    let s = dauer.as_secs_f64().max(1e-9);
    let bilder = w.bilder.max(w.gezeichnet);
    let bildzeit = if bilder == 0 { 0.0 } else { s * 1000.0 / bilder as f64 };
    let anteil = |d: Duration, n: u32| -> String {
        if bilder == 0 || bildzeit <= 0.0 || n == 0 {
            return "0 %".into();
        }
        format!("{:.0} %", (d.as_secs_f64() * 1000.0 / n as f64) / bildzeit * 100.0)
    };
    format!(
        "Herd: {} Bilder/s ({} Takte) · Bildzeit {} ms · Programm {} ms ({}) · Kern {} ms ({}) · Glut {} ms ({}) · {} Draw-Calls · {} Instanzen (2D {}, 3D {})",
        (bilder as f64 / s).round(),
        (w.takte as f64 / s).round(),
        format!("{:.2}", bildzeit).replace('.', ","),
        ms(w.programm, w.bilder),
        anteil(w.programm, w.bilder),
        ms(w.kern, w.bilder),
        anteil(w.kern, w.bilder),
        ms(w.glut, w.gezeichnet),
        anteil(w.glut, w.gezeichnet),
        w.draw_calls,
        w.instanzen_2d + w.instanzen_3d,
        w.instanzen_2d,
        w.instanzen_3d
    )
}

// ---------------------------------------------------------------- Zustand

/// Herd-Teil des Laufzustands.
#[derive(Default)]
pub struct HerdZustand {
    kern: Option<Kern>,
    /// Nachgebildeter Kern-Speicher (Austauschpuffer ab `PUFFER_BASIS`).
    speicher: Vec<u8>,
    /// Test: Kern fehlt (`PIZZA_TEST_OHNE_HERD_KERN=1`).
    fehlt: bool,
    anbindung: Option<HerdAnbindung>,
    messung: Option<Arc<Messung>>,
    /// Messung: Zeitpunkt des angenommenen Takts, Anzahl, Kern-Zeit seither.
    takt_seit: Option<(Instant, u32)>,
    kern_zeit: Duration,
}

impl HerdZustand {
    pub fn neu(anbindung: Option<HerdAnbindung>, messung: Option<Arc<Messung>>) -> HerdZustand {
        let fehlt = std::env::var_os("PIZZA_TEST_OHNE_HERD_KERN").is_some_and(|v| v == "1");
        HerdZustand { fehlt, anbindung, messung, ..Default::default() }
    }

    fn kern(&mut self) -> &mut Kern {
        self.kern.get_or_insert_with(Kern::neu)
    }

    /// Bereich `[p, p+l)` im Kern-Speicher (wächst bei Bedarf, wie der lineare Speicher von kern.wasm); `l <= 0` oder
    /// `p == 0` → leer (wie kern-wasm).
    fn bereich(&mut self, p: i32, l: i32) -> Result<&mut [u8], wasmi::Error> {
        if l <= 0 || p == 0 {
            return Ok(&mut []);
        }
        let (p, l) = (p as u32 as usize, l as u32 as usize);
        let ende = p.checked_add(l).filter(|&e| e <= PAKET_BASIS).ok_or_else(|| wasmi::Error::new("herd: Zeiger außerhalb des Kern-Speichers"))?;
        if self.speicher.len() < ende {
            self.speicher.resize(ende, 0);
        }
        Ok(&mut self.speicher[p..ende])
    }

    /// Eingabe-Bytes (Kopie, damit der Kern danach veränderlich geliehen werden kann).
    fn bytes(&mut self, p: i32, l: i32) -> Result<Vec<u8>, wasmi::Error> {
        Ok(self.bereich(p, l)?.to_vec())
    }

    fn zahlen(&mut self, p: i32, n: i32) -> Result<Vec<f64>, wasmi::Error> {
        let b = self.bereich(p, n.max(0).saturating_mul(8))?;
        Ok(b.chunks_exact(8).map(|c| f64::from_le_bytes(c.try_into().unwrap_or([0; 8]))).collect())
    }

    fn ids(&mut self, p: i32, n: i32) -> Result<Vec<u32>, wasmi::Error> {
        let b = self.bereich(p, n.max(0).saturating_mul(4))?;
        Ok(b.chunks_exact(4).map(|c| u32::from_le_bytes(c.try_into().unwrap_or([0; 4]))).collect())
    }

    /// Text mit Retry (K-013): passt er nicht in `kap`, wird nichts geschrieben.
    fn text_aus(&mut self, t: &[u8], p: i32, kap: i32) -> Result<i32, wasmi::Error> {
        if t.len() as i64 <= kap as i64 {
            self.bereich(p, t.len() as i32)?.copy_from_slice(t);
        }
        Ok(t.len() as i32)
    }

    fn zahlen_aus(&mut self, v: &[f64], p: i32) -> Result<(), wasmi::Error> {
        let ziel = self.bereich(p, v.len() as i32 * 8)?;
        for (i, x) in v.iter().enumerate() {
            ziel[i * 8..i * 8 + 8].copy_from_slice(&x.to_le_bytes());
        }
        Ok(())
    }

    fn ids_aus(&mut self, v: &[u32], p: i32) -> Result<(), wasmi::Error> {
        let ziel = self.bereich(p, v.len() as i32 * 4)?;
        for (i, x) in v.iter().enumerate() {
            ziel[i * 4..i * 4 + 4].copy_from_slice(&x.to_le_bytes());
        }
        Ok(())
    }

    /// Lesen aus dem Kern-Speicher für `herd_lies` (Austauschpuffer oder Bildpaket ab `PAKET_BASIS`).
    fn lies(&mut self, kp: i32, n: usize) -> Result<Vec<u8>, wasmi::Error> {
        let kp = kp as u32 as usize;
        if kp >= PAKET_BASIS {
            let paket = self.kern.as_ref().map(|k| k.paket()).unwrap_or(&[]);
            let a = kp - PAKET_BASIS;
            return paket.get(a..a.saturating_add(n)).map(|b| b.to_vec()).ok_or_else(|| wasmi::Error::new("herd_lies: außerhalb des Bildpakets"));
        }
        Ok(self.bereich(kp as i32, n as i32)?.to_vec())
    }

    /// Kern-Zeit messen (nur mit `--herd-messung`).
    fn gemessen<R>(&mut self, f: impl FnOnce(&mut Kern) -> R) -> R {
        if self.messung.is_none() {
            return f(self.kern());
        }
        let t = Instant::now();
        let r = f(self.kern());
        self.kern_zeit += t.elapsed();
        r
    }

    /// `herd_warte` hat ein Ereignis geliefert (Messung: Beginn eines Bildes bei `takt`).
    fn takt_angenommen(&mut self, e: &str) {
        if self.messung.is_none() {
            return;
        }
        let kompakt: String = e.chars().filter(|c| !c.is_whitespace()).collect();
        if kompakt.contains("\"typ\":\"takt\"") {
            let anzahl = kompakt
                .split("\"anzahl\":")
                .nth(1)
                .and_then(|r| r.split(|c: char| !c.is_ascii_digit()).next())
                .and_then(|z| z.parse::<u32>().ok())
                .unwrap_or(1)
                .clamp(1, 4);
            self.takt_seit = Some((Instant::now(), anzahl));
            self.kern_zeit = Duration::ZERO;
        }
    }
}

type C<'a> = Caller<'a, Zustand>;

fn hz<'a>(c: &'a mut C<'_>) -> Result<&'a mut HerdZustand, wasmi::Error> {
    let h = &mut c.data_mut().herd;
    if h.fehlt {
        return Err(wasmi::Error::new("Herd-Kern nicht geladen"));
    }
    Ok(h)
}

/// Text aus dem Programm-Speicher.
fn prog_bytes(c: &C<'_>, p: i32, n: i32) -> Result<Vec<u8>, wasmi::Error> {
    let Some(Extern::Memory(mem)) = c.get_export("memory") else {
        return Err(wasmi::Error::new("Export 'memory' fehlt"));
    };
    let (p, n) = (p as u32 as usize, n.max(0) as u32 as usize);
    mem.data(c).get(p..p.saturating_add(n)).map(|b| b.to_vec()).ok_or_else(|| wasmi::Error::new("herd: Zeiger außerhalb des Programm-Speichers"))
}

/// Bindet die Importe der Gruppe `herd` (Modul `herd` und `pizza.herd_*`).
pub(crate) fn binde(l: &mut Linker<Zustand>) -> Result<(), wasmi::errors::LinkerError> {
    // ---- Modul „herd“: Kern-Exporte
    l.func_wrap("herd", "abi_version", |mut c: C| -> Result<i32, wasmi::Error> { hz(&mut c).map(|_| 1) })?;
    l.func_wrap("herd", "puffer", |mut c: C, len: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let n = (len.max(0) as usize).div_ceil(8).max(1) * 8;
        if h.speicher.len() < PUFFER_BASIS + n {
            h.speicher.resize(PUFFER_BASIS + n, 0);
        }
        Ok(PUFFER_BASIS as i32)
    })?;
    l.func_wrap("herd", "fehler_art", |mut c: C| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().fehler_art()) })?;
    l.func_wrap("herd", "fehler_code", |mut c: C| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().fehler_code()) })?;
    l.func_wrap("herd", "fehler_neu", |mut c: C| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().fehler_neu()) })?;
    l.func_wrap("herd", "fehler_text", |mut c: C, p: i32, kap: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let t = h.kern().fehler_text().as_bytes().to_vec();
        h.text_aus(&t, p, kap)
    })?;
    l.func_wrap("herd", "melde_typfehler", |mut c: C, typ: i32, feld: i32, p: i32, n: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let b = h.bytes(p, n)?;
        Ok(h.kern().melde_typfehler(typ, feld, &b))
    })?;

    l.func_wrap("herd", "welt_neu", |mut c: C, b: f64, ho: f64, p: i32, n: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let t = h.bytes(p, n)?;
        Ok(h.kern().welt_neu(b, ho, &t))
    })?;
    l.func_wrap("herd", "welt_titel", |mut c: C, p: i32, n: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let t = h.bytes(p, n)?;
        Ok(h.kern().welt_titel(&t))
    })?;
    l.func_wrap("herd", "welt_hintergrund", |mut c: C, p: i32, n: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let t = h.bytes(p, n)?;
        Ok(h.kern().welt_hintergrund(&t))
    })?;
    l.func_wrap("herd", "welt_himmel", |mut c: C, op: i32, on: i32, up: i32, un: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let (o, u) = (h.bytes(op, on)?, h.bytes(up, un)?);
        Ok(h.kern().welt_himmel(&o, &u))
    })?;
    l.func_wrap("herd", "welt_umgebung", |mut c: C, p: i32, n: i32, s: f64| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let t = h.bytes(p, n)?;
        Ok(h.kern().welt_umgebung(&t, s))
    })?;
    l.func_wrap("herd", "welt_nebel", |mut c: C, p: i32, n: i32, von: f64, bis: f64| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let t = h.bytes(p, n)?;
        Ok(h.kern().welt_nebel(&t, von, bis))
    })?;
    l.func_wrap("herd", "welt_hole", |mut c: C, was: i32| -> Result<f64, wasmi::Error> { Ok(hz(&mut c)?.kern().welt_hole(was)) })?;

    l.func_wrap("herd", "teil_neu", |mut c: C, raum: i32| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().teil_neu(raum)) })?;
    l.func_wrap("herd", "teil_entferne", |mut c: C, t: i32| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().teil_entferne(t)) })?;
    l.func_wrap("herd", "teil_kopie", |mut c: C, t: i32| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().teil_kopie(t)) })?;
    l.func_wrap("herd", "teil_haenge", |mut c: C, t: i32, an: i32| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().teil_haenge(t, an)) })?;
    l.func_wrap("herd", "teil_kinder", |mut c: C, t: i32, p: i32, kap: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let mut v = vec![0u32; kap.max(0) as usize];
        let n = h.kern().teil_kinder(t, &mut v);
        if n >= 0 && n <= kap {
            h.ids_aus(&v[..n as usize], p)?;
        }
        Ok(n)
    })?;
    l.func_wrap("herd", "teil_setze", |mut c: C, t: i32, f: i32, w: f64| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().teil_setze(t, f, w)) })?;
    l.func_wrap("herd", "teil_hole", |mut c: C, t: i32, f: i32| -> Result<f64, wasmi::Error> { Ok(hz(&mut c)?.kern().teil_hole(t, f)) })?;
    l.func_wrap("herd", "teil_lage", |mut c: C, t: i32, x: f64, y: f64, z: f64| -> Result<i32, wasmi::Error> {
        Ok(hz(&mut c)?.kern().teil_lage(t, x, y, z))
    })?;
    l.func_wrap("herd", "teil_verschiebe", |mut c: C, t: i32, x: f64, y: f64, z: f64| -> Result<i32, wasmi::Error> {
        Ok(hz(&mut c)?.kern().teil_verschiebe(t, x, y, z))
    })?;
    l.func_wrap("herd", "teil_groesse", |mut c: C, t: i32, x: f64, y: f64, z: f64| -> Result<i32, wasmi::Error> {
        Ok(hz(&mut c)?.kern().teil_groesse(t, x, y, z))
    })?;
    l.func_wrap("herd", "teil_schaue", |mut c: C, t: i32, x: f64, y: f64, z: f64| -> Result<i32, wasmi::Error> {
        Ok(hz(&mut c)?.kern().teil_schaue(t, x, y, z))
    })?;
    l.func_wrap("herd", "teil_trifft", |mut c: C, a: i32, b: i32| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().teil_trifft(a, b)) })?;

    l.func_wrap("herd", "komp_neu", |mut c: C, typ: i32| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().komp_neu(typ)) })?;
    l.func_wrap("herd", "komp_haenge", |mut c: C, k: i32, t: i32| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().komp_haenge(k, t)) })?;
    l.func_wrap("herd", "komp_loese", |mut c: C, k: i32| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().komp_loese(k)) })?;
    l.func_wrap("herd", "komp_von", |mut c: C, t: i32, typ: i32| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().komp_von(t, typ)) })?;
    l.func_wrap("herd", "komp_info", |mut c: C, k: i32, was: i32| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().komp_info(k, was)) })?;
    l.func_wrap("herd", "typ_nummer", |mut c: C, p: i32, n: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let t = h.bytes(p, n)?;
        Ok(h.kern().typ_nummer(&t))
    })?;
    l.func_wrap("herd", "feld_nummer", |mut c: C, typ: i32, p: i32, n: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let t = h.bytes(p, n)?;
        Ok(h.kern().feld_nummer(typ, &t))
    })?;

    l.func_wrap("herd", "setze_zahl", |mut c: C, k: i32, f: i32, w: f64| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().setze_zahl(k, f, w)) })?;
    l.func_wrap("herd", "hole_zahl", |mut c: C, k: i32, f: i32| -> Result<f64, wasmi::Error> { Ok(hz(&mut c)?.kern().hole_zahl(k, f)) })?;
    l.func_wrap("herd", "setze_text", |mut c: C, k: i32, f: i32, p: i32, n: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let t = h.bytes(p, n)?;
        Ok(h.kern().setze_text(k, f, &t))
    })?;
    l.func_wrap("herd", "hole_text", |mut c: C, k: i32, f: i32, p: i32, kap: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        // kern-wasm übergibt den Ausgabebereich direkt; der Kern schreibt nur, wenn der Text passt (K-013).
        let mut aus = h.bytes(p, kap)?;
        let n = h.kern().hole_text(k, f, &mut aus);
        if n >= 0 && (n as usize) <= aus.len() && n > 0 {
            h.bereich(p, n)?.copy_from_slice(&aus[..n as usize]);
        }
        Ok(n)
    })?;
    l.func_wrap("herd", "setze_liste", |mut c: C, k: i32, f: i32, p: i32, n: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let ids = h.ids(p, n)?;
        Ok(h.kern().setze_liste(k, f, &ids))
    })?;
    l.func_wrap("herd", "hole_liste", |mut c: C, k: i32, f: i32, p: i32, kap: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let mut v = vec![0u32; kap.max(0) as usize];
        let n = h.kern().hole_liste(k, f, &mut v);
        if n >= 0 && n <= kap {
            h.ids_aus(&v[..n as usize], p)?;
        }
        Ok(n)
    })?;

    l.func_wrap("herd", "setze_zahlen", |mut c: C, k: i32, f: i32, p: i32, n: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let z = h.zahlen(p, n)?;
        Ok(h.kern().setze_zahlen(k, f, &z))
    })?;
    l.func_wrap("herd", "hole_zahlen", |mut c: C, k: i32, f: i32, p: i32, kap: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let mut v = vec![0f64; kap.max(0) as usize];
        let n = h.kern().hole_zahlen(k, f, &mut v);
        if n >= 0 && n <= kap {
            h.zahlen_aus(&v[..n as usize], p)?;
        }
        Ok(n)
    })?;

    l.func_wrap("herd", "form_grund", |mut c: C, art: i32, teile: f64, dicke: f64| -> Result<i32, wasmi::Error> {
        Ok(hz(&mut c)?.kern().form_grund(art, teile, dicke))
    })?;
    l.func_wrap("herd", "form_eigene", |mut c: C, pp: i32, pn: i32, dp: i32, dn: i32, glatt: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let (punkte, dreiecke) = (h.zahlen(pp, pn)?, h.zahlen(dp, dn)?);
        Ok(h.kern().form_eigene(&punkte, &dreiecke, glatt))
    })?;
    l.func_wrap("herd", "bildchen_neu", |mut c: C, zp: i32, zn: i32, fp: i32, fl: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let (z, f) = (h.bytes(zp, zn)?, h.bytes(fp, fl)?);
        Ok(h.kern().bildchen_neu(&z, &f))
    })?;
    l.func_wrap("herd", "bildchen_rgba", |mut c: C, b: i32, ho: i32, p: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let rgba = h.bytes(p, b.max(0).saturating_mul(ho.max(0)).saturating_mul(4))?;
        Ok(h.kern().bildchen_rgba(b, ho, &rgba))
    })?;
    // Bildchen.laden (K-145, PROJEKTE PA2): Teigling (vorgebacken, im pkarton) im Kern-Speicher → Bildchen-ID
    l.func_wrap("herd", "bildchen_teigling", |mut c: C, p: i32, n: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let t = h.bytes(p, n)?;
        Ok(h.kern().bildchen_teigling(&t))
    })?;
    l.func_wrap("herd", "ressource_hole", |mut c: C, id: i32, was: i32| -> Result<f64, wasmi::Error> { Ok(hz(&mut c)?.kern().ressource_hole(id, was)) })?;
    // Modell.laden (H-K16, K-161): Modellteig (vorgebacken, im pkarton) im Kern-Speicher → Modell-ID; herd.modell, finde
    l.func_wrap("herd", "modell_teig", |mut c: C, p: i32, n: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let t = h.bytes(p, n)?;
        Ok(h.kern().modell_teig(&t))
    })?;
    l.func_wrap("herd", "modell_teil", |mut c: C, id: i32, x: f64, y: f64, z: f64| -> Result<i32, wasmi::Error> {
        Ok(hz(&mut c)?.kern().modell_teil(id, x, y, z))
    })?;
    l.func_wrap("herd", "modell_info", |mut c: C, id: i32, was: i32| -> Result<f64, wasmi::Error> { Ok(hz(&mut c)?.kern().modell_info(id, was)) })?;
    l.func_wrap("herd", "modell_text", |mut c: C, id: i32, was: i32, i: i32, p: i32, kap: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let mut aus = h.bytes(p, kap)?;
        let n = h.kern().modell_text(id, was, i, &mut aus);
        if n >= 0 && (n as usize) <= aus.len() && n > 0 {
            h.bereich(p, n)?.copy_from_slice(&aus[..n as usize]);
        }
        Ok(n)
    })?;
    l.func_wrap("herd", "teil_finde", |mut c: C, t: i32, p: i32, n: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let name = h.bytes(p, n)?;
        Ok(h.kern().teil_finde(t, &name))
    })?;

    // H-K12 (K-151): Eingabezustand je Takt vor fn() – Maus in Spielfeld-Koordinaten, Knöpfe als Bitmaske
    l.func_wrap("herd", "eingabe", |mut c: C, x: f64, y: f64, k: i32| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().eingabe(x, y, k)) })?;
    l.func_wrap("herd", "takt", |mut c: C| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.gemessen(|k| k.takt())) })?;
    l.func_wrap("herd", "bild", |mut c: C, n: i32| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.gemessen(|k| k.bild(n))) })?;
    l.func_wrap("herd", "bild_zeiger", |mut c: C| -> Result<i32, wasmi::Error> { hz(&mut c).map(|_| PAKET_BASIS as i32) })?;
    l.func_wrap("herd", "paket_voll", |mut c: C| -> Result<i32, wasmi::Error> { Ok(hz(&mut c)?.kern().paket_voll()) })?;
    l.func_wrap("herd", "hash_szene", |mut c: C, p: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let x = h.gemessen(|k| k.hash_szene());
        h.text_aus(&herd_kern::hash::hex(x), p, 16)
    })?;
    l.func_wrap("herd", "hash_paket", |mut c: C, p: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let x = h.gemessen(|k| k.hash_paket());
        h.text_aus(&herd_kern::hash::hex(x), p, 16)
    })?;
    l.func_wrap("herd", "schema_json", |mut c: C, p: i32, kap: i32| -> Result<i32, wasmi::Error> {
        let h = hz(&mut c)?;
        let s = h.kern().schema_json();
        h.text_aus(s.as_bytes(), p, kap)
    })?;

    // ---- Modul „pizza“: herd_*
    // Kern da? `pflicht = 1` und fehlt → HOST-Fehler (das Modul endet dann mit Exit 2, K-128).
    l.func_wrap("pizza", "herd_kern", |mut c: C, pflicht: i32| -> i32 {
        let d = c.data_mut();
        if !d.herd.fehlt {
            return 1;
        }
        if pflicht == 1 {
            d.senke.sende(Ereignis::Fehler {
                code: "HOST".into(),
                art: "intern".into(),
                text: KERN_FEHLT.into(),
                datei: None,
                zeile: None,
                spalte: None,
                detail: None,
            });
        }
        0
    })?;
    // Kopierweg Programm → Kern.
    l.func_wrap("pizza", "herd_schreibe", |mut c: C, kp: i32, pp: i32, n: i32| -> Result<(), wasmi::Error> {
        let b = prog_bytes(&c, pp, n)?;
        let h = hz(&mut c)?;
        if !b.is_empty() {
            h.bereich(kp, b.len() as i32)?.copy_from_slice(&b);
        }
        Ok(())
    })?;
    // Kopierweg Kern → Programm.
    l.func_wrap("pizza", "herd_lies", |mut c: C, pp: i32, kp: i32, n: i32| -> Result<(), wasmi::Error> {
        if n <= 0 {
            return Ok(());
        }
        let b = hz(&mut c)?.lies(kp, n as usize)?;
        let Some(Extern::Memory(mem)) = c.get_export("memory") else {
            return Err(wasmi::Error::new("Export 'memory' fehlt"));
        };
        mem.write(&mut c, pp as u32 as usize, &b)?;
        Ok(())
    })?;
    // Nächstes Fenster-Ereignis: dieselbe Quelle wie `ui_warte` (HOST-ABI §2).
    l.func_wrap("pizza", "herd_warte", |mut c: C, puffer: i32, kap: i32| -> Result<i32, wasmi::Error> {
        let (n, e) = crate::laufen::ui_warte(&mut c, puffer, kap)?;
        if let Some(e) = e {
            c.data_mut().herd.takt_angenommen(&e);
        }
        Ok(n)
    })?;
    // Ereignis `herd` (JSON ohne `typ`, `art` zuerst) + Bildpaket an den Renderer.
    l.func_wrap("pizza", "herd_senden", |mut c: C, p: i32, n: i32, paket_len: i32| -> Result<(), wasmi::Error> {
        let json = String::from_utf8_lossy(&prog_bytes(&c, p, n)?).into_owned();
        let art = art_von(&json).unwrap_or_default();
        let d = c.data_mut();
        // `fenster` öffnet nach einem `geschlossen` wieder (wie `zeige` bei der Theke, K-061): Quelle wieder offen.
        if art == "fenster" {
            d.theke_wieder_offen();
        }
        d.senke.sende(Ereignis::Herd { daten: json.clone() });
        // Klang (K-153): Hörer = Kamera dieses Bildes; eine Klang-Datei mischt die Takte bis hierher
        if art == "bild" {
            if let Some(w) = d.klang.wiedergabe.clone() {
                let nr = json.split("\"bildnummer\":").nth(1).and_then(|r| r.split(|c: char| !c.is_ascii_digit()).next()).and_then(|z| z.parse::<u64>().ok()).unwrap_or(0);
                w.bild(nr, d.herd.kern.as_ref().map(|k| k.paket()));
            }
        }
        let h = &mut d.herd;
        let paket: Option<&[u8]> = match (&h.kern, paket_len >= 0) {
            (Some(k), true) => Some(k.paket()),
            _ => None,
        };
        // Messung: die Anbindung zählt nicht zum Programm (offscreen zeichnet sie im Programm-Thread = Glut-Zeit)
        let t_anbindung = Instant::now();
        if let Some(a) = h.anbindung.as_mut() {
            (a.0)(&art, &json, paket);
        }
        if art == "bild" {
            if let (Some(m), Some((t, takte))) = (h.messung.clone(), h.takt_seit.take()) {
                m.programm(takte, t.elapsed().saturating_sub(t_anbindung.elapsed()), h.kern_zeit);
            }
        }
        Ok(())
    })?;
    Ok(())
}

/// Wert von `"art"` aus dem Ereignis-JSON des Moduls (steht immer zuerst, laufzeit/src/herd.rs).
pub fn art_von(json: &str) -> Option<String> {
    let rest = json.split_once("\"art\"")?.1.trim_start().strip_prefix(':')?.trim_start().strip_prefix('"')?;
    Some(rest.split('"').next()?.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn art_lesen() {
        assert_eq!(art_von("{\"art\":\"bild\",\"bildnummer\":4}").as_deref(), Some("bild"));
        assert_eq!(art_von("{ \"art\" : \"fenster\" }").as_deref(), Some("fenster"));
        assert_eq!(art_von("{}"), None);
    }

    #[test]
    fn puffer_bereich_waechst_und_null_ist_leer() {
        let mut h = HerdZustand::default();
        assert!(h.bereich(0, 10).unwrap().is_empty());
        assert!(h.bereich(8, 0).unwrap().is_empty());
        assert_eq!(h.bereich(8, 4).unwrap().len(), 4);
        assert!(h.speicher.len() >= 12);
        assert!(h.bereich(PAKET_BASIS as i32 - 2, 4).is_err());
    }

    #[test]
    fn messzeile_format() {
        let w = MessWerte { bilder: 60, takte: 60, gezeichnet: 60, draw_calls: 4, instanzen_2d: 10, ..Default::default() };
        let z = messzeile(&w, Duration::from_secs(1));
        assert!(z.starts_with("Herd: 60 Bilder/s (60 Takte) · Bildzeit 16,67 ms"), "{}", z);
        assert!(z.ends_with("4 Draw-Calls · 10 Instanzen (2D 10, 3D 0)"), "{}", z);
    }
}
