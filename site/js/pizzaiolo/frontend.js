/*
 * pizzaiolo – Frontend: AST (PizzaLang.parse) → IR (IR.md).
 * Namensauflösung (lokal / Zelle / global / dynamisch), Closure-Fänge, statische Prüfungen
 * (W0666, W0032, P0010, P0011, Q0004, R0001, A0001), Schritte (st) und Stapeltiefe (tf) je Knoten.
 */
(function (root, fabrik) {
  'use strict';
  const api = fabrik();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else { root.PizzaioloTeile = root.PizzaioloTeile || {}; root.PizzaioloTeile.frontend = api; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const ANANAS_BAUM = [
    ['Ananas', null], ['GeprüfteAnanas', 'Ananas'], ['VerbranntAnanas', 'GeprüfteAnanas'], ['LieferAnanas', 'GeprüfteAnanas'],
    ['LaufzeitAnanas', 'Ananas'], ['StreitAnanas', 'LaufzeitAnanas'], ['RechenAnanas', 'LaufzeitAnanas'],
    ['LeererKartonAnanas', 'LaufzeitAnanas'], ['RohlingAnanas', 'LaufzeitAnanas'], ['BesitzAnanas', 'LaufzeitAnanas'],
    ['GebackenAnanas', 'LaufzeitAnanas'], ['TypAnanas', 'LaufzeitAnanas'], ['KeinStückAnanas', 'LaufzeitAnanas'],
    ['ZugriffsAnanas', 'LaufzeitAnanas'], ['UnbekannterBelagAnanas', 'LaufzeitAnanas'], ['ZugeklapptAnanas', 'LaufzeitAnanas'],
    ['UnbekanntePizzaAnanas', 'LaufzeitAnanas']
  ];
  const ANANAS_M = new Set(['nachricht', 'holeNachricht', 'typ', 'alsText']);
  const PIZZA_M = new Set(['beläge', 'hat', 'anzahlBeläge', 'alsText', 'übrig', 'beschreibung']);
  const BELAG_NAMEN = ['Tomate', 'Mozzarella', 'Käse', 'Basilikum', 'Salami', 'Schinken', 'Pilze', 'Oliven', 'Zwiebeln', 'Paprika',
    'Chili', 'Peperoni', 'Rucola', 'Parmesan', 'Gorgonzola', 'Thunfisch', 'Sardellen', 'Artischocken', 'Spinat', 'Ei', 'Mais',
    'Knoblauch', 'Kapern', 'Ananas'];
  const THEKE = new Set(['Theke', 'Schild', 'Knopf', 'Eingabe', 'Haken', 'Stapel', 'Reihe', 'Zutat']);
  const UNTERSTUETZTE_TYPEN = new Set(['salami', 'funghi', 'margherita', 'diavolo', 'Dauer', 'Pizza', 'Blech', 'Speisekarte',
    'Teig', 'Lieferung', 'Zustellung', 'Stück', 'Reste', 'Rohling', 'hawaii', 'Theke', 'Zutat', 'Schild', 'Knopf', 'Eingabe',
    'Haken', 'Stapel', 'Reihe', 'Zufall', 'Vorratskammer']);
  // Eingebaute Typen der Referenz, die der Compiler noch nicht kennt → ehrlicher Fallback
  const TYPEN_REFERENZ = new Set((typeof require === 'function' && typeof module === 'object' ? (function () { try { return require('../pizza.js').TYPEN; } catch (e) { return []; } })() : ((typeof self !== 'undefined' && self.PizzaLang && self.PizzaLang.TYPEN) || [])));
  const NOCH_NICHT_METHODEN = new Set(['tausender', 'kompakt', 'echt']);
  const DEKL = new Set(['Klasse', 'Rezeptur', 'Enum', 'Belag', 'Methode']);
  const EINFACH = new Set(['Zahl', 'Text', 'Bool', 'Name', 'Dauer', 'Karton', 'Dies', 'Unten', 'Lambda']);
  const BIN_OPS = { '+': 0, '-': 1, '*': 2, '/': 3, '%': 4, '==': 5, '!=': 6, '<': 7, '<=': 8, '>': 9, '>=': 10 };

  class NichtUnterstuetzt extends Error {
    constructor(grund, n) { super(grund); this.grund = grund; this.zeile = n && n.z != null ? n.z : null; this.spalte = n && n.s != null ? n.s : null; }
  }

  // ------------------------------------------------------------ analysiere (Port aus pizza.js)
  function analysiere(ast) {
    const warn = [];
    let hawaii = null;
    const merke = (z, s) => { if (!hawaii || z < hawaii.z || (z === hawaii.z && s < hawaii.s)) hawaii = { z, s }; };
    const gemergt = new Set();
    const pruefe = (namen) => {
      const gesehen = new Set();
      for (let j = 1; j < namen.length; j++) {
        for (let i = 0; i < j; i++) {
          const a = namen[i], b = namen[j];
          if (a.name !== b.name && a.name.toLowerCase() === b.name.toLowerCase()) {
            const key = a.name + '\u0000' + b.name;
            if (gesehen.has(key)) continue;
            gesehen.add(key);
            warn.push({ code: 'W0032', text: 'W0032: \'' + a.name + '\' und \'' + b.name + '\' sind im selben Scope definiert. Selbst der Pizzaiolo verwechselt die beiden.', zeile: b.z, spalte: b.s });
          }
        }
      }
    };
    const declsVon = (stmts, oben) => {
      const r = [];
      for (const st of stmts) {
        if (st.k === 'Var') for (const d of st.decls) r.push({ name: d.name, z: d.z, s: d.s });
        else if (oben && st.k === 'Methode') r.push({ name: st.name, z: st.nz, s: st.ns });
      }
      return r;
    };
    const blockNamen = (b) => { if (b && b.k === 'Block') { gemergt.add(b); return declsVon(b.body, false); } return []; };
    const geh = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const x of n) geh(x); return; }
      switch (n.k) {
        case 'Typ': if (n.name === 'hawaii') merke(n.z, n.s); break;
        case 'Name': if (n.n === 'Ananas') merke(n.z, n.s); break;
        case 'PizzaLit': for (const b of n.belaege) if (b.n === 'Ananas') merke(b.z, b.s); break;
        case 'Programm': pruefe(declsVon(n.body, true)); break;
        case 'Block': if (!gemergt.has(n)) pruefe(declsVon(n.body, false)); break;
        case 'Methode': case 'Ktor': case 'Lambda':
          pruefe(n.params.map(p => ({ name: p.name, z: p.z, s: p.s })).concat(blockNamen(n.body)));
          break;
        case 'FuerJedes': pruefe([{ name: n.name, z: n.nz, s: n.ns }].concat(blockNamen(n.body))); break;
        case 'Fuer': {
          const ns = n.init && n.init.k === 'Var' ? n.init.decls.map(d => ({ name: d.name, z: d.z, s: d.s })) : [];
          pruefe(ns.concat(blockNamen(n.body)));
          break;
        }
        case 'Klasse': {
          const ns = [];
          for (const f of n.felder) for (const d of f.decls) ns.push({ name: d.name, z: d.z, s: d.s });
          for (const m of n.methoden) ns.push({ name: m.name, z: m.nz, s: m.ns });
          pruefe(ns);
          break;
        }
        case 'Probier':
          for (const f of n.faenge) pruefe([{ name: f.name, z: f.nz, s: f.ns }].concat(blockNamen(f.block)));
          break;
        case 'Ofen':
          if (n.roh) pruefe([{ name: n.roh.name, z: n.roh.nz, s: n.roh.ns }].concat(blockNamen(n.roh.block)));
          for (const f of n.faenge) pruefe([{ name: f.name, z: f.nz, s: f.ns }].concat(blockNamen(f.block)));
          break;
      }
      for (const key in n) {
        const v = n[key];
        if (v && typeof v === 'object') geh(v);
      }
    };
    geh(ast);
    warn.sort((a, b) => a.zeile - b.zeile || a.spalte - b.spalte);
    if (hawaii) warn.unshift({ code: 'W0666', text: 'W0666: Typ \'hawaii\' gefunden. Der Pizzaiolo sagt nichts. Er schaut nur.', zeile: hawaii.z, spalte: hawaii.s });
    return warn;
  }

  function sichtbarkeit(mods) {
    if (mods.indexOf('geheimrezept') >= 0) return 2 - 1; // 1 = geheim
    if (mods.indexOf('familienrezept') >= 0) return 2;
    return 0;
  }
  function istGross(w) { const c = w[0]; return c !== c.toLowerCase() && c === c.toUpperCase(); }

  // ------------------------------------------------------------ Frontend
  class Frontend {
    constructor(ast) {
      this.ast = ast;
      this.posListe = [[0, 0]];
      this.posMap = new Map();
      this.funktionen = [];
      this.nicht = [];
      this.klassenIR = [];        // Laufzeit-Klassenindex = 17 + i
      this.registrierung = [];
      this.methodenListe = [];    // Laufzeit-Methoden-IDs in Registrierungsreihenfolge
      this.alleMethoden = [];     // Reihenfolge wie im Interpreter (für vorbereiten)
      this.globaleNamen = new Map(); // Name → globaler Slot
      this.schiebNamen = new Set();
      this.feldNamen = new Set();
      this.belagNamen = new Set(BELAG_NAMEN);
      this.globalFnNamen = new Set();
      this.methodenNamen = new Set();
      this.zugewiesen = new Set();
      this.neuTypen = new Set();
      this.globalGenutzt = new Set();
      this.globalFnDecl = new Map();
      this.klassenNamen = new Set();
    }

    pos(n) {
      if (!n || n.z == null) return 0;
      const key = n.z + ':' + n.s;
      let i = this.posMap.get(key);
      if (i === undefined) { i = this.posListe.length; this.posListe.push([n.z, n.s == null ? 0 : n.s]); this.posMap.set(key, i); }
      return i;
    }
    nein(grund, n) { throw new NichtUnterstuetzt(grund, n); }

    // ---------------------------------------------------------- Vorab-Durchlauf
    vorab() {
      const geh = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { for (const x of n) geh(x); return; }
        if (n.k === 'NCall' && n.name === 'schieb' && n.args && n.args.pos.length === 1 && n.args.pos[0].k === 'Name') { this.schiebNamen.add(n.args.pos[0].n); this.zugewiesen.add(n.args.pos[0].n); }
        if ((n.k === 'Zuw' || n.k === 'Inc') && n.ziel && n.ziel.k === 'Name') this.zugewiesen.add(n.ziel.n);
        if (n.k === 'Klasse') for (const f of n.felder) for (const d of f.decls) this.feldNamen.add(d.name);
        if (n.k === 'Belag') this.belagNamen.add(n.name);
        if (n.k === 'Neu' && n.typ) this.neuTypen.add(n.typ.name);
        if (n.k === 'Klasse') { for (const m of n.methoden) this.methodenNamen.add(m.name); this.klassenNamen.add(n.name); }
        if (n.k === 'Belag') for (const m of n.methoden) this.methodenNamen.add(m.name);
        for (const key in n) { const v = n[key]; if (v && typeof v === 'object') geh(v); }
      };
      geh(this.ast);
      for (const st of this.ast.body) {
        if (st.k === 'Var') for (const d of st.decls) this.globalSlot(d.name);
        if (st.k === 'Methode') { this.globalFnNamen.add(st.name); this.globalSlot(st.name); const l = this.globalFnDecl.get(st.name) || []; l.push(st); this.globalFnDecl.set(st.name, l); }
        if (st.k === 'Var') for (const d of st.decls) this.zugewiesen.add(d.name);
      }
    }
    globalSlot(name) {
      let g = this.globaleNamen.get(name);
      if (g === undefined) { g = this.globaleNamen.size; this.globaleNamen.set(name, g); }
      return g;
    }

    // ---------------------------------------------------------- Registrierung + Startprüfung
    registriere() {
      // Simulierte Klassentabelle (wie this.klassen)
      const klassen = new Map();
      const liste = [];
      for (const [name, basis] of ANANAS_BAUM) klassen.set(name, { art: 'klasse', name, basis: basis ? klassen.get(basis) : null, eingebaut: true, methoden: new Map(), erfuellt: [], rohling: false, gebacken: false });
      this.simKlassen = klassen;
      const reg = (d) => {
        switch (d.k) {
          case 'Klasse': {
            const k = { art: 'klasse', name: d.name, decl: d, basis: null, erfuellt: [], methoden: new Map(), rohling: d.mods.includes('rohling'), gebacken: d.mods.includes('gebacken'), calzone: d.mods.includes('calzone'), idx: 17 + this.klassenIR.length };
            for (const md of d.methoden) { const l = k.methoden.get(md.name); if (l) l.push(md); else k.methoden.set(md.name, [md]); }
            klassen.set(d.name, k);
            liste.push(k);
            const ir = { name: d.name, decl: d, idx: k.idx, sim: k };
            this.klassenIR.push(ir);
            this.registrierung.push({ art: 'klasse', ir });
            for (const inn of d.innere) reg(inn);
            break;
          }
          case 'Rezeptur': {
            const r = { art: 'rezeptur', name: d.name, decl: d, basen: [], methoden: d.methoden.map(m => m.name) };
            klassen.set(d.name, r);
            this.registrierung.push({ art: 'rezeptur', d });
            break;
          }
          case 'Enum': klassen.set(d.name, { art: 'enum', name: d.name }); this.registrierung.push({ art: 'enum', d }); break;
          case 'Belag': this.registrierung.push({ art: 'belag', d }); break;
          case 'Methode': this.registrierung.push({ art: 'globalfn', d }); break;
        }
      };
      for (const d of this.ast.body) if (DEKL.has(d.k)) reg(d);
      this.simListe = liste;
      // pruefe()
      const pf = (code, text, n) => { throw { startfehler: { code, text: 'PizzaFehler ' + code + ': ' + text, pos: this.pos(n) } }; };
      const dekls = [];
      const sammle = (d) => { dekls.push(d); if (d.k === 'Klasse') for (const i of d.innere) sammle(i); };
      for (const d of this.ast.body) if (DEKL.has(d.k)) sammle(d);
      const rezMethoden = (r, gesehen) => {
        if (gesehen.has(r)) return [];
        gesehen.add(r);
        let l = r.methoden.slice();
        for (const b of r.basen) l = l.concat(rezMethoden(b, gesehen));
        return l;
      };
      const findeListe = (k, name) => { for (let c = k; c; c = c.basis) { const l = c.methoden.get(name); if (l) return l; } return null; };
      const istAnanas = (k) => { for (let c = k; c; c = c.basis) if (c === klassen.get('Ananas') || (c.eingebaut && c.name === 'Ananas')) return true; return false; };
      try {
        for (const d of dekls) {
          if (d.k === 'Enum') {
            if (d.werte.length !== 4) pf('Q0004', 'quattrostagioni braucht genau 4 Werte, nicht ' + d.werte.length + '.', d);
          } else if (d.k === 'Klasse') {
            const k = klassen.get(d.name);
            if (d.basis) {
              const b = klassen.get(d.basis.name);
              if (!b || b.art !== 'klasse') pf('P0010', 'Klasse \'' + d.name + '\' erbt von \'' + d.basis.name + '\' – diese Klasse gibt es nicht.', d.basis);
              if (b.gebacken) pf('P0011', 'Klasse \'' + d.name + '\' kann nicht von \'' + b.name + '\' erben – \'' + b.name + '\' ist gebacken.', d.basis);
              k.basis = b;
            }
            for (const t of d.erfuellt) {
              const r = klassen.get(t.name);
              if (!r || r.art !== 'rezeptur') pf('P0010', 'Klasse \'' + d.name + '\' erfüllt \'' + t.name + '\' – diese Rezeptur gibt es nicht.', t);
              k.erfuellt.push(r);
            }
          } else if (d.k === 'Rezeptur') {
            const r = klassen.get(d.name);
            for (const t of d.basen) {
              const b = klassen.get(t.name);
              if (!b || b.art !== 'rezeptur') pf('P0010', 'Rezeptur \'' + d.name + '\' erbt von \'' + t.name + '\' – diese Rezeptur gibt es nicht.', t);
              r.basen.push(b);
            }
          }
        }
        for (const k of liste) {
          const gesehen = new Set();
          for (let c = k; c; c = c.basis) {
            if (gesehen.has(c)) pf('P0010', 'Klasse \'' + k.name + '\' erbt im Kreis – das ist ein Teigknoten.', k.decl);
            gesehen.add(c);
          }
        }
        for (const d of dekls) {
          if (d.k === 'Klasse') {
            const k = klassen.get(d.name);
            if (!k.rohling) {
              for (let c = k; c; c = c.basis) {
                for (const r of c.erfuellt) {
                  for (const mn of rezMethoden(r, new Set())) {
                    let impl = false;
                    for (let x = k; x; x = x.basis) { const l = x.methoden.get(mn); if (l && l.some(m => m.body !== null)) { impl = true; break; } }
                    if (!impl) pf('R0001', 'Klasse \'' + k.name + '\' erfüllt Rezeptur \'' + r.name + '\' nicht: Methode \'' + mn + '\' fehlt.', d);
                  }
                }
              }
            }
            for (const md of d.methoden) {
              if (!md.annos.some(a => a.name === 'PizzaÜberschreibt')) continue;
              let ok = md.name === 'alsText' || (istAnanas(k) && ANANAS_M.has(md.name));
              if (!ok && k.basis && findeListe(k.basis, md.name)) ok = true;
              if (!ok) {
                for (let c = k; c && !ok; c = c.basis) {
                  for (const r of c.erfuellt) if (rezMethoden(r, new Set()).indexOf(md.name) >= 0) ok = true;
                }
              }
              if (!ok) pf('A0001', 'Methode \'' + md.name + '\' in \'' + k.name + '\' ist mit @PizzaÜberschreibt markiert, überschreibt aber nichts.', md);
            }
          } else if (d.k === 'Belag') {
            for (const md of d.methoden) {
              if (!md.annos.some(a => a.name === 'PizzaÜberschreibt')) continue;
              if (md.name !== 'preis' && !PIZZA_M.has(md.name)) pf('A0001', 'Methode \'' + md.name + '\' in Belag \'' + d.name + '\' ist mit @PizzaÜberschreibt markiert, überschreibt aber nichts.', md);
            }
          }
        }
      } catch (e) {
        if (e && e.startfehler) return e.startfehler;
        throw e;
      }
      return null;
    }

    // ---------------------------------------------------------- Funktionen & Scopes
    neueFn(art, name, eltern, ctx) {
      const fn = {
        id: this.funktionen.length, art, name, klasse: ctx.klasse, ktor: !!ctx.ktor, belag: !!ctx.belag,
        plus1: art === 'methode' || art === 'ktor' || art === 'lambda' || art === 'belag',
        params: [], slots: [], fang: [], fangKeys: new Map(), eltern: eltern || null, body: null, ausdr: null,
        hatDies: ctx.klasse !== null || !!ctx.belag, strikt: art !== 'lambda',
      };
      this.funktionen.push(fn);
      return fn;
    }
    neuerScope(eltern, fn, art) { return { vars: new Map(), eltern, fn, art, spaeter: null }; }
    neuerSlot(fn, name, typ, gebacken) {
      const slot = { name, typ: typ || null, gebacken: !!gebacken, zelle: false, weg: this.schiebNamen.has(name), typen: new Set([typ ? typKey(typ) : '']), unbelegt: false };
      fn.slots.push(slot);
      return fn.slots.length - 1;
    }
    deklariere(sc, name, typ, gebacken, n) {
      const vorh = sc.vars.get(name);
      if (vorh !== undefined) {
        const slot = sc.fn.slots[vorh];
        slot.typen.add(typ ? typKey(typ) : '');
        if (slot.typen.size > 1 || slot.gebacken !== !!gebacken) this.nein('Variable \'' + name + '\' wird im selben Scope mit anderem Typ neu deklariert', n);
        slot.redekl = true;
        return vorh;
      }
      const s = this.neuerSlot(sc.fn, name, typ, gebacken);
      sc.vars.set(name, s);
      return s;
    }

    // Auflösung eines Namens als Variable (lokal/umg/global) ohne Felder; null wenn nicht gefunden.
    // modus 'lesen': komplette Kette (inkl. Felder/Global); 'aufruf': nur bis zur Grenze
    loese(name, sc, fn, n, modus) {
      let ueberLambda = false;
      for (let s = sc; s; s = s.eltern) {
        if (s.art === 'global') {
          if (modus === 'aufruf' && fn.art !== 'oben' && !this.inOben(fn)) return null;
          const g = this.globaleNamen.get(name);
          if (g === undefined) return { art: 'gname', name };
          if (fn.art !== 'oben') this.globalGenutzt.add(name);
          const sicher = !ueberLambda && fn.art === 'oben' && s.deklariert && s.deklariert.has(name);
          return { art: 'global', g, name, sicher };
        }
        const i = s.vars.get(name);
        if (i !== undefined) {
          if (s.fn === fn) return { art: 'lokal', slot: i };
          const sl = s.fn.slots[i];
          sl.zelle = true;
          return { art: 'umg', idx: this.fange(fn, s.fn, i), typName: sl.typ && !sl.typ.feld ? sl.typ.name : null, gebacken: sl.gebacken };
        }
        if (ueberLambda && s.spaeter && s.spaeter.has(name)) this.nein('Lambda greift auf \'' + name + '\' zu, das erst später deklariert wird', n);
        if (s.art === 'fn' && s.fn.art === 'lambda') ueberLambda = true;
        if (s.art === 'methode') {
          if (modus === 'aufruf') return null;
          // Felder (nur Klassenkontext)
          const feld = s.fn.klasse !== null && this.feldNamen.has(name);
          const g = this.globaleNamen.get(name);
          if (g !== undefined) this.globalGenutzt.add(name);
          if (feld) return { art: 'dyn', name, g: g === undefined ? null : g };
          if (g !== undefined) return { art: 'global', g, name, sicher: false };
          return { art: 'gname', name };
        }
      }
      return { art: 'gname', name };
    }
    inOben(fn) { for (let f = fn; f; f = f.eltern) if (f.art === 'oben') return true; return false; }
    fange(fn, ziel, slot) {
      const key = ziel.id + ':' + slot;
      let i = fn.fangKeys.get(key);
      if (i !== undefined) return i;
      const quelle = fn.eltern === ziel ? { art: 'lokal', slot } : { art: 'umg', idx: this.fange(fn.eltern, ziel, slot) };
      i = fn.fang.length;
      fn.fang.push(quelle);
      fn.fangKeys.set(key, i);
      return i;
    }

    // ---------------------------------------------------------- Programm
    baue() {
      this.vorab();
      const warnungen = analysiere(this.ast).map(w => ({ code: w.code, text: w.text, pos: this.pos({ z: w.zeile, s: w.spalte }) }));
      const startfehler = this.registriere();
      if (startfehler) {
        return { format: 'pizza-ir/1', pos: this.posListe, warnungen, startfehler, funktionen: [], klassen: [], registrierung: [], globale: [], methoden: [], vorbereiten: null, oben: null };
      }
      this.globalScope = this.neuerScope(null, null, 'global');
      this.globalScope.deklariert = new Set();
      // Klassen, Beläge, Top-Level-Methoden
      const reg = [];
      for (const r of this.registrierung) {
        switch (r.art) {
          case 'klasse': reg.push(this.klasse(r.ir)); break;
          case 'rezeptur': reg.push({ art: 'rezeptur', name: r.d.name, basen: r.d.basen.map(t => t.name) }); break;
          case 'enum': reg.push({ art: 'enum', name: r.d.name, werte: r.d.werte.map(w => w.n) }); break;
          case 'belag': reg.push(this.belag(r.d)); break;
          case 'globalfn': {
            const d = r.d;
            const fn = this.methode(d, { klasse: null }, 'methode');
            const m = { art: 'globalfn', name: d.name, fn: fn.id, nparam: d.params.length, pos: this.pos(d), mid: this.methodenListe.length, decl: d };
            d._fnId = fn.id;
            this.methodenListe.push(m);
            this.alleMethoden.push(m);
            reg.push(m);
            break;
          }
        }
      }
      // vorbereiten (Annotationen, statische Initialisierer)
      const vorb = this.vorbereiten();
      // Top-Level
      const oben = this.neueFn('oben', '<oben>', null, { klasse: null });
      const sc = this.globalScope;
      sc.fn = oben;
      const body = [];
      for (const st of this.ast.body) {
        if (DEKL.has(st.k)) continue;
        body.push(this.anw(st, sc, oben, 0, true));
      }
      oben.body = body;
      this.befoerdere(oben);
      oben.hauptgangGlobal = this.globaleNamen.has('hauptgang') ? this.globaleNamen.get('hauptgang') : null;
      // Darstellungen festlegen
      for (const fn of this.funktionen) {
        for (const s of fn.slots) {
          const t = s.typ && !s.typ.feld ? s.typ.name : null;
          s.darst = (!s.zelle && !s.weg && (t === 'salami' || t === 'funghi')) ? 'zahl' : (!s.zelle && !s.weg && t === 'diavolo') ? 'bool' : 'wert';
          delete s.typen;
        }
        for (const p of fn.params) p.darst = fn.slots[p.slot].darst;
        delete fn.fangKeys;
        delete fn.eltern;
      }
      for (const m of this.methodenListe) delete m.decl;
      // Direktaufrufe auflösen (Funktions-IDs stehen jetzt fest)
      const geh = (x) => {
        if (!x || typeof x !== 'object') return;
        if (Array.isArray(x)) { for (const y of x) geh(y); return; }
        if (x.k === 'ncall' && x.direktDecl !== undefined) { x.direkt = x.direktDecl ? x.direktDecl._fnId : null; delete x.direktDecl; }
        for (const k in x) { const v = x[k]; if (v && typeof v === 'object') geh(v); }
      };
      for (const f of this.funktionen) { geh(f.body); geh(f.ausdr); }
      return {
        format: 'pizza-ir/1', pos: this.posListe, warnungen, startfehler: null,
        registrierung: reg, methoden: this.methodenListe.map(m => ({ art: m.art, klasse: m.klasse === undefined ? null : m.klasse, name: m.name })),
        globale: Array.from(this.globaleNamen.keys()), schiebNamen: Array.from(this.schiebNamen),
        gruppen: this.gruppen(), globaleFunktionen: Array.from(this.globalFnNamen),
        funktionen: this.funktionen, vorbereiten: vorb, oben: oben.id,
        globalInfos: Object.fromEntries(Array.from(this.globalInfos ? this.globalInfos.entries() : []).map(([n, g]) => [n, { typ: g.typ, gebacken: g.gebacken }])),
      };
    }

    typIR(t) { return t && !t.feld ? t.name : null; }

    /** optionale Host-Importgruppen, die das Programm braucht (HOST-ABI §2) */
    gruppen() {
      const g = [];
      for (const t of this.neuTypen) if (THEKE.has(t) && !this.klassenNamen.has(t)) { g.push('theke'); break; }
      if (this.neuTypen.has('Vorratskammer') && !this.klassenNamen.has('Vorratskammer')) g.push('vorrat');
      return g;
    }

    /** Globale, die nur im Top-Level-Code vorkommen, werden lokale Slots von <oben> (schneller, gleiche Semantik). */
    befoerdere(oben) {
      const slots = new Map();
      const kandidat = (name) => !this.globalGenutzt.has(name) && name !== 'hauptgang' && !this.globalFnNamen.has(name);
      const slotVon = (name) => {
        let i = slots.get(name);
        if (i === undefined) {
          const gi = this.globalInfos && this.globalInfos.get(name);
          const typ = gi && gi.typ ? { name: gi.typ, feld: 0 } : null;
          i = this.neuerSlot(oben, name, typ, gi ? gi.gebacken : false);
          oben.slots[i].unbelegt = !!(gi && gi.gebacken);
          slots.set(name, i);
        }
        return i;
      };
      const geh = (x) => {
        if (!x || typeof x !== 'object') return;
        if (Array.isArray(x)) { for (const y of x) geh(y); return; }
        if (x.art === 'global' && typeof x.g === 'number' && typeof x.name === 'string' && kandidat(x.name)) {
          const deklaration = x.sicher === undefined;
          if (deklaration || x.sicher) { const slot = slotVon(x.name); for (const k of Object.keys(x)) if (k !== 'name' && k !== 'autoFallback') delete x[k]; x.art = 'lokal'; x.slot = slot; }
          else if (x.autoFallback) { /* bleibt global (Laufzeitprüfung) */ }
          else { for (const k of Object.keys(x)) if (k !== 'name') delete x[k]; x.art = 'gname'; }
          return;
        }
        for (const k in x) { const v = x[k]; if (v && typeof v === 'object') geh(v); }
      };
      geh(oben.body);
      // Zuweisungsziele, die unsicher waren (vor Deklaration): als undefiniert behandeln
      const ziele = (x) => {
        if (!x || typeof x !== 'object') return;
        if (Array.isArray(x)) { for (const y of x) ziele(y); return; }
        if ((x.k === 'zuw' || x.k === 'inc') && x.ziel && x.ziel.art === 'gname') x.ziel = { art: 'undef', name: x.ziel.name };
        if (x.k === 'schieb' && x.ref && x.ref.art === 'gname') x.ref = { art: 'gname', name: x.ref.name };
        for (const k in x) { const v = x[k]; if (v && typeof v === 'object') ziele(v); }
      };
      ziele(oben.body);
    }

    klasse(ir) {
      const d = ir.decl;
      const k = { art: 'klasse', name: d.name, idx: ir.idx, flags: (d.mods.includes('rohling') ? 1 : 0) | (d.mods.includes('gebacken') ? 2 : 0) | (d.mods.includes('calzone') ? 4 : 0),
        basis: d.basis ? d.basis.name : null, erfuellt: d.erfuellt.map(t => t.name), felder: [], methoden: [], ktoren: [], feldInit: null, statInit: null };
      const ctx = { klasse: ir.idx };
      for (const f of d.felder) {
        const statisch = f.mods.includes('tiefkühl');
        for (const dd of f.decls) k.felder.push({ name: dd.name, typ: this.typIR(f.typ), flags: (f.mods.includes('gebacken') ? 1 : 0) | (statisch ? 2 : 0), sicht: sichtbarkeit(f.mods) });
      }
      for (const md of d.methoden) {
        const statisch = md.mods.includes('tiefkühl');
        const fn = md.body ? this.methode(md, ctx, 'methode') : null;
        const m = { art: 'methode', klasse: ir.idx, name: md.name, fn: fn ? fn.id : null, flags: statisch ? 1 : 0, sicht: sichtbarkeit(md.mods), nparam: md.params.length, pos: this.pos(md), mid: this.methodenListe.length, decl: md };
        this.methodenListe.push(m);
        this.alleMethoden.push(m);
        k.methoden.push(m);
      }
      for (const kd of d.ktoren) {
        const fn = this.methode(kd, { klasse: ir.idx, ktor: true }, 'ktor');
        const m = { art: 'ktor', klasse: ir.idx, name: d.name, fn: fn.id, hatUnten: kd.body.body.some(st => st.k === 'AusdrAnw' && st.e.k === 'UntenCall'), mid: this.methodenListe.length };
        this.methodenListe.push(m);
        k.ktoren.push(m);
      }
      // Feld-Initialisierer (Instanz)
      const inits = [];
      for (const f of d.felder) {
        if (f.mods.includes('tiefkühl')) continue;
        for (const dd of f.decls) if (dd.init) inits.push({ f, dd });
      }
      if (inits.length) {
        const fn = this.neueFn('feldinit', d.name + '.<felder>', null, { klasse: ir.idx, ktor: true });
        const sc = this.neuerScope(this.globalScopeLazy(), fn, 'methode');
        fn.body = inits.map(({ f, dd }) => ({ k: 'feldinit', name: dd.name, typ: this.typIR(f.typ), e: this.ausdr(dd.init, sc, fn, 0), besitz: dd.init.k === 'Name' || dd.init.k === 'Mem', p: this.pos(dd) }));
        k.feldInit = fn.id;
      }
      const sinits = [];
      for (const f of d.felder) {
        if (!f.mods.includes('tiefkühl')) continue;
        for (const dd of f.decls) if (dd.init) sinits.push({ f, dd });
      }
      if (sinits.length) {
        const fn = this.neueFn('statinit', d.name + '.<statisch>', null, { klasse: ir.idx });
        const sc = this.neuerScope(this.globalScopeLazy(), fn, 'methode');
        fn.body = sinits.map(({ f, dd }) => ({ k: 'statinit', name: dd.name, typ: this.typIR(f.typ), e: this.ausdr(dd.init, sc, fn, 0), besitz: dd.init.k === 'Name' || dd.init.k === 'Mem', p: this.pos(dd) }));
        k.statInit = fn.id;
        (this._statInits = this._statInits || []).push(fn.id);
      }
      return k;
    }
    globalScopeLazy() { return this.globalScope; }

    belag(d) {
      const na = d.annos.find(a => a.name === 'Nach');
      let nach = null;
      if (na) {
        nach = [];
        if (na.args) for (const e of na.args.pos) { if (e.k === 'Name') nach.push(e.n); else if (e.k === 'Text') nach.push(e.v); }
      }
      const methoden = [];
      for (const md of d.methoden) {
        const fn = this.methode(md, { klasse: null, belag: true }, 'belag');
        const m = { art: 'belagm', name: md.name, fn: fn.id, mid: this.methodenListe.length, decl: md };
        this.methodenListe.push(m);
        this.alleMethoden.push(m);
        methoden.push(m);
      }
      return { art: 'belag', name: d.name, nach, methoden };
    }

    methode(md, ctx, art) {
      const fn = this.neueFn(art, md.name, null, ctx);
      const sc = this.neuerScope(this.globalScopeLazy(), fn, 'methode');
      for (const p of md.params) {
        const slot = this.deklariere(sc, p.name, p.typ, p.gebacken, p);
        fn.params.push({ name: p.name, typ: this.typIR(p.typ), nieKarton: p.nieKarton, gebacken: p.gebacken, slot });
      }
      if (md.body) {
        sc.spaeter = sammleDekl(md.body.body);
        fn.body = md.body.body.map(st => this.anw(st, sc, fn, 0));
      }
      return fn;
    }

    vorbereiten() {
      const fn = this.neueFn('init', '<vorbereiten>', null, { klasse: null });
      const sc = this.neuerScope(this.globalScopeLazy(), fn, 'methode');
      const body = [];
      for (const m of this.alleMethoden) {
        for (const a of m.decl.annos) {
          if (a.name === 'Kühlschrank') {
            let e = null;
            if (a.args) { const b = a.args.ben.find(x => x.name === 'haltbar'); e = b ? b.e : (a.args.pos[0] || null); }
            body.push({ k: 'annoHaltbar', mid: m.mid, e: e ? this.ausdr(e, sc, fn, 0) : null, p: this.pos(a) });
          } else if (a.name === 'PizzaVeraltet') {
            let e = null;
            if (a.args) { const b = a.args.ben.find(x => x.name === 'grund'); e = b ? b.e : (a.args.pos[0] || null); }
            body.push({ k: 'annoVeraltet', mid: m.mid, e: e ? this.ausdr(e, sc, fn, 0) : null, p: this.pos(a) });
          }
        }
      }
      for (const k of this.klassenIRStatInits()) body.push({ k: 'rufeInit', fn: k });
      fn.body = body;
      return fn.id;
    }
    klassenIRStatInits() { return this._statInits || []; }

    // ---------------------------------------------------------- Anweisungen
    // tf = Tiefe des umgebenden Knotens; jede Anweisung hat tf+1
    anw(n, sc, fn, tf, oben) {
      const d = tf + 1;
      const p = this.pos(n);
      switch (n.k) {
        case 'AusdrAnw': return { k: 'ausdr', p, tf: d, e: this.ausdr(n.e, sc, fn, d) };
        case 'Leer': return { k: 'leer', p, tf: d };
        case 'Var': {
          const decls = [];
          for (const dd of n.decls) {
            const init = dd.init ? this.ausdr(dd.init, sc, fn, d) : null;
            let ziel;
            if (sc.art === 'global') {
              ziel = { art: 'global', g: this.globalSlot(dd.name), name: dd.name };
              sc.deklariert.add(dd.name);
              const gs = this.globalInfo(dd.name);
              gs.typen.add(n.typ ? typKey(n.typ) : '');
              if (gs.typen.size > 1) this.nein('globale Variable \'' + dd.name + '\' mit wechselndem Typ', n);
              gs.typ = this.typIR(n.typ); gs.gebacken = n.gebacken;
            } else {
              const slot = this.deklariere(sc, dd.name, n.typ, n.gebacken, dd);
              if (!init && n.gebacken) fn.slots[slot].unbelegt = true;
              ziel = { art: 'lokal', slot };
            }
            decls.push({ name: dd.name, ziel, init, typ: this.typIR(n.typ), gebacken: !!n.gebacken, besitz: !!dd.init && (dd.init.k === 'Name' || dd.init.k === 'Mem'), std: standardWert(n.typ) });
          }
          return { k: 'var', p, tf: d, decls };
        }
        case 'Zuw': {
          const ziel = this.ziel(n.ziel, sc, fn, d);
          const wert = this.ausdr(n.wert, sc, fn, d);
          return { k: 'zuw', p, tf: d, op: n.op, ziel, wert, besitz: n.op === '=' && (n.wert.k === 'Name' || n.wert.k === 'Mem') };
        }
        case 'Inc': return { k: 'inc', p, tf: d, ziel: this.ziel(n.ziel, sc, fn, d), d: n.d };
        case 'Block': return { k: 'block', p, tf: d, body: this.block(n, sc, fn, d) };
        case 'Falls': {
          const c = this.ausdr(n.c, sc, fn, d);
          const dann = this.block(n.dann, sc, fn, d);
          let sonst = null, sonstFalls = null;
          if (n.sonst) { if (n.sonst.k === 'Block') sonst = this.block(n.sonst, sc, fn, d); else sonstFalls = this.anw(n.sonst, sc, fn, d); }
          return { k: 'falls', p, tf: d, c, dann, sonst, sonstFalls };
        }
        case 'Solange': return { k: 'solange', p, tf: d, c: this.ausdr(n.c, sc, fn, d), body: this.block(n.body, sc, fn, d) };
        case 'Fuer': {
          const s = this.neuerScope(sc, fn, 'block');
          s.spaeter = new Set(n.init && n.init.k === 'Var' ? n.init.decls.map(x => x.name) : []);
          const init = n.init ? this.anw(n.init, s, fn, d) : null;
          const c = n.c ? this.ausdr(n.c, s, fn, d) : null;
          const body = this.block(n.body, s, fn, d);
          const upd = n.upd.map(u => this.anw(u, s, fn, d));
          return { k: 'fuer', p, tf: d, init, c, body, upd };
        }
        case 'FuerJedes': {
          const quelle = this.ausdr(n.quelle, sc, fn, d);
          const s = this.neuerScope(sc, fn, 'block');
          const slot = this.deklariere(s, n.name, n.typ, false, n);
          const body = this.block(n.body, s, fn, d);
          return { k: 'fuerJedes', p, tf: d, quelle, slot, typ: this.typIR(n.typ), name: n.name, body };
        }
        case 'Waehle': {
          const subj = this.ausdr(n.subj, sc, fn, d);
          const faelle = n.faelle.map(c => {
            if (c.body.k === 'Var') this.nein('Variablendeklaration direkt als wähle-Arm', c.body);
            return {
              labels: c.labels ? c.labels.map(l => this.label(l, sc, fn, d)) : null,
              block: c.body.k === 'Block' ? this.block(c.body, sc, fn, d) : null,
              anw: c.body.k === 'Block' ? null : this.anw(c.body, sc, fn, d),
            };
          });
          return { k: 'waehle', p, tf: d, subj, faelle };
        }
        case 'Serviere': return { k: 'serviere', p, tf: d, e: n.e ? this.ausdr(n.e, sc, fn, d) : null };
        case 'Wirf': return { k: 'wirf', p, tf: d, e: this.ausdr(n.e, sc, fn, d) };
        case 'Probier': {
          const block = this.block(n.block, sc, fn, d);
          const faenge = n.faenge.map(f => this.fang(f, sc, fn, d));
          const rand = n.rand ? this.block(n.rand, sc, fn, d) : null;
          return { k: 'probier', p, tf: d, block, faenge, rand };
        }
        case 'Abbrechen': return { k: 'abbrechen', p, tf: d };
        case 'Weiter': return { k: 'weiter', p, tf: d };
        default:
          if (DEKL.has(n.k)) return { k: 'leer', p, tf: d, keinSchritt: true };
          this.nein('Anweisung ' + n.k, n);
      }
    }
    globalInfo(name) {
      if (!this.globalInfos) this.globalInfos = new Map();
      let g = this.globalInfos.get(name);
      if (!g) { g = { typen: new Set(), typ: null, gebacken: false }; this.globalInfos.set(name, g); }
      return g;
    }

    fang(f, sc, fn, d) {
      const s = this.neuerScope(sc, fn, 'block');
      const slot = this.deklariere(s, f.name, null, false, f);
      return { typ: f.typ ? f.typ.name : null, slot, block: this.block(f.block, s, fn, d) };
    }

    // Block: neuer Scope (falls Deklarationen); Anweisungen mit Tiefe d (Block selbst zählt nicht)
    block(b, sc, fn, d) {
      const s = b.d ? this.neuerScope(sc, fn, 'block') : sc;
      if (b.d) s.spaeter = sammleDekl(b.body);
      return b.body.map(st => this.anw(st, s, fn, d));
    }

    label(l, sc, fn, d) {
      const e = this.ausdr(l, sc, fn, d);
      if (l.k === 'Name') e.enumName = l.n;
      return e;
    }

    // Zuweisungsziel
    ziel(z, sc, fn, d) {
      if (z.k === 'Name') {
        const r = this.loese(z.n, sc, fn, z, 'lesen');
        if (r.art === 'gname') return { art: 'undef', name: z.n };
        return Object.assign({ name: z.n }, r);
      }
      return { art: 'mem', obj: this.ausdr(z.obj, sc, fn, d), name: z.name, p: this.pos(z) };
    }

    args(a, sc, fn, d) {
      return { pos: a.pos.map(e => this.ausdr(e, sc, fn, d)), ben: a.ben ? a.ben.map(b => ({ name: b.name, e: this.ausdr(b.e, sc, fn, d) })) : null };
    }

    // ---------------------------------------------------------- Ausdrücke
    ausdr(n, sc, fn, tf) {
      const d = EINFACH.has(n.k) ? tf : tf + 1;
      const p = this.pos(n);
      const r = this.ausdrIntern(n, sc, fn, d, p);
      r.p = p; r.tf = d; r.zus = !EINFACH.has(n.k);
      return r;
    }
    ausdrIntern(n, sc, fn, d, p) {
      switch (n.k) {
        case 'Zahl': return { k: 'konst', art: 'zahl', wert: n.v };
        case 'Dauer': return { k: 'konst', art: 'dauer', wert: n.v };
        case 'Text': return { k: 'konst', art: 'text', wert: n.v };
        case 'Bool': return { k: 'konst', art: 'bool', wert: n.v };
        case 'Karton': return { k: 'konst', art: 'karton', wert: null };
        case 'Name': return { k: 'lies', ref: this.loese(n.n, sc, fn, n, 'lesen'), name: n.n };
        case 'Bin': return { k: 'bin', op: BIN_OPS[n.op], l: this.ausdr(n.l, sc, fn, d), r: this.ausdr(n.r, sc, fn, d) };
        case 'Log': return { k: 'log', und: n.op === '&&', l: this.ausdr(n.l, sc, fn, d), r: this.ausdr(n.r, sc, fn, d) };
        case 'Un': return { k: 'un', op: n.op === '!' ? 0 : 1, e: this.ausdr(n.e, sc, fn, d) };
        case 'Tern': return { k: 'tern', c: this.ausdr(n.c, sc, fn, d), a: this.ausdr(n.a, sc, fn, d), b: this.ausdr(n.b, sc, fn, d) };
        case 'MCall':
          if (NOCH_NICHT_METHODEN.has(n.name)) this.nein('Methode ' + n.name + ' wird vom Compiler noch nicht unterstützt', n);
          if (n.obj.k === 'Unten') return { k: 'untenM', name: n.name, args: this.args(n.args, sc, fn, d) };
          {
            const obj = this.ausdr(n.obj, sc, fn, d);
            const a0 = n.args.pos.length === 1 ? n.args.pos[0] : null;
            if (n.name === 'schneide' && a0 && a0.k === 'Name' && a0.n === 'auto') {
              const r = this.loese('auto', sc, fn, a0, 'lesen');
              if (r.art === 'gname') {
                const ben = n.args.ben ? n.args.ben.map(b => ({ name: b.name, e: this.ausdr(b.e, sc, fn, d) })) : null;
                return { k: 'mcall', obj, name: n.name, args: { pos: [{ k: 'konst', art: 'auto', wert: null, p: this.pos(a0), tf: d, zus: false }], ben } };
              }
              if (r.art === 'global') {
                const ben = n.args.ben ? n.args.ben.map(b => ({ name: b.name, e: this.ausdr(b.e, sc, fn, d) })) : null;
                return { k: 'mcall', obj, name: n.name, args: { pos: [{ k: 'lies', ref: Object.assign({}, r, { autoFallback: true }), name: 'auto', p: this.pos(a0), tf: d, zus: false }], ben } };
              }
              if (r.art !== 'lokal' && r.art !== 'umg') this.nein('schneide(auto) mit möglicher Variable auto', a0);
            }
            return { k: 'mcall', obj, name: n.name, args: this.args(n.args, sc, fn, d) };
          }
        case 'NCall': return this.ncall(n, sc, fn, d);
        case 'Call': return { k: 'call', callee: this.ausdr(n.callee, sc, fn, d), args: this.args(n.args, sc, fn, d) };
        case 'Mem': return { k: 'mem', obj: this.ausdr(n.obj, sc, fn, d), name: n.name };
        case 'Dies': return { k: 'dies' };
        case 'Unten': return { k: 'unten' };
        case 'UntenCall': return { k: 'untenCall', args: this.args(n.args, sc, fn, d) };
        case 'Neu':
          if (!UNTERSTUETZTE_TYPEN.has(n.typ.name) && TYPEN_REFERENZ.has(n.typ.name) && !this.klassenNamen.has(n.typ.name)) this.nein('Typ ' + n.typ.name + ' wird vom Compiler noch nicht unterstützt', n);
          return { k: 'neu', typ: n.typ.name, args: this.args(n.args, sc, fn, d) };
        case 'PizzaLit': {
          const bl = n.belaege;
          if (bl.length === 1 && bl[0].n !== 'Ananas' && !this.belagNamen.has(bl[0].n)) {
            return { k: 'lies', ref: this.loese(bl[0].n, sc, fn, bl[0], 'lesen'), name: bl[0].n, ohneSchritt: false };
          }
          return { k: 'pizza', belaege: bl.map(b => b.n) };
        }
        case 'Blech': return { k: 'blech', elemente: n.elemente.map(e => this.ausdr(e, sc, fn, d)) };
        case 'Bereich': return { k: 'bereich', a: this.ausdr(n.a, sc, fn, d), b: this.ausdr(n.b, sc, fn, d) };
        case 'Lambda': return this.lambda(n, sc, fn);
        case 'Ofen': {
          const args = this.args(n.args, sc, fn, d);
          const body = this.block({ k: 'Block', body: n.block.body, d: true }, sc, fn, d);
          let roh = null;
          if (n.roh) {
            const s = this.neuerScope(sc, fn, 'block');
            const slot = this.deklariere(s, n.roh.name, null, false, n.roh);
            roh = { slot, body: this.block({ k: 'Block', body: n.roh.block.body, d: true }, s, fn, d) };
          }
          const faenge = n.faenge.map(f => { const s = this.neuerScope(sc, fn, 'block'); const slot = this.deklariere(s, f.name, null, false, f); return { typ: f.typ ? f.typ.name : null, slot, block: this.block({ k: 'Block', body: f.block.body, d: true }, s, fn, d) }; });
          return { k: 'ofen', args, body, roh, faenge };
        }
        case 'WaehleA': {
          const subj = this.ausdr(n.subj, sc, fn, d);
          const faelle = n.faelle.map(c => ({
            labels: c.labels ? c.labels.map(l => this.label(l, sc, fn, d)) : null,
            block: c.body.k === 'Block' ? this.block({ k: 'Block', body: c.body.body, d: true }, sc, fn, d) : null,
            e: c.body.k === 'Block' ? null : this.ausdr(c.body, sc, fn, d),
          }));
          return { k: 'waehleA', subj, faelle };
        }
      }
      this.nein('Ausdruck ' + n.k, n);
    }

    ncall(n, sc, fn, d) {
      const args = () => this.args(n.args, sc, fn, d);
      // 1. lokale Variablen bis zur Grenze
      const lok = this.loese(n.name, sc, fn, n, 'aufruf');
      if (lok && lok.art !== 'gname') return { k: 'ncall', name: n.name, ziel: { art: 'wert', ref: lok }, args: args() };
      const kontext = fn.klasse !== null || fn.belag;
      // 3. schieb
      if (n.name === 'schieb' && !this.globaleNamen.has('schieb') && !this.feldNamen.has('schieb') && !(kontext && this.methodenNamen.has('schieb'))) {
        const a = n.args.pos[0];
        if (!a || a.k !== 'Name' || n.args.pos.length !== 1) return { k: 'ncall', name: n.name, ziel: { art: 'schiebFehler' }, args: { pos: [], ben: null } };
        const r = this.loese(a.n, sc, fn, a, 'lesen');
        return { k: 'schieb', ref: r, name: a.n };
      }
      if (n.name === 'schieb') this.nein('schieb mit gleichnamiger Methode/Variable', n);
      // 2./4. Methoden des Kontexts, sonst Name als Wert
      const wert = this.loese(n.name, sc, fn, n, 'lesen');
      const r = { k: 'ncall', name: n.name, ziel: { art: kontext ? 'kontext' : 'name', ref: wert }, args: args() };
      r.direktDecl = this.direktZiel(n, wert, kontext, fn);
      return r;
    }

    /** Top-Level-Funktion statisch auflösbar? (keine Neuzuweisung, keine Überladung/Annotationen, passende Argumente) */
    direktZiel(n, ref, kontext, fn) {
      if (ref.art !== 'global' || !this.globalFnNamen.has(n.name) || this.zugewiesen.has(n.name)) return null;
      if (kontext && (this.methodenNamen.has(n.name) || (fn.belag && (PIZZA_M.has(n.name) || n.name === 'preis')))) return null;
      if (n.args.ben) return null;
      const liste = this.globalFnDecl.get(n.name) || [];
      if (!liste.length) return null;
      let d = liste[0];
      if (liste.length > 1) { const x = liste.find(m => m.params.length === n.args.pos.length); if (x) d = x; }
      if (d.params.length !== n.args.pos.length) return null;
      if (d.annos.some(a => a.name === 'Kühlschrank' || a.name === 'PizzaVeraltet')) return null;
      if (d.params.some(p => p.nieKarton)) return null;
      return d;
    }

    lambda(n, sc, fn) {
      const lf = this.neueFn('lambda', '<lambda>', fn, { klasse: fn.klasse, ktor: fn.ktor, belag: fn.belag });
      lf.hatDies = fn.hatDies;
      const s = this.neuerScope(sc, lf, 'fn');
      for (const p of n.params) {
        const slot = this.deklariere(s, p.name, p.typ, false, p);
        lf.params.push({ name: p.name, typ: this.typIR(p.typ), nieKarton: p.nieKarton, gebacken: false, slot });
      }
      if (n.ausdr) lf.ausdr = this.ausdr(n.body, s, lf, 0);
      else { s.spaeter = sammleDekl(n.body.body); lf.body = n.body.body.map(st => this.anw(st, s, lf, 0)); }
      return { k: 'lambda', fn: lf.id };
    }
  }

  function typKey(t) { return t.name + (t.feld ? '[]' + t.feld : ''); }
  function standardWert(typ) {
    if (!typ || typ.feld) return null;
    switch (typ.name) { case 'salami': case 'funghi': return 0; case 'diavolo': return false; default: return null; }
  }
  function sammleDekl(stmts) {
    const s = new Set();
    for (const st of stmts) if (st.k === 'Var') for (const d of st.decls) s.add(d.name);
    return s;
  }

  /** AST → { ok:true, ir } | { ok:false, nichtUnterstuetzt:[…] } */
  function frontend(ast) {
    const f = new Frontend(ast);
    try {
      // statische Initialisierer: Klassen-IR-Reihenfolge = klassenListe
      const ir = f.baue();
      return { ok: true, ir };
    } catch (e) {
      if (e instanceof NichtUnterstuetzt) return { ok: false, nichtUnterstuetzt: [{ zeile: e.zeile, spalte: e.spalte, grund: e.grund }] };
      throw e;
    }
  }

  return { frontend, analysiere, NichtUnterstuetzt, BIN_OPS };
});
