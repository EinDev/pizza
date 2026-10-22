#!/usr/bin/env node
'use strict';
/*
 * Baut den Herd-Kern (Rust no_std → wasm32v1-none, ohne wasm-bindgen, ohne Importe) und legt ab:
 *   site/js/herd/kern.wasm     (Binär, eingecheckt)
 *   site/js/herd/schema.json   (Schema der Komponenten aus dem Kern, eingecheckt)
 * Aufruf: node herd/baue.js [--ohne-cargo] [--pruefe]
 *   --pruefe: baut nichts, vergleicht nur schema.json mit dem eingecheckten kern.wasm (Exit 1 bei Abweichung)
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const HIER = __dirname;
const ZIEL = path.join(HIER, '..', 'site', 'js', 'herd');
const ROH = path.join(HIER, 'target', 'wasm32v1-none', 'release', 'herd_kern_wasm.wasm');

function schemaAus(bytes) {
  const m = new WebAssembly.Module(bytes);
  if (WebAssembly.Module.imports(m).length) throw new Error('kern.wasm darf keine Importe haben');
  const k = new WebAssembly.Instance(m, {}).exports;
  let kap = 1 << 16;
  for (;;) {
    const p = k.puffer(kap);
    const n = k.schema_json(p, kap);
    if (n <= kap) return Buffer.from(new Uint8Array(k.memory.buffer, p, n)).toString('utf8');
    kap = n;
  }
}

const pruefe = process.argv.includes('--pruefe');
if (!pruefe && !process.argv.includes('--ohne-cargo')) {
  const r = cp.spawnSync('cargo', ['build', '--release', '-p', 'herd-kern-wasm', '--target', 'wasm32v1-none'], { cwd: HIER, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('cargo build fehlgeschlagen'); process.exit(1); }
}
if (pruefe) {
  const soll = schemaAus(fs.readFileSync(path.join(ZIEL, 'kern.wasm')));
  const ist = fs.readFileSync(path.join(ZIEL, 'schema.json'), 'utf8');
  if (soll !== ist) { console.error('site/js/herd/schema.json ist nicht aktuell (node herd/baue.js)'); process.exit(1); }
  console.log('schema.json aktuell');
  process.exit(0);
}
const bytes = fs.readFileSync(ROH);
const schema = schemaAus(bytes);
JSON.parse(schema); // muss gültiges JSON sein
fs.mkdirSync(ZIEL, { recursive: true });
fs.writeFileSync(path.join(ZIEL, 'kern.wasm'), bytes);
fs.writeFileSync(path.join(ZIEL, 'schema.json'), schema);
const exporte = WebAssembly.Module.exports(new WebAssembly.Module(bytes)).length;
console.log('kern.wasm: ' + bytes.length + ' Bytes, ' + exporte + ' Exporte; schema.json: ' + schema.length + ' Bytes');
