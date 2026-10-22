"use strict";
// Regressionstests zum Klärungsprotokoll KLAERUNGEN.md (K-001 …) bzw. SPEC §15.
// Erwartungen stammen aus SPEC/KLAERUNGEN – nicht aus dem Interpreter.
// Fälle, deren Umsetzung noch offen ist, liegen in a11-klaerungen-offen.js.
const { P, F } = require("../lib/helfer");
const K = "§15 Klärungen (K-001 …)";

const schritte = (soll) => (res) => (res.schritte === soll ? undefined : `schritte ${res.schritte}, erwartet ${soll}`);

module.exports = [
  // ── K-001 Pizza-Literal und Aufrufklammern – abgelöst durch K-105 (kein Literal mehr, Fälle unten bei K-105) ──
  F(K, "K-001 (K-105): Bote.sage((Salami, Tomate)) und f(((A, B))) sind Syntaxfehler (P0001, Exit 2)", P`
leer f(salami a) { }
f(((1, 2)));
`, { exit: 2, fehler: { code: "P0001", art: "syntax", zeile: 2 } }),

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
Bote.sage(((-5).währung("€")));
`, { out: ["-3", "-3", "-1", "-1", "-5,00 €"] }),

  F(K, "K-003: -x.währung(s) ist -(x.währung(s)) → TypAnanas (Text negieren)", P`
Bote.sage((-0.5.währung("€")));
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

  // ── K-016 Besitz – Besitzprüfung abgelöst durch K-105, schieb bleibt ─────
  F(K, "K-016: schieb funktioniert für Variablen jeden Typs, nicht für Felder", P`
salami x = 5;
salami y = schieb(x);
Bote.sage((y));
probier { Bote.sage((x)); } verbrannt (LeererKartonAnanas a) { Bote.sage(("weg")); }
klasse K { margherita p = "Tomate"; }
K k = neu K();
probier { margherita q = schieb(k.p); } verbrannt (LaufzeitAnanas a) { Bote.sage(("nur Namen")); }
`, { out: ["5", "weg", "nur Namen"] }),

  // ── K-017 Identität von Schlüsseln (Pizza-Teil abgelöst durch K-105) ─────
  F(K, "K-017: Speisekarten-Schlüssel: Zahl/Text/karton nach Wert (1 = 1.0), quattrostagioni-Werte, Objekte nach Identität", P`
Speisekarte<salami, margherita> m = neu Speisekarte<salami, margherita>();
m.lege(1, "eins");
m.lege(1.0, "einsnull");
m.lege("1", "text");
Bote.sage((m.länge() + " " + m.hole(1)));
m.lege(karton, "leer");
Bote.sage((m.hat(karton)));
quattrostagioni Belag { Salami, Tomate, Käse, Pilze }
klasse Pizza { }
Speisekarte<Pizza, salami> n = neu Speisekarte<Pizza, salami>();
n.lege(neu Pizza(), 1);
Bote.sage((n.hat(neu Pizza())));
n.lege(Belag.Salami, 2);
Bote.sage((n.hat(Belag.Salami) + " " + n.hat("Salami")));
`, { out: ["2 einsnull", "ja", "nein", "ja nein"] }),

  // ── K-018 Kühlschrank-Schlüssel ─────────────────────────────────────────
  F(K, "K-018: Cache-Schlüssel = Textform (Blech nach Inhalt), Objekte nach Identität; Ananas nicht gecacht", P`
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

  F(K, "K-018: gecachter Wert kommt per Referenz zurück (dasselbe Blech)", P`
klasse K { @Kühlschrank(haltbar: 1h) Blech<salami> m() { serviere (([1])); } }
K k = neu K();
Blech<salami> a = k.m();
Blech<salami> b = k.m();
a.hinzu(2);
Bote.sage((b.länge() + " " + (a == b)));
`, { out: ["2 ja"] }),

  // ── K-019 Lieferung ─────────────────────────────────────────────────────
  F(K, "K-019: wennDa ersetzt den früheren Rückruf", P`
Lieferung<salami> l = bestelle(() -> { Bote.sage(("laufe")); serviere (1); });
l.wennDa(x -> Bote.sage(("a " + x)));
l.wennDa(x -> Bote.sage(("b " + x)));
`, { out: ["laufe", "b 1"] }),

  F(K, "K-019/K-127: negative/gebrochene Priorität erlaubt, ohne Einfluss aufs Budget; zu spät ist endgültig", P`
Lieferung<salami> l = bestelle(() -> 1);
l.priorität(2.5);
Bote.sage((l.warte(max: 1ms).wert()));
Lieferung<salami> m = bestelle(() -> { Uhr.vorspulen(2h); serviere (1); });
m.priorität(-10);
Bote.sage((m.warte(max: 1h).pünktlich()));
m.priorität(100);
Bote.sage((m.warte(max: 3h).pünktlich()));
`, { out: ["1", "nein", "nein"] }),

  // ── K-020 Ofen-Randwerte ────────────────────────────────────────────────
  F(K, "K-020/K-127: zeit 0 oder negativ → Budget ≤ 0 → roh; zeit als Zahl (ms) und positional", P`
Bote.sage((ofen(zeit: 0ms) { serviere (1); } roh (r) { serviere (0); }));
Bote.sage((ofen(-1s) { serviere (1); } roh (r) { serviere (0); }));
Bote.sage((ofen(1) { serviere (1); } roh (r) { serviere (0); }));
Bote.sage((ofen(2) { serviere (1); } roh (r) { serviere (0); }));
`, { out: ["0", "0", "0", "1"] }),

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
  F(K, "K-022: sortiere ist stabil; nur das Vorzeichen zählt; Nicht-Zahl → TypAnanas; diavolo nicht vergleichbar", P`
Bote.sage((["bb", "a", "cc", "d"].sortiere((x, y) -> x.länge() - y.länge())));
Bote.sage(([3, 1, 2].sortiere((x, y) -> 0)));
Bote.sage(([3, 1, 2].sortiere((x, y) -> x > y ? 1 : -1)));
probier { [2, 1].sortiere((x, y) -> ja); } verbrannt (TypAnanas a) { Bote.sage(("typ")); }
probier { [ja, nein].sortiere(); } verbrannt (TypAnanas a) { Bote.sage(("typ2")); }
`, { out: ["[a, d, bb, cc]", "[3, 1, 2]", "[1, 2, 3]", "typ", "typ2"] }),

  // ── K-023 Preisrundung – abgelöst durch K-105 (keine eingebauten Preise mehr) ──

  // ── K-024 Nachgestellte Kommas ──────────────────────────────────────────
  F(K, "K-024: nachgestelltes Komma erlaubt in Blech-Literal und quattrostagioni", P`
Blech<salami> b = [1, 2,];
Bote.sage((b));
quattrostagioni Q { A, B, C, D, }
Bote.sage((Q.werte()));
`, { out: ["[1, 2]", "[A, B, C, D]"] }),

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

  F(K, "K-026: Name Ananas → keine Panik, keine Warnung; Blech<hawaii> → W0666 genau einmal (K-105)", P`
Bote.sage((Ananas));
Blech<hawaii> b = [1];
Blech<hawaii> c = [2];
Bote.sage((b + " " + c));
`, { out: ["Ananas", "[1] [2]"], warnAnzahl: { W0666: 1 } }),

  F(K, "K-026: Q.Ananas und Methodenname Ananas lösen weder W0666 noch Panik aus", P`
quattrostagioni Q { A, B, C, Ananas }
klasse K { leer Ananas() { Bote.sage(("m")); } }
Bote.sage((Q.Ananas));
neu K().Ananas();
`, { out: ["Ananas", "m"], noWarn: ["W0666"] }),

  F(K, "K-026: Panik in der wennDa-Phase nach Programmende → Exit 39", P`
Lieferung<salami> l = bestelle(() -> { hawaii p = 1; serviere (1); });
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
probier { Spiegel.felder(((1s))); } verbrannt (TypAnanas a) { Bote.sage(("typ")); }
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

  // ── K-039 Pizza-Methoden mit Text – abgelöst durch K-105; + mit einem Text bleibt Textverkettung (§5) ──
  F(K, "K-039 (K-105): Objekt + Text ist Textverkettung über alsText()", P`
klasse Pizza { margherita alsText() { serviere (("((Tomate))")); } }
Pizza p = neu Pizza();
Bote.sage((p + "!"));
Bote.sage(("Pizza: " + p));
`, { out: ["((Tomate))!", "Pizza: ((Tomate))"] }),

  // ── K-048 Rundungsformel ────────────────────────────────────────────────
  F(K, "K-048: Rundung half-away-from-zero, Epsilon nur bei runden(n>0) und währung() (vormals euro(), K-127)", P`
Bote.sage((2.675.runden(2)));
Bote.sage((1.005.runden(2)));
Bote.sage((0.125.runden(2)));
Bote.sage((Mathe.runden(2.675, 2)));
Bote.sage((0.5.runden()));
Bote.sage((1.5.runden()));
Bote.sage(((-0.5).runden()));
Bote.sage((Mathe.runden(-2.5)));
Bote.sage((0.015.währung("€")));
Bote.sage(((-0.001).währung("€")));
Bote.sage(((-2.5).währung("€")));
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

  // ── K-038 (abgelöst durch K-127): auto ist ein gewöhnlicher Name ──────────
  F(K, "K-038/K-127: auto ist überall ein gewöhnlicher Name, auch in schneide(auto)", P`
Bote.sage(([1, 2].schneide(2).länge()));
Bote.sage(([1, 2].schneide(auto).länge()));
`, { exit: 1, out: ["2"], fehler: { code: "LaufzeitAnanas", art: "ananas", zeile: 2,
      text: "Ungefangene Ananas – LaufzeitAnanas: 'auto' ist nicht definiert. (Zeile 2)" } }),

  F(K, "K-127: eigene Variable auto funktioniert in schneide(auto)", P`
salami auto = 3;
Bote.sage(([1, 2, 3].schneide(auto)));
`, { out: ["[[1], [2], [3]]"] }),

  F(K, "K-127: währung(symbol, kompakt:) – Symbol frei, karton/leer/fehlend ohne Symbol", P`
Bote.sage((8.währung("€")));
Bote.sage((8.währung()));
Bote.sage((2.5.währung(symbol: "CHF")));
Bote.sage((1234567.währung("€", kompakt: ja)));
Bote.sage((1234567.währung("$", ja)));
Bote.sage((3.währung(karton)));
Bote.sage((3.währung("")));
`, { out: ["8,00 €", "8,00", "2,50 CHF", "1,23 Mio. €", "1,23 Mio. $", "3,00", "3,00"] }),

  F(K, "K-127: priorität – nicht-Zahl → TypAnanas; ordnet nur die wennDa-Phase, letzter Wert gilt", P`
probier { bestelle(() -> 1).priorität("hoch"); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
bestelle(() -> "a").priorität(1).wennDa(x -> Bote.sage((x)));
bestelle(() -> "b").priorität(5).priorität(0).wennDa(x -> Bote.sage((x)));
bestelle(() -> "c").priorität(2).wennDa(x -> Bote.sage((x)));
`, { out: ['Priorität muss eine Zahl sein, nicht "hoch".', "c", "a", "b"] }),

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

  F(K, "K-078: Zufall.saat() ist 42; saat(7) setzt den globalen Strom; zahl(1, 6) → 1 1 6 5 4 3", P`
Bote.sage((Zufall.saat()));
Zufall.saat(7);
Bote.sage((Zufall.saat()));
Blech<salami> b = [];
für (salami i = 1; i <= 6; i++) { b.hinzu(Zufall.zahl(1, 6)); }
Bote.sage((b));
`, { out: ["42", "7", "[1, 1, 6, 5, 4, 3]"] }),

  F(K, "K-078: kommazahl(), kommazahl(a, b), wahr(p) – je eine Ziehung", P`
Zufall.saat(7);
Bote.sage((Zufall.kommazahl()));
Bote.sage((Zufall.kommazahl()));
Bote.sage((Zufall.kommazahl()));
Zufall.saat(7);
Bote.sage((Zufall.kommazahl(10, 20)));
Bote.sage((Zufall.wahr(0.5)));
Bote.sage((Zufall.wahr(0.5)));
Bote.sage((Zufall.wahr(0)));
Bote.sage((Zufall.wahr(1)));
`, { out: ["0.011704753153026104", "0.06195825757458806", "0.97690763277933", "10.117047531530261", "ja", "nein", "nein", "ja"] }),

  F(K, "K-078: wähle(blech) und mische(blech) (Fisher-Yates von hinten, neues Blech)", P`
Zufall.saat(7);
Bote.sage((Zufall.wähle(["a", "b", "c"])));
Bote.sage((Zufall.wähle(["a", "b", "c"])));
Zufall.saat(7);
Blech<salami> b = [1, 2, 3, 4, 5];
Bote.sage((Zufall.mische(b)));
Bote.sage((b));
Bote.sage((Zufall.mische([9])));
probier { Zufall.wähle([]); } verbrannt (KeinStückAnanas a) { Bote.sage((a.nachricht())); }
`, { out: ["a", "a", "[4, 2, 3, 5, 1]", "[1, 2, 3, 4, 5]", "[9]", "Das Blech ist leer – kein Stück da."] }),

  F(K, "K-078: neu Zufall(saat) ist ein eigener Strom; neu Zufall() zieht seine Saat aus dem globalen Strom; Textform", P`
Zufall.saat(7);
Zufall g = neu Zufall(7);
Bote.sage((g.zahl(1, 6) + " " + g.zahl(1, 6)));
Bote.sage((Zufall.zahl(1, 6)));
Zufall.saat(7);
Zufall h = neu Zufall();
Bote.sage((h.saat()));
Bote.sage((h));
Bote.sage((g));
`, { out: ["1 1", "1", "50271532", "Zufall(50271532)", "Zufall(7)"] }),

  F(K, "K-078: Saat wird mod 2^32 normalisiert; keine Ganzzahl → TypAnanas", P`
Zufall.saat(-1);
Bote.sage((Zufall.saat()));
Bote.sage((Zufall.zahl(1, 6) + " " + Zufall.zahl(1, 6)));
probier { Zufall.saat(2.5); } verbrannt (TypAnanas a) { Bote.sage(("typ")); }
`, { out: ["4294967295", "6 2", "typ"] }),

  F(K, "K-077: optionen.zufallsSaat = 7 wirkt wie Zufall.saat(7)", P`
Bote.sage((Zufall.saat()));
Bote.sage((Zufall.zahl(1, 6) + " " + Zufall.zahl(1, 6) + " " + Zufall.zahl(1, 6)));
`, { zufallsSaat: 7, out: ["7", "1 1 6"] }),

  // ── K-079/080 Vorratskammer ──────────────────────────────────────────────
  F(K, "K-079/080: Eingangszustand aus optionen.vorrat; lege/hole/hat/entferne/schlüssel/länge; Ereignisse je Änderung", P`
Vorratskammer v = neu Vorratskammer("spiel");
Bote.sage((v.hole("punkte")));
Bote.sage((v.hole("fehlt")));
Bote.sage((v.hole("fehlt", 0)));
v.lege("punkte", 6).lege("name", "Luigi");
Bote.sage((v.hat("name") + " " + v.länge()));
Bote.sage((v.schlüssel()));
Bote.sage((v.entferne("name")));
Bote.sage((v.entferne("name")));
Bote.sage((v));
`, {
    vorrat: { spiel: [["punkte", 5]] },
    out: ["5", "karton", "0", "ja 2", "[punkte, name]", "Luigi", "karton", "Vorratskammer(spiel)"],
    vorratEreignisse: [{ name: "spiel", schluessel: "punkte", wert: 6 }, { name: "spiel", schluessel: "name", wert: "Luigi" }, { name: "spiel", schluessel: "name", wert: null }],
  }),

  F(K, "K-079: Wertsemantik (tiefe Kopie), verschachtelte Bleche/Speisekarten, leeren, gleicher Name = gleiche Kammer", P`
Vorratskammer v = neu Vorratskammer("k");
Blech<salami> b = [1, 2];
v.lege("liste", b);
b.hinzu(3);
Bote.sage((v.hole("liste")));
Blech<salami> c = v.hole("liste");
c.hinzu(9);
Bote.sage((v.hole("liste")));
Speisekarte<margherita, salami> m = neu Speisekarte<margherita, salami>();
m.lege("b", 2); m.lege("a", 1);
v.lege("karte", [m, karton, ja, "x", 1.5]);
Bote.sage((v.hole("karte")));
Vorratskammer w = neu Vorratskammer("k");
Bote.sage((w.länge()));
w.leeren();
Bote.sage((v.länge()));
`, {
    vorrat: {},
    out: ["[1, 2]", "[1, 2]", "[{b: 2, a: 1}, karton, ja, x, 1.5]", "2", "0"],
    vorratEreignisse: [{ name: "k", schluessel: "liste", wert: [1, 2] }, { name: "k", schluessel: "karte", wert: [{ speisekarte: [["b", 2], ["a", 1]] }, null, true, "x", 1.5] }, { name: "k", schluessel: null, wert: null }],
  }),

  F(K, "K-079: ungültige Werte, Schlüssel und Namen → TypAnanas/LaufzeitAnanas", P`
Vorratskammer v = neu Vorratskammer("k");
probier { v.lege("p", 1s); } verbrannt (TypAnanas a) { Bote.sage(("pizza")); }
probier { v.lege("f", Mathe.wurzel(-1)); } verbrannt (TypAnanas a) { Bote.sage(("nan")); }
probier { v.lege(1, 2); } verbrannt (TypAnanas a) { Bote.sage(("schlüssel")); }
probier { Vorratskammer x = neu Vorratskammer("Groß Name"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
Bote.sage((v.länge()));
`, { vorrat: {}, out: ["pizza", "nan", "schlüssel", "Ungültiger Kammername 'Groß Name' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).", "0"], vorratEreignisse: [] }),

  F(K, "K-080: ohne vorrat/onVorrat → W0101 einmal, Kammer arbeitet im Speicher", P`
Vorratskammer v = neu Vorratskammer("a");
Vorratskammer w = neu Vorratskammer("b");
v.lege("x", 1);
Bote.sage((v.hole("x")));
`, { out: ["1"], warnAnzahl: { W0101: 1 }, warnText: { W0101: "Keine Vorratskammer verfügbar – Zustand wird nicht gespeichert." } }),

  // ── K-106 Vorratskammer: Namensraum ──────────────────────────────────────
  F(K, "K-106: Kennung raum/name in optionen.vorrat, Ereignis und Textform; name() ohne Raum, namensraum(); positional = benannt = gleiche Kammer", P`
Vorratskammer v = neu Vorratskammer("stand", namensraum: "spiel");
Bote.sage((v.hole("punkte")));
Bote.sage((v + " " + v.name() + " " + v.namensraum()));
v.lege("punkte", 6);
Vorratskammer w = neu Vorratskammer("stand", "spiel");
Bote.sage((w.hole("punkte") + " " + w.länge()));
w.entferne("punkte");
Bote.sage((v.länge()));
`, {
    vorrat: { "spiel/stand": [["punkte", 5]], stand: [["punkte", 99]] },
    out: ["5", "Vorratskammer(spiel/stand) stand spiel", "6 1", "0"],
    vorratEreignisse: [{ name: "spiel/stand", schluessel: "punkte", wert: 6 }, { name: "spiel/stand", schluessel: "punkte", wert: null }],
  }),

  F(K, "K-106: gleicher Name, anderer oder kein Raum → getrennte Kammern; karton = ohne Namensraum", P`
Vorratskammer a = neu Vorratskammer("stand", namensraum: "spiel");
Vorratskammer b = neu Vorratskammer("stand", namensraum: "anderes");
Vorratskammer c = neu Vorratskammer("stand");
Vorratskammer d = neu Vorratskammer("stand", karton);
a.lege("p", 1);
b.lege("p", 2);
d.lege("p", 3);
Bote.sage((a.hole("p") + " " + b.hole("p") + " " + c.hole("p")));
Bote.sage((c + " " + c.namensraum() + " " + d.namensraum()));
`, {
    vorrat: {},
    out: ["1 2 3", "Vorratskammer(stand) karton karton"],
    vorratEreignisse: [{ name: "spiel/stand", schluessel: "p", wert: 1 }, { name: "anderes/stand", schluessel: "p", wert: 2 }, { name: "stand", schluessel: "p", wert: 3 }],
  }),

  F(K, "K-106: ungültiger Namensraum → LaufzeitAnanas mit festem Text, geprüft nach dem Kammernamen", P`
probier { neu Vorratskammer("x", namensraum: "Groß/Raum"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { neu Vorratskammer("x", ""); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { neu Vorratskammer("Groß Name", namensraum: "Groß"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
Bote.sage((neu Vorratskammer("ok", "a-1")));
`, {
    vorrat: {},
    out: ["Ungültiger Namensraum 'Groß/Raum' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).", "Ungültiger Namensraum '' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).", "Ungültiger Kammername 'Groß Name' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).", "Vorratskammer(a-1/ok)"],
    vorratEreignisse: [],
  }),

F(K, "K-085: tausender(n) – Punkt als Tausendertrenner, Komma, genau n Nachkommastellen, Rundung K-048", P`
Bote.sage((1234567.tausender()));
Bote.sage((1234567.tausender(2)));
Bote.sage(((-1234.5).tausender()));
Bote.sage((999.tausender()));
Bote.sage((0.5.tausender()));
Bote.sage((1000000.tausender(0)));
`, { out: ["1.234.567", "1.234.567,00", "-1.235", "999", "1", "1.000.000"] }),

  F(K, "K-085: kompakt(n) – Stufen Tsd./Mio./Mrd./Bio./Brd./Trio./Trd., ohne nachgestellte Nullen, < 1000 gerundet (K-103: ab 1e21 weiter Stufen)", P`
Bote.sage((1234567.kompakt()));
Bote.sage((1234567.kompakt(1)));
Bote.sage((999.5.kompakt()));
Bote.sage((1500.kompakt()));
Bote.sage((2000000.kompakt()));
Bote.sage(((-1234567).kompakt()));
Bote.sage((12.345.kompakt()));
Bote.sage((0.kompakt()));
Bote.sage((1234567890.kompakt()));
Bote.sage((15000000000000000000000.0.kompakt()));
Bote.sage((1234567.89.währung("€", kompakt: ja)));
`, { out: ["1,23 Mio.", "1,2 Mio.", "999,5", "1,5 Tsd.", "2 Mio.", "-1,23 Mio.", "12,35", "0", "1,23 Mrd.", "15 Trd.", "1,23 Mio. €"] }),

  // ── K-103 Zahlformat für beliebig große Zahlen ──────────────────────────
  F(K, "K-103: kompakt/währung(kompakt)/tausender/währung – Stufen bis Dezd. (1e63), darüber m × 10ⁿ hochgestellt, ∞/NaN, nie e+; Textform bleibt String(x)", P`
funghi x = 1.0;
für (salami i = 0; i < 21; i++) { x = x * 1000; }
Bote.sage((x.kompakt()));
funghi y = 2.5;
für (salami i = 0; i < 21; i++) { y = y * 10; }
Bote.sage((y.kompakt() + " | " + y.währung("€", kompakt: ja) + " | " + y.währung("€") + " | " + y.tausender(2)));
Bote.sage((y));
funghi z = 1.0;
für (salami i = 0; i < 100; i++) { z = z * 1000; }
Bote.sage((z.kompakt() + " | " + (z * 4.567).kompakt(1) + " | " + (-z).währung("€")));
funghi c = 9999.0;
für (salami i = 0; i < 67; i++) { c = c * 10; }
Bote.sage((c.kompakt() + " | " + c.kompakt(4)));
funghi u = Mathe.potenz(10, 400);
Bote.sage((u.kompakt() + " | " + (-u).tausender() + " | " + u.währung("€") + " | " + Mathe.wurzel(-1).kompakt()));
`, { out: ["1 Dezd.", "2,5 Trd. | 2,5 Trd. € | 2,5 Trd. € | 2,5 Trd.", "2.5e+21", "1 × 10³⁰⁰ | 4,6 × 10³⁰⁰ | -1 × 10³⁰⁰ €",
           "1 × 10⁷¹ | 9,999 × 10⁷⁰", "∞ | -∞ | ∞ € | NaN"] }),

  // ── K-095 Speisekarte.hole(k[, ersatz]) ──────────────────────────────────
  F(K, "K-095: hole(k, ersatz) liefert ersatz nur bei fehlendem Schlüssel – positional oder ersatz:, positional gewinnt, unbekannte Namen ignoriert", P`
Speisekarte<margherita, salami> k = neu Speisekarte<margherita, salami>();
k.lege("a", 1);
Bote.sage((k.hole("a", 99)));
Bote.sage((k.hole("x", 99)));
Bote.sage((k.hole("x", ersatz: 7)));
Bote.sage((k.hole("x", 5, ersatz: 7)));
Bote.sage((k.hole("x")));
Bote.sage((k.hole("x", karton)));
Bote.sage((k.hole("x", unbekannt: 3)));
salami z = k.hole("zaehler", 0) + 1;
Bote.sage((z));
Bote.sage((k.länge()));
`, { out: ["1", "99", "7", "5", "karton", "karton", "karton", "1", "1"] }),

  F(K, "K-095: gespeicherter karton bleibt karton (hat = ja); quattrostagioni-Schlüssel nach Identität; ersatz kommt unverändert zurück (keine Kopie)", P`
Speisekarte<margherita, salami> k = neu Speisekarte<margherita, salami>();
k.lege("n", karton);
Bote.sage((k.hole("n", 99) + " " + k.hat("n")));
quattrostagioni Belag { Salami, Tomate, Käse, Pilze }
Speisekarte<Belag, salami> b = neu Speisekarte<Belag, salami>();
b.lege(Belag.Salami, 3);
Bote.sage((b.hole(Belag.Salami, -1) + " " + b.hole(Belag.Tomate, -1) + " " + b.hole("Tomate", ersatz: -2)));
Speisekarte<margherita, Blech<salami>> l = neu Speisekarte<margherita, Blech<salami>>();
Blech<salami> e = [];
Blech<salami> r = l.hole("liste", e);
r.hinzu(4);
Bote.sage((e));
Bote.sage((l.hole("liste", e) == e));
`, { out: ["karton ja", "3 -1 -2", "[4]", "ja"] }),

  // ── K-089 Speicher-/Textgrenze → fangbare Kühlschrank-Ananas (Grenze je Motor verschieden) ──
  F(K, "K-089: Text verdoppeln bis zur Grenze → gefangene LaufzeitAnanas 'Der Kühlschrank ist voll (Speicherlimit erreicht).'", P`
margherita t = "Käse";
probier {
    für (salami i = 0; i < 40; i++) { t += t; }
    Bote.sage(("nie"));
} verbrannt (LaufzeitAnanas a) {
    Bote.sage((a.nachricht()));
}
t = "";
Bote.sage(("weiter"));
`, { out: ["Der Kühlschrank ist voll (Speicherlimit erreicht).", "weiter"] }),

  // ── K-105 Sprach-Bereinigung: Pizza-Objekt, Beläge, teile/Stück entfernt ─────────────────────────
  // Entfernte Dinge verhalten sich wie jeder unbekannte Name – keine Sonderbehandlung, keine Sondermeldung.

  F(K, "K-105 Belagname ist ein unbekannter Name", P`
Bote.sage((Tomate));
`, { exit: 1, fehler: { code: "LaufzeitAnanas", textEnthält: "'Tomate' ist nicht definiert." } }),

  F(K, "K-105 ((A, B)) ist kein Literal mehr – Syntaxfehler", P`
Bote.sage((("x")));
Pizza p = ((Tomate, Mozzarella));
`, { exit: 2, fehler: { code: "P0001", art: "syntax", zeile: 2 } }),

  F(K, "K-105 (()) ist kein Literal mehr – Syntaxfehler", P`
Pizza p = (());
`, { exit: 2, fehler: { code: "P0001", art: "syntax" } }),

  F(K, "K-105 neu Pizza() ohne eigene Klasse → UnbekanntePizzaAnanas (unbekannte Klasse)", P`
Pizza p = neu Pizza();
`, { exit: 1, fehler: { code: "UnbekanntePizzaAnanas", textEnthält: "Klasse 'Pizza' steht nicht auf der Speisekarte." } }),

  F(K, "K-105 teile ist kein Builtin mehr", P`
salami x = 1;
Bote.sage((teile(x)));
`, { exit: 1, fehler: { code: "LaufzeitAnanas", textEnthält: "'teile' ist nicht definiert." } }),

  F(K, "K-105 belag … auf Pizza ist keine Deklaration mehr – Syntaxfehler", P`
belag Trüffel auf Pizza {
    speisekarte funghi preis() { serviere ((4.5)); }
}
`, { exit: 2, fehler: { code: "P0001", art: "syntax" } }),

  F(K, "K-105 belag und auf sind keine reservierten Wörter mehr", P`
salami belag = 3;
margherita auf = "auf";
Bote.sage((belag + " " + auf));
`, { out: ["3 auf"] }),

  F(K, "K-105 entfernte Ananas-Klassen sind unbekannte Klassen", P`
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

  F(K, "K-105 eigene Klasse Pizza funktioniert wie jede Klasse (Typprüfung, neu, alsText)", P`
klasse Pizza {
    Blech<margherita> beläge;
    Pizza(Blech<margherita> b) { beläge = b; }
    funghi preis() { serviere ((5 + beläge.länge() * 1.5)); }
    margherita alsText() { serviere (("((" + beläge.verbinde(", ") + "))")); }
}
Pizza p = neu Pizza(["Tomate", "Mozzarella"]);
Pizza q = p;
Bote.sage((p), (p.preis().währung("€")), (q == p));
`, { out: ["((Tomate, Mozzarella)) 8,00 € ja"] }),

  F(K, "K-105 eigene Variablen mit Belagnamen gewinnen immer (kein Belag-Vorrang mehr, ersetzt K-001)", P`
margherita Tomate = "rot";
salami Salami = 2;
Bote.sage(((Tomate)), ((Salami)));
`, { out: ["rot 2"] }),

  F(K, "K-105 Zuweisung per Name ist für jeden Typ erlaubt (keine BesitzAnanas), schieb bleibt", P`
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

  F(K, "K-105 bloßer Name Ananas ist der Klassenwert, keine W0666 (ersetzt K-026 teilweise)", P`
Bote.sage((Ananas));
`, { out: ["Ananas"], noWarn: ["W0666"] }),

  F(K, "K-105 Hawaii bleibt: Typ hawaii warnt W0666 und paniert bei Zuweisung", P`
Bote.sage(("vor"));
hawaii h = 1;
Bote.sage(("nach"));
`, { exit: 39, out: ["vor"], warn: ["W0666"], panik: true }),

  F(K, "K-105 Hawaii bleibt: neu Hawaii(…) paniert", P`
Bote.sage(("vor"));
neu Hawaii();
`, { exit: 39, out: ["vor"], panik: true }),

  // ── K-111 Mathe.log/log10/log2/exp/E ─────────────────────────────────────
  F(K, "K-111: log, log10, log2, exp exakt wie Math.* inkl. Sonderfälle (log(0) → -Infinity, log(-1) → NaN, exp(710) → Infinity, exp(-∞) → 0, NaN durchgereicht); E ohne Klammern wie PI", P`
Bote.sage((Mathe.log(1) + " " + Mathe.log(Mathe.E) + " " + Mathe.log(0) + " " + Mathe.log(-1) + " " + Mathe.log(Mathe.potenz(10, 400))));
Bote.sage((Mathe.log10(1000) + " " + Mathe.log10(0.001) + " " + Mathe.log2(8) + " " + Mathe.log2(0.5) + " " + Mathe.log10(0)));
Bote.sage((Mathe.exp(0) + " " + Mathe.exp(1) + " " + Mathe.exp(710) + " " + Mathe.exp(-Mathe.potenz(10, 400)) + " " + Mathe.exp(Mathe.wurzel(-1))));
Bote.sage((Mathe.E + " " + Mathe.PI));
Bote.sage((Mathe.log(1000) / Mathe.log(10)));
Bote.sage((Mathe.log(2.5) + " " + Mathe.exp(2.5) + " " + Mathe.log10(7) + " " + Mathe.log2(10)));
funghi f = Mathe.log(0);
Bote.sage((f));
Rezept l = Mathe.log;
Bote.sage((l(Mathe.E * Mathe.E)));
`, {
    out: ["0 1 -Infinity NaN Infinity", "3 -3 3 -1 -Infinity", "1 2.718281828459045 Infinity 0 NaN",
      "2.718281828459045 3.141592653589793", "2.9999999999999996",
      "0.9162907318741551 12.182493960703473 0.8450980400142568 3.321928094887362", "-Infinity", "2"],
  }),

  F(K, "K-111: Nicht-Zahl → TypAnanas wie bei wurzel; salami kann log(0) nicht halten (K-005); Mathe.e gibt es nicht", P`
probier { Mathe.log("x"); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
probier { Mathe.exp(karton); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
probier { Mathe.log10(ja); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
probier { Mathe.log2(); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
probier { salami s = Mathe.log(0); } verbrannt (TypAnanas a) { Bote.sage(("salami")); }
probier { Mathe.e; } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
`, {
    out: ["log braucht eine Zahl, nicht \"x\".", "exp braucht eine Zahl, nicht karton.", "log10 braucht eine Zahl, nicht ja.",
      "log2 braucht eine Zahl, nicht karton.", "salami", "'e' gibt es bei Mathe nicht."],
  }),

  F(K, "K-105 API: keine Beläge, keine Pizza-Typen, kein teile, keine Belag-Keywords", P`
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
