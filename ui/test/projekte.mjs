// Playground-Projekte (PROJEKTE.md §1, §3; K-142): Pfadregeln, pizza.json, Grenzen, Migration der Tabs, Projektverwaltung über
// die Speicher-Ablage (gleiche Schnittstelle wie IndexedDB), Bildprüfung. ZIP: test/zip.mjs.
import assert from "node:assert/strict";
import {
  pruefePfad, pruefePfadLokal, dateiArt, pizzaPfadAusName, projektNameAus, normalisiereText, dekodiereText, pruefeGrenzen,
  leseProjektdateiLokal, ausDateien, erzeugeProjektdatei, aendereProjektdatei, sammlung, programmText, tabTitel, eindeutigerPfad,
  erreichbarePizzas, bestimmeHauptdatei, formatGroesse, MIB, KIB,
} from "../src/projekt.js";
import { migriereTabs, quelleAusSchluessel } from "../src/migration.js";
import { speicherAblage, TEIGLING_GRENZE } from "../src/ablage.js";
import { erstelleProjekte } from "../src/projekte.js";
import { bildInfo, pruefeBild, dataUrl, erstelleVorbacker, modellInfo, pruefeModell, modellFehlerText } from "../src/bilder.js";

// ---------- Pfade (SPEC §2.1) ----------
for (const p of ["hauptgang.pizza", "welt/tisch.pizza", "bilder/tischdecke.png", "a_b-c.d.txt", "a/b/c/d/e/f/g/h.pizza", "pizza.json"]) assert.equal(pruefePfad(p), null, p);
for (const p of ["", "/a.pizza", "a//b.pizza", "../a.pizza", "a/../b.pizza", ".a.pizza", "a/.b/c.pizza", "Groß.pizza", "beläge.pizza",
  "a b.pizza", "a\\b.pizza", "a/b/c/d/e/f/g/h/i.pizza", "x".repeat(115) + ".pizza"]) assert.match(pruefePfadLokal(p) || "", /kein gültiger Dateipfad/, "ungültig: " + p);
assert.match(pruefePfad("a.exe"), /Dateiart/);
assert.equal(dateiArt("a.PIZZA"), "pizza");
assert.equal(dateiArt("x/y.jpeg"), "bild");
assert.equal(dateiArt("modelle/tisch.glb"), "modell");   // H-K16
assert.equal(dateiArt("modelle/tisch.gltf"), "modell");
assert.equal(dateiArt("modelle/tisch.bin"), "daten");
assert.equal(pruefePfad("modelle/tisch.gltf"), null);
assert.equal(dateiArt("notiz.md"), "text");
assert.equal(dateiArt("ohne"), null);
assert.equal(pizzaPfadAusName("Hallo Welt.pizza"), "hallo-welt.pizza");
assert.equal(pizzaPfadAusName("Geteilt AbC_1.pizza"), "geteilt-abc_1.pizza");
assert.equal(pizzaPfadAusName("Größe & Maß.pizza"), "groesse-mass.pizza");
assert.equal(pizzaPfadAusName("…"), "hauptgang.pizza");
assert.equal(pizzaPfadAusName(".versteckt.pizza"), "versteckt.pizza");
assert.equal(pruefePfad(pizzaPfadAusName("Ä.Ö.ü---ß  .pizza")), null);
assert.equal(projektNameAus("willkommen.pizza"), "willkommen");
assert.equal(projektNameAus("  \u0007 "), "unbenannt");

// ---------- Text (PROJEKTE §1.3) ----------
assert.equal(normalisiereText("a\r\nb\rc\n"), "a\nb\rc\n");
const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a]);
assert.equal(dekodiereText(bom, "a.txt").text, "﻿a\n", "BOM bleibt, CRLF → LF");
assert.deepEqual(dekodiereText(new Uint8Array([0xff, 0xfe]), "x.txt"), { ok: false, fehler: "x.txt ist kein gültiger UTF-8-Text." });

