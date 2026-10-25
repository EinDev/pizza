#!/usr/bin/env node
'use strict';
/*
 * Testklänge für den Klang-Vorbacker (H-K19a, HERD.md §13.3): kleine WAV- und FLAC-Dateien (wenige KB, keine Lizenzfrage),
 * geschrieben nach herd/teigling/testklaenge/, dazu erwartet.txt (je Datei Rate, Kanäle, Bits, Frames, Flags und SHA-256 des
 * erwarteten PCM i16 sowie der Rohwerte vor der Rundung – bzw. Code und Text des Fehlers). Eigener WAV-Schreiber und eigener
 * kleiner FLAC-Kodierer, der jede Teilrahmenart gezielt schreibt (CONSTANT, VERBATIM, FIXED 0 … 4, LPC mit vorgegebenen
 * Koeffizienten/Genauigkeit/Schub, RICE und RICE2, Escape-Partitionen, verschwendete Bits, alle Stereo-Arten, feste und
 * variable Blockgröße, alle Blockgrößen- und Raten-Codes).
 *
 * Bytegleich reproduzierbar: Signale nur aus + − × ÷ und Math.round/floor (kein Math.sin), MD5 über node:crypto.
 * Aufruf: node scripts/klaenge-test.js [--pruefe]        (--pruefe: nur vergleichen, Exit 1 bei Abweichung)
 *         node scripts/klaenge-test.js --ffmpeg-quellen <ordner>   WAV-Quellen der mit ffmpeg kodierten Testdateien (ffmpeg-*.flac,
 *                                                                   einmal erzeugt und eingecheckt; erwartet = Quelle, verlustfrei)
 * Benutzt von cargo test -p herd-teigling (klang_tests.rs) und node herd/test-teigling.js.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ZIEL = path.join(__dirname, '..', 'herd', 'teigling', 'testklaenge');
const pruefe = process.argv.includes('--pruefe');
const ffQ = process.argv.indexOf('--ffmpeg-quellen');
const ffmpegQuellen = ffQ >= 0 ? process.argv[ffQ + 1] : null;

const dateien = {};          // name → Buffer
const erwartet = [];         // Zeilen von erwartet.txt
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ---------------------------------------------------------------- Signale (deterministisch, ohne Math.sin)
/** Sinus-Näherung aus zwei Parabeln; phase in Umdrehungen. */
function welle(phase) {
  const t = phase - Math.floor(phase);
  if (t < 0.5) { const u = 4 * t - 1; return 1 - u * u; }
  const u = 4 * t - 3; return u * u - 1;
}
/** Ton aus Teiltönen [{ f, a }] mit Ein- und Ausblenden; Werte in −1 … 1. */
function ton(n, rate, teile, ein = 0.01, aus = 0.3) {
  const a = new Float64Array(n), ne = Math.max(1, Math.round(ein * rate)), na = Math.max(1, Math.round(aus * n));
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const p of teile) v += p.a * welle(p.f * i / rate + (p.ph || 0));
    const h = Math.min(1, i / ne, (n - i) / na);
    a[i] = v * h;
  }
  return a;
}
/** deterministisches Rauschen −1 … 1 (xorshift32) */
function rauschen(n, saat) {
  let z = saat >>> 0 || 1;
  const a = new Float64Array(n);
  for (let i = 0; i < n; i++) { z ^= z << 13; z >>>= 0; z ^= z >>> 17; z ^= z << 5; z >>>= 0; a[i] = z / 2147483648 - 1; }
  return a;
}
function quant(a, bits) {
  const m = 2 ** (bits - 1) - 1, aus = new Array(a.length);
  for (let i = 0; i < a.length; i++) aus[i] = Math.max(-m - 1, Math.min(m, Math.round(a[i] * m)));
  return aus;
}
const verschachtle = (ks) => { const n = ks[0].length, aus = []; for (let i = 0; i < n; i++) for (const k of ks) aus.push(k[i]); return aus; };

// ---------------------------------------------------------------- Erwartung (Regeln aus klang.rs)
const f32Puf = new DataView(new ArrayBuffer(4));
const ausBits = (b) => { f32Puf.setUint32(0, b >>> 0); return f32Puf.getFloat32(0); };
const zuBits = (x) => { f32Puf.setFloat32(0, x); return f32Puf.getInt32(0); };
function floatI16(x) {
  if (Number.isNaN(x)) return 0;
  x = x > 1 ? 1 : x < -1 ? -1 : x;
  const y = Math.fround(x * 32767);
  let t = Math.trunc(y);
  const r = y - t;
  if (r >= 0.5) t += 1; else if (r <= -0.5) t -= 1;
  return Math.max(-32768, Math.min(32767, t)) | 0;
}
function zuI16(w, bits, float) {
  if (float) return floatI16(ausBits(w));
  if (bits === 16) return w;
  if (bits < 16) return w * 2 ** (16 - bits);
  const n = bits - 16;
  return Math.max(-32768, Math.min(32767, Math.floor((w + 2 ** (n - 1)) / 2 ** n)));
}
/** erwartet: name rate kanaele bits frames flags sha(pcm16) sha(roh i32) */
function erwarte(name, rate, kanaele, bits, roh, flac, float) {
  const pcm = Buffer.alloc(roh.length * 2), r = Buffer.alloc(roh.length * 4);
  for (let i = 0; i < roh.length; i++) { pcm.writeInt16LE(zuI16(roh[i], bits, float), i * 2); r.writeInt32LE(roh[i] | 0, i * 4); }
  erwartet.push([name, rate, kanaele, bits, roh.length / kanaele, (flac ? 1 : 0) | (float ? 2 : 0), sha(pcm), sha(r)].join(' '));
}

