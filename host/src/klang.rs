//! Klang (SPEC §18.8, HERD.md §12.4 H-K14, K-153, HOST-ABI §2 Gruppe `klang`): der **native Klang-Erzeuger** als
//! wasmi-Hostfunktionen.
//!
//! - Modul `klang`: je Export von `klang.wasm` eine Hostfunktion mit gleichem Namen und gleicher Signatur, die die
//!   gleichnamige Methode von [`herd_klang::Abi`] ruft. Zeiger zeigen in den **Erzeuger-Speicher** (hier ein Host-`Vec<u8>`,
//!   `puffer(len)` liefert einen festen Versatz darin, nie 0). Dieselben Samples wie `klang.wasm` (gleicher Quelltext).
//! - Modul `pizza`: `klang_kern`, `klang_schreibe`/`klang_lies` (Kopierweg), `klang_senden` (Ereignis `klang` + PCM an die
//!   Wiedergabe, [`crate::wiedergabe`]).
//! - Test `PIZZA_TEST_OHNE_KLANG=1`: der Erzeuger „fehlt“ – `klang_kern(1)` meldet den HOST-Fehler, alle `klang.*` sind Trap.

use std::sync::Arc;

use herd_klang::Abi;
use wasmi::{Caller, Extern, Linker};

use crate::ereignis::Ereignis;
use crate::laufen::Zustand;
use crate::wiedergabe::Wiedergabe;

/// Text des HOST-Fehlers, wenn der Erzeuger fehlt.
pub const KLANG_FEHLT: &str = "PizzaFehler HOST: Der Klang-Erzeuger fehlt (klang.wasm).";

/// Versatz des Austauschpuffers im nachgebildeten Erzeuger-Speicher – nie 0.
const PUFFER_BASIS: usize = 8;

/// Namen aller Exporte von `klang.wasm` = bekannte Importe des Moduls `klang`.
pub const IMPORTE_KLANG: [&str; 21] = [
    "abi_version", "puffer", "fehler_art", "fehler_text", "fehler_neu", "ton", "rauschen", "stille", "noten", "huelle", "tiefpass",
    "hochpass", "verstaerke", "mische", "dann", "wiederhole", "nahtlos", "dauer", "hash", "pcm", "pcm_laenge",
];

/// Bekannte Importe `pizza.klang_*`.
pub const IMPORTE_PIZZA: [&str; 4] = ["klang_kern", "klang_schreibe", "klang_lies", "klang_senden"];

/// Importiert das Modul die Gruppe `klang`?
pub fn importiert_klang(module: &wasmi::Module) -> bool {
    module.imports().any(|i| i.module() == "klang" || (i.module() == "pizza" && i.name().starts_with("klang_")))
}

/// Klang-Teil des Laufzustands.
#[derive(Default)]
pub struct KlangZustand {
    abi: Option<Abi>,
    speicher: Vec<u8>,
    fehlt: bool,
    /// Wiedergabe (Gerät oder Datei); `None` = stumm (Tests, JSON-Modus, fensterlos).
    pub(crate) wiedergabe: Option<Arc<Wiedergabe>>,
}

impl KlangZustand {
    pub fn neu(wiedergabe: Option<Arc<Wiedergabe>>) -> KlangZustand {
        let fehlt = std::env::var_os("PIZZA_TEST_OHNE_KLANG").is_some_and(|v| v == "1");
        KlangZustand { fehlt, wiedergabe, ..Default::default() }
    }
    fn abi(&mut self) -> &mut Abi {
        self.abi.get_or_insert_with(Abi::neu)
    }
    fn bereich(&mut self, p: i32, l: i32) -> Result<&mut [u8], wasmi::Error> {
        if l <= 0 || p == 0 {
            return Ok(&mut []);
        }
        let (p, l) = (p as u32 as usize, l as u32 as usize);
        let ende = p.checked_add(l).filter(|&e| e <= 1 << 30).ok_or_else(|| wasmi::Error::new("klang: Zeiger außerhalb des Speichers"))?;
        if self.speicher.len() < ende {
            self.speicher.resize(ende, 0);
        }
        Ok(&mut self.speicher[p..ende])
    }
    fn text(&mut self, p: i32, l: i32) -> Result<String, wasmi::Error> {
        Ok(String::from_utf8_lossy(self.bereich(p, l)?).into_owned())
    }
}

type C<'a> = Caller<'a, Zustand>;

