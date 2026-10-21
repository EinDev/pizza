// Teilen als App: der Teilen-Dialog liefert zwei Links zum selben Schlüssel – „Code öffnen“ (#h=<key>, Playground)
// und „App starten“ (#app=<key>, Vollbild ohne Editor). Der App-Link zeigt bis zum Start nur einen Ladebalken,
// kompiliert zur Laufzeit (Motor Auto) und startet sofort: Theke füllt das Fenster, Konsolenprogramme bekommen
// eine Vollbild-Konsole mit Eingabe. Am Ende: Ausgabe + „Nochmal“ / „Code ansehen“. Teilen-API = Attrappe in server.mjs.
import assert from "node:assert/strict";
import {
  e2e, setzeCode, bereit, editorText, editorTabs, aktiverTabName, sendeEingabe, thekeEreignis, warteAufBediene, schlafe, SCHMAL, DESKTOP,
} from "../hilfen.mjs";
import { verpacke, entpacke } from "../../ui/src/teilen.js";

/** Zwischenablage abfangen (headless ohne Berechtigung): alles, was geschrieben wird, landet in window.__kopiert. */
const ZWISCHENABLAGE = () => {
  window.__kopiert = [];
  try {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__kopiert.push(String(t)); } } });
  } catch (e) { /* egal */ }
};