// ---------------------------------------------------------------- Fehlertexte (wie fehler_text in klang.rs)
const tausender = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const megabyte = (b) => { const z = Math.ceil(b * 10 / 1048576); return Math.floor(z / 10) + ',' + (z % 10); };
const TEXT = {
  kein: [1, 'ist kein lesbarer Klang (WAV oder FLAC).'],
  lang: (frames, rate) => { const s = Math.ceil(frames / rate); return [2, 'ist zu lang (' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ') – höchstens 10 Minuten.']; },
  quelle: (b) => [3, 'ist zu groß (' + megabyte(b) + ' MB) – höchstens 16 MB.'],
  teig: (b) => [3, 'ist vorgebacken zu groß (' + megabyte(b) + ' MB) – höchstens 64 MB.'],
  kanaele: (n) => [4, 'hat ' + tausender(n) + ' Kanäle – höchstens 2 (Mono oder Stereo).'],
  rate: (r) => [5, 'hat ' + tausender(r) + ' Hz – erlaubt sind 8 000 bis 96 000 Hz.'],
  wav: [6, 'ist ein WAV in einem Format, das der Herd nicht kann (nur PCM mit 8, 16, 24 oder 32 Bit und Float mit 32 Bit).'],
  flac: [6, 'ist ein FLAC in einem Format, das der Herd nicht kann (nur 4 bis 24 Bit).'],
};
function fehler(name, bytes, [code, text]) { dateien[name] = bytes; erwartet.push(name + ' fehler ' + code + ' ' + text); }

