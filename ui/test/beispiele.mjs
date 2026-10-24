// Galerie (PROJEKTE.md §3.3, §7.2; K-144): Beispiel-Projektordner laden – mit einem fetch, der aus site/ liest (alle echten
// Beispiele), und mit erfundenen Einträgen (Mehrdatei + Bild, Fehlerfälle, altes Format bis PB5).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { ladeBeispielDateien, beispielQuelle, istGalerieEintrag, BASIS } from "../src/beispiel-laden.js";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "site");
globalThis.PizzaLang = createRequire(import.meta.url)(path.join(SITE, "js", "pizza.js"));
const P = globalThis.PizzaLang;

const antwort = (bytes) => bytes ? { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } : { ok: false, status: 404 };
/** fetch-Ersatz: liest relative URLs aus site/ (wie der statische Server) und merkt sich die Anfragen. */
function vonPlatte(log = []) {
  return async (url) => {
    log.push(url);
    const p = path.join(SITE, ...url.split("/"));
    return antwort(fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null);
  };
}
/** fetch-Ersatz aus einem Objekt { url → Text | Uint8Array }. */
function ausObjekt(dateien, log = []) {
  return async (url) => { log.push(url); const d = dateien[url]; return antwort(d == null ? null : typeof d === "string" ? new TextEncoder().encode(d) : d); };
}

// ---------- alle echten Beispiele: Ordner + Dateiliste → Projekt, pruefung/ nie angefragt, Lauf wie die Harnische ----------
const index = JSON.parse(fs.readFileSync(path.join(SITE, "beispiele", "index.json"), "utf8"));
let n = 0, ordner = 0;
for (const teil of index.teile) {
  const m = JSON.parse(fs.readFileSync(path.join(SITE, "beispiele", teil), "utf8"));
  for (const b of m.beispiele) {
    assert.ok(istGalerieEintrag(b), b.id + ": Galerie zeigt den Eintrag");
    const log = [];
    const g = await ladeBeispielDateien(b, vonPlatte(log));
    n++;
    assert.ok(log.every((u) => u.startsWith(BASIS) && !u.includes("/pruefung/")), b.id + ": nur Projektdateien angefragt");
    assert.equal(beispielQuelle(b), "beispiel:" + b.id);
    if (b.ordner) {
      ordner++;
      assert.deepEqual(Object.keys(g.dateien), b.dateien, b.id + ": genau die Manifest-Dateiliste");
      assert.equal(g.name, b.titel, b.id + ": Projektname = Titel");
      assert.equal(g.hauptdatei, null, b.id + ": Hauptdatei kommt aus pizza.json");
      const pj = P.projekt.ausDateien(g.dateien);
      assert.equal(pj.name, b.titel);
      assert.equal(pj.hauptdatei, "hauptgang.pizza");
      for (const t of Object.values(g.dateien)) if (typeof t === "string") assert.ok(!t.includes("\r\n"), b.id + ": Texte mit \\n");
    } else {
      assert.deepEqual(Object.keys(g.dateien), [g.hauptdatei], b.id + ": altes Format = eine Datei");
      assert.equal(g.name, b.datei.split("/").pop());
    }
  }
}
assert.ok(n > 60 && ordner >= n - 1, "alle Beispiele (bis auf das Imperium bis PB5) sind Ordner: " + ordner + "/" + n);

// ---------- erfundenes Mehrdatei-Beispiel mit Bild (PB4) ----------
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const mehr = { id: "teigball", titel: "Teigball", ordner: "herd/teigball", dateien: ["pizza.json", "hauptgang.pizza", "welt/tisch.pizza", "bilder/tischdecke.png"] };
const mehrDateien = {
  "beispiele/herd/teigball/pizza.json": '{ "pizza": 1, "name": "Teigball" }\r\n',
  "beispiele/herd/teigball/hauptgang.pizza": '﻿bestellt "welt/tisch.pizza";\r\nBote.sage((TISCH));\r\n',
  "beispiele/herd/teigball/welt/tisch.pizza": 'margherita TISCH = "Tisch";\n',
  "beispiele/herd/teigball/bilder/tischdecke.png": png,
};
const g = await ladeBeispielDateien(mehr, ausObjekt(mehrDateien));
assert.deepEqual(Object.keys(g.dateien), mehr.dateien);
assert.equal(g.dateien["hauptgang.pizza"], '﻿bestellt "welt/tisch.pizza";\nBote.sage((TISCH));\n', "\\r\\n → \\n, BOM bleibt (PROJEKTE §1.3)");
assert.ok(g.dateien["bilder/tischdecke.png"] instanceof Uint8Array && g.dateien["bilder/tischdecke.png"].length === png.length, "Bild als Bytes");
// (ohne das Schein-PNG – das bäckt erst der Vorbacker, PB4)
const r = P.run({ dateien: Object.fromEntries(Object.entries(g.dateien).filter(([p]) => !p.endsWith(".png"))) });
assert.equal(r.exitCode, 0);
assert.equal(r.ereignisse.find((e) => e.typ === "ausgabe").text, "Tisch");

// ---------- Fehlerfälle: HTTP, Pfad, UTF-8; pruefung/ in der Liste wird übergangen ----------
await assert.rejects(ladeBeispielDateien({ ...mehr, dateien: ["pizza.json", "fehlt.pizza"] }, ausObjekt(mehrDateien)), /fehlt\.pizza: HTTP 404/);
await assert.rejects(ladeBeispielDateien({ ...mehr, dateien: ["Gross.pizza"] }, ausObjekt(mehrDateien)), /kein gültiger Dateipfad/);
await assert.rejects(ladeBeispielDateien({ ...mehr, dateien: ["kaputt.txt"] }, ausObjekt({ "beispiele/herd/teigball/kaputt.txt": new Uint8Array([0xff, 0xfe]) })), /kaputt\.txt ist kein gültiger UTF-8-Text/);
const log = [];
await ladeBeispielDateien({ ...mehr, dateien: ["pizza.json", "pruefung/erwartet"] }, ausObjekt(mehrDateien, log));
assert.deepEqual(log, ["beispiele/herd/teigball/pizza.json"], "pruefung/ wird nie geladen");

// ---------- Galerie-Filter ----------
assert.equal(istGalerieEintrag({ id: "x", ordner: "a/b", dateien: [] }), false, "Ordner ohne Dateien");
assert.equal(istGalerieEintrag({ id: "x", datei: "a/b.pizza" }), true, "altes Format (Übergang PB5)");
assert.equal(istGalerieEintrag(null), false);
console.log("beispiele.mjs: " + n + " Beispiele geladen (" + ordner + " Ordner), Mehrdatei/Bild/Fehlerfälle ok");
