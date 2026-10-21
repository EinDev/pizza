// Ausführen: Tippen + Strg+Enter, Syntaxfehler mit Live-Diagnose, Laufzeitfehler, Endlosschleife, Hawaii.
import assert from "node:assert/strict";
import {
  e2e, setzeCode, editorText, backen, strg, warteLaufEnde, exitBadge, konsolenAusgabe, konsolenMeldungen,
  EXIT_TEXT, EXIT_KLASSE, schlafe, neuerTab,
} from "../hilfen.mjs";

const leererTab = neuerTab;

e2e("Code eintippen → Strg+Enter → Ausgabe und Badge „gegessen“", async ({ page, oeffne }) => {
  await oeffne();
  await leererTab(page);
  // wirklich tippen (mit Autoklammern & Autovervollständigung)
  await page.keyboard.type('Bote.sage(("Hallo aus dem Test"));', { delay: 5 });
  await page.keyboard.press("Escape"); // evtl. offene Vervollständigung schließen
  assert.equal(await editorText(page), 'Bote.sage(("Hallo aus dem Test"));');
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "Hallo aus dem Test\n");
  const b = await exitBadge(page);
  assert.equal(b.text, EXIT_TEXT[0]);
  assert.match(b.klasse, /\bok\b/);
  const info = await page.$eval("#lauf-info", (e) => e.textContent);
  assert.match(info, /unbenannt-1\.pizza/);
  assert.match(info, /Schritte/);
  // Logo wieder im Ruhezustand
  assert.equal(await page.$eval("#logo-bild", (i) => i.getAttribute("src")), "img/logo.svg");
});

e2e("Backen-Knopf, Willkommens-Programm, Konsole leeren", async ({ page, oeffne }) => {
  await oeffne();
  await page.click("#knopf-backen");
  await warteLaufEnde(page);
  const aus = await konsolenAusgabe(page);
  assert.match(aus, /^Frisch aus dem Ofen: /);
  assert.match(aus, /Summe aus dem Ofen: 55/);
  assert.match(aus, /Buon appetito, Giulia!\n$/);
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
  await page.click("#konsole-leeren");
  assert.equal(await konsolenAusgabe(page), "");
  assert.equal(await page.$eval("#exit-badge", (b) => b.hidden), true);
  assert.ok(await page.$("#konsole-inhalt .konsole-leer"));
});

e2e("Fehlerausgabe (Bote.fehler) erscheint getrennt und rot markiert", async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, 'Bote.sage(("eins"));\nBote.fehler(("zwei"));\nBote.sage(("drei"));\nBote.sage(("vier"));');
  await backen(page);
  const typen = await page.$$eval("#konsole-inhalt > .k-zeile", (z) => z.map((e) => [e.dataset.typ, e.textContent.replace(/\n$/, "")]));
  assert.deepEqual(typen, [["ausgabe", "eins"], ["fehlerausgabe", "zwei"], ["ausgabe", "drei\nvier"]]);
});

e2e("Syntaxfehler: Live-Diagnose markiert, Fehler in Konsole, Klick springt zur Zeile", async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, 'Bote.sage(("ok"));\n\n\nsalami x = 1;\nBote.sage((x +));\nBote.sage(("nie"));');
  // Live-Diagnose (Linter, 350 ms Verzögerung)
  await page.waitForSelector("#editor .cm-lintRange-error", { timeout: 5000 });
  await page.waitForSelector("#editor .cm-lint-marker-error", { timeout: 5000 });
  const markiert = await page.$eval("#editor .cm-lintRange-error", (e) => e.closest(".cm-line").textContent);
  assert.equal(markiert, "Bote.sage((x +));");
  // Cursor woanders hin
  await page.keyboard.down("Control"); await page.keyboard.press("Home"); await page.keyboard.up("Control");

  await backen(page);
  assert.equal(await konsolenAusgabe(page), "", "bei Syntaxfehler läuft nichts");
  const b = await exitBadge(page);
  assert.equal(b.text, EXIT_TEXT[2]);
  assert.match(b.klasse, new RegExp("\\b" + EXIT_KLASSE[2] + "\\b"));
  const m = (await konsolenMeldungen(page)).filter((x) => /k-fehler/.test(x.klasse));
  assert.equal(m.length, 1, JSON.stringify(m));
  assert.match(m[0].text, /P0001/);
  assert.match(m[0].ort, /^Z\. 5:15$/);
  assert.ok(m[0].knopf, "Fehlermeldung ist anklickbar");

  await page.click("#konsole-inhalt button.k-fehler");
  await page.waitForSelector("#editor .cm-pizza-sprungzeile");
  const sprung = await page.evaluate(() => ({
    zeile: document.querySelector("#editor .cm-pizza-sprungzeile").textContent,
    aktiveNr: document.querySelector("#editor .cm-activeLineGutter") && document.querySelector("#editor .cm-activeLineGutter").textContent,
    fokus: document.activeElement.classList.contains("cm-content"),
  }));
  assert.equal(sprung.zeile, "Bote.sage((x +));");
  assert.equal(sprung.aktiveNr, "5");
  assert.ok(sprung.fokus, "Editor hat danach den Fokus");
});

