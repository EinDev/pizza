"use strict";
const { P, F } = require("../lib/helfer");
const D = "§3 Deklarationen";

module.exports = [
  F(D, "Klasse mit Feld, Konstruktor, Methode, dies", P`
klasse Hund {
    margherita name;
    Hund(margherita n) { dies.name = n; }
    speisekarte margherita rufe() { serviere (("Hier, " + name)); }
}
Hund h = neu Hund("Rex");
Bote.sage((h.rufe()));
Bote.sage((h.name));
`, { out: ["Hier, Rex", "Rex"] }),

  F(D, "Vererbung, unten(args), dynamischer Dispatch, unten.methode()", P`
klasse Tier {
    margherita name;
    Tier(margherita n) { name = n; }
    speisekarte margherita laut() { serviere (("...")); }
    speisekarte margherita vorstellen() { serviere ((name + " sagt " + laut())); }
}
klasse Katze erbt Tier {
    Katze(margherita n) { unten(n); }
    speisekarte margherita laut() { serviere (("Miau")); }
    speisekarte margherita beide() { serviere ((unten.laut() + laut())); }
}
Tier t = neu Katze("Mia");
Bote.sage((t.vorstellen()));
Katze k = neu Katze("Kim");
Bote.sage((k.beide()));
`, { out: ["Mia sagt Miau", "...Miau"] }),

  F(D, "Fehlender unten()-Aufruf → Basis-Konstruktor ohne Argumente", P`
klasse A { A() { Bote.sage(("A")); } }
klasse B erbt A { B() { Bote.sage(("B")); } }
B b = neu B();
`, { out: ["A", "B"] }),

  F(D, "tiefkühl: statische Felder und Methoden", P`
klasse Zähler {
    tiefkühl salami anzahl = 0;
    Zähler() { anzahl += 1; }
    tiefkühl salami wieviele() { serviere ((anzahl)); }
}
Zähler a = neu Zähler();
Zähler b = neu Zähler();
Bote.sage((Zähler.anzahl));
Bote.sage((Zähler.wieviele()));
`, { out: ["2", "2"] }),

  F(D, "geheimrezept innerhalb der Klasse lesbar", P`
klasse Konto {
    geheimrezept salami stand = 5;
    speisekarte salami zeige() { serviere ((stand)); }
}
Konto k = neu Konto();
Bote.sage((k.zeige()));
`, { out: ["5"] }),

  F(D, "geheimrezept-Feld von außen → ZugriffsAnanas", P`
klasse Konto { geheimrezept salami stand = 5; }
Konto k = neu Konto();
Bote.sage(("vor"));
Bote.sage((k.stand));
`, { exit: 1, out: ["vor"], fehler: { code: "ZugriffsAnanas", art: "ananas" } }),

  F(D, "geheimrezept-Methode von außen → ZugriffsAnanas", P`
klasse Konto { geheimrezept salami intern() { serviere ((1)); } }
Konto k = neu Konto();
Bote.sage((k.intern()));
`, { exit: 1, fehler: { code: "ZugriffsAnanas" } }),

  F(D, "familienrezept in Unterklasse lesbar", P`
klasse Basis { familienrezept salami geheim = 7; }
klasse Kind erbt Basis { speisekarte salami lies() { serviere ((geheim)); } }
Kind k = neu Kind();
Bote.sage((k.lies()));
`, { out: ["7"] }),

  F(D, "ohne Modifikator (Hausrezept) = öffentlich", P`
klasse K { salami x = 4; salami f() { serviere ((x + 1)); } }
K k = neu K();
Bote.sage((k.x));
Bote.sage((k.f()));
`, { out: ["4", "5"] }),

  F(D, "Modifikatoren in beliebiger Reihenfolge", P`
klasse M {
    speisekarte tiefkühl salami a() { serviere ((1)); }
    tiefkühl speisekarte salami b() { serviere ((2)); }
    gebacken tiefkühl geheimrezept salami DREI = 3;
    tiefkühl salami c() { serviere ((DREI)); }
}
Bote.sage((M.a()));
Bote.sage((M.b()));
Bote.sage((M.c()));
`, { out: ["1", "2", "3"] }),

  F(D, "gebacken-Feld im Konstruktor zuweisbar", P`
klasse R { gebacken salami grad; R(salami g) { grad = g; } }
R r = neu R(300);
Bote.sage((r.grad));
`, { out: ["300"] }),

  F(D, "gebacken-Feld in Methode neu zuweisen → GebackenAnanas", P`
klasse Rezept {
    gebacken salami grad = 450;
    speisekarte leer ändere() { grad = 500; }
}
Rezept r = neu Rezept();
Bote.sage((r.grad));
r.ändere();
`, { exit: 1, out: ["450"], fehler: { code: "GebackenAnanas", art: "ananas" } }),

  F(D, "gebacken-Feld von außen zuweisen → GebackenAnanas", P`
klasse Rezept { gebacken salami grad = 450; }
Rezept r = neu Rezept();
r.grad = 1;
`, { exit: 1, fehler: { code: "GebackenAnanas" } }),

  F(D, "gebacken-Klasse erweitern → P0011 (Exit 2)", P`
gebacken klasse A { }
klasse B erbt A { }
B b = neu B();
`, { exit: 2, fehler: { code: "P0011", art: "pizzafehler" } }),

  F(D, "rohling-Klasse mit abstrakter Methode, konkrete Unterklasse", P`
rohling klasse Form {
    rohling funghi fläche();
    speisekarte margherita info() { serviere (("Fläche " + fläche())); }
}
klasse Quadrat erbt Form {
    funghi s;
    Quadrat(funghi s) { dies.s = s; }
    speisekarte funghi fläche() { serviere ((s * s)); }
}
Form f = neu Quadrat(3);
Bote.sage((f.info()));
`, { out: ["Fläche 9"] }),

  F(D, "rohling instanziieren → RohlingAnanas (Text wörtlich)", P`
rohling klasse Form { }
Form f = neu Form();
`, { exit: 1, fehler: { code: "RohlingAnanas", textEnthält: "RohlingAnanas: Ein Rohling ist nicht essbar." } }),

  F(D, "RohlingAnanas ist fangbar, nachricht()", P`
rohling klasse Form { }
probier { Form f = neu Form(); }
verbrannt (RohlingAnanas a) { Bote.sage((a.nachricht())); }
`, { out: ["Ein Rohling ist nicht essbar."] }),

  F(D, "Rezeptur erfüllt (inkl. wirft) und als Typ nutzbar", P`
speisekarte rezeptur Backbar {
    leer backe(salami grad) wirft VerbranntAnanas;
    diavolo istFertig();
}
klasse Brot erfüllt Backbar {
    diavolo fertig = nein;
    speisekarte leer backe(salami grad) wirft VerbranntAnanas, StreitAnanas { fertig = grad > 200; }
    speisekarte diavolo istFertig() { serviere ((fertig)); }
}
Backbar b = neu Brot();
b.backe(250);
Bote.sage((b.istFertig()));
`, { out: ["ja"] }),

  F(D, "Rezeptur nicht erfüllt → R0001 beim Start", P`
rezeptur Backbar { leer backe(salami grad); diavolo istFertig(); }
klasse Brot erfüllt Backbar { speisekarte leer backe(salami grad) { } }
Bote.sage(("start"));
`, {
    exit: 2, out: [],
    fehler: { code: "R0001", art: "pizzafehler", text: "PizzaFehler R0001: Klasse 'Brot' erfüllt Rezeptur 'Backbar' nicht: Methode 'istFertig' fehlt." },
  }),

  F(D, "rohling-Klasse muss Rezeptur nicht vollständig erfüllen", P`
rezeptur Backbar { leer backe(salami grad); diavolo istFertig(); }
rohling klasse Teilweise erfüllt Backbar { speisekarte leer backe(salami grad) { } }
Bote.sage(("ok"));
`, { out: ["ok"] }),

  F(D, "Mehrere Rezepturen erfüllen", P`
rezeptur R1 { salami a(); }
rezeptur R2 { salami b(); }
klasse X erfüllt R1, R2 { salami a() { serviere ((1)); } salami b() { serviere ((2)); } }
X x = neu X();
Bote.sage((x.a() + x.b()));
`, { out: ["3"] }),

  F(D, "quattrostagioni: Zugriff, name, position, werte, Textform", P`
quattrostagioni Jahreszeit { FRÜHLING, SOMMER, HERBST, WINTER }
Bote.sage((Jahreszeit.SOMMER));
Bote.sage((Jahreszeit.SOMMER.name()));
Bote.sage((Jahreszeit.HERBST.position()));
Bote.sage((Jahreszeit.FRÜHLING.position()));
Bote.sage((Jahreszeit.werte()));
`, { out: ["SOMMER", "SOMMER", "3", "1", "[FRÜHLING, SOMMER, HERBST, WINTER]"] }),

  F(D, "quattrostagioni als Typ (Klarstellung 10)", P`
quattrostagioni Jahreszeit { FRÜHLING, SOMMER, HERBST, WINTER }
Jahreszeit j = Jahreszeit.WINTER;
Bote.sage((j));
Bote.sage((j == Jahreszeit.WINTER));
Bote.sage((j == Jahreszeit.SOMMER));
`, { out: ["WINTER", "ja", "nein"] }),

  F(D, "quattrostagioni mit 3 Werten → Q0004", P`
quattrostagioni Drei { A, B, C }
`, { exit: 2, fehler: { code: "Q0004", art: "pizzafehler", text: "PizzaFehler Q0004: quattrostagioni braucht genau 4 Werte, nicht 3." } }),

  F(D, "quattrostagioni mit 5 Werten → Q0004", P`
quattrostagioni Fünf { A, B, C, D, E }
`, { exit: 2, fehler: { code: "Q0004", text: "PizzaFehler Q0004: quattrostagioni braucht genau 4 Werte, nicht 5." } }),

  F(D, "@PizzaÜberschreibt bei existierender Basismethode ok", P`
klasse A { speisekarte margherita x() { serviere (("A")); } }
klasse B erbt A { @PizzaÜberschreibt speisekarte margherita x() { serviere (("B")); } }
A a = neu B();
Bote.sage((a.x()));
`, { out: ["B"] }),

  F(D, "@PizzaÜberschreibt bei Rezeptur-Methode ok", P`
rezeptur R { salami wert(); }
klasse X erfüllt R { @PizzaÜberschreibt speisekarte salami wert() { serviere ((9)); } }
X x = neu X();
Bote.sage((x.wert()));
`, { out: ["9"] }),

  F(D, "@PizzaÜberschreibt ohne Basismethode → A0001 beim Start", P`
klasse A { }
klasse B erbt A { @PizzaÜberschreibt speisekarte margherita y() { serviere (("B")); } }
Bote.sage(("start"));
`, { exit: 2, out: [], fehler: { code: "A0001", art: "pizzafehler" } }),

  F(D, "@PizzaVeraltet → W0003 genau einmal (erster Aufruf)", P`
klasse K { @PizzaVeraltet(grund: "alt") tiefkühl salami f() { serviere ((1)); } }
Bote.sage(("vorher"));
für (salami i = 0; i < 3; i++) { Bote.sage((K.f())); }
`, { out: ["vorher", "1", "1", "1"], warnAnzahl: { W0003: 1 } }),

  F(D, "@NieKarton-Parameter mit karton → LeererKartonAnanas (Kl. 15)", P`
klasse K { tiefkühl leer f(@NieKarton Dauer p) { Bote.sage((p)); } }
K.f(((2s)));
K.f(karton);
`, { exit: 1, out: ["2s"], fehler: { code: "LeererKartonAnanas" } }),

  F(D, "Annotationen: Metadaten, Schlüssel mit : und =", P`
@Pizzaiolo(autor: "Luigi")
klasse A { @Pizzaiolo(autor = "Mario") speisekarte salami f() { serviere ((1)); } }
A a = neu A();
Bote.sage((a.f()));
`, { out: ["1"] }),

  F(D, "Unqualifizierte Namen: lokal vor Instanzfeld", P`
klasse K {
    salami x = 1;
    speisekarte salami f() { salami x = 2; serviere ((x * 10 + dies.x)); }
    speisekarte salami g() { serviere ((f() + x)); }
}
K k = neu K();
Bote.sage((k.g()));
`, { out: ["22"] }),

  F(D, "Benannte Argumente bei eigenen Methoden (nach Parametername)", P`
klasse K { tiefkühl salami diff(salami a, salami b) { serviere ((a - b)); } }
Bote.sage((K.diff(b: 2, a: 10)));
`, { out: ["8"] }),

  F(D, "Generische Klasse wird geparst und läuft", P`
klasse Kiste<T> {
    T inhalt;
    Kiste(T i) { inhalt = i; }
    speisekarte T hole() { serviere ((inhalt)); }
}
Kiste<salami> k = neu Kiste<salami>(5);
Bote.sage((k.hole()));
`, { out: ["5"] }),

  F(D, "alsText() wird für Textumwandlung genutzt", P`
klasse Punkt {
    salami x;
    Punkt(salami x) { dies.x = x; }
    speisekarte margherita alsText() { serviere (("P(" + x + ")")); }
}
Punkt p = neu Punkt(3);
Bote.sage((p));
Bote.sage(("ist " + p));
`, { out: ["P(3)", "ist P(3)"] }),

  F(D, "Klassennamen = Keywords in anderer Schreibweise (Kl. 20)", P`
klasse Serviere { speisekarte salami x() { serviere ((1)); } }
klasse Neu { speisekarte salami y() { serviere ((2)); } }
Serviere s = neu Serviere();
Neu n = neu Neu();
Bote.sage((s.x() + n.y()));
`, { out: ["3"] }),
];
