// Teilen mit Versionen (PROJEKTE.md §4.4, §4.9, K-143, PB2) gegen die echte Durchreiche (e2e/server.mjs):
// Link erstellen → neue Version (Link bleibt) → #h=/#app= zeigen die neueste, @n eine feste → Bearbeitungsschlüssel auf ein
// anderes Gerät übertragen (F10) → eigenes Projekt bekommt den Hinweis „neuere Version“ → neuer Link → Link löschen (404);
// Mehrdatei-Projekt mit PNG (Dedup: das Bild wird nie erneut hochgeladen), 100 Dateien zweimal öffnen ohne 429, alte
// Hastebin-Links verfallen mit klarer Meldung (F6).
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { e2e, seite, setzeCode, editorText, editorTabs, bereit, aktiverTabName, schlafe, baumDateien, aktivesProjekt } from "../hilfen.mjs";

/** Zwischenablage abfangen (headless ohne Berechtigung): alles, was geschrieben wird, landet in window.__kopiert. */
const ZWISCHENABLAGE = () => {
  window.__kopiert = [];
  try {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__kopiert.push(String(t)); } } });
  } catch (e) { /* egal */ }
};

/** Gültiges 2×2-RGBA-PNG (zlib aus Node, keine Binärdateien im Repo). */
const PNG = (() => {
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; };
  const block = (typ, daten) => {
    const t = Buffer.from(typ, "ascii");
    const l = Buffer.alloc(4); l.writeUInt32BE(daten.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, daten])));
    return Buffer.concat([l, t, daten, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 6;
  const roh = Buffer.from([0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255]);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), block("IHDR", ihdr), block("IDAT", zlib.deflateSync(roh)), block("IEND", Buffer.alloc(0))]));
})();

const V1 = 'Bote.sage(("Version eins"));';
const V2 = 'Bote.sage(("Version zwei"));';
const V3 = 'Bote.sage(("Version drei vom Laptop"));';

