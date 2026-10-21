// Editor-Tabs: Beispiel öffnet neuen Tab, alter Inhalt bleibt; Schließen mit Rückfrage; Reload stellt Tabs wieder her.
import assert from "node:assert/strict";
import {
  e2e, setzeCode, editorText, editorTabs, zeigePanelTab, strg, bereit, schlafe, backen, konsolenAusgabe,
  S, warteAufTab, neuerTab,
} from "../hilfen.mjs";

async function oeffneBeispiel(page, titel) {
  await zeigePanelTab(page, "beispiele");
  await page.waitForSelector(S.beispielKarte);
  const karten = await page.$$(S.beispielKarte);
  for (const k of karten) {
    const t = await k.$eval(".bsp-titel", (e) => e.textContent);
    if (t === titel) { await k.evaluate((e) => e.scrollIntoView({ block: "center" })); await k.click(); return; }
  }
  throw new Error("Beispiel nicht gefunden: " + titel);
}


e2e("Beispiel öffnen erzeugt neuen Tab, alter (geänderter) Inhalt bleibt erhalten", async ({ page, oeffne }) => {
  await oeffne();
  const eigen = '// mein eigener Code\nBote.sage(("meins"));';
  await setzeCode(page, eigen);
  let tabs = await editorTabs(page);
  assert.equal(tabs.length, 1);
  assert.ok(tabs[0].schmutzig, "geänderter Tab ist als ungespeichert markiert");

  await oeffneBeispiel(page, "Hallo Welt");
  await warteAufTab(page, "hallo-welt.pizza");
  tabs = await editorTabs(page);
  assert.deepEqual(tabs.map((t) => t.name), ["willkommen.pizza", "hallo-welt.pizza"]);
  assert.match(await editorText(page), /Hallo, Pizzawelt!/);
  // Toast meldet das Öffnen
  await page.waitForFunction(() => /neuem Tab geöffnet/.test(document.getElementById("toast").textContent));

  // Gleiches Beispiel erneut → kein weiterer Tab, nur Wechsel
  await (await page.$$(S.tab))[0].$eval(".etab-knopf", (k) => k.click());
  await warteAufTab(page, "willkommen.pizza");
  assert.equal(await editorText(page), eigen, "alter Inhalt unverändert");
  await oeffneBeispiel(page, "Hallo Welt");
  await warteAufTab(page, "hallo-welt.pizza");
  assert.equal((await editorTabs(page)).length, 2);

  // Undo-Historie ist pro Tab getrennt: Strg+Z im Beispiel-Tab ändert nichts
  await page.focus("#editor .cm-content");
  await strg(page, "KeyZ");
  assert.match(await editorText(page), /Hallo, Pizzawelt!/);
});

e2e("Neuer Tab (+), Strg+S markiert gespeichert, Schließen mit Rückfrage", async ({ page, oeffne }) => {
  await oeffne();
  await neuerTab(page);
  await warteAufTab(page, "unbenannt-1.pizza");
  assert.equal(await editorText(page), "");
  await setzeCode(page, 'Bote.sage(("entwurf"));');
  let aktiv = (await editorTabs(page)).find((t) => t.aktiv);
  assert.ok(aktiv.schmutzig);

  // Schließen → Rückfrage → Abbrechen: Tab bleibt
  await page.$eval(S.tabAktiv, (t) => t.querySelector('[data-testid="editor-tab-schliessen"], .etab-zu').click());
  await page.waitForSelector("#dialog-frage[open]");
  assert.match(await page.$eval("#dialog-text", (e) => e.textContent), /unbenannt-1\.pizza/);
  await page.click('#dialog-frage button[value="nein"]');
  await page.waitForFunction(() => !document.getElementById("dialog-frage").open);
  assert.equal((await editorTabs(page)).length, 2);
  assert.equal(await editorText(page), 'Bote.sage(("entwurf"));');

  // Strg+S → gespeichert (kein Punkt mehr), Schließen ohne Rückfrage
  await page.focus("#editor .cm-content");
  await strg(page, "KeyS");
  await page.waitForFunction(() => /lokal gespeichert/.test(document.getElementById("toast").textContent));
  aktiv = (await editorTabs(page)).find((t) => t.aktiv);
  assert.equal(aktiv.schmutzig, false);

  // erneut ändern → Schließen → Rückfrage bestätigen
  await setzeCode(page, 'Bote.sage(("verworfen"));');
  await page.$eval(S.tabAktiv, (t) => t.querySelector('[data-testid="editor-tab-schliessen"], .etab-zu').click());
  await page.waitForSelector("#dialog-frage[open]");
  await page.click(S.dialogJa);
  await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 1, {}, S.tab);
  assert.equal((await editorTabs(page))[0].name, "willkommen.pizza");

  // Unveränderter Tab schließt ohne Rückfrage; letzter Tab → leerer Ersatz-Tab
  await page.$eval(S.tabAktiv, (t) => t.querySelector('[data-testid="editor-tab-schliessen"], .etab-zu').click());
  await schlafe(100);
  assert.equal(await page.$eval("#dialog-frage", (d) => d.open), false, "keine Rückfrage für unveränderten Tab");
  const t = await editorTabs(page);
  assert.equal(t.length, 1);
  assert.equal(t[0].name, "unbenannt-1.pizza");
});

e2e("Reload stellt Tabs, aktiven Tab und Inhalte wieder her (localStorage)", async ({ page, oeffne }) => {
  await oeffne();
  await oeffneBeispiel(page, "Hallo Welt");
  await warteAufTab(page, "hallo-welt.pizza");
  await neuerTab(page);
  await warteAufTab(page, "unbenannt-1.pizza");
  const code = 'Bote.sage(("überlebt den Reload"));';
  await setzeCode(page, code);
  const vorher = await editorTabs(page);
  await schlafe(600); // Speichern ist entprellt (400 ms)

  await page.reload({ waitUntil: "load" });
  await bereit(page);
  const nachher = await editorTabs(page);
  assert.deepEqual(nachher.map((t) => [t.name, t.aktiv, t.schmutzig]), vorher.map((t) => [t.name, t.aktiv, t.schmutzig]));
  assert.equal(await editorText(page), code);
  const gespeichert = await page.evaluate(() => JSON.parse(localStorage.getItem("pizza.tabs")));
  assert.equal(gespeichert.tabs.length, 3);
  // Inhalte der anderen Tabs
  await (await page.$$(S.tab))[1].$eval(".etab-knopf", (k) => k.click());
  await warteAufTab(page, "hallo-welt.pizza");
  assert.match(await editorText(page), /Hallo, Pizzawelt!/);
  await backen(page);
  assert.match(await konsolenAusgabe(page), /^Hallo, Pizzawelt!/);
});

e2e("Tab umbenennen per Doppelklick", async ({ page, oeffne }) => {
  await oeffne();
  await (await page.$(S.tabAktiv)).$eval(".etab-knopf", (k) => k.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  await page.waitForSelector('[data-testid="editor-tab-umbenennen"], #editor-tabs .etab-eingabe');
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.type("rezept.pizza");
  await page.keyboard.press("Enter");
  await warteAufTab(page, "rezept.pizza");
});
