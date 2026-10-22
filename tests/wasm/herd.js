'use strict';
/*
 * Herd im Wasm-Pfad (Paket H4, HOST-ABI §2 Gruppe herd): von tests/wasm/run.js aufgerufen.
 *   - alle tests/faelle/herd-*: kompilieren ohne Fallback, Wasm (Einzelmodul + zweiteilig) == Interpreter bitgleich
 *     (inkl. szene/paket), dazu dieselben .erwartet/.herd-erwartet/.fehler/.exitcode/.warnungen wie der Interpreter
 *   - Sonderfälle: Kern fehlt, herdKern als Modul/Bytes, onHerd-Bytes, Importliste, Klone, Generik (künstliche Komponente)
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
    else if (e.typ === 'leeren') t += '«leeren»\n';
  }
  return t;
}
const jsonZeilen = (t) => String(t).replace(/\r\n/g, '\n').split('\n').filter(z => z.trim() !== '').map(z => JSON.parse(z));
function kanonisch(v) {
  if (Array.isArray(v)) return '[' + v.map(kanonisch).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + kanonisch(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const herdEv = (r) => r.ereignisse.filter(e => e.typ === 'herd').map(e => { const o = Object.assign({}, e); delete o.typ; return o; });
const ohneMotor = (r) => r.ereignisse.filter(e => e.typ !== 'motor');

/** tests/faelle/herd-* mit Optionen (.ereignisse → uiEreignisse, .optionen.json) */
function faelle() {
  const dir = path.join(ROOT, 'tests', 'faelle');
  return fs.readdirSync(dir).filter(f => f.startsWith('herd-') && f.endsWith('.pizza')).sort().map(f => {
    const b = path.join(dir, f.slice(0, -6));
    const lies = (e) => (fs.existsSync(b + e) ? fs.readFileSync(b + e, 'utf8') : null);
    const opt = lies('.optionen.json') ? JSON.parse(lies('.optionen.json')) : {};
    if (lies('.ereignisse') !== null) opt.uiEreignisse = jsonZeilen(lies('.ereignisse'));
    return { name: 'faelle/' + f, quelle: lies('.pizza'), opt, lies };
  });
}

/** zusätzliche Programme: Interpreter == Wasm */
const EXTRA = [
  ['Methodenreferenz, Identität, Textformen, Typprüfung', `Herd h = neu Herd("X");
Teil a = h.kreis(1, 2, 3, farbe: "tomate");
Rezept f = a.x;
Kreis k = a.kreis();
Bote.sage((f() + " " + (a.kreis() == k) + " " + k + " " + neu Bewegung() + " " + h + " " + Form.ebene() + " " + k.farbe()));
Bote.sage((a.kinder() + " " + h.kamera().raum() + " " + h.sonne().licht().art() + " " + h.kamera().kamera().sicht()));
probier { Teil t = k; } verbrannt (Ananas x) { Bote.sage((x.typ() + ": " + x.nachricht())); }
probier { Kreis t = a; } verbrannt (Ananas x) { Bote.sage((x.typ() + ": " + x.nachricht())); }
probier { a.gibtsNicht(); } verbrannt (Ananas x) { Bote.sage((x.typ() + ": " + x.nachricht())); }
probier { Bote.sage((Form.würfel())); } verbrannt (Ananas x) { Bote.sage((x.typ() + ": " + x.nachricht())); }
Bote.sage((Herd.farbe(12.5, 300, -1, a: 0.5) + " " + a.alsText() + " " + h.alsText()));`],
  ['Komponenten generisch: hole/setze, Setter verkettet, Listen, Teile als Felder', `Herd h = neu Herd();
Bildchen b1 = neu Bildchen(["ty", "yt"]);
Speisekarte<margherita, margherita> fk = neu Speisekarte<margherita, margherita>();
fk.lege("k", "wasser");
Bildchen b2 = neu Bildchen(["k"], farben: fk);
Teil t = h.bild(b1, 10, 10, groesse: 2);
Animation an = t.mit(neu Animation(bilder: [b1, b2], proSekunde: 4));
Bote.sage((an.bilder() + " " + an.setzeSchleife(nein).schleife() + " " + an.hole("proSekunde") + " " + t.bild().bildchen()));
Text tx = neu Text(inhalt: 42, ausrichtung: "mitte");
Bote.sage((tx.inhalt() + " " + tx.setze("farbe", "#abc").farbe() + " " + tx.teil() + " " + tx));
Teil g = h.gruppe(5, 5).mit(tx).teil();
Bote.sage((g.text().inhalt() + " " + g.ohne(tx) + " " + g.text() + " " + t.ohne("Animation") + " " + t.animation()));`],
  ['Fenster ohne Renderer: W0104 je Aufrufstelle, setzeTitel', `Herd h = neu Herd("A");
h.backe();
h.backe();
h.setzeTitel("B");
Bote.sage((h.titel() + " " + h.bildnummer()));`, {}],
  ['Küche: Herd-Objekte im Karton, Herd in einem Stück', `Herd h = neu Herd();
Teil t = h.kreis(1, 1, 1);
Blech<salami> b = [1, 2];
probier { b.brigade((x) -> t); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }
probier { b.brigade((x) -> t.x()); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }
probier { b.brigade((x) -> neu Kreis()); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }
probier { b.brigade((x) -> Herd.farbe(1, 2, 3)); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }`],
];

