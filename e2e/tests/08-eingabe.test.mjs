// Interaktive Ein-/Ausgabe (EINGABE.md): Eingabezeile, Echo, Strg+D, Abbrechen beim Warten, Zeitlimit ruht,
// Bote.schreibe/leeren, ein Spiel komplett durchspielen, Fallback ohne crossOriginIsolated.
import assert from "node:assert/strict";
import {
  e2e, setzeCode, strg, warteLaufEnde, exitBadge, konsolenAusgabe, konsolenMeldungen, EXIT_TEXT, S, schlafe,
  ereignisseLeeren, warteEingabeOderEnde, sendeEingabe, echos, backenInteraktiv, ausgabeAusEreignissen,
  nachLetztemLeeren, eingabeZeilen, beispieleAusManifesten, zeigePanelTab, warteAufTab, eingabeUnterstuetzt,
} from "../hilfen.mjs";

const FELD = '[data-testid="konsole-eingabe-feld"]';
const FORM = S.eingabe;

const DIALOG = `Bote.schreibe(("Name? "));
margherita n = Bestellannahme.lies();
Bote.sage(("Hallo " + n + "!"));
salami z = Bestellannahme.frageZahl(("Zahl? "));
Bote.sage(("doppelt: " + (z * 2)));
margherita r = Bestellannahme.lies();
falls (r == karton) { Bote.sage(("EOF")); } sonst { Bote.sage(("noch: " + r)); }`;

async function vorbereiten(page, oeffne, t) {
  await oeffne();
  if (!(await eingabeUnterstuetzt(page))) { t.skip("Interaktive Eingabe noch nicht vorhanden"); return false; }
  return true;
}

const formSichtbar = (page) => page.$eval(FORM, (f) => !f.hidden);

e2e("Seite ist cross-origin-isoliert (COOP+COEP) → SharedArrayBuffer verfügbar", async ({ page, oeffne }) => {
  const antwort = await oeffne();
  const h = antwort.headers();
  assert.equal(h["cross-origin-opener-policy"], "same-origin");
  assert.equal(h["cross-origin-embedder-policy"], "require-corp");
  assert.deepEqual(await page.evaluate(() => [window.crossOriginIsolated, typeof SharedArrayBuffer]), [true, "function"]);
});

e2e("Eingabezeile erscheint nur bei Anfrage, Enter sendet, Echo sichtbar, Strg+D = EOF", async ({ page, oeffne }, t) => {
  if (!(await vorbereiten(page, oeffne, t))) return;
  assert.equal(await formSichtbar(page), false, "ohne Anfrage keine Eingabezeile");
  await setzeCode(page, DIALOG);
  await ereignisseLeeren(page);
  await strg(page, "Enter");
  assert.equal(await warteEingabeOderEnde(page), "eingabe");
  // Fokus springt in die Eingabezeile, Aufforderung (Bote.schreibe) ist schon sichtbar
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.testid), "konsole-eingabe-feld");
  assert.equal(await konsolenAusgabe(page), "Name? ");
  assert.match((await exitBadge(page)).text, /im Ofen|wartet/);
  await sendeEingabe(page, "Luigi", { tippen: true });
  assert.equal(await warteEingabeOderEnde(page), "eingabe");
  assert.equal(await konsolenAusgabe(page), "Name? Hallo Luigi!\nZahl? ");
  // Zahl-Anfrage
  await sendeEingabe(page, "21", { tippen: true });
  assert.equal(await warteEingabeOderEnde(page), "eingabe");
  // Verlauf: ↑ holt die letzte Eingabe zurück
  await page.focus(FELD);
  await page.keyboard.press("ArrowUp");
  assert.equal(await page.$eval(FELD, (f) => f.value), "21");
  await page.keyboard.press("ArrowUp");
  assert.equal(await page.$eval(FELD, (f) => f.value), "Luigi");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.$eval(FELD, (f) => f.value), "");
  // Strg+D → EOF (karton)
  await strg(page, "KeyD");
  assert.equal(await warteEingabeOderEnde(page), "ende");
  assert.equal(await konsolenAusgabe(page), "Name? Hallo Luigi!\nZahl? doppelt: 42\nEOF\n");
  assert.equal(await ausgabeAusEreignissen(page), "Name? Hallo Luigi!\nZahl? doppelt: 42\nEOF\n");
  const e = await echos(page);
  assert.deepEqual(e.map((x) => [x.text.trim() && !x.eof ? x.text : "EOF", x.eof]), [["Luigi", false], ["21", false], ["EOF", true]]);
  // Echo steht direkt hinter der Aufforderung (gleicher Ausgabeblock, gleiche Zeile)
  const zeile = await page.$eval(S.echo, (s) => s.parentElement.textContent.split("\n")[0]);
  assert.equal(zeile, "Name? Luigi");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
  assert.equal(await formSichtbar(page), false, "Eingabezeile verschwindet nach dem Lauf");
});

