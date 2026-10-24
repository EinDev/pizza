// Teilen-Client (ui/src/teilen.js) gegen den echten Teilen-Dienst (durchreiche/server.mjs, im Prozess auf 127.0.0.1).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { starte } from "../../durchreiche/server.mjs";
import {
  leseLinkWert, linkAusHash, linkAdressen, teilenQuelle, pruefeSchluessel, appTitel, leseKonfig, dauerText, datumText, ablaufAb,
  umfangText, sha256Js, sha256Hex, baueManifest, pruefeTeilenGrenzen, teile, holeLink, ladeGeteilt, loescheLink, holeKonfig,
  ohneErzeugteProjektdatei, TeilenFehler, ALT_TEXT, FORMAT,
} from "../src/teilen.js";
import { erzeugeProjektdatei } from "../src/projekt.js";

// ---------- Links ----------
assert.deepEqual(leseLinkWert("Ab3dEf7hIj9k"), { id: "Ab3dEf7hIj9k", version: null });
assert.deepEqual(leseLinkWert("Ab3dEf7hIj9k@3"), { id: "Ab3dEf7hIj9k", version: 3 });
assert.deepEqual(leseLinkWert("Ab3dEf7hIj9k%403"), { id: "Ab3dEf7hIj9k", version: 3 }, "@ URL-kodiert");
assert.deepEqual(leseLinkWert("abcdefghij"), { alt: true }, "alter Hastebin-Schlüssel (F6)");
for (const x of ["", "kurz", "Ab3dEf7hIj9k@0", "Ab3dEf7hIj9k@01", "Ab3dEf7hIj9k@1234567", "Ab3dEf7hIj9-", "Ab3dEf7hIj9kX"]) assert.equal(leseLinkWert(x), null, x);
assert.deepEqual(linkAusHash("#app=Ab3dEf7hIj9k@2"), { art: "app", wert: "Ab3dEf7hIj9k@2", link: { id: "Ab3dEf7hIj9k", version: 2 } });
assert.deepEqual(linkAusHash("#x=1&h=Ab3dEf7hIj9k"), { art: "h", wert: "Ab3dEf7hIj9k", link: { id: "Ab3dEf7hIj9k", version: null } });
assert.equal(linkAusHash("#code=u.abc"), null);
assert.deepEqual(linkAdressen("https://pizza.example.com/", "Ab3dEf7hIj9k", 4), {
  code: "https://pizza.example.com/#h=Ab3dEf7hIj9k", app: "https://pizza.example.com/#app=Ab3dEf7hIj9k",
  codeFest: "https://pizza.example.com/#h=Ab3dEf7hIj9k@4", appFest: "https://pizza.example.com/#app=Ab3dEf7hIj9k@4",
});
assert.equal(teilenQuelle("Ab3dEf7hIj9k", 2), "teilen:Ab3dEf7hIj9k@2");
const S43 = "A".repeat(42) + "_";
assert.equal(pruefeSchluessel("  " + S43 + "\n"), S43);
assert.equal(pruefeSchluessel("Bearer " + S43), S43);
assert.equal(pruefeSchluessel(S43.slice(1)), null);
assert.equal(appTitel("zahlenraten.pizza"), "zahlenraten");
assert.equal(appTitel("Mein Spiel"), "Mein Spiel");
assert.equal(appTitel(".pizza"), null);
assert.equal(appTitel(null), null);

