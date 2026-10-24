// Teilen (eigener Server: echte Durchreiche im Prozess), ignorierte #code=-Links, Hell/Dunkel, schmaler Viewport (390×844).
import assert from "node:assert/strict";
import {
  e2e, setzeCode, editorText, editorTabs, aktiverTabName, warteAufTab, bereit, backen, konsolenAusgabe,
  zeigePanelTab, panelOffen, strg, schlafe, S, SCHMAL, umgebung, neuerTab,
} from "../hilfen.mjs";

const CODE = '// geteilt ✓ Ümlaute & Emoji 🍕\nBote.sage(("aus dem Link"));';

/** u.-Kodierung (rohes UTF-8, base64url), wie sie alte #code=-Links verwendeten. */
const uKodiert = (code) => "u." + Buffer.from(code, "utf8").toString("base64url");

// #code=-Links gibt es nicht mehr (Nutzerentscheidung, keine Rückwärtskompatibilität):
// Ein Aufruf mit #code=… tut nichts Besonderes – kein neuer Tab, kein Toast, kein Fehler.
for (const [name, hash] of [["gültig (u.)", "#code=" + uKodiert(CODE)], ["kaputt", "#code=%E2%9"]]) {
  e2e(`Alter #code=-Link (${name}) wird ignoriert: kein Tab, kein Fehler`, async ({ page, oeffne }) => {
    await oeffne(hash);
    await schlafe(500); // Zeit für eine (nicht erwünschte) asynchrone Hash-Auswertung
    const tabs = await editorTabs(page);
    assert.deepEqual(tabs.map((t) => t.name), ["willkommen.pizza"], "nur der Willkommens-Tab");
    assert.doesNotMatch(await editorText(page), /aus dem Link/);
    const toast = await page.$eval("#toast", (t) => (t.hidden ? "" : t.textContent));
    assert.doesNotMatch(toast, /geteilt|Link|beschädigt/i, "kein Toast zum Link");
    // auch ein späterer hashchange öffnet nichts
    await page.evaluate((h) => { location.hash = h; }, "#code=" + uKodiert("Bote.sage((1));"));
    await schlafe(300);
    assert.equal((await editorTabs(page)).length, 1);
  });
}

// ---------------------------------------------------------------- Teilen über den eigenen Server (Nutzerentscheidung)
// Nur noch: Skript auf unserem Server speichern → Link. Kein „Hastebin“ im UI, kein Rohtext-Link,
// KEINE #code=-Links mehr (weder erzeugen noch öffnen).

/** Findet „hastebin“ (beliebige Schreibweise) in sichtbarem Text, Attributen (title, aria-label, href …) und dem Seitentitel. */
function hastebinImDom(page) {
  return page.evaluate(() => {
    const funde = [];
    if (/hastebin/i.test(document.title)) funde.push("title");
    for (const e of document.querySelectorAll("body *")) {
      if (e.tagName === "SCRIPT" || e.tagName === "STYLE") continue;
      for (const a of e.attributes) if (/hastebin/i.test(a.value)) funde.push(`${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}[${a.name}]`);
      for (const n of e.childNodes) if (n.nodeType === 3 && /hastebin/i.test(n.nodeValue)) funde.push(`${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}: „${n.nodeValue.trim().slice(0, 60)}“`);
    }
    return funde;
  });
}

const LOKAL_KNOEPFE = '[data-testid="teilen-lokal"], [data-testid="teilen-fehler-lokal"], #teilen-lokal, #teilen-fehler-lokal';

