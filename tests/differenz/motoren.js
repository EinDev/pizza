'use strict';
/*
 * Motoren für Differenztests: Interpreter (Referenz), Wasm-in-Node (pizzaiolo), nativer Host (host/).
 * Jeder Motor liefert für (quelltext, optionen) ein normalisiertes Ergebnis
 *   { status: "ok", exitCode, ereignisse, schritte, zeitMs, ms }
 *   { status: "fallback", grund }            – Compiler meldet nichtUnterstuetzt (Wasm/Host)
 *   { status: "wurf", fehler }               – Motor hat eine JS-Exception/Absturz produziert
 *   { status: "übersprungen", grund }        – Motor kann diesen Fall nicht ausführen
 * Motoren, die (noch) nicht existieren, sind nicht "verfuegbar" und werden übersprungen.
 *
 * Umgebung:
 *   PIZZA_HOST=<pfad>        nativer Host (sonst host/target/{release,debug}/pizza-host[.exe])
 *   PIZZA_MOTOREN=a,b        nur diese Motoren (z. B. "interpreter,wasm")
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PizzaLang = require(path.join(ROOT, 'site', 'js', 'pizza.js'));

function normalisiere(ereignisse) {
  const aus = [];
  for (const e of ereignisse || []) {
    if (!e || e.typ === 'motor') continue;
    const k = {};
    for (const s of Object.keys(e)) if (s !== 'motor' && s !== 'kompilierMs') k[s] = e[s];
    aus.push(k);
  }
  return aus;
}

function ergebnisAus(r, ms) {
  if (!r || typeof r !== 'object') return { status: 'wurf', fehler: 'Rückgabe ist kein Objekt: ' + String(r) };
  return {
    status: 'ok',
    exitCode: r.exitCode,
    ereignisse: normalisiere(r.ereignisse),
    schritte: r.schritte,
    zeitMs: r.zeitMs,
    ms,
  };
}

function laufOptionen(opt) {
  const o = {};
  if (opt && opt.schrittLimit != null) o.schrittLimit = opt.schrittLimit;
  if (opt && opt.args) o.args = opt.args.slice();
  if (opt && opt.eingabe) o.eingabe = opt.eingabe.slice();
  return o;
}

/** Unterstützt der Interpreter schon interaktive Eingabe (EINGABE.md)? */
let _eingabe = null;
function eingabeUnterstuetzt() {
  if (_eingabe === null) {
    try { _eingabe = PizzaLang.run('Bestellannahme.hatMehr(); Bote.schreibe(("")); Bote.leeren();', { eingabe: [] }).exitCode === 0; }
    catch (_) { _eingabe = false; }
  }
  return _eingabe;
}

const jetzt = () => Number(process.hrtime.bigint()) / 1e6;

// ---------------------------------------------------------------- Interpreter
const interpreter = {
  name: 'interpreter',
  verfuegbar: true,
  grund: null,
  lauf(q, opt) {
    const t0 = jetzt();
    let r;
    try { r = PizzaLang.run(q, laufOptionen(opt)); }
    catch (e) { return { status: 'wurf', fehler: String(e && e.stack || e) }; }
    return ergebnisAus(r, jetzt() - t0);
  },
};

// ---------------------------------------------------------------- Wasm (pizzaiolo)
function ladePizzaiolo() {
  const p = path.join(ROOT, 'site', 'js', 'pizzaiolo.js');
  if (!fs.existsSync(p)) return { fehlt: 'site/js/pizzaiolo.js fehlt' };
  try {
    // pizzaiolo.js benötigt PizzaLang – in Node zusätzlich global bereitstellen.
    if (!globalThis.PizzaLang) globalThis.PizzaLang = PizzaLang;
    const P = require(p);
    const Z = P && typeof P.run === 'function' ? P : (P && P.Pizzaiolo) || globalThis.Pizzaiolo;
    if (!Z || typeof Z.run !== 'function') return { fehlt: 'pizzaiolo.js exportiert keine run()-Funktion' };
    if (typeof Z.unterstuetzt === 'function' && !Z.unterstuetzt()) return { fehlt: 'Pizzaiolo.unterstuetzt() = nein' };
    return { Z };
  } catch (e) {
    return { fehlt: 'pizzaiolo.js lädt nicht: ' + (e && e.message) };
  }
}

const pz = ladePizzaiolo();

function kompiliere(q) {
  if (!pz.Z || typeof pz.Z.kompiliere !== 'function') return null;
  try { return pz.Z.kompiliere(q); }
  catch (e) { return { wurf: String(e && e.stack || e) }; }
}

function fallbackGrund(k) {
  const liste = k.nichtUnterstuetzt || [];
  return liste.map(n => (n.zeile != null ? 'Z' + n.zeile + ': ' : '') + (n.grund || '?')).join('; ') || 'nichtUnterstuetzt';
}

