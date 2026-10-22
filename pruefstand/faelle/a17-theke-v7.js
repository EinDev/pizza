"use strict";
// Theke v7 (SPEC §16.10, KLAERUNGEN K-125/K-126): abgeleiteter Zettel `Zettel.aus(fn)` (Bindung ohne Zutat) und Stil `spalten`
// (Spaltengewichte einer Tabelle). Black-Box-Fälle mit vorgegebenen Renderer-Ereignissen und exakter Liste der ui-Nachrichten.
// Erwartungen aus SPEC/KLAERUNGEN.
const { P, F } = require("../lib/helfer");
const T = "§16.10 Theke v7 (K-125, K-126)";

const fenster = (titel, breite = 480, hoehe = 360) => ({ v: 1, op: "fenster", titel, breite, hoehe });
const baum = (wurzel) => ({ v: 1, op: "baum", wurzel });
const aendere = (...aenderungen) => ({ v: 1, op: "aendere", aenderungen });
const schliesse = () => ({ v: 1, op: "schliesse" });
const warnTexte = (code, teile) => (res) => {
  const ist = res.ereignisse.filter((e) => e.typ === "warnung" && e.code === code).map((e) => String(e.text || ""));
  if (ist.length !== teile.length) return `${code}: ${ist.length} Warnungen ${JSON.stringify(ist)}, erwartet ${teile.length}`;
  const falsch = teile.findIndex((t, i) => !ist[i].includes(t));
  return falsch < 0 ? undefined : `${code} Nr. ${falsch + 1}: ${JSON.stringify(ist[falsch])} enthält nicht ${JSON.stringify(teile[falsch])}`;
};

