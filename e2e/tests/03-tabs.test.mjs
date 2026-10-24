// Projekte und Tabs (PROJEKTE.md §3.1, F11): ein aktives Projekt je Fenster, Tabs = offene Dateien. Beispiel öffnet ein neues
// Projekt, das alte (geänderte) Projekt bleibt erhalten; „+“ = neues Ein-Datei-Projekt; Strg+S; Tabs schließen ohne Datenverlust;
// Reload stellt Projekt, Tabs und Inhalte wieder her (IndexedDB); Umbenennen per Doppelklick benennt die Datei um.
import assert from "node:assert/strict";
import {
  e2e, setzeCode, editorText, editorTabs, zeigePanelTab, strg, bereit, schlafe, backen, konsolenAusgabe,
  S, warteAufTab, neuerTab, aktivesProjekt, warteAufProjekt, wechsleProjekt, projektListe, baumDateien, PJ,
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

/** Neue Datei über den Dateibaum anlegen (Knopf im Baumkopf, Name eintippen, Enter). */
async function neueDatei(page, pfad) {
  if (await page.$eval(PJ.baum, (b) => b.hidden)) await page.click('[data-testid="dateibaum-umschalten"]');
  await page.click('[data-testid="baum-neue-datei"]');
  await page.waitForSelector('[data-testid="baum-eingabe"]');
  await page.focus('[data-testid="baum-eingabe"]');
  await page.keyboard.type(pfad);
  await page.keyboard.press("Enter");
  await page.waitForFunction((p) => [...document.querySelectorAll('[data-testid="baum-datei"]')].some((e) => e.dataset.pfad === p), {}, pfad);
}

e2e("Beispiel öffnen erzeugt ein neues Projekt, das alte (geänderte) Projekt bleibt erhalten", async ({ page, oeffne }) => {
  await oeffne();
  assert.equal(await aktivesProjekt(page), "willkommen");
  const eigen = '// mein eigener Code\nBote.sage(("meins"));';
  await setzeCode(page, eigen);
  let tabs = await editorTabs(page);
  assert.equal(tabs.length, 1);
  assert.ok(tabs[0].schmutzig, "geänderte Datei ist als ungespeichert markiert");

  await oeffneBeispiel(page, "Hallo Welt");
  await warteAufTab(page, "hallo-welt.pizza");
  await warteAufProjekt(page, "hallo-welt");
  tabs = await editorTabs(page);
  assert.deepEqual(tabs.map((t) => t.name), ["hallo-welt.pizza"], "Tabs = Dateien des aktiven Projekts");
  assert.match(await editorText(page), /Hallo, Pizzawelt!/);
  await page.waitForFunction(() => /als neues Projekt geöffnet/.test(document.getElementById("toast").textContent));
  assert.deepEqual(await projektListe(page), ["hallo-welt", "willkommen"], "zuletzt geändert zuerst");

  // Zurück zum alten Projekt: Inhalt unverändert; gleiches Beispiel erneut → kein weiteres Projekt, nur Wechsel
  await wechsleProjekt(page, "willkommen");
  assert.equal(await editorText(page), eigen, "alter Inhalt unverändert");
  await oeffneBeispiel(page, "Hallo Welt");
  await warteAufProjekt(page, "hallo-welt");
  assert.equal((await projektListe(page)).length, 2);

  // Undo-Historie ist je Datei getrennt: Strg+Z im Beispiel ändert nichts
  await page.focus("#editor .cm-content");
  await strg(page, "KeyZ");
  assert.match(await editorText(page), /Hallo, Pizzawelt!/);

  // Geändertes Beispiel erneut öffnen → Wahl „Zu meiner Kopie“ / „Frische Kopie“
  await setzeCode(page, 'Bote.sage(("verändert"));');
  await wechsleProjekt(page, "willkommen");
  await oeffneBeispiel(page, "Hallo Welt");
  await page.waitForSelector("#dialog-frage[open]");
  assert.match(await page.$eval("#dialog-text", (e) => e.textContent), /geändert/);
  await page.$eval('#dialog-frage button[value="nein"]', (k) => k.click()); // „Zu meiner Kopie“
  await warteAufProjekt(page, "hallo-welt");
  assert.equal(await editorText(page), 'Bote.sage(("verändert"));');
});

e2e("„+“ legt ein neues Ein-Datei-Projekt an, Strg+S markiert gespeichert, Backen startet immer die Hauptdatei", async ({ page, oeffne }) => {
  await oeffne();
  await neuerTab(page);
  await warteAufTab(page, "unbenannt-1.pizza");
  assert.equal(await aktivesProjekt(page), "unbenannt-1");
  assert.equal(await editorText(page), "");
  await setzeCode(page, 'Bote.sage(("aus der Hauptdatei"));');
  let aktiv = (await editorTabs(page)).find((t) => t.aktiv);
  assert.ok(aktiv.schmutzig);
  await page.focus("#editor .cm-content");
  await strg(page, "KeyS");
  await page.waitForFunction(() => /lokal gespeichert/.test(document.getElementById("toast").textContent));
  aktiv = (await editorTabs(page)).find((t) => t.aktiv);
  assert.equal(aktiv.schmutzig, false);

  // Zweite Datei: Tab dazu, Dateibaum zeigt beide, ★ an der Hauptdatei
  await neueDatei(page, "notiz.txt");
  assert.deepEqual((await editorTabs(page)).map((t) => t.name), ["unbenannt-1.pizza", "notiz.txt"]);
  assert.deepEqual(await baumDateien(page), ["notiz.txt", "unbenannt-1.pizza"]);
  assert.equal(await page.$eval('[data-testid="baum-datei"][data-haupt="true"]', (e) => e.dataset.pfad), "unbenannt-1.pizza");
  await setzeCode(page, "nur eine Notiz");
  // Backen im Notiz-Tab startet trotzdem das Projekt (Hauptdatei)
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "aus der Hauptdatei\n");

  // Tab schließen: keine Rückfrage (die Datei bleibt im Projekt), Alt+Shift+T holt ihn zurück
  await page.$eval(S.tabAktiv, (t) => t.querySelector('[data-testid="editor-tab-schliessen"], .etab-zu').click());
  await schlafe(100);
  assert.equal(await page.$eval("#dialog-frage", (d) => d.open), false, "keine Rückfrage");
  assert.deepEqual((await editorTabs(page)).map((t) => t.name), ["unbenannt-1.pizza"]);
  assert.deepEqual(await baumDateien(page), ["notiz.txt", "unbenannt-1.pizza"], "Datei bleibt im Projekt");
  await page.keyboard.down("Alt"); await page.keyboard.down("Shift"); await page.keyboard.press("KeyT");
  await page.keyboard.up("Shift"); await page.keyboard.up("Alt");
  await warteAufTab(page, "notiz.txt");
  assert.equal(await editorText(page), "nur eine Notiz");
  // Letzter offener Tab bleibt offen
  await page.$eval(S.tabAktiv, (t) => t.querySelector(".etab-zu").click());
  await page.$eval(S.tabAktiv, (t) => t.querySelector(".etab-zu").click());
  assert.equal((await editorTabs(page)).length, 1);
});

