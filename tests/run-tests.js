#!/usr/bin/env node
/*
 * Test-Harness für pizza v3.1 – ohne Abhängigkeiten.
 *   node tests/run-tests.js              alle Gruppen
 *   node tests/run-tests.js beispiele    nur eine Gruppe (faelle | api | beispiele | doku)
 *   node tests/run-tests.js <text>       nur Tests, deren Name <text> enthält
 *   -v                                   auch bestandene Tests einzeln zeigen
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'site', 'js', 'pizza.js'));

const argv = process.argv.slice(2);
const ausfuehrlich = argv.includes('-v');
const filter = argv.filter(a => a !== '-v')[0] || null;
const GRUPPEN = ['faelle', 'api', 'beispiele', 'doku', 'cli'];
const nurGruppe = filter && GRUPPEN.includes(filter) ? filter : null;
const namensFilter = filter && !nurGruppe ? filter : null;

const farbig = process.stdout.isTTY && !process.env.NO_COLOR;
const f = (code, t) => farbig ? '\x1b[' + code + 'm' + t + '\x1b[0m' : t;
const gruen = t => f('32', t), rot = t => f('31', t), gelb = t => f('33', t), grau = t => f('90', t), fett = t => f('1', t);

const stat = {};
let gesamtFehl = 0;

// K-052: CRLF vereinheitlichen, höchstens EINEN Schluss-Zeilenumbruch entfernen
function norm(s) { return String(s).replace(/\r\n/g, '\n').replace(/\n$/, ''); }

// .erwartet-Regeln (ARCHITEKTUR §3, EINGABE §2): ausgabe/fehlerausgabe/panik je eine Zeile,
// ausgabe mit umbruch:false ohne Zeilenumbruch, leeren als Zeile «leeren», eingabe erscheint nicht.
function ausgabeText(ereignisse) {
  let t = '';
  for (const e of ereignisse) {
    if (e.typ === 'ausgabe') t += e.umbruch === false ? e.text : e.text + '\n';
    else if (e.typ === 'fehlerausgabe' || e.typ === 'panik') t += e.text + '\n';
    else if (e.typ === 'leeren') t += '«leeren»\n';
  }
  return t;
}

// Theke (THEKE.md §5): JSON-Lines – eine JSON-Zeile pro Ereignis bzw. ui-Nachricht, Leerzeilen ignoriert
function jsonZeilen(text, wo) {
  return String(text).replace(/\r\n/g, '\n').split('\n').filter(z => z.trim() !== '').map((z, i) => {
    try { return JSON.parse(z); } catch (e) { throw new Error(wo + ', Zeile ' + (i + 1) + ': ungültiges JSON: ' + e.message); }
  });
}

function kanonisch(v) {
  if (Array.isArray(v)) return '[' + v.map(kanonisch).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + kanonisch(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

// Herd (SPEC §18.7, K-134): herd-Ereignisse ohne typ, kanonisch wie ui-Nachrichten
function herdVergleich(soll, ereignisse) {
  const ist = ereignisse.filter(e => e.typ === 'herd').map(e => { const o = Object.assign({}, e); delete o.typ; return o; });
  const a = soll.map(kanonisch).join('\n'), b = ist.map(kanonisch).join('\n');
  if (a === b) return null;
  return 'herd-Ereignisse weichen ab:\n' + diff(soll.map(x => JSON.stringify(x)).join('\n'), ist.map(x => JSON.stringify(x)).join('\n'));
}

function uiVergleich(soll, ereignisse) {
  const ist = ereignisse.filter(e => e.typ === 'ui').map(e => e.nachricht);
  const a = soll.map(kanonisch).join('\n'), b = ist.map(kanonisch).join('\n');
  if (a === b) return null;
  return 'ui-Nachrichten weichen ab:\n' + diff(soll.map(x => JSON.stringify(x)).join('\n'), ist.map(x => JSON.stringify(x)).join('\n'));
}

// Laufoptionen aus Doku-Blöcken / Manifest-Einträgen (wie tests/differenz/korpus.js, U-43):
// zufallsSaat, echtzeit, zone, schrittLimit, vorrat (Objekt { name: eintraege })
function laufFelder(x) {
  const o = {};
  if (x.zufallsSaat !== undefined) o.zufallsSaat = x.zufallsSaat;
  if (x.echtzeit !== undefined) o.echtzeit = x.echtzeit;
  if (x.zone !== undefined) o.zone = x.zone;   // K-154
  if (x.schrittLimit !== undefined) o.schrittLimit = x.schrittLimit;
  if (x.vorrat && typeof x.vorrat === 'object') o.vorrat = x.vorrat;
  return o;
}

function eingabeZeilen(text) {
  const z = String(text).replace(/\r\n/g, '\n').split('\n');
  if (z.length && z[z.length - 1] === '') z.pop();
  return z;
}

function diff(erwartet, ist) {
  const a = norm(erwartet).split('\n'), b = norm(ist).split('\n');
  const n = a.length, m = b.length;
  const zeilen = [];
  if (n * m > 400000) {
    for (let i = 0; i < Math.max(n, m); i++) {
      if (a[i] === b[i]) zeilen.push('    ' + a[i]);
      else { if (i < n) zeilen.push(rot('  - ' + a[i])); if (i < m) zeilen.push(gruen('  + ' + b[i])); }
    }
  } else {
    const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) { zeilen.push('    ' + a[i]); i++; j++; }
      else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { zeilen.push(gruen('  + ' + b[j])); j++; }
      else { zeilen.push(rot('  - ' + a[i])); i++; }
    }
  }
  return grau('  (- erwartet, + tatsächlich)') + '\n' + zeilen.join('\n');
}

function gruppe(name) {
  if (!stat[name]) stat[name] = { ok: 0, fehl: 0, skip: 0, notiz: [] };
  return stat[name];
}

function ergebnis(g, name, fehler) {
  const s = gruppe(g);
  if (fehler) {
    s.fehl++; gesamtFehl++;
    console.log(rot('  ✗ ') + name);
    console.log(fehler.split('\n').map(z => '    ' + z).join('\n'));
  } else {
    s.ok++;
    if (ausfuehrlich) console.log(gruen('  ✓ ') + name);
  }
}

function uebersprungen(g, name, grund) {
  gruppe(g).skip++;
  console.log(gelb('  ○ ') + name + grau(' – übersprungen: ' + grund));
}

function passt(name) { return !namensFilter || name.includes(namensFilter); }

function fehlerZusammenfassung(r) {
  const fe = r.ereignisse.filter(e => e.typ === 'fehler').map(e => e.text);
  return fe.length ? '\n' + grau('Fehler-Ereignis: ' + fe.join(' | ')) : '';
}

// ---------------------------------------------------------------------
// 1. Eigene Fälle: tests/faelle/*.pizza und Ordner-Fälle tests/faelle/<name>/ (Projekt + pruefung/, ARCHITEKTUR §6, K-144)
// ---------------------------------------------------------------------
const TEXT_ENDUNG = /\.(pizza|txt|json|csv|md)$/;
// Projektordner → Dateisammlung (wie bin/pizza.js: alles außer pruefung/, Texte streng UTF-8 mit \n, sonst Bytes)
function projektAusOrdner(wurzel) {
  const dateien = {};
  (function geh(abs, rel) {
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (r !== 'pruefung') geh(path.join(abs, e.name), r); continue; }
      const b = fs.readFileSync(path.join(abs, e.name));
      dateien[r] = TEXT_ENDUNG.test(r) ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b).replace(/\r\n/g, '\n') : new Uint8Array(b);
    }
  })(wurzel, '');
  return { dateien };
}

function faelle() {
  const dir = path.join(__dirname, 'faelle');
  console.log(fett('\n▶ Eigene Fälle (tests/faelle)'));
  gruppe('faelle');
  if (!fs.existsSync(dir)) { console.log(gelb('  Ordner fehlt.')); return; }
  const eintraege = fs.readdirSync(dir, { withFileTypes: true });
  const dateien = eintraege.filter(x => x.isFile() && x.name.endsWith('.pizza')).map(x => x.name)
    .concat(eintraege.filter(x => x.isDirectory()).map(x => x.name + '/')).sort();
  for (const d of dateien) {
    const ordner = d.endsWith('/');
    const basis = ordner ? d.slice(0, -1) : d.slice(0, -6);
    if (!passt(basis)) continue;
    // Begleitdateien: <name>.erwartet … bzw. im Ordner-Fall <name>/pruefung/erwartet …
    const lies = (endung) => {
      const p = ordner ? path.join(dir, basis, 'pruefung', endung.slice(1)) : path.join(dir, basis + endung);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    };
    let quelle;
    try { quelle = ordner ? projektAusOrdner(path.join(dir, basis)) : lies('.pizza'); }
    catch (e) { ergebnis('faelle', basis, 'Ordner nicht lesbar: ' + (e && e.message)); continue; }
    const erwartet = lies('.erwartet');
    const exitDatei = lies('.exitcode');
    const warnDatei = lies('.warnungen');
    const fehlerDatei = lies('.fehler');
    const optDatei = lies('.optionen.json');
    const opt = optDatei ? JSON.parse(optDatei) : {};
    const ereignisDatei = lies('.ereignisse');
    if (ereignisDatei !== null) opt.uiEreignisse = jsonZeilen(ereignisDatei, basis + '.ereignisse');
    const uiErwartet = lies('.ui-erwartet');
    const herdErwartet = lies('.herd-erwartet');
    // Vorratskammer (K-080): Eingangszustand .vorrat.json = { name: eintraege }, erwartete vorrat-Ereignisse als JSON-Lines
    const vorratDatei = lies('.vorrat.json');
    if (vorratDatei !== null) opt.vorrat = JSON.parse(vorratDatei);
    const vorratErwartet = lies('.vorrat-erwartet');
    const eingabeDatei = lies('.eingabe');
    if (eingabeDatei !== null) opt.eingabe = eingabeZeilen(eingabeDatei);
    const t0 = Date.now();
    let r;
    try { r = P.run(quelle, opt); } catch (e) { ergebnis('faelle', basis, 'run() hat geworfen: ' + (e && e.stack)); continue; }
    const probleme = [];
    const exitSoll = exitDatei ? parseInt(exitDatei.trim(), 10) : 0;
    if (r.exitCode !== exitSoll) probleme.push('Exit-Code ' + r.exitCode + ', erwartet ' + exitSoll + fehlerZusammenfassung(r));
    if (erwartet !== null && norm(erwartet) !== norm(ausgabeText(r.ereignisse))) probleme.push('Ausgabe weicht ab:\n' + diff(erwartet, ausgabeText(r.ereignisse)));
    if (warnDatei !== null) {
      const soll = norm(warnDatei).split('\n').filter(Boolean);
      const ist = r.ereignisse.filter(e => e.typ === 'warnung').map(e => e.text);
      if (JSON.stringify(soll) !== JSON.stringify(ist)) probleme.push('Warnungen weichen ab:\n' + diff(soll.join('\n'), ist.join('\n')));
    }
    if (vorratErwartet !== null) {
      const soll = jsonZeilen(vorratErwartet, basis + '.vorrat-erwartet');
      const ist = r.ereignisse.filter(e => e.typ === 'vorrat').map(e => ({ name: e.name, schluessel: e.schluessel, wert: e.wert }));
      if (soll.map(kanonisch).join('\n') !== ist.map(kanonisch).join('\n')) {
        probleme.push('vorrat-Ereignisse weichen ab:\n' + diff(soll.map(x => JSON.stringify(x)).join('\n'), ist.map(x => JSON.stringify(x)).join('\n')));
      }
    }
    if (uiErwartet !== null) {
      const u = uiVergleich(jsonZeilen(uiErwartet, basis + '.ui-erwartet'), r.ereignisse);
      if (u) probleme.push(u);
    }
    if (herdErwartet !== null) {
      const u = herdVergleich(jsonZeilen(herdErwartet, basis + '.herd-erwartet'), r.ereignisse);
      if (u) probleme.push(u);
    }
    if (fehlerDatei !== null) {
      const ist = r.ereignisse.filter(e => e.typ === 'fehler').map(e => e.text).join('\n');
      if (norm(fehlerDatei) !== norm(ist)) probleme.push('Fehler-Ereignis weicht ab:\n' + diff(fehlerDatei, ist));
    }
    // pruefung/orte (K-144): je fehler/warnung { code, datei, zeile, spalte } als JSON-Lines, in Reihenfolge
    const orteDatei = ordner ? lies('.orte') : null;
    if (orteDatei !== null) {
      const soll = jsonZeilen(orteDatei, basis + '/pruefung/orte').map(o => JSON.stringify({ code: o.code, datei: o.datei, zeile: o.zeile, spalte: o.spalte }));
      const ist = r.ereignisse.filter(e => e.typ === 'fehler' || e.typ === 'warnung').map(e => JSON.stringify({ code: e.code, datei: e.datei, zeile: e.zeile, spalte: e.spalte }));
      if (soll.join('\n') !== ist.join('\n')) probleme.push('Orte weichen ab:\n' + diff(soll.join('\n'), ist.join('\n')));
    }
    if (r.ereignisse.some(e => (e.typ === 'fehler' || e.typ === 'warnung') && Object.keys(e).indexOf('datei') !== Object.keys(e).indexOf('zeile') - 1)) {
      probleme.push('Feld datei fehlt oder steht nicht direkt vor zeile (SPEC §2.6).');
    }
    const ende = r.ereignisse[r.ereignisse.length - 1];
    if (!ende || ende.typ !== 'ende' || ende.exitCode !== r.exitCode) probleme.push('Letztes Ereignis ist nicht "ende" mit passendem Exit-Code.');
    ergebnis('faelle', basis + grau(' (' + (Date.now() - t0) + ' ms)'), probleme.join('\n') || null);
  }
}

// ---------------------------------------------------------------------
// 2. API-Tests (inline)
// ---------------------------------------------------------------------
function api() {
  console.log(fett('\n▶ API-Tests'));
  gruppe('api');
  const tests = [];
  const test = (name, fn) => tests.push([name, fn]);
  const gleich = (ist, soll, was) => {
    if (JSON.stringify(ist) !== JSON.stringify(soll)) throw new Error((was || 'Wert') + ': erwartet ' + JSON.stringify(soll) + ', bekam ' + JSON.stringify(ist));
  };
  const ja = (b, was) => { if (!b) throw new Error(was || 'Bedingung nicht erfüllt'); };

  test('Projekte (PA1): projekt.lade/ausDateien/pruefePfad, Datei-Index di, Ein-Datei-Projekt = Text', () => {
    const q = 'salami pizza = 1;\nsalami Pizza = 2;\nwirf neu LaufzeitAnanas("aus");\n';
    gleich(P.run({ dateien: { 'hauptgang.pizza': q } }).ereignisse, P.run(q).ereignisse, 'Ein-Datei-Projekt wie Text (datei null)');
    gleich(P.run({ dateien: { 'spiel.pizza': q, 'pizza.json': '{"pizza":1}', 'daten/a.txt': 'x' } }).ereignisse, P.run(q).ereignisse, 'einzige .pizza ist Hauptdatei');
    const r = P.projekt.lade({ dateien: { 'hauptgang.pizza': 'bestellt "a.pizza";\nBote.sage((x));\n', 'a.pizza': 'salami x = 1;\n', 'pruefung/erwartet': '1\n' } });
    ja(r.ok, 'lade ok');
    gleich([r.ladeliste, r.dateien, Object.keys(r.kiste)], [['a.pizza', 'hauptgang.pizza'], ['hauptgang.pizza', 'a.pizza'], ['a.pizza', 'hauptgang.pizza']]);
    gleich(r.ast.body.map(n => [n.k, n.di]), [['Var', 1], ['AusdrAnw', 0]], 'Verkettung in Ladereihenfolge, ohne Bestellt, di je Datei');
    gleich(r.ast.body[0].decls[0].di, 1, 'auch Unterknoten tragen di');
    gleich(P.parse('salami x = 1;', { datei: 3 }).ast.body[0].di, 3, 'parse(q, { datei })');
    gleich([P.parse('x++;').ast.body[0].d, P.parse('{ salami a = 1; }').ast.body[0].d], [1, true], 'Felder d von Inc/Block bleiben unberührt');
    // Texte: CRLF → LF, Bytes für Textdateien streng als UTF-8; Grenzen in KB/MB aufgerundet
    gleich(P.projekt.lade({ dateien: { 'hauptgang.pizza': 'Bote.sage(("x"));\r\n', 'a.txt': 'a\r\nb\rc' } }).kiste['a.txt'], 'a\nb\rc', 'CRLF → LF');
    gleich(P.projekt.lade({ dateien: { 'hauptgang.pizza': new Uint8Array([0xEF, 0xBB, 0xBF, 0x78, 0x3B, 0x0D, 0x0A]) } }).kiste['hauptgang.pizza'], '﻿x;\n', 'Bytes → Text, BOM bleibt');
    gleich(P.projekt.lade({ dateien: { 'hauptgang.pizza': 'x', 'a.txt': new Uint8Array([0xC3, 0x28]) } }).fehler.text, 'PizzaFehler P0015: a.txt ist kein gültiger UTF-8-Text.');
    const gross = (n) => 'x'.repeat(n);
    gleich(P.projekt.lade({ dateien: { 'hauptgang.pizza': 'x;', 'a.txt': gross(2.5 * 1048576) } }).fehler.text, 'PizzaFehler P0020: Das Projekt ist zu groß für den Ofen (a.txt hat 2,5 MB, höchstens 2 MB).');
    const viel = { 'hauptgang.pizza': 'x;' };
    for (let i = 0; i < 5; i++) viel['d' + i + '.txt'] = gross(1.75 * 1048576);
    gleich(P.projekt.lade({ dateien: viel }).fehler.text, 'PizzaFehler P0020: Das Projekt ist zu groß für den Ofen (zusammen 8,8 MB, höchstens 8 MB).');
    gleich(P.projekt.lade({ dateien: { 'hauptgang.pizza': '// ' + 'ä'.repeat(300 * 1024) } }).fehler.text, 'PizzaFehler P0020: Das Projekt ist zu groß für den Ofen (hauptgang.pizza hat 601 KB, höchstens 512 KB).', 'UTF-8-Bytes zählen');
    // ausDateien: Hauptdatei-Regel, Name, args; Begleitfeld hauptdatei (CLI-Datei, PROJEKTE §1.5) hat Vorrang
    gleich(P.projekt.ausDateien({ 'welt/spiel.pizza': '' }).name, 'spiel');
    gleich(P.projekt.lade({ dateien: { 'pizza.json': '{"pizza":1,"hauptdatei":"a.pizza"}', 'a.pizza': 'Bote.sage(("a"));', 'b.pizza': 'Bote.sage(("b"));' }, hauptdatei: 'b.pizza' }).hauptdatei, 'b.pizza');
    gleich(P.projekt.ausDateien({ 'pizza.json': '{"pizza":1,"args":"x"}' }).fehler.text, 'PizzaFehler P0015: pizza.json ist ungültig: "args" muss ein Blech aus Texten sein.');
    gleich(P.projekt.ausDateien({ 'pizza.json': '{"pizza":1.5}' }).fehler.text, 'PizzaFehler P0015: pizza.json ist ungültig: "pizza" muss eine Ganzzahl sein.');
    gleich(P.projekt.ausDateien({ 'pizza.json': '{"pizza":1,"name":"' + 'n'.repeat(81) + '"}' }).fehler.text, 'PizzaFehler P0015: pizza.json ist ungültig: "name" ist zu lang.');
    gleich([P.projekt.pruefePfad('a/b.pizza'), typeof P.projekt.pruefePfad('A.pizza'), typeof P.projekt.pruefePfad(5)], [null, 'string', 'string']);
    // Fehler im Text-Programm ohne Datei, im Mehrdatei-Programm mit Datei; Warnungen einmal je Code + Datei + Zeile + Spalte
    const t = P.run('salami x = 1\n').ereignisse[0];
    gleich([t.art, t.datei, t.zeile], ['syntax', null, 1]);
    const m = P.run({ dateien: { 'hauptgang.pizza': 'bestellt "a.pizza";\nsalami y = 1\n', 'a.pizza': 'salami x = 1;' } }).ereignisse[0];
    gleich([m.art, m.datei, m.zeile], ['syntax', 'hauptgang.pizza', 2]);
    const pfad = P.run({ dateien: { 'hauptgang.pizza': 'bestellt "A.pizza";\n' } }).ereignisse[0];
    gleich([pfad.code, pfad.art, pfad.datei], ['P0015', 'syntax', 'hauptgang.pizza'], 'ungültiger Pfad im bestellt: schon beim Parsen');
  });

  test('Projekte (PA2): Wasm-Motor kompiliert Projekte; bestellt im Text-Programm → Ladefehler P0015 wie der Interpreter', () => {
    let Z;
    try { Z = require(path.join(ROOT, 'site', 'js', 'pizzaiolo.js')); } catch (e) { return; }
    const proj = { dateien: { 'hauptgang.pizza': 'bestellt "a.pizza";\nBote.sage((x));\n', 'a.pizza': 'salami x = 7;\n' } };
    const k = Z.kompiliere(proj);
    ja(k.ok && Z.projekte === true, 'kompiliere(Projekt) → ok');
    const kb = Z.kompiliere('bestellt "a.pizza";\nBote.sage(("x"));\n');
    ja(!kb.ok && kb.fehler && kb.fehler.code === 'P0015', 'kompiliere(Text mit bestellt) → fehler P0015');
    const r = Z.run(proj, {});
    gleich([r.motor, r.exitCode, r.ereignisse.filter(e => e.typ === 'ausgabe').map(e => e.text)], ['wasm', 0, ['7']]);
  });

  test('Konstanten der API', () => {
    gleich(P.version, '3.1.0', 'version');
    for (const k of ['klasse', 'serviere', 'calzone', 'quattrostagioni', 'ofen', 'roh', 'karton', 'wähle', 'für']) ja(P.KEYWORDS.includes(k), 'KEYWORDS fehlt ' + k);
    ja(!P.KEYWORDS.includes('pizza'), "'pizza' darf kein Keyword sein");
    for (const t of ['salami', 'funghi', 'margherita', 'diavolo', 'Dauer', 'Blech', 'Speisekarte', 'hawaii']) ja(P.TYPEN.includes(t), 'TYPEN fehlt ' + t);
    for (const k of ['belag', 'auf']) ja(!P.KEYWORDS.includes(k), "'" + k + "' ist kein Keyword mehr (K-105)");
    // K-105: kein eingebauter Pizza-/Stück-/Belag-Typ mehr; `Belag` gibt es seit Herd H-K2 nur als Herd-Komponente (aus schema.json)
    for (const t of ['Pizza', 'Stück', 'Belag']) ja(!P.TYPEN.includes(t) || (t === 'Belag' && P.intern.HERD_TYPEN.includes(t)), 'TYPEN ohne ' + t + ' (K-105)');
    gleich(P.BUILTINS.slice().sort(), ['Bote', 'Bestellannahme', 'Uhr', 'Mathe', 'Zufall', 'Spiegel', 'teig', 'bestelle', 'schieb', 'zwischenstand', 'Kiste'].sort(), 'BUILTINS');
    ja(P.BELAEGE === undefined, 'BELAEGE entfällt (K-105)');
    // Reihenfolge verbindlich (SPEC §8, K-105) – die Wasm-Laufzeit spiegelt die Klassenindizes
    gleich(P.ANANAS, ['Ananas', 'GeprüfteAnanas', 'VerbranntAnanas', 'LieferAnanas', 'LaufzeitAnanas', 'StreitAnanas', 'RechenAnanas',
      'LeererKartonAnanas', 'RohlingAnanas', 'GebackenAnanas', 'TypAnanas', 'KeinStückAnanas', 'ZugriffsAnanas', 'ZugeklapptAnanas',
      'UnbekanntePizzaAnanas', 'KüchenAnanas'], 'ANANAS (16, Reihenfolge)');
  });

  test('parse: ok mit AST', () => {
    const r = P.parse('Bote.sage(("Hallo"));');
    ja(r.ok && r.ast && r.ast.k === 'Programm', 'AST');
  });

  test('parse: fehlendes Semikolon mit Zeile/Spalte', () => {
    const r = P.parse('salami x = 5\nBote.sage((x));');
    ja(!r.ok, 'sollte fehlschlagen');
    gleich(r.fehler.code, 'P0001');
    gleich(r.fehler.text, "PizzaFehler P0001: Erwartet ';' nach Anweisung, gefunden 'Bote'");
    gleich([r.fehler.zeile, r.fehler.spalte], [1, 13], 'Position');
  });

  test('parse: K0001 Klammerpflicht', () => {
    const r = P.parse('salami f() { serviere x; }');
    gleich(r.fehler.code, 'K0001');
    gleich(r.fehler.text, 'PizzaFehler K0001: Klammerpflicht! serviere braucht Klammern: serviere (x);');
  });

  test('parse: Tier-3-Syntax (Generics, wirft) wird akzeptiert', () => {
    const r = P.parse('speisekarte rezeptur Backbar<T> { leer backe(salami grad) wirft VerbranntAnanas, LieferAnanas; }\n' +
      'klasse Kiste<T> { speisekarte <U> Blech<Speisekarte<margherita, Blech<U>>> mach(Blech<?> x) wirft LaufzeitAnanas { serviere ([]); } }');
    ja(r.ok, r.fehler && r.fehler.text);
  });

  test('parse: wirft nie (Zufallseingaben)', () => {
    const teile = ['klasse', 'X', '{', '}', '(', ')', '((', '))', ';', 'serviere', '"a', '"b"', '1.5s', '->', '@', 'Nach', 'falls', 'sonst', '[', ']', '..', ',', 'wähle', 'fall', 'ofen', '/*', '*/', '//', '\n', 'Tomate', '=', '+', 'ä', '#', '\\', 'neu', '<', '>'];
    let s = 7;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s; };
    for (let i = 0; i < 2000; i++) {
      let q = '';
      const n = rnd() % 30;
      for (let j = 0; j < n; j++) q += teile[rnd() % teile.length] + (rnd() % 2 ? ' ' : '');
      const r = P.parse(q);
      ja(typeof r.ok === 'boolean', 'parse lieferte kein Ergebnis');
      if (!r.ok) ja(typeof r.fehler.text === 'string' && r.fehler.code, 'Fehlerobjekt unvollständig');
      const rr = P.run(q, { schrittLimit: 20000 });
      ja([0, 1, 2, 3, 39].includes(rr.exitCode), 'unerwarteter Exit-Code ' + rr.exitCode + ' für ' + JSON.stringify(q));
      ja(!rr.ereignisse.some(e => e.typ === 'fehler' && /Interner/.test(e.text)), 'Interner Fehler für ' + JSON.stringify(q) + ': ' + JSON.stringify(rr.ereignisse));
    }
    ja(!P.parse('('.repeat(20000)).ok, 'tiefe Verschachtelung');
  });

  test('Panik-Banner entspricht exakt SPEC §9', () => {
    const spec = fs.readFileSync(path.join(ROOT, 'SPEC.md'), 'utf8').replace(/\r\n/g, '\n');
    const i = spec.indexOf('╔');
    const ende = spec.indexOf('```', i);
    const soll = spec.slice(i, ende).replace(/\n+$/, '');
    const r = P.run('hawaii h = 1;');
    gleich(r.exitCode, 39, 'Exit-Code');
    const pe = r.ereignisse.find(e => e.typ === 'panik');
    gleich(pe && pe.text, soll, 'Banner');
    gleich(r.ereignisse[r.ereignisse.length - 1].typ, 'ende');
    gleich(r.ereignisse[r.ereignisse.length - 2].typ, 'panik');
  });

  test('Ereignisse: onEvent, Form, Ende', () => {
    const gesehen = [];
    const r = P.run('Bote.sage((1)); Bote.fehler(("x")); salami t = teig(() -> (1)).backen();', { onEvent: e => gesehen.push(e) });
    gleich(gesehen, r.ereignisse, 'onEvent = ereignisse');
    gleich(r.ereignisse[0], { typ: 'ausgabe', text: '1' });
    gleich(r.ereignisse[1], { typ: 'fehlerausgabe', text: 'x' });
    const w = r.ereignisse[2];
    gleich([w.typ, w.code, w.text, w.zeile], ['warnung', 'T0007', 'T0007: Teig wird gebacken, ohne gehen gelassen worden zu sein. Das schmeckt flach.', 1]);
    const e = r.ereignisse[3];
    gleich([e.typ, e.exitCode], ['ende', 0]);
    gleich(e.schritte, r.schritte); gleich(e.zeitMs, r.zeitMs);
    ja(r.schritte > 0 && r.zeitMs === r.schritte, 'Schritte/Zeit');
  });

  test('Fehler-Ereignis bei Syntaxfehler', () => {
    const r = P.run('falls (ja) Bote.sage((1));');
    gleich(r.exitCode, 2);
    const e = r.ereignisse[0];
    gleich([e.typ, e.art, e.code, e.zeile, e.spalte], ['fehler', 'syntax', 'P0001', 1, 12]);
  });

  test('Ungefangene Ananas: Text, Code, Zeile', () => {
    const r = P.run('Bote.sage(("a"));\nsalami i = 0;\nsolange (i < 9) {\n  falls (i >= 8) { wirf neu StreitAnanas("Pizza ist alle."); }\n  i++;\n}');
    gleich(r.exitCode, 1);
    const e = r.ereignisse.find(x => x.typ === 'fehler');
    gleich([e.code, e.art, e.text, e.zeile], ['StreitAnanas', 'ananas', 'Ungefangene Ananas – StreitAnanas: Pizza ist alle. (Zeile 4)', 4]);
  });

  test('Schrittlimit konfigurierbar (P0002, Exit 3)', () => {
    const r = P.run('solange (ja) { }', { schrittLimit: 1000 });
    gleich(r.exitCode, 3);
    const e = r.ereignisse.find(x => x.typ === 'fehler');
    gleich([e.code, e.art, e.text], ['P0002', 'limit', 'PizzaFehler P0002: Die Pizza ist noch im Ofen. (Schrittlimit erreicht – Endlosschleife?)']);
    ja(r.schritte <= 1001, 'Schritte ' + r.schritte);
  });

  test('Standard-Schrittlimit ist 5 000 000', () => {
    const r = P.run('solange (ja) { }');
    gleich(r.exitCode, 3);
    gleich(r.schritte, 5000001);
  });

  test('Args an hauptgang', () => {
    const r = P.run('klasse A { tiefkühl leer hauptgang(Blech<margherita> args) { Bote.sage((args)); Bote.sage((args.länge())); } }', { args: ['x', 'y'] });
    gleich(ausgabeText(r.ereignisse), '[x, y]\n2\n');
  });

  test('Performance: 1 Mio. Schleifendurchläufe', () => {
    const t0 = Date.now();
    const r = P.run('salami s = 0;\nfür (salami i = 0; i < 1_000_000; i++) { s += i; }\nBote.sage((s));', { schrittLimit: 100000000 });
    const ms = Date.now() - t0;
    gleich(ausgabeText(r.ereignisse), '499999500000\n');
    console.log(grau('    1 Mio. Iterationen: ' + ms + ' ms, ' + r.schritte + ' Schritte'));
    ja(ms < 8000, 'zu langsam: ' + ms + ' ms');
  });

  test('Tiefe Rekursion → Stapelüberlauf-Ananas (fangbar)', () => {
    const r = P.run('salami f(salami n) { serviere ((f(n + 1))); }\nprobier { f(1); } verbrannt (LaufzeitAnanas a) { Bote.sage((a)); }\nf(1);');
    gleich(ausgabeText(r.ereignisse), 'LaufzeitAnanas: Zu viele Pizzen übereinander (Stapelüberlauf).\n');
    gleich(r.exitCode, 1);
    const e = r.ereignisse.find(x => x.typ === 'fehler');
    ja(/Stapelüberlauf/.test(e.text), e.text);
  });

  test('Rekursion bis Tiefe 300 klappt', () => {
    const r = P.run('salami summe(salami n) { falls (n == 0) { serviere (0); } serviere ((n + summe(n - 1))); }\nBote.sage((summe(300)));');
    gleich(ausgabeText(r.ereignisse), '45150\n');
  });

  test('Stapeltiefe deterministisch (SPEC §14.4): exakte Grenze, jede Aufrufart', () => {
    const summe = m => 'salami summe(salami n) { falls (n == 0) { serviere (0); } serviere ((n + summe(n - 1))); }\nBote.sage((summe(' + m + ')));';
    gleich(P.run(summe(373)).exitCode, 0, 'summe(373)');
    gleich(P.run(summe(374)).exitCode, 1, 'summe(374)');
    const lam = m => 'Rezept lam = x -> x;\nlam = n -> n == 0 ? 0 : lam(n - 1) + 1;\nBote.sage((lam(' + m + ')));';
    gleich(P.run(lam(373)).exitCode, 0, 'lambda(373)');
    gleich(P.run(lam(374)).exitCode, 1, 'lambda(374)');
    const varianten = [
      'Rezept lam = x -> x;\nlam = n -> lam(n + 1);\nlam(0);',
      'salami f(salami n) { serviere ((1 + (1 + (1 + (1 + (1 + (1 + (1 + (1 + f(n + 1)))))))))); }\nf(0);',
      'klasse K { K(salami x) { neu K(x + 1); } }\nneu K(0);',
      'salami f(salami n) { serviere (([n].belege(x -> f(x + 1)).erstes())); }\nf(0);',
      'klasse K { @Kühlschrank salami f(salami n) { serviere ((dies.f.mikrowelle(n + 1).wert())); } }\nneu K().f(0);',
      'klasse K { margherita alsText() { serviere (("" + neu K())); } }\nBote.sage((neu K()));',
      'salami f(salami n) { serviere ((ofen(zeit: 1h) { probier { serviere ((f(n + 1))); } rand { } })); }\nf(0);',
      'salami f(salami n) { serviere ((teig(() -> f(n + 1)).backen() + bestelle(() -> 1).warte().wert())); }\nf(0);',
      'salami f(salami n) { serviere (([2, 1].sortiere((a, b) -> f(n + 1)).erstes())); }\nf(0);',
      'Rezept r = Bote.sage;\nsalami f(salami n) { r(n); serviere ((f(n + 1))); }\nf(0);'
    ];
    for (const q of varianten) {
      const s = [];
      for (let i = 0; i < 3; i++) {
        const r = P.run(q);
        const fe = r.ereignisse.find(e => e.typ === 'fehler');
        ja(fe && /Stapelüberlauf/.test(fe.text), 'kein Stapelüberlauf bei ' + JSON.stringify(q) + ': ' + (fe && fe.text));
        s.push(r.schritte);
      }
      ja(s[0] === s[1] && s[1] === s[2], 'nicht deterministisch (' + s.join('/') + ') bei ' + JSON.stringify(q));
    }
  });

  test('Herd: TYPEN, onHerd mit Bytes, Ereignisse ohne Bytes, onUiWarte, herdKern als Modul/Bytes', () => {
    for (const t of ['Herd', 'Teil', 'Form', 'Bildchen', 'Kreis', 'Bewegung', 'Partikel']) ja(P.TYPEN.includes(t), 'TYPEN fehlt ' + t);
    ja(P.intern.HERD_TYPEN.includes('Koerper'), 'intern.HERD_TYPEN');
    const q = 'Herd h = neu Herd("T", breite: 64, hoehe: 64);\nTeil k = h.kreis(10, 10, 5);\nh.backe(() -> { k.verschiebe(1, 0); });\nBote.sage((k.x()));';
    const an = [];
    const evs = [{ typ: 'takt' }, { typ: 'takt', anzahl: 2 }, null];
    const r = P.run(q, { onHerd: (art, d) => an.push([art, d]), onUiWarte: () => evs.shift() });
    gleich(ausgabeText(r.ereignisse), '13\n');
    gleich(an.map(x => x[0]), ['fenster', 'bild', 'bild'], 'onHerd-Arten');
    ja(an[1][1].bytes instanceof Uint8Array && an[1][1].bytes.length > 32, 'Bytes des Bildpakets');
    gleich(String.fromCharCode(...an[1][1].bytes.slice(0, 4)), 'HZP1', 'Paketkopf');
    gleich(an[2][1].bildnummer, 3, 'bildnummer');
    const herd = r.ereignisse.filter(e => e.typ === 'herd');
    gleich(herd.map(e => Object.keys(e).sort().join(',')), ['art,breite,hoehe,titel,typ', 'art,bildnummer,paket,szene,typ', 'art,bildnummer,paket,szene,typ'], 'Felder');
    gleich(herd[2].paket, an[2][1].paket, 'paket = onHerd');
    ja(/^[0-9a-f]{16}$/.test(herd[2].szene), 'szene-Hash');
    const fs2 = require('fs');
    const bytes = fs2.readFileSync(path.join(ROOT, 'site', 'js', 'herd', 'kern.wasm'));
    const opt = () => ({ uiEreignisse: [{ typ: 'takt' }, { typ: 'takt', anzahl: 2 }] });
    const a = P.run(q, opt());
    const b = P.run(q, Object.assign(opt(), { herdKern: new WebAssembly.Module(bytes) }));
    const c = P.run(q, Object.assign(opt(), { herdKern: new Uint8Array(bytes) }));
    gleich(b.ereignisse, a.ereignisse, 'herdKern als Modul');
    gleich(c.ereignisse, a.ereignisse, 'herdKern als Bytes');
  });

  test('Herd: Kern fehlt → fehler HOST (intern), Exit 2, vor dem Start', () => {
    const r = P.run('Bote.sage(("vorher"));\nHerd h = neu Herd();', { herdKern: new Uint8Array([0, 1, 2]) });
    gleich(r.exitCode, 2);
    gleich(r.ereignisse.filter(e => e.typ !== 'ende'), [{ typ: 'fehler', code: 'HOST', art: 'intern', text: 'PizzaFehler HOST: Der Herd-Kern fehlt (kern.wasm).', datei: null, zeile: null, spalte: null }]);
    const ohne = P.run('Bote.sage(("ok"));', { herdKern: new Uint8Array([0, 1, 2]) });
    gleich(ohne.exitCode, 0, 'Programme ohne Herd brauchen den Kern nicht');
  });

  test('Theke: onUi/onUiWarte, Ereignis ui, null = geschlossen, Vorrang vor uiEreignisse', () => {
    const q = 'Theke t = neu Theke("T");\nKnopf k = neu Knopf("x", () -> { k.setzeText("y"); });\nt.zeige(k);\nt.bediene();\nBote.sage(("zu"));';
    const gesendet = [];
    const evs = [{ typ: 'klick', id: 'z1' }, null, { typ: 'klick', id: 'z1' }];
    let fragen = 0;
    const r = P.run(q, { onUi: m => gesendet.push(m), onUiWarte: () => { fragen++; return evs.shift(); }, uiEreignisse: [] });
    gleich(fragen, 2, 'Anzahl Warte-Aufrufe');
    gleich(gesendet.map(m => m.op), ['fenster', 'baum', 'aendere']);
    gleich(r.ereignisse.filter(e => e.typ === 'ui').map(e => e.nachricht), gesendet, 'ui-Ereignisse = onUi-Nachrichten');
    gleich(ausgabeText(r.ereignisse), 'zu\n');
    ja(!r.ereignisse.some(e => e.typ === 'warnung'), 'keine W0100 mit Renderer');
  });

  test('Theke: Warten kostet keine Schritte, Aufbau kostet normale Aufruf-Schritte', () => {
    const q = 'Theke t = neu Theke("T");\nKnopf k = neu Knopf("x", () -> { });\nt.zeige(k);\nt.bediene();';
    const a = P.run(q, { uiEreignisse: [] });
    const b = P.run(q, { uiEreignisse: [{ typ: 'klick', id: 'z1' }, { typ: 'klick', id: 'z1' }, { typ: 'aenderung', id: 'z1', wert: 'x' }] });
    gleich(b.schritte, a.schritte, 'Klicks mit leerem Rückruf kosten keine Schritte');
    gleich(a.schritte, 3 + 4 + 4 + 3, 'Schritte für Aufbau');
    gleich(a.zeitMs, a.schritte);
    const c = P.run('Theke t = neu Theke("T");\nKnopf k = neu Knopf("x", () -> { salami q = 1; });\nt.zeige(k);\nt.bediene();', { uiEreignisse: [{ typ: 'klick', id: 'z1' }] });
    gleich(c.schritte, a.schritte + 2, 'Rückruf zählt nur seinen Rumpf');
  });

  test('PizzaLang.intern: analysiere, pruefe, Tabellen', () => {
    const I = P.intern;
    const ast = P.parse('salami PiZZa = 1;\nsalami PizZa = 2;\nhawaii h;\nklasse K erbt Gibts { }').ast;
    gleich(I.analysiere(ast).map(w => [w.code, w.zeile]), [['W0666', 3], ['W0032', 2]]);
    const lauf = P.run('salami PiZZa = 1;\nsalami PizZa = 2;\nhawaii h;\nklasse K erbt Gibts { }');
    gleich(I.analysiere(ast).map(w => w.text), lauf.ereignisse.filter(e => e.typ === 'warnung').map(e => e.text), 'gleiche Warnungen wie run()');
    const f = I.pruefe(ast);
    const fe = lauf.ereignisse.find(e => e.typ === 'fehler');
    gleich([f.code, f.text, f.zeile, f.spalte], [fe.code, fe.text, fe.zeile, fe.spalte], 'pruefe = fehler-Ereignis');
    gleich(I.pruefe(P.parse('klasse A { }').ast), null);
    gleich(I.pruefe(P.parse('quattrostagioni J { A }').ast).code, 'Q0004');
    gleich(I.ANANAS_BAUM.length, 16);
    gleich(I.ANANAS_BAUM[15], ['KüchenAnanas', 'LaufzeitAnanas']);
    gleich(I.ANANAS_BAUM[0], ['Ananas', null]);
    gleich([I.MAX_STAPEL, I.STANDARD_LIMIT, I.GRUNDPREIS, I.BELAEGE], [1500, 5000000, undefined, undefined]);
    I.ANANAS_BAUM.push(['FremdAnanas', 'Ananas']);
    gleich(P.intern.ANANAS_BAUM.length === 17 ? 'geteilt' : 'kopie', 'geteilt', 'intern-Objekt ist einmalig erzeugt');
    gleich(P.run('neu FremdAnanas("x");').exitCode, 1, 'Interpreter unbeeinflusst');
    I.ANANAS_BAUM.pop();
  });

  test('Vorratskammer: onVorrat erhält die vollständige Kammer (Kopie), Fehlschlag → LaufzeitAnanas, kein W0101', () => {
    const aufrufe = [];
    const q = 'Vorratskammer v = neu Vorratskammer("s");\nv.lege("a", [1, 2]);\nv.lege("b", ja);\nv.entferne("a");\nv.leeren();';
    const r = P.run(q, { onVorrat: (name, e) => { aufrufe.push([name, e]); e.push(['manipuliert', 1]); } });
    gleich(r.exitCode, 0);
    gleich(aufrufe.map(a => a[1].filter(x => x[0] !== 'manipuliert')), [[['a', [1, 2]]], [['a', [1, 2]], ['b', true]], [['b', true]], []]);
    ja(aufrufe.every(a => a[0] === 's'), 'Name');
    ja(!r.ereignisse.some(e => e.typ === 'warnung'), 'kein W0101 mit onVorrat');
    gleich(r.ereignisse.filter(e => e.typ === 'vorrat').length, 4);
    const r2 = P.run('Vorratskammer v = neu Vorratskammer("s");\nv.lege("a", 1);', { onVorrat: () => false });
    gleich(r2.ereignisse.find(e => e.typ === 'fehler').text, "Ungefangene Ananas – LaufzeitAnanas: Die Vorratskammer 's' konnte nicht gespeichert werden. (Zeile 2)");
    const r3 = P.run('Vorratskammer v = neu Vorratskammer("s");\nBote.sage((v.hole("a")));', { vorrat: { s: { v: 1, name: 's', eintraege: [['a', 'aus Datei']] } } });
    gleich(ausgabeText(r3.ereignisse), 'aus Datei\n', 'Serialisierung v1 als Eingang');
  });

  test('K-015: P0012 ist ein Parse-Fehler', () => {
    const r = P.parse('leer f() {\n  abbrechen;\n}');
    gleich([r.ok, r.fehler.code, r.fehler.zeile, r.fehler.spalte], [false, 'P0012', 2, 3]);
    gleich(r.fehler.text, "PizzaFehler P0012: 'abbrechen' steht außerhalb einer Schleife.");
    const e = P.run('weiter;').ereignisse[0];
    gleich([e.typ, e.code, e.art], ['fehler', 'P0012', 'syntax']);
  });

  test('K-014: interner Fehler mit festem Text und Feld detail', () => {
    const boese = { toString() { throw new Error('kaputt'); } };
    const r = P.run('Bote.sage(("a"));\nBestellannahme.lies();', { onEingabe: () => boese });
    gleich(r.exitCode, 1);
    const e = r.ereignisse.find(x => x.typ === 'fehler');
    gleich([e.code, e.art, e.text, e.detail], ['LaufzeitAnanas', 'ananas', 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen. (Zeile 2)', 'kaputt']);
  });

  test('pizza.js läuft ohne Node-Globale (Worker-Kontext: nur self)', () => {
    const code = fs.readFileSync(path.join(ROOT, 'site', 'js', 'pizza.js'), 'utf8');
    const sandbox = {};
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'pizza.js' });
    const L = sandbox.PizzaLang;
    ja(L && typeof L.run === 'function', 'self.PizzaLang fehlt');
    const r = L.run('salami f(salami n) { falls (n == 0) { serviere (0); } serviere ((n + f(n - 1))); }\nBote.sage((f(10)));\nf(100000);');
    gleich(r.ereignisse[0].text, '55');
    gleich(r.exitCode, 1, 'Stapelüberlauf im Worker-Kontext');
    ja(/Stapelüberlauf/.test(r.ereignisse.find(e => e.typ === 'fehler').text), 'Stapelüberlauf-Meldung');
    // K-128: einzige Ausnahme ist der Node-Lader für kern.wasm/schema.json (HERD-NODE-ANFANG … HERD-NODE-ENDE, per typeof geschützt)
    const ohneAusnahmen = code.replace(/typeof module[^;]*module\.exports/g, '').replace(/HERD-NODE-ANFANG[\s\S]*?HERD-NODE-ENDE/g, '');
    ja(!/\bprocess\b|\brequire\(/.test(ohneAusnahmen), 'pizza.js referenziert process/require');
    ja(L.TYPEN.includes('Herd') && L.TYPEN.includes('Kreis'), 'Herd-Typen auch ohne Node (v1-Liste)');
  });

  test('Determinismus: Zufall mit festem Seed', () => {
    const q = 'Blech<salami> b = []; für (salami i = 0; i < 20; i++) { b.hinzu(Zufall.zahl(1, 6)); } Bote.sage((b));';
    const a = ausgabeText(P.run(q).ereignisse), b = ausgabeText(P.run(q).ereignisse);
    gleich(a, b);
    ja(/^\[[1-6](, [1-6]){19}\]\n$/.test(a), a);
  });

  test('onEingabe: Anfrage, Ereignisse, EOF bei undefined/Fehler, Vorrang vor eingabe', () => {
    const anfragen = [];
    const antworten = ['erste\r\n', 7, undefined];
    const r = P.run('Bote.sage((Bestellannahme.frage(("A? "))));\nBote.sage((Bestellannahme.liesZahl() + 1));\nBote.sage((Bestellannahme.lies()));\nBote.sage((Bestellannahme.hatMehr()));',
      { eingabe: ['ignoriert'], onEingabe: (a) => { anfragen.push(a); return antworten.shift(); } });
    gleich(anfragen, [{ prompt: 'A? ', art: 'zeile' }, { prompt: null, art: 'zahl' }, { prompt: null, art: 'zeile' }], 'Anfragen');
    gleich(r.ereignisse.filter(e => e.typ === 'eingabe').map(e => e.text), ['erste', '7', null], 'eingabe-Ereignisse');
    gleich(ausgabeText(r.ereignisse), 'A? erste\n8\nkarton\nnein\n');
    gleich(r.ereignisse[0], { typ: 'ausgabe', text: 'A? ', umbruch: false });
    const r2 = P.run('Bote.sage((Bestellannahme.lies()));', { onEingabe: () => { throw new Error('Abbruch'); } });
    gleich(ausgabeText(r2.ereignisse), 'karton\n');
  });

  test('Warten auf Eingabe kostet keine Schritte/Zeit, Aufruf genau 1+1', () => {
    const q = 'salami x = 1;';
    const ohne = P.run(q).schritte;
    const mit = P.run('salami x = 1;\nBestellannahme.lies();', { onEingabe: () => 'langsam' }).schritte;
    gleich(mit - ohne, 3, 'Schritte für Anweisung + Aufruf + Name');
  });

  test('Schrittzählung exakt (Referenz für den Compiler)', () => {
    const faelle = [
      ['', 0],
      ['salami x = 1;', 2],
      ['salami x = 1 + 2 * 3;', 6],
      ['Bote.sage((1));', 4],
      ['falls (ja) { } sonst { }', 2],
      ['falls (nein) { } sonst falls (ja) { }', 4],
      ['für (salami i = 0; i < 3; i++) { }', 1 + 2 + 4 * 3 + 3 * 1],
      ['salami f(salami a) { serviere ((a)); }\nf(1);', 5],
      ['Dauer d = 1s + 500ms;', 4],
      ['Uhr.vorspulen(1h);', 4],
      ['klasse K { salami x = 5; }\nK k = neu K();', 3],
      ['solange (nein) { }', 2],
      ['Rezept r = x -> x + 1;\nr(1);', 2 + 3 + 3]
    ];
    for (const [q, n] of faelle) gleich(P.run(q).schritte, n, 'Schritte für ' + JSON.stringify(q));
    const r = P.run('Uhr.vorspulen(1h);');
    gleich(r.zeitMs, 3600000 + 4, 'zeitMs');
  });

  // Küchenbrigade (THREADS.md §3 D6/D7, Referenztabelle): schritte = Summe, Uhr = Anschnitt + längstes Stück
  test('Küchenbrigade: schritte/zeitMs (D6-Referenz) und Unabhängigkeit von Köchen/Chaos', () => {
    const faelle = [
      ['Blech<salami> r = [1, 2, 3, 4].belege(x -> x * x);', 20, 20, null],
      ['Blech<salami> r = [1, 2, 3, 4].brigade(x -> x * x);', 20, 11, null],
      ['Blech<salami> r = [1, 2, 3, 4].brigade(x -> x * x);\nBote.sage((Uhr.jetzt()));', 25, 16, '16ms'],
      ['Blech<salami> r = [1, 2, 3, 4].belege(x -> x * x);\nBote.sage((Uhr.jetzt()));', 25, 25, '25ms'],
      ['[1, 2, 3, 4].brigade(x -> { Uhr.vorspulen(x * 1s); serviere (x); });\nBote.sage((Uhr.jetzt()));', 45, 4021, '4s 21ms'],
      ['[1, 2, 3, 4].belege(x -> { Uhr.vorspulen(x * 1s); serviere (x); });\nBote.sage((Uhr.jetzt()));', 45, 10045, '10s 45ms'],
      ['Blech<salami> r = [].brigade(x -> x);\nBote.sage((Zufall.zahl(1, 1000)));', null, null, null]
    ];
    for (const [q, s, t, aus] of faelle) {
      const r = P.run(q);
      gleich(r.exitCode, 0, 'Exit für ' + JSON.stringify(q));
      if (s !== null) gleich([r.schritte, r.zeitMs], [s, t], 'schritte/zeitMs für ' + JSON.stringify(q));
      if (aus !== null) gleich(r.ereignisse[0].text, aus, 'Ausgabe für ' + JSON.stringify(q));
    }
    // leeres Blech: kein Anschnitt, keine Zufallsziehung
    gleich(P.run('Blech<salami> r = [].brigade(x -> x);\nBote.sage((Zufall.zahl(1, 1000)));').ereignisse[0].text,
      P.run('Bote.sage((Zufall.zahl(1, 1000)));').ereignisse[0].text, 'leeres Blech zieht keine Saat');
    // D7: Summen-P0002 am Aufruf, schritte = tatsächliche Summe (> Limit + 1)
    const lim = P.run('Blech<salami> r = [1, 2, 3, 4].brigade(x -> x * x * x);', { schrittLimit: 15 });
    gleich([lim.exitCode, lim.schritte, lim.zeitMs], [3, 28, 13], 'Summen-P0002');
    // optionen.koeche wird ignoriert, kuechenChaos (Permutation der Stücke) ändert nichts
    const prog = fs.readFileSync(path.join(__dirname, 'faelle', 'kueche-determinismus.pizza'), 'utf8');
    const ref = P.run(prog);
    for (const opt of [{ koeche: 4 }, { kuechenChaos: 1 }, { kuechenChaos: 7 }, { kuechenChaos: 12345, koeche: 1 }]) {
      const r = P.run(prog, opt);
      gleich(JSON.stringify(r.ereignisse), JSON.stringify(ref.ereignisse), 'Ereignisse mit ' + JSON.stringify(opt));
    }
    for (const d of fs.readdirSync(path.join(__dirname, 'faelle')).filter(x => /^kueche-.*\.pizza$/.test(x))) {
      const q = fs.readFileSync(path.join(__dirname, 'faelle', d), 'utf8');
      const a = P.run(q, { kuechenChaos: 3 }), b = P.run(q);
      gleich(JSON.stringify(a.ereignisse), JSON.stringify(b.ereignisse), 'kuechenChaos bei ' + d);
    }
  });

  test('run() wirft nie, auch bei Unsinn', () => {
    for (const q of [null, undefined, '', '   ', '﻿Bote.sage((1));', 42]) {
      const r = P.run(q);
      ja(typeof r.exitCode === 'number', 'exitCode');
    }
  });

  for (const [name, fn] of tests) {
    if (!passt(name)) continue;
    try { fn(); ergebnis('api', name, null); }
    catch (e) { ergebnis('api', name, String(e && e.message || e)); }
  }
}

