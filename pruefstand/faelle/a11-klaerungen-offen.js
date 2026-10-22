"use strict";
// Regressionstests zu Klärungen aus KLAERUNGEN.md, deren Umsetzung im Interpreter noch OFFEN ist.
// Konvention (ARCHITEKTUR §6): Fälle in *-offen.js zählen nicht als Fehlschlag; wird einer grün, meldet der
// Prüfstand „in eine nicht-offene Datei verschieben“.
const { P, F } = require("../lib/helfer");
const O = "§15 Klärungen – Umsetzung offen";

module.exports = [
  // ── K-105 Sprach-Bereinigung: Pizza-Objekt, Beläge, teile/Stück entfernt ─────────────────────────
  // Entfernte Dinge verhalten sich wie jeder unbekannte Name – keine Sonderbehandlung, keine Sondermeldung.

  F(O, "K-105 Belagname ist ein unbekannter Name", P`
Bote.sage((Tomate));
`, { exit: 1, fehler: { code: "LaufzeitAnanas", textEnthält: "'Tomate' ist nicht definiert." } }),

  F(O, "K-105 ((A, B)) ist kein Literal mehr – Syntaxfehler", P`
Bote.sage((("x")));
Pizza p = ((Tomate, Mozzarella));
`, { exit: 2, fehler: { code: "P0001", art: "syntax", zeile: 2 } }),

  F(O, "K-105 (()) ist kein Literal mehr – Syntaxfehler", P`
Pizza p = (());
`, { exit: 2, fehler: { code: "P0001", art: "syntax" } }),

  F(O, "K-105 neu Pizza() ohne eigene Klasse → UnbekanntePizzaAnanas (unbekannte Klasse)", P`
Pizza p = neu Pizza();
`, { exit: 1, fehler: { code: "UnbekanntePizzaAnanas", textEnthält: "Klasse 'Pizza' steht nicht auf der Speisekarte." } }),

  F(O, "K-105 teile ist kein Builtin mehr", P`
salami x = 1;
Bote.sage((teile(x)));
`, { exit: 1, fehler: { code: "LaufzeitAnanas", textEnthält: "'teile' ist nicht definiert." } }),

  F(O, "K-105 belag … auf Pizza ist keine Deklaration mehr – Syntaxfehler", P`
belag Trüffel auf Pizza {
    speisekarte funghi preis() { serviere ((4.5)); }
}
`, { exit: 2, fehler: { code: "P0001", art: "syntax" } }),

  F(O, "K-105 belag und auf sind keine reservierten Wörter mehr", P`
salami belag = 3;
margherita auf = "auf";
Bote.sage((belag + " " + auf));
`, { out: ["3 auf"] }),

  F(O, "K-105 entfernte Ananas-Klassen sind unbekannte Klassen", P`
probier {
    wirf neu UnbekannterBelagAnanas("x");
} verbrannt (UnbekanntePizzaAnanas a) {
    Bote.sage((a.nachricht()));
}
probier {
    wirf neu BesitzAnanas("y");
} verbrannt (UnbekanntePizzaAnanas a) {
    Bote.sage((a.nachricht()));
}
`, { out: ["Klasse 'UnbekannterBelagAnanas' steht nicht auf der Speisekarte.", "Klasse 'BesitzAnanas' steht nicht auf der Speisekarte."] }),

  F(O, "K-105 eigene Klasse Pizza funktioniert wie jede Klasse (Typprüfung, neu, alsText)", P`
klasse Pizza {
    Blech<margherita> beläge;
    Pizza(Blech<margherita> b) { beläge = b; }
    funghi preis() { serviere ((5 + beläge.länge() * 1.5)); }
    margherita alsText() { serviere (("((" + beläge.verbinde(", ") + "))")); }
}
Pizza p = neu Pizza(["Tomate", "Mozzarella"]);
Pizza q = p;
Bote.sage((p), (p.preis().euro()), (q == p));
`, { out: ["((Tomate, Mozzarella)) 8,00 € ja"] }),

  F(O, "K-105 eigene Variablen mit Belagnamen gewinnen immer (kein Belag-Vorrang mehr, ersetzt K-001)", P`
margherita Tomate = "rot";
salami Salami = 2;
Bote.sage(((Tomate)), ((Salami)));
`, { out: ["rot 2"] }),

  F(O, "K-105 Zuweisung per Name ist für jeden Typ erlaubt (keine BesitzAnanas), schieb bleibt", P`
klasse Pizza { salami n = 1; }
Pizza a = neu Pizza();
Pizza b = a;
Pizza c = schieb(b);
Bote.sage((c.n));
probier {
    Bote.sage((b));
} verbrannt (LeererKartonAnanas x) {
    Bote.sage((x.nachricht()));
}
`, { out: ["1", "'b' wurde weggeschoben – der Karton ist leer."] }),

  F(O, "K-105 bloßer Name Ananas ist der Klassenwert, keine W0666 (ersetzt K-026 teilweise)", P`
Bote.sage((Ananas));
`, { out: ["Ananas"], noWarn: ["W0666"] }),

  F(O, "K-105 Hawaii bleibt: Typ hawaii warnt W0666 und paniert bei Zuweisung", P`
Bote.sage(("vor"));
hawaii h = 1;
Bote.sage(("nach"));
`, { exit: 39, out: ["vor"], warn: ["W0666"], panik: true }),

  F(O, "K-105 Hawaii bleibt: neu Hawaii(…) paniert", P`
Bote.sage(("vor"));
neu Hawaii();
`, { exit: 39, out: ["vor"], panik: true }),

  F(O, "K-105 API: keine Beläge, keine Pizza-Typen, kein teile, keine Belag-Keywords", P`
Bote.sage(("ok"));
`, {
    out: ["ok"],
    check(res) {
      const PL = require("../../site/js/pizza.js");
      const e = [];
      if (PL.BELAEGE !== undefined) e.push("PizzaLang.BELAEGE existiert noch");
      if (PL.intern && (PL.intern.BELAEGE !== undefined || PL.intern.GRUNDPREIS !== undefined)) e.push("intern.BELAEGE/GRUNDPREIS existieren noch");
      for (const t of ["Pizza", "Stück"]) if (PL.TYPEN.includes(t)) e.push("TYPEN enthält " + t);
      if (PL.BUILTINS.includes("teile")) e.push("BUILTINS enthält teile");
      if (!PL.BUILTINS.includes("schieb")) e.push("BUILTINS ohne schieb");
      for (const a of ["BesitzAnanas", "UnbekannterBelagAnanas"]) if (PL.ANANAS.includes(a)) e.push("ANANAS enthält " + a);
      for (const a of ["UnbekanntePizzaAnanas", "KeinStückAnanas", "StreitAnanas", "KüchenAnanas"]) if (!PL.ANANAS.includes(a)) e.push("ANANAS ohne " + a);
      for (const k of ["belag", "auf"]) if (PL.KEYWORDS.includes(k)) e.push("KEYWORDS enthält " + k);
      return e;
    }
  }),
];
