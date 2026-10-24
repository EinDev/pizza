// Playground-Projekte (PROJEKTE.md §3, K-142, PB1): Migration der alten Tabs (F12), ZIP-Export/-Import ohne Bibliothek,
// Dateibaum mit Ordnern und Bilddatei (Signaturprüfung, Vorschau über data:-URL), Fehlersprung in die Hauptdatei, Rückfall ohne
// IndexedDB (Banner, Playground bleibt nutzbar), Projektmenü (Umbenennen, Duplizieren, Löschen, Papierkorb).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import zlib from "node:zlib";
import path from "node:path";
import {
  e2e, setzeCode, editorText, editorTabs, bereit, backen, konsolenAusgabe, schlafe, warteAufTab,
  aktivesProjekt, warteAufProjekt, wechsleProjekt, projektListe, projektBefehl, baumDateien, PJ,
} from "../hilfen.mjs";
import { schreibeZip, leseZip } from "../../ui/src/zip.js";

const ALTE_TABS = {
  aktiv: "t2",
  tabs: [
    { id: "t1", name: "willkommen.pizza", schluessel: "willkommen", text: 'Bote.sage(("W"));', basis: 'Bote.sage(("W"));' },
    { id: "t2", name: "Mein Code.pizza", schluessel: null, text: 'Bote.sage(("neu"));', basis: 'Bote.sage(("alt"));', args: "a b" },
    { id: "t3", name: "hallo-welt.pizza", schluessel: "bsp:grundlagen/hallo-welt.pizza", text: 'Bote.sage(("H"));' },
  ],
  geschlossen: [{ name: "weg.pizza", text: 'Bote.sage(("X"));' }],
};

/** Blobs, die die Seite herunterlädt (URL.createObjectURL), für die Prüfung in Node mitschneiden. */
const DOWNLOADS = () => {
  window.__downloads = [];
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { window.__downloads.push(b); return orig(b); };
  HTMLAnchorElement.prototype.click = function () { /* kein echter Download im Test */ };
};
async function letzterDownload(page) {
  await page.waitForFunction(() => window.__downloads && window.__downloads.length > 0);
  const zahlen = await page.evaluate(async () => [...new Uint8Array(await window.__downloads.at(-1).arrayBuffer())]);
  return new Uint8Array(zahlen);
}
/** Gültiges 2×2-RGBA-PNG (zlib aus Node, keine Binärdateien im Repo) – der Vorbacker (PD1) bäckt es wirklich vor. */
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
  return [...Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), block("IHDR", ihdr), block("IDAT", zlib.deflateSync(roh)), block("IEND", Buffer.alloc(0))])];
})();
/** Nur der PNG-Kopf: Signatur und Größe stimmen, Inhalt fehlt → erst der Vorbacker erkennt es als kaputt. */
const NUR_KOPF = PNG.slice(0, 33);

