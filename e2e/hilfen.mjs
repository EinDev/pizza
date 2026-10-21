// Gemeinsame Hilfen für die E2E-Tests: Server + lokaler Chrome (puppeteer-core),
// Fehlerüberwachung (Konsole, pageerror, CSP, HTTP ≥ 400), Screenshots bei Fehlschlag, Editor-/Konsolen-Helfer.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { starteServer } from "./server.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
export const SITE = process.env.E2E_SITE ? path.resolve(process.env.E2E_SITE) : path.resolve(HIER, "..", "site");
export const ARTEFAKTE = path.join(HIER, "artefakte");
export const DESKTOP = { width: 1280, height: 800 };
export const SCHMAL = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

// ---------------------------------------------------------------- Selektoren
// Bevorzugt data-testid (stabiler Vertrag mit der UI), Klassen/IDs als Rückfall.
export const S = {
  tab: '#editor-tabs [data-testid="editor-tab"], #editor-tabs .etab',
  tabAktiv: '#editor-tabs [data-testid="editor-tab"][data-aktiv="true"], #editor-tabs .etab.aktiv',
  tabNeu: '[data-testid="editor-tab-neu"], #editor-tabs .etab-neu',
  tabSchliessen: '[data-testid="editor-tab-schliessen"], .etab-zu',
  beispielKarte: '[data-testid="beispiel-karte"], #beispiele-liste .bsp-karte',
  dialogJa: '[data-testid="dialog-ja"], #dialog-ja',
  // interaktive Eingabe (EINGABE.md §3) – Vorschlag an die UI, siehe Bericht
  eingabe: '[data-testid="konsole-eingabe"]',
  echo: '[data-testid="konsole-echo"], #konsole-inhalt .k-echo',
  vorab: '[data-testid="eingaben-vorab"]',
  vorabStart: '[data-testid="eingaben-vorab-start"]',
};

/** Zeichnet alle Worker→UI-Ereignisse auf (window.__ereignisse, Batches aufgelöst). */
const EREIGNIS_REKORDER = () => {
  const W = window.Worker;
  window.__ereignisse = [];
  window.Worker = class extends W {
    constructor(...a) {
      super(...a);
      this.addEventListener("message", (m) => {
        const d = m.data;
        if (!d || typeof d !== "object") return;
        if (d.typ === "batch" && Array.isArray(d.ereignisse)) window.__ereignisse.push(...d.ereignisse);
        else window.__ereignisse.push(d);
      });
    }
  };
};

