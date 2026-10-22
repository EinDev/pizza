"use strict";
const { P, F } = require("../lib/helfer");
const U = "§7.1 Uhr & Schritte";
const T = "§7.2 Teig";
const O = "§7.3 Ofen";
const S = "§7.4 Schneiden";
const B = "§7.5 Stücke/Besitz";
const K = "§7.6 Kühlschrank";
const L = "§7.7 Lieferung";
const C = "§7.8 Calzone";

const LADEN = P`
klasse Laden {
    salami zähler = 0;
    @Kühlschrank(haltbar: 3d)
    speisekarte salami hole(salami x) { zähler += 1; serviere ((x * 10 + zähler)); }
}
`;

module.exports = [
  // ───────── §7.1 ─────────
  F(U, "Endlosschleife → P0002, Exit 3, art limit", P`
Bote.sage(("los"));
solange (ja) { }
`, {
    exit: 3, schrittLimit: 20000, out: ["los"],
    fehler: { code: "P0002", art: "limit", text: "PizzaFehler P0002: Die Pizza ist noch im Ofen. (Schrittlimit erreicht – Endlosschleife?)" },
  }),

  F(U, "schrittLimit-Option wird beachtet (klar über Budget)", P`
salami i = 0;
solange (i < 100000) { i++; }
Bote.sage(("fertig"));
`, { exit: 3, schrittLimit: 1000, out: [] }),

  F(U, "Uhr.jetzt() läuft mit den Schritten", P`
Dauer a = Uhr.jetzt();
salami s = 0;
für (salami i = 0; i < 100; i++) { s += i; }
Dauer b = Uhr.jetzt();
Bote.sage((b > a));
Bote.sage((b - a >= 100ms));
`, { out: ["ja", "ja"] }),

  F(U, "Uhr.vorspulen(d) springt die Uhr weiter, zeitMs im Ergebnis", P`
Dauer a = Uhr.jetzt();
Uhr.vorspulen((1h));
Dauer b = Uhr.jetzt();
Bote.sage((b - a >= 1h));
Bote.sage((b - a < 1h + 1s));
`, {
    out: ["ja", "ja"],
    check: (r) => (r.zeitMs >= 3600000 && r.zeitMs < 3700000 ? undefined : "zeitMs sollte ≈ 1h sein, ist " + r.zeitMs),
  }),

  // ───────── §7.2 ─────────
  F(T, "teig: lazy, gehenlassen berechnet einmal, backen liefert Wert", P`
salami n = 0;
Teig<salami> t = teig(() -> { n += 1; serviere ((42)); });
Bote.sage((n));
Bote.sage((t.istAufgegangen()));
t.gehenlassen();
Bote.sage((t.istAufgegangen()));
Bote.sage((t.backen()));
Bote.sage((t.backen()));
Bote.sage((n));
`, { out: ["0", "nein", "ja", "42", "42", "1"], noWarn: ["T0007"] }),

  F(T, "backen ohne gehenlassen → Wert + Warnung T0007", P`
Teig<salami> t = teig(() -> (6 * 7));
Bote.sage((t.backen()));
`, { out: ["42"], warn: ["T0007"], warnText: { T0007: "Teig wird gebacken, ohne gehen gelassen worden zu sein. Das schmeckt flach." } }),

  F(T, "gehenlassen() gibt den Teig zurück", P`
Teig<salami> t = teig(() -> (5));
Bote.sage((t.gehenlassen().backen()));
`, { out: ["5"], noWarn: ["T0007"] }),

  // ───────── §7.3 ─────────
  F(O, "ofen-Ausdruck liefert serviere-Wert", P`
salami s = ofen(zeit: 90s) {
    salami summe = 0;
    für (salami i = 1; i <= 4; i++) { summe += i; }
    serviere ((summe));
};
Bote.sage((s));
`, { out: ["10"] }),

  F(O, "serviere im ofen verlässt die Methode NICHT", P`
klasse K {
    tiefkühl salami f() {
        salami x = ofen(zeit: 10s) { serviere ((1)); };
        Bote.sage(("nach ofen"));
        serviere ((x + 1));
    }
}
Bote.sage((K.f()));
`, { out: ["nach ofen", "2"] }),

  F(O, "Budget überschritten → roh-Zweig mit teilergebnis und verbrauchteZeit", P`
salami s = ofen(zeit: 100ms) {
    zwischenstand((99));
    salami i = 0;
    solange (ja) { i++; }
    serviere ((i));
} roh (r) {
    Bote.sage((r.verbrauchteZeit() > 0ms));
    serviere ((r.teilergebnis()));
};
Bote.sage((s));
`, { out: ["ja", "99"] }),

  F(O, "roh ohne zwischenstand → teilergebnis karton", P`
salami s = ofen(zeit: 100ms) {
    solange (ja) { }
    serviere ((1));
} roh (r) {
    Bote.sage((r.teilergebnis()));
    serviere ((0));
};
Bote.sage((s));
`, { out: ["karton", "0"] }),

  F(O, "Budget überschritten ohne roh → VerbranntAnanas mit N = zeit_ms (K-127)", P`
salami s = ofen(zeit: 100ms) {
    solange (ja) { }
    serviere ((1));
};
`, { exit: 1, fehler: { code: "VerbranntAnanas", textEnthält: "VerbranntAnanas: Zu lange im Ofen: Budget von 100 Schritten überschritten." } }),

  F(O, "zeit auch positional: ofen(250ms) → Budget 250 (K-127)", P`
salami s = ofen(250ms) {
    solange (ja) { }
    serviere ((1));
};
`, { exit: 1, fehler: { code: "VerbranntAnanas", textEnthält: "Budget von 250 Schritten überschritten." } }),

  F(O, "Mehr Zeit = mehr Budget: gleiche Arbeit passt erst mit 10s", P`
salami a = ofen(zeit: 100ms) {
    salami s = 0;
    für (salami i = 0; i < 200; i++) { s += i; }
    serviere ((s));
} roh (r) { serviere ((-1)); };
salami b = ofen(zeit: 10s) {
    salami s = 0;
    für (salami i = 0; i < 200; i++) { s += i; }
    serviere ((s));
} roh (r) { serviere ((-1)); };
Bote.sage((a));
Bote.sage((b));
`, { out: ["-1", "19900"] }),

  F(O, "Standard-Zeit 60s reicht für kleine Arbeit", P`
salami s = ofen {
    salami x = 0;
    für (salami i = 0; i < 1000; i++) { x += 1; }
    serviere ((x));
};
Bote.sage((s));
`, { out: ["1000"] }),

  F(O, "verbrannt-Zweig fängt Ananas aus dem Block", P`
margherita s = ofen(zeit: 1s) {
    wirf neu StreitAnanas("zank");
    serviere (("nie"));
} verbrannt (StreitAnanas a) {
    serviere ((a.nachricht()));
};
Bote.sage((s));
`, { out: ["zank"] }),

  F(O, "nicht passende Ananas läuft nach außen", P`
probier {
    salami s = ofen(zeit: 1s) {
        wirf neu RechenAnanas("r");
        serviere ((1));
    } verbrannt (StreitAnanas a) {
        serviere ((2));
    };
} verbrannt (RechenAnanas r) {
    Bote.sage(("außen"));
}
`, { out: ["außen"] }),

  F(O, "roh und verbrannt zusammen (Reihenfolge roh, dann verbrannt)", P`
salami s = ofen(zeit: 50ms) {
    solange (ja) { }
    serviere ((1));
} roh (r) {
    serviere ((7));
} verbrannt (a) {
    serviere ((8));
};
Bote.sage((s));
`, { out: ["7"] }),

  // ───────── §7.4 ─────────
  F(S, "schneide(n): vordere Stücke ggf. größer", P`
Bote.sage(([1 .. 8].schneide(3)));
Bote.sage(([1 .. 5].schneide(2)));
`, { out: ["[[1, 2, 3], [4, 5, 6], [7, 8]]", "[[1, 2, 3], [4, 5]]"] }),

  F(S, "schneide(auto) gibt es nicht mehr: auto ist ein gewöhnlicher Name (K-127)", P`
Blech<Blech<salami>> st = [1 .. 16].schneide(auto);
`, { exit: 1, fehler: { code: "LaufzeitAnanas", textEnthält: "'auto' ist nicht definiert." } }),

  F(S, "schneide() ohne Stückzahl → TypAnanas (K-127)", P`
probier { [1 .. 16].schneide(); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
`, { out: ["schneide braucht eine Ganzzahl, nicht karton."] }),

  F(S, "schneide(7) und blech / 7 → keine Warnung (K-127)", P`
Bote.sage(([1 .. 14].schneide(7).länge()));
Bote.sage((([1 .. 14] / 7).länge()));
`, { out: ["7", "7"], noWarn: ["S0007"] }),

  F(S, "blech / n fair", P`
Bote.sage(([1 .. 8] / 4));
`, { out: ["[[1, 2], [3, 4], [5, 6], [7, 8]]"] }),

  F(S, "blech / n unfair → StreitAnanas (Text wörtlich)", P`
Blech<salami> b = [1 .. 8];
Bote.sage((b / 3));
`, { exit: 1, fehler: { code: "StreitAnanas", textEnthält: "StreitAnanas: 8 Stücke lassen sich nicht fair durch 3 teilen." } }),

  F(S, "schneiden + belege + zusammenklappen (map/reduce)", P`
salami gesamt = ([1 .. 8] / 4).belege(t -> t.summe()).zusammenklappen((a, b) -> a + b);
Bote.sage((gesamt));
`, { out: ["36"] }),

  // ───────── §7.5 ─────────
  F(B, "Zuweisung und Deklaration per Name sind für jeden Typ erlaubt (K-105: keine BesitzAnanas)", P`
klasse Pizza { margherita n = "Tomate"; }
Pizza p = neu Pizza();
Pizza q = p;
Pizza r = (p);
q = r;
klasse Tisch { Pizza belegt = neu Pizza(); }
Tisch t = neu Tisch();
Pizza s = t.belegt;
Bote.sage((q == p), (s == t.belegt));
`, { out: ["ja ja"] }),

  F(B, "Argumentübergabe und Rückgabe sind erlaubt", P`
klasse Pizza { margherita n; Pizza(margherita n) { dies.n = n; } margherita alsText() { serviere ((n)); } }
klasse K {
    tiefkühl salami länge(Pizza x) { serviere ((x.n.länge())); }
    tiefkühl Pizza mach() { Pizza p = neu Pizza("Tomate"); serviere ((p)); }
}
Pizza p = neu Pizza("Tomate");
Bote.sage((K.länge(p)));
Bote.sage((p));
Pizza q = K.mach();
Bote.sage((q));
`, { out: ["6", "Tomate", "Tomate"] }),

  F(B, "schieb(p): Wert übergeben, Neuzuweisung erlaubt – für Variablen jeden Typs", P`
margherita p = "Tomate";
margherita q = schieb(p);
Bote.sage((q));
p = "Käse";
Bote.sage((p));
Blech<salami> b = [1];
Blech<salami> c = schieb(b);
c.hinzu(2);
Bote.sage((c));
`, { out: ["Tomate", "Käse", "[1, 2]"] }),

  F(B, "Lesen nach schieb → LeererKartonAnanas (Text wörtlich)", P`
salami p = 1;
salami q = schieb(p);
Bote.sage((p));
`, { exit: 1, fehler: { code: "LeererKartonAnanas", textEnthält: "LeererKartonAnanas: 'p' wurde weggeschoben – der Karton ist leer." } }),

  F(B, "schieb auf einem Parameter leert nur den Parameter", P`
klasse Tisch { margherita belegt; Tisch(margherita b) { dies.belegt = schieb(b); } }
margherita g = "Pilze";
Tisch t = neu Tisch(g);
Bote.sage((t.belegt + " " + g));
`, { out: ["Pilze Pilze"] }),

  // ───────── §7.6 ─────────
  F(K, "@Kühlschrank: Cache pro Argumentliste", LADEN + P`
Laden l = neu Laden();
Bote.sage((l.hole(1)));
Bote.sage((l.hole(1)));
Bote.sage((l.hole(2)));
Bote.sage((l.zähler));
`, { out: ["11", "11", "22", "2"] }),

  F(K, "@Kühlschrank: Cache pro Instanz", LADEN + P`
Laden a = neu Laden();
Laden b = neu Laden();
Bote.sage((a.hole(1)));
Bote.sage((b.hole(1)));
Bote.sage((a.zähler + b.zähler));
`, { out: ["11", "11", "2"] }),

  F(K, "@Kühlschrank: nach Ablauf (simulierte Uhr) neu berechnen", LADEN + P`
Laden l = neu Laden();
Bote.sage((l.hole(1)));
Uhr.vorspulen((4d));
Bote.sage((l.hole(1)));
`, { out: ["11", "12"] }),

  F(K, "@Kühlschrank: innerhalb der Haltbarkeit bleibt Cache", LADEN + P`
Laden l = neu Laden();
Bote.sage((l.hole(1)));
Uhr.vorspulen((2d));
Bote.sage((l.hole(1)));
`, { out: ["11", "11"] }),

  F(K, "mikrowelle: kein Cache → berechnen, nicht matschig; frisch → Cache", LADEN + P`
Laden l = neu Laden();
Reste<salami> r = l.hole.mikrowelle(5);
Bote.sage((r.wert()));
Bote.sage((r.istMatschig()));
Reste<salami> r2 = l.hole.mikrowelle(5);
Bote.sage((r2.wert()));
Bote.sage((r2.istMatschig()));
Bote.sage((l.zähler));
`, { out: ["51", "nein", "51", "nein", "1"] }),

  F(K, "mikrowelle: abgelaufen → alter Wert matschig, sofort neu befüllt (Kl. 6)", LADEN + P`
Laden l = neu Laden();
Bote.sage((l.hole(5)));
Uhr.vorspulen((4d));
Reste<salami> r = l.hole.mikrowelle(5);
Bote.sage((r.wert()));
Bote.sage((r.istMatschig()));
Bote.sage((l.zähler));
Bote.sage((l.hole(5)));
Bote.sage((l.zähler));
`, { out: ["51", "51", "ja", "2", "52", "2"] }),

  F(K, "frisch(args) erzwingt Neuberechnung", LADEN + P`
Laden l = neu Laden();
Bote.sage((l.hole(1)));
Bote.sage((l.hole.frisch(1)));
Bote.sage((l.zähler));
`, { out: ["11", "12", "2"] }),

  // ───────── §7.7 ─────────
  F(L, "bestelle läuft erst bei warte; pünktlich + wert", P`
salami n = 0;
Lieferung<salami> l = bestelle(() -> { n += 1; serviere ((42)); });
Bote.sage((n));
Zustellung<salami> z = l.warte(max: 30min);
Bote.sage((n));
Bote.sage((z.pünktlich()));
Bote.sage((z.wert()));
Bote.sage((z.oderGratis((0))));
`, { out: ["0", "1", "ja", "42", "42"] }),

  F(L, "zu spät → oderGratis liefert Ersatz, pünktlich nein", P`
Lieferung<salami> l = bestelle(() -> {
    salami s = 0;
    für (salami i = 0; i < 1000; i++) { s += i; }
    serviere ((s));
});
Zustellung<salami> z = l.warte(max: 10ms);
Bote.sage((z.pünktlich()));
Bote.sage((z.oderGratis((0))));
`, { out: ["nein", "0"] }),

  F(L, "zu spät → wert() wirft LieferAnanas (Text wörtlich)", P`
Lieferung<salami> l = bestelle(() -> {
    salami s = 0;
    für (salami i = 0; i < 1000; i++) { s += i; }
    serviere ((s));
});
Zustellung<salami> z = l.warte(max: 10ms);
Bote.sage((z.wert()));
`, { exit: 1, fehler: { code: "LieferAnanas", textEnthält: "LieferAnanas: Zu spät – die Pizza ist kalt." } }),

  F(L, "priorität ändert das Budget nicht und gibt die Lieferung zurück (K-127)", P`
Funktion arbeit = () -> {
    salami s = 0;
    für (salami i = 0; i < 20; i++) { s += i; }
    serviere ((s));
};
Lieferung<salami> ohne = bestelle(arbeit);
Lieferung<salami> mit = bestelle(arbeit);
Bote.sage((ohne.warte(max: 10ms).pünktlich()));
Bote.sage((mit.priorität(1000) == mit));
Bote.sage((mit.warte(max: 10ms).pünktlich()));
Bote.sage((bestelle(arbeit).priorität(1).warte(max: 1s).wert()));
`, { out: ["nein", "ja", "nein", "190"] }),

  F(L, "Ananas aus fn wird bei wert() weitergeworfen", P`
Lieferung<salami> l = bestelle(() -> { wirf neu StreitAnanas("Pilze fehlen"); });
Zustellung<salami> z = l.warte(max: 30min);
Bote.sage(("gewartet"));
probier { Bote.sage((z.wert())); } verbrannt (StreitAnanas a) { Bote.sage(("gefangen: " + a.nachricht())); }
probier { Bote.sage((z.oderGratis((0)))); } verbrannt (StreitAnanas a) { Bote.sage(("auch hier")); }
`, { out: ["gewartet", "gefangen: Pilze fehlen", "auch hier"] }),

  F(L, "Mehrfaches warte liefert dieselbe Zustellung", P`
salami n = 0;
Lieferung<salami> l = bestelle(() -> { n += 1; serviere ((n)); });
Zustellung<salami> a = l.warte(max: 30min);
Zustellung<salami> b = l.warte(max: 30min);
Bote.sage((a == b));
Bote.sage((n));
`, { out: ["ja", "1"] }),

  F(L, "wennDa: nach Programmende, Priorität absteigend (letzter Wert gilt), Gleichstand Bestellreihenfolge (Kl. 1, K-127)", P`
Lieferung<salami> a = bestelle(() -> (1));
Lieferung<salami> b = bestelle(() -> (2));
Lieferung<salami> c = bestelle(() -> (3));
a.priorität(1);
b.priorität(5);
c.priorität(9).priorität(1);
a.wennDa(w -> Bote.sage(("a" + w)));
b.wennDa(w -> Bote.sage(("b" + w)));
c.wennDa(w -> Bote.sage(("c" + w)));
Bote.sage(("ende"));
`, { out: ["ende", "b2", "a1", "c3"] }),

  F(L, "wennDa läuft erst nach hauptgang", P`
Lieferung<margherita> l = bestelle(() -> ("Pizza"));
l.wennDa(w -> Bote.sage(("geliefert: " + w)));
klasse App {
    tiefkühl leer hauptgang(Blech<margherita> args) { Bote.sage(("hauptgang")); }
}
Bote.sage(("oben"));
`, { out: ["oben", "hauptgang", "geliefert: Pizza"] }),

  // ───────── §7.8 ─────────
  F(C, "Spiegel.felder bei normaler Klasse (Deklarationsreihenfolge, inkl. geheimrezept)", P`
klasse Gast { margherita name = "Luigi"; geheimrezept salami bonus = 5; }
Gast g = neu Gast();
Bote.sage((Spiegel.felder(g)));
`, { out: ["{name: Luigi, bonus: 5}"] }),

  F(C, "Spiegel.felder bei zugeklappter Calzone → ZugeklapptAnanas (Text wörtlich)", P`
calzone klasse Konto { geheimrezept funghi stand = (1000.0); }
Konto k = neu Konto();
Bote.sage((Spiegel.felder(k)));
`, { exit: 1, fehler: { code: "ZugeklapptAnanas", textEnthält: "ZugeklapptAnanas: Die Calzone ist zu. Nutze aufklappen()." } }),

  F(C, "geheimrezept der Calzone von außen → ZugriffsAnanas", P`
calzone klasse Konto { geheimrezept funghi stand = (1000.0); }
Konto k = neu Konto();
Bote.sage((k.stand));
`, { exit: 1, fehler: { code: "ZugriffsAnanas" } }),

  F(C, "aufklappen → W0013, danach Spiegel und geheimrezept-Zugriff", P`
calzone klasse Konto { geheimrezept funghi stand = (1000.0); }
Konto k = neu Konto();
k.aufklappen();
Bote.sage((Spiegel.felder(k)));
k.stand = 5;
Bote.sage((k.stand));
`, { out: ["{stand: 1000}", "5"], warn: ["W0013"], warnText: { W0013: "Garantie erloschen. Das ist jetzt eine ganz normale Pizza." } }),
];