// ---------------------------------------------------------------------
// 3. Beispiele aus site/beispiele
// ---------------------------------------------------------------------
function beispiele() {
  console.log(fett('\n▶ Beispiele (site/beispiele)'));
  gruppe('beispiele');
  const dir = path.join(ROOT, 'site', 'beispiele');
  const indexPfad = path.join(dir, 'index.json');
  if (!fs.existsSync(indexPfad)) { uebersprungen('beispiele', 'index.json', 'Datei fehlt'); return; }
  let index;
  try { index = JSON.parse(fs.readFileSync(indexPfad, 'utf8')); }
  catch (e) { ergebnis('beispiele', 'index.json', 'ungültiges JSON: ' + e.message); return; }
  for (const teil of index.teile || []) {
    const mp = path.join(dir, teil);
    if (!fs.existsSync(mp)) { uebersprungen('beispiele', teil, 'Manifest fehlt'); continue; }
    let man;
    try { man = JSON.parse(fs.readFileSync(mp, 'utf8')); }
    catch (e) { ergebnis('beispiele', teil, 'ungültiges JSON: ' + e.message); continue; }
    console.log(grau('  ' + teil + ' – ' + (man.kategorie || '?') + ' (' + (man.beispiele || []).length + ')'));
    for (const b of man.beispiele || []) {
      const name = teil.replace(/\.json$/, '') + '/' + (b.id || b.datei);
      if (!passt(name)) continue;
      const dp = b.datei && path.join(dir, b.datei);
      if (!dp || !fs.existsSync(dp)) { uebersprungen('beispiele', name, 'Datei fehlt: ' + b.datei); continue; }
      const quelle = fs.readFileSync(dp, 'utf8');
      const t0 = Date.now();
      const opt = Object.assign({ args: b.args || [] }, laufFelder({ zufallsSaat: b.zufallsSaat, echtzeit: b.echtzeit, zone: b.zone, schrittLimit: b.schrittLimit }));
      if (b.eingabe) {
        const ep = path.join(dir, b.eingabe);
        if (!fs.existsSync(ep)) { uebersprungen('beispiele', name, 'Eingabedatei fehlt: ' + b.eingabe); continue; }
        opt.eingabe = eingabeZeilen(fs.readFileSync(ep, 'utf8'));
      } else {
        // Fallback: gleichnamige .eingabe-Datei neben der .pizza-Datei
        const ep = dp.replace(/\.pizza$/, '.eingabe');
        if (ep !== dp && fs.existsSync(ep)) opt.eingabe = eingabeZeilen(fs.readFileSync(ep, 'utf8'));
      }
      // Theke: Manifestfelder ereignisse/uiErwartet, sonst gleichnamige Dateien neben der .pizza
      const nebenan = (feld, endung) => {
        if (b[feld]) { const fp = path.join(dir, b[feld]); return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : undefined; }
        const fp = dp.replace(/\.pizza$/, endung);
        return fp !== dp && fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
      };
      const evText = nebenan('ereignisse', '.ereignisse');
      const uiText = nebenan('uiErwartet', '.ui-erwartet');
      const herdText = nebenan('herdErwartet', '.herd-erwartet');
      if (herdText === undefined) { uebersprungen('beispiele', name, 'Herd-Datei aus dem Manifest fehlt'); continue; }
      if (evText === undefined || uiText === undefined) { uebersprungen('beispiele', name, 'Theke-Datei aus dem Manifest fehlt'); continue; }
      if (evText !== null) opt.uiEreignisse = jsonZeilen(evText, name + '.ereignisse');
      const vorratText = nebenan('vorrat', '.vorrat.json');
      if (vorratText === undefined) { uebersprungen('beispiele', name, 'Vorrat-Datei aus dem Manifest fehlt'); continue; }
      if (vorratText !== null) opt.vorrat = JSON.parse(vorratText);
      const r = P.run(quelle, opt);
      const probleme = [];
      const exitSoll = typeof b.exitCode === 'number' ? b.exitCode : 0;
      if (r.exitCode !== exitSoll) probleme.push('Exit-Code ' + r.exitCode + ', erwartet ' + exitSoll + fehlerZusammenfassung(r));
      if (uiText !== null) { const u = uiVergleich(jsonZeilen(uiText, name + '.ui-erwartet'), r.ereignisse); if (u) probleme.push(u); }
      if (herdText !== null) { const u = herdVergleich(jsonZeilen(herdText, name + '.herd-erwartet'), r.ereignisse); if (u) probleme.push(u); }
      const ep = b.erwartet && path.join(dir, b.erwartet);
      if (ep && fs.existsSync(ep)) {
        const soll = fs.readFileSync(ep, 'utf8');
        const ist = ausgabeText(r.ereignisse);
        if (norm(soll) !== norm(ist)) probleme.push('Ausgabe weicht ab:\n' + diff(soll, ist));
      } else if (b.erwartet) gruppe('beispiele').notiz.push(name + ': .erwartet fehlt (' + b.erwartet + ')');
      ergebnis('beispiele', name + grau(' (' + (Date.now() - t0) + ' ms)'), probleme.join('\n') || null);
    }
  }
}

