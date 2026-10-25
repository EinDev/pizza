#!/usr/bin/env node
/*
 * Differenztest nativer Host ↔ Interpreter.
 *   node host/test.js [--debug] [--filter=name]
 *
 * Für jedes Beispiel aus site/beispiele/index.json (gemeinsamer Leser scripts/beispiele.js; Ordner = Projekt):
 *   1. Pizzaiolo.kompiliere(projekt bzw. quelltext) → .pkarton (temporäre Datei)
 *   2. pizza-host --ereignisse-json [--eingabe datei] programm.pkarton  (stdin geschlossen)
 *   3. Vergleich aller Ereignisse (inkl. ende mit schritte/zeitMs) und Exit-Code mit PizzaLang.run
 * Fehlt site/js/pizzaiolo.js, wird der Test übersprungen (Exit 0, Hinweis).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
// Nie ein sichtbarer Dialog aus Testläufen (K-096-Meldungsfenster, Windows-Fehlerdialoge, Theke-Fenster): alle
// gestarteten Hosts/EXEs erben PIZZA_KEIN_DIALOG=1 (host/src/konsole.rs).
process.env.PIZZA_KEIN_DIALOG = '1';

const WURZEL = path.join(__dirname, '..');
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

// Beispiele über den gemeinsamen Leser (scripts/beispiele.js, PROJEKTE §7): Projektordner + pruefung/
const beispiele = () => require(path.join(WURZEL, 'scripts', 'beispiele.js')).leseBeispiele();

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
  // das Projekt (Manifest-Dateiliste) kompilieren
  const quelle = b.programm;
  const eingabe = b.eingabe || undefined;
  const lauf = Object.assign({}, b.optionen);   // Manifest-Felder wie tests/run-tests.js (K-077/K-087): feste Saat, Wanduhr, Schrittlimit
  const args = lauf.args || [];
  delete lauf.args;
  const uiDatei = b.pruefPfad('ereignisse');
  const uiEreignisse = b.ereignisse || undefined;
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
  if (b.pruefPfad('eingabe')) hArgs.push('--eingabe', b.pruefPfad('eingabe'));
  if (Number.isInteger(lauf.zufallsSaat)) hArgs.push('--saat=' + lauf.zufallsSaat);
  if (lauf.echtzeit !== undefined) hArgs.push('--echtzeit=' + lauf.echtzeit);
  if (lauf.zone !== undefined) hArgs.push('--zone=' + lauf.zone);
  if (lauf.schrittLimit !== undefined) hArgs.push('--schritte=' + lauf.schrittLimit);
  if (uiDatei) hArgs.push('--ui-ereignisse', uiDatei);
  hArgs.push(datei, ...args);
  const h0 = Date.now();
  const r = spawnSync(exe, hArgs, { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
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
  ['Klang ohne Gerät (PIZZA_KLANG=0)', 'Klang k = Klang.noten("C4 E4 G4");\nSpur s = k.spiele();\nBote.sage((k + " " + k.dauer() + " " + s.laeuft()));\nprobier { Klang.ton(0, 1); } verbrannt (Ananas a) { Bote.sage((a.nachricht())); }\n', []],
  ['-- als Ende der Optionen', 'speisekarte klasse A {\n  speisekarte tiefkühl leer hauptgang(Blech<margherita> args) {\n    für (margherita a : args) { Bote.sage(("[" + a + "]")); }\n  }\n}\n', [], ['--', '--x', '--', 'y']],
];
// PIZZA_KLANG=0 (K-153): Programme mit Klang öffnen in Tests nie ein Audiogerät
const umgebung = Object.assign({}, process.env, { NO_COLOR: '1', PIZZA_THEKE: '0', PIZZA_KLANG: '0' });
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
  const cli = spawnSync(process.execPath, [path.join(WURZEL, 'bin', 'pizza.js'), ...gemeinsam, pz, ...(progArgs || [])], { windowsHide: true, encoding: 'utf8', env: umgebung, input: '' });
  const host = spawnSync(exe, [...gemeinsam, pk, ...(progArgs || [])], { windowsHide: true, encoding: 'utf8', env: umgebung, input: '' });
  const n = (t) => t.replace(/\r\n/g, '\n');
  // `--info` meldet die Uhr: CLI (Interpreter) und Host zählen gleich, also auch das zeichengleich.
  const diff = n(cli.stdout) !== n(host.stdout) ? 'stdout: CLI ' + JSON.stringify(n(cli.stdout)) + ', Host ' + JSON.stringify(n(host.stdout))
    : n(cli.stderr) !== n(host.stderr) ? 'stderr: CLI ' + JSON.stringify(n(cli.stderr)) + ', Host ' + JSON.stringify(n(host.stderr))
    : cli.status !== host.status ? 'Exit-Code: CLI ' + cli.status + ', Host ' + host.status : null;
  if (diff) { anders++; console.log('  ✗  ' + name + '\n      ' + diff); }
  else { kGleich++; console.log('  ✓  ' + name); }
}
// --version: Host und CLI nennen dieselbe Sprachversion (PizzaLang.version = Paketversion des Hosts).
if (!filter || 'version'.includes(filter)) {
  kGesamt++;
  const hv = spawnSync(exe, ['--version'], { windowsHide: true, encoding: 'utf8', env: umgebung });
  const cv = spawnSync(process.execPath, [path.join(WURZEL, 'bin', 'pizza.js'), '--version'], { windowsHide: true, encoding: 'utf8', env: umgebung });
  const erwartetH = 'pizza-host ' + PizzaLang.version + ' (pizza ' + PizzaLang.version + ')\n';
  const erwartetC = 'pizza ' + PizzaLang.version + '\n';
  const n = (t) => t.replace(/\r\n/g, '\n');
  if (hv.status !== 0 || n(hv.stdout) !== erwartetH || cv.status !== 0 || n(cv.stdout) !== erwartetC) {
    anders++; console.log('  ✗  --version\n      Host ' + JSON.stringify(hv.stdout) + ' (' + hv.status + '), CLI ' + JSON.stringify(cv.stdout) + ' (' + cv.status + ')');
  } else { kGleich++; console.log('  ✓  --version (' + PizzaLang.version + ')'); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + gleich + '/' + liste.length + ' Beispiele identisch, ' + kGleich + '/' + kGesamt + ' Konsolenfälle zeichengleich' + (anders ? ', ' + anders + ' abweichend' : '') + (nicht ? ', ' + nicht + ' nicht kompilierbar' : '') +
  ' (Host gesamt ' + hostMs + ' ms, alles ' + (Date.now() - t0) + ' ms)');
process.exit(anders || nicht ? 1 : 0);
