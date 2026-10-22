/* pizza v3.0 – Ausführungs-Worker. Protokoll: ARCHITEKTUR.md §2, erweitert für WASM.md §4.
 * UI → Worker:
 *   { typ: "start", code, args?, motor?: "auto"|"wasm"|"interpreter", pizzaiolo?: boolean }
 *       pizzaiolo: Ergebnis des einmaligen Fähigkeiten-Checks der Seite. Nur bei true wird
 *       pizzaiolo.js geladen – so entsteht kein 404 pro Lauf, wenn der Compiler fehlt.
 *   { typ: "kompiliere", code }   → { typ: "pkarton", ok, daten?, kompilierMs?, fehler?, nichtUnterstuetzt?, grund? }
 *   { typ: "pruefe" }             → { typ: "faehigkeiten", interpreter, wasm, version?, grund? }   (lädt pizzaiolo.js genau einmal)
 * Worker → UI: Ereignisse einzeln oder gebündelt als { typ: "batch", ereignisse: [...] }.
 *   Zusätzlich: { typ: "motor", motor, grund?, kompilierMs? }; "ende" trägt laufMs und motor.
 * Küchenbrigade (THREADS §4.8, K-104 Punkt 12): "start" trägt koeche: "auto" | 1 | 2 | 4 | 8. Nutzt das Programm
 *   brigade (Gruppe kueche), legt der Worker VOR dem Lauf einen Köche-Pool an (Kinder-Worker, Pizzaiolo.kuechenPool) und
 *   behält ihn für weitere Läufe mit derselben Anzahl; „Abbrechen“ = terminate() beendet ihn mit. "ende" trägt dann
 *   koeche (tatsächlich genutzt, 1 ohne Köche/Interpreter) und poolWarm: true, solange der Pool lebt (die Seite darf
 *   diesen Worker für den nächsten Lauf wiederverwenden).
 * Regel (WASM.md §4): motor "wasm" fällt NIE auf den Interpreter zurück – stattdessen Fehler (Exit-Code 2).
 */
"use strict";

var PL = null;
try { importScripts("pizza.js"); PL = self.PizzaLang || null; } catch (e) { PL = null; }

var PZ = null, pzGeladen = false, pzFehler = "Wasm-Compiler (pizzaiolo.js) ist noch nicht verfügbar";
var pzBereit = null;

/** Lädt pizzaiolo.js höchstens einmal pro Worker; liefert Promise<Pizzaiolo|null>. */
function ladePizzaiolo() {
  if (pzBereit) return pzBereit;
  pzGeladen = true;
  if (!PL) { pzFehler = "Interpreter fehlt"; pzBereit = Promise.resolve(null); return pzBereit; }
  try {
    importScripts("pizzaiolo.js");
    PZ = self.Pizzaiolo || null;
    if (!PZ) pzFehler = "pizzaiolo.js definiert kein Pizzaiolo-Objekt";
    else if (typeof PZ.unterstuetzt === "function" && !PZ.unterstuetzt()) { pzFehler = "WebAssembly wird in diesem Browser nicht unterstützt"; PZ = null; }
    else {
      // Darf hier überhaupt Wasm kompiliert werden? (CSP ohne 'wasm-unsafe-eval' blockiert WebAssembly.Module)
      try { new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); }
      catch (e) { pzFehler = "WebAssembly ist durch die Sicherheitsrichtlinie der Seite blockiert"; PZ = null; }
    }
  } catch (e) {
    PZ = null;
    pzFehler = "Wasm-Compiler (pizzaiolo.js) ist noch nicht verfügbar";
  }
  var init = Promise.resolve();
  if (PZ) {
    try {
      if (typeof PZ.init === "function") init = Promise.resolve(PZ.init());
      else if (PZ.bereit && typeof PZ.bereit.then === "function") init = PZ.bereit;
    } catch (e) { init = Promise.reject(e); }
  }
  pzBereit = init.then(function () { return PZ; }, function (e) {
    pzFehler = "Wasm-Laufzeit konnte nicht geladen werden: " + (e && e.message ? e.message : String(e));
    PZ = null;
    return null;
  });
  return pzBereit;
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
  if (ereignis.typ === "panik" || ereignis.typ === "ende" || ereignis.typ === "fehler" || ereignis.typ === "motor" || ereignis.typ === "leeren" || puffer.length >= BATCH) flush();
}
function jetzt() { return (self.performance && performance.now) ? performance.now() : Date.now(); }
function meldung(e) { return e && e.message ? e.message : String(e); }