// ---------------------------------------------------------------------
// 4. Doku-Codeblöcke aus site/js/doku/*.js
// ---------------------------------------------------------------------
function doku() {
  console.log(fett('\n▶ Doku-Codeblöcke (site/js/doku)'));
  gruppe('doku');
  const dir = path.join(ROOT, 'site', 'js', 'doku');
  if (!fs.existsSync(dir)) { uebersprungen('doku', 'site/js/doku', 'Ordner fehlt'); return; }
  const dateien = fs.readdirSync(dir).filter(x => x.endsWith('.js')).sort();
  if (!dateien.length) { uebersprungen('doku', 'site/js/doku', 'keine Dateien'); return; }
  const sandbox = { console };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const d of dateien) {
    try { vm.runInContext(fs.readFileSync(path.join(dir, d), 'utf8'), sandbox, { filename: d }); }
    catch (e) { ergebnis('doku', d, 'Datei lädt nicht: ' + e.message); }
  }
  const abschnitte = sandbox.PIZZA_DOKU || [];
  console.log(grau('  ' + abschnitte.length + ' Abschnitte aus ' + dateien.length + ' Dateien'));
  const ARTEN = new Set(['text', 'code', 'tabelle', 'hinweis', 'ausgabe', 'kurz', 'bild', 'details']);
  const pruefeBlock = (a, liste, pfad) => {
    liste.forEach((item, i) => {
      const name = (a.id || '?') + '#' + pfad + i;
      if (!item || typeof item !== 'object' || !ARTEN.has(item.art)) {
        if (passt(name)) ergebnis('doku', name, 'Unbekannte Inhaltsart: ' + JSON.stringify(item && item.art));
        return;
      }
      if (item.art === 'details') {
        if (!Array.isArray(item.inhalt)) { if (passt(name)) ergebnis('doku', name, 'details ohne inhalt-Array'); return; }
        pruefeBlock(a, item.inhalt, pfad + i + '.');
        return;
      }
      if (item.art === 'bild') {
        if (item.src && !/^(https?:|data:)/.test(item.src) && !fs.existsSync(path.join(ROOT, 'site', item.src))) gruppe('doku').notiz.push(name + ': Bild fehlt: ' + item.src);
        return;
      }
      if (item.art !== 'code' || !passt(name)) return;
      if (item.sprache === 'xml' || item.sprache === 'shell') { gruppe('doku').skip++; return; }
      const code = String(item.code || '');
      if (item.ausfuehrbar || item.nurTest) {
        const opt = {};
        if (Array.isArray(item.eingabe)) opt.eingabe = item.eingabe;
        if (Array.isArray(item.uiEreignisse)) opt.uiEreignisse = item.uiEreignisse;
        Object.assign(opt, laufFelder(item));
        const r = P.run(code, opt);
        const soll = typeof item.exitCode === 'number' ? item.exitCode : 0;
        let fehler = null;
        if (r.exitCode !== soll) fehler = 'Exit-Code ' + r.exitCode + ', erwartet ' + soll + fehlerZusammenfassung(r) + '\n' + grau(code.split('\n').map(z => '| ' + z).join('\n'));
        if (!fehler && Array.isArray(item.uiErwartet)) fehler = uiVergleich(item.uiErwartet, r.ereignisse);
        if (!fehler && Array.isArray(item.herdErwartet)) fehler = herdVergleich(item.herdErwartet, r.ereignisse);
        const naechstes = liste[i + 1];
        if (!fehler && naechstes && naechstes.art === 'ausgabe' && typeof naechstes.text === 'string') {
          if (norm(naechstes.text) !== norm(ausgabeText(r.ereignisse))) gruppe('doku').notiz.push(name + ': folgender ausgabe-Block weicht von der echten Ausgabe ab (nur Hinweis)');
        }
        ergebnis('doku', name, fehler);
      } else {
        const r = P.parse(code);
        ergebnis('doku', name + grau(' (nur parse)'), r.ok ? null : r.fehler.text + ' (Zeile ' + r.fehler.zeile + ', Spalte ' + r.fehler.spalte + ')\n' + grau(code.split('\n').map(z => '| ' + z).join('\n')));
      }
    });
  };
  for (const a of abschnitte) pruefeBlock(a, a.inhalt || [], '');
}

