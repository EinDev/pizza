// Interaktive Ein-/Ausgabe (EINGABE.md): Eingabezeile, Echo, Strg+D, Abbrechen beim Warten,
// Bote.schreibe/leeren, ein Spiel komplett durchspielen; ohne crossOriginIsolated klare Meldung statt Start.
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
  const b = spiele.find((x) => /zahlenraten/.test(x.id)) || spiele[0];
  const zeilen = eingabeZeilen(b);
  assert.ok(zeilen && zeilen.length, "Eingabedatei für " + b.id);
  await zeigePanelTab(page, "beispiele");
  await page.waitForSelector(S.beispielKarte);
  await page.$$eval(S.beispielKarte, (k, titel) => k.find((x) => x.querySelector(".bsp-titel").textContent === titel).click(), b.titel);
  await warteAufTab(page, b.hauptdatei);
  const { gesendet } = await backenInteraktiv(page, zeilen, { tippen: true, timeout: 45_000 });
  assert.equal(gesendet, zeilen.length);
  assert.equal(await ausgabeAusEreignissen(page), b.erwartetText);
  assert.equal(await konsolenAusgabe(page), nachLetztemLeeren(b.erwartetText));
  const e = (await echos(page)).filter((x) => !x.eof).map((x) => x.text);
  assert.ok(e.length > 0, "Echo sichtbar");
  assert.deepEqual(e, zeilen.slice(zeilen.length - e.length));
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[b.exitCode]);
});

// ---------------------------------------------------------------- Ohne Cross-Origin-Isolation (kein Ersatzmodus mehr)
// Seit 0f5cd55: Programme mit Bestellannahme. oder neu Theke( starten ohne Isolation NICHT, sondern melden das klar.
const OHNE_ISOLATION = /Dieser Browser erlaubt keine interaktive Eingabe \(Cross-Origin-Isolation fehlt\)\. Das Programm wurde nicht gestartet\./;

async function backenOhneIsolation(page, code) {
  await setzeCode(page, code);
  await ereignisseLeeren(page);
  await page.click("#konsole-leeren");
  await page.focus("#editor .cm-content");
  await strg(page, "Enter");
  await page.waitForFunction(() => /Cross-Origin-Isolation|gegessen|Ananas|Fehler/.test(document.getElementById("konsole-inhalt").textContent + " " + document.getElementById("exit-badge").textContent), { timeout: 10_000 });
  await schlafe(300); // ein (unerwünschter) Worker-Start hätte jetzt Ereignisse geliefert
}

for (const [art, code] of [
  ["Eingabe-Programm (Bestellannahme)", DIALOG],
  ["Theke-Programm (neu Theke)", 'Theke theke = neu Theke("Ohne Isolation", breite: 300, hoehe: 160);\ntheke.zeige(neu Stapel([neu Schild("Hallo")]));\ntheke.bediene();\nBote.sage(("nie"));'],
]) {
  e2e(`Ohne crossOriginIsolated: ${art} startet nicht, klare Meldung`, { isolation: false }, async ({ page, oeffne }) => {
    await oeffne();
    assert.equal(await page.evaluate(() => window.crossOriginIsolated), false);
    await backenOhneIsolation(page, code);
    const text = await page.$eval("#konsole-inhalt", (e) => e.textContent);
    assert.match(text, OHNE_ISOLATION, "Meldung in der Konsole: " + text.slice(0, 200));
    const ev = await page.evaluate(() => (window.__ereignisse || []).filter((e) => ["ausgabe", "eingabe-anfrage", "ui", "ui-warte", "ende", "motor"].includes(e.typ)));
    assert.deepEqual(ev, [], "kein Worker-Lauf gestartet");
    assert.equal(await konsolenAusgabe(page), "", "keine Programmausgabe");
    assert.equal(await page.$eval(FORM, (f) => f.hidden), true, "keine Eingabezeile");
    assert.equal(await page.$eval("#vorschau", (v) => v.hidden), true, "kein Vorschaufenster");
    assert.equal(await page.$("#dialog-eingaben[open]"), null, "kein Vorab-Dialog mehr");
    assert.equal(await page.evaluate(() => document.body.classList.contains("laeuft")), false, "UI nicht im Lauf-Zustand");
    assert.equal(await page.$eval("#knopf-backen", (k) => k.hidden), false, "Backen bleibt bedienbar");
  });
}

e2e("Ohne crossOriginIsolated: normales Programm läuft wie gewohnt", { isolation: false }, async ({ page, oeffne }) => {
  await oeffne();
  assert.equal(await page.evaluate(() => window.crossOriginIsolated), false);
  await setzeCode(page, 'Bote.sage(("läuft auch ohne Isolation"));\n// Erwähnung im Kommentar: Bestellannahme ist hier kein Aufruf');
  await ereignisseLeeren(page);
  await strg(page, "Enter");
  await warteLaufEnde(page);
  assert.equal(await konsolenAusgabe(page), "läuft auch ohne Isolation\n");
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
  assert.doesNotMatch(await page.$eval("#konsole-inhalt", (e) => e.textContent), /Cross-Origin-Isolation/);
});
