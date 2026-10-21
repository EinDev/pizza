'use strict';
/*
 * Grammatikbasierter Generator für GÜLTIGE pizza-Programme mit garantierter Terminierung.
 *
 * - Typisierte Umgebung (Name → Typ), damit Arithmetik/Zuweisungen typkorrekt sind
 *   (salami bleibt ganzzahlig: nur + - * %, abs, max/min, länge, ganz(), runden()).
 * - Schleifen nur mit Literal-Grenzen (≤ 6) bzw. Zähler; Rekursion nur mit fallendem Parameter (≤ 8).
 * - Pro Programm ein Schrittlimit als Sicherheitsnetz (P0002 wird dann ebenfalls verglichen).
 * - Funktionen/Lambdas/Closures, Klassen mit Feldern/Methoden/Vererbung/alsText, Bleche, Speisekarten,
 *   Texte (Unicode/Escapes), Pizza-Literale, Dauer, probier/verbrannt/rand, wirf, Ofen, Lieferung, Teig,
 *   wähle (Anweisung und Ausdruck), optional Bestellannahme (EINGABE.md) und selten Hawaii.
 */
const { Zufall } = require('./zufall');

const S = 'salami', F = 'funghi', T = 'margherita', D = 'diavolo', B = 'Blech<salami>', P = 'Pizza', K = 'Speisekarte<margherita, salami>', Z = 'Dauer', L = 'Rezept<salami>';

const FREIE_BELAEGE = ['Salami', 'Schinken', 'Pilze', 'Oliven', 'Zwiebeln', 'Paprika', 'Chili', 'Peperoni', 'Thunfisch', 'Sardellen', 'Artischocken', 'Spinat', 'Ei', 'Mais', 'Knoblauch', 'Kapern'];
const NACH_TOMATE = ['Käse', 'Parmesan', 'Gorgonzola'];
const TEXTE = ['', 'a', 'Pizza', 'Käse', 'ß', 'Grüße', '🍕', 'x y', 'a\\nb', 'Tab\\tEnde', 'Zitat \\"q\\"', 'Back\\\\slash', 'ÄÖÜ', 'pizza', 'PiZZa', '0', '42', ' rand '];
const S_LIT = [[30, () => null], [3, () => '2147483647'], [2, () => '46341'], [2, () => '1000000007'], [1, () => '2147483648'], [1, () => '1_000_000'], [1, () => '9007199254740993']];
const F_LIT = ['0.1', '0.2', '0.5', '2.5', '1.005', '3.14159', '0.000001', '1234.5678', '0.3', '7.25', '99.995', '1.5', '0.125'];
const ANANAS = ['StreitAnanas', 'RechenAnanas', 'LieferAnanas', 'VerbranntAnanas', 'LaufzeitAnanas', 'KeinStückAnanas', 'FuzzAnanas', 'FuzzUnterAnanas'];
const FANG = ['StreitAnanas', 'LaufzeitAnanas', 'GeprüfteAnanas', 'Ananas', 'FuzzAnanas', 'RechenAnanas', 'TypAnanas', 'KeinStückAnanas'];

class Gen {
  constructor(seed, opt = {}) {
    this.z = new Zufall(seed);
    this.opt = opt;
    this.zeilen = [];
    this.ind = 0;
    this.n = 0;
    this.scopes = [[]];
    this.schleife = 0;       // Schleifentiefe (für abbrechen/weiter)
    this.tiefe = 0;          // Block-Verschachtelung
    this.anw = 0;            // erzeugte Anweisungen
    this.maxAnw = opt.maxAnweisungen || 45;
    this.funktionen = [];    // { name, params: [typ], ret }
    this.klassen = [];       // { name, basis }
    this.inOfen = false;
    this.probierTiefe = 0;
    this.inFunktion = null;  // Rückgabetyp
    this.eingabe = !!opt.eingabe;
    this.hawaii = this.z.chance(opt.hawaiiChance != null ? opt.hawaiiChance : 0.03);
    this.hawaiiGesetzt = false;
  }

  // ------------------------------------------------------------- Ausgabe
  zeile(t) { this.zeilen.push('    '.repeat(this.ind) + t); }
  neu(p) { return p + (this.n++); }
  vars(typ) { const out = []; for (const s of this.scopes) for (const v of s) if (v.typ === typ) out.push(v); return out; }
  schreibbar(typ) { return this.vars(typ).filter(v => !v.nurLesen); }
  dekl(name, typ, extra = {}) { this.scopes[this.scopes.length - 1].push(Object.assign({ name, typ }, extra)); }
  block(kopf, fn, ende = '}') {
    this.zeile(kopf + ' {');
    this.ind++; this.tiefe++; this.scopes.push([]);
    fn();
    this.scopes.pop(); this.tiefe--; this.ind--;
    this.zeile(ende);
  }

