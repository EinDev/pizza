// Vorratskammer im Browser (SPEC §15.4, K-079 … K-081): je Kammer ein localStorage-Eintrag <praefix><name>.
// Regel gegen verfälschte Spielstände: Tabs aus Galerie/Doku (Schlüssel „bsp:…“/„doku:…“) haben einen eigenen
// Namensraum; alle übrigen Tabs (eigene, Dateien, geteilte, Willkommen) und der App-Link (#app=…) teilen sich die echten Kammern.
export const VORRAT = "pizza.vorrat.", VORRAT_BEISPIEL = "pizza.vorrat-beispiel.";
const NAME = /^[a-z0-9-]{1,40}$/;

export function vorratPraefix(t) { return t && /^(bsp|doku):/.test(t.schluessel || "") ? VORRAT_BEISPIEL : VORRAT; }

export function vorratVerfuegbar() {
  try { const k = "pizza.vorrat-test"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch (e) { return false; }
}

export function vorratLaden(praefix) {
  const vorrat = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(praefix)) continue;
      const name = k.slice(praefix.length);
      if (!NAME.test(name)) continue;
      try {
        const d = JSON.parse(localStorage.getItem(k));
        if (d && d.v === 1 && Array.isArray(d.eintraege)) vorrat[name] = d.eintraege;
      } catch (e) { /* kaputter Eintrag wird ignoriert */ }
    }
  } catch (e) { /* kein Zugriff */ }
  return vorrat;
}

/** Speichert eine Kammer; false nur, wenn der Browser das Schreiben verweigert (z. B. Speicher voll). */
export function vorratSpeichern(praefix, name, eintraege) {
  if (!NAME.test(String(name))) return true;
  try { localStorage.setItem(praefix + name, JSON.stringify({ v: 1, name, eintraege })); return true; }
  catch (e) { return false; }
}

export function vorratNamen(praefix) {
  const namen = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(praefix) && NAME.test(k.slice(praefix.length))) namen.push(k.slice(praefix.length));
    }
  } catch (e) { /* kein Zugriff */ }
  return namen.sort();
}
