//! Küchenbrigade (SPEC §17, HOST-ABI §2 Gruppe `kueche`, THREADS.md §4.7): echte Köche als Threads.
//!
//! `kueche_auftrag(auftrag, n)` nimmt den linearen Speicher der aufrufenden Instanz als Schnappschuss, verteilt die Stücke
//! 1 … n auf bis zu k Köche (`std::thread::scope`) und ruft dort in **Klon-Instanzen** desselben `Module` den Export
//! `kueche_stueck(auftrag, i)` auf (je Koch ein eigener `Store`, kein geteilter Speicher). Die Berichte (Bytes, Format gehört
//! der Laufzeit – HOST-ABI Anhang A) holt die Hauptinstanz danach über `kueche_bericht(i, puffer, kap)`.
//!
//! - Planung ist frei (D2): dynamische Warteschlange; Klone werden innerhalb eines Laufs wiederverwendet (jedes
//!   `kueche_stueck` setzt den Klon selbst auf den Anschnitt zurück, eine Speicherkopie je Koch und Brigade genügt).
//! - Frühes Beenden (D3): bricht Stück k ab (Status ≠ 0), werden Stücke > k nicht mehr begonnen; alle Stücke < k laufen
//!   immer (auch unter Chaos), damit die Berichte 1 … k lückenlos sind.
//! - Trap in einem Klon: ist er der früheste Abbruch, trappt `kueche_auftrag` in der Hauptinstanz → interner Fehler (K-014),
//!   wie ein Trap auf dem Inline-Pfad (K-104/7); ein früherer echter Abbruch gewinnt (D3).
//! - Lohnt sich das? Die Speicherkopie kostet O(Speichergröße) je Brigade (der Speicher wächst ohne GC mit jeder Brigade);
//!   bei feinen Stücken wäre der Inline-Pfad schneller. Der Host misst je Stückzahl n Arbeit (Summe der Stückzeiten) gegen
//!   Wandzeit; ohne ≥ 10 % Gewinn antwortet er bei Brigaden mit derselben Stückzahl `-1` und probiert Köche erst nach
//!   1, 2, 4 … 64 Brigaden wieder. Unbeobachtbar (Planung frei, SPEC §17.7); unter Chaos immer Köche.
//! - Klone rufen nie Ausgabe-/Ende-Imports (HOST-ABI §2): solche Aufrufe sind ein Trap des Klons, nie ein Lauf-Abbruch.

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use wasmi::{Caller, Engine, Instance, Linker, Memory, Module, Store, TypedFunc};

/// Stapel eines Kochs: wie der Programm-Thread des Hosts (theke.rs), HOST-ABI §6.
pub const KOCH_STAPEL: usize = 16 * 1024 * 1024;

/// Höchstzahl bei `auto` (K-097/F6).
pub const AUTO_HOECHSTENS: usize = 16;

/// `--koeche=auto`: logische Kerne, höchstens 16.
pub fn auto() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1).clamp(1, AUTO_HOECHSTENS)
}

/// Einstellung und Zustand der Köche eines Laufs (liegt im `Zustand` der Hauptinstanz).
pub struct Kueche {
    /// Eingestellte Anzahl (1 = keine Köche → Inline-Pfad).
    koeche: usize,
    /// Testoption `--kuechen-chaos=SAAT`: zufällige Reihenfolge, Verzögerungen, frische/wiederverwendete Klone.
    chaos: Option<u64>,
    modul: Module,
    echtzeit: Option<f64>,
    /// Klone aus früheren Brigaden dieses Laufs (wiederverwendbar).
    klone: Vec<Klon>,
    /// Berichte der letzten Brigade (Index i − 1); `None` = Stück nicht ausgeführt.
    berichte: Vec<Option<Vec<u8>>>,
    /// Lohnen sich Köche? Je Stückzahl n (Brigaden in Schleifen haben meist dieselbe).
    schaetzungen: HashMap<usize, Schaetzung>,
    /// Höchste tatsächlich genutzte Anzahl Köche in diesem Lauf (1, solange keine Brigade Köche bekam).
    pub genutzt: usize,
}

struct Klon {
    store: Store<KlonZustand>,
    memory: Memory,
    stueck: TypedFunc<(i32, i32), (i32, i32)>,
    _instanz: Instance,
}

struct KlonZustand {
    echtzeit: Option<f64>,
}