/** Dateien per Drag & Drop auf ein Element fallen lassen (synthetisches DragEvent mit DataTransfer). */
function lasseFallen(page, selektor, dateien) {
  return page.evaluate((sel, ds) => {
    const dt = new DataTransfer();
    for (const d of ds) dt.items.add(new File([new Uint8Array(d.bytes)], d.name, { type: d.typ || "" }));
    const ziel = document.querySelector(sel);
    for (const art of ["dragenter", "dragover", "drop"]) ziel.dispatchEvent(new DragEvent(art, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, selektor, dateien);
}

e2e("Migration: jeder alte Tab wird ein Ein-Datei-Projekt, geschlossene landen im Papierkorb, pizza.tabs ist danach weg", {
  vorLaden: `(() => { try { if (!sessionStorage.getItem("e2e-migriert")) { sessionStorage.setItem("e2e-migriert", "1"); localStorage.setItem("pizza.tabs", ${JSON.stringify(JSON.stringify(ALTE_TABS))}); } } catch (e) {} })()`,
}, async ({ page, oeffne }) => {
  await oeffne();
  await warteAufProjekt(page, "Mein Code");
  assert.equal((await editorTabs(page))[0].name, "mein-code.pizza");
  assert.equal(await editorText(page), 'Bote.sage(("neu"));');
  assert.ok((await editorTabs(page))[0].schmutzig, "ungespeicherte Änderung bleibt als Punkt sichtbar");
  assert.equal(await page.$eval('[data-testid="argumente"]', (f) => f.value), "a b", "Argumente übernommen");
  assert.deepEqual((await projektListe(page)).sort(), ["Mein Code", "hallo-welt", "willkommen"]);
  assert.equal(await page.evaluate(() => localStorage.getItem("pizza.tabs")), null);
  // Papierkorb: „weg“ wiederherstellen
  await page.click(PJ.menueKnopf);
  await page.waitForSelector('[data-testid="projekt-papierkorb-eintrag"]');
  await page.$eval('[data-testid="projekt-papierkorb-eintrag"]', (k) => k.click());
  await warteAufProjekt(page, "weg");
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "X\n");
  // Reload: keine zweite Migration
  await page.reload({ waitUntil: "load" });
  await bereit(page);
  assert.equal((await projektListe(page)).length, 4);
});

e2e("ZIP: Export (stored, mit erzeugter pizza.json) und Import als neues Projekt", { vorLaden: DOWNLOADS }, async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, 'Bote.sage(("aus dem ZIP"));');
  await projektBefehl(page, "projekt-zip-export");
  const zip = await letzterDownload(page);
  const r = await leseZip(zip);
  assert.equal(r.ok, true, r.fehler);
  assert.equal(r.wurzel, "willkommen");
  assert.deepEqual(Object.keys(r.dateien).sort(), ["pizza.json", "willkommen.pizza"]);
  assert.deepEqual(JSON.parse(r.dateien["pizza.json"]), { pizza: 1, name: "willkommen", hauptdatei: "willkommen.pizza" });
  assert.equal(r.dateien["willkommen.pizza"], 'Bote.sage(("aus dem ZIP"));');

  // Import: Ordner mit zwei Dateien + Bild, Großbuchstaben, __MACOSX
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pizza-e2e-"));
  const datei = path.join(dir, "Teigball.zip");
  fs.writeFileSync(datei, schreibeZip({
    "pizza.json": JSON.stringify({ pizza: 1, name: "Teigball", hauptdatei: "spiel.pizza", args: ["Luigi"] }),
    "spiel.pizza": 'Bote.sage(("Teigball rollt"));',
    "welt/Tisch.pizza": "// Tisch",
    "bilder/teig.png": new Uint8Array(PNG),
  }, { ordner: "teigball" }));
  const [waehler] = await Promise.all([page.waitForFileChooser(), projektBefehl(page, "projekt-zip-import")]);
  await waehler.accept([datei]);
  await warteAufProjekt(page, "Teigball");
  assert.deepEqual(await baumDateien(page), ["bilder/teig.png", "welt/tisch.pizza", "pizza.json", "spiel.pizza"]);
  assert.equal(await page.$eval('[data-testid="baum-datei"][data-haupt="true"]', (e) => e.dataset.pfad), "spiel.pizza");
  assert.equal(await page.$eval('[data-testid="argumente"]', (f) => f.value), "Luigi", "Startwert der Argumente aus pizza.json");
  await page.waitForFunction(() => /umbenannt/.test(document.getElementById("toast").textContent));
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "Teigball rollt\n");
  fs.rmSync(dir, { recursive: true, force: true });
});

