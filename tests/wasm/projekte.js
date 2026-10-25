'use strict';
/*
 * Projekte im Wasm-Pfad (PROJEKTE.md PA2, HOST-ABI v2, SPEC §2, §11.2, §18.5): von tests/wasm/run.js aufgerufen.
 *   - ABI v2: abi_version() = 2, Custom Section (abi, projekt), Ladefehler für ABI 1 im JS-Host
 *   - Mehrdatei-Programme: Feld datei in allen Ereignissen, Ananas-Ortstext, Positionstabelle mit Datei-Index (Einzelmodul und
 *     zweiteiliger Schnellpfad gleich); Kiste nur im Modul, wenn das Programm sie nennt
 *   - Kiste (Datensegment, memory.init) und Bildchen.laden (Teigling → Kern): Erwartungen aus SPEC §11.2/§18.5 – dazu bitgleich
 *     zum Interpreter (PD2)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const Z = require(path.join(ROOT, 'site', 'js', 'pizzaiolo.js'));
const P = require(path.join(ROOT, 'site', 'js', 'pizza.js'));
const K = require(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'kodierer.js'));
const V = require(path.join(ROOT, 'site', 'js', 'herd', 'teigling.js'));
const H = require(path.join(ROOT, 'pruefstand', 'lib', 'projekt-helfer.js'));

const ohne = (r) => r.ereignisse.filter(e => e.typ !== 'motor');
const aus = (r) => ohne(r).filter(e => e.typ === 'ausgabe').map(e => e.text);
const fehlerEv = (r) => ohne(r).find(e => e.typ === 'fehler');
const j = JSON.stringify;
/** Einzelmodul (.pkarton) und zweiteiliger Schnellpfad müssen gleich sein; liefert das Ergebnis des Einzelmoduls */
function beide(q, opt) {
  const k = Z.kompiliere(q, opt || {});
  if (!k.ok) throw new Error('kompiliere: ' + j(k.fehler || k.nichtUnterstuetzt));
  const a = Z.fuehreAus(k.pkarton, Object.assign({}, opt));
  const b = Z.run(q, Object.assign({ motor: 'wasm' }, opt));
  if (j(ohne(a)) !== j(ohne(b)) || a.schritte !== b.schritte) throw new Error('Einzelmodul ≠ zweiteilig:\n    ' + j(ohne(a)).slice(0, 600) + '\n    ' + j(ohne(b)).slice(0, 600));
  a.pkarton = k.pkarton;
  // Interpreter (Referenz, seit PD2 mit Kiste und Bildchen.laden): bitgleich
  const i = P.run(q, Object.assign({}, opt));
  if (j(ohne(i)) !== j(ohne(a)) || i.schritte !== a.schritte || i.zeitMs !== a.zeitMs) throw new Error('Interpreter ≠ Wasm:\n    I: ' + j(ohne(i)).slice(0, 600) + '\n    W: ' + j(ohne(a)).slice(0, 600));
  return a;
}
function sektionen(bytes) { return K.leseModul(bytes).sections; }
function meta(bytes) {
  for (const s of sektionen(bytes)) {
    if (s.id !== 0) continue;
    const l = new K.Leser(s.bytes, 0);
    if (l.name() === 'pizzaiolo') return JSON.parse(new TextDecoder().decode(s.bytes.subarray(l.i)));
  }
  return null;
}

