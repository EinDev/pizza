#!/usr/bin/env node
'use strict';
/*
 * Testmodelle für den Modell-Vorbacker (H-K16, HERD.md §13.3): kleine glTF-2.0-Dateien (.glb/.gltf, wenige KB, keine
 * Lizenzfrage), geschrieben nach herd/teigling/testmodelle/. Sie decken jede unterstützte Art ab (Würfel, Hierarchie mit
 * Matrix- und TRS-Knoten, Lichter, Texturen extern und als data:-URI, Eckfarben → Paletten-Bild, Haut, Folgen, Quantisierung,
 * Sparse, Streifen/Fächer, fehlende Normalen) und jede Fehlerart (Draco, beschädigt, zu groß, Bild kaputt/zu groß, Datei fehlt).
 *
 * Bytegleich reproduzierbar: PNGs mit gespeicherten (unkomprimierten) Deflate-Blöcken, JSON mit fester Schlüsselreihenfolge,
 * Zahlen als f32. Aufruf: node scripts/modelle-test.js [--pruefe]   (--pruefe: nur vergleichen, Exit 1 bei Abweichung)
 * Benutzt von cargo test -p herd-teigling (include_bytes), node herd/test-teigling.js und den Fällen tests/faelle/herd-modell*.
 */
const fs = require('fs');
const path = require('path');

const ZIEL = path.join(__dirname, '..', 'herd', 'teigling', 'testmodelle');
const pruefe = process.argv.includes('--pruefe');

