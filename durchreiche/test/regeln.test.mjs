// Unit-Tests der reinen Regeln (Pfade, Grenzen, IDs, Schlüssel, Manifest, Datum).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  ablaufTag, abgelaufen, konfigAntwort, leseKonfig, neueId, neuerSchluessel, pruefeInhalt, pruefeManifest, pruefePfad, sha256,
  schluesselHash, schluesselPasst,
} from "../regeln.mjs";

const hier = path.dirname(fileURLToPath(import.meta.url));
const FAELLE = JSON.parse(fs.readFileSync(path.join(hier, "pfade.json"), "utf8"));
const lang = (x) => x.anfang.repeat(x.wiederholt) + x.ende;
const GUT = [...FAELLE.gut, lang(FAELLE.gut_lang)];
const SCHLECHT = [...FAELLE.schlecht, lang(FAELLE.schlecht_lang)];
const K = leseKonfig({});

test("Pfadregel: gemeinsame Fallliste (SPEC §2.1)", () => {
  for (const p of GUT) assert.equal(pruefePfad(p), null, "gültig: " + JSON.stringify(p));
  for (const p of SCHLECHT) assert.equal(typeof pruefePfad(p), "string", "ungültig: " + JSON.stringify(p));
  for (const p of [null, undefined, 5, {}]) assert.equal(typeof pruefePfad(p), "string");
});

test("Pfadregel: gleich wie PizzaLang.projekt.pruefePfad (PA1)", () => {
  const P = createRequire(import.meta.url)(path.join(hier, "..", "..", "site", "js", "pizza.js"));
  assert.equal(typeof (P.projekt && P.projekt.pruefePfad), "function", "PizzaLang.projekt.pruefePfad fehlt");
  for (const p of [...GUT, ...SCHLECHT]) assert.equal(pruefePfad(p) === null, P.projekt.pruefePfad(p) === null, JSON.stringify(p));
});

test("Konfiguration: Standards und Umgebungsvariablen", () => {
  assert.equal(K.ablaufTage, 90);
  assert.equal(K.maxDateien, 100);
  assert.equal(K.maxDateiBytes, 2 * 1024 * 1024);
  assert.equal(K.maxProjektBytes, 8 * 1024 * 1024);
  assert.equal(K.maxPizzaBytes, 512 * 1024);
  assert.equal(K.maxManifestBytes, 64 * 1024);
  assert.equal(K.maxVersionen, 200);
  assert.equal(K.speicherMaxBytes, 2048 * 1024 * 1024);
  assert.equal(K.port, 8291);
  const k2 = leseKonfig({ TEILEN_ABLAUF_TAGE: "0", TEILEN_MAX_DATEIEN: "7", TEILEN_SPEICHER_MAX_MB: "abc", PORT: "9000" });
  assert.equal(k2.ablaufTage, 0);
  assert.equal(k2.maxDateien, 7);
  assert.equal(k2.speicherMaxBytes, 2048 * 1024 * 1024, "ungültig → Standard");
  assert.equal(k2.port, 9000);
  assert.equal(leseKonfig({ TEILEN_MAX_DATEIEN: "0" }).maxDateien, 100, "unter dem Minimum → Standard");
  assert.equal(leseKonfig({ TEILEN_ABLAUF_TAGE: "-3" }).ablaufTage, 90);
});

test("/api/konfig: Form laut PROJEKTE §4.3", () => {
  assert.deepEqual(konfigAntwort(K), {
    teilen: true, aufbewahrungTage: 90, aufbewahrungAb: "letzte-version",
    grenzen: { dateien: 100, dateiBytes: 2097152, projektBytes: 8388608, pizzaBytes: 524288, manifestBytes: 65536 },
  });
  assert.equal(konfigAntwort({ ...K, ablaufTage: 0 }).aufbewahrungTage, null);
});

