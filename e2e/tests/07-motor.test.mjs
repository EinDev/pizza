// Motor-Umschalter (WASM.md §4): auto / wasm / interpreter – gleiche Ausgabe in allen Modi.
import assert from "node:assert/strict";
import {
  e2e, setzeCode, warteLaufEnde, exitBadge, konsolenAusgabe, strg, bereit, schlafe,
  ereignisseLeeren, ausgabeAusEreignissen, beispieleAusManifesten, eingabeZeilen, backenInteraktiv, hawaiiOverlayOffen, backenTheke, thekeEreignisse,
} from "../hilfen.mjs";

const WAHL = '[data-testid="motor-umschalter"], #motor-wahl';

const SNIPPETS = [
  { name: "Ausgabe", code: 'Bote.sage(("eins"));\nBote.fehler(("zwei"));\nsalami s = 0;\nfür (salami i : [1 .. 100]) { s += i; }\nBote.sage((s));', exit: 0 },
  { name: "Syntaxfehler", code: "Bote.sage((1 +));", exit: 2 },
  { name: "Ananas", code: 'Bote.sage(("a"));\nwirf neu StreitAnanas(("weg"));', exit: 1 },
  { name: "Schrittlimit", code: "salami n = 0;\nsolange (ja) { n += 1; }", exit: 3 },
  { name: "Hawaii", code: "hawaii h = 1;", exit: 39 },
];

async function motorVerfuegbar(page) {
  return page.evaluate((sel) => {
    const w = document.querySelector(sel);
    if (!w) return null;
    return Object.fromEntries([...w.options].map((o) => [o.value, !o.disabled]));
  }, WAHL);
}

async function setzeMotor(page, m) {
  await page.select(WAHL, m);
  assert.equal(await page.$eval(WAHL, (w) => w.value), m);
}

/** Backt und liefert Ausgabe, Exit-Text, gemeldeten Motor. */
async function lauf(page, zeilen = [], theke = null) {
  await ereignisseLeeren(page);
  if (theke) await backenTheke(page, theke, { timeout: 30_000 });
  else await backenInteraktiv(page, zeilen, { timeout: 30_000 });
  const r = {
    ausgabe: await ausgabeAusEreignissen(page),
    konsole: await konsolenAusgabe(page),
    exit: (await exitBadge(page)).text,
    motor: await page.evaluate(() => {
      const ev = (window.__ereignisse || []).filter((e) => e.typ === "motor" || e.typ === "ende");
      return ev.map((e) => e.motor).filter(Boolean).pop() || null;
    }),
    // Motor-Ereignis(se) mit grund (warum ggf. auf den Interpreter zurückgefallen wurde)
    motorInfo: await page.evaluate(() => JSON.stringify((window.__ereignisse || []).filter((e) => e.typ === "motor" || e.typ === "faehigkeiten"))),
  };
  r.overlay = await hawaiiOverlayOffen(page); // soll es nicht mehr geben
  return r;
}

e2e("Motor-Umschalter vorhanden, Auswahl wird gemerkt", async ({ page, oeffne }, t) => {
  await oeffne();
  const v = await motorVerfuegbar(page);
  if (!v) return t.skip("Motor-Umschalter noch nicht in der UI");
  assert.deepEqual(Object.keys(v).sort(), ["auto", "interpreter", "wasm"]);
  await setzeMotor(page, "interpreter");
  await page.reload({ waitUntil: "load" });
  await bereit(page);
  assert.equal(await page.$eval(WAHL, (w) => w.value), "interpreter", "Motor überlebt Reload");
  const badge = await page.$('[data-testid="motor-badge"]');
  assert.ok(badge, "Motor-Badge vorhanden");
});

e2e("Gleiche Ausgabe in allen Modi (Snippets: Ausgabe, Fehler, Ananas, Limit, Hawaii)", { timeout: 90_000 }, async ({ page, oeffne }, t) => {
  await oeffne();
  const v = await motorVerfuegbar(page);
  if (!v) return t.skip("Motor-Umschalter noch nicht in der UI");
  const modi = Object.entries(v).filter(([, an]) => an).map(([m]) => m);
  if (!v.wasm) t.diagnostic("Wasm-Motor nicht verfügbar (pizzaiolo.js fehlt?) – geprüft: " + modi.join(", "));
  for (const s of SNIPPETS) {
    await setzeCode(page, s.code);
    const ergebnisse = {};
    for (const m of modi) {
      await setzeMotor(page, m);
      ergebnisse[m] = await lauf(page);
    }
    const basis = ergebnisse.interpreter;
    assert.ok(basis, "Interpreter-Modus muss immer gehen");
    for (const m of modi) {
      assert.equal(ergebnisse[m].ausgabe, basis.ausgabe, `${s.name}: Ausgabe ${m} vs. interpreter`);
      assert.equal(ergebnisse[m].exit, basis.exit, `${s.name}: Exit ${m} vs. interpreter`);
      assert.equal(ergebnisse[m].overlay, false, `${s.name}: kein Hawaii-Overlay (${m})`);
    }
    if (ergebnisse.interpreter.motor) assert.equal(ergebnisse.interpreter.motor, "interpreter", "Interpreter-Modus meldet Motor interpreter");
    if (ergebnisse.wasm && ergebnisse.wasm.motor) assert.equal(ergebnisse.wasm.motor, "wasm", "Wasm-Modus fällt nie auf den Interpreter zurück");
  }
});

