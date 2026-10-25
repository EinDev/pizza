"use strict";
// Projekte und Mehrdatei-Programme – Lader (SPEC §2.1–§2.6, §14.7, §14.8; KLAERUNGEN K-138 … K-141, K-144; Konzept PROJEKTE.md).
// Umgesetzt in PROJEKTE PA1 (Interpreter-Lader PizzaLang.projekt.*); aus a19-projekte-offen.js verschoben. Kiste und
// Bildchen.laden (SPEC §11.2, §18.5; K-145 … K-147) umgesetzt in PROJEKTE PD2 – ebenfalls aus a19-projekte-offen.js verschoben
// (die Datei ist damit leer und entfällt), dazu Fälle zu optionen.teiglinge/vorbacker.
//
// `code` ist meist ein Projekt { dateien: { pfad → Inhalt }, hauptdatei? } (ARCHITEKTUR §1, §6); Textdateien als String,
// Bilder als Uint8Array. Die Differenztests überspringen Projekt-Fälle (dort nur Strings), bis PA2 sie unterstützt.
const { P, F } = require("../lib/helfer");
const { projekt, ereignisse, fehlerEv, j, fehlerOrt, warnOrte, keineWarnung, nullSchritte, alle, png, pngKopf, KLEIN, gross, KAPUTT, MAIN } = require("../lib/projekt-helfer");
const T = "§2 Projekte und Mehrdatei-Programme (K-138 … K-141)";
const TK = "§2 Projekte: Kiste, Bilddateien (K-145 … K-147)";
const api = (name, fn) => ({ p: T, name, api: fn });
// Testmodelle (H-K16): von scripts/modelle-test.js erzeugt und eingecheckt
const TM = (n) => new Uint8Array(require("fs").readFileSync(require("path").join(__dirname, "..", "..", "herd", "teigling", "testmodelle", n)));
// Testklänge (H-K19a): von scripts/klaenge-test.js erzeugt und eingecheckt
const TKL = (n) => new Uint8Array(require("fs").readFileSync(require("path").join(__dirname, "..", "..", "herd", "teigling", "testklaenge", n)));