function kompilat(q, cache) {
  if (cache && 'kompilat' in cache) return cache.kompilat;
  const k = kompiliere(q);
  if (cache) cache.kompilat = k;
  return k;
}

const wasm = {
  name: 'wasm',
  verfuegbar: !!pz.Z,
  grund: pz.fehlt || null,
  lauf(q, opt, cache) {
    const k = kompilat(q, cache);
    if (k && k.wurf) return { status: 'wurf', fehler: 'kompiliere() hat geworfen: ' + k.wurf };
    if (k && k.ok === false && k.nichtUnterstuetzt) return { status: 'fallback', grund: fallbackGrund(k) };
    const t0 = jetzt();
    let r;
    try { r = pz.Z.run(q, Object.assign(laufOptionen(opt), { motor: 'wasm' })); }
    catch (e) { return { status: 'wurf', fehler: 'run() hat geworfen: ' + String(e && e.stack || e) }; }
    const ms = jetzt() - t0;
    // Syntaxfehler laufen nie in Wasm; sonst muss wirklich Wasm gelaufen sein (kein stiller Fallback).
    const syntax = k && k.ok === false && k.fehler;
    if (!syntax && r && r.motor && r.motor !== 'wasm') return { status: 'fallback', grund: 'run() lief mit motor="' + r.motor + '" (stiller Fallback)' };
    return ergebnisAus(r, ms);
  },
};

// ---------------------------------------------------------------- Nativer Host
function findeHost() {
  const kandidaten = [];
  if (process.env.PIZZA_HOST) kandidaten.push(process.env.PIZZA_HOST);
  const exe = process.platform === 'win32' ? '.exe' : '';
  for (const art of ['release', 'debug']) kandidaten.push(path.join(ROOT, 'host', 'target', art, 'pizza-host' + exe));
  kandidaten.push(path.join(ROOT, 'host', 'pizza-host' + exe));
  for (const k of kandidaten) if (k && fs.existsSync(k)) return k;
  return null;
}

const hostPfad = findeHost();
let tmpDir = null;
let tmpZaehler = 0;

function parseHostAusgabe(stdout) {
  const t = String(stdout || '').trim();
  if (!t) return [];
  try {
    const j = JSON.parse(t);
    if (Array.isArray(j)) return j;
    if (j && Array.isArray(j.ereignisse)) return j.ereignisse;
    return [j];
  } catch (_) { /* JSON-Zeilen */ }
  return t.split(/\r?\n/).filter(z => z.trim()).map(z => JSON.parse(z));
}

const host = {
  name: 'host',
  verfuegbar: !!(hostPfad && pz.Z && typeof pz.Z.kompiliere === 'function'),
  grund: !hostPfad ? 'host/target/*/pizza-host nicht gebaut (oder PIZZA_HOST setzen)' : (!pz.Z ? 'braucht pizzaiolo.js zum Kompilieren' : null),
  lauf(q, opt, cache) {
    const k = kompilat(q, cache);
    if (k && k.wurf) return { status: 'wurf', fehler: 'kompiliere() hat geworfen: ' + k.wurf };
    if (k && k.ok === false && k.nichtUnterstuetzt) return { status: 'fallback', grund: fallbackGrund(k) };
    if (!k || !k.ok) return { status: 'übersprungen', grund: 'Syntaxfehler – kein .pkarton' };
    if (!tmpDir) tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pizza-diff-'));
    const datei = path.join(tmpDir, 'p' + (tmpZaehler++) + '.pkarton');
    fs.writeFileSync(datei, k.pkarton);
    // CLI laut host/src/main.rs: pizza-host [--ereignisse-json] [--schritte=N] programm.pkarton [args…]
    const argv = ['--ereignisse-json'];
    if (opt && opt.schrittLimit != null) argv.push('--schritte=' + opt.schrittLimit);
    argv.push(datei);
    if (opt && opt.args && opt.args.length) argv.push(...opt.args);
    const t0 = jetzt();
    // Eingabe (EINGABE.md §4): pizza-host liest Zeilen von stdin, EOF → -1.
    const stdin = opt && opt.eingabe ? opt.eingabe.map(z => z + '\n').join('') : '';
    const p = cp.spawnSync(hostPfad, argv, { encoding: 'utf8', input: stdin, timeout: 60000, maxBuffer: 256 * 1024 * 1024 });
    const ms = jetzt() - t0;
    try { fs.unlinkSync(datei); } catch (_) {}
    if (p.error) return { status: 'wurf', fehler: 'Host-Start: ' + p.error.message };
    let ev;
    try { ev = parseHostAusgabe(p.stdout); }
    catch (e) { return { status: 'wurf', fehler: 'Host-Ausgabe ist kein JSON: ' + e.message + '\n' + String(p.stdout).slice(0, 500) + '\n' + String(p.stderr).slice(0, 500) }; }
    const ende = ev.filter(e => e && e.typ === 'ende').pop();
    if (!ende) return { status: 'wurf', fehler: 'Host lieferte kein "ende"-Ereignis (Prozess-Exit ' + p.status + ')\n' + String(p.stderr).slice(0, 500) };
    const res = ergebnisAus({ exitCode: ende.exitCode, ereignisse: ev, schritte: ende.schritte, zeitMs: ende.zeitMs }, ms);
    res.prozessExit = p.status;
    return res;
  },
};

