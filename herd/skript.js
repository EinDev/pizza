'use strict';
/*
 * Herd-Szenen-Skripte (*.herd) gegen site/js/herd/kern.wasm – das JS-Gegenstück zu herd/skript (Rust).
 * Format und Ausgabe: herd/README.md §7. Beide Spieler müssen für dasselbe Skript **dieselben Zeilen** liefern:
 *   "<zeile> <aufruf> <wert>" je ABI-Aufruf (i32 dezimal, f64 als "f" + 16 Hex-Ziffern der Bits, Text als JSON,
 *   Listen als [a,b]), nach jedem Bild "B <nr> <szene-hash> <paket-hash>".
 * Nutzung: const { lies, Spieler } = require('./skript.js');
 */

const SIGNATUREN = {
  abi_version: ['', 'I'], fehler_art: ['', 'I'], fehler_code: ['', 'I'], fehler_neu: ['', 'I'], fehler_text: ['', 'T'],
  melde_typfehler: ['iit', 'I'], welt_neu: ['fft', 'I'], welt_titel: ['t', 'I'], welt_hintergrund: ['t', 'I'],
  welt_himmel: ['tt', 'I'], welt_umgebung: ['tf', 'I'], welt_nebel: ['tff', 'I'], welt_hole: ['i', 'F'],
  teil_neu: ['i', 'I'], teil_entferne: ['i', 'I'], teil_kopie: ['i', 'I'], teil_haenge: ['ii', 'I'], teil_kinder: ['i', 'U'],
  teil_setze: ['iif', 'I'], teil_hole: ['ii', 'F'], teil_lage: ['ifff', 'I'], teil_verschiebe: ['ifff', 'I'],
  teil_groesse: ['ifff', 'I'], teil_schaue: ['ifff', 'I'], teil_trifft: ['ii', 'I'], komp_neu: ['i', 'I'],
  komp_haenge: ['ii', 'I'], komp_loese: ['i', 'I'], komp_von: ['ii', 'I'], komp_info: ['ii', 'I'], typ_nummer: ['t', 'I'],
  feld_nummer: ['it', 'I'], setze_zahl: ['iif', 'I'], hole_zahl: ['ii', 'F'], setze_text: ['iit', 'I'], hole_text: ['ii', 'T'],
  setze_liste: ['iiu', 'I'], hole_liste: ['ii', 'U'], setze_zahlen: ['iid', 'I'], hole_zahlen: ['ii', 'D'], form_grund: ['iff', 'I'], form_eigene: ['ddi', 'I'],
  bildchen_neu: ['zp', 'I'], bildchen_rgba: ['iib', 'I'], bildchen_teigling: ['b', 'I'], ressource_hole: ['ii', 'F'], eingabe: ['ffi', 'I'], takt: ['', 'I'], paket_voll: ['', 'I'],
  hash_szene: ['', 'H'], hash_paket: ['', 'H'], schema_json: ['', 'T'],
  // Hilfsaufruf der Spieler (kein ABI-Export, PD3): Teigling aus festem Muster → bildchen_teigling
  teigling_muster: ['iii', 'I'],
  // Hilfsaufruf: Teigling aus einer Datei (tests/herd/bild.js zeichnet Bildchen.laden so auf)
  teigling_datei: ['t', 'I'],
  // Modelle (H-K16); modell_datei ist ein Hilfsaufruf wie teigling_datei: Modellteig direkt oder .glb/.gltf über teigling.wasm
  modell_teig: ['b', 'I'], modell_datei: ['t', 'I'], modell_teil: ['ifff', 'I'], modell_info: ['ii', 'F'], modell_text: ['iii', 'T'],
  teil_finde: ['it', 'I'],
};

function fehler(z, t) { throw new Error('Zeile ' + z + ': ' + t); }

// ------------------------------------------------------------------------------------------- Syntax

