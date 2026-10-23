#!/usr/bin/env node
'use strict';
/*
 * Kern-Messung (HERD.md §6): Zeit je Takt und Bild für B1–B4 in voller Größe – nativ (herd-skript --mess, Release) und
 * als site/js/herd/kern.wasm in Node (herd/skript.js). Dazu der direkte Setter-Aufruf (teil_lage) je Weg.
 * Nur CPU, gedrosselt: Läufe ≤ ~1 s, ein Prozess nach dem anderen, Kindprozesse ohne Fenster.
 * Aufruf: node bench/herd/mess-kern.js [--ohne-cargo]   (baut herd-skript mit cargo build -j 2 --release)
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { lies, Spieler } = require('../../herd/skript.js');

const WURZEL = path.join(__dirname, '..', '..');
const HERD = path.join(WURZEL, 'herd');
const SZENEN = path.join(WURZEL, 'tests', 'herd', 'szenen');
const EXE = path.join(HERD, 'target', 'release', 'herd-skript' + (process.platform === 'win32' ? '.exe' : ''));
const UMGEBUNG = { ...process.env, CARGO_BUILD_JOBS: '2', HERD_SOFTWARE: '1' };

const LAEUFE = [
  ['B1', 'b1-sprites.herd', { N: 10000, TAKTE: 120 }],
  ['B2', 'b2-kreise.herd', { N: 10000, TAKTE: 60 }],
  ['B3', 'b3-koerper.herd', { N: 1000, TAKTE: 120 }],
  ['B4', 'b4-partikel.herd', { RATE: 1000, TAKTE: 180 }],
  ['B5', 'b5-funken.herd', { RATE: 1000, TAKTE: 180 }],
  ['B6', 'fuehler.herd', { N: 1000, TAKTE: 120 }],
  ['B6', 'fuehler.herd', { N: 10000, TAKTE: 60 }],
];

if (!process.argv.includes('--ohne-cargo')) {
  const r = cp.spawnSync('cargo', ['build', '-j', '2', '--release', '-p', 'herd-skript'], { cwd: HERD, stdio: 'inherit', env: UMGEBUNG, windowsHide: true, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(1);
}
const modul = new WebAssembly.Module(fs.readFileSync(path.join(WURZEL, 'site', 'js', 'herd', 'kern.wasm')));

function nativ(datei, vorgaben, extra = []) {
  const r = cp.spawnSync(EXE, [datei, ...Object.entries(vorgaben).map(([k, v]) => k + '=' + v), '--mess', ...extra], { encoding: 'utf8', windowsHide: true, env: UMGEBUNG });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim().split('\n').map((z) => JSON.parse(z));
}

function wasm(datei, vorgaben) {
  const inst = new WebAssembly.Instance(modul, {});
  const sp = new Spieler(inst, vorgaben);
  const takt = [], bild = [], jeBild = [];
  let offen = 0;
  sp.mess = {
    takt(ms) { takt.push(ms); offen += ms; },
    bild(ms) { bild.push(ms); jeBild.push(offen + ms); offen = 0; },
  };
  const t0 = performance.now();
  sp.spiele(lies(fs.readFileSync(datei, 'utf8')));
  const gesamt = (performance.now() - t0) / 1000;
  const mittel = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  const jb = jeBild.slice(1);
  const sortiert = [...jb].sort((a, b) => a - b);
  return { inst, takt_ms: mittel(takt), bild_ms: mittel(bild.slice(1)), kern_je_bild_ms: mittel(jb), kern_je_bild_median_ms: sortiert[sortiert.length >> 1] || 0, gesamt_s: gesamt };
}

function setterWasm(inst) {
  const k = inst.exports;
  const n = k.welt_hole(4) | 0;
  const runden = 60;
  const t0 = performance.now();
  for (let r = 0; r < runden; r++) for (let id = 3; id < n; id++) k.teil_lage(id, (id % 1280) + r, id % 720, 0);
  return ((performance.now() - t0) * 1e6) / (runden * Math.max(1, n - 3));
}

const f = (x) => x.toFixed(3);
console.log('| Bench | Takt nativ | Bild nativ | Kern je Bild nativ (Median) | Takt Wasm | Bild Wasm | Kern je Bild Wasm (Median) |');
console.log('|---|---|---|---|---|---|---|');
let setter = null;
for (const [name, datei, vorgaben] of LAEUFE) {
  const p = path.join(SZENEN, datei);
  const extra = name === 'B2' ? ['--setter'] : [];
  const zeilen = nativ(p, vorgaben, extra);
  const n = zeilen[zeilen.length - 1];
  const w = wasm(p, vorgaben);
  if (name === 'B2') setter = { nativ: zeilen[0].setter_ns, wasm: setterWasm(w.inst) };
  console.log('| ' + name + ' ' + JSON.stringify(vorgaben) + ' | ' + f(n.takt_ms) + ' ms | ' + f(n.bild_ms) + ' ms | ' + f(n.kern_je_bild_ms) + ' (' + f(n.kern_je_bild_median_ms) + ') ms | ' +
    f(w.takt_ms) + ' ms | ' + f(w.bild_ms) + ' ms | ' + f(w.kern_je_bild_ms) + ' (' + f(w.kern_je_bild_median_ms) + ') ms |');
}
if (setter) console.log('\nSetter teil_lage je Aufruf (B2, 10 000 Teile × 60): nativ ' + setter.nativ.toFixed(1) + ' ns, Wasm aus JS ' + setter.wasm.toFixed(1) + ' ns');
