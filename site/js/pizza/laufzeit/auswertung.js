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
    const z0 = this.z, s0 = this.s;
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
}
laufzeitTeil(LaufzeitAuswertung);