function ausdruck(t, z) {
  const toks = [];
  let i = 0;
  const ziffer = (c) => c >= '0' && c <= '9';
  const buchst = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  while (i < t.length) {
    const c = t[i];
    if (c === ' ' || c === '\t') { i++; }
    else if (ziffer(c) || (c === '.' && i + 1 < t.length && ziffer(t[i + 1]))) {
      const s = i;
      while (i < t.length && (ziffer(t[i]) || t[i] === '.' || t[i] === 'e' || t[i] === 'E' ||
        ((t[i] === '-' || t[i] === '+') && (t[i - 1] === 'e' || t[i - 1] === 'E')))) i++;
      toks.push(t.slice(s, i));
    } else if (buchst(c)) {
      const s = i;
      while (i < t.length && (buchst(t[i]) || ziffer(t[i]))) i++;
      toks.push(t.slice(s, i));
    } else if ('+-*/%()'.includes(c)) { toks.push(c); i++; }
    else fehler(z, "unerwartetes Zeichen '" + c + "' in '" + t + "'");
  }
  let p = 0;
  function summe() {
    let a = produkt();
    while (p < toks.length && (toks[p] === '+' || toks[p] === '-')) { const op = toks[p++]; a = { op, a, b: produkt() }; }
    return a;
  }
  function produkt() {
    let a = faktor();
    while (p < toks.length && (toks[p] === '*' || toks[p] === '/' || toks[p] === '%')) { const op = toks[p++]; a = { op, a, b: faktor() }; }
    return a;
  }
  function faktor() {
    if (p >= toks.length) fehler(z, 'Ausdruck unvollständig');
    const x = toks[p++];
    if (x === '-') return { neg: faktor() };
    if (x === '(') { const a = summe(); if (toks[p] !== ')') fehler(z, ') fehlt'); p++; return a; }
    if (ziffer(x[0]) || x[0] === '.') { const v = Number(x); if (Number.isNaN(v)) fehler(z, "Zahl '" + x + "'"); return { zahl: v }; }
    if (buchst(x[0])) {
      if (toks[p] === '(') {
        p++; const a = summe(); if (toks[p] !== ')') fehler(z, ') fehlt'); p++;
        if (x !== 'boden' && x !== 'zufall') fehler(z, 'unbekannte Funktion ' + x);
        return { fn: x, a };
      }
      return { v: x };
    }
    fehler(z, "unerwartet '" + x + "'");
  }
  const a = summe();
  if (p !== toks.length) fehler(z, "Rest im Ausdruck '" + t + "'");
  return a;
}

class Zeiger {
  constructor(s, zeile) { this.s = s; this.i = 0; this.zeile = zeile; }
  leer() { while (this.i < this.s.length && ' \t\r'.includes(this.s[this.i])) this.i++; }
  ende() { this.leer(); return this.i >= this.s.length || this.s[this.i] === '#'; }
  sieh() { return this.i < this.s.length ? this.s[this.i] : ''; }
  text() {
    // JSON-Zeichenkette
    let j = this.i + 1;
    while (j < this.s.length && this.s[j] !== '"') j += this.s[j] === '\\' ? 2 : 1;
    if (j >= this.s.length) fehler(this.zeile, 'Text ohne Ende');
    const t = JSON.parse(this.s.slice(this.i, j + 1));
    this.i = j + 1;
    return t;
  }
  wort() {
    const s = this.i;
    let tiefe = 0;
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === '(') tiefe++;
      else if (c === ')') tiefe--;
      else if (tiefe <= 0 && ' \t\r,]'.includes(c)) break;
      this.i++;
    }
    return this.s.slice(s, this.i);
  }
  arg() {
    this.leer();
    const c = this.sieh();
    if (c === '"') return { text: this.text() };
    if (c === '[') {
      this.i++;
      this.leer();
      if (this.s.startsWith('folge ', this.i)) {   // [folge ANZAHL VAR AUSDRUCK] (H-K10)
        this.i += 6;
        const anzahl = this.arg();
        if (!anzahl.wert) fehler(this.zeile, 'folge braucht eine Anzahl');
        this.leer();
        const v = this.wort();
        const wert = this.arg();
        if (!wert.wert || !v) fehler(this.zeile, '[folge anzahl var ausdruck]');
        this.leer();
        if (this.sieh() !== ']') fehler(this.zeile, 'folge ohne ]');
        this.i++;
        return { folge: { anzahl: anzahl.wert, v, wert: wert.wert } };
      }
      const v = [];
      for (;;) {
        this.leer();
        const d = this.sieh();
        if (d === ']') { this.i++; return { liste: v }; }
        if (d === ',') { this.i++; continue; }
        if (d === '') fehler(this.zeile, 'Liste ohne ]');
        v.push(this.arg());
      }
    }
    const w = this.wort();
    if (!w) fehler(this.zeile, 'Argument erwartet');
    return { wert: ausdruck(w, this.zeile) };
  }
}