// ---------- Grenzen (P0020-Gründe) ----------
assert.equal(pruefeGrenzen({ "a.pizza": "x" }), null);
const viele = {}; for (let i = 0; i < 101; i++) viele["d" + i + ".txt"] = "";
assert.equal(pruefeGrenzen(viele), "101 Dateien, höchstens 100");
viele["pruefung/x.txt"] = "x"; delete viele["d100.txt"];
assert.equal(pruefeGrenzen(viele), null, "pruefung/ zählt nicht");
assert.equal(pruefeGrenzen({ "a.pizza": "x".repeat(601 * KIB - 5) }), "a.pizza hat 601 KB, höchstens 512 KB");
assert.equal(pruefeGrenzen({ "b.png": new Uint8Array(2.5 * MIB) }), "b.png hat 2,5 MB, höchstens 2 MB");
const gross = {}; for (let i = 0; i < 5; i++) gross["b" + i + ".png"] = new Uint8Array(1.7 * MIB);
assert.equal(pruefeGrenzen(gross), "zusammen 8,5 MB, höchstens 8 MB");
assert.equal(formatGroesse(312 * 1024), "312 KB");
assert.equal(formatGroesse(5.3 * MIB), "5,3 MB");

// ---------- pizza.json ----------
assert.equal(leseProjektdateiLokal(undefined), null);
assert.match(leseProjektdateiLokal("{").fehler, /kein gültiges JSON/);
assert.match(leseProjektdateiLokal("[]").fehler, /kein Objekt/);
assert.match(leseProjektdateiLokal("{}").fehler, /"pizza" fehlt/);
assert.match(leseProjektdateiLokal('{"pizza":1,"name":3}').fehler, /"name" muss ein Text sein/);
assert.match(leseProjektdateiLokal('{"pizza":1,"args":[1]}').fehler, /"args" muss ein Blech aus Texten sein/);
assert.match(leseProjektdateiLokal('{"pizza":2}').fehler, /neuere pizza-Version/);
assert.deepEqual(leseProjektdateiLokal('{"pizza":1,"name":"Teigball","hauptdatei":"spiel.pizza","args":["a"],"x":1}'), { name: "Teigball", hauptdatei: "spiel.pizza", args: ["a"] });
assert.deepEqual(ausDateien({ "x.pizza": "" }), { name: "x", hauptdatei: "x.pizza", args: [] });
assert.equal(ausDateien({ "a.pizza": "", "hauptgang.pizza": "" }).hauptdatei, "hauptgang.pizza");
assert.equal(ausDateien({ "a.pizza": "", "pizza.json": '{"pizza":1,"hauptdatei":"a.pizza","name":"N"}' }).name, "N");
assert.equal(bestimmeHauptdatei({ "a.pizza": "", "b.pizza": "" }, "b.pizza"), "b.pizza");
assert.deepEqual(JSON.parse(erzeugeProjektdatei({ name: "Teigball", hauptdatei: "spiel.pizza" })), { pizza: 1, name: "Teigball", hauptdatei: "spiel.pizza" });
assert.deepEqual(JSON.parse(aendereProjektdatei('{"pizza":1,"x":2}', { name: "Neu" })), { pizza: 1, x: 2, name: "Neu" });
assert.equal(aendereProjektdatei("kaputt", { name: "x" }), null);

// ---------- Sammlung, Tab-Titel, Erreichbarkeit ----------
const bild = new Uint8Array([1, 2, 3]);
const s = sammlung({ name: "T", hauptdatei: "h.pizza" }, { "h.pizza": "a\r\nb", "b/x.png": bild, "pruefung/erwartet.txt": "x" });
assert.deepEqual(Object.keys(s.projekt.dateien).sort(), ["b/x.png", "h.pizza"]);
assert.equal(s.projekt.dateien["h.pizza"], "a\nb");
assert.notEqual(s.projekt.dateien["b/x.png"], bild, "Kopie (der Puffer wird übertragen)");
assert.equal(s.uebertragbar.length, 1);
assert.equal(programmText({ "a.pizza": "A", "t.txt": "T", "b.pizza": "B" }), "A\nB");
assert.deepEqual(tabTitel(["a/tisch.pizza", "b/tisch.pizza", "haupt.pizza"]), { "a/tisch.pizza": "a/tisch.pizza", "b/tisch.pizza": "b/tisch.pizza", "haupt.pizza": "haupt.pizza" });
assert.equal(eindeutigerPfad("a.pizza", new Set(["a.pizza", "a-2.pizza"])), "a-3.pizza");
assert.deepEqual([...erreichbarePizzas({ "h.pizza": 'bestellt "a.pizza";\n// bestellt "c.pizza";', "a.pizza": 'bestellt "b.pizza";', "b.pizza": "", "c.pizza": "" }, "h.pizza")].sort(), ["a.pizza", "b.pizza", "h.pizza"]);

