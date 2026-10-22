"use strict";
// Theke v5 – reaktives Modell (SPEC §16.8, KLAERUNGEN K-116 … K-118): Zettel, binde/bindeStil mit automatischer
// Quellenerfassung, Auswertung an Synchronisationspunkten, nur echte Änderungen (K-117), „eine Bindung rechnet nur“ (K-118).
// Black-Box-Fälle mit vorgegebenen Renderer-Ereignissen und exakter Liste der ui-Nachrichten. Erwartungen aus SPEC/KLAERUNGEN.
const { P, F } = require("../lib/helfer");
const T = "§16.8 Theke v5 Zettel (K-116 …)";

const fenster = (titel, breite = 480, hoehe = 360) => ({ v: 1, op: "fenster", titel, breite, hoehe });
const baum = (wurzel) => ({ v: 1, op: "baum", wurzel });
const aendere = (...aenderungen) => ({ v: 1, op: "aendere", aenderungen });
const schliesse = () => ({ v: 1, op: "schliesse" });
/** Prüft die Texte aller Warnungen eines Codes der Reihe nach (enthält-Vergleich). */
const warnTexte = (code, teile) => (res) => {
  const ist = res.ereignisse.filter((e) => e.typ === "warnung" && e.code === code).map((e) => String(e.text || ""));
  if (ist.length !== teile.length) return `${code}: ${ist.length} Warnungen ${JSON.stringify(ist)}, erwartet ${teile.length}`;
  const falsch = teile.findIndex((t, i) => !ist[i].includes(t));
  return falsch < 0 ? undefined : `${code} Nr. ${falsch + 1}: ${JSON.stringify(ist[falsch])} enthält nicht ${JSON.stringify(teile[falsch])}`;
};

