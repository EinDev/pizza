/*
 * pizza v3.1 – Interpreter
 * Lexer · Parser · Tree-Walking-Laufzeit · Standardbibliothek
 * UMD ohne Abhängigkeiten: Browser/Worker → self.PizzaLang, Node → module.exports
 *
 * GENERIERT aus site/js/pizza/ mit `node scripts/baue-pizza.js` – nicht von Hand bearbeiten.
 */
(function (root, fabrik) {
  'use strict';
  var api = fabrik();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else if (root) root.PizzaLang = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // ══════════ site/js/pizza/kopf.js ══════════
  // pizza-Interpreter · Konstanten (Version, Schlüsselwörter, Typen, Ananas-Baum, Grenzen)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // =====================================================================
  // Konstanten
  // =====================================================================

  const VERSION = '3.1.0';

  const KEYWORDS = [
    'paket', 'import', 'klasse', 'rezeptur', 'rohling', 'calzone', 'quattrostagioni',
    'erbt', 'erfüllt', 'speisekarte', 'familienrezept', 'geheimrezept', 'tiefkühl', 'gebacken',
    'leer', 'neu', 'dies', 'unten', 'serviere', 'falls', 'sonst', 'für', 'solange', 'wähle', 'fall', 'standard',
    'probier', 'verbrannt', 'rand', 'wirf', 'wirft', 'abbrechen', 'weiter', 'ja', 'nein', 'karton', 'ofen', 'roh'
  ];
  const KW = new Set(KEYWORDS);

  const TYPEN = ['salami', 'funghi', 'margherita', 'diavolo', 'Dauer', 'Blech', 'Speisekarte',
    'Teig', 'Lieferung', 'Zustellung', 'Reste', 'Rohling', 'hawaii',
    'Theke', 'Zutat', 'Schild', 'Knopf', 'Eingabe', 'Haken', 'Stapel', 'Reihe',
    'Takt', 'Fortschritt', 'Abschnitt', 'Tabelle', 'Reiter', 'Auswahl', 'Tastatur', 'Zettel', 'Zufall', 'Vorratskammer'];

  const BUILTINS = ['Bote', 'Bestellannahme', 'Uhr', 'Mathe', 'Zufall', 'Spiegel', 'teig', 'bestelle', 'schieb', 'zwischenstand', 'Kiste'];

  // Reihenfolge verbindlich (SPEC §8, K-105): PizzaLang.ANANAS und die Klassenindizes der Wasm-Laufzeit spiegeln sie.
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
    ['GebackenAnanas', 'LaufzeitAnanas'],
    ['TypAnanas', 'LaufzeitAnanas'],
    ['KeinStückAnanas', 'LaufzeitAnanas'],
    ['ZugriffsAnanas', 'LaufzeitAnanas'],
    ['ZugeklapptAnanas', 'LaufzeitAnanas'],
    ['UnbekanntePizzaAnanas', 'LaufzeitAnanas'],
    ['KüchenAnanas', 'LaufzeitAnanas']        // Küchenbrigade (THREADS.md §2.3) – am Ende angehängt, Indizes bleiben
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

  // ══════════ site/js/pizza/lexer.js ══════════
  // pizza-Interpreter · Lexer
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

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

  // ══════════ site/js/pizza/parser.js ══════════
  // pizza-Interpreter · Parser (AST, parse)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // =====================================================================
  // PARSER
  // =====================================================================

  function sichtbarkeit(mods) {
    if (mods.indexOf('geheimrezept') >= 0) return 'geheimrezept';
    if (mods.indexOf('familienrezept') >= 0) return 'familienrezept';
    return null;
  }

  class Parser {
    constructor(q, toks) {
      this.q = q; this.t = toks; this.p = 0; this.keinLambda = false;
      this.ks = { schleife: false, waehle: false };
      this.generika = new Set();   // Namen aus Typparameter-Listen (<T>) – für die Sichtbarkeitsprüfung des Laders (SPEC §2.4)
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
        // SPEC §2.2: `bestellt "<pfad>";` – kontextuell (Bezeichner + Textliteral ist sonst nie gültig), nur auf oberster Ebene
        if (this.c.t === 'name' && this.c.v === 'bestellt' && this.sieh(1).t === 'text') {
          const tok = this.nimm(), pt = this.nimm();
          if (pruefePfad(pt.v) !== null) throw new SyntaxFehler(pfadFehlerText(pt.v), tok.z, tok.s, 'P0015');
          this.erwarteSemi('nach \'bestellt\'');
          body.push({ k: 'Bestellt', pfad: pt.v, z: tok.z, s: tok.s });
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
      if (this.istKw('klasse') || this.istKw('rezeptur') || this.istKw('quattrostagioni')) {
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
        else if (k.t === 'name') this.generika.add(k.v);
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
      return this.quattro(annos, mods, tok);
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
        if (this.istKw('klasse') || this.istKw('rezeptur') || this.istKw('quattrostagioni')) {
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
      return { k: 'Rezeptur', z: tok.z, s: tok.s, name: name.v, nz: name.z, ns: name.s, basen, methoden, mods, annos };
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
      return { k: 'Enum', z: tok.z, s: tok.s, name: name.v, nz: name.z, ns: name.s, werte, mods, annos };
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
          case 'klasse': case 'rezeptur': case 'quattrostagioni':
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
          if (nt.t !== 'name' && nt.t !== 'kw') this.fehler('Erwartet einen Namen nach \'.\', gefunden ' + this.beschreibe(nt));
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

    klammer() {
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
      if (!this.istOp(')')) this.fehler('Erwartet \')\' zum Schließen der Klammer aus Zeile ' + t.z + ', gefunden ' + this.beschreibe(this.c));
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

  // Datei-Index d an jeden Knoten (jedes Objekt mit Position z) schreiben – SPEC §2.6, ARCHITEKTUR §1 (iterativ: tiefe ASTs).
  function setzeDatei(wurzel, d) {
    const stapel = [wurzel];
    while (stapel.length) {
      const n = stapel.pop();
      if (Array.isArray(n)) { for (let i = 0; i < n.length; i++) { const x = n[i]; if (x !== null && typeof x === 'object') stapel.push(x); } continue; }
      if (typeof n.z === 'number' || n.k === 'Programm') n.di = d;
      for (const key in n) { const x = n[key]; if (x !== null && typeof x === 'object') stapel.push(x); }
    }
    return wurzel;
  }

  // Eine Datei parsen → { ast, toks, generika } (wirft SyntaxFehler/RangeError); der Lader braucht Tokens und Typparameter.
  function parseIntern(q, d) {
    const toks = lexe(q);
    const p = new Parser(q, toks);
    const ast = setzeDatei(p.programm(), d || 0);
    return { ast, toks, generika: p.generika };
  }
  function syntaxFehlerAus(e) {
    if (e instanceof SyntaxFehler) return { code: e.code, text: 'PizzaFehler ' + e.code + ': ' + e.text, zeile: e.zeile, spalte: e.spalte };
    if (e instanceof RangeError) return { code: 'P0001', text: 'PizzaFehler P0001: Der Quelltext ist zu tief verschachtelt.', zeile: null, spalte: null };
    return { code: 'P0001', text: 'PizzaFehler P0001: Interner Parserfehler: ' + (e && e.message), zeile: null, spalte: null };
  }
  function parse(quelltext, optionen) {
    const q = quelltext == null ? '' : String(quelltext);
    const d = optionen && Number.isInteger(optionen.datei) && optionen.datei >= 0 ? optionen.datei : 0;
    try {
      return { ok: true, ast: parseIntern(q, d).ast };
    } catch (e) {
      return { ok: false, fehler: syntaxFehlerAus(e) };
    }
  }

  // ══════════ site/js/pizza/analyse.js ══════════
  // pizza-Interpreter · Statische Analyse (Warnungen vor dem Start)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // =====================================================================
  // STATISCHE ANALYSE (Warnungen vor dem Start: W0666, W0032)
  // =====================================================================

  // rang: Datei-Index → Position in der Ladeliste (Projekte, SPEC §14.8); ohne rang zählt nur die Position (eine Datei).
  function analysiere(ast, rang) {
    const warn = [];
    let hawaii = null;
    const r = (d) => (rang ? rang[d || 0] : 0);
    const frueher = (a, b) => r(a.d) - r(b.d) || a.z - b.z || a.s - b.s;
    const merke = (n) => { const o = { z: n.z, s: n.s, d: n.di || 0 }; if (!hawaii || frueher(o, hawaii) < 0) hawaii = o; };
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
            warn.push({ code: 'W0032', text: 'W0032: \'' + a.name + '\' und \'' + b.name + '\' sind im selben Scope definiert. Selbst der Pizzaiolo verwechselt die beiden.', zeile: b.z, spalte: b.s, d: b.d || 0 });
          }
        }
      }
    };
    const declsVon = (stmts, oben) => {
      const r = [];
      for (const st of stmts) {
        if (st.k === 'Var') for (const d of st.decls) r.push({ name: d.name, z: d.z, s: d.s, d: d.di });
        else if (oben && st.k === 'Methode') r.push({ name: st.name, z: st.nz, s: st.ns, d: st.di });
      }
      return r;
    };
    const blockNamen = (b) => { if (b && b.k === 'Block') { gemergt.add(b); return declsVon(b.body, false); } return []; };
    const geh = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const x of n) geh(x); return; }
      switch (n.k) {
        case 'Typ': if (n.name === 'hawaii') merke(n); break;
        case 'Programm': pruefe(declsVon(n.body, true)); break;
        case 'Block': if (!gemergt.has(n)) pruefe(declsVon(n.body, false)); break;
        case 'Methode': case 'Ktor': case 'Lambda':
          pruefe(n.params.map(p => ({ name: p.name, z: p.z, s: p.s, d: p.di })).concat(blockNamen(n.body)));
          break;
        case 'FuerJedes': pruefe([{ name: n.name, z: n.nz, s: n.ns, d: n.di }].concat(blockNamen(n.body))); break;
        case 'Fuer': {
          const ns = n.init && n.init.k === 'Var' ? n.init.decls.map(d => ({ name: d.name, z: d.z, s: d.s, d: d.di })) : [];
          pruefe(ns.concat(blockNamen(n.body)));
          break;
        }
        case 'Klasse': {
          const ns = [];
          for (const f of n.felder) for (const d of f.decls) ns.push({ name: d.name, z: d.z, s: d.s, d: d.di });
          for (const m of n.methoden) ns.push({ name: m.name, z: m.nz, s: m.ns, d: m.di });
          pruefe(ns);
          break;
        }
        case 'Probier':
          for (const f of n.faenge) pruefe([{ name: f.name, z: f.nz, s: f.ns, d: f.di }].concat(blockNamen(f.block)));
          break;
        case 'Ofen':
          if (n.roh) pruefe([{ name: n.roh.name, z: n.roh.nz, s: n.roh.ns, d: n.roh.di }].concat(blockNamen(n.roh.block)));
          for (const f of n.faenge) pruefe([{ name: f.name, z: f.nz, s: f.ns, d: f.di }].concat(blockNamen(f.block)));
          break;
      }
      for (const key in n) {
        const v = n[key];
        if (v && typeof v === 'object') geh(v);
      }
    };
    geh(ast);
    warn.sort((a, b) => r(a.d) - r(b.d) || a.zeile - b.zeile || a.spalte - b.spalte);
    if (hawaii) warn.unshift({ code: 'W0666', text: 'W0666: Typ \'hawaii\' gefunden. Der Pizzaiolo sagt nichts. Er schaut nur.', zeile: hawaii.z, spalte: hawaii.s, d: hawaii.d });
    return warn;
  }

  // ══════════ site/js/pizza/projekt.js ══════════
  // pizza-Interpreter · Projekte: Dateisammlung, Pfade, pizza.json, gemeinsamer Lader (SPEC §2.1 … §2.6, K-138 … K-141)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).
  //
  // PizzaLang.projekt.lade ist DER Lader für alle Motoren (Interpreter jetzt, Compiler ab PROJEKTE PA2): pizza.json,
  // Pfade, Textnormalisierung, Tiefensuche über `bestellt`, Grenzen und die konservativen Projektprüfungen
  // P0014 … P0020 und W0004 in der Reihenfolge von SPEC §2.5. Ergebnis ist EIN Programm (Verkettung in Ladereihenfolge),
  // jeder Knoten mit Datei-Index d (dateien[0] = Hauptdatei).

  // =====================================================================
  // PROJEKTE
  // =====================================================================

  const PROJEKT_GRENZEN = { dateien: 100, datei: 2 * 1048576, pizza: 512 * 1024, gesamt: 8 * 1048576 };
  const PFAD_STUECK = /^[a-z0-9_-][a-z0-9_.-]*$/;
  const TEXT_ENDUNGEN = ['.pizza', '.txt', '.json', '.csv', '.md'];
  const PRUEFUNG = 'pruefung/';
  // in Nebendateien erlaubte oberste Knoten (SPEC §2.3; paket/import verwirft schon der Parser, Leer = einzelnes ';')
  const NEBEN_ERLAUBT = new Set(['Bestellt', 'Klasse', 'Rezeptur', 'Enum', 'Methode', 'Var', 'Leer']);

  // SPEC §2.1: null = gültig, sonst ein kurzer Grund (Text). Dieselbe Regel prüft die Durchreiche unabhängig.
  function pruefePfad(pfad) {
    if (typeof pfad !== 'string') return 'Ein Dateipfad ist ein Text.';
    if (pfad.length === 0) return 'Der Dateipfad ist leer.';
    if (pfad.length > 120) return 'Der Dateipfad ist länger als 120 Zeichen.';
    const teile = pfad.split('/');
    if (teile.length > 8) return 'Der Dateipfad hat mehr als 8 Ebenen.';
    for (const t of teile) {
      if (t === '') return 'Der Dateipfad hat ein leeres Stück (/ am Anfang, am Ende oder doppelt).';
      if (!PFAD_STUECK.test(t)) return 'Erlaubt sind nur a–z, 0–9, -, _, . und / (kein Stück beginnt mit .).';
    }
    return null;
  }
  function pfadFehlerText(pfad) { return '"' + pfad + '" ist kein gültiger Dateipfad (nur a–z, 0–9, -, _, . und /).'; }
  function istPizzaPfad(pfad) { return pfad.length > 6 && pfad.slice(-6) === '.pizza'; }
  function istTextPfad(pfad) {
    for (const e of TEXT_ENDUNGEN) if (pfad.length > e.length && pfad.slice(-e.length) === e) return true;
    return false;
  }
  // SPEC §2.1: \r\n → \n (einzelnes \r und ein BOM bleiben); idempotent
  function normText(t) { return t.indexOf('\r\n') < 0 ? t : t.replace(/\r\n/g, '\n'); }

  // UTF-8-Länge eines Texts (wie TextEncoder: einzelne Surrogate zählen als U+FFFD = 3 Bytes) – ohne TextEncoder,
  // damit der Lader auch im Worker-Kontext ohne Web-APIs läuft.
  function utf8Laenge(t) {
    let n = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < t.length && (t.charCodeAt(i + 1) & 0xFC00) === 0xDC00) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
  // Strenges UTF-8 (wie TextDecoder fatal, ignoreBOM): ungültig → null; ein BOM bleibt als U+FEFF erhalten.
  function utf8Text(b) {
    let aus = '';
    const teile = [];
    for (let i = 0; i < b.length;) {
      const x = b[i];
      let cp, n;
      if (x < 0x80) { cp = x; n = 1; }
      else if (x >= 0xC2 && x <= 0xDF) { cp = x & 0x1F; n = 2; }
      else if (x >= 0xE0 && x <= 0xEF) { cp = x & 0x0F; n = 3; }
      else if (x >= 0xF0 && x <= 0xF4) { cp = x & 0x07; n = 4; }
      else return null;
      if (i + n > b.length) return null;
      for (let k = 1; k < n; k++) {
        const y = b[i + k];
        if ((y & 0xC0) !== 0x80) return null;
        cp = (cp << 6) | (y & 0x3F);
      }
      if ((n === 3 && (cp < 0x800 || (cp >= 0xD800 && cp <= 0xDFFF))) || (n === 4 && (cp < 0x10000 || cp > 0x10FFFF))) return null;
      aus += String.fromCodePoint(cp);
      if (aus.length > 8192) { teile.push(aus); aus = ''; }
      i += n;
    }
    teile.push(aus);
    return teile.join('');
  }
  // Größen für P0020 (SPEC §2.1): KB ganzzahlig, MB mit einer Nachkommastelle, je aufgerundet, Dezimalkomma
  function kbText(bytes) { return Math.ceil(bytes / 1024) + ' KB'; }
  function mbText(bytes) { const z = Math.ceil(bytes * 10 / 1048576); return Math.floor(z / 10) + ',' + (z % 10) + ' MB'; }

  function ladeFehler(code, text, datei, zeile, spalte, art) {
    return { ok: false, fehler: { code, art: art || 'pizzafehler', text: 'PizzaFehler ' + code + ': ' + text, datei: datei === undefined ? null : datei, zeile: zeile == null ? null : zeile, spalte: spalte == null ? null : spalte } };
  }
  function istBytes(v) { return v instanceof Uint8Array || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(v) && !(v instanceof DataView)); }

  // pizza.json auswerten (SPEC §2.1) – liefert { name, hauptdatei, args, dateien } bzw. { fehler } (P0015/HOST, Ort pizza.json).
  // dateien: normalisierte Sammlung ohne pruefung/ (Texte als String mit \n, Bytes als Uint8Array).
  // vorschlag: Begleitfelder der Hülle { name?, hauptdatei? } – ein ausdrücklich übergebenes hauptdatei hat Vorrang (CLI §1.5).
  function ausDateien(dateien, vorschlag) {
    const f = (code, text, datei) => ladeFehler(code, text, datei).fehler;
    if (dateien === null || typeof dateien !== 'object') return { fehler: f('HOST', 'Ein Projekt braucht Dateien ({ pfad: Inhalt }).', null) };
    vorschlag = vorschlag || {};
    const sammlung = {};
    for (const pfad of Object.keys(dateien).sort()) {
      if (pfad.slice(0, PRUEFUNG.length) === PRUEFUNG) continue;
      let v = dateien[pfad];
      if (typeof v === 'string') { if (istTextPfad(pfad)) v = normText(v); }
      else if (istBytes(v)) {
        const b = v instanceof Uint8Array ? v : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        if (istTextPfad(pfad)) {
          const t = utf8Text(b);
          if (t === null) return { fehler: f('P0015', pfad + ' ist kein gültiger UTF-8-Text.', pruefePfad(pfad) === null ? pfad : null) };
          v = normText(t);
        } else v = b;
      } else return { fehler: f('P0015', 'Die Datei "' + pfad + '" hat keinen Inhalt (Text oder Bytes).', null) };
      sammlung[pfad] = v;
    }
    // 1. pizza.json
    let pj = null;
    if (Object.prototype.hasOwnProperty.call(sammlung, 'pizza.json')) {
      const ungueltig = (grund) => ({ fehler: f('P0015', 'pizza.json ist ungültig: ' + grund + '.', 'pizza.json') });
      const roh = sammlung['pizza.json'];
      try { pj = JSON.parse(typeof roh === 'string' ? roh : ''); } catch (e) { return ungueltig('kein gültiges JSON'); }
      if (pj === null || typeof pj !== 'object' || Array.isArray(pj)) return ungueltig('kein Objekt');
      if (!Object.prototype.hasOwnProperty.call(pj, 'pizza')) return ungueltig('"pizza" fehlt');
      if (typeof pj.pizza !== 'number' || !Number.isInteger(pj.pizza) || pj.pizza < 1) return ungueltig('"pizza" muss eine Ganzzahl sein');
      if (pj.pizza > 1) return { fehler: f('HOST', 'Diese Projektdatei braucht eine neuere pizza-Version.', 'pizza.json') };
      for (const [feld, max] of [['name', 80], ['hauptdatei', 120], ['beschreibung', 500]]) {
        if (pj[feld] === undefined) continue;
        if (typeof pj[feld] !== 'string') return ungueltig('"' + feld + '" muss ein Text sein');
        if (feld !== 'hauptdatei' && pj[feld].length > max) return ungueltig('"' + feld + '" ist zu lang');
      }
      if (pj.hauptdatei !== undefined && pruefePfad(pj.hauptdatei) !== null) return { fehler: f('P0015', pfadFehlerText(pj.hauptdatei), 'pizza.json') };
      if (pj.args !== undefined) {
        if (!Array.isArray(pj.args) || pj.args.some(a => typeof a !== 'string')) return ungueltig('"args" muss ein Blech aus Texten sein');
        if (pj.args.length > 32 || pj.args.some(a => a.length > 200)) return ungueltig('"args" ist zu lang');
      }
    }
    // 2. Pfade der Sammlung (Bytefolge), 3. Hauptdatei
    for (const pfad of Object.keys(sammlung)) if (pruefePfad(pfad) !== null) return { fehler: f('P0015', pfadFehlerText(pfad), null) };
    let haupt = typeof vorschlag.hauptdatei === 'string' ? vorschlag.hauptdatei : (pj && pj.hauptdatei !== undefined ? pj.hauptdatei : null);
    if (haupt === null) {
      const pizzas = Object.keys(sammlung).filter(istPizzaPfad);
      haupt = Object.prototype.hasOwnProperty.call(sammlung, 'hauptgang.pizza') || pizzas.length !== 1 ? 'hauptgang.pizza' : pizzas[0];
    }
    if (pruefePfad(haupt) !== null) return { fehler: f('P0015', pfadFehlerText(haupt), null) };
    if (!Object.prototype.hasOwnProperty.call(sammlung, haupt)) return { fehler: f('P0015', 'Die Datei "' + haupt + '" gibt es im Projekt nicht.', null) };
    if (!istPizzaPfad(haupt)) return { fehler: f('P0015', '"' + haupt + '" ist keine .pizza-Datei – bestellen kann man nur Rezepte.', null) };
    const saeubere = (t) => t.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 80);
    let name = pj && pj.name !== undefined ? pj.name : (typeof vorschlag.name === 'string' ? vorschlag.name : null);
    if (name === null || saeubere(name) === '') name = haupt.slice(haupt.lastIndexOf('/') + 1, -6);
    return { name: saeubere(name), hauptdatei: haupt, args: pj && pj.args ? pj.args.slice() : [], dateien: sammlung };
  }

  // Oberste Namen einer Datei (SPEC §2.4): Klassen/Rezepturen/quattrostagioni (auch verschachtelte), Funktionen, Variablen
  function obersteNamen(body) {
    const r = [];
    const typ = (n, geheim) => {
      r.push({ name: n.name, z: n.nz, s: n.ns, geheim });
      if (n.k === 'Klasse') for (const i of n.innere) typ(i, false);
    };
    for (const st of body) {
      const geheim = !!(st.mods && st.mods.indexOf('geheimrezept') >= 0);
      if (st.k === 'Klasse' || st.k === 'Rezeptur' || st.k === 'Enum') typ(st, geheim);
      else if (st.k === 'Methode') r.push({ name: st.name, z: st.nz, s: st.ns, geheim });
      else if (st.k === 'Var') for (const d of st.decls) r.push({ name: d.name, z: d.z, s: d.s, geheim });
    }
    r.sort((a, b) => a.z - b.z || a.s - b.s);
    return r;
  }
  // In einer Datei lokal gebundene Namen (Variablen in Blöcken, Parameter, Lambda-, für-, Fang-, roh-Variablen) – §2.4 (d)
  function lokaleNamen(ast, ziel) {
    const stapel = [ast];
    while (stapel.length) {
      const n = stapel.pop();
      if (Array.isArray(n)) { for (const x of n) if (x !== null && typeof x === 'object') stapel.push(x); continue; }
      if (n.k === 'Var') for (const d of n.decls) ziel.add(d.name);
      else if (n.k === 'FuerJedes') ziel.add(n.name);
      if (Array.isArray(n.params)) for (const p of n.params) ziel.add(p.name);
      if (Array.isArray(n.faenge)) for (const fa of n.faenge) ziel.add(fa.name);
      if (n.k === 'Ofen' && n.roh) ziel.add(n.roh.name);
      for (const key in n) { const x = n[key]; if (x !== null && typeof x === 'object') stapel.push(x); }
    }
  }
  // Mitgliedsnamen aller Klassen/Rezepturen und Wertnamen aller quattrostagioni (§2.4 (d), projektweit)
  function mitgliedsNamen(body, ziel) {
    const typ = (n) => {
      if (n.k === 'Klasse') {
        for (const f of n.felder) for (const d of f.decls) ziel.add(d.name);
        for (const m of n.methoden) ziel.add(m.name);
        for (const i of n.innere) typ(i);
      } else if (n.k === 'Rezeptur') for (const m of n.methoden) ziel.add(m.name);
      else if (n.k === 'Enum') for (const w of n.werte) ziel.add(w.n);
    };
    for (const st of body) typ(st);
  }
  // erste hauptgang-Methode/-Funktion einer Datei (auch in verschachtelten Klassen) – für P0017
  function hauptgangIn(body) {
    let best = null;
    const nimm = (m) => { if (m.name === 'hauptgang' && (!best || m.nz < best.nz || (m.nz === best.nz && m.ns < best.ns))) best = m; };
    const klasse = (k) => { for (const m of k.methoden) nimm(m); for (const i of k.innere) if (i.k === 'Klasse') klasse(i); };
    for (const st of body) {
      if (st.k === 'Methode') nimm(st);
      else if (st.k === 'Klasse') klasse(st);
    }
    return best;
  }

  // Der gemeinsame Lader (ARCHITEKTUR §1). quelle: Text (Ein-Datei-Programm ohne Sammlung) oder Projekt { dateien, hauptdatei?, name? }.
  // → { ok: true, ladeliste, dateien, ast, warnungen, args, kiste, name, hauptdatei } | { ok: false, fehler: { code, art, text, datei, zeile, spalte } }
  function ladeProjekt(quelle) {
    const einzeln = quelle === null || quelle === undefined || typeof quelle !== 'object';
    const projekt = einzeln ? { dateien: { 'hauptgang.pizza': quelle == null ? '' : String(quelle) } } : quelle;
    // Stufe 1: pizza.json, Pfade, Hauptdatei (SPEC §2.5)
    const aus = ausDateien(projekt.dateien, einzeln ? null : { name: projekt.name, hauptdatei: projekt.hauptdatei });
    if (aus.fehler) return { ok: false, fehler: aus.fehler };
    const sammlung = aus.dateien, haupt = aus.hauptdatei;
    // Ort eines Ladefehlers (SPEC §2.6): Text-Programme nennen nie eine Datei; in Sammlungen nennt ihn jeder Fehler an einem
    // `bestellt` und – sobald die Sammlung mehr als eine .pizza-Datei hat – jeder andere Fehler mit Ort.
    const mehrPizza = Object.keys(sammlung).filter(istPizzaPfad).length > 1;
    const ort = (pfad, ausBestellt) => (einzeln || !(ausBestellt || mehrPizza) ? null : pfad);

    // Stufe 2: Tiefensuche (Syntaxfehler, P0014, P0015 in Besuchsreihenfolge)
    const info = new Map();     // pfad → { d, ast, toks, generika, bestellt: Set }
    const dateien = [];         // Datei-Index → Pfad (Besuchsreihenfolge, [0] = Hauptdatei)
    const ladeliste = [];
    const aktiv = [];
    const w0004 = [];
    let fehler = null;
    const besuche = (pfad) => {
      const d = dateien.length;
      dateien.push(pfad);
      aktiv.push(pfad);
      let p;
      try { p = parseIntern(sammlung[pfad], d); }
      catch (e) {
        const sf = syntaxFehlerAus(e);
        fehler = { ok: false, fehler: { code: sf.code, art: 'syntax', text: sf.text, datei: ort(pfad, sf.code === 'P0015'), zeile: sf.zeile, spalte: sf.spalte } };
        return;
      }
      const eintrag = { d, ast: p.ast, toks: p.toks, generika: p.generika, bestellt: new Set() };
      info.set(pfad, eintrag);
      for (const b of p.ast.body) {
        if (b.k !== 'Bestellt') continue;
        const q = b.pfad;
        if (!istPizzaPfad(q)) { fehler = ladeFehler('P0015', '"' + q + '" ist keine .pizza-Datei – bestellen kann man nur Rezepte.', ort(pfad, true), b.z, b.s); return; }
        if (eintrag.bestellt.has(q)) { w0004.push({ code: 'W0004', text: 'W0004: "' + q + '" ist schon bestellt.', pfad, z: b.z, s: b.s }); continue; }
        eintrag.bestellt.add(q);
        if (aktiv.indexOf(q) >= 0) { fehler = ladeFehler('P0014', 'Kreisbestellung: ' + aktiv.concat([q]).join(' → ') + '.', ort(pfad, true), b.z, b.s); return; }
        if (info.has(q)) continue;
        if (!Object.prototype.hasOwnProperty.call(sammlung, q)) { fehler = ladeFehler('P0015', 'Die Datei "' + q + '" gibt es im Projekt nicht.', ort(pfad, true), b.z, b.s); return; }
        besuche(q);
        if (fehler) return;
      }
      aktiv.pop();
      ladeliste.push(pfad);
    };
    besuche(haupt);
    if (fehler) return fehler;

    // Stufe 3: Grenzen der Sammlung (ohne pruefung/)
    const pfade = Object.keys(sammlung);
    if (pfade.length > PROJEKT_GRENZEN.dateien) return ladeFehler('P0020', 'Das Projekt ist zu groß für den Ofen (' + pfade.length + ' Dateien, höchstens ' + PROJEKT_GRENZEN.dateien + ').');
    let gesamt = 0;
    for (const pfad of pfade) {
      const v = sammlung[pfad];
      const n = typeof v === 'string' ? utf8Laenge(v) : v.length;
      gesamt += n;
      if (istPizzaPfad(pfad) && n > PROJEKT_GRENZEN.pizza) return ladeFehler('P0020', 'Das Projekt ist zu groß für den Ofen (' + pfad + ' hat ' + kbText(n) + ', höchstens 512 KB).');
      if (n > PROJEKT_GRENZEN.datei) return ladeFehler('P0020', 'Das Projekt ist zu groß für den Ofen (' + pfad + ' hat ' + mbText(n) + ', höchstens 2 MB).');
    }
    if (gesamt > PROJEKT_GRENZEN.gesamt) return ladeFehler('P0020', 'Das Projekt ist zu groß für den Ofen (zusammen ' + mbText(gesamt) + ', höchstens 8 MB).');

    const rang = new Array(dateien.length);
    ladeliste.forEach((pfad, i) => { rang[info.get(pfad).d] = i; });
    const mehr = ladeliste.length > 1;
    if (mehr) {
      // Stufe 4a: P0017 – Nebendateien nur mit Rezepten, hauptgang nur in der Hauptdatei
      for (const pfad of ladeliste) {
        if (pfad === haupt) continue;
        const body = info.get(pfad).ast.body;
        let st = null;
        for (const x of body) if (!NEBEN_ERLAUBT.has(x.k)) { st = x; break; }
        const hg = hauptgangIn(body);
        if (hg && (!st || hg.nz < st.z || (hg.nz === st.z && hg.ns < st.s))) {
          return ladeFehler('P0017', 'hauptgang gehört in die Hauptdatei ' + haupt + ', nicht nach ' + pfad + '.', pfad, hg.nz, hg.ns);
        }
        if (st) return ladeFehler('P0017', 'In ' + pfad + ' dürfen nur Rezepte stehen (Klassen, Funktionen, Variablen) – Anweisungen gehören in die Hauptdatei ' + haupt + '.', pfad, st.z, st.s);
      }
      // Stufe 4b: P0016 – ein Projekt-Namensraum
      const besitzer = new Map();   // name → { pfad, z, geheim }
      for (const pfad of ladeliste) {
        for (const n of obersteNamen(info.get(pfad).ast.body)) {
          const b = besitzer.get(n.name);
          if (!b) { besitzer.set(n.name, { pfad, z: n.z, geheim: n.geheim }); continue; }
          if (b.pfad === pfad) { if (n.geheim) b.geheim = true; continue; }
          return ladeFehler('P0016', '\'' + n.name + '\' gibt es zweimal – in ' + b.pfad + ' (Zeile ' + b.z + ') und in ' + pfad + ' (Zeile ' + n.z + ').', pfad, n.z, n.s);
        }
      }
      // Stufe 4c: P0018/P0019 – Sichtbarkeit (konservativ, auf den Tokens jeder Datei)
      const mitglieder = new Set();
      for (const pfad of ladeliste) mitgliedsNamen(info.get(pfad).ast.body, mitglieder);
      for (const pfad of ladeliste) {
        const e = info.get(pfad);
        const lokal = new Set(e.generika);
        lokaleNamen(e.ast.body, lokal);
        const t = e.toks;
        let anno = 0;   // Klammertiefe in Annotations-Argumenten (dort ist auch `name = wert` ein benanntes Argument)
        for (let i = 0; i < t.length; i++) {
          const k = t[i];
          if (k.t === 'kw' && (k.v === 'paket' || k.v === 'import')) { while (i + 1 < t.length && !(t[i + 1].t === 'op' && t[i + 1].v === ';') && t[i + 1].t !== 'eof') i++; continue; }
          if (k.t === 'op') {
            if (anno > 0) { if (k.v === '(') anno++; else if (k.v === ')') anno--; }
            else if (k.v === '(' && i >= 2 && t[i - 1].t === 'name' && (t[i - 2].t === 'op' && (t[i - 2].v === '@' || t[i - 2].v === '.'))) {
              // Annotation @a(…) bzw. @a.b(…): Rückwärts bis zum '@' prüfen
              let j = i - 1;
              while (j >= 2 && t[j - 1].t === 'op' && t[j - 1].v === '.' && t[j - 2].t === 'name') j -= 2;
              if (j >= 1 && t[j - 1].t === 'op' && t[j - 1].v === '@') anno = 1;
            }
            continue;
          }
          if (k.t !== 'name') continue;
          if (k.v === 'bestellt' && t[i + 1].t === 'text') { i++; continue; }
          const vor = i > 0 ? t[i - 1] : null, nach = t[i + 1];
          if (vor && vor.t === 'op' && (vor.v === '.' || vor.v === '@')) continue;
          if (nach.t === 'op' && (nach.v === ':' || (anno > 0 && nach.v === '='))) continue;
          const b = besitzer.get(k.v);
          if (!b || b.pfad === pfad || lokal.has(k.v) || mitglieder.has(k.v)) continue;
          if (b.geheim) return ladeFehler('P0018', '\'' + k.v + '\' ist ein Geheimrezept von ' + b.pfad + '.', pfad, k.z, k.s);
          if (!e.bestellt.has(b.pfad)) return ladeFehler('P0019', '\'' + k.v + '\' kommt aus ' + b.pfad + ' – bestelle die Datei hier: bestellt "' + b.pfad + '";', pfad, k.z, k.s);
        }
      }
    }

    // EIN Programm: Rümpfe in Ladereihenfolge (ohne Bestellt-Knoten), Hoisting/Snack-Modus wie SPEC §2
    let ast;
    if (!mehr) {
      ast = info.get(haupt).ast;
      if (ast.body.some(x => x.k === 'Bestellt')) ast.body = ast.body.filter(x => x.k !== 'Bestellt');
    } else {
      const body = [];
      for (const pfad of ladeliste) for (const x of info.get(pfad).ast.body) if (x.k !== 'Bestellt') body.push(x);
      ast = { k: 'Programm', z: 1, s: 1, di: 0, body };
    }
    ast.dateiPfade = mehr ? dateien.slice() : null;   // null = Ein-Datei-Programm (Feld datei der Ereignisse bleibt null)
    ast.ladeRang = rang;                               // Datei-Index → Position in der Ladeliste (Reihenfolge der Warnungen)
    w0004.sort((a, b) => rang[info.get(a.pfad).d] - rang[info.get(b.pfad).d] || a.z - b.z || a.s - b.s);
    const warnungen = w0004.map(w => ({ code: w.code, text: w.text, datei: mehr ? w.pfad : null, zeile: w.z, spalte: w.s, d: info.get(w.pfad).d }));
    return { ok: true, ladeliste, dateien, ast, warnungen, args: aus.args, kiste: sammlung, name: aus.name, hauptdatei: haupt };
  }

  // Öffentliche Sicht von projekt.lade: ohne interne Felder (d an Warnungen bleibt am AST)
  function projektLade(quelle) {
    const r = ladeProjekt(quelle);
    if (!r.ok) return r;
    return {
      ok: true, ladeliste: r.ladeliste.slice(), dateien: r.dateien.slice(), ast: r.ast,
      warnungen: r.warnungen.map(w => ({ code: w.code, text: w.text, datei: w.datei, zeile: w.zeile, spalte: w.spalte })),
      args: r.args.slice(), kiste: r.kiste, name: r.name, hauptdatei: r.hauptdatei
    };
  }

  // ══════════ site/js/pizza/laufzeit/werte.js ══════════
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

  class AnanasWurf { constructor(obj, z, s, d) { this.obj = obj; this.zeile = z; this.spalte = s; this.d = d || 0; } }
  class PizzaFehlerSig { constructor(code, text, z, s, d) { this.code = code; this.text = text; this.zeile = z; this.spalte = s; this.d = d || 0; } }
  // Doppelmeldungs-Sperre der Warnungen: einmal je Code + Datei + Zeile + Spalte (SPEC §2.6, K-140)
  function warnSchluessel(code, d, z, s) { return code + ':' + (d || 0) + ':' + z + ':' + s; }
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

  // ══════════ site/js/pizza/laufzeit/kern.js ══════════
  // pizza-Interpreter · Laufzeit-Kern (Konstruktor, Hilfen, Eingabe, Budgets, Start, Ende) und laufzeitTeil
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

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
      this.onUi = typeof opt.onUi === 'function' ? opt.onUi : null;
      this.uiWarte = typeof opt.onUiWarte === 'function' ? opt.onUiWarte : null;
      this.uiListe = Array.isArray(opt.uiEreignisse) ? opt.uiEreignisse.slice() : null;
      this.uiPos = 0;
      this.uiTheke = null;
      this.uiZutaten = new Map();
      this.uiIdZaehler = 0;
      this.uiOffen = new Map();
      this.uiAnim = [];  // gepufferte Animationen (K-090), Aufrufreihenfolge
      this.uiBindungen = [];      // Theke v5 (K-116): alle Bindungen in Registrierungsreihenfolge
      this.uiBindungLauf = null;  // die gerade ausgewertete Bindung (Quellenerfassung, K-118-Verbote)
      this.uiDirty = false;       // mindestens eine Bindung ist schmutzig
      // Herd (SPEC §18): Kern-Modul (optionen.herdKern), Renderer-Rückruf onHerd(art, daten), Kern-Instanz und Welt (lazy)
      this.herdOpt = opt.herdKern;
      this.onHerd = typeof opt.onHerd === 'function' ? opt.onHerd : null;
      this.herdSpion = typeof opt.herdSpion === 'function' ? opt.herdSpion : null;   // nur Werkzeuge (tests/herd/zeige.js)
      this.hk = null;
      this.hkFehlt = false;
      this.herd = null;
      this.herdNoetig = false;
      // Kiste (SPEC §11.2) = Sammlung des Laders ohne pruefung/; Bilder (SPEC §18.5): optionen.teiglinge (Cache, geprüft),
      // optionen.vorbacker (teigling.wasm), vorgebackene Teiglinge je Pfad und geladene Bildchen je Pfad
      this.kiste = opt.kiste !== null && typeof opt.kiste === 'object' ? opt.kiste : {};
      this.teiglingeOpt = opt.teiglinge !== null && typeof opt.teiglinge === 'object' ? opt.teiglinge : null;
      this.vorbackerOpt = opt.vorbacker;
      this.teiglinge = new Map();
      this.bildPfade = new Map();
      this.schritte = 0;
      this.offset = 0;
      this.frames = [];
      this.grenze = this.limit;
      this.limitBasis = 0;   // K-087: P0002 bezieht sich auf schritte − limitBasis (neu gesetzt bei jedem Theke-Rückruf)
      this.echtzeit = typeof opt.echtzeit === 'number' && isFinite(opt.echtzeit) ? Math.round(opt.echtzeit) : null;
      this.zone = typeof opt.zone === 'number' && isFinite(opt.zone) ? Math.round(opt.zone) : null;   // K-154
      this.klassen = new Map();
      this.klassenListe = [];
      this.alleMethoden = [];
      this.warnSet = new Set();
      this.lieferungen = [];
      this.lieferNr = 0;
      this.rueck = null;
      this.z = null;
      this.s = null;
      this.d = 0;   // Datei-Index der aktuellen Position (SPEC §2.6); dateiPfade = null bei Ein-Datei-Programmen
      this.dateiPfade = ast && Array.isArray(ast.dateiPfade) ? ast.dateiPfade : null;
      this.st = 0;
      this.instanzen = 0;
      const saat = opt.zufallsSaat;
      this.zufallGlobal = new ZufallGen(typeof saat === 'number' && Number.isInteger(saat) ? saat : 42);
      this.vorratOpt = opt.vorrat !== null && typeof opt.vorrat === 'object' ? opt.vorrat : null;
      this.onVorrat = typeof opt.onVorrat === 'function' ? opt.onVorrat : null;
      this.kammern = new Map();
      this.w0101 = false;
      // Küchenbrigade: aktuelle Küche (null = Hauptküche); kuechenChaos (nur Tests) permutiert die Stück-Reihenfolge
      this.kueche = null;
      this.chaos = typeof opt.kuechenChaos === 'number' && Number.isInteger(opt.kuechenChaos) ? new ZufallGen(opt.kuechenChaos) : null;
      this.globalCtx = { dies: null, klasse: null, ktor: false };
      this.global = new Scope(null, this.globalCtx, true);
      this.globalCache = { cache: null };
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
      // Herd H-K13 (K-152): eingebaute, erbbare Klasse Kniff (Rohling: `neu Kniff()` geht nicht, `erbt Kniff` schon);
      // Laufzeit-Klassenindex 16 im Wasm (nach den 16 Ananas). Eine eigene Klasse Kniff hat Vorrang (Map, spätere gewinnen).
      const kniff = new Klasse('Kniff', null);
      kniff.eingebaut = true;
      kniff.rohling = true;
      this.klassen.set('Kniff', kniff);
      this.kniffWurzel = kniff;
      this.kniffAn = new Map();   // Teil-ID → [Kniff-Obj] in Anhängereihenfolge (herd/kniff.js)
      this.kniffZ = new Map();    // Kniff-Obj → { teil, gestartet }
      const L = this;
      this.globals = new Map([
        ['Bote', new Modul('Bote', BOTE_M, null)],
        ['Bestellannahme', new Modul('Bestellannahme', EINGABE_M, null)],
        ['Uhr', new Modul('Uhr', UHR_M, null)],
        ['Mathe', new Modul('Mathe', MATHE_M, { PI: Math.PI, E: Math.E })],
        ['Zufall', new Modul('Zufall', ZUFALL_M, null)],
        ['Spiegel', new Modul('Spiegel', SPIEGEL_M, null)],
        ['Zettel', new Modul('Zettel', ZETTEL_MOD_M, null)],
        ['Herd', new Modul('Herd', HERD_MOD_M, null)],
        ['Form', new Modul('Form', HERD_FORM_MOD_M, null)],
        ['Bildchen', new Modul('Bildchen', HERD_BILDCHEN_MOD_M, null)],
        ['Kiste', new Modul('Kiste', KISTE_M, null)],
        ['teig', new NativFn('teig', function (pos) { return new Teig(L.funktionArg(pos[0], 'teig')); })],
        ['bestelle', new NativFn('bestelle', function (pos) {
          const l = new Lieferung(L.funktionArg(pos[0], 'bestelle'), ++L.lieferNr);
          L.lieferungen.push(l);
          return l;
        })],
        ['zwischenstand', new NativFn('zwischenstand', function (pos) {
          // in einer Küche zählen nur Öfen, die in der Küche geöffnet wurden (THREADS.md §2.2)
          const basis = L.kueche !== null ? L.kueche.auftrag.frameBasis : 0;
          for (let i = L.frames.length - 1; i >= basis; i--) {
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
    warnung(code, text, node, schluessel, methode) {
      const z = node ? node.z : this.z, s = node ? node.s : this.s, d = node ? node.di : this.d;
      const key = schluessel || warnSchluessel(code, d, z, s);
      const ev = { typ: 'warnung', code, text: code + ': ' + text, datei: this.dateiPfad(d), zeile: z == null ? null : z, spalte: s == null ? null : s };
      if (this.kueche !== null) { this.gibWeiter({ ev, key, m: methode || null }); return; }
      if (this.warnSet.has(key)) return;
      this.warnSet.add(key);
      this.emit(ev);
    }

    ananas(typ, text) {
      const k = this.klassen.get(typ);
      const o = new Obj(k, ++k.zaehler);
      o.nachricht = text;
      return new AnanasWurf(o, this.z, this.s, this.d);
    }

    // Projektpfad zum Datei-Index (SPEC §2.6): null, solange das Programm aus genau einer Datei besteht
    dateiPfad(d) { return this.dateiPfade === null ? null : (this.dateiPfade[d || 0] || null); }
    // Ort im Text der ungefangenen Ananas: „ (Zeile N)“ in der Hauptdatei, „ (pfad, Zeile N)“ in Nebendateien
    ortText(z, d) {
      if (z == null) return '';
      return ' (' + (this.dateiPfade !== null && d ? this.dateiPfad(d) + ', ' : '') + 'Zeile ' + z + ')';
    }
    leer() { return this.ananas('LeererKartonAnanas', 'Der Karton ist leer.'); }
    weggeschoben(name) { return this.ananas('LeererKartonAnanas', '\'' + name + '\' wurde weggeschoben – der Karton ist leer.'); }
    stapel() { return this.ananas('LaufzeitAnanas', 'Zu viele Pizzen übereinander (Stapelüberlauf).'); }
    panik() { return new PanikSig(); }

    normalisiere(e) {
      if (e instanceof RangeError && /call stack|too much recursion|stack/i.test(e.message)) {
        const w = this.stapel();
        return w;
      }
      // Grenze der JS-Engine (Text/Blech zu groß, z. B. `t += t` in einer Schleife): wie der Wasm-Motor als fangbare
      // Kühlschrank-Ananas melden, nicht als interner Fehler (K-014 ist für echte Motorfehler).
      if (e instanceof RangeError && /Invalid (string|array|typed array) length|allocation failed|out of memory/i.test(e.message)) {
        return this.ananas('LaufzeitAnanas', 'Der Kühlschrank ist voll (Speicherlimit erreicht).');
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
      if (v instanceof Obj) return v.klasse.name;
      if (v instanceof EnumWert) return v.typ.name;
      if (v instanceof Klasse || v instanceof EnumTyp || v instanceof Rezeptur) return 'Klasse ' + v.name;
      if (v instanceof Modul) return v.name;
      if (v instanceof Funktion || v instanceof Gebunden || v instanceof NativFn) return 'Funktion';
      if (v instanceof Teig) return 'Teig';
      if (v instanceof Lieferung) return 'Lieferung';
      if (v instanceof Zustellung) return 'Zustellung';
      if (v instanceof Reste) return 'Reste';
      if (v instanceof OfenRoh) return 'Rohling';
      if (v instanceof UiTheke) return 'Theke';
      if (v instanceof UiZutat) return UI_ART_NAME[v.art];
      if (v instanceof Zettel) return 'Zettel';
      if (v instanceof HerdWelt || v instanceof HerdTeil || v instanceof HerdKomp || v instanceof HerdForm || v instanceof HerdBildchen) return herdKlasseVon(v);
      if (v instanceof ZufallGen) return 'Zufall';
      if (v instanceof Kammer) return 'Vorratskammer';
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
    schluessel(k) { return k === undefined ? null : k; }
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
      let g = this.limitBasis + this.limit;
      const fr = this.frames;
      for (let i = 0; i < fr.length; i++) {
        const f = fr[i];
        if (!f.tot) { const x = f.ende - this.offset; if (x < g) g = x; }
      }
      this.grenze = g;
    }
    grenzeErreicht() {
      if (this.schritte > this.limitBasis + this.limit) throw new LimitSig();
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
      if (this.herdNoetig) this.herdKern(true);
      this.vorbacke();     // alle Bilder der Kiste → Teiglinge, Teigmenge (P0020) – zuletzt vor dem Start (SPEC §2.5, §18.5)
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
        this.z = haupt.decl.z; this.s = haupt.decl.s; this.d = haupt.decl.di;
        const pos = haupt.params.length ? [this.args.slice()] : [];
        const dies = haupt.statisch || haupt.klasse === null ? null : this.instanziiere(haupt.klasse, [], null, null);
        this.rufeDecl(haupt, dies, pos, null, null, 'normal');
      }
      this.lieferungenNachEnde();
      this.uiEnde();
    }

    lieferungenNachEnde() {
      for (;;) {
        const offen = this.lieferungen.filter(l => l.rueckruf !== null && l.zustellung === null);
        if (!offen.length) break;
        offen.sort((a, b) => b.prio - a.prio || a.nr - b.nr);
        const l = offen[0];
        const v = this.rufe(l.fn, [], null, null);
        l.zustellung = new Zustellung(true, v, null);
        this.rufe(l.rueckruf, [v], null, null);
      }
    }

    // ---------- Programmende ----------
    behandleEnde(e0) {
      const e = this.normalisiere(e0);
      if (e instanceof PanikSig) {
        this.emit({ typ: 'panik', text: PANIK_BANNER });
        return 39;
      }
      if (e instanceof HerdKernFehlt) {
        this.emit({ typ: 'fehler', code: 'HOST', art: 'intern', text: HERD_KERN_FEHLT, datei: null, zeile: null, spalte: null });
        return 2;
      }
      if (e instanceof VorbackerFehlt) {
        this.emit({ typ: 'fehler', code: 'HOST', art: 'intern', text: VORBACKER_FEHLT, datei: null, zeile: null, spalte: null });
        return 2;
      }
      try { this.uiEnde(); } catch (x) { /* Aufräumen darf das Programmende nicht verhindern */ }
      if (e instanceof PizzaFehlerSig) {
        this.emit({ typ: 'fehler', code: e.code, art: 'pizzafehler', text: 'PizzaFehler ' + e.code + ': ' + e.text, datei: e.zeile == null ? null : this.dateiPfad(e.d), zeile: e.zeile, spalte: e.spalte });
        return 2;
      }
      if (e instanceof LimitSig) {
        this.emit({ typ: 'fehler', code: 'P0002', art: 'limit', text: 'PizzaFehler P0002: Die Pizza ist noch im Ofen. (Schrittlimit erreicht – Endlosschleife?)', datei: this.z == null ? null : this.dateiPfad(this.d), zeile: this.z, spalte: this.s });
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
          text: 'Ungefangene Ananas – ' + beschr + this.ortText(e.zeile, e.d),
          datei: e.zeile == null ? null : this.dateiPfad(e.d), zeile: e.zeile == null ? null : e.zeile, spalte: e.spalte == null ? null : e.spalte
        });
        return 1;
      }
      const msg = e && e.message ? e.message : String(e);
      this.emit({
        typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas',
        text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.' + this.ortText(this.z, this.d),
        datei: this.z == null ? null : this.dateiPfad(this.d), zeile: this.z, spalte: this.s, detail: msg
      });
      return 1;
    }
  }

  // Weitere Laufzeit-Methoden stehen in eigenen Abschnitten als Klassen, deren Methoden hier auf Laufzeit.prototype
  // übertragen werden (gleiche Eigenschaften wie Klassenmethoden; doppelte Namen sind ein Baufehler).
  function laufzeitTeil(teil) {
    const ziel = Laufzeit.prototype, quelle = teil.prototype;
    for (const name of Object.getOwnPropertyNames(quelle)) {
      if (name === 'constructor') continue;
      if (Object.prototype.hasOwnProperty.call(ziel, name)) throw new Error('Laufzeit.' + name + ' ist doppelt definiert.');
      Object.defineProperty(ziel, name, Object.getOwnPropertyDescriptor(quelle, name));
    }
  }

  // ══════════ site/js/pizza/laufzeit/pruefung.js ══════════
  // pizza-Interpreter · Deklarationen registrieren und Startprüfungen (SPEC §14.7)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // Laufzeit: Deklarationen und Startprüfung
  class LaufzeitPruefung {
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

    pf(code, text, n) { return new PizzaFehlerSig(code, text, n ? n.z : null, n ? n.s : null, n ? n.di : 0); }

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
            let ok = md.name === 'alsText' || (this.istAnanasKlasse(k) && md.name in ANANAS_M) || (this.istKniffKlasse(k) && KNIFF_NAMEN.has(md.name));
            if (!ok && k.basis && this.findeMethodeListe(k.basis, md.name)) ok = true;
            if (!ok) {
              for (let c = k; c && !ok; c = c.basis) {
                for (const r of c.erfuellt) if (this.rezepturMethoden(r, new Set()).indexOf(md.name) >= 0) ok = true;
              }
            }
            if (!ok) throw this.pf('A0001', 'Methode \'' + md.name + '\' in \'' + k.name + '\' ist mit @PizzaÜberschreibt markiert, überschreibt aber nichts.', md);
          }
        }
      }
      this.pruefeHerd();
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
              this.z = a.z; this.s = a.s; this.d = a.di;
              m.haltbar = this.dauerMs(this.ausw(e, this.global), '@Kühlschrank(haltbar: …)');
            }
          } else if (a.name === 'PizzaVeraltet') {
            let grund = '';
            if (a.args) {
              const b = a.args.ben.find(x => x.name === 'grund');
              const e = b ? b.e : (a.args.pos[0] || null);
              if (e) { this.z = a.z; this.s = a.s; this.d = a.di; grund = this.text(this.ausw(e, this.global)); }
            }
            m.veraltet = grund;
          }
        }
      }
      for (const k of this.klassenListe) {
        const ctx = { dies: null, klasse: k, ktor: false };
        for (const f of k.statischeFelder) {
          for (const d of f.decls) {
            if (d.init === null) continue;
            this.z = d.z; this.s = d.s; this.d = d.di;
            const sc = new Scope(this.global, ctx, true);
            const v = this.ausw(d.init, sc);
            this.pruefeTyp(f.typ, v, d.name);
            k.statisch.get(d.name).w = v;
          }
        }
      }
    }
  }
  laufzeitTeil(LaufzeitPruefung);

  // ══════════ site/js/pizza/laufzeit/typen.js ══════════
  // pizza-Interpreter · Typprüfung, Textform, Vergleiche und Operatoren
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // Laufzeit: Typprüfung, Textform, Vergleiche & Operatoren
  class LaufzeitTypen {
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
        case 'Vorratskammer':
          if (this.klassen.has(typ.name)) { const k = this.klassen.get(typ.name); if (v === null || this.instanzVon(v, k)) return; was = 'kein(e) ' + k.name; break; }
          if (v === null || v instanceof Kammer) return;
          was = 'keine Vorratskammer';
          break;
        case 'Zufall':
          if (v === null || v instanceof ZufallGen || this.klassen.has('Zufall')) return;
          was = 'kein Zufall';
          break;
        case 'Theke': case 'Zutat': case 'Schild': case 'Knopf': case 'Eingabe': case 'Haken': case 'Stapel': case 'Reihe':
        case 'Takt': case 'Fortschritt': case 'Abschnitt': case 'Tabelle': case 'Reiter': case 'Auswahl': case 'Tastatur': {
          if (this.klassen.has(typ.name) || v === null) {
            const k = this.klassen.get(typ.name);
            if (k === undefined || v === null || this.instanzVon(v, k)) return;
            was = 'kein(e) ' + k.name;
            break;
          }
          if (typ.name === 'Theke' ? v instanceof UiTheke : (v instanceof UiZutat && (typ.name === 'Zutat' || UI_ART_NAME[v.art] === typ.name))) return;
          was = 'kein(e) ' + typ.name;
          break;
        }
        case 'Herd': case 'Teil': case 'Form': case 'Bildchen': {
          if (this.klassen.has(typ.name) || v === null) {
            const k = this.klassen.get(typ.name);
            if (k === undefined || v === null || this.instanzVon(v, k)) return;
            was = 'kein(e) ' + k.name;
            break;
          }
          if (herdKlasseVon(v) === typ.name && !(v instanceof HerdKomp)) return;
          was = 'kein(e) ' + typ.name;
          break;
        }
        case 'Zettel': {
          // Theke v5 (K-116): eingebauter Typname wie Zutat; eigene Klasse Zettel hat Vorrang
          if (this.klassen.has('Zettel') || v === null) {
            const k = this.klassen.get('Zettel');
            if (k === undefined || v === null || this.instanzVon(v, k)) return;
            was = 'kein(e) ' + k.name;
            break;
          }
          if (v instanceof Zettel) return;
          was = 'kein(e) Zettel';
          break;
        }
        default: {
          const k = this.klassen.get(typ.name);
          if (k === undefined) {
            // Herd-Komponente (Schema): nur Komponenten dieser Art passen
            if (v === null || !(HERD_KOMP_NAMEN.has(typ.name) || (this.hk !== null && this.hk.schema.nachName.has(typ.name)))) return;
            if (v instanceof HerdKomp && v.art.name === typ.name) return;
            was = 'kein(e) ' + typ.name;
            break;
          }
          if (v === null || this.instanzVon(v, k)) return;
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
      if (v instanceof EnumWert) return v.name;
      if (v instanceof Obj) return this.objText(v);
      if (v instanceof Klasse || v instanceof EnumTyp || v instanceof Rezeptur || v instanceof Modul) return v.name;
      if (v instanceof Funktion || v instanceof Gebunden || v instanceof NativFn) return '<Funktion>';
      if (v instanceof Teig) return v.fertig ? 'Teig(' + this.text(v.wert) + ')' : 'Teig(roh)';
      if (v instanceof Lieferung) return 'Lieferung #' + v.nr;
      if (v instanceof Zustellung) return v.puenktlich ? 'Zustellung(' + (v.fehler ? 'Ananas' : this.text(v.wert)) + ')' : 'Zustellung(zu spät)';
      if (v instanceof Reste) return 'Reste(' + this.text(v.wert) + ')';
      if (v instanceof OfenRoh) return 'Roh(' + this.text(v.teil) + ')';
      if (v instanceof UiTheke) return 'Theke(' + v.titel + ')';
      if (v instanceof ZufallGen) return 'Zufall(' + v.saat + ')';
      if (v instanceof Kammer) return 'Vorratskammer(' + v.kennung + ')';
      if (v instanceof UiZutat) return UI_ART_NAME[v.art] + '(' + v.id + ')';
      if (v instanceof Zettel) return 'Zettel(' + this.text(v.w) + ')';
      if (v instanceof HerdTeil) return 'Teil(' + v.id + ')';
      if (v instanceof HerdKomp) {
        // lose: <Name>(); zerstört: das Teil, an dem sie zuletzt hing
        const e = this.hk.e;
        let t = v.teil;
        if (e.komp_info(v.h, 3) !== 1) t = e.komp_info(v.h, 2);
        return v.art.name + '(' + (t > 0 ? t : '') + ')';
      }
      if (v instanceof HerdWelt) return 'Herd(' + v.titel + ')';
      if (v instanceof HerdForm) return 'Form(' + v.id + ')';
      if (v instanceof HerdBildchen) return 'Bildchen(' + v.breite + '×' + v.hoehe + ')';
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
          throw this.ananas('TypAnanas', this.typName(a) + ' und ' + this.typName(b) + ' kann man nicht addieren.');
        case '-':
          if (zz) return a - b;
          if (a instanceof Dauer && b instanceof Dauer) return new Dauer(a.ms - b.ms);
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
  }
  laufzeitTeil(LaufzeitTypen);

  // ══════════ site/js/pizza/laufzeit/namen.js ══════════
  // pizza-Interpreter · Namen und Felder
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // Laufzeit: Namen & Felder
  class LaufzeitNamen {
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
      // K-125: eine eigene Klasse Zettel hat Vorrang vor dem eingebauten Zettel (K-116)
      if (g !== undefined && !((name === 'Zettel' || name === 'Herd' || name === 'Form' || name === 'Bildchen' || name === 'Kiste') && this.klassen.has(name))) return g;
      const k = this.klassen.get(name);
      if (k !== undefined) return k;
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
        if ((this.istAnanasKlasse(o.klasse) && ANANAS_M[name]) || (KNIFF_NAMEN.has(name) && this.istKniffKlasse(o.klasse)) || OBJ_M[name]) {
          return new NativFn(name, (pos, ben, node) => this.objMethode(o, name, pos, ben, node, sc), o);
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
      const tab = this.tabelleVon(o);
      if (tab !== null && tab[name] !== undefined) {
        return new NativFn(name, (pos, ben, node) => tab[name].call(this, o, pos, ben, node), o);
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
      if (o instanceof UiZutat) return UI_TABELLEN[o.art];
      if (o instanceof HerdTeil || o instanceof HerdKomp) return o.tab;
      return TABELLEN.get(o.constructor) || null;
    }
  }
  laufzeitTeil(LaufzeitNamen);

  // ══════════ site/js/pizza/laufzeit/aufrufe.js ══════════
  // pizza-Interpreter · Aufrufe und Objekte
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // Laufzeit: Aufrufe & Objekte
  class LaufzeitAufrufe {
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
          else if (o instanceof Modul) {
            const f = o.methoden[name];
            if (f === undefined) throw this.ananas('LaufzeitAnanas', 'Methode \'' + name + '\' gibt es bei ' + o.name + ' nicht.');
            return f.call(this, o, pos, ben, node);
          } else if (o instanceof Klasse) return this.statischerAufruf(o, name, pos, ben, node, sc);
          else if (o instanceof EnumTyp) {
            if (name === 'werte') return o.werte.slice();
            throw this.ananas('LaufzeitAnanas', 'Methode \'' + name + '\' gibt es bei ' + o.name + ' nicht.');
          } else if (o instanceof Rezeptur) throw this.ananas('LaufzeitAnanas', 'Eine Rezeptur kann man nicht aufrufen – sie ist nur ein Rezept.');
          else if (o instanceof UiZutat) tab = UI_TABELLEN[o.art];
          else if (o instanceof HerdTeil || o instanceof HerdKomp) tab = o.tab;
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
      // Herd H-K13: eingebaute Methoden der Basisklasse Kniff (teil(), leere Rückrufe)
      if (KNIFF_NAMEN.has(name) && this.istKniffKlasse(o.klasse)) return KNIFF_M[name].call(this, o, pos, ben, node);
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
        const text = 'Methode \'' + m.name + '\' ist veraltet.' + (m.veraltet ? ' Grund: ' + m.veraltet : '');
        if (this.kueche === null) {
          m.gewarnt = true;
          this.warnung('W0003', text, node);
        } else if (!this.methodeGewarnt(m)) this.warnung('W0003', text, node, undefined, m);
      }
      if (m.body === null) throw this.ananas('RohlingAnanas', 'Methode \'' + m.name + '\' ist ein Rohling – sie hat keinen Rumpf.');
      if (m.haltbar >= 0 || modus !== 'normal') return this.kuehlschrank(m, dies, pos, ben, node, modus);
      if (!m.statisch && dies === null && m.klasse !== null) {
        throw this.ananas('LaufzeitAnanas', 'Methode \'' + m.name + '\' braucht eine Pizza-Instanz (dies) – sie ist nicht tiefkühl.');
      }
      return this.fuehreAus(m, { dies: m.statisch ? null : dies, klasse: m.klasse, ktor: false }, pos, ben, node);
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
        return this.fuehreAus(m, { dies, klasse: m.klasse, ktor: false }, pos, ben, node);
      };
      if (m.haltbar < 0) {
        const v = rechne();
        return modus === 'mikrowelle' ? new Reste(v, false) : v;
      }
      const halter = dies !== null && typeof dies === 'object' ? dies : (m.klasse || this.globalCache);
      let key;
      if (ben === null) key = this.cacheSchluessel(pos, null);
      else {
        const geordnet = [];
        for (let i = 0; i < m.params.length; i++) geordnet.push(i < pos.length ? pos[i] : (m.params[i].name in ben ? ben[m.params[i].name] : null));
        key = this.cacheSchluessel(geordnet, null);
      }
      const e = this.cacheHole(halter, m, key);
      if (modus === 'frisch' || e === undefined) {
        const v = rechne();
        this.cacheSetze(halter, m, key, { w: v, t: this.schritte + this.offset });
        return modus === 'mikrowelle' ? new Reste(v, false) : v;
      }
      const frisch = (this.schritte + this.offset) - e.t <= m.haltbar;
      if (frisch) return modus === 'mikrowelle' ? new Reste(e.w, false) : e.w;
      const alt = e.w;
      const v = rechne();
      this.cacheSetze(halter, m, key, { w: v, t: this.schritte + this.offset });
      return modus === 'mikrowelle' ? new Reste(alt, true) : v;
    }

    // Kühlschrank-Tabelle eines Halters (Objekt, Klasse oder globaler Cache). In einer Küche wird aus einer
    // Küchen-Überlagerung und dann aus dem Schnappschuss gelesen, geschrieben nur in die Überlagerung (D12).
    cacheHole(halter, m, key) {
      for (let k = this.kueche; k !== null; k = k.eltern) {
        const h = k.kuehl.get(halter);
        const tab = h !== undefined ? h.get(m) : undefined;
        const e = tab !== undefined ? tab.get(key) : undefined;
        if (e !== undefined) return e;
      }
      if (halter.cache === null || halter.cache === undefined) return undefined;
      const tab = halter.cache.get(m);
      return tab === undefined ? undefined : tab.get(key);
    }
    cacheSetze(halter, m, key, e) {
      if (this.kueche !== null) {
        const ueber = this.kueche.kuehl;
        let h = ueber.get(halter);
        if (h === undefined) { h = new Map(); ueber.set(halter, h); }
        let tab = h.get(m);
        if (tab === undefined) { tab = new Map(); h.set(m, tab); }
        tab.set(key, e);
        return;
      }
      if (halter.cache === null || halter.cache === undefined) halter.cache = new Map();
      let tab = halter.cache.get(m);
      if (tab === undefined) { tab = new Map(); halter.cache.set(m, tab); }
      tab.set(key, e);
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
      const z = this.z, s = this.s, d = this.d;
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
        this.z = z; this.s = s; this.d = d;
      }
    }

    rufeLambda(f, pos, ben) {
      const n = f.n;
      const sc = new Scope(f.scope, null, false);
      this.bindeParameter(n.params, sc, pos, ben, 'Die Funktion', false);
      if (++this.st > MAX_STAPEL) { this.st--; throw this.stapel(); }
      const z = this.z, s = this.s, d = this.d;
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
        this.z = z; this.s = s; this.d = d;
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
        // Herd H-K13: `teil()` & Co. in einer Kniff-Klasse – nach den eigenen Methoden, vor globalen Namen
        if (d !== null && KNIFF_NAMEN.has(name) && this.istKniffKlasse(d.klasse)) return this.kniffNativ(d, name, sc);
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
      if (this.kueche !== null) this.kuecheVar(v, a.n);
      const w = v.w;
      v.weg = true;
      v.w = null;
      return w;
    }

    untenAufruf(n, sc) {
      const ctx = sc.ctx;
      const pos = this.posArgs(n.args, sc), ben = this.benArgs(n.args, sc);
      if (ctx.klasse === null || ctx.klasse.basis === null) throw this.ananas('LaufzeitAnanas', '\'unten\' gibt es hier nicht – keine Basisklasse.');
      const l = this.findeMethodeListe(ctx.klasse.basis, n.name);
      if (l !== null) {
        const m = this.waehle(l, this.anzahl(pos, ben));
        return this.rufeDecl(m, m.statisch ? null : ctx.dies, pos, ben, n, 'normal');
      }
      if (ctx.dies instanceof Obj) {
        if (this.istAnanasKlasse(ctx.klasse.basis) && ANANAS_M[n.name]) return ANANAS_M[n.name].call(this, ctx.dies, pos, ben, n);
        if (KNIFF_NAMEN.has(n.name) && this.istKniffKlasse(ctx.klasse.basis)) return KNIFF_M[n.name].call(this, ctx.dies, pos, ben, n);
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
      const ctx = { dies: o, klasse: k, ktor: true };
      const sc = new Scope(this.global, ctx, true);
      this.bindeParameter(m.params, sc, pos, ben, 'Konstruktor von \'' + k.name + '\'', true);
      if (!m.hatUnten) {
        if (k.basis !== null) this.konstruiere(k.basis, o, [], null, node);
        this.feldInit(k, o);
      }
      if (++this.st > MAX_STAPEL) { this.st--; throw this.stapel(); }
      const z = this.z, s = this.s, d = this.d;
      try {
        const body = m.body.body;
        for (let i = 0; i < body.length; i++) {
          const r = this.fuehre(body[i], sc);
          if (r !== undefined) { this.rueck = null; break; }
        }
      } finally {
        this.st--;
        this.z = z; this.s = s; this.d = d;
      }
    }

    feldInit(k, o) {
      const ctx = { dies: o, klasse: k, ktor: true };
      for (const f of k.felder) {
        for (const d of f.decls) {
          if (d.init === null) continue;
          const sc = new Scope(this.global, ctx, true);
          const v = this.ausw(d.init, sc);
          this.pruefeTyp(f.typ, v, d.name);
          o.felder.get(d.name).w = v;
        }
      }
    }
  }
  laufzeitTeil(LaufzeitAufrufe);

  // ══════════ site/js/pizza/laufzeit/auswertung.js ══════════
  // pizza-Interpreter · Lieferung & Ofen, Ausdrücke, Anweisungen
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // Laufzeit: Lieferung & Ofen, Ausdrücke, Anweisungen
  class LaufzeitAuswertung {
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
      // K-127: nur noch ein Zeitbudget (Positionsargument 0 = zeit)
      let zeit = arg(pos, ben, 0, 'zeit');
      if (zeit === undefined || zeit === null) zeit = new Dauer(60000);
      const zeitMs = this.dauerMs(zeit, 'ofen(zeit: …)');
      const startUhr = this.schritte + this.offset;
      const z0 = this.z, s0 = this.s, d0 = this.d;
      let wert = null, roh = null;
      const st0 = this.st;
      try {
        const budget = Math.floor(zeitMs);
        const frame = this.pushFrame('ofen', budget);
        try {
          wert = this.blockWert(n.block, sc);
        } catch (e) {
          this.st = st0;
          if (e instanceof BudgetSig && e.frame === frame) {
            this.z = z0; this.s = s0; this.d = d0;
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
      const pos = this.posArgs(n.args, sc);
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
      if (!this.klassen.has(tn)) {
        if (this.kueche !== null) {
          if (UI_KLASSEN[tn] !== undefined || tn === 'Theke') throw this.ananas('KüchenAnanas', 'Die Theke gibt es nur in der Hauptküche.');
          if (tn === 'Zettel') throw this.ananas('KüchenAnanas', 'Zettel gibt es nur in der Hauptküche.');
          if (tn === 'Vorratskammer') throw this.ananas('KüchenAnanas', 'Neue Vorratskammern gibt es nur in der Hauptküche.');
        }
        if (UI_KLASSEN[tn] !== undefined) return this.uiNeu(tn, pos, ben);
        if (tn === 'Zettel') {
          // Theke v5 (K-116): neu Zettel(wert = karton) – ohne Theke eine gewöhnliche Schachtel
          const w = arg(pos, ben, 0, 'wert');
          return new Zettel(w === undefined ? null : w);
        }
        if (tn === 'Zutat') throw this.ananas('RohlingAnanas', 'Ein Rohling ist nicht essbar.');
        if (tn === 'Zufall') {
          const sa = arg(pos, ben, 0, 'saat');
          if (sa === undefined || sa === null) return new ZufallGen(Math.floor(this.zufallGlobal.r() * 4294967296));
          return new ZufallGen(this.ganzzahl(sa, 'Zufall'));
        }
        if (tn === 'Vorratskammer') return this.neueKammer(pos, ben, n);
        if (tn === 'Theke') {
          if (this.uiTheke !== null) throw this.ananas('LaufzeitAnanas', 'Es gibt nur eine Theke pro Programm.');
          const titel = arg(pos, ben, 0, 'titel');
          const br = arg(pos, ben, 1, 'breite'), ho = arg(pos, ben, 2, 'hoehe');
          const t = new UiTheke(titel === undefined ? '' : this.text(titel),  // K-102: karton → "karton" (Zustandsfeld)
            br === undefined || br === null ? 480 : this.ganzzahl(br, 'Theke(breite: …)'),
            ho === undefined || ho === null ? 360 : this.ganzzahl(ho, 'Theke(hoehe: …)'));
          this.uiTheke = t;
          return t;
        }
        // Herd (SPEC §18): Herd, Form, Bildchen, Teil und die Komponenten des Schemas
        const hn = this.herdNeu(tn, pos, ben);
        if (hn !== undefined) return hn;
      }
      switch (tn) {
        case 'Blech': return pos.length && Array.isArray(pos[0]) ? pos[0].slice() : [];
        case 'Speisekarte': return new Map();
      }
      const k = this.klassen.get(tn);
      if (k === undefined) throw this.ananas('UnbekanntePizzaAnanas', 'Klasse \'' + tn + '\' steht nicht auf der Speisekarte.');
      if (!(k instanceof Klasse)) throw this.ananas('RohlingAnanas', '\'' + tn + '\' kann man nicht mit neu backen.');
      return this.instanziiere(k, pos, ben, n);
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
      if (this.kueche !== null) this.kuecheVar(v, name);
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
      this.z = n.z; this.s = n.s; this.d = n.di;
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
        case 'Klasse': case 'Rezeptur': case 'Enum': case 'Methode': break;
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
      if (v instanceof Obj) return new AnanasWurf(v, n.z, n.s, n.di);
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
  }
  laufzeitTeil(LaufzeitAuswertung);

  // ══════════ site/js/pizza/std/basis.js ══════════
  // pizza-Interpreter · Standardbibliothek: Methodentabellen der Grundtypen, Bote, Bestellannahme, Uhr
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // =====================================================================
  // STANDARDBIBLIOTHEK – Methodentabellen (this = Laufzeit)
  // =====================================================================

  function arg(pos, ben, i, name) {
    if (i < pos.length) return pos[i];
    if (ben !== null && name in ben) return ben[name];
    return undefined;
  }

  const ZAHL_M = tabelle({
    // K-127: Geldformat mit frei wählbarem Symbol (vormals euro())
    'währung': function (x, pos, ben) {
      const sym = arg(pos, ben, 0, 'symbol');
      const k = arg(pos, ben, 1, 'kompakt');
      const betrag = k !== undefined && k !== null && this.bool(k) ? kompaktText(x, 2) : betragText(x);
      const st = sym === undefined || sym === null ? '' : this.text(sym);
      return st === '' ? betrag : betrag + ' ' + st;
    },
    'tausender': function (x, pos, ben) {
      const n = arg(pos, ben, 0, 'stellen');
      return tausenderText(x, n === undefined || n === null ? 0 : this.stellen(n, 'tausender'));
    },
    'kompakt': function (x, pos, ben) {
      const n = arg(pos, ben, 0, 'stellen');
      return kompaktText(x, n === undefined || n === null ? 2 : this.stellen(n, 'kompakt'));
    },
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
    'ersetze': function (s, pos) {
      const such = this.text(pos[0]);
      if (such === '') return s;
      return s.split(such).join(this.text(pos[1]));
    },
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
    'hinzu': function (b, pos) { if (this.kueche !== null) this.kuecheBlech(b); b.push(pos.length ? pos[0] : null); return b; },
    'entferne': function (b, pos) { if (this.kueche !== null) this.kuecheBlech(b); const i = this.index(b, pos[0]); return b.splice(i - 1, 1)[0]; },
    'setze': function (b, pos) { if (this.kueche !== null) this.kuecheBlech(b); const i = this.index(b, pos[0]); b[i - 1] = pos.length > 1 ? pos[1] : null; return b; },
    'enthält': function (b, pos) { for (const x of b) if (this.gleich(x, pos[0])) return true; return false; },
    'belege': function (b, pos, ben, node) {
      const f = pos[0];
      const r = new Array(b.length);
      for (let i = 0; i < b.length; i++) r[i] = this.rufe(f, [b[i]], null, node);
      return r;
    },
    // Küchenbrigade (THREADS.md §2–§3): wie belege, jedes Stück in einer eigenen Küche; sequentielle Referenz
    'brigade': function (b, pos, ben, node) { return this.brigade(b, pos[0], node); },
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
    'schneide': function (b, pos) {
      // K-127: n ist Pflicht (kein `auto`, kein Standard 8), keine Warnung bei 7
      const n = this.ganzzahl(pos[0] === undefined ? null : pos[0], 'schneide');
      if (n < 1) throw this.ananas('StreitAnanas', 'In ' + n + ' Stücke schneiden? Das geht nicht.');
      return this.schneide(b, n);
    },
    'kopie': function (b) { return b.slice(); },
    'alsText': function (b) { return this.text(b); }
  });

  const KARTE_M = tabelle({
    'lege': function (m, pos) { if (this.kueche !== null) this.kuecheKarte(m); m.set(this.schluessel(pos[0]), pos.length > 1 ? pos[1] : null); return m; },
    'hole': function (m, pos, ben) {
      // K-095: hole(k[, ersatz]) – Ersatzwert (positional oder benannt) nur, wenn der Schlüssel fehlt.
      const k = this.schluessel(pos[0]);
      if (m.has(k)) return m.get(k);
      const e = arg(pos, ben, 1, 'ersatz');
      return e === undefined ? null : e;
    },
    'hat': function (m, pos) { return m.has(this.schluessel(pos[0])); },
    'entferne': function (m, pos) { if (this.kueche !== null) this.kuecheKarte(m); const k = this.schluessel(pos[0]); const v = m.has(k) ? m.get(k) : null; m.delete(k); return v; },
    'schlüssel': function (m) { return Array.from(m.keys()); },
    'werte': function (m) { return Array.from(m.values()); },
    'länge': function (m) { return m.size; },
    'istLeer': function (m) { return m.size === 0; },
    'alsText': function (m) { return this.text(m); }
  });

  const ENUM_M = tabelle({
    'name': function (e) { return e.name; },
    'position': function (e) { return e.pos; },
    'alsText': function (e) { return e.name; }
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
      if (this.kueche !== null && this.istGefroren(o)) throw this.ananas('KüchenAnanas', 'Diese Calzone gehört der Hauptküche – ein Koch darf sie nicht aufklappen.');
      this.warnung('W0013', 'Garantie erloschen. Das ist jetzt eine ganz normale Pizza.', node);
      o.zugeklappt = false;
      return o;
    }
  });

  const TEIG_M = tabelle({
    'gehenlassen': function (t, pos, ben, node) {
      if (this.kueche !== null) this.kuecheTeig(t);
      if (!t.fertig) { t.wert = this.rufe(t.fn, [], null, node); t.fertig = true; }
      t.auf = true;
      return t;
    },
    'backen': function (t, pos, ben, node) {
      if (this.kueche !== null && !t.fertig) this.kuecheTeig(t);
      if (!t.auf) this.warnung('T0007', 'Teig wird gebacken, ohne gehen gelassen worden zu sein. Das schmeckt flach.', node);
      if (!t.fertig) { t.wert = this.rufe(t.fn, [], null, node); t.fertig = true; }
      return t.wert;
    },
    'istAufgegangen': function (t) { return t.auf; },
    'alsText': function (t) { return this.text(t); }
  });

  const LIEF_M = tabelle({
    // K-127: Priorität ordnet nur die wennDa-Phase; der letzte Wert gilt
    'priorität': function (l, pos) {
      if (this.kueche !== null) this.kuecheLieferung(l);
      const n = pos[0];
      if (typeof n !== 'number') throw this.ananas('TypAnanas', 'Priorität muss eine Zahl sein, nicht ' + this.darstellung(n) + '.');
      l.prio = n;
      return l;
    },
    'warte': function (l, pos, ben, node) {
      if (l.zustellung !== null) return l.zustellung;
      if (this.kueche !== null) this.kuecheLieferung(l);
      const max = arg(pos, ben, 0, 'max');
      let budget = Infinity;
      if (max !== undefined && max !== null) budget = Math.floor(this.dauerMs(max, 'warte(max: …)'));
      const z = this.liefere(l, budget, node);
      if (l.rueckruf !== null && z.puenktlich && z.fehler === null) this.rufe(l.rueckruf, [z.wert], null, node);
      return z;
    },
    'wennDa': function (l, pos, ben, node) {
      if (this.kueche !== null) this.kuecheLieferung(l);
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

  /** K-154: Ortszeit − UTC zum Zeitpunkt t (ms seit 1970) in ms, auf ganze Minuten gerundet (wie die nativen Hosts). */
  function ortsVersatzMs(t) {
    const m = Math.round(-new Date(t).getTimezoneOffset());
    return m === 0 ? 0 : m * 60000;
  }

  const UHR_M = tabelle({
    'jetzt': function () { return new Dauer(this.schritte + this.offset); },
    'echt': function () { return new Dauer(this.echtzeit !== null ? this.echtzeit : Date.now()); },
    // K-154: Versatz Ortszeit − UTC (ganze Minuten, Sommerzeit). optionen.zone fest; feste Wanduhr ohne zone → 0ms
    'zone': function () { return new Dauer(this.zone !== null ? this.zone : this.echtzeit !== null ? 0 : ortsVersatzMs(Date.now())); },
    'vorspulen': function (m, pos) {
      const ms = Math.round(this.dauerMs(pos[0], 'Uhr.vorspulen'));
      if (ms < 0) throw this.ananas('RechenAnanas', 'Die Uhr lässt sich nicht zurückdrehen.');
      this.offset += ms;
      this.neuGrenze();
      if (this.schritte > this.grenze) this.grenzeErreicht();
      return null;
    }
  });

  // ══════════ site/js/pizza/std/mathe.js ══════════
  // pizza-Interpreter · Standardbibliothek: Mathe (fdlibm-Ports WINKEL und LOGEXP)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // ---------------------------------------------------------------- K-137: Winkelfunktionen (fdlibm, wie V8 12.x)
  // Nicht Math.sin & Co.: JS-Motoren rechnen dort verschieden (Node 22/V8 12.4 = fdlibm, Chrome 156 weicht in jeder
  // Winkelfunktion ab). Dieser Port von Sun fdlibm 5.3 (V8 src/base/ieee754.cc) ist derselbe Algorithmus wie in der
  // Wasm-Laufzeit (laufzeit/src/zahl.rs) – nur Double-Operationen, also in jedem Motor dieselben Bits.
  // fdlibm: „Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved. Developed at SunSoft, a Sun Microsystems,
  // Inc. business. Permission to use, copy, modify, and distribute this software is freely granted, provided that this
  // notice is preserved.“
  const WINKEL = (function () {
    const dv = new DataView(new ArrayBuffer(8));
    const hi = (x) => { dv.setFloat64(0, x); return dv.getInt32(0); };
    const lo = (x) => { dv.setFloat64(0, x); return dv.getUint32(4); };
    const worte = (h, l) => { dv.setInt32(0, h); dv.setUint32(4, l); return dv.getFloat64(0); };
    const ohneLo = (x) => { dv.setFloat64(0, x); dv.setUint32(4, 0); return dv.getFloat64(0); };
    const zweiHoch = (n) => worte((n + 1023) << 20, 0);   // 2^n, |n| ≤ 1022 (hier stets normal)
    const ZWEI_DURCH_PI = [
      0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163, 0xABDEBB, 0xC561B7, 0x246E3A,
      0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C, 0x7026B4, 0x5F7E41,
      0x3991D6, 0x398353, 0x39F49C, 0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D, 0x367ECF,
      0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7, 0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08,
      0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E, 0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880,
      0x4D7327, 0x310606, 0x1556CA, 0x73A8C9, 0x60E27B, 0xC08C6B
    ];
    const NPIO2_HW = [
      0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A,
      0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A,
      0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
      0x404858EB, 0x404921FB
    ];
    const PIO2_TEILE = [1.57079625129699707031e+00, 7.54978941586159635335e-08, 5.39030252995776476554e-15, 3.28200341580791294123e-22,
      1.27065575308067607349e-29, 1.22933308981111328932e-36, 2.73370053816464559624e-44, 2.16741683877804819444e-51];
    const TWO24 = 1.67772160000000000000e+07, TWON24 = 5.96046447753906250000e-08;
    const ganz = (x) => x < 0 ? Math.ceil(x) : Math.floor(x);   // (int32_t)x für |x| < 2^31

    // k_rem_pio2.c, prec = 2 (jk = 4)
    function kernelRemPio2(x, y, e0) {
      const jk = 4, jp = 4, jx = x.length - 1;
      let jv = ganz((e0 - 3) / 24);
      if (jv < 0) jv = 0;
      let q0 = e0 - 24 * (jv + 1);
      const f = new Array(20).fill(0), q = new Array(20).fill(0), fq = new Array(20).fill(0), iq = new Array(20).fill(0);
      for (let i = 0, j = jv - jx; i <= jx + jk; i++, j++) f[i] = j < 0 ? 0 : ZWEI_DURCH_PI[j];
      for (let i = 0; i <= jk; i++) { let fw = 0; for (let j = 0; j <= jx; j++) fw += x[j] * f[jx + i - j]; q[i] = fw; }
      let jz = jk, z, n, ih;
      for (;;) {
        z = q[jz];
        for (let i = 0, j = jz; j > 0; i++, j--) {
          const fw = ganz(TWON24 * z);
          iq[i] = ganz(z - TWO24 * fw);
          z = q[j - 1] + fw;
        }
        z = z * zweiHoch(q0);
        z -= 8 * Math.floor(z * 0.125);
        n = ganz(z);
        z -= n;
        ih = 0;
        if (q0 > 0) {
          const i = iq[jz - 1] >> (24 - q0);
          n += i;
          iq[jz - 1] -= i << (24 - q0);
          ih = iq[jz - 1] >> (23 - q0);
        } else if (q0 === 0) ih = iq[jz - 1] >> 23;
        else if (z >= 0.5) ih = 2;
        if (ih > 0) {
          n += 1;
          let carry = 0;
          for (let i = 0; i < jz; i++) {
            const j = iq[i];
            if (carry === 0) { if (j !== 0) { carry = 1; iq[i] = 0x1000000 - j; } } else iq[i] = 0xFFFFFF - j;
          }
          if (q0 === 1) iq[jz - 1] &= 0x7FFFFF; else if (q0 === 2) iq[jz - 1] &= 0x3FFFFF;
          if (ih === 2) { z = 1 - z; if (carry !== 0) z -= zweiHoch(q0); }
        }
        if (z === 0) {
          let j = 0;
          for (let i = jz - 1; i >= jk; i--) j |= iq[i];
          if (j === 0) {
            let k = 1;
            while (jk >= k && iq[jk - k] === 0) k++;
            for (let i = jz + 1; i <= jz + k; i++) {
              f[jx + i] = ZWEI_DURCH_PI[jv + i];
              let fw = 0; for (let j2 = 0; j2 <= jx; j2++) fw += x[j2] * f[jx + i - j2];
              q[i] = fw;
            }
            jz += k;
            continue;
          }
        }
        break;
      }
      if (z === 0) {
        jz -= 1; q0 -= 24;
        while (iq[jz] === 0) { jz--; q0 -= 24; }
      } else {
        z = z * zweiHoch(-q0);
        if (z >= TWO24) {
          const fw = ganz(TWON24 * z);
          iq[jz] = ganz(z - TWO24 * fw);
          jz += 1; q0 += 24;
          iq[jz] = fw;
        } else iq[jz] = ganz(z);
      }
      let fw = zweiHoch(q0);
      for (let i = jz; i >= 0; i--) { q[i] = fw * iq[i]; fw *= TWON24; }
      for (let i = jz; i >= 0; i--) {
        fw = 0;
        for (let k = 0; k <= jp && k <= jz - i; k++) fw += PIO2_TEILE[k] * q[i + k];
        fq[jz - i] = fw;
      }
      fw = 0;
      for (let i = jz; i >= 0; i--) fw += fq[i];
      y[0] = ih === 0 ? fw : -fw;
      fw = fq[0] - fw;
      for (let i = 1; i <= jz; i++) fw += fq[i];
      y[1] = ih === 0 ? fw : -fw;
      return n & 7;
    }

    // e_rem_pio2.c
    const INVPIO2 = 6.36619772367581382433e-01, PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11,
      PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21, PIO2_3 = 2.02226624871116645580e-21,
      PIO2_3T = 8.47842766036889956997e-32;
    function remPio2(x, y) {
      const hx = hi(x), ix = hx & 0x7FFFFFFF;
      if (ix <= 0x3FE921FB) { y[0] = x; y[1] = 0; return 0; }
      if (ix < 0x4002D97C) {
        let z;
        if (hx > 0) {
          z = x - PIO2_1;
          if (ix !== 0x3FF921FB) { y[0] = z - PIO2_1T; y[1] = (z - y[0]) - PIO2_1T; } else { z -= PIO2_2; y[0] = z - PIO2_2T; y[1] = (z - y[0]) - PIO2_2T; }
          return 1;
        }
        z = x + PIO2_1;
        if (ix !== 0x3FF921FB) { y[0] = z + PIO2_1T; y[1] = (z - y[0]) + PIO2_1T; } else { z += PIO2_2; y[0] = z + PIO2_2T; y[1] = (z - y[0]) + PIO2_2T; }
        return -1;
      }
      if (ix <= 0x413921FB) {
        let t = Math.abs(x);
        const n = ganz(t * INVPIO2 + 0.5), fn = n;
        let r = t - fn * PIO2_1, w = fn * PIO2_1T;
        if (n < 32 && ix !== NPIO2_HW[n - 1]) y[0] = r - w;
        else {
          const j = ix >> 20;
          y[0] = r - w;
          let i = j - ((hi(y[0]) >> 20) & 0x7FF);
          if (i > 16) {
            t = r; w = fn * PIO2_2; r = t - w; w = fn * PIO2_2T - ((t - r) - w); y[0] = r - w;
            i = j - ((hi(y[0]) >> 20) & 0x7FF);
            if (i > 49) { t = r; w = fn * PIO2_3; r = t - w; w = fn * PIO2_3T - ((t - r) - w); y[0] = r - w; }
          }
        }
        y[1] = (r - y[0]) - w;
        if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
        return n;
      }
      if (ix >= 0x7FF00000) { y[0] = y[1] = x - x; return 0; }
      const e0 = (ix >> 20) - 1046;
      let z = worte(ix - (e0 << 20), lo(x));
      const tx = [0, 0, 0];
      for (let i = 0; i < 2; i++) { tx[i] = ganz(z); z = (z - tx[i]) * TWO24; }
      tx[2] = z;
      let nx = 3;
      while (tx[nx - 1] === 0) nx--;
      const n = kernelRemPio2(tx.slice(0, nx), y, e0);
      if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
      return n;
    }

    // k_cos.c, k_sin.c, k_tan.c
    function kCos(x, y) {
      const ix = hi(x) & 0x7FFFFFFF;
      if (ix < 0x3E400000 && ganz(x) === 0) return 1;
      const z = x * x;
      const r = z * (4.16666666666666019037e-02 + z * (-1.38888888888741095749e-03 + z * (2.48015872894767294178e-05 +
        z * (-2.75573143513906633035e-07 + z * (2.08757232129817482790e-09 + z * -1.13596475577881948265e-11)))));
      if (ix < 0x3FD33333) return 1 - (0.5 * z - (z * r - x * y));
      const qx = ix > 0x3FE90000 ? 0.28125 : worte(ix - 0x00200000, 0);
      const iz = 0.5 * z - qx, a = 1 - qx;
      return a - (iz - (z * r - x * y));
    }
    function kSin(x, y, iy) {
      const ix = hi(x) & 0x7FFFFFFF;
      if (ix < 0x3E400000 && ganz(x) === 0) return x;
      const z = x * x, v = z * x;
      const r = 8.33333333332248946124e-03 + z * (-1.98412698298579493134e-04 + z * (2.75573137070700676789e-06 +
        z * (-2.50507602534068634195e-08 + z * 1.58969099521155010221e-10)));
      const S1 = -1.66666666666666324348e-01;
      return iy === 0 ? x + v * (S1 + z * r) : x - ((z * (0.5 * y - v * r) - y) - v * S1);
    }
    const T = [3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02, 2.18694882948595424599e-02,
      8.86323982359930005737e-03, 3.59207910759131235356e-03, 1.45620945432529025516e-03, 5.88041240820264096874e-04,
      2.46463134818469906812e-04, 7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
      2.59073051863633712884e-05];
    const PIO4 = 7.85398163397448278999e-01, PIO4LO = 3.06161699786838301793e-17;
    function kTan(x, y, iy) {
      const hx = hi(x), ix = hx & 0x7FFFFFFF;
      let z, w, v, s, r, a, t;
      if (ix < 0x3E300000 && ganz(x) === 0) {
        if (((ix | lo(x)) | (iy + 1)) === 0) return 1 / Math.abs(x);
        if (iy === 1) return x;
        w = x + y; z = ohneLo(w); v = y - (z - x);
        a = -1 / w; t = ohneLo(a); s = 1 + t * z;
        return t + a * (s + t * v);
      }
      if (ix >= 0x3FE59428) {
        if (hx < 0) { x = -x; y = -y; }
        z = PIO4 - x; w = PIO4LO - y; x = z + w; y = 0;
      }
      z = x * x; w = z * z;
      r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))));
      v = z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12])))));
      s = z * x;
      r = y + z * (s * (r + v) + y);
      r += T[0] * s;
      w = x + r;
      if (ix >= 0x3FE59428) { v = iy; return (1 - ((hx >> 30) & 2)) * (v - 2 * (x - (w * w / (w + v) - r))); }
      if (iy === 1) return w;
      z = ohneLo(w); v = r - (z - x);
      a = -1 / w; t = ohneLo(a); s = 1 + t * z;
      return t + a * (s + t * v);
    }

    const yy = [0, 0];
    function sin(x) {
      const ix = hi(x) & 0x7FFFFFFF;
      if (ix <= 0x3FE921FB) return kSin(x, 0, 0);
      if (ix >= 0x7FF00000) return x - x;
      switch (remPio2(x, yy) & 3) {
        case 0: return kSin(yy[0], yy[1], 1);
        case 1: return kCos(yy[0], yy[1]);
        case 2: return -kSin(yy[0], yy[1], 1);
        default: return -kCos(yy[0], yy[1]);
      }
    }
    function cos(x) {
      const ix = hi(x) & 0x7FFFFFFF;
      if (ix <= 0x3FE921FB) return kCos(x, 0);
      if (ix >= 0x7FF00000) return x - x;
      switch (remPio2(x, yy) & 3) {
        case 0: return kCos(yy[0], yy[1]);
        case 1: return -kSin(yy[0], yy[1], 1);
        case 2: return -kCos(yy[0], yy[1]);
        default: return kSin(yy[0], yy[1], 1);
      }
    }
    function tan(x) {
      const ix = hi(x) & 0x7FFFFFFF;
      if (ix <= 0x3FE921FB) return kTan(x, 0, 1);
      if (ix >= 0x7FF00000) return x - x;
      const n = remPio2(x, yy);
      return kTan(yy[0], yy[1], 1 - ((n & 1) << 1));
    }

    // e_asin.c, e_acos.c (gemeinsame rationale Näherung R(z) = p/q)
    const PIO2_HI = 1.57079632679489655800e+00, PIO2_LO = 6.12323399573676603587e-17, PIO4_HI = 7.85398163397448278999e-01;
    const pS = (z) => z * (1.66666666666666657415e-01 + z * (-3.25565818622400915405e-01 + z * (2.01212532134862925881e-01 +
      z * (-4.00555345006794114027e-02 + z * (7.91534994289814532176e-04 + z * 3.47933107596021167570e-05)))));
    const qS = (z) => 1 + z * (-2.40339491173441421878e+00 + z * (2.02094576023350569471e+00 + z * (-6.88283971605453293030e-01 +
      z * 7.70381505559019352791e-02)));
    function asin(x) {
      const hx = hi(x), ix = hx & 0x7FFFFFFF;
      let t = 0, w, p, q, c, r, s;
      if (ix >= 0x3FF00000) {
        if (((ix - 0x3FF00000) | lo(x)) === 0) return x * PIO2_HI + x * PIO2_LO;
        return NaN;
      } else if (ix < 0x3FE00000) {
        if (ix < 0x3E400000) { if (1.0e300 + x > 1) return x; } else t = x * x;
        p = pS(t); q = qS(t); w = p / q;
        return x + x * w;
      }
      w = 1 - Math.abs(x); t = w * 0.5;
      p = pS(t); q = qS(t); s = Math.sqrt(t);
      if (ix >= 0x3FEF3333) {
        w = p / q;
        t = PIO2_HI - (2 * (s + s * w) - PIO2_LO);
      } else {
        w = ohneLo(s);
        c = (t - w * w) / (s + w);
        r = p / q;
        p = 2 * s * r - (PIO2_LO - 2 * c);
        q = PIO4_HI - 2 * w;
        t = PIO4_HI - (p - q);
      }
      return hx > 0 ? t : -t;
    }
    function acos(x) {
      const hx = hi(x), ix = hx & 0x7FFFFFFF;
      let z, p, q, r, w, s, c, df;
      if (ix >= 0x3FF00000) {
        if (((ix - 0x3FF00000) | lo(x)) === 0) return hx > 0 ? 0 : 3.14159265358979311600e+00 + 2 * PIO2_LO;
        return NaN;
      }
      if (ix < 0x3FE00000) {
        if (ix <= 0x3C600000) return PIO2_HI + PIO2_LO;
        z = x * x; p = pS(z); q = qS(z); r = p / q;
        return PIO2_HI - (x - (PIO2_LO - x * r));
      } else if (hx < 0) {
        z = (1 + x) * 0.5; p = pS(z); q = qS(z); s = Math.sqrt(z); r = p / q;
        w = r * s - PIO2_LO;
        return 3.14159265358979311600e+00 - 2 * (s + w);
      }
      z = (1 - x) * 0.5; s = Math.sqrt(z); df = ohneLo(s);
      c = (z - df * df) / (s + df);
      p = pS(z); q = qS(z); r = p / q;
      w = r * s + c;
      return 2 * (df + w);
    }

    // s_atan.c, e_atan2.c
    const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
    const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
    const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
      9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
      4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
    function atan(x) {
      const hx = hi(x), ix = hx & 0x7FFFFFFF;
      let id;
      if (ix >= 0x44100000) {
        if (x !== x) return x + x;
        return hx > 0 ? ATANHI[3] + ATANLO[3] : -ATANHI[3] - ATANLO[3];
      }
      if (ix < 0x3FDC0000) {
        if (ix < 0x3E400000) { if (1.0e300 + x > 1) return x; }
        id = -1;
      } else {
        x = Math.abs(x);
        if (ix < 0x3FF30000) {
          if (ix < 0x3FE60000) { id = 0; x = (2 * x - 1) / (2 + x); } else { id = 1; x = (x - 1) / (x + 1); }
        } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1 + 1.5 * x); } else { id = 3; x = -1 / x; }
      }
      let z = x * x;
      const w = z * z;
      const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
      const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
      if (id < 0) return x - x * (s1 + s2);
      z = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
      return hx < 0 ? -z : z;
    }
    const TINY = 1.0e-300, PI_O_4 = 7.8539816339744827900E-01, PI_O_2 = 1.5707963267948965580E+00,
      PI = 3.1415926535897931160E+00, PI_LO = 1.2246467991473531772E-16;
    function atan2(y, x) {
      if (x !== x || y !== y) return x + y;
      if (x === 1) return atan(y);
      const hx = hi(x), lx = lo(x), hy = hi(y), ly = lo(y);
      const ix = hx & 0x7FFFFFFF, iy = hy & 0x7FFFFFFF;
      let m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
      if ((iy | ly) === 0) return m <= 1 ? y : (m === 2 ? PI + TINY : -PI - TINY);
      if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
      if (ix === 0x7FF00000) {
        if (iy === 0x7FF00000) return [PI_O_4 + TINY, -PI_O_4 - TINY, 3 * PI_O_4 + TINY, -3 * PI_O_4 - TINY][m];
        return [0, -0, PI + TINY, -PI - TINY][m];
      }
      if (iy === 0x7FF00000) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
      const k = (iy - ix) >> 20;
      let z;
      if (k > 60) { z = PI_O_2 + 0.5 * PI_LO; m &= 1; } else if (hx < 0 && k < -60) z = 0; else z = atan(Math.abs(y / x));
      switch (m) {
        case 0: return z;
        case 1: return -z;
        case 2: return PI - (z - PI_LO);
        default: return (z - PI_LO) - PI;
      }
    }
    // K-137: fester Rechenweg grad · (π / 180) bzw. bogen · (180 / π) – die Konstanten sind korrekt gerundete Quotienten
    const BOGEN_PRO_GRAD = Math.PI / 180, GRAD_PRO_BOGEN = 180 / Math.PI;
    return { sin, cos, tan, asin, acos, atan, atan2, bogen: (x) => x * BOGEN_PRO_GRAD, grad: (x) => x * GRAD_PRO_BOGEN };
  })();

  // ---------------------------------------------------------------- K-111/U-72: log, log10, log2, exp (fdlibm, wie V8 12.x)
  // Wie WINKEL: nicht Math.log & Co. (Chrome 156 liefert andere Bits als Node 22 und die Wasm-Laufzeit). Port derselben
  // Routinen wie laufzeit/src/zahl.rs bzw. V8 src/base/ieee754.cc: Sun e_log.c, e_log10.c (über log), FreeBSD e_log2.c mit
  // k_log1p, fdlibm e_exp.c mit V8-Sonderfall exp(1) = E. Nur Double-Operationen. fdlibm-Lizenzvermerk siehe WINKEL.
  const LOGEXP = (function () {
    const dv = new DataView(new ArrayBuffer(8));
    const hi = (x) => { dv.setFloat64(0, x); return dv.getInt32(0); };
    const lo = (x) => { dv.setFloat64(0, x); return dv.getUint32(4); };
    const mitHi = (x, h) => { dv.setFloat64(0, x); dv.setInt32(0, h); return dv.getFloat64(0); };
    const ohneLo = (x) => { dv.setFloat64(0, x); dv.setUint32(4, 0); return dv.getFloat64(0); };
    const worte = (h, l) => { dv.setInt32(0, h); dv.setUint32(4, l); return dv.getFloat64(0); };
    const LG1 = 6.666666666666735130e-01, LG2 = 3.999999999940941908e-01, LG3 = 2.857142874366239149e-01,
      LG4 = 2.222219843214978396e-01, LG5 = 1.818357216161805012e-01, LG6 = 1.531383769920937332e-01,
      LG7 = 1.479819860511658591e-01, LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10,
      TWO54 = 1.80143985094819840000e+16;

    // e_log.c
    function log(x) {
      let hx = hi(x), k = 0;
      const lx = lo(x);
      if (hx < 0x00100000) {
        if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
        if (hx < 0) return NaN;
        k -= 54; x *= TWO54; hx = hi(x);
      }
      if (hx >= 0x7FF00000) return x + x;
      k += (hx >> 20) - 1023;
      hx &= 0x000FFFFF;
      let i = (hx + 0x95F64) & 0x100000;
      x = mitHi(x, hx | (i ^ 0x3FF00000));
      k += i >> 20;
      const f = x - 1;
      if ((0x000FFFFF & (2 + hx)) < 3) {
        if (f === 0) { if (k === 0) return 0; return k * LN2_HI + k * LN2_LO; }
        const r = f * f * (0.5 - 0.33333333333333333 * f);
        if (k === 0) return f - r;
        return k * LN2_HI - ((r - k * LN2_LO) - f);
      }
      const s = f / (2 + f), dk = k, z = s * s;
      i = hx - 0x6147A;
      const w = z * z, j = 0x6B851 - hx;
      const t1 = w * (LG2 + w * (LG4 + w * LG6));
      const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
      i |= j;
      const r = t2 + t1;
      if (i > 0) {
        const hfsq = 0.5 * f * f;
        return k === 0 ? f - (hfsq - s * (hfsq + r)) : dk * LN2_HI - ((hfsq - (s * (hfsq + r) + dk * LN2_LO)) - f);
      }
      return k === 0 ? f - s * (f - r) : dk * LN2_HI - ((s * (f - r) - dk * LN2_LO) - f);
    }

    // e_log10.c
    const IVLN10 = 4.34294481903251816668e-01, LOG10_2HI = 3.01029995663611771306e-01, LOG10_2LO = 3.69423907715893078616e-13;
    function log10(x) {
      let hx = hi(x), k = 0;
      const lx = lo(x);
      if (hx < 0x00100000) {
        if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
        if (hx < 0) return NaN;
        k -= 54; x *= TWO54; hx = hi(x);
      }
      if (hx >= 0x7FF00000) return x + x;
      k += (hx >> 20) - 1023;
      const i = k >>> 31;
      hx = (hx & 0x000FFFFF) | ((0x3FF - i) << 20);
      const y = k + i;
      x = mitHi(x, hx);
      const z = y * LOG10_2LO + IVLN10 * log(x);
      return z + y * LOG10_2HI;
    }

    // k_log.h k_log1p(f): log(1+f) - f + hfsq für |f| klein
    function kLog1p(f) {
      const s = f / (2 + f), z = s * s, w = z * z;
      const t1 = w * (LG2 + w * (LG4 + w * LG6));
      const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
      const r = t2 + t1, hfsq = 0.5 * f * f;
      return s * (hfsq + r);
    }

    // FreeBSD e_log2.c
    const IVLN2HI = 1.44269504072144627571e+00, IVLN2LO = 1.67517131648865118353e-10;
    function log2(x) {
      let hx = hi(x), k = 0;
      const lx = lo(x);
      if (hx < 0x00100000) {
        if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
        if (hx < 0) return NaN;
        k -= 54; x *= TWO54; hx = hi(x);
      }
      if (hx >= 0x7FF00000) return x + x;
      if (hx === 0x3FF00000 && lx === 0) return 0;
      k += (hx >> 20) - 1023;
      hx &= 0x000FFFFF;
      const i = (hx + 0x95F64) & 0x100000;
      x = mitHi(x, hx | (i ^ 0x3FF00000));
      k += i >> 20;
      const y = k, f = x - 1, hfsq = 0.5 * f * f, r = kLog1p(f);
      const h = ohneLo(f - hfsq);
      const l = (f - h) - hfsq + r;
      let valHi = h * IVLN2HI, valLo = (l + h) * IVLN2LO + l * IVLN2HI;
      const w = y + valHi;
      valLo += (y - w) + valHi;
      valHi = w;
      return valLo + valHi;
    }

    // e_exp.c (V8: exp(1) = E)
    const HALF = [0.5, -0.5], O_THRESHOLD = 7.09782712893383973096e+02, U_THRESHOLD = -7.45133219101941108420e+02,
      LN2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01], LN2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10],
      INVLN2 = 1.44269504088896338700e+00, P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03,
      P3 = 6.61375632143793436117e-05, P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08,
      E = 2.718281828459045, HUGE = 1.0e+300, TWOM1000 = 9.33263618503218878990e-302, TWO1023 = 8.988465674311579539e307;
    function exp(x) {
      let hi_ = 0, lo_ = 0, k = 0;
      const hx0 = hi(x), xsb = (hx0 >> 31) & 1, hx = hx0 & 0x7FFFFFFF;
      if (hx >= 0x40862E42) {
        if (hx >= 0x7FF00000) {
          if (((hx & 0xFFFFF) | lo(x)) !== 0) return x + x;
          return xsb === 0 ? x : 0;
        }
        if (x > O_THRESHOLD) return HUGE * HUGE;
        if (x < U_THRESHOLD) return TWOM1000 * TWOM1000;
      }
      if (hx > 0x3FD62E42) {
        if (hx < 0x3FF0A2B2) {
          if (x === 1) return E;
          hi_ = x - LN2HI[xsb]; lo_ = LN2LO[xsb]; k = 1 - xsb - xsb;
        } else {
          k = Math.trunc(INVLN2 * x + HALF[xsb]);
          hi_ = x - k * LN2HI[0]; lo_ = k * LN2LO[0];
        }
        x = hi_ - lo_;
      } else if (hx < 0x3E300000) {
        if (HUGE + x > 1) return 1 + x;
      } else k = 0;
      const t = x * x;
      const twopk = k >= -1021 ? worte((0x3FF00000 + (k << 20)) | 0, 0) : worte((0x3FF00000 + ((k + 1000) << 20)) | 0, 0);
      const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
      if (k === 0) return 1 - ((x * c) / (c - 2) - x);
      const y = 1 - ((lo_ - (x * c) / (2 - c)) - hi_);
      if (k >= -1021) return k === 1024 ? y * 2 * TWO1023 : y * twopk;
      return y * twopk * TWOM1000;
    }
    return { log, log10, log2, exp };
  })();

  const MATHE_M = tabelle({
    'wurzel': function (m, pos) { return Math.sqrt(this.zahl(pos[0], 'wurzel')); },
    'max': function (m, pos) { if (!pos.length) throw this.ananas('RechenAnanas', 'max() ohne Zahlen?'); return Math.max.apply(null, pos.map(x => this.zahl(x, 'max'))); },
    'min': function (m, pos) { if (!pos.length) throw this.ananas('RechenAnanas', 'min() ohne Zahlen?'); return Math.min.apply(null, pos.map(x => this.zahl(x, 'min'))); },
    'abs': function (m, pos) { return Math.abs(this.zahl(pos[0], 'abs')); },
    'runden': function (m, pos) { return rundeAuf(this.zahl(pos[0], 'runden'), pos.length > 1 ? this.ganzzahl(pos[1], 'runden') : 0); },
    'boden': function (m, pos) { return Math.floor(this.zahl(pos[0], 'boden')); },
    'decke': function (m, pos) { return Math.ceil(this.zahl(pos[0], 'decke')); },
    'potenz': function (m, pos) { return Math.pow(this.zahl(pos[0], 'potenz'), this.zahl(pos[1], 'potenz')); },
    // K-111/U-72: fdlibm-Port LOGEXP statt Math.* (Sonderfälle: log(0) → -Infinity, log(-1) → NaN, exp(710) → Infinity)
    'log': function (m, pos) { return LOGEXP.log(this.zahl(pos[0], 'log')); },
    'log10': function (m, pos) { return LOGEXP.log10(this.zahl(pos[0], 'log10')); },
    'log2': function (m, pos) { return LOGEXP.log2(this.zahl(pos[0], 'log2')); },
    'exp': function (m, pos) { return LOGEXP.exp(this.zahl(pos[0], 'exp')); },
    // K-137: Winkelfunktionen im Bogenmaß – fdlibm-Port WINKEL statt Math.* (in jedem JS-Motor und in Wasm dieselben Bits)
    'sin': function (m, pos) { return WINKEL.sin(this.zahl(pos[0], 'sin')); },
    'cos': function (m, pos) { return WINKEL.cos(this.zahl(pos[0], 'cos')); },
    'tan': function (m, pos) { return WINKEL.tan(this.zahl(pos[0], 'tan')); },
    'asin': function (m, pos) { return WINKEL.asin(this.zahl(pos[0], 'asin')); },
    'acos': function (m, pos) { return WINKEL.acos(this.zahl(pos[0], 'acos')); },
    'atan': function (m, pos) { return WINKEL.atan(this.zahl(pos[0], 'atan')); },
    'atan2': function (m, pos) { const y = this.zahl(pos[0], 'atan2'); return WINKEL.atan2(y, this.zahl(pos[1], 'atan2')); },
    'bogen': function (m, pos) { return WINKEL.bogen(this.zahl(pos[0], 'bogen')); },
    'grad': function (m, pos) { return WINKEL.grad(this.zahl(pos[0], 'grad')); }
  });

  // ══════════ site/js/pizza/std/zufall.js ══════════
  // pizza-Interpreter · Standardbibliothek: Zufall
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // Methoden eines Zufallsstroms; `g` ist der ZufallGen (global oder eigener aus `neu Zufall`)
  const ZUFALL_GEN_M = {
    'zahl': function (g, pos) {
      let a = this.ganzzahl(pos[0], 'Zufall.zahl'), b = this.ganzzahl(pos[1], 'Zufall.zahl');
      if (a > b) { const t = a; a = b; b = t; }
      return a + Math.floor(g.r() * (b - a + 1));
    },
    'kommazahl': function (g, pos) {
      if (!pos.length) return g.r();
      let a = this.zahl(pos[0], 'Zufall.kommazahl'), b = this.zahl(pos[1], 'Zufall.kommazahl');
      if (a > b) { const t = a; a = b; b = t; }
      return a + g.r() * (b - a);
    },
    'wahr': function (g, pos) { const p = this.zahl(pos[0], 'Zufall.wahr'); return g.r() < p; },
    'wähle': function (g, pos) {
      const b = pos[0];
      if (!Array.isArray(b)) throw this.ananas('TypAnanas', 'Zufall.wähle braucht ein Blech, nicht ' + this.darstellung(b) + '.');
      if (!b.length) throw this.ananas('KeinStückAnanas', 'Das Blech ist leer – kein Stück da.');
      return b[Math.floor(g.r() * b.length)];
    },
    'mische': function (g, pos) {
      const b = pos[0];
      if (!Array.isArray(b)) throw this.ananas('TypAnanas', 'Zufall.mische braucht ein Blech, nicht ' + this.darstellung(b) + '.');
      const c = b.slice();
      for (let i = c.length - 1; i >= 1; i--) {
        const j = Math.floor(g.r() * (i + 1));
        const t = c[i]; c[i] = c[j]; c[j] = t;
      }
      return c;
    },
    'saat': function (g) { return g.saat; },
    'alsText': function (g) { return this.text(g); }
  };
  const ZUFALL_OBJ_M = tabelle(ZUFALL_GEN_M);
  // Ziehen aus einem Zufall-Objekt der Hauptküche ist in der Küche verboten (§2.3)
  for (const k of ['zahl', 'kommazahl', 'wahr', 'wähle', 'mische']) {
    const f = ZUFALL_GEN_M[k];
    ZUFALL_OBJ_M[k] = function (g, pos, ben, node) {
      if (this.kueche !== null && this.istGefroren(g)) throw this.ananas('KüchenAnanas', 'Dieser Zufall gehört der Hauptküche – nimm Zufall direkt oder neu Zufall().');
      return f.call(this, g, pos, ben, node);
    };
  }
  // saat(n) auf einem vorhandenen Zufall-Objekt zählt als Ziehen (K-098/2); saat() liest
  ZUFALL_OBJ_M['saat'] = function (g, pos, ben, node) {
    if (this.kueche !== null && pos.length > 0 && this.istGefroren(g)) throw this.ananas('KüchenAnanas', 'Dieser Zufall gehört der Hauptküche – nimm Zufall direkt oder neu Zufall().');
    return ZUFALL_GEN_M['saat'].call(this, g, pos, ben, node);
  };
  const ZUFALL_M = tabelle(Object.assign({}, ...Object.keys(ZUFALL_GEN_M).map(k => ({
    [k]: function (m, pos, ben, node) { return ZUFALL_GEN_M[k].call(this, this.zufallGlobal, pos, ben, node); }
  })), {
    'saat': function (m, pos) {
      if (!pos.length) return this.zufallGlobal.saat;
      this.zufallGlobal = new ZufallGen(this.ganzzahl(pos[0], 'Zufall.saat'));
      return null;
    }
  }));

  // ══════════ site/js/pizza/std/vorrat.js ══════════
  // pizza-Interpreter · Vorratskammer (Methodentabelle und Laufzeit)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // ---------------------------------------------------------------- Vorratskammer (K-079/K-080)
  const KAMMER_M = tabelle({
    'lege': function (k, pos) {
      if (this.kueche !== null) this.kuecheKammer(k);
      const s = this.kammerSchluessel(pos[0]);
      const w = this.einlagern(pos.length > 1 ? pos[1] : null);
      const alt = k.daten.has(s) ? k.daten.get(s) : undefined;
      k.daten.set(s, w);
      this.kammerGeaendert(k, s, w, () => { if (alt === undefined) k.daten.delete(s); else k.daten.set(s, alt); });
      return k;
    },
    'hole': function (k, pos, ben) {
      const s = this.kammerSchluessel(pos[0]);
      if (k.daten.has(s)) return this.auslagern(k.daten.get(s));
      const e = arg(pos, ben, 1, 'ersatz');
      return e === undefined ? null : e;
    },
    'hat': function (k, pos) { return k.daten.has(this.kammerSchluessel(pos[0])); },
    'entferne': function (k, pos) {
      if (this.kueche !== null) this.kuecheKammer(k);
      const s = this.kammerSchluessel(pos[0]);
      if (!k.daten.has(s)) return null;
      const alt = k.daten.get(s);
      k.daten.delete(s);
      this.kammerGeaendert(k, s, null, null);
      return this.auslagern(alt);
    },
    'schlüssel': function (k) { return Array.from(k.daten.keys()); },
    'länge': function (k) { return k.daten.size; },
    'leeren': function (k) { if (this.kueche !== null) this.kuecheKammer(k); k.daten.clear(); this.kammerGeaendert(k, null, null, null); return k; },
    'name': function (k) { return k.name; },
    'namensraum': function (k) { return k.raum; },  // K-106: Text oder karton
    'alsText': function (k) { return this.text(k); }
  });

  // Laufzeit: Vorratskammer
  class LaufzeitVorrat {
    kammerSchluessel(k) {
      if (typeof k !== 'string') throw this.ananas('TypAnanas', 'Schlüssel einer Vorratskammer müssen Texte sein, nicht ' + this.darstellung(k) + '.');
      return k;
    }

    // Pizza-Wert → JSON-Wert (K-080); wirft TypAnanas für nicht einlagerbare Werte
    einlagern(v) {
      const nein = () => this.ananas('TypAnanas', '\'' + this.textSicher(v) + '\' lässt sich nicht einlagern (erlaubt: Zahlen, Texte, Wahrheitswerte, karton, Bleche und Speisekarten daraus).');
      if (v === null || v === undefined) return null;
      switch (typeof v) {
        case 'number': if (!isFinite(v)) throw nein(); return Object.is(v, -0) ? 0 : v;
        case 'string': case 'boolean': return v;
      }
      if (Array.isArray(v)) return v.map(x => this.einlagern(x));
      if (v instanceof Map) {
        const paare = [];
        for (const [k, w] of v) {
          if (typeof k !== 'string') throw nein();
          paare.push([k, this.einlagern(w)]);
        }
        return { speisekarte: paare };
      }
      throw nein();
    }

    textSicher(v) { try { return this.text(v); } catch (e) { return this.typName(v); } }

    // JSON-Wert → neuer Pizza-Wert (tiefe Kopie)
    auslagern(j) {
      if (j === null || typeof j !== 'object') return j === undefined ? null : j;
      if (Array.isArray(j)) return j.map(x => this.auslagern(x));
      if (Array.isArray(j.speisekarte)) {
        const m = new Map();
        for (const p of j.speisekarte) if (Array.isArray(p) && typeof p[0] === 'string') m.set(p[0], this.auslagern(p[1]));
        return m;
      }
      return null;
    }

    kammerEintraege(k) {
      return Array.from(k.daten, ([s, w]) => [s, JSON.parse(JSON.stringify(w))]);
    }

    kammerGeaendert(k, schluessel, wert, rueckgaengig) {
      const groesse = new TextEncoder().encode(JSON.stringify({ v: 1, name: k.kennung, eintraege: Array.from(k.daten) })).length;
      if (groesse > 1048576 && rueckgaengig !== null) {
        rueckgaengig();
        throw this.ananas('LaufzeitAnanas', 'Die Vorratskammer \'' + k.kennung + '\' ist voll (Limit 1 MiB).');
      }
      this.emit({ typ: 'vorrat', name: k.kennung, schluessel, wert: wert === null ? null : JSON.parse(JSON.stringify(wert)) });
      if (this.onVorrat !== null) {
        let ok = true;
        try { ok = this.onVorrat(k.kennung, this.kammerEintraege(k)) !== false; } catch (e) { ok = false; }
        if (!ok) throw this.ananas('LaufzeitAnanas', 'Die Vorratskammer \'' + k.kennung + '\' konnte nicht gespeichert werden.');
      }
    }

    // K-106: neu Vorratskammer(name[, namensraum]) – Kennung = name bzw. namensraum/name; gleiche Kennung = gleiche Kammer
    neueKammer(pos, ben, node) {
      const n = arg(pos, ben, 0, 'name');
      const name = n === undefined || n === null ? '' : this.text(n);
      if (!/^[a-z0-9-]{1,40}$/.test(name)) throw this.ananas('LaufzeitAnanas', 'Ungültiger Kammername \'' + name + '\' (erlaubt: a–z, 0–9, \'-\', 1–40 Zeichen).');
      const r = arg(pos, ben, 1, 'namensraum');
      const raum = r === undefined || r === null ? null : this.text(r);
      if (raum !== null && !/^[a-z0-9-]{1,40}$/.test(raum)) throw this.ananas('LaufzeitAnanas', 'Ungültiger Namensraum \'' + raum + '\' (erlaubt: a–z, 0–9, \'-\', 1–40 Zeichen).');
      const kennung = raum === null ? name : raum + '/' + name;
      const da = this.kammern.get(kennung);
      if (da !== undefined) return da;
      if (this.vorratOpt === null && this.onVorrat === null && !this.w0101) {
        this.w0101 = true;
        this.warnung('W0101', 'Keine Vorratskammer verfügbar – Zustand wird nicht gespeichert.', node);
      }
      const k = new Kammer(name, raum);
      let eintraege = null;
      if (this.vorratOpt !== null) { try { eintraege = this.vorratOpt[kennung]; } catch (e) { eintraege = null; } }
      if (eintraege && !Array.isArray(eintraege) && Array.isArray(eintraege.eintraege)) eintraege = eintraege.eintraege;
      if (Array.isArray(eintraege)) {
        for (const p of eintraege) {
          if (Array.isArray(p) && typeof p[0] === 'string') k.daten.set(p[0], JSON.parse(JSON.stringify(p[1] === undefined ? null : p[1])));
        }
      }
      this.kammern.set(kennung, k);
      return k;
    }
  }
  laufzeitTeil(LaufzeitVorrat);

  // ══════════ site/js/pizza/std/spiegel.js ══════════
  // pizza-Interpreter · Standardbibliothek: Spiegel
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

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

  // ══════════ site/js/pizza/std/kiste.js ══════════
  // pizza-Interpreter · Standardbibliothek: Kiste (Projektdateien lesen, SPEC §11.2, K-146)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).
  //
  // Die Kiste ist die Sammlung des Laders ohne pruefung/ (this.kiste = ladeProjekt(…).kiste: Texte normalisiert, sonst
  // Uint8Array). Nur lesend, in Stücken einer brigade erlaubt (keine Hauptküchen-Sperre). „Text“ entscheidet die Endung
  // (istTextPfad, projekt.js), nie der Inhalt.

  function kisteHat(kiste, pfad) { return Object.prototype.hasOwnProperty.call(kiste, pfad); }

  const KISTE_M = tabelle({
    'text': function (m, pos, ben) { return this.kisteText(arg(pos, ben, 0, 'pfad'), 'text'); },
    'zeilen': function (m, pos, ben) {
      const t = this.kisteText(arg(pos, ben, 0, 'pfad'), 'zeilen');
      const z = t.split('\n');
      if (z[z.length - 1] === '') z.pop();
      return z;
    },
    'gibts': function (m, pos, ben) {
      const p = this.kistePfad(arg(pos, ben, 0, 'pfad'), 'gibts', 'pfad');
      return kisteHat(this.kiste, p);   // nur Dateien; ein ungültiger Pfad steht nie in der Kiste
    },
    'liste': function (m, pos, ben) {
      const o = arg(pos, ben, 0, 'ordner');
      const ordner = o === undefined ? '' : this.kistePfad(o, 'liste', 'ordner');
      const alle = Object.keys(this.kiste).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));   // Pfade sind ASCII: = Bytefolge
      if (ordner === '') return alle;
      if (pruefePfad(ordner) !== null) return [];
      const vor = ordner + '/';
      return alle.filter(p => p.slice(0, vor.length) === vor);
    }
  });

  class KisteLaufzeit {
    // Argument muss ein Text sein (SPEC §11.2) – TypAnanas mit Methoden- und Parametername
    kistePfad(v, wo, param) {
      if (typeof v === 'string') return v;
      throw this.ananas('TypAnanas', 'Kiste.' + wo + '() braucht einen Text für \'' + param + '\', nicht ' + this.darstellung(v === undefined ? null : v) + '.');
    }
    kisteText(v, wo) {
      const p = this.kistePfad(v, wo, 'pfad');
      if (!kisteHat(this.kiste, p)) throw this.ananas('LaufzeitAnanas', 'Die Datei "' + p + '" liegt nicht in der Kiste.');
      const t = this.kiste[p];
      if (!istTextPfad(p) || typeof t !== 'string') throw this.ananas('LaufzeitAnanas', p + ' ist kein Text.');
      return t;
    }
  }
  laufzeitTeil(KisteLaufzeit);

  // ══════════ site/js/pizza/theke/tabellen.js ══════════
  // pizza-Interpreter · Theke: Zutaten-Klassen, Stil, Methodentabellen (THEKE.md)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // ---------- Theke (UI-Framework, THEKE.md) ----------
  const UI_KLASSEN = {
    Schild: 'schild', Knopf: 'knopf', Eingabe: 'eingabe', Haken: 'haken', Stapel: 'stapel', Reihe: 'reihe',
    Takt: 'takt', Fortschritt: 'fortschritt', Abschnitt: 'abschnitt', Tabelle: 'tabelle', Reiter: 'reiter',
    Auswahl: 'auswahl', Tastatur: 'tastatur'
  };
  const UI_ART_NAME = {
    schild: 'Schild', knopf: 'Knopf', eingabe: 'Eingabe', haken: 'Haken', stapel: 'Stapel', reihe: 'Reihe',
    takt: 'Takt', fortschritt: 'Fortschritt', abschnitt: 'Abschnitt', tabelle: 'Tabelle', reiter: 'Reiter',
    auswahl: 'Auswahl', tastatur: 'Tastatur'
  };
  const UI_BEHAELTER = { stapel: true, reihe: true, abschnitt: true, reiter: true };
  // Stil-Whitelist (K-068, K-113, K-120): Reihenfolge der Schlüssel ist der Erlaubt-Text der Fehlermeldung (beide Laufzeiten gleich).
  // 'zahl' = Zahl ≥ 0, 'ganzzahl' = ganze Zahl ≥ 1, Liste = Vokabular.
  const UI_STIL = {
    breite: 'zahl', hoehe: 'zahl', abstand: 'zahl',
    ausrichtung: ['links', 'mitte', 'rechts'],
    schrift: ['klein', 'normal', 'gross', 'mono', 'riesig'],
    farbe: ['tomate', 'basilikum', 'mozzarella', 'kruste', 'normal'],
    zeilen: 'ganzzahl', mindestbreite: 'zahl',
    // Theke v6 (K-120): senkrechte Lage – an einer Reihe für ihre Kinder, an einer Zutat direkt in einer Reihe für sich selbst
    senkrecht: ['oben', 'mitte', 'unten', 'strecken'],
    // Theke v7 (K-126): Spaltengewichte einer Tabelle – Blech aus Zahlen > 0
    spalten: 'gewichte'
  };
  // Theke v3 (K-090): Animationsarten (Laufzeit-Liste; Renderer-Registry kennt dieselben Namen)
  const UI_ANIMATIONEN = ['puls', 'huepfen', 'wackeln', 'funkeln', 'einblenden', 'aufpoppen'];
  const UI_ANIM_MAX = 32;  // höchstens 32 Einträge je aendere-Nachricht, weitere entfallen still
  // Theke v5 (K-116): höchstens 100 Durchläufe je Synchronisationspunkt, dann LaufzeitAnanas (Zyklus)
  const UI_BINDUNG_DURCHLAEUFE = 100;
  // K-117: Gleichheit je Feld – Listen elementweise (zeilen verschachtelt), sonst nach Wert
  function uiGleich(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!uiGleich(a[i], b[i])) return false;
      return true;
    }
    return a === b;
  }
  class UiTheke {
    constructor(titel, breite, hoehe) {
      this.titel = titel; this.breite = breite; this.hoehe = hoehe;
      this.wurzel = null; this.gezeigt = false; this.geschlossen = false;
    }
  }
  class UiZutat {
    constructor(art, id) {
      this.art = art; this.id = id; this.eltern = null; this.sichtbar = true; this.stil = null;
      this.text = ''; this.wert = ''; this.platzhalter = ''; this.an = false; this.aktiv = true;
      this.kinder = UI_BEHAELTER[art] === true ? [] : null;
      this.beiKlick = null; this.beiAenderung = null; this.beiEnter = null;
      this.stilNull = null; this.hinweis = ''; this.uebergang = false;
      this.marke = '';                                       // Theke v6 (K-124): Marke am Reiter-Tab dieser Seite
      this.intervall = 1000; this.beiTakt = null;            // Takt
      this.fortschritt = 0;                                  // Fortschritt (wert 0…1)
      this.titel = ''; this.titelListe = null; this.gewaehlt = 1;  // Abschnitt / Reiter / Auswahl
      this.klappbar = false; this.zu = false;                // Abschnitt (K-108)
      this.optionen = null;                                  // Auswahl (K-109)
      this.beiTaste = null;                                  // Tastatur (K-110)
      this.spalten = null; this.zeilen = null;               // Tabelle
      this.abh = null;        // Theke v5 (K-116): Protokollfeld → Set<UiBindung>, die dieses Feld gelesen haben
      this.bindungen = null;  // Theke v5: Feld bzw. 's:'+Stilschlüssel → UiBindung
    }
  }
  // Theke v5 (K-116): Zettel – beobachtbarer Wert (keine Zutat); abh wie bei UiZutat (Feld 'wert')
  // Theke v7 (K-125): abl = UiBindung eines abgeleiteten Zettels (Zettel.aus(fn)), sonst null
  class Zettel { constructor(w) { this.w = w; this.abh = null; this.abl = null; } }
  // Theke v5 (K-116): eine Bindung – Zutat z, Eigenschaft/Stilschlüssel feld, Ausdruck fn, Aufrufstelle node (W0103);
  // quellen = flache Liste [objekt, feld, objekt, feld, …] der zuletzt gelesenen Quellen
  class UiBindung {
    constructor(z, feld, stil, fn, node) {
      this.z = z; this.feld = feld; this.stil = stil; this.fn = fn; this.node = node;
      this.dirty = true; this.quellen = []; this.erst = true;
    }
  }

  const ZUTAT_M = {
    'id': function (z) { return z.id; },
    'hinweis': function (z, pos) {
      if (!pos.length) { this.uiLies(z, 'hinweis'); return z.hinweis; }
      this.uiSetze(z, 'hinweis', this.uiWandle(z, 'hinweis', pos[0]), 'setter');
      return z;
    },
    // Theke v6 (K-124): Marke (Badge) – der Reiter zeigt sie am Tab dieser Seite; optionales Feld wie hinweis
    'marke': function (z, pos) {
      if (!pos.length) { this.uiLies(z, 'marke'); return z.marke; }
      this.uiSetze(z, 'marke', this.uiWandle(z, 'marke', pos[0]), 'setter');
      return z;
    },
    'uebergang': function (z, pos) {
      if (!pos.length) { this.uiLies(z, 'uebergang'); return z.uebergang; }
      this.uiSetze(z, 'uebergang', this.uiWandle(z, 'uebergang', pos[0]), 'setter');
      return z;
    },
    'animiere': function (z, pos, ben, node) {
      const a = arg(pos, ben, 0, 'art');
      const art = this.text(a === undefined ? null : a);
      if (UI_ANIMATIONEN.indexOf(art) < 0) throw this.ananas('LaufzeitAnanas', 'Animation \'' + art + '\' gibt es nicht. Erlaubt: ' + UI_ANIMATIONEN.join(', ') + '.');
      const dauer = this.uiAnimDauer(arg(pos, ben, 1, 'dauer'), 'animiere');
      if (!this.uiAnimOffen(z, node)) return z;
      const e = { id: z.id, art };
      if (dauer !== null) e.dauer = dauer;
      this.uiAnimPuffer(e);
      return z;
    },
    'sichtbar': function (z, pos) {
      if (!pos.length) { this.uiLies(z, 'sichtbar'); return z.sichtbar; }
      this.uiSetze(z, 'sichtbar', this.uiWandle(z, 'sichtbar', pos[0]), 'setter');
      return z;
    },
    'stil': function (z, pos) {
      const k = this.text(pos[0]);
      if (UI_STIL[k] === undefined) throw this.ananas('LaufzeitAnanas', 'Stil \'' + k + '\' gibt es nicht. Erlaubt: ' + Object.keys(UI_STIL).join(', ') + '.');
      this.uiSetzeStil(z, k, this.uiStilWert(k, pos[1]), 'setter');
      return z;
    },
    // Theke v5 (K-116): Eigenschaft bzw. Stil an einen Ausdruck binden; karton löst die Bindung
    'binde': function (z, pos, ben, node) { this.uiBinde(z, pos, node, false); return z; },
    'bindeStil': function (z, pos, ben, node) { this.uiBinde(z, pos, node, true); return z; },
    'alsText': function (z) { return this.text(z); }
  };
  function uiTabelle(eigen) { return tabelle(Object.assign({}, ZUTAT_M, eigen)); }
  // Setter: Argument prüfen/umwandeln (wie die Bindung desselben Namens), dann über die zentrale Schreibstelle uiSetze (K-116/K-117)
  function uiSetter(feld) {
    return function (z, pos) { this.uiSetze(z, feld, this.uiWandle(z, feld, pos[0]), 'setter'); return z; };
  }
  // Getter/Setter-Überladung (aktiv, sichtbar, hinweis, uebergang, klappbar, zu): ohne Argument Getter (Quelle einer Bindung)
  function uiUeberladen(feld) {
    return function (z, pos) {
      if (!pos.length) { this.uiLies(z, feld); return z[feld]; }
      this.uiSetze(z, feld, this.uiWandle(z, feld, pos[0]), 'setter');
      return z;
    };
  }
  const UI_TEXT_M = {
    'text': function (z) { this.uiLies(z, 'text'); return z.text; },
    'setzeText': uiSetter('text')
  };
  const UI_CONTAINER_M = {
    'hinzu': function (z, pos) { this.uiKind(z, pos[0]); this.uiAendere(z, 'kinder', null); return z; },
    'leeren': function (z) {
      if (z.kinder.length === 0) return z;  // K-117: leeren eines leeren Behälters ändert nichts
      for (const k of z.kinder) k.eltern = null;
      z.kinder = [];
      this.uiAendere(z, 'kinder', null);
      return z;
    }
  };
  const UI_AKTIV_M = { 'aktiv': uiUeberladen('aktiv') };
  const UI_TABELLEN = {
    schild: uiTabelle(UI_TEXT_M),
    knopf: uiTabelle(Object.assign({}, UI_TEXT_M, UI_AKTIV_M, {
      'beiKlick': function (z, pos) { z.beiKlick = this.uiFunktion(pos[0], 'beiKlick'); return z; }
    })),
    eingabe: uiTabelle({
      'wert': function (z) { this.uiLies(z, 'wert'); return z.wert; },
      'setzeWert': uiSetter('wert'),
      'beiAenderung': function (z, pos) { z.beiAenderung = this.uiFunktion(pos[0], 'beiAenderung'); return z; },
      'beiEnter': function (z, pos) { z.beiEnter = this.uiFunktion(pos[0], 'beiEnter'); return z; }
    }),
    haken: uiTabelle(Object.assign({}, UI_TEXT_M, {
      'an': function (z) { this.uiLies(z, 'an'); return z.an; },
      'setzeAn': uiSetter('an'),
      'beiAenderung': function (z, pos) { z.beiAenderung = this.uiFunktion(pos[0], 'beiAenderung'); return z; }
    })),
    stapel: uiTabelle(UI_CONTAINER_M),
    reihe: uiTabelle(UI_CONTAINER_M),
    takt: uiTabelle(Object.assign({}, UI_AKTIV_M, {
      'intervall': function (z) { this.uiLies(z, 'intervall'); return new Dauer(z.intervall); },
      'setzeIntervall': uiSetter('intervall'),
      'beiTakt': function (z, pos) { z.beiTakt = this.uiFunktion(pos[0], 'beiTakt'); return z; }
    })),
    fortschritt: uiTabelle({
      'wert': function (z) { this.uiLies(z, 'wert'); return z.fortschritt; },
      'setzeWert': uiSetter('wert'),
      'text': function (z) { this.uiLies(z, 'text'); return z.text; },
      // K-102: text ist ein optionales Feld (K-067) – karton/fehlend löscht den Text (uiWandle)
      'setzeText': uiSetter('text')
    }),
    abschnitt: uiTabelle(Object.assign({}, UI_CONTAINER_M, {
      'titel': function (z) { this.uiLies(z, 'titel'); return z.titel; },
      'setzeTitel': uiSetter('titel'),
      // K-108: klappbar/zu – Getter/Setter-Überladung wie sichtbar; beiAenderung(fn) → fn(zu)
      'klappbar': uiUeberladen('klappbar'),
      'zu': uiUeberladen('zu'),
      'beiAenderung': function (z, pos) { z.beiAenderung = this.uiFunktion(pos[0], 'beiAenderung'); return z; }
    })),
    tabelle: uiTabelle({
      'spalten': function (z) { this.uiLies(z, 'spalten'); return z.spalten.slice(); },
      'setzeSpalten': uiSetter('spalten'),
      'zeilen': function (z) { this.uiLies(z, 'zeilen'); return z.zeilen.map(x => x.slice()); },
      'setzeZeilen': uiSetter('zeilen')
    }),
    reiter: uiTabelle({
      'waehle': uiSetter('gewaehlt'),
      'gewaehlt': function (z) { this.uiLies(z, 'gewaehlt'); return z.gewaehlt; },
      'beiAenderung': function (z, pos) { z.beiAenderung = this.uiFunktion(pos[0], 'beiAenderung'); return z; },
      // K-107: Titel einer Seite lesen/setzen; Titelliste wird mit "" aufgefüllt, Nachricht als ganze Liste
      'titel': function (z, pos) {
        const n = this.reiterSeite(z, pos[0]);
        this.uiLies(z, 'titel');
        return n <= z.titelListe.length ? z.titelListe[n - 1] : '';
      },
      'setzeTitel': function (z, pos) {
        const n = this.reiterSeite(z, pos[0]);
        const liste = z.titelListe.slice();
        while (liste.length < n) liste.push('');
        liste[n - 1] = this.text(pos[1]);  // K-102: karton → "karton" (Zustandsfeld)
        this.uiSetze(z, 'titel', liste, 'setter');
        return z;
      }
    }),
    // K-109: Auswahl – genau eine Option gewählt
    auswahl: uiTabelle(Object.assign({}, UI_AKTIV_M, {
      'optionen': function (z) { this.uiLies(z, 'optionen'); return z.optionen.slice(); },
      'setzeOptionen': uiSetter('optionen'),
      'waehle': uiSetter('gewaehlt'),
      'gewaehlt': function (z) { this.uiLies(z, 'gewaehlt'); return z.gewaehlt; },
      'beiAenderung': function (z, pos) { z.beiAenderung = this.uiFunktion(pos[0], 'beiAenderung'); return z; }
    })),
    // K-110: Tastatur – unsichtbare Zutat wie Takt
    tastatur: uiTabelle(Object.assign({}, UI_AKTIV_M, {
      'beiTaste': function (z, pos) { z.beiTaste = this.uiFunktion(pos[0], 'beiTaste'); return z; }
    }))
  };
  // Theke v5 (K-116): bindbare Eigenschaften je Art (Reihenfolge = Fehlertext „Bindbar: …“); sichtbar, hinweis, marke (K-124) für jede Zutat
  const UI_BINDBAR = {
    schild: ['text'], knopf: ['text', 'aktiv'], eingabe: ['wert'], haken: ['text', 'an'], stapel: [], reihe: [],
    takt: ['aktiv', 'intervall'], fortschritt: ['wert', 'text'], abschnitt: ['titel', 'klappbar', 'zu'], tabelle: ['spalten', 'zeilen'],
    reiter: ['gewaehlt'], auswahl: ['optionen', 'gewaehlt', 'aktiv'], tastatur: ['aktiv']
  };
  const UI_BINDBAR_ALLE = ['sichtbar', 'hinweis', 'marke'];
  // Protokollfeld → internes Feld der UiZutat, wo die Namen abweichen
  const UI_FELD_INTERN = { 'fortschritt.wert': 'fortschritt', 'reiter.titel': 'titelListe' };
  const THEKE_M = tabelle({
    'zeige': function (t, pos) { this.uiZeige(t, pos[0]); return t; },
    'bediene': function (t, pos, ben, node) { this.uiBediene(t, node); return null; },
    'schliesse': function (t) { this.uiSchliesse(t); return null; },
    'setzeTitel': function (t, pos) {
      t.titel = this.text(pos[0]);
      if (t.gezeigt && !t.geschlossen) { this.uiFlush(); this.uiSende({ v: 1, op: 'fenster', titel: t.titel, breite: t.breite, hoehe: t.hoehe }); }
      return t;
    },
    'titel': function (t) { return t.titel; },
    'schwebe': function (t, pos, ben, node) {
      const tx = arg(pos, ben, 0, 'text');
      const text = this.text(tx === undefined ? null : tx);
      let bei = arg(pos, ben, 1, 'bei');
      if (bei === undefined) bei = null;
      if (bei !== null && !(bei instanceof UiZutat)) throw this.ananas('TypAnanas', 'schwebe(bei: …) braucht eine Zutat, nicht ' + this.darstellung(bei) + '.');
      let farbe = arg(pos, ben, 2, 'farbe');
      if (farbe === undefined) farbe = null;
      if (farbe !== null) {
        farbe = this.text(farbe);
        if (UI_STIL.farbe.indexOf(farbe) < 0) throw this.ananas('LaufzeitAnanas', 'Wert \'' + farbe + '\' ist für Stil \'farbe\' nicht erlaubt. Erlaubt: ' + UI_STIL.farbe.join(', ') + '.');
      }
      const dauer = this.uiAnimDauer(arg(pos, ben, 3, 'dauer'), 'schwebe');
      if (!this.uiAnimOffen(bei, node)) return t;
      const e = { art: 'schwebe', text };
      if (bei !== null) e.id = bei.id;
      if (farbe !== null) e.farbe = farbe;
      if (dauer !== null) e.dauer = dauer;
      this.uiAnimPuffer(e);
      return t;
    },
    'alsText': function (t) { return this.text(t); }
  });
  // Theke v5 (K-116): Zettel – beobachtbarer Wert. setze meldet nur bei ungleichem Wert (Gleichheit wie ==, K-017).
  const ZETTEL_M = tabelle({
    'wert': function (z) { this.uiLies(z, 'wert'); return z.w; },
    'setze': function (z, pos) {
      // K-125: ein abgeleiteter Zettel hat einen Schreiber – seinen Ausdruck
      if (z.abl !== null) throw this.ananas('LaufzeitAnanas', 'Der Zettel ist abgeleitet – setze seine Quellen, nicht ihn.');
      const w = pos.length && pos[0] !== undefined ? pos[0] : null;
      if (!this.gleich(z.w, w)) { z.w = w; this.uiSchmutzig(z, 'wert'); }
      return z;
    },
    'alsText': function (z) { return this.text(z); }
  });
  // Theke v7 (K-125): Zettel.aus(fn) – abgeleiteter Zettel (wird wie eine Bindung ausgewertet, Ziel ist sein Wert)
  const ZETTEL_MOD_M = tabelle({
    'aus': function (m, pos, ben, node) { return this.uiZettelAus(pos, node); }
  });

  // ══════════ site/js/pizza/theke/laufzeit.js ══════════
  // pizza-Interpreter · Theke: Laufzeit (Fenster, Zettel, Bindungen, Ereignisse)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // Laufzeit: Theke, Zettel & Bindungen
  class LaufzeitTheke {
    // ---------- Theke ----------
    // Programmende: letzte Änderungen senden, offenes Fenster schließen (Nutzerentscheidung, überschreibt K-061)
    uiEnde() {
      const t = this.uiTheke;
      try {
        this.uiFlush();
      } finally {
        // auch wenn eine Bindung am Programmende wirft: schliesse geht vor dem fehler-Ereignis hinaus (K-061)
        if (t !== null && t.gezeigt && !t.geschlossen) {
          this.uiSende({ v: 1, op: 'schliesse' });
          t.geschlossen = true;
          t.gezeigt = false;
        }
        this.herdEnde();
      }
    }

    uiSende(nachricht) {
      if (this.onUi !== null) { try { this.onUi(nachricht); } catch (e) { /* Renderer-Fehler ignorieren */ } }
      this.emit({ typ: 'ui', nachricht });
    }

    uiFunktion(f, wo) {
      if (f === null || f === undefined) return null;
      if (f instanceof Funktion || f instanceof Gebunden || f instanceof NativFn) return f;
      throw this.ananas('TypAnanas', wo + '() braucht eine Funktion, z. B. () -> { … }.');
    }

    uiNeu(name, pos, ben) {
      const art = UI_KLASSEN[name];
      const idArg = ben !== null && 'id' in ben ? ben.id : undefined;
      let id;
      if (idArg !== undefined && idArg !== null) {
        id = this.text(idArg);
        if (id === '') throw this.ananas('LaufzeitAnanas', 'Eine Zutat-ID darf nicht leer sein.');
        if (this.uiZutaten.has(id)) throw this.ananas('LaufzeitAnanas', 'Die ID \'' + id + '\' gibt es schon.');
      } else {
        // Auto-ID wird vor der Prüfung der Argumente vergeben (auch ein fehlgeschlagenes neu verbraucht die Nummer, K-059/K-060)
        do { id = 'z' + (++this.uiIdZaehler); } while (this.uiZutaten.has(id));
      }
      const z = new UiZutat(art, id);
      switch (art) {
        case 'schild': { const t = arg(pos, ben, 0, 'text'); z.text = t === undefined ? '' : this.text(t); break; }
        case 'knopf': {
          const t = arg(pos, ben, 0, 'text'); z.text = t === undefined ? '' : this.text(t);
          z.beiKlick = this.uiFunktion(arg(pos, ben, 1, 'beiKlick'), 'Knopf');
          break;
        }
        case 'eingabe': {
          const w = arg(pos, ben, 0, 'wert'); z.wert = w === undefined ? '' : this.text(w);  // K-102: karton → "karton" (Zustandsfeld)
          const ph = arg(pos, ben, 1, 'platzhalter'); z.platzhalter = ph === undefined || ph === null ? '' : this.text(ph);
          break;
        }
        case 'haken': {
          const t = arg(pos, ben, 0, 'text'); z.text = t === undefined ? '' : this.text(t);
          const an = arg(pos, ben, 1, 'an'); z.an = an === undefined || an === null ? false : this.bool(an);
          break;
        }
        case 'takt': {
          const d = arg(pos, ben, 0, 'intervall');
          z.intervall = this.taktIntervall(d === undefined ? null : d);
          z.beiTakt = this.uiFunktion(arg(pos, ben, 1, 'beiTakt'), 'Takt');
          break;
        }
        case 'fortschritt': {
          z.fortschritt = this.fortschrittWert(arg(pos, ben, 0, 'wert'));
          const t = arg(pos, ben, 1, 'text'); z.text = t === undefined || t === null ? '' : this.text(t);
          break;
        }
        case 'tabelle':
          z.spalten = this.tabellenZeile(arg(pos, ben, 0, 'spalten'), 'Spalten');
          z.zeilen = this.tabellenZeilen(arg(pos, ben, 1, 'zeilen'));
          break;
        case 'abschnitt': {
          const t = arg(pos, ben, 0, 'titel'); z.titel = t === undefined ? '' : this.text(t);  // K-102: karton → "karton" (Zustandsfeld)
          const b = arg(pos, ben, 1, 'kinder');
          if (b !== undefined && b !== null) {
            if (!Array.isArray(b)) throw this.ananas('TypAnanas', 'Abschnitt braucht ein Blech mit Zutaten, nicht ' + this.darstellung(b) + '.');
            for (const k of b) this.uiKind(z, k);
          }
          break;
        }
        case 'reiter': {
          const t = arg(pos, ben, 0, 'titel');
          z.titelListe = t === undefined || t === null ? [] : this.tabellenZeile(t, 'Titel');
          const b = arg(pos, ben, 1, 'seiten');
          if (b !== undefined && b !== null) {
            if (!Array.isArray(b)) throw this.ananas('TypAnanas', 'Reiter braucht ein Blech mit Zutaten, nicht ' + this.darstellung(b) + '.');
            for (const k of b) this.uiKind(z, k);
          }
          break;
        }
        case 'auswahl': {
          // K-109: erst optionen (Blech-Prüfung), dann gewaehlt (Bereichsprüfung gegen die Anzahl)
          z.optionen = this.auswahlOptionen(arg(pos, ben, 0, 'optionen'));
          const g = arg(pos, ben, 1, 'gewaehlt');
          z.gewaehlt = g === undefined || g === null ? 1 : this.auswahlOption(z, g);
          break;
        }
        case 'tastatur':
          z.beiTaste = this.uiFunktion(arg(pos, ben, 0, 'beiTaste'), 'Tastatur');
          break;
        default: {
          const b = arg(pos, ben, 0, 'kinder');
          if (b !== undefined && b !== null) {
            if (!Array.isArray(b)) throw this.ananas('TypAnanas', UI_ART_NAME[art] + ' braucht ein Blech mit Zutaten, nicht ' + this.darstellung(b) + '.');
            for (const k of b) this.uiKind(z, k);
          }
        }
      }
      this.uiZutaten.set(z.id, z);
      return z;
    }

    taktIntervall(d) {
      if (!(d instanceof Dauer)) throw this.ananas('TypAnanas', 'Ein Takt braucht eine Dauer, nicht ' + this.darstellung(d) + '.');
      const ms = Math.round(d.ms);
      if (!(ms >= 100)) throw this.ananas('LaufzeitAnanas', 'Ein Takt braucht mindestens 100ms, nicht ' + dauerText(d.ms) + '.');
      return ms;
    }

    fortschrittWert(w) {
      if (w === null || w === undefined) return 0;
      if (typeof w !== 'number') throw this.ananas('TypAnanas', 'Ein Fortschritt braucht eine Zahl zwischen 0 und 1, nicht ' + this.darstellung(w) + '.');
      if (Number.isNaN(w)) return 0;
      return w < 0 ? 0 : w > 1 ? 1 : w;
    }

    // K-107/K-086: Seitennummer eines Reiters – ganze Zahl 1 … Zahl der Kinder, sonst KeinStückAnanas (Textform von n)
    reiterSeite(z, n) {
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > z.kinder.length) {
        throw this.ananas('KeinStückAnanas', 'Seite ' + this.text(n) + ' gibt es nicht – der Reiter hat ' + z.kinder.length + ' Seite' + (z.kinder.length === 1 ? '' : 'n') + '.');
      }
      return n;
    }

    // K-109: Optionen einer Auswahl – Blech → Textformen (karton → "karton"); fehlend/karton → []
    auswahlOptionen(b) {
      if (b === null || b === undefined) return [];
      if (!Array.isArray(b)) throw this.ananas('TypAnanas', 'Auswahl braucht ein Blech mit Optionen, nicht ' + this.darstellung(b) + '.');
      return b.map(x => this.text(x));
    }

    // K-109: Optionsnummer – ganze Zahl 1 … Anzahl, sonst KeinStückAnanas („1 Option“ im Singular)
    auswahlOption(z, n) {
      const anzahl = z.optionen.length;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > anzahl) {
        throw this.ananas('KeinStückAnanas', 'Option ' + this.text(n) + ' gibt es nicht – die Auswahl hat ' + anzahl + ' Option' + (anzahl === 1 ? '' : 'en') + '.');
      }
      return n;
    }

    tabellenZeile(b, wo) {
      if (b === null || b === undefined) return [];
      if (!Array.isArray(b)) throw this.ananas('TypAnanas', 'Tabelle.' + wo + ' braucht ein Blech, nicht ' + this.darstellung(b) + '.');
      return b.map(x => this.text(x));
    }

    tabellenZeilen(b) {
      if (b === null || b === undefined) return [];
      if (!Array.isArray(b)) throw this.ananas('TypAnanas', 'Tabelle-Zeilen brauchen ein Blech aus Blechen, nicht ' + this.darstellung(b) + '.');
      return b.map(z => this.tabellenZeile(z, 'setzeZeilen'));
    }

    stellen(n, wo) {
      const k = this.ganzzahl(n, wo);
      if (k < 0 || k > 20) throw this.ananas('RechenAnanas', wo + ': Nachkommastellen müssen zwischen 0 und 20 liegen, nicht ' + k + '.');
      return k;
    }

    uiKind(c, k) {
      if (!(k instanceof UiZutat)) throw this.ananas('TypAnanas', 'In ' + UI_ART_NAME[c.art] + ' passen nur Zutaten, nicht ' + this.darstellung(k) + '.');
      for (let x = c; x !== null; x = x.eltern) {
        if (x === k) throw this.ananas('LaufzeitAnanas', 'Die Zutat \'' + k.id + '\' kann nicht in sich selbst liegen.');
      }
      if (k.eltern !== null || (this.uiTheke !== null && this.uiTheke.wurzel === k)) {
        throw this.ananas('LaufzeitAnanas', 'Die Zutat \'' + k.id + '\' liegt schon woanders auf der Theke.');
      }
      k.eltern = c;
      c.kinder.push(k);
    }

    uiStilNachricht(z) {
      const o = Object.assign({}, z.stil || {});
      if (z.stilNull !== null) for (const k of z.stilNull) o[k] = null;
      return o;
    }

    uiAngezeigt(z) {
      const t = this.uiTheke;
      if (t === null || !t.gezeigt || t.geschlossen) return false;
      let x = z;
      while (x.eltern !== null) x = x.eltern;
      return x === t.wurzel;
    }

    uiBaum(z) {
      const o = { id: z.id, art: z.art };
      switch (z.art) {
        case 'schild': o.text = z.text; break;
        case 'knopf': o.text = z.text; if (!z.aktiv) o.aktiv = false; break;
        case 'eingabe': o.wert = z.wert; if (z.platzhalter !== '') o.platzhalter = z.platzhalter; break;
        case 'haken': o.text = z.text; o.an = z.an; break;
        case 'takt': o.intervall = z.intervall; if (!z.aktiv) o.aktiv = false; break;
        case 'fortschritt': o.wert = z.fortschritt; if (z.text !== '') o.text = z.text; break;
        case 'abschnitt': o.titel = z.titel; if (z.klappbar) o.klappbar = true; if (z.zu) o.zu = true; break;
        case 'tabelle': o.spalten = z.spalten.slice(); o.zeilen = z.zeilen.map(x => x.slice()); break;
        case 'reiter': o.titel = z.titelListe.slice(); o.gewaehlt = z.gewaehlt; break;
        case 'auswahl': o.optionen = z.optionen.slice(); o.gewaehlt = z.gewaehlt; if (!z.aktiv) o.aktiv = false; break;
        case 'tastatur': if (!z.aktiv) o.aktiv = false; break;
      }
      if (z.hinweis !== '') o.hinweis = z.hinweis;
      if (z.marke !== '') o.marke = z.marke;
      if (!z.sichtbar) o.sichtbar = false;
      if (z.uebergang) o.uebergang = true;
      if (z.stil !== null) o.stil = Object.assign({}, z.stil);
      z.stilNull = null;
      if (z.kinder !== null) o.kinder = z.kinder.map(k => this.uiBaum(k));
      return o;
    }

    uiAendere(z, feld, wert) {
      if (!this.uiAngezeigt(z)) return;
      let e = this.uiOffen.get(z.id);
      if (e === undefined) { e = { id: z.id }; this.uiOffen.set(z.id, e); }
      // K-115: kinder nur vormerken – die Liste entsteht erst beim Senden (Zustand am Synchronisationspunkt).
      e[feld] = feld === 'kinder' ? null : wert;
    }

    // ---------- Theke v5: Zettel & Bindungen (K-116 … K-118) ----------
    // Setter-Argument prüfen und umwandeln – gleiche Regeln für Setter und Bindung (K-102, K-066, Fortschritt-Klemmen, Takt, Listen)
    uiWandle(z, feld, v) {
      switch (feld) {
        case 'text': return z.art === 'fortschritt' && (v === undefined || v === null) ? '' : this.text(v);
        case 'wert': return z.art === 'fortschritt' ? this.fortschrittWert(v) : this.text(v);
        case 'hinweis': case 'marke': return v === undefined || v === null ? '' : this.text(v);
        case 'titel': return this.text(v);
        case 'an': case 'aktiv': case 'sichtbar': case 'uebergang': case 'klappbar': case 'zu': return this.bool(v);
        case 'intervall': return this.taktIntervall(v);
        case 'spalten': return this.tabellenZeile(v, 'setzeSpalten');
        case 'zeilen': return this.tabellenZeilen(v);
        case 'optionen': return this.auswahlOptionen(v);
        case 'gewaehlt': return z.art === 'reiter' ? this.reiterSeite(z, v) : this.auswahlOption(z, v);
      }
      return v;
    }

    // Stil-Wert prüfen (K-068, K-113); karton/fehlend → null (entfernt den Stil, K-075)
    uiStilWert(k, w) {
      if (w === null || w === undefined) return null;
      const art = UI_STIL[k];
      if (art === 'zahl') {
        if (typeof w !== 'number' || !(w >= 0) || !isFinite(w)) throw this.ananas('TypAnanas', 'Stil \'' + k + '\' braucht eine Zahl ≥ 0, nicht ' + this.darstellung(w) + '.');
        return w;
      }
      if (art === 'ganzzahl') {
        // K-113: zeilen – ganze Zahl ≥ 1
        if (typeof w !== 'number' || !Number.isInteger(w) || w < 1) throw this.ananas('TypAnanas', 'Stil \'' + k + '\' braucht eine ganze Zahl ≥ 1, nicht ' + this.darstellung(w) + '.');
        return w;
      }
      if (art === 'gewichte') {
        // K-126: spalten – nicht leeres Blech aus endlichen Zahlen > 0; gespeichert wird eine Kopie
        if (!Array.isArray(w) || w.length === 0 || !w.every(x => typeof x === 'number' && x > 0 && isFinite(x))) {
          throw this.ananas('TypAnanas', 'Stil \'' + k + '\' braucht ein Blech aus Zahlen > 0, nicht ' + this.darstellung(w) + '.');
        }
        return w.slice();
      }
      const t = this.text(w);
      if (art.indexOf(t) < 0) throw this.ananas('LaufzeitAnanas', 'Wert \'' + t + '\' ist für Stil \'' + k + '\' nicht erlaubt. Erlaubt: ' + art.join(', ') + '.');
      return t;
    }

    // Zentrale Schreibstelle (K-116/K-117). modus: 'setter' (prüft, ob die Eigenschaft gebunden ist; sendet),
    // 'bindung' (Ergebnis einer Bindung; sendet), 'ereignis' (vom Renderer gemeldeter Wert; wird nicht zurückgesendet, K-057).
    // Gleicher Wert → nichts (keine Nachricht, keine schmutzige Bindung).
    uiSetze(z, feld, wert, modus) {
      if (modus === 'setter' && z.bindungen !== null && z.bindungen.has(feld)) {
        throw this.ananas('LaufzeitAnanas', '\'' + feld + '\' von ' + this.text(z) + ' ist gebunden – setze den Zettel, nicht die Zutat.');
      }
      const intern = UI_FELD_INTERN[z.art + '.' + feld] || feld;
      if (uiGleich(z[intern], wert)) return;
      z[intern] = wert;
      this.uiSchmutzig(z, feld);
      if (modus !== 'ereignis') this.uiAendere(z, feld, Array.isArray(wert) ? wert.map(x => Array.isArray(x) ? x.slice() : x) : wert);
    }

    // Stil setzen/entfernen (w === null entfernt); Vergleich mit dem aktuellen Stil-Objekt (K-117)
    uiSetzeStil(z, k, w, modus) {
      if (modus === 'setter' && z.bindungen !== null && z.bindungen.has('s:' + k)) {
        throw this.ananas('LaufzeitAnanas', 'Stil \'' + k + '\' von ' + this.text(z) + ' ist gebunden – setze den Zettel, nicht die Zutat.');
      }
      if (w === null) {
        if (z.stil === null || !(k in z.stil)) return;  // nicht gesetzt → nichts, kein null in der Nachricht
        delete z.stil[k];
        if (Object.keys(z.stil).length === 0) z.stil = null;
        if (z.stilNull === null) z.stilNull = new Set();
        z.stilNull.add(k);
      } else {
        if (z.stil !== null && k in z.stil && uiGleich(z.stil[k], w)) return;
        if (z.stil === null) z.stil = {};
        z.stil[k] = w;
        if (z.stilNull !== null) z.stilNull.delete(k);
      }
      this.uiAendere(z, 'stil', this.uiStilNachricht(z));
    }

    // Quelle (Objekt, Feld) für die gerade laufende Bindung erfassen; außerhalb einer Bindung nichts
    uiLies(o, feld) {
      const b = this.uiBindungLauf;
      if (b === null) return;
      if (o.abh === null) o.abh = new Map();
      let s = o.abh.get(feld);
      if (s === undefined) { s = new Set(); o.abh.set(feld, s); }
      if (s.has(b)) return;
      s.add(b);
      b.quellen.push(o, feld);
    }

    // Quelle hat sich geändert: alle lesenden Bindungen schmutzig
    uiSchmutzig(o, feld) {
      if (o.abh === null) return;
      const s = o.abh.get(feld);
      if (s === undefined || s.size === 0) return;
      for (const b of s) b.dirty = true;
      this.uiDirty = true;
    }

    uiBindungName(b) {
      if (b.z instanceof Zettel) return 'ein abgeleiteter Zettel';  // K-125
      return (b.stil ? 'Stil ' : '') + '\'' + b.feld + '\' von ' + this.text(b.z);
    }

    // K-125: Zettel.aus(fn) – neuer Zettel, dessen Wert eine Bindung ist (sofort ausgewertet, dann an den Synchronisationspunkten)
    uiZettelAus(pos, node) {
      const f = pos[0];
      if (!(f instanceof Funktion || f instanceof Gebunden || f instanceof NativFn)) {
        throw this.ananas('TypAnanas', 'Zettel.aus() braucht eine Funktion, z. B. () -> { … }.');
      }
      const z = new Zettel(null);
      const b = new UiBindung(z, 'wert', false, f, node);
      z.abl = b;
      this.uiBindungen.push(b);
      this.uiBindungAuswerten(b);
      return z;
    }

    uiBindungQuellenLoesen(b) {
      const q = b.quellen;
      for (let i = 0; i < q.length; i += 2) {
        const s = q[i].abh.get(q[i + 1]);
        if (s !== undefined) s.delete(b);
      }
      b.quellen = [];
    }

    uiBindungLoesen(z, key) {
      if (z.bindungen === null) return;
      const b = z.bindungen.get(key);
      if (b === undefined) return;
      z.bindungen.delete(key);
      if (z.bindungen.size === 0) z.bindungen = null;
      const i = this.uiBindungen.indexOf(b);
      if (i >= 0) this.uiBindungen.splice(i, 1);
      this.uiBindungQuellenLoesen(b);
    }

    // binde(eigenschaft, fn) / bindeStil(schlüssel, fn): Name prüfen, karton löst, sonst neue Registrierung und sofortige Auswertung
    uiBinde(z, pos, node, stil) {
      const name = this.text(pos[0]);
      if (stil) {
        if (UI_STIL[name] === undefined) throw this.ananas('LaufzeitAnanas', 'Stil \'' + name + '\' gibt es nicht. Erlaubt: ' + Object.keys(UI_STIL).join(', ') + '.');
      } else {
        const liste = UI_BINDBAR[z.art].concat(UI_BINDBAR_ALLE);
        if (liste.indexOf(name) < 0) throw this.ananas('LaufzeitAnanas', '\'' + name + '\' lässt sich an ' + this.text(z) + ' nicht binden. Bindbar: ' + liste.join(', ') + '.');
      }
      const key = (stil ? 's:' : '') + name;
      const f = pos[1];
      if (f === null || f === undefined) { this.uiBindungLoesen(z, key); return; }
      if (!(f instanceof Funktion || f instanceof Gebunden || f instanceof NativFn)) {
        throw this.ananas('TypAnanas', (stil ? 'bindeStil' : 'binde') + '() braucht eine Funktion, z. B. () -> { … }.');
      }
      this.uiBindungLoesen(z, key);
      const b = new UiBindung(z, name, stil, f, node);
      if (z.bindungen === null) z.bindungen = new Map();
      z.bindungen.set(key, b);
      this.uiBindungen.push(b);
      this.uiBindungAuswerten(b);
    }

    // Eine Bindung auswerten: vorher sauber markieren und Quellen lösen (werfender Ausdruck bleibt sauber), Quellen neu erfassen,
    // Ergebnis wie der gleichnamige Setter umwandeln und über uiSetze setzen (nur bei echter Änderung, K-117)
    uiBindungAuswerten(b) {
      b.dirty = false;
      this.uiBindungQuellenLoesen(b);
      const vorher = this.uiBindungLauf;
      this.uiBindungLauf = b;
      let v;
      try { v = this.rufe(b.fn, [], null, b.node); } finally { this.uiBindungLauf = vorher; }
      if (b.erst) {
        b.erst = false;
        if (b.quellen.length === 0) {
          this.warnung('W0103', b.z instanceof Zettel ? 'Der abgeleitete Zettel liest weder Zettel noch Zutat – er rechnet nur einmal.'
            : 'Die Bindung ' + this.uiBindungName(b) + ' liest weder Zettel noch Zutat – sie rechnet nur einmal.', b.node);
        }
      }
      if (b.z instanceof Zettel) {
        // K-125: Ergebnis wie Zettel.setze – nur ein ungleicher Wert (Gleichheit wie ==) macht Leser schmutzig
        if (v === undefined) v = null;
        if (!this.gleich(b.z.w, v)) { b.z.w = v; this.uiSchmutzig(b.z, 'wert'); }
        return;
      }
      if (b.stil) this.uiSetzeStil(b.z, b.feld, this.uiStilWert(b.feld, v), 'bindung');
      else this.uiSetze(b.z, b.feld, this.uiWandle(b.z, b.feld, v), 'bindung');
    }

    // Synchronisationspunkt (K-057/K-116): höchstens 100 Durchläufe in Registrierungsreihenfolge, bis keine Bindung mehr schmutzig ist
    uiBindungenAuswerten() {
      if (!this.uiDirty) return;
      const liste = this.uiBindungen;
      for (let d = 0; d < UI_BINDUNG_DURCHLAEUFE; d++) {
        let offen = false;
        for (let i = 0; i < liste.length; i++) {
          const b = liste[i];
          if (b.dirty) { offen = true; this.uiBindungAuswerten(b); }
        }
        if (!offen) { this.uiDirty = false; return; }
      }
      // Zyklus: erste schmutzige Bindung nennen; danach sind alle Bindungen sauber (sie rechnen erst wieder, wenn sich eine
      // Quelle ändert) – das Programm läuft weiter, der nächste Synchronisationspunkt wirft nicht erneut (K-119).
      let erste = null;
      for (const b of liste) {
        if (b.dirty) { if (erste === null) erste = b; b.dirty = false; }
      }
      this.uiDirty = false;
      if (erste !== null) throw this.ananas('LaufzeitAnanas', 'Die Bindungen kommen nicht zur Ruhe – ' + this.uiBindungName(erste) + ' hängt von sich selbst ab.');
    }

    uiFlush() {
      // K-116: Bindungen zuerst – die Nachricht zeigt den Zustand am Synchronisationspunkt (K-115). Wirft eine Bindung,
      // geht der Puffer (auch die Werte vorher ausgewerteter Bindungen, Animationen) wie bei einer Rückruf-Ananas
      // vor dem Verlassen hinaus, dann läuft die Ananas weiter (K-119).
      try { this.uiBindungenAuswerten(); } finally { this.uiFlushSenden(); }
    }

    uiFlushSenden() {
      if (this.uiOffen.size === 0 && this.uiAnim.length === 0) return;
      const aenderungen = Array.from(this.uiOffen.values());
      this.uiOffen.clear();
      // K-115: vorgemerkte kinder-Listen jetzt aus dem aktuellen Zustand (in Eintragsreihenfolge)
      for (const a of aenderungen) {
        if ('kinder' in a) a.kinder = this.uiZutaten.get(a.id).kinder.map(k => this.uiBaum(k));
      }
      for (const a of aenderungen) {
        if ('stil' in a) { const z = this.uiZutaten.get(a.id); if (z !== undefined) z.stilNull = null; }
      }
      const n = { v: 1, op: 'aendere', aenderungen };
      if (this.uiAnim.length > 0) { n.animationen = this.uiAnim; this.uiAnim = []; }
      this.uiSende(n);
    }

    // K-090: Dauer einer Animation – Dauer, ganze ms (K-047), 50 ms … 5 s; karton/fehlend → null (Standard des Renderers)
    uiAnimDauer(d, wo) {
      if (d === undefined || d === null) return null;
      if (!(d instanceof Dauer)) throw this.ananas('TypAnanas', wo + '(dauer: …) braucht eine Dauer, nicht ' + this.darstellung(d) + '.');
      const ms = Math.round(d.ms);
      if (!(ms >= 50 && ms <= 5000)) throw this.ananas('LaufzeitAnanas', 'Eine Animation dauert 50ms bis 5s, nicht ' + dauerText(d.ms) + '.');
      return ms;
    }

    // K-090: Animation nur bei offener Theke und gezeigter Zutat (z === null: Fenstermitte), sonst W0102 je Aufrufstelle
    uiAnimOffen(z, node) {
      const t = this.uiTheke;
      if (t === null || !t.gezeigt || t.geschlossen) {
        this.warnung('W0102', 'Animation entfällt – die Theke ist nicht offen.', node);
        return false;
      }
      if (z !== null && !this.uiAngezeigt(z)) {
        this.warnung('W0102', 'Animation entfällt – \'' + z.id + '\' liegt nicht auf der Theke.', node);
        return false;
      }
      return true;
    }

    uiAnimPuffer(e) {
      if (this.uiAnim.length < UI_ANIM_MAX) this.uiAnim.push(e);
    }

    uiZeige(t, z) {
      if (!(z instanceof UiZutat)) throw this.ananas('TypAnanas', 'zeige() braucht eine Zutat, nicht ' + this.darstellung(z) + '.');
      if (z.eltern !== null) throw this.ananas('LaufzeitAnanas', 'Die Zutat \'' + z.id + '\' liegt schon in einem Behälter und kann nicht die Wurzel sein.');
      this.uiBindungenAuswerten();  // K-116: vor dem Bau des Baums
      this.uiOffen.clear();
      this.uiAnim = [];
      t.wurzel = z;
      if (!t.gezeigt || t.geschlossen) {
        t.gezeigt = true;
        t.geschlossen = false;
        this.uiSende({ v: 1, op: 'fenster', titel: t.titel, breite: t.breite, hoehe: t.hoehe });
      }
      this.uiSende({ v: 1, op: 'baum', wurzel: this.uiBaum(z) });
    }

    uiSchliesse(t) {
      if (!t.gezeigt || t.geschlossen) { t.geschlossen = true; return; }
      this.uiFlush();
      this.uiSende({ v: 1, op: 'schliesse' });
      t.geschlossen = true;
      t.gezeigt = false;
    }

    uiNaechstesEreignis() {
      let ev = null;
      if (this.uiWarte !== null) {
        try { ev = this.uiWarte(); } catch (e) { ev = null; }
      } else if (this.uiListe !== null && this.uiPos < this.uiListe.length) {
        ev = this.uiListe[this.uiPos++];
      }
      if (ev === null || ev === undefined || typeof ev !== 'object') return { typ: 'geschlossen' };
      return ev;
    }

    uiBediene(t, node) {
      if (t.wurzel === null) throw this.ananas('LaufzeitAnanas', 'Die Theke ist leer.');
      if (t.geschlossen) return;
      if (this.uiWarte === null && this.uiListe === null) {
        this.uiFlush();
        this.warnung('W0100', 'Keine Theke verfügbar – Fenster wird nicht angezeigt.', node);
        return;
      }
      for (;;) {
        this.uiFlush();
        if (t.geschlossen) return;
        const ev = this.uiNaechstesEreignis();
        if (ev.typ === 'geschlossen') {
          this.uiOffen.clear();
          this.uiAnim = [];
          t.geschlossen = true;
          t.gezeigt = false;
          return;
        }
        try {
          this.uiVerteile(ev, node);
        } finally {
          if (!t.geschlossen) this.uiFlush();
        }
      }
    }

    uiVerteile(ev, node) {
      const z = typeof ev.id === 'string' ? this.uiZutaten.get(ev.id) : undefined;
      // Nur gezeigte Zutaten bekommen Ereignisse (K-057/K-084)
      if (z === undefined || !this.uiAngezeigt(z)) return;
      // K-087: jeder Rückruf beginnt mit frischem Schrittbudget (schritte/Uhr zählen weiter)
      this.limitBasis = this.schritte;
      this.neuGrenze();
      switch (ev.typ) {
        case 'takt':
          if (z.art === 'takt' && z.aktiv && z.beiTakt !== null) {
            const a = ev.anzahl;
            const anzahl = typeof a === 'number' && Number.isInteger(a) && a >= 1 ? a : 1;
            this.rufe(z.beiTakt, [anzahl], null, node);
          }
          break;
        case 'klick':
          if (z.art === 'knopf' && z.aktiv && z.beiKlick !== null) this.rufe(z.beiKlick, [], null, node);
          break;
        case 'aenderung':
          // Renderer-Werte gehen durch die zentrale Schreibstelle (schmutzige Bindungen, K-117-Gleichheit), werden aber
          // nicht zurückgesendet (K-057) und dürfen gebundene Eigenschaften setzen (K-116); der Rückruf läuft immer.
          if (z.art === 'eingabe') {
            this.uiSetze(z, 'wert', ev.wert === undefined || ev.wert === null ? '' : String(ev.wert), 'ereignis');
            if (z.beiAenderung !== null) this.rufe(z.beiAenderung, [z.wert], null, node);
          } else if (z.art === 'haken') {
            this.uiSetze(z, 'an', ev.wert === true || ev.wert === 'true', 'ereignis');
            if (z.beiAenderung !== null) this.rufe(z.beiAenderung, [z.an], null, node);
          } else if (z.art === 'reiter') {
            const n = ev.wert;
            if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > z.kinder.length) break;
            this.uiSetze(z, 'gewaehlt', n, 'ereignis');
            if (z.beiAenderung !== null) this.rufe(z.beiAenderung, [n], null, node);
          } else if (z.art === 'abschnitt') {
            // K-108: nur ein klappbarer Abschnitt nimmt den Zustand an; wert wie beim Haken
            if (!z.klappbar) break;
            this.uiSetze(z, 'zu', ev.wert === true || ev.wert === 'true', 'ereignis');
            if (z.beiAenderung !== null) this.rufe(z.beiAenderung, [z.zu], null, node);
          } else if (z.art === 'auswahl') {
            // K-109: nur aktiv, ganze Zahl 1 … Anzahl
            if (!z.aktiv) break;
            const n = ev.wert;
            if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > z.optionen.length) break;
            this.uiSetze(z, 'gewaehlt', n, 'ereignis');
            if (z.beiAenderung !== null) this.rufe(z.beiAenderung, [n], null, node);
          }
          break;
        case 'taste':
          // K-110: aktive Tastatur mit Rückruf, taste nicht-leerer Text; Zustellung kostet 0 Schritte
          if (z.art === 'tastatur' && z.aktiv && z.beiTaste !== null && typeof ev.taste === 'string' && ev.taste !== '') {
            this.rufe(z.beiTaste, [ev.taste], null, node);
          }
          break;
        case 'enter':
          if (z.art === 'eingabe') {
            if (ev.wert !== undefined && ev.wert !== null) this.uiSetze(z, 'wert', String(ev.wert), 'ereignis');
            if (z.beiEnter !== null) this.rufe(z.beiEnter, [z.wert], null, node);
          }
          break;
      }
    }
  }
  laufzeitTeil(LaufzeitTheke);

  // ══════════ site/js/pizza/std/register.js ══════════
  // pizza-Interpreter · Tabellen-Register, Bindungs- und Hauptküchen-Sperren
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  const TABELLEN = new Map([
    [Dauer, DAUER_M], [EnumWert, ENUM_M], [Teig, TEIG_M], [Lieferung, LIEF_M],
    [Zustellung, ZUST_M], [Reste, RESTE_M], [OfenRoh, ROH_M],
    [Funktion, FN_M], [Gebunden, FN_M], [NativFn, FN_M], [UiTheke, THEKE_M], [Zettel, ZETTEL_M], [ZufallGen, ZUFALL_OBJ_M], [Kammer, KAMMER_M]
  ]);

  // K-118: Eine Bindung rechnet nur – in ihrem Ausdruck werfen alle Methoden außer den Gettern (Methodenname wie gerufen);
  // Getter/Setter-Überladungen (aktiv, sichtbar, …) nur mit Argument. Rückruf-Registrierungen (bei…) stehen nicht auf der
  // Verbotsliste von K-118 und bleiben erlaubt.
  const UI_REIN = new Set(['id', 'alsText', 'text', 'wert', 'an', 'intervall', 'titel', 'gewaehlt', 'optionen', 'spalten', 'zeilen',
    'beiKlick', 'beiAenderung', 'beiEnter', 'beiTakt', 'beiTaste']);
  const UI_UEBERLADEN = new Set(['aktiv', 'sichtbar', 'hinweis', 'marke', 'uebergang', 'klappbar', 'zu']);
  function nurRechnen(tab) {
    for (const k of Object.keys(tab)) {
      if (UI_REIN.has(k)) continue;
      const f = tab[k], ueber = UI_UEBERLADEN.has(k);
      tab[k] = function (o, pos) {
        if (this.uiBindungLauf !== null && !(ueber && pos.length === 0)) {
          throw this.ananas('LaufzeitAnanas', 'Eine Bindung rechnet nur – \'' + k + '\' ist darin nicht erlaubt.');
        }
        return f.apply(this, arguments);
      };
    }
  }
  for (const t of new Set([THEKE_M, ZETTEL_M, ZETTEL_MOD_M].concat(Object.values(UI_TABELLEN)))) nurRechnen(t);

  // Regel S4 (THREADS.md §2.3): Eingabe und Theke gibt es nur in der Hauptküche – jede Methode wirft in einer Küche.
  function nurHauptkueche(tab, text) {
    for (const k of Object.keys(tab)) {
      const f = tab[k];
      tab[k] = function () {
        if (this.kueche !== null) throw this.ananas('KüchenAnanas', text);
        return f.apply(this, arguments);
      };
    }
  }
  nurHauptkueche(EINGABE_M, 'Bestellannahme gibt es nur in der Hauptküche.');
  for (const t of new Set([THEKE_M].concat(Object.values(UI_TABELLEN)))) nurHauptkueche(t, 'Die Theke gibt es nur in der Hauptküche.');
  nurHauptkueche(ZETTEL_M, 'Zettel gibt es nur in der Hauptküche.');
  nurHauptkueche(ZETTEL_MOD_M, 'Zettel gibt es nur in der Hauptküche.');

  // ══════════ site/js/pizza/kueche.js ══════════
  // pizza-Interpreter · Küchenbrigade (THREADS.md)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // Laufzeit: Küchenbrigade
  class LaufzeitKueche {
    // ---------- Küchenbrigade (THREADS.md §2–§4.2) – sequentielle Referenz ----------
    // Eine Küche ist der Kontext eines Stücks: { auftrag, eltern, puffer, warn, methoden, kuehl }.
    // auftrag.gefroren enthält alles, was beim Anschnitt der (jeweiligen) Hauptküche gehörte; verschachtelte
    // Brigaden prüfen die ganze Kette.
    istGefroren(x) {
      for (let k = this.kueche; k !== null; k = k.eltern) if (k.auftrag.gefroren.has(x)) return true;
      return false;
    }
    kuecheVar(v, name) {
      if (this.istGefroren(v)) throw this.ananas('KüchenAnanas', '\'' + name + '\' gehört der Hauptküche – ein Koch darf es nur lesen.');
    }
    kuecheBlech(b) {
      if (this.istGefroren(b)) throw this.ananas('KüchenAnanas', 'Dieses Blech gehört der Hauptküche – nimm eine kopie().');
    }
    kuecheKarte(m) {
      if (this.istGefroren(m)) throw this.ananas('KüchenAnanas', 'Diese Speisekarte gehört der Hauptküche – ein Koch darf sie nur lesen.');
    }
    kuecheTeig(t) {
      if (this.istGefroren(t)) throw this.ananas('KüchenAnanas', 'Dieser Teig gehört der Hauptküche – ein Koch darf ihn nur ansehen.');
    }
    kuecheLieferung(l) {
      if (this.istGefroren(l)) throw this.ananas('KüchenAnanas', 'Diese Lieferung gehört der Hauptküche – ein Koch darf sie nur ansehen.');
    }
    kuecheKammer(k) {
      // Kammern entstehen nur in der Hauptküche (S4) – jede Kammer gehört ihr.
      throw this.ananas('KüchenAnanas', 'Die Vorratskammer \'' + k.kennung + '\' gehört der Hauptküche – ein Koch darf nur nachsehen.');
    }

    // Warnungsgedächtnis (D5): Hauptküche = warnSet/Methode.gewarnt, Küchen zusätzlich eigene Mengen (Kette)
    methodeGewarnt(m) {
      if (m.gewarnt) return true;
      for (let k = this.kueche; k !== null; k = k.eltern) if (k.methoden.has(m)) return true;
      return false;
    }
    warnBekannt(key) {
      if (this.warnSet.has(key)) return true;
      for (let k = this.kueche; k !== null; k = k.eltern) if (k.warn.has(key)) return true;
      return false;
    }
    // Ereignis ausgeben bzw. in den Puffer der aktuellen Küche legen; Warnungen nur einmal pro Schlüssel (D4/D5)
    gibWeiter(e) {
      if (e.key !== null) {
        if (e.m !== null) {
          if (this.methodeGewarnt(e.m)) return;
          if (this.kueche !== null) this.kueche.methoden.add(e.m); else e.m.gewarnt = true;
        }
        if (this.warnBekannt(e.key)) return;
        if (this.kueche !== null) this.kueche.warn.add(e.key); else this.warnSet.add(e.key);
      }
      if (this.kueche !== null) this.kueche.puffer.push(e);
      else this.emit(e.ev);
    }

    // Schnappschuss: alles beim Anschnitt Erreichbare und Veränderliche in `set` eintragen (0 Schritte)
    friere(set, wurzeln) {
      const stapel = [];
      const merke = (x) => {
        if (x === null || typeof x !== 'object' || set.has(x)) return;
        set.add(x);
        stapel.push(x);
      };
      for (const w of wurzeln) merke(w);
      const cache = (c) => {
        if (c === null || c === undefined) return;
        for (const tab of c.values()) for (const e of tab.values()) merke(e.w);
      };
      while (stapel.length) {
        const x = stapel.pop();
        if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) merke(x[i]); }
        else if (x instanceof Map) { for (const [k, w] of x) { merke(k); merke(w); } }
        else if (x instanceof Var) merke(x.w);
        else if (x instanceof Scope) {
          for (const v of x.vars.values()) merke(v);
          merke(x.parent);
          if (x.ctx !== null) merke(x.ctx.dies);
        } else if (x instanceof Obj) { for (const v of x.felder.values()) merke(v); cache(x.cache); }
        else if (x instanceof Klasse) { for (const v of x.statisch.values()) merke(v); cache(x.cache); }
        else if (x instanceof Funktion) merke(x.scope);
        else if (x instanceof Gebunden) merke(x.obj);
        else if (x instanceof NativFn) merke(x.ziel);
        else if (x instanceof Teig) { merke(x.fn); merke(x.wert); }
        else if (x instanceof Lieferung) { merke(x.fn); merke(x.rueckruf); merke(x.zustellung); }
        else if (x instanceof Zustellung) { merke(x.wert); if (x.fehler !== null) merke(x.fehler.obj); }
        else if (x instanceof Reste) merke(x.wert);
        else if (x instanceof OfenRoh) merke(x.teil);
        else if (x === this.globalCache) cache(x.cache);
      }
    }

    // Kartonfähigkeit (§2.4): <Art> nicht kartonfähiger Werte, sonst null
    kartonArt(v) {
      if (v instanceof Funktion || v instanceof Gebunden || v instanceof NativFn) return 'Eine Funktion';
      if (v instanceof Teig) return 'Ein Teig';
      if (v instanceof Lieferung) return 'Eine Lieferung';
      if (v instanceof Zustellung) return 'Eine Zustellung';
      if (v instanceof Reste) return 'Reste';
      if (v instanceof ZufallGen) return 'Ein Zufall';
      if (v instanceof Kammer) return 'Eine Vorratskammer';
      if (v instanceof UiTheke || v instanceof UiZutat) return 'Eine Theke-Zutat';
      if (v instanceof Zettel) return 'Ein Zettel';
      if (v instanceof HerdWelt) return 'Ein Herd';
      if (v instanceof HerdTeil) return 'Ein Teil';
      if (v instanceof HerdKomp) return 'Eine Komponente';
      if (v instanceof HerdForm) return 'Eine Form';
      if (v instanceof HerdBildchen) return 'Ein Bildchen';
      return null;
    }
    // Tiefe Kopie in den Karton (Teilung/Zyklen über memo); wirft KartonFehler. Ruft nie alsText(), 0 Schritte.
    kartoniere(v, memo) {
      if (v === null || v === undefined) return null;
      if (typeof v !== 'object') return v;
      if (v instanceof Dauer || v instanceof EnumWert || v instanceof Klasse || v instanceof EnumTyp ||
          v instanceof Rezeptur || v instanceof Modul || v === AUTO) return v;
      const da = memo.get(v);
      if (da !== undefined) return da;
      if (Array.isArray(v)) {
        const r = new Array(v.length);
        memo.set(v, r);
        for (let i = 0; i < v.length; i++) r[i] = this.kartoniere(v[i], memo);
        return r;
      }
      if (v instanceof Map) {
        const r = new Map();
        memo.set(v, r);
        for (const [k, w] of v) r.set(this.kartoniere(k, memo), this.kartoniere(w, memo));
        return r;
      }
      if (v instanceof Obj) {
        const r = new Obj(v.klasse, v.nr);
        memo.set(v, r);
        r.zugeklappt = v.zugeklappt;
        r.nachricht = v.nachricht;
        for (const [name, x] of v.felder) {
          const y = new Var(null, x.t, x.g);
          y.weg = x.weg; y.mod = x.mod; y.klasse = x.klasse; y.unbelegt = x.unbelegt;
          y.besitzer = x.besitzer === v ? r : x.besitzer;
          r.felder.set(name, y);
          y.w = this.kartoniere(x.w, memo);
        }
        return r;
      }
      if (v instanceof OfenRoh) {
        const r = new OfenRoh(null, v.zeit);
        memo.set(v, r);
        r.teil = this.kartoniere(v.teil, memo);
        return r;
      }
      const art = this.kartonArt(v);
      throw new KartonFehler(art !== null ? art : this.typName(v));
    }

    // blech.brigade(fn): Anschnitt → Stücke (je eigene Küche) → Zusammenführen in Stückreihenfolge (D1–D15)
    brigade(b, f, node) {
      const n = b.length;
      if (n === 0) return [];
      // keine Funktion → derselbe Fehler wie bei belege (vor dem Anschnitt, ohne Zufallsziehung)
      if (!(f instanceof Funktion || f instanceof Gebunden || f instanceof NativFn)) return this.rufe(f, [b[0]], null, node);
      // ---- Anschnitt
      const S0 = this.schritte, off0 = this.offset, T0 = S0 + off0;
      const N0 = this.instanzen, L0 = this.lieferNr, st0 = this.st;
      const zaehler = [];
      for (const k of this.klassen.values()) if (k instanceof Klasse) zaehler.push([k, k.zaehler]);
      const tot0 = this.frames.map(fr => fr.tot);
      const saaten = new Array(n);
      for (let i = 0; i < n; i++) saaten[i] = Math.floor(this.zufallGlobal.r() * 4294967296);
      const gefroren = new WeakSet();
      const wurzeln = [this.global, this.globalCache, f, b];
      for (const k of this.klassen.values()) wurzeln.push(k);
      for (const k of this.kammern.values()) wurzeln.push(k);
      for (const l of this.lieferungen) wurzeln.push(l);
      // verschachtelt: der Küchen-Kühlschrank der umgebenden Küche gehört der „Hauptküche“ dieser Brigade
      for (let k = this.kueche; k !== null; k = k.eltern) {
        for (const h of k.kuehl.values()) for (const tab of h.values()) for (const e of tab.values()) wurzeln.push(e.w);
      }
      this.friere(gefroren, wurzeln);
      const auftrag = { b, f, node, gefroren, frameBasis: this.frames.length, S0, off0, T0, N0, L0, st0, zaehler, tot0, saaten };
      // ---- Stücke (sequentiell; mit kuechenChaos in pseudozufälliger Reihenfolge, alle Stücke)
      const berichte = new Array(n);
      if (this.chaos !== null) {
        const reihe = [];
        for (let i = 0; i < n; i++) reihe.push(i);
        for (let i = n - 1; i >= 1; i--) {
          const j = Math.floor(this.chaos.r() * (i + 1));
          const t = reihe[i]; reihe[i] = reihe[j]; reihe[j] = t;
        }
        for (const i of reihe) berichte[i] = this.stueck(auftrag, i);
      } else {
        for (let i = 0; i < n; i++) {
          berichte[i] = this.stueck(auftrag, i);
          if (berichte[i].status !== 'ok') break;
        }
      }
      // ---- Zusammenführen (D2–D15)
      const r = new Array(n);
      let summe = 0, maxD = 0, abbruch = null;
      const maxZ = zaehler.map(() => 0);
      let maxC = 0, maxL = 0;
      for (let i = 0; i < n; i++) {
        const be = berichte[i];
        for (const e of be.puffer) this.gibWeiter(e);
        summe += be.s;
        if (be.d > maxD) maxD = be.d;
        if (be.c > maxC) maxC = be.c;
        if (be.l > maxL) maxL = be.l;
        for (let j = 0; j < maxZ.length; j++) if (be.z[j] > maxZ[j]) maxZ[j] = be.z[j];
        if (be.status !== 'ok') { abbruch = be; break; }
        r[i] = be.wert;
      }
      this.schritte = S0 + summe;
      this.offset = T0 + maxD - this.schritte;
      this.instanzen = N0 + maxC;
      this.lieferNr = L0 + maxL;
      for (let j = 0; j < zaehler.length; j++) zaehler[j][0].zaehler = zaehler[j][1] + maxZ[j];
      this.neuGrenze();
      if (abbruch !== null) {
        const sig = abbruch.sig;
        if (sig instanceof BudgetSig) {
          const fr = this.frames;
          const i = fr.indexOf(sig.frame);
          for (let j = i < 0 ? fr.length : i; j < fr.length; j++) fr[j].tot = true;
          this.neuGrenze();
        } else if (sig === 'wurfKarton') {
          this.z = node.z; this.s = node.s; this.d = node.di;
          throw this.ananas('KüchenAnanas', 'Was der Koch geworfen hat, passt in keinen Karton.');
        }
        throw sig;
      }
      // D7: Summe aller Stücke über dem Limit → P0002 am brigade-Aufruf
      if (this.schritte > this.limitBasis + this.limit) {
        this.z = node.z; this.s = node.s; this.d = node.di;
        throw new LimitSig();
      }
      return r;
    }

    // Ein Stück i (0-basiert) in eigener Küche ausführen → Bericht; der Zustand der Hauptküche bleibt unverändert
    stueck(a, i) {
      const k = { auftrag: a, eltern: this.kueche, puffer: [], warn: new Set(), methoden: new Set(), kuehl: new Map() };
      const emit0 = this.emit, zufall0 = this.zufallGlobal, z0 = this.z, s0 = this.s, d0 = this.d, rueck0 = this.rueck;
      const lief0 = this.lieferungen.length, fr = this.frames;
      this.kueche = k;
      this.emit = (ev) => { k.puffer.push({ ev, key: null, m: null }); };
      this.schritte = a.S0; this.offset = a.off0;
      this.instanzen = a.N0; this.lieferNr = a.L0;
      for (const [kl, z] of a.zaehler) kl.zaehler = z;
      for (let j = 0; j < a.tot0.length; j++) fr[j].tot = a.tot0[j];
      this.zufallGlobal = new ZufallGen(a.saaten[i]);
      this.neuGrenze();
      const bericht = { status: 'ok', wert: null, sig: null, s: 0, d: 0, c: 0, l: 0, z: null, puffer: k.puffer };
      try {
        let v;
        try {
          v = this.rufe(a.f, [a.b[i]], null, a.node);
        } catch (e0) {
          this.st = a.st0;
          const e = this.normalisiere(e0);
          bericht.status = 'abbruch';
          if (e instanceof AnanasWurf) {
            try { bericht.sig = new AnanasWurf(this.kartoniere(e.obj, new Map()), e.zeile, e.spalte, e.d); }
            catch (x) { if (x instanceof KartonFehler) bericht.sig = 'wurfKarton'; else throw x; }
          } else bericht.sig = e;
        }
        if (bericht.status === 'ok') {
          try { bericht.wert = this.kartoniere(v, new Map()); }
          catch (x) {
            if (!(x instanceof KartonFehler)) throw x;
            // die Ananas entsteht in der Küche, an der Position des brigade-Aufrufs, ohne Schritte
            this.z = a.node.z; this.s = a.node.s; this.d = a.node.di;
            const w = this.ananas('KüchenAnanas', x.art + ' passt in keinen Karton – nur Werte können die Küche verlassen.');
            bericht.status = 'abbruch';
            bericht.sig = new AnanasWurf(this.kartoniere(w.obj, new Map()), w.zeile, w.spalte, w.d);
          }
        }
      } catch (x) {
        // unerwarteter Fehler (Kopie zu tief o. Ä.) → Abbruch dieses Stücks wie im Programm
        const e = this.normalisiere(x);
        bericht.status = 'abbruch';
        bericht.sig = e;
      } finally {
        bericht.s = this.schritte - a.S0;
        bericht.d = this.schritte + this.offset - a.T0;
        bericht.c = this.instanzen - a.N0;
        bericht.l = this.lieferNr - a.L0;
        bericht.z = a.zaehler.map(([kl, z]) => kl.zaehler - z);
        // Hauptküche wiederherstellen (Lieferungen der Küche verfallen, S5)
        this.lieferungen.length = lief0;
        fr.length = a.tot0.length;
        for (let j = 0; j < a.tot0.length; j++) fr[j].tot = a.tot0[j];
        this.kueche = k.eltern;
        this.emit = emit0;
        this.zufallGlobal = zufall0;
        this.st = a.st0;
        this.z = z0; this.s = s0; this.d = d0;
        this.rueck = rueck0;
        this.schritte = a.S0; this.offset = a.off0;
        this.instanzen = a.N0; this.lieferNr = a.L0;
        for (const [kl, z] of a.zaehler) kl.zaehler = z;
        this.neuGrenze();
      }
      return bericht;
    }
  }
  laufzeitTeil(LaufzeitKueche);

  // ══════════ site/js/pizza/herd/kern.js ══════════
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
    }
  }
  class HerdTeil { constructor(id, tab) { this.id = id; this.tab = tab; } }
  class HerdKomp { constructor(h, art, teil) { this.h = h; this.art = art; this.tab = art.tab; this.teil = teil; } }
  class HerdForm { constructor(id) { this.id = id; } }
  class HerdBildchen { constructor(id, b, h) { this.id = id; this.breite = b; this.hoehe = h; } }
  class HerdKernFehlt { }

  // ---------- Vorbacker (SPEC §18.5, PROJEKTE §5.3/§5.4, K-145/K-147) ----------
  // teigling.wasm backt PNG/JPEG der Kiste vor dem Start zu Teiglingen (derselbe Rust-Code wie site/js/herd/teigling.js
  // und nativ – bitgleich). optionen.vorbacker: WebAssembly.Module | ArrayBuffer | Uint8Array | ein Vorbacker-Objekt mit
  // vorbacken(bytes)/sha256(bytes) (z. B. PizzaVorbacker.node()); Node ohne Option: site/js/herd/teigling.wasm.
  const VORBACKER_FEHLT = 'PizzaFehler HOST: Der Vorbacker fehlt (teigling.wasm).';
  class VorbackerFehlt { }
  const TEIGLING_KOPF = 52, TEIGLING_FEHLER_LAENGE = 64, TEIGLING_MAX_KANTE = 2048, TEIGMENGE_MAX = 33554432;
  const TEIGLING_MAGIE = [84, 69, 73, 71, 76, 73, 78, 71];   // "TEIGLING"
  const TEIGLING_LEER = new Uint8Array(0);                     // keine Bild-Endung: der Kern meldet „kein lesbares Bild“ (61)
  function istBildPfad(pfad) { return /\.(png|jpg|jpeg)$/.test(pfad); }
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
    if (v instanceof HerdKomp) return v.art.name;
    return null;
  }

  // ══════════ site/js/pizza/herd/tabellen.js ══════════
  // pizza-Interpreter · Herd: Methodentabellen
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // ---------- Methodentabellen ----------
  function herdTab(o) { const t = tabelle(o); nurHauptkueche(t, HERD_KUECHE); return t; }

  // Komponenten generisch: Getter <feld>(), Setter setze<Feld>(w) (verkettbar), hole/setze, teil(), alsText()
  function herdKompTabelle(art) {
    const t = {};
    for (const f of art.felder) {
      t[f.name] = function (k) { return this.herdHole(k.h, art, f); };
      t['setze' + f.name.charAt(0).toUpperCase() + f.name.slice(1)] = function (k, pos) {
        this.herdSetze(k.h, art, f, pos.length ? pos[0] : null);
        return k;
      };
    }
    t.hole = function (k, pos, ben) { return this.herdHole(k.h, art, this.herdFeld(art, arg(pos, ben, 0, 'feld'))); };
    t.setze = function (k, pos, ben) {
      const f = this.herdFeld(art, arg(pos, ben, 0, 'feld'));
      const w = arg(pos, ben, 1, 'wert');
      this.herdSetze(k.h, art, f, w === undefined ? null : w);
      return k;
    };
    t.teil = function (k) {
      const e = this.hk.e;
      // zerstört (komp_info 3) → Kern-Text „Teil 7 ist schon entfernt.“ über das zuletzt bekannte Teil (komp_info 2 liefert dann 0)
      if (e.komp_info(k.h, 3) === 1) this.herdF(e.teil_hole(k.teil, 1));
      const id = this.herdI(e.komp_info(k.h, 2));
      k.teil = id;
      return id === 0 ? null : this.herdTeilObj(id);
    };
    t.alsText = function (k) { return this.text(k); };
    return herdTab(t);
  }

  const HERD_TEIL_M = {
    'x': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 1)); },
    'y': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 2)); },
    'z': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 3)); },
    'setzeLage': function (t, pos, ben) {
      const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'setzeLage', 'x');
      const y = this.herdZahl(arg(pos, ben, 1, 'y'), 'setzeLage', 'y');
      const z = this.herdZahl(arg(pos, ben, 2, 'z'), 'setzeLage', 'z', 0);
      this.herdI(this.hk.e.teil_lage(t.id, x, y, z));
      return t;
    },
    'verschiebe': function (t, pos, ben) {
      const x = this.herdZahl(arg(pos, ben, 0, 'dx'), 'verschiebe', 'dx');
      const y = this.herdZahl(arg(pos, ben, 1, 'dy'), 'verschiebe', 'dy');
      const z = this.herdZahl(arg(pos, ben, 2, 'dz'), 'verschiebe', 'dz', 0);
      this.herdI(this.hk.e.teil_verschiebe(t.id, x, y, z));
      return t;
    },
    'drehung': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 4)); },
    'setzeDrehung': function (t, pos, ben) { this.herdI(this.hk.e.teil_setze(t.id, 4, this.herdZahl(arg(pos, ben, 0, 'g'), 'setzeDrehung', 'g'))); return t; },
    'neigung': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 5)); },
    'setzeNeigung': function (t, pos, ben) { this.herdI(this.hk.e.teil_setze(t.id, 5, this.herdZahl(arg(pos, ben, 0, 'g'), 'setzeNeigung', 'g'))); return t; },
    'rollen': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 6)); },
    'setzeRollen': function (t, pos, ben) { this.herdI(this.hk.e.teil_setze(t.id, 6, this.herdZahl(arg(pos, ben, 0, 'g'), 'setzeRollen', 'g'))); return t; },
    'schaueAuf': function (t, pos, ben) {
      const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'schaueAuf', 'x');
      const y = this.herdZahl(arg(pos, ben, 1, 'y'), 'schaueAuf', 'y');
      const z = this.herdZahl(arg(pos, ben, 2, 'z'), 'schaueAuf', 'z');
      this.herdI(this.hk.e.teil_schaue(t.id, x, y, z));
      return t;
    },
    'groesse': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 7)); },
    'groesseX': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 7)); },
    'groesseY': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 8)); },
    'groesseZ': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 9)); },
    'setzeGroesse': function (t, pos, ben) {
      const sx = this.herdZahl(arg(pos, ben, 0, 'sx'), 'setzeGroesse', 'sx');
      const sy = this.herdZahl(arg(pos, ben, 1, 'sy'), 'setzeGroesse', 'sy', sx);
      const sz = this.herdZahl(arg(pos, ben, 2, 'sz'), 'setzeGroesse', 'sz', sx);
      this.herdI(this.hk.e.teil_groesse(t.id, sx, sy, sz));
      return t;
    },
    'ebene': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 10)); },
    'setzeEbene': function (t, pos, ben) { this.herdI(this.hk.e.teil_setze(t.id, 10, this.herdZahl(arg(pos, ben, 0, 'n'), 'setzeEbene', 'n'))); return t; },
    // Getter/Setter-Überladung wie bei der Theke: ohne Argument lesen, mit diavolo setzen (K-066)
    'sichtbar': function (t, pos, ben) {
      const d = arg(pos, ben, 0, 'd');
      if (d === undefined) return this.herdF(this.hk.e.teil_hole(t.id, 11)) !== 0;
      this.herdI(this.hk.e.teil_setze(t.id, 11, this.bool(d) ? 1 : 0));
      return t;
    },
    'haenge': function (t, pos, ben) {
      const an = arg(pos, ben, 0, 'an');
      this.herdI(this.hk.e.teil_haenge(t.id, this.herdTeilId(an, 'haenge', 'an')));
      return t;
    },
    'eltern': function (t) {
      const id = this.herdF(this.hk.e.teil_hole(t.id, 13));
      return id === 0 ? null : this.herdTeilObj(id);
    },
    'kinder': function (t) {
      const e = this.hk.e;
      const ids = this.hk.liesListe((p, kap) => e.teil_kinder(t.id, p, kap));
      if (ids === null) throw this.herdFehler();
      return ids.map(id => this.herdTeilObj(id));
    },
    'entferne': function (t, pos, ben, node) { this.kniffEntferne(t, node); return null; },   // H-K13: danach beimEntfernen
    'entfernt': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 14)) !== 0; },
    'kopie': function (t) { return this.herdTeilObj(this.herdI(this.hk.e.teil_kopie(t.id))); },
    'trifft': function (t, pos, ben) {
      const b = arg(pos, ben, 0, 'anderes');
      if (!(b instanceof HerdTeil)) throw this.ananas('TypAnanas', 'trifft() braucht ein Teil für \'anderes\', nicht ' + this.darstellung(b === undefined ? null : b) + '.');
      return this.herdI(this.hk.e.teil_trifft(t.id, b.id)) === 1;
    },
    'mit': function (t, pos, ben) {
      const k = arg(pos, ben, 0, 'komponente');
      if (this.istKniff(k)) return this.kniffMit(t, k);   // H-K13: eigener Kniff statt Kern-Komponente
      if (!(k instanceof HerdKomp)) throw this.ananas('TypAnanas', 'mit() braucht eine Komponente für \'komponente\', nicht ' + this.darstellung(k === undefined ? null : k) + '.');
      this.herdI(this.hk.e.komp_haenge(k.h, t.id));
      k.teil = t.id;
      return k;
    },
    'ohne': function (t, pos, ben, node) {
      const n = arg(pos, ben, 0, 'name');
      if (this.istKniff(n)) return this.kniffOhne(t, n, node);   // H-K13
      let art;
      if (n instanceof HerdKomp) art = n.art;
      else {
        const name = this.text(n === undefined ? null : n);
        art = this.hk.schema.nachName.get(name);
        if (art === undefined) {   // unbekannt → Kern-Text „Eine Komponente 'X' gibt es nicht.“ (typ_nummer, Code 19)
          const k = this.hk;
          this.herdI(k.e.typ_nummer(k.text(name), k.len));
          throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: Komponente ' + name + ' fehlt im Schema.');
        }
      }
      const e = this.hk.e;
      const h = this.herdI(e.komp_von(t.id, art.nummer));
      if (h === 0) return null;
      const k = this.herdKompObj(h, art);
      this.herdI(e.komp_loese(h));
      k.teil = 0;
      return k;
    },
    'raum': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 12)) === 3 ? '3D' : '2D'; },
    'id': function (t) { this.herdF(this.hk.e.teil_hole(t.id, 12)); return t.id; },   // entfernt → Kern-Text
    'kniffe': function (t) { return this.kniffListe(t); },   // H-K13: Blech<Kniff> in Anhängereihenfolge
    'alsText': function (t) { return this.text(t); }
  };
  function herdTeilTabelle(zugriff) {
    const t = Object.assign({}, HERD_TEIL_M);
    // teil.<komponente>() → die Komponente dieser Art oder karton
    for (const name of Object.keys(zugriff)) {
      const art = zugriff[name];
      t[name] = function (teil) { return this.herdKompVon(teil, art); };
    }
    return herdTab(t);
  }

  const HERD_M = herdTab({
    'backe': function (h, pos, ben, node) { const f = arg(pos, ben, 0, 'fn'); this.herdBacke(h, f === undefined ? null : f, node); return null; },
    'schliesse': function (h) {
      if (h.imRueckruf) h.schliessen = true;     // §18.2: Rückruf läuft zu Ende, dann schliesse
      else this.herdSchliesseFenster(h);
      return null;
    },
    'titel': function (h) { return h.titel; },
    'setzeTitel': function (h, pos, ben) {
      const t = arg(pos, ben, 0, 't');
      const titel = this.text(t === undefined ? null : t);
      const k = this.hk;
      this.herdI(k.e.welt_titel(k.text(titel), k.len));
      h.titel = titel;
      if (h.offen) this.herdSende('fenster', { titel: h.titel, breite: h.breite, hoehe: h.hoehe });
      return h;
    },
    'breite': function (h) { return h.breite; },
    'hoehe': function (h) { return h.hoehe; },
    'bildnummer': function (h) { return h.bildnummer; },
    'zeit': function (h) { return h.bildnummer / 60; },
    // Eingabe (SPEC §18.3)
    'taste': function (h, pos, ben) { return h.tasten.has(this.herdTaste(arg(pos, ben, 0, 'n'))); },
    'gedrueckt': function (h, pos, ben) {
      const n = this.herdTaste(arg(pos, ben, 0, 'n'));
      return h.erster && h.tasten.has(n) && !h.vorTasten.has(n);
    },
    'losgelassen': function (h, pos, ben) {
      const n = this.herdTaste(arg(pos, ben, 0, 'n'));
      return h.erster && !h.tasten.has(n) && h.vorTasten.has(n);
    },
    'mausX': function (h) { return h.mausX; },
    'mausY': function (h) { return h.mausY; },
    'maus': function (h, pos, ben) { return (h.knoepfe & this.herdMausBit(arg(pos, ben, 0, 'k'), 'maus')) !== 0; },
    'klick': function (h, pos, ben) {
      const b = this.herdMausBit(arg(pos, ben, 0, 'k'), 'klick');
      return h.erster && (h.knoepfe & b) !== 0 && (h.vorKnoepfe & b) === 0;
    },
    // Welt (SPEC §18.5)
    'hintergrund': function (h, pos, ben) {
      const k = this.hk, f = this.herdFarbText(arg(pos, ben, 0, 'f'));
      this.herdI(k.e.welt_hintergrund(k.text(f), k.len));
      return h;
    },
    'himmel': function (h, pos, ben) {
      const k = this.hk;
      const o = this.herdFarbText(arg(pos, ben, 0, 'oben'));
      const uw = arg(pos, ben, 1, 'unten');
      const u = uw === undefined || uw === null ? '' : this.herdFarbText(uw);
      // beide Texte in einen Austauschpuffer (gültig bis zum nächsten puffer)
      const max = (o.length + u.length) * 3 || 1;
      const p = k.e.puffer(max), m = k.mem();
      const lo = HERD_ENC.encodeInto(o, m.subarray(p, p + o.length * 3)).written;
      const lu = HERD_ENC.encodeInto(u, m.subarray(p + lo, p + max)).written;
      this.herdI(k.e.welt_himmel(p, lo, p + lo, lu));
      return h;
    },
    'umgebung': function (h, pos, ben) {
      const f = this.herdFarbText(arg(pos, ben, 0, 'f'));
      const s = this.herdZahl(arg(pos, ben, 1, 'staerke'), 'umgebung', 'staerke', 0.35);
      const k = this.hk;
      this.herdI(k.e.welt_umgebung(k.text(f), k.len, s));
      return h;
    },
    'nebel': function (h, pos, ben) {
      const f = this.herdFarbText(arg(pos, ben, 0, 'f'));
      const von = this.herdZahl(arg(pos, ben, 1, 'von'), 'nebel', 'von');
      const bis = this.herdZahl(arg(pos, ben, 2, 'bis'), 'nebel', 'bis');
      const k = this.hk;
      this.herdI(k.e.welt_nebel(k.text(f), k.len, von, bis));
      return h;
    },
    'kamera': function () { return this.herdTeilObj(1); },
    'sonne': function () { return this.herdTeilObj(2); },
    // Fabriken (Teil anlegen + Komponente anhängen; Reihenfolge der Kern-Aufrufe ist Vertrag für alle Motoren, s. herdFabrik)
    'rechteck': function (h, pos, ben) {
      const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'rechteck', 'x'), y = this.herdZahl(arg(pos, ben, 1, 'y'), 'rechteck', 'y');
      const b = this.herdZahl(arg(pos, ben, 2, 'b'), 'rechteck', 'b'), ho = this.herdZahl(arg(pos, ben, 3, 'h'), 'rechteck', 'h');
      const ru = this.herdZahl(arg(pos, ben, 5, 'rundung'), 'rechteck', 'rundung', null);
      const um = this.herdZahl(arg(pos, ben, 6, 'umriss'), 'rechteck', 'umriss', null);
      return this.herdFabrik(2, x, y, 0, 'Rechteck', ['breite', b, 'hoehe', ho, 'farbe', arg(pos, ben, 4, 'farbe'), 'rundung', ru, 'umriss', um]);
    },
    'kreis': function (h, pos, ben) {
      const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'kreis', 'x'), y = this.herdZahl(arg(pos, ben, 1, 'y'), 'kreis', 'y');
      const r = this.herdZahl(arg(pos, ben, 2, 'r'), 'kreis', 'r');
      const um = this.herdZahl(arg(pos, ben, 4, 'umriss'), 'kreis', 'umriss', null);
      return this.herdFabrik(2, x, y, 0, 'Kreis', ['radius', r, 'farbe', arg(pos, ben, 3, 'farbe'), 'umriss', um]);
    },
    'text': function (h, pos, ben) {
      const tw = arg(pos, ben, 0, 't');
      const x = this.herdZahl(arg(pos, ben, 1, 'x'), 'text', 'x'), y = this.herdZahl(arg(pos, ben, 2, 'y'), 'text', 'y');
      const g = this.herdZahl(arg(pos, ben, 3, 'groesse'), 'text', 'groesse', null);
      return this.herdFabrik(2, x, y, 0, 'Text', ['inhalt', tw === undefined ? null : this.text(tw), 'groesse', g,
        'farbe', arg(pos, ben, 4, 'farbe'), 'ausrichtung', arg(pos, ben, 5, 'ausrichtung')]);
    },
    'bild': function (h, pos, ben) {
      const b = arg(pos, ben, 0, 'b');
      const x = this.herdZahl(arg(pos, ben, 1, 'x'), 'bild', 'x'), y = this.herdZahl(arg(pos, ben, 2, 'y'), 'bild', 'y');
      const g = this.herdZahl(arg(pos, ben, 3, 'groesse'), 'bild', 'groesse', null);
      return this.herdFabrik(2, x, y, 0, 'Bild', ['bildchen', b, 'groesse', g]);
    },
    'gruppe': function (h, pos, ben) {
      const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'gruppe', 'x', 0), y = this.herdZahl(arg(pos, ben, 1, 'y'), 'gruppe', 'y', 0);
      return this.herdFabrik(2, x, y, 0, null, null);
    },
    'koerper': function (h, pos, ben) {
      const form = arg(pos, ben, 0, 'form');
      const x = this.herdZahl(arg(pos, ben, 1, 'x'), 'koerper', 'x', 0), y = this.herdZahl(arg(pos, ben, 2, 'y'), 'koerper', 'y', 0);
      const z = this.herdZahl(arg(pos, ben, 3, 'z'), 'koerper', 'z', 0);
      const gl = this.herdZahl(arg(pos, ben, 5, 'glanz'), 'koerper', 'glanz', null);
      const le = this.herdZahl(arg(pos, ben, 6, 'leuchten'), 'koerper', 'leuchten', null);
      return this.herdFabrik(3, x, y, z, 'Koerper', ['form', form, 'farbe', arg(pos, ben, 4, 'farbe'), 'glanz', gl, 'leuchten', le,
        'bild', arg(pos, ben, 7, 'bild')]);
    },
    'licht': function (h, pos, ben) {
      const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'licht', 'x'), y = this.herdZahl(arg(pos, ben, 1, 'y'), 'licht', 'y');
      const z = this.herdZahl(arg(pos, ben, 2, 'z'), 'licht', 'z');
      const rw = this.herdZahl(arg(pos, ben, 4, 'reichweite'), 'licht', 'reichweite', null);
      return this.herdFabrik(3, x, y, z, 'Licht', ['farbe', arg(pos, ben, 3, 'farbe'), 'reichweite', rw]);
    },
    'raum': function (h, pos, ben) {
      const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'raum', 'x', 0), y = this.herdZahl(arg(pos, ben, 1, 'y'), 'raum', 'y', 0);
      const z = this.herdZahl(arg(pos, ben, 2, 'z'), 'raum', 'z', 0);
      return this.herdFabrik(3, x, y, z, null, null);
    },
    'alsText': function (h) { return this.text(h); }
  });

  // statisch: Herd.farbe(r, g, b, a = 1) → "#rrggbbaa" (SPEC §18.1; reine Hilfe, kein Kern-Aufruf)
  const HERD_MOD_M = herdTab({
    'farbe': function (m, pos, ben) {
      const hex = (v) => { const s = v.toString(16); return s.length < 2 ? '0' + s : s; };
      const kanal = (v, n) => hex(Math.min(255, Math.max(0, Math.round(this.herdZahl(v, 'farbe', n)))));
      const r = kanal(arg(pos, ben, 0, 'r'), 'r'), g = kanal(arg(pos, ben, 1, 'g'), 'g'), b = kanal(arg(pos, ben, 2, 'b'), 'b');
      const a = this.herdZahl(arg(pos, ben, 3, 'a'), 'farbe', 'a', 1);
      return '#' + r + g + b + hex(Math.round(Math.min(1, Math.max(0, a)) * 255));
    }
  });

  // statisch: Grundformen (form_grund: 1 Würfel, 2 Kugel, 3 Zylinder, 4 Kegel, 5 Ebene, 6 Ring)
  const HERD_FORM_MOD_M = herdTab({
    'wuerfel': function () { return this.herdForm(this.hk_().e.form_grund(1, 0, 0)); },
    'kugel': function (m, pos, ben) { const n = this.herdZahl(arg(pos, ben, 0, 'teile'), 'kugel', 'teile', 24); return this.herdForm(this.hk_().e.form_grund(2, n, 0)); },
    'zylinder': function (m, pos, ben) { const n = this.herdZahl(arg(pos, ben, 0, 'teile'), 'zylinder', 'teile', 32); return this.herdForm(this.hk_().e.form_grund(3, n, 0)); },
    'kegel': function (m, pos, ben) { const n = this.herdZahl(arg(pos, ben, 0, 'teile'), 'kegel', 'teile', 32); return this.herdForm(this.hk_().e.form_grund(4, n, 0)); },
    'ebene': function () { return this.herdForm(this.hk_().e.form_grund(5, 0, 0)); },
    'ring': function (m, pos, ben) {
      const d = this.herdZahl(arg(pos, ben, 0, 'dicke'), 'ring', 'dicke', 0.3);
      const n = this.herdZahl(arg(pos, ben, 1, 'teile'), 'ring', 'teile', 32);
      return this.herdForm(this.hk_().e.form_grund(6, n, d));
    }
  });
  const HERD_FORM_M = herdTab({
    'id': function (f) { return f.id; },
    'alsText': function (f) { return this.text(f); }
  });
  const HERD_BILDCHEN_M = herdTab({
    'breite': function (b) { return b.breite; },
    'hoehe': function (b) { return b.hoehe; },
    'id': function (b) { return b.id; },
    'alsText': function (b) { return this.text(b); }
  });
  // statisch: Bildchen.laden(pfad) – PNG/JPEG aus der Kiste als eigene Textur (SPEC §18.5, K-145)
  const HERD_BILDCHEN_MOD_M = herdTab({
    'laden': function (m, pos, ben) { return this.herdBildchenLaden(arg(pos, ben, 0, 'pfad')); }
  });
  TABELLEN.set(HerdWelt, HERD_M);
  TABELLEN.set(HerdForm, HERD_FORM_M);
  TABELLEN.set(HerdBildchen, HERD_BILDCHEN_M);

  // P0013 und Kern-Bedarf: alle neu-Ausdrücke und statischen Zugriffe (Form.…, Herd.…, Bildchen.…) des Programms, nach Position sortiert
  function herdSammle(ast) {
    const out = [], gesehen = new Set();
    const geh = (x) => {
      if (x === null || typeof x !== 'object' || gesehen.has(x)) return;
      gesehen.add(x);
      if (Array.isArray(x)) { for (const y of x) geh(y); return; }
      if (x.k === 'Neu' && x.typ) out.push(x);
      else if ((x.k === 'MCall' || x.k === 'Mem') && x.obj && x.obj.k === 'Name' && (x.obj.n === 'Form' || x.obj.n === 'Herd' || x.obj.n === 'Bildchen')) out.push(x);
      for (const k in x) { const v = x[k]; if (v !== null && typeof v === 'object') geh(v); }
    };
    geh(ast);
    return out.sort((a, b) => (a.z - b.z) || (a.s - b.s));
  }

  // ══════════ site/js/pizza/herd/laufzeit.js ══════════
  // pizza-Interpreter · Herd: Laufzeit-Methoden und Spielschleife
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // ---------- Laufzeit-Methoden (this = Laufzeit) ----------
  const HERD_LAUFZEIT = {
    // P0013 (K-133) und „braucht den Kern“ – Startprüfung, ohne den Kern zu laden
    pruefeHerd() {
      let herd = false, theke = false, noetig = false;
      for (const n of herdSammle(this.ast.body)) {
        const name = n.k === 'Neu' ? n.typ.name : n.obj.n;
        if (this.klassen.has(name)) continue;          // eigene Klasse hat Vorrang
        if (n.k !== 'Neu') { noetig = true; continue; }
        if (name === 'Theke') theke = true;
        else if (name === 'Herd' || name === 'Form' || name === 'Bildchen') { noetig = true; if (name === 'Herd') herd = true; }
        else continue;
        if (herd && theke) throw this.pf('P0013', 'Theke und Herd in einem Programm gibt es noch nicht.', n);
      }
      this.herdNoetig = noetig;
    },
    // Kern holen (lazy). pflicht: fehlt er, endet der Lauf mit HOST-Fehler (nur vor dem Start); sonst null.
    herdKern(pflicht) {
      if (this.hk !== null) return this.hk;
      if (this.hkFehlt) { if (pflicht) throw new HerdKernFehlt(); return null; }
      const m = herdModul(this.herdOpt);
      try { if (m !== null && HERD_ENC !== null) this.hk = new HerdKern(m); } catch (e) { this.hk = null; }
      if (this.hk === null) {
        this.hkFehlt = true;
        if (pflicht) throw new HerdKernFehlt();
        return null;
      }
      if (this.herdSpion !== null) { try { this.herdSpion(this.hk.e); } catch (x) { /* Werkzeugfehler ignorieren */ } }
      return this.hk;
    },
    // für Ressourcen/Komponenten zur Laufzeit: Kern muss da sein (Herd-Programme prüfen das vor dem Start)
    hk_() {
      const k = this.herdKern(false);
      if (k === null) throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: der Herd-Kern fehlt (kern.wasm).');
      return k;
    },
    // Kern-Fehler → Ananas (Art 1 TypAnanas, 2 LaufzeitAnanas, 3 intern); setzt das NaN-Fehlerflag zurück
    herdFehler() {
      const k = this.hk, e = k.e;
      const art = e.fehler_art();
      const text = k.liesText((p, kap) => e.fehler_text(p, kap)) || '';
      e.fehler_neu();
      if (art === 1) return this.ananas('TypAnanas', text);
      if (art === 2) return this.ananas('LaufzeitAnanas', text);
      return this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: ' + text);
    },
    herdI(r) { if (r < 0) throw this.herdFehler(); return r; },
    herdF(r) { if (r !== r && this.hk.e.fehler_neu() === 1) throw this.herdFehler(); return r; },
    herdZahl(v, wo, param, std) {
      if (v === undefined || v === null) { if (std !== undefined) return std; }
      else if (typeof v === 'number') return v;
      throw this.ananas('TypAnanas', wo + '() braucht eine Zahl für \'' + param + '\', nicht ' + this.darstellung(v === undefined ? null : v) + '.');
    },
    herdTaste(n) { return this.text(n === undefined ? null : n); },
    herdMausBit(k, wo) {
      const n = this.herdZahl(k, wo, 'k', 1);
      if (n === 1) return 1;
      if (n === 2) return 2;
      if (n === 3) return 4;
      throw this.ananas('LaufzeitAnanas', 'Maustaste ' + zahlText(n) + ' gibt es nicht (1 links, 2 rechts, 3 Mitte).');
    },
    // Farbe als Text: Text unverändert, sonst die Textform (der Kern prüft und meldet)
    herdFarbText(v) { return typeof v === 'string' ? v : this.text(v === undefined ? null : v); },
    herdTeilId(v, wo, param) {
      if (v === undefined || v === null) return 0;
      if (v instanceof HerdTeil) return v.id;
      throw this.ananas('TypAnanas', wo + '() braucht ein Teil für \'' + param + '\', nicht ' + this.darstellung(v) + '.');
    },
    herdTeilObj(id) {
      const k = this.hk;
      let t = k.teile.get(id);
      if (t === undefined) { t = new HerdTeil(id, k.schema.teilTab); k.teile.set(id, t); }
      return t;
    },
    herdKompObj(h, art) {
      const k = this.hk;
      let o = k.komps.get(h);
      if (o === undefined) { o = new HerdKomp(h, art, 0); k.komps.set(h, o); }
      return o;
    },
    herdKompVon(teil, art) {
      const h = this.herdI(this.hk.e.komp_von(teil.id, art.nummer));
      if (h === 0) return null;
      const o = this.herdKompObj(h, art);
      o.teil = teil.id;
      return o;
    },
    herdForm(id) {
      this.herdI(id);
      const k = this.hk;
      let f = k.res.get(id);
      if (f === undefined) { f = new HerdForm(id); k.res.set(id, f); }
      return f;
    },
    // Feld nach Name (hole/setze); unbekannt → Kern-Text „<Name> hat kein Feld 'x'.“
    herdFeld(art, n) {
      const name = this.text(n === undefined ? null : n);
      const f = art.feldNachName.get(name);
      if (f !== undefined) return f;
      const k = this.hk, p = k.text(name);
      this.herdI(k.e.feld_nummer(art.nummer, p, k.len));
      throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: Feld \'' + name + '\' fehlt im Schema.');
    },
    herdTypfehler(art, f, v) {
      const k = this.hk, p = k.text(this.darstellung(v));
      k.e.melde_typfehler(art.nummer, f.nummer, p, k.len);
      return this.herdFehler();
    },
    // Wert setzen nach Feldtyp (schneller Weg: Zahl → setze_zahl, ohne Objekt-Allokation)
    herdSetze(h, art, f, v) {
      const e = this.hk.e;
      let r;
      switch (f.t) {
        case HF_ZAHL: case HF_GANZ:
          if (typeof v !== 'number') throw this.herdTypfehler(art, f, v);
          r = e.setze_zahl(h, f.nummer, v);
          break;
        case HF_DIAVOLO:
          if (v !== true && v !== false) throw this.herdTypfehler(art, f, v);
          r = e.setze_zahl(h, f.nummer, v ? 1 : 0);
          break;
        case HF_TEXT: case HF_WAHL: case HF_FARBE: {
          if (f.t !== HF_TEXT && typeof v !== 'string') throw this.herdTypfehler(art, f, v);
          const k = this.hk, p = k.text(f.t === HF_TEXT ? this.text(v) : v);
          r = e.setze_text(h, f.nummer, p, k.len);
          break;
        }
        case HF_TEIL:
          if (v !== null && !(v instanceof HerdTeil)) throw this.herdTypfehler(art, f, v);
          r = e.setze_zahl(h, f.nummer, v === null ? 0 : v.id);
          break;
        case HF_FORM:
          if (v !== null && !(v instanceof HerdForm)) throw this.herdTypfehler(art, f, v);
          r = e.setze_zahl(h, f.nummer, v === null ? 0 : v.id);
          break;
        case HF_BILDCHEN:
          if (v !== null && !(v instanceof HerdBildchen)) throw this.herdTypfehler(art, f, v);
          r = e.setze_zahl(h, f.nummer, v === null ? 0 : v.id);
          break;
        case HF_LISTE: {
          if (!Array.isArray(v) || !v.every(x => x instanceof HerdBildchen)) throw this.herdTypfehler(art, f, v);
          const k = this.hk, p = e.puffer(v.length * 4 || 4);
          k.mem();
          for (let i = 0; i < v.length; i++) k.dv.setUint32(p + i * 4, v[i].id, true);
          r = e.setze_liste(h, f.nummer, p, v.length);
          break;
        }
        case HF_TEIL_LISTE: {
          if (!Array.isArray(v) || !v.every(x => x instanceof HerdTeil)) throw this.herdTypfehler(art, f, v);
          const k = this.hk, p = e.puffer(v.length * 4 || 4);
          k.mem();
          for (let i = 0; i < v.length; i++) k.dv.setUint32(p + i * 4, v[i].id, true);
          r = e.setze_liste(h, f.nummer, p, v.length);
          break;
        }
        case HF_ZAHL_LISTE: {
          if (!Array.isArray(v) || !v.every(x => typeof x === 'number')) throw this.herdTypfehler(art, f, v);
          const k = this.hk, p = e.puffer(v.length * 8 || 8);
          k.mem();
          for (let i = 0; i < v.length; i++) k.dv.setFloat64(p + i * 8, v[i], true);
          r = e.setze_zahlen(h, f.nummer, p, v.length);
          break;
        }
        default:
          throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: Feldtyp \'' + f.typ + '\' kennt diese Sprache noch nicht.');
      }
      if (r < 0) throw this.herdFehler();
    },
    herdHole(h, art, f) {
      const k = this.hk, e = k.e;
      switch (f.t) {
        case HF_ZAHL: case HF_GANZ: return this.herdF(e.hole_zahl(h, f.nummer));
        case HF_DIAVOLO: return this.herdF(e.hole_zahl(h, f.nummer)) !== 0;
        case HF_TEXT: case HF_WAHL: case HF_FARBE: {
          const s = k.liesText((p, kap) => e.hole_text(h, f.nummer, p, kap));
          if (s === null) throw this.herdFehler();
          return s;
        }
        case HF_TEIL: { const id = this.herdF(e.hole_zahl(h, f.nummer)); return id === 0 ? null : this.herdTeilObj(id); }
        case HF_FORM: case HF_BILDCHEN: { const id = this.herdF(e.hole_zahl(h, f.nummer)); return id === 0 ? null : (k.res.get(id) || null); }
        case HF_LISTE: {
          const ids = k.liesListe((p, kap) => e.hole_liste(h, f.nummer, p, kap));
          if (ids === null) throw this.herdFehler();
          return ids.map(id => k.res.get(id) || null);
        }
        case HF_TEIL_LISTE: {
          const ids = k.liesListe((p, kap) => e.hole_liste(h, f.nummer, p, kap));
          if (ids === null) throw this.herdFehler();
          return ids.map(id => this.herdTeilObj(id));
        }
        case HF_ZAHL_LISTE: {
          const z = k.liesZahlen((p, kap) => e.hole_zahlen(h, f.nummer, p, kap));
          if (z === null) throw this.herdFehler();
          return z;
        }
        default:
          throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: Feldtyp \'' + f.typ + '\' kennt diese Sprache noch nicht.');
      }
    },
    // Fabrik (README §3, Vertrag für alle Motoren): teil_neu → teil_lage → komp_neu → Setter in der übergebenen
    // (= Schema-)Reihenfolge, fehlende/karton-Werte ohne Aufruf → komp_haenge. felder: [name, wert, name, wert, …]
    herdFabrik(raum, x, y, z, artName, felder) {
      const k = this.hk_(), e = k.e;
      const id = this.herdI(e.teil_neu(raum));
      this.herdI(e.teil_lage(id, x, y, z));
      if (artName !== null) {
        const art = k.schema.nachName.get(artName);
        if (art === undefined) throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: Komponente ' + artName + ' fehlt im Schema.');
        const h = this.herdI(e.komp_neu(art.nummer));
        for (let i = 0; i < felder.length; i += 2) {
          const w = felder[i + 1];
          if (w === undefined || w === null) continue;
          this.herdSetze(h, art, art.feldNachName.get(felder[i]), w);
        }
        this.herdI(e.komp_haenge(h, id));
      }
      return this.herdTeilObj(id);
    },
    // neu <Herd-Klasse>(…) – undefined, wenn tn keine Herd-Klasse ist
    herdNeu(tn, pos, ben) {
      const fest = HERD_KLASSEN.indexOf(tn) >= 0;
      let art;
      if (!fest) {
        if (!HERD_KOMP_NAMEN.has(tn) && this.hk === null) return undefined;   // fremder Name: Kern nicht unnötig laden
        const k = this.herdKern(false);
        if (k === null || (art = k.schema.nachName.get(tn)) === undefined) return undefined;
      }
      if (this.kueche !== null) throw this.ananas('KüchenAnanas', HERD_KUECHE);
      if (tn === 'Teil') throw this.ananas('RohlingAnanas', '\'Teil\' kann man nicht mit neu backen.');
      const k = this.hk_(), e = k.e;
      if (tn === 'Herd') {
        const tw = arg(pos, ben, 0, 'titel');
        const titel = tw === undefined ? '' : this.text(tw);   // K-102: karton → "karton"
        let b = arg(pos, ben, 1, 'breite'), ho = arg(pos, ben, 2, 'hoehe');
        b = b === undefined || b === null ? 640 : (typeof b === 'number' ? b : this.ganzzahl(b, 'Herd(breite: …)'));
        ho = ho === undefined || ho === null ? 360 : (typeof ho === 'number' ? ho : this.ganzzahl(ho, 'Herd(hoehe: …)'));
        this.herdI(e.welt_neu(b, ho, k.text(titel), k.len));
        this.herd = new HerdWelt(titel, b, ho);
        return this.herd;
      }
      if (tn === 'Form') return this.herdFormNeu(pos, ben);
      if (tn === 'Bildchen') return this.herdBildchenNeu(pos, ben);
      // Komponente: unbekannte benannte Argumente zuerst (Kern-Text), dann komp_neu und Felder in Schema-Reihenfolge
      if (ben !== null) for (const n in ben) if (!art.feldNachName.has(n)) this.herdFeld(art, n);
      const h = this.herdI(e.komp_neu(art.nummer));
      const o = this.herdKompObj(h, art);
      for (let i = 0; i < art.felder.length; i++) {
        const f = art.felder[i], w = arg(pos, ben, i, f.name);
        if (w !== undefined && w !== null) this.herdSetze(h, art, f, w);
      }
      return o;
    },
    // neu Form(punkte, dreiecke, glatt: nein) – beide Bleche als f64 in einem Austauschpuffer; falscher Typ → Kern-Text
    herdFormNeu(pos, ben) {
      const k = this.hk_(), e = k.e;
      const pu = arg(pos, ben, 0, 'punkte'), dr = arg(pos, ben, 1, 'dreiecke'), gl = arg(pos, ben, 2, 'glatt');
      const glatt = gl === undefined || gl === null ? false : this.bool(gl);
      const zahlen = (b) => Array.isArray(b) && b.every(x => typeof x === 'number');
      // kein Zahlen-Blech → eine Länge, die nicht durch 3 teilbar ist: der Kern meldet seinen Text (Code 42/43)
      const np = zahlen(pu) ? pu.length : 1, nd = zahlen(dr) ? dr.length : 1;
      const p = e.puffer((np + nd) * 8 || 8);
      k.mem();
      const f64 = new Float64Array(k.puf, p, np + nd);
      for (let i = 0; i < np; i++) f64[i] = zahlen(pu) ? pu[i] : 0;
      for (let i = 0; i < nd; i++) f64[np + i] = zahlen(dr) ? dr[i] : 0;
      return this.herdForm(e.form_eigene(p, np, p + np * 8, nd, glatt ? 1 : 0));
    },
    // neu Bildchen(zeilen, farben: karton) – Zeilen: u32 Länge + UTF-8; Farben: Paare (Zeichen, Farbtext)
    herdBildchenNeu(pos, ben) {
      const k = this.hk_(), e = k.e;
      const zw = arg(pos, ben, 0, 'zeilen'), fw = arg(pos, ben, 1, 'farben');
      // kein Blech aus Texten → keine Zeilen: der Kern meldet „braucht Zeilen als nicht leeres Blech aus Texten“
      const zeilen = Array.isArray(zw) && zw.every(x => typeof x === 'string') ? zw : [];
      let farben = [];
      if (fw !== undefined && fw !== null) {
        if (!(fw instanceof Map)) throw this.ananas('TypAnanas', 'Bildchen() braucht eine Speisekarte für \'farben\', nicht ' + this.darstellung(fw) + '.');
        for (const [z, f] of fw) farben.push(this.text(z), this.herdFarbText(f));
      }
      const teile = zeilen.concat(farben).map(s => HERD_ENC.encode(s));
      let n = 0;
      for (const t of teile) n += 4 + t.length;
      const p = e.puffer(n || 4), m = k.mem();
      let o = p;
      for (const t of teile) { k.dv.setUint32(o, t.length, true); m.set(t, o + 4); o += 4 + t.length; }
      let zl = 0;
      for (let i = 0; i < zeilen.length; i++) zl += 4 + teile[i].length;
      const id = this.herdI(e.bildchen_neu(p, zl, p + zl, n - zl));
      const b = new HerdBildchen(id, this.herdF(e.ressource_hole(id, 2)), this.herdF(e.ressource_hole(id, 3)));
      k.res.set(id, b);
      return b;
    },
    // ---------- Bilddateien (SPEC §18.5, K-145; PROJEKTE §5.2 … §5.5) ----------
    // Vor dem Start: jedes Bild der Kiste (Endung .png/.jpg/.jpeg) → Teigling, je Quell-Hash einmal; ein Teigling aus
    // optionen.teiglinge gilt nur, wenn sein Kopf gültig ist und die SHA-256 der Quelle trägt (ein veralteter Cache ändert nie
    // ein Ergebnis). Teigmenge = Summe verschiedener Quell-Hashes ohne Fehler-Teiglinge; > 32 MiB → P0020 ohne Ort.
    vorbacke() {
      const bilder = Object.keys(this.kiste).filter(istBildPfad).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      if (!bilder.length) return;
      const vb = herdVorbacker(this.vorbackerOpt);
      if (vb === null) throw new VorbackerFehlt();
      const jeHash = new Map();
      let menge = 0;
      for (const pfad of bilder) {
        let q = this.kiste[pfad];
        if (typeof q === 'string') q = HERD_ENC !== null ? HERD_ENC.encode(q) : TEIGLING_LEER;
        const sha = teiglingHex(vb.sha256(q));
        let t = jeHash.get(sha);
        if (t === undefined) {
          const c = this.teiglingeOpt !== null && Object.prototype.hasOwnProperty.call(this.teiglingeOpt, pfad) ? this.teiglingeOpt[pfad] : null;
          const k = teiglingKopf(c);
          t = k !== null && k.sha256 === sha ? c : vb.vorbacken(q);
          jeHash.set(sha, t);
          const kt = teiglingKopf(t);
          if (kt !== null && !kt.fehler) menge += t.length;
        }
        this.teiglinge.set(pfad, t);
      }
      if (menge > TEIGMENGE_MAX) throw this.pf('P0020', 'Die Bilder sind zusammen zu groß für den Ofen (' + mbText(menge) + ' vorgebacken, höchstens 32 MB).', null);
    },
    // Bildchen.laden(pfad): Text? → Herd da? (Kern-Text, Code 3) → schon geladen (dasselbe Bildchen) → in der Kiste? →
    // Teigling an den Kern (bildchen_teigling prüft nur den Kopf; 61/62 → „<pfad> <Kern-Text>“)
    herdBildchenLaden(pw) {
      if (typeof pw !== 'string') throw this.ananas('TypAnanas', 'Bildchen.laden() braucht einen Text für \'pfad\', nicht ' + this.darstellung(pw === undefined ? null : pw) + '.');
      const k = this.hk_(), e = k.e;
      if (this.herd === null) this.herdI(e.bildchen_teigling(e.puffer(1), 0));   // noch keine Welt → Kern Code 3
      const alt = this.bildPfade.get(pw);
      if (alt !== undefined) return alt;
      if (!kisteHat(this.kiste, pw)) throw this.ananas('LaufzeitAnanas', 'Die Datei "' + pw + '" liegt nicht in der Kiste.');
      const t = this.teiglinge.get(pw) || TEIGLING_LEER;   // keine Bild-Endung → kein Teigling → Kern Code 61
      const p = e.puffer(t.length || 1);
      k.mem().set(t, p);
      const id = e.bildchen_teigling(p, t.length);
      if (id < 0) {
        const code = e.fehler_code();
        if (code !== 61 && code !== 62) throw this.herdFehler();
        const text = k.liesText((q, kap) => e.fehler_text(q, kap)) || '';
        e.fehler_neu();
        throw this.ananas('LaufzeitAnanas', pw + ' ' + text);
      }
      const b = new HerdBildchen(id, this.herdF(e.ressource_hole(id, 2)), this.herdF(e.ressource_hole(id, 3)));
      k.res.set(id, b);
      this.bildPfade.set(pw, b);
      return b;
    },
    // ---------- Spielschleife (SPEC §18.2) ----------
    herdSende(art, daten) {
      const ev = { typ: 'herd', art };
      for (const s in daten) if (s !== 'bytes') ev[s] = daten[s];
      this.emit(ev);
      if (this.onHerd !== null) { try { this.onHerd(art, daten); } catch (x) { /* Renderer-Fehler ignorieren */ } }
    },
    herdOeffne(h) {
      h.offen = true;
      this.hk.e.paket_voll();     // neues Fenster: das nächste Paket enthält wieder alle Ressourcen
      this.herdSende('fenster', { titel: h.titel, breite: h.breite, hoehe: h.hoehe });
    },
    herdSchliesseFenster(h) {
      if (!h.offen) return;
      h.offen = false;
      this.herdSende('schliesse', {});
    },
    herdBild(h) {
      const k = this.hk, e = k.e;
      const len = this.herdI(e.bild(h.bildnummer));
      const szene = k.hash(p => e.hash_szene(p));
      const paket = k.hash(p => e.hash_paket(p));
      const daten = { bildnummer: h.bildnummer, szene, paket };
      if (this.onHerd !== null) {   // Bytes nur an den Renderer (Kopie: der Kern überschreibt sie beim nächsten bild)
        const z = e.bild_zeiger();
        daten.bytes = k.mem().slice(z, z + len);
      }
      this.herdSende('bild', daten);
    },
    herdEingabe(h, ev) {
      h.vorTasten = h.tasten;
      h.vorKnoepfe = h.knoepfe;
      const t = ev.tasten;
      if (Array.isArray(t) && t.every(x => typeof x === 'string')) h.tasten = new Set(t);
      const m = ev.maus;
      if (Array.isArray(m) && m.length === 2 && typeof m[0] === 'number' && typeof m[1] === 'number' && isFinite(m[0]) && isFinite(m[1])) {
        h.mausX = m[0]; h.mausY = m[1];
      }
      const kn = ev.knoepfe;
      if (typeof kn === 'number' && Number.isInteger(kn) && kn >= 0 && kn <= 7) h.knoepfe = kn;
    },
    // Rückruf aus der Spielschleife (fn oder Kniff-Phase): schliesse() wirkt danach, Panik beendet sofort (kein schliesse)
    herdRueckruf(h, f) {
      h.imRueckruf = true;
      try {
        f();
      } catch (x) {
        if (x instanceof PanikSig) h.schliessen = false;   // §18.2
        throw x;
      } finally {
        h.imRueckruf = false;
        if (h.schliessen) { h.schliessen = false; this.herdSchliesseFenster(h); }
      }
    },
    herdBacke(h, fn, node) {
      if (fn !== null && !(fn instanceof Funktion || fn instanceof Gebunden || fn instanceof NativFn)) {
        throw this.ananas('TypAnanas', 'backe() braucht eine Funktion, z. B. () -> { … }.');
      }
      if (!h.offen) this.herdOeffne(h);
      if (this.uiWarte === null && this.uiListe === null) {   // ohne Renderer (wie K-063)
        this.warnung('W0104', HERD_W0104, node);
        this.herdSchliesseFenster(h);
        return;
      }
      const e = this.hk.e;
      for (;;) {
        const ev = this.uiNaechstesEreignis();
        if (ev.typ === 'geschlossen') { h.offen = false; return; }
        if (ev.typ !== 'takt') continue;
        this.herdEingabe(h, ev);
        const a = ev.anzahl;
        const n = typeof a === 'number' && Number.isInteger(a) && a >= 1 ? Math.min(a, 4) : 1;
        for (let i = 0; i < n; i++) {
          h.bildnummer++;
          h.erster = i === 0;
          // H-K12 (K-151): Eingabezustand an den Kern – je Takt vor fn() (UI-Bausteine, Blick.mausX)
          this.herdI(e.eingabe(h.mausX, h.mausY, h.knoepfe));
          // K-087: jeder Takt beginnt mit frischem Schrittbudget (P0002 je Takt, einschließlich der Kniffe)
          this.limitBasis = this.schritte;
          this.neuGrenze();
          try {
            if (fn !== null) {
              this.herdRueckruf(h, () => this.rufe(fn, [], null, node));
              if (!h.offen) return;   // schliesse() im Rückruf: Systeme und Bild entfallen
            }
            this.herdI(e.takt());
            // H-K13 (K-152): Kniff-Rückrufe nach Systemen und Nachlauf; gedrueckt/klick gelten wie in fn
            if (this.kniffAn.size > 0) {
              this.herdRueckruf(h, () => this.kniffPhase(h, node));
              if (!h.offen) return;   // schliesse() in einem Kniff: übrige Kniffe und Bild entfallen
            }
          } finally {
            h.erster = false;
          }
        }
        this.herdBild(h);
      }
    },
    // Programmende (wie K-061): offenes Fenster schließen
    herdEnde() {
      const h = this.herd;
      if (h !== null && h.offen) this.herdSchliesseFenster(h);
    }
  };
  Object.assign(Laufzeit.prototype, HERD_LAUFZEIT);

  // ══════════ site/js/pizza/herd/kniff.js ══════════
  // pizza-Interpreter · Herd: Kniff – eigene pizza-Klassen als Komponente (SPEC §18.4, HERD.md §12.4 H-K13, K-152)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).
  //
  // Der Herd-Kern kennt keine Kniffe: Anhängen, Reihenfolge und Rückrufe leben in der Laufzeit (Spiegel: laufzeit/src/herd.rs,
  // Abschnitt „Kniff“). Bitgleich in allen Motoren, daher fest: Teile nach aufsteigender ID, je Teil Kniffe in
  // Anhängereihenfolge, Schnappschuss zu Beginn der Phase (später angehängte Kniffe laufen ab dem nächsten Takt), vor jedem
  // Rückruf die Prüfung „hängt noch an diesem Teil“, dieselbe Folge von Kern-Aufrufen (teil_hole RUHT/KINDER/ENTFERNT,
  // komp_von, hole_liste, hole_zahl) wie die Wasm-Laufzeit. Programme ohne Kniffe rufen hier nichts.

  // überschreibbare Rückrufe der Basisklasse (leer) und die Methoden, die jeder Kniff kann
  const KNIFF_RUECKRUFE = ['start', 'takt', 'beimBetreten', 'beimVerlassen', 'beimKlick', 'beimEntfernen'];
  const KNIFF_NAMEN = new Set(['teil'].concat(KNIFF_RUECKRUFE));
  const KNIFF_TEIL_RUHT = 19, KNIFF_TEIL_KINDER = 18, KNIFF_TEIL_ENTFERNT = 14, KNIFF_TEIL_RAUM = 12;

  const KNIFF_M = tabelle({
    // teil() → das Teil, an dem der Kniff hängt, sonst karton (auch nach ohne/entferne – beimEntfernen läuft danach)
    'teil': function (o) {
      if (this.kueche !== null) throw this.ananas('KüchenAnanas', HERD_KUECHE);
      const z = this.kniffZ.get(o);
      return z === undefined || z.teil === 0 ? null : this.herdTeilObj(z.teil);
    },
    'start': function () { return null; },
    'takt': function () { return null; },
    'beimBetreten': function () { return null; },
    'beimVerlassen': function () { return null; },
    'beimKlick': function () { return null; },
    'beimEntfernen': function () { return null; }
  });

  const HERD_KNIFF = {
    istKniffKlasse(k) {
      for (let c = k; c; c = c.basis) if (c === this.kniffWurzel) return true;
      return false;
    },
    istKniff(v) { return v instanceof Obj && this.istKniffKlasse(v.klasse); },
    // eingebaute Kniff-Methode als Funktionswert (unqualifiziert `teil()` in einer Kniff-Klasse, `dies.teil`)
    kniffNativ(o, name, sc) {
      return new NativFn(name, (pos, ben, node) => this.objMethode(o, name, pos, ben, node, sc), o);
    },
    kniffZustand(k) {
      let z = this.kniffZ.get(k);
      if (z === undefined) { z = { teil: 0, gestartet: false }; this.kniffZ.set(k, z); }
      return z;
    },
    // teil.mit(kniff): Teil lebt (Kern-Text), Kniff hängt noch nirgends
    kniffMit(t, k) {
      this.herdF(this.hk.e.teil_hole(t.id, KNIFF_TEIL_RAUM));
      const z = this.kniffZustand(k);
      if (z.teil !== 0) throw this.ananas('LaufzeitAnanas', 'Dieser Kniff hängt schon an Teil ' + z.teil + '.');
      z.teil = t.id;
      const l = this.kniffAn.get(t.id);
      if (l === undefined) this.kniffAn.set(t.id, [k]); else l.push(k);
      return k;
    },
    // aus der Liste des Teils lösen (Zustand teil = 0)
    kniffLoese(k, id) {
      this.kniffZ.get(k).teil = 0;
      const l = this.kniffAn.get(id);
      const i = l.indexOf(k);
      l.splice(i, 1);
      if (l.length === 0) this.kniffAn.delete(id);
    },
    // teil.ohne(kniff) → der Kniff (danach beimEntfernen) oder karton, wenn er nicht an diesem Teil hängt
    kniffOhne(t, k, node) {
      this.herdF(this.hk.e.teil_hole(t.id, KNIFF_TEIL_RAUM));
      const z = this.kniffZ.get(k);
      if (z === undefined || z.teil !== t.id) return null;
      this.kniffLoese(k, t.id);
      this.kniffRufe(k, 'beimEntfernen', [], node);
      return k;
    },
    kniffListe(t) {
      this.herdF(this.hk.e.teil_hole(t.id, KNIFF_TEIL_RAUM));
      const l = this.kniffAn.get(t.id);
      return l === undefined ? [] : l.slice();
    },
    kniffIds() { return Array.from(this.kniffAn.keys()).sort((a, b) => a - b); },
    // teil.entferne(): erst der Kern (samt Kindern), dann lösen sich alle Kniffe der entfernten Teile (nach ID, je Teil in
    // Anhängereihenfolge) und bekommen danach beimEntfernen() – ohne Kinder wird nur das Teil selbst geprüft
    kniffEntferne(t, node) {
      const e = this.hk.e;
      if (this.kniffAn.size === 0) { this.herdI(e.teil_entferne(t.id)); return; }
      const kinder = this.herdF(e.teil_hole(t.id, KNIFF_TEIL_ENTFERNT)) === 0 ? this.herdF(e.teil_hole(t.id, KNIFF_TEIL_KINDER)) : 0;
      this.herdI(e.teil_entferne(t.id));
      let ids;
      if (kinder === 0) ids = this.kniffAn.has(t.id) ? [t.id] : [];
      else ids = this.kniffIds().filter(id => this.herdF(e.teil_hole(id, KNIFF_TEIL_ENTFERNT)) !== 0);
      const weg = [];
      for (const id of ids) {
        for (const k of this.kniffAn.get(id)) { this.kniffZ.get(k).teil = 0; weg.push(k); }
        this.kniffAn.delete(id);
      }
      for (const k of weg) this.kniffRufe(k, 'beimEntfernen', [], node);
    },
    // überschriebener Rückruf? (die Basisklasse Kniff hat keine Methoden-Deklarationen – ihre Rückrufe sind leer)
    kniffHat(k, name) { return this.findeMethodeListe(k.klasse, name) !== null; },
    kniffRufe(k, name, args, node) {
      const l = this.findeMethodeListe(k.klasse, name);
      if (l === null) return;
      this.rufeDecl(this.waehle(l, args.length), k, args, null, node, 'normal');
    },
    // Kniff-Phase je Takt (nach Systemen und Nachlauf, SPEC §18.2): Teile nach ID (ruhende ausgelassen, Stand zu Beginn),
    // je Kniff: start() einmal, beimBetreten/beimVerlassen je Eintrag aus Fuehler.betreten/verlassen, beimKlick bei
    // Taster.geklickt, takt(). Kehrt nach einem Rückruf mit herd.schliesse() sofort zurück.
    kniffPhase(h, node) {
      const k = this.hk, e = k.e;
      const plan = [];
      for (const id of this.kniffIds()) {
        if (this.herdF(e.teil_hole(id, KNIFF_TEIL_RUHT)) !== 0) continue;
        plan.push(id, this.kniffAn.get(id).slice());
      }
      const fu = k.schema.nachName.get('Fuehler'), ta = k.schema.nachName.get('Taster');
      const fBetreten = fu && fu.feldNachName.get('betreten'), fVerlassen = fu && fu.feldNachName.get('verlassen');
      const fGeklickt = ta && ta.feldNachName.get('geklickt');
      for (let p = 0; p < plan.length; p += 2) {
        const id = plan[p];
        for (const kn of plan[p + 1]) {
          const z = this.kniffZ.get(kn);
          if (z.teil !== id) continue;
          if (!z.gestartet) {
            z.gestartet = true;
            this.kniffRufe(kn, 'start', [], node);
            if (h.schliessen) return;
          }
          for (const [name, f] of [['beimBetreten', fBetreten], ['beimVerlassen', fVerlassen]]) {
            if (z.teil !== id || !f || !this.kniffHat(kn, name)) continue;
            const fh = this.herdI(e.komp_von(id, fu.nummer));
            if (fh === 0) continue;
            for (const anderes of this.herdHole(fh, fu, f)) {
              if (z.teil !== id) break;
              this.kniffRufe(kn, name, [anderes], node);
              if (h.schliessen) return;
            }
          }
          if (z.teil === id && fGeklickt && this.kniffHat(kn, 'beimKlick')) {
            const th = this.herdI(e.komp_von(id, ta.nummer));
            if (th !== 0 && this.herdHole(th, ta, fGeklickt) === true) {
              this.kniffRufe(kn, 'beimKlick', [], node);
              if (h.schliessen) return;
            }
          }
          if (z.teil === id && this.kniffHat(kn, 'takt')) {
            this.kniffRufe(kn, 'takt', [], node);
            if (h.schliessen) return;
          }
        }
      }
    }
  };
  Object.assign(Laufzeit.prototype, HERD_KNIFF);

  // ══════════ site/js/pizza/api.js ══════════
  // pizza-Interpreter · API (run, intern, öffentliches Objekt)
  // Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

  // =====================================================================
  // API
  // =====================================================================

  // quelle: Text (Ein-Datei-Programm) oder Projekt { dateien, hauptdatei?, name? } (SPEC §2, ARCHITEKTUR §1)
  function run(quelle, optionen) {
    optionen = optionen || {};
    const ereignisse = [];
    const onEvent = typeof optionen.onEvent === 'function' ? optionen.onEvent : null;
    const emit = (e) => {
      ereignisse.push(e);
      if (onEvent !== null) { try { onEvent(e); } catch (x) { /* Beobachterfehler ignorieren */ } }
    };
    let L = null, exitCode = 0;
    let p;
    try { p = ladeProjekt(quelle); }
    catch (e) { p = { ok: false, fehler: { code: 'LaufzeitAnanas', art: 'ananas', text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', datei: null, zeile: null, spalte: null, detail: String(e && e.message) } }; }
    if (!p.ok) {
      // Ladefehler (SPEC §2.5): Exit 2, 0 Schritte, keine Warnungen davor
      const f = p.fehler;
      const ev = { typ: 'fehler', code: f.code, art: f.art, text: f.text, datei: f.datei, zeile: f.zeile, spalte: f.spalte };
      if (f.detail !== undefined) { ev.detail = f.detail; exitCode = 1; } else exitCode = 2;
      emit(ev);
    } else {
      try {
        // Standard-Argumente aus pizza.json gelten, wenn keine Argumente übergeben werden (SPEC §2.1)
        const opt = Object.assign({}, optionen, { kiste: p.kiste });
        if (p.args.length && !(Array.isArray(optionen.args) && optionen.args.length)) opt.args = p.args;
        L = new Laufzeit(p.ast, opt, emit);
        const rang = p.ast.ladeRang;
        // zuerst W0004 des Laders, dann die statische Analyse (SPEC §2.5); einmal je Code + Datei + Zeile + Spalte
        for (const w of p.warnungen.concat(analysiere(p.ast, rang))) {
          const key = warnSchluessel(w.code, w.d, w.zeile, w.spalte);
          if (L.warnSet.has(key)) continue;
          L.warnSet.add(key);
          emit({ typ: 'warnung', code: w.code, text: w.text, datei: L.dateiPfad(w.d), zeile: w.zeile, spalte: w.spalte });
        }
        L.start();
      } catch (e) {
        if (L) {
          try { exitCode = L.behandleEnde(e); }
          catch (e2) {
            emit({ typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas', text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', datei: null, zeile: null, spalte: null, detail: String(e2 && e2.message) });
            exitCode = 1;
          }
        } else {
          emit({ typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas', text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', datei: null, zeile: null, spalte: null, detail: String(e && e.message) });
          exitCode = 1;
        }
      }
    }
    const schritte = L ? L.schritte : 0;
    const zeitMs = L ? L.schritte + L.offset : 0;
    emit({ typ: 'ende', exitCode, schritte, zeitMs });
    return { exitCode, ereignisse, schritte, zeitMs };
  }

  // Startprüfung ohne Programmlauf (für Compiler-Frontends – der Wasm-Compiler nutzt genau diese Funktion, PROJEKTE PA2):
  // registriert alle Deklarationen und führt die Prüfungen aus SPEC §14.7 aus (Q0004, P0010, P0011, R0001, A0001, P0013).
  // → { fehler: null | { code, text, zeile, spalte, d } wie das fehler-Ereignis (art "pizzafehler", d = Datei-Index),
  //     herdNoetig } – herdNoetig: das Programm braucht den Herd-Kern vor dem Start (K-128, wie in start()).
  function startpruefung(ast) {
    const L = new Laufzeit(ast, {}, () => {});
    try {
      for (const d of ast.body) if (DEKL.has(d.k)) L.registriere(d);
      L.pruefe();
      return { fehler: null, herdNoetig: !!L.herdNoetig };
    } catch (e) {
      if (e instanceof PizzaFehlerSig) return { fehler: { code: e.code, text: 'PizzaFehler ' + e.code + ': ' + e.text, zeile: e.zeile, spalte: e.spalte, d: e.d || 0 }, herdNoetig: !!L.herdNoetig };
      throw e;
    }
  }
  function pruefeStart(ast) { return startpruefung(ast).fehler; }

  return {
    version: VERSION,
    KEYWORDS: KEYWORDS.slice(),
    TYPEN: TYPEN.slice(),
    BUILTINS: BUILTINS.slice(),
    ANANAS: ANANAS.slice(),
    PANIK_TEXT: PANIK_BANNER,
    parse,
    run,
    // Projekte (SPEC §2, ARCHITEKTUR §1): gemeinsamer Lader, pizza.json, Pfadregel
    projekt: {
      lade: projektLade,
      ausDateien: (dateien) => { const r = ausDateien(dateien); return r.fehler ? { fehler: r.fehler } : r; },
      pruefePfad
    },
    // Für Compiler-Frontends (pizzaiolo), keine stabile Endnutzer-API; Beschreibung in ARCHITEKTUR §1.
    intern: {
      analysiere: (ast) => analysiere(ast, ast && ast.ladeRang).map(w => ({ code: w.code, text: w.text, zeile: w.zeile, spalte: w.spalte, d: w.d || 0 })),
      pruefe: pruefeStart,
      startpruefung,
      ANANAS_BAUM: ANANAS_BAUM.map(a => [a[0], a[1]]),
      MAX_STAPEL,
      STANDARD_LIMIT,
      UI_STIL: JSON.parse(JSON.stringify(UI_STIL)),
      HERD_TYPEN: HERD_KLASSEN.concat(HERD_KOMPONENTEN),
      WINKEL: Object.assign({}, WINKEL),  // K-137: Winkelfunktionen (Bitgleichheitstest gegen die Wasm-Laufzeit)
      LOGEXP: Object.assign({}, LOGEXP)   // U-72: log/log10/log2/exp (ebenso)
    }
  };

});
