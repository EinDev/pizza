'use strict';
/*
 * Kaputte Eingaben für Robustheits-Fuzzing: Mutationen gültiger Programme + Token-Suppe + Bytesalat.
 * Erwartung an alle Motoren: nie eine JS-Exception, immer Ereignis-API mit genau einem "ende".
 */
const { Zufall } = require('./zufall');

const POOL = ['klasse', 'X', '{', '}', '(', ')', '((', '))', ';', 'serviere', '"', '"a"', '1.5s', '->', '@', '@Nach(', 'falls', 'sonst',
  '[', ']', '..', ',', 'wähle', 'fall', 'standard', 'ofen', 'roh', 'verbrannt', 'probier', 'rand', '/*', '*/', '//', '\n', 'Tomate', 'Ananas',
  '=', '+', '-', '*', '/', '%', 'ä', '#', '\\', 'neu', '<', '>', 'karton', 'dies', 'unten', 'erbt', 'calzone', 'hawaii', 'salami', 'x',
  'Bote.sage((', 'wirf', 'neu StreitAnanas("x")', 'für', 'solange', 'abbrechen;', 'weiter;', 'zwischenstand((', 'teig', 'bestelle', 'schieb(',
  'teile(', 'Bestellannahme.lies()', 'Bote.schreibe((', '9'.repeat(40), '0.', '1e5', '\u0000', '​', '🍕', '\t', '\r', 'quattrostagioni',
  'rezeptur', 'erfüllt', 'rohling', 'gebacken', 'tiefkühl', 'geheimrezept', '@Kühlschrank(haltbar: 1s)', 'Uhr.vorspulen(', 'Spiegel.felder(',
  '.brigade(', '.brigade(x -> ', 'brigade', 'KüchenAnanas', '.schneide(', 'serviere ((x -> x));'];

function mutiere(code, seed) {
  const z = new Zufall(seed);
  let s = code;
  const runden = z.int(1, 4);
  for (let r = 0; r < runden; r++) {
    const pos = z.int(0, s.length);
    const art = z.int(0, 11);
    switch (art) {
      case 0: s = s.slice(0, pos) + s.slice(Math.min(s.length, pos + z.int(1, 20))); break;                 // löschen
      case 1: s = s.slice(0, pos) + z.wahl(POOL) + s.slice(pos); break;                                        // Token einfügen
      case 2: s = s.slice(0, pos); break;                                                                      // abschneiden
      case 3: { const l = s.split('\n'); const i = z.int(0, l.length - 1); l.splice(i, 0, l[i]); s = l.join('\n'); break; } // Zeile doppeln
      case 4: { const l = s.split('\n'); const i = z.int(0, l.length - 1), j = z.int(0, l.length - 1); [l[i], l[j]] = [l[j], l[i]]; s = l.join('\n'); break; }
      case 5: s = s.slice(0, pos) + String.fromCodePoint(z.wahl([0, 7, 0x7f, 0xa0, 0x2028, 0xfeff, 0xd7ff, 0x1f34d, z.int(1, 0x2fff)])) + s.slice(pos); break;
      case 6: { const k = z.int(1, 400); s = s.slice(0, pos) + '('.repeat(k) + '1' + ')'.repeat(z.chance(0.5) ? k : z.int(0, k)) + s.slice(pos); break; }
      case 7: s = s.slice(0, pos) + z.wahl(['"', '/*', '{', '}', '((', '))', '@', '\\']) + s.slice(pos); break;
      case 8: { const l = s.split('\n'); l.splice(z.int(0, l.length - 1), 1); s = l.join('\n'); break; }       // Zeile löschen
      case 9: s = s.replace(/\(\(/g, () => (z.chance(0.1) ? '(' : '((')); break;                                // Klammerpflicht verletzen
      case 10: s = s.replace(/;/g, () => (z.chance(0.05) ? '' : ';')); break;                                  // Semikolons weg
      default: { const a = z.int(0, s.length), b = z.int(0, s.length); s = s.slice(0, Math.min(a, b)) + s.slice(Math.max(a, b)) + s.slice(Math.min(a, b), Math.max(a, b)); }
    }
  }
  return s;
}

function suppe(seed) {
  const z = new Zufall(seed);
  if (z.chance(0.2)) {
    // Bytesalat (inkl. ungültiger Surrogate/Steuerzeichen)
    let s = '';
    const n = z.int(0, 200);
    for (let i = 0; i < n; i++) s += String.fromCharCode(z.chance(0.7) ? z.int(32, 126) : z.int(0, 0xffff));
    return s;
  }
  let q = '';
  const n = z.int(0, 40);
  for (let j = 0; j < n; j++) q += z.wahl(POOL) + (z.chance(0.5) ? ' ' : '');
  return q;
}

module.exports = { mutiere, suppe };