  // ------------------------------------------------------------- Ausdrücke
  sLit() {
    const z = this.z;
    const f = z.gewichtet(S_LIT)();
    return f !== null ? f : String(z.chance(0.8) ? z.int(0, 12) : z.int(13, 999));
  }
  fLit() { return this.z.wahl(F_LIT); }
  tLit() { return '"' + this.z.wahl(TEXTE) + '"'; }

  ausdruck(typ, d = 0) {
    switch (typ) {
      case S: return this.sA(d);
      case F: return this.fA(d);
      case T: return this.tA(d);
      case D: return this.dA(d);
      case B: return this.bA(d);
      case P: return this.pA(d);
      case Z: return this.zA(d);
      default: return 'karton';
    }
  }

  varOder(typ, sonst) { const v = this.vars(typ); return v.length && this.z.chance(0.6) ? this.z.wahl(v).name : sonst(); }

  sA(d) {
    const z = this.z;
    if (d > 3) return this.varOder(S, () => this.sLit());
    const o = [
      [6, () => this.sLit()],
      [8, () => this.varOder(S, () => this.sLit())],
      [3, () => (z.chance(0.5) ? '-' : '') + this.sLit()],
      [6, () => '(' + this.sA(d + 1) + ' ' + z.wahl(['+', '-', '*']) + ' ' + this.sA(d + 1) + ')'],
      [2, () => '(' + this.sA(d + 1) + ' % ' + z.int(1, 7) + ')'],
      [1, () => 'Mathe.abs(' + this.sA(d + 1) + ')'],
      [1, () => 'Mathe.' + z.wahl(['max', 'min']) + '(' + this.sA(d + 1) + ', ' + this.sA(d + 1) + ')'],
      [1, () => 'Mathe.runden(' + this.fA(d + 1) + ')'],
      [1, () => 'Mathe.' + z.wahl(['boden', 'decke']) + '(' + this.fA(d + 1) + ')'],
      [1, () => '(' + this.fA(d + 1) + ').ganz()'],
      [1, () => '(' + this.fA(d + 1) + ').runden()'],
      [2, () => '(' + this.tA(d + 1) + ').länge()'],
      [2, () => '(' + this.bA(d + 1) + ').länge()'],
      [1, () => '(' + this.bA(d + 1) + ').summe()'],
      [1, () => '(' + this.pA(d + 1) + ').anzahlBeläge()'],
      [2, () => '(' + this.dA(d + 1) + ' ? ' + this.sA(d + 1) + ' : ' + this.sA(d + 1) + ')'],
      [1, () => 'Zufall.zahl(' + z.int(-5, 5) + ', ' + z.int(5, 20) + ')'],
      [1, () => this.z.chance(0.5) ? 'Uhr.jetzt().inMs()' : 'Mathe.runden((' + this.zA(d + 1) + ').inMs())'],
      [2, () => { const k = this.vars(K); return k.length ? z.wahl(k).name + '.länge()' : this.sLit(); }],
      [3, () => this.aufruf(S, d)],
      [2, () => { const l = this.vars(L); return l.length ? z.wahl(l).name + '(' + this.sA(d + 1) + ')' : this.sLit(); }],
      [2, () => this.objektAusdruck(S, d)],
      [1, () => 'wähle (' + this.sA(d + 1) + ' % 3) { fall 0 -> ' + this.sA(d + 1) + '; fall 1, -1 -> ' + this.sA(d + 1) + '; standard -> ' + this.sA(d + 1) + '; }'],
    ];
    if (this.eingabe) o.push([1, () => '(Bestellannahme.hatMehr() ? 1 : 0)']);
    return z.gewichtet(o)();
  }

  fA(d) {
    const z = this.z;
    if (d > 3) return this.varOder(F, () => this.fLit());
    return z.gewichtet([
      [5, () => this.fLit()],
      [6, () => this.varOder(F, () => this.fLit())],
      [3, () => this.sA(d + 1)],
      [5, () => '(' + this.fA(d + 1) + ' ' + z.wahl(['+', '-', '*']) + ' ' + this.fA(d + 1) + ')'],
      [3, () => '(' + this.fA(d + 1) + ' / ' + z.wahl(['3', '7', '0.1', '2', '1000', '-4', '(Mathe.abs(' + this.sA(d + 1) + ') + 1)']) + ')'],
      [1, () => '(' + this.fA(d + 1) + ' % ' + z.wahl(['2', '0.5', '3']) + ')'],
      [1, () => 'Mathe.wurzel(Mathe.abs(' + this.fA(d + 1) + '))'],
      [1, () => '(' + this.fA(d + 1) + ').runden(' + z.int(0, 4) + ')'],
      [1, () => 'Mathe.PI'],
      [2, () => '(' + this.pA(d + 1) + ').preis()'],
      [1, () => '(' + this.dA(d + 1) + ' ? ' + this.fA(d + 1) + ' : ' + this.fA(d + 1) + ')'],
      [1, () => '(' + this.zA(d + 1) + ').inSekunden()'],
    ])();
  }

