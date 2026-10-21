#!/usr/bin/env node
/*
 * pizza CLI
 *   node bin/pizza.js datei.pizza [args…]
 *   node bin/pizza.js --ast datei.pizza
 *   Optionen: --schritte=N (Schrittlimit), --info (Schritte/Uhr am Ende), --hilfe
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'site', 'js', 'pizza.js'));

const roh = process.argv.slice(2);
const optionen = { ast: false, info: false, schrittLimit: undefined };
let datei = null;
const progArgs = [];
for (const a of roh) {
  if (datei === null && a.startsWith('--')) {
    if (a === '--ast') optionen.ast = true;
    else if (a === '--info') optionen.info = true;
    else if (a.startsWith('--schritte=')) optionen.schrittLimit = Number(a.slice(11));
    else if (a === '--hilfe' || a === '--help') { hilfe(); process.exit(0); }
    else { console.error('Unbekannte Option: ' + a); hilfe(); process.exit(2); }
  } else if (datei === null) datei = a;
  else progArgs.push(a);
}

function hilfe() {
  console.log('pizza ' + P.version + '\n\nAufruf:\n  node bin/pizza.js [--ast] [--info] [--schritte=N] datei.pizza [args…]');
}

if (!datei) { hilfe(); process.exit(2); }

let quelle;
try { quelle = fs.readFileSync(datei, 'utf8'); }
catch (e) { console.error('Datei nicht lesbar: ' + datei + ' (' + e.message + ')'); process.exit(2); }

const tty = process.stderr.isTTY && !process.env.NO_COLOR;
const farbe = (code, t) => tty ? '\x1b[' + code + 'm' + t + '\x1b[0m' : t;
const pos = (e) => e.zeile != null ? ' (Zeile ' + e.zeile + (e.spalte != null ? ', Spalte ' + e.spalte : '') + ')' : '';

if (optionen.ast) {
  const r = P.parse(quelle);
  if (r.ok) { process.stdout.write(JSON.stringify(r.ast, null, 2) + '\n'); process.exitCode = 0; }
  else { console.error(farbe('1;31', r.fehler.text) + pos(r.fehler)); process.exitCode = 2; }
} else {
  const r = P.run(quelle, {
    args: progArgs,
    schrittLimit: optionen.schrittLimit,
    onEvent(e) {
      switch (e.typ) {
        case 'ausgabe': process.stdout.write(e.text + '\n'); break;
        case 'fehlerausgabe': process.stderr.write(farbe('31', e.text) + '\n'); break;
        case 'warnung': process.stderr.write(farbe('33', '⚠ ' + e.text) + farbe('90', pos(e)) + '\n'); break;
        case 'fehler': process.stderr.write(farbe('1;31', e.text) + (e.art === 'syntax' || e.art === 'pizzafehler' ? farbe('90', pos(e)) : '') + '\n'); break;
        case 'panik': process.stderr.write(farbe('1;33;41', e.text) + '\n'); break;
        case 'ende':
          if (optionen.info) process.stderr.write(farbe('90', '— Exit-Code ' + e.exitCode + ' · ' + e.schritte + ' Schritte · Uhr ' + e.zeitMs + ' ms') + '\n');
          break;
      }
    }
  });
  process.exitCode = r.exitCode;
}
