#!/usr/bin/env node
/*
 * Test-Harness für pizza v3.0 – ohne Abhängigkeiten.
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
const GRUPPEN = ['faelle', 'api', 'beispiele', 'doku'];
const nurGruppe = filter && GRUPPEN.includes(filter) ? filter : null;
const namensFilter = filter && !nurGruppe ? filter : null;

const farbig = process.stdout.isTTY && !process.env.NO_COLOR;
const f = (code, t) => farbig ? '\x1b[' + code + 'm' + t + '\x1b[0m' : t;
const gruen = t => f('32', t), rot = t => f('31', t), gelb = t => f('33', t), grau = t => f('90', t), fett = t => f('1', t);

const stat = {};
let gesamtFehl = 0;

function norm(s) { return String(s).replace(/\r\n/g, '\n').replace(/\n+$/, ''); }

function ausgabeText(ereignisse) {
  return ereignisse.filter(e => e.typ === 'ausgabe' || e.typ === 'fehlerausgabe' || e.typ === 'panik').map(e => e.text + '\n').join('');
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
// 1. Eigene Fälle: tests/faelle/*.pizza
// ---------------------------------------------------------------------
function faelle() {
  const dir = path.join(__dirname, 'faelle');
  console.log(fett('\n▶ Eigene Fälle (tests/faelle)'));
  gruppe('faelle');
  if (!fs.existsSync(dir)) { console.log(gelb('  Ordner fehlt.')); return; }
  const dateien = fs.readdirSync(dir).filter(x => x.endsWith('.pizza')).sort();
  for (const d of dateien) {
    const basis = d.slice(0, -6);
    if (!passt(basis)) continue;
    const lies = (endung) => { const p = path.join(dir, basis + endung); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
    const quelle = lies('.pizza');
    const erwartet = lies('.erwartet');
    const exitDatei = lies('.exitcode');
    const warnDatei = lies('.warnungen');
    const fehlerDatei = lies('.fehler');
    const optDatei = lies('.optionen.json');
    const opt = optDatei ? JSON.parse(optDatei) : {};
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
    if (fehlerDatei !== null) {
      const ist = r.ereignisse.filter(e => e.typ === 'fehler').map(e => e.text).join('\n');
      if (norm(fehlerDatei) !== norm(ist)) probleme.push('Fehler-Ereignis weicht ab:\n' + diff(fehlerDatei, ist));
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

  test('Konstanten der API', () => {
    gleich(P.version, '3.0.0', 'version');
    for (const k of ['klasse', 'serviere', 'calzone', 'quattrostagioni', 'ofen', 'roh', 'karton', 'wähle', 'für']) ja(P.KEYWORDS.includes(k), 'KEYWORDS fehlt ' + k);
    ja(!P.KEYWORDS.includes('pizza'), "'pizza' darf kein Keyword sein");
    for (const t of ['salami', 'funghi', 'margherita', 'diavolo', 'Dauer', 'Pizza', 'Blech', 'Speisekarte', 'hawaii']) ja(P.TYPEN.includes(t), 'TYPEN fehlt ' + t);
    gleich(P.BUILTINS.slice().sort(), ['Bote', 'Uhr', 'Mathe', 'Zufall', 'Spiegel', 'teig', 'bestelle', 'schieb', 'teile', 'zwischenstand'].sort(), 'BUILTINS');
    const kaese = P.BELAEGE.find(b => b.name === 'Käse');
    gleich(kaese, { name: 'Käse', preis: 1, nach: ['Tomate'] }, 'BELAEGE Käse');
    ja(P.BELAEGE.some(b => b.name === 'Ananas'), 'BELAEGE Ananas');
    gleich(P.BELAEGE.length, 24, 'Anzahl Beläge');
    gleich(P.ANANAS.length, 17, 'Anzahl Ananas');
    ja(P.ANANAS.includes('KeinStückAnanas') && P.ANANAS.includes('ZugeklapptAnanas'), 'ANANAS');
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
    const r = P.run('Pizza p = ((Tomate, Ananas));');
    gleich(r.exitCode, 39, 'Exit-Code');
    const pe = r.ereignisse.find(e => e.typ === 'panik');
    gleich(pe && pe.text, soll, 'Banner');
    gleich(r.ereignisse[r.ereignisse.length - 1].typ, 'ende');
    gleich(r.ereignisse[r.ereignisse.length - 2].typ, 'panik');
  });

  test('Ereignisse: onEvent, Form, Ende', () => {
    const gesehen = [];
    const r = P.run('Bote.sage((1)); Bote.fehler(("x")); Blech<salami> b = [1,2,3,4,5,6,7].schneide(7);', { onEvent: e => gesehen.push(e) });
    gleich(gesehen, r.ereignisse, 'onEvent = ereignisse');
    gleich(r.ereignisse[0], { typ: 'ausgabe', text: '1' });
    gleich(r.ereignisse[1], { typ: 'fehlerausgabe', text: 'x' });
    const w = r.ereignisse[2];
    gleich([w.typ, w.code, w.text, w.zeile], ['warnung', 'S0007', 'S0007: 7 Stücke? Wer schneidet eine Pizza in 7 Stücke?', 1]);
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
    const r = P.run('Bote.sage(("a"));\nPizza p = ((Tomate));\nsalami i = 0;\nsolange (i < 9) { teile(p); i++; }');
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

  test('Rekursion bis Tiefe 900 klappt', () => {
    const r = P.run('salami summe(salami n) { falls (n == 0) { serviere (0); } serviere ((n + summe(n - 1))); }\nBote.sage((summe(900)));');
    gleich(ausgabeText(r.ereignisse), '405450\n');
  });

  test('Determinismus: Zufall mit festem Seed', () => {
    const q = 'Blech<salami> b = []; für (salami i = 0; i < 20; i++) { b.hinzu(Zufall.zahl(1, 6)); } Bote.sage((b));';
    const a = ausgabeText(P.run(q).ereignisse), b = ausgabeText(P.run(q).ereignisse);
    gleich(a, b);
    ja(/^\[[1-6](, [1-6]){19}\]\n$/.test(a), a);
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
      const r = P.run(quelle, { args: b.args || [] });
      const probleme = [];
      const exitSoll = typeof b.exitCode === 'number' ? b.exitCode : 0;
      if (r.exitCode !== exitSoll) probleme.push('Exit-Code ' + r.exitCode + ', erwartet ' + exitSoll + fehlerZusammenfassung(r));
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
  for (const a of abschnitte) {
    (a.inhalt || []).forEach((item, i) => {
      if (!item || item.art !== 'code') return;
      const name = (a.id || '?') + '#' + i;
      if (!passt(name)) return;
      if (item.sprache === 'xml' || item.sprache === 'shell') { gruppe('doku').skip++; return; }
      const code = String(item.code || '');
      if (item.ausfuehrbar) {
        const r = P.run(code);
        const soll = typeof item.exitCode === 'number' ? item.exitCode : 0;
        let fehler = null;
        if (r.exitCode !== soll) fehler = 'Exit-Code ' + r.exitCode + ', erwartet ' + soll + fehlerZusammenfassung(r) + '\n' + grau(code.split('\n').map(z => '| ' + z).join('\n'));
        const naechstes = a.inhalt[i + 1];
        if (!fehler && naechstes && naechstes.art === 'ausgabe' && typeof naechstes.text === 'string') {
          if (norm(naechstes.text) !== norm(ausgabeText(r.ereignisse))) gruppe('doku').notiz.push(name + ': folgender ausgabe-Block weicht von der echten Ausgabe ab (nur Hinweis)');
        }
        ergebnis('doku', name, fehler);
      } else {
        const r = P.parse(code);
        ergebnis('doku', name + grau(' (nur parse)'), r.ok ? null : r.fehler.text + ' (Zeile ' + r.fehler.zeile + ', Spalte ' + r.fehler.spalte + ')\n' + grau(code.split('\n').map(z => '| ' + z).join('\n')));
      }
    });
  }
}

// ---------------------------------------------------------------------
const t0 = Date.now();
if (!nurGruppe || nurGruppe === 'faelle') faelle();
if (!nurGruppe || nurGruppe === 'api') api();
if (!nurGruppe || nurGruppe === 'beispiele') beispiele();
if (!nurGruppe || nurGruppe === 'doku') doku();

console.log(fett('\n═══ Zusammenfassung ═══'));
for (const [g, s] of Object.entries(stat)) {
  const zeile = '  ' + g.padEnd(10) + gruen(String(s.ok).padStart(4) + ' ok') + '  ' + (s.fehl ? rot(String(s.fehl).padStart(3) + ' fehlgeschlagen') : grau('  0 fehlgeschlagen')) + '  ' + grau(s.skip + ' übersprungen');
  console.log(zeile);
  for (const n of s.notiz) console.log(gelb('    Hinweis: ') + n);
}
console.log(grau('  Dauer: ' + (Date.now() - t0) + ' ms'));
if (gesamtFehl) { console.log(rot(fett('\n✗ ' + gesamtFehl + ' Test(s) fehlgeschlagen.'))); process.exitCode = 1; }
else console.log(gruen(fett('\n✓ Alles gegessen.')));