  tA(d) {
    const z = this.z;
    if (d > 3) return this.varOder(T, () => this.tLit());
    return z.gewichtet([
      [5, () => this.tLit()],
      [6, () => this.varOder(T, () => this.tLit())],
      [5, () => '(' + this.tA(d + 1) + ' + ' + this.ausdruck(z.wahl([S, F, T, D, B, P, Z]), d + 1) + ')'],
      [2, () => '(' + this.sA(d + 1) + ' + ' + this.tA(d + 1) + ')'],
      [2, () => '(' + this.tA(d + 1) + ').' + z.wahl(['groß()', 'klein()', 'trimme()', 'alsText()'])],
      [1, () => '(' + this.tA(d + 1) + ').ersetze(' + this.tLit() + ', ' + this.tLit() + ')'],
      [1, () => '(' + this.tA(d + 1) + ').wiederhole(' + z.int(0, 3) + ')'],
      [2, () => '(' + this.fA(d + 1) + ').euro()'],
      [2, () => '(' + this.fA(d + 1) + ').alsText()'],
      [1, () => '(' + this.bA(d + 1) + ').verbinde(' + this.tLit() + ')'],
      [1, () => '(' + this.pA(d + 1) + ').alsText()'],
      [1, () => '(' + this.pA(d + 1) + ').beläge().verbinde("+")'],
      [1, () => '("abc" + ' + this.tA(d + 1) + ').zeichen(' + z.int(1, 3) + ')'],
      [1, () => '(' + this.tA(d + 1) + ').zerlege(' + z.wahl(['" "', '"a"', '","']) + ').verbinde("|")'],
      [2, () => this.aufruf(T, d)],
      [2, () => this.objektAusdruck(T, d)],
      [1, () => 'wähle (' + this.sA(d + 1) + ') { fall 0 -> "null"; fall 1, 2 -> ' + this.tA(d + 1) + '; standard -> "viel"; }'],
      [1, () => '(' + this.zA(d + 1) + ').alsText()'],
    ])();
  }

  dA(d) {
    const z = this.z;
    if (d > 3) return this.varOder(D, () => z.wahl(['ja', 'nein']));
    return z.gewichtet([
      [2, () => z.wahl(['ja', 'nein'])],
      [4, () => this.varOder(D, () => z.wahl(['ja', 'nein']))],
      [6, () => '(' + this.sA(d + 1) + ' ' + z.wahl(['<', '<=', '>', '>=', '==', '!=']) + ' ' + this.sA(d + 1) + ')'],
      [3, () => '(' + this.fA(d + 1) + ' ' + z.wahl(['<', '>', '==', '!=']) + ' ' + this.fA(d + 1) + ')'],
      [2, () => '(' + this.tA(d + 1) + ' ' + z.wahl(['==', '!=', '<', '>']) + ' ' + this.tA(d + 1) + ')'],
      [3, () => '(' + this.dA(d + 1) + ' ' + z.wahl(['&&', '||']) + ' ' + this.dA(d + 1) + ')'],
      [2, () => '!' + this.dA(d + 1)],
      [1, () => '(' + this.tA(d + 1) + ').enthält(' + this.tLit() + ')'],
      [1, () => '(' + this.tA(d + 1) + ').beginntMit(' + this.tLit() + ')'],
      [1, () => '(' + this.bA(d + 1) + ').enthält(' + this.sA(d + 1) + ')'],
      [1, () => '(' + this.bA(d + 1) + ').istLeer()'],
      [1, () => '(' + this.pA(d + 1) + ').hat(' + z.wahl(FREIE_BELAEGE.concat(['Tomate', 'Mozzarella'])) + ')'],
      [1, () => '(' + this.pA(d + 1) + ' == ' + this.pA(d + 1) + ')'],
      [1, () => '(' + this.zA(d + 1) + ' ' + z.wahl(['<', '>', '==']) + ' ' + this.zA(d + 1) + ')'],
      [1, () => { const k = this.vars(K); return k.length ? z.wahl(k).name + '.hat(' + this.tA(d + 1) + ')' : 'ja'; }],
    ])();
  }

  bA(d) {
    const z = this.z;
    if (d > 3) return this.varOder(B, () => '[' + this.sLit() + ']');
    return z.gewichtet([
      [4, () => this.varOder(B, () => '[1, 2, 3]')],
      [3, () => '[' + Array.from({ length: z.int(0, 4) }, () => this.sA(d + 1)).join(', ') + ']'],
      [2, () => '[' + z.int(-3, 3) + ' .. ' + z.int(-3, 6) + ']'],
      [2, () => '(' + this.bA(d + 1) + ').belege(x -> ' + this.lambdaKoerper('x', d + 1) + ')'],
      [2, () => '(' + this.bA(d + 1) + ').filtere(x -> ' + z.wahl(['x > ', 'x < ', 'x % 2 == ', 'x != ']) + z.int(-1, 4) + ')'],
      [1, () => '(' + this.bA(d + 1) + ').sortiere()'],
      [1, () => '(' + this.bA(d + 1) + ').sortiere((a, b) -> b - a)'],
      [1, () => '(' + this.bA(d + 1) + ').umdrehen()'],
      [1, () => this.aufruf(B, d)],
    ])();
  }

