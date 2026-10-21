/* pizza v3.0 – Ausführungs-Worker. Protokoll: ARCHITEKTUR.md §2, erweitert für WASM.md §4.
 * UI → Worker:
 *   { typ: "start", code, args?, motor?: "auto"|"wasm"|"interpreter" }
 *   { typ: "kompiliere", code }                       → { typ: "pkarton", ok, daten?, kompilierMs?, fehler?, nichtUnterstuetzt? }
 *   { typ: "pruefe" }                                 → { typ: "faehigkeiten", interpreter, wasm, version? }
 * Worker → UI: Ereignisse einzeln oder gebündelt als { typ: "batch", ereignisse: [...] }.
 *   Zusätzlich: { typ: "motor", motor, grund?, kompilierMs? } (vor bzw. während des Laufs)
 *   "ende" trägt zusätzlich laufMs (gemessene Wandzeit des reinen Laufs im Worker) und motor.
 */
"use strict";

var PL = null, PZ = null, pzFehler = null;
try { importScripts("pizza.js"); PL = self.PizzaLang || null; } catch (e) { PL = null; }
if (PL) {
  try {
    importScripts("pizzaiolo.js");
    PZ = self.Pizzaiolo || null;
    if (PZ && typeof PZ.unterstuetzt === "function" && !PZ.unterstuetzt()) { pzFehler = "WebAssembly wird hier nicht unterstützt"; PZ = null; }
  } catch (e) {
    PZ = null;
    pzFehler = "Wasm-Compiler (pizzaiolo.js) nicht verfügbar";
  }
}

// Optionale asynchrone Initialisierung des Compilers (z. B. Laden von laufzeit.wasm)
var bereit = Promise.resolve();
if (PZ) {
  try {
    if (typeof PZ.init === "function") bereit = Promise.resolve(PZ.init());
    else if (PZ.bereit && typeof PZ.bereit.then === "function") bereit = PZ.bereit;
  } catch (e) { bereit = Promise.reject(e); }
  bereit = bereit.catch(function (e) {
    pzFehler = "Wasm-Laufzeit konnte nicht geladen werden: " + (e && e.message ? e.message : String(e));
    PZ = null;
  });
}

var puffer = [];
var BATCH = 200;
function flush() {
  if (!puffer.length) return;
  if (puffer.length === 1) self.postMessage(puffer[0]);
  else self.postMessage({ typ: "batch", ereignisse: puffer });
  puffer = [];
}
function sende(ereignis) {
  puffer.push(ereignis);
  if (ereignis.typ === "panik" || ereignis.typ === "ende" || ereignis.typ === "fehler" || ereignis.typ === "motor" || puffer.length >= BATCH) flush();
}
function jetzt() { return (self.performance && performance.now) ? performance.now() : Date.now(); }

function starte(d) {
  if (!PL || typeof PL.run !== "function") {
    sende({ typ: "fehler", code: "INTERN", art: "intern", text: "Der Interpreter (js/pizza.js) konnte nicht geladen werden. Der Ofen ist kalt.", zeile: null, spalte: null });
    sende({ typ: "ende", exitCode: 2, schritte: 0, zeitMs: 0 });
    return;
  }
  var motor = d.motor === "wasm" || d.motor === "interpreter" ? d.motor : "auto";
  var endeGesehen = false, motorGesehen = false;
  var opt = {
    args: Array.isArray(d.args) ? d.args : [],
    onEvent: function (ev) {
      if (!ev) return;
      if (ev.typ === "motor") motorGesehen = true;
      if (ev.typ === "ende") {
        endeGesehen = true;
        ev = Object.assign({}, ev, { laufMs: jetzt() - t0, motor: ev.motor || genutzterMotor() });
      }
      sende(ev);
    },
  };
  var t0 = jetzt(), ergebnis = null;
  var genutzterMotor = function () { return ergebnis && ergebnis.motor ? ergebnis.motor : (PZ && motor !== "interpreter" ? "wasm" : "interpreter"); };
  try {
    if (PZ && typeof PZ.run === "function") {
      opt.motor = motor;
      ergebnis = PZ.run(String(d.code || ""), opt);
    } else {
      if (!motorGesehen) {
        motorGesehen = true;
        sende({ typ: "motor", motor: "interpreter", grund: motor === "interpreter" ? null : (pzFehler || "Wasm-Compiler nicht verfügbar") });
      }
      ergebnis = PL.run(String(d.code || ""), opt);
    }
    if (!motorGesehen && ergebnis && ergebnis.motor) {
      sende({ typ: "motor", motor: ergebnis.motor, kompilierMs: ergebnis.kompilierMs });
    }
    if (!endeGesehen) {
      sende({
        typ: "ende",
        exitCode: ergebnis && typeof ergebnis.exitCode === "number" ? ergebnis.exitCode : 0,
        schritte: ergebnis ? ergebnis.schritte : null,
        zeitMs: ergebnis ? ergebnis.zeitMs : null,
        laufMs: jetzt() - t0,
        motor: genutzterMotor(),
      });
    }
  } catch (e) {
    sende({ typ: "fehler", code: "INTERN", art: "intern", text: "Interner Fehler im Ofen: " + (e && e.message ? e.message : String(e)), zeile: null, spalte: null });
    if (!endeGesehen) sende({ typ: "ende", exitCode: 2, schritte: null, zeitMs: null, laufMs: jetzt() - t0 });
  }
  flush();
}

function kompiliere(d) {
  if (!PZ || typeof PZ.kompiliere !== "function") {
    self.postMessage({ typ: "pkarton", ok: false, grund: pzFehler || "Wasm-Compiler nicht verfügbar" });
    return;
  }
  try {
    var r = PZ.kompiliere(String(d.code || ""), {});
    if (r && r.ok && r.pkarton) {
      var daten = r.pkarton instanceof Uint8Array ? r.pkarton : new Uint8Array(r.pkarton);
      self.postMessage({ typ: "pkarton", ok: true, daten: daten, kompilierMs: r.kompilierMs }, [daten.buffer]);
    } else {
      self.postMessage({ typ: "pkarton", ok: false, fehler: r && r.fehler, nichtUnterstuetzt: r && r.nichtUnterstuetzt });
    }
  } catch (e) {
    self.postMessage({ typ: "pkarton", ok: false, grund: "Interner Compilerfehler: " + (e && e.message ? e.message : String(e)) });
  }
}

self.onmessage = function (msg) {
  var d = msg.data || {};
  bereit.then(function () {
    if (d.typ === "start") starte(d);
    else if (d.typ === "kompiliere") kompiliere(d);
    else if (d.typ === "pruefe") {
      self.postMessage({ typ: "faehigkeiten", interpreter: !!PL, wasm: !!(PZ && typeof PZ.kompiliere === "function"), version: PZ && PZ.version, grund: pzFehler });
    }
  });
};
