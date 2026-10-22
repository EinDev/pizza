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
  assert.deepEqual(PizzaTheke.arten().sort(), ["abschnitt", "auswahl", "eingabe", "fortschritt", "haken", "knopf", "reihe", "reiter", "schild",
    "stapel", "tabelle", "takt", "tastatur"]);
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

// ====================================================================== v2-Zutaten (THEKE-ERWEITERUNGEN.md)

/** Falsche Uhr: jetzt() steht, bis vor(ms) sie weiterdreht; vor() ruft danach alle laufenden Intervalle einmal auf. */
function fakeUhr() {
  const uhr = { t: 1000, naechste: 1, laufend: new Map(), geloescht: [] };
  uhr.zeitgeber = {
    jetzt: () => uhr.t,
    setzeIntervall: (fn, ms) => { const h = uhr.naechste++; uhr.laufend.set(h, { fn, ms }); return h; },
    loescheIntervall: (h) => { uhr.geloescht.push(h); uhr.laufend.delete(h); },
    nach: (fn, ms) => { const h = uhr.naechste++; uhr.spaeter.set(h, { fn, bis: uhr.t + ms }); return h; },
    loescheNach: (h) => { uhr.spaeter.delete(h); },
  };
  uhr.spaeter = new Map();
  uhr.vor = (ms) => {
    uhr.t += ms;
    for (const { fn } of [...uhr.laufend.values()]) fn();
    const faellig = [...uhr.spaeter.entries()].filter(([, s]) => s.bis <= uhr.t).sort((x, y) => x[1].bis - y[1].bis || x[0] - y[0]);
    for (const [h, { fn }] of faellig) if (uhr.spaeter.delete(h)) fn();
  };
  return uhr;
}
function mitUhr(fn) {
  return () => {
    const uhr = fakeUhr();
    const u = umgebung({ zeitgeber: uhr.zeitgeber });
    try { return fn({ ...u, uhr }); } finally { u.t.zerstoere(); u.ende(); }
  };
}
const TAKT_BAUM = (extra = {}) => ({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
  { id: "s", art: "schild", text: "0" }, { id: "t1", art: "takt", intervall: 1000, ...extra }] } });
const schlaege = (ereignisse) => ereignisse.filter((e) => e.typ === "takt");

test("takt: unsichtbar, ein Timer, Schlag pro Intervall", mitUhr(({ t, $, uhr, ereignisse, warnungen }) => {
  t.empfange(TAKT_BAUM());
  const el = $("t1");
  assert.equal(el.hidden, true);
  assert.equal(el.getAttribute("aria-hidden"), "true");
  assert.equal(uhr.laufend.size, 1);
  const { ms } = [...uhr.laufend.values()][0];
  assert.ok(ms > 0 && ms <= 1000, "Timer feuert höchstens im Intervall: " + ms);
  uhr.vor(400);
  assert.deepEqual(ereignisse, []);
  uhr.vor(600);
  assert.deepEqual(ereignisse, [{ typ: "takt", id: "t1", anzahl: 1 }]);
  uhr.vor(999);
  assert.equal(ereignisse.length, 1, "kein Schlag vor Ablauf");
  uhr.vor(1);
  assert.deepEqual(ereignisse[1], { typ: "takt", id: "t1", anzahl: 1 });
  assert.ok(!warnungen.some((w) => /takt/.test(w)), "keine Feldwarnungen: " + warnungen.join(" | "));
}));

test("takt: Nachholregel – gedrosselter Timer liefert einen Schlag mit anzahl > 1, ohne Verlust", mitUhr(({ t, uhr, ereignisse }) => {
  t.empfange(TAKT_BAUM());
  uhr.vor(3700);
  assert.deepEqual(ereignisse, [{ typ: "takt", id: "t1", anzahl: 3 }]);
  uhr.vor(300);                       // die angefangenen 700 ms zählen mit → genau bei 4000 der vierte Schlag
  assert.deepEqual(ereignisse[1], { typ: "takt", id: "t1", anzahl: 1 });
  uhr.vor(0);
  assert.equal(ereignisse.length, 2, "kein doppelter Schlag");
}));

test("takt: aktiv:false stoppt, aktiv:true startet die Zählung neu; gleiche Werte starten nichts neu", mitUhr(({ t, uhr, ereignisse }) => {
  t.empfange(TAKT_BAUM());
  uhr.vor(600);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "t1", intervall: 1000, aktiv: true }] });   // unverändert
  uhr.vor(400);
  assert.equal(schlaege(ereignisse).length, 1, "redundantes aendere setzt die Zählung nicht zurück");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "t1", aktiv: false }] });
  assert.equal(uhr.laufend.size, 0, "Timer gelöscht");
  uhr.vor(5000);
  assert.equal(schlaege(ereignisse).length, 1);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "t1", aktiv: true }] });
  assert.equal(uhr.laufend.size, 1);
  uhr.vor(999);
  assert.equal(schlaege(ereignisse).length, 1, "Zählung beginnt bei Reaktivierung neu");
  uhr.vor(1);
  assert.deepEqual(ereignisse.at(-1), { typ: "takt", id: "t1", anzahl: 1 });
}));

test("takt: aktiv:false schon im baum → kein Timer", mitUhr(({ t, uhr, ereignisse }) => {
  t.empfange(TAKT_BAUM({ aktiv: false }));
  assert.equal(uhr.laufend.size, 0);
  uhr.vor(10000);
  assert.deepEqual(ereignisse, []);
}));

test("takt: Intervalländerung startet die Zählung neu", mitUhr(({ t, uhr, ereignisse }) => {
  t.empfange(TAKT_BAUM());
  uhr.vor(900);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "t1", intervall: 500 }] });
  assert.equal(uhr.laufend.size, 1, "alter Timer weg, neuer da");
  uhr.vor(400);
  assert.deepEqual(ereignisse, []);
  uhr.vor(100);
  assert.deepEqual(ereignisse, [{ typ: "takt", id: "t1", anzahl: 1 }]);
}));

test("takt: Intervall-Klemmung (< 100 → 100, ungültig → 1000, jeweils mit Warnung)", mitUhr(({ t, uhr, ereignisse, warnungen }) => {
  t.empfange(TAKT_BAUM({ intervall: 50 }));
  assert.ok(warnungen.some((w) => /100 ms/.test(w)));
  uhr.vor(99);
  assert.deepEqual(ereignisse, []);
  uhr.vor(1);
  assert.deepEqual(ereignisse, [{ typ: "takt", id: "t1", anzahl: 1 }]);
  ereignisse.length = 0;
  for (const kaputt of ["x", null, NaN, Infinity]) {
    warnungen.length = 0;
    t.empfange(TAKT_BAUM({ intervall: kaputt }));
    assert.ok(warnungen.some((w) => /Ungültiges takt\.intervall/.test(w)), String(kaputt));
  }
  uhr.vor(999);
  assert.deepEqual(ereignisse, []);
  uhr.vor(1);
  assert.deepEqual(ereignisse, [{ typ: "takt", id: "t1", anzahl: 1 }]);
}));

test("takt: Entfernen per kinder, neuer baum, schliesse und zerstoere stoppen den Timer", () => {
  const faelle = {
    kinder: (t) => t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "w", kinder: [{ id: "s" }] }] }),
    baum: (t) => t.empfange({ v: 1, op: "baum", wurzel: { id: "x", art: "schild", text: "neu" } }),
    schliesse: (t) => t.empfange({ v: 1, op: "schliesse" }),
    schliessen: (t) => t.schliessen(),
    zerstoere: (t) => t.zerstoere(),
    artWechsel: (t) => t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "w", kinder: [{ id: "t1", art: "schild", text: "jetzt Schild" }] }] }),
  };
  for (const [name, aktion] of Object.entries(faelle)) {
    const uhr = fakeUhr();
    const u = umgebung({ zeitgeber: uhr.zeitgeber });
    try {
      u.t.empfange(TAKT_BAUM());
      assert.equal(uhr.laufend.size, 1, name);
      aktion(u.t);
      assert.equal(uhr.laufend.size, 0, name + ": Timer muss gelöscht sein");
      assert.deepEqual(uhr.geloescht, [1], name);
      uhr.vor(5000);
      assert.deepEqual(schlaege(u.ereignisse), [], name);
    } finally { u.t.zerstoere(); u.ende(); }
  }
});

test("takt: auch ohne id wird der Timer beim Entfernen gelöscht", mitUhr(({ t, uhr }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [{ art: "takt", intervall: 200 }] } });
  assert.equal(uhr.laufend.size, 1);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "w", kinder: [] }] });
  assert.equal(uhr.laufend.size, 0);
}));

test("takt: wandert per kinder in einen anderen Behälter → läuft weiter (gleiche id)", mitUhr(({ t, uhr, ereignisse }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "a", art: "stapel", kinder: [{ id: "t1", art: "takt", intervall: 1000 }] }, { id: "b", art: "stapel", kinder: [] }] } });
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "b", kinder: [{ id: "t1" }] }, { id: "a", kinder: [] }] });
  assert.equal(uhr.laufend.size, 1);
  uhr.vor(1000);
  assert.deepEqual(ereignisse, [{ typ: "takt", id: "t1", anzahl: 1 }]);
}));

test("takt: Standard-Zeitgeber nutzt das Fenster des Dokuments", mitUmgebung(({ t, $, win }) => {
  const alt = { set: win.setInterval, clear: win.clearInterval };
  const gesetzt = [], geloescht = [];
  win.setInterval = (fn, ms) => { gesetzt.push(ms); return 77; };
  win.clearInterval = (h) => geloescht.push(h);
  try {
    t.empfange(TAKT_BAUM({ sichtbar: true }));
    assert.equal(gesetzt.length, 1);
    assert.ok($("t1").classList.contains("theke-takt"));
    t.zerstoere();
    assert.deepEqual(geloescht, [77]);
  } finally { win.setInterval = alt.set; win.clearInterval = alt.clear; }
}));

