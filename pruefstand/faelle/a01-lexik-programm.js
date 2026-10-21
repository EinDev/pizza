"use strict";
const { P, F } = require("../lib/helfer");
const L = "§1 Lexik";
const A = "§2 Programmaufbau";

module.exports = [
  // ───────── §1 Lexik ─────────
  F(L, "Zeilen- und Blockkommentare", P`
// Kommentar
Bote.sage((1)); /* mehr
zeilig */ Bote.sage((2));
`, { out: ["1", "2"] }),

  F(L, "Bezeichner mit Umlauten und ß", P`
salami größe = 3;
margherita Äußeres = "ü";
Bote.sage((größe));
Bote.sage((Äußeres));
`, { out: ["3", "ü"] }),

  F(L, "Groß-/Kleinschreibung signifikant, pizza ist kein Keyword", P`
salami pizza = 1;
salami PiZZa = 2;
salami piZZA = 3;
Bote.sage((pizza));
Bote.sage((PiZZa));
Bote.sage((piZZA));
`, { out: ["1", "2", "3"] }),

  F(L, "Zahlen mit Unterstrichen", P`
Bote.sage((1_000_000));
Bote.sage((1_0 + 1));
`, { out: ["1000000", "11"] }),

  F(L, "Kommazahl 7.50 → 7.5", P`
Bote.sage((7.50));
`, { out: ["7.5"] }),

  F(L, "Dauer-Literale und Textform", P`
Bote.sage((90s));
Bote.sage((30min));
Bote.sage((1h));
Bote.sage((3d));
Bote.sage((500ms));
Bote.sage((1.5s));
`, { out: ["1min 30s", "30min", "1h", "3d", "500ms", "1s 500ms"] }),

  F(L, "Text-Escapes \\n \\t \\\" \\\\", P`
Bote.sage(("a\tb"));
Bote.sage(("x\ny"));
Bote.sage(("sag \"ciao\" \\ ende"));
`, { out: ["a\tb", "x\ny", 'sag "ciao" \\ ende'] }),

  F(L, "Keyword als Variablenname → Syntaxfehler", P`
salami klasse = 3;
`, { exit: 2, fehler: { art: "syntax" } }),

  F(L, "Bezeichner darf nicht mit Ziffer beginnen", P`
salami 1x = 3;
`, { exit: 2 }),

  F(L, "Nicht geschlossener Text → Syntaxfehler", P`
Bote.sage(("offen));
`, { exit: 2, fehler: { art: "syntax" } }),

  F(L, "Fehlendes Semikolon → Syntaxfehler", P`
salami x = 3
Bote.sage((x));
`, { exit: 2, fehler: { art: "syntax" } }),

  F(L, "Syntaxfehler-Position: Zeilen ab 1", P`
Bote.sage((1));
salami x = ;
`, { exit: 2, out: [], fehler: { art: "syntax", zeile: 2 } }),

  // ───────── §2 Programmaufbau ─────────
  F(A, "Snack-Modus: Hallo", P`
Bote.sage(("Hallo!"));
`, { out: ["Hallo!"] }),

  F(A, "paket/import werden ignoriert, hauptgang läuft", P`
paket de.luigi.pizzeria;
import pizza.ofen.*;

speisekarte klasse Pizzeria {
    speisekarte tiefkühl leer hauptgang(Blech<margherita> args) {
        Bote.sage(("Hallo, Pizzawelt!"));
    }
}
`, { out: ["Hallo, Pizzawelt!"] }),

  F(A, "Top-Level-Anweisungen vor hauptgang (Reihenfolge)", P`
Bote.sage(("eins"));
speisekarte klasse Pizzeria {
    speisekarte tiefkühl leer hauptgang(Blech<margherita> args) {
        Bote.sage(("haupt"));
    }
}
Bote.sage(("zwei"));
`, { out: ["eins", "zwei", "haupt"] }),

  F(A, "Hoisting: Klasse wird vor ihrer Deklaration benutzt", P`
Bote.sage((Rechner.doppelt(4)));
klasse Rechner {
    tiefkühl salami doppelt(salami x) { serviere ((x * 2)); }
}
`, { out: ["8"] }),

  F(A, "hauptgang bekommt args (Blech von Texten)", P`
klasse App {
    tiefkühl leer hauptgang(Blech<margherita> args) {
        Bote.sage((args.länge()));
        Bote.sage((args));
    }
}
`, { args: ["a", "b"], out: ["2", "[a, b]"] }),

  F(A, "hauptgang ohne args → leeres Blech", P`
klasse App {
    tiefkühl leer hauptgang(Blech<margherita> args) {
        Bote.sage((args.länge()));
        Bote.sage((args.istLeer()));
    }
}
`, { out: ["0", "ja"] }),

  F(A, "Nur die erste Klasse mit hauptgang ist Einstieg", P`
klasse Erste {
    tiefkühl leer hauptgang(Blech<margherita> args) { Bote.sage(("erste")); }
}
klasse Zweite {
    tiefkühl leer hauptgang(Blech<margherita> args) { Bote.sage(("zweite")); }
}
`, { out: ["erste"] }),
];
