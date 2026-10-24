'use strict';
/*
 * Sammelt den Differenz-Korpus: { quelle, name, code, optionen, erwartetExit? }
 *   beispiele  – site/beispiele (index.json → Teil-Manifeste)
 *   doku       – alle ausführbaren Codeblöcke aus site/js/doku/*.js (rekursiv inkl. details)
 *   faelle     – tests/faelle/*.pizza (+ .optionen.json) und Ordner-Fälle tests/faelle/<name>/ (Projekt + pruefung/, K-144)
 *   pruefstand – pruefstand/faelle/*.js (falls vorhanden und ladbar; `code` darf ein Projekt sein)
 *   korpus     – tests/differenz/korpus/*.pizza (Kopfzeilen: // exit: N, // optionen: {...}; Eingabe: gleichnamige .eingabe)
 *                und Projekt-Ordner tests/differenz/korpus/<name>/ (Begleitdateien in pruefung/: exitcode, fehler, optionen.json, eingabe)
 * `code` ist ein Text oder ein Projekt { dateien } (SPEC §2, PROJEKTE PA2); text(code) liefert die Quelltexte für Textsuchen.
 * Eingabezeilen (EINGABE.md) landen in optionen.eingabe: Manifest-Feld "eingabe", .eingabe-Dateien, Doku-Feld eingabe.
 * U-43: zufallsSaat/echtzeit (.optionen.json, Kopfzeile // optionen:, Manifest-/Doku-/Prüfstand-Felder),
 *       Vorrat-Eingangszustand aus gleichnamiger .vorrat.json bzw. Manifest-Feld "vorrat"; Takt-Schläge stehen in .ereignisse.
 * Theke-Ereignisfolgen (THEKE.md §5) landen in optionen.uiEreignisse: .ereignisse (JSON-Lines) bzw. Manifest-Feld "ereignisse".
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function lies(p) { return fs.readFileSync(p, 'utf8'); }
/** .eingabe-Datei → Zeilen (abschließender Zeilenumbruch erzeugt keine Leerzeile). */
function zeilen(text) { const z = String(text).replace(/\r\n/g, '\n').split('\n'); if (z.length && z[z.length - 1] === '') z.pop(); return z; }
/** .ereignisse-Datei (JSON-Lines, THEKE.md §5) → optionen.uiEreignisse */
function jsonZeilen(text) { return zeilen(text).filter(z => z.trim()).map(z => JSON.parse(z)); }
function json(p) { return JSON.parse(lies(p).replace(/^﻿/, '')); }

const TEXT_ENDUNG = /\.(pizza|txt|json|csv|md)$/;
/** Projektordner → Dateisammlung (wie bin/pizza.js und tests/run-tests.js: alles außer pruefung/, Texte streng UTF-8 mit \n, sonst Bytes) */
function projektAusOrdner(wurzel) {
  const dateien = {};
  (function geh(abs, rel) {
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (r !== 'pruefung') geh(path.join(abs, e.name), r); continue; }
      const b = fs.readFileSync(path.join(abs, e.name));
      dateien[r] = TEXT_ENDUNG.test(r) ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b).replace(/\r\n/g, '\n') : new Uint8Array(b);
    }
  })(wurzel, '');
  return { dateien };
}
/** Quelltext(e) eines Falls für Textsuchen (brigade, Vorratskammer, Eingabe …): Projekte → alle Textdateien in Pfadreihenfolge */
function text(code) {
  if (typeof code === 'string') return code;
  if (!code || typeof code !== 'object' || !code.dateien) return String(code);
  return Object.keys(code.dateien).sort().map(p => (typeof code.dateien[p] === 'string' ? code.dateien[p] : '')).join('\n');
}
/** Ordner-Fall mit pruefung/ (Begleitdateien ohne Punkt-Präfix, ARCHITEKTUR §6) */
function istOrdnerFall(p) { return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'pruefung')); }

/** Gleichnamige .ereignisse-Datei → { uiEreignisse } (sonst {}). */
/** Gleichnamige .vorrat.json (K-080: { name: eintraege }) → { vorrat } (sonst {}). */
function vorratAus(p) { return p && fs.existsSync(p) ? { vorrat: JSON.parse(lies(p).replace(/^\uFEFF/, '')) } : {}; }
/** Lauf-Optionen aus einem Objekt (Manifest-Eintrag, Doku-Block, Prüfstand-Fall) übernehmen (U-43). */
function laufFelder(x) {
  const o = {};
  if (!x) return o;
  if (x.zufallsSaat !== undefined) o.zufallsSaat = x.zufallsSaat;
  if (x.echtzeit !== undefined) o.echtzeit = x.echtzeit;
  if (x.zone !== undefined) o.zone = x.zone;   // K-154
  if (x.schrittLimit != null) o.schrittLimit = x.schrittLimit;
  if (x.vorrat && typeof x.vorrat === 'object') o.vorrat = x.vorrat;
  return o;
}
function uiAus(p) { return p && fs.existsSync(p) ? { uiEreignisse: jsonZeilen(lies(p)) } : {}; }