/* ---------- Interaktive Eingabe (EINGABE.md §3) ----------
 * Geteilter Puffer: Int32 [0] = Status (0 wartet, 1 Daten, 2 EOF, 3 Abbruch), [1] = Länge in Bytes, ab Byte 8 UTF-8-Daten. */
function eingabeRueckruf(sab) {
  var ctrl = new Int32Array(sab, 0, 2);
  var daten = new Uint8Array(sab, 8);
  var dekoder = new TextDecoder();
  return function (anfrage) {
    Atomics.store(ctrl, 0, 0);
    Atomics.store(ctrl, 1, 0);
    sende({ typ: "eingabe-anfrage", prompt: anfrage && anfrage.prompt != null ? String(anfrage.prompt) : null, art: anfrage && anfrage.art === "zahl" ? "zahl" : "zeile" });
    flush();
    while (Atomics.load(ctrl, 0) === 0) Atomics.wait(ctrl, 0, 0);
    var status = Atomics.load(ctrl, 0);
    if (status === 1) {
      var n = Math.min(Atomics.load(ctrl, 1), daten.length);
      var kopie = new Uint8Array(n);
      kopie.set(daten.subarray(0, n));
      return dekoder.decode(kopie);
    }
    return null; // EOF oder Abbruch
  };
}

/* ---------- Theke (THEKE.md §4): blockierend auf das nächste UI-Ereignis warten ----------
 * Gleicher Puffer wie bei der Eingabe (die beiden Wartezustände schließen sich aus). Status 1 = JSON-Ereignis, 2/3 = kein Ereignis. */
function uiWarteRueckruf(sab) {
  var ctrl = new Int32Array(sab, 0, 2);
  var daten = new Uint8Array(sab, 8);
  var dekoder = new TextDecoder();
  return function () {
    Atomics.store(ctrl, 0, 0);
    Atomics.store(ctrl, 1, 0);
    sende({ typ: "ui-warte" });
    flush();
    while (Atomics.load(ctrl, 0) === 0) Atomics.wait(ctrl, 0, 0);
    if (Atomics.load(ctrl, 0) !== 1) return null;
    var n = Math.min(Atomics.load(ctrl, 1), daten.length);
    var kopie = new Uint8Array(n);
    kopie.set(daten.subarray(0, n));
    try { return JSON.parse(dekoder.decode(kopie)); } catch (e) { return null; }
  };
}

/* ---------- Küchenbrigade: Gruppe kueche erkennen, Köche-Pool vor dem Lauf ---------- */
/** Nutzt das Programm brigade? Wie der Compiler (frontend.js): Methodenaufruf/Zugriff namens brigade im AST. */
function nutztBrigade(code) {
  if (!/\bbrigade\b/.test(code)) return false;
  var p;
  try { p = PL && typeof PL.parse === "function" ? PL.parse(code) : null; } catch (e) { p = null; }
  if (!p || !p.ok || !p.ast) return /\.\s*brigade\b/.test(code);
  var stapel = [p.ast], gesehen = 0;
  while (stapel.length) {
    var n = stapel.pop();
    if (!n || typeof n !== "object") continue;
    if (++gesehen > 2000000) return true;
    if ((n.k === "MCall" || n.k === "Mem") && n.name === "brigade") return true;
    if (Array.isArray(n)) { for (var i = 0; i < n.length; i++) if (n[i] && typeof n[i] === "object") stapel.push(n[i]); }
    else for (var key in n) { var v = n[key]; if (v && typeof v === "object") stapel.push(v); }
  }
  return false;
}

function koecheWahl(k) {
  if (k === "auto" || k === undefined || k === null || k === "") return "auto";
  var z = Math.floor(Number(k));
  return isFinite(z) && z >= 1 ? Math.min(z, 64) : "auto";
}

// Pool dieses Lauf-Workers: { k, pool } – auch ein null-Ergebnis wird gemerkt (keine Isolation, Köche laden nicht),
// damit nicht jeder Lauf erneut bis zur Frist von kuechenPool wartet.
var kuechenStand = null;
function holePool(k) {
  if (!PZ || typeof PZ.kuechenPool !== "function" || k === 1) return Promise.resolve(null);
  if (kuechenStand && kuechenStand.k === k) return kuechenStand.versprechen;
  // nur dieser Worker beendet seine Pools – danach gilt der alte Stand nicht mehr
  if (kuechenStand && kuechenStand.pool) { try { kuechenStand.pool.beenden(); } catch (e) { /* egal */ } kuechenStand.pool = null; }
  var stand = { k: k, pool: null, versprechen: null };
  var url;
  try { url = new URL("pizzaiolo/koch.js", self.location.href).href; } catch (e) { url = undefined; }
  stand.versprechen = Promise.resolve()
    .then(function () { return PZ.kuechenPool(k, url ? { url: url } : undefined); })
    .then(function (p) { stand.pool = p || null; return stand.pool; }, function () { return null; });
  kuechenStand = stand;
  return stand.versprechen;
}
function poolLebt() { return !!(kuechenStand && kuechenStand.pool); }

