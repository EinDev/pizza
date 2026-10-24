// Herd-Messlauf im Browser (Paket H6, HERD.md §6) – nur mit HERD_MESSUNG=1, sonst übersprungen. Headless, SwiftShader
// (Software-WebGL2, nie die echte GPU) – die Zahlen sind nur indikativ. Je Benchmark B1–B4 (volle Größe) laufen Kern
// (kern.wasm im Browser, herd/skript.js) und Glut-Web (WebGL2) in der Seite: Kern-Zeit je Bild (Takte + Bildpaket) und
// Glut-Zeit je Bild (bild() + Abwarten der GPU durch ein 1×1-Auslesen). Gesamtdauer ≤ 10 s.
// Ergebnis: bench/herd/ERGEBNISSE.md, Abschnitt „Browser (SwiftShader)“. Echte GPU (nur vom Nutzer): zusätzlich E2E_GPU=1.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { e2e, setzeCode, strg, warteLaufEnde, VORSCHAU_ZU } from "../hilfen.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, "..", "..");
const SZENEN = path.join(WURZEL, "tests", "herd", "szenen");

const LAEUFE = [
  { name: "B1", datei: "b1-sprites.herd", vorgaben: { N: 10000 }, warm: 2 },
  { name: "B2", datei: "b2-kreise.herd", vorgaben: { N: 10000 }, warm: 2 },
  { name: "B3", datei: "b3-koerper.herd", vorgaben: { N: 1000 }, warm: 2 },
  { name: "B4", datei: "b4-partikel.herd", vorgaben: { RATE: 1000 }, warm: 120 },
];
const BILDER = 12;          // gemessene Bilder je Benchmark
const BUDGET_MS = 2200;     // je Benchmark höchstens so lange zeichnen (Summe ≤ 10 s)

