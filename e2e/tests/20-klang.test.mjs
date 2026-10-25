// Klang im Browser (H-K14, K-153, SPEC §18.8): Ereignisse und PCM-Hashes wie im Interpreter unter Node, PCM einmal je Klang
// zur Seite, Wiedergabe-Stand (automatisierter Browser = stumm, nie hörbar), Hörer = Kamera aus dem Bildpaket bei Herd-Programmen,
// Stummschalter im Fensterkopf, und die Wiedergabe selbst über einen OfflineAudioContext (Panorama, Raum) – ohne Lautsprecher.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { e2e, setzeCode, strg, warteLaufEnde, ereignisseLeeren, VORSCHAU } from "../hilfen.mjs";

const require = createRequire(import.meta.url);
const P = require(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "site", "js", "pizza.js"));

const OHNE_HERD = [
  'Klang k = Klang.ton(440, 0.2);',
  'Klang r = Klang.rauschen(1, art: "rosa").tiefpass(1200).nahtlos(0.1);',
  'Spur s = r.spiele(schleife: ja, lautstaerke: 0.4);',
  's.setzeLage(2, 0, -3);',
  'k.spiele(panorama: -1);',
  'k.spiele(tonhoehe: 2);',
  'Klang.noten("C4 E4 G4").spiele();',
  's.stoppe();',
  'Bote.sage((k + " " + s + " " + k.dauer()));',
].join("\n");

const MIT_HERD = [
  'Herd herd = neu Herd("E2E-Klang", breite: 320, hoehe: 180);',
  'herd.koerper(Form.wuerfel(), 0, 0, -4, farbe: "tomate");',
  'Klang summen = Klang.ton(120, 0.5, welle: "saege", lautstaerke: 0.2).tiefpass(600).nahtlos(0.05);',
  'Spur s = summen.spiele(schleife: ja);',
  's.setzeLage(3, 0, -4).setzeReichweite(20);',
  'herd.backe(() -> {',
  '    herd.kamera().setzeLage(0, 1, 2 - herd.zeit()).schaueAuf(0, 1, -10);',
  '    falls (herd.bildnummer() == 30) { Klang.ton(880, 0.1).spiele(); }',
  '});',
].join("\n");

const ohneTyp = (liste) => liste.filter((e) => e.typ === "klang").map((e) => { const o = { ...e }; delete o.typ; return JSON.stringify(o); });

e2e("Klang: Ereignisse und PCM-Hashes wie im Interpreter, PCM einmal je Klang, Wiedergabe stumm im automatisierten Browser", { timeout: 60_000 }, async ({ page, oeffne }) => {
  await oeffne();
  for (const motor of ["interpreter", "wasm"]) {
    await ereignisseLeeren(page);
    await page.select('[data-testid="motor-umschalter"], #motor-wahl', motor);
    await setzeCode(page, OHNE_HERD);
    await strg(page, "Enter");
    await warteLaufEnde(page);
    const ist = await page.evaluate(() => (window.__ereignisse || []));
    const soll = P.run(OHNE_HERD).ereignisse;
    assert.deepEqual(ohneTyp(ist), ohneTyp(soll), motor + ": klang-Ereignisse == Interpreter (Node)");
    const pcm = await page.evaluate(() => (window.__ereignisse || []).filter((e) => e.typ === "klang-pcm")
      .map((e) => ({ klang: e.klang, laenge: e.bytes instanceof Uint8Array ? e.bytes.byteLength : -1 })));
    assert.equal(pcm.length, 3, motor + ": PCM je Klang einmal (Rauschen, Ton, Noten): " + JSON.stringify(pcm));
    assert.ok(pcm.every((e) => e.laenge > 0 && e.laenge % 2 === 0), "PCM als Bytes (i16): " + JSON.stringify(pcm));
    assert.equal(pcm.find((e) => e.klang === soll.find((x) => x.typ === "klang" && x.art === "spiele" && x.tonhoehe === 2).klang).laenge, 0.2 * 48000 * 2, "Ton 0.2 s");
    assert.ok(!ist.some((e) => e.typ === "klang" && e.bytes !== undefined), "keine PCM in den Ereignissen");
    const stand = await page.evaluate(() => window.__klangStand());
    assert.equal(stand.klaenge, 3, motor + ": " + JSON.stringify(stand));
    assert.equal(stand.automatisiert, true, "navigator.webdriver → immer stumm");
    assert.ok(!stand.spuren.some((s) => s.schleife), "Schleife gestoppt bzw. am Ende beendet");
    // Ausgabe in der Konsole, keine klang-Ereignisse dort
    const text = await page.$eval("#konsole-inhalt", (k) => k.textContent);
    assert.ok(text.includes("Klang(1) Spur(1) 0.2"), text);
  }
});

