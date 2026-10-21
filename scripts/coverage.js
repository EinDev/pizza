#!/usr/bin/env node
/*
 * Coverage für den Interpreter (site/js/pizza.js) und – sobald vorhanden – den Compiler
 * (site/js/pizzaiolo.js, site/js/pizzaiolo/**). Ohne Abhängigkeiten: nutzt die in Node (>= 22.5)
 * eingebaute Coverage des Test-Runners (`node --test --experimental-test-coverage`).
 *
 *   node scripts/coverage.js                     alle vorhandenen Suiten
 *   node scripts/coverage.js interpreter         nur bestimmte Suiten (interpreter|pruefstand|wasm|differenz)
 *   node scripts/coverage.js --aus=coverage      Ausgabeordner (Standard: coverage/)
 *
 * Ergebnis im Ausgabeordner:
 *   lcov.info              maschinenlesbar (z. B. für Editor-Plugins / genhtml)
 *   zusammenfassung.md     Tabelle + größte ungetestete Bereiche (landet in CI im Job-Summary)
 *   zusammenfassung.json   dieselben Zahlen als JSON
 * Exit-Code != 0, wenn eine der ausgeführten Suiten fehlschlägt.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const ausArg = args.find(a => a.startsWith('--aus='));
const AUS = path.resolve(ROOT, ausArg ? ausArg.slice(6) : 'coverage');
const gewuenscht = args.filter(a => !a.startsWith('--'));

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const hatSkript = name => !!(pkg.scripts && pkg.scripts[name]);
const existiert = rel => fs.existsSync(path.join(ROOT, rel));

// Suite → Kommando (nur wenn vorhanden). Alles läuft in Kindprozessen; die Coverage wird über
// NODE_V8_COVERAGE (vom Test-Runner gesetzt, an Kindprozesse vererbt) eingesammelt.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const SUITEN = {
  interpreter: existiert('tests/run-tests.js') && [process.execPath, ['tests/run-tests.js']],
  pruefstand: existiert('pruefstand/run.js') && [process.execPath, ['pruefstand/run.js']],
  wasm: hatSkript('test:wasm') && [npm, ['run', '-s', 'test:wasm']],
  differenz: hatSkript('test:differenz') && [npm, ['run', '-s', 'test:differenz']],
};

const auswahl = (gewuenscht.length ? gewuenscht : Object.keys(SUITEN)).filter(s => {
  if (!(s in SUITEN)) { console.error('Unbekannte Suite: ' + s + ' (bekannt: ' + Object.keys(SUITEN).join(', ') + ')'); process.exit(2); }
  if (!SUITEN[s]) { console.log('· Suite „' + s + '“ existiert (noch) nicht – übersprungen.'); return false; }
  return true;
});
if (!auswahl.length) { console.error('Keine Suite vorhanden.'); process.exit(2); }

// Für jede Suite eine winzige Test-Datei, die das Kommando startet.
const LAUF = path.join(AUS, '.lauf');
fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(LAUF, { recursive: true });
const dateien = auswahl.map(s => {
  const [cmd, cargs] = SUITEN[s];
  const datei = path.join(LAUF, s + '.test.js');
  fs.writeFileSync(datei,
    "'use strict';\n" +
    'const r = require("child_process").spawnSync(' + JSON.stringify(cmd) + ', ' + JSON.stringify(cargs) +
    ', { cwd: ' + JSON.stringify(ROOT) + ', stdio: "inherit", shell: ' + (cmd === npm && process.platform === 'win32') + ' });\n' +
    'if (r.error) throw r.error;\n' +
    'if (r.status !== 0) { console.error("Suite ' + s + ' fehlgeschlagen (Exit " + r.status + ")"); process.exitCode = 1; }\n');
  return datei;
});

const LCOV = path.join(AUS, 'lcov.info');
const INCLUDE = ['site/js/pizza.js', 'site/js/pizzaiolo.js', 'site/js/pizzaiolo/**/*.js'];
console.log('▶ Coverage für Suiten: ' + auswahl.join(', '));
const lauf = spawnSync(process.execPath, [
  '--test', '--experimental-test-coverage', '--test-concurrency=1',
  ...INCLUDE.map(g => '--test-coverage-include=' + g),
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=lcov', '--test-reporter-destination=' + LCOV,
  ...dateien,
], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NO_COLOR: '1' } });
fs.rmSync(LAUF, { recursive: true, force: true });

if (!fs.existsSync(LCOV)) { console.error('Kein lcov-Bericht entstanden.'); process.exit(lauf.status || 1); }

