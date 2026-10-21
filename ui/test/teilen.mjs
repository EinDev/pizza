import assert from "node:assert/strict";
import { verpacke, entpacke, appTitel } from "../src/teilen.js";

const code = 'Bote.sage(("Hallo"));\n// { "pizza": "teilen" }';
const doc = verpacke("zahlenraten.pizza", code);
assert.deepEqual(JSON.parse(doc), { pizza: "teilen", v: 1, name: "zahlenraten.pizza", code });
assert.deepEqual(entpacke(doc), { name: "zahlenraten.pizza", code });
// Alte Links: nur Code
assert.deepEqual(entpacke(code), { name: null, code });
assert.deepEqual(entpacke(""), { name: null, code: "" });
assert.deepEqual(entpacke("{ kein json"), { name: null, code: "{ kein json" });
assert.deepEqual(entpacke('{"code":"x"}'), { name: null, code: '{"code":"x"}' }, "fremdes JSON bleibt Code");
// Namen säubern
assert.equal(JSON.parse(verpacke("  a\nb\u0007.pizza ", "")).name, "a b .pizza");
assert.equal(JSON.parse(verpacke("", "")).name, "unbenannt.pizza");
assert.equal(entpacke(JSON.stringify({ pizza: "teilen", v: 1, name: 5, code: "x" })).name, null);
assert.equal(entpacke(JSON.stringify({ pizza: "teilen", v: 1, name: "x".repeat(200), code: "x" })).name.length, 80);
// Seitentitel
assert.equal(appTitel("zahlenraten.pizza"), "zahlenraten");
assert.equal(appTitel("Mein Spiel"), "Mein Spiel");
assert.equal(appTitel(".pizza"), null);
assert.equal(appTitel(null), null);
console.log("Teilen-Format ok");
