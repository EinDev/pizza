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