test("beimEntfernen: Rückruf genau einmal, Fehler darin brechen nichts", mitUmgebung(({ PizzaTheke, t, warnungen }) => {
  let weg = 0;
  PizzaTheke.registriere("sonde", {
    erzeuge(k, ctx) {
      ctx.beimEntfernen(() => weg++);
      ctx.beimEntfernen(() => { throw new Error("au"); });
      assert.equal(typeof ctx.zeitgeber.jetzt(), "number");
      return ctx.dokument.createElement("div");
    },
  });
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [{ id: "p", art: "sonde" }] } });
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "w", kinder: [] }] });
  assert.equal(weg, 1);
  assert.ok(warnungen.some((w) => /beimEntfernen/.test(w)));
  t.empfange({ v: 1, op: "baum", wurzel: { id: "p", art: "sonde" } });
  t.empfange({ v: 1, op: "baum", wurzel: { id: "q", art: "schild" } });
  assert.equal(weg, 2);
  t.empfange({ v: 1, op: "baum", wurzel: { id: "p", art: "sonde" } });
  t.empfange({ v: 1, op: "schliesse" });
  t.zerstoere();
  assert.equal(weg, 3, "schliesse räumt auf, zerstoere danach nicht doppelt");
}));

test("hinweis: allgemeines Feld → title, leer/null entfernt, keine Feldwarnung", mitUmgebung(({ t, $, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "k", art: "knopf", text: "Ofen", hinweis: "Backt 1 Pizza pro Sekunde" },
    { id: "f", art: "fortschritt", wert: 0.5, hinweis: "Hälfte" }] } });
  assert.equal($("k").getAttribute("title"), "Backt 1 Pizza pro Sekunde");
  assert.equal($("f").getAttribute("title"), "Hälfte");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "k", hinweis: "" }, { id: "f", hinweis: null }] });
  assert.equal($("k").hasAttribute("title"), false);
  assert.equal($("f").hasAttribute("title"), false);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "k", hinweis: 42 }] });
  assert.equal($("k").getAttribute("title"), "42");
  assert.ok(!warnungen.some((w) => /hinweis/.test(w)));
}));

test("stil schrift: riesig ist erlaubt", mitUmgebung(({ t, $, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "s", art: "schild", text: "1,2 Mio.", stil: { schrift: "riesig" } } });
  assert.ok($("s").classList.contains("theke-schrift-riesig"));
  assert.deepEqual(warnungen, []);
}));

test("fortschritt: Klemmung, aria, Text, Farbe", mitUmgebung(({ t, $, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "f", art: "fortschritt", wert: 0.25 } });
  const el = $("f");
  assert.equal(el.getAttribute("role"), "progressbar");
  assert.equal(el.getAttribute("aria-valuemin"), "0");
  assert.equal(el.getAttribute("aria-valuemax"), "100");
  assert.equal(el.getAttribute("aria-valuenow"), "25");
  assert.equal(el.style.getPropertyValue("--theke-wert"), "25%");
  assert.equal(el.hasAttribute("aria-valuetext"), false);
  assert.ok(!el.classList.contains("theke-fortschritt-mit-text"));
  for (const [w, erw] of [[1.7, "100"], [-3, "0"], [NaN, "0"], ["0.5", "0"], [null, "0"], [0.375, "38"]]) {
    t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "f", wert: w }] });
    assert.equal(el.getAttribute("aria-valuenow"), erw, String(w));
  }
  assert.equal(el.style.getPropertyValue("--theke-wert"), "37.5%");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "f", text: "37 % bis zum Steinofen", stil: { farbe: "basilikum" } }] });
  assert.equal(el.getAttribute("aria-valuetext"), "37 % bis zum Steinofen");
  assert.ok(el.classList.contains("theke-fortschritt-mit-text"));
  assert.ok(el.classList.contains("theke-farbe-basilikum"));
  assert.match(el.textContent, /37 % bis zum Steinofen/);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "f", text: "" }] });
  assert.equal(el.hasAttribute("aria-valuetext"), false);
  assert.ok(!el.classList.contains("theke-fortschritt-mit-text"));
  t.empfange({ v: 1, op: "baum", wurzel: { id: "g", art: "fortschritt" } });
  assert.equal($("g").getAttribute("aria-valuenow"), "0", "ohne wert → 0");
  assert.deepEqual(warnungen, []);
}));

test("abschnitt: section mit Überschrift, Inhalt als Stapel, titel/kinder per aendere", mitUmgebung(({ t, $, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "a", art: "abschnitt", titel: "Upgrades", stil: { abstand: 4, farbe: "kruste" }, kinder: [
    { id: "k1", art: "knopf", text: "Ofen" }, { id: "k2", art: "knopf", text: "Lehrling" }] } });
  const el = $("a");
  assert.equal(el.tagName, "SECTION");
  const [kopf, inhalt] = el.children;
  assert.equal(kopf.tagName, "H3");
  assert.equal(kopf.textContent, "Upgrades");
  assert.equal(kopf.hidden, false);
  assert.ok(inhalt.classList.contains("theke-stapel"));
  assert.deepEqual([...inhalt.children].map((c) => c.getAttribute("data-theke-id")), ["k1", "k2"]);
  assert.equal(el.style.getPropertyValue("--theke-abstand"), "4px");
  assert.ok(el.classList.contains("theke-farbe-kruste"));
  const k1 = $("k1");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "a", titel: "Upgrades (3)", kinder: [{ id: "k1" }, { id: "k3", art: "schild", text: "neu" }] }] });
  assert.equal(kopf.textContent, "Upgrades (3)");
  assert.equal($("k1"), k1);
  assert.equal($("k2"), null);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "a", titel: "" }] });
  assert.equal(kopf.hidden, true);
  assert.deepEqual(warnungen, []);
}));

test("tabelle: thead/tbody, Zahlenspalten rechtsbündig (auch deutsche Formate)", mitUmgebung(({ t, $, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "tb", art: "tabelle",
    spalten: ["Gebäude", "Anzahl", "Pizzen/s", "Umsatz", "Kosten", "Notiz"],
    zeilen: [
      ["Lehrling", 3, 0.3, "1.234,5", "8,00 €", "flink"],
      ["Steinofen", "1.200", "1,2 Mio.", "–", "1,2 Mio. €", "12"],
      ["Holzofen", "-4", "1234567.8", "12 %", "0,5 €", ""],
    ] } });
  const tab = $("tb").querySelector("table");
  assert.ok(tab && tab.tHead && tab.tBodies.length === 1);
  const th = [...tab.tHead.rows[0].cells];
  assert.deepEqual(th.map((c) => c.textContent), ["Gebäude", "Anzahl", "Pizzen/s", "Umsatz", "Kosten", "Notiz"]);
  const rechts = th.map((c) => c.classList.contains("theke-tabelle-zahl"));
  assert.deepEqual(rechts, [false, true, true, true, true, false]);
  const z1 = [...tab.tBodies[0].rows[0].cells];
  assert.deepEqual(z1.map((c) => c.textContent), ["Lehrling", "3", "0.3", "1.234,5", "8,00 €", "flink"]);
  assert.deepEqual(z1.map((c) => c.classList.contains("theke-tabelle-zahl")), rechts);
  assert.deepEqual(warnungen, []);
}));

test("tabelle: Teil-Updates, ungleiche Zeilenlängen, leere Zeilen → „–“", mitUmgebung(({ t, $, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "tb", art: "tabelle", spalten: ["A", "B"], zeilen: [] } });
  const tab = $("tb").querySelector("table");
  const leer = tab.tBodies[0].rows;
  assert.equal(leer.length, 1);
  assert.equal(leer[0].cells[0].textContent, "–");
  assert.equal(leer[0].cells[0].colSpan, 2);
  assert.ok(leer[0].cells[0].classList.contains("theke-tabelle-leer"));
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "tb", zeilen: [["x", 1, "zu viel"], ["y"], [null, true]] }] });
  assert.equal(tab.tHead.rows[0].cells.length, 3, "Spaltenzahl = längste Zeile");
  assert.deepEqual([...tab.tBodies[0].rows].map((r) => [...r.cells].map((c) => c.textContent)),
    [["x", "1", "zu viel"], ["y", "", ""], ["", "true", ""]]);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "tb", spalten: ["Neu"] }] });
  assert.equal(tab.tHead.rows[0].cells[0].textContent, "Neu");
  assert.equal(tab.tBodies[0].rows.length, 3, "zeilen bleiben bei spalten-Update erhalten");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "tb", spalten: [] }] });
  assert.equal(tab.tHead.hidden, true);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "tb", zeilen: "kaputt" }] });
  assert.ok(warnungen.some((w) => /tabelle\.zeilen/.test(w)));
  assert.equal(tab.tBodies[0].rows[0].cells[0].textContent, "–");
}));

test("reiter: Leiste, nur gewählte Seite sichtbar, Klick zeigt sofort um und sendet aenderung", mitUmgebung(({ t, $, win, ereignisse, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "r", art: "reiter", titel: ["Backstube", "Erfolge"], gewaehlt: 1, kinder: [
    { id: "p1", art: "schild", text: "Öfen" }, { id: "p2", art: "schild", text: "Pokale" }, { id: "p3", art: "schild", text: "Extra" }] } });
  const el = $("r");
  const leiste = el.querySelector("[role=tablist]");
  const tabs = () => [...leiste.querySelectorAll("[role=tab]")];
  assert.deepEqual(tabs().map((b) => b.textContent), ["Backstube", "Erfolge", "Seite 3"]);
  assert.deepEqual(tabs().map((b) => b.getAttribute("aria-selected")), ["true", "false", "false"]);
  assert.deepEqual(tabs().map((b) => b.tabIndex), [0, -1, -1]);
  assert.equal(el.querySelector("[role=tabpanel]").getAttribute("aria-label"), "Backstube");
  const aus = () => ["p1", "p2", "p3"].map((id) => $(id).classList.contains("theke-reiter-aus"));
  assert.deepEqual(aus(), [false, true, true]);

  tabs()[1].click();
  assert.deepEqual(aus(), [true, false, true], "sofort lokal umgeschaltet");
  assert.deepEqual(ereignisse, [{ typ: "aenderung", id: "r", wert: 2 }]);
  tabs()[1].click();
  assert.equal(ereignisse.length, 1, "Klick auf den schon gewählten Reiter sendet nichts");

  // Tastatur: Pfeil rechts/links mit Umlauf, Home/End
  tabs()[1].dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  tabs()[2].dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  tabs()[0].dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  tabs()[2].dispatchEvent(new win.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
  assert.deepEqual(ereignisse.slice(1).map((e) => e.wert), [3, 1, 3, 1]);

  // Programm wählt (Setter) → kein Ereignis; gewaehlt außerhalb wird geklemmt
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "r", gewaehlt: 9 }] });
  assert.deepEqual(aus(), [true, true, false]);
  assert.equal(ereignisse.length, 5);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "r", gewaehlt: 0 }] });
  assert.ok(warnungen.some((w) => /reiter\.gewaehlt/.test(w)));
  assert.deepEqual(aus(), [false, true, true]);
}));

