// pizza-Interpreter · Herd: Methodentabellen
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// ---------- Methodentabellen ----------
function herdTab(o) { const t = tabelle(o); nurHauptkueche(t, HERD_KUECHE); return t; }

// Komponenten generisch: Getter <feld>(), Setter setze<Feld>(w) (verkettbar), hole/setze, teil(), alsText()
function herdKompTabelle(art) {
  const t = {};
  for (const f of art.felder) {
    t[f.name] = function (k) { return this.herdHole(k.h, art, f); };
    t['setze' + f.name.charAt(0).toUpperCase() + f.name.slice(1)] = function (k, pos) {
      this.herdSetze(k.h, art, f, pos.length ? pos[0] : null);
      return k;
    };
  }
  t.hole = function (k, pos, ben) { return this.herdHole(k.h, art, this.herdFeld(art, arg(pos, ben, 0, 'feld'))); };
  t.setze = function (k, pos, ben) {
    const f = this.herdFeld(art, arg(pos, ben, 0, 'feld'));
    const w = arg(pos, ben, 1, 'wert');
    this.herdSetze(k.h, art, f, w === undefined ? null : w);
    return k;
  };
  t.teil = function (k) {
    const e = this.hk.e;
    // zerstört (komp_info 3) → Kern-Text „Teil 7 ist schon entfernt.“ über das zuletzt bekannte Teil (komp_info 2 liefert dann 0)
    if (e.komp_info(k.h, 3) === 1) this.herdF(e.teil_hole(k.teil, 1));
    const id = this.herdI(e.komp_info(k.h, 2));
    k.teil = id;
    return id === 0 ? null : this.herdTeilObj(id);
  };
  t.alsText = function (k) { return this.text(k); };
  return herdTab(t);
}