// ---------- Migration der Tabs (F12) ----------
assert.equal(quelleAusSchluessel("bsp:grundlagen/hallo-welt.pizza"), "beispiel:grundlagen/hallo-welt.pizza");
assert.equal(quelleAusSchluessel("doku:schleifen:2"), "doku:schleifen:2");
for (const k of ["geteilt:abc", "datei:x:1:2", "willkommen", null]) assert.equal(quelleAusSchluessel(k), null);
let n = 0;
const neueId = () => "id" + n++;
const alt = {
  aktiv: "t2",
  tabs: [
    { id: "t1", name: "willkommen.pizza", schluessel: "willkommen", text: "W", basis: "W" },
    { id: "t2", name: "Mein Code.pizza", schluessel: null, text: "neu", basis: "alt", args: "a b", angeheftet: true },
    { id: "t3", name: "hallo-welt.pizza", schluessel: "bsp:grundlagen/hallo-welt.pizza", text: "H" },
    { kaputt: true },
  ],
  geschlossen: [{ name: "weg.pizza", text: "X", schluessel: "doku:a:1" }],
};
const m = migriereTabs(alt, { neueId, jetzt: 1_000_000 });
assert.equal(m.projekte.length, 4);
assert.equal(m.aktiv, "id1");
const [w, mc, hw, pk] = m.projekte;
assert.deepEqual([w.projekt.name, w.projekt.hauptdatei, w.projekt.quelle], ["willkommen", "willkommen.pizza", null]);
assert.deepEqual([mc.projekt.name, mc.projekt.hauptdatei, mc.projekt.args, mc.projekt.angeheftet], ["Mein Code", "mein-code.pizza", "a b", ["mein-code.pizza"]]);
assert.deepEqual(mc.dateien, [{ pfad: "mein-code.pizza", inhalt: "neu", basis: "alt" }], "ungespeicherte Änderung bleibt sichtbar");
assert.equal(hw.projekt.quelle, "beispiel:grundlagen/hallo-welt.pizza");
assert.equal(hw.dateien[0].basis, "H");
assert.ok(pk.projekt.geloescht, "geschlossener Tab → Papierkorb");
assert.equal(pk.projekt.quelle, "doku:a:1");
assert.ok(mc.projekt.geaendert > w.projekt.geaendert, "Reihenfolge bleibt");
assert.equal(migriereTabs(null), null);
assert.equal(migriereTabs({ tabs: [] }), null);