test("reiter: kinder per aendere wiederverwenden, Seiten nehmen die Verstecken-Klasse nicht mit", mitUmgebung(({ t, $ }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "r", art: "reiter", titel: ["A", "B"], gewaehlt: 1, kinder: [
      { id: "e", art: "eingabe", wert: "x" }, { id: "p2", art: "schild", text: "zwei" }] },
    { id: "ab", art: "stapel", kinder: [] }] } });
  const e = $("e");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "r", titel: ["B", "A"], gewaehlt: 2, kinder: [{ id: "p2" }, { id: "e" }] }] });
  assert.equal($("e"), e, "Element (Eingabe) bleibt erhalten");
  assert.equal($("e").classList.contains("theke-reiter-aus"), false);
  assert.equal($("p2").classList.contains("theke-reiter-aus"), true);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "r", kinder: [{ id: "e" }] }, { id: "ab", kinder: [{ id: "p2" }] }] });
  assert.equal($("p2").parentNode, $("ab"));
  assert.equal($("p2").classList.contains("theke-reiter-aus"), false, "gewanderte Seite ist wieder sichtbar");
  assert.deepEqual([...$("r").querySelectorAll("[role=tab]")].map((b) => b.textContent), ["B", "A"]);
}));

test("v2-Zutaten: keine Feldwarnungen bei vollständigen Knoten, nach schliesse kein takt", mitUhr(({ t, uhr, ereignisse, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", hinweis: "Wurzel", kinder: [
    { id: "t1", art: "takt", intervall: 1000, aktiv: true, hinweis: "x" },
    { id: "f", art: "fortschritt", wert: 0.1, text: "10 %" },
    { id: "a", art: "abschnitt", titel: "T", kinder: [] },
    { id: "tb", art: "tabelle", spalten: [], zeilen: [] },
    { id: "r", art: "reiter", titel: [], gewaehlt: 1, kinder: [] }] } });
  assert.deepEqual(warnungen, []);
  t.empfange({ v: 1, op: "schliesse" });
  uhr.vor(10000);
  assert.deepEqual(ereignisse, []);
}));

// ====================================================================== v3: Animationen & uebergang (K-090 … K-092, SPEC §16.6)

const ANIM_BAUM = () => ({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
  { id: "zahl", art: "schild", text: "1.234" },
  { id: "k", art: "knopf", text: "Backen!" },
  { id: "weg", art: "schild", text: "versteckt", sichtbar: false },
  { id: "t1", art: "takt", intervall: 1000, aktiv: false },
  { id: "r", art: "reiter", titel: ["A", "B"], gewaehlt: 1, kinder: [
    { id: "p1", art: "schild", text: "eins" }, { id: "p2", art: "schild", text: "zwei" }] },
  { id: "liste", art: "stapel", kinder: [{ id: "l1", art: "schild", text: "a" }] },
] } });
const animiere = (t, animationen, aenderungen = []) => t.empfange({ v: 1, op: "aendere", aenderungen, animationen });
const animKlassen = (el) => [...el.classList].filter((k) => /^theke-(anim|ueb)-/.test(k));
const schwebe = (container) => [...container.querySelectorAll(".theke-ebene > .theke-schwebe")];

test("v3: API – registriereAnimation, eingebaute Arten über dieselbe Registry", mitUhr(({ PizzaTheke }) => {
  assert.equal(typeof PizzaTheke.registriereAnimation, "function");
  assert.deepEqual(PizzaTheke.animationsArten().sort(),
    ["aufpoppen", "einblenden", "funkeln", "huepfen", "puls", "schwebe", "wackeln"]);
  assert.throws(() => PizzaTheke.registriereAnimation("", { spiele() {} }), TypeError);
  assert.throws(() => PizzaTheke.registriereAnimation("x", {}), TypeError);
}));

test("v3: aendere.animationen – Klasse mit Standard-/eigener Dauer, Ende nach Ablauf, keine Warnungen", mitUhr(({ t, $, uhr, warnungen, ereignisse }) => {
  t.empfange(ANIM_BAUM());
  animiere(t, [{ id: "zahl", art: "puls" }, { id: "k", art: "huepfen", dauer: 300 }]);
  assert.deepEqual(animKlassen($("zahl")), ["theke-anim-puls"]);
  assert.equal($("zahl").style.getPropertyValue("--theke-anim-dauer"), "400ms");
  assert.deepEqual(animKlassen($("k")), ["theke-anim-huepfen"]);
  assert.equal($("k").style.getPropertyValue("--theke-anim-dauer"), "300ms");
  uhr.vor(340);
  assert.deepEqual(animKlassen($("k")), [], "huepfen (300 ms) ist vorbei");
  assert.deepEqual(animKlassen($("zahl")), ["theke-anim-puls"], "puls (400 ms) läuft noch");
  uhr.vor(100);
  assert.deepEqual(animKlassen($("zahl")), []);
  assert.equal($("zahl").style.getPropertyValue("--theke-anim-dauer"), "");
  // Dauer außerhalb 50 ms … 5 s wird geklemmt, Unsinn → Standard
  animiere(t, [{ id: "zahl", art: "puls", dauer: 10 }, { id: "k", art: "wackeln", dauer: 99999 }]);
  assert.equal($("zahl").style.getPropertyValue("--theke-anim-dauer"), "50ms");
  assert.equal($("k").style.getPropertyValue("--theke-anim-dauer"), "5000ms");
  animiere(t, [{ id: "zahl", art: "puls", dauer: "schnell" }]);
  assert.equal($("zahl").style.getPropertyValue("--theke-anim-dauer"), "400ms");
  // Animationen ändern nichts am Programm: keine Ereignisse, keine Warnungen; die Zutat bleibt bedienbar
  $("k").click();
  assert.deepEqual(ereignisse, [{ typ: "klick", id: "k" }]);
  assert.deepEqual(warnungen, []);
}));

test("v3: unbekannte id, versteckte Zutat, nicht gewählte Reiter-Seite, takt → still ignoriert", mitUhr(({ t, $, container, warnungen }) => {
  t.empfange(ANIM_BAUM());
  animiere(t, [
    { id: "gibtsnicht", art: "puls" }, { id: "weg", art: "puls" }, { id: "t1", art: "wackeln" }, { id: "p2", art: "funkeln" },
    { art: "puls" },                                                   // ohne id: nur Ebenen-Arten (schwebe) dürfen das
    { art: "schwebe", text: "+1", id: "weg" }, { art: "schwebe", text: "+1", id: "gibtsnicht" },
  ]);
  for (const id of ["weg", "t1", "p2"]) assert.deepEqual(animKlassen($(id)), [], id);
  assert.equal(schwebe(container).length, 0);
  assert.equal(container.querySelectorAll(".theke-funken").length, 0);
  assert.deepEqual(warnungen, []);
  // Seite 1 ist gewählt → gezeigt
  animiere(t, [{ id: "p1", art: "funkeln" }]);
  assert.deepEqual(animKlassen($("p1")), ["theke-anim-funkeln"]);
  assert.equal(container.querySelectorAll(".theke-funken > .theke-funke").length, 8);
}));

test("v3: unbekannte art → genau eine Warnung je Art, Rest der Liste läuft weiter", mitUhr(({ t, $, warnungen }) => {
  t.empfange(ANIM_BAUM());
  animiere(t, [{ id: "zahl", art: "tanzen" }, { id: "k", art: "puls" }]);
  animiere(t, [{ id: "zahl", art: "tanzen" }, { id: "zahl", art: "tanzen" }]);
  animiere(t, [{ id: "zahl", art: "ausblenden" }, 42, null]);
  assert.equal(warnungen.filter((w) => /Animation/.test(w) && /tanzen/.test(w)).length, 1);
  assert.equal(warnungen.filter((w) => /ausblenden/.test(w)).length, 1);
  assert.equal(warnungen.length, 2);
  assert.deepEqual(animKlassen($("k")), ["theke-anim-puls"]);
  assert.deepEqual(animKlassen($("zahl")), []);
}));

test("v3: Reihenfolge – erst aenderungen, dann animationen (einblenden auf ein neues Kind)", mitUhr(({ t, $, warnungen }) => {
  t.empfange(ANIM_BAUM());
  animiere(t, [{ id: "neu", art: "einblenden" }, { id: "zahl", art: "aufpoppen" }], [
    { id: "liste", kinder: [{ id: "l1" }, { id: "neu", art: "schild", text: "Erfolg!" }] },
    { id: "zahl", sichtbar: false },
  ]);
  assert.deepEqual(animKlassen($("neu")), ["theke-anim-einblenden"], "neues Kind wird animiert");
  assert.deepEqual(animKlassen($("zahl")), [], "im selben Bild versteckt → keine Animation");
  assert.deepEqual(warnungen, []);
}));

test("v3: gleiche Art startet neu, andere Art ersetzt", mitUhr(({ t, $, uhr }) => {
  t.empfange(ANIM_BAUM());
  animiere(t, [{ id: "k", art: "puls" }]);
  uhr.vor(300);
  animiere(t, [{ id: "k", art: "puls" }]);                // Neustart: läuft volle 400 ms ab jetzt
  uhr.vor(300);
  assert.deepEqual(animKlassen($("k")), ["theke-anim-puls"], "Neustart verlängert");
  uhr.vor(150);
  assert.deepEqual(animKlassen($("k")), []);
  animiere(t, [{ id: "k", art: "wackeln" }, { id: "k", art: "funkeln" }]);
  assert.deepEqual(animKlassen($("k")), ["theke-anim-funkeln"], "andere Art ersetzt die laufende");
  animiere(t, [{ id: "k", art: "huepfen" }]);
  assert.deepEqual(animKlassen($("k")), ["theke-anim-huepfen"]);
  assert.equal(t.element.querySelectorAll(".theke-funken").length, 0, "Funken der ersetzten Animation sind weg");
}));