// ---------------------------------------------------------------- PNG (gespeicherte Deflate-Blöcke → deterministisch)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function adler32(b) { let a = 1, s = 0; for (let i = 0; i < b.length; i++) { a = (a + b[i]) % 65521; s = (s + a) % 65521; } return ((s << 16) | a) >>> 0; }
function abschnitt(typ, daten) {
  const b = Buffer.alloc(12 + daten.length);
  b.writeUInt32BE(daten.length, 0); b.write(typ, 4, 'ascii'); Buffer.from(daten).copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + daten.length)), 8 + daten.length);
  return b;
}
function zlibGespeichert(roh) {
  const teile = [Buffer.from([0x78, 0x01])];
  for (let o = 0; o < roh.length || o === 0; o += 65535) {
    const n = Math.min(65535, roh.length - o), letzter = o + 65535 >= roh.length;
    const k = Buffer.alloc(5); k[0] = letzter ? 1 : 0; k.writeUInt16LE(n, 1); k.writeUInt16LE(~n & 0xffff, 3);
    teile.push(k, roh.subarray(o, o + n));
    if (letzter) break;
  }
  const a = Buffer.alloc(4); a.writeUInt32BE(adler32(roh), 0); teile.push(a);
  return Buffer.concat(teile);
}
function png(b, h, pixel) {   // pixel(x, y) → [r, g, b, a]
  const roh = Buffer.alloc((b * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) { const p = pixel(x, y); for (let k = 0; k < 4; k++) roh[y * (b * 4 + 1) + 1 + x * 4 + k] = p[k]; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(b, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), abschnitt('IHDR', ihdr), abschnitt('IDAT', zlibGespeichert(roh)), abschnitt('IEND', Buffer.alloc(0))]);
}
/** nur ein Kopf mit der angegebenen Größe (der Vorbacker prüft die Größe vor dem Dekodieren) */
function pngKopf(b, h) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(b, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), abschnitt('IHDR', ihdr), abschnitt('IDAT', zlibGespeichert(Buffer.alloc(1))), abschnitt('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- glTF-Bau
const f32 = (x) => Math.fround(x);
class Bau {
  constructor() { this.bin = []; this.laenge = 0; this.json = { asset: { version: '2.0', generator: 'pizza scripts/modelle-test.js' } }; }
  liste(k) { return (this.json[k] = this.json[k] || []); }
  daten(buf) {   // bufferView (4-Byte-ausgerichtet) → Index
    while (this.laenge % 4) { this.bin.push(Buffer.alloc(1)); this.laenge++; }
    const v = this.liste('bufferViews');
    v.push({ buffer: 0, byteOffset: this.laenge, byteLength: buf.length });
    this.bin.push(buf); this.laenge += buf.length;
    return v.length - 1;
  }
  acc(werte, typ, komp, extra) {   // komp: 'f32' | 'u8' | 'u16' | 'u32' | 'i8' | 'i16' (+ extra.normalized)
    const g = { f32: 4, u32: 4, u16: 2, i16: 2, u8: 1, i8: 1 }[komp];
    const ct = { i8: 5120, u8: 5121, i16: 5122, u16: 5123, u32: 5125, f32: 5126 }[komp];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[typ];
    const el = n * g, schritt = Math.ceil(el / 4) * 4;
    const roh = typ !== 'SCALAR' && el % 4 ? schritt : el;
    const b = Buffer.alloc(roh * (werte.length / n));
    for (let i = 0; i < werte.length / n; i++) for (let k = 0; k < n; k++) {
      const o = i * roh + k * g, x = werte[i * n + k];
      if (komp === 'f32') b.writeFloatLE(x, o); else if (komp === 'u32') b.writeUInt32LE(x, o);
      else if (komp === 'u16') b.writeUInt16LE(x, o); else if (komp === 'i16') b.writeInt16LE(x, o);
      else if (komp === 'u8') b.writeUInt8(x, o); else b.writeInt8(x, o);
    }
    const bv = this.daten(b);
    if (roh !== el) this.json.bufferViews[bv].byteStride = roh;
    const a = Object.assign({ bufferView: bv, componentType: ct, count: werte.length / n, type: typ }, extra || {});
    if (typ === 'VEC3' && komp === 'f32' && (!extra || !extra.ohneGrenzen)) {
      const mi = [Infinity, Infinity, Infinity], ma = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < werte.length; i += 3) for (let k = 0; k < 3; k++) { mi[k] = Math.min(mi[k], f32(werte[i + k])); ma[k] = Math.max(ma[k], f32(werte[i + k])); }
      a.min = mi; a.max = ma;
    }
    delete a.ohneGrenzen;
    this.liste('accessors').push(a);
    return this.json.accessors.length - 1;
  }
  binaer() { const b = Buffer.concat(this.bin); return b; }
  glb() {
    const bin = this.binaer();
    if (bin.length) this.json.buffers = [{ byteLength: bin.length }];
    let j = Buffer.from(JSON.stringify(this.json), 'utf8');
    j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 0x20)]);
    const bp = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
    const kopf = Buffer.alloc(12); kopf.writeUInt32LE(0x46546c67, 0); kopf.writeUInt32LE(2, 4);
    const teile = [kopf, chunk(j, 0x4e4f534a)];
    if (bin.length) teile.push(chunk(bp, 0x004e4942));
    const g = Buffer.concat(teile); g.writeUInt32LE(g.length, 8);
    return g;
  }
  /** .gltf mit Puffer als Datei (uri) oder data:-URI */
  gltf(binUri) {
    const bin = this.binaer();
    this.json.buffers = [{ byteLength: bin.length, uri: binUri === null ? 'data:application/octet-stream;base64,' + bin.toString('base64') : binUri }];
    return { json: Buffer.from(JSON.stringify(this.json, null, 1) + '\n', 'utf8'), bin };
  }
}
function chunk(d, typ) { const k = Buffer.alloc(8); k.writeUInt32LE(d.length, 0); k.writeUInt32LE(typ, 4); return Buffer.concat([k, d]); }

