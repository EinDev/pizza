// Küchenbrigade im Playground (THREADS §4.8, SPEC §17.7, K-104 Punkt 12): Einstellung „Köche: auto | 1 | 2 | 4 | 8“ im
// Lauf-Popover, Statusleiste „Köche: N“ nur bei Programmen mit brigade, gleiches Ergebnis mit 4 und 1 Koch,
// „Abbrechen“ beendet alle Köche (danach neuer Pool), ohne Cross-Origin-Isolation identisch mit „Köche: 1“.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  e2e, setzeCode, warteLaufEnde, exitBadge, strg, ereignisseLeeren, ausgabeAusEreignissen, warteEingabeOderEnde, schlafe,
} from "../hilfen.mjs";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "site");
const lies = (p) => fs.readFileSync(path.join(SITE, "beispiele", p), "utf8").replace(/\r\n?/g, "\n");
const BRIGADE = lies("pizzafunktionen/kuechenbrigade.pizza");
const BRIGADE_ERWARTET = lies("pizzafunktionen/kuechenbrigade.erwartet");

// Zählt die Lauf-Worker (js/worker.js) der Seite – Prüfung, dass der Worker mit warmem Pool wiederverwendet wird.
const workerZaehler = () => {
  const W = window.Worker;
  window.__laufWorker = 0;
  window.Worker = class extends W {
    constructor(url, ...rest) { super(url, ...rest); if (String(url).endsWith("js/worker.js")) window.__laufWorker++; }
  };
};

async function setzeKoeche(page, wert) {
  if (await page.$eval("#lauf-popover", (p) => p.hidden)) await page.click('[data-testid="lauf-optionen"]');
  await page.click(`[data-testid="koeche-${wert}"]`);
  assert.equal(await page.$eval(`[data-testid="koeche-${wert}"]`, (r) => r.checked), true);
  assert.equal(await page.evaluate(() => localStorage.getItem("pizza.koeche")), wert);
  await page.keyboard.press("Escape");
}

/** Backt den Editorinhalt; liefert Ausgabe, Exit-Text, Statusleiste und das ende-Ereignis. */
async function lauf(page, timeout = 30_000) {
  await ereignisseLeeren(page);
  await page.focus("#editor .cm-content");
  await strg(page, "Enter");
  await warteLaufEnde(page, timeout);
  return {
    ausgabe: await ausgabeAusEreignissen(page),
    exit: (await exitBadge(page)).text,
    info: await page.$eval("#lauf-info", (e) => e.textContent),
    infoTitel: await page.$eval("#lauf-info", (e) => e.title),
    ende: await page.evaluate(() => (window.__ereignisse || []).filter((e) => e.typ === "ende").pop() || null),
  };
}

/** Anzahl der Koch-Worker (Kinder des Lauf-Workers) laut DevTools-Zielen des Browsers. */
async function kochZiele(page) {
  const c = await page.browser().target().createCDPSession();
  try {
    await c.send("Target.setDiscoverTargets", { discover: true });
    const { targetInfos } = await c.send("Target.getTargets");
    return targetInfos.filter((t) => /pizzaiolo\/koch\.js/.test(t.url)).length;
  } finally { await c.detach().catch(() => {}); }
}

e2e("Köche: Popover-Einstellung wird gemerkt, Standard auto", async ({ page, oeffne }) => {
  await oeffne();
  await page.click('[data-testid="lauf-optionen"]');
  assert.equal(await page.$eval('[data-testid="koeche-auto"]', (r) => r.checked), true, "Standard: auto");
  for (const w of ["auto", "1", "2", "4", "8"]) assert.ok(await page.$(`[data-testid="koeche-${w}"]`), "Wahl " + w);
  assert.equal(await page.$eval('[data-testid="koeche-hinweis"]', (h) => h.hidden), true, "mit Isolation kein Hinweis");
  await page.keyboard.press("Escape");
  await setzeKoeche(page, "2");
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("body.bereit");
  assert.equal(await page.$eval('[data-testid="koeche-2"]', (r) => r.checked), true, "Wahl überlebt Reload");
  assert.match(await page.$eval('[data-testid="lauf-optionen"]', (k) => k.title), /Köche: 2/);
});

