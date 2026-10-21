// Beispiele: JEDES Beispiel aus den Manifesten in der UI öffnen und backen → Konsole == .erwartet, Exit-Badge passend.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  e2e, zeigePanelTab, editorText, warteLaufEnde, konsolenAusgabe, exitBadge, pruefeExit, hawaiiOverlayOffen, backenVerdeckt,
  beispieleAusManifesten, screenshot, schlafe, strg, warteAufTab, S,
  eingabeZeilen, backenInteraktiv, ausgabeAusEreignissen, nachLetztemLeeren, echos,
  thekeEreignisse, thekeUiErwartet, backenTheke, uiNachrichten, VORSCHAU, warteAufTabMuster,
} from "../hilfen.mjs";

const { liste: BEISPIELE, fehlend, teile } = beispieleAusManifesten();

test("Manifeste: alle in index.json gelisteten Teil-Manifeste existieren", () => {
  assert.deepEqual(fehlend, [], "fehlende Teil-Manifeste (404 im Browser): " + fehlend.join(", "));
  assert.ok(teile.length >= 2);
});

async function karteKlicken(page, b) {
  // per ID (Titel/Dateinamen sind kategorieübergreifend nicht eindeutig, z. B. „Belag-Baukasten“)
  const ok = await page.$$eval(S.beispielKarte, (karten, id, titel) => {
    const k = karten.find((x) => x.dataset.id === id) || karten.find((x) => x.querySelector(".bsp-titel").textContent === titel);
    if (!k) return false;
    k.scrollIntoView({ block: "center" });
    k.click();
    return true;
  }, b.id, b.titel);
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
        await warteAufTabMuster(page, name);
        assert.equal(await editorText(page), quellen[b.datei].replace(/\r\n?/g, "\n"), "Editor zeigt den Beispielcode");
        // per Tastatur backen (Strg+Enter): unabhängig davon, ob etwas den Backen-Knopf überdeckt.
        // Interaktive Programme: jede Eingabe-Anfrage mit der nächsten Zeile aus .eingabe beantworten, danach EOF.
        const zeilen = eingabeZeilen(b) || [];
        const theke = thekeEreignisse(b);
        let gesendet = 0;
        if (theke) {
          // Theke: Ereignisse im Vorschaufenster nachspielen (Klick/Tippen/Enter/Haken, „geschlossen“ = Schließen-Knopf)
          await backenTheke(page, theke, { timeout: 30_000 });
          const uiSoll = thekeUiErwartet(b);
          if (uiSoll) assert.deepEqual(await uiNachrichten(page), uiSoll, "ui-Nachrichten entsprechen .ui-erwartet");
          assert.equal(await page.$eval(VORSCHAU, (v) => v.hidden), true, "Programmende schließt das Vorschaufenster");
        } else {
          ({ gesendet } = await backenInteraktiv(page, zeilen, { timeout: 30_000 }));
        }
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
        await pruefeExit(page, b.exitCode);
        // Hawaii (Exit 39) ist ein normaler Fehler: kein Overlay, Backen bleibt bedienbar
        assert.equal(await hawaiiOverlayOffen(page), false, "kein Hawaii-Overlay");
        assert.equal(await backenVerdeckt(page), null, "Backen-Knopf frei");
      } catch (e) {
        await screenshot(page, "beispiel-" + b.id).catch(() => {});
        throw e;
      }
    });
  }
  await schlafe(50);
});
