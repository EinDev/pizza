#!/usr/bin/env node
/*
 * Differenztest nativer Host ↔ Interpreter.
 *   node host/test.js [--debug] [--filter=name]
 *
 * Für jedes Beispiel aus site/beispiele/index.json:
 *   1. Pizzaiolo.kompiliere(quelltext) → .pkarton (temporäre Datei)
 *   2. pizza-host --ereignisse-json [--eingabe datei] programm.pkarton  (stdin geschlossen)
 *   3. Vergleich aller Ereignisse (inkl. ende mit schritte/zeitMs) und Exit-Code mit PizzaLang.run
 * Fehlt site/js/pizzaiolo.js, wird der Test übersprungen (Exit 0, Hinweis).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const BEISPIELE = path.join(WURZEL, 'site', 'beispiele');
const argv = process.argv.slice(2);
const profil = argv.includes('--debug') ? 'debug' : 'release';
const filter = (argv.find((a) => a.startsWith('--filter=')) || '').slice(9);

const PizzaLang = require(path.join(WURZEL, 'site', 'js', 'pizza.js'));
const pizzaioloPfad = path.join(WURZEL, 'site', 'js', 'pizzaiolo.js');
if (!fs.existsSync(pizzaioloPfad)) {
  console.log('Übersprungen: site/js/pizzaiolo.js fehlt noch (Compiler nicht vorhanden).');
  process.exit(0);
}
global.PizzaLang = PizzaLang; // falls pizzaiolo.js PizzaLang global erwartet
const Pizzaiolo = require(pizzaioloPfad);

// Host bauen (falls nötig) und finden.
const exe = path.join(__dirname, 'target', profil, 'pizza-host' + (process.platform === 'win32' ? '.exe' : ''));
{
  const r = spawnSync('cargo', ['build', '--quiet', ...(profil === 'release' ? ['--release'] : [])], { cwd: __dirname, stdio: 'inherit' });
  if (r.status !== 0 || !fs.existsSync(exe)) { console.error('cargo build fehlgeschlagen'); process.exit(2); }
}

function beispiele() {
  const index = JSON.parse(fs.readFileSync(path.join(BEISPIELE, 'index.json'), 'utf8'));
  const liste = [];
  for (const teil of index.teile) {
    const p = path.join(BEISPIELE, teil);
    if (!fs.existsSync(p)) continue;
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const b of m.beispiele) liste.push(b);
  }
  return liste;
}

const zeilen = (t) => { const z = t.split(/\r?\n/); if (z.length && z[z.length - 1] === '') z.pop(); return z; };

function vergleiche(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = JSON.stringify(a[i]); const y = JSON.stringify(b[i]);
    if (x !== y) return 'Ereignis ' + i + ':\n      Interpreter: ' + x + '\n      Host:        ' + y;
  }
  return null;
}

// Interpreter-Ereignisse normalisieren (Schlüsselreihenfolge, `umbruch: true` weglassen).
function norm(e) {
  const o = {};
  for (const k of Object.keys(e).sort()) {
    if (k === 'umbruch' && e[k] !== false) continue;
    if (k === 'detail') continue; // K-014: motorspezifisch, nicht vergleichen
    o[k] = e[k] === undefined ? null : e[k];
  }
  return o;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pizza-host-'));
let gleich = 0, anders = 0, nicht = 0;
const liste = beispiele().filter((b) => !filter || b.id.includes(filter));
const t0 = Date.now();
let hostMs = 0;
for (const b of liste) {
  const quelle = fs.readFileSync(path.join(BEISPIELE, b.datei), 'utf8');
  const eingabe = b.eingabe ? zeilen(fs.readFileSync(path.join(BEISPIELE, b.eingabe), 'utf8')) : undefined;
  const args = b.args || [];
  const uiDatei = b.ereignisse ? path.join(BEISPIELE, b.ereignisse) : null;
  const uiEreignisse = uiDatei ? zeilen(fs.readFileSync(uiDatei, "utf8")).filter((z) => z.trim()).map((z) => JSON.parse(z)) : undefined;
  // Manifest-Felder wie tests/run-tests.js (K-077/K-087): feste Saat, feste Wanduhr, Schrittlimit.
  const lauf = {};
  if (b.zufallsSaat !== undefined) lauf.zufallsSaat = b.zufallsSaat;
  if (b.echtzeit !== undefined) lauf.echtzeit = b.echtzeit;
  if (b.schrittLimit !== undefined) lauf.schrittLimit = b.schrittLimit;
  const ref = PizzaLang.run(quelle, Object.assign({ args, eingabe, uiEreignisse }, lauf));
  const k = Pizzaiolo.kompiliere(quelle);
  if (!k.ok) {
    nicht++;
    const grund = k.nichtUnterstuetzt ? k.nichtUnterstuetzt.map((n) => 'Z' + n.zeile + ': ' + n.grund).slice(0, 3).join('; ') : JSON.stringify(k.fehler);
    console.log('  –  ' + b.id + ' (nicht kompilierbar: ' + grund + ')');
    continue;
  }
  const datei = path.join(tmp, b.id + '.pkarton');
  fs.writeFileSync(datei, k.pkarton);
  // Wie PizzaLang.run ohne vorrat/zufallsSaat: nur im Speicher (W0101) – nie den echten Vorrat des Nutzers anfassen;
  // im JSON-Modus gilt ohne --saat die feste Saat 42.
  const hArgs = ['--ereignisse-json', '--kein-vorrat'];
  if (b.eingabe) hArgs.push('--eingabe', path.join(BEISPIELE, b.eingabe));
  if (Number.isInteger(lauf.zufallsSaat)) hArgs.push('--saat=' + lauf.zufallsSaat);
  if (lauf.echtzeit !== undefined) hArgs.push('--echtzeit=' + lauf.echtzeit);
  if (lauf.schrittLimit !== undefined) hArgs.push('--schritte=' + lauf.schrittLimit);
  if (uiDatei) hArgs.push('--ui-ereignisse', uiDatei);
  hArgs.push(datei, ...args);
  const h0 = Date.now();
  const r = spawnSync(exe, hArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  hostMs += Date.now() - h0;
  const hostEr = r.stdout.split('\n').filter(Boolean).map((z) => JSON.parse(z));
  const refEr = ref.ereignisse.concat([]);
  if (!refEr.length || refEr[refEr.length - 1].typ !== 'ende') refEr.push({ typ: 'ende', exitCode: ref.exitCode, schritte: ref.schritte, zeitMs: ref.zeitMs });
  const diff = vergleiche(refEr.map(norm), hostEr.map(norm)) || (r.status !== (ref.exitCode & 0xff) ? 'Exit-Code: Interpreter ' + ref.exitCode + ', Host ' + r.status : null);
  if (diff) { anders++; console.log('  ✗  ' + b.id + '\n      ' + diff + (r.stderr ? '\n      stderr: ' + r.stderr.trim() : '')); }
  else { gleich++; console.log('  ✓  ' + b.id); }
}
// Konsolenausgabe Host ↔ bin/pizza.js zeichengleich (K-083/U-45: Meldungsformat, `--` als Ende der Optionen).
// Ohne TTY und mit NO_COLOR (keine Farben), --kein-vorrat (nie echter Vorrat), kein Fenster.
// (P0001 erreicht den Host nicht – Syntaxfehler verhindern das .pkarton; dessen Format prüft der Rust-Unit-Test.)
console.log('\nKonsole Host ↔ CLI:');
const konsolenFaelle = [
  ['W0101 mit --kein-vorrat', 'Vorratskammer v = neu Vorratskammer("cli-test");\nBote.sage((v.hole("n", 0)));\n', []],
  // K-106: Kennung `spiel/stand` – mit --kein-vorrat nur im Speicher; Textform/Methoden zeichengleich mit der CLI.
  ['Namensraum mit --kein-vorrat', 'Vorratskammer v = neu Vorratskammer("stand", namensraum: "spiel");\nv.lege("n", 1);\nBote.sage((v.hole("n", 0)));\nBote.sage((v.name()));\nBote.sage((v.namensraum()));\nBote.sage((v));\n', []],
  ['W0032 + ungefangene Ananas', 'salami PiZZa = 1;\nsalami PizZa = 2;\nBote.sage(("vorher"));\nsalami x = 1 / 0;\n', []],
  ['P0002 Schrittlimit + --info', 'solange (ja) { }\n', ['--schritte=50', '--info']],
  ['-- als Ende der Optionen', 'speisekarte klasse A {\n  speisekarte tiefkühl leer hauptgang(Blech<margherita> args) {\n    für (margherita a : args) { Bote.sage(("[" + a + "]")); }\n  }\n}\n', [], ['--', '--x', '--', 'y']],
];
const umgebung = Object.assign({}, process.env, { NO_COLOR: '1', PIZZA_THEKE: '0' });
let kGleich = 0, kGesamt = 0;
for (const [i, [name, quelle, opts, progArgs]] of konsolenFaelle.entries()) {
  if (filter && !name.includes(filter)) continue;
  kGesamt++;
  const id = 'konsole-' + i;
  const pz = path.join(tmp, id + '.pizza');
  fs.writeFileSync(pz, quelle);
  const k = Pizzaiolo.kompiliere(quelle);
  if (!k.ok) { nicht++; console.log('  –  ' + name + ' (nicht kompilierbar)'); continue; }
  const pk = path.join(tmp, id + '.pkarton');
  fs.writeFileSync(pk, k.pkarton);
  const gemeinsam = ['--kein-vorrat', '--saat=1', ...opts];
  const cli = spawnSync(process.execPath, [path.join(WURZEL, 'bin', 'pizza.js'), ...gemeinsam, pz, ...(progArgs || [])], { encoding: 'utf8', env: umgebung, input: '' });
  const host = spawnSync(exe, [...gemeinsam, pk, ...(progArgs || [])], { encoding: 'utf8', env: umgebung, input: '' });
  const n = (t) => t.replace(/\r\n/g, '\n');
  // `--info` meldet die Uhr: CLI (Interpreter) und Host zählen gleich, also auch das zeichengleich.
  const diff = n(cli.stdout) !== n(host.stdout) ? 'stdout: CLI ' + JSON.stringify(n(cli.stdout)) + ', Host ' + JSON.stringify(n(host.stdout))
    : n(cli.stderr) !== n(host.stderr) ? 'stderr: CLI ' + JSON.stringify(n(cli.stderr)) + ', Host ' + JSON.stringify(n(host.stderr))
    : cli.status !== host.status ? 'Exit-Code: CLI ' + cli.status + ', Host ' + host.status : null;
  if (diff) { anders++; console.log('  ✗  ' + name + '\n      ' + diff); }
  else { kGleich++; console.log('  ✓  ' + name); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + gleich + '/' + liste.length + ' Beispiele identisch, ' + kGleich + '/' + kGesamt + ' Konsolenfälle zeichengleich' + (anders ? ', ' + anders + ' abweichend' : '') + (nicht ? ', ' + nicht + ' nicht kompilierbar' : '') +
  ' (Host gesamt ' + hostMs + ' ms, alles ' + (Date.now() - t0) + ' ms)');
process.exit(anders || nicht ? 1 : 0);
