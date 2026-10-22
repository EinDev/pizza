#!/usr/bin/env node
/*
 * pizza CLI
 *   node bin/pizza.js datei.pizza [args…]
 *   node bin/pizza.js [optionen] [--] datei.pizza [--] [args…]   (`--` = Ende der Optionen, Rest unverändert an hauptgang)
 *   node bin/pizza.js --ast datei.pizza
 *   node bin/pizza.js [--vorrat=ordner] --vorrat-loeschen <kennung> (eine Kammer, ohne Programm; auch raum/name)
 *   node bin/pizza.js [--vorrat=ordner] --vorrat-loeschen-alle     (alle Kammern, ohne Programm, auch mit Namensraum)
 *   Optionen: --eingabe datei (vorgegebene Eingabezeilen), --schritte=N (Schrittlimit),
 *             --saat=N (Zufallssaat; ohne Option: echte Saat, Anzeige "Saat: N" auf stderr),
 *             --vorrat=ordner (Ablage der Vorratskammern), --kein-vorrat (nur im Speicher, W0101),
 *             --info (Schritte/Uhr am Ende), --debug (zeigt technische Details interner Fehler), --hilfe,
 *             --version (zeigt "pizza 3.1.0")
 *   Warnungen/Fehler erscheinen einheitlich als <text> (Zeile Z, Spalte S) (K-083); das Feld detail nur mit --debug.
 *   Ohne --eingabe liest Bestellannahme interaktiv (synchron) von stdin.
 *   Vorratskammern (K-081): <ordner>/<name>.json, Standard %APPDATA%\pizza\vorrat bzw.
 *   $XDG_DATA_HOME/pizza/vorrat (Fallback ~/.local/share/pizza/vorrat); Format {"v":1,"name":…,"eintraege":[…]}.
 *   Mit Namensraum (K-106): <ordner>/<raum>/<name>.json, Kennung "raum/name" (Feld name = Kennung); die Kennung
 *   wird hier selbst geprüft (beide Teile [a-z0-9-]{1,40}), Pfade entstehen nur aus den geprüften Teilen.
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
// `--` beendet die Optionen: das erste `--` vor dem ersten Programmargument wird verbraucht, alles danach geht
// unverändert an hauptgang(args) (vor der Datei ist das nächste Argument die Datei). Ein späteres `--` bleibt erhalten.
let optionenZu = false;
for (let i = 0; i < roh.length; i++) {
  const a = roh[i];
  if (a === '--' && !optionenZu && progArgs.length === 0) { optionenZu = true; continue; }
  if (datei === null && !optionenZu && a.startsWith('--')) {
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
    else if (a === '--version') { console.log('pizza ' + P.version); process.exit(0); }
    else { console.error('Unbekannte Option: ' + a); hilfe(); process.exit(2); }
  } else if (datei === null) datei = a;
  else { optionenZu = true; progArgs.push(a); }
}

function hilfe() {
  console.log('pizza ' + P.version + '\n\nAufruf:\n  node bin/pizza.js [--ast] [--info] [--schritte=N] [--saat=N] [--vorrat=ordner | --kein-vorrat] [--eingabe datei] datei.pizza [--] [args…]' +
    '\n  node bin/pizza.js [--vorrat=ordner] --vorrat-loeschen <kennung>   (Kennung: name oder raum/name)' +
    '\n  node bin/pizza.js [--vorrat=ordner] --vorrat-loeschen-alle' +
    '\n\n  --   Ende der Optionen: alles danach geht unverändert an hauptgang(args),' +
    '\n       z. B. node bin/pizza.js datei.pizza -- --mein-arg (vor der Datei: das nächste Argument ist die Datei;' +
    '\n       nur das erste -- zählt, ein späteres bleibt Argument)');
}

// Kammer-Kennung (K-079/K-106): "name" oder "raum/name", beide Teile [a-z0-9-]{1,40}. Liefert den Dateipfad
// – gebaut nur aus den geprüften Teilen – oder null bei ungültiger Kennung (kein Pfad-Traversal).
const KAMMER = /^[a-z0-9-]{1,40}$/;
function kammerPfad(ordner, kennung) {
  if (typeof kennung !== 'string') return null;
  const teile = kennung.split('/');
  if (teile.length > 2 || !teile.every(t => KAMMER.test(t))) return null;
  return teile.length === 2 ? path.join(ordner, teile[0], teile[1] + '.json') : path.join(ordner, teile[0] + '.json');
}
// Kammer-Dateien eines Ordners (nur gültige Namen) löschen; liefert die Anzahl der übrig gebliebenen Einträge
function kammernLoeschen(ordner) {
  let eintraege = [];
  try { eintraege = fs.readdirSync(ordner); } catch (e) { return -1; }
  let rest = 0;
  for (const d of eintraege) {
    if (d.endsWith('.json') && KAMMER.test(d.slice(0, -5))) { try { fs.unlinkSync(path.join(ordner, d)); continue; } catch (e) { /* weiter */ } }
    rest++;
  }
  return rest;
}

// „Vorrat löschen“ (Nutzerentscheidung K-083 Nr. 5): gleiche Texte wie Playground/EXE
//   Vorrat '<kennung>' gelöscht.  ·  Vorrat '<kennung>' gibt es nicht.  ·  Alle Vorräte gelöscht.
//   ungültige Kennung → Ungültiger Kammername '<X>' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen, mit Namensraum 'raum/name').  (Exit 2)
if (optionen.vorratLoeschen !== undefined) {
  const ordner = optionen.vorratOrdner || vorratStandardOrdner();
  const n = optionen.vorratLoeschen;
  if (typeof n === 'object') {
    // K-106: zusätzlich eine Ebene tiefer – <ordner>/<raum>/<name>.json gültiger Kennung; leere Raum-Ordner entfernen
    let eintraege = [];
    try { eintraege = fs.readdirSync(ordner, { withFileTypes: true }); } catch (e) { eintraege = []; }
    for (const d of eintraege) {
      if (d.isDirectory() && KAMMER.test(d.name)) {
        const raum = path.join(ordner, d.name);
        if (kammernLoeschen(raum) === 0) { try { fs.rmdirSync(raum); } catch (e) { /* weiter */ } }
      }
    }
    kammernLoeschen(ordner);
    console.log('Alle Vorräte gelöscht.');
    process.exit(0);
  }
  const datei = kammerPfad(ordner, n);
  if (datei === null) { console.error('Ungültiger Kammername \'' + n + '\' (erlaubt: a–z, 0–9, \'-\', 1–40 Zeichen, mit Namensraum \'raum/name\').'); process.exit(2); }
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

  // Vorratskammer (K-081/K-106): eine JSON-Datei je Kammer, atomar geschrieben; Kennung "name" oder "raum/name"
  // wird hier selbst geprüft (ungültig → kein Eingangszustand bzw. Speicher-Ananas)
  if (!optionen.keinVorrat) {
    const ordner = optionen.vorratOrdner || vorratStandardOrdner();
    runOpt.vorrat = new Proxy({}, {
      get(_, name) {
        const pfad = kammerPfad(ordner, name);
        if (pfad === null) return undefined;
        try {
          const j = JSON.parse(fs.readFileSync(pfad, 'utf8'));
          return j && Array.isArray(j.eintraege) ? j.eintraege : undefined;
        } catch (e) { return undefined; }
      }
    });
    runOpt.onVorrat = (name, eintraege) => {
      const ziel = kammerPfad(ordner, name);
      if (ziel === null) return false;
      try {
        fs.mkdirSync(path.dirname(ziel), { recursive: true });
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
