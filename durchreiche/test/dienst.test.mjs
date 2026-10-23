// Tests des laufenden Dienstes über HTTP (zufälliger freier Port, Datenordner im Temp-Verzeichnis, Uhr injiziert).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { starte } from "../server.mjs";
import { sha256 } from "../regeln.mjs";

const TAG = 86_400_000;
const STUNDE = 3_600_000;
const T0 = Date.parse("2026-10-23T12:00:00Z");
const OHNE_RATEN = { rateSchreiben: 0, rateLesen: 0, rateFehlend: 0, rateBlobHoch: 0 };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);

async function dienst(t, konfig = {}, o = {}) {
  const daten = o.daten || fs.mkdtempSync(path.join(os.tmpdir(), "durchreiche-test-"));
  const uhr = o.uhr || { t: T0 };
  const logs = o.logs || [];
  const d = await starte({ umgebung: {}, konfig: { daten, ...konfig }, jetzt: () => uhr.t, log: (z) => logs.push(z), host: "127.0.0.1", port: 0 });
  const basis = "http://127.0.0.1:" + d.port;
  t.after(async () => {
    await d.schliesse();
    if (!o.daten) fs.rmSync(daten, { recursive: true, force: true });
  });
  const anfrage = async (methode, pfad, { body, typ, kopf = {} } = {}) => {
    const h = { ...kopf };
    if (typ) h["Content-Type"] = typ;
    const r = await fetch(basis + pfad, { method: methode, headers: h, body });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* kein JSON */ }
    return { status: r.status, kopf: r.headers, text, json };
  };
  const api = {
    d, daten, uhr, logs, basis, anfrage,
    put: (bytes, hash = sha256(bytes), kopf) => anfrage("PUT", "/api/blob/" + hash, { body: bytes, typ: "application/octet-stream", kopf }),
    fehlend: (hashes, kopf) => anfrage("POST", "/api/blob/fehlend", { body: JSON.stringify({ sha256: hashes }), typ: "application/json", kopf }),
    post: (m, id, schluessel, kopf = {}) => anfrage("POST", "/api/teilen" + (id ? "/" + id : ""), {
      body: JSON.stringify(m), typ: "application/json", kopf: schluessel ? { ...kopf, Authorization: "Bearer " + schluessel } : kopf,
    }),
    get: (id, kopf) => anfrage("GET", "/api/teilen/" + id, { kopf }),
    loesche: (id, schluessel) => anfrage("DELETE", "/api/teilen/" + id, { kopf: schluessel ? { Authorization: "Bearer " + schluessel } : {} }),
  };
  /** Teilt ein Projekt wie der Playground: Manifest bauen → fehlend → fehlende Blobs hochladen → Manifest posten. */
  api.teile = async (dateien, { id, schluessel, extra = {}, kopf } = {}) => {
    const m = api.manifest(dateien, extra);
    const roh = Object.fromEntries(Object.entries(dateien).map(([p, v]) => [p, Buffer.isBuffer(v) ? v : Buffer.from(v, "utf8")]));
    const f = await api.fehlend(m.dateien.map((d) => d.sha256), kopf);
    assert.equal(f.status, 200, f.text);
    const puts = [];
    for (const h of f.json.fehlend) {
      const bytes = Object.values(roh).find((b) => sha256(b) === h);
      const r = await api.put(bytes, h, kopf);
      assert.ok(r.status === 201 || r.status === 200, r.text);
      puts.push(h);
    }
    const r = await api.post(m, id, schluessel, kopf);
    return { ...r, puts, manifest: m };
  };
  api.manifest = (dateien, extra = {}) => ({
    format: "pizza-projekt/1", name: "Teigball", hauptdatei: "hauptgang.pizza",
    ...extra,
    dateien: Object.entries(dateien).map(([pfad, v]) => {
      const b = Buffer.isBuffer(v) ? v : Buffer.from(v, "utf8");
      return { pfad, sha256: sha256(b), groesse: b.length };
    }),
  });
  return api;
}

