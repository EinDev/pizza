// Vorratskammer im Browser (SPEC §15.4, K-079 … K-081, K-106): je Kammer ein localStorage-Eintrag.
// Regel gegen verfälschte Spielstände (K-088): Kammern OHNE Namensraum gehören dem Projekt – Projekte aus Galerie/Doku
// (quelle „beispiel:…“/„doku:…“) haben den eigenen Präfix pizza.vorrat-beispiel.<name>; alle übrigen Projekte (eigene,
// Dateien, geteilte, Willkommen) und der App-Link (#app=…) teilen sich pizza.vorrat.<name>.
// Kammern MIT Namensraum (K-106, Kennung „raum/name“) gehören dem Programm: immer pizza.vorrat.<raum>/<name>,
// unabhängig vom Tab – ein Spielstand für Galerie-Tab, geteilte Tabs und App-Links jeder Fassung.
export const VORRAT = "pizza.vorrat.", VORRAT_BEISPIEL = "pizza.vorrat-beispiel.";
const NAME = /^[a-z0-9-]{1,40}$/;
const KENNUNG = /^(?:[a-z0-9-]{1,40}\/)?[a-z0-9-]{1,40}$/;

/** Präfix nach Projekt-Quelle (PROJEKTE §3.2): Kopien aus Galerie/Doku (quelle „beispiel:…“/„doku:…“) → VORRAT_BEISPIEL, sonst VORRAT. */
export function vorratPraefix(projekt) { return projekt && /^(beispiel|doku):/.test(projekt.quelle || "") ? VORRAT_BEISPIEL : VORRAT; }

/** Gültige Kennung: name oder raum/name, beide Teile [a-z0-9-]{1,40}. */
export function vorratKennungGueltig(kennung) { return KENNUNG.test(String(kennung)); }

/** localStorage-Schlüssel einer Kammer: mit Namensraum immer VORRAT, sonst der Präfix des Tabs. */
export function vorratSchluessel(praefix, kennung) {
  const k = String(kennung);
  return (k.includes("/") ? VORRAT : praefix) + k;
}

export function vorratVerfuegbar() {
  try { const k = "pizza.vorrat-test"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch (e) { return false; }
}

/**
 * Alle für einen Präfix sichtbaren Kammern: einfache Kammern (ohne „/“) unter praefix plus alle Kammern mit
 * Namensraum unter VORRAT. Ruft fn(schluessel, kennung) für jede auf – ein Durchlauf über localStorage.
 */
function jedeKammer(praefix, fn) {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(VORRAT)) {
        const rest = k.slice(VORRAT.length);
        if (rest.includes("/")) { if (KENNUNG.test(rest)) fn(k, rest); continue; }
        if (praefix === VORRAT && NAME.test(rest)) fn(k, rest);
        continue;
      }
      if (praefix !== VORRAT && k.startsWith(praefix)) {
        const rest = k.slice(praefix.length);
        if (NAME.test(rest)) fn(k, rest);
      }
    }
  } catch (e) { /* kein Zugriff */ }
}

export function vorratLaden(praefix) {
  const vorrat = {};
  jedeKammer(praefix, (k, kennung) => {
    try {
      const d = JSON.parse(localStorage.getItem(k));
      if (d && d.v === 1 && Array.isArray(d.eintraege)) vorrat[kennung] = d.eintraege;
    } catch (e) { /* kaputter Eintrag wird ignoriert */ }
  });
  return vorrat;
}

/** Speichert eine Kammer; false nur, wenn der Browser das Schreiben verweigert (z. B. Speicher voll). */
export function vorratSpeichern(praefix, kennung, eintraege) {
  const name = String(kennung);
  if (!KENNUNG.test(name)) return true;
  try { localStorage.setItem(vorratSchluessel(praefix, name), JSON.stringify({ v: 1, name, eintraege })); return true; }
  catch (e) { return false; }
}

/** Entfernt eine Kammer; true, wenn es sie gab. */
export function vorratEntfernen(praefix, kennung) {
  const name = String(kennung);
  if (!KENNUNG.test(name)) return false;
  try {
    const k = vorratSchluessel(praefix, name);
    if (localStorage.getItem(k) === null) return false;
    localStorage.removeItem(k);
    return true;
  } catch (e) { return false; }
}

/** Kennungen aller sichtbaren Kammern (Tab-Präfix ohne Namensraum + alle mit Namensraum), sortiert. */
export function vorratNamen(praefix) {
  const namen = [];
  jedeKammer(praefix, (k, kennung) => namen.push(kennung));
  return namen.sort();
}
