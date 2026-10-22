// Herd im Playground und als App-Link (Paket H6, HERD.md §7.2): ein kleines Herd-Programm startet, das Vorschaufenster
// erscheint mit Canvas (Render-Worker, WebGL2/SwiftShader – headless, nie die echte GPU), ein Tastendruck bewegt etwas,
// Schließen beendet den Lauf. App-Link: Spielfeld bildschirmfüllend, X schließt.
import assert from "node:assert/strict";
import { e2e, setzeCode, strg, warteLaufEnde, konsolenAusgabe, VORSCHAU, VORSCHAU_ZU, schlafe, screenshot } from "../hilfen.mjs";

const PROG = [
  'Herd herd = neu Herd("E2E-Herd", breite: 320, hoehe: 180);',
  'herd.hintergrund("ofen");',
  'Teil ball = herd.kreis(160, 90, 10, farbe: "tomate");',
  "herd.backe(() -> {",
  '    falls (herd.taste("Rechts")) { ball.verschiebe(4, 0); }',
  '    falls (herd.gedrueckt("Rechts")) { Bote.sage(("druck")); }',
  '    falls (herd.losgelassen("Rechts")) { Bote.sage(("los x=" + ball.x())); }',
  '    falls (herd.klick()) { Bote.sage(("klick " + herd.mausX() + "," + herd.mausY())); }',
  "});",
  'Bote.sage(("Ende"));',
].join("\n");

const CANVAS = '#vorschau [data-testid="herd-canvas"]';

async function warteBereit(page, timeout = 30_000) {
  await page.waitForSelector(CANVAS + '[data-bereit="1"]', { timeout });
}

async function warteAusgabe(page, re, timeout = 10_000) {
  await page.waitForFunction((q) => new RegExp(q).test(document.getElementById("konsole-inhalt").textContent), { timeout, polling: 50 }, re.source);
}

e2e("Herd: Programm öffnet das Vorschaufenster, Taste bewegt, Klick in Spielfeld-Koordinaten, Schließen beendet den Lauf", { timeout: 90_000 }, async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, PROG);
  await strg(page, "Enter");
  await warteBereit(page);
  const info = await page.evaluate((sel) => {
    const v = document.querySelector("#vorschau");
    const c = document.querySelector(sel);
    const r = v.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const st = document.querySelector('#vorschau [data-testid="herd-status"]');
    return {
      titel: document.getElementById("vorschau-titel").textContent, w: r.width, h: r.height, cw: cr.width, ch: cr.height,
      schnittstelle: c.dataset.schnittstelle, status: st && st.dataset.schnittstelle, fokus: document.activeElement === c,
      gehoertWorker: !c.getContext,   // nach transferControlToOffscreen gibt es keinen Kontext mehr im Hauptthread
      ereignisse: (window.__ereignisse || []).filter((e) => e.typ === "herd").map((e) => e.art),
    };
  }, CANVAS);
  assert.equal(info.titel, "E2E-Herd");
  assert.equal(info.schnittstelle, "WebGL2", "headless ohne GPU: WebGL2 (SwiftShader)");
  assert.equal(info.status, "WebGL2");
  // K-123: Fenstergröße = Programmgröße (+ Rahmen/Titelleiste)
  assert.ok(Math.abs(info.cw - 320) <= 2 && Math.abs(info.ch - 180) <= 2, "Canvas 320 × 180: " + JSON.stringify(info));
  assert.ok(info.fokus, "Canvas hat den Fokus");
  assert.deepEqual(info.ereignisse, ["fenster"], "an die Seite gehen nur fenster/schliesse, keine Bilder");
  // Bilder laufen (Statistik meldet die Bildnummer)
  await page.waitForFunction((sel) => Number(document.querySelector(sel).dataset.bild || 0) > 10, { timeout: 15_000 }, CANVAS);
  if (process.env.HERD_BILDER) await screenshot(page, "herd-playground");

  // Taste: gehalten bewegt, gedrueckt/losgelassen einmal
  await page.focus(CANVAS);
  await page.keyboard.down("ArrowRight");
  await warteAusgabe(page, /druck/);
  await schlafe(300);
  await page.keyboard.up("ArrowRight");
  await warteAusgabe(page, /los x=\d+/);
  const x = await page.evaluate(() => Number(/los x=(\d+(?:\.\d+)?)/.exec(document.getElementById("konsole-inhalt").textContent)[1]));
  assert.ok(x > 160, "Ball nach rechts bewegt: x = " + x);

  // Klick in Spielfeld-Koordinaten (Mitte des Canvas = Mitte des Spielfelds)
  const m = await page.$eval(CANVAS, (c) => { const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(m.x, m.y);
  await warteAusgabe(page, /klick \d+/);
  const k = await page.evaluate(() => /klick (-?[\d.]+),(-?[\d.]+)/.exec(document.getElementById("konsole-inhalt").textContent).slice(1).map(Number));
  assert.ok(Math.abs(k[0] - 160) <= 2 && Math.abs(k[1] - 90) <= 2, "Klick bei (160, 90): " + k);

  // Schließen = geschlossen → backe kehrt zurück, Programm läuft zu Ende
  await page.click(VORSCHAU_ZU);
  await warteLaufEnde(page);
  assert.match(await konsolenAusgabe(page), /Ende\n$/);
  assert.equal(await page.$eval(VORSCHAU, (v) => v.hidden), true, "Fenster zu");
  // welcher Motor lief (Auto: Wasm, sobald Paket H4 Herd-Programme übersetzt – sonst Interpreter-Rückfall)
  const motor = await page.evaluate(() => (window.__ereignisse || []).filter((e) => e.typ === "motor").map((e) => e.motor).pop());
  console.log("  Motor (Auto): " + motor);
});

