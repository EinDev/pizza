// pizza-Interpreter · Vorratskammer (Methodentabelle und Laufzeit)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// ---------------------------------------------------------------- Vorratskammer (K-079/K-080)
const KAMMER_M = tabelle({
  'lege': function (k, pos) {
    if (this.kueche !== null) this.kuecheKammer(k);
    const s = this.kammerSchluessel(pos[0]);
    const w = this.einlagern(pos.length > 1 ? pos[1] : null);
    const alt = k.daten.has(s) ? k.daten.get(s) : undefined;
    k.daten.set(s, w);
    this.kammerGeaendert(k, s, w, () => { if (alt === undefined) k.daten.delete(s); else k.daten.set(s, alt); });
    return k;
  },
  'hole': function (k, pos, ben) {
    const s = this.kammerSchluessel(pos[0]);
    if (k.daten.has(s)) return this.auslagern(k.daten.get(s));
    const e = arg(pos, ben, 1, 'ersatz');
    return e === undefined ? null : e;
  },
  'hat': function (k, pos) { return k.daten.has(this.kammerSchluessel(pos[0])); },
  'entferne': function (k, pos) {
    if (this.kueche !== null) this.kuecheKammer(k);
    const s = this.kammerSchluessel(pos[0]);
    if (!k.daten.has(s)) return null;
    const alt = k.daten.get(s);
    k.daten.delete(s);
    this.kammerGeaendert(k, s, null, null);
    return this.auslagern(alt);
  },
  'schlüssel': function (k) { return Array.from(k.daten.keys()); },
  'länge': function (k) { return k.daten.size; },
  'leeren': function (k) { if (this.kueche !== null) this.kuecheKammer(k); k.daten.clear(); this.kammerGeaendert(k, null, null, null); return k; },
  'name': function (k) { return k.name; },
  'namensraum': function (k) { return k.raum; },  // K-106: Text oder karton
  'alsText': function (k) { return this.text(k); }
});

// Laufzeit: Vorratskammer
class LaufzeitVorrat {
  kammerSchluessel(k) {
    if (typeof k !== 'string') throw this.ananas('TypAnanas', 'Schlüssel einer Vorratskammer müssen Texte sein, nicht ' + this.darstellung(k) + '.');
    return k;
  }

  // Pizza-Wert → JSON-Wert (K-080); wirft TypAnanas für nicht einlagerbare Werte
  einlagern(v) {
    const nein = () => this.ananas('TypAnanas', '\'' + this.textSicher(v) + '\' lässt sich nicht einlagern (erlaubt: Zahlen, Texte, Wahrheitswerte, karton, Bleche und Speisekarten daraus).');
    if (v === null || v === undefined) return null;
    switch (typeof v) {
      case 'number': if (!isFinite(v)) throw nein(); return Object.is(v, -0) ? 0 : v;
      case 'string': case 'boolean': return v;
    }
    if (Array.isArray(v)) return v.map(x => this.einlagern(x));
    if (v instanceof Map) {
      const paare = [];
      for (const [k, w] of v) {
        if (typeof k !== 'string') throw nein();
        paare.push([k, this.einlagern(w)]);
      }
      return { speisekarte: paare };
    }
    throw nein();
  }

  textSicher(v) { try { return this.text(v); } catch (e) { return this.typName(v); } }

  // JSON-Wert → neuer Pizza-Wert (tiefe Kopie)
  auslagern(j) {
    if (j === null || typeof j !== 'object') return j === undefined ? null : j;
    if (Array.isArray(j)) return j.map(x => this.auslagern(x));
    if (Array.isArray(j.speisekarte)) {
      const m = new Map();
      for (const p of j.speisekarte) if (Array.isArray(p) && typeof p[0] === 'string') m.set(p[0], this.auslagern(p[1]));
      return m;
    }
    return null;
  }

  kammerEintraege(k) {
    return Array.from(k.daten, ([s, w]) => [s, JSON.parse(JSON.stringify(w))]);
  }

  kammerGeaendert(k, schluessel, wert, rueckgaengig) {
    const groesse = new TextEncoder().encode(JSON.stringify({ v: 1, name: k.kennung, eintraege: Array.from(k.daten) })).length;
    if (groesse > 1048576 && rueckgaengig !== null) {
      rueckgaengig();
      throw this.ananas('LaufzeitAnanas', 'Die Vorratskammer \'' + k.kennung + '\' ist voll (Limit 1 MiB).');
    }
    this.emit({ typ: 'vorrat', name: k.kennung, schluessel, wert: wert === null ? null : JSON.parse(JSON.stringify(wert)) });
    if (this.onVorrat !== null) {
      let ok = true;
      try { ok = this.onVorrat(k.kennung, this.kammerEintraege(k)) !== false; } catch (e) { ok = false; }
      if (!ok) throw this.ananas('LaufzeitAnanas', 'Die Vorratskammer \'' + k.kennung + '\' konnte nicht gespeichert werden.');
    }
  }

  // K-106: neu Vorratskammer(name[, namensraum]) – Kennung = name bzw. namensraum/name; gleiche Kennung = gleiche Kammer
  neueKammer(pos, ben, node) {
    const n = arg(pos, ben, 0, 'name');
    const name = n === undefined || n === null ? '' : this.text(n);
    if (!/^[a-z0-9-]{1,40}$/.test(name)) throw this.ananas('LaufzeitAnanas', 'Ungültiger Kammername \'' + name + '\' (erlaubt: a–z, 0–9, \'-\', 1–40 Zeichen).');
    const r = arg(pos, ben, 1, 'namensraum');
    const raum = r === undefined || r === null ? null : this.text(r);
    if (raum !== null && !/^[a-z0-9-]{1,40}$/.test(raum)) throw this.ananas('LaufzeitAnanas', 'Ungültiger Namensraum \'' + raum + '\' (erlaubt: a–z, 0–9, \'-\', 1–40 Zeichen).');
    const kennung = raum === null ? name : raum + '/' + name;
    const da = this.kammern.get(kennung);
    if (da !== undefined) return da;
    if (this.vorratOpt === null && this.onVorrat === null && !this.w0101) {
      this.w0101 = true;
      this.warnung('W0101', 'Keine Vorratskammer verfügbar – Zustand wird nicht gespeichert.', node);
    }
    const k = new Kammer(name, raum);
    let eintraege = null;
    if (this.vorratOpt !== null) { try { eintraege = this.vorratOpt[kennung]; } catch (e) { eintraege = null; } }
    if (eintraege && !Array.isArray(eintraege) && Array.isArray(eintraege.eintraege)) eintraege = eintraege.eintraege;
    if (Array.isArray(eintraege)) {
      for (const p of eintraege) {
        if (Array.isArray(p) && typeof p[0] === 'string') k.daten.set(p[0], JSON.parse(JSON.stringify(p[1] === undefined ? null : p[1])));
      }
    }
    this.kammern.set(kennung, k);
    return k;
  }
}
laufzeitTeil(LaufzeitVorrat);