module.exports = [
  F(T, "K-116: Zettel + binde(text/aktiv) – Bindung steht sofort nach binde; Klick ändert den Zettel, Bindungen folgen am Synchronisationspunkt; setze mit gleichem Wert sendet nichts (K-117); inaktiver Knopf ignoriert", P`
Theke t = neu Theke("Zettel");
Zettel geld = neu Zettel(0);
Schild kasse = neu Schild(id: "kasse");
kasse.binde("text", () -> ("Geld: " + geld.wert()));
Knopf backen = neu Knopf("Backen", () -> { geld.setze((geld.wert() + 8)); }, id: "backen");
backen.binde("aktiv", () -> (geld.wert() < 16));
Knopf nix = neu Knopf("Nichts", () -> { geld.setze(geld.wert()); Bote.sage(("nix " + geld)); }, id: "nix");
Bote.sage((kasse.text() + " " + backen.aktiv()));
t.zeige(neu Stapel([kasse, backen, nix]));
t.bediene();
Bote.sage((kasse.text() + " " + backen.aktiv() + " " + geld));
`, {
    uiEreignisse: [{ typ: "klick", id: "backen" }, { typ: "klick", id: "nix" }, { typ: "klick", id: "backen" }, { typ: "klick", id: "backen" }],
    out: ["Geld: 0 ja", "nix Zettel(8)", "Geld: 16 nein Zettel(16)"],
    ui: [
      fenster("Zettel"),
      baum({ id: "z1", art: "stapel", kinder: [{ id: "kasse", art: "schild", text: "Geld: 0" }, { id: "backen", art: "knopf", text: "Backen" }, { id: "nix", art: "knopf", text: "Nichts" }] }),
      aendere({ id: "kasse", text: "Geld: 8" }),
      aendere({ id: "kasse", text: "Geld: 16" }, { id: "backen", aktiv: false }),
    ],
  }),

  F(T, "K-116: Zutat-Getter als Quellen – Eingabe.wert()/Haken.an() treiben Schild.text ohne beiAenderung; Renderer-Werte werden nicht zurückgesendet; gleiches Ereignis/gleiches Bindungsergebnis ändert nichts; der Gast darf eine gebundene Eingabe überschreiben", P`
Theke t = neu Theke("Q");
Eingabe anzahl = neu Eingabe(wert: "1", id: "anzahl");
Haken doppelt = neu Haken("doppelt", id: "doppelt");
Schild preis = neu Schild(id: "preis");
preis.binde("text", () -> { salami n = anzahl.wert().alsZahl(); falls (doppelt.an()) { n = n * 2; } serviere ((n * 8) + " €"); });
Eingabe spiegel = neu Eingabe(id: "spiegel");
spiegel.binde("wert", () -> anzahl.wert());
t.zeige(neu Stapel([anzahl, doppelt, preis, spiegel]));
t.bediene();
Bote.sage((preis.text() + " | " + spiegel.wert()));
`, {
    uiEreignisse: [
      { typ: "aenderung", id: "anzahl", wert: "3" }, { typ: "aenderung", id: "doppelt", wert: true }, { typ: "aenderung", id: "anzahl", wert: "3" },
      { typ: "aenderung", id: "spiegel", wert: "7" }, { typ: "aenderung", id: "anzahl", wert: "2" }, { typ: "enter", id: "anzahl", wert: "2" },
    ],
    out: ["32 € | 2"],
    ui: [
      fenster("Q"),
      baum({ id: "z1", art: "stapel", kinder: [{ id: "anzahl", art: "eingabe", wert: "1" }, { id: "doppelt", art: "haken", text: "doppelt", an: false }, { id: "preis", art: "schild", text: "8 €" }, { id: "spiegel", art: "eingabe", wert: "1" }] }),
      aendere({ id: "preis", text: "24 €" }, { id: "spiegel", wert: "3" }),
      aendere({ id: "preis", text: "48 €" }),
      aendere({ id: "preis", text: "32 €" }, { id: "spiegel", wert: "2" }),
    ],
  }),

  F(T, "K-116: bedingter Lesezugriff – Quellen werden bei jeder Auswertung neu erfasst; Änderungen der gerade nicht gelesenen Quelle lösen nichts aus", P`
Theke t = neu Theke("B");
Zettel modus = neu Zettel(ja);
Zettel a = neu Zettel("A");
Zettel b = neu Zettel("B");
Schild s = neu Schild(id: "s");
s.binde("text", () -> { falls (modus.wert()) { serviere (a.wert()); } serviere (b.wert()); });
Knopf ka = neu Knopf("a", () -> { a.setze((a.wert() + "+")); }, id: "ka");
Knopf kb = neu Knopf("b", () -> { b.setze((b.wert() + "+")); }, id: "kb");
Knopf km = neu Knopf("m", () -> { modus.setze(!modus.wert()); }, id: "km");
t.zeige(neu Stapel([s, ka, kb, km]));
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "kb" }, { typ: "klick", id: "ka" }, { typ: "klick", id: "km" }, { typ: "klick", id: "ka" }, { typ: "klick", id: "kb" }],
    ui: [
      fenster("B"),
      baum({ id: "z1", art: "stapel", kinder: [{ id: "s", art: "schild", text: "A" }, { id: "ka", art: "knopf", text: "a" }, { id: "kb", art: "knopf", text: "b" }, { id: "km", art: "knopf", text: "m" }] }),
      aendere({ id: "s", text: "A+" }),
      aendere({ id: "s", text: "B+" }),
      aendere({ id: "s", text: "B++" }),
    ],
  }),

  F(T, "K-116: Kette in umgekehrter Registrierungsreihenfolge (a liest b, b liest Zettel) konvergiert in zwei Durchläufen zu einer Nachricht (b vor a); binde wertet nur die neue Bindung sofort aus, Abhängige folgen am Synchronisationspunkt (zeige)", P`
Theke t = neu Theke("K");
Zettel z = neu Zettel(1);
Schild b = neu Schild(id: "b");
Schild a = neu Schild(id: "a");
a.binde("text", () -> ("A[" + b.text() + "]"));
b.binde("text", () -> ("B=" + z.wert()));
Bote.sage(a.text());
Knopf k = neu Knopf("+", () -> { z.setze((z.wert() + 1)); }, id: "k");
t.zeige(neu Stapel([a, b, k]));
Bote.sage(a.text());
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "k" }],
    out: ["A[]", "A[B=1]"],
    ui: [
      fenster("K"),
      baum({ id: "z1", art: "stapel", kinder: [{ id: "a", art: "schild", text: "A[B=1]" }, { id: "b", art: "schild", text: "B=1" }, { id: "k", art: "knopf", text: "+" }] }),
      aendere({ id: "b", text: "B=2" }, { id: "a", text: "A[B=2]" }),
    ],
  }),

  F(T, "K-116/K-118/K-119: Zyklus (a = b+z, b = a+1) → nach 100 Durchläufen LaufzeitAnanas mit der ersten schmutzigen Bindung, fangbar aus zeige(); danach sind alle Bindungen sauber (nächster Synchronisationspunkt wirft nicht, Programm läuft weiter); eine Quellenänderung löst den Zyklus erneut aus – der gefüllte Puffer geht vor der Ananas hinaus", P`
Theke t = neu Theke("Z");
Zettel z = neu Zettel(1);
Schild a = neu Schild("0", id: "a");
Schild b = neu Schild("0", id: "b");
a.binde("text", () -> ("" + (b.text().alsZahl() + z.wert())));
b.binde("text", () -> ("" + (a.text().alsZahl() + 1)));
Bote.sage((a.text() + " " + b.text()));
Stapel st = neu Stapel([a, b]);
probier { t.zeige(st); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
t.zeige(st);
Bote.sage((a.text() + " " + b.text()));
z.setze(2);
probier { t.setzeTitel("Sync"); } verbrannt (LaufzeitAnanas e) { Bote.sage(("erneut: " + e.nachricht())); }
Bote.sage((a.text() + " " + b.text() + " " + t.titel()));
`, {
    uiEreignisse: [],
    out: [
      "1 2",
      "Die Bindungen kommen nicht zur Ruhe – 'text' von Schild(a) hängt von sich selbst ab.",
      "201 202",
      "erneut: Die Bindungen kommen nicht zur Ruhe – 'text' von Schild(a) hängt von sich selbst ab.",
      "501 502 Sync",
    ],
    // nach der zweiten Ananas sendet setzeTitel kein fenster mehr; am Programmende wirft uiEnde nicht erneut → schliesse
    ui: [fenster("Z"), baum({ id: "z1", art: "stapel", kinder: [{ id: "a", art: "schild", text: "201" }, { id: "b", art: "schild", text: "202" }] }), aendere({ id: "a", text: "501" }, { id: "b", text: "502" }), schliesse()],
  }),

  F(T, "K-116: Ein Schreiber – Setter auf gebundene Eigenschaft/gebundenen Stil werfen LaufzeitAnanas; andere Eigenschaften bleiben setzbar; binde(…, karton) löst und gibt den Setter frei", P`
Theke t = neu Theke("G");
Zettel z = neu Zettel("x");
Schild s = neu Schild(id: "s");
s.binde("text", () -> z.wert());
s.bindeStil("farbe", () -> { falls (z.wert() == "x") { serviere ("tomate"); } serviere ("kruste"); });
Knopf k = neu Knopf("k", id: "k");
k.binde("aktiv", () -> (z.wert() == "x"));
Auswahl w = neu Auswahl(["a", "b"], id: "w");
w.binde("gewaehlt", () -> (z.wert().länge() + 1));
probier { s.setzeText("neu"); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { s.stil("farbe", "kruste"); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { k.aktiv(nein); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { w.waehle(1); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
s.stil("schrift", "gross");
k.setzeText("frei");
s.binde("text", karton);
s.setzeText("frei");
t.zeige(neu Stapel([s, k, w]));
`, {
    uiEreignisse: [],
    out: [
      "'text' von Schild(s) ist gebunden – setze den Zettel, nicht die Zutat.",
      "Stil 'farbe' von Schild(s) ist gebunden – setze den Zettel, nicht die Zutat.",
      "'aktiv' von Knopf(k) ist gebunden – setze den Zettel, nicht die Zutat.",
      "'gewaehlt' von Auswahl(w) ist gebunden – setze den Zettel, nicht die Zutat.",
    ],
    noWarn: ["W0103"],
    ui: [fenster("G"), baum({ id: "z1", art: "stapel", kinder: [{ id: "s", art: "schild", text: "frei", stil: { farbe: "tomate", schrift: "gross" } }, { id: "k", art: "knopf", text: "frei" }, { id: "w", art: "auswahl", optionen: ["a", "b"], gewaehlt: 2 }] }), schliesse()],
  }),

  F(T, "K-118: Eine Bindung rechnet nur – Setter, hinzu, binde, Theke-Methoden, Zettel.setze werfen im Ausdruck (Name wie gerufen); überladene Getter ohne Argument, Konstruktoren und Bote sind erlaubt; die Ananas verlässt binde() bzw. bediene(), die Theke bleibt offen, die werfende Bindung bleibt sauber", P`
Theke t = neu Theke("R");
Zettel z = neu Zettel(1);
Schild s = neu Schild(id: "s");
Knopf k = neu Knopf("k", () -> { z.setze((z.wert() + 1)); }, id: "k");
Stapel st = neu Stapel([s, k]);
probier { s.binde("text", () -> { s.setzeText("x"); serviere ("y"); }); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { s.binde("text", () -> { k.aktiv(nein); serviere ("y"); }); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { s.binde("text", () -> { st.hinzu(neu Schild("n")); serviere ("y"); }); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { s.binde("text", () -> { t.schliesse(); serviere ("y"); }); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
s.binde("text", () -> { Schild tmp = neu Schild("tmp"); serviere ("z=" + z.wert() + " " + k.aktiv() + " " + tmp.text()); });
Schild w = neu Schild(id: "w");
w.binde("text", () -> { falls (z.wert() == 3) { z.setze(0); } serviere ("w" + z.wert()); });
st.hinzu(w);
t.zeige(st);
probier { t.bediene(); } verbrannt (LaufzeitAnanas e) { Bote.sage(("bediene: " + e.nachricht())); }
Bote.sage((s.text() + " | " + w.text()));
t.bediene();
Bote.sage((s.text() + " | " + w.text()));
`, {
    uiEreignisse: [{ typ: "klick", id: "k" }, { typ: "klick", id: "k" }, { typ: "klick", id: "k" }],
    out: [
      "Eine Bindung rechnet nur – 'setzeText' ist darin nicht erlaubt.",
      "Eine Bindung rechnet nur – 'aktiv' ist darin nicht erlaubt.",
      "Eine Bindung rechnet nur – 'hinzu' ist darin nicht erlaubt.",
      "Eine Bindung rechnet nur – 'schliesse' ist darin nicht erlaubt.",
      "bediene: Eine Bindung rechnet nur – 'setze' ist darin nicht erlaubt.",
      "z=3 ja tmp | w2",
      "z=4 ja tmp | w4",
    ],
    ui: [
      fenster("R"),
      baum({ id: "z1", art: "stapel", kinder: [{ id: "s", art: "schild", text: "z=1 ja tmp" }, { id: "k", art: "knopf", text: "k" }, { id: "w", art: "schild", text: "w1" }] }),
      aendere({ id: "s", text: "z=2 ja tmp" }, { id: "w", text: "w2" }),
      // z = 3: s ist schon neu gerechnet, w wirft – der Puffer geht wie bei einer Rückruf-Ananas vor dem Verlassen von bediene() hinaus (K-119)
      aendere({ id: "s", text: "z=3 ja tmp" }),
      aendere({ id: "s", text: "z=4 ja tmp" }, { id: "w", text: "w4" }),
    ],
  }),

  F(T, "K-118: W0103 je Aufrufstelle – eine Bindung ohne Zettel-/Zutat-Quelle rechnet nur einmal (Schleife: eine Warnung); Stil-Variante; Ausweg Taktgeber-Zettel", P`
Theke t = neu Theke("W");
salami zaehler = 0;
Schild s = neu Schild(id: "s");
für (salami i : [1, 2]) { s.binde("text", () -> ("Stand " + zaehler)); }
s.bindeStil("farbe", () -> "tomate");
Zettel takt = neu Zettel(0);
Schild ok = neu Schild(id: "ok");
ok.binde("text", () -> { takt.wert(); serviere ("Stand " + zaehler); });
Knopf k = neu Knopf("k", () -> { zaehler += 1; takt.setze((takt.wert() + 1)); }, id: "k");
t.zeige(neu Stapel([s, ok, k]));
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "k" }, { typ: "klick", id: "k" }],
    warnAnzahl: { W0103: 2 },
    check: warnTexte("W0103", [
      "W0103: Die Bindung 'text' von Schild(s) liest weder Zettel noch Zutat – sie rechnet nur einmal.",
      "W0103: Die Bindung Stil 'farbe' von Schild(s) liest weder Zettel noch Zutat – sie rechnet nur einmal.",
    ]),
    ui: [
      fenster("W"),
      baum({ id: "z1", art: "stapel", kinder: [{ id: "s", art: "schild", text: "Stand 0", stil: { farbe: "tomate" } }, { id: "ok", art: "schild", text: "Stand 0" }, { id: "k", art: "knopf", text: "k" }] }),
      aendere({ id: "ok", text: "Stand 1" }),
      aendere({ id: "ok", text: "Stand 2" }),
    ],
  }),

  F(T, "K-116/K-117: bindeStil – karton entfernt den Stil (null in der Nachricht), gleicher Stilwert sendet nichts, Stil-Whitelist und Wertprüfung wie stil(); bindeStil ohne Funktion → TypAnanas", P`
Theke t = neu Theke("S");
Zettel warm = neu Zettel(nein);
Zettel breite = neu Zettel(100);
Schild s = neu Schild("s", id: "s");
s.bindeStil("farbe", () -> { falls (warm.wert()) { serviere ("tomate"); } serviere (karton); });
s.bindeStil("breite", () -> breite.wert());
s.stil("schrift", "gross");
Knopf an = neu Knopf("an", () -> { warm.setze(ja); }, id: "an");
Knopf aus = neu Knopf("aus", () -> { warm.setze(nein); }, id: "aus");
Knopf gleich = neu Knopf("gleich", () -> { breite.setze((breite.wert() + 0)); }, id: "gleich");
Knopf schmal = neu Knopf("schmal", () -> { breite.setze(50); }, id: "schmal");
probier { s.bindeStil("rand", () -> 1); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { s.bindeStil("ausrichtung", () -> "oben"); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { s.bindeStil("hoehe", 5); } verbrannt (TypAnanas e) { Bote.sage((e.nachricht())); }
t.zeige(neu Stapel([s, an, aus, gleich, schmal]));
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "an" }, { typ: "klick", id: "an" }, { typ: "klick", id: "gleich" }, { typ: "klick", id: "aus" }, { typ: "klick", id: "aus" }, { typ: "klick", id: "schmal" }],
    out: [
      "Stil 'rand' gibt es nicht. Erlaubt: breite, hoehe, abstand, ausrichtung, schrift, farbe, zeilen, mindestbreite, senkrecht.",
      "Wert 'oben' ist für Stil 'ausrichtung' nicht erlaubt. Erlaubt: links, mitte, rechts.",
      "bindeStil() braucht eine Funktion, z. B. () -> { … }.",
    ],
    // die werfende Stil-Bindung ohne Quelle bleibt registriert (W0103), rechnet aber nie wieder
    warnAnzahl: { W0103: 1 },
    ui: [
      fenster("S"),
      baum({ id: "z1", art: "stapel", kinder: [{ id: "s", art: "schild", text: "s", stil: { breite: 100, schrift: "gross" } }, { id: "an", art: "knopf", text: "an" }, { id: "aus", art: "knopf", text: "aus" }, { id: "gleich", art: "knopf", text: "gleich" }, { id: "schmal", art: "knopf", text: "schmal" }] }),
      aendere({ id: "s", stil: { breite: 100, schrift: "gross", farbe: "tomate" } }),
      aendere({ id: "s", stil: { breite: 100, schrift: "gross", farbe: null } }),
      aendere({ id: "s", stil: { breite: 50, schrift: "gross" } }),
    ],
  }),

  F(T, "K-117: nur echte Änderungen – gleiche Setter (Text, diavolo, Zahl nach Klemmen/Rundung, Listen, stil, stil(k, karton) für fehlenden Schlüssel, leeren eines leeren Behälters) senden nichts; Renderer-Ereignis mit gleichem Wert ändert nichts (Rückruf läuft); a → b → a sendet a; Position = erste echte Änderung", P`
Theke t = neu Theke("E");
Schild s = neu Schild("hallo", id: "s");
Knopf k = neu Knopf("k", id: "k");
Haken h = neu Haken("h", an: ja, id: "h");
h.beiAenderung(a -> Bote.sage(("haken " + a)));
Fortschritt f = neu Fortschritt(1, id: "f");
Takt u = neu Takt(1s, id: "u");
Tabelle tb = neu Tabelle(["a", "b"], [[1, 2]], id: "tb");
Auswahl w = neu Auswahl(["x", "y"], id: "w");
Stapel ohne = neu Stapel(id: "ohne");
Reihe voll = neu Reihe([neu Schild("kind", id: "kind")], id: "voll");
s.stil("farbe", "tomate");
Knopf gleich = neu Knopf("gleich", () -> {
    s.setzeText("hallo"); k.aktiv(ja); h.setzeAn(ja); f.setzeWert(1.5); u.setzeIntervall(1000ms);
    tb.setzeSpalten(["a", "b"]); tb.setzeZeilen([[1, 2]]); w.waehle(1); w.setzeOptionen(["x", "y"]);
    s.stil("farbe", "tomate"); s.stil("breite", karton); s.sichtbar(ja); s.hinweis(karton); ohne.leeren();
    Bote.sage("gleich");
}, id: "gleich");
Knopf hin = neu Knopf("hin", () -> {
    k.setzeText("k"); s.setzeText("anders"); s.setzeText("hallo"); f.setzeWert(0.2); f.setzeWert(1);
    s.stil("farbe", "kruste"); s.stil("farbe", "tomate"); voll.leeren(); ohne.hinzu(neu Schild("neu", id: "neu"));
}, id: "hin");
t.zeige(neu Stapel([s, k, h, f, u, tb, w, ohne, voll, gleich, hin]));
t.bediene();
`, {
    uiEreignisse: [{ typ: "klick", id: "gleich" }, { typ: "aenderung", id: "h", wert: true }, { typ: "klick", id: "hin" }],
    out: ["gleich", "haken ja"],
    ui: [
      fenster("E"),
      baum({ id: "z1", art: "stapel", kinder: [
        { id: "s", art: "schild", text: "hallo", stil: { farbe: "tomate" } }, { id: "k", art: "knopf", text: "k" }, { id: "h", art: "haken", text: "h", an: true },
        { id: "f", art: "fortschritt", wert: 1 }, { id: "u", art: "takt", intervall: 1000 }, { id: "tb", art: "tabelle", spalten: ["a", "b"], zeilen: [["1", "2"]] },
        { id: "w", art: "auswahl", optionen: ["x", "y"], gewaehlt: 1 }, { id: "ohne", art: "stapel", kinder: [] },
        { id: "voll", art: "reihe", kinder: [{ id: "kind", art: "schild", text: "kind" }] }, { id: "gleich", art: "knopf", text: "gleich" }, { id: "hin", art: "knopf", text: "hin" },
      ] }),
      aendere({ id: "s", text: "hallo", stil: { farbe: "tomate" } }, { id: "f", wert: 1 }, { id: "voll", kinder: [] }, { id: "ohne", kinder: [{ id: "neu", art: "schild", text: "neu" }] }),
    ],
  }),

  F(T, "K-116: Zettel und Bindung ohne Theke bzw. an nicht gezeigter Zutat – Auswertung erst am Synchronisationspunkt, keine Nachricht für nicht Gezeigtes; hinzu zeigt den Zustand beim Senden (K-115)", P`
Zettel z = neu Zettel(1);
Schild s = neu Schild(id: "s");
s.binde("text", () -> ("z=" + z.wert()));
z.setze(2);
Bote.sage((s.text() + " " + z));
Theke t = neu Theke("N");
Stapel st = neu Stapel(id: "st");
Knopf k = neu Knopf("k", () -> { z.setze((z.wert() + 1)); }, id: "k");
Knopf zeig = neu Knopf("zeig", () -> { st.hinzu(s); }, id: "zeig");
st.hinzu(k);
st.hinzu(zeig);
t.zeige(st);
Bote.sage(s.text());
t.bediene();
Bote.sage(s.text());
`, {
    uiEreignisse: [{ typ: "klick", id: "k" }, { typ: "klick", id: "zeig" }, { typ: "klick", id: "k" }],
    out: ["z=1 Zettel(2)", "z=2", "z=4"],
    ui: [
      fenster("N"),
      baum({ id: "st", art: "stapel", kinder: [{ id: "k", art: "knopf", text: "k" }, { id: "zeig", art: "knopf", text: "zeig" }] }),
      aendere({ id: "st", kinder: [{ id: "k", art: "knopf", text: "k" }, { id: "zeig", art: "knopf", text: "zeig" }, { id: "s", art: "schild", text: "z=3" }] }),
      aendere({ id: "s", text: "z=4" }),
    ],
  }),

  F(T, "K-116: Zettel – Textform Zettel(<Wert>), Typname/Typprüfung, setze-Gleichheit wie == (Blech nach Identität, Dauer nach ms), unbindbare Eigenschaft und binde ohne Funktion → Fehlertexte, Küchenbrigade nur Hauptküche", P`
Zettel a = neu Zettel(5);
Bote.sage((a + " " + neu Zettel() + " " + neu Zettel("x") + " " + a.setze(7).wert()));
probier { Zettel falsch = 5; } verbrannt (TypAnanas e) { Bote.sage((e.nachricht())); }
Theke t = neu Theke("T");
Zettel b = neu Zettel([1, 2]);
Zettel d = neu Zettel(1s);
salami laeufe = 0;
Schild s = neu Schild(id: "s");
s.binde("text", () -> { laeufe += 1; serviere (b.wert() + " " + d.wert()); });
probier { s.binde("farbe", () -> "x"); } verbrannt (LaufzeitAnanas e) { Bote.sage((e.nachricht())); }
probier { s.binde("text", 5); } verbrannt (TypAnanas e) { Bote.sage((e.nachricht())); }
Blech<salami> liste = b.wert();
t.zeige(s);
liste.hinzu(3);
b.setze(liste);
d.setze(1000ms);
t.setzeTitel("Sync 1");
Bote.sage(("Läufe: " + laeufe));
b.setze(liste.kopie());
d.setze(2s);
t.setzeTitel("Sync 2");
Bote.sage(("Läufe: " + laeufe + " " + s.text()));
probier { [1].brigade(x -> { Zettel q = neu Zettel(x); serviere (x); }); } verbrannt (KüchenAnanas e) { Bote.sage((e.nachricht())); }
probier { [1].brigade(x -> { serviere (a.wert()); }); } verbrannt (KüchenAnanas e) { Bote.sage((e.nachricht())); }
`, {
    uiEreignisse: [],
    out: [
      "Zettel(5) Zettel(karton) Zettel(x) 7",
      "'falsch' ist Zettel, aber der Wert 5 ist kein(e) Zettel.",
      "'farbe' lässt sich an Schild(s) nicht binden. Bindbar: text, sichtbar, hinweis, marke.",
      "binde() braucht eine Funktion, z. B. () -> { … }.",
      "Läufe: 1",
      "Läufe: 2 [1, 2, 3] 2s",
      "Zettel gibt es nur in der Hauptküche.",
      "Zettel gibt es nur in der Hauptküche.",
    ],
    ui: [fenster("T"), baum({ id: "s", art: "schild", text: "[1, 2] 1s" }), fenster("Sync 1"), aendere({ id: "s", text: "[1, 2, 3] 2s" }), fenster("Sync 2"), schliesse()],
  }),

  F(T, "K-116: erbt Zettel → PizzaFehler P0010 (eingebaute Klasse, nicht erweiterbar)", P`
klasse MeinZettel erbt Zettel { }
`, { exit: 2, fehler: { code: "P0010", art: "pizzafehler" } }),

  F(T, "K-116: eigene Klasse Zettel hat Vorrang vor der eingebauten", P`
klasse Zettel { salami x = 7; }
Zettel z = neu Zettel();
Bote.sage((z.x));
`, { out: ["7"] }),
];
