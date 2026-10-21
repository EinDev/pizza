"use strict";
// Hilfsfunktionen für die Fall-Dateien des Prüfstands.
// Quelle aller Erwartungen: SPEC.md + ARCHITEKTUR.md (+ verbindliche Klarstellungen), NICHT der Interpreter.

/** Quelltext-Tag: Backslashes bleiben roh (pizza-Escapes wie \n), führender Zeilenumbruch weg. */
function P(s, ...v) {
  return String.raw(s, ...v).replace(/^\r?\n/, "");
}

/**
 * Fall definieren.
 * e: {
 *   exit (Standard 0) | null = nicht prüfen,
 *   out: string[]            – exakte Liste der ausgabe-Texte,
 *   outEnthält: string[]     – diese Texte kommen (in dieser Reihenfolge) vor,
 *   fehlerOut: string[]      – exakte Liste der fehlerausgabe-Texte,
 *   fehler: { code, art, text, textEnthält, textRe, zeile },
 *   warn: string[]           – diese Warn-Codes kommen mind. einmal vor,
 *   warnAnzahl: {code: n}    – exakt n Warnungen mit diesem Code,
 *   warnText: {code: teil}   – Warnung code enthält Text teil,
 *   noWarn: string[]         – diese Codes dürfen NICHT vorkommen,
 *   panik: true              – panik-Ereignis mit exaktem Banner (SPEC §9),
 *   args: string[], schrittLimit: number,
 *   check(res, h) → string | string[] | undefined (Fehlermeldungen)
 * }
 */
function F(p, name, code, e = {}) {
  return Object.assign({ p, name, code, exit: 0 }, e);
}

/** Panik-Banner wörtlich aus SPEC §9 (inkl. Schlusszeile, Klarstellung 4). */
const BANNER = [
  "╔══════════════════════════════════════════════╗",
  "║   🍍  PIZZA-VM KERNEL PANIC  🍍              ║",
  "║                                              ║",
  "║   Fataler Fehler: ANANAS_AUF_PIZZA           ║",
  "║   Adresse 0xPIZZA → Ofen überhitzt           ║",
  "║   Der Pizzaiolo hat den Raum verlassen.      ║",
  "║                                              ║",
  "║   Core dumped → reste.kaltepizza             ║",
  "╚══════════════════════════════════════════════╝",
  "Exit-Code: 39",
].join("\n");

module.exports = { P, F, BANNER };
