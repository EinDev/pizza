"use strict";
// Theke (SPEC §16, KLAERUNGEN K-056 … K-074) – Black-Box-Fälle mit vorgegebenen Renderer-Ereignissen (uiEreignisse)
// und exakter Liste der ui-Nachrichten (ui, kanonisch verglichen). Erwartungen aus SPEC §16 / KLAERUNGEN.
const { P, F } = require("../lib/helfer");
const T = "§16 Theke (K-056 …)";

const fenster = (titel, breite = 480, hoehe = 360) => ({ v: 1, op: "fenster", titel, breite, hoehe });
const baum = (wurzel) => ({ v: 1, op: "baum", wurzel });
const aendere = (...aenderungen) => ({ v: 1, op: "aendere", aenderungen });
const schliesse = () => ({ v: 1, op: "schliesse" });

module.exports = [
  F(T, "K-056/057: fenster, baum, Klick-Rückruf ohne Argument, eine aendere-Nachricht pro Rückruf (letzter Wert gewinnt)", P`
Theke t = neu Theke("Rechner", breite: 300, hoehe: 200);
Schild s = neu Schild("Start");
Knopf k = neu Knopf("Los", () -> { s.setzeText(("Geklickt")); s.setzeText(("Nochmal")); Bote.sage(("klick")); });
t.zeige(neu Stapel([s, k]));
t.bediene();
Bote.sage(("fertig"));
`, {
    uiEreignisse: [{ typ: "klick", id: "z2" }],
    out: ["klick", "fertig"],
    ui: [
      fenster("Rechner", 300, 200),
      baum({ id: "z3", art: "stapel", kinder: [{ id: "z1", art: "schild", text: "Start" }, { id: "z2", art: "knopf", text: "Los" }] }),
      aendere({ id: "z1", text: "Nochmal" }),
    ],
    check(res) {
      // K-057: ausgabe des Rückrufs steht vor der aendere-Nachricht
      const t = res.ereignisse.filter((e) => e.typ === "ausgabe" || (e.typ === "ui" && e.nachricht.op === "aendere")).map((e) => e.typ === "ui" ? "aendere" : e.text);
      return JSON.stringify(t) === JSON.stringify(["klick", "aendere", "fertig"]) ? undefined : "Reihenfolge " + JSON.stringify(t);
    },
  }),

  F(T, "K-056/064: Eingabe/Haken – Zustand vor dem Rückruf aktualisiert; Renderer-Werte werden nicht zurückgesendet; platzhalter nur wenn gesetzt", P`
Theke t = neu Theke("E");
Eingabe e = neu Eingabe(platzhalter: "Zahl");
Haken h = neu Haken("Scharf");
e.beiAenderung(w -> Bote.sage(("ä " + w + " " + e.wert())));
e.beiEnter(w -> Bote.sage(("enter " + w)));
h.beiAenderung(a -> Bote.sage(("haken " + a + " " + h.an())));
t.zeige(neu Reihe([e, h]));
t.bediene();
Bote.sage((e.wert() + " " + h.an()));
`, {
    uiEreignisse: [{ typ: "aenderung", id: "z1", wert: "4" }, { typ: "enter", id: "z1", wert: "4" }, { typ: "aenderung", id: "z2", wert: true }, { typ: "geschlossen" }],
    out: ["ä 4 4", "enter 4", "haken ja ja", "4 ja"],
    ui: [
      fenster("E"),
      baum({ id: "z3", art: "reihe", kinder: [{ id: "z1", art: "eingabe", wert: "", platzhalter: "Zahl" }, { id: "z2", art: "haken", text: "Scharf", an: false }] }),
    ],
  }),

  F(T, "K-057/068: Bündelung – ein Eintrag je Zutat (Reihenfolge der ersten Änderung), stil als ganze Map, aktiv:false", P`
Theke t = neu Theke("B");
Schild a = neu Schild("a");
Schild b = neu Schild("b");
Knopf k = neu Knopf("k", () -> { b.setzeText(("b2")); a.setzeText(("a2")); b.setzeText(("b3")); k.aktiv(nein); a.stil("farbe", "tomate"); });
t.zeige(neu Stapel([a, b, k]));
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "z3" }],
    ui: [
      fenster("B"),
      baum({ id: "z4", art: "stapel", kinder: [{ id: "z1", art: "schild", text: "a" }, { id: "z2", art: "schild", text: "b" }, { id: "z3", art: "knopf", text: "k" }] }),
      aendere({ id: "z2", text: "b3" }, { id: "z1", text: "a2", stil: { farbe: "tomate" } }, { id: "z3", aktiv: false }),
    ],
  }),

  F(T, "K-057: Synchronisationspunkt Programmende (Theke offen, ohne bediene); nicht gezeigte Zutaten erzeugen keine Nachricht", P`
Theke t = neu Theke("V");
Schild s = neu Schild("alt");
Schild u = neu Schild("unsichtbar");
t.zeige(s);
s.setzeText(("neu"));
u.setzeText(("egal"));
Bote.sage(("ende"));
`, {
    out: ["ende"],
    ui: [fenster("V"), baum({ id: "z1", art: "schild", text: "alt" }), aendere({ id: "z1", text: "neu" })],
    check(res) {
      const letzte = res.ereignisse.filter((e) => e.typ === "ausgabe" || e.typ === "ui").map((e) => e.typ === "ui" ? e.nachricht.op : e.text).slice(-2);
      return JSON.stringify(letzte) === JSON.stringify(["ende", "aendere"]) ? undefined : "Ende-Flush fehlt: " + JSON.stringify(letzte);
    },
  }),

  F(T, "K-057/073: Änderungen vor bediene() werden beim Eintritt gesendet; identischer Wert zählt als Änderung", P`
Theke t = neu Theke("V");
Schild s = neu Schild("alt");
t.zeige(s);
s.setzeText(("neu"));
Knopf k = neu Knopf("k", () -> { s.setzeText(("neu")); k.aktiv(ja); });
t.bediene();
`, {
    uiEreignisse: [],
    ui: [fenster("V"), baum({ id: "z1", art: "schild", text: "alt" }), aendere({ id: "z1", text: "neu" })],
  }),

  F(T, "K-057/065: Änderungen eines Rückrufs werden auch bei Ananas gesendet (vor dem Verlassen von bediene)", P`
Theke t = neu Theke("H");
Schild s = neu Schild("a");
Knopf k = neu Knopf("h", () -> { s.setzeText(("b")); wirf neu StreitAnanas("x"); });
t.zeige(neu Stapel([s, k]));
probier { t.bediene(); } verbrannt (StreitAnanas a) { Bote.sage(("gefangen")); }
`, {
    uiEreignisse: [{ typ: "klick", id: "z2" }],
    out: ["gefangen"],
    ui: [fenster("H"), baum({ id: "z3", art: "stapel", kinder: [{ id: "z1", art: "schild", text: "a" }, { id: "z2", art: "knopf", text: "h" }] }), aendere({ id: "z1", text: "b" })],
    check(res) {
      const t = res.ereignisse.filter((e) => e.typ === "ausgabe" || (e.typ === "ui" && e.nachricht.op === "aendere")).map((e) => e.typ === "ui" ? "aendere" : e.text);
      return JSON.stringify(t) === JSON.stringify(["aendere", "gefangen"]) ? undefined : "Reihenfolge " + JSON.stringify(t);
    },
  }),

  F(T, "K-058: zeige() erneut → neuer baum, offene Änderungen verfallen, IDs bleiben; zeige liefert die Theke; setzeTitel sendet fenster erneut", P`
Theke t = neu Theke("Alt");
Schild s = neu Schild("eins");
Bote.sage((t.zeige(s) == t));
s.setzeText(("zwei"));
Stapel st = neu Stapel([neu Knopf("ok")]);
t.zeige(st);
t.setzeTitel(("Neu"));
Bote.sage((t.titel()));
t.bediene();
`, {
    uiEreignisse: [],
    out: ["ja", "Neu"],
    ui: [
      fenster("Alt"), baum({ id: "z1", art: "schild", text: "eins" }),
      baum({ id: "z3", art: "stapel", kinder: [{ id: "z2", art: "knopf", text: "ok" }] }),
      fenster("Neu"),
    ],
  }),

  F(T, "K-058: zeige(karton) / zeige(Nicht-Zutat) → TypAnanas", P`
Theke t = neu Theke("Z");
probier { t.zeige(karton); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
probier { t.zeige(5); } verbrannt (TypAnanas a) { Bote.sage(("typ")); }
`, { uiEreignisse: [], out: ["zeige() braucht eine Zutat, nicht karton.", "typ"], ui: [] }),

  F(T, "K-059: ein Elternteil – Zutat in zwei Containern, in sich selbst, gezeigte Wurzel in Container → LaufzeitAnanas; leeren() löst; hinzu sendet kinder", P`
Theke t = neu Theke("C");
Schild s = neu Schild("s");
Stapel a = neu Stapel([s]);
probier { Reihe r = neu Reihe([s]); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
probier { a.hinzu(s); } verbrannt (LaufzeitAnanas x) { Bote.sage(("doppelt")); }
probier { a.hinzu(a); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
a.leeren();
Reihe r2 = neu Reihe([s]);
t.zeige(a);
probier { Stapel b = neu Stapel([a]); } verbrannt (LaufzeitAnanas x) { Bote.sage(("wurzel")); }
Bote.sage((a.hinzu(neu Knopf("k")) == a));
t.bediene();
`, {
    uiEreignisse: [],
    out: ["Die Zutat 'z1' liegt schon woanders auf der Theke.", "doppelt", "Die Zutat 'z2' kann nicht in sich selbst liegen.", "wurzel", "ja"],
    ui: [
      fenster("C"), baum({ id: "z2", art: "stapel", kinder: [] }),
      aendere({ id: "z2", kinder: [{ id: "z6", art: "knopf", text: "k" }] }),
    ],
  }),

  F(T, "K-060: IDs – automatisch z1, z2 … nur für unbenannte Zutaten (belegte übersprungen), id: an jeder Zutat, Duplikat/leer → LaufzeitAnanas", P`
Knopf a = neu Knopf("a", id: "z2");
Schild b = neu Schild("b");
Haken c = neu Haken("c", id: "scharf");
Eingabe d = neu Eingabe();
Bote.sage((a.id() + " " + b.id() + " " + c.id() + " " + d.id()));
probier { Knopf k2 = neu Knopf("x", id: "scharf"); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
probier { Knopf k4 = neu Knopf("x", id: ""); } verbrannt (LaufzeitAnanas x) { Bote.sage(("leer")); }
`, { out: ["z2 z1 scharf z3", "Die ID 'scharf' gibt es schon.", "leer"] }),

  F(T, "K-062: eine Theke pro Programm; bediene ohne zeige → 'Die Theke ist leer.'; Theke verbraucht keine zN", P`
Theke t = neu Theke("A");
probier { Theke u = neu Theke("B"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { t.bediene(); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
Bote.sage((neu Schild("s").id()));
`, { uiEreignisse: [], out: ["Es gibt nur eine Theke pro Programm.", "Die Theke ist leer.", "z1"], ui: [] }),

  F(T, "K-063/070: ohne Renderer → W0100 je Aufrufstelle, bediene kehrt sofort zurück, ui-Nachrichten trotzdem emittiert; kein schliesse am Ende", P`
Theke t = neu Theke("W");
t.zeige(neu Schild("hallo"));
t.bediene();
t.bediene();
t.schliesse();
t.bediene();
Bote.sage(("weiter"));
`, {
    out: ["weiter"], warnAnzahl: { W0100: 2 }, warnText: { W0100: "Keine Theke verfügbar – Fenster wird nicht angezeigt." },
    ui: [fenster("W"), baum({ id: "z1", art: "schild", text: "hallo" }), schliesse()],
  }),

  F(T, "K-061: Programmende schließt nicht; gepufferte Änderungen werden noch gesendet; zeige nach Schließen öffnet wieder", P`
Theke t = neu Theke("Kurz");
Schild s = neu Schild("tschüss");
t.zeige(s);
t.bediene();
Bote.sage(("zu"));
t.bediene();
t.zeige(neu Schild("wieder"));
t.bediene();
s.setzeText(("egal, nicht gezeigt"));
Bote.sage(("ende"));
`, {
    uiEreignisse: [{ typ: "geschlossen" }, { typ: "geschlossen" }],
    out: ["zu", "ende"],
    ui: [fenster("Kurz"), baum({ id: "z1", art: "schild", text: "tschüss" }), fenster("Kurz"), baum({ id: "z2", art: "schild", text: "wieder" })],
  }),

  F(T, "K-063: schliesse() im Rückruf beendet bediene nach dem Rückruf, weitere Ereignisse werden nicht mehr zugestellt", P`
Theke t = neu Theke("S");
Knopf k = neu Knopf("zu", () -> { t.schliesse(); Bote.sage(("im rückruf")); });
Knopf n = neu Knopf("nie", () -> Bote.sage(("nie")));
t.zeige(neu Reihe([k, n]));
t.bediene();
t.bediene();
Bote.sage(("ende"));
`, {
    uiEreignisse: [{ typ: "klick", id: "z1" }, { typ: "klick", id: "z2" }],
    out: ["im rückruf", "ende"],
    ui: [fenster("S"), baum({ id: "z3", art: "reihe", kinder: [{ id: "z1", art: "knopf", text: "zu" }, { id: "z2", art: "knopf", text: "nie" }] }), schliesse()],
  }),

  F(T, "K-064: Ereignisse für unbekannte IDs, inaktive Knöpfe, falsche Art/Typ werden ignoriert; aenderung ohne Rückruf setzt Zustand; Haken auch \"true\"", P`
Theke t = neu Theke("I");
Knopf k = neu Knopf("k", () -> Bote.sage(("klick")));
Eingabe e = neu Eingabe();
Haken h = neu Haken("h");
k.aktiv(nein);
t.zeige(neu Stapel([k, e, h]));
t.bediene();
Bote.sage((e.wert() + " " + h.an()));
`, {
    uiEreignisse: [{ typ: "klick", id: "z1" }, { typ: "klick", id: "z99" }, { typ: "klick", id: "z2" }, { typ: "aenderung", id: "z2", wert: 7 }, { typ: "aenderung", id: "z2", wert: "x" }, { typ: "aenderung", id: "z3", wert: "true" }, { typ: "tanz", id: "z1" }],
    out: ["x ja"],
    ui: [fenster("I"), baum({ id: "z4", art: "stapel", kinder: [{ id: "z1", art: "knopf", text: "k", aktiv: false }, { id: "z2", art: "eingabe", wert: "" }, { id: "z3", art: "haken", text: "h", an: false }] })],
  }),

  F(T, "K-065: Ananas im Rückruf verlässt bediene (fangbar), Theke bleibt offen, erneutes bediene wartet weiter", P`
Theke t = neu Theke("A");
Knopf k = neu Knopf("boom", () -> { wirf neu StreitAnanas("kaputt"); });
Knopf o = neu Knopf("ok", () -> Bote.sage(("ok")));
t.zeige(neu Reihe([k, o]));
probier { t.bediene(); } verbrannt (StreitAnanas a) { Bote.sage((a.nachricht())); }
t.bediene();
`, { uiEreignisse: [{ typ: "klick", id: "z1" }, { typ: "klick", id: "z2" }], out: ["kaputt", "ok"] }),

  F(T, "K-065: Panik im Rückruf → Exit 39 (kein schliesse)", P`
Theke t = neu Theke("H");
Knopf k = neu Knopf("h", () -> { Pizza p = ((Ananas)); });
t.zeige(k);
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "z1" }], exit: 39, panik: true,
    ui: [fenster("H"), baum({ id: "z1", art: "knopf", text: "h" })],
  }),

  F(T, "K-065/069: Eingabe im Rückruf; bediene = 3 Schritte + Rückruf-Schritte (6), Warten nichts", P`
Theke t = neu Theke("Q");
Knopf k = neu Knopf("lies", () -> Bote.sage(("gelesen " + Bestellannahme.lies())));
t.zeige(k);
Bote.sage((Uhr.jetzt()));
t.bediene();
Bote.sage((Uhr.jetzt()));
`, {
    uiEreignisse: [{ typ: "klick", id: "z1" }, { typ: "geschlossen" }], eingabe: ["x"], out: ["16ms", "gelesen x", "30ms"],
    check: (res) => (res.schritte === 30 ? undefined : "schritte " + res.schritte + ", erwartet 30"),
  }),

  F(T, "K-066/068: Typen und Stile – diavolo-Pflicht, Textform speichern, Stil-Whitelist mit Listen in Fehlertexten, Kommazahlen erlaubt", P`
Theke t = neu Theke("T", breite: 100, hoehe: 100);
Knopf k = neu Knopf(5);
Bote.sage((k.text()));
probier { k.aktiv(1); } verbrannt (TypAnanas a) { Bote.sage(("typ")); }
probier { k.stil("rahmen", 1); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { k.stil("farbe", "lila"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { k.stil("ausrichtung", "oben"); } verbrannt (LaufzeitAnanas a) { Bote.sage(("ausrichtung")); }
probier { k.stil("breite", -1); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { k.stil("breite", "x"); } verbrannt (TypAnanas a) { Bote.sage(("breite-typ")); }
k.stil("schrift", "gross");
k.stil("breite", 2.5);
Bote.sage((k.aktiv() + " " + k.sichtbar() + " " + k));
t.zeige(k);
`, {
    uiEreignisse: [],
    out: ["5", "typ", "Stil 'rahmen' gibt es nicht. Erlaubt: breite, hoehe, abstand, ausrichtung, schrift, farbe.",
      "Wert 'lila' ist für Stil 'farbe' nicht erlaubt. Erlaubt: tomate, basilikum, mozzarella, kruste, normal.",
      "ausrichtung", "Stil 'breite' braucht eine Zahl ≥ 0, nicht -1.", "breite-typ", "ja ja Knopf(z1)"],
    ui: [fenster("T", 100, 100), baum({ id: "z1", art: "knopf", text: "5", stil: { schrift: "gross", breite: 2.5 } })],
  }),

  F(T, "K-066: breite/hoehe Ganzzahl (sonst TypAnanas); titel optional (Standard \"\"); Textform Theke(Titel)", P`
probier { Theke x = neu Theke("x", breite: 2.5); } verbrannt (TypAnanas a) { Bote.sage(("breite")); }
Theke t = neu Theke();
Bote.sage(("[" + t.titel() + "] " + t));
t.setzeTitel(("Pizzeria"));
Bote.sage((t));
t.zeige(neu Schild("s"));
`, { uiEreignisse: [], out: ["breite", "[] Theke()", "Theke(Pizzeria)"], ui: [fenster("Pizzeria"), baum({ id: "z1", art: "schild", text: "s" })] }),

  F(T, "K-073: setzeAn/setzeWert lösen keine Rückrufe aus; Setter sind verkettbar; aktiv()/sichtbar() ohne Argument sind Getter", P`
Theke t = neu Theke("H");
Haken h = neu Haken("h");
h.beiAenderung(a -> Bote.sage(("cb " + a)));
Eingabe e = neu Eingabe();
e.beiAenderung(w -> Bote.sage(("cbe " + w)));
h.setzeAn(ja);
Bote.sage((e.setzeWert(("x")).wert()));
Knopf k = neu Knopf("k");
Bote.sage((k.aktiv(nein).aktiv()));
t.zeige(neu Stapel([h, e, k]));
h.setzeAn(nein);
t.bediene();
`, {
    uiEreignisse: [],
    out: ["x", "nein"],
    ui: [fenster("H"), baum({ id: "z4", art: "stapel", kinder: [{ id: "z1", art: "haken", text: "h", an: true }, { id: "z2", art: "eingabe", wert: "x" }, { id: "z3", art: "knopf", text: "k", aktiv: false }] }), aendere({ id: "z1", an: false })],
  }),

  F(T, "K-062: Zutat ist Rohling; erbt Knopf → P0010; eigene Klasse Knopf hat Vorrang", P`
klasse Knopf { salami x = 7; }
Knopf k = neu Knopf();
Bote.sage((k.x));
probier { Zutat z = neu Zutat(); } verbrannt (RohlingAnanas a) { Bote.sage(("rohling")); }
`, { out: ["7", "rohling"] }),

  F(T, "K-062: erbt Knopf → PizzaFehler P0010", P`
klasse MeinKnopf erbt Knopf { }
`, { exit: 2, fehler: { code: "P0010", art: "pizzafehler" } }),
];
