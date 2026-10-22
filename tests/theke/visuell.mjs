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

    // v2-Zutaten: Takt läuft unter CSP, Reiter-Klick, hinweis → title, Tabelle rechtsbündig, Fortschritt-Füllung
    await page.waitForFunction(() => window.__ereignisse2.some((e) => e.typ === "takt" && e.id === "uhr"), { timeout: 3000 })
      .catch(() => { ok = false; console.log("takt: kein Schlag innerhalb von 3 s"); });
    const v2 = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const zahl = getComputedStyle(q("#hell2 [data-theke-id=statistik] td:nth-child(4)")).textAlign;
      const text = getComputedStyle(q("#hell2 [data-theke-id=statistik] td:nth-child(1)")).textAlign;
      const balken = q("#hell2 [data-theke-id=f-lehrling]");
      const fuell = balken.querySelector(".theke-fortschritt-fuellung").getBoundingClientRect().width / balken.getBoundingClientRect().width;
      const takt = q("#hell2 [data-theke-id=uhr]");
      q("#hell2 [data-theke-id=reiter] [role=tab]:nth-child(2)").click();
      return {
        reiter: window.__ereignisse2.filter((e) => e.typ !== "takt"),
        statistikSichtbar: q("#hell2 [data-theke-id=statistik]").offsetHeight > 0,
        backstubeVersteckt: q("#hell2 [data-theke-id=backstube]").offsetHeight === 0,
        zahl, text, fuell: Math.round(fuell * 100) / 100,
        title: q("#hell2 [data-theke-id=kauf-lehrling]").title,
        taktUnsichtbar: getComputedStyle(takt).display === "none",
        riesig: parseFloat(getComputedStyle(q("#hell2 [data-theke-id=zaehler]")).fontSize),
      };
    });
    const v2erw = { reiter: [{ typ: "aenderung", id: "reiter", wert: 2 }], statistikSichtbar: true, backstubeVersteckt: true,
      zahl: "right", text: "left", fuell: 0.8, title: "Backt 0,1 Pizzen pro Sekunde", taktUnsichtbar: true, riesig: 34 };
    if (JSON.stringify(v2) !== JSON.stringify(v2erw)) { ok = false; console.log("v2 falsch:", JSON.stringify(v2)); }
    await page.screenshot({ path: path.join(ARTEFAKTE, `v2-statistik-${schema}.png`), clip: await (await page.$("#hell2")).boundingBox() });
    await page.evaluate(() => document.querySelector("#hell2 [data-theke-id=reiter] [role=tab]:nth-child(1)").click());
    await new Promise((r) => setTimeout(r, 400));   // Fortschritt-Transition ausklingen lassen
    for (const id of ["hell2", "dunkel2"]) {
      await page.screenshot({ path: path.join(ARTEFAKTE, `v2-${id}-${schema}.png`), clip: await (await page.$("#" + id)).boundingBox() });
    }

    // v4 (K-107 … K-113): Reiter mit versteckter Seite, Auswahl-Klick, Abschnitt klappen, Tastatur, zeilen/mindestbreite
    const v4a = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const tabs = [...document.querySelectorAll("#hell4 [data-theke-id=reiter] [role=tab]")];
      return {
        tabsSichtbar: tabs.map((b) => b.offsetHeight > 0),
        geheimWeg: q("#hell4 [data-theke-id=geheim]").offsetHeight === 0,
        statistikDa: q("#hell4 [data-theke-id=statistik]").offsetHeight > 0,     // gewaehlt 2 ist versteckt → Ersatzseite 3 (nächste sichtbare)
        backstubeWeg: q("#hell4 [data-theke-id=backstube]").offsetHeight === 0,
        kleinZu: q("#hell4 [data-theke-id=klein] .theke-abschnitt-inhalt").offsetHeight === 0,
        pfeil: getComputedStyle(q("#hell4 [data-theke-id=klein] .theke-abschnitt-knopf"), "::before").content,
        tastaturUnsichtbar: getComputedStyle(q("#hell4 [data-theke-id=tasten]")).display === "none",
        mengeAus: [...document.querySelectorAll("#hell4 [data-theke-id=menge-aus] [role=radio]")].every((b) => b.disabled),
        // K-110: ein Klick ins Fenster (oben auf den deaktivierten Knopf „Aus“) gibt der Theke-Wurzel (tabindex=-1) den Fokus
        wurzelFokus: document.activeElement === q("#hell .theke"),
      };
    });
    const v4aErw = { tabsSichtbar: [true, false, true], geheimWeg: true, statistikDa: true, backstubeWeg: true, kleinZu: true, pfeil: '"▸"',
      tastaturUnsichtbar: true, mengeAus: true, wurzelFokus: true };
    if (JSON.stringify(v4a) !== JSON.stringify(v4aErw)) { ok = false; console.log("v4 (Start) falsch:", JSON.stringify(v4a)); }
    await page.screenshot({ path: path.join(ARTEFAKTE, `v4-hell4-${schema}.png`), clip: await (await page.$("#hell4")).boundingBox() });
    await page.screenshot({ path: path.join(ARTEFAKTE, `v4-dunkel4-${schema}.png`), clip: await (await page.$("#dunkel4")).boundingBox() });
    // Interaktion: Auswahl-Klick, Abschnitt klappen (Klick + Enter – Enter erreicht zusätzlich die Tastatur, K-110),
    // Reiter-Klick auf die erste Seite, Tasten auf der fokussierten Wurzel (Shift: Modifikator → nichts), Tippen in einer anderen Theke/Eingabe → nichts
    await page.click("#hell4 [data-theke-id=menge] [role=radio]:nth-child(4)");
    await page.click("#hell4 [data-theke-id=menge] [role=radio]:nth-child(4)");          // gleiche Option: nichts
    await page.click("#hell4 [data-theke-id=erledigt] .theke-abschnitt-knopf");
    await page.focus("#hell4 [data-theke-id=klein] .theke-abschnitt-knopf");
    await page.keyboard.press("Enter");
    await page.click("#hell4 [data-theke-id=reiter] [role=tab]:nth-child(1)");
    await page.focus("#hell4 .theke");
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Shift");
    await page.focus("#hell [data-theke-id=anzahl]");
    await page.keyboard.press("x");
    const v4b = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const h = (s) => Math.round(q(s).getBoundingClientRect().height * 10) / 10;
      const w = (s) => Math.round(q(s).getBoundingClientRect().width * 10) / 10;
      return {
        ereignisse: window.__ereignisse4,
        erledigtZu: q("#hell4 [data-theke-id=erledigt] .theke-abschnitt-inhalt").offsetHeight === 0,
        kleinOffen: q("#hell4 [data-theke-id=klein] .theke-abschnitt-inhalt").offsetHeight > 0,
        pfeilOffen: getComputedStyle(q("#hell4 [data-theke-id=klein] .theke-abschnitt-knopf"), "::before").content,
        backstubeDa: q("#hell4 [data-theke-id=backstube]").offsetHeight > 0,
        tasteSchild: q("#hell4 [data-theke-id=taste-schild]").textContent,
        mengeAn: q("#hell4 [data-theke-id=menge] [aria-checked=true]").textContent,
        // zeilen (K-113): kurzer und langer Text gleich hoch (= n Zeilen), Knopf mit zeilen 2 höher, mindestbreite greift, Haken-Text eine Zeile
        schildGleich: h("#hell4 [data-theke-id=kurz]") === h("#hell4 [data-theke-id=lang]"),
        schildZeilen: h("#hell4 [data-theke-id=lang]") / parseFloat(getComputedStyle(q("#hell4 [data-theke-id=lang]")).lineHeight),
        knopfGleich: h("#hell4 [data-theke-id=k-kurz]") === h("#hell4 [data-theke-id=k-lang]"),
        knopfZweiHoeher: h("#hell4 [data-theke-id=k-zwei]") > h("#hell4 [data-theke-id=k-lang]"),
        knopfMindestbreite: w("#hell4 [data-theke-id=k-kurz]") >= 160,
        hakenEineZeile: h("#hell4 [data-theke-id=haken-lang] .theke-haken-text") < 30,
      };
    });
    const v4bErw = { ereignisse: [
      { typ: "aenderung", id: "menge", wert: 4 }, { typ: "aenderung", id: "erledigt", wert: true }, { typ: "taste", id: "tasten", taste: "Enter" },
      { typ: "aenderung", id: "klein", wert: false }, { typ: "aenderung", id: "reiter", wert: 1 },
      { typ: "taste", id: "tasten", taste: "Leertaste" }, { typ: "taste", id: "tasten", taste: "Links" }],
      erledigtZu: true, kleinOffen: true, pfeilOffen: '"▾"', backstubeDa: true, tasteSchild: "Taste: Links", mengeAn: "Max",
      schildGleich: true, schildZeilen: 2, knopfGleich: true, knopfZweiHoeher: true, knopfMindestbreite: true, hakenEineZeile: true };
    if (JSON.stringify(v4b) !== JSON.stringify(v4bErw)) { ok = false; console.log("v4 (Interaktion/Layout) falsch:", JSON.stringify(v4b)); }
    await page.screenshot({ path: path.join(ARTEFAKTE, `v4-hell4-geklickt-${schema}.png`), clip: await (await page.$("#hell4")).boundingBox() });

    // Fokusring per Tastatur zeigen (dunkles Fenster)
    await page.focus("#dunkel [data-theke-id=anzahl]");
    await page.keyboard.press("Tab");
    await page.screenshot({ path: path.join(ARTEFAKTE, `demo-${schema}.png`), fullPage: true });
    await page.close();
  }
  // v3-Animationen (K-090 … K-092): je Art ein Bild mit drei Theken (Start · Mitte · Ende), hell/dunkel und reduzierte Bewegung.
  // Prüft dabei: keine CSP-/Konsolenfehler, Animationen laufen wirklich (getAnimations), das Layout aller Zutaten ist in allen
  // drei Zeitpunkten gleich (offset*, Scrollmaße) – Animationen bewegen nur per transform/opacity/filter.
  const ANIM = path.join(ARTEFAKTE, "animationen");
  fs.mkdirSync(ANIM, { recursive: true });
  for (const [thema, bewegung] of [["hell", "no-preference"], ["dunkel", "no-preference"], ["hell", "reduce"], ["dunkel", "reduce"]]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 560, deviceScaleFactor: 1.5 });
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: bewegung }]);
    page.on("pageerror", (e) => fehler.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn" || /Content Security Policy|Refused/.test(m.text())) fehler.push("console: " + m.text()); });
    await page.goto(basis + "/tests/theke/animation.html?thema=" + thema, { waitUntil: "load" });
    const faelle = await page.evaluate(() => window.__anim.faelle);
    for (const fall of faelle) {
      await page.evaluate((f) => window.__anim.spiele(f), fall);
      const anzahl = await page.evaluate(() => window.__anim.spule([0, 0.45, 1]));
      const layout = await page.evaluate(() => window.__anim.layout());
      const reduziert = bewegung === "reduce";
      // Erwartete Anzahl laufender Animationen je Theke (reduziert: Bewegung entfällt, funkeln/schwebe ruhig)
      const erwartet = reduziert
        ? { puls: 0, huepfen: 0, wackeln: 0, funkeln: 1, einblenden: 0, aufpoppen: 0, schwebe: 6, uebergang: 0 }[fall]
        : { funkeln: 1 + 8, schwebe: 6, uebergang: 2 }[fall] ?? 1;
      if (anzahl.some((n) => n !== erwartet)) { ok = false; console.log(`Animationen ${fall}/${thema}/${bewegung}: ${anzahl} statt ${erwartet}`); }
      const fp = layout.map((l) => JSON.stringify(l));
      if (fp[1] !== fp[0] || fp[2] !== fp[0]) { ok = false; console.log(`Layout springt bei ${fall}/${thema}/${bewegung}:\n  ${fp.join("\n  ")}`); }
      const name = `${fall}-${thema}${reduziert ? "-reduziert" : ""}.png`;
      await page.screenshot({ path: path.join(ANIM, name), clip: await (await page.$("#anim-raster")).boundingBox() });
      await page.evaluate(() => window.__anim.raeume());
      const rest = await page.evaluate(() => document.querySelectorAll(".theke-ebene > *, [class*='theke-anim-'], .theke-ueb-ein, .theke-ueb-aus").length);
      if (rest) { ok = false; console.log(`Nach dem Ende von ${fall} bleiben ${rest} Animations-Reste`); }
      if (fall === "uebergang") {
        const versteckt = await page.$$eval("[data-theke-id=lehrling]", (els) => els.every((e) => e.hidden && !e.hasAttribute("inert")));
        if (!versteckt) { ok = false; console.log("uebergang: Knopf nach dem Ausblenden nicht versteckt"); }
      }
    }
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