// ---------------------------------------------------------------------
// 5. CLI (bin/pizza.js) – als eigener Prozess, ohne TTY (keine Farben)
// ---------------------------------------------------------------------
function cli() {
  console.log(fett('\n▶ CLI (bin/pizza.js)'));
  gruppe('cli');
  const { spawnSync } = require('child_process');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pizza-cli-'));
  const datei = (name, inhalt) => { const p = path.join(tmp, name); fs.writeFileSync(p, inhalt); return p; };
  const lauf = (args, stdin) => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'pizza.js'), ...args],
      { input: stdin === undefined ? '' : stdin, encoding: 'utf8', env: Object.assign({}, process.env, { NO_COLOR: '1' }) });
    return { code: r.status, out: r.stdout.replace(/\r\n/g, '\n'), err: r.stderr.replace(/\r\n/g, '\n') };
  };
  const tests = [];
  const test = (name, fn) => tests.push([name, fn]);
  const gleich = (ist, soll, was) => {
    if (JSON.stringify(ist) !== JSON.stringify(soll)) throw new Error((was || 'Wert') + ': erwartet ' + JSON.stringify(soll) + ', bekam ' + JSON.stringify(ist));
  };
  const wuerfel = datei('wuerfel.pizza', 'Bote.sage((Zufall.zahl(1, 1000000) + " " + Zufall.zahl(1, 1000000)));\n');

  test('K-077/U-46: ohne --saat genau eine Zeile "Saat: N" auf stderr, N ∈ [0, 2^32)', () => {
    const r = lauf(['--kein-vorrat', wuerfel]);
    gleich(r.code, 0, 'Exit-Code');
    const m = /^Saat: (\d+)\n$/.exec(r.err);
    if (!m) throw new Error('stderr ist nicht exakt "Saat: N\\n": ' + JSON.stringify(r.err));
    const n = Number(m[1]);
    if (!(n >= 0 && n < 4294967296)) throw new Error('Saat außerhalb des Bereichs: ' + n);
    const nochmal = lauf(['--kein-vorrat', '--saat=' + n, wuerfel]);
    gleich(nochmal.out, r.out, 'gleiche Saat → gleiche Würfe');
    gleich(nochmal.err, '', 'mit --saat keine Saat-Zeile');
  });

  test('K-077: --saat=7 wirkt wie optionen.zufallsSaat = 7 (identisch zur Bibliothek)', () => {
    const r = lauf(['--kein-vorrat', '--saat=7', wuerfel]);
    const ref = P.run(fs.readFileSync(wuerfel, 'utf8'), { zufallsSaat: 7 }).ereignisse.find(e => e.typ === 'ausgabe').text + '\n';
    gleich(r.out, ref);
    const r2 = lauf(['--kein-vorrat', '--saat=-1', wuerfel]);
    const ref2 = P.run(fs.readFileSync(wuerfel, 'utf8'), { zufallsSaat: -1 }).ereignisse.find(e => e.typ === 'ausgabe').text + '\n';
    gleich(r2.out, ref2, 'negative Saat normalisiert');
    gleich(lauf(['--saat=2.5', wuerfel]).code, 2, '--saat ohne Ganzzahl → Exit 2');
  });

  test('K-083/U-45: Warnungen und Fehler als <text> (Zeile Z, Spalte S), Ananas ohne doppelte Zeile', () => {
    const p = datei('fehler.pizza', 'salami PiZZa = 1;\nsalami PizZa = 2;\nBote.sage(("vorher"));\nsalami x = 1 / 0;\n');
    const r = lauf(['--kein-vorrat', '--saat=1', p]);
    gleich(r.code, 1);
    gleich(r.out, 'vorher\n');
    gleich(r.err, "W0032: 'PiZZa' und 'PizZa' sind im selben Scope definiert. Selbst der Pizzaiolo verwechselt die beiden. (Zeile 2, Spalte 8)\n" +
      'Ungefangene Ananas – RechenAnanas: Durch null teilen? Das ergibt keine Stücke. (Zeile 4, Spalte 1)\n');
    const s = lauf(['--saat=1', datei('syntax.pizza', 'salami x = 1\nBote.sage((x));\n')]);
    gleich([s.code, s.err], [2, "PizzaFehler P0001: Erwartet ';' nach Anweisung, gefunden 'Bote' (Zeile 1, Spalte 13)\n"]);
    const l = lauf(['--saat=1', '--schritte=50', datei('limit.pizza', 'solange (ja) { }\n')]);
    gleich([l.code, l.err], [3, 'PizzaFehler P0002: Die Pizza ist noch im Ofen. (Schrittlimit erreicht – Endlosschleife?) (Zeile 1, Spalte 1)\n']);
  });

  test('-- beendet die Optionen: Rest unverändert an hauptgang(args), nur das erste -- zählt', () => {
    const p = datei('args.pizza', 'speisekarte klasse A {\n  speisekarte tiefkühl leer hauptgang(Blech<margherita> args) {\n    für (margherita a : args) { Bote.sage(("[" + a + "]")); }\n  }\n}\n');
    const r = lauf(['--kein-vorrat', '--saat=1', p, '--', '--mein-arg']);
    gleich([r.code, r.out, r.err], [0, '[--mein-arg]\n', '']);
    gleich(lauf(['--kein-vorrat', '--saat=1', p, '--', '--hilfe']).out, '[--hilfe]\n', '-- --hilfe zeigt keine Hilfe');
    gleich(lauf(['--kein-vorrat', '--saat=1', p, '--', '--x', '--', 'y']).out, '[--x]\n[--]\n[y]\n', 'späteres -- bleibt');
    gleich(lauf(['--kein-vorrat', '--saat=1', p, 'a', '--', 'b']).out, '[a]\n[--]\n[b]\n', '-- nach Programmargument bleibt');
    gleich(lauf(['--kein-vorrat', '--saat=1', '--', p, '--', '--info']).out, '[--]\n[--info]\n', '-- vor der Datei');
    gleich(lauf(['--kein-vorrat', '--saat=1', p, '--info']).out, '[--info]\n', 'nach der Datei keine Optionen');
    const v = lauf(['--version']);
    gleich([v.code, v.out], [0, 'pizza ' + P.version + '\n'], '--version');
    const h = lauf(['--hilfe']);
    if (!/datei\.pizza \[--\] \[args…\]/.test(h.out) || !/\n {2}-- {3}Ende der Optionen/.test(h.out)) throw new Error('--hilfe dokumentiert -- nicht: ' + h.out);
  });

  test('Eingabe: stdin und --eingabe, Exit-Code, --ast', () => {
    const p = datei('ein.pizza', 'margherita n = Bestellannahme.frage(("Name? "));\nBote.sage(("Ciao " + n));\n');
    gleich(lauf(['--saat=1', p], 'Luigi\n').out, 'Name? Ciao Luigi\n');
    const e = datei('ein.eingabe', 'Mario\n');
    gleich(lauf(['--saat=1', '--eingabe', e, p]).out, 'Name? Ciao Mario\n');
    const a = lauf(['--ast', p]);
    gleich([a.code, JSON.parse(a.out).k], [0, 'Programm']);
  });

  test('Vorrat: --vorrat=ordner speichert atomar als JSON v1 und lädt beim nächsten Lauf; --kein-vorrat → W0101', () => {
    const ordner = path.join(tmp, 'vorrat');
    const p = datei('vorrat.pizza', 'Vorratskammer v = neu Vorratskammer("cli-test");\nsalami n = v.hole("n", 0) + 1;\nv.lege("n", n);\nBote.sage((n));\n');
    gleich(lauf(['--saat=1', '--vorrat=' + ordner, p]).out, '1\n');
    gleich(lauf(['--saat=1', '--vorrat=' + ordner, p]).out, '2\n');
    gleich(JSON.parse(fs.readFileSync(path.join(ordner, 'cli-test.json'), 'utf8')), { v: 1, name: 'cli-test', eintraege: [['n', 2]] });
    gleich(fs.readdirSync(ordner), ['cli-test.json'], 'keine Temp-Dateien');
    const k = lauf(['--saat=1', '--kein-vorrat', p]);
    gleich([k.out, k.err], ['1\n', 'W0101: Keine Vorratskammer verfügbar – Zustand wird nicht gespeichert. (Zeile 1, Spalte 19)\n']);
  });

  test('Vorrat löschen: --vorrat-loeschen <name> / --vorrat-loeschen-alle ohne Programm, feste Texte, ungültiger Name → Exit 2', () => {
    const ordner = path.join(tmp, 'loeschen');
    const p = datei('kammern.pizza', 'neu Vorratskammer("alle").lege("x", 0);\nneu Vorratskammer("eins").lege("a", 1);\nneu Vorratskammer("zwei").lege("b", 2);\n');
    gleich(lauf(['--saat=1', '--vorrat=' + ordner, p]).code, 0);
    fs.writeFileSync(path.join(ordner, 'notiz.txt'), 'bleibt');
    gleich(fs.readdirSync(ordner).sort(), ['alle.json', 'eins.json', 'notiz.txt', 'zwei.json']);
    const r1 = lauf(['--vorrat=' + ordner, '--vorrat-loeschen', 'eins']);
    gleich([r1.code, r1.out, r1.err], [0, "Vorrat 'eins' gelöscht.\n", '']);
    const r2 = lauf(['--vorrat=' + ordner, '--vorrat-loeschen=eins']);
    gleich([r2.code, r2.out], [0, "Vorrat 'eins' gibt es nicht.\n"]);
    const r3 = lauf(['--vorrat=' + ordner, '--vorrat-loeschen', 'Groß Name']);
    gleich([r3.code, r3.out, r3.err], [2, '', "Ungültiger Kammername 'Groß Name' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen, mit Namensraum 'raum/name').\n"]);
    const ra = lauf(['--vorrat=' + ordner, '--vorrat-loeschen', 'alle']);
    gleich([ra.code, ra.out], [0, "Vorrat 'alle' gelöscht.\n"], 'Kammer namens alle einzeln');
    gleich(fs.readdirSync(ordner).sort(), ['notiz.txt', 'zwei.json']);
    const r4 = lauf(['--vorrat=' + ordner, '--vorrat-loeschen-alle']);
    gleich([r4.code, r4.out], [0, 'Alle Vorräte gelöscht.\n']);
    gleich(fs.readdirSync(ordner), ['notiz.txt'], 'nur Kammer-Dateien gelöscht');
    gleich(lauf(['--vorrat=' + path.join(tmp, 'gibtsnicht'), '--vorrat-loeschen-alle']).out, 'Alle Vorräte gelöscht.\n');
    gleich(lauf(['--vorrat-loeschen']).code, 2, 'ohne Namen');
  });

  test('Vorrat mit Namensraum (K-106): <ordner>/<raum>/<name>.json, Kennung im JSON, --vorrat-loeschen raum/name, -alle räumt Raum-Ordner, ungültige Kennung → Exit 2', () => {
    const ordner = path.join(tmp, 'raum');
    const p = datei('raum.pizza', 'Vorratskammer v = neu Vorratskammer("stand", namensraum: "spiel");\nsalami n = v.hole("n", 0) + 1;\nv.lege("n", n);\nneu Vorratskammer("stand").lege("n", 0);\nBote.sage((n + " " + v));\n');
    gleich(lauf(['--saat=1', '--vorrat=' + ordner, p]).out, '1 Vorratskammer(spiel/stand)\n');
    gleich(lauf(['--saat=1', '--vorrat=' + ordner, p]).out, '2 Vorratskammer(spiel/stand)\n');
    gleich(JSON.parse(fs.readFileSync(path.join(ordner, 'spiel', 'stand.json'), 'utf8')), { v: 1, name: 'spiel/stand', eintraege: [['n', 2]] });
    gleich(fs.readdirSync(ordner).sort(), ['spiel', 'stand.json']);
    gleich(fs.readdirSync(path.join(ordner, 'spiel')), ['stand.json'], 'keine Temp-Dateien im Raum-Ordner');
    const r1 = lauf(['--vorrat=' + ordner, '--vorrat-loeschen', 'spiel/stand']);
    gleich([r1.code, r1.out, r1.err], [0, "Vorrat 'spiel/stand' gelöscht.\n", '']);
    gleich(lauf(['--vorrat=' + ordner, '--vorrat-loeschen=spiel/stand']).out, "Vorrat 'spiel/stand' gibt es nicht.\n");
    fs.writeFileSync(path.join(tmp, 'x.json'), '{}');  // liegt eine Ebene über dem Vorratsordner – darf nie erreicht werden
    for (const k of ['../x', 'a/b/c', 'spiel/', '/stand', 'Groß/stand']) {
      const r = lauf(['--vorrat=' + ordner, '--vorrat-loeschen', k]);
      gleich([r.code, r.out, r.err], [2, '', "Ungültiger Kammername '" + k + "' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen, mit Namensraum 'raum/name').\n"], k);
    }
    gleich(fs.existsSync(path.join(tmp, 'x.json')), true, 'kein Pfad aus ungeprüftem Text (../x bleibt unangetastet)');
    gleich(lauf(['--saat=1', '--vorrat=' + ordner, p]).out, '1 Vorratskammer(spiel/stand)\n', 'nach dem Löschen wieder bei 1');
    fs.mkdirSync(path.join(ordner, 'Fremd'));
    fs.writeFileSync(path.join(ordner, 'Fremd', 'a.json'), '{}');
    fs.writeFileSync(path.join(ordner, 'spiel', 'notiz.txt'), 'bleibt');
    fs.mkdirSync(path.join(ordner, 'anderes'));
    fs.writeFileSync(path.join(ordner, 'anderes', 'k.json'), '{}');
    const ra = lauf(['--vorrat=' + ordner, '--vorrat-loeschen-alle']);
    gleich([ra.code, ra.out], [0, 'Alle Vorräte gelöscht.\n']);
    gleich(fs.readdirSync(ordner).sort(), ['Fremd', 'spiel'], 'leerer Raum-Ordner entfernt, fremder Ordner und nicht leerer Raum bleiben');
    gleich(fs.readdirSync(path.join(ordner, 'spiel')), ['notiz.txt']);
    gleich(fs.readdirSync(path.join(ordner, 'Fremd')), ['a.json'], 'ungültiger Raumname wird nicht angefasst');
  });

  test('Projekte (PA1): Ordner, pizza.json, Datei mit bestellt; Orte mit Datei (SPEC §2.6)', () => {
    const wurzel = path.join(tmp, 'teigball');
    const schreibe = (rel, text) => { const p = path.join(wurzel, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };
    schreibe('pizza.json', '{ "pizza": 1, "args": ["Gina"] }');
    const haupt = schreibe('hauptgang.pizza', 'bestellt "welt/ofen.pizza";\r\nspeisekarte klasse S {\r\n  speisekarte tiefkühl leer hauptgang(Blech<margherita> args) { Bote.sage(("Hallo " + args.verbinde(","))); heize(); }\r\n}\r\n');
    schreibe('welt/ofen.pizza', 'leer heize() {\n  salami q = 1; salami Q = 2;\n  wirf neu LaufzeitAnanas("heiß");\n}\n');
    schreibe('pruefung/erwartet', 'gehört nicht zum Programm');
    schreibe('notiz.docx', 'fremde Dateiart');
    schreibe('README.md', 'Großbuchstaben: kein Projektpfad');
    schreibe('.vscode/settings.json', '{}');
    const r = lauf(['--kein-vorrat', '--saat=1', wurzel]);
    gleich([r.code, r.out], [1, 'Hallo Gina\n']);
    gleich(r.err, 'Hinweis: README.md wird ignoriert (kein gültiger Projektpfad: nur a–z, 0–9, -, _, . und /).\n' +
      'Hinweis: notiz.docx wird ignoriert (Projektdateien: .pizza, .png, .jpg, .txt, .json, .csv, .md).\n' +
      "W0032: 'q' und 'Q' sind im selben Scope definiert. Selbst der Pizzaiolo verwechselt die beiden. (welt/ofen.pizza, Zeile 2, Spalte 24)\n" +
      'Ungefangene Ananas – LaufzeitAnanas: heiß (welt/ofen.pizza, Zeile 3, Spalte 3)\n');
    gleich(lauf(['--kein-vorrat', '--saat=1', path.join(wurzel, 'pizza.json'), 'Toni']).out, 'Hallo Toni\n', 'pizza.json als Ziel, übergebene Argumente haben Vorrang');
    gleich(lauf(['--kein-vorrat', '--saat=1', haupt]).out, 'Hallo Gina\n', 'Datei im Projekt → Wurzel mit pizza.json');
    const a = lauf(['--ast', wurzel]);
    gleich([a.code, JSON.parse(a.out).ladeliste], [0, ['welt/ofen.pizza', 'hauptgang.pizza']], '--ast mit Ladeliste');
    // ohne pizza.json: nur die Datei und die per bestellt erreichten Dateien
    const lose = path.join(tmp, 'lose');
    fs.mkdirSync(path.join(lose, 'teile'), { recursive: true });
    fs.writeFileSync(path.join(lose, 'start.pizza'), 'bestellt "teile/zahl.pizza";\nBote.sage((ZAHL));\nwirf neu LaufzeitAnanas("Ende");\n');
    fs.writeFileSync(path.join(lose, 'teile', 'zahl.pizza'), 'salami ZAHL = 42;\n');
    fs.writeFileSync(path.join(lose, 'kaputt.pizza'), 'das ist { kein Programm');
    const l = lauf(['--kein-vorrat', '--saat=1', path.join(lose, 'start.pizza')]);
    gleich([l.code, l.out, l.err], [1, '42\n', 'Ungefangene Ananas – LaufzeitAnanas: Ende (start.pizza, Zeile 3, Spalte 1)\n']);
    fs.writeFileSync(path.join(lose, 'pizza.json'), '{ pizza: 1');
    const j = lauf(['--kein-vorrat', '--saat=1', lose]);
    gleich([j.code, j.err], [2, 'PizzaFehler P0015: pizza.json ist ungültig: kein gültiges JSON. (pizza.json)\n']);
  });

  test('Projekte (PD2): Ordner mit Bildern – Vorbacker im Prozess, Bildchen.laden und Kiste, Bildfehler mit Pfad', () => {
    const wurzel = path.join(tmp, 'bilder');
    fs.mkdirSync(path.join(wurzel, 'bilder'), { recursive: true });
    fs.mkdirSync(path.join(wurzel, 'daten'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'tests', 'faelle', 'projekt-bilder', 'bilder', 'kachel.png'), path.join(wurzel, 'bilder', 'a.png'));
    fs.writeFileSync(path.join(wurzel, 'bilder', 'kaputt.png'), 'kein Bild');
    fs.writeFileSync(path.join(wurzel, 'daten', 'gruss.txt'), 'Hallo\r\nWelt\r\n');
    fs.writeFileSync(path.join(wurzel, 'hauptgang.pizza'), 'Herd herd = neu Herd();\nBote.sage((Bildchen.laden("bilder/a.png") + " " + Kiste.liste()));\n' +
      'Bote.sage((Kiste.zeilen("daten/gruss.txt")));\nBildchen.laden("bilder/kaputt.png");\n');
    const r = lauf(['--kein-vorrat', '--saat=1', wurzel]);
    gleich([r.code, r.out, r.err], [1, 'Bildchen(5×3) [bilder/a.png, bilder/kaputt.png, daten/gruss.txt, hauptgang.pizza]\n[Hallo, Welt]\n',
      'Ungefangene Ananas – LaufzeitAnanas: bilder/kaputt.png ist kein lesbares Bild (PNG oder JPEG). (Zeile 4, Spalte 1)\n']);
  });

  for (const [name, fn] of tests) {
    if (!passt(name)) continue;
    try { fn(); ergebnis('cli', name, null); }
    catch (e) { ergebnis('cli', name, String(e && e.message || e)); }
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* egal */ }
}

