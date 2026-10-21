/*
 * pizzaiolo – Linker: fügt laufzeit.wasm und den erzeugten Programmcode zu EINEM Modul zusammen (HOST-ABI.md §1).
 * Die Laufzeit bleibt unverändert (Indizes bleiben gültig); Programmfunktionen, -typen, -tabelleneinträge
 * und -daten werden angehängt.
 */
(function (root, fabrik) {
  'use strict';
  const teile = (typeof module === 'object' && module && module.exports) ? { kodierer: require('./kodierer.js') } : root.PizzaioloTeile;
  const api = fabrik(teile.kodierer);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.PizzaioloTeile.linker = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function (K) {
  'use strict';
  const { Puffer, section, verbinde, leseModul, utf8 } = K;

  const ABI_EXPORTE = ['memory', 'abi_version', 'limit_setzen', 'speicher_limit_setzen', 'arg_puffer', 'arg_fertig', 'schritte', 'zeitMs'];

  let cache = null;
  function laufzeitModul(bytes) {
    if (cache && cache.bytes === bytes) return cache.m;
    const m = leseModul(bytes);
    m.fnIndex = new Map();
    for (const e of m.exporte) if (e.art === 0) m.fnIndex.set(e.name, e.idx);
    // Element-Section: Anzahl und Rest
    if (m.elementRoh) {
      const l = new K.Leser(m.elementRoh, 0);
      m.elementAnzahl = l.u32();
      m.elementRest = m.elementRoh.subarray(l.i);
    } else { m.elementAnzahl = 0; m.elementRest = new Uint8Array(0); }
    if (m.datenRoh) {
      const l = new K.Leser(m.datenRoh, 0);
      m.datenAnzahlRoh = l.u32();
      m.datenRest = m.datenRoh.subarray(l.i);
    } else { m.datenAnzahlRoh = 0; m.datenRest = new Uint8Array(0); }
    cache = { bytes, m };
    return m;
  }

  class Modulbau {
    /** info: { heapBase, zustand, heapStartAdr } aus dem Laufzeit-Build */
    constructor(laufzeitBytes, info) {
      this.L = laufzeitModul(laufzeitBytes);
      this.info = info;
      this.typen = [];          // zusätzliche Typen {p, e}
      this.typKey = new Map();
      for (let i = 0; i < this.L.typen.length; i++) {
        const t = this.L.typen[i];
        const k = t.p.join(',') + '>' + t.e.join(',');
        if (!this.typKey.has(k)) this.typKey.set(k, i);
      }
      this.funktionen = [];     // {typ, lokale: [[n, t]], code: Uint8Array}
      this.tabelle = [];        // Funktionsindizes (global) für die Tabelle
      this.daten = new Puffer(4096);
      this.datenBasis = (info.heapBase + 15) & ~15;
      this.exporte = [];
      this.basisFn = this.L.anzahlImportFunktionen + this.L.funktionen.length;
      this.tabBasis = this.L.tabellen.length ? this.L.tabellen[0].min : 0;
    }
    rt(name) {
      const i = this.L.fnIndex.get(name);
      if (i === undefined) throw new Error('Laufzeitfunktion fehlt: ' + name);
      return i;
    }
    typ(p, e) {
      const k = p.join(',') + '>' + e.join(',');
      let i = this.typKey.get(k);
      if (i === undefined) {
        i = this.L.typen.length + this.typen.length;
        this.typen.push({ p, e });
        this.typKey.set(k, i);
      }
      return i;
    }
    /** reserviert eine Funktion, liefert globalen Index */
    neueFunktion(p, e) {
      const idx = this.basisFn + this.funktionen.length;
      this.funktionen.push({ typ: this.typ(p, e), lokale: [], code: null });
      return idx;
    }
    setzeRumpf(idx, lokale, code) {
      const f = this.funktionen[idx - this.basisFn];
      f.lokale = lokale; f.code = code;
    }
    tabellenEintrag(fnIdx) { this.tabelle.push(fnIdx); return this.tabBasis + this.tabelle.length - 1; }
    // Daten: liefert Adresse
    datum(bytes, ausr) {
      const a = ausr || 8;
      while ((this.daten.n % a) !== 0) this.daten.byte(0);
      const adr = this.datenBasis + this.daten.n;
      this.daten.bytes(bytes);
      return adr;
    }
    exportiere(name, idx) { this.exporte.push({ name, idx }); }

    baue(meta) {
      const L = this.L;
      const datenEnde = (this.datenBasis + this.daten.n + 15) & ~15;
      const teile = [new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])];
      const roh = (id) => L.sections.find(s => s.id === id);
      // 1 Typen
      {
        const p = new Puffer();
        p.u32(L.typen.length + this.typen.length);
        for (const t of L.typen.concat(this.typen)) { p.byte(0x60); p.u32(t.p.length); for (const x of t.p) p.byte(x); p.u32(t.e.length); for (const x of t.e) p.byte(x); }
        teile.push(section(1, p.fertig()));
      }
      // 2 Importe (unverändert)
      if (roh(2)) teile.push(section(2, roh(2).bytes));
      // 3 Funktionen
      {
        const p = new Puffer();
        p.u32(L.funktionen.length + this.funktionen.length);
        for (const t of L.funktionen) p.u32(t);
        for (const f of this.funktionen) p.u32(f.typ);
        teile.push(section(3, p.fertig()));
      }
      // 4 Tabelle
      {
        const p = new Puffer();
        const min = this.tabBasis + this.tabelle.length;
        p.u32(1); p.byte(0x70); p.byte(0); p.u32(min);
        teile.push(section(4, p.fertig()));
      }
      // 5 Speicher
      {
        const p = new Puffer();
        const seiten = Math.max(L.speicher[0].min, Math.ceil((datenEnde + 0x10000) / 0x10000));
        p.u32(1); p.byte(0); p.u32(seiten);
        teile.push(section(5, p.fertig()));
      }
      // 6 Globale (unverändert)
      if (roh(6)) teile.push(section(6, roh(6).bytes));
      // 7 Exporte
      {
        const p = new Puffer();
        const ex = [];
        for (const name of ABI_EXPORTE) {
          const e = L.export(name);
          if (e) ex.push(e);
        }
        for (const e of this.exporte) ex.push({ name: e.name, art: 0, idx: e.idx });
        p.u32(ex.length);
        for (const e of ex) { p.name(e.name); p.byte(e.art); p.u32(e.idx); }
        teile.push(section(7, p.fertig()));
      }
      // 9 Elemente
      {
        const p = new Puffer();
        const extra = this.tabelle.length ? 1 : 0;
        p.u32(L.elementAnzahl + extra);
        p.bytes(L.elementRest);
        if (extra) {
          p.byte(0); p.byte(0x41); p.s32(this.tabBasis); p.byte(0x0b);
          p.u32(this.tabelle.length);
          for (const f of this.tabelle) p.u32(f);
        }
        teile.push(section(9, p.fertig()));
      }
      // 12 DataCount (falls vorhanden)
      const extraDaten = 2;
      if (roh(12)) { const p = new Puffer(); p.u32(L.datenAnzahlRoh + extraDaten); teile.push(section(12, p.fertig())); }
      // 10 Code
      {
        const p = new Puffer(1 << 16);
        const sc = roh(10);
        const q = new K.Leser(sc.bytes, 0);
        const n = q.u32();
        p.u32(n + this.funktionen.length);
        p.bytes(sc.bytes.subarray(q.i));
        for (const f of this.funktionen) {
          const k = new Puffer(f.code.length + 16);
          k.u32(f.lokale.length);
          for (const [anz, t] of f.lokale) { k.u32(anz); k.byte(t); }
          k.bytes(f.code);
          const b = k.fertig();
          p.u32(b.length); p.bytes(b);
        }
        teile.push(section(10, p.fertig()));
      }
      // 11 Daten
      {
        const p = new Puffer(this.daten.n + 1024);
        p.u32(L.datenAnzahlRoh + extraDaten);
        p.bytes(L.datenRest);
        // Programmdaten
        p.byte(0); p.byte(0x41); p.s32(this.datenBasis); p.byte(0x0b);
        p.u32(this.daten.n); p.bytes(this.daten.b.subarray(0, this.daten.n));
        // HEAP_START = Ende der Programmdaten
        p.byte(0); p.byte(0x41); p.s32(this.info.heapStartAdr); p.byte(0x0b);
        const hs = new Uint8Array(4); new DataView(hs.buffer).setUint32(0, datenEnde, true);
        p.u32(4); p.bytes(hs);
        teile.push(section(11, p.fertig()));
      }
      // Custom „pizzaiolo“
      {
        const p = new Puffer();
        p.name('pizzaiolo');
        p.bytes(utf8(JSON.stringify(meta || {})));
        teile.push(section(0, p.fertig()));
      }
      return verbinde(teile);
    }
  }

  return { Modulbau, laufzeitModul };
});