const PROJEKT = { "pizza.json": '{"pizza":1,"name":"Teigball"}\n', "hauptgang.pizza": "Bote.sage((\"Hallo\"));\n", "bilder/tisch.png": PNG };
const ordnerInhalt = (d) => fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).filter((f) => fs.statSync(path.join(d, f)).isFile()) : [];

test("Ablauf komplett: teilen, lesen, neue Version (Dedup), @n, unverändert, Schlüssel, löschen – ohne IDs/Inhalte im Log", async (t) => {
  const s = await dienst(t);
  const k = await s.anfrage("GET", "/api/konfig");
  assert.equal(k.status, 200);
  assert.equal(k.json.aufbewahrungTage, 90);
  assert.equal(k.json.aufbewahrungAb, "letzte-version");
  assert.equal((await s.anfrage("GET", "/healthz")).text, "ok\n");

  const a = await s.teile(PROJEKT);
  assert.equal(a.status, 201, a.text);
  assert.match(a.json.id, /^[0-9A-Za-z]{12}$/);
  assert.equal(a.json.version, 1);
  assert.match(a.json.schluessel, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a.puts.length, 3);
  const { id, schluessel } = a.json;

  const g1 = await s.get(id);
  assert.equal(g1.status, 200);
  assert.equal(g1.kopf.get("cache-control"), "no-store");
  assert.deepEqual({ ...g1.json, projekt: undefined }, { id, version: 1, versionen: 1, geaendert: "2026-10-23", ablauf: "2027-01-21", projekt: undefined });
  assert.deepEqual(g1.json.projekt.dateien.map((d) => d.pfad), ["bilder/tisch.png", "hauptgang.pizza", "pizza.json"], "nach Pfad sortiert");
  assert.equal(g1.json.projekt.name, "Teigball");

  const blob = await fetch(s.basis + "/api/blob/" + sha256(PNG));
  assert.equal(blob.status, 200);
  assert.equal(blob.headers.get("content-type"), "application/octet-stream");
  assert.equal(blob.headers.get("x-content-type-options"), "nosniff");
  assert.equal(blob.headers.get("content-disposition"), "attachment");
  assert.equal(blob.headers.get("cache-control"), "private, max-age=31536000, immutable");
  assert.ok(Buffer.from(await blob.arrayBuffer()).equals(PNG));

  // neue Version: nur die geänderte Textdatei wird hochgeladen
  s.uhr.t += 5 * TAG;
  const b = await s.teile({ ...PROJEKT, "hauptgang.pizza": "Bote.sage((\"Hallo v2\"));\n" }, { id, schluessel });
  assert.equal(b.status, 201, b.text);
  assert.deepEqual(b.json, { id, version: 2 });
  assert.equal(b.puts.length, 1, "Bild und pizza.json nicht erneut hochgeladen");
  const g2 = await s.get(id);
  assert.equal(g2.json.version, 2);
  assert.equal(g2.json.versionen, 2);
  assert.equal(g2.json.geaendert, "2026-10-28");
  assert.equal(g2.json.ablauf, "2027-01-26", "Ablauf ab letzter Version");
  const v1 = await s.get(id + "@1");
  assert.equal(v1.status, 200);
  assert.equal(v1.json.version, 1);
  assert.equal(v1.kopf.get("cache-control"), "private, max-age=31536000, immutable");
  assert.equal((await s.get(id + "%402")).json.version, 2, "@ auch URL-kodiert");
  assert.equal((await s.get(id + "@3")).status, 404);
  assert.equal((await s.get(id + "@0")).status, 404);

  // gleiches Manifest → keine neue Version
  const u = await s.post(b.manifest, id, schluessel);
  assert.equal(u.status, 200);
  assert.deepEqual(u.json, { id, version: 2, unveraendert: true });

  // Schlüssel: falsch, kaputt, fehlt
  const anderer = "A".repeat(43);
  assert.equal((await s.post(s.manifest(PROJEKT, { name: "x" }), id, anderer)).status, 403);
  assert.equal((await s.post(s.manifest(PROJEKT, { name: "x" }), id, "kurz")).status, 403);
  assert.equal((await s.post(s.manifest(PROJEKT, { name: "x" }), id)).status, 403);
  assert.equal((await s.post(s.manifest(PROJEKT), "AAAAAAAAAAAA", schluessel)).status, 404, "unbekannter Link");
  assert.equal((await s.loesche(id, anderer)).status, 403);
  assert.equal((await s.loesche(id)).status, 403);

  const del = await s.loesche(id, schluessel);
  assert.equal(del.status, 204);
  assert.equal((await s.get(id)).status, 404);
  assert.equal((await s.get(id + "@1")).status, 404);
  assert.equal((await s.loesche(id, schluessel)).status, 404);
  assert.match((await s.get(id)).json.fehler, /gibt es nicht/);

  // Datenschutz: kein Inhalt, keine ID, kein Schlüssel, kein Hash im Log
  const log = s.logs.join("\n");
  assert.ok(s.logs.length >= 1);
  for (const geheim of [id, schluessel, sha256(PNG), "Hallo", "Teigball", "tisch"]) assert.ok(!log.includes(geheim), "Log enthält " + geheim);
});

