/* pizza v3.0 – Ausführungs-Worker. Protokoll: ARCHITEKTUR.md §2.
 * UI → Worker: { typ: "start", code, args? }
 * Worker → UI: Ereignisse einzeln oder gebündelt als { typ: "batch", ereignisse: [...] }.
 */
"use strict";

var geladen = null;
try {
  importScripts("pizza.js");
  geladen = self.PizzaLang || null;
} catch (e) {
  geladen = null;
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
  // panik/ende/fehler sofort zustellen, damit die UI reagieren kann
  if (ereignis.typ === "panik" || ereignis.typ === "ende" || ereignis.typ === "fehler" || puffer.length >= BATCH) flush();
}

self.onmessage = function (msg) {
  var d = msg.data || {};
  if (d.typ !== "start") return;

  if (!geladen || typeof geladen.run !== "function") {
    sende({ typ: "fehler", code: "INTERN", art: "intern", text: "Der Interpreter (js/pizza.js) konnte nicht geladen werden. Der Ofen ist kalt.", zeile: null, spalte: null });
    sende({ typ: "ende", exitCode: 2, schritte: 0, zeitMs: 0 });
    return;
  }

  var endeGesehen = false;
  try {
    var ergebnis = geladen.run(String(d.code || ""), {
      args: Array.isArray(d.args) ? d.args : [],
      onEvent: function (ev) {
        if (ev && ev.typ === "ende") endeGesehen = true;
        sende(ev);
      },
    });
    if (!endeGesehen) {
      sende({
        typ: "ende",
        exitCode: ergebnis && typeof ergebnis.exitCode === "number" ? ergebnis.exitCode : 0,
        schritte: ergebnis ? ergebnis.schritte : null,
        zeitMs: ergebnis ? ergebnis.zeitMs : null,
      });
    }
  } catch (e) {
    sende({ typ: "fehler", code: "INTERN", art: "intern", text: "Interner Fehler im Interpreter: " + (e && e.message ? e.message : String(e)), zeile: null, spalte: null });
    if (!endeGesehen) sende({ typ: "ende", exitCode: 2, schritte: null, zeitMs: null });
  }
  flush();
};
