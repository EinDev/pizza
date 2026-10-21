// Unit-Tests der Theke-Render-Engine (site/js/theke/theke.js) mit jsdom.
//   cd tests/theke && npm install && node run.js
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const THEKE = path.resolve(__dirname, "..", "..", "site", "js", "theke", "theke.js");

/** Frische Umgebung: eigenes Modul (Registry!) + eigenes DOM, Warnungen werden gesammelt. */
function umgebung(optionen = {}) {
  delete require.cache[THEKE];
  const PizzaTheke = require(THEKE);
  const dom = new JSDOM("<!doctype html><div id=c></div>");
  const doc = dom.window.document;
  const container = doc.getElementById("c");
  const ereignisse = [];
  const warnungen = [];
  const warnAlt = console.warn;
  console.warn = (...a) => warnungen.push(a.map(String).join(" "));
  const t = PizzaTheke.erzeuge(container, { sende: (e) => ereignisse.push(e), ...optionen });
  const ende = () => { console.warn = warnAlt; };
  const $ = (id) => container.querySelector(`[data-theke-id="${id}"]`);
  return { PizzaTheke, dom, win: dom.window, doc, container, t, ereignisse, warnungen, ende, $ };
}
function mitUmgebung(fn, optionen) {
  return () => { const u = umgebung(optionen); try { return fn(u); } finally { u.ende(); } };
}
const BAUM = {
  v: 1, op: "baum",
  wurzel: { id: "z4", art: "stapel", kinder: [
    { id: "z1", art: "schild", text: "Noch nichts bestellt." },
    { id: "z2", art: "eingabe", platzhalter: "Wie viele Pizzen?" },
    { id: "z3", art: "knopf", text: "Backen!" },
    { id: "z5", art: "haken", text: "Extra Käse", an: false },
    { id: "z6", art: "reihe", kinder: [{ id: "z7", art: "schild", text: "a" }] },
  ] },
};
const klon = (x) => JSON.parse(JSON.stringify(x));

test("API-Oberfläche", mitUmgebung(({ PizzaTheke, t }) => {
  assert.equal(PizzaTheke.version, 1);
  for (const f of ["erzeuge", "registriere", "arten"]) assert.equal(typeof PizzaTheke[f], "function");
  for (const f of ["empfange", "zerstoere", "schliessen", "setzeThema"]) assert.equal(typeof t[f], "function");
  assert.deepEqual(PizzaTheke.arten().sort(), ["eingabe", "haken", "knopf", "reihe", "schild", "stapel"]);
}));

test("baum rendert alle v1-Zutaten mit echten Elementen", mitUmgebung(({ t, $ }) => {
  t.empfange(BAUM);
  assert.equal($("z4").className.includes("theke-stapel"), true);
  assert.equal($("z1").textContent, "Noch nichts bestellt.");
  assert.equal($("z2").tagName, "INPUT");
  assert.equal($("z2").placeholder, "Wie viele Pizzen?");
  assert.equal($("z2").getAttribute("aria-label"), "Wie viele Pizzen?");
  assert.equal($("z3").tagName, "BUTTON");
  assert.equal($("z3").type, "button");
  assert.equal($("z5").tagName, "LABEL");
  assert.equal($("z5").querySelector("input[type=checkbox]").checked, false);
  assert.equal($("z5").textContent, "Extra Käse");
  assert.equal($("z6").className.includes("theke-reihe"), true);
  assert.equal($("z7").parentNode, $("z6"));
}));

test("JSON-String wird ebenfalls angenommen", mitUmgebung(({ t, $ }) => {
  t.empfange(JSON.stringify(BAUM));
  assert.equal($("z3").textContent, "Backen!");
}));

test("aendere: text, aktiv, wert, an, sichtbar", mitUmgebung(({ t, $ }) => {
  t.empfange(BAUM);
  t.empfange({ v: 1, op: "aendere", aenderungen: [
    { id: "z1", text: "Macht 16,00 €" }, { id: "z3", aktiv: false }, { id: "z2", wert: "7" },
    { id: "z5", an: true }, { id: "z7", sichtbar: false },
  ] });
  assert.equal($("z1").textContent, "Macht 16,00 €");
  assert.equal($("z3").disabled, true);
  assert.equal($("z2").value, "7");
  assert.equal($("z5").querySelector("input").checked, true);
  assert.equal($("z7").hidden, true);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "z3", aktiv: true }, { id: "z7", sichtbar: true }] });
  assert.equal($("z3").disabled, false);
  assert.equal($("z7").hidden, false);
}));

