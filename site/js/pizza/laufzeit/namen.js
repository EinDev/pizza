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
    if (g !== undefined && !((name === 'Zettel' || name === 'Herd' || name === 'Form' || name === 'Bildchen' || name === 'Kiste' || name === 'Klang') && this.klassen.has(name))) return g;
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