e2e("Reload stellt Projekt, offene Tabs und Inhalte wieder her (IndexedDB)", async ({ page, oeffne }) => {
  await oeffne();
  await oeffneBeispiel(page, "Hallo Welt");
  await warteAufTab(page, "hallo-welt.pizza");
  await neuerTab(page);
  await warteAufTab(page, "unbenannt-1.pizza");
  const code = 'Bote.sage(("überlebt den Reload"));';
  await setzeCode(page, code);
  await neueDatei(page, "welt/tisch.pizza");
  await setzeCode(page, "// Tisch");
  const vorher = await editorTabs(page);
  await schlafe(600); // Speichern ist entprellt (400 ms)

  await page.reload({ waitUntil: "load" });
  await bereit(page);
  assert.equal(await aktivesProjekt(page), "unbenannt-1");
  const nachher = await editorTabs(page);
  assert.deepEqual(nachher.map((t) => [t.name, t.aktiv, t.schmutzig]), vorher.map((t) => [t.name, t.aktiv, t.schmutzig]));
  assert.equal(await editorText(page), "// Tisch");
  assert.equal(await page.evaluate(() => localStorage.getItem("pizza.tabs")), null, "keine Tabs mehr in localStorage");
  await page.$$eval(S.tab, (t) => t.find((x) => x.querySelector(".etab-name").textContent === "unbenannt-1.pizza").querySelector(".etab-knopf").click());
  await warteAufTab(page, "unbenannt-1.pizza");
  assert.equal(await editorText(page), code);
  await wechsleProjekt(page, "hallo-welt");
  assert.match(await editorText(page), /Hallo, Pizzawelt!/);
  await backen(page);
  assert.match(await konsolenAusgabe(page), /^Hallo, Pizzawelt!/);
});

e2e("Tab umbenennen per Doppelklick benennt die Datei um (Pfadregeln)", async ({ page, oeffne }) => {
  await oeffne();
  await (await page.$(S.tabAktiv)).$eval(".etab-knopf", (k) => k.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  await page.waitForSelector('[data-testid="editor-tab-umbenennen"], #editor-tabs .etab-eingabe');
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.type("rezept.pizza");
  await page.keyboard.press("Enter");
  await warteAufTab(page, "rezept.pizza");
  // ungültiger Pfad → Meldung, Name bleibt
  await (await page.$(S.tabAktiv)).$eval(".etab-knopf", (k) => k.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  await page.waitForSelector('[data-testid="editor-tab-umbenennen"]');
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.type("Böse Datei.pizza");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => /kein gültiger Dateipfad/.test(document.getElementById("toast").textContent));
  await warteAufTab(page, "rezept.pizza");
});