  pizzaLit() {
    const z = this.z;
    const lagen = [];
    if (z.chance(0.8)) lagen.push('Tomate');
    if (lagen.length && z.chance(0.5)) lagen.push('Mozzarella');
    if (lagen.includes('Mozzarella') && z.chance(0.3)) lagen.push(z.wahl(['Basilikum', 'Rucola']));
    if (lagen.length && z.chance(0.3)) lagen.push(z.wahl(NACH_TOMATE));
    const n = z.int(0, 3);
    for (let i = 0; i < n; i++) lagen.push(z.wahl(FREIE_BELAEGE));
    return '((' + lagen.join(', ') + '))';
  }

  pA(d) {
    const z = this.z;
    if (d > 3) return this.pizzaLit();
    return z.gewichtet([
      [4, () => this.pizzaLit()],
      [3, () => { const v = this.vars(P); return v.length ? '(' + z.wahl(v).name + ' + ' + z.wahl(FREIE_BELAEGE) + ')' : this.pizzaLit(); }],
      [2, () => '(' + this.pA(d + 1) + ' ' + z.wahl(['+', '-']) + ' ' + z.wahl(FREIE_BELAEGE) + ')'],
      [1, () => 'neu Pizza()'],
      [1, () => this.aufruf(P, d)],
    ])();
  }

  zA(d) {
    const z = this.z;
    const lit = () => z.wahl(['0ms', '1ms', '999ms', '1s', '1.5s', '90s', '59min', '1h', '25h', '3d', '500ms', '0.5s']);
    if (d > 3) return this.varOder(Z, lit);
    return z.gewichtet([
      [4, lit],
      [3, () => this.varOder(Z, lit)],
      [2, () => '(' + this.zA(d + 1) + ' ' + z.wahl(['+', '-']) + ' ' + this.zA(d + 1) + ')'],
      [2, () => '(' + this.zA(d + 1) + ' * ' + z.wahl(['2', '3', '0.5', '1.5', '7']) + ')'],
      [1, () => '(' + this.zA(d + 1) + ' / ' + z.wahl(['2', '3', '7', '1000']) + ')'],
      [1, () => 'Uhr.jetzt()'],
    ])();
  }

  lambdaKoerper(x, d) {
    const z = this.z;
    return z.wahl([
      x + ' * ' + z.int(-3, 3),
      x + ' + ' + this.sA(d + 2),
      '(' + x + ' % 3 == 0 ? ' + x + ' : -' + x + ')',
      'Mathe.max(' + x + ', ' + this.sA(d + 2) + ')',
    ]);
  }

  aufruf(typ, d) {
    const kand = this.funktionen.filter(f => f.ret === typ);
    if (!kand.length || d > 2) return this.ausdruck(typ, 4);
    const f = this.z.wahl(kand);
    const args = f.params.map((pt, i) => (f.rekursiv && i === 0) ? String(this.z.int(0, 8)) : this.ausdruck(pt, d + 1));
    return f.name + '(' + args.join(', ') + ')';
  }

  objektAusdruck(typ, d) {
    const objs = [];
    for (const k of this.klassen) for (const v of this.vars(k.name)) objs.push(v);
    if (!objs.length) return this.ausdruck(typ, 4);
    const o = this.z.wahl(objs).name;
    if (typ === S) return this.z.chance(0.5) ? o + '.wert' : o + '.rechne(' + this.sA(d + 1) + ')';
    if (typ === T) return this.z.chance(0.5) ? o + '.alsText()' : '("" + ' + o + ')';
    return this.ausdruck(typ, 4);
  }

  // ------------------------------------------------------------- Anweisungen
  anweisungen(n) {
    for (let i = 0; i < n && this.anw < this.maxAnw; i++) this.anweisung();
  }

  anweisung() {
    this.anw++;
    const z = this.z;
    const tief = this.tiefe >= 3;
    const o = [
      [8, () => this.deklaration()],
      [6, () => this.zuweisung()],
      [7, () => this.zeile('Bote.sage((' + this.ausdruck(z.wahl([S, F, T, D, B, P, Z]), 0) + '));')],
      [tief ? 0 : 4, () => this.falls()],
      [tief ? 0 : 3, () => this.fuerZaehler()],
      [tief ? 0 : 2, () => this.fuerJedes()],
      [tief ? 0 : 2, () => this.solange()],
      [tief ? 0 : 2, () => this.waehle()],
      [tief ? 0 : 3, () => this.probier()],
      [this.inOfen ? 0 : 1, () => this.ofen()],
      [this.inOfen ? 0 : 1, () => this.lieferung()],
      [1, () => this.teig()],
      [this.probierTiefe > 0 ? 3 : 0.4, () => this.wirf()],
      [this.schleife > 0 ? 2 : 0, () => this.zeile('falls (' + this.dA(1) + ') { ' + z.wahl(['abbrechen;', 'weiter;']) + ' }')],
      [this.inFunktion && !this.inOfen ? 1 : 0, () => this.zeile('falls (' + this.dA(1) + ') { serviere ((' + this.ausdruck(this.inFunktion, 1) + ')); }')],
      [1, () => this.blechAnweisung()],
      [1, () => this.karteAnweisung()],
      [1, () => this.objektAnweisung()],
      [this.eingabe ? 4 : 0, () => this.eingabeAnweisung()],
      [this.hawaii && !this.hawaiiGesetzt ? 1 : 0, () => this.hawaiiAnweisung()],
    ];
    z.gewichtet(o)();
  }