// ---------------------------------------------------------------- WAV
function abschnitt(id, daten, groesse) {
  const k = Buffer.alloc(8); k.write(id, 0, 'latin1'); k.writeUInt32LE(groesse === undefined ? daten.length : groesse >>> 0, 4);
  return Buffer.concat([k, daten, daten.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}
const GUID = (tag) => Buffer.from([tag & 255, tag >> 8, 0, 0, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xAA, 0x00, 0x38, 0x9B, 0x71]);
function fmt({ tag = 1, kanaele, rate, bits, ext = false, gueltig, guid }) {
  const block = kanaele * bits / 8;
  const f = Buffer.alloc(ext ? 40 : 16);
  f.writeUInt16LE(ext ? 0xFFFE : tag, 0); f.writeUInt16LE(kanaele, 2); f.writeUInt32LE(rate, 4); f.writeUInt32LE(rate * block >>> 0, 8);
  f.writeUInt16LE(block & 0xFFFF, 12); f.writeUInt16LE(bits, 14);
  if (ext) { f.writeUInt16LE(22, 16); f.writeUInt16LE(gueltig || bits, 18); f.writeUInt32LE(kanaele === 1 ? 4 : 3, 20); (guid || GUID(tag)).copy(f, 24); }
  return f;
}
function pcmBytes(werte, bits, float) {
  const n = bits / 8, b = Buffer.alloc(werte.length * n);
  werte.forEach((v, i) => {
    if (float) b.writeInt32LE(v, i * 4);
    else if (n === 1) b[i] = v + 128;
    else if (n === 2) b.writeInt16LE(v, i * 2);
    else if (n === 3) b.writeIntLE(v, i * 3, 3);
    else b.writeInt32LE(v, i * 4);
  });
  return b;
}
/** WAV aus Rohwerten (8 bit: u − 128; Float: f32-Bits als i32). o: vor/nach (Abschnitte), dataGroesse, schneide (Bytes am Ende weg) */
function wav(o) {
  const daten = pcmBytes(o.werte, o.bits, o.tag === 3);
  const teile = [Buffer.from('WAVE')].concat(o.vor || [], [abschnitt('fmt ', fmt(o))], o.zwischen || [],
    [abschnitt('data', daten, o.dataGroesse)], o.nach || []);
  let rumpf = Buffer.concat(teile);
  if (o.schneide) rumpf = rumpf.subarray(0, rumpf.length - o.schneide);
  const k = Buffer.alloc(8); k.write('RIFF', 0, 'latin1'); k.writeUInt32LE(rumpf.length, 4);
  return Buffer.concat([k, rumpf]);
}
function wavDatei(name, o, erwRoh) {
  dateien[name] = wav(o);
  erwarte(name, o.rate, o.kanaele, o.bits, erwRoh || o.werte, false, o.tag === 3);
}

// ---------------------------------------------------------------- FLAC-Kodierer
class Bitschreiber {
  constructor() { this.b = []; this.cur = 0; this.n = 0; }
  bit(x) { this.cur = (this.cur << 1) | x; if (++this.n === 8) { this.b.push(this.cur); this.cur = 0; this.n = 0; } }
  u(v, n) { if (v < 0 || v >= 2 ** n) throw new Error('Wert ' + v + ' passt nicht in ' + n + ' Bit'); for (let i = n - 1; i >= 0; i--) this.bit(Math.floor(v / 2 ** i) % 2); }
  s(v, n) { if (v < -(2 ** (n - 1)) || v >= 2 ** (n - 1)) throw new Error('Wert ' + v + ' passt nicht in ' + n + ' Bit (signed)'); this.u(v < 0 ? v + 2 ** n : v, n); }
  unaer(q) { for (let i = 0; i < q; i++) this.bit(0); this.bit(1); }
  ausrichten() { while (this.n) this.bit(0); }
  get laenge() { if (this.n) throw new Error('nicht ausgerichtet'); return this.b.length; }
}
const CRC8 = (d) => { let c = 0; for (const x of d) { c ^= x; for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255; } return c; };
const CRC16 = (d) => { let c = 0; for (const x of d) { c ^= x << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xFFFF : (c << 1) & 0xFFFF; } return c; };
const zickzack = (v) => (v >= 0 ? 2 * v : -2 * v - 1);
/** kleinste Bitzahl, in die alle Werte vorzeichenbehaftet passen (0: alle 0) */
function noetigeBits(werte) {
  if (werte.every((v) => v === 0)) return 0;
  let n = 1;
  while (werte.some((v) => v < -(2 ** (n - 1)) || v >= 2 ** (n - 1))) n++;
  return n;
}
function besterK(werte, maxK) {
  let best = 0, bestN = Infinity;
  for (let k = 0; k <= maxK; k++) { let s = 0; for (const v of werte) s += Math.floor(zickzack(v) / 2 ** k) + 1 + k; if (s < bestN) { bestN = s; best = k; } }
  return best;
}
/** Restwerte r[o..n) schreiben. sp: methode 0/1, po, k (Zahl oder Liste je Partition), escape: [Partitionen], escapeBits */
function rest(bw, r, n, o, sp) {
  const methode = sp.methode || 0, po = sp.po || 0, kbits = methode ? 5 : 4, esc = methode ? 31 : 15;
  bw.u(methode, 2); bw.u(po, 4);
  const g = n >> po;
  if (g << po !== n || g < o) throw new Error('Partitionierung passt nicht');
  for (let t = 0; t < 1 << po; t++) {
    const teil = r.slice(t === 0 ? o : t * g, (t + 1) * g);
    if ((sp.escape || []).includes(t)) {
      const rb = noetigeBits(teil);
      bw.u(esc, kbits); bw.u(rb, 5);
      if (rb) for (const v of teil) bw.s(v, rb);
      continue;
    }
    const k = Array.isArray(sp.k) ? sp.k[t] : sp.k !== undefined ? sp.k : besterK(teil, esc - 1);
    bw.u(k, kbits);
    for (const v of teil) { const u = zickzack(v); bw.unaer(Math.floor(u / 2 ** k)); bw.u(u % 2 ** k, k); }
  }
}
const FEST = [[], [1], [2, -1], [3, -3, 1], [4, -6, 4, -1]];
/** Teilrahmen. sp: art konstant|roh|fest|lpc, ordnung, koeff, genau, schub, verschwendet, + Rest-Optionen */
function teilrahmen(bw, werte, bits, sp) {
  const w = sp.verschwendet || 0, x = werte.map((v) => v / 2 ** w), b = bits - w, n = x.length;
  if (x.some((v) => !Number.isInteger(v))) throw new Error('verschwendete Bits passen nicht');
  const typ = { konstant: 0, roh: 1, fest: 8 + (sp.ordnung || 0), lpc: 31 + (sp.koeff || []).length }[sp.art];
  bw.bit(0); bw.u(typ, 6);
  if (w) { bw.bit(1); bw.unaer(w - 1); } else bw.bit(0);
  if (sp.art === 'konstant') { if (x.some((v) => v !== x[0])) throw new Error('nicht konstant'); bw.s(x[0], b); return; }
  if (sp.art === 'roh') { for (const v of x) bw.s(v, b); return; }
  const koeff = sp.art === 'fest' ? FEST[sp.ordnung] : sp.koeff, o = koeff.length, schub = sp.art === 'fest' ? 0 : sp.schub;
  for (let i = 0; i < o; i++) bw.s(x[i], b);
  if (sp.art === 'lpc') { bw.u(sp.genau - 1, 4); bw.s(schub, 5); for (const c of koeff) bw.s(c, sp.genau); }
  const r = new Array(n).fill(0);
  for (let i = o; i < n; i++) {
    let s = 0;
    for (let j = 0; j < o; j++) s += koeff[j] * x[i - 1 - j];
    r[i] = x[i] - Math.floor(s / 2 ** schub);
  }
  rest(bw, r, n, o, sp);
}
/** Rahmen-/Abtastnummer im UTF-8-artigen Code (1 … 7 Bytes, bis 36 Bit) */
function utf8Zahl(bw, v) {
  if (v < 0x80) { bw.u(v, 8); return; }
  let mehr = 1;                                   // Folgebytes; Platz: 6 + 5 · mehr Bit
  while (v >= 2 ** (6 + 5 * mehr)) if (++mehr > 6) throw new Error('Zahl zu groß');
  bw.u(((0xFF << (7 - mehr)) & 0xFF) | Math.floor(v / 2 ** (6 * mehr)), 8);
  for (let i = mehr - 1; i >= 0; i--) bw.u(0x80 | (Math.floor(v / 2 ** (6 * i)) % 64), 8);
}
const BS_CODE = { 192: 1, 576: 2, 1152: 3, 2304: 4, 4608: 5, 256: 8, 512: 9, 1024: 10, 2048: 11, 4096: 12, 8192: 13, 16384: 14, 32768: 15 };
const RATE_CODE = { 88200: 1, 176400: 2, 192000: 3, 8000: 4, 16000: 5, 22050: 6, 24000: 7, 32000: 8, 44100: 9, 48000: 10, 96000: 11 };
const BITS_CODE = { 8: 1, 12: 2, 16: 4, 20: 5, 24: 6, 32: 7 };
/** Ein Rahmen. f: kanaele (Arrays der Abtastwerte), modus 0 unabhängig · 1 links/seite · 2 rechts/seite · 3 mitte/seite,
 *  sub: Teilrahmen-Optionen je Kanal, nummer, variabel, bsCode/rateCode/bitsCode (sonst natürlich) */
function rahmen(st, f) {
  const bw = new Bitschreiber(), n = f.kanaele[0].length;
  bw.u(0x7FFC, 15); bw.bit(f.variabel ? 1 : 0);
  const bsCode = f.bsCode !== undefined ? f.bsCode : BS_CODE[n] || (n <= 256 ? 6 : 7);
  const rateCode = f.rateCode !== undefined ? f.rateCode : RATE_CODE[st.rate] || 0;
  const bitsCode = f.bitsCode !== undefined ? f.bitsCode : BITS_CODE[st.bits] || 0;
  const modus = f.modus || 0;
  bw.u(bsCode, 4); bw.u(rateCode, 4); bw.u(modus ? 7 + modus : st.kanaele - 1, 4); bw.u(bitsCode, 3); bw.bit(0);
  utf8Zahl(bw, f.nummer);
  if (bsCode === 6) bw.u(n - 1, 8); else if (bsCode === 7) bw.u(n - 1, 16);
  if (rateCode === 12) bw.u(st.rate / 1000, 8); else if (rateCode === 13) bw.u(st.rate, 16); else if (rateCode === 14) bw.u(st.rate / 10, 16);
  bw.u(CRC8(bw.b), 8);
  let ks = f.kanaele;
  const [L, R] = ks;
  if (modus === 1) ks = [L, L.map((v, i) => v - R[i])];
  if (modus === 2) ks = [L.map((v, i) => v - R[i]), R];
  if (modus === 3) ks = [L.map((v, i) => Math.floor((v + R[i]) / 2)), L.map((v, i) => v - R[i])];
  ks.forEach((k, c) => {
    const seite = (modus === 1 && c === 1) || (modus === 2 && c === 0) || (modus === 3 && c === 1);
    teilrahmen(bw, k, st.bits + (seite ? 1 : 0), f.sub[c] || f.sub[0]);
  });
  bw.ausrichten();
  const c = CRC16(bw.b);
  bw.u(c >> 8, 8); bw.u(c & 255, 8);
  return Buffer.from(bw.b);
}
function metablock(typ, daten, letzter) {
  const k = Buffer.from([(letzter ? 0x80 : 0) | typ, daten.length >> 16, (daten.length >> 8) & 255, daten.length & 255]);
  return Buffer.concat([k, daten]);
}
function md5Werte(ks, bits) {
  const n = Math.ceil(bits / 8), roh = verschachtle(ks), b = Buffer.alloc(roh.length * n);
  roh.forEach((v, i) => b.writeIntLE(v, i * n, n));
  return crypto.createHash('md5').update(b).digest();
}
/** FLAC-Datei. st: rate, kanaele, bits, gesamt (undefined = wahr, 0 = unbekannt, Zahl = vorgegeben), extra (Metadaten),
 *  rahmen: [{ n, ... Rahmen-Optionen }] – die Abtastwerte kommen aus ks (Kanal-Arrays über die ganze Datei). */
function flac(st, ks, liste, extra = [], anhang = Buffer.alloc(0)) {
  const teile = [], groessen = [];
  let pos = 0, nr = 0;
  for (const r of liste) {
    const kan = ks.map((k) => k.slice(pos, pos + r.n));
    if (kan[0].length !== r.n) throw new Error('zu wenige Abtastwerte');
    const b = rahmen(st, Object.assign({ kanaele: kan, nummer: st.variabel ? pos : nr }, r, { variabel: !!st.variabel }));
    teile.push(b); groessen.push(b.length);
    pos += r.n; nr++;
  }
  if (pos !== ks[0].length) throw new Error('Rahmen decken die Abtastwerte nicht ab (' + pos + ' / ' + ks[0].length + ')');
  const bsAlle = liste.map((r) => r.n);
  const si = new Bitschreiber();
  const maxBs = Math.max(16, ...bsAlle), minBs = st.variabel ? Math.max(16, Math.min(...bsAlle)) : (bsAlle.length > 1 ? Math.max(...bsAlle.slice(0, -1)) : bsAlle[0]);
  si.u(Math.min(minBs, maxBs), 16); si.u(maxBs, 16); si.u(Math.min(...groessen), 24); si.u(Math.max(...groessen), 24);
  si.u(st.rate, 20); si.u(st.kanaele - 1, 3); si.u(st.bits - 1, 5);
  si.u(st.gesamt !== undefined ? st.gesamt : pos, 36);
  for (const x of st.ohneMd5 ? Buffer.alloc(16) : md5Werte(ks, st.bits)) si.u(x, 8);
  const meta = [metablock(0, Buffer.from(si.b), extra.length === 0)];
  extra.forEach((e, i) => meta.push(metablock(e.typ, e.daten, i === extra.length - 1)));
  return Buffer.concat([Buffer.from('fLaC'), ...meta, ...teile, anhang]);
}
function flacDatei(name, st, ks, liste, extra, anhang) {
  dateien[name] = flac(st, ks, liste, extra, anhang);
  erwarte(name, st.rate, st.kanaele, st.bits, verschachtle(ks), true, false);
}
/** Blöcke gleicher Größe (letzter kürzer) mit denselben Optionen */
function bloecke(n, bs, opt) { const l = []; for (let p = 0; p < n; p += bs) l.push(Object.assign({ n: Math.min(bs, n - p) }, typeof opt === 'function' ? opt(l.length) : opt)); return l; }

// ================================================================ WAV-Testdateien
{
  const r = 8000, a = quant(ton(800, r, [{ f: 440, a: 0.8 }]), 8);
  a[10] = -128; a[11] = 127; a[12] = 0;
  wavDatei('wav-8-mono.wav', { kanaele: 1, rate: r, bits: 8, werte: a });
}
{
  const r = 44100, n = 1000;
  const l = quant(ton(n, r, [{ f: 523.25, a: 0.5 }, { f: 1046.5, a: 0.2 }]), 16), rr = quant(ton(n, r, [{ f: 659.25, a: 0.6 }]), 16);
  l[5] = -32768; rr[5] = 32767;
  wavDatei('wav-16-stereo.wav', { kanaele: 2, rate: r, bits: 16, werte: verschachtle([l, rr]) });
}
{
  const r = 48000, a = quant(ton(900, r, [{ f: 300, a: 0.9 }, { f: 3000, a: 0.09 }]), 24);
  // Rundungsgrenzen: halbe Stufe, größter/kleinster Wert
  a.splice(0, 8, 127, 128, 129, -128, -129, 8388607, -8388608, -127);
  wavDatei('wav-24-mono.wav', { kanaele: 1, rate: r, bits: 24, werte: a });
}
{
  const r = 96000, n = 700, l = quant(ton(n, r, [{ f: 1000, a: 0.7 }]), 32), rr = quant(rauschen(n, 7), 32);
  l.splice(0, 6, 2147483647, -2147483648, 32767, 32768, -32768, -32769);
  wavDatei('wav-32-stereo.wav', { kanaele: 2, rate: r, bits: 32, werte: verschachtle([l, rr]) });
}
function floatWerte(n, rate) {
  const t = ton(n, rate, [{ f: 440, a: 0.7 }, { f: 880, a: 0.25 }]);
  const bits = Array.from(t, (v) => zuBits(Math.fround(v)));
  const besondere = [NaN, Infinity, -Infinity, 1.5, -1.5, 1, -1, 0, -0, 1e-40, -1e-40, 0.99999994, -0.99999994,
    0.5 / 32767, -0.5 / 32767, 1.5 / 32767, -2.5 / 32767, 1000.5 / 32767].map((x) => zuBits(Math.fround(x)));
  besondere.push(0x7FC00001 | 0, 0xFFC00001 | 0, 0x7F800001 | 0);   // NaN mit Nutzlast, negativ, signalisierend
  // Werte mit genau halber Stufe nach der f32-Multiplikation (Rundung vom Nullpunkt weg)
  for (const k of [0, 1, 2, 100, 1000, 32766, -1, -7, -32767]) {
    const ziel = k < 0 ? k - 0.5 : k + 0.5;
    const x0 = zuBits(Math.fround(ziel / 32767));
    for (let d = -40; d <= 40; d++) { const b = x0 + d, x = ausBits(b); if (Math.fround(x * 32767) === ziel) { besondere.push(b); break; } }
  }
  bits.splice(20, besondere.length, ...besondere);
  return bits;
}
{
  const r = 22050;
  wavDatei('wav-float-mono.wav', { tag: 3, kanaele: 1, rate: r, bits: 32, werte: floatWerte(600, r) });
}
{
  const r = 44100, n = 500, l = quant(ton(n, r, [{ f: 220, a: 0.8 }]), 24), rr = quant(ton(n, r, [{ f: 330, a: 0.8 }]), 24);
  wavDatei('wav-extensible-24.wav', { kanaele: 2, rate: r, bits: 24, ext: true, gueltig: 20, werte: verschachtle([l, rr.map((v) => v - (v % 16))]) });
}
{
  const r = 48000, a = floatWerte(400, r), b = floatWerte(400, r).reverse();
  wavDatei('wav-extensible-float.wav', { tag: 3, kanaele: 2, rate: r, bits: 32, ext: true, werte: verschachtle([a, b]) });
}
{
  const r = 16000, a = quant(ton(600, r, [{ f: 600, a: 0.5 }]), 16);
  const ungerade = abschnitt('junk', Buffer.from('abc'));          // 3 Bytes + Füllbyte
  const liste = abschnitt('LIST', Buffer.concat([Buffer.from('INFOINAM'), Buffer.from([5, 0, 0, 0]), Buffer.from('Pizza'), Buffer.alloc(1)]));
  wavDatei('wav-ungerade-abschnitte.wav', { kanaele: 1, rate: r, bits: 16, werte: a, vor: [ungerade], zwischen: [liste, abschnitt('fact', Buffer.from([88, 2, 0, 0]))] });
}
{
  const r = 11025, l = quant(ton(400, r, [{ f: 700, a: 0.5 }]), 16), rr = quant(ton(400, r, [{ f: 350, a: 0.5 }]), 16);
  wavDatei('wav-zusatz-abschnitte.wav', { kanaele: 2, rate: r, bits: 16, werte: verschachtle([l, rr]),
    vor: [abschnitt('bext', Buffer.alloc(30, 1))], zwischen: [abschnitt('cue ', Buffer.alloc(4))], nach: [abschnitt('id3 ', Buffer.from('ID3 Pizza!'))] });
}
{
  // data größer als die Datei: 300 ganze Frames + ein halber (2 Bytes) vorhanden, data behauptet 4000 Bytes
  const r = 8000, n = 301, l = quant(ton(n, r, [{ f: 500, a: 0.5 }]), 16), rr = quant(rauschen(n, 3), 16).map((v) => v >> 4);
  const werte = verschachtle([l, rr]);
  wavDatei('wav-data-zu-gross.wav', { kanaele: 2, rate: r, bits: 16, werte, dataGroesse: 4000, schneide: 2 }, werte.slice(0, 600));
}
{
  // data mit Größe 0xFFFFFFFF (Strom-Schreiber): bis Dateiende
  const r = 32000, a = quant(ton(500, r, [{ f: 250, a: 0.6 }]), 8);
  wavDatei('wav-data-unbekannt.wav', { kanaele: 1, rate: r, bits: 8, werte: a, dataGroesse: 0xFFFFFFFF });
}
{
  // ton-mono.wav: 16 bit Mono 22 050 Hz, 0,25 s – ein weicher Glockenton
  const r = 22050, n = 5513;
  const a = quant(ton(n, r, [{ f: 660, a: 0.45 }, { f: 1320, a: 0.12 }, { f: 1980, a: 0.05 }], 0.005, 0.8), 16);
  wavDatei('ton-mono.wav', { kanaele: 1, rate: r, bits: 16, werte: a });
}

// ================================================================ FLAC-Testdateien
{
  // jede Teilrahmenart, 16 bit Mono 44 100 Hz, Blöcke 256 (Code 8)
  const st = { rate: 44100, kanaele: 1, bits: 16 }, bs = 256;
  const arten = [
    { art: 'konstant' }, { art: 'roh' },
    { art: 'fest', ordnung: 0 }, { art: 'fest', ordnung: 1 }, { art: 'fest', ordnung: 2 }, { art: 'fest', ordnung: 3 }, { art: 'fest', ordnung: 4 },
    { art: 'lpc', koeff: [1000], genau: 11, schub: 10 },
    { art: 'lpc', koeff: [1946, -1000], genau: 12, schub: 10 },
    { art: 'lpc', koeff: [3000, -2500, 1200, -400, 100, -50, 20, -5], genau: 13, schub: 11 },
    { art: 'lpc', koeff: Array.from({ length: 32 }, (_, j) => (j === 0 ? 16383 : (((j * 37) % 11) - 5) * 3)), genau: 15, schub: 14 },
    { art: 'lpc', koeff: [2, -1], genau: 3, schub: 0 },
    { art: 'fest', ordnung: 2, methode: 1, po: 3, k: [0, 3, 15, 20, 30, 7, 5, 4] },
    { art: 'fest', ordnung: 1, po: 2, escape: [0, 2] },
    { art: 'lpc', koeff: [1946, -1000], genau: 12, schub: 10, methode: 1, po: 4, escape: [1, 15] },
    { art: 'fest', ordnung: 1, po: 1, escape: [0, 1] },
    { art: 'fest', ordnung: 2, po: 7 },                                    // erste Partition ohne Restwerte
  ];
  const n = arten.length * bs, t = quant(ton(n, st.rate, [{ f: 441, a: 0.6 }, { f: 1323, a: 0.1 }], 0.001, 0.05), 16);
  for (let i = 0; i < bs; i++) t[i] = -1234;                                          // konstant
  for (let i = 15 * bs; i < 15 * bs + bs / 2; i++) t[i] = 0;                          // Escape mit 0 Bit
  flacDatei('flac-teilrahmen.flac', st, [t], arten.map((a) => Object.assign({ n: bs, sub: [a] })));
}
{
  // alle Stereo-Arten, 16 bit 48 000 Hz, Blöcke 576 (Code 2)
  const st = { rate: 48000, kanaele: 2, bits: 16 }, n = 576 * 8;
  const l = quant(ton(n, st.rate, [{ f: 400, a: 0.7 }]), 16), r = quant(ton(n, st.rate, [{ f: 400, a: 0.6, ph: 0.1 }, { f: 1200, a: 0.1 }]), 16);
  l[3] = 32767; r[3] = -32768; l[4] = -32768; r[4] = 32767;   // größte Seitenwerte
  const sub = [{ art: 'fest', ordnung: 2 }, { art: 'lpc', koeff: [1900, -950], genau: 12, schub: 10 }];
  flacDatei('flac-stereo.flac', st, [l, r], bloecke(n, 576, (i) => ({ modus: i % 4, sub: i < 4 ? sub : [{ art: 'roh' }, { art: 'fest', ordnung: 3 }] })));
}
{
  // 8 bit Mono 12 000 Hz (Rate-Code 12: kHz), Blöcke 192 (Code 1)
  const st = { rate: 12000, kanaele: 1, bits: 8 }, n = 192 * 5 + 50;
  const a = quant(ton(n, st.rate, [{ f: 300, a: 0.9 }]), 8);
  a[0] = -128; a[1] = 127;
  flacDatei('flac-8bit.flac', st, [a], bloecke(n, 192, (i) => ({ rateCode: 12, sub: [[{ art: 'fest', ordnung: 1 }, { art: 'roh' }, { art: 'lpc', koeff: [7, -3], genau: 4, schub: 2 }][i % 3]] })));
}
{
  // 12 bit Stereo 11 025 Hz (Rate-Code 13: Hz), Blöcke 100 (Code 6: 8 bit), Mitte/Seite
  const st = { rate: 11025, kanaele: 2, bits: 12 }, n = 100 * 6;
  const l = quant(ton(n, st.rate, [{ f: 200, a: 0.8 }]), 12), r = quant(ton(n, st.rate, [{ f: 300, a: 0.8 }]), 12);
  l[0] = 2047; r[0] = -2048;
  flacDatei('flac-12bit.flac', st, [l, r], bloecke(n, 100, (i) => ({ rateCode: 13, modus: i % 2 ? 3 : 0, sub: [{ art: 'fest', ordnung: 2 }] })));
}
{
  // 20 bit Stereo 32 000 Hz (Rate-Code 14: 10 Hz), Blöcke 300 (Code 7: 16 bit), links/seite und rechts/seite
  const st = { rate: 32000, kanaele: 2, bits: 20 }, n = 300 * 4;
  const l = quant(ton(n, st.rate, [{ f: 500, a: 0.8 }]), 20), r = quant(ton(n, st.rate, [{ f: 750, a: 0.7 }]), 20);
  l[2] = 524287; r[2] = -524288;
  flacDatei('flac-20bit.flac', st, [l, r], bloecke(n, 300, (i) => ({ rateCode: 14, bsCode: 7, modus: 1 + (i % 2), sub: [{ art: 'lpc', koeff: [3700, -1800], genau: 13, schub: 11 }, { art: 'fest', ordnung: 1 }] })));
}
{
  // 24 bit Stereo 96 000 Hz, rechts/seite (Seitenkanal 25 bit), LPC
  const st = { rate: 96000, kanaele: 2, bits: 24 }, n = 1024 * 2;
  const l = quant(ton(n, st.rate, [{ f: 2000, a: 0.9 }]), 24), r = quant(rauschen(n, 11), 24);
  l[7] = 8388607; r[7] = -8388608;
  flacDatei('flac-24bit-stereo.flac', st, [l, r], bloecke(n, 1024, (i) => ({ modus: i ? 2 : 3, sub: [{ art: 'lpc', koeff: [7900, -3900, 10], genau: 14, schub: 12, methode: 1 }, { art: 'roh' }] })));
}
{
  // 4 bit Mono 8 000 Hz, Rate- und Bit-Code 0 (aus STREAMINFO)
  const st = { rate: 8000, kanaele: 1, bits: 4 }, n = 512;
  const a = quant(ton(n, st.rate, [{ f: 250, a: 1 }]), 4);
  flacDatei('flac-4bit.flac', st, [a], bloecke(n, 256, (i) => ({ rateCode: 0, bitsCode: 0, sub: [i ? { art: 'fest', ordnung: 1 } : { art: 'roh' }] })));
}
{
  // verschwendete Bits: links × 8, rechts × 256, 16 bit Stereo 16 000 Hz; auch Seitenkanal, konstant und roh
  const st = { rate: 16000, kanaele: 2, bits: 16 }, n = 256 * 4;
  const l = quant(ton(n, st.rate, [{ f: 400, a: 0.8 }]), 16).map((v) => v - (((v % 8) + 8) % 8)), r = quant(ton(n, st.rate, [{ f: 200, a: 0.8 }]), 16).map((v) => v - (((v % 256) + 256) % 256));
  for (let i = 512; i < 768; i++) r[i] = -512;
  flacDatei('flac-verschwendet.flac', st, [l, r], [
    { n: 256, sub: [{ art: 'fest', ordnung: 2, verschwendet: 3 }, { art: 'fest', ordnung: 1, verschwendet: 8 }] },
    { n: 256, modus: 1, sub: [{ art: 'lpc', koeff: [1500, -700], genau: 12, schub: 10, verschwendet: 3 }, { art: 'fest', ordnung: 2, verschwendet: 3 }] },
    { n: 256, sub: [{ art: 'roh', verschwendet: 2 }, { art: 'konstant', verschwendet: 9 }] },
    { n: 256, modus: 3, sub: [{ art: 'fest', ordnung: 1, verschwendet: 2 }, { art: 'roh', verschwendet: 3 }] },
  ]);
}
{
  // variable Blockgröße mit jedem Blockgrößen-Code, 16 bit Mono 22 050 Hz; große Blöcke konstant
  const st = { rate: 22050, kanaele: 1, bits: 16, variabel: true };
  const groessen = [192, 576, 1152, 2304, 4608, 17, 1, 300, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
  const n = groessen.reduce((a, b) => a + b, 0), t = quant(ton(n, st.rate, [{ f: 330, a: 0.4 }], 0.001, 0.01), 16);
  let p = 0;
  const liste = groessen.map((g) => {
    const konst = g >= 8192;
    if (konst) for (let i = p; i < p + g; i++) t[i] = g === 8192 ? 0 : g === 16384 ? 77 : -77;
    p += g;
    return { n: g, sub: [konst ? { art: 'konstant' } : g < 3 ? { art: 'roh' } : { art: 'fest', ordnung: 2 }] };
  });
  flacDatei('flac-variabel.flac', st, [t], liste);
}
{
  // weitere Metadaten (PADDING, APPLICATION, SEEKTABLE, VORBIS_COMMENT), total_samples 0, 88 200 Hz Stereo, ID3v1 am Ende
  const st = { rate: 88200, kanaele: 2, bits: 16, gesamt: 0 }, n = 4608 + 1000;
  const l = quant(ton(n, st.rate, [{ f: 880, a: 0.5 }]), 16), r = quant(ton(n, st.rate, [{ f: 1100, a: 0.5 }]), 16);
  const vc = Buffer.concat([Buffer.from([5, 0, 0, 0]), Buffer.from('pizza'), Buffer.from([1, 0, 0, 0, 10, 0, 0, 0]), Buffer.from('TITLE=Ofen')]);
  const id3 = Buffer.concat([Buffer.from('TAG'), Buffer.alloc(125, 0x20)]);
  flacDatei('flac-metadaten.flac', st, [l, r], bloecke(n, 4608, { modus: 3, sub: [{ art: 'fest', ordnung: 2 }] }),
    [{ typ: 3, daten: Buffer.alloc(18) }, { typ: 2, daten: Buffer.from('pzza1234') }, { typ: 4, daten: vc }, { typ: 1, daten: Buffer.alloc(13) }], id3);
}
{
  // akkord-stereo.flac: 16 bit Stereo 44 100 Hz, 0,25 s, Mitte/Seite – C-Dur-Akkord, leicht verteilt
  const st = { rate: 44100, kanaele: 2, bits: 16 }, n = 11025;
  const l = quant(ton(n, st.rate, [{ f: 261.63, a: 0.22 }, { f: 329.63, a: 0.18 }, { f: 392.0, a: 0.12 }], 0.01, 0.6), 16);
  const r = quant(ton(n, st.rate, [{ f: 261.63, a: 0.18 }, { f: 329.63, a: 0.18 }, { f: 392.0, a: 0.16 }], 0.01, 0.6), 16);
  flacDatei('akkord-stereo.flac', st, [l, r], bloecke(n, 4096, (i) => ({ modus: 3, sub: [{ art: 'fest', ordnung: 3, po: i < 2 ? 4 : 0 }] })));
}
{
  // klick-24.flac: 24 bit Mono 48 000 Hz, 0,1 s – ein kurzer Holzklick
  const st = { rate: 48000, kanaele: 1, bits: 24 }, n = 4800;
  const a = Array.from(ton(n, st.rate, [{ f: 1800, a: 0.6 }, { f: 2700, a: 0.3 }], 0.0005, 0.97), (v, i) => v / (1 + i / 120));
  flacDatei('klick-24.flac', st, [quant(a, 24)], [{ n: 4096, sub: [{ art: 'fest', ordnung: 3, po: 5 }] }, { n: 704, sub: [{ art: 'fest', ordnung: 2, po: 3 }] }]);
}

// ---------------------------------------------------------------- mit ffmpeg kodiert (eingecheckt; Quelle hier, verlustfrei)
const FFMPEG = [
  { name: 'ffmpeg-stereo-24.flac', rate: 44100, kanaele: 2, bits: 24, ks: () => [quant(ton(2205, 44100, [{ f: 440, a: 0.5 }]), 24), quant(rauschen(2205, 5), 24).map((v) => v >> 3)] },
  { name: 'ffmpeg-mono-16.flac', rate: 22050, kanaele: 1, bits: 16, ks: () => [quant(ton(2205, 22050, [{ f: 300, a: 0.6 }, { f: 2500, a: 0.1 }]), 16)] },
];
for (const f of FFMPEG) {
  const ks = f.ks();
  if (ffmpegQuellen) {
    fs.mkdirSync(ffmpegQuellen, { recursive: true });
    fs.writeFileSync(path.join(ffmpegQuellen, f.name.replace('.flac', '.wav')), wav({ kanaele: f.kanaele, rate: f.rate, bits: f.bits, werte: verschachtle(ks) }));
  }
  erwarte(f.name, f.rate, f.kanaele, f.bits, verschachtle(ks), true, false);
}

// ================================================================ Fehlerdateien
{
  const w = wav({ kanaele: 1, rate: 8000, bits: 16, werte: [1, 2, 3] });
  fehler('fehler-kaputt.wav', w.subarray(0, 12 + 8 + 6), TEXT.kein);           // fmt-Abschnitt abgeschnitten
}
{
  const st = { rate: 44100, kanaele: 1, bits: 16 }, n = 512;
  const b = flac(st, [quant(ton(n, st.rate, [{ f: 440, a: 0.5 }]), 16)], bloecke(n, 256, { sub: [{ art: 'fest', ordnung: 2 }] }));
  b[b.length - 20] ^= 0x10;                                                     // ein Bit im letzten Rahmen → CRC-16 falsch
  fehler('fehler-crc.flac', b, TEXT.kein);
}
{
  const st = { rate: 8000, kanaele: 1, bits: 16, gesamt: 601 * 8000 };
  fehler('fehler-zu-lang.flac', flac(st, [quant(ton(64, 8000, [{ f: 440, a: 0.5 }]), 16)], [{ n: 64, sub: [{ art: 'roh' }] }]), TEXT.lang(601 * 8000, 8000));
}
fehler('fehler-zu-lang.wav', wav({ kanaele: 1, rate: 8000, bits: 8, werte: new Array(100).fill(3), dataGroesse: 601 * 8000 }), TEXT.lang(601 * 8000, 8000));
fehler('fehler-kanaele.wav', wav({ kanaele: 6, rate: 48000, bits: 16, werte: new Array(60).fill(5) }), TEXT.kanaele(6));
fehler('fehler-rate.wav', wav({ kanaele: 1, rate: 192000, bits: 16, werte: new Array(60).fill(5) }), TEXT.rate(192000));
fehler('fehler-format.wav', wav({ tag: 2, kanaele: 1, rate: 22050, bits: 8, werte: new Array(64).fill(1) }), TEXT.wav);   // ADPCM
fehler('fehler-format-float64.wav', (() => { const w = wav({ tag: 3, kanaele: 1, rate: 44100, bits: 32, werte: new Array(16).fill(0) }); w.writeUInt16LE(64, 34); w.writeUInt16LE(8, 32); return w; })(), TEXT.wav);
fehler('fehler-format-extensible.wav', wav({ kanaele: 2, rate: 44100, bits: 16, ext: true, guid: Buffer.alloc(16, 0x42), werte: new Array(8).fill(0) }), TEXT.wav);
fehler('fehler-null.wav', wav({ kanaele: 1, rate: 44100, bits: 16, werte: [] }), TEXT.kein);
fehler('fehler-kein-klang.ogg', Buffer.concat([Buffer.from('OggS'), Buffer.alloc(60, 7)]), TEXT.kein);
{
  const ein = (st, n) => flac(st, Array.from({ length: st.kanaele }, () => new Array(n).fill(1)), [{ n, sub: [{ art: 'konstant' }] }]);
  const b32 = ein({ rate: 44100, kanaele: 1, bits: 24 }, 32);
  b32[8 + 12] |= 0x01; b32[8 + 13] |= 0xF0;                                     // STREAMINFO: 32 bit
  fehler('fehler-format.flac', b32, TEXT.flac);
  const b6 = ein({ rate: 44100, kanaele: 2, bits: 16 }, 32);
  b6[8 + 12] = (b6[8 + 12] & 0xF1) | (5 << 1);                                  // STREAMINFO: 6 Kanäle
  fehler('fehler-kanaele.flac', b6, TEXT.kanaele(6));
  fehler('fehler-rate.flac', ein({ rate: 4000, kanaele: 1, bits: 16 }, 32), TEXT.rate(4000));
  // Rahmen mit anderer Rate als STREAMINFO
  const st = { rate: 48000, kanaele: 1, bits: 16 };
  fehler('fehler-rahmen-rate.flac', flac(st, [new Array(64).fill(9)], [{ n: 64, rateCode: 9, sub: [{ art: 'konstant' }] }]), TEXT.kein);
  // 9 Minuten 96 kHz Stereo laut STREAMINFO → vorgebacken zu groß (vor dem Dekodieren)
  const g = { rate: 96000, kanaele: 2, bits: 16, gesamt: 540 * 96000 };
  fehler('fehler-zu-gross.flac', flac(g, [new Array(64).fill(1), new Array(64).fill(2)], [{ n: 64, sub: [{ art: 'konstant' }] }]), TEXT.teig(64 + 540 * 96000 * 4));
}
{
  // total_samples unbekannt: laufende Prüfung (konstante Rahmen à 65 535)
  const viele = (st, rahmenZahl, wert) => {
    const n = rahmenZahl * 65535, ks = Array.from({ length: st.kanaele }, () => new Array(n).fill(wert));
    return flac(st, ks, bloecke(n, 65535, { sub: [{ art: 'konstant' }] }));
  };
  fehler('fehler-zu-gross-unbekannt.flac', viele({ rate: 96000, kanaele: 2, bits: 16, gesamt: 0, ohneMd5: true }, 257, 100), TEXT.teig(64 + 257 * 65535 * 4));
  fehler('fehler-zu-lang-unbekannt.flac', viele({ rate: 8000, kanaele: 1, bits: 16, gesamt: 0, ohneMd5: true }, 74, -3), TEXT.lang(74 * 65535, 8000));
}

// ---------------------------------------------------------------- schreiben / prüfen
const kopfzeilen = ['# Erwartete Klangteige (scripts/klaenge-test.js): name rate kanaele bits frames flags sha256(PCM i16) sha256(Rohwerte i32)',
  '# bzw. name fehler code text'];
dateien['erwartet.txt'] = Buffer.from(kopfzeilen.concat(erwartet).join('\n') + '\n', 'utf8');
let abweichend = 0, summe = 0;
for (const name of Object.keys(dateien).sort()) {
  const ziel = path.join(ZIEL, name);
  summe += dateien[name].length;
  if (pruefe) {
    let alt = null;
    try { alt = fs.readFileSync(ziel); } catch (e) { /* fehlt */ }
    // Textdateien: ein Checkout mit core.autocrlf liefert CRLF
    if (alt && name.endsWith('.txt')) alt = Buffer.from(alt.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    if (!alt || !alt.equals(dateien[name])) { abweichend++; console.log('weicht ab: ' + name); }
  } else {
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, dateien[name]);
  }
}
for (const f of FFMPEG) if (!fs.existsSync(path.join(ZIEL, f.name))) console.log('fehlt (mit ffmpeg erzeugen): ' + f.name);
if (pruefe && abweichend) { console.log(abweichend + ' Testklang/-klänge weichen ab – node scripts/klaenge-test.js'); process.exit(1); }
console.log((pruefe ? 'geprüft: ' : 'geschrieben: ') + Object.keys(dateien).length + ' Dateien, ' + (summe / 1024).toFixed(1) + ' KiB nach herd/teigling/testklaenge/');
