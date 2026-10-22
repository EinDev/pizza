#!/usr/bin/env node
/*
 * Herd: Kosten eines Setter-Aufrufs aus dem Interpreter (B2 in klein; HERD.md §6 – der Interpreter ist Referenz, kein Leistungsziel).
 *   node bench/herd/setter-interpreter.js [n=1000] [takte=60]
 * Misst je Takt n Aufrufe teil.setzeLage(x, y) bzw. kreis.setzeRadius(r) und zieht eine Leerlauf-Schleife gleicher Form ab;
 * zum Vergleich der reine Kern-Aufruf (teil_lage direkt aus JS).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', '..', 'site', 'js', 'pizza.js'));

const n = Number(process.argv[2]) || 1000;
const takte = Number(process.argv[3]) || 60;

function programm(rumpf) {
  return [
    'Herd herd = neu Herd("B2", breite: 1280, hoehe: 720);',
    'Blech<Teil> teile = [];',
    'Blech<Kreis> kreise = [];',
    'für (salami i : [1 .. ' + n + ']) { Teil t = herd.kreis(i % 1280, i % 720, 4); teile.hinzu(t); kreise.hinzu(t.kreis()); }',
    'herd.backe(() -> {',
    '    salami f = herd.bildnummer();',
    '    für (salami i : [1 .. ' + n + ']) { ' + rumpf + ' }',
    '});'
  ].join('\n');
}
const ereignisse = Array.from({ length: takte }, () => ({ typ: 'takt' }));
function miss(rumpf) {
  const q = programm(rumpf);
  P.run(q, { uiEreignisse: ereignisse.slice(0, 3), schrittLimit: 1e9 });   // aufwärmen
  let best = Infinity;
  for (let w = 0; w < 3; w++) {
    const t0 = process.hrtime.bigint();
    const r = P.run(q, { uiEreignisse: ereignisse, schrittLimit: 1e9 });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (r.exitCode !== 0) throw new Error(JSON.stringify(r.ereignisse.filter(e => e.typ === 'fehler')));
    best = Math.min(best, ms);
  }
  return best;
}

const leer = miss('Teil t = teile.stück(i); salami x = (f + i) % 1280;');
const lage = miss('Teil t = teile.stück(i); salami x = (f + i) % 1280; t.setzeLage(x, 100);');
const radius = miss('Kreis k = kreise.stück(i); salami x = (f + i) % 1280; k.setzeRadius(x % 9);');
const leerK = miss('Kreis k = kreise.stück(i); salami x = (f + i) % 1280;');
const aufrufe = n * takte;

// reiner Kern-Aufruf aus JS (ohne Interpreter)
const e = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'js', 'herd', 'kern.wasm'))), {}).exports;
e.welt_neu(1280, 720, 0, 0);
const ids = Array.from({ length: n }, () => e.teil_neu(2));
let t0 = process.hrtime.bigint();
for (let k = 0; k < takte; k++) for (let i = 0; i < n; i++) e.teil_lage(ids[i], (k + i) % 1280, 100, 0);
const kernNs = Number(process.hrtime.bigint() - t0) / aufrufe;

const ns = (a, b) => ((a - b) * 1e6 / aufrufe).toFixed(0);
console.log('n = ' + n + ', takte = ' + takte + ', Aufrufe = ' + aufrufe + ' (bester von 3 Läufen)');
console.log('Leerlauf (Teil)      ' + leer.toFixed(1) + ' ms');
console.log('setzeLage(x, y)      ' + lage.toFixed(1) + ' ms  → ' + ns(lage, leer) + ' ns je Aufruf (Interpreter inkl. Methodenaufruf)');
console.log('Leerlauf (Kreis)     ' + leerK.toFixed(1) + ' ms');
console.log('setzeRadius(r)       ' + radius.toFixed(1) + ' ms  → ' + ns(radius, leerK) + ' ns je Aufruf (generischer Komponenten-Setter)');
console.log('teil_lage direkt     ' + kernNs.toFixed(0) + ' ns je Aufruf (JS → kern.wasm, ohne Interpreter)');