const sichtbarerSchritt = (page) => page.$$eval("#dialog-teilen [data-schritt]", (s) => (s.find((x) => !x.hidden) || {}).dataset?.schritt || null);
async function teilenOeffnen(page) {
  await page.click("#knopf-teilen");
  await page.waitForSelector("#dialog-teilen[open]");
  await page.waitForFunction(() => !document.getElementById("teilen-senden").disabled);
}
/** Dialog öffnen, optional „Neuer Link“ wählen, senden, auf „fertig“ warten → { code, app, codeFest, appFest, version, id }. */
async function teilen(page, { neuerLink = false } = {}) {
  await teilenOeffnen(page);
  if (neuerLink) await page.click('[data-testid="teilen-wahl-neu"]');
  await page.click("#teilen-senden");
  await page.waitForFunction(() => { const s = document.querySelector('#dialog-teilen [data-schritt="fertig"]'); return s && !s.hidden; }, { timeout: 15_000 });
  const r = await page.evaluate(() => ({
    code: document.getElementById("teilen-url").value, app: document.getElementById("teilen-url-app").value,
    codeFest: document.getElementById("teilen-url-fest").value, appFest: document.getElementById("teilen-url-app-fest").value,
    version: document.getElementById("teilen-version").textContent, text: document.getElementById("teilen-fertig-text").textContent,
  }));
  r.id = /#h=([0-9A-Za-z]{12})$/.exec(r.code)[1];
  return r;
}
async function schliesseDialog(page) {
  await page.click("#teilen-schliessen");
  await page.waitForFunction(() => !document.getElementById("dialog-teilen").open);
}
const warteEnde = (page, timeout = 20_000) => page.waitForSelector("#app-ende:not([hidden])", { timeout });
const konsolenText = (page) => page.$eval("#konsole-inhalt", (k) => k.innerText);
const warteEditor = (page, muster, timeout = 8000) => page.waitForFunction((m) => new RegExp(m).test(document.querySelector("#editor .cm-content").textContent), { timeout }, muster.source);
const toastText = (page) => page.$eval("#toast", (t) => (t.hidden ? "" : t.textContent));
const puts = (server) => server.anfragen.filter((a) => a.methode === "PUT" && /^\/api\/blob\//.test(a.pfad));

e2e("Teilen mit Versionen: neue Version unter demselben Link, @n fest, App-Link startet die neueste, Schlüssel übertragen, neuer Link, löschen", {
  vorLaden: ZWISCHENABLAGE, timeout: 120_000, erlaubt: [/api\/teilen/, /status of 404/],
}, async ({ page, oeffne, server, basis }) => {
  await oeffne();
  await setzeCode(page, V1);
  const v1 = await teilen(page);
  assert.equal(v1.version, "v1");
  assert.equal(v1.code, basis + "#h=" + v1.id);
  assert.equal(v1.app, basis + "#app=" + v1.id);
  assert.equal(v1.appFest, basis + "#app=" + v1.id + "@1");
  assert.equal(v1.codeFest, basis + "#h=" + v1.id + "@1");
  // Bearbeitungsschlüssel kopieren (nur einmal vom Server geliefert, liegt im Projekt)
  await page.click('[data-testid="teilen-schluessel-bereich"] summary');
  await page.click("#teilen-schluessel-kopieren");
  await page.waitForFunction(() => /^[A-Za-z0-9_-]{43}$/.test(window.__kopiert.at(-1) || ""));
  const schluessel = await page.evaluate(() => window.__kopiert.at(-1));
  await schliesseDialog(page);

  // Ändern → „Neue Version teilen (Link bleibt gleich)“ ist Standard
  await setzeCode(page, V2);
  await teilenOeffnen(page);
  assert.equal(await page.$eval("#teilen-wahl", (f) => f.hidden), false, "Auswahl Version/Neuer Link");
  assert.equal(await page.$eval('[data-testid="teilen-wahl-version"]', (r) => r.checked), true, "Neue Version ist Standard");
  assert.match(await page.$eval("#teilen-wahl", (f) => f.innerText), /bisher v1/);
  assert.equal(await page.$eval("#teilen-senden", (k) => k.textContent), "Neue Version teilen");
  assert.match(await page.$eval("#dialog-teilen", (d) => d.innerText), /90 Tage nach der letzten Version gültig \(bis \d\d\.\d\d\.\d{4}\) – jede neue Version verlängert ihn/);
  await page.click("#teilen-abbrechen");
  const v2 = await teilen(page);
  assert.equal(v2.id, v1.id, "Link bleibt gleich");
  assert.equal(v2.version, "v2");
  assert.match(v2.text, /Version v2 unter demselben Link/);
  assert.equal((await server.teilen.hole(v1.id)).versionen, 2);
  // Unverändert erneut teilen → keine neue Version
  await schliesseDialog(page);
  const v2b = await teilen(page);
  assert.equal(v2b.version, "v2");
  assert.match(v2b.text, /unverändert/);
  await schliesseDialog(page);

  // Anderes Gerät (frischer Browser-Kontext): #h=<id> zeigt v2, @1 zeigt v1, App-Link startet v2, @1 fest v1
  const b = await seite({ vorLaden: ZWISCHENABLAGE });
  try {
    await b.oeffne("#h=" + v1.id);
    await warteEditor(b.page, /Version zwei/);
    assert.equal(await editorText(b.page), V2);
    await b.page.goto(basis + "#h=" + v1.id + "@1", { waitUntil: "load" });
    await bereit(b.page);
    await warteEditor(b.page, /Version eins/);
    assert.equal(await editorText(b.page), V1, "@1 = feste erste Version (eigene Kopie)");
    const appSeite = await b.neueSeite();
    await appSeite.goto(basis + "#app=" + v1.id, { waitUntil: "load" });
    await warteEnde(appSeite);
    assert.match(await konsolenText(appSeite), /Version zwei/, "App-Link startet die neueste Version");
    await appSeite.goto(basis + "#app=" + v1.id + "%401", { waitUntil: "load" });
    await appSeite.reload({ waitUntil: "load" });
    await warteEnde(appSeite);
    assert.match(await konsolenText(appSeite), /Version eins/, "App-Link @1 (auch URL-kodiert) bleibt fest");
    await appSeite.close();

    // F10: Schlüssel auf Gerät B eingeben → neue Version vom „Laptop“
    await b.page.goto(basis + "#h=" + v1.id, { waitUntil: "load" });
    await bereit(b.page);
    await warteEditor(b.page, /Version zwei/);
    await teilenOeffnen(b.page);
    assert.equal(await b.page.$eval("#teilen-wahl", (f) => f.hidden), true, "ohne Schlüssel keine Versions-Auswahl");
    assert.equal(await b.page.$eval("#teilen-schluessel-frage", (f) => f.hidden), false, "„Schlüssel eingeben“ angeboten");
    await b.page.click("#teilen-schluessel-eingeben");
    await b.page.type("#teilen-schluessel-feld", "zu-kurz");
    await b.page.click("#teilen-schluessel-ok");
    await b.page.waitForSelector("#teilen-schluessel-fehler:not([hidden])");
    await b.page.$eval("#teilen-schluessel-feld", (i) => { i.value = ""; });
    await b.page.type("#teilen-schluessel-feld", schluessel);
    await b.page.click("#teilen-schluessel-ok");
    await b.page.waitForFunction(() => !document.getElementById("teilen-wahl").hidden);
    assert.equal(await sichtbarerSchritt(b.page), "frage");
    await b.page.click("#teilen-abbrechen");
    await setzeCode(b.page, V3);
    const v3 = await teilen(b.page);
    assert.deepEqual([v3.id, v3.version], [v1.id, "v3"], "Gerät B teilt v3 unter demselben Link");
  } finally {
    await b.kontext.close().catch(() => {});
  }

  // Gerät A: Code-Link fokussiert das eigene Projekt (keine Kopie) und bietet die neuere Version an
  const projekteVorher = await page.evaluate(() => document.querySelectorAll("#editor-tabs .etab").length);
  await page.goto(basis + "#h=" + v1.id, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await bereit(page);
  await page.waitForSelector("#teilen-banner:not([hidden])", { timeout: 8000 });
  assert.match(await page.$eval("#teilen-banner-text", (e) => e.textContent), /neuere Version \(v3\)/);
  assert.equal(await editorText(page), V2, "eigenes Projekt, noch v2");
  assert.equal(await page.evaluate(() => document.querySelectorAll("#editor-tabs .etab").length), projekteVorher);
  await page.click("#teilen-banner-laden");
  await warteEditor(page, /Version drei/);
  assert.equal(await editorText(page), V3);
  await teilenOeffnen(page);
  assert.match(await page.$eval("#teilen-wahl", (f) => f.innerText), /bisher v3/, "eigener Stand jetzt v3");
  await page.click("#teilen-abbrechen");

  // „Neuer Link“: andere ID, Version 1; danach löschen → der Link ist weg (404-Meldung im App-Link)
  const neu = await teilen(page, { neuerLink: true });
  assert.notEqual(neu.id, v1.id);
  assert.equal(neu.version, "v1");
  await page.click('[data-testid="teilen-schluessel-bereich"] summary');
  await page.click("#teilen-loeschen");
  await page.waitForSelector("#dialog-frage[open]");
  await page.click("#dialog-ja");
  await page.waitForFunction(() => /Link gelöscht/.test(document.getElementById("toast").textContent));
  assert.equal(await page.$eval("#dialog-teilen", (d) => d.open), false);
  const weg = await (await seite()).page;
  try {
    await weg.goto(basis + "#app=" + neu.id, { waitUntil: "load" });
    await warteEnde(weg);
    assert.match(await weg.$eval("#app-ende-text", (e) => e.textContent), /gibt es nicht \(mehr\)/);
  } finally { await weg.browserContext().close().catch(() => {}); }
  // der erste Link lebt weiter
  assert.equal((await server.teilen.hole(v1.id)).version, 3);
  // Nach dem Löschen: neues Teilen erstellt wieder einen Link (keine Versions-Auswahl)
  await teilenOeffnen(page);
  assert.equal(await page.$eval("#teilen-wahl", (f) => f.hidden), true);
  await page.click("#teilen-abbrechen");
});

e2e("Teilen: falscher Bearbeitungsschlüssel → klare Meldung, Schlüssel wird vergessen", {
  erlaubt: [/api\/teilen/, /status of 403/],
}, async ({ page, oeffne, server }) => {
  const { id } = await server.teilen.lege({ name: "fremd.pizza", code: V1 });
  await oeffne("#h=" + id);
  await warteEditor(page, /Version eins/);
  await teilenOeffnen(page);
  await page.click("#teilen-schluessel-eingeben");
  await page.type("#teilen-schluessel-feld", "B".repeat(43));
  await page.click("#teilen-schluessel-ok");
  await page.waitForFunction(() => !document.getElementById("teilen-wahl").hidden);
  await page.click("#teilen-senden");
  await page.waitForFunction(() => { const s = document.querySelector('#dialog-teilen [data-schritt="fehler"]'); return s && !s.hidden; }, { timeout: 10_000 });
  assert.match(await page.$eval("#teilen-fehlertext", (e) => e.textContent), /Der Schlüssel passt nicht zu diesem Link\./);
  assert.equal((await server.teilen.hole(id)).versionen, 1, "keine neue Version");
  await page.click("#teilen-fehler-schliessen");
  await teilenOeffnen(page);
  assert.equal(await page.$eval("#teilen-wahl", (f) => f.hidden), true, "Schlüssel vergessen");
  assert.equal(await page.$eval("#teilen-schluessel-frage", (f) => f.hidden), false, "neu eingeben möglich");
});

e2e("Teilen: Mehrdatei-Projekt mit PNG – Code-Link und App-Link laden alle Dateien, neue Version lädt nur die geänderte Datei hoch", {
  vorLaden: ZWISCHENABLAGE, timeout: 90_000,
}, async ({ page, oeffne, neueSeite, server, basis }) => {
  const DATEIEN = {
    "pizza.json": JSON.stringify({ pizza: 1, name: "Teigball", hauptdatei: "hauptgang.pizza", beschreibung: "Rolle eine Teigkugel." }, null, 2) + "\n",
    "hauptgang.pizza": 'bestellt "welt/tisch.pizza";\nBote.sage((tisch() + " · " + Kiste.text("daten/gruss.txt") + " · " + Kiste.liste("bilder").verbinde(",")));\n',
    "welt/tisch.pizza": 'margherita tisch() { serviere (("Tisch")); }\n',
    "daten/gruss.txt": "Ciao",
    "bilder/teig.png": PNG,
  };
  const { id } = await server.teilen.lege({ name: "Teigball", dateien: DATEIEN });
  // App-Link: Mehrdatei-Projekt im Vollbild (Interpreter lädt das Projekt)
  const app = await neueSeite();
  await app.goto(basis + "#app=" + id, { waitUntil: "load" });
  await warteEnde(app);
  assert.match(await konsolenText(app), /Tisch · Ciao · bilder\/teig\.png/);
  assert.equal(await app.title(), "Teigball");
  await app.close();

  // Code-Link: Projekt mit allen Dateien (Bild als Bytes, pizza.json bleibt – sie ist nicht erzeugt)
  await oeffne("#h=" + id);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="baum-datei"]').length === 5, { timeout: 8000 });
  assert.equal(await aktivesProjekt(page), "Teigball");
  assert.deepEqual((await baumDateien(page)).sort(), Object.keys(DATEIEN).sort());
  assert.equal(await aktiverTabName(page), "hauptgang.pizza");

  // Als eigenen Link teilen: alle Blobs liegen schon auf dem Server (Dedup über Links) → kein einziger PUT
  const vorher = puts(server).length;
  const eigen = await teilen(page);
  assert.notEqual(eigen.id, id, "eigene Kopie ohne Schlüssel → neuer Link");
  assert.equal(puts(server).length, vorher, "nichts erneut hochgeladen");
  await schliesseDialog(page);
  // Nur die Hauptdatei ändern → neue Version lädt genau einen Blob hoch, das Bild nie
  await setzeCode(page, (await editorText(page)).replace("tisch()", '"neu " + tisch()'));
  const v2 = await teilen(page);
  assert.deepEqual([v2.id, v2.version], [eigen.id, "v2"]);
  assert.equal(puts(server).length - vorher, 1, "nur die geänderte Datei hochgeladen: " + JSON.stringify(puts(server).slice(vorher)));
  const g = await server.teilen.hole(eigen.id);
  assert.deepEqual(g.dateien["bilder/teig.png"], PNG, "Bild unverändert");
  assert.match(g.dateien["hauptgang.pizza"], /"neu " \+ tisch\(\)/);
});

e2e("Teilen: Projekt mit 100 Dateien zweimal hintereinander öffnen – ohne 429", { timeout: 90_000 }, async ({ page, neueSeite, server, basis }) => {
  const dateien = { "hauptgang.pizza": 'Bote.sage(("Hundert: " + Kiste.liste("daten").länge()));' };
  for (let i = 0; i < 98; i++) dateien["daten/d" + String(i).padStart(2, "0") + ".txt"] = "Datei " + i;
  dateien["pizza.json"] = JSON.stringify({ pizza: 1, name: "hundert" }) + "\n";
  const { id } = await server.teilen.lege({ name: "hundert", dateien });
  assert.equal(Object.keys((await server.teilen.hole(id)).dateien).length, 100);
  for (let i = 0; i < 2; i++) {
    const p = i ? await neueSeite() : page;
    await p.goto(basis + "#app=" + id, { waitUntil: "load" });
    await warteEnde(p);
    assert.match(await konsolenText(p), /Hundert: 98/);
  }
  assert.deepEqual(server.anfragen.filter((a) => a.status === 429), [], "keine 429");
});

e2e("Alte Hastebin-Links verfallen mit klarer Meldung (F6) – Code-Link und App-Link", async ({ page, oeffne, neueSeite, basis }) => {
  await oeffne("#h=abcdefghij");
  await page.waitForFunction(() => /alten Teilen-Dienst/.test(document.getElementById("toast").textContent), { timeout: 5000 });
  assert.equal(await toastText(page), "Dieser Link stammt vom alten Teilen-Dienst und ist nicht mehr verfügbar.");
  assert.deepEqual((await editorTabs(page)).map((t) => t.name), ["willkommen.pizza"], "kein neues Projekt");
  const app = await neueSeite();
  await app.goto(basis + "#app=qwertzuiop", { waitUntil: "load" });
  await warteEnde(app);
  assert.equal(await app.$eval("#app-ende-text", (e) => e.textContent), "Dieser Link stammt vom alten Teilen-Dienst und ist nicht mehr verfügbar.");
  assert.equal(await app.$eval("#app-nochmal", (k) => k.hidden), true);
  await schlafe(50);
});

// EXE aus einem (geteilten) Mehrdatei-Projekt (PROJEKTE §3.5, PA2: Pizzaiolo.projekte) – Host-Binary und Download abgefangen
const ZIELE = { version: "0.0.0", format: "pkarton/1", trailer: "PKARTON1", ziele: [{ id: "windows-x64", name: "Windows (x64)", datei: "pizza-host-e2e.exe", endung: ".exe" }] };
function downloadsZaehlen() {
  window.__downloads = [];
  const klick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute("download")) { window.__downloads.push(this.download); return; }
    return klick.call(this);
  };
}
e2e("EXE aus einem geteilten Mehrdatei-Projekt mit Bild: wird gebacken und heißt wie das Projekt", { timeout: 90_000, vorLaden: downloadsZaehlen }, async ({ page, oeffne, server }) => {
  const { id } = await server.teilen.lege({ name: "Teigball", dateien: {
    "pizza.json": JSON.stringify({ pizza: 1, name: "Teigball", hauptdatei: "hauptgang.pizza", args: ["Luigi"] }) + "\n",
    "hauptgang.pizza": 'bestellt "welt/tisch.pizza";\nBote.sage((tisch() + " " + Kiste.text("daten/gruss.txt")));\n',
    "welt/tisch.pizza": 'margherita tisch() { serviere (("Tisch")); }\n',
    "daten/gruss.txt": "Ciao",
    "bilder/teig.png": PNG,
  } });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.pathname === "/bin/ziele.json") return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(ZIELE) });
    if (u.pathname === "/bin/" + ZIELE.ziele[0].datei) return req.respond({ status: 200, contentType: "application/octet-stream", body: Buffer.from("MZ-e2e-kein-echtes-binary") });
    return req.continue();
  });
  await oeffne("#h=" + id);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="baum-datei"]').length === 5, { timeout: 8000 });
  await page.waitForFunction(() => document.getElementById("knopf-exe").getAttribute("aria-disabled") === "false", { timeout: 15_000, polling: 50 });
  await page.click("#knopf-exe");
  await page.waitForSelector("#dialog-exe[open]", { timeout: 15_000 });
  assert.match(await page.$eval("#exe-tabname", (e) => e.textContent), /Teigball/);
  await page.click("#exe-los");
  await page.waitForFunction(() => !document.getElementById("exe-fehler").hidden || /3\/3/.test(document.getElementById("exe-status-text").textContent), { timeout: 30_000, polling: 50 });
  const r = await page.evaluate(() => ({ fehler: document.getElementById("exe-fehler").hidden ? null : document.getElementById("exe-fehler").textContent, downloads: window.__downloads.slice() }));
  assert.equal(r.fehler, null, "Mehrdatei-Projekt lässt sich backen");
  assert.equal(r.downloads.length, 1);
  assert.match(r.downloads[0], /^Teigball.*\.exe$/i);
});