const HERD_TEIL_M = {
  'x': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 1)); },
  'y': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 2)); },
  'z': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 3)); },
  'setzeLage': function (t, pos, ben) {
    const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'setzeLage', 'x');
    const y = this.herdZahl(arg(pos, ben, 1, 'y'), 'setzeLage', 'y');
    const z = this.herdZahl(arg(pos, ben, 2, 'z'), 'setzeLage', 'z', 0);
    this.herdI(this.hk.e.teil_lage(t.id, x, y, z));
    return t;
  },
  'verschiebe': function (t, pos, ben) {
    const x = this.herdZahl(arg(pos, ben, 0, 'dx'), 'verschiebe', 'dx');
    const y = this.herdZahl(arg(pos, ben, 1, 'dy'), 'verschiebe', 'dy');
    const z = this.herdZahl(arg(pos, ben, 2, 'dz'), 'verschiebe', 'dz', 0);
    this.herdI(this.hk.e.teil_verschiebe(t.id, x, y, z));
    return t;
  },
  'drehung': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 4)); },
  'setzeDrehung': function (t, pos, ben) { this.herdI(this.hk.e.teil_setze(t.id, 4, this.herdZahl(arg(pos, ben, 0, 'g'), 'setzeDrehung', 'g'))); return t; },
  'neigung': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 5)); },
  'setzeNeigung': function (t, pos, ben) { this.herdI(this.hk.e.teil_setze(t.id, 5, this.herdZahl(arg(pos, ben, 0, 'g'), 'setzeNeigung', 'g'))); return t; },
  'rollen': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 6)); },
  'setzeRollen': function (t, pos, ben) { this.herdI(this.hk.e.teil_setze(t.id, 6, this.herdZahl(arg(pos, ben, 0, 'g'), 'setzeRollen', 'g'))); return t; },
  'schaueAuf': function (t, pos, ben) {
    const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'schaueAuf', 'x');
    const y = this.herdZahl(arg(pos, ben, 1, 'y'), 'schaueAuf', 'y');
    const z = this.herdZahl(arg(pos, ben, 2, 'z'), 'schaueAuf', 'z');
    this.herdI(this.hk.e.teil_schaue(t.id, x, y, z));
    return t;
  },
  'groesse': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 7)); },
  'groesseX': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 7)); },
  'groesseY': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 8)); },
  'groesseZ': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 9)); },
  'setzeGroesse': function (t, pos, ben) {
    const sx = this.herdZahl(arg(pos, ben, 0, 'sx'), 'setzeGroesse', 'sx');
    const sy = this.herdZahl(arg(pos, ben, 1, 'sy'), 'setzeGroesse', 'sy', sx);
    const sz = this.herdZahl(arg(pos, ben, 2, 'sz'), 'setzeGroesse', 'sz', sx);
    this.herdI(this.hk.e.teil_groesse(t.id, sx, sy, sz));
    return t;
  },
  'ebene': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 10)); },
  'setzeEbene': function (t, pos, ben) { this.herdI(this.hk.e.teil_setze(t.id, 10, this.herdZahl(arg(pos, ben, 0, 'n'), 'setzeEbene', 'n'))); return t; },
  // Getter/Setter-Überladung wie bei der Theke: ohne Argument lesen, mit diavolo setzen (K-066)
  'sichtbar': function (t, pos, ben) {
    const d = arg(pos, ben, 0, 'd');
    if (d === undefined) return this.herdF(this.hk.e.teil_hole(t.id, 11)) !== 0;
    this.herdI(this.hk.e.teil_setze(t.id, 11, this.bool(d) ? 1 : 0));
    return t;
  },
  'haenge': function (t, pos, ben) {
    const an = arg(pos, ben, 0, 'an');
    this.herdI(this.hk.e.teil_haenge(t.id, this.herdTeilId(an, 'haenge', 'an')));
    return t;
  },
  'eltern': function (t) {
    const id = this.herdF(this.hk.e.teil_hole(t.id, 13));
    return id === 0 ? null : this.herdTeilObj(id);
  },
  'kinder': function (t) {
    const e = this.hk.e;
    const ids = this.hk.liesListe((p, kap) => e.teil_kinder(t.id, p, kap));
    if (ids === null) throw this.herdFehler();
    return ids.map(id => this.herdTeilObj(id));
  },
  'entferne': function (t, pos, ben, node) { this.kniffEntferne(t, node); return null; },   // H-K13: danach beimEntfernen
  'entfernt': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 14)) !== 0; },
  'kopie': function (t) { return this.herdTeilObj(this.herdI(this.hk.e.teil_kopie(t.id))); },
  'trifft': function (t, pos, ben) {
    const b = arg(pos, ben, 0, 'anderes');
    if (!(b instanceof HerdTeil)) throw this.ananas('TypAnanas', 'trifft() braucht ein Teil für \'anderes\', nicht ' + this.darstellung(b === undefined ? null : b) + '.');
    return this.herdI(this.hk.e.teil_trifft(t.id, b.id)) === 1;
  },
  'mit': function (t, pos, ben) {
    const k = arg(pos, ben, 0, 'komponente');
    if (this.istKniff(k)) return this.kniffMit(t, k);   // H-K13: eigener Kniff statt Kern-Komponente
    if (!(k instanceof HerdKomp)) throw this.ananas('TypAnanas', 'mit() braucht eine Komponente für \'komponente\', nicht ' + this.darstellung(k === undefined ? null : k) + '.');
    this.herdI(this.hk.e.komp_haenge(k.h, t.id));
    k.teil = t.id;
    return k;
  },
  'ohne': function (t, pos, ben, node) {
    const n = arg(pos, ben, 0, 'name');
    if (this.istKniff(n)) return this.kniffOhne(t, n, node);   // H-K13
    let art;
    if (n instanceof HerdKomp) art = n.art;
    else {
      const name = this.text(n === undefined ? null : n);
      art = this.hk.schema.nachName.get(name);
      if (art === undefined) {   // unbekannt → Kern-Text „Eine Komponente 'X' gibt es nicht.“ (typ_nummer, Code 19)
        const k = this.hk;
        this.herdI(k.e.typ_nummer(k.text(name), k.len));
        throw this.ananas('LaufzeitAnanas', 'Interner Fehler im Herd: Komponente ' + name + ' fehlt im Schema.');
      }
    }
    const e = this.hk.e;
    const h = this.herdI(e.komp_von(t.id, art.nummer));
    if (h === 0) return null;
    const k = this.herdKompObj(h, art);
    this.herdI(e.komp_loese(h));
    k.teil = 0;
    return k;
  },
  'raum': function (t) { return this.herdF(this.hk.e.teil_hole(t.id, 12)) === 3 ? '3D' : '2D'; },
  'id': function (t) { this.herdF(this.hk.e.teil_hole(t.id, 12)); return t.id; },   // entfernt → Kern-Text
  'kniffe': function (t) { return this.kniffListe(t); },   // H-K13: Blech<Kniff> in Anhängereihenfolge
  // H-K16: erstes Teil im Teilbaum (Wurzel eingeschlossen) mit diesem Etikett, sonst karton
  'finde': function (t, pos, ben) {
    const n = arg(pos, ben, 0, 'name');
    if (typeof n !== 'string') throw this.ananas('TypAnanas', 'finde() braucht einen Text für \'name\', nicht ' + this.darstellung(n === undefined ? null : n) + '.');
    const k = this.hk;
    const id = this.herdI(k.e.teil_finde(t.id, k.text(n), k.len));
    return id === 0 ? null : this.herdTeilObj(id);
  },
  'alsText': function (t) { return this.text(t); }
};
function herdTeilTabelle(zugriff) {
  const t = Object.assign({}, HERD_TEIL_M);
  // teil.<komponente>() → die Komponente dieser Art oder karton
  for (const name of Object.keys(zugriff)) {
    const art = zugriff[name];
    t[name] = function (teil) { return this.herdKompVon(teil, art); };
  }
  return herdTab(t);
}

