// Argumente-Feld für hauptgang(args) und „Vorrat löschen“ in der Befehlspalette.
import assert from "node:assert/strict";
import {
  e2e, setzeCode, strg, schlafe, warteLaufEnde, konsolenAusgabe, exitBadge, EXIT_TEXT, bereit, neuerTab,
  editorTabs, ereignisseLeeren, S, zeigePanelTab, warteAufTabMuster,
} from "../hilfen.mjs";

const ARGS = '[data-testid="argumente"]';
const HAUPT = [
  "speisekarte klasse Haupt {",
  "    speisekarte tiefkühl leer hauptgang(Blech<margherita> args) {",
  '        Bote.sage(("Anzahl: " + args.länge()));',
  '        für (margherita a : args) { Bote.sage(("[" + a + "]")); }',
  "    }",
  "}",
].join("\n");

const LAUF_KNOPF = '[data-testid="lauf-optionen"]';
const LAUF_POPOVER = '[data-testid="lauf-popover"]';
const SAAT = '[data-testid="feste-saat"]';
const popoverOffen = (page) => page.$eval(LAUF_POPOVER, (p) => !p.hidden);
const punktSichtbar = (page) => page.$eval("#lauf-punkt", (p) => !p.hidden && getComputedStyle(p).display !== "none");

/** Lauf-Einstellungen (Popover mit Argumente-Feld und „feste Saat“) öffnen, falls noch zu. */
async function oeffneLaufOptionen(page) {
  if (!(await popoverOffen(page))) await page.click(LAUF_KNOPF);
  await page.waitForSelector(`${LAUF_POPOVER}:not([hidden])`, { visible: true });
}

async function setzeArgs(page, text) {
  await oeffneLaufOptionen(page);
  await page.click(ARGS, { count: 3 });
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (text) await page.keyboard.type(text);
}
const argsWert = (page) => page.$eval(ARGS, (f) => f.value);

async function backenUndAusgabe(page) {
  await ereignisseLeeren(page);
  await page.focus("#editor .cm-content");
  await strg(page, "Enter");
  await warteLaufEnde(page);
  return konsolenAusgabe(page);
}

e2e("Argumente: Luigi \"Tisch 5\" 3 → hauptgang(args) bekommt [Luigi, Tisch 5, 3]; Enter im Feld startet den Lauf", async ({ page, oeffne }) => {
  await oeffne();
  await neuerTab(page);
  await setzeCode(page, HAUPT);
  assert.equal(await argsWert(page), "", "neuer Tab ohne Argumente");
  await setzeArgs(page, 'Luigi "Tisch 5" 3');
  // Enter im Argumente-Feld startet den Lauf und schließt das Popover
  await ereignisseLeeren(page);
  await page.keyboard.press("Enter");
  await warteLaufEnde(page);
  assert.equal(await popoverOffen(page), false, "Popover nach Enter geschlossen");
  assert.equal(await konsolenAusgabe(page), "Anzahl: 3\n[Luigi]\n[Tisch 5]\n[3]\n");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
  // Kommandozeilen-Regeln: '…' wörtlich, \" in "…", leere Werte
  await setzeArgs(page, `'a b' "x \\"y\\"" "" z`);
  assert.equal(await backenUndAusgabe(page), 'Anzahl: 4\n[a b]\n[x "y"]\n[]\n[z]\n');
  // ohne Argumente: leeres Blech
  await setzeArgs(page, "");
  assert.equal(await backenUndAusgabe(page), "Anzahl: 0\n");
});

e2e("Argumente: pro Tab gespeichert, Tab-Wechsel und Reload stellen sie wieder her", async ({ page, oeffne }) => {
  await oeffne();
  await neuerTab(page);
  await setzeCode(page, HAUPT);
  await setzeArgs(page, 'Luigi "Tisch 5" 3');
  await neuerTab(page);
  await setzeCode(page, HAUPT);
  assert.equal(await argsWert(page), "", "zweiter Tab hat eigene (leere) Argumente");
  await setzeArgs(page, "Mario");
  // zurück zu Tab 1
  await page.$$eval(S.tab, (t) => t.find((x) => x.querySelector(".etab-name").textContent === "unbenannt-1.pizza").querySelector(".etab-knopf").click());
  await warteAufTabMuster(page, "unbenannt-1.pizza");
  assert.equal(await argsWert(page), 'Luigi "Tisch 5" 3');
  await schlafe(600); // Tab-Speichern ist entprellt
  await page.reload({ waitUntil: "load" });
  await bereit(page);
  assert.equal((await editorTabs(page)).find((t) => t.aktiv).name, "unbenannt-1.pizza");
  assert.equal(await argsWert(page), 'Luigi "Tisch 5" 3', "Argumente nach Reload");
  assert.equal(await backenUndAusgabe(page), "Anzahl: 3\n[Luigi]\n[Tisch 5]\n[3]\n");
  await page.$$eval(S.tab, (t) => t.find((x) => x.querySelector(".etab-name").textContent === "unbenannt-2.pizza").querySelector(".etab-knopf").click());
  await warteAufTabMuster(page, "unbenannt-2.pizza");
  assert.equal(await argsWert(page), "Mario");
  assert.equal(await backenUndAusgabe(page), "Anzahl: 1\n[Mario]\n");
});

