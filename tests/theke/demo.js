/* Demo aller v1-Zutaten in hell und dunkel (für den visuellen Check, tests/theke/visuell.mjs). */
(function () {
  "use strict";
  var protokoll = document.getElementById("protokoll");
  function baum() {
    return {
      v: 1, op: "baum",
      wurzel: { id: "wurzel", art: "stapel", kinder: [
        { id: "titel", art: "schild", text: "Pizzarechner", stil: { schrift: "gross" } },
        { id: "info", art: "schild", text: "Wie viele Pizzen sollen in den Ofen?", stil: { schrift: "klein" } },
        { id: "anzahl", art: "eingabe", wert: "", platzhalter: "Wie viele Pizzen?" },
        { id: "zeile", art: "reihe", kinder: [
          { id: "backen", art: "knopf", text: "Backen!" },
          { id: "gruen", art: "knopf", text: "Basilikum", stil: { farbe: "basilikum" } },
          { id: "kruste", art: "knopf", text: "Kruste", stil: { farbe: "kruste" } },
          { id: "mozz", art: "knopf", text: "Mozzarella", stil: { farbe: "mozzarella" } },
          { id: "aus", art: "knopf", text: "Aus", aktiv: false }
        ] },
        { id: "extra", art: "haken", text: "Extra Käse", an: true },
        { id: "scharf", art: "haken", text: "Scharf (nicht verfügbar)", an: false, aktiv: false },
        { id: "karte", art: "stapel", stil: { farbe: "mozzarella", abstand: 6 }, kinder: [
          { id: "preis", art: "schild", text: "Macht 16,00 €", stil: { schrift: "gross", farbe: "tomate" } },
          { id: "hinweis", art: "schild", text: "inkl. Liebe & Oregano", stil: { schrift: "klein", farbe: "basilikum" } },
          { id: "code", art: "schild", text: "bestellung #0042", stil: { schrift: "mono", farbe: "kruste" } }
        ] },
        { id: "unten", art: "reihe", stil: { ausrichtung: "ende" }, kinder: [
          { id: "fest", art: "eingabe", wert: "feste Breite", stil: { breite: 140 } },
          { id: "ok", art: "knopf", text: "OK", stil: { breite: 90 } }
        ] },
        { id: "neu", art: "leinwand", breite: 200, kinder: [
          { id: "lw-schild", art: "schild", text: "Kinder einer unbekannten Zutat werden trotzdem gezeigt." }
        ] }
      ] }
    };
  }
  window.__theken = {};
  window.__ereignisse = [];
  [["hell", "hell"], ["dunkel", "dunkel"]].forEach(function (p) {
    var t = PizzaTheke.erzeuge(document.getElementById(p[0]), {
      thema: p[1],
      sende: function (e) {
        window.__ereignisse.push(e);
        protokoll.textContent += p[0] + ": " + JSON.stringify(e) + "\n";
      }
    });
    t.empfange({ v: 1, op: "fenster", titel: "Pizzarechner", breite: 420, hoehe: 320 });
    t.empfange(baum());
    window.__theken[p[0]] = t;
  });
})();

/* Demo der v2-Zutaten (THEKE-ERWEITERUNGEN.md): ein winziges „Programm“ reagiert auf takt/aenderung wie die Laufzeit. */
(function () {
  "use strict";
  var protokoll = document.getElementById("protokoll");
  function format(n) { return n.toFixed(1).replace(".", ","); }
  function baum(seite) {
    return {
      v: 1, op: "baum",
      wurzel: { id: "wurzel", art: "stapel", kinder: [
        { id: "uhr", art: "takt", intervall: 500 },
        { id: "zaehler", art: "schild", text: "0,0", stil: { schrift: "riesig" }, hinweis: "Gebackene Pizzen" },
        { id: "rate", art: "schild", text: "2,0 Pizzen pro Sekunde", stil: { schrift: "klein" } },
        { id: "ziel", art: "fortschritt", wert: 0.37, text: "37 % bis zum Steinofen" },
        { id: "reiter", art: "reiter", titel: ["Backstube", "Statistik", ""], gewaehlt: seite, kinder: [
          { id: "backstube", art: "stapel", stil: { abstand: 12 }, kinder: [
            { id: "upgrades", art: "abschnitt", titel: "Upgrades", kinder: [
              { id: "lehrling", art: "reihe", kinder: [
                { id: "kauf-lehrling", art: "knopf", text: "Lehrling – 15 €", hinweis: "Backt 0,1 Pizzen pro Sekunde" },
                { id: "f-lehrling", art: "fortschritt", wert: 0.8, stil: { farbe: "basilikum" } }
              ] },
              { id: "ofen", art: "reihe", kinder: [
                { id: "kauf-ofen", art: "knopf", text: "Steinofen – 1,2 Tsd. €", aktiv: false, hinweis: "Noch zu teuer" },
                { id: "f-ofen", art: "fortschritt", wert: 0.12, stil: { farbe: "kruste" } }
              ] }
            ] },
            { id: "erfolg", art: "abschnitt", titel: "Erfolg freigeschaltet", stil: { farbe: "basilikum", abstand: 4 }, kinder: [
              { id: "erfolg-text", art: "schild", text: "Erste Pizza gebacken!" },
              { id: "erfolg-klein", art: "schild", text: "+5 % Trinkgeld", stil: { schrift: "klein" } }
            ] }
          ] },
          { id: "statistik", art: "tabelle", spalten: ["Gebäude", "Anzahl", "Pizzen/s", "Umsatz"], zeilen: [
            ["Lehrling", "3", "0,3", "1.234,5 €"],
            ["Steinofen", "1", "1,2", "8,00 €"],
            ["Pizzaroboter", "12", "1,2 Tsd.", "1,2 Mio. €"],
            ["Franchise", "0", "–", "–"]
          ] },
          { id: "leer", art: "tabelle", spalten: ["Erfolg", "Datum"], zeilen: [] }
        ] }
      ] }
    };
  }
  window.__theken2 = {};
  window.__ereignisse2 = [];
  [["hell2", "hell", 1], ["dunkel2", "dunkel", 2]].forEach(function (p) {
    var pizzen = 0, t;
    t = PizzaTheke.erzeuge(document.getElementById(p[0]), {
      thema: p[1],
      sende: function (e) {
        window.__ereignisse2.push(e);
        if (e.typ !== "takt") protokoll.textContent += p[0] + ": " + JSON.stringify(e) + "\n";
        if (e.typ === "takt" && e.id === "uhr") {
          pizzen += e.anzahl;
          var w = Math.min(1, 0.37 + pizzen / 100);
          t.empfange({ v: 1, op: "aendere", aenderungen: [
            { id: "zaehler", text: format(pizzen) },
            { id: "ziel", wert: w, text: Math.round(w * 100) + " % bis zum Steinofen" }] });
        }
        if (e.typ === "aenderung" && e.id === "reiter") t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "reiter", gewaehlt: e.wert }] });
      }
    });
    t.empfange({ v: 1, op: "fenster", titel: "Pizza-Imperium" });
    t.empfange(baum(p[2]));
    window.__theken2[p[0]] = t;
  });
})();