function pruefe(pruefeFall) {
  console.log('▶ projekte (PA2: ABI v2, Mehrdatei, Kiste, Bildchen.laden)');
  // ---------------------------------------------------------------- ABI v2
  pruefeFall('abi_version() = 2, Custom Section abi 2 + projekt', () => {
    const k = Z.kompiliere({ dateien: { 'hauptgang.pizza': 'bestellt "a.pizza";\nBote.sage((A));', 'a.pizza': 'salami A = 1;', 'pizza.json': '{"pizza":1,"name":"Teigball"}' } });
    if (!k.ok) throw new Error(j(k));
    const inst = new WebAssembly.Instance(new WebAssembly.Module(k.pkarton), { pizza: new Proxy({}, { get: () => () => 0 }) });
    const m = meta(k.pkarton);
    if (inst.exports.abi_version() !== 2 || Z.faehigkeiten.abi !== 2 || Z.projekte !== true) throw new Error('abi ' + inst.exports.abi_version());
    if (m.abi !== 2 || j(m.projekt) !== j({ name: 'Teigball', dateien: 2 })) throw new Error(j(m));
  });
  pruefeFall('JS-Host lehnt ABI 1 ab (HOST-ABI §4)', () => {
    const b = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 127, 3, 3, 2, 0, 0, 5, 3, 1, 0, 1,
      7, 32, 3, 11, 97, 98, 105, 95, 118, 101, 114, 115, 105, 111, 110, 0, 0, 5, 115, 116, 97, 114, 116, 0, 1, 6, 109, 101, 109, 111, 114, 121, 2, 0,
      10, 11, 2, 4, 0, 65, 1, 11, 4, 0, 65, 0, 11]);
    const r = Z.fuehreAus(b);
    const f = fehlerEv(r);
    if (r.exitCode !== 2 || !f || f.text !== 'PizzaFehler HOST: Dieses Programm wurde für eine andere pizza-Version gebaut (ABI 1, dieser Host kennt 2).' || f.datei !== null) throw new Error(j(r.ereignisse));
  });
  // ---------------------------------------------------------------- Mehrdatei
  const projekt = {
    dateien: {
      'hauptgang.pizza': 'bestellt "welt/ofen.pizza";\nbestellt "welt/ofen.pizza";\nheize(1);\nheize(5);',
      'welt/ofen.pizza': 'leer heize(salami n) {\n    salami a = 1; salami A = 2;\n    falls (n > 2) { wirf neu LaufzeitAnanas("heiß"); }\n}\n',
    },
  };
  pruefeFall('Mehrdatei: datei an Warnungen/Fehlern, Ortstext in der Nebendatei, keine Kiste im Modul', () => {
    const r = beide(projekt);
    const ev = ohne(r);
    const w = ev.filter(e => e.typ === 'warnung').map(e => [e.code, e.datei, e.zeile]);
    if (j(w) !== j([['W0004', 'hauptgang.pizza', 2], ['W0032', 'welt/ofen.pizza', 2]])) throw new Error(j(w));
    const f = fehlerEv(r);
    if (f.datei !== 'welt/ofen.pizza' || f.zeile !== 3 || f.text !== 'Ungefangene Ananas – LaufzeitAnanas: heiß (welt/ofen.pizza, Zeile 3)') throw new Error(j(f));
    if (sektionen(r.pkarton).some(s => s.id === 12)) throw new Error('Datensegment ohne Kiste-Nutzung');
  });
  pruefeFall('Ein-Datei-Programme: datei null, Ananas-Text wie bisher', () => {
    const r = beide('salami a = 1; salami A = 2;\nwirf neu StreitAnanas("x");');
    const ev = ohne(r).filter(e => e.typ === 'warnung' || e.typ === 'fehler');
    if (ev.some(e => e.datei !== null || !('datei' in e)) || fehlerEv(r).text !== 'Ungefangene Ananas – StreitAnanas: x (Zeile 2)') throw new Error(j(ev));
  });
  pruefeFall('Ladefehler (P0019) → kompiliere liefert fehler wie der Lader', () => {
    const k = Z.kompiliere({ dateien: { 'hauptgang.pizza': 'bestellt "a.pizza";\nb();', 'a.pizza': 'bestellt "b.pizza";', 'b.pizza': 'leer b() { }' } });
    if (k.ok || !k.fehler || k.fehler.code !== 'P0019' || k.fehler.datei !== 'hauptgang.pizza') throw new Error(j(k));
  });
  pruefeFall('Standard-Argumente aus pizza.json (Host ohne Argumente) – Host-Argumente haben Vorrang', () => {
    const q = { dateien: { 'hauptgang.pizza': 'leer hauptgang(Blech<margherita> args) { Bote.sage((args)); }', 'pizza.json': '{"pizza":1,"args":["a","b c"]}' } };
    const k = Z.kompiliere(q);
    if (j(aus(Z.fuehreAus(k.pkarton))) !== j(['[a, b c]']) || j(aus(Z.fuehreAus(k.pkarton, { args: ['x'] }))) !== j(['[x]'])) throw new Error('args');
  });
  // ---------------------------------------------------------------- Kiste (SPEC §11.2)
  const kiste = {
    dateien: {
      'hauptgang.pizza': [
        'Bote.sage((Kiste.text("daten/level-1.txt")));',
        'Bote.sage((Kiste.zeilen("daten/level-1.txt")));',
        'Bote.sage((Kiste.zeilen("daten/leer.txt").länge()));',
        'Bote.sage((Kiste.gibts("daten/level-1.txt") + " " + Kiste.gibts("daten") + " " + Kiste.gibts("Daten/X.txt") + " " + Kiste.gibts("pruefung/x.txt")));',
        'Bote.sage((Kiste.liste()));',
        'Bote.sage((Kiste.liste("daten")));',
        'Bote.sage((Kiste.liste("daten/") + " " + Kiste.liste("gibt-es-nicht") + " " + Kiste.liste("Daten")));',
        'Bote.sage((Kiste.text("pizza.json").länge()));',
        'Blech<margherita> z = ["daten/level-1.txt", "daten/zwei.csv"].brigade(p -> Kiste.text(p));',
        'Bote.sage((z));',
        'probier { Kiste.text(5); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }',
        'probier { Kiste.zeilen(); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }',
        'probier { Kiste.liste(ja); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }',
        'probier { Kiste.text("fehlt.txt"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }',
        'probier { Kiste.text("bilder/tisch.png"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }',
        'Bote.sage((Kiste.text("hauptgang.pizza").länge() > 100));',
      ].join('\n'),
      'daten/level-1.txt': 'a\r\nbb\n\n',
      'daten/leer.txt': '',
      'daten/zwei.csv': 'x;y',
      'bilder/tisch.png': H.KLEIN,
      'pizza.json': '{"pizza":1}',
      'pruefung/x.txt': 'nicht in der Kiste',
    },
  };
  pruefeFall('Kiste: text/zeilen/gibts/liste, Fehlertexte, brigade (Datensegment)', () => {
    const r = beide(kiste);
    const soll = ['a\nbb\n\n', '[a, bb, ]', '0', 'ja nein nein nein',
      '[bilder/tisch.png, daten/leer.txt, daten/level-1.txt, daten/zwei.csv, hauptgang.pizza, pizza.json]',
      '[daten/leer.txt, daten/level-1.txt, daten/zwei.csv]', '[] [] []', '11', '[a\nbb\n\n, x;y]',
      'Kiste.text() braucht einen Text für \'pfad\', nicht 5.', 'Kiste.zeilen() braucht einen Text für \'pfad\', nicht karton.',
      'Kiste.liste() braucht einen Text für \'ordner\', nicht ja.', 'Die Datei "fehlt.txt" liegt nicht in der Kiste.',
      'bilder/tisch.png ist kein Text.', 'ja'];
    if (r.exitCode !== 0 || j(aus(r)) !== j(soll)) throw new Error(j(ohne(r)).slice(0, 1500));
    if (!sektionen(r.pkarton).some(s => s.id === 12)) throw new Error('kein DataCount für memory.init');
  });
  pruefeFall('Kiste: eigene Klasse Kiste hat Vorrang', () => {
    const r = beide('klasse Kiste { tiefkühl margherita text(margherita p) { serviere (("eigen " + p)); } }\nBote.sage((Kiste.text("x")));');
    if (j(aus(r)) !== j(['eigen x'])) throw new Error(j(ohne(r)));
  });
  pruefeFall('Kiste: gleiche Sammlung → byte-gleiches .pkarton', () => {
    const a = Z.kompiliere(kiste), b = Z.kompiliere({ dateien: Object.assign({}, kiste.dateien) });
    if (!a.ok || Buffer.compare(Buffer.from(a.pkarton), Buffer.from(b.pkarton)) !== 0) throw new Error('nicht deterministisch');
  });
  // ---------------------------------------------------------------- Bildchen.laden (SPEC §18.5)
  const blau = H.png(5, 3, [0, 0, 255, 255]);
  const bild = {
    dateien: {
      'hauptgang.pizza': [
        'probier { Bildchen.laden("bilder/a.png"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }',
        'probier { Bildchen.laden(3); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }',
        'Herd h = neu Herd("Bilder", breite: 64, hoehe: 64);',
        'Bildchen a = Bildchen.laden("bilder/a.png");',
        'Bote.sage((a + " " + a.breite() + "x" + a.hoehe()));',
        'Bote.sage((a == Bildchen.laden("bilder/a.png")));',
        'Bote.sage((a == Bildchen.laden("bilder/kopie.png")));',
        'Bote.sage((Bildchen.laden("bilder/klein.png")));',
        'probier { Bildchen.laden("bilder/fehlt.png"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }',
        'probier { Bildchen.laden("bilder/kaputt.png"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }',
        'probier { Bildchen.laden("bilder/riesig.png"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }',
        'probier { Bildchen.laden("daten/notiz.txt"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }',
        'h.bild(a, 10, 10);',
        'probier { Blech<salami> x = [1].brigade(i -> Bildchen.laden("bilder/a.png").breite()); } verbrannt (KüchenAnanas k) { Bote.sage((k.nachricht())); }',
      ].join('\n'),
      'bilder/a.png': blau, 'bilder/kopie.png': blau, 'bilder/klein.png': H.KLEIN,
      'bilder/kaputt.png': H.KAPUTT, 'bilder/riesig.png': H.pngKopf(2400, 800), 'daten/notiz.txt': 'hallo',
    },
  };
  pruefeFall('Bildchen.laden: Teigling aus dem Datensegment, gleicher Pfad = dasselbe Bildchen, Fehlertexte', () => {
    const r = beide(bild);
    const soll = ['Erst braucht es einen Herd (neu Herd(…)).', 'Bildchen.laden() braucht einen Text für \'pfad\', nicht 3.',
      'Bildchen(5×3) 5x3', 'ja', 'nein', 'Bildchen(2×3)', 'Die Datei "bilder/fehlt.png" liegt nicht in der Kiste.',
      'bilder/kaputt.png ist kein lesbares Bild (PNG oder JPEG).', 'bilder/riesig.png ist zu groß (2400 × 800) – höchstens 2048 × 2048 Pixel.',
      'daten/notiz.txt ist kein lesbares Bild (PNG oder JPEG).', 'Den Herd gibt es nur in der Hauptküche.'];
    if (r.exitCode !== 0 || j(aus(r)) !== j(soll)) throw new Error(j(ohne(r)).slice(0, 1500));
    if (!(meta(r.pkarton).gruppen || []).includes('herd')) throw new Error('Gruppe herd fehlt');
  });
  pruefeFall('Bildchen.laden: veralteter Teigling-Cache ändert nichts, gleiche Bilder nur einmal im Modul', () => {
    const vb = V.node();
    const falsch = vb.vorbacken(H.KLEIN);   // passt nicht zur Quelle von bilder/a.png → wird neu vorgebacken
    const k1 = Z.kompiliere(bild), k2 = Z.kompiliere(bild, { teiglinge: { 'bilder/a.png': falsch, 'bilder/klein.png': vb.vorbacken(H.KLEIN) } });
    if (Buffer.compare(Buffer.from(k1.pkarton), Buffer.from(k2.pkarton)) !== 0) throw new Error('Cache ändert das Modul');
    const ohneKopie = { dateien: Object.assign({}, bild.dateien) };
    delete ohneKopie.dateien['bilder/kopie.png'];
    const k3 = Z.kompiliere(ohneKopie);
    const pfad = ('bilder/kopie.png').length + 16 + 16;   // Text-Objekt des Pfads + Tabelleneintrag – der Teigling selbst nicht doppelt
    if (k1.pkarton.length - k3.pkarton.length > pfad + 64) throw new Error('Teigling doppelt eingebettet: ' + (k1.pkarton.length - k3.pkarton.length));
  });
  pruefeFall('Bildchen: Teigmenge > 64 MiB → P0020 vor dem Start; Vorbacker fehlt → HOST', () => {
    const q = { dateien: { 'hauptgang.pizza': 'Bote.sage(("nie"));', 'a.png': H.gross([1, 2, 3, 255]), 'b.png': H.gross([3, 2, 1, 255]), 'c.png': H.gross([2, 3, 1, 255]) } };
    const r = beide(q);
    const f = fehlerEv(r);
    if (r.exitCode !== 2 || r.schritte !== 0 || f.code !== 'P0020' || f.datei !== null
      || f.text !== 'PizzaFehler P0020: Die Bilder sind zusammen zu groß für den Ofen (64,1 MB vorgebacken, höchstens 64 MB).') throw new Error(j(ohne(r)));
    const k = Z.kompiliere({ dateien: { 'hauptgang.pizza': 'Bote.sage((1));', 'a.png': H.KLEIN } }, { vorbacker: new Uint8Array([1, 2, 3]) });
    if (k.ok || !k.fehler || k.fehler.text !== 'PizzaFehler HOST: Der Vorbacker fehlt (teigling.wasm).') throw new Error(j(k));
  });
  // ---------------------------------------------------------------- Modell.laden (H-K16, SPEC §18.5)
  const BSP = require(path.join(ROOT, 'scripts', 'beispiele.js'));
  const ordnerFall = (n) => ({ dateien: BSP.leseOrdner(path.join(ROOT, 'tests', 'faelle', n)) });
  const fallEv = (n) => fs.readFileSync(path.join(ROOT, 'tests', 'faelle', n, 'pruefung', 'ereignisse'), 'utf8').split(/\r?\n/).filter(Boolean).map(z => JSON.parse(z));
  pruefeFall('Modell.laden: .glb/.gltf als Modellteig im Datensegment, Teile je Knoten, Interpreter = Wasm (Ereignisse, Hashes)', () => {
    const r = beide(ordnerFall('herd-modell'), { uiEreignisse: fallEv('herd-modell') });
    const soll = fs.readFileSync(path.join(ROOT, 'tests', 'faelle', 'herd-modell', 'pruefung', 'erwartet'), 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean);
    if (r.exitCode !== 0 || j(aus(r)) !== j(soll)) throw new Error(j(ohne(r)).slice(0, 1500));
    if (!ohne(r).some(e => e.typ === 'herd' && e.art === 'bild')) throw new Error('kein Bild');
  });
  pruefeFall('Modell.laden: Fehlertexte aus dem Fehler-Modellteig in allen Motoren gleich', () => {
    const r = beide(ordnerFall('herd-modell-ananas'));
    const soll = fs.readFileSync(path.join(ROOT, 'tests', 'faelle', 'herd-modell-ananas', 'pruefung', 'erwartet'), 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean);
    if (r.exitCode !== 0 || j(aus(r)) !== j(soll)) throw new Error(j(ohne(r)).slice(0, 1500));
  });
  pruefeFall('Modell.laden: veralteter Modellteig-Cache ändert nichts; gleiche Sammlung → byte-gleiches .pkarton', () => {
    const q = ordnerFall('herd-modell'), vb = V.node();
    const falsch = vb.modellAusSammlung('modelle/farben.glb', q.dateien).teig;   // passt nicht zu hierarchie.glb
    const k1 = Z.kompiliere(q), k2 = Z.kompiliere(q, { teiglinge: { 'modelle/hierarchie.glb': falsch } });
    const k3 = Z.kompiliere({ dateien: Object.assign({}, q.dateien) });
    if (!k1.ok || Buffer.compare(Buffer.from(k1.pkarton), Buffer.from(k2.pkarton)) !== 0) throw new Error('Cache ändert das Modul');
    if (Buffer.compare(Buffer.from(k1.pkarton), Buffer.from(k3.pkarton)) !== 0) throw new Error('nicht deterministisch');
    const kv = Z.kompiliere(q, { teiglinge: { 'modelle/hierarchie.glb': vb.modellAusSammlung('modelle/hierarchie.glb', q.dateien).teig } });
    if (Buffer.compare(Buffer.from(k1.pkarton), Buffer.from(kv.pkarton)) !== 0) throw new Error('passender Cache ändert das Modul');
  });
  // ---------------------------------------------------------------- Klang.laden (H-K19a, SPEC §18.8, K-163)
  pruefeFall('Klang.laden: WAV/FLAC als Klangteig im Datensegment (Kiste-Art 4), Interpreter = Wasm (Ereignisse, PCM-Hashes, Fehlertexte)', () => {
    for (const n of ['klang-laden', 'klang-laden-ananas']) {
      const r = beide(ordnerFall(n));
      const lies = (d) => { const p = path.join(ROOT, 'tests', 'faelle', n, 'pruefung', d); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean) : []; };
      if (r.exitCode !== 0 || j(aus(r)) !== j(lies('erwartet'))) throw new Error(n + ': ' + j(ohne(r)).slice(0, 1500));
      const kl = ohne(r).filter(e => e.typ === 'klang').map(e => { const o = Object.assign({}, e); delete o.typ; return JSON.stringify(o); });
      if (j(kl) !== j(lies('klang-erwartet'))) throw new Error(n + ' klang: ' + j(kl));
      if (!(meta(r.pkarton).gruppen || []).includes('klang')) throw new Error('Gruppe klang fehlt');
    }
  });
  pruefeFall('Klang.laden: onKlang bekommt PCM mit Rate und Kanälen (Interpreter = Wasm), Ereignisse ohne Bytes', () => {
    const q = ordnerFall('klang-laden');
    const sammle = () => { const l = []; return { l, onKlang: (art, d) => { if (d.bytes) l.push([d.klang, d.rate, d.kanaele, d.bytes.length]); } }; };
    const a = sammle(), b = sammle();
    P.run(q, { onKlang: a.onKlang });
    Z.run(q, { motor: 'wasm', onKlang: b.onKlang });
    const soll = [['57d5faa45c58327d', 44100, 2], ['d7b0db04a298bc12', 22050, 1], ['1a12f026a967e302', 48000, 1], ['e48c0f06f78e3e02', 48000, 1]];
    if (j(a.l) !== j(b.l) || j(a.l.map(x => x.slice(0, 3))) !== j(soll)) throw new Error(j(a.l) + ' / ' + j(b.l));
  });
  pruefeFall('Klang.laden: Klangmenge > 64 MiB → P0021 vor dem Start (nach P0020), veralteter Klangteig-Cache ändert nichts', () => {
    const q = ordnerFall('klang-laden'), vb = V.node();
    // zwei (passende) Klangteige aus dem Cache mit je 34 000 000 PCM-Bytes – Kopf gültig, SHA-256 der Quelle stimmt
    const gross = (pfad) => {
      const echt = vb.klangVorbacken(q.dateien[pfad]);
      const frames = 8500000, t = new Uint8Array(64 + frames * 4);
      t.set(echt.subarray(0, 64));
      const dv = new DataView(t.buffer);
      dv.setUint32(48, 96000, true); dv.setUint16(52, 2, true); dv.setUint32(56, frames, true);
      return t;
    };
    const opt = { teiglinge: { 'klaenge/ton-mono.wav': gross('klaenge/ton-mono.wav'), 'klaenge/akkord-stereo.flac': gross('klaenge/akkord-stereo.flac') } };
    const k = Z.kompiliere(q, opt);
    const r = Z.fuehreAus(k.pkarton, {}), i = P.run(q, opt);
    for (const x of [r, i]) {
      const f = fehlerEv(x);
      if (x.exitCode !== 2 || f.code !== 'P0021' || f.datei !== null
        || f.text !== 'PizzaFehler P0021: Die Klänge sind zusammen zu groß für den Ofen (64,9 MB vorgebacken, höchstens 64 MB).') throw new Error(j(ohne(x)).slice(0, 800));
    }
    const falsch = vb.klangVorbacken(q.dateien['klaenge/klick-24.flac']);   // passt nicht zu ton-mono.wav → wird neu vorgebacken
    const k1 = Z.kompiliere(q), k2 = Z.kompiliere(q, { teiglinge: { 'klaenge/ton-mono.wav': falsch } });
    if (!k1.ok || Buffer.compare(Buffer.from(k1.pkarton), Buffer.from(k2.pkarton)) !== 0) throw new Error('Cache ändert das Modul');
  });
}

module.exports = { pruefe };
