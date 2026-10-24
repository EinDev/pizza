"use strict";
// Herd (SPEC §18, HERD.md, KLAERUNGEN K-128 … K-136) – Black-Box-Fälle mit vorgegebenen Renderer-Ereignissen (uiEreignisse).
// Erwartungen aus SPEC §18: Ereignisfolge (fenster/bild/schliesse), Takt-Zählung, Eingabe, Texte der Ananas wörtlich.
// Die Hashes (szene/paket) berechnet der Kern; geprüft werden hier ihr Format und ihre Gleichheit bei gleichem Zustand.
const { P, F } = require("../lib/helfer");
const T = "§18 Herd (K-128 …)";

const takt = (o = {}) => Object.assign({ typ: "takt" }, o);
const herd = (res) => (res.ereignisse || []).filter((e) => e.typ === "herd");
const folge = (res) => herd(res).map((e) => e.art + (e.art === "bild" ? e.bildnummer : ""));
const gleich = (ist, soll, was) => (JSON.stringify(ist) === JSON.stringify(soll) ? undefined : `${was}: ${JSON.stringify(ist)}, erwartet ${JSON.stringify(soll)}`);
const HEX16 = /^[0-9a-f]{16}$/;
const W0104 = "W0104: Kein Herd verfügbar – Fenster wird nicht angezeigt.";