test("aendere: gleicher wert lässt Eingabe (Cursor) unangetastet", mitUmgebung(({ t, $ }) => {
  t.empfange(BAUM);
  const el = $("z2");
  el.value = "123";
  let gesetzt = 0;
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
  Object.defineProperty(el, "value", { get() { return desc.get.call(this); }, set(v) { gesetzt++; desc.set.call(this, v); }, configurable: true });
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "z2", wert: "123" }] });
  assert.equal(gesetzt, 0);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "z2", wert: "1234" }] });
  assert.equal(gesetzt, 1);
}));

test("Ereignisse: klick, aenderung (Eingabe/Haken), enter", mitUmgebung(({ t, $, win, ereignisse }) => {
  t.empfange(BAUM);
  $("z3").click();
  const ein = $("z2");
  ein.value = "2";
  ein.dispatchEvent(new win.Event("input", { bubbles: true }));
  ein.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ein.dispatchEvent(new win.KeyboardEvent("keydown", { key: "a", bubbles: true }));
  $("z5").querySelector("input").click();
  assert.deepEqual(ereignisse, [
    { typ: "klick", id: "z3" },
    { typ: "aenderung", id: "z2", wert: "2" },
    { typ: "enter", id: "z2", wert: "2" },
    { typ: "aenderung", id: "z5", wert: true },
  ]);
}));

test("deaktivierter Knopf sendet keinen klick", mitUmgebung(({ t, $, win, ereignisse }) => {
  t.empfange(BAUM);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "z3", aktiv: false }] });
  $("z3").click();
  $("z3").dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert.deepEqual(ereignisse, []);
}));

test("unbekannte art → sichtbarer Platzhalter, Kinder werden trotzdem gezeigt", mitUmgebung(({ t, $, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "x", art: "leinwand", breite: 100, kinder: [{ id: "k", art: "knopf", text: "drin" }] },
    { art: "auchneu" },
  ] } });
  const p = $("x");
  assert.ok(p.classList.contains("theke-platzhalter"));
  assert.equal(p.hidden, false);
  assert.match(p.textContent, /Unbekannte Zutat „leinwand“/);
  assert.equal($("k").textContent, "drin");
  assert.ok(p.contains($("k")));
  assert.equal($("w").children.length, 2);
  assert.ok(warnungen.some((w) => /leinwand/.test(w)));
}));

test("kaputte Nachrichten werfen nie", mitUmgebung(({ t, $, warnungen }) => {
  const kaputt = [undefined, null, 42, "", "{kein json", "[]", [], {}, { op: 7 }, { op: "toString" }, { op: "__proto__" },
    { op: "explodiere" }, { op: "baum" }, { op: "baum", wurzel: 5 }, { op: "baum", wurzel: { art: "stapel", kinder: "x" } },
    { op: "aendere" }, { op: "aendere", aenderungen: [null, 5, { text: "ohne id" }, { id: "fehlt", text: "x" }] },
    { op: "fenster", titel: { a: 1 }, breite: "gross" },
    { op: "baum", wurzel: { id: "a", art: "stapel", kinder: [{ id: "a", art: "stapel" }] } },
    { op: "baum", wurzel: { id: "s", art: "schild", stil: "color:red" } },
    { op: "baum", wurzel: { id: "s", art: "schild", stil: { farbe: "lila", breite: "100px", hinterkopf: 1 } } }];
  for (const n of kaputt) assert.doesNotThrow(() => t.empfange(n));
  assert.ok(warnungen.some((w) => /Unbekannte Operation/.test(w)));
  assert.ok(warnungen.some((w) => /enthält sich selbst/.test(w)));
  // Danach funktioniert alles normal weiter
  t.empfange(BAUM);
  assert.equal($("z3").textContent, "Backen!");
}));

test("unbekannte Felder werden ignoriert (einmal gewarnt)", mitUmgebung(({ t, $, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "s", art: "schild", text: "a", glitzer: true } });
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "s", glitzer: false, text: "b" }] });
  assert.equal($("s").textContent, "b");
  assert.equal(warnungen.filter((w) => /schild\.glitzer/.test(w)).length, 1);
}));

test("höhere Protokollversion: Warnung, aber Verarbeitung", mitUmgebung(({ t, $, warnungen }) => {
  t.empfange({ v: 2, op: "baum", wurzel: { id: "s", art: "schild", text: "zukunft" } });
  assert.equal($("s").textContent, "zukunft");
  assert.ok(warnungen.some((w) => /Protokollversion 2/.test(w)));
}));

