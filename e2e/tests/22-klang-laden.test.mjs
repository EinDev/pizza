// Klänge aus Dateien im Playground (H-K19a, HERD.md §13.3, K-163): .wav/.flac per Drag & Drop in den Dateibaum (Signatur geprüft,
// sofort vorgebacken), Vorschau mit Dauer/Rate/Kanälen aus dem Klangteig und Abspielknopf (in automatisierten Browsern nur
// stumm offline gerendert – nie hörbar), kaputte Dateien abgelehnt; danach lädt das Programm die Klänge in beiden Motoren und die
// Seite bekommt die PCM mit Rate und Kanälen (OfflineAudioContext, stumm).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { e2e, setzeCode, backen, konsolenAusgabe, warteAufTab, baumDateien, ereignisseLeeren, PJ } from "../hilfen.mjs";

const TK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "herd", "teigling", "testklaenge");
const datei = (n) => [...fs.readFileSync(path.join(TK, n))];

function lasseFallen(page, selektor, dateien) {
  return page.evaluate((sel, ds) => {
    const dt = new DataTransfer();
    for (const d of ds) dt.items.add(new File([new Uint8Array(d.bytes)], d.name, { type: d.typ || "" }));
    const ziel = document.querySelector(sel);
    for (const art of ["dragenter", "dragover", "drop"]) ziel.dispatchEvent(new DragEvent(art, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, selektor, dateien);
}

e2e("Klänge: .wav/.flac in den Dateibaum, Vorschau mit Rate/Kanälen und Abspielknopf, kaputte abgelehnt, Klang.laden im Lauf", async ({ page, oeffne }) => {
  await oeffne();
  await page.click('[data-testid="dateibaum-umschalten"]');
  await page.waitForSelector(`${PJ.baum}:not([hidden])`);
  await lasseFallen(page, '[data-testid="dateibaum-liste"]', [{ name: "akkord.flac", bytes: datei("akkord-stereo.flac"), typ: "audio/flac" }]);
  await page.waitForSelector('[data-testid="baum-datei"][data-pfad="akkord.flac"]');
  await warteAufTab(page, "akkord.flac");
  await page.waitForSelector('[data-testid="bildvorschau"][data-pfad="akkord.flac"][data-vorgebacken="ja"]');
  assert.match(await page.$eval('[data-testid="bildvorschau-info"]', (e) => e.textContent),
    /^Klang \(FLAC\) · Quelle [\d,]+ (B|KB) · 0,25 s · 44 100 Hz · stereo · vorgebacken [\d,]+ (B|KB)$/);
  // Abspielknopf: im automatisierten Browser stumm offline gerendert (Pegel > 0), nie über ein Gerät
  await page.click('[data-testid="klangvorschau-spielen"]');
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="bildvorschau"]').dataset.gespielt || 0) > 0.01);
  // WAV dazu; ein kaputtes WAV lehnt der Vorbacker ab (Meldung wie zur Laufzeit), eine falsche Signatur schon die Kopfprüfung
  await lasseFallen(page, '[data-testid="dateibaum-liste"]', [{ name: "ton.wav", bytes: datei("ton-mono.wav"), typ: "audio/wav" }]);
  await page.waitForSelector('[data-testid="baum-datei"][data-pfad="ton.wav"]');
  await page.waitForSelector('[data-testid="bildvorschau"][data-pfad="ton.wav"][data-vorgebacken="ja"]');
  assert.match(await page.$eval('[data-testid="bildvorschau-info"]', (e) => e.textContent), /^Klang \(WAV\) · .* · 22 050 Hz · mono · vorgebacken/);
  await lasseFallen(page, '[data-testid="dateibaum-liste"]', [{ name: "kanaele.wav", bytes: datei("fehler-kanaele.wav") }]);
  await page.waitForFunction(() => /kanaele\.wav hat 6 Kanäle – höchstens 2/.test(document.getElementById("toast").textContent));
  await lasseFallen(page, '[data-testid="dateibaum-liste"]', [{ name: "falsch.flac", bytes: datei("ton-mono.wav") }]);
  await page.waitForFunction(() => /falsch\.flac ist kein lesbarer Klang \(WAV oder FLAC\)/.test(document.getElementById("toast").textContent));
  const baum = await baumDateien(page);
  assert.ok(!baum.includes("kanaele.wav") && !baum.includes("falsch.flac"));
  // Lauf: beide Klänge in beiden Motoren; die Seite bekommt die PCM mit Rate und Kanälen
  await page.click('[data-testid="baum-datei"][data-pfad="willkommen.pizza"]');
  await warteAufTab(page, "willkommen.pizza");
  await setzeCode(page, [
    'Klang a = Klang.laden("akkord.flac");',
    'Klang t = Klang.laden("ton.wav");',
    'a.spiele(lautstaerke: 0.5);',
    't.spiele(panorama: 0.5);',
    'Bote.sage((a + " " + a.dauer() + " " + (t == Klang.laden("ton.wav"))));',
  ].join("\n"));
  for (const motor of ["auto", "interpreter"]) {
    await page.select('[data-testid="motor-umschalter"], #motor-wahl', motor);
    await ereignisseLeeren(page);
    await backen(page);
    await page.waitForFunction(() => (window.__ereignisse || []).some((e) => e.typ === "ende"), { timeout: 20_000 });
    assert.equal(await konsolenAusgabe(page), "Klang(1) 0.25 ja\n", "Motor " + motor);
    const pcm = await page.evaluate(() => (window.__ereignisse || []).filter((e) => e.typ === "klang-pcm").map((e) => [e.rate, e.kanaele]));
    assert.deepEqual(pcm, [[44100, 2], [22050, 1]], "Motor " + motor);
  }
  // Wiedergabe der Seite: Stereo-PCM mit eigener Rate in einen OfflineAudioContext (stumm) – links laut, rechts laut
  const pegel = await page.evaluate(async () => {
    const ev = (window.__ereignisse || []).find((e) => e.typ === "klang-pcm" && e.kanaele === 2);
    return window.__klangOffline(ev.bytes, [{ art: "spiele", spur: 1, lautstaerke: 1, tonhoehe: 1, panorama: 0, schleife: false }], null, ev.rate, ev.kanaele);
  });
  assert.ok(pegel.links > 0.01 && pegel.rechts > 0.01, JSON.stringify(pegel));
});