module.exports = [
  F(T, "§18.2/§18.7: fenster beim ersten backe, je takt-Ereignis ein Bild (Nummer des letzten Takts), anzahl fehlt/ungültig → 1, > 4 → 4, andere Ereignisse ignoriert", P`
Herd herd = neu Herd("Hallo", breite: 100, hoehe: 64);
herd.backe(() -> { });
Bote.sage((herd.bildnummer() + " " + herd.zeit()));
`, {
    uiEreignisse: [takt(), takt({ anzahl: 3 }), { typ: "klick", id: "x" }, takt({ anzahl: 9 }), takt({ anzahl: 0 }), takt({ anzahl: 2.5 }), { typ: "geschlossen" }, takt()],
    out: ["10 0.16666666666666666"],
    check(res) {
      const h = herd(res);
      return gleich(folge(res), ["fenster", "bild1", "bild4", "bild8", "bild9", "bild10"], "Folge")
        || gleich(h[0], { typ: "herd", art: "fenster", titel: "Hallo", breite: 100, hoehe: 64 }, "fenster")
        || (h.slice(1).every((e) => HEX16.test(e.szene) && HEX16.test(e.paket) && Object.keys(e).length === 5) ? undefined : "bild-Ereignisse: " + JSON.stringify(h.slice(1)));
    },
  }),

  F(T, "§18.7: gleicher Zustand ⇒ gleicher Szenen-Hash; Bewegung ändert ihn; Bytes nie in der Ereignisliste", P`
Herd herd = neu Herd("H", breite: 64, hoehe: 64);
Teil t = herd.kreis(10, 10, 5);
Bewegung b = t.mit(neu Bewegung(tempoX: 60));
herd.backe(() -> {
    falls (herd.bildnummer() == 2) { b.setzeTempoX(-60); }
    falls (herd.bildnummer() == 4) { b.setzeTempoX(0); }
});
Bote.sage((t.x()));
`, {
    uiEreignisse: [takt(), takt(), takt(), takt(), takt()],
    out: ["9"],
    check(res) {
      const s = herd(res).filter((e) => e.art === "bild").map((e) => e.szene);
      if (s.length !== 5) return "5 Bilder erwartet: " + JSON.stringify(herd(res));
      if (s[0] === s[1] || s[1] === s[2]) return "Bewegung ändert den Szenen-Hash nicht: " + s.join(" ");
      if (s[3] !== s[4]) return "Stillstand ändert den Szenen-Hash: " + s.join(" ");
      if (JSON.stringify(res.ereignisse).includes("bytes")) return "Paket-Bytes in der Ereignisliste";
    },
  }),

  F(T, "§18.2: ohne Renderer fenster + schliesse, W0104 je Aufrufstelle, der Rückruf läuft nie", P`
Herd herd = neu Herd();
für (salami i : [1 .. 3]) { herd.backe(() -> { Bote.sage(("nie")); }); }
herd.backe();
Bote.sage(("fertig " + herd.bildnummer()));
`, {
    out: ["fertig 0"],
    warnAnzahl: { W0104: 2 },
    warnText: { W0104: W0104.slice(7) },
    check: (res) => gleich(folge(res), ["fenster", "schliesse", "fenster", "schliesse", "fenster", "schliesse", "fenster", "schliesse"], "Folge")
      || gleich(herd(res)[0], { typ: "herd", art: "fenster", titel: "", breite: 640, hoehe: 360 }, "Standardgröße"),
  }),

  F(T, "§18.2: schliesse() im Rückruf – Rückruf läuft zu Ende, kein Bild; backe öffnet erneut; Programmende schließt", P`
Herd herd = neu Herd("Z", breite: 64, hoehe: 64);
herd.backe(() -> { falls (herd.bildnummer() == 2) { herd.schliesse(); Bote.sage(("danach")); } });
Bote.sage(("zu " + herd.bildnummer()));
herd.backe();
`, {
    uiEreignisse: [takt(), takt({ anzahl: 3 }), takt(), takt()],
    out: ["danach", "zu 2"],
    check: (res) => gleich(folge(res), ["fenster", "bild1", "schliesse", "fenster", "bild3", "bild4"], "Folge"),
  }),

  F(T, "§18.2: ungefangene Ananas im Rückruf → schliesse vor dem fehler-Ereignis, Exit 1", P`
Herd herd = neu Herd("A", breite: 64, hoehe: 64);
herd.backe(() -> { falls (herd.bildnummer() == 2) { wirf neu StreitAnanas("kaputt"); } });
`, {
    uiEreignisse: [takt(), takt(), takt()],
    exit: 1,
    fehler: { code: "StreitAnanas", text: "Ungefangene Ananas – StreitAnanas: kaputt (Zeile 2)" },
    check(res) {
      const i = res.ereignisse.findIndex((e) => e.typ === "herd" && e.art === "schliesse");
      const j = res.ereignisse.findIndex((e) => e.typ === "fehler");
      return gleich(folge(res), ["fenster", "bild1", "schliesse"], "Folge") || (i >= 0 && i < j ? undefined : "schliesse nicht vor fehler");
    },
  }),

  F(T, "§18.2: gefangene Ananas verlässt backe, Systeme des Takts entfallen; erneutes backe macht weiter", P`
Herd herd = neu Herd("A", breite: 64, hoehe: 64);
Teil t = herd.kreis(0, 0, 1);
t.mit(neu Bewegung(tempoX: 60));
probier { herd.backe(() -> { falls (herd.bildnummer() == 2) { wirf neu StreitAnanas("x"); } }); } verbrannt (StreitAnanas a) { Bote.sage(("gefangen " + t.x())); }
herd.backe();
Bote.sage((herd.bildnummer() + " " + t.x()));
`, {
    uiEreignisse: [takt(), takt(), takt()],
    out: ["gefangen 1", "3 2"],
    check: (res) => gleich(folge(res), ["fenster", "bild1", "bild3"], "Folge"),
  }),

  F(T, "§18.3: Eingabe als Zustand; gedrueckt/losgelassen/klick nur im ersten Takt; ungültige Felder ignoriert; außerhalb nein", P`
Herd herd = neu Herd("E", breite: 64, hoehe: 64);
herd.backe(() -> {
    Bote.sage((herd.bildnummer() + " " + herd.taste("A") + " " + herd.gedrueckt("A") + " " + herd.losgelassen("A") + " " + herd.maus() + " " + herd.klick() + " " + herd.maus(3) + " " + herd.mausX() + "/" + herd.mausY()));
});
Bote.sage((herd.taste("A") + " " + herd.gedrueckt("A") + " " + herd.klick(1)));
`, {
    uiEreignisse: [takt({ anzahl: 2, tasten: ["A"], maus: [3, 4], knoepfe: 1 }), takt({ tasten: "A", maus: [1], knoepfe: 5 }), takt({ tasten: [] , knoepfe: -1 })],
    out: ["1 ja ja nein ja ja nein 3/4", "2 ja nein nein ja nein nein 3/4", "3 ja nein nein ja nein ja 3/4", "4 nein nein ja ja nein ja 3/4", "nein nein nein"],
  }),

  F(T, "§18.3: Maustaste außerhalb 1 … 3", P`
Herd herd = neu Herd();
herd.maus(4);
`, { exit: 1, fehler: { code: "LaufzeitAnanas", text: "Ungefangene Ananas – LaufzeitAnanas: Maustaste 4 gibt es nicht (1 links, 2 rechts, 3 Mitte). (Zeile 2)" } }),

  F(T, "§18.1: ein Herd pro Programm; Fabriken vor neu Herd; Größe Ganzzahl und 64 … 4096", P`
leer zeig(Rezept f) { probier { f(); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); } }
zeig(() -> Form.wuerfel());
zeig(() -> neu Herd(breite: 2.5));
zeig(() -> neu Herd(hoehe: 10));
Herd h = neu Herd();
zeig(() -> neu Herd());
Bote.sage((h + " " + h.breite() + " " + h.hoehe()));
`, {
    out: [
      "LaufzeitAnanas: Erst braucht es einen Herd (neu Herd(…)).",
      "TypAnanas: Herd(breite: …) braucht eine Ganzzahl, nicht 2.5.",
      "LaufzeitAnanas: Herd(hoehe: …) muss zwischen 64 und 4096 liegen, nicht 10.",
      "LaufzeitAnanas: Es gibt nur einen Herd pro Programm.",
      "Herd() 640 360",
    ],
  }),

  F(T, "§18.4: Komponenten-Fehlertexte (Typ, Bereich, Wahl, Farbe, Feld, Raum, hängt schon, Voraussetzung, entfernt, Genus)", P`
leer zeig(Rezept f) { probier { f(); } verbrannt (Ananas a) { Bote.sage((a.typ() + ": " + a.nachricht())); } }
Herd h = neu Herd();
zeig(() -> neu Kreis(radius: "x"));
zeig(() -> neu Kamera(sicht: 200));
zeig(() -> neu Kreis(radius: -1));
zeig(() -> neu Text(ausrichtung: "oben"));
zeig(() -> neu Kreis(farbe: "lila"));
zeig(() -> neu Kreis().hole("x"));
zeig(() -> neu Bild(spiegeln: 1));
Teil t = h.raum();
zeig(() -> t.mit(neu Kreis()));
Teil g = h.gruppe();
Bewegung b = g.mit(neu Bewegung());
zeig(() -> t.mit(b));
zeig(() -> g.mit(neu Bewegung()));
zeig(() -> g.mit(neu Animation()));
zeig(() -> g.haenge(t));
g.entferne();
zeig(() -> g.x());
zeig(() -> b.teil());
Kreis kk = h.kreis(1, 1, 1).kreis();
zeig(() -> h.gruppe().mit(kk));
zeig(() -> kk.teil().mit(neu Kreis()));
zeig(() -> t.ohne("Pendel"));
`, {
    out: [
      "TypAnanas: Kreis.radius braucht eine Zahl, nicht \"x\".",
      "LaufzeitAnanas: Kamera.sicht muss zwischen 1 und 170 liegen, nicht 200.",
      "LaufzeitAnanas: Kreis.radius muss mindestens 0 sein, nicht -1.",
      "LaufzeitAnanas: Text.ausrichtung kennt 'oben' nicht. Erlaubt: links, mitte, rechts.",
      "LaufzeitAnanas: Farbe 'lila' gibt es nicht. Erlaubt: Palettenname oder '#rrggbb'.",
      "LaufzeitAnanas: Kreis hat kein Feld 'x'.",
      "TypAnanas: Bild.spiegeln braucht ja/nein, nicht 1.",
      "LaufzeitAnanas: Kreis gibt es nur für 2D-Teile.",
      "LaufzeitAnanas: Diese Bewegung hängt schon an Teil 4.",
      "LaufzeitAnanas: Teil 4 hat schon eine Bewegung.",
      "LaufzeitAnanas: Animation braucht ein Bild am selben Teil.",
      "LaufzeitAnanas: Ein 2D-Teil kann nicht an einem 3D-Teil hängen.",
      "LaufzeitAnanas: Teil 4 ist schon entfernt.",
      "LaufzeitAnanas: Teil 4 ist schon entfernt.",
      "LaufzeitAnanas: Dieser Kreis hängt schon an Teil 5.",
      "LaufzeitAnanas: Teil 5 hat schon einen Kreis.",
      "LaufzeitAnanas: Eine Komponente 'Pendel' gibt es nicht.",
    ],
  }),

  F(T, "§18.4: Getter/Setter/hole/setze, lose Komponente hält ihre Werte, teil(), <name>(), ohne, Textformen", P`
Herd h = neu Herd();
Kreis k = neu Kreis(radius: 7, farbe: "#ABC");
Bote.sage((k + " " + k.radius() + " " + k.farbe() + " " + k.teil()));
Kreis k2 = k.setzeRadius(9).setze("umriss", 2);
Teil t = h.gruppe();
t.mit(k);
Bote.sage((k + " " + (k2 == k) + " " + (t.kreis() == k) + " " + (k.teil() == t) + " " + k.hole("radius") + " " + k.umriss() + " " + t.bewegung()));
Kreis weg = t.ohne("Kreis");
Bote.sage((weg + " " + weg.radius() + " " + t.kreis() + " " + t + " " + t.raum() + " " + t.id()));
`, { out: ["Kreis() 7 #ABC karton", "Kreis(3) ja ja ja 9 2 karton", "Kreis() 9 karton Teil(3) 2D 3"] }),

  F(T, "§18.4: Hierarchie, kopie, entferne samt Kindern, trifft", P`
Herd h = neu Herd();
Teil a = h.rechteck(100, 100, 20, 20);
Teil b = h.kreis(5, 0, 2);
b.haenge(a);
Teil c = a.kopie();
Bote.sage((a.kinder() + " " + c.kinder().länge() + " " + b.eltern() + " " + a.trifft(c) + " " + a.trifft(b)));
probier { a.haenge(b); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
Teil ck = c.kinder().erstes();
c.entferne();
Bote.sage((c.entfernt() + " " + ck.entfernt() + " " + a.entfernt()));
`, { out: ["[Teil(4)] 1 Teil(3) ja ja", "Teil 3 kann nicht an seinem eigenen Kind hängen.", "ja ja nein"] }),

  F(T, "§18.1/§18.5: Herd.farbe und Grundformen", P`
Bote.sage((Herd.farbe(255, 128.4, -3) + " " + Herd.farbe(1, 2, 300, a: 0.5) + " " + Herd.farbe(0, 0, 0, 2)));
Herd h = neu Herd();
Bote.sage((Form.wuerfel() + " " + Form.kugel(teile: 8).id() + " " + neu Bildchen(["ab", "k"], farben: karton)));
probier { Form.kugel(teile: 2); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
probier { Form.kugel(teile: 24.5); } verbrannt (TypAnanas x) { Bote.sage((x.nachricht())); }
probier { neu Bildchen(["q"]); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
`, {
    out: ["#ff8000ff #0102ff80 #000000ff", "Form(1) 2 Bildchen(2×2)", "teile muss zwischen 3 und 128 liegen, nicht 2.", "Form.kugel(teile: …) braucht eine Ganzzahl, nicht 24.5.", "Das Zeichen 'q' hat im Bildchen keine Farbe."],
  }),

  F(T, "K-133: Theke und Herd zusammen → P0013 vor dem Start (Position des späteren neu)", P`
Bote.sage(("nie"));
Theke t = neu Theke("x");
Herd h = neu Herd("y");
`, { exit: 2, out: [], fehler: { code: "P0013", art: "pizzafehler", text: "PizzaFehler P0013: Theke und Herd in einem Programm gibt es noch nicht.", zeile: 3 } }),

  F(T, "§18.1: eigene Klasse namens Kreis hat Vorrang; erbt Herd → P0010", P`
klasse Kreis { salami r = 2; }
Bote.sage((neu Kreis().r));
`, { out: ["2"] }),

  F(T, "§18.1: erbt von eingebauter Herd-Klasse → P0010", P`
klasse Spiel erbt Herd { }
`, { exit: 2, fehler: { code: "P0010" } }),

  F(T, "§18.2: backe braucht eine Funktion; Küche → KüchenAnanas", P`
Herd h = neu Herd();
probier { h.backe(5); } verbrannt (TypAnanas x) { Bote.sage((x.nachricht())); }
probier { [1].brigade(x -> h.bildnummer()); } verbrannt (KüchenAnanas x) { Bote.sage((x.typ())); }
`, { out: ["backe() braucht eine Funktion, z. B. () -> { … }.", "KüchenAnanas"] }),

  F(T, "§18.2/K-087: P0002 je Takt – jeder Takt hat frisches Budget; schliesse vor dem Fehler", P`
Herd h = neu Herd();
salami n = 0;
h.backe(() -> {
    für (salami i : [1 .. 50]) { n = n + 1; }
    falls (h.bildnummer() == 6) { solange (ja) { n = n + 1; } }
});
`, {
    uiEreignisse: [takt({ anzahl: 4 }), takt({ anzahl: 4 })],
    schrittLimit: 400,
    exit: 3,
    fehler: { code: "P0002" },
    check: (res) => gleich(folge(res), ["fenster", "bild4", "schliesse"], "Folge"),
  }),

  F(T, "§18.4/K-152 (H-K13): erbt Kniff ist erlaubt; start() einmal, takt() nach fn und Systemen, Teile nach ID, je Teil in Anhängereihenfolge; teil() unqualifiziert", P`
Herd h = neu Herd();
Blech<margherita> log = [];
klasse K erbt Kniff {
    margherita n;
    K(margherita n) { dies.n = n; }
    leer start() { log.hinzu((n + ".start")); }
    leer takt() { log.hinzu((n + "@" + teil().x())); }
}
Teil a = h.gruppe(1, 0);
a.mit(neu Bewegung(tempoX: 60));
Teil b = h.gruppe(2, 0);
b.mit(neu K("b"));
a.mit(neu K("a1"));
a.mit(neu K("a2"));
h.backe(() -> { log.hinzu(("fn" + h.bildnummer())); });
Bote.sage((log.verbinde(" ")));
`, {
    uiEreignisse: [takt(), takt()],
    out: ["fn1 a1.start a1@2 a2.start a2@2 b.start b@2 fn2 a1@3 a2@3 b@2"],
    check: (res) => gleich(folge(res), ["fenster", "bild1", "bild2"], "Folge"),
  }),

  F(T, "§18.4/K-152: neu Kniff() → RohlingAnanas; Kniff hängt schon; kniffe(); ohne(k) und entferne() rufen beimEntfernen danach (teil() ist karton)", P`
Herd h = neu Herd();
klasse W erbt Kniff { leer beimEntfernen() { Bote.sage(("weg " + teil())); } }
probier { neu Kniff(); } verbrannt (RohlingAnanas x) { Bote.sage((x.nachricht())); }
Teil a = h.gruppe();
Teil b = h.gruppe();
b.haenge(a);
W w = a.mit(neu W());
probier { b.mit(w); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
Bote.sage((a.kniffe() + " " + b.kniffe().länge() + " " + a.ohne(w) + " " + a.ohne(w)));
b.mit(w);
a.entferne();
Bote.sage((w.teil() + " " + b.entfernt()));
`, { out: ["Ein Rohling ist nicht essbar.", "Dieser Kniff hängt schon an Teil 3.", "weg karton", "[W@1] 0 W@1 karton", "weg karton", "karton ja"] }),
];
