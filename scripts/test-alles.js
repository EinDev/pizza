#!/usr/bin/env node
/*
 * Führt alle vorhandenen Test-Suiten nacheinander aus (lokal, wie in der CI) und fasst zusammen.
 * Fehlende Suiten (Skript/Ordner existiert noch nicht) werden übersprungen.
 *
 *   npm run test:alles                 alles außer Browser-E2E
 *   npm run test:alles -- --mit-e2e    inkl. test:e2e (braucht Chrome, ggf. CHROME_PFAD)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const mitE2e = process.argv.includes('--mit-e2e');
const win = process.platform === 'win32';
const hatSkript = n => !!(pkg.scripts && pkg.scripts[n]);
const da = rel => fs.existsSync(path.join(ROOT, rel));
const hatCargo = () => spawnSync('cargo', ['--version'], { stdio: 'ignore', shell: win }).status === 0;

const npmRun = s => ['npm', ['run', '-s', s], ROOT];
const SUITEN = [
  ['interpreter', () => true, () => ['npm', ['test'], ROOT]],
  ['pruefstand', () => da('pruefstand/run.js'), () => [process.execPath, ['pruefstand/run.js'], ROOT]],
  ['wasm', () => hatSkript('test:wasm'), () => npmRun('test:wasm')],
  ['differenz', () => hatSkript('test:differenz'), () => npmRun('test:differenz')],
  ['fuzz', () => hatSkript('test:fuzz'), () => npmRun('test:fuzz')],
  ['ui', () => da('ui/package.json') && da('ui/node_modules'), () => ['npm', ['test'], path.join(ROOT, 'ui')]],
  ['host', () => da('host/Cargo.toml') && hatCargo(), () => ['cargo', ['test', '--quiet'], path.join(ROOT, 'host')]],
  ['e2e', () => mitE2e && hatSkript('test:e2e'), () => npmRun('test:e2e')],
];

// Fuzz in reproduzierbarer, kurzer Variante (wie CI), sofern nicht anders gesetzt.
const env = { ...process.env, FUZZ_SEED: process.env.FUZZ_SEED || '42', FUZZ_ANZAHL: process.env.FUZZ_ANZAHL || '500' };

const ergebnisse = [];
for (const [name, vorhanden, kommando] of SUITEN) {
  if (!vorhanden()) { ergebnisse.push([name, 'übersprungen', 0]); continue; }
  const [cmd, args, cwd] = kommando();
  console.log('\n━━━ ' + name + ' ━━━  (' + [path.basename(cmd), ...args].join(' ') + ')');
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: win && cmd !== process.execPath });
  ergebnisse.push([name, r.status === 0 ? 'ok' : 'FEHLGESCHLAGEN (Exit ' + (r.error ? r.error.code : r.status) + ')', Date.now() - t0]);
}

console.log('\n━━━ Zusammenfassung ━━━');
for (const [n, s, ms] of ergebnisse) console.log('  ' + n.padEnd(12) + s + (ms ? '  (' + (ms / 1000).toFixed(1) + ' s)' : ''));
const rot = ergebnisse.filter(e => e[1].startsWith('FEHL')).length;
console.log(rot ? '\n✗ ' + rot + ' Suite(n) fehlgeschlagen.' : '\n✓ Alles gegessen.');
process.exitCode = rot ? 1 : 0;
