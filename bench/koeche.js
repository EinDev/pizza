#!/usr/bin/env node
'use strict';
/*
 * Benchmark Küchenbrigade (THREADS §5 Punkt 8): 8 grobe Stücke à ~10⁶ Schritte im Wasm-Motor,
 * ohne Köche (Inline-Pfad) gegen einen warmen Pool mit k = 2, 4, 8 Köchen. Ziel: Speedup ≥ 0,6 × k (k ≤ Kerne).
 *   node bench/koeche.js [--schnell] [--stuecke=8] [--schritte=1000000]
 * Ergebnisse (Ereignisse, schritte, zeitMs) müssen in allen Varianten identisch sein.
 */
const path = require('path');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const Z = require(path.join(ROOT, 'site', 'js', 'pizzaiolo.js'));
const koch = Z._teile.koch;

const arg = (n, d) => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? Number(a.split('=')[1]) : d; };
const schnell = process.argv.includes('--schnell');
const STUECKE = arg('stuecke', 8);
const SCHRITTE = arg('schritte', 1000000);
const jetzt = () => Number(process.hrtime.bigint()) / 1e6;

// Schleife mit 12 Schritten je Durchlauf → n / 12 Durchläufe je Stück
const quelle = `Blech<salami> b = [];
für (salami i = 0; i < ${STUECKE}; i++) { b.hinzu(i); }
Blech<salami> r = b.brigade(x -> {
    salami s = 0;
    für (salami j = 0; j < ${Math.round(SCHRITTE / 12)}; j++) { s = s + (j + x) % 7; }
    serviere (s);
});
Bote.sage((r));`;

const median = (z) => z.slice().sort((a, b) => a - b)[Math.floor(z.length / 2)];
const zeit = (fn) => { const t0 = jetzt(); const r = fn(); return { ms: jetzt() - t0, r }; };

function main() {
  const k = Z._kompiliereTeil(quelle);
  if (!k.ok) throw new Error('kompiliert nicht: ' + JSON.stringify(k.nichtUnterstuetzt || k.fehler));
  const kerne = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  const n = schnell ? 5 : 11;
  const opt = { schrittLimit: 1e12 };
  const lauf = (extra) => Z._teile.hostJs.fuehreModulAus(k.modul, Object.assign({}, opt, extra));
  const fp = (r) => JSON.stringify([r.ereignisse.filter(e => e.typ !== 'ende'), r.exitCode, r.schritte, r.zeitMs]);
  for (let i = 0; i < 3; i++) lauf({});   // aufwärmen
  const basis = lauf({});
  console.log('Küchenbrigade: ' + STUECKE + ' Stücke, ' + basis.schritte + ' Schritte gesamt, ' + kerne + ' logische Kerne' +
    ' (Inline und Köche abwechselnd gemessen, Median von ' + n + ')');
  const zeilen = [];
  for (const kk of [2, 4, 8]) {
    if (kk > kerne) { console.log('  k = ' + kk + ': übersprungen (nur ' + kerne + ' Kerne)'); continue; }
    const pool = koch.kuechenPoolSync(kk);
    if (!pool) { console.log('  k = ' + kk + ': kein Pool möglich'); continue; }
    for (let i = 0; i < 3; i++) lauf({ koeche: pool });   // Pool aufwärmen (Wasm-Tiering je Koch, Module, Klone)
    const zi = [], zk = [], q = [];
    let gleich = true;
    for (let i = 0; i < n; i++) {
      const a = zeit(() => lauf({}));
      const b = zeit(() => lauf({ koeche: pool }));
      zi.push(a.ms); zk.push(b.ms); q.push(a.ms / b.ms);
      if (fp(b.r) !== fp(basis)) gleich = false;
    }
    pool.beenden();
    const speedup = median(q);
    const ziel = 0.6 * kk;
    zeilen.push({ k: kk, inlineMs: median(zi), ms: median(zk), speedup, gleich, ziel });
    console.log('  k = ' + kk + ' Köche: ' + median(zk).toFixed(1).padStart(7) + ' ms, ohne Köche ' + median(zi).toFixed(1).padStart(7) +
      ' ms  ×' + speedup.toFixed(2) + ' (Ziel ≥ ' + ziel.toFixed(1) + ')' + (speedup >= ziel ? '' : '  !! unter Ziel') + (gleich ? '' : '  !! ABWEICHUNG'));
  }
  return zeilen;
}

if (require.main === module) {
  const z = main();
  if (z.some(x => !x.gleich)) process.exitCode = 1;
}
module.exports = { main };