test("Linkdatei und Volume enthalten nur den Schlüssel-Hash, Dateien heißen nur nach Hash/ID", async (t) => {
  const s = await dienst(t);
  const a = await s.teile(PROJEKT);
  const dateien = ordnerInhalt(s.daten);
  const link = dateien.find((f) => f.endsWith(".json"));
  assert.equal(path.basename(link), a.json.id + ".json");
  const inhalt = fs.readFileSync(path.join(s.daten, link), "utf8");
  assert.ok(!inhalt.includes(a.json.schluessel));
  assert.ok(dateien.every((f) => /^(blobs[\\/][0-9a-f]{2}[\\/][0-9a-f]{64}|links[\\/][0-9A-Za-z]{2}[\\/][0-9A-Za-z]{12}\.json)$/.test(f)), dateien.join(", "));
  assert.equal(dateien.filter((f) => f.startsWith("blobs")).length, 4, "3 Dateien + Manifest");
});

test("Fehlende Blobs → 409 mit Liste, danach hochladen und erneut posten", async (t) => {
  const s = await dienst(t);
  const m = s.manifest(PROJEKT);
  const r = await s.post(m);
  assert.equal(r.status, 409);
  assert.deepEqual(new Set(r.json.fehlend), new Set(m.dateien.map((d) => d.sha256)));
  const a = await s.teile(PROJEKT);
  assert.equal(a.status, 201);
});

