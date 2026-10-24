#!/usr/bin/env node
'use strict';
/*
 * Testsuite des Compilers pizzaiolo:  node tests/wasm/run.js  (npm run test:wasm)
 *   kodierer   – LEB128, Sections, handgebautes Modul
 *   ir         – IR-Struktur für den ganzen Korpus (IR.pruefe, JSON-Rundreise)
 *   laufzeit   – JS-identische Zahlformatierung der Rust-Laufzeit
 *   portabel   – Feature-Prüfung (nur MVP + bulk-memory + multi-value + mutable-globals + sign-ext + nontrapping-fptoint)
 *   e2e        – alle Beispiele, Doku-Blöcke und tests/wasm/faelle: Wasm == Interpreter (Ereignisse, Exit, Schritte, Uhr)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const K = require(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'kodierer.js'));
const IR = require(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'ir.js'));
const Z = require(path.join(ROOT, 'site', 'js', 'pizzaiolo.js'));
const P = require(path.join(ROOT, 'site', 'js', 'pizza.js'));
const F = require(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'frontend.js'));
const korpus = require('./korpus.js');
const { pruefePortabel } = require('./portabel.js');
const { vergleiche } = require('./vergleich.js');

let fehl = 0, ok = 0;
const pruefe = (name, fn) => {
  try { const r = fn(); if (r === false) throw new Error('fehlgeschlagen'); ok++; }
  catch (e) { fehl++; console.log('  ✗ ' + name + ': ' + (e && e.message)); }
};

function eigeneFaelle() {
  const dir = path.join(__dirname, 'faelle');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.pizza')).sort().map(f => {
    const quelle = fs.readFileSync(path.join(dir, f), 'utf8');
    const op = path.join(dir, f.replace(/\.pizza$/, '.optionen.json'));
    return { name: 'wasm/' + f, quelle, opt: fs.existsSync(op) ? JSON.parse(fs.readFileSync(op, 'utf8')) : {} };
  });
}

console.log('▶ kodierer');
pruefe('LEB128 u32/s32/s64', () => {
  const werte32 = [0, 1, 63, 64, 127, 128, 255, 624485, 2 ** 31 - 1, -1, -64, -65, -123456, -(2 ** 31)];
  for (const v of werte32) {
    const p = new K.Puffer(); p.s32(v); const l = new K.Leser(p.fertig(), 0);
    if (l.s32() !== v) throw new Error('s32 ' + v);
    if (v >= 0) { const q = new K.Puffer(); q.u32(v); if (new K.Leser(q.fertig(), 0).u32() !== v) throw new Error('u32 ' + v); }
  }
  for (const v of [0n, 1n, -1n, 2n ** 63n - 1n, -(2n ** 63n), 0xFFFC000000000000n - 2n ** 64n, 123456789012345n]) {
    const p = new K.Puffer(); p.s64(v);
    if (new K.Leser(p.fertig(), 0).s64() !== BigInt.asIntN(64, v)) throw new Error('s64 ' + v);
  }
});
pruefe('handgebautes Modul (add, multi-value, sign-ext)', () => {
  const typ = new K.Puffer(); typ.u32(1); typ.byte(0x60); typ.u32(2); typ.byte(0x7f); typ.byte(0x7f); typ.u32(2); typ.byte(0x7f); typ.byte(0x7f);
  const fn = new K.Puffer(); fn.u32(1); fn.u32(0);
  const ex = new K.Puffer(); ex.u32(1); ex.name('f'); ex.byte(0); ex.u32(0);
  const c = new K.Code(); c.get(0).get(1).op(K.OP.i32_add).get(0).op(0xc0).end();
  const body = c.bytes();
  const code = new K.Puffer(); code.u32(1); code.u32(body.length + 1); code.u32(0); code.bytes(body);
  const m = K.verbinde([new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]), K.section(1, typ.fertig()), K.section(3, fn.fertig()), K.section(7, ex.fertig()), K.section(10, code.fertig())]);
  const i = new WebAssembly.Instance(new WebAssembly.Module(m));
  const [s, b] = i.exports.f(40, 0x1ff);
  return s === 40 + 0x1ff && b === 40;
});
pruefe('Modul-Leser liest laufzeit.wasm', () => {
  const m = K.leseModul(fs.readFileSync(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'laufzeit.wasm')));
  return m.funktionen.length > 100 && m.export('rt_lauf') && m.export('memory');
});

pruefe('optionale Importgruppen (HOST-ABI §2)', () => {
  const imp = (q) => WebAssembly.Module.imports(new WebAssembly.Module(Z.kompiliere(q).pkarton)).map(i => i.name).sort().join(',');
  const basis = 'ausgabe,eingabe,fehler,fehlerausgabe,leeren,panik,schreibe,warnung';
  if (imp('Bote.sage((1));') !== basis) throw new Error('Basis: ' + imp('Bote.sage((1));'));
  if (imp('Vorratskammer v = neu Vorratskammer("a");') !== basis + ',vorrat_lesen,vorrat_schreiben'.split(',').sort().join(',').replace(/^/, '')
    && imp('Vorratskammer v = neu Vorratskammer("a");').split(',').sort().join(',') !== basis.split(',').concat(['vorrat_lesen', 'vorrat_schreiben']).sort().join(',')) throw new Error('Vorrat');
  const t = imp('Theke t = neu Theke("x"); t.zeige(neu Schild("a"));').split(',');
  if (!t.includes('ui_senden') || !t.includes('ui_warte') || t.includes('vorrat_lesen')) throw new Error('Theke: ' + t);
});

const faelle = korpus.alle().concat(eigeneFaelle());

console.log('▶ ir');
for (const f of faelle) {
  const p = P.parse(f.quelle);
  if (!p.ok) continue;
  const r = F.frontend(p.ast);
  if (!r.ok) continue;
  pruefe('IR ' + f.name, () => {
    const probleme = IR.pruefe(r.ir);
    if (probleme.length) throw new Error(probleme.slice(0, 3).join('; '));
    const roh = JSON.stringify(r.ir);
    return JSON.stringify(JSON.parse(roh)) === roh;
  });
}

console.log('▶ laufzeit');
pruefe('Zahlformatierung', () => {
  const r = require('./laufzeit-zahlen.js').pruefe();
  if (r.fehler.length) throw new Error(r.fehler.length + ' Abweichungen, z. B. ' + r.fehler[0]);
});

console.log('▶ portabel');
pruefe('laufzeit.wasm', () => {
  const p = pruefePortabel(fs.readFileSync(path.join(ROOT, 'site', 'js', 'pizzaiolo', 'laufzeit.wasm')));
  if (p.length) throw new Error(p.slice(0, 3).join('; '));
});
for (const f of faelle) {
  const k = Z.kompiliere(f.quelle);
  if (!k.ok) continue;
  pruefe('portabel ' + f.name, () => { const p = pruefePortabel(k.pkarton); if (p.length) throw new Error(p.slice(0, 3).join('; ')); });
}

console.log('▶ küchenbrigade (P2: Wasm inline + Klon-Vertrag)');
{
  const { fuehreMitKlonen } = require('./klon-host.js');
  const importe = (pk) => WebAssembly.Module.imports(new WebAssembly.Module(pk)).map(i => i.name);
  const exporte = (pk) => WebAssembly.Module.exports(new WebAssembly.Module(pk)).map(e => e.name);
  pruefe('brigade kompiliert (kein Fallback), Gruppe kueche', () => {
    const k = Z.kompiliere('Blech<salami> b = [1, 2];\nBote.sage((b.brigade((x) -> x * 2)));', { mitIR: true });
    if (!k.ok) throw new Error(JSON.stringify(k.nichtUnterstuetzt));
    if (!(k.ir.gruppen || []).includes('kueche')) throw new Error('gruppen ' + JSON.stringify(k.ir.gruppen));
    const im = importe(k.pkarton), ex = exporte(k.pkarton);
    if (!im.includes('kueche_auftrag') || !im.includes('kueche_bericht')) throw new Error('Importe ' + im);
    if (!ex.includes('kueche_stueck')) throw new Error('Exporte ' + ex);
  });
  pruefe('ohne brigade: keine Gruppe kueche, kein Export kueche_stueck', () => {
    const k = Z.kompiliere('Bote.sage(([1].belege(x -> x)));');
    return k.ok && !importe(k.pkarton).some(n => n.startsWith('kueche_')) && !exporte(k.pkarton).includes('kueche_stueck');
  });
  for (const q of ['probier { wirf neu KüchenAnanas("x"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.typ() + a.nachricht())); }',
    'probier { Bote.sage(1); } verbrannt (KüchenAnanas a) { }', 'klasse K erbt KüchenAnanas { }\nBote.sage((neu K("k")));',
    'klasse KüchenAnanas erbt LaufzeitAnanas { }\nprobier { wirf neu KüchenAnanas("k"); } verbrannt (KüchenAnanas a) { Bote.sage((a.typ())); }']) {
    pruefe('KüchenAnanas (Klasse 15) wie im Interpreter: ' + q.slice(0, 30), () => {
      const r = vergleiche({ name: q, quelle: q, opt: {} });
      if (r.status !== 'gleich') throw new Error(r.status + ' ' + (r.grund || '') + (r.diffs || []).join(' '));
    });
  }
  pruefe('Text "KüchenAnanas brigade" bleibt kompilierbar', () => Z.kompiliere('Bote.sage("KüchenAnanas brigade");').ok === true);
  pruefe('faehigkeiten: feature brigade, Importgruppe kueche', () => Z.faehigkeiten.features.includes('brigade') && Z.faehigkeiten.importgruppen.includes('kueche'));
  pruefe('motor "wasm" führt brigade aus', () => {
    // SPEC §17.6 D6-Referenz: Anschnitt bei Uhr 8, jedes Stück 3 → 16ms, schritte 25
    const r = Z.run('Blech<salami> r = [1, 2, 3, 4].brigade(x -> x * x);\nBote.sage((Uhr.jetzt()));', { motor: 'wasm' });
    return r.motor === 'wasm' && r.ereignisse.filter(e => e.typ === 'ausgabe').map(e => e.text).join('|') === '16ms' && r.schritte === 25 && r.zeitMs === 16;
  });
  // Klon-Vertrag: dieselben Berichte aus Klon-Instanzen (Speicherkopie) in beliebiger Planung = Inline-Pfad = Interpreter
  const normK = (r) => r.ereignisse.filter(e => e.typ !== 'motor').map(e => {
    const k = Object.assign({}, e); delete k.detail; if (k.umbruch === true) delete k.umbruch; return JSON.stringify(k);
  });
  let brigadeFaelle = [];
  try {
    brigadeFaelle = require(path.join(ROOT, 'tests', 'differenz', 'korpus.js')).lade()
      .filter(f => /\.brigade\s*\(/.test(require(path.join(ROOT, 'tests', 'differenz', 'korpus.js')).text(f.code)) && !(f.optionen && (f.optionen.uiEreignisse || f.optionen.vorrat)))
      .map(f => ({ name: f.quelle + ':' + f.name, quelle: f.code, opt: f.optionen || {} }));
  } catch (e) { /* Differenz-Korpus fehlt → nur eigene Fälle */ }
  brigadeFaelle = brigadeFaelle.concat(eigeneFaelle().filter(f => f.name.includes('kueche')));
  let klonFaelle = 0, klonAuftraege = 0;
  for (const f of brigadeFaelle) {
    const k = Z.kompiliere(f.quelle);
    if (!k.ok) continue;
    klonFaelle++;
    const modul = new WebAssembly.Module(k.pkarton);
    const opt = Object.assign({ echtzeit: 1700000000000 }, f.opt);
    const ri = P.run(f.quelle, Object.assign({}, opt));
    const soll = JSON.stringify([normK(ri), ri.exitCode, ri.schritte, ri.zeitMs]);
    for (const s of ['vor', 'rueck', 'je']) {
      pruefe('Klone (' + s + ') ' + f.name, () => {
        const r = fuehreMitKlonen(modul, Object.assign({}, opt), s);
        const ist = JSON.stringify([normK(r), r.exitCode, r.schritte, r.zeitMs]);
        if (ist !== soll) throw new Error('\n    I: ' + soll.slice(0, 400) + '\n    K: ' + ist.slice(0, 400));
        klonAuftraege += r.stats.auftraege;
      });
    }
  }
  pruefe('Klon-Vertrag an mindestens 50 Brigade-Programmen geprüft', () => { if (klonFaelle < 50 || klonAuftraege < 100) throw new Error(klonFaelle + ' Programme, ' + klonAuftraege + ' Aufträge'); });
}

