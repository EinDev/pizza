// pizza-Interpreter · Tabellen-Register, Bindungs- und Hauptküchen-Sperren
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

const TABELLEN = new Map([
  [Dauer, DAUER_M], [EnumWert, ENUM_M], [Teig, TEIG_M], [Lieferung, LIEF_M],
  [Zustellung, ZUST_M], [Reste, RESTE_M], [OfenRoh, ROH_M],
  [Funktion, FN_M], [Gebunden, FN_M], [NativFn, FN_M], [UiTheke, THEKE_M], [Zettel, ZETTEL_M], [ZufallGen, ZUFALL_OBJ_M], [Kammer, KAMMER_M]
]);

// K-118: Eine Bindung rechnet nur – in ihrem Ausdruck werfen alle Methoden außer den Gettern (Methodenname wie gerufen);
// Getter/Setter-Überladungen (aktiv, sichtbar, …) nur mit Argument. Rückruf-Registrierungen (bei…) stehen nicht auf der
// Verbotsliste von K-118 und bleiben erlaubt.
const UI_REIN = new Set(['id', 'alsText', 'text', 'wert', 'an', 'intervall', 'titel', 'gewaehlt', 'optionen', 'spalten', 'zeilen',
  'beiKlick', 'beiAenderung', 'beiEnter', 'beiTakt', 'beiTaste']);
const UI_UEBERLADEN = new Set(['aktiv', 'sichtbar', 'hinweis', 'marke', 'uebergang', 'klappbar', 'zu']);
function nurRechnen(tab) {
  for (const k of Object.keys(tab)) {
    if (UI_REIN.has(k)) continue;
    const f = tab[k], ueber = UI_UEBERLADEN.has(k);
    tab[k] = function (o, pos) {
      if (this.uiBindungLauf !== null && !(ueber && pos.length === 0)) {
        throw this.ananas('LaufzeitAnanas', 'Eine Bindung rechnet nur – \'' + k + '\' ist darin nicht erlaubt.');
      }
      return f.apply(this, arguments);
    };
  }
}
for (const t of new Set([THEKE_M, ZETTEL_M, ZETTEL_MOD_M].concat(Object.values(UI_TABELLEN)))) nurRechnen(t);

// Regel S4 (THREADS.md §2.3): Eingabe und Theke gibt es nur in der Hauptküche – jede Methode wirft in einer Küche.
function nurHauptkueche(tab, text) {
  for (const k of Object.keys(tab)) {
    const f = tab[k];
    tab[k] = function () {
      if (this.kueche !== null) throw this.ananas('KüchenAnanas', text);
      return f.apply(this, arguments);
    };
  }
}
nurHauptkueche(EINGABE_M, 'Bestellannahme gibt es nur in der Hauptküche.');
for (const t of new Set([THEKE_M].concat(Object.values(UI_TABELLEN)))) nurHauptkueche(t, 'Die Theke gibt es nur in der Hauptküche.');
nurHauptkueche(ZETTEL_M, 'Zettel gibt es nur in der Hauptküche.');
nurHauptkueche(ZETTEL_MOD_M, 'Zettel gibt es nur in der Hauptküche.');
