// pizza-Interpreter · Typprüfung, Textform, Vergleiche und Operatoren
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// Laufzeit: Typprüfung, Textform, Vergleiche & Operatoren
class LaufzeitTypen {
  // ---------- Typprüfung ----------
  pruefeTyp(typ, v, name) {
    if (typ === null || typ.feld) return;
    let was;
    switch (typ.name) {
      case 'salami':
        if (typeof v === 'number' && Number.isInteger(v)) return;
        was = typeof v === 'number' ? 'keine Ganzzahl' : 'keine Zahl';
        break;
      case 'funghi': if (typeof v === 'number') return; was = 'keine Zahl'; break;
      case 'margherita': if (typeof v === 'string' || v === null) return; was = 'kein Text'; break;
      case 'diavolo': if (typeof v === 'boolean') return; was = 'kein Wahrheitswert'; break;
      case 'hawaii': throw this.panik();
      case 'Dauer': if (v === null || v instanceof Dauer) return; was = 'keine Dauer'; break;
      case 'Vorratskammer':
        if (this.klassen.has(typ.name)) { const k = this.klassen.get(typ.name); if (v === null || this.instanzVon(v, k)) return; was = 'kein(e) ' + k.name; break; }
        if (v === null || v instanceof Kammer) return;
        was = 'keine Vorratskammer';
        break;
      case 'Zufall':
        if (v === null || v instanceof ZufallGen || this.klassen.has('Zufall')) return;
        was = 'kein Zufall';
        break;
      case 'Theke': case 'Zutat': case 'Schild': case 'Knopf': case 'Eingabe': case 'Haken': case 'Stapel': case 'Reihe':
      case 'Takt': case 'Fortschritt': case 'Abschnitt': case 'Tabelle': case 'Reiter': case 'Auswahl': case 'Tastatur': {
        if (this.klassen.has(typ.name) || v === null) {
          const k = this.klassen.get(typ.name);
          if (k === undefined || v === null || this.instanzVon(v, k)) return;
          was = 'kein(e) ' + k.name;
          break;
        }
        if (typ.name === 'Theke' ? v instanceof UiTheke : (v instanceof UiZutat && (typ.name === 'Zutat' || UI_ART_NAME[v.art] === typ.name))) return;
        was = 'kein(e) ' + typ.name;
        break;
      }
      case 'Herd': case 'Teil': case 'Form': case 'Bildchen': {
        if (this.klassen.has(typ.name) || v === null) {
          const k = this.klassen.get(typ.name);
          if (k === undefined || v === null || this.instanzVon(v, k)) return;
          was = 'kein(e) ' + k.name;
          break;
        }
        if (herdKlasseVon(v) === typ.name && !(v instanceof HerdKomp)) return;
        was = 'kein(e) ' + typ.name;
        break;
      }
      case 'Zettel': {
        // Theke v5 (K-116): eingebauter Typname wie Zutat; eigene Klasse Zettel hat Vorrang
        if (this.klassen.has('Zettel') || v === null) {
          const k = this.klassen.get('Zettel');
          if (k === undefined || v === null || this.instanzVon(v, k)) return;
          was = 'kein(e) ' + k.name;
          break;
        }
        if (v instanceof Zettel) return;
        was = 'kein(e) Zettel';
        break;
      }
      default: {
        const k = this.klassen.get(typ.name);
        if (k === undefined) {
          // Herd-Komponente (Schema): nur Komponenten dieser Art passen
          if (v === null || !(HERD_KOMP_NAMEN.has(typ.name) || (this.hk !== null && this.hk.schema.nachName.has(typ.name)))) return;
          if (v instanceof HerdKomp && v.art.name === typ.name) return;
          was = 'kein(e) ' + typ.name;
          break;
        }
        if (v === null || this.instanzVon(v, k)) return;
        was = 'kein(e) ' + k.name;
      }
    }
    throw this.ananas('TypAnanas', '\'' + name + '\' ist ' + typ.name + ', aber der Wert ' + this.darstellung(v) + ' ist ' + was + '.');
  }

