// Köche-Einstellung (SPEC §17.7, THREADS §4.8): Werte, Speicher, Anzeige-Text.
import assert from "node:assert/strict";

const speicher = new Map();
globalThis.localStorage = {
  getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
  setItem: (k, v) => speicher.set(k, String(v)),
  removeItem: (k) => speicher.delete(k),
};
const { KOECHE_WAHL, KOECHE_SCHLUESSEL, koecheNormal, leseKoeche, speichereKoeche, koecheFuerLauf, koecheText } = await import("../src/koeche.js");

assert.deepEqual([...KOECHE_WAHL], ["auto", "1", "2", "4", "8"]);
assert.equal(leseKoeche(), "auto", "Standard auto");
speichereKoeche("4");
assert.equal(speicher.get(KOECHE_SCHLUESSEL), "4");
assert.equal(leseKoeche(), "4");
speicher.set(KOECHE_SCHLUESSEL, "3");
assert.equal(leseKoeche(), "auto", "unbekannte Werte → auto");
assert.equal(koecheNormal(8), "8");
assert.equal(koecheNormal(null), "auto");
assert.equal(koecheFuerLauf("auto"), "auto");
assert.equal(koecheFuerLauf("1"), 1);
assert.equal(koecheFuerLauf("8"), 8);
assert.equal(koecheText(4), "Köche: 4");
assert.equal(koecheText(undefined), "");
assert.equal(koecheText(0), "");
globalThis.localStorage = { getItem() { throw new Error("gesperrt"); }, setItem() { throw new Error("gesperrt"); } };
assert.equal(leseKoeche(), "auto", "gesperrter Speicher → auto");
speichereKoeche("2");
console.log("Köche ok");