e2e("„Ende“-Knopf sendet EOF (danach sofort karton ohne neue Anfrage); ungültige Zahl → TypAnanas", async ({ page, oeffne }, t) => {
  if (!(await vorbereiten(page, oeffne, t))) return;
  // EOF per Knopf; ein weiteres lies() nach EOF fragt nicht erneut, sondern liefert wieder karton (EINGABE.md §1)
  await setzeCode(page, 'margherita a = Bestellannahme.lies();\nBote.sage(("a=" + a));\nmargherita b = Bestellannahme.lies();\nBote.sage(("b=" + b));');
  await ereignisseLeeren(page);
  await strg(page, "Enter");
  assert.equal(await warteEingabeOderEnde(page), "eingabe");
  await page.click('[data-testid="konsole-eingabe-eof"]');
  assert.equal(await warteEingabeOderEnde(page), "ende");
  assert.equal(await konsolenAusgabe(page), "a=karton\nb=karton\n");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
  // ungültige Zahl
  await setzeCode(page, 'salami z = Bestellannahme.frageZahl(("Zahl? "));\nBote.sage(("z=" + z));');
  await strg(page, "Enter");
  assert.equal(await warteEingabeOderEnde(page), "eingabe");
  await sendeEingabe(page, "keine Zahl");
  assert.equal(await warteEingabeOderEnde(page), "ende");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[1]);
  const m = (await konsolenMeldungen(page)).find((x) => /k-fehler/.test(x.klasse));
  assert.match(m.text, /TypAnanas: 'keine Zahl' ist keine Zahl/);
  assert.equal(await konsolenAusgabe(page), "Zahl? ");
});

e2e("Abbrechen während des Wartens auf Eingabe (Knopf und Esc)", async ({ page, oeffne }, t) => {
  if (!(await vorbereiten(page, oeffne, t))) return;
  await setzeCode(page, 'Bote.schreibe(("Warte … "));\nmargherita a = Bestellannahme.lies();\nBote.sage(("nie: " + a));');
  for (const weg of ["knopf", "esc"]) {
    await strg(page, "Enter");
    assert.equal(await warteEingabeOderEnde(page), "eingabe");
    if (weg === "knopf") await page.click("#knopf-abbrechen");
    else { await page.focus(FELD); await page.keyboard.press("Escape"); }
    await warteLaufEnde(page, 5000);
    assert.equal((await exitBadge(page)).text, "abgebrochen", weg);
    assert.equal(await formSichtbar(page), false, weg + ": Eingabezeile weg");
    assert.doesNotMatch(await konsolenAusgabe(page), /nie:/);
  }
  // danach normal weiter
  await setzeCode(page, 'Bote.sage((Bestellannahme.lies()));');
  await backenInteraktiv(page, ["frisch"]);
  assert.equal(await konsolenAusgabe(page), "frisch\n");
});

