// Vorratskammer-Ablage (K-079 … K-081, K-106): Routing mit/ohne Namensraum, gemischtes Laden, Namensliste,
// ungültige Kennungen. localStorage wird nachgebaut (Node hat keins, das Modul greift nur über die Web-API zu).
import assert from "node:assert/strict";

const ablage = new Map();
const mock = {
  get length() { return ablage.size; },
  key(i) { return [...ablage.keys()][i] ?? null; },
  getItem(k) { return ablage.has(k) ? ablage.get(k) : null; },
  setItem(k, v) { ablage.set(String(k), String(v)); },
  removeItem(k) { ablage.delete(k); },
  clear() { ablage.clear(); },
};
Object.defineProperty(globalThis, "localStorage", { value: mock, configurable: true, writable: true });

const { VORRAT, VORRAT_BEISPIEL, vorratPraefix, vorratSchluessel, vorratKennungGueltig, vorratLaden, vorratSpeichern, vorratNamen, vorratEntfernen, vorratVerfuegbar } = await import("../src/vorrat.js");

assert.equal(vorratVerfuegbar(), true);
assert.equal(ablage.size, 0, "Verfügbarkeitstest hinterlässt nichts");

// Präfix je Tab
assert.equal(vorratPraefix({ quelle: "beispiel:idle/x.pizza" }), VORRAT_BEISPIEL);
assert.equal(vorratPraefix({ quelle: "doku:a:1" }), VORRAT_BEISPIEL);
assert.equal(vorratPraefix({ quelle: "teilen:abc" }), VORRAT);
assert.equal(vorratPraefix({ quelle: null }), VORRAT);
assert.equal(vorratPraefix(null), VORRAT);

// Kennung
for (const k of ["a", "stand", "pizza-imperium/spielstand", "a1/b-2", "x".repeat(40) + "/" + "y".repeat(40)]) assert.ok(vorratKennungGueltig(k), k);
for (const k of ["", "/", "a/", "/a", "a/b/c", "../a", "a/..", "A/b", "a b", "x".repeat(41), "ä", "a/" + "y".repeat(41)]) assert.ok(!vorratKennungGueltig(k), "ungültig: " + k);

// Schlüssel-Routing: ohne „/“ nach Tab-Präfix, mit „/“ immer nach VORRAT
assert.equal(vorratSchluessel(VORRAT, "a"), "pizza.vorrat.a");
assert.equal(vorratSchluessel(VORRAT_BEISPIEL, "a"), "pizza.vorrat-beispiel.a");
assert.equal(vorratSchluessel(VORRAT, "r/a"), "pizza.vorrat.r/a");
assert.equal(vorratSchluessel(VORRAT_BEISPIEL, "r/a"), "pizza.vorrat.r/a");

// Speichern: Beispiel-Tab, eine Kammer ohne und eine mit Namensraum
assert.equal(vorratSpeichern(VORRAT_BEISPIEL, "stand", [["k", 1]]), true);
assert.equal(vorratSpeichern(VORRAT_BEISPIEL, "e2e-spiel/stand", [["k", 2]]), true);
assert.equal(vorratSpeichern(VORRAT, "kasse", [["k", 3]]), true);
assert.equal(vorratSpeichern(VORRAT, "alt/neu", [["k", 4]]), true);
assert.deepEqual([...ablage.keys()].sort(), ["pizza.vorrat-beispiel.stand", "pizza.vorrat.alt/neu", "pizza.vorrat.e2e-spiel/stand", "pizza.vorrat.kasse"]);
assert.deepEqual(JSON.parse(ablage.get("pizza.vorrat.e2e-spiel/stand")), { v: 1, name: "e2e-spiel/stand", eintraege: [["k", 2]] }, "Serialisierung trägt die Kennung");

// Ungültige Kennungen: nicht gespeichert, aber kein Fehler (true = Browser hat nicht verweigert)
for (const k of ["a/b/c", "../x", "x/../y", "A", ""]) assert.equal(vorratSpeichern(VORRAT, k, [["k", 9]]), true, k);
assert.equal(ablage.size, 4, "ungültige Kennungen landen nicht im Speicher");

// Fremde/ungültige Schlüssel werden ignoriert
ablage.set("pizza.vorrat.a/b/c", JSON.stringify({ v: 1, name: "a/b/c", eintraege: [] }));
ablage.set("pizza.vorrat.../x", JSON.stringify({ v: 1, name: "../x", eintraege: [] }));
ablage.set("pizza.vorrat.kaputt", "{nicht json");
ablage.set("pizza.vorrat.altformat", JSON.stringify({ v: 2, eintraege: [] }));
ablage.set("pizza.festeSaat", "1");
ablage.set("pizza.vorrat-beispiel.r/x", JSON.stringify({ v: 1, name: "r/x", eintraege: [["k", 5]] })); // falscher Ort für eine Namensraum-Kammer → nicht sichtbar

// Laden: Beispiel-Tab sieht eigene einfache Kammern + alle Namensraum-Kammern
assert.deepEqual(vorratLaden(VORRAT_BEISPIEL), { stand: [["k", 1]], "e2e-spiel/stand": [["k", 2]], "alt/neu": [["k", 4]] });
// Laden: eigener Tab / App-Link sieht einfache Kammern aus VORRAT + alle Namensraum-Kammern (keine Dopplung)
assert.deepEqual(vorratLaden(VORRAT), { kasse: [["k", 3]], "e2e-spiel/stand": [["k", 2]], "alt/neu": [["k", 4]] });

// Namen: sortiert, Kennungen mit Raum dabei (kaputte Einträge mit gültigem Namen bleiben löschbar, also gelistet)
assert.deepEqual(vorratNamen(VORRAT_BEISPIEL), ["alt/neu", "e2e-spiel/stand", "stand"]);
assert.deepEqual(vorratNamen(VORRAT), ["alt/neu", "altformat", "e2e-spiel/stand", "kaputt", "kasse"]);

// Entfernen: Namensraum-Kammer aus dem Beispiel-Tab löschen trifft pizza.vorrat.<raum>/<name>
assert.equal(vorratEntfernen(VORRAT_BEISPIEL, "e2e-spiel/stand"), true);
assert.equal(ablage.has("pizza.vorrat.e2e-spiel/stand"), false);
assert.equal(vorratEntfernen(VORRAT_BEISPIEL, "stand"), true);
assert.equal(ablage.has("pizza.vorrat-beispiel.stand"), false);
assert.equal(ablage.has("pizza.vorrat.kasse"), true, "eigener Vorrat bleibt beim Löschen im Beispiel-Tab");
assert.equal(vorratEntfernen(VORRAT, "gibtsnicht"), false);
assert.equal(vorratEntfernen(VORRAT, "a/b/c"), false, "ungültige Kennung wird nicht angefasst");
assert.equal(ablage.has("pizza.vorrat.a/b/c"), true);
assert.deepEqual(vorratNamen(VORRAT_BEISPIEL), ["alt/neu"]);
assert.deepEqual(vorratNamen(VORRAT), ["alt/neu", "altformat", "kaputt", "kasse"]);

// Kein Zugriff (z. B. localStorage verweigert) → leere Ergebnisse, kein Absturz
Object.defineProperty(globalThis, "localStorage", { get() { throw new Error("verweigert"); }, configurable: true });
assert.equal(vorratVerfuegbar(), false);
assert.deepEqual(vorratLaden(VORRAT), {});
assert.deepEqual(vorratNamen(VORRAT), []);
assert.equal(vorratSpeichern(VORRAT, "a", []), false);
assert.equal(vorratEntfernen(VORRAT, "a"), false);

console.log("Vorrat ok");
