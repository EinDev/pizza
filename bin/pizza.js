#!/usr/bin/env node
/*
 * pizza CLI
 *   node bin/pizza.js datei.pizza [args…]
 *   node bin/pizza.js --ast datei.pizza
 *   Optionen: --eingabe datei (vorgegebene Eingabezeilen), --schritte=N (Schrittlimit),
 *             --saat=N (Zufallssaat; ohne Option: echte Saat, Anzeige "Saat: N" auf stderr),
 *             --vorrat=ordner (Ablage der Vorratskammern), --kein-vorrat (nur im Speicher, W0101),
 *             --info (Schritte/Uhr am Ende), --hilfe
 *   Ohne --eingabe liest Bestellannahme interaktiv (synchron) von stdin.
 *   Vorratskammern (K-081): <ordner>/<name>.json, Standard %APPDATA%\pizza\vorrat bzw.
 *   $XDG_DATA_HOME/pizza/vorrat (Fallback ~/.local/share/pizza/vorrat); Format {"v":1,"name":…,"eintraege":[…]}.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'site', 'js', 'pizza.js'));

const roh = process.argv.slice(2);
const os = require('os');
const crypto = require('crypto');
const optionen = { ast: false, info: false, schrittLimit: undefined, eingabe: null, saat: null, vorratOrdner: null, keinVorrat: false };
let datei = null;
const progArgs = [];
for (let i = 0; i < roh.length; i++) {
  const a = roh[i];
  if (datei === null && a.startsWith('--')) {
    if (a === '--ast') optionen.ast = true;
    else if (a === '--info') optionen.info = true;
    else if (a.startsWith('--schritte=')) optionen.schrittLimit = Number(a.slice(11));
    else if (a.startsWith('--saat=')) {
      const n = Number(a.slice(7));
      if (!Number.isInteger(n)) { console.error('--saat braucht eine Ganzzahl.'); process.exit(2); }
      optionen.saat = n;
    }
    else if (a.startsWith('--vorrat=')) optionen.vorratOrdner = a.slice(9);
    else if (a === '--kein-vorrat') optionen.keinVorrat = true;
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
  console.log('pizza ' + P.version + '\n\nAufruf:\n  node bin/pizza.js [--ast] [--info] [--schritte=N] [--saat=N] [--vorrat=ordner | --kein-vorrat] [--eingabe datei] datei.pizza [args…]');
}

if (!datei) { hilfe(); process.exit(2); }

function vorratStandardOrdner() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'pizza', 'vorrat');
  }
  const basis = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(basis, 'pizza', 'vorrat');
}

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

  // Zufall (K-077): feste Saat per --saat, sonst echte Saat – und anzeigen, damit der Lauf reproduzierbar bleibt
  if (optionen.saat !== null) runOpt.zufallsSaat = optionen.saat;
  else {
    runOpt.zufallsSaat = crypto.randomBytes(4).readUInt32LE(0);
    process.stderr.write(farbe('90', 'Saat: ' + runOpt.zufallsSaat) + '\n');
  }

  // Vorratskammer (K-081): eine JSON-Datei je Kammer, atomar geschrieben
  if (!optionen.keinVorrat) {
    const ordner = optionen.vorratOrdner || vorratStandardOrdner();
    const pfadVon = (name) => path.join(ordner, name + '.json');
    runOpt.vorrat = new Proxy({}, {
      get(_, name) {
        if (typeof name !== 'string') return undefined;
        try {
          const j = JSON.parse(fs.readFileSync(pfadVon(name), 'utf8'));
          return j && Array.isArray(j.eintraege) ? j.eintraege : undefined;
        } catch (e) { return undefined; }
      }
    });
    runOpt.onVorrat = (name, eintraege) => {
      try {
        fs.mkdirSync(ordner, { recursive: true });
        const ziel = pfadVon(name);
        const tmp = ziel + '.' + process.pid + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ v: 1, name, eintraege }));
        fs.renameSync(tmp, ziel);
        return true;
      } catch (e) { return false; }
    };
  }
  else runOpt.onEingabe = () => liesStdinZeile();
  const r = P.run(quelle, runOpt);
  process.exitCode = r.exitCode;
}
