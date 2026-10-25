#!/usr/bin/env node
'use strict';
/*
 * Klang nativ = Wasm (H-K14, K-153): spielt herd/klang/golden.txt (vom nativen `cargo test -j 2 -p herd-klang` geprüft) gegen
 * site/js/herd/klang.wasm nach – Hash und Länge jeder erzeugten PCM bzw. der Fehlertext müssen gleich sein.
 * Aufruf: node herd/test-klang.js   (Exit 1 bei Abweichung)
 */
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const golden = fs.readFileSync(path.join(__dirname, 'klang', 'golden.txt'), 'utf8').replace(/\r\n/g, '\n');
const k = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(path.join(WURZEL, 'site', 'js', 'herd', 'klang.wasm'))), {}).exports;

function woerter(z) {
  const w = [];
  let cur = '', zitat = false;
  for (const c of z) {
    if (c === '"') { zitat = !zitat; continue; }
    if (c === ' ' && !zitat) { if (cur) w.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur) w.push(cur);
  return w;
}
// zwei Texte nacheinander in den Austauschpuffer → [p1, l1, p2, l2]
function texte(a, b) {
  const ea = Buffer.from(a || ''), eb = Buffer.from(b || '');
  const p = k.puffer(ea.length + eb.length + 1);
  const m = new Uint8Array(k.memory.buffer);
  m.set(ea, p);
  m.set(eb, p + ea.length);
  return [p, ea.length, p + ea.length, eb.length];
}
function aufruf(w) {
  const n = (i) => Number(w[i].replace(/^#/, ''));
  switch (w[0]) {
    case 'ton': { const [p, l] = texte(w[3]); return k.ton(n(1), n(2), p, l, n(4), n(5), n(6), n(7)); }
    case 'rauschen': { const [p, l] = texte(w[2]); return k.rauschen(n(1), p, l, n(3), n(4), n(5), n(6)); }
    case 'stille': return k.stille(n(1));
    case 'noten': { const [p1, l1, p2, l2] = texte(w[1], w[3]); return k.noten(p1, l1, n(2), p2, l2, n(4)); }
    case 'huelle': return k.huelle(n(1), n(2), n(3), n(4), n(5));
    case 'tiefpass': return k.tiefpass(n(1), n(2), n(3));
    case 'hochpass': return k.hochpass(n(1), n(2), n(3));
    case 'verstaerke': return k.verstaerke(n(1), n(2));
    case 'mische': return k.mische(n(1), n(2), n(3));
    case 'dann': return k.dann(n(1), n(2));
    case 'wiederhole': return k.wiederhole(n(1), n(2));
    case 'nahtlos': return k.nahtlos(n(1), n(2));
    default: throw new Error('unbekannter Aufruf ' + w[0]);
  }
}
function fehlerText() {
  let kap = 64;
  for (;;) {
    const p = k.puffer(kap);
    const len = k.fehler_text(p, kap);
    if (len <= kap) return Buffer.from(new Uint8Array(k.memory.buffer, p, len)).toString('utf8');
    kap = len;
  }
}

let ok = 0;
const fehler = [];
for (const z of golden.split('\n')) {
  if (!z.trim() || z.startsWith('#')) continue;
  const i = z.indexOf(' = ');
  const auf = z.slice(0, i), soll = z.slice(i + 3);
  const id = aufruf(woerter(auf));
  let ist;
  if (id < 0) { ist = '! ' + fehlerText(); k.fehler_neu(); }
  else {
    const p = k.puffer(16);
    k.hash(id, p);
    ist = Buffer.from(new Uint8Array(k.memory.buffer, p, 16)).toString('latin1') + ' ' + (k.pcm_laenge(id) / 2);
  }
  if (ist === soll) ok++;
  else fehler.push(auf + ': nativ ' + soll + ', klang.wasm ' + ist);
}
if (fehler.length) {
  console.error('Klang nativ ≠ Wasm:\n  ' + fehler.join('\n  '));
  process.exit(1);
}
console.log('Klang: ' + ok + ' Aufrufe bitgleich nativ = klang.wasm (herd/klang/golden.txt)');
