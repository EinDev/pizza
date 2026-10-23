// pizza-Interpreter · Theke: Zutaten-Klassen, Stil, Methodentabellen (THEKE.md)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// ---------- Theke (UI-Framework, THEKE.md) ----------
const UI_KLASSEN = {
  Schild: 'schild', Knopf: 'knopf', Eingabe: 'eingabe', Haken: 'haken', Stapel: 'stapel', Reihe: 'reihe',
  Takt: 'takt', Fortschritt: 'fortschritt', Abschnitt: 'abschnitt', Tabelle: 'tabelle', Reiter: 'reiter',
  Auswahl: 'auswahl', Tastatur: 'tastatur'
};
const UI_ART_NAME = {
  schild: 'Schild', knopf: 'Knopf', eingabe: 'Eingabe', haken: 'Haken', stapel: 'Stapel', reihe: 'Reihe',
  takt: 'Takt', fortschritt: 'Fortschritt', abschnitt: 'Abschnitt', tabelle: 'Tabelle', reiter: 'Reiter',
  auswahl: 'Auswahl', tastatur: 'Tastatur'
};
const UI_BEHAELTER = { stapel: true, reihe: true, abschnitt: true, reiter: true };
// Stil-Whitelist (K-068, K-113, K-120): Reihenfolge der Schlüssel ist der Erlaubt-Text der Fehlermeldung (beide Laufzeiten gleich).
// 'zahl' = Zahl ≥ 0, 'ganzzahl' = ganze Zahl ≥ 1, Liste = Vokabular.
const UI_STIL = {
  breite: 'zahl', hoehe: 'zahl', abstand: 'zahl',
  ausrichtung: ['links', 'mitte', 'rechts'],
  schrift: ['klein', 'normal', 'gross', 'mono', 'riesig'],
  farbe: ['tomate', 'basilikum', 'mozzarella', 'kruste', 'normal'],
  zeilen: 'ganzzahl', mindestbreite: 'zahl',
  // Theke v6 (K-120): senkrechte Lage – an einer Reihe für ihre Kinder, an einer Zutat direkt in einer Reihe für sich selbst
  senkrecht: ['oben', 'mitte', 'unten', 'strecken'],
  // Theke v7 (K-126): Spaltengewichte einer Tabelle – Blech aus Zahlen > 0
  spalten: 'gewichte'
};
// Theke v3 (K-090): Animationsarten (Laufzeit-Liste; Renderer-Registry kennt dieselben Namen)
const UI_ANIMATIONEN = ['puls', 'huepfen', 'wackeln', 'funkeln', 'einblenden', 'aufpoppen'];
const UI_ANIM_MAX = 32;  // höchstens 32 Einträge je aendere-Nachricht, weitere entfallen still
// Theke v5 (K-116): höchstens 100 Durchläufe je Synchronisationspunkt, dann LaufzeitAnanas (Zyklus)
const UI_BINDUNG_DURCHLAEUFE = 100;
// K-117: Gleichheit je Feld – Listen elementweise (zeilen verschachtelt), sonst nach Wert
function uiGleich(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!uiGleich(a[i], b[i])) return false;
    return true;
  }
  return a === b;
}
class UiTheke {
  constructor(titel, breite, hoehe) {
    this.titel = titel; this.breite = breite; this.hoehe = hoehe;
    this.wurzel = null; this.gezeigt = false; this.geschlossen = false;
  }
}
class UiZutat {
  constructor(art, id) {
    this.art = art; this.id = id; this.eltern = null; this.sichtbar = true; this.stil = null;
    this.text = ''; this.wert = ''; this.platzhalter = ''; this.an = false; this.aktiv = true;
    this.kinder = UI_BEHAELTER[art] === true ? [] : null;
    this.beiKlick = null; this.beiAenderung = null; this.beiEnter = null;
    this.stilNull = null; this.hinweis = ''; this.uebergang = false;
    this.marke = '';                                       // Theke v6 (K-124): Marke am Reiter-Tab dieser Seite
    this.intervall = 1000; this.beiTakt = null;            // Takt
    this.fortschritt = 0;                                  // Fortschritt (wert 0…1)
    this.titel = ''; this.titelListe = null; this.gewaehlt = 1;  // Abschnitt / Reiter / Auswahl
    this.klappbar = false; this.zu = false;                // Abschnitt (K-108)
    this.optionen = null;                                  // Auswahl (K-109)
    this.beiTaste = null;                                  // Tastatur (K-110)
    this.spalten = null; this.zeilen = null;               // Tabelle
    this.abh = null;        // Theke v5 (K-116): Protokollfeld → Set<UiBindung>, die dieses Feld gelesen haben
    this.bindungen = null;  // Theke v5: Feld bzw. 's:'+Stilschlüssel → UiBindung
  }
}
// Theke v5 (K-116): Zettel – beobachtbarer Wert (keine Zutat); abh wie bei UiZutat (Feld 'wert')
// Theke v7 (K-125): abl = UiBindung eines abgeleiteten Zettels (Zettel.aus(fn)), sonst null
class Zettel { constructor(w) { this.w = w; this.abh = null; this.abl = null; } }
// Theke v5 (K-116): eine Bindung – Zutat z, Eigenschaft/Stilschlüssel feld, Ausdruck fn, Aufrufstelle node (W0103);
// quellen = flache Liste [objekt, feld, objekt, feld, …] der zuletzt gelesenen Quellen
class UiBindung {
  constructor(z, feld, stil, fn, node) {
    this.z = z; this.feld = feld; this.stil = stil; this.fn = fn; this.node = node;
    this.dirty = true; this.quellen = []; this.erst = true;
  }
}

