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
  const r = cp.spawnSync('cargo', ['build', '--release'], { cwd: HIER, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('cargo build fehlgeschlagen'); process.exit(1); }
}
const bytes = fs.readFileSync(ROH);
const leer = () => 0;
const inst = new WebAssembly.Instance(new WebAssembly.Module(bytes), {
  pizza: { ausgabe: leer, fehlerausgabe: leer, warnung: leer, fehler: leer, panik: leer, schreibe: leer, leeren: leer, eingabe: () => -1, ui_senden: leer, ui_warte: () => -1 },
});
const info = {
  zustand: inst.exports.rt_info(0),
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
