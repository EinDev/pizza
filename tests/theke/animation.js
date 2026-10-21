/* Demo der v3-Animationen (K-090 … K-092) für den visuellen Check (tests/theke/visuell.mjs).
 * Drei gleiche Theken nebeneinander (Start · Mitte · Ende); visuell.mjs spielt eine Art in allen drei ab, hält die
 * Animationen an und spult jede Theke auf ihren Zeitpunkt. Die Uhr der Engine (zeitgeber.nach) steht still, bis
 * window.__anim.raeume() sie auslöst – so entfernt kein Timer die Klassen, während fotografiert wird.
 * Thema per ?thema=hell|dunkel. Nur handgeschriebene Protokollnachrichten (kein Interpreter). */
(function () {
  "use strict";
  var thema = /thema=dunkel/.test(location.search) ? "dunkel" : "hell";
  var raster = document.getElementById("anim-raster");
  var wartend = [];
  var zeitgeber = {
    nach: function (fn, ms) { wartend.push(fn); return wartend.length; },
    loescheNach: function (h) { wartend[h - 1] = null; }
  };
  var RAHMEN = ["Start", "Mitte", "Ende"];
  var theken = RAHMEN.map(function (name) {
    var feld = document.createElement("section");
    var kopf = document.createElement("h2");
    kopf.textContent = name;
    var fenster = document.createElement("div");
    fenster.className = "demo-fenster anim-fenster";
    feld.appendChild(kopf);
    feld.appendChild(fenster);
    raster.appendChild(feld);
    return { fenster: fenster, t: PizzaTheke.erzeuge(fenster, { thema: thema, sende: function () {}, zeitgeber: zeitgeber }) };
  });

  function baum() {
    return { v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
      { id: "zaehler", art: "schild", text: "1.234 Pizzen", stil: { schrift: "riesig" } },
      { id: "knoepfe", art: "reihe", kinder: [
        { id: "backen", art: "knopf", text: "Backen!" },
        { id: "lehrling", art: "knopf", text: "Lehrling", stil: { farbe: "basilikum" }, uebergang: true },
        { id: "nachbar", art: "schild", text: "Nachbar" }
      ] },
      { id: "ziel", art: "fortschritt", wert: 0.4, text: "40 % bis zum Steinofen" },
      { id: "erfolg", art: "abschnitt", titel: "Erfolg freigeschaltet", stil: { farbe: "basilikum", abstand: 4 }, kinder: [
        { id: "erfolg-text", art: "schild", text: "Erste Pizza gebacken!" }
      ] },
      { id: "liste", art: "stapel", uebergang: true, stil: { abstand: 6 }, kinder: [
        { id: "z1", art: "schild", text: "Zeile 1 – schon da" }
      ] },
      { id: "fuss", art: "schild", text: "Fußzeile (darf nicht springen)", stil: { schrift: "klein" } }
    ] } };
  }
  var NEUE_ZEILE = { id: "liste", kinder: [{ id: "z1" }, { id: "z2", art: "schild", text: "Zeile 2 – neu", stil: { farbe: "tomate" } }] };

  /** Nachricht je Fall: aenderungen + animationen (wie vom Interpreter gebündelt, K-090). */
  var FAELLE = {
    puls: { animationen: [{ id: "zaehler", art: "puls" }] },
    huepfen: { animationen: [{ id: "backen", art: "huepfen" }] },
    wackeln: { animationen: [{ id: "lehrling", art: "wackeln" }] },
    funkeln: { animationen: [{ id: "zaehler", art: "funkeln" }] },
    einblenden: { aenderungen: [NEUE_ZEILE], animationen: [{ id: "z2", art: "einblenden" }] },
    aufpoppen: { animationen: [{ id: "erfolg", art: "aufpoppen" }] },
    schwebe: { animationen: [
      { art: "schwebe", text: "+12", id: "backen" }, { art: "schwebe", text: "+12", id: "backen" },
      { art: "schwebe", text: "+12", id: "backen" }, { art: "schwebe", text: "+1 Lehrling", id: "zaehler", farbe: "basilikum" },
      { art: "schwebe", text: "Glückstreffer!", farbe: "kruste" }] },
    uebergang: { aenderungen: [{ id: "lehrling", sichtbar: false }, NEUE_ZEILE], animationen: [] }
  };

  window.__anim = {
    faelle: Object.keys(FAELLE),
    /** Frischer Baum in allen drei Theken, dann die Nachricht des Falls. */
    spiele: function (fall) {
      var f = FAELLE[fall];
      document.getElementById("anim-titel").textContent = "v3 – " + fall + " (" + thema + ")";
      theken.forEach(function (x) {
        x.t.empfange({ v: 1, op: "fenster", titel: "Pizza-Imperium" });
        x.t.empfange(baum());
      });
      wartend.length = 0;
      theken.forEach(function (x) {
        x.t.empfange({ v: 1, op: "aendere", aenderungen: f.aenderungen || [], animationen: f.animationen });
      });
    },
    /** Hält alle Animationen an und spult Theke i auf anteile[i] × dauer (dauer = längste Animation). */
    spule: function (anteile) {
      function ende(a) { var t = a.effect.getComputedTiming(); return t.delay + t.activeDuration; }
      theken.forEach(function (x, i) {
        var anims = x.fenster.getAnimations({ subtree: true });
        var dauer = 0;
        anims.forEach(function (a) { dauer = Math.max(dauer, ende(a)); });
        anims.forEach(function (a) {
          a.pause();
          a.currentTime = Math.max(0, Math.min(ende(a) - 1, anteile[i] * dauer));
        });
      });
      return theken.map(function (x) { return x.fenster.getAnimations({ subtree: true }).length; });
    },
    /** Layout-Fingerabdruck: Lage aller Zutaten (offset*, ohne transform) + Scrollmaße. */
    layout: function () {
      return theken.map(function (x) {
        var t = x.fenster.querySelector(".theke");
        var els = [].slice.call(x.fenster.querySelectorAll("[data-theke-id]"));
        return { scroll: [t.scrollWidth, t.scrollHeight], els: els.map(function (e) {
          return e.getAttribute("data-theke-id") + ":" + [e.offsetLeft, e.offsetTop, e.offsetWidth, e.offsetHeight].join(",");
        }) };
      });
    },
    /** Löst die angehaltene Engine-Uhr aus (Klassen/Ebene räumen). */
    raeume: function () {
      var fns = wartend.splice(0, wartend.length);
      fns.forEach(function (fn) { if (fn) fn(); });
    }
  };
})();