test("v3: schwebe – Text, Farbe, Anker, feste Versätze reihum, Ende nach Ablauf", mitUhr(({ t, container, uhr, warnungen }) => {
  t.empfange(ANIM_BAUM());
  const liste = [];
  for (let i = 0; i < 6; i++) liste.push({ art: "schwebe", text: "+" + i, id: "k" });
  liste.push({ art: "schwebe", text: "mitte" }, { art: "schwebe", text: "grün", id: "zahl", farbe: "basilikum", dauer: 500 });
  liste.push({ art: "schwebe", text: "lila", farbe: "lila" }, { art: "schwebe", text: 12 });
  animiere(t, liste);
  const s = schwebe(container);
  assert.deepEqual(s.map((e) => e.textContent), ["+0", "+1", "+2", "+3", "+4", "+5", "mitte", "grün", "lila", "12"]);
  assert.deepEqual(s.slice(0, 6).map((e) => e.style.getPropertyValue("--theke-versatz")), ["0px", "-12px", "12px", "-6px", "6px", "0px"]);
  assert.deepEqual(s.slice(6).map((e) => e.style.getPropertyValue("--theke-versatz")), ["0px", "0px", "-12px", "12px"],
    "eigener Platz je Anker (Mitte: mitte, lila, 12)");
  // Gleichzeitige Texte am selben Anker stapeln sich je 20 px höher (Platz 0, 1, 2, …; K-092). jsdom hat kein Layout
  // (sicht() = 0×0) → keine Klemmung an den Ausschnitt, kein Kippen des Stapels nach unten.
  assert.deepEqual(s.slice(0, 6).map((e) => e.style.getPropertyValue("--theke-hoch")), ["0px", "20px", "40px", "60px", "80px", "100px"]);
  assert.deepEqual(s.slice(6).map((e) => e.style.getPropertyValue("--theke-hoch")), ["0px", "0px", "20px", "40px"]);
  assert.ok(s[7].classList.contains("theke-farbe-basilikum"));
  assert.ok(![...s[8].classList].some((k) => k.startsWith("theke-farbe-")), "unbekannte Farbe → normal");
  assert.equal(s[7].style.getPropertyValue("--theke-anim-dauer"), "500ms");
  assert.equal(s[0].style.getPropertyValue("--theke-anim-dauer"), "1000ms");
  for (const p of ["--theke-x", "--theke-y", "--theke-b", "--theke-h"]) assert.match(s[0].style.getPropertyValue(p), /^-?\d+(\.\d+)?px$/);
  assert.equal(container.querySelector(".theke-ebene").parentNode, container.querySelector(".theke-inhalt"));
  uhr.vor(600);
  assert.equal(schwebe(container).length, 9, "der 500-ms-Text ist weg");
  uhr.vor(500);
  assert.equal(schwebe(container).length, 0);
  assert.deepEqual(warnungen, []);
}));

test("v3: schwebe – Platz am Anker wird am Ende wieder frei (kleinster freier Platz, kein Hochzählen)", mitUhr(({ t, container, uhr }) => {
  t.empfange(ANIM_BAUM());
  const hoch = () => schwebe(container).map((e) => e.textContent + e.style.getPropertyValue("--theke-hoch"));
  animiere(t, [{ art: "schwebe", text: "a", id: "k" }, { art: "schwebe", text: "b", id: "k", dauer: 300 }, { art: "schwebe", text: "c", id: "k" }]);
  assert.deepEqual(hoch(), ["a0px", "b20px", "c40px"]);
  uhr.vor(400);                                   // b ist weg → Platz 1 frei
  animiere(t, [{ art: "schwebe", text: "d", id: "k" }, { art: "schwebe", text: "e", id: "k" }]);
  assert.deepEqual(hoch(), ["a0px", "c40px", "d20px", "e60px"], "d nimmt den freien Platz 1, e den nächsten");
  uhr.vor(1100);
  assert.deepEqual(hoch(), []);
  animiere(t, [{ art: "schwebe", text: "f", id: "k" }]);
  assert.deepEqual(hoch(), ["f0px"], "nach dem Ende aller: wieder Platz 0");
}));

test("v3: schwebe – leerer Text (auch nur Leerraum, fehlend): kein Element, zählt nicht zum Limit (K-093)", mitUhr(({ t, container, warnungen }) => {
  t.empfange(ANIM_BAUM());
  const liste = [{ art: "schwebe", text: "", id: "k" }, { art: "schwebe", text: "   " }, { art: "schwebe" }, { art: "schwebe", text: "", id: "gibtsnicht" }];
  for (let i = 1; i <= 20; i++) liste.push({ art: "schwebe", text: String(i), id: "k" });
  animiere(t, liste);
  const s = schwebe(container);
  assert.equal(s.length, 20, "20 echte Texte, keiner durch leere verdrängt");
  assert.equal(s[0].textContent, "1");
  assert.equal(s[0].style.getPropertyValue("--theke-hoch"), "0px", "leere Texte belegen keinen Platz");
  assert.deepEqual(warnungen, []);
}));

test("v3: schwebe – höchstens 20 gleichzeitig, der älteste weicht; ersetzt keine Zutat-Animation", mitUhr(({ t, $, container, uhr }) => {
  t.empfange(ANIM_BAUM());
  animiere(t, [{ id: "k", art: "puls" }]);
  const liste = [];
  for (let i = 1; i <= 25; i++) liste.push(i % 2 ? { art: "schwebe", text: String(i), id: "k" } : { art: "schwebe", text: String(i) });
  animiere(t, liste.slice(0, 10));
  uhr.vor(100);
  animiere(t, liste.slice(10));
  const texte = schwebe(container).map((e) => e.textContent);
  assert.equal(texte.length, 20);
  assert.deepEqual(texte, liste.slice(5).map((e) => e.text));
  assert.deepEqual(animKlassen($("k")), ["theke-anim-puls"], "schwebe am Knopf ersetzt dessen puls nicht");
}));

test("v3: neuer baum, schliesse und Entfernen beenden Animationen; nach schliesse entsteht nichts", mitUhr(({ t, $, container }) => {
  t.empfange(ANIM_BAUM());
  animiere(t, [{ id: "l1", art: "funkeln" }, { art: "schwebe", text: "+1" }]);
  assert.equal(container.querySelectorAll(".theke-funken").length, 1);
  const l1 = $("l1");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "liste", kinder: [] }] });
  assert.deepEqual(animKlassen(l1), []);
  assert.equal(container.querySelectorAll(".theke-funken").length, 0, "Funken der entfernten Zutat sind weg");
  assert.equal(schwebe(container).length, 1);
  t.empfange(ANIM_BAUM());
  assert.equal(schwebe(container).length, 0, "neuer baum räumt die Ebene");
  assert.equal(container.querySelectorAll(".theke-ebene").length, 1);
  t.empfange({ v: 1, op: "schliesse" });
  animiere(t, [{ art: "schwebe", text: "+1" }]);
  assert.equal(schwebe(container).length, 0);
}));

test("v3: eigene Animation über registriereAnimation – (el, eintrag, ctx), Aufräumfunktion, Ersetzen", mitUhr(({ PizzaTheke, t, $, uhr, warnungen }) => {
  const protokoll = [];
  PizzaTheke.registriereAnimation("blinken", {
    dauer: 250,
    spiele(el, eintrag, ctx) {
      protokoll.push(["start", el.getAttribute("data-theke-id"), eintrag.id, eintrag.art, ctx.dauer, ctx.reduziert, typeof ctx.klasse, typeof ctx.teil]);
      ctx.klasse(el, "mein-blinken");
      return () => protokoll.push(["ende", el.getAttribute("data-theke-id")]);
    },
  });
  t.empfange(ANIM_BAUM());
  animiere(t, [{ id: "zahl", art: "blinken" }]);
  assert.deepEqual(protokoll, [["start", "zahl", "zahl", "blinken", 250, false, "function", "function"]]);
  assert.ok($("zahl").classList.contains("mein-blinken"));
  uhr.vor(300);
  assert.deepEqual(protokoll.at(-1), ["ende", "zahl"]);
  assert.ok(!$("zahl").classList.contains("mein-blinken"));
  animiere(t, [{ id: "zahl", art: "blinken", dauer: 2000 }, { id: "zahl", art: "puls" }]);
  assert.deepEqual(protokoll.at(-1), ["ende", "zahl"], "puls ersetzt blinken → Aufräumen sofort");
  assert.deepEqual(animKlassen($("zahl")), ["theke-anim-puls"]);
  assert.deepEqual(warnungen, []);
}));

test("v3: uebergang – Ausblenden sofort unbedienbar, danach hidden; Einblenden; ohne uebergang sofort", mitUhr(({ t, $, uhr, ereignisse, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "k", art: "knopf", text: "Kaufen", uebergang: true },
    { id: "s", art: "schild", text: "hart" }] } });
  assert.deepEqual(animKlassen($("k")), [], "erster baum: kein Übergang");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "k", sichtbar: false }, { id: "s", sichtbar: false }] });
  assert.equal($("s").hidden, true, "ohne uebergang sofort weg");
  const k = $("k");
  assert.equal(k.hidden, false, "blendet noch aus");
  assert.ok(k.classList.contains("theke-ueb-aus"));
  assert.ok(k.hasAttribute("inert"));
  k.click();
  assert.deepEqual(ereignisse, [], "während des Ausblendens kein klick");
  animiere(t, [{ id: "k", art: "puls" }]);
  assert.deepEqual(animKlassen(k), ["theke-ueb-aus"], "ausblendende Zutat gilt als versteckt");
  uhr.vor(250);
  assert.equal(k.hidden, true);
  assert.deepEqual(animKlassen(k), []);
  assert.equal(k.hasAttribute("inert"), false);
  // wieder einblenden
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "k", sichtbar: true }] });
  assert.equal(k.hidden, false);
  assert.deepEqual(animKlassen(k), ["theke-ueb-ein"]);
  assert.equal(k.style.getPropertyValue("--theke-anim-dauer"), "200ms");
  uhr.vor(250);
  assert.deepEqual(animKlassen(k), []);
  k.click();
  assert.deepEqual(ereignisse, [{ typ: "klick", id: "k" }]);
  // sichtbar:true mitten im Ausblenden bricht ab
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "k", sichtbar: false }] });
  uhr.vor(100);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "k", sichtbar: true }] });
  uhr.vor(500);
  assert.equal(k.hidden, false, "Abbruch: bleibt sichtbar");
  assert.equal(k.hasAttribute("inert"), false);
  // uebergang(nein) per aendere → wieder hart
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "k", uebergang: false, sichtbar: false }] });
  assert.equal(k.hidden, true);
  assert.deepEqual(warnungen, [], "uebergang ist ein bekanntes Feld");
}));