// ---------------------------------------------------------------------
const t0 = Date.now();
if (!nurGruppe || nurGruppe === 'faelle') faelle();
if (!nurGruppe || nurGruppe === 'api') api();
if (!nurGruppe || nurGruppe === 'beispiele') beispiele();
if (!nurGruppe || nurGruppe === 'doku') doku();
if (!nurGruppe || nurGruppe === 'cli') cli();

console.log(fett('\n═══ Zusammenfassung ═══'));
for (const [g, s] of Object.entries(stat)) {
  const zeile = '  ' + g.padEnd(10) + gruen(String(s.ok).padStart(4) + ' ok') + '  ' + (s.fehl ? rot(String(s.fehl).padStart(3) + ' fehlgeschlagen') : grau('  0 fehlgeschlagen')) + '  ' + grau(s.skip + ' übersprungen');
  console.log(zeile);
  for (const n of s.notiz) console.log(gelb('    Hinweis: ') + n);
}
console.log(grau('  Dauer: ' + (Date.now() - t0) + ' ms'));
if (gesamtFehl) { console.log(rot(fett('\n✗ ' + gesamtFehl + ' Test(s) fehlgeschlagen.'))); process.exitCode = 1; }
else console.log(gruen(fett('\n✓ Alles gegessen.')));