e2e("Herd: Messlauf B1–B4 im Browser (SwiftShader, indikativ)", { timeout: 60_000, skip: !process.env.HERD_MESSUNG }, async ({ page, oeffne }) => {
  await oeffne();
  const skript = fs.readFileSync(path.join(WURZEL, "herd", "skript.js"), "utf8");
  await page.evaluate("(function(){ var module = { exports: {} }; " + skript + "\n; window.__HerdSkript = module.exports; })()");
  const ergebnisse = [];
  for (const l of LAEUFE) {
    const text = fs.readFileSync(path.join(SZENEN, l.datei), "utf8");
    const r = await page.evaluate(async ({ text, vorgaben, warm, BILDER, BUDGET_MS }) => {
      if (typeof wasm_bindgen === "undefined" || !wasm_bindgen.GlutWeb) {
        await new Promise((ok, f) => { const s = document.createElement("script"); s.src = "js/herd/glut.js"; s.onload = ok; s.onerror = f; document.head.appendChild(s); });
        await wasm_bindgen({ module_or_path: "js/herd/glut_bg.wasm" });
      }
      const modul = await WebAssembly.compileStreaming(fetch("js/herd/kern.wasm"));
      const inst = await WebAssembly.instantiate(modul, {});
      const { lies, Spieler } = window.__HerdSkript;
      const canvas = new OffscreenCanvas(1280, 720);
      const g = await wasm_bindgen.GlutWeb.erzeuge(canvas, 1280, 720, 4);
      const sync = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
      const sp = new Spieler(inst, { ...vorgaben, TAKTE: warm + BILDER });
      let kernMs = 0;
      const kern = [], glut = [];
      sp.mess = { takt: (ms) => { kernMs += ms; }, bild: (ms) => { kernMs += ms; } };
      let nr = 0, stat = null, t0 = performance.now();
      const bild = sp.bild.bind(sp);
      sp.bild = (zeile, n) => {
        const w = bild(zeile, n);
        nr++;
        const zuerst = nr === 1;
        if (!zuerst && nr <= warm) { inst.exports.paket_voll(); kernMs = 0; return w; }   // Anlauf: nicht zeichnen, nächstes Paket voll
        if (performance.now() - t0 > BUDGET_MS && glut.length >= 3) { kernMs = 0; return w; }
        const p = inst.exports.bild_zeiger();
        const bytes = new Uint8Array(inst.exports.memory.buffer, p, w.x);
        const a = performance.now();
        g.bild(bytes);
        sync.drawImage(canvas, 0, 0, 1, 1);
        sync.getImageData(0, 0, 1, 1);
        const dauer = performance.now() - a;
        if (!zuerst && nr > warm) { glut.push(dauer); kern.push(kernMs); stat = Array.from(g.statistik()); }
        kernMs = 0;
        return w;
      };
      sp.spiele(lies(text));
      const median = (xs) => { const s = xs.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
      const schnitt = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
      const res = { glutMedian: median(glut), glutSchnitt: schnitt(glut), kernMedian: median(kern), bilder: glut.length, drawCalls: stat && stat[0],
        instanzen: stat && stat[2] + stat[3], schnittstelle: g.schnittstelle(), adapter: g.adapter() };
      g.free();
      return res;
    }, { text, vorgaben: l.vorgaben, warm: l.warm, BILDER, BUDGET_MS });
    ergebnisse.push({ name: l.name, ...r });
  }
  const ua = await page.evaluate(() => navigator.userAgent);
  console.log("  " + ua);
  for (const e of ergebnisse) {
    console.log(`  ${e.name}: ${e.schnittstelle} (${e.adapter}) – Glut je Bild Median ${e.glutMedian.toFixed(1)} ms (Ø ${e.glutSchnitt.toFixed(1)}), ` +
      `Kern (Takte + Bild) Median ${e.kernMedian.toFixed(2)} ms, Draw-Calls ${e.drawCalls}, Instanzen ${e.instanzen}, ${e.bilder} Bilder`);
  }
});

// Anlauf im Playground (HERD.md §6): der Pizza-Konfigurator (viel Text, UI-Bausteine) läuft wie beim Nutzer – Programm-Worker,
// Render-Worker mit OffscreenCanvas, Takte vom Zeichner im rAF. Der Zeichner meldet nach 30 Bildern einmal {typ:"anlauf"}
// (Start → bereit, je Bild Zeitpunkt, Abstand, Bildnummer, Zeit in g.bild); die Seite fängt es am Worker ab.
e2e("Herd: Anlauf Pizza-Konfigurator im Playground (SwiftShader, indikativ)", {
  timeout: 90_000, skip: !process.env.HERD_MESSUNG,
  vorLaden: () => {
    const W = window.Worker;
    window.__herdAnlauf = null;
    window.Worker = function (url, o) {
      const w = new W(url, o);
      w.addEventListener("message", (m) => { if (m.data && m.data.typ === "anlauf") window.__herdAnlauf = m.data; });
      return w;
    };
    window.Worker.prototype = W.prototype;
  },
}, async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, fs.readFileSync(path.join(WURZEL, "site", "beispiele", "herd", "konfigurator", "hauptgang.pizza"), "utf8").replace(/\r\n/g, "\n"));
  const t0 = Date.now();
  await strg(page, "Enter");
  await page.waitForFunction(() => window.__herdAnlauf, { timeout: 60_000, polling: 50 });
  const dauer = Date.now() - t0;
  const a = await page.evaluate(() => window.__herdAnlauf);
  await page.click(VORSCHAU_ZU);
  await warteLaufEnde(page);
  const b = a.bilder;
  const spaeter = b.slice(1);
  const max = Math.max(...spaeter.map((x) => x.abstand));
  const sprung = spaeter.filter((x, i) => x.bild - b[i].bild > 1).length;
  const f = (x) => x.toFixed(1);
  console.log(`  Start → bereit ${f(a.bereitMs)} ms; Bild 1 nach ${f(b[0].t)} ms (g.bild ${f(b[0].ms)} ms, Bildnummer ${b[0].bild}); ` +
    `Bild 2–30: Abstand max ${f(max)} ms, Median ${f(spaeter.map((x) => x.abstand).sort((x, y) => x - y)[14])} ms, ` +
    `${sprung} Bilder mit nachgeholten Takten; Bildnummer bei Bild 30: ${b[29].bild} (Lauf bis Anlauf-Meldung ${dauer} ms)`);
  console.log("  " + b.slice(0, 8).map((x, i) => `B${i + 1}: +${f(x.abstand)} ms (Nr ${x.bild}, g.bild ${f(x.ms)})`).join(" · "));
});