e2e("Köche: kuechenbrigade.pizza mit 4 und 1 Koch identisch, Statusleiste zeigt die genutzte Anzahl",
  { timeout: 120_000, vorLaden: workerZaehler }, async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, BRIGADE);
  await setzeKoeche(page, "4");
  await page.waitForFunction(() => window.__laufWorker >= 1);   // Fähigkeiten-Prüfung nutzt ebenfalls js/worker.js
  const basisWorker = await page.evaluate(() => window.__laufWorker);
  const vier = await lauf(page);
  assert.equal(vier.ausgabe, BRIGADE_ERWARTET, "Köche 4: Ausgabe wie .erwartet");
  assert.equal(vier.ende.motor, "wasm", "Brigade läuft im Wasm-Motor");
  assert.equal(vier.ende.koeche, 4, "ende.koeche: vier Köche haben gekocht");
  assert.match(vier.info, /· Köche: 4$/, "Statusleiste");
  assert.match(vier.infoTitel, /Köche: 4/);
  assert.equal(await kochZiele(page), 3, "drei Koch-Worker (der Lauf-Worker kocht mit)");

  // zweiter Lauf mit derselben Einstellung: derselbe Lauf-Worker, derselbe Pool (warm)
  const nochmal = await lauf(page);
  assert.equal(nochmal.ausgabe, BRIGADE_ERWARTET);
  assert.equal(nochmal.ende.koeche, 4);
  assert.equal(await page.evaluate(() => window.__laufWorker), basisWorker + 1, "Lauf-Worker mit warmem Pool wiederverwendet");
  assert.equal(await kochZiele(page), 3, "kein zusätzlicher Pool");

  await setzeKoeche(page, "1");
  const eins = await lauf(page);
  assert.equal(eins.ausgabe, vier.ausgabe, "Köche 1 vs. 4: gleiche Ausgabe");
  assert.equal(eins.exit, vier.exit);
  assert.equal(eins.ende.schritte, vier.ende.schritte, "gleiche Schritte");
  assert.equal(eins.ende.zeitMs, vier.ende.zeitMs, "gleiche Ofenzeit");
  assert.equal(eins.ende.koeche, 1);
  assert.match(eins.info, /· Köche: 1$/);

  // Interpreter: sequentiell, Anzeige 1
  await page.select("#motor-wahl", "interpreter");
  const interp = await lauf(page);
  assert.equal(interp.ausgabe, vier.ausgabe, "Interpreter: gleiche Ausgabe");
  assert.match(interp.info, /· Köche: 1$/);
  await page.select("#motor-wahl", "auto");
});

e2e("Köche: Statusleiste nur bei Programmen mit brigade", async ({ page, oeffne }) => {
  await oeffne();
  await setzeKoeche(page, "4");
  await setzeCode(page, 'Bote.sage(("ohne Brigade"));\n// brigade im Kommentar zählt nicht\nBote.sage(([1 .. 3].belege(x -> x * 2).summe()));');
  const ohne = await lauf(page);
  assert.equal(ohne.ausgabe, "ohne Brigade\n12\n");
  assert.equal(ohne.ende.koeche, undefined, "kein koeche im ende");
  assert.doesNotMatch(ohne.info + ohne.infoTitel, /Köche/);
  await setzeCode(page, 'Bote.sage(([1 .. 4].brigade(x -> x * x).summe()));');
  const mit = await lauf(page);
  assert.equal(mit.ausgabe, "30\n");
  assert.match(mit.info, /· Köche: \d+$/);
});

e2e("Köche: Abbrechen während eines Brigade-Laufs beendet alle Köche, der nächste Lauf bekommt neue",
  { timeout: 90_000, vorLaden: workerZaehler }, async ({ page, oeffne }) => {
  await oeffne();
  await setzeKoeche(page, "4");
  await page.waitForFunction(() => window.__laufWorker >= 1);   // Fähigkeiten-Prüfung
  const basisWorker = await page.evaluate(() => window.__laufWorker);
  // Brigade, dann Warten auf Eingabe – der Pool lebt, der Lauf hängt deterministisch
  await setzeCode(page, 'Bote.sage(([1 .. 8].brigade(x -> x + 1).summe()));\nmargherita z = Bestellannahme.lies();\nBote.sage(("nie: " + z));');
  await ereignisseLeeren(page);
  await page.focus("#editor .cm-content");
  await strg(page, "Enter");
  assert.equal(await warteEingabeOderEnde(page), "eingabe");
  assert.equal(await ausgabeAusEreignissen(page), "44\n");
  const vorher = await kochZiele(page);
  assert.equal(vorher, 3, "Pool für vier Köche: drei Koch-Worker (der Lauf-Worker kocht mit)");
  await page.click("#knopf-abbrechen");
  await warteLaufEnde(page);
  assert.equal((await exitBadge(page)).text, "abgebrochen");
  assert.doesNotMatch(await page.$eval("#lauf-info", (e) => e.textContent), /Köche/);
  // DevTools meldet die Kinder-Worker: nach dem Abbrechen sind alle weg
  const bis = Date.now() + 5000;
  while ((await kochZiele(page)) > 0 && Date.now() < bis) await schlafe(50);
  assert.equal(await kochZiele(page), 0, "alle Köche beendet");
  // nächster Lauf: neuer Lauf-Worker, neuer Pool, vier Köche
  await setzeCode(page, BRIGADE);
  const neu = await lauf(page);
  assert.equal(neu.ausgabe, BRIGADE_ERWARTET);
  assert.equal(neu.ende.koeche, 4);
  assert.equal(await page.evaluate(() => window.__laufWorker), basisWorker + 2, "nach Abbrechen ein frischer Lauf-Worker");
});