/** Keine Doku-Daten im App-Modus (js/doku/*.js nur im Playground). */
const dokuGeladen = (page) => page.evaluate(() => ({
  angefragt: performance.getEntriesByType("resource").filter((e) => /\/js\/doku\//.test(e.name)).length,
  daten: Array.isArray(self.PIZZA_DOKU) ? self.PIZZA_DOKU.length : 0,
}));

const KONSOLE_APP = [
  'Vorratskammer v = neu Vorratskammer("app-test");',
  'salami besuche = v.hole("besuche", 0) + 1;',
  'v.lege("besuche", besuche);',
  'margherita name = Bestellannahme.frage(("Wie heißt du? "));',
  'Bote.sage(("Ciao " + name + "! Besuch Nr. " + besuche));',
].join("\n");

const THEKE_APP = [
  'Theke theke = neu Theke("Mini-App", breite: 300, hoehe: 160);',
  "salami n = 0;",
  'Schild s = neu Schild("0", id: "zahl");',
  'Knopf plus = neu Knopf("Mehr", () -> { n++; s.setzeText(("" + n)); }, id: "plus");',
  'Knopf fertig = neu Knopf("Fertig", () -> { theke.schliesse(); }, id: "fertig");',
  "theke.zeige(neu Stapel([s, neu Reihe([plus, fertig])]));",
  "theke.bediene();",
  'Bote.sage(("Gezählt: " + n));',
].join("\n");

/** Hält fest, was beim ersten Zeichnen sichtbar ist (DOMContentLoaded, vor app.bundle.js). */
const ERSTER_EINDRUCK = () => {
  document.addEventListener("DOMContentLoaded", () => {
    const sichtbar = (sel) => { const e = document.querySelector(sel); return !!(e && e.getClientRects().length); };
    window.__ersterEindruck = { kopf: sichtbar(".kopf"), arbeitsbereich: sichtbar(".arbeitsbereich"), lade: sichtbar("#app-lade") };
  }, { once: true });
};

const sichtbar = (page, sel) => page.$eval(sel, (e) => !!e.getClientRects().length && !e.closest("[hidden]")).catch(() => false);
const warteEnde = (page, timeout = 20_000) => page.waitForSelector("#app-ende:not([hidden])", { timeout });
const konsolenText = (page) => page.$eval("#konsole-inhalt", (k) => k.innerText);

/** Dezentes X oben rechts: sichtbar, bedienbar groß, verdeckt keinen Theke-Inhalt. */
async function pruefeX(page, vp, minGroesse = 28) {
  const m = await page.evaluate(() => {
    const box = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const x = document.getElementById("vorschau-schliessen");
    return { x: box(x), inhalt: box(document.getElementById("vorschau-inhalt")), label: x.getAttribute("aria-label"), titel: x.title };
  });
  assert.ok(m.x.w >= minGroesse && m.x.h >= minGroesse, "X groß genug: " + JSON.stringify(m.x));
  assert.ok(m.x.r <= vp.width && m.x.r >= vp.width - 12 && m.x.t >= 0 && m.x.t <= 8, "X oben rechts: " + JSON.stringify(m.x));
  assert.ok(m.inhalt.t >= m.x.b - 0.5, "Theke-Inhalt beginnt unter dem X (nichts verdeckt): " + JSON.stringify(m));
  assert.equal(m.inhalt.b, vp.height, "Inhalt bis zum unteren Rand");
  assert.equal(m.label, "App beenden");
}

async function pruefeKeinPlayground(page) {
  const z = await page.evaluate(() => ({
    editor: !!document.querySelector(".cm-editor"),
    kopf: !!document.querySelector(".kopf").getClientRects().length,
    panel: !!document.querySelector("#panel").getClientRects().length,
    tabs: document.querySelectorAll("#editor-tabs [data-testid='editor-tab']").length,
    modus: document.documentElement.dataset.app || null,
  }));
  assert.equal(z.editor, false, "kein Editor im App-Modus");
  assert.equal(z.kopf, false, "keine Kopfzeile");
  assert.equal(z.panel, false, "kein Seitenpanel");
  assert.equal(z.tabs, 0, "keine Editor-Tabs");
  assert.ok(z.modus, "data-app gesetzt");
}

e2e("Teilen: Dialog zeigt zwei Links (App starten / Code öffnen) zum selben Schlüssel, App-Link in der Zwischenablage, Tab-Name gespeichert", { vorLaden: ZWISCHENABLAGE }, async ({ page, oeffne, neueSeite, server, basis }) => {
  server.teilen.modus = "mock";
  await oeffne();
  const code = 'Bote.sage(("Hallo aus der App"));';
  await setzeCode(page, code);
  const tabName = await aktiverTabName(page);
  await page.click("#knopf-teilen");
  await page.waitForSelector("#dialog-teilen[open]");
  assert.match(await page.$eval("#dialog-teilen", (d) => d.innerText), /zwei Links/);
  await page.click("#teilen-senden");
  await page.waitForFunction(() => !document.querySelector('#dialog-teilen [data-schritt="fertig"]').hidden, { timeout: 5000 });
  const codeUrl = await page.$eval("#teilen-url", (i) => i.value);
  const appUrl = await page.$eval('[data-testid="teilen-url-app"]', (i) => i.value);
  const key = /#h=([A-Za-z0-9_-]+)$/.exec(codeUrl)[1];
  assert.equal(codeUrl, basis + "#h=" + key);
  assert.equal(appUrl, basis + "#app=" + key, "App-Link: gleicher Schlüssel, #app=");
  // ein Dokument: Code + Tab-Name in einer kleinen JSON-Hülle
  assert.equal(server.teilen.ablage.size, 1, "nur einmal gespeichert");
  assert.deepEqual(JSON.parse(server.teilen.ablage.get(key)), { pizza: "teilen", v: 1, name: tabName, code });
  const text = await page.$eval("#dialog-teilen", (d) => d.innerText);
  assert.match(text, /Code öffnen/);
  assert.match(text, /App starten/);
  assert.ok(text.indexOf("App starten") < text.indexOf("Code öffnen"), "App-Link steht oben");
  // App-Link automatisch kopiert (nicht der Code-Link)
  assert.deepEqual(await page.evaluate(() => window.__kopiert), [appUrl], "App-Link in der Zwischenablage");
  assert.match(await page.$eval("#teilen-fertig-text", (e) => e.textContent), /App-Link ist schon in der Zwischenablage/);
  assert.equal(await page.$eval('[data-testid="teilen-kopieren-app"]', (b) => b.textContent), "Kopiert ✓");
  assert.equal(await page.$eval('[data-testid="teilen-kopieren"]', (b) => b.textContent), "Kopieren");
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "teilen-url-app");
  assert.ok(await sichtbar(page, '[data-testid="teilen-kopieren"]'), "eigener Kopieren-Knopf für den Code-Link");
  await page.click('[data-testid="teilen-kopieren"]');
  await page.waitForFunction(() => /Kopiert/.test(document.querySelector('[data-testid="teilen-kopieren"]').textContent));
  assert.deepEqual(await page.evaluate(() => window.__kopiert), [appUrl, codeUrl]);

  // Code-Link: Playground mit Editor, Tab heißt wie beim Teilen
  const p1 = await neueSeite();
  await p1.goto(codeUrl, { waitUntil: "load" });
  await bereit(p1);
  await p1.waitForFunction(() => /Hallo aus der App/.test(document.querySelector("#editor .cm-content").textContent), { timeout: 5000 });
  assert.equal(await editorText(p1), code);
  const stamm = tabName.replace(/\.pizza$/, "");
  const name1 = await aktiverTabName(p1);
  assert.ok(name1 === tabName || name1.startsWith(stamm), "Tab-Name aus dem Link: " + name1);
  assert.doesNotMatch(name1, /^Geteilt /);

  // App-Link: direkt die Ausgabe, kein Editor, Titel = Tab-Name
  const p2 = await neueSeite();
  await p2.goto(appUrl, { waitUntil: "load" });
  await warteEnde(p2);
  assert.match(await konsolenText(p2), /Hallo aus der App/);
  await pruefeKeinPlayground(p2);
  assert.equal(await p2.title(), stamm);
});