async function keinLokalerLink(page, wo) {
  const sichtbar = await page.$$eval(LOKAL_KNOEPFE, (k) => k.filter((x) => x.getClientRects().length && !x.closest("[hidden]")).map((x) => x.id || x.dataset.testid));
  assert.deepEqual(sichtbar, [], wo + ": keine Option „Link ohne Server“");
  assert.doesNotMatch(await page.evaluate(() => location.hash), /code=/, wo + ": kein #code= in der Adresszeile");
  const url = await page.$eval('[data-testid="teilen-url"], #teilen-url', (i) => i.value).catch(() => "");
  assert.doesNotMatch(url, /#code=/, wo + ": kein #code=-Link erzeugt");
}

async function teilenOeffnen(page) {
  await page.click('[data-testid="teilen"], #knopf-teilen');
  await page.waitForSelector('[data-testid="dialog-teilen"][open], #dialog-teilen[open]');
}

const sichtbarerSchritt = (page) => page.$$eval("#dialog-teilen [data-schritt]", (s) => (s.find((x) => !x.hidden) || {}).dataset?.schritt || null);

e2e("Teilen: Hinweis „auf unserem Server speichern“, kein „Hastebin“ im DOM, Link lädt den Code wieder", async ({ page, oeffne, neueSeite, server, basis }) => {
  await oeffne();
  assert.deepEqual(await hastebinImDom(page), [], "kein „Hastebin“ auf der Seite");
  await setzeCode(page, CODE);
  await teilenOeffnen(page);
  const text = await page.$eval("#dialog-teilen", (d) => d.innerText);
  assert.match(text, /Server/i, "Hinweis nennt den Server");
  assert.match(text, /speicher/i, "Hinweis sagt, dass gespeichert wird");
  assert.deepEqual(await hastebinImDom(page), [], "kein „Hastebin“ im Teilen-Dialog");
  await keinLokalerLink(page, "Dialog offen");
  assert.equal(await page.$$eval('[data-testid="teilen-roh"], #teilen-roh', (r) => r.filter((x) => x.getClientRects().length).length), 0, "kein Rohtext-Link");

  await page.click('[data-testid="teilen-senden"], #teilen-senden');
  await page.waitForFunction(() => { const s = document.querySelector('#dialog-teilen [data-schritt="fertig"]'); return s && !s.hidden; }, { timeout: 5000 });
  const url = await page.$eval('[data-testid="teilen-url"], #teilen-url', (i) => i.value);
  assert.ok(url.startsWith(basis), "Link zeigt auf den Playground: " + url);
  assert.doesNotMatch(url, /#code=/);
  const id = /#h=([0-9A-Za-z]{12})$/.exec(url)[1];
  assert.equal((await server.teilen.hole(id)).dateien["willkommen.pizza"], CODE, "Projekt wurde auf dem Server gespeichert");
  assert.deepEqual(await hastebinImDom(page), [], "kein „Hastebin“ nach dem Senden");
  await keinLokalerLink(page, "fertig");

  const p2 = await neueSeite();
  await p2.goto(url, { waitUntil: "load" });
  await bereit(p2);
  await p2.waitForFunction(() => {
    const c = document.querySelector("#editor .cm-content");
    return c && /aus dem Link/.test(c.textContent);
  }, { timeout: 5000 });
  assert.equal(await editorText(p2), CODE);
  assert.deepEqual(await hastebinImDom(p2), [], "kein „Hastebin“ beim Öffnen des Links");
});

for (const [modus, status, muster] of [["aus", 503, /nicht|Server|später/i], ["limit", 429, /viele|Pause|später|gleich/i]]) {
  e2e(`Teilen: Server antwortet ${status} → klare Fehlermeldung, kein #code=-Fallback`, {
    erlaubt: [/api\/(?:teilen|blob)/, new RegExp("status of " + status)],
  }, async ({ page, oeffne, server }) => {
    server.teilen.modus = modus;
    const vorher = server.teilen.links;
    try {
      await oeffne();
      await setzeCode(page, CODE);
      await teilenOeffnen(page);
      const senden = '[data-testid="teilen-senden"], #teilen-senden';
      const deaktiviert = await page.$eval(senden, (k) => k.disabled || !k.getClientRects().length);
      if (!deaktiviert) {
        await page.click(senden);
        await page.waitForFunction(() => { const s = document.querySelector('#dialog-teilen [data-schritt="fehler"]'); return s && !s.hidden; }, { timeout: 5000 });
      } else {
        assert.equal(modus, "aus", "Senden nur dann vorab gesperrt, wenn Teilen nicht eingerichtet ist");
      }
      const meldung = await page.$eval("#dialog-teilen", (d) => {
        const f = d.querySelector('[data-testid="teilen-fehlertext"], #teilen-fehlertext');
        const sichtbar = [...d.querySelectorAll("p, [role=alert]")].filter((p) => p.getClientRects().length && !p.closest("[hidden]")).map((p) => p.innerText).join(" ");
        return (f && f.getClientRects().length ? f.innerText + " " : "") + sichtbar;
      });
      assert.match(meldung, muster, `verständliche Meldung bei ${status}: ${meldung}`);
      assert.deepEqual(await hastebinImDom(page), [], "kein „Hastebin“ in der Fehlermeldung");
      await keinLokalerLink(page, String(status));
      assert.equal(server.teilen.links, vorher, "nichts gespeichert");
    } finally {
      server.teilen.modus = "echt";
    }
  });
}

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
  assert.equal(await aktiverTabName(page), "hauptgang.pizza");
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
  for (let i = 0; i < 6; i++) await neuerTab(page);   // „+“ = neues Projekt (PB1); warten, bis es aktiv ist
  await setzeCode(page, 'Bote.sage(("' + "Pizza".repeat(60) + '"));');
  await backen(page);
  await keineHorizontaleScrollbar(page, "viele Tabs + lange Zeile", befunde);
  assert.deepEqual(befunde, [], "keine horizontale Scrollbar");
});