/// Was ein Koch zurückgibt: Berichte, seinen Klon (zur Wiederverwendung) und die Zeit in `kueche_stueck`.
#[derive(Default)]
struct KochErgebnis {
    stuecke: Vec<(usize, Ausgang)>,
    klon: Option<Klon>,
    arbeit: Duration,
}

/// Erfahrung mit Brigaden einer Stückzahl: lohnten sich Köche zuletzt? (Nur Leistung, nie beobachtbar.)
struct Schaetzung {
    /// Brigaden ohne Köche bis zur nächsten Probe nach einer Probe ohne Gewinn (0 = Köche lohnen sich).
    abstand: u32,
    bis_probe: u32,
}

/// Größter Abstand zwischen zwei Proben.
const PROBE_HOECHSTENS: u32 = 64;

/// Was ein Koch über ein Stück meldet.
enum Ausgang {
    Bericht(Vec<u8>),
    Trap(String),
}

impl Kueche {
    pub fn neu(modul: Module, koeche: usize, chaos: Option<u64>, echtzeit: Option<f64>) -> Self {
        Kueche { koeche: koeche.max(1), chaos, modul, echtzeit, klone: Vec::new(), berichte: Vec::new(), schaetzungen: HashMap::new(), genutzt: 1 }
    }

    /// `kueche_bericht(i, …)`: Bericht von Stück i (1 … n) oder `None` (nicht ausgeführt → -2).
    pub fn bericht(&self, i: i32) -> Option<&[u8]> {
        let i = usize::try_from(i).ok()?.checked_sub(1)?;
        self.berichte.get(i)?.as_deref()
    }

    /// `kueche_auftrag(auftrag, n)` mit dem Speicher der aufrufenden Instanz. `Ok(0)` = Berichte bereit, `Ok(-1)` = keine
    /// Köche (das Modul arbeitet selbst), `Err` = Trap eines Klons als frühester Abbruch (→ interner Fehler).
    pub fn auftrag(&mut self, schnapp: &[u8], auftrag: i32, n: i32) -> Result<i32, String> {
        self.berichte.clear();
        let n = n.max(0) as usize;
        let k = self.koeche.min(n).min(speicher_hoechstens(schnapp.len()));
        if k <= 1 {
            return Ok(-1);
        }
        // Lohnt sich das? (Planung ist unbeobachtbar – der Host darf frei zwischen Köchen und Inline-Pfad wählen.)
        let chaos = self.chaos;
        let schaetzung = self.schaetzungen.entry(n).or_insert(Schaetzung { abstand: 0, bis_probe: 0 });
        if chaos.is_none() && schaetzung.bis_probe > 0 {
            schaetzung.bis_probe -= 1;
            return Ok(-1);
        }
        self.genutzt = self.genutzt.max(k);
        let t0 = Instant::now();
        // Reihenfolge der Stücke: normal 1 … n; Chaos: Permutation (manchmal rückwärts).
        let mut reihe: Vec<usize> = (1..=n).collect();
        if let Some(s) = self.chaos {
            let mut z = Zufall(s ^ (n as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15) ^ auftrag as u64);
            if z.naechste() % 4 == 0 {
                reihe.reverse();
            } else {
                for j in (1..reihe.len()).rev() {
                    reihe.swap(j, (z.naechste() % (j as u64 + 1)) as usize);
                }
            }
        }
        let naechstes = AtomicUsize::new(0);
        let kleinster_abbruch = AtomicUsize::new(usize::MAX);
        let mut alte: Vec<Option<Klon>> = std::mem::take(&mut self.klone).into_iter().map(Some).collect();
        alte.resize_with(k, || None);
        let modul = &self.modul;
        let echtzeit = self.echtzeit;
        let (reihe, naechstes, kleinster_abbruch) = (&reihe, &naechstes, &kleinster_abbruch);
        let ergebnisse: Vec<KochErgebnis> = std::thread::scope(|s| {
            let griffe: Vec<_> = alte
                .into_iter()
                .take(k)
                .enumerate()
                .map(|(nr, klon)| {
                    std::thread::Builder::new()
                        .name(format!("pizza-koch-{}", nr + 1))
                        .stack_size(KOCH_STAPEL)
                        .spawn_scoped(s, move || {
                            koch(nr, klon, modul, echtzeit, chaos, schnapp, auftrag, reihe, naechstes, kleinster_abbruch)
                        })
                })
                .collect();
            griffe
                .into_iter()
                .map(|g| match g {
                    Ok(h) => h.join().unwrap_or_default(),
                    Err(_) => KochErgebnis::default(),
                })
                .collect()
        });
        let mut berichte: Vec<Option<Ausgang>> = (0..n).map(|_| None).collect();
        let mut arbeit = Duration::ZERO;
        for e in ergebnisse {
            arbeit += e.arbeit;
            for (i, a) in e.stuecke {
                berichte[i - 1] = Some(a);
            }
            if let Some(k) = e.klon {
                self.klone.push(k);
            }
        }
        // Inline hätte etwa `arbeit` gekostet; mit Köchen kostete es `wand` (Speicherkopien, Threads, längster Koch).
        // Lohnt es nicht (Gewinn < 10 %), arbeitet bei Brigaden mit gleich vielen Stücken das Modul selbst – mit
        // wachsendem Abstand bis zur nächsten Probe (1, 2, 4 … 64), sonst wieder immer Köche.
        let wand = t0.elapsed();
        if let Some(sch) = self.schaetzungen.get_mut(&n) {
            if arbeit.as_secs_f64() > 1.1 * wand.as_secs_f64() {
                sch.abstand = 0;
            } else {
                sch.abstand = (sch.abstand * 2).clamp(1, PROBE_HOECHSTENS);
            }
            sch.bis_probe = sch.abstand;
        }
        // Frühester Abbruch (Status ≠ 0 oder Trap); dahinter wird nichts gemeldet (D3).
        for (j, b) in berichte.into_iter().enumerate() {
            match b {
                None => {
                    // Konnte ein Koch nicht starten (Thread-Erzeugung), fehlt ein Stück vor dem ersten Abbruch:
                    // dann arbeitet das Modul selbst (gleiches Ergebnis).
                    if j < kleinster_abbruch.load(Ordering::SeqCst).saturating_sub(1) {
                        self.berichte.clear();
                        return Ok(-1);
                    }
                    break;
                }
                Some(Ausgang::Trap(t)) => {
                    self.berichte.clear();
                    return Err(t);
                }
                Some(Ausgang::Bericht(b)) => {
                    let ok = status(&b) == 0;
                    self.berichte.push(Some(b));
                    if !ok {
                        break;
                    }
                }
            }
        }
        Ok(0)
    }
}

