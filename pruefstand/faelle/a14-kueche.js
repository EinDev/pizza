"use strict";
// Küchenbrigade (SPEC §17, KLAERUNGEN K-097 … K-101). Bis zur Interpreter-Umsetzung (Paket P1, THREADS.md §6) hieß die
// Datei a14-kueche-offen.js; Abnahme mit 72cb857 ff., Vertragslücken der Umsetzung in K-101 entschieden.
// Erwartungen stammen aus SPEC §17 – nicht aus dem Interpreter. Zahlen aus der D6-Referenztabelle (SPEC §17.6) bzw.
// aus der sequentiellen Referenz abgeleitet (belege-Läufe mit ce303cb ff. + D1–D15); Schrittzahlen von Hand nach §14.1.
const { P, F } = require("../lib/helfer");
const K = "§17 Küchenbrigade (K-097 … K-101)";

const schritte = (soll) => (res) => (res.schritte === soll ? undefined : `schritte ${res.schritte}, erwartet ${soll}`);
const uhr = (s, z) => (res) => {
  const e = [];
  if (res.schritte !== s) e.push(`schritte ${res.schritte}, erwartet ${s}`);
  if (res.zeitMs !== z) e.push(`zeitMs ${res.zeitMs}, erwartet ${z}`);
  return e;
};
const fang = (ausdruck) => `probier { ${ausdruck}; } verbrannt (KüchenAnanas a) { Bote.sage((a.nachricht())); }`;
const VAR = (n) => `'${n}' gehört der Hauptküche – ein Koch darf es nur lesen.`;
const KARTON = (art) => `${art} passt in keinen Karton – nur Werte können die Küche verlassen.`;

