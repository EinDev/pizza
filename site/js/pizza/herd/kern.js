// pizza-Interpreter · Herd: Typen, Kern laden, Schema, Objekte
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// =====================================================================
// HERD – Spiel-Engine (SPEC §18, HERD.md, herd/README.md §3)
// Dünne Anbindung an kern.wasm: Szene, Systeme, Prüfungen und Fehlertexte leben im Kern; hier stehen nur
// Sprachtypen, Objektidentität (Handle → Objekt), Textformen, Spielschleife, Eingabe und Fenster-Ereignisse.
// Komponenten kommen generisch aus dem Schema des geladenen Kerns (schema_json) – eine neue Komponente im Kern
// braucht hier keine Änderung (HERD.md §9).
// =====================================================================
const HERD_KLASSEN = ['Herd', 'Teil', 'Form', 'Bildchen'];
const HERD_KUECHE = 'Den Herd gibt es nur in der Hauptküche.';
const HERD_W0104 = 'Kein Herd verfügbar – Fenster wird nicht angezeigt.';
const HERD_KERN_FEHLT = 'PizzaFehler HOST: Der Herd-Kern fehlt (kern.wasm).';
// Node: kern.wasm und schema.json liegen neben pizza.js in herd/ (site/js/herd/); Browser/Worker: optionen.herdKern
// HERD-NODE-ANFANG – einzige Node-Abhängigkeit (K-128), im Worker-Kontext übersprungen
const HERD_NODE = typeof require === 'function' && typeof __dirname === 'string';
function herdDatei(name) {
  if (!HERD_NODE) return null;
  try { return require('fs').readFileSync(require('path').join(__dirname, 'herd', name)); } catch (e) { return null; }
}
// HERD-NODE-ENDE
// Namen der Komponenten für TYPEN/Editor/Compiler-Fallback (zur Ladezeit; Node liest schema.json, sonst die v1-Liste).
// Das Verhalten zur Laufzeit kommt immer aus dem Schema des geladenen Kerns.
const HERD_KOMPONENTEN = (function () {
  const b = herdDatei('schema.json');
  if (b !== null) { try { return JSON.parse(String(b)).komponenten.map(k => k.name); } catch (e) { /* Rückfall */ } }
  return ['Rechteck', 'Kreis', 'Text', 'Bild', 'Koerper', 'Licht', 'Kamera', 'Bewegung', 'Animation', 'Partikel'];
})();
const HERD_KOMP_NAMEN = new Set(HERD_KOMPONENTEN);
for (const n of HERD_KLASSEN.concat(HERD_KOMPONENTEN)) if (TYPEN.indexOf(n) < 0) TYPEN.push(n);

// Feldtypen (herd/README.md §2) → Nummern für den schnellen Weg
const HF_ZAHL = 1, HF_GANZ = 2, HF_DIAVOLO = 3, HF_TEXT = 4, HF_WAHL = 5, HF_FARBE = 6, HF_TEIL = 7, HF_FORM = 8,
  HF_BILDCHEN = 9, HF_LISTE = 10, HF_TEIL_LISTE = 11, HF_ZAHL_LISTE = 12;
const HF_NACH_NAME = { 'zahl': HF_ZAHL, 'ganz': HF_GANZ, 'diavolo': HF_DIAVOLO, 'text': HF_TEXT, 'wahl': HF_WAHL, 'farbe': HF_FARBE,
  'teil': HF_TEIL, 'form': HF_FORM, 'bildchen': HF_BILDCHEN, 'bildchen-liste': HF_LISTE,
  'teil-liste': HF_TEIL_LISTE, 'zahl-liste': HF_ZAHL_LISTE };

const HERD_ENC = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const HERD_DEC = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

// ---------- Kern laden ----------
let herdStandardModul;                     // undefined: noch nicht versucht · null: nicht vorhanden · WebAssembly.Module
const herdModulCache = new WeakMap();      // Bytes (ArrayBuffer/Uint8Array) → Module
const herdSchemaCache = new WeakMap();     // Module → Schema-Struktur (Tabellen einmal je Modul)
function herdModul(k) {
  if (typeof WebAssembly === 'undefined') return null;
  if (k !== undefined && k !== null) {
    if (k instanceof WebAssembly.Module) return k;
    if (typeof k !== 'object') return null;
    let m = herdModulCache.get(k);
    if (m === undefined) {
      try { m = new WebAssembly.Module(k); } catch (e) { m = null; }
      herdModulCache.set(k, m);
    }
    return m;
  }
  if (herdStandardModul === undefined) {
    herdStandardModul = null;
    const b = herdDatei('kern.wasm');
    if (b !== null) { try { herdStandardModul = new WebAssembly.Module(b); } catch (e) { /* bleibt null */ } }
  }
  return herdStandardModul;
}

