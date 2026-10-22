"use strict";
// Theke v6 – ruhiges Raster (SPEC §16.9, KLAERUNGEN K-120 … K-124): Stil `senkrecht` (Lage quer zur Reihe) und `marke`
// (Badge am Reiter-Tab der Seite, optionales Textfeld wie `hinweis`, bindbar). Black-Box-Fälle mit vorgegebenen
// Renderer-Ereignissen und exakter Liste der ui-Nachrichten. Erwartungen aus SPEC/KLAERUNGEN.
const { P, F } = require("../lib/helfer");
const T = "§16.9 Theke v6 (K-120 …)";

const fenster = (titel, breite = 480, hoehe = 360) => ({ v: 1, op: "fenster", titel, breite, hoehe });
const baum = (wurzel) => ({ v: 1, op: "baum", wurzel });
const aendere = (...aenderungen) => ({ v: 1, op: "aendere", aenderungen });
const schliesse = () => ({ v: 1, op: "schliesse" });

module.exports = [
  F(T, "K-120: stil(\"senkrecht\", …) – Vokabular oben/mitte/unten/strecken, Fehlertexte, Erlaubt-Liste endet auf senkrecht; ausrichtung bleibt links/mitte/rechts; karton entfernt", P`
Theke t = neu Theke("S");
Reihe r = neu Reihe([neu Schild("a", id: "a"), neu Schild("b", id: "b")], id: "r").stil("senkrecht", "oben");
probier { r.stil("senkrecht", "links"); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { r.stil("senkrecht"); } verbrannt (LaufzeitAnanas e) { Bote.sage(("weg")); }
probier { r.stil("ausrichtung", "oben"); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { r.stil("senkrechtt", "oben"); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
r.stil("senkrecht", "strecken");
t.zeige(r);
r.stil("senkrecht", "strecken");
t.setzeTitel("S2");
r.stil("senkrecht", karton);
`, {
    uiEreignisse: [],
    out: [
      "Wert 'links' ist für Stil 'senkrecht' nicht erlaubt. Erlaubt: oben, mitte, unten, strecken.",
      "Wert 'oben' ist für Stil 'ausrichtung' nicht erlaubt. Erlaubt: links, mitte, rechts.",
      "Stil 'senkrechtt' gibt es nicht. Erlaubt: breite, hoehe, abstand, ausrichtung, schrift, farbe, zeilen, mindestbreite, senkrecht.",
    ],
    ui: [
      fenster("S"),
      baum({ id: "r", art: "reihe", stil: { senkrecht: "strecken" }, kinder: [{ id: "a", art: "schild", text: "a" }, { id: "b", art: "schild", text: "b" }] }),
      fenster("S2"),
      aendere({ id: "r", stil: { senkrecht: null } }),
      schliesse(),
    ],
  }),

  F(T, "K-124: marke(t)/marke() an jeder Zutat – ohne Argument Getter, karton → \"\", Textform, nur bei nicht leer im baum, nur echte Änderungen in aendere", P`
Theke t = neu Theke("M");
Stapel a = neu Stapel(id: "a").marke("neu");
Stapel b = neu Stapel(id: "b").marke(karton);
Stapel c = neu Stapel(id: "c").marke(3);
Reiter r = neu Reiter(["A", "B", "C"], [a, b, c], id: "r");
Bote.sage(("[" + a.marke() + "|" + b.marke() + "|" + c.marke() + "]"));
Knopf k = neu Knopf("k", () -> { a.marke("neu"); b.marke("⭐ 2"); c.marke(karton); a.marke(""); }, id: "k");
t.zeige(neu Stapel([r, k], id: "w"));
t.bediene();
Bote.sage(("[" + a.marke() + "|" + b.marke() + "|" + c.marke() + "]"));
`, {
    uiEreignisse: [{ typ: "klick", id: "k" }],
    out: ["[neu||3]", "[|⭐ 2|]"],
    ui: [
      fenster("M"),
      baum({ id: "w", art: "stapel", kinder: [
        { id: "r", art: "reiter", titel: ["A", "B", "C"], gewaehlt: 1, kinder: [
          { id: "a", art: "stapel", marke: "neu", kinder: [] },
          { id: "b", art: "stapel", kinder: [] },
          { id: "c", art: "stapel", marke: "3", kinder: [] },
        ] },
        { id: "k", art: "knopf", text: "k" },
      ] }),
      aendere({ id: "b", marke: "⭐ 2" }, { id: "c", marke: "" }, { id: "a", marke: "" }),
    ],
  }),

  F(T, "K-124: marke ist bindbar (Bindbar-Liste endet auf marke), Getter ist Quelle, Setter einer gebundenen Marke wirft, marke(t) in einer Bindung ist verboten", P`
Theke t = neu Theke("B");
Zettel sterne = neu Zettel(0);
Stapel imp = neu Stapel(id: "imp");
imp.binde("marke", () -> (sterne.wert() > 0 ? "⭐ " + sterne.wert() : ""));
Schild echo = neu Schild(id: "echo");
echo.binde("text", () -> ("Marke: " + imp.marke()));
probier { imp.marke("x"); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { echo.binde("farbe", () -> ("x")); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
Schild boese = neu Schild(id: "boese");
probier { boese.binde("text", () -> { imp.marke("y"); serviere ("z"); }); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
Knopf plus = neu Knopf("+", () -> { sterne.setze(sterne.wert() + 1); }, id: "plus");
t.zeige(neu Stapel([neu Reiter(["Imperium"], [imp], id: "r"), echo, plus], id: "w"));
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "plus" }, { typ: "klick", id: "plus" }],
    out: [
      "'marke' von Stapel(imp) ist gebunden – setze den Zettel, nicht die Zutat.",
      "'farbe' lässt sich an Schild(echo) nicht binden. Bindbar: text, sichtbar, hinweis, marke.",
      "Eine Bindung rechnet nur – 'marke' ist darin nicht erlaubt.",
    ],
    ui: [
      fenster("B"),
      baum({ id: "w", art: "stapel", kinder: [
        { id: "r", art: "reiter", titel: ["Imperium"], gewaehlt: 1, kinder: [{ id: "imp", art: "stapel", kinder: [] }] },
        { id: "echo", art: "schild", text: "Marke: " },
        { id: "plus", art: "knopf", text: "+" },
      ] }),
      aendere({ id: "imp", marke: "⭐ 1" }, { id: "echo", text: "Marke: ⭐ 1" }),
      aendere({ id: "imp", marke: "⭐ 2" }, { id: "echo", text: "Marke: ⭐ 2" }),
    ],
  }),

  F(T, "K-124: marke an einer Zutat außerhalb eines Reiters wird gesendet (der Renderer zeigt sie nicht); bindeStil(\"senkrecht\", …) folgt dem Zettel", P`
Theke t = neu Theke("X");
Zettel z = neu Zettel(1);
Knopf k = neu Knopf("k", () -> { z.setze(z.wert() + 1); }, id: "k").marke("!");
Reihe r = neu Reihe([k], id: "r");
r.bindeStil("senkrecht", () -> (z.wert() > 1 ? "unten" : "oben"));
t.zeige(r);
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "k" }, { typ: "klick", id: "k" }],
    out: [],
    ui: [
      fenster("X"),
      baum({ id: "r", art: "reihe", stil: { senkrecht: "oben" }, kinder: [{ id: "k", art: "knopf", text: "k", marke: "!" }] }),
      aendere({ id: "r", stil: { senkrecht: "unten" } }),
    ],
  }),
];
