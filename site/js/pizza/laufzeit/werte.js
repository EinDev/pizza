// pizza-Interpreter · Laufzeit-Werte, Signale, Scopes, Textformen, Zufallsgenerator
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// =====================================================================
// LAUFZEIT – Werte, Signale, Scopes
// =====================================================================

class Dauer { constructor(ms) { this.ms = ms; } }
class Klasse {
  constructor(name, decl) {
    this.name = name; this.decl = decl; this.basis = null; this.erfuellt = [];
    this.felder = []; this.statischeFelder = []; this.statisch = new Map();
    this.methoden = new Map(); this.ktoren = [];
    this.rohling = false; this.gebacken = false; this.calzone = false;
    this.nativKtor = null; this.zaehler = 0; this.cache = null; this.eingebaut = false;
  }
}
class Rezeptur { constructor(name, decl) { this.name = name; this.decl = decl; this.basen = []; this.methoden = []; } }
class EnumTyp { constructor(name) { this.name = name; this.werte = []; this.nachName = new Map(); } }
class EnumWert { constructor(typ, name, pos) { this.typ = typ; this.name = name; this.pos = pos; } }
class Obj {
  constructor(klasse, nr) {
    this.klasse = klasse; this.nr = nr; this.felder = new Map(); this.zugeklappt = false;
    this.nachricht = ''; this.cache = null;
  }
}
class Funktion { constructor(n, scope) { this.n = n; this.scope = scope; } }
class Methode {
  constructor(decl, klasse) {
    this.decl = decl; this.name = decl.name; this.params = decl.params; this.body = decl.body;
    this.klasse = klasse; this.statisch = decl.mods.indexOf('tiefkühl') >= 0;
    this.sicht = sichtbarkeit(decl.mods); this.haltbar = -1; this.veraltet = null; this.gewarnt = false;
    this.ueberschreibt = decl.annos.some(a => a.name === 'PizzaÜberschreibt');
    this.hatUnten = false;
  }
}
class Gebunden { constructor(obj, liste, name) { this.obj = obj; this.liste = liste; this.name = name; } }
// ziel: Wert, an den die native Methode gebunden ist (z. B. `b.hinzu` als Wert) – nur für den Küchen-Schnappschuss
class NativFn { constructor(name, fn, ziel) { this.name = name; this.fn = fn; this.ziel = ziel === undefined ? null : ziel; } }
class Modul { constructor(name, methoden, felder) { this.name = name; this.methoden = methoden; this.felder = felder; } }
class Teig { constructor(fn) { this.fn = fn; this.fertig = false; this.wert = null; this.auf = false; } }
class Lieferung {
  constructor(fn, nr) { this.fn = fn; this.nr = nr; this.prio = 0; this.zustellung = null; this.rueckruf = null; }
}
class Zustellung { constructor(p, w, f) { this.puenktlich = p; this.wert = w; this.fehler = f; } }
class Reste { constructor(w, m) { this.wert = w; this.matschig = m; } }
class OfenRoh { constructor(t, d) { this.teil = t; this.zeit = d; } }
const AUTO = { auto: true };

class Var {
  constructor(w, t, g) {
    this.w = w; this.t = t; this.g = g; this.weg = false;
    this.mod = null; this.klasse = null; this.besitzer = null; this.unbelegt = false;
  }
}

class Scope {
  constructor(parent, ctx, grenze) {
    this.vars = new Map();
    this.parent = parent;
    this.ctx = ctx || (parent ? parent.ctx : null);
    this.grenze = grenze;
  }
}

class AnanasWurf { constructor(obj, z, s) { this.obj = obj; this.zeile = z; this.spalte = s; } }
class PizzaFehlerSig { constructor(code, text, z, s) { this.code = code; this.text = text; this.zeile = z; this.spalte = s; } }
class LimitSig { }
class PanikSig { }
class BudgetSig { constructor(frame) { this.frame = frame; } }
// Küchenbrigade: Wert passt in keinen Karton (§2.4); art = „Eine Funktion“ …
class KartonFehler { constructor(art) { this.art = art; } }

const BRK = { brk: 1 }, CNT = { cnt: 1 }, RET = { ret: 1 };
const DEKL = new Set(['Klasse', 'Rezeptur', 'Enum', 'Methode']);

function zahlText(v) { return Object.is(v, -0) ? '0' : String(v); }

function dauerText(ms) {
  const neg = ms < 0;
  let r = Math.round(Math.abs(ms));
  if (r === 0) return '0ms';
  const teile = [];
  const E = [['d', 86400000], ['h', 3600000], ['min', 60000], ['s', 1000], ['ms', 1]];
  for (const [n, f] of E) {
    const q = Math.floor(r / f);
    if (q) { teile.push(q + n); r -= q * f; }
  }
  return (neg ? '-' : '') + teile.join(' ');
}