e2e("Lauf-Einstellungen: Hinweis-Punkt bei Argumenten/fester Saat; Palettenbefehl öffnet das Popover mit Fokus im Feld; Esc schließt", async ({ page, oeffne }) => {
  await oeffne();
  await neuerTab(page);
  // Grundzustand der Tests: feste Saat an (hilfen.mjs) → Punkt sichtbar; ausschalten → kein Punkt
  assert.equal(await popoverOffen(page), false, "Popover anfangs zu");
  assert.equal(await page.$eval(SAAT, (b) => b.checked), true, "feste Saat in E2E vorbelegt");
  assert.equal(await punktSichtbar(page), true, "Punkt bei fester Saat");
  await oeffneLaufOptionen(page);
  await page.click(SAAT);
  assert.equal(await page.$eval(SAAT, (b) => b.checked), false);
  assert.equal(await punktSichtbar(page), false, "kein Punkt ohne Argumente und ohne feste Saat");
  // Argumente → Punkt; wieder leeren → weg
  await setzeArgs(page, "Mario");
  assert.equal(await punktSichtbar(page), true, "Punkt bei gesetzten Argumenten");
  assert.match(await page.$eval(LAUF_KNOPF, (k) => k.title), /Argumente: Mario/);
  await setzeArgs(page, "");
  assert.equal(await punktSichtbar(page), false, "Punkt weg nach Leeren");
  // feste Saat wieder an → Punkt
  await page.click(SAAT);
  assert.equal(await punktSichtbar(page), true, "Punkt bei fester Saat");
  // Esc schließt, Fokus zurück auf den Knopf
  await page.focus(ARGS);
  await page.keyboard.press("Escape");
  assert.equal(await popoverOffen(page), false, "Esc schließt");
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.testid), "lauf-optionen");
  // Palettenbefehl öffnet das Popover mit Fokus im Feld
  await page.focus("#editor .cm-content");
  await page.keyboard.press("F1");
  await page.waitForSelector('[data-testid="befehlspalette"][open]');
  await page.focus('[data-testid="befehlspalette-eingabe"]');
  await page.keyboard.type("Argumente");
  await schlafe(100);
  const ok = await page.$$eval('[data-testid="befehlspalette-eintrag"]', (e) => {
    const z = e.find((x) => x.textContent.includes("Argumente für hauptgang(args) bearbeiten"));
    if (z) z.click();
    return !!z;
  });
  assert.ok(ok, "Palettenbefehl vorhanden");
  await page.waitForSelector(`${LAUF_POPOVER}:not([hidden])`, { visible: true });
  await page.waitForFunction(() => document.activeElement && document.activeElement.dataset.testid === "argumente");
  // Klick daneben schließt
  await page.click("#editor .cm-content");
  assert.equal(await popoverOffen(page), false, "Klick daneben schließt");
});

// ---------------------------------------------------------------- Vorrat löschen (Befehlspalette)
const PALETTE = '[data-testid="befehlspalette"]';

/** Vorratskammern direkt im Browser anlegen (Format der UI: localStorage praefix+name = {v:1,name,eintraege}). */
function legeVorratAn(page, praefix, namen) {
  return page.evaluate((p, n) => {
    for (const name of n) localStorage.setItem(p + name, JSON.stringify({ v: 1, name, eintraege: [["stand", 7]] }));
  }, praefix, namen);
}
// Alle Vorrats-Schlüssel, auch Kammern mit Namensraum (pizza.vorrat.<raum>/<name>, K-106)
const vorratSchluessel = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => /^pizza\.vorrat(-beispiel)?\.(?:[a-z0-9-]+\/)?[a-z0-9-]+$/.test(k)).sort());