function aufraeumen() {
  if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
}

let ALLE = [interpreter, wasm, host];
if (process.env.PIZZA_MOTOREN) {
  const nur = process.env.PIZZA_MOTOREN.split(',').map(s => s.trim());
  for (const m of ALLE) if (m !== interpreter && !nur.includes(m.name)) { m.verfuegbar = false; m.grund = 'per PIZZA_MOTOREN abgewählt'; }
}

const SPEICHER_RE = /Der Kühlschrank ist voll/;

/**
 * Vergleicht Referenz r0 (Interpreter) mit Ergebnis r (beide status "ok").
 * → null (gleich) | { art, details: string[] }
 *   art: "speicherlimit" (dokumentierte Grenze: nur der Wasm-Motor meldet Kühlschrank voll)
 *        | "ereignisse" | "exitCode" | "schritte"
 */
function vergleiche(r0, r) {
  const d = [];
  if (r.exitCode !== r0.exitCode) d.push('exitCode: ' + r0.exitCode + ' ≠ ' + r.exitCode);
  if (r.schritte !== r0.schritte) d.push('schritte: ' + r0.schritte + ' ≠ ' + r.schritte);
  if (r.zeitMs !== r0.zeitMs) d.push('zeitMs: ' + r0.zeitMs + ' ≠ ' + r.zeitMs);
  if (r.prozessExit != null && r.prozessExit !== r.exitCode) d.push('Prozess-Exit-Code ' + r.prozessExit + ' ≠ exitCode ' + r.exitCode);
  const a = r0.ereignisse, b = r.ereignisse;
  let erste = -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) { erste = i; break; }
  }
  if (erste >= 0) {
    d.push('Ereignis #' + erste + ' (Anzahl ' + a.length + ' / ' + b.length + '):  (- interpreter, + motor)');
    for (let i = Math.max(0, erste - 2); i < Math.min(Math.max(a.length, b.length), erste + 3); i++) {
      const x = JSON.stringify(a[i]), y = JSON.stringify(b[i]);
      if (x === y) d.push('    ' + x);
      else { d.push('  - ' + (x === undefined ? '(fehlt)' : x)); d.push('  + ' + (y === undefined ? '(fehlt)' : y)); }
    }
  }
  if (!d.length) return null;
  const speicher = b.some(e => e.typ === 'fehler' && SPEICHER_RE.test(e.text || '')) && !a.some(e => e.typ === 'fehler' && SPEICHER_RE.test(e.text || ''));
  let art;
  if (speicher) art = 'speicherlimit';
  else if (erste >= 0) art = 'ereignisse';
  else if (r.exitCode !== r0.exitCode) art = 'exitCode';
  else art = 'schritte';
  return { art, details: d, ersteAbweichung: erste };
}

/** Prüft ein einzelnes Ergebnis auf API-Invarianten (Ereignis-API, ende am Schluss, Exit-Codes). */
function invarianten(r) {
  const p = [];
  if (r.status !== 'ok') return p;
  if (![0, 1, 2, 3, 39].includes(r.exitCode)) p.push('unerwarteter Exit-Code ' + r.exitCode);
  const ev = r.ereignisse;
  const ende = ev[ev.length - 1];
  if (!ende || ende.typ !== 'ende') p.push('letztes Ereignis ist nicht "ende"');
  else {
    if (ende.exitCode !== r.exitCode) p.push('ende.exitCode ' + ende.exitCode + ' ≠ exitCode ' + r.exitCode);
    if (ende.schritte !== r.schritte || ende.zeitMs !== r.zeitMs) p.push('ende.schritte/zeitMs passen nicht zur Rückgabe');
  }
  if (ev.filter(e => e.typ === 'ende').length !== 1) p.push('nicht genau ein "ende"-Ereignis');
  for (const e of ev) if (e.typ === 'fehler' && /Interne?r? Fehler|Interner|TypeError|ReferenceError|undefined/.test(e.text || '')) p.push('verdächtiger Fehlertext: ' + e.text);
  if (r.exitCode === 39 && !ev.some(e => e.typ === 'panik')) p.push('Exit 39 ohne panik-Ereignis');
  return p;
}

module.exports = { eingabeUnterstuetzt, ALLE, interpreter, wasm, host, vergleiche, invarianten, normalisiere, aufraeumen, PizzaLang, ROOT };
