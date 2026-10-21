// Startet pro Lauf einen frischen Worker, Wand-Zeitlimit 10 s, Abbruch, Hawaii-Panik.

const ZEITLIMIT_MS = 10_000;

/** Einmaliger Auftrag an einen eigenen Worker (Kompilieren, Fähigkeiten prüfen). */
export function workerAuftrag(nachricht, antwortTyp, zeitlimit = 15_000) {
  return new Promise((resolve) => {
    let w;
    try { w = new Worker("js/worker.js"); } catch (e) { resolve({ ok: false, grund: "Web Worker nicht verfügbar" }); return; }
    const t = setTimeout(() => { w.terminate(); resolve({ ok: false, grund: "Zeitlimit überschritten" }); }, zeitlimit);
    w.onmessage = (m) => {
      if (!m.data || m.data.typ !== antwortTyp) return;
      clearTimeout(t); w.terminate(); resolve(m.data);
    };
    w.onerror = (e) => { e.preventDefault && e.preventDefault(); clearTimeout(t); w.terminate(); resolve({ ok: false, grund: e.message || "Fehler im Worker" }); };
    w.postMessage(nachricht);
  });
}

export function erstelleAusfuehrung({ beiEreignis, beiStart, beiEnde, beiPanik, beiMotor }) {
  let worker = null, timer = null, start = 0, laufId = 0;

  function aufraeumen() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (worker) { try { worker.terminate(); } catch (e) { /* egal */ } worker = null; }
  }

  function beende(id, info) {
    if (id !== laufId) return;
    laufId++;
    const wandMs = performance.now() - start;
    aufraeumen();
    beiEnde({ ...info, wandMs });
  }

  function verarbeite(id, ev) {
    if (id !== laufId || !ev) return;
    if (ev.typ === "batch" && Array.isArray(ev.ereignisse)) {
      for (const e of ev.ereignisse) { verarbeite(id, e); if (id !== laufId) return; }
      return;
    }
    if (ev.typ === "panik") {
      // sofort stoppen – kein "ende" wird mehr abgewartet
      try { worker && worker.terminate(); } catch (e) { /* egal */ }
      beiEreignis(ev);
      beende(id, { exitCode: 39, schritte: null, zeitMs: null, panik: ev.text });
      beiPanik(ev.text);
      return;
    }
    if (ev.typ === "ende") {
      beende(id, { exitCode: ev.exitCode, schritte: ev.schritte, zeitMs: ev.zeitMs, laufMs: ev.laufMs, motor: ev.motor });
      return;
    }
    if (ev.typ === "motor") { beiMotor && beiMotor(ev); return; }
    beiEreignis(ev);
  }

  return {
    get laeuft() { return worker !== null; },
    starte(code, args = [], motor = "auto") {
      aufraeumen();
      const id = ++laufId;
      start = performance.now();
      beiStart();
      try {
        worker = new Worker("js/worker.js");
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
      timer = setTimeout(() => {
        beiEreignis({ typ: "fehler", art: "limit", code: "P0002", text: "Die Pizza ist noch im Ofen (Zeitlimit von 10 s erreicht).", zeile: null, spalte: null });
        beende(id, { exitCode: 3, zusatz: "Zeitlimit" });
      }, ZEITLIMIT_MS);
      worker.postMessage({ typ: "start", code, args, motor });
    },
    abbrechen() {
      if (!worker) return;
      const id = laufId;
      beiEreignis({ typ: "system", text: "Lauf abgebrochen – die Pizza wurde aus dem Ofen genommen." });
      beende(id, { exitCode: null, abgebrochen: true });
    },
  };
}