test("v3: uebergang an Behältern – neu hinzugekommene Kinder blenden ein, bestehende nicht, entfernte sofort weg", mitUhr(({ t, $ }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "liste", art: "stapel", uebergang: true, kinder: [{ id: "a", art: "schild", text: "a" }, { id: "b", art: "schild", text: "b" }] },
    { id: "ab", art: "abschnitt", titel: "Erfolge", uebergang: true, kinder: [] },
    { id: "hart", art: "reihe", kinder: [] },
    { id: "r", art: "reiter", titel: ["A"], gewaehlt: 2, uebergang: true, kinder: [{ id: "p1", art: "schild", text: "eins" }] }] } });
  assert.deepEqual(animKlassen($("a")), [], "erster baum: nichts blendet ein");
  t.empfange({ v: 1, op: "aendere", aenderungen: [
    { id: "liste", kinder: [{ id: "a" }, { id: "c", art: "schild", text: "c" }, { id: "d", art: "schild", text: "d", sichtbar: false }] },
    { id: "ab", kinder: [{ id: "e1", art: "schild", text: "Erste Pizza" }] },
    { id: "hart", kinder: [{ id: "h1", art: "schild", text: "x" }] },
    { id: "r", titel: ["A", "B", "C"], gewaehlt: 2, kinder: [{ id: "p1" }, { id: "p2", art: "schild", text: "zwei" }, { id: "p3", art: "schild", text: "drei" }] }] });
  assert.deepEqual(animKlassen($("p2")), ["theke-ueb-ein"], "reiter ist ein Behälter: neue, gewählte Seite blendet ein (K-091)");
  assert.deepEqual(animKlassen($("p3")), [], "neue, nicht gewählte Seite: nicht gezeigt → nichts");
  assert.deepEqual(animKlassen($("p1")), [], "bestehende Seite nicht");
  assert.equal($("b"), null, "entferntes Kind sofort weg");
  assert.deepEqual(animKlassen($("a")), []);
  assert.deepEqual(animKlassen($("c")), ["theke-ueb-ein"]);
  assert.deepEqual(animKlassen($("d")), [], "verstecktes neues Kind: nichts");
  assert.deepEqual(animKlassen($("e1")), ["theke-ueb-ein"], "abschnitt (Inhalt) blendet ebenfalls ein");
  assert.deepEqual(animKlassen($("h1")), [], "ohne uebergang hart");
}));

test("v3: prefers-reduced-motion – keine Bewegung, funkeln ruhig, schwebe ruhig, uebergang sofort", mitUhr(({ t, $, win, container, uhr }) => {
  win.matchMedia = (q) => ({ matches: /prefers-reduced-motion:\s*reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", uebergang: true, kinder: [
    { id: "k", art: "knopf", text: "Kaufen", uebergang: true }, { id: "z", art: "schild", text: "1" }] } });
  animiere(t, [{ id: "k", art: "puls" }, { id: "k", art: "huepfen" }, { id: "z", art: "wackeln" }, { id: "z", art: "aufpoppen" },
    { id: "z", art: "einblenden" }]);
  assert.deepEqual(animKlassen($("k")), []);
  assert.deepEqual(animKlassen($("z")), []);
  animiere(t, [{ id: "z", art: "funkeln" }, { art: "schwebe", text: "+12", id: "k" }]);
  assert.deepEqual(animKlassen($("z")), ["theke-anim-funkeln-ruhig"]);
  assert.equal(container.querySelectorAll(".theke-funken").length, 0, "keine Funken");
  const s = schwebe(container);
  assert.equal(s.length, 1);
  assert.ok(s[0].classList.contains("theke-schwebe-ruhig"));
  uhr.vor(1100);
  assert.equal(schwebe(container).length, 0, "nach der Dauer weg");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "k", sichtbar: false }, { id: "w", kinder: [{ id: "k" }, { id: "z" }, { id: "n", art: "schild", text: "neu" }] }] });
  assert.equal($("k").hidden, true, "uebergang entfällt → sofort weg");
  assert.deepEqual(animKlassen($("n")), [], "neues Kind ohne Einblenden");
}));

test("v3: uebergang-Behälter + einblenden auf das neue Kind im selben aendere → einblenden ersetzt das Übergangs-Einblenden", mitUhr(({ t, $ }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "liste", art: "stapel", uebergang: true, kinder: [] } });
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "liste", kinder: [{ id: "n", art: "schild", text: "neu" }] }],
    animationen: [{ id: "n", art: "einblenden" }] });
  assert.deepEqual(animKlassen($("n")), ["theke-anim-einblenden"]);
}));

// ====================================================================== v4: Reiter-Seiten, klappbarer Abschnitt, Auswahl, Tastatur, Stile (K-107 … K-113, SPEC §16.7)

const taste = (win, ziel, key, extra = {}) => {
  const ev = new win.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
  ziel.dispatchEvent(ev);
  return ev;
};

test("v4 K-107 reiter: versteckte Seite → Tab hidden, Ersatzseite ohne Ereignis, Pfeiltasten überspringen", mitUmgebung(({ t, $, win, ereignisse, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "r", art: "reiter", titel: ["A", "B", "C", "D"], gewaehlt: 2, kinder: [
    { id: "p1", art: "schild", text: "1" }, { id: "p2", art: "schild", text: "2" }, { id: "p3", art: "schild", text: "3", sichtbar: false },
    { id: "p4", art: "schild", text: "4" }] } });
  const tabs = () => [...$("r").querySelectorAll("[role=tab]")];
  const gezeigt = () => ["p1", "p2", "p3", "p4"].map((id) => !$(id).classList.contains("theke-reiter-aus"));
  assert.deepEqual(tabs().map((b) => b.hidden), [false, false, true, false], "schon im baum versteckte Seite hat keinen Tab");
  assert.deepEqual(gezeigt(), [false, true, false, false]);
  // gewählte Seite 2 verstecken → nächste sichtbare danach (4, da 3 versteckt), kein Ereignis
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "p2", sichtbar: false }] });
  assert.deepEqual(tabs().map((b) => b.hidden), [false, true, true, false]);
  assert.deepEqual(gezeigt(), [false, false, false, true]);
  assert.deepEqual(tabs().map((b) => b.getAttribute("aria-selected")), ["false", "false", "false", "true"]);
  assert.deepEqual(tabs().map((b) => b.tabIndex), [-1, -1, -1, 0]);
  assert.equal($("r").querySelector("[role=tabpanel]").getAttribute("aria-label"), "D");
  assert.deepEqual(ereignisse, []);
  // auch Seite 4 weg → letzte sichtbare davor (1)
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "p4", sichtbar: false }] });
  assert.deepEqual(gezeigt(), [true, false, false, false]);
  assert.deepEqual(ereignisse, []);
  // alle versteckt → leere Leiste, leere Fläche
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "p1", sichtbar: false }] });
  assert.deepEqual(tabs().map((b) => b.hidden), [true, true, true, true]);
  assert.deepEqual(gezeigt(), [false, false, false, false]);
  assert.equal($("r").querySelector("[role=tabpanel]").hasAttribute("aria-label"), false);
  // zurück: 2 und 4 sichtbar → gewaehlt (2) gilt wieder
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "p2", sichtbar: true }, { id: "p4", sichtbar: true }] });
  assert.deepEqual(tabs().map((b) => b.hidden), [true, false, true, false]);
  assert.deepEqual(gezeigt(), [false, true, false, false]);
  // Pfeiltasten überspringen versteckte Seiten (mit Umlauf), Home/End auf die erste/letzte sichtbare
  taste(win, tabs()[1], "ArrowRight");
  assert.deepEqual(gezeigt(), [false, false, false, true]);
  taste(win, tabs()[3], "ArrowRight");
  assert.deepEqual(gezeigt(), [false, true, false, false], "Umlauf über die versteckten 1 und 3");
  taste(win, tabs()[1], "ArrowLeft");
  assert.deepEqual(gezeigt(), [false, false, false, true]);
  taste(win, tabs()[3], "Home");
  assert.deepEqual(gezeigt(), [false, true, false, false]);
  taste(win, tabs()[1], "End");
  assert.deepEqual(gezeigt(), [false, false, false, true]);
  assert.deepEqual(ereignisse.map((e) => e.wert), [4, 2, 4, 2, 4], "nur Gast-Wechsel senden die echte Seitennummer");
  // Klick auf die Ersatzseite, wenn gewaehlt versteckt ist: sendet die echte Nummer nur bei Wechsel der gezeigten Seite
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "r", gewaehlt: 3 }] });
  assert.deepEqual(gezeigt(), [false, false, false, true], "gewaehlt 3 ist versteckt → 4");
  assert.equal(ereignisse.length, 5);
  tabs()[3].click();
  assert.equal(ereignisse.length, 5, "Klick auf die schon gezeigte Ersatzseite sendet nichts");
  tabs()[1].click();
  assert.deepEqual(ereignisse.at(-1), { typ: "aenderung", id: "r", wert: 2 });
  assert.deepEqual(warnungen, []);
}));