/** Beispiel aus der Galerie öffnen → aktiver Tab hat den Schlüssel bsp:… (Beispiel-Namensraum). */
async function oeffneBeispielTab(page) {
  await zeigePanelTab(page, "beispiele");
  await page.waitForSelector(S.beispielKarte);
  await page.$$eval(S.beispielKarte, (k) => k[0].click());
  await page.waitForFunction((sel) => !/willkommen/.test(document.querySelector(sel).textContent), {}, S.tabAktiv);
}

async function paletteEintraege(page, suche) {
  await page.focus("#editor .cm-content");
  await page.keyboard.press("F1");
  await page.waitForSelector(`${PALETTE}[open]`);
  await page.focus('[data-testid="befehlspalette-eingabe"]');
  await page.keyboard.type(suche);
  await schlafe(100);
  return page.$$eval('[data-testid="befehlspalette-eintrag"]', (e) => e.map((x) => x.textContent.trim()));
}
async function paletteWaehle(page, text) {
  const ok = await page.$$eval('[data-testid="befehlspalette-eintrag"]', (e, t) => {
    const z = e.find((x) => x.textContent.includes(t));
    if (!z) return false;
    z.click();
    return true;
  }, text);
  assert.ok(ok, "Palette-Eintrag „" + text + "“");
}
const infoZeilen = (page) => page.$$eval("#konsole-inhalt .k-info", (z) => z.map((x) => x.textContent));

e2e("Vorrat löschen: Einträge je Kammer des aktiven Namensraums, Rückfrage, exakte Konsolenzeile; Beispiel-Vorräte bleiben", async ({ page, oeffne }) => {
  await oeffne();
  await legeVorratAn(page, "pizza.vorrat.", ["imperium", "kasse"]);
  await legeVorratAn(page, "pizza.vorrat-beispiel.", ["imperium"]);
  // eigener Tab (Willkommen) → eigener Namensraum
  const eintraege = await paletteEintraege(page, "Vorrat");
  assert.ok(eintraege.some((t) => /Vorrat löschen: imperium/.test(t)), eintraege.join(" | "));
  assert.ok(eintraege.some((t) => /Vorrat löschen: kasse/.test(t)));
  assert.ok(eintraege.some((t) => /Alle Vorräte löschen/.test(t)));
  // Einzelne Kammer: Rückfrage abbrechen → bleibt
  await paletteWaehle(page, "Vorrat löschen: kasse");
  await page.waitForSelector("#dialog-frage[open]");
  assert.match(await page.$eval("#dialog-text", (d) => d.textContent), /kasse/);
  await page.$eval('#dialog-frage button[value="nein"]', (k) => k.click());
  await schlafe(150);
  assert.ok((await vorratSchluessel(page)).includes("pizza.vorrat.kasse"), "nach Abbrechen noch da");
  // Einzelne Kammer: bestätigen → weg, exakte Zeile
  await paletteEintraege(page, "Vorrat");
  await paletteWaehle(page, "Vorrat löschen: kasse");
  await page.waitForSelector("#dialog-frage[open]");
  await page.$eval(S.dialogJa, (k) => k.click());
  await page.waitForFunction(() => [...document.querySelectorAll("#konsole-inhalt .k-info")].some((z) => z.textContent.includes("gelöscht")));
  assert.ok((await infoZeilen(page)).includes("Vorrat 'kasse' gelöscht."), (await infoZeilen(page)).join(" | "));
  assert.deepEqual(await vorratSchluessel(page), ["pizza.vorrat-beispiel.imperium", "pizza.vorrat.imperium"]);
  // Alle (eigener Namensraum) → Beispiel-Namensraum bleibt unberührt
  await paletteEintraege(page, "Alle Vorräte");
  await paletteWaehle(page, "Alle Vorräte löschen");
  await page.waitForSelector("#dialog-frage[open]");
  await page.$eval(S.dialogJa, (k) => k.click());
  await page.waitForFunction(() => [...document.querySelectorAll("#konsole-inhalt .k-info")].some((z) => z.textContent === "Alle Vorräte gelöscht."));
  assert.deepEqual(await vorratSchluessel(page), ["pizza.vorrat-beispiel.imperium"], "Beispiel-Vorrat bleibt");
  // Ohne Kammern keine Einträge mehr
  const leer = await paletteEintraege(page, "Vorrat löschen");
  assert.ok(!leer.some((t) => /Vorrat löschen: /.test(t) || /Alle Vorräte löschen/.test(t)), leer.join(" | "));
  await page.keyboard.press("Escape");
});

