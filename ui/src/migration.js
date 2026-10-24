// Einmalige Migration der alten Editor-Tabs (localStorage „pizza.tabs“) in Projekte (PROJEKTE.md §3.2, Nutzerentscheidung F12):
// jeder Tab wird ein Ein-Datei-Projekt, geschlossene Tabs landen im Papierkorb („Zuletzt gelöscht“). Rein (ohne DOM/Ablage),
// damit Node-Tests sie prüfen; das Entfernen von „pizza.tabs“ macht der Aufrufer erst nach erfolgreichem Schreiben.
//
// Abweichung vom Konzepttext (§3.2 nennt „Datei hauptgang.pizza“): Die Datei behält den (zum gültigen Pfad gemachten) Tab-Namen –
// „willkommen.pizza“, „hallo-welt.pizza“ – und ist per `hauptdatei` die Hauptdatei. So bleibt der Tab-Titel aussagekräftig und
// gleich wie vorher; nach SPEC §2.1 ist die einzige .pizza-Datei ohnehin die Hauptdatei.
import { pizzaPfadAusName, projektNameAus } from "./projekt.js";

export const ALTE_TABS = "pizza.tabs";
export const MAX_PAPIERKORB = 10;

/** Tab-Schlüssel → projekt.quelle (§3.2): bsp:<id> → beispiel:<id>, doku:<id> → doku:<id>, alles andere → null. */
export function quelleAusSchluessel(schluessel) {
  const s = String(schluessel || "");
  if (s.startsWith("bsp:")) return "beispiel:" + s.slice(4);
  if (s.startsWith("doku:")) return s;
  return null;
}

function projektAusTab(t, { id, jetzt, geloescht }) {
  const pfad = pizzaPfadAusName(t.name);
  const text = String(t.text);
  return {
    projekt: {
      id,
      name: projektNameAus(t.name),
      hauptdatei: pfad,
      args: typeof t.args === "string" ? t.args : "",
      erstellt: jetzt,
      geaendert: jetzt,
      offen: [pfad],
      aktiv: pfad,
      angeheftet: t.angeheftet ? [pfad] : [],
      quelle: quelleAusSchluessel(t.schluessel),
      teilen: null,
      ...(geloescht != null ? { geloescht } : {}),
    },
    dateien: [{ pfad, inhalt: text, basis: typeof t.basis === "string" ? t.basis : text }],
  };
}

/**
 * Altdaten → { projekte: [{ projekt, dateien }], aktiv: projektId | null } oder null (nichts zu migrieren).
 * `neueId()` liefert Projekt-IDs, `jetzt` ist die Uhrzeit (ms).
 */
export function migriereTabs(daten, { neueId, jetzt = Date.now() } = {}) {
  if (!daten || typeof daten !== "object" || !Array.isArray(daten.tabs)) return null;
  const tabs = daten.tabs.filter((t) => t && typeof t.text === "string");
  const zu = Array.isArray(daten.geschlossen) ? daten.geschlossen.filter((g) => g && typeof g.text === "string").slice(0, MAX_PAPIERKORB) : [];
  if (!tabs.length && !zu.length) return null;
  const projekte = [];
  let aktiv = null;
  // Reihenfolge der Tabs bleibt als „zuletzt geändert“ erhalten (erster Tab = ältester)
  tabs.forEach((t, i) => {
    const p = projektAusTab(t, { id: neueId(), jetzt: jetzt - (tabs.length - i) });
    if (t.id != null && t.id === daten.aktiv) aktiv = p.projekt.id;
    projekte.push(p);
  });
  if (!aktiv && projekte.length) aktiv = projekte[projekte.length - 1].projekt.id;
  // Papierkorb: zuletzt geschlossen zuerst (wie „Wiederherstellen“)
  zu.forEach((g, i) => projekte.push(projektAusTab(g, { id: neueId(), jetzt: jetzt - 1000 - i, geloescht: jetzt - i })));
  return { projekte, aktiv };
}

/** Liest „pizza.tabs“ (oder null, wenn nicht vorhanden/kaputt). */
export function leseAlteTabs(speicher) {
  try { return JSON.parse(speicher.hole(ALTE_TABS) || "null"); } catch (e) { return null; }
}
