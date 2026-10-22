"use strict";
// API-Form laut ARCHITEKTUR §1. Fälle mit `api(lang)` laufen direkt im Hauptthread,
// Fälle mit `code` laufen wie üblich im Worker.
const { P, F } = require("../lib/helfer");
const A = "API (ARCHITEKTUR §1)";

const KEYWORDS = `paket import klasse rezeptur rohling calzone quattrostagioni
erbt erfüllt speisekarte familienrezept geheimrezept tiefkühl gebacken
leer neu dies unten serviere falls sonst für solange wähle fall standard
probier verbrannt rand wirf wirft abbrechen weiter ja nein karton ofen roh`.split(/\s+/);

const TYPEN = ["salami", "funghi", "margherita", "diavolo", "Dauer", "Blech", "Speisekarte",
  "Teig", "Lieferung", "Zustellung", "Reste", "Rohling", "hawaii"];
const BUILTINS = ["Bote", "Uhr", "Mathe", "Zufall", "Spiegel", "teig", "bestelle", "schieb", "zwischenstand"];
// Reihenfolge verbindlich (SPEC §8, K-105): 16 Einträge, die Wasm-Laufzeit spiegelt die Klassenindizes
const ANANAS = ["Ananas", "GeprüfteAnanas", "VerbranntAnanas", "LieferAnanas", "LaufzeitAnanas", "StreitAnanas",
  "RechenAnanas", "LeererKartonAnanas", "RohlingAnanas", "GebackenAnanas", "TypAnanas", "KeinStückAnanas",
  "ZugriffsAnanas", "ZugeklapptAnanas", "UnbekanntePizzaAnanas", "KüchenAnanas"];

function fehlt(liste, soll) {
  if (!Array.isArray(liste)) return "kein Array";
  const f = soll.filter((x) => !liste.includes(x));
  return f.length ? "fehlt: " + f.join(", ") : undefined;
}

function api(p, name, fn) {
  return { p, name, api: fn };
}

