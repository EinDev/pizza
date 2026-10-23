// Schnelltests für DOM-freie Module: node test/einheit.mjs
import assert from "node:assert/strict";
import { inlineParsen, blockParsen, sichereUrl } from "../src/markdown.js";
import { pizzaSprache } from "../src/sprache.js";
import { StringStream } from "@codemirror/language";

// Markdown
assert.equal(sichereUrl("javascript:alert(1)"), null);
assert.equal(sichereUrl(" JavaScript:alert(1)"), null);
assert.equal(sichereUrl("data:text/html,x"), null);
assert.equal(sichereUrl("#pf-schieb"), "#pf-schieb");
assert.equal(sichereUrl("https://example.org"), "https://example.org");
const k = inlineParsen("a **fett `x*y`** *kursiv* `<img onerror=x>` [L](javascript:1) [M](#a)");
assert.deepEqual(k.map((n) => n.typ), ["text", "fett", "text", "kursiv", "text", "code", "text", "link", "text", "link"]);
assert.equal(k[7].url, null);
assert.equal(k[9].url, "#a");
assert.equal(k[5].text, "<img onerror=x>");
const b = blockParsen("Absatz\nzwei\n\n- eins\n- zwei **f**\n\nEnde");
assert.deepEqual(b.map((x) => x.typ), ["absatz", "liste", "absatz"]);
assert.equal(b[1].punkte.length, 2);

// Tokenizer
const sp = pizzaSprache.streamParser;
function toks(zeile) {
  const st = sp.startState(4);
  const s = new StringStream(zeile, 4, 4);
  const out = [];
  while (!s.eol()) { const a = s.pos; s.start = a; const t = sp.token(s, st); out.push([zeile.slice(a, s.pos), t]); }
  return out.filter(([, t]) => t);
}
const t1 = toks('Pizza p = neu Pizza(); salami x = ((x + 1)); Dauer d = 90s; @Kühlschrank(haltbar: 3d) Bote.sage((Tomate)); "a\\"b" // k');
const m = Object.fromEntries(t1.map(([a, b]) => [a, b]));
console.log(t1.map(([a, b]) => a + ":" + b).join("  "));
assert.equal(m["Pizza"], "klasse");          // kein eingebauter Typ mehr – ein gewöhnlicher Klassenname (K-105)
assert.equal(m["Tomate"], "klasse");         // großgeschriebener Name, kein Belag
assert.equal(m["salami"], "typ");
assert.equal(m["90s"], "dauer");
assert.equal(m["@Kühlschrank"], "annotation");
assert.equal(m["Bote"], "builtin");
assert.equal(m["sage"], "methode");
assert.ok(toks("StreitAnanas a").some(([a, b]) => a === "StreitAnanas" && b === "ananas"));
assert.ok(toks("((  ))").every(([, b]) => b === "klammer"));   // doppelte Klammern sind nur Klammern
assert.ok(!toks("belag X auf Pizza { }").some(([, b]) => b === "keyword"));   // belag/auf nicht mehr reserviert
// Autovervollständigung/Highlighting: Wortlisten passen zum Interpreter und zu SPEC §16 (bis v7)
{
  const { createRequire } = await import("node:module");
  const PL = createRequire(import.meta.url)("../../site/js/pizza.js");
  const W = await import("../src/woerter.js");
  // Komponenten nach v1 kommen wie in der App (main.js) aus dem Herd-Schema – keine UI-Änderung je Komponente (HERD.md §9)
  const fs = await import("node:fs");
  assert.ok(W.herdSchemaErgaenzen(JSON.parse(fs.readFileSync(new URL("../../site/js/herd/schema.json", import.meta.url), "utf8"))));
  for (const t of PL.TYPEN) assert.ok(W.TYPEN.has(t), "Typ fehlt in woerter.js: " + t);
  for (const b of PL.BUILTINS) assert.ok(W.BUILTINS.has(b), "Builtin fehlt in woerter.js: " + b);
  assert.deepEqual(W.STIL_SCHLUESSEL, Object.keys(PL.intern.UI_STIL), "Stil-Schlüssel wie im Interpreter");
  for (const [k, v] of Object.entries(PL.intern.UI_STIL)) if (Array.isArray(v)) assert.deepEqual(W.STIL_WERTE[k], v, "Stil-Werte " + k);
  for (const m of ["log", "log10", "log2", "exp", "E", "potenz"]) assert.ok(W.MITGLIEDER.Mathe.includes(m), "Mathe." + m);
  assert.deepEqual(W.MITGLIEDER.Zettel, ["aus"]);
  for (const m of ["wert", "setze", "binde", "bindeStil", "marke", "namensraum", "beiTaste", "setzeOptionen", "klappbar", "zu", "waehle"])
    assert.ok(W.ALLE_METHODEN.includes(m), "Methode " + m);
  for (const z of ["Zettel", "Auswahl", "Tastatur", "Vorratskammer"]) assert.ok(W.TYPEN.has(z), z);
  const v = (s) => { const r = W.textArgumentVorschlaege(s); return r && { von: r.von, liste: r.liste }; };
  assert.deepEqual(v('r.stil("sen').liste, W.STIL_SCHLUESSEL);
  assert.equal(v('r.stil("sen').von, 'r.stil("'.length);
  assert.ok(v('t.bindeStil("').liste.includes("spalten"));
  assert.deepEqual(v('r.stil("senkrecht", "ob').liste, ["oben", "mitte", "unten", "strecken"]);
  assert.ok(v('s.binde("ma').liste.includes("marke"));
  assert.equal(v('stil("breite", "'), null);
  assert.equal(v('Bote.sage(("hallo'), null);
  // Highlighting: Theke-/v7-Namen sind eingebaute Typen (ohne geladenen Interpreter)
  assert.equal(Object.fromEntries(toks("Zettel z = Zettel.aus(() -> 1); Auswahl a; Tastatur t;"))["Auswahl"], "typ");
  assert.equal(toks("Zettel.aus")[0][1], "typ");
  // Herd-Schema (H-K0): Lesefelder bekommen Getter, aber keinen Setter in der Vervollständigung
  assert.ok(W.herdSchemaErgaenzen({ komponenten: [{ name: "Fuehltest", felder: [
    { name: "kontaktZahlH0", typ: "zahl", lesen: true }, { name: "grenzeH0", typ: "zahl-liste" }] }] }));
  assert.ok(W.TYPEN.has("Fuehltest") && W.ALLE_METHODEN.includes("fuehltest"));
  assert.ok(W.ALLE_METHODEN.includes("kontaktZahlH0") && !W.ALLE_METHODEN.includes("setzeKontaktZahlH0"));
  assert.ok(W.ALLE_METHODEN.includes("grenzeH0") && W.ALLE_METHODEN.includes("setzeGrenzeH0"));
}
console.log("alle Tests ok");