  instanzVon(v, k) {
    if (k instanceof Klasse) {
      if (!(v instanceof Obj)) return false;
      for (let c = v.klasse; c; c = c.basis) if (c === k) return true;
      return false;
    }
    if (k instanceof EnumTyp) return v instanceof EnumWert && v.typ === k;
    if (k instanceof Rezeptur) {
      if (!(v instanceof Obj)) return false;
      for (let c = v.klasse; c; c = c.basis) for (const r of c.erfuellt) if (this.rezepturErbt(r, k)) return true;
      return false;
    }
    return false;
  }

  // ---------- Textform ----------
  text(v) {
    if (v === null || v === undefined) return 'karton';
    switch (typeof v) {
      case 'string': return v;
      case 'number': return zahlText(v);
      case 'boolean': return v ? 'ja' : 'nein';
    }
    if (Array.isArray(v)) return '[' + v.map(x => this.text(x)).join(', ') + ']';
    if (v instanceof Map) {
      const t = [];
      for (const [k, w] of v) t.push(this.text(k) + ': ' + this.text(w));
      return '{' + t.join(', ') + '}';
    }
    if (v instanceof Dauer) return dauerText(v.ms);
    if (v instanceof EnumWert) return v.name;
    if (v instanceof Obj) return this.objText(v);
    if (v instanceof Klasse || v instanceof EnumTyp || v instanceof Rezeptur || v instanceof Modul) return v.name;
    if (v instanceof Funktion || v instanceof Gebunden || v instanceof NativFn) return '<Funktion>';
    if (v instanceof Teig) return v.fertig ? 'Teig(' + this.text(v.wert) + ')' : 'Teig(roh)';
    if (v instanceof Lieferung) return 'Lieferung #' + v.nr;
    if (v instanceof Zustellung) return v.puenktlich ? 'Zustellung(' + (v.fehler ? 'Ananas' : this.text(v.wert)) + ')' : 'Zustellung(zu spät)';
    if (v instanceof Reste) return 'Reste(' + this.text(v.wert) + ')';
    if (v instanceof OfenRoh) return 'Roh(' + this.text(v.teil) + ')';
    if (v instanceof UiTheke) return 'Theke(' + v.titel + ')';
    if (v instanceof ZufallGen) return 'Zufall(' + v.saat + ')';
    if (v instanceof Kammer) return 'Vorratskammer(' + v.kennung + ')';
    if (v instanceof UiZutat) return UI_ART_NAME[v.art] + '(' + v.id + ')';
    if (v instanceof Zettel) return 'Zettel(' + this.text(v.w) + ')';
    if (v instanceof HerdTeil) return 'Teil(' + v.id + ')';
    if (v instanceof HerdKomp) {
      // lose: <Name>(); zerstört: das Teil, an dem sie zuletzt hing
      const e = this.hk.e;
      let t = v.teil;
      if (e.komp_info(v.h, 3) !== 1) t = e.komp_info(v.h, 2);
      return v.art.name + '(' + (t > 0 ? t : '') + ')';
    }
    if (v instanceof HerdWelt) return 'Herd(' + v.titel + ')';
    if (v instanceof HerdForm) return 'Form(' + v.id + ')';
    if (v instanceof HerdBildchen) return 'Bildchen(' + v.breite + '×' + v.hoehe + ')';
    if (v === AUTO) return 'auto';
    return String(v);
  }

  objText(o) {
    const l = this.findeMethodeListe(o.klasse, 'alsText');
    if (l) {
      const m = this.waehle(l, 0);
      if (m.body !== null && m.params.length === 0) return this.text(this.rufeDecl(m, o, [], null, null, 'normal'));
    }
    if (this.istAnanasKlasse(o.klasse)) return o.klasse.name + ': ' + o.nachricht;
    return o.klasse.name + '@' + o.nr;
  }