// ---------------------------------------------------------------------------
// lcov auswerten
// ---------------------------------------------------------------------------
function leseLcov(text) {
  const dateien = [];
  let d = null;
  for (const zeile of text.split(/\r?\n/)) {
    const i = zeile.indexOf(':');
    const k = i < 0 ? zeile : zeile.slice(0, i), v = i < 0 ? '' : zeile.slice(i + 1);
    if (k === 'SF') { d = { datei: v.split(path.sep).join('/').split('\\').join('/'), da: new Map(), fn: [], fnda: new Map(), br: [] }; dateien.push(d); }
    else if (!d) continue;
    else if (k === 'DA') { const [l, c] = v.split(','); d.da.set(+l, +c); }
    else if (k === 'FN') { const j = v.indexOf(','); d.fn.push({ zeile: +v.slice(0, j), id: v.slice(j + 1) }); }
    else if (k === 'FNDA') { const j = v.indexOf(','); d.fnda.set(v.slice(j + 1), +v.slice(0, j)); }
    else if (k === 'BRDA') { const [l, , , t] = v.split(','); d.br.push({ zeile: +l, genommen: t === '-' ? 0 : +t }); }
    else if (k === 'end_of_record') d = null;
  }
  return dateien;
}

function funktionsName(quelle, zeile) {
  const s = quelle[zeile - 1] || '';
  // Methodentabelle: 'name': function (...) → TABELLE.name
  const q = s.match(/^\s*['"]([^'"]+)['"]\s*:\s*(?:function\b|\([^)]*\)\s*=>)/);
  if (q) {
    for (let z = zeile - 1; z > 0 && z > zeile - 400; z--) {
      const t = (quelle[z - 1] || '').match(/^\s*(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=/);
      if (t) return t[1] + '.' + q[1];
    }
    return q[1];
  }
  let m = s.match(/function\s*\*?\s*([\w$]+)\s*\(/) ||
    s.match(/^\s*(?:static\s+|async\s+|get\s+|set\s+)*([\w$]+)\s*\([^)]*\)\s*\{/) ||
    s.match(/([\w$.]+)\s*[:=]\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)/) ||
    s.match(/class\s+([\w$]+)/);
  if (m && !/^(if|for|while|switch|catch|return|function)$/.test(m[1])) return m[1];
  return null;
}

const pct = (h, f) => f ? (100 * h / f) : 100;
const fmt = x => x.toFixed(2).replace('.', ',') + ' %';

const ergebnis = { suiten: auswahl, node: process.version, dateien: [] };
for (const d of leseLcov(fs.readFileSync(LCOV, 'utf8'))) {
  const quelle = fs.existsSync(path.join(ROOT, d.datei)) ? fs.readFileSync(path.join(ROOT, d.datei), 'utf8').split(/\r?\n/) : [];
  const leer = l => { const t = (quelle[l - 1] || '').trim(); return t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || /^[})\];,]+$/.test(t); };

  // Funktionen mit aufgelöstem Namen (benannte bevorzugt als „Bereich“)
  const fns = d.fn.map(f => ({ ...f, name: funktionsName(quelle, f.zeile), aufrufe: d.fnda.get(f.id) || 0 }))
    .sort((a, b) => a.zeile - b.zeile);
  const benannt = fns.filter(f => f.name);
  const umgebend = zeile => {
    let best = null;
    for (const f of benannt) { if (f.zeile <= zeile) best = f; else break; }
    return best ? best.name + ' (Z. ' + best.zeile + ')' : '(Modulebene)';
  };

  const zeilenF = d.da.size, zeilenH = [...d.da.values()].filter(c => c > 0).length;
  const brF = d.br.length, brH = d.br.filter(b => b.genommen > 0).length;
  const fnF = fns.length, fnH = fns.filter(f => f.aufrufe > 0).length;

  // zusammenhängende ungetestete Bereiche (Leer-/Kommentarzeilen überbrücken)
  const bereiche = [];
  let cur = null;
  const max = Math.max(0, ...d.da.keys());
  for (let l = 1; l <= max; l++) {
    const c = d.da.get(l);
    if (c === 0 && !leer(l)) {
      if (cur && l - cur.bis <= 3 && [...Array(l - cur.bis - 1).keys()].every(k => leer(cur.bis + 1 + k) || d.da.get(cur.bis + 1 + k) === 0)) { cur.bis = l; cur.code++; }
      else { cur = { von: l, bis: l, code: 1 }; bereiche.push(cur); }
    }
  }
  for (const b of bereiche) {
    b.funktion = umgebend(b.von);
    b.code_ = (quelle[b.von - 1] || '').trim().slice(0, 90);
  }

  // Aggregation je benannter Funktion: ungetestete Codezeilen + nie genommene Zweige
  const proFunktion = new Map();
  const add = (zeile, feld) => {
    const k = umgebend(zeile);
    const e = proFunktion.get(k) || { funktion: k, zeilen: 0, zweige: 0 };
    e[feld]++; proFunktion.set(k, e);
  };
  for (const [l, c] of d.da) if (c === 0 && !leer(l)) add(l, 'zeilen');
  for (const b of d.br) if (b.genommen === 0) add(b.zeile, 'zweige');

  ergebnis.dateien.push({
    datei: d.datei,
    zeilen: { gesamt: zeilenF, getroffen: zeilenH, prozent: +pct(zeilenH, zeilenF).toFixed(2) },
    zweige: { gesamt: brF, getroffen: brH, prozent: +pct(brH, brF).toFixed(2) },
    funktionen: { gesamt: fnF, getroffen: fnH, prozent: +pct(fnH, fnF).toFixed(2) },
    ungetesteteFunktionen: fns.filter(f => f.aufrufe === 0).map(f => ({ zeile: f.zeile, name: f.name || '(anonym)', code: (quelle[f.zeile - 1] || '').trim().slice(0, 90) })),
    groessteBereiche: bereiche.sort((a, b) => b.code - a.code || a.von - b.von).slice(0, 25)
      .map(b => ({ von: b.von, bis: b.bis, codezeilen: b.code, funktion: b.funktion, code: b.code_ })),
    proFunktion: [...proFunktion.values()].sort((a, b) => (b.zeilen * 2 + b.zweige) - (a.zeilen * 2 + a.zweige)).slice(0, 25),
  });
}

