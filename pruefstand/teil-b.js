"use strict";
// Teil B: Interpreter-freie Prüfungen (Manifeste, Doku-Daten, SVGs, index.html, keine CDN-URLs).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { wohlgeformt } = require("./lib/xml");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const istDatei = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const istOrdner = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

function alleDateien(dir, filter = () => true) {
  const out = [];
  if (!istOrdner(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...alleDateien(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out.sort();
}

function leseJson(p, fehler) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
  } catch (e) {
    fehler.push(`${rel(p)}: ungültiges JSON (${e.message})`);
    return null;
  }
}

// ───────────────────────── Manifeste ─────────────────────────
// Gemeinsamer Leser (scripts/beispiele.js, PROJEKTE §7, K-144): Ordner + Dateiliste, pizza.json, pruefung/, Waisen, ids, Übergang
// `datei` nur für das Imperium (PB5) – dieselbe Prüfung wie `node scripts/beispiele.js --pruefe` in `npm test`.
const BSP_LESER = require(path.join(ROOT, "scripts", "beispiele.js"));
const EXITCODES = BSP_LESER.EXITCODES;

/** Alle Beispiele in gleicher Form (Ordner und altes Format), siehe scripts/beispiele.js. */
function beispiele() { return BSP_LESER.leseBeispiele(); }

function ladeManifeste() {
  const fehler = BSP_LESER.pruefe();
  return { fehler, hinweise: [`${beispiele().length} Beispiele`] };
}

/** Ausführbar: jede Hauptdatei existiert und hat ein pruefung/erwartet (bzw. .erwartet im Übergang). */
function pruefeBeispielDateien() {
  const fehler = [];
  for (const b of beispiele()) {
    if (!istDatei(b.hauptdateiPfad)) fehler.push(`${b.name}: Hauptdatei ${b.hauptdateiUrl} fehlt`);
    if (b.erwartet === null) fehler.push(`${b.name}: keine erwartete Ausgabe (${b.format === "ordner" ? "pruefung/erwartet" : ".erwartet"})`);
  }
  return { fehler };
}

// ───────────────────────── Doku ─────────────────────────
const ARTEN = ["text", "code", "tabelle", "hinweis", "ausgabe", "kurz", "bild", "details"];
const TOENE = ["info", "warnung", "pizza"];
const DOKU_BEREICHE = {
  "00-geschichte.js": [[0, 99]],
  "10-sprache.js": [[100, 299], [400, 499]],
  "20-pizzafunktionen.js": [[300, 399]],
  "30-referenz.js": [[500, 590], [599, 699]],
  "40-herd.js": [[591, 598]],
};
const BILD_PRAEFIX = { "00-geschichte.js": "ge-", "10-sprache.js": "sp-", "20-pizzafunktionen.js": "pf-", "30-referenz.js": "re-", "40-herd.js": "he-" };

/** Lädt jede Doku-Datei in einem frischen VM-Kontext. → { dateien: [{datei, abschnitte, fehler}] } */
function ladeDoku() {
  const dir = path.join(SITE, "js", "doku");
  const dateien = [];
  for (const p of alleDateien(dir, (f) => f.endsWith(".js"))) {
    const name = path.basename(p);
    const ctx = { console: { log() {}, warn() {}, error() {} } };
    ctx.self = ctx;
    vm.createContext(ctx);
    let fehler = null;
    try {
      vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: p, timeout: 5000 });
    } catch (e) {
      fehler = String(e && e.message || e);
    }
    const abschnitte = Array.isArray(ctx.PIZZA_DOKU) ? JSON.parse(JSON.stringify(ctx.PIZZA_DOKU)) : null;
    dateien.push({ datei: name, pfad: p, abschnitte, fehler });
  }
  return dateien;
}

function sammleBloecke(inhalt, cb, pfad = "") {
  if (!Array.isArray(inhalt)) return;
  inhalt.forEach((b, i) => {
    cb(b, `${pfad}inhalt[${i}]`);
    if (b && b.art === "details") sammleBloecke(b.inhalt, cb, `${pfad}inhalt[${i}].`);
  });
}

