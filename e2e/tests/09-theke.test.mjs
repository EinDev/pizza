// Theke-Vorschaufenster (THEKE.md §4/§8): schwebt über allem, verschiebbar, Schließen beendet bediene(),
// Abbrechen und Programmende schließen das Fenster (Nutzerentscheidung K-061).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  e2e, setzeCode, strg, schlafe, warteLaufEnde, konsolenAusgabe, exitBadge, EXIT_TEXT, SITE, SCHMAL,
  ereignisseLeeren, ausgabeAusEreignissen, VORSCHAU_ZU, warteAufBediene, thekeEreignis,
} from "../hilfen.mjs";

const FENSTER = "#vorschau";
const HALLO = fs.readFileSync(path.join(SITE, "beispiele", "theke", "hallo-theke.pizza"), "utf8").replace(/\r\n?/g, "\n");

async function starteTheke(page, code) {
  await setzeCode(page, code);
  await ereignisseLeeren(page);
  await page.focus("#editor .cm-content");
  await strg(page, "Enter");
  await page.waitForSelector(`${FENSTER}:not([hidden]) [data-theke-id]`, { timeout: 10_000 });
  await warteAufBediene(page, 0);
}

const fensterBox = (page) => page.$eval(FENSTER, (f) => { const r = f.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, hidden: f.hidden }; });
const fensterZu = (page) => page.$eval(FENSTER, (f) => f.hidden);

e2e("Vorschaufenster öffnet über allem, zeigt den Fenstertitel; Editor bleibt bedienbar", async ({ page, oeffne }) => {
  await oeffne();
  assert.equal(await fensterZu(page), true, "vor dem Lauf kein Fenster");
  await starteTheke(page, HALLO);
  assert.equal(await page.$eval('[data-testid="vorschau-titel"], #vorschau-titel', (t) => t.textContent), "Hallo Theke");
  // Über allem: an mehreren Punkten im Fenster liegt das Fenster oben (nichts aus Kopfzeile/Panel/Konsole darüber)
  const verdeckt = await page.$eval(FENSTER, (f) => {
    const r = f.getBoundingClientRect();
    const punkte = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]];
    return punkte.map(([a, b]) => document.elementFromPoint(r.left + r.width * a, r.top + r.height * b))
      .filter((e) => e && !f.contains(e)).map((e) => e.id || String(e.className));
  });
  assert.deepEqual(verdeckt, [], "nichts liegt über dem Vorschaufenster");
  const z = await page.$eval(FENSTER, (f) => getComputedStyle(f).position);
  assert.match(z, /fixed|absolute/);
  // Fenster in den Viewport passend
  const b = await fensterBox(page);
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1280 && b.y + b.h <= 800, "im Viewport: " + JSON.stringify(b));
  // Kein Abdunkeln: Editor außerhalb des Fensters ist klickbar, Tippen ändert den Code, während bediene() wartet
  await page.mouse.click(b.x > 200 ? 100 : b.x + b.w + 50, 130);
  await page.keyboard.press("End");
  await page.keyboard.type(" // tippen geht");
  assert.match(await page.evaluate(() => document.querySelector("#editor .cm-content").textContent), /tippen geht/);
  assert.equal(await fensterZu(page), false, "Fenster bleibt offen");
  // Bedienung im Fenster wirkt
  const vorher = await page.evaluate(() => (window.__ereignisse || []).filter((e) => e.typ === "ui-warte").length);
  await thekeEreignis(page, { typ: "klick", id: "backen" });
  await warteAufBediene(page, vorher);
  assert.equal(await page.$eval('#vorschau [data-theke-id="zaehler"]', (e) => e.textContent), "1 Pizza gebacken");
  await page.click(VORSCHAU_ZU);
  await warteLaufEnde(page);
});

