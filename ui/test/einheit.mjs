// Schnelltests für DOM-freie Module: node test/einheit.mjs
import assert from "node:assert/strict";
import { inlineParsen, blockParsen, sichereUrl } from "../src/markdown.js";
import { codeKodieren, codeDekodieren, codeAusHash } from "../src/teilen.js";
import { pizzaSprache } from "../src/sprache.js";
import { StringStream } from "@codemirror/language";

// Markdown
assert.equal(sichereUrl("javascript:alert(1)"), null);
assert.equal(sichereUrl(" JavaScript:alert(1)"), null);
assert.equal(sichereUrl("data:text/html,x"), null);
assert.equal(sichereUrl("#pizza-literale"), "#pizza-literale");
assert.equal(sichereUrl("https://example.org"), "https://example.org");
const k = inlineParsen("a **fett `x*y`** *kursiv* `<img onerror=x>` [L](javascript:1) [M](#a)");
assert.deepEqual(k.map((n) => n.typ), ["text", "fett", "text", "kursiv", "text", "code", "text", "link", "text", "link"]);
assert.equal(k[7].url, null);
assert.equal(k[9].url, "#a");
assert.equal(k[5].text, "<img onerror=x>");
const b = blockParsen("Absatz\nzwei\n\n- eins\n- zwei **f**\n\nEnde");
assert.deepEqual(b.map((x) => x.typ), ["absatz", "liste", "absatz"]);
assert.equal(b[1].punkte.length, 2);

// Teilen
const code = "Pizza p = ((Tomate, Käse));\n// 🍕 " + "x".repeat(70000);
const w = await codeKodieren(code);
assert.ok(w.startsWith("z."));
assert.equal(await codeDekodieren(w), code);
assert.equal(await codeDekodieren("u." + Buffer.from("hallo ä").toString("base64url")), "hallo ä");
assert.equal(codeAusHash("#code=z.abc"), "z.abc");
assert.equal(await codeDekodieren("z.!!!"), null);

// Tokenizer
const sp = pizzaSprache.streamParser;
function toks(zeile) {
  const st = sp.startState(4);
  const s = new StringStream(zeile, 4, 4);
  const out = [];
  while (!s.eol()) { const a = s.pos; s.start = a; const t = sp.token(s, st); out.push([zeile.slice(a, s.pos), t]); }
  return out.filter(([, t]) => t);
}
const t1 = toks('Pizza p = ((Tomate, Käse)) + Salami; salami x = ((x + 1)); Dauer d = 90s; @Nach(Tomate) "a\\"b" // k');
const m = Object.fromEntries(t1.map(([a, b]) => [a, b]));
console.log(t1.map(([a, b]) => a + ":" + b).join("  "));
assert.equal(m["Pizza"], "typ");
assert.equal(m["Tomate"], "belag");
assert.equal(m["90s"], "dauer");
assert.equal(m["@Nach"], "annotation");
assert.equal(t1.filter(([a, b]) => b === "pizzaKlammer").length, 2);
assert.ok(toks("StreitAnanas a").some(([a, b]) => a === "StreitAnanas" && b === "ananas"));
assert.ok(toks("((  ))").every(([, b]) => b === "pizzaKlammer"));
console.log("alle Tests ok");
