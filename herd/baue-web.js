#!/usr/bin/env node
'use strict';
/*
 * Baut die Browser-Glut (Paket H6, HERD.md §3.1/§7.2): herd/glut-web → wasm32-unknown-unknown → wasm-bindgen und legt ab:
 *   site/js/herd/glut.js        Glue (wasm-bindgen --target no-modules: klassisches Skript, definiert self.wasm_bindgen –
 *                               per importScripts im Render-Worker und per <script> im Hauptthread-Rückfall nutzbar)
 *   site/js/herd/glut_bg.wasm   (beides eingecheckt – Docker braucht kein Rust)
 * Aufruf: node herd/baue-web.js [--ohne-cargo]
 * Voraussetzungen: rustup target add wasm32-unknown-unknown;
 *   cargo install wasm-bindgen-cli --version <exakt die Version aus herd/glut-web/Cargo.toml> --locked -j 2
 * Optional: wasm-opt (binaryen) im PATH → zusätzlich -Oz. Fehlt es, wird es übersprungen (Hinweis).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cp = require('child_process');

const HIER = __dirname;
const ZIEL = path.join(HIER, '..', 'site', 'js', 'herd');
const ZIELORDNER = process.env.CARGO_TARGET_DIR || path.join(HIER, 'target');
const ROH = path.join(ZIELORDNER, 'wasm32-unknown-unknown', 'klein', 'herd_glut_web.wasm');
const lauf = (cmd, args, opt = {}) => cp.spawnSync(cmd, args, { cwd: HIER, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32', ...opt });

// Version von wasm-bindgen: Crate (gepinnt mit "=x.y.z") und CLI müssen exakt gleich sein
const toml = fs.readFileSync(path.join(HIER, 'glut-web', 'Cargo.toml'), 'utf8');
const pin = (toml.match(/wasm-bindgen\s*=\s*"=([0-9.]+)"/) || [])[1];
if (!pin) { console.error('herd/glut-web/Cargo.toml: wasm-bindgen ist nicht mit "=x.y.z" gepinnt'); process.exit(1); }
const v = cp.spawnSync('wasm-bindgen', ['--version'], { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' });
const cli = ((v.stdout || '').match(/([0-9]+\.[0-9]+\.[0-9]+)/) || [])[1];
if (cli !== pin) {
  console.error('wasm-bindgen-cli ' + (cli || 'fehlt') + ', gebraucht ' + pin + ':\n  cargo install wasm-bindgen-cli --version ' + pin + ' --locked -j 2');
  process.exit(1);
}

if (!process.argv.includes('--ohne-cargo')) {
  const r = lauf('cargo', ['build', '-j', '2', '--profile', 'klein', '-p', 'herd-glut-web', '--target', 'wasm32-unknown-unknown']);
  if (r.status !== 0) { console.error('cargo build fehlgeschlagen'); process.exit(1); }
}

fs.mkdirSync(ZIEL, { recursive: true });
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'herd-glut-'));
const r = lauf('wasm-bindgen', ['--target', 'no-modules', '--no-typescript', '--out-dir', tmp, '--out-name', 'glut', ROH]);
if (r.status !== 0) { console.error('wasm-bindgen fehlgeschlagen'); process.exit(1); }

let wasm = path.join(tmp, 'glut_bg.wasm');
const opt = cp.spawnSync('wasm-opt', ['--version'], { encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' });
if (opt.status === 0) {
  const aus = path.join(tmp, 'glut_opt.wasm');
  const o = lauf('wasm-opt', ['-Oz', '--enable-bulk-memory', '--enable-sign-ext', '--enable-mutable-globals', '--enable-nontrapping-float-to-int',
    '--enable-multivalue', '--enable-reference-types', wasm, '-o', aus]);
  if (o.status === 0) wasm = aus; else console.warn('wasm-opt fehlgeschlagen – nehme die Ausgabe von wasm-bindgen');
} else {
  console.warn('Hinweis: wasm-opt (binaryen) nicht gefunden – übersprungen (Größe ohne -Oz).');
}

// Glue: ohne eval/new Function (CSP script-src 'self' 'wasm-unsafe-eval')
let glue = fs.readFileSync(path.join(tmp, 'glut.js'), 'utf8');
if (/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(\s*['"]/.test(glue)) { console.error('glut.js enthält eval/new Function – CSP!'); process.exit(1); }
glue = '/* Herd-Glut (Paket H6) – erzeugt von herd/baue-web.js (wasm-bindgen ' + pin + ', --target no-modules). Nicht von Hand ändern. */\n' + glue;
fs.writeFileSync(path.join(ZIEL, 'glut.js'), glue);
fs.copyFileSync(wasm, path.join(ZIEL, 'glut_bg.wasm'));
fs.rmSync(tmp, { recursive: true, force: true });

const bytes = fs.readFileSync(path.join(ZIEL, 'glut_bg.wasm'));
const kb = (n) => (n / 1024).toFixed(0) + ' KiB';
console.log('glut_bg.wasm: ' + kb(bytes.length) + ' roh, ' + kb(zlib.gzipSync(bytes, { level: 6 }).length) + ' gzip (Stufe 6 wie nginx), ' +
  kb(zlib.brotliCompressSync(bytes).length) + ' brotli; glut.js: ' + kb(Buffer.byteLength(glue)));
