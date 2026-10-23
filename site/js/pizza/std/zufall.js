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
