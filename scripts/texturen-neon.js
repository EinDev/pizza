#!/usr/bin/env node
'use strict';
/*
 * Texturen für das Beispiel „Neon-Napoli“ (site/beispiele/herd/neon-napoli/bilder/), reproduzierbar und ohne Abhängigkeiten.
 *
 *   node scripts/texturen-neon.js [--quellen <ordner>] [--nur name,name]
 *
 * 1. Fototexturen (CC0, Poly Haven – Liste und Lizenz in neon-napoli/quellen.md): je Material drei 1k-JPEGs im Ordner
 *    <quellen>/<asset>/ (diff.jpg, nor.jpg = nor_gl, arm.jpg = AO/Rauheit/Metall), z. B. mit
 *    `curl -o <quellen>/asphalt_02/diff.jpg https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_diff_1k.jpg`.
 *    Daraus: <name>-farbe.jpg (Farbe × Umgebungsverdeckung) und <name>-relief.jpg (R, G = Normale x, y im OpenGL-Sinn,
 *    B = Rauheit) – das Format, das `Belag.relief` erwartet (SPEC §18.6). Dekodiert wird mit dem Vorbacker des Repos
 *    (site/js/herd/teigling.js), verkleinert per 2 × 2-Mittel (kachelbar bleibt kachelbar), geschrieben als Baseline-JPEG.
 *    Ohne --quellen (oder fehlende Dateien) bleiben die vorhandenen Fotodateien unverändert.
 * 2. Prozedurale Texturen (immer neu, bitgleich): Neonschriften (Röhren aus einer eigenen Strichschrift, Alpha = Röhre),
 *    Hologramm, Fensterraster für die Hochhäuser, Regenstreifen, Pfützen-freie Hilfsbilder – PNG mit Alpha.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WURZEL = path.join(__dirname, '..');
const ZIEL = path.join(WURZEL, 'site', 'beispiele', 'herd', 'neon-napoli', 'bilder');
const argv = process.argv.slice(2);
const wert = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const QUELLEN = wert('--quellen');
const NUR = wert('--nur') ? new Set(wert('--nur').split(',')) : null;
const soll = (name) => !NUR || NUR.has(name);

// ================================================================ PNG / JPEG schreiben
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
/** RGBA → Baseline-JPEG (JFIF, Standard-Huffman). unter = Chroma 4:2:0, sonst 4:4:4 (für Datenbilder wie das Relief). */
function jpeg(b, h, rgba, qualitaet, unter) {
  const ql = qTab(Q_LUMA, qualitaet), qc = qTab(Q_CHROMA, qualitaet);
  const hdl = huffCodes(DC_L), hdc = huffCodes(DC_C), hal = huffCodes(AC_L), hac = huffCodes(AC_C);
  const aus = [];
  const w8 = (...x) => { for (const v of x) aus.push(v); };
  const w16 = (x) => w8(x >> 8, x & 255);
  w8(0xff, 0xd8, 0xff, 0xe0); w16(16); w8(0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0); w16(1); w16(1); w8(0, 0);
  w8(0xff, 0xdb); w16(2 + 65 * 2); w8(0); for (let i = 0; i < 64; i++) w8(ql[ZIGZAG[i]]); w8(1); for (let i = 0; i < 64; i++) w8(qc[ZIGZAG[i]]);
  w8(0xff, 0xc0); w16(17); w8(8); w16(h); w16(b); w8(3, 1, unter ? 0x22 : 0x11, 0, 2, 0x11, 1, 3, 0x11, 1);
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
  const mcu = unter ? 16 : 8;
  let pY = 0, pB = 0, pR = 0;
  const blk = new Float64Array(64);
  for (let my = 0; my < h; my += mcu) for (let mx = 0; mx < b; mx += mcu) {
    for (let by = 0; by < mcu; by += 8) for (let bx = 0; bx < mcu; bx += 8) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) blk[y * 8 + x] = lies(Y, mx + bx + x, my + by + y);
      pY = block(blk, ql, hdl, hal, pY);
    }
    for (const k of [Cb, Cr]) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        blk[y * 8 + x] = unter
          ? (lies(k, mx + x * 2, my + y * 2) + lies(k, mx + x * 2 + 1, my + y * 2) + lies(k, mx + x * 2, my + y * 2 + 1) + lies(k, mx + x * 2 + 1, my + y * 2 + 1)) / 4
          : lies(k, mx + x, my + y);
      }
      if (k === Cb) pB = block(blk, qc, hdc, hac, pB); else pR = block(blk, qc, hdc, hac, pR);
    }
  }
  if (n > 0) bits((1 << (8 - n)) - 1, 8 - n);
  w8(0xff, 0xd9);
  return Buffer.from(aus);
}

