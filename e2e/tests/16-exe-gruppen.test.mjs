// EXE-Export und Importgruppen: Herd-Programme brauchen die Gruppe `herd`, die ältere vorgefertigte Hosts (bin/ziele.json ohne
// `gruppen`) nicht kennen → der EXE-Dialog zeigt eine freundliche Meldung, es wird weder das Host-Binary geladen noch
// etwas heruntergeladen. Gegenprobe: ein Programm ohne Herd wird verpackt und „heruntergeladen“ (Download abgefangen).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { e2e, setzeCode, SITE } from "../hilfen.mjs";

const ZIELE = { version: "0.0.0", format: "pkarton/1", trailer: "PKARTON1", ziele: [{ id: "windows-x64", name: "Windows (x64)", datei: "pizza-host-e2e.exe", endung: ".exe" }] };
const HOST = Buffer.from("MZ-e2e-kein-echtes-binary");

// Downloads (a[download].click) nur zählen, nie auslösen
function downloadsZaehlen() {
  window.__downloads = [];
  const klick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute("download")) { window.__downloads.push(this.download); return; }
    return klick.call(this);
  };
}

async function binAbfangen(page, ziele = ZIELE) {
  const geholt = [];
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.pathname === "/bin/ziele.json") { geholt.push(u.pathname); return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(ziele) }); }
    if (u.pathname === "/bin/" + ZIELE.ziele[0].datei) { geholt.push(u.pathname); return req.respond({ status: 200, contentType: "application/octet-stream", body: HOST }); }
    return req.continue();
  });
  return geholt;
}

async function exportiere(page) {
  // Knopf wird nach der Motor-Prüfung (js/motoren.json, Wasm-Compiler) freigegeben
  await page.waitForFunction(() => document.getElementById("knopf-exe").getAttribute("aria-disabled") === "false", { timeout: 15_000, polling: 50 });
  await page.click("#knopf-exe");
  await page.waitForSelector("#dialog-exe[open]", { timeout: 15_000 }).catch(async (e) => {
    throw new Error("EXE-Dialog nicht offen – Toast: " + await page.$eval("#toast", (t) => t.textContent) + " / " + e.message);
  });
  await page.click("#exe-los");
  await page.waitForFunction(() => !document.getElementById("exe-fehler").hidden || /3\/3/.test(document.getElementById("exe-status-text").textContent), { timeout: 30_000, polling: 50 });
  return page.evaluate(() => ({
    fehler: document.getElementById("exe-fehler").hidden ? null : document.getElementById("exe-fehler").textContent,
    status: document.getElementById("exe-status-text").textContent,
    downloads: window.__downloads.slice(),
  }));
}

e2e("EXE-Dialog: Herd-Spiel → freundliche Meldung, kein Host-Download, keine EXE", { timeout: 60_000, vorLaden: downloadsZaehlen }, async ({ page, oeffne }) => {
  const geholt = await binAbfangen(page);
  await oeffne();
  await setzeCode(page, fs.readFileSync(path.join(SITE, "beispiele", "herd", "wuerfel.pizza"), "utf8").replace(/\r\n/g, "\n"));
  const r = await exportiere(page);
  assert.equal(r.fehler, "Herd-Spiele lassen sich noch nicht als EXE exportieren – im Playground und per App-Link laufen sie schon.");
  assert.deepEqual(r.downloads, [], "kein Download");
  assert.deepEqual(geholt, ["/bin/ziele.json"], "Host-Binary nicht geladen");
  assert.equal(await page.$eval("#exe-los", (b) => b.disabled), false, "Dialog bleibt bedienbar");
});

e2e("EXE-Dialog: Programm ohne Herd wird verpackt und heruntergeladen", { timeout: 60_000, vorLaden: downloadsZaehlen }, async ({ page, oeffne }) => {
  const geholt = await binAbfangen(page);
  await oeffne();
  await setzeCode(page, 'Bote.sage(("Hallo EXE"));');
  const r = await exportiere(page);
  assert.equal(r.fehler, null);
  assert.equal(r.downloads.length, 1, "genau ein Download: " + JSON.stringify(r.downloads));
  assert.match(r.downloads[0], /\.exe$/);
  assert.deepEqual(geholt, ["/bin/ziele.json", "/bin/pizza-host-e2e.exe"]);
});

e2e("EXE-Dialog: Herd-Spiel mit Host, der `herd` kennt (ziele.json `gruppen`), wird verpackt", { timeout: 60_000, vorLaden: downloadsZaehlen }, async ({ page, oeffne }) => {
  const mitHerd = { ...ZIELE, ziele: [{ ...ZIELE.ziele[0], gruppen: ["theke", "vorrat", "echtzeit", "kueche", "herd"] }] };
  const geholt = await binAbfangen(page, mitHerd);
  await oeffne();
  await setzeCode(page, fs.readFileSync(path.join(SITE, "beispiele", "herd", "wuerfel.pizza"), "utf8").replace(/\r\n/g, "\n"));
  const r = await exportiere(page);
  assert.equal(r.fehler, null);
  assert.equal(r.downloads.length, 1);
  assert.deepEqual(geholt, ["/bin/ziele.json", "/bin/pizza-host-e2e.exe"]);
});
