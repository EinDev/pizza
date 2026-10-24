#!/usr/bin/env node
'use strict';
/*
 * Determinismus-Test des Herd-Kerns (K-129, blockierend): Jedes Szenen-Skript aus tests/herd/szenen läuft
 *   - gegen site/js/herd/kern.wasm (Node, herd/skript.js) und
 *   - gegen den nativen Kern (herd-skript, Rust, gleiche Quelle wie kern.wasm)
 * und muss **dieselben Zeilen** liefern: jeden Rückgabewert und Szenen-/Paket-Hash je Bild.
 * Läufe: B1–B4 klein (viele Takte) und voll (wenige Takte), dazu hierarchie.herd, listen.herd (H-K0) und je Ausbaustufe ihre Szene (linien, b5-funken, gleiten, fuehler, wucht, vieleck, gelaende, vorlage, fliesen – voll mit 1024 × 1024 Kacheln, kulisse, himmelszelt).
 * Aufruf: node herd/test-kern.js [--ohne-cargo] [--nur name] [--zeige]
 * Gedrosselt: cargo mit -j 2, Kindprozesse ohne Fenster (windowsHide).
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { lies, Spieler } = require('./skript.js');

const HIER = __dirname;
const SZENEN = path.join(HIER, '..', 'tests', 'herd', 'szenen');
const WASM = path.join(HIER, '..', 'site', 'js', 'herd', 'kern.wasm');
const EXE = path.join(HIER, 'target', 'debug', 'herd-skript' + (process.platform === 'win32' ? '.exe' : ''));
const UMGEBUNG = { ...process.env, CARGO_BUILD_JOBS: '2', HERD_SOFTWARE: '1' };

/** Läufe: [Datei, Vorgaben] – klein = viele Takte, voll = volle Größe (HERD.md §6) mit wenigen Takten. */
const LAEUFE = [
  ['b1-sprites.herd', {}],
  ['b1-sprites.herd', { N: 10000, TAKTE: 3 }],
  ['b2-kreise.herd', {}],
  ['b2-kreise.herd', { N: 10000, TAKTE: 2 }],
  ['b3-koerper.herd', {}],
  ['b3-koerper.herd', { N: 1000, TAKTE: 3 }],
  ['b4-partikel.herd', {}],
  ['b4-partikel.herd', { RATE: 1000, TAKTE: 5 }],
  ['hierarchie.herd', {}],
  ['linien.herd', {}],
  ['listen.herd', {}],
  ['gleiten.herd', {}],
  ['gleiten.herd', { N: 500, TAKTE: 6 }],
  ['b5-funken.herd', {}],
  ['b5-funken.herd', { RATE: 1000, TAKTE: 125 }],
  ['belag.herd', {}],
  ['fuehler.herd', {}],
  ['fuehler.herd', { N: 1000, TAKTE: 20 }],
  ['fuehler.herd', { N: 10000, TAKTE: 3 }],
  ['teigling.herd', {}],
  ['blick.herd', {}],
  ['blick.herd', { N: 10000, TAKTE: 3 }],
  ['wucht.herd', {}],
  ['wucht.herd', { N: 500, TAKTE: 120 }],
  ['wucht.herd', { N: 2000, TAKTE: 30 }],
  ['vieleck.herd', {}],
  ['vieleck.herd', { N: 100, TAKTE: 6 }],
  ['gelaende.herd', {}],
  ['gelaende.herd', { N: 256, TAKTE: 3 }],
  ['gelaende.herd', { N: 256, TAKTE: 3, UMBAU: 1 }],
  ['vorlage.herd', {}],
  ['vorlage.herd', { N: 1000, TAKTE: 10 }],
  ['fliesen.herd', {}],
  ['fliesen.herd', { S: 256, CHUNKS: 4, N: 200, TAKTE: 12 }],
  ['kulisse.herd', {}],
  ['kulisse.herd', { N: 2000, TAKTE: 10 }],
  ['himmelszelt.herd', {}],
  ['himmelszelt.herd', { N: 100, TAKTE: 4 }],
  ['ui.herd', {}],
  ['ui.herd', { N: 2000, TAKTE: 6 }],
  ['lichter.herd', {}],
  ['lichter.herd', { N: 1024, TAKTE: 3 }],
  ['stimmung.herd', {}],
  ['stimmung.herd', { N: 2000 }],
];

const args = process.argv.slice(2);
const nur = args.includes('--nur') ? args[args.indexOf('--nur') + 1] : null;
if (!args.includes('--ohne-cargo')) {
  const r = cp.spawnSync('cargo', ['build', '-j', '2', '-p', 'herd-skript'], { cwd: HIER, stdio: 'inherit', env: UMGEBUNG, windowsHide: true, shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('cargo build -p herd-skript fehlgeschlagen'); process.exit(1); }
}
const modul = new WebAssembly.Module(fs.readFileSync(WASM));

function nativ(datei, vorgaben) {
  const a = [datei, ...Object.entries(vorgaben).map(([k, v]) => k + '=' + v)];
  const r = cp.spawnSync(EXE, a, { encoding: 'utf8', maxBuffer: 1 << 30, windowsHide: true, env: UMGEBUNG });
  if (r.error) throw r.error;
  if (r.status !== 0 && !r.stdout.includes('FEHLER')) throw new Error('herd-skript: ' + r.stderr);
  return r.stdout.split('\n').filter((z) => z.length);
}

function wasm(datei, vorgaben) {
  const sp = new Spieler(new WebAssembly.Instance(modul, {}), vorgaben);
  try { sp.spiele(lies(fs.readFileSync(datei, 'utf8'))); } catch (e) { sp.zeilen.push('FEHLER ' + e.message); }
  return sp.zeilen;
}

let fehler = 0;
for (const [name, vorgaben] of LAEUFE) {
  if (nur && !name.includes(nur)) continue;
  const datei = path.join(SZENEN, name);
  const titel = name + (Object.keys(vorgaben).length ? ' ' + JSON.stringify(vorgaben) : '');
  const t0 = Date.now();
  const n = nativ(datei, vorgaben);
  const t1 = Date.now();
  const w = wasm(datei, vorgaben);
  const t2 = Date.now();
  const bilder = w.filter((z) => z.startsWith('B ')).length;
  let i = 0;
  while (i < n.length && i < w.length && n[i] === w[i]) i++;
  if (i === n.length && i === w.length && !n.some((z) => z.startsWith('FEHLER'))) {
    console.log('ok   ' + titel.padEnd(44) + ' ' + String(n.length).padStart(7) + ' Zeilen, ' + String(bilder).padStart(3) + ' Bilder bitgleich  (nativ ' + (t1 - t0) + ' ms, wasm ' + (t2 - t1) + ' ms)');
    if (args.includes('--zeige')) console.log('     letztes Bild: ' + w.filter((z) => z.startsWith('B ')).pop());
  } else {
    fehler++;
    console.log('FEHL ' + titel + ': erste Abweichung in Ausgabezeile ' + (i + 1));
    for (let j = Math.max(0, i - 3); j < i; j++) console.log('       ' + n[j]);
    console.log('  nativ: ' + (n[i] ?? '(Ende)'));
    console.log('  wasm:  ' + (w[i] ?? '(Ende)'));
  }
}
if (fehler) { console.log(fehler + ' Lauf/Läufe nicht bitgleich'); process.exit(1); }
console.log('Kern nativ = kern.wasm: alle Läufe bitgleich');