// ---------- Projektverwaltung (Speicher-Ablage) ----------
function lsAttrappe(start = {}) {
  const daten = new Map(Object.entries(start));
  return { hole: (k) => (daten.has(k) ? daten.get(k) : null), setze: (k, v) => daten.set(k, String(v)), entferne: (k) => daten.delete(k), daten };
}
{
  // Erster Start ohne Altdaten → Willkommen-Projekt
  const ablage = speicherAblage();
  const P = await erstelleProjekte({ speicher: lsAttrappe(), willkommen: "// hallo", ablage, kanal: null });
  assert.equal(P.aktiv.name, "willkommen");
  assert.deepEqual(P.pfade(), ["willkommen.pizza"]);
  assert.equal(P.inhalt("willkommen.pizza"), "// hallo");
  assert.equal(P.istGeaendert("willkommen.pizza"), false);
  P.setzeInhalt("willkommen.pizza", "// geändert");
  assert.equal(P.istGeaendert("willkommen.pizza"), true);
  await P.speichern();
  assert.equal((await ablage.ladeDateien(P.aktiv.id))[0].inhalt, "// geändert");
  await P.sichern("willkommen.pizza");
  assert.equal(P.istGeaendert("willkommen.pizza"), false);

  // Neues Projekt (Tab „+“): unbenannt-1 mit gleichnamiger Datei
  const p1 = await P.neu({});
  assert.equal(p1.name, "unbenannt-1");
  assert.deepEqual(P.pfade(), ["unbenannt-1.pizza"]);
  assert.equal((await P.neu({})).name, "unbenannt-2");
  // Dateien: anlegen, Ordner, verschieben, Hauptdatei, löschen
  assert.equal(P.neueDatei("welt/tisch.pizza", "klasse Tisch {}"), null);
  assert.match(P.neueDatei("welt/tisch.pizza"), /gibt es schon/);
  assert.match(P.neueDatei("Welt.pizza"), /kein gültiger Dateipfad/);
  assert.match(P.neueDatei("welt"), /Dateiart|Ordner/);
  assert.equal(P.neuerOrdner("bilder"), null);
  assert.deepEqual(P.ordner(), ["bilder"]);
  assert.equal(P.neueDatei("bilder/a.png", new Uint8Array([1])), null);
  assert.deepEqual(P.ordner(), [], "Ordner hat jetzt eine Datei");
  P.setzeTabs({ offen: ["unbenannt-2.pizza", "welt/tisch.pizza"], aktiv: "welt/tisch.pizza" });
  assert.equal(P.verschiebe("welt", "raum"), null);
  assert.deepEqual(P.pfade(), ["bilder/a.png", "raum/tisch.pizza", "unbenannt-2.pizza"]);
  assert.deepEqual(P.aktiv.offen, ["unbenannt-2.pizza", "raum/tisch.pizza"], "offene Tabs ziehen mit");
  assert.equal(P.aktiv.aktiv, "raum/tisch.pizza");
  assert.match(P.verschiebe("bilder/a.png", "bilder/a.txt"), /Bild/);
  assert.match(P.setzeHauptdatei("bilder/a.png"), /\.pizza/);
  assert.equal(P.setzeHauptdatei("raum/tisch.pizza"), null);
  assert.equal(P.aktiv.hauptdatei, "raum/tisch.pizza");
  assert.equal(P.verschiebe("raum/tisch.pizza", "spiel.pizza"), null);
  assert.equal(P.aktiv.hauptdatei, "spiel.pizza", "Hauptdatei zieht beim Umbenennen mit");
  assert.equal(P.loescheDatei("spiel.pizza"), null);
  assert.equal(P.aktiv.hauptdatei, "unbenannt-2.pizza", "neue Hauptdatei nach Löschen");
  assert.equal(P.loescheDatei("bilder"), null);
  assert.match(P.loescheDatei("unbenannt-2.pizza"), /mindestens eine Datei/);
  // pizza.json zieht mit
  P.neueDatei("pizza.json", '{"pizza":1,"name":"x"}');
  await P.umbenennen("Teigball");
  assert.equal(JSON.parse(P.inhalt("pizza.json")).name, "Teigball");
  P.setzeInhalt("pizza.json", '{"pizza":1,"name":"Kugel"}');
  P.projektdateiUebernehmen();
  assert.equal(P.aktiv.name, "Kugel");
  // Sammlung mit erzeugter pizza.json
  P.loescheDatei("pizza.json");
  const sm = P.sammlung({ mitProjektdatei: true });
  assert.deepEqual(JSON.parse(sm.projekt.dateien["pizza.json"]), { pizza: 1, name: "Kugel", hauptdatei: "unbenannt-2.pizza" });
  assert.equal(P.sammlung().projekt.dateien["pizza.json"], undefined);
  // Wechseln, Duplizieren, Löschen, Papierkorb
  const kugel = P.aktiv.id;
  P.setzeInhalt("unbenannt-2.pizza", "Bote.sage((1));");
  const dup = await P.dupliziere();
  assert.equal(dup.name, "Kugel-kopie");
  assert.equal(P.istGeaendert("unbenannt-2.pizza"), true, "Kopie ist eine eigene, geänderte Fassung");
  await P.wechsle(kugel);
  assert.equal(P.aktiv.name, "Kugel");
  await P.loesche();
  assert.notEqual(P.aktiv.id, kugel);
  assert.equal(P.papierkorb()[0].id, kugel);
  assert.ok(!P.liste().some((p) => p.id === kugel));
  await P.wiederherstellen(kugel);
  assert.equal(P.aktiv.id, kugel);
  assert.equal(P.papierkorb().length, 0);
  // Reload: gleiche Ablage → letztes aktives Projekt, Dateien und Tabs
  await P.speichern();
  const speicher2 = lsAttrappe({ "pizza.projekt": kugel });
  const P2 = await erstelleProjekte({ speicher: speicher2, willkommen: "", ablage, kanal: null });
  assert.equal(P2.aktiv.id, kugel);
  assert.deepEqual(P2.pfade(), ["unbenannt-2.pizza"]);
  // Löschen des letzten sichtbaren Projekts legt ein neues an
  for (const p of P2.liste()) { if (p.id !== P2.aktiv.id) await P2.wechsle(p.id); await P2.loesche(); }
  assert.equal(P2.liste().length, 1);
  assert.match(P2.aktiv.name, /^unbenannt/);
  // Quelle finden (Beispiel-Kopie)
  await P2.neu({ name: "hallo-welt", dateien: { "hallo-welt.pizza": "H" }, quelle: "beispiel:hallo-welt.pizza" });
  assert.equal(P2.findeQuelle("beispiel:hallo-welt.pizza").name, "hallo-welt");
  assert.equal(P2.unveraendert(), true);
  P2.setzeInhalt("hallo-welt.pizza", "H2");
  assert.equal(P2.unveraendert(), false);
}
{
  // Migration beim ersten Start: pizza.tabs wird erst nach dem Schreiben entfernt – bei Speicher-Ablage gar nicht
  const ls = lsAttrappe({ "pizza.tabs": JSON.stringify(alt) });
  const P = await erstelleProjekte({ speicher: ls, willkommen: "", ablage: speicherAblage(), kanal: null });
  assert.equal(P.aktiv.name, "Mein Code");
  assert.equal(P.liste().length, 3);
  assert.equal(P.papierkorb().length, 1);
  assert.ok(ls.daten.has("pizza.tabs"), "ohne dauerhafte Ablage bleibt pizza.tabs");
  const dauer = speicherAblage(); dauer.dauerhaft = true;
  const ls2 = lsAttrappe({ "pizza.tabs": JSON.stringify(alt) });
  await erstelleProjekte({ speicher: ls2, willkommen: "", ablage: dauer, kanal: null });
  assert.ok(!ls2.daten.has("pizza.tabs"), "nach erfolgreichem Schreiben entfernt");
  // Schreibfehler → pizza.tabs bleibt
  const kaputt = speicherAblage(); kaputt.dauerhaft = true; kaputt.schreibeProjekte = async () => { throw new Error("voll"); };
  const ls3 = lsAttrappe({ "pizza.tabs": JSON.stringify(alt) });
  const P3 = await erstelleProjekte({ speicher: ls3, willkommen: "", ablage: kaputt, kanal: null });
  assert.ok(ls3.daten.has("pizza.tabs"));
  assert.equal(P3.aktiv.name, "Mein Code", "trotzdem nutzbar (im Speicher)");
}
{
  // Teigling-Cache: LRU bis 128 MiB
  const a = speicherAblage();
  const mb40 = new Uint8Array(40 * MIB);
  for (const k of ["a", "b", "c"]) await a.teiglingLege(k, mb40);
  assert.ok(await a.teiglingHole("a"), "a frisch benutzt");
  await a.teiglingLege("d", mb40);
  assert.equal(await a.teiglingHole("b"), null, "ältester (b) verdrängt");
  assert.ok(await a.teiglingHole("d"));
  assert.ok(TEIGLING_GRENZE === 128 * MIB);
}