e2e("Dateibaum: Ordner und Datei anlegen, Bild per Drag & Drop (Signatur geprüft), Bildvorschau, Hauptdatei wechseln, löschen", async ({ page, oeffne }) => {
  await oeffne();
  await page.click('[data-testid="dateibaum-umschalten"]');
  await page.waitForSelector(`${PJ.baum}:not([hidden])`);
  // Ordner + Datei darin über das Kontextmenü des Ordners
  await page.click('[data-testid="baum-neuer-ordner"]');
  await page.focus('[data-testid="baum-eingabe"]');
  await page.keyboard.type("bilder");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-testid="baum-ordner"][data-pfad="bilder"]');
  // ungültiger Name → Hinweis live, Enter legt nichts an
  await page.click('[data-testid="baum-neue-datei"]');
  await page.focus('[data-testid="baum-eingabe"]');
  await page.keyboard.type("Böse.pizza");
  await page.waitForFunction(() => /kein gültiger Dateipfad/.test(document.querySelector('[data-testid="baum-hinweis"]').textContent));
  await page.keyboard.press("Escape");
  // Bild hinein (gültig) und ein falsches Bild (Endung passt nicht zur Signatur)
  await lasseFallen(page, '[data-testid="baum-ordner"][data-pfad="bilder"]', [{ name: "Teig.png", bytes: PNG, typ: "image/png" }]);
  await page.waitForSelector('[data-testid="baum-datei"][data-pfad="bilder/teig.png"]');
  await warteAufTab(page, "teig.png");
  await page.waitForSelector('[data-testid="bildvorschau"]:not([hidden])');
  await page.waitForSelector('[data-testid="bildvorschau"][data-vorgebacken="ja"]');
  assert.match(await page.$eval('[data-testid="bildvorschau-info"]', (e) => e.textContent), /^2 × 2 · Quelle \d+ B · PNG · vorgebacken \d+ B · 2 Stufen$/);
  assert.match(await page.$eval('[data-testid="bildvorschau-bild"]', (i) => i.getAttribute("src")), /^data:image\/png;base64,/);
  await lasseFallen(page, '[data-testid="dateibaum-liste"]', [{ name: "falsch.jpg", bytes: PNG }]);
  await page.waitForFunction(() => /falsch\.jpg ist kein lesbares Bild/.test(document.getElementById("toast").textContent));
  assert.ok(!(await baumDateien(page)).includes("falsch.jpg"));
  // Kopf stimmt, Inhalt fehlt → erst der Vorbacker lehnt ab (gleiche Meldung wie zur Laufzeit)
  await lasseFallen(page, '[data-testid="dateibaum-liste"]', [{ name: "kaputt.png", bytes: NUR_KOPF }]);
  await page.waitForFunction(() => /kaputt\.png ist kein lesbares Bild/.test(document.getElementById("toast").textContent));
  assert.ok(!(await baumDateien(page)).includes("kaputt.png"));
  // zweite .pizza-Datei als Hauptdatei
  await page.click('[data-testid="baum-neue-datei"]');
  await page.focus('[data-testid="baum-eingabe"]');
  await page.keyboard.type("haupt");
  await page.keyboard.press("Enter");
  await warteAufTab(page, "haupt.pizza");
  await setzeCode(page, 'Bote.sage(("neue Hauptdatei"));');
  await page.click('[data-testid="baum-datei"][data-pfad="haupt.pizza"]', { button: "right" });
  await page.waitForSelector('[data-testid="baum-menue"]');
  await page.$eval('[data-testid="baum-menue-hauptdatei"]', (k) => k.click());
  await page.waitForSelector('[data-testid="baum-datei"][data-pfad="haupt.pizza"][data-haupt="true"]');
  // willkommen.pizza wird jetzt von niemandem bestellt → grau
  assert.ok(await page.$eval('[data-testid="baum-datei"][data-pfad="willkommen.pizza"]', (e) => e.classList.contains("unerreichbar")));
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "neue Hauptdatei\n");
  // Datei löschen mit Rückfrage im Seiten-Dialog
  await page.click('[data-testid="baum-datei"][data-pfad="willkommen.pizza"]', { button: "right" });
  await page.waitForSelector('[data-testid="baum-menue"]');
  await page.$eval('[data-testid="baum-menue-loeschen"]', (k) => k.click());
  await page.waitForSelector("#dialog-frage[open]");
  await page.$eval('[data-testid="dialog-ja"]', (k) => k.click());
  await page.waitForFunction(() => !document.querySelector('[data-testid="baum-datei"][data-pfad="willkommen.pizza"]'));
  assert.deepEqual(await baumDateien(page), ["bilder/teig.png", "haupt.pizza"]);
});

