// pizza-Interpreter · Klang: Methodentabellen (SPEC §18.8, K-153)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).
//
// Reihenfolge der Prüfungen (Vertrag für alle Motoren): Argumente in Parameterreihenfolge auf ihren Sprachtyp (Zahl, Text,
// Klang – TypAnanas mit Parametername), dann der Erzeuger (Wertebereiche, Texte, Länge).
function klangTab(o) { const t = tabelle(o); nurHauptkueche(t, KLANG_KUECHE); return t; }

// statisch: Klang.ton, Klang.rauschen, Klang.stille, Klang.noten
const KLANG_MOD_M = klangTab({
  'ton': function (m, pos, ben) {
    const fr = this.herdZahl(arg(pos, ben, 0, 'frequenz'), 'ton', 'frequenz');
    const d = this.herdZahl(arg(pos, ben, 1, 'dauer'), 'ton', 'dauer');
    const w = this.klangText(arg(pos, ben, 2, 'welle'), 'ton', 'welle', 'sinus');
    const laut = this.herdZahl(arg(pos, ben, 3, 'lautstaerke'), 'ton', 'lautstaerke', 0.5);
    const bis = this.herdZahl(arg(pos, ben, 4, 'bis'), 'ton', 'bis', 0);
    const an = this.herdZahl(arg(pos, ben, 5, 'anschlag'), 'ton', 'anschlag', 0.005);
    const aus = this.herdZahl(arg(pos, ben, 6, 'ausklang'), 'ton', 'ausklang', 0.02);
    const k = this.klangKern(false), [p, l] = k.texte(w);
    return this.klangNeu(k.e.ton(fr, d, p, l, laut, bis, an, aus));
  },
  'rauschen': function (m, pos, ben) {
    const d = this.herdZahl(arg(pos, ben, 0, 'dauer'), 'rauschen', 'dauer');
    const a = this.klangText(arg(pos, ben, 1, 'art'), 'rauschen', 'art', 'weiss');
    const laut = this.herdZahl(arg(pos, ben, 2, 'lautstaerke'), 'rauschen', 'lautstaerke', 0.5);
    const an = this.herdZahl(arg(pos, ben, 3, 'anschlag'), 'rauschen', 'anschlag', 0.005);
    const aus = this.herdZahl(arg(pos, ben, 4, 'ausklang'), 'rauschen', 'ausklang', 0.02);
    const saat = this.herdZahl(arg(pos, ben, 5, 'saat'), 'rauschen', 'saat', 1);
    const k = this.klangKern(false), [p, l] = k.texte(a);
    return this.klangNeu(k.e.rauschen(d, p, l, laut, an, aus, saat));
  },
  'stille': function (m, pos, ben) {
    const d = this.herdZahl(arg(pos, ben, 0, 'dauer'), 'stille', 'dauer');
    return this.klangNeu(this.klangKern(false).e.stille(d));
  },
  'noten': function (m, pos, ben) {
    const t = this.klangText(arg(pos, ben, 0, 'text'), 'noten', 'text');
    const tempo = this.herdZahl(arg(pos, ben, 1, 'tempo'), 'noten', 'tempo', 120);
    const w = this.klangText(arg(pos, ben, 2, 'welle'), 'noten', 'welle', 'rechteck');
    const laut = this.herdZahl(arg(pos, ben, 3, 'lautstaerke'), 'noten', 'lautstaerke', 0.3);
    const k = this.klangKern(false), [p1, l1, p2, l2] = k.texte(t, w);
    return this.klangNeu(k.e.noten(p1, l1, tempo, p2, l2, laut));
  }
});