module.exports = [
  // ───────────────────────── §2.2 bestellt, Ladereihenfolge ─────────────────────────
  F(T, "K-139 §2.2: Grundfall – drei Dateien, bestellt in der Hauptdatei, Klassen aus Nebendateien", projekt({
    "hauptgang.pizza": P`
bestellt "rezepte/teig.pizza";
bestellt "rezepte/belag.pizza";

speisekarte klasse Pizzeria {
    speisekarte tiefkühl leer hauptgang(Blech<margherita> args) {
        Teig t = neu Teig(250);
        Bote.sage((t + " mit " + Belag.haus()));
    }
}
`,
    "rezepte/teig.pizza": P`
klasse Teig {
    salami gramm;
    Teig(salami g) { gramm = g; }
    margherita alsText() { serviere (gramm + " g Teig"); }
}
`,
    "rezepte/belag.pizza": P`
klasse Belag {
    speisekarte tiefkühl margherita haus() { serviere ("Tomate"); }
}
`,
  }), { out: ["250 g Teig mit Tomate"] }),

  F(T, "K-139 §2.2: Ladereihenfolge = Tiefensuche, bestellt in Textreihenfolge, Abhängigkeiten zuerst, jede Datei einmal, Hauptdatei zuletzt", projekt({
    "hauptgang.pizza": P`
bestellt "b.pizza";
bestellt "a.pizza";
bestellt "c.pizza";   // xc sieht die Hauptdatei nur mit eigener Bestellung (SPEC §2.4, nicht transitiv)
Bote.sage(("haupt " + (xa + xb + xc)));
`,
    "a.pizza": P`
bestellt "c.pizza";
salami xa = melde("a");
`,
    "b.pizza": P`
bestellt "c.pizza";
salami xb = melde("b");
`,
    "c.pizza": P`
salami melde(margherita s) { Bote.sage((s)); serviere (1); }
salami xc = melde("c");
`,
  }), { out: ["c", "b", "a", "haupt 3"] }),

  api("K-139 §2.7: projekt.lade liefert die Ladeliste (Hauptdatei zuletzt) und ein zusammengesetztes Programm", (lang) => {
    const r = lang.projekt.lade(projekt({
      "hauptgang.pizza": 'bestellt "b.pizza";\nbestellt "a.pizza";\nBote.sage(("x"));\n',
      "a.pizza": 'bestellt "c.pizza";\nsalami xa = 1;\n', "b.pizza": 'bestellt "c.pizza";\nsalami xb = 2;\n', "c.pizza": "salami xc = 3;\n",
      "alt.pizza": "das ist { kaputt", "daten/x.txt": "unbeteiligt",
    }));
    if (!r || r.ok !== true) return "lade: ok erwartet, bekam " + j(r);
    if (j(r.ladeliste) !== j(["c.pizza", "b.pizza", "a.pizza", "hauptgang.pizza"])) return "ladeliste " + j(r.ladeliste);
    if (r.dateien[0] !== "hauptgang.pizza") return "dateien[0] muss die Hauptdatei sein: " + j(r.dateien);
    if (!r.ast || !Array.isArray(r.ast.body)) return "ast.body fehlt";
    if (!Array.isArray(r.warnungen) || r.warnungen.length) return "warnungen: [] erwartet, bekam " + j(r.warnungen);
  }),

  F(T, "K-139 §2.2 Nr. 4: nicht erreichbare .pizza-Dateien gehören nicht zum Programm (auch mit Syntaxfehler, keine Warnung)", projekt({
    "hauptgang.pizza": 'Bote.sage(("nur ich"));\n',
    "alt/entwurf.pizza": "klasse { das ist kaputt\n",
  }), { out: ["nur ich"], check: (res) => (ereignisse(res, "warnung").length ? "keine Warnung erwartet" : undefined) }),

  F(T, "K-139 §2.2: Kreisbestellung → P0014 mit Pfadkette, Position = das bestellt, das den Kreis schließt", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nBote.sage(("nie"));\n',
    "a.pizza": 'bestellt "b.pizza";\nsalami a = 1;\n',
    "b.pizza": 'salami b = 2;\nbestellt "a.pizza";\n',
  }), {
    exit: 2,
    fehler: { code: "P0014", art: "pizzafehler", text: "PizzaFehler P0014: Kreisbestellung: hauptgang.pizza → a.pizza → b.pizza → a.pizza." },
    check: alle(fehlerOrt({ datei: "b.pizza", zeile: 2, spalte: 1 }), keineWarnung, nullSchritte),
  }),

  F(T, "K-139 §2.1: Nebendatei bestellt die Hauptdatei → P0014 (die Hauptdatei kann niemand bestellen)", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nsalami geteilt = 1;\n',
    "a.pizza": 'bestellt "hauptgang.pizza";\nsalami a = 1;\n',
  }), {
    exit: 2,
    fehler: { code: "P0014", text: "PizzaFehler P0014: Kreisbestellung: hauptgang.pizza → a.pizza → hauptgang.pizza." },
    check: fehlerOrt({ datei: "a.pizza", zeile: 1, spalte: 1 }),
  }),

  F(T, "K-139 §2.1: eine Datei bestellt sich selbst → P0014", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\n',
    "a.pizza": 'salami a = 1;\nbestellt "a.pizza";\n',
  }), {
    exit: 2,
    fehler: { code: "P0014", text: "PizzaFehler P0014: Kreisbestellung: hauptgang.pizza → a.pizza → a.pizza." },
    check: fehlerOrt({ datei: "a.pizza", zeile: 2 }),
  }),

  F(T, "K-139 §2.2 Nr. 3: fehlende Datei → P0015, Ort = das bestellt", projekt({
    "hauptgang.pizza": 'Bote.sage(("x"));\nbestellt "rezepte/tieg.pizza";\n',
    "rezepte/teig.pizza": "salami t = 1;\n",
  }), {
    exit: 2,
    fehler: { code: "P0015", art: "pizzafehler", text: 'PizzaFehler P0015: Die Datei "rezepte/tieg.pizza" gibt es im Projekt nicht.' },
    check: alle(fehlerOrt({ datei: "hauptgang.pizza", zeile: 2, spalte: 1 }), nullSchritte),
  }),

  F(T, "K-138/K-139: ungültiger Pfad im bestellt (Großbuchstaben) → P0015", projekt({
    "hauptgang.pizza": 'bestellt "Rezepte/Teig.pizza";\n',
  }), {
    exit: 2,
    fehler: { code: "P0015", text: 'PizzaFehler P0015: "Rezepte/Teig.pizza" ist kein gültiger Dateipfad (nur a–z, 0–9, -, _, . und /).' },
    check: fehlerOrt({ datei: "hauptgang.pizza", zeile: 1 }),
  }),

  F(T, "K-138/K-139: Pfad mit .. → P0015 (kein Ausbruch aus dem Projekt)", projekt({
    "hauptgang.pizza": 'bestellt "../geheim.pizza";\n',
  }), { exit: 2, fehler: { code: "P0015", text: 'PizzaFehler P0015: "../geheim.pizza" ist kein gültiger Dateipfad (nur a–z, 0–9, -, _, . und /).' } }),

  F(T, "K-139 §2.1: bestellt nur für .pizza-Dateien → P0015", projekt({
    "hauptgang.pizza": 'bestellt "daten/level.txt";\n',
    "daten/level.txt": "###\n",
  }), { exit: 2, fehler: { code: "P0015", text: 'PizzaFehler P0015: "daten/level.txt" ist keine .pizza-Datei – bestellen kann man nur Rezepte.' } }),

  F(T, "K-138 §1.5: bestellt in einem Ein-Datei-Programm (String) → P0015, datei null", 'bestellt "a.pizza";\nBote.sage(("nie"));\n', {
    exit: 2,
    fehler: { code: "P0015", text: 'PizzaFehler P0015: Die Datei "a.pizza" gibt es im Projekt nicht.' },
    check: fehlerOrt({ datei: null, zeile: 1, spalte: 1 }),
  }),

  F(T, "K-139 §2.1: bestellt ist kontextuell – als Bezeichner weiter gültig (auch neben echten Bestellungen)", projekt({
    "hauptgang.pizza": P`
bestellt "a.pizza";
salami bestellt = 3;
bestellt = bestellt + basis;
Bote.sage((bestellt));
`,
    "a.pizza": "salami basis = 1;\n",
  }), { out: ["4"] }),

  F(T, "K-139 §2.1: bestellt ohne ; → P0001 mit Datei", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza"\nBote.sage(("x"));\n',
    "a.pizza": "salami a = 1;\n",
  }), { exit: 2, fehler: { code: "P0001", art: "syntax" }, check: fehlerOrt({ datei: "hauptgang.pizza", zeile: 1 }) }),

  api("K-139 §2.7: parse kennt den Knoten Bestellt; ungültiger Pfad schon beim Parsen → P0015", (lang) => {
    const r = lang.parse('bestellt "rezepte/teig.pizza";\nsalami x = 1;\n');
    if (!r.ok) return "parse: ok erwartet, bekam " + j(r.fehler);
    const b = r.ast.body[0];
    if (!b || b.k !== "Bestellt" || b.pfad !== "rezepte/teig.pizza" || b.z !== 1) return "erster Knoten: " + j(b);
    const f = lang.parse('bestellt "A.pizza";\n');
    if (f.ok || f.fehler.code !== "P0015") return "ungültiger Pfad: P0015 erwartet, bekam " + j(f);
  }),

  F(T, "K-139 §2.2 Nr. 5: Syntaxfehler in einer Nebendatei – Datei und Zeile dieser Datei, erster in Besuchsreihenfolge", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nbestellt "b.pizza";\n',
    "a.pizza": "salami a = 1;\nsalami = ;\n",
    "b.pizza": "klasse {\n",
  }), { exit: 2, fehler: { code: "P0001", art: "syntax" }, check: alle(fehlerOrt({ datei: "a.pizza", zeile: 2 }), keineWarnung) }),

  // ───────────────────────── §2.3 Nebendateien ─────────────────────────
  F(T, "K-139 §2.3: Anweisung in einer Nebendatei → P0017, Position = erstes Token der Anweisung", projekt({
    "hauptgang.pizza": 'bestellt "rezepte/teig.pizza";\n',
    "rezepte/teig.pizza": 'salami t = 1;\n    Bote.sage(("hallo"));\n',
  }), {
    exit: 2,
    fehler: { code: "P0017", art: "pizzafehler", text: "PizzaFehler P0017: In rezepte/teig.pizza dürfen nur Rezepte stehen (Klassen, Funktionen, Variablen) – Anweisungen gehören in die Hauptdatei hauptgang.pizza." },
    check: fehlerOrt({ datei: "rezepte/teig.pizza", zeile: 2, spalte: 5 }),
  }),

  F(T, "K-139 §2.3: erlaubt in Nebendateien – paket/import, Klassen, Rezepturen, quattrostagioni, Funktionen, Variablen (gebacken, Mehrfachdeklaration)", projekt({
    "hauptgang.pizza": P`
bestellt "lager.pizza";
Bote.sage((a + b + c + " " + doppelt(MENGE) + " " + Jahreszeit.WINTER + " " + neu Kiste1().art()));
`,
    "lager.pizza": P`
paket de.luigi.lager;
import pizza.ofen.*;
rezeptur Behälter { margherita art(); }
klasse Kiste1 erfüllt Behälter { margherita art() { serviere ("Holz"); } }
quattrostagioni Jahreszeit { FRÜHLING, SOMMER, HERBST, WINTER }
gebacken salami MENGE = 21;
salami a = 1, b, c = a + 2;
salami doppelt(salami x) { serviere (x * 2); }
`,
  }), { out: ["4 42 WINTER Holz"] }),

  F(T, "K-139 §2.3: hauptgang (Methode) in einer Nebendatei → P0017", projekt({
    "hauptgang.pizza": 'bestellt "spiel.pizza";\nBote.sage(("x"));\n',
    "spiel.pizza": MAIN + '        Bote.sage(("falsch"));\n    }\n}\n',
  }), {
    exit: 2,
    fehler: { code: "P0017", text: "PizzaFehler P0017: hauptgang gehört in die Hauptdatei hauptgang.pizza, nicht nach spiel.pizza." },
    check: fehlerOrt({ datei: "spiel.pizza", zeile: 2 }),
  }),

  F(T, "K-139 §2.3: Top-Level-Funktion hauptgang in einer Nebendatei → P0017 (Hauptdatei aus pizza.json im Text)", projekt({
    "pizza.json": '{ "pizza": 1, "hauptdatei": "start.pizza" }',
    "start.pizza": 'bestellt "hilfe.pizza";\n',
    "hilfe.pizza": 'leer hauptgang(Blech<margherita> args) { Bote.sage(("falsch")); }\n',
  }), { exit: 2, fehler: { code: "P0017", text: "PizzaFehler P0017: hauptgang gehört in die Hauptdatei start.pizza, nicht nach hilfe.pizza." } }),

  // ───────────────────────── §2.1/§1.2 Hauptdatei, pizza.json ─────────────────────────
  F(T, "K-138 §1.2: hauptdatei aus pizza.json, args als Standard-Argumente ohne übergebene Argumente", projekt({
    "pizza.json": '{ "pizza": 1, "name": "Gruß", "hauptdatei": "spiel/start.pizza", "args": ["Luigi", "Mario"] }',
    "spiel/start.pizza": MAIN + "        Bote.sage((args.länge() + \" \" + args.stück(1)));\n    }\n}\n",
  }), { out: ["2 Luigi"] }),

  F(T, "K-138 §1.2: übergebene Argumente haben Vorrang vor args aus pizza.json", projekt({
    "pizza.json": '{ "pizza": 1, "args": ["Luigi"] }',
    "hauptgang.pizza": MAIN + "        Bote.sage((args.verbinde(\",\")));\n    }\n}\n",
  }), { args: ["Toni", "Gina"], out: ["Toni,Gina"] }),

  F(T, "K-138 §1.2: ungültige pizza.json (kein JSON) → P0015", projekt({
    "pizza.json": "{ pizza: 1 ",
    "hauptgang.pizza": 'Bote.sage(("nie"));\n',
  }), { exit: 2, fehler: { code: "P0015", art: "pizzafehler", text: "PizzaFehler P0015: pizza.json ist ungültig: kein gültiges JSON." }, check: alle(fehlerOrt({ datei: "pizza.json" }), nullSchritte) }),

  F(T, "K-138 §1.2: Feld mit falschem Typ → P0015 mit Grund", projekt({
    "pizza.json": '{ "pizza": 1, "hauptdatei": 5 }',
    "hauptgang.pizza": 'Bote.sage(("nie"));\n',
  }), { exit: 2, fehler: { code: "P0015", text: 'PizzaFehler P0015: pizza.json ist ungültig: "hauptdatei" muss ein Text sein.' } }),

  F(T, "K-138 §1.2: pizza fehlt in pizza.json → P0015", projekt({
    "pizza.json": '{ "name": "x" }',
    "hauptgang.pizza": 'Bote.sage(("nie"));\n',
  }), { exit: 2, fehler: { code: "P0015", text: 'PizzaFehler P0015: pizza.json ist ungültig: "pizza" fehlt.' } }),

  F(T, "K-138 §1.2: höhere Formatversion → Ladefehler HOST", projekt({
    "pizza.json": '{ "pizza": 2 }',
    "hauptgang.pizza": 'Bote.sage(("nie"));\n',
  }), { exit: 2, fehler: { code: "HOST", text: "PizzaFehler HOST: Diese Projektdatei braucht eine neuere pizza-Version." } }),

  F(T, "K-138 §1.2: angegebene Hauptdatei fehlt → P0015", projekt({
    "pizza.json": '{ "pizza": 1, "hauptdatei": "start.pizza" }',
    "hauptgang.pizza": 'Bote.sage(("nie"));\n',
  }), { exit: 2, fehler: { code: "P0015", text: 'PizzaFehler P0015: Die Datei "start.pizza" gibt es im Projekt nicht.' }, check: fehlerOrt({ datei: null, zeile: null, spalte: null }) }),

  api("K-138 §1.4: projekt.ausDateien leitet name, hauptdatei und args aus pizza.json ab; unbekannte Felder ignoriert", (lang) => {
    const r = lang.projekt.ausDateien({ "pizza.json": '{"pizza":1,"name":"Teigball","args":["a"],"koeche":4}', "hauptgang.pizza": "" });
    if (!r || r.fehler) return "ausDateien: " + j(r);
    if (r.name !== "Teigball" || r.hauptdatei !== "hauptgang.pizza" || j(r.args) !== '["a"]') return "abgeleitet: " + j({ name: r.name, hauptdatei: r.hauptdatei, args: r.args });
    const f = lang.projekt.ausDateien({ "pizza.json": "[]", "hauptgang.pizza": "" });
    if (!f || !f.fehler || f.fehler.code !== "P0015") return "pizza.json [] → P0015 erwartet, bekam " + j(f);
  }),

  // ───────────────────────── §1.3 Pfade und Grenzen ─────────────────────────
  api("K-138 §1.3: projekt.pruefePfad – a–z 0–9 - _ . und /, keine Punkt-Segmente, ≤ 120 Zeichen, ≤ 8 Ebenen", (lang) => {
    const gut = ["hauptgang.pizza", "rezepte/teig.pizza", "bilder/bote-1.png", "a_b-c.d.e", "a/b/c/d/e/f/g/h.txt", "x".repeat(116) + ".txt", "pruefung/erwartet"];
    const schlecht = ["", "/a.pizza", "a/", "a//b.pizza", "../a.pizza", "a/../b.pizza", "./a.pizza", ".versteckt/a.pizza", "a/.b.pizza", "A.pizza",
      "welt/beläge.pizza", "a b.pizza", "a\\b.pizza", "C:/a.pizza", "a/b/c/d/e/f/g/h/i.txt", "x".repeat(117) + ".txt", "a\n.pizza"];
    const f = [];
    for (const p of gut) if (lang.projekt.pruefePfad(p) !== null) f.push("gültig: " + j(p) + " → " + j(lang.projekt.pruefePfad(p)));
    for (const p of schlecht) if (typeof lang.projekt.pruefePfad(p) !== "string") f.push("ungültig: " + j(p));
    return f;
  }),

  F(T, "K-138 §1.3: ungültiger Pfad in der Dateisammlung → P0015 (datei null)", projekt({
    "hauptgang.pizza": 'Bote.sage(("nie"));\n',
    "Bilder/Tisch.png": KLEIN,
  }), { exit: 2, fehler: { code: "P0015", text: 'PizzaFehler P0015: "Bilder/Tisch.png" ist kein gültiger Dateipfad (nur a–z, 0–9, -, _, . und /).' }, check: fehlerOrt({ datei: null, zeile: null }) }),

  F(T, "K-138 §1.3: mehr als 100 Dateien → P0020 (pruefung/ zählt nicht)", (() => {
    const d = { "hauptgang.pizza": 'Bote.sage(("nie"));\n', "pruefung/erwartet": "nie\n" };
    for (let i = 1; i <= 100; i++) d[`daten/level-${i}.txt`] = String(i);
    return projekt(d);
  })(), { exit: 2, fehler: { code: "P0020", art: "pizzafehler", text: "PizzaFehler P0020: Das Projekt ist zu groß für den Ofen (101 Dateien, höchstens 100)." }, check: alle(fehlerOrt({ datei: null, zeile: null, spalte: null }), nullSchritte) }),

  F(T, "K-138 §1.3: .pizza-Datei über 512 KiB → P0020 mit Pfad und Größe", projekt({
    "hauptgang.pizza": "// " + "x".repeat(600 * 1024) + "\n",
  }), { exit: 2, fehler: { code: "P0020", text: "PizzaFehler P0020: Das Projekt ist zu groß für den Ofen (hauptgang.pizza hat 601 KB, höchstens 512 KB)." } }),

  // ───────────────────────── §2.4 Namen ─────────────────────────
  F(T, "K-140 §2.4: derselbe oberste Name in zwei Dateien → P0016, Position = der spätere in Ladereihenfolge", projekt({
    "hauptgang.pizza": 'bestellt "rezepte/teig.pizza";\n\nklasse Teig { }\n',
    "rezepte/teig.pizza": "klasse Teig {\n    salami gramm;\n}\n",
  }), {
    exit: 2,
    fehler: { code: "P0016", art: "pizzafehler", text: "PizzaFehler P0016: 'Teig' gibt es zweimal – in rezepte/teig.pizza (Zeile 1) und in hauptgang.pizza (Zeile 3)." },
    check: alle(fehlerOrt({ datei: "hauptgang.pizza", zeile: 3 }), nullSchritte),
  }),

  F(T, "K-140 §2.4: verschachtelte Klasse zählt zum Namensraum (Datei der äußeren Klasse)", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nklasse Rand { }\n',
    "a.pizza": "klasse Ofen {\n    klasse Rand { }\n}\n",
  }), { exit: 2, fehler: { code: "P0016", text: "PizzaFehler P0016: 'Rand' gibt es zweimal – in a.pizza (Zeile 2) und in hauptgang.pizza (Zeile 2)." } }),

  F(T, "K-140 §2.4: Überladung einer Top-Level-Funktion über Dateigrenzen → P0016", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nsalami summe(salami x, salami y) { serviere (x + y); }\n',
    "a.pizza": "salami summe(salami x) { serviere (x); }\n",
  }), { exit: 2, fehler: { code: "P0016", text: "PizzaFehler P0016: 'summe' gibt es zweimal – in a.pizza (Zeile 1) und in hauptgang.pizza (Zeile 2)." } }),

  F(T, "K-140 §2.4: auch geheimrezept-Namen und Variablen sind projektweit eindeutig", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nsalami menge = 2;\n',
    "a.pizza": "geheimrezept salami menge = 1;\n",
  }), { exit: 2, fehler: { code: "P0016", text: "PizzaFehler P0016: 'menge' gibt es zweimal – in a.pizza (Zeile 1) und in hauptgang.pizza (Zeile 2)." } }),

  F(T, "K-140 §2.4: Überladung innerhalb einer Datei bleibt erlaubt", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nBote.sage((summe(1) + summe(2, 3)));\n',
    "a.pizza": "salami summe(salami x) { serviere (x); }\nsalami summe(salami x, salami y) { serviere (x + y); }\n",
  }), { out: ["6"] }),

  F(T, "K-140 §2.4: eigene Klasse gleich einer eingebauten (Theke-Zutat) in einer Nebendatei hat Vorrang", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nBote.sage((neu Schild("x").text()));\n',
    "a.pizza": 'klasse Schild {\n    margherita t;\n    Schild(margherita s) { t = s; }\n    margherita text() { serviere ("eigen " + t); }\n}\n',
  }), { out: ["eigen x"] }),

  // ───────────────────────── §2.5 Sichtbarkeit ─────────────────────────
  F(T, "K-140 §2.5: Geheimrezept einer anderen Datei → P0018, Position = das Token in der benutzenden Datei", projekt({
    "hauptgang.pizza": 'bestellt "rezepte/teig.pizza";\nBote.sage((1 + salzAnteil()));\n',
    "rezepte/teig.pizza": "klasse Teig { }\ngeheimrezept funghi salzAnteil() { serviere (0.02); }\n",
  }), {
    exit: 2,
    fehler: { code: "P0018", art: "pizzafehler", text: "PizzaFehler P0018: 'salzAnteil' ist ein Geheimrezept von rezepte/teig.pizza." },
    check: alle(fehlerOrt({ datei: "hauptgang.pizza", zeile: 2, spalte: 16 }), nullSchritte),
  }),

  F(T, "K-140 §2.5: geheimrezept auf oberster Ebene ist in der eigenen Datei benutzbar", projekt({
    "hauptgang.pizza": 'bestellt "rezepte/teig.pizza";\nBote.sage((salz(100)));\n',
    "rezepte/teig.pizza": "geheimrezept funghi salzAnteil() { serviere (0.02); }\nfunghi salz(salami g) { serviere (g * salzAnteil()); }\n",
  }), { out: ["2"] }),

  F(T, "K-140 §2.5: Name einer nicht direkt bestellten Datei (nur transitiv) → P0019 mit Vorschlag", projekt({
    "hauptgang.pizza": 'bestellt "welt.pizza";\nTeig t = neu Teig();\n',
    "welt.pizza": 'bestellt "rezepte/teig.pizza";\nTeig weltTeig = neu Teig();\n',
    "rezepte/teig.pizza": "klasse Teig { }\n",
  }), {
    exit: 2,
    fehler: { code: "P0019", art: "pizzafehler", text: 'PizzaFehler P0019: \'Teig\' kommt aus rezepte/teig.pizza – bestelle die Datei hier: bestellt "rezepte/teig.pizza";' },
    check: fehlerOrt({ datei: "hauptgang.pizza", zeile: 2, spalte: 1 }),
  }),

  F(T, "K-140 §2.5: Sichtbarkeit wird je Datei in Ladereihenfolge geprüft (Nebendatei vor Hauptdatei)", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nbestellt "b.pizza";\nsalami h = wert + basis;\n',
    "a.pizza": "salami wert = basis * 2;\n",
    "b.pizza": "salami basis = 1;\n",
  }), { exit: 2, fehler: { code: "P0019", text: 'PizzaFehler P0019: \'basis\' kommt aus b.pizza – bestelle die Datei hier: bestellt "b.pizza";' }, check: fehlerOrt({ datei: "a.pizza", zeile: 1 }) }),

  F(T, "K-140 §2.5: keine Falsch-Treffer – Parameter, Lambda-, für-, Fang-Variable, lokale Variable, <T>, Mitglied, benanntes Argument, fall-Wert, nach '.'", projekt({
    "hauptgang.pizza": P`
bestellt "jahr.pizza";

leer zeige(salami menge) { Bote.sage(("menge " + menge)); }
<T> T erstes(Blech<T> l) { serviere (l.erstes()); }
salami gruss(margherita name) { Bote.sage(("hallo " + name)); serviere (1); }
klasse Laden {
    salami vorrat = 3;
    salami bestand() { serviere (vorrat); }
}

zeige(7);
Blech<salami> b = [1, 2].belege((preis) -> preis * 10);
für (salami zaehler : b) { Bote.sage((zaehler)); }
probier { wirf neu LaufzeitAnanas("x"); } verbrannt (LaufzeitAnanas fehler) { Bote.sage(("gefangen")); }
salami lokal() { salami tisch = 4; serviere (tisch); }
Bote.sage((erstes([5, 6]) + lokal() + neu Laden().bestand()));
gruss(name: "Gina");
Jahreszeit j = Jahreszeit.WINTER;
wähle (j) { fall WINTER -> Bote.sage(("kalt")); standard -> Bote.sage(("warm")); }
Bote.sage((Jahreszeit.SOMMER));
`,
    "jahr.pizza": 'bestellt "fremd.pizza";\nquattrostagioni Jahreszeit { FRÜHLING, SOMMER, HERBST, WINTER }\nsalami jahrBasis = fremdWert;\n',
    "fremd.pizza": P`
salami fremdWert = 1;
salami menge = 0;
salami preis = 0;
salami zaehler = 0;
salami fehler = 0;
salami tisch = 0;
salami name = 0;
salami vorrat = 0;
salami WINTER = 0;
salami SOMMER = 0;
klasse T { }
`,
  }), { out: ["menge 7", "10", "20", "gefangen", "12", "hallo Gina", "kalt", "SOMMER"] }),

  // ───────────────────────── §2.2 Nr. 6 Reihenfolge der Ladeprüfungen ─────────────────────────
  F(T, "K-139 §2.2 Nr. 6: P0014 (Tiefensuche) vor P0017, P0016 – der erste Fehler bricht ab", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nbestellt "b.pizza";\n',
    "a.pizza": 'Bote.sage(("Anweisung"));\nklasse Doppelt { }\n',
    "b.pizza": 'klasse Doppelt { }\nbestellt "b.pizza";\n',
  }), { exit: 2, fehler: { code: "P0014" } }),

  F(T, "K-139 §2.2 Nr. 6: P0020 (Grenzen) vor P0017 vor P0016 vor P0018/P0019", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nbestellt "b.pizza";\nsalami x = geheim();\n',
    "a.pizza": 'klasse Doppelt { }\ngeheimrezept salami geheim() { serviere (1); }\n',
    "b.pizza": 'klasse Doppelt { }\nBote.sage(("Anweisung"));\n',
  }), { exit: 2, fehler: { code: "P0017" }, check: fehlerOrt({ datei: "b.pizza", zeile: 2 }) }),

  F(T, "K-139 §2.2 Nr. 6: P0016 vor P0018", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nsalami x = geheim();\nklasse Doppelt { }\n',
    "a.pizza": 'klasse Doppelt { }\ngeheimrezept salami geheim() { serviere (1); }\n',
  }), { exit: 2, fehler: { code: "P0016" } }),

  F(T, "K-139 §2.2 Nr. 6: Ladefehler kommen vor allen Warnungen (W0004, W0032) und vor den Startprüfungen (P0010)", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nbestellt "a.pizza";\nsalami pizza = 1;\nsalami Pizza = 2;\nklasse K erbt Fehlt { }\n',
    "a.pizza": 'Bote.sage(("Anweisung"));\n',
  }), { exit: 2, fehler: { code: "P0017" }, check: alle(keineWarnung, nullSchritte) }),

  // ───────────────────────── W0004, Warnungen, Fehlerorte ─────────────────────────
  F(T, "K-139 §2.1: doppelte Bestellung in einer Datei → W0004 an der zweiten Stelle, harmlos", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nBote.sage((a));\n  bestellt "a.pizza";\n',
    "a.pizza": "salami a = 5;\n",
  }), {
    out: ["5"],
    warnAnzahl: { W0004: 1 },
    check: alle((res) => (ereignisse(res, "warnung")[0] || {}).text === 'W0004: "a.pizza" ist schon bestellt.' ? undefined : "W0004-Text: " + j(ereignisse(res, "warnung")),
      warnOrte([{ datei: "hauptgang.pizza", zeile: 3, spalte: 3 }])),
  }),

  F(T, "K-141 §2.6: Ein-Datei-Programm (String) – Ereignisse tragen datei: null direkt vor zeile", "salami pizza = 1;\nsalami Pizza = 2;\nwirf neu LaufzeitAnanas(\"aus\");\n", {
    exit: 1,
    warn: ["W0032"],
    check: alle(warnOrte([{ datei: null, zeile: 2 }]), fehlerOrt({ datei: null, zeile: 3 }),
      (res) => (fehlerEv(res) && /\(Zeile 3\)$/.test(fehlerEv(res).text) ? undefined : "Ananas-Text ohne Datei erwartet: " + j(fehlerEv(res)))),
  }),

  F(T, "K-141 §1.5: Ein-Datei-Projekt (eine .pizza + pizza.json + Daten) – datei bleibt null", projekt({
    "pizza.json": '{ "pizza": 1, "name": "Klein" }',
    "hauptgang.pizza": "salami pizza = 1;\nsalami Pizza = 2;\n",
    "daten/a.txt": "x",
  }), { warn: ["W0032"], check: warnOrte([{ datei: null, zeile: 2 }]) }),

  F(T, "K-141 §2.6: Warnungen in Mehrdatei-Programmen tragen ihre Datei; Zeilen zählen je Datei; Text unverändert", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nleer f() { salami q = 1; salami Q = 2; }\n',
    "a.pizza": "\n\nleer g() { salami q = 1; salami Q = 2; }\n",
  }), {
    warnAnzahl: { W0032: 2 },
    warnText: { W0032: "W0032: 'q' und 'Q' sind im selben Scope definiert." },
    check: warnOrte([{ datei: "a.pizza", zeile: 3, spalte: 33 }, { datei: "hauptgang.pizza", zeile: 2, spalte: 33 }]),
  }),

  F(T, "K-140/K-141 §2.2: gleiche Warnung an gleicher Zeile/Spalte in zwei Dateien – beide gemeldet (Sperre mit Datei im Schlüssel)", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nbestellt "b.pizza";\n',
    "a.pizza": "leer fa() { salami q = 1; salami Q = 2; }\n",
    "b.pizza": "leer fb() { salami q = 1; salami Q = 2; }\n",
  }), { warnAnzahl: { W0032: 2 }, check: warnOrte([{ datei: "a.pizza", zeile: 1, spalte: 34 }, { datei: "b.pizza", zeile: 1, spalte: 34 }]) }),

  F(T, "K-140 §14.8: der Programm-Scope von W0032 umfasst alle Dateien", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nsalami Menge = menge + 1;\n',
    "a.pizza": "salami menge = 1;\n",
  }), { warnAnzahl: { W0032: 1 }, warnText: { W0032: "'menge' und 'Menge'" }, check: warnOrte([{ datei: "hauptgang.pizza", zeile: 2 }]) }),

  F(T, "K-141 §2.6: ungefangene Ananas in einer Nebendatei – Text nennt Datei und Zeile, Feld datei", projekt({
    "hauptgang.pizza": 'bestellt "rezepte/teig.pizza";\nkneten();\n',
    "rezepte/teig.pizza": 'leer kneten() {\n    wirf neu LaufzeitAnanas("Teig gerissen");\n}\n',
  }), {
    exit: 1,
    fehler: { code: "LaufzeitAnanas", art: "ananas", text: "Ungefangene Ananas – LaufzeitAnanas: Teig gerissen (rezepte/teig.pizza, Zeile 2)" },
    check: fehlerOrt({ datei: "rezepte/teig.pizza", zeile: 2 }),
  }),

  F(T, "K-141 §2.6: ungefangene Ananas in der Hauptdatei eines Mehrdatei-Programms – Text wie bisher, datei = Hauptdatei", projekt({
    "hauptgang.pizza": 'bestellt "a.pizza";\nBote.sage((a));\nwirf neu LaufzeitAnanas("aus");\n',
    "a.pizza": "salami a = 1;\n",
  }), {
    exit: 1, out: ["1"],
    fehler: { text: "Ungefangene Ananas – LaufzeitAnanas: aus (Zeile 3)" },
    check: fehlerOrt({ datei: "hauptgang.pizza", zeile: 3 }),
  }),

  F(T, "K-139 §2.2: Laden kostet keine Schritte – dasselbe Programm in drei Dateien hat dieselben schritte/zeitMs wie in einer", projekt({
    "hauptgang.pizza": 'bestellt "zahlen.pizza";\nbestellt "rechner.pizza";\nBote.sage((summe(GRENZE)));\n',
    "zahlen.pizza": "salami GRENZE = 10;\n",
    "rechner.pizza": 'bestellt "zahlen.pizza";\nsalami summe(salami n) { salami s = 0; für (salami i : [1 .. n]) { s = s + i; } serviere (s + GRENZE - GRENZE); }\n',
  }), {
    out: ["55"],
    // Bezug: dasselbe Programm als eine Datei (Verkettung in Ladereihenfolge ohne bestellt) – SPEC §14.1, nicht vom Interpreter abgeschrieben
    check(res) {
      const ein = require("../../site/js/pizza.js").run("salami GRENZE = 10;\nsalami summe(salami n) { salami s = 0; für (salami i : [1 .. n]) { s = s + i; } serviere (s + GRENZE - GRENZE); }\nBote.sage((summe(GRENZE)));\n", {});
      if (res.schritte !== ein.schritte || res.zeitMs !== ein.zeitMs) return `schritte/zeitMs ${res.schritte}/${res.zeitMs}, als eine Datei ${ein.schritte}/${ein.zeitMs}`;
    },
  }),

  // ───────────────────────── §11.2 Kiste ─────────────────────────
  F(T, "K-146 §11.2: eine eigene Klasse Kiste (hier in einer Nebendatei) hat Vorrang vor dem eingebauten Modul", projekt({
    "hauptgang.pizza": 'bestellt "eigen.pizza";\nBote.sage((Kiste.text("x")));\n',
    "eigen.pizza": 'klasse Kiste {\n    speisekarte tiefkühl margherita text(margherita p) { serviere ("eigen " + p); }\n}\n',
  }), { out: ["eigen x"] }),

  // ═════════════════════════ PD2: Kiste und Bildchen.laden (aus a19-projekte-offen.js) ═════════════════════════
  // ───────────────────────── §2.1/§1.2 Hauptdatei, pizza.json ─────────────────────────
  F(TK, "K-138 §1.2: ohne pizza.json und ohne hauptgang.pizza ist die einzige .pizza-Datei die Hauptdatei", projekt({
    "spiel.pizza": 'Bote.sage((Kiste.liste().länge()));\n',
    "daten/a.txt": "a",
  }), { out: ["2"] }),

  // ───────────────────────── §1.3 Pfade und Grenzen ─────────────────────────
  F(TK, "K-138 §1.3: genau 100 Dateien sind erlaubt (pruefung/ zählt nicht)", (() => {
    const d = { "hauptgang.pizza": 'Bote.sage((Kiste.liste().länge()));\n', "pruefung/erwartet": "100\n" };
    for (let i = 1; i <= 99; i++) d[`daten/level-${i}.txt`] = String(i);
    return projekt(d);
  })(), { out: ["100"] }),

  // ───────────────────────── §11.2 Kiste ─────────────────────────
  F(TK, "K-146 §11.2: Kiste.text, zeilen, gibts, liste (sortiert, ohne pruefung/, auch .pizza und pizza.json)", projekt({
    "pizza.json": '{ "pizza": 1 }',
    "hauptgang.pizza": P`
Bote.sage((Kiste.text("daten/level-1.txt")));
Bote.sage((Kiste.zeilen("daten/level-1.txt").länge()));
Bote.sage((Kiste.gibts("daten/level-1.txt") + " " + Kiste.gibts("daten") + " " + Kiste.gibts("Daten/X.txt") + " " + Kiste.gibts("pruefung/erwartet")));
Bote.sage((Kiste.liste()));
Bote.sage((Kiste.liste("daten")));
Bote.sage((Kiste.liste("daten/") + " " + Kiste.liste("leer") + " " + Kiste.liste("../")));
`,
    "daten/level-1.txt": "#.#\n.#.\n",
    "daten/level-10.txt": "x",
    "daten-alt.txt": "y",
    "bilder/a.png": KLEIN,
    "pruefung/erwartet": "egal\n",
  }), { out: ["#.#\n.#.\n", "2", "ja nein nein nein", "[bilder/a.png, daten-alt.txt, daten/level-1.txt, daten/level-10.txt, hauptgang.pizza, pizza.json]", "[daten/level-1.txt, daten/level-10.txt]", "[] [] []"] }),

  F(TK, "K-138/K-146 §1.3: CRLF in Textdateien wird beim Laden zu LF (Kiste.text liefert \\n, einzelnes \\r bleibt)", projekt({
    "hauptgang.pizza": 'Bote.sage((Kiste.text("daten/a.txt") == "a\\nb\\rc\\n"));\r\nBote.sage((Kiste.zeilen("daten/a.txt").länge()));\r\n',
    "daten/a.txt": "a\r\nb\rc\r\n",
  }), { out: ["ja", "2"] }),

  F(TK, "K-146 §11.2: Kiste.text auf eine fehlende Datei → LaufzeitAnanas", projekt({
    "hauptgang.pizza": 'Bote.sage((Kiste.text("daten/fehlt.txt")));\n',
  }), { exit: 1, fehler: { code: "LaufzeitAnanas", text: 'Ungefangene Ananas – LaufzeitAnanas: Die Datei "daten/fehlt.txt" liegt nicht in der Kiste. (Zeile 1)' } }),

  F(TK, "K-146 §11.2: Kiste.text auf ein Bild → „kein Text“ (nach Endung)", projekt({
    "hauptgang.pizza": 'Bote.sage((Kiste.text("bilder/a.png")));\n',
    "bilder/a.png": KLEIN,
  }), { exit: 1, fehler: { text: "Ungefangene Ananas – LaufzeitAnanas: bilder/a.png ist kein Text. (Zeile 1)" } }),

  F(TK, "K-146 §11.2: Kiste.zeilen mit Nicht-Text-Argument → TypAnanas", projekt({
    "hauptgang.pizza": "Bote.sage((Kiste.zeilen(5)));\n",
  }), { exit: 1, fehler: { code: "TypAnanas", text: "Ungefangene Ananas – TypAnanas: Kiste.zeilen() braucht einen Text für 'pfad', nicht 5. (Zeile 1)" } }),

  F(TK, "K-146 §11.2: Kiste.liste in einem Ein-Datei-Projekt", projekt({ "hauptgang.pizza": "Bote.sage((Kiste.liste()));\n" }), { out: ["[hauptgang.pizza]"] }),

  // ───────────────────────── §18.5 Bildchen.laden ─────────────────────────
  F(TK, "K-145 §18.5: Bildchen.laden – Größe aus der Datei, Textform, gleicher Pfad = dasselbe Bildchen", projekt({
    "hauptgang.pizza": P`
Herd herd = neu Herd("Bild");
Bildchen a = Bildchen.laden("bilder/klein.png");
Bildchen b = Bildchen.laden("bilder/klein.png");
Bote.sage((a + " " + a.breite() + " " + a.hoehe() + " " + (a == b) + " " + (a.id() == b.id())));
Bildchen t = neu Bildchen(["ww"]);
Bote.sage((t.id() > a.id()));
`,
    "bilder/klein.png": KLEIN,
  }), { out: ["Bildchen(2×3) 2 3 ja ja", "ja"] }),

  F(TK, "K-145 §18.5: Bildchen.laden als Textur und Sprite (Bild, Koerper.bild) – Herd-Ereignisse wie üblich", projekt({
    "hauptgang.pizza": P`
Herd herd = neu Herd("Bild", breite: 64, hoehe: 64);
Bildchen b = Bildchen.laden("bilder/klein.png");
herd.bild(b, 32, 32, groesse: 4);
herd.koerper(Form.wuerfel(), bild: b);
herd.backe(() -> { });
Bote.sage(("fertig"));
`,
    "bilder/klein.png": KLEIN,
  }), {
    uiEreignisse: [{ typ: "takt" }],
    out: ["fertig"],
    check: (res) => (j(ereignisse(res, "herd").map((e) => e.art)) === j(["fenster", "bild"]) ? undefined : "herd-Folge " + j(ereignisse(res, "herd"))),
  }),

  F(TK, "K-145 §18.5: Prüfreihenfolge – Nicht-Text vor „Erst braucht es einen Herd“", projekt({
    "hauptgang.pizza": "Bildchen b = Bildchen.laden(5);\n",
  }), { exit: 1, fehler: { code: "TypAnanas", text: "Ungefangene Ananas – TypAnanas: Bildchen.laden() braucht einen Text für 'pfad', nicht 5. (Zeile 1)" } }),

  F(TK, "K-145 §18.5: Bildchen.laden vor neu Herd → LaufzeitAnanas aus §18.1", projekt({
    "hauptgang.pizza": 'Bildchen b = Bildchen.laden("bilder/klein.png");\n',
    "bilder/klein.png": KLEIN,
  }), { exit: 1, fehler: { text: "Ungefangene Ananas – LaufzeitAnanas: Erst braucht es einen Herd (neu Herd(…)). (Zeile 1)" } }),

  F(TK, "K-145 §18.5: fehlende Datei → „liegt nicht in der Kiste“", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBildchen b = Bildchen.laden("bilder/fehlt.png");\n',
  }), { exit: 1, fehler: { code: "LaufzeitAnanas", text: 'Ungefangene Ananas – LaufzeitAnanas: Die Datei "bilder/fehlt.png" liegt nicht in der Kiste. (Zeile 2)' } }),

  F(TK, "K-145 §18.5: kein lesbares Bild – die Ananas kommt erst beim Laden (vorher läuft das Programm)", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBote.sage(("vorher"));\nBildchen b = Bildchen.laden("bilder/kaputt.png");\n',
    "bilder/kaputt.png": KAPUTT,
  }), { exit: 1, out: ["vorher"], fehler: { text: "Ungefangene Ananas – LaufzeitAnanas: bilder/kaputt.png ist kein lesbares Bild (PNG oder JPEG). (Zeile 3)" } }),

  F(TK, "K-145 §18.5: ein kaputtes Bild, das nie geladen wird, stört nicht", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBote.sage((Bildchen.laden("bilder/gut.png").breite()));\n',
    "bilder/gut.png": KLEIN,
    "bilder/kaputt.png": KAPUTT,
  }), { out: ["2"] }),

  F(TK, "K-145/K-147 §18.5: zu großes Bild (laut Kopf 2400 × 800) → LaufzeitAnanas mit Größe", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBildchen b = Bildchen.laden("bilder/riesig.png");\n',
    "bilder/riesig.png": pngKopf(2400, 800),
  }), { exit: 1, fehler: { text: "Ungefangene Ananas – LaufzeitAnanas: bilder/riesig.png ist zu groß (2400 × 800) – höchstens 2048 × 2048 Pixel. (Zeile 2)" } }),

  F(TK, "K-145 §18.5: Bildchen.laden in einem Stück der brigade → wie alle Herd-Methoden", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBlech<salami> b = [1].brigade((x) -> Bildchen.laden("bilder/klein.png").breite());\n',
    "bilder/klein.png": KLEIN,
  }), { exit: 1, fehler: { code: "KüchenAnanas" } }),

  F(TK, "K-145 §14.7: Teigmenge über 64 MiB → P0020 vor dem Start (gleiche Bilder unter zwei Pfaden zählen einmal)", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBote.sage(("nie"));\n',
    "bilder/rot.png": gross([217, 69, 43, 255]),
    "bilder/gruen.png": gross([62, 142, 65, 255]),
    "bilder/gruen-kopie.png": gross([62, 142, 65, 255]),
    "bilder/blau.png": gross([40, 90, 200, 255]),
  }), {
    exit: 2,
    fehler: { code: "P0020", art: "pizzafehler", text: "PizzaFehler P0020: Die Bilder sind zusammen zu groß für den Ofen (64,1 MB vorgebacken, höchstens 64 MB)." },
    check: alle(fehlerOrt({ datei: null, zeile: null }), nullSchritte),
  }),

  F(TK, "K-145 §14.7: drei 2048²-Bilder, zwei davon gleich (42,7 MB vorgebacken), passen", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBote.sage((Bildchen.laden("bilder/a.png").breite() + Bildchen.laden("bilder/b.png").hoehe() + Bildchen.laden("bilder/c.png").breite()));\n',
    "bilder/a.png": gross([245, 197, 24, 255]),
    "bilder/b.png": gross([245, 197, 24, 255]),
    "bilder/c.png": gross([217, 69, 43, 255]),
  }), { out: ["6144"] }),

  // ───────────────────────── PD2: weitere Fälle (Prüfreihenfolge, Küche, Vorrang, Optionen) ─────────────────────────
  F(TK, "K-145 §18.5: Bildchen.laden auf eine Datei ohne Bild-Endung → „kein lesbares Bild“", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBildchen b = Bildchen.laden("daten/a.txt");\n',
    "daten/a.txt": "kein Bild",
  }), { exit: 1, fehler: { text: "Ungefangene Ananas – LaufzeitAnanas: daten/a.txt ist kein lesbares Bild (PNG oder JPEG). (Zeile 2)" } }),

  F(TK, "K-145 §18.5: ein fehlgeschlagenes Laden ist fangbar und wiederholbar und verbraucht keine ID", projekt({
    "hauptgang.pizza": P`
Herd herd = neu Herd();
probier { Bildchen.laden("bilder/kaputt.png"); } verbrannt (LaufzeitAnanas a) { Bote.sage((a.nachricht())); }
probier { Bildchen.laden("bilder/kaputt.png"); } verbrannt (LaufzeitAnanas a) { Bote.sage(("wieder")); }
Bildchen g = Bildchen.laden("bilder/gut.png");
Bote.sage((g.id() + " " + g));
`,
    "bilder/gut.png": KLEIN,
    "bilder/kaputt.png": KAPUTT,
  }), { out: ["bilder/kaputt.png ist kein lesbares Bild (PNG oder JPEG).", "wieder", "1 Bildchen(2×3)"] }),

  F(TK, "K-145 §18.5: eine eigene Klasse Bildchen hat Vorrang vor Bildchen.laden (dann braucht es keinen Herd)", projekt({
    "hauptgang.pizza": 'klasse Bildchen {\n    speisekarte tiefkühl margherita laden(margherita p) { serviere ("eigen " + p); }\n}\nBote.sage((Bildchen.laden("x")));\n',
  }), { out: ["eigen x"] }),

  F(TK, "K-146 §11.2: Kiste ist in Stücken einer brigade erlaubt (nur lesend)", projekt({
    "hauptgang.pizza": 'Blech<salami> n = [1, 2].brigade((x) -> Kiste.zeilen("daten/a.txt").länge() + x);\nBote.sage((n));\n',
    "daten/a.txt": "a\nb\n",
  }), { out: ["[3, 4]"] }),

  F(TK, "K-146 §11.2: Kiste.zeilen – leere Datei → [], ohne Schluss-\\n bleibt die letzte Zeile, leere Zeilen in der Mitte bleiben", projekt({
    "hauptgang.pizza": 'Bote.sage((Kiste.zeilen("daten/leer.txt").länge() + " " + Kiste.zeilen("daten/b.txt")));\n',
    "daten/leer.txt": "",
    "daten/b.txt": "a\n\nb",
  }), { out: ["0 [a, , b]"] }),

  F(TK, "K-146 §11.2: Kiste.liste mit Nicht-Text → TypAnanas mit 'ordner'", projekt({
    "hauptgang.pizza": "Bote.sage((Kiste.liste(5)));\n",
  }), { exit: 1, fehler: { code: "TypAnanas", text: "Ungefangene Ananas – TypAnanas: Kiste.liste() braucht einen Text für 'ordner', nicht 5. (Zeile 1)" } }),

  F(TK, "K-146 §11.2: Kiste.gibts mit Nicht-Text → TypAnanas (ein ungültiger Pfad dagegen ist nur nein)", projekt({
    "hauptgang.pizza": 'Bote.sage((Kiste.gibts("../x") + " " + Kiste.gibts("")));\nBote.sage((Kiste.gibts(ja)));\n',
  }), { exit: 1, out: ["nein nein"], fehler: { code: "TypAnanas", text: "Ungefangene Ananas – TypAnanas: Kiste.gibts() braucht einen Text für 'pfad', nicht ja. (Zeile 2)" } }),

  // als API-Fall: Text-Fälle laufen auch in den Differenztests, der Wasm-Motor kennt Kiste erst mit PA2
  { p: TK, name: "K-146 §11.2: Text-Programm – die Kiste enthält nur hauptgang.pizza mit dem eigenen Quelltext", api: (lang) => {
    const q = 'Bote.sage((Kiste.liste() + " " + Kiste.text("hauptgang.pizza").länge()));\n';
    const r = lang.run(q, {});
    const aus = ereignisse(r, "ausgabe").map((e) => e.text);
    if (r.exitCode !== 0 || j(aus) !== j(["[hauptgang.pizza] " + q.length])) return j(r.ereignisse);
  } },

  { p: TK, name: "K-145 §5.4: optionen.teiglinge – ein passender Teigling wird übernommen, ein veralteter oder kaputter neu vorgebacken (Ergebnis gleich)", api: (lang) => {
    const V = require("../../site/js/herd/teigling.js").node();
    const zaehler = { n: 0, vorbacken(q) { this.n++; return V.vorbacken(q); }, sha256: (b) => V.sha256(b) };
    const b = png(3, 1, [9, 9, 9, 255]), c = png(1, 5, [0, 0, 0, 0]);
    const code = projekt({
      "hauptgang.pizza": 'Herd herd = neu Herd();\nBote.sage((Bildchen.laden("bilder/a.png") + " " + Bildchen.laden("bilder/b.png") + " " + Bildchen.laden("bilder/c.png")));\n',
      "bilder/a.png": KLEIN, "bilder/b.png": b, "bilder/c.png": c,
    });
    const teiglinge = { "bilder/a.png": V.vorbacken(KLEIN), "bilder/b.png": V.vorbacken(png(4, 4, [1, 2, 3, 255])), "bilder/c.png": V.vorbacken(c).slice(0, 60) };
    const r = lang.run(code, { teiglinge, vorbacker: zaehler });
    const ohne = lang.run(code, {});
    const aus = ereignisse(r, "ausgabe").map((e) => e.text);
    if (j(aus) !== j(["Bildchen(2×3) Bildchen(3×1) Bildchen(1×5)"])) return "Ausgabe " + j(aus) + " " + j(ereignisse(r, "fehler"));
    if (zaehler.n !== 2) return "vorbacken " + zaehler.n + "-mal gerufen, erwartet 2 (b veraltet, c kaputt)";
    if (j(r.ereignisse) !== j(ohne.ereignisse) || r.schritte !== ohne.schritte) return "Ergebnis hängt vom Cache ab";
  } },

  { p: TK, name: "K-145 §5.4: Vorbacker fehlt (ungültiges optionen.vorbacker) bei Bildern → HOST, Exit 2, 0 Schritte; ohne Bilder wird er nicht gebraucht", api: (lang) => {
    const r = lang.run(projekt({ "hauptgang.pizza": 'Bote.sage(("nie"));\n', "bilder/a.png": KLEIN }), { vorbacker: new Uint8Array([0, 1, 2]) });
    const f = ereignisse(r, "fehler");
    const soll = { typ: "fehler", code: "HOST", art: "intern", text: "PizzaFehler HOST: Der Vorbacker fehlt (teigling.wasm).", datei: null, zeile: null, spalte: null };
    if (r.exitCode !== 2 || r.schritte !== 0 || f.length !== 1 || j(f[0]) !== j(soll) || ereignisse(r, "ausgabe").length) return "mit Bild: " + j(r);
    const r2 = lang.run(projekt({ "hauptgang.pizza": 'Bote.sage(("ja"));\n', "daten/a.txt": "x" }), { vorbacker: new Uint8Array([0]) });
    if (r2.exitCode !== 0 || j(ereignisse(r2, "ausgabe").map((e) => e.text)) !== j(["ja"])) return "ohne Bild: " + j(r2);
  } },

  { p: TK, name: "K-145 §18.5: optionen.vorbacker als Bytes, WebAssembly.Module oder Vorbacker-Objekt – gleiches Ergebnis", api: (lang) => {
    const fs = require("fs"), path = require("path");
    const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, "..", "..", "site", "js", "herd", "teigling.wasm")));
    const code = projekt({ "hauptgang.pizza": 'Herd herd = neu Herd();\nBote.sage((Bildchen.laden("bilder/a.png").hoehe()));\n', "bilder/a.png": KLEIN });
    const soll = j(lang.run(code, {}).ereignisse);
    for (const [name, v] of [["Bytes", bytes], ["Module", new WebAssembly.Module(bytes)], ["Objekt", require("../../site/js/herd/teigling.js").ausBytes(bytes)]]) {
      const r = lang.run(code, { vorbacker: v });
      if (j(r.ereignisse) !== soll || r.exitCode !== 0) return name + ": " + j(r.ereignisse);
    }
  } },

  { p: TK, name: "K-145 §18.5: Herd-Erkennung – Bildchen.laden zählt wie neu Bildchen (ohne Herd-Kern HOST vor dem Start)", api: (lang) => {
    const r = lang.run(projekt({ "hauptgang.pizza": 'Bote.sage(("nie"));\nBildchen b = Bildchen.laden("bilder/a.png");\n', "bilder/a.png": KLEIN }), { herdKern: new Uint8Array([0]) });
    const f = ereignisse(r, "fehler");
    if (r.exitCode !== 2 || f.length !== 1 || f[0].text !== "PizzaFehler HOST: Der Herd-Kern fehlt (kern.wasm)." || ereignisse(r, "ausgabe").length) return j(r);
  } },

  // ───────────────────────── H-K16 §18.5 Modell.laden (K-161) – Testmodelle aus scripts/modelle-test.js ─────────────────────────
  F(TK, "K-161 §18.5: Modell.laden – Textform, gleicher Pfad = dasselbe Modell, Knotennamen, Hülle; herd.modell + finde", projekt({
    "hauptgang.pizza": P`
Herd herd = neu Herd("Modell");
Modell m = Modell.laden("modelle/wuerfel.glb");
Bote.sage((m + " " + (m == Modell.laden("modelle/wuerfel.glb")) + " " + m.namen() + " " + m.breite() + " " + m.belaege().länge()));
Teil t = herd.modell(m, 1, 2, 3);
Bote.sage((t.x() + " " + t.finde("Wuerfel").etikett().name() + " " + t.finde("x") + " " + (t.finde("Wuerfel").koerper().belag() == m.belaege().stück(1))));
`,
    "modelle/wuerfel.glb": TM("wuerfel.glb"),
  }), { out: ["Modell(modelle/wuerfel.glb) ja [Wuerfel] 1 1", "1 Wuerfel karton ja"] }),

  F(TK, "K-161 §18.5: .gltf mit Nachbardateien relativ zum Modell; fehlt eine, nennt die Meldung sie", projekt({
    "hauptgang.pizza": P`
Herd herd = neu Herd();
Bote.sage((Modell.laden("m/textur.gltf").namen()));
Modell kaputt = Modell.laden("m/ohne.gltf");
`,
    "m/textur.gltf": TM("textur.gltf"), "m/textur.bin": TM("textur.bin"), "m/ohne.gltf": TM("fehler-fehlt.gltf"),
    "m/bilder/farbe.png": TM("bilder/farbe.png"), "m/bilder/normale.png": TM("bilder/normale.png"), "m/bilder/mr.png": TM("bilder/mr.png"),
    "m/bilder/oc.png": TM("bilder/oc.png"), "m/bilder/leucht.png": TM("bilder/leucht.png"),
  }), { exit: 1, out: ["[Kiste]"], fehler: { text: "Ungefangene Ananas – LaufzeitAnanas: m/ohne.gltf braucht die Datei fehlt.bin – die liegt nicht in der Kiste. (Zeile 3)" } }),

  F(TK, "K-161 §18.5: Modell.laden – Prüfreihenfolge (Text vor Herd), Pflicht-Erweiterung, neu Modell", projekt({
    "hauptgang.pizza": P`
probier { Modell.laden(5); } verbrannt (TypAnanas x) { Bote.sage((x.nachricht())); }
probier { Modell.laden("modelle/d.glb"); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
Herd herd = neu Herd();
probier { Modell.laden("modelle/d.glb"); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
probier { neu Modell(); } verbrannt (RohlingAnanas x) { Bote.sage((x.nachricht())); }
`,
    "modelle/d.glb": TM("fehler-draco.glb"),
  }), { out: ["Modell.laden() braucht einen Text für 'pfad', nicht 5.", "Erst braucht es einen Herd (neu Herd(…)).",
    "modelle/d.glb braucht die Erweiterung KHR_draco_mesh_compression – die kann der Herd nicht.", "'Modell' kann man nicht mit neu backen."] }),

  { p: TK, name: "K-161 §18.5: Herd-Erkennung – Modell.laden zählt wie Bildchen.laden (ohne Herd-Kern HOST vor dem Start)", api: (lang) => {
    const r = lang.run(projekt({ "hauptgang.pizza": 'Bote.sage(("nie"));\nModell m = Modell.laden("m.glb");\n', "m.glb": TM("wuerfel.glb") }), { herdKern: new Uint8Array([0]) });
    const f = ereignisse(r, "fehler");
    if (r.exitCode !== 2 || f.length !== 1 || f[0].text !== "PizzaFehler HOST: Der Herd-Kern fehlt (kern.wasm)." || ereignisse(r, "ausgabe").length) return j(r);
  } },

  // ───────────────────────── H-K19a §18.8 Klang.laden (K-163) – Testklänge aus scripts/klaenge-test.js ─────────────────────────
  F(TK, "K-163 §18.8: Klang.laden – WAV und FLAC ohne Herd, gleicher Pfad = derselbe Klang, Dauer aus Frames und Rate", projekt({
    "hauptgang.pizza": P`
Klang a = Klang.laden("klaenge/ton-mono.wav");
Klang b = Klang.laden("klaenge/akkord-stereo.flac");
Bote.sage((a + " " + (a == Klang.laden("klaenge/ton-mono.wav")) + " " + a.dauer().runden(3) + " " + b.dauer()));
Spur s = b.spiele(schleife: ja);
Bote.sage((s.laeuft()));
`,
    "klaenge/ton-mono.wav": TKL("ton-mono.wav"), "klaenge/akkord-stereo.flac": TKL("akkord-stereo.flac"),
  }), { out: ["Klang(1) ja 0.25 0.25", "ja"] }),

  F(TK, "K-163 §18.8: Klang.laden – Prüfreihenfolge und Texte aus dem Fehler-Klangteig, Formen lehnen geladene Klänge ab", projekt({
    "hauptgang.pizza": P`
probier { Klang.laden(5); } verbrannt (TypAnanas x) { Bote.sage((x.nachricht())); }
probier { Klang.laden("k/fehlt.flac"); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
probier { Klang.laden("k/zu-lang.flac"); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
probier { Klang.laden("k/kaputt.wav"); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
probier { Klang.laden("k/ton.wav").huelle(); } verbrannt (LaufzeitAnanas x) { Bote.sage((x.nachricht())); }
`,
    "k/zu-lang.flac": TKL("fehler-zu-lang.flac"), "k/kaputt.wav": TKL("fehler-kaputt.wav"), "k/ton.wav": TKL("ton-mono.wav"),
  }), { out: ["Klang.laden() braucht einen Text für 'pfad', nicht 5.", "Die Datei \"k/fehlt.flac\" liegt nicht in der Kiste.",
    "k/zu-lang.flac ist zu lang (10:01) – höchstens 10 Minuten.", "k/kaputt.wav ist kein lesbarer Klang (WAV oder FLAC).",
    "huelle() geht nur mit erzeugten Klängen, nicht mit geladenen (Klang.laden) – spiele sie mit lautstaerke, tonhoehe und panorama."] }),

  { p: TK, name: "K-163 §18.8: Klänge brauchen den Vorbacker (HOST vor dem Start), Programme ohne Klangdatei nicht", api: (lang) => {
    const r = lang.run(projekt({ "hauptgang.pizza": 'Bote.sage(("nie"));\nKlang k = Klang.laden("a.wav");\n', "a.wav": TKL("ton-mono.wav") }), { vorbacker: new Uint8Array([0]) });
    const f = ereignisse(r, "fehler");
    if (r.exitCode !== 2 || f.length !== 1 || f[0].text !== "PizzaFehler HOST: Der Vorbacker fehlt (teigling.wasm)." || ereignisse(r, "ausgabe").length) return j(r);
  } },
];
