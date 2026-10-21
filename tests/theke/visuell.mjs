// Visueller Check der Theke in echtem Chrome (puppeteer-core aus e2e/node_modules).
// Liefert das Repo unter strikter CSP aus (script-src 'self', style-src 'self' – strenger als die Seite),
// lädt tests/theke/demo.html, prüft auf Konsolen-/CSP-Fehler und legt Screenshots in tests/theke/artefakte/ ab.
//   node tests/theke/visuell.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, "..", "..");
const ARTEFAKTE = path.join(HIER, "artefakte");
const require = createRequire(path.join(REPO, "e2e", "package.json"));
const puppeteer = require("puppeteer-core");

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

const server = http.createServer((req, res) => {
  const uri = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (uri === "/favicon.ico") { res.writeHead(204); return res.end(); }
  const datei = path.resolve(REPO, "." + uri);
  if (!datei.startsWith(REPO) || !fs.existsSync(datei) || !fs.statSync(datei).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(datei)] || "application/octet-stream", "Content-Security-Policy": CSP, "Cache-Control": "no-store" });
  fs.createReadStream(datei).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const basis = `http://127.0.0.1:${server.address().port}`;

const chrome = [process.env.CHROME_PFAD, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"]
  .find((p) => p && fs.existsSync(p));
if (!chrome) { console.log("Kein Chrome gefunden – visueller Check übersprungen."); server.close(); process.exit(0); }

fs.mkdirSync(ARTEFAKTE, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
const fehler = [];
let ok = true;
try {
  for (const schema of ["light", "dark"]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: 1.5 });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: schema }]);
    page.on("pageerror", (e) => fehler.push("pageerror: " + e.message));
    page.on("console", (m) => {
      const t = m.text();
      if (m.type() === "error" || /Content Security Policy|Refused/.test(t)) fehler.push("console: " + t);
    });
    page.on("requestfailed", (r) => fehler.push("requestfailed: " + r.url()));
    await page.goto(basis + "/tests/theke/demo.html", { waitUntil: "load" });

    // Interaktion: tippen, Enter, Klick, Haken, deaktivierter Knopf
    await page.focus("#hell [data-theke-id=anzahl]");
    await page.keyboard.type("2");
    await page.keyboard.press("Enter");
    await page.click("#hell [data-theke-id=backen]");
    await page.click("#hell [data-theke-id=extra]");
    await page.click("#hell [data-theke-id=aus]");
    const ereignisse = await page.evaluate(() => window.__ereignisse);
    const erwartet = [
      { typ: "aenderung", id: "anzahl", wert: "2" },
      { typ: "enter", id: "anzahl", wert: "2" },
      { typ: "klick", id: "backen" },
      { typ: "aenderung", id: "extra", wert: false },
    ];
    if (JSON.stringify(ereignisse) !== JSON.stringify(erwartet)) { ok = false; console.log("Ereignisse falsch:", JSON.stringify(ereignisse)); }

    // Stil per CSSOM muss trotz style-src 'self' greifen
    const breite = await page.$eval("#hell [data-theke-id=ok]", (el) => el.getBoundingClientRect().width);
    if (Math.round(breite) !== 90) { ok = false; console.log("stil.breite greift nicht:", breite); }
    const platzhalter = await page.$eval("#dunkel [data-theke-art=leinwand]", (el) => el.offsetHeight > 0 && el.textContent);
    if (!platzhalter || !/leinwand/.test(platzhalter)) { ok = false; console.log("Platzhalter fehlt"); }

    // Fokusring per Tastatur zeigen (dunkles Fenster)
    await page.focus("#dunkel [data-theke-id=anzahl]");
    await page.keyboard.press("Tab");
    await page.screenshot({ path: path.join(ARTEFAKTE, `demo-${schema}.png`), fullPage: true });
    await page.close();
  }
  // Auto-Thema ohne data-theme (fenster.html) in beiden Systemschemata
  for (const schema of ["light", "dark"]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 480, height: 400, deviceScaleFactor: 1.5 });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: schema }]);
    page.on("pageerror", (e) => fehler.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error" || /Content Security Policy|Refused/.test(m.text())) fehler.push("console: " + m.text()); });
    await page.evaluateOnNewDocument(() => { window.__ipc = []; window.ipc = { postMessage: (s) => window.__ipc.push(JSON.parse(s)) }; });
    await page.goto(basis + "/site/js/theke/fenster.html", { waitUntil: "load" });
    await page.evaluate(() => {
      pizzaThekeEmpfange(JSON.stringify({ v: 1, op: "fenster", titel: "Pizzarechner", breite: 420, hoehe: 320 }));
      pizzaThekeEmpfange(JSON.stringify({ v: 1, op: "baum", wurzel: { id: "z4", art: "stapel", kinder: [
        { id: "z1", art: "schild", text: "Noch nichts bestellt." },
        { id: "z2", art: "eingabe", platzhalter: "Wie viele Pizzen?" },
        { id: "z3", art: "knopf", text: "Backen!" }] } }));
      pizzaThekeEmpfange(JSON.stringify({ v: 1, op: "aendere", aenderungen: [{ id: "z1", text: "Macht 16,00 €" }] }));
    });
    await page.click("[data-theke-id=z3]");
    const info = await page.evaluate(() => ({ titel: document.title, ipc: window.__ipc }));
    const erw = JSON.stringify({ titel: "Pizzarechner", ipc: [{ typ: "bereit" }, { typ: "klick", id: "z3" }] });
    if (JSON.stringify(info) !== erw) { ok = false; console.log("fenster.html falsch:", JSON.stringify(info)); }
    await page.screenshot({ path: path.join(ARTEFAKTE, `fenster-${schema}.png`) });
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (fehler.length) { ok = false; console.log("Fehler im Browser:\n  " + fehler.join("\n  ")); }
console.log(ok ? "visueller Check ok – Screenshots in " + ARTEFAKTE : "visueller Check FEHLGESCHLAGEN");
process.exit(ok ? 0 : 1);
