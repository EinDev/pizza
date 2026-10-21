"use strict";
// Theke-Fälle zu Klärungen, deren Umsetzung noch OFFEN ist (Konvention *-offen.js, ARCHITEKTUR §6).
const { P, F } = require("../lib/helfer");
const O = "§16 Theke – Umsetzung offen";

const fenster = (titel, breite = 480, hoehe = 360) => ({ v: 1, op: "fenster", titel, breite, hoehe });
const baum = (wurzel) => ({ v: 1, op: "baum", wurzel });
const aendere = (...aenderungen) => ({ v: 1, op: "aendere", aenderungen });
const schliesse = () => ({ v: 1, op: "schliesse" });

module.exports = [
  F(O, "K-061/057: Programmende mit offener Theke → letzter Puffer-Flush, dann schliesse", P`
Theke t = neu Theke("V");
Schild s = neu Schild("alt");
Schild u = neu Schild("unsichtbar");
t.zeige(s);
s.setzeText(("neu"));
u.setzeText(("egal"));
Bote.sage(("ende"));
`, {
    out: ["ende"],
    ui: [fenster("V"), baum({ id: "z1", art: "schild", text: "alt" }), aendere({ id: "z1", text: "neu" }), schliesse()],
    check(res) {
      const letzte = res.ereignisse.filter((e) => e.typ === "ausgabe" || e.typ === "ui").map((e) => e.typ === "ui" ? e.nachricht.op : e.text).slice(-2);
      return JSON.stringify(letzte) === JSON.stringify(["ende", "aendere"]) ? undefined : "Ende-Flush fehlt: " + JSON.stringify(letzte);
    },
  }),

  F(O, "K-061/065: Änderungen bei Ananas im Rückruf gesendet; offenes Fenster am Programmende → schliesse", P`
Theke t = neu Theke("H");
Schild s = neu Schild("a");
Knopf k = neu Knopf("h", () -> { s.setzeText(("b")); wirf neu StreitAnanas("x"); });
t.zeige(neu Stapel([s, k]));
probier { t.bediene(); } verbrannt (StreitAnanas a) { Bote.sage(("gefangen")); }
`, {
    uiEreignisse: [{ typ: "klick", id: "z2" }],
    out: ["gefangen"],
    ui: [fenster("H"), baum({ id: "z3", art: "stapel", kinder: [{ id: "z1", art: "schild", text: "a" }, { id: "z2", art: "knopf", text: "h" }] }), aendere({ id: "z1", text: "b" }), schliesse()],
    check(res) {
      const t = res.ereignisse.filter((e) => e.typ === "ausgabe" || (e.typ === "ui" && e.nachricht.op === "aendere")).map((e) => e.typ === "ui" ? "aendere" : e.text);
      return JSON.stringify(t) === JSON.stringify(["aendere", "gefangen"]) ? undefined : "Reihenfolge " + JSON.stringify(t);
    },
  }),

  F(O, "K-066/068: Typen und Stile – diavolo-Pflicht, Textform speichern, Stil-Whitelist mit Listen in Fehlertexten, Kommazahlen erlaubt", P`
Theke t = neu Theke("T", breite: 100, hoehe: 100);
Knopf k = neu Knopf(5);
Bote.sage((k.text()));
probier { k.aktiv(1); } verbrannt (TypAnanas a) { Bote.sage(("typ")); }
probier { k.stil("rahmen", 1); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { k.stil("farbe", "lila"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { k.stil("ausrichtung", "oben"); } verbrannt (LaufzeitAnanas a) { Bote.sage(("ausrichtung")); }
probier { k.stil("breite", -1); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { k.stil("breite", "x"); } verbrannt (TypAnanas a) { Bote.sage(("breite-typ")); }
k.stil("schrift", "gross");
k.stil("breite", 2.5);
Bote.sage((k.aktiv() + " " + k.sichtbar() + " " + k));
t.zeige(k);
`, {
    uiEreignisse: [],
    out: ["5", "typ", "Stil 'rahmen' gibt es nicht. Erlaubt: breite, hoehe, abstand, ausrichtung, schrift, farbe.",
      "Wert 'lila' ist für Stil 'farbe' nicht erlaubt. Erlaubt: tomate, basilikum, mozzarella, kruste, normal.",
      "ausrichtung", "Stil 'breite' braucht eine Zahl ≥ 0, nicht -1.", "breite-typ", "ja ja Knopf(z1)"],
    ui: [fenster("T", 100, 100), baum({ id: "z1", art: "knopf", text: "5", stil: { schrift: "gross", breite: 2.5 } }), schliesse()],
  }),

  F(O, "K-066: breite/hoehe Ganzzahl (sonst TypAnanas); titel optional (Standard \"\"); Textform Theke(Titel)", P`
probier { Theke x = neu Theke("x", breite: 2.5); } verbrannt (TypAnanas a) { Bote.sage(("breite")); }
Theke t = neu Theke();
Bote.sage(("[" + t.titel() + "] " + t));
t.setzeTitel(("Pizzeria"));
Bote.sage((t));
t.zeige(neu Schild("s"));
`, { uiEreignisse: [], out: ["breite", "[] Theke()", "Theke(Pizzeria)"], ui: [fenster("Pizzeria"), baum({ id: "z1", art: "schild", text: "s" })] }),

  F(O, "K-061: Ende durch ungefangene Ananas mit offener Theke → schliesse als letzte ui-Nachricht (nach dem fehler-Ereignis, vor ende)", P`
Theke t = neu Theke("A");
Schild s = neu Schild("a");
t.zeige(s);
s.setzeText(("b"));
wirf neu StreitAnanas("kaputt");
`, {
    exit: 1, fehler: { code: "StreitAnanas" },
    ui: [fenster("A"), baum({ id: "z1", art: "schild", text: "a" }), aendere({ id: "z1", text: "b" }), schliesse()],
    check(res) {
      const t = res.ereignisse.map((e) => e.typ === "ui" ? "ui:" + e.nachricht.op : e.typ);
      const iF = t.indexOf("fehler"), iS = t.lastIndexOf("ui:schliesse");
      return iF >= 0 && iS > iF && t[t.length - 1] === "ende" ? undefined : "Reihenfolge " + JSON.stringify(t);
    },
  }),

  F(O, "K-061: Ende durch P0002 mit offener Theke → schliesse", P`
Theke t = neu Theke("L");
t.zeige(neu Schild("s"));
solange (ja) { }
`, { exit: 3, schrittLimit: 500, fehler: { code: "P0002" }, ui: [fenster("L"), baum({ id: "z1", art: "schild", text: "s" }), schliesse()] }),

];
