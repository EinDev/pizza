// pizza-Interpreter · Theke: Laufzeit (Fenster, Zettel, Bindungen, Ereignisse)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// Laufzeit: Theke, Zettel & Bindungen
class LaufzeitTheke {
  // ---------- Theke ----------
  // Programmende: letzte Änderungen senden, offenes Fenster schließen (Nutzerentscheidung, überschreibt K-061)
  uiEnde() {
    const t = this.uiTheke;
    try {
      this.uiFlush();
    } finally {
      // auch wenn eine Bindung am Programmende wirft: schliesse geht vor dem fehler-Ereignis hinaus (K-061)
      if (t !== null && t.gezeigt && !t.geschlossen) {
        this.uiSende({ v: 1, op: 'schliesse' });
        t.geschlossen = true;
        t.gezeigt = false;
      }
      this.herdEnde();
    }
  }

  uiSende(nachricht) {
    if (this.onUi !== null) { try { this.onUi(nachricht); } catch (e) { /* Renderer-Fehler ignorieren */ } }
    this.emit({ typ: 'ui', nachricht });
  }

  uiFunktion(f, wo) {
    if (f === null || f === undefined) return null;
    if (f instanceof Funktion || f instanceof Gebunden || f instanceof NativFn) return f;
    throw this.ananas('TypAnanas', wo + '() braucht eine Funktion, z. B. () -> { … }.');
  }

  uiNeu(name, pos, ben) {
    const art = UI_KLASSEN[name];
    const idArg = ben !== null && 'id' in ben ? ben.id : undefined;
    let id;
    if (idArg !== undefined && idArg !== null) {
      id = this.text(idArg);
      if (id === '') throw this.ananas('LaufzeitAnanas', 'Eine Zutat-ID darf nicht leer sein.');
      if (this.uiZutaten.has(id)) throw this.ananas('LaufzeitAnanas', 'Die ID \'' + id + '\' gibt es schon.');
    } else {
      // Auto-ID wird vor der Prüfung der Argumente vergeben (auch ein fehlgeschlagenes neu verbraucht die Nummer, K-059/K-060)
      do { id = 'z' + (++this.uiIdZaehler); } while (this.uiZutaten.has(id));
    }
    const z = new UiZutat(art, id);
    switch (art) {
      case 'schild': { const t = arg(pos, ben, 0, 'text'); z.text = t === undefined ? '' : this.text(t); break; }
      case 'knopf': {
        const t = arg(pos, ben, 0, 'text'); z.text = t === undefined ? '' : this.text(t);
        z.beiKlick = this.uiFunktion(arg(pos, ben, 1, 'beiKlick'), 'Knopf');
        break;
      }
      case 'eingabe': {
        const w = arg(pos, ben, 0, 'wert'); z.wert = w === undefined ? '' : this.text(w);  // K-102: karton → "karton" (Zustandsfeld)
        const ph = arg(pos, ben, 1, 'platzhalter'); z.platzhalter = ph === undefined || ph === null ? '' : this.text(ph);
        break;
      }
      case 'haken': {
        const t = arg(pos, ben, 0, 'text'); z.text = t === undefined ? '' : this.text(t);
        const an = arg(pos, ben, 1, 'an'); z.an = an === undefined || an === null ? false : this.bool(an);
        break;
      }
      case 'takt': {
        const d = arg(pos, ben, 0, 'intervall');
        z.intervall = this.taktIntervall(d === undefined ? null : d);
        z.beiTakt = this.uiFunktion(arg(pos, ben, 1, 'beiTakt'), 'Takt');
        break;
      }
      case 'fortschritt': {
        z.fortschritt = this.fortschrittWert(arg(pos, ben, 0, 'wert'));
        const t = arg(pos, ben, 1, 'text'); z.text = t === undefined || t === null ? '' : this.text(t);
        break;
      }
      case 'tabelle':
        z.spalten = this.tabellenZeile(arg(pos, ben, 0, 'spalten'), 'Spalten');
        z.zeilen = this.tabellenZeilen(arg(pos, ben, 1, 'zeilen'));
        break;
      case 'abschnitt': {
        const t = arg(pos, ben, 0, 'titel'); z.titel = t === undefined ? '' : this.text(t);  // K-102: karton → "karton" (Zustandsfeld)
        const b = arg(pos, ben, 1, 'kinder');
        if (b !== undefined && b !== null) {
          if (!Array.isArray(b)) throw this.ananas('TypAnanas', 'Abschnitt braucht ein Blech mit Zutaten, nicht ' + this.darstellung(b) + '.');
          for (const k of b) this.uiKind(z, k);
        }
        break;
      }
      case 'reiter': {
        const t = arg(pos, ben, 0, 'titel');
        z.titelListe = t === undefined || t === null ? [] : this.tabellenZeile(t, 'Titel');
        const b = arg(pos, ben, 1, 'seiten');
        if (b !== undefined && b !== null) {
          if (!Array.isArray(b)) throw this.ananas('TypAnanas', 'Reiter braucht ein Blech mit Zutaten, nicht ' + this.darstellung(b) + '.');
          for (const k of b) this.uiKind(z, k);
        }
        break;
      }
      case 'auswahl': {
        // K-109: erst optionen (Blech-Prüfung), dann gewaehlt (Bereichsprüfung gegen die Anzahl)
        z.optionen = this.auswahlOptionen(arg(pos, ben, 0, 'optionen'));
        const g = arg(pos, ben, 1, 'gewaehlt');
        z.gewaehlt = g === undefined || g === null ? 1 : this.auswahlOption(z, g);
        break;
      }
      case 'tastatur':
        z.beiTaste = this.uiFunktion(arg(pos, ben, 0, 'beiTaste'), 'Tastatur');
        break;
      default: {
        const b = arg(pos, ben, 0, 'kinder');
        if (b !== undefined && b !== null) {
          if (!Array.isArray(b)) throw this.ananas('TypAnanas', UI_ART_NAME[art] + ' braucht ein Blech mit Zutaten, nicht ' + this.darstellung(b) + '.');
          for (const k of b) this.uiKind(z, k);
        }
      }
    }
    this.uiZutaten.set(z.id, z);
    return z;
  }