function wasmFehler(text, zeile, spalte) {
  sende({ typ: "motor", motor: "wasm", grund: text });
  sende({ typ: "fehler", code: "W-WASM", art: "wasm", text: text, zeile: zeile == null ? null : zeile, spalte: spalte == null ? null : spalte });
  sende({ typ: "ende", exitCode: 2, schritte: 0, zeitMs: 0, laufMs: 0, motor: "wasm" });
}

function starte(d, pool, brigade) {
  if (!PL || typeof PL.run !== "function") {
    sende({ typ: "fehler", code: "INTERN", art: "intern", text: "Der Interpreter (js/pizza.js) konnte nicht geladen werden. Der Ofen ist kalt.", zeile: null, spalte: null });
    sende({ typ: "ende", exitCode: 2, schritte: 0, zeitMs: 0 });
    return;
  }
  var motor = d.motor === "wasm" || d.motor === "interpreter" ? d.motor : "auto";
  var code = String(d.code || "");

  // Explizit Wasm: niemals stillschweigend Interpreter
  if (motor === "wasm") {
    if (!PZ) { wasmFehler("Wasm-Motor nicht verfügbar: " + pzFehler + ". Wähle „Auto“ oder „Interpreter“."); return; }
    if (typeof PZ.kompiliere === "function") {
      var k;
      try { k = PZ.kompiliere(code, {}); } catch (e) { wasmFehler("Wasm-Compiler ist abgestürzt: " + meldung(e)); return; }
      if (k && !k.ok && Array.isArray(k.nichtUnterstuetzt) && k.nichtUnterstuetzt.length) {
        var n = k.nichtUnterstuetzt;
        var liste = n.slice(0, 5).map(function (x) { return (x.zeile ? "Zeile " + x.zeile + ": " : "") + x.grund; }).join("; ");
        wasmFehler("Dieses Programm lässt sich noch nicht als Wasm backen – " + liste + (n.length > 5 ? " (und " + (n.length - 5) + " weitere)" : "") +
          ". Mit „Auto“ läuft es im Interpreter.", n[0].zeile, n[0].spalte);
        return;
      }
      // Syntaxfehler (k.fehler) meldet der Lauf selbst
    }
  }

  var endeGesehen = false, motorGesehen = false, ergebnis = null, t0 = jetzt();
  var genutzterMotor = function () { return ergebnis && ergebnis.motor ? ergebnis.motor : (PZ && motor !== "interpreter" ? "wasm" : "interpreter"); };
  var opt = {
    args: Array.isArray(d.args) ? d.args : [],
    eingabe: Array.isArray(d.eingabe) ? d.eingabe.map(String) : undefined,
    // K-077: Saat kommt von der Seite (echte Saat oder „feste Saat 42“)
    zufallsSaat: typeof d.zufallsSaat === "number" ? d.zufallsSaat : undefined,
    // K-080/K-081: Vorrat aus localStorage (von der Seite gelesen) und Rückschreiben über eine Nachricht
    vorrat: d.vorrat && typeof d.vorrat === "object" ? d.vorrat : undefined,
    onVorrat: d.vorratAktiv ? function (name, eintraege) { sende({ typ: "vorrat-speichern", name: name, eintraege: eintraege }); return true; } : undefined,
    onEingabe: (typeof SharedArrayBuffer !== "undefined" && d.eingabePuffer instanceof SharedArrayBuffer) ? eingabeRueckruf(d.eingabePuffer) : undefined,
    koeche: pool || undefined,
    onUiWarte: (typeof SharedArrayBuffer !== "undefined" && d.eingabePuffer instanceof SharedArrayBuffer) ? uiWarteRueckruf(d.eingabePuffer) : undefined,
    onEvent: function (ev) {
      if (!ev) return;
      if (ev.typ === "motor") {
        motorGesehen = true;
        if (motor === "wasm" && ev.motor !== "wasm") { // Sicherheitsnetz gegen Fallback
          wasmFehler("Wasm-Motor hat auf den Interpreter umgeschaltet" + (ev.grund ? " (" + ev.grund + ")" : "") + " – abgebrochen.");
          throw new Error("__pizza_wasm_abbruch__");
        }
      }
      if (ev.typ === "ende") {
        endeGesehen = true;
        var m = ev.motor || (motor === "wasm" ? "wasm" : genutzterMotor());
        if (!motorGesehen) { motorGesehen = true; sende({ typ: "motor", motor: m, kompilierMs: ev.kompilierMs }); }
        ev = Object.assign({}, ev, { laufMs: jetzt() - t0, motor: m });
        ev = mitKoechen(ev, brigade);
      }
      sende(ev);
    },
  };
  try {
    if (PZ && typeof PZ.run === "function" && motor !== "interpreter") {
      opt.motor = motor;
      ergebnis = PZ.run(code, opt);
    } else {
      motorGesehen = true;
      sende({ typ: "motor", motor: "interpreter", grund: motor === "interpreter" ? null : pzFehler });
      ergebnis = PL.run(code, opt);
    }
    if (!motorGesehen && ergebnis && ergebnis.motor) {
      if (motor === "wasm" && ergebnis.motor !== "wasm") { wasmFehler("Wasm-Motor hat auf den Interpreter umgeschaltet – Ergebnis verworfen."); flush(); return; }
      sende({ typ: "motor", motor: ergebnis.motor, kompilierMs: ergebnis.kompilierMs });
    }
    if (!endeGesehen) {
      sende(mitKoechen({
        typ: "ende",
        exitCode: ergebnis && typeof ergebnis.exitCode === "number" ? ergebnis.exitCode : 0,
        schritte: ergebnis ? ergebnis.schritte : null,
        zeitMs: ergebnis ? ergebnis.zeitMs : null,
        laufMs: jetzt() - t0,
        motor: genutzterMotor(),
      }, brigade));
    }
  } catch (e) {
    if (meldung(e) === "__pizza_wasm_abbruch__") { flush(); return; }
    sende({ typ: "fehler", code: "INTERN", art: "intern", text: "Interner Fehler im Ofen: " + meldung(e), zeile: null, spalte: null });
    if (!endeGesehen) sende({ typ: "ende", exitCode: 2, schritte: null, zeitMs: null, laufMs: jetzt() - t0 });
  }
  flush();
}