test("Blob-PUT: Hash wird geprüft, Größe begrenzt, vorhanden = 200, Typen 415, Methoden 405, abgebrochen hinterlässt nichts", async (t) => {
  const s = await dienst(t, { maxDateiBytes: 1000 });
  const x = Buffer.from("hallo");
  assert.equal((await s.put(x)).status, 201);
  assert.equal((await s.put(x)).status, 200);
  assert.equal((await s.put(Buffer.from("anders"), sha256(Buffer.from("x")))).status, 422);
  assert.equal((await s.put(Buffer.alloc(1001))).status, 413);
  assert.equal((await s.anfrage("PUT", "/api/blob/" + sha256(Buffer.from("y")), { body: "y", typ: "text/plain" })).status, 415);
  assert.equal((await s.anfrage("POST", "/api/teilen", { body: "{}", typ: "text/plain" })).status, 415, "kein CSRF über Formulare");
  assert.equal((await s.anfrage("POST", "/api/blob/fehlend", { body: "{}", typ: "application/x-www-form-urlencoded" })).status, 415);
  assert.equal((await s.anfrage("DELETE", "/api/blob/" + sha256(x))).status, 405);
  assert.equal((await s.anfrage("PUT", "/api/teilen")).status, 405);
  assert.equal((await s.anfrage("POST", "/api/teilen/AAAAAAAAAAAA@1", { body: "{}", typ: "application/json" })).status, 405);
  assert.equal((await s.anfrage("GET", "/api/blob/ABC")).status, 404);
  assert.equal((await s.anfrage("GET", "/api/blob/" + "0".repeat(64))).status, 404);
  assert.equal((await s.anfrage("GET", "/api/teilen/kurz")).status, 404);
  assert.equal((await s.anfrage("GET", "/api/gibtsnicht")).status, 404);
  assert.equal((await s.anfrage("POST", "/api/blob/fehlend", { body: "{nein", typ: "application/json" })).status, 422);
  assert.equal((await s.fehlend(["ABC"])).status, 422);
  assert.equal((await s.fehlend(Array(101).fill("0".repeat(64)))).status, 422);

  // abgebrochener Upload: Content-Length 900, nur 10 Bytes, dann Verbindung weg
  const h = sha256(Buffer.alloc(900, 1));
  await new Promise((ok) => {
    const sock = net.connect(s.d.port, "127.0.0.1", () => {
      sock.write("PUT /api/blob/" + h + " HTTP/1.1\r\nHost: x\r\nContent-Type: application/octet-stream\r\nContent-Length: 900\r\n\r\n" + "x".repeat(10));
      setTimeout(() => { sock.destroy(); ok(); }, 100);
    });
  });
  for (let i = 0; i < 50 && fs.readdirSync(path.join(s.daten, "tmp")).length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(fs.readdirSync(path.join(s.daten, "tmp")), [], "tmp leer");
  assert.equal(s.d.lager.blobs.has(h), false);
  assert.deepEqual((await s.fehlend([h, sha256(x)])).json.fehlend, [h]);
});

test("Manifest-Prüfung gegen die Blobs: Größe, PNG-Signatur, \\r\\n, ungültiges UTF-8 → 422", async (t) => {
  const s = await dienst(t);
  const r1 = await s.teile({ ...PROJEKT, "bilder/tisch.png": Buffer.from("kein png") });
  assert.equal(r1.status, 422);
  assert.match(r1.json.fehler, /kein PNG/);
  const r2 = await s.teile({ ...PROJEKT, "daten/a.txt": "a\r\nb" });
  assert.equal(r2.status, 422);
  assert.match(r2.json.fehler, /Zeilenenden/);
  const r3 = await s.teile({ ...PROJEKT, "daten/a.txt": Buffer.from([0x61, 0xff]) });
  assert.equal(r3.status, 422);
  const m = s.manifest(PROJEKT);
  m.dateien[0].groesse += 1;
  const r4 = await s.post(m);
  assert.equal(r4.status, 422);
  assert.match(r4.json.fehler, /Größe/);
  const r5 = await s.post({ ...s.manifest(PROJEKT), extra: true });
  assert.equal(r5.status, 422);
  const r6 = await s.anfrage("POST", "/api/teilen", { body: "x".repeat(70_000), typ: "application/json" });
  assert.equal(r6.status, 413);
});

test("Höchstens 200 Versionen je Link", async (t) => {
  const s = await dienst(t, OHNE_RATEN);
  const a = await s.teile(PROJEKT);
  const { id, schluessel } = a.json;
  for (let i = 2; i <= 200; i++) {
    const r = await s.post(s.manifest(PROJEKT, { args: [String(i)] }), id, schluessel);
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.version, i);
  }
  const zuviel = await s.post(s.manifest(PROJEKT, { args: ["201"] }), id, schluessel);
  assert.equal(zuviel.status, 409);
  assert.equal(zuviel.json.fehler, "Dieser Link hat schon 200 Versionen – teile einen neuen Link.");
  assert.equal((await s.get(id + "@200")).json.projekt.args[0], "200");
  assert.equal((await s.get(id + "@1")).json.projekt.args, undefined);
});

