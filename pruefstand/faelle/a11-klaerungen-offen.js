"use strict";
// Regressionstests zu Klärungen aus KLAERUNGEN.md, deren Umsetzung im Interpreter noch OFFEN ist
// (siehe KLAERUNGEN.md „Offene Umsetzungen“). Diese Gruppe ist absichtlich rot, bis die Aufträge
// erledigt sind; danach die Fälle nach a10-klaerungen.js verschieben.
const { P, F } = require("../lib/helfer");
const O = "§15 Klärungen – Umsetzung offen";

module.exports = [
  // ── K-007 einheitliche Zahltext-Grammatik (alsZahl, liesZahl, frageZahl) ─
  F(O, "K-007: alsZahl akzeptiert Dezimalkomma und Unterstriche, trimmt Leerraum", P`
Bote.sage(("3,5".alsZahl()));
Bote.sage((" 42 ".alsZahl()));
Bote.sage(("1_000".alsZahl()));
Bote.sage(("-7".alsZahl()));
Bote.sage(("+7".alsZahl()));
Bote.sage(("1_000,5".alsZahl()));
`, { out: ["3.5", "42", "1000", "-7", "7", "1000.5"] }),

  F(O, "K-007: alsZahl lehnt Hex, Exponent, führenden/abschließenden Punkt und Sonderwerte ab", P`
Blech<margherita> t = ["0x1A", "1e2", ".5", "5.", "Infinity", "NaN", "0b101", "1.5,2", "", "abc"];
für (margherita s : t) {
  probier { Bote.sage((s.alsZahl())); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
}
`, { out: ['"0x1A" ist keine Zahl.', '"1e2" ist keine Zahl.', '".5" ist keine Zahl.', '"5." ist keine Zahl.',
      '"Infinity" ist keine Zahl.', '"NaN" ist keine Zahl.', '"0b101" ist keine Zahl.', '"1.5,2" ist keine Zahl.',
      '"" ist keine Zahl.', '"abc" ist keine Zahl.'] }),

  F(O, "K-007: liesZahl akzeptiert Unterstriche, lehnt Hex/Exponent/.5/5. ab (gleiche Grammatik wie alsZahl)", P`
salami i = 0;
solange (i < 7) {
  i++;
  probier { Bote.sage((Bestellannahme.liesZahl())); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
}
`, { eingabe: ["1_000", "3,5", "0x10", "1e3", ".5", "5.", " +4 "],
     out: ["1000", "3.5", "'0x10' ist keine Zahl.", "'1e3' ist keine Zahl.", "'.5' ist keine Zahl.", "'5.' ist keine Zahl.", "4"] }),

  // ── K-008 liesZahl/frageZahl mit Standardwert bei EOF ───────────────────
  F(O, "K-008: liesZahl(ersatz) / frageZahl(text, ersatz) liefern den Ersatzwert bei EOF", P`
funghi a = Bestellannahme.liesZahl(7);
Bote.sage((a));
salami b = Bestellannahme.frageZahl("Zahl? ", 0);
Bote.sage((b));
salami c = Bestellannahme.liesZahl(ersatz: -1);
Bote.sage((c));
`, { eingabe: ["2,5"], out: ["2.5", "Zahl? ", "0", "-1"] }),

  F(O, "K-008: der Ersatzwert gilt nur bei EOF – ungültige Zahl bleibt TypAnanas", P`
probier { Bote.sage((Bestellannahme.liesZahl(0))); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
Bote.sage((Bestellannahme.liesZahl(0)));
`, { eingabe: ["abc"], out: ["'abc' ist keine Zahl.", "0"] }),

  // ── K-015 abbrechen/weiter außerhalb einer Schleife ─────────────────────
  F(O, "K-015: abbrechen im Methodenrumpf außerhalb einer Schleife → PizzaFehler P0012 (Exit 2)", P`
leer f() {
  Bote.sage(("a"));
  abbrechen;
}
f();
`, { exit: 2, fehler: { code: "P0012", art: "syntax", zeile: 3, text: "PizzaFehler P0012: 'abbrechen' steht außerhalb einer Schleife." } }),

  F(O, "K-015: weiter in einem Lambda innerhalb einer Schleife → P0012 (Lambda-Grenze trennt)", P`
für (salami i = 0; i < 2; i++) {
  salami x = (() -> { weiter; })();
}
`, { exit: 2, fehler: { code: "P0012", art: "syntax", zeile: 2, text: "PizzaFehler P0012: 'weiter' steht außerhalb einer Schleife." } }),

  F(O, "K-015: abbrechen im Ofen-Block ohne Schleife → P0012", P`
salami s = ofen { abbrechen; };
`, { exit: 2, fehler: { code: "P0012", art: "syntax", zeile: 1 } }),

  F(O, "K-015: abbrechen in wähle-Arm und in Schleifen bleibt erlaubt", P`
für (salami i : [1, 2, 3]) {
  wähle (i) { fall 2 -> { abbrechen; } standard -> Bote.sage((i)); }
}
salami n = 0;
solange (ja) { n++; falls (n > 2) { abbrechen; } }
Bote.sage((n));
`, { out: ["1", "3", "3"] }),

  // ── K-038 auto nur in schneide ──────────────────────────────────────────
  F(O, "K-038: auto außerhalb von schneide(auto) → LaufzeitAnanas 'auto' ist nicht definiert.", P`
Bote.sage(([1, 2].schneide(auto).länge()));
Bote.sage((auto));
`, { exit: 1, out: ["8"], fehler: { code: "LaufzeitAnanas", art: "ananas", zeile: 2,
      text: "Ungefangene Ananas – LaufzeitAnanas: 'auto' ist nicht definiert. (Zeile 2)" } }),

  // ── K-042 EOF ist endgültig ─────────────────────────────────────────────
  F(O, "K-042: nach EOF (null-Eintrag) liefert jeder weitere Leseversuch karton, hatMehr nein", P`
Bote.sage((Bestellannahme.lies()));
Bote.sage((Bestellannahme.lies()));
Bote.sage((Bestellannahme.lies()));
Bote.sage((Bestellannahme.hatMehr()));
`, { eingabe: ["x", null, "y"], out: ["x", "karton", "karton", "nein"] }),

  // ── K-047 ganzzahlige Uhr ───────────────────────────────────────────────
  F(O, "K-047: Uhr.vorspulen rundet auf ganze ms; zeitMs bleibt ganzzahlig", P`
Uhr.vorspulen(0.5ms);
Uhr.vorspulen(0.4ms);
Uhr.vorspulen(10s / 3);
Bote.sage((Uhr.jetzt().inMs()));
`, { out: ["3354"], check: (res) => (res.zeitMs === 3354 ? undefined : "zeitMs " + res.zeitMs + ", erwartet 3354") }),

  // API-Fall (läuft im Hauptthread, Format wie a09-api.js)
  {
    p: O, name: "K-015: P0012 ist ein Parse-Fehler (PizzaLang.parse meldet ihn)",
    api(L) {
      const r = L.parse("leer f() { abbrechen; }");
      return r && r.ok === false && r.fehler && r.fehler.code === "P0012" ? undefined : "Ergebnis: " + JSON.stringify(r).slice(0, 200);
    },
  },
];