// ---------- Bilder ----------
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 0, 0, 0, 2, 0, 8, 6, 0, 0, 0]);
assert.deepEqual(bildInfo(png), { art: "png", breite: 1024, hoehe: 512 });
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 30, 0, 40, 3, 1, 0x22, 0]);
assert.deepEqual(bildInfo(jpg), { art: "jpeg", breite: 40, hoehe: 30 });
assert.equal(bildInfo(new Uint8Array([1, 2, 3])), null);
assert.equal(pruefeBild("a.png", png).ok, true);
assert.equal(pruefeBild("a.jpg", png).fehler, "a.jpg ist kein lesbares Bild (PNG oder JPEG).");
const riesig = png.slice(); riesig[18] = 0x09; riesig[19] = 0x60; // 2400
assert.equal(pruefeBild("r.png", riesig).fehler, "r.png ist zu groß (2400 × 512) – höchstens 2048 × 2048 Pixel.");
assert.match(dataUrl(png), /^data:image\/png;base64,iVBORw0KGgo/);
// Vorbacker (PD1) mit der echten Hülle und teigling.wasm aus site/js/herd/
{
  const { createRequire } = await import("node:module");
  const fs = await import("node:fs");
  const zlib = await import("node:zlib");
  const require = createRequire(import.meta.url);
  const PV = require("../../site/js/herd/teigling.js");
  const wasm = fs.readFileSync(new URL("../../site/js/herd/teigling.wasm", import.meta.url));
  const ablage = speicherAblage();
  const vb = erstelleVorbacker({ ablage, huelle: PV, wasm });
  assert.equal(vb.verfuegbar, true);
  assert.ok((await vb.modul()) instanceof WebAssembly.Module);
  const echt = pngBauen(3, 2, zlib);
  const r = await vb.vorbacke("bilder/a.png", echt);
  assert.equal(r.ok, true, r.fehler || r.grund);
  assert.equal(r.kopf.breite, 3);
  assert.equal(r.kopf.stufen, 2);
  assert.match(r.schluessel, /^[0-9a-f]{64}\/teigling\/1$/);
  assert.deepEqual(await ablage.teiglingHole(r.schluessel), r.teigling, "im Cache");
  const r2 = await vb.vorbacke("b.png", echt);
  assert.deepEqual(r2.teigling, r.teigling, "aus dem Cache (gleiche Bytes)");
  // Kopf ok, Inhalt kaputt → Fehler-Teigling → Meldung wie zur Laufzeit
  assert.equal((await vb.vorbacke("k.png", png)).fehler, "k.png ist kein lesbares Bild (PNG oder JPEG).");
  assert.match((await vb.vorbacke("a.png", new Uint8Array([0]))).fehler, /kein lesbares Bild/);
  const t = await vb.teiglingeFuer({ "a.png": echt, "k.png": png });
  assert.deepEqual(Object.keys(t).sort(), ["a.png", "k.png"]);
  assert.ok(await vb.teigmenge(t) > 0);
  // ohne Hülle/Wasm (Node ohne DOM): klare Absage statt Absturz
  assert.match((await erstelleVorbacker({ url: null }).vorbacke("a.png", echt)).grund, /Vorbacker/);
  // Modelle (H-K16): Signatur, Vorbacken mit Nachbardateien (.gltf), Cache-Schlüssel modell/1, Meldungen wie zur Laufzeit
  const tm = (n) => new Uint8Array(fs.readFileSync(new URL("../../herd/teigling/testmodelle/" + n, import.meta.url)));
  const wuerfel = tm("wuerfel.glb"), gltf = tm("textur.gltf");
  assert.deepEqual(modellInfo(wuerfel), { art: "glb" });
  assert.deepEqual(modellInfo(gltf), { art: "gltf" });
  assert.equal(modellInfo(png), null);
  assert.equal(pruefeModell("m/a.glb", wuerfel).ok, true);
  assert.equal(pruefeModell("m/a.gltf", wuerfel).fehler, "m/a.gltf ist kein lesbares Modell (glTF 2.0).");
  assert.equal(modellFehlerText("x.glb", null), "x.glb ist kein lesbares Modell (glTF 2.0).");
  const m1 = await vb.vorbackeModell("m/w.glb", { "m/w.glb": wuerfel });
  assert.equal(m1.ok, true, m1.fehler || m1.grund);
  assert.deepEqual([m1.kopf.ecken, m1.kopf.dreiecke, m1.kopf.knoten, m1.kopf.bilder], [24, 12, 1, 0]);
  assert.match(m1.schluessel, /^[0-9a-f]{64}\/modell\/1$/);
  assert.deepEqual(await ablage.teiglingHole(m1.schluessel), m1.teig, "Modellteig im Cache");
  const sammlungT = { "m/textur.gltf": gltf, "m/textur.bin": tm("textur.bin") };
  for (const b of ["farbe", "normale", "mr", "oc", "leucht"]) sammlungT["m/bilder/" + b + ".png"] = tm("bilder/" + b + ".png");
  const m2 = await vb.vorbackeModell("m/textur.gltf", sammlungT);
  assert.equal(m2.ok, true, m2.fehler || m2.grund);
  assert.equal(m2.kopf.bilder, 4);
  const ohneBin = { ...sammlungT };
  delete ohneBin["m/textur.bin"];
  const m3 = await vb.vorbackeModell("m/textur.gltf", ohneBin);
  assert.deepEqual([m3.ok, m3.code, m3.fehler], [false, 5, "m/textur.gltf braucht die Datei textur.bin – die liegt nicht in der Kiste."]);
  const m4 = await vb.vorbackeModell("m/d.glb", { "m/d.glb": tm("fehler-draco.glb") });
  assert.equal(m4.fehler, "m/d.glb braucht die Erweiterung KHR_draco_mesh_compression – die kann der Herd nicht.");
  const tt = await vb.teiglingeFuer({ "a.png": echt, "m/textur.gltf": gltf }, sammlungT);
  assert.deepEqual(Object.keys(tt).sort(), ["a.png", "m/textur.gltf"]);
  assert.deepEqual(tt["m/textur.gltf"], m2.teig);
  // Modellteig ohne die 4 Längenfelder seiner eingebetteten Bilder (sie zählen je Quelle einzeln, PROJEKTE §5.10)
  assert.equal(await vb.teigmenge(tt), tt["a.png"].length + m2.teig.length - 4 * 4);
}

