#!/usr/bin/env node
'use strict';
/*
 * Benchmark: Interpreter vs. pizzaiolo (Wasm) – identische Schrittzählung wird mitgeprüft.
 *   node bench/run.js [--schnell]      (--schnell: weniger Wiederholungen)
 * Ziele (WASM.md §1): typisierte Rechenschleifen ≥ 10×, fib(27) ≥ 5×, Beispielprogramme inkl. Kompilierzeit nicht langsamer.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'site', 'js', 'pizza.js'));
const Z = require(path.join(ROOT, 'site', 'js', 'pizzaiolo.js'));
const korpus = require(path.join(ROOT, 'tests', 'wasm', 'korpus.js'));

const schnell = process.argv.includes('--schnell');
const jetzt = () => Number(process.hrtime.bigint()) / 1e6;

const PROGRAMME = [
  { name: 'Schleife salami (1e6)', ziel: 10, opt: { schrittLimit: 1e9 }, quelle:
`salami summe = 0;
für (salami i = 0; i < 1000000; i++) {
    summe = summe + i % 7;
}
Bote.sage((summe));` },
  { name: 'Schleife funghi (1e6)', ziel: 10, opt: { schrittLimit: 1e9 }, quelle:
`funghi x = 0.5;
salami i = 0;
solange (i < 1000000) {
    x = x * 1.0000001 + 0.25;
    i = i + 1;
}
Bote.sage((x));` },
  { name: 'Schleife in Methode', ziel: 10, opt: { schrittLimit: 1e9 }, quelle:
`salami zaehle(salami n) {
    salami s = 0;
    für (salami i = 0; i < n; i++) {
        falls (i % 3 == 0) { s += i; } sonst { s -= 1; }
    }
    serviere (s);
}
Bote.sage((zaehle(1000000)));` },
  { name: 'fib(27)', ziel: 5, opt: { schrittLimit: 1e9 }, quelle:
`salami fib(salami n) {
    falls (n < 2) { serviere (n); }
    serviere ((fib(n - 1) + fib(n - 2)));
}
Bote.sage((fib(27)));` },
  { name: 'Blech & Texte', ziel: 1, opt: { schrittLimit: 1e9 }, quelle:
`Blech<salami> b = [];
für (salami i = 0; i < 20000; i++) { b.hinzu((i * 7) % 1000); }
salami s = b.belege(x -> x * 2).filtere(x -> x % 3 == 0).zusammenklappen((a, c) -> a + c, 0);
margherita t = "";
für (salami i = 0; i < 2000; i++) { t = t + "ab"; }
Bote.sage((s), (t.länge()));` },
];

function zeit(fn, n) {
  const z = [];
  for (let i = 0; i < n; i++) { const t0 = jetzt(); fn(); z.push(jetzt() - t0); }
  z.sort((a, b) => a - b);
  return z[Math.floor(z.length / 2)];
}

function vergleich(p) {
  const n = schnell ? 3 : 7;
  let ri, rw, k;
  const ti = zeit(() => { ri = P.run(p.quelle, p.opt); }, n);
  // Playground-Pfad: Programm als Zusatzmodul zur gecachten Laufzeit (Pizzaiolo.run)
  const tk = zeit(() => { k = Z._kompiliereTeil(p.quelle); }, n);
  if (!k.ok) return { name: p.name, fehler: JSON.stringify(k.nichtUnterstuetzt || k.fehler) };
  const tw = zeit(() => { rw = Z._teile.hostJs.fuehreModulAus(k.modul, p.opt); }, n);
  const gleich = ri.schritte === rw.schritte && ri.exitCode === rw.exitCode &&
    JSON.stringify(ri.ereignisse) === JSON.stringify(rw.ereignisse);
  return { name: p.name, schritte: ri.schritte, interpreterMs: ti, kompilierMs: tk, wasmMs: tw, faktor: ti / tw, faktorMitKompilieren: ti / (tw + tk), ziel: p.ziel, gleich };
}

function main() {
  const zeilen = [];
  console.log('Rechenprogramme (Median):');
  for (const p of PROGRAMME) {
    const r = vergleich(p);
    zeilen.push(r);
    if (r.fehler) { console.log('  ' + r.name + ': ' + r.fehler); continue; }
    console.log('  ' + r.name.padEnd(24) + ' Schritte ' + String(r.schritte).padStart(9) + ' | Interpreter ' + r.interpreterMs.toFixed(1).padStart(8) + ' ms | Wasm ' + r.wasmMs.toFixed(1).padStart(7) + ' ms (+' + r.kompilierMs.toFixed(1) + ' ms Kompilieren) | ×' + r.faktor.toFixed(1) + (r.ziel > 1 ? ' (Ziel ≥ ' + r.ziel + '×)' : '') + (r.gleich ? '' : '  !! ABWEICHUNG'));
  }
  // Beispielprogramme inkl. Kompilierzeit
  let sumI = 0, sumW = 0, sumK = 0, anzahl = 0;
  for (const f of korpus.beispiele()) {
    const p = { name: f.name, quelle: typeof f.quelle === 'string' ? f.quelle : f.text, opt: f.opt, ziel: 1 };   // Mehrdatei → Hauptdatei (nur Zeitmessung)
    const r = vergleich(p);
    if (r.fehler) continue;
    sumI += r.interpreterMs; sumW += r.wasmMs; sumK += r.kompilierMs; anzahl++;
  }
  console.log('Beispielprogramme (' + anzahl + '): Interpreter ' + sumI.toFixed(1) + ' ms | Wasm ' + sumW.toFixed(1) + ' ms + Kompilieren ' + sumK.toFixed(1) + ' ms = ' + (sumW + sumK).toFixed(1) + ' ms | ×' + (sumI / (sumW + sumK)).toFixed(2));
  return zeilen;
}

if (require.main === module) main();
module.exports = { main, PROGRAMME };
