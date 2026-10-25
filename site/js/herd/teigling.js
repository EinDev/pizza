/* Herd – Vorbacker (PROJEKTE.md §5.3/§5.4, K-145/K-147). Klassisches Skript für Browser, Worker und Node (UMD wie
 * zeichner.js): eine dünne Hülle um teigling.wasm (derselbe Rust-Code wie nativ, bitgleich).
 *
 *   PizzaVorbacker.ausBytes(wasmBytes)  → Vorbacker   (synchron; im Hauptthread des Browsers nur für kleine Module erlaubt –
 *                                                      dort lieber lade())
 *   PizzaVorbacker.ausModul(modul)      → Vorbacker   (WebAssembly.Module, z. B. aus dem Worker-Protokoll)
 *   PizzaVorbacker.lade(url)            → Promise<Vorbacker>  (fetch + instantiate)
 *   PizzaVorbacker.node()               → Vorbacker   (Node: site/js/herd/teigling.wasm neben dieser Datei)
 *
 *   Vorbacker
 *     .vorbacken(quelle: Uint8Array) → Uint8Array   Teigling (bei Fehlern ein Fehler-Teigling, 64 Bytes) – eigene Kopie
 *     .sha256(bytes) → Uint8Array(32)
 *     .passt(teigling, quelle) → boolean            Kopf gültig (Magie, Version, Längen) und SHA-256 im Kopf = SHA-256(quelle)
 *     .besorge(teigling | null, quelle) → Uint8Array  den gegebenen Teigling, wenn er passt, sonst neu vorgebacken (§5.4:
 *                                                    ein veralteter Cache kann ein Ergebnis nie ändern)
 *
 *   Ohne wasm (reine Hilfen auf Teigling-Bytes, gleich für Interpreter, Compiler, Worker und UI):
 *     PizzaVorbacker.kopf(teigling) → null | { format, stufen, breite, hoehe, flags, durchsichtig, jpeg, sha256 (hex),
 *                                             fehler: null | { code: 1|2, art: "kein-bild"|"zu-gross", breite, hoehe } }
 *     PizzaVorbacker.stufe(teigling, i) → { breite, hoehe, rgba: Uint8Array (Ansicht) }   (Vorschau aus Stufe 0)
 *     PizzaVorbacker.teigmenge(teiglinge) → Bytes   Summe verschiedener Quell-Hashes ohne Fehler-Teiglinge (SPEC §18.5)
 *     PizzaVorbacker.megabyte(bytes) → "41,2"        Bytes / 1 048 576, eine Nachkommastelle aufgerundet, Dezimalkomma
 *     PizzaVorbacker.teigmengeFehler(bytes) → null | Text von P0020 („Die Bilder sind zusammen zu groß …“, ohne Präfix)
 *     PizzaVorbacker.cacheSchluessel(sha256Hex) → "<hex>/teigling/1"   (IndexedDB-Speicher `teiglinge`, §5.4)
 *   Konstanten: VERSION 1, KOPF 52, FEHLER_LAENGE 64, MAX_KANTE 2048, MAX_QUELLE 2 MiB, MAX_TEIGMENGE 64 MiB.
 *
 * Die Ananas-Texte zu Fehler-Teiglingen entstehen im Herd-Kern (`bildchen_teigling`, Codes 61/62, herd/README.md §3).
 */
