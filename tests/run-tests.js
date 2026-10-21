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

function uiVergleich(soll, ereignisse) {
  const ist = ereignisse.filter(e => e.typ === 'ui').map(e => e.nachricht);
  const a = soll.map(kanonisch).join('\n'), b = ist.map(kanonisch).join('\n');
  if (a === b) return null;
  return 'ui-Nachrichten weichen ab:\n' + diff(soll.map(x => JSON.stringify(x)).join('\n'), ist.map(x => JSON.stringify(x)).join('\n'));
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
    const ereignisDatei = lies('.ereignisse');
    if (ereignisDatei !== null) opt.uiEreignisse = jsonZeilen(ereignisDatei, basis + '.ereignisse');
    const uiErwartet = lies('.ui-erwartet');
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
    if (uiErwartet !== null) {
      const u = uiVergleich(jsonZeilen(uiErwartet, basis + '.ui-erwartet'), r.ereignisse);
      if (u) probleme.push(u);
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
    gleich(P.BUILTINS.slice().sort(), ['Bote', 'Bestellannahme', 'Uhr', 'Mathe', 'Zufall', 'Spiegel', 'teig', 'bestelle', 'schieb', 'teile', 'zwischenstand'].sort(), 'BUILTINS');
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
      'belag B auf Pizza { salami t(salami n) { serviere ((dies.t(n + 1))); } }\n((B)).t(0);',
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
    ja(!/\bprocess\b|\brequire\(/.test(code.replace(/typeof module[^;]*module\.exports/g, '')), 'pizza.js referenziert process/require');
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
      ['Pizza p = ((Tomate, Käse));', 2],
      ['Uhr.vorspulen(1h);', 4],
      ['klasse K { salami x = 5; }\nK k = neu K();', 3],
      ['solange (nein) { }', 2],
      ['Rezept r = x -> x + 1;\nr(1);', 2 + 3 + 3]
    ];
    for (const [q, n] of faelle) gleich(P.run(q).schritte, n, 'Schritte für ' + JSON.stringify(q));
    const r = P.run('Uhr.vorspulen(1h);');
    gleich(r.zeitMs, 3600000 + 4, 'zeitMs');
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
      const opt = { args: b.args || [] };
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
      if (evText === undefined || uiText === undefined) { uebersprungen('beispiele', name, 'Theke-Datei aus dem Manifest fehlt'); continue; }
      if (evText !== null) opt.uiEreignisse = jsonZeilen(evText, name + '.ereignisse');
      const r = P.run(quelle, opt);
      const probleme = [];
      const exitSoll = typeof b.exitCode === 'number' ? b.exitCode : 0;
      if (r.exitCode !== exitSoll) probleme.push('Exit-Code ' + r.exitCode + ', erwartet ' + exitSoll + fehlerZusammenfassung(r));
      if (uiText !== null) { const u = uiVergleich(jsonZeilen(uiText, name + '.ui-erwartet'), r.ereignisse); if (u) probleme.push(u); }
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
      if (item.ausfuehrbar) {
        const opt = {};
        if (Array.isArray(item.eingabe)) opt.eingabe = item.eingabe;
        if (Array.isArray(item.uiEreignisse)) opt.uiEreignisse = item.uiEreignisse;
        const r = P.run(code, opt);
        const soll = typeof item.exitCode === 'number' ? item.exitCode : 0;
        let fehler = null;
        if (r.exitCode !== soll) fehler = 'Exit-Code ' + r.exitCode + ', erwartet ' + soll + fehlerZusammenfassung(r) + '\n' + grau(code.split('\n').map(z => '| ' + z).join('\n'));
        if (!fehler && Array.isArray(item.uiErwartet)) fehler = uiVergleich(item.uiErwartet, r.ereignisse);
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