  taktIntervall(d) {
    if (!(d instanceof Dauer)) throw this.ananas('TypAnanas', 'Ein Takt braucht eine Dauer, nicht ' + this.darstellung(d) + '.');
    const ms = Math.round(d.ms);
    if (!(ms >= 100)) throw this.ananas('LaufzeitAnanas', 'Ein Takt braucht mindestens 100ms, nicht ' + dauerText(d.ms) + '.');
    return ms;
  }

  fortschrittWert(w) {
    if (w === null || w === undefined) return 0;
    if (typeof w !== 'number') throw this.ananas('TypAnanas', 'Ein Fortschritt braucht eine Zahl zwischen 0 und 1, nicht ' + this.darstellung(w) + '.');
    if (Number.isNaN(w)) return 0;
    return w < 0 ? 0 : w > 1 ? 1 : w;
  }

  // K-107/K-086: Seitennummer eines Reiters – ganze Zahl 1 … Zahl der Kinder, sonst KeinStückAnanas (Textform von n)
  reiterSeite(z, n) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > z.kinder.length) {
      throw this.ananas('KeinStückAnanas', 'Seite ' + this.text(n) + ' gibt es nicht – der Reiter hat ' + z.kinder.length + ' Seite' + (z.kinder.length === 1 ? '' : 'n') + '.');
    }
    return n;
  }

  // K-109: Optionen einer Auswahl – Blech → Textformen (karton → "karton"); fehlend/karton → []
  auswahlOptionen(b) {
    if (b === null || b === undefined) return [];
    if (!Array.isArray(b)) throw this.ananas('TypAnanas', 'Auswahl braucht ein Blech mit Optionen, nicht ' + this.darstellung(b) + '.');
    return b.map(x => this.text(x));
  }

  // K-109: Optionsnummer – ganze Zahl 1 … Anzahl, sonst KeinStückAnanas („1 Option“ im Singular)
  auswahlOption(z, n) {
    const anzahl = z.optionen.length;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > anzahl) {
      throw this.ananas('KeinStückAnanas', 'Option ' + this.text(n) + ' gibt es nicht – die Auswahl hat ' + anzahl + ' Option' + (anzahl === 1 ? '' : 'en') + '.');
    }
    return n;
  }

  tabellenZeile(b, wo) {
    if (b === null || b === undefined) return [];
    if (!Array.isArray(b)) throw this.ananas('TypAnanas', 'Tabelle.' + wo + ' braucht ein Blech, nicht ' + this.darstellung(b) + '.');
    return b.map(x => this.text(x));
  }

  tabellenZeilen(b) {
    if (b === null || b === undefined) return [];
    if (!Array.isArray(b)) throw this.ananas('TypAnanas', 'Tabelle-Zeilen brauchen ein Blech aus Blechen, nicht ' + this.darstellung(b) + '.');
    return b.map(z => this.tabellenZeile(z, 'setzeZeilen'));
  }

  stellen(n, wo) {
    const k = this.ganzzahl(n, wo);
    if (k < 0 || k > 20) throw this.ananas('RechenAnanas', wo + ': Nachkommastellen müssen zwischen 0 und 20 liegen, nicht ' + k + '.');
    return k;
  }

  uiKind(c, k) {
    if (!(k instanceof UiZutat)) throw this.ananas('TypAnanas', 'In ' + UI_ART_NAME[c.art] + ' passen nur Zutaten, nicht ' + this.darstellung(k) + '.');
    for (let x = c; x !== null; x = x.eltern) {
      if (x === k) throw this.ananas('LaufzeitAnanas', 'Die Zutat \'' + k.id + '\' kann nicht in sich selbst liegen.');
    }
    if (k.eltern !== null || (this.uiTheke !== null && this.uiTheke.wurzel === k)) {
      throw this.ananas('LaufzeitAnanas', 'Die Zutat \'' + k.id + '\' liegt schon woanders auf der Theke.');
    }
    k.eltern = c;
    c.kinder.push(k);
  }

  uiStilNachricht(z) {
    const o = Object.assign({}, z.stil || {});
    if (z.stilNull !== null) for (const k of z.stilNull) o[k] = null;
    return o;
  }

  uiAngezeigt(z) {
    const t = this.uiTheke;
    if (t === null || !t.gezeigt || t.geschlossen) return false;
    let x = z;
    while (x.eltern !== null) x = x.eltern;
    return x === t.wurzel;
  }

  uiBaum(z) {
    const o = { id: z.id, art: z.art };
    switch (z.art) {
      case 'schild': o.text = z.text; break;
      case 'knopf': o.text = z.text; if (!z.aktiv) o.aktiv = false; break;
      case 'eingabe': o.wert = z.wert; if (z.platzhalter !== '') o.platzhalter = z.platzhalter; break;
      case 'haken': o.text = z.text; o.an = z.an; break;
      case 'takt': o.intervall = z.intervall; if (!z.aktiv) o.aktiv = false; break;
      case 'fortschritt': o.wert = z.fortschritt; if (z.text !== '') o.text = z.text; break;
      case 'abschnitt': o.titel = z.titel; if (z.klappbar) o.klappbar = true; if (z.zu) o.zu = true; break;
      case 'tabelle': o.spalten = z.spalten.slice(); o.zeilen = z.zeilen.map(x => x.slice()); break;
      case 'reiter': o.titel = z.titelListe.slice(); o.gewaehlt = z.gewaehlt; break;
      case 'auswahl': o.optionen = z.optionen.slice(); o.gewaehlt = z.gewaehlt; if (!z.aktiv) o.aktiv = false; break;
      case 'tastatur': if (!z.aktiv) o.aktiv = false; break;
    }
    if (z.hinweis !== '') o.hinweis = z.hinweis;
    if (z.marke !== '') o.marke = z.marke;
    if (!z.sichtbar) o.sichtbar = false;
    if (z.uebergang) o.uebergang = true;
    if (z.stil !== null) o.stil = Object.assign({}, z.stil);
    z.stilNull = null;
    if (z.kinder !== null) o.kinder = z.kinder.map(k => this.uiBaum(k));
    return o;
  }

  uiAendere(z, feld, wert) {
    if (!this.uiAngezeigt(z)) return;
    let e = this.uiOffen.get(z.id);
    if (e === undefined) { e = { id: z.id }; this.uiOffen.set(z.id, e); }
    // K-115: kinder nur vormerken – die Liste entsteht erst beim Senden (Zustand am Synchronisationspunkt).
    e[feld] = feld === 'kinder' ? null : wert;
  }

  // ---------- Theke v5: Zettel & Bindungen (K-116 … K-118) ----------
  // Setter-Argument prüfen und umwandeln – gleiche Regeln für Setter und Bindung (K-102, K-066, Fortschritt-Klemmen, Takt, Listen)
  uiWandle(z, feld, v) {
    switch (feld) {
      case 'text': return z.art === 'fortschritt' && (v === undefined || v === null) ? '' : this.text(v);
      case 'wert': return z.art === 'fortschritt' ? this.fortschrittWert(v) : this.text(v);
      case 'hinweis': case 'marke': return v === undefined || v === null ? '' : this.text(v);
      case 'titel': return this.text(v);
      case 'an': case 'aktiv': case 'sichtbar': case 'uebergang': case 'klappbar': case 'zu': return this.bool(v);
      case 'intervall': return this.taktIntervall(v);
      case 'spalten': return this.tabellenZeile(v, 'setzeSpalten');
      case 'zeilen': return this.tabellenZeilen(v);
      case 'optionen': return this.auswahlOptionen(v);
      case 'gewaehlt': return z.art === 'reiter' ? this.reiterSeite(z, v) : this.auswahlOption(z, v);
    }
    return v;
  }

  // Stil-Wert prüfen (K-068, K-113); karton/fehlend → null (entfernt den Stil, K-075)
  uiStilWert(k, w) {
    if (w === null || w === undefined) return null;
    const art = UI_STIL[k];
    if (art === 'zahl') {
      if (typeof w !== 'number' || !(w >= 0) || !isFinite(w)) throw this.ananas('TypAnanas', 'Stil \'' + k + '\' braucht eine Zahl ≥ 0, nicht ' + this.darstellung(w) + '.');
      return w;
    }
    if (art === 'ganzzahl') {
      // K-113: zeilen – ganze Zahl ≥ 1
      if (typeof w !== 'number' || !Number.isInteger(w) || w < 1) throw this.ananas('TypAnanas', 'Stil \'' + k + '\' braucht eine ganze Zahl ≥ 1, nicht ' + this.darstellung(w) + '.');
      return w;
    }
    if (art === 'gewichte') {
      // K-126: spalten – nicht leeres Blech aus endlichen Zahlen > 0; gespeichert wird eine Kopie
      if (!Array.isArray(w) || w.length === 0 || !w.every(x => typeof x === 'number' && x > 0 && isFinite(x))) {
        throw this.ananas('TypAnanas', 'Stil \'' + k + '\' braucht ein Blech aus Zahlen > 0, nicht ' + this.darstellung(w) + '.');
      }
      return w.slice();
    }
    const t = this.text(w);
    if (art.indexOf(t) < 0) throw this.ananas('LaufzeitAnanas', 'Wert \'' + t + '\' ist für Stil \'' + k + '\' nicht erlaubt. Erlaubt: ' + art.join(', ') + '.');
    return t;
  }

  // Zentrale Schreibstelle (K-116/K-117). modus: 'setter' (prüft, ob die Eigenschaft gebunden ist; sendet),
  // 'bindung' (Ergebnis einer Bindung; sendet), 'ereignis' (vom Renderer gemeldeter Wert; wird nicht zurückgesendet, K-057).
  // Gleicher Wert → nichts (keine Nachricht, keine schmutzige Bindung).
  uiSetze(z, feld, wert, modus) {
    if (modus === 'setter' && z.bindungen !== null && z.bindungen.has(feld)) {
      throw this.ananas('LaufzeitAnanas', '\'' + feld + '\' von ' + this.text(z) + ' ist gebunden – setze den Zettel, nicht die Zutat.');
    }
    const intern = UI_FELD_INTERN[z.art + '.' + feld] || feld;
    if (uiGleich(z[intern], wert)) return;
    z[intern] = wert;
    this.uiSchmutzig(z, feld);
    if (modus !== 'ereignis') this.uiAendere(z, feld, Array.isArray(wert) ? wert.map(x => Array.isArray(x) ? x.slice() : x) : wert);
  }

  // Stil setzen/entfernen (w === null entfernt); Vergleich mit dem aktuellen Stil-Objekt (K-117)
  uiSetzeStil(z, k, w, modus) {
    if (modus === 'setter' && z.bindungen !== null && z.bindungen.has('s:' + k)) {
      throw this.ananas('LaufzeitAnanas', 'Stil \'' + k + '\' von ' + this.text(z) + ' ist gebunden – setze den Zettel, nicht die Zutat.');
    }
    if (w === null) {
      if (z.stil === null || !(k in z.stil)) return;  // nicht gesetzt → nichts, kein null in der Nachricht
      delete z.stil[k];
      if (Object.keys(z.stil).length === 0) z.stil = null;
      if (z.stilNull === null) z.stilNull = new Set();
      z.stilNull.add(k);
    } else {
      if (z.stil !== null && k in z.stil && uiGleich(z.stil[k], w)) return;
      if (z.stil === null) z.stil = {};
      z.stil[k] = w;
      if (z.stilNull !== null) z.stilNull.delete(k);
    }
    this.uiAendere(z, 'stil', this.uiStilNachricht(z));
  }

  // Quelle (Objekt, Feld) für die gerade laufende Bindung erfassen; außerhalb einer Bindung nichts
  uiLies(o, feld) {
    const b = this.uiBindungLauf;
    if (b === null) return;
    if (o.abh === null) o.abh = new Map();
    let s = o.abh.get(feld);
    if (s === undefined) { s = new Set(); o.abh.set(feld, s); }
    if (s.has(b)) return;
    s.add(b);
    b.quellen.push(o, feld);
  }

  // Quelle hat sich geändert: alle lesenden Bindungen schmutzig
  uiSchmutzig(o, feld) {
    if (o.abh === null) return;
    const s = o.abh.get(feld);
    if (s === undefined || s.size === 0) return;
    for (const b of s) b.dirty = true;
    this.uiDirty = true;
  }

  uiBindungName(b) {
    if (b.z instanceof Zettel) return 'ein abgeleiteter Zettel';  // K-125
    return (b.stil ? 'Stil ' : '') + '\'' + b.feld + '\' von ' + this.text(b.z);
  }

  // K-125: Zettel.aus(fn) – neuer Zettel, dessen Wert eine Bindung ist (sofort ausgewertet, dann an den Synchronisationspunkten)
  uiZettelAus(pos, node) {
    const f = pos[0];
    if (!(f instanceof Funktion || f instanceof Gebunden || f instanceof NativFn)) {
      throw this.ananas('TypAnanas', 'Zettel.aus() braucht eine Funktion, z. B. () -> { … }.');
    }
    const z = new Zettel(null);
    const b = new UiBindung(z, 'wert', false, f, node);
    z.abl = b;
    this.uiBindungen.push(b);
    this.uiBindungAuswerten(b);
    return z;
  }

  uiBindungQuellenLoesen(b) {
    const q = b.quellen;
    for (let i = 0; i < q.length; i += 2) {
      const s = q[i].abh.get(q[i + 1]);
      if (s !== undefined) s.delete(b);
    }
    b.quellen = [];
  }

  uiBindungLoesen(z, key) {
    if (z.bindungen === null) return;
    const b = z.bindungen.get(key);
    if (b === undefined) return;
    z.bindungen.delete(key);
    if (z.bindungen.size === 0) z.bindungen = null;
    const i = this.uiBindungen.indexOf(b);
    if (i >= 0) this.uiBindungen.splice(i, 1);
    this.uiBindungQuellenLoesen(b);
  }

  // binde(eigenschaft, fn) / bindeStil(schlüssel, fn): Name prüfen, karton löst, sonst neue Registrierung und sofortige Auswertung
  uiBinde(z, pos, node, stil) {
    const name = this.text(pos[0]);
    if (stil) {
      if (UI_STIL[name] === undefined) throw this.ananas('LaufzeitAnanas', 'Stil \'' + name + '\' gibt es nicht. Erlaubt: ' + Object.keys(UI_STIL).join(', ') + '.');
    } else {
      const liste = UI_BINDBAR[z.art].concat(UI_BINDBAR_ALLE);
      if (liste.indexOf(name) < 0) throw this.ananas('LaufzeitAnanas', '\'' + name + '\' lässt sich an ' + this.text(z) + ' nicht binden. Bindbar: ' + liste.join(', ') + '.');
    }
    const key = (stil ? 's:' : '') + name;
    const f = pos[1];
    if (f === null || f === undefined) { this.uiBindungLoesen(z, key); return; }
    if (!(f instanceof Funktion || f instanceof Gebunden || f instanceof NativFn)) {
      throw this.ananas('TypAnanas', (stil ? 'bindeStil' : 'binde') + '() braucht eine Funktion, z. B. () -> { … }.');
    }
    this.uiBindungLoesen(z, key);
    const b = new UiBindung(z, name, stil, f, node);
    if (z.bindungen === null) z.bindungen = new Map();
    z.bindungen.set(key, b);
    this.uiBindungen.push(b);
    this.uiBindungAuswerten(b);
  }

  // Eine Bindung auswerten: vorher sauber markieren und Quellen lösen (werfender Ausdruck bleibt sauber), Quellen neu erfassen,
  // Ergebnis wie der gleichnamige Setter umwandeln und über uiSetze setzen (nur bei echter Änderung, K-117)
  uiBindungAuswerten(b) {
    b.dirty = false;
    this.uiBindungQuellenLoesen(b);
    const vorher = this.uiBindungLauf;
    this.uiBindungLauf = b;
    let v;
    try { v = this.rufe(b.fn, [], null, b.node); } finally { this.uiBindungLauf = vorher; }
    if (b.erst) {
      b.erst = false;
      if (b.quellen.length === 0) {
        this.warnung('W0103', b.z instanceof Zettel ? 'Der abgeleitete Zettel liest weder Zettel noch Zutat – er rechnet nur einmal.'
          : 'Die Bindung ' + this.uiBindungName(b) + ' liest weder Zettel noch Zutat – sie rechnet nur einmal.', b.node);
      }
    }
    if (b.z instanceof Zettel) {
      // K-125: Ergebnis wie Zettel.setze – nur ein ungleicher Wert (Gleichheit wie ==) macht Leser schmutzig
      if (v === undefined) v = null;
      if (!this.gleich(b.z.w, v)) { b.z.w = v; this.uiSchmutzig(b.z, 'wert'); }
      return;
    }
    if (b.stil) this.uiSetzeStil(b.z, b.feld, this.uiStilWert(b.feld, v), 'bindung');
    else this.uiSetze(b.z, b.feld, this.uiWandle(b.z, b.feld, v), 'bindung');
  }

  // Synchronisationspunkt (K-057/K-116): höchstens 100 Durchläufe in Registrierungsreihenfolge, bis keine Bindung mehr schmutzig ist
  uiBindungenAuswerten() {
    if (!this.uiDirty) return;
    const liste = this.uiBindungen;
    for (let d = 0; d < UI_BINDUNG_DURCHLAEUFE; d++) {
      let offen = false;
      for (let i = 0; i < liste.length; i++) {
        const b = liste[i];
        if (b.dirty) { offen = true; this.uiBindungAuswerten(b); }
      }
      if (!offen) { this.uiDirty = false; return; }
    }
    // Zyklus: erste schmutzige Bindung nennen; danach sind alle Bindungen sauber (sie rechnen erst wieder, wenn sich eine
    // Quelle ändert) – das Programm läuft weiter, der nächste Synchronisationspunkt wirft nicht erneut (K-119).
    let erste = null;
    for (const b of liste) {
      if (b.dirty) { if (erste === null) erste = b; b.dirty = false; }
    }
    this.uiDirty = false;
    if (erste !== null) throw this.ananas('LaufzeitAnanas', 'Die Bindungen kommen nicht zur Ruhe – ' + this.uiBindungName(erste) + ' hängt von sich selbst ab.');
  }

  uiFlush() {
    // K-116: Bindungen zuerst – die Nachricht zeigt den Zustand am Synchronisationspunkt (K-115). Wirft eine Bindung,
    // geht der Puffer (auch die Werte vorher ausgewerteter Bindungen, Animationen) wie bei einer Rückruf-Ananas
    // vor dem Verlassen hinaus, dann läuft die Ananas weiter (K-119).
    try { this.uiBindungenAuswerten(); } finally { this.uiFlushSenden(); }
  }

  uiFlushSenden() {
    if (this.uiOffen.size === 0 && this.uiAnim.length === 0) return;
    const aenderungen = Array.from(this.uiOffen.values());
    this.uiOffen.clear();
    // K-115: vorgemerkte kinder-Listen jetzt aus dem aktuellen Zustand (in Eintragsreihenfolge)
    for (const a of aenderungen) {
      if ('kinder' in a) a.kinder = this.uiZutaten.get(a.id).kinder.map(k => this.uiBaum(k));
    }
    for (const a of aenderungen) {
      if ('stil' in a) { const z = this.uiZutaten.get(a.id); if (z !== undefined) z.stilNull = null; }
    }
    const n = { v: 1, op: 'aendere', aenderungen };
    if (this.uiAnim.length > 0) { n.animationen = this.uiAnim; this.uiAnim = []; }
    this.uiSende(n);
  }

  // K-090: Dauer einer Animation – Dauer, ganze ms (K-047), 50 ms … 5 s; karton/fehlend → null (Standard des Renderers)
  uiAnimDauer(d, wo) {
    if (d === undefined || d === null) return null;
    if (!(d instanceof Dauer)) throw this.ananas('TypAnanas', wo + '(dauer: …) braucht eine Dauer, nicht ' + this.darstellung(d) + '.');
    const ms = Math.round(d.ms);
    if (!(ms >= 50 && ms <= 5000)) throw this.ananas('LaufzeitAnanas', 'Eine Animation dauert 50ms bis 5s, nicht ' + dauerText(d.ms) + '.');
    return ms;
  }

  // K-090: Animation nur bei offener Theke und gezeigter Zutat (z === null: Fenstermitte), sonst W0102 je Aufrufstelle
  uiAnimOffen(z, node) {
    const t = this.uiTheke;
    if (t === null || !t.gezeigt || t.geschlossen) {
      this.warnung('W0102', 'Animation entfällt – die Theke ist nicht offen.', node);
      return false;
    }
    if (z !== null && !this.uiAngezeigt(z)) {
      this.warnung('W0102', 'Animation entfällt – \'' + z.id + '\' liegt nicht auf der Theke.', node);
      return false;
    }
    return true;
  }

  uiAnimPuffer(e) {
    if (this.uiAnim.length < UI_ANIM_MAX) this.uiAnim.push(e);
  }

  uiZeige(t, z) {
    if (!(z instanceof UiZutat)) throw this.ananas('TypAnanas', 'zeige() braucht eine Zutat, nicht ' + this.darstellung(z) + '.');
    if (z.eltern !== null) throw this.ananas('LaufzeitAnanas', 'Die Zutat \'' + z.id + '\' liegt schon in einem Behälter und kann nicht die Wurzel sein.');
    this.uiBindungenAuswerten();  // K-116: vor dem Bau des Baums
    this.uiOffen.clear();
    this.uiAnim = [];
    t.wurzel = z;
    if (!t.gezeigt || t.geschlossen) {
      t.gezeigt = true;
      t.geschlossen = false;
      this.uiSende({ v: 1, op: 'fenster', titel: t.titel, breite: t.breite, hoehe: t.hoehe });
    }
    this.uiSende({ v: 1, op: 'baum', wurzel: this.uiBaum(z) });
  }

  uiSchliesse(t) {
    if (!t.gezeigt || t.geschlossen) { t.geschlossen = true; return; }
    this.uiFlush();
    this.uiSende({ v: 1, op: 'schliesse' });
    t.geschlossen = true;
    t.gezeigt = false;
  }

  uiNaechstesEreignis() {
    let ev = null;
    if (this.uiWarte !== null) {
      try { ev = this.uiWarte(); } catch (e) { ev = null; }
    } else if (this.uiListe !== null && this.uiPos < this.uiListe.length) {
      ev = this.uiListe[this.uiPos++];
    }
    if (ev === null || ev === undefined || typeof ev !== 'object') return { typ: 'geschlossen' };
    return ev;
  }

  uiBediene(t, node) {
    if (t.wurzel === null) throw this.ananas('LaufzeitAnanas', 'Die Theke ist leer.');
    if (t.geschlossen) return;
    if (this.uiWarte === null && this.uiListe === null) {
      this.uiFlush();
      this.warnung('W0100', 'Keine Theke verfügbar – Fenster wird nicht angezeigt.', node);
      return;
    }
    for (;;) {
      this.uiFlush();
      if (t.geschlossen) return;
      const ev = this.uiNaechstesEreignis();
      if (ev.typ === 'geschlossen') {
        this.uiOffen.clear();
        this.uiAnim = [];
        t.geschlossen = true;
        t.gezeigt = false;
        return;
      }
      try {
        this.uiVerteile(ev, node);
      } finally {
        if (!t.geschlossen) this.uiFlush();
      }
    }
  }

  uiVerteile(ev, node) {
    const z = typeof ev.id === 'string' ? this.uiZutaten.get(ev.id) : undefined;
    // Nur gezeigte Zutaten bekommen Ereignisse (K-057/K-084)
    if (z === undefined || !this.uiAngezeigt(z)) return;
    // K-087: jeder Rückruf beginnt mit frischem Schrittbudget (schritte/Uhr zählen weiter)
    this.limitBasis = this.schritte;
    this.neuGrenze();
    switch (ev.typ) {
      case 'takt':
        if (z.art === 'takt' && z.aktiv && z.beiTakt !== null) {
          const a = ev.anzahl;
          const anzahl = typeof a === 'number' && Number.isInteger(a) && a >= 1 ? a : 1;
          this.rufe(z.beiTakt, [anzahl], null, node);
        }
        break;
      case 'klick':
        if (z.art === 'knopf' && z.aktiv && z.beiKlick !== null) this.rufe(z.beiKlick, [], null, node);
        break;
      case 'aenderung':
        // Renderer-Werte gehen durch die zentrale Schreibstelle (schmutzige Bindungen, K-117-Gleichheit), werden aber
        // nicht zurückgesendet (K-057) und dürfen gebundene Eigenschaften setzen (K-116); der Rückruf läuft immer.
        if (z.art === 'eingabe') {
          this.uiSetze(z, 'wert', ev.wert === undefined || ev.wert === null ? '' : String(ev.wert), 'ereignis');
          if (z.beiAenderung !== null) this.rufe(z.beiAenderung, [z.wert], null, node);
        } else if (z.art === 'haken') {
          this.uiSetze(z, 'an', ev.wert === true || ev.wert === 'true', 'ereignis');
          if (z.beiAenderung !== null) this.rufe(z.beiAenderung, [z.an], null, node);
        } else if (z.art === 'reiter') {
          const n = ev.wert;
          if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > z.kinder.length) break;
          this.uiSetze(z, 'gewaehlt', n, 'ereignis');
          if (z.beiAenderung !== null) this.rufe(z.beiAenderung, [n], null, node);
        } else if (z.art === 'abschnitt') {
          // K-108: nur ein klappbarer Abschnitt nimmt den Zustand an; wert wie beim Haken
          if (!z.klappbar) break;
          this.uiSetze(z, 'zu', ev.wert === true || ev.wert === 'true', 'ereignis');
          if (z.beiAenderung !== null) this.rufe(z.beiAenderung, [z.zu], null, node);
        } else if (z.art === 'auswahl') {
          // K-109: nur aktiv, ganze Zahl 1 … Anzahl
          if (!z.aktiv) break;
          const n = ev.wert;
          if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > z.optionen.length) break;
          this.uiSetze(z, 'gewaehlt', n, 'ereignis');
          if (z.beiAenderung !== null) this.rufe(z.beiAenderung, [n], null, node);
        }
        break;
      case 'taste':
        // K-110: aktive Tastatur mit Rückruf, taste nicht-leerer Text; Zustellung kostet 0 Schritte
        if (z.art === 'tastatur' && z.aktiv && z.beiTaste !== null && typeof ev.taste === 'string' && ev.taste !== '') {
          this.rufe(z.beiTaste, [ev.taste], null, node);
        }
        break;
      case 'enter':
        if (z.art === 'eingabe') {
          if (ev.wert !== undefined && ev.wert !== null) this.uiSetze(z, 'wert', String(ev.wert), 'ereignis');
          if (z.beiEnter !== null) this.rufe(z.beiEnter, [z.wert], null, node);
        }
        break;
    }
  }
}
laufzeitTeil(LaufzeitTheke);