// Lader-Anbindung (PA1): mit dem echten Interpreter als globalThis.PizzaLang nehmen pruefePfad/ausDateien/ladePruefung den Lader
{
  const { createRequire } = await import("node:module");
  globalThis.PizzaLang = createRequire(import.meta.url)("../../site/js/pizza.js");
  const { laderVorhanden, ladePruefung } = await import("../src/projekt.js");
  assert.equal(laderVorhanden(), true);
  assert.equal(pruefePfad("welt/tisch.pizza"), null);
  assert.match(pruefePfad("Groß.pizza"), /^"Groß\.pizza" ist kein gültiger Dateipfad \(nur a–z, 0–9, -, _, \. und \/\): Erlaubt sind nur/);
  assert.match(pruefePfad("a//b.pizza"), /kein gültiger Dateipfad.*leeres Stück/);
  assert.match(pruefePfad("a.exe"), /Dateiart/);
  assert.deepEqual(ausDateien({ "x.pizza": "" }), { name: "x", hauptdatei: "x.pizza", args: [] });
  assert.match(ausDateien({ "pizza.json": "{" }).fehler, /pizza\.json ist ungültig: kein gültiges JSON/);
  const f = ladePruefung({ dateien: { "h.pizza": 'bestellt "fehlt.pizza";\nBote.sage((1));', "b.pizza": "" }, hauptdatei: "h.pizza" });
  assert.equal(f.code, "P0015");
  assert.equal(f.datei, "h.pizza");
  assert.equal(f.zeile, 1);
  assert.equal(ladePruefung({ dateien: { "h.pizza": 'bestellt "b.pizza";', "b.pizza": "" }, hauptdatei: "h.pizza" }), null);
  delete globalThis.PizzaLang;
}
console.log("projekte ok");

/** Gültiges RGBA-PNG b×h (zlib aus Node) – keine Binärdateien im Repo. */
function pngBauen(b, h, zlib) {
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; };
  const block = (typ, daten) => {
    const t = Buffer.from(typ, "ascii");
    const l = Buffer.alloc(4); l.writeUInt32BE(daten.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, daten])));
    return Buffer.concat([l, t, daten, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(b, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const roh = Buffer.alloc(h * (1 + 4 * b));
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) roh.set([200, 50 * x, 30 * y, 255], y * (1 + 4 * b) + 1 + 4 * x);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), block("IHDR", ihdr), block("IDAT", zlib.deflateSync(roh)), block("IEND", Buffer.alloc(0))]));
}