  deklaration() {
    const z = this.z;
    const typ = z.wahl([S, S, F, T, D, B, P, Z, K, L, ...this.klassen.map(k => k.name)]);
    const name = this.neu('v');
    if (typ === K) {
      this.zeile(K + ' ' + name + ' = neu ' + K + '();');
    } else if (typ === L) {
      this.zeile(L + ' ' + name + ' = (salami x) -> ' + this.lambdaKoerper('x', 1) + ';');
    } else if (this.klassen.some(k => k.name === typ)) {
      const k = z.wahl(this.klassen.filter(k => k.name === typ || k.basis === typ));
      this.zeile(typ + ' ' + name + ' = neu ' + k.name + '(' + this.sA(1) + ');');
    } else {
      this.zeile(typ + ' ' + name + ' = ' + this.ausdruck(typ, 0) + ';');
    }
    this.dekl(name, typ);
  }

  zuweisung() {
    const z = this.z;
    const typ = z.wahl([S, S, F, T, P, B, Z]);
    const v = this.schreibbar(typ);
    if (!v.length) return this.deklaration();
    const name = z.wahl(v).name;
    if (typ === S && z.chance(0.3)) return this.zeile(name + z.wahl(['++;', '--;', ' += ' + this.sA(1) + ';', ' -= ' + this.sA(1) + ';', ' *= ' + z.int(-2, 3) + ';']));
    if (typ === F && z.chance(0.3)) return this.zeile(name + z.wahl([' += ', ' -= ', ' *= ', ' /= ']) + z.wahl(['2', '0.5', '3', '-1.5']) + ';');
    if (typ === T && z.chance(0.4)) return this.zeile(name + ' += ' + this.ausdruck(z.wahl([S, T, F]), 1) + ';');
    this.zeile(name + ' = ' + this.ausdruck(typ, 0) + ';');
  }

  falls() {
    this.block('falls (' + this.dA(0) + ')', () => this.anweisungen(this.z.int(1, 3)), this.z.chance(0.5) ? '}' : null);
    if (this.zeilen[this.zeilen.length - 1] === '    '.repeat(this.ind) + 'null') {
      this.zeilen.pop();
      const rest = this.z.chance(0.4) ? ' sonst falls (' + this.dA(0) + ')' : ' sonst';
      this.block('}' + rest, () => this.anweisungen(this.z.int(1, 2)));
    }
  }

  fuerZaehler() {
    const i = this.neu('i');
    const k = this.z.int(0, 6);
    this.schleife++;
    this.block('für (salami ' + i + ' = 0; ' + i + ' < ' + k + '; ' + i + '++)', () => {
      this.dekl(i, S, { nurLesen: true });
      this.anweisungen(this.z.int(1, 3));
    });
    this.schleife--;
  }

  fuerJedes() {
    const z = this.z;
    const x = this.neu('e');
    this.schleife++;
    if (z.chance(0.3)) {
      this.block('für (margherita ' + x + ' : ' + this.tA(2) + ')', () => { this.dekl(x, T, { nurLesen: true }); this.anweisungen(z.int(1, 2)); });
    } else {
      // Bleche können innerhalb wachsen: Quelle ist ein frischer Ausdruck mit begrenzter Länge.
      const quelle = z.chance(0.5) ? '[' + z.int(-2, 2) + ' .. ' + z.int(0, 5) + ']' : '[' + Array.from({ length: z.int(0, 4) }, () => this.sA(2)).join(', ') + ']';
      this.block('für (salami ' + x + ' : ' + quelle + ')', () => { this.dekl(x, S, { nurLesen: true }); this.anweisungen(z.int(1, 3)); });
    }
    this.schleife--;
  }

  solange() {
    const w = this.neu('w');
    this.zeile('salami ' + w + ' = 0;');
    this.dekl(w, S, { nurLesen: true });
    this.schleife++;
    this.block('solange (' + w + ' < ' + this.z.int(0, 5) + (this.z.chance(0.3) ? ' && ' + this.dA(2) : '') + ')', () => {
      this.zeile(w + '++;');
      this.anweisungen(this.z.int(1, 3));
    });
    this.schleife--;
  }

