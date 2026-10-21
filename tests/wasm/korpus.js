'use strict';
/* Sammelt alle Beispiele (site/beispiele/**) und Doku-Codeblöcke (site/js/doku, rekursiv inkl. details). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');

function beispiele() {
  const dir = path.join(ROOT, 'site', 'beispiele');
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const r = [];
  for (const teil of index.teile || []) {
    const mp = path.join(dir, teil);
    if (!fs.existsSync(mp)) continue;
    const man = JSON.parse(fs.readFileSync(mp, 'utf8'));
    for (const b of man.beispiele || []) {
      const dp = b.datei && path.join(dir, b.datei);
      if (!dp || !fs.existsSync(dp)) continue;
      const opt = { args: b.args || [] };
      if (b.eingabe && fs.existsSync(path.join(dir, b.eingabe))) opt.eingabe = fs.readFileSync(path.join(dir, b.eingabe), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
      r.push({ name: teil.replace(/\.json$/, '') + '/' + (b.id || b.datei), quelle: fs.readFileSync(dp, 'utf8'), opt });
    }
  }
  return r;
}

function doku() {
  const dir = path.join(ROOT, 'site', 'js', 'doku');
  const sandbox = { console };
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const d of fs.readdirSync(dir).filter(x => x.endsWith('.js')).sort()) vm.runInContext(fs.readFileSync(path.join(dir, d), 'utf8'), sandbox, { filename: d });
  const r = [];
  const geh = (a, liste, pfad) => liste.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    if (item.art === 'details' && Array.isArray(item.inhalt)) return geh(a, item.inhalt, pfad + i + '.');
    if (item.art === 'code' && item.ausfuehrbar && item.sprache !== 'xml' && item.sprache !== 'shell') r.push({ name: 'doku:' + a.id + '#' + pfad + i, quelle: String(item.code || ''), opt: {} });
  });
  for (const a of sandbox.PIZZA_DOKU || []) geh(a, a.inhalt || [], '');
  return r;
}

module.exports = { beispiele, doku, alle: () => beispiele().concat(doku()) };
