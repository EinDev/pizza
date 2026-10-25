#!/usr/bin/env node
'use strict';
/*
 * Bilder für die Herd-Beispiele „Teigball“, „Teigfänger“ und „Steuerung“ (PROJEKTE.md PB4), reproduzierbar und ohne
 * Abhängigkeiten – alles prozedural gemalt (eigener kleiner Rasterer mit Kantenglättung, Rauschen, Wölbungslicht).
 *
 *   node scripts/texturen-herd.js [--nur teigball,teigfaenger,steuerung]
 *
 * Ziel: site/beispiele/herd/<beispiel>/bilder/. Gleiche Eingabe → gleiche Bytes (fester Zufall, nur Node-Bordmittel).
 * Sprites sind in doppelter Auflösung gemalt und werden mit groesse 0.5 gezeichnet: gleiche Größe auf dem Spielfeld wie die
 * früheren Text-Bildchen (gleiche Hüllen für trifft), aber weich verkleinert über die Mipmaps (PROJEKTE.md §5.5).
 * Texturen ohne Durchsichtiges (3D) als JPEG, Sprites mit Alpha als PNG. PNG-/JPEG-Schreiber wie scripts/texturen-neon.js.
 * Nach dem Ändern: node scripts/beispiele.js --schreibe und node tests/herd/bild.js site/beispiele/herd/<name> --schreibe.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WURZEL = path.join(__dirname, '..');
const HERD = path.join(WURZEL, 'site', 'beispiele', 'herd');
const argv = process.argv.slice(2);
const wert = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const NUR = wert('--nur') ? new Set(wert('--nur').split(',')) : null;
const soll = (name) => !NUR || NUR.has(name);

// ================================================================ PNG / JPEG schreiben (wie scripts/texturen-neon.js)
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function pngAbschnitt(typ, daten) {
  const b = Buffer.alloc(12 + daten.length);
  b.writeUInt32BE(daten.length, 0);
  b.write(typ, 4, 'ascii');
  Buffer.from(daten).copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + daten.length)), 8 + daten.length);
  return b;
}
function png(b, h, rgba) {
  const zeile = b * 4;
  const roh = Buffer.alloc((zeile + 1) * h);
  for (let y = 0; y < h; y++) {
    roh[y * (zeile + 1)] = 4; // Paeth
    for (let x = 0; x < zeile; x++) {
      const i = y * zeile + x;
      const a = x >= 4 ? rgba[i - 4] : 0, o = y > 0 ? rgba[i - zeile] : 0, ao = x >= 4 && y > 0 ? rgba[i - zeile - 4] : 0;
      const p = a + o - ao, pa = Math.abs(p - a), pb = Math.abs(p - o), pc = Math.abs(p - ao);
      roh[y * (zeile + 1) + 1 + x] = (rgba[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? o : ao)) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(b, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngAbschnitt('IHDR', ihdr),
    pngAbschnitt('IDAT', zlib.deflateSync(roh, { level: 9 })), pngAbschnitt('IEND', Buffer.alloc(0))]);
}

const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const Q_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const Q_CHROMA = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
// Standard-Huffman-Tabellen (ITU T.81, Anhang K)
const DC_L = [[0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]];
const DC_C = [[0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]];
const AC_L = [[0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa]];
const AC_C = [[0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
  0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
  0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
  0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa]];
function huffCodes([anz, werte]) {
  const t = {}; let code = 0, k = 0;
  for (let l = 1; l <= 16; l++) { for (let i = 0; i < anz[l - 1]; i++) t[werte[k++]] = [code++, l]; code <<= 1; }
  return t;
}
const qTab = (basis, q) => basis.map((v) => Math.min(255, Math.max(1, Math.floor((v * (q < 50 ? 5000 / q : 200 - 2 * q) + 50) / 100))));
const COS = []; for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) COS[x * 8 + u] = Math.cos((2 * x + 1) * u * Math.PI / 16);
function dct(blk) {
  const aus = new Float64Array(64), tmp = new Float64Array(64);
  for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += blk[y * 8 + x] * COS[x * 8 + u]; tmp[y * 8 + u] = s * (u === 0 ? Math.SQRT1_2 : 1) / 2; }
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let y = 0; y < 8; y++) s += tmp[y * 8 + u] * COS[y * 8 + v]; aus[v * 8 + u] = s * (v === 0 ? Math.SQRT1_2 : 1) / 2; }
  return aus;
}
/** RGBA → Baseline-JPEG (JFIF, Standard-Huffman, Chroma 4:2:0). */
function jpeg(b, h, rgba, qualitaet) {
  const ql = qTab(Q_LUMA, qualitaet), qc = qTab(Q_CHROMA, qualitaet);
  const hdl = huffCodes(DC_L), hdc = huffCodes(DC_C), hal = huffCodes(AC_L), hac = huffCodes(AC_C);
  const aus = [];
  const w8 = (...x) => { for (const v of x) aus.push(v); };
  const w16 = (x) => w8(x >> 8, x & 255);
  w8(0xff, 0xd8, 0xff, 0xe0); w16(16); w8(0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0); w16(1); w16(1); w8(0, 0);
  w8(0xff, 0xdb); w16(2 + 65 * 2); w8(0); for (let i = 0; i < 64; i++) w8(ql[ZIGZAG[i]]); w8(1); for (let i = 0; i < 64; i++) w8(qc[ZIGZAG[i]]);
  w8(0xff, 0xc0); w16(17); w8(8); w16(h); w16(b); w8(3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  const dht = (klasse, id, [anz, werte]) => { w8(0xff, 0xc4); w16(3 + 16 + werte.length); w8(klasse << 4 | id, ...anz, ...werte); };
  dht(0, 0, DC_L); dht(1, 0, AC_L); dht(0, 1, DC_C); dht(1, 1, AC_C);
  w8(0xff, 0xda); w16(12); w8(3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0);
  let puffer = 0, n = 0;
  const bits = (code, len) => {
    puffer = (puffer << len) | code; n += len;
    while (n >= 8) { const by = (puffer >> (n - 8)) & 255; aus.push(by); if (by === 255) aus.push(0); n -= 8; puffer &= (1 << n) - 1; }
  };
  const kat = (v) => { let a = Math.abs(v), c = 0; while (a) { c++; a >>= 1; } return c; };
  const roh = (v, c) => (v < 0 ? v + (1 << c) - 1 : v);
  const block = (blk, q, dcT, acT, vor) => {
    const d = dct(blk), z = new Int32Array(64);
    for (let i = 0; i < 64; i++) z[i] = Math.round(d[ZIGZAG[i]] / q[ZIGZAG[i]]);
    const diff = z[0] - vor, c = kat(diff);
    bits(...dcT[c]); if (c) bits(roh(diff, c), c);
    let lauf = 0;
    for (let i = 1; i < 64; i++) {
      if (z[i] === 0) { lauf++; continue; }
      while (lauf > 15) { bits(...acT[0xf0]); lauf -= 16; }
      const ca = kat(z[i]); bits(...acT[(lauf << 4) | ca]); bits(roh(z[i], ca), ca); lauf = 0;
    }
    if (lauf) bits(...acT[0]);
    return z[0];
  };
  const Y = new Float64Array(b * h), Cb = new Float64Array(b * h), Cr = new Float64Array(b * h);
  for (let i = 0; i < b * h; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], bl = rgba[i * 4 + 2];
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * bl - 128;
    Cb[i] = -0.168736 * r - 0.331264 * g + 0.5 * bl;
    Cr[i] = 0.5 * r - 0.418688 * g - 0.081312 * bl;
  }
  const lies = (k, x, y) => k[Math.min(y, h - 1) * b + Math.min(x, b - 1)];
  let pY = 0, pB = 0, pR = 0;
  const blk = new Float64Array(64);
  for (let my = 0; my < h; my += 16) for (let mx = 0; mx < b; mx += 16) {
    for (let by = 0; by < 16; by += 8) for (let bx = 0; bx < 16; bx += 8) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) blk[y * 8 + x] = lies(Y, mx + bx + x, my + by + y);
      pY = block(blk, ql, hdl, hal, pY);
    }
    for (const k of [Cb, Cr]) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        blk[y * 8 + x] = (lies(k, mx + x * 2, my + y * 2) + lies(k, mx + x * 2 + 1, my + y * 2) + lies(k, mx + x * 2, my + y * 2 + 1) + lies(k, mx + x * 2 + 1, my + y * 2 + 1)) / 4;
      }
      if (k === Cb) pB = block(blk, qc, hdc, hac, pB); else pR = block(blk, qc, hdc, hac, pR);
    }
  }
  if (n > 0) bits((1 << (8 - n)) - 1, 8 - n);
  w8(0xff, 0xd9);
  return Buffer.from(aus);
}