e2e("Fehler springen: Klick auf den Fehlerort öffnet die Hauptdatei, auch wenn ein anderer Tab aktiv ist", async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, 'Bote.sage(("a"));\nsalami x = "kein Salami";');
  await page.click('[data-testid="dateibaum-umschalten"]');
  await page.click('[data-testid="baum-neue-datei"]');
  await page.focus('[data-testid="baum-eingabe"]');
  await page.keyboard.type("notiz.txt");
  await page.keyboard.press("Enter");
  await warteAufTab(page, "notiz.txt");
  await backen(page);
  await page.waitForSelector('[data-testid="konsole-fehler-sprung"]');
  await page.click('[data-testid="konsole-fehler-sprung"]');
  await warteAufTab(page, "willkommen.pizza");
  await page.waitForSelector('[data-pizza-sprung="true"]');
});

e2e("Mehrdatei-Programm (PA1): bestellt läuft, Fehler in der Nebendatei nennt die Datei und springt dorthin", async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, 'bestellt "welt/tisch.pizza";\nBote.sage(("Gruß: " + gruss));');
  await page.click('[data-testid="dateibaum-umschalten"]');
  await page.click('[data-testid="baum-neue-datei"]');
  await page.focus('[data-testid="baum-eingabe"]');
  await page.keyboard.type("welt/tisch.pizza");
  await page.keyboard.press("Enter");
  await warteAufTab(page, "tisch.pizza");
  await setzeCode(page, 'margherita gruss = "Ciao";');
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "Gruß: Ciao\n");
  await setzeCode(page, 'margherita gruss = "Ciao";\nsalami kaputt = "kein Salami";');
  await page.$$eval('#editor-tabs .etab', (t) => t.find((x) => x.dataset.pfad === "willkommen.pizza").querySelector(".etab-knopf").click());
  await warteAufTab(page, "willkommen.pizza");
  await backen(page);
  await page.waitForSelector('[data-testid="konsole-fehler-sprung"]');
  assert.equal(await page.$eval('[data-testid="konsole-fehler-sprung"]', (e) => e.dataset.datei), "welt/tisch.pizza");
  assert.match(await page.$eval('[data-testid="konsole-fehler-sprung"] [data-testid="konsole-ort"]', (e) => e.textContent), /\(welt\/tisch\.pizza, Zeile 2/);
  await page.click('[data-testid="konsole-fehler-sprung"]');
  await warteAufTab(page, "tisch.pizza");
  await page.waitForSelector('[data-pizza-sprung="true"]');
});

e2e("Projektmenü: umbenennen, duplizieren, löschen, wiederherstellen", async ({ page, oeffne }) => {
  await oeffne();
  await projektBefehl(page, "projekt-umbenennen");
  await page.waitForSelector("#dialog-eingabe[open]");
  await page.focus('[data-testid="dialog-eingabe-feld"]');
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.type("Mein Ofen");
  await page.keyboard.press("Enter");
  await warteAufProjekt(page, "Mein Ofen");
  await projektBefehl(page, "projekt-duplizieren");
  await warteAufProjekt(page, "Mein Ofen-kopie");
  await projektBefehl(page, "projekt-loeschen");
  await page.waitForSelector("#dialog-frage[open]");
  await page.$eval('[data-testid="dialog-ja"]', (k) => k.click());
  await warteAufProjekt(page, "Mein Ofen");
  assert.deepEqual(await projektListe(page), ["Mein Ofen"]);
  await page.click(PJ.menueKnopf);
  await page.$eval('[data-testid="projekt-papierkorb-eintrag"]', (k) => k.click());
  await warteAufProjekt(page, "Mein Ofen-kopie");
  await wechsleProjekt(page, "Mein Ofen");
  assert.equal(await aktivesProjekt(page), "Mein Ofen");
});

e2e("Ohne IndexedDB: Banner, Playground bleibt nutzbar (nur im Speicher)", {
  vorLaden: () => { try { Object.defineProperty(window, "indexedDB", { get: () => undefined, configurable: true }); } catch (e) { /* egal */ } },
}, async ({ page, oeffne }) => {
  await oeffne();
  await page.waitForSelector('[data-testid="projekt-banner"]:not([hidden])');
  assert.match(await page.$eval('[data-testid="projekt-banner"]', (b) => b.textContent), /nicht gespeichert – sichere sie als ZIP/);
  await setzeCode(page, 'Bote.sage(("trotzdem"));');
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "trotzdem\n");
  await schlafe(100);
});
