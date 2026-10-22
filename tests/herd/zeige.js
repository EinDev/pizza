#!/usr/bin/env node
/*
 * Herd-Fehlersuche (HERD.md §8): führt ein pizza-Programm im Interpreter aus und zeigt für ein Bild die Szene
 * (gelesen über die Kern-Exporte der laufenden Instanz) und das Bildpaket (dekodiert nach herd/README.md §4) lesbar an.
 *
 *   node tests/herd/zeige.js prog.pizza [--ereignisse datei] [--bild n] [--roh]
 *
 * --ereignisse  Renderer-Ereignisse als JSON-Lines (Standard: <prog>.ereignisse neben dem Programm, sonst ein {"typ":"takt"})
 * --bild n      dieses Bild zeigen (bildnummer; Standard: das letzte gesendete)
 * --roh         zusätzlich alle 2D-/3D-Instanzen einzeln ausgeben (sonst höchstens 20 je Art)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', '..', 'site', 'js', 'pizza.js'));

const argv = process.argv.slice(2);
const wert = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const datei = argv.find((a, i) => !a.startsWith('--') && !['--ereignisse', '--bild'].includes(argv[i - 1]));
if (!datei) { console.error('Aufruf: node tests/herd/zeige.js prog.pizza [--ereignisse datei] [--bild n] [--roh]'); process.exit(2); }
const roh = argv.includes('--roh');
const nur = wert('--bild') !== null ? Number(wert('--bild')) : null;
let evDatei = wert('--ereignisse');
if (evDatei === null && fs.existsSync(datei.replace(/\.pizza$/, '.ereignisse'))) evDatei = datei.replace(/\.pizza$/, '.ereignisse');
const ereignisse = evDatei !== null
  ? fs.readFileSync(evDatei, 'utf8').split(/\r?\n/).filter(z => z.trim()).map(z => JSON.parse(z))
  : [{ typ: 'takt' }];

// ---------- Szene über die Kern-Exporte ----------
let kern = null;
const dec = new TextDecoder();
function text(f) {
  let kap = 64;
  for (;;) {
    const p = kern.puffer(kap), n = f(p, kap);
    if (n < 0) { kern.fehler_neu(); return '?'; }
    if (n <= kap) return dec.decode(new Uint8Array(kern.memory.buffer, p, n));
    kap = n;
  }
}
function liste(f) {
  let kap = 16;
  for (;;) {
    const p = kern.puffer(kap * 4), n = f(p, kap);
    if (n < 0) { kern.fehler_neu(); return []; }
    if (n <= kap) { const dv = new DataView(kern.memory.buffer); return Array.from({ length: n }, (_, i) => dv.getUint32(p + i * 4, true)); }
    kap = n;
  }
}
const z = (v) => typeof v === 'number' ? String(Math.round(v * 1e4) / 1e4) : String(v);
function szene() {
  const schema = JSON.parse(text((p, k) => kern.schema_json(p, k)));
  const L = ['Szene: ' + kern.welt_hole(1) + ' × ' + kern.welt_hole(2) + ', ' + kern.welt_hole(3) + ' Takte, ' +
    kern.welt_hole(5) + ' lebende Teile, ' + kern.welt_hole(6) + ' Ressourcen'];
  const naechste = kern.welt_hole(4);
  for (let id = 1; id < naechste; id++) {
    if (kern.teil_hole(id, 14) !== 0) continue;
    const raum = kern.teil_hole(id, 12), el = kern.teil_hole(id, 13);
    const h = (f) => kern.teil_hole(id, f);
    let s = '  Teil ' + id + ' ' + raum + 'D' + (el ? ' an ' + el : '') + '  lage ' + z(h(1)) + ', ' + z(h(2)) + (raum === 3 ? ', ' + z(h(3)) : '') +
      '  drehung ' + z(h(4)) + (raum === 3 ? ' neigung ' + z(h(5)) + ' rollen ' + z(h(6)) : '') +
      '  groesse ' + z(h(7)) + (h(8) !== h(7) || (raum === 3 && h(9) !== h(7)) ? '/' + z(h(8)) + (raum === 3 ? '/' + z(h(9)) : '') : '') +
      (raum === 2 && h(10) ? '  ebene ' + h(10) : '') + (h(11) ? '' : '  unsichtbar') +
      '  welt ' + z(h(15)) + ', ' + z(h(16)) + (raum === 3 ? ', ' + z(h(17)) : '');
    const kinder = liste((p, k) => kern.teil_kinder(id, p, k));
    if (kinder.length) s += '  kinder ' + kinder.join(',');
    L.push(s);
    for (const art of schema.komponenten) {
      const k = kern.komp_von(id, art.nummer);
      if (k <= 0) continue;
      const felder = art.felder.map(f => {
        let v;
        if (['text', 'wahl', 'farbe'].includes(f.typ)) v = JSON.stringify(text((p, kap) => kern.hole_text(k, f.nummer, p, kap)));
        else if (f.typ === 'bildchen-liste') v = '[' + liste((p, kap) => kern.hole_liste(k, f.nummer, p, kap)).join(',') + ']';
        else if (f.typ === 'diavolo') v = kern.hole_zahl(k, f.nummer) ? 'ja' : 'nein';
        else v = z(kern.hole_zahl(k, f.nummer));
        return f.name + ' ' + v;
      });
      L.push('    ' + art.name + ' #' + k + ': ' + felder.join(', '));
    }
  }
  return L.join('\n');
}

// ---------- Bildpaket (herd/README.md §4) ----------
const ABSCHNITT = { 1: 'SCHRIFT', 2: 'ATLAS_SEITE', 3: 'ATLAS_STUECK', 4: 'NETZ', 10: 'SZENE', 11: 'INST3D', 12: 'ZUEGE3D', 13: 'INST2D' };
const ART2D = { 1: 'Rechteck', 2: 'Kreis', 3: 'Bild', 4: 'Glyphe' };
const ZUG = { 1: 'FEST', 2: 'SCHATTEN', 3: 'DURCH' };
function paket(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u32 = (o) => dv.getUint32(o, true), u16 = (o) => dv.getUint16(o, true), f32 = (o) => z(dv.getFloat32(o, true));
  const rgba = (o) => '#' + [0, 1, 2, 3].map(i => b[o + i].toString(16).padStart(2, '0')).join('');
  const vec = (o, n) => '(' + Array.from({ length: n }, (_, i) => f32(o + i * 4)).join(', ') + ')';
  const L = [];
  const magie = String.fromCharCode(b[0], b[1], b[2], b[3]);
  const flags = u32(16);
  L.push('Paket: ' + magie + ' v' + u32(4) + ', bildnummer ' + u32(8) + ', ' + u16(12) + ' × ' + u16(14) + ', flags ' + flags +
    [[1, '3D'], [2, 'Schatten'], [4, 'Himmel']].filter(([m]) => flags & m).map(([, n]) => ' ' + n).join('') +
    ', ' + u32(20) + ' Abschnitte, ' + u32(24) + ' Bytes');
  let o = 32;
  for (let a = 0; a < u32(20); a++) {
    const art = u32(o), len = u32(o + 4), d = o + 8;
    L.push('  [' + (ABSCHNITT[art] || 'Art ' + art) + '] ' + len + ' Bytes');
    const grenze = roh ? Infinity : 20;
    if (art === 1) L.push('    Schrift ' + u16(d) + ' × ' + u16(d + 2) + ', em ' + f32(d + 4) + ', spanne ' + f32(d + 8));
    else if (art === 2) L.push('    Seite ' + u32(d) + ': ' + u16(d + 4) + ' × ' + u16(d + 6));
    else if (art === 3) L.push('    Seite ' + u32(d) + ' bei ' + u16(d + 4) + ', ' + u16(d + 6) + ': ' + u16(d + 8) + ' × ' + u16(d + 10));
    else if (art === 4) L.push('    Netz ' + u32(d) + ': ' + u32(d + 4) + ' Ecken, ' + u32(d + 8) + ' Indizes, min ' + vec(d + 12, 3) + ' max ' + vec(d + 24, 3));
    else if (art === 10) {
      L.push('    kamera ' + vec(d + 128, 3) + '  sonne ' + vec(d + 144, 4) + ' farbe ' + vec(d + 160, 3));
      L.push('    hintergrund ' + vec(d + 272, 4) + '  nebel ' + vec(d + 224, 2) + ' farbe ' + vec(d + 208, 3) + ' an ' + f32(d + 220) + '  himmel ' + vec(d + 240, 3) + '/' + vec(d + 256, 3) + '  feld ' + vec(d + 304, 2) + '  punktlichter ' + f32(d + 320));
    } else if (art === 11) {
      const n = len / 72;
      for (let i = 0; i < Math.min(n, grenze); i++) {
        const p = d + i * 72;
        L.push('    ' + i + ': lage (' + f32(p + 12) + ', ' + f32(p + 28) + ', ' + f32(p + 44) + ') farbe ' + rgba(p + 48) + ' glanz ' + f32(p + 52) +
          ' leuchten ' + f32(p + 56) + ((u32(p + 68) >> 16) & 1 ? ' textur ' + (u32(p + 68) & 0xffff) : ''));
      }
      if (n > grenze) L.push('    … ' + (n - grenze) + ' weitere');
    } else if (art === 12) {
      for (let i = 0; i < len / 16; i++) { const p = d + i * 16; L.push('    ' + (ZUG[u32(p)] || u32(p)) + ' Netz ' + u32(p + 4) + ' Instanzen ' + u32(p + 8) + ' … +' + u32(p + 12)); }
    } else if (art === 13) {
      const n = len / 56;
      for (let i = 0; i < Math.min(n, grenze); i++) {
        const p = d + i * 56, a2 = u32(p + 44);
        L.push('    ' + i + ': ' + (ART2D[a2 & 0xff] || a2 & 0xff) + ' mitte (' + f32(p + 16) + ', ' + f32(p + 20) + ') halb (' + f32(p + 24) + ', ' + f32(p + 28) +
          ') p ' + f32(p + 32) + '/' + f32(p + 36) + ' farbe ' + rgba(p + 40) + ' M ' + vec(p, 4) + ((a2 & 0xff) >= 3 ? ' uv ' + [0, 2, 4, 6].map(k => u16(p + 48 + k)).join(',') + ' seite ' + (a2 >> 8) : ''));
      }
      if (n > grenze) L.push('    … ' + (n - grenze) + ' weitere');
    }
    o = d + ((len + 3) & ~3);
  }
  return L.join('\n');
}

// ---------- Lauf ----------
let gezeigt = null;
const r = P.run(fs.readFileSync(datei, 'utf8'), {
  uiEreignisse: ereignisse,
  herdSpion: (e) => { kern = e; },
  onHerd: (art, d) => {
    if (art !== 'bild' || (nur !== null && d.bildnummer !== nur)) return;
    gezeigt = { bildnummer: d.bildnummer, szene: d.szene, paket: d.paket, text: szene() + '\n' + paket(d.bytes) };
  }
});
for (const e of r.ereignisse) {
  if (e.typ === 'ausgabe' || e.typ === 'fehlerausgabe') console.log('| ' + e.text);
  else if (e.typ === 'fehler' || e.typ === 'warnung') console.log('! ' + e.text);
  else if (e.typ === 'herd') { const o = Object.assign({}, e); delete o.typ; console.log('> ' + JSON.stringify(o)); }
}
if (gezeigt === null) { console.log(nur !== null ? 'Bild ' + nur + ' wurde nicht gesendet.' : 'Kein Bild gesendet.'); process.exit(r.exitCode || 1); }
console.log('\n=== Bild ' + gezeigt.bildnummer + ' (szene ' + gezeigt.szene + ', paket ' + gezeigt.paket + ')');
console.log(gezeigt.text);
process.exit(r.exitCode);