function lies(text) {
  const stapel = [{ befehle: [], kopf: null }];
  const zeilen = text.split('\n');
  zeilen.forEach((roh, n) => {
    const nr = n + 1;
    const z = new Zeiger(roh.replace(/\r$/, ''), nr);
    if (z.ende()) return;
    const wort = z.wort();
    let b;
    if (wort === 'wiederhole') {
      const a = z.arg();
      if (!a.wert) fehler(nr, 'wiederhole braucht eine Anzahl');
      const v = z.ende() ? null : z.wort();
      stapel.push({ befehle: [], kopf: { zeile: nr, anzahl: a.wert, v } });
      return;
    } else if (wort === 'ende') {
      const s = stapel.pop();
      if (!s.kopf) fehler(nr, 'ende ohne wiederhole');
      b = { art: 'wiederhole', zeile: s.kopf.zeile, anzahl: s.kopf.anzahl, v: s.kopf.v, rumpf: s.befehle };
    } else if (wort === 'setze') {
      z.leer(); const v = z.wort(); z.leer();
      if (z.sieh() !== '=') fehler(nr, 'setze name = ausdruck');
      z.i++; z.leer();
      b = { art: 'setze', zeile: nr, v, wert: ausdruck(z.s.slice(z.i).split('#')[0], nr) };
    } else if (wort === 'vorgabe') {
      z.leer(); const v = z.wort(); const a = z.arg();
      if (!a.wert || a.wert.zahl === undefined) fehler(nr, 'vorgabe name zahl');
      b = { art: 'vorgabe', v, wert: a.wert.zahl };
    } else if (wort === 'takte') {
      const a = z.arg();
      if (!a.wert) fehler(nr, 'takte anzahl');
      b = { art: 'takte', zeile: nr, anzahl: a.wert };
    } else {
      if (wort !== 'bild' && !SIGNATUREN[wort]) fehler(nr, "unbekannter Aufruf '" + wort + "'");
      const args = [];
      let ziel = null;
      while (!z.ende()) {
        if (z.s.startsWith('->', z.i)) { z.i += 2; z.leer(); ziel = z.wort(); break; }
        args.push(z.arg());
      }
      const sig = SIGNATUREN[wort];
      if (sig && sig[0].length !== args.length) fehler(nr, wort + ' braucht ' + sig[0].length + ' Argumente, nicht ' + args.length);
      b = { art: 'ruf', zeile: nr, name: wort, args, ziel };
    }
    stapel[stapel.length - 1].befehle.push(b);
  });
  if (stapel.length !== 1) fehler(zeilen.length, 'wiederhole ohne ende');
  return stapel[0].befehle;
}

// ------------------------------------------------------------------------------------------- Auswertung

