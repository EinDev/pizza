// Köche für die Küchenbrigade (SPEC §17.7, THREADS §4.8, K-104 Punkt 12): reine Host-Einstellung, pro Browser gespeichert.
// Playground und App-Modus lesen dieselbe Einstellung; der Lauf-Worker legt damit vor dem Lauf einen Köche-Pool an.

export const KOECHE_SCHLUESSEL = "pizza.koeche";
export const KOECHE_WAHL = Object.freeze(["auto", "1", "2", "4", "8"]);

/** Gültige Wahl aus einem gespeicherten Wert ("auto" bei allem Unbekannten). */
export function koecheNormal(wert) {
  const w = wert == null ? "" : String(wert);
  return KOECHE_WAHL.includes(w) ? w : "auto";
}

/** Gespeicherte Wahl (localStorage kann fehlen oder werfen). */
export function leseKoeche() {
  try { return koecheNormal(localStorage.getItem(KOECHE_SCHLUESSEL)); } catch (e) { return "auto"; }
}

export function speichereKoeche(wert) {
  try { localStorage.setItem(KOECHE_SCHLUESSEL, koecheNormal(wert)); } catch (e) { /* privat/voll */ }
}

/** Wert für die Worker-Nachricht: "auto" oder Zahl. */
export function koecheFuerLauf(wert) {
  const w = koecheNormal(wert);
  return w === "auto" ? "auto" : Number(w);
}

/** Hüllen-Anzeige (gleicher Text wie --info, K-082): „Köche: N“ – nur, wenn der Lauf eine Anzahl gemeldet hat. */
export function koecheText(n) {
  return typeof n === "number" && n >= 1 ? "Köche: " + n : "";
}

/** Echte Köche brauchen SharedArrayBuffer/Atomics, also Cross-Origin-Isolation. */
export function koecheMoeglich() {
  return typeof SharedArrayBuffer === "function" && typeof Atomics === "object" && self.crossOriginIsolated === true;
}
