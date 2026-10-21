"use strict";
// Regressionstests zum Klärungsprotokoll KLAERUNGEN.md (K-001 …) bzw. SPEC §15.
// Erwartungen stammen aus SPEC/KLAERUNGEN – nicht aus dem Interpreter.
// Fälle, deren Umsetzung noch offen ist, liegen in a11-klaerungen-offen.js.
const { P, F } = require("../lib/helfer");
const K = "§15 Klärungen (K-001 …)";

const schritte = (soll) => (res) => (res.schritte === soll ? undefined : `schritte ${res.schritte}, erwartet ${soll}`);

module.exports = [
  // ── K-001 Pizza-Literal und Aufrufklammern ─────────────────────────────
  F(K, "K-001: Bote.sage((Salami)) ist ein Belag, kein Literal", P`
Bote.sage((Salami));
Bote.sage(((Salami)));
`, { out: ["Salami", "((Salami))"] }),

  F(K, "K-001: Zwei-Belag-Literal im Aufruf braucht drei Klammern", P`
Bote.sage(((Salami, Tomate)));
Bote.sage(((( Salami , Tomate ))).preis());
`, { out: ["((Salami, Tomate))", "7.5"] }),

  F(K, "K-001: Bote.sage((Salami, Tomate)) ist ein Syntaxfehler (P0001, Exit 2)", P`
Bote.sage((Salami, Tomate));
`, { exit: 2, fehler: { code: "P0001", art: "syntax", zeile: 1 } }),

  F(K, "K-001: ((X)) mit bekanntem Belagnamen gewinnt gegen gleichnamige Variable", P`
Pizza Salami = ((Tomate));
Bote.sage(((Salami)));
salami Kerstin = 3;
Bote.sage(((Kerstin)));
`, { out: ["((Salami))", "3"] }),

  // ── K-002 W0032 bei drei Schreibweisen ─────────────────────────────────
  F(K, "K-002: drei Schreibweisen im selben Scope → genau 2 Warnungen, Partner = früheste", P`
salami pizza = 1;
salami Pizza = 2;
salami PIZZA = 3;
Bote.sage((pizza + Pizza + PIZZA));
`, {
    out: ["6"], warnAnzahl: { W0032: 2 },
    check(res) {
      const w = res.ereignisse.filter((e) => e.typ === "warnung" && e.code === "W0032").map((e) => e.text);
      const soll = [
        "W0032: 'pizza' und 'Pizza' sind im selben Scope definiert. Selbst der Pizzaiolo verwechselt die beiden.",
        "W0032: 'pizza' und 'PIZZA' sind im selben Scope definiert. Selbst der Pizzaiolo verwechselt die beiden.",
      ];
      return JSON.stringify(w) === JSON.stringify(soll) ? undefined : "W0032-Texte: " + JSON.stringify(w);
    },
  }),

  // ── K-003 Zahlliterale & unäres Minus ───────────────────────────────────
  F(K, "K-003: Exponent-Schreibweise ist kein Zahlliteral (Syntaxfehler)", P`
Bote.sage((1e3));
`, { exit: 2, fehler: { code: "P0001", art: "syntax" } }),

  F(K, "K-003: führender Punkt ist kein Zahlliteral", P`
Bote.sage((.5));
`, { exit: 2, fehler: { code: "P0001", art: "syntax" } }),

  F(K, "K-003: -2.5.runden() = -(2.5.runden()); (-2.5).runden() = -3; Literalfaltung nur bei nacktem -Zahl", P`
Bote.sage((-2.5.runden()));
Bote.sage(((-2.5).runden()));
Bote.sage((-1));
Bote.sage((-(1)));
Bote.sage(((-5).euro()));
`, { out: ["-3", "-3", "-1", "-1", "-5,00 €"] }),

  F(K, "K-003: -x.euro() ist -(x.euro()) → TypAnanas (Text negieren)", P`
Bote.sage((-0.5.euro()));
`, { exit: 1, fehler: { code: "TypAnanas", art: "ananas" } }),

  // ── K-004 salami-Wertebereich ───────────────────────────────────────────
  F(K, "K-004: kein 32-Bit-Überlauf; ganzzahlige Rechnung bis 2^53 exakt", P`
salami x = 2147483647;
x++;
Bote.sage((x));
salami y = 4294967296 * 4294967296;
Bote.sage((y));
salami z = 9007199254740992;
Bote.sage((z + 1 == z));
Bote.sage((1000000000 * 1000000000 * 1000));
`, { out: ["2147483648", "18446744073709552000", "ja", "1e+21"] }),

  // ── K-005 NaN / Infinity ────────────────────────────────────────────────
  F(K, "K-005: wurzel(-1) ist NaN (funghi), NaN != NaN; Überlauf ist Infinity", P`
Bote.sage((Mathe.wurzel(-1)));
Bote.sage((Mathe.wurzel(-1) == Mathe.wurzel(-1)));
funghi f = Mathe.potenz(10, 400);
Bote.sage((f));
Bote.sage((-f));
`, { out: ["NaN", "nein", "Infinity", "-Infinity"] }),

  F(K, "K-005: salami kann Infinity nicht halten (TypAnanas); Division durch 0 bleibt RechenAnanas", P`
probier { salami s = Mathe.potenz(10, 400); } verbrannt (TypAnanas a) { Bote.sage(("typ")); }
probier { funghi g = 1.0 / 0.0; } verbrannt (RechenAnanas a) { Bote.sage(("rechen")); }
`, { out: ["typ", "rechen"] }),

  // ── K-006 Restoperator ─────────────────────────────────────────────────
  F(K, "K-006: % trägt das Vorzeichen des Dividenden, auch bei Kommazahlen", P`
Bote.sage((10 % 3));
Bote.sage((-10 % 3));
Bote.sage((10 % -3));
Bote.sage((7.5 % 2));
Bote.sage((-7.5 % 2));
`, { out: ["1", "-1", "1", "1.5", "-1.5"] }),

  // ── K-009 / K-010 Eingabe ───────────────────────────────────────────────
  F(K, "K-009: lies() trimmt nicht, entfernt nur den Zeilenumbruch; leere Zeile ist \"\"", P`
Bote.sage(("[" + Bestellannahme.lies() + "]"));
Bote.sage(("[" + Bestellannahme.lies() + "]"));
Bote.sage((Bestellannahme.lies().länge()));
Bote.sage((Bestellannahme.lies().länge()));
`, { eingabe: ["  42  ", "", "äöü 😀", "a\r\n"], out: ["[  42  ]", "[]", "5", "1"] }),

  F(K, "K-009: liesZahl trimmt und akzeptiert Dezimalkomma; ungültige Zeile ist verbraucht", P`
Bote.sage((Bestellannahme.liesZahl()));
Bote.sage((Bestellannahme.liesZahl()));
probier { Bestellannahme.liesZahl(); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
Bote.sage((Bestellannahme.lies()));
`, { eingabe: [" 42 ", "3,5", "abc", "danach"], out: ["42", "3.5", "'abc' ist keine Zahl.", "danach"] }),

  F(K, "K-009: EOF → karton (wiederholt), hatMehr nein; Prompt wird auch bei EOF ausgegeben", P`
Bote.sage((Bestellannahme.lies()));
Bote.sage((Bestellannahme.liesZahl()));
Bote.sage((Bestellannahme.hatMehr()));
Bote.sage((Bestellannahme.frage("Name? ")));
`, {
    eingabe: [], out: ["karton", "karton", "nein", "Name? ", "karton"],
    check(res) {
      const a = res.ereignisse.filter((e) => e.typ === "ausgabe");
      const p = a.find((e) => e.text === "Name? ");
      if (!p || p.umbruch !== false) return "Prompt-Ereignis braucht umbruch:false";
      const ein = res.ereignisse.filter((e) => e.typ === "eingabe").map((e) => e.text);
      return JSON.stringify(ein) === JSON.stringify([null, null, null]) ? undefined : "eingabe-Ereignisse: " + JSON.stringify(ein);
    },
  }),

  F(K, "K-009: EOF-karton in salami/funghi ist der übliche Typfehler (TypAnanas)", P`
salami n = Bestellannahme.liesZahl();
`, { eingabe: [], exit: 1, fehler: { code: "TypAnanas", art: "ananas", zeile: 1 } }),

  F(K, "K-010: Lesen kostet nur die Aufrufknoten (3 Schritte für Bestellannahme.lies();), Warten nichts", P`
Bote.sage((Uhr.jetzt()));
Bestellannahme.lies();
Bote.sage((Uhr.jetzt()));
`, { eingabe: ["a"], out: ["5ms", "13ms"], check: schritte(13) }),

  F(K, "K-010: Eingabe im Ofen verbraucht kein Budget über die Aufrufknoten hinaus", P`
salami s = ofen(zeit: 20ms) { margherita a = Bestellannahme.lies(); margherita b = Bestellannahme.lies(); serviere (1); } roh (r) { serviere (0); };
Bote.sage((s));
`, { eingabe: ["a", "b"], out: ["1"] }),

  F(K, "K-010: Eingabe bleibt in der wennDa-Phase nach Programmende verfügbar; Kühlschrank liest nicht erneut", P`
klasse K { @Kühlschrank(haltbar: 1h) margherita m() { serviere (Bestellannahme.lies()); } }
K k = neu K();
Bote.sage((k.m()));
Bote.sage((k.m()));
Lieferung<salami> l = bestelle(() -> 1);
l.wennDa(x -> Bote.sage(("da " + Bestellannahme.lies())));
Bote.sage(("ende"));
`, { eingabe: ["a", "b"], out: ["a", "a", "ende", "da b"] }),

  F(K, "K-031: Bote.schreibe → ausgabe mit umbruch:false; Bote.leeren → Ereignis leeren; eingabe-Ereignis nach jeder Zeile", P`
Bote.schreibe(("a"));
Bote.sage(("b"));
Bote.leeren();
Bote.sage((Bestellannahme.lies()));
`, {
    eingabe: ["x"], out: ["a", "b", "x"],
    check(res) {
      const t = res.ereignisse.map((e) => e.typ + (e.typ === "ausgabe" ? (e.umbruch === false ? "-" : "+") : ""));
      const soll = ["ausgabe-", "ausgabe+", "leeren", "eingabe", "ausgabe+", "ende"];
      return JSON.stringify(t) === JSON.stringify(soll) ? undefined : "Ereignisfolge " + JSON.stringify(t);
    },
  }),

  // ── K-016 Besitz ────────────────────────────────────────────────────────
  F(K, "K-016: BesitzAnanas nur bei rechter Seite = Name/Feld (auch geklammert)", P`
Pizza p = ((Tomate));
probier { Pizza q = (p); } verbrannt (BesitzAnanas a) { Bote.sage(("besitz")); }
Pizza r = ja ? p : p;
Blech<Pizza> b = [p];
Speisekarte<margherita, Pizza> m = neu Speisekarte<margherita, Pizza>();
m.lege("a", p);
Pizza s = m.hole("a");
Bote.sage((r == s));
`, { out: ["besitz", "ja"] }),

  F(K, "K-016: schieb funktioniert für Variablen jeden Typs, nicht für Felder", P`
salami x = 5;
salami y = schieb(x);
Bote.sage((y));
probier { Bote.sage((x)); } verbrannt (LeererKartonAnanas a) { Bote.sage(("weg")); }
klasse K { Pizza p = ((Tomate)); }
K k = neu K();
probier { Pizza q = schieb(k.p); } verbrannt (LaufzeitAnanas a) { Bote.sage(("nur Namen")); }
`, { out: ["5", "weg", "nur Namen"] }),

  // ── K-017 Identität von Pizzen und Schlüsseln ───────────────────────────
  F(K, "K-017: p + Belag hat wieder 8 Stücke; Blech.enthält vergleicht Pizzen nach Belägen", P`
Pizza p = ((Tomate));
teile(p);
Pizza q = p + Salami - Salami;
Bote.sage((p.übrig() + " " + q.übrig()));
Bote.sage((q == p));
Bote.sage(([((Tomate))].enthält(((Tomate)))));
`, { out: ["7 8", "ja", "ja"] }),

  F(K, "K-017: Speisekarten-Schlüssel: Zahl/Text/karton nach Wert (1 = 1.0), Beläge nach Name, Pizzen nach Identität", P`
Speisekarte<salami, margherita> m = neu Speisekarte<salami, margherita>();
m.lege(1, "eins");
m.lege(1.0, "einsnull");
m.lege("1", "text");
Bote.sage((m.länge() + " " + m.hole(1)));
m.lege(karton, "leer");
Bote.sage((m.hat(karton)));
Speisekarte<Pizza, salami> n = neu Speisekarte<Pizza, salami>();
n.lege(((Tomate)), 1);
Bote.sage((n.hat(((Tomate)))));
n.lege(Salami, 2);
Bote.sage((n.hat(Salami) + " " + n.hat("Salami")));
`, { out: ["2 einsnull", "ja", "nein", "ja ja"] }),

  // ── K-018 Kühlschrank-Schlüssel ─────────────────────────────────────────
  F(K, "K-018: Cache-Schlüssel = Textform (Blech/Pizza nach Inhalt), Objekte nach Identität; Ananas nicht gecacht", P`
klasse P { salami v; P(salami v) { dies.v = v; } speisekarte margherita alsText() { serviere ("P"); } }
klasse K {
  @Kühlschrank(haltbar: 1h) salami m(Blech<salami> b) { Bote.sage(("rechne m")); serviere (b.länge()); }
  @Kühlschrank(haltbar: 1h) salami o(P p) { Bote.sage(("rechne o")); serviere (p.v); }
  @Kühlschrank(haltbar: 1h) salami w(salami a) { wirf neu StreitAnanas("nein"); }
}
K k = neu K();
Blech<salami> b = [1];
k.m(b);
b.hinzu(2);
Bote.sage((k.m(b)));
Bote.sage((k.m([1, 2])));
P a = neu P(1);
k.o(a); k.o(a); k.o(neu P(1));
probier { k.w(1); } verbrannt (StreitAnanas x) { Bote.sage(("1")); }
probier { k.w(1); } verbrannt (StreitAnanas x) { Bote.sage(("2")); }
`, { out: ["rechne m", "rechne m", "2", "2", "rechne o", "rechne o", "1", "2"] }),

  F(K, "K-018: gecachte Pizza ist dasselbe Objekt (übrig geteilt)", P`
klasse K { @Kühlschrank(haltbar: 1h) Pizza m() { serviere (((Tomate))); } }
K k = neu K();
Pizza a = k.m();
Pizza b = k.m();
teile(a);
Bote.sage((b.übrig()));
`, { out: ["7"] }),

  // ── K-019 Lieferung ─────────────────────────────────────────────────────
  F(K, "K-019: wennDa ersetzt den früheren Rückruf", P`
Lieferung<salami> l = bestelle(() -> { Bote.sage(("laufe")); serviere (1); });
l.wennDa(x -> Bote.sage(("a " + x)));
l.wennDa(x -> Bote.sage(("b " + x)));
`, { out: ["laufe", "b 1"] }),

  F(K, "K-019: negatives/gebrochenes Trinkgeld erlaubt; Faktor ≤ 0 → sofort zu spät; zu spät ist endgültig", P`
Lieferung<salami> l = bestelle(() -> 1);
l.trinkgeld(2.5);
Bote.sage((l.warte(max: 1ms).wert()));
Lieferung<salami> m = bestelle(() -> 1);
m.trinkgeld(-10);
Bote.sage((m.warte(max: 1h).pünktlich()));
m.trinkgeld(100);
Bote.sage((m.warte(max: 1h).pünktlich()));
`, { out: ["1", "nein", "nein"] }),

  // ── K-020 Ofen-Randwerte ────────────────────────────────────────────────
  F(K, "K-020: temperatur 0 / zeit 0 → Budget 0 → roh; 485 ist erlaubt, 485.5 nicht", P`
Bote.sage((ofen(zeit: 1h, temperatur: 0) { serviere (1); } roh (r) { serviere (0); }));
Bote.sage((ofen(zeit: 0ms) { serviere (1); } roh (r) { serviere (0); }));
Bote.sage((ofen(temperatur: 485) { serviere (1); }));
Bote.sage((ofen(temperatur: 485.5) { serviere (1); } verbrannt (VerbranntAnanas a) { serviere (-1); }));
`, { out: ["0", "0", "1", "-1"] }),

  // ── K-021 Bereich ───────────────────────────────────────────────────────
  F(K, "K-021: Bereich mit Kommazahlen, absteigend, Obergrenze 10 000 001 Elemente", P`
Bote.sage(([0.5 .. 2.5]));
Bote.sage(([3 .. 1.5]));
Bote.sage(([1 .. 1]));
Bote.sage(([1 .. 10000001].länge()));
probier { Blech<salami> b = [1 .. 10000002]; } verbrannt (RechenAnanas a) { Bote.sage((a.nachricht())); }
probier { Blech<salami> b = [1 .. karton]; } verbrannt (TypAnanas a) { Bote.sage(("typ")); }
`, { out: ["[0.5, 1.5, 2.5]", "[3, 2]", "[1]", "10000001", "Der Bereich ist zu groß für ein Blech.", "typ"] }),

  // ── K-022 sortiere ──────────────────────────────────────────────────────
  F(K, "K-022: sortiere ist stabil; nur das Vorzeichen zählt; Nicht-Zahl → TypAnanas; diavolo/Pizza nicht vergleichbar", P`
Bote.sage((["bb", "a", "cc", "d"].sortiere((x, y) -> x.länge() - y.länge())));
Bote.sage(([3, 1, 2].sortiere((x, y) -> 0)));
Bote.sage(([3, 1, 2].sortiere((x, y) -> x > y ? 1 : -1)));
probier { [2, 1].sortiere((x, y) -> ja); } verbrannt (TypAnanas a) { Bote.sage(("typ")); }
probier { [ja, nein].sortiere(); } verbrannt (TypAnanas a) { Bote.sage(("typ2")); }
`, { out: ["[a, d, bb, cc]", "[3, 1, 2]", "[1, 2, 3]", "typ", "typ2"] }),

  // ── K-023 Preisrundung ──────────────────────────────────────────────────
  F(K, "K-023: Standardbeläge je Schicht auf Cent gerundet, eigene preis()-Methoden ungerundet; Ananas.preis() = 0", P`
Bote.sage((((Tomate, Chili, Knoblauch)).preis()));
Bote.sage((((Tomate, Chili, Knoblauch, Kapern)).preis()));
@Nach(Tomate)
belag Trüffel auf Pizza { speisekarte funghi preis() { serviere ((unten.preis() + 4.555)); } }
Bote.sage((((Tomate, Trüffel)).preis()));
Bote.sage((((Tomate, Trüffel, Chili)).preis()));
belag Gold auf Pizza { }
Bote.sage((((Gold)).preis() + " " + Gold.preis()));
Bote.sage((Ananas.preis()));
`, { out: ["6.8", "7.5", "10.555", "11.06", "6 1", "0"], warn: ["W0666"] }),

  // ── K-024 Nachgestellte Kommas ──────────────────────────────────────────
  F(K, "K-024: nachgestelltes Komma erlaubt in Blech-Literal und quattrostagioni", P`
Blech<salami> b = [1, 2,];
Bote.sage((b));
quattrostagioni Q { A, B, C, D, }
Bote.sage((Q.werte()));
`, { out: ["[1, 2]", "[A, B, C, D]"] }),

  F(K, "K-024: nachgestelltes Komma im Pizza-Literal ist ein Syntaxfehler", P`
Pizza p = ((Tomate, Käse,));
`, { exit: 2, fehler: { code: "P0001", art: "syntax" } }),

  F(K, "K-024: nachgestelltes Komma in Argumentliste ist ein Syntaxfehler", P`
leer f(salami a) { }
f(1,);
`, { exit: 2, fehler: { code: "P0001", art: "syntax", zeile: 2 } }),

  // ── K-025 Escapes ───────────────────────────────────────────────────────
  F(K, "K-025: erlaubte Escapes \\n \\t \\r \\\" \\\\ \\'", P`
Bote.sage(("a\tb|\\|\"|\'|" + "x\ry".länge() + "|" + "p\nq".länge()));
`, { out: ["a\tb|\\|\"|'|3|3"] }),

  F(K, "K-025: \\q (und \\u) sind keine Escapes (Syntaxfehler)", P`
Bote.sage(("\q"));
`, { exit: 2, fehler: { code: "P0001", art: "syntax", textEnthält: "Escape" } }),

  F(K, "K-025: Zeilenumbruch im Text ist ein Syntaxfehler", P`
Bote.sage(("a
b"));
`, { exit: 2, fehler: { code: "P0001", art: "syntax", zeile: 1 } }),

  // ── K-026 Hawaii-Auslöser ───────────────────────────────────────────────
  F(K, "K-026: hawaii-Deklaration ohne Wert → nur W0666; Zuweisung von karton → Panik", P`
hawaii x;
Bote.sage(("ok"));
hawaii y = karton;
Bote.sage(("nie"));
`, { exit: 39, out: ["ok"], panik: true, warnAnzahl: { W0666: 1 } }),

  F(K, "K-026: Belag-Wert Ananas allein (sage, hat, -) → keine Panik, W0666 genau einmal", P`
Pizza p = ((Tomate));
Bote.sage((Ananas));
Bote.sage((p.hat(Ananas)));
Bote.sage((p - Ananas));
Blech<hawaii> b = [1];
Bote.sage((b));
`, { out: ["Ananas", "nein", "((Tomate))", "[1]"], warnAnzahl: { W0666: 1 } }),

  F(K, "K-026: Q.Ananas und Methodenname Ananas lösen weder W0666 noch Panik aus", P`
quattrostagioni Q { A, B, C, Ananas }
klasse K { leer Ananas() { Bote.sage(("m")); } }
Bote.sage((Q.Ananas));
neu K().Ananas();
`, { out: ["Ananas", "m"], noWarn: ["W0666"] }),

  F(K, "K-026: Panik in der wennDa-Phase nach Programmende → Exit 39", P`
Lieferung<salami> l = bestelle(() -> { Pizza p = ((Ananas)); serviere (1); });
l.wennDa(x -> Bote.sage((x)));
Bote.sage(("ende"));
`, { exit: 39, out: ["ende"], panik: true }),

  F(K, "K-026: hawaii-Parameter mit karton → Panik; neu Hawaii() ohne Klasse → Panik", P`
leer f(hawaii h) { }
Bote.sage(("vorher"));
f(karton);
`, { exit: 39, out: ["vorher"], panik: true }),

  // ── K-027 Textform-Mehrdeutigkeit ───────────────────────────────────────
  F(K, "K-027: \"\".zerlege(\",\") hat Länge 1; leerer Text im Blech ist unsichtbar", P`
Bote.sage(("".zerlege(",").länge()));
Bote.sage(([""]));
Bote.sage(([karton, "", "a"]));
Bote.sage(("".zerlege("").länge()));
`, { out: ["1", "[]", "[karton, , a]", "0"] }),

  // ── K-029 Spiegel & Calzone ─────────────────────────────────────────────
  F(K, "K-029: Spiegel.felder ohne statische Felder, Basis zuerst; karton → LeererKartonAnanas; aufklappen nur Calzone", P`
klasse B { salami x = 1; }
klasse K erbt B { tiefkühl salami s = 9; salami y = 2; }
Bote.sage((Spiegel.felder(neu K())));
probier { Spiegel.felder(karton); } verbrannt (LeererKartonAnanas a) { Bote.sage(("leer")); }
probier { Spiegel.felder(((Tomate))); } verbrannt (TypAnanas a) { Bote.sage(("typ")); }
probier { neu K().aufklappen(); } verbrannt (LaufzeitAnanas a) { Bote.sage(("keine Calzone")); }
`, { out: ["{x: 1, y: 2}", "leer", "typ", "keine Calzone"] }),

  F(K, "K-029: Calzone-Unterklasse ist zugeklappt; aufklappen zweimal → W0013 je Stelle; speisekarte-Felder bleiben lesbar", P`
calzone klasse B { geheimrezept salami g = 1; speisekarte salami o = 2; }
klasse K erbt B { }
K k = neu K();
Bote.sage((k.o));
probier { Spiegel.felder(k); } verbrannt (ZugeklapptAnanas a) { Bote.sage(("zu")); }
k.aufklappen();
k.aufklappen();
Bote.sage((k.g));
`, { out: ["2", "zu", "1"], warnAnzahl: { W0013: 2 } }),

  // ── K-033 hauptgang-Signatur ────────────────────────────────────────────
  F(K, "K-033: hauptgang-Signatur ungeprüft: erster Parameter erhält das Args-Blech, Rückgabewert ignoriert, erste Klasse gewinnt", P`
klasse A { tiefkühl salami hauptgang(Blech<margherita> a) { Bote.sage(("A " + a)); serviere (7); } }
klasse B { tiefkühl leer hauptgang(Blech<margherita> a) { Bote.sage(("B")); } }
`, { args: ["x", "y"], out: ["A [x, y]"] }),

  F(K, "K-033: hauptgang ohne Parameter ist erlaubt", P`
klasse A { tiefkühl leer hauptgang() { Bote.sage(("ohne")); } }
`, { out: ["ohne"] }),

  // ── K-035 Teig ──────────────────────────────────────────────────────────
  F(K, "K-035: istAufgegangen() nur nach gehenlassen(), nicht nach backen()", P`
Teig<salami> t = teig(() -> (42));
Bote.sage((t.istAufgegangen()));
Bote.sage((t.backen()));
Bote.sage((t.istAufgegangen()));
Bote.sage((t));
t.gehenlassen();
Bote.sage((t.istAufgegangen()));
`, { out: ["nein", "42", "nein", "Teig(42)", "ja"], warnAnzahl: { T0007: 1 } }),

  // ── K-036 serviere und Rückgabetyp ──────────────────────────────────────
  F(K, "K-036: Rückgabetyp ungeprüft: serviere; → karton, serviere (x) in leer liefert x, kein serviere → karton", P`
tiefkühl salami f() { serviere; }
leer g() { serviere ((5)); }
salami h() { }
Bote.sage((f()));
Bote.sage((g()));
Bote.sage((h()));
`, { out: ["karton", "5", "karton"] }),

  // ── K-037 Basiskonstruktor ──────────────────────────────────────────────
  F(K, "K-037: ohne unten(…) wird der parameterlose Basiskonstruktor gesucht – fehlt er → LaufzeitAnanas (Arität)", P`
klasse Basis { Basis(salami x) { Bote.sage(("basis " + x)); } }
klasse Kind erbt Basis { Kind() { } }
klasse Durchreicher erbt Basis { }
neu Durchreicher(7);
neu Kind();
`, { exit: 1, out: ["basis 7"], fehler: { code: "LaufzeitAnanas", art: "ananas", zeile: 5,
      text: "Ungefangene Ananas – LaufzeitAnanas: Konstruktor von 'Basis' erwartet 1 Argument, bekam 0. (Zeile 5)" } }),

  // ── K-039 Pizza-Methoden mit Text ───────────────────────────────────────
  F(K, "K-039: hat(\"Tomate\") wie hat(Tomate); Pizza + Text ist Textverkettung", P`
Pizza p = ((Tomate));
Bote.sage((p.hat("Tomate")));
Bote.sage((p.hat("Käse")));
Bote.sage((p + "!"));
Bote.sage(("Pizza: " + p));
`, { out: ["ja", "nein", "((Tomate))!", "Pizza: ((Tomate))"] }),

  // ── K-048 Rundungsformel ────────────────────────────────────────────────
  F(K, "K-048: Rundung half-away-from-zero, Epsilon nur bei runden(n>0) und euro()", P`
Bote.sage((2.675.runden(2)));
Bote.sage((1.005.runden(2)));
Bote.sage((0.125.runden(2)));
Bote.sage((Mathe.runden(2.675, 2)));
Bote.sage((0.5.runden()));
Bote.sage((1.5.runden()));
Bote.sage(((-0.5).runden()));
Bote.sage((Mathe.runden(-2.5)));
Bote.sage((0.015.euro()));
Bote.sage(((-0.001).euro()));
Bote.sage(((-2.5).euro()));
`, { out: ["2.68", "1.01", "0.13", "2.68", "1", "2", "-1", "-3", "0,02 €", "0,00 €", "-2,50 €"] }),

  // ── K-049 Zufall ────────────────────────────────────────────────────────
  F(K, "K-049: mulberry32 Seed 42 – die ersten zehn Werte von zahl(1, 6); Nicht-Ganzzahl → TypAnanas", P`
Blech<salami> b = [];
für (salami i = 1; i <= 10; i++) { b.hinzu(Zufall.zahl(1, 6)); }
Bote.sage((b));
probier { Zufall.zahl(1.5, 6); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
`, { out: ["[4, 3, 6, 5, 2, 4, 2, 4, 6, 3]", "Zufall.zahl braucht eine Ganzzahl, nicht 1.5."] }),

  // ── K-053 schrittLimit-Sonderwerte ──────────────────────────────────────
  F(K, "K-053: nicht-ganzzahliges schrittLimit 10.5 → P0002 beim Schritt 11", P`
solange (ja) { }
`, { exit: 3, schrittLimit: 10.5, fehler: { code: "P0002", art: "limit" }, check: schritte(11) }),

  // API-Fall (Hauptthread): der Prüfstand-Arbeiter ersetzt ein falsy schrittLimit selbst, daher direkt über L.run.
  {
    p: K, name: "K-053: schrittLimit 0 / NaN / -5 → Standardlimit, Programm läuft normal durch",
    api(L) {
      const err = [];
      for (const lim of [0, NaN, -5]) {
        const r = L.run("Bote.sage((1));", { schrittLimit: lim });
        if (r.exitCode !== 0 || r.schritte !== 4) err.push(`schrittLimit ${lim}: exit ${r.exitCode}, schritte ${r.schritte}`);
      }
      const r2 = L.run("solange (ja) { }", { schrittLimit: 10.5 });
      if (r2.exitCode !== 3 || r2.schritte !== 11) err.push(`schrittLimit 10.5: exit ${r2.exitCode}, schritte ${r2.schritte} (erwartet 3/11)`);
      return err.length ? err.join("; ") : undefined;
    },
  },

  // ── K-007 einheitliche Zahltext-Grammatik (alsZahl, liesZahl, frageZahl) – umgesetzt in 0d34810 ─
  F(K, "K-007: alsZahl akzeptiert Dezimalkomma und Unterstriche, trimmt Leerraum", P`
Bote.sage(("3,5".alsZahl()));
Bote.sage((" 42 ".alsZahl()));
Bote.sage(("1_000".alsZahl()));
Bote.sage(("-7".alsZahl()));
Bote.sage(("+7".alsZahl()));
Bote.sage(("1_000,5".alsZahl()));
`, { out: ["3.5", "42", "1000", "-7", "7", "1000.5"] }),

  F(K, "K-007: alsZahl lehnt Hex, Exponent, führenden/abschließenden Punkt und Sonderwerte ab", P`
Blech<margherita> t = ["0x1A", "1e2", ".5", "5.", "Infinity", "NaN", "0b101", "1.5,2", "", "abc"];
für (margherita s : t) {
  probier { Bote.sage((s.alsZahl())); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
}
`, { out: ['"0x1A" ist keine Zahl.', '"1e2" ist keine Zahl.', '".5" ist keine Zahl.', '"5." ist keine Zahl.',
      '"Infinity" ist keine Zahl.', '"NaN" ist keine Zahl.', '"0b101" ist keine Zahl.', '"1.5,2" ist keine Zahl.',
      '"" ist keine Zahl.', '"abc" ist keine Zahl.'] }),

  F(K, "K-007: liesZahl akzeptiert Unterstriche, lehnt Hex/Exponent/.5/5. ab (gleiche Grammatik wie alsZahl)", P`
salami i = 0;
solange (i < 7) {
  i++;
  probier { Bote.sage((Bestellannahme.liesZahl())); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
}
`, { eingabe: ["1_000", "3,5", "0x10", "1e3", ".5", "5.", " +4 "],
     out: ["1000", "3.5", "'0x10' ist keine Zahl.", "'1e3' ist keine Zahl.", "'.5' ist keine Zahl.", "'5.' ist keine Zahl.", "4"] }),

  // ── K-008 liesZahl/frageZahl mit Ersatzwert bei EOF ──────────────────────
  F(K, "K-008: liesZahl(ersatz) / frageZahl(text, ersatz) liefern den Ersatzwert bei EOF", P`
funghi a = Bestellannahme.liesZahl(7);
Bote.sage((a));
salami b = Bestellannahme.frageZahl("Zahl? ", 0);
Bote.sage((b));
salami c = Bestellannahme.liesZahl(ersatz: -1);
Bote.sage((c));
`, { eingabe: ["2,5"], out: ["2.5", "Zahl? ", "0", "-1"] }),

  F(K, "K-008: der Ersatzwert gilt nur bei EOF – ungültige Zahl bleibt TypAnanas", P`
probier { Bote.sage((Bestellannahme.liesZahl(0))); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
Bote.sage((Bestellannahme.liesZahl(0)));
`, { eingabe: ["abc"], out: ["'abc' ist keine Zahl.", "0"] }),

  // ── K-015 abbrechen/weiter außerhalb einer Schleife ──────────────────────
  F(K, "K-015: abbrechen im Methodenrumpf außerhalb einer Schleife → PizzaFehler P0012 (Exit 2)", P`
leer f() {
  Bote.sage(("a"));
  abbrechen;
}
f();
`, { exit: 2, fehler: { code: "P0012", art: "syntax", zeile: 3, text: "PizzaFehler P0012: 'abbrechen' steht außerhalb einer Schleife." } }),

  F(K, "K-015: weiter in einem Lambda innerhalb einer Schleife → P0012 (Lambda-Grenze trennt)", P`
für (salami i = 0; i < 2; i++) {
  salami x = (() -> { weiter; })();
}
`, { exit: 2, fehler: { code: "P0012", art: "syntax", zeile: 2, text: "PizzaFehler P0012: 'weiter' steht außerhalb einer Schleife." } }),

  F(K, "K-015: abbrechen im Ofen-Block ohne Schleife → P0012", P`
salami s = ofen { abbrechen; };
`, { exit: 2, fehler: { code: "P0012", art: "syntax", zeile: 1 } }),

  F(K, "K-015: abbrechen in wähle-Anweisungs-Arm und in Schleifen bleibt erlaubt", P`
für (salami i : [1, 2, 3]) {
  wähle (i) { fall 2 -> { abbrechen; } standard -> Bote.sage((i)); }
}
salami n = 0;
solange (ja) { n++; falls (n > 2) { abbrechen; } }
Bote.sage((n));
`, { out: ["1", "3", "3"] }),

  {
    p: K, name: "K-015: P0012 ist ein Parse-Fehler (PizzaLang.parse meldet ihn)",
    api(L) {
      const r = L.parse("leer f() { abbrechen; }");
      return r && r.ok === false && r.fehler && r.fehler.code === "P0012" ? undefined : "Ergebnis: " + JSON.stringify(r).slice(0, 200);
    },
  },

  // ── K-055 wähle-Ausdruck: Block-Arme beginnen einen neuen Kontext ────────
  F(K, "K-055: abbrechen/weiter im Block-Arm eines wähle-Ausdrucks → P0012, auch innerhalb einer Schleife", P`
für (salami i : [1, 2]) {
  salami r = wähle (i) { fall 1 -> { abbrechen; } standard -> 0; };
}
`, { exit: 2, fehler: { code: "P0012", art: "syntax", zeile: 2, text: "PizzaFehler P0012: 'abbrechen' steht außerhalb einer Schleife." } }),

  F(K, "K-055: serviere im Block-Arm eines wähle-Ausdrucks liefert den Wert des Ausdrucks", P`
salami r = wähle (1) { fall 1 -> { serviere (5); } standard -> 0; };
Bote.sage((r));
`, { out: ["5"] }),

  // ── K-038 auto nur in schneide ────────────────────────────────────────────
  F(K, "K-038: auto außerhalb von schneide(auto) → LaufzeitAnanas 'auto' ist nicht definiert.", P`
Bote.sage(([1, 2].schneide(auto).länge()));
Bote.sage((auto));
`, { exit: 1, out: ["8"], fehler: { code: "LaufzeitAnanas", art: "ananas", zeile: 2,
      text: "Ungefangene Ananas – LaufzeitAnanas: 'auto' ist nicht definiert. (Zeile 2)" } }),

  // ── K-042 EOF ist endgültig ───────────────────────────────────────────────
  F(K, "K-042: nach EOF (null-Eintrag) liefert jeder weitere Leseversuch karton, hatMehr nein", P`
Bote.sage((Bestellannahme.lies()));
Bote.sage((Bestellannahme.lies()));
Bote.sage((Bestellannahme.lies()));
Bote.sage((Bestellannahme.hatMehr()));
`, { eingabe: ["x", null, "y"], out: ["x", "karton", "karton", "nein"] }),

  // ── K-047 ganzzahlige Uhr ─────────────────────────────────────────────────
  F(K, "K-047: Uhr.vorspulen rundet auf ganze ms; zeitMs bleibt ganzzahlig", P`
Uhr.vorspulen(0.5ms);
Uhr.vorspulen(0.4ms);
Uhr.vorspulen(10s / 3);
Bote.sage((Uhr.jetzt().inMs()));
`, { out: ["3354"], check: (res) => (res.zeitMs === 3354 ? undefined : "zeitMs " + res.zeitMs + ", erwartet 3354") }),

  F(K, "K-076: ersetze mit leerem Suchtext lässt den Text unverändert (auch Surrogatpaare bleiben heil)", P`
Bote.sage(("ab".ersetze("", "-")));
Bote.sage(("🍕".ersetze("", "-")));
Bote.sage(("🍕".ersetze("", "-").länge()));
Bote.sage(("🍕x".ersetze("x", "-")));
`, { out: ["ab", "🍕", "1", "🍕-"] }),
];