test("v4 K-107 reiter: weich ausblendende Seite (uebergang) – Tab sofort weg, Ersatzseite sofort; gezeigt() stimmt", mitUhr(({ t, $, uhr, ereignisse }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "r", art: "reiter", titel: ["A", "B"], gewaehlt: 1, kinder: [
    { id: "p1", art: "stapel", uebergang: true, kinder: [{ id: "k", art: "knopf", text: "x" }] }, { id: "p2", art: "schild", text: "2" }] } });
  const tabs = () => [...$("r").querySelectorAll("[role=tab]")];
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "p1", sichtbar: false }] });
  assert.equal($("p1").hidden, false, "blendet noch aus");
  assert.ok($("p1").classList.contains("theke-ueb-aus"));
  assert.deepEqual(tabs().map((b) => b.hidden), [true, false], "Tab verschwindet sofort");
  assert.equal($("p2").classList.contains("theke-reiter-aus"), false, "Ersatzseite sofort gezeigt");
  animiere(t, [{ id: "k", art: "puls" }]);
  assert.deepEqual(animKlassen($("k")), [], "Kind der ausblendenden Seite gilt als nicht gezeigt");
  uhr.vor(250);
  assert.equal($("p1").hidden, true);
  assert.deepEqual(tabs().map((b) => b.hidden), [true, false]);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "p1", sichtbar: true }] });
  assert.deepEqual(tabs().map((b) => b.hidden), [false, false]);
  assert.equal($("p1").classList.contains("theke-reiter-aus"), false, "gewaehlt 1 gilt wieder");
  assert.deepEqual(ereignisse, []);
}));

test("v4 K-107 Registry-Hook kindSichtbar: eigener Behälter erfährt sichtbar-Wechsel seiner Kinder (auch in innerem Bereich)", mitUmgebung(({ PizzaTheke, t }) => {
  const protokoll = [];
  PizzaTheke.registriere("kiste", {
    felder: ["kinder"],
    erzeuge(k, ctx) { const el = ctx.dokument.createElement("div"); el.appendChild(ctx.dokument.createElement("div")); return el; },
    aktualisiere(el, f, ctx) { if (f.kinder) ctx.setzeKinder(el.firstChild, f.kinder); },
    kindSichtbar(el, kindEl, ctx) { protokoll.push([ctx.id, kindEl.getAttribute("data-theke-id"), kindEl.hidden]); },
  });
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "ki", art: "kiste", kinder: [{ id: "a", art: "schild", text: "a" }, { id: "b", art: "schild", text: "b", sichtbar: false }] },
    { id: "c", art: "schild", text: "c" }] } });
  assert.deepEqual(protokoll, [], "im Bau noch nicht angehängt → kein Hook (der Behälter zeichnet ohnehin)");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "a", sichtbar: false }, { id: "a", sichtbar: false }, { id: "b", sichtbar: true }, { id: "c", sichtbar: false }] });
  assert.deepEqual(protokoll, [["ki", "a", true], ["ki", "b", false]], "nur echte Wechsel; stapel hat keinen Hook");
}));

test("v4 K-108 abschnitt: klappbar → Kopf-Knopf mit aria-expanded, Klick klappt sofort und sendet aenderung; zu vom Programm sendet nie", mitUmgebung(({ t, $, ereignisse, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "a", art: "abschnitt", titel: "Erledigt", klappbar: true, kinder: [{ id: "k", art: "knopf", text: "x" }] },
    { id: "b", art: "abschnitt", titel: "Fest", kinder: [{ id: "s", art: "schild", text: "y" }] },
    { id: "c", art: "abschnitt", titel: "Zu", klappbar: true, zu: true, kinder: [] },
    { id: "d", art: "abschnitt", titel: "", klappbar: true, kinder: [] }] } });
  const kopf = (id) => $(id).querySelector(".theke-abschnitt-titel");
  const knopf = (id) => kopf(id).querySelector("button");
  const inhalt = (id) => $(id).querySelector(".theke-abschnitt-inhalt");
  assert.equal(kopf("a").tagName, "H3");
  assert.ok(knopf("a"), "klappbar: Knopf im Kopf");
  assert.equal(knopf("a").type, "button");
  assert.equal(knopf("a").textContent, "Erledigt");
  assert.equal(knopf("a").getAttribute("aria-expanded"), "true");
  assert.equal(inhalt("a").hidden, false);
  assert.equal(knopf("b"), null, "nicht klappbar: kein Knopf, Kopf wie bisher");
  assert.equal(kopf("b").textContent, "Fest");
  assert.equal(knopf("c").getAttribute("aria-expanded"), "false");
  assert.equal(inhalt("c").hidden, true, "zu im baum: Inhalt sofort hidden");
  assert.equal(kopf("d").hidden, false, "leerer Titel + klappbar: Kopf (nur Pfeil) bleibt sichtbar");
  assert.equal(knopf("d").textContent, "");

  knopf("a").click();
  assert.equal(inhalt("a").hidden, true, "sofort lokal zugeklappt");
  assert.equal(knopf("a").getAttribute("aria-expanded"), "false");
  assert.deepEqual(ereignisse, [{ typ: "aenderung", id: "a", wert: true }]);
  knopf("a").click();
  assert.equal(inhalt("a").hidden, false);
  assert.deepEqual(ereignisse.at(-1), { typ: "aenderung", id: "a", wert: false });
  // Programm setzt zu → kein Ereignis; nicht klappbar + zu → Inhalt weg, kein Knopf
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "a", zu: true }, { id: "b", zu: true }, { id: "c", zu: false }] });
  assert.equal(inhalt("a").hidden, true);
  assert.equal(knopf("a").getAttribute("aria-expanded"), "false");
  assert.equal(inhalt("b").hidden, true);
  assert.equal(knopf("b"), null);
  assert.equal(inhalt("c").hidden, false);
  assert.equal(ereignisse.length, 2);
  // klappbar nachträglich aus/an; Titel bleibt
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "a", klappbar: false }, { id: "b", klappbar: true, titel: "Jetzt klappbar" }] });
  assert.equal(knopf("a"), null);
  assert.equal(kopf("a").textContent, "Erledigt");
  assert.equal(knopf("b").textContent, "Jetzt klappbar");
  knopf("b").click();
  assert.equal(inhalt("b").hidden, false);
  assert.deepEqual(ereignisse.at(-1), { typ: "aenderung", id: "b", wert: false });
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "b", titel: "" }] });
  assert.equal(kopf("b").hidden, false);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "b", klappbar: false }] });
  assert.equal(kopf("b").hidden, true, "ohne klappbar versteckt der leere Titel den Kopf");
  assert.deepEqual(warnungen, [], "klappbar/zu sind bekannte Felder");
}));

test("v4 K-108 abschnitt: zu → Kinder gelten als nicht gezeigt; mit uebergang blendet der Inhalt weich; Aufräumen", mitUhr(({ t, $, uhr, ereignisse }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "a", art: "abschnitt", titel: "A", klappbar: true, uebergang: true, kinder: [{ id: "k", art: "knopf", text: "x" }] },
    { id: "b", art: "abschnitt", titel: "B", zu: true, kinder: [{ id: "s", art: "schild", text: "y" }] }] } });
  animiere(t, [{ id: "s", art: "puls" }]);
  assert.deepEqual(animKlassen($("s")), [], "Kind eines zugeklappten Abschnitts: nicht gezeigt");
  const inhalt = $("a").querySelector(".theke-abschnitt-inhalt");
  $("a").querySelector("button").click();
  assert.equal(inhalt.hidden, false, "blendet noch aus");
  assert.ok(inhalt.classList.contains("theke-ueb-aus"));
  assert.ok(inhalt.hasAttribute("inert"));
  $("k").click();
  assert.deepEqual(ereignisse, [{ typ: "aenderung", id: "a", wert: true }], "Kind des ausblendenden Inhalts sendet nicht mehr");
  animiere(t, [{ id: "k", art: "puls" }]);
  assert.deepEqual(animKlassen($("k")), []);
  uhr.vor(250);
  assert.equal(inhalt.hidden, true);
  assert.ok(!inhalt.classList.contains("theke-ueb-aus"));
  $("a").querySelector("button").click();
  assert.equal(inhalt.hidden, false);
  assert.deepEqual(animKlassen(inhalt), ["theke-ueb-ein"], "Inhalt blendet ein");
  uhr.vor(250);
  assert.deepEqual(animKlassen(inhalt), []);
  // Timer eines laufenden Ausblendens wird beim Entfernen gelöscht
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "a", zu: true }] });
  assert.ok(inhalt.classList.contains("theke-ueb-aus"));
  assert.equal(uhr.spaeter.size, 1);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "w", kinder: [] }] });
  assert.equal(uhr.spaeter.size, 0, "kein verwaister Timer");
  assert.equal(ereignisse.length, 2);
}));

