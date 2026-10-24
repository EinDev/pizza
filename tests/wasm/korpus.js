'use strict';
/* Sammelt alle Beispiele (site/beispiele/**, gemeinsamer Leser scripts/beispiele.js) und Doku-Codeblöcke (site/js/doku, rekursiv
 * inkl. details). Renderer-Ereignisse (Theke/Herd) laufen mit: pruefung/ereignisse (JSON-Lines),
 * Doku-Feld uiEreignisse – sonst liefen Theke- und Herd-Programme hier nur ohne Renderer. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const BSP = require(path.join(ROOT, 'scripts', 'beispiele.js'));

// Beispiele über den gemeinsamen Leser (scripts/beispiele.js): Ein-Datei-Projekte als Text der Hauptdatei (gleiches Programm,
// PROJEKTE §1.5 – so laufen auch die IR-Prüfungen), Mehrdatei-Projekte als Sammlung; text = Hauptdatei (bench/run.js).
function beispiele() {
  return BSP.leseBeispiele().filter((b) => fs.existsSync(b.hauptdateiPfad)).map((b) => {
    const opt = b.laufOptionen();
    for (const k of ['echtzeit', 'zone']) if (b.optionen[k] !== undefined) opt[k] = b.optionen[k];
    return { name: b.name, quelle: b.einDatei ? b.quelle : b.programm, text: b.quelle, opt };
  });
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
    if (item.art === 'code' && item.ausfuehrbar && !BSP.FREMDE_SPRACHEN.has(item.sprache)) r.push({ name: 'doku:' + a.id + '#' + pfad + i, quelle: BSP.dokuProgramm(item), text: BSP.dokuText(item), opt: Array.isArray(item.uiEreignisse) ? { uiEreignisse: item.uiEreignisse } : {} });
  });
  for (const a of sandbox.PIZZA_DOKU || []) geh(a, a.inhalt || [], '');
  return r;
}

module.exports = { beispiele, doku, alle: () => beispiele().concat(doku()) };