fn status(b: &[u8]) -> u32 {
    b.get(..4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]])).unwrap_or(u32::MAX)
}

/// Ein Koch: holt Stücke aus der Warteschlange, bis sie leer ist. Liefert seine Berichte und den Klon zur Wiederverwendung
/// (`None` nach einem Trap – sein Zustand, z. B. `__stack_pointer`, ist dann unbestimmt).
#[allow(clippy::too_many_arguments)]
fn koch(
    nr: usize,
    mut klon: Option<Klon>,
    modul: &Module,
    echtzeit: Option<f64>,
    chaos: Option<u64>,
    schnapp: &[u8],
    auftrag: i32,
    reihe: &[usize],
    naechstes: &AtomicUsize,
    kleinster_abbruch: &AtomicUsize,
) -> KochErgebnis {
    let mut aus = Vec::new();
    let mut arbeit = Duration::ZERO;
    let mut frisch = false; // enthält der Klon schon den Schnappschuss dieser Brigade?
    let mut z = Zufall(chaos.unwrap_or(0) ^ (nr as u64 + 1).wrapping_mul(0xA24B_AED4_963E_E407));
    loop {
        let idx = naechstes.fetch_add(1, Ordering::SeqCst);
        let Some(&i) = reihe.get(idx) else { break };
        if i > kleinster_abbruch.load(Ordering::SeqCst) {
            continue;
        }
        if chaos.is_some() {
            // Künstliche Verzögerung (0–3 ms) und gelegentlich ein frischer Klon statt Wiederverwendung.
            let r = z.naechste();
            std::thread::sleep(std::time::Duration::from_micros(r % 3000));
            if r % 3 == 0 {
                klon = None;
                frisch = false;
            }
        }
        if klon.is_none() {
            match Klon::neu(modul, echtzeit) {
                Ok(k) => klon = Some(k),
                Err(e) => {
                    melde(&mut aus, kleinster_abbruch, i, Ausgang::Trap(e));
                    break;
                }
            }
            frisch = false;
        }
        let k = klon.as_mut().expect("Klon");
        if !frisch {
            if let Err(e) = k.lade(schnapp) {
                melde(&mut aus, kleinster_abbruch, i, Ausgang::Trap(e));
                klon = None;
                break;
            }
            frisch = true;
        }
        let ts = Instant::now();
        let r = k.stueck.call(&mut k.store, (auftrag, i as i32));
        arbeit += ts.elapsed();
        match r {
            Ok((p, len)) => {
                let daten = k.memory.data(&k.store);
                let (p, len) = (p as u32 as usize, len as u32 as usize);
                match daten.get(p..p.saturating_add(len)) {
                    Some(b) => melde(&mut aus, kleinster_abbruch, i, Ausgang::Bericht(b.to_vec())),
                    None => {
                        melde(&mut aus, kleinster_abbruch, i, Ausgang::Trap("kueche_stueck: Bericht außerhalb des Speichers".into()));
                        klon = None;
                    }
                }
            }
            Err(e) => {
                melde(&mut aus, kleinster_abbruch, i, Ausgang::Trap(e.to_string()));
                // Nach einem Trap ist der Klon unbrauchbar (Stapelzeiger mitten im Aufruf); für weitere Stücke ein neuer.
                klon = None;
                frisch = false;
            }
        }
    }
    KochErgebnis { stuecke: aus, klon, arbeit }
}