  waehle() {
    const z = this.z;
    this.block('wähle (' + this.sA(1) + ' % 4)', () => {
      this.zeile('fall 0 -> Bote.sage((' + this.tA(1) + '));');
      this.block('fall 1, 2 ->', () => this.anweisungen(z.int(1, 2)));
      if (z.chance(0.6)) this.zeile('standard -> Bote.sage(("standard " + ' + this.sA(1) + '));');
    });
  }

  probier() {
    const z = this.z;
    this.probierTiefe++;
    this.block('probier', () => this.anweisungen(z.int(1, 4)), null);
    this.probierTiefe--;
    this.zeilen.pop();
    const faenger = z.int(0, 2);
    let kopf = '}';
    for (let i = 0; i < faenger; i++) {
      const a = this.neu('a');
      const typ = z.chance(0.75) ? z.wahl(FANG) + ' ' : '';
      this.block(kopf + ' verbrannt (' + typ + a + ')', () => {
        this.zeile('Bote.sage(("gefangen ' + a + ': " + ' + a + '));');
        if (z.chance(0.3)) this.zeile('Bote.sage((' + a + '.typ() + " " + ' + a + '.nachricht()));');
        if (z.chance(0.15)) this.zeile('falls (' + this.dA(2) + ') { wirf ' + a + '; }');
      }, null);
      this.zeilen.pop();
      kopf = '}';
    }
    if (faenger === 0 || z.chance(0.4)) {
      this.block(kopf + ' rand', () => this.zeile('Bote.sage(("rand ' + this.n + '"));'), null);
      this.zeilen.pop();
    }
    this.zeile('}');
  }

  wirf() {
    const z = this.z;
    const a = z.wahl(ANANAS);
    const msg = z.chance(0.5) ? this.tLit() : '"m" + ' + this.sA(2);
    this.zeile('falls (' + this.dA(1) + ') { wirf neu ' + a + '(' + msg + '); }');
  }

  ofen() {
    const z = this.z;
    const name = this.neu('o');
    const temp = z.chance(0.1) ? z.wahl([486, 500]) : z.wahl([100, 250, 300, 450, 485]);
    const zeit = z.wahl(['1ms', '5ms', '20ms', '50ms', '200ms', '1s', '60s']);
    const vorher = this.inOfen, vorherSchleife = this.schleife;
    this.inOfen = true;
    this.schleife = 0;   // abbrechen/weiter dürfen den Ofen nicht verlassen
    this.zeile('salami ' + name + ' = ofen(temperatur: ' + temp + ', zeit: ' + zeit + ') {');
    this.ind++; this.tiefe++; this.scopes.push([]);
    const s = this.neu('s');
    this.zeile('salami ' + s + ' = 0;');
    this.dekl(s, S, { nurLesen: true });
    const k = z.int(0, 30);
    this.zeile('für (salami q = 0; q < ' + k + '; q++) { ' + s + ' += q; zwischenstand((' + s + ')); }');
    this.anweisungen(z.int(0, 2));
    this.zeile('serviere ((' + s + '));');
    this.scopes.pop(); this.tiefe--; this.ind--;
    let ende = '}';
    if (z.chance(0.7)) ende += ' roh (r) { Bote.sage(("roh " + r.verbrauchteZeit())); serviere ((r.teilergebnis() == karton ? -1 : r.teilergebnis())); }';
    if (z.chance(0.6)) ende += ' verbrannt (' + (z.chance(0.5) ? 'VerbranntAnanas ' : '') + 'v) { Bote.sage((v.nachricht())); serviere ((-2)); }';
    this.zeile(ende + ';');
    this.inOfen = vorher;
    this.schleife = vorherSchleife;
    this.dekl(name, S);
    this.zeile('Bote.sage((' + name + '));');
  }

  lieferung() {
    const z = this.z;
    const name = this.neu('l');
    const k = z.int(0, 40);
    const wirft = z.chance(0.2);
    const koerper = wirft
      ? '() -> { wirf neu StreitAnanas("unterwegs"); }'
      : '() -> { salami c = 0; solange (c < ' + k + ') { c++; } serviere ((c)); }';
    if (!wirft && z.chance(0.25)) {
      this.zeile('bestelle(' + koerper + ').trinkgeld(' + z.int(0, 5) + ').wennDa(x -> Bote.sage(("wennDa " + x)));');
      return;
    }
    this.zeile('Zustellung<salami> ' + name + ' = bestelle(' + koerper + ').trinkgeld(' + z.int(0, 10) + ').warte(max: ' + z.wahl(['5ms', '20ms', '50ms', '100ms', '1s']) + ');');
    this.zeile('probier { Bote.sage((' + name + '.pünktlich() + " " + ' + name + '.oderGratis((-1)))); } verbrannt (StreitAnanas a) { Bote.sage((a)); }');
  }

  teig() {
    const name = this.neu('t');
    this.zeile('Teig<salami> ' + name + ' = teig(() -> (' + this.sA(2) + '));');
    if (this.z.chance(0.6)) this.zeile(name + '.gehenlassen();');
    this.zeile('Bote.sage((' + name + '.backen() + " " + ' + name + '.istAufgegangen()));');
  }