test("v4 K-109 auswahl: radiogroup, Klick/Pfeile/Home/End senden nur bei Wechsel, Klemmen, aktiv:false", mitUmgebung(({ t, $, win, ereignisse, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "m", art: "auswahl", optionen: ["1×", "10×", "100×", "Max"], gewaehlt: 1, stil: { farbe: "basilikum" } }] } });
  const el = $("m");
  const opt = () => [...el.querySelectorAll("[role=radio]")];
  assert.equal(el.getAttribute("role"), "radiogroup");
  assert.ok(el.classList.contains("theke-farbe-basilikum"));
  assert.deepEqual(opt().map((o) => o.textContent), ["1×", "10×", "100×", "Max"]);
  assert.deepEqual(opt().map((o) => o.tagName + ":" + o.type), Array(4).fill("BUTTON:button"));
  assert.deepEqual(opt().map((o) => o.getAttribute("aria-checked")), ["true", "false", "false", "false"]);
  assert.deepEqual(opt().map((o) => o.tabIndex), [0, -1, -1, -1]);
  assert.deepEqual(opt().map((o) => o.classList.contains("theke-auswahl-option-an")), [true, false, false, false]);

  opt()[1].click();
  assert.deepEqual(opt().map((o) => o.getAttribute("aria-checked")), ["false", "true", "false", "false"], "sofort lokal");
  assert.deepEqual(ereignisse, [{ typ: "aenderung", id: "m", wert: 2 }]);
  opt()[1].click();
  assert.equal(ereignisse.length, 1, "gleiche Option: nichts");
  // Tastatur: Pfeile mit Umlauf, Home/End; Hoch/Runter bleiben unangetastet (gehören einer Tastatur)
  assert.equal(taste(win, opt()[1], "ArrowRight").defaultPrevented, true);
  assert.equal(taste(win, opt()[2], "ArrowRight").defaultPrevented, true);
  taste(win, opt()[3], "ArrowRight");
  taste(win, opt()[0], "ArrowLeft");
  taste(win, opt()[3], "Home");
  taste(win, opt()[0], "End");
  assert.equal(taste(win, opt()[3], "ArrowDown").defaultPrevented, false);
  assert.deepEqual(ereignisse.map((e) => e.wert), [2, 3, 4, 1, 4, 1, 4]);
  assert.equal(win.document.activeElement, opt()[3], "Tastenwahl fokussiert die neue Option");
  // Programm wählt → kein Ereignis; Klemmen auf 1…n; ungültig → 1 + Warnung
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "m", gewaehlt: 2 }] });
  assert.deepEqual(opt().map((o) => o.getAttribute("aria-checked")), ["false", "true", "false", "false"]);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "m", gewaehlt: 9 }] });
  assert.deepEqual(opt().map((o) => o.getAttribute("aria-checked")), ["false", "false", "false", "true"]);
  assert.deepEqual(warnungen, []);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "m", gewaehlt: 0 }] });
  assert.deepEqual(opt().map((o) => o.getAttribute("aria-checked")), ["true", "false", "false", "false"]);
  assert.ok(warnungen.some((w) => /auswahl\.gewaehlt/.test(w)));
  assert.equal(ereignisse.length, 7);
  // optionen als ganze Liste; gewaehlt bleibt roh und wird geklemmt
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "m", gewaehlt: 3, optionen: ["a", "b"] }] });
  assert.deepEqual(opt().map((o) => o.textContent), ["a", "b"]);
  assert.deepEqual(opt().map((o) => o.getAttribute("aria-checked")), ["false", "true"]);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "m", optionen: ["a", "b", "c", "d"] }] });
  assert.deepEqual(opt().map((o) => o.getAttribute("aria-checked")), ["false", "false", "true", "false"], "roh gespeichertes gewaehlt 3 gilt wieder");
  // aktiv:false → alle Knöpfe deaktiviert, kein Ereignis (auch nicht per Klick-Ereignis oder Taste)
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "m", aktiv: false }] });
  assert.deepEqual(opt().map((o) => o.disabled), [true, true, true, true]);
  assert.ok(el.classList.contains("theke-inaktiv"));
  opt()[0].dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  taste(win, opt()[2], "ArrowRight");
  assert.equal(ereignisse.length, 7);
  assert.deepEqual(opt().map((o) => o.getAttribute("aria-checked")), ["false", "false", "true", "false"]);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "m", aktiv: true }] });
  assert.deepEqual(opt().map((o) => o.disabled), [false, false, false, false]);
  opt()[0].click();
  assert.deepEqual(ereignisse.at(-1), { typ: "aenderung", id: "m", wert: 1 });
  // leere Liste: nichts zu wählen, keine Ausnahme
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "m", optionen: [] }] });
  assert.equal(opt().length, 0);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "m", optionen: "x" }] });
  assert.ok(warnungen.some((w) => /auswahl\.optionen/.test(w)));
}));

test("v4 K-110 tastatur: unsichtbar; keydown auf der Wurzel → taste mit deutschen Sondertasten; Filter; mehrere in Baumreihenfolge", mitUmgebung(({ t, $, win, ereignisse, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "k", art: "knopf", text: "Fangen!" }, { id: "e", art: "eingabe", wert: "" },
    { id: "t1", art: "tastatur" }, { id: "t2", art: "tastatur", aktiv: false }] } });
  const wurzel = t.element;
  assert.equal(wurzel.getAttribute("tabindex"), "-1");
  assert.equal($("t1").hidden, true);
  assert.equal($("t1").getAttribute("aria-hidden"), "true");
  const paare = [[" ", "Leertaste"], ["ArrowLeft", "Links"], ["ArrowRight", "Rechts"], ["ArrowUp", "Hoch"], ["ArrowDown", "Runter"],
    ["Backspace", "Rücktaste"], ["Delete", "Entfernen"], ["Home", "Pos1"], ["End", "Ende"], ["PageUp", "BildHoch"], ["PageDown", "BildRunter"],
    ["Enter", "Enter"], ["Escape", "Escape"], ["Tab", "Tab"], ["F1", "F1"], ["F12", "F12"], ["a", "a"], ["A", "A"], ["1", "1"], ["+", "+"], ["ä", "ä"]];
  for (const [key] of paare) taste(win, wurzel, key);
  assert.deepEqual(ereignisse, paare.map(([, name]) => ({ typ: "taste", id: "t1", taste: name })), "nur die aktive Tastatur t1");
  ereignisse.length = 0;
  // nicht gesendet: Modifikatoren, Dead/Unidentified, Komposition, Wiederholung, Ziel in einer Eingabe
  for (const key of ["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "NumLock", "ScrollLock", "Fn", "Dead", "Unidentified", ""]) taste(win, wurzel, key);
  taste(win, wurzel, "a", { repeat: true });
  taste(win, wurzel, "a", { isComposing: true });
  taste(win, wurzel, "Process", { keyCode: 229 });
  taste(win, $("e"), "a");
  taste(win, $("e"), " ");
  assert.deepEqual(ereignisse, []);
  // K-114: Leertaste/Enter auf einem fokussierten Knopf gehören dem Knopf (kein taste); andere Tasten erreichen die Tastatur
  taste(win, $("k"), " ");
  taste(win, $("k"), "Enter");
  assert.deepEqual(ereignisse, []);
  taste(win, $("k"), "a");
  assert.deepEqual(ereignisse, [{ typ: "taste", id: "t1", taste: "a" }]);
  ereignisse.length = 0;
  // mehrere aktive Tastaturen: Baumreihenfolge, auch nach Umsortieren per kinder
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "t2", aktiv: true }] });
  taste(win, wurzel, "x");
  assert.deepEqual(ereignisse.map((e) => e.id), ["t1", "t2"]);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "w", kinder: [{ id: "t2" }, { id: "k" }, { id: "t1" }] }] });
  ereignisse.length = 0;
  taste(win, wurzel, "x");
  assert.deepEqual(ereignisse.map((e) => e.id), ["t2", "t1"]);
  // inaktiv / entfernt → nichts; nach schliesse nichts
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "t1", aktiv: false }, { id: "w", kinder: [{ id: "k" }, { id: "t1" }] }] });
  ereignisse.length = 0;
  taste(win, wurzel, "x");
  assert.deepEqual(ereignisse, []);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "t1", aktiv: true }] });
  taste(win, wurzel, "y");
  assert.deepEqual(ereignisse, [{ typ: "taste", id: "t1", taste: "y" }]);
  t.empfange({ v: 1, op: "schliesse" });
  taste(win, wurzel, "y");
  assert.equal(ereignisse.length, 1);
  assert.deepEqual(warnungen, [], "aktiv ist ein bekanntes Feld");
}));

test("v4 K-110 tastatur: preventDefault für Leertaste/Pfeile/Pos1/Ende/Bild nur mit aktiver Tastatur und Ziel = Wurzel", mitUmgebung(({ t, $, win }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [{ id: "k", art: "knopf", text: "x" }, { id: "t1", art: "tastatur", aktiv: false }] } });
  const wurzel = t.element;
  assert.equal(taste(win, wurzel, " ").defaultPrevented, false, "keine aktive Tastatur");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "t1", aktiv: true }] });
  for (const key of [" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"])
    assert.equal(taste(win, wurzel, key).defaultPrevented, true, key);
  for (const key of ["a", "Enter", "Escape", "Tab", "F5", "Backspace"]) assert.equal(taste(win, wurzel, key).defaultPrevented, false, key);
  assert.equal(taste(win, $("k"), " ").defaultPrevented, false, "fokussierter Knopf behält Leertaste");
  assert.equal(taste(win, $("k"), "Enter").defaultPrevented, false);
  assert.equal(taste(win, $("k"), "ArrowDown").defaultPrevented, false);
}));

const zeigerKlick = (win, ziel, detail = 1) => {
  const ev = new win.MouseEvent("click", { bubbles: true, cancelable: true, detail });
  ziel.dispatchEvent(ev);
  return ev;
};

test("v4 K-114 eine Taste, ein Empfänger: Leertaste/Enter auf fokussierten Bedienelementen und Navigationstasten von Reiter/Auswahl erreichen keine Tastatur", mitUmgebung(({ t, $, win, ereignisse }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "k", art: "knopf", text: "Kaufen" }, { id: "h", art: "haken", text: "Extra", an: false },
    { id: "a", art: "abschnitt", titel: "Mehr", klappbar: true, kinder: [] },
    { id: "r", art: "reiter", titel: ["Eins", "Zwei"], kinder: [{ id: "s1", art: "stapel", kinder: [] }, { id: "s2", art: "stapel", kinder: [] }] },
    { id: "m", art: "auswahl", optionen: ["x1", "x10"], gewaehlt: 1 },
    { id: "t1", art: "tastatur" }] } });
  const box = $("h").querySelector(".theke-haken-box");
  const kopf = $("a").querySelector(".theke-abschnitt-knopf");
  const tab = $("r").querySelectorAll(".theke-reiter-tab")[0];
  const opt = $("m").querySelectorAll(".theke-auswahl-option")[0];
  for (const ziel of [$("k"), box, kopf, tab, opt]) { taste(win, ziel, " "); taste(win, ziel, "Enter"); }
  assert.deepEqual(ereignisse, [], "Leertaste/Enter gehören dem fokussierten Bedienelement");
  // Navigationstasten, die Reiter/Auswahl selbst verarbeiten, ebenso
  taste(win, tab, "ArrowRight");
  taste(win, opt, "ArrowRight");
  assert.deepEqual(ereignisse.filter((e) => e.typ === "taste"), []);
  assert.deepEqual(ereignisse.map((e) => e.id), ["r", "m"]);
  ereignisse.length = 0;
  // Was ein Bedienelement nicht verarbeitet, kommt an (auch auf dem Haken: er ist keine Eingabe)
  taste(win, box, "1");
  taste(win, $("k"), "ArrowDown");
  taste(win, $("m").querySelectorAll(".theke-auswahl-option")[1], "ArrowDown");
  assert.deepEqual(ereignisse, [{ typ: "taste", id: "t1", taste: "1" }, { typ: "taste", id: "t1", taste: "Runter" },
    { typ: "taste", id: "t1", taste: "Runter" }]);
}));

