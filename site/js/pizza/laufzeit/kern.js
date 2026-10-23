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
