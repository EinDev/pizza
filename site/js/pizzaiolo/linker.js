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

  const ABI_EXPORTE = ['memory', 'abi_version', 'limit_setzen', 'speicher_limit_setzen', 'saat_setzen', 'arg_puffer', 'arg_fertig', 'schritte', 'zeitMs'];
  /** optionale Importe → Gruppe (HOST-ABI §2: ein .pkarton importiert nur, was das Programm braucht) */
  const OPTIONAL = { ui_senden: 'theke', ui_warte: 'theke', vorrat_lesen: 'vorrat', vorrat_schreiben: 'vorrat', echtzeit_ms: 'echtzeit', zone_ms: 'echtzeit', kueche_auftrag: 'kueche', kueche_bericht: 'kueche',
    herd_kern: 'herd', herd_schreibe: 'herd', herd_lies: 'herd', herd_warte: 'herd', herd_senden: 'herd' };
  /** Gruppe eines Laufzeit-Imports (Modul „herd“ = Exporte des Herd-Kerns, alle in Gruppe herd) */
  const gruppeVon = (im) => (im.modul === 'herd' ? 'herd' : OPTIONAL[im.name]);
  const umgeschrieben = new Map();

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

  /** Datensegment: STATISCH_START der Laufzeit (Küchenbrigade sichert [statischStart, __heap_base), THREADS.md §4.4) */
  function statischSegment(p, info) {
    p.byte(0); p.byte(0x41); p.s32(info.statischStartAdr); p.byte(0x0b);
    const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, info.statischStart, true);
    p.u32(4); p.bytes(b);
  }

  class Modulbau {
    /** info: { heapBase, zustand, heapStartAdr } aus dem Laufzeit-Build */
    constructor(laufzeitBytes, info, gruppen) {
      this.L = laufzeitModul(laufzeitBytes);
      this.info = info;
      // Importe ohne benötigte Gruppe werden entfernt und durch Stubs ersetzt
      const L0 = this.L;
      const nImp = L0.anzahlImportFunktionen;
      this.weg = [];
      L0.importe.forEach((im, i) => { const g = gruppeVon(im); if (g && !(gruppen || []).includes(g)) this.weg.push(i); });
      this.gruppen = (gruppen || []).slice();
      const wegSet = new Set(this.weg);
      const behalten = [];
      for (let i = 0; i < nImp; i++) if (!wegSet.has(i)) behalten.push(i);
      const neuIdx = new Map(behalten.map((alt, n) => [alt, n]));
      const nImpNeu = behalten.length;
      const stubBasis = nImpNeu + L0.funktionen.length;
      this.abb = (alt) => {
        if (alt < nImp) return wegSet.has(alt) ? stubBasis + this.weg.indexOf(alt) : neuIdx.get(alt);
        return alt - this.weg.length;
      };
      this.behalten = behalten;
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
      this.passivDaten = null;  // passives Datensegment (Kiste, PROJEKTE PA2) – nie im Speicher, nur per memory.init
      this.exporte = [];
      this.basisFn = this.L.anzahlImportFunktionen + this.L.funktionen.length;
      this.tabBasis = this.L.tabellen.length ? this.L.tabellen[0].min : 0;
    }
    rt(name) {
      const i = this.L.fnIndex.get(name);
      if (i === undefined) throw new Error('Laufzeitfunktion fehlt: ' + name);
      return this.abb(i);
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
    /** passives Datensegment (HOST-ABI §1 v2: Kiste) anlegen; liefert seinen Index für memory.init (das letzte Segment) */
    passiv(bytes) { this.passivDaten = bytes; return this.L.datenAnzahlRoh + (this.info.statischStartAdr ? 3 : 2); }

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
      // 2 Importe (ohne entfernte optionale)
      {
        const p = new Puffer();
        p.u32(this.behalten.length);
        for (const i of this.behalten) { const im = L.importe[i]; p.name(im.modul); p.name(im.name); p.byte(0); p.u32(im.typ); }
        teile.push(section(2, p.fertig()));
      }
      // 3 Funktionen (Laufzeit, Stubs, Programm)
      {
        const p = new Puffer();
        p.u32(L.funktionen.length + this.weg.length + this.funktionen.length);
        for (const t of L.funktionen) p.u32(t);
        for (const i of this.weg) p.u32(L.importe[i].typ);
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
          if (e) ex.push(e.art === 0 ? { name: e.name, art: 0, idx: this.abb(e.idx) } : e);
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
        p.bytes(this.weg.length ? this.laufzeitElemente() : L.elementRest);
        if (extra) {
          p.byte(0); p.byte(0x41); p.s32(this.tabBasis); p.byte(0x0b);
          p.u32(this.tabelle.length);
          for (const f of this.tabelle) p.u32(f);
        }
        teile.push(section(9, p.fertig()));
      }
      // 12 DataCount (falls vorhanden; mit passivem Segment Pflicht für memory.init)
      const extraDaten = (this.info.statischStartAdr ? 3 : 2) + (this.passivDaten ? 1 : 0);
      if (roh(12) || this.passivDaten) { const p = new Puffer(); p.u32(L.datenAnzahlRoh + extraDaten); teile.push(section(12, p.fertig())); }
      // 10 Code
      {
        const p = new Puffer(1 << 16);
        const sc = roh(10);
        const q = new K.Leser(sc.bytes, 0);
        const n = q.u32();
        p.u32(n + this.weg.length + this.funktionen.length);
        if (this.weg.length) {
          p.bytes(this.laufzeitCode());
          for (const i of this.weg) {
            const t = L.typen[L.importe[i].typ];
            const k = new Puffer();
            k.u32(0);
            if (t.e.length === 1) k.bytes(t.e[0] === 0x7f ? [0x41, 0x7f] : t.e[0] === 0x7e ? [0x42, 0x7f] : [0x44, 0, 0, 0, 0, 0, 0, 0xf0, 0xbf]);
            k.byte(0x0b);
            const b = k.fertig();
            p.u32(b.length); p.bytes(b);
          }
        } else p.bytes(sc.bytes.subarray(q.i));
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
        if (this.info.statischStartAdr) statischSegment(p, this.info);
        if (this.passivDaten) { p.byte(1); p.u32(this.passivDaten.length); p.bytes(this.passivDaten); }
        teile.push(section(11, p.fertig()));
      }
      // Custom „pizzaiolo“
      {
        const p = new Puffer();
        p.name('pizzaiolo');
        p.bytes(utf8(JSON.stringify(Object.assign({}, meta || {}, { gruppen: this.gruppen }))));
        teile.push(section(0, p.fertig()));
      }
      return verbinde(teile);
    }
  }

  Modulbau.prototype.schluessel = function () { return this.weg.join(','); };
  /** Laufzeit-Code mit umgeschriebenen Aufrufindizes (Cache je Menge entfernter Importe) */
  Modulbau.prototype.laufzeitCode = function () {
    const key = 'code:' + this.schluessel();
    let c = umgeschrieben.get(key);
    if (c && c.L === this.L) return c.bytes;
    const p = new Puffer(this.L.code.reduce((a, b) => a + b.length + 5, 0));
    for (const rumpf of this.L.code) { const b = K.umschreibeAufrufe(rumpf, this.abb); p.u32(b.length); p.bytes(b); }
    const bytes = p.fertig();
    umgeschrieben.set(key, { L: this.L, bytes });
    return bytes;
  };
  /** Element-Segmente der Laufzeit mit umgeschriebenen Funktionsindizes */
  Modulbau.prototype.laufzeitElemente = function () {
    const q = new K.Leser(this.L.elementRest, 0);
    const p = new Puffer(this.L.elementRest.length + 16);
    for (let s = 0; s < this.L.elementAnzahl; s++) {
      const flags = q.u32();
      if (flags !== 0) throw new Error('Element-Segment mit Flags ' + flags + ' nicht unterstützt');
      const start = q.i;
      while (q.b[q.i] !== 0x0b) q.i++;
      q.i++;
      p.u32(0); p.bytes(this.L.elementRest.subarray(start, q.i));
      const n = q.u32();
      p.u32(n);
      for (let i = 0; i < n; i++) p.u32(this.abb(q.u32()));
    }
    return p.fertig();
  };

  /**
   * Zweiteiliger Bau für den JS-Host: nur der Programmteil als eigenes Modul, das Speicher, Tabelle und alle
   * rt_*-Funktionen aus dem (einmal kompilierten, gecachten) Laufzeitmodul importiert (Modulname „laufzeit“).
   * Gleicher Code wie im Einzelmodul – nur die Funktionsindizes der Laufzeit sind Importe.
   */
  class ProgrammModulbau {
    constructor(laufzeitBytes, info) {
      this.L = laufzeitModul(laufzeitBytes);
      this.info = info;
      this.typen = [];
      this.typKey = new Map();
      this.importe = [];
      this.importIndex = new Map();
      const nImp = this.L.anzahlImportFunktionen;
      for (const e of this.L.exporte) {
        if (e.art !== 0 || !e.name.startsWith('rt_')) continue;
        const lt = this.L.typen[this.L.funktionen[e.idx - nImp]];
        this.importIndex.set(e.name, this.importe.length);
        this.importe.push({ name: e.name, typ: this.typ(lt.p, lt.e) });
      }
      this.funktionen = [];
      this.tabelle = [];
      this.daten = new Puffer(4096);
      this.datenBasis = (info.heapBase + 15) & ~15;
      this.passivDaten = null;
      this.exporte = [];
      this.basisFn = this.importe.length;
      this.tabBasis = this.L.tabellen.length ? this.L.tabellen[0].min : 0;
      this.tabName = (this.L.exporte.find(e => e.art === 1) || {}).name || '__indirect_function_table';
    }
    rt(name) {
      const i = this.importIndex.get(name);
      if (i === undefined) throw new Error('Laufzeitfunktion fehlt: ' + name);
      return i;
    }
    typ(p, e) {
      const k = p.join(',') + '>' + e.join(',');
      let i = this.typKey.get(k);
      if (i === undefined) { i = this.typen.length; this.typen.push({ p, e }); this.typKey.set(k, i); }
      return i;
    }
    neueFunktion(p, e) { const idx = this.basisFn + this.funktionen.length; this.funktionen.push({ typ: this.typ(p, e), lokale: [], code: null }); return idx; }
    setzeRumpf(idx, lokale, code) { const f = this.funktionen[idx - this.basisFn]; f.lokale = lokale; f.code = code; }
    tabellenEintrag(fnIdx) { this.tabelle.push(fnIdx); return this.tabBasis + this.tabelle.length - 1; }
    datum(bytes, ausr) {
      const a = ausr || 8;
      while ((this.daten.n % a) !== 0) this.daten.byte(0);
      const adr = this.datenBasis + this.daten.n;
      this.daten.bytes(bytes);
      return adr;
    }
    exportiere(name, idx) { this.exporte.push({ name, idx }); }
    passiv(bytes) { this.passivDaten = bytes; return this.info.statischStartAdr ? 3 : 2; }

    /** liefert { bytes, tabellenZuwachs, speicherSeiten } */
    baue() {
      const datenEnde = (this.datenBasis + this.daten.n + 15) & ~15;
      const teile = [new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])];
      { const p = new Puffer(); p.u32(this.typen.length); for (const t of this.typen) { p.byte(0x60); p.u32(t.p.length); for (const x of t.p) p.byte(x); p.u32(t.e.length); for (const x of t.e) p.byte(x); } teile.push(section(1, p.fertig())); }
      const seiten = Math.ceil((datenEnde + 0x10000) / 0x10000);
      {
        const p = new Puffer();
        p.u32(this.importe.length + 2);
        p.name('laufzeit'); p.name('memory'); p.byte(2); p.byte(0); p.u32(seiten);
        p.name('laufzeit'); p.name(this.tabName); p.byte(1); p.byte(0x70); p.byte(0); p.u32(this.tabBasis + this.tabelle.length);
        for (const i of this.importe) { p.name('laufzeit'); p.name(i.name); p.byte(0); p.u32(i.typ); }
        teile.push(section(2, p.fertig()));
      }
      { const p = new Puffer(); p.u32(this.funktionen.length); for (const f of this.funktionen) p.u32(f.typ); teile.push(section(3, p.fertig())); }
      { const p = new Puffer(); p.u32(this.exporte.length); for (const e of this.exporte) { p.name(e.name); p.byte(0); p.u32(e.idx); } teile.push(section(7, p.fertig())); }
      if (this.tabelle.length) {
        const p = new Puffer();
        p.u32(1); p.byte(0); p.byte(0x41); p.s32(this.tabBasis); p.byte(0x0b);
        p.u32(this.tabelle.length); for (const f of this.tabelle) p.u32(f);
        teile.push(section(9, p.fertig()));
      }
      const nDaten = (this.info.statischStartAdr ? 3 : 2) + (this.passivDaten ? 1 : 0);
      if (this.passivDaten) { const p = new Puffer(); p.u32(nDaten); teile.push(section(12, p.fertig())); }
      {
        const p = new Puffer(1 << 16);
        p.u32(this.funktionen.length);
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
      {
        const p = new Puffer(this.daten.n + 64 + (this.passivDaten ? this.passivDaten.length + 8 : 0));
        p.u32(nDaten);
        p.byte(0); p.byte(0x41); p.s32(this.datenBasis); p.byte(0x0b); p.u32(this.daten.n); p.bytes(this.daten.b.subarray(0, this.daten.n));
        p.byte(0); p.byte(0x41); p.s32(this.info.heapStartAdr); p.byte(0x0b);
        const hs = new Uint8Array(4); new DataView(hs.buffer).setUint32(0, datenEnde, true);
        p.u32(4); p.bytes(hs);
        if (this.info.statischStartAdr) statischSegment(p, this.info);
        if (this.passivDaten) { p.byte(1); p.u32(this.passivDaten.length); p.bytes(this.passivDaten); }
        teile.push(section(11, p.fertig()));
      }
      return { bytes: verbinde(teile), tabellenZuwachs: this.tabelle.length, speicherSeiten: seiten };
    }
  }

  return { Modulbau, ProgrammModulbau, laufzeitModul, gruppeVon };
});