test("Ablauf: gilt bis einschließlich Ablauftag, danach sofort 404; Aufräumen löscht Link und lose Blobs; neue Version verlängert", async (t) => {
  const s = await dienst(t);
  const a = await s.teile(PROJEKT);
  const b = await s.teile({ ...PROJEKT, "hauptgang.pizza": "Bote.sage((2));\n" });
  s.uhr.t += 50 * TAG;
  const b2 = await s.teile({ ...PROJEKT, "hauptgang.pizza": "Bote.sage((3));\n" }, { id: b.json.id, schluessel: b.json.schluessel });
  assert.equal(b2.status, 201);
  s.uhr.t = T0 + 90 * TAG; // 2027-01-21 = Ablauftag von a
  assert.equal((await s.get(a.json.id)).status, 200);
  s.uhr.t += TAG;
  assert.equal((await s.get(a.json.id)).status, 404, "ab dem Folgetag 404");
  assert.equal((await s.get(b.json.id)).status, 200, "b wurde nach 50 Tagen neu versioniert");
  const vorher = s.d.lager.blobs.size;
  const r = await s.d.aufraeumen();
  assert.equal(r.links, 1);
  assert.equal(r.blobs, 2, "nur a nutzte sein Manifest und \"Hallo\"-hauptgang; Bild/pizza.json teilt b");
  assert.equal(s.d.lager.blobs.size, vorher - 2);
  assert.ok(!fs.existsSync(path.join(s.daten, "links", a.json.id.slice(0, 2), a.json.id + ".json")));
  assert.equal((await s.get(b.json.id + "@1")).status, 200);
  assert.ok(s.logs.some((z) => z.startsWith("Aufräumen: 1 Link(s) abgelaufen, 2 Blob(s) entfernt")), s.logs.join("\n"));
});

test("TEILEN_ABLAUF_TAGE=0: unbegrenzt (ablauf null)", async (t) => {
  const s = await dienst(t, { ablaufTage: 0 });
  const a = await s.teile(PROJEKT);
  s.uhr.t += 5000 * TAG;
  const g = await s.get(a.json.id);
  assert.equal(g.status, 200);
  assert.equal(g.json.ablauf, null);
  assert.equal((await s.anfrage("GET", "/api/konfig")).json.aufbewahrungTage, null);
});

test("Müllabfuhr: lose Blobs bleiben 1 h, `fehlend` frischt auf, referenzierte bleiben immer", async (t) => {
  const s = await dienst(t);
  const los = Buffer.from("lose");
  const frisch = Buffer.from("frisch");
  await s.put(los);
  await s.teile(PROJEKT);
  assert.equal((await s.d.aufraeumen()).blobs, 0, "unter 1 h bleibt alles");
  s.uhr.t += 2 * STUNDE;
  await s.put(frisch);
  assert.deepEqual((await s.fehlend([sha256(los)])).json.fehlend, []);
  assert.equal((await s.d.aufraeumen()).blobs, 0, "fehlend hat die mtime aufgefrischt");
  s.uhr.t += 2 * STUNDE;
  assert.equal((await s.d.aufraeumen()).blobs, 2, "beide lose Blobs sind jetzt alt");
  assert.deepEqual(new Set((await s.fehlend([sha256(los), sha256(frisch), sha256(PNG)])).json.fehlend), new Set([sha256(los), sha256(frisch)]));
  assert.equal(s.d.lager.loseBytes, 0);
});

