#!/usr/bin/env node
'use strict';
/*
 * Vorbacker-Messung (PROJEKTE.md §5.3, PD1): Vorbacken eines 1024²-PNG (RGBA) und -JPEG (4:2:0, Q85, Baseline und
 * progressiv) – nativ (herd-teigling messe, Release) und als site/js/herd/teigling.wasm in Node (V8). Die Messbilder
 * erzeugt der Rust-Erzeuger (testbild::messbilder); beide Wege müssen denselben Teigling liefern (SHA-256 verglichen).
 * Nur CPU, gedrosselt: ein Prozess nach dem anderen, Kindprozesse ohne Fenster.
 * Aufruf: node bench/herd/mess-teigling.js [--ohne-cargo] [n]   (n = Läufe je Bild, Bestwert; Standard 5)
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const PizzaVorbacker = require('../../site/js/herd/teigling.js');

const HERD = path.join(__dirname, '..', '..', 'herd');
const EXE = path.join(HERD, 'target', 'release', 'herd-teigling' + (process.platform === 'win32' ? '.exe' : ''));
const ORDNER = path.join(HERD, 'target', 'teigling-mess');
const n = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || 5);

if (!process.argv.includes('--ohne-cargo')) {
  const r = cp.spawnSync('cargo', ['build', '-j', '2', '--release', '-p', 'herd-teigling', '--features', 'testbilder', '--bin', 'herd-teigling'],
    { cwd: HERD, stdio: 'inherit', env: { ...process.env, CARGO_BUILD_JOBS: '2' }, windowsHide: true, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(1);
}
const r = cp.spawnSync(EXE, ['messe', ORDNER, String(n)], { encoding: 'utf8', windowsHide: true });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
const vb = PizzaVorbacker.node();
const kb = (x) => (x / 1024).toFixed(0) + ' KiB';
const mib = (x) => (x / 1048576).toFixed(2) + ' MiB';
console.log('| Bild | Quelle | Teigling | nativ | Wasm (Node) | bitgleich |');
console.log('|---|---|---|---|---|---|');
for (const zeile of r.stdout.split('\n').filter(Boolean)) {
  const name = zeile.split(' ')[0];
  const feld = Object.fromEntries(zeile.split(' ').slice(1).map((x) => x.split('=')));
  const quelle = new Uint8Array(fs.readFileSync(path.join(ORDNER, name)));
  let best = Infinity, t = null;
  for (let i = 0; i < n; i++) {
    const s = process.hrtime.bigint();
    t = vb.vorbacken(quelle);
    best = Math.min(best, Number(process.hrtime.bigint() - s) / 1e6);
  }
  const gleich = crypto.createHash('sha256').update(t).digest('hex') === feld.sha && t.length === Number(feld.teigling);
  console.log('| ' + name + ' | ' + kb(quelle.length) + ' | ' + mib(t.length) + ' (' + PizzaVorbacker.kopf(t).stufen + ' Stufen) | ' +
    Number(feld.nativ_ms).toFixed(0) + ' ms | ' + best.toFixed(0) + ' ms | ' + (gleich ? 'ja' : 'NEIN') + ' |');
  if (!gleich) process.exitCode = 1;
}
