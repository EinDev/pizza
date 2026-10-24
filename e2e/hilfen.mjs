// Gemeinsame Hilfen für die E2E-Tests: Server + lokaler Chrome (puppeteer-core),
// Fehlerüberwachung (Konsole, pageerror, CSP, HTTP ≥ 400), Screenshots bei Fehlschlag, Editor-/Konsolen-Helfer.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { createRequire } from "node:module";
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
/**
 * Steuerbare Uhr für Theke-Takte (THEKE-ERWEITERUNGEN.md §1, site/js/theke/README.md „zeitgeber“):
 * Der Renderer bekommt über PizzaTheke.erzeuge(…, { zeitgeber }) eine eingefrorene Uhr. Takte schlagen nur, wenn ein Test
 * per window.__thekeUhr.vorspulen(ms) Zeit vergehen lässt – dann werden alle Takt-Timer sofort einmal abgefragt.
 * So ist jeder Schlag (inkl. anzahl nach der Nachholregel) deterministisch; echte Zeit erzeugt nie zusätzliche Schläge.
 */
const THEKE_UHR = () => {
  const uhr = {
    jetztMs: 0, naechste: 1, timer: new Map(), taktGesendet: 0,
    jetzt: () => uhr.jetztMs,
    setzeIntervall: (fn) => { const h = uhr.naechste++; uhr.timer.set(h, fn); return h; },
    loescheIntervall: (h) => { uhr.timer.delete(h); },
    vorspulen(ms) { uhr.jetztMs += ms; for (const fn of [...uhr.timer.values()]) { try { fn(); } catch (e) { console.error(e); } } },
  };
  window.__thekeUhr = uhr;
  const umhuelle = (api) => {
    if (!api || typeof api.erzeuge !== "function" || api.__e2eUhr) return api;
    const orig = api.erzeuge.bind(api);
    const neu = Object.create(api);
    neu.__e2eUhr = true;
    neu.erzeuge = (container, opt = {}) => orig(container, {
      ...opt,
      zeitgeber: opt.zeitgeber || { jetzt: uhr.jetzt, setzeIntervall: uhr.setzeIntervall, loescheIntervall: uhr.loescheIntervall },
      sende: (ev, ...rest) => {
        if ((ev && ev.typ === "takt") || ev === "takt") uhr.taktGesendet++;
        return opt.sende(ev, ...rest);
      },
    });
    return neu;
  };
  let wert;
  Object.defineProperty(window, "PizzaTheke", { configurable: true, get: () => wert, set: (api) => { wert = umhuelle(api); } });
};