console.log('▶ köche (P3: Pool mit Klon-Instanzen in worker_threads)');
{
  const koch = Z._teile.koch;
  const normK = (r) => r.ereignisse.filter(e => e.typ !== 'motor').map(e => {
    const k = Object.assign({}, e); delete k.detail; delete k.koeche; if (k.umbruch === true) delete k.umbruch; return JSON.stringify(k);
  });
  const fp = (r) => JSON.stringify([normK(r), r.exitCode, r.schritte, r.zeitMs]);
  pruefe('kuechenPool(1) → null, faehigkeiten: koeche + kuechenChaos', () => koch.anzahl(1) === 1 && Z.faehigkeiten.laufOptionen.includes('kuechenChaos') && typeof Z.kuechenPool === 'function');
  pruefe('anzahl("auto") = logische Kerne, höchstens 16', () => { const a = koch.anzahl('auto'); return a >= 1 && a <= 16; });
  const pool = koch.kuechenPoolSync(4);
  const klein = koch.kuechenPoolSync(3, { fachBytes: 4096 });   // Berichte über mehrere Blöcke
  pruefe('Pool mit 4 Köchen (worker_threads, synchron angelegt)', () => pool !== null && pool.koeche === 4 && klein !== null);
  if (pool && klein) {
    let faelle = [];
    try {
      faelle = require(path.join(ROOT, 'tests', 'differenz', 'korpus.js')).lade()
        .filter(f => /\.brigade\s*\(/.test(require(path.join(ROOT, 'tests', 'differenz', 'korpus.js')).text(f.code)) && !(f.optionen && (f.optionen.uiEreignisse || f.optionen.vorrat)))
        .map(f => ({ name: f.quelle + ':' + f.name, quelle: f.code, opt: f.optionen || {} }));
    } catch (e) { /* Differenz-Korpus fehlt */ }
    faelle = faelle.concat(eigeneFaelle().filter(f => f.name.includes('kueche')));
    let gekocht = 0;
    for (const f of faelle) {
      const k = Z.kompiliere(f.quelle);
      if (!k.ok) continue;
      const opt = Object.assign({ echtzeit: 1700000000000 }, f.opt);
      const ri = P.run(f.quelle, Object.assign({}, opt));
      const soll = fp(ri);
      const varianten = [['koeche4', { koeche: pool }], ['chaos7', { koeche: pool, kuechenChaos: 7 }], ['rueck', { koeche: pool, kuechenChaos: 0 }],
        ['bloecke', { koeche: klein, kuechenChaos: 3 }]];
      for (const [v, extra] of varianten) {
        pruefe('Köche (' + v + ') ' + f.name, () => {
          const r = Z.run(f.quelle, Object.assign({ motor: 'wasm' }, opt, extra));
          if (r.koeche) gekocht++;
          const ist = fp(r);
          if (ist !== soll) throw new Error('\n    I: ' + soll.slice(0, 400) + '\n    K: ' + ist.slice(0, 400));
        });
      }
      // .pkarton (ein Modul) statt Schnellpfad (Laufzeit + Programmmodul)
      pruefe('Köche (.pkarton) ' + f.name, () => fp(Z.fuehreAus(k.pkarton, Object.assign({}, opt, { koeche: pool }))) === soll);
    }
    pruefe('Köche haben gekocht (mindestens 100 Läufe mit Pool)', () => { if (gekocht < 100) throw new Error(gekocht + ' Läufe'); });
    const vergleichePool = (name, q, opt = {}) => pruefe(name, () => {
      const ri = P.run(q, Object.assign({}, opt));
      for (const extra of [{}, { koeche: pool }, { koeche: pool, kuechenChaos: 11 }, { koeche: klein, kuechenChaos: 0 }]) {
        const r = Z.run(q, Object.assign({ motor: 'wasm' }, opt, extra));
        if (fp(r) !== fp(ri)) throw new Error(JSON.stringify(extra) + '\n    I: ' + fp(ri).slice(0, 300) + '\n    K: ' + fp(r).slice(0, 300));
        if (extra.koeche && !r.koeche) throw new Error('Pool nicht genutzt');
      }
    });
    vergleichePool('10⁴ winzige Stücke', 'Blech<salami> b = [];\nfür (salami i = 0; i < 10000; i++) { b.hinzu(i); }\nBlech<salami> r = b.brigade(x -> x * 2);\nBote.sage((r.länge()), (r));', { schrittLimit: 1e8 });
    vergleichePool('große Berichte (10⁴ Zeilen je Stück, mehrere Blöcke)', 'Blech<salami> r = [1, 2, 3].brigade(x -> { für (salami i = 0; i < 10000; i++) { Bote.sage(("Zeile " + i + " von Stück " + x)); } serviere (x); });\nBote.sage((r));', { schrittLimit: 1e8 });
    vergleichePool('jedes Stück wirft – das erste gewinnt (D3)', 'Blech<salami> r = [1, 2, 3, 4, 5, 6].brigade(x -> { Bote.sage((x)); wirf neu LaufzeitAnanas("Stück " + x); });');
    vergleichePool('Abbruch in Stück 2 von 8, spätere Stücke laufen lang', 'Blech<salami> r = [1, 2, 3, 4, 5, 6, 7, 8].brigade(x -> { falls (x == 2) { wirf neu LaufzeitAnanas("zwei"); } salami s = 0; für (salami i = 0; i < 20000; i++) { s = s + 1; } serviere (s); });', { schrittLimit: 1e8 });
    vergleichePool('mehrere Brigaden hintereinander, Speicher wächst dazwischen', 'Blech<salami> g = [];\nfür (salami runde = 0; runde < 5; runde++) {\n  für (salami i = 0; i < 50000; i++) { g.hinzu(i); }\n  Blech<salami> r = [1, 2, 3, 4].brigade(x -> g.länge() + x);\n  Bote.sage((r));\n}', { schrittLimit: 1e8 });
    pruefe('Trap in einem Klon → interner Fehler (K-014) in der Hauptinstanz', () => {
      const unecht = { koeche: 2, brigade: (desc, mem, a, n) => ({ berichte: new Array(n).fill({ trap: 'unreachable' }), koeche: 2 }) };
      const r = Z.run('Blech<salami> r = [1, 2].brigade(x -> x);\nBote.sage((r));', { motor: 'wasm', koeche: unecht });
      const f = r.ereignisse.find(e => e.typ === 'fehler');
      return r.exitCode === 1 && f && f.text === 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.' && /Trap in einem Koch \(Stück 1\): unreachable/.test(f.detail);
    });
    pruefe('Zahl als koeche → kein Pool, ende ohne koeche-Feld', () => {
      const r = Z.run('Bote.sage(([1, 2].brigade(x -> x)));', { motor: 'wasm', koeche: 4 });
      const e = r.ereignisse[r.ereignisse.length - 1];
      return r.koeche === undefined && !('koeche' in e);
    });
    pruefe('Pool: ende.koeche = genutzte Köche', () => {
      const r = Z.run('Bote.sage(([1, 2, 3, 4, 5, 6].brigade(x -> x)));', { motor: 'wasm', koeche: pool });
      return r.koeche === 4 && r.ereignisse[r.ereignisse.length - 1].koeche === 4;
    });
    pruefe('ein Stück → Inline-Pfad', () => Z.run('Bote.sage(([1].brigade(x -> x)));', { motor: 'wasm', koeche: pool }).koeche === undefined);
    pruefe('echter Wasm-Trap (unreachable) in einem Klon → interner Fehler (K-014), kein Hängen', () => {
      // Handgebautes Modul: start() ruft kueche_auftrag(0, 4) und kueche_bericht(1 … 4); kueche_stueck trappt in Stück 2.
      const P2 = (f) => { const p = new K.Puffer(); f(p); return p.fertig(); };
      const I = 0x7f, F64 = 0x7c;
      const typ = P2(p => {
        p.u32(5);
        p.byte(0x60); p.u32(2); p.byte(I); p.byte(I); p.u32(1); p.byte(I);                  // 0: auftrag
        p.byte(0x60); p.u32(3); p.byte(I); p.byte(I); p.byte(I); p.u32(1); p.byte(I);       // 1: bericht
        p.byte(0x60); p.u32(0); p.u32(1); p.byte(I);                                         // 2: start
        p.byte(0x60); p.u32(0); p.u32(1); p.byte(F64);                                       // 3: schritte/zeitMs
        p.byte(0x60); p.u32(2); p.byte(I); p.byte(I); p.u32(2); p.byte(I); p.byte(I);       // 4: kueche_stueck
      });
      const imp = P2(p => { p.u32(2); p.name('pizza'); p.name('kueche_auftrag'); p.byte(0); p.u32(0); p.name('pizza'); p.name('kueche_bericht'); p.byte(0); p.u32(1); });
      const fn = P2(p => { p.u32(4); p.u32(2); p.u32(3); p.u32(3); p.u32(4); });
      const mem = P2(p => { p.u32(1); p.byte(0); p.u32(1); });
      const ex = P2(p => { p.u32(5); p.name('start'); p.byte(0); p.u32(2); p.name('schritte'); p.byte(0); p.u32(3); p.name('zeitMs'); p.byte(0); p.u32(4);
        p.name('memory'); p.byte(2); p.u32(0); p.name('kueche_stueck'); p.byte(0); p.u32(5); });
      const rumpf = (c) => { const b = c.bytes(); const p = new K.Puffer(); p.u32(b.length + 1); p.u32(0); p.bytes(b); return p.fertig(); };
      const start = new K.Code().i32(0).i32(4).call(0).op(K.OP.drop);
      for (let i = 1; i <= 4; i++) start.i32(i).i32(1000).i32(100).call(1).op(K.OP.drop);
      start.i32(0).end();
      const stueck = new K.Code().get(1).i32(2).op(K.OP.i32_eq).if_().op(K.OP.unreachable).end()
        .i32(2000).i32(0).st32(0).i32(2000).i32(4).end();
      const code = K.verbinde([new Uint8Array([4]), rumpf(start), rumpf(new K.Code().f64(0).end()), rumpf(new K.Code().f64(0).end()), rumpf(stueck)]);
      const m = new WebAssembly.Module(K.verbinde([new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]), K.section(1, typ), K.section(2, imp),
        K.section(3, fn), K.section(5, mem), K.section(7, ex), K.section(10, code)]));
      const ohne = Z._teile.hostJs.fuehreModulAus(m, {});
      if (ohne.exitCode !== 0) throw new Error('ohne Pool: ' + JSON.stringify(ohne.ereignisse));   // Inline: auftrag -1, bericht -2
      for (const extra of [{ koeche: pool }, { koeche: pool, kuechenChaos: 0 }, { koeche: klein, kuechenChaos: 5 }]) {
        const r = Z._teile.hostJs.fuehreModulAus(m, extra);
        const f = r.ereignisse.find(e => e.typ === 'fehler');
        if (!(r.exitCode === 1 && f && f.text === 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.' && /Trap in einem Koch \(Stück 2\): .*unreachable/i.test(f.detail))) {
          throw new Error(JSON.stringify(extra.kuechenChaos) + ': ' + JSON.stringify(r.ereignisse));
        }
      }
      // Pool danach weiter brauchbar (der getrappte Klon wurde verworfen)
      return Z.run('Bote.sage(([1, 2, 3, 4].brigade(x -> x * 3)));', { motor: 'wasm', koeche: pool }).ereignisse[0].text === '[3, 6, 9, 12]';
    });
  }
  pruefe('Koch stirbt mitten im Stück (terminate) → Stück nachgekocht, gleich Interpreter, Koch fliegt raus, kein Hängen', () => {
    // eigener Prozess mit Zeitgrenze: der aufrufende Thread blockiert während der Brigade, ein Hängen fängt nur die Grenze
    const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'koch-ausfall.js')], { encoding: 'utf8', timeout: 60000 });
    if (r.error || r.status !== 0) throw new Error('Prozess: ' + (r.error ? r.error.message : 'Exit ' + r.status) + ' ' + (r.stderr || '').slice(0, 300));
    const zeile = (r.stdout || '').trim().split('\n').pop();
    const e = JSON.parse(zeile);
    if (e.grund === 'kein Pool') return true;
    if (!e.ok) throw new Error(zeile);
  });
  if (pool) pool.beenden();
  if (klein) klein.beenden();
  pruefe('beendeter Pool → Inline-Pfad, gleiches Ergebnis', () => {
    if (!pool) return true;
    const r = Z.run('Bote.sage(([1, 2, 3].brigade(x -> x * 3)));', { motor: 'wasm', koeche: pool });
    return r.koeche === undefined && r.ereignisse[0].text === '[3, 6, 9]';
  });
}

