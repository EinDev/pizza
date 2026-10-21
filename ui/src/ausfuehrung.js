// Startet pro Lauf einen frischen Worker. Kein Wand-Zeitlimit (Browser = nativ): es gilt nur das Schrittlimit des
// Interpreters/Compilers, dazu „Abbrechen“. Hawaii (panik) ist ein normales Ereignis; das Ende kommt mit „ende“.


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

/** Interaktive Eingabe möglich? (SharedArrayBuffer + Atomics, nur bei Cross-Origin-Isolation) */
export function interaktivMoeglich() {
  return typeof SharedArrayBuffer === "function" && typeof Atomics === "object" && self.crossOriginIsolated === true;
}

const PUFFER_BYTES = 64 * 1024;

export function erstelleAusfuehrung({ beiEreignis, beiStart, beiEnde, beiPanik, beiMotor, beiEingabeAnfrage, beiEingabeEnde, beiUi, beiVorrat }) {
  let worker = null, start = 0, laufId = 0;
  let uiWartet = false, uiSchlange = [];
  let sab = null, wartet = false, wartezeit = 0, warteBeginn = 0;
  const kodierer = new TextEncoder();

  function aufraeumen() {
    if ((wartet || uiWartet) && sab) signal(3);
    wartet = false; uiWartet = false; uiSchlange = [];
    if (worker) { try { worker.terminate(); } catch (e) { /* egal */ } worker = null; }
    sab = null;
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
    aufraeumen();
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
      beende(id, { exitCode: ev.exitCode, schritte: ev.schritte, zeitMs: ev.zeitMs, laufMs: ev.laufMs, motor: ev.motor });
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
    get laeuft() { return worker !== null; },
    get wartetAufEingabe() { return wartet; },
    /** UI-Ereignis aus der Theke an das Programm (wird gepuffert, falls es gerade nicht wartet). */
    uiEreignis(ereignis) {
      if (!worker || !sab) return;
      if (uiWartet) {
        uiWartet = false;
        wartezeit += performance.now() - warteBeginn;
        signal(1, kodierer.encode(JSON.stringify(ereignis)));
      } else uiSchlange.push(ereignis);
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
      aufraeumen();
      const id = ++laufId;
      start = performance.now();
      wartezeit = 0;
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
      const nachricht = { ...extra, typ: "start", code, args, motor };
      if (!Array.isArray(extra.eingabe) && interaktivMoeglich()) {
        try { sab = new SharedArrayBuffer(8 + PUFFER_BYTES); nachricht.eingabePuffer = sab; } catch (e) { sab = null; }
      }
      worker.postMessage(nachricht);
    },
    abbrechen() {
      if (!worker) return;
      const id = laufId;
      beiEreignis({ typ: "system", text: "Lauf abgebrochen – die Pizza wurde aus dem Ofen genommen." });
      beende(id, { exitCode: null, abgebrochen: true });
    },
  };
}
