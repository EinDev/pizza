// Herd im Browser (Paket H6): Glut-Web (site/js/herd/glut.js + glut_bg.wasm) lädt und zeichnet dieselben Bildpakete wie
// die native Glut. Pixeltest (K-129/K-134): die Referenzszenen tests/herd/bilder/*.herd laufen in Node gegen kern.wasm
// (herd/skript.js, wie herd-bild: nicht gewählte Bilder → paket_voll), das Paket des Zielbilds wird im Browser von der
// Glut gezeichnet (headless, SwiftShader/WebGL2 – nie die echte GPU) und mit dem nativen Referenz-PNG verglichen:
// mittlere Abweichung ≤ 1,5 %, ≥ 98 % der Pixel innerhalb 10/255.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { e2e, ARTEFAKTE } from "../hilfen.mjs";

const require = createRequire(import.meta.url);
const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, "..", "..");
const BILDER = path.join(WURZEL, "tests", "herd", "bilder");
const { lies, Spieler } = require(path.join(WURZEL, "herd", "skript.js"));

/** Kopfzeile "#! bild 40 groesse 1280x720" */
function kopf(text) {
  const m = /^#!\s*bild\s+(\d+)(?:\s+groesse\s+(\d+)x(\d+))?/m.exec(text);
  return { bild: m ? Number(m[1]) : null, breite: m && m[2] ? Number(m[2]) : 1280, hoehe: m && m[3] ? Number(m[3]) : 720 };
}

/** Spielt ein Szenen-Skript gegen kern.wasm und liefert das Bildpaket des Zielbilds (mit allen Ressourcen). */
export function paketFuer(datei) {
  const text = fs.readFileSync(datei, "utf8");
  const k = kopf(text);
  const modul = new WebAssembly.Module(fs.readFileSync(path.join(WURZEL, "site", "js", "herd", "kern.wasm")));
  const inst = new WebAssembly.Instance(modul, {});
  const sp = new Spieler(inst);
  sp.nurBilder = true;
  let paket = null, letztes = null;
  const bild = sp.bild.bind(sp);
  sp.bild = (zeile, nr) => {
    const w = bild(zeile, nr);
    const p = inst.exports.bild_zeiger();
    const kopie = new Uint8Array(inst.exports.memory.buffer, p, w.x).slice();
    if (k.bild === null) letztes = kopie;
    else if (sp.nr === k.bild) paket = kopie;
    else inst.exports.paket_voll();   // wie herd-bild: das nächste gezeichnete Paket enthält alle Ressourcen
    return w;
  };
  sp.spiele(lies(text));
  return { ...k, paket: paket || letztes };
}

/** Im Browser: Glut laden, Paket zeichnen, mit dem Referenz-PNG vergleichen. Läuft in der Seite (main thread). */
async function zeichneUndVergleiche(page, { paket, breite, hoehe, png }) {
  return page.evaluate(async ({ paketB64, breite, hoehe, pngB64 }) => {
    const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (typeof wasm_bindgen === "undefined" || !wasm_bindgen.GlutWeb) {
      await new Promise((ok, fehler) => {
        const s = document.createElement("script");
        s.src = "js/herd/glut.js";
        s.onload = ok; s.onerror = () => fehler(new Error("glut.js lädt nicht"));
        document.head.appendChild(s);
      });
      await wasm_bindgen({ module_or_path: "js/herd/glut_bg.wasm" });
    }
    const canvas = new OffscreenCanvas(breite, hoehe);
    const g = await wasm_bindgen.GlutWeb.erzeuge(canvas, breite, hoehe, 4);
    g.bild(bytes(paketB64));
    // im selben Task auslesen (vor dem Zusammensetzen des Bildes)
    const lesen = new OffscreenCanvas(breite, hoehe).getContext("2d", { willReadFrequently: true });
    lesen.drawImage(canvas, 0, 0);
    const ist = lesen.getImageData(0, 0, breite, hoehe).data;
    const stat = Array.from(g.statistik());
    const schnittstelle = g.schnittstelle();
    const msaa = g.msaa();
    g.free();
    const ref = await createImageBitmap(new Blob([bytes(pngB64)], { type: "image/png" }), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    const c2 = new OffscreenCanvas(ref.width, ref.height).getContext("2d", { willReadFrequently: true });
    c2.drawImage(ref, 0, 0);
    const soll = c2.getImageData(0, 0, ref.width, ref.height).data;
    if (ref.width !== breite || ref.height !== hoehe) return { fehler: "Größe " + ref.width + "x" + ref.height };
    let summe = 0, gut = 0;
    const n = breite * hoehe;
    for (let i = 0; i < n; i++) {
      let max = 0;
      for (let kk = 0; kk < 3; kk++) { const d = Math.abs(ist[i * 4 + kk] - soll[i * 4 + kk]); summe += d; if (d > max) max = d; }
      if (max <= 10) gut++;
    }
    // Ist-Bild als PNG (für Artefakte bei Abweichung)
    const blob = await lesen.canvas.convertToBlob({ type: "image/png" });
    const istPng = btoa(Array.from(new Uint8Array(await blob.arrayBuffer()), (b) => String.fromCharCode(b)).join(""));
    return { mittel: summe / (n * 3 * 255) * 100, innerhalb: gut / n * 100, stat, schnittstelle, msaa, istPng };
  }, { paketB64: Buffer.from(paket).toString("base64"), breite, hoehe, pngB64: png.toString("base64") });
}

const SZENEN = fs.readdirSync(BILDER).filter((f) => f.endsWith(".herd")).sort();

e2e("Herd: Glut-Web zeichnet die Referenzszenen visuell gleich (WebGL2/SwiftShader, K-129)", { timeout: 180_000 }, async ({ page, oeffne }) => {
  await oeffne();
  assert.ok(SZENEN.length >= 3, "Referenzszenen fehlen");
  const zeilen = [], abweichend = [];
  for (const f of SZENEN) {
    const { paket, breite, hoehe } = paketFuer(path.join(BILDER, f));
    assert.ok(paket && paket.length > 32, f + ": kein Bildpaket");
    const png = fs.readFileSync(path.join(BILDER, f.replace(/\.herd$/, ".png")));
    const r = await zeichneUndVergleiche(page, { paket, breite, hoehe, png });
    assert.ok(!r.fehler, f + ": " + r.fehler);
    zeilen.push(`${f}: ${r.schnittstelle}, MSAA ${r.msaa}, mittlere Abweichung ${r.mittel.toFixed(3)} %, ${r.innerhalb.toFixed(2)} % innerhalb 10/255, Draw-Calls ${r.stat[0]}`);
    if (process.env.HERD_BILDER || !(r.mittel <= 1.5 && r.innerhalb >= 98)) {
      fs.mkdirSync(ARTEFAKTE, { recursive: true });
      fs.writeFileSync(path.join(ARTEFAKTE, "herd-ist-" + f.replace(/\.herd$/, ".png")), Buffer.from(r.istPng, "base64"));
    }
    if (!(r.mittel <= 1.5 && r.innerhalb >= 98)) abweichend.push(`${f} (${r.mittel.toFixed(3)} %, ${r.innerhalb.toFixed(2)} %)`);
  }
  console.log("  " + zeilen.join("\n  "));
  assert.deepEqual(abweichend, [], "nicht visuell gleich – Ist-Bilder in e2e/artefakte/herd-ist-*.png");
});
