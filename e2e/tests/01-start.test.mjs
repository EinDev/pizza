// Seite lädt, Editor sichtbar, Logo/Favicon, Version, Sicherheits-Header.
import assert from "node:assert/strict";
import { test } from "node:test";
import { e2e, umgebung, editorText, aktiverTabName } from "../hilfen.mjs";
import { cspAusNginx, headerAusNginx } from "../server.mjs";

test("Server: CSP stammt aus nginx.conf, /healthz antwortet", async () => {
  const { server } = await umgebung();
  assert.ok(cspAusNginx(), "CSP in nginx.conf gefunden");
  assert.equal(server.csp, cspAusNginx());
  // Alle festen Header aus nginx.conf werden 1:1 gesendet (nichts hart codiert, z. B. 'wasm-unsafe-eval')
  const index = await fetch(server.url);
  for (const [name, wert] of Object.entries(headerAusNginx())) assert.equal(index.headers.get(name), wert, name);
  const r = await fetch(server.url + "healthz");
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "ok\n");
  const fehlt = await fetch(server.url + "js/gibts-nicht.js");
  assert.equal(fehlt.status, 404, "fehlende Assets sind echte 404 (kein SPA-Fallback)");
  const spa = await fetch(server.url + "irgendwo/tief");
  assert.equal(spa.status, 200, "SPA-Fallback für Seitenpfade");
});

e2e("Seite lädt: Titel, Editor, Logo, Favicon, Version, Sicherheits-Header", async ({ page, oeffne, basis }) => {
  const antwort = await oeffne();
  const h = antwort.headers();
  assert.match(h["content-security-policy"], /script-src 'self'/);
  assert.equal(h["x-content-type-options"], "nosniff");
  assert.equal(h["x-frame-options"], "DENY");

  assert.match(await page.title(), /pizza/i);
  // Editor sichtbar und mit Willkommens-Code gefüllt
  const editorBox = await page.$eval("#editor .cm-editor", (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  assert.ok(editorBox.w > 300 && editorBox.h > 150, "Editor hat sichtbare Größe: " + JSON.stringify(editorBox));
  const text = await editorText(page);
  assert.match(text, /Willkommen im pizza-Playground/);
  // Fokus liegt im Editor
  assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains("cm-content")), "Editor hat Fokus");
  // ein Tab „willkommen.pizza“
  assert.equal(await aktiverTabName(page), "willkommen.pizza");

  // Logo geladen
  await page.waitForFunction(() => { const i = document.getElementById("logo-bild"); return i && i.complete && i.naturalWidth > 0; });
  assert.ok(await page.$eval(".marke", (m) => m.classList.contains("mit-bild")), "Logo-Bild aktiv");

  // Favicons: alle <link rel=icon> erreichbar und SVG
  const icons = await page.$$eval('link[rel~="icon"]', (l) => l.map((x) => x.href));
  assert.ok(icons.length >= 1, "mindestens ein Favicon");
  for (const href of icons) {
    const r = await fetch(href);
    assert.equal(r.status, 200, "Favicon " + href);
    assert.match(r.headers.get("content-type"), /image\/svg\+xml/);
  }

  // Version wie im Interpreter
  const { version, anzeige, title } = await page.evaluate(() => ({
    version: window.PizzaLang && window.PizzaLang.version,
    anzeige: document.getElementById("version").textContent,
    title: document.getElementById("version").title,
  }));
  assert.match(version, /^3\.1/);
  assert.equal(anzeige, "v3.1");
  assert.equal(title, "Interpreter " + version);

  // Leere Konsole mit Hinweis, kein Exit-Badge
  assert.ok(await page.$("#konsole-inhalt .konsole-leer"));
  assert.equal(await page.$eval("#exit-badge", (b) => b.hidden), true);

  // Keine horizontale Scrollbar am Desktop
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "keine horizontale Scrollbar");
  assert.ok(basis);
});

e2e("Doku-Daten und Interpreter-Konstanten sind geladen", async ({ page, oeffne }) => {
  await oeffne();
  const info = await page.evaluate(() => ({
    doku: Array.isArray(self.PIZZA_DOKU) ? self.PIZZA_DOKU.length : 0,
    keywords: window.PizzaLang ? window.PizzaLang.KEYWORDS.length : 0,
    status: document.getElementById("editor-status").textContent,
  }));
  assert.ok(info.doku >= 10, "Doku-Abschnitte: " + info.doku);
  assert.ok(info.keywords > 10);
  assert.doesNotMatch(info.status, /nicht geladen/);
});
