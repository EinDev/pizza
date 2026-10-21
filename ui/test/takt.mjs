import assert from "node:assert/strict";
import { reiheUiEreignisEin } from "../src/ausfuehrung.js";

const t = (id, anzahl) => ({ typ: "takt", id, anzahl });
const k = (id) => ({ typ: "klick", id });
const folge = (...evs) => evs.reduce((s, e) => reiheUiEreignisEin(s, e), []);

// Gestaute Schläge derselben id → ein Ereignis mit Summe
assert.deepEqual(folge(t("t1", 1), t("t1", 1), t("t1", 3)), [t("t1", 5)]);
// Gemischte Folge takt/klick/takt: nichts umsortiert, nichts verschluckt
assert.deepEqual(folge(t("t1", 1), k("k"), t("t1", 2)), [t("t1", 1), k("k"), t("t1", 2)]);
assert.deepEqual(folge(t("t1", 1), t("t1", 1), k("k"), t("t1", 1), t("t1", 2)), [t("t1", 2), k("k"), t("t1", 3)]);
// Verschiedene ids bleiben getrennt
assert.deepEqual(folge(t("a", 1), t("a", 1), t("b", 1), t("a", 1)), [t("a", 2), t("b", 1), t("a", 1)]);
// Änderungs-Ereignisse und geschlossen bleiben unverändert
const ae = { typ: "aenderung", id: "e", wert: "x" };
assert.deepEqual(folge(ae, ae, t("t", 1), { typ: "geschlossen" }, t("t", 1)), [ae, ae, t("t", 1), { typ: "geschlossen" }, t("t", 1)]);
// Ungültiges anzahl zählt wie im Interpreter als 1
assert.deepEqual(folge(t("t", 0), { typ: "takt", id: "t" }, t("t", 2.5), t("t", 4)), [t("t", 7)]);
// Eingereihtes Objekt des Aufrufers wird nicht verändert
const erstes = t("t", 1);
folge(erstes, t("t", 1));
assert.equal(erstes.anzahl, 1);
console.log("Takt-Zusammenfassung ok");
