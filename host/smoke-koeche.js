#!/usr/bin/env node
/*
 * Smoke-Test Küchenbrigade im nativen Host (THREADS.md §5 Punkt 9, P4):  node host/smoke-koeche.js [pfad/zu/pizza-host]
 *  - alle tests/faelle/kueche-*.pizza: --koeche=4 (auch mit --kuechen-chaos) liefert dieselben Ereignisse wie --koeche=1
 *  - --info zeigt „Köche: 4“ bei einem Programm mit brigade, kein „Köche:“ ohne brigade
 * Braucht ein gebautes Release-Binary (cargo build --release); nie echter Vorrat (--kein-vorrat), kein Fenster.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
globalThis.PizzaLang = require(path.join(WURZEL, 'site', 'js', 'pizza.js'));
const Pizzaiolo = require(path.join(WURZEL, 'site', 'js', 'pizzaiolo.js'));
const exe = process.argv[2] || path.join(__dirname, 'target', 'release', 'pizza-host' + (process.platform === 'win32' ? '.exe' : ''));
const env = Object.assign({}, process.env, { NO_COLOR: '1', PIZZA_THEKE: '0' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pizza-koeche-'));
let fehler = 0;
const ok = (b, t) => { console.log((b ? '  ✓  ' : '  ✗  ') + t); if (!b) fehler++; };

function karton(name, quelle) {
  const k = Pizzaiolo.kompiliere(quelle);
  if (!k.ok) throw new Error(name + ': nicht kompilierbar ' + JSON.stringify(k.nichtUnterstuetzt || k.fehler));
  const p = path.join(tmp, name + '.pkarton');
  fs.writeFileSync(p, k.pkarton);
  return p;
}
const lauf = (args) => spawnSync(exe, ['--kein-vorrat', ...args], { encoding: 'utf8', env, input: '', maxBuffer: 64 << 20 });

const faelle = path.join(WURZEL, 'tests', 'faelle');
for (const f of fs.readdirSync(faelle).filter((d) => /^kueche-.*\.pizza$/.test(d)).sort()) {
  const pk = karton(f, fs.readFileSync(path.join(faelle, f), 'utf8'));
  let opt = {};
  try { opt = JSON.parse(fs.readFileSync(path.join(faelle, f.replace(/\.pizza$/, '.optionen.json')), 'utf8')); } catch (_) {}
  const basis = ['--ereignisse-json', ...(opt.schrittLimit != null ? ['--schritte=' + opt.schrittLimit] : [])];
  const ref = lauf([...basis, '--koeche=1', pk]);
  const gleich = [['--koeche=4'], ['--koeche=4', '--kuechen-chaos=7'], ['--koeche=3', '--kuechen-chaos=1']].every((v) => {
    const r = lauf([...basis, ...v, pk]);
    return r.stdout === ref.stdout && r.status === ref.status;
  });
  ok(gleich && ref.stdout.includes('"typ":"ende"'), f + ': --koeche=4 (auch Chaos) = --koeche=1');
}

const grob = karton('grob', 'Blech<salami> r = [1, 2, 3, 4, 5, 6, 7, 8].brigade(x -> {\n    salami s = 0;\n    für (salami i : [1 .. 20000]) { s = (s + i * x) % 1000003; }\n    serviere ((s));\n});\nBote.sage((r));\n');
const mit = lauf(['--info', '--saat=1', '--schritte=100000000', '--koeche=4', grob]);
ok(mit.status === 0 && /· Köche: 4\s*$/.test(mit.stderr), '--info zeigt „Köche: 4“ (' + mit.stderr.trim().split('\n').pop() + ')');
const eins = lauf(['--info', '--saat=1', '--schritte=100000000', '--koeche=1', grob]);
ok(/· Köche: 1\s*$/.test(eins.stderr) && eins.stdout === mit.stdout, '--koeche=1: „Köche: 1“, gleiche Ausgabe');
const ohne = lauf(['--info', '--saat=1', karton('ohne', 'Bote.sage(("ohne Brigade"));\n')]);
ok(ohne.status === 0 && !/Köche/.test(ohne.stderr), 'ohne brigade kein „Köche:“');
const falsch = lauf(['--koeche=0', grob]);
ok(falsch.status === 2 && /--koeche braucht auto oder eine Zahl von 1 bis 64\./.test(falsch.stderr), '--koeche=0 → Meldung, Exit 2');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fehler ? '\n' + fehler + ' Fehler' : '\nAlles gut.');
process.exit(fehler ? 1 : 0);
