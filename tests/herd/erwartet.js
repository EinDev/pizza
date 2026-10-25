#!/usr/bin/env node
/*
 * Herd: alle erwarteten Herd-Ereignisse (K-134) prüfen bzw. nach einer Kern-Änderung mit einem Befehl neu schreiben.
 * Die Hashes (szene/paket) berechnet kern.wasm – ändert sich der Kern (Bildpaket-Format, Systeme), ändern sie sich mit.
 * Drei Quellen:
 *   faelle     tests/faelle/herd-*.pizza          → .herd-erwartet (direkt geschrieben)
 *   beispiele  site/beispiele/<kategorie>/<projekt>/ mit Herd → pruefung/herd-erwartet und pruefung/erwartet über tests/herd/bild.js --schreibe
 *   doku       Doku-Codeblöcke mit herdErwartet   → Feld herdErwartet in site/js/doku/*.js über tests/herd/bild.js --json
 *
 *   node tests/herd/erwartet.js [filter]               zeigt je Fall, ob die herd-Ereignisse passen (Exit 1 bei Abweichung)
 *   node tests/herd/erwartet.js [filter] --schreibe    schreibt nur die abweichenden neu (.erwartet/.fehler der Fälle bleiben)
 *
 * Vor dem Schreiben prüfen, dass sich nur Hashes geändert haben (Folge fenster/bild/schliesse und bildnummern gleich).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const P = require(path.join(ROOT, 'site', 'js', 'pizza.js'));
const DIR = path.join(__dirname, '..', 'faelle');
const BILD = path.join(__dirname, 'bild.js');
const schreibe = process.argv.includes('--schreibe');
const filter = process.argv.slice(2).find(a => !a.startsWith('--')) || '';

const zeilen = (t) => t.replace(/\r\n/g, '\n').split('\n').filter(z => z.trim()).map(z => JSON.parse(z));
const kanon = (v) => Array.isArray(v) ? '[' + v.map(kanon).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + kanon(v[k])).join(',') + '}' : JSON.stringify(v);
const folge = (l) => l.map(e => e.art + (e.art === 'bild' ? e.bildnummer : '')).join(' ');
const herdVon = (r) => r.ereignisse.filter(e => e.typ === 'herd').map(e => { const o = Object.assign({}, e); delete o.typ; return o; });

let abw = 0, fehler = 0;
/** Vergleich ausgeben; true = passt (oder nichts zu prüfen). */
function melde(name, ist, soll) {
  if (soll === null && ist.length === 0) return true;
  if (soll !== null && ist.map(kanon).join('\n') === soll.map(kanon).join('\n')) { console.log('  ✓ ' + name); return true; }
  abw++;
  console.log('  ✗ ' + name + (soll === null ? ' (keine erwarteten Herd-Ereignisse)' : folge(ist) === folge(soll) ? ' (nur Hashes)' : ' (Folge: ' + folge(soll) + ' → ' + folge(ist) + ')'));
  return false;
}
/** tests/herd/bild.js als Kindprozess (ohne Fenster); Ausgabe als Text. */
function bild(args) {
  const r = spawnSync(process.execPath, [BILD].concat(args), { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('bild.js ' + args.join(' ') + ' → Exit ' + r.status + '\n' + (r.stderr || '') + (r.stdout || ''));
  return r.stdout;
}

// ---------- tests/faelle/herd-* ----------
console.log('▶ faelle');
for (const d of fs.readdirSync(DIR).filter(x => x.startsWith('herd-') && x.includes(filter) && x.endsWith('.pizza')).sort()) {
  const b = d.slice(0, -6), p = (e) => path.join(DIR, b + e);
  const opt = fs.existsSync(p('.optionen.json')) ? JSON.parse(fs.readFileSync(p('.optionen.json'), 'utf8')) : {};
  if (fs.existsSync(p('.ereignisse'))) opt.uiEreignisse = zeilen(fs.readFileSync(p('.ereignisse'), 'utf8'));
  const ist = herdVon(P.run(fs.readFileSync(p('.pizza'), 'utf8'), opt));
  const soll = fs.existsSync(p('.herd-erwartet')) ? zeilen(fs.readFileSync(p('.herd-erwartet'), 'utf8')) : null;
  if (!melde(b, ist, soll) && schreibe) fs.writeFileSync(p('.herd-erwartet'), ist.map(e => JSON.stringify(e) + '\n').join(''));
}

// ---------- site/beispiele (gemeinsamer Leser scripts/beispiele.js: Projektordner mit pruefung/) ----------
console.log('▶ beispiele');
{
  const BSP = require(path.join(ROOT, 'scripts', 'beispiele.js'));
  for (const b of BSP.leseBeispiele()) {
    const name = b.name;
    if (!name.includes(filter)) continue;
    const hp = b.pruefPfad('herd-erwartet');
    if (!b.eintrag.herd && !hp) continue;
    const opt = Object.assign({ args: [] }, b.optionen);   // Manifestfelder (K-087, K-154)
    const ev = b.ereignisse;
    if (ev) opt.uiEreignisse = ev;
    const ist = herdVon(P.run(b.programm, opt));
    const soll = b.herdErwartet;
    if (melde(name, ist, soll) || !schreibe) continue;
    // bild.js --schreibe legt pruefung/herd-erwartet und pruefung/erwartet ins Projekt (nach Selbstprüfung gegen kern.wasm)
    const uhr = [].concat(b.optionen.echtzeit !== undefined ? ['--echtzeit', String(b.optionen.echtzeit)] : [], b.optionen.zone !== undefined ? ['--zone', String(b.optionen.zone)] : []);
    if (b.optionen.zufallsSaat !== undefined || b.optionen.schrittLimit !== undefined || (b.optionen.args && b.optionen.args.length)) {
      fehler++; console.log('    ! ' + name + ': bild.js kennt zufallsSaat/schrittLimit/args nicht – bitte von Hand'); continue;
    }
    try { bild([b.ordnerPfad, '--schreibe', '--still'].concat(uhr)); } catch (e) { fehler++; console.log('    ! ' + e.message); }
  }
}

// ---------- Doku-Codeblöcke mit herdErwartet ----------
console.log('▶ doku');
{
  const dir = path.join(ROOT, 'site', 'js', 'doku');
  const dateien = fs.readdirSync(dir).filter(x => x.endsWith('.js')).sort();
  const sandbox = { console };
  sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // Blöcke je Datei einsammeln (jede Datei hängt ihre Artikel an PIZZA_DOKU an)
  const bloecke = [];
  for (const d of dateien) {
    const vorher = (sandbox.PIZZA_DOKU || []).length;
    vm.runInContext(fs.readFileSync(path.join(dir, d), 'utf8'), sandbox, { filename: d });
    const geh = (a, liste, pfad) => liste.forEach((item, i) => {
      if (!item || typeof item !== 'object') return;
      if (item.art === 'details' && Array.isArray(item.inhalt)) return geh(a, item.inhalt, pfad + i + '.');
      if (item.art === 'code' && Array.isArray(item.herdErwartet)) bloecke.push({ datei: d, name: 'doku:' + a.id + '#' + pfad + i, item });
    });
    for (const a of (sandbox.PIZZA_DOKU || []).slice(vorher)) geh(a, a.inhalt || [], '');
  }
  const tmp = schreibe ? fs.mkdtempSync(path.join(os.tmpdir(), 'herd-erwartet-')) : null;
  for (const { datei, name, item } of bloecke) {
    if (!name.includes(filter)) continue;
    const opt = {};
    if (Array.isArray(item.uiEreignisse)) opt.uiEreignisse = item.uiEreignisse;
    for (const k of ['zufallsSaat', 'echtzeit', 'zone', 'schrittLimit']) if (item[k] !== undefined) opt[k] = item[k];
    const BSP = require(path.join(ROOT, 'scripts', 'beispiele.js'));
    const code = BSP.dokuProgramm(item);   // Text oder Projekt { dateien, hauptdatei? } (ARCHITEKTUR §4)
    const ist = herdVon(P.run(code, opt));
    if (melde(name, ist, item.herdErwartet) || !schreibe) continue;
    try {
      // bild.js --json: Block als .pizza (bzw. `dateien` als Projektordner) und uiEreignisse als .ereignisse ablegen,
      // herd-Ereignisse als JSON-Array lesen
      let pz = path.join(tmp, 'block.pizza');
      if (typeof code === 'string') fs.writeFileSync(pz, code);
      else {
        pz = fs.mkdtempSync(path.join(tmp, 'projekt-'));
        for (const [p, t] of Object.entries(code.dateien)) { fs.mkdirSync(path.dirname(path.join(pz, p)), { recursive: true }); fs.writeFileSync(path.join(pz, p), t); }
        if (code.hauptdatei && !code.dateien['pizza.json']) fs.writeFileSync(path.join(pz, 'pizza.json'), JSON.stringify({ pizza: 1, hauptdatei: code.hauptdatei }) + '\n');
      }
      const args = [pz, '--json'];
      if (opt.uiEreignisse) { fs.writeFileSync(path.join(tmp, 'block.ereignisse'), opt.uiEreignisse.map(e => JSON.stringify(e) + '\n').join('')); args.push('--ereignisse', path.join(tmp, 'block.ereignisse')); }
      const aus = bild(args).replace(/\r\n/g, '\n').split('\n');
      const von = aus.indexOf('['), bis = aus.indexOf(']', von);
      if (von < 0 || bis < 0) throw new Error(name + ': bild.js --json lieferte kein Array');
      const neu = JSON.parse(aus.slice(von, bis + 1).join('\n'));
      if (kanon(neu) !== kanon(ist)) throw new Error(name + ': bild.js und Prüflauf liefern verschiedene Herd-Ereignisse');
      // Quelltext: genau das alte herdErwartet-Array ersetzen (eindeutig über seinen Inhalt), Einrückung beibehalten
      const fp = path.join(dir, datei);
      let src = fs.readFileSync(fp, 'utf8');
      const nl = src.includes('\r\n') ? '\r\n' : '\n';
      const re = /herdErwartet: \[([\s\S]*?)\n([ \t]*)\]/g;
      const treffer = [];
      let m;
      while ((m = re.exec(src))) {
        let alt;
        try { alt = JSON.parse('[' + m[1] + ']'); } catch (e) { continue; }
        if (kanon(alt) === kanon(item.herdErwartet)) treffer.push(m);
      }
      if (treffer.length !== 1) throw new Error(name + ': altes herdErwartet ' + (treffer.length ? 'mehrdeutig' : 'nicht gefunden') + ' in ' + datei);
      const t = treffer[0];
      const einr = (/\n([ \t]*)\{/.exec(t[1]) || [, t[2] + '  '])[1];
      const ersatz = 'herdErwartet: [' + nl + neu.map(e => einr + JSON.stringify(e)).join(',' + nl) + nl + t[2] + ']';
      src = src.slice(0, t.index) + ersatz + src.slice(t.index + t[0].length);
      fs.writeFileSync(fp, src);
      item.herdErwartet = neu;
    } catch (e) { fehler++; console.log('    ! ' + e.message); }
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
}

if (fehler) console.log(fehler + ' Fehler beim Schreiben');
console.log(abw ? abw + (schreibe ? ' Abweichung(en) neu geschrieben' : ' Abweichung(en)') : 'alle passen');
process.exit(fehler || (abw && !schreibe) ? 1 : 0);
