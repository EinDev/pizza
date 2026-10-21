/*
 * pizza v3.0 – Interpreter
 * Lexer · Parser · Tree-Walking-Laufzeit · Standardbibliothek
 * UMD ohne Abhängigkeiten: Browser/Worker → self.PizzaLang, Node → module.exports
 */
(function (root, fabrik) {
  'use strict';
  var api = fabrik();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else if (root) root.PizzaLang = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // =====================================================================
  // Konstanten
  // =====================================================================

  const VERSION = '3.0.0';

  const KEYWORDS = [
    'paket', 'import', 'klasse', 'rezeptur', 'rohling', 'calzone', 'belag', 'auf', 'quattrostagioni',
    'erbt', 'erfüllt', 'speisekarte', 'familienrezept', 'geheimrezept', 'tiefkühl', 'gebacken',
    'leer', 'neu', 'dies', 'unten', 'serviere', 'falls', 'sonst', 'für', 'solange', 'wähle', 'fall', 'standard',
    'probier', 'verbrannt', 'rand', 'wirf', 'wirft', 'abbrechen', 'weiter', 'ja', 'nein', 'karton', 'ofen', 'roh'
  ];
  const KW = new Set(KEYWORDS);

  const TYPEN = ['salami', 'funghi', 'margherita', 'diavolo', 'Dauer', 'Pizza', 'Blech', 'Speisekarte',
    'Teig', 'Lieferung', 'Zustellung', 'Stück', 'Reste', 'Rohling', 'hawaii'];

  const BUILTINS = ['Bote', 'Bestellannahme', 'Uhr', 'Mathe', 'Zufall', 'Spiegel', 'teig', 'bestelle', 'schieb', 'teile', 'zwischenstand'];

  const BELAEGE = [
    { name: 'Tomate', preis: 1.00, nach: [] },
    { name: 'Mozzarella', preis: 1.50, nach: ['Tomate'] },
    { name: 'Käse', preis: 1.00, nach: ['Tomate'] },
    { name: 'Basilikum', preis: 0.50, nach: ['Mozzarella'] },
    { name: 'Salami', preis: 1.50, nach: [] },
    { name: 'Schinken', preis: 1.50, nach: [] },
    { name: 'Pilze', preis: 1.00, nach: [] },
    { name: 'Oliven', preis: 1.00, nach: [] },
    { name: 'Zwiebeln', preis: 0.50, nach: [] },
    { name: 'Paprika', preis: 0.80, nach: [] },
    { name: 'Chili', preis: 0.50, nach: [] },
    { name: 'Peperoni', preis: 0.80, nach: [] },
    { name: 'Rucola', preis: 1.00, nach: ['Mozzarella'] },
    { name: 'Parmesan', preis: 1.20, nach: ['Tomate'] },
    { name: 'Gorgonzola', preis: 1.50, nach: ['Tomate'] },
    { name: 'Thunfisch', preis: 2.00, nach: [] },
    { name: 'Sardellen', preis: 1.80, nach: [] },
    { name: 'Artischocken', preis: 1.50, nach: [] },
    { name: 'Spinat', preis: 1.00, nach: [] },
    { name: 'Ei', preis: 0.80, nach: [] },
    { name: 'Mais', preis: 0.50, nach: [] },
    { name: 'Knoblauch', preis: 0.30, nach: [] },
    { name: 'Kapern', preis: 0.70, nach: [] },
    { name: 'Ananas', preis: null, nach: [] }
  ];
  const BELAG_TABELLE = new Map(BELAEGE.map(b => [b.name, b]));

  const ANANAS_BAUM = [
    ['Ananas', null],
    ['GeprüfteAnanas', 'Ananas'],
    ['VerbranntAnanas', 'GeprüfteAnanas'],
    ['LieferAnanas', 'GeprüfteAnanas'],
    ['LaufzeitAnanas', 'Ananas'],
    ['StreitAnanas', 'LaufzeitAnanas'],
    ['RechenAnanas', 'LaufzeitAnanas'],
    ['LeererKartonAnanas', 'LaufzeitAnanas'],
    ['RohlingAnanas', 'LaufzeitAnanas'],
    ['BesitzAnanas', 'LaufzeitAnanas'],
    ['GebackenAnanas', 'LaufzeitAnanas'],
    ['TypAnanas', 'LaufzeitAnanas'],
    ['KeinStückAnanas', 'LaufzeitAnanas'],
    ['ZugriffsAnanas', 'LaufzeitAnanas'],
    ['UnbekannterBelagAnanas', 'LaufzeitAnanas'],
    ['ZugeklapptAnanas', 'LaufzeitAnanas'],
    ['UnbekanntePizzaAnanas', 'LaufzeitAnanas']
  ];
  const ANANAS = ANANAS_BAUM.map(a => a[0]);

  const MODIFIKATOREN = new Set(['speisekarte', 'familienrezept', 'geheimrezept', 'tiefkühl', 'gebacken', 'rohling', 'calzone']);

  const PANIK_BANNER = [
    '╔══════════════════════════════════════════════╗',
    '║   🍍  PIZZA-VM KERNEL PANIC  🍍              ║',
    '║                                              ║',
    '║   Fataler Fehler: ANANAS_AUF_PIZZA           ║',
    '║   Adresse 0xPIZZA → Ofen überhitzt           ║',
    '║   Der Pizzaiolo hat den Raum verlassen.      ║',
    '║                                              ║',
    '║   Core dumped → reste.kaltepizza             ║',
    '╚══════════════════════════════════════════════╝',
    'Exit-Code: 39'
  ].join('\n');

  const STANDARD_LIMIT = 5000000;
  const MAX_STAPEL = 1500;
  const GRUNDPREIS = 5.00;

  // =====================================================================
  // LEXER
  // =====================================================================

  class SyntaxFehler {
    constructor(text, zeile, spalte, code) {
      this.text = text; this.zeile = zeile; this.spalte = spalte; this.code = code || 'P0001';
    }
  }

  const IDENT_START = /[\p{L}_]/u;
  const IDENT_REST = /[\p{L}\p{M}\p{N}_]/u;
  const ZAHL_RE = /[0-9][0-9_]*(?:\.[0-9][0-9_]*)?/y;
  const EINHEIT_RE = /(ms|min|s|h|d)(?![\p{L}\p{M}\p{N}_])/uy;
  const EINHEITEN = { ms: 1, s: 1000, min: 60000, h: 3600000, d: 86400000 };
  const OPS2 = new Set(['->', '==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '++', '--', '..']);
  const OPS1 = new Set('+-*/%<>!?:=.,;(){}[]@'.split(''));

  function lexe(q) {
    const toks = [];
    const n = q.length;
    let i = 0, z = 1, zs = 0;
    if (q.charCodeAt(0) === 0xFEFF) { i = 1; zs = 1; }
    while (i < n) {
      const c = q[i];
      if (c === '\n') { z++; i++; zs = i; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ') { i++; continue; }
      const s = i - zs + 1;
      if (c === '/' && q[i + 1] === '/') { while (i < n && q[i] !== '\n') i++; continue; }
      if (c === '/' && q[i + 1] === '*') {
        const sz = z;
        i += 2;
        while (i < n && !(q[i] === '*' && q[i + 1] === '/')) { if (q[i] === '\n') { z++; zs = i + 1; } i++; }
        if (i >= n) throw new SyntaxFehler('Kommentar /* … */ wird nie geschlossen.', sz, s);
        i += 2;
        continue;
      }
      if (c >= '0' && c <= '9') {
        ZAHL_RE.lastIndex = i;
        const m = ZAHL_RE.exec(q);
        const roh = m[0];
        const v = Number(roh.replace(/_/g, ''));
        let j = i + roh.length;
        EINHEIT_RE.lastIndex = j;
        const e = EINHEIT_RE.exec(q);
        if (e) { j += e[0].length; toks.push({ t: 'dauer', v: v * EINHEITEN[e[1]], z, s, o: i, oe: j }); }
        else toks.push({ t: 'zahl', v, z, s, o: i, oe: j });
        i = j;
        continue;
      }
      if (c === '"') {
        let j = i + 1, out = '';
        for (;;) {
          if (j >= n || q[j] === '\n') throw new SyntaxFehler('Text wird nicht geschlossen – fehlt ein \'"\'?', z, s);
          const ch = q[j];
          if (ch === '"') { j++; break; }
          if (ch === '\\') {
            const e = q[j + 1];
            if (e === 'n') out += '\n';
            else if (e === 't') out += '\t';
            else if (e === '"') out += '"';
            else if (e === '\\') out += '\\';
            else if (e === "'") out += "'";
            else if (e === 'r') out += '\r';
            else throw new SyntaxFehler('Unbekannte Escape-Sequenz \'\\' + (e === undefined ? '' : e) + '\' im Text.', z, j - zs + 1);
            j += 2;
            continue;
          }
          out += ch;
          j++;
        }
        toks.push({ t: 'text', v: out, z, s, o: i, oe: j });
        i = j;
        continue;
      }
      const cp = q.codePointAt(i);
      const ch = String.fromCodePoint(cp);
      if (IDENT_START.test(ch)) {
        let j = i + ch.length;
        while (j < n) {
          const ch2 = String.fromCodePoint(q.codePointAt(j));
          if (!IDENT_REST.test(ch2)) break;
          j += ch2.length;
        }
        const w = q.slice(i, j);
        toks.push({ t: KW.has(w) ? 'kw' : 'name', v: w, z, s, o: i, oe: j });
        i = j;
        continue;
      }
      const zwei = q.substr(i, 2);
      if (OPS2.has(zwei)) { toks.push({ t: 'op', v: zwei, z, s, o: i, oe: i + 2 }); i += 2; continue; }
      if (OPS1.has(c)) { toks.push({ t: 'op', v: c, z, s, o: i, oe: i + 1 }); i++; continue; }
      throw new SyntaxFehler('Unerwartetes Zeichen \'' + ch + '\'.', z, s);
    }
    toks.push({ t: 'eof', v: '', z, s: i - zs + 1, o: i, oe: i });
    return toks;
  }

  // =====================================================================
  // PARSER
  // =====================================================================

  function istGross(w) {
    const c = w[0];
    return c !== c.toLowerCase() && c === c.toUpperCase();
  }

  function sichtbarkeit(mods) {
    if (mods.indexOf('geheimrezept') >= 0) return 'geheimrezept';
    if (mods.indexOf('familienrezept') >= 0) return 'familienrezept';
    return null;
  }

  class Parser {
    constructor(q, toks) {
      this.q = q; this.t = toks; this.p = 0; this.keinLambda = false;
      this.ks = { schleife: false, waehle: false };
    }
    get c() { return this.t[this.p]; }
    sieh(o) { const i = this.p + o; return this.t[i < this.t.length ? i : this.t.length - 1]; }
    istOp(v, o) { const k = this.sieh(o || 0); return k.t === 'op' && k.v === v; }
    istKw(v, o) { const k = this.sieh(o || 0); return k.t === 'kw' && k.v === v; }
    nimm() { return this.t[this.p++]; }
    fehler(text, tok) { tok = tok || this.c; throw new SyntaxFehler(text, tok.z, tok.s); }
    beschreibe(tok) {
      if (tok.t === 'eof') return 'Dateiende';
      return '\'' + this.q.slice(tok.o, tok.oe) + '\'';
    }
    erwarteOp(v, wo) {
      if (this.istOp(v)) return this.nimm();
      this.fehler('Erwartet \'' + v + '\'' + (wo ? ' ' + wo : '') + ', gefunden ' + this.beschreibe(this.c));
    }
    erwarteSemi(wo) {
      if (this.istOp(';')) return this.nimm();
      const k = this.c;
      const vor = this.p > 0 ? this.t[this.p - 1] : null;
      const text = 'Erwartet \';\' ' + (wo || 'nach Anweisung') + ', gefunden ' + this.beschreibe(k);
      if (vor && vor.z !== k.z) throw new SyntaxFehler(text, vor.z, vor.s + (vor.oe - vor.o));
      throw new SyntaxFehler(text, k.z, k.s);
    }
    erwarteKw(v, wo) {
      if (this.istKw(v)) return this.nimm();
      this.fehler('Erwartet \'' + v + '\'' + (wo ? ' ' + wo : '') + ', gefunden ' + this.beschreibe(this.c));
    }
    erwarteName(wo) {
      const k = this.c;
      if (k.t === 'name') return this.nimm();
      if (k.t === 'kw') this.fehler('\'' + k.v + '\' ist ein reserviertes Wort und kann nicht als Name ' + wo + ' verwendet werden');
      this.fehler('Erwartet einen Namen ' + wo + ', gefunden ' + this.beschreibe(k));
    }
    mitKontext(schleife, waehle, fn) {
      const alt = this.ks;
      this.ks = { schleife, waehle };
      try { return fn(); } finally { this.ks = alt; }
    }

    blockPflicht(wo) {
      if (!this.istOp('{')) this.fehler('Erwartet \'{\' ' + wo + ' (Blöcke brauchen geschweifte Klammern), gefunden ' + this.beschreibe(this.c));
      return this.block();
    }

    // ---------- Programm ----------
    programm() {
      const body = [];
      while (this.c.t !== 'eof') {
        if (this.istKw('paket') || this.istKw('import')) {
          const w = this.nimm().v;
          while (!this.istOp(';') && this.c.t !== 'eof') this.p++;
          this.erwarteSemi('nach \'' + w + '\'');
          continue;
        }
        body.push(this.oberstes());
      }
      return { k: 'Programm', z: 1, s: 1, body };
    }

    oberstes() {
      const start = this.p;
      const tok = this.c;
      const annos = this.annotationen();
      const mods = this.modifikatoren();
      if (this.istKw('klasse') || this.istKw('rezeptur') || this.istKw('quattrostagioni') || this.istKw('belag')) {
        return this.typDekl(annos, mods, tok);
      }
      if (this.istOp('<')) { this.generikaUeberspringen(); return this.methode(annos, mods, tok); }
      if ((this.istKw('leer') && this.sieh(1).t === 'name') || this.siehtFunktion()) return this.methode(annos, mods, tok);
      if (annos.length || mods.length) {
        const v = this.varDekl(mods, this.c);
        this.erwarteSemi();
        return v;
      }
      this.p = start;
      return this.anweisung();
    }

    siehtFunktion() {
      const s = this.p;
      const t = this.typ(true);
      const ok = !!t && this.c.t === 'name' && this.istOp('(', 1);
      this.p = s;
      return ok;
    }

    annotationen() {
      const r = [];
      while (this.istOp('@')) {
        const tok = this.nimm();
        let name = this.erwarteName('für die Annotation').v;
        while (this.istOp('.') && this.sieh(1).t === 'name') { this.p++; name += '.' + this.nimm().v; }
        let args = null;
        if (this.istOp('(')) args = this.annoArgs();
        r.push({ name, args, z: tok.z, s: tok.s });
      }
      return r;
    }

    annoArgs() {
      this.erwarteOp('(');
      const pos = [], ben = [];
      if (!this.istOp(')')) {
        for (;;) {
          if (this.c.t === 'name' && (this.istOp(':', 1) || this.istOp('=', 1))) {
            const n = this.nimm(); this.p++;
            ben.push({ name: n.v, e: this.ausdruck() });
          } else pos.push(this.ausdruck());
          if (this.istOp(',')) { this.p++; continue; }
          break;
        }
      }
      this.erwarteOp(')', 'nach den Annotations-Argumenten');
      return { pos, ben };
    }

    modifikatoren() {
      const r = [];
      while (this.c.t === 'kw' && MODIFIKATOREN.has(this.c.v)) r.push(this.nimm().v);
      return r;
    }

    generikaUeberspringen() {
      if (!this.istOp('<')) return;
      let tiefe = 0;
      do {
        const k = this.nimm();
        if (k.t === 'eof') this.fehler('Typparameter-Liste wird nicht geschlossen', k);
        if (k.t === 'op' && k.v === '<') tiefe++;
        else if (k.t === 'op' && k.v === '>') tiefe--;
      } while (tiefe > 0);
    }

    typ(still) {
      const tok = this.c;
      if (tok.t !== 'name') {
        if (still) return null;
        this.fehler('Erwartet einen Typ, gefunden ' + this.beschreibe(tok));
      }
      this.p++;
      let name = tok.v;
      while (this.istOp('.') && this.sieh(1).t === 'name') { this.p++; name += '.' + this.nimm().v; }
      let args = null;
      if (this.istOp('<')) {
        const s = this.p;
        this.p++;
        args = [];
        if (this.istOp('>')) this.p++;
        else {
          for (;;) {
            if (this.istOp('?')) { const q = this.nimm(); args.push({ k: 'Typ', z: q.z, s: q.s, name: '?', args: null, feld: 0 }); }
            else {
              const a = this.typ(still);
              if (!a) { this.p = s; return null; }
              args.push(a);
            }
            if (this.istOp(',')) { this.p++; continue; }
            if (this.istOp('>')) { this.p++; break; }
            if (still) { this.p = s; return null; }
            this.fehler('Erwartet \'>\' oder \',\' in den Typargumenten, gefunden ' + this.beschreibe(this.c));
          }
        }
      }
      let feld = 0;
      while (this.istOp('[') && this.istOp(']', 1)) { this.p += 2; feld++; }
      return { k: 'Typ', z: tok.z, s: tok.s, name, args, feld };
    }

    istDeklStart() {
      const s = this.p;
      const t = this.typ(true);
      let ok = false;
      if (t && this.c.t === 'name') {
        const n = this.sieh(1);
        ok = n.t === 'op' && (n.v === '=' || n.v === ';' || n.v === ',');
      }
      this.p = s;
      return ok;
    }

    reserviertAlsName() {
      const s = this.p;
      const t = this.typ(true);
      let ja = false;
      if (t && this.c.t === 'kw') {
        const n = this.sieh(1);
        ja = n.t === 'op' && (n.v === '=' || n.v === ';' || n.v === ',');
      }
      if (!ja) this.p = s;
      return ja;
    }

    varDekl(mods, tok) {
      const typ = this.typ(false);
      const decls = [];
      for (;;) {
        const n = this.erwarteName('für die Variable');
        let init = null;
        if (this.istOp('=')) { this.p++; init = this.ausdruck(); }
        decls.push({ name: n.v, init, z: n.z, s: n.s });
        if (this.istOp(',')) { this.p++; continue; }
        break;
      }
      return { k: 'Var', z: tok.z, s: tok.s, typ, decls, mods, gebacken: mods.indexOf('gebacken') >= 0 };
    }

    // ---------- Typdeklarationen ----------
    typDekl(annos, mods, tok) {
      if (this.istKw('klasse')) return this.klasse(annos, mods, tok);
      if (this.istKw('rezeptur')) return this.rezeptur(annos, mods, tok);
      if (this.istKw('quattrostagioni')) return this.quattro(annos, mods, tok);
      return this.belag(annos, mods, tok);
    }

    klasse(annos, mods, tok) {
      this.p++;
      const name = this.erwarteName('für die Klasse');
      this.generikaUeberspringen();
      let basis = null;
      const erfuellt = [];
      if (this.istKw('erbt')) { this.p++; basis = this.typ(false); }
      if (this.istKw('erfüllt')) {
        this.p++;
        for (;;) { erfuellt.push(this.typ(false)); if (this.istOp(',')) { this.p++; continue; } break; }
      }
      this.erwarteOp('{', 'nach dem Klassenkopf von \'' + name.v + '\'');
      const felder = [], methoden = [], ktoren = [], innere = [];
      while (!this.istOp('}')) {
        if (this.c.t === 'eof') this.fehler('Klasse \'' + name.v + '\' wird nicht geschlossen – es fehlt \'}\'');
        if (this.istOp(';')) { this.p++; continue; }
        const mt = this.c;
        const an = this.annotationen();
        const md = this.modifikatoren();
        if (this.istKw('klasse') || this.istKw('rezeptur') || this.istKw('quattrostagioni') || this.istKw('belag')) {
          innere.push(this.typDekl(an, md, mt));
          continue;
        }
        if (this.istOp('<')) this.generikaUeberspringen();
        if (this.c.t === 'name' && this.c.v === name.v && this.istOp('(', 1)) {
          const nt = this.nimm();
          const params = this.parameter();
          const wirft = this.wirftKlausel();
          const body = this.mitKontext(false, false, () => this.blockPflicht('für den Konstruktor'));
          ktoren.push({ k: 'Ktor', z: nt.z, s: nt.s, name: nt.v, params, body, mods: md, annos: an, wirft });
          continue;
        }
        if (this.istKw('leer')) { methoden.push(this.methode(an, md, mt)); continue; }
        const s = this.p;
        this.typ(false);
        const n = this.erwarteName('für das Mitglied');
        if (this.istOp('(')) { this.p = s; methoden.push(this.methode(an, md, mt)); continue; }
        this.p = s;
        const typ = this.typ(false);
        const decls = [];
        for (;;) {
          const dn = this.erwarteName('für das Feld');
          let init = null;
          if (this.istOp('=')) { this.p++; init = this.ausdruck(); }
          decls.push({ name: dn.v, init, z: dn.z, s: dn.s });
          if (this.istOp(',')) { this.p++; continue; }
          break;
        }
        void n;
        this.erwarteSemi('nach der Felddeklaration');
        felder.push({ k: 'Feld', z: mt.z, s: mt.s, typ, decls, mods: md, annos: an });
      }
      this.p++;
      return { k: 'Klasse', z: tok.z, s: tok.s, name: name.v, nz: name.z, ns: name.s, basis, erfuellt, felder, methoden, ktoren, innere, mods, annos };
    }

    wirftKlausel() {
      const r = [];
      if (this.istKw('wirft')) {
        this.p++;
        for (;;) { r.push(this.typ(false)); if (this.istOp(',')) { this.p++; continue; } break; }
      }
      return r;
    }

    methode(annos, mods, tok) {
      return this.mitKontext(false, false, () => this.methodeIntern(annos, mods, tok));
    }

    methodeIntern(annos, mods, tok) {
      let typ = null;
      if (this.istKw('leer')) this.p++;
      else typ = this.typ(false);
      const n = this.erwarteName('für die Methode');
      const params = this.parameter();
      const wirft = this.wirftKlausel();
      let body = null;
      if (this.istOp(';')) this.p++;
      else body = this.blockPflicht('für den Rumpf der Methode \'' + n.v + '\'');
      return { k: 'Methode', z: tok.z, s: tok.s, nz: n.z, ns: n.s, name: n.v, typ, params, body, mods, annos, wirft };
    }

    parameter() {
      this.erwarteOp('(', 'für die Parameterliste');
      const r = [];
      if (!this.istOp(')')) {
        for (;;) {
          const an = this.annotationen();
          const md = this.modifikatoren();
          const typ = this.typ(false);
          const n = this.erwarteName('für den Parameter');
          r.push({
            name: n.v, typ, z: n.z, s: n.s,
            nieKarton: an.some(a => a.name === 'NieKarton'),
            gebacken: md.indexOf('gebacken') >= 0
          });
          if (this.istOp(',')) { this.p++; continue; }
          break;
        }
      }
      this.erwarteOp(')', 'nach der Parameterliste');
      return r;
    }

    rezeptur(annos, mods, tok) {
      this.p++;
      const name = this.erwarteName('für die Rezeptur');
      this.generikaUeberspringen();
      const basen = [];
      if (this.istKw('erbt')) {
        this.p++;
        for (;;) { basen.push(this.typ(false)); if (this.istOp(',')) { this.p++; continue; } break; }
      }
      this.erwarteOp('{', 'nach dem Kopf der Rezeptur');
      const methoden = [];
      while (!this.istOp('}')) {
        if (this.c.t === 'eof') this.fehler('Rezeptur \'' + name.v + '\' wird nicht geschlossen – es fehlt \'}\'');
        if (this.istOp(';')) { this.p++; continue; }
        const mt = this.c;
        const an = this.annotationen();
        const md = this.modifikatoren();
        if (this.istOp('<')) this.generikaUeberspringen();
        methoden.push(this.methode(an, md, mt));
      }
      this.p++;
      return { k: 'Rezeptur', z: tok.z, s: tok.s, name: name.v, basen, methoden, mods, annos };
    }

    quattro(annos, mods, tok) {
      this.p++;
      const name = this.erwarteName('für quattrostagioni');
      this.erwarteOp('{', 'nach dem Namen von quattrostagioni');
      const werte = [];
      while (!this.istOp('}') && !this.istOp(';')) {
        const n = this.erwarteName('für einen quattrostagioni-Wert');
        werte.push({ n: n.v, z: n.z, s: n.s });
        if (this.istOp(',')) { this.p++; continue; }
        if (!this.istOp('}') && !this.istOp(';')) this.fehler('Erwartet \',\' oder \'}\' in quattrostagioni, gefunden ' + this.beschreibe(this.c));
      }
      if (this.istOp(';')) this.p++;
      this.erwarteOp('}', 'am Ende von quattrostagioni');
      return { k: 'Enum', z: tok.z, s: tok.s, name: name.v, werte, mods, annos };
    }

    belag(annos, mods, tok) {
      this.p++;
      const name = this.erwarteName('für den Belag');
      let auf = null;
      if (this.istKw('auf')) { this.p++; auf = this.typ(false); }
      this.erwarteOp('{', 'nach dem Kopf des Belags');
      const methoden = [];
      while (!this.istOp('}')) {
        if (this.c.t === 'eof') this.fehler('Belag \'' + name.v + '\' wird nicht geschlossen – es fehlt \'}\'');
        if (this.istOp(';')) { this.p++; continue; }
        const mt = this.c;
        const an = this.annotationen();
        const md = this.modifikatoren();
        methoden.push(this.methode(an, md, mt));
      }
      this.p++;
      return { k: 'Belag', z: tok.z, s: tok.s, name: name.v, auf, methoden, mods, annos };
    }

    // ---------- Anweisungen ----------
    block() {
      const tok = this.erwarteOp('{');
      const body = [];
      let d = false;
      while (!this.istOp('}')) {
        if (this.c.t === 'eof') this.fehler('Erwartet \'}\' – der Block aus Zeile ' + tok.z + ' wird nie geschlossen');
        const st = this.anweisung();
        if (st.k === 'Var') d = true;
        body.push(st);
      }
      this.p++;
      return { k: 'Block', z: tok.z, s: tok.s, body, d };
    }

    anweisung() {
      const tok = this.c;
      if (tok.t === 'op') {
        if (tok.v === '{') return this.block();
        if (tok.v === ';') { this.p++; return { k: 'Leer', z: tok.z, s: tok.s }; }
        if (tok.v === '@') {
          this.annotationen();
          const md = this.modifikatoren();
          const v = this.varDekl(md, tok);
          this.erwarteSemi();
          return v;
        }
      }
      if (tok.t === 'kw') {
        switch (tok.v) {
          case 'falls': return this.falls();
          case 'solange': {
            this.p++;
            this.erwarteOp('(', 'nach \'solange\'');
            const c = this.ausdruck();
            this.erwarteOp(')', 'nach der Bedingung');
            const body = this.mitKontext(true, false, () => this.blockPflicht('nach der solange-Bedingung'));
            return { k: 'Solange', z: tok.z, s: tok.s, c, body };
          }
          case 'für': return this.fuer();
          case 'wähle': return this.waehle(false);
          case 'serviere': return this.serviere();
          case 'wirf': {
            this.p++;
            const e = this.ausdruck();
            this.erwarteSemi('nach \'wirf …\'');
            return { k: 'Wirf', z: tok.z, s: tok.s, e };
          }
          case 'probier': return this.probier();
          case 'abbrechen':
            if (!this.ks.schleife && !this.ks.waehle) throw new SyntaxFehler('\'abbrechen\' steht außerhalb einer Schleife.', tok.z, tok.s, 'P0012');
            this.p++; this.erwarteSemi('nach \'abbrechen\''); return { k: 'Abbrechen', z: tok.z, s: tok.s };
          case 'weiter':
            if (!this.ks.schleife) throw new SyntaxFehler('\'weiter\' steht außerhalb einer Schleife.', tok.z, tok.s, 'P0012');
            this.p++; this.erwarteSemi('nach \'weiter\''); return { k: 'Weiter', z: tok.z, s: tok.s };
          case 'sonst': this.fehler('\'sonst\' ohne vorheriges \'falls\'');
          // falls through
          case 'verbrannt': case 'rand': this.fehler('\'' + tok.v + '\' ohne vorheriges \'probier { … }\'');
          // falls through
          case 'fall': case 'standard': this.fehler('\'' + tok.v + '\' ist nur innerhalb von \'wähle\' erlaubt');
          // falls through
          case 'klasse': case 'rezeptur': case 'quattrostagioni': case 'belag':
            this.fehler('\'' + tok.v + '\' darf nur auf oberster Ebene oder in einer Klasse stehen');
          // falls through
          default:
            if (MODIFIKATOREN.has(tok.v)) {
              const md = this.modifikatoren();
              const v = this.varDekl(md, tok);
              this.erwarteSemi();
              return v;
            }
        }
      }
      if (tok.t === 'name' && this.reserviertAlsName()) this.fehler('\'' + this.c.v + '\' ist ein reserviertes Wort und kann nicht als Name für die Variable verwendet werden', this.c);
      if (tok.t === 'name' && this.istDeklStart()) {
        const v = this.varDekl([], tok);
        this.erwarteSemi();
        return v;
      }
      const st = this.einfacheAnweisung();
      this.erwarteSemi();
      return st;
    }

    einfacheAnweisung() {
      const tok = this.c;
      if (this.istOp('++') || this.istOp('--')) {
        this.p++;
        const ziel = this.postfix();
        this.pruefeZiel(ziel, tok);
        return { k: 'Inc', z: tok.z, s: tok.s, ziel, d: tok.v === '++' ? 1 : -1 };
      }
      const e = this.ausdruck();
      const c = this.c;
      if (c.t === 'op') {
        if (c.v === '=' || c.v === '+=' || c.v === '-=' || c.v === '*=' || c.v === '/=') {
          this.pruefeZiel(e, c);
          this.p++;
          const wert = this.ausdruck();
          return { k: 'Zuw', z: tok.z, s: tok.s, op: c.v, ziel: e, wert };
        }
        if (c.v === '++' || c.v === '--') {
          this.pruefeZiel(e, c);
          this.p++;
          return { k: 'Inc', z: tok.z, s: tok.s, ziel: e, d: c.v === '++' ? 1 : -1 };
        }
      }
      return { k: 'AusdrAnw', z: tok.z, s: tok.s, e };
    }

    pruefeZiel(e, tok) {
      if (e.k !== 'Name' && e.k !== 'Mem') this.fehler('Hier kann nichts zugewiesen werden – links von \'' + tok.v + '\' muss eine Variable oder ein Feld stehen', tok);
    }

    falls() {
      const tok = this.nimm();
      this.erwarteOp('(', 'nach \'falls\'');
      const c = this.ausdruck();
      this.erwarteOp(')', 'nach der Bedingung');
      const dann = this.blockPflicht('nach der falls-Bedingung');
      let sonst = null;
      if (this.istKw('sonst')) {
        this.p++;
        if (this.istKw('falls')) sonst = this.falls();
        else sonst = this.blockPflicht('nach \'sonst\'');
      }
      return { k: 'Falls', z: tok.z, s: tok.s, c, dann, sonst };
    }

    fuer() {
      const tok = this.nimm();
      this.erwarteOp('(', 'nach \'für\'');
      const s = this.p;
      let typ = null, nameTok = null;
      if (this.c.t === 'name' && this.istOp(':', 1)) nameTok = this.nimm();
      else {
        const t = this.typ(true);
        if (t && this.c.t === 'name' && this.istOp(':', 1)) { typ = t; nameTok = this.nimm(); }
        else this.p = s;
      }
      if (nameTok) {
        this.p++;
        const quelle = this.ausdruck();
        this.erwarteOp(')', 'nach der Quelle der für-Schleife');
        const body = this.mitKontext(true, false, () => this.blockPflicht('nach dem für-Kopf'));
        return { k: 'FuerJedes', z: tok.z, s: tok.s, typ, name: nameTok.v, nz: nameTok.z, ns: nameTok.s, quelle, body };
      }
      let init = null;
      if (!this.istOp(';')) {
        if (this.c.t === 'kw' && MODIFIKATOREN.has(this.c.v)) { const md = this.modifikatoren(); init = this.varDekl(md, this.c); }
        else if (this.c.t === 'name' && this.istDeklStart()) init = this.varDekl([], this.c);
        else init = this.einfacheAnweisung();
      }
      this.erwarteSemi('nach dem Start der für-Schleife');
      const c = this.istOp(';') ? null : this.ausdruck();
      this.erwarteSemi('nach der Bedingung der für-Schleife');
      const upd = [];
      if (!this.istOp(')')) {
        for (;;) { upd.push(this.einfacheAnweisung()); if (this.istOp(',')) { this.p++; continue; } break; }
      }
      this.erwarteOp(')', 'am Ende des für-Kopfs');
      const body = this.mitKontext(true, false, () => this.blockPflicht('nach dem für-Kopf'));
      return { k: 'Fuer', z: tok.z, s: tok.s, init, c, upd, body };
    }

    waehle(alsAusdruck) {
      const tok = this.nimm();
      this.erwarteOp('(', 'nach \'wähle\'');
      const alt = this.keinLambda;
      this.keinLambda = false;
      const subj = this.ausdruck();
      this.erwarteOp(')', 'nach dem wähle-Wert');
      this.erwarteOp('{', 'nach \'wähle (…)\'');
      const faelle = [];
      while (!this.istOp('}')) {
        const ft = this.c;
        let labels = null;
        if (this.istKw('fall')) {
          this.p++;
          labels = [];
          this.keinLambda = true;
          for (;;) { labels.push(this.ausdruck()); if (this.istOp(',')) { this.p++; continue; } break; }
          this.keinLambda = false;
        } else if (this.istKw('standard')) this.p++;
        else this.fehler('Erwartet \'fall\' oder \'standard\' in \'wähle\', gefunden ' + this.beschreibe(this.c));
        this.erwarteOp('->', 'nach ' + (labels ? 'den fall-Werten' : '\'standard\''));
        let body;
        if (alsAusdruck) {
          if (this.istOp('{')) body = this.mitKontext(false, false, () => this.block());
          else {
            body = this.ausdruck();
            if (this.istOp(';') || this.istOp(',')) this.p++;
            else if (!this.istOp('}')) this.erwarteSemi('nach dem fall-Wert');
          }
        } else body = this.mitKontext(this.ks.schleife, true, () => this.anweisung());
        faelle.push({ labels, body, z: ft.z, s: ft.s });
      }
      this.p++;
      this.keinLambda = alt;
      return { k: alsAusdruck ? 'WaehleA' : 'Waehle', z: tok.z, s: tok.s, subj, faelle };
    }

    serviere() {
      const tok = this.nimm();
      if (this.istOp(';')) { this.p++; return { k: 'Serviere', z: tok.z, s: tok.s, e: null }; }
      if (!this.istOp('(')) {
        const st = this.c;
        let src;
        try {
          this.ausdruck();
          src = this.q.slice(st.o, this.t[this.p - 1].oe);
        } catch (e) {
          src = this.q.slice(st.o, st.oe);
        }
        throw new SyntaxFehler('Klammerpflicht! serviere braucht Klammern: serviere (' + src + ');', tok.z, tok.s, 'K0001');
      }
      const e = this.ausdruck();
      this.erwarteSemi('nach \'serviere (…)\'');
      return { k: 'Serviere', z: tok.z, s: tok.s, e };
    }

    probier() {
      const tok = this.nimm();
      const block = this.blockPflicht('nach \'probier\'');
      const faenge = [];
      while (this.istKw('verbrannt')) faenge.push(this.fang());
      let rand = null;
      if (this.istKw('rand')) { this.p++; rand = this.blockPflicht('nach \'rand\''); }
      if (!faenge.length && !rand) this.fehler('Nach \'probier { … }\' fehlt ein \'verbrannt (…) { … }\' oder \'rand { … }\'');
      return { k: 'Probier', z: tok.z, s: tok.s, block, faenge, rand };
    }

    fang() {
      const tok = this.nimm();
      this.erwarteOp('(', 'nach \'verbrannt\'');
      let typ = null, name;
      if (this.c.t === 'name' && this.istOp(')', 1)) name = this.nimm();
      else { typ = this.typ(false); name = this.erwarteName('für die gefangene Ananas'); }
      this.erwarteOp(')', 'nach dem Fang-Parameter');
      const block = this.blockPflicht('nach \'verbrannt (…)\'');
      return { typ, name: name.v, nz: name.z, ns: name.s, block, z: tok.z, s: tok.s };
    }

    // ---------- Ausdrücke ----------
    ausdruck() { return this.ternaer(); }

    ternaer() {
      const c = this.oder();
      if (this.istOp('?')) {
        const t = this.nimm();
        const alt = this.keinLambda;
        this.keinLambda = false;
        const a = this.ausdruck();
        this.keinLambda = alt;
        this.erwarteOp(':', 'im ?:-Ausdruck');
        const b = this.ternaer();
        return { k: 'Tern', z: t.z, s: t.s, c, a, b };
      }
      return c;
    }

    oder() {
      let l = this.und();
      while (this.istOp('||')) { const t = this.nimm(); const r = this.und(); l = { k: 'Log', z: t.z, s: t.s, op: '||', l, r }; }
      return l;
    }
    und() {
      let l = this.gleichheit();
      while (this.istOp('&&')) { const t = this.nimm(); const r = this.gleichheit(); l = { k: 'Log', z: t.z, s: t.s, op: '&&', l, r }; }
      return l;
    }
    gleichheit() {
      let l = this.vergleich();
      while (this.istOp('==') || this.istOp('!=')) { const t = this.nimm(); const r = this.vergleich(); l = { k: 'Bin', z: t.z, s: t.s, op: t.v, l, r }; }
      return l;
    }
    vergleich() {
      let l = this.summe();
      while (this.istOp('<') || this.istOp('<=') || this.istOp('>') || this.istOp('>=')) { const t = this.nimm(); const r = this.summe(); l = { k: 'Bin', z: t.z, s: t.s, op: t.v, l, r }; }
      return l;
    }
    summe() {
      let l = this.produkt();
      while (this.istOp('+') || this.istOp('-')) { const t = this.nimm(); const r = this.produkt(); l = { k: 'Bin', z: t.z, s: t.s, op: t.v, l, r }; }
      return l;
    }
    produkt() {
      let l = this.unaer();
      while (this.istOp('*') || this.istOp('/') || this.istOp('%')) { const t = this.nimm(); const r = this.unaer(); l = { k: 'Bin', z: t.z, s: t.s, op: t.v, l, r }; }
      return l;
    }
    unaer() {
      if (this.istOp('!') || this.istOp('-')) {
        const t = this.nimm();
        const e = this.unaer();
        if (t.v === '-' && (e.k === 'Zahl')) return { k: 'Zahl', z: t.z, s: t.s, v: -e.v };
        if (t.v === '-' && (e.k === 'Dauer')) return { k: 'Dauer', z: t.z, s: t.s, v: -e.v };
        return { k: 'Un', z: t.z, s: t.s, op: t.v, e };
      }
      return this.postfix();
    }

    postfix() {
      let e = this.primaer();
      for (;;) {
        if (this.istOp('.')) {
          this.p++;
          const nt = this.c;
          if (nt.t !== 'name') this.fehler('Erwartet einen Namen nach \'.\', gefunden ' + this.beschreibe(nt));
          this.p++;
          if (this.istOp('(')) {
            const args = this.argumente();
            e = { k: 'MCall', z: nt.z, s: nt.s, obj: e, name: nt.v, args };
          } else e = { k: 'Mem', z: nt.z, s: nt.s, obj: e, name: nt.v };
          continue;
        }
        if (this.istOp('(')) {
          const args = this.argumente();
          if (e.k === 'Name') e = { k: 'NCall', z: e.z, s: e.s, name: e.n, args };
          else e = { k: 'Call', z: e.z, s: e.s, callee: e, args };
          continue;
        }
        break;
      }
      return e;
    }

    argumente() {
      const tok = this.erwarteOp('(');
      const alt = this.keinLambda;
      this.keinLambda = false;
      const pos = [], ben = [];
      if (!this.istOp(')')) {
        for (;;) {
          if (this.c.t === 'name' && this.istOp(':', 1)) {
            const n = this.nimm(); this.p++;
            ben.push({ name: n.v, e: this.ausdruck() });
          } else {
            if (ben.length) this.fehler('Positionsargumente müssen vor benannten Argumenten stehen');
            pos.push(this.ausdruck());
          }
          if (this.istOp(',')) { this.p++; continue; }
          break;
        }
      }
      if (!this.istOp(')')) this.fehler('Erwartet \')\' oder \',\' in der Argumentliste (geöffnet in Zeile ' + tok.z + '), gefunden ' + this.beschreibe(this.c));
      this.p++;
      this.keinLambda = alt;
      return { pos, ben: ben.length ? ben : null };
    }

    primaer() {
      const t = this.c;
      switch (t.t) {
        case 'zahl': this.p++; return { k: 'Zahl', z: t.z, s: t.s, v: t.v };
        case 'dauer': this.p++; return { k: 'Dauer', z: t.z, s: t.s, v: t.v };
        case 'text': this.p++; return { k: 'Text', z: t.z, s: t.s, v: t.v };
        case 'name':
          if (!this.keinLambda && this.istOp('->', 1)) return this.lambda();
          this.p++;
          return { k: 'Name', z: t.z, s: t.s, n: t.v };
        case 'kw':
          switch (t.v) {
            case 'ja': case 'nein': this.p++; return { k: 'Bool', z: t.z, s: t.s, v: t.v === 'ja' };
            case 'karton': this.p++; return { k: 'Karton', z: t.z, s: t.s };
            case 'dies': this.p++; return { k: 'Dies', z: t.z, s: t.s };
            case 'unten':
              this.p++;
              if (this.istOp('(')) { const args = this.argumente(); return { k: 'UntenCall', z: t.z, s: t.s, args }; }
              return { k: 'Unten', z: t.z, s: t.s };
            case 'neu': return this.neu();
            case 'ofen': return this.ofen();
            case 'wähle': return this.waehle(true);
          }
          this.fehler('Erwartet einen Ausdruck, gefunden das reservierte Wort \'' + t.v + '\'');
          break;
        case 'op':
          if (t.v === '(') return this.klammer();
          if (t.v === '[') return this.blechLit();
          break;
      }
      this.fehler('Erwartet einen Ausdruck, gefunden ' + this.beschreibe(t));
    }

    passendeKlammer(i) {
      let tiefe = 0;
      for (let j = i; j < this.t.length; j++) {
        const k = this.t[j];
        if (k.t !== 'op') { if (k.t === 'eof') return -1; continue; }
        if (k.v === '(') tiefe++;
        else if (k.v === ')') { tiefe--; if (tiefe === 0) return j; }
      }
      return -1;
    }

    pizzaLiteral() {
      const s = this.p;
      const t0 = this.t[s];
      let i = s + 2;
      const op = (j, v) => { const k = this.t[j]; return k && k.t === 'op' && k.v === v; };
      if (op(i, ')') && op(i + 1, ')')) {
        this.p = i + 2;
        return { k: 'PizzaLit', z: t0.z, s: t0.s, belaege: [] };
      }
      const namen = [];
      for (;;) {
        const k = this.t[i];
        if (!k || k.t !== 'name' || !istGross(k.v)) return null;
        namen.push({ n: k.v, z: k.z, s: k.s });
        i++;
        if (op(i, ',')) { i++; continue; }
        break;
      }
      if (op(i, ')') && op(i + 1, ')')) {
        this.p = i + 2;
        return { k: 'PizzaLit', z: t0.z, s: t0.s, belaege: namen };
      }
      return null;
    }

    klammer() {
      if (this.istOp('(', 1)) {
        const lit = this.pizzaLiteral();
        if (lit) return lit;
      }
      if (!this.keinLambda) {
        const ende = this.passendeKlammer(this.p);
        if (ende >= 0) {
          const nach = this.t[ende + 1];
          if (nach && nach.t === 'op' && nach.v === '->') return this.lambda();
        }
      }
      const t = this.nimm();
      const alt = this.keinLambda;
      this.keinLambda = false;
      const e = this.ausdruck();
      this.keinLambda = alt;
      if (!this.istOp(')')) {
        let hinweis = '';
        if (this.istOp(',') && e.k === 'Name' && istGross(e.n)) hinweis = ' – Hinweis: Pizza-Literal im Aufruf braucht drei Klammern: f(((A, B)))';
        this.fehler('Erwartet \')\' zum Schließen der Klammer aus Zeile ' + t.z + ', gefunden ' + this.beschreibe(this.c) + hinweis);
      }
      this.p++;
      return e;
    }

    lambda() {
      return this.mitKontext(false, false, () => this.lambdaIntern());
    }

    lambdaIntern() {
      const t = this.c;
      const params = [];
      if (t.t === 'name') {
        this.p++;
        params.push({ name: t.v, typ: null, z: t.z, s: t.s, nieKarton: false, gebacken: false });
      } else {
        this.p++;
        if (!this.istOp(')')) {
          for (;;) {
            const an = this.annotationen();
            this.modifikatoren();
            let typ = null, n;
            if (this.c.t === 'name' && (this.istOp(',', 1) || this.istOp(')', 1))) n = this.nimm();
            else { typ = this.typ(false); n = this.erwarteName('für den Lambda-Parameter'); }
            params.push({ name: n.v, typ, z: n.z, s: n.s, nieKarton: an.some(a => a.name === 'NieKarton'), gebacken: false });
            if (this.istOp(',')) { this.p++; continue; }
            break;
          }
        }
        this.erwarteOp(')', 'nach den Lambda-Parametern');
      }
      this.erwarteOp('->', 'im Lambda');
      const alt = this.keinLambda;
      this.keinLambda = false;
      let r;
      if (this.istOp('{')) r = { k: 'Lambda', z: t.z, s: t.s, params, body: this.block(), ausdr: false };
      else r = { k: 'Lambda', z: t.z, s: t.s, params, body: this.ausdruck(), ausdr: true };
      this.keinLambda = alt;
      return r;
    }

    blechLit() {
      const t = this.nimm();
      const alt = this.keinLambda;
      this.keinLambda = false;
      let r;
      if (this.istOp(']')) { this.p++; r = { k: 'Blech', z: t.z, s: t.s, elemente: [] }; }
      else {
        const a = this.ausdruck();
        if (this.istOp('..')) {
          this.p++;
          const b = this.ausdruck();
          this.erwarteOp(']', 'am Ende des Bereichs');
          r = { k: 'Bereich', z: t.z, s: t.s, a, b };
        } else {
          const el = [a];
          while (this.istOp(',')) { this.p++; if (this.istOp(']')) break; el.push(this.ausdruck()); }
          if (!this.istOp(']')) this.fehler('Erwartet \']\' oder \',\' im Blech (geöffnet in Zeile ' + t.z + '), gefunden ' + this.beschreibe(this.c));
          this.p++;
          r = { k: 'Blech', z: t.z, s: t.s, elemente: el };
        }
      }
      this.keinLambda = alt;
      return r;
    }

    neu() {
      const t = this.nimm();
      const typ = this.typ(false);
      if (!this.istOp('(')) this.fehler('Erwartet \'(\' nach \'neu ' + typ.name + '\', gefunden ' + this.beschreibe(this.c));
      const args = this.argumente();
      return { k: 'Neu', z: t.z, s: t.s, typ, args };
    }

    ofen() {
      const t = this.nimm();
      let args = { pos: [], ben: null };
      if (this.istOp('(')) args = this.argumente();
      return this.mitKontext(false, false, () => this.ofenRest(t, args));
    }

    ofenRest(t, args) {
      const block = this.blockPflicht('nach \'ofen(…)\'');
      let roh = null;
      if (this.istKw('roh')) {
        const rt = this.nimm();
        this.erwarteOp('(', 'nach \'roh\'');
        const n = this.erwarteName('für den roh-Zweig');
        this.erwarteOp(')', 'nach dem roh-Parameter');
        roh = { name: n.v, nz: n.z, ns: n.s, block: this.blockPflicht('nach \'roh (…)\''), z: rt.z, s: rt.s };
      }
      const faenge = [];
      while (this.istKw('verbrannt')) faenge.push(this.fang());
      return { k: 'Ofen', z: t.z, s: t.s, args, block, roh, faenge };
    }
  }

  function parseIntern(q) {
    const toks = lexe(q);
    const p = new Parser(q, toks);
    return p.programm();
  }

  function parse(quelltext) {
    const q = quelltext == null ? '' : String(quelltext);
    try {
      return { ok: true, ast: parseIntern(q) };
    } catch (e) {
      if (e instanceof SyntaxFehler) {
        return { ok: false, fehler: { code: e.code, text: 'PizzaFehler ' + e.code + ': ' + e.text, zeile: e.zeile, spalte: e.spalte } };
      }
      if (e instanceof RangeError) {
        return { ok: false, fehler: { code: 'P0001', text: 'PizzaFehler P0001: Der Quelltext ist zu tief verschachtelt.', zeile: null, spalte: null } };
      }
      return { ok: false, fehler: { code: 'P0001', text: 'PizzaFehler P0001: Interner Parserfehler: ' + (e && e.message), zeile: null, spalte: null } };
    }
  }

  // =====================================================================
  // STATISCHE ANALYSE (Warnungen vor dem Start: W0666, W0032)
  // =====================================================================

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

  // =====================================================================
  // LAUFZEIT – Werte, Signale, Scopes
  // =====================================================================

  class Dauer { constructor(ms) { this.ms = ms; } }
  class Pizza { constructor(s) { this.schichten = s; this.uebrig = 8; } }
  class PizzaSicht { constructor(p, k) { this.pizza = p; this.k = k; } }
  class BelagDef {
    constructor(name, preis, nach) { this.name = name; this.preis = preis; this.nach = nach; this.methoden = null; }
  }
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
  class NativFn { constructor(name, fn) { this.name = name; this.fn = fn; } }
  class Modul { constructor(name, methoden, felder) { this.name = name; this.methoden = methoden; this.felder = felder; } }
  class Teig { constructor(fn) { this.fn = fn; this.fertig = false; this.wert = null; this.auf = false; } }
  class Lieferung {
    constructor(fn, nr) { this.fn = fn; this.nr = nr; this.trinkgeld = 0; this.zustellung = null; this.rueckruf = null; }
  }
  class Zustellung { constructor(p, w, f) { this.puenktlich = p; this.wert = w; this.fehler = f; } }
  class Stueck { constructor(p) { this.pizza = p; this.gegessen = false; } }
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

  const BRK = { brk: 1 }, CNT = { cnt: 1 }, RET = { ret: 1 };
  const DEKL = new Set(['Klasse', 'Rezeptur', 'Enum', 'Belag', 'Methode']);

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

  function pizzaText(s, k) {
    const n = [];
    for (let i = 0; i < k; i++) n.push(s[i].name);
    return '((' + n.join(', ') + '))';
  }

  function runde2(x) { return Math.round(x * 100) / 100; }

  function rundeAuf(x, n) {
    if (!n) return Math.sign(x) * Math.round(Math.abs(x));
    const f = Math.pow(10, n);
    const r = Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9) / f;
    return Object.is(r, -0) ? 0 : r;
  }

  function euroText(x) {
    const r = Math.round(Math.abs(x) * 100 + 1e-9) / 100;
    const [g, k] = r.toFixed(2).split('.');
    return (x < 0 && r !== 0 ? '-' : '') + g + ',' + k + ' €';
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

  // =====================================================================
  // STANDARDBIBLIOTHEK – Methodentabellen (this = Laufzeit)
  // =====================================================================

  function arg(pos, ben, i, name) {
    if (i < pos.length) return pos[i];
    if (ben !== null && name in ben) return ben[name];
    return undefined;
  }

  const ZAHL_M = tabelle({
    'euro': function (x) { return euroText(x); },
    'runden': function (x, pos, ben) { const n = arg(pos, ben, 0, 'stellen'); return rundeAuf(x, n === undefined ? 0 : this.ganzzahl(n, 'runden')); },
    'abs': function (x) { return Math.abs(x); },
    'alsText': function (x) { return zahlText(x); },
    'ganz': function (x) { const r = Math.trunc(x); return Object.is(r, -0) ? 0 : r; }
  });

  const BOOL_M = tabelle({
    'alsText': function (b) { return b ? 'ja' : 'nein'; }
  });

  const TEXT_M = tabelle({
    'länge': function (s) { return Array.from(s).length; },
    'groß': function (s) { return s.toUpperCase(); },
    'klein': function (s) { return s.toLowerCase(); },
    'enthält': function (s, pos) { return s.includes(this.text(pos[0])); },
    'zerlege': function (s, pos) {
      const t = pos.length ? this.text(pos[0]) : '';
      return t === '' ? Array.from(s) : s.split(t);
    },
    'ersetze': function (s, pos) { return s.split(this.text(pos[0])).join(this.text(pos[1])); },
    'trimme': function (s) { return s.trim(); },
    'zeichen': function (s, pos) {
      const z = Array.from(s);
      const i = pos[0];
      if (typeof i !== 'number' || !Number.isInteger(i) || i < 1 || i > z.length) {
        throw this.ananas('KeinStückAnanas', 'Zeichen ' + this.text(i) + ' gibt es nicht – der Text hat ' + z.length + ' Zeichen.');
      }
      return z[i - 1];
    },
    'wiederhole': function (s, pos) { const n = this.ganzzahl(pos[0], 'wiederhole'); if (n < 0) throw this.ananas('RechenAnanas', 'Negativ oft wiederholen? Das geht nicht.'); return s.repeat(n); },
    'beginntMit': function (s, pos) { return s.startsWith(this.text(pos[0])); },
    'endetMit': function (s, pos) { return s.endsWith(this.text(pos[0])); },
    'alsZahl': function (s) {
      const v = zahlAusText(s);
      if (v === null) throw this.ananas('TypAnanas', '"' + s + '" ist keine Zahl.');
      return v;
    },
    'alsText': function (s) { return s; },
    'istLeer': function (s) { return s.length === 0; }
  });

  const DAUER_M = tabelle({
    'inMs': function (d) { return d.ms; },
    'inSekunden': function (d) { return d.ms / 1000; },
    'inMinuten': function (d) { return d.ms / 60000; },
    'alsText': function (d) { return dauerText(d.ms); }
  });

  const BLECH_M = tabelle({
    'länge': function (b) { return b.length; },
    'stück': function (b, pos) { return b[this.index(b, pos[0]) - 1]; },
    'hinzu': function (b, pos) { b.push(pos.length ? pos[0] : null); return b; },
    'entferne': function (b, pos) { const i = this.index(b, pos[0]); return b.splice(i - 1, 1)[0]; },
    'setze': function (b, pos) { const i = this.index(b, pos[0]); b[i - 1] = pos.length > 1 ? pos[1] : null; return b; },
    'enthält': function (b, pos) { for (const x of b) if (this.gleich(x, pos[0])) return true; return false; },
    'belege': function (b, pos, ben, node) {
      const f = pos[0];
      const r = new Array(b.length);
      for (let i = 0; i < b.length; i++) r[i] = this.rufe(f, [b[i]], null, node);
      return r;
    },
    'filtere': function (b, pos, ben, node) {
      const f = pos[0];
      const r = [];
      for (let i = 0; i < b.length; i++) if (this.bool(this.rufe(f, [b[i]], null, node))) r.push(b[i]);
      return r;
    },
    'zusammenklappen': function (b, pos, ben, node) {
      const f = pos[0];
      let i = 0, acc;
      const start = arg(pos, ben, 1, 'start');
      if (start !== undefined) acc = start;
      else { if (b.length === 0) return null; acc = b[0]; i = 1; }
      for (; i < b.length; i++) acc = this.rufe(f, [acc, b[i]], null, node);
      return acc;
    },
    'summe': function (b, pos, ben, node) {
      if (b.length && b[0] instanceof Dauer) {
        let s = 0;
        for (const x of b) s += x.ms;
        return new Dauer(s);
      }
      let s = 0;
      for (const x of b) { if (typeof x !== 'number') throw this.ananas('TypAnanas', 'summe() geht nur mit Zahlen, aber im Blech liegt ' + this.darstellung(x) + '.'); s += x; }
      return s;
    },
    'erstes': function (b) { if (!b.length) throw this.ananas('KeinStückAnanas', 'Das Blech ist leer – kein Stück da.'); return b[0]; },
    'letztes': function (b) { if (!b.length) throw this.ananas('KeinStückAnanas', 'Das Blech ist leer – kein Stück da.'); return b[b.length - 1]; },
    'umdrehen': function (b) { return b.slice().reverse(); },
    'sortiere': function (b, pos, ben, node) {
      const f = pos[0];
      if (f !== undefined && f !== null) {
        return b.slice().sort((x, y) => { const r = this.rufe(f, [x, y], null, node); if (typeof r !== 'number') throw this.ananas('TypAnanas', 'Die Sortierfunktion muss eine Zahl liefern.'); return r; });
      }
      return b.slice().sort((x, y) => this.vergleiche(x, y));
    },
    'verbinde': function (b, pos) {
      const t = pos.length ? this.text(pos[0]) : '';
      return b.map(x => this.text(x)).join(t);
    },
    'istLeer': function (b) { return b.length === 0; },
    'schneide': function (b, pos, ben, node) {
      let n = pos[0];
      if (n === AUTO || n === undefined) n = 8;
      n = this.ganzzahl(n, 'schneide');
      if (n < 1) throw this.ananas('StreitAnanas', 'In ' + n + ' Stücke schneiden? Das geht nicht.');
      if (n === 7) this.warnung('S0007', '7 Stücke? Wer schneidet eine Pizza in 7 Stücke?', node);
      return this.schneide(b, n);
    },
    'kopie': function (b) { return b.slice(); },
    'alsText': function (b) { return this.text(b); }
  });

  const KARTE_M = tabelle({
    'lege': function (m, pos) { m.set(this.schluessel(pos[0]), pos.length > 1 ? pos[1] : null); return m; },
    'hole': function (m, pos) { const k = this.schluessel(pos[0]); return m.has(k) ? m.get(k) : null; },
    'hat': function (m, pos) { return m.has(this.schluessel(pos[0])); },
    'entferne': function (m, pos) { const k = this.schluessel(pos[0]); const v = m.has(k) ? m.get(k) : null; m.delete(k); return v; },
    'schlüssel': function (m) { return Array.from(m.keys()); },
    'werte': function (m) { return Array.from(m.values()); },
    'länge': function (m) { return m.size; },
    'istLeer': function (m) { return m.size === 0; },
    'alsText': function (m) { return this.text(m); }
  });

  const BELAG_M = tabelle({
    'name': function (b) { return b.name; },
    'preis': function (b) { return this.standardPreis(b); },
    'alsText': function (b) { return b.name; }
  });

  const ENUM_M = tabelle({
    'name': function (e) { return e.name; },
    'position': function (e) { return e.pos; },
    'alsText': function (e) { return e.name; }
  });

  const PIZZA_M = tabelle({
    'beläge': function (p, k) { const r = []; for (let i = 0; i < k; i++) r.push(p.schichten[i].name); return r; },
    'hat': function (p, k, pos) {
      const x = pos[0];
      const name = x instanceof BelagDef ? x.name : this.text(x);
      for (let i = 0; i < k; i++) if (p.schichten[i].name === name) return true;
      return false;
    },
    'anzahlBeläge': function (p, k) { return k; },
    'alsText': function (p, k) { return pizzaText(p.schichten, k); },
    'übrig': function (p) { return p.uebrig; },
    'beschreibung': function () { return 'Teig'; }
  });

  const ANANAS_M = tabelle({
    'nachricht': function (o) { return o.nachricht; },
    'holeNachricht': function (o) { return o.nachricht; },
    'typ': function (o) { return o.klasse.name; },
    'alsText': function (o) { return o.klasse.name + ': ' + o.nachricht; }
  });

  const OBJ_M = tabelle({
    'alsText': function (o) { return o.klasse.name + '@' + o.nr; },
    'aufklappen': function (o, pos, ben, node) {
      if (!this.istCalzone(o.klasse)) throw this.ananas('LaufzeitAnanas', 'Nur eine Calzone lässt sich aufklappen – \'' + o.klasse.name + '\' ist keine.');
      this.warnung('W0013', 'Garantie erloschen. Das ist jetzt eine ganz normale Pizza.', node);
      o.zugeklappt = false;
      return o;
    }
  });

  const TEIG_M = tabelle({
    'gehenlassen': function (t, pos, ben, node) {
      if (!t.fertig) { t.wert = this.rufe(t.fn, [], null, node); t.fertig = true; }
      t.auf = true;
      return t;
    },
    'backen': function (t, pos, ben, node) {
      if (!t.auf) this.warnung('T0007', 'Teig wird gebacken, ohne gehen gelassen worden zu sein. Das schmeckt flach.', node);
      if (!t.fertig) { t.wert = this.rufe(t.fn, [], null, node); t.fertig = true; }
      return t.wert;
    },
    'istAufgegangen': function (t) { return t.auf; },
    'alsText': function (t) { return this.text(t); }
  });

  const LIEF_M = tabelle({
    'trinkgeld': function (l, pos) {
      const n = pos[0];
      if (typeof n !== 'number') throw this.ananas('TypAnanas', 'Trinkgeld muss eine Zahl sein, nicht ' + this.darstellung(n) + '.');
      l.trinkgeld += n;
      return l;
    },
    'warte': function (l, pos, ben, node) {
      if (l.zustellung !== null) return l.zustellung;
      const max = arg(pos, ben, 0, 'max');
      let budget = Infinity;
      if (max !== undefined && max !== null) budget = Math.floor(this.dauerMs(max, 'warte(max: …)') * (1 + l.trinkgeld / 10));
      const z = this.liefere(l, budget, node);
      if (l.rueckruf !== null && z.puenktlich && z.fehler === null) this.rufe(l.rueckruf, [z.wert], null, node);
      return z;
    },
    'wennDa': function (l, pos, ben, node) {
      l.rueckruf = pos[0];
      if (l.zustellung !== null && l.zustellung.puenktlich && l.zustellung.fehler === null) this.rufe(l.rueckruf, [l.zustellung.wert], null, node);
      return l;
    },
    'istGeliefert': function (l) { return l.zustellung !== null; },
    'alsText': function (l) { return this.text(l); }
  });

  const ZUST_M = tabelle({
    'pünktlich': function (z) { return z.puenktlich; },
    'wert': function (z) {
      if (z.fehler !== null) throw z.fehler;
      if (!z.puenktlich) throw this.ananas('LieferAnanas', 'Zu spät – die Pizza ist kalt.');
      return z.wert;
    },
    'oderGratis': function (z, pos) {
      if (z.fehler !== null) throw z.fehler;
      if (!z.puenktlich) return pos.length ? pos[0] : null;
      return z.wert;
    },
    'alsText': function (z) { return this.text(z); }
  });

  const STUECK_M = tabelle({
    'pizza': function (s) { return s.pizza; },
    'essen': function (s) {
      if (s.gegessen) throw this.ananas('StreitAnanas', 'Dieses Stück ist schon gegessen.');
      s.gegessen = true;
      return null;
    },
    'istGegessen': function (s) { return s.gegessen; },
    'alsText': function (s) { return this.text(s); }
  });

  const RESTE_M = tabelle({
    'wert': function (r) { return r.wert; },
    'istMatschig': function (r) { return r.matschig; },
    'alsText': function (r) { return this.text(r); }
  });

  const ROH_M = tabelle({
    'teilergebnis': function (r) { return r.teil; },
    'verbrauchteZeit': function (r) { return r.zeit; },
    'alsText': function (r) { return this.text(r); }
  });

  const FN_M = tabelle({
    'mikrowelle': function (f, pos, ben, node) {
      if (f instanceof Gebunden) return this.rufeDecl(this.waehle(f.liste, this.anzahl(pos, ben)), f.obj, pos, ben, node, 'mikrowelle');
      return new Reste(this.rufe(f, pos, ben, node), false);
    },
    'frisch': function (f, pos, ben, node) {
      if (f instanceof Gebunden) return this.rufeDecl(this.waehle(f.liste, this.anzahl(pos, ben)), f.obj, pos, ben, node, 'frisch');
      return this.rufe(f, pos, ben, node);
    },
    'rufe': function (f, pos, ben, node) { return this.rufe(f, pos, ben, node); },
    'alsText': function () { return '<Funktion>'; }
  });

  const BOTE_M = tabelle({
    'schreibe': function (m, pos) { this.emit({ typ: 'ausgabe', text: pos.map(x => this.text(x)).join(' '), umbruch: false }); return null; },
    'leeren': function () { this.emit({ typ: 'leeren' }); return null; },
    'sage': function (m, pos) { this.emit({ typ: 'ausgabe', text: pos.map(x => this.text(x)).join(' ') }); return null; },
    'fehler': function (m, pos) { this.emit({ typ: 'fehlerausgabe', text: pos.map(x => this.text(x)).join(' ') }); return null; }
  });

  const EINGABE_M = tabelle({
    'lies': function () { return this.liesZeile(null, 'zeile'); },
    'frage': function (m, pos, ben) { const t = arg(pos, ben, 0, 'text'); return this.liesZeile(t === undefined ? '' : this.text(t), 'zeile'); },
    'liesZahl': function (m, pos, ben) { return this.alsEingabeZahl(this.liesZeile(null, 'zahl'), arg(pos, ben, 0, 'ersatz')); },
    'frageZahl': function (m, pos, ben) {
      const t = arg(pos, ben, 0, 'text');
      return this.alsEingabeZahl(this.liesZeile(t === undefined ? '' : this.text(t), 'zahl'), arg(pos, ben, 1, 'ersatz'));
    },
    'hatMehr': function () {
      if (this.eingabeEof) return false;
      if (this.onEingabe !== null) return true;
      return this.eingabe !== null && this.eingabePos < this.eingabe.length && this.eingabe[this.eingabePos] !== null;
    }
  });

  const UHR_M = tabelle({
    'jetzt': function () { return new Dauer(this.schritte + this.offset); },
    'vorspulen': function (m, pos) {
      const ms = Math.round(this.dauerMs(pos[0], 'Uhr.vorspulen'));
      if (ms < 0) throw this.ananas('RechenAnanas', 'Die Uhr lässt sich nicht zurückdrehen.');
      this.offset += ms;
      this.neuGrenze();
      if (this.schritte > this.grenze) this.grenzeErreicht();
      return null;
    }
  });

  const MATHE_M = tabelle({
    'wurzel': function (m, pos) { return Math.sqrt(this.zahl(pos[0], 'wurzel')); },
    'max': function (m, pos) { if (!pos.length) throw this.ananas('RechenAnanas', 'max() ohne Zahlen?'); return Math.max.apply(null, pos.map(x => this.zahl(x, 'max'))); },
    'min': function (m, pos) { if (!pos.length) throw this.ananas('RechenAnanas', 'min() ohne Zahlen?'); return Math.min.apply(null, pos.map(x => this.zahl(x, 'min'))); },
    'abs': function (m, pos) { return Math.abs(this.zahl(pos[0], 'abs')); },
    'runden': function (m, pos) { return rundeAuf(this.zahl(pos[0], 'runden'), pos.length > 1 ? this.ganzzahl(pos[1], 'runden') : 0); },
    'boden': function (m, pos) { return Math.floor(this.zahl(pos[0], 'boden')); },
    'decke': function (m, pos) { return Math.ceil(this.zahl(pos[0], 'decke')); },
    'potenz': function (m, pos) { return Math.pow(this.zahl(pos[0], 'potenz'), this.zahl(pos[1], 'potenz')); }
  });

  const ZUFALL_M = tabelle({
    'zahl': function (m, pos) {
      let a = this.ganzzahl(pos[0], 'Zufall.zahl'), b = this.ganzzahl(pos[1], 'Zufall.zahl');
      if (a > b) { const t = a; a = b; b = t; }
      return a + Math.floor(this.zufall() * (b - a + 1));
    }
  });

  const SPIEGEL_M = tabelle({
    'felder': function (m, pos) {
      const o = pos[0];
      if (o === null || o === undefined) throw this.leer();
      if (!(o instanceof Obj)) throw this.ananas('TypAnanas', 'Spiegel.felder braucht ein Objekt, nicht ' + this.darstellung(o) + '.');
      if (o.zugeklappt) throw this.ananas('ZugeklapptAnanas', 'Die Calzone ist zu. Nutze aufklappen().');
      const r = new Map();
      for (const [k, v] of o.felder) r.set(k, v.w);
      return r;
    }
  });

  const TABELLEN = new Map([
    [Dauer, DAUER_M], [BelagDef, BELAG_M], [EnumWert, ENUM_M], [Teig, TEIG_M], [Lieferung, LIEF_M],
    [Zustellung, ZUST_M], [Stueck, STUECK_M], [Reste, RESTE_M], [OfenRoh, ROH_M],
    [Funktion, FN_M], [Gebunden, FN_M], [NativFn, FN_M]
  ]);

  // =====================================================================
  // LAUFZEIT – Interpreter
  // =====================================================================

  class Laufzeit {
    constructor(ast, opt, emit) {
      this.ast = ast;
      this.emit = emit;
      this.limit = typeof opt.schrittLimit === 'number' && opt.schrittLimit > 0 ? opt.schrittLimit : STANDARD_LIMIT;
      this.args = Array.isArray(opt.args) ? opt.args.map(String) : [];
      this.onEingabe = typeof opt.onEingabe === 'function' ? opt.onEingabe : null;
      this.eingabe = Array.isArray(opt.eingabe) ? opt.eingabe.map(x => x == null ? null : String(x)) : null;
      this.eingabePos = 0;
      this.eingabeEof = false;
      this.schritte = 0;
      this.offset = 0;
      this.frames = [];
      this.grenze = this.limit;
      this.klassen = new Map();
      this.klassenListe = [];
      this.alleMethoden = [];
      this.belaege = new Map();
      this.warnSet = new Set();
      this.lieferungen = [];
      this.lieferNr = 0;
      this.rueck = null;
      this.z = null;
      this.s = null;
      this.st = 0;
      this.instanzen = 0;
      this.zufall = mulberry32(42);
      this.globalCtx = { dies: null, klasse: null, unten: null, ktor: false };
      this.global = new Scope(null, this.globalCtx, true);
      this.globalCache = { cache: null };
      for (const b of BELAEGE) this.belaege.set(b.name, new BelagDef(b.name, b.preis === null ? 0 : b.preis, b.nach.slice()));
      for (const [name, basis] of ANANAS_BAUM) {
        const k = new Klasse(name, null);
        k.basis = basis ? this.klassen.get(basis) : null;
        k.eingebaut = true;
        this.klassen.set(name, k);
      }
      this.klassen.get('Ananas').nativKtor = (o, pos) => {
        o.nachricht = pos.length && pos[0] !== null && pos[0] !== undefined ? this.text(pos[0]) : '';
      };
      this.ananasWurzel = this.klassen.get('Ananas');
      const L = this;
      this.globals = new Map([
        ['Bote', new Modul('Bote', BOTE_M, null)],
        ['Bestellannahme', new Modul('Bestellannahme', EINGABE_M, null)],
        ['Uhr', new Modul('Uhr', UHR_M, null)],
        ['Mathe', new Modul('Mathe', MATHE_M, { PI: Math.PI })],
        ['Zufall', new Modul('Zufall', ZUFALL_M, null)],
        ['Spiegel', new Modul('Spiegel', SPIEGEL_M, null)],
        ['teig', new NativFn('teig', function (pos) { return new Teig(L.funktionArg(pos[0], 'teig')); })],
        ['bestelle', new NativFn('bestelle', function (pos) {
          const l = new Lieferung(L.funktionArg(pos[0], 'bestelle'), ++L.lieferNr);
          L.lieferungen.push(l);
          return l;
        })],
        ['teile', new NativFn('teile', function (pos) {
          const p = pos[0];
          if (p === null || p === undefined) throw L.leer();
          if (!(p instanceof Pizza)) throw L.ananas('TypAnanas', 'teile() braucht eine Pizza, nicht ' + L.darstellung(p) + '.');
          if (p.uebrig <= 0) throw L.ananas('StreitAnanas', 'Pizza ist alle.');
          p.uebrig--;
          return new Stueck(p);
        })],
        ['zwischenstand', new NativFn('zwischenstand', function (pos) {
          for (let i = L.frames.length - 1; i >= 0; i--) {
            if (L.frames[i].art === 'ofen') { L.frames[i].zwischen = pos.length ? pos[0] : null; break; }
          }
          return null;
        })],
        ['schieb', new NativFn('schieb', function () {
          throw L.ananas('LaufzeitAnanas', 'schieb braucht einen Variablennamen: schieb(p).');
        })]
      ]);
    }

    // ---------- Hilfen ----------
    warnung(code, text, node, schluessel) {
      const z = node ? node.z : this.z, s = node ? node.s : this.s;
      const key = schluessel || (code + ':' + z + ':' + s);
      if (this.warnSet.has(key)) return;
      this.warnSet.add(key);
      this.emit({ typ: 'warnung', code, text: code + ': ' + text, zeile: z == null ? null : z, spalte: s == null ? null : s });
    }

    ananas(typ, text) {
      const k = this.klassen.get(typ);
      const o = new Obj(k, ++k.zaehler);
      o.nachricht = text;
      return new AnanasWurf(o, this.z, this.s);
    }
    leer() { return this.ananas('LeererKartonAnanas', 'Der Karton ist leer.'); }
    weggeschoben(name) { return this.ananas('LeererKartonAnanas', '\'' + name + '\' wurde weggeschoben – der Karton ist leer.'); }
    besitz() { return this.ananas('BesitzAnanas', 'Eine Pizza kann nicht an zwei Tischen gleichzeitig sein. Nutze schieb(p) oder teile(p).'); }
    stapel() { return this.ananas('LaufzeitAnanas', 'Zu viele Pizzen übereinander (Stapelüberlauf).'); }
    panik() { return new PanikSig(); }

    normalisiere(e) {
      if (e instanceof RangeError && /call stack|too much recursion|stack/i.test(e.message)) {
        const w = this.stapel();
        return w;
      }
      return e;
    }

    typName(v) {
      if (v === null || v === undefined) return 'karton';
      switch (typeof v) {
        case 'number': return Number.isInteger(v) ? 'salami' : 'funghi';
        case 'string': return 'margherita';
        case 'boolean': return 'diavolo';
      }
      if (Array.isArray(v)) return 'Blech';
      if (v instanceof Map) return 'Speisekarte';
      if (v instanceof Dauer) return 'Dauer';
      if (v instanceof Pizza || v instanceof PizzaSicht) return 'Pizza';
      if (v instanceof BelagDef) return 'Belag';
      if (v instanceof Obj) return v.klasse.name;
      if (v instanceof EnumWert) return v.typ.name;
      if (v instanceof Klasse || v instanceof EnumTyp || v instanceof Rezeptur) return 'Klasse ' + v.name;
      if (v instanceof Modul) return v.name;
      if (v instanceof Funktion || v instanceof Gebunden || v instanceof NativFn) return 'Funktion';
      if (v instanceof Teig) return 'Teig';
      if (v instanceof Lieferung) return 'Lieferung';
      if (v instanceof Zustellung) return 'Zustellung';
      if (v instanceof Stueck) return 'Stück';
      if (v instanceof Reste) return 'Reste';
      if (v instanceof OfenRoh) return 'Rohling';
      return 'Unbekanntes';
    }

    darstellung(v) {
      if (typeof v === 'string') return '"' + v + '"';
      const st0 = this.st;
      try { return this.text(v); } catch (e) { this.st = st0; return this.typName(v); }
    }

    zahl(v, wo) {
      if (typeof v !== 'number') throw this.ananas('TypAnanas', wo + ' braucht eine Zahl, nicht ' + this.darstellung(v) + '.');
      return v;
    }
    ganzzahl(v, wo) {
      if (typeof v !== 'number' || !Number.isInteger(v)) throw this.ananas('TypAnanas', wo + ' braucht eine Ganzzahl, nicht ' + this.darstellung(v) + '.');
      return v;
    }
    dauerMs(v, wo) {
      if (v instanceof Dauer) return v.ms;
      if (typeof v === 'number') return v;
      throw this.ananas('TypAnanas', wo + ' braucht eine Dauer, nicht ' + this.darstellung(v) + '.');
    }
    bool(v) {
      if (v === true || v === false) return v;
      throw this.ananas('TypAnanas', 'Erwartet diavolo (ja/nein), bekam ' + this.darstellung(v) + '.');
    }
    funktionArg(f, wo) {
      if (f instanceof Funktion || f instanceof Gebunden || f instanceof NativFn) return f;
      throw this.ananas('TypAnanas', wo + '() braucht eine Funktion, z. B. () -> (42).');
    }
    index(b, i) {
      if (typeof i !== 'number' || !Number.isInteger(i) || i < 1 || i > b.length) {
        throw this.ananas('KeinStückAnanas', 'Stück ' + this.text(i) + ' gibt es nicht – das Blech hat ' + b.length + ' Stück' + (b.length === 1 ? '' : 'e') + '.');
      }
      return i;
    }
    schluessel(k) {
      if (k instanceof BelagDef) return k.name;
      return k === undefined ? null : k;
    }
    anzahl(pos, ben) {
      if (ben === null) return pos.length;
      let n = pos.length;
      for (const k in ben) n++;
      return n;
    }
    schneide(b, n) {
      const len = b.length, basis = Math.floor(len / n), extra = len % n;
      const r = [];
      let i = 0;
      for (let j = 0; j < n; j++) {
        const g = basis + (j < extra ? 1 : 0);
        r.push(b.slice(i, i + g));
        i += g;
      }
      return r;
    }
    istCalzone(k) {
      for (let c = k; c; c = c.basis) if (c.calzone) return true;
      return false;
    }
    istAnanasKlasse(k) {
      for (let c = k; c; c = c.basis) if (c === this.ananasWurzel) return true;
      return false;
    }

    // ---------- Eingabe ----------
    liesZeile(prompt, art) {
      if (prompt !== null) this.emit({ typ: 'ausgabe', text: prompt, umbruch: false });
      let zeile = null;
      if (this.eingabeEof) { /* EOF ist endgültig (K-042) */ }
      else if (this.onEingabe !== null) {
        try { zeile = this.onEingabe({ prompt, art }); } catch (e) { zeile = null; }
        if (zeile === undefined) zeile = null;
      } else if (this.eingabe !== null && this.eingabePos < this.eingabe.length) {
        zeile = this.eingabe[this.eingabePos++];
      }
      if (zeile !== null) zeile = String(zeile).replace(/\r?\n$/, '');
      else this.eingabeEof = true;
      this.emit({ typ: 'eingabe', text: zeile });
      return zeile;
    }

    alsEingabeZahl(zeile, ersatz) {
      if (zeile === null) return ersatz === undefined ? null : ersatz;
      const v = zahlAusText(zeile);
      if (v === null) throw this.ananas('TypAnanas', '\'' + zeile + '\' ist keine Zahl.');
      return v;
    }

    // ---------- Schritte & Budgets ----------
    neuGrenze() {
      let g = this.limit;
      const fr = this.frames;
      for (let i = 0; i < fr.length; i++) {
        const f = fr[i];
        if (!f.tot) { const x = f.ende - this.offset; if (x < g) g = x; }
      }
      this.grenze = g;
    }
    grenzeErreicht() {
      if (this.schritte > this.limit) throw new LimitSig();
      const uhr = this.schritte + this.offset;
      const fr = this.frames;
      for (let i = 0; i < fr.length; i++) {
        const f = fr[i];
        if (!f.tot && uhr > f.ende) {
          for (let j = i; j < fr.length; j++) fr[j].tot = true;
          this.neuGrenze();
          throw new BudgetSig(f);
        }
      }
      this.neuGrenze();
    }
    pushFrame(art, budget) {
      const f = { art, ende: this.schritte + this.offset + budget, zwischen: null, tot: false };
      this.frames.push(f);
      this.neuGrenze();
      return f;
    }
    popFrame(f) {
      const i = this.frames.lastIndexOf(f);
      if (i >= 0) this.frames.splice(i, 1);
      this.neuGrenze();
    }

    // ---------- Programmstart ----------
    start() {
      const body = this.ast.body;
      for (const d of body) if (DEKL.has(d.k)) this.registriere(d);
      this.pruefe();
      this.vorbereiten();
      for (const st of body) {
        if (DEKL.has(st.k)) continue;
        const r = this.fuehre(st, this.global);
        if (r === RET) break;
      }
      let haupt = null;
      for (const k of this.klassenListe) {
        const l = k.methoden.get('hauptgang');
        if (l) { haupt = l[0]; break; }
      }
      if (!haupt) {
        const v = this.global.vars.get('hauptgang');
        if (v && v.w instanceof Gebunden) haupt = v.w.liste[0];
      }
      if (haupt) {
        this.z = haupt.decl.z; this.s = haupt.decl.s;
        const pos = haupt.params.length ? [this.args.slice()] : [];
        const dies = haupt.statisch || haupt.klasse === null ? null : this.instanziiere(haupt.klasse, [], null, null);
        this.rufeDecl(haupt, dies, pos, null, null, 'normal');
      }
      this.lieferungenNachEnde();
    }

    lieferungenNachEnde() {
      for (;;) {
        const offen = this.lieferungen.filter(l => l.rueckruf !== null && l.zustellung === null);
        if (!offen.length) break;
        offen.sort((a, b) => b.trinkgeld - a.trinkgeld || a.nr - b.nr);
        const l = offen[0];
        const v = this.rufe(l.fn, [], null, null);
        l.zustellung = new Zustellung(true, v, null);
        this.rufe(l.rueckruf, [v], null, null);
      }
    }

    registriere(d) {
      switch (d.k) {
        case 'Klasse': {
          const k = new Klasse(d.name, d);
          k.rohling = d.mods.indexOf('rohling') >= 0;
          k.gebacken = d.mods.indexOf('gebacken') >= 0;
          k.calzone = d.mods.indexOf('calzone') >= 0;
          for (const f of d.felder) {
            const info = { typ: f.typ, decls: f.decls, gebacken: f.mods.indexOf('gebacken') >= 0, sicht: sichtbarkeit(f.mods) };
            if (f.mods.indexOf('tiefkühl') >= 0) {
              k.statischeFelder.push(info);
              for (const dd of f.decls) {
                const v = new Var(standardWert(f.typ), f.typ, info.gebacken);
                v.mod = info.sicht; v.klasse = k;
                k.statisch.set(dd.name, v);
              }
            } else k.felder.push(info);
          }
          for (const md of d.methoden) {
            const m = new Methode(md, k);
            this.alleMethoden.push(m);
            const l = k.methoden.get(m.name);
            if (l) l.push(m); else k.methoden.set(m.name, [m]);
          }
          for (const kd of d.ktoren) {
            const m = new Methode(kd, k);
            m.statisch = false;
            m.hatUnten = kd.body.body.some(st => st.k === 'AusdrAnw' && st.e.k === 'UntenCall');
            k.ktoren.push(m);
          }
          this.klassen.set(d.name, k);
          this.klassenListe.push(k);
          for (const inn of d.innere) this.registriere(inn);
          break;
        }
        case 'Rezeptur': {
          const r = new Rezeptur(d.name, d);
          r.methoden = d.methoden.map(m => m.name);
          this.klassen.set(d.name, r);
          break;
        }
        case 'Enum': {
          const e = new EnumTyp(d.name);
          d.werte.forEach((w, i) => { const ew = new EnumWert(e, w.n, i + 1); e.werte.push(ew); e.nachName.set(w.n, ew); });
          this.klassen.set(d.name, e);
          break;
        }
        case 'Belag': {
          const tab = BELAG_TABELLE.get(d.name);
          const na = d.annos.find(a => a.name === 'Nach');
          let nach;
          if (na) {
            nach = [];
            if (na.args) for (const e of na.args.pos) { if (e.k === 'Name') nach.push(e.n); else if (e.k === 'Text') nach.push(e.v); }
          } else nach = tab ? tab.nach.slice() : [];
          const b = new BelagDef(d.name, tab && tab.preis !== null ? tab.preis : 1.00, nach);
          b.methoden = new Map();
          for (const md of d.methoden) {
            const m = new Methode(md, null);
            m.belag = b;
            this.alleMethoden.push(m);
            b.methoden.set(m.name, m);
          }
          this.belaege.set(d.name, b);
          break;
        }
        case 'Methode': {
          const m = new Methode(d, null);
          m.statisch = true;
          this.alleMethoden.push(m);
          const v = this.global.vars.get(d.name);
          if (v && v.w instanceof Gebunden) v.w.liste.push(m);
          else this.global.vars.set(d.name, new Var(new Gebunden(null, [m], d.name), null, false));
          break;
        }
      }
    }

    pf(code, text, n) { return new PizzaFehlerSig(code, text, n ? n.z : null, n ? n.s : null); }

    pruefe() {
      const dekls = [];
      const sammle = (d) => { dekls.push(d); if (d.k === 'Klasse') for (const i of d.innere) sammle(i); };
      for (const d of this.ast.body) if (DEKL.has(d.k)) sammle(d);
      // Durchgang 1: Q0004, Basisklassen, P0011
      for (const d of dekls) {
        if (d.k === 'Enum') {
          if (d.werte.length !== 4) throw this.pf('Q0004', 'quattrostagioni braucht genau 4 Werte, nicht ' + d.werte.length + '.', d);
        } else if (d.k === 'Klasse') {
          const k = this.klassen.get(d.name);
          if (d.basis) {
            const b = this.klassen.get(d.basis.name);
            if (!(b instanceof Klasse)) throw this.pf('P0010', 'Klasse \'' + d.name + '\' erbt von \'' + d.basis.name + '\' – diese Klasse gibt es nicht.', d.basis);
            if (b.gebacken) throw this.pf('P0011', 'Klasse \'' + d.name + '\' kann nicht von \'' + b.name + '\' erben – \'' + b.name + '\' ist gebacken.', d.basis);
            k.basis = b;
          }
          for (const t of d.erfuellt) {
            const r = this.klassen.get(t.name);
            if (!(r instanceof Rezeptur)) throw this.pf('P0010', 'Klasse \'' + d.name + '\' erfüllt \'' + t.name + '\' – diese Rezeptur gibt es nicht.', t);
            k.erfuellt.push(r);
          }
        } else if (d.k === 'Rezeptur') {
          const r = this.klassen.get(d.name);
          for (const t of d.basen) {
            const b = this.klassen.get(t.name);
            if (!(b instanceof Rezeptur)) throw this.pf('P0010', 'Rezeptur \'' + d.name + '\' erbt von \'' + t.name + '\' – diese Rezeptur gibt es nicht.', t);
            r.basen.push(b);
          }
        }
      }
      // Zyklen
      for (const k of this.klassenListe) {
        const gesehen = new Set();
        for (let c = k; c; c = c.basis) {
          if (gesehen.has(c)) throw this.pf('P0010', 'Klasse \'' + k.name + '\' erbt im Kreis – das ist ein Teigknoten.', k.decl);
          gesehen.add(c);
        }
      }
      // Durchgang 2: R0001, A0001
      for (const d of dekls) {
        if (d.k === 'Klasse') {
          const k = this.klassen.get(d.name);
          if (!k.rohling) {
            for (let c = k; c; c = c.basis) {
              for (const r of c.erfuellt) {
                for (const mn of this.rezepturMethoden(r, new Set())) {
                  if (!this.hatImplementierung(k, mn)) throw this.pf('R0001', 'Klasse \'' + k.name + '\' erfüllt Rezeptur \'' + r.name + '\' nicht: Methode \'' + mn + '\' fehlt.', d);
                }
              }
            }
          }
          for (const md of d.methoden) {
            if (!md.annos.some(a => a.name === 'PizzaÜberschreibt')) continue;
            let ok = md.name === 'alsText' || (this.istAnanasKlasse(k) && md.name in ANANAS_M);
            if (!ok && k.basis && this.findeMethodeListe(k.basis, md.name)) ok = true;
            if (!ok) {
              for (let c = k; c && !ok; c = c.basis) {
                for (const r of c.erfuellt) if (this.rezepturMethoden(r, new Set()).indexOf(md.name) >= 0) ok = true;
              }
            }
            if (!ok) throw this.pf('A0001', 'Methode \'' + md.name + '\' in \'' + k.name + '\' ist mit @PizzaÜberschreibt markiert, überschreibt aber nichts.', md);
          }
        } else if (d.k === 'Belag') {
          for (const md of d.methoden) {
            if (!md.annos.some(a => a.name === 'PizzaÜberschreibt')) continue;
            if (md.name !== 'preis' && !(md.name in PIZZA_M)) throw this.pf('A0001', 'Methode \'' + md.name + '\' in Belag \'' + d.name + '\' ist mit @PizzaÜberschreibt markiert, überschreibt aber nichts.', md);
          }
        }
      }
    }

    rezepturMethoden(r, gesehen) {
      if (gesehen.has(r)) return [];
      gesehen.add(r);
      let l = r.methoden.slice();
      for (const b of r.basen) l = l.concat(this.rezepturMethoden(b, gesehen));
      return l;
    }

    hatImplementierung(k, name) {
      for (let c = k; c; c = c.basis) {
        const l = c.methoden.get(name);
        if (l && l.some(m => m.body !== null)) return true;
      }
      return false;
    }

    rezepturErbt(r, ziel) {
      if (r === ziel) return true;
      for (const b of r.basen) if (this.rezepturErbt(b, ziel)) return true;
      return false;
    }

    vorbereiten() {
      for (const m of this.alleMethoden) {
        for (const a of m.decl.annos) {
          if (a.name === 'Kühlschrank') {
            let e = null;
            if (a.args) {
              const b = a.args.ben.find(x => x.name === 'haltbar');
              e = b ? b.e : (a.args.pos[0] || null);
            }
            if (e === null) m.haltbar = Infinity;
            else {
              this.z = a.z; this.s = a.s;
              m.haltbar = this.dauerMs(this.ausw(e, this.global), '@Kühlschrank(haltbar: …)');
            }
          } else if (a.name === 'PizzaVeraltet') {
            let grund = '';
            if (a.args) {
              const b = a.args.ben.find(x => x.name === 'grund');
              const e = b ? b.e : (a.args.pos[0] || null);
              if (e) { this.z = a.z; this.s = a.s; grund = this.text(this.ausw(e, this.global)); }
            }
            m.veraltet = grund;
          }
        }
      }
      for (const k of this.klassenListe) {
        const ctx = { dies: null, klasse: k, unten: null, ktor: false };
        for (const f of k.statischeFelder) {
          for (const d of f.decls) {
            if (d.init === null) continue;
            this.z = d.z; this.s = d.s;
            const sc = new Scope(this.global, ctx, true);
            const v = this.ausw(d.init, sc);
            if (v instanceof Pizza && (d.init.k === 'Name' || d.init.k === 'Mem')) throw this.besitz();
            this.pruefeTyp(f.typ, v, d.name);
            k.statisch.get(d.name).w = v;
          }
        }
      }
    }

    // ---------- Typprüfung ----------
    pruefeTyp(typ, v, name) {
      if (typ === null || typ.feld) return;
      let was;
      switch (typ.name) {
        case 'salami':
          if (typeof v === 'number' && Number.isInteger(v)) return;
          was = typeof v === 'number' ? 'keine Ganzzahl' : 'keine Zahl';
          break;
        case 'funghi': if (typeof v === 'number') return; was = 'keine Zahl'; break;
        case 'margherita': if (typeof v === 'string' || v === null) return; was = 'kein Text'; break;
        case 'diavolo': if (typeof v === 'boolean') return; was = 'kein Wahrheitswert'; break;
        case 'hawaii': throw this.panik();
        case 'Dauer': if (v === null || v instanceof Dauer) return; was = 'keine Dauer'; break;
        case 'Pizza': if (v === null || v instanceof Pizza) return; was = 'keine Pizza'; break;
        default: {
          const k = this.klassen.get(typ.name);
          if (k === undefined || v === null || this.instanzVon(v, k)) return;
          was = 'kein(e) ' + k.name;
        }
      }
      throw this.ananas('TypAnanas', '\'' + name + '\' ist ' + typ.name + ', aber der Wert ' + this.darstellung(v) + ' ist ' + was + '.');
    }

    instanzVon(v, k) {
      if (k instanceof Klasse) {
        if (!(v instanceof Obj)) return false;
        for (let c = v.klasse; c; c = c.basis) if (c === k) return true;
        return false;
      }
      if (k instanceof EnumTyp) return v instanceof EnumWert && v.typ === k;
      if (k instanceof Rezeptur) {
        if (!(v instanceof Obj)) return false;
        for (let c = v.klasse; c; c = c.basis) for (const r of c.erfuellt) if (this.rezepturErbt(r, k)) return true;
        return false;
      }
      return false;
    }

    // ---------- Textform ----------
    text(v) {
      if (v === null || v === undefined) return 'karton';
      switch (typeof v) {
        case 'string': return v;
        case 'number': return zahlText(v);
        case 'boolean': return v ? 'ja' : 'nein';
      }
      if (Array.isArray(v)) return '[' + v.map(x => this.text(x)).join(', ') + ']';
      if (v instanceof Map) {
        const t = [];
        for (const [k, w] of v) t.push(this.text(k) + ': ' + this.text(w));
        return '{' + t.join(', ') + '}';
      }
      if (v instanceof Dauer) return dauerText(v.ms);
      if (v instanceof Pizza) return pizzaText(v.schichten, v.schichten.length);
      if (v instanceof PizzaSicht) return pizzaText(v.pizza.schichten, v.k);
      if (v instanceof BelagDef) return v.name;
      if (v instanceof EnumWert) return v.name;
      if (v instanceof Obj) return this.objText(v);
      if (v instanceof Klasse || v instanceof EnumTyp || v instanceof Rezeptur || v instanceof Modul) return v.name;
      if (v instanceof Funktion || v instanceof Gebunden || v instanceof NativFn) return '<Funktion>';
      if (v instanceof Teig) return v.fertig ? 'Teig(' + this.text(v.wert) + ')' : 'Teig(roh)';
      if (v instanceof Lieferung) return 'Lieferung #' + v.nr;
      if (v instanceof Zustellung) return v.puenktlich ? 'Zustellung(' + (v.fehler ? 'Ananas' : this.text(v.wert)) + ')' : 'Zustellung(zu spät)';
      if (v instanceof Stueck) return 'Stück von ' + this.text(v.pizza);
      if (v instanceof Reste) return 'Reste(' + this.text(v.wert) + ')';
      if (v instanceof OfenRoh) return 'Roh(' + this.text(v.teil) + ')';
      if (v === AUTO) return 'auto';
      return String(v);
    }

    objText(o) {
      const l = this.findeMethodeListe(o.klasse, 'alsText');
      if (l) {
        const m = this.waehle(l, 0);
        if (m.body !== null && m.params.length === 0) return this.text(this.rufeDecl(m, o, [], null, null, 'normal'));
      }
      if (this.istAnanasKlasse(o.klasse)) return o.klasse.name + ': ' + o.nachricht;
      return o.klasse.name + '@' + o.nr;
    }

    // ---------- Vergleiche & Operatoren ----------
    gleich(a, b) {
      if (a === b) return true;
      if (a === null || b === null || a === undefined || b === undefined) return false;
      if (typeof a !== 'object' || typeof b !== 'object') return false;
      if (a instanceof Dauer && b instanceof Dauer) return a.ms === b.ms;
      const pa = a instanceof Pizza ? a.schichten : a instanceof PizzaSicht ? a.pizza.schichten.slice(0, a.k) : null;
      const pb = b instanceof Pizza ? b.schichten : b instanceof PizzaSicht ? b.pizza.schichten.slice(0, b.k) : null;
      if (pa && pb) {
        if (pa.length !== pb.length) return false;
        for (let i = 0; i < pa.length; i++) if (pa[i].name !== pb[i].name) return false;
        return true;
      }
      if (a instanceof BelagDef && b instanceof BelagDef) return a.name === b.name;
      return false;
    }

    vergleiche(a, b) {
      if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
      if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
      if (a instanceof Dauer && b instanceof Dauer) return a.ms < b.ms ? -1 : a.ms > b.ms ? 1 : 0;
      if (a instanceof EnumWert && b instanceof EnumWert && a.typ === b.typ) return a.pos - b.pos;
      throw this.ananas('TypAnanas', this.typName(a) + ' und ' + this.typName(b) + ' kann man nicht vergleichen.');
    }

    binaer(op, a, b, n) {
      const zz = typeof a === 'number' && typeof b === 'number';
      switch (op) {
        case '+':
          if (zz) return a + b;
          if (typeof a === 'string' || typeof b === 'string') return this.text(a) + this.text(b);
          if (a instanceof Dauer && b instanceof Dauer) return new Dauer(a.ms + b.ms);
          if ((a instanceof Pizza || a instanceof PizzaSicht) && b instanceof BelagDef) {
            const s = a instanceof Pizza ? a.schichten.slice() : a.pizza.schichten.slice(0, a.k);
            s.push(b);
            return this.neuePizza(s);
          }
          throw this.ananas('TypAnanas', this.typName(a) + ' und ' + this.typName(b) + ' kann man nicht addieren.');
        case '-':
          if (zz) return a - b;
          if (a instanceof Dauer && b instanceof Dauer) return new Dauer(a.ms - b.ms);
          if ((a instanceof Pizza || a instanceof PizzaSicht) && b instanceof BelagDef) {
            const s = (a instanceof Pizza ? a.schichten : a.pizza.schichten.slice(0, a.k)).filter(x => x.name !== b.name);
            return this.neuePizza(s);
          }
          throw this.ananas('TypAnanas', this.typName(b) + ' kann man nicht von ' + this.typName(a) + ' abziehen.');
        case '*':
          if (zz) return a * b;
          if (a instanceof Dauer && typeof b === 'number') return new Dauer(a.ms * b);
          if (typeof a === 'number' && b instanceof Dauer) return new Dauer(a * b.ms);
          throw this.ananas('TypAnanas', this.typName(a) + ' und ' + this.typName(b) + ' kann man nicht multiplizieren.');
        case '/':
          if (zz) {
            if (b === 0) throw this.ananas('RechenAnanas', 'Durch null teilen? Das ergibt keine Stücke.');
            return a / b;
          }
          if (a instanceof Dauer && typeof b === 'number') {
            if (b === 0) throw this.ananas('RechenAnanas', 'Durch null teilen? Das ergibt keine Stücke.');
            return new Dauer(a.ms / b);
          }
          if (a instanceof Dauer && b instanceof Dauer) {
            if (b.ms === 0) throw this.ananas('RechenAnanas', 'Durch null teilen? Das ergibt keine Stücke.');
            return a.ms / b.ms;
          }
          if (Array.isArray(a) && typeof b === 'number') {
            if (b === 0) throw this.ananas('RechenAnanas', 'Durch null teilen? Das ergibt keine Stücke.');
            const k = this.ganzzahl(b, 'Blech / n');
            if (k < 0) throw this.ananas('StreitAnanas', 'In ' + k + ' Stücke teilen? Das geht nicht.');
            if (k === 7) this.warnung('S0007', '7 Stücke? Wer schneidet eine Pizza in 7 Stücke?', n);
            if (a.length % k !== 0) throw this.ananas('StreitAnanas', a.length + ' Stücke lassen sich nicht fair durch ' + k + ' teilen.');
            return this.schneide(a, k);
          }
          throw this.ananas('TypAnanas', this.typName(a) + ' kann man nicht durch ' + this.typName(b) + ' teilen.');
        case '%':
          if (zz) {
            if (b === 0) throw this.ananas('RechenAnanas', 'Durch null teilen? Das ergibt keine Stücke.');
            return a % b;
          }
          throw this.ananas('TypAnanas', '% geht nur mit Zahlen.');
        case '==': return zz ? a === b : this.gleich(a, b);
        case '!=': return zz ? a !== b : !this.gleich(a, b);
        case '<': return zz ? a < b : this.vergleiche(a, b) < 0;
        case '<=': return zz ? a <= b : this.vergleiche(a, b) <= 0;
        case '>': return zz ? a > b : this.vergleiche(a, b) > 0;
        case '>=': return zz ? a >= b : this.vergleiche(a, b) >= 0;
      }
      throw this.ananas('LaufzeitAnanas', 'Unbekannter Operator \'' + op + '\'.');
    }

    // ---------- Pizzen ----------
    belag(name) {
      const b = this.belaege.get(name);
      if (b === undefined) throw this.ananas('UnbekannterBelagAnanas', '\'' + name + '\' steht nicht auf der Zutatenliste.');
      return b;
    }

    neuePizza(s) {
      for (let i = 0; i < s.length; i++) if (s[i].name === 'Ananas') throw this.panik();
      for (let i = 0; i < s.length; i++) {
        const x = s[i];
        if (x.nach.length === 0) continue;
        for (let j = i + 1; j < s.length; j++) {
          if (x.nach.indexOf(s[j].name) >= 0) {
            throw new PizzaFehlerSig('B0012', '\'' + x.name + '\' liegt unter \'' + s[j].name + '\'. Das ist keine Pizza, das ist ein Auflauf.', this.z, this.s);
          }
        }
      }
      return new Pizza(s);
    }

    standardPreis(b) {
      const t = BELAG_TABELLE.get(b.name);
      if (t && t.preis !== null) return t.preis;
      return b.preis !== undefined && b.preis !== null ? b.preis : 1.00;
    }

    preisBis(p, k) {
      if (k === 0) return GRUNDPREIS;
      const b = p.schichten[k - 1];
      if (b.methoden !== null) {
        const m = b.methoden.get('preis');
        if (m !== undefined) return this.belagMethode(m, p, k - 1, [], null, null);
      }
      return runde2(this.preisBis(p, k - 1) + this.standardPreis(b));
    }

    pizzaAufruf(p, k, name, pos, ben, node) {
      if (name === 'preis') return this.preisBis(p, k);
      for (let i = k; i >= 1; i--) {
        const b = p.schichten[i - 1];
        if (b.methoden !== null) {
          const m = b.methoden.get(name);
          if (m !== undefined) return this.belagMethode(m, p, i - 1, pos, ben, node);
        }
      }
      const f = PIZZA_M[name];
      if (f !== undefined) return f.call(this, p, k, pos, ben, node);
      throw this.ananas('LaufzeitAnanas', 'Methode \'' + name + '\' gibt es auf Pizza nicht.');
    }

    belagMethode(m, p, k, pos, ben, node) {
      return this.fuehreAus(m, { dies: p, klasse: null, unten: new PizzaSicht(p, k), ktor: false }, pos, ben, node);
    }

    // ---------- Namen & Felder ----------
    feldImKontext(ctx, name) {
      const d = ctx.dies;
      if (d instanceof Obj) {
        const f = d.felder.get(name);
        if (f !== undefined) {
          if (f.mod === 'geheimrezept' && f.klasse !== ctx.klasse) this.pruefeZugriff(f, d, ctx, name);
          return f;
        }
      }
      for (let k = ctx.klasse; k; k = k.basis) {
        const f = k.statisch.get(name);
        if (f !== undefined) {
          if (f.mod === 'geheimrezept' && f.klasse !== ctx.klasse) this.pruefeZugriff(f, null, ctx, name);
          return f;
        }
      }
      return null;
    }

    finde(sc, name) {
      for (let s = sc; s !== null; s = s.parent) {
        const v = s.vars.get(name);
        if (v !== undefined) return v;
        if (s.grenze && s.ctx.dies !== null || s.grenze && s.ctx.klasse !== null) {
          const f = this.feldImKontext(s.ctx, name);
          if (f !== null) return f;
        }
      }
      return null;
    }

    leseName(n, sc) {
      const name = n.n;
      for (let s = sc; s !== null; s = s.parent) {
        const v = s.vars.get(name);
        if (v !== undefined) {
          if (v.weg) throw this.weggeschoben(name);
          return v.w;
        }
        if (s.grenze && (s.ctx.dies !== null || s.ctx.klasse !== null)) {
          const f = this.feldImKontext(s.ctx, name);
          if (f !== null) {
            if (f.weg) throw this.weggeschoben(name);
            return f.w;
          }
        }
      }
      return this.globalerName(name);
    }

    globalerName(name) {
      const g = this.globals.get(name);
      if (g !== undefined) return g;
      if (name === 'Ananas') return this.belaege.get('Ananas');
      const k = this.klassen.get(name);
      if (k !== undefined) return k;
      const b = this.belaege.get(name);
      if (b !== undefined) return b;
      if (istGross(name)) throw this.ananas('UnbekannterBelagAnanas', '\'' + name + '\' steht nicht auf der Zutatenliste.');
      throw this.ananas('LaufzeitAnanas', '\'' + name + '\' ist nicht definiert.');
    }

    pruefeZugriff(v, o, ctx, name) {
      if (v.mod === null) return;
      const ck = ctx.klasse;
      if (v.mod === 'geheimrezept') {
        if (ck === v.klasse) return;
        if (o instanceof Obj && !o.zugeklappt && this.istCalzone(o.klasse)) return;
        throw this.ananas('ZugriffsAnanas', '\'' + name + '\' ist geheimrezept in \'' + v.klasse.name + '\' – Zugriff verweigert.');
      }
      if (v.mod === 'familienrezept') {
        for (let k = ck; k; k = k.basis) if (k === v.klasse) return;
        if (o instanceof Obj && !o.zugeklappt && this.istCalzone(o.klasse)) return;
        throw this.ananas('ZugriffsAnanas', '\'' + name + '\' ist familienrezept in \'' + v.klasse.name + '\' – nur für die Familie.');
      }
    }

    pruefeMethodenZugriff(m, ctx) {
      if (m.sicht === null || m.klasse === null) return;
      const ck = ctx.klasse;
      if (m.sicht === 'geheimrezept') {
        if (ck === m.klasse) return;
        throw this.ananas('ZugriffsAnanas', 'Methode \'' + m.name + '\' ist geheimrezept in \'' + m.klasse.name + '\' – Zugriff verweigert.');
      }
      for (let k = ck; k; k = k.basis) if (k === m.klasse) return;
      throw this.ananas('ZugriffsAnanas', 'Methode \'' + m.name + '\' ist familienrezept in \'' + m.klasse.name + '\' – nur für die Familie.');
    }

    statischesFeld(k, name) {
      for (let c = k; c; c = c.basis) {
        const f = c.statisch.get(name);
        if (f !== undefined) return f;
      }
      return null;
    }

    findeMethodeListe(k, name) {
      for (let c = k; c; c = c.basis) {
        const l = c.methoden.get(name);
        if (l !== undefined) return l;
      }
      return null;
    }

    waehle(liste, n) {
      if (liste.length === 1) return liste[0];
      for (const m of liste) if (m.params.length === n) return m;
      return liste[0];
    }

    mitglied(o, name, n, sc) {
      if (o === null || o === undefined) throw this.leer();
      if (o instanceof Obj) {
        const f = o.felder.get(name);
        if (f !== undefined) {
          if (f.mod !== null) this.pruefeZugriff(f, o, sc.ctx, name);
          if (f.weg) throw this.weggeschoben(name);
          return f.w;
        }
        const st = this.statischesFeld(o.klasse, name);
        if (st !== null) { if (st.mod !== null) this.pruefeZugriff(st, null, sc.ctx, name); return st.w; }
        const l = this.findeMethodeListe(o.klasse, name);
        if (l !== null) return new Gebunden(o, l, name);
        if ((this.istAnanasKlasse(o.klasse) && ANANAS_M[name]) || OBJ_M[name]) {
          return new NativFn(name, (pos, ben, node) => this.objMethode(o, name, pos, ben, node, sc));
        }
        throw this.ananas('LaufzeitAnanas', 'Feld \'' + name + '\' gibt es auf ' + o.klasse.name + ' nicht.');
      }
      if (o instanceof Klasse) {
        const f = this.statischesFeld(o, name);
        if (f !== null) { if (f.mod !== null) this.pruefeZugriff(f, null, sc.ctx, name); return f.w; }
        const l = this.findeMethodeListe(o, name);
        if (l !== null) return new Gebunden(null, l, name);
        throw this.ananas('LaufzeitAnanas', 'Feld \'' + name + '\' gibt es in Klasse ' + o.name + ' nicht.');
      }
      if (o instanceof EnumTyp) {
        const w = o.nachName.get(name);
        if (w !== undefined) return w;
        if (name === 'werte') return new NativFn('werte', () => o.werte.slice());
        throw this.ananas('LaufzeitAnanas', '\'' + name + '\' gibt es in ' + o.name + ' nicht.');
      }
      if (o instanceof Modul) {
        if (o.felder !== null && Object.prototype.hasOwnProperty.call(o.felder, name)) return o.felder[name];
        if (o.methoden[name]) return new NativFn(o.name + '.' + name, (pos, ben, node) => o.methoden[name].call(this, o, pos, ben, node));
        throw this.ananas('LaufzeitAnanas', '\'' + name + '\' gibt es bei ' + o.name + ' nicht.');
      }
      if (o instanceof Pizza || o instanceof PizzaSicht) {
        return new NativFn(name, (pos, ben, node) => this.rufeMethode(o, name, pos, ben, node, sc));
      }
      const tab = this.tabelleVon(o);
      if (tab !== null && tab[name] !== undefined) {
        return new NativFn(name, (pos, ben, node) => tab[name].call(this, o, pos, ben, node));
      }
      throw this.ananas('LaufzeitAnanas', 'Feld \'' + name + '\' gibt es auf ' + this.typName(o) + ' nicht.');
    }

    tabelleVon(o) {
      switch (typeof o) {
        case 'string': return TEXT_M;
        case 'number': return ZAHL_M;
        case 'boolean': return BOOL_M;
      }
      if (Array.isArray(o)) return BLECH_M;
      if (o instanceof Map) return KARTE_M;
      return TABELLEN.get(o.constructor) || null;
    }

    // ---------- Aufrufe ----------
    posArgs(a, sc) {
      const p = a.pos;
      const r = new Array(p.length);
      for (let i = 0; i < p.length; i++) r[i] = this.ausw(p[i], sc);
      return r;
    }
    benArgs(a, sc) {
      if (a.ben === null) return null;
      const r = Object.create(null);
      for (const b of a.ben) r[b.name] = this.ausw(b.e, sc);
      return r;
    }

    rufeMethode(o, name, pos, ben, node, sc) {
      if (o === null || o === undefined) throw this.leer();
      let tab;
      switch (typeof o) {
        case 'string': tab = TEXT_M; break;
        case 'number': tab = ZAHL_M; break;
        case 'boolean': tab = BOOL_M; break;
        default:
          if (o instanceof Obj) return this.objMethode(o, name, pos, ben, node, sc);
          if (Array.isArray(o)) tab = BLECH_M;
          else if (o instanceof Map) tab = KARTE_M;
          else if (o instanceof Pizza) return this.pizzaAufruf(o, o.schichten.length, name, pos, ben, node);
          else if (o instanceof PizzaSicht) return this.pizzaAufruf(o.pizza, o.k, name, pos, ben, node);
          else if (o instanceof Modul) {
            const f = o.methoden[name];
            if (f === undefined) throw this.ananas('LaufzeitAnanas', 'Methode \'' + name + '\' gibt es bei ' + o.name + ' nicht.');
            return f.call(this, o, pos, ben, node);
          } else if (o instanceof Klasse) return this.statischerAufruf(o, name, pos, ben, node, sc);
          else if (o instanceof EnumTyp) {
            if (name === 'werte') return o.werte.slice();
            throw this.ananas('LaufzeitAnanas', 'Methode \'' + name + '\' gibt es bei ' + o.name + ' nicht.');
          } else if (o instanceof Rezeptur) throw this.ananas('LaufzeitAnanas', 'Eine Rezeptur kann man nicht aufrufen – sie ist nur ein Rezept.');
          else tab = TABELLEN.get(o.constructor);
      }
      if (tab !== undefined) {
        const f = tab[name];
        if (f !== undefined) return f.call(this, o, pos, ben, node);
      }
      throw this.ananas('LaufzeitAnanas', 'Methode \'' + name + '\' gibt es auf ' + this.typName(o) + ' nicht.');
    }

    objMethode(o, name, pos, ben, node, sc) {
      const l = this.findeMethodeListe(o.klasse, name);
      if (l !== null) {
        const m = this.waehle(l, this.anzahl(pos, ben));
        if (m.sicht !== null && sc) this.pruefeMethodenZugriff(m, sc.ctx);
        return this.rufeDecl(m, o, pos, ben, node, 'normal');
      }
      const f = o.felder.get(name);
      if (f !== undefined && (f.w instanceof Funktion || f.w instanceof Gebunden || f.w instanceof NativFn)) return this.rufe(f.w, pos, ben, node);
      if (this.istAnanasKlasse(o.klasse)) {
        const a = ANANAS_M[name];
        if (a !== undefined) return a.call(this, o, pos, ben, node);
      }
      const g = OBJ_M[name];
      if (g !== undefined) return g.call(this, o, pos, ben, node);
      throw this.ananas('LaufzeitAnanas', 'Methode \'' + name + '\' gibt es auf ' + o.klasse.name + ' nicht.');
    }

    statischerAufruf(k, name, pos, ben, node, sc) {
      const l = this.findeMethodeListe(k, name);
      if (l !== null) {
        const m = this.waehle(l, this.anzahl(pos, ben));
        if (m.sicht !== null && sc) this.pruefeMethodenZugriff(m, sc.ctx);
        let dies = null;
        if (!m.statisch && sc && sc.ctx.dies instanceof Obj && this.instanzVon(sc.ctx.dies, m.klasse)) dies = sc.ctx.dies;
        return this.rufeDecl(m, dies, pos, ben, node, 'normal');
      }
      const f = this.statischesFeld(k, name);
      if (f !== null && (f.w instanceof Funktion || f.w instanceof Gebunden || f.w instanceof NativFn)) return this.rufe(f.w, pos, ben, node);
      throw this.ananas('LaufzeitAnanas', 'Methode \'' + name + '\' gibt es in Klasse ' + k.name + ' nicht.');
    }

    rufe(f, pos, ben, node) {
      if (f instanceof Funktion) return this.rufeLambda(f, pos, ben);
      if (f instanceof Gebunden) return this.rufeDecl(this.waehle(f.liste, this.anzahl(pos, ben)), f.obj, pos, ben, node, 'normal');
      if (f instanceof NativFn) {
        if (++this.st > MAX_STAPEL) { this.st--; throw this.stapel(); }
        const v = f.fn.call(this, pos, ben, node);
        this.st--;
        return v;
      }
      if (f === null || f === undefined) throw this.leer();
      throw this.ananas('TypAnanas', this.darstellung(f) + ' ist keine Funktion – das kann man nicht aufrufen.');
    }

    rufeDecl(m, dies, pos, ben, node, modus) {
      if (m.veraltet !== null && !m.gewarnt) {
        m.gewarnt = true;
        this.warnung('W0003', 'Methode \'' + m.name + '\' ist veraltet.' + (m.veraltet ? ' Grund: ' + m.veraltet : ''), node);
      }
      if (m.body === null) throw this.ananas('RohlingAnanas', 'Methode \'' + m.name + '\' ist ein Rohling – sie hat keinen Rumpf.');
      if (m.haltbar >= 0 || modus !== 'normal') return this.kuehlschrank(m, dies, pos, ben, node, modus);
      if (!m.statisch && dies === null && m.klasse !== null) {
        throw this.ananas('LaufzeitAnanas', 'Methode \'' + m.name + '\' braucht eine Pizza-Instanz (dies) – sie ist nicht tiefkühl.');
      }
      return this.fuehreAus(m, { dies: m.statisch ? null : dies, klasse: m.klasse, unten: null, ktor: false }, pos, ben, node);
    }

    cacheSchluessel(pos, ben) {
      const teile = [];
      const k = (v) => {
        if (v === null || v === undefined) return 'k';
        switch (typeof v) {
          case 'string': return 't' + v;
          case 'number': return 'z' + v;
          case 'boolean': return v ? 'j' : 'n';
        }
        if (v instanceof Obj) return 'o' + v.klasse.name + '@' + v.nr;
        const st0 = this.st;
        try { return 'x' + this.text(v); } catch (e) { this.st = st0; return 'x?'; }
      };
      for (const v of pos) teile.push(k(v));
      if (ben !== null) for (const n in ben) teile.push(n + '=' + k(ben[n]));
      return teile.join('\u0001');
    }

    kuehlschrank(m, dies, pos, ben, node, modus) {
      const rechne = () => {
        if (!m.statisch && dies === null && m.klasse !== null) {
          throw this.ananas('LaufzeitAnanas', 'Methode \'' + m.name + '\' braucht eine Pizza-Instanz (dies) – sie ist nicht tiefkühl.');
        }
        return this.fuehreAus(m, { dies, klasse: m.klasse, unten: null, ktor: false }, pos, ben, node);
      };
      if (m.haltbar < 0) {
        const v = rechne();
        return modus === 'mikrowelle' ? new Reste(v, false) : v;
      }
      const halter = dies !== null && typeof dies === 'object' ? dies : (m.klasse || this.globalCache);
      if (halter.cache === null || halter.cache === undefined) halter.cache = new Map();
      let tab = halter.cache.get(m);
      if (tab === undefined) { tab = new Map(); halter.cache.set(m, tab); }
      let key;
      if (ben === null) key = this.cacheSchluessel(pos, null);
      else {
        const geordnet = [];
        for (let i = 0; i < m.params.length; i++) geordnet.push(i < pos.length ? pos[i] : (m.params[i].name in ben ? ben[m.params[i].name] : null));
        key = this.cacheSchluessel(geordnet, null);
      }
      const e = tab.get(key);
      if (modus === 'frisch' || e === undefined) {
        const v = rechne();
        tab.set(key, { w: v, t: this.schritte + this.offset });
        return modus === 'mikrowelle' ? new Reste(v, false) : v;
      }
      const frisch = (this.schritte + this.offset) - e.t <= m.haltbar;
      if (frisch) return modus === 'mikrowelle' ? new Reste(e.w, false) : e.w;
      const alt = e.w;
      const v = rechne();
      tab.set(key, { w: v, t: this.schritte + this.offset });
      return modus === 'mikrowelle' ? new Reste(alt, true) : v;
    }

    bindeParameter(ps, sc, pos, ben, name, strikt) {
      if (ben !== null) {
        for (const k in ben) {
          let ok = false;
          for (const p of ps) if (p.name === k) { ok = true; break; }
          if (!ok) throw this.ananas('LaufzeitAnanas', name + ' hat keinen Parameter \'' + k + '\'.');
        }
      }
      if (strikt && pos.length > ps.length) {
        throw this.ananas('LaufzeitAnanas', name + ' erwartet ' + ps.length + ' Argument' + (ps.length === 1 ? '' : 'e') + ', bekam ' + this.anzahl(pos, ben) + '.');
      }
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        let v;
        if (i < pos.length) v = pos[i];
        else if (ben !== null && p.name in ben) v = ben[p.name];
        else if (strikt) throw this.ananas('LaufzeitAnanas', name + ' erwartet ' + ps.length + ' Argument' + (ps.length === 1 ? '' : 'e') + ', bekam ' + this.anzahl(pos, ben) + '.');
        else v = null;
        if (p.nieKarton && v === null) throw this.ananas('LeererKartonAnanas', 'Parameter \'' + p.name + '\' ist @NieKarton – aber es kam ein leerer Karton.');
        if (p.typ !== null) this.pruefeTyp(p.typ, v, p.name);
        sc.vars.set(p.name, new Var(v, p.typ, p.gebacken));
      }
    }

    fuehreAus(m, ctx, pos, ben, node) {
      const sc = new Scope(this.global, ctx, true);
      this.bindeParameter(m.params, sc, pos, ben, 'Methode \'' + m.name + '\'', true);
      if (++this.st > MAX_STAPEL) { this.st--; throw this.stapel(); }
      const z = this.z, s = this.s;
      try {
        const body = m.body.body;
        for (let i = 0; i < body.length; i++) {
          const r = this.fuehre(body[i], sc);
          if (r !== undefined) {
            if (r === RET) { const v = this.rueck; this.rueck = null; return v; }
            break;
          }
        }
        return null;
      } finally {
        this.st--;
        this.z = z; this.s = s;
      }
    }

    rufeLambda(f, pos, ben) {
      const n = f.n;
      const sc = new Scope(f.scope, null, false);
      this.bindeParameter(n.params, sc, pos, ben, 'Die Funktion', false);
      if (++this.st > MAX_STAPEL) { this.st--; throw this.stapel(); }
      const z = this.z, s = this.s;
      try {
        if (n.ausdr) return this.ausw(n.body, sc);
        const body = n.body.body;
        for (let i = 0; i < body.length; i++) {
          const r = this.fuehre(body[i], sc);
          if (r !== undefined) {
            if (r === RET) { const v = this.rueck; this.rueck = null; return v; }
            break;
          }
        }
        return null;
      } finally {
        this.st--;
        this.z = z; this.s = s;
      }
    }

    namenAufruf(n, sc) {
      const f = this.aufrufZiel(n.name, sc);
      if (f === AUTO) return this.schieb(n, sc);
      if (f instanceof Gebunden && f.liste[0].sicht !== null) {
        const pos = this.posArgs(n.args, sc), ben = this.benArgs(n.args, sc);
        const m = this.waehle(f.liste, this.anzahl(pos, ben));
        this.pruefeMethodenZugriff(m, sc.ctx);
        return this.rufeDecl(m, f.obj, pos, ben, n, 'normal');
      }
      return this.rufe(f, this.posArgs(n.args, sc), this.benArgs(n.args, sc), n);
    }

    aufrufZiel(name, sc) {
      for (let s = sc; s !== null; s = s.parent) {
        const v = s.vars.get(name);
        if (v !== undefined) {
          if (v.weg) throw this.weggeschoben(name);
          return v.w;
        }
        if (s.grenze) break;
      }
      const ctx = sc.ctx;
      if (ctx.klasse !== null) {
        const d = ctx.dies instanceof Obj ? ctx.dies : null;
        const l = this.findeMethodeListe(d !== null ? d.klasse : ctx.klasse, name) || (d !== null ? this.findeMethodeListe(ctx.klasse, name) : null);
        if (l !== null) return new Gebunden(d, l, name);
      } else if (ctx.dies instanceof Pizza) {
        const p = ctx.dies;
        let gefunden = PIZZA_M[name] !== undefined || name === 'preis';
        for (const b of p.schichten) if (b.methoden && b.methoden.has(name)) gefunden = true;
        if (gefunden) return new NativFn(name, (pos, ben, node) => this.pizzaAufruf(p, p.schichten.length, name, pos, ben, node));
      }
      if (name === 'schieb' && this.finde(sc, name) === null) return AUTO;
      return this.leseName({ n: name }, sc);
    }

    schieb(n, sc) {
      const a = n.args.pos[0];
      if (!a || a.k !== 'Name' || n.args.pos.length !== 1) throw this.ananas('LaufzeitAnanas', 'schieb braucht genau einen Variablennamen: schieb(p).');
      const v = this.finde(sc, a.n);
      if (v === null) throw this.ananas('LaufzeitAnanas', '\'' + a.n + '\' ist nicht definiert.');
      if (v.weg) throw this.weggeschoben(a.n);
      const w = v.w;
      v.weg = true;
      v.w = null;
      return w;
    }

    untenAufruf(n, sc) {
      const ctx = sc.ctx;
      const pos = this.posArgs(n.args, sc), ben = this.benArgs(n.args, sc);
      if (ctx.unten !== null) return this.rufeMethode(ctx.unten, n.name, pos, ben, n, sc);
      if (ctx.klasse === null || ctx.klasse.basis === null) throw this.ananas('LaufzeitAnanas', '\'unten\' gibt es hier nicht – keine Basisklasse.');
      const l = this.findeMethodeListe(ctx.klasse.basis, n.name);
      if (l !== null) {
        const m = this.waehle(l, this.anzahl(pos, ben));
        return this.rufeDecl(m, m.statisch ? null : ctx.dies, pos, ben, n, 'normal');
      }
      if (ctx.dies instanceof Obj) {
        if (this.istAnanasKlasse(ctx.klasse.basis) && ANANAS_M[n.name]) return ANANAS_M[n.name].call(this, ctx.dies, pos, ben, n);
        if (OBJ_M[n.name]) return OBJ_M[n.name].call(this, ctx.dies, pos, ben, n);
      }
      throw this.ananas('LaufzeitAnanas', 'Methode \'' + n.name + '\' gibt es in der Basisklasse \'' + ctx.klasse.basis.name + '\' nicht.');
    }

    // ---------- Objekte ----------
    instanziiere(k, pos, ben, node) {
      if (k.rohling) throw this.ananas('RohlingAnanas', 'Ein Rohling ist nicht essbar.');
      const o = new Obj(k, ++this.instanzen);
      o.zugeklappt = this.istCalzone(k);
      const kette = [];
      for (let c = k; c; c = c.basis) kette.push(c);
      for (let i = kette.length - 1; i >= 0; i--) {
        const c = kette[i];
        for (const f of c.felder) {
          for (const d of f.decls) {
            const v = new Var(standardWert(f.typ), f.typ, f.gebacken);
            v.mod = f.sicht; v.klasse = c; v.besitzer = o;
            o.felder.set(d.name, v);
          }
        }
      }
      this.konstruiere(k, o, pos, ben, node);
      return o;
    }

    konstruiere(k, o, pos, ben, node) {
      if (k.nativKtor !== null) { k.nativKtor(o, pos); return; }
      if (k.ktoren.length === 0) {
        if (k.basis !== null) this.konstruiere(k.basis, o, pos, ben, node);
        else if (pos.length || ben !== null) throw this.ananas('LaufzeitAnanas', 'Klasse \'' + k.name + '\' hat keinen Konstruktor, bekam aber Argumente.');
        this.feldInit(k, o);
        return;
      }
      const m = this.waehle(k.ktoren, this.anzahl(pos, ben));
      const ctx = { dies: o, klasse: k, unten: null, ktor: true };
      const sc = new Scope(this.global, ctx, true);
      this.bindeParameter(m.params, sc, pos, ben, 'Konstruktor von \'' + k.name + '\'', true);
      if (!m.hatUnten) {
        if (k.basis !== null) this.konstruiere(k.basis, o, [], null, node);
        this.feldInit(k, o);
      }
      if (++this.st > MAX_STAPEL) { this.st--; throw this.stapel(); }
      const z = this.z, s = this.s;
      try {
        const body = m.body.body;
        for (let i = 0; i < body.length; i++) {
          const r = this.fuehre(body[i], sc);
          if (r !== undefined) { this.rueck = null; break; }
        }
      } finally {
        this.st--;
        this.z = z; this.s = s;
      }
    }

    feldInit(k, o) {
      const ctx = { dies: o, klasse: k, unten: null, ktor: true };
      for (const f of k.felder) {
        for (const d of f.decls) {
          if (d.init === null) continue;
          const sc = new Scope(this.global, ctx, true);
          const v = this.ausw(d.init, sc);
          if (v instanceof Pizza && (d.init.k === 'Name' || d.init.k === 'Mem')) throw this.besitz();
          this.pruefeTyp(f.typ, v, d.name);
          o.felder.get(d.name).w = v;
        }
      }
    }

    // ---------- Lieferung & Ofen ----------
    liefere(l, budget, node) {
      let z;
      const st0 = this.st;
      const frame = this.pushFrame('lieferung', budget);
      try {
        const v = this.rufe(l.fn, [], null, node);
        z = new Zustellung(true, v, null);
      } catch (e0) {
        this.st = st0;
        const e = this.normalisiere(e0);
        if (e instanceof BudgetSig && e.frame === frame) z = new Zustellung(false, null, null);
        else if (e instanceof AnanasWurf) z = new Zustellung(true, null, e);
        else throw e;
      } finally {
        this.popFrame(frame);
      }
      l.zustellung = z;
      return z;
    }

    blockWert(b, sc) {
      const s = new Scope(sc, null, false);
      const body = b.body;
      for (let i = 0; i < body.length; i++) {
        const r = this.fuehre(body[i], s);
        if (r !== undefined) {
          if (r === RET) { const v = this.rueck; this.rueck = null; return v; }
          return null;
        }
      }
      return null;
    }

    ofen(n, sc) {
      const pos = this.posArgs(n.args, sc), ben = this.benArgs(n.args, sc);
      let temp = arg(pos, ben, 0, 'temperatur');
      let zeit = arg(pos, ben, 1, 'zeit');
      if (temp === undefined || temp === null) temp = 250;
      if (zeit === undefined || zeit === null) zeit = new Dauer(60000);
      const zeitMs = this.dauerMs(zeit, 'ofen(zeit: …)');
      this.zahl(temp, 'ofen(temperatur: …)');
      const startUhr = this.schritte + this.offset;
      const z0 = this.z, s0 = this.s;
      let wert = null, roh = null;
      const st0 = this.st;
      try {
        if (temp > 485) throw this.ananas('VerbranntAnanas', 'Zu heiß! Selbst Neapel hat Grenzen.');
        const budget = Math.floor(zeitMs * temp / 250);
        const frame = this.pushFrame('ofen', budget);
        try {
          wert = this.blockWert(n.block, sc);
        } catch (e) {
          this.st = st0;
          if (e instanceof BudgetSig && e.frame === frame) {
            this.z = z0; this.s = s0;
            if (n.roh) roh = new OfenRoh(frame.zwischen, new Dauer(this.schritte + this.offset - startUhr));
            else throw this.ananas('VerbranntAnanas', 'Zu lange im Ofen: Budget von ' + budget + ' Schritten überschritten.');
          } else throw e;
        } finally {
          this.popFrame(frame);
        }
      } catch (e0) {
        this.st = st0;
        const e = this.normalisiere(e0);
        if (e instanceof AnanasWurf && n.faenge.length) {
          const f = this.findeFang(n.faenge, e.obj);
          if (f !== null) {
            const s2 = new Scope(sc, null, false);
            s2.vars.set(f.name, new Var(e.obj, null, false));
            return this.blockWert(f.block, s2);
          }
        }
        throw e;
      }
      if (roh !== null) {
        const s2 = new Scope(sc, null, false);
        s2.vars.set(n.roh.name, new Var(roh, null, false));
        return this.blockWert(n.roh.block, s2);
      }
      return wert;
    }

    findeFang(faenge, obj) {
      for (const f of faenge) {
        if (f.typ === null) return f;
        const k = this.klassen.get(f.typ.name);
        if (k !== undefined && this.instanzVon(obj, k)) return f;
      }
      return null;
    }

    waehleFall(n, v, sc) {
      let std = null;
      for (const c of n.faelle) {
        if (c.labels === null) { std = c; continue; }
        for (const lab of c.labels) {
          if (lab.k === 'Name' && v instanceof EnumWert) {
            if (lab.n === v.name) return c;
            continue;
          }
          if (this.gleich(v, this.ausw(lab, sc))) return c;
        }
      }
      return std;
    }

    // ---------- Ausdrücke ----------
    // Kleine Fallmethoden halten den JS-Stackframe von ausw()/fuehre() klein (tiefe Rekursion).
    ausw(n, sc) {
      if (++this.schritte > this.grenze) this.grenzeErreicht();
      switch (n.k) {
        case 'Zahl': case 'Text': case 'Bool': return n.v;
        case 'Name': return this.leseName(n, sc);
        case 'Dauer': return new Dauer(n.v);
        case 'Karton': return null;
        case 'Dies': return this.aDies(sc);
        case 'Unten': return this.aUnten(sc);
        case 'Lambda': return new Funktion(n, sc);
      }
      // Zusammengesetzte Ausdrücke zählen in die Stapeltiefe (deterministisches Limit, SPEC §14.4)
      if (++this.st > MAX_STAPEL) { this.st--; throw this.stapel(); }
      let r;
      switch (n.k) {
        case 'Bin': r = this.binaer(n.op, this.ausw(n.l, sc), this.ausw(n.r, sc), n); break;
        case 'MCall': r = this.aMCall(n, sc); break;
        case 'NCall': r = this.namenAufruf(n, sc); break;
        case 'Mem': r = this.mitglied(this.ausw(n.obj, sc), n.name, n, sc); break;
        case 'Log': r = this.aLog(n, sc); break;
        case 'Un': r = this.aUn(n, sc); break;
        case 'Tern': r = this.aTern(n, sc); break;
        case 'Call': r = this.rufe(this.ausw(n.callee, sc), this.posArgs(n.args, sc), this.benArgs(n.args, sc), n); break;
        case 'UntenCall': r = this.aUntenCall(n, sc); break;
        case 'Neu': r = this.aNeu(n, sc); break;
        case 'PizzaLit': r = this.aPizzaLit(n, sc); break;
        case 'Blech': r = this.aBlech(n, sc); break;
        case 'Bereich': r = this.aBereich(n, sc); break;
        case 'Ofen': r = this.ofen(n, sc); break;
        case 'WaehleA': r = this.aWaehle(n, sc); break;
        default: throw this.ananas('LaufzeitAnanas', 'Unbekannter Ausdruck \'' + n.k + '\'.');
      }
      this.st--;
      return r;
    }

    aMCall(n, sc) {
      if (n.obj.k === 'Unten') return this.untenAufruf(n, sc);
      const o = this.ausw(n.obj, sc);
      let pos;
      const a0 = n.args.pos.length === 1 ? n.args.pos[0] : null;
      if (n.name === 'schneide' && a0 !== null && a0.k === 'Name' && a0.n === 'auto' && this.finde(sc, 'auto') === null) {
        // K-038: `auto` ist nur hier gültig; der Namensknoten kostet wie üblich einen Schritt
        if (++this.schritte > this.grenze) this.grenzeErreicht();
        pos = [AUTO];
      } else pos = this.posArgs(n.args, sc);
      const ben = n.args.ben === null ? null : this.benArgs(n.args, sc);
      return this.rufeMethode(o, n.name, pos, ben, n, sc);
    }
    aLog(n, sc) {
      const l = this.ausw(n.l, sc);
      if (l !== true && l !== false) this.bool(l);
      if (n.op === '&&') { if (!l) return false; }
      else if (l) return true;
      const r = this.ausw(n.r, sc);
      if (r !== true && r !== false) this.bool(r);
      return r;
    }
    aUn(n, sc) {
      const v = this.ausw(n.e, sc);
      if (n.op === '!') { if (v !== true && v !== false) this.bool(v); return !v; }
      if (typeof v === 'number') return -v;
      if (v instanceof Dauer) return new Dauer(-v.ms);
      throw this.ananas('TypAnanas', this.typName(v) + ' kann man nicht negieren.');
    }
    aTern(n, sc) {
      const c = this.ausw(n.c, sc);
      if (c !== true && c !== false) this.bool(c);
      return c ? this.ausw(n.a, sc) : this.ausw(n.b, sc);
    }
    aDies(sc) {
      const d = sc.ctx.dies;
      if (d === null) throw this.ananas('LaufzeitAnanas', '\'dies\' gibt es hier nicht – wir sind in keiner Instanz.');
      return d;
    }
    aUnten(sc) {
      const ctx = sc.ctx;
      if (ctx.unten !== null) return ctx.unten;
      if (ctx.dies !== null) return ctx.dies;
      throw this.ananas('LaufzeitAnanas', '\'unten\' gibt es hier nicht.');
    }
    aUntenCall(n, sc) {
      const ctx = sc.ctx;
      if (!ctx.ktor || ctx.klasse === null || !(ctx.dies instanceof Obj)) throw this.ananas('LaufzeitAnanas', 'unten(…) geht nur im Konstruktor.');
      const pos = this.posArgs(n.args, sc), ben = this.benArgs(n.args, sc);
      const k = ctx.klasse;
      if (k.basis !== null) this.konstruiere(k.basis, ctx.dies, pos, ben, n);
      else if (pos.length) throw this.ananas('LaufzeitAnanas', 'Klasse \'' + k.name + '\' hat keine Basisklasse für unten(…).');
      this.feldInit(k, ctx.dies);
      return null;
    }
    aNeu(n, sc) {
      const tn = n.typ.name;
      if (tn === 'Hawaii') throw this.panik();
      const pos = this.posArgs(n.args, sc), ben = this.benArgs(n.args, sc);
      switch (tn) {
        case 'Blech': return pos.length && Array.isArray(pos[0]) ? pos[0].slice() : [];
        case 'Speisekarte': return new Map();
        case 'Pizza': return this.neuePizza([]);
      }
      const k = this.klassen.get(tn);
      if (k === undefined) throw this.ananas('UnbekanntePizzaAnanas', 'Klasse \'' + tn + '\' steht nicht auf der Speisekarte.');
      if (!(k instanceof Klasse)) throw this.ananas('RohlingAnanas', '\'' + tn + '\' kann man nicht mit neu backen.');
      return this.instanziiere(k, pos, ben, n);
    }
    aPizzaLit(n, sc) {
      const bl = n.belaege;
      if (bl.length === 1 && bl[0].n !== 'Ananas' && !this.belaege.has(bl[0].n)) return this.leseName(bl[0], sc);
      const s = new Array(bl.length);
      for (let i = 0; i < bl.length; i++) s[i] = this.belag(bl[i].n);
      return this.neuePizza(s);
    }
    aBlech(n, sc) {
      const e = n.elemente;
      const r = new Array(e.length);
      for (let i = 0; i < e.length; i++) r[i] = this.ausw(e[i], sc);
      return r;
    }
    aBereich(n, sc) {
      const a = this.zahl(this.ausw(n.a, sc), 'Bereich [a .. b]');
      const b = this.zahl(this.ausw(n.b, sc), 'Bereich [a .. b]');
      if (Math.abs(b - a) > 10000000) throw this.ananas('RechenAnanas', 'Der Bereich ist zu groß für ein Blech.');
      const r = [];
      if (a <= b) for (let x = a; x <= b; x++) r.push(x);
      else for (let x = a; x >= b; x--) r.push(x);
      return r;
    }
    aWaehle(n, sc) {
      const v = this.ausw(n.subj, sc);
      const c = this.waehleFall(n, v, sc);
      if (c === null) return null;
      return c.body.k === 'Block' ? this.blockWert(c.body, sc) : this.ausw(c.body, sc);
    }

    // ---------- Anweisungen ----------
    block(n, sc) {
      const s = n.d ? new Scope(sc, null, false) : sc;
      const b = n.body;
      for (let i = 0; i < b.length; i++) {
        const r = this.fuehre(b[i], s);
        if (r !== undefined) return r;
      }
      return undefined;
    }

    schreibeVar(v, w, sc, name) {
      if (v.g) {
        if (v.unbelegt) v.unbelegt = false;
        else if (!(v.besitzer !== null && sc.ctx.ktor && sc.ctx.dies === v.besitzer)) {
          throw this.ananas('GebackenAnanas', '\'' + name + '\' ist gebacken und kann nicht mehr verändert werden.');
        }
      }
      if (v.t !== null) this.pruefeTyp(v.t, w, name);
      v.w = w;
      v.weg = false;
    }

    zielVar(ziel, sc) {
      if (ziel.k === 'Name') {
        const v = this.finde(sc, ziel.n);
        if (v === null) throw this.ananas('LaufzeitAnanas', '\'' + ziel.n + '\' ist nicht definiert.');
        return v;
      }
      const o = this.ausw(ziel.obj, sc);
      if (o === null || o === undefined) throw this.leer();
      let v = null;
      if (o instanceof Obj) {
        v = o.felder.get(ziel.name);
        if (v === undefined) v = this.statischesFeld(o.klasse, ziel.name);
        if (v === null) throw this.ananas('LaufzeitAnanas', 'Feld \'' + ziel.name + '\' gibt es auf ' + o.klasse.name + ' nicht.');
        if (v.mod !== null) this.pruefeZugriff(v, o, sc.ctx, ziel.name);
      } else if (o instanceof Klasse) {
        v = this.statischesFeld(o, ziel.name);
        if (v === null) throw this.ananas('LaufzeitAnanas', 'Feld \'' + ziel.name + '\' gibt es in Klasse ' + o.name + ' nicht.');
        if (v.mod !== null) this.pruefeZugriff(v, null, sc.ctx, ziel.name);
      } else throw this.ananas('TypAnanas', 'Auf ' + this.typName(o) + ' kann man keine Felder setzen.');
      return v;
    }

    fuehre(n, sc) {
      if (++this.schritte > this.grenze) this.grenzeErreicht();
      this.z = n.z; this.s = n.s;
      if (++this.st > MAX_STAPEL) { this.st--; throw this.stapel(); }
      let r;
      switch (n.k) {
        case 'AusdrAnw': this.ausw(n.e, sc); break;
        case 'Zuw': this.sZuw(n, sc); break;
        case 'Var': this.sVar(n, sc); break;
        case 'Inc': this.sInc(n, sc); break;
        case 'Block': r = this.block(n, sc); break;
        case 'Falls': r = this.sFalls(n, sc); break;
        case 'Solange': r = this.sSolange(n, sc); break;
        case 'Fuer': r = this.sFuer(n, sc); break;
        case 'FuerJedes': r = this.sFuerJedes(n, sc); break;
        case 'Waehle': r = this.sWaehle(n, sc); break;
        case 'Serviere':
          this.rueck = n.e === null ? null : this.ausw(n.e, sc);
          r = RET;
          break;
        case 'Wirf': throw this.sWirf(n, sc);
        case 'Probier': r = this.probier(n, sc); break;
        case 'Abbrechen': r = BRK; break;
        case 'Weiter': r = CNT; break;
        case 'Leer': break;
        case 'Klasse': case 'Rezeptur': case 'Enum': case 'Belag': case 'Methode': break;
        default: throw this.ananas('LaufzeitAnanas', 'Unbekannte Anweisung \'' + n.k + '\'.');
      }
      this.st--;
      return r;
    }

    sZuw(n, sc) {
      const ziel = n.ziel;
      const name = ziel.k === 'Name' ? ziel.n : ziel.name;
      const v = this.zielVar(ziel, sc);
      let w;
      if (n.op === '=') {
        w = this.ausw(n.wert, sc);
        if (w instanceof Pizza && (n.wert.k === 'Name' || n.wert.k === 'Mem')) throw this.besitz();
      } else {
        if (v.weg) throw this.weggeschoben(name);
        w = this.binaer(n.op[0], v.w, this.ausw(n.wert, sc), n);
      }
      this.schreibeVar(v, w, sc, name);
    }
    sVar(n, sc) {
      const typ = n.typ;
      const ds = n.decls;
      for (let i = 0; i < ds.length; i++) {
        const d = ds[i];
        if (d.init !== null) {
          const v = this.ausw(d.init, sc);
          if (v instanceof Pizza && (d.init.k === 'Name' || d.init.k === 'Mem')) throw this.besitz();
          this.pruefeTyp(typ, v, d.name);
          sc.vars.set(d.name, new Var(v, typ, n.gebacken));
        } else {
          const x = new Var(standardWert(typ), typ, n.gebacken);
          x.unbelegt = true;
          sc.vars.set(d.name, x);
        }
      }
    }
    sInc(n, sc) {
      const ziel = n.ziel;
      const name = ziel.k === 'Name' ? ziel.n : ziel.name;
      const v = this.zielVar(ziel, sc);
      if (v.weg) throw this.weggeschoben(name);
      const alt = v.w;
      const w = typeof alt === 'number' ? alt + n.d : this.binaer('+', alt, n.d, n);
      this.schreibeVar(v, w, sc, name);
    }
    sFalls(n, sc) {
      const c = this.ausw(n.c, sc);
      if (c === true) return this.block(n.dann, sc);
      if (c !== false) this.bool(c);
      if (n.sonst !== null) return n.sonst.k === 'Block' ? this.block(n.sonst, sc) : this.fuehre(n.sonst, sc);
      return undefined;
    }
    sSolange(n, sc) {
      for (;;) {
        const c = this.ausw(n.c, sc);
        if (c !== true) { if (c === false) break; this.bool(c); }
        const r = this.block(n.body, sc);
        if (r !== undefined) {
          if (r === BRK) break;
          if (r === CNT) continue;
          return r;
        }
      }
      return undefined;
    }
    sFuer(n, sc) {
      const s = new Scope(sc, null, false);
      if (n.init !== null) this.fuehre(n.init, s);
      const upd = n.upd;
      for (;;) {
        if (n.c !== null) {
          const c = this.ausw(n.c, s);
          if (c !== true) { if (c === false) break; this.bool(c); }
        }
        const r = this.block(n.body, s);
        if (r !== undefined) {
          if (r === BRK) break;
          if (r !== CNT) return r;
        }
        for (let i = 0; i < upd.length; i++) this.fuehre(upd[i], s);
      }
      return undefined;
    }
    sFuerJedes(n, sc) {
      const q = this.ausw(n.quelle, sc);
      let liste;
      if (Array.isArray(q)) liste = q.slice();
      else if (typeof q === 'string') liste = Array.from(q);
      else if (q instanceof Map) liste = Array.from(q.keys());
      else if (q instanceof EnumTyp) liste = q.werte.slice();
      else if (q instanceof Pizza) liste = q.schichten.slice();
      else if (q === null) throw this.leer();
      else throw this.ananas('TypAnanas', 'Über ' + this.typName(q) + ' kann man nicht laufen.');
      for (let i = 0; i < liste.length; i++) {
        const s = new Scope(sc, null, false);
        const v = liste[i];
        if (n.typ !== null) this.pruefeTyp(n.typ, v, n.name);
        s.vars.set(n.name, new Var(v, n.typ, false));
        const r = this.block(n.body, s);
        if (r !== undefined) {
          if (r === BRK) break;
          if (r !== CNT) return r;
        }
      }
      return undefined;
    }
    sWaehle(n, sc) {
      const v = this.ausw(n.subj, sc);
      const c = this.waehleFall(n, v, sc);
      if (c === null) return undefined;
      const r = c.body.k === 'Block' ? this.block(c.body, sc) : this.fuehre(c.body, sc);
      if (r === BRK) return undefined;
      return r;
    }
    sWirf(n, sc) {
      const v = this.ausw(n.e, sc);
      if (v instanceof Obj) return new AnanasWurf(v, n.z, n.s);
      if (v === null || v === undefined) return this.leer();
      return this.ananas('TypAnanas', 'Werfen kann man nur Ananas (Objekte), nicht ' + this.darstellung(v) + '.');
    }

    randErlaubt(e) {
      return e instanceof AnanasWurf || e instanceof BudgetSig;
    }

    probier(n, sc) {
      let r;
      const st0 = this.st;
      try {
        try {
          r = this.block(n.block, sc);
        } catch (e0) {
          this.st = st0;
          const e = this.normalisiere(e0);
          if (!(e instanceof AnanasWurf)) throw e;
          const f = this.findeFang(n.faenge, e.obj);
          if (f === null) throw e;
          const s2 = new Scope(sc, null, false);
          s2.vars.set(f.name, new Var(e.obj, null, false));
          r = this.block(f.block, s2);
        }
      } catch (e0) {
        this.st = st0;
        const e = this.normalisiere(e0);
        if (n.rand !== null && this.randErlaubt(e)) {
          const rr = this.block(n.rand, sc);
          if (rr !== undefined) return rr;
        }
        throw e;
      }
      if (n.rand !== null) {
        const rr = this.block(n.rand, sc);
        if (rr !== undefined) return rr;
      }
      return r;
    }

    // ---------- Programmende ----------
    behandleEnde(e0) {
      const e = this.normalisiere(e0);
      if (e instanceof PanikSig) {
        this.emit({ typ: 'panik', text: PANIK_BANNER });
        return 39;
      }
      if (e instanceof PizzaFehlerSig) {
        this.emit({ typ: 'fehler', code: e.code, art: 'pizzafehler', text: 'PizzaFehler ' + e.code + ': ' + e.text, zeile: e.zeile, spalte: e.spalte });
        return 2;
      }
      if (e instanceof LimitSig) {
        this.emit({ typ: 'fehler', code: 'P0002', art: 'limit', text: 'PizzaFehler P0002: Die Pizza ist noch im Ofen. (Schrittlimit erreicht – Endlosschleife?)', zeile: this.z, spalte: this.s });
        return 3;
      }
      if (e instanceof AnanasWurf) {
        const o = e.obj;
        let beschr;
        if (this.istAnanasKlasse(o.klasse)) beschr = o.klasse.name + ': ' + o.nachricht;
        else {
          try { beschr = this.objText(o); } catch (x) { beschr = o.klasse.name + '@' + o.nr; }
        }
        this.emit({
          typ: 'fehler', code: o.klasse.name, art: 'ananas',
          text: 'Ungefangene Ananas – ' + beschr + (e.zeile != null ? ' (Zeile ' + e.zeile + ')' : ''),
          zeile: e.zeile == null ? null : e.zeile, spalte: e.spalte == null ? null : e.spalte
        });
        return 1;
      }
      const msg = e && e.message ? e.message : String(e);
      this.emit({
        typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas',
        text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.' + (this.z != null ? ' (Zeile ' + this.z + ')' : ''),
        zeile: this.z, spalte: this.s, detail: msg
      });
      return 1;
    }
  }

  // =====================================================================
  // API
  // =====================================================================

  function run(quelltext, optionen) {
    optionen = optionen || {};
    const ereignisse = [];
    const onEvent = typeof optionen.onEvent === 'function' ? optionen.onEvent : null;
    const emit = (e) => {
      ereignisse.push(e);
      if (onEvent !== null) { try { onEvent(e); } catch (x) { /* Beobachterfehler ignorieren */ } }
    };
    let L = null, exitCode = 0;
    const p = parse(quelltext);
    if (!p.ok) {
      emit({ typ: 'fehler', code: p.fehler.code, art: 'syntax', text: p.fehler.text, zeile: p.fehler.zeile, spalte: p.fehler.spalte });
      exitCode = 2;
    } else {
      try {
        L = new Laufzeit(p.ast, optionen, emit);
        for (const w of analysiere(p.ast)) {
          const key = w.code + ':' + w.zeile + ':' + w.spalte;
          if (L.warnSet.has(key)) continue;
          L.warnSet.add(key);
          emit({ typ: 'warnung', code: w.code, text: w.text, zeile: w.zeile, spalte: w.spalte });
        }
        L.start();
      } catch (e) {
        if (L) {
          try { exitCode = L.behandleEnde(e); }
          catch (e2) {
            emit({ typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas', text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', zeile: null, spalte: null, detail: String(e2 && e2.message) });
            exitCode = 1;
          }
        } else {
          emit({ typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas', text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', zeile: null, spalte: null, detail: String(e && e.message) });
          exitCode = 1;
        }
      }
    }
    const schritte = L ? L.schritte : 0;
    const zeitMs = L ? L.schritte + L.offset : 0;
    emit({ typ: 'ende', exitCode, schritte, zeitMs });
    return { exitCode, ereignisse, schritte, zeitMs };
  }

  return {
    version: VERSION,
    KEYWORDS: KEYWORDS.slice(),
    TYPEN: TYPEN.slice(),
    BUILTINS: BUILTINS.slice(),
    BELAEGE: BELAEGE.map(b => ({ name: b.name, preis: b.preis, nach: b.nach.slice() })),
    ANANAS: ANANAS.slice(),
    PANIK_TEXT: PANIK_BANNER,
    parse,
    run
  };
});