// Eine Kern-Instanz je Lauf (die Welt ist global im Kern). Austauschpuffer und Speicheransichten werden wiederverwendet.
class HerdKern {
  constructor(modul) {
    this.e = new WebAssembly.Instance(modul, {}).exports;
    if (typeof this.e.abi_version !== 'function' || this.e.abi_version() !== 1) throw new Error('Herd-ABI ' + (this.e.abi_version && this.e.abi_version()));
    this.puf = null; this.u8 = null; this.dv = null; this.len = 0;
    this.schema = herdSchema(modul, this);
    this.teile = new Map();      // Teil-ID → HerdTeil (Identität)
    this.komps = new Map();      // Handle → HerdKomp (Identität)
    this.res = new Map();        // Ressourcen-ID → HerdForm | HerdBildchen
  }
  mem() {
    const b = this.e.memory.buffer;
    if (b !== this.puf) { this.puf = b; this.u8 = new Uint8Array(b); this.dv = new DataView(b); }
    return this.u8;
  }
  // Text (UTF-8) in den Austauschpuffer; → Zeiger, Länge in this.len
  text(s) {
    const max = s.length * 3 || 1;
    const p = this.e.puffer(max);
    this.len = HERD_ENC.encodeInto(s, this.mem().subarray(p, p + max)).written;
    return p;
  }
  // (ptr, kap) → len mit Längen-Retry (K-013); → Text oder null bei Fehler
  liesText(f) {
    let kap = 64;
    for (;;) {
      const p = this.e.puffer(kap);
      const n = f(p, kap);
      if (n < 0) return null;
      if (n <= kap) return HERD_DEC.decode(this.mem().subarray(p, p + n));
      kap = n;
    }
  }
  // (ptr, kap) → n (u32 LE) mit Retry; → Zahlen oder null bei Fehler
  liesListe(f) {
    let kap = 16;
    for (;;) {
      const p = this.e.puffer(kap * 4);
      const n = f(p, kap);
      if (n < 0) return null;
      if (n <= kap) {
        this.mem();
        const r = new Array(n);
        for (let i = 0; i < n; i++) r[i] = this.dv.getUint32(p + i * 4, true);
        return r;
      }
      kap = n;
    }
  }
  // (ptr, kap) → n (f64 LE) mit Retry; → Zahlen oder null bei Fehler
  liesZahlen(f) {
    let kap = 16;
    for (;;) {
      const p = this.e.puffer(kap * 8);
      const n = f(p, kap);
      if (n < 0) return null;
      if (n <= kap) {
        this.mem();
        const r = new Array(n);
        for (let i = 0; i < n; i++) r[i] = this.dv.getFloat64(p + i * 8, true);
        return r;
      }
      kap = n;
    }
  }
  hash(f) {
    const p = this.e.puffer(16);
    f(p);
    const u = this.mem();
    let s = '';
    for (let i = 0; i < 16; i++) s += String.fromCharCode(u[p + i]);
    return s;
  }
}

function herdSchema(modul, kern) {
  let s = herdSchemaCache.get(modul);
  if (s !== undefined) return s;
  const roh = JSON.parse(kern.liesText((p, kap) => kern.e.schema_json(p, kap)));
  s = { arten: [], nachName: new Map(), teilTab: null };
  const zugriff = Object.create(null);
  for (const k of roh.komponenten) {
    const art = { name: k.name, nummer: k.nummer, felder: [], feldNachName: new Map(), tab: null };
    for (const f of k.felder) {
      const feld = { name: f.name, nummer: f.nummer, t: HF_NACH_NAME[f.typ] || 0, typ: f.typ };
      art.felder.push(feld);
      art.feldNachName.set(f.name, feld);
    }
    art.tab = herdKompTabelle(art);
    s.arten[art.nummer] = art;
    s.nachName.set(art.name, art);
    zugriff[art.name.charAt(0).toLowerCase() + art.name.slice(1)] = art;
  }
  s.teilTab = herdTeilTabelle(zugriff);
  herdSchemaCache.set(modul, s);
  return s;
}

// ---------- Objekte (Handles) ----------
class HerdWelt {
  constructor(titel, breite, hoehe) {
    this.titel = titel; this.breite = breite; this.hoehe = hoehe;
    this.offen = false; this.bildnummer = 0; this.schliessen = false; this.imRueckruf = false;
    // Eingabe als Zustand (SPEC §18.3); vor* = Zustand vor dem letzten takt-Ereignis, erster = erster Takt des Ereignisses
    this.tasten = new Set(); this.vorTasten = this.tasten;
    this.mausX = 0; this.mausY = 0; this.knoepfe = 0; this.vorKnoepfe = 0; this.erster = false;
  }
}
class HerdTeil { constructor(id, tab) { this.id = id; this.tab = tab; } }
class HerdKomp { constructor(h, art, teil) { this.h = h; this.art = art; this.tab = art.tab; this.teil = teil; } }
class HerdForm { constructor(id) { this.id = id; } }
class HerdBildchen { constructor(id, b, h) { this.id = id; this.breite = b; this.hoehe = h; } }
class HerdKernFehlt { }

function herdKlasseVon(v) {
  if (v instanceof HerdWelt) return 'Herd';
  if (v instanceof HerdTeil) return 'Teil';
  if (v instanceof HerdForm) return 'Form';
  if (v instanceof HerdBildchen) return 'Bildchen';
  if (v instanceof HerdKomp) return v.art.name;
  return null;
}