e2e("Herd: App-Link füllt den Bildschirm mit dem Spielfeld, X beendet", { timeout: 90_000 }, async ({ page, basis, server }) => {
  server.teilen.ablage.set("herdapp", PROG);
  await page.goto(basis + "#app=herdapp", { waitUntil: "load" });
  await warteBereit(page);
  const box = await page.$eval(CANVAS, (c) => { const r = c.getBoundingClientRect(); return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; });
  assert.ok(Math.abs(box.w - box.vw) <= 1 && Math.abs(box.h - box.vh) <= 1, "Canvas bildschirmfüllend: " + JSON.stringify(box));
  assert.equal(await page.evaluate(() => document.title), "E2E-Herd");
  await page.waitForFunction((sel) => Number(document.querySelector(sel).dataset.bild || 0) > 5, { timeout: 15_000 }, CANVAS);
  if (process.env.HERD_BILDER) await screenshot(page, "herd-app");
  await page.click("#vorschau-schliessen");
  await page.waitForFunction(() => { const e = document.getElementById("app-ende"); return e && !e.hidden; }, { timeout: 15_000 });
  assert.match(await page.$eval("#app-ende-text", (e) => e.textContent), /Programm beendet\./);
});

e2e("Herd: Editor vervollständigt Komponenten, Felder und Farben aus schema.json – auch eine neue Komponente", { timeout: 60_000 }, async ({ page, oeffne }) => {
  // Eine Komponente „Pendel“, die es nur im (untergeschobenen) Schema gibt: sie muss ohne UI-Änderung erscheinen
  const fs = await import("node:fs");
  const schema = JSON.parse(fs.readFileSync(new URL("../../site/js/herd/schema.json", import.meta.url), "utf8"));
  schema.komponenten.push({ name: "Pendel", nummer: 99, genus: "n", raum: "beide", braucht: [], system: true,
    felder: [{ nummer: 1, name: "weite", typ: "zahl", standard: 30, min: 0, max: null }] });
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (/\/js\/herd\/schema\.json$/.test(r.url())) r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(schema) });
    else r.continue();
  });
  await oeffne();
  await page.waitForFunction(() => performance.getEntriesByType("resource").some((e) => /herd\/schema\.json/.test(e.name)));
  const vorschlaege = async (code) => {
    await setzeCode(page, code);
    await page.keyboard.down("Control"); await page.keyboard.press("End"); await page.keyboard.up("Control");
    await page.keyboard.down("Control"); await page.keyboard.press("Space"); await page.keyboard.up("Control");
    await page.waitForSelector(".cm-tooltip-autocomplete li", { timeout: 5000 });
    const l = await page.$$eval(".cm-tooltip-autocomplete li", (li) => li.map((e) => (e.querySelector(".cm-completionLabel") || e).textContent));
    await page.keyboard.press("Escape");
    return l;
  };
  assert.ok((await vorschlaege("Pen")).includes("Pendel"), "neue Komponente als Typ");
  assert.ok((await vorschlaege("Pendel p = neu Pendel();\np.setzeWe")).includes("setzeWeite"), "Setter aus dem Schema");
  assert.ok((await vorschlaege("Bewegung b = neu Bewegung();\nb.setzeTem")).includes("setzeTempoX"));
  assert.ok((await vorschlaege('Herd herd = neu Herd("x");\nherd.kreis(1, 2, 3, farbe: "tom')).includes("tomate"), "Palette");
  assert.ok((await vorschlaege("Form.ku")).includes("kugel"), "Grundformen");
  // Hervorhebung: Pendel ist ein Typ (wie Bewegung)
  await setzeCode(page, "Pendel p = neu Pendel();");
  const typ = await page.$$eval("#editor .cm-line span", (s) => s.filter((e) => e.textContent === "Pendel").map((e) => e.className));
  const bew = await (async () => { await setzeCode(page, "Bewegung b = neu Bewegung();"); return page.$$eval("#editor .cm-line span", (s) => s.filter((e) => e.textContent === "Bewegung").map((e) => e.className)); })();
  assert.ok(typ.length && typ[0] === bew[0], "Pendel wie Bewegung hervorgehoben: " + typ + " / " + bew);
});