const EREIGNIS_REKORDER = () => {
  const W = window.Worker;
  window.__ereignisse = [];
  // Wecker: Warte-Helfer (warteAufBediene) melden sich hier an und prüfen sofort bei jedem neuen Ereignis –
  // statt im 20-ms-Takt zu pollen (beim Pizza-Imperium mit >1000 Theke-Ereignissen sonst ~20 s reines Warten je Lauf).
  window.__ereignisWecker = new Set();
  window.Worker = class extends W {
    constructor(...a) {
      super(...a);
      this.addEventListener("message", (m) => {
        const d = m.data;
        if (!d || typeof d !== "object") return;
        if (d.typ === "batch" && Array.isArray(d.ereignisse)) window.__ereignisse.push(...d.ereignisse);
        else window.__ereignisse.push(d);
        for (const f of [...window.__ereignisWecker]) f();
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
          // Nie die echte GPU (Herd, H6): WebGL2 kommt aus SwiftShader (Software), WebGPU gibt es so nicht → Herd nimmt WebGL2.
          // Nur für Messungen durch den Nutzer: E2E_GPU=1 lässt die echte GPU zu (weiter headless, kein sichtbares Fenster).
          ...(process.env.E2E_GPU === "1" ? ["--enable-unsafe-webgpu"] : ["--disable-gpu", "--enable-unsafe-swiftshader"]),
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
    await page.evaluateOnNewDocument(THEKE_UHR);
    // Deterministischer Zufall wie in Tests/Beispielen (Saat 42, K-077): Häkchen „feste Saat“ vorbelegen,
    // sofern ein Test nichts anderes gesetzt hat.
    await page.evaluateOnNewDocument(() => { try { if (localStorage.getItem("pizza.festeSaat") == null) localStorage.setItem("pizza.festeSaat", "1"); } catch (e) { /* egal */ } });
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
    if (terminal) {
      let t = teile.map((x) => (x.panik && !x.t.endsWith("\n") ? x.t + "\n" : x.t)).join("");
      // Hawaii-Banner als normale Fehlerausgabe: die UI zeigt den Panik-Text ohne abschließendes \n,
      // .erwartet führt ihn (wie jedes Ereignis) als Zeile. Nur dann ergänzen, wenn die Panik das letzte Ereignis war.
      const ev = (window.__ereignisse || []).filter((e) => ["ausgabe", "fehlerausgabe", "panik"].includes(e.typ));
      const letzte = ev[ev.length - 1];
      if (letzte && letzte.typ === "panik" && !t.endsWith("\n")) t += "\n";
      return t;
    }
    return teile.map((x) => x.t).join("\n") + "\n";
  });
}

/** Meldungen (warnung/fehler/system) der Konsole. */
export function konsolenMeldungen(page) {
  return page.$$eval("#konsole-inhalt .k-meldung", (k) => k.map((e) => ({
    klasse: e.className, text: (e.querySelector(".k-text") || e).textContent, ort: (e.querySelector(".k-ort") || {}).textContent || null, knopf: e.tagName === "BUTTON",
  })));
}

export const EXIT_TEXT = { 0: "gegessen · 0", 1: "Ananas · 1", 2: "Fehler · 2", 3: "noch im Ofen · 3" };
export const EXIT_KLASSE = { 0: "ok", 1: "ananas", 2: "fehler", 3: "ofen", 39: "fehler" };

/**
 * Prüft das Exit-Badge. Exit 39 (Hawaii) wird seit der Nutzerentscheidung wie ein normaler Fehler gezeigt:
 * Text enthält „39“, Stil „fehler“ – kein eigener Hawaii-Stil mehr.
 */
export async function pruefeExit(page, code, nachricht = "Exit-Badge") {
  const b = await exitBadge(page);
  assert.equal(b.hidden, false, nachricht + ": sichtbar");
  if (code === 39) {
    assert.match(b.text, /\b39\b/, nachricht + ": Text");
    assert.match(b.klasse, /\bfehler\b/, nachricht + ": Fehler-Stil");
    assert.doesNotMatch(b.klasse, /\bhawaii\b/, nachricht + ": kein Sonder-Stil");
  } else {
    assert.equal(b.text, EXIT_TEXT[code], nachricht + ": Text");
    assert.match(b.klasse, new RegExp("\\b" + EXIT_KLASSE[code] + "\\b"), nachricht + ": Stil");
  }
  return b;
}

/** Gibt es (noch) ein sichtbares Hawaii-Crash-Overlay? (soll es nicht mehr geben) */
export function hawaiiOverlayOffen(page) {
  return page.evaluate(() => {
    const h = document.getElementById("hawaii");
    return !!(h && !h.hidden && h.getClientRects().length) || document.body.classList.contains("hawaii-aktiv");
  });
}

/** Ist der Backen-Knopf sichtbar und nicht von etwas überdeckt? Liefert null oder den Verdecker. */
export function backenVerdeckt(page) {
  return page.evaluate(() => {
    const k = document.getElementById("knopf-backen");
    if (!k || k.hidden) return "Backen-Knopf unsichtbar";
    const r = k.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return e && !e.closest("#knopf-backen") ? (e.id || String(e.className)) : null;
  });
}

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
// ---------------------------------------------------------------- Projekte (PROJEKTE.md §3, PB1)
export const PJ = {
  menueKnopf: '[data-testid="projekt-menue-knopf"]',
  name: '[data-testid="projekt-name"]',
  menue: '[data-testid="projekt-menue"]',
  eintrag: '[data-testid="projekt-liste-eintrag"]',
  baum: '[data-testid="dateibaum"]',
  baumDatei: '[data-testid="baum-datei"]',
  baumOrdner: '[data-testid="baum-ordner"]',
};
/** Name des aktiven Projekts (Kopfzeile). */
export function aktivesProjekt(page) {
  return page.$eval(PJ.name, (e) => e.textContent);
}
export async function warteAufProjekt(page, name, timeout = 5000) {
  await page.waitForFunction((sel, n) => document.querySelector(sel) && document.querySelector(sel).textContent === n, { timeout }, PJ.name, name);
}
/** Projektmenü öffnen → Namen der Projekte in der Liste (zuletzt geändert zuerst). */
export async function projektListe(page) {
  await oeffneProjektmenue(page);
  const namen = await page.$$eval(PJ.eintrag, (e) => e.map((x) => x.querySelector(".menue-text").textContent));
  await page.keyboard.press("Escape");
  await page.waitForFunction((sel) => !document.querySelector(sel), {}, PJ.menue);
  return namen;
}
export async function oeffneProjektmenue(page) {
  if (!(await page.$(PJ.menue))) await page.click(PJ.menueKnopf);
  await page.waitForSelector(PJ.menue);
  // Das Suchfeld bekommt den Fokus erst im nächsten Frame – vorher ginge ein Escape an den Knopf und das Menü bliebe offen
  await page.waitForFunction((sel) => document.activeElement && document.activeElement.closest(sel), {}, PJ.menue);
}
/** Eintrag im Projektmenü anklicken (testid, z. B. "projekt-neu", "projekt-zip-export"). */
export async function projektBefehl(page, testid) {
  await oeffneProjektmenue(page);
  // echter Mausklick (Nutzeraktivierung – z. B. für den Datei-Dialog von „ZIP importieren“)
  await page.click(`${PJ.menue} [data-testid="${testid}"]`);
}
/** Über das Projektmenü zu einem Projekt wechseln. */
export async function wechsleProjekt(page, name) {
  await oeffneProjektmenue(page);
  const ok = await page.$$eval(PJ.eintrag, (e, n) => { const z = e.find((x) => x.querySelector(".menue-text").textContent === n); if (z) z.click(); return !!z; }, name);
  assert.ok(ok, "Projekt im Menü: " + name);
  await warteAufProjekt(page, name);
}
/** Dateien im Dateibaum (Pfade). */
export function baumDateien(page) {
  return page.$$eval('[data-testid="baum-datei"]', (e) => e.map((x) => x.dataset.pfad));
}

/** „+“ = neues Ein-Datei-Projekt (PB1): wartet, bis ein ANDERES Projekt „unbenannt-N“ aktiv ist. */
export async function neuerTab(page) {
  const vorher = await page.$eval(PJ.name, (e) => e.textContent).catch(() => null);
  await page.click(S.tabNeu);
  await page.waitForFunction((sel, pj, alt) => {
    const n = document.querySelector(pj);
    return n && n.textContent !== alt && /^unbenannt/.test(n.textContent) && /^unbenannt/.test(document.querySelector(sel + " .etab-name, " + sel).textContent);
  }, {}, S.tabAktiv.split(",")[0], PJ.name, vorher);
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

// Gemeinsamer Beispiel-Leser (scripts/beispiele.js, PROJEKTE §7): Ordner + pruefung/, Imperium bis PB5 im alten Format
const BSP = createRequire(import.meta.url)("../scripts/beispiele.js");

/**
 * Alle Beispiele aus den Manifesten (nur vorhandene Teil-Manifeste): Manifestfelder + kategorie, teil, hauptdatei (Tab-Name in der
 * Galerie-Kopie), hauptdateiUrl (relativ zu beispiele/), exitCode (pruefung/exitcode), erwartetText; `leser` = Eintrag des Lesers.
 */
export function beispieleAusManifesten() {
  const basis = path.join(SITE, "beispiele");
  const index = JSON.parse(fs.readFileSync(path.join(basis, "index.json"), "utf8"));
  const fehlend = (index.teile || []).filter((t) => !fs.existsSync(path.join(basis, t)));
  const liste = BSP.leseBeispiele({ basis }).map((b) => ({
    ...b.eintrag, kategorie: b.kategorie, teil: b.teil, ordner: b.ordner, hauptdatei: b.hauptdatei, hauptdateiUrl: b.hauptdateiUrl,
    exitCode: b.exitCode, erwartet: b.ordner ? b.ordner + "/pruefung/erwartet" : b.eintrag.erwartet,
    erwartetText: (b.erwartet || "").replace(/\r\n/g, "\n"), leser: b,
  }));
  return { liste, fehlend, teile: index.teile || [] };
}

// ---------------------------------------------------------------- Interaktive Eingabe (EINGABE.md)
/** Leert die Ereignis-Aufzeichnung (vor einem Lauf aufrufen). */
/**
 * Vor jedem Lauf: Ereignis-Aufzeichnung leeren und den Vorrat (Vorratskammer, localStorage „pizza.vorrat.*“) entfernen,
 * damit jeder Lauf wie die Referenz (.erwartet) mit leerem Vorrat startet – sonst setzt z. B. pizza-imperium
 * den Spielstand des vorigen Laufs fort.
 */
export function ereignisseLeeren(page) {
  return page.evaluate(() => {
    window.__ereignisse = [];
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("pizza.vorrat.") || k.startsWith("pizza.vorrat-beispiel.")) localStorage.removeItem(k);
    } catch (e) { /* egal */ }
  });
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

/** Eingabedatei eines Beispiels (pruefung/eingabe bzw. im alten Format Manifestfeld "eingabe"/gleichnamige .eingabe). */
export function eingabeZeilen(b) {
  const roh = b.leser ? b.leser.pruefText("eingabe") : null;
  if (roh === null) return null;
  const t = roh.replace(/\r\n?/g, "\n");
  if (t === "") return [];
  return t.replace(/\n$/, "").split("\n");
}

/**
 * Zeitlimit für EINEN Lauf eines Beispiels: Grundbudget + Zuschlag je Theke-Ereignis bzw. Eingabezeile.
 * Statt eines pauschalen Limits für die ganze Beispiel-Schleife bekommt jedes Beispiel (je Modus) sein eigenes Limit –
 * ein langes Szenario (Pizza-Imperium, >1000 Ereignisse) verdrängt so nicht das Budget der übrigen Beispiele, und ein
 * hängendes Beispiel scheitert mit seinem eigenen Namen statt als Timeout des Sammeltests.
 */
export function beispielZeitlimit(b) {
  const n = (thekeEreignisse(b)?.length || 0) + (eingabeZeilen(b)?.length || 0);
  return 15_000 + 50 * n;
}

/** Summe der Beispiel-Zeitlimits (für den umschließenden Sammeltest) zuzüglich Vorlauf. */
export function sammelZeitlimit(beispiele, laeufeJeBeispiel = 1) {
  return 30_000 + laeufeJeBeispiel * beispiele.reduce((s, b) => s + beispielZeitlimit(b), 0);
}

/** Unterstützen Interpreter und UI interaktive Eingabe? */
export function eingabeUnterstuetzt(page) {
  return page.evaluate(() => !!(window.PizzaLang && /Bestellannahme/.test(String(window.PizzaLang.BUILTINS || "")) || document.querySelector('[data-testid="konsole-eingabe"]')));
}

// ---------------------------------------------------------------- Theke (THEKE.md): Vorschaufenster
export const VORSCHAU = '[data-testid="vorschau"], #vorschau';
export const VORSCHAU_ZU = '[data-testid="vorschau-schliessen"], #vorschau-schliessen';

/** pruefung/ereignisse eines Beispiels (JSON-Lines) oder null. */
export function thekeEreignisse(b) {
  return b.leser ? b.leser.ereignisse : null;
}

/** pruefung/ui-erwartet eines Beispiels (JSON-Lines aller ui-Nachrichten) oder null. */
export function thekeUiErwartet(b) {
  return b.leser ? b.leser.uiErwartet : null;
}

/** Alle bisher empfangenen ui-Nachrichten (Programm → Renderer). */
export function uiNachrichten(page) {
  return page.evaluate(() => (window.__ereignisse || []).filter((e) => e.typ === "ui").map((e) => e.nachricht));
}

const laufVorbei = (page) => page.evaluate(() => !document.body.classList.contains("laeuft") && !document.getElementById("knopf-backen").hidden);

/**
 * Wartet, bis mehr als `vorher` ui-warte-Ereignisse da sind (das Programm wartet in bediene()) oder der Lauf vorbei ist,
 * und liefert {zahl, vorbei} in EINEM Aufruf. Geweckt wird sofort bei jedem neuen Worker-Ereignis (EREIGNIS_REKORDER);
 * das Laufende hängt am DOM (Klasse „laeuft“, Backen-Knopf) und wird zusätzlich alle 20 ms geprüft.
 */
function bedieneStand(page, vorher, timeout) {
  return page.evaluate((n, ms) => new Promise((ok, fehler) => {
    const wecker = window.__ereignisWecker;
    let iv = 0, zeit = 0;
    const fertig = () => { clearInterval(iv); clearTimeout(zeit); if (wecker) wecker.delete(pruefe); };
    function pruefe() {
      const zahl = (window.__ereignisse || []).filter((e) => e.typ === "ui-warte").length;
      const vorbei = !document.body.classList.contains("laeuft") && !document.getElementById("knopf-backen").hidden;
      if (zahl > n || vorbei) { fertig(); ok({ zahl, vorbei }); return true; }
      return false;
    }
    if (pruefe()) return;
    if (wecker) wecker.add(pruefe);
    iv = setInterval(pruefe, 20);
    zeit = setTimeout(() => { fertig(); fehler(new Error(`Waiting failed: ${ms}ms exceeded – bediene() wartet nicht (ui-warte ≤ ${n})`)); }, ms);
  }), vorher, timeout);
}

/** Wartet, bis das Programm in bediene() auf das nächste Ereignis wartet (oder der Lauf vorbei ist). */
export async function warteAufBediene(page, vorher, timeout = 8000) {
  await bedieneStand(page, vorher, timeout);
}

/**
 * Läuft in der Seite: bestimmt für ein Theke-Ereignis das Klickziel (gleiche Regeln wie die ausführlichen Zweige in
 * thekeEreignis) → {tun:"klick", x, y} | {tun:"deaktiviert"} | {tun:"nichts"} | {tun:"anders"} | {fehler}.
 * Wartet bis 5 s auf die Zutat (wie waitForSelector).
 */
function klickPlan(sel, ev) {
  const bis = Date.now() + 5000;
  return new Promise((fertig) => {
    const versuche = () => {
      const el = document.querySelector(sel);
      if (!el) {
        if (Date.now() > bis) fertig({ fehler: `Waiting for selector \`${sel}\` failed: 5000ms exceeded` });
        else setTimeout(versuche, 10);
        return;
      }
      fertig(plane(el));
    };
    const ziel = (z) => {
      // wie scrollIntoViewIfNeeded: auch innere Rollbereiche (Vorschau-Inhalt) so wenig wie nötig rollen
      z.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = z.getBoundingClientRect();
      if (!r.width || !r.height) return { tun: "anders" }; // Sonderfälle meldet der bisherige Weg (Puppeteer) wie gewohnt
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      // Liegt etwas darüber (z. B. Schwebetext), bleibt es beim bisherigen Weg über ElementHandle.click()
      const oben = document.elementFromPoint(x, y);
      if (!oben || !(oben === z || z.contains(oben))) return { tun: "anders" };
      return { tun: "klick", x, y };
    };
    const plane = (el) => {
      const w = ev.wert;
      if (ev.typ === "klick") {
        const knopf = el.matches("button") ? el : el.querySelector("button") || el;
        if (knopf.disabled || knopf.getAttribute("aria-disabled") === "true") return { tun: "deaktiviert" };
        const r = knopf.getBoundingClientRect();
        if (!r.width || !r.height) {
          const tab = document.querySelector("#vorschau")?.querySelector('[role="tab"][aria-selected="true"]');
          return { fehler: `Theke-Ereignis ${JSON.stringify(ev)} zielt auf eine unsichtbare Zutat (aktiver Reiter: ${tab ? tab.textContent.trim() : "–"}) – das kann kein Nutzer klicken; .ereignisse prüfen` };
        }
        return ziel(knopf);
      }
      if (ev.typ !== "aenderung") return { tun: "anders" };
      if (typeof w === "boolean" && el.matches(".theke-abschnitt")) {
        const kopf = el.querySelector(":scope > .theke-abschnitt-titel > .theke-abschnitt-knopf");
        if (!kopf) return { fehler: "Abschnitt '" + ev.id + "' ist nicht klappbar" };
        if ((kopf.getAttribute("aria-expanded") === "false") === w) return { tun: "deaktiviert" };
        return ziel(kopf);
      }
      if (typeof w === "number" && el.matches(".theke-auswahl")) {
        const option = el.querySelector(`[role="radio"][data-theke-nr="${w}"]`);
        if (!option) return { fehler: "Auswahl '" + ev.id + "' hat keine Option " + w };
        if (option.getAttribute("aria-checked") === "true" || option.disabled) return { tun: "deaktiviert" };
        return ziel(option);
      }
      if (typeof w === "boolean") {
        const box = el.matches("input") ? el : el.querySelector("input");
        return box.checked !== w ? ziel(box) : { tun: "nichts" };
      }
      if (typeof w === "number" && el.matches(".theke-reiter, [data-theke-art='reiter']")) {
        const tab = el.querySelector(`[role="tab"][data-theke-nr="${w}"]`);
        if (!tab) return { fehler: "Reiter '" + ev.id + "' hat keinen Tab " + w };
        if (tab.getAttribute("aria-selected") === "true") return { tun: "deaktiviert" };
        return ziel(tab);
      }
      return { tun: "anders" };
    };
    versuche();
  });
}

/** Spielt ein Theke-Ereignis im Vorschaufenster nach – so nah am Nutzer wie möglich (echte Klicks/Enter). */
export async function thekeEreignis(page, ev) {
  if (ev.typ === "geschlossen") { await page.click(VORSCHAU_ZU); return; }
  const sel = `${VORSCHAU.split(",")[1].trim()} [data-theke-id="${ev.id}"]`;
  // Schneller Weg für alle Klick-Ereignisse (Knopf, Klapp-Kopf, Auswahl-Option, Haken, Reiter-Tab): Ziel suchen, prüfen und in
  // den sichtbaren Bereich holen in EINEM Seitenaufruf, dann ein echter Mausklick (Input.dispatchMouseEvent) auf seine Mitte –
  // wie ElementHandle.click(), aber ohne ein halbes Dutzend CDP-Rundreisen je Ereignis (Pizza-Imperium: >900 Klicks je Lauf).
  const plan = await page.evaluate(klickPlan, sel, ev);
  if (plan.fehler) throw new Error(plan.fehler);
  if (plan.tun === "deaktiviert") return "deaktiviert";
  if (plan.tun === "nichts") return;
  if (plan.tun === "klick") { await page.mouse.click(plan.x, plan.y); return; }
  const el = await page.waitForSelector(sel, { timeout: 5000 });
  if (ev.typ === "klick") {
    const knopf = (await el.evaluate((e) => e.matches("button"))) ? el : (await el.$("button")) || el;
    // .ereignisse dürfen Klicks auf deaktivierte Knöpfe enthalten (z. B. belegtes Tic-Tac-Toe-Feld): im Browser
    // erzeugt so ein Klick kein Ereignis – das Programm würde ihn ohnehin ignorieren.
    if (await knopf.evaluate((k) => k.disabled || k.getAttribute("aria-disabled") === "true")) return "deaktiviert";
    // Unsichtbare Zutat (z. B. in einem nicht gewählten Reiter): ein echter Nutzer kann sie nicht klicken → das
    // Szenario ist fehlerhaft (vorher per „aenderung“ den Reiter wechseln). Klar melden statt Puppeteers
    // „Node is either not clickable …“.
    const unsichtbar = await knopf.evaluate((k) => {
      const r = k.getBoundingClientRect();
      if (r.width && r.height) return null;
      const tab = document.querySelector("#vorschau")?.querySelector('[role="tab"][aria-selected="true"]');
      return tab ? tab.textContent.trim() : "–";
    });
    if (unsichtbar) throw new Error(`Theke-Ereignis ${JSON.stringify(ev)} zielt auf eine unsichtbare Zutat (aktiver Reiter: ${unsichtbar}) – das kann kein Nutzer klicken; .ereignisse prüfen`);
    await knopf.click();
  } else if (ev.typ === "taste") {
    // Tastatur (v4, K-110): Fokus auf die Theke-Wurzel – nicht auf einem Knopf lassen, sonst klickte die Leertaste ihn zusätzlich
    // (das wäre ein zweites Ereignis, das nicht in der .ereignisse steht) –, dann die Taste wie ein Nutzer drücken.
    const TASTEN = { Leertaste: "Space", Links: "ArrowLeft", Rechts: "ArrowRight", Hoch: "ArrowUp", Runter: "ArrowDown",
      "Rücktaste": "Backspace", Entfernen: "Delete", Pos1: "Home", Ende: "End", BildHoch: "PageUp", BildRunter: "PageDown" };
    await el.evaluate((e) => { const w = e.closest(".theke"); w.focus(); });
    await page.keyboard.press(TASTEN[ev.taste] || ev.taste);
  } else if (ev.typ === "aenderung" && typeof ev.wert === "boolean" && (await el.evaluate((e) => e.matches(".theke-abschnitt")))) {
    // Klappbarer Abschnitt (v4, K-108): wert = neuer zu-Zustand; Klick auf den Kopf, nur wenn er sich ändert
    const kopf = await el.$(":scope > .theke-abschnitt-titel > .theke-abschnitt-knopf");
    if (!kopf) throw new Error("Abschnitt '" + ev.id + "' ist nicht klappbar");
    if ((await kopf.evaluate((k) => k.getAttribute("aria-expanded") === "false")) === ev.wert) return "deaktiviert";
    await kopf.click();
  } else if (ev.typ === "aenderung" && typeof ev.wert === "number" && (await el.evaluate((e) => e.matches(".theke-auswahl")))) {
    // Auswahl (v4, K-109): echter Klick auf die Option mit der (1-basierten) Nummer; bereits gewählte sendet nichts
    const option = await el.$(`[role="radio"][data-theke-nr="${ev.wert}"]`);
    if (!option) throw new Error("Auswahl '" + ev.id + "' hat keine Option " + ev.wert);
    if (await option.evaluate((o) => o.getAttribute("aria-checked") === "true" || o.disabled)) return "deaktiviert";
    await option.click();
  } else if (ev.typ === "aenderung" && typeof ev.wert === "boolean") {
    const box = (await el.evaluate((e) => e.matches("input"))) ? el : await el.$("input");
    if ((await box.evaluate((b) => b.checked)) !== ev.wert) await box.click();
  } else if (ev.typ === "aenderung" && typeof ev.wert === "number" && (await el.evaluate((e) => e.matches(".theke-reiter, [data-theke-art='reiter']")))) {
    // Reiter: echter Klick auf den Tab mit der (1-basierten) Nummer; bereits gewählter Tab sendet nichts
    const tab = await el.$(`[role="tab"][data-theke-nr="${ev.wert}"]`);
    if (!tab) throw new Error("Reiter '" + ev.id + "' hat keinen Tab " + ev.wert);
    if (await tab.evaluate((t) => t.getAttribute("aria-selected") === "true")) return "deaktiviert";
    await tab.click();
  } else if (ev.typ === "aenderung") {
    // Wert setzen + input-Event (ein Ereignis pro Zeile in .ereignisse, wie die Testdatei es vorgibt)
    await el.evaluate((e, w) => { const i = e.matches("input") ? e : e.querySelector("input"); i.focus(); i.value = w; i.dispatchEvent(new Event("input", { bubbles: true })); }, String(ev.wert));
  } else if (ev.typ === "takt") {
    // Genau so weit vorspulen, dass dieser Takt einen Schlag mit ev.anzahl sendet: Nach jedem Vorspulen werden alle
    // Timer abgefragt, also gilt 0 ≤ jetzt − letzter < intervall; + anzahl·intervall ergibt floor(…) = anzahl.
    const intervall = await taktIntervall(page, ev.id);
    const anzahl = ev.anzahl == null ? 1 : ev.anzahl;
    const gesendet = await page.evaluate((ms) => { const u = window.__thekeUhr; const vor = u.taktGesendet; u.vorspulen(ms); return u.taktGesendet - vor; }, anzahl * intervall);
    if (!gesendet) return "deaktiviert"; // inaktiver/entfernter Takt: Renderer sendet nichts, Programm würde ignorieren
  } else if (ev.typ === "enter") {
    const i = (await el.evaluate((e) => e.matches("input"))) ? el : await el.$("input");
    if (ev.wert != null) await i.evaluate((x, w) => { if (x.value !== w) x.value = w; }, String(ev.wert));
    await i.focus();
    await page.keyboard.press("Enter");
  } else {
    throw new Error("Unbekanntes Theke-Ereignis: " + JSON.stringify(ev));
  }
}

/**
 * Backt ein Theke-Programm: wartet auf das Vorschaufenster, spielt die Ereignisse nach (jeweils erst, wenn das
 * Programm in bediene() wartet), schließt am Ende (falls nicht in den Ereignissen) und wartet auf das Laufende.
 */
export async function backenTheke(page, ereignisse, { timeout = 30_000 } = {}) {
  await ereignisseLeeren(page);
  await page.focus("#editor .cm-content");
  await strg(page, "Enter");
  await page.waitForSelector(`${VORSCHAU.split(",")[1].trim()}:not([hidden]) [data-theke-id]`, { timeout: 10_000 });
  let geschlossen = false;
  let nr = 0;
  try {
    for (const ev of ereignisse) {
      const stand = await bedieneStand(page, 0, 8000); // ein Aufruf statt laufVorbei + warteAufBediene + Zählen
      if (stand.vorbei) break;
      const vorher = stand.zahl;
      const r = await thekeEreignis(page, ev);
      if (ev.typ === "geschlossen") { geschlossen = true; break; }
      if (r !== "deaktiviert") await warteAufBediene(page, vorher);
      nr++;
    }
  } catch (e) {
    // Lauf nicht offen stehen lassen: sonst scheitert der nächste Test derselben Seite nur als Folgefehler (Timeout)
    try { if (!(await laufVorbei(page))) await page.click(VORSCHAU_ZU); await warteLaufEnde(page, 5000); } catch { /* Originalfehler zählt */ }
    e.message = `Ereignis #${nr} (Zeile ${nr + 1} der .ereignisse): ` + e.message;
    throw e;
  }
  if (!geschlossen && !(await laufVorbei(page))) await page.click(VORSCHAU_ZU);
  await warteLaufEnde(page, timeout);
}

/** Wie warteAufTab, akzeptiert aber eindeutig gemachte Namen (name-2.pizza …). */
export async function warteAufTabMuster(page, name, timeout = 5000) {
  const basis = name.replace(/\.pizza$/, "");
  await page.waitForFunction((sel, b) => {
    const a = document.querySelector(sel);
    const t = a && a.querySelector(".etab-name");
    if (!t) return false;
    const n = t.textContent;
    return n === b + ".pizza" || (n.startsWith(b + "-") && /^\d+\.pizza$/.test(n.slice(b.length + 1)));
  }, { timeout }, S.tabAktiv, basis);
}

/**
 * Aktuelles Intervall (ms) eines Takts laut den bisher empfangenen ui-Nachrichten (baum/aendere).
 * Läuft vollständig in der Seite und inkrementell: ausgewertet werden nur die seit dem letzten Aufruf neuen Ereignisse
 * (Cache je Ereignis-Array; ereignisseLeeren() ersetzt das Array → neuer Cache). Früher wurden bei JEDEM takt-Ereignis
 * alle ui-Nachrichten über CDP nach Node kopiert – beim Pizza-Imperium (338 Takte, ~800 KB ui-Nachrichten) ein
 * Großteil der Laufzeit. Ergebnis wie zuvor: der zuletzt gemeldete Wert je ID gewinnt.
 */
export async function taktIntervall(page, id) {
  const intervall = await page.evaluate((id) => {
    const ev = window.__ereignisse || [];
    let c = window.__taktIntervalle;
    if (!c || c.quelle !== ev || c.pos > ev.length) c = window.__taktIntervalle = { quelle: ev, pos: 0, werte: Object.create(null) };
    const suche = (k) => {
      if (!k || typeof k !== "object") return;
      if (k.id != null && k.intervall != null) c.werte[k.id] = Number(k.intervall);
      for (const kind of k.kinder || []) suche(kind);
      for (const v of Object.values(k)) if (v && typeof v === "object" && !Array.isArray(v) && v !== k.kinder) suche(v);
    };
    for (; c.pos < ev.length; c.pos++) {
      const e = ev[c.pos];
      if (e.typ !== "ui" || !e.nachricht) continue;
      const n = e.nachricht;
      if (n.op === "baum") suche(n.wurzel);
      else if (n.op === "aendere") { for (const a of n.aenderungen || []) if (a.id != null && a.intervall != null) c.werte[a.id] = Number(a.intervall); }
      else if (n.op === "hinzu" || n.op === "ersetze") suche(n);
    }
    return id in c.werte ? c.werte[id] : null;
  }, id);
  if (intervall == null) throw new Error("Takt '" + id + "' nicht in den ui-Nachrichten gefunden");
  return Math.max(100, intervall); // Renderer hebt < 100 ms auf 100 ms an
}

/**
 * Feste Wanduhr/Zeitzone eines Beispiels (Manifestfelder echtzeit/zone, K-087/K-154) für die folgenden Läufe setzen – die Seite
 * reicht window.__laufUhr an den Worker (wie tests/run-tests.js laufFelder). Ohne Felder: Systemzeit (null).
 */
export function setzeLaufUhr(page, b) {
  const u = {};
  if (b && typeof b.echtzeit === "number") u.echtzeit = b.echtzeit;
  if (b && typeof b.zone === "number") u.zone = b.zone;
  return page.evaluate((x) => { window.__laufUhr = Object.keys(x).length ? x : null; }, u);
}

// ---------------------------------------------------------------- Herd (H6)
/** pruefung/herd-erwartet eines Beispiels (JSON-Lines der herd-Ereignisse ohne typ) oder null. */
export function herdErwartet(b) {
  return b.leser ? b.leser.herdErwartet : null;
}

/** Kanonisches JSON (Schlüssel sortiert) – wie tests/run-tests.js herdVergleich. */
function kanonisch(x) {
  if (Array.isArray(x)) return "[" + x.map(kanonisch).join(",") + "]";
  if (x && typeof x === "object") return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + kanonisch(x[k])).join(",") + "}";
  return JSON.stringify(x);
}
/** Alle herd-Ereignisse des Laufs (ohne typ), kanonisch – zum Vergleich mit herdErwartet(b). */
export async function herdEreignisse(page) {
  const ist = await page.evaluate(() => (window.__ereignisse || []).filter((e) => e.typ === "herd").map((e) => { const o = { ...e }; delete o.typ; return o; }));
  return ist.map(kanonisch);
}
export const herdKanonisch = (liste) => liste.map(kanonisch);

/**
 * Herd-Programm backen und .ereignisse deterministisch nachspielen (wie die Theke): Im Modus window.__herdManuell schreibt
 * nicht der Zeichner die Takte, sondern der Test (window.__herdTakt) – je Takt wird gewartet, bis das Programm ein Bild
 * (oder schliesse/ende) gemeldet hat. „geschlossen“ = Schließen-Knopf. Die herd/bild-Ereignisse (Hashes) gehen dabei an die
 * Seite. Der Renderer (Render-Worker, WebGL2/SwiftShader) zeichnet nebenher.
 */
export async function backenHerd(page, ereignisse, { timeout = 30_000 } = {}) {
  await ereignisseLeeren(page);
  await page.evaluate(() => { window.__herdManuell = true; window.__herdTakt = null; });
  try {
    await page.focus("#editor .cm-content");
    await strg(page, "Enter");
    const stand = () => page.evaluate(() => ({
      herd: (window.__ereignisse || []).filter((e) => e.typ === "herd").length,
      fenster: (window.__ereignisse || []).some((e) => e.typ === "herd" && e.art === "fenster"),
      vorbei: (window.__ereignisse || []).some((e) => e.typ === "ende"),
      bereit: typeof window.__herdTakt === "function",
    }));
    await page.waitForFunction(() => (window.__ereignisse || []).some((e) => (e.typ === "herd" && e.art === "fenster") || e.typ === "ende")
      && typeof window.__herdTakt === "function" || (window.__ereignisse || []).some((e) => e.typ === "ende"), { timeout: 15_000, polling: 10 });
    let nr = 0;
    for (const ev of ereignisse) {
      const s = await stand();
      if (s.vorbei) break;
      try {
        if (ev.typ === "geschlossen") { await page.click(VORSCHAU_ZU); break; }
        await page.evaluate((e) => window.__herdTakt(e), ev);
        await page.waitForFunction((n) => {
          const l = window.__ereignisse || [];
          return l.filter((e) => e.typ === "herd").length > n || l.some((e) => e.typ === "ende");
        }, { timeout: 10_000, polling: 5 }, s.herd);
      } catch (e) {
        e.message = `Ereignis #${nr} (Zeile ${nr + 1} der .ereignisse): ` + e.message;
        throw e;
      }
      nr++;
    }
    if (!(await laufVorbei(page)) && !(await stand()).vorbei) {
      if (await page.$eval(VORSCHAU, (v) => !v.hidden)) await page.click(VORSCHAU_ZU);
    }
    await warteLaufEnde(page, timeout);
  } catch (e) {
    try { if (!(await laufVorbei(page))) await page.click('[data-testid="knopf-abbrechen"], #knopf-abbrechen'); await warteLaufEnde(page, 5000); } catch { /* Originalfehler zählt */ }
    throw e;
  } finally {
    await page.evaluate(() => { window.__herdManuell = false; }).catch(() => {});
  }
}