// ================================================================ Bilder lesen (Vorbacker des Repos) und verkleinern
const V = require(path.join(WURZEL, 'site', 'js', 'herd', 'teigling.js'));
let vorbacker = null;
function lies(datei) {
  vorbacker = vorbacker || V.node();
  const t = vorbacker.vorbacken(new Uint8Array(fs.readFileSync(datei)));
  const k = V.kopf(t);
  if (!k || k.fehler) throw new Error(datei + ': kein lesbares Bild');
  const s = V.stufe(t, 0);
  return { b: s.breite, h: s.hoehe, px: Uint8Array.from(s.rgba) };
}
/** auf Kante `ziel` verkleinern (2 × 2-Mittel je Schritt, Kachelbarkeit bleibt) */
function verkleinere(bild, ziel) {
  let { b, h, px } = bild;
  while (b > ziel) {
    const nb = b >> 1, nh = h >> 1, n = new Uint8Array(nb * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nb; x++) for (let c = 0; c < 4; c++) {
      const i = (yy, xx) => px[((y * 2 + yy) * b + x * 2 + xx) * 4 + c];
      n[(y * nb + x) * 4 + c] = (i(0, 0) + i(0, 1) + i(1, 0) + i(1, 1) + 2) >> 2;
    }
    b = nb; h = nh; px = n;
  }
  return { b, h, px };
}

// Fotomaterialien: Name → [Poly-Haven-Asset, Kante Farbe, Kante Relief, Stärke der Umgebungsverdeckung]
const FOTOS = {
  asphalt: ['asphalt_02', 1024, 512, 0.8],
  beton: ['concrete_wall_008', 512, 512, 0.7],
  ziegel: ['dark_brick_wall', 512, 512, 0.8],
  fliesen: ['rectangular_facade_tiles', 512, 512, 0.7],
  wellblech: ['rusty_corrugated_iron', 512, 512, 0.7],
  rolltor: ['rusty_metal_shutter', 512, 512, 0.7],
  gehweg: ['concrete_pavement', 512, 512, 0.7],
};

function fotos() {
  if (!QUELLEN) { console.log('Fotos: ohne --quellen übersprungen (vorhandene Dateien bleiben)'); return; }
  for (const [name, [asset, kf, kr, ao]] of Object.entries(FOTOS)) {
    if (!soll(name)) continue;
    const d = path.join(QUELLEN, asset);
    if (!['diff.jpg', 'nor.jpg', 'arm.jpg'].every((f) => fs.existsSync(path.join(d, f)))) { console.log(name + ': Quellen fehlen in ' + d); continue; }
    const diff = lies(path.join(d, 'diff.jpg')), nor = lies(path.join(d, 'nor.jpg')), arm = lies(path.join(d, 'arm.jpg'));
    // Farbe × Verdeckung (AO aus arm.R), dann verkleinern
    const f = { b: diff.b, h: diff.h, px: Uint8Array.from(diff.px) };
    for (let i = 0; i < f.b * f.h; i++) {
      const v = 1 - ao + ao * arm.px[i * 4] / 255;
      for (let c = 0; c < 3; c++) f.px[i * 4 + c] = Math.round(f.px[i * 4 + c] * v);
    }
    const farbe = verkleinere(f, kf);
    fs.writeFileSync(path.join(ZIEL, name + '-farbe.jpg'), jpeg(farbe.b, farbe.h, farbe.px, 88, true));
    // Relief: Normale x, y + Rauheit (arm.G)
    const r = { b: nor.b, h: nor.h, px: new Uint8Array(nor.b * nor.h * 4) };
    for (let i = 0; i < r.b * r.h; i++) {
      r.px[i * 4] = nor.px[i * 4]; r.px[i * 4 + 1] = nor.px[i * 4 + 1]; r.px[i * 4 + 2] = arm.px[i * 4 + 1]; r.px[i * 4 + 3] = 255;
    }
    const relief = verkleinere(r, kr);
    fs.writeFileSync(path.join(ZIEL, name + '-relief.jpg'), jpeg(relief.b, relief.h, relief.px, 92, false));
    console.log(name + ': ' + farbe.b + '² Farbe, ' + relief.b + '² Relief');
  }
}