test("Stil-Whitelist → Klassen/Custom-Properties, nichts anderes", mitUmgebung(({ t, $ }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "s", art: "schild", text: "x",
    stil: { breite: 120, hoehe: "voll", abstand: 8, ausrichtung: "mitte", schrift: "gross", farbe: "basilikum", position: "fixed" } } });
  const el = $("s");
  assert.equal(el.style.getPropertyValue("--theke-breite"), "120px");
  assert.equal(el.style.getPropertyValue("--theke-hoehe"), "100%");
  assert.equal(el.style.getPropertyValue("--theke-abstand"), "8px");
  for (const k of ["theke-hat-breite", "theke-hat-hoehe", "theke-hat-abstand", "theke-ausrichtung-mitte", "theke-schrift-gross", "theke-farbe-basilikum"])
    assert.ok(el.classList.contains(k), k);
  assert.equal(el.style.getPropertyValue("position"), "");
  // Änderung ersetzt die Klasse, null setzt zurück, "normal" entfernt
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "s", stil: { farbe: "tomate", schrift: "normal", breite: null, ausrichtung: "rechts" } }] });
  assert.ok(el.classList.contains("theke-farbe-tomate"));
  assert.ok(!el.classList.contains("theke-farbe-basilikum"));
  assert.ok(!el.classList.contains("theke-schrift-gross"));
  assert.ok(!el.classList.contains("theke-hat-breite"));
  assert.ok(el.classList.contains("theke-ausrichtung-ende"));
  assert.equal(el.style.getPropertyValue("--theke-breite"), "");
  // ungültige Werte werden ignoriert, alter Zustand bleibt
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "s", stil: { farbe: "url(x)", breite: "1px;color:red", abstand: -5 } }] });
  assert.ok(el.classList.contains("theke-farbe-tomate"));
  assert.equal(el.style.getPropertyValue("--theke-abstand"), "0px");
}));

test("Behälter-kinder per aendere: Wiederverwendung nach id, alte werden entfernt", mitUmgebung(({ t, $, ereignisse }) => {
  t.empfange(BAUM);
  const knopf = $("z3");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "z4", kinder: [
    { id: "z3" }, { id: "z8", art: "schild", text: "neu" }, { id: "z1", art: "schild", text: "aktualisiert" },
  ] }] });
  assert.equal($("z3"), knopf, "Element bleibt erhalten (Fokus/Zustand)");
  assert.deepEqual([...$("z4").children].map((c) => c.getAttribute("data-theke-id")), ["z3", "z8", "z1"]);
  assert.equal($("z1").textContent, "aktualisiert");
  assert.equal($("z2"), null);
  // entfernte Zutaten sind abgemeldet: Änderungen an ihnen werden ignoriert
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "z2", wert: "x" }] });
  knopf.click();
  assert.deepEqual(ereignisse, [{ typ: "klick", id: "z3" }]);
  // leeren()
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "z4", kinder: [] }] });
  assert.equal($("z4").children.length, 0);
  assert.equal($("z3"), null);
}));

test("zweiter baum ersetzt den ersten vollständig", mitUmgebung(({ t, $ }) => {
  t.empfange(BAUM);
  t.empfange({ v: 1, op: "baum", wurzel: { id: "n1", art: "schild", text: "neu" } });
  assert.equal($("z1"), null);
  assert.equal($("n1").textContent, "neu");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "z1", text: "weg" }] });
  assert.equal($("z1"), null);
}));

test("fenster: Rückruf mit Titel/Größe, wiederholbar (setzeTitel)", () => {
  const infos = [];
  const u = umgebung({ fenster: (i) => infos.push(i) });
  try {
    u.t.empfange({ v: 1, op: "fenster", titel: "Pizzarechner", breite: 420, hoehe: 320 });
    u.t.empfange({ v: 1, op: "fenster", titel: "Neu" });
    assert.deepEqual(infos, [{ titel: "Pizzarechner", breite: 420, hoehe: 320 }, { titel: "Neu" }]);
    assert.equal(u.t.titel(), "Neu");
    assert.equal(u.t.element.getAttribute("aria-label"), "Neu");
  } finally { u.ende(); }
});

test("schliesse (vom Programm): leert, sendet nichts; schliessen() (Einbettung) sendet genau einmal", () => {
  let zu = 0;
  const u = umgebung({ geschlossen: () => zu++ });
  try {
    u.t.empfange(BAUM);
    u.t.empfange({ v: 1, op: "schliesse" });
    assert.equal(zu, 1);
    assert.equal(u.$("z3"), null);
    assert.deepEqual(u.ereignisse, []);
    u.t.schliessen();
    assert.deepEqual(u.ereignisse, [], "nach schliesse kein geschlossen mehr");

    u.t.empfange(BAUM);           // neu geöffnet
    const knopf = u.$("z3");
    u.t.schliessen();
    u.t.schliessen();
    assert.deepEqual(u.ereignisse, [{ typ: "geschlossen" }]);
    knopf.click();                 // altes Element: keine Ereignisse mehr
    assert.deepEqual(u.ereignisse, [{ typ: "geschlossen" }]);
  } finally { u.ende(); }
});

