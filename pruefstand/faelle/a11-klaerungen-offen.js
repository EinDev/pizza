"use strict";
// Regressionstests zu Klärungen aus KLAERUNGEN.md, deren Umsetzung im Interpreter noch OFFEN ist.
// Konvention (ARCHITEKTUR §6): Fälle in *-offen.js zählen nicht als Fehlschlag; wird einer grün, meldet der
// Prüfstand „in eine nicht-offene Datei verschieben“.
const { P, F } = require("../lib/helfer");
const O = "§15 Klärungen – Umsetzung offen";

module.exports = [
  F(O, "K-076: ersetze mit leerem Suchtext lässt den Text unverändert (auch Surrogatpaare bleiben heil)", P`
Bote.sage(("ab".ersetze("", "-")));
Bote.sage(("🍕".ersetze("", "-")));
Bote.sage(("🍕".ersetze("", "-").länge()));
Bote.sage(("🍕x".ersetze("x", "-")));
`, { out: ["ab", "🍕", "1", "🍕-"] }),
];
