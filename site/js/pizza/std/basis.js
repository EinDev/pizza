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