e2e("App-Link mit Tab-Name: Seitentitel = Name, kein „Saat:“, keine Doku-Daten geladen; Code-Link öffnet Tab mit dem Namen", async ({ page, neueSeite, server, basis }) => {
  server.teilen.ablage.set("benannt", verpacke("zahlenraten.pizza", 'Bote.sage(("Rate mal"));'));
  await page.goto(basis + "#app=benannt", { waitUntil: "load" });
  await warteEnde(page);
  assert.equal(await page.title(), "zahlenraten");
  const t = await konsolenText(page);
  assert.match(t, /Rate mal/);
  assert.doesNotMatch(t, /Saat/, "kein „Saat: N“ im App-Modus");
  assert.equal(await page.$$eval('[data-testid="konsole-saat"]', (z) => z.length), 0);
  assert.deepEqual(await dokuGeladen(page), { angefragt: 0, daten: 0 }, "Doku-Skripte nur im Playground");
  assert.equal(await sichtbar(page, "#vorschau-schliessen"), false, "Konsolen-App: kein X");

  const p2 = await neueSeite();
  await p2.goto(basis + "#h=benannt", { waitUntil: "load" });
  await bereit(p2);
  await p2.waitForFunction(() => /Rate mal/.test(document.querySelector("#editor .cm-content").textContent), { timeout: 5000 });
  assert.equal(await aktiverTabName(p2), "zahlenraten.pizza");
  assert.equal(entpacke(server.teilen.ablage.get("benannt")).name, "zahlenraten.pizza");
  // Im Playground ist die Doku da
  const d = await dokuGeladen(p2);
  assert.ok(d.angefragt >= 4 && d.daten > 0, "Doku im Playground: " + JSON.stringify(d));
});

