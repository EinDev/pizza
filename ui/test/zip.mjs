// ZIP ohne Bibliothek (PROJEKTE.md §3.4, K-142): Export „stored“ ↔ Import, Deflate über DecompressionStream, Datendeskriptor
// (Bit 3), Wurzelordner, __MACOSX/Punkt-Dateien, Großbuchstaben, ungültige Pfade, CRC, Grenzen (ZIP-Bombe), ZIP64/verschlüsselt.
import assert from "node:assert/strict";
import { schreibeZip, leseZip, crc32, istZip, NICHT_LESBAR } from "../src/zip.js";
import { GRENZEN } from "../src/projekt.js";

const utf8 = new TextEncoder();
assert.equal(crc32(utf8.encode("123456789")), 0xcbf43926);

// ---------- Rundweg (stored) ----------
const bild = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const dateien = { "hauptgang.pizza": 'bestellt "welt/tisch.pizza";\nBote.sage(("ä"));\n', "welt/tisch.pizza": "", "bilder/a.png": bild, "pizza.json": '{"pizza":1}' };
const zip = schreibeZip(dateien, { ordner: "teigball", datum: new Date(2026, 9, 23, 12, 0, 0) });
assert.ok(istZip(zip));
assert.deepEqual(schreibeZip(dateien, { ordner: "teigball", datum: new Date(2026, 9, 23, 12, 0, 0) }), zip, "byte-gleich");
const r = await leseZip(zip);
assert.equal(r.ok, true, r.fehler);
assert.equal(r.wurzel, "teigball");
assert.deepEqual(Object.keys(r.dateien).sort(), Object.keys(dateien).sort());
assert.equal(r.dateien["hauptgang.pizza"], dateien["hauptgang.pizza"]);
assert.deepEqual(r.dateien["bilder/a.png"], bild);
assert.deepEqual(r.meldungen, []);
// UTF-8-Flag gesetzt (Bit 11) im lokalen Kopf
assert.equal(new DataView(zip.buffer).getUint16(6, true), 0x0800);

// ---------- eigener Bauer für Testarchive (Deflate, Datendeskriptor, Flags) ----------
async function deflate(bytes) {
  const cs = new CompressionStream("deflate-raw");
  const w = cs.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function baue(eintraege) {
  // eintraege: [{ name, daten, methode?: 0|8, deskriptor?: bool, flags?, crc?, groesseLuege? }]
  const teile = [], zentral = [];
  let o = 0;
  for (const e of eintraege) {
    const name = utf8.encode(e.name);
    const roh = typeof e.daten === "string" ? utf8.encode(e.daten) : e.daten;
    const gepackt = e.methode === 8 ? await deflate(roh) : roh;
    const crc = e.crc ?? crc32(roh);
    const flags = (e.flags ?? 0x0800) | (e.deskriptor ? 0x0008 : 0);
    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true); kopf.setUint16(4, 20, true); kopf.setUint16(6, flags, true); kopf.setUint16(8, e.methode || 0, true);
    if (!e.deskriptor) { kopf.setUint32(14, crc, true); kopf.setUint32(18, gepackt.length, true); kopf.setUint32(22, roh.length, true); }
    kopf.setUint16(26, name.length, true);
    const offset = o;
    teile.push(new Uint8Array(kopf.buffer), name, gepackt);
    o += 30 + name.length + gepackt.length;
    if (e.deskriptor) {
      const d = new DataView(new ArrayBuffer(16));
      d.setUint32(0, 0x08074b50, true); d.setUint32(4, crc, true); d.setUint32(8, gepackt.length, true); d.setUint32(12, roh.length, true);
      teile.push(new Uint8Array(d.buffer)); o += 16;
    }
    const z = new DataView(new ArrayBuffer(46));
    z.setUint32(0, 0x02014b50, true); z.setUint16(4, 20, true); z.setUint16(6, 20, true); z.setUint16(8, flags, true); z.setUint16(10, e.methode || 0, true);
    z.setUint32(16, crc, true); z.setUint32(20, gepackt.length, true); z.setUint32(24, e.groesseLuege ?? roh.length, true); z.setUint16(28, name.length, true);
    z.setUint32(42, offset, true);
    zentral.push(new Uint8Array(z.buffer), name);
  }
  const cdStart = o;
  let cdLaenge = 0;
  for (const t of zentral) cdLaenge += t.length;
  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true); ende.setUint16(8, eintraege.length, true); ende.setUint16(10, eintraege.length, true);
  ende.setUint32(12, cdLaenge, true); ende.setUint32(16, cdStart, true);
  const alle = [...teile, ...zentral, new Uint8Array(ende.buffer)];
  const aus = new Uint8Array(alle.reduce((a, t) => a + t.length, 0));
  let p = 0; for (const t of alle) { aus.set(t, p); p += t.length; }
  return aus;
}

