#!/usr/bin/env node
/*
 * Differenztests pizza v3.0: Interpreter (Referenz) vs. Wasm (pizzaiolo) vs. nativer Host.
 *
 *   node tests/differenz/run.js                 alles
 *   node tests/differenz/run.js korpus doku     nur diese Quellen (korpus|beispiele|doku|faelle|pruefstand)
 *   node tests/differenz/run.js --filter text   nur Fälle, deren Name text enthält
 *   -v                                          auch gleiche Fälle zeigen
 *   --json datei                                Ergebnisübersicht als JSON schreiben
 *
 * Verglichen werden Ereignisfolge (ohne motor-Ereignis/-Feld), Exit-Code, schritte, zeitMs.
 * Motoren, die (noch) fehlen, werden übersprungen. Fallbacks (nichtUnterstuetzt) werden separat gezählt.
 * Exit-Code 1 bei Abweichung, Absturz, verletzter Invariante oder falscher Exit-Erwartung.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pruefeFall, MOTOREN } = require('./vergleich');
const K = require('./korpus');
const M = require('./motoren');

const argv = process.argv.slice(2);
const ausfuehrlich = argv.includes('-v');
let filter = null, jsonAus = null;
const nur = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--filter') filter = argv[++i];
  else if (argv[i] === '--json') jsonAus = argv[++i];
  else if (argv[i] === '-v') continue;
  else if (K.QUELLEN[argv[i]]) nur.push(argv[i]);
  else { console.error('Unbekanntes Argument: ' + argv[i]); process.exit(2); }
}

const farbig = process.stdout.isTTY && !process.env.NO_COLOR;
const f = (c, t) => farbig ? '\x1b[' + c + 'm' + t + '\x1b[0m' : t;
const gruen = t => f('32', t), rot = t => f('31', t), gelb = t => f('33', t), grau = t => f('90', t), fett = t => f('1', t);

const warnungen = [];
const faelle = K.lade(nur.length ? nur : null, w => warnungen.push(w)).filter(x => !filter || x.name.includes(filter));

console.log(fett('pizza Differenztests') + grau('  (' + faelle.length + ' Fälle)'));
for (const m of MOTOREN) console.log('  Motor ' + m.name.padEnd(12) + (m.verfuegbar ? gruen('verfügbar') : gelb('übersprungen') + grau(' – ' + m.grund)));
for (const w of warnungen) console.log(gelb('  Hinweis: ') + w);

const stat = {};
for (const m of MOTOREN) stat[m.name] = { gleich: 0, abweichung: 0, fallback: 0, speicherlimit: 0, wurf: 0, übersprungen: 0, ms: 0, liefFaelle: 0 };
const proQuelle = {};
const fallbackListe = [];
const speicherListe = [];
let fehlerAnzahl = 0;
const funde = [];
const t0 = Date.now();

for (const fall of faelle) {
  const q = proQuelle[fall.quelle] || (proQuelle[fall.quelle] = { faelle: 0, probleme: 0 });
  q.faelle++;
  const titel = fall.quelle + '/' + fall.name;
  const r = pruefeFall(fall.code, fall.optionen);
  const probleme = r.probleme.slice();
  if (fall.erwartetExit != null && r.ref.status === 'ok' && r.ref.exitCode !== fall.erwartetExit) {
    const fe = r.ref.ereignisse.filter(e => e.typ === 'fehler').map(e => e.text).join(' | ');
    probleme.push({ motor: 'interpreter', art: 'erwartung', details: ['Exit-Code ' + r.ref.exitCode + ', erwartet ' + fall.erwartetExit + (fe ? ' – ' + fe : '')] });
  }
  for (const m of MOTOREN) {
    const e = r.je[m.name];
    const s = stat[m.name];
    if (!e) continue;
    if (e.ergebnis && typeof e.ergebnis.ms === 'number') { s.ms += e.ergebnis.ms; s.liefFaelle++; }
    if (e.status === 'nicht verfügbar' || e.status === 'übersprungen') s.übersprungen++;
    else if (e.status === 'fallback') s.fallback++;
    else if (e.status === 'wurf') s.wurf++;
    else if (e.abw && e.abw.art === 'speicherlimit') s.speicherlimit++;
    else if (e.abw) s.abweichung++;
    else s.gleich++;
  }
  for (const fb of r.fallbacks) fallbackListe.push({ fall: titel, motor: fb.motor, grund: fb.grund });
  for (const sp of r.speicher) speicherListe.push({ fall: titel, motor: sp.motor });
  if (probleme.length) {
    fehlerAnzahl++; q.probleme++;
    console.log(rot('  ✗ ') + titel);
    for (const p of probleme) {
      console.log('    ' + fett('[' + p.motor + ' · ' + p.art + ']'));
      for (const d of p.details) console.log(String(d).split('\n').map(z => '      ' + z).join('\n'));
    }
    funde.push({ fall: titel, probleme });
  } else if (ausfuehrlich) {
    const motoren = Object.entries(r.je).filter(([, e]) => e.status === 'gleich' || e.status === 'ok').map(([n]) => n).join('+');
    console.log(gruen('  ✓ ') + titel + grau(' (' + motoren + ')'));
  }
}

const dauer = Date.now() - t0;
console.log(fett('\nKorpus'));
for (const [n, q] of Object.entries(proQuelle)) console.log('  ' + n.padEnd(12) + String(q.faelle).padStart(5) + ' Fälle' + (q.probleme ? rot('  ' + q.probleme + ' mit Problemen') : ''));
console.log('  ' + 'gesamt'.padEnd(12) + String(faelle.length).padStart(5) + ' Fälle');

console.log(fett('\nErgebnis je Motor'));
for (const m of MOTOREN) {
  const s = stat[m.name];
  if (m === M.interpreter) {
    console.log('  interpreter  Referenz' + grau(' – Selbstkonsistenz geprüft, ' + s.ms.toFixed(0) + ' ms Laufzeit'));
    continue;
  }
  if (!m.verfuegbar) { console.log('  ' + m.name.padEnd(12) + gelb(' übersprungen') + grau(' – ' + m.grund)); continue; }
  const teile = [gruen(s.gleich + ' gleich'), (s.abweichung ? rot : grau)(s.abweichung + ' Abweichungen'), (s.wurf ? rot : grau)(s.wurf + ' Abstürze'),
    (s.fallback ? gelb : grau)(s.fallback + ' Fallback'), grau(s.speicherlimit + ' Speicherlimit'), grau(s.übersprungen + ' übersprungen')];
  console.log('  ' + m.name.padEnd(12) + ' ' + teile.join(', ') + grau(' – ' + s.ms.toFixed(0) + ' ms'));
}
if (fallbackListe.length) {
  console.log(fett('\nFallback (nichtUnterstuetzt) – ' + fallbackListe.length));
  const nachGrund = {};
  for (const fb of fallbackListe) (nachGrund[fb.motor + ': ' + fb.grund.replace(/^Z\d+: /, '').replace(/; Z\d+: /g, '; ')] ||= []).push(fb.fall);
  for (const [g, l] of Object.entries(nachGrund).sort((a, b) => b[1].length - a[1].length)) {
    console.log('  ' + gelb(String(l.length).padStart(4) + '×') + ' ' + g);
    console.log(grau('        ' + l.slice(0, 6).join(', ') + (l.length > 6 ? ', …' : '')));
  }
}
if (speicherListe.length) {
  console.log(fett('\nSpeicherlimit (dokumentierte Grenze, kein Fehler) – ' + speicherListe.length));
  for (const s of speicherListe) console.log('  ' + s.motor + ': ' + s.fall);
}
console.log('\n' + (fehlerAnzahl ? rot(fehlerAnzahl + ' Fälle mit Problemen') : gruen('Keine Abweichungen')) + grau(' – ' + faelle.length + ' Fälle in ' + (dauer / 1000).toFixed(1) + ' s'));

if (jsonAus) {
  fs.writeFileSync(jsonAus, JSON.stringify({ faelle: faelle.length, proQuelle, stat, fallback: fallbackListe, speicher: speicherListe, funde, dauerMs: dauer }, null, 2));
}
M.aufraeumen();
process.exitCode = fehlerAnzahl ? 1 : 0;