// ---------- Konfig und Texte ----------
const kStd = leseKonfig({ teilen: true, aufbewahrungTage: 90, aufbewahrungAb: "letzte-version", grenzen: { dateien: 100, dateiBytes: 2097152, projektBytes: 8388608, pizzaBytes: 524288, manifestBytes: 65536 } });
assert.equal(kStd.teilen, true);
assert.equal(kStd.tage, 90);
assert.equal(leseKonfig({ teilen: true, aufbewahrungTage: null }).tage, null, "null = unbegrenzt");
assert.equal(leseKonfig({ teilen: false }).teilen, false);
assert.equal(leseKonfig(null).tage, undefined, "unbekannt");
assert.equal(ablaufAb(90, Date.parse("2026-10-22T23:30:00Z")), "2027-01-20");
assert.equal(datumText("2027-01-20"), "20.01.2027");
assert.equal(dauerText(kStd, { jetzt: Date.parse("2026-10-22T10:00:00Z") }), "Der Link bleibt 90 Tage nach der letzten Version gültig (bis 20.01.2027) – jede neue Version verlängert ihn.");
assert.equal(dauerText({ tage: null }), "Der Link bleibt gespeichert, bis du ihn löschst.");
assert.equal(dauerText(leseKonfig(null)), "");
assert.equal(umfangText(3, 182 * 1024), "3 Dateien, 182 KB");
assert.equal(umfangText(1, 10), "1 Datei, 10 B");

// ---------- SHA-256 (Rückfall = WebCrypto = Node) ----------
for (const n of [0, 1, 55, 56, 63, 64, 65, 1000]) {
  const b = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 255);
  const soll = createHash("sha256").update(b).digest("hex");
  assert.equal(sha256Js(b), soll, "sha256Js " + n);
  assert.equal(await sha256Hex(b), soll);
}

// ---------- Manifest ----------
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const projektA = {
  name: "Teigball", hauptdatei: "hauptgang.pizza",
  dateien: { "hauptgang.pizza": 'bestellt "welt/tisch.pizza";\r\nBote.sage((tisch()));\n', "welt/tisch.pizza": 'margherita tisch() { serviere (("Tisch")); }\n', "bilder/a.png": PNG, "pruefung/erwartet": "x" },
};
const m1 = await baueManifest(projektA);
assert.equal(m1.manifest.format, FORMAT);
assert.deepEqual(Object.keys(m1.manifest), ["format", "name", "hauptdatei", "dateien"], "Schlüssel in kanonischer Reihenfolge, ohne leere optionale");
assert.deepEqual(m1.manifest.dateien.map((d) => d.pfad), ["bilder/a.png", "hauptgang.pizza", "pizza.json", "welt/tisch.pizza"], "sortiert, pizza.json erzeugt, ohne pruefung/");
const haupt = m1.manifest.dateien.find((d) => d.pfad === "hauptgang.pizza");
assert.equal(haupt.sha256, createHash("sha256").update('bestellt "welt/tisch.pizza";\nBote.sage((tisch()));\n').digest("hex"), "\\r\\n → \\n vor dem Hashen");
assert.equal(m1.manifest.name, "Teigball");
// Hauptdatei des Projekts gewinnt, wenn pizza.json sie nicht nennt und es mehrere .pizza gibt
const m2 = await baueManifest({ name: "x", hauptdatei: "b.pizza", dateien: { "a.pizza": "", "b.pizza": "", "pizza.json": '{"pizza":1,"beschreibung":"Zeile1\\nZeile2","args":["--x"]}' } });
assert.equal(m2.manifest.hauptdatei, "b.pizza");
assert.equal(m2.manifest.beschreibung, "Zeile1 Zeile2", "Steuerzeichen in der Anzeige-Kopie ersetzt");
assert.deepEqual(m2.manifest.args, ["--x"]);
assert.match(m2.dateien["pizza.json"], /"hauptdatei": "b.pizza"/);
await assert.rejects(baueManifest({ name: "x", hauptdatei: "a.pizza", dateien: { "a.pizza": "", "pizza.json": "{kaputt" } }), (e) => e instanceof TeilenFehler && /pizza.json ist ungültig/.test(e.message));
// Grenzen vorab
const viele = {};
for (let i = 0; i < 101; i++) viele["d" + i + ".txt"] = "x";
assert.match(pruefeTeilenGrenzen(viele), /101 Dateien, höchstens 100/);
assert.match(pruefeTeilenGrenzen({ "a.txt": "x".repeat(20) }, { dateien: 100, dateiBytes: 10, projektBytes: 100, pizzaBytes: 10 }), /a.txt hat 20 B, höchstens 10 B/);
// Erzeugte pizza.json fällt beim Öffnen wieder weg, eine eigene bleibt
const pjErzeugt = erzeugeProjektdatei({ name: "gruss", hauptdatei: "gruss.pizza" });
assert.deepEqual(ohneErzeugteProjektdatei({ "gruss.pizza": "x", "pizza.json": pjErzeugt }, { name: "gruss", hauptdatei: "gruss.pizza" }), { "gruss.pizza": "x" });
assert.ok("pizza.json" in ohneErzeugteProjektdatei({ "gruss.pizza": "x", "pizza.json": pjErzeugt.replace("gruss\"", "Gruß\"") }, { name: "gruss", hauptdatei: "gruss.pizza" }));

