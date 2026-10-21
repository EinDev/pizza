#!/usr/bin/env node
/*
 * pizza CLI
 *   node bin/pizza.js datei.pizza [args…]
 *   node bin/pizza.js --ast datei.pizza
 *   Optionen: --eingabe datei (vorgegebene Eingabezeilen), --schritte=N (Schrittlimit),
 *             --info (Schritte/Uhr am Ende), --hilfe
 *   Ohne --eingabe liest Bestellannahme interaktiv (synchron) von stdin.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'site', 'js', 'pizza.js'));

const roh = process.argv.slice(2);
const optionen = { ast: false, info: false, schrittLimit: undefined, eingabe: null };
let datei = null;
const progArgs = [];
for (let i = 0; i < roh.length; i++) {
  const a = roh[i];
  if (datei === null && a.startsWith('--')) {
    if (a === '--ast') optionen.ast = true;
    else if (a === '--info') optionen.info = true;
    else if (a.startsWith('--schritte=')) optionen.schrittLimit = Number(a.slice(11));
    else if (a === '--eingabe' || a.startsWith('--eingabe=')) {
      const pfad = a === '--eingabe' ? roh[++i] : a.slice(10);
      if (!pfad) { console.error('--eingabe braucht eine Datei.'); process.exit(2); }
      try { optionen.eingabe = fs.readFileSync(pfad, 'utf8').replace(/\r\n/g, '\n').split('\n'); }
      catch (e) { console.error('Eingabedatei nicht lesbar: ' + pfad + ' (' + e.message + ')'); process.exit(2); }
      if (optionen.eingabe.length && optionen.eingabe[optionen.eingabe.length - 1] === '') optionen.eingabe.pop();
    }
    else if (a === '--hilfe' || a === '--help') { hilfe(); process.exit(0); }
    else { console.error('Unbekannte Option: ' + a); hilfe(); process.exit(2); }
  } else if (datei === null) datei = a;
  else progArgs.push(a);
}

function hilfe() {
  console.log('pizza ' + P.version + '\n\nAufruf:\n  node bin/pizza.js [--ast] [--info] [--schritte=N] [--eingabe datei] datei.pizza [args…]');
}

if (!datei) { hilfe(); process.exit(2); }

let quelle;
try { quelle = fs.readFileSync(datei, 'utf8'); }
catch (e) { console.error('Datei nicht lesbar: ' + datei + ' (' + e.message + ')'); process.exit(2); }

const tty = process.stderr.isTTY && !process.env.NO_COLOR;
const farbe = (code, t) => tty ? '\x1b[' + code + 'm' + t + '\x1b[0m' : t;
const pos = (e) => e.zeile != null ? ' (Zeile ' + e.zeile + (e.spalte != null ? ', Spalte ' + e.spalte : '') + ')' : '';

// Synchrones Zeilenlesen von stdin (blockiert, wie es der Interpreter erwartet)
let stdinEof = false;
const stdinRest = [];
function liesStdinZeile() {
  if (stdinEof) return null;
  const bytes = [];
  const puffer = Buffer.alloc(1);
  for (;;) {
    if (stdinRest.length) { const b = stdinRest.shift(); if (b === 0x0a) break; bytes.push(b); continue; }
    let n;
    try { n = fs.readSync(0, puffer, 0, 1, null); }
    catch (e) {
      if (e.code === 'EAGAIN') continue;
      if (e.code === 'EOF') n = 0;
      else { stdinEof = true; break; }
    }
    if (n === 0) { stdinEof = true; if (!bytes.length) return null; break; }
    if (puffer[0] === 0x0a) break;
    bytes.push(puffer[0]);
  }
  return Buffer.from(bytes).toString('utf8').replace(/\r$/, '');
}

if (optionen.ast) {
  const r = P.parse(quelle);
  if (r.ok) { process.stdout.write(JSON.stringify(r.ast, null, 2) + '\n'); process.exitCode = 0; }
  else { console.error(farbe('1;31', r.fehler.text) + pos(r.fehler)); process.exitCode = 2; }
} else {
  const runOpt = {
    args: progArgs,
    schrittLimit: optionen.schrittLimit,
    onEvent(e) {
      switch (e.typ) {
        case 'ausgabe': process.stdout.write(e.umbruch === false ? e.text : e.text + '\n'); break;
        case 'leeren': if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[3J\x1b[H'); break;
        case 'fehlerausgabe': process.stderr.write(farbe('31', e.text) + '\n'); break;
        case 'warnung': process.stderr.write(farbe('33', '⚠ ' + e.text) + farbe('90', pos(e)) + '\n'); break;
        case 'fehler': process.stderr.write(farbe('1;31', e.text) + (e.art === 'syntax' || e.art === 'pizzafehler' ? farbe('90', pos(e)) : '') + '\n'); break;
        case 'panik': process.stderr.write(farbe('1;33;41', e.text) + '\n'); break;
        case 'ende':
          if (optionen.info) process.stderr.write(farbe('90', '— Exit-Code ' + e.exitCode + ' · ' + e.schritte + ' Schritte · Uhr ' + e.zeitMs + ' ms') + '\n');
          break;
      }
    }
  };
  if (optionen.eingabe !== null) runOpt.eingabe = optionen.eingabe;
  else runOpt.onEingabe = () => liesStdinZeile();
  const r = P.run(quelle, runOpt);
  process.exitCode = r.exitCode;
}