// ================================================================ Werkzeuge: Zahlen, Farben, Zufall, Rauschen
const klemme = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const mische = (a, b, t) => a + (b - a) * t;
const weich = (a, b, v) => { const t = klemme((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/** '#rrggbb' bzw. '#rrggbbaa' → [r, g, b, a] (0 … 1) */
function farbe(hex, alpha) {
  const n = hex.slice(1);
  const k = (i) => parseInt(n.slice(i, i + 2), 16) / 255;
  return [k(0), k(2), k(4), alpha !== undefined ? alpha : n.length >= 8 ? k(6) : 1];
}
const mischeFarbe = (a, b, t) => [mische(a[0], b[0], t), mische(a[1], b[1], t), mische(a[2], b[2], t), mische(a[3], b[3], t)];
const hell = (c, f) => [klemme(c[0] * f), klemme(c[1] * f), klemme(c[2] * f), c[3]];
const mitAlpha = (c, a) => [c[0], c[1], c[2], c[3] * a];

/** fester Zufall (mulberry32) */
function zufall(saat) {
  let s = saat >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function streu(ix, iy, s) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Wertrauschen 0 … 1; mit Periode px/py kachelbar */
function rauschen(x, y, s, px, py) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = (i, p) => (p ? ((i % p) + p) % p : i);
  const a = streu(w(ix, px), w(iy, py), s), b = streu(w(ix + 1, px), w(iy, py), s);
  const c = streu(w(ix, px), w(iy + 1, py), s), d = streu(w(ix + 1, px), w(iy + 1, py), s);
  return mische(mische(a, b, u), mische(c, d, u), v);
}
/** fraktales Rauschen 0 … 1 (Oktaven verdoppeln die Frequenz, Periode wächst mit) */
function fbm(x, y, s, okt = 4, px = 0, py = 0) {
  let summe = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < okt; o++) {
    summe += amp * rauschen(x * f, y * f, s + o * 101, px * f, py * f);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return summe / norm;
}

// ================================================================ Leinwand: Formen mit Kantenglättung (vormultipliziert)
class Leinwand {
  constructor(b, h, grund) {
    this.b = b; this.h = h; this.p = new Float32Array(b * h * 4);
    if (grund) this.jedes(() => grund);
  }
  /** deckt Pixel ab, deren Mitte in der Form liegt (sdf < 0, Kante `kante` Pixel weich); f = Farbe oder (x, y, d) → Farbe */
  male(sdf, f, kante = 1, box) {
    const [x0, y0, x1, y1] = box ? [Math.max(0, Math.floor(box[0])), Math.max(0, Math.floor(box[1])), Math.min(this.b, Math.ceil(box[2])), Math.min(this.h, Math.ceil(box[3]))] : [0, 0, this.b, this.h];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const d = sdf(px, py);
      const deck = klemme(0.5 - d / kante);
      if (deck <= 0) continue;
      const c = typeof f === 'function' ? f(px, py, d) : f;
      this.lege(x, y, c, deck);
    }
  }
  /** jedes Pixel: f(x, y) → Farbe (oder null) darüberlegen */
  jedes(f) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.b; x++) {
      const c = f(x + 0.5, y + 0.5);
      if (c) this.lege(x, y, c, 1);
    }
  }
  lege(x, y, c, deck) {
    const a = klemme(c[3] * deck), i = (y * this.b + x) * 4, p = this.p;
    p[i] = c[0] * a + p[i] * (1 - a);
    p[i + 1] = c[1] * a + p[i + 1] * (1 - a);
    p[i + 2] = c[2] * a + p[i + 2] * (1 - a);
    p[i + 3] = a + p[i + 3] * (1 - a);
  }
  rgba8() {
    const o = new Uint8Array(this.b * this.h * 4), p = this.p;
    for (let i = 0; i < this.b * this.h; i++) {
      const a = p[i * 4 + 3];
      if (a <= 0.0005) continue;
      for (let c = 0; c < 3; c++) o[i * 4 + c] = Math.round(klemme(p[i * 4 + c] / a) * 255);
      o[i * 4 + 3] = Math.round(klemme(a) * 255);
    }
    return o;
  }
}

