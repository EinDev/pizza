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
  assert.deepEqual(PizzaTheke.arten().sort(), ["abschnitt", "eingabe", "fortschritt", "haken", "knopf", "reihe", "reiter", "schild",
    "stapel", "tabelle", "takt"]);
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
  };
  uhr.vor = (ms) => { uhr.t += ms; for (const { fn } of [...uhr.laufend.values()]) fn(); };
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