// K-104/14: Bisher blieb beim Wechsel auf „Köche: 1“ der warme Lauf-Worker samt Pool liegen (drei Koch-Worker im Leerlauf).
e2e("Köche: Wechsel der Einstellung gibt den warmen Pool frei, „Köche: 1“ legt keinen neuen an",
  { timeout: 120_000, vorLaden: workerZaehler }, async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, BRIGADE);
  await setzeKoeche(page, "4");
  await page.waitForFunction(() => window.__laufWorker >= 1);   // Fähigkeiten-Prüfung
  const basisWorker = await page.evaluate(() => window.__laufWorker);
  const vier = await lauf(page);
  assert.equal(vier.ende.koeche, 4);
  assert.equal(await kochZiele(page), 3, "warmer Pool: drei Koch-Worker");

  // nur umschalten, ohne zu backen: die Köche verschwinden sofort
  await setzeKoeche(page, "1");
  const bis = Date.now() + 5000;
  while ((await kochZiele(page)) > 0 && Date.now() < bis) await schlafe(50);
  assert.equal(await kochZiele(page), 0, "Wechsel auf „Köche: 1“ beendet alle Köche");

  const eins = await lauf(page);
  assert.equal(eins.ausgabe, BRIGADE_ERWARTET, "Köche 1: gleiche Ausgabe");
  assert.equal(eins.ende.koeche, 1);
  assert.equal(await kochZiele(page), 0, "„Köche: 1“ legt keinen Pool an");
  assert.equal(await page.evaluate(() => window.__laufWorker), basisWorker + 2, "nach dem Wechsel ein frischer Lauf-Worker");

  // zurück auf 4: neuer Pool, gleiches Ergebnis
  await setzeKoeche(page, "4");
  const wieder = await lauf(page);
  assert.equal(wieder.ausgabe, BRIGADE_ERWARTET);
  assert.equal(wieder.ende.koeche, 4);
  assert.equal(wieder.ende.schritte, eins.ende.schritte);
  assert.equal(wieder.ende.zeitMs, eins.ende.zeitMs);
  assert.equal(await kochZiele(page), 3, "wieder drei Koch-Worker");
});

e2e("Köche ohne Cross-Origin-Isolation: Hinweis im Popover, Ergebnis wie mit einem Koch", { isolation: false, timeout: 90_000 }, async ({ page, oeffne }) => {
  await oeffne();
  assert.equal(await page.evaluate(() => window.crossOriginIsolated), false);
  await page.click('[data-testid="lauf-optionen"]');
  assert.equal(await page.$eval('[data-testid="koeche-hinweis"]', (h) => h.hidden), false, "Hinweis sichtbar");
  assert.match(await page.$eval('[data-testid="koeche-hinweis"]', (h) => h.textContent), /Cross-Origin-Isolation/);
  await page.keyboard.press("Escape");
  await setzeCode(page, BRIGADE);
  await setzeKoeche(page, "4");
  const vier = await lauf(page);
  await setzeKoeche(page, "1");
  const eins = await lauf(page);
  assert.equal(vier.ausgabe, BRIGADE_ERWARTET);
  assert.equal(eins.ausgabe, vier.ausgabe);
  assert.equal(vier.ende.koeche, 1, "ohne Isolation kocht ein Koch");
  assert.match(vier.info, /· Köche: 1$/);
});

e2e("Köche im App-Modus: dieselbe Einstellung wie im Playground", { timeout: 90_000 }, async ({ page, basis, server }) => {
  const { verpacke } = await import("../../ui/src/teilen.js");
  server.teilen.ablage.set("brigadeapp", verpacke("hochzeit.pizza", BRIGADE));
  await page.goto(basis, { waitUntil: "load" });
  await page.evaluate(() => localStorage.setItem("pizza.koeche", "4"));
  await page.goto(basis + "#app=brigadeapp", { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("#app-ende:not([hidden])", { timeout: 30_000 });
  const ende = await page.evaluate(() => (window.__ereignisse || []).filter((e) => e.typ === "ende").pop() || null);
  assert.ok(ende, "ende-Ereignis");
  assert.equal(ende.koeche, 4, "App nutzt die Köche-Einstellung des Browsers");
  assert.equal(await ausgabeAusEreignissen(page), BRIGADE_ERWARTET);
});