// ---------------- Formen als vorzeichenbehaftete Abstände (Pixel, innen negativ)
const kreis = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const ellipse = (cx, cy, rx, ry) => (x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
function rundRechteck(cx, cy, hb, hh, r) {
  return (x, y) => {
    const qx = Math.abs(x - cx) - hb + r, qy = Math.abs(y - cy) - hh + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
}
function kapsel(ax, ay, bx, by, r) {
  return (x, y) => {
    const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
    const h = klemme((pax * bax + pay * bay) / (bax * bax + bay * bay));
    return Math.hypot(pax - bax * h, pay - bay * h) - r;
  };
}
function vieleck(pk) {
  return (x, y) => {
    let d = Infinity, s = 1;
    for (let i = 0, j = pk.length - 1; i < pk.length; j = i, i++) {
      const [xi, yi] = pk[i], [xj, yj] = pk[j];
      const ex = xj - xi, ey = yj - yi, wx = x - xi, wy = y - yi;
      const h = klemme((wx * ex + wy * ey) / (ex * ex + ey * ey));
      d = Math.min(d, Math.hypot(wx - ex * h, wy - ey * h));
      const c1 = y >= yi, c2 = y < yj, c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    return s * d;
  };
}
const vereint = (...f) => (x, y) => Math.min(...f.map((g) => g(x, y)));
const schnitt = (...f) => (x, y) => Math.max(...f.map((g) => g(x, y)));
const ohne = (a, b) => (x, y) => Math.max(a(x, y), -b(x, y));
/** Form um (cx, cy) gedreht (Grad, im Uhrzeigersinn auf dem Bildschirm) */
function gedreht(f, cx, cy, grad) {
  const w = -grad * Math.PI / 180, c = Math.cos(w), s = Math.sin(w);
  return (x, y) => f(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c);
}
const verschoben = (f, dx, dy) => (x, y) => f(x - dx, y - dy);

/** Wölbung: Fläche als Kissen (Rand `rand` Pixel hoch), Licht von links oben → Helligkeit und Glanz */
const LICHT = (() => { const l = [-0.45, -0.65, 0.62], n = Math.hypot(...l); return l.map((v) => v / n); })();
const HALB = (() => { const h = [LICHT[0], LICHT[1], LICHT[2] + 1], n = Math.hypot(...h); return h.map((v) => v / n); })();
function woelbung(f, rand) {
  const hoehe = (x, y) => { const t = klemme(-f(x, y) / rand); return Math.sqrt(1 - (1 - t) * (1 - t)) * rand; };
  return (x, y) => {
    const nx = -(hoehe(x + 0.7, y) - hoehe(x - 0.7, y)) / 1.4, ny = -(hoehe(x, y + 0.7) - hoehe(x, y - 0.7)) / 1.4;
    const n = Math.hypot(nx, ny, 1);
    const l = (nx * LICHT[0] + ny * LICHT[1] + LICHT[2]) / n;
    const g = Math.max(0, (nx * HALB[0] + ny * HALB[1] + HALB[2]) / n);
    return { licht: 0.45 + 0.62 * Math.max(0, l), glanz: Math.pow(g, 24) };
  };
}
/** Farbe mit Wölbungslicht; glanz = Stärke des Glanzpunkts */
function schattiert(basis, w, glanz = 0.35) {
  return (x, y) => {
    const c = typeof basis === 'function' ? basis(x, y) : basis, s = w(x, y);
    const g = s.glanz * glanz;
    return [klemme(c[0] * s.licht + g), klemme(c[1] * s.licht + g), klemme(c[2] * s.licht + g), c[3]];
  };
}

// ---------------- Ausgabe
let summe = 0;
function schreibe(ordner, datei, lw, art = 'png', qualitaet = 88) {
  const ziel = path.join(HERD, ordner, 'bilder', datei);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  const px = lw.rgba8();
  if (art === 'jpg') for (let i = 3; i < px.length; i += 4) px[i] = 255;
  const bytes = art === 'jpg' ? jpeg(lw.b, lw.h, px, qualitaet) : png(lw.b, lw.h, px);
  fs.writeFileSync(ziel, bytes);
  summe += bytes.length;
  console.log(ordner + '/bilder/' + datei + '  ' + lw.b + '×' + lw.h + '  ' + (bytes.length / 1024).toFixed(1) + ' KiB');
}

// ================================================================ Teigball (3D-Texturen)
/** Tischdecke: Vichy-Karo aus gewebtem Stoff, 2 × 2 Karos je Kachel (der Belag wiederholt sie mit `kachel`) */
function tischdecke() {
  const N = 256, lw = new Leinwand(N, N);
  const rot = farbe('#b8432f'), creme = farbe('#f3e6d0');
  lw.jedes((x, y) => {
    const sx = (x % 128) < 64 ? 1 : 0, sy = (y % 128) < 64 ? 1 : 0;          // Streifen in Kette und Schuss
    const anteil = (sx + sy) / 2;
    let c = mischeFarbe(creme, rot, anteil === 1 ? 1 : anteil * 0.55);
    // Gewebe: Fäden 4 px, abwechselnd oben Kette/Schuss
    const fx = (x % 4) / 4, fy = (y % 4) / 4, oben = ((Math.floor(x / 4) + Math.floor(y / 4)) & 1) === 0;
    const faden = oben ? 0.92 + 0.12 * Math.sin(fx * Math.PI) : 0.92 + 0.12 * Math.sin(fy * Math.PI);
    const n = fbm(x / 32, y / 32, 7, 4, 8, 8);
    const fleck = 0.94 + 0.1 * n;
    return hell(c, faden * fleck);
  });
  schreibe('teigball', 'tischdecke.png', lw);
}

/** Pizza von oben (Deckel des Zylinders: Kreis mit Radius N/2): Tomatensoße, zerlaufener Mozzarella, Bräune, Kräuter */
function pizzaOben() {
  const N = 1024, h = N / 2, lw = new Leinwand(N, N);
  const sosse = farbe('#c43a1f'), sosseDunkel = farbe('#8e2414'), sosseHell = farbe('#e0592c');
  const kaese = farbe('#f6ecd2'), kaeseGold = farbe('#e8c27a'), braun = farbe('#b0763a'), teig = farbe('#e9c48c');
  const z = zufall(4711);
  const kraeuter = [];
  for (let i = 0; i < 260; i++) {
    const r = Math.sqrt(z()) * h * 0.93, w = z() * Math.PI * 2;
    kraeuter.push([h + r * Math.cos(w), h + r * Math.sin(w), 1.6 + z() * 2.4, z() * 180]);
  }
  // Mozzarella: einzelne zerlaufene Scheiben (Kreise mit verbeultem Rand)
  const scheiben = [];
  for (let i = 0; i < 22; i++) {
    const r = Math.sqrt(z()) * h * 0.72, w = z() * Math.PI * 2;
    scheiben.push([h + r * Math.cos(w), h + r * Math.sin(w), 46 + z() * 46]);
  }
  lw.jedes((x, y) => {
    const dx = (x - h) / h, dy = (y - h) / h, r = Math.hypot(dx, dy);
    // Soße mit Struktur
    const s1 = fbm(x / 40, y / 40, 11, 5), s2 = fbm(x / 9, y / 9, 12, 3);
    let c = mischeFarbe(sosseDunkel, sosse, weich(0.25, 0.6, s1));
    c = mischeFarbe(c, sosseHell, weich(0.6, 0.85, s2) * 0.5);
    // Rand: Soße läuft unregelmäßig aus, darunter heller Teig (Winkel kachelbar → keine Naht)
    const winkel = (Math.atan2(dy, dx) / (2 * Math.PI) + 0.5) * 24;
    const rand = 0.9 + 0.06 * fbm(winkel, r * 2, 13, 3, 24, 0);
    c = mischeFarbe(c, teig, weich(rand - 0.02, rand + 0.02, r));
    // Mozzarella: Abstand zur nächsten Scheibe, Rand vom Rauschen verbeult, zur Kante hin goldbraun
    const beule = 0.75 + 0.5 * fbm(x / 18, y / 18, 21, 3);
    let k = -1;
    for (const [sx, sy, sr] of scheiben) k = Math.max(k, 1 - Math.hypot(x - sx, y - sy) / (sr * beule));
    const kaeseAnteil = weich(0, 0.04, k);
    if (kaeseAnteil > 0) {
      let kc = mischeFarbe(kaeseGold, kaese, weich(0.02, 0.3, k));
      kc = hell(kc, 0.95 + 0.08 * fbm(x / 10, y / 10, 22, 2));
      const blase = weich(0.74, 0.82, fbm(x / 9, y / 9, 24, 3)) * 0.7;           // braune Röstblasen
      kc = mischeFarbe(kc, braun, blase);
      c = mischeFarbe(c, kc, kaeseAnteil * (1 - weich(rand - 0.05, rand, r)));
    }
    return c;
  });
  // Oregano und Basilikum-Krümel
  for (const [kx, ky, kr, w] of kraeuter) {
    const f = gedreht(ellipse(kx, ky, kr * 1.6, kr * 0.8), kx, ky, w);
    lw.male(f, farbe(kr > 3.4 ? '#2f6b22' : '#4a5a1f', 0.9), 1, [kx - 8, ky - 8, kx + 8, ky + 8]);
  }
  schreibe('teigball', 'pizza.jpg', lw, 'jpg', 86);
}

/** Kruste: goldbrauner Teig mit dunkleren Röststellen und Mehlstaub (ohne Richtung – passt auf jede Abbildung) */
function kruste() {
  const N = 512, lw = new Leinwand(N, N);
  const hellT = farbe('#e8b877'), dunkel = farbe('#b06a2c'), roest = farbe('#6e3a18'), mehl = farbe('#f7ecd8');
  const krume = (x, y, kx, ky) => {                                             // kx, ky: Pixel je Rauschzelle (teilen die Kante)
    let c = mischeFarbe(hellT, dunkel, weich(0.35, 0.75, fbm(x / kx, y / ky, 31, 5, N / kx, lw.h / ky)));
    c = mischeFarbe(c, roest, weich(0.7, 0.82, fbm(x / (kx / 2), y / (ky / 2), 32, 3, 2 * N / kx, 2 * lw.h / ky)) * 0.8);
    c = mischeFarbe(c, mehl, weich(0.72, 0.8, fbm(x / (kx / 8), y / (ky / 8), 33, 2, 8 * N / kx, 8 * lw.h / ky)) * 0.55);
    return hell(c, 0.92 + 0.12 * rauschen(x / 2, y / 2, 34, N / 2, lw.h / 2));
  };
  lw.jedes((x, y) => krume(x, y, 64, 64));
  schreibe('teigball', 'kruste.jpg', lw, 'jpg', 85);
  // Rand (Ring: u = rundherum, v = um den Wulst): flach und breit, damit die Krume auf dem langen Ring nicht verzerrt
  // (Ring 18,4 groß: rundherum ≈ 53 Einheiten auf 2048 Pixel, um den Wulst ≈ 3,6 Einheiten auf 256 Pixel → Rauschzellen 2 : 1)
  const lw2 = new Leinwand(2048, 256);
  lw2.jedes((x, y) => {
    let c = mischeFarbe(hellT, dunkel, weich(0.3, 0.75, fbm(x / 64, y / 32, 35, 4, 32, 8)));
    c = mischeFarbe(c, roest, weich(0.68, 0.8, fbm(x / 32, y / 16, 36, 3, 64, 16)) * 0.75);
    c = mischeFarbe(c, mehl, weich(0.72, 0.8, fbm(x / 8, y / 4, 37, 2, 256, 64)) * 0.5);
    return hell(c, 0.94 + 0.1 * rauschen(x / 2, y, 38, 1024, 256));
  });
  schreibe('teigball', 'rand.jpg', lw2, 'jpg', 85);
}

/** Ziegel für die Ofenkuppel (Kugel: u = rundherum, v = von oben nach unten), oben verrußt */
function ofenZiegel() {
  const B = 512, H = 256, lw = new Leinwand(B, H);
  const fuge = farbe('#8a7b6a'), russ = farbe('#2a1a14');
  const toene = ['#b5603a', '#a65232', '#c06d42', '#9c4a2c', '#b8673f'].map((t) => farbe(t));
  lw.jedes((x, y) => {
    const reihe = Math.floor(y / 16), versatz = (reihe & 1) * 16;
    const sx = (x + versatz) % 32, sy = y % 16, stein = Math.floor((x + versatz) / 32) % 16;
    const fugeAbst = Math.min(sx, 32 - sx, sy, 16 - sy);
    const t = toene[Math.floor(streu(stein, reihe, 41) * toene.length)];
    let c = hell(t, 0.88 + 0.22 * fbm(x / 10, y / 10, 42, 3, B / 10, 0));
    c = hell(c, 0.85 + 0.15 * klemme(fugeAbst / 3));                              // Kanten leicht dunkler
    c = mischeFarbe(c, fuge, weich(1.6, 0.6, fugeAbst));
    const v = y / H;                                                             // Ruß oben am Scheitel
    c = mischeFarbe(c, russ, klemme((0.32 - v) / 0.32) * 0.75 * (0.7 + 0.3 * fbm(x / 20, y / 20, 43, 3, B / 20, 0)));
    return c;
  });
  schreibe('teigball', 'ziegel.jpg', lw, 'jpg', 86);
}

/** Teig für die Kugel: heller Hefeteig, Mehl, ein paar Bläschen */
function teigKugel() {
  const B = 256, H = 128, lw = new Leinwand(B, H);
  const grund = farbe('#f0dcb4'), schatten = farbe('#d9b98a'), mehl = farbe('#fffaf0'), blase = farbe('#c99a62');
  lw.jedes((x, y) => {
    let c = mischeFarbe(grund, schatten, weich(0.45, 0.8, fbm(x / 22, y / 22, 51, 4, B / 22, 0)));
    c = mischeFarbe(c, mehl, weich(0.62, 0.78, fbm(x / 9, y / 9, 52, 3, B / 9, 0)) * 0.8);
    c = mischeFarbe(c, blase, weich(0.8, 0.86, fbm(x / 5, y / 5, 53, 2, B / 5, 0)) * 0.7);
    return c;
  });
  schreibe('teigball', 'teig.jpg', lw, 'jpg', 88);
}

/** Salami-Scheibe (Deckel des Zylinders): Fleisch mit Fettpunkten und Pfeffer, dunkle Pelle am Rand */
function salamiScheibe() {
  const N = 256, h = N / 2, lw = new Leinwand(N, N, farbe('#7a1c18'));
  const fleisch = farbe('#b3302b'), dunkel = farbe('#8a201d'), fett = farbe('#f2cdbd'), pfeffer = farbe('#2a1512');
  lw.jedes((x, y) => {
    const r = Math.hypot(x - h, y - h) / h;
    let c = mischeFarbe(dunkel, fleisch, weich(0.3, 0.7, fbm(x / 14, y / 14, 61, 4)));
    c = mischeFarbe(c, fett, weich(0.66, 0.7, fbm(x / 7 + 5, y / 7, 62, 3)));
    c = mischeFarbe(c, pfeffer, weich(0.86, 0.9, rauschen(x / 4, y / 4, 63)) * 0.9);
    c = mischeFarbe(c, farbe('#5e1512'), weich(0.88, 0.97, r));
    return c;
  });
  schreibe('teigball', 'salami.jpg', lw, 'jpg', 88);
}

/** Ananasschale (Mantel des Zylinders): Rautenmuster mit dunklen Augen, oben/unten grünlich */
function ananasSchale() {
  const B = 256, H = 256, lw = new Leinwand(B, H);
  const gelb = farbe('#e0a43a'), braun = farbe('#8a5a1e'), auge = farbe('#4a3010'), gruen = farbe('#7d8a2c');
  lw.jedes((x, y) => {
    const u = x / B * 8, v = y / H * 6;                                           // 8 Rauten rundherum, 6 hoch
    const a = u + v, b = u - v;
    const fa = a - Math.floor(a), fb = b - Math.floor(b);
    const kante = Math.min(fa, 1 - fa, fb, 1 - fb);
    const mitte = Math.hypot(fa - 0.5, fb - 0.5);
    let c = mischeFarbe(braun, gelb, weich(0.02, 0.2, kante));
    c = mischeFarbe(c, auge, weich(0.16, 0.06, mitte));
    c = mischeFarbe(c, gruen, Math.max(weich(0.25, 0, y / H), weich(0.75, 1, y / H)) * 0.6);
    return hell(c, 0.9 + 0.15 * fbm(x / 12, y / 12, 71, 3, B / 12, 0));
  });
  schreibe('teigball', 'ananas.jpg', lw, 'jpg', 88);
}

// ================================================================ Teigfänger (2D-Sprites, doppelte Auflösung)
/** Ziegel 120 × 44 (gezeichnet 60 × 22) in vier Farbtönen */
function ziegel(nr, ton) {
  const lw = new Leinwand(120, 44);
  const f = rundRechteck(60, 22, 59, 21, 6);
  const w = woelbung(f, 5);
  const t = farbe(ton);
  lw.male(f, schattiert((x, y) => {
    let c = hell(t, 0.86 + 0.24 * fbm(x / 9, y / 9, 80 + nr, 4));
    c = mischeFarbe(c, farbe('#3a1a10'), weich(0.82, 0.88, rauschen(x / 2.5, y / 2.5, 90 + nr)) * 0.5);   // Poren
    c = mischeFarbe(c, farbe('#e9b38c'), weich(0.78, 0.84, fbm(x / 5, y / 5, 95 + nr, 2)) * 0.35);       // helle Sandkörner
    return c;
  }, w, 0.15));
  schreibe('teigfaenger', 'ziegel-' + nr + '.png', lw);
}

/** Steinofen 680 × 500 (gezeichnet 340 × 250): Bogen aus Keilsteinen, dunkles Maul mit Glutschein, Ofenboden */
function steinofen() {
  const lw = new Leinwand(680, 500);
  const cx = 340, cy = 250;
  const aussen = rundRechteck(cx, cy, 324, 234, 224), maul = rundRechteck(cx, cy, 300, 210, 200);
  const bogen = ohne(aussen, maul);
  const stein = farbe('#7a3d28'), steinHell = farbe('#94503a');
  const wb = woelbung(bogen, 10);
  lw.male(bogen, (x, y) => {
    // Keilsteine: Winkel um einen Punkt unterhalb der Mitte, unten senkrechte Pfeiler in Lagen
    const w = Math.atan2(y - (cy + 40), x - cx), sektor = Math.floor((w + Math.PI) / (Math.PI / 13));
    const fw = ((w + Math.PI) / (Math.PI / 13)) % 1;
    let fugeAbst = Math.min(fw, 1 - fw) * 40;
    let id = sektor;
    if (y > cy + 40) { const lage = Math.floor((y - cy - 40) / 34); fugeAbst = Math.min(((y - cy - 40) % 34), 34 - ((y - cy - 40) % 34)); id = 100 + lage * 2 + (x > cx ? 1 : 0); }
    let c = mischeFarbe(stein, steinHell, streu(id, 3, 111));
    c = hell(c, 0.85 + 0.25 * fbm(x / 14, y / 14, 112, 4));
    const s = wb(x, y);
    c = hell(c, s.licht);
    c = mischeFarbe(c, farbe('#2a140c'), weich(2.5, 0.8, fugeAbst));
    return c;
  });
  // Maul: oben schwarz verrußt, unten warmer Glutschein
  lw.male(maul, (x, y) => {
    const v = klemme((y - (cy - 210)) / 420);
    let c = mischeFarbe(farbe('#140a08'), farbe('#3c160b'), weich(0.3, 1, v));
    const glut = Math.exp(-((x - cx) ** 2 / (2 * 150 ** 2) + (y - 430) ** 2 / (2 * 120 ** 2)));
    c = mischeFarbe(c, farbe('#c2501e'), glut * 0.65);
    c = mischeFarbe(c, farbe('#000000'), weich(14, 0, -maul(x, y)) * 0.5);       // Innenkante dunkel
    return c;
  });
  // Ofenboden (Steinplatte) mit Glutfunken
  const boden = rundRechteck(cx, 438, 250, 22, 16);
  const wbo = woelbung(boden, 6);
  lw.male(boden, schattiert((x, y) => {
    let c = hell(farbe('#4a281c'), 0.8 + 0.3 * fbm(x / 10, y / 10, 121, 3));
    c = mischeFarbe(c, farbe('#ff8a2a'), weich(0.78, 0.86, fbm(x / 4, y / 4, 122, 2)) * 0.8);
    return c;
  }, wbo, 0.1));
  schreibe('teigfaenger', 'ofen.png', lw);
}

/** Holzscheit 88 × 18 (gezeichnet 44 × 9): Rinde, helle Schnittfläche, glühendes Ende */
function holzscheit() {
  const lw = new Leinwand(88, 18);
  const f = rundRechteck(44, 9, 43, 8, 7);
  const w = woelbung(f, 5);
  lw.male(f, schattiert((x, y) => {
    let c = hell(farbe('#6a3f22'), 0.8 + 0.35 * fbm(x / 10, y / 2.5, 131, 3));
    c = mischeFarbe(c, farbe('#ff7a22'), weich(64, 86, x) * (0.5 + 0.5 * fbm(x / 3, y / 3, 132, 2)));
    return c;
  }, w, 0.1));
  lw.male(ellipse(8, 9, 5, 7), (x, y) => mischeFarbe(farbe('#d9a86c'), farbe('#9a6a3a'), 0.5 + 0.5 * Math.sin(Math.hypot(x - 8, y - 9) * 2.2)));
  schreibe('teigfaenger', 'holz.png', lw);
}

/** Flamme 80 × 80 (gezeichnet 40 bzw. 50): Schichten Rot → Orange → Gelb → Weiß, Zungen schwanken je Bild */
function flamme(nr, schwank, zungeL, zungeR) {
  const lw = new Leinwand(80, 80);
  const zunge = (cx, basis, spitze, breite, s) => (x, y) => {
    const t = klemme((basis - y) / (basis - spitze));                     // 0 unten … 1 Spitze
    if (y > basis) return Math.hypot(x - cx, y - basis) - breite;
    if (y < spitze) return Math.hypot(x - cx - s, y - spitze);
    const mitte = cx + s * t * t;
    return Math.abs(x - mitte) - breite * Math.pow(1 - t, 0.75);
  };
  const form = (k) => vereint(
    zunge(40, 62, 6 + (1 - k) * 2 + 14 * (1 - k), 18 * k, schwank * k),
    zunge(26, 64, 26 + zungeL * 10 + 18 * (1 - k), 9 * k, -6 * k),
    zunge(55, 64, 24 + zungeR * 10 + 18 * (1 - k), 9 * k, 7 * k));
  lw.male(form(1.15), farbe('#ff5a1a', 0.35), 8);                            // Schein
  lw.male(form(1), farbe('#e3401c'), 1.5);
  lw.male(verschoben(form(0.78), 0, 3), farbe('#ff8a22'), 2);
  lw.male(verschoben(form(0.55), 0, 7), farbe('#ffc93a'), 3);
  lw.male(verschoben(form(0.3), 0, 11), farbe('#fff4c8'), 4);
  schreibe('teigfaenger', 'flamme-' + nr + '.png', lw);
}

/** Beläge 48 × 48 (gezeichnet 24 × 24), je zwei Bilder: das zweite leicht gedreht (wackeln) */
function belagBilder(name, malen) {
  for (const [nr, winkel] of [[1, -8], [2, 8]]) {
    const lw = new Leinwand(48, 48);
    malen(lw, (f) => gedreht(f, 24, 24, winkel), nr);
    schreibe('teigfaenger', 'belaege/' + name + '-' + nr + '.png', lw);
  }
}
function belaege() {
  belagBilder('tomate', (lw, D) => {
    const aussen = D(kreis(24, 24, 20));
    lw.male(aussen, schattiert(farbe('#d42a1e'), woelbung(aussen, 6), 0.5));
    lw.male(D(kreis(24, 24, 16.5)), farbe('#e84a32'));
    for (let i = 0; i < 4; i++) {                                                // Kammern mit Kernen
      const w = i * Math.PI / 2 + Math.PI / 4, kx = 24 + Math.cos(w) * 9.5, ky = 24 + Math.sin(w) * 9.5;
      const k = D(gedreht(ellipse(kx, ky, 5.5, 3.6), kx, ky, w * 180 / Math.PI + 90));
      lw.male(k, farbe('#f28a5a'));
      lw.male(D(kreis(kx + Math.cos(w) * 1.5, ky + Math.sin(w) * 1.5, 1.2)), farbe('#fff0b0'));
    }
    lw.male(D(kreis(24, 24, 3.6)), farbe('#f6b08a'));
    lw.male(D(kreis(17, 15, 3)), farbe('#ffffff', 0.45), 3);
  });
  belagBilder('salami', (lw, D) => {
    const f = D(kreis(24, 24, 20));
    lw.male(f, schattiert(farbe('#a3221f'), woelbung(f, 4), 0.4));
    lw.male(D(kreis(24, 24, 17.5)), farbe('#c23a33'));
    const z = zufall(150);
    for (let i = 0; i < 11; i++) {
      const r = Math.sqrt(z()) * 14, w = z() * Math.PI * 2, x = 24 + r * Math.cos(w), y = 24 + r * Math.sin(w);
      lw.male(D(gedreht(ellipse(x, y, 2 + z() * 1.6, 1.4 + z()), x, y, z() * 180)), farbe('#f6d4c6'));
    }
    for (let i = 0; i < 6; i++) { const r = Math.sqrt(z()) * 15, w = z() * Math.PI * 2; lw.male(D(kreis(24 + r * Math.cos(w), 24 + r * Math.sin(w), 0.9)), farbe('#3a1612')); }
    lw.male(D(kreis(16, 15, 4)), farbe('#ffffff', 0.35), 4);
  });
  belagBilder('pilz', (lw, D) => {
    const hut = D(schnitt(ellipse(24, 22, 20, 15), (x, y) => y - 26));
    const stiel = D(rundRechteck(24, 33, 6.5, 10, 3));
    lw.male(stiel, schattiert(farbe('#efe3cc'), woelbung(stiel, 3), 0.2));
    lw.male(hut, schattiert((x, y) => mischeFarbe(farbe('#f3e8d4'), farbe('#b88a5c'), weich(-6, -1, hut(x, y)) * 0 + weich(-3.5, -0.5, hut(x, y))), woelbung(hut, 5), 0.3));
    lw.male(D(schnitt(ellipse(24, 23, 16, 11), (x, y) => y - 26, (x, y) => 21 - y)), farbe('#d8c3a2'));   // Lamellen
    lw.male(D(kreis(17, 13, 3.5)), farbe('#ffffff', 0.4), 3);
  });
  belagBilder('basilikum', (lw, D) => {
    const blatt = D(gedreht(schnitt(kreis(24 - 12, 24, 22), kreis(24 + 12, 24, 22)), 24, 24, 45));
    lw.male(blatt, schattiert((x, y) => mischeFarbe(farbe('#2f7d2a'), farbe('#4fae3c'), klemme((48 - x - y) / 48 + 0.4)), woelbung(blatt, 6), 0.6));
    lw.male(D(kapsel(11, 37, 37, 11, 0.9)), farbe('#8fd36a', 0.85));
    for (let i = 0; i < 3; i++) {
      const t = 0.3 + i * 0.2, mx = 11 + 26 * t, my = 37 - 26 * t;
      lw.male(D(kapsel(mx, my, mx - 7, my - 3, 0.6)), farbe('#8fd36a', 0.6));
      lw.male(D(kapsel(mx, my, mx + 3, my + 7, 0.6)), farbe('#8fd36a', 0.6));
    }
    lw.male(D(kapsel(6, 42, 11, 37, 1.6)), farbe('#3d7a2a'));
  });
  belagBilder('olive', (lw, D) => {
    const ring = D(ohne(ellipse(24, 24, 19, 17), ellipse(24, 24, 7, 6)));
    lw.male(ring, schattiert(farbe('#2e2a35'), woelbung(ring, 6), 0.9));
    lw.male(D(ellipse(24, 24, 7.5, 6.5)), farbe('#000000', 0), 1);
    lw.male(D(ohne(ellipse(24, 24, 9, 8), ellipse(24, 24, 7, 6))), farbe('#5a4a5e', 0.8));
  });
  belagBilder('ananas', (lw, D) => {
    for (const [dx, h, w] of [[-7, 16, -25], [0, 19, 0], [7, 16, 25]]) {
      const b = D(gedreht(vieleck([[24 + dx - 3.5, 18], [24 + dx, 18 - h], [24 + dx + 3.5, 18]]), 24 + dx, 18, w));
      lw.male(b, schattiert(farbe('#3f9a34'), woelbung(b, 2), 0.3));
    }
    const k = D(ellipse(24, 31, 14, 15));
    lw.male(k, schattiert((x, y) => {
      const a = (x + y) / 6, b = (x - y) / 6, fa = a - Math.floor(a), fb = b - Math.floor(b);
      const kante = Math.min(fa, 1 - fa, fb, 1 - fb);
      return mischeFarbe(farbe('#a8701e'), farbe('#f2b733'), weich(0.03, 0.18, kante));
    }, woelbung(k, 5), 0.5));
  });
}

/** Herz 42 × 36 (gezeichnet 21 × 18) */
function herz() {
  const lw = new Leinwand(42, 36);
  const f = vereint(kreis(13, 12, 10), kreis(29, 12, 10), vieleck([[4.5, 17], [21, 34], [37.5, 17], [21, 10]]));
  lw.male(f, farbe('#7a1414'));
  const innen = (x, y) => f(x, y) + 2;
  lw.male(innen, schattiert(farbe('#e4363a'), woelbung(innen, 6), 0.9));
  lw.male(ellipse(12, 10, 4, 2.6), farbe('#ffffff', 0.55), 2);
  schreibe('teigfaenger', 'herz.png', lw);
}

/** Pizza 144 × 60 (gezeichnet 72 × 30), schräg von vorn: Teigboden, Kruste, Soße, Mozzarella */
function pizzaSprite() {
  const lw = new Leinwand(144, 60);
  lw.male(ellipse(72, 34, 71, 25), farbe('#b9793c'));                          // Dicke des Bodens
  const krusteF = ellipse(72, 30, 71, 25);
  lw.male(krusteF, schattiert((x, y) => hell(farbe('#e3a85e'), 0.85 + 0.25 * fbm(x / 6, y / 6, 160, 3)), woelbung(krusteF, 6), 0.3));
  const sosse = ellipse(72, 30, 61, 20);
  lw.male(sosse, (x, y) => mischeFarbe(farbe('#b72f1c'), farbe('#d8452a'), fbm(x / 8, y / 8, 161, 3)));
  lw.male(sosse, (x, y) => {
    const k = fbm(x / 14, y / 9, 162, 3);
    return mitAlpha(mischeFarbe(farbe('#fbf1da'), farbe('#e6c27e'), weich(0.6, 0.72, fbm(x / 4, y / 4, 163, 2))), weich(0.5, 0.56, k));
  });
  const z = zufall(164);
  for (let i = 0; i < 40; i++) { const x = 72 + (z() - 0.5) * 110, y = 30 + (z() - 0.5) * 34; if (sosse(x, y) < -2) lw.male(kreis(x, y, 0.9), farbe('#2f5a1e', 0.9)); }
  lw.male(ellipse(50, 18, 18, 4), farbe('#ffffff', 0.18), 4);
  schreibe('teigfaenger', 'pizza.png', lw);
}

/** Pizzaschieber 240 × 16 und Stiel 140 × 12 (gezeichnet 120 × 8 bzw. 70 × 6): Holz mit Maserung */
function holz(x, y, s, grund) {
  const m = Math.sin(y * 0.9 + fbm(x / 30, y / 3, s, 3) * 9);
  return hell(farbe(grund), 0.86 + 0.1 * m + 0.12 * fbm(x / 60, y / 4, s + 1, 2));
}
function schieber() {
  let lw = new Leinwand(240, 16);
  let f = rundRechteck(120, 8, 119, 7, 6);
  lw.male(f, schattiert((x, y) => holz(x, y, 170, '#c08a52'), woelbung(f, 4), 0.25));
  schreibe('teigfaenger', 'schieber.png', lw);
  lw = new Leinwand(140, 12);
  f = rundRechteck(70, 6, 69, 5, 5);
  lw.male(f, schattiert((x, y) => holz(x, y, 175, '#8a5a30'), woelbung(f, 4), 0.25));
  schreibe('teigfaenger', 'stiel.png', lw);
}

/** Theke 1280 × 80 (gezeichnet 640 × 40): helle Kante oben, Holzbretter, dunkle Leiste unten */
function theke() {
  const lw = new Leinwand(1280, 80);
  lw.jedes((x, y) => {
    if (y < 12) return hell(holz(x, y, 180, '#e6b67c'), 1.04 - y * 0.012);
    if (y > 64) return hell(holz(x, y, 181, '#a8743f'), 0.92 - (y - 64) * 0.01);
    const brett = Math.floor(x / 320), fuge = Math.min(x % 320, 320 - (x % 320));
    let c = holz(x + brett * 777, y, 182 + brett, '#c6894c');
    c = hell(c, 0.95 + 0.05 * Math.sin((y - 12) / 52 * Math.PI));
    if (fuge < 2) c = hell(c, 0.6);
    return c;
  });
  schreibe('teigfaenger', 'theke.png', lw);
}

// ================================================================ Steuerung (Pizzabote, Blatt, Landschaft)
/** Pizzabote 80 × 100 (gezeichnet 40 × 50), Blick nach rechts; vier Laufbilder: Beine/Arm schwingen, Körper wippt */
function bote(nr) {
  const lw = new Leinwand(80, 100);
  const phase = (nr - 1) * Math.PI / 2;
  const schritt = Math.sin(phase), wipp = Math.abs(Math.cos(phase)) * -2;     // Bilder 1 und 3: Schritt, 2 und 4: Mitte
  const o = (f) => verschoben(f, 0, wipp + 2);
  const haut = farbe('#f1c09a'), hose = farbe('#2f5fb3'), schuh = farbe('#2a2220');
  // Beine (hinten dunkler) mit Schuhen
  const bein = (huefte, winkel, dunkel) => {
    const w = winkel * Math.PI / 180, fx = huefte + Math.sin(w) * 22, fy = 66 + Math.cos(w) * 22;
    const f = o(kapsel(huefte, 66, fx, fy, 5.5));
    lw.male(f, schattiert(hell(hose, dunkel ? 0.75 : 1), woelbung(f, 4), 0.2));
    const s = o(rundRechteck(fx + 3, fy + 4.5, 8, 4.2, 3.5));
    lw.male(s, schattiert(schuh, woelbung(s, 3), 0.5));
  };
  bein(38, -schritt * 28, true);
  // hinterer Arm
  lw.male(o(kapsel(36, 46, 36 - schritt * 9, 62, 4)), hell(farbe('#e9e4dc'), 0.78));
  bein(42, schritt * 28, false);
  // Körper: weißes Hemd, rotes Halstuch, Gürtel
  const koerper = o(rundRechteck(40, 52, 14, 16, 7));
  lw.male(koerper, schattiert(farbe('#f4f1ea'), woelbung(koerper, 6), 0.3));
  lw.male(o(rundRechteck(40, 65, 14, 2.5, 1)), farbe('#5a3a22'));
  lw.male(o(vieleck([[30, 37], [50, 37], [44, 46], [40, 49], [36, 46]])), farbe('#d8352b'));
  // Pizzakarton vor dem Bauch, vorderer Arm hält ihn
  const karton = o(rundRechteck(56, 53, 15, 4.5, 1.5));
  lw.male(karton, schattiert(farbe('#c99a5e'), woelbung(karton, 2), 0.2));
  lw.male(o(rundRechteck(56, 49.5, 15, 1.2, 1)), farbe('#e2b97f'));
  lw.male(o(kreis(56, 53, 2.2)), farbe('#d8352b'));
  lw.male(o(kapsel(44, 44, 54, 56, 4)), farbe('#e9e4dc'));
  lw.male(o(kreis(56, 57, 3.6)), haut);
  // Kopf mit Ohr, Auge, Nase, Schnurrbart
  const kopf = o(kreis(42, 26, 12.5));
  lw.male(kopf, schattiert(haut, woelbung(kopf, 6), 0.25));
  lw.male(o(ellipse(35, 27, 2.8, 3.6)), hell(haut, 0.88));
  lw.male(o(ellipse(48, 24, 1.6, 2.2)), farbe('#2a1a14'));
  lw.male(o(ellipse(54, 28, 3, 2.4)), hell(haut, 1.05));
  lw.male(o(vereint(ellipse(49, 32, 5.5, 2.2), ellipse(53, 32.5, 3.5, 2))), farbe('#3a2418'));
  // Mütze mit Schirm
  const muetze = o(schnitt(ellipse(41, 19, 14, 10.5), (x, y) => y - 20));
  lw.male(muetze, schattiert(farbe('#d8352b'), woelbung(muetze, 5), 0.4));
  lw.male(o(rundRechteck(52, 19.5, 10, 2.2, 2)), farbe('#a82720'));
  lw.male(o(kreis(41, 9.5, 2.2)), farbe('#f4f1ea'));
  schreibe('steuerung', 'bote-' + nr + '.png', lw);
}

/** Basilikumblatt 48 × 48 (gezeichnet 24 × 24) */
function blatt() {
  const lw = new Leinwand(48, 48);
  const f = gedreht(schnitt(kreis(24 - 13, 24, 22), kreis(24 + 13, 24, 22)), 24, 24, 45);
  lw.male(f, schattiert((x, y) => mischeFarbe(farbe('#2c7a28'), farbe('#5cbc44'), klemme((48 - x - y) / 48 + 0.35)), woelbung(f, 7), 0.7));
  lw.male(kapsel(10, 38, 38, 10, 0.9), farbe('#9be070', 0.85));
  for (let i = 0; i < 3; i++) {
    const t = 0.28 + i * 0.2, mx = 10 + 28 * t, my = 38 - 28 * t;
    lw.male(kapsel(mx, my, mx - 8, my - 3, 0.6), farbe('#9be070', 0.6));
    lw.male(kapsel(mx, my, mx + 3, my + 8, 0.6), farbe('#9be070', 0.6));
  }
  lw.male(kapsel(4, 44, 10, 38, 1.6), farbe('#3d7a2a'));
  schreibe('steuerung', 'blatt.png', lw);
}

/** Landschaft 640 × 360: Himmelsverlauf, Wolken, zwei Hügelketten, Wiese ab y = 320 mit Halmen und Blumen */
function landschaft() {
  const B = 640, H = 360, lw = new Leinwand(B, H);
  lw.jedes((x, y) => mischeFarbe(farbe('#5fb0e8'), farbe('#cdeefb'), Math.pow(y / 320, 1.3)));
  // Wolken: Haufen weicher Kreise, unten bläulich
  const wolke = (cx, cy, s) => vereint(kreis(cx - 34 * s, cy + 6 * s, 20 * s), kreis(cx - 8 * s, cy - 8 * s, 26 * s), kreis(cx + 22 * s, cy, 22 * s),
    kreis(cx + 46 * s, cy + 8 * s, 15 * s), rundRechteck(cx + 4 * s, cy + 14 * s, 54 * s, 10 * s, 10 * s));
  for (const [cx, cy, s] of [[140, 72, 1], [470, 108, 1.25], [600, 40, 0.6]]) {
    const f = wolke(cx, cy, s);
    lw.male(f, (x, y) => mischeFarbe(farbe('#ffffff'), farbe('#c9dcef'), weich(cy - 10 * s, cy + 26 * s, y)), 2);
  }
  // Hügel hinten (bläulich) und vorn (grün)
  lw.jedes((x, y) => {
    const h1 = 248 - 34 * fbm(x / 120, 1.5, 201, 3) - 18 * Math.sin(x / 95);
    const h2 = 286 - 28 * fbm(x / 80 + 7, 3.5, 202, 3) - 10 * Math.sin(x / 60 + 1);
    const vorn = mitAlpha(mischeFarbe(farbe('#5fa548'), farbe('#4a8f3a'), klemme((y - h2) / 40)), klemme(y - h2 + 0.5));
    const hinten = mitAlpha(mischeFarbe(farbe('#8fbf9a'), farbe('#79ad84'), klemme((y - h1) / 40)), klemme(y - h1 + 0.5));
    if (vorn[3] >= 1) return vorn;
    if (hinten[3] <= 0) return vorn[3] > 0 ? vorn : null;
    // beide Kanten im selben Pixel: erst hinten, dann vorn darüber
    const a = vorn[3] + hinten[3] * (1 - vorn[3]);
    return [0, 1, 2].map((k) => (vorn[k] * vorn[3] + hinten[k] * hinten[3] * (1 - vorn[3])) / a).concat(a);
  });
  // Wiese mit Halmen
  const z = zufall(210);
  lw.jedes((x, y) => (y >= 320 ? hell(mischeFarbe(farbe('#3f8f34'), farbe('#2f7428'), klemme((y - 320) / 40)), 0.9 + 0.2 * fbm(x / 6, y / 3, 211, 3)) : null));
  for (let i = 0; i < 520; i++) {
    const x = z() * B, h = 4 + z() * 9, neig = (z() - 0.5) * 6;
    lw.male(kapsel(x, 322 + z() * 4, x + neig, 322 - h, 0.7), farbe(z() < 0.5 ? '#5bb348' : '#3c8c30'), 1, [x - 8, 300, x + 8, 330]);
  }
  for (let i = 0; i < 26; i++) {
    const x = z() * B, y = 326 + z() * 30, c = ['#ffffff', '#ffd23a', '#ff9ab0'][Math.floor(z() * 3)];
    for (let k = 0; k < 5; k++) { const w = k * Math.PI * 2 / 5; lw.male(kreis(x + Math.cos(w) * 1.8, y + Math.sin(w) * 1.8, 1.4), farbe(c), 1, [x - 5, y - 5, x + 5, y + 5]); }
    lw.male(kreis(x, y, 1), farbe('#f2a51a'), 1, [x - 3, y - 3, x + 3, y + 3]);
  }
  schreibe('steuerung', 'landschaft.png', lw);
}

// ================================================================ los
function alles() {
  if (soll('teigball')) {
    tischdecke(); pizzaOben(); kruste(); ofenZiegel(); teigKugel(); salamiScheibe(); ananasSchale();
  }
  if (soll('teigfaenger')) {
    ['#9a4630', '#8c3e2a', '#a5503a', '#843a28'].forEach((t, i) => ziegel(i + 1, t));
    steinofen(); holzscheit();
    flamme(1, 4, 0.2, 0.6); flamme(2, -5, 0.7, 0.1); flamme(3, 2, 0.1, 0.9);
    belaege(); herz(); pizzaSprite(); schieber(); theke();
  }
  if (soll('steuerung')) {
    for (let i = 1; i <= 4; i++) bote(i);
    blatt(); landschaft();
  }
  console.log('zusammen ' + (summe / 1024).toFixed(1) + ' KiB');
}

// Als Modul (require) nur die Schreiber, als Skript alle Bilder
if (require.main === module) alles();
module.exports = { png, jpeg };