e2e("Vorschaufenster ist an der Titelleiste verschiebbar und merkt sich die Position (Sitzung)", async ({ page, oeffne }) => {
  await oeffne();
  await starteTheke(page, HALLO);
  const a = await fensterBox(page);
  const kopf = await page.$eval('#vorschau-kopf', (k) => { const r = k.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 }; });
  await page.mouse.move(kopf.x, kopf.y);
  await page.mouse.down();
  await page.mouse.move(kopf.x - 150, kopf.y + 60, { steps: 8 });
  await page.mouse.up();
  const b = await fensterBox(page);
  assert.ok(Math.abs(b.x - (a.x - 150)) <= 2 && Math.abs(b.y - (a.y + 60)) <= 2, `verschoben: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  assert.ok(Math.abs(b.w - a.w) <= 1 && Math.abs(b.h - a.h) <= 1, "Größe bleibt");
  const gemerkt = await page.evaluate(() => JSON.parse(sessionStorage.getItem("pizza.vorschau") || "null"));
  assert.ok(gemerkt && Math.abs(gemerkt.x - b.x) <= 2, "Position in sessionStorage: " + JSON.stringify(gemerkt));
  // Klick auf den Schließen-Knopf in der Titelleiste verschiebt nicht
  await page.click(VORSCHAU_ZU);
  await warteLaufEnde(page);
  // nächster Lauf öffnet an derselben Stelle
  await starteTheke(page, HALLO);
  const c = await fensterBox(page);
  assert.ok(Math.abs(c.x - b.x) <= 2 && Math.abs(c.y - b.y) <= 2, `gleiche Stelle beim nächsten Lauf: ${JSON.stringify(c)}`);
  await page.click(VORSCHAU_ZU);
  await warteLaufEnde(page);
});

e2e("Schließen des Fensters beendet bediene() – Programm läuft zu Ende", async ({ page, oeffne }) => {
  await oeffne();
  await starteTheke(page, HALLO);
  assert.match((await exitBadge(page)).text, /im Ofen|wartet/);
  const vorher = await page.evaluate(() => (window.__ereignisse || []).filter((e) => e.typ === "ui-warte").length);
  await thekeEreignis(page, { typ: "klick", id: "backen" });
  await warteAufBediene(page, vorher);
  await page.click(VORSCHAU_ZU);
  assert.equal(await fensterZu(page), true, "Fenster sofort zu");
  await warteLaufEnde(page);
  assert.equal(await ausgabeAusEreignissen(page), "Theke zu. Gebacken: 1 Pizza.\n");
  assert.equal(await konsolenAusgabe(page), "Theke zu. Gebacken: 1 Pizza.\n");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
});

e2e("Abbrechen während bediene() schließt das Fenster; nächster Lauf öffnet frisch", async ({ page, oeffne }) => {
  await oeffne();
  await starteTheke(page, HALLO);
  const vorher = await page.evaluate(() => (window.__ereignisse || []).filter((e) => e.typ === "ui-warte").length);
  await thekeEreignis(page, { typ: "klick", id: "backen" });
  await warteAufBediene(page, vorher);
  await page.click("#knopf-abbrechen");
  await warteLaufEnde(page, 5000);
  assert.equal((await exitBadge(page)).text, "abgebrochen");
  assert.equal(await fensterZu(page), true, "Abbrechen schließt das Fenster");
  assert.doesNotMatch(await konsolenAusgabe(page), /Theke zu/);
  // frischer Lauf: Zähler wieder bei 0
  await starteTheke(page, HALLO);
  assert.equal(await page.$eval('#vorschau [data-theke-id="zaehler"]', (e) => e.textContent), "0 Pizzen gebacken");
  await page.click(VORSCHAU_ZU);
  await warteLaufEnde(page);
});

e2e("Programmende schließt das Fenster: theke.schliesse() im Rückruf", async ({ page, oeffne }) => {
  await oeffne();
  await starteTheke(page, [
    'Theke theke = neu Theke("Selbst zu", breite: 300, hoehe: 160);',
    'Knopf k = neu Knopf("Fertig", () -> { theke.schliesse(); }, id: "fertig");',
    "theke.zeige(neu Stapel([k]));",
    "theke.bediene();",
    'Bote.sage(("nach bediene"));',
  ].join("\n"));
  await thekeEreignis(page, { typ: "klick", id: "fertig" });
  await warteLaufEnde(page);
  assert.equal(await fensterZu(page), true);
  assert.equal(await konsolenAusgabe(page), "nach bediene\n");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
});

e2e("Programmende schließt das Fenster: ungefangene Ananas im Rückruf (Exit 1)", async ({ page, oeffne }) => {
  await oeffne();
  await starteTheke(page, [
    'Theke theke = neu Theke("Kaputt", breite: 300, hoehe: 160);',
    'Knopf k = neu Knopf("Kaputt machen", () -> { wirf neu StreitAnanas(("Knopf kaputt")); }, id: "kaputt");',
    "theke.zeige(neu Stapel([k]));",
    "theke.bediene();",
    'Bote.sage(("nie"));',
  ].join("\n"));
  await thekeEreignis(page, { typ: "klick", id: "kaputt" });
  await warteLaufEnde(page);
  assert.equal(await fensterZu(page), true, "Fenster zu nach Ananas");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[1]);
  assert.doesNotMatch(await konsolenAusgabe(page), /nie/);
});

e2e("Programmende schließt das Fenster: zeige() ohne bediene()", async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, [
    'Theke theke = neu Theke("Kurz", breite: 300, hoehe: 160);',
    'theke.zeige(neu Stapel([neu Schild("Gleich wieder weg")]));',
    'Bote.sage(("Programm endet"));',
  ].join("\n"));
  await ereignisseLeeren(page);
  await strg(page, "Enter");
  await warteLaufEnde(page);
  await schlafe(300);
  assert.equal(await fensterZu(page), true, "kein Fenster bleibt nach Programmende offen");
  assert.equal(await konsolenAusgabe(page), "Programm endet\n");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
});

e2e("Schmaler Viewport: Vorschau als Vollbild, Schließen funktioniert", { viewport: SCHMAL }, async ({ page, oeffne }) => {
  await oeffne();
  await starteTheke(page, HALLO);
  const b = await fensterBox(page);
  assert.ok(b.w >= 380 && b.x <= 5, "Vollbild-Sheet auf dem Handy: " + JSON.stringify(b));
  await page.click(VORSCHAU_ZU);
  await warteLaufEnde(page);
  assert.equal(await fensterZu(page), true);
  assert.equal(await konsolenAusgabe(page), "Theke zu. Gebacken: 0 Pizzen.\n");
});