e2e("App-Link, Konsole: nur Ladebalken bis zum Start, interaktive Eingabe, Vorrat, Nochmal, Code ansehen", { vorLaden: ERSTER_EINDRUCK }, async ({ page, server, basis }) => {
  server.teilen.ablage.set("konsoleapp", KONSOLE_APP);
  await page.goto(basis + "#app=konsoleapp", { waitUntil: "load" });
  assert.deepEqual(await page.evaluate(() => window.__ersterEindruck), { kopf: false, arbeitsbereich: false, lade: true }, "erst nur der Ladebalken");
  await page.waitForSelector('[data-testid="konsole-eingabe"]:not([hidden])', { timeout: 20_000 });
  assert.equal(await sichtbar(page, "#app-lade"), false, "Ladebalken weg, sobald die App läuft");
  await pruefeKeinPlayground(page);
  // Konsole füllt das Fenster
  const box = await page.$eval("#konsole", (k) => { const r = k.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  assert.ok(box.w >= DESKTOP.width - 1 && box.h >= DESKTOP.height - 80, "Vollbild-Konsole: " + JSON.stringify(box));
  assert.match(await konsolenText(page), /Wie heißt du\?/);
  assert.doesNotMatch(await konsolenText(page), /Saat/, "kein „Saat: N“ im App-Modus");
  assert.equal(await page.title(), "pizza-App", "alter Link (nur Code, ohne Namen) läuft weiter");
  // Motor Auto: genau ein motor-Ereignis
  assert.equal(await page.evaluate(() => window.__ereignisse.filter((e) => e.typ === "motor").length), 1);

  await sendeEingabe(page, "Luigi", { tippen: true });
  await warteEnde(page);
  assert.match(await konsolenText(page), /Ciao Luigi! Besuch Nr\. 1/);
  assert.match(await page.$eval("#app-ende-text", (e) => e.textContent), /beendet/);
  assert.ok(await sichtbar(page, "#app-nochmal"));
  assert.ok(await sichtbar(page, "#app-code"));
  // Vorrat: gleiche Kammern wie geteilte Tabs im Playground
  const kammer = await page.evaluate(() => JSON.parse(localStorage.getItem("pizza.vorrat.app-test")));
  assert.deepEqual(kammer && kammer.eintraege, [["besuche", 1]]);

  // Nochmal: neuer Lauf, Spielstand zählt weiter
  await page.click("#app-nochmal");
  await page.waitForSelector('[data-testid="konsole-eingabe"]:not([hidden])', { timeout: 20_000 });
  assert.equal(await sichtbar(page, "#app-ende"), false, "Endleiste während des Laufs weg");
  assert.doesNotMatch(await konsolenText(page), /Luigi/, "Konsole neu");
  await sendeEingabe(page, "Mario");
  await warteEnde(page);
  assert.match(await konsolenText(page), /Ciao Mario! Besuch Nr\. 2/);

  // Code ansehen → Playground mit dem Code (Code-Link)
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#app-code")]);
  await bereit(page);
  assert.match(page.url(), /#h=konsoleapp$/);
  await page.waitForFunction(() => /Bestellannahme/.test(document.querySelector("#editor .cm-content").textContent), { timeout: 5000 });
  assert.equal(await editorText(page), KONSOLE_APP);
  assert.ok((await editorTabs(page)).some((t) => /konsoleapp/.test(t.name)));
});

e2e("App-Link, Theke: füllt das ganze Fenster, Titel = Fenstertitel, am Ende Ausgabe + Knöpfe", async ({ page, server, basis }) => {
  server.teilen.ablage.set("thekeapp", THEKE_APP);
  await page.goto(basis + "#app=thekeapp", { waitUntil: "load" });
  await page.waitForSelector("#vorschau:not([hidden]) [data-theke-id='plus']", { timeout: 20_000 });
  await warteAufBediene(page, 0);
  await schlafe(50);
  assert.equal(await sichtbar(page, "#app-lade"), false, "Ladebalken weg");
  await pruefeKeinPlayground(page);
  assert.equal(await page.title(), "Mini-App");
  const r = await page.$eval("#vorschau", (f) => { const b = f.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  assert.deepEqual(r, { x: 0, y: 0, w: DESKTOP.width, h: DESKTOP.height }, "Theke füllt das Fenster");
  assert.equal(await sichtbar(page, "#vorschau-titel"), false, "keine eigene Titelleiste, nur ein dezentes X");
  await pruefeX(page, DESKTOP);
  assert.deepEqual(await dokuGeladen(page), { angefragt: 0, daten: 0 }, "Doku-Skripte nur im Playground");
  assert.equal(await sichtbar(page, "#konsole"), false, "keine Konsole neben der Theke");
  // Bedienen
  for (let i = 0; i < 2; i++) {
    const vorher = await page.evaluate(() => window.__ereignisse.filter((e) => e.typ === "ui-warte").length);
    await thekeEreignis(page, { typ: "klick", id: "plus" });
    await warteAufBediene(page, vorher);
  }
  await page.waitForFunction(() => document.querySelector("#vorschau [data-theke-id='zahl']").textContent === "2", { timeout: 5000 });
  await thekeEreignis(page, { typ: "klick", id: "fertig" });
  await warteEnde(page);
  assert.equal(await sichtbar(page, "#vorschau"), false, "Fenster zu nach Programmende");
  assert.match(await konsolenText(page), /Gezählt: 2/);
  assert.equal(await page.evaluate(() => sessionStorage.getItem("pizza.vorschau")), null, "Vollbild merkt keine Fenstergröße für den Playground");
  assert.ok(await sichtbar(page, "#app-nochmal"));
  // Nochmal startet die Theke erneut
  await page.click("#app-nochmal");
  await page.waitForSelector("#vorschau:not([hidden]) [data-theke-id='zahl']", { timeout: 20_000 });
  assert.equal(await page.$eval("#vorschau [data-theke-id='zahl']", (e) => e.textContent), "0");
});

e2e("App-Link, Theke auf dem Handy (390×844): Vollbild, keine Scrollbar", { viewport: SCHMAL, farbschema: "dark" }, async ({ page, server, basis }) => {
  server.teilen.ablage.set("thekemobil", THEKE_APP);
  await page.goto(basis + "#app=thekemobil", { waitUntil: "load" });
  await page.waitForSelector("#vorschau:not([hidden]) [data-theke-id='plus']", { timeout: 20_000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark", "Thema folgt dem System");
  const m = await page.evaluate(() => {
    const b = document.getElementById("vorschau").getBoundingClientRect();
    return { w: b.width, h: b.height, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  });
  assert.equal(m.w, 390);
  assert.equal(m.h, 844);
  assert.ok(m.sw <= m.cw, "keine horizontale Scrollbar");
  await pruefeX(page, SCHMAL, 40);
});

for (const [name, opt] of [["Desktop hell", {}], ["Handy dunkel", { viewport: SCHMAL, farbschema: "dark" }]]) {
  e2e(`App-Link, Theke (${name}): X beendet wie das Schließen des EXE-Fensters (geschlossen), dann Nochmal/Code ansehen`, opt, async ({ page, server, basis }) => {
    server.teilen.ablage.set("thekezu", verpacke("mini.pizza", THEKE_APP));
    await page.goto(basis + "#app=thekezu", { waitUntil: "load" });
    await page.waitForSelector("#vorschau:not([hidden]) [data-theke-id='plus']", { timeout: 20_000 });
    await warteAufBediene(page, 0);
    assert.equal(await page.title(), "Mini-App", "Theke-App behält den Fenstertitel");
    const vorher = await page.evaluate(() => window.__ereignisse.filter((e) => e.typ === "ui-warte").length);
    await thekeEreignis(page, { typ: "klick", id: "plus" });
    await warteAufBediene(page, vorher);
    await page.click("#vorschau-schliessen");
    await warteEnde(page);
    // bediene() kehrt nach {typ:"geschlossen"} zurück, das Programm läuft zu Ende wie nativ
    assert.match(await konsolenText(page), /Gezählt: 1/);
    assert.equal(await sichtbar(page, "#vorschau"), false, "Fenster zu");
    assert.equal(await sichtbar(page, "#vorschau-schliessen"), false, "X weg");
    assert.match(await page.$eval("#app-ende-text", (e) => e.textContent), /Programm beendet\.$/);
    assert.ok(await sichtbar(page, "#app-nochmal"));
    assert.ok(await sichtbar(page, "#app-code"));
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(m.sw <= m.cw, "keine horizontale Scrollbar");
    await page.click("#app-nochmal");
    await page.waitForSelector("#vorschau:not([hidden]) [data-theke-id='zahl']", { timeout: 20_000 });
    assert.ok(await sichtbar(page, "#vorschau-schliessen"), "X wieder da");
  });
}

e2e("App-Link: unbekannter Schlüssel → klare Meldung, kein Editor", { erlaubt: [/api\/teilen/, /status of 404/] }, async ({ page, basis }) => {
  await page.goto(basis + "#app=gibtsnicht", { waitUntil: "load" });
  await warteEnde(page);
  assert.match(await page.$eval("#app-ende-text", (e) => e.textContent), /gibt es nicht/);
  assert.equal(await sichtbar(page, "#app-nochmal"), false);
  assert.equal(await sichtbar(page, "#app-code"), false);
  await pruefeKeinPlayground(page);
});

e2e("App-Link: Laufzeitfehler wird angezeigt", async ({ page, server, basis }) => {
  server.teilen.ablage.set("fehlerapp", 'Bote.sage(("vorher"));\nsalami x = 1 / 0;\nBote.sage(("nachher"));');
  await page.goto(basis + "#app=fehlerapp", { waitUntil: "load" });
  await warteEnde(page);
  const t = await konsolenText(page);
  assert.match(t, /vorher/);
  assert.match(t, /RechenAnanas/);
  assert.doesNotMatch(t, /nachher/);
  assert.match(await page.$eval("#app-ende-text", (e) => e.textContent), /Exit-Code 1/);
});
