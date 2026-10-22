#!/usr/bin/env node
/*
 * Herd: Kosten eines Setter-Aufrufs im Wasm-Pfad (Paket H4; HERD.md §6 B2: Ziel ≤ 80 ns je Setter in Chrome, hier Node/V8).
 *   node bench/herd/setter-wasm.js [n=1000] [takte=60]
 * 1. Grenzübergang allein: ein kleines Wasm-Modul importiert herd.teil_lage / herd.setze_zahl und ruft sie in einer Schleife –
 *    gebunden direkt an die Exporte von kern.wasm (so bindet der JS-Host die Gruppe herd), zum Vergleich über eine JS-Hülle.
 * 2. pizza-Programm (pizzaiolo, Wasm-Motor): je Takt n × teil.setzeLage(x, y) bzw. kreis.setzeRadius(r), abzüglich einer
 *    Leerlauf-Schleife gleicher Form (wie bench/herd/setter-interpreter.js). Bestwert aus 3 Läufen; Messläufe kurz (< 10 s).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const Z = require(path.join(ROOT, 'site', 'js', 'pizzaiolo.js'));
const K = require(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'kodierer.js'));

const n = Number(process.argv[2]) || 1000;
const takte = Number(process.argv[3]) || 60;
const aufrufe = n * takte;
const kernModul = new WebAssembly.Module(fs.readFileSync(path.join(ROOT, 'site', 'js', 'herd', 'kern.wasm')));

// ---------- 1. Grenzübergang Programm-Wasm → Kern ----------
/** Modul: import herd.<name>(i32, f64, …) -> i32; export lauf(id0, n, runden) ruft den Import n × runden mal */
function schleifenModul(name, sig) {
  const { Puffer, section, verbinde } = K;
  const P = (f) => { const p = new Puffer(); f(p); return p.fertig(); };
  const typ = P(p => {
    p.u32(2);
    p.byte(0x60); p.u32(sig.length); for (const t of sig) p.byte(t); p.u32(1); p.byte(0x7f);
    p.byte(0x60); p.u32(3); p.byte(0x7f); p.byte(0x7f); p.byte(0x7f); p.u32(0);
  });
  const imp = P(p => { p.u32(1); p.name('herd'); p.name(name); p.byte(0); p.u32(0); });
  const fn = P(p => { p.u32(1); p.u32(1); });
  const ex = P(p => { p.u32(1); p.name('lauf'); p.byte(0); p.u32(1); });
  // locals: 3 = i, 4 = r
  const b = [];
  const L = (...x) => b.push(...x);
  const f64 = (x) => { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x, true); return [0x44, ...new Uint8Array(d.buffer)]; };
  // r = 0; loop_r: i = 0; loop_i: call; i++; br_if i < n; r++; br_if r < runden
  L(0x41, 0, 0x21, 4);                       // r = 0
  L(0x03, 0x40);                             // loop r
  L(0x41, 0, 0x21, 3);                       // i = 0
  L(0x03, 0x40);                             // loop i
  if (name === 'teil_lage') { L(0x20, 0, 0x20, 3, 0x6a); L(0x20, 3, 0xb7); L(...f64(100)); L(...f64(0)); }
  else { L(0x20, 0, 0x20, 3, 0x6a); L(0x41, 1); L(0x20, 3, 0x41, 7, 0x71, 0xb7); }   // komp, feld 1 (radius), i & 7
  L(0x10, 0, 0x1a);                          // call import, drop
  L(0x20, 3, 0x41, 1, 0x6a, 0x22, 3, 0x20, 1, 0x48, 0x0d, 0);   // i++ ; br_if i < n
  L(0x0b);
  L(0x20, 4, 0x41, 1, 0x6a, 0x22, 4, 0x20, 2, 0x48, 0x0d, 0);   // r++ ; br_if r < runden
  L(0x0b, 0x0b);
  const rumpf = P(p => { p.u32(1); p.u32(2); p.byte(0x7f); p.bytes(new Uint8Array(b)); });
  const code = P(p => { p.u32(1); p.u32(rumpf.length); p.bytes(rumpf); });
  return new WebAssembly.Module(verbinde([new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]), section(1, typ), section(2, imp), section(3, fn), section(7, ex), section(10, code)]));
}
function grenze(name, sig, huelle) {
  const e = new WebAssembly.Instance(kernModul, {}).exports;
  e.welt_neu(1280, 720, 0, 0);
  let id0;
  if (name === 'teil_lage') { id0 = e.teil_neu(2) - 1; for (let i = 1; i < n; i++) e.teil_neu(2); }
  else { id0 = e.komp_neu(2) - 1; for (let i = 1; i < n; i++) e.komp_neu(2); }   // Kreis
  const f = e[name];
  const imp = huelle ? (...a) => f(...a) : f;
  const lauf = new WebAssembly.Instance(schleifenModul(name, sig), { herd: { [name]: imp } }).exports.lauf;
  lauf(id0, n, 3);   // aufwärmen
  let best = Infinity;
  for (let w = 0; w < 3; w++) {
    const t0 = process.hrtime.bigint();
    lauf(id0, n, takte);
    best = Math.min(best, Number(process.hrtime.bigint() - t0));
  }
  return best / aufrufe;
}