const ZUTAT_M = {
  'id': function (z) { return z.id; },
  'hinweis': function (z, pos) {
    if (!pos.length) { this.uiLies(z, 'hinweis'); return z.hinweis; }
    this.uiSetze(z, 'hinweis', this.uiWandle(z, 'hinweis', pos[0]), 'setter');
    return z;
  },
  // Theke v6 (K-124): Marke (Badge) – der Reiter zeigt sie am Tab dieser Seite; optionales Feld wie hinweis
  'marke': function (z, pos) {
    if (!pos.length) { this.uiLies(z, 'marke'); return z.marke; }
    this.uiSetze(z, 'marke', this.uiWandle(z, 'marke', pos[0]), 'setter');
    return z;
  },
  'uebergang': function (z, pos) {
    if (!pos.length) { this.uiLies(z, 'uebergang'); return z.uebergang; }
    this.uiSetze(z, 'uebergang', this.uiWandle(z, 'uebergang', pos[0]), 'setter');
    return z;
  },
  'animiere': function (z, pos, ben, node) {
    const a = arg(pos, ben, 0, 'art');
    const art = this.text(a === undefined ? null : a);
    if (UI_ANIMATIONEN.indexOf(art) < 0) throw this.ananas('LaufzeitAnanas', 'Animation \'' + art + '\' gibt es nicht. Erlaubt: ' + UI_ANIMATIONEN.join(', ') + '.');
    const dauer = this.uiAnimDauer(arg(pos, ben, 1, 'dauer'), 'animiere');
    if (!this.uiAnimOffen(z, node)) return z;
    const e = { id: z.id, art };
    if (dauer !== null) e.dauer = dauer;
    this.uiAnimPuffer(e);
    return z;
  },
  'sichtbar': function (z, pos) {
    if (!pos.length) { this.uiLies(z, 'sichtbar'); return z.sichtbar; }
    this.uiSetze(z, 'sichtbar', this.uiWandle(z, 'sichtbar', pos[0]), 'setter');
    return z;
  },
  'stil': function (z, pos) {
    const k = this.text(pos[0]);
    if (UI_STIL[k] === undefined) throw this.ananas('LaufzeitAnanas', 'Stil \'' + k + '\' gibt es nicht. Erlaubt: ' + Object.keys(UI_STIL).join(', ') + '.');
    this.uiSetzeStil(z, k, this.uiStilWert(k, pos[1]), 'setter');
    return z;
  },
  // Theke v5 (K-116): Eigenschaft bzw. Stil an einen Ausdruck binden; karton löst die Bindung
  'binde': function (z, pos, ben, node) { this.uiBinde(z, pos, node, false); return z; },
  'bindeStil': function (z, pos, ben, node) { this.uiBinde(z, pos, node, true); return z; },
  'alsText': function (z) { return this.text(z); }
};
function uiTabelle(eigen) { return tabelle(Object.assign({}, ZUTAT_M, eigen)); }
// Setter: Argument prüfen/umwandeln (wie die Bindung desselben Namens), dann über die zentrale Schreibstelle uiSetze (K-116/K-117)
function uiSetter(feld) {
  return function (z, pos) { this.uiSetze(z, feld, this.uiWandle(z, feld, pos[0]), 'setter'); return z; };
}
// Getter/Setter-Überladung (aktiv, sichtbar, hinweis, uebergang, klappbar, zu): ohne Argument Getter (Quelle einer Bindung)
function uiUeberladen(feld) {
  return function (z, pos) {
    if (!pos.length) { this.uiLies(z, feld); return z[feld]; }
    this.uiSetze(z, feld, this.uiWandle(z, feld, pos[0]), 'setter');
    return z;
  };
}
const UI_TEXT_M = {
  'text': function (z) { this.uiLies(z, 'text'); return z.text; },
  'setzeText': uiSetter('text')
};
const UI_CONTAINER_M = {
  'hinzu': function (z, pos) { this.uiKind(z, pos[0]); this.uiAendere(z, 'kinder', null); return z; },
  'leeren': function (z) {
    if (z.kinder.length === 0) return z;  // K-117: leeren eines leeren Behälters ändert nichts
    for (const k of z.kinder) k.eltern = null;
    z.kinder = [];
    this.uiAendere(z, 'kinder', null);
    return z;
  }
};
const UI_AKTIV_M = { 'aktiv': uiUeberladen('aktiv') };
const UI_TABELLEN = {
  schild: uiTabelle(UI_TEXT_M),
  knopf: uiTabelle(Object.assign({}, UI_TEXT_M, UI_AKTIV_M, {
    'beiKlick': function (z, pos) { z.beiKlick = this.uiFunktion(pos[0], 'beiKlick'); return z; }
  })),
  eingabe: uiTabelle({
    'wert': function (z) { this.uiLies(z, 'wert'); return z.wert; },
    'setzeWert': uiSetter('wert'),
    'beiAenderung': function (z, pos) { z.beiAenderung = this.uiFunktion(pos[0], 'beiAenderung'); return z; },
    'beiEnter': function (z, pos) { z.beiEnter = this.uiFunktion(pos[0], 'beiEnter'); return z; }
  }),
  haken: uiTabelle(Object.assign({}, UI_TEXT_M, {
    'an': function (z) { this.uiLies(z, 'an'); return z.an; },
    'setzeAn': uiSetter('an'),
    'beiAenderung': function (z, pos) { z.beiAenderung = this.uiFunktion(pos[0], 'beiAenderung'); return z; }
  })),
  stapel: uiTabelle(UI_CONTAINER_M),
  reihe: uiTabelle(UI_CONTAINER_M),
  takt: uiTabelle(Object.assign({}, UI_AKTIV_M, {
    'intervall': function (z) { this.uiLies(z, 'intervall'); return new Dauer(z.intervall); },
    'setzeIntervall': uiSetter('intervall'),
    'beiTakt': function (z, pos) { z.beiTakt = this.uiFunktion(pos[0], 'beiTakt'); return z; }
  })),
  fortschritt: uiTabelle({
    'wert': function (z) { this.uiLies(z, 'wert'); return z.fortschritt; },
    'setzeWert': uiSetter('wert'),
    'text': function (z) { this.uiLies(z, 'text'); return z.text; },
    // K-102: text ist ein optionales Feld (K-067) – karton/fehlend löscht den Text (uiWandle)
    'setzeText': uiSetter('text')
  }),
  abschnitt: uiTabelle(Object.assign({}, UI_CONTAINER_M, {
    'titel': function (z) { this.uiLies(z, 'titel'); return z.titel; },
    'setzeTitel': uiSetter('titel'),
    // K-108: klappbar/zu – Getter/Setter-Überladung wie sichtbar; beiAenderung(fn) → fn(zu)
    'klappbar': uiUeberladen('klappbar'),
    'zu': uiUeberladen('zu'),
    'beiAenderung': function (z, pos) { z.beiAenderung = this.uiFunktion(pos[0], 'beiAenderung'); return z; }
  })),
  tabelle: uiTabelle({
    'spalten': function (z) { this.uiLies(z, 'spalten'); return z.spalten.slice(); },
    'setzeSpalten': uiSetter('spalten'),
    'zeilen': function (z) { this.uiLies(z, 'zeilen'); return z.zeilen.map(x => x.slice()); },
    'setzeZeilen': uiSetter('zeilen')
  }),
  reiter: uiTabelle({
    'waehle': uiSetter('gewaehlt'),
    'gewaehlt': function (z) { this.uiLies(z, 'gewaehlt'); return z.gewaehlt; },
    'beiAenderung': function (z, pos) { z.beiAenderung = this.uiFunktion(pos[0], 'beiAenderung'); return z; },
    // K-107: Titel einer Seite lesen/setzen; Titelliste wird mit "" aufgefüllt, Nachricht als ganze Liste
    'titel': function (z, pos) {
      const n = this.reiterSeite(z, pos[0]);
      this.uiLies(z, 'titel');
      return n <= z.titelListe.length ? z.titelListe[n - 1] : '';
    },
    'setzeTitel': function (z, pos) {
      const n = this.reiterSeite(z, pos[0]);
      const liste = z.titelListe.slice();
      while (liste.length < n) liste.push('');
      liste[n - 1] = this.text(pos[1]);  // K-102: karton → "karton" (Zustandsfeld)
      this.uiSetze(z, 'titel', liste, 'setter');
      return z;
    }
  }),
  // K-109: Auswahl – genau eine Option gewählt
  auswahl: uiTabelle(Object.assign({}, UI_AKTIV_M, {
    'optionen': function (z) { this.uiLies(z, 'optionen'); return z.optionen.slice(); },
    'setzeOptionen': uiSetter('optionen'),
    'waehle': uiSetter('gewaehlt'),
    'gewaehlt': function (z) { this.uiLies(z, 'gewaehlt'); return z.gewaehlt; },
    'beiAenderung': function (z, pos) { z.beiAenderung = this.uiFunktion(pos[0], 'beiAenderung'); return z; }
  })),
  // K-110: Tastatur – unsichtbare Zutat wie Takt
  tastatur: uiTabelle(Object.assign({}, UI_AKTIV_M, {
    'beiTaste': function (z, pos) { z.beiTaste = this.uiFunktion(pos[0], 'beiTaste'); return z; }
  }))
};
// Theke v5 (K-116): bindbare Eigenschaften je Art (Reihenfolge = Fehlertext „Bindbar: …“); sichtbar, hinweis, marke (K-124) für jede Zutat
const UI_BINDBAR = {
  schild: ['text'], knopf: ['text', 'aktiv'], eingabe: ['wert'], haken: ['text', 'an'], stapel: [], reihe: [],
  takt: ['aktiv', 'intervall'], fortschritt: ['wert', 'text'], abschnitt: ['titel', 'klappbar', 'zu'], tabelle: ['spalten', 'zeilen'],
  reiter: ['gewaehlt'], auswahl: ['optionen', 'gewaehlt', 'aktiv'], tastatur: ['aktiv']
};
const UI_BINDBAR_ALLE = ['sichtbar', 'hinweis', 'marke'];
// Protokollfeld → internes Feld der UiZutat, wo die Namen abweichen
const UI_FELD_INTERN = { 'fortschritt.wert': 'fortschritt', 'reiter.titel': 'titelListe' };
const THEKE_M = tabelle({
  'zeige': function (t, pos) { this.uiZeige(t, pos[0]); return t; },
  'bediene': function (t, pos, ben, node) { this.uiBediene(t, node); return null; },
  'schliesse': function (t) { this.uiSchliesse(t); return null; },
  'setzeTitel': function (t, pos) {
    t.titel = this.text(pos[0]);
    if (t.gezeigt && !t.geschlossen) { this.uiFlush(); this.uiSende({ v: 1, op: 'fenster', titel: t.titel, breite: t.breite, hoehe: t.hoehe }); }
    return t;
  },
  'titel': function (t) { return t.titel; },
  'schwebe': function (t, pos, ben, node) {
    const tx = arg(pos, ben, 0, 'text');
    const text = this.text(tx === undefined ? null : tx);
    let bei = arg(pos, ben, 1, 'bei');
    if (bei === undefined) bei = null;
    if (bei !== null && !(bei instanceof UiZutat)) throw this.ananas('TypAnanas', 'schwebe(bei: …) braucht eine Zutat, nicht ' + this.darstellung(bei) + '.');
    let farbe = arg(pos, ben, 2, 'farbe');
    if (farbe === undefined) farbe = null;
    if (farbe !== null) {
      farbe = this.text(farbe);
      if (UI_STIL.farbe.indexOf(farbe) < 0) throw this.ananas('LaufzeitAnanas', 'Wert \'' + farbe + '\' ist für Stil \'farbe\' nicht erlaubt. Erlaubt: ' + UI_STIL.farbe.join(', ') + '.');
    }
    const dauer = this.uiAnimDauer(arg(pos, ben, 3, 'dauer'), 'schwebe');
    if (!this.uiAnimOffen(bei, node)) return t;
    const e = { art: 'schwebe', text };
    if (bei !== null) e.id = bei.id;
    if (farbe !== null) e.farbe = farbe;
    if (dauer !== null) e.dauer = dauer;
    this.uiAnimPuffer(e);
    return t;
  },
  'alsText': function (t) { return this.text(t); }
});
// Theke v5 (K-116): Zettel – beobachtbarer Wert. setze meldet nur bei ungleichem Wert (Gleichheit wie ==, K-017).
const ZETTEL_M = tabelle({
  'wert': function (z) { this.uiLies(z, 'wert'); return z.w; },
  'setze': function (z, pos) {
    // K-125: ein abgeleiteter Zettel hat einen Schreiber – seinen Ausdruck
    if (z.abl !== null) throw this.ananas('LaufzeitAnanas', 'Der Zettel ist abgeleitet – setze seine Quellen, nicht ihn.');
    const w = pos.length && pos[0] !== undefined ? pos[0] : null;
    if (!this.gleich(z.w, w)) { z.w = w; this.uiSchmutzig(z, 'wert'); }
    return z;
  },
  'alsText': function (z) { return this.text(z); }
});
// Theke v7 (K-125): Zettel.aus(fn) – abgeleiteter Zettel (wird wie eine Bindung ausgewertet, Ziel ist sein Wert)
const ZETTEL_MOD_M = tabelle({
  'aus': function (m, pos, ben, node) { return this.uiZettelAus(pos, node); }
});