const HERD_M = herdTab({
  'backe': function (h, pos, ben, node) { const f = arg(pos, ben, 0, 'fn'); this.herdBacke(h, f === undefined ? null : f, node); return null; },
  'schliesse': function (h) {
    if (h.imRueckruf) h.schliessen = true;     // §18.2: Rückruf läuft zu Ende, dann schliesse
    else this.herdSchliesseFenster(h);
    return null;
  },
  'titel': function (h) { return h.titel; },
  'setzeTitel': function (h, pos, ben) {
    const t = arg(pos, ben, 0, 't');
    const titel = this.text(t === undefined ? null : t);
    const k = this.hk;
    this.herdI(k.e.welt_titel(k.text(titel), k.len));
    h.titel = titel;
    if (h.offen) this.herdSende('fenster', { titel: h.titel, breite: h.breite, hoehe: h.hoehe });
    return h;
  },
  'breite': function (h) { return h.breite; },
  'hoehe': function (h) { return h.hoehe; },
  'bildnummer': function (h) { return h.bildnummer; },
  'zeit': function (h) { return h.bildnummer / 60; },
  // Eingabe (SPEC §18.3)
  'taste': function (h, pos, ben) { return h.tasten.has(this.herdTaste(arg(pos, ben, 0, 'n'))); },
  'gedrueckt': function (h, pos, ben) {
    const n = this.herdTaste(arg(pos, ben, 0, 'n'));
    return h.erster && h.tasten.has(n) && !h.vorTasten.has(n);
  },
  'losgelassen': function (h, pos, ben) {
    const n = this.herdTaste(arg(pos, ben, 0, 'n'));
    return h.erster && !h.tasten.has(n) && h.vorTasten.has(n);
  },
  'mausX': function (h) { return h.mausX; },
  'mausY': function (h) { return h.mausY; },
  'maus': function (h, pos, ben) { return (h.knoepfe & this.herdMausBit(arg(pos, ben, 0, 'k'), 'maus')) !== 0; },
  'klick': function (h, pos, ben) {
    const b = this.herdMausBit(arg(pos, ben, 0, 'k'), 'klick');
    return h.erster && (h.knoepfe & b) !== 0 && (h.vorKnoepfe & b) === 0;
  },
  // Mausfang und relative Bewegung (SPEC §18.3): Bewegung/Rad nur im ersten Takt eines Ereignisses, sonst 0
  'mausFangen': function (h, pos, ben) {
    const d = arg(pos, ben, 0, 'an');
    const an = d === undefined ? true : this.bool(d);
    if (an !== h.fangWunsch) { h.fangWunsch = an; this.herdSende('mausfang', { an }); }
    return h;
  },
  'mausGefangen': function (h) { return h.gefangen; },
  'mausDX': function (h) { return h.erster ? h.bewegungX : 0; },
  'mausDY': function (h) { return h.erster ? h.bewegungY : 0; },
  'mausrad': function (h) { return h.erster ? h.rad : 0; },
  // Welt (SPEC §18.5)
  'hintergrund': function (h, pos, ben) {
    const k = this.hk, f = this.herdFarbText(arg(pos, ben, 0, 'f'));
    this.herdI(k.e.welt_hintergrund(k.text(f), k.len));
    return h;
  },
  'himmel': function (h, pos, ben) {
    const k = this.hk;
    const o = this.herdFarbText(arg(pos, ben, 0, 'oben'));
    const uw = arg(pos, ben, 1, 'unten');
    const u = uw === undefined || uw === null ? '' : this.herdFarbText(uw);
    // beide Texte in einen Austauschpuffer (gültig bis zum nächsten puffer)
    const max = (o.length + u.length) * 3 || 1;
    const p = k.e.puffer(max), m = k.mem();
    const lo = HERD_ENC.encodeInto(o, m.subarray(p, p + o.length * 3)).written;
    const lu = HERD_ENC.encodeInto(u, m.subarray(p + lo, p + max)).written;
    this.herdI(k.e.welt_himmel(p, lo, p + lo, lu));
    return h;
  },
  'umgebung': function (h, pos, ben) {
    const f = this.herdFarbText(arg(pos, ben, 0, 'f'));
    const s = this.herdZahl(arg(pos, ben, 1, 'staerke'), 'umgebung', 'staerke', 0.35);
    const k = this.hk;
    this.herdI(k.e.welt_umgebung(k.text(f), k.len, s));
    return h;
  },
  'nebel': function (h, pos, ben) {
    const f = this.herdFarbText(arg(pos, ben, 0, 'f'));
    const von = this.herdZahl(arg(pos, ben, 1, 'von'), 'nebel', 'von');
    const bis = this.herdZahl(arg(pos, ben, 2, 'bis'), 'nebel', 'bis');
    const k = this.hk;
    this.herdI(k.e.welt_nebel(k.text(f), k.len, von, bis));
    return h;
  },
  'kamera': function () { return this.herdTeilObj(1); },
  'sonne': function () { return this.herdTeilObj(2); },
  // Fabriken (Teil anlegen + Komponente anhängen; Reihenfolge der Kern-Aufrufe ist Vertrag für alle Motoren, s. herdFabrik)
  'rechteck': function (h, pos, ben) {
    const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'rechteck', 'x'), y = this.herdZahl(arg(pos, ben, 1, 'y'), 'rechteck', 'y');
    const b = this.herdZahl(arg(pos, ben, 2, 'b'), 'rechteck', 'b'), ho = this.herdZahl(arg(pos, ben, 3, 'h'), 'rechteck', 'h');
    const ru = this.herdZahl(arg(pos, ben, 5, 'rundung'), 'rechteck', 'rundung', null);
    const um = this.herdZahl(arg(pos, ben, 6, 'umriss'), 'rechteck', 'umriss', null);
    return this.herdFabrik(2, x, y, 0, 'Rechteck', ['breite', b, 'hoehe', ho, 'farbe', arg(pos, ben, 4, 'farbe'), 'rundung', ru, 'umriss', um]);
  },
  'kreis': function (h, pos, ben) {
    const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'kreis', 'x'), y = this.herdZahl(arg(pos, ben, 1, 'y'), 'kreis', 'y');
    const r = this.herdZahl(arg(pos, ben, 2, 'r'), 'kreis', 'r');
    const um = this.herdZahl(arg(pos, ben, 4, 'umriss'), 'kreis', 'umriss', null);
    return this.herdFabrik(2, x, y, 0, 'Kreis', ['radius', r, 'farbe', arg(pos, ben, 3, 'farbe'), 'umriss', um]);
  },
  'text': function (h, pos, ben) {
    const tw = arg(pos, ben, 0, 't');
    const x = this.herdZahl(arg(pos, ben, 1, 'x'), 'text', 'x'), y = this.herdZahl(arg(pos, ben, 2, 'y'), 'text', 'y');
    const g = this.herdZahl(arg(pos, ben, 3, 'groesse'), 'text', 'groesse', null);
    return this.herdFabrik(2, x, y, 0, 'Text', ['inhalt', tw === undefined ? null : this.text(tw), 'groesse', g,
      'farbe', arg(pos, ben, 4, 'farbe'), 'ausrichtung', arg(pos, ben, 5, 'ausrichtung')]);
  },
  'bild': function (h, pos, ben) {
    const b = arg(pos, ben, 0, 'b');
    const x = this.herdZahl(arg(pos, ben, 1, 'x'), 'bild', 'x'), y = this.herdZahl(arg(pos, ben, 2, 'y'), 'bild', 'y');
    const g = this.herdZahl(arg(pos, ben, 3, 'groesse'), 'bild', 'groesse', null);
    return this.herdFabrik(2, x, y, 0, 'Bild', ['bildchen', b, 'groesse', g]);
  },
  'gruppe': function (h, pos, ben) {
    const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'gruppe', 'x', 0), y = this.herdZahl(arg(pos, ben, 1, 'y'), 'gruppe', 'y', 0);
    return this.herdFabrik(2, x, y, 0, null, null);
  },
  'koerper': function (h, pos, ben) {
    const form = arg(pos, ben, 0, 'form');
    const x = this.herdZahl(arg(pos, ben, 1, 'x'), 'koerper', 'x', 0), y = this.herdZahl(arg(pos, ben, 2, 'y'), 'koerper', 'y', 0);
    const z = this.herdZahl(arg(pos, ben, 3, 'z'), 'koerper', 'z', 0);
    const gl = this.herdZahl(arg(pos, ben, 5, 'glanz'), 'koerper', 'glanz', null);
    const le = this.herdZahl(arg(pos, ben, 6, 'leuchten'), 'koerper', 'leuchten', null);
    return this.herdFabrik(3, x, y, z, 'Koerper', ['form', form, 'farbe', arg(pos, ben, 4, 'farbe'), 'glanz', gl, 'leuchten', le,
      'bild', arg(pos, ben, 7, 'bild')]);
  },
  'licht': function (h, pos, ben) {
    const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'licht', 'x'), y = this.herdZahl(arg(pos, ben, 1, 'y'), 'licht', 'y');
    const z = this.herdZahl(arg(pos, ben, 2, 'z'), 'licht', 'z');
    const rw = this.herdZahl(arg(pos, ben, 4, 'reichweite'), 'licht', 'reichweite', null);
    return this.herdFabrik(3, x, y, z, 'Licht', ['farbe', arg(pos, ben, 3, 'farbe'), 'reichweite', rw]);
  },
  'raum': function (h, pos, ben) {
    const x = this.herdZahl(arg(pos, ben, 0, 'x'), 'raum', 'x', 0), y = this.herdZahl(arg(pos, ben, 1, 'y'), 'raum', 'y', 0);
    const z = this.herdZahl(arg(pos, ben, 2, 'z'), 'raum', 'z', 0);
    return this.herdFabrik(3, x, y, z, null, null);
  },
  // H-K16: herd.modell(m, x, y, z) → neue 3D-Wurzel mit einem Teil je glTF-Knoten (Kern modell_teil)
  'modell': function (h, pos, ben) {
    const m = arg(pos, ben, 0, 'modell');
    if (!(m instanceof HerdModell)) throw this.ananas('TypAnanas', 'modell() braucht ein Modell für \'modell\', nicht ' + this.darstellung(m === undefined ? null : m) + '.');
    const x = this.herdZahl(arg(pos, ben, 1, 'x'), 'modell', 'x', 0), y = this.herdZahl(arg(pos, ben, 2, 'y'), 'modell', 'y', 0);
    const z = this.herdZahl(arg(pos, ben, 3, 'z'), 'modell', 'z', 0);
    return this.herdTeilObj(this.herdI(this.hk.e.modell_teil(m.id, x, y, z)));
  },
  'alsText': function (h) { return this.text(h); }
});

