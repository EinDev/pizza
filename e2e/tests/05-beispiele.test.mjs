// Beispiele: JEDES Beispiel aus den Manifesten in der UI öffnen und backen → Konsole == .erwartet, Exit-Badge passend.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  e2e, zeigePanelTab, editorText, warteLaufEnde, konsolenAusgabe, exitBadge, EXIT_TEXT, EXIT_KLASSE,
  beispieleAusManifesten, screenshot, schlafe, strg, warteAufTab, S,
  eingabeZeilen, backenInteraktiv, ausgabeAusEreignissen, nachLetztemLeeren, echos,
} from "../hilfen.mjs";

const { liste: BEISPIELE, fehlend, teile } = beispieleAusManifesten();

test("Manifeste: alle in index.json gelisteten Teil-Manifeste existieren", () => {
  assert.deepEqual(fehlend, [], "fehlende Teil-Manifeste (404 im Browser): " + fehlend.join(", "));
  assert.ok(teile.length >= 2);
});

async function karteKlicken(page, b) {
  const ok = await page.$$eval(S.beispielKarte, (karten, titel) => {
    const k = karten.find((x) => x.querySelector(".bsp-titel").textContent === titel);
    if (!k) return false;
    k.scrollIntoView({ block: "center" });
    k.click();
    return true;
  }, b.titel || b.id);
  assert.ok(ok, "Karte gefunden: " + b.titel);
}

e2e("Beispiele-Panel: Karten, Kategorien-Chips, Filter", async ({ page, oeffne }) => {
  await oeffne();
  await zeigePanelTab(page, "beispiele");
  await page.waitForSelector(S.beispielKarte);
  const anzahl = await page.$$eval(S.beispielKarte, (k) => k.length);
  assert.equal(anzahl, BEISPIELE.length, "eine Karte je Beispiel");
  const kategorien = [...new Set(BEISPIELE.map((b) => b.kategorie))];
  const chips = await page.$$eval("#beispiele-kategorien .chip", (c) => c.map((x) => x.textContent));
  assert.deepEqual(chips, ["Alle", ...kategorien]);
  // Kategorie wählen
  await page.$$eval("#beispiele-kategorien .chip", (c) => c[1].click());
  const nurErste = await page.$$eval(S.beispielKarte, (k) => k.length);
  assert.equal(nurErste, BEISPIELE.filter((b) => b.kategorie === kategorien[0]).length);
  assert.equal(await page.$eval("#beispiele-kategorien .chip:nth-child(2)", (c) => c.getAttribute("aria-pressed")), "true");
  await page.$$eval("#beispiele-kategorien .chip", (c) => c[0].click());
  // Filtern
  await page.type("#beispiele-suche", "hallo");
  const gefiltert = await page.$$eval("#beispiele-liste .bsp-titel", (t) => t.map((x) => x.textContent));
  assert.ok(gefiltert.includes("Hallo Welt") && gefiltert.length < BEISPIELE.length, gefiltert.join(", "));
  await page.type("#beispiele-suche", "-gibtsnicht");
  assert.match(await page.$eval("#beispiele-liste .nav-leer", (e) => e.textContent), /Kein Beispiel/);
  await page.focus("#beispiele-suche");
  await page.keyboard.press("Escape");
  assert.equal(await page.$$eval(S.beispielKarte, (k) => k.length), BEISPIELE.length);
  // Exit-Code-Hinweis auf Karten mit exitCode ≠ 0
  const mitExit = await page.$$eval("#beispiele-liste .bsp-exit", (e) => e.length);
  assert.equal(mitExit, BEISPIELE.filter((b) => b.exitCode !== 0).length);
});

e2e(`Alle ${BEISPIELE.length} Beispiele öffnen & backen → Ausgabe == .erwartet`, { timeout: 150_000 }, async ({ page, oeffne }, t) => {
  assert.ok(BEISPIELE.length > 0);
  await oeffne();
  await zeigePanelTab(page, "beispiele");
  await page.waitForSelector(S.beispielKarte);
  const quellen = await page.evaluate(async (dateien) => {
    const o = {};
    for (const d of dateien) o[d] = await (await fetch("beispiele/" + d)).text();
    return o;
  }, BEISPIELE.map((b) => b.datei));

  for (const b of BEISPIELE) {
    await t.test(`${b.kategorie}: ${b.titel} (${b.datei}, Exit ${b.exitCode})`, async () => {
      try {
        const name = b.datei.split("/").pop();
        await karteKlicken(page, b);
        await warteAufTab(page, name);
        assert.equal(await editorText(page), quellen[b.datei].replace(/\r\n?/g, "\n"), "Editor zeigt den Beispielcode");
        // per Tastatur backen (Strg+Enter): unabhängig davon, ob etwas den Backen-Knopf überdeckt.
        // Interaktive Programme: jede Eingabe-Anfrage mit der nächsten Zeile aus .eingabe beantworten, danach EOF.
        const zeilen = eingabeZeilen(b) || [];
        const { gesendet } = await backenInteraktiv(page, zeilen, { timeout: 30_000 });
        if (zeilen.length) assert.equal(gesendet, zeilen.length, "alle Eingabezeilen wurden abgefragt");
        // 1) Ereignisstrom (inkl. «leeren») exakt wie .erwartet
        assert.equal(await ausgabeAusEreignissen(page), b.erwartetText, "Ereignisse entsprechen " + b.erwartet);
        // 2) Sichtbare Konsole = alles nach dem letzten Bote.leeren()
        assert.equal(await konsolenAusgabe(page), nachLetztemLeeren(b.erwartetText), "Konsole entspricht " + b.erwartet);
        // 3) Echo der Eingaben sichtbar (nur der Teil nach dem letzten leeren steht noch da)
        if (gesendet) {
          const e = (await echos(page)).filter((x) => !x.eof).map((x) => x.text);
          assert.deepEqual(e, zeilen.slice(zeilen.length - e.length), "Echo = letzte Eingabezeilen");
        }
        const badge = await exitBadge(page);
        assert.equal(badge.text, EXIT_TEXT[b.exitCode], "Exit-Badge");
        assert.match(badge.klasse, new RegExp("\\b" + EXIT_KLASSE[b.exitCode] + "\\b"));
        const overlay = await page.$eval("#hawaii", (h) => !h.hidden);
        assert.equal(overlay, b.exitCode === 39, "Hawaii-Overlay genau bei Exit 39");
        if (overlay) {
          await page.click("#hawaii-neustart");
          await page.waitForFunction(() => document.getElementById("hawaii").hidden);
        }
      } catch (e) {
        await screenshot(page, "beispiel-" + b.id).catch(() => {});
        // Overlay nicht offen lassen, sonst scheitern die folgenden Beispiele mit
        await page.evaluate(() => { if (!document.getElementById("hawaii").hidden) document.getElementById("hawaii-neustart").click(); }).catch(() => {});
        throw e;
      }
    });
  }
  await schlafe(50);
});