e2e("Zeitlimit (10 s) ruht, solange auf Eingabe gewartet wird", { timeout: 40_000 }, async ({ page, oeffne }, t) => {
  if (!(await vorbereiten(page, oeffne, t))) return;
  await setzeCode(page, 'Bote.schreibe(("Bereit? "));\nmargherita a = Bestellannahme.lies();\nBote.sage(("los: " + a));');
  await strg(page, "Enter");
  assert.equal(await warteEingabeOderEnde(page), "eingabe");
  await schlafe(11_000); // länger als das Wand-Zeitlimit
  assert.equal(await formSichtbar(page), true, "Eingabezeile wartet noch");
  assert.match((await exitBadge(page)).text, /im Ofen|wartet/, "kein Zeitlimit beim Warten");
  assert.ok(!(await konsolenMeldungen(page)).some((m) => /Zeitlimit/.test(m.text)), "keine Zeitlimit-Meldung");
  await sendeEingabe(page, "jetzt");
  assert.equal(await warteEingabeOderEnde(page), "ende");
  assert.equal(await konsolenAusgabe(page), "Bereit? los: jetzt\n");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
});

e2e("Bote.schreibe ohne Umbruch und Bote.leeren() leert die Konsole", async ({ page, oeffne }, t) => {
  if (!(await vorbereiten(page, oeffne, t))) return;
  await setzeCode(page, [
    'Bote.schreibe(("a"));', 'Bote.schreibe(("b"));', 'Bote.sage(("c"));', 'Bote.sage(("weg"));',
    "Bote.leeren();", 'Bote.schreibe(("[x]"));', 'Bote.schreibe(("[o]"));', 'Bote.sage(("!"));', 'Bote.fehler(("f"));',
  ].join("\n"));
  await ereignisseLeeren(page);
  await strg(page, "Enter");
  await warteLaufEnde(page);
  assert.equal(await ausgabeAusEreignissen(page), "abc\nweg\n«leeren»\n[x][o]!\nf\n");
  assert.equal(await konsolenAusgabe(page), "[x][o]!\nf\n");
  assert.doesNotMatch(await page.$eval("#konsole-inhalt", (e) => e.textContent), /weg/);
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
});

e2e("Spiel komplett durchspielen: Eingaben aus .eingabe tippen → Ausgabe == .erwartet, Echo sichtbar", { timeout: 60_000 }, async ({ page, oeffne }, t) => {
  if (!(await vorbereiten(page, oeffne, t))) return;
  const spiele = beispieleAusManifesten().liste.filter((b) => (b.interaktiv || eingabeZeilen(b)) && b.exitCode === 0);
  assert.ok(spiele.length, "mindestens ein interaktives Spiel");
  // bevorzugt Zahlenraten (kurz), sonst das erste
  const b = spiele.find((x) => /zahlenraten/.test(x.datei)) || spiele[0];
  const zeilen = eingabeZeilen(b);
  assert.ok(zeilen && zeilen.length, "Eingabedatei für " + b.datei);
  await zeigePanelTab(page, "beispiele");
  await page.waitForSelector(S.beispielKarte);
  await page.$$eval(S.beispielKarte, (k, titel) => k.find((x) => x.querySelector(".bsp-titel").textContent === titel).click(), b.titel);
  await warteAufTab(page, b.datei.split("/").pop());
  const { gesendet } = await backenInteraktiv(page, zeilen, { tippen: true, timeout: 45_000 });
  assert.equal(gesendet, zeilen.length);
  assert.equal(await ausgabeAusEreignissen(page), b.erwartetText);
  assert.equal(await konsolenAusgabe(page), nachLetztemLeeren(b.erwartetText));
  const e = (await echos(page)).filter((x) => !x.eof).map((x) => x.text);
  assert.ok(e.length > 0, "Echo sichtbar");
  assert.deepEqual(e, zeilen.slice(zeilen.length - e.length));
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[b.exitCode]);
});

