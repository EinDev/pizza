"use strict";
const { P, F } = require("../lib/helfer");
const Z = "§6 Pizzen & Beläge";

const TRÜFFEL = P`
@Nach(Tomate)
belag Trüffel auf Pizza {
    speisekarte funghi preis() {
        serviere ((unten.preis() + 4.50));
    }
    speisekarte margherita beschreibung() {
        serviere (("edel: " + unten.beschreibung()));
    }
}
`;

module.exports = [
  F(Z, "Preis: Grundpreis 5 + Beläge ((Tomate, Mozzarella, Basilikum)) = 8", P`
Pizza p = ((Tomate, Mozzarella, Basilikum));
Bote.sage((p.preis()));
`, { out: ["8"] }),

  F(Z, "Preis der leeren Pizza = 5", P`
Pizza p = (());
Bote.sage((p.preis()));
Pizza q = neu Pizza();
Bote.sage((q));
`, { out: ["5", "(())"] }),

  F(Z, "p + Belag → neue Pizza, Original unverändert", P`
Pizza p = ((Tomate));
Pizza q = p + Salami;
Bote.sage((p));
Bote.sage((q));
`, { out: ["((Tomate))", "((Tomate, Salami))"] }),

  F(Z, "p - Belag entfernt alle Vorkommen", P`
Pizza p = ((Tomate, Chili, Käse, Chili));
Pizza q = p - Chili;
Bote.sage((q));
Bote.sage((p.anzahlBeläge()));
`, { out: ["((Tomate, Käse))", "4"] }),

  F(Z, "Pizza-Methoden beläge, hat, anzahlBeläge, alsText", P`
Pizza p = ((Tomate, Mozzarella));
Bote.sage((p.beläge()));
Bote.sage((p.hat(Mozzarella)));
Bote.sage((p.hat(Salami)));
Bote.sage((p.anzahlBeläge()));
Bote.sage((p.alsText()));
`, { out: ["[Tomate, Mozzarella]", "ja", "nein", "2", "((Tomate, Mozzarella))"] }),

  F(Z, "Belag-Wert und Belag-Methoden name, preis", P`
Bote.sage(Salami);
Bote.sage((Salami.name()));
Bote.sage((Salami.preis()));
Bote.sage((Thunfisch.preis()));
Bote.sage((Knoblauch.preis()));
`, { out: ["Salami", "Salami", "1.5", "2", "0.3"] }),

  F(Z, "Zutatenliste: Preise aller Beläge summieren sich korrekt", P`
Pizza p = ((Tomate, Mozzarella, Käse, Basilikum, Salami, Schinken, Pilze, Oliven, Zwiebeln, Paprika, Chili, Peperoni, Rucola, Parmesan, Gorgonzola, Thunfisch, Sardellen, Artischocken, Spinat, Ei, Mais, Knoblauch, Kapern));
Bote.sage((p.preis().runden(2)));
Bote.sage((p.anzahlBeläge()));
`, { out: ["28.9", "23"] }),

  F(Z, "Unbekannter Belag → UnbekannterBelagAnanas (Text wörtlich)", P`
Bote.sage(Xyz);
`, { exit: 1, fehler: { code: "UnbekannterBelagAnanas", textEnthält: "UnbekannterBelagAnanas: 'Xyz' steht nicht auf der Zutatenliste." } }),

  F(Z, "Unbekannter Belag im Literal → UnbekannterBelagAnanas", P`
Pizza p = ((Tomate, Quark));
`, { exit: 1, fehler: { code: "UnbekannterBelagAnanas", textEnthält: "'Quark' steht nicht auf der Zutatenliste." } }),

  F(Z, "@Nach: Mozzarella ohne Tomate ist ok", P`
Pizza p = ((Mozzarella));
Bote.sage((p));
`, { out: ["((Mozzarella))"] }),

  F(Z, "@Nach: Käse unter Tomate → B0012 (Text wörtlich, Exit 2)", P`
Pizza p = ((Käse, Tomate));
`, {
    exit: 2,
    fehler: { code: "B0012", art: "pizzafehler", text: "PizzaFehler B0012: 'Käse' liegt unter 'Tomate'. Das ist keine Pizza, das ist ein Auflauf." },
  }),

  F(Z, "@Nach: Prüfung auch bei + → B0012", P`
Pizza p = ((Käse));
Bote.sage(("vor"));
Pizza q = p + Tomate;
`, { exit: 2, out: ["vor"], fehler: { code: "B0012", text: "PizzaFehler B0012: 'Käse' liegt unter 'Tomate'. Das ist keine Pizza, das ist ein Auflauf." } }),

  F(Z, "@Nach: Basilikum unter Mozzarella → B0012", P`
Pizza p = ((Tomate, Basilikum, Mozzarella));
`, { exit: 2, fehler: { code: "B0012", text: "PizzaFehler B0012: 'Basilikum' liegt unter 'Mozzarella'. Das ist keine Pizza, das ist ein Auflauf." } }),

  F(Z, "B0012 ist nicht fangbar (PizzaFehler)", P`
probier { Pizza p = ((Käse, Tomate)); } verbrannt (a) { Bote.sage(("gefangen")); }
`, { exit: 2, out: [], fehler: { code: "B0012" } }),

  F(Z, "Eigener Belag Trüffel: preis über unten.preis()", TRÜFFEL + P`
Pizza p = ((Tomate, Trüffel));
Bote.sage((p.preis()));
`, { out: ["10.5"] }),

  F(Z, "Eigener Belag: beschreibung() auf Grundebene = Teig (Kl. 8)", TRÜFFEL + P`
Pizza p = ((Tomate, Trüffel));
Bote.sage((p.beschreibung()));
`, { out: ["edel: Teig"] }),

  F(Z, "beschreibung() ohne eigenen Belag → Teig", P`
Pizza p = ((Tomate));
Bote.sage((p.beschreibung()));
`, { out: ["Teig"] }),

  F(Z, "Dispatch durch Schicht ohne Methode (Standardpreis addiert)", TRÜFFEL + P`
Pizza p = ((Tomate, Trüffel, Salami));
Bote.sage((p.preis()));
Bote.sage((p.beschreibung()));
`, { out: ["12", "edel: Teig"] }),

  F(Z, "Dispatch: Reihenfolge der Decorators zählt", TRÜFFEL + P`
belag Gold auf Pizza {
    speisekarte funghi preis() { serviere ((unten.preis() * 2)); }
}
Pizza a = ((Tomate, Trüffel, Gold));
Pizza b = ((Tomate, Gold, Trüffel));
Bote.sage((a.preis()));
Bote.sage((b.preis()));
`, { out: ["21", "16.5"] }),

  F(Z, "Eigener Belag ohne preis(): Standardpreis 1.00", P`
belag Quark auf Pizza { }
Pizza p = ((Quark));
Bote.sage((p.preis()));
Bote.sage((p));
`, { out: ["6", "((Quark))"] }),

  F(Z, "Eingebauten Belag neu definieren: Preis-Default aus Tabelle", P`
belag Käse auf Pizza {
    speisekarte margherita beschreibung() { serviere (("käsig: " + unten.beschreibung())); }
}
Pizza p = ((Tomate, Käse));
Bote.sage((p.preis()));
Bote.sage((p.beschreibung()));
`, { out: ["7", "käsig: Teig"] }),

  F(Z, "dies im Belag = ganze Pizza", P`
belag Zähler auf Pizza {
    speisekarte salami schichten() { serviere ((dies.anzahlBeläge())); }
}
Pizza p = ((Tomate, Zähler, Salami));
Bote.sage((p.schichten()));
`, { out: ["3"] }),

  F(Z, "@Nach bei eigenem Belag → B0012", TRÜFFEL + P`
Pizza p = ((Trüffel, Tomate));
`, { exit: 2, fehler: { code: "B0012", text: "PizzaFehler B0012: 'Trüffel' liegt unter 'Tomate'. Das ist keine Pizza, das ist ein Auflauf." } }),

  F(Z, "@Nach darf eigene Beläge referenzieren (Kl. 8)", TRÜFFEL + P`
@Nach(Trüffel)
belag Blattgold auf Pizza { }
Pizza ok = ((Tomate, Trüffel, Blattgold));
Bote.sage((ok));
Pizza nö = ((Tomate, Blattgold, Trüffel));
`, { exit: 2, out: ["((Tomate, Trüffel, Blattgold))"], fehler: { code: "B0012", text: "PizzaFehler B0012: 'Blattgold' liegt unter 'Trüffel'. Das ist keine Pizza, das ist ein Auflauf." } }),

  F(Z, "Unbekannte Methode auf Pizza → LaufzeitAnanas", P`
Pizza p = ((Tomate));
p.foo();
`, { exit: 1, fehler: { code: "LaufzeitAnanas", textEnthält: "foo" } }),
];