test("zerstoere räumt auf und macht empfange wirkungslos", mitUmgebung(({ t, container, ereignisse }) => {
  t.empfange(BAUM);
  const knopf = container.querySelector("button");
  t.zerstoere();
  assert.equal(container.children.length, 0);
  knopf.click();
  assert.doesNotThrow(() => t.empfange(BAUM));
  t.schliessen();
  assert.deepEqual(ereignisse, []);
  assert.equal(container.children.length, 0);
}));

test("Thema: hell/dunkel/auto über data-theme", () => {
  for (const [thema, erw] of [["hell", "light"], ["dunkel", "dark"], ["auto", null], [undefined, null]]) {
    const u = umgebung({ thema });
    try {
      assert.equal(u.t.element.getAttribute("data-theme"), erw, String(thema));
      u.t.setzeThema("dunkel");
      assert.equal(u.t.element.getAttribute("data-theme"), "dark");
    } finally { u.ende(); }
  }
});

test("sende-Fehler der Einbettung bricht nichts", () => {
  const u = umgebung({ sende: () => { throw new Error("kaputt"); } });
  try {
    u.t.empfange(BAUM);
    assert.doesNotThrow(() => u.$("z3").click());
    assert.ok(u.warnungen.some((w) => /sende\(\) hat geworfen/.test(w)));
  } finally { u.ende(); }
});

test("Registry: eigene Zutat über dieselbe API (erzeuge/aktualisiere/ctx)", mitUmgebung(({ PizzaTheke, t, $, ereignisse }) => {
  PizzaTheke.registriere("zaehler", {
    felder: ["wert"],
    erzeuge(knoten, ctx) {
      const el = ctx.dokument.createElement("button");
      el.type = "button";
      ctx.bei("click", () => ctx.sende("klick", { wert: Number(el.textContent) }));
      return el;
    },
    aktualisiere(el, felder) { if ("wert" in felder) el.textContent = String(felder.wert); },
  });
  t.empfange({ v: 1, op: "baum", wurzel: { id: "zz", art: "zaehler", wert: 3, stil: { farbe: "kruste" } } });
  assert.equal($("zz").textContent, "3");
  assert.ok($("zz").classList.contains("theke-farbe-kruste"), "Stil gilt auch für eigene Zutaten");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "zz", wert: 4 }] });
  $("zz").click();
  assert.deepEqual(ereignisse, [{ typ: "klick", id: "zz", wert: 4 }]);
  assert.ok(PizzaTheke.arten().includes("zaehler"));
  assert.throws(() => PizzaTheke.registriere("", {}), TypeError);
  assert.throws(() => PizzaTheke.registriere("x", {}), TypeError);
}));

test("Registry: eigener Behälter nutzt ctx.setzeKinder", mitUmgebung(({ PizzaTheke, t, $ }) => {
  PizzaTheke.registriere("raster", {
    felder: ["kinder", "spalten"],
    erzeuge(k, ctx) { const el = ctx.dokument.createElement("div"); el.className = "raster"; return el; },
    aktualisiere(el, f, ctx) { if (f.kinder) ctx.setzeKinder(el, f.kinder); },
  });
  t.empfange({ v: 1, op: "baum", wurzel: { id: "r", art: "raster", spalten: 2, kinder: [
    { id: "a", art: "knopf", text: "A" }, { id: "b", art: "schild", text: "B" }] } });
  assert.equal($("r").children.length, 2);
  assert.equal($("a").parentNode, $("r"));
}));

test("Registry: werfende Zutat → Platzhalter statt Absturz", mitUmgebung(({ PizzaTheke, t, $ }) => {
  PizzaTheke.registriere("bombe", { erzeuge() { throw new Error("bumm"); } });
  PizzaTheke.registriere("halb", { erzeuge(k, ctx) { return ctx.dokument.createElement("div"); }, aktualisiere() { throw new Error("au"); } });
  assert.doesNotThrow(() => t.empfange({ v: 1, op: "baum", wurzel: { id: "s", art: "stapel", kinder: [
    { id: "b", art: "bombe" }, { id: "h", art: "halb" }, { id: "ok", art: "schild", text: "ok" }] } }));
  assert.ok($("b").classList.contains("theke-platzhalter"));
  assert.ok($("h"));
  assert.equal($("ok").textContent, "ok");
}));

test("Text wird nie als HTML interpretiert", mitUmgebung(({ t, $ }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "s", art: "schild", text: "<img src=x onerror=alert(1)>" } });
  assert.equal($("s").children.length, 0);
  assert.equal($("s").textContent, "<img src=x onerror=alert(1)>");
}));
