// U-45: Anzeigeform von Warnungen/Fehlern wie bin/pizza.js
import assert from "node:assert/strict";
import { meldungTeile } from "../src/konsole.js";
const t = (ev) => { const m = meldungTeile(ev); return m.rumpf + m.ort; };
assert.equal(t({ text: "W0032: 'PiZZa' und 'PizZa' …", zeile: 3, spalte: 7 }), "W0032: 'PiZZa' und 'PizZa' … (Zeile 3, Spalte 7)");
assert.equal(t({ text: "Ungefangene Ananas – StreitAnanas: Pizza ist alle. (Zeile 12)", zeile: 12, spalte: 5 }), "Ungefangene Ananas – StreitAnanas: Pizza ist alle. (Zeile 12, Spalte 5)");
assert.equal(t({ text: "PizzaFehler B0012: x", zeile: 4, spalte: null }), "PizzaFehler B0012: x (Zeile 4)");
assert.equal(t({ text: "ohne Ort", zeile: null }), "ohne Ort");
assert.equal(t({ text: "a (Zeile 2)", zeile: 9, spalte: 1 }), "a (Zeile 2) (Zeile 9, Spalte 1)");
assert.equal(t({ text: "mit detail", zeile: 1, spalte: 1, detail: "GEHEIM" }).includes("GEHEIM"), false);
console.log("U-45 ok");
