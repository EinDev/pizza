'use strict';
/*
 * Klang im Wasm-Pfad (H-K14, K-153, HOST-ABI §2 Gruppe klang): von tests/wasm/run.js aufgerufen.
 *   - alle tests/faelle/klang-*: kompilieren ohne Fallback, Wasm (Einzelmodul + zweiteilig) == Interpreter bitgleich
 *     (inkl. PCM-Hashes), dazu dieselben .erwartet/.klang-erwartet/.herd-erwartet/.exitcode wie der Interpreter
 *   - Sonderfälle: Erzeuger fehlt, klangKern als Modul/Bytes, onKlang mit PCM (gleich wie Interpreter, vor dem Ereignis),
 *     Importliste, Klone (Küchenbrigade)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const P = require(path.join(ROOT, 'site', 'js', 'pizza.js'));
const Z = require(path.join(ROOT, 'site', 'js', 'pizzaiolo.js'));
const { vergleiche } = require('./vergleich.js');

const norm = (s) => String(s).replace(/\r\n/g, '\n').replace(/\n$/, '');
function ausgabeText(ev) {
  let t = '';
  for (const e of ev) {
    if (e.typ === 'ausgabe') t += e.umbruch === false ? e.text : e.text + '\n';
    else if (e.typ === 'fehlerausgabe' || e.typ === 'panik') t += e.text + '\n';
  }
  return t;
}
const jsonZeilen = (t) => String(t).replace(/\r\n/g, '\n').split('\n').filter(z => z.trim() !== '').map(z => JSON.parse(z));
function kanonisch(v) {
  if (Array.isArray(v)) return '[' + v.map(kanonisch).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + kanonisch(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const ev = (r, typ) => r.ereignisse.filter(e => e.typ === typ).map(e => { const o = Object.assign({}, e); delete o.typ; return o; });
const ohneMotor = (r) => r.ereignisse.filter(e => e.typ !== 'motor');
const KLANG = path.join(ROOT, 'site', 'js', 'herd', 'klang.wasm');

function faelle() {
  const dir = path.join(ROOT, 'tests', 'faelle');
  return fs.readdirSync(dir).filter(f => f.startsWith('klang-') && f.endsWith('.pizza')).sort().map(f => {
    const b = path.join(dir, f.slice(0, -6));
    const lies = (e) => (fs.existsSync(b + e) ? fs.readFileSync(b + e, 'utf8') : null);
    const opt = {};
    if (lies('.ereignisse') !== null) opt.uiEreignisse = jsonZeilen(lies('.ereignisse'));
    return { name: 'faelle/' + f, quelle: lies('.pizza'), opt, lies };
  });
}

function pruefe(pruefe1) {
  console.log('▶ klang (H-K14: Gruppe klang, Interpreter == Wasm)');
  for (const f of faelle()) {
    pruefe1('Klang ' + f.name, () => {
      const k = Z.kompiliere(f.quelle);
      if (!k.ok && k.nichtUnterstuetzt) throw new Error('Fallback: ' + JSON.stringify(k.nichtUnterstuetzt));
      const r = vergleiche(f);
      if (r.status !== 'gleich') throw new Error(r.status + ' ' + (r.grund || '') + (r.diffs ? '\n    ' + r.diffs.join('\n    ') : '') + (r.fehler || ''));
      const w = Z.fuehreAus(k.pkarton, Object.assign({}, f.opt));
      const soll = (e) => f.lies(e);
      if (soll('.erwartet') !== null && norm(soll('.erwartet')) !== norm(ausgabeText(w.ereignisse))) throw new Error('.erwartet weicht ab');
      for (const [datei, typ] of [['.klang-erwartet', 'klang'], ['.herd-erwartet', 'herd']]) {
        if (soll(datei) !== null && jsonZeilen(soll(datei)).map(kanonisch).join('\n') !== ev(w, typ).map(kanonisch).join('\n')) throw new Error(datei + ' weicht ab');
      }
      if (w.exitCode !== (soll('.exitcode') ? parseInt(soll('.exitcode'), 10) : 0)) throw new Error('Exit ' + w.exitCode);
    });
  }
  const q = 'Bote.sage(("vorher"));\nKlang k = Klang.ton(440, 0.1);\nSpur s = k.spiele(schleife: ja);\ns.setzeLage(1, 2, 3).stoppe();\nKlang.noten("C4 E4").spiele();';
  pruefe1('Klang: Erzeuger fehlt → derselbe HOST-Fehler wie im Interpreter, Exit 2, 0 Schritte', () => {
    for (const kk of [new Uint8Array([0, 1, 2]), new WebAssembly.Module(fs.readFileSync(path.join(ROOT, 'site', 'js', 'herd', 'kern.wasm')))]) {
      const a = P.run(q, { klangKern: kk });
      if (a.exitCode !== 2 || !a.ereignisse.some(e => e.typ === 'fehler' && e.text === 'PizzaFehler HOST: Der Klang-Erzeuger fehlt (klang.wasm).')) throw new Error('Interpreter: ' + JSON.stringify(a.ereignisse));
      for (const w of [Z.run(q, { klangKern: kk, motor: 'wasm' }), Z.fuehreAus(Z.kompiliere(q).pkarton, { klangKern: kk })]) {
        if (JSON.stringify(ohneMotor(w)) !== JSON.stringify(ohneMotor(a))) throw new Error(JSON.stringify(ohneMotor(w)) + ' ≠ ' + JSON.stringify(ohneMotor(a)));
        if (w.exitCode !== 2 || w.schritte !== 0) throw new Error('Exit/Schritte ' + w.exitCode + '/' + w.schritte);
      }
    }
    const ohne = Z.run('Bote.sage(("ok"));', { klangKern: new Uint8Array([0, 1, 2]), motor: 'wasm' });
    if (ohne.exitCode !== 0) throw new Error('Programme ohne Klang brauchen den Erzeuger nicht');
  });
  pruefe1('Klang: klangKern als Modul/Bytes, onKlang mit PCM vor dem Ereignis (gleich wie Interpreter), Ereignisse ohne Bytes', () => {
    const bytes = fs.readFileSync(KLANG);
    const basis = Z.run(q, { motor: 'wasm' });
    for (const kk of [new WebAssembly.Module(bytes), new Uint8Array(bytes)]) {
      const r = Z.run(q, { motor: 'wasm', klangKern: kk });
      if (JSON.stringify(r.ereignisse) !== JSON.stringify(basis.ereignisse)) throw new Error('klangKern ' + kk.constructor.name);
    }
    const an = [], ai = [];
    const wl = Z.run(q, { motor: 'wasm', onKlang: (art, d) => an.push([art, d]), onEvent: (e) => { if (e.typ === 'klang') an.push(['ereignis', e.art]); } });
    P.run(q, { onKlang: (art, d) => ai.push([art, d]), onEvent: (e) => { if (e.typ === 'klang') ai.push(['ereignis', e.art]); } });
    const arten = an.map(x => x[0] === 'ereignis' ? '>' + x[1] : x[0]).join();
    if (arten !== 'spiele,>spiele,setze,>setze,stoppe,>stoppe,spiele,>spiele') throw new Error('Reihenfolge ' + arten);
    if (ai.length !== an.length) throw new Error('Anzahl onKlang');
    for (let i = 0; i < an.length; i++) {
      const [x, y] = [an[i][1], ai[i][1]];
      if (an[i][0] === 'ereignis') continue;
      if (Object.keys(x).join() !== Object.keys(y).join()) throw new Error('Felder ' + Object.keys(x) + ' / ' + Object.keys(y));
      if ((x.bytes !== undefined) !== (an[i][0] === 'spiele')) throw new Error('PCM nur bei spiele');
      if (x.bytes && (!(x.bytes instanceof Uint8Array) || Buffer.compare(Buffer.from(x.bytes), Buffer.from(y.bytes)) !== 0)) throw new Error('PCM weicht ab');
    }
    if (an[0][1].bytes.length !== 4800 * 2) throw new Error('PCM-Länge ' + an[0][1].bytes.length);
    if (wl.ereignisse.some(e => e.bytes !== undefined)) throw new Error('Bytes in Ereignissen');
  });
  pruefe1('Klang: Importliste – Modul „klang“ nur Erzeuger-Exporte, pizza.klang_*, Gruppe in der Custom Section; ohne Klang keine', () => {
    const imp = WebAssembly.Module.imports(new WebAssembly.Module(Z.kompiliere(q).pkarton));
    const exp = new Set(WebAssembly.Module.exports(new WebAssembly.Module(fs.readFileSync(KLANG))).map(e => e.name));
    const kl = imp.filter(i => i.module === 'klang');
    if (!kl.length || kl.some(i => !exp.has(i.name) || i.kind !== 'function')) throw new Error('klang.* ' + kl.map(i => i.name));
    const pk = imp.filter(i => i.module === 'pizza' && i.name.startsWith('klang_')).map(i => i.name).sort().join();
    if (pk !== 'klang_kern,klang_lies,klang_schreibe,klang_senden') throw new Error('pizza.klang_* ' + pk);
    if (imp.some(i => i.module === 'herd')) throw new Error('herd-Importe ohne Herd');
    const ohne = WebAssembly.Module.imports(new WebAssembly.Module(Z.kompiliere('Bote.sage((1));').pkarton));
    if (ohne.some(i => i.module === 'klang' || i.name.startsWith('klang_'))) throw new Error('Programm ohne Klang importiert klang');
    const ir = Z.kompiliere(q, { mitIR: true }).ir;
    if (!ir.gruppen.includes('klang') || ir.klangNoetig !== true) throw new Error('IR ' + JSON.stringify(ir.gruppen));
    const eigen = Z.kompiliere('klasse Klang { tiefkühl salami ton() { serviere (1); } }\nBote.sage((Klang.ton()));', { mitIR: true }).ir;
    if (eigen.gruppen.includes('klang')) throw new Error('eigene Klasse Klang braucht keine Gruppe');
    if (!Z.faehigkeiten.importgruppen.includes('klang') || !Z.faehigkeiten.laufOptionen.includes('klangKern')) throw new Error('faehigkeiten');
  });
  pruefe1('Klang: Klone (Küchenbrigade) rufen nie Klang-Importe (dort Trap) – KüchenAnanas wie im Interpreter', () => {
    const { fuehreMitKlonen } = require('./klon-host.js');
    const quelle = 'Klang k = Klang.ton(440, 0.1);\nSpur s = k.spiele();\nBlech<salami> b = [1, 2, 3];\n' +
      'Bote.sage((b.brigade((x) -> x * 2)));\n' +
      'probier { b.brigade((x) -> Klang.ton(220, 0.1)); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }\n' +
      'probier { b.brigade((x) -> k.dauer()); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }\n' +
      'probier { b.brigade((x) -> s.laeuft()); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }\n' +
      'probier { b.brigade((x) -> k); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }\n' +
      'Bote.sage((k + " " + s));';
    const a = P.run(quelle);
    const k = Z.kompiliere(quelle);
    const w = fuehreMitKlonen(new WebAssembly.Module(k.pkarton), {});
    if (!w.stats.klone) throw new Error('keine Klone');
    if (JSON.stringify(ohneMotor(w)) !== JSON.stringify(ohneMotor(a))) throw new Error('Klone ≠ Interpreter: ' + JSON.stringify(ohneMotor(w)).slice(0, 600));
  });
}

module.exports = { pruefe };