  blechAnweisung() {
    const v = this.schreibbar(B);
    if (!v.length) return this.deklaration();
    const b = this.z.wahl(v).name;
    this.zeile(this.z.wahl([
      b + '.hinzu(' + this.sA(1) + ');',
      'falls (' + b + '.länge() > 0) { ' + b + '.entferne(1); }',
      'falls (' + b + '.länge() > 0) { ' + b + '.setze(' + b + '.länge(), ' + this.sA(1) + '); }',
      'Bote.sage((' + b + '.zusammenklappen((a, c) -> a + c, 0)));',
      'falls (!' + b + '.istLeer()) { Bote.sage((' + b + '.erstes() + " " + ' + b + '.letztes() + " " + ' + b + '.stück(1))); }',
      'Bote.sage((' + b + '.schneide(' + this.z.int(1, 4) + ')));',
    ]));
  }

  karteAnweisung() {
    const v = this.vars(K);
    if (!v.length) return this.deklaration();
    const k = this.z.wahl(v).name;
    this.zeile(this.z.wahl([
      k + '.lege(' + this.tA(1) + ', ' + this.sA(1) + ');',
      k + '.entferne(' + this.tA(1) + ');',
      'Bote.sage((' + k + '));',
      'Bote.sage((' + k + '.schlüssel().verbinde(",") + " " + ' + k + '.werte()));',
      'für (margherita sk : ' + k + '.schlüssel()) { Bote.sage((sk + "=" + ' + k + '.hole(sk))); }',
    ]));
  }

  objektAnweisung() {
    const objs = [];
    for (const k of this.klassen) for (const v of this.vars(k.name)) objs.push(v);
    if (!objs.length) return this.deklaration();
    const o = this.z.wahl(objs).name;
    this.zeile(this.z.wahl([
      o + '.wert = ' + this.sA(1) + ';',
      o + '.wert += ' + this.sA(1) + ';',
      'Bote.sage((' + o + '));',
      'Bote.sage((' + o + '.rechne(' + this.sA(1) + ')));',
      o + '.name = ' + this.tA(1) + ';',
    ]));
  }

  eingabeAnweisung() {
    const z = this.z;
    const e = this.neu('ein');
    z.gewichtet([
      [3, () => {
        this.zeile('Wert ' + e + ' = Bestellannahme.lies();');
        this.zeile('falls (' + e + ' != karton) { Bote.sage(("[" + ' + e + ' + "] " + ' + e + '.länge())); } sonst { Bote.sage(("EOF")); }');
      }],
      [3, () => {
        this.zeile('probier { Wert ' + e + ' = Bestellannahme.liesZahl(); Bote.sage((' + e + ' == karton ? "EOF" : ' + e + ' + 1)); } verbrannt (TypAnanas ' + e + 'a) { Bote.sage((' + e + 'a.nachricht())); }');
      }],
      [2, () => {
        this.zeile('Wert ' + e + ' = Bestellannahme.frage((' + this.tA(2) + ' + "? "));');
        this.zeile('Bote.sage((' + e + '));');
      }],
      [1, () => this.zeile('probier { Bote.sage((Bestellannahme.frageZahl(("Zahl " + ' + this.sA(2) + ' + ": ")))); } verbrannt (TypAnanas ' + e + ') { Bote.sage((' + e + '.typ())); }')],
      [1, () => this.zeile('Bote.sage((Bestellannahme.hatMehr()));')],
      [2, () => this.zeile('Bote.schreibe((' + this.ausdruck(z.wahl([S, T, F, D]), 1) + '));')],
      [1, () => this.zeile('Bote.leeren();')],
      [1, () => this.zeile('solange (Bestellannahme.hatMehr()) { Wert ' + e + ' = Bestellannahme.lies(); falls (' + e + ' == "stopp") { abbrechen; } Bote.schreibe((' + e + ')); }')],
    ])();
  }

  hawaiiAnweisung() {
    this.hawaiiGesetzt = true;
    const z = this.z;
    const variante = z.wahl([
      'Pizza hw = ((Tomate)) + Ananas;',
      'hawaii hw = ' + this.sA(2) + ';',
      'Pizza hw = ((Tomate, Ananas));',
    ]);
    this.zeile('falls (' + this.dA(1) + ') { ' + variante + ' }');
  }