module.exports = [
  api(A, "version === \"3.1.0\"", (L) => (L.version === "3.1.0" ? undefined : "version = " + JSON.stringify(L.version))),
  api(A, "KEYWORDS enthält alle Keywords aus SPEC §1", (L) => fehlt(L.KEYWORDS, KEYWORDS)),
  api(A, "KEYWORDS enthält nicht 'pizza' (§1: kein Keyword mehr)", (L) =>
    Array.isArray(L.KEYWORDS) && !L.KEYWORDS.includes("pizza") ? undefined : "'pizza' ist in KEYWORDS"),
  api(A, "KEYWORDS enthält keine Builtin-Funktionen (§1)", (L) => {
    const x = (L.KEYWORDS || []).filter((k) => ["teig", "bestelle", "schieb", "zwischenstand"].includes(k));
    return x.length ? "Builtins als Keyword: " + x.join(", ") : undefined;
  }),
  api(A, "TYPEN enthält eingebaute Typnamen inkl. hawaii", (L) => fehlt(L.TYPEN, TYPEN)),
  api(A, "BUILTINS enthält globale Objekte/Funktionen", (L) => fehlt(L.BUILTINS, BUILTINS)),
  api(A, "ANANAS enthält alle Klassen des Baums (§8)", (L) => fehlt(L.ANANAS, ANANAS)),
  api(A, "ANANAS in verbindlicher Reihenfolge, genau 16 Einträge (§8, K-105)", (L) =>
    Array.isArray(L.ANANAS) && JSON.stringify(L.ANANAS) === JSON.stringify(ANANAS) ? undefined : "ANANAS = " + JSON.stringify(L.ANANAS)),
  api(A, "parse(ok) → { ok: true, ast }", (L) => {
    const r = L.parse('Bote.sage(("Hallo"));');
    return r && r.ok === true && r.ast ? undefined : "Ergebnis: " + JSON.stringify(r).slice(0, 200);
  }),
  api(A, "parse(Fehler) → { ok: false, fehler: {code, text, zeile, spalte} } mit Zeile", (L) => {
    const r = L.parse("Bote.sage((1));\nsalami x = ;\n");
    if (!r || r.ok !== false || !r.fehler) return "Ergebnis: " + JSON.stringify(r).slice(0, 200);
    const f = r.fehler;
    const err = [];
    if (typeof f.code !== "string") err.push("code fehlt");
    if (typeof f.text !== "string") err.push("text fehlt");
    if (f.zeile !== 2) err.push("zeile=" + f.zeile + " (erwartet 2)");
    if (typeof f.spalte !== "number" || f.spalte < 1) err.push("spalte=" + f.spalte);
    return err.length ? err.join("; ") : undefined;
  }),
  api(A, "parse: K0001 ist ein Parse-Fehler (Kl. 21)", (L) => {
    const r = L.parse("klasse K { tiefkühl salami f() { salami x = 1; serviere x; } }");
    return r && r.ok === false && r.fehler && r.fehler.code === "K0001" ? undefined : "Ergebnis: " + JSON.stringify(r).slice(0, 200);
  }),
  api(A, "parse wirft nie (leer, Müll, offener Kommentar/Text, Doppelklammern)", (L) => {
    const quellen = ["", "{{{ ))) klasse", "/* offen", '"offen', "((", "(())", "@", "\u0000", "für (", "ofen(zeit: ) {"];
    for (const q of quellen) {
      try {
        const r = L.parse(q);
        if (!r || typeof r.ok !== "boolean") return "kein {ok} für " + JSON.stringify(q);
      } catch (e) {
        return "parse warf bei " + JSON.stringify(q) + ": " + e;
      }
    }
  }),
  api(A, "parse akzeptiert Tier-3-Syntax (Generics, wirft, hawaii)", (L) => {
    const q = "rezeptur R { leer f() wirft StreitAnanas; }\nklasse K<A, B> erfüllt R { leer f() wirft StreitAnanas { } }\nhawaii h;\nBlech<Speisekarte<margherita, Blech<salami>>> x = [];";
    const r = L.parse(q);
    return r && r.ok ? undefined : "parse-Fehler: " + JSON.stringify(r && r.fehler);
  }),

  F(A, "run() → {exitCode, ereignisse, schritte, zeitMs}; ende zuletzt; onEvent identisch", P`
Bote.sage(("a"));
Bote.fehler(("b"));
`, {
    out: ["a"],
    check: (r) => {
      const err = [];
      for (const k of ["exitCode", "schritte", "zeitMs"]) if (typeof r[k] !== "number") err.push(k + " ist keine Zahl");
      if (!Array.isArray(r.ereignisse)) return "ereignisse fehlt";
      if (JSON.stringify(r._onEvent) !== JSON.stringify(r.ereignisse)) err.push("onEvent-Folge ≠ ereignisse");
      const ende = r.ereignisse[r.ereignisse.length - 1];
      if (ende && (ende.schritte !== r.schritte || ende.zeitMs !== r.zeitMs)) err.push("ende.schritte/zeitMs ≠ Ergebnis");
      if (!(r.schritte > 0)) err.push("schritte = " + r.schritte);
      return err;
    },
  }),

  F(A, "warnung-Ereignis hat code, text, zeile, spalte", P`
Teig<salami> t = teig(() -> (1));
Bote.sage((t.backen()));
`, {
    out: ["1"],
    check: (r) => {
      const w = r.ereignisse.find((e) => e.typ === "warnung");
      if (!w) return "keine Warnung";
      const err = [];
      if (w.code !== "T0007") err.push("code=" + w.code);
      if (typeof w.text !== "string") err.push("text fehlt");
      if (!("zeile" in w) || !("spalte" in w)) err.push("zeile/spalte fehlen");
      return err;
    },
  }),

  F(A, "fehler-Ereignis hat code, art, text, zeile, spalte", P`
salami n = 0;
salami x = 1 / n;
`, {
    exit: 1,
    check: (r) => {
      const f = r.ereignisse.find((e) => e.typ === "fehler");
      if (!f) return "kein fehler-Ereignis";
      const fehlend = ["code", "art", "text", "zeile", "spalte"].filter((k) => !(k in f));
      return fehlend.length ? "fehlende Felder: " + fehlend.join(", ") : undefined;
    },
  }),

  F(A, "Deterministisch: zwei Läufe liefern dieselben Ereignisse (inkl. Zufall)", P`
für (salami i = 0; i < 5; i++) { Bote.sage((Zufall.zahl(1, 1000))); }
`, { zweimal: true }),

  F(A, "panik-Ereignis: danach sofort ende", P`
hawaii h = 1;
`, {
    exit: 39, panik: true,
    check: (r) => {
      const e = r.ereignisse;
      const i = e.findIndex((x) => x.typ === "panik");
      return i >= 0 && i === e.length - 2 && e[i + 1].typ === "ende" ? undefined : "panik ist nicht das vorletzte Ereignis";
    },
  }),
];