e2e("Vorrat löschen im Beispiel-Tab: nur der Beispiel-Namensraum wird angeboten und gelöscht", async ({ page, oeffne }) => {
  await oeffne();
  await legeVorratAn(page, "pizza.vorrat.", ["imperium"]);
  await legeVorratAn(page, "pizza.vorrat-beispiel.", ["imperium", "demo"]);
  // Beispiel öffnen → Tab mit Schlüssel bsp:… → Beispiel-Namensraum
  await oeffneBeispielTab(page);
  const eintraege = await paletteEintraege(page, "Vorrat löschen");
  assert.ok(eintraege.some((t) => /Vorrat löschen: demo/.test(t)), "Beispiel-Kammer angeboten: " + eintraege.join(" | "));
  await paletteWaehle(page, "Alle Vorräte löschen");
  await page.waitForSelector("#dialog-frage[open]");
  assert.match(await page.$eval("#dialog-text", (d) => d.textContent), /Beispiele/, "Rückfrage nennt den Beispiel-Namensraum");
  await page.$eval(S.dialogJa, (k) => k.click());
  await page.waitForFunction(() => [...document.querySelectorAll("#konsole-inhalt .k-info")].some((z) => z.textContent === "Alle Vorräte gelöscht."));
  assert.deepEqual(await vorratSchluessel(page), ["pizza.vorrat.imperium"], "eigener Vorrat bleibt, Beispiel-Vorräte weg");
});

// ---------------------------------------------------------------- Namensraum (K-106): Kammer gehört dem Programm, nicht dem Tab
const NAMENSRAUM_CODE = [
  'Vorratskammer a = neu Vorratskammer("stand", namensraum: "e2e-spiel");',
  'Vorratskammer b = neu Vorratskammer("lokal");',
  'a.lege("x", a.hole("x", 0) + 1);',
  'b.lege("y", 2);',
  'Bote.sage(("Raum: " + a.namensraum() + " Name: " + a.name() + " x=" + a.hole("x")));',
].join("\n");

e2e("Vorrat mit Namensraum im Beispiel-Tab: Kammer landet unter pizza.vorrat.<raum>/<name>, Kammer ohne Namensraum weiter unter pizza.vorrat-beispiel.", async ({ page, oeffne }) => {
  await oeffne();
  await oeffneBeispielTab(page);
  await setzeCode(page, NAMENSRAUM_CODE); // Schlüssel bsp:… bleibt beim Bearbeiten erhalten
  assert.equal(await backenUndAusgabe(page), "Raum: e2e-spiel Name: stand x=1\n");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
  assert.deepEqual(await vorratSchluessel(page), ["pizza.vorrat-beispiel.lokal", "pizza.vorrat.e2e-spiel/stand"]);
  const kammer = await page.evaluate(() => JSON.parse(localStorage.getItem("pizza.vorrat.e2e-spiel/stand")));
  assert.deepEqual(kammer, { v: 1, name: "e2e-spiel/stand", eintraege: [["x", 1]] }, "Serialisierung trägt die Kennung");
  // Zweiter Lauf im selben Tab liest den Stand wieder ein (ohne ereignisseLeeren, das den Vorrat wegräumt)
  await page.focus("#editor .cm-content");
  await strg(page, "Enter");
  await warteLaufEnde(page);
  assert.equal(await konsolenAusgabe(page), "Raum: e2e-spiel Name: stand x=2\n");
  // Eigener Tab (Willkommen) sieht dieselbe Kammer mit Namensraum, nicht aber die Beispiel-Kammer „lokal“
  await page.$$eval(S.tab, (t) => t.find((x) => x.querySelector(".etab-name").textContent === "willkommen.pizza").querySelector(".etab-knopf").click());
  await warteAufTabMuster(page, "willkommen.pizza");
  await setzeCode(page, [
    'Vorratskammer a = neu Vorratskammer("stand", namensraum: "e2e-spiel");',
    'Vorratskammer b = neu Vorratskammer("lokal");',
    'Bote.sage(("x=" + a.hole("x", 0) + " y=" + b.hole("y", 0)));',
  ].join("\n"));
  await page.focus("#editor .cm-content");
  await strg(page, "Enter");
  await warteLaufEnde(page);
  assert.equal(await konsolenAusgabe(page), "x=2 y=0\n", "Namensraum-Kammer geteilt, Beispiel-Kammer getrennt");
});