/** Kern-Instanzen mit künstlichem Schema-Eintrag (Generik-Beweis ohne Kern-Neubau): WebAssembly.Instance umhüllen */
function mitKuenstlichemSchema(fn) {
  const kern = new WebAssembly.Module(fs.readFileSync(path.join(ROOT, 'site', 'js', 'herd', 'kern.wasm')));
  const Orig = WebAssembly.Instance;
  function Huelle(m, imp) {
    const i = new Orig(m, imp);
    if (m !== kern) return i;
    const e = i.exports;
    const roh = (() => { let kap = 1 << 16; const p = e.puffer(kap); const n = e.schema_json(p, kap); return new TextDecoder().decode(new Uint8Array(e.memory.buffer, p, n)); })();
    const s = JSON.parse(roh);
    // „Probe“: Alias der Typnummer 8 mit eigenen Feldnamen – kein Code in Compiler, Laufzeit oder Interpreter kennt ihn
    s.komponenten.push({ name: 'Probe', nummer: 8, genus: 'f', raum: 'beide', braucht: [], system: true,
      felder: [{ nummer: 1, name: 'schub', typ: 'zahl', standard: 0, min: null, max: null }, { nummer: 7, name: 'wirbel', typ: 'zahl', standard: 0, min: null, max: null }] });
    const json = new TextEncoder().encode(JSON.stringify(s));
    const ex = Object.assign({}, e);
    ex.schema_json = (p, kap) => { if (json.length <= kap) new Uint8Array(e.memory.buffer).set(json, p); return json.length; };
    return { exports: ex };
  }
  WebAssembly.Instance = Huelle;
  try { return fn(kern); } finally { WebAssembly.Instance = Orig; }
}