e2e("Laufzeitfehler: ungefangene Ananas → Badge „Ananas“, Ausgabe davor bleibt", async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, 'Bote.sage(("a"));\nwirf neu StreitAnanas(("weg"));');
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "a\n");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[1]);
  const m = (await konsolenMeldungen(page)).find((x) => /k-fehler/.test(x.klasse));
  assert.match(m.text, /Ungefangene Ananas – StreitAnanas: weg/);
  assert.match(m.ort, /^Z\. 2/);
});

e2e("Endlosschleife: Schrittlimit → „noch im Ofen“, UI bleibt bedienbar", async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, "salami n = 0;\nsolange (ja) { n += 1; }");
  await backen(page, { timeout: 15_000 });
  const b = await exitBadge(page);
  assert.equal(b.text, EXIT_TEXT[3]);
  assert.match(b.klasse, /\bofen\b/);
  const m = (await konsolenMeldungen(page)).find((x) => /k-fehler/.test(x.klasse));
  assert.match(m.text, /P0002/);
  // danach normal weiterarbeiten
  await setzeCode(page, 'Bote.sage(("weiter"));');
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "weiter\n");
});

// Simuliert einen hängenden Ofen: solange window.__haengen gesetzt ist, erreicht der Start den Worker nie.
// So greifen Abbrechen/Zeitlimit deterministisch während des Laufs (unabhängig von der Rechnergeschwindigkeit).
const haengenderWorker = () => {
  const W = window.Worker;
  window.__haengen = false;
  window.Worker = class extends W {
    postMessage(m) { if (window.__haengen && m && m.typ === "start") return; super.postMessage(m); }
  };
};

e2e("Endlosschleife: Abbrechen-Knopf und Esc beenden den Lauf sofort", { vorLaden: haengenderWorker }, async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, "salami n = 0;\nsolange (ja) { n += 1; }");
  await page.evaluate(() => { window.__haengen = true; });
  for (const weg of ["knopf", "esc"]) {
    await strg(page, "Enter");
    assert.equal(await page.$eval("#knopf-abbrechen", (k) => k.hidden), false, "Abbrechen-Knopf sichtbar während des Laufs");
    assert.equal(await page.$eval("#knopf-backen", (k) => k.hidden), true);
    assert.match((await exitBadge(page)).text, /im Ofen/);
    assert.ok(await page.evaluate(() => document.body.classList.contains("laeuft")));
    // Während des Laufs startet Strg+Enter keinen zweiten Lauf
    await strg(page, "Enter");
    if (weg === "knopf") await page.click("#knopf-abbrechen");
    else await page.keyboard.press("Escape");
    await warteLaufEnde(page);
    const b = await exitBadge(page);
    assert.equal(b.text, "abgebrochen", weg);
    const m = await konsolenMeldungen(page);
    assert.ok(m.some((x) => /Lauf abgebrochen/.test(x.text)), weg + ": Systemmeldung");
    assert.equal(await page.$eval("#knopf-backen", (k) => k.hidden), false);
  }
  // UI bleibt bedienbar
  await page.evaluate(() => { window.__haengen = false; });
  await setzeCode(page, 'Bote.sage(("noch da"));');
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "noch da\n");
});

