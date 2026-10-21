#!/usr/bin/env node
'use strict';
/*
 * End-to-End: kompiliert Programme mit pizzaiolo und vergleicht Wasm mit dem Interpreter
 * (Ereignisse, Exit-Code, schritte, zeitMs).
 *   node tests/wasm/vergleich.js [filter] [-v] [--datei x.pizza]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const P = require(path.join(ROOT, 'site', 'js', 'pizza.js'));
const Z = require(path.join(ROOT, 'site', 'js', 'pizzaiolo.js'));
const korpus = require('./korpus.js');

function norm(ev) { return ev.filter(e => e.typ !== 'motor').map(e => JSON.stringify(e)); }

function vergleiche(f0) {
  // Wanduhr (Uhr.echt) für den Vergleich festhalten, sonst sind beide Läufe nicht reproduzierbar
  const f = Object.assign({}, f0, { opt: Object.assign({ echtzeit: 1700000000000 }, f0.opt) });
  const ri = P.run(f.quelle, Object.assign({}, f.opt));
  const k = Z.kompiliere(f.quelle);
  if (!k.ok) {
    if (k.fehler) return { status: 'syntax' };
    return { status: 'fallback', grund: k.nichtUnterstuetzt.map(n => n.grund + (n.zeile ? ' @' + n.zeile : '')).join('; '), intern: k.intern };
  }
  let rw;
  try { rw = Z.fuehreAus(k.pkarton, Object.assign({}, f.opt)); } catch (e) { return { status: 'wurf', fehler: e.stack }; }
  const a = norm(ri.ereignisse), b = norm(rw.ereignisse);
  const diffs = [];
  // zweiteiliger Schnellpfad (Pizzaiolo.run) muss identisch zum Einzelmodul sein
  const rz = Z.run(f.quelle, Object.assign({}, f.opt, { motor: 'wasm' }));
  if (JSON.stringify(norm(rz.ereignisse)) !== JSON.stringify(b) || rz.schritte !== rw.schritte) diffs.push('zweiteilig ≠ Einzelmodul: ' + JSON.stringify(norm(rz.ereignisse)).slice(0, 300));
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) { diffs.push('#' + i + '\n    I: ' + a[i] + '\n    W: ' + b[i]); if (diffs.length > 4) break; }
  if (ri.exitCode !== rw.exitCode) diffs.push('exitCode ' + ri.exitCode + ' / ' + rw.exitCode);
  if (ri.schritte !== rw.schritte) diffs.push('schritte ' + ri.schritte + ' / ' + rw.schritte);
  if (ri.zeitMs !== rw.zeitMs) diffs.push('zeitMs ' + ri.zeitMs + ' / ' + rw.zeitMs);
  return diffs.length ? { status: 'abweichung', diffs } : { status: 'gleich', kompilierMs: k.kompilierMs };
}

function main() {
  const argv = process.argv.slice(2);
  const v = argv.includes('-v');
  const di = argv.indexOf('--datei');
  let faelle;
  if (di >= 0) faelle = [{ name: argv[di + 1], quelle: fs.readFileSync(argv[di + 1], 'utf8'), opt: {} }];
  else if (argv.includes('--alles') && fs.existsSync(path.join(ROOT, 'tests', 'differenz', 'korpus.js'))) {
    faelle = require(path.join(ROOT, 'tests', 'differenz', 'korpus.js')).lade().map(f => ({ name: f.quelle + ':' + f.name, quelle: f.code, opt: f.optionen || {} }));
  } else faelle = korpus.alle();
  const filter = argv.find((a, i) => !a.startsWith('-') && (di < 0 || i !== di + 1));
  if (filter) faelle = faelle.filter(f => f.name.includes(filter));
  const zaehl = { gleich: 0, abweichung: 0, fallback: 0, wurf: 0, syntax: 0 };
  for (const f of faelle) {
    const r = vergleiche(f);
    zaehl[r.status]++;
    if (r.status === 'gleich') { if (v) console.log('  ✓ ' + f.name); continue; }
    if (r.status === 'syntax') continue;
    console.log('  ✗ ' + f.name + ' [' + r.status + ']' + (r.grund ? ' ' + r.grund : ''));
    if (r.diffs) console.log('    ' + r.diffs.join('\n    '));
    if (r.fehler) console.log(r.fehler.split('\n').slice(0, 4).join('\n'));
    if (r.intern && v) console.log(r.intern.stack);
  }
  console.log(JSON.stringify(zaehl));
  return zaehl;
}

module.exports = { vergleiche };
if (require.main === module) { const z = main(); process.exitCode = z.abweichung || z.wurf || z.fallback ? 1 : 0; }