(function (global) {
  "use strict";
  var MAGIE = [84, 69, 73, 71, 76, 73, 78, 71]; // "TEIGLING"
  var VERSION = 1;
  var KOPF = 52;
  var FEHLER_LAENGE = 64;
  var MAX_KANTE = 2048;
  var MAX_QUELLE = 2 * 1024 * 1024;
  var MAX_TEIGMENGE = 67108864;

  function hex(u8) {
    var s = "";
    for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? "0" : "") + u8[i].toString(16);
    return s;
  }

  function u16(t, i) { return t[i] | (t[i + 1] << 8); }
  function u32(t, i) { return (t[i] | (t[i + 1] << 8) | (t[i + 2] << 16)) + t[i + 3] * 16777216; }

  function stufenAnzahl(b, h) { var m = Math.max(b, h), n = 0; while (m > 0) { n++; m = Math.floor(m / 2); } return n; }

  /** Kopf lesen und vollständig prüfen (wie lies_kopf in herd/teigling und bildchen_teigling im Kern). */
  function kopf(t) {
    if (!t || t.length < KOPF) return null;
    for (var i = 0; i < 8; i++) if (t[i] !== MAGIE[i]) return null;
    if (u16(t, 8) !== VERSION) return null;
    var format = t[10], stufen = t[11], b = u16(t, 12), h = u16(t, 14), flags = u32(t, 16);
    var sha = hex(t.subarray(20, 52));
    if (format === 255) {
      if (t.length !== FEHLER_LAENGE || stufen !== 0 || b !== 0 || h !== 0) return null;
      var code = u16(t, 52);
      if (code !== 1 && code !== 2) return null;
      return { format: format, stufen: 0, breite: 0, hoehe: 0, flags: flags, durchsichtig: false, jpeg: false, sha256: sha,
        fehler: { code: code, art: code === 1 ? "kein-bild" : "zu-gross", breite: code === 2 ? u32(t, 56) : 0, hoehe: code === 2 ? u32(t, 60) : 0 } };
    }
    if (format !== 0 || b < 1 || h < 1 || b > MAX_KANTE || h > MAX_KANTE || stufen !== stufenAnzahl(b, h)) return null;
    var p = KOPF, w = b, hh = h;
    for (var s = 0; s < stufen; s++) {
      if (p + 4 > t.length || u32(t, p) !== w * hh * 4) return null;
      p += 4 + w * hh * 4;
      w = Math.max(1, Math.floor(w / 2));
      hh = Math.max(1, Math.floor(hh / 2));
    }
    if (p !== t.length) return null;
    return { format: 0, stufen: stufen, breite: b, hoehe: h, flags: flags, durchsichtig: (flags & 1) !== 0, jpeg: (flags & 2) !== 0, sha256: sha, fehler: null };
  }

  function stufe(t, i) {
    var k = kopf(t);
    if (!k || k.fehler || i < 0 || i >= k.stufen) return null;
    var p = KOPF, w = k.breite, hh = k.hoehe;
    for (var s = 0; s < i; s++) {
      p += 4 + w * hh * 4;
      w = Math.max(1, Math.floor(w / 2));
      hh = Math.max(1, Math.floor(hh / 2));
    }
    return { breite: w, hoehe: hh, rgba: t.subarray(p + 4, p + 4 + w * hh * 4) };
  }

  function teigmenge(teiglinge) {
    var gesehen = Object.create(null), summe = 0;
    var liste = Array.isArray(teiglinge) ? teiglinge : Object.keys(teiglinge).map(function (k) { return teiglinge[k]; });
    for (var i = 0; i < liste.length; i++) {
      var k = kopf(liste[i]);
      if (!k || k.fehler || gesehen[k.sha256]) continue;
      gesehen[k.sha256] = true;
      summe += liste[i].length;
    }
    return summe;
  }

  function megabyte(bytes) {
    var zehntel = Math.ceil(bytes * 10 / 1048576);   // exakt: bytes ≤ 2^53 / 10
    return Math.floor(zehntel / 10) + "," + (zehntel % 10);
  }

  function teigmengeFehler(bytes) {
    if (bytes <= MAX_TEIGMENGE) return null;
    return "Die Bilder sind zusammen zu groß für den Ofen (" + megabyte(bytes) + " MB vorgebacken, höchstens 64 MB).";
  }

  function Vorbacker(instanz) {
    this.x = instanz.exports;
    if (this.x.abi_version() !== 1) throw new Error("teigling.wasm: unbekannte ABI-Version " + this.x.abi_version());
    if (this.x.teigling_version() !== VERSION) throw new Error("teigling.wasm: Teigling-Version " + this.x.teigling_version() + " statt " + VERSION);
  }
  Vorbacker.prototype._rein = function (bytes) {
    var p = this.x.puffer(bytes.length);
    new Uint8Array(this.x.memory.buffer, p, bytes.length).set(bytes);
    return p;
  };
  Vorbacker.prototype.vorbacken = function (quelle) {
    var p = this._rein(quelle);
    var n = this.x.vorbacken(p, quelle.length);
    var aus = new Uint8Array(n);
    aus.set(new Uint8Array(this.x.memory.buffer, this.x.ergebnis(), n));
    this.x.freigeben();
    return aus;
  };
  Vorbacker.prototype.sha256 = function (bytes) {
    var p = this._rein(bytes);
    this.x.sha256(p, bytes.length);
    var aus = new Uint8Array(32);
    aus.set(new Uint8Array(this.x.memory.buffer, this.x.ergebnis(), 32));
    return aus;
  };
  Vorbacker.prototype.passt = function (teigling, quelle) {
    var k = kopf(teigling);
    return !!k && k.sha256 === hex(this.sha256(quelle));
  };
  Vorbacker.prototype.besorge = function (teigling, quelle) {
    return teigling && this.passt(teigling, quelle) ? teigling : this.vorbacken(quelle);
  };

  function ausModul(modul) { return new Vorbacker(new WebAssembly.Instance(modul, {})); }
  function ausBytes(bytes) { return ausModul(new WebAssembly.Module(bytes)); }
  function lade(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("teigling.wasm nicht ladbar (" + r.status + ")");
      return r.arrayBuffer();
    }).then(function (buf) { return WebAssembly.instantiate(buf, {}); }).then(function (e) { return new Vorbacker(e.instance); });
  }
  function node() {
    var fs = require("fs"), path = require("path");
    return ausBytes(fs.readFileSync(path.join(__dirname, "teigling.wasm")));
  }

  var api = {
    VERSION: VERSION, KOPF: KOPF, FEHLER_LAENGE: FEHLER_LAENGE, MAX_KANTE: MAX_KANTE, MAX_QUELLE: MAX_QUELLE, MAX_TEIGMENGE: MAX_TEIGMENGE,
    ausBytes: ausBytes, ausModul: ausModul, lade: lade, node: node,
    kopf: kopf, stufe: stufe, teigmenge: teigmenge, megabyte: megabyte, teigmengeFehler: teigmengeFehler,
    cacheSchluessel: function (shaHex) { return shaHex + "/teigling/" + VERSION; },
    hex: hex,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.PizzaVorbacker = api;
})(typeof self !== "undefined" ? self : this);