// ================================================================ prozedural
// Strichschrift: je Zeichen Linienzüge im Kasten 4 × 6 (y nach unten)
const O_ = [[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]];
const P_ = [[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]];
const SCHRIFT = {
  A: [[[0, 6], [0, 2], [2, 0], [4, 2], [4, 6]], [[0, 3.6], [4, 3.6]]],
  B: [[[0, 3], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.2], [2.2, 3.2]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]], [[1, 0], [3, 0]], [[1, 6], [3, 6]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.6]], [[1.3, 2.6], [4, 6]]],
  L: [[[0, 0], [0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [O_],
  P: [P_],
  R: [P_, [[2, 3], [4, 6]]],
  S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  0: [O_, [[4, 1], [0, 5]]],
  1: [[[1, 1], [2, 0], [2, 6]], [[1, 6], [3, 6]]],
  2: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
  4: [[[3, 6], [3, 0], [0, 4], [4, 4]]],
  7: [[[0, 0], [4, 0], [1.5, 6]]],
  8: [[[1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]]],
  '/': [[[4, 0], [0, 6]]],
  '-': [[[1, 3], [3, 3]]],
  '!': [[[2, 0], [2, 4.2]], [[2, 5.7], [2, 6]]],
  '?': [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [2, 3.4], [2, 4.2]], [[2, 5.7], [2, 6]]],
  '.': [[[2, 5.7], [2, 6]]],
  ' ': [],
};

function leinwand(b, h) { return { b, h, px: new Float64Array(b * h * 4) }; }
function alsBytes(l) { const o = new Uint8Array(l.b * l.h * 4); for (let i = 0; i < o.length; i++) o[i] = Math.max(0, Math.min(255, Math.round(l.px[i] * 255))); return o; }
function abstandStrecke(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
/** Neonröhren: Strecken (in Pixeln) mit Radius r; Kern weiß getönt, Rand in Farbe; Alpha = Röhre (glatt) */
function roehren(l, strecken, r, farbe) {
  const [fr, fg, fb] = farbe;
  for (const [ax, ay, bx, by] of strecken) {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 2)), x1 = Math.min(l.b - 1, Math.ceil(Math.max(ax, bx) + r + 2));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 2)), y1 = Math.min(l.h - 1, Math.ceil(Math.max(ay, by) + r + 2));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = abstandStrecke(x + 0.5, y + 0.5, ax, ay, bx, by);
      const deck = Math.max(0, Math.min(1, r + 0.5 - d));
      if (deck <= 0) continue;
      const kern = Math.max(0, 1 - d / r);
      const w = 0.25 + 0.75 * kern * kern;
      const i = (y * l.b + x) * 4;
      if (deck >= l.px[i + 3]) {
        l.px[i] = fr + (1 - fr) * w * 0.85; l.px[i + 1] = fg + (1 - fg) * w * 0.85; l.px[i + 2] = fb + (1 - fb) * w * 0.85; l.px[i + 3] = deck;
      }
    }
  }
}
/** Text als Strecken: Kastenhöhe hoch Pixel, links oben (x, y); senkrecht = Zeichen untereinander */
function textStrecken(text, x, y, hoch, senkrecht = false) {
  const s = hoch / 6, aus = [];
  let cx = x, cy = y;
  for (const ch of text) {
    const g = SCHRIFT[ch];
    if (!g) throw new Error('Zeichen fehlt in der Strichschrift: ' + ch);
    for (const zug of g) for (let i = 0; i + 1 < zug.length; i++) aus.push([cx + zug[i][0] * s, cy + zug[i][1] * s, cx + zug[i + 1][0] * s, cy + zug[i + 1][1] * s]);
    if (senkrecht) cy += 7.6 * s; else cx += 5.6 * s;
  }
  return aus;
}
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
function textBreite(text, hoch) { return (text.length * 5.6 - 1.6) * hoch / 6; }