// statisch: Herd.farbe(r, g, b, a = 1) → "#rrggbbaa" (SPEC §18.1; reine Hilfe, kein Kern-Aufruf)
const HERD_MOD_M = herdTab({
  'farbe': function (m, pos, ben) {
    const hex = (v) => { const s = v.toString(16); return s.length < 2 ? '0' + s : s; };
    const kanal = (v, n) => hex(Math.min(255, Math.max(0, Math.round(this.herdZahl(v, 'farbe', n)))));
    const r = kanal(arg(pos, ben, 0, 'r'), 'r'), g = kanal(arg(pos, ben, 1, 'g'), 'g'), b = kanal(arg(pos, ben, 2, 'b'), 'b');
    const a = this.herdZahl(arg(pos, ben, 3, 'a'), 'farbe', 'a', 1);
    return '#' + r + g + b + hex(Math.round(Math.min(1, Math.max(0, a)) * 255));
  }
});

// statisch: Grundformen (form_grund: 1 Würfel, 2 Kugel, 3 Zylinder, 4 Kegel, 5 Ebene, 6 Ring)
const HERD_FORM_MOD_M = herdTab({
  'wuerfel': function () { return this.herdForm(this.hk_().e.form_grund(1, 0, 0)); },
  'kugel': function (m, pos, ben) { const n = this.herdZahl(arg(pos, ben, 0, 'teile'), 'kugel', 'teile', 24); return this.herdForm(this.hk_().e.form_grund(2, n, 0)); },
  'zylinder': function (m, pos, ben) { const n = this.herdZahl(arg(pos, ben, 0, 'teile'), 'zylinder', 'teile', 32); return this.herdForm(this.hk_().e.form_grund(3, n, 0)); },
  'kegel': function (m, pos, ben) { const n = this.herdZahl(arg(pos, ben, 0, 'teile'), 'kegel', 'teile', 32); return this.herdForm(this.hk_().e.form_grund(4, n, 0)); },
  'ebene': function () { return this.herdForm(this.hk_().e.form_grund(5, 0, 0)); },
  'ring': function (m, pos, ben) {
    const d = this.herdZahl(arg(pos, ben, 0, 'dicke'), 'ring', 'dicke', 0.3);
    const n = this.herdZahl(arg(pos, ben, 1, 'teile'), 'ring', 'teile', 32);
    return this.herdForm(this.hk_().e.form_grund(6, n, d));
  }
});
const HERD_FORM_M = herdTab({
  'id': function (f) { return f.id; },
  'alsText': function (f) { return this.text(f); }
});
const HERD_BILDCHEN_M = herdTab({
  'breite': function (b) { return b.breite; },
  'hoehe': function (b) { return b.hoehe; },
  'id': function (b) { return b.id; },
  'alsText': function (b) { return this.text(b); }
});
// statisch: Bildchen.laden(pfad) – PNG/JPEG aus der Kiste als eigene Textur (SPEC §18.5, K-145)
const HERD_BILDCHEN_MOD_M = herdTab({
  'laden': function (m, pos, ben) { return this.herdBildchenLaden(arg(pos, ben, 0, 'pfad')); }
});
// Modell (H-K16): Knotennamen, Folgen (Animationen, ab H-K23a), geteilte Beläge, Hülle der Ruhelage
const HERD_MODELL_M = herdTab({
  'namen': function (m) { return this.herdModellNamen(m, 1); },
  'folgen': function (m) { return this.herdModellNamen(m, 2); },
  'belaege': function (m) {
    const e = this.hk.e, n = this.herdF(e.modell_info(m.id, 3)), aus = [];
    for (let i = 0; i < n; i++) aus.push(this.herdTeilObj(this.herdF(e.modell_info(m.id, 100 + i))));
    return aus;
  },
  'breite': function (m) { return this.herdF(this.hk.e.modell_info(m.id, 4)); },
  'hoehe': function (m) { return this.herdF(this.hk.e.modell_info(m.id, 5)); },
  'tiefe': function (m) { return this.herdF(this.hk.e.modell_info(m.id, 6)); },
  'alsText': function (m) { return this.text(m); }
});
// statisch: Modell.laden(pfad) – glTF aus der Kiste (SPEC §18.5, K-161)
const HERD_MODELL_MOD_M = herdTab({
  'laden': function (m, pos, ben) { return this.herdModellLaden(arg(pos, ben, 0, 'pfad')); }
});
TABELLEN.set(HerdWelt, HERD_M);
TABELLEN.set(HerdForm, HERD_FORM_M);
TABELLEN.set(HerdBildchen, HERD_BILDCHEN_M);
TABELLEN.set(HerdModell, HERD_MODELL_M);

// P0013 und Kern-Bedarf: alle neu-Ausdrücke und statischen Zugriffe (Form.…, Herd.…, Bildchen.…, Modell.…) des Programms, nach Position sortiert
function herdSammle(ast) {
  const out = [], gesehen = new Set();
  const geh = (x) => {
    if (x === null || typeof x !== 'object' || gesehen.has(x)) return;
    gesehen.add(x);
    if (Array.isArray(x)) { for (const y of x) geh(y); return; }
    if (x.k === 'Neu' && x.typ) out.push(x);
    else if ((x.k === 'MCall' || x.k === 'Mem') && x.obj && x.obj.k === 'Name' && (x.obj.n === 'Form' || x.obj.n === 'Herd' || x.obj.n === 'Bildchen' || x.obj.n === 'Modell')) out.push(x);
    for (const k in x) { const v = x[k]; if (v !== null && typeof v === 'object') geh(v); }
  };
  geh(ast);
  return out.sort((a, b) => (a.z - b.z) || (a.s - b.s));
}