// ---------------------------------------------------------------------------
// Bericht
// ---------------------------------------------------------------------------
const esc = s => String(s).replace(/\|/g, '\\|').replace(/`/g, 'ˋ');
let md = '## 🍕 Coverage\n\nSuiten: ' + auswahl.map(s => '`' + s + '`').join(', ') + ' · Node ' + process.version +
  (lauf.status ? ' · **⚠ mindestens eine Suite ist fehlgeschlagen**' : '') + '\n\n';
md += '| Datei | Zeilen | Zweige | Funktionen |\n|---|---:|---:|---:|\n';
for (const f of ergebnis.dateien) {
  md += '| `' + f.datei + '` | ' + fmt(f.zeilen.prozent) + ' (' + f.zeilen.getroffen + '/' + f.zeilen.gesamt + ') | ' +
    fmt(f.zweige.prozent) + ' (' + f.zweige.getroffen + '/' + f.zweige.gesamt + ') | ' +
    fmt(f.funktionen.prozent) + ' (' + f.funktionen.getroffen + '/' + f.funktionen.gesamt + ') |\n';
}
for (const f of ergebnis.dateien) {
  md += '\n<details><summary><b>' + f.datei + '</b> – größte ungetestete Bereiche</summary>\n\n';
  md += '**Je Funktion** (ungetestete Codezeilen / nie genommene Zweige):\n\n| Funktion | Zeilen | Zweige |\n|---|---:|---:|\n';
  for (const e of f.proFunktion) md += '| ' + esc(e.funktion) + ' | ' + e.zeilen + ' | ' + e.zweige + ' |\n';
  md += '\n**Zusammenhängende Blöcke:**\n\n| Zeilen | Codezeilen | in | erste Zeile |\n|---|---:|---|---|\n';
  for (const b of f.groessteBereiche) md += '| ' + b.von + (b.bis > b.von ? '–' + b.bis : '') + ' | ' + b.codezeilen + ' | ' + esc(b.funktion) + ' | `' + esc(b.code) + '` |\n';
  if (f.ungetesteteFunktionen.length) {
    md += '\n**Nie aufgerufene Funktionen (' + f.ungetesteteFunktionen.length + '):**\n\n';
    md += f.ungetesteteFunktionen.map(u => '- Z. ' + u.zeile + ': `' + esc(u.code) + '`').join('\n') + '\n';
  }
  md += '\n</details>\n';
}

fs.writeFileSync(path.join(AUS, 'zusammenfassung.md'), md);
fs.writeFileSync(path.join(AUS, 'zusammenfassung.json'), JSON.stringify(ergebnis, null, 2) + '\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');

console.log('\n' + '─'.repeat(60));
for (const f of ergebnis.dateien) {
  console.log(f.datei + ':  Zeilen ' + fmt(f.zeilen.prozent) + '  Zweige ' + fmt(f.zweige.prozent) + '  Funktionen ' + fmt(f.funktionen.prozent));
}
console.log('Bericht: ' + path.relative(ROOT, AUS) + path.sep + '{lcov.info, zusammenfassung.md, zusammenfassung.json}');
process.exitCode = lauf.status || 0;
