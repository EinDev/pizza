#!/usr/bin/env node
/*
 * Fuzzing für pizza v3.0 – deterministisch per Seed.
 *
 *   node tests/fuzz/run.js [--anzahl 2000] [--seed 1] [--robust N] [--nur gueltig|robust] [--eingabe-anteil 0.25]
 *                          [--theke-anteil 0.1] [--keine-minimierung] [--ablage tests/fuzz/funde] [-v]
 *   Umgebung: FUZZ_SEED, FUZZ_ANZAHL, FUZZ_ROBUST (Kommandozeile hat Vorrang), PIZZA_MOTOREN, PIZZA_HOST
 *
 * Teil 1 (gültig): grammatikbasierte, terminierende Programme → alle verfügbaren Motoren, Vergleich gegen den
 *   Interpreter (Ereignisse ohne motor, Exit-Code, schritte, zeitMs) + Selbstkonsistenz (2. Lauf, onEvent, parse).
 * Teil 2 (robust): kaputte Eingaben (Mutationen, Token-Suppe, Bytesalat) → nie JS-Exception, immer Ereignis-API.
 * Jede Abweichung wird per Delta-Debugging minimiert und als Reproduktionsfall abgelegt:
 *   tests/fuzz/funde/<teil>-s<seed>-<nr>.pizza (+ .json mit Optionen, Signatur, Details).
 * Exit-Code 1, wenn es Funde gab.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pruefeFall, signatur, MOTOREN, M } = require('../differenz/vergleich');
const { erzeuge } = require('./generator');
const { mutiere, suppe } = require('./mutator');
const { minimiere } = require('./minimieren');
const { seedFuer, Zufall } = require('./zufall');

// ------------------------------------------------------------- Argumente
const argv = process.argv.slice(2);
const arg = (name, std) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : std; };
const zahl = (v, std) => (v == null || v === '' || isNaN(Number(v)) ? std : Number(v));
const anzahl = zahl(arg('--anzahl'), zahl(process.env.FUZZ_ANZAHL, 300));
const seed = zahl(arg('--seed'), zahl(process.env.FUZZ_SEED, 1)) >>> 0;
const robustAnzahl = zahl(arg('--robust'), zahl(process.env.FUZZ_ROBUST, anzahl));
const nur = arg('--nur', null);
const eingabeAnteil = zahl(arg('--eingabe-anteil'), 0.25);
const minimieren = !argv.includes('--keine-minimierung');
const ausfuehrlich = argv.includes('-v');
const ablage = path.resolve(arg('--ablage', path.join(__dirname, 'funde')));

const farbig = process.stdout.isTTY && !process.env.NO_COLOR;
const f = (c, t) => farbig ? '\x1b[' + c + 'm' + t + '\x1b[0m' : t;
const gruen = t => f('32', t), rot = t => f('31', t), gelb = t => f('33', t), grau = t => f('90', t), fett = t => f('1', t);

// --selbsttest: künstlich fehlerhafter Motor, um Erkennung + Minimierung + Ablage zu prüfen
// (weicht ab, sobald ein Programm .euro() aufruft: ein Schritt mehr).
if (argv.includes('--selbsttest')) {
  MOTOREN.push({
    name: 'kaputt', verfuegbar: true, grund: null,
    lauf(q, opt) {
      const r = M.interpreter.lauf(q, opt);
      if (r.status === 'ok' && /\.euro\(\)/.test(q)) { r.schritte++; }
      return r;
    },
  });
}
const eingabeOk = M.eingabeUnterstuetzt();
const thekeOk = (() => { try { return M.PizzaLang.run('Theke t = neu Theke("x"); Schild s = neu Schild("a"); t.zeige(s); t.bediene();', { uiEreignisse: [] }).exitCode === 0; } catch (_) { return false; } })();
const thekeAnteil = zahl(arg('--theke-anteil'), 0.1);
console.log(fett('pizza Fuzzing') + grau('  seed=' + seed + ' anzahl=' + anzahl + ' robust=' + robustAnzahl + (eingabeOk ? ' eingabe-anteil=' + eingabeAnteil : ' (Bestellannahme im Interpreter noch nicht verfügbar – keine Eingabe-Programme)') + (thekeOk ? ' theke-anteil=' + thekeAnteil : ' (keine Theke im Interpreter)')));
for (const m of MOTOREN) console.log('  Motor ' + m.name.padEnd(12) + (m.verfuegbar ? gruen('verfügbar') : gelb('übersprungen') + grau(' – ' + m.grund)));

const stat = {};
for (const m of MOTOREN) stat[m.name] = { gleich: 0, abweichung: 0, fallback: 0, speicherlimit: 0, wurf: 0, übersprungen: 0, ms: 0 };
const exitVerteilung = {};
const fallbackGruende = {};
const funde = [];
const sigGesehen = new Set();
const sigZaehler = {};
const MAX_PRO_SIGNATUR = 3;   // weitere Funde derselben Signatur werden nur gezählt

function zaehle(r) {
  for (const m of MOTOREN) {
    const e = r.je[m.name];
    if (!e) continue;
    const s = stat[m.name];
    if (e.ergebnis && typeof e.ergebnis.ms === 'number') s.ms += e.ergebnis.ms;
    if (e.status === 'nicht verfügbar' || e.status === 'übersprungen') s.übersprungen++;
    else if (e.status === 'fallback') { s.fallback++; fallbackGruende[m.name + ': ' + String(e.grund).replace(/Z\d+: /g, '')] = (fallbackGruende[m.name + ': ' + String(e.grund).replace(/Z\d+: /g, '')] || 0) + 1; }
    else if (e.status === 'wurf') s.wurf++;
    else if (e.abw && e.abw.art === 'speicherlimit') s.speicherlimit++;
    else if (e.abw) s.abweichung++;
    else s.gleich++;
  }
}

function fund(teil, nr, code, optionen, r) {
  const sig = signatur(r);
  const proSig = (sigZaehler[sig] = (sigZaehler[sig] || 0) + 1);
  if (proSig > MAX_PRO_SIGNATUR) { funde.push({ teil, nr, datei: null, sig, neu: false, probleme: r.probleme, code }); return; }
  const datei = teil + '-s' + seed + '-' + nr;
  let min = { code, pruefungen: 0, ms: 0 };
  if (minimieren) {
    // Gültige Programme bleiben beim Minimieren syntaktisch gültig (sonst „minimiert“ man in einen Syntaxfehler).
    const warGueltig = r.ref.status === 'ok' && !r.ref.ereignisse.some(e => e.typ === 'fehler' && e.art === 'syntax');
    min = minimiere(code, kand => {
      if (warGueltig && !M.PizzaLang.parse(kand).ok) return false;
      return signatur(pruefeFall(kand, optionen)) === sig;
    }, { maxPruefungen: 1200, maxMs: 45000 });
  }
  const rMin = pruefeFall(min.code, optionen);
  fs.mkdirSync(ablage, { recursive: true });
  const kopf = '// Fuzz-Fund ' + datei + ' – Signatur: ' + sig + '\n// optionen: ' + JSON.stringify(optionen) + '\n';
  fs.writeFileSync(path.join(ablage, datei + '.pizza'), kopf + min.code);
  if (optionen.eingabe) fs.writeFileSync(path.join(ablage, datei + '.eingabe'), optionen.eingabe.map(z => z + '\n').join(''));
  fs.writeFileSync(path.join(ablage, datei + '.json'), JSON.stringify({
    teil, seed, nr, signatur: sig, optionen,
    originalZeilen: code.split('\n').length, minimalZeilen: min.code.split('\n').length, minimierPruefungen: min.pruefungen,
    probleme: rMin.probleme, original: code,
  }, null, 2));
  const neu = !sigGesehen.has(sig);
  sigGesehen.add(sig);
  funde.push({ teil, nr, datei, sig, neu, probleme: rMin.probleme, code: min.code });
  console.log('\n' + rot('  ✗ Fund ' + datei) + grau(' [' + sig + '] – minimiert auf ' + min.code.split('\n').length + ' Zeilen (' + min.pruefungen + ' Prüfungen, ' + min.ms + ' ms)'));
  if (neu || ausfuehrlich) {
    console.log(min.code.split('\n').map(z => grau('    | ') + z).join('\n'));
    for (const p of rMin.probleme.slice(0, 3)) {
      console.log('    ' + fett('[' + p.motor + ' · ' + p.art + ']'));
      for (const d of p.details.slice(0, 12)) console.log(String(d).split('\n').slice(0, 8).map(z => '      ' + z).join('\n'));
    }
  }
}

const t0 = Date.now();
let generatorSyntax = 0;

// ------------------------------------------------------------- Teil 1: gültige Programme
if (nur !== 'robust') {
  console.log(fett('\n▶ Gültige Programme (' + anzahl + ')'));
  for (let i = 0; i < anzahl; i++) {
    const s = seedFuer(seed, i, 1);
    const z = new Zufall(s ^ 0x5bd1e995);
    const mitEingabe = eingabeOk && z.chance(eingabeAnteil);
    const mitTheke = thekeOk && z.chance(thekeAnteil);
    const { code, optionen } = erzeuge(s, { eingabe: mitEingabe, theke: mitTheke });
    const r = pruefeFall(code, optionen);
    zaehle(r);
    if (r.ref.status === 'ok') {
      const ex = r.ref.exitCode;
      exitVerteilung[ex] = (exitVerteilung[ex] || 0) + 1;
      if (r.ref.ereignisse.some(e => e.typ === 'fehler' && e.art === 'syntax')) {
        generatorSyntax++;
        if (ausfuehrlich) console.log(gelb('  Generator erzeugte Syntaxfehler (#' + i + '): ') + r.ref.ereignisse.find(e => e.art === 'syntax').text);
      }
    }
    if (r.probleme.length) fund('gueltig', i, code, optionen, r);
    else if (!farbig && (i + 1) % 100 === 0) console.log(grau('  … ' + (i + 1)));
    else if (farbig) process.stdout.write(grau('\r  ' + (i + 1) + '/' + anzahl));
  }
  if (farbig) process.stdout.write('\n');
}

// ------------------------------------------------------------- Teil 2: kaputte Eingaben
if (nur !== 'gueltig') {
  console.log(fett('\n▶ Robustheit: kaputte Eingaben (' + robustAnzahl + ')'));
  for (let i = 0; i < robustAnzahl; i++) {
    const s = seedFuer(seed, i, 2);
    let code;
    if (i % 3 === 2) code = suppe(s);
    else code = mutiere(erzeuge(seedFuer(seed, i, 3)).code, s);
    const optionen = { schrittLimit: 20000 };
    if (eingabeOk && i % 5 === 0) optionen.eingabe = ['1', '', 'x'];
    const r = pruefeFall(code, optionen);
    zaehle(r);
    if (r.probleme.length) fund('robust', i, code, optionen, r);
    else if (farbig) process.stdout.write(grau('\r  ' + (i + 1) + '/' + robustAnzahl));
  }
  if (farbig) process.stdout.write('\n');
}

// ------------------------------------------------------------- Bericht
const dauer = Date.now() - t0;
console.log(fett('\nErgebnis je Motor'));
for (const m of MOTOREN) {
  const s = stat[m.name];
  if (m === M.interpreter) { console.log('  interpreter  Referenz' + grau(' – ' + s.ms.toFixed(0) + ' ms')); continue; }
  if (!m.verfuegbar) { console.log('  ' + m.name.padEnd(12) + gelb(' übersprungen') + grau(' – ' + m.grund)); continue; }
  console.log('  ' + m.name.padEnd(12) + ' ' + [gruen(s.gleich + ' gleich'), (s.abweichung ? rot : grau)(s.abweichung + ' Abweichungen'),
    (s.wurf ? rot : grau)(s.wurf + ' Abstürze'), (s.fallback ? gelb : grau)(s.fallback + ' Fallback'), grau(s.speicherlimit + ' Speicherlimit')].join(', ') + grau(' – ' + s.ms.toFixed(0) + ' ms'));
}
if (Object.keys(fallbackGruende).length) {
  console.log(fett('\nFallback-Gründe'));
  for (const [g, n] of Object.entries(fallbackGruende).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log('  ' + gelb(String(n).padStart(5) + '×') + ' ' + g);
}
if (nur !== 'robust') {
  console.log(fett('\nGenerator-Qualität') + grau(' (Exit-Codes des Interpreters über gültige Programme)'));
  console.log('  ' + Object.entries(exitVerteilung).map(([k, v]) => 'exit ' + k + ': ' + v).join(', ') + (generatorSyntax ? rot('  – ' + generatorSyntax + ' Syntaxfehler (Generatorfehler!)') : ''));
}
const eindeutig = new Set(funde.map(x => x.sig)).size;
for (const [sg, n] of Object.entries(sigZaehler)) if (n > MAX_PRO_SIGNATUR) console.log(grau('  (' + (n - MAX_PRO_SIGNATUR) + ' weitere Funde mit Signatur ' + sg + ' nicht abgelegt)'));
console.log('\n' + (funde.length ? rot(funde.length + ' Funde (' + eindeutig + ' verschiedene Signaturen) → ' + path.relative(process.cwd(), ablage)) : gruen('Keine Funde')) +
  grau(' – ' + (anzahl * (nur === 'robust' ? 0 : 1) + robustAnzahl * (nur === 'gueltig' ? 0 : 1)) + ' Programme in ' + (dauer / 1000).toFixed(1) + ' s, seed ' + seed));
M.aufraeumen();
process.exitCode = funde.length || generatorSyntax ? 1 : 0;
