// Startet pro Lauf einen frischen Worker. Kein Wand-Zeitlimit (Browser = nativ): es gilt nur das Schrittlimit des
// Interpreters/Compilers, dazu „Abbrechen“. Hawaii (panik) ist ein normales Ereignis; das Ende kommt mit „ende“.
// Ausnahme Küchenbrigade (THREADS §4.8, K-104 Punkt 12): Meldet „ende“ poolWarm, hält der Worker einen Köche-Pool
// (seine Kinder-Worker) – er bleibt dann für den nächsten Lauf liegen, damit die Köche warm bleiben. „Abbrechen“ und
// Worker-Fehler beenden ihn (und damit alle Köche); der nächste Lauf legt einen neuen an.


/** Einmaliger Auftrag an einen eigenen Worker (Kompilieren, Fähigkeiten prüfen). */
export function workerAuftrag(nachricht, antwortTyp, zeitlimit = 15_000) {
  return new Promise((resolve) => {
    let w;
    try { w = new Worker("js/worker.js"); } catch (e) { resolve({ ok: false, grund: "Web Worker nicht verfügbar" }); return; }
    const t = setTimeout(() => { w.terminate(); resolve({ ok: false, grund: "Keine Antwort vom Ofen (Zeitüberschreitung)" }); }, zeitlimit);
    w.onmessage = (m) => {
      if (!m.data || m.data.typ !== antwortTyp) return;
      clearTimeout(t); w.terminate(); resolve(m.data);
    };
    w.onerror = (e) => { e.preventDefault && e.preventDefault(); clearTimeout(t); w.terminate(); resolve({ ok: false, grund: e.message || "Fehler im Worker" }); };
    w.postMessage(nachricht);
  });
}

