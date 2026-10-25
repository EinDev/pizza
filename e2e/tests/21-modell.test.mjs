// 3D-Modelle im Playground (H-K16, HERD.md §13.3, K-161): .glb/.gltf per Drag & Drop in den Dateibaum (Signatur geprüft, sofort
// vorgebacken), Vorschau mit den Kennzahlen aus dem Modellteig, ein .gltf darf vor seinen Nachbardateien kommen (Hinweis statt
// Ablehnung), Draco wird abgelehnt; danach lädt das Programm die Modelle in beiden Motoren (Auto = Wasm, Interpreter).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { e2e, setzeCode, backen, konsolenAusgabe, warteAufTab, baumDateien, ereignisseLeeren, PJ } from "../hilfen.mjs";

const TM = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "herd", "teigling", "testmodelle");
const datei = (n) => [...fs.readFileSync(path.join(TM, n))];

function lasseFallen(page, selektor, dateien) {
  return page.evaluate((sel, ds) => {
    const dt = new DataTransfer();
    for (const d of ds) dt.items.add(new File([new Uint8Array(d.bytes)], d.name, { type: d.typ || "" }));
    const ziel = document.querySelector(sel);
    for (const art of ["dragenter", "dragover", "drop"]) ziel.dispatchEvent(new DragEvent(art, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, selektor, dateien);
}

e2e("Modelle: .glb/.gltf in den Dateibaum, Vorschau mit Ecken/Bildern, Draco abgelehnt, Modell.laden im Lauf", async ({ page, oeffne }) => {
  await oeffne();
  await page.click('[data-testid="dateibaum-umschalten"]');
  await page.waitForSelector(`${PJ.baum}:not([hidden])`);
  // .glb: Vorschau mit Kennzahlen aus dem Modellteig
  await lasseFallen(page, '[data-testid="dateibaum-liste"]', [{ name: "wuerfel.glb", bytes: datei("wuerfel.glb"), typ: "model/gltf-binary" }]);
  await page.waitForSelector('[data-testid="baum-datei"][data-pfad="wuerfel.glb"]');
  await warteAufTab(page, "wuerfel.glb");
  await page.waitForSelector('[data-testid="bildvorschau"]:not([hidden])');
  await page.waitForSelector('[data-testid="bildvorschau"][data-vorgebacken="ja"]');
  assert.match(await page.$eval('[data-testid="bildvorschau-info"]', (e) => e.textContent),
    /^glTF-Modell \(GLB\) · Quelle [\d,]+ (B|KB) · 24 Ecken · 12 Dreiecke · 1 Knoten · 0 Bilder · vorgebacken [\d,]+ (B|KB)$/);
  // .gltf zuerst allein: fehlende Nachbardatei → Hinweis, die Datei kommt trotzdem ins Projekt
  await lasseFallen(page, '[data-testid="dateibaum-liste"]', [{ name: "textur.gltf", bytes: datei("textur.gltf") }]);
  await page.waitForSelector('[data-testid="baum-datei"][data-pfad="textur.gltf"]');
  await page.waitForFunction(() => /textur\.gltf braucht die Datei textur\.bin/.test(document.getElementById("toast").textContent));
  // dann Puffer und Bilder (Ordner bilder/ wie im Modell erwartet)
  await lasseFallen(page, '[data-testid="dateibaum-liste"]', [{ name: "textur.bin", bytes: datei("textur.bin") }]);
  await page.click('[data-testid="baum-neuer-ordner"]');
  await page.focus('[data-testid="baum-eingabe"]');
  await page.keyboard.type("bilder");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-testid="baum-ordner"][data-pfad="bilder"]');
  await lasseFallen(page, '[data-testid="baum-ordner"][data-pfad="bilder"]',
    ["farbe", "normale", "mr", "oc", "leucht"].map((n) => ({ name: n + ".png", bytes: datei("bilder/" + n + ".png"), typ: "image/png" })));
  await page.waitForSelector('[data-testid="baum-datei"][data-pfad="bilder/leucht.png"]');
  // Draco: der Vorbacker lehnt ab (gleiche Meldung wie zur Laufzeit), die Datei kommt nicht ins Projekt
  await lasseFallen(page, '[data-testid="dateibaum-liste"]', [{ name: "draco.glb", bytes: datei("fehler-draco.glb") }]);
  await page.waitForFunction(() => /draco\.glb braucht die Erweiterung KHR_draco_mesh_compression/.test(document.getElementById("toast").textContent));
  assert.ok(!(await baumDateien(page)).includes("draco.glb"));
  // Vorschau des .gltf jetzt mit allen Nachbardateien: 4 Bilder (Grundfarbe, Relief, Stoff, Leuchten)
  await page.click('[data-testid="baum-datei"][data-pfad="textur.gltf"]');
  await page.waitForSelector('[data-testid="bildvorschau"][data-pfad="textur.gltf"][data-vorgebacken="ja"]');
  assert.match(await page.$eval('[data-testid="bildvorschau-info"]', (e) => e.textContent), /^glTF-Modell \(GLTF\) · .* · 4 Bilder · vorgebacken/);
  // Lauf: das Programm lädt beide Modelle (Auto = Wasm, dann der Interpreter)
  await page.click('[data-testid="baum-datei"][data-pfad="willkommen.pizza"]');
  await warteAufTab(page, "willkommen.pizza");
  await setzeCode(page, [
    'Herd herd = neu Herd("Modelle");',
    'Modell w = Modell.laden("wuerfel.glb");',
    'Modell k = Modell.laden("textur.gltf");',
    'Teil t = herd.modell(k, 1, 0, 0);',
    'Bote.sage((w + " " + w.namen() + " " + k.namen() + " " + t.finde("Kiste").koerper().belag().etikett().name()));',
  ].join("\n"));
  for (const motor of ["auto", "interpreter"]) {
    await page.select('[data-testid="motor-umschalter"], #motor-wahl', motor);
    await ereignisseLeeren(page);
    await backen(page);
    // der Lauf meldet sein Ende als Ereignis (die Ende-Plakette des vorigen Laufs steht noch, bis der neue beginnt)
    await page.waitForFunction(() => (window.__ereignisse || []).some((e) => e.typ === "ende"), { timeout: 20_000 });
    assert.equal(await konsolenAusgabe(page), "Modell(wuerfel.glb) [Wuerfel] [Kiste] Karo\n", "Motor " + motor);
  }
});
