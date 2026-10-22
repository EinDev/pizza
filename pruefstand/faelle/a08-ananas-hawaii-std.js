"use strict";
const { P, F, BANNER } = require("../lib/helfer");
const A = "§8 Ananas";
const H = "§9 Hawaii";
const W = "§10 Warnungen";
const S = "§11 Standardbibliothek";
const X = "§12 Exit-Codes";

const W0666 = "Typ 'hawaii' gefunden. Der Pizzaiolo sagt nichts. Er schaut nur.";

module.exports = [
  // ───────── §8 ─────────
  F(A, "neu XAnanas(...): nachricht, holeNachricht, typ", P`
VerbranntAnanas a = neu VerbranntAnanas("heiß");
Bote.sage((a.nachricht()));
Bote.sage((a.holeNachricht()));
Bote.sage((a.typ()));
`, { out: ["heiß", "heiß", "VerbranntAnanas"], noWarn: ["W0666"] }),

  F(A, "Ungefangene Ananas: Ereignistext, Code, art, Zeile, Exit 1", P`
Bote.sage(("vor"));
wirf neu StreitAnanas("Pizza ist alle.");
Bote.sage(("nie"));
`, {
    exit: 1, out: ["vor"],
    fehler: { code: "StreitAnanas", art: "ananas", text: "Ungefangene Ananas – StreitAnanas: Pizza ist alle. (Zeile 2)", zeile: 2 },
  }),

  F(A, "Eigene Ananas erbt LaufzeitAnanas, fangbar über Basistyp", P`
klasse MeineAnanas erbt LaufzeitAnanas {
    speisekarte MeineAnanas(margherita m) { unten(m); }
}
probier { wirf neu MeineAnanas("eigen"); }
verbrannt (LaufzeitAnanas a) { Bote.sage((a.typ() + " / " + a.nachricht())); }
`, { out: ["MeineAnanas / eigen"] }),

  F(A, "verbrannt (Ananas a) fängt alles, kein W0666 (Kl. 18)", P`
probier { wirf neu RechenAnanas("r"); } verbrannt (Ananas a) { Bote.sage((a)); }
`, { out: ["RechenAnanas: r"], noWarn: ["W0666"] }),

  F(A, "Hierarchie: GeprüfteAnanas fängt LieferAnanas, nicht LaufzeitAnanas", P`
probier { wirf neu LieferAnanas("kalt"); } verbrannt (LaufzeitAnanas a) { Bote.sage(("falsch")); } verbrannt (GeprüfteAnanas g) { Bote.sage(("geprüft")); }
probier { wirf neu TypAnanas("t"); } verbrannt (GeprüfteAnanas g) { Bote.sage(("falsch")); } verbrannt (LaufzeitAnanas a) { Bote.sage(("laufzeit")); }
`, { out: ["geprüft", "laufzeit"] }),

  F(A, "Nicht passender Typ → nicht gefangen", P`
probier { wirf neu RechenAnanas("r"); } verbrannt (StreitAnanas a) { Bote.sage(("falsch")); }
`, { exit: 1, out: [], fehler: { code: "RechenAnanas", textEnthält: "RechenAnanas: r" } }),

  F(A, "Eigene Klasse (keine Ananas) werfen und fangen", P`
klasse Fehlbestellung { margherita was; Fehlbestellung(margherita w) { was = w; } }
probier { wirf neu Fehlbestellung("Hawai"); } verbrannt (Fehlbestellung f) { Bote.sage((f.was)); }
`, { out: ["Hawai"] }),

  F(A, "Erneutes Werfen im verbrannt-Zweig", P`
probier {
    probier { wirf neu StreitAnanas("innen"); } verbrannt (StreitAnanas a) { Bote.sage(("1")); wirf a; }
} verbrannt (Ananas b) { Bote.sage(("2 " + b.nachricht())); }
`, { out: ["1", "2 innen"] }),

  F(A, "Ananas durch Methodenaufrufe hindurch", P`
klasse K { tiefkühl leer tief(salami n) { falls (n == 0) { wirf neu StreitAnanas("unten"); } tief(n - 1); } }
probier { K.tief(5); } verbrannt (StreitAnanas a) { Bote.sage((a.nachricht())); }
`, { out: ["unten"] }),

  F(A, "Unbekannte Variable → LaufzeitAnanas 'x' ist nicht definiert.", P`
Bote.sage((x));
`, { exit: 1, fehler: { code: "LaufzeitAnanas", textEnthält: "'x' ist nicht definiert." } }),

  F(A, "Interner Fehler ist als LaufzeitAnanas fangbar", P`
probier { Bote.sage((gibtsNicht)); } verbrannt (LaufzeitAnanas a) { Bote.sage(("gefangen")); }
`, { out: ["gefangen"] }),

  F(A, "TypAnanas: salami mit Kommazahl", P`
salami x = 3.5;
`, { exit: 1, fehler: { code: "TypAnanas", art: "ananas" } }),

  F(A, "TypAnanas: margherita mit Zahl", P`
margherita t = 5;
`, { exit: 1, fehler: { code: "TypAnanas" } }),

  F(A, "TypAnanas: diavolo mit Zahl", P`
diavolo d = 1;
`, { exit: 1, fehler: { code: "TypAnanas" } }),

  F(A, "TypAnanas: funghi mit Text", P`
funghi f = "a";
`, { exit: 1, fehler: { code: "TypAnanas" } }),

  F(A, "TypAnanas: Dauer mit Zahl", P`
Dauer d = 5;
`, { exit: 1, fehler: { code: "TypAnanas" } }),

  F(A, "TypAnanas: eigene Klasse (instanceof)", P`
klasse Hund { }
klasse Katze { }
Hund h = neu Katze();
`, { exit: 1, fehler: { code: "TypAnanas" } }),

  F(A, "TypAnanas: bei späterer Zuweisung", P`
salami x = 1;
Bote.sage((x));
x = 1.5;
`, { exit: 1, out: ["1"], fehler: { code: "TypAnanas" } }),

  F(A, "TypAnanas: bei Parameter", P`
klasse K { tiefkühl salami f(salami n) { serviere ((n)); } }
K.f(2.5);
`, { exit: 1, fehler: { code: "TypAnanas" } }),

  F(A, "Kein TypAnanas: funghi mit Ganzzahl, Unterklasse für Basistyp, karton für Nicht-Primitive, Blech ungeprüft", P`
klasse Tier { }
klasse Hund erbt Tier { }
funghi f = 3;
Tier t = neu Hund();
Dauer p = karton;
Hund h = karton;
Blech<salami> b = ["kein", "salami"];
Bote.sage((f));
Bote.sage((p));
Bote.sage((b));
`, { out: ["3", "karton", "[kein, salami]"] }),

  F(A, "karton lesen ist ok, Methodenaufruf darauf → LeererKartonAnanas", P`
Dauer p = karton;
Bote.sage((p));
Bote.sage((p.inMs()));
`, { exit: 1, out: ["karton"], fehler: { code: "LeererKartonAnanas", textEnthält: "LeererKartonAnanas: Der Karton ist leer." } }),

  F(A, "Feldzugriff auf karton → LeererKartonAnanas", P`
klasse K { salami x = 1; }
K k = karton;
Bote.sage((k.x));
`, { exit: 1, fehler: { code: "LeererKartonAnanas", textEnthält: "Der Karton ist leer." } }),

  // ───────── §9 ─────────
  F(H, "hawaii-Variable erhält Wert → Panik, Exit 39, W0666 einmal", P`
Bote.sage(("vorher"));
hawaii h = 1;
Bote.sage(("nachher"));
`, { exit: 39, out: ["vorher"], panik: true, warnAnzahl: { W0666: 1 }, warnText: { W0666 } }),

  F(H, "hawaii-Feld erhält einen Wert → Panik", P`
klasse K { hawaii h; }
K k = neu K();
Bote.sage(("noch gut"));
k.h = 1;
`, { exit: 39, out: ["noch gut"], panik: true, warnAnzahl: { W0666: 1 } }),

  F(H, "bloßer Name Ananas ist der Klassenwert der Basis-Ananas – keine Panik, keine W0666 (K-105)", P`
Bote.sage((Ananas));
probier { wirf neu Ananas("x"); } verbrannt (Ananas a) { Bote.sage((a)); }
`, { out: ["Ananas", "Ananas: x"], noWarn: ["W0666"] }),

  F(H, "neu Hawaii() (eigene Klasse) → Panik", P`
klasse Hawaii { }
Bote.sage(("vorher"));
Hawaii h = neu Hawaii();
`, { exit: 39, out: ["vorher"], panik: true }),

  F(H, "hawaii-Parameter erhält Wert → Panik", P`
klasse K { tiefkühl leer f(hawaii h) { Bote.sage(("drin")); } }
K.f(1);
`, { exit: 39, out: [], panik: true }),

  F(H, "Panik ist nicht fangbar: probier/verbrannt/rand übergangen", P`
probier {
    hawaii h = 1;
} verbrannt (a) {
    Bote.sage(("gefangen"));
} rand {
    Bote.sage(("rand"));
}
`, { exit: 39, out: [], panik: true }),

  F(H, "Nur Quelltext enthält hawaii/Ananas → genau eine W0666, Exit 0", P`
falls (nein) {
    hawaii h = 1;
    Blech<hawaii> p = [1];
}
Blech<hawaii> b = [];
Bote.sage(("ruhig"));
`, { out: ["ruhig"], warnAnzahl: { W0666: 1 }, warnText: { W0666 } }),

  F(H, "Ananas-Klassen in Typposition → keine W0666 (Kl. 18)", P`
klasse MeineAnanas erbt LaufzeitAnanas { MeineAnanas(margherita m) { unten(m); } }
probier { wirf neu MeineAnanas("x"); } verbrannt (Ananas a) { Bote.sage(("ok")); }
`, { out: ["ok"], noWarn: ["W0666"] }),

  F(H, "Parser akzeptiert hawaii überall (parse ok)", P`
klasse Insel<T> { hawaii feld; hawaii methode(hawaii x) { serviere ((x)); } }
`, { exit: 0, out: [], warnAnzahl: { W0666: 1 } }),

  // ───────── §10 ─────────
  F(W, "W0032: zwei Namen nur in Groß-/Kleinschreibung verschieden", P`
salami pizza = 1;
salami PiZZa = 2;
`, {
    warnAnzahl: { W0032: 1 },
    check: (r) => {
      const w = r.ereignisse.find((e) => e.typ === "warnung" && e.code === "W0032");
      if (!w) return;
      const ok = /'(pizza|PiZZa)' und '(pizza|PiZZa)' sind im selben Scope definiert\. Selbst der Pizzaiolo verwechselt die beiden\./.test(w.text);
      return ok ? undefined : "W0032-Text weicht ab: " + JSON.stringify(w.text);
    },
  }),

  F(W, "W0032: verschiedene Scopes → keine Warnung", P`
salami pizza = 1;
falls (ja) { salami PiZZa = 2; Bote.sage((PiZZa)); }
`, { out: ["2"], noWarn: ["W0032"] }),

  F(W, "W0032: in Parameterliste", P`
klasse K { tiefkühl salami f(salami teig1, salami TEIG1) { serviere ((teig1 + TEIG1)); } }
Bote.sage((K.f(1, 2)));
`, { out: ["3"], warnAnzahl: { W0032: 1 } }),

  F(W, "W0032: unter Klassenmitgliedern", P`
klasse K { salami menge = 1; salami Menge = 2; }
Bote.sage(("ok"));
`, { out: ["ok"], warnAnzahl: { W0032: 1 } }),

  // "Einmal pro Paar" (3 Paare) vs. "einmal pro Code+Stelle" (2 Stellen) – beide Lesarten zulassen.
  F(W, "W0032: mehrere Paare, jeder Name wird genannt", P`
salami pizza = 1;
salami PiZZa = 2;
salami piZZA = 3;
`, {
    check: (r) => {
      const w = r.ereignisse.filter((e) => e.typ === "warnung" && e.code === "W0032");
      if (w.length < 2 || w.length > 3) return "W0032 " + w.length + "×, erwartet 2–3×";
      const t = w.map((x) => x.text).join(" ");
      const fehlt = ["pizza", "PiZZa", "piZZA"].filter((n) => !t.includes("'" + n + "'"));
      return fehlt.length ? "nicht genannt: " + fehlt.join(", ") : undefined;
    },
  }),

  F(W, "Warnungen einmal pro Stelle (Schleife) und ohne Einfluss auf Exit-Code", P`
für (salami i = 0; i < 3; i++) {
    salami wert = i;
    salami WERT = i;
}
Bote.sage(("ok"));
`, { out: ["ok"], warnAnzahl: { W0032: 1 } }),

  // ───────── §11 ─────────
  F(S, "Bote.fehler → fehlerausgabe-Ereignis", P`
Bote.sage(("a"));
Bote.fehler(("b"));
`, { out: ["a"], fehlerOut: ["b"] }),

  F(S, "Mathe-Funktionen und PI", P`
Bote.sage((Mathe.wurzel(16)));
Bote.sage((Mathe.max(3, 7)));
Bote.sage((Mathe.min(3, 7)));
Bote.sage((Mathe.abs(-3)));
Bote.sage((Mathe.runden(2.4)));
Bote.sage((Mathe.runden(2.6)));
Bote.sage((Mathe.boden(2.7)));
Bote.sage((Mathe.decke(2.1)));
Bote.sage((Mathe.PI));
`, { out: ["4", "7", "3", "3", "2", "3", "2", "3", String(Math.PI)] }),

  F(S, "Zufall.zahl: ganzzahlig, inklusive Grenzen, im Bereich", P`
diavolo ok = ja;
für (salami i = 0; i < 200; i++) {
    salami z = Zufall.zahl(1, 6);
    falls (z < 1 || z > 6 || z != z.ganz()) { ok = nein; }
}
Bote.sage((ok));
`, { out: ["ja"] }),

  F(S, "Zahl: euro() (Kl. 7), runden, abs, alsText, ganz", P`
funghi p = 8;
Bote.sage((p.euro()));
funghi q = 7.5;
Bote.sage((q.euro()));
funghi x = 3.14159;
Bote.sage((x.runden(2)));
Bote.sage((x.runden()));
funghi m = -3.7;
Bote.sage((m.abs()));
Bote.sage((m.ganz()));
Bote.sage((x.alsText() + "!"));
Bote.sage(((5 + 1.5 + 1 + 0.5).euro()));
`, { out: ["8,00 €", "7,50 €", "3.14", "3", "3.7", "-3", "3.14159!", "8,00 €"] }),

  F(S, "Text-Methoden", P`
margherita t = "  Pizza Salami  ";
margherita s = t.trimme();
Bote.sage((s));
Bote.sage((s.länge()));
Bote.sage((s.groß()));
Bote.sage((s.klein()));
Bote.sage((s.enthält("Sal")));
Bote.sage((s.zerlege(" ")));
Bote.sage((s.ersetze("Salami", "Funghi")));
Bote.sage((s.zeichen(1)));
Bote.sage(("ab".wiederhole(3)));
Bote.sage((s.beginntMit("Piz")));
Bote.sage(("42".alsZahl() + 1));
`, { out: ["Pizza Salami", "12", "PIZZA SALAMI", "pizza salami", "ja", "[Pizza, Salami]", "Pizza Funghi", "P", "ababab", "ja", "43"] }),

  F(S, "Blech: stück ab 1, länge, erstes, letztes, enthält, istLeer", P`
Blech<salami> b = [10, 20, 30];
Bote.sage((b.stück(1)));
Bote.sage((b.stück(3)));
Bote.sage((b.länge()));
Bote.sage((b.erstes()));
Bote.sage((b.letztes()));
Bote.sage((b.enthält(20)));
Bote.sage((b.enthält(25)));
Bote.sage((b.istLeer()));
Bote.sage((neu Blech<salami>().istLeer()));
`, { out: ["10", "30", "3", "10", "30", "ja", "nein", "nein", "ja"] }),

  F(S, "Blech: stück(0) → KeinStückAnanas", P`
Blech<salami> b = [10, 20, 30];
Bote.sage((b.stück(0)));
`, { exit: 1, fehler: { code: "KeinStückAnanas" } }),

  F(S, "Blech: stück(länge+1) → KeinStückAnanas", P`
Blech<salami> b = [10, 20, 30];
Bote.sage((b.stück(4)));
`, { exit: 1, fehler: { code: "KeinStückAnanas" } }),

  F(S, "Blech: hinzu mutiert und gibt dasselbe Blech zurück (Kl. 11)", P`
Blech<salami> b = [1];
Blech<salami> c = b.hinzu(2);
b.hinzu(3).hinzu(4);
Bote.sage((b));
Bote.sage((c == b));
`, { out: ["[1, 2, 3, 4]", "ja"] }),

  F(S, "Blech: entferne(i) und setze(i, x) mit Index ab 1", P`
Blech<salami> b = [1, 2, 3];
b.setze(2, 9);
Bote.sage((b));
b.entferne(1);
Bote.sage((b));
`, { out: ["[1, 9, 3]", "[9, 3]"] }),

  F(S, "Blech: belege/filtere/umdrehen/sortiere liefern neue Bleche (Kl. 11)", P`
Blech<salami> b = [3, 1, 2];
Bote.sage((b.belege(x -> x * 10)));
Bote.sage((b.filtere(x -> x > 1)));
Bote.sage((b.umdrehen()));
Bote.sage((b.sortiere()));
Bote.sage((b));
`, { out: ["[30, 10, 20]", "[3, 2]", "[2, 1, 3]", "[1, 2, 3]", "[3, 1, 2]"] }),

  F(S, "Blech: sortiere numerisch / lexikografisch / mit Vergleicher (Kl. 11)", P`
Bote.sage(([10, 9, 100].sortiere()));
Bote.sage((["b", "c", "a"].sortiere()));
Bote.sage(([1, 3, 2].sortiere((a, b) -> b - a)));
`, { out: ["[9, 10, 100]", "[a, b, c]", "[3, 2, 1]"] }),

  F(S, "Blech: zusammenklappen mit/ohne Start, summe, verbinde", P`
Blech<salami> b = [1, 2, 3, 4];
Bote.sage((b.zusammenklappen((a, x) -> a + x)));
Bote.sage((b.zusammenklappen((a, x) -> a + x, 100)));
Bote.sage((b.summe()));
Bote.sage((b.verbinde("-")));
Bote.sage((["a", "b"].verbinde(", ")));
`, { out: ["10", "110", "10", "1-2-3-4", "a, b"] }),

  F(S, "Speisekarte: lege, hole, hat, entferne, schlüssel, werte, länge", P`
Speisekarte<margherita, funghi> m = neu Speisekarte<margherita, funghi>();
m.lege("Margherita", 8);
m.lege("Salami", 9.5);
Bote.sage((m.hole("Salami")));
Bote.sage((m.hole("Hawai")));
Bote.sage((m.hat("Margherita")));
Bote.sage((m.länge()));
Bote.sage((m.schlüssel()));
Bote.sage((m.werte()));
m.entferne("Margherita");
Bote.sage((m.hat("Margherita")));
Bote.sage((m));
`, { out: ["9.5", "karton", "ja", "2", "[Margherita, Salami]", "[8, 9.5]", "nein", "{Salami: 9.5}"] }),

  F(S, "Speisekarte: lege überschreibt, Reihenfolge bleibt", P`
Speisekarte<margherita, salami> m = neu Speisekarte<margherita, salami>();
m.lege("a", 1);
m.lege("b", 2);
m.lege("a", 3);
Bote.sage((m));
`, { out: ["{a: 3, b: 2}"] }),

  F(S, "Dauer-Arithmetik, Vergleiche, inMs, inSekunden", P`
Bote.sage((1min + 30s));
Bote.sage((1h - 30min));
Bote.sage((2s * 3));
Bote.sage((1min / 2));
Bote.sage((1min > 59s));
Bote.sage(((1s).inMs()));
Bote.sage(((90s).inSekunden()));
`, { out: ["1min 30s", "30min", "6s", "30s", "ja", "1000", "90"] }),

  F(S, "neu Blech<T>(), neu Speisekarte<K, V>()", P`
Bote.sage((neu Blech<salami>()));
Bote.sage((neu Speisekarte<margherita, salami>()));
`, {
    // Speisekarte leer: SPEC gibt nur {a: 1, b: 2} vor → leere Form "{}" ist die naheliegende Lesart
    out: ["[]", "{}"],
  }),

  // ───────── §12 ─────────
  F(X, "Exit 0 gegessen", P`
Bote.sage(("ok"));
`, { exit: 0 }),

  F(X, "Exit 1 ungefangene Ananas", P`
wirf neu StreitAnanas("x");
`, { exit: 1, fehler: { art: "ananas" } }),

  F(X, "Exit 2 Syntaxfehler", P`
klasse {
`, { exit: 2, out: [], fehler: { art: "syntax" } }),

  F(X, "Exit 3 Schrittlimit", P`
solange (ja) { }
`, { exit: 3, schrittLimit: 5000, fehler: { code: "P0002", art: "limit" } }),

  F(X, "Exit 39 Hawaii", P`
hawaii h = 1;
`, { exit: 39, panik: true }),

  F(X, "Syntaxfehler: keine Ausgabe, nichts läuft", P`
Bote.sage(("vor"));
salami = = 3;
`, { exit: 2, out: [] }),
];

module.exports.BANNER = BANNER;
