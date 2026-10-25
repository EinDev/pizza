/*
 * pizzaiolo – Frontend: AST (gemeinsamer Lader PizzaLang.projekt.lade) → IR (IR.md).
 * Namensauflösung (lokal / Zelle / global / dynamisch), Closure-Fänge, Schritte (st) und Stapeltiefe (tf) je Knoten.
 * Statische Warnungen (W0666, W0032 …) und die Startprüfung (Q0004, P0010, P0011, R0001, A0001, P0013, Herd-Erkennung) kommen
 * aus denselben Funktionen wie im Interpreter (PizzaLang.intern.analysiere/startpruefung, PROJEKTE PA2) – keine eigenen Ports.
 */
(function (root, fabrik) {
  'use strict';
  const api = fabrik();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else { root.PizzaioloTeile = root.PizzaioloTeile || {}; root.PizzaioloTeile.frontend = api; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // Eingebaute Ananas (SPEC §9, K-105): Reihenfolge = Laufzeit-Klassenindex 0–15 (laufzeit/src/namen.rs ANANAS_BAUM); danach die Herd-Basisklasse Kniff (16, H-K13, laufzeit/src/klassen.rs K_KNIFF); eigene Klassen ab 17.
  const ANANAS_BAUM = [
    ['Ananas', null], ['GeprüfteAnanas', 'Ananas'], ['VerbranntAnanas', 'GeprüfteAnanas'], ['LieferAnanas', 'GeprüfteAnanas'],
    ['LaufzeitAnanas', 'Ananas'], ['StreitAnanas', 'LaufzeitAnanas'], ['RechenAnanas', 'LaufzeitAnanas'],
    ['LeererKartonAnanas', 'LaufzeitAnanas'], ['RohlingAnanas', 'LaufzeitAnanas'],
    ['GebackenAnanas', 'LaufzeitAnanas'], ['TypAnanas', 'LaufzeitAnanas'], ['KeinStückAnanas', 'LaufzeitAnanas'],
    ['ZugriffsAnanas', 'LaufzeitAnanas'], ['ZugeklapptAnanas', 'LaufzeitAnanas'],
    ['UnbekanntePizzaAnanas', 'LaufzeitAnanas'], ['KüchenAnanas', 'LaufzeitAnanas']
  ];
  const KLASSEN_BASIS = ANANAS_BAUM.length + 1; // 17 (16 Ananas + Kniff)
  // eingebaute Methoden der Basisklasse Kniff (SPEC §18.4): ein unqualifizierter Aufruf in einer Klasse geht über den Kontext
  const KNIFF_NAMEN = new Set(['teil', 'start', 'takt', 'beimBetreten', 'beimVerlassen', 'beimKlick', 'beimEntfernen']);
  const THEKE = new Set(['Theke', 'Schild', 'Knopf', 'Eingabe', 'Haken', 'Stapel', 'Reihe', 'Zutat', 'Takt', 'Fortschritt', 'Abschnitt', 'Tabelle', 'Reiter', 'Auswahl', 'Tastatur', 'Zettel']);
  const UNTERSTUETZTE_TYPEN = new Set(['salami', 'funghi', 'margherita', 'diavolo', 'Dauer', 'Blech', 'Speisekarte',
    'Teig', 'Lieferung', 'Zustellung', 'Reste', 'Rohling', 'hawaii', 'Theke', 'Zutat', 'Schild', 'Knopf', 'Eingabe',
    'Haken', 'Stapel', 'Reihe', 'Takt', 'Fortschritt', 'Abschnitt', 'Tabelle', 'Reiter', 'Auswahl', 'Tastatur', 'Zettel', 'Zufall', 'Vorratskammer', 'Kniff', 'Klang', 'Spur']);
  // Eingebaute Typen der Referenz, die der Compiler noch nicht kennt → ehrlicher Fallback
  const TYPEN_REFERENZ = new Set((typeof require === 'function' && typeof module === 'object' ? (function () { try { return require('../pizza.js').TYPEN; } catch (e) { return []; } })() : ((typeof self !== 'undefined' && self.PizzaLang && self.PizzaLang.TYPEN) || [])));
  // Herd (SPEC §18): Klassennamen nur für die Importgruppe `herd` – Verhalten und Komponenten kommen zur Laufzeit
  // generisch aus dem Schema des geladenen Kerns (laufzeit/src/herd.rs), eine neue Komponente braucht hier nichts
  const HERD_TYPEN = new Set((typeof require === 'function' && typeof module === 'object' ? (function () { try { return require('../pizza.js').intern.HERD_TYPEN || []; } catch (e) { return []; } })() : ((typeof self !== 'undefined' && self.PizzaLang && self.PizzaLang.intern && self.PizzaLang.intern.HERD_TYPEN) || [])));
  const NOCH_NICHT_METHODEN = new Set();
  const DEKL = new Set(['Klasse', 'Rezeptur', 'Enum', 'Methode']);
  const EINFACH = new Set(['Zahl', 'Text', 'Bool', 'Name', 'Dauer', 'Karton', 'Dies', 'Unten', 'Lambda']);
  const BIN_OPS = { '+': 0, '-': 1, '*': 2, '/': 3, '%': 4, '==': 5, '!=': 6, '<': 7, '<=': 8, '>': 9, '>=': 10 };

  class NichtUnterstuetzt extends Error {
    constructor(grund, n) { super(grund); this.grund = grund; this.zeile = n && n.z != null ? n.z : null; this.spalte = n && n.s != null ? n.s : null; this.d = n && n.di ? n.di : 0; }
  }
  // Interpreter (für intern.analysiere/startpruefung): vom Aufrufer übergeben, sonst Node-require bzw. self.PizzaLang
  function standardPizzaLang() {
    if (typeof require === 'function' && typeof module === 'object') { try { return require('../pizza.js'); } catch (e) { /* unten */ } }
    return (typeof self !== 'undefined' && self.PizzaLang) || null;
  }

  function sichtbarkeit(mods) {
    if (mods.indexOf('geheimrezept') >= 0) return 2 - 1; // 1 = geheim
    if (mods.indexOf('familienrezept') >= 0) return 2;
    return 0;
  }
  function istGross(w) { const c = w[0]; return c !== c.toLowerCase() && c === c.toUpperCase(); }

  // ------------------------------------------------------------ Frontend
  class Frontend {
    /** kontext: { PizzaLang, warnungen (des Laders, W0004: { code, text, zeile, spalte, d }), projekt (für das IR, siehe frontend()) } */
    constructor(ast, kontext) {
      this.ast = ast;
      this.kontext = kontext || {};
      this.PL = this.kontext.PizzaLang || standardPizzaLang();
      this.posListe = [[0, 0]];
      this.posMap = new Map();
      this.funktionen = [];
      this.nicht = [];
      this.klassenIR = [];        // Laufzeit-Klassenindex = KLASSEN_BASIS + i
      this.registrierung = [];
      this.methodenListe = [];    // Laufzeit-Methoden-IDs in Registrierungsreihenfolge
      this.alleMethoden = [];     // Reihenfolge wie im Interpreter (für vorbereiten)
      this.globaleNamen = new Map(); // Name → globaler Slot
      this.schiebNamen = new Set();
      this.feldNamen = new Set();
      this.globalFnNamen = new Set();
      this.methodenNamen = new Set();
      this.zugewiesen = new Set();
      this.neuTypen = new Set();
      this.herdStatisch = new Set();   // Form.…/Herd.… (statische Herd-Module)
      this.globalGenutzt = new Set();
      this.globalFnDecl = new Map();
      this.klassenNamen = new Set();
    }

    // Positionstabelle: [zeile, spalte, datei] – datei = Datei-Index des Knotens (Feld di, PROJEKTE PA1/PA2)
    pos(n) {
      if (!n || n.z == null) return 0;
      const d = n.di || 0;
      const key = d + ':' + n.z + ':' + n.s;
      let i = this.posMap.get(key);
      if (i === undefined) { i = this.posListe.length; this.posListe.push([n.z, n.s == null ? 0 : n.s, d]); this.posMap.set(key, i); }
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
        if (n.k === 'Neu' && n.typ) this.neuTypen.add(n.typ.name);
        if ((n.k === 'MCall' || n.k === 'Mem') && n.obj && n.obj.k === 'Name' && (n.obj.n === 'Form' || n.obj.n === 'Herd' || n.obj.n === 'Bildchen' || n.obj.n === 'Modell')) this.herdStatisch.add(n.obj.n);
        if ((n.k === 'MCall' || n.k === 'Mem') && n.obj && n.obj.k === 'Name' && n.obj.n === 'Klang') this.klangStatisch = true;   // K-153: Gruppe klang
        if (n.k === 'Name' && (n.n === 'Kiste' || n.n === 'Bildchen' || n.n === 'Modell')) this.nutztKiste = true;   // Kiste/Bildchen.laden/Modell.laden: Datensegment nötig
        if ((n.k === 'MCall' || n.k === 'Mem') && (n.name === 'echt' || n.name === 'zone')) this.nutztEcht = true;   // K-154: zone_ms in Gruppe echtzeit
        if ((n.k === 'MCall' || n.k === 'Mem') && n.name === 'brigade') this.nutztBrigade = true;
        if (n.k === 'Klasse') { for (const m of n.methoden) this.methodenNamen.add(m.name); this.klassenNamen.add(n.name); }
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

    // ---------------------------------------------------------- Registrierung (Reihenfolge wie registriere() im Interpreter)
    registriere() {
      const reg = (d) => {
        switch (d.k) {
          case 'Klasse': {
            const ir = { name: d.name, decl: d, idx: KLASSEN_BASIS + this.klassenIR.length };
            this.klassenIR.push(ir);
            this.registrierung.push({ art: 'klasse', ir });
            for (const inn of d.innere) reg(inn);
            break;
          }
          case 'Rezeptur': this.registrierung.push({ art: 'rezeptur', d }); break;
          case 'Enum': this.registrierung.push({ art: 'enum', d }); break;
          case 'Methode': this.registrierung.push({ art: 'globalfn', d }); break;
        }
      };
      for (const d of this.ast.body) if (DEKL.has(d.k)) reg(d);
    }

    // ---------------------------------------------------------- Funktionen & Scopes
    neueFn(art, name, eltern, ctx) {
      const fn = {
        id: this.funktionen.length, art, name, klasse: ctx.klasse, ktor: !!ctx.ktor,
        plus1: art === 'methode' || art === 'ktor' || art === 'lambda',
        params: [], slots: [], fang: [], fangKeys: new Map(), eltern: eltern || null, body: null, ausdr: null,
        hatDies: ctx.klasse !== null, strikt: art !== 'lambda',
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
      const PL = this.PL;
      if (!PL || !PL.intern || typeof PL.intern.startpruefung !== 'function') throw new Error('pizzaiolo: PizzaLang (intern.startpruefung) fehlt');
      // Warnungen vor dem Start: zuerst W0004 des Laders, dann die statische Analyse des Interpreters (SPEC §2.5)
      const warnungen = (this.kontext.warnungen || []).concat(PL.intern.analysiere(this.ast))
        .map(w => ({ code: w.code, text: w.text, pos: this.pos({ z: w.zeile, s: w.spalte, di: w.d || 0 }) }));
      this.registriere();
      // Startprüfung des Interpreters (gleiche Funktion, gleiche Reihenfolge); danach die Teigmenge (P0020, SPEC §18.5)
      const sp = PL.intern.startpruefung(this.ast);
      this.herdPflicht = sp.herdNoetig;
      this.klangPflicht = sp.klangNoetig;
      let startfehler = null;
      if (sp.fehler) startfehler = { code: sp.fehler.code, text: sp.fehler.text, pos: this.pos({ z: sp.fehler.zeile, s: sp.fehler.spalte, di: sp.fehler.d || 0 }) };
      const projekt = this.projektIR();
      // Teigmenge (P0020, SPEC §18.5): nach Startprüfung und Herd-Kern, vor vorbereiten – wie im Interpreter (PD2)
      if (this.kontext.teigmengeFehler) projekt.spaetfehler = { code: 'P0020', text: 'PizzaFehler P0020: ' + this.kontext.teigmengeFehler };
      if (startfehler) {
        return { format: 'pizza-ir/1', pos: this.posListe, warnungen, startfehler, funktionen: [], klassen: [], registrierung: [], globale: [], methoden: [], vorbereiten: null, oben: null, projekt };
      }
      this.globalScope = this.neuerScope(null, null, 'global');
      this.globalScope.deklariert = new Set();
      // Klassen, Rezepturen, Enums, Top-Level-Methoden
      const reg = [];
      for (const r of this.registrierung) {
        switch (r.art) {
          case 'klasse': reg.push(this.klasse(r.ir)); break;
          case 'rezeptur': reg.push({ art: 'rezeptur', name: r.d.name, basen: r.d.basen.map(t => t.name) }); break;
          case 'enum': reg.push({ art: 'enum', name: r.d.name, werte: r.d.werte.map(w => w.n) }); break;
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
        gruppen: this.gruppen(), herdNoetig: this.herdNoetig(), klangNoetig: !!this.klangPflicht, globaleFunktionen: Array.from(this.globalFnNamen),
        funktionen: this.funktionen, vorbereiten: vorb, oben: oben.id,
        globalInfos: Object.fromEntries(Array.from(this.globalInfos ? this.globalInfos.entries() : []).map(([n, g]) => [n, { typ: g.typ, gebacken: g.gebacken }])),
        projekt,
      };
    }

    /** Projekt-Teil des IR (SPEC §2): Dateinamen (null = Ein-Datei-Programm), Standard-Argumente, Kiste (nur wenn das Programm
     *  `Kiste`, `Bildchen` oder `Modell` nennt – sonst ist sie unbeobachtbar) */
    projektIR() {
      const pj = this.kontext.projekt || {};
      return { dateien: pj.dateien || null, args: pj.args || [], kiste: this.nutztKiste && pj.kiste ? pj.kiste : null };
    }

    typIR(t) { return t && !t.feld ? t.name : null; }

    /** optionale Host-Importgruppen, die das Programm braucht (HOST-ABI §2) */
    gruppen() {
      const g = [];
      for (const t of this.neuTypen) if (THEKE.has(t) && !this.klassenNamen.has(t)) { g.push('theke'); break; }
      if (this.neuTypen.has('Vorratskammer') && !this.klassenNamen.has('Vorratskammer')) g.push('vorrat');
      if (this.nutztEcht) g.push('echtzeit');
      if (this.nutztBrigade) g.push('kueche');
      if (this.herdNoetig() || Array.from(this.neuTypen).some(t => HERD_TYPEN.has(t) && !this.klassenNamen.has(t))
        || Array.from(this.herdStatisch).some(t => !this.klassenNamen.has(t))) g.push('herd');
      if (this.klangPflicht || (this.klangStatisch && !this.klassenNamen.has('Klang'))) g.push('klang');   // K-153
      return g;
    }

    /** braucht den Herd-Kern vor dem Start (K-128): Ergebnis der Startprüfung des Interpreters (pruefeHerd) */
    herdNoetig() { return !!this.herdPflicht; }

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
          if (deklaration || x.sicher) { const slot = slotVon(x.name); for (const k of Object.keys(x)) if (k !== 'name') delete x[k]; x.art = 'lokal'; x.slot = slot; }
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
        fn.body = inits.map(({ f, dd }) => ({ k: 'feldinit', name: dd.name, typ: this.typIR(f.typ), e: this.ausdr(dd.init, sc, fn, 0), p: this.pos(dd) }));
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
        fn.body = sinits.map(({ f, dd }) => ({ k: 'statinit', name: dd.name, typ: this.typIR(f.typ), e: this.ausdr(dd.init, sc, fn, 0), p: this.pos(dd) }));
        k.statInit = fn.id;
        (this._statInits = this._statInits || []).push(fn.id);
      }
      return k;
    }
    globalScopeLazy() { return this.globalScope; }

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
            decls.push({ name: dd.name, ziel, init, typ: this.typIR(n.typ), gebacken: !!n.gebacken, std: standardWert(n.typ) });
          }
          return { k: 'var', p, tf: d, decls };
        }
        case 'Zuw': {
          const ziel = this.ziel(n.ziel, sc, fn, d);
          const wert = this.ausdr(n.wert, sc, fn, d);
          return { k: 'zuw', p, tf: d, op: n.op, ziel, wert };
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
        case 'Name': {
          const ref = this.loese(n.n, sc, fn, n, 'lesen');
          return { k: 'lies', ref, name: n.n };
        }
        case 'Bin': return { k: 'bin', op: BIN_OPS[n.op], l: this.ausdr(n.l, sc, fn, d), r: this.ausdr(n.r, sc, fn, d) };
        case 'Log': return { k: 'log', und: n.op === '&&', l: this.ausdr(n.l, sc, fn, d), r: this.ausdr(n.r, sc, fn, d) };
        case 'Un': return { k: 'un', op: n.op === '!' ? 0 : 1, e: this.ausdr(n.e, sc, fn, d) };
        case 'Tern': return { k: 'tern', c: this.ausdr(n.c, sc, fn, d), a: this.ausdr(n.a, sc, fn, d), b: this.ausdr(n.b, sc, fn, d) };
        case 'MCall':
          if (NOCH_NICHT_METHODEN.has(n.name)) this.nein('Methode ' + n.name + ' wird vom Compiler noch nicht unterstützt', n);
          if (n.obj.k === 'Unten') return { k: 'untenM', name: n.name, args: this.args(n.args, sc, fn, d) };
          {
            const obj = this.ausdr(n.obj, sc, fn, d);
            return { k: 'mcall', obj, name: n.name, args: this.args(n.args, sc, fn, d) };
          }
        case 'NCall': return this.ncall(n, sc, fn, d);
        case 'Call': return { k: 'call', callee: this.ausdr(n.callee, sc, fn, d), args: this.args(n.args, sc, fn, d) };
        case 'Mem': return { k: 'mem', obj: this.ausdr(n.obj, sc, fn, d), name: n.name };
        case 'Dies': return { k: 'dies' };
        case 'Unten': return { k: 'unten' };
        case 'UntenCall': return { k: 'untenCall', args: this.args(n.args, sc, fn, d) };
        case 'Neu':
          if (!UNTERSTUETZTE_TYPEN.has(n.typ.name) && !HERD_TYPEN.has(n.typ.name) && TYPEN_REFERENZ.has(n.typ.name) && !this.klassenNamen.has(n.typ.name)) this.nein('Typ ' + n.typ.name + ' wird vom Compiler noch nicht unterstützt', n);
          return { k: 'neu', typ: n.typ.name, args: this.args(n.args, sc, fn, d) };
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
      const kontext = fn.klasse !== null;
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
      if (kontext && (this.methodenNamen.has(n.name) || KNIFF_NAMEN.has(n.name))) return null;
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
      const lf = this.neueFn('lambda', '<lambda>', fn, { klasse: fn.klasse, ktor: fn.ktor });
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

  /**
   * AST (ein Programm aus PizzaLang.projekt.lade bzw. parse) → { ok:true, ir } | { ok:false, nichtUnterstuetzt:[…] }
   * kontext (optional): { PizzaLang, warnungen: Lader-Warnungen mit d, teigmengeFehler: Text | null,
   *                      projekt: { dateien: [pfad] | null, args: [text], kiste: { eintraege, daten } | null } }
   */
  function frontend(ast, kontext) {
    const f = new Frontend(ast, kontext);
    try {
      const ir = f.baue();
      return { ok: true, ir };
    } catch (e) {
      if (e instanceof NichtUnterstuetzt) {
        const pfade = ast && ast.dateiPfade;
        return { ok: false, nichtUnterstuetzt: [{ datei: pfade && e.zeile != null ? pfade[e.d] || null : null, zeile: e.zeile, spalte: e.spalte, grund: e.grund }] };
      }
      throw e;
    }
  }

  return { frontend, NichtUnterstuetzt, BIN_OPS };
});
