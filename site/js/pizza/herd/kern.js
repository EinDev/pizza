// pizza-Interpreter · Herd: Typen, Kern laden, Schema, Objekte
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// =====================================================================
// HERD – Spiel-Engine (SPEC §18, HERD.md, herd/README.md §3)
// Dünne Anbindung an kern.wasm: Szene, Systeme, Prüfungen und Fehlertexte leben im Kern; hier stehen nur
// Sprachtypen, Objektidentität (Handle → Objekt), Textformen, Spielschleife, Eingabe und Fenster-Ereignisse.
// Komponenten kommen generisch aus dem Schema des geladenen Kerns (schema_json) – eine neue Komponente im Kern
// braucht hier keine Änderung (HERD.md §9).
// =====================================================================
const HERD_KLASSEN = ['Herd', 'Teil', 'Form', 'Bildchen', 'Modell'];
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
if (TYPEN.indexOf('Kniff') < 0) TYPEN.push('Kniff');   // H-K13: erbbare Basisklasse (herd/kniff.js), keine Herd-Klasse für neu

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
    // Mausfang: Wunsch des Programms (mausFangen) und gemeldeter Zustand; Rohbewegung/Rad des letzten takt-Ereignisses
    this.fangWunsch = false; this.gefangen = false; this.bewegungX = 0; this.bewegungY = 0; this.rad = 0;
  }
}
class HerdTeil { constructor(id, tab) { this.id = id; this.tab = tab; } }
class HerdKomp { constructor(h, art, teil) { this.h = h; this.art = art; this.tab = art.tab; this.teil = teil; } }
class HerdForm { constructor(id) { this.id = id; } }
class HerdBildchen { constructor(id, b, h) { this.id = id; this.breite = b; this.hoehe = h; } }
// Modell (H-K16): eigene Modell-ID im Kern (getrennt von Formen/Bildchen), Pfad für die Textform
class HerdModell { constructor(id, pfad) { this.id = id; this.pfad = pfad; } }
class HerdKernFehlt { }

