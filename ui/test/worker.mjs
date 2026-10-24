// Worker-Protokoll mit Projekt (ARCHITEKTUR §2, PROJEKTE.md §3.6): site/js/worker.js in einem vm-Kontext mit dem echten
// Interpreter (site/js/pizza.js, mit Lader aus PA1). Prüft „start“ mit code und mit projekt, Fehlerorte mit Datei, Bilder mit/ohne
// Vorbacker-Modul und den Ein-Datei-Stub für einen Interpreter ohne Lader.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "site", "js");
const QUELLE_WORKER = fs.readFileSync(path.join(JS, "worker.js"), "utf8");

function neuerWorker(vorbereiten) {
  const nachrichten = [];
  const ctx = {
    console, WebAssembly, TextDecoder, TextEncoder, Uint8Array, Int32Array, ArrayBuffer, Promise, Math, Date, JSON, Object, Array, String, Number,
    Error, Map, Set, WeakMap, Symbol, RegExp, isFinite, parseInt, parseFloat, setTimeout, clearTimeout, queueMicrotask,
    performance: { now: () => Date.now() },
  };
  ctx.self = ctx;
  ctx.importScripts = (datei) => {
    const p = path.join(JS, datei);
    if (!fs.existsSync(p) || datei !== "pizza.js") throw new Error("nicht vorhanden: " + datei);
    vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: datei });
  };
  ctx.postMessage = (m) => { if (m && m.typ === "batch") nachrichten.push(...m.ereignisse); else nachrichten.push(m); };
  vm.createContext(ctx);
  vm.runInContext(QUELLE_WORKER, ctx, { filename: "worker.js" });
  if (vorbereiten) vorbereiten(ctx);
  return {
    ctx,
    async sende(d, endeTyp = "ende") {
      nachrichten.length = 0;
      ctx.onmessage({ data: d });
      for (let i = 0; i < 200 && !nachrichten.some((m) => m.typ === endeTyp); i++) await new Promise((r) => setTimeout(r, 5));
      return nachrichten.slice();
    },
  };
}
const ausgabe = (ev) => ev.filter((e) => e.typ === "ausgabe").map((e) => e.text).join("\n");

const HAUPT = 'Bote.sage(("aus der Hauptdatei"));';
const NEBEN = 'Bote.sage(("aus der Nebendatei"));';
{
  const w = neuerWorker();
  assert.ok(w.ctx.PizzaLang && typeof w.ctx.PizzaLang.projekt.lade === "function", "Interpreter mit Lader (PA1) geladen");
  // Ein-Datei-Abkürzung (App-Link, Tests)
  let ev = await w.sende({ typ: "start", code: HAUPT, motor: "interpreter" });
  assert.equal(ausgabe(ev), "aus der Hauptdatei");
  assert.equal(ev.at(-1).typ, "ende");
  assert.equal(ev.at(-1).exitCode, 0);
  // Ein-Datei-Projekt (auch mit erzeugter pizza.json) → als Text, Ereignisse ohne Datei
  ev = await w.sende({ typ: "start", projekt: { dateien: { "willkommen.pizza": HAUPT, "pizza.json": '{"pizza":1}' }, hauptdatei: "willkommen.pizza", name: "willkommen" }, motor: "interpreter", args: [] });
  assert.equal(ausgabe(ev), "aus der Hauptdatei");
  // Mehrdatei-Projekt: der Lader des Interpreters bekommt das Projekt
  const mehr = { dateien: { "spiel.pizza": 'bestellt "welt/tisch.pizza";\nBote.sage((gruss));', "welt/tisch.pizza": 'margherita gruss = "aus der Nebendatei";' }, hauptdatei: "spiel.pizza", name: "Teigball" };
  ev = await w.sende({ typ: "start", projekt: mehr, motor: "auto" });
  assert.equal(ausgabe(ev), "aus der Nebendatei");
  assert.equal(ev.find((e) => e.typ === "motor").motor, "interpreter", "Auto nimmt den Interpreter, solange Wasm keine Projekte kann");
  // Fehlerort mit Datei (SPEC §2.6)
  ev = await w.sende({ typ: "start", projekt: { ...mehr, dateien: { ...mehr.dateien, "welt/tisch.pizza": 'margherita gruss = 1 / 0;' } }, motor: "interpreter" });
  const f = ev.find((e) => e.typ === "fehler");
  assert.equal(f.datei, "welt/tisch.pizza");
  // Bilder brauchen den Vorbacker (PD2): ohne → HOST-Fehler, mit Modul (Worker-Protokoll `vorbacker`) → Lauf
  const bild = { ...mehr, dateien: { ...mehr.dateien, "bilder/a.png": new Uint8Array([1, 2]) } };
  ev = await w.sende({ typ: "start", projekt: bild, motor: "interpreter" });
  assert.match(ev.find((e) => e.typ === "fehler").text, /Vorbacker fehlt/);
  const modul = new WebAssembly.Module(fs.readFileSync(path.join(JS, "herd", "teigling.wasm")));
  ev = await w.sende({ typ: "start", projekt: bild, motor: "interpreter", vorbacker: modul });
  assert.equal(ausgabe(ev), "aus der Nebendatei");
  assert.equal(ev.at(-1).exitCode, 0);
  // kompiliere ohne Compiler → klare Absage, kein Absturz
  ev = await w.sende({ typ: "kompiliere", projekt: mehr }, "pkarton");
  const pk = ev.find((e) => e.typ === "pkarton");
  assert.equal(pk.ok, false);
  assert.ok(pk.grund);
  // „Wasm“ explizit: kein stiller Interpreter (ohne pizzaiolo.js: Motor fehlt)
  ev = await w.sende({ typ: "start", projekt: mehr, motor: "wasm" });
  assert.equal(ev.find((e) => e.typ === "fehler").art, "wasm");
}
{
  // Alter Interpreter ohne Lader: Ein-Datei-Stub (Programm = Hauptdatei)
  const gesehen = [];
  const w = neuerWorker((ctx) => {
    const PL = ctx.PizzaLang;
    const run = PL.run;
    delete PL.projekt;
    PL.run = (quelle, opt) => { gesehen.push(quelle); return run(quelle, opt); };
  });
  const mehr = { dateien: { "spiel.pizza": HAUPT, "welt/tisch.pizza": NEBEN }, hauptdatei: "spiel.pizza", name: "Teigball" };
  const ev = await w.sende({ typ: "start", projekt: mehr, motor: "auto" });
  assert.equal(gesehen[0], HAUPT);
  assert.equal(ausgabe(ev), "aus der Hauptdatei");
}
console.log("worker ok");