test("Löschen räumt alte, nicht mehr genutzte Blobs sofort weg; geteilte Blobs bleiben", async (t) => {
  const s = await dienst(t);
  const a = await s.teile(PROJEKT);
  const b = await s.teile({ ...PROJEKT, "hauptgang.pizza": "anders\n" });
  s.uhr.t += 2 * STUNDE;
  const vorher = s.d.lager.blobs.size;
  assert.equal((await s.loesche(a.json.id, a.json.schluessel)).status, 204);
  assert.equal(s.d.lager.blobs.size, vorher - 2, "Manifest von a + sein hauptgang");
  assert.equal((await s.get(b.json.id)).status, 200);
  assert.equal(s.d.lager.loseBytes, 0);
});

test("Neustart: tmp wird geleert, Links und Speichersumme werden aus dem Volume gelesen", async (t) => {
  const daten = fs.mkdtempSync(path.join(os.tmpdir(), "durchreiche-test-"));
  t.after(() => fs.rmSync(daten, { recursive: true, force: true }));
  const uhr = { t: T0 };
  let id, speicher, refBytes;
  {
    const s = await dienst(t, {}, { daten, uhr });
    const a = await s.teile(PROJEKT);
    await s.put(Buffer.from("lose"));
    id = a.json.id;
    speicher = s.d.lager.speicher;
    refBytes = s.d.lager.refBytes;
    await s.d.schliesse();
  }
  fs.writeFileSync(path.join(daten, "tmp", "abgebrochen"), "halb");
  const s2 = await dienst(t, {}, { daten, uhr });
  assert.deepEqual(fs.readdirSync(path.join(daten, "tmp")), []);
  assert.equal(s2.d.lager.speicher, speicher);
  assert.equal(s2.d.lager.refBytes, refBytes);
  assert.equal(s2.d.lager.loseBytes, 4);
  const g = await s2.get(id);
  assert.equal(g.status, 200);
  assert.equal(g.json.version, 1);
});

test("Speicherdeckel → 507; Anteil loser Blobs → 507; lose Bytes je IP → 429; neue Bytes in Links je IP → 429", async (t) => {
  const deckel = await dienst(t, { speicherMaxBytes: 10_000, loseAnteilProzent: 100 });
  assert.equal((await deckel.put(Buffer.alloc(6000, 1))).status, 201);
  const voll = await deckel.put(Buffer.alloc(6000, 2));
  assert.equal(voll.status, 507);
  assert.match(voll.json.fehler, /Teilen-Speicher ist gerade voll/);
  assert.equal((await deckel.anfrage("GET", "/api/blob/" + sha256(Buffer.alloc(6000, 1)))).status, 200, "Lesen geht weiter");

  const anteil = await dienst(t, { speicherMaxBytes: 100_000, loseAnteilProzent: 10 });
  assert.equal((await anteil.put(Buffer.alloc(8000, 1))).status, 201);
  assert.equal((await anteil.put(Buffer.alloc(3000, 2))).status, 507);

  const ip = await dienst(t, { loseJeIpBytes: 5000 });
  const A = { "X-Real-IP": "10.0.0.1" }, B = { "X-Real-IP": "10.0.0.2" };
  assert.equal((await ip.put(Buffer.alloc(4000, 1), undefined, A)).status, 201);
  assert.equal((await ip.put(Buffer.alloc(2000, 2), undefined, A)).status, 429);
  assert.equal((await ip.put(Buffer.alloc(2000, 2), undefined, B)).status, 201, "andere IP");
  ip.uhr.t += STUNDE + 1;
  assert.equal((await ip.put(Buffer.alloc(2000, 3), undefined, A)).status, 201, "nach einer Stunde wieder frei");

  const neu = await dienst(t, { neueBytesJeIp: 1500 });
  const r = await neu.teile(PROJEKT, { kopf: A });
  assert.equal(r.status, 201, "erstes Projekt (~400 B) passt");
  const r2 = await neu.teile({ ...PROJEKT, "daten/gross.txt": "x".repeat(700) }, { kopf: A });
  assert.equal(r2.status, 429);
  assert.equal((await neu.post(r2.manifest, null, null, B)).status, 201, "andere IP darf");
});

