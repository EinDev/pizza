"use strict";
// Theke (SPEC §16, KLAERUNGEN K-056 … K-074) – Black-Box-Fälle mit vorgegebenen Renderer-Ereignissen (uiEreignisse)
// und exakter Liste der ui-Nachrichten (ui, kanonisch verglichen). Erwartungen aus SPEC §16 / KLAERUNGEN.
const { P, F } = require("../lib/helfer");
const T = "§16 Theke (K-056 …)";

const fenster = (titel, breite = 480, hoehe = 360) => ({ v: 1, op: "fenster", titel, breite, hoehe });
const baum = (wurzel) => ({ v: 1, op: "baum", wurzel });
const aendere = (...aenderungen) => ({ v: 1, op: "aendere", aenderungen });
const schliesse = () => ({ v: 1, op: "schliesse" });

// ── Theke v3 – Animationen (SPEC §16.6, K-090 … K-092; Interpreter U-56) ──
const T6 = "§16.6 Theke-Animationen (K-090 …)";
const aendereA = (aenderungen, animationen) =>
  animationen && animationen.length ? { v: 1, op: "aendere", aenderungen, animationen } : { v: 1, op: "aendere", aenderungen };
/** Prüft die Texte aller Warnungen eines Codes der Reihe nach (enthält-Vergleich). */
const warnTexte = (code, teile) => (res) => {
  const ist = res.ereignisse.filter((e) => e.typ === "warnung" && e.code === code).map((e) => String(e.text || ""));
  if (ist.length !== teile.length) return `${code}: ${ist.length} Warnungen ${JSON.stringify(ist)}, erwartet ${teile.length}`;
  const falsch = teile.findIndex((t, i) => !ist[i].includes(t));
  return falsch < 0 ? undefined : `${code} Nr. ${falsch + 1}: ${JSON.stringify(ist[falsch])} enthält nicht ${JSON.stringify(teile[falsch])}`;
};

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

  F(T, "K-061: nach geschlossen wird nichts mehr gesendet (kein schliesse, keine aendere); zeige nach Schließen öffnet wieder", P`
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

  F(T, "K-061: Theke erzeugt, aber nie gezeigt → kein schliesse; nach geschlossen → kein schliesse", P`
Theke t = neu Theke("N");
Bote.sage(("ende"));
`, { uiEreignisse: [], out: ["ende"], ui: [] }),

  F(T, "K-075: stil(schlüssel, karton) entfernt den Stil; die Nachricht trägt null für entfernte Schlüssel (Renderer setzt zurück)", P`
Theke t = neu Theke("S");
Knopf k = neu Knopf("k");
k.stil("breite", 10);
k.stil("farbe", "tomate");
t.zeige(k);
k.stil("breite", karton);
t.bediene();
`, {
    uiEreignisse: [],
    ui: [fenster("S"), baum({ id: "z1", art: "knopf", text: "k", stil: { breite: 10, farbe: "tomate" } }), aendere({ id: "z1", stil: { farbe: "tomate", breite: null } })],
  }),

  F(T, "K-061/057: Programmende mit offener Theke → letzter Puffer-Flush, dann schliesse", P`
Theke t = neu Theke("V");
Schild s = neu Schild("alt");
Schild u = neu Schild("unsichtbar");
t.zeige(s);
s.setzeText(("neu"));
u.setzeText(("egal"));
Bote.sage(("ende"));
`, {
    out: ["ende"],
    ui: [fenster("V"), baum({ id: "z1", art: "schild", text: "alt" }), aendere({ id: "z1", text: "neu" }), schliesse()],
    check(res) {
      const letzte = res.ereignisse.filter((e) => e.typ === "ausgabe" || e.typ === "ui").map((e) => e.typ === "ui" ? e.nachricht.op : e.text).slice(-3);
      return JSON.stringify(letzte) === JSON.stringify(["ende", "aendere", "schliesse"]) ? undefined : "Ende-Flush/schliesse fehlt: " + JSON.stringify(letzte);
    },
  }),

  F(T, "K-061/065: Änderungen bei Ananas im Rückruf gesendet; offenes Fenster am Programmende → schliesse", P`
Theke t = neu Theke("H");
Schild s = neu Schild("a");
Knopf k = neu Knopf("h", () -> { s.setzeText(("b")); wirf neu StreitAnanas("x"); });
t.zeige(neu Stapel([s, k]));
probier { t.bediene(); } verbrannt (StreitAnanas a) { Bote.sage(("gefangen")); }
`, {
    uiEreignisse: [{ typ: "klick", id: "z2" }],
    out: ["gefangen"],
    ui: [fenster("H"), baum({ id: "z3", art: "stapel", kinder: [{ id: "z1", art: "schild", text: "a" }, { id: "z2", art: "knopf", text: "h" }] }), aendere({ id: "z1", text: "b" }), schliesse()],
    check(res) {
      const t = res.ereignisse.filter((e) => e.typ === "ausgabe" || (e.typ === "ui" && e.nachricht.op === "aendere")).map((e) => e.typ === "ui" ? "aendere" : e.text);
      return JSON.stringify(t) === JSON.stringify(["aendere", "gefangen"]) ? undefined : "Reihenfolge " + JSON.stringify(t);
    },
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
    ui: [fenster("T", 100, 100), baum({ id: "z1", art: "knopf", text: "5", stil: { schrift: "gross", breite: 2.5 } }), schliesse()],
  }),

  F(T, "K-061: Ende durch ungefangene Ananas mit offener Theke → Flush + schliesse vor dem fehler-Ereignis", P`
Theke t = neu Theke("A");
Schild s = neu Schild("a");
t.zeige(s);
s.setzeText(("b"));
wirf neu StreitAnanas("kaputt");
`, {
    exit: 1, fehler: { code: "StreitAnanas" },
    ui: [fenster("A"), baum({ id: "z1", art: "schild", text: "a" }), aendere({ id: "z1", text: "b" }), schliesse()],
    check(res) {
      const t = res.ereignisse.map((e) => e.typ === "ui" ? "ui:" + e.nachricht.op : e.typ);
      const iF = t.indexOf("fehler"), iS = t.lastIndexOf("ui:schliesse");
      return iF >= 0 && iS >= 0 && iS < iF && t[t.length - 1] === "ende" ? undefined : "Reihenfolge " + JSON.stringify(t);
    },
  }),

  F(T, "K-061: Ende durch P0002 mit offener Theke → schliesse", P`
Theke t = neu Theke("L");
t.zeige(neu Schild("s"));
solange (ja) { }
`, { exit: 3, schrittLimit: 500, fehler: { code: "P0002" }, ui: [fenster("L"), baum({ id: "z1", art: "schild", text: "s" }), schliesse()] }),


  F(T, "K-087: Endlosschleife in einem Rückruf → P0002 (Exit 3)", P`
Theke t = neu Theke("L");
Knopf k = neu Knopf("k", () -> { solange (ja) { } });
t.zeige(k);
t.bediene();
`, { uiEreignisse: [{ typ: "klick", id: "z1" }], schrittLimit: 600, exit: 3, fehler: { code: "P0002" } }),

  F(T, "K-066: breite/hoehe Ganzzahl (sonst TypAnanas); titel optional (Standard \"\"); Textform Theke(Titel)", P`
probier { Theke x = neu Theke("x", breite: 2.5); } verbrannt (TypAnanas a) { Bote.sage(("breite")); }
Theke t = neu Theke();
Bote.sage(("[" + t.titel() + "] " + t));
t.setzeTitel(("Pizzeria"));
Bote.sage((t));
t.zeige(neu Schild("s"));
`, { uiEreignisse: [], out: ["breite", "[] Theke()", "Theke(Pizzeria)"], ui: [fenster("Pizzeria"), baum({ id: "z1", art: "schild", text: "s" }), schliesse()] }),

F(T, "K-084: Takt im Baum (intervall), Schlag ruft fn(anzahl), aktiv(nein) → aendere, Schlag auf inaktiven Takt ignoriert", P`
Theke t = neu Theke("T");
salami summe = 0;
Takt u = neu Takt(1s, (salami n) -> { summe += n; Bote.sage(("tick " + n)); });
Knopf k = neu Knopf("stop", () -> { u.aktiv(nein); });
t.zeige(neu Stapel([u, k]));
t.bediene();
Bote.sage((summe + " " + u.intervall() + " " + u.aktiv() + " " + u));
`, {
    uiEreignisse: [{ typ: "takt", id: "z1", anzahl: 1 }, { typ: "takt", id: "z1", anzahl: 5 }, { typ: "takt", id: "z1" }, { typ: "klick", id: "z2" }, { typ: "takt", id: "z1", anzahl: 3 }],
    out: ["tick 1", "tick 5", "tick 1", "7 1s nein Takt(z1)"],
    ui: [fenster("T"), baum({ id: "z3", art: "stapel", kinder: [{ id: "z1", art: "takt", intervall: 1000 }, { id: "z2", art: "knopf", text: "stop" }] }), aendere({ id: "z1", aktiv: false })],
  }),

  F(T, "K-084: Mindestintervall 100ms, Nicht-Dauer → TypAnanas (beide verbrauchen eine ID, K-060), setzeIntervall sendet aendere, Takt außerhalb des Baums bekommt keinen Schlag", P`
Theke t = neu Theke("T");
probier { Takt f = neu Takt(50ms); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { Takt g = neu Takt(5); } verbrannt (TypAnanas a) { Bote.sage(("typ")); }
Takt u = neu Takt(intervall: 500ms, beiTakt: n -> Bote.sage(("u " + n)));
Takt draussen = neu Takt(1s, n -> Bote.sage(("nie")));
Knopf k = neu Knopf("schneller", () -> { u.setzeIntervall(250ms); });
t.zeige(neu Reihe([u, k]));
t.bediene();
`, {
    uiEreignisse: [{ typ: "takt", id: "z4", anzahl: 2 }, { typ: "takt", id: "z3", anzahl: 1 }, { typ: "klick", id: "z5" }],
    out: ["Ein Takt braucht mindestens 100ms, nicht 50ms.", "typ", "u 1"],
    ui: [fenster("T"), baum({ id: "z6", art: "reihe", kinder: [{ id: "z3", art: "takt", intervall: 500 }, { id: "z5", art: "knopf", text: "schneller" }] }), aendere({ id: "z3", intervall: 250 })],
  }),

  F(T, "K-084/069: Zustellung eines Schlags kostet 0 Schritte (bediene = 3 + Rückruf)", P`
Theke t = neu Theke("T");
Takt u = neu Takt(1s, () -> { });
t.zeige(u);
Bote.sage((Uhr.jetzt()));
t.bediene();
Bote.sage((Uhr.jetzt()));
`, { uiEreignisse: [{ typ: "takt", id: "z1", anzahl: 1 }, { typ: "takt", id: "z1", anzahl: 1 }], out: ["16ms", "24ms"] }),

  F(T, "K-086: Fortschritt (geklemmt), Abschnitt, Tabelle (Textform), hinweis, Reiter mit Ereignis", P`
Theke t = neu Theke("V2");
Fortschritt f = neu Fortschritt(wert: 1.5, text: "voll");
Bote.sage((f.wert()));
f.setzeWert(0.25);
Tabelle tab = neu Tabelle(["Gebäude", "Anzahl"], [["Lehrling", 3], ["Ofen", 1.5]]);
Knopf k = neu Knopf("k");
k.hinweis("Backt eine Pizza");
Abschnitt a = neu Abschnitt("Backstube", [f, tab, k]);
Schild s = neu Schild("Erfolge");
Reiter r = neu Reiter(["Backstube", "Erfolge"], [a, s]);
r.beiAenderung((salami n) -> Bote.sage(("reiter " + n + " " + r.gewaehlt())));
t.zeige(r);
t.bediene();
Bote.sage((k.hinweis() + " " + r.gewaehlt()));
`, {
    uiEreignisse: [{ typ: "aenderung", id: "z6", wert: 2 }, { typ: "aenderung", id: "z6", wert: 9 }],
    out: ["1", "reiter 2 2", "Backt eine Pizza 2"],
    ui: [fenster("V2"), baum({ id: "z6", art: "reiter", titel: ["Backstube", "Erfolge"], gewaehlt: 1, kinder: [
      { id: "z4", art: "abschnitt", titel: "Backstube", kinder: [
        { id: "z1", art: "fortschritt", wert: 0.25, text: "voll" },
        { id: "z2", art: "tabelle", spalten: ["Gebäude", "Anzahl"], zeilen: [["Lehrling", "3"], ["Ofen", "1.5"]] },
        { id: "z3", art: "knopf", text: "k", hinweis: "Backt eine Pizza" }] },
      { id: "z5", art: "schild", text: "Erfolge" }] })],
  }),

  F(T, "K-086: schrift riesig erlaubt; Reiter.waehle außerhalb → KeinStückAnanas; Fortschritt NaN → 0", P`
Knopf k = neu Knopf("k");
k.stil("schrift", "riesig");
Reiter r = neu Reiter(["a"], [k]);
probier { r.waehle(2); } verbrannt (KeinStückAnanas a) { Bote.sage(("stück")); }
Fortschritt f = neu Fortschritt(wert: Mathe.wurzel(-1));
Bote.sage((f.wert()));
`, { out: ["stück", "0"] }),

  F(T, "K-087: Schrittlimit gilt je Theke-Rückruf neu (zwei Rückrufe à ~400 Schritte bei Limit 600 laufen durch)", P`
Theke t = neu Theke("L");
Knopf k = neu Knopf("k", () -> { salami i = 0; solange (i < 100) { i++; } Bote.sage(("fertig")); });
t.zeige(k);
t.bediene();
Bote.sage((Uhr.jetzt().inMs() > 600));
`, { uiEreignisse: [{ typ: "klick", id: "z1" }, { typ: "klick", id: "z1" }], schrittLimit: 600, out: ["fertig", "fertig", "ja"] }),

  F(T, "K-087: Uhr.echt() liefert die Wanduhr; im Test fest über optionen.echtzeit", P`
Dauer e = Uhr.echt();
Bote.sage((e.inMs()));
Uhr.vorspulen(1h);
Bote.sage((Uhr.echt().inMs()));
`, { echtzeit: 1700000000000, out: ["1700000000000", "1700000000000"] }),

  // ── §16.6 Theke v3 – Animationen (aus a12 übernommen, U-56) ──
  F(T6, "K-090: animiere/schwebe im Rückruf – Feld animationen in derselben aendere-Nachricht, Aufrufreihenfolge, nichts zusammengefasst, optionale Felder nur wenn angegeben, animiere liefert die Zutat", P`
Theke t = neu Theke("A");
Schild kasse = neu Schild("0");
Knopf k = neu Knopf("Backen", () -> {
    kasse.setzeText("12");
    k.animiere("huepfen");
    kasse.animiere("puls", dauer: 300ms);
    kasse.animiere("puls");
    t.schwebe("+12", bei: k, farbe: "basilikum");
    t.schwebe(12, dauer: 1.5s);
    Bote.sage(("klick " + (k.animiere("wackeln") == k)));
});
t.zeige(neu Stapel([kasse, k]));
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "z2" }],
    out: ["klick ja"],
    noWarn: ["W0102"],
    ui: [
      fenster("A"),
      baum({ id: "z3", art: "stapel", kinder: [{ id: "z1", art: "schild", text: "0" }, { id: "z2", art: "knopf", text: "Backen" }] }),
      aendereA([{ id: "z1", text: "12" }], [
        { id: "z2", art: "huepfen" },
        { id: "z1", art: "puls", dauer: 300 },
        { id: "z1", art: "puls" },
        { art: "schwebe", text: "+12", id: "z2", farbe: "basilikum" },
        { art: "schwebe", text: "12", dauer: 1500 },
        { id: "z2", art: "wackeln" },
      ]),
    ],
  }),

  F(T6, "K-090/061: nur Animationen → aendere mit aenderungen [] ; Flush am Programmende vor schliesse", P`
Theke t = neu Theke("B");
Schild s = neu Schild("s");
t.zeige(s);
s.animiere("aufpoppen");
`, {
    noWarn: ["W0102"],
    ui: [fenster("B"), baum({ id: "z1", art: "schild", text: "s" }), aendereA([], [{ id: "z1", art: "aufpoppen" }]), schliesse()],
  }),

  F(T6, "K-090: schliesse() im Rückruf – Animationen davor gehen vor schliesse hinaus, danach W0102 (Theke nicht offen), keine Ananas", P`
Theke t = neu Theke("C");
Knopf k = neu Knopf("zu", () -> { k.animiere("funkeln"); t.schliesse(); k.animiere("puls"); Bote.sage(("weiter")); });
t.zeige(k);
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "z1" }],
    out: ["weiter"],
    warnAnzahl: { W0102: 1 },
    ui: [fenster("C"), baum({ id: "z1", art: "knopf", text: "zu" }), aendereA([], [{ id: "z1", art: "funkeln" }]), schliesse()],
    check: warnTexte("W0102", ["Animation entfällt – die Theke ist nicht offen."]),
  }),

  F(T6, "K-090/091: einblenden auf eine im selben Rückruf eingefügte Zeile (aenderungen vor animationen); uebergang im baum nur bei ja, in aendere der neue Wert", P`
Theke t = neu Theke("D");
Schild a = neu Schild("a");
Stapel st = neu Stapel([a]);
st.uebergang(ja);
Knopf k = neu Knopf("neu", () -> {
    Schild z = neu Schild("Zeile");
    st.hinzu(z);
    z.animiere("einblenden");
    k.uebergang(ja);
    st.uebergang(nein);
});
t.zeige(neu Reihe([st, k]));
Bote.sage((st.uebergang() + " " + k.uebergang()));
t.bediene();
Bote.sage((st.uebergang() + " " + k.uebergang()));
`, {
    uiEreignisse: [{ typ: "klick", id: "z3" }],
    out: ["ja nein", "nein ja"],
    ui: [
      fenster("D"),
      baum({ id: "z4", art: "reihe", kinder: [
        { id: "z2", art: "stapel", uebergang: true, kinder: [{ id: "z1", art: "schild", text: "a" }] },
        { id: "z3", art: "knopf", text: "neu" }] }),
      aendereA([
        { id: "z2", kinder: [{ id: "z1", art: "schild", text: "a" }, { id: "z5", art: "schild", text: "Zeile" }], uebergang: false },
        { id: "z3", uebergang: true },
      ], [{ id: "z5", art: "einblenden" }]),
    ],
  }),

  F(T6, "K-090/058: erneutes zeige verwirft gepufferte Animationen", P`
Theke t = neu Theke("E");
Schild a = neu Schild("a");
Schild b = neu Schild("b");
t.zeige(a);
a.animiere("puls");
t.zeige(b);
b.animiere("wackeln");
`, {
    noWarn: ["W0102"],
    ui: [fenster("E"), baum({ id: "z1", art: "schild", text: "a" }), baum({ id: "z2", art: "schild", text: "b" }),
      aendereA([], [{ id: "z2", art: "wackeln" }]), schliesse()],
  }),

  F(T6, "K-090: nicht gezeigte Zutat / Theke nicht offen → W0102 je Aufrufstelle, kein Eintrag, Programm läuft weiter", P`
Theke t = neu Theke("W");
Schild s = neu Schild("s");
Schild frei = neu Schild("frei");
für (salami i = 0; i < 3; i++) { s.animiere("puls"); }
t.zeige(s);
frei.animiere("wackeln");
t.schwebe("x", bei: frei);
t.bediene();
s.animiere("puls");
t.schwebe("y");
Bote.sage(("weiter"));
`, {
    uiEreignisse: [],
    out: ["weiter"],
    ui: [fenster("W"), baum({ id: "z1", art: "schild", text: "s" })],
    check: warnTexte("W0102", [
      "Animation entfällt – die Theke ist nicht offen.",
      "Animation entfällt – 'z2' liegt nicht auf der Theke.",
      "Animation entfällt – 'z2' liegt nicht auf der Theke.",
      "Animation entfällt – die Theke ist nicht offen.",
      "Animation entfällt – die Theke ist nicht offen.",
    ]),
  }),

  F(T6, "K-090/091: Fehlertexte (Art, Dauer-Typ, Dauer-Bereich, bei, farbe, uebergang) – unabhängig vom Fensterzustand; Grenzen 50ms und 5s gültig", P`
Knopf k = neu Knopf("k");
Theke t = neu Theke("F");
probier { k.animiere("tanzen"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { k.animiere("Puls"); } verbrannt (LaufzeitAnanas a) { Bote.sage(("gross")); }
probier { k.animiere("puls", 300); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
probier { k.animiere("puls", dauer: 10s); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { k.animiere("puls", dauer: 20ms); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { t.schwebe("x", bei: 5); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
probier { t.schwebe("x", farbe: "lila"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { t.schwebe("x", dauer: 2); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
probier { k.uebergang(1); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
t.zeige(k);
k.animiere("puls", dauer: 50ms).animiere("funkeln", dauer: 5s);
Bote.sage(("ok"));
`, {
    out: [
      "Animation 'tanzen' gibt es nicht. Erlaubt: puls, huepfen, wackeln, funkeln, einblenden, aufpoppen.",
      "gross",
      "animiere(dauer: …) braucht eine Dauer, nicht 300.",
      "Eine Animation dauert 50ms bis 5s, nicht 10s.",
      "Eine Animation dauert 50ms bis 5s, nicht 20ms.",
      "schwebe(bei: …) braucht eine Zutat, nicht 5.",
      "Wert 'lila' ist für Stil 'farbe' nicht erlaubt. Erlaubt: tomate, basilikum, mozzarella, kruste, normal.",
      "schwebe(dauer: …) braucht eine Dauer, nicht 2.",
      "Erwartet diavolo (ja/nein), bekam 1.",
      "ok",
    ],
    noWarn: ["W0102"],
    ui: [fenster("F"), baum({ id: "z1", art: "knopf", text: "k" }),
      aendereA([], [{ id: "z1", art: "puls", dauer: 50 }, { id: "z1", art: "funkeln", dauer: 5000 }]), schliesse()],
  }),

  F(T6, "K-090/069: Schritte – animiere und schwebe kosten wie ein gewöhnlicher Aufruf (hinweis); Animationen und Änderungen in einer Nachricht", P`
Theke t = neu Theke("S");
Knopf k = neu Knopf("k");
t.zeige(k);
Dauer a = Uhr.jetzt();
k.hinweis("puls");
Dauer b = Uhr.jetzt();
k.animiere("puls");
Dauer c = Uhr.jetzt();
t.schwebe("puls");
Dauer d = Uhr.jetzt();
Bote.sage(((b - a) == (c - b)));
Bote.sage(((b - a) == (d - c)));
`, {
    out: ["ja", "ja"],
    ui: [fenster("S"), baum({ id: "z1", art: "knopf", text: "k" }),
      aendereA([{ id: "z1", hinweis: "puls" }], [{ id: "z1", art: "puls" }, { art: "schwebe", text: "puls" }]), schliesse()],
  }),

  F(T6, "K-093: animiere ohne Art / karton / Nicht-Text → Vokabular-Ananas mit Textform (wie stil); schwebe ohne Text / karton → Schwebetext 'karton', leerer Text erlaubt; keine Warnung", P`
Theke t = neu Theke("K");
Knopf k = neu Knopf("k");
probier { k.animiere(); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { k.animiere(karton); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { k.animiere(5); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { k.stil(); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
t.zeige(k);
t.schwebe();
t.schwebe(karton);
t.schwebe(karton, k);
t.schwebe("");
Bote.sage(("ok"));
`, {
    out: [
      "Animation 'karton' gibt es nicht. Erlaubt: puls, huepfen, wackeln, funkeln, einblenden, aufpoppen.",
      "Animation 'karton' gibt es nicht. Erlaubt: puls, huepfen, wackeln, funkeln, einblenden, aufpoppen.",
      "Animation '5' gibt es nicht. Erlaubt: puls, huepfen, wackeln, funkeln, einblenden, aufpoppen.",
      "Stil 'karton' gibt es nicht. Erlaubt: breite, hoehe, abstand, ausrichtung, schrift, farbe.",
      "ok",
    ],
    noWarn: ["W0102"],
    ui: [fenster("K"), baum({ id: "z1", art: "knopf", text: "k" }),
      aendereA([], [
        { art: "schwebe", text: "karton" },
        { art: "schwebe", text: "karton" },
        { art: "schwebe", text: "karton", id: "z1" },
        { art: "schwebe", text: "" },
      ]),
      schliesse()],
  }),

  F(T6, "K-094: alle Parameter von animiere/schwebe auch benannt (art:, text:, bei:, farbe:, dauer:), beliebige Reihenfolge; positional vor benannt bei doppelter Angabe; unbekannte Namen ignoriert (K-028); Fehlertext nennt den Parameter benannt", P`
Theke t = neu Theke("N");
Knopf k = neu Knopf("k");
t.zeige(k);
k.animiere(art: "huepfen");
k.animiere(dauer: 300ms, art: "wackeln");
k.animiere("puls", art: "huepfen");
k.animiere("funkeln", dauer: 1s, xyz: 3);
t.schwebe(text: "+1");
t.schwebe(dauer: 2s, farbe: "kruste", bei: k, text: "+2");
t.schwebe("pos", text: "ben");
probier { k.animiere("puls", 7); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
probier { k.animiere(art: "puls", dauer: 7); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
probier { t.schwebe("x", 5); } verbrannt (TypAnanas a) { Bote.sage((a.nachricht())); }
`, {
    out: [
      "animiere(dauer: …) braucht eine Dauer, nicht 7.",
      "animiere(dauer: …) braucht eine Dauer, nicht 7.",
      "schwebe(bei: …) braucht eine Zutat, nicht 5.",
    ],
    noWarn: ["W0102"],
    ui: [fenster("N"), baum({ id: "z1", art: "knopf", text: "k" }),
      aendereA([], [
        { id: "z1", art: "huepfen" },
        { id: "z1", art: "wackeln", dauer: 300 },
        { id: "z1", art: "puls" },
        { id: "z1", art: "funkeln", dauer: 1000 },
        { art: "schwebe", text: "+1" },
        { art: "schwebe", text: "+2", id: "z1", farbe: "kruste", dauer: 2000 },
        { art: "schwebe", text: "pos" },
      ]),
      schliesse()],
  }),

  F(T6, "K-090: höchstens 32 Animationen je Nachricht (die ersten bleiben); animiere an einem Takt ist erlaubt", P`
Theke t = neu Theke("L");
Schild s = neu Schild("s");
Takt u = neu Takt(1s);
t.zeige(neu Stapel([s, u]));
u.animiere("puls");
für (salami i = 1; i <= 40; i++) { t.schwebe(i, bei: s); }
`, {
    noWarn: ["W0102"],
    ui: [fenster("L"),
      baum({ id: "z3", art: "stapel", kinder: [{ id: "z1", art: "schild", text: "s" }, { id: "z2", art: "takt", intervall: 1000 }] }),
      aendereA([], [{ id: "z2", art: "puls" }].concat(Array.from({ length: 31 }, (_, i) => ({ art: "schwebe", text: String(i + 1), id: "z1" })))),
      schliesse()],
  }),
];
