// Teilen (#code=, Hastebin-Attrappe), Hell/Dunkel, schmaler Viewport (390×844).
import assert from "node:assert/strict";
import {
  e2e, setzeCode, editorText, editorTabs, aktiverTabName, warteAufTab, bereit, backen, konsolenAusgabe,
  zeigePanelTab, panelOffen, strg, schlafe, S, SCHMAL, umgebung,
} from "../hilfen.mjs";

const CODE = '// geteilt ✓ Ümlaute & Emoji 🍕\nBote.sage(("aus dem Link"));';

/** u.-Kodierung (rohes UTF-8, base64url) – vom Decoder der UI unterstützt. */
const uKodiert = (code) => "u." + Buffer.from(code, "utf8").toString("base64url");

e2e("Teilen-Link #code=u.… öffnet als eigener Tab, vorhandene Tabs bleiben", async ({ page, oeffne }) => {
  await oeffne("#code=" + uKodiert(CODE));
  await warteAufTab(page, "geteilt.pizza");
  assert.equal(await editorText(page), CODE);
  const tabs = await editorTabs(page);
  assert.ok(tabs.some((t) => t.name === "willkommen.pizza"), "Willkommens-Tab bleibt");
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "aus dem Link\n");
});

e2e("Teilen-Link #code=z.… (deflate) und hashchange zur Laufzeit", async ({ page, oeffne }) => {
  await oeffne();
  const z = await page.evaluate(async (code) => {
    const strom = new Blob([new TextEncoder().encode(code)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const b = new Uint8Array(await new Response(strom).arrayBuffer());
    let bin = ""; for (const x of b) bin += String.fromCharCode(x);
    return "z." + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }, CODE);
  await page.evaluate((h) => { location.hash = h; }, "#code=" + z);
  await warteAufTab(page, "geteilt.pizza");
  assert.equal(await editorText(page), CODE);
});

e2e("Kaputter Teilen-Link → freundliche Meldung, kein Absturz", async ({ page, oeffne }) => {
  await oeffne("#code=z.%%%kaputt");
  await page.waitForFunction(() => /beschädigt/.test(document.getElementById("toast").textContent), { timeout: 5000 });
  assert.equal(await aktiverTabName(page), "willkommen.pizza");
});

e2e("Teilen-Dialog: „Link ohne Server“ erzeugt #code=-Link, der in neuem Fenster denselben Code öffnet", async ({ page, oeffne, neueSeite, basis }) => {
  await oeffne();
  await setzeCode(page, CODE);
  await page.click("#knopf-teilen");
  await page.waitForSelector("#dialog-teilen[open]");
  // Senden ist bewusst NICHT vorausgewählt
  assert.equal(await page.evaluate(() => document.activeElement.id), "teilen-abbrechen");
  await page.click("#teilen-lokal");
  await page.waitForFunction(() => !document.querySelector('[data-schritt="fertig"]').hidden);
  const url = await page.$eval("#teilen-url", (i) => i.value);
  assert.match(url, /#code=(z|u)\./);
  assert.ok(url.startsWith(basis));
  await page.click("#teilen-schliessen");
  const p2 = await neueSeite();
  await p2.goto(url, { waitUntil: "load" });
  await bereit(p2);
  await warteAufTab(p2, "geteilt.pizza");
  assert.equal(await editorText(p2), CODE);
});

e2e("Teilen über Hastebin (Attrappe): #h=-Link lädt den Code wieder", async ({ page, oeffne, neueSeite, server }) => {
  server.teilen.modus = "mock";
  await oeffne();
  await setzeCode(page, CODE);
  await page.click("#knopf-teilen");
  await page.waitForSelector("#dialog-teilen[open]");
  await page.click("#teilen-senden");
  await page.waitForFunction(() => !document.querySelector('[data-schritt="fertig"]').hidden, { timeout: 5000 });
  const url = await page.$eval("#teilen-url", (i) => i.value);
  assert.match(url, /#h=e2e\w+$/);
  const p2 = await neueSeite();
  await p2.goto(url, { waitUntil: "load" });
  await bereit(p2);
  await p2.waitForFunction((sel) => /^Geteilt e2e/.test(document.querySelector(sel).textContent), { timeout: 5000 }, S.tabAktiv);
  assert.equal(await editorText(p2), CODE);
});

e2e("Teilen über Hastebin nicht eingerichtet (503) → Fehlerschritt mit „Link ohne Server“", {
  erlaubt: [/api\/teilen/, /status of 503/],
}, async ({ page, oeffne, server }) => {
  server.teilen.modus = "aus";
  try {
    await oeffne();
    await page.click("#knopf-teilen");
    await page.waitForSelector("#dialog-teilen[open]");
    await page.click("#teilen-senden");
    await page.waitForFunction(() => !document.querySelector('[data-schritt="fehler"]').hidden, { timeout: 5000 });
    assert.match(await page.$eval("#teilen-fehlertext", (e) => e.textContent), /nicht eingerichtet/);
    await page.click("#teilen-fehler-lokal");
    await page.waitForFunction(() => !document.querySelector('[data-schritt="fertig"]').hidden);
    assert.match(await page.$eval("#teilen-url", (i) => i.value), /#code=/);
  } finally {
    server.teilen.modus = "mock";
  }
});

e2e("Hell/Dunkel: Umschalter wechselt Thema, Editor & Meta, merkt es sich", async ({ page, oeffne }) => {
  await oeffne();
  const zustand = () => page.evaluate(() => ({
    thema: document.documentElement.dataset.theme,
    label: document.getElementById("knopf-thema").getAttribute("aria-label"),
    bg: getComputedStyle(document.body).backgroundColor,
    cmDunkel: !!document.querySelector("#editor .cm-editor.cm-dark, #editor .cm-editor[class*='dark']") ||
      getComputedStyle(document.querySelector("#editor .cm-editor")).colorScheme === "dark",
    meta: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content),
    gemerkt: localStorage.getItem("pizza.thema"),
  }));
  const hell = await zustand();
  assert.equal(hell.thema, "light");
  assert.match(hell.label, /Dunkles Thema/);
  await page.click("#knopf-thema");
  const dunkel = await zustand();
  assert.equal(dunkel.thema, "dark");
  assert.match(dunkel.label, /Helles Thema/);
  assert.notEqual(dunkel.bg, hell.bg, "Hintergrund ändert sich");
  assert.ok(dunkel.meta.every((m) => m === "#16171a"));
  assert.equal(dunkel.gemerkt, "dark");
  await page.reload({ waitUntil: "load" });
  await bereit(page);
  assert.equal((await zustand()).thema, "dark", "bleibt nach Reload dunkel");
  await page.click("#knopf-thema");
  assert.equal((await zustand()).thema, "light");
});

e2e("Systemeinstellung dunkel → startet dunkel (ohne gemerkte Wahl)", { farbschema: "dark" }, async ({ page, oeffne }) => {
  await oeffne();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
});

/** Prüft auf horizontale Seiten-Scrollbar; Befunde werden gesammelt (Test läuft weiter, Assert am Ende). */
async function keineHorizontaleScrollbar(page, wo, befunde) {
  const m = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    // Verursacher suchen: Elemente, deren Box oder Inhalt über den rechten Rand hinausragt, ohne dass ein Vorfahr clippt
    const clippt = (e) => { for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) if (getComputedStyle(a).overflowX !== "visible") return true; return false; };
    const breit = [...document.querySelectorAll("body *")].filter((e) => {
      if (getComputedStyle(e).position === "fixed" || clippt(e)) return false;
      const r = e.getBoundingClientRect();
      return r.right > cw + 0.5 || e.scrollWidth > Math.max(e.clientWidth, r.width) + 0.5 && getComputedStyle(e).overflowX === "visible" && r.right + (e.scrollWidth - r.width) > cw + 0.5;
    }).slice(0, 5).map((e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + String(e.className).split(" ").join("."));
    return { sw: document.documentElement.scrollWidth, cw, iw: window.innerWidth, breit };
  });
  if (!(m.sw <= m.cw && m.iw <= m.cw)) befunde.push(`${wo}: Seite ist breiter als der Viewport (scrollWidth ${m.sw}, innerWidth ${m.iw}, clientWidth ${m.cw}) – Verursacher: ${m.breit.join(", ") || "? (evtl. Pseudo-Element, z. B. .trenner::before mit inset:-5px)"}`);
}

e2e("Schmaler Viewport 390×844: Panel als Sheet, keine horizontale Scrollbar", { viewport: SCHMAL }, async ({ page, oeffne }) => {
  const befunde = [];
  await oeffne();
  assert.equal(await panelOffen(page), false, "Panel auf dem Handy anfangs zu");
  await keineHorizontaleScrollbar(page, "Start", befunde);
  // Backen geht auch mobil
  await backen(page);
  assert.match(await konsolenAusgabe(page), /Buon appetito/);
  await keineHorizontaleScrollbar(page, "nach dem Backen", befunde);

  await page.click("#knopf-panel");
  await page.waitForFunction(() => document.getElementById("knopf-panel").getAttribute("aria-expanded") === "true");
  const sheet = await page.evaluate(() => ({
    sheet: document.getElementById("arbeitsbereich").classList.contains("panel-sheet"),
    rolle: document.getElementById("panel").getAttribute("role"),
    modal: document.getElementById("panel").getAttribute("aria-modal"),
    schleier: !document.getElementById("panel-schleier").hidden,
    breite: document.getElementById("panel").getBoundingClientRect().width,
  }));
  assert.deepEqual({ ...sheet, breite: undefined }, { sheet: true, rolle: "dialog", modal: "true", schleier: true, breite: undefined });
  if (sheet.breite > 390) befunde.push("Sheet breiter als 390px: " + sheet.breite);
  await page.waitForSelector("#doku-panel .doku-abschnitt");
  await keineHorizontaleScrollbar(page, "Doku-Sheet offen", befunde);
  // Esc schließt das Sheet
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.getElementById("knopf-panel").getAttribute("aria-expanded") === "false");

  // Beispiel aus dem Sheet öffnen → Sheet schließt sich, Tab offen
  await zeigePanelTab(page, "beispiele");
  await page.waitForSelector(S.beispielKarte);
  await keineHorizontaleScrollbar(page, "Beispiele-Sheet offen", befunde);
  await page.$$eval(S.beispielKarte, (k) => k[0].click());
  await page.waitForFunction(() => document.getElementById("knopf-panel").getAttribute("aria-expanded") === "false", { timeout: 5000 });
  assert.equal(await aktiverTabName(page), "hallo-welt.pizza");
  // Schleier-Klick schließt
  await page.click("#knopf-panel");
  await page.waitForSelector("#panel-schleier:not([hidden])");
  await schlafe(100);
  await page.evaluate(() => document.getElementById("panel-schleier").click());
  await page.waitForFunction(() => document.getElementById("knopf-panel").getAttribute("aria-expanded") === "false");
  await keineHorizontaleScrollbar(page, "Ende", befunde);
  assert.deepEqual(befunde, [], "keine horizontale Scrollbar");
});

e2e("Schmaler Viewport: viele Tabs und lange Ausgabezeilen erzeugen keine Seiten-Scrollbar", { viewport: SCHMAL }, async ({ page, oeffne }) => {
  const befunde = [];
  await oeffne();
  for (let i = 0; i < 6; i++) await page.click(S.tabNeu);
  await setzeCode(page, 'Bote.sage(("' + "Pizza".repeat(60) + '"));');
  await backen(page);
  await keineHorizontaleScrollbar(page, "viele Tabs + lange Zeile", befunde);
  assert.deepEqual(befunde, [], "keine horizontale Scrollbar");
});