/** Würfel Kante 1 um den Ursprung: 24 Ecken (Lage, Normale, UV), 36 Indizes, gegen den Uhrzeigersinn von außen */
function wuerfelDaten(s = 0.5) {
  const pos = [], nor = [], uv = [], idx = [];
  const seiten = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
  for (const n of seiten) {
    const a = n[0] !== 0 ? [0, 0, -n[0]] : n[1] !== 0 ? [1, 0, 0] : [n[2], 0, 0];          // rechts
    const b = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]]; // oben = n × rechts
    const basis = pos.length / 3;
    for (const [u, v] of [[0, 1], [1, 1], [1, 0], [0, 0]]) {
      for (let k = 0; k < 3; k++) pos.push(s * (n[k] + (u * 2 - 1) * a[k] + (1 - v * 2) * b[k]));
      nor.push(...n); uv.push(u, v);
    }
    idx.push(basis, basis + 1, basis + 2, basis, basis + 2, basis + 3);
  }
  return { pos, nor, uv, idx };
}
function wuerfelPrim(bau, material, uvFaktor = 1) {
  const w = wuerfelDaten();
  const p = { attributes: { POSITION: bau.acc(w.pos, 'VEC3', 'f32'), NORMAL: bau.acc(w.nor, 'VEC3', 'f32'), TEXCOORD_0: bau.acc(w.uv.map(x => x * uvFaktor), 'VEC2', 'f32') }, indices: bau.acc(w.idx, 'SCALAR', 'u16') };
  if (material !== undefined) p.material = material;
  return p;
}
const grad = (g) => g * Math.PI / 180;
const quatY = (g) => [0, f32(Math.sin(grad(g) / 2)), 0, f32(Math.cos(grad(g) / 2))];
const quatX = (g) => [f32(Math.sin(grad(g) / 2)), 0, 0, f32(Math.cos(grad(g) / 2))];

const dateien = {};
const lege = (name, bytes) => { dateien[name] = Buffer.from(bytes); };