function beispiele(warn) {
  const dir = path.join(ROOT, 'site', 'beispiele');
  const out = [];
  const ip = path.join(dir, 'index.json');
  if (!fs.existsSync(ip)) { warn('beispiele: index.json fehlt'); return out; }
  for (const teil of json(ip).teile || []) {
    const mp = path.join(dir, teil);
    if (!fs.existsSync(mp)) { warn('beispiele: Manifest fehlt: ' + teil); continue; }
    let man;
    try { man = json(mp); } catch (e) { warn('beispiele: ' + teil + ' ungültig: ' + e.message); continue; }
    for (const b of man.beispiele || []) {
      const dp = b.datei && path.join(dir, b.datei);
      if (!dp || !fs.existsSync(dp)) { warn('beispiele: Datei fehlt: ' + b.datei); continue; }
      out.push({
        quelle: 'beispiele', name: teil.replace(/\.json$/, '') + '/' + (b.id || b.datei),
        code: lies(dp), optionen: Object.assign({ args: b.args || [] },
          b.eingabe ? { eingabe: zeilen(lies(path.join(dir, b.eingabe))) } : (fs.existsSync(dp.replace(/\.pizza$/, '.eingabe')) ? { eingabe: zeilen(lies(dp.replace(/\.pizza$/, '.eingabe'))) } : {}),
          uiAus(b.ereignisse ? path.join(dir, b.ereignisse) : dp.replace(/\.pizza$/, '.ereignisse')),
          vorratAus(typeof b.vorrat === 'string' ? path.join(dir, b.vorrat) : dp.replace(/\.pizza$/, '.vorrat.json')),
          laufFelder({ zufallsSaat: b.zufallsSaat, echtzeit: b.echtzeit, zone: b.zone, schrittLimit: b.schrittLimit })),
        erwartetExit: typeof b.exitCode === 'number' ? b.exitCode : 0,
      });
    }
  }
  return out;
}

function doku(warn) {
  const dir = path.join(ROOT, 'site', 'js', 'doku');
  const out = [];
  if (!fs.existsSync(dir)) { warn('doku: Ordner fehlt'); return out; }
  const sandbox = { console };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const d of fs.readdirSync(dir).filter(x => x.endsWith('.js')).sort()) {
    try { vm.runInContext(lies(path.join(dir, d)), sandbox, { filename: d }); }
    catch (e) { warn('doku: ' + d + ' lädt nicht: ' + e.message); }
  }
  const sammle = (a, liste, pfad) => {
    (liste || []).forEach((item, i) => {
      if (!item || typeof item !== 'object') return;
      if (item.art === 'details') { sammle(a, item.inhalt, pfad + i + '.'); return; }
      if (item.art !== 'code' || item.sprache === 'xml' || item.sprache === 'shell') return;
      const code = String(item.code || '');
      const name = (a.id || '?') + '#' + pfad + i;
      // Nicht ausführbare Blöcke werden trotzdem verglichen (Syntaxfehler/Laufzeitverhalten), nur ohne Exit-Erwartung.
      const dopt = {};
      Object.assign(dopt, laufFelder(item));
      if (item.eingabe != null) dopt.eingabe = Array.isArray(item.eingabe) ? item.eingabe.slice() : zeilen(item.eingabe);
      out.push({ quelle: 'doku', name, code, optionen: dopt, erwartetExit: item.ausfuehrbar ? (typeof item.exitCode === 'number' ? item.exitCode : 0) : undefined });
    });
  };
  for (const a of sandbox.PIZZA_DOKU || []) sammle(a, a.inhalt, '');
  return out;
}

function faelle() {
  const dir = path.join(ROOT, 'tests', 'faelle');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, d);
    if (!d.endsWith('.pizza') && istOrdnerFall(abs)) {
      const pr = (n) => path.join(abs, 'pruefung', n);
      out.push({
        quelle: 'faelle', name: d, code: projektAusOrdner(abs),
        optionen: Object.assign(fs.existsSync(pr('optionen.json')) ? json(pr('optionen.json')) : {}, fs.existsSync(pr('eingabe')) ? { eingabe: zeilen(lies(pr('eingabe'))) } : {}, uiAus(pr('ereignisse')), vorratAus(pr('vorrat.json'))),
        erwartetExit: fs.existsSync(pr('exitcode')) ? parseInt(lies(pr('exitcode')).trim(), 10) : 0,
      });
      continue;
    }
    if (!d.endsWith('.pizza')) continue;
    const basis = d.slice(0, -6);
    const op = path.join(dir, basis + '.optionen.json');
    const ep = path.join(dir, basis + '.exitcode');
    const inp = path.join(dir, basis + '.eingabe');
    out.push({
      quelle: 'faelle', name: basis, code: lies(path.join(dir, d)),
      optionen: Object.assign(fs.existsSync(op) ? json(op) : {}, fs.existsSync(inp) ? { eingabe: zeilen(lies(inp)) } : {}, uiAus(path.join(dir, basis + '.ereignisse')), vorratAus(path.join(dir, basis + '.vorrat.json'))),
      erwartetExit: fs.existsSync(ep) ? parseInt(lies(ep).trim(), 10) : 0,
    });
  }
  return out;
}