console.log('▶ anzeige (U-45)');
// Anzeigeform überall: <text> + " (Zeile Z, Spalte S)" wenn vorhanden; detail nie im Text
const anzeige = (e) => (e.typ === 'fehler' && e.art === 'ananas' ? e.text.replace(/ \(Zeile \d+\)$/, '') : e.text) + (e.zeile != null ? ' (Zeile ' + e.zeile + (e.spalte != null ? ', Spalte ' + e.spalte : '') + ')' : '');
for (const f of eigeneFaelle().filter(x => x.name.includes('anzeige'))) {
  pruefe('Anzeige ' + f.name, () => {
    const ri = P.run(f.quelle, f.opt);
    const rw = Z.run(f.quelle, Object.assign({}, f.opt, { motor: 'wasm' }));
    const wahl = (r) => r.ereignisse.filter(e => e.typ === 'warnung' || e.typ === 'fehler');
    const a = wahl(ri).map(anzeige), b = wahl(rw).map(anzeige);
    if (!a.length) throw new Error('Testfall ohne Warnungen/Fehler');
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(' I: ' + a.join(' | ') + ' // W: ' + b.join(' | '));
    for (const e of wahl(rw)) if (e.detail !== undefined && e.text.includes(String(e.detail))) throw new Error('detail im Text');
  });
}
pruefe('interner Fehler (Trap): fester Text, detail nur als Feld', () => {
  // Minimalmodul mit ABI-Exporten, dessen start() trapt
  const P2 = (f) => { const p = new K.Puffer(); f(p); return p.fertig(); };
  const typ = P2(p => { p.u32(2); p.byte(0x60); p.u32(0); p.u32(1); p.byte(0x7f); p.byte(0x60); p.u32(0); p.u32(1); p.byte(0x7c); });
  const fn = P2(p => { p.u32(3); p.u32(0); p.u32(1); p.u32(1); });
  const mem = P2(p => { p.u32(1); p.byte(0); p.u32(1); });
  const ex = P2(p => { p.u32(4); p.name('start'); p.byte(0); p.u32(0); p.name('schritte'); p.byte(0); p.u32(1); p.name('zeitMs'); p.byte(0); p.u32(2); p.name('memory'); p.byte(2); p.u32(0); });
  const rumpf = (c) => { const b = c.bytes(); const p = new K.Puffer(); p.u32(b.length + 1); p.u32(0); p.bytes(b); return p.fertig(); };
  const code = K.verbinde([new Uint8Array([3]), rumpf(new K.Code().op(0).end()), rumpf(new K.Code().f64(0).end()), rumpf(new K.Code().f64(0).end())]);
  const m = new WebAssembly.Module(K.verbinde([new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]), K.section(1, typ), K.section(3, fn), K.section(5, mem), K.section(7, ex), K.section(10, code)]));
  const r = Z._teile.hostJs.fuehreModulAus(m, {});
  const fe = r.ereignisse.find(e => e.typ === 'fehler');
  if (!fe || fe.text !== 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.' || fe.zeile !== null || typeof fe.detail !== 'string' || fe.text.includes(fe.detail)) throw new Error(JSON.stringify(fe));
  return r.exitCode === 1;
});