  // ------------------------------------------------------------- Deklarationen (oben)
  klassenErzeugen() {
    const z = this.z;
    const anzahl = z.int(0, 2);
    // eigene Ananas immer (für wirf/verbrannt)
    this.zeile('klasse FuzzAnanas erbt StreitAnanas { FuzzAnanas(margherita m) { unten(m); } }');
    this.zeile('klasse FuzzUnterAnanas erbt FuzzAnanas { FuzzUnterAnanas(margherita m) { unten("unter: " + m); } }');
    for (let i = 0; i < anzahl; i++) {
      const name = 'Klasse' + i;
      const basis = i > 0 && z.chance(0.6) ? 'Klasse' + (i - 1) : null;
      const alt = this.scopes; const altFn = this.inFunktion;
      this.scopes = [[]];
      this.block((z.chance(0.2) && !basis ? 'calzone ' : '') + 'klasse ' + name + (basis ? ' erbt ' + basis : ''), () => {
        if (!basis) {
          this.zeile('salami wert = ' + this.sLit() + ';');
          this.zeile('margherita name = ' + this.tLit() + ';');
          this.zeile('tiefkühl salami anzahl = 0;');
          this.block(name + '(salami w)', () => { this.zeile('wert = w;'); this.zeile(name + '.anzahl++;'); });
          this.block('salami rechne(salami x)', () => {
            this.dekl('x', S, { nurLesen: true });
            this.dekl('wert', S, { nurLesen: true });
            this.inFunktion = S;
            this.zeile('serviere ((' + this.sA(1) + ' + x * wert));');
            this.inFunktion = altFn;
          });
          if (z.chance(0.6)) this.zeile('margherita alsText() { serviere ((name + "#" + wert)); }');
        } else {
          this.block(name + '(salami w)', () => { this.zeile('unten(w * 2);'); if (z.chance(0.5)) this.zeile('name = "Unter" + w;'); });
          this.block('salami rechne(salami x)', () => {
            this.zeile('serviere ((unten.rechne(x) + ' + z.int(-3, 3) + '));');
          });
        }
      });
      this.scopes = alt;
      this.klassen.push({ name, basis });
    }
  }

  funktionenErzeugen() {
    const z = this.z;
    const anzahl = z.int(0, 3);
    for (let i = 0; i < anzahl; i++) {
      const ret = z.wahl([S, S, T, B, F, P]);
      const name = 'fn' + i;
      const rek = ret === S && z.chance(0.4);
      const params = rek ? [S, S] : Array.from({ length: z.int(0, 3) }, () => z.wahl([S, F, T, D]));
      const pnamen = params.map((_, j) => 'p' + j);
      const alt = this.scopes;
      this.scopes = [[]];
      this.inFunktion = ret;
      const altAnw = this.anw; this.anw = 0; const altMax = this.maxAnw; this.maxAnw = 6;
      this.block(ret + ' ' + name + '(' + params.map((t, j) => t + ' ' + pnamen[j]).join(', ') + ')', () => {
        params.forEach((t, j) => this.dekl(pnamen[j], t, { nurLesen: true }));
        if (rek) {
          this.zeile('falls (p0 <= 0) { serviere ((p1)); }');
          this.zeile('serviere ((' + name + '(p0 - 1, (p1 + ' + this.sA(2) + ') % 100000)));');
        } else {
          this.anweisungen(z.int(0, 4));
          this.zeile('serviere ((' + this.ausdruck(ret, 1) + '));');
        }
      });
      this.anw = altAnw; this.maxAnw = altMax;
      this.inFunktion = null;
      this.scopes = alt;
      this.funktionen.push({ name, params, ret, rekursiv: rek });
    }
  }

  programm() {
    this.zeile('// pizza-Fuzz-Programm');
    this.klassenErzeugen();
    this.funktionenErzeugen();
    this.anweisungen(this.maxAnw);
    // Endzustand beobachtbar machen
    const alle = [].concat(...this.scopes).filter(v => [S, F, T, D, B, Z].includes(v.typ)).slice(-4);
    for (const v of alle) this.zeile('Bote.sage(("' + v.name + ' = " + ' + v.name + '));');
    this.zeile('Bote.sage((Uhr.jetzt()));');
    if (this.z.chance(0.15)) {
      this.block('klasse FuzzHaupt', () => this.zeile('tiefkühl leer hauptgang(Blech<margherita> args) { Bote.sage(("hauptgang " + args.länge())); }'));
    }
    return this.zeilen.join('\n') + '\n';
  }
}

const EINGABE_ZEILEN = ['', '42', ' 7 ', '3,5', '-0', '1e3', 'abc', '12abc', 'Grüße 🍕', '🍍', 'stopp', '   ', '\t', 'ja', '9007199254740993', '0.1', '-2,25', '1.000,5', 'Ä', 'x'.repeat(300)];

/** Erzeugt { code, optionen } für Seed. opt.eingabe: Bestellannahme-Programme mit zufälliger Eingabe. */
function erzeuge(seed, opt = {}) {
  const g = new Gen(seed, opt);
  const code = g.programm();
  const optionen = { schrittLimit: opt.schrittLimit || 200000 };
  if (opt.eingabe) {
    const z = g.z;
    const n = z.chance(0.15) ? 0 : z.int(0, 12);   // 0 → sofort EOF
    optionen.eingabe = Array.from({ length: n }, () => z.wahl(EINGABE_ZEILEN));
  }
  if (g.z.chance(0.1)) optionen.args = ['a', 'ü', ''];
  return { code, optionen };
}

module.exports = { erzeuge, Gen };
