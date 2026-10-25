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
    if (v instanceof KlangObj) return 'Ein Klang';
    if (v instanceof KlangSpur) return 'Eine Spur';
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
