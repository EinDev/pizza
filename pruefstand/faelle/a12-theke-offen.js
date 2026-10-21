"use strict";
// Theke-Fälle zu Klärungen, deren Umsetzung noch OFFEN ist (Konvention *-offen.js, ARCHITEKTUR §6).
const { P, F } = require("../lib/helfer");
const O = "§16 Theke – Umsetzung offen";

const fenster = (titel, breite = 480, hoehe = 360) => ({ v: 1, op: "fenster", titel, breite, hoehe });
const baum = (wurzel) => ({ v: 1, op: "baum", wurzel });
const aendere = (...aenderungen) => ({ v: 1, op: "aendere", aenderungen });

module.exports = [
  F(O, "K-075: stil(schlüssel, karton) entfernt den Stil; die Nachricht trägt null für entfernte Schlüssel (Renderer setzt zurück)", P`
Theke t = neu Theke("S");
Knopf k = neu Knopf("k");
k.stil("breite", 10);
k.stil("farbe", "tomate");
t.zeige(k);
k.stil("breite", karton);
t.bediene();
`, {
    uiEreignisse: [],
    ui: [fenster("S"), baum({ id: "z1", art: "knopf", text: "k", stil: { breite: 10, farbe: "tomate" } }), aendere({ id: "z1", stil: { farbe: "tomate", breite: null } })],
  }),
];
