"use strict";
// Theke-Fälle zu Klärungen, deren Umsetzung noch OFFEN ist (Konvention *-offen.js, ARCHITEKTUR §6).
const { P, F } = require("../lib/helfer");
const O = "§16 Theke – Umsetzung offen";

const fenster = (titel, breite = 480, hoehe = 360) => ({ v: 1, op: "fenster", titel, breite, hoehe });
const baum = (wurzel) => ({ v: 1, op: "baum", wurzel });
const aendere = (...aenderungen) => ({ v: 1, op: "aendere", aenderungen });
const schliesse = () => ({ v: 1, op: "schliesse" });

module.exports = [
  // ── K-084 Takt ───────────────────────────────────────────────────────────
  F(O, "K-084: Takt im Baum (intervall), Schlag ruft fn(anzahl), aktiv(nein) → aendere, Schlag auf inaktiven Takt ignoriert", P`
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
    ui: [fenster("T"), baum({ id: "z3", art: "stapel", kinder: [{ id: "z1", art: "takt", intervall: 1000 }, { id: "z2", art: "knopf", text: "stop" }] }), aendere({ id: "z1", aktiv: false }), schliesse()],
  }),

  F(O, "K-084: Mindestintervall 100ms, Nicht-Dauer → TypAnanas, setzeIntervall sendet aendere, Takt außerhalb des Baums bekommt keinen Schlag", P`
Theke t = neu Theke("T");
probier { Takt f = neu Takt(50ms); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { Takt g = neu Takt(5); } verbrannt (TypAnanas a) { Bote.sage(("typ")); }
Takt u = neu Takt(intervall: 500ms, beiTakt: n -> Bote.sage(("u " + n)));
Takt draussen = neu Takt(1s, n -> Bote.sage(("nie")));
Knopf k = neu Knopf("schneller", () -> { u.setzeIntervall(250ms); });
t.zeige(neu Reihe([u, k]));
t.bediene();
`, {
    uiEreignisse: [{ typ: "takt", id: "z3", anzahl: 2 }, { typ: "takt", id: "z2", anzahl: 1 }, { typ: "klick", id: "z4" }],
    out: ["Ein Takt braucht mindestens 100ms, nicht 50ms.", "typ", "u 1"],
    ui: [fenster("T"), baum({ id: "z5", art: "reihe", kinder: [{ id: "z2", art: "takt", intervall: 500 }, { id: "z4", art: "knopf", text: "schneller" }] }), aendere({ id: "z2", intervall: 250 }), schliesse()],
  }),

  F(O, "K-084/069: Zustellung eines Schlags kostet 0 Schritte (bediene = 3 + Rückruf)", P`
Theke t = neu Theke("T");
Takt u = neu Takt(1s, () -> { });
t.zeige(u);
Bote.sage((Uhr.jetzt()));
t.bediene();
Bote.sage((Uhr.jetzt()));
`, { uiEreignisse: [{ typ: "takt", id: "z1", anzahl: 1 }, { typ: "takt", id: "z1", anzahl: 1 }], out: ["15ms", "23ms"] }),

  // ── K-086 Zutaten v2 ─────────────────────────────────────────────────────
  F(O, "K-086: Fortschritt (geklemmt), Abschnitt, Tabelle (Textform), hinweis, Reiter mit Ereignis", P`
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
      { id: "z5", art: "schild", text: "Erfolge" }] }), schliesse()],
  }),

  F(O, "K-086: schrift riesig erlaubt; Reiter.waehle außerhalb → KeinStückAnanas; Fortschritt NaN → 0", P`
Knopf k = neu Knopf("k");
k.stil("schrift", "riesig");
Reiter r = neu Reiter(["a"], [k]);
probier { r.waehle(2); } verbrannt (KeinStückAnanas a) { Bote.sage(("stück")); }
Fortschritt f = neu Fortschritt(wert: Mathe.wurzel(-1));
Bote.sage((f.wert()));
`, { out: ["stück", "0"] }),

  // ── K-087 Laufzeit ───────────────────────────────────────────────────────
  F(O, "K-087: Schrittlimit gilt je Theke-Rückruf neu (zwei Rückrufe à ~400 Schritte bei Limit 600 laufen durch)", P`
Theke t = neu Theke("L");
Knopf k = neu Knopf("k", () -> { salami i = 0; solange (i < 100) { i++; } Bote.sage(("fertig")); });
t.zeige(k);
t.bediene();
Bote.sage((Uhr.jetzt().inMs() > 600));
`, { uiEreignisse: [{ typ: "klick", id: "z1" }, { typ: "klick", id: "z1" }], schrittLimit: 600, out: ["fertig", "fertig", "ja"] }),

  F(O, "K-087: Uhr.echt() liefert die Wanduhr; im Test fest über optionen.echtzeit", P`
Dauer e = Uhr.echt();
Bote.sage((e.inMs()));
Uhr.vorspulen(1h);
Bote.sage((Uhr.echt().inMs()));
`, { echtzeit: 1700000000000, out: ["1700000000000", "1700000000000"] }),
];
