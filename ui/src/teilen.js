// Format eines geteilten Skripts (ein Dokument im internen Hastebin über /api/teilen):
//   {"pizza":"teilen","v":1,"name":"<Tab-Name>","code":"<Quelltext>"}
// Der Tab-Name wird Seitentitel des App-Links (Konsolen-Apps) und Name des Tabs beim Öffnen des Code-Links.
// Ältere Links enthalten nur den rohen Code – alles, was nicht genau diese Hülle ist, gilt weiter als Code.
const NAME_MAX = 80;

function saeubereName(name) {
  if (typeof name !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const n = name.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, NAME_MAX);
  return n || null;
}

/** Text für POST /api/teilen. */
export function verpacke(name, code) {
  return JSON.stringify({ pizza: "teilen", v: 1, name: saeubereName(name) || "unbenannt.pizza", code: String(code) });
}

/** Text von GET /api/teilen/<key> → { name: string|null, code }. */
export function entpacke(text) {
  const t = String(text);
  if (t.startsWith("{")) {
    try {
      const d = JSON.parse(t);
      if (d && d.pizza === "teilen" && typeof d.code === "string") return { name: saeubereName(d.name), code: d.code };
    } catch (e) { /* kein JSON → roher Code */ }
  }
  return { name: null, code: t };
}

/** Seitentitel einer App aus dem Tab-Namen: „zahlenraten.pizza“ → „zahlenraten“. */
export function appTitel(name) {
  const n = saeubereName(name);
  if (!n) return null;
  return n.replace(/\.pizza$/i, "").trim() || null;
}