e2e("Klang + Herd: Hörer = Kamera je Bild, räumliche Spur, Stummschalter im Fensterkopf", { timeout: 90_000 }, async ({ page, oeffne }) => {
  await oeffne();
  await ereignisseLeeren(page);
  await setzeCode(page, MIT_HERD);
  await strg(page, "Enter");
  await page.waitForFunction(() => (window.__ereignisse || []).filter((e) => e.typ === "klang-hoerer").length > 40, { timeout: 30_000, polling: 50 });
  const ton = await page.$('#vorschau [data-testid="vorschau-ton"]');
  assert.ok(ton, "Stummschalter da");
  assert.equal(await page.$eval('[data-testid="vorschau-ton"]', (k) => k.hidden), false, "sichtbar, sobald Klang spielt");
  // Klick ins Spiel = Nutzeraktion: AudioContext entsteht (stumm, da automatisiert)
  await page.click('#vorschau [data-testid="herd-canvas"]');
  const h = await page.evaluate(() => (window.__ereignisse || []).filter((e) => e.typ === "klang-hoerer").map((e) => e.h));
  assert.ok(h.length > 40);
  const erster = h[0], letzter = h[h.length - 1];
  assert.ok(Math.abs(erster.y - 1) < 1e-3 && Math.abs(erster.x) < 1e-3, "Hörer an der Kamera: " + JSON.stringify(erster));
  assert.ok(letzter.z < erster.z - 0.3, "Kamera fährt nach −z, der Hörer mit: " + erster.z + " → " + letzter.z);
  assert.ok(Math.abs(erster.rx - 1) < 1e-3 && Math.abs(erster.rz) < 1e-3, "Rechts-Achse bei Blick nach −z = +x: " + JSON.stringify(erster));
  await page.waitForFunction(() => { const s = window.__klangStand(); return s.kontext !== null; }, { timeout: 10_000 });
  const stand = await page.evaluate(() => window.__klangStand());
  assert.deepEqual(stand.spuren.find((s) => s.spur === 1).lage, [3, 0, -4], JSON.stringify(stand));
  // Stummschalter: gemerkt in localStorage
  const vorher = await page.evaluate(() => window.__klangStand().stumm);
  await page.click('[data-testid="vorschau-ton"]');
  assert.equal(await page.evaluate(() => window.__klangStand().stumm), !vorher);
  assert.equal(await page.evaluate(() => localStorage.getItem("pizza.stumm")), !vorher ? "1" : "0");
  await page.click('[data-testid="vorschau-ton"]');
  await page.click('[data-testid="vorschau-schliessen"]');
  await warteLaufEnde(page, 20_000);
  assert.equal(await page.$eval(VORSCHAU, (v) => v.hidden), true);
});

e2e("Klang: Wiedergabe über OfflineAudioContext – Panorama links, Raum rechts vom Hörer, Stille hinter der Reichweite", { timeout: 60_000 }, async ({ page, oeffne }) => {
  await oeffne();
  await ereignisseLeeren(page);
  await setzeCode(page, 'Klang.ton(440, 0.5, lautstaerke: 0.8).spiele();');
  await strg(page, "Enter");
  await warteLaufEnde(page);
  const r = await page.evaluate(async () => {
    const pcm = (window.__ereignisse || []).find((e) => e.typ === "klang-pcm").bytes;
    const sp = (extra) => [{ art: "spiele", spur: 1, lautstaerke: 1, tonhoehe: 1, panorama: 0, schleife: false, ...extra }];
    const setze = (lage, reichweite) => ({ art: "setze", spur: 1, lautstaerke: 1, tonhoehe: 1, panorama: 0, lage, reichweite });
    return {
      links: await window.__klangOffline(pcm, sp({ panorama: -1 })),
      mitte: await window.__klangOffline(pcm, sp({})),
      raumRechts: await window.__klangOffline(pcm, [...sp({}), setze([3, 0, 0], 30)]),
      zuWeit: await window.__klangOffline(pcm, [...sp({}), setze([0, 0, -50], 30)]),
      // H-K22 Schall: „raum“ setzt Pegel und Panorama direkt (vom Kern am Hörer gerechnet)
      schallRechts: await window.__klangOffline(pcm, [...sp({}), { art: "raum", spur: 1, lautstaerke: 0.5, tonhoehe: 1, panorama: 1 }]),
    };
  });
  assert.ok(r.schallRechts.rechts > 0.05 && r.schallRechts.links < 0.01, "raum: nur rechts: " + JSON.stringify(r.schallRechts));
  assert.ok(r.schallRechts.rechts < r.links.links, "raum: halber Pegel leiser");
  assert.ok(r.links.links > 0.1 && r.links.rechts < 0.01, "Panorama −1 = nur links: " + JSON.stringify(r.links));
  assert.ok(Math.abs(r.mitte.links - r.mitte.rechts) < 0.01 && r.mitte.links > 0.1, "Mitte gleich laut: " + JSON.stringify(r.mitte));
  assert.ok(r.raumRechts.rechts > r.raumRechts.links * 3, "Quelle rechts vom Hörer: " + JSON.stringify(r.raumRechts));
  assert.ok(r.raumRechts.rechts < r.mitte.rechts, "3 m entfernt leiser");
  assert.ok(r.zuWeit.links < 1e-3 && r.zuWeit.rechts < 1e-3, "jenseits der Reichweite still: " + JSON.stringify(r.zuWeit));
});