/** Deterministischer Zufall in [0, 1) – gleiche Bits wie herd_skript::zufall. */
function zufall(x) {
  let h = Number.isFinite(x) ? Math.trunc(x) >>> 0 : 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function rechne(a, v, z) {
  if (a.zahl !== undefined) return a.zahl;
  if (a.v !== undefined) { if (!v.has(a.v)) fehler(z, "Variable '" + a.v + "' unbekannt"); return v.get(a.v); }
  if (a.neg) return -rechne(a.neg, v, z);
  if (a.fn) { const x = rechne(a.a, v, z); return a.fn === 'boden' ? Math.floor(x) : zufall(x); }
  const x = rechne(a.a, v, z), y = rechne(a.b, v, z);
  switch (a.op) { case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': return x / y; default: return x % y; }
}

// ------------------------------------------------------------------------------------------- Muster-Teiglinge (PD3)

/** Pixel des Musters m an (x, y) in b × h – nur Ganzzahlen, gleich herd_skript::muster_pixel (alle Divisionen nicht negativ). */
function musterPixel(m, x, y, b, h) {
  const d = (a, c) => Math.floor(a / c);
  const dx = 2 * x + 1 - b, dy = 2 * y + 1 - h;
  if (m === 1) {
    if (x % 32 === 0 || y % 32 === 0) return [30, 30, 30, 255];
    const HELL = [[244, 232, 204], [204, 228, 244], [222, 240, 200], [240, 212, 232]];
    const DUNKEL = [[176, 52, 36], [36, 84, 168], [52, 128, 52], [132, 52, 132]];
    const q = (2 * x >= b ? 1 : 0) + (2 * y >= h ? 2 : 0);
    const c = (d(x, 4) + d(y, 4)) % 2 === 0 ? HELL[q] : DUNKEL[q];
    return [c[0], c[1], c[2], 255];
  }
  if (m === 2) {
    const r = Math.max(Math.min(b, h) - 2, 1), d2 = dx * dx + dy * dy;
    if (d2 > (r + 2) * (r + 2)) return [0, 0, 0, 0];
    if (d2 > r * r) return [150, 95, 40, 128];
    if (d2 > d(r * 4, 5) * d(r * 4, 5)) return [204, 148, 72, 255];
    const rp = Math.max(d(r, 5), 1), r3 = d(rp, 3), r4 = d(rp, 4);
    for (const [fx, fy] of [[3, 4], [6, 3], [7, 6], [4, 7], [5, 5]]) {
      const ex = dx - (d(2 * b * fx, 10) - b), ey = dy - (d(2 * h * fy, 10) - h);
      if ((ex + r3) * (ex + r3) + (ey + r3) * (ey + r3) <= r4 * r4) return [214, 92, 80, 255];
      if (ex * ex + ey * ey <= rp * rp) return [160, 30, 28, 255];
    }
    return (x * 7 + y * 13) % 17 === 0 ? [252, 226, 140, 255] : [214, 64, 36, 255];
  }
  if (m === 3) {
    const t = Math.max(d(Math.min(b, h), 3), 1);
    if (x < 2 || y < 2 || x >= b - 2 || y >= h - 2) return [44, 30, 20, 255];
    const rx = x < t || x >= b - t, ry = y < t || y >= h - t;
    if (rx && ry) return d(x + y, 2) % 2 === 0 ? [230, 180, 60, 255] : [150, 96, 30, 255];
    if (rx || ry) {
      const innen = (rx && (x === t - 1 || x === b - t)) || (ry && (y === t - 1 || y === h - t));
      return innen ? [90, 60, 30, 255] : [218, 170, 70, 255];
    }
    return (d(x, 2) + d(y, 2)) % 2 === 0 ? [250, 240, 215, 255] : [228, 212, 178, 255];
  }
  if (m === 4) return d(dx * dx + dy * dy, 6 * Math.max(b, h)) % 2 === 0 ? [250, 250, 245, 255] : [24, 28, 70, 255];
  if (m === 5) {
    const zacke = (xx, p, v) => { p = Math.max(p, 1); return p - Math.abs(2 * ((xx + v) % p) - p); };
    const p1 = Math.max(d(b, 3), 1), p2 = Math.max(d(b, 11), 1), p3 = Math.max(d(b, 5), 1);
    const fern = d(h, 2) - d(h * zacke(x, p1, d(b, 7)), 6 * p1) - d(h * zacke(x, p2, d(b, 3)), 18 * p2);
    const nah = d(h, 2) + d(h, 40) - d(h * zacke(x, p3, d(b, 2)), 12 * p3);
    if (y >= nah) return (x * 31 + y * 17) % 211 === 0 && y < d(h * 3, 5) ? [255, 204, 120, 255] : [36, 32, 62, 255];
    if (y >= fern) return y === fern ? [74, 66, 116, 170] : [74, 66, 116, 255];
    return [0, 0, 0, 0];
  }
  if (m === 6) {
    const ex = 2 * (x % 32) + 1 - 32, ey = 2 * (y % 32) + 1 - 32, r = 26;
    const rauh = 30 + (d(y, 32) % 8) * 28;
    if (ex * ex + ey * ey >= r * r) return [128, 128, rauh, 255];
    return [d((ex + r) * 255, 2 * r), d((r - ey) * 255, 2 * r), d(rauh, 2), 255];
  }
  if (m === 7) {
    const lx = x % 64, ly = y % 64;
    if (lx < 3 || ly < 3) return [52, 50, 48, 255];
    const g = 118 + ((d(x, 64) * 7 + d(y, 64) * 13) % 5) * 14;
    return [g, g - 4, g - 10, 255];
  }
  return [255, 255, 255, 255];
}

/** Teigling v1 aus Muster m (Mipmaps alpha-gewichtet wie der Vorbacker, herd/README.md §11.2; SHA-256 im Kopf = 0). */
function musterTeigling(m, b, h) {
  const stufen = 32 - Math.clz32(Math.max(b, h));
  const groessen = [];
  for (let i = 0, w = b, hh = h; i < stufen; i += 1, w = Math.max(w >> 1, 1), hh = Math.max(hh >> 1, 1)) groessen.push([w, hh]);
  const t = new Uint8Array(52 + groessen.reduce((s, [w, hh]) => s + 4 + w * hh * 4, 0));
  const dv = new DataView(t.buffer);
  t.set(ENC.encode('TEIGLING'), 0);
  dv.setUint16(8, 1, true); t[10] = 0; t[11] = stufen; dv.setUint16(12, b, true); dv.setUint16(14, h, true);
  let o = 52, vor = null, durch = false;
  for (const [w, hh] of groessen) {
    dv.setUint32(o, w * hh * 4, true);
    const z = t.subarray(o + 4, o + 4 + w * hh * 4);
    if (!vor) {
      for (let y = 0; y < hh; y += 1) for (let x = 0; x < w; x += 1) {
        const p = musterPixel(m, x, y, b, h);
        z.set(p, (y * w + x) * 4);
        if (p[3] !== 255) durch = true;
      }
    } else {
      const [vb, vh] = vor.groesse;
      for (let y = 0; y < hh; y += 1) {
        const y0 = 2 * y, y1 = y0 + 1 < vh ? y0 + 1 : vh - 1;
        for (let x = 0; x < w; x += 1) {
          const x0 = 2 * x, x1 = x0 + 1 < vb ? x0 + 1 : vb - 1;
          let sa = 0; const sc = [0, 0, 0];
          for (const i of [(y0 * vb + x0) * 4, (y0 * vb + x1) * 4, (y1 * vb + x0) * 4, (y1 * vb + x1) * 4]) {
            const a = vor.px[i + 3];
            sa += a;
            for (let k = 0; k < 3; k += 1) sc[k] += vor.px[i + k] * a;
          }
          const q = (y * w + x) * 4;
          for (let k = 0; k < 3; k += 1) z[q + k] = sa > 0 ? Math.floor((sc[k] + Math.floor(sa / 2)) / sa) : 0;
          z[q + 3] = (sa + 2) >> 2;
        }
      }
    }
    vor = { px: z, groesse: [w, hh] };
    o += 4 + w * hh * 4;
  }
  dv.setUint32(16, durch ? 1 : 0, true);
  return t;
}

const ENC = new TextEncoder();
const DEC = new TextDecoder('utf-8');
const F64 = new Float64Array(1);
const U64 = new BigUint64Array(F64.buffer);

/** Kanonische Textform eines Rückgabewerts (wie Wert::text in Rust). */
function wertText(w) {
  switch (w.art) {
    case 'I': return String(w.x);
    case 'F': F64[0] = w.x; return 'f' + U64[0].toString(16).padStart(16, '0');
    case 'T': {
      let o = '"';
      for (const c of DEC.decode(w.x)) {
        const k = c.codePointAt(0);
        if (c === '"') o += '\\"'; else if (c === '\\') o += '\\\\'; else if (c === '\n') o += '\\n';
        else if (k < 0x20) o += '\\u' + k.toString(16).padStart(4, '0'); else o += c;
      }
      return o + '"';
    }
    case 'U': return '[' + Array.from(w.x).join(',') + ']';
    case 'D': {   // f64-Liste aus den Bytes (Bits unverändert), NaN kanonisch wie in Rust
      const dv = new DataView(w.x.buffer, w.x.byteOffset, w.x.byteLength), aus = [];
      for (let i = 0; i + 8 <= w.x.byteLength; i += 8) {
        let b = dv.getBigUint64(i, true);
        if ((b & 0x7FF0000000000000n) === 0x7FF0000000000000n && (b & 0x000FFFFFFFFFFFFFn) !== 0n) b = 0x7FF8000000000000n;
        aus.push('f' + b.toString(16).padStart(16, '0'));
      }
      return '[' + aus.join(',') + ']';
    }
    default: return w.x;
  }
}

class Spieler {
  /** @param {WebAssembly.Instance} inst  Instanz von kern.wasm (eine je Spieler) */
  constructor(inst, vorgaben = {}) {
    this.k = inst.exports;
    this.vars = new Map();
    this.nr = 0;
    this.gesetzt = new Map(Object.entries(vorgaben));
    this.zeilen = [];
    this.nurBilder = false;
    this.mess = null;
  }
  mem() { return new Uint8Array(this.k.memory.buffer); }
  hex(f) { const p = this.k.puffer(16); f(p); return DEC.decode(this.mem().slice(p, p + 16)); }
  ausgabe(zeile, name, w) { if (!this.nurBilder && !this.mess) this.zeilen.push(zeile + ' ' + name + ' ' + wertText(w)); }

  spiele(befehle) { this.block(befehle); return this.zeilen; }

  block(bs) {
    for (const b of bs) {
      if (b.art === 'vorgabe') this.vars.set(b.v, this.gesetzt.has(b.v) ? Number(this.gesetzt.get(b.v)) : b.wert);
      else if (b.art === 'setze') this.vars.set(b.v, rechne(b.wert, this.vars, b.zeile));
      else if (b.art === 'wiederhole') {
        const n = rechne(b.anzahl, this.vars, b.zeile);
        for (let i = 0; i < n; i += 1) { if (b.v) this.vars.set(b.v, i); this.block(b.rumpf); }
      } else if (b.art === 'takte') {
        const n = rechne(b.anzahl, this.vars, b.zeile);
        for (let i = 0; i < n; i += 1) {
          const t0 = this.mess ? performance.now() : 0;
          const r = this.k.takt();
          if (this.mess) this.mess.takt(performance.now() - t0);
          this.ausgabe(b.zeile, 'takt', { art: 'I', x: r });
          this.bild(b.zeile, null);
        }
      } else {
        let w;
        if (b.name === 'bild') {
          const nr = b.args.length && b.args[0].wert ? (rechne(b.args[0].wert, this.vars, b.zeile) | 0) >>> 0 : null;
          w = this.bild(b.zeile, nr);
        } else {
          const t0 = this.mess && b.name === 'takt' ? performance.now() : 0;
          w = this.ruf(b.zeile, b.name, b.args);
          if (t0) this.mess.takt(performance.now() - t0);
          this.ausgabe(b.zeile, b.name, w);
        }
        if (b.ziel) this.vars.set(b.ziel, w.art === 'I' || w.art === 'F' ? w.x : 0);
      }
    }
  }

  bild(zeile, nr) {
    this.nr = nr === null ? this.nr + 1 : nr;
    const t0 = this.mess ? performance.now() : 0;
    const n = this.k.bild(this.nr | 0);
    if (this.mess) { this.mess.bild(performance.now() - t0, n); return { art: 'I', x: n }; }
    const w = { art: 'I', x: n };
    this.ausgabe(zeile, 'bild', w);
    const s = this.hex((p) => this.k.hash_szene(p));
    const pk = this.hex((p) => this.k.hash_paket(p));
    this.zeilen.push('B ' + this.nr + ' ' + s + ' ' + pk);
    return w;
  }

  /** Schreibt Byte-Blöcke in einen Austauschpuffer (8-Byte-ausgerichtet) und liefert ihre Zeiger. */
  puffer(bloecke) {
    let gesamt = 0;
    const off = bloecke.map((b) => { const o = gesamt; gesamt += (b.length + 7) & ~7; return o; });
    const p = this.k.puffer(Math.max(gesamt, 8));
    const m = this.mem();
    bloecke.forEach((b, i) => m.set(b, p + off[i]));
    return bloecke.map((b, i) => [p + off[i], b.length]);
  }

  /** Ausgabe mit Retry (K-013): f(ptr, kap) → Länge (Elemente); `breite` Bytes je Element. */
  aus(f, breite, art) {
    let kap = 64;
    for (;;) {
      const p = this.k.puffer(kap * breite);
      const n = f(p, kap);
      if (n < 0) return { art: 'I', x: n };
      if (n <= kap) {
        const b = this.mem().slice(p, p + n * breite);
        return art === 'U' ? { art, x: new Uint32Array(b.buffer, 0, n) } : { art, x: b };
      }
      kap = n;
    }
  }

  ruf(z, name, args) {
    const k = this.k, v = this.vars;
    const zahl = (i) => { if (!args[i].wert) fehler(z, 'Argument ' + (i + 1) + ' von ' + name + ' muss eine Zahl sein'); return rechne(args[i].wert, v, z); };
    const ii = (i) => zahl(i) | 0;
    const txt = (i) => { if (args[i].text === undefined) fehler(z, 'Argument ' + (i + 1) + ' von ' + name + ' muss ein Text sein'); return ENC.encode(args[i].text); };
    const zahlen = (i) => {
      const fo = args[i].folge;
      if (fo) {
        const n = rechne(fo.anzahl, v, z), vars = new Map(v), aus = [];
        for (let j = 0; j < n; j += 1) { vars.set(fo.v, j); aus.push(rechne(fo.wert, vars, z)); }
        return aus;
      }
      if (!args[i].liste) fehler(z, 'Liste erwartet'); return args[i].liste.map((a) => { if (!a.wert) fehler(z, 'Liste aus Zahlen erwartet'); return rechne(a.wert, v, z); }); };
    const strings = (i) => {
      const aus = [];
      const flach = (a) => { if (a.text !== undefined) aus.push(a.text); else if (a.liste) a.liste.forEach(flach); else fehler(z, 'Liste aus Texten erwartet'); };
      if (!args[i].liste) fehler(z, 'Liste erwartet');
      args[i].liste.forEach(flach);
      return aus;
    };
    const texte = (l) => {
      const teile = l.map((t) => ENC.encode(t));
      const b = new Uint8Array(teile.reduce((s, t) => s + 4 + t.length, 0));
      const dv = new DataView(b.buffer);
      let o = 0;
      for (const t of teile) { dv.setUint32(o, t.length, true); b.set(t, o + 4); o += 4 + t.length; }
      return b;
    };
    const f64s = (l) => new Uint8Array(new Float64Array(l).buffer);
    const I = (x) => ({ art: 'I', x }), F = (x) => ({ art: 'F', x });
    let p;
    switch (name) {
      case 'abi_version': return I(k.abi_version());
      case 'fehler_art': return I(k.fehler_art());
      case 'fehler_code': return I(k.fehler_code());
      case 'fehler_neu': return I(k.fehler_neu());
      case 'fehler_text': return this.aus((q, kap) => k.fehler_text(q, kap), 1, 'T');
      case 'melde_typfehler': { const a = ii(0), b = ii(1); p = this.puffer([txt(2)]); return I(k.melde_typfehler(a, b, ...p[0])); }
      case 'welt_neu': { const a = zahl(0), b = zahl(1); p = this.puffer([txt(2)]); return I(k.welt_neu(a, b, ...p[0])); }
      case 'welt_titel': p = this.puffer([txt(0)]); return I(k.welt_titel(...p[0]));
      case 'welt_hintergrund': p = this.puffer([txt(0)]); return I(k.welt_hintergrund(...p[0]));
      case 'welt_himmel': p = this.puffer([txt(0), txt(1)]); return I(k.welt_himmel(...p[0], ...p[1]));
      case 'welt_umgebung': { const s = zahl(1); p = this.puffer([txt(0)]); return I(k.welt_umgebung(...p[0], s)); }
      case 'welt_nebel': { const a = zahl(1), b = zahl(2); p = this.puffer([txt(0)]); return I(k.welt_nebel(...p[0], a, b)); }
      case 'welt_hole': return F(k.welt_hole(ii(0)));
      case 'teil_neu': return I(k.teil_neu(ii(0)));
      case 'teil_entferne': return I(k.teil_entferne(ii(0)));
      case 'teil_kopie': return I(k.teil_kopie(ii(0)));
      case 'teil_haenge': return I(k.teil_haenge(ii(0), ii(1)));
      case 'teil_kinder': { const t = ii(0); return this.aus((q, kap) => k.teil_kinder(t, q, kap), 4, 'U'); }
      case 'teil_setze': return I(k.teil_setze(ii(0), ii(1), zahl(2)));
      case 'teil_hole': return F(k.teil_hole(ii(0), ii(1)));
      case 'teil_lage': return I(k.teil_lage(ii(0), zahl(1), zahl(2), zahl(3)));
      case 'teil_verschiebe': return I(k.teil_verschiebe(ii(0), zahl(1), zahl(2), zahl(3)));
      case 'teil_groesse': return I(k.teil_groesse(ii(0), zahl(1), zahl(2), zahl(3)));
      case 'teil_schaue': return I(k.teil_schaue(ii(0), zahl(1), zahl(2), zahl(3)));
      case 'teil_trifft': return I(k.teil_trifft(ii(0), ii(1)));
      case 'komp_neu': return I(k.komp_neu(ii(0)));
      case 'komp_haenge': return I(k.komp_haenge(ii(0), ii(1)));
      case 'komp_loese': return I(k.komp_loese(ii(0)));
      case 'komp_von': return I(k.komp_von(ii(0), ii(1)));
      case 'komp_info': return I(k.komp_info(ii(0), ii(1)));
      case 'typ_nummer': p = this.puffer([txt(0)]); return I(k.typ_nummer(...p[0]));
      case 'feld_nummer': { const t = ii(0); p = this.puffer([txt(1)]); return I(k.feld_nummer(t, ...p[0])); }
      case 'setze_zahl': return I(k.setze_zahl(ii(0), ii(1), zahl(2)));
      case 'hole_zahl': return F(k.hole_zahl(ii(0), ii(1)));
      case 'setze_text': { const a = ii(0), b = ii(1); p = this.puffer([txt(2)]); return I(k.setze_text(a, b, ...p[0])); }
      case 'hole_text': { const a = ii(0), b = ii(1); return this.aus((q, kap) => k.hole_text(a, b, q, kap), 1, 'T'); }
      case 'setze_liste': {
        const a = ii(0), b = ii(1), ids = new Uint32Array(zahlen(2).map((x) => (x | 0) >>> 0));
        p = this.puffer([new Uint8Array(ids.buffer)]);
        return I(k.setze_liste(a, b, p[0][0], ids.length));
      }
      case 'hole_liste': { const a = ii(0), b = ii(1); return this.aus((q, kap) => k.hole_liste(a, b, q, kap), 4, 'U'); }
      case 'setze_zahlen': {
        const a = ii(0), b = ii(1), z = zahlen(2);
        p = this.puffer([f64s(z)]);
        return I(k.setze_zahlen(a, b, p[0][0], z.length));
      }
      case 'hole_zahlen': { const a = ii(0), b = ii(1); return this.aus((q, kap) => k.hole_zahlen(a, b, q, kap), 8, 'D'); }
      case 'form_grund': return I(k.form_grund(ii(0), zahl(1), zahl(2)));
      case 'form_eigene': {
        const pk = zahlen(0), dr = zahlen(1), gl = ii(2);
        p = this.puffer([f64s(pk), f64s(dr)]);
        return I(k.form_eigene(p[0][0], pk.length, p[1][0], dr.length, gl));
      }
      case 'bildchen_neu': p = this.puffer([texte(strings(0)), texte(strings(1))]); return I(k.bildchen_neu(...p[0], ...p[1]));
      case 'bildchen_rgba': {
        const b = ii(0), h = ii(1), bytes = Uint8Array.from(zahlen(2).map((x) => (x | 0) & 255));
        p = this.puffer([bytes]);
        return I(k.bildchen_rgba(b, h, p[0][0]));
      }
      case 'bildchen_teigling': {
        const bytes = Uint8Array.from(zahlen(0).map((x) => (x | 0) & 255));
        p = this.puffer([bytes]);
        return I(k.bildchen_teigling(p[0][0], bytes.length));
      }
      case 'teigling_muster': {
        const m = ii(0), b = ii(1), h = ii(2);
        if (!(b >= 1 && b <= 2048 && h >= 1 && h <= 2048)) fehler(z, 'teigling_muster: Breite und Höhe 1 … 2048');
        const bytes = musterTeigling(m, b, h);
        p = this.puffer([bytes]);
        return I(k.bildchen_teigling(p[0][0], bytes.length));
      }
      case 'teigling_datei': {
        const pfad = new TextDecoder().decode(txt(0));
        let bytes;
        try { bytes = new Uint8Array(require('fs').readFileSync(pfad)); } catch (e) { fehler(z, 'teigling_datei: ' + pfad + ': ' + e.message); }
        p = this.puffer([bytes]);
        return I(k.bildchen_teigling(p[0][0], bytes.length));
      }
      case 'ressource_hole': return F(k.ressource_hole(ii(0), ii(1)));
      case 'modell_teig': {
        const bytes = Uint8Array.from(zahlen(0).map((x) => (x | 0) & 255));
        p = this.puffer([bytes]);
        return I(k.modell_teig(p[0][0], bytes.length));
      }
      case 'modell_datei': {
        const pfad = new TextDecoder().decode(txt(0));
        let bytes;
        try { bytes = modellAusDatei(pfad); } catch (e) { fehler(z, 'modell_datei: ' + pfad + ': ' + e.message); }
        p = this.puffer([bytes]);
        return I(k.modell_teig(p[0][0], bytes.length));
      }
      case 'modell_teil': return I(k.modell_teil(ii(0), zahl(1), zahl(2), zahl(3)));
      case 'modell_info': return F(k.modell_info(ii(0), ii(1)));
      case 'modell_text': { const a = ii(0), b = ii(1), c = ii(2); return this.aus((q, kap) => k.modell_text(a, b, c, q, kap), 1, 'T'); }
      case 'teil_finde': { const t = ii(0); p = this.puffer([txt(1)]); return I(k.teil_finde(t, ...p[0])); }
      case 'eingabe': return I(k.eingabe(zahl(0), zahl(1), ii(2)));
      case 'takt': return I(k.takt());
      case 'paket_voll': return I(k.paket_voll());
      case 'hash_szene': return { art: 'H', x: this.hex((q) => k.hash_szene(q)) };
      case 'hash_paket': return { art: 'H', x: this.hex((q) => k.hash_paket(q)) };
      case 'schema_json': return this.aus((q, kap) => k.schema_json(q, kap), 1, 'T');
      default: fehler(z, "unbekannter Aufruf '" + name + "'");
    }
  }
}

/** Modellteig aus einer Datei (H-K16, wie modell_aus_datei im Rust-Spieler): beginnt sie mit TEIGMODL, so wie sie ist; sonst
 *  .glb/.gltf samt Nachbardateien (was der Vorbacker nennt, fehlende bleiben weg) über site/js/herd/teigling.wasm gebacken. */
let vorbackerNode = null;
function modellAusDatei(pfad) {
  const fs = require('fs');
  const haupt = new Uint8Array(fs.readFileSync(pfad));
  if (haupt.length >= 8 && new TextDecoder().decode(haupt.subarray(0, 8)) === 'TEIGMODL') return haupt;
  if (vorbackerNode === null) vorbackerNode = require('../site/js/herd/teigling.js').node();
  const paket = vorbackerNode.modellQuelle(pfad.replace(/\\/g, '/'), haupt, (p) => { try { return new Uint8Array(fs.readFileSync(p)); } catch (e) { return null; } });
  return vorbackerNode.modellVorbacken(paket);
}

module.exports = { lies, Spieler, zufall, wertText, SIGNATUREN, musterTeigling, modellAusDatei };