// Windows/macOS-Archiv: Deflate + Datendeskriptor, __MACOSX, .DS_Store, Ordnereinträge, Großbuchstaben, ungültige Namen
{
  const text = "Bote.sage((\"Hallo\"));\n".repeat(200);
  const z = await baue([
    { name: "Mein Spiel/", daten: "" },
    { name: "Mein Spiel/hauptgang.pizza", daten: text, methode: 8, deskriptor: true },
    { name: "Mein Spiel/Bilder/Teig.PNG", daten: bild, methode: 8 },
    { name: "Mein Spiel/daten/level 1.txt", daten: "x" },
    { name: "Mein Spiel/notiz.exe", daten: "MZ" },
    { name: "Mein Spiel/.DS_Store", daten: "x" },
    { name: "__MACOSX/Mein Spiel/._hauptgang.pizza", daten: "x" },
    { name: "Mein Spiel/windows.txt", daten: "a\r\nb" },
    { name: "Mein Spiel/kaputt.txt", daten: new Uint8Array([0xc3, 0x28]) },
  ]);
  const r2 = await leseZip(z);
  assert.equal(r2.ok, true, r2.fehler);
  assert.equal(r2.wurzel, "Mein Spiel");
  assert.deepEqual(Object.keys(r2.dateien).sort(), ["bilder/teig.png", "hauptgang.pizza", "windows.txt"]);
  assert.equal(r2.dateien["hauptgang.pizza"], text);
  assert.deepEqual(r2.dateien["bilder/teig.png"], bild);
  assert.equal(r2.dateien["windows.txt"], "a\nb", "CRLF → LF");
  assert.deepEqual(r2.meldungen, [
    "„Bilder/Teig.PNG“ umbenannt in „bilder/teig.png“.",
    "„daten/level 1.txt“ übersprungen: ungültiger Dateipfad (nur a–z, 0–9, -, _, . und /).",
    "„notiz.exe“ übersprungen: diese Dateiart kennt der Ofen nicht.",
    "kaputt.txt ist kein gültiger UTF-8-Text. Übersprungen.",
  ]);
}
// Großbuchstaben nur, wenn eindeutig
{
  const r3 = await leseZip(await baue([{ name: "a.pizza", daten: "1" }, { name: "A.pizza", daten: "2" }]));
  assert.deepEqual(Object.keys(r3.dateien), ["a.pizza"]);
  assert.match(r3.meldungen[0], /„A\.pizza“ übersprungen/);
}
// Zip-Slip: ../ und absolute Pfade kommen nie ins Projekt
{
  const r4 = await leseZip(await baue([{ name: "../boese.pizza", daten: "x" }, { name: "/etc/passwd.txt", daten: "x" }, { name: "ok.pizza", daten: "" }]));
  assert.deepEqual(Object.keys(r4.dateien), ["ok.pizza"]);
  assert.equal(r4.meldungen.length, 1, "../ still übersprungen (Segment ab Punkt), /etc gemeldet");
  assert.match(r4.meldungen[0], /passwd/);
}
// CRC falsch → nicht lesbar; verschlüsselt, andere Methode, ZIP64, Müll → nicht lesbar
assert.deepEqual(await leseZip(await baue([{ name: "a.pizza", daten: "x", crc: 1 }])), { ok: false, fehler: NICHT_LESBAR });
assert.equal((await leseZip(await baue([{ name: "a.pizza", daten: "x", flags: 0x0801 }]))).fehler, NICHT_LESBAR);
{
  const m = await baue([{ name: "a.pizza", daten: "x" }]);
  const dv = new DataView(m.buffer);
  const cd = dv.getUint32(m.length - 22 + 16, true);
  dv.setUint16(cd + 10, 12, true); // bzip2
  assert.equal((await leseZip(m)).fehler, NICHT_LESBAR);
  const z64 = await baue([{ name: "a.pizza", daten: "x" }]);
  new DataView(z64.buffer).setUint32(z64.length - 22 + 16, 0xffffffff, true);
  assert.equal((await leseZip(z64)).fehler, NICHT_LESBAR);
}
assert.equal((await leseZip(new Uint8Array([1, 2, 3]))).fehler, NICHT_LESBAR);
assert.equal((await leseZip(utf8.encode("kein zip".repeat(10)))).fehler, NICHT_LESBAR);

// Grenzen: Dateizahl, Einzelgröße (auch wenn das Verzeichnis lügt → Abbruch beim Entpacken), Gesamtgröße
{
  const viele = [];
  for (let i = 0; i < GRENZEN.dateien + 1; i++) viele.push({ name: "d" + i + ".txt", daten: "" });
  assert.match((await leseZip(await baue(viele))).fehler, /101 Dateien, höchstens 100/);
  const bombe = new Uint8Array(3 * 1024 * 1024); // Nullen: winzig gepackt
  const z = await baue([{ name: "bombe.png", daten: bombe, methode: 8, groesseLuege: 10 }]);
  assert.ok(z.length < 20_000, "Testannahme: gepackt klein");
  assert.match((await leseZip(z)).fehler, /zu groß für den Ofen/, "Abbruch beim Entpacken trotz falscher Größenangabe");
  const klein = { dateien: 100, datei: 1000, pizza: 1000, gesamt: 1500 };
  assert.match((await leseZip(await baue([{ name: "a.txt", daten: "x".repeat(800) }, { name: "b.txt", daten: "x".repeat(800) }]), { grenzen: klein })).fehler, /zusammen/);
  assert.match((await leseZip(await baue([{ name: "a.txt", daten: "x".repeat(1200) }]), { grenzen: klein })).fehler, /a\.txt hat mehr als/);
}
console.log("zip ok");
