#!/usr/bin/env node
'use strict';
/*
 * Baut die pizzaiolo-Laufzeit (Rust no_std → wasm32v1-none) und legt sie ab:
 *   site/js/pizzaiolo/laufzeit.wasm      (Binär, eingecheckt)
 *   site/js/pizzaiolo/laufzeit-daten.js  (Base64 + Adressen, für synchrones Laden im Browser-Worker)
 * Aufruf: node laufzeit/baue.js [--ohne-cargo]
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const HIER = __dirname;
const ZIEL = path.join(HIER, '..', 'site', 'js', 'pizzaiolo');
const ROH = path.join(HIER, 'target', 'wasm32v1-none', 'release', 'pizza_laufzeit.wasm');

if (!process.argv.includes('--ohne-cargo')) {
  const r = cp.spawnSync('cargo', ['build', '--release', '-j', '2'], { cwd: HIER, stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true });
  if (r.status !== 0) { console.error('cargo build fehlgeschlagen'); process.exit(1); }
}
const bytes = fs.readFileSync(ROH);
const leer = () => 0;
// Platzhalter für alle Importe (Gruppe herd: Modul „herd“ = Kern-Exporte, pizza.herd_* – hier nie gerufen)
const importe = { pizza: { eingabe: () => -1, ui_warte: () => -1, vorrat_lesen: () => -1, kueche_auftrag: () => -1, kueche_bericht: () => -2 }, herd: {} };
for (const im of WebAssembly.Module.imports(new WebAssembly.Module(bytes))) {
  if (im.kind !== 'function') continue;
  importe[im.module] = importe[im.module] || {};
  if (!(im.name in importe[im.module])) importe[im.module][im.name] = im.module === 'herd' ? () => -1 : leer;
}
const inst = new WebAssembly.Instance(new WebAssembly.Module(bytes), importe);
// Beginn der veränderlichen statischen Daten (.data/.bss): das Datensegment, in dem ZUSTAND liegt (wasm-ld legt
// .rodata vor .data vor .bss). Die Küchenbrigade sichert [statischStart, __heap_base) beim Anschnitt (THREADS.md §4.4).
function statischStart(zustand) {
  const K = require(path.join(ZIEL, 'kodierer.js'));
  const m = K.leseModul(bytes);
  const l = new K.Leser(m.datenRoh, 0);
  const n = l.u32();
  let start = null;
  for (let i = 0; i < n; i++) {
    const flags = l.u32();
    if (flags !== 0) throw new Error('Datensegment mit Flags ' + flags);
    if (l.b[l.i] !== 0x41) throw new Error('Datensegment ohne i32.const');
    l.i++;
    const off = l.s32();
    if (l.b[l.i] !== 0x0b) throw new Error('Datensegment: Ausdruck zu lang');
    l.i++;
    const len = l.u32();
    if (zustand >= off && zustand < off + len) start = off;
    l.i += len;
  }
  if (start === null) throw new Error('ZUSTAND liegt in keinem Datensegment');
  return start;
}
const info = {
  zustand: inst.exports.rt_info(0),
  statischStartAdr: inst.exports.rt_info(4),
  statischStart: statischStart(inst.exports.rt_info(0)),
  heapStartAdr: inst.exports.rt_info(1),
  heapBase: inst.exports.rt_info(2),
  posTabelle: inst.exports.rt_info(3),
  hash: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16),
  groesse: bytes.length,
};
fs.mkdirSync(ZIEL, { recursive: true });
fs.writeFileSync(path.join(ZIEL, 'laufzeit.wasm'), bytes);
const js = `/* GENERIERT von laufzeit/baue.js – nicht von Hand ändern. */
(function (root) {
  'use strict';
  var daten = { info: ${JSON.stringify(info)}, base64: '${bytes.toString('base64')}' };
  if (typeof module === 'object' && module && module.exports) module.exports = daten;
  else { root.PizzaioloTeile = root.PizzaioloTeile || {}; root.PizzaioloTeile.laufzeitDaten = daten; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
`;
fs.writeFileSync(path.join(ZIEL, 'laufzeit-daten.js'), js);
console.log('laufzeit.wasm: ' + bytes.length + ' Bytes, ' + JSON.stringify(info));