// ---------- gegen den echten Dienst ----------
const daten = fs.mkdtempSync(path.join(os.tmpdir(), "pizza-teilen-test-"));
const dienst = await starte({ host: "127.0.0.1", port: 0, umgebung: {}, log: () => {}, konfig: { daten, rateSchreiben: 0 } });
const basis = "http://127.0.0.1:" + dienst.port + "/";
const zaehler = { PUT: 0, GET_BLOB: 0, alle: [] };
const f = (url, init = {}) => {
  const m = init.method || "GET";
  zaehler.alle.push(m + " " + url.slice(basis.length));
  if (m === "PUT") zaehler.PUT++;
  if (m === "GET" && /api\/blob\//.test(url)) zaehler.GET_BLOB++;
  return fetch(url, init);
};
const o = { basis, fetch: f, warte: async () => {} };
try {
  assert.deepEqual((await holeKonfig(o)).grenzen, kStd.grenzen, "Grenzen aus /api/konfig");

  const v1 = await teile({ ...o, projekt: projektA });
  assert.match(v1.id, /^[0-9A-Za-z]{12}$/);
  assert.equal(v1.version, 1);
  assert.ok(pruefeSchluessel(v1.schluessel), "Schlüssel kommt genau beim Erstellen");
  assert.equal(zaehler.PUT, 4, "4 Blobs hochgeladen");
  assert.deepEqual(zaehler.alle.slice(0, 2), ["GET api/konfig", "POST api/blob/fehlend"]);

  const g1 = await ladeGeteilt(o, v1.id);
  assert.equal(g1.version, 1);
  assert.equal(g1.versionen, 1);
  assert.equal(g1.hauptdatei, "hauptgang.pizza");
  assert.equal(g1.name, "Teigball");
  assert.deepEqual(g1.dateien["bilder/a.png"], PNG, "Bild unverändert (Uint8Array)");
  assert.equal(g1.dateien["hauptgang.pizza"], 'bestellt "welt/tisch.pizza";\nBote.sage((tisch()));\n');
  assert.equal(g1.dateien["pruefung/erwartet"], undefined);
  assert.match(g1.ablauf, /^\d{4}-\d{2}-\d{2}$/);

  // Neue Version: nur die geänderte Textdatei wird hochgeladen (Dedup über Versionen)
  zaehler.PUT = 0;
  const projektB = { ...projektA, dateien: { ...projektA.dateien, "welt/tisch.pizza": 'margherita tisch() { serviere (("Tisch 2")); }\n' } };
  const v2 = await teile({ ...o, projekt: projektB, link: { id: v1.id, schluessel: v1.schluessel } });
  assert.deepEqual([v2.id, v2.version, v2.schluessel], [v1.id, 2, undefined], "gleicher Link, v2, kein neuer Schlüssel");
  assert.equal(zaehler.PUT, 1, "nur eine Datei neu hochgeladen");
  const unv = await teile({ ...o, projekt: projektB, link: { id: v1.id, schluessel: v1.schluessel } });
  assert.deepEqual([unv.version, unv.unveraendert], [2, true], "gleiches Manifest → keine neue Version");

  // Link zeigt die neueste, @1 die feste
  assert.match((await ladeGeteilt(o, v1.id)).dateien["welt/tisch.pizza"], /Tisch 2/);
  const fest = await ladeGeteilt(o, v1.id, 1);
  assert.equal(fest.version, 1);
  assert.doesNotMatch(fest.dateien["welt/tisch.pizza"], /Tisch 2/);
  assert.equal((await holeLink(o, v1.id)).versionen, 2);

  // Falscher Schlüssel → 403 mit klarer Meldung
  await assert.rejects(teile({ ...o, projekt: projektA, link: { id: v1.id, schluessel: "B".repeat(43) } }),
    (e) => e instanceof TeilenFehler && e.art === "schluessel" && e.message === "Der Schlüssel passt nicht zu diesem Link.");
  // Löschen → danach 404 („weg“), alte Hastebin-ID → F6
  assert.equal(await loescheLink(o, v1.id, v1.schluessel), true);
  await assert.rejects(ladeGeteilt(o, v1.id), (e) => e.art === "weg" && /gibt es nicht/.test(e.message));
  await assert.rejects(teile({ ...o, projekt: projektA, link: { id: v1.id, schluessel: v1.schluessel } }), (e) => e.art === "weg");
  // nginx beantwortet alte Schlüssel mit alt:true (hier nachgestellt)
  const altFetch = async () => new Response('{"fehler":"x","alt":true}', { status: 404, headers: { "Content-Type": "application/json" } });
  await assert.rejects(holeLink({ basis, fetch: altFetch }, "abcdefghij"), (e) => e.art === "alt" && e.message === ALT_TEXT);

  // Ein-Datei-Projekt: pizza.json wird beim Teilen erzeugt und beim Öffnen wieder weggelassen
  const ein = await teile({ ...o, projekt: { name: "gruss", hauptdatei: "gruss.pizza", dateien: { "gruss.pizza": 'Bote.sage(("Ciao"));' } } });
  const gEin = await ladeGeteilt(o, ein.id);
  assert.deepEqual(Object.keys(ohneErzeugteProjektdatei(gEin.dateien, gEin)), ["gruss.pizza"]);
} finally {
  await dienst.schliesse();
  fs.rmSync(daten, { recursive: true, force: true });
}

// ---------- 429: sanft wiederholen, lange Wartezeit des Dienstes nicht ----------
{
  let n = 0;
  const gewartet = [];
  const f429 = async (url) => {
    n++;
    if (n <= 2) return new Response('{"fehler":"Zu viele"}', { status: 429, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ teilen: true, aufbewahrungTage: 7 }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  // holeKonfig wiederholt nicht – direkt über holeLink prüfen (eigene Antwortform)
  const fLink = async (url) => {
    n++;
    if (n <= 2) return new Response("{}", { status: 429 });
    return new Response(JSON.stringify({ id: "Ab3dEf7hIj9k", version: 1, versionen: 1, projekt: { format: FORMAT, dateien: [] } }), { status: 200 });
  };
  n = 0;
  const r = await holeLink({ fetch: fLink, warte: async (ms) => { gewartet.push(ms); } }, "Ab3dEf7hIj9k");
  assert.equal(r.version, 1);
  assert.deepEqual(gewartet, [1000, 2000], "ohne Retry-After: 1 s, 2 s");
  n = 0;
  const lang = async () => new Response('{"fehler":"Zu viele Anfragen – bitte kurz warten."}', { status: 429, headers: { "Retry-After": "60" } });
  await assert.rejects(holeLink({ fetch: lang, warte: async () => { throw new Error("darf nicht warten"); } }, "Ab3dEf7hIj9k"), (e) => e.status === 429 && /kurz warten/.test(e.message));
  void f429;
}
console.log("Teilen (Durchreiche-Client) ok");