fn kz<'a>(c: &'a mut C<'_>) -> Result<&'a mut KlangZustand, wasmi::Error> {
    let k = &mut c.data_mut().klang;
    if k.fehlt {
        return Err(wasmi::Error::new("Klang-Erzeuger nicht geladen"));
    }
    Ok(k)
}

fn prog_bytes(c: &C<'_>, p: i32, n: i32) -> Result<Vec<u8>, wasmi::Error> {
    let Some(Extern::Memory(mem)) = c.get_export("memory") else {
        return Err(wasmi::Error::new("Export 'memory' fehlt"));
    };
    let (p, n) = (p as u32 as usize, n.max(0) as u32 as usize);
    mem.data(c).get(p..p.saturating_add(n)).map(|b| b.to_vec()).ok_or_else(|| wasmi::Error::new("klang: Zeiger außerhalb des Programm-Speichers"))
}

/// Bindet die Importe der Gruppe `klang` (Modul `klang` und `pizza.klang_*`).
pub(crate) fn binde(l: &mut Linker<Zustand>) -> Result<(), wasmi::errors::LinkerError> {
    l.func_wrap("klang", "abi_version", |mut c: C| -> Result<i32, wasmi::Error> { kz(&mut c).map(|_| 1) })?;
    l.func_wrap("klang", "puffer", |mut c: C, len: i32| -> Result<i32, wasmi::Error> {
        let k = kz(&mut c)?;
        k.bereich(PUFFER_BASIS as i32, len.max(1))?;
        Ok(PUFFER_BASIS as i32)
    })?;
    l.func_wrap("klang", "fehler_art", |mut c: C| -> Result<i32, wasmi::Error> { Ok(kz(&mut c)?.abi().fehler_art()) })?;
    l.func_wrap("klang", "fehler_neu", |mut c: C| -> Result<i32, wasmi::Error> { Ok(kz(&mut c)?.abi().fehler_neu()) })?;
    l.func_wrap("klang", "fehler_text", |mut c: C, p: i32, kap: i32| -> Result<i32, wasmi::Error> {
        let k = kz(&mut c)?;
        let t = k.abi().fehler_text().as_bytes().to_vec();
        if t.len() as i64 <= kap as i64 {
            k.bereich(p, t.len() as i32)?.copy_from_slice(&t);
        }
        Ok(t.len() as i32)
    })?;
    l.func_wrap("klang", "ton", |mut c: C, fr: f64, d: f64, wp: i32, wl: i32, laut: f64, bis: f64, an: f64, aus: f64| -> Result<i32, wasmi::Error> {
        let k = kz(&mut c)?;
        let w = k.text(wp, wl)?;
        Ok(k.abi().ton(fr, d, &w, laut, bis, an, aus))
    })?;
    l.func_wrap("klang", "rauschen", |mut c: C, d: f64, ap: i32, al: i32, laut: f64, an: f64, aus: f64, saat: f64| -> Result<i32, wasmi::Error> {
        let k = kz(&mut c)?;
        let a = k.text(ap, al)?;
        Ok(k.abi().rauschen(d, &a, laut, an, aus, saat))
    })?;
    l.func_wrap("klang", "stille", |mut c: C, d: f64| -> Result<i32, wasmi::Error> { Ok(kz(&mut c)?.abi().stille(d)) })?;
    l.func_wrap("klang", "noten", |mut c: C, tp: i32, tl: i32, tempo: f64, wp: i32, wl: i32, laut: f64| -> Result<i32, wasmi::Error> {
        let k = kz(&mut c)?;
        let t = k.text(tp, tl)?;
        let w = k.text(wp, wl)?;
        Ok(k.abi().noten(&t, tempo, &w, laut))
    })?;
    l.func_wrap("klang", "huelle", |mut c: C, id: i32, an: f64, ab: f64, h: f64, aus: f64| -> Result<i32, wasmi::Error> {
        Ok(kz(&mut c)?.abi().huelle(id, an, ab, h, aus))
    })?;
    l.func_wrap("klang", "tiefpass", |mut c: C, id: i32, fr: f64, q: f64| -> Result<i32, wasmi::Error> { Ok(kz(&mut c)?.abi().tiefpass(id, fr, q)) })?;
    l.func_wrap("klang", "hochpass", |mut c: C, id: i32, fr: f64, q: f64| -> Result<i32, wasmi::Error> { Ok(kz(&mut c)?.abi().hochpass(id, fr, q)) })?;
    l.func_wrap("klang", "verstaerke", |mut c: C, id: i32, f: f64| -> Result<i32, wasmi::Error> { Ok(kz(&mut c)?.abi().verstaerke(id, f)) })?;
    l.func_wrap("klang", "mische", |mut c: C, a: i32, b: i32, ab: f64| -> Result<i32, wasmi::Error> { Ok(kz(&mut c)?.abi().mische(a, b, ab)) })?;
    l.func_wrap("klang", "dann", |mut c: C, a: i32, b: i32| -> Result<i32, wasmi::Error> { Ok(kz(&mut c)?.abi().dann(a, b)) })?;
    l.func_wrap("klang", "wiederhole", |mut c: C, id: i32, n: f64| -> Result<i32, wasmi::Error> { Ok(kz(&mut c)?.abi().wiederhole(id, n)) })?;
    l.func_wrap("klang", "nahtlos", |mut c: C, id: i32, u: f64| -> Result<i32, wasmi::Error> { Ok(kz(&mut c)?.abi().nahtlos(id, u)) })?;
    l.func_wrap("klang", "dauer", |mut c: C, id: i32| -> Result<f64, wasmi::Error> { Ok(kz(&mut c)?.abi().dauer(id)) })?;
    l.func_wrap("klang", "hash", |mut c: C, id: i32, p: i32| -> Result<i32, wasmi::Error> {
        let k = kz(&mut c)?;
        match k.abi().hash(id) {
            Some(h) => {
                k.bereich(p, 16)?.copy_from_slice(&h);
                Ok(16)
            }
            None => Ok(-1),
        }
    })?;
    // PCM liegt nativ nicht im nachgebildeten Speicher (der Host liest sie direkt aus dem Erzeuger): Zeiger 0, Länge echt
    l.func_wrap("klang", "pcm", |mut c: C, _id: i32| -> Result<i32, wasmi::Error> { kz(&mut c).map(|_| 0) })?;
    l.func_wrap("klang", "pcm_laenge", |mut c: C, id: i32| -> Result<i32, wasmi::Error> { Ok((kz(&mut c)?.abi().pcm(id).len() * 2) as i32) })?;

    // ---- Modul „pizza“: klang_*
    l.func_wrap("pizza", "klang_kern", |mut c: C, pflicht: i32| -> i32 {
        let d = c.data_mut();
        if !d.klang.fehlt {
            return 1;
        }
        if pflicht == 1 {
            d.senke.sende(Ereignis::Fehler {
                code: "HOST".into(),
                art: "intern".into(),
                text: KLANG_FEHLT.into(),
                datei: None,
                zeile: None,
                spalte: None,
                detail: None,
            });
        }
        0
    })?;
    l.func_wrap("pizza", "klang_schreibe", |mut c: C, kp: i32, pp: i32, n: i32| -> Result<(), wasmi::Error> {
        let b = prog_bytes(&c, pp, n)?;
        let k = kz(&mut c)?;
        if !b.is_empty() {
            k.bereich(kp, b.len() as i32)?.copy_from_slice(&b);
        }
        Ok(())
    })?;
    l.func_wrap("pizza", "klang_lies", |mut c: C, pp: i32, kp: i32, n: i32| -> Result<(), wasmi::Error> {
        if n <= 0 {
            return Ok(());
        }
        let b = kz(&mut c)?.bereich(kp, n)?.to_vec();
        let Some(Extern::Memory(mem)) = c.get_export("memory") else {
            return Err(wasmi::Error::new("Export 'memory' fehlt"));
        };
        mem.write(&mut c, pp as u32 as usize, &b)?;
        Ok(())
    })?;
    // Ereignis `klang` (JSON ohne `typ`, `art` zuerst): zuerst die Wiedergabe (bei „spiele“ mit der PCM), dann das Ereignis
    l.func_wrap("pizza", "klang_senden", |mut c: C, p: i32, n: i32, id: i32| -> Result<(), wasmi::Error> {
        let json = String::from_utf8_lossy(&prog_bytes(&c, p, n)?).into_owned();
        let d = c.data_mut();
        if let Some(w) = d.klang.wiedergabe.clone() {
            let pcm = if id > 0 { d.klang.abi.as_ref().map(|a| a.pcm(id)) } else { None };
            w.ereignis(&json, pcm);
        }
        d.senke.sende(Ereignis::Klang { daten: json });
        Ok(())
    })?;
    Ok(())
}
