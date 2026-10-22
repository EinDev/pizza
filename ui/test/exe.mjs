// EXE-Export (site/js/exe.js): Importgruppen aus der Custom Section `pizzaiolo`, Abgleich mit den Gruppen des Ziel-Hosts
// (ziele.json `gruppen`, sonst Standard ohne Herd) – Herd-Programme werden nicht als EXE verpackt, solange der Host sie nicht kann.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PizzaExe = require("../../site/js/exe.js");
const Z = require("../../site/js/pizzaiolo.js");

function backe(code) {
  const r = Z.kompiliere(code, {});
  assert.ok(r && r.ok && r.pkarton, "kompiliert: " + JSON.stringify(r && (r.fehler || r.nichtUnterstuetzt)));
  return r.pkarton instanceof Uint8Array ? r.pkarton : new Uint8Array(r.pkarton);
}

const hallo = backe('Bote.sage(("Hallo"));');
const herd = backe(fs.readFileSync(new URL("../../site/beispiele/herd/wuerfel.pizza", import.meta.url), "utf8"));

// Gruppen aus der Custom Section (ohne WebAssembly.compile)
assert.deepEqual(PizzaExe.gruppen(hallo), []);
assert.ok(PizzaExe.gruppen(herd).includes("herd"), "Herd-Beispiel braucht die Gruppe herd: " + PizzaExe.gruppen(herd));
assert.throws(() => PizzaExe.gruppen(new Uint8Array([1, 2, 3])), /WebAssembly-Magie/);

// Ziel ohne Angabe → Standard-Gruppen (ohne herd); Ziel mit `gruppen` entscheidet selbst (nach H5 automatisch)
const ohneAngabe = { id: "windows-x64", datei: "x.exe", endung: ".exe" };
assert.deepEqual(PizzaExe.fehlendeGruppen(hallo, ohneAngabe), []);
assert.deepEqual(PizzaExe.fehlendeGruppen(herd, ohneAngabe), ["herd"]);
assert.deepEqual(PizzaExe.fehlendeGruppen(herd, { ...ohneAngabe, gruppen: ["theke", "vorrat", "echtzeit", "kueche", "herd"] }), []);
assert.deepEqual(PizzaExe.fehlendeGruppen(hallo, "windows-x64"), [], "Ziel als Kennung → Standard-Gruppen");

// Meldungen
assert.equal(PizzaExe.gruppenMeldung([]), "");
assert.equal(PizzaExe.gruppenMeldung(["herd"]), "Herd-Spiele lassen sich noch nicht als EXE exportieren – im Playground und per App-Link laufen sie schon.");
assert.match(PizzaExe.gruppenMeldung(["zauber"]), /„zauber“/);

// baue() bricht vor dem Laden des Host-Binaries ab (kein fetch der EXE)
const geholt = [];
const fetch = async (url) => { geholt.push(url); return { ok: false, status: 404 }; };
await assert.rejects(PizzaExe.baue(herd, ohneAngabe, { fetch }), (e) => e.code === "GRUPPE_FEHLT" && e.gruppen.includes("herd") && /Herd-Spiele/.test(e.message));
assert.deepEqual(geholt, [], "kein Host-Download für Herd-Programme");
// Ohne Gruppenproblem wird der Host geladen (hier 404 → normaler Fehler)
await assert.rejects(PizzaExe.baue(hallo, ohneAngabe, { fetch }), /nicht ladbar/);
assert.deepEqual(geholt, ["bin/x.exe"]);

console.log("exe: ok");
