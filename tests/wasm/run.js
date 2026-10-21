#!/usr/bin/env node
'use strict';
/*
 * Testsuite des Compilers pizzaiolo:  node tests/wasm/run.js  (npm run test:wasm)
 *   kodierer   – LEB128, Sections, handgebautes Modul
 *   ir         – IR-Struktur für den ganzen Korpus (IR.pruefe, JSON-Rundreise)
 *   laufzeit   – JS-identische Zahlformatierung der Rust-Laufzeit
 *   portabel   – Feature-Prüfung (nur MVP + bulk-memory + multi-value + mutable-globals + sign-ext + nontrapping-fptoint)
 *   e2e        – alle Beispiele, Doku-Blöcke und tests/wasm/faelle: Wasm == Interpreter (Ereignisse, Exit, Schritte, Uhr)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const K = require(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'kodierer.js'));
const IR = require(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'ir.js'));
const Z = require(path.join(ROOT, 'site', 'js', 'pizzaiolo.js'));
const P = require(path.join(ROOT, 'site', 'js', 'pizza.js'));
const F = require(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'frontend.js'));
const korpus = require('./korpus.js');
const { pruefePortabel } = require('./portabel.js');
const { vergleiche } = require('./vergleich.js');

let fehl = 0, ok = 0;
const pruefe = (name, fn) => {
  try { const r = fn(); if (r === false) throw new Error('fehlgeschlagen'); ok++; }
  catch (e) { fehl++; console.log('  ✗ ' + name + ': ' + (e && e.message)); }
};

function eigeneFaelle() {
  const dir = path.join(__dirname, 'faelle');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.pizza')).sort().map(f => {
    const quelle = fs.readFileSync(path.join(dir, f), 'utf8');
    const op = path.join(dir, f.replace(/\.pizza$/, '.optionen.json'));
    return { name: 'wasm/' + f, quelle, opt: fs.existsSync(op) ? JSON.parse(fs.readFileSync(op, 'utf8')) : {} };
  });
}

console.log('▶ kodierer');
pruefe('LEB128 u32/s32/s64', () => {
  const werte32 = [0, 1, 63, 64, 127, 128, 255, 624485, 2 ** 31 - 1, -1, -64, -65, -123456, -(2 ** 31)];
  for (const v of werte32) {
    const p = new K.Puffer(); p.s32(v); const l = new K.Leser(p.fertig(), 0);
    if (l.s32() !== v) throw new Error('s32 ' + v);
    if (v >= 0) { const q = new K.Puffer(); q.u32(v); if (new K.Leser(q.fertig(), 0).u32() !== v) throw new Error('u32 ' + v); }
  }
  for (const v of [0n, 1n, -1n, 2n ** 63n - 1n, -(2n ** 63n), 0xFFFC000000000000n - 2n ** 64n, 123456789012345n]) {
    const p = new K.Puffer(); p.s64(v);
    if (new K.Leser(p.fertig(), 0).s64() !== BigInt.asIntN(64, v)) throw new Error('s64 ' + v);
  }
});
pruefe('handgebautes Modul (add, multi-value, sign-ext)', () => {
  const typ = new K.Puffer(); typ.u32(1); typ.byte(0x60); typ.u32(2); typ.byte(0x7f); typ.byte(0x7f); typ.u32(2); typ.byte(0x7f); typ.byte(0x7f);
  const fn = new K.Puffer(); fn.u32(1); fn.u32(0);
  const ex = new K.Puffer(); ex.u32(1); ex.name('f'); ex.byte(0); ex.u32(0);
  const c = new K.Code(); c.get(0).get(1).op(K.OP.i32_add).get(0).op(0xc0).end();
  const body = c.bytes();
  const code = new K.Puffer(); code.u32(1); code.u32(body.length + 1); code.u32(0); code.bytes(body);
  const m = K.verbinde([new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]), K.section(1, typ.fertig()), K.section(3, fn.fertig()), K.section(7, ex.fertig()), K.section(10, code.fertig())]);
  const i = new WebAssembly.Instance(new WebAssembly.Module(m));
  const [s, b] = i.exports.f(40, 0x1ff);
  return s === 40 + 0x1ff && b === 40;
});
pruefe('Modul-Leser liest laufzeit.wasm', () => {
  const m = K.leseModul(fs.readFileSync(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'laufzeit.wasm')));
  return m.funktionen.length > 100 && m.export('rt_lauf') && m.export('memory');
});

pruefe('optionale Importgruppen (HOST-ABI §2)', () => {
  const imp = (q) => WebAssembly.Module.imports(new WebAssembly.Module(Z.kompiliere(q).pkarton)).map(i => i.name).sort().join(',');
  const basis = 'ausgabe,eingabe,fehler,fehlerausgabe,leeren,panik,schreibe,warnung';
  if (imp('Bote.sage((1));') !== basis) throw new Error('Basis: ' + imp('Bote.sage((1));'));
  if (imp('Vorratskammer v = neu Vorratskammer("a");') !== basis + ',vorrat_lesen,vorrat_schreiben'.split(',').sort().join(',').replace(/^/, '')
    && imp('Vorratskammer v = neu Vorratskammer("a");').split(',').sort().join(',') !== basis.split(',').concat(['vorrat_lesen', 'vorrat_schreiben']).sort().join(',')) throw new Error('Vorrat');
  const t = imp('Theke t = neu Theke("x"); t.zeige(neu Schild("a"));').split(',');
  if (!t.includes('ui_senden') || !t.includes('ui_warte') || t.includes('vorrat_lesen')) throw new Error('Theke: ' + t);
});

const faelle = korpus.alle().concat(eigeneFaelle());

console.log('▶ ir');
for (const f of faelle) {
  const p = P.parse(f.quelle);
  if (!p.ok) continue;
  const r = F.frontend(p.ast);
  if (!r.ok) continue;
  pruefe('IR ' + f.name, () => {
    const probleme = IR.pruefe(r.ir);
    if (probleme.length) throw new Error(probleme.slice(0, 3).join('; '));
    const roh = JSON.stringify(r.ir);
    return JSON.stringify(JSON.parse(roh)) === roh;
  });
}

console.log('▶ laufzeit');
pruefe('Zahlformatierung', () => {
  const r = require('./laufzeit-zahlen.js').pruefe();
  if (r.fehler.length) throw new Error(r.fehler.length + ' Abweichungen, z. B. ' + r.fehler[0]);
});

console.log('▶ portabel');
pruefe('laufzeit.wasm', () => {
  const p = pruefePortabel(fs.readFileSync(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'laufzeit.wasm')));
  if (p.length) throw new Error(p.slice(0, 3).join('; '));
});
for (const f of faelle) {
  const k = Z.kompiliere(f.quelle);
  if (!k.ok) continue;
  pruefe('portabel ' + f.name, () => { const p = pruefePortabel(k.pkarton); if (p.length) throw new Error(p.slice(0, 3).join('; ')); });
}

console.log('▶ e2e');
const stat = { gleich: 0, fallback: 0, syntax: 0 };
for (const f of faelle) {
  const r = vergleiche(f);
  if (r.status === 'gleich') { stat.gleich++; ok++; continue; }
  if (r.status === 'syntax') { stat.syntax++; continue; }
  if (r.status === 'fallback' && /Theke/.test(r.grund)) { stat.fallback++; continue; }
  fehl++;
  console.log('  ✗ ' + f.name + ' [' + r.status + '] ' + (r.grund || '') + (r.diffs ? '\n    ' + r.diffs.join('\n    ') : '') + (r.fehler ? '\n' + r.fehler : ''));
}
console.log('  e2e: ' + stat.gleich + ' identisch, ' + stat.fallback + ' Theke-Fallback, ' + stat.syntax + ' Syntaxfehler (Interpreter)');

console.log('\n' + (fehl ? '✗ ' + fehl + ' fehlgeschlagen, ' : '✓ ') + ok + ' bestanden');
process.exitCode = fehl ? 1 : 0;