test("Link-ID: 12 Zeichen Base62, Verwerfungsverfahren ohne bevorzugte Zeichen", () => {
  const ids = new Set();
  for (let i = 0; i < 2000; i++) {
    const id = neueId();
    assert.match(id, /^[0-9A-Za-z]{12}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 2000);
  // Bytes ≥ 248 werden verworfen: ein Zufall, der nur 248…255 und dann 0…61 liefert, ergibt genau die Zeichen 0…61
  let aufruf = 0;
  const zufall = (n) => { const b = Buffer.from(Array.from({ length: n }, (_, i) => (aufruf === 0 ? 248 + (i % 8) : i))); aufruf++; return b; };
  assert.equal(neueId(zufall), "0123456789AB");
  assert.equal(neueId(() => Buffer.from(Array(16).fill(247))), "z".repeat(12), "247 % 62 = 61 → z");
  // Gleichverteilung grob: jedes der 62 Zeichen kommt vor, keines mehr als doppelt so oft wie erwartet
  const zaehler = new Map();
  for (let i = 0; i < 3000; i++) for (const c of neueId()) zaehler.set(c, (zaehler.get(c) || 0) + 1);
  assert.equal(zaehler.size, 62);
  const erwartet = (3000 * 12) / 62;
  for (const [c, n] of zaehler) assert.ok(n < 2 * erwartet && n > erwartet / 2, c + ": " + n);
});

test("Schlüssel: 43 Zeichen Base64url, nur der Hash wird verglichen (Format vor dem Hashen)", () => {
  const s = neuerSchluessel();
  assert.match(s, /^[A-Za-z0-9_-]{43}$/);
  const h = schluesselHash(s);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(schluesselPasst("Bearer " + s, h), true);
  assert.equal(schluesselPasst("Bearer " + neuerSchluessel(), h), false, "falscher Schlüssel");
  assert.equal(schluesselPasst(undefined, h), false, "fehlt");
  assert.equal(schluesselPasst(s, h), false, "ohne Bearer");
  assert.equal(schluesselPasst("Bearer " + s + "x", h), false, "zu lang");
  assert.equal(schluesselPasst("bearer " + s, h), false);
  assert.equal(schluesselPasst("Bearer " + s.slice(0, 42) + "+", h), false, "Zeichen außerhalb Base64url");
  assert.equal(schluesselPasst("Bearer " + s, "kaputt"), false);
});

const TEXT = (s) => Buffer.from(s, "utf8");
const datei = (pfad, inhalt) => ({ pfad, sha256: sha256(inhalt), groesse: inhalt.length });
function manifest(extra = {}, dateien) {
  return {
    format: "pizza-projekt/1", name: "Teigball", hauptdatei: "hauptgang.pizza",
    dateien: dateien || [datei("pizza.json", TEXT('{"pizza":1}')), datei("hauptgang.pizza", TEXT("Bote.sage((1));\n"))],
    ...extra,
  };
}

test("Manifest: gültig → kanonisch (Schlüsselreihenfolge, sortierte Dateien, ohne Leerraum)", () => {
  const m = manifest({ args: ["a"], beschreibung: "Rolle." });
  const umgedreht = { dateien: [...m.dateien].reverse(), args: m.args, beschreibung: m.beschreibung, hauptdatei: m.hauptdatei, name: m.name, format: m.format };
  const a = pruefeManifest(m, K), b = pruefeManifest(umgedreht, K);
  assert.equal(a.fehler, undefined);
  assert.equal(a.hash, b.hash, "gleicher Inhalt, andere Reihenfolge → gleicher Hash");
  const text = a.bytes.toString("utf8");
  assert.ok(text.startsWith('{"format":"pizza-projekt/1","name":"Teigball","hauptdatei":"hauptgang.pizza","beschreibung":"Rolle.","args":["a"],"dateien":[{"pfad":"hauptgang.pizza"'), text);
  assert.ok(!/\s(?=["{[])/.test(text));
  assert.equal(a.hash, sha256(a.bytes));
  const ohne = pruefeManifest(manifest(), K);
  assert.ok(!ohne.bytes.toString().includes("beschreibung") && !ohne.bytes.toString().includes("args"), "optionale Felder weggelassen");
});

test("Manifest: Prüfliste → Fehler", () => {
  const p = TEXT('{"pizza":1}');
  const h = TEXT("x");
  const faelle = [
    [null, "Objekt"],
    [manifest({ format: "pizza-projekt/2" }), "format"],
    [manifest({ extra: 1 }), "Unbekanntes Feld"],
    [manifest({ name: 5 }), "name"],
    [manifest({ name: "" }), "leer"],
    [manifest({ name: "x".repeat(81) }), "80"],
    [manifest({ name: "a\u0007b" }), "Steuerzeichen"],
    [manifest({ name: "a\ud800" }), "ungültige Zeichen"],
    [manifest({ beschreibung: "x".repeat(501) }), "500"],
    [manifest({ args: "a" }), "args"],
    [manifest({ args: Array(33).fill("a") }), "32"],
    [manifest({ args: ["x".repeat(201)] }), "200"],
    [manifest({ hauptdatei: "fehlt.pizza" }), "hauptdatei"],
    [manifest({ hauptdatei: "pizza.json" }), "hauptdatei"],
    [manifest({}, [datei("hauptgang.pizza", h)]), "pizza.json fehlt"],
    [manifest({}, []), "keine Dateien"],
    [manifest({}, [datei("pizza.json", p), datei("hauptgang.pizza", h), datei("hauptgang.pizza", h)]), "doppelt"],
    [manifest({}, [datei("pizza.json", p), datei("hauptgang.pizza", h), datei("../x.pizza", h)]), "Dateipfad"],
    [manifest({}, [datei("pizza.json", p), datei("hauptgang.pizza", h), datei("Gross.pizza", h)]), "Dateipfad"],
    [manifest({}, [datei("pizza.json", p), datei("hauptgang.pizza", h), datei("pruefung/erwartet.txt", h)]), "pruefung"],
    [manifest({}, [datei("pizza.json", p), datei("hauptgang.pizza", h), datei("bild.svg", h)]), "Dateiart"],
    [manifest({}, [datei("pizza.json", p), datei("hauptgang.pizza", h), datei("ohne-endung", h)]), "Dateiart"],
    [manifest({}, [datei("pizza.json", p), { pfad: "hauptgang.pizza", sha256: "ABC", groesse: 1 }]), "sha256"],
    [manifest({}, [datei("pizza.json", p), { pfad: "hauptgang.pizza", sha256: sha256(h), groesse: -1 }]), "groesse"],
    [manifest({}, [datei("pizza.json", p), { pfad: "hauptgang.pizza", sha256: sha256(h), groesse: 1.5 }]), "groesse"],
    [manifest({}, [datei("pizza.json", p), { pfad: "hauptgang.pizza", sha256: sha256(h), groesse: 1, mehr: 1 }]), "Unbekanntes Feld"],
    [manifest({}, [datei("pizza.json", p), { pfad: "hauptgang.pizza", sha256: sha256(h), groesse: K.maxDateiBytes + 1 }]), "größer"],
  ];
  for (const [m, teil] of faelle) {
    const r = pruefeManifest(m, K);
    assert.ok(typeof r.fehler === "string" && r.fehler.includes(teil), JSON.stringify(m)?.slice(0, 120) + " → " + JSON.stringify(r.fehler) + " (erwartet „" + teil + "“)");
  }
  // Grenzen: Dateienzahl und Projektsumme
  const viele = [datei("pizza.json", p), datei("hauptgang.pizza", h)];
  for (let i = 0; i < 99; i++) viele.push(datei("d/" + i + ".txt", TEXT(String(i))));
  assert.match(pruefeManifest(manifest({}, viele), K).fehler, /101 Dateien, höchstens 100/);
  assert.equal(pruefeManifest(manifest({}, viele.slice(0, 100)), K).fehler, undefined);
  const gross = [datei("pizza.json", p), datei("hauptgang.pizza", h)];
  for (let i = 0; i < 5; i++) gross.push({ pfad: "b/" + i + ".png", sha256: sha256(String(i)), groesse: 2 * 1024 * 1024 });
  assert.match(pruefeManifest(manifest({}, gross), K).fehler, /zusammen größer als 8 MB/);
});

test("Inhaltsregeln je Endung (PNG-/JPEG-Signatur, UTF-8, keine \\r\\n, .pizza ≤ 512 KiB)", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  assert.equal(pruefeInhalt("a.png", png, K), null);
  assert.match(pruefeInhalt("a.png", TEXT("GIF89a"), K), /kein PNG/);
  assert.equal(pruefeInhalt("a.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), K), null);
  assert.equal(pruefeInhalt("a.jpeg", Buffer.from([0xff, 0xd8, 0xff]), K), null);
  assert.match(pruefeInhalt("a.jpg", png, K), /kein JPEG/);
  assert.equal(pruefeInhalt("a.txt", TEXT("﻿BOM bleibt\rallein ok\n"), K), null);
  assert.match(pruefeInhalt("a.txt", Buffer.from([0x61, 0xff]), K), /UTF-8/);
  assert.match(pruefeInhalt("a.md", Buffer.from([0xed, 0xa0, 0x80]), K), /UTF-8/, "Surrogat in UTF-8 ist ungültig");
  assert.match(pruefeInhalt("a.csv", TEXT("a\r\nb"), K), /Zeilenenden/);
  assert.equal(pruefeInhalt("a.pizza", Buffer.alloc(512 * 1024, 0x61), K), null);
  assert.match(pruefeInhalt("a.pizza", Buffer.alloc(512 * 1024 + 1, 0x61), K), /512 KB/);
  assert.equal(pruefeInhalt("a.txt", Buffer.alloc(600 * 1024, 0x61), K), null, "Grenze gilt nur für .pizza");
  // Modelle (H-K16)
  assert.equal(pruefeInhalt("m/a.glb", Buffer.from("glTF\x02\0\0\0", "latin1"), K), null);
  assert.match(pruefeInhalt("m/a.glb", png, K), /kein glTF-Modell/);
  assert.equal(pruefeInhalt("m/a.gltf", TEXT("\uFEFF \r\n{\"asset\":{}}"), K), null, ".gltf darf \\r\\n enthalten (Binärdatei)");
  assert.match(pruefeInhalt("m/a.gltf", TEXT("[1]"), K), /kein glTF-Modell/);
  assert.equal(pruefeInhalt("m/a.bin", Buffer.from([0, 1, 2]), K), null);
  // Klänge (H-K19a)
  assert.equal(pruefeInhalt("k/a.wav", Buffer.from("RIFF\x24\0\0\0WAVEfmt ", "latin1"), K), null);
  assert.match(pruefeInhalt("k/a.wav", Buffer.from("RIFF\x24\0\0\0AVI ", "latin1"), K), /kein WAV-Klang/);
  assert.equal(pruefeInhalt("k/a.flac", Buffer.from("fLaC\0\0\0\x22", "latin1"), K), null);
  assert.match(pruefeInhalt("k/a.flac", png, K), /kein FLAC-Klang/);
  assert.match(pruefeInhalt("k/a.mp3", Buffer.from("ID3"), K), /nicht erlaubte Dateiart/);
});

test("Ablauf: 90 Tage ab letzter Version, einschließlich des Ablauftags; 0 = unbegrenzt", () => {
  assert.equal(ablaufTag("2026-10-23", 90), "2027-01-21");
  assert.equal(ablaufTag("2026-10-23", 0), null);
  assert.equal(abgelaufen("2026-10-23", 90, "2027-01-21"), false);
  assert.equal(abgelaufen("2026-10-23", 90, "2027-01-22"), true);
  assert.equal(abgelaufen("2026-10-23", 0, "2999-01-01"), false);
  assert.equal(ablaufTag("2028-02-28", 1), "2028-02-29", "Schaltjahr");
});
