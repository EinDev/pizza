"use strict";
// Regressionstests zu Klärungen aus KLAERUNGEN.md, deren Umsetzung im Interpreter noch OFFEN ist.
// Konvention (ARCHITEKTUR §6): Fälle in *-offen.js zählen nicht als Fehlschlag; wird einer grün, meldet der
// Prüfstand „in eine nicht-offene Datei verschieben“.
const { P, F } = require("../lib/helfer");
const O = "§15 Klärungen – Umsetzung offen";

module.exports = [
  // ── K-077/078 Zufall ─────────────────────────────────────────────────────

  // ── K-085 Zahlformat ─────────────────────────────────────────────────────
  F(O, "K-085: tausender(n) – Punkt als Tausendertrenner, Komma, genau n Nachkommastellen, Rundung K-048", P`
Bote.sage((1234567.tausender()));
Bote.sage((1234567.tausender(2)));
Bote.sage(((-1234.5).tausender()));
Bote.sage((999.tausender()));
Bote.sage((0.5.tausender()));
Bote.sage((1000000.tausender(0)));
`, { out: ["1.234.567", "1.234.567,00", "-1.235", "999", "1", "1.000.000"] }),

  F(O, "K-085: kompakt(n) – Stufen Tsd./Mio./Mrd./Bio./Brd./Trio., ohne nachgestellte Nullen, < 1000 gerundet, ≥ 1e21 Exponent", P`
Bote.sage((1234567.kompakt()));
Bote.sage((1234567.kompakt(1)));
Bote.sage((999.5.kompakt()));
Bote.sage((1500.kompakt()));
Bote.sage((2000000.kompakt()));
Bote.sage(((-1234567).kompakt()));
Bote.sage((12.345.kompakt()));
Bote.sage((0.kompakt()));
Bote.sage((1234567890.kompakt()));
Bote.sage((15000000000000000000000.0.kompakt()));
Bote.sage((1234567.89.euro(kompakt: ja)));
`, { out: ["1,23 Mio.", "1,2 Mio.", "999,5", "1,5 Tsd.", "2 Mio.", "-1,23 Mio.", "12,35", "0", "1,23 Mrd.", "1,5e+22", "1,23 Mio. €"] }),
];
