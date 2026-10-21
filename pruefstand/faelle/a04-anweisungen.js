"use strict";
const { P, F } = require("../lib/helfer");
const S = "§4 Anweisungen";

module.exports = [
  F(S, "Variablendeklaration ohne Wert, spätere Zuweisung", P`
salami x;
x = 3;
Bote.sage((x));
`, { out: ["3"] }),

  F(S, "Typ mit [] und Generics in Deklaration", P`
salami[] zahlen = [1, 2];
Speisekarte<margherita, Blech<salami>> m = neu Speisekarte<margherita, Blech<salami>>();
Bote.sage((zahlen));
Bote.sage((m.länge()));
`, { out: ["[1, 2]", "0"] }),

  F(S, "Zusammengesetzte Zuweisungen += -= *= /=", P`
funghi x = 10;
x += 5;
x -= 3;
x *= 2;
x /= 4;
Bote.sage((x));
`, { out: ["6"] }),

  F(S, "x++ und x--", P`
salami i = 5;
i++;
i++;
i--;
Bote.sage((i));
`, { out: ["6"] }),

  F(S, "Zuweisung und ++ auf Feld a.b", P`
klasse K { salami n = 1; }
K k = neu K();
k.n = 5;
k.n += 3;
k.n++;
Bote.sage((k.n));
`, { out: ["9"] }),

  F(S, "Ausdrucksanweisung", P`
1 + 2;
Bote.sage(("ok"));
`, { out: ["ok"] }),

  F(S, "falls / sonst falls / sonst", P`
für (salami i = 1; i <= 3; i++) {
    falls (i == 1) { Bote.sage(("eins")); } sonst falls (i == 2) { Bote.sage(("zwei")); } sonst { Bote.sage(("viele")); }
}
`, { out: ["eins", "zwei", "viele"] }),

  F(S, "falls ohne Klammern um Bedingung → Syntaxfehler", P`
falls ja { Bote.sage(("x")); }
`, { exit: 2, out: [], fehler: { art: "syntax" } }),

  F(S, "falls ohne Block → Syntaxfehler", P`
falls (ja) Bote.sage(("x"));
`, { exit: 2, out: [], fehler: { art: "syntax" } }),

  F(S, "solange", P`
salami i = 0;
salami s = 0;
solange (i < 5) { i++; s += i; }
Bote.sage((s));
`, { out: ["15"] }),

  F(S, "für-each über Blech", P`
für (salami x : [3, 1, 2]) { Bote.sage((x)); }
`, { out: ["3", "1", "2"] }),

  F(S, "für-each über Text-Zeichen", P`
für (margherita z : "abc") { Bote.sage((z)); }
`, { out: ["a", "b", "c"] }),

  F(S, "für-each über Speisekarte-Schlüssel (Einfügereihenfolge, Kl. 5)", P`
Speisekarte<margherita, salami> m = neu Speisekarte<margherita, salami>();
m.lege("z", 1);
m.lege("a", 2);
m.lege("m", 3);
für (margherita k : m) { Bote.sage((k + "=" + m.hole(k))); }
`, { out: ["z=1", "a=2", "m=3"] }),

  F(S, "für mit Generics im Kopf (Kl. 17)", P`
für (Blech<salami> b : [[1], [2, 3]]) { Bote.sage((b.länge())); }
`, { out: ["1", "2"] }),

  F(S, "klassisches für (init; bedingung; update)", P`
für (salami i = 0; i < 6; i += 2) { Bote.sage((i)); }
`, { out: ["0", "2", "4"] }),

  F(S, "wähle: mehrere Werte, Block-Arm, standard, kein Durchfallen", P`
für (salami i = 1; i <= 4; i++) {
    wähle (i) {
        fall 1, 2 -> Bote.sage(("klein"));
        fall 3 -> { Bote.sage(("drei")); Bote.sage(("!")); }
        standard -> Bote.sage(("groß"));
    }
}
`, { out: ["klein", "klein", "drei", "!", "groß"] }),

  F(S, "wähle über Texte", P`
wähle ("b") {
    fall "a" -> Bote.sage(("A"));
    fall "b" -> Bote.sage(("B"));
    standard -> Bote.sage(("?"));
}
`, { out: ["B"] }),

  F(S, "wähle ohne Treffer und ohne standard → nichts", P`
wähle (9) { fall 1 -> Bote.sage(("eins")); }
Bote.sage(("weiter"));
`, { out: ["weiter"] }),

  F(S, "wähle: fall-Werte sind beliebige Ausdrücke (Kl. 10)", P`
salami x = 4;
wähle (x) {
    fall 1 + 1 -> Bote.sage(("zwei"));
    fall 2 * 2 -> Bote.sage(("vier"));
    standard -> Bote.sage(("?"));
}
`, { out: ["vier"] }),

  F(S, "wähle über quattrostagioni (Kl. 10)", P`
quattrostagioni Jahreszeit { FRÜHLING, SOMMER, HERBST, WINTER }
Jahreszeit j = Jahreszeit.HERBST;
wähle (j) {
    fall Jahreszeit.SOMMER -> Bote.sage(("Eis"));
    fall Jahreszeit.HERBST, Jahreszeit.WINTER -> Bote.sage(("Suppe"));
    standard -> Bote.sage(("?"));
}
`, { out: ["Suppe"] }),

  F(S, "serviere im wähle-Arm verlässt die Methode (Kl. 9)", P`
klasse K {
    tiefkühl margherita f(salami x) {
        wähle (x) {
            fall 1 -> serviere (("eins"));
            standard -> { serviere (("andere")); }
        }
        serviere (("nach wähle"));
    }
}
Bote.sage((K.f(1)));
Bote.sage((K.f(5)));
`, { out: ["eins", "andere"] }),

  F(S, "serviere ohne Klammern → K0001 (Exit 2, Kl. 21)", P`
klasse K {
    tiefkühl salami f() {
        salami x = 1;
        serviere x;
    }
}
Bote.sage(("start"));
`, {
    exit: 2, out: [],
    fehler: { code: "K0001", text: "PizzaFehler K0001: Klammerpflicht! serviere braucht Klammern: serviere (x);" },
  }),

  F(S, "serviere; ohne Wert in leer-Methode", P`
klasse K {
    tiefkühl leer f(salami x) {
        falls (x > 0) { serviere; }
        Bote.sage(("negativ"));
    }
}
K.f(1);
K.f(-1);
`, { out: ["negativ"] }),

  F(S, "serviere ((Tomate, Mozzarella)); ist gültig (Kl. 16)", P`
klasse K { tiefkühl Pizza f() { serviere ((Tomate, Mozzarella)); } }
Bote.sage((K.f()));
`, { out: ["((Tomate, Mozzarella))"] }),

  F(S, "probier / typisierte verbrannt-Zweige / rand", P`
probier {
    Bote.sage(("a"));
    wirf neu StreitAnanas("x");
    Bote.sage(("b"));
} verbrannt (RechenAnanas r) {
    Bote.sage(("rechen"));
} verbrannt (StreitAnanas s) {
    Bote.sage(("streit " + s.nachricht()));
} rand {
    Bote.sage(("rand"));
}
`, { out: ["a", "streit x", "rand"] }),

  F(S, "untypisiertes verbrannt (a)", P`
probier { wirf neu RechenAnanas("r"); } verbrannt (a) { Bote.sage((a.typ())); }
`, { out: ["RechenAnanas"] }),

  F(S, "rand läuft auch ohne Fehler", P`
probier { Bote.sage(("ok")); } verbrannt (a) { Bote.sage(("nie")); } rand { Bote.sage(("rand")); }
`, { out: ["ok", "rand"] }),

  F(S, "rand läuft, Ananas fliegt weiter (Exit 1)", P`
probier { wirf neu StreitAnanas("x"); } verbrannt (RechenAnanas r) { Bote.sage(("nie")); } rand { Bote.sage(("rand")); }
Bote.sage(("nie"));
`, { exit: 1, out: ["rand"], fehler: { code: "StreitAnanas" } }),

  F(S, "abbrechen und weiter in für", P`
für (salami i = 1; i <= 10; i++) {
    falls (i % 2 == 0) { weiter; }
    falls (i > 7) { abbrechen; }
    Bote.sage((i));
}
`, { out: ["1", "3", "5", "7"] }),

  F(S, "abbrechen und weiter in solange", P`
salami i = 0;
solange (ja) {
    i++;
    falls (i == 2) { weiter; }
    falls (i == 4) { abbrechen; }
    Bote.sage((i));
}
`, { out: ["1", "3"] }),

  F(S, "Blockscope: Variable außerhalb unbekannt → LaufzeitAnanas", P`
falls (ja) { salami innen = 1; }
Bote.sage((innen));
`, { exit: 1, fehler: { code: "LaufzeitAnanas", textEnthält: "'innen' ist nicht definiert." } }),
];