/** Hüllen-Anzeige „Köche: N“ (SPEC §17.7): nur bei Programmen mit brigade; 1, wenn keine Köche gekocht haben. */
function mitKoechen(ev, brigade) {
  var zusatz = {};
  if (brigade) zusatz.koeche = typeof ev.koeche === "number" && ev.koeche > 0 ? ev.koeche : 1;
  else if ("koeche" in ev) zusatz.koeche = undefined;
  if (poolLebt()) zusatz.poolWarm = true;
  var r = Object.assign({}, ev, zusatz);
  if (r.koeche === undefined) delete r.koeche;
  return r;
}

function kompiliere(d) {
  if (!PZ || typeof PZ.kompiliere !== "function") {
    self.postMessage({ typ: "pkarton", ok: false, grund: pzFehler });
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
    self.postMessage({ typ: "pkarton", ok: false, grund: "Interner Compilerfehler: " + meldung(e) });
  }
}

self.onmessage = function (msg) {
  var d = msg.data || {};
  if (d.typ === "start") {
    // Compiler nur laden, wenn die Seite ihn als vorhanden gemeldet hat
    var p = d.pizzaiolo === true ? ladePizzaiolo() : Promise.resolve(null);
    if (d.pizzaiolo !== true && !pzGeladen) pzFehler = d.pizzaioloGrund || pzFehler;
    p.then(function () {
      var code = String(d.code || "");
      var brigade = nutztBrigade(code);
      // Pool nur, wenn Wasm laufen kann (der Interpreter kocht sequentiell) – und VOR dem Lauf (THREADS §4.6)
      if (!brigade || !PZ || d.motor === "interpreter") return starte(d, null, brigade);
      return holePool(koecheWahl(d.koeche)).then(function (pool) { starte(d, pool, brigade); });
    });
  } else if (d.typ === "kompiliere") {
    ladePizzaiolo().then(function () { kompiliere(d); });
  } else if (d.typ === "pruefe") {
    ladePizzaiolo().then(function () {
      self.postMessage({ typ: "faehigkeiten", interpreter: !!PL, wasm: !!(PZ && typeof PZ.run === "function"), version: PZ && PZ.version, grund: PZ ? null : pzFehler });
    });
  }
};
