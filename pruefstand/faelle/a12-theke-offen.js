"use strict";
// Theke-Fälle zu Klärungen, deren Umsetzung noch OFFEN ist (Konvention *-offen.js, ARCHITEKTUR §6).
// Theke v3 – Animationen (SPEC §16.6, KLAERUNGEN K-090 … K-092; Aufträge U-56/U-57). Black-Box: vorgegebene
// Renderer-Ereignisse (uiEreignisse), exakte Liste der ui-Nachrichten (ui, kanonisch verglichen).
// Erwartungen aus SPEC §16.6 / KLAERUNGEN, nicht aus einer Implementierung.
const { P, F } = require("../lib/helfer");
const T = "§16.6 Theke-Animationen (K-090 …)";

const fenster = (titel, breite = 480, hoehe = 360) => ({ v: 1, op: "fenster", titel, breite, hoehe });
const baum = (wurzel) => ({ v: 1, op: "baum", wurzel });
const aendere = (aenderungen, animationen) =>
  animationen && animationen.length ? { v: 1, op: "aendere", aenderungen, animationen } : { v: 1, op: "aendere", aenderungen };
const schliesse = () => ({ v: 1, op: "schliesse" });

/** Prüft die Texte aller Warnungen eines Codes der Reihe nach (enthält-Vergleich). */
const warnTexte = (code, teile) => (res) => {
  const ist = res.ereignisse.filter((e) => e.typ === "warnung" && e.code === code).map((e) => String(e.text || ""));
  if (ist.length !== teile.length) return `${code}: ${ist.length} Warnungen ${JSON.stringify(ist)}, erwartet ${teile.length}`;
  const falsch = teile.findIndex((t, i) => !ist[i].includes(t));
  return falsch < 0 ? undefined : `${code} Nr. ${falsch + 1}: ${JSON.stringify(ist[falsch])} enthält nicht ${JSON.stringify(teile[falsch])}`;
};

module.exports = [
  F(T, "K-090: animiere/schwebe im Rückruf – Feld animationen in derselben aendere-Nachricht, Aufrufreihenfolge, nichts zusammengefasst, optionale Felder nur wenn angegeben, animiere liefert die Zutat", P`
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
      aendere([{ id: "z1", text: "12" }], [
        { id: "z2", art: "huepfen" },
        { id: "z1", art: "puls", dauer: 300 },
        { id: "z1", art: "puls" },
        { art: "schwebe", text: "+12", id: "z2", farbe: "basilikum" },
        { art: "schwebe", text: "12", dauer: 1500 },
        { id: "z2", art: "wackeln" },
      ]),
    ],
  }),

  F(T, "K-090/061: nur Animationen → aendere mit aenderungen [] ; Flush am Programmende vor schliesse", P`
Theke t = neu Theke("B");
Schild s = neu Schild("s");
t.zeige(s);
s.animiere("aufpoppen");
`, {
    noWarn: ["W0102"],
    ui: [fenster("B"), baum({ id: "z1", art: "schild", text: "s" }), aendere([], [{ id: "z1", art: "aufpoppen" }]), schliesse()],
  }),

  F(T, "K-090: schliesse() im Rückruf – Animationen davor gehen vor schliesse hinaus, danach W0102 (Theke nicht offen), keine Ananas", P`
Theke t = neu Theke("C");
Knopf k = neu Knopf("zu", () -> { k.animiere("funkeln"); t.schliesse(); k.animiere("puls"); Bote.sage(("weiter")); });
t.zeige(k);
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "z1" }],
    out: ["weiter"],
    warnAnzahl: { W0102: 1 },
    ui: [fenster("C"), baum({ id: "z1", art: "knopf", text: "zu" }), aendere([], [{ id: "z1", art: "funkeln" }]), schliesse()],
    check: warnTexte("W0102", ["Animation entfällt – die Theke ist nicht offen."]),
  }),

  F(T, "K-090/091: einblenden auf eine im selben Rückruf eingefügte Zeile (aenderungen vor animationen); uebergang im baum nur bei ja, in aendere der neue Wert", P`
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
      aendere([
        { id: "z2", kinder: [{ id: "z1", art: "schild", text: "a" }, { id: "z5", art: "schild", text: "Zeile" }], uebergang: false },
        { id: "z3", uebergang: true },
      ], [{ id: "z5", art: "einblenden" }]),
    ],
  }),

  F(T, "K-090/058: erneutes zeige verwirft gepufferte Animationen", P`
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
      aendere([], [{ id: "z2", art: "wackeln" }]), schliesse()],
  }),

  F(T, "K-090: nicht gezeigte Zutat / Theke nicht offen → W0102 je Aufrufstelle, kein Eintrag, Programm läuft weiter", P`
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

  F(T, "K-090/091: Fehlertexte (Art, Dauer-Typ, Dauer-Bereich, bei, farbe, uebergang) – unabhängig vom Fensterzustand; Grenzen 50ms und 5s gültig", P`
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
      aendere([], [{ id: "z1", art: "puls", dauer: 50 }, { id: "z1", art: "funkeln", dauer: 5000 }]), schliesse()],
  }),

  F(T, "K-090/069: Schritte – animiere und schwebe kosten wie ein gewöhnlicher Aufruf (hinweis); Animationen und Änderungen in einer Nachricht", P`
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
      aendere([{ id: "z1", hinweis: "puls" }], [{ id: "z1", art: "puls" }, { art: "schwebe", text: "puls" }]), schliesse()],
  }),

  F(T, "K-090: höchstens 32 Animationen je Nachricht (die ersten bleiben); animiere an einem Takt ist erlaubt", P`
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
      aendere([], [{ id: "z2", art: "puls" }].concat(Array.from({ length: 31 }, (_, i) => ({ art: "schwebe", text: String(i + 1), id: "z1" })))),
      schliesse()],
  }),
];