function pruefeDoku() {
  const fehler = [];
  const hinweise = [];
  const dateien = ladeDoku();
  if (!dateien.length) return { fehler: ["keine Doku-Dateien unter site/js/doku/"] };
  for (const erwartet of Object.keys(DOKU_BEREICHE)) {
    if (!dateien.find((d) => d.datei === erwartet)) fehler.push(`Doku-Datei ${erwartet} fehlt (ARCHITEKTUR §4)`);
  }
  const ids = new Map();
  for (const d of dateien) {
    if (d.fehler) { fehler.push(`${d.datei}: lädt nicht in Node: ${d.fehler}`); continue; }
    if (!d.abschnitte || !d.abschnitte.length) { fehler.push(`${d.datei}: registriert keine Abschnitte in PIZZA_DOKU`); continue; }
    for (const a of d.abschnitte) {
      const wo = `${d.datei}:${a && a.id ? a.id : "?"}`;
      if (!a || typeof a !== "object") { fehler.push(`${wo}: Abschnitt ist kein Objekt`); continue; }
      for (const k of ["id", "gruppe", "titel"]) if (typeof a[k] !== "string" || !a[k].trim()) fehler.push(`${wo}: Pflichtfeld '${k}' fehlt/leer`);
      if (typeof a.ordnung !== "number" || !isFinite(a.ordnung)) fehler.push(`${wo}: 'ordnung' ist keine Zahl`);
      else if (a.ordnung < 0 || a.ordnung > 699) fehler.push(`${wo}: ordnung ${a.ordnung} außerhalb 0–699`);
      else if (DOKU_BEREICHE[d.datei] && !DOKU_BEREICHE[d.datei].some(([v, b]) => a.ordnung >= v && a.ordnung <= b)) {
        hinweise.push(`${wo}: ordnung ${a.ordnung} außerhalb des Bereichs der Datei (${DOKU_BEREICHE[d.datei].map((x) => x.join("–")).join(", ")})`);
      }
      if (![1, 2, 3].includes(a.tier)) fehler.push(`${wo}: tier ${JSON.stringify(a.tier)} ∉ {1,2,3}`);
      if (!Array.isArray(a.inhalt) || !a.inhalt.length) { fehler.push(`${wo}: 'inhalt' fehlt/leer`); continue; }
      if (typeof a.id === "string") {
        if (ids.has(a.id)) fehler.push(`${wo}: id '${a.id}' doppelt (auch in ${ids.get(a.id)})`);
        else ids.set(a.id, d.datei);
      }
      if (a.inhalt[0] && a.inhalt[0].art !== "kurz") hinweise.push(`${wo}: beginnt nicht mit 'kurz' (Doku v2, Regel 1)`);
      sammleBloecke(a.inhalt, (b, bp) => {
        const w = `${wo} ${bp}`;
        if (!b || typeof b !== "object") { fehler.push(`${w}: Block ist kein Objekt`); return; }
        if (!ARTEN.includes(b.art)) { fehler.push(`${w}: art ${JSON.stringify(b.art)} ungültig`); return; }
        const text = (k) => { if (typeof b[k] !== "string") fehler.push(`${w} (${b.art}): '${k}' fehlt/kein Text`); };
        switch (b.art) {
          case "text": case "kurz": text("md"); break;
          case "hinweis":
            text("md");
            if (!TOENE.includes(b.ton)) fehler.push(`${w}: hinweis.ton ${JSON.stringify(b.ton)} ∉ {${TOENE}}`);
            break;
          case "ausgabe": text("text"); break;
          case "code":
            // `code` (Text) oder `dateien` (Projekt { pfad → Text }, optional `hauptdatei`; nur Textdateien, ARCHITEKTUR §4)
            if (b.dateien !== undefined) {
              if ("code" in b) fehler.push(`${w}: code und dateien zugleich`);
              if (!b.dateien || typeof b.dateien !== "object" || Array.isArray(b.dateien) || !Object.keys(b.dateien).length) fehler.push(`${w}: dateien ist kein Objekt { pfad → Text }`);
              else for (const [p, t] of Object.entries(b.dateien)) {
                if (typeof t !== "string") fehler.push(`${w}: dateien["${p}"] ist kein Text`);
                if (!/\.(pizza|txt|json|csv|md)$/.test(p) || !/^[a-z0-9_-][a-z0-9_.-]*(\/[a-z0-9_-][a-z0-9_.-]*)*$/.test(p)) fehler.push(`${w}: dateien: ungültiger Pfad/keine Textdatei "${p}"`);
              }
              if ("hauptdatei" in b && (typeof b.hauptdatei !== "string" || !b.dateien || !(b.hauptdatei in b.dateien))) fehler.push(`${w}: hauptdatei nicht in dateien`);
            } else text("code");
            if ("ausfuehrbar" in b && typeof b.ausfuehrbar !== "boolean") fehler.push(`${w}: ausfuehrbar ist kein Boolean`);
            if ("tier" in b && ![1, 2, 3].includes(b.tier)) fehler.push(`${w}: code.tier ${JSON.stringify(b.tier)} ∉ {1,2,3}`);
            if ("exitCode" in b && !EXITCODES.includes(b.exitCode)) fehler.push(`${w}: exitCode ${JSON.stringify(b.exitCode)} ungültig`);
            break;
          case "tabelle":
            if (!Array.isArray(b.kopf)) fehler.push(`${w}: tabelle.kopf ist kein Array`);
            if (!Array.isArray(b.zeilen) || b.zeilen.some((z) => !Array.isArray(z))) fehler.push(`${w}: tabelle.zeilen ist kein Array von Arrays`);
            else if (Array.isArray(b.kopf)) b.zeilen.forEach((z, zi) => { if (z.length !== b.kopf.length) hinweise.push(`${w}: Zeile ${zi} hat ${z.length} statt ${b.kopf.length} Spalten`); });
            break;
          case "bild": {
            text("src"); text("alt");
            if (typeof b.src === "string") {
              if (/^(https?:)?\/\//.test(b.src)) fehler.push(`${w}: bild.src ist extern: ${b.src}`);
              else if (!istDatei(path.join(SITE, b.src))) fehler.push(`${w}: bild.src ${b.src} existiert nicht unter site/`);
              else {
                const pre = BILD_PRAEFIX[d.datei];
                if (pre && !path.basename(b.src).startsWith(pre)) hinweise.push(`${w}: Bild ${b.src} ohne Präfix '${pre}'`);
              }
            }
            if (typeof b.alt === "string" && !b.alt.trim()) fehler.push(`${w}: bild.alt leer`);
            break;
          }
          case "details":
            text("titel");
            if (!Array.isArray(b.inhalt)) fehler.push(`${w}: details.inhalt ist kein Array`);
            break;
        }
      });
    }
  }
  return { fehler, hinweise };
}

// ───────────────────────── SVG ─────────────────────────
function pruefeSvgs() {
  const fehler = [];
  const hinweise = [];
  const svgs = alleDateien(path.join(SITE, "img"), (f) => f.endsWith(".svg"));
  if (istDatei(path.join(SITE, "favicon.svg"))) svgs.unshift(path.join(SITE, "favicon.svg"));
  if (!svgs.length) hinweise.push("keine SVGs gefunden");
  for (const p of svgs) {
    const s = fs.readFileSync(p, "utf8");
    const r = rel(p);
    for (const f of wohlgeformt(s)) fehler.push(`${r}: nicht wohlgeformt – ${f}`);
    if (/<script\b/i.test(s)) fehler.push(`${r}: enthält <script>`);
    if (/\son[a-z]+\s*=/i.test(s)) fehler.push(`${r}: enthält Event-Handler-Attribut (on…=)`);
    const hrefRe = /\s((?:xlink:)?href)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = hrefRe.exec(s))) {
      const v = (m[3] !== undefined ? m[3] : m[4]).trim();
      if (!v.startsWith("#")) fehler.push(`${r}: externe Referenz ${m[1]}="${v}"`);
    }
    const urlRe = /url\(\s*['"]?([^'")]+)/g;
    while ((m = urlRe.exec(s))) if (!m[1].trim().startsWith("#")) fehler.push(`${r}: externe url(${m[1]})`);
    if (/@import/i.test(s)) fehler.push(`${r}: @import (externe Styles/Webfonts)`);
    if (/@font-face/i.test(s)) fehler.push(`${r}: @font-face (Webfont)`);
    if (r.startsWith("site/img/doku/")) {
      const vb = /viewBox\s*=\s*["']([^"']+)["']/.exec(s);
      if (!vb) hinweise.push(`${r}: kein viewBox`);
      else if (!["0 0 640 360", "0 0 640 240"].includes(vb[1].trim().replace(/\s+/g, " "))) hinweise.push(`${r}: viewBox "${vb[1]}" statt 0 0 640 360/240`);
    }
  }
  return { fehler, hinweise, anzahl: svgs.length };
}

// ───────────────────────── index.html ─────────────────────────
function lokaleRefs(html) {
  const refs = [];
  const re = /\s(src|href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(html))) {
    // href eines <a> ist ein Link zum Anklicken, kein Laden – extern erlaubt
    const tag = html.slice(html.lastIndexOf("<", m.index), m.index);
    const anker = m[1].toLowerCase() === "href" && /^<a\s/i.test(tag);
    refs.push({ attr: m[1], wert: (m[3] ?? m[4] ?? m[5]).trim(), anker });
  }
  return refs;
}