fn melde(aus: &mut Vec<(usize, Ausgang)>, kleinster_abbruch: &AtomicUsize, i: usize, a: Ausgang) {
    let abbruch = match &a {
        Ausgang::Bericht(b) => status(b) != 0,
        Ausgang::Trap(_) => true,
    };
    if abbruch {
        kleinster_abbruch.fetch_min(i, Ordering::SeqCst);
    }
    aus.push((i, a));
}

/// Fehler eines Klons, wenn er einen Import ruft, den Klone nie rufen dürfen (HOST-ABI §2).
fn verboten(name: &str) -> wasmi::Error {
    wasmi::Error::new(format!("Klon rief pizza.{}", name))
}

impl Klon {
    fn neu(modul: &Module, echtzeit: Option<f64>) -> Result<Klon, String> {
        let engine: &Engine = modul.engine();
        let mut store = Store::new(engine, KlonZustand { echtzeit });
        let linker = klon_linker(engine).map_err(|e| e.to_string())?;
        let inst = linker.instantiate_and_start(&mut store, modul).map_err(|e| e.to_string())?;
        let memory = inst.get_memory(&store, "memory").ok_or("Export 'memory' fehlt")?;
        let stueck = inst.get_typed_func::<(i32, i32), (i32, i32)>(&store, "kueche_stueck").map_err(|e| e.to_string())?;
        Ok(Klon { store, memory, stueck, _instanz: inst })
    }

    /// Speicher auf die Größe des Schnappschusses bringen und überschreiben; ein größerer Rest (wiederverwendeter Klon)
    /// wird genullt – der Klon sieht dann genau aus wie ein frischer.
    fn lade(&mut self, schnapp: &[u8]) -> Result<(), String> {
        let haben = self.memory.data(&self.store).len();
        if haben < schnapp.len() {
            let seiten = (schnapp.len() - haben).div_ceil(65536) as u64;
            self.memory.grow(&mut self.store, seiten).map_err(|e| format!("Klon-Speicher: {}", e))?;
        }
        let daten = self.memory.data_mut(&mut self.store);
        let (vorn, rest) = daten.split_at_mut(schnapp.len());
        vorn.copy_from_slice(schnapp);
        rest.fill(0);
        Ok(())
    }
}