// ---------- Vorbacker (SPEC §18.5, PROJEKTE §5.3/§5.4, K-145/K-147) ----------
// teigling.wasm backt PNG/JPEG der Kiste vor dem Start zu Teiglingen (derselbe Rust-Code wie site/js/herd/teigling.js
// und nativ – bitgleich). optionen.vorbacker: WebAssembly.Module | ArrayBuffer | Uint8Array | ein Vorbacker-Objekt mit
// vorbacken(bytes)/sha256(bytes) (z. B. PizzaVorbacker.node()); Node ohne Option: site/js/herd/teigling.wasm.
const VORBACKER_FEHLT = 'PizzaFehler HOST: Der Vorbacker fehlt (teigling.wasm).';
class VorbackerFehlt { }
const TEIGLING_KOPF = 52, TEIGLING_FEHLER_LAENGE = 64, TEIGLING_MAX_KANTE = 2048, TEIGMENGE_MAX = 67108864;
const TEIGLING_MAGIE = [84, 69, 73, 71, 76, 73, 78, 71];   // "TEIGLING"
const TEIGLING_LEER = new Uint8Array(0);                     // keine Bild-Endung: der Kern meldet „kein lesbares Bild“ (61)
function istBildPfad(pfad) { return /\.(png|jpg|jpeg)$/.test(pfad); }
function istModellPfad(pfad) { return /\.(glb|gltf)$/.test(pfad); }
// Modellteig (H-K16, herd/teigling/src/modell.rs): Kopf grob prüfen → null | { fehler: diavolo, sha256: hex }
const MODELL_MAGIE = [84, 69, 73, 71, 77, 79, 68, 76];   // "TEIGMODL"
function modellTeigKopf(t) {
  if (!(t instanceof Uint8Array) || t.length < 64) return null;
  for (let i = 0; i < 8; i++) if (t[i] !== MODELL_MAGIE[i]) return null;
  if ((t[8] | (t[9] << 8)) !== 1 || t[11] !== 0 || (t[10] !== 0 && t[10] !== 255)) return null;
  return { fehler: t[10] === 255, sha256: teiglingHex(t.subarray(16, 48)) };
}
// Klangteig (H-K19a, herd/teigling/src/klang.rs): Kopf und Länge voll prüfen (wie lies_teig in herd/klang)
// → null | { fehler: diavolo, sha256: hex, rate, kanaele, frames }
const KLANG_MAGIE = [84, 69, 73, 71, 75, 76, 78, 71];   // "TEIGKLNG"
const KLANGMENGE_MAX = 67108864;
function istKlangPfad(pfad) { return /\.(wav|flac)$/.test(pfad); }
function klangTeigKopf(t) {
  if (!(t instanceof Uint8Array) || t.length < 64) return null;
  for (let i = 0; i < 8; i++) if (t[i] !== KLANG_MAGIE[i]) return null;
  const u16 = (i) => t[i] | (t[i + 1] << 8);
  const u32 = (i) => (t[i] | (t[i + 1] << 8) | (t[i + 2] << 16)) + t[i + 3] * 16777216;
  if (u16(8) !== 1 || t[11] !== 0) return null;
  const sha256 = teiglingHex(t.subarray(16, 48));
  if (t[10] === 255) return u16(64) !== 0 && t.length === 68 + u16(66) ? { fehler: true, sha256, rate: 0, kanaele: 0, frames: 0 } : null;
  const rate = u32(48), kanaele = u16(52), frames = u32(56);
  if (t[10] !== 0 || rate < 8000 || rate > 96000 || kanaele < 1 || kanaele > 2 || frames < 1 || frames > 600 * rate || t.length - 64 !== frames * kanaele * 2) return null;
  return { fehler: false, sha256, rate, kanaele, frames };
}
// Anteile eines Teiglings/Modellteigs an der Teigmenge: [{ sha, n }] – ein Modellteig zählt ohne seine eingebetteten Bilder
// (Schlüssel SHA-256 + ":modell"), jedes eingebettete Bild unter der SHA-256 seiner Quelle (gleich wie die Bilddatei selbst)
function herdTeigAnteile(t) {
  const k = teiglingKopf(t);
  if (k !== null) return k.fehler ? [] : [{ sha: k.sha256, n: t.length }];
  const m = modellTeigKopf(t);
  if (m === null || m.fehler) return [];
  const u32 = (i) => (t[i] | (t[i + 1] << 8) | (t[i + 2] << 16)) + t[i + 3] * 16777216;
  const aus = [];
  let basis = t.length, o = 64;
  const n = o + 4 <= t.length ? u32(o) : 0;
  o += 4;
  for (let i = 0; i < n && o + 4 <= t.length; i++) {
    const l = u32(o), b = t.subarray(o + 4, o + 4 + l), kb = teiglingKopf(b);
    basis -= 4 + l;
    if (kb !== null && !kb.fehler) aus.push({ sha: kb.sha256, n: l });
    o += 4 + l;
  }
  aus.unshift({ sha: m.sha256 + ':modell', n: basis });
  return aus;
}
// Quellpaket (herd/teigling/src/gltf.rs quellpaket): ohne Nachbardateien die Hauptdatei selbst, sonst "TEIGQUEL" …
function herdQuellpaket(haupt, dateien) {
  if (!dateien.length) return haupt;
  const uris = dateien.map(d => HERD_ENC.encode(d.uri));
  let n = 16 + haupt.length;
  for (let i = 0; i < dateien.length; i++) n += 8 + uris[i].length + dateien[i].bytes.length;
  const aus = new Uint8Array(n), dv = new DataView(aus.buffer);
  aus.set([84, 69, 73, 71, 81, 85, 69, 76], 0);
  dv.setUint32(8, dateien.length, true); dv.setUint32(12, haupt.length, true); aus.set(haupt, 16);
  let o = 16 + haupt.length;
  for (let i = 0; i < dateien.length; i++) {
    dv.setUint32(o, uris[i].length, true); aus.set(uris[i], o + 4); o += 4 + uris[i].length;
    dv.setUint32(o, dateien[i].bytes.length, true); aus.set(dateien[i].bytes, o + 4); o += 4 + dateien[i].bytes.length;
  }
  return aus;
}
function teiglingHex(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16);
  return s;
}
// Kopf vollständig prüfen (wie lies_kopf in herd/teigling, bildchen_teigling im Kern und PizzaVorbacker.kopf)
// → null (ungültig) | { fehler: diavolo, sha256: hex }
function teiglingKopf(t) {
  if (!(t instanceof Uint8Array) || t.length < TEIGLING_KOPF) return null;
  for (let i = 0; i < 8; i++) if (t[i] !== TEIGLING_MAGIE[i]) return null;
  const u16 = (i) => t[i] | (t[i + 1] << 8);
  const u32 = (i) => (t[i] | (t[i + 1] << 8) | (t[i + 2] << 16)) + t[i + 3] * 16777216;
  if (u16(8) !== 1) return null;
  const format = t[10], stufen = t[11], b = u16(12), h = u16(14);
  const sha256 = teiglingHex(t.subarray(20, 52));
  if (format === 255) {
    const code = t.length === TEIGLING_FEHLER_LAENGE ? u16(52) : 0;
    if (stufen !== 0 || b !== 0 || h !== 0 || (code !== 1 && code !== 2)) return null;
    return { fehler: true, sha256 };
  }
  let n = 0;
  for (let m = Math.max(b, h); m > 0; m = Math.floor(m / 2)) n++;
  if (format !== 0 || b < 1 || h < 1 || b > TEIGLING_MAX_KANTE || h > TEIGLING_MAX_KANTE || stufen !== n) return null;
  let p = TEIGLING_KOPF, w = b, hh = h;
  for (let s = 0; s < stufen; s++) {
    if (p + 4 > t.length || u32(p) !== w * hh * 4) return null;
    p += 4 + w * hh * 4;
    w = Math.max(1, Math.floor(w / 2));
    hh = Math.max(1, Math.floor(hh / 2));
  }
  return p === t.length ? { fehler: false, sha256 } : null;
}
// Dünne Hülle um teigling.wasm (ABI wie site/js/herd/teigling.js)
class HerdVorbacker {
  constructor(modul) {
    const e = new WebAssembly.Instance(modul, {}).exports;
    if (typeof e.abi_version !== 'function' || e.abi_version() !== 1 || e.teigling_version() !== 1) throw new Error('teigling.wasm: unbekannte Version');
    this.e = e;
  }
  rein(b) {
    const p = this.e.puffer(b.length);
    new Uint8Array(this.e.memory.buffer, p, b.length).set(b);
    return p;
  }
  vorbacken(q) {
    const n = this.e.vorbacken(this.rein(q), q.length);
    const aus = new Uint8Array(n);
    aus.set(new Uint8Array(this.e.memory.buffer, this.e.ergebnis(), n));
    this.e.freigeben();
    return aus;
  }
  sha256(b) {
    this.e.sha256(this.rein(b), b.length);
    const aus = new Uint8Array(32);
    aus.set(new Uint8Array(this.e.memory.buffer, this.e.ergebnis(), 32));
    return aus;
  }
  // Modelle (H-K16): nur, wenn das Modul sie kennt (modell_version 1)
  get hatModelle() { return typeof this.e.modell_vorbacken === 'function' && this.e.modell_version() === 1; }
  aus(n) {
    const aus = new Uint8Array(n);
    aus.set(new Uint8Array(this.e.memory.buffer, this.e.ergebnis(), n));
    this.e.freigeben();
    return aus;
  }
  modellBraucht(pfad, haupt) {
    const p = HERD_ENC.encode(pfad), ein = new Uint8Array(p.length + 1 + haupt.length);
    ein.set(p, 0); ein.set(haupt, p.length + 1);
    const t = HERD_DEC.decode(this.aus(this.e.modell_braucht(this.rein(ein), ein.length)));
    return t.split('\n').filter(Boolean).map(z => { const x = z.split('\t'); return { uri: x[0], pfad: x[1] }; });
  }
  modellVorbacken(paket) { return this.aus(this.e.modell_vorbacken(this.rein(paket), paket.length)); }
  // Klänge (H-K19a): nur, wenn das Modul sie kennt (klang_version 1)
  get hatKlaenge() { return typeof this.e.klang_vorbacken === 'function' && this.e.klang_version() === 1; }
  klangVorbacken(q) { return this.aus(this.e.klang_vorbacken(this.rein(q), q.length)); }
}
let vorbackerStandard;                     // undefined: noch nicht versucht · null: nicht vorhanden · HerdVorbacker
const vorbackerCache = new WeakMap();      // Module/Bytes → HerdVorbacker | null (eine Instanz je Modul)
function herdVorbacker(v) {
  if (v !== undefined && v !== null && typeof v === 'object' && typeof v.vorbacken === 'function' && typeof v.sha256 === 'function') return v;
  if (typeof WebAssembly === 'undefined') return null;
  const baue = (m) => { try { return new HerdVorbacker(m instanceof WebAssembly.Module ? m : new WebAssembly.Module(m)); } catch (e) { return null; } };
  if (v !== undefined && v !== null) {
    if (typeof v !== 'object') return null;
    let vb = vorbackerCache.get(v);
    if (vb === undefined) { vb = baue(v); vorbackerCache.set(v, vb); }
    return vb;
  }
  if (vorbackerStandard === undefined) {
    const b = herdDatei('teigling.wasm');
    vorbackerStandard = b === null ? null : baue(b);
  }
  return vorbackerStandard;
}

function herdKlasseVon(v) {
  if (v instanceof HerdWelt) return 'Herd';
  if (v instanceof HerdTeil) return 'Teil';
  if (v instanceof HerdForm) return 'Form';
  if (v instanceof HerdBildchen) return 'Bildchen';
  if (v instanceof HerdModell) return 'Modell';
  if (v instanceof HerdKomp) return v.art.name;
  return null;
}
