#!/usr/bin/env node
'use strict';
// Baut site/js/pizza.js (Interpreter, UMD, eine Datei) aus den Abschnitten unter site/js/pizza/.
//
// Die Abschnitte teilen einen Gültigkeitsbereich (den Rumpf der UMD-Fabrik) und werden in der Reihenfolge von
// ABSCHNITTE unverändert aneinandergehängt – kein Umbenennen, kein Minifizieren. Eine Datei, weil Browser, Worker
// (importScripts), Node (require) und der Worker-Kontext-Test (vm, nur `self`) dieselbe Datei laden.
// Laufzeit-Methoden außerhalb von laufzeit/kern.js sind Klassen, die laufzeitTeil(…) auf Laufzeit.prototype überträgt.
// Reihenfolge zählt nur für Code, der beim Laden läuft (Tabellen, Sperren in std/register.js, Herd-Schema).
//
//   node scripts/baue-pizza.js            site/js/pizza.js neu schreiben
//   node scripts/baue-pizza.js --pruefe   nur prüfen (Exit 1, wenn pizza.js nicht dem Bau entspricht; CRLF egal)

const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const QUELLE = path.join(WURZEL, 'site', 'js', 'pizza');
const ZIEL = path.join(WURZEL, 'site', 'js', 'pizza.js');

const ABSCHNITTE = [
  'kopf.js',                // Konstanten
  'lexer.js',
  'parser.js',
  'analyse.js',             // Warnungen vor dem Start (W0666, W0032)
  'projekt.js',             // Projekte: Pfade, pizza.json, gemeinsamer Lader (SPEC §2)
  'laufzeit/werte.js',      // Werteklassen, Signale, Scopes, Textformen
  'laufzeit/kern.js',       // class Laufzeit (Konstruktor, Hilfen, Start, Ende) + laufzeitTeil
  'laufzeit/pruefung.js',   // registriere, Startprüfungen
  'laufzeit/typen.js',
  'laufzeit/namen.js',
  'laufzeit/aufrufe.js',
  'laufzeit/auswertung.js', // Ausdrücke, Anweisungen, Lieferung & Ofen
  'std/basis.js',
  'std/mathe.js',
  'std/zufall.js',
  'std/vorrat.js',
  'std/spiegel.js',
  'std/kiste.js',           // Kiste: Projektdateien lesen (SPEC §11.2)
  'theke/tabellen.js',
  'theke/laufzeit.js',
  'std/register.js',        // TABELLEN; Sperren (nurRechnen, nurHauptkueche) – nach allen Tabellen, vor dem Herd
  'kueche.js',
  'herd/kern.js',
  'herd/tabellen.js',
  'herd/laufzeit.js',
  'herd/kniff.js',          // Kniff: eigene Klassen als Komponente, Rückrufe je Takt (H-K13)
  'api.js',                 // run, pruefeStart, return { … }
];

const KOPF = [
  '/*',
  ' * pizza v3.1 – Interpreter',
  ' * Lexer · Parser · Tree-Walking-Laufzeit · Standardbibliothek',
  ' * UMD ohne Abhängigkeiten: Browser/Worker → self.PizzaLang, Node → module.exports',
  ' *',
  ' * GENERIERT aus site/js/pizza/ mit `node scripts/baue-pizza.js` – nicht von Hand bearbeiten.',
  ' */',
  '(function (root, fabrik) {',
  "  'use strict';",
  '  var api = fabrik();',
  "  if (typeof module === 'object' && module && module.exports) module.exports = api;",
  '  else if (root) root.PizzaLang = api;',
  "})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {",
  "  'use strict';",
];

function baue() {
  const vorhanden = new Set();
  (function sammle(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) sammle(path.join(dir, e.name), r);
      else if (e.name.endsWith('.js')) vorhanden.add(r);
    }
  })(QUELLE, '');
  const fremd = [...vorhanden].filter(d => !ABSCHNITTE.includes(d));
  if (fremd.length) throw new Error('nicht in ABSCHNITTE (scripts/baue-pizza.js) eingetragen: ' + fremd.join(', '));
  const teile = [KOPF.join('\n')];
  for (const d of ABSCHNITTE) {
    const text = fs.readFileSync(path.join(QUELLE, d), 'utf8').replace(/\r\n/g, '\n').replace(/\n*$/, '');
    // Im Bündel um 2 Leerzeichen eingerückt (Rumpf der Fabrik) – darum keine Zeichenketten über Zeilengrenzen.
    const zeilen = text.split('\n');
    zeilen.forEach((z, i) => {
      const code = z.trimStart().startsWith('//') ? '' : z;
      if (/\\$/.test(code) || (code.split('`').length - 1) % 2 === 1) {
        throw new Error('site/js/pizza/' + d + ':' + (i + 1) + ': Zeichenkette über Zeilengrenzen (Fortsetzung mit \\ oder mehrzeiliges `…`) – bitte verketten.');
      }
    });
    teile.push('  // ══════════ site/js/pizza/' + d + ' ══════════\n' + zeilen.map(z => z ? '  ' + z : z).join('\n'));
  }
  return teile.join('\n\n') + '\n\n});\n';
}

const neu = baue();
const alt = fs.existsSync(ZIEL) ? fs.readFileSync(ZIEL, 'utf8') : null;
const gleich = alt !== null && alt.replace(/\r\n/g, '\n') === neu;
if (process.argv.includes('--pruefe')) {
  if (!gleich) {
    console.error('site/js/pizza.js entspricht nicht den Abschnitten in site/js/pizza/ – `node scripts/baue-pizza.js` ausführen ' +
      '(Änderungen gehören in site/js/pizza/, pizza.js wird erzeugt).');
    process.exit(1);
  }
  console.log('site/js/pizza.js entspricht site/js/pizza/ (' + ABSCHNITTE.length + ' Abschnitte).');
} else if (gleich) {
  console.log('site/js/pizza.js ist aktuell.');
} else {
  // Zeilenenden der vorhandenen Datei beibehalten (core.autocrlf), sonst LF
  const crlf = alt !== null && alt.includes('\r\n');
  fs.writeFileSync(ZIEL, crlf ? neu.replace(/\n/g, '\r\n') : neu);
  console.log('site/js/pizza.js gebaut (' + ABSCHNITTE.length + ' Abschnitte, ' + neu.split('\n').length + ' Zeilen).');
}