// Klang: formen (jeweils ein neuer Klang), abfragen, spielen
const KLANG_M = klangTab({
  'huelle': function (k, pos, ben) {
    const an = this.herdZahl(arg(pos, ben, 0, 'anschlag'), 'huelle', 'anschlag', 0);
    const ab = this.herdZahl(arg(pos, ben, 1, 'abfall'), 'huelle', 'abfall', 0);
    const ha = this.herdZahl(arg(pos, ben, 2, 'halten'), 'huelle', 'halten', 1);
    const aus = this.herdZahl(arg(pos, ben, 3, 'ausklang'), 'huelle', 'ausklang', 0);
    return this.klangNeu(this.kk.e.huelle(k.id, an, ab, ha, aus));
  },
  'tiefpass': function (k, pos, ben) {
    const fr = this.herdZahl(arg(pos, ben, 0, 'frequenz'), 'tiefpass', 'frequenz');
    const q = this.herdZahl(arg(pos, ben, 1, 'guete'), 'tiefpass', 'guete', 0.707);
    return this.klangNeu(this.kk.e.tiefpass(k.id, fr, q));
  },
  'hochpass': function (k, pos, ben) {
    const fr = this.herdZahl(arg(pos, ben, 0, 'frequenz'), 'hochpass', 'frequenz');
    const q = this.herdZahl(arg(pos, ben, 1, 'guete'), 'hochpass', 'guete', 0.707);
    return this.klangNeu(this.kk.e.hochpass(k.id, fr, q));
  },
  'verstaerke': function (k, pos, ben) {
    const f = this.herdZahl(arg(pos, ben, 0, 'faktor'), 'verstaerke', 'faktor');
    return this.klangNeu(this.kk.e.verstaerke(k.id, f));
  },
  'mische': function (k, pos, ben) {
    const b = this.klangArg(arg(pos, ben, 0, 'anderer'), 'mische', 'anderer');
    const ab = this.herdZahl(arg(pos, ben, 1, 'ab'), 'mische', 'ab', 0);
    return this.klangNeu(this.kk.e.mische(k.id, b.id, ab));
  },
  'dann': function (k, pos, ben) {
    const b = this.klangArg(arg(pos, ben, 0, 'anderer'), 'dann', 'anderer');
    return this.klangNeu(this.kk.e.dann(k.id, b.id));
  },
  'wiederhole': function (k, pos, ben) {
    const n = this.herdZahl(arg(pos, ben, 0, 'n'), 'wiederhole', 'n');
    return this.klangNeu(this.kk.e.wiederhole(k.id, n));
  },
  'nahtlos': function (k, pos, ben) {
    const u = this.herdZahl(arg(pos, ben, 0, 'ueberblendung'), 'nahtlos', 'ueberblendung', 0.05);
    return this.klangNeu(this.kk.e.nahtlos(k.id, u));
  },
  'dauer': function (k) { return k.dauer; },
  'id': function (k) { return k.id; },
  'spiele': function (k, pos, ben) { return this.klangSpiele(k, pos, ben); },
  'alsText': function (k) { return this.text(k); }
});

// Spur: steuern (Setter verkettbar), abfragen
const KLANG_SPUR_M = klangTab({
  'stoppe': function (s) { this.klangStoppe(s); return s; },
  'laeuft': function (s) { return this.klangLaeuft(s); },
  'lautstaerke': function (s) { return s.laut; },
  'setzeLautstaerke': function (s, pos, ben) {
    s.laut = this.klangBereich('setzeLautstaerke', 'eine Lautstärke', this.herdZahl(arg(pos, ben, 0, 'v'), 'setzeLautstaerke', 'v'), 0, 2);
    this.klangSetzeEreignis(s);
    return s;
  },
  'tonhoehe': function (s) { return s.ton; },
  'setzeTonhoehe': function (s, pos, ben) {
    const t = this.klangBereich('setzeTonhoehe', 'eine Tonhöhe', this.herdZahl(arg(pos, ben, 0, 't'), 'setzeTonhoehe', 't'), 0.125, 8);
    this.klangTonhoehe(s, t);
    this.klangSetzeEreignis(s);
    return s;
  },
  'panorama': function (s) { return s.pan; },
  'setzePanorama': function (s, pos, ben) {
    s.pan = this.klangBereich('setzePanorama', 'ein Panorama', this.herdZahl(arg(pos, ben, 0, 'p'), 'setzePanorama', 'p'), -1, 1);
    this.klangSetzeEreignis(s);
    return s;
  },
  // räumlich ab jetzt: Lage in Welt-Koordinaten (Hörer = Kamera des Herds)
  'setzeLage': function (s, pos, ben) {
    const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'setzeLage', 'x');
    const y = this.herdZahl(arg(pos, ben, 1, 'y'), 'setzeLage', 'y');
    const z = this.herdZahl(arg(pos, ben, 2, 'z'), 'setzeLage', 'z', 0);
    s.lage = [x, y, z];
    this.klangSetzeEreignis(s);
    return s;
  },
  'reichweite': function (s) { return s.reichweite; },
  'setzeReichweite': function (s, pos, ben) {
    s.reichweite = this.klangBereich('setzeReichweite', 'eine Reichweite', this.herdZahl(arg(pos, ben, 0, 'r'), 'setzeReichweite', 'r'), 1, 10000);
    this.klangSetzeEreignis(s);
    return s;
  },
  'klang': function (s) { return s.klang; },
  'beimEnde': function (s, pos, ben) {
    const f = arg(pos, ben, 0, 'fn');
    this.klangBeimEnde(s, f === undefined ? null : f);
    return s;
  },
  'id': function (s) { return s.nr; },
  'alsText': function (s) { return this.text(s); }
});
TABELLEN.set(KlangObj, KLANG_M);
TABELLEN.set(KlangSpur, KLANG_SPUR_M);