// ---------------------------------------------------------------- Chrome finden
export function chromePfad() {
  const kandidaten = [
    process.env.CHROME_PFAD,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const p = kandidaten.find((k) => { try { return fs.statSync(k).isFile(); } catch { return false; } });
  if (!p) throw new Error("Kein Chrome gefunden. Bitte CHROME_PFAD setzen. Geprüft: " + kandidaten.join(", "));
  return p;
}

// ---------------------------------------------------------------- Umgebung je Testdatei
let umgebungP = null;
export function umgebung() {
  if (!umgebungP) {
    umgebungP = (async () => {
      const server = await starteServer({ wurzel: SITE });
      const browser = await puppeteer.launch({
        executablePath: chromePfad(),
        headless: process.env.E2E_SICHTBAR ? false : true,
        args: [
          "--no-first-run", "--no-default-browser-check", "--disable-extensions",
          "--disable-background-networking", "--disable-sync", "--mute-audio",
          "--lang=de-DE", "--font-render-hinting=none", "--hide-scrollbars=false",
          ...(process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
        ],
        defaultViewport: DESKTOP,
      });
      return { server, browser };
    })();
  }
  return umgebungP;
}
/** Zweiter Server ohne Cross-Origin-Isolation (für Fallback-Tests), lazy gestartet. */
let ohneIsolationP = null;
function serverOhneIsolation() {
  if (!ohneIsolationP) ohneIsolationP = starteServer({ wurzel: SITE, isolation: false });
  return ohneIsolationP;
}
// Auf Modulebene registriert → läuft nach allen Tests der Datei (nicht nach dem ersten Test).
after(async () => {
  if (!umgebungP) return;
  const u = await umgebungP.catch(() => null);
  if (!u) return;
  await u.browser.close().catch(() => {});
  await u.server.stop();
  if (ohneIsolationP) await (await ohneIsolationP).stop();
});

// ---------------------------------------------------------------- Seite mit Überwachung
/**
 * Öffnet eine Seite in einem frischen Browser-Kontext (eigener localStorage).
 * @returns {Promise<{page, kontext, probleme: string[], basis: string, oeffne: (hash?:string)=>Promise<void>, neueSeite: ()=>Promise<any>}>}
 */
export async function seite({ viewport = DESKTOP, farbschema = "light", vorLaden = null, isolation = true } = {}) {
  const u = await umgebung();
  const browser = u.browser;
  const server = isolation ? u.server : await serverOhneIsolation();
  const kontext = await browser.createBrowserContext();
  const probleme = [];
  const ueberwache = async (page) => {
    await page.setViewport(viewport);
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: farbschema },
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    // CSP-Verletzungen im Dokument als Konsolenfehler sichtbar machen (Chrome meldet sie zusätzlich selbst)
    await page.evaluateOnNewDocument(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        console.error("CSP-Verletzung: " + e.violatedDirective + " blockiert " + (e.blockedURI || "inline") + " (" + e.sourceFile + ":" + e.lineNumber + ")");
      });
    });
    await page.evaluateOnNewDocument(EREIGNIS_REKORDER);
    if (vorLaden) await page.evaluateOnNewDocument(vorLaden);
    page.on("console", (m) => {
      const t = m.text();
      const ort = m.location() && m.location().url ? " @ " + m.location().url : "";
      if (m.type() === "error") probleme.push("Konsolenfehler: " + t + ort);
      else if (/Content.Security.Policy|Refused to/i.test(t)) probleme.push("CSP: " + t + ort);
    });
    page.on("pageerror", (e) => probleme.push("pageerror: " + (e && e.message ? e.message : String(e))));
    page.on("error", (e) => probleme.push("Seite abgestürzt: " + e.message));
    page.on("response", (r) => { if (r.status() >= 400) probleme.push("HTTP " + r.status() + ": " + r.url()); });
    page.on("requestfailed", (r) => {
      const f = r.failure() && r.failure().errorText;
      if (f && !/ERR_ABORTED/.test(f)) probleme.push("Request fehlgeschlagen: " + r.url() + " (" + f + ")");
    });
    return page;
  };
  const page = await ueberwache(await kontext.newPage());
  const basis = server.url;
  return {
    page, kontext, probleme, basis, server,
    async oeffne(hash = "") {
      const antwort = await page.goto(basis + hash, { waitUntil: "load" });
      await bereit(page);
      return antwort;
    },
    neueSeite: async () => ueberwache(await kontext.newPage()),
  };
}

/** Test mit frischer Seite; Screenshot bei Fehlschlag; am Ende: keine Konsolenfehler/pageerror/CSP/404. */
export function e2e(name, optionen, fn) {
  if (typeof optionen === "function") { fn = optionen; optionen = {}; }
  const { erlaubt = [], timeout = 60_000, skip, ...seitenOpt } = optionen;
  test(name, { timeout, skip }, async (t) => {
    const s = await seite(seitenOpt);
    try {
      await fn(s, t);
      // kurz nachlaufen lassen, damit verspätete Fehler (Worker, Lazy-Bilder) noch auffallen
      await new Promise((r) => setTimeout(r, 150));
      // E2E_IGNORIERE: Regex für bekannte, vorübergehende Probleme (nur lokal; in CI leer lassen)
      const global = process.env.E2E_IGNORIERE ? [new RegExp(process.env.E2E_IGNORIERE)] : [];
      const echte = s.probleme.filter((p) => ![...erlaubt, ...global].some((re) => re.test(p)));
      assert.deepEqual(echte, [], "Keine Konsolenfehler / pageerror / CSP-Verletzungen / HTTP-Fehler erwartet");
    } catch (e) {
      await screenshot(s.page, name).catch(() => {});
      if (s.probleme.length) e.message += "\n  Beobachtete Probleme:\n   - " + s.probleme.join("\n   - ");
      throw e;
    } finally {
      await s.kontext.close().catch(() => {});
    }
  });
}

