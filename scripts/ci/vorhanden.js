#!/usr/bin/env node
/*
 * CI-Hilfe: Gibt es eine Suite schon? Schreibt `ja=true|false` nach $GITHUB_OUTPUT.
 *   node scripts/ci/vorhanden.js --skript test:wasm --datei e2e/lauf.mjs
 * „ja“, sobald EINE der Bedingungen erfüllt ist (Root-package.json-Skript existiert bzw. Datei existiert).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const a = process.argv.slice(2);
const skripte = [], dateien = [];
for (let i = 0; i < a.length; i += 2) (a[i] === '--skript' ? skripte : dateien).push(a[i + 1]);

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const gefunden = [
  ...skripte.filter(s => pkg.scripts && pkg.scripts[s]).map(s => 'npm-Skript ' + s),
  ...dateien.filter(d => fs.existsSync(path.join(ROOT, d))).map(d => 'Datei ' + d),
];
const ja = gefunden.length > 0;
const wonach = [...skripte.map(s => 'npm-Skript ' + s), ...dateien.map(d => 'Datei ' + d)].join(' / ');
console.log(ja ? 'Vorhanden: ' + gefunden.join(', ') : '::notice title=Suite fehlt (noch)::' + wonach + ' existiert nicht – Schritte werden übersprungen.');
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'ja=' + ja + '\n');
