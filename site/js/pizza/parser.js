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