// ---------- 2. pizza-Programm im Wasm-Motor ----------
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
  const k = Z._kompiliereTeil(q);
  if (!k.ok) throw new Error(JSON.stringify(k.nichtUnterstuetzt || k.fehler));
  const lauf = (ev) => Z._teile.hostJs.fuehreModulAus(k.modul, { uiEreignisse: ev, schrittLimit: 1e9 });
  lauf(ereignisse.slice(0, 3));
  let best = Infinity;
  for (let w = 0; w < 3; w++) {
    const t0 = process.hrtime.bigint();
    const r = lauf(ereignisse);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (r.exitCode !== 0) throw new Error(JSON.stringify(r.ereignisse.filter(e => e.typ === 'fehler')));
    best = Math.min(best, ms);
  }
  return best;
}

const gLage = grenze('teil_lage', [0x7f, 0x7c, 0x7c, 0x7c], false);
const gLageJs = grenze('teil_lage', [0x7f, 0x7c, 0x7c, 0x7c], true);
const gZahl = grenze('setze_zahl', [0x7f, 0x7f, 0x7c], false);
const leer = miss('Teil t = teile.stück(i); salami x = (f + i) % 1280;');
const lage = miss('Teil t = teile.stück(i); salami x = (f + i) % 1280; t.setzeLage(x, 100);');
const leerK = miss('Kreis k = kreise.stück(i); salami x = (f + i) % 1280;');
const radius = miss('Kreis k = kreise.stück(i); salami x = (f + i) % 1280; k.setzeRadius(x % 9);');
const ns = (a, b) => ((a - b) * 1e6 / aufrufe).toFixed(0);
console.log('n = ' + n + ', takte = ' + takte + ', Aufrufe = ' + aufrufe + ' (bester von 3 Läufen), Node ' + process.version);
console.log('Grenzübergang Programm-Wasm → kern.wasm (Import direkt an den Export gebunden):');
console.log('  herd.teil_lage        ' + gLage.toFixed(1) + ' ns je Aufruf (inkl. Kern-Arbeit)');
console.log('  herd.setze_zahl       ' + gZahl.toFixed(1) + ' ns je Aufruf (inkl. Kern-Arbeit)');
console.log('  teil_lage über JS-Hülle ' + gLageJs.toFixed(1) + ' ns je Aufruf (zum Vergleich)');
console.log('pizza-Programm (Wasm-Motor), abzüglich Leerlauf:');
console.log('  Leerlauf (Teil)       ' + leer.toFixed(1) + ' ms');
console.log('  setzeLage(x, y)       ' + lage.toFixed(1) + ' ms  → ' + ns(lage, leer) + ' ns je Aufruf (inkl. Methodenauflösung in der Laufzeit)');
console.log('  Leerlauf (Kreis)      ' + leerK.toFixed(1) + ' ms');
console.log('  setzeRadius(r)        ' + radius.toFixed(1) + ' ms  → ' + ns(radius, leerK) + ' ns je Aufruf (generischer Komponenten-Setter)');
