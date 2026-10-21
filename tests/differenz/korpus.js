'use strict';
/*
 * Sammelt den Differenz-Korpus: { quelle, name, code, optionen, erwartetExit? }
 *   beispiele  – site/beispiele (index.json → Teil-Manifeste)
 *   doku       – alle ausführbaren Codeblöcke aus site/js/doku/*.js (rekursiv inkl. details)
 *   faelle     – tests/faelle/*.pizza (+ .optionen.json)
 *   pruefstand – pruefstand/faelle/*.js (falls vorhanden und ladbar)
 *   korpus     – tests/differenz/korpus/*.pizza (Kopfzeilen: // exit: N, // optionen: {...}; Eingabe: gleichnamige .eingabe)
 * Eingabezeilen (EINGABE.md) landen in optionen.eingabe: Manifest-Feld "eingabe", .eingabe-Dateien, Doku-Feld eingabe.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function lies(p) { return fs.readFileSync(p, 'utf8'); }
/** .eingabe-Datei → Zeilen (abschließender Zeilenumbruch erzeugt keine Leerzeile). */
function zeilen(text) { const z = String(text).replace(/\r\n/g, '\n').split('\n'); if (z.length && z[z.length - 1] === '') z.pop(); return z; }
function json(p) { return JSON.parse(lies(p).replace(/^﻿/, '')); }

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
        code: lies(dp), optionen: Object.assign({ args: b.args || [] }, b.eingabe ? { eingabe: zeilen(lies(path.join(dir, b.eingabe))) } : {}),
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
  for (const d of fs.readdirSync(dir).filter(x => x.endsWith('.pizza')).sort()) {
    const basis = d.slice(0, -6);
    const op = path.join(dir, basis + '.optionen.json');
    const ep = path.join(dir, basis + '.exitcode');
    const inp = path.join(dir, basis + '.eingabe');
    out.push({
      quelle: 'faelle', name: basis, code: lies(path.join(dir, d)),
      optionen: Object.assign(fs.existsSync(op) ? json(op) : {}, fs.existsSync(inp) ? { eingabe: zeilen(lies(inp)) } : {}),
      erwartetExit: fs.existsSync(ep) ? parseInt(lies(ep).trim(), 10) : 0,
    });
  }
  return out;
}

function pruefstand(warn) {
  const dir = path.join(ROOT, 'pruefstand', 'faelle');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir).filter(x => x.endsWith('.js')).sort()) {
    let liste;
    try { liste = require(path.join(dir, d)); } catch (e) { warn('pruefstand: ' + d + ' lädt nicht: ' + e.message); continue; }
    if (!Array.isArray(liste)) continue;
    liste.forEach((f, i) => {
      if (!f || typeof f.code !== 'string') return;
      const opt = {};
      if (f.args) opt.args = f.args;
      if (f.schrittLimit != null) opt.schrittLimit = f.schrittLimit;
      if (f.eingabe != null) opt.eingabe = Array.isArray(f.eingabe) ? f.eingabe : zeilen(f.eingabe);
      // Prüfstand-Erwartungen stammen aus der SPEC, nicht vom Interpreter – hier nur Differenz, keine Exit-Prüfung.
      out.push({ quelle: 'pruefstand', name: d.replace(/\.js$/, '') + '#' + i + ' ' + (f.name || ''), code: f.code, optionen: opt });
    });
  }
  return out;
}

/** Kopfzeilen im eigenen Korpus: // exit: N   // optionen: {"schrittLimit": 1000}   // args: a b */
function kopf(code) {
  const k = {};
  for (const z of code.split(/\r?\n/)) {
    const m = /^\s*\/\/\s*(exit|optionen|args)\s*:\s*(.*)$/.exec(z);
    if (!m) { if (z.trim() && !/^\s*\/\//.test(z)) break; continue; }
    if (m[1] === 'exit') k.exit = parseInt(m[2], 10);
    else if (m[1] === 'optionen') k.optionen = JSON.parse(m[2]);
    else if (m[1] === 'args') k.args = m[2].trim() ? m[2].trim().split(/\s+/) : [];
  }
  return k;
}

function eigenerKorpus() {
  const dir = path.join(__dirname, 'korpus');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir).filter(x => x.endsWith('.pizza')).sort()) {
    const code = lies(path.join(dir, d));
    const k = kopf(code);
    const opt = Object.assign({}, k.optionen || {});
    if (k.args) opt.args = k.args;
    const inp = path.join(dir, d.slice(0, -6) + '.eingabe');
    if (fs.existsSync(inp)) opt.eingabe = zeilen(lies(inp));
    out.push({ quelle: 'korpus', name: d.slice(0, -6), code, optionen: opt, erwartetExit: k.exit != null ? k.exit : 0 });
  }
  return out;
}

const QUELLEN = { korpus: eigenerKorpus, beispiele, doku, faelle, pruefstand };

function lade(nur, warn = () => {}) {
  const out = [];
  for (const [n, f] of Object.entries(QUELLEN)) if (!nur || nur.includes(n)) out.push(...f(warn));
  return out;
}

module.exports = { lade, QUELLEN, kopf, zeilen };
