// pizza-Interpreter · Standardbibliothek: Kiste (Projektdateien lesen, SPEC §11.2, K-146)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).
//
// Die Kiste ist die Sammlung des Laders ohne pruefung/ (this.kiste = ladeProjekt(…).kiste: Texte normalisiert, sonst
// Uint8Array). Nur lesend, in Stücken einer brigade erlaubt (keine Hauptküchen-Sperre). „Text“ entscheidet die Endung
// (istTextPfad, projekt.js), nie der Inhalt.

function kisteHat(kiste, pfad) { return Object.prototype.hasOwnProperty.call(kiste, pfad); }

const KISTE_M = tabelle({
  'text': function (m, pos, ben) { return this.kisteText(arg(pos, ben, 0, 'pfad'), 'text'); },
  'zeilen': function (m, pos, ben) {
    const t = this.kisteText(arg(pos, ben, 0, 'pfad'), 'zeilen');
    const z = t.split('\n');
    if (z[z.length - 1] === '') z.pop();
    return z;
  },
  'gibts': function (m, pos, ben) {
    const p = this.kistePfad(arg(pos, ben, 0, 'pfad'), 'gibts', 'pfad');
    return kisteHat(this.kiste, p);   // nur Dateien; ein ungültiger Pfad steht nie in der Kiste
  },
  'liste': function (m, pos, ben) {
    const o = arg(pos, ben, 0, 'ordner');
    const ordner = o === undefined ? '' : this.kistePfad(o, 'liste', 'ordner');
    const alle = Object.keys(this.kiste).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));   // Pfade sind ASCII: = Bytefolge
    if (ordner === '') return alle;
    if (pruefePfad(ordner) !== null) return [];
    const vor = ordner + '/';
    return alle.filter(p => p.slice(0, vor.length) === vor);
  }
});

class KisteLaufzeit {
  // Argument muss ein Text sein (SPEC §11.2) – TypAnanas mit Methoden- und Parametername
  kistePfad(v, wo, param) {
    if (typeof v === 'string') return v;
    throw this.ananas('TypAnanas', 'Kiste.' + wo + '() braucht einen Text für \'' + param + '\', nicht ' + this.darstellung(v === undefined ? null : v) + '.');
  }
  kisteText(v, wo) {
    const p = this.kistePfad(v, wo, 'pfad');
    if (!kisteHat(this.kiste, p)) throw this.ananas('LaufzeitAnanas', 'Die Datei "' + p + '" liegt nicht in der Kiste.');
    const t = this.kiste[p];
    if (!istTextPfad(p) || typeof t !== 'string') throw this.ananas('LaufzeitAnanas', p + ' ist kein Text.');
    return t;
  }
}
laufzeitTeil(KisteLaufzeit);
