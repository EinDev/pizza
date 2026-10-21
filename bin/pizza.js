#!/usr/bin/env node
/*
 * pizza CLI
 *   node bin/pizza.js datei.pizza [args…]
 *   node bin/pizza.js --ast datei.pizza
 *   node bin/pizza.js [--vorrat=ordner] --vorrat-loeschen <name>   (eine Kammer, ohne Programm)
 *   node bin/pizza.js [--vorrat=ordner] --vorrat-loeschen-alle     (alle Kammern, ohne Programm)
 *   Optionen: --eingabe datei (vorgegebene Eingabezeilen), --schritte=N (Schrittlimit),
 *             --saat=N (Zufallssaat; ohne Option: echte Saat, Anzeige "Saat: N" auf stderr),
 *             --vorrat=ordner (Ablage der Vorratskammern), --kein-vorrat (nur im Speicher, W0101),
 *             --info (Schritte/Uhr am Ende), --debug (zeigt technische Details interner Fehler), --hilfe
 *   Warnungen/Fehler erscheinen einheitlich als <text> (Zeile Z, Spalte S) (K-083); das Feld detail nur mit --debug.
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
const optionen = { ast: false, info: false, debug: false, schrittLimit: undefined, eingabe: null, saat: null, vorratOrdner: null, keinVorrat: false };
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
    else if (a === '--vorrat-loeschen-alle') optionen.vorratLoeschen = { alle: true };
    else if (a === '--vorrat-loeschen' || a.startsWith('--vorrat-loeschen=')) {
      const n = a === '--vorrat-loeschen' ? roh[++i] : a.slice(18);
      if (n === undefined) { console.error('--vorrat-loeschen braucht einen Kammernamen (alle Kammern: --vorrat-loeschen-alle).'); process.exit(2); }
      optionen.vorratLoeschen = n;
    }
    else if (a === '--eingabe' || a.startsWith('--eingabe=')) {
      const pfad = a === '--eingabe' ? roh[++i] : a.slice(10);
      if (!pfad) { console.error('--eingabe braucht eine Datei.'); process.exit(2); }
      try { optionen.eingabe = fs.readFileSync(pfad, 'utf8').replace(/\r\n/g, '\n').split('\n'); }
      catch (e) { console.error('Eingabedatei nicht lesbar: ' + pfad + ' (' + e.message + ')'); process.exit(2); }
      if (optionen.eingabe.length && optionen.eingabe[optionen.eingabe.length - 1] === '') optionen.eingabe.pop();
    }
    else if (a === '--debug') optionen.debug = true;
    else if (a === '--hilfe' || a === '--help') { hilfe(); process.exit(0); }
    else { console.error('Unbekannte Option: ' + a); hilfe(); process.exit(2); }
  } else if (datei === null) datei = a;
  else progArgs.push(a);
}

function hilfe() {
  console.log('pizza ' + P.version + '\n\nAufruf:\n  node bin/pizza.js [--ast] [--info] [--schritte=N] [--saat=N] [--vorrat=ordner | --kein-vorrat] [--eingabe datei] datei.pizza [args…]' +
    '\n  node bin/pizza.js [--vorrat=ordner] --vorrat-loeschen <name>' +
    '\n  node bin/pizza.js [--vorrat=ordner] --vorrat-loeschen-alle');
}

// „Vorrat löschen“ (Nutzerentscheidung K-083 Nr. 5): gleiche Texte wie Playground/EXE
//   Vorrat '<name>' gelöscht.  ·  Vorrat '<name>' gibt es nicht.  ·  Alle Vorräte gelöscht.
//   ungültiger Name → Ungültiger Kammername '<name>' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).  (Exit 2)
if (optionen.vorratLoeschen !== undefined) {
  const ordner = optionen.vorratOrdner || vorratStandardOrdner();
  const n = optionen.vorratLoeschen;
  const KAMMER = /^[a-z0-9-]{1,40}$/;
  if (typeof n === 'object') {
    let dateien = [];
    try { dateien = fs.readdirSync(ordner); } catch (e) { dateien = []; }
    for (const d of dateien) {
      if (d.endsWith('.json') && KAMMER.test(d.slice(0, -5))) { try { fs.unlinkSync(path.join(ordner, d)); } catch (e) { /* weiter */ } }
    }
    console.log('Alle Vorräte gelöscht.');
    process.exit(0);
  }
  if (!KAMMER.test(n)) { console.error('Ungültiger Kammername \'' + n + '\' (erlaubt: a–z, 0–9, \'-\', 1–40 Zeichen).'); process.exit(2); }
  const datei = path.join(ordner, n + '.json');
  if (!fs.existsSync(datei)) { console.log('Vorrat \'' + n + '\' gibt es nicht.'); process.exit(0); }
  try { fs.unlinkSync(datei); }
  catch (e) { console.error('Vorrat \'' + n + '\' konnte nicht gelöscht werden.'); process.exit(1); }
  console.log('Vorrat \'' + n + '\' gelöscht.');
  process.exit(0);
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
// K-083: <text> (Zeile Z, Spalte S) – steht die Zeile schon im Text (ungefangene Ananas: „… (Zeile N)“), wird sie nicht doppelt angehängt
const meldungText = (e) => {
  const t = String(e.text == null ? '' : e.text);
  if (e.zeile == null) return t;
  const m = /\s\(Zeile (\d+)\)$/.exec(t);
  if (m && Number(m[1]) === e.zeile) return t.slice(0, m.index) + pos(e);
  return t + pos(e);
};

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
        case 'warnung': process.stderr.write(farbe('33', meldungText(e)) + '\n'); break;
        case 'fehler':
          process.stderr.write(farbe('1;31', meldungText(e)) + '\n');
          if (optionen.debug && e.detail != null) process.stderr.write(farbe('90', 'detail: ' + e.detail) + '\n');
          break;
        case 'panik': process.stderr.write(farbe('1;33;41', e.text) + '\n'); break;
        case 'ende':
          if (optionen.info) process.stderr.write(farbe('90', '— Exit-Code ' + e.exitCode + ' · ' + e.schritte + ' Schritte · Uhr ' + e.zeitMs + ' ms') + '\n');
          break;
      }
    }
  };
  if (optionen.eingabe !== null) runOpt.eingabe = optionen.eingabe;
  else runOpt.onEingabe = () => liesStdinZeile();

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
  const r = P.run(quelle, runOpt);
  process.exitCode = r.exitCode;
}