e2e("Gleiche Ausgabe in allen Modi für alle Beispiele (inkl. interaktiver Spiele)", { timeout: 150_000 }, async ({ page, oeffne }, t) => {
  await oeffne();
  const v = await motorVerfuegbar(page);
  if (!v) return t.skip("Motor-Umschalter noch nicht in der UI");
  const modi = Object.entries(v).filter(([, an]) => an).map(([m]) => m).filter((m) => m !== "interpreter");
  if (!modi.length) return t.skip("nur Interpreter verfügbar");
  const { liste } = beispieleAusManifesten();
  for (const b of liste) {
    const code = await page.evaluate(async (d) => (await fetch("beispiele/" + d)).text(), b.datei);
    await setzeCode(page, code.replace(/\r\n?/g, "\n"));
    for (const m of modi) {
      await t.test(`${b.datei} (${m})`, async (tt) => {
        // Küchenbrigade (SPEC §17) gibt es im Wasm noch nicht (K-100/U-64: nichtUnterstuetzt, Auto fällt auf den Interpreter
        // zurück); der reine Wasm-Modus fällt nie zurück – bis P2 (U-64) hier nur Auto prüfen.
        if (m === "wasm" && /\.brigade\s*\(/.test(code)) return tt.skip("Küchenbrigade läuft vorerst nur im Interpreter (U-64)");
        await setzeMotor(page, m);
        const r = await lauf(page, eingabeZeilen(b) || [], thekeEreignisse(b));
        assert.equal(r.ausgabe, b.erwartetText, `${m}: Ausgabe == ${b.erwartet}`);
        if (m === "wasm") assert.equal(r.motor, "wasm");
      });
    }
  }
  await schlafe(10);
});

e2e("Motor-Standard ist „Auto“ (frischer Browser, nichts gemerkt)", async ({ page, oeffne }) => {
  await oeffne();
  assert.equal(await page.$eval(WAHL, (w) => w.value), "auto");
  const v = await motorVerfuegbar(page);
  assert.equal(v.auto, true);
});

/** Wartet, bis die einmalige Fähigkeiten-Prüfung der Seite (Worker {typ:"faehigkeiten"}) angekommen ist. */
const warteFaehigkeiten = (page) => page.waitForFunction(() => (window.__ereignisse || []).some((e) => e.typ === "faehigkeiten"), { timeout: 20_000 });

e2e("Wasm-Lauf zeigt Motor-Badge „Wasm“ (Auto und explizit Wasm), Interpreter-Lauf „Interpreter“", async ({ page, oeffne }) => {
  await oeffne();
  await warteFaehigkeiten(page); // Badge-Test unabhängig vom Start-Wettlauf (eigener Test unten)
  const v = await motorVerfuegbar(page);
  assert.ok(v && v.wasm, "Wasm-Motor verfügbar (motoren.json / pizzaiolo.js)");
  const badge = () => page.$eval('[data-testid="motor-badge"]', (b) => ({ text: b.textContent, klasse: b.className, hidden: b.hidden || !b.getClientRects().length }));
  await setzeCode(page, 'Bote.sage(("ofenfrisch"));');
  for (const m of ["auto", "wasm"]) {
    await setzeMotor(page, m);
    const r = await lauf(page);
    assert.equal(r.ausgabe, "ofenfrisch\n");
    assert.equal(r.motor, "wasm", m + ": Lauf meldet Motor wasm – Motor-Ereignisse: " + r.motorInfo);
    const b = await badge();
    assert.equal(b.hidden, false, m + ": Badge sichtbar");
    assert.match(b.text, /^Wasm\b/, m + ": Badge-Text „" + b.text + "“");
  }
  await setzeMotor(page, "interpreter");
  const r = await lauf(page);
  assert.equal(r.motor, "interpreter");
  assert.match((await badge()).text, /Interpreter/i);
});

// Regression: Wird direkt nach dem Laden gebacken, bevor die Fähigkeiten-Prüfung fertig ist, fiel „Auto“
// still auf den Interpreter zurück (grund „Wasm-Compiler (pizzaiolo.js) ist noch nicht verfügbar“), obwohl Wasm geht.
// Die Prüfung wird hier künstlich verzögert, damit der Wettlauf deterministisch eintritt.
e2e("Erster Lauf direkt nach dem Laden nutzt in „Auto“ Wasm (Fähigkeiten-Prüfung noch unterwegs)", {
  vorLaden: () => {
    const W = window.Worker;
    window.Worker = class extends W {
      constructor(...a) {
        super(...a);
        // Antwort {typ:"faehigkeiten"} 1,5 s zurückhalten (vor onmessage der UI abfangen, später erneut zustellen)
        this.addEventListener("message", (m) => {
          if (m.data && m.data.typ === "faehigkeiten" && !m.verzoegert) {
            m.stopImmediatePropagation();
            const kopie = new MessageEvent("message", { data: m.data });
            kopie.verzoegert = true;
            setTimeout(() => this.dispatchEvent(kopie), 1500);
          }
        });
      }
    };
  },
}, async ({ page, oeffne }) => {
  await oeffne();
  assert.equal(await page.$eval(WAHL, (w) => w.value), "auto");
  await setzeCode(page, 'Bote.sage(("sofort gebacken"));');
  const r = await lauf(page);
  assert.equal(r.ausgabe, "sofort gebacken\n");
  assert.equal(r.motor, "wasm", "Auto nutzt Wasm auch beim ersten Lauf – Motor-Ereignisse: " + r.motorInfo);
});
