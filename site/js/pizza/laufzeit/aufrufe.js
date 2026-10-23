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