e2e("Wand-Zeitlimit: Worker hängt → nach Zeitlimit abgebrochen (Timer verkürzt)", {
  // Zeitlimit 10 s → im Test auf 400 ms verkürzt, und der Worker meldet sich nie (simuliert hängenden Ofen).
  vorLaden: `(${haengenderWorker})();
    const st = window.setTimeout;
    window.setTimeout = (fn, ms, ...rest) => st(fn, ms === 10000 ? 400 : ms, ...rest);`,
}, async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, 'Bote.sage(("hängt"));');
  await page.evaluate(() => { window.__haengen = true; });
  await strg(page, "Enter");
  await warteLaufEnde(page, 5000);
  const b = await exitBadge(page);
  assert.equal(b.text, EXIT_TEXT[3]);
  assert.match(await page.$eval("#lauf-info", (e) => e.textContent), /Zeitlimit/);
  const m = (await konsolenMeldungen(page)).find((x) => /k-fehler/.test(x.klasse));
  assert.match(m.text, /Zeitlimit/);
  // danach wieder normal
  await page.evaluate(() => { window.__haengen = false; });
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "hängt\n");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
});

e2e("Hawaii: Crash-Overlay erscheint, „PizzaVM neu starten“ funktioniert", async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, 'Bote.sage(("vor"));\nPizza p = ((Tomate, Ananas));\nBote.sage(("nach"));');
  // W0666-Warnung live (Linter)
  await backen(page);
  await page.waitForSelector("#hawaii:not([hidden])");
  const o = await page.evaluate(() => ({
    banner: document.getElementById("hawaii-banner").textContent,
    rolle: document.getElementById("hawaii").getAttribute("role"),
    klasse: document.body.className,
  }));
  assert.match(o.banner, /PIZZA-VM KERNEL PANIC/);
  assert.equal(o.rolle, "alertdialog");
  assert.match(o.klasse, /hawaii-aktiv/);
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === "hawaii-neustart");
  // Konsole: „vor“, dann Panik-Text, „nach“ nie
  const aus = await konsolenAusgabe(page);
  assert.match(aus, /^vor\n╔/);
  assert.doesNotMatch(aus, /nach/);
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[39]);
  // Tastenkürzel sind gesperrt, solange das Overlay offen ist
  await strg(page, "Enter");
  assert.equal(await page.$eval("#knopf-backen", (k) => k.hidden), false);

  await page.click("#hawaii-neustart");
  await page.waitForSelector("#hawaii[hidden]", { hidden: true }).catch(() => {});
  assert.equal(await page.$eval("#hawaii", (h) => h.hidden), true);
  assert.doesNotMatch(await page.evaluate(() => document.body.className), /hawaii-aktiv/);
  await page.waitForFunction(() => [...document.querySelectorAll("#konsole-inhalt .k-meldung")].some((m) => /PizzaVM neu gestartet/.test(m.textContent)));
  // Kopfzeile ist wieder bedienbar: nichts überdeckt den Backen-Knopf (Exit-Badge „hawaii“ darf nicht wie das Overlay aussehen)
  const verdeckt = await page.evaluate(() => {
    const k = document.getElementById("knopf-backen").getBoundingClientRect();
    const e = document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2);
    return e && !e.closest("#knopf-backen") ? (e.id || e.className) : null;
  });
  assert.equal(verdeckt, null, "Backen-Knopf nach Neustart verdeckt von: " + verdeckt);
  const badgeBox = await page.$eval("#exit-badge", (b) => { const r = b.getBoundingClientRect(); return { pos: getComputedStyle(b).position, w: r.width }; });
  assert.notEqual(badgeBox.pos, "fixed", "Exit-Badge (Klasse hawaii) erbt nicht position: fixed vom Overlay");
  // VM läuft wieder
  await setzeCode(page, 'Bote.sage(("wieder warm"));');
  await backen(page);
  assert.equal(await konsolenAusgabe(page), "wieder warm\n");

  // Esc schließt das Overlay ebenfalls
  await setzeCode(page, "hawaii h = 1;");
  await backen(page);
  await page.waitForSelector("#hawaii:not([hidden])");
  await schlafe(60);
  await page.keyboard.press("Escape");
  assert.equal(await page.$eval("#hawaii", (h) => h.hidden), true);
});

e2e("Warnung W0666 wird in Live-Diagnose und Konsole angezeigt", async ({ page, oeffne }) => {
  await oeffne();
  await setzeCode(page, "hawaii h;\nBote.sage((\"still\"));");
  await backen(page);
  const m = await konsolenMeldungen(page);
  assert.ok(m.some((x) => /k-warnung/.test(x.klasse) && /W0666/.test(x.text)), JSON.stringify(m));
  assert.equal(await konsolenAusgabe(page), "still\n");
});