/** Schild: Text zentriert in b × h, Röhrendicke aus der Schrifthöhe */
function schild(name, text, farbe, b, h, extra) {
  const l = leinwand(b, h);
  const hoch = Math.min(h * 0.62, (b * 0.9) / (text.length * 5.6 - 1.6) * 6);
  const r = Math.max(1.6, hoch * 0.055);
  roehren(l, textStrecken(text, (b - textBreite(text, hoch)) / 2, (h - hoch) / 2, hoch), r, hex(farbe));
  if (extra) extra(l, r);
  fs.writeFileSync(path.join(ZIEL, name + '.png'), png(b, h, alsBytes(l)));
  console.log(name + '.png ' + b + '×' + h);
}
function senkrechtesSchild(name, text, farbe, b, h) {
  const l = leinwand(b, h);
  const hoch = Math.min(b * 0.62 * 6 / 4, (h * 0.92) / (text.length * 7.6 - 1.6) * 6);
  const r = Math.max(1.6, hoch * 0.055);
  const breite = hoch * 4 / 6, laenge = (text.length * 7.6 - 1.6) * hoch / 6;
  roehren(l, textStrecken(text, (b - breite) / 2, (h - laenge) / 2, hoch, true), r, hex(farbe));
  fs.writeFileSync(path.join(ZIEL, name + '.png'), png(b, h, alsBytes(l)));
  console.log(name + '.png ' + b + '×' + h);
}

// deterministischer Zufall (Mulberry32)
function zufall(saat) { let a = saat >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Fensterraster für Hochhäuser: dunkle Fassade (Alpha 1), Fenster teils warm/kalt erleuchtet – als Leucht-Textur gedacht */
function fenster(name, b, h, spalten, zeilen, saat) {
  const z = zufall(saat), px = new Uint8Array(b * h * 4);
  const fw = b / spalten, fh = h / zeilen;
  const an = [];
  for (let j = 0; j < zeilen; j++) for (let i = 0; i < spalten; i++) {
    const r = z();
    const farbe = r < 0.6 ? null : r < 0.84 ? [255, 190, 118] : r < 0.95 ? [160, 205, 255] : [255, 110, 200];
    an.push([farbe, 0.45 + z() * 0.55, z()]);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) {
    const i = Math.floor(x / fw), j = Math.floor(y / fh);
    const lx = (x - i * fw) / fw, ly = (y - j * fh) / fh;
    const innen = lx > 0.22 && lx < 0.78 && ly > 0.24 && ly < 0.76;
    const [farbe, hell, jalousie] = an[j * spalten + i];
    let c = [10, 11, 15];
    if (innen) {
      if (farbe) {
        const streifen = jalousie > 0.6 && Math.floor(ly * 18) % 2 === 0 ? 0.55 : 1;
        const verlauf = 0.75 + 0.25 * (1 - ly);
        c = farbe.map((v) => v * hell * streifen * verlauf);
      } else c = [18, 20, 27];
    }
    const k = (y * b + x) * 4;
    px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2]; px[k + 3] = 255;
  }
  fs.writeFileSync(path.join(ZIEL, name + '.png'), png(b, h, px));
  console.log(name + '.png ' + b + '×' + h);
}

/** Hologramm: Pizzastück mit Belag als Umriss + Füllung in Rasterlinien (halb durchsichtig) */
function hologramm(name, s) {
  const l = leinwand(s, s);
  const [r, g, b] = hex('#3cf2ff');
  const A = [s * 0.5, s * 0.92], B = [s * 0.1, s * 0.12], C = [s * 0.9, s * 0.12];
  const drin = (x, y) => {
    const k = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    const a = k(A, B), bb = k(B, C), c = k(C, A);
    return (a >= 0 && bb >= 0 && c >= 0) || (a <= 0 && bb <= 0 && c <= 0);
  };
  const salami = [[0.42, 0.3], [0.6, 0.27], [0.5, 0.5], [0.36, 0.2], [0.66, 0.42]].map(([x, y]) => [x * s, y * s, s * 0.06]);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4;
    if (!drin(x + 0.5, y + 0.5)) continue;
    const zeile = (y % 6) < 4 ? 1 : 0;   // Rasterlinien: jede dritte Doppelzeile fällt weg (Deckkraft < ½ wird verworfen)
    let a = 0.62 * zeile;
    for (const [sx, sy, sr] of salami) if (Math.hypot(x - sx, y - sy) < sr) a = 0.96 * zeile;
    l.px[i] = r; l.px[i + 1] = g; l.px[i + 2] = b; l.px[i + 3] = a;
  }
  // Rand (Kruste) als helle Röhre
  roehren(l, [[...B, ...C], [...C, ...A], [...A, ...B], [B[0], B[1] + s * 0.06, C[0], C[1] + s * 0.06]], s * 0.012, [r, g, b]);
  fs.writeFileSync(path.join(ZIEL, name + '.png'), png(s, s, alsBytes(l)));
  console.log(name + '.png ' + s + '×' + s);
}