console.log('▶ Theke v3 (U-57)');
pruefe('animiere/uebergang/schwebe kompilieren (kein Fallback mehr)', () => {
  const quellen = {
    animiere: ['Theke t = neu Theke("A");', 'Knopf k = neu Knopf("k");', 'k.animiere("puls");'],
    uebergang: ['Theke t = neu Theke("A");', 'Stapel s = neu Stapel([]).uebergang(ja);'],
    schwebe: ['Theke t = neu Theke("A");', 't.schwebe("+1");']
  };
  for (const [m, zeilen] of Object.entries(quellen)) {
    const r = F.frontend(P.parse(zeilen.join('\n')).ast);
    if (!r.ok) throw new Error(m + ': ' + JSON.stringify(r.nichtUnterstuetzt));
  }
});
pruefe('eigene Methode animiere bleibt kompilierbar', () => {
  const q = ['klasse Tanz {', '    salami animiere() { serviere (1); }', '}', 'Tanz t = neu Tanz();', 'Bote.sage((t.animiere()));'].join('\n');
  const p = P.parse(q);
  if (!p.ok) throw new Error('Syntax: ' + JSON.stringify(p));
  const r = F.frontend(p.ast);
  if (!r.ok) throw new Error(JSON.stringify(r.nichtUnterstuetzt));
});

// Herd (Paket H4): alle tests/faelle/herd-* und Sonderfälle der Gruppe herd
require('./herd.js').pruefe(pruefe);

console.log('▶ e2e');
const stat = { gleich: 0, fallback: 0, syntax: 0 };
for (const f of faelle) {
  const r = vergleiche(f);
  if (r.status === 'gleich') { stat.gleich++; ok++; continue; }
  if (r.status === 'syntax') { stat.syntax++; continue; }
  if (r.status === 'fallback' && /Theke/.test(r.grund)) { stat.fallback++; continue; }
  fehl++;
  console.log('  ✗ ' + f.name + ' [' + r.status + '] ' + (r.grund || '') + (r.diffs ? '\n    ' + r.diffs.join('\n    ') : '') + (r.fehler ? '\n' + r.fehler : ''));
}
console.log('  e2e: ' + stat.gleich + ' identisch, ' + stat.fallback + ' Theke-Fallback, ' + stat.syntax + ' Syntaxfehler (Interpreter)');

console.log('\n' + (fehl ? '✗ ' + fehl + ' fehlgeschlagen, ' : '✓ ') + ok + ' bestanden');
process.exitCode = fehl ? 1 : 0;