function pruefeIndexHtml() {
  const fehler = [];
  const hinweise = [];
  const p = path.join(SITE, "index.html");
  if (!istDatei(p)) return { fehler: ["site/index.html fehlt"] };
  const html = fs.readFileSync(p, "utf8");
  for (const { attr, wert, anker } of lokaleRefs(html)) {
    if (!wert || wert.startsWith("#") || /^(data|mailto|javascript|tel):/i.test(wert)) continue;
    if (anker && /^https:\/\//i.test(wert)) continue;
    if (/^(https?:)?\/\//i.test(wert)) { fehler.push(`index.html: externe Referenz ${attr}="${wert}"`); continue; }
    const ohne = decodeURI(wert.split(/[?#]/)[0]).replace(/^\.\//, "").replace(/^\//, "");
    if (!ohne) continue;
    if (!istDatei(path.join(SITE, ohne))) fehler.push(`index.html: ${attr}="${wert}" → site/${ohne} existiert nicht`);
  }
  // Doku-Skripte laut ARCHITEKTUR §4 eingebunden?
  for (const d of Object.keys(DOKU_BEREICHE)) {
    if (!html.includes(`js/doku/${d}`)) fehler.push(`index.html bindet js/doku/${d} nicht ein (ARCHITEKTUR §4)`);
  }
  if (!html.includes("js/pizza.js")) hinweise.push("index.html bindet js/pizza.js nicht direkt ein");
  // CSS url(...) in site/css
  for (const css of alleDateien(path.join(SITE, "css"), (f) => f.endsWith(".css"))) {
    const s = fs.readFileSync(css, "utf8");
    const re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
    let m;
    while ((m = re.exec(s))) {
      const v = m[1].trim();
      if (v.startsWith("#") || v.startsWith("data:")) continue;
      if (/^(https?:)?\/\//i.test(v)) { fehler.push(`${rel(css)}: externe url(${v})`); continue; }
      const ziel = path.resolve(path.dirname(css), v.split(/[?#]/)[0]);
      if (!istDatei(ziel)) fehler.push(`${rel(css)}: url(${v}) existiert nicht`);
    }
    if (/@import\s+(url\()?['"]?(https?:)?\/\//i.test(s)) fehler.push(`${rel(css)}: externer @import`);
  }
  return { fehler, hinweise };
}

// ───────────────────────── CDN-URLs ─────────────────────────
const CDN_HOST = /(cdn|unpkg|jsdelivr|cdnjs|googleapis|gstatic|bootstrapcdn|cloudflare|fontawesome|jquery|esm\.sh|skypack)/i;

function pruefeCdn() {
  const fehler = [];
  const hinweise = [];
  const dateien = alleDateien(SITE, (f) => /\.(html?|css|js|mjs|svg|json)$/i.test(f));
  for (const p of dateien) {
    const s = fs.readFileSync(p, "utf8");
    const r = rel(p);
    const re = /(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'`<>)]*/g;
    let m;
    const gesehen = new Set();
    while ((m = re.exec(s))) {
      const url = m[0];
      if (!/^https?:/i.test(url)) {
        // protokoll-relative URL nur in Lade-Kontext relevant
        const vor = s.slice(Math.max(0, m.index - 12), m.index);
        if (!/(src|href)\s*=\s*["']?$|url\(\s*["']?$/i.test(vor)) continue;
      }
      if (/^https?:\/\/(www\.)?w3\.org\//i.test(url)) continue; // XML-Namensräume
      if (gesehen.has(url)) continue;
      gesehen.add(url);
      const vor = s.slice(Math.max(0, m.index - 40), m.index);
      let ladeKontext = /(src|href)\s*=\s*["']?$|url\(\s*["']?$|@import\s+["']?$|importScripts\(\s*["']$|import\s*\(\s*["']$|from\s+["']$|fetch\(\s*["']$/i.test(vor);
      // href eines <a> ist ein Link zum Anklicken, kein Laden
      if (ladeKontext && /href\s*=\s*["']?$/i.test(vor) && /^<a\s/i.test(s.slice(s.lastIndexOf("<", m.index), m.index))) ladeKontext = false;
      const host = (/\/\/([^/:?#]+)/.exec(url) || [])[1] || "";
      if (CDN_HOST.test(host) || ladeKontext) fehler.push(`${r}: externe/CDN-URL ${url}`);
      else hinweise.push(`${r}: URL (kein Lade-Kontext) ${url}`);
    }
  }
  return { fehler, hinweise, anzahl: dateien.length };
}

/** Liste der Teil-B-Prüfungen. */
function pruefungen() {
  return [
    { p: "B1 Beispiel-Manifeste (ARCHITEKTUR §3)", name: "Manifeste ↔ Projektordner (ordner + dateien, pizza.json, pruefung/, keine Waisen)", fn: ladeManifeste },
    { p: "B1 Beispiel-Manifeste (ARCHITEKTUR §3)", name: "jede Hauptdatei existiert und hat eine erwartete Ausgabe", fn: pruefeBeispielDateien },
    { p: "B2 Doku-Daten (ARCHITEKTUR §4)", name: "Doku-Dateien laden, Schema, ids eindeutig, Bilder existieren", fn: pruefeDoku },
    { p: "B3 SVGs", name: "wohlgeformt, ohne <script>, ohne externe href", fn: () => { const r = pruefeSvgs(); return { fehler: r.fehler, hinweise: [`${r.anzahl} SVGs geprüft`, ...r.hinweise] }; } },
    { p: "B4 index.html", name: "referenziert nur existierende lokale Dateien", fn: pruefeIndexHtml },
    { p: "B5 Keine CDN-URLs", name: "keine externen Lade-URLs unter site/", fn: () => { const r = pruefeCdn(); return { fehler: r.fehler, hinweise: [`${r.anzahl} Dateien durchsucht`, ...r.hinweise] }; } },
  ];
}

module.exports = { pruefungen, ladeManifeste, beispiele, dokuProgramm: BSP_LESER.dokuProgramm, FREMDE_SPRACHEN: BSP_LESER.FREMDE_SPRACHEN, ladeDoku, sammleBloecke, ROOT, SITE };