function pruefstand(warn) {
  const dir = path.join(ROOT, 'pruefstand', 'faelle');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  // *-offen.js: Fälle, die die Referenz (Interpreter) noch nicht kann – kein Vergleich möglich (ARCHITEKTUR §6)
  for (const d of fs.readdirSync(dir).filter(x => x.endsWith('.js') && !x.endsWith('-offen.js')).sort()) {
    let liste;
    try { liste = require(path.join(dir, d)); } catch (e) { warn('pruefstand: ' + d + ' lädt nicht: ' + e.message); continue; }
    if (!Array.isArray(liste)) continue;
    liste.forEach((f, i) => {
      if (!f || !(typeof f.code === 'string' || (f.code && typeof f.code === 'object' && f.code.dateien))) return;
      const opt = {};
      if (f.args) opt.args = f.args;
      if (f.schrittLimit != null) opt.schrittLimit = f.schrittLimit;
      if (Array.isArray(f.uiEreignisse)) opt.uiEreignisse = f.uiEreignisse;
      Object.assign(opt, laufFelder(f));
      if (f.eingabe != null) opt.eingabe = Array.isArray(f.eingabe) ? f.eingabe : zeilen(f.eingabe);
      // Prüfstand-Erwartungen stammen aus der SPEC, nicht vom Interpreter – hier nur Differenz, keine Exit-Prüfung.
      out.push({ quelle: 'pruefstand', name: d.replace(/\.js$/, '') + '#' + i + ' ' + (f.name || ''), code: f.code, optionen: opt });
    });
  }
  return out;
}

/** Kopfzeilen im eigenen Korpus: // exit: N   // fehler: P0012   // optionen: {"schrittLimit": 1000}   // args: a b */
function kopf(code) {
  const k = {};
  for (const z of code.split(/\r?\n/)) {
    const m = /^\s*\/\/\s*(exit|optionen|args|fehler)\s*:\s*(.*)$/.exec(z);
    if (!m) { if (z.trim() && !/^\s*\/\//.test(z)) break; continue; }
    if (m[1] === 'exit') k.exit = parseInt(m[2], 10);
    else if (m[1] === 'optionen') k.optionen = JSON.parse(m[2]);
    else if (m[1] === 'fehler') k.fehler = m[2].trim();
    else if (m[1] === 'args') k.args = m[2].trim() ? m[2].trim().split(/\s+/) : [];
  }
  return k;
}

function eigenerKorpus() {
  const dir = path.join(__dirname, 'korpus');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, d);
    if (!d.endsWith('.pizza') && istOrdnerFall(abs)) {
      // Projekt-Ordner (PROJEKTE PA2): pruefung/exitcode, fehler, optionen.json, eingabe
      const pr = (n) => path.join(abs, 'pruefung', n);
      const opt = Object.assign(fs.existsSync(pr('optionen.json')) ? json(pr('optionen.json')) : {}, fs.existsSync(pr('eingabe')) ? { eingabe: zeilen(lies(pr('eingabe'))) } : {}, uiAus(pr('ereignisse')), vorratAus(pr('vorrat.json')));
      out.push({ quelle: 'korpus', name: d, code: projektAusOrdner(abs), optionen: opt,
        erwartetExit: fs.existsSync(pr('exitcode')) ? parseInt(lies(pr('exitcode')).trim(), 10) : 0,
        erwartetFehler: fs.existsSync(pr('fehler')) ? lies(pr('fehler')).trim() : undefined });
      continue;
    }
    if (!d.endsWith('.pizza')) continue;
    const code = lies(abs);
    const k = kopf(code);
    const opt = Object.assign({}, k.optionen || {});
    if (k.args) opt.args = k.args;
    const inp = path.join(dir, d.slice(0, -6) + '.eingabe');
    if (fs.existsSync(inp)) opt.eingabe = zeilen(lies(inp));
    Object.assign(opt, uiAus(path.join(dir, d.slice(0, -6) + '.ereignisse')), vorratAus(path.join(dir, d.slice(0, -6) + '.vorrat.json')));
    out.push({ quelle: 'korpus', name: d.slice(0, -6), code, optionen: opt, erwartetExit: k.exit != null ? k.exit : 0, erwartetFehler: k.fehler });
  }
  return out;
}

const QUELLEN = { korpus: eigenerKorpus, beispiele, doku, faelle, pruefstand };

function lade(nur, warn = () => {}) {
  const out = [];
  for (const [n, f] of Object.entries(QUELLEN)) if (!nur || nur.includes(n)) out.push(...f(warn));
  return out;
}

module.exports = { lade, QUELLEN, kopf, zeilen, text, projektAusOrdner };