module.exports = [
  // ── §17.1 Grundform, Ergebnis, leeres Blech, Nicht-Funktion ────────────────────────
  F(K, "§17.1: brigade liefert [fn(b1), …, fn(bn)] in Stückreihenfolge", P`
Bote.sage(([1, 2, 3, 4].brigade(x -> x * x)));
Bote.sage(([[1, 2], [3, 4, 5]].brigade(b -> b.summe())));
`, { out: ["[1, 4, 9, 16]", "[3, 12]"] }),

  F(K, "§17.1: leeres Blech → [] ohne Anschnitt (keine Zufallsziehung)", P`
Blech<salami> nichts = [];
Bote.sage((nichts.brigade(x -> x * 2)));
Bote.sage((Zufall.zahl(1, 1000)));
`, { zufallsSaat: 42, out: ["[]", "602"] }),

  F(K, "§17.1: fn keine Funktion → derselbe Fehler wie bei belege", P`
Blech<salami> r = [1].brigade(3);
`, { exit: 1, fehler: { code: "TypAnanas", art: "ananas", zeile: 1,
    text: "Ungefangene Ananas – TypAnanas: 3 ist keine Funktion – das kann man nicht aufrufen. (Zeile 1)" } }),

  F(K, "§17.1: brigade ist kein Keyword (Bezeichner bleibt gültig)", P`
salami brigade = 3;
Bote.sage(([brigade].brigade(x -> x + brigade)));
`, { out: ["[6]"] }),

  F(K, "§17.1: verschachtelte Brigade", P`
Bote.sage(([[1, 2], [3, 4]].brigade(b -> b.brigade(x -> x * 10).summe())));
`, { out: ["[30, 70]"] }),

  F(K, "§17.1: verschachtelte Brigade – die äußere Küche ist Hauptküche der inneren", P`
Bote.sage(([1].brigade(x -> {
    salami eigen = 0;
    probier { [1].brigade(y -> { eigen = 5; serviere (y); }); } verbrannt (KüchenAnanas a) { serviere (-1); }
    serviere (eigen);
})));
`, { out: ["[-1]"] }),

  F(K, "§8/§17.3: KüchenAnanas ist eine eingebaute LaufzeitAnanas", P`
probier { wirf neu KüchenAnanas("selbst"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a)); Bote.sage((a.typ())); }
`, { out: ["KüchenAnanas: selbst", "KüchenAnanas"] }),

  // ── §17.2 Lesen erlaubt, eigenes frei ──────────────────────────────────────────────
  F(K, "§17.2: Stücke lesen Variablen, statische Felder, Felder und Bleche der Hauptküche", P`
salami faktor = 10;
klasse Küche { tiefkühl salami N = 3; }
klasse Box { salami w = 5; }
Box b = neu Box();
Blech<salami> zahlen = [7, 8];
Bote.sage(([1, 2].brigade(x -> x * faktor + Küche.N + b.w + zahlen.stück(x))));
`, { out: ["[25, 36]"] }),

  F(K, "§17.2: eigene Variablen, Objekte und Bleche sind frei veränderbar", P`
klasse Box { salami w = 0; leer erhöhe() { w = w + 1; } }
Bote.sage(([1, 2, 3].brigade(n -> {
    Box b = neu Box();
    Blech<salami> liste = [];
    für (salami i = 1; i <= n; i++) { b.erhöhe(); liste.hinzu(i); }
    serviere (b.w * 10 + liste.länge());
})));
`, { out: ["[11, 22, 33]"] }),

  // ── §17.3 S3: KüchenAnanas an der schreibenden Stelle ──────────────────────────────
  F(K, "§17.3 S3: Zuweisung an globale Variable → ungefangene KüchenAnanas mit Zeile im Stück", P`
salami zähler = 0;
[1, 2].brigade(x -> {
    zähler = zähler + x;
    serviere (x);
});
`, { exit: 1, fehler: { code: "KüchenAnanas", art: "ananas", zeile: 3,
    text: "Ungefangene Ananas – KüchenAnanas: " + VAR("zähler") + " (Zeile 3)" } }),

  F(K, "§17.3 S3: += gefangen als LaufzeitAnanas; die Variable bleibt unverändert", P`
salami zähler = 0;
probier {
    [1, 2].brigade(x -> { zähler += x; serviere (x); });
} verbrannt (LaufzeitAnanas a) {
    Bote.sage((a.typ() + ": " + a.nachricht()));
}
Bote.sage((zähler));
`, { out: ["KüchenAnanas: " + VAR("zähler"), "0"] }),

  F(K, "§17.3 S3: ++ auf gefangene Zelle einer umgebenden Funktion", P`
salami zähle(Blech<salami> b) {
    salami n = 0;
    b.brigade(x -> { n++; serviere (x); });
    serviere (n);
}
${fang("Bote.sage((zähle([1, 2])))")}
`, { out: [VAR("n")] }),

  F(K, "§17.3 S3: statisches Feld und schieb(x) einer Hauptküchen-Variable", P`
klasse Küche { tiefkühl salami zähler = 0; }
${fang("[1].brigade(x -> { Küche.zähler = 5; serviere (x); })")}
margherita p = "Salami";
${fang("[1].brigade(x -> schieb(p))")}
Bote.sage((Küche.zähler + " " + p));
`, { out: [VAR("zähler"), VAR("p"), "0 Salami"] }),

  F(K, "§17.3 S3: Feldzuweisung an vorhandenem Objekt (direkt und über eine Methode)", P`
klasse Box { salami w = 1; leer erhöhe() { w = w + 1; } }
Box b = neu Box();
${fang("[1].brigade(x -> { b.w = 2; serviere (x); })")}
${fang("[1].brigade(x -> { b.erhöhe(); serviere (x); })")}
Bote.sage((b.w));
`, { out: [VAR("w"), VAR("w"), "1"] }),

  F(K, "§17.3 S3: Blech der Hauptküche – hinzu/entferne/setze; kopie() ist eigen", P`
Blech<salami> b = [1, 2];
${fang("[1].brigade(x -> b.hinzu(3))")}
${fang("[1].brigade(x -> b.entferne(1))")}
${fang("[1].brigade(x -> b.setze(1, 9))")}
Bote.sage(([1].brigade(x -> { Blech<salami> c = b.kopie(); c.hinzu(3); serviere (c); })));
Bote.sage((b));
`, { out: ["Dieses Blech gehört der Hauptküche – nimm eine kopie().", "Dieses Blech gehört der Hauptküche – nimm eine kopie().",
    "Dieses Blech gehört der Hauptküche – nimm eine kopie().", "[[1, 2, 3]]", "[1, 2]"] }),

  F(K, "§17.3 S3: indirekter Schreibzugriff über statische Methode (wie raetsel/pizzaiolos)", P`
klasse Küche {
    tiefkühl Blech<salami> erste = [];
    tiefkühl salami merke(salami s) { erste.hinzu(s); serviere (s); }
}
${fang("Bote.sage(([1, 2].brigade(s -> Küche.merke(s))))")}
Bote.sage((Küche.erste));
`, { out: ["Dieses Blech gehört der Hauptküche – nimm eine kopie().", "[]"] }),

  F(K, "§17.3 S3: Speisekarte der Hauptküche – lege/entferne; hole ist Lesen", P`
Speisekarte<margherita, salami> m = neu Speisekarte<margherita, salami>();
m.lege("a", 1);
${fang('[1].brigade(x -> m.lege("b", 2))')}
${fang('[1].brigade(x -> m.entferne("a"))')}
Bote.sage(([1].brigade(x -> m.hole("a"))));
Bote.sage((m));
`, { out: ["Diese Speisekarte gehört der Hauptküche – ein Koch darf sie nur lesen.",
    "Diese Speisekarte gehört der Hauptküche – ein Koch darf sie nur lesen.", "[1]", "{a: 1}"] }),

  F(K, "§17.3 S3: Teig der Hauptküche – gehenlassen/backen (roh) werfen ohne T0007; gebacken ist lesbar", P`
Teig<salami> t = teig(() -> (6 * 7));
${fang("[1].brigade(x -> t.gehenlassen())")}
${fang("[1].brigade(x -> t.backen())")}
t.gehenlassen();
Bote.sage((t.backen()));
Bote.sage(([1, 2].brigade(x -> t.backen() + x)));
Bote.sage(([3].brigade(x -> teig(() -> (x * 2)).gehenlassen().backen())));
`, { out: ["Dieser Teig gehört der Hauptküche – ein Koch darf ihn nur ansehen.",
    "Dieser Teig gehört der Hauptküche – ein Koch darf ihn nur ansehen.", "42", "[43, 44]", "[6]"], noWarn: ["T0007"] }),

  F(K, "§17.3 S3: Lieferung der Hauptküche – trinkgeld/warte (nicht gewartet) werfen; gewartete ist lesbar", P`
Lieferung<salami> l = bestelle(() -> (5));
${fang("[1].brigade(x -> l.trinkgeld(1))")}
${fang("[1].brigade(x -> l.warte())")}
Zustellung<salami> z = l.warte();
Bote.sage(([1].brigade(x -> l.warte().wert() + x)));
`, { out: ["Diese Lieferung gehört der Hauptküche – ein Koch darf sie nur ansehen.",
    "Diese Lieferung gehört der Hauptküche – ein Koch darf sie nur ansehen.", "[6]"] }),

  F(K, "§17.3 S3: Zufall-Objekt der Hauptküche – Ziehen wirft; eigener Zufall ist frei", P`
Zufall z = neu Zufall(7);
${fang("[1].brigade(x -> z.zahl(1, 6))")}
Bote.sage(([1].brigade(x -> { Zufall e = neu Zufall(7); serviere (e.zahl(1, 6)); })));
Bote.sage((z.zahl(1, 6)));
`, { out: ["Dieser Zufall gehört der Hauptküche – nimm Zufall direkt oder neu Zufall().", "[1]", "1"] }),

  F(K, "§17.3 S3 (K-098/2): saat(n) auf vorhandenem Zufall-Objekt wirft; saat() liest", P`
Zufall z = neu Zufall(5);
${fang("[1].brigade(x -> z.saat(7))")}
Bote.sage(([1].brigade(x -> z.saat())));
`, { out: ["Dieser Zufall gehört der Hauptküche – nimm Zufall direkt oder neu Zufall().", "[5]"] }),

  F(K, "§17.3 S3/S4: Vorratskammer – lege/leeren werfen, neu Vorratskammer nur in der Hauptküche, Lesen erlaubt", P`
Vorratskammer v = neu Vorratskammer("k");
v.lege("a", 1);
${fang('[1].brigade(x -> v.lege("b", 2))')}
${fang("[1].brigade(x -> v.leeren())")}
${fang('[1].brigade(x -> neu Vorratskammer("k"))')}
Bote.sage(([1].brigade(x -> v.hole("a") + v.länge())));
`, { vorrat: {},
    out: ["Die Vorratskammer 'k' gehört der Hauptküche – ein Koch darf nur nachsehen.",
      "Die Vorratskammer 'k' gehört der Hauptküche – ein Koch darf nur nachsehen.",
      "Neue Vorratskammern gibt es nur in der Hauptküche.", "[2]"],
    vorratEreignisse: [{ name: "k", schluessel: "a", wert: 1 }] }),

  F(K, "§17.3 S3: aufklappen() einer vorhandenen Calzone (ohne W0013)", P`
calzone klasse Konto { geheimrezept funghi stand = (1000.0); }
Konto k = neu Konto();
${fang("[1].brigade(x -> k.aufklappen())")}
`, { out: ["Diese Calzone gehört der Hauptküche – ein Koch darf sie nicht aufklappen."], noWarn: ["W0013"] }),

  F(K, "§17.3 S3: KüchenAnanas ist im Stück fangbar; das Stück läuft weiter", P`
salami z = 0;
Bote.sage(([1, 2].brigade(x -> {
    probier { z = x; } verbrannt (KüchenAnanas a) { serviere (-x); }
    serviere (x);
})));
Bote.sage((z));
`, { out: ["[-1, -2]", "0"] }),

  // ── §17.3 S4: nur in der Hauptküche ─────────────────────────────────────────────
  F(K, "§17.3 S4: Bestellannahme (auch hatMehr) wirft; die Eingabe bleibt unverbraucht", P`
${fang("[1].brigade(x -> Bestellannahme.lies())")}
${fang("[1].brigade(x -> Bestellannahme.hatMehr())")}
Bote.sage((Bestellannahme.lies()));
`, { eingabe: ["hallo"], out: ["Bestellannahme gibt es nur in der Hauptküche.", "Bestellannahme gibt es nur in der Hauptküche.", "hallo"] }),

  F(K, "§17.3 S4: Theke – neu Zutat und jede Methode (auch Getter) werfen", P`
Schild s = neu Schild("hallo");
${fang('[1].brigade(x -> neu Schild("x"))')}
${fang("[1].brigade(x -> s.text())")}
Bote.sage((s.text()));
`, { out: ["Die Theke gibt es nur in der Hauptküche.", "Die Theke gibt es nur in der Hauptküche.", "hallo"] }),

  F(K, "§17.3 S4: Theke v3 (§16.6) – animiere, uebergang (auch Getter) und Theke.schwebe werfen in der Küche", P`
Theke t = neu Theke("A");
Schild s = neu Schild("hallo");
${fang('[1].brigade(x -> s.animiere("puls"))')}
${fang("[1].brigade(x -> s.uebergang(ja))")}
${fang("[1].brigade(x -> s.uebergang())")}
${fang('[1].brigade(x -> t.schwebe("+1"))')}
Bote.sage((s.text()));
`, { out: ["Die Theke gibt es nur in der Hauptküche.", "Die Theke gibt es nur in der Hauptküche.", "Die Theke gibt es nur in der Hauptküche.", "Die Theke gibt es nur in der Hauptküche.", "hallo"] }),

  F(K, "§17.3 S4 (K-101/3): neu Zutat() wirft auch in der Küche die RohlingAnanas (abstrakt überall), nicht den S4-Text", P`
probier { [1].brigade(x -> neu Zutat()); } verbrannt (RohlingAnanas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }
probier { neu Zutat(); } verbrannt (RohlingAnanas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }
`, { out: ["RohlingAnanas: Ein Rohling ist nicht essbar.", "RohlingAnanas: Ein Rohling ist nicht essbar."] }),

  // ── §17.3 Reihenfolge der Wache (K-101/4) ────────────────────────────────────────
  F(K, "K-101/4: Operanden zuerst (rechte Seite läuft), Ziel auflösen (LaufzeitAnanas), dann Wache – vor Index, Typ und gebacken", P`
salami lies(salami n) { Bote.sage(("rechts " + n)); serviere (n); }
salami z = 0;
Blech<salami> b = [1, 2];
klasse Box { salami w = 1; }
Box o = neu Box();
gebacken salami g = 1;
${fang("[1].brigade(x -> { z = lies(x); })")}
${fang("[1].brigade(x -> b.setze(99, 5))")}
${fang('[1].brigade(x -> b.setze("x", 5))')}
${fang('[1].brigade(x -> { z = "text"; })')}
${fang('[1].brigade(x -> { o.w = "text"; })')}
${fang("[1].brigade(x -> { g = 2; })")}
probier { [1].brigade(x -> { o.q = 1; }); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.typ())); }
probier { [1].brigade(x -> { zz = 5; }); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.typ() + ": " + a.nachricht())); }
Bote.sage((z + " " + b + " " + o.w + " " + g));
`, { out: ["rechts 1", VAR("z"),
    "Dieses Blech gehört der Hauptküche – nimm eine kopie().", "Dieses Blech gehört der Hauptküche – nimm eine kopie().",
    VAR("z"), VAR("w"), VAR("g"),
    "LaufzeitAnanas", "LaufzeitAnanas: 'zz' ist nicht definiert.",
    "0 [1, 2] 1 1"] }),

  // S₀ = 5 (ohne globale Deklaration) bzw. 7; das Stück kostet 9 (lokale Deklaration 2 + probier 1 + Zuweisung 4 + serviere 2)
  // bzw. 7 (ohne Deklaration, Zuweisung mit Wache ebenfalls 4) → beide Male Uhr 14, dann Bote.sage((Uhr.jetzt())) = +5 (§14.1).
  F(K, "K-101/4: die Wache kostet nichts – gefangene Zuweisung an Hauptküchen-Variable zählt wie die gelungene (je 4 Schritte)", P`
[1].brigade(x -> { salami y = 0; probier { y = x + 1; } verbrannt (KüchenAnanas a) { } serviere (x); });
Bote.sage((Uhr.jetzt()));
`, { out: ["19ms"], check: uhr(19, 19) }),

  F(K, "K-101/4: dieselbe Zuweisung an eine Hauptküchen-Variable – gleiche Uhr", P`
salami z = 0;
[1].brigade(x -> { probier { z = x + 1; } verbrannt (KüchenAnanas a) { } serviere (x); });
Bote.sage((Uhr.jetzt()));
`, { out: ["19ms"], check: uhr(19, 19) }),

  // ── §17.3 S5: Lieferungen einer Küche verfallen ──────────────────────────────────
  F(K, "§17.3 S5: in der Küche bestellte, nicht gewartete wennDa-Lieferung läuft nie", P`
Blech<salami> r = [1].brigade(x -> {
    bestelle(() -> (x)).wennDa(w -> Bote.sage(("geliefert " + w)));
    serviere (x);
});
Bote.sage(("ende"));
`, { out: ["ende"] }),

  // ── §17.5 Kartonfähigkeit ──────────────────────────────────────────────────────────
  F(K, "§17.5: kartonfähige Werte verlassen die Küche (Zahl, Text, Dauer, Enum, Objekt, Speisekarte, karton)", P`
quattrostagioni Jahreszeit { FRÜHLING, SOMMER, HERBST, WINTER }
klasse Pizza { margherita belag = "Salami"; margherita alsText() { serviere (("((" + belag + "))")); } }
Blech<salami> r = [1].brigade(x -> {
    Pizza p = neu Pizza();
    Speisekarte<margherita, salami> m = neu Speisekarte<margherita, salami>();
    m.lege("x", x);
    serviere ([x, "t", 2s, Jahreszeit.SOMMER, p, m, karton, ja]);
});
Bote.sage((r));
Bote.sage((r.stück(1).stück(5).belag));
`, { out: ["[[1, t, 2s, SOMMER, ((Salami)), {x: 1}, karton, ja]]", "Salami"] }),

  F(K, "§17.5: nicht kartonfähig → KüchenAnanas am brigade-Aufruf (ungefangen: Zeile des Aufrufs)", P`
Blech<salami> b = [1, 2];
b.brigade(x -> {
    serviere (() -> x);
});
`, { exit: 1, fehler: { code: "KüchenAnanas", art: "ananas", zeile: 2,
    text: "Ungefangene Ananas – KüchenAnanas: " + KARTON("Eine Funktion") + " (Zeile 2)" } }),

  F(K, "§17.5: alle Arten nicht kartonfähiger Werte (auch verschachtelt)", P`
Vorratskammer v = neu Vorratskammer("k");
Schild s = neu Schild("x");
${fang("[1].brigade(x -> teig(() -> (x)))")}
${fang("[1].brigade(x -> bestelle(() -> (x)))")}
${fang("[1].brigade(x -> bestelle(() -> (x)).warte())")}
${fang("[1].brigade(x -> neu Zufall(x))")}
${fang("[1].brigade(x -> v)")}
${fang("[1].brigade(x -> s)")}
${fang("[1].brigade(x -> [x, teig(() -> (x))])")}
${fang("[1].brigade(x -> Bote.sage)")}
`, { vorrat: {}, out: [KARTON("Ein Teig"), KARTON("Eine Lieferung"), KARTON("Eine Zustellung"),
    KARTON("Ein Zufall"), KARTON("Eine Vorratskammer"), KARTON("Eine Theke-Zutat"), KARTON("Ein Teig"), KARTON("Eine Funktion")] }),

  // verbrauchteZeit: Budget 3ms ist beim 4. Schritt überschritten (§14.2: ofen(zeit: 5ms) { solange (ja) { } } → 6ms)
  F(K, "§17.5 (K-101/1): Rohling (roh-Info) ist kartonfähig – Teilergebnis kopiert, verbrauchteZeit gleich; Tiefensuche ins Teilergebnis", P`
Blech<Rohling<salami>> r = [1, 2].brigade(x -> ofen(zeit: 3ms) { zwischenstand((x)); solange (ja) { } } roh (info) { serviere (info); });
Bote.sage((r));
Bote.sage((r.stück(2).teilergebnis() + " " + r.stück(2).verbrauchteZeit()));
${fang("[1].brigade(x -> ofen(zeit: 10ms) { zwischenstand((teig(() -> (x)))); solange (ja) { } } roh (info) { serviere (info); })")}
`, { out: ["[Roh(1), Roh(2)]", "2 4ms", KARTON("Ein Teig")] }),

  F(K, "§17.5: geworfener Wert nicht kartonfähig → 'Was der Koch geworfen hat, passt in keinen Karton.'", P`
klasse TeigAnanas erbt LaufzeitAnanas {
    Teig<salami> t = teig(() -> (1));
    TeigAnanas(margherita m) { unten(m); }
}
${fang('[1].brigade(x -> { wirf neu TeigAnanas("mit Teig"); })')}
`, { out: ["Was der Koch geworfen hat, passt in keinen Karton."] }),

  F(K, "§17.5: Ergebnisse sind Kopien (Identität), Teilung innerhalb eines Ergebnisses bleibt", P`
Blech<Blech<salami>> b = [[1], [2]];
Blech<Blech<salami>> c = b.brigade(x -> x);
Bote.sage((c.stück(1) == b.stück(1)));
c.stück(1).hinzu(5);
Bote.sage((b + " " + c));
Bote.sage(([1.5, 2].brigade(x -> x).stück(1) == 1.5));
Blech<Blech<Blech<salami>>> r = [1].brigade(x -> { Blech<salami> a = [x]; serviere ([a, a]); });
r.stück(1).stück(1).hinzu(2);
Bote.sage((r));
`, { out: ["nein", "[[1], [2]] [[1, 5], [2]]", "ja", "[[[1, 2], [1, 2]]]"] }),

  // ── §17.6 Determinismus ────────────────────────────────────────────────────────────
  F(K, "D3: Abbruch in Stück 2 von 4 – Ausgaben von 1 und 2 (bis zum Abbruch), 3–4 nie gelaufen; Zeile aus der Küche", P`
[1, 2, 3, 4].brigade(x -> {
    Bote.sage(("Stück " + x));
    falls (x >= 2) { wirf neu StreitAnanas("Stück " + x + " streitet"); }
    serviere (x);
});
Bote.sage(("nie"));
`, { exit: 1, out: ["Stück 1", "Stück 2"], fehler: { code: "StreitAnanas", art: "ananas", zeile: 3,
    text: "Ungefangene Ananas – StreitAnanas: Stück 2 streitet (Zeile 3)" }, check: schritte(37) }),

  F(K, "D3: der erste Abbruch in Stückreihenfolge gewinnt; fangbar am brigade-Aufruf", P`
probier {
    [1, 2, 3].brigade(x -> {
        falls (x == 2) { wirf neu StreitAnanas("zwei"); }
        falls (x == 3) { wirf neu RechenAnanas("drei"); }
        serviere (x);
    });
} verbrannt (StreitAnanas a) {
    Bote.sage(("gefangen: " + a.nachricht()));
}
`, { out: ["gefangen: zwei"], zweimal: true }),

  F(K, "D4: Ereignisse eines Stücks in Auftretensreihenfolge, Stücke in Stückreihenfolge, vor der Rückkehr", P`
Blech<salami> r = [1, 2].brigade(x -> {
    Bote.sage(("a" + x));
    Bote.fehler(("f" + x));
    Bote.sage(("b" + x));
    serviere (x);
});
Bote.sage(("danach"));
`, {
    out: ["a1", "b1", "a2", "b2", "danach"], fehlerOut: ["f1", "f2"],
    check(res) {
      const folge = res.ereignisse.filter((e) => e.typ === "ausgabe" || e.typ === "fehlerausgabe").map((e) => e.text).join(",");
      return folge === "a1,f1,b1,a2,f2,b2,danach" ? undefined : "Ereignisfolge " + folge;
    },
  }),

  F(K, "D5: W0003 in mehreren Stücken → einmal, vor dem Ergebnis; danach in der Hauptküche nicht erneut", P`
klasse Alt {
    @PizzaVeraltet(grund: "alt")
    tiefkühl salami m(salami x) { serviere (x); }
}
Bote.sage(([1, 2, 3].brigade(x -> Alt.m(x))));
Bote.sage((Alt.m(4)));
`, {
    out: ["[1, 2, 3]", "4"], warnAnzahl: { W0003: 1 },
    check(res) {
      const iw = res.ereignisse.findIndex((e) => e.typ === "warnung" && e.code === "W0003");
      const ia = res.ereignisse.findIndex((e) => e.typ === "ausgabe");
      return iw >= 0 && iw < ia ? undefined : "W0003 muss vor der ersten Ausgabe stehen";
    },
  }),

  F(K, "D5: S0007 an derselben Stelle in zwei Stücken → einmal", P`
Bote.sage(([1, 2].brigade(x -> [1 .. 14].schneide(7).länge())));
`, { out: ["[7, 7]"], warnAnzahl: { S0007: 1 } }),

  F(K, "D6 Referenz: [1, 2, 3, 4].brigade(x -> x * x) → schritte 20, zeitMs 11", P`
Blech<salami> r = [1, 2, 3, 4].brigade(x -> x * x);
`, { check: uhr(20, 11) }),

  F(K, "D6 Referenz: Uhr.jetzt() nach der Brigade → 16ms, schritte 25, zeitMs 16", P`
Blech<salami> r = [1, 2, 3, 4].brigade(x -> x * x);
Bote.sage((Uhr.jetzt()));
`, { out: ["16ms"], check: uhr(25, 16) }),

  F(K, "D6 Referenz: vorspulen in Stücken – der langsamste Koch zählt (4s 21ms)", P`
[1, 2, 3, 4].brigade(x -> { Uhr.vorspulen(x * 1s); serviere (x); });
Bote.sage((Uhr.jetzt()));
`, { out: ["4s 21ms"], check: uhr(45, 4021) }),

  F(K, "D7: Schrittlimit im Stück (Rest beim Anschnitt) → P0002, Exit 3; k = 1: schritte = Limit + 1", P`
[1, 2].brigade(x -> {
    Bote.sage(("los " + x));
    solange (ja) { }
    serviere (x);
});
`, { schrittLimit: 100, exit: 3, out: ["los 1"], fehler: { code: "P0002", art: "limit" }, check: schritte(101) }),

  // S₀ = 6 (Anweisung, Blech-Literal, zwei Zahlen, Lambda, Aufruf); Stück 1: falls 1 + (x == 2) 3 + serviere 2 = 6;
  // Stück 2: R = 100 − 6 = 94 → bricht beim eigenen Schritt 95 ab. schritte = 6 + 6 + 95 = 107 (Arbeit), Uhr = 6 + 95 = 101.
  F(K, "D7 (K-101/2): P0002 in Stück 2 → schritte = S₀ + s₁ + (R + 1) = 107, Küchenuhr bei Limit + 1 (zeitMs 101)", P`
[1, 2].brigade(x -> {
    falls (x == 2) { solange (ja) { } }
    serviere (x);
});
`, { schrittLimit: 100, exit: 3, out: [], fehler: { code: "P0002", art: "limit", zeile: 1 }, check: uhr(107, 101) }),

  F(K, "D7: Summe der Stücke über dem Limit → P0002 am brigade-Aufruf, schritte = tatsächliche Summe", P`
Blech<salami> r = [1, 2, 3, 4].brigade(x -> x * x * x * x);
Bote.sage(("nie"));
`, { schrittLimit: 30, exit: 3, out: [], fehler: { code: "P0002", art: "limit", zeile: 1 }, check: uhr(36, 15) }),

  F(K, "D8: äußerer Ofen misst den kritischen Pfad (27ms reichen für vier Stücke, belege bräuchte mehr)", P`
salami n = ofen(zeit: 27ms) {
    Blech<salami> r = [1, 2, 3, 4].brigade(x -> { Uhr.vorspulen(10ms); serviere (x); });
    serviere (r.länge());
} roh (info) {
    serviere (-1);
};
Bote.sage((n));
`, { out: ["4"] }),

  F(K, "D8: äußerer Ofen – 26ms reichen nicht (roh nach dem Zusammenführen)", P`
salami n = ofen(zeit: 26ms) {
    Blech<salami> r = [1, 2, 3, 4].brigade(x -> { Uhr.vorspulen(10ms); serviere (x); });
    serviere (r.länge());
} roh (info) {
    serviere (-1);
};
Bote.sage((n));
`, { out: ["-1"] }),

  F(K, "D8: Budget im Stück überschritten → roh am brigade-Aufruf, verbrauchteZeit = Uhr nach D6 − Start", P`
Dauer d = ofen(zeit: 20ms) {
    Blech<salami> r = [1, 2, 3, 4].brigade(x -> { Uhr.vorspulen(10ms); Bote.sage(("nie")); serviere (x); });
    serviere (0ms);
} roh (info) {
    serviere (info.verbrauchteZeit());
};
Bote.sage((d));
`, { out: ["22ms"] }),

  F(K, "D9: je Stück eigener Strom mit der i-ten gezogenen Saat; Hauptküche zieht danach weiter (Saat 42)", P`
Bote.sage(([1, 2, 3].brigade(x -> Zufall.zahl(1, 1000))));
Bote.sage((Zufall.zahl(1, 1000)));
`, { zufallsSaat: 42, out: ["[248, 359, 896]", "670"], zweimal: true }),

  F(K, "D9: Zufall.saat() im Stück liefert sᵢ (wie neu Zufall())", P`
Bote.sage(([1, 2, 3].brigade(x -> Zufall.saat())));
`, { zufallsSaat: 42, out: ["[2581720956, 1925393290, 3661312704]"] }),

  F(K, "D9: Zufall.saat(n) im Stück setzt nur den Küchenstrom", P`
Bote.sage(([1, 2].brigade(x -> { Zufall.saat(7); serviere (Zufall.zahl(1, 6)); })));
Bote.sage((Zufall.saat()));
Bote.sage((Zufall.zahl(1, 1000)));
`, { zufallsSaat: 42, out: ["[1, 1]", "42", "853"] }),

  F(K, "D10: Objektnummern je Küche ab N₀ + 1, Kopien behalten die Nummer, Hauptküche weiter ab N₀ + max cᵢ", P`
klasse Teller { salami n = 0; }
Teller vorher = neu Teller();
Blech<Teller> r = [1, 2, 3].brigade(k -> {
    Teller t = karton;
    für (salami i = 1; i <= k; i++) { t = neu Teller(); t.n = k; }
    serviere (t);
});
Bote.sage((vorher + " " + r));
r.stück(3).n = 9;
Bote.sage((r.stück(3).n));
Bote.sage((neu Teller()));
`, { out: ["Teller@1 [Teller@2, Teller@3, Teller@4]", "9", "Teller@5"] }),

  F(K, "D12: Küche liest den Kühlschrank des Schnappschusses, eigener Küchen-Cache verfällt am Stückende", P`
klasse Lager {
    @Kühlschrank
    salami wert(salami k) { Bote.sage(("rechne " + k)); serviere (k * 10); }
}
Lager l = neu Lager();
Bote.sage((l.wert(1)));
Bote.sage(([1, 2].brigade(x -> l.wert(1) + l.wert(2) + l.wert(2))));
Bote.sage((l.wert(2)));
`, { out: ["rechne 1", "10", "rechne 2", "rechne 2", "[50, 50]", "rechne 2", "20"] }),

  F(K, "D14: Panik in Stück 2 → Banner nach den Ausgaben der Stücke 1 und 2, Exit 39", P`
klasse Hawaii { }
[1, 2, 3].brigade(x -> {
    Bote.sage(("Stück " + x));
    falls (x == 2) { neu Hawaii(); }
    serviere (x);
});
`, { exit: 39, panik: true, out: ["Stück 1", "Stück 2"] }),

  F(K, "D14/D3: Ananas in Stück 1 gewinnt gegen Panik in Stück 2 (kein Banner)", P`
klasse Hawaii { }
[1, 2].brigade(x -> {
    falls (x == 1) { wirf neu StreitAnanas("zuerst"); }
    neu Hawaii();
    serviere (x);
});
`, { exit: 1, fehler: { code: "StreitAnanas", art: "ananas", zeile: 3, text: "Ungefangene Ananas – StreitAnanas: zuerst (Zeile 3)" } }),

  F(K, "D15: Hauptküche nach der Brigade unverändert (Variablen, Objekte, Bleche)", P`
salami a = 1;
Blech<salami> b = [1, 2];
klasse Box { salami w = 3; }
Box o = neu Box();
Blech<salami> r = [1, 2].brigade(x -> {
    Blech<salami> eigen = b.kopie();
    eigen.hinzu(a + o.w);
    serviere (eigen.summe());
});
Bote.sage((a + " " + b + " " + o.w + " " + r));
`, { out: ["1 [1, 2] 3 [7, 7]"] }),
];
