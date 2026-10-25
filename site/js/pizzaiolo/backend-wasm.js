/*
 * pizzaiolo – Backend „wasm“: IR → Wasm-Funktionen (im Modulbau des Linkers).
 * Konventionen: HOST-ABI.md (Ergebnis), IR.md (Eingabe). Laufzeit-Zustand liegt im Speicher (ZUSTAND).
 * Jede IR-Funktion wird zweimal erzeugt: „schnell“ (ohne Stapeltiefen-Prüfungen je Knoten) und „exakt“
 * (Prüfung je Anweisung/zusammengesetztem Ausdruck). Der Eintritt wählt anhand der aktuellen Tiefe.
 */
(function (root, fabrik) {
  'use strict';
  const imNode = typeof module === 'object' && module && module.exports;
  const teile = imNode ? { kodierer: require('./kodierer.js') } : root.PizzaioloTeile;
  const api = fabrik(teile.kodierer);
  if (imNode) module.exports = api;
  else root.PizzaioloTeile.backendWasm = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function (K) {
  'use strict';
  const { T, OP, Code } = K;

  const W = (x) => BigInt.asIntN(64, x);
  const KARTON = W(0xFFFC000000000000n);
  const NEIN = W(0xFFFD000000000000n);
  const JA = W(0xFFFD000000000001n);
  const UNDEF = W(0xFFFF000000000000n);
  const WEG = W(0xFFFF000000000001n);
  const MARKE = W(0xFFFC000000000000n);
  const NAN = W(0x7FF8000000000000n);
  const PTR = 0xFFFE0000n << 32n;
  const MAX_STAPEL = 1500;

  // Zustand-Offsets
  const Z_SCHRITTE = 0, Z_GRENZE = 8, Z_RUECK = 24, Z_SIG = 32, Z_POS = 36, Z_TIEFE = 40, Z_GEFROREN = 56;
  const SIG_ANANAS = 1, SIG_BUDGET = 2;

  const OHNE_SCHRITT = new Set(['feldinit', 'statinit', 'annoHaltbar', 'annoVeraltet', 'rufeInit']);
  const OPS = { PLUS: 0, MINUS: 1, MAL: 2, DURCH: 3, REST: 4, GL: 5, UNGL: 6, KL: 7, KLG: 8, GR: 9, GRG: 10 };

  class NichtUnterstuetzt extends Error {
    constructor(grund, p) { super(grund); this.grund = grund; this.p = p; }
  }

  // ------------------------------------------------------------ Programmweite Erzeugung
  class Backend {
    constructor(ir, mb, info) {
      this.ir = ir; this.mb = mb; this.info = info;
      this.Z = info.zustand;
      this.texte = new Map();
      this.fns = [];
      this.typGen = mb.typ([T.i32, T.i64, T.i64, T.i32], [T.i64]);
    }
    rt(name) { return this.mb.rt(name); }

    /** Text-Objekt in den Daten (wie Text-Header der Laufzeit), liefert Adresse */
    text(s) {
      let a = this.texte.get(s);
      if (a !== undefined) return a;
      const b = K.utf8(s);
      const d = new Uint8Array(16 + b.length);
      const dv = new DataView(d.buffer);
      dv.setUint32(0, 1, true); dv.setUint32(4, b.length, true);
      d.set(b, 16);
      a = this.mb.datum(d, 8);
      new DataView(this.mb.daten.b.buffer, this.mb.daten.b.byteOffset).setUint32(a - this.mb.datenBasis + 12, a + 16, true);
      this.texte.set(s, a);
      return a;
    }
    textW(s) { return W(PTR | BigInt(this.text(s))); }
    u32Array(werte) {
      const d = new Uint8Array(Math.max(4, werte.length * 4));
      const dv = new DataView(d.buffer);
      werte.forEach((v, i) => dv.setUint32(i * 4, v >>> 0, true));
      return this.mb.datum(d, 4);
    }

    baue() {
      const ir = this.ir;
      // Positionstabelle
      // Positionstabelle: je Eintrag i32 zeile, spalte, datei (Datei-Index, laufzeit/src/start.rs POS_BREITE)
      const posD = new Uint8Array(ir.pos.length * 12);
      const pdv = new DataView(posD.buffer);
      ir.pos.forEach(([z, s, d], i) => { pdv.setInt32(i * 12, z || 0, true); pdv.setInt32(i * 12 + 4, s || 0, true); pdv.setInt32(i * 12 + 8, d || 0, true); });
      this.posAdr = this.mb.datum(posD, 8);
      // Globale Variablen (UNDEF)
      const ng = (ir.globale || []).length;
      const gd = new Uint8Array(Math.max(8, ng * 8));
      const gdv = new DataView(gd.buffer);
      for (let i = 0; i < ng; i++) gdv.setBigInt64(i * 8, UNDEF, true);
      this.globAdr = this.mb.datum(gd, 8);
      this.globFlagAdr = this.mb.datum(new Uint8Array(Math.max(4, ng * 4)), 4);
      // Funktionen deklarieren
      for (const fn of ir.funktionen) {
        const ptypen = fn.params.map(p => { const sl = fn.slots[p.slot]; return sl.zelle ? T.i64 : sl.darst === 'zahl' ? T.f64 : sl.darst === 'bool' ? T.i32 : T.i64; });
        const sig = [T.i32, T.i64, T.i64].concat(ptypen);
        const gen = this.mb.neueFunktion([T.i32, T.i64, T.i64, T.i32], [T.i64]);
        const schnell = this.mb.neueFunktion(sig, [T.i64]);
        const exakt = this.mb.neueFunktion(sig, [T.i64]);
        const tab = this.mb.tabellenEintrag(gen);
        this.fns.push({ fn, gen, schnell, exakt, tab, ptypen });
      }
      for (const f of this.fns) {
        const maxTf = maxTiefe(f.fn);
        f.maxTf = maxTf;
        const gs = new FnGen(this, f, false);
        const ge = new FnGen(this, f, true);
        const cs = gs.erzeuge();
        const ce = ge.erzeuge();
        this.mb.setzeRumpf(f.schnell, gs.lokaleListe(), cs);
        this.mb.setzeRumpf(f.exakt, ge.lokaleListe(), ce);
        // generischer Eintritt: Argumente vom Argumentstapel (bereits gebunden & geprüft)
        const c = new Code();
        c.get(0).get(1).get(2);
        f.fn.params.forEach((p, i) => {
          c.get(3).ld64(i * 8);
          if (f.ptypen[i] === T.f64) c.op(OP.f64_reinterpret_i64);
          else if (f.ptypen[i] === T.i32) c.i64(JA).op(OP.i64_eq);
        });
        c.call(f.schnell).end();
        this.mb.setzeRumpf(f.gen, [], c.bytes());
      }
      // Kiste (SPEC §11.2, PROJEKTE PA2): Inhalte im passiven Datensegment, gelesen über eine Kopierfunktion mit memory.init
      // (laufzeit/src/kiste.rs ruft sie über ihren Tabellenindex – Rust kennt den Segment-Index nicht)
      const pj = ir.projekt || null;
      if (pj && pj.kiste) {
        const seg = this.mb.passiv(pj.kiste.daten);
        const kop = this.mb.neueFunktion([T.i32, T.i32, T.i32], []);
        const c = new Code();
        c.get(0).get(1).get(2).op(0xfc); c.p.u32(8); c.p.u32(seg); c.p.byte(0);   // memory.init seg, 0
        c.end();
        this.mb.setzeRumpf(kop, [], c.bytes());
        this.kisteTab = this.mb.tabellenEintrag(kop);
      }
      const start = this.mb.neueFunktion([], [T.i32]);
      this.mb.setzeRumpf(start, [[1, T.i64]], this.startCode());
      this.mb.exportiere('start', start);
      // Küchenbrigade (HOST-ABI §3, Gruppe kueche): kueche_stueck(auftrag, i) -> (ptr, len) für Klon-Instanzen
      if ((this.ir.gruppen || []).includes('kueche')) {
        const ks = this.mb.neueFunktion([T.i32, T.i32], [T.i32, T.i32]);
        const c = new Code();
        c.get(0).get(1).call(this.rt('rt_kueche_stueck')).call(this.rt('rt_kueche_laenge')).end();
        this.mb.setzeRumpf(ks, [], c.bytes());
        this.mb.exportiere('kueche_stueck', ks);
      }
    }

    startCode() {
      const ir = this.ir;
      const c = new Code();
      const call = (n) => c.call(this.rt(n));
      c.i32(this.posAdr).i32(ir.pos.length); call('rt_pos');
      // Projekte (SPEC §2.6, §2.1, §11.2): Dateinamen (nur Mehrdatei-Programme), Standard-Argumente, Kiste
      const pj = ir.projekt || null;
      if (pj && pj.dateien) { c.i32(this.u32Array(pj.dateien.map(d => this.text(d)))).i32(pj.dateien.length); call('rt_dateien'); }
      if (pj && pj.args && pj.args.length) { c.i32(this.u32Array(pj.args.map(a => this.text(a)))).i32(pj.args.length); call('rt_standard_args'); }
      if (this.kisteTab !== undefined) {
        const tab = [];
        for (const e of pj.kiste.eintraege) tab.push(this.text(e.pfad), e.art, e.off, e.len);
        c.i32(this.kisteTab).i32(this.u32Array(tab)).i32(pj.kiste.eintraege.length); call('rt_kiste');
      }
      for (const f of this.fns) {
        const fn = f.fn;
        c.i32(f.tab).i32(this.text(fn.name || '')); call('rt_fn'); c.op(OP.drop);
        for (const p of fn.params) {
          c.i32(fn.id).i32(this.text(p.name)).i32(p.typ ? this.text(p.typ) : 0).i32((p.nieKarton ? 1 : 0) | (p.gebacken ? 2 : 0)); call('rt_param');
        }
      }
      let rezIdx = 0;
      const rezNamen = [];
      for (const r of ir.registrierung || []) {
        switch (r.art) {
          case 'klasse': {
            c.i32(this.text(r.name)).i32(r.flags); call('rt_klasse'); c.op(OP.drop);
            for (const fd of r.felder) { c.i32(r.idx).i32(this.text(fd.name)).i32(fd.typ ? this.text(fd.typ) : 0).i32(fd.flags).i32(fd.sicht); call('rt_feld'); }
            for (const m of r.methoden) { c.i32(r.idx).i32(this.text(m.name)).i32(m.fn === null ? -1 : m.fn).i32(m.flags).i32(m.sicht).i32(m.nparam).i32(m.pos); call('rt_methode'); c.op(OP.drop); }
            for (const m of r.ktoren) { c.i32(r.idx).i32(m.fn).i32(m.hatUnten ? 1 : 0); call('rt_ktor'); c.op(OP.drop); }
            break;
          }
          case 'rezeptur': c.i32(this.text(r.name)); call('rt_rezeptur'); c.op(OP.drop); rezNamen.push(r); rezIdx++; break;
          case 'enum': c.i32(this.text(r.name)).i32(this.u32Array(r.werte.map(w => this.text(w)))).i32(r.werte.length); call('rt_enum'); c.op(OP.drop); break;
          case 'globalfn': c.i32(-1).i32(this.text(r.name)).i32(r.fn).i32(1).i32(0).i32(r.nparam).i32(r.pos); call('rt_methode'); c.op(OP.drop); break;
        }
      }
      let ri = 0;
      for (const r of ir.registrierung || []) {
        if (r.art === 'klasse') {
          if (r.basis) { c.i32(r.idx).i32(this.text(r.basis)); call('rt_klasse_basis'); }
          for (const e of r.erfuellt) { c.i32(r.idx).i32(this.text(e)); call('rt_klasse_erfuellt'); }
          if (r.feldInit !== null) { c.i32(r.idx).i32(r.feldInit); call('rt_klasse_feldinit'); }
        } else if (r.art === 'rezeptur') {
          for (const b of r.basen) { c.i32(ri).i32(this.text(b)); call('rt_rezeptur_basis'); }
          ri++;
        }
      }
      for (const w of ir.warnungen) { c.i32(this.text(w.code)).i32(this.text(w.text)).i32(w.pos); call('rt_warnung_statisch'); }
      if (ir.startfehler) { const sf = ir.startfehler; c.i32(this.text(sf.code)).i32(this.text(sf.text)).i32(sf.pos); call('rt_startfehler'); }
      // Herd: Gruppe herd → rt_lauf lädt das Schema nach den Startfehlern; herdNoetig (K-128) → Kern ist Pflicht (pizza.herd_kern(1))
      if ((ir.gruppen || []).includes('herd')) { c.i32(ir.herdNoetig ? 1 : 0); call('rt_herd_noetig'); }
      // Klang (K-153): Gruppe klang → klangNoetig = Erzeuger ist Pflicht (pizza.klang_kern(1))
      if ((ir.gruppen || []).includes('klang')) { c.i32(ir.klangNoetig ? 1 : 0); call('rt_klang_noetig'); }
      if (pj && pj.spaetfehler) { c.i32(this.text(pj.spaetfehler.code)).i32(this.text(pj.spaetfehler.text)); call('rt_spaetfehler'); }
      // globale Funktionsvariablen
      const gnamen = ir.globale || [];
      for (const n of ir.globaleFunktionen || []) {
        const g = gnamen.indexOf(n);
        c.i32(this.globAdr + g * 8).i32(this.text(n)); call('rt_global_fn'); c.st64(0);
      }
      c.i32(ir.vorbereiten === null || ir.vorbereiten === undefined ? -1 : ir.vorbereiten).i32(ir.oben === null || ir.oben === undefined ? -1 : ir.oben); call('rt_lauf');
      c.end();
      return c.bytes();
    }
  }

  function zielTyp(t) { return t === T.f64 ? 'F' : t === T.i32 ? 'B' : 'W'; }

  function maxTiefe(fn) {
    let m = 0;
    const geh = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const x of n) geh(x); return; }
      if (typeof n.tf === 'number' && n.tf > m) m = n.tf;
      for (const k in n) { if (k === 'fn' && typeof n[k] === 'number') continue; const v = n[k]; if (v && typeof v === 'object') geh(v); }
    };
    geh(fn.body); geh(fn.ausdr);
    return m;
  }

  // ------------------------------------------------------------ Funktionsgenerator
  const TY = { F: T.f64, B: T.i32, W: T.i64, I: T.i32 };

  class FnGen {
    constructor(be, f, exakt) {
      this.be = be; this.f = f; this.fn = f.fn; this.exakt = exakt;
      this.c = new Code();
      this.lok = [];            // zusätzliche Lokale (Typen)
      this.frei = { F: [], B: [], W: [] };
      this.labels = [];
      this.handler = [];
      this.ctrl = [];
      this.pend = 0; this.pendStart = false; this.pendPos = 0;
      this.Z = be.Z;
      this.nParams = 3 + f.fn.params.length;
    }
    rt(n) { return this.be.rt(n); }
    neuLokal(t) { this.lok.push(TY[t]); return this.nParams + this.lok.length - 1; }
    temp(t) { const l = this.frei[t].pop(); return l !== undefined ? l : this.neuLokal(t); }
    frei_(t, i) { this.frei[t].push(i); }
    lokaleListe() {
      const r = [];
      for (const t of this.lok) {
        if (r.length && r[r.length - 1][1] === t) r[r.length - 1][0]++;
        else r.push([1, t]);
      }
      return r;
    }

    // ---------------- Labels
    auf(art, t) { this.flush(); const l = { art }; this.labels.push(l); if (art === 'loop') this.c.loop(t); else if (art === 'if') this.c.if_(t); else this.c.block(t); return l; }
    zu() { this.flush(); this.labels.pop(); this.c.end(); }
    sonst() { this.flush(); this.c.else_(); }
    tiefe(l) { const i = this.labels.lastIndexOf(l); if (i < 0) throw new Error('Label nicht im Stapel'); return this.labels.length - 1 - i; }
    br(l) { this.flush(); this.c.br(this.tiefe(l)); }
    brIf(l) { this.flush(); this.c.brIf(this.tiefe(l)); }

    // ---------------- Zustand
    zLoad32(off) { this.c.i32(this.Z).ld32(off); }
    zStore32Wert(off, gen) { this.c.i32(this.Z); gen(); this.c.st32(off); }
    sigPruefen() {
      this.c.i32(this.Z).ld32(Z_SIG);
      this.brIf(this.handler[this.handler.length - 1]);
    }
    setzeTiefe(tf) {
      this.c.i32(this.Z).get(this.t0).i32(tf).op(OP.i32_add).st32(Z_TIEFE);
    }

    // ---------------- Schritte
    flush() {
      if (this.pend === 0) return;
      const p = this.pend, st = this.pendStart, pos = this.pendPos;
      this.pend = 0; this.pendStart = false;
      this.emitFlush(p, st, pos);
    }
    emitFlush(pend, start, pos) {
      const c = this.c, Z = this.Z;
      const t = this.temp('F');
      c.i32(Z).i32(Z).ldf(Z_SCHRITTE).f64(pend).op(OP.f64_add).tee(t).stf(Z_SCHRITTE);
      c.get(t).i32(Z).ldf(Z_GRENZE).op(OP.f64_gt);
      this.auf('if');
      c.i32(pend).i32(start ? 1 : 0).i32(pos).call(this.rt('rt_grenze'));
      this.sigPruefen();
      this.zu();
      this.frei_('F', t);
      if (start) { c.i32(Z).i32(pos).st32(Z_POS); }
    }
    schritt() { this.pend += 1; }
    anwStart(a) {
      this.flush();
      if (a.keinSchritt || OHNE_SCHRITT.has(a.k)) return;
      this.pend = 1; this.pendStart = true; this.pendPos = a.p;
      if (this.exakt) { this.flush(); this.tiefenPruefung(a.tf); }
    }
    knoten(e) {
      this.schritt();
      if (this.exakt && e.zus) { this.flush(); this.tiefenPruefung(e.tf); }
    }
    tiefenPruefung(tf) {
      const c = this.c;
      c.get(this.gT).i32(tf).op(OP.i32_lt_s);
      this.auf('if');
      c.call(this.rt('rt_stapel'));
      this.br(this.handler[this.handler.length - 1]);
      this.zu();
    }
    /** Laufzeitaufruf mit Effekt: Schritte buchen, Tiefe setzen, aufrufen, Signal prüfen */
    effekt(name, tf) {
      this.flush();
      this.setzeTiefe(tf !== undefined ? tf : (this.stmtTf || 0));
      this.c.call(this.rt(name));
      this.sigPruefen();
    }

    // ---------------- Erzeugung
    erzeuge() {
      const c = this.c, fn = this.fn, Z = this.Z;
      // Lokale für Slots
      const paramIdx = new Map(fn.params.map((p, i) => [p.slot, 3 + i]));
      this.slotLok = fn.slots.map((s, i) => paramIdx.has(i) && !s.zelle ? paramIdx.get(i) : this.neuLokal(s.zelle ? 'W' : s.darst === 'zahl' ? 'F' : s.darst === 'bool' ? 'B' : 'W'));
      this.unbelegtLok = fn.slots.map(s => s.unbelegt ? this.neuLokal('B') : -1);
      this.altTiefe = this.neuLokal('B');
      this.t0 = this.neuLokal('B');
      this.gT = this.neuLokal('B');
      this.altPos = this.neuLokal('B');
      this.retFlag = this.neuLokal('B');
      // Wahl schnell/exakt
      if (!this.exakt) {
        c.i32(Z).ld32(Z_TIEFE).i32((fn.plus1 ? 1 : 0) + this.f.maxTf).op(OP.i32_add).i32(MAX_STAPEL).op(OP.i32_gt_s);
        c.if_(T.leer);
        for (let i = 0; i < this.nParams; i++) c.get(i);
        c.call(this.f.exakt).op(OP.return);
        c.end();
      }
      // Prolog
      c.i32(Z).ld32(Z_TIEFE).tee(this.altTiefe);
      if (fn.plus1) c.i32(1).op(OP.i32_add);
      c.tee(this.t0);
      c.i32(MAX_STAPEL).op(OP.i32_gt_s);
      c.if_(T.leer).call(this.rt('rt_stapel')).i64(KARTON).op(OP.return).end();
      c.i32(MAX_STAPEL).get(this.t0).op(OP.i32_sub).set(this.gT);
      c.i32(Z).ld32(Z_POS).set(this.altPos);
      c.i32(0).set(this.retFlag);
      // Parameter laden
      fn.params.forEach((p, i) => {
        const s = fn.slots[p.slot];
        if (s.zelle) { c.get(3 + i).call(this.rt('rt_zelle')).set(this.slotLok[p.slot]); }
      });
      for (let i = 0; i < fn.slots.length; i++) {
        const s = fn.slots[i];
        if (s.unbelegt) { c.i32(0).set(this.unbelegtLok[i]); }
        if (fn.params.some(p => p.slot === i)) continue;
        // Standardwert für nicht-Parameter-Slots
        if (s.zelle) { c.i64(UNDEF).call(this.rt('rt_zelle')).set(this.slotLok[i]); }
        else if (s.darst === 'zahl') c.f64(0).set(this.slotLok[i]);
        else if (s.darst === 'bool') c.i32(0).set(this.slotLok[i]);
        else c.i64(UNDEF).set(this.slotLok[i]);
      }
      // Rumpf
      const exit = this.auf('block');
      this.handler.push(exit);
      this.ctrl.push({ art: 'fn', label: exit });
      this.ergLok = this.neuLokal('W');
      c.i64(KARTON).set(this.ergLok);
      if (fn.ausdr) {
        this.stmtTf = 0;
        const t = this.ausdr(fn.ausdr);
        this.konv(t, 'W');
        this.flush();
        c.set(this.ergLok);
      } else if (fn.body && fn.art === 'oben') {
        for (const a of fn.body) {
          const stmtEnde = this.auf('block');
          this.ctrl.push({ art: 'oben', ende: exit, stmtEnde });
          this.anw(a);
          this.flush();
          this.ctrl.pop();
          this.zu();
        }
      } else if (fn.body) {
        for (const a of fn.body) this.anw(a);
        this.flush();
      }
      this.ctrl.pop();
      this.handler.pop();
      this.zu();
      // Epilog (Top-Level, Initialisierer: wie im Interpreter keine Wiederherstellung der Position)
      if (fn.plus1) c.i32(Z).get(this.altPos).st32(Z_POS);
      c.i32(Z).get(this.altTiefe).st32(Z_TIEFE);
      if (fn.art === 'oben') {
        // Wert der globalen Variable „hauptgang“ zurückgeben
        if (fn.hauptgangGlobal !== null && fn.hauptgangGlobal !== undefined) c.i32(this.be.globAdr + fn.hauptgangGlobal * 8).ld64(0);
        else c.i64(UNDEF);
      } else if (fn.art === 'ktor') {
        c.get(this.retFlag);
        c.if_(T.leer).i32(Z).i64(KARTON).st64(Z_RUECK).end();
        c.i64(KARTON);
      } else if (fn.ausdr) {
        c.get(this.ergLok);
      } else {
        // retFlag → Rückgabewert aus rueck, rueck = karton
        c.get(this.retFlag);
        c.if_(T.i64).i32(Z).ld64(Z_RUECK).i32(Z).i64(KARTON).st64(Z_RUECK).else_().i64(KARTON).end();
      }
      c.end();
      return c.bytes();
    }

    // ---------------- Slots
    /** Wert (Typ t) vom Stapel in einen Slot schreiben – neue Variable (Zelle neu) */
    speichereSlotNeu(slot, t) {
      const s = this.fn.slots[slot];
      if (s.zelle) {
        this.konv(t, 'W');
        this.c.call(this.rt('rt_zelle')).set(this.slotLok[slot]);
        return;
      }
      this.konvSlot(t, s);
      this.c.set(this.slotLok[slot]);
    }
    konvSlot(t, s) {
      if (s.darst === 'zahl') this.konv(t, 'F');
      else if (s.darst === 'bool') this.konv(t, 'B');
      else this.konv(t, 'W');
    }
    /** schreibt in bestehende Variable */
    speichereSlot(slot, t) {
      const s = this.fn.slots[slot];
      if (s.zelle) {
        this.konv(t, 'W');
        const tmp = this.temp('W');
        this.c.set(tmp).get(this.slotLok[slot]).op(OP.i32_wrap_i64).get(tmp).st64(8);
        this.frei_('W', tmp);
        return;
      }
      this.konvSlot(t, s);
      this.c.set(this.slotLok[slot]);
    }
    leseSlot(slot) {
      const s = this.fn.slots[slot];
      if (s.zelle) { this.c.get(this.slotLok[slot]).op(OP.i32_wrap_i64).ld64(8); return 'W'; }
      this.c.get(this.slotLok[slot]);
      return s.darst === 'zahl' ? 'F' : s.darst === 'bool' ? 'B' : 'W';
    }
    slotTyp(slot) { const s = this.fn.slots[slot]; return s.zelle ? 'W' : s.darst === 'zahl' ? 'F' : s.darst === 'bool' ? 'B' : 'W'; }
    leseUmg(idx) { this.c.get(0).ld64(32 + idx * 8).op(OP.i32_wrap_i64).ld64(8); return 'W'; }
    schreibeUmg(idx, t) {
      this.konv(t, 'W');
      const tmp = this.temp('W');
      this.c.set(tmp).get(0).ld64(32 + idx * 8).op(OP.i32_wrap_i64).get(tmp).st64(8);
      this.frei_('W', tmp);
    }
    globAdr(g) { return this.be.globAdr + g * 8; }

    // ---------------- Typkonvertierung (Stapel)
    konv(von, nach) {
      const c = this.c;
      if (von === nach) return;
      if (von === 'F' && nach === 'W') {
        const t = this.temp('F');
        c.tee(t).op(OP.i64_reinterpret_f64).i64(NAN).get(t).get(t).op(OP.f64_eq).op(OP.select);
        this.frei_('F', t);
        return;
      }
      if (von === 'B' && nach === 'W') { c.op(OP.i64_extend_i32_u).i64(NEIN).op(OP.i64_or); return; }
      if (von === 'W' && nach === 'F') { c.op(OP.f64_reinterpret_i64); return; }  // nur bei bewiesener Zahl
      if (von === 'W' && nach === 'B') { this.wNachBool(); return; }
      if (von === 'F' && nach === 'B') { // Zahl als Bedingung → TypAnanas
        this.konv('F', 'W'); this.wNachBool(); return;
      }
      if (von === 'B' && nach === 'F') { this.konv('B', 'W'); c.op(OP.f64_reinterpret_i64); return; }
      throw new Error('konv ' + von + '→' + nach);
    }
    /** W → i32 (ja/nein), sonst TypAnanas */
    wNachBool() {
      const c = this.c;
      const w = this.temp('W');
      c.tee(w).i64(NEIN).op(OP.i64_xor);
      const x = this.temp('W');
      c.tee(x).i64(1).op(OP.i64_gt_u);
      this.auf('if');
      this.flushKopie();
      this.setzeTiefe(this.stmtTf || 0);
      c.get(w).call(this.rt('rt_bool_fehler'));
      this.br(this.handler[this.handler.length - 1]);
      this.zu();
      c.get(x).op(OP.i32_wrap_i64);
      this.frei_('W', w); this.frei_('W', x);
    }
    /** Schritte buchen, ohne den statischen Zustand zu ändern (für Fehlerpfade) */
    flushKopie() {
      if (this.pend === 0) return;
      const p = this.pend, s = this.pendStart, q = this.pendPos;
      this.pend = 0; this.pendStart = false;
      this.emitFlush(p, s, q);
      this.pend = p; this.pendStart = s; this.pendPos = q;
    }

    // ---------------- statische Typen
    typVon(e) {
      switch (e.k) {
        case 'konst': return e.art === 'zahl' ? 'F' : e.art === 'bool' ? 'B' : 'W';
        case 'lies': return e.ref.art === 'lokal' && !this.fn.slots[e.ref.slot].weg ? this.slotTyp(e.ref.slot) : 'W';
        case 'bin': {
          const a = this.typVon(e.l), b = this.typVon(e.r);
          if (a === 'F' && b === 'F') return e.op >= OPS.GL ? 'B' : 'F';
          if (e.op >= OPS.GL && e.op <= OPS.GRG) return a === 'B' && b === 'B' && (e.op === OPS.GL || e.op === OPS.UNGL) ? 'B' : 'W';
          return 'W';
        }
        case 'un': { const a = this.typVon(e.e); if (e.op === 1 && a === 'F') return 'F'; if (e.op === 0 && a === 'B') return 'B'; return 'W'; }
        case 'log': return 'B';
        case 'tern': { const a = this.typVon(e.a), b = this.typVon(e.b); return a === b ? a : 'W'; }
        default: return 'W';
      }
    }

    // ---------------- Argumente
    /** wertet Argumente aus, legt sie auf den Argumentstapel; hinterlässt (ptr, npos, bennamen, nben) auf dem Stapel */
    argumente(args) {
      const c = this.c;
      const alle = args.pos.concat(args.ben ? args.ben.map(b => b.e) : []);
      const tmps = alle.map(e => { const t = this.ausdr(e); this.konv(t, 'W'); const l = this.temp('W'); c.set(l); return l; });
      const p = this.temp('B');
      c.i32(alle.length).call(this.rt('rt_args')).set(p);
      tmps.forEach((l, i) => { c.get(p).get(l).st64(i * 8); this.frei_('W', l); });
      c.get(p);
      this.frei_('B', p);
      c.i32(args.pos.length);
      if (args.ben) c.i32(this.be.u32Array(args.ben.map(b => this.be.text(b.name)))).i32(args.ben.length);
      else c.i32(0).i32(0);
    }
    ctxk() { return this.fn.klasse === null || this.fn.klasse === undefined ? -1 : this.fn.klasse; }
    dies() { this.c.get(1); }

    // ---------------- Ausdrücke
    ausdr(e) {
      this.knoten(e);
      return this.ausdrIntern(e);
    }
    ausdrIntern(e) {
      const c = this.c;
      switch (e.k) {
        case 'konst':
          switch (e.art) {
            case 'zahl': c.f64(e.wert); return 'F';
            case 'bool': c.i32(e.wert ? 1 : 0); return 'B';
            case 'karton': c.i64(KARTON); return 'W';
            case 'text': c.i64(this.be.textW(e.wert)); return 'W';
            case 'dauer': c.f64(e.wert); this.flush(); c.call(this.rt('rt_dauer')); return 'W';
          }
          break;
        case 'lies': return this.lies(e.ref, e.name);
        case 'bin': return this.bin(e);
        case 'log': {
          // Kurzschluss: Ergebnis i32
          const l = this.ausdr(e.l);
          this.konv(l, 'B');
          this.flush();
          const erg = this.temp('B');
          c.set(erg);
          c.get(erg);
          if (e.und) { this.auf('if'); } else { c.op(OP.i32_eqz); this.auf('if'); }
          const r = this.ausdr(e.r);
          this.konv(r, 'B');
          this.flush();
          c.set(erg);
          this.zu();
          c.get(erg);
          this.frei_('B', erg);
          return 'B';
        }
        case 'un': {
          const t = this.ausdr(e.e);
          if (e.op === 1 && t === 'F') { c.op(OP.f64_neg); return 'F'; }
          if (e.op === 0 && t === 'B') { c.op(OP.i32_eqz); return 'B'; }
          this.konv(t, 'W');
          c.i32(e.op);
          // Signatur rt_un(op, v): Reihenfolge tauschen
          const v = this.temp('W'); const o = this.temp('B');
          c.set(o).set(v).get(o).get(v);
          this.frei_('W', v); this.frei_('B', o);
          this.effekt('rt_un', e.tf);
          return 'W';
        }
        case 'tern': {
          const ct = this.ausdr(e.c);
          this.konv(ct, 'B');
          this.flush();
          const ta = this.typVon(e.a), tb = this.typVon(e.b);
          const rt = ta === tb ? ta : 'W';
          this.auf('if', TY[rt]);
          { const a = this.ausdr(e.a); this.konv(a, rt); this.flush(); }
          this.sonst();
          { const b = this.ausdr(e.b); this.konv(b, rt); this.flush(); }
          this.zu();
          return rt;
        }
        case 'mcall': {
          const o = this.ausdr(e.obj); this.konv(o, 'W');
          const ot = this.temp('W'); c.set(ot);
          // rt_mcall(o, name, args, npos, bennamen, nben, knoten, ctxk, ctxd)
          const a = this.argTemps(e.args);
          c.get(ot); this.frei_('W', ot);
          c.i32(this.be.text(e.name));
          this.argPush(a);
          c.i32(e.p).i32(this.ctxk()); this.dies();
          this.effekt('rt_mcall', e.tf);
          return 'W';
        }
        case 'untenM': {
          const a = this.argTemps(e.args);
          c.i32(this.be.text(e.name));
          this.argPush(a);
          c.i32(e.p); this.dies(); c.get(2); c.i32(this.ctxk());
          this.effekt('rt_unten_m', e.tf);
          return 'W';
        }
        case 'ncall': return this.ncall(e);
        case 'call': {
          const f = this.ausdr(e.callee); this.konv(f, 'W');
          const ft = this.temp('W'); c.set(ft);
          const a = this.argTemps(e.args);
          c.get(ft); this.frei_('W', ft);
          this.argPush(a);
          c.i32(e.p);
          this.effekt('rt_rufe', e.tf);
          return 'W';
        }
        case 'mem': {
          const o = this.ausdr(e.obj); this.konv(o, 'W');
          c.i32(this.be.text(e.name)).i32(this.ctxk());
          this.effekt('rt_mem', e.tf);
          return 'W';
        }
        case 'dies': {
          this.dies();
          const w = this.temp('W');
          c.tee(w).i64(KARTON).op(OP.i64_eq);
          this.auf('if');
          this.flushKopie();
          c.call(this.rt('rt_dies_fehler'));
          this.br(this.handler[this.handler.length - 1]);
          this.zu();
          c.get(w);
          this.frei_('W', w);
          return 'W';
        }
        case 'unten': { this.dies(); c.get(2); this.effekt('rt_unten'); return 'W'; }
        case 'untenCall': {
          const a = this.argTemps(e.args);
          this.argPush(a);
          this.dies(); c.i32(this.ctxk()).i32(this.fn.ktor ? 1 : 0);
          this.effekt('rt_unten_call', e.tf);
          return 'W';
        }
        case 'neu': {
          if (e.typ === 'Hawaii') { this.flush(); c.call(this.rt('rt_panik')); this.br(this.handler[this.handler.length - 1]); c.i64(KARTON); return 'W'; }
          const a = this.argTemps(e.args);
          c.i32(this.be.text(e.typ));
          this.argPush(a);
          c.i32(e.p);
          this.effekt('rt_neu', e.tf);
          return 'W';
        }
        case 'blech': {
          const a = this.argTemps({ pos: e.elemente, ben: null });
          const p = this.temp('B');
          c.i32(a.length).call(this.rt('rt_args')).set(p);
          a.forEach((l, i) => { c.get(p).get(l).st64(i * 8); this.frei_('W', l); });
          c.get(p).i32(a.length);
          this.frei_('B', p);
          this.effekt('rt_blech_aus');
          return 'W';
        }
        case 'bereich': {
          const a = this.ausdr(e.a); this.konv(a, 'W');
          const at = this.temp('W'); c.set(at);
          const b = this.ausdr(e.b); this.konv(b, 'W');
          const bt = this.temp('W'); c.set(bt);
          c.get(at).get(bt);
          this.frei_('W', at); this.frei_('W', bt);
          this.effekt('rt_bereich');
          return 'W';
        }
        case 'lambda': return this.lambda(e);
        case 'schieb': return this.schieb(e);
        case 'ofen': return this.ofen(e);
        case 'waehleA': return this.waehleA(e);
      }
      throw new NichtUnterstuetzt('Ausdruck ' + e.k, e.p);
    }

    argTemps(args) {
      const alle = args.pos.concat(args.ben ? args.ben.map(b => b.e) : []);
      const r = alle.map(e => { const t = this.ausdr(e); this.konv(t, 'W'); const l = this.temp('W'); this.c.set(l); return l; });
      r.anzPos = args.pos.length;
      r.ben = args.ben;
      return r;
    }
    /** legt (args_ptr, npos, bennamen, nben) auf den Stapel */
    argPush(a) {
      const c = this.c;
      const p = this.temp('B');
      c.i32(a.length).call(this.rt('rt_args')).set(p);
      a.forEach((l, i) => { c.get(p).get(l).st64(i * 8); this.frei_('W', l); });
      c.get(p).i32(a.anzPos);
      if (a.ben) c.i32(this.be.u32Array(a.ben.map(b => this.be.text(b.name)))).i32(a.ben.length);
      else c.i32(0).i32(0);
      this.frei_('B', p);
    }

    // ---------------- Namen lesen
    lies(ref, name) {
      const c = this.c;
      switch (ref.art) {
        case 'lokal': {
          const t = this.leseSlot(ref.slot);
          if (this.fn.slots[ref.slot].weg) this.wegPruefen(name);
          return t;
        }
        case 'umg': {
          this.leseUmg(ref.idx);
          if (this.be.ir && this.istWegName(name)) this.wegPruefen(name);
          return 'W';
        }
        case 'global': {
          c.i32(this.globAdr(ref.g)).ld64(0);
          if (!ref.sicher) {
            const w = this.temp('W');
            c.tee(w).i64(UNDEF).op(OP.i64_eq);
            this.auf('if', T.i64);
            c.i32(this.be.text(name)); this.effekt('rt_global_name');
            this.sonst();
            c.get(w);
            this.zu();
            this.frei_('W', w);
          }
          if (this.istWegName(name)) this.wegPruefen(name);
          return 'W';
        }
        case 'gname': c.i32(this.be.text(name)); this.effekt('rt_global_name'); return 'W';
        case 'dyn': {
          c.i32(this.be.text(name)); this.dies(); c.i32(this.ctxk());
          this.effekt('rt_feld_ctx');
          const w = this.temp('W');
          c.tee(w).i64(UNDEF).op(OP.i64_eq);
          this.auf('if', T.i64);
          if (ref.g !== null) this.lies({ art: 'global', g: ref.g, sicher: false }, name);
          else { c.i32(this.be.text(name)); this.effekt('rt_global_name'); }
          this.sonst();
          c.get(w);
          this.zu();
          this.frei_('W', w);
          return 'W';
        }
      }
      throw new NichtUnterstuetzt('Name ' + ref.art);
    }
    istWegName(name) { return this.be.schiebNamen ? this.be.schiebNamen.has(name) : false; }
    /** W oben auf dem Stapel: WEG → Ananas */
    wegPruefen(name) {
      const c = this.c;
      const w = this.temp('W');
      c.tee(w).i64(WEG).op(OP.i64_eq);
      this.auf('if');
      this.flushKopie();
      c.i32(this.be.text(name)).call(this.rt('rt_weg'));
      this.br(this.handler[this.handler.length - 1]);
      this.zu();
      c.get(w);
      this.frei_('W', w);
    }

    // ---------------- Operatoren
    bin(e) {
      const c = this.c;
      const ta = this.typVon(e.l), tb = this.typVon(e.r);
      if (ta === 'F' && tb === 'F') {
        this.ausdr(e.l); this.ausdr(e.r);
        switch (e.op) {
          case OPS.PLUS: c.op(OP.f64_add); return 'F';
          case OPS.MINUS: c.op(OP.f64_sub); return 'F';
          case OPS.MAL: c.op(OP.f64_mul); return 'F';
          case OPS.DURCH: case OPS.REST: {
            const b = this.temp('F'), a = this.temp('F');
            c.set(b).set(a);
            c.get(b).f64(0).op(OP.f64_eq);
            this.auf('if');
            this.flushKopie();
            c.i32(e.op).get(a); this.konv('F', 'W'); c.get(b); this.konv('F', 'W'); c.i32(e.p);
            this.setzeTiefe(e.tf);
            c.call(this.rt('rt_bin')).op(OP.drop);
            this.br(this.handler[this.handler.length - 1]);
            this.zu();
            if (e.op === OPS.DURCH) { c.get(a).get(b).op(OP.f64_div); }
            else { c.get(a).get(b); this.f64Rest(); }
            this.frei_('F', a); this.frei_('F', b);
            return 'F';
          }
          case OPS.GL: c.op(OP.f64_eq); return 'B';
          case OPS.UNGL: c.op(OP.f64_ne); return 'B';
          case OPS.KL: c.op(OP.f64_lt); return 'B';
          case OPS.KLG: c.op(OP.f64_le); return 'B';
          case OPS.GR: c.op(OP.f64_gt); return 'B';
          case OPS.GRG: c.op(OP.f64_ge); return 'B';
        }
      }
      if (ta === 'B' && tb === 'B' && (e.op === OPS.GL || e.op === OPS.UNGL)) {
        this.ausdr(e.l); this.ausdr(e.r);
        c.op(e.op === OPS.GL ? OP.i32_eq : OP.i32_ne);
        return 'B';
      }
      // generisch: beide als W; schneller Pfad für Zahlen
      const a = this.ausdr(e.l); this.konv(a, 'W');
      const at = this.temp('W'); c.set(at);
      const b = this.ausdr(e.r); this.konv(b, 'W');
      const bt = this.temp('W'); c.set(bt);
      const istArith = e.op <= OPS.MAL;
      const istVgl = e.op >= OPS.GL;
      if (istArith || istVgl) {
        c.get(at).i64(MARKE).op(OP.i64_lt_u).get(bt).i64(MARKE).op(OP.i64_lt_u).op(OP.i32_and);
        this.auf('if', T.i64);
        c.get(at).op(OP.f64_reinterpret_i64).get(bt).op(OP.f64_reinterpret_i64);
        switch (e.op) {
          case OPS.PLUS: c.op(OP.f64_add); this.konv('F', 'W'); break;
          case OPS.MINUS: c.op(OP.f64_sub); this.konv('F', 'W'); break;
          case OPS.MAL: c.op(OP.f64_mul); this.konv('F', 'W'); break;
          case OPS.GL: c.op(OP.f64_eq); this.konv('B', 'W'); break;
          case OPS.UNGL: c.op(OP.f64_ne); this.konv('B', 'W'); break;
          case OPS.KL: c.op(OP.f64_lt); this.konv('B', 'W'); break;
          case OPS.KLG: c.op(OP.f64_le); this.konv('B', 'W'); break;
          case OPS.GR: c.op(OP.f64_gt); this.konv('B', 'W'); break;
          case OPS.GRG: c.op(OP.f64_ge); this.konv('B', 'W'); break;
        }
        this.sonst();
        c.i32(e.op).get(at).get(bt).i32(e.p);
        this.effekt('rt_bin', e.tf);
        this.zu();
      } else {
        c.i32(e.op).get(at).get(bt).i32(e.p);
        this.effekt('rt_bin', e.tf);
      }
      this.frei_('W', at); this.frei_('W', bt);
      if (istVgl) { // Ergebnis ist ja/nein
        c.i64(NEIN).op(OP.i64_xor).op(OP.i32_wrap_i64);
        return 'B';
      }
      return 'W';
    }
    /** JS-% auf f64 (a, b auf dem Stapel, b ≠ 0): fmod */
    f64Rest() {
      // a - trunc(a/b)*b ist für große Werte ungenau → exakte fmod über Laufzeit? Hier: Schnellweg für |a|,|b| < 2^53 ganzzahlig
      const c = this.c;
      const b = this.temp('F'), a = this.temp('F');
      c.set(b).set(a);
      // falls beide ganzzahlig und |a| < 2^53: exakt über a - trunc(a/b)*b
      c.get(a).get(a).op(OP.f64_trunc).op(OP.f64_eq)
        .get(b).get(b).op(OP.f64_trunc).op(OP.f64_eq).op(OP.i32_and)
        .get(a).op(OP.f64_abs).f64(9007199254740992).op(OP.f64_lt).op(OP.i32_and)
        .get(b).op(OP.f64_abs).f64(9007199254740992).op(OP.f64_lt).op(OP.i32_and);
      c.if_(T.f64);
      c.get(a).get(a).get(b).op(OP.f64_div).op(OP.f64_trunc).get(b).op(OP.f64_mul).op(OP.f64_sub)
        .get(a).op(OP.f64_copysign);
      c.else_();
      c.i32(OPS.REST).get(a); this.konv('F', 'W'); c.get(b); this.konv('F', 'W'); c.i32(0).call(this.rt('rt_bin')).op(OP.f64_reinterpret_i64);
      c.end();
      this.frei_('F', a); this.frei_('F', b);
    }

    // ---------------- Aufrufe
    ncall(e) {
      const c = this.c;
      const z = e.ziel;
      if (e.direkt !== undefined && e.direkt !== null) return this.direktAufruf(e);
      if (z.art === 'schiebFehler') { this.effekt('rt_schieb_fehler'); c.i64(KARTON); return 'W'; }
      const ft = this.temp('W');
      if (z.art === 'wert') {
        const t = this.lies(z.ref, e.name); this.konv(t, 'W'); c.set(ft);
      } else if (z.art === 'kontext') {
        c.i32(this.be.text(e.name)); this.dies(); c.i32(this.ctxk());
        c.call(this.rt('rt_ncall_ziel'));
        c.tee(ft).i64(UNDEF).op(OP.i64_eq);
        this.auf('if');
        { const t = this.lies(z.ref, e.name); this.konv(t, 'W'); c.set(ft); }
        this.zu();
      } else {
        const t = this.lies(z.ref, e.name); this.konv(t, 'W'); c.set(ft);
      }
      const a = this.argTemps(e.args);
      c.get(ft); this.frei_('W', ft);
      this.argPush(a);
      c.i32(e.p); this.dies(); c.i32(this.ctxk());
      this.effekt('rt_rufe_ziel', e.tf);
      return 'W';
    }

    /** statisch aufgelöster Aufruf einer Top-Level-Funktion (ohne Laufzeit-Dispatch) */
    direktAufruf(e) {
      const c = this.c;
      const ziel = this.be.fns[e.direkt];
      const zfn = ziel.fn;
      const werte = e.args.pos.map((a) => {
        const t = this.ausdr(a);
        const l = this.temp(t); c.set(l);
        return { l, t };
      });
      // Bindung: Typprüfung je Parameter (wie bindeParameter), dann Umwandlung
      zfn.params.forEach((p, i) => {
        const w = werte[i];
        c.get(w.l);
        let t = w.t;
        if (p.typ) t = this.typPruefen(t, p.typ, p.name);
        const zt = zielTyp(ziel.ptypen[i]);
        this.konv(t, zt);
        const l2 = this.temp(zt); c.set(l2);
        this.frei_(w.t, w.l);
        w.l = l2; w.t = zt;
      });
      this.flush();
      this.setzeTiefe(e.tf);
      c.i32(0).i64(KARTON).i64(KARTON);
      for (const w of werte) { c.get(w.l); this.frei_(w.t, w.l); }
      c.call(ziel.schnell);
      this.sigPruefen();
      return 'W';
    }

    lambda(e) {
      const c = this.c;
      const lf = this.be.ir.funktionen[e.fn];
      this.flush();
      c.i32(e.fn); this.dies(); c.get(2); c.i32(lf.fang.length);
      c.call(this.rt('rt_lambda'));
      const w = this.temp('W');
      c.set(w);
      lf.fang.forEach((q, i) => {
        c.get(w).op(OP.i32_wrap_i64);
        if (q.art === 'lokal') c.get(this.slotLok[q.slot]);
        else c.get(0).ld64(32 + q.idx * 8);
        c.st64(32 + i * 8);
      });
      c.get(w);
      this.frei_('W', w);
      return 'W';
    }

    schieb(e) {
      const c = this.c;
      const r = e.ref;
      const name = e.name;
      const nd = () => { c.i32(this.be.text(name)); this.effekt('rt_nicht_definiert'); };
      if (r.art === 'lokal' || r.art === 'umg' || r.art === 'global') {
        const lese = () => { if (r.art === 'lokal') this.leseSlot(r.slot); else if (r.art === 'umg') this.leseUmg(r.idx); else c.i32(this.globAdr(r.g)).ld64(0); };
        const w = this.temp('W');
        lese(); c.set(w);
        if (r.art === 'global') {
          c.get(w).i64(UNDEF).op(OP.i64_eq);
          this.auf('if'); nd(); this.zu();
        }
        c.get(w); this.wegPruefen(name); c.op(OP.drop);
        if (r.art === 'global') this.kuechenWache({ global: true }, name);
        else if (r.art === 'umg') this.kuechenWache({ umg: true, umgIdx: r.idx }, name);
        // WEG schreiben
        if (r.art === 'lokal') { c.i64(WEG); this.speichereSlot(r.slot, 'W'); }
        else if (r.art === 'umg') { c.i64(WEG); this.schreibeUmg(r.idx, 'W'); }
        else { c.i32(this.globAdr(r.g)).i64(WEG).st64(0); }
        c.get(w);
        this.frei_('W', w);
        return 'W';
      }
      if (r.art === 'dyn') {
        c.i32(this.be.text(name)); this.dies(); c.i32(this.ctxk());
        this.effekt('rt_schieb_feld');
        const w = this.temp('W');
        c.tee(w).i64(UNDEF).op(OP.i64_eq);
        this.auf('if', T.i64);
        if (r.g !== null) { const t = this.schieb({ ref: { art: 'global', g: r.g }, name }); void t; }
        else { nd(); c.i64(KARTON); }
        this.sonst();
        c.get(w);
        this.zu();
        this.frei_('W', w);
        return 'W';
      }
      nd(); c.i64(KARTON);
      return 'W';
    }

    // ---------------- Kontrollfluss-Hilfen
    /** verlässt per RET/BRK/CNT; art: 'ret'|'brk'|'cnt' */
    verlasse(art) {
      const c = this.c;
      this.flush();
      for (let i = this.ctrl.length - 1; i >= 0; i--) {
        const k = this.ctrl[i];
        if (k.art === 'rand') {
          // erst rand ausführen
          const code = k.codes.length + 1;
          k.codes.push({ art, code, von: i });
          c.i32(code).set(k.pend);
          this.br(k.eintritt);
          return;
        }
        if (k.art === 'randverwerfen') { c.get(k.h).call(this.rt('rt_sig_verwerfen')); continue; }
        if (k.art === 'fn') {
          if (art === 'ret' || this.fn.art === 'ktor') c.i32(1).set(this.retFlag);
          this.br(k.label); return;
        }
        if (k.art === 'blockwert') { this.br(art === 'ret' ? k.ret : k.ende); return; }
        if (k.art === 'oben') { this.br(art === 'ret' ? k.ende : k.stmtEnde); return; }
        if (k.art === 'loop' && (art === 'brk' || art === 'cnt')) { this.br(art === 'brk' ? k.brk : k.cnt); return; }
        if (k.art === 'waehle' && art === 'brk') { this.br(k.ende); return; }
      }
      throw new Error('verlasse ohne Ziel');
    }
    /** setzt nach einem rand die ausstehende Kontrolle fort (Position = ctrl-Index des rand) */
    weiterNachRand(k, idx) {
      const c = this.c;
      const gespeichert = this.ctrl;
      for (const cd of k.codes) {
        c.get(k.pend).i32(cd.code).op(OP.i32_eq);
        this.auf('if');
        this.ctrl = gespeichert.slice(0, idx);
        this.verlasse(cd.art);
        this.ctrl = gespeichert;
        this.zu();
      }
    }

    // ---------------- Anweisungen
    anw(a) {
      if (a.k === 'leer' && a.keinSchritt) return;
      const altTf = this.stmtTf;
      this.stmtTf = a.tf || 0;
      this.anwStart(a);
      const c = this.c;
      switch (a.k) {
        case 'leer': break;
        case 'ausdr': { const t = this.ausdr(a.e); this.flush(); c.op(OP.drop); void t; break; }
        case 'var': for (const d of a.decls) this.varDekl(d, a); break;
        case 'zuw': this.zuw(a); break;
        case 'inc': this.inc(a); break;
        case 'block': for (const s of a.body) this.anw(s); break;
        case 'falls': {
          const t = this.ausdr(a.c); this.konv(t, 'B'); this.flush();
          this.auf('if');
          for (const s of a.dann) this.anw(s);
          this.flush();
          if (a.sonst || a.sonstFalls) {
            this.sonst();
            if (a.sonst) for (const s of a.sonst) this.anw(s);
            else this.anw(a.sonstFalls);
            this.flush();
          }
          this.zu();
          break;
        }
        case 'solange': {
          this.flush();
          const brk = this.auf('block');
          const cnt = this.auf('loop');
          const t = this.ausdr(a.c); this.konv(t, 'B'); this.flush();
          c.op(OP.i32_eqz); this.brIf(brk);
          this.ctrl.push({ art: 'loop', brk, cnt });
          for (const s of a.body) this.anw(s);
          this.flush();
          this.ctrl.pop();
          this.br(cnt);
          this.zu(); this.zu();
          break;
        }
        case 'fuer': {
          if (a.init) this.anw(a.init);
          this.flush();
          const brk = this.auf('block');
          const top = this.auf('loop');
          if (a.c) { const t = this.ausdr(a.c); this.konv(t, 'B'); this.flush(); c.op(OP.i32_eqz); this.brIf(brk); }
          const cnt = this.auf('block');
          this.ctrl.push({ art: 'loop', brk, cnt });
          for (const s of a.body) this.anw(s);
          this.flush();
          this.ctrl.pop();
          this.zu();
          for (const u of a.upd) this.anw(u);
          this.flush();
          this.br(top);
          this.zu(); this.zu();
          break;
        }
        case 'fuerJedes': this.fuerJedes(a); break;
        case 'waehle': this.waehle(a); break;
        case 'serviere': {
          if (a.e) { const t = this.ausdr(a.e); this.konv(t, 'W'); }
          else c.i64(KARTON);
          this.flush();
          const w = this.temp('W');
          c.set(w).i32(this.Z).get(w).st64(Z_RUECK);
          this.frei_('W', w);
          this.verlasse('ret');
          break;
        }
        case 'wirf': {
          const t = this.ausdr(a.e); this.konv(t, 'W');
          c.i32(a.p);
          this.effekt('rt_wirf', a.tf);
          this.br(this.handler[this.handler.length - 1]);
          break;
        }
        case 'probier': this.probier(a); break;
        case 'abbrechen': this.verlasse('brk'); break;
        case 'weiter': this.verlasse('cnt'); break;
        case 'feldinit': case 'statinit': this.feldInitAnw(a); break;
        case 'annoHaltbar': case 'annoVeraltet': this.anno(a); break;
        case 'rufeInit': {
          this.flush();
          // statische Initialisierer einer Klasse: direkt die Funktion aufrufen
          const f = this.be.fns[a.fn];
          c.i32(0).i64(KARTON).i64(KARTON).call(f.schnell).op(OP.drop);
          this.sigPruefen();
          break;
        }
        default: throw new NichtUnterstuetzt('Anweisung ' + a.k, a.p);
      }
      this.flush();
      this.stmtTf = altTf;
    }

    // Typprüfung + Speichern eines Werts (Typ t auf dem Stapel) in Ziel mit deklariertem Typ
    typPruefen(t, typ, name) {
      const c = this.c;
      if (!typ) return t;
      if (typ === 'funghi' && t === 'F') return t;
      if (typ === 'diavolo' && t === 'B') return t;
      if (typ === 'salami' && t === 'F') {
        const x = this.temp('F');
        c.tee(x).get(x).op(OP.f64_trunc).op(OP.f64_eq).get(x).op(OP.f64_abs).f64(Infinity).op(OP.f64_lt).op(OP.i32_and).op(OP.i32_eqz);
        this.auf('if');
        this.flushKopie();
        c.i32(this.be.text(typ)).get(x); this.konv('F', 'W'); c.i32(this.be.text(name));
        this.setzeTiefe(this.stmtTf || 0);
        c.call(this.rt('rt_typ_pruefen')).op(OP.drop);
        this.br(this.handler[this.handler.length - 1]);
        this.zu();
        c.get(x);
        this.frei_('F', x);
        return 'F';
      }
      {
        // alle übrigen Typen (Dauer, hawaii, Klassen, Theke …): Laufzeitprüfung rt_typ_pruefen
        this.konv(t, 'W');
        const w = this.temp('W');
        c.set(w);
        this.flush();
        c.i32(this.be.text(typ)).get(w).i32(this.be.text(name));
        this.setzeTiefe(this.stmtTf || 0);
        c.call(this.rt('rt_typ_pruefen')).op(OP.drop);
        this.sigPruefen();
        c.get(w);
        this.frei_('W', w);
        return 'W';
      }
    }

    varDekl(d, a) {
      const c = this.c;
      let t;
      if (d.init) {
        t = this.ausdr(d.init);
        t = this.typPruefen(t, d.typ, d.name);
      } else {
        if (d.std === null) { c.i64(KARTON); t = 'W'; }
        else if (d.std === false) { c.i32(0); t = 'B'; }
        else { c.f64(d.std); t = 'F'; }
      }
      this.flush();
      if (d.ziel.art === 'global') {
        this.konv(t, 'W');
        const w = this.temp('W');
        c.set(w).i32(this.globAdr(d.ziel.g)).get(w).st64(0);
        this.frei_('W', w);
        if (d.gebacken) c.i32(this.be.globFlagAdr + d.ziel.g * 4).i32(d.init ? 0 : 1).st32(0);
        return;
      }
      const slot = d.ziel.slot;
      const s = this.fn.slots[slot];
      // eine frühere Bindung desselben Namens (Neudeklaration mit anderem Typ) darf nicht gefangen sein: Lambdas lesen im
      // Interpreter die Bindung erst beim Aufruf und sähen dann schon die neue
      let alteGefangen = false;
      for (let v = s.redeklVon; v !== undefined && !alteGefangen; v = this.fn.slots[v].redeklVon) alteGefangen = this.fn.slots[v].zelle;
      if ((s.zelle && s.redekl) || alteGefangen) throw new NichtUnterstuetzt('erneut deklarierte gefangene Variable \'' + d.name + '\'', a.p);
      this.speichereSlotNeu(slot, t);
      if (s.unbelegt) c.i32(d.init ? 0 : 1).set(this.unbelegtLok[slot]);
    }

    /** Zuweisungsziel vorbereiten. Liefert Objekt mit lese()/schreibe(t)/wegCheck() */
    zielVor(z) {
      const c = this.c;
      const self = this;
      switch (z.art) {
        case 'lokal': {
          const s = this.fn.slots[z.slot];
          return {
            typ: s.typ ? (s.typ.feld ? null : s.typ.name) : null, gebacken: s.gebacken, unbelegt: s.unbelegt ? this.unbelegtLok[z.slot] : -1,
            lese() { return self.leseSlot(z.slot); },
            weg: s.weg,
            schreibe(t) { self.speichereSlot(z.slot, t); },
            slotTyp: this.slotTyp(z.slot),
          };
        }
        case 'umg': {
          if (z.gebacken) throw new NichtUnterstuetzt('Zuweisung an gebackene Variable aus einer Lambda');
          return { typ: z.typName || null, umg: true, umgIdx: z.idx, lese() { return self.leseUmg(z.idx); }, weg: this.istWegName(z.name), schreibe(t) { self.schreibeUmg(z.idx, t); }, slotTyp: 'W', umgTyp: true };
        }
        case 'global': {
          const adr = this.globAdr(z.g);
          if (!z.sicher) {
            c.i32(adr).ld64(0).i64(UNDEF).op(OP.i64_eq);
            this.auf('if');
            c.i32(this.be.text(z.name)); this.effekt('rt_nicht_definiert');
            this.zu();
          }
          const gi = this.be.globalInfo(z.name);
          return {
            typ: gi.typ, gebacken: gi.gebacken, global: true, flagAdr: this.be.globFlagAdr + z.g * 4,
            lese() { c.i32(adr).ld64(0); return 'W'; }, weg: this.istWegName(z.name),
            schreibe(t) { self.konv(t, 'W'); const w = self.temp('W'); c.set(w).i32(adr).get(w).st64(0); self.frei_('W', w); },
            slotTyp: 'W',
          };
        }
        case 'undef': {
          c.i32(this.be.text(z.name)); this.effekt('rt_nicht_definiert');
          return null;
        }
        case 'dyn': case 'mem': {
          const fe = this.temp('B');
          if (z.art === 'dyn') {
            c.i32(this.be.text(z.name)); this.dies(); c.i32(this.ctxk());
            this.effekt('rt_feld_ctx_ziel');
            c.tee(fe).op(OP.i32_eqz);
            this.auf('if');
            if (z.g === null) { c.i32(this.be.text(z.name)); this.effekt('rt_nicht_definiert'); }
            else {
              // kein Feld → globale Variable (wie finde(): Felder im Kontext vor den äußeren Scopes); noch nicht deklariert → undefiniert
              c.i32(this.globAdr(z.g)).ld64(0).i64(UNDEF).op(OP.i64_eq);
              this.auf('if'); c.i32(this.be.text(z.name)); this.effekt('rt_nicht_definiert'); this.zu();
            }
            this.zu();
            if (z.g !== null) {
              // Feld oder globale Variable – Laufzeitwahl
              return this.zielDynGlobal(z, fe);
            }
          } else {
            const o = this.ausdr(z.obj); this.konv(o, 'W');
            c.i32(this.be.text(z.name)).i32(this.ctxk());
            this.effekt('rt_mem_ziel');
            c.set(fe);
          }
          return {
            feld: fe, typ: null, gebacken: false,
            lese() { c.get(fe).i32(self.be.text(z.name)); self.effekt('rt_feldvar_lesen'); return 'W'; },
            weg: false, feldWeg: true,
            schreibe(t) {
              self.konv(t, 'W');
              const w = self.temp('W'); c.set(w);
              c.get(fe).get(w).i32(self.be.text(z.name)); self.dies(); c.i32(self.fn.ktor ? 1 : 0);
              self.effekt('rt_feldvar_schreiben');
              self.frei_('W', w);
            },
            slotTyp: 'W', istFeld: true,
          };
        }
      }
      throw new NichtUnterstuetzt('Ziel ' + z.art);
    }
    /** Ziel „Feld oder globale Variable“ (unqualifizierter Name in einer Methode, gleichnamiges Feld und globale Variable):
     *  zur Laufzeit gewählt – fe ≠ 0 → Feld, sonst die globale Variable (bereits als definiert geprüft). */
    zielDynGlobal(z, fe) {
      const c = this.c, self = this, name = z.name;
      const adr = this.globAdr(z.g);
      const gi = this.be.globalInfo(name);
      const gZiel = {
        typ: gi.typ, gebacken: gi.gebacken, global: true, flagAdr: this.be.globFlagAdr + z.g * 4,
        schreibe(t) { self.konv(t, 'W'); const w = self.temp('W'); c.set(w).i32(adr).get(w).st64(0); self.frei_('W', w); },
      };
      return {
        feld: fe, typ: null, gebacken: false,
        lese() {
          c.get(fe);
          self.auf('if', T.i64);
          c.get(fe).i32(self.be.text(name)); self.effekt('rt_feldvar_lesen');
          self.sonst();
          c.i32(adr).ld64(0);
          if (self.istWegName(name)) self.wegPruefen(name);
          self.zu();
          return 'W';
        },
        weg: false, feldWeg: true,
        schreibe(t) {
          self.konv(t, 'W');
          const w = self.temp('W'); c.set(w);
          c.get(fe);
          self.auf('if');
          c.get(fe).get(w).i32(self.be.text(name)); self.dies(); c.i32(self.fn.ktor ? 1 : 0);
          self.effekt('rt_feldvar_schreiben');
          self.sonst();
          c.get(w);
          self.schreibeVar(gZiel, 'W', name);
          self.zu();
          self.frei_('W', w);
        },
        slotTyp: 'W', istFeld: true,
      };
    }

    /** schreibeVar(v, w, sc, name): gebacken, Typ, setzen */
    schreibeVar(ziel, t, name) {
      const c = this.c;
      if (ziel.istFeld) { ziel.schreibe(t); return; }
      this.kuechenWache(ziel, name);
      if (ziel.gebacken && ziel.global) {
        c.i32(ziel.flagAdr).ld32(0).op(OP.i32_eqz);
        this.auf('if');
        this.flushKopie();
        c.i32(this.be.text(name)).call(this.rt('rt_gebacken'));
        this.br(this.handler[this.handler.length - 1]);
        this.zu();
        c.i32(ziel.flagAdr).i32(0).st32(0);
      } else if (ziel.gebacken) {
        if (ziel.unbelegt >= 0) {
          c.get(ziel.unbelegt).op(OP.i32_eqz);
          this.auf('if');
          this.flushKopie();
          c.i32(this.be.text(name)).call(this.rt('rt_gebacken'));
          this.br(this.handler[this.handler.length - 1]);
          this.zu();
          c.i32(0).set(ziel.unbelegt);
        } else {
          this.flush();
          c.op(OP.drop);
          c.i32(this.be.text(name)); this.effekt('rt_gebacken');
          return;
        }
      }
      t = this.typPruefen(t, ziel.typ, name);
      this.flush();
      ziel.schreibe(t);
    }

    /**
     * Küchenbrigade (SPEC §17.3 S3, K-101/4): Schreiben in eine Variable der Hauptküche – globale Variable oder gefangene
     * Zelle unterhalb von ZUSTAND.gefroren – wirft die KüchenAnanas. Nach der rechten Seite, vor gebacken/Typ; 0 Schritte.
     * Lokale Slots brauchen keine Wache (ein Stück läuft immer in neuen Rahmen). Außerhalb einer Brigade ist gefroren = 0.
     */
    kuechenWache(ziel, name) {
      const c = this.c, Z = this.Z;
      if (ziel.global) c.i32(Z).ld32(Z_GEFROREN);
      else if (ziel.umg) c.get(0).ld64(32 + ziel.umgIdx * 8).op(OP.i32_wrap_i64).i32(Z).ld32(Z_GEFROREN).op(OP.i32_lt_u);
      else return;
      this.auf('if');
      c.i32(this.be.text(name)).call(this.rt('rt_kueche_var'));
      this.br(this.handler[this.handler.length - 1]);
      this.zu();
    }

    zuw(a) {
      const c = this.c;
      const ziel = this.zielVor(a.ziel);
      if (!ziel) { this.flush(); return; }
      const name = a.ziel.name;
      if (a.op === '=') {
        let t = this.ausdr(a.wert);
        this.schreibeVar(ziel, t, name);
        if (ziel.feld !== undefined) this.frei_('B', ziel.feld);
        return;
      }
      // zusammengesetzt: weg-Prüfung, alter Wert, rhs, binaer
      let alt = ziel.lese();
      if (ziel.weg) { this.konv(alt, 'W'); alt = 'W'; this.wegPruefen(name); }
      const op = { '+=': OPS.PLUS, '-=': OPS.MINUS, '*=': OPS.MAL, '/=': OPS.DURCH }[a.op];
      const at = this.temp(alt); c.set(at);
      const tr = this.typVon(a.wert);
      if (alt === 'F' && tr === 'F' && op !== OPS.DURCH) {
        c.get(at); this.ausdr(a.wert);
        c.op(op === OPS.PLUS ? OP.f64_add : op === OPS.MINUS ? OP.f64_sub : OP.f64_mul);
        this.frei_('F', at);
        this.schreibeVar(ziel, 'F', name);
      } else {
        const r = this.ausdr(a.wert); this.konv(r, 'W');
        const rt = this.temp('W'); c.set(rt);
        c.i32(op).get(at); this.konv(alt, 'W'); c.get(rt).i32(a.p);
        this.effekt('rt_bin', a.tf);
        this.frei_(alt, at); this.frei_('W', rt);
        this.schreibeVar(ziel, 'W', name);
      }
      if (ziel.feld !== undefined) this.frei_('B', ziel.feld);
    }

    inc(a) {
      const c = this.c;
      const ziel = this.zielVor(a.ziel);
      if (!ziel) return;
      const name = a.ziel.name;
      let alt = ziel.lese();
      if (ziel.weg) { this.konv(alt, 'W'); alt = 'W'; this.wegPruefen(name); }
      if (alt === 'F') {
        c.f64(a.d).op(OP.f64_add);
        this.schreibeVar(ziel, 'F', name);
      } else {
        this.konv(alt, 'W');
        const w = this.temp('W'); c.set(w);
        c.get(w).i64(MARKE).op(OP.i64_lt_u);
        this.auf('if', T.i64);
        c.get(w).op(OP.f64_reinterpret_i64).f64(a.d).op(OP.f64_add); this.konv('F', 'W');
        this.sonst();
        c.i32(OPS.PLUS).get(w).f64(a.d); this.konv('F', 'W'); c.i32(a.p);
        this.effekt('rt_bin', a.tf);
        this.zu();
        this.frei_('W', w);
        this.schreibeVar(ziel, 'W', name);
      }
      if (ziel.feld !== undefined) this.frei_('B', ziel.feld);
    }

    fuerJedes(a) {
      const c = this.c;
      const q = this.ausdr(a.quelle); this.konv(q, 'W');
      this.effekt('rt_fuer_liste', a.tf);
      const liste = this.temp('W'), n = this.temp('B'), i = this.temp('B');
      c.tee(liste).call(this.rt('rt_blech_len')).set(n);
      c.i32(0).set(i);
      const brk = this.auf('block');
      const top = this.auf('loop');
      c.get(i).get(n).op(OP.i32_ge_s); this.brIf(brk);
      c.get(liste).get(i).call(this.rt('rt_blech_get'));
      let t = 'W';
      if (a.typ) t = this.typPruefen('W', a.typ, a.name);
      this.speichereSlotNeu(a.slot, t);
      const cnt = this.auf('block');
      this.ctrl.push({ art: 'loop', brk, cnt });
      for (const s of a.body) this.anw(s);
      this.flush();
      this.ctrl.pop();
      this.zu();
      c.get(i).i32(1).op(OP.i32_add).set(i);
      this.br(top);
      this.zu(); this.zu();
      this.frei_('W', liste); this.frei_('B', n); this.frei_('B', i);
    }

    /** wählt einen Fall: hinterlässt nichts, setzt Lokal fall (−1 = keiner) */
    waehleFall(subjW, faelle) {
      const c = this.c;
      const fall = this.temp('B');
      c.i32(-1).set(fall);
      const gef = this.auf('block');
      let std = -1;
      faelle.forEach((f, i) => {
        if (!f.labels) { std = i; return; }
        for (const lab of f.labels) {
          if (lab.enumName) {
            c.get(subjW).i32(this.be.text(lab.enumName)).call(this.rt('rt_enum_label'));
            const r = this.temp('B');
            c.set(r);
            c.get(r).i32(1).op(OP.i32_eq);
            this.auf('if'); c.i32(i).set(fall); this.br(gef); this.zu();
            c.get(r).op(OP.i32_eqz);
            this.auf('if');
            const t = this.ausdr(lab); this.konv(t, 'W');
            this.flush();
            const lw = this.temp('W'); c.set(lw);
            c.get(subjW).get(lw).call(this.rt('rt_gleich'));
            this.frei_('W', lw);
            this.auf('if'); c.i32(i).set(fall); this.br(gef); this.zu();
            this.zu();
            this.frei_('B', r);
          } else {
            const t = this.ausdr(lab); this.konv(t, 'W');
            this.flush();
            const lw = this.temp('W'); c.set(lw);
            c.get(subjW).get(lw);
            this.setzeTiefe(lab.tf || 0);
            c.call(this.rt('rt_gleich'));
            this.frei_('W', lw);
            this.auf('if'); c.i32(i).set(fall); this.br(gef); this.zu();
          }
        }
      });
      c.i32(std).set(fall);
      this.zu();
      return fall;
    }

    waehle(a) {
      const c = this.c;
      const s = this.ausdr(a.subj); this.konv(s, 'W'); this.flush();
      const sw = this.temp('W'); c.set(sw);
      const fall = this.waehleFall(sw, a.faelle);
      this.frei_('W', sw);
      const ende = this.auf('block');
      this.ctrl.push({ art: 'waehle', ende });
      a.faelle.forEach((f, i) => {
        c.get(fall).i32(i).op(OP.i32_eq);
        this.auf('if');
        if (f.block) for (const st of f.block) this.anw(st);
        else this.anw(f.anw);
        this.flush();
        this.br(ende);
        this.zu();
      });
      this.ctrl.pop();
      this.zu();
      this.frei_('B', fall);
    }

    /** blockWert: führt Anweisungen aus, Wert = serviere-Wert oder karton. Ergebnis i64 auf dem Stapel */
    blockWert(stmts, vorher) {
      const c = this.c;
      this.flush();
      const wert = this.temp('W');
      c.i64(KARTON).set(wert);
      const ende = this.auf('block');
      const ret = this.auf('block');
      this.ctrl.push({ art: 'blockwert', ret, ende });
      if (vorher) vorher();
      for (const s of stmts) this.anw(s);
      this.flush();
      this.ctrl.pop();
      this.br(ende);
      this.zu();
      // RET: Wert aus rueck
      c.i32(this.Z).ld64(Z_RUECK).set(wert);
      c.i32(this.Z).i64(KARTON).st64(Z_RUECK);
      this.zu();
      c.get(wert);
      this.frei_('W', wert);
    }

    waehleA(e) {
      const c = this.c;
      const s = this.ausdr(e.subj); this.konv(s, 'W'); this.flush();
      const sw = this.temp('W'); c.set(sw);
      const fall = this.waehleFall(sw, e.faelle);
      this.frei_('W', sw);
      const erg = this.temp('W');
      c.i64(KARTON).set(erg);
      e.faelle.forEach((f, i) => {
        c.get(fall).i32(i).op(OP.i32_eq);
        this.auf('if');
        if (f.block) this.blockWert(f.block);
        else { const t = this.ausdr(f.e); this.konv(t, 'W'); this.flush(); }
        c.set(erg);
        this.zu();
      });
      c.get(erg);
      this.frei_('W', erg); this.frei_('B', fall);
      return 'W';
    }

    probier(a) {
      const c = this.c;
      this.flush();
      const mitRand = !!a.rand;
      const weiter = this.auf('block');
      const randNormal = this.auf('block');
      const randSig = this.auf('block');
      const fang = this.auf('block');
      let k = null;
      if (mitRand) {
        k = { art: 'rand', pend: this.temp('B'), eintritt: randNormal, codes: [] };
        c.i32(0).set(k.pend);
        this.ctrl.push(k);
      }
      // try
      this.handler.push(fang);
      for (const s of a.block) this.anw(s);
      this.flush();
      this.handler.pop();
      this.br(randNormal);
      this.zu(); // fang
      // Signal aus dem try-Block
      if (a.faenge.length) {
        for (const f of a.faenge) {
          c.i32(f.typ ? this.be.text(f.typ) : 0).call(this.rt('rt_fang_passt'));
          this.auf('if');
          c.call(this.rt('rt_fang_obj'));
          this.speichereSlotNeu(f.slot, 'W');
          this.handler.push(randSig);
          for (const s of f.block) this.anw(s);
          this.flush();
          this.handler.pop();
          this.br(randNormal);
          this.zu();
        }
      }
      this.zu(); // randSig
      if (mitRand) this.ctrl.pop();
      // Signalpfad: rand (nur bei Ananas/Budget), dann weiterreichen
      if (mitRand) {
        c.i32(this.Z).ld32(Z_SIG).i32(SIG_ANANAS).op(OP.i32_eq).i32(this.Z).ld32(Z_SIG).i32(SIG_BUDGET).op(OP.i32_eq).op(OP.i32_or);
        this.auf('if');
        const h = this.temp('B');
        c.call(this.rt('rt_sig_sichern')).set(h);
        // rand: Kontrollfluss im rand überschreibt das Signal
        const randCtrlIdx = this.ctrl.length;
        void randCtrlIdx;
        const verwerfen = { art: 'randverwerfen', h };
        this.ctrl.push(verwerfen);
        for (const s of a.rand) this.anw(s);
        this.flush();
        this.ctrl.pop();
        c.get(h).call(this.rt('rt_sig_wieder'));
        this.frei_('B', h);
        this.zu();
      }
      this.br(this.handler[this.handler.length - 1]);
      this.zu(); // randNormal
      if (mitRand) {
        for (const s of a.rand) this.anw(s);
        this.flush();
        this.weiterNachRand(k, this.ctrl.length);
        this.frei_('B', k.pend);
      }
      this.zu(); // weiter
    }

    ofen(e) {
      const c = this.c;
      // Argumente (alle ausgewertet), dann zeit (Pos. 0 / zeit:, K-127) wählen
      const alle = e.args.pos.concat(e.args.ben ? e.args.ben.map(b => b.e) : []);
      const tmps = alle.map(x => { const t = this.ausdr(x); this.konv(t, 'W'); const l = this.temp('W'); c.set(l); return l; });
      const wahl = (i, name) => {
        if (i < e.args.pos.length) { c.get(tmps[i]); return; }
        if (e.args.ben) { for (let j = e.args.ben.length - 1; j >= 0; j--) if (e.args.ben[j].name === name) { c.get(tmps[e.args.pos.length + j]); return; } }
        c.i64(UNDEF);
      };
      wahl(0, 'zeit');
      for (const l of tmps) this.frei_('W', l);
      this.effekt('rt_ofen_vor', e.tf);
      const id = this.temp('B');
      c.set(id);
      const erg = this.temp('W');
      const res = this.auf('block');
      const fs = this.auf('block');
      c.get(id); this.flush(); c.call(this.rt('rt_ofen_an'));
      c.i32(this.Z).ld32(Z_SIG); this.brIf(fs);
      const innen = this.auf('block');
      this.handler.push(innen);
      this.blockWert(e.body);
      c.set(erg);
      this.handler.pop();
      this.zu();
      c.get(id).i32(e.roh ? 1 : 0).call(this.rt('rt_ofen_aus'));
      c.i32(this.Z).ld32(Z_SIG); this.brIf(fs);
      if (e.roh) {
        this.auf('if');
        c.call(this.rt('rt_ofen_roh'));
        this.speichereSlotNeu(e.roh.slot, 'W');
        this.blockWert(e.roh.body);
        c.set(erg);
        this.zu();
      } else c.op(OP.drop);
      this.br(res);
      this.zu(); // fs
      // Signal: verbrannt-Zweige
      for (const f of e.faenge) {
        c.i32(f.typ ? this.be.text(f.typ) : 0).call(this.rt('rt_fang_passt'));
        this.auf('if');
        c.call(this.rt('rt_fang_obj'));
        this.speichereSlotNeu(f.slot, 'W');
        this.blockWert(f.block);
        c.set(erg);
        this.br(res);
        this.zu();
      }
      this.br(this.handler[this.handler.length - 1]);
      this.zu(); // res
      c.get(erg);
      this.frei_('W', erg); this.frei_('B', id);
      return 'W';
    }

    feldInitAnw(a) {
      const c = this.c;
      if (a.k === 'statinit') c.i32(this.Z).i32(a.p).st32(Z_POS);
      let t = this.ausdr(a.e);
      this.konv(t, 'W');
      const w = this.temp('W'); c.set(w);
      if (a.k === 'feldinit') this.dies(); else c.i64(KARTON);
      c.i32(this.ctxk()).i32(this.be.text(a.name)).get(w);
      this.effekt('rt_feld_init');
      this.frei_('W', w);
    }

    anno(a) {
      const c = this.c;
      if (a.e) c.i32(this.Z).i32(a.p).st32(Z_POS);
      c.i32(a.mid);
      if (a.e) { const t = this.ausdr(a.e); this.konv(t, 'W'); }
      else c.i64(UNDEF);
      if (a.k === 'annoHaltbar') { this.effekt('rt_methode_haltbar'); c.op(OP.drop); }
      else this.effekt('rt_methode_veraltet');
    }
  }

  /** IR → Wasm-Code im Modulbau */
  function erzeuge(ir, mb, info) {
    const be = new Backend(ir, mb, info);
    be.schiebNamen = new Set(ir.schiebNamen || []);
    const gi = new Map();
    be.globalInfo = (name) => gi.get(name) || { typ: null, gebacken: false };
    if (ir.globalInfos) for (const [n, v] of Object.entries(ir.globalInfos)) gi.set(n, v);
    be.baue();
    return be;
  }

  return { erzeuge, NichtUnterstuetzt };
});