// ---------------------------------------------------------------- Fallback ohne Cross-Origin-Isolation
e2e("Fallback ohne crossOriginIsolated: Eingaben vorab eintragen → Lauf mit diesen Eingaben", { isolation: false }, async ({ page, oeffne }, t) => {
  if (!(await vorbereiten(page, oeffne, t))) return;
  assert.equal(await page.evaluate(() => window.crossOriginIsolated), false);
  await setzeCode(page, DIALOG);
  await ereignisseLeeren(page);
  await strg(page, "Enter");
  await page.waitForSelector('[data-testid="dialog-eingaben"][open]');
  assert.match(await page.$eval('[data-testid="dialog-eingaben"]', (d) => d.textContent), /vorab/i, "deutlich gekennzeichnet");
  await page.focus('[data-testid="eingaben-text"]');
  await page.keyboard.type("Mario");
  await page.keyboard.down("Shift"); await page.keyboard.press("Enter"); await page.keyboard.up("Shift");
  await page.$eval('[data-testid="eingaben-text"]', (f) => { f.value = "Mario\n7"; });
  await page.click('[data-testid="eingaben-backen"]');
  await warteLaufEnde(page);
  assert.equal(await ausgabeAusEreignissen(page), "Name? Hallo Mario!\nZahl? doppelt: 14\nEOF\n");
  assert.equal(await konsolenAusgabe(page), "Name? Hallo Mario!\nZahl? doppelt: 14\nEOF\n");
  assert.equal(await formSichtbar(page), false, "keine Live-Eingabezeile im Fallback");
  assert.ok((await konsolenMeldungen(page)).some((m) => /Vorab eingetragene Eingaben: 2/.test(m.text)));
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);

  // Abbrechen im Dialog → kein Lauf
  await page.click("#konsole-leeren");
  await strg(page, "Enter");
  await page.waitForSelector('[data-testid="dialog-eingaben"][open]');
  assert.equal(await page.$eval('[data-testid="eingaben-text"]', (f) => f.value), "Mario\n7", "Eingaben pro Tab gemerkt");
  await page.click('[data-testid="eingaben-abbrechen"]');
  await schlafe(200);
  assert.equal(await page.$eval("#exit-badge", (b) => b.hidden), true, "kein Lauf nach Abbrechen");

  // „Ohne Eingaben“ → sofort EOF
  await strg(page, "Enter");
  await page.waitForSelector('[data-testid="dialog-eingaben"][open]');
  await page.click('[data-testid="eingaben-ohne"]');
  await warteLaufEnde(page);
  // lies() → karton, frageZahl() → karton (EOF); karton * 2 ist dann ein Laufzeitfehler
  assert.match(await konsolenAusgabe(page), /^Name\? Hallo karton!\nZahl\? /);
  assert.ok((await konsolenMeldungen(page)).some((m) => /Ohne Eingaben gebacken/.test(m.text)));
});

e2e("Fallback ohne crossOriginIsolated: interaktives Spiel mit vorab eingetragenen Eingaben", { isolation: false, timeout: 60_000 }, async ({ page, oeffne }, t) => {
  if (!(await vorbereiten(page, oeffne, t))) return;
  const b = beispieleAusManifesten().liste.find((x) => eingabeZeilen(x) && x.exitCode === 0);
  assert.ok(b);
  const zeilen = eingabeZeilen(b);
  await zeigePanelTab(page, "beispiele");
  await page.waitForSelector(S.beispielKarte);
  await page.$$eval(S.beispielKarte, (k, titel) => k.find((x) => x.querySelector(".bsp-titel").textContent === titel).click(), b.titel);
  await warteAufTab(page, b.datei.split("/").pop());
  await ereignisseLeeren(page);
  await page.focus("#editor .cm-content");
  await strg(page, "Enter");
  await page.waitForSelector('[data-testid="dialog-eingaben"][open]');
  await page.$eval('[data-testid="eingaben-text"]', (f, v) => { f.value = v; }, zeilen.join("\n"));
  await page.click('[data-testid="eingaben-backen"]');
  await warteLaufEnde(page, 45_000);
  assert.equal(await ausgabeAusEreignissen(page), b.erwartetText);
  assert.equal(await konsolenAusgabe(page), nachLetztemLeeren(b.erwartetText));
});
