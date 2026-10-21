"use strict";
const { P, F } = require("../lib/helfer");
const E = "§5 Ausdrücke";

module.exports = [
  F(E, "Präzedenz * vor +, Klammern, Linksassoziativität", P`
Bote.sage((1 + 2 * 3));
Bote.sage(((1 + 2) * 3));
Bote.sage((10 - 4 - 3));
Bote.sage((2 * 3 % 4));
`, { out: ["7", "9", "3", "2"] }),

  F(E, "Präzedenz logisch: && vor ||, Vergleich vor ==", P`
Bote.sage((ja || nein && nein));
Bote.sage((!ja || ja));
Bote.sage((1 < 2 == ja));
Bote.sage((1 + 1 == 2 && 3 > 2));
`, { out: ["ja", "ja", "ja", "ja"] }),

  F(E, "Unäres Minus und !", P`
Bote.sage((-2 * 3));
Bote.sage((-(2 + 3)));
Bote.sage((!nein));
`, { out: ["-6", "-5", "ja"] }),

  F(E, "Ternär ?: (niedrigste Präzedenz, verschachtelt)", P`
salami x = 5;
margherita t = x < 3 ? "klein" : x < 10 ? "mittel" : "groß";
Bote.sage((t));
Bote.sage((1 > 2 ? "a" : "b"));
`, { out: ["mittel", "b"] }),

  F(E, "/ ist exakte Division, % Rest", P`
Bote.sage((7 / 2));
Bote.sage((10 / 5));
Bote.sage((10 % 3));
`, { out: ["3.5", "2", "1"] }),

  F(E, "Division durch 0 → RechenAnanas (Text wörtlich)", P`
salami n = 0;
Bote.sage((5 / n));
`, { exit: 1, fehler: { code: "RechenAnanas", textEnthält: "RechenAnanas: Durch null teilen? Das ergibt keine Stücke." } }),

  F(E, "+ mit Text → Verkettung (links nach rechts)", P`
Bote.sage(("a" + 1 + 2));
Bote.sage((1 + 2 + "a"));
Bote.sage(("x" + ja));
Bote.sage(("x" + karton));
Bote.sage(("Preis " + 7.5));
`, { out: ["a12", "3a", "xja", "xkarton", "Preis 7.5"] }),

  F(E, "== / != Wertgleichheit Zahlen, Texte, Wahrheitswerte, Dauer", P`
Bote.sage((3 == 3.0));
Bote.sage(("a" == "a"));
Bote.sage(("a" != "b"));
Bote.sage((ja == ja));
Bote.sage((60s == 1min));
`, { out: ["ja", "ja", "ja", "ja", "ja"] }),

  F(E, "== bei Pizzen: gleiche Beläge in gleicher Reihenfolge", P`
diavolo a = ((Tomate, Käse)) == ((Tomate, Käse));
diavolo b = ((Tomate, Käse)) == ((Tomate, Mozzarella));
diavolo c = ((Tomate, Salami, Pilze)) == ((Tomate, Pilze, Salami));
diavolo d = Salami == Salami;
Bote.sage((a));
Bote.sage((b));
Bote.sage((c));
Bote.sage((d));
`, { out: ["ja", "nein", "nein", "ja"] }),

  F(E, "== bei Objekten: Identität", P`
klasse K { salami x = 1; }
K a = neu K();
K b = neu K();
K c = a;
Bote.sage((a == b));
Bote.sage((a == c));
`, { out: ["nein", "ja"] }),

  F(E, "Lambdas: (a, b) -> ausdruck, x -> ausdruck, Block-Lambda", P`
Funktion add = (a, b) -> a + b;
Funktion dbl = x -> x * 2;
Funktion blk = () -> { salami s = 0; für (salami i = 1; i <= 3; i++) { s += i; } serviere ((s)); };
Bote.sage((add(2, 3)));
Bote.sage((dbl(4)));
Bote.sage((blk()));
`, { out: ["5", "8", "6"] }),

  F(E, "Lambda liefert Lambda (Currying)", P`
Funktion addierer = a -> b -> a + b;
Funktion plus3 = addierer(3);
Bote.sage((plus3(4)));
`, { out: ["7"] }),

  F(E, "Closures fangen per Referenz (Kl. 2)", P`
salami z = 1;
Funktion f = () -> z;
z = 5;
Bote.sage((f()));
salami n = 0;
Funktion inc = () -> { n += 1; serviere ((n)); };
inc();
inc();
Bote.sage((n));
`, { out: ["5", "2"] }),

  F(E, "Closure-Zähler mit eigenem Zustand", P`
klasse Fabrik {
    tiefkühl Funktion zähler() {
        salami c = 0;
        serviere (() -> { c += 1; serviere ((c)); });
    }
}
Funktion a = Fabrik.zähler();
Funktion b = Fabrik.zähler();
a();
a();
Bote.sage((a()));
Bote.sage((b()));
`, { out: ["3", "1"] }),

  F(E, "Methodenreferenzen obj.methode und Klasse.methode", P`
klasse Rechner {
    salami basis = 10;
    speisekarte salami plus(salami x) { serviere ((basis + x)); }
    tiefkühl salami doppel(salami x) { serviere ((x * 2)); }
}
Rechner r = neu Rechner();
Funktion f = r.plus;
Funktion g = Rechner.doppel;
Bote.sage((f(5)));
Bote.sage((g(5)));
Bote.sage(([1, 2, 3].belege(Rechner.doppel)));
`, { out: ["15", "10", "[2, 4, 6]"] }),

  F(E, "Blech-Literal und Bereich [a .. b] inklusive", P`
Bote.sage(([1, 2, 3]));
Bote.sage(([1 .. 4]));
Bote.sage(([3 .. 3]));
Bote.sage(([]));
`, { out: ["[1, 2, 3]", "[1, 2, 3, 4]", "[3]", "[]"] }),

  F(E, "Pizza-Literal: ((Belag, ...)) in Argumentposition", P`
Bote.sage(((Tomate, Mozzarella)));
`, { out: ["((Tomate, Mozzarella))"] }),

  F(E, "Pizza-Literal mit einem Belag: ((Salami)) als Ausdruck", P`
Pizza p = ((Salami));
Bote.sage((p));
Bote.sage(((Salami)));
Bote.sage((p.anzahlBeläge()));
`, { out: ["((Salami))", "((Salami))", "1"] }),

  F(E, "Pizza-Literal leer (())", P`
Pizza p = (());
Bote.sage((p));
Bote.sage((p.anzahlBeläge()));
`, { out: ["(())", "0"] }),

  F(E, "Doppelklammer ((x + 1)) ist normale Klammerung", P`
salami x = 4;
salami y = ((x + 1));
Bote.sage((y));
`, { out: ["5"] }),

  F(E, "Doppelklammer ((\"Text\")) ist normale Klammerung", P`
margherita t = (("Text"));
Bote.sage((t));
`, { out: ["Text"] }),

  F(E, "Doppelklammer ((a.b)) ist normale Klammerung", P`
klasse K { salami b = 7; }
K a = neu K();
salami v = ((a.b));
Bote.sage((v));
`, { out: ["7"] }),

  F(E, "Doppelklammer ((x)) mit kleingeschriebenem Bezeichner ist keine Pizza", P`
salami x = 3;
salami y = ((x));
Bote.sage((y));
`, { out: ["3"] }),

  F(E, "Methodenaufruf direkt auf Pizza-Literal", P`
Bote.sage((((Tomate, Mozzarella, Basilikum)).preis()));
`, { out: ["8"] }),

  F(E, "Textform: Zahlen, ja/nein, karton", P`
Bote.sage((8));
Bote.sage((7.5));
Bote.sage((0.1));
Bote.sage((ja));
Bote.sage((nein));
Bote.sage((karton));
`, { out: ["8", "7.5", "0.1", "ja", "nein", "karton"] }),

  F(E, "Textform: Texte im Blech ohne Anführungszeichen (Kl. 12)", P`
Bote.sage((["a", "b"]));
Bote.sage(([ja, karton, 1.5]));
Bote.sage(([[1], []]));
`, { out: ["[a, b]", "[ja, karton, 1.5]", "[[1], []]"] }),

  F(E, "Textform: Speisekarte {a: 1, b: 2}", P`
Speisekarte<margherita, salami> m = neu Speisekarte<margherita, salami>();
m.lege("a", 1);
m.lege("b", 2);
Bote.sage((m));
`, { out: ["{a: 1, b: 2}"] }),

  F(E, "Textform: Belag = Name", P`
Bote.sage(Salami);
Bote.sage(("Belag: " + Käse));
`, { out: ["Salami", "Belag: Käse"] }),

  F(E, "Textform: Dauer (größte Einheiten zuerst, Nullteile weg, 0ms)", P`
Bote.sage((3d + 4h));
Bote.sage((90ms));
Bote.sage((2h));
Bote.sage((61min));
Bote.sage((1h + 1s));
Bote.sage((30s - 30s));
`, { out: ["3d 4h", "90ms", "2h", "1h 1min", "1h 1s", "0ms"] }),

  F(E, "Textform: Objekt Klassenname@N (ab 1)", P`
klasse Ding { }
Ding a = neu Ding();
Ding b = neu Ding();
Bote.sage((a));
Bote.sage((b));
`, { out: ["Ding@1", "Ding@2"] }),

  F(E, "Textform: Objekt-Nummer zählt global über Klassen (Kl. 19)", P`
klasse X { }
klasse Y { }
X x = neu X();
Y y = neu Y();
Bote.sage((x));
Bote.sage((y));
`, { out: ["X@1", "Y@2"] }),

  F(E, "Textform: Ananas = Typ: Nachricht, auch bei + (Kl. 14)", P`
StreitAnanas a = neu StreitAnanas("zu wenig");
Bote.sage((a));
Bote.sage(("Fehler: " + a));
`, { out: ["StreitAnanas: zu wenig", "Fehler: StreitAnanas: zu wenig"] }),
];
