// pizza-Interpreter · Standardbibliothek: Spiegel
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

const SPIEGEL_M = tabelle({
  'felder': function (m, pos) {
    const o = pos[0];
    if (o === null || o === undefined) throw this.leer();
    if (!(o instanceof Obj)) throw this.ananas('TypAnanas', 'Spiegel.felder braucht ein Objekt, nicht ' + this.darstellung(o) + '.');
    if (o.zugeklappt) throw this.ananas('ZugeklapptAnanas', 'Die Calzone ist zu. Nutze aufklappen().');
    const r = new Map();
    for (const [k, v] of o.felder) r.set(k, v.w);
    return r;
  }
});