export async function screenshot(page, name) {
  fs.mkdirSync(ARTEFAKTE, { recursive: true });
  const datei = path.join(ARTEFAKTE, name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80) + ".png");
  await page.screenshot({ path: datei, fullPage: false });
  return datei;
}

// ---------------------------------------------------------------- UI-Helfer
export async function bereit(page) {
  await page.waitForSelector("body.bereit", { timeout: 15_000 });
  await page.waitForSelector("#editor .cm-content");
}

export const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));

/** Volltext des aktiven Editors (über die CodeMirror-View, Fallback: sichtbare Zeilen). */
export function editorText(page) {
  return page.evaluate(() => {
    const c = document.querySelector("#editor .cm-content");
    const tile = c && (c.cmTile || c.cmView);
    const view = tile && ((tile.root && tile.root.view) || (tile.rootView && tile.rootView.view));
    if (view) return view.state.doc.toString();
    return [...c.querySelectorAll(".cm-line")].map((l) => l.textContent).join("\n");
  });
}

/** Ersetzt den Editorinhalt wie ein Nutzer: Strg+A, dann Einfügen (paste-Event mit text/plain). */
export async function setzeCode(page, code) {
  await page.focus("#editor .cm-content");
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.evaluate((text) => {
    const c = document.querySelector("#editor .cm-content");
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    c.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, code);
  const ist = await editorText(page);
  assert.equal(ist, code, "Editorinhalt nach dem Einfügen");
}

export async function strg(page, taste) {
  await page.keyboard.down("Control");
  await page.keyboard.press(taste);
  await page.keyboard.up("Control");
}

/** Wartet, bis kein Lauf mehr aktiv ist (Badge gesetzt, Backen-Knopf wieder da). */
export async function warteLaufEnde(page, timeout = 20_000) {
  await page.waitForFunction(() => {
    const b = document.getElementById("exit-badge");
    return !document.body.classList.contains("laeuft") && b && !b.hidden && !b.classList.contains("laeuft")
      && !document.getElementById("knopf-backen").hidden;
  }, { timeout, polling: 50 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Strg+Enter und auf das Ende warten. */
export async function backen(page, { timeout } = {}) {
  await strg(page, "Enter");
  await warteLaufEnde(page, timeout);
}

export function exitBadge(page) {
  return page.$eval("#exit-badge", (b) => ({ text: b.textContent.trim(), klasse: b.className, hidden: b.hidden }));
}

/** Alle Programm-Ausgaben in Reihenfolge (ausgabe, fehlerausgabe, panik) – Format wie .erwartet. */
export function konsolenAusgabe(page) {
  // Zwei Darstellungen werden unterstützt:
  //  - Terminal-Stil (EINGABE.md): jeder Ausgabeblock enthält seine Zeilenumbrüche selbst (Bote.schreibe ohne \n)
  //  - älterer Stil: Blöcke ohne abschließendes \n, Zeilen per \n verbunden
  // Echo-Zeilen der Eingabe (konsole-echo) gehören nicht zur Programmausgabe.
  return page.$$eval("#konsole-inhalt > *", (knoten) => {
    const ECHO = '[data-testid="konsole-echo"], .k-echo';
    // Text eines Ausgabeblocks ohne Echo-Spans (und ohne den Zeilenumbruch, den die UI hinter das Echo setzt)
    const ohneEcho = (block) => {
      let t = "", nachEcho = false;
      for (const n of block.childNodes) {
        if (n.nodeType === 1 && n.matches(ECHO)) { nachEcho = true; continue; }
        let s = n.textContent;
        if (nachEcho && s.startsWith("\n")) s = s.slice(1);
        nachEcho = false;
        t += s;
      }
      return t;
    };
    const teile = [];
    for (const k of knoten) {
      if (k.matches(ECHO)) continue;
      if (k.classList.contains("k-ausgabe") || k.classList.contains("k-fehlerausgabe")) teile.push({ t: ohneEcho(k), panik: false });
      else if (k.classList.contains("k-panik")) teile.push({ t: (k.querySelector(".k-text") || k).textContent, panik: true });
    }
    if (!teile.length) return "";
    const terminal = /Bestellannahme/.test(String(window.PizzaLang && window.PizzaLang.BUILTINS)) || teile.some((x) => !x.panik && x.t.endsWith("\n"));
    if (terminal) return teile.map((x) => (x.panik && !x.t.endsWith("\n") ? x.t + "\n" : x.t)).join("");
    return teile.map((x) => x.t).join("\n") + "\n";
  });
}

/** Meldungen (warnung/fehler/system) der Konsole. */
export function konsolenMeldungen(page) {
  return page.$$eval("#konsole-inhalt .k-meldung", (k) => k.map((e) => ({
    klasse: e.className, text: (e.querySelector(".k-text") || e).textContent, ort: (e.querySelector(".k-ort") || {}).textContent || null, knopf: e.tagName === "BUTTON",
  })));
}

export const EXIT_TEXT = { 0: "gegessen · 0", 1: "Ananas · 1", 2: "Fehler · 2", 3: "noch im Ofen · 3", 39: "🍍 39" };
export const EXIT_KLASSE = { 0: "ok", 1: "ananas", 2: "fehler", 3: "ofen", 39: "hawaii" };

export function editorTabs(page) {
  return page.$$eval("#editor-tabs .etab", (t) => t.map((e) => ({
    name: e.querySelector(".etab-name") ? e.querySelector(".etab-name").textContent : "",
    aktiv: e.classList.contains("aktiv"), schmutzig: e.classList.contains("schmutzig"), id: e.dataset.id,
  })));
}

export function aktiverTabName(page) {
  return page.$eval(S.tabAktiv, (e) => e.querySelector(".etab-name").textContent);
}
export async function warteAufTab(page, name, timeout = 5000) {
  await page.waitForFunction((sel, n) => {
    const a = document.querySelector(sel);
    const t = a && a.querySelector(".etab-name");
    return t && t.textContent === n;
  }, { timeout }, S.tabAktiv, name);
}
export async function neuerTab(page) {
  await page.click(S.tabNeu);
  await page.waitForFunction((sel) => /^unbenannt/.test(document.querySelector(sel + " .etab-name, " + sel).textContent), {}, S.tabAktiv.split(",")[0]);
  await page.focus("#editor .cm-content");
}

export async function panelOffen(page) {
  return page.$eval("#knopf-panel", (k) => k.getAttribute("aria-expanded") === "true");
}

export async function setzePanel(page, offen) {
  if ((await panelOffen(page)) !== offen) await page.click("#knopf-panel");
  await page.waitForFunction((o) => document.getElementById("knopf-panel").getAttribute("aria-expanded") === String(o), {}, offen);
}

export async function zeigePanelTab(page, name) {
  await setzePanel(page, true);
  await page.click("#tab-" + name);
  await page.waitForFunction((n) => !document.getElementById("tabpanel-" + n).hidden, {}, name);
}

/** Klickt per DOM (robust gegen Überlagerungen/Scrollpositionen). */
export function klickeDom(page, selektor) {
  return page.$eval(selektor, (e) => { e.scrollIntoView({ block: "center" }); e.click(); });
}

/** Alle Beispiele aus den Manifesten (nur vorhandene Teil-Manifeste). */
export function beispieleAusManifesten() {
  const basis = path.join(SITE, "beispiele");
  const index = JSON.parse(fs.readFileSync(path.join(basis, "index.json"), "utf8"));
  const fehlend = [];
  const liste = [];
  for (const teil of index.teile || []) {
    const p = path.join(basis, teil);
    if (!fs.existsSync(p)) { fehlend.push(teil); continue; }
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const b of m.beispiele || []) {
      liste.push({ ...b, kategorie: m.kategorie, teil, erwartetText: fs.readFileSync(path.join(basis, b.erwartet), "utf8").replace(/\r\n/g, "\n") });
    }
  }
  return { liste, fehlend, teile: index.teile || [] };
}

// ---------------------------------------------------------------- Interaktive Eingabe (EINGABE.md)
/** Leert die Ereignis-Aufzeichnung (vor einem Lauf aufrufen). */
export function ereignisseLeeren(page) {
  return page.evaluate(() => { window.__ereignisse = []; });
}

/** Programmausgabe im .erwartet-Format aus den aufgezeichneten Worker-Ereignissen (inkl. «leeren»). */
export function ausgabeAusEreignissen(page) {
  return page.evaluate(() => {
    let t = "";
    for (const e of window.__ereignisse || []) {
      if (e.typ === "ausgabe" || e.typ === "fehlerausgabe") t += (e.text == null ? "" : String(e.text)) + (e.umbruch === false ? "" : "\n");
      else if (e.typ === "panik") t += e.text + "\n";
      else if (e.typ === "leeren") t += "«leeren»\n";
    }
    return t;
  });
}

/** Teil von .erwartet, der nach dem letzten «leeren» noch in der Konsole steht. */
export function nachLetztemLeeren(text) {
  const i = text.lastIndexOf("«leeren»\n");
  return i < 0 ? text : text.slice(i + "«leeren»\n".length);
}

export function echos(page) {
  return page.$$eval(S.echo, (e) => e.map((x) => ({ text: x.textContent, eof: x.classList.contains("k-echo-eof") })));
}

/** Zustand: "eingabe" (Eingabezeile sichtbar), "ende" (Lauf vorbei) oder "laeuft". */
export async function warteEingabeOderEnde(page, timeout = 20_000) {
  const h = await page.waitForFunction(() => {
    const f = document.querySelector('[data-testid="konsole-eingabe"]');
    if (f && !f.hidden) return "eingabe";
    const b = document.getElementById("exit-badge");
    if (!document.body.classList.contains("laeuft") && b && !b.hidden && !b.classList.contains("laeuft") && !document.getElementById("knopf-backen").hidden) return "ende";
    return false;
  }, { timeout, polling: 20 });
  return h.jsonValue();
}

/** Schickt eine Zeile über die Eingabezeile (tippen = echte Tastendrücke, sonst Wert setzen + Enter). */
export async function sendeEingabe(page, zeile, { tippen = false } = {}) {
  const feld = '[data-testid="konsole-eingabe-feld"]';
  await page.focus(feld);
  if (tippen) await page.keyboard.type(zeile);
  else await page.$eval(feld, (f, z) => { f.value = z; f.dispatchEvent(new Event("input", { bubbles: true })); }, zeile);
  await page.keyboard.press("Enter");
}

/**
 * Backt per Strg+Enter und beantwortet jede Eingabe-Anfrage mit der nächsten Zeile; danach Strg+D (EOF).
 * @returns {Promise<{gesendet:number, eofs:number}>}
 */
export async function backenInteraktiv(page, zeilen, { timeout = 30_000, tippen = false } = {}) {
  await ereignisseLeeren(page);
  await page.focus("#editor .cm-content");
  await strg(page, "Enter");
  const bis = Date.now() + timeout;
  let gesendet = 0, eofs = 0;
  for (;;) {
    const z = await warteEingabeOderEnde(page, Math.max(1000, bis - Date.now()));
    if (z === "ende") break;
    if (gesendet < zeilen.length) await sendeEingabe(page, zeilen[gesendet++], { tippen });
    else {
      eofs++;
      if (eofs > 50) throw new Error("Programm fragt nach EOF immer weiter");
      await page.focus('[data-testid="konsole-eingabe-feld"]');
      await strg(page, "KeyD");
    }
  }
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return { gesendet, eofs };
}

/** Eingabedatei eines Beispiels (Manifestfeld "eingabe" oder gleichnamige .eingabe-Datei). */
export function eingabeZeilen(b) {
  const basis = path.join(SITE, "beispiele");
  const datei = b.eingabe || b.datei.replace(/\.pizza$/, ".eingabe");
  const p = path.join(basis, datei);
  if (!fs.existsSync(p)) return null;
  const t = fs.readFileSync(p, "utf8").replace(/\r\n?/g, "\n");
  if (t === "") return [];
  return t.replace(/\n$/, "").split("\n");
}

/** Unterstützen Interpreter und UI interaktive Eingabe? */
export function eingabeUnterstuetzt(page) {
  return page.evaluate(() => !!(window.PizzaLang && /Bestellannahme/.test(String(window.PizzaLang.BUILTINS || "")) || document.querySelector('[data-testid="konsole-eingabe"]')));
}
