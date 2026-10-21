// Programm-Argumente wie in der Kommandozeile (für hauptgang(Blech<margherita> args)).
// Regel: Werte durch Leerzeichen getrennt. Werte mit Leerzeichen in "doppelte" oder 'einfache' Anführungszeichen.
// In "…" steht \" für ein Anführungszeichen und \\ für einen Backslash; '…' wird wörtlich genommen.
// Leere Werte gehen mit "" bzw. ''. Ein fehlendes schließendes Anführungszeichen schließt am Ende automatisch.

export const ARGUMENTE_HILFE =
  'Argumente für hauptgang(args) – wie in der Kommandozeile: durch Leerzeichen getrennt, Werte mit Leerzeichen in ' +
  'Anführungszeichen, z. B.  Luigi "Tisch 5" 3  →  ["Luigi", "Tisch 5", "3"].  \\" = Anführungszeichen in "…", \'…\' wörtlich.';

/** Zerlegt eine Argumentzeile in eine Liste von Texten. */
export function zerlegeArgumente(zeile) {
  const s = String(zeile || "");
  const out = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let wert = "";
    while (i < s.length && !/\s/.test(s[i])) {
      const c = s[i];
      if (c === '"') {
        i++;
        while (i < s.length && s[i] !== '"') {
          if (s[i] === "\\" && (s[i + 1] === '"' || s[i + 1] === "\\")) { wert += s[i + 1]; i += 2; continue; }
          wert += s[i++];
        }
        i++; // schließendes "
      } else if (c === "'") {
        i++;
        while (i < s.length && s[i] !== "'") wert += s[i++];
        i++; // schließendes '
      } else {
        wert += c;
        i++;
      }
    }
    out.push(wert);
  }
  return out;
}