/** Liest js/motoren.json ({ wasm, exe }); fehlt sie, gilt alles als nicht verfügbar. */
export function ladeMotoren() {
  return fetch("js/motoren.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((m) => ({ wasm: !!(m && m.wasm === true), exe: !!(m && m.exe === true) }));
}

/** Interaktive Eingabe möglich? (SharedArrayBuffer + Atomics, nur bei Cross-Origin-Isolation) */
export function interaktivMoeglich() {
  return typeof SharedArrayBuffer === "function" && typeof Atomics === "object" && self.crossOriginIsolated === true;
}

const PUFFER_BYTES = 64 * 1024;

/** `anzahl` eines Takt-Schlags wie der Interpreter: ganze Zahl ≥ 1, sonst 1 (K-084). */
function taktAnzahl(a) {
  return typeof a === "number" && Number.isInteger(a) && a >= 1 ? a : 1;
}

/** Hängt ein UI-Ereignis an die Warteschlange der Brücke an. Folgt ein `takt` direkt auf einen gestauten `takt` derselben
 *  `id`, werden beide zu einem Ereignis mit summierter `anzahl` zusammengefasst (K-084, wie der Host-Kanal). Andere
 *  Ereignisse werden nie umsortiert oder verschluckt; nur unmittelbar aufeinanderfolgende Schläge verschmelzen. */
export function reiheUiEreignisEin(schlange, ereignis) {
  const letztes = schlange[schlange.length - 1];
  if (ereignis && ereignis.typ === "takt" && letztes && letztes.typ === "takt" && letztes.id === ereignis.id) {
    schlange[schlange.length - 1] = { ...letztes, anzahl: taktAnzahl(letztes.anzahl) + taktAnzahl(ereignis.anzahl) };
  } else schlange.push(ereignis);
  return schlange;
}

export function erstelleAusfuehrung({ beiEreignis, beiStart, beiEnde, beiPanik, beiMotor, beiEingabeAnfrage, beiEingabeEnde, beiUi, beiVorrat }) {
  let worker = null, laeuft = false, start = 0, laufId = 0;
  let uiWartet = false, uiSchlange = [];
  let sab = null, wartet = false, wartezeit = 0, warteBeginn = 0;
  const kodierer = new TextEncoder();

  function aufraeumen(behalten = false) {
    if ((wartet || uiWartet) && sab) signal(3);
    wartet = false; uiWartet = false; uiSchlange = [];
    laeuft = false;
    if (worker && behalten) {
      // warm halten: Nachrichten des ruhenden Workers ignorieren, bis der nächste Lauf ihn übernimmt
      worker.onmessage = null;
      worker.onerror = (e) => { e.preventDefault && e.preventDefault(); verwerfe(); };
    } else verwerfe();
    sab = null;
  }

  function verwerfe() {
    if (worker) { try { worker.terminate(); } catch (e) { /* egal */ } worker = null; }
  }

  function signal(status, bytes) {
    const ctrl = new Int32Array(sab, 0, 2);
    if (bytes) {
      const daten = new Uint8Array(sab, 8);
      const n = Math.min(bytes.length, daten.length);
      daten.set(bytes.subarray(0, n));
      Atomics.store(ctrl, 1, n);
    } else Atomics.store(ctrl, 1, 0);
    Atomics.store(ctrl, 0, status);
    Atomics.notify(ctrl, 0);
  }

  function beende(id, info) {
    if (id !== laufId) return;
    laufId++;
    const wandMs = performance.now() - start;
    const warteteNoch = wartet;
    aufraeumen(info.poolWarm === true && !info.abgebrochen);
    if (warteteNoch) beiEingabeEnde && beiEingabeEnde();
    beiEnde({ ...info, wandMs, wartezeitMs: wartezeit });
  }

  function verarbeite(id, ev) {
    if (id !== laufId || !ev) return;
    if (ev.typ === "batch" && Array.isArray(ev.ereignisse)) {
      for (const e of ev.ereignisse) { verarbeite(id, e); if (id !== laufId) return; }
      return;
    }
    if (ev.typ === "ende") {
      beende(id, { exitCode: ev.exitCode, schritte: ev.schritte, zeitMs: ev.zeitMs, laufMs: ev.laufMs, motor: ev.motor, koeche: ev.koeche, poolWarm: ev.poolWarm === true });
      return;
    }
    if (ev.typ === "motor") { beiMotor && beiMotor(ev); return; }
    if (ev.typ === "ui") { beiUi && beiUi(ev.nachricht); return; }
    if (ev.typ === "vorrat-speichern") { beiVorrat && beiVorrat(ev.name, ev.eintraege); return; }
    if (ev.typ === "ui-warte") {
      if (!sab) return;
      if (uiSchlange.length) { signal(1, kodierer.encode(JSON.stringify(uiSchlange.shift()))); return; }
      uiWartet = true;
      warteBeginn = performance.now();
      return;
    }
    if (ev.typ === "eingabe-anfrage") {
      if (!sab) return;
      wartet = true;
      warteBeginn = performance.now();
      beiEingabeAnfrage && beiEingabeAnfrage(ev);
      return;
    }
    beiEreignis(ev);
  }

  return {
    get laeuft() { return laeuft; },
    get wartetAufEingabe() { return wartet; },
    /** UI-Ereignis aus der Theke an das Programm (wird gepuffert, falls es gerade nicht wartet). */
    uiEreignis(ereignis) {
      if (!laeuft || !sab) return;
      if (uiWartet) {
        uiWartet = false;
        wartezeit += performance.now() - warteBeginn;
        signal(1, kodierer.encode(JSON.stringify(ereignis)));
      } else reiheUiEreignisEin(uiSchlange, ereignis);
    },
    /** Antwort auf eine Eingabe-Anfrage: Text oder null (= EOF). */
    antworte(text) {
      if (!wartet || !sab) return false;
      wartet = false;
      wartezeit += performance.now() - warteBeginn;
      if (text == null) signal(2);
      else signal(1, kodierer.encode(String(text)));
      return true;
    },
    starte(code, args = [], motor = "auto", extra = {}) {
      if (laeuft) aufraeumen();
      const id = ++laufId;
      start = performance.now();
      wartezeit = 0;
      beiStart();
      laeuft = true;
      try {
        if (!worker) worker = new Worker("js/worker.js");   // sonst: warmer Worker mit Köche-Pool vom letzten Lauf
      } catch (e) {
        beiEreignis({ typ: "fehler", art: "intern", code: "INTERN", text: "Der Ofen (Web Worker) ließ sich nicht starten: " + e.message, zeile: null, spalte: null });
        beende(id, { exitCode: 2 });
        return;
      }
      worker.onmessage = (m) => verarbeite(id, m.data);
      worker.onerror = (e) => {
        e.preventDefault && e.preventDefault();
        beiEreignis({ typ: "fehler", art: "intern", code: "INTERN", text: "Der Ofen ist ausgefallen: " + (e.message || "unbekannter Fehler im Worker") + ".", zeile: null, spalte: null });
        beende(id, { exitCode: 2 });
      };
      const nachricht = { ...extra, typ: "start", code, args, motor };
      if (!Array.isArray(extra.eingabe) && interaktivMoeglich()) {
        try { sab = new SharedArrayBuffer(8 + PUFFER_BYTES); nachricht.eingabePuffer = sab; } catch (e) { sab = null; }
      }
      worker.postMessage(nachricht);
    },
    /** Köche-Einstellung geändert (K-104/14): einen ruhenden, warm gehaltenen Lauf-Worker samt Köche-Pool beenden –
     *  der nächste Lauf startet frisch mit der neuen Anzahl. Ein laufender Lauf bleibt unberührt. */
    verwerfeWarm() {
      if (!laeuft) verwerfe();
    },
    abbrechen() {
      if (!laeuft) return;
      const id = laufId;
      beiEreignis({ typ: "system", text: "Lauf abgebrochen – die Pizza wurde aus dem Ofen genommen." });
      beende(id, { exitCode: null, abgebrochen: true });
    },
  };
}
