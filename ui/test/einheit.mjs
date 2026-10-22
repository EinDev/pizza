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
console.log("alle Tests ok");