e2e("Herd: ohne OffscreenCanvas zeichnet dieselbe Glut im Hauptthread (Rückfall)", {
  timeout: 90_000,
  vorLaden: () => { delete HTMLCanvasElement.prototype.transferControlToOffscreen; },
}, async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, PROG);
  await strg(page, "Enter");
  await warteBereit(page);
  assert.equal(await page.$eval(CANVAS, (c) => c.dataset.schnittstelle), "WebGL2");
  assert.equal(await page.evaluate(() => typeof window.HerdZeichner), "object", "Zeichner im Hauptthread geladen");
  await page.waitForFunction((sel) => Number(document.querySelector(sel).dataset.bild || 0) > 10, { timeout: 15_000 }, CANVAS);
  await page.focus(CANVAS);
  await page.keyboard.down("ArrowRight");
  await warteAusgabe(page, /druck/);
  await page.keyboard.up("ArrowRight");
  await warteAusgabe(page, /los x=\d+/);
  await page.click(VORSCHAU_ZU);
  await warteLaufEnde(page);
  assert.match(await konsolenAusgabe(page), /Ende\n$/);
});

e2e("Herd: ohne WebGPU und WebGL2 – Meldung, das Programm bekommt „geschlossen“", {
  timeout: 90_000,
  vorLaden: () => {
    delete HTMLCanvasElement.prototype.transferControlToOffscreen;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (art, ...rest) { return /webgl|webgpu/.test(art) ? null : orig.call(this, art, ...rest); };
    try { Object.defineProperty(Navigator.prototype, "gpu", { configurable: true, get: () => undefined }); } catch (e) { /* egal */ }
  },
}, async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, PROG);
  await strg(page, "Enter");
  await warteLaufEnde(page, 30_000);
  const hinweis = await page.evaluate(() => document.getElementById("konsole-inhalt").textContent);
  assert.match(hinweis, /Dieser Browser kann weder WebGPU noch WebGL2 – der Herd braucht eines davon\./);
  assert.match(await konsolenAusgabe(page), /Ende\n$/, "backe kehrt mit „geschlossen“ zurück, das Programm läuft zu Ende");
});

e2e("Herd: dieselbe Anbindung mit dem Interpreter (Motor „Interpreter“)", { timeout: 90_000 }, async ({ page, oeffne }) => {
  await oeffne();
  await page.select('[data-testid="motor-umschalter"], #motor-wahl', "interpreter");
  await setzeCode(page, PROG);
  await strg(page, "Enter");
  await warteBereit(page);
  await page.waitForFunction((sel) => Number(document.querySelector(sel).dataset.bild || 0) > 5, { timeout: 15_000 }, CANVAS);
  await page.focus(CANVAS);
  await page.keyboard.down("ArrowRight");
  await warteAusgabe(page, /druck/);
  await page.keyboard.up("ArrowRight");
  await warteAusgabe(page, /los x=\d+/);
  await page.click(VORSCHAU_ZU);
  await warteLaufEnde(page);
  const motor = await page.evaluate(() => (window.__ereignisse || []).filter((e) => e.typ === "motor").map((e) => e.motor).pop());
  assert.equal(motor, "interpreter");
  assert.match(await konsolenAusgabe(page), /Ende\n$/);
});
