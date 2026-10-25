// Herd-Zeichner (site/js/herd/zeichner.js) in einem vm-Kontext mit virtueller Uhr: rAF im Bildschirmtakt, setTimeout,
// ein nachgebildeter Programm-Worker (liest den Takt aus dem Herd-Puffer, antwortet nach L ms mit einem Bildpaket) und eine
// Glut-Attrappe. Prüft die Gleichmäßigkeit (je Bildschirmbild genau ein neuer Takt, auch wenn der Bildschirm nicht genau mit
// 60,000 Hz läuft) und das Bildfach (SharedArrayBuffer: Pakete als Länge, Freigabe nach g.bild, Rückfall auf Übertragung).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "site", "js");
const QUELLE = fs.readFileSync(path.join(JS, "herd", "zeichner.js"), "utf8");
const KOPF = 16, FACH_KOPF = 16;

/** Ein Lauf: hz = Bildschirmtakt, zittern = ± ms je rAF, latenz = Programm-Worker je Takt, fach = Bildfach benutzen. */
async function lauf({ hz, zittern = 0, latenz = 2, sekunden = 60, fach = true, saat = 7 }) {
  let jetzt = 0, seq = 0, r = saat;
  const zufall = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const warteschlange = [];   // {t, n, fn}
  const plane = (t, fn) => { const e = { t, n: seq++, fn }; warteschlange.push(e); return e; };
  const periode = 1000 / hz;
  let naechsterVsync = periode, rafWartend = [], bildschirm = 0;
  const gezeigt = [];          // je Bildschirmbild: Takte des neu gezeigten Bildes (0 = keins)
  let neuInDiesemBild = 0, letzteNr = 0, bildAufrufe = 0;
  const vsync = () => {
    const t = naechsterVsync + (zufall() - 0.5) * 2 * zittern;
    naechsterVsync += periode;
    plane(Math.max(t, jetzt), () => {
      const l = rafWartend, vorher = bildAufrufe;
      rafWartend = [];
      for (const f of l) f(jetzt);
      if (++bildschirm > 30) gezeigt.push(bildAufrufe !== vorher ? neuInDiesemBild : 0);   // Anlauf nicht mitzählen
      vsync();
    });
  };
  vsync();
  const glut = {
    bild(p) { bildAufrufe++; const nr = (p[8] | (p[9] << 8) | (p[10] << 16) | (p[11] << 24)) >>> 0; neuInDiesemBild = nr - letzteNr; letzteNr = nr; if (fachBelegt) belegtBeimZeichnen.push(Atomics.load(fachBelegt, 0)); },
    statistik: () => [0, 0, 0, 0, 0, 0], schnittstelle: () => "Test", adapter: () => "Test", msaa: () => 1, groesse() {}, free() {},
  };
  const belegtBeimZeichnen = [];
  const port = { onmessage: null };
  const ctx = {
    console, Math, JSON, Object, Array, Set, Map, Uint8Array, Int32Array, ArrayBuffer, SharedArrayBuffer, Atomics, TextEncoder, Promise, Error, isFinite,
    performance: { now: () => jetzt },
    requestAnimationFrame: (fn) => { rafWartend.push(fn); return rafWartend.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => plane(jetzt + Math.max(0, ms || 0), fn),
    clearTimeout: (e) => { if (e) e.fn = () => {}; },
    wasm_bindgen: Object.assign(() => Promise.resolve(), { GlutWeb: { erzeuge: () => Promise.resolve(glut) } }),
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(QUELLE, ctx, { filename: "zeichner.js" });
  const puffer = new SharedArrayBuffer(KOPF + 8192);
  const ctrl = new Int32Array(puffer, 0, 4);
  await ctx.HerdZeichner.starte({ canvas: { width: 0, height: 0 }, puffer, port, breite: 320, hoehe: 180, wasmUrl: "x", melde: () => {} });

  // Programm-Worker: Takt lesen, nach `latenz` ms ein Paket (Bildnummer an Byte 8) ins Fach oder übertragen
  let bildnr = 0, gelesen = 0, fachSab = null, fachBelegt = null, fachDaten = null, ueberFach = 0, uebertragen = 0;
  const programm = () => {
    if (Atomics.load(ctrl, 0) === gelesen) return;
    gelesen = Atomics.load(ctrl, 0);
    const text = new TextDecoder().decode(new Uint8Array(puffer, KOPF, Atomics.load(ctrl, 2)).slice());
    const takt = JSON.parse(text);
    plane(jetzt + latenz * (0.5 + zufall()), () => {
      bildnr += takt.anzahl;
      const p = new Uint8Array(64);
      p[8] = bildnr & 255; p[9] = (bildnr >> 8) & 255; p[10] = (bildnr >> 16) & 255; p[11] = (bildnr >>> 24) & 255;
      if (fach && (!fachSab || Atomics.load(fachBelegt, 0) === 0)) {
        if (!fachSab) { fachSab = new SharedArrayBuffer(FACH_KOPF + 1024); fachBelegt = new Int32Array(fachSab, 0, 1); fachDaten = new Uint8Array(fachSab, FACH_KOPF); port.onmessage({ data: fachSab }); }
        fachDaten.set(p); Atomics.store(fachBelegt, 0, 1); ueberFach++;
        port.onmessage({ data: p.length });
      } else { uebertragen++; port.onmessage({ data: p.buffer }); }
    });
  };
  const ende = sekunden * 1000;
  while (warteschlange.length) {
    warteschlange.sort((a, b) => a.t - b.t || a.n - b.n);
    const e = warteschlange.shift();
    if (e.t > ende) break;
    jetzt = e.t;
    e.fn(jetzt);
    programm();
  }
  const h = {};
  for (const z of gezeigt) h[z] = (h[z] || 0) + 1;
  return { haeufigkeit: h, ueberFach, uebertragen, belegtBeimZeichnen };
}

// 60,000 Hz mit Zittern: immer genau ein Takt je Bild
{
  const r = await lauf({ hz: 60, zittern: 1 });
  assert.deepEqual(Object.keys(r.haeufigkeit), ["1"], "60 Hz: jedes Bild ein Takt " + JSON.stringify(r.haeufigkeit));
}
// 59,94 Hz (viele Bildschirme/Notebooks): der rAF wandert über die Taktgrenzen – höchstens die unvermeidlichen Doppeltakte
// (3600 Takte auf 3596 Bilder ≈ 4 je Minute), keine ausgefallenen Bilder mehr (vorher je Minute ≈ 40 × „0 Takte“ + 40 × „2“)
{
  const r = await lauf({ hz: 59.94, zittern: 0.5 });
  const h = r.haeufigkeit;
  assert.ok(!h[0] || h[0] <= 1, "59,94 Hz: kein Bild ohne neuen Takt " + JSON.stringify(h));
  assert.ok((h[2] || 0) <= 6, "59,94 Hz: nur die unvermeidlichen Doppeltakte " + JSON.stringify(h));
}
// 60,05 Hz: der Bildschirm ist schneller – höchstens die unvermeidlichen Wiederholungen, keine Doppeltakte
{
  const r = await lauf({ hz: 60.05, zittern: 0.5 });
  const h = r.haeufigkeit;
  assert.ok(!h[2], "60,05 Hz: keine Doppeltakte " + JSON.stringify(h));
  assert.ok((h[0] || 0) <= 5, "60,05 Hz: nur die unvermeidlichen Wiederholungen " + JSON.stringify(h));
}
// Bildfach: alle Pakete über das Fach (Programm schreibt nur in ein freies Fach), beim Zeichnen ist es belegt, danach frei
{
  const r = await lauf({ hz: 60, zittern: 1, sekunden: 5 });
  assert.equal(r.uebertragen, 0, "kein Paket musste übertragen werden");
  assert.ok(r.ueberFach > 250, "Pakete über das Fach: " + r.ueberFach);
  assert.ok(r.belegtBeimZeichnen.every((b) => b === 1), "g.bild liest das Fach, solange es belegt ist");
}
// ohne Fach (übertragene ArrayBuffer) unverändert gleichmäßig
{
  const r = await lauf({ hz: 60, zittern: 1, sekunden: 5, fach: false });
  assert.deepEqual(Object.keys(r.haeufigkeit), ["1"]);
  assert.equal(r.ueberFach, 0);
}
console.log("herd-zeichner: Takt je Bild und Bildfach ok");
