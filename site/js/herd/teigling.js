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
 *
 *   Modelle (glTF, H-K16, HERD.md §13.3; Format „Modellteig“ in herd/teigling/src/modell.rs):
 *     Vorbacker.hatModelle → boolean                teigling.wasm kennt modell_vorbacken (sonst älteres Modul)
 *     Vorbacker.modellBraucht(pfad, haupt) → [{ uri, pfad }]   Dateien, die ein .gltf außer sich braucht (Puffer, Bilder)
 *     Vorbacker.modellQuelle(pfad, haupt, hole) → Uint8Array  Quellpaket; hole(projektpfad) → Bytes | null (fehlt)
 *     Vorbacker.modellVorbacken(paket) → Uint8Array    Modellteig (bei Fehlern ein Fehler-Modellteig mit fertigem Text)
 *     Vorbacker.modellAusSammlung(pfad, sammlung) → { teig, paket }   alles in einem (sammlung: { pfad → Bytes })
 *     Vorbacker.modellBesorge(teig | null, pfad, sammlung) → Uint8Array   wie besorge (SHA-256 des Quellpakets)
 *     PizzaVorbacker.modellKopf(teig) → null | { ecken, dreiecke, bilder, materialien, knoten, netze, flags, sha256,
 *                                                fehler: null | { code: 1 … 5, text } }
 *     PizzaVorbacker.istModellPfad(pfad) → boolean     .glb/.gltf
 *     PizzaVorbacker.quellpaket(haupt, [{ uri, bytes }]) → Uint8Array   ohne Dateien die Hauptdatei selbst
 *     PizzaVorbacker.modellCacheSchluessel(sha256Hex) → "<hex>/modell/1"
 *     teigmenge(…) zählt Teiglinge und Modellteige (je SHA-256 einmal, Fehler nicht; eingebettete Bilder je Quelle einmal, auch
 *                  über Modelle und Bilddateien hinweg); teigmengeFehler(bytes, mitModellen)
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

  // ---------------------------------------------------------------- Modellteig (H-K16)
  var MODELL_MAGIE = [84, 69, 73, 71, 77, 79, 68, 76]; // "TEIGMODL"
  var MODELL_VERSION = 1, MODELL_KOPF = 64;
  var QUELL_MAGIE = [84, 69, 73, 71, 81, 85, 69, 76]; // "TEIGQUEL"
  function istModellPfad(p) { return /\.(glb|gltf)$/.test(p); }
  var utf8 = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;
  var enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
  /** Kopf eines Modellteigs (wie lies_kopf in herd/teigling/src/modell.rs; die volle Prüfung macht der Kern). */
  function modellKopf(t) {
    if (!t || t.length < MODELL_KOPF) return null;
    for (var i = 0; i < 8; i++) if (t[i] !== MODELL_MAGIE[i]) return null;
    if (u16(t, 8) !== MODELL_VERSION || t[11] !== 0) return null;
    var art = t[10], fehler = null;
    if (art === 255) {
      if (t.length < MODELL_KOPF + 4) return null;
      var code = u16(t, 64), n = u16(t, 66);
      if (code < 1 || code > 5 || t.length !== MODELL_KOPF + 4 + n || !utf8) return null;
      fehler = { code: code, text: utf8.decode(t.subarray(68)) };
    } else if (art !== 0) return null;
    return { flags: u32(t, 12), sha256: hex(t.subarray(16, 48)), ecken: u32(t, 48), dreiecke: u32(t, 52), bilder: u16(t, 56),
      materialien: u16(t, 58), knoten: u16(t, 60), netze: u16(t, 62), fehler: fehler };
  }
  function quellpaket(haupt, dateien) {   // dateien: [{ uri, bytes }] – ohne Dateien die Hauptdatei selbst
    if (!dateien.length) return haupt;
    var teile = [], n = 16 + haupt.length;
    for (var i = 0; i < dateien.length; i++) { var u = enc.encode(dateien[i].uri); teile.push(u); n += 8 + u.length + dateien[i].bytes.length; }
    var aus = new Uint8Array(n), dv = new DataView(aus.buffer), o;
    aus.set(QUELL_MAGIE, 0); dv.setUint32(8, dateien.length, true); dv.setUint32(12, haupt.length, true); aus.set(haupt, 16); o = 16 + haupt.length;
    for (var j = 0; j < dateien.length; j++) {
      dv.setUint32(o, teile[j].length, true); aus.set(teile[j], o + 4); o += 4 + teile[j].length;
      dv.setUint32(o, dateien[j].bytes.length, true); aus.set(dateien[j].bytes, o + 4); o += 4 + dateien[j].bytes.length;
    }
    return aus;
  }

  /** Anteile an der Teigmenge: [{ sha, n }] – ein Modellteig ohne seine eingebetteten Bilder (Schlüssel sha + ":modell"), jedes
   *  eingebettete Bild unter der SHA-256 seiner Quelle (wie die Bilddatei selbst; der Kern legt gleiche Bilder einmal an). */
  function anteile(t) {
    var k = kopf(t);
    if (k) return k.fehler ? [] : [{ sha: k.sha256, n: t.length }];
    var m = modellKopf(t);
    if (!m || m.fehler) return [];
    var aus = [], basis = t.length, o = MODELL_KOPF;
    var n = o + 4 <= t.length ? u32(t, o) : 0;
    o += 4;
    for (var i = 0; i < n && o + 4 <= t.length; i++) {
      var l = u32(t, o), kb = kopf(t.subarray(o + 4, o + 4 + l));
      basis -= 4 + l;
      if (kb && !kb.fehler) aus.push({ sha: kb.sha256, n: l });
      o += 4 + l;
    }
    aus.unshift({ sha: m.sha256 + ":modell", n: basis });
    return aus;
  }

  function teigmenge(teiglinge) {
    var gesehen = Object.create(null), summe = 0;
    var liste = Array.isArray(teiglinge) ? teiglinge : Object.keys(teiglinge).map(function (k) { return teiglinge[k]; });
    for (var i = 0; i < liste.length; i++) {
      var a = anteile(liste[i]);
      for (var j = 0; j < a.length; j++) {
        if (gesehen[a[j].sha]) continue;
        gesehen[a[j].sha] = true;
        summe += a[j].n;
      }
    }
    return summe;
  }

  function megabyte(bytes) {
    var zehntel = Math.ceil(bytes * 10 / 1048576);   // exakt: bytes ≤ 2^53 / 10
    return Math.floor(zehntel / 10) + "," + (zehntel % 10);
  }

  function teigmengeFehler(bytes, mitModellen) {
    if (bytes <= MAX_TEIGMENGE) return null;
    return "Die Bilder" + (mitModellen ? " und Modelle" : "") + " sind zusammen zu groß für den Ofen (" + megabyte(bytes) + " MB vorgebacken, höchstens 64 MB).";
  }

  function Vorbacker(instanz) {
    this.x = instanz.exports;
    if (this.x.abi_version() !== 1) throw new Error("teigling.wasm: unbekannte ABI-Version " + this.x.abi_version());
    if (this.x.teigling_version() !== VERSION) throw new Error("teigling.wasm: Teigling-Version " + this.x.teigling_version() + " statt " + VERSION);
    this.hatModelle = typeof this.x.modell_vorbacken === "function" && this.x.modell_version() === MODELL_VERSION;
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
  Vorbacker.prototype._aus = function (n) {
    var aus = new Uint8Array(n);
    aus.set(new Uint8Array(this.x.memory.buffer, this.x.ergebnis(), n));
    this.x.freigeben();
    return aus;
  };
  Vorbacker.prototype.modellBraucht = function (pfad, haupt) {
    var p = enc.encode(pfad), ein = new Uint8Array(p.length + 1 + haupt.length);
    ein.set(p, 0); ein.set(haupt, p.length + 1);
    var text = utf8.decode(this._aus(this.x.modell_braucht(this._rein(ein), ein.length)));
    return text.split("\n").filter(Boolean).map(function (z) { var t = z.split("\t"); return { uri: t[0], pfad: t[1] }; });
  };
  Vorbacker.prototype.modellQuelle = function (pfad, haupt, hole) {
    var br = this.modellBraucht(pfad, haupt), dateien = [];
    for (var i = 0; i < br.length; i++) { var b = hole(br[i].pfad); if (b) dateien.push({ uri: br[i].uri, bytes: b }); }
    return quellpaket(haupt, dateien);
  };
  Vorbacker.prototype.modellVorbacken = function (paket) {
    return this._aus(this.x.modell_vorbacken(this._rein(paket), paket.length));
  };
  function holeAus(sammlung) {
    return function (p) {
      if (!Object.prototype.hasOwnProperty.call(sammlung, p)) return null;
      var v = sammlung[p];
      return typeof v === "string" ? enc.encode(v) : v instanceof Uint8Array ? v : v ? new Uint8Array(v) : null;
    };
  }
  Vorbacker.prototype.modellAusSammlung = function (pfad, sammlung) {
    var h = holeAus(sammlung)(pfad) || new Uint8Array(0);
    var paket = this.modellQuelle(pfad, h, holeAus(sammlung));
    return { teig: this.modellVorbacken(paket), paket: paket };
  };
  Vorbacker.prototype.modellBesorge = function (teig, pfad, sammlung) {
    var h = holeAus(sammlung)(pfad) || new Uint8Array(0);
    var paket = this.modellQuelle(pfad, h, holeAus(sammlung));
    var k = teig ? modellKopf(teig) : null;
    return k && !k.fehler && k.sha256 === hex(this.sha256(paket)) ? teig : this.modellVorbacken(paket);
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
    MODELL_VERSION: MODELL_VERSION, modellKopf: modellKopf, istModellPfad: istModellPfad, quellpaket: quellpaket,
    modellCacheSchluessel: function (shaHex) { return shaHex + "/modell/" + MODELL_VERSION; },
    hex: hex,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.PizzaVorbacker = api;
})(typeof self !== "undefined" ? self : this);