e2e("Vorrat löschen mit Namensraum: Kennung raum/name in jedem Tab angeboten, Löschen trifft pizza.vorrat.<raum>/<name>; „Alle“ im Beispiel-Tab nimmt die Namensraum-Kammern mit", async ({ page, oeffne }) => {
  await oeffne();
  await legeVorratAn(page, "pizza.vorrat.", ["imperium", "e2e-raum/stand"]);
  await legeVorratAn(page, "pizza.vorrat-beispiel.", ["demo"]);
  // ungültige Kennungen (zwei „/“, „..“) werden nie angeboten
  await page.evaluate(() => { localStorage.setItem("pizza.vorrat.a/b/c", "{}"); localStorage.setItem("pizza.vorrat.../x", "{}"); });
  // Eigener Tab: eigene Kammer + Namensraum-Kammer
  let eintraege = await paletteEintraege(page, "Vorrat löschen");
  assert.ok(eintraege.some((t) => /Vorrat löschen: e2e-raum\/stand/.test(t)), "Namensraum-Kammer im eigenen Tab: " + eintraege.join(" | "));
  assert.ok(eintraege.some((t) => /Vorrat löschen: imperium/.test(t)));
  assert.ok(!eintraege.some((t) => /Vorrat löschen: demo/.test(t)), "Beispiel-Kammer nicht im eigenen Tab");
  assert.ok(!eintraege.some((t) => /a\/b\/c|\.\.\//.test(t)), "ungültige Kennungen nicht angeboten");
  await page.keyboard.press("Escape");
  // Beispiel-Tab: Beispiel-Kammer + Namensraum-Kammer, nicht die eigene
  await oeffneBeispielTab(page);
  eintraege = await paletteEintraege(page, "Vorrat löschen");
  assert.ok(eintraege.some((t) => /Vorrat löschen: e2e-raum\/stand/.test(t)), "Namensraum-Kammer im Beispiel-Tab: " + eintraege.join(" | "));
  assert.ok(eintraege.some((t) => /Vorrat löschen: demo/.test(t)));
  assert.ok(!eintraege.some((t) => /Vorrat löschen: imperium/.test(t)), "eigene Kammer nicht im Beispiel-Tab");
  // Einzeln löschen aus dem Beispiel-Tab → pizza.vorrat.e2e-raum/stand weg, exakte Zeile mit Kennung
  await paletteWaehle(page, "Vorrat löschen: e2e-raum/stand");
  await page.waitForSelector("#dialog-frage[open]");
  assert.match(await page.$eval("#dialog-text", (d) => d.textContent), /e2e-raum\/stand/);
  await page.$eval(S.dialogJa, (k) => k.click());
  await page.waitForFunction(() => [...document.querySelectorAll("#konsole-inhalt .k-info")].some((z) => z.textContent.includes("gelöscht")));
  assert.ok((await infoZeilen(page)).includes("Vorrat 'e2e-raum/stand' gelöscht."), (await infoZeilen(page)).join(" | "));
  assert.deepEqual(await vorratSchluessel(page), ["pizza.vorrat-beispiel.demo", "pizza.vorrat.imperium"]);
  // „Alle“ im Beispiel-Tab: Beispiel-Kammern und alle Namensraum-Kammern, die eigene bleibt
  await legeVorratAn(page, "pizza.vorrat.", ["e2e-raum/stand", "anderer-raum/x"]);
  await paletteEintraege(page, "Alle Vorräte");
  await paletteWaehle(page, "Alle Vorräte löschen");
  await page.waitForSelector("#dialog-frage[open]");
  const text = await page.$eval("#dialog-text", (d) => d.textContent);
  assert.match(text, /Beispiele/, "Rückfrage nennt die Beispiele");
  assert.match(text, /Namensraum/, "Rückfrage nennt die Namensraum-Kammern");
  await page.$eval(S.dialogJa, (k) => k.click());
  await page.waitForFunction(() => [...document.querySelectorAll("#konsole-inhalt .k-info")].some((z) => z.textContent === "Alle Vorräte gelöscht."));
  assert.deepEqual(await vorratSchluessel(page), ["pizza.vorrat.imperium"], "eigener Vorrat bleibt; Beispiel- und Namensraum-Kammern weg");
  // ungültige Schlüssel wurden nicht angefasst (sie gehören der UI nicht)
  assert.equal(await page.evaluate(() => localStorage.getItem("pizza.vorrat.a/b/c")), "{}");
});
