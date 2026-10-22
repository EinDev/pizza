#!/usr/bin/env node
/*
 * Herd: .herd-erwartet der Fälle tests/faelle/herd-* prüfen bzw. neu schreiben (K-134).
 * Die Hashes (szene/paket) berechnet kern.wasm – ändert sich der Kern (Bildpaket-Format, Systeme), ändern sie sich mit.
 *
 *   node tests/herd/erwartet.js [filter]               zeigt je Fall, ob die herd-Ereignisse zur Datei passen
 *   node tests/herd/erwartet.js [filter] --schreibe    schreibt .herd-erwartet neu (nur dort; .erwartet/.fehler bleiben)
 *
 * Vor dem Schreiben prüfen, dass sich nur Hashes geändert haben (Folge fenster/bild/schliesse und bildnummern gleich).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', '..', 'site', 'js', 'pizza.js'));
const DIR = path.join(__dirname, '..', 'faelle');
const schreibe = process.argv.includes('--schreibe');
const filter = process.argv.slice(2).find(a => !a.startsWith('--')) || '';

const zeilen = (t) => t.replace(/\r\n/g, '\n').split('\n').filter(z => z.trim()).map(z => JSON.parse(z));
const kanon = (v) => Array.isArray(v) ? '[' + v.map(kanon).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + kanon(v[k])).join(',') + '}' : JSON.stringify(v);
const folge = (l) => l.map(e => e.art + (e.art === 'bild' ? e.bildnummer : '')).join(' ');

let abw = 0;
for (const d of fs.readdirSync(DIR).filter(x => x.startsWith('herd-') && x.includes(filter) && x.endsWith('.pizza')).sort()) {
  const b = d.slice(0, -6), p = (e) => path.join(DIR, b + e);
  const opt = fs.existsSync(p('.optionen.json')) ? JSON.parse(fs.readFileSync(p('.optionen.json'), 'utf8')) : {};
  if (fs.existsSync(p('.ereignisse'))) opt.uiEreignisse = zeilen(fs.readFileSync(p('.ereignisse'), 'utf8'));
  const r = P.run(fs.readFileSync(p('.pizza'), 'utf8'), opt);
  const ist = r.ereignisse.filter(e => e.typ === 'herd').map(e => { const o = Object.assign({}, e); delete o.typ; return o; });
  const soll = fs.existsSync(p('.herd-erwartet')) ? zeilen(fs.readFileSync(p('.herd-erwartet'), 'utf8')) : null;
  if (soll === null && ist.length === 0) continue;
  const gleich = soll !== null && ist.map(kanon).join('\n') === soll.map(kanon).join('\n');
  if (gleich) { console.log('  ✓ ' + b); continue; }
  abw++;
  console.log('  ✗ ' + b + (soll === null ? ' (keine .herd-erwartet)' : folge(ist) === folge(soll) ? ' (nur Hashes)' : ' (Folge: ' + folge(soll) + ' → ' + folge(ist) + ')'));
  if (schreibe) fs.writeFileSync(p('.herd-erwartet'), ist.map(e => JSON.stringify(e) + '\n').join(''));
}
console.log(abw ? abw + (schreibe ? ' Datei(en) neu geschrieben' : ' Abweichung(en)') : 'alle passen');
process.exit(abw && !schreibe ? 1 : 0);