function rundeAuf(x, n) {
  if (!n) return Math.sign(x) * Math.round(Math.abs(x));
  const f = Math.pow(10, n);
  const r = Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9) / f;
  return Object.is(r, -0) ? 0 : r;
}

function zahlMitKomma(x) { return zahlText(x).replace('.', ','); }

// K-085/K-103: Tausendergruppen mit Punkt, Dezimalkomma, genau n Nachkommastellen (Rundung K-048);
// ab |x| ≥ 10²¹ wie kompakt(2), ∞/NaN wie kompakt
function tausenderText(x, n) {
  if (!isFinite(x) || Math.abs(x) >= 1e21) return kompaktText(x, 2);
  const r = rundeAuf(x, n);
  if (!isFinite(r) || Math.abs(r) >= 1e21) return kompaktText(r, 2); // Rundung kann 10²¹ erreichen
  const neg = r < 0;
  const [g, k] = Math.abs(r).toFixed(n).split('.');
  const gg = g.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + gg + (k !== undefined ? ',' + k : '');
}

// K-085/K-103: deutsche lange Skala bis Dezilliarde, darüber „m × 10ⁿ“
const KOMPAKT_STUFEN = [[1e63, 'Dezd.'], [1e60, 'Dez.'], [1e57, 'Nond.'], [1e54, 'Non.'], [1e51, 'Oktd.'], [1e48, 'Okt.'],
  [1e45, 'Septd.'], [1e42, 'Sept.'], [1e39, 'Sextd.'], [1e36, 'Sext.'], [1e33, 'Quintd.'], [1e30, 'Quint.'],
  [1e27, 'Quadrd.'], [1e24, 'Quadr.'], [1e21, 'Trd.'], [1e18, 'Trio.'], [1e15, 'Brd.'], [1e12, 'Bio.'], [1e9, 'Mrd.'],
  [1e6, 'Mio.'], [1e3, 'Tsd.']];
const HOCH = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function kompaktText(x, n) {
  if (x !== x) return 'NaN';
  if (!isFinite(x)) return x < 0 ? '-∞' : '∞';
  const a = Math.abs(x);
  if (a >= 1e66) {
    // Mantisse und Exponent aus der kürzesten Ziffernfolge (wie String(x)), nie über log10/pow
    const [ms, es] = a.toExponential().split('e');
    let e = Number(es);
    let m = rundeAuf(Number(ms), n);
    if (m >= 10) { m = rundeAuf(m / 10, n); e += 1; }
    return (x < 0 ? '-' : '') + zahlMitKomma(m) + ' × 10' + String(e).replace(/\d/g, d => HOCH[d]);
  }
  for (const [f, name] of KOMPAKT_STUFEN) {
    if (a >= f) return zahlMitKomma(rundeAuf(x / f, n)) + ' ' + name;
  }
  return zahlMitKomma(rundeAuf(x, n));
}

// Betrag mit zwei Nachkommastellen und Komma, ohne Tausendertrennung (K-048, K-103, K-127)
function betragText(x) {
  if (!isFinite(x) || Math.abs(x) >= 1e21) return kompaktText(x, 2);
  const r = Math.round(Math.abs(x) * 100 + 1e-9) / 100;
  const [g, k] = r.toFixed(2).split('.');
  return (x < 0 && r !== 0 ? '-' : '') + g + ',' + k;
}

// mulberry32 als Objekt: eigener Strom mit Saat (K-078)
function normSaat(n) { const m = 4294967296; return ((n % m) + m) % m; }
class ZufallGen {
  constructor(saat) { this.saat = normSaat(saat); this.zustand = this.saat | 0; }
  r() {
    let a = this.zustand;
    a = a + 0x6D2B79F5 | 0;
    this.zustand = a;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
class Kammer {
  // K-106: name = reiner Kammername, raum = Namensraum oder null, kennung = name bzw. raum + "/" + name
  constructor(name, raum) { this.name = name; this.raum = raum; this.kennung = raum === null ? name : raum + '/' + name; this.daten = new Map(); }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// K-007: [+-]? Ziffern[_Ziffern]* ((.|,) Ziffern[_Ziffern]*)? nach trim
const ZAHLTEXT_RE = /^[+-]?[0-9]+(?:_[0-9]+)*(?:[.,][0-9]+(?:_[0-9]+)*)?$/;
function zahlAusText(text) {
  const t = text.trim();
  if (!ZAHLTEXT_RE.test(t)) return null;
  const v = Number(t.replace(/_/g, '').replace(',', '.'));
  return Object.is(v, -0) ? 0 : v;
}

function tabelle(o) { return Object.assign(Object.create(null), o); }

function standardWert(typ) {
  if (!typ || typ.feld) return null;
  switch (typ.name) {
    case 'salami': case 'funghi': return 0;
    case 'diavolo': return false;
    default: return null;
  }
}