test("v4 K-114 Zeigerklick: Fokus geht vom Bedienelement an die Wurzel (Leertaste danach = nur taste); Tastatur-Klick (detail 0) lässt den Fokus", mitUmgebung(({ t, $, win, doc, ereignisse }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "k", art: "knopf", text: "Kaufen" }, { id: "h", art: "haken", text: "Extra", an: false },
    { id: "e", art: "eingabe", wert: "" }, { id: "s", art: "schild", text: "Text" }, { id: "t1", art: "tastatur" }] } });
  const wurzel = t.element;
  // Maus: Browser fokussiert den Knopf beim Drücken, der Klick gibt den Fokus an die Wurzel
  $("k").focus();
  zeigerKlick(win, $("k"));
  assert.equal(doc.activeElement, wurzel);
  assert.deepEqual(ereignisse, [{ typ: "klick", id: "k" }]);
  ereignisse.length = 0;
  const ev = taste(win, doc.activeElement, " ");
  assert.deepEqual(ereignisse, [{ typ: "taste", id: "t1", taste: "Leertaste" }], "nur taste, kein zweiter Klick");
  assert.equal(ev.defaultPrevented, true, "Wurzel fokussiert → Scrollen unterdrückt");
  ereignisse.length = 0;
  // Haken per Maus (Label-Klick fokussiert die Box, ihr Klick gibt den Fokus zurück)
  const box = $("h").querySelector(".theke-haken-box");
  box.focus();
  box.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  assert.equal(doc.activeElement, wurzel);
  assert.equal(box.checked, true);
  ereignisse.length = 0;
  // Tastatur-Aktivierung (detail 0): Fokus bleibt auf dem Knopf (Tab + Leertaste bleibt bedienbar)
  $("k").focus();
  zeigerKlick(win, $("k"), 0);
  assert.equal(doc.activeElement, $("k"));
  // Klick auf Eingabe oder Schild: kein Fokuswechsel durch die Theke
  $("e").focus();
  zeigerKlick(win, $("e"));
  assert.equal(doc.activeElement, $("e"));
  zeigerKlick(win, $("s"));
  assert.equal(doc.activeElement, $("e"));
}));

test("v4 K-110 Fokus beim baum: Wurzel wird fokussiert, wenn nichts (oder body) fokussiert ist – sonst kein Fokusdiebstahl", mitUmgebung(({ t, $, doc }) => {
  assert.equal(doc.activeElement, doc.body);
  t.empfange(BAUM);
  assert.equal(doc.activeElement, t.element, "nichts fokussiert → Wurzel");
  $("z2").focus();
  assert.equal(doc.activeElement, $("z2"));
  t.empfange({ v: 1, op: "baum", wurzel: { id: "n", art: "schild", text: "neu" } });
  assert.equal(doc.activeElement, t.element, "neuer baum entfernt das fokussierte Feld → body → Wurzel");
  // etwas außerhalb der Theke (Editor) ist fokussiert → bleibt
  const editor = doc.createElement("textarea");
  doc.body.appendChild(editor);
  editor.focus();
  t.empfange(BAUM);
  assert.equal(doc.activeElement, editor, "kein Fokusdiebstahl");
  editor.remove();
}));

test("v4 K-110 Registry-Hook taste: eigene Zutat bekommt Tastennamen, Rückgabe true zählt als aktiv", mitUmgebung(({ PizzaTheke, t, win, ereignisse }) => {
  PizzaTheke.registriere("lauscher", {
    erzeuge(k, ctx) { return ctx.dokument.createElement("div"); },
    taste(el, name, ctx, e) { ctx.sende("taste", { taste: name, typ2: e.type }); return name === "Leertaste"; },
  });
  t.empfange({ v: 1, op: "baum", wurzel: { id: "l", art: "lauscher" } });
  assert.equal(taste(win, t.element, "ArrowUp").defaultPrevented, false, "Rückgabe false → nicht aktiv → kein preventDefault");
  assert.equal(taste(win, t.element, " ").defaultPrevented, true);
  assert.deepEqual(ereignisse, [{ typ: "taste", id: "l", taste: "Hoch", typ2: "keydown" }, { typ: "taste", id: "l", taste: "Leertaste", typ2: "keydown" }]);
}));

test("v4 K-113 Stile zeilen/mindestbreite: Custom-Properties + Klassen, null entfernt, ungültig ignoriert; knopf-Text im span", mitUmgebung(({ t, $, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "s", art: "schild", text: "lang", stil: { zeilen: 2, mindestbreite: 120 } },
    { id: "k", art: "knopf", text: "Kaufen", stil: { zeilen: 1, mindestbreite: 160.5 } },
    { id: "h", art: "haken", text: "Haken", stil: { zeilen: 3 } },
    { id: "f", art: "fortschritt", wert: 0.5, stil: { zeilen: 2, mindestbreite: "voll" } }] } });
  assert.equal($("s").style.getPropertyValue("--theke-zeilen"), "2");
  assert.ok($("s").classList.contains("theke-hat-zeilen"));
  assert.equal($("s").style.getPropertyValue("--theke-mindestbreite"), "120px");
  assert.ok($("s").classList.contains("theke-hat-mindestbreite"));
  assert.equal($("k").style.getPropertyValue("--theke-mindestbreite"), "160.5px");
  assert.equal($("k").style.getPropertyValue("--theke-zeilen"), "1");
  assert.equal($("k").querySelector(".theke-knopf-text").textContent, "Kaufen");
  assert.equal($("k").textContent, "Kaufen");
  assert.equal($("h").style.getPropertyValue("--theke-zeilen"), "3");
  assert.equal($("f").style.getPropertyValue("--theke-zeilen"), "2", "andere Arten tragen die Property, das CSS ignoriert sie");
  assert.equal($("f").style.getPropertyValue("--theke-mindestbreite"), "100%");
  assert.deepEqual(warnungen, []);
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "s", stil: { zeilen: null, mindestbreite: null } }, { id: "k", text: "Teurer kaufen" }] });
  assert.equal($("s").style.getPropertyValue("--theke-zeilen"), "");
  assert.ok(!$("s").classList.contains("theke-hat-zeilen"));
  assert.equal($("s").style.getPropertyValue("--theke-mindestbreite"), "");
  assert.ok(!$("s").classList.contains("theke-hat-mindestbreite"));
  assert.equal($("k").textContent, "Teurer kaufen");
  assert.equal($("k").children.length, 1);
  for (const falsch of [0, -1, 1.5, "2", NaN, Infinity, true]) {
    warnungen.length = 0;
    t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "h", stil: { zeilen: falsch } }] });
    assert.ok(warnungen.some((w) => /stil\.zeilen/.test(w)), String(falsch));
    assert.equal($("h").style.getPropertyValue("--theke-zeilen"), "3", "alter Wert bleibt: " + String(falsch));
  }
  warnungen.length = 0;
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "h", stil: { mindestbreite: "breit" } }] });
  assert.ok(warnungen.some((w) => /stil\.mindestbreite/.test(w)));
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "h", stil: { mindestbreite: 99999 } }] });
  assert.equal($("h").style.getPropertyValue("--theke-mindestbreite"), "4000px", "wie breite geklemmt");
}));

test("v4: keine Feldwarnungen bei vollständigen v4-Knoten", mitUmgebung(({ t, warnungen }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "a", art: "abschnitt", titel: "T", klappbar: true, zu: true, uebergang: true, kinder: [] },
    { id: "m", art: "auswahl", optionen: ["a"], gewaehlt: 1, aktiv: false, stil: { farbe: "kruste", zeilen: 1, mindestbreite: 10 } },
    { id: "t1", art: "tastatur", aktiv: false, hinweis: "x" },
    { id: "r", art: "reiter", titel: ["A"], gewaehlt: 1, kinder: [{ id: "p", art: "schild", text: "p", sichtbar: false }] }] } });
  assert.deepEqual(warnungen, []);
}));

test("K-115: vollständiger Knoten in kinder ist der ganze Zustand – wiederverwendetes Element fällt auf Standard zurück", mitUmgebung(({ t, $ }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "p", art: "stapel", kinder: [{ id: "c", art: "schild", text: "c", sichtbar: false, hinweis: "h", stil: { farbe: "tomate", breite: 10 } },
      { id: "k", art: "knopf", text: "k", aktiv: false }] },
    { id: "q", art: "abschnitt", titel: "leer", klappbar: true, zu: true, kinder: [] }] } });
  const c = $("c"), k = $("k");
  assert.equal(c.hidden, true);
  // Zutaten wandern von p nach q (q steht vorn in der Nachricht): das Programm sendet sie vollständig, ohne Standardfelder.
  t.empfange({ v: 1, op: "aendere", aenderungen: [
    { id: "q", titel: "voll", kinder: [{ id: "c", art: "schild", text: "c1", stil: { breite: 10 } }, { id: "k", art: "knopf", text: "k" }] },
    { id: "p", kinder: [] }] });
  assert.equal($("c"), c, "Element bleibt erhalten");
  assert.equal($("k"), k);
  assert.equal(c.hidden, false);
  assert.equal(c.textContent, "c1");
  assert.equal(c.getAttribute("title"), null);
  assert.equal(c.className.includes("theke-farbe-"), false);
  assert.equal(c.classList.contains("theke-hat-breite"), true);
  assert.equal(k.disabled, false);
  assert.equal($("q").parentNode !== null, true);
  // Verweis ohne art bleibt ein Teil-Update
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "c", sichtbar: false }] });
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "q", kinder: [{ id: "c" }, { id: "k" }] }] });
  assert.equal(c.hidden, true);
}));

test("K-115: Abschnitt als vollständiger Knoten ohne klappbar/zu → aufgeklappt, nicht klappbar", mitUmgebung(({ t, $ }) => {
  t.empfange({ v: 1, op: "baum", wurzel: { id: "w", art: "stapel", kinder: [
    { id: "a", art: "abschnitt", titel: "A", klappbar: true, zu: true, kinder: [{ id: "s", art: "schild", text: "x" }] }] } });
  const a = $("a");
  t.empfange({ v: 1, op: "aendere", aenderungen: [{ id: "w", kinder: [{ id: "a", art: "abschnitt", titel: "A", kinder: [{ id: "s", art: "schild", text: "x" }] }] }] });
  assert.equal($("a"), a);
  assert.equal(a.querySelector(".theke-abschnitt-knopf"), null, "nicht mehr klappbar");
  assert.equal($("s").parentNode.hidden, false, "aufgeklappt");
}));