test("Rate-Limit im Dienst: gleitendes Fenster je X-Real-IP und Klasse", async (t) => {
  const s = await dienst(t, { rateLesen: 3 });
  const A = { "X-Real-IP": "10.0.0.1" }, B = { "X-Real-IP": "10.0.0.2" };
  for (let i = 0; i < 3; i++) assert.equal((await s.get("AAAAAAAAAAAA", A)).status, 404);
  const zuviel = await s.get("AAAAAAAAAAAA", A);
  assert.equal(zuviel.status, 429);
  assert.equal(zuviel.kopf.get("retry-after"), "60");
  assert.equal((await s.get("AAAAAAAAAAAA", B)).status, 404, "andere IP");
  assert.equal((await s.fehlend([], A)).status, 200, "andere Klasse");
  s.uhr.t += 61_000;
  assert.equal((await s.get("AAAAAAAAAAAA", A)).status, 404, "Fenster abgelaufen");
});

test("Gleichzeitiges Teilen und Aufräumen: Sperre hält Links konsistent", async (t) => {
  const s = await dienst(t, OHNE_RATEN);
  const projekte = Array.from({ length: 12 }, (_, i) => ({ ...PROJEKT, "hauptgang.pizza": "Bote.sage((" + i + "));\n" }));
  // Blobs hochladen, dann 2 h warten: alle sind lose und alt – Posten und Müllabfuhr laufen gleichzeitig
  for (const p of projekte) for (const v of Object.values(p)) await s.put(Buffer.isBuffer(v) ? v : Buffer.from(v));
  s.uhr.t += 2 * STUNDE;
  const auftraege = projekte.map((p, i) => (i % 3 === 0 ? s.d.aufraeumen() : null)).filter(Boolean);
  const ergebnisse = await Promise.all([...projekte.map((p) => s.post(s.manifest(p))), ...auftraege]);
  const links = ergebnisse.slice(0, 12);
  assert.ok(links.every((r) => r.status === 201 || r.status === 409), links.map((r) => r.status).join(","));
  const ok = links.filter((r) => r.status === 201);
  assert.equal(new Set(ok.map((r) => r.json.id)).size, ok.length);
  for (const r of ok) {
    const g = await s.get(r.json.id);
    for (const d of g.json.projekt.dateien) assert.ok(s.d.lager.blobs.has(d.sha256), "ein Link zeigt nie auf einen gelöschten Blob");
  }
  await s.d.aufraeumen();
  for (const r of ok) for (const d of (await s.get(r.json.id)).json.projekt.dateien) assert.ok(s.d.lager.blobs.has(d.sha256));
});

test("Start als Programm: node durchreiche/server.mjs liest PORT/TEILEN_DATEN/TEILEN_ABLAUF_TAGE", async (t) => {
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const daten = fs.mkdtempSync(path.join(os.tmpdir(), "durchreiche-test-"));
  const skript = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server.mjs");
  const kind = spawn(process.execPath, [skript], {
    env: { ...process.env, PORT: "0", TEILEN_DATEN: daten, TEILEN_ABLAUF_TAGE: "7" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (kind.exitCode === null) { kind.kill(); await new Promise((r) => kind.once("exit", r)); }
    fs.rmSync(daten, { recursive: true, force: true });
  });
  const port = await new Promise((ok, nein) => {
    let aus = "";
    kind.stdout.on("data", (b) => { aus += b; const m = /Port (\d+)/.exec(aus); if (m) ok(Number(m[1])); });
    kind.on("exit", (c) => nein(new Error("beendet: " + c + " " + aus)));
    setTimeout(() => nein(new Error("kein Start: " + aus)), 10_000).unref();
  });
  const k = await (await fetch("http://127.0.0.1:" + port + "/api/konfig")).json();
  assert.equal(k.aufbewahrungTage, 7);
  assert.ok(fs.existsSync(path.join(daten, "blobs")));
});