/// Imports der Klon-Instanzen (HOST-ABI §2 „Klon-Instanzen“).
fn klon_linker(engine: &Engine) -> Result<Linker<KlonZustand>, wasmi::errors::LinkerError> {
    type C<'a> = Caller<'a, KlonZustand>;
    let mut l = <Linker<KlonZustand>>::new(engine);
    l.allow_shadowing(true);
    for name in ["ausgabe", "schreibe", "fehlerausgabe", "panik", "ui_senden"] {
        l.func_wrap("pizza", name, move |_c: C, _p: i32, _n: i32| -> Result<(), wasmi::Error> { Err(verboten(name)) })?;
    }
    l.func_wrap("pizza", "leeren", |_c: C| -> Result<(), wasmi::Error> { Err(verboten("leeren")) })?;
    l.func_wrap("pizza", "warnung", |_c: C, _: i32, _: i32, _: i32, _: i32, _: i32, _: i32| -> Result<(), wasmi::Error> {
        Err(verboten("warnung"))
    })?;
    l.func_wrap("pizza", "fehler", |_c: C, _: i32, _: i32, _: i32, _: i32, _: i32, _: i32, _: i32| -> Result<(), wasmi::Error> {
        Err(verboten("fehler"))
    })?;
    l.func_wrap("pizza", "vorrat_lesen", |_c: C, _: i32, _: i32, _: i32, _: i32| -> Result<i32, wasmi::Error> {
        Err(verboten("vorrat_lesen"))
    })?;
    l.func_wrap("pizza", "vorrat_schreiben", |_c: C, _: i32, _: i32, _: i32, _: i32, _: i32, _: i32| -> Result<i32, wasmi::Error> {
        Err(verboten("vorrat_schreiben"))
    })?;
    l.func_wrap("pizza", "kueche_bericht", |_c: C, _: i32, _: i32, _: i32| -> Result<i32, wasmi::Error> {
        Err(verboten("kueche_bericht"))
    })?;
    // In Klonen: keine Eingabe (EOF), kein Renderer, innere Brigaden sequentiell.
    l.func_wrap("pizza", "eingabe", |_c: C, _: i32, _: i32, _: i32, _: i32, _: i32| -> i32 { -1 })?;
    l.func_wrap("pizza", "ui_warte", |_c: C, _p: i32, kap: i32| -> i32 { if kap < 0 { 0 } else { -1 } })?;
    l.func_wrap("pizza", "ui_verfuegbar", |_c: C| -> i32 { 0 })?;
    l.func_wrap("pizza", "kueche_auftrag", |_c: C, _: i32, _: i32| -> i32 { -1 })?;
    l.func_wrap("pizza", "echtzeit_ms", |c: C| -> f64 { crate::laufen::echtzeit_wert(c.data().echtzeit) })?;
    Ok(l)
}

/// Höchstzahl gleichzeitiger Klone für einen Schnappschuss dieser Größe: Klone × Größe ≤ 50 % RAM (HOST-ABI §6).
fn speicher_hoechstens(groesse: usize) -> usize {
    let budget = arbeitsspeicher().unwrap_or(8 << 30) / 2;
    (budget / (groesse.max(65536) as u64)).max(1).min(usize::MAX as u64) as usize
}

/// Physischer Arbeitsspeicher in Bytes (falls ermittelbar).
#[cfg(target_os = "linux")]
fn arbeitsspeicher() -> Option<u64> {
    let t = std::fs::read_to_string("/proc/meminfo").ok()?;
    let z = t.lines().find(|l| l.starts_with("MemTotal:"))?;
    let kib: u64 = z.split_whitespace().nth(1)?.parse().ok()?;
    Some(kib * 1024)
}

#[cfg(windows)]
fn arbeitsspeicher() -> Option<u64> {
    #[repr(C)]
    struct MemoryStatusEx {
        laenge: u32,
        last: u32,
        phys_gesamt: u64,
        phys_frei: u64,
        seiten_gesamt: u64,
        seiten_frei: u64,
        virt_gesamt: u64,
        virt_frei: u64,
        ext_frei: u64,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalMemoryStatusEx(p: *mut MemoryStatusEx) -> i32;
    }
    let mut m = MemoryStatusEx {
        laenge: std::mem::size_of::<MemoryStatusEx>() as u32,
        last: 0,
        phys_gesamt: 0,
        phys_frei: 0,
        seiten_gesamt: 0,
        seiten_frei: 0,
        virt_gesamt: 0,
        virt_frei: 0,
        ext_frei: 0,
    };
    // SAFETY: Zeiger auf eine korrekt initialisierte, ausreichend große Struktur (dwLength gesetzt).
    let ok = unsafe { GlobalMemoryStatusEx(&mut m) };
    (ok != 0 && m.phys_gesamt > 0).then_some(m.phys_gesamt)
}

#[cfg(not(any(target_os = "linux", windows)))]
fn arbeitsspeicher() -> Option<u64> {
    None
}

/// splitmix64 – nur für die Chaos-Planung (Tests).
struct Zufall(u64);
impl Zufall {
    fn naechste(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut x = self.0;
        x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        x ^ (x >> 31)
    }
}