module.exports = [
  F(T, "K-125: Zettel.aus rechnet sofort, danach nur bei Quellenänderung am Synchronisationspunkt; drei Leser teilen eine Rechnung; im Rückruf gilt der letzte Wert", P`
Theke t = neu Theke("A");
Zettel geld = neu Zettel(0);
Zettel stufe = neu Zettel(1);
salami n = 0;
Zettel preis = Zettel.aus(() -> { n = n + 1; serviere (10 * stufe.wert()); });
Bote.sage((preis.wert() + " " + preis + " " + n));
Knopf kauf = neu Knopf("", () -> { geld.setze(geld.wert() - preis.wert()); stufe.setze(stufe.wert() + 1); Bote.sage(("noch " + preis.wert())); }, id: "kauf");
kauf.binde("text", () -> ("Für " + preis.wert()));
kauf.binde("aktiv", () -> geld.wert() >= preis.wert());
Fortschritt f = neu Fortschritt(id: "f");
f.binde("wert", () -> geld.wert() / preis.wert());
Knopf geldK = neu Knopf("+", () -> { geld.setze(geld.wert() + 10); }, id: "g");
t.zeige(neu Stapel([kauf, f, geldK], id: "w"));
t.bediene();
Bote.sage((preis.wert() + " " + n));
`, {
    uiEreignisse: [{ typ: "klick", id: "g" }, { typ: "klick", id: "kauf" }, { typ: "klick", id: "g" }],
    out: ["10 Zettel(10) 1", "noch 10", "20 2"],
    ui: [
      fenster("A"),
      baum({ id: "w", art: "stapel", kinder: [{ id: "kauf", art: "knopf", text: "Für 10", aktiv: false }, { id: "f", art: "fortschritt", wert: 0 }, { id: "g", art: "knopf", text: "+" }] }),
      aendere({ id: "kauf", aktiv: true }, { id: "f", wert: 1 }),
      aendere({ id: "kauf", text: "Für 20", aktiv: false }, { id: "f", wert: 0 }),
      aendere({ id: "f", wert: 0.5 }),
    ],
  }),

  F(T, "K-125: Fehlertexte – setze verboten, keine Funktion (auch karton/fehlend), 'aus' in einer Bindung, unbekannte Methode, W0103", P`
Zettel z = neu Zettel(1);
Zettel d = Zettel.aus(() -> z.wert() * 2);
probier { d.setze(3); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { Zettel.aus(5); } verbrannt (TypAnanas e) { Bote.sage((e.nachricht())); }
probier { Zettel.aus(karton); } verbrannt (TypAnanas e) { Bote.sage((e.nachricht())); }
probier { Zettel.aus(); } verbrannt (TypAnanas e) { Bote.sage((e.nachricht())); }
Schild s = neu Schild(id: "s");
probier { s.binde("text", () -> { Zettel.aus(() -> z.wert()); serviere ("x"); }); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { Zettel.weg(); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
Zettel fest = Zettel.aus(() -> "fest");
Bote.sage((fest.wert() + " " + d.wert()));
`, {
    out: [
      "Der Zettel ist abgeleitet – setze seine Quellen, nicht ihn.",
      "Zettel.aus() braucht eine Funktion, z. B. () -> { … }.",
      "Zettel.aus() braucht eine Funktion, z. B. () -> { … }.",
      "Zettel.aus() braucht eine Funktion, z. B. () -> { … }.",
      "Eine Bindung rechnet nur – 'aus' ist darin nicht erlaubt.",
      "Methode 'weg' gibt es bei Zettel nicht.",
      "fest 2",
    ],
    warnAnzahl: { W0103: 1 },
    check: warnTexte("W0103", ["W0103: Der abgeleitete Zettel liest weder Zettel noch Zutat – er rechnet nur einmal."]),
  }),

  F(T, "K-125: Zyklus unter abgeleiteten Zetteln → nach 100 Durchläufen LaufzeitAnanas aus bediene (fangbar); gleiche Werte geben nichts weiter", P`
Theke t = neu Theke("Z");
Zettel start = neu Zettel(0);
Zettel b = karton;
Zettel a = Zettel.aus(() -> (start.wert() + (b == karton ? 0 : b.wert())));
b = Zettel.aus(() -> (a.wert() + 1));
Zettel gerade = Zettel.aus(() -> start.wert() % 2 == 0);
salami leser = 0;
Schild s = neu Schild(id: "s");
s.binde("text", () -> { leser = leser + 1; serviere ("" + gerade.wert()); });
Knopf k = neu Knopf("k", () -> { start.setze(start.wert() + 2); }, id: "k");
t.zeige(neu Stapel([s, k], id: "w"));
probier { t.bediene(); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
Bote.sage((a.wert() + " " + b.wert() + " " + leser));
`, {
    uiEreignisse: [{ typ: "klick", id: "k" }],
    out: ["Die Bindungen kommen nicht zur Ruhe – ein abgeleiteter Zettel hängt von sich selbst ab.", "300 301 1"],
    ui: [
      fenster("Z"),
      baum({ id: "w", art: "stapel", kinder: [{ id: "s", art: "schild", text: "ja" }, { id: "k", art: "knopf", text: "k" }] }),
      schliesse(),   // die Theke blieb nach der Ananas offen → am Programmende geschlossen (K-061)
    ],
  }),

  F(T, "K-125: eigene Klasse Zettel hat Vorrang vor dem Modul; Zettel.aus nur in der Hauptküche", P`
Zettel z = neu Zettel(3);
Zettel d = Zettel.aus(() -> z.wert() + 1);
probier { Bote.sage(([1].brigade(i -> Zettel.aus(() -> i)))); } verbrannt (KüchenAnanas e) { Bote.sage((e.nachricht())); }
probier { Bote.sage(([1].brigade(i -> d.wert()))); } verbrannt (KüchenAnanas e) { Bote.sage((e.nachricht())); }
Bote.sage((d));
`, {
    out: ["Zettel gibt es nur in der Hauptküche.", "Zettel gibt es nur in der Hauptküche.", "Zettel(4)"],
  }),

  F(T, "K-125: eigene Klasse Zettel – Zettel.aus ist dann die Klasse", P`
klasse Zettel {
    salami w = 0;
    Zettel(salami x) { w = x; }
}
probier { Zettel.aus(() -> 1); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
Bote.sage((neu Zettel(2).w));
`, {
    out: ["Methode 'aus' gibt es in Klasse Zettel nicht.", "2"],
  }),

  F(T, "K-126: stil(\"spalten\", […]) – Blech aus Zahlen > 0, Kopie, elementweise Gleichheit, karton entfernt, bindbar; Erlaubt-Liste endet auf spalten", P`
Theke t = neu Theke("S");
Tabelle tab = neu Tabelle(["", "Erfolg"], [], id: "tab");
Blech<salami> g = [1, 6];
tab.stil("spalten", g);
g.setze(1, 9);
probier { tab.stil("spalten", []); } verbrannt (TypAnanas e) { Bote.sage((e.nachricht())); }
probier { tab.stil("spalten", [2, 0]); } verbrannt (TypAnanas e) { Bote.sage((e.nachricht())); }
probier { tab.stil("spalten", 4); } verbrannt (TypAnanas e) { Bote.sage((e.nachricht())); }
probier { tab.stil("spalte", [1]); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
Zettel breit = neu Zettel(nein);
Tabelle zwei = neu Tabelle(["a", "b"], [], id: "zwei").bindeStil("spalten", () -> (breit.wert() ? [3, 1] : karton));
Knopf k = neu Knopf("k", () -> { tab.stil("spalten", [1, 6]); breit.setze(ja); }, id: "k");
Knopf w = neu Knopf("w", () -> { tab.stil("spalten", karton); tab.stil("spalten", [1, 6.5]); }, id: "w");
t.zeige(neu Stapel([tab, zwei, k, w], id: "st"));
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "k" }, { typ: "klick", id: "w" }],
    out: [
      "Stil 'spalten' braucht ein Blech aus Zahlen > 0, nicht [].",
      "Stil 'spalten' braucht ein Blech aus Zahlen > 0, nicht [2, 0].",
      "Stil 'spalten' braucht ein Blech aus Zahlen > 0, nicht 4.",
      "Stil 'spalte' gibt es nicht. Erlaubt: breite, hoehe, abstand, ausrichtung, schrift, farbe, zeilen, mindestbreite, senkrecht, spalten.",
    ],
    ui: [
      fenster("S"),
      baum({ id: "st", art: "stapel", kinder: [
        { id: "tab", art: "tabelle", spalten: ["", "Erfolg"], zeilen: [], stil: { spalten: [1, 6] } },
        { id: "zwei", art: "tabelle", spalten: ["a", "b"], zeilen: [] },
        { id: "k", art: "knopf", text: "k" }, { id: "w", art: "knopf", text: "w" }] }),
      aendere({ id: "zwei", stil: { spalten: [3, 1] } }),
      aendere({ id: "tab", stil: { spalten: [1, 6.5] } }),
    ],
  }),
];
