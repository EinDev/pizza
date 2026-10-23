"use strict";
// Gemeinsame Hilfen der Projekt-Fälle (a19-projekte.js): Projekt-Objekt, Ortsprüfung von
// Ereignissen (SPEC §2.6: datei steht immer direkt vor zeile), kleine PNG-Dateien (zlib + CRC, keine Binärdateien im Repo).
const zlib = require("zlib");

const projekt = (dateien, mehr = {}) => Object.assign({ dateien }, mehr);
const ereignisse = (res, typ) => (res.ereignisse || []).filter((e) => e.typ === typ);
const fehlerEv = (res) => ereignisse(res, "fehler")[0];
const j = (x) => JSON.stringify(x);

// Ort eines Ereignisses: datei/zeile/spalte (undefined = nicht prüfen). datei steht IMMER im Ereignis, auch als null (SPEC §2.6).
function ortPruefen(e, soll, was) {
  if (!e) return `${was}: Ereignis fehlt`;
  if (!Object.prototype.hasOwnProperty.call(e, "datei")) return `${was}: Feld 'datei' fehlt (${j(e)})`;
  for (const k of ["datei", "zeile", "spalte"]) {
    if (soll[k] !== undefined && e[k] !== soll[k]) return `${was}: ${k} ${j(e[k])}, erwartet ${j(soll[k])}`;
  }
  const keys = Object.keys(e);
  if (keys.indexOf("datei") !== keys.indexOf("zeile") - 1) return `${was}: 'datei' steht nicht direkt vor 'zeile' (${keys.join(", ")})`;
}
const fehlerOrt = (soll) => (res) => ortPruefen(fehlerEv(res), soll, "fehler");
const warnOrte = (soll) => (res) => {
  const w = ereignisse(res, "warnung");
  if (w.length !== soll.length) return `${w.length} Warnungen, erwartet ${soll.length}: ${j(w)}`;
  for (let i = 0; i < soll.length; i++) { const f = ortPruefen(w[i], soll[i], `warnung ${i + 1}`); if (f) return f; }
};
const keineWarnung = (res) => (ereignisse(res, "warnung").length ? "Warnungen vor einem Ladefehler: " + j(ereignisse(res, "warnung")) : undefined);
const nullSchritte = (res) => (res.schritte === 0 ? undefined : `schritte ${res.schritte}, erwartet 0`);
const alle = (...fs) => (res) => { for (const f of fs) { const r = f(res); if (r) return r; } };

// ───────────── kleine PNG-Dateien (RGBA8, Filter 0) für Bildchen.laden ─────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function stueck(typ, daten) {
  const kopf = Buffer.alloc(8); kopf.writeUInt32BE(daten.length, 0); kopf.write(typ, 4, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([kopf.subarray(4), daten])), 0);
  return Buffer.concat([kopf, daten, crc]);
}
function ihdr(b, h) { const d = Buffer.alloc(13); d.writeUInt32BE(b, 0); d.writeUInt32BE(h, 4); d[8] = 8; d[9] = 6; return stueck("IHDR", d); }
const SIGNATUR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** PNG b × h, jedes Pixel = farbe [r, g, b, a] (bzw. farbe(x, y)). */
function png(b, h, farbe) {
  const zeile = 1 + 4 * b, roh = Buffer.alloc(h * zeile);
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) {
    const f = typeof farbe === "function" ? farbe(x, y) : farbe;
    roh.set(f, y * zeile + 1 + 4 * x);
  }
  return new Uint8Array(Buffer.concat([SIGNATUR, ihdr(b, h), stueck("IDAT", zlib.deflateSync(roh)), stueck("IEND", Buffer.alloc(0))]));
}
/** Nur Kopf + leere Daten: Größe steht im IHDR (vor dem Dekodieren geprüft, PROJEKTE §5.3). */
const pngKopf = (b, h) => new Uint8Array(Buffer.concat([SIGNATUR, ihdr(b, h), stueck("IDAT", zlib.deflateSync(Buffer.alloc(1))), stueck("IEND", Buffer.alloc(0))]));
const KLEIN = png(2, 3, (x, y) => [200, 40 * y, 10 * x, 255]);
const GROSS = new Map();
/** 2048 × 2048, einfarbig (Teigling 22 369 720 Bytes: 12 Stufen, PROJEKTE §5.3); je Farbe einmal erzeugt. */
const gross = (f) => { const k = f.join(","); if (!GROSS.has(k)) GROSS.set(k, png(2048, 2048, f)); return GROSS.get(k); };
const KAPUTT = new Uint8Array(Buffer.from("das ist kein Bild, nur Text mit .png-Endung"));

const MAIN = `speisekarte klasse Pizzeria {
    speisekarte tiefkühl leer hauptgang(Blech<margherita> args) {
`;

module.exports = { projekt, ereignisse, fehlerEv, j, ortPruefen, fehlerOrt, warnOrte, keineWarnung, nullSchritte, alle, png, pngKopf, KLEIN, gross, KAPUTT, MAIN };
