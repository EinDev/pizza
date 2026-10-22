// Projektlink im Playground-Kopf: GitHub-Icon (neuer Tab, rel="noopener"), sichtbar hell/dunkel und auf Handybreite
// ohne Überlauf im Kopf; im App-Modus (App-Link) gibt es den Kopf und damit den Link nicht.
import assert from "node:assert/strict";
import { e2e, SCHMAL, screenshot } from "../hilfen.mjs";

const LINK = '[data-testid="github"]';

async function pruefeLink(page) {
  const i = await page.$eval(LINK, (a) => {
    const r = a.getBoundingClientRect(), kopf = document.querySelector(".kopf");
    const s = getComputedStyle(a), svg = a.querySelector("svg");
    return {
      href: a.href, target: a.target, rel: a.rel, title: a.title, label: a.getAttribute("aria-label"),
      w: r.width, h: r.height, rechts: r.right, sichtbar: s.display !== "none" && s.visibility !== "hidden" && r.width > 0,
      unterstrich: s.textDecorationLine, farbe: s.color, strich: svg && getComputedStyle(svg).stroke,
      kopfUeberlauf: kopf.scrollWidth - kopf.clientWidth, seitenbreite: document.documentElement.clientWidth,
    };
  });
  assert.equal(i.href, "https://github.com/EinDev/pizza");
  assert.equal(i.target, "_blank");
  assert.match(i.rel, /\bnoopener\b/);
  assert.equal(i.title, "Quellcode auf GitHub");
  assert.ok(i.label && /GitHub/.test(i.label));
  assert.ok(i.sichtbar && i.w >= 30 && i.h >= 30, "Link sichtbar und groß genug: " + JSON.stringify(i));
  assert.ok(i.rechts <= i.seitenbreite, "Link innerhalb der Seite: " + JSON.stringify(i));
  assert.ok(i.kopfUeberlauf <= 0, "Kopf läuft nicht über: " + JSON.stringify(i));
  assert.equal(i.unterstrich, "none");
  assert.equal(i.strich, i.farbe, "Icon in Textfarbe (currentColor)");
  return i;
}

e2e("GitHub-Link im Kopf (hell, Desktop)", async ({ page, oeffne }) => {
  await oeffne();
  await pruefeLink(page);
});

e2e("GitHub-Link im Kopf (dunkel, Handybreite)", { viewport: SCHMAL, farbschema: "dark" }, async ({ page, oeffne }) => {
  await oeffne();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  await pruefeLink(page);
  if (process.env.GITHUB_BILDER) await screenshot(page, "github-link-mobil-dunkel");
});

e2e("GitHub-Link fehlt im App-Modus (Kopf aus, siehe 11-app-link)", async ({ page, oeffne }) => {
  await oeffne();
  // Nur die CSS-Regel: data-app blendet den Kopf samt Link aus (der echte App-Link wird in 11-app-link geprüft)
  const sichtbar = await page.evaluate((sel) => {
    document.documentElement.setAttribute("data-app", "e2e");
    return document.querySelector(sel).getClientRects().length > 0;
  }, LINK);
  assert.equal(sichtbar, false);
});