/** Pfeil/Ziel-Markierung (Ring mit Pfeil nach unten) für Lieferadressen */
function markierung(name, s) {
  const l = leinwand(s, s);
  const c = hex('#7dff6a');
  const st = [];
  for (let k = 0; k < 48; k++) {
    const a0 = k / 48 * Math.PI * 2, a1 = (k + 1) / 48 * Math.PI * 2, R = s * 0.4;
    st.push([s / 2 + Math.cos(a0) * R, s / 2 + Math.sin(a0) * R, s / 2 + Math.cos(a1) * R, s / 2 + Math.sin(a1) * R]);
  }
  st.push([s * 0.5, s * 0.22, s * 0.5, s * 0.72], [s * 0.32, s * 0.55, s * 0.5, s * 0.74], [s * 0.68, s * 0.55, s * 0.5, s * 0.74]);
  roehren(l, st, s * 0.028, c);
  fs.writeFileSync(path.join(ZIEL, name + '.png'), png(s, s, alsBytes(l)));
  console.log(name + '.png ' + s + '×' + s);
}

/** Schaufenster: warmes oder kaltes Licht von innen, Regale und Waren als dunkle Schatten, Sprossen, Glanzstreifen */
function schaufenster(name, b, h, warm, saat) {
  const z = zufall(saat), px = new Uint8Array(b * h * 4);
  const licht = warm ? [255, 186, 120] : [140, 214, 255];
  const regale = [0.3, 0.55, 0.8];
  const waren = [];
  for (let i = 0; i < 40; i++) waren.push([z() * b, regale[Math.floor(z() * 3)] * h, 6 + z() * 22, 8 + z() * 26]);
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) {
    const ly = y / h, lx = x / b;
    let k = 0.35 + 0.65 * (1 - Math.abs(lx - 0.5) * 1.2) * (0.6 + 0.4 * (1 - ly));
    for (const r of regale) if (Math.abs(ly - r) < 0.012) k *= 0.25;
    for (const [wx, wy, ww, wh] of waren) if (x > wx && x < wx + ww && y < wy && y > wy - wh) k *= 0.45;
    if (x % (b / 4) < 5 || y < 6 || y > h - 6) k = 0.04;           // Sprossen und Rahmen
    if (Math.abs((x + y * 0.6) % 180 - 40) < 6) k = Math.min(1, k + 0.18); // Glanzstreifen auf dem Glas
    const i = (y * b + x) * 4;
    px[i] = licht[0] * k; px[i + 1] = licht[1] * k; px[i + 2] = licht[2] * k; px[i + 3] = 255;
  }
  fs.writeFileSync(path.join(ZIEL, name + '.png'), png(b, h, px));
  console.log(name + '.png ' + b + '×' + h);
}

fs.mkdirSync(ZIEL, { recursive: true });
fotos();
if (soll('neon')) {
  schild('neon-pizza', 'PIZZA', '#ff2bd6', 512, 160);
  schild('neon-napoli', 'NEON NAPOLI', '#22e6ff', 512, 96);
  schild('neon-ofen', 'OFEN 24/7', '#ff7a1f', 512, 128);
  schild('neon-salami', 'SALAMI SYNDIKAT', '#ff3048', 512, 80);
  schild('neon-teig', 'TEIG-BAR', '#c6ff3a', 256, 96);
  schild('neon-calzone', 'CALZONE CORP.', '#a46bff', 512, 96);
  senkrechtesSchild('neon-senkrecht', 'PIZZA', '#ffd23a', 128, 512);
  senkrechtesSchild('neon-senkrecht2', 'KAFFEE', '#22e6ff', 128, 512);
  hologramm('holo-pizza', 256);
  markierung('ziel', 256);
  fenster('fenster', 512, 512, 8, 6, 7);
  schaufenster('laden-warm', 512, 256, true, 11);
  schaufenster('laden-kalt', 512, 256, false, 23);
}