function pruefe(pruefe1) {
  console.log('▶ herd (H4: Gruppe herd, Interpreter == Wasm)');
  for (const f of faelle()) {
    pruefe1('Herd ' + f.name, () => {
      const k = Z.kompiliere(f.quelle);
      if (!k.ok && k.nichtUnterstuetzt) throw new Error('Fallback: ' + JSON.stringify(k.nichtUnterstuetzt));
      const r = vergleiche(f);
      if (r.status !== 'gleich') throw new Error(r.status + ' ' + (r.grund || '') + (r.diffs ? '\n    ' + r.diffs.join('\n    ') : '') + (r.fehler || ''));
      // dieselben Testdateien wie der Interpreter
      const w = Z.fuehreAus(k.pkarton, Object.assign({}, f.opt));
      const soll = (e) => f.lies(e);
      if (soll('.erwartet') !== null && norm(soll('.erwartet')) !== norm(ausgabeText(w.ereignisse))) throw new Error('.erwartet weicht ab');
      if (soll('.herd-erwartet') !== null && jsonZeilen(soll('.herd-erwartet')).map(kanonisch).join('\n') !== herdEv(w).map(kanonisch).join('\n')) throw new Error('.herd-erwartet weicht ab');
      if (soll('.fehler') !== null && norm(soll('.fehler')) !== norm(w.ereignisse.filter(e => e.typ === 'fehler').map(e => e.text).join('\n'))) throw new Error('.fehler weicht ab');
      if (w.exitCode !== (soll('.exitcode') ? parseInt(soll('.exitcode'), 10) : 0)) throw new Error('Exit ' + w.exitCode);
      if (soll('.warnungen') !== null && norm(soll('.warnungen')) !== w.ereignisse.filter(e => e.typ === 'warnung').map(e => e.text).join('\n')) throw new Error('.warnungen weichen ab');
    });
  }
  for (const [name, quelle, opt] of EXTRA) {
    pruefe1('Herd extra: ' + name, () => {
      const r = vergleiche({ name, quelle, opt: opt || { uiEreignisse: [{ typ: 'takt' }] } });
      if (r.status !== 'gleich') throw new Error(r.status + ' ' + (r.grund || '') + (r.diffs ? '\n    ' + r.diffs.join('\n    ') : '') + (r.fehler || ''));
    });
  }
  const q = 'Bote.sage(("vorher"));\nHerd h = neu Herd("T", breite: 64, hoehe: 64);\nTeil k = h.kreis(10, 10, 5);\nh.backe(() -> { k.verschiebe(1, 0); });\nBote.sage((k.x()));';
  const takte = () => ({ uiEreignisse: [{ typ: 'takt' }, { typ: 'takt', anzahl: 2 }] });
  pruefe1('Herd: Kern fehlt → derselbe HOST-Fehler wie im Interpreter, Exit 2, 0 Schritte', () => {
    for (const hk of [new Uint8Array([0, 1, 2]), new WebAssembly.Module(fs.readFileSync(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'laufzeit.wasm')))]) {
      const a = P.run(q, { herdKern: hk });
      for (const w of [Z.run(q, { herdKern: hk, motor: 'wasm' }), Z.fuehreAus(Z.kompiliere(q).pkarton, { herdKern: hk })]) {
        if (JSON.stringify(ohneMotor(w)) !== JSON.stringify(ohneMotor(a))) throw new Error(JSON.stringify(ohneMotor(w)) + ' ≠ ' + JSON.stringify(ohneMotor(a)));
        if (w.exitCode !== 2 || w.schritte !== 0) throw new Error('Exit/Schritte ' + w.exitCode + '/' + w.schritte);
      }
    }
    const ohne = Z.run('Bote.sage(("ok"));', { herdKern: new Uint8Array([0, 1, 2]), motor: 'wasm' });
    if (ohne.exitCode !== 0) throw new Error('Programme ohne Herd brauchen den Kern nicht');
  });
  pruefe1('Herd: herdKern als Modul/Bytes, onHerd mit Bytes (gleich wie Interpreter), Ereignisse ohne Bytes', () => {
    const bytes = fs.readFileSync(path.join(ROOT, 'site', 'js', 'herd', 'kern.wasm'));
    const basis = Z.run(q, Object.assign(takte(), { motor: 'wasm' }));
    for (const hk of [new WebAssembly.Module(bytes), new Uint8Array(bytes)]) {
      const r = Z.run(q, Object.assign(takte(), { motor: 'wasm', herdKern: hk }));
      if (JSON.stringify(r.ereignisse) !== JSON.stringify(basis.ereignisse)) throw new Error('herdKern ' + hk.constructor.name);
    }
    const an = [], ai = [];
    Z.run(q, Object.assign(takte(), { motor: 'wasm', onHerd: (art, d) => an.push([art, d]) }));
    P.run(q, Object.assign(takte(), { onHerd: (art, d) => ai.push([art, d]) }));
    if (an.map(x => x[0]).join() !== 'fenster,bild,bild') throw new Error('Arten ' + an.map(x => x[0]).join());
    if (an.length !== ai.length) throw new Error('Anzahl onHerd');
    for (let i = 0; i < an.length; i++) {
      const [x, y] = [an[i][1], ai[i][1]];
      if (Object.keys(x).join() !== Object.keys(y).join()) throw new Error('Felder ' + Object.keys(x) + ' / ' + Object.keys(y));
      if (x.bytes && (!(x.bytes instanceof Uint8Array) || Buffer.compare(Buffer.from(x.bytes), Buffer.from(y.bytes)) !== 0)) throw new Error('Bildpaket-Bytes weichen ab');
    }
    if (String.fromCharCode(...an[1][1].bytes.slice(0, 4)) !== 'HZP1') throw new Error('Paketkopf');
    if (basis.ereignisse.some(e => e.bytes !== undefined)) throw new Error('Bytes in Ereignissen');
  });
  pruefe1('Herd: Importliste – Modul „herd“ nur Kern-Exporte, pizza.herd_*, Gruppe in der Custom Section; ohne Herd keine', () => {
    const imp = WebAssembly.Module.imports(new WebAssembly.Module(Z.kompiliere(q).pkarton));
    const kern = new Set(WebAssembly.Module.exports(new WebAssembly.Module(fs.readFileSync(path.join(ROOT, 'site', 'js', 'herd', 'kern.wasm')))).map(e => e.name));
    const herd = imp.filter(i => i.module === 'herd');
    if (!herd.length || herd.some(i => !kern.has(i.name) || i.kind !== 'function')) throw new Error('herd.* ' + herd.map(i => i.name));
    const ph = imp.filter(i => i.module === 'pizza' && i.name.startsWith('herd_')).map(i => i.name).sort().join();
    if (ph !== 'herd_kern,herd_lies,herd_schreibe,herd_senden,herd_warte') throw new Error('pizza.herd_* ' + ph);
    if (imp.some(i => i.name === 'ui_senden')) throw new Error('theke-Importe');
    const ohne = WebAssembly.Module.imports(new WebAssembly.Module(Z.kompiliere('Bote.sage((1));').pkarton));
    if (ohne.some(i => i.module === 'herd' || i.name.startsWith('herd_'))) throw new Error('Programm ohne Herd importiert herd');
    const ir = Z.kompiliere(q, { mitIR: true }).ir;
    if (!ir.gruppen.includes('herd') || ir.herdNoetig !== true) throw new Error('IR ' + JSON.stringify(ir.gruppen));
    if (!Z.faehigkeiten.importgruppen.includes('herd') || !Z.faehigkeiten.laufOptionen.includes('herdKern')) throw new Error('faehigkeiten');
  });
  pruefe1('Herd: neue Komponente nur im Schema (künstliche „Probe“) – ohne Code in Compiler/Laufzeit, beide Motoren gleich', () => {
    const quelle = 'Herd h = neu Herd();\nTeil t = h.gruppe(10, 10);\nProbe p = t.mit(neu Probe(schub: 60));\np.setzeWirbel(90);\nh.backe(() -> { });\nBote.sage((p + " " + p.schub() + " " + t.probe().wirbel() + " " + t.x() + " " + t.drehung() + " " + p.hole("schub")));\nprobier { p.setze("dicke", 1); } verbrannt (Ananas a) { Bote.sage((a.nachricht())); }';
    mitKuenstlichemSchema((kern) => {
      const opt = () => ({ uiEreignisse: [{ typ: 'takt', anzahl: 2 }], herdKern: kern });
      const a = P.run(quelle, opt());
      const w = Z.run(quelle, Object.assign(opt(), { motor: 'wasm' }));
      const e = Z.fuehreAus(Z.kompiliere(quelle).pkarton, opt());
      if (ausgabeText(a.ereignisse) !== 'Probe(3) 60 90 12 3 60\nBewegung hat kein Feld \'dicke\'.\n') throw new Error('Interpreter: ' + JSON.stringify(ausgabeText(a.ereignisse)) + JSON.stringify(a.ereignisse.filter(x => x.typ === 'fehler')));
      for (const r of [w, e]) if (JSON.stringify(ohneMotor(r)) !== JSON.stringify(ohneMotor(a))) throw new Error('Wasm ≠ Interpreter: ' + JSON.stringify(ohneMotor(r)).slice(0, 400));
    });
  });
  pruefe1('Herd: Klone (Küchenbrigade) rufen nie Herd-Importe (dort Trap) – KüchenAnanas wie im Interpreter', () => {
    const { fuehreMitKlonen } = require('./klon-host.js');
    const quelle = 'Herd h = neu Herd();\nTeil t = h.kreis(1, 1, 1);\nKreis k = t.kreis();\nBlech<salami> b = [1, 2, 3];\n' +
      'Bote.sage((b.brigade((x) -> x * 2)));\n' +
      'probier { b.brigade((x) -> t.x()); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }\n' +
      'probier { b.brigade((x) -> neu Kreis()); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }\n' +
      'probier { b.brigade((x) -> k.radius()); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }\n' +
      'probier { b.brigade((x) -> Form.wuerfel()); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }\n' +
      'b.brigade((x) -> { Bote.sage((k + " " + t)); });';
    const a = P.run(quelle, {});
    const pk = new WebAssembly.Module(Z.kompiliere(quelle).pkarton);
    for (const s of ['vor', 'je']) {
      const r = fuehreMitKlonen(pk, {}, s);
      if (!r.stats.klone) throw new Error('keine Klone');
      if (JSON.stringify(r.ereignisse) !== JSON.stringify(a.ereignisse)) throw new Error(s + ': ' + JSON.stringify(r.ereignisse).slice(0, 500) + '\n    I: ' + JSON.stringify(a.ereignisse).slice(0, 500));
    }
  });
}

module.exports = { pruefe, faelle, EXTRA };