  // ---------- Vergleiche & Operatoren ----------
  gleich(a, b) {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    if (a instanceof Dauer && b instanceof Dauer) return a.ms === b.ms;
    return false;
  }

  vergleiche(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
    if (a instanceof Dauer && b instanceof Dauer) return a.ms < b.ms ? -1 : a.ms > b.ms ? 1 : 0;
    if (a instanceof EnumWert && b instanceof EnumWert && a.typ === b.typ) return a.pos - b.pos;
    throw this.ananas('TypAnanas', this.typName(a) + ' und ' + this.typName(b) + ' kann man nicht vergleichen.');
  }

  binaer(op, a, b, n) {
    const zz = typeof a === 'number' && typeof b === 'number';
    switch (op) {
      case '+':
        if (zz) return a + b;
        if (typeof a === 'string' || typeof b === 'string') return this.text(a) + this.text(b);
        if (a instanceof Dauer && b instanceof Dauer) return new Dauer(a.ms + b.ms);
        throw this.ananas('TypAnanas', this.typName(a) + ' und ' + this.typName(b) + ' kann man nicht addieren.');
      case '-':
        if (zz) return a - b;
        if (a instanceof Dauer && b instanceof Dauer) return new Dauer(a.ms - b.ms);
        throw this.ananas('TypAnanas', this.typName(b) + ' kann man nicht von ' + this.typName(a) + ' abziehen.');
      case '*':
        if (zz) return a * b;
        if (a instanceof Dauer && typeof b === 'number') return new Dauer(a.ms * b);
        if (typeof a === 'number' && b instanceof Dauer) return new Dauer(a * b.ms);
        throw this.ananas('TypAnanas', this.typName(a) + ' und ' + this.typName(b) + ' kann man nicht multiplizieren.');
      case '/':
        if (zz) {
          if (b === 0) throw this.ananas('RechenAnanas', 'Durch null teilen? Das ergibt keine Stücke.');
          return a / b;
        }
        if (a instanceof Dauer && typeof b === 'number') {
          if (b === 0) throw this.ananas('RechenAnanas', 'Durch null teilen? Das ergibt keine Stücke.');
          return new Dauer(a.ms / b);
        }
        if (a instanceof Dauer && b instanceof Dauer) {
          if (b.ms === 0) throw this.ananas('RechenAnanas', 'Durch null teilen? Das ergibt keine Stücke.');
          return a.ms / b.ms;
        }
        if (Array.isArray(a) && typeof b === 'number') {
          if (b === 0) throw this.ananas('RechenAnanas', 'Durch null teilen? Das ergibt keine Stücke.');
          const k = this.ganzzahl(b, 'Blech / n');
          if (k < 0) throw this.ananas('StreitAnanas', 'In ' + k + ' Stücke teilen? Das geht nicht.');
          if (a.length % k !== 0) throw this.ananas('StreitAnanas', a.length + ' Stücke lassen sich nicht fair durch ' + k + ' teilen.');
          return this.schneide(a, k);
        }
        throw this.ananas('TypAnanas', this.typName(a) + ' kann man nicht durch ' + this.typName(b) + ' teilen.');
      case '%':
        if (zz) {
          if (b === 0) throw this.ananas('RechenAnanas', 'Durch null teilen? Das ergibt keine Stücke.');
          return a % b;
        }
        throw this.ananas('TypAnanas', '% geht nur mit Zahlen.');
      case '==': return zz ? a === b : this.gleich(a, b);
      case '!=': return zz ? a !== b : !this.gleich(a, b);
      case '<': return zz ? a < b : this.vergleiche(a, b) < 0;
      case '<=': return zz ? a <= b : this.vergleiche(a, b) <= 0;
      case '>': return zz ? a > b : this.vergleiche(a, b) > 0;
      case '>=': return zz ? a >= b : this.vergleiche(a, b) >= 0;
    }
    throw this.ananas('LaufzeitAnanas', 'Unbekannter Operator \'' + op + '\'.');
  }
}
laufzeitTeil(LaufzeitTypen);
