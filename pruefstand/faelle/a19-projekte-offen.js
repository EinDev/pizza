"use strict";
// Projekte: Kiste und Bilddateien (SPEC §2.1, §11.2, §14.7, §18.5; KLAERUNGEN K-145 … K-147; Konzept PROJEKTE.md). Umsetzung
// OFFEN (Pakete PD2, PD1) – Konvention *-offen.js (ARCHITEKTUR §6): Die Fälle zählen nicht als Fehlschlag; wird einer grün, meldet
// der Prüfstand „verschieben“. Die Lader-Fälle hat PA1 nach a19-projekte.js verschoben; PD2 leert diese Datei.
//
// `code` ist ein Projekt { dateien: { pfad → Inhalt }, hauptdatei? } (ARCHITEKTUR §1, §6); Textdateien als String, Bilder als
// Uint8Array. Die Differenztests überspringen Projekt-Fälle (dort nur Strings), bis PA2 sie unterstützt.
const { P, F } = require("../lib/helfer");
const { projekt, ereignisse, j, fehlerOrt, alle, nullSchritte, pngKopf, KLEIN, gross, KAPUTT } = require("../lib/projekt-helfer");
const T = "§2 Projekte: Kiste, Bilddateien (K-145 … K-147, offen)";

module.exports = [
  // ───────────────────────── §2.1/§1.2 Hauptdatei, pizza.json ─────────────────────────
  F(T, "K-138 §1.2: ohne pizza.json und ohne hauptgang.pizza ist die einzige .pizza-Datei die Hauptdatei", projekt({
    "spiel.pizza": 'Bote.sage((Kiste.liste().länge()));\n',
    "daten/a.txt": "a",
  }), { out: ["2"] }),

  // ───────────────────────── §1.3 Pfade und Grenzen ─────────────────────────
  F(T, "K-138 §1.3: genau 100 Dateien sind erlaubt (pruefung/ zählt nicht)", (() => {
    const d = { "hauptgang.pizza": 'Bote.sage((Kiste.liste().länge()));\n', "pruefung/erwartet": "100\n" };
    for (let i = 1; i <= 99; i++) d[`daten/level-${i}.txt`] = String(i);
    return projekt(d);
  })(), { out: ["100"] }),

  // ───────────────────────── §11.2 Kiste ─────────────────────────
  F(T, "K-146 §11.2: Kiste.text, zeilen, gibts, liste (sortiert, ohne pruefung/, auch .pizza und pizza.json)", projekt({
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

  F(T, "K-138/K-146 §1.3: CRLF in Textdateien wird beim Laden zu LF (Kiste.text liefert \\n, einzelnes \\r bleibt)", projekt({
    "hauptgang.pizza": 'Bote.sage((Kiste.text("daten/a.txt") == "a\\nb\\rc\\n"));\r\nBote.sage((Kiste.zeilen("daten/a.txt").länge()));\r\n',
    "daten/a.txt": "a\r\nb\rc\r\n",
  }), { out: ["ja", "2"] }),

  F(T, "K-146 §11.2: Kiste.text auf eine fehlende Datei → LaufzeitAnanas", projekt({
    "hauptgang.pizza": 'Bote.sage((Kiste.text("daten/fehlt.txt")));\n',
  }), { exit: 1, fehler: { code: "LaufzeitAnanas", text: 'Ungefangene Ananas – LaufzeitAnanas: Die Datei "daten/fehlt.txt" liegt nicht in der Kiste. (Zeile 1)' } }),

  F(T, "K-146 §11.2: Kiste.text auf ein Bild → „kein Text“ (nach Endung)", projekt({
    "hauptgang.pizza": 'Bote.sage((Kiste.text("bilder/a.png")));\n',
    "bilder/a.png": KLEIN,
  }), { exit: 1, fehler: { text: "Ungefangene Ananas – LaufzeitAnanas: bilder/a.png ist kein Text. (Zeile 1)" } }),

  F(T, "K-146 §11.2: Kiste.zeilen mit Nicht-Text-Argument → TypAnanas", projekt({
    "hauptgang.pizza": "Bote.sage((Kiste.zeilen(5)));\n",
  }), { exit: 1, fehler: { code: "TypAnanas", text: "Ungefangene Ananas – TypAnanas: Kiste.zeilen() braucht einen Text für 'pfad', nicht 5. (Zeile 1)" } }),

  F(T, "K-146 §11.2: Kiste.liste in einem Ein-Datei-Projekt", projekt({ "hauptgang.pizza": "Bote.sage((Kiste.liste()));\n" }), { out: ["[hauptgang.pizza]"] }),

  // ───────────────────────── §18.5 Bildchen.laden ─────────────────────────
  F(T, "K-145 §18.5: Bildchen.laden – Größe aus der Datei, Textform, gleicher Pfad = dasselbe Bildchen", projekt({
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

  F(T, "K-145 §18.5: Bildchen.laden als Textur und Sprite (Bild, Koerper.bild) – Herd-Ereignisse wie üblich", projekt({
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

  F(T, "K-145 §18.5: Prüfreihenfolge – Nicht-Text vor „Erst braucht es einen Herd“", projekt({
    "hauptgang.pizza": "Bildchen b = Bildchen.laden(5);\n",
  }), { exit: 1, fehler: { code: "TypAnanas", text: "Ungefangene Ananas – TypAnanas: Bildchen.laden() braucht einen Text für 'pfad', nicht 5. (Zeile 1)" } }),

  F(T, "K-145 §18.5: Bildchen.laden vor neu Herd → LaufzeitAnanas aus §18.1", projekt({
    "hauptgang.pizza": 'Bildchen b = Bildchen.laden("bilder/klein.png");\n',
    "bilder/klein.png": KLEIN,
  }), { exit: 1, fehler: { text: "Ungefangene Ananas – LaufzeitAnanas: Erst braucht es einen Herd (neu Herd(…)). (Zeile 1)" } }),

  F(T, "K-145 §18.5: fehlende Datei → „liegt nicht in der Kiste“", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBildchen b = Bildchen.laden("bilder/fehlt.png");\n',
  }), { exit: 1, fehler: { code: "LaufzeitAnanas", text: 'Ungefangene Ananas – LaufzeitAnanas: Die Datei "bilder/fehlt.png" liegt nicht in der Kiste. (Zeile 2)' } }),

  F(T, "K-145 §18.5: kein lesbares Bild – die Ananas kommt erst beim Laden (vorher läuft das Programm)", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBote.sage(("vorher"));\nBildchen b = Bildchen.laden("bilder/kaputt.png");\n',
    "bilder/kaputt.png": KAPUTT,
  }), { exit: 1, out: ["vorher"], fehler: { text: "Ungefangene Ananas – LaufzeitAnanas: bilder/kaputt.png ist kein lesbares Bild (PNG oder JPEG). (Zeile 3)" } }),

  F(T, "K-145 §18.5: ein kaputtes Bild, das nie geladen wird, stört nicht", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBote.sage((Bildchen.laden("bilder/gut.png").breite()));\n',
    "bilder/gut.png": KLEIN,
    "bilder/kaputt.png": KAPUTT,
  }), { out: ["2"] }),

  F(T, "K-145/K-147 §18.5: zu großes Bild (laut Kopf 2400 × 800) → LaufzeitAnanas mit Größe", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBildchen b = Bildchen.laden("bilder/riesig.png");\n',
    "bilder/riesig.png": pngKopf(2400, 800),
  }), { exit: 1, fehler: { text: "Ungefangene Ananas – LaufzeitAnanas: bilder/riesig.png ist zu groß (2400 × 800) – höchstens 2048 × 2048 Pixel. (Zeile 2)" } }),

  F(T, "K-145 §18.5: Bildchen.laden in einem Stück der brigade → wie alle Herd-Methoden", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBlech<salami> b = [1].brigade((x) -> Bildchen.laden("bilder/klein.png").breite());\n',
    "bilder/klein.png": KLEIN,
  }), { exit: 1, fehler: { code: "KüchenAnanas" } }),

  F(T, "K-145 §14.7: Teigmenge über 32 MiB → P0020 vor dem Start (gleiche Bilder unter zwei Pfaden zählen einmal)", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBote.sage(("nie"));\n',
    "bilder/rot.png": gross([217, 69, 43, 255]),
    "bilder/gruen.png": gross([62, 142, 65, 255]),
    "bilder/gruen-kopie.png": gross([62, 142, 65, 255]),
  }), {
    exit: 2,
    fehler: { code: "P0020", art: "pizzafehler", text: "PizzaFehler P0020: Die Bilder sind zusammen zu groß für den Ofen (42,7 MB vorgebacken, höchstens 32 MB)." },
    check: alle(fehlerOrt({ datei: null, zeile: null }), nullSchritte),
  }),

  F(T, "K-145 §14.7: ein 2048²-Bild unter zwei Pfaden (21,3 MB vorgebacken) passt", projekt({
    "hauptgang.pizza": 'Herd herd = neu Herd();\nBote.sage((Bildchen.laden("bilder/a.png").breite() + Bildchen.laden("bilder/b.png").hoehe()));\n',
    "bilder/a.png": gross([245, 197, 24, 255]),
    "bilder/b.png": gross([245, 197, 24, 255]),
  }), { out: ["4096"] }),
];