// 1. Würfel: ein Mesh, ein Material
{
  const b = new Bau();
  b.json.materials = [{ name: 'Tomate', pbrMetallicRoughness: { baseColorFactor: [0.8, 0.1, 0.05, 1], metallicFactor: 0, roughnessFactor: 0.5 } }];
  b.json.meshes = [{ name: 'Wuerfel', primitives: [wuerfelPrim(b, 0)] }];
  b.json.nodes = [{ name: 'Wuerfel', mesh: 0 }];
  b.json.scenes = [{ nodes: [0] }]; b.json.scene = 0;
  lege('wuerfel.glb', b.glb());
}
// 2. Hierarchie: Tisch mit vier Beinen (geteiltes Mesh), Platte mit zwei Primitiven, Matrix-Knoten, Lichter, Knoten außerhalb der Szene
{
  const b = new Bau();
  b.json.extensionsUsed = ['KHR_lights_punctual'];
  b.json.extensions = { KHR_lights_punctual: { lights: [
    { name: 'Spot', type: 'spot', color: [1, 0.8, 0.6], intensity: 20, range: 8, spot: { innerConeAngle: 0.3, outerConeAngle: 0.6 } },
    { name: 'Gluehbirne', type: 'point', color: [1, 1, 0.9], intensity: 5 },
    { name: 'Sonne', type: 'directional', intensity: 3 }] } };
  b.json.materials = [
    { name: 'Holz', pbrMetallicRoughness: { baseColorFactor: [0.5, 0.3, 0.1, 1], metallicFactor: 0, roughnessFactor: 0.8 } },
    { name: 'Glas', pbrMetallicRoughness: { baseColorFactor: [0.6, 0.8, 1, 0.4], metallicFactor: 0.1, roughnessFactor: 0.1 }, alphaMode: 'BLEND', emissiveFactor: [0.2, 0.2, 0.5],
      extensions: { KHR_materials_emissive_strength: { emissiveStrength: 4 } } },
    { name: 'Unbenutzt' }];
  b.json.extensionsUsed.push('KHR_materials_emissive_strength');
  const tri = { attributes: { POSITION: b.acc([0, 0.1, 0, 0.5, 0.1, 0, 0, 0.1, -0.5], 'VEC3', 'f32'), NORMAL: b.acc([0, 1, 0, 0, 1, 0, 0, 1, 0], 'VEC3', 'f32') }, material: 1 };
  b.json.meshes = [{ name: 'Bein', primitives: [wuerfelPrim(b, 0)] }, { name: 'Platte', primitives: [wuerfelPrim(b, 0), tri] }];
  const s45 = f32(Math.SQRT1_2);
  b.json.nodes = [
    { name: 'Tisch', translation: [0, 0.75, 0], children: [1, 2, 3, 4, 5, 6] },
    { name: 'Bein.1', mesh: 0, translation: [0.4, -0.375, 0.4], scale: [0.1, 0.75, 0.1] },
    { name: 'Bein.2', mesh: 0, translation: [-0.4, -0.375, 0.4], scale: [0.1, 0.75, 0.1] },
    { name: 'Bein.3', mesh: 0, translation: [0.4, -0.375, -0.4], scale: [0.1, 0.75, 0.1] },
    { name: 'Bein.4', mesh: 0, translation: [-0.4, -0.375, -0.4], scale: [0.1, 0.75, 0.1] },
    { name: 'Platte', mesh: 1, rotation: quatY(45), scale: [1, 0.05, 1] },
    // Matrix: 90° um x gedreht, 0.5 nach oben, zweifach gestreckt in y (Spalten)
    { name: 'Lampe', matrix: [1, 0, 0, 0, 0, 0, 2, 0, 0, -1, 0, 0, 0, 0.5, 0, 1], extensions: { KHR_lights_punctual: { light: 0 } } },
    { name: 'Gluehbirne', translation: [2, 3, 1], extensions: { KHR_lights_punctual: { light: 1 } } },
    { name: 'Sonne', rotation: quatX(-60), extensions: { KHR_lights_punctual: { light: 2 } } },
    { name: 'Waise', mesh: 0 },
    { name: '', translation: [0, 0, -2], children: [11] },
    { name: 'Gespiegelt', mesh: 0, scale: [-1, 1, 1], rotation: [s45 * 0, s45, 0, s45] }];
  b.json.scenes = [{ name: 'Szene', nodes: [0, 7, 8, 10] }, { name: 'Andere', nodes: [9] }]; b.json.scene = 0;
  lege('hierarchie.glb', b.glb());
}
// 3. Texturen: .gltf mit externem Puffer und Bildern (Grundfarbe, Normale, Metall/Rauheit, Verdeckung, Leuchten), REPEAT mit UV 0 … 2
const texturBild = png(8, 8, (x, y) => ((x >> 1) + (y >> 1)) % 2 ? [220, 60, 30, 255] : [250, 240, 200, 255]);
const normalBild = png(4, 4, (x, y) => [128 + 16 * (x - 2), 128 + 16 * (y - 2), 230, 255]);
const mrBild = png(4, 4, (x, y) => [0, 40 + 40 * x, 60 * y, 255]);
const ocBild = png(2, 2, (x, y) => [x || y ? 255 : 120, 0, 0, 255]);
const leBild = png(2, 2, (x, y) => [x * 255, y * 255, 0, 255]);
function texturModell(eingebettet) {
  const b = new Bau();
  const uri = (name, bytes) => eingebettet ? 'data:image/png;base64,' + bytes.toString('base64') : name;
  b.json.images = [{ uri: uri('bilder/farbe.png', texturBild) }, { uri: uri('bilder/normale.png', normalBild) }, { uri: uri('bilder/mr.png', mrBild) },
    { uri: uri('bilder/oc.png', ocBild) }, { uri: uri('bilder/leucht.png', leBild) }];
  b.json.samplers = [{ magFilter: 9728, wrapS: 10497, wrapT: 10497 }];
  b.json.textures = b.json.images.map((_, i) => ({ source: i, sampler: 0 }));
  b.json.materials = [{ name: 'Karo', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 2 }, metallicFactor: 0.5, roughnessFactor: 0.9 },
    normalTexture: { index: 1, scale: 0.8 }, occlusionTexture: { index: 3 }, emissiveTexture: { index: 4 }, emissiveFactor: [1, 1, 1], doubleSided: true, alphaMode: 'MASK', alphaCutoff: 0.3 }];
  b.json.meshes = [{ primitives: [wuerfelPrim(b, 0, 2)] }];
  b.json.nodes = [{ name: 'Kiste', mesh: 0 }];
  b.json.scenes = [{ nodes: [0] }];
  return b;
}
{
  const g = texturModell(false).gltf('textur.bin');
  lege('textur.gltf', g.json); lege('textur.bin', g.bin);
  lege('bilder/farbe.png', texturBild); lege('bilder/normale.png', normalBild); lege('bilder/mr.png', mrBild); lege('bilder/oc.png', ocBild); lege('bilder/leucht.png', leBild);
  lege('textur-eingebettet.gltf', texturModell(true).gltf(null).json);
}
// 4. Eckfarben ohne Bild → Paletten-Bild (u8 normalisiert, VEC4); dazu eine Primitive ohne Material mit VEC3-Farben (f32)
{
  const b = new Bau();
  const w = wuerfelDaten();
  const farben = [];
  for (let i = 0; i < 24; i++) { const s = Math.floor(i / 4); farben.push(...[[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255], [255, 255, 255, 255], [10, 10, 10, 128]][s]); }
  b.json.materials = [{ name: 'Bunt', pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.6 } }];
  const p = { attributes: { POSITION: b.acc(w.pos, 'VEC3', 'f32'), NORMAL: b.acc(w.nor, 'VEC3', 'f32'), COLOR_0: b.acc(farben, 'VEC4', 'u8', { normalized: true }) }, indices: b.acc(w.idx, 'SCALAR', 'u8'), material: 0 };
  const ohne = { attributes: { POSITION: b.acc([0, 1, 0, 1, 1, 0, 0, 2, 0], 'VEC3', 'f32'), COLOR_0: b.acc([0.5, 0.5, 0.5, 0.2, 0.4, 0.6, 1, 1, 1], 'VEC3', 'f32') } };
  b.json.meshes = [{ primitives: [p, ohne] }];
  b.json.nodes = [{ name: 'Bunt', mesh: 0 }];
  lege('farben.glb', b.glb());   // ohne scenes: Wurzeln = Knoten ohne Eltern
}
// 5. Haut: Stab aus zwei Gelenken, JOINTS_0 (u8), WEIGHTS_0 (f32), inverse Bindematrizen
{
  const b = new Bau();
  const pos = [], nor = [], gel = [], gew = [], idx = [];
  for (let i = 0; i <= 4; i++) {
    const y = i * 0.5;
    for (const x of [-0.1, 0.1]) { pos.push(x, y, 0); nor.push(0, 0, 1); gel.push(0, 1, 0, 0); const t = i / 4; gew.push(1 - t, t, 0, 0); }
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  b.json.meshes = [{ name: 'Stab', primitives: [{ attributes: { POSITION: b.acc(pos, 'VEC3', 'f32'), NORMAL: b.acc(nor, 'VEC3', 'f32'), JOINTS_0: b.acc(gel, 'VEC4', 'u8'), WEIGHTS_0: b.acc(gew, 'VEC4', 'f32') }, indices: b.acc(idx, 'SCALAR', 'u16') }] }];
  const ibm = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, 0, 1];
  b.json.skins = [{ name: 'Haut', joints: [1, 2], skeleton: 1, inverseBindMatrices: b.acc(ibm, 'MAT4', 'f32') }];
  b.json.nodes = [{ name: 'Figur', mesh: 0, skin: 0 }, { name: 'Wurzel', children: [2] }, { name: 'Spitze', translation: [0, 1, 0] }];
  b.json.scenes = [{ nodes: [0, 1] }];
  lege('haut.glb', b.glb());
}
// 6. Folgen: Lage LINEAR, Drehung STEP, Größe CUBICSPLINE, Gewichte (übergangen), Kanal auf Knoten außerhalb der Szene
{
  const b = new Bau();
  b.json.meshes = [{ primitives: [wuerfelPrim(b)] }];
  b.json.nodes = [{ name: 'Deckel', mesh: 0 }, { name: 'Draussen' }];
  b.json.scenes = [{ nodes: [0] }];
  const t = b.acc([0, 1, 2], 'SCALAR', 'f32', { min: [0], max: [2] });
  b.json.animations = [
    { name: 'Auf', samplers: [{ input: t, output: b.acc([0, 0, 0, 0, 1, 0, 0, 0.5, 0], 'VEC3', 'f32') }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }, { sampler: 0, target: { node: 1, path: 'translation' } }] },
    { name: 'Drehen', samplers: [{ input: t, interpolation: 'STEP', output: b.acc([...quatY(0), ...quatY(90), ...quatY(180)], 'VEC4', 'f32') },
      { input: t, interpolation: 'CUBICSPLINE', output: b.acc([0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0], 'VEC3', 'f32') }],
      channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }, { sampler: 1, target: { node: 0, path: 'scale' } }, { sampler: 0, target: { node: 0, path: 'weights' } }] }];
  lege('folge.glb', b.glb());
}
// 7. Quantisierung (Pflicht-Erweiterung, i16-Lage, i8-Normalen normalisiert, u16-UV normalisiert), Streifen, Fächer ohne Normalen, Sparse
{
  const b = new Bau();
  b.json.extensionsUsed = ['KHR_mesh_quantization'];
  b.json.extensionsRequired = ['KHR_mesh_quantization'];
  const streifen = { attributes: { POSITION: b.acc([0, 0, 0, 1000, 0, 0, 0, 1000, 0, 1000, 1000, 0], 'VEC3', 'i16', { ohneGrenzen: true }), NORMAL: b.acc([0, 0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127], 'VEC3', 'i8', { normalized: true }),
    TEXCOORD_0: b.acc([0, 65535, 65535, 65535, 0, 0, 65535, 0], 'VEC2', 'u16', { normalized: true }) }, mode: 5 };
  const facherPos = b.acc([0, 0, 0, 1, 0, 0, 1, 0, -1, 0, 0, -1], 'VEC3', 'f32');
  // Sparse: Ecke 2 wird nach oben gezogen
  const acc = b.json.accessors[facherPos];
  acc.sparse = { count: 1, indices: { bufferView: b.daten(Buffer.from([2, 0, 0, 0])), componentType: 5121 }, values: { bufferView: b.daten((() => { const x = Buffer.alloc(12); x.writeFloatLE(1, 0); x.writeFloatLE(0.5, 4); x.writeFloatLE(-1, 8); return x; })()) } };
  delete acc.min; delete acc.max;
  const facher = { attributes: { POSITION: facherPos }, mode: 6 };
  const linien = { attributes: { POSITION: b.acc([0, 0, 0, 1, 1, 1], 'VEC3', 'f32') }, mode: 1 };
  b.json.meshes = [{ primitives: [streifen, facher, linien] }];
  b.json.nodes = [{ name: 'Quant', mesh: 0, scale: [0.001, 0.001, 0.001] }];
  b.json.scenes = [{ nodes: [0] }];
  lege('quant.glb', b.glb());
}
// 8. Puppe (H-K23a): Körper mit Arm, Hand (leer, zum Anhängen), Kopf und einer Kette aus 46 Gliedern = 50 Knoten;
//    Folgen Winken (Drehung LINEAR), Nicken (Größe STEP, Lage CUBICSPLINE), Welle (alle 50 Knoten, Drehung/Lage/Größe LINEAR)
{
  const b = new Bau();
  const quatZ = (g) => [0, 0, f32(Math.sin(grad(g) / 2)), f32(Math.cos(grad(g) / 2))];
  b.json.materials = [{ name: 'Holz', pbrMetallicRoughness: { baseColorFactor: [0.6, 0.35, 0.15, 1], metallicFactor: 0, roughnessFactor: 0.8 } }];
  b.json.meshes = [{ name: 'Klotz', primitives: [wuerfelPrim(b, 0)] }];
  const GLIEDER = 46;
  const nodes = [
    { name: 'Koerper', mesh: 0, children: [1, 3, 4] },
    { name: 'Arm', mesh: 0, translation: [0.75, 0, 0], scale: [0.5, 0.25, 0.25], children: [2] },
    { name: 'Hand', translation: [1, 0, 0] },
    { name: 'Kopf', mesh: 0, translation: [0, 0.8, 0], scale: [0.5, 0.5, 0.5] },
  ];
  for (let i = 0; i < GLIEDER; i++) {
    const n = { name: 'Glied.' + i, translation: [0, i === 0 ? -0.5 : -0.1, 0] };
    if (i % 5 === 0) { n.mesh = 0; n.scale = [0.1, 0.1, 0.1]; }
    if (i + 1 < GLIEDER) n.children = [4 + i + 1];
    nodes.push(n);
  }
  b.json.nodes = nodes;
  b.json.scenes = [{ nodes: [0] }];
  const t3 = b.acc([0, 0.5, 1], 'SCALAR', 'f32', { min: [0], max: [1] });
  const winken = { name: 'Winken', samplers: [{ input: t3, output: b.acc([...quatZ(0), ...quatZ(90), ...quatZ(0)], 'VEC4', 'f32') }],
    channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }] };
  const tS = b.acc([0, 0.25, 0.5], 'SCALAR', 'f32', { min: [0], max: [0.5] });
  const t2 = b.acc([0, 1], 'SCALAR', 'f32', { min: [0], max: [1] });
  const nicken = { name: 'Nicken', samplers: [{ input: tS, interpolation: 'STEP', output: b.acc([0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 0.5, 0.5, 0.5], 'VEC3', 'f32') },
    { input: t2, interpolation: 'CUBICSPLINE', output: b.acc([0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 2, 0, 0, 1, 0, 0, 0, 0], 'VEC3', 'f32') }],
    channels: [{ sampler: 0, target: { node: 3, path: 'scale' } }, { sampler: 1, target: { node: 0, path: 'translation' } }] };
  const t5 = b.acc([0, 0.5, 1, 1.5, 2], 'SCALAR', 'f32', { min: [0], max: [2] });
  const welle = { name: 'Welle', samplers: [], channels: [] };
  for (let i = 0; i < GLIEDER; i++) {
    const p = (i % 4) * 5;
    welle.samplers.push({ input: t5, output: b.acc([...quatX(p), ...quatX(p + 20), ...quatX(p), ...quatX(p - 20), ...quatX(p)], 'VEC4', 'f32') });
    welle.channels.push({ sampler: i, target: { node: 4 + i, path: 'rotation' } });
  }
  welle.samplers.push({ input: t5, output: b.acc([...quatY(0), ...quatY(120), ...quatY(240), ...quatY(360), ...quatY(0)], 'VEC4', 'f32') });
  welle.channels.push({ sampler: GLIEDER, target: { node: 0, path: 'rotation' } });
  welle.samplers.push({ input: t5, output: b.acc([...quatZ(0), ...quatZ(45), ...quatZ(0), ...quatZ(-45), ...quatZ(0)], 'VEC4', 'f32') });
  welle.channels.push({ sampler: GLIEDER + 1, target: { node: 1, path: 'rotation' } });
  welle.samplers.push({ input: t5, output: b.acc([0.5, 0.5, 0.5, 0.6, 0.6, 0.6, 0.5, 0.5, 0.5, 0.4, 0.4, 0.4, 0.5, 0.5, 0.5], 'VEC3', 'f32') });
  welle.channels.push({ sampler: GLIEDER + 2, target: { node: 3, path: 'scale' } });
  welle.samplers.push({ input: t5, output: b.acc([1, 0, 0, 1, 0.2, 0, 1, 0, 0, 1, -0.2, 0, 1, 0, 0], 'VEC3', 'f32') });
  welle.channels.push({ sampler: GLIEDER + 3, target: { node: 2, path: 'translation' } });
  b.json.animations = [winken, nicken, welle];
  lege('puppe.glb', b.glb());
}
// ---------------------------------------------------------------- Fehlerfälle
{
  const b = new Bau();
  b.json.extensionsUsed = ['KHR_draco_mesh_compression'];
  b.json.extensionsRequired = ['KHR_draco_mesh_compression'];
  b.json.meshes = [{ primitives: [wuerfelPrim(b)] }];
  b.json.nodes = [{ mesh: 0 }];
  lege('fehler-draco.glb', b.glb());
}
{
  const g = (() => { const b = new Bau(); b.json.meshes = [{ primitives: [wuerfelPrim(b)] }]; b.json.nodes = [{ mesh: 0 }]; return b.glb(); })();
  const k = Buffer.from(g); k.writeUInt32LE(g.length + 4, 8);
  lege('fehler-kaputt.glb', k);
}
{
  // 600 000 Ecken als Sparse-Accessor ohne Puffer (lauter Nullen) – winzige Datei
  const b = new Bau();
  const ix = b.daten(Buffer.from([0, 0, 0, 0]));
  const vw = b.daten(Buffer.alloc(12));
  b.json.accessors = [{ componentType: 5126, count: 600000, type: 'VEC3', sparse: { count: 1, indices: { bufferView: ix, componentType: 5125 }, values: { bufferView: vw } } }];
  b.json.meshes = [{ primitives: [{ attributes: { POSITION: 0 } }] }];
  b.json.nodes = [{ mesh: 0 }];
  lege('fehler-zu-gross.glb', b.glb());
}
for (const [name, bild] of [['fehler-bild-kaputt.glb', Buffer.from('kein Bild')], ['fehler-bild-zu-gross.glb', pngKopf(2400, 800)]]) {
  const b = new Bau();
  b.json.images = [{ uri: 'data:image/png;base64,' + texturBild.toString('base64') }, { bufferView: b.daten(bild), mimeType: 'image/png' }];
  b.json.textures = [{ source: 0 }, { source: 1 }];
  b.json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, emissiveTexture: { index: 1 } }];
  b.json.meshes = [{ primitives: [wuerfelPrim(b, 0)] }];
  b.json.nodes = [{ mesh: 0 }];
  lege(name, b.glb());
}
{
  const b = new Bau();
  b.json.meshes = [{ primitives: [wuerfelPrim(b)] }];
  b.json.nodes = [{ mesh: 0 }];
  lege('fehler-fehlt.gltf', b.gltf('fehlt.bin').json);
}

// ---------------------------------------------------------------- schreiben / prüfen
let abweichend = 0, summe = 0;
for (const name of Object.keys(dateien).sort()) {
  const ziel = path.join(ZIEL, name);
  summe += dateien[name].length;
  if (pruefe) {
    let alt = null;
    try { alt = fs.readFileSync(ziel); } catch (e) { /* fehlt */ }
    if (!alt || !alt.equals(dateien[name])) { abweichend++; console.log('weicht ab: ' + name); }
  } else {
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, dateien[name]);
  }
}
if (pruefe && abweichend) { console.log(abweichend + ' Testmodell(e) weichen ab – node scripts/modelle-test.js'); process.exit(1); }
console.log((pruefe ? 'geprüft: ' : 'geschrieben: ') + Object.keys(dateien).length + ' Dateien, ' + (summe / 1024).toFixed(1) + ' KiB nach herd/teigling/testmodelle/');
