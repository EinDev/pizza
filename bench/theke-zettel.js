#!/usr/bin/env node
'use strict';
/*
 * Messung Theke v5 (K-116 … K-118): zeichne()-Schleife vs. Zettel + Bindungen.
 *   node bench/theke-zettel.js [--takte N]
 * Dasselbe kleine Idle-Programm (Kasse, Pizzen/s, fünf Kauf-Knöpfe, Fortschrittsbalken) in zwei Fassungen,
 * gefüttert mit denselben Ereignissen (N Takt-Schläge à 100 ms, dazwischen ein paar Klicks).
 * Gezählt werden: aendere-Nachrichten, aendere-Einträge (je Zutat) und Programm-Schritte – je Sekunde Spielzeit.
 */
const path = require('path');
const P = require(path.join(__dirname, '..', 'site', 'js', 'pizza.js'));

const argv = process.argv.slice(2);
const takte = argv.includes('--takte') ? Number(argv[argv.indexOf('--takte') + 1]) : 600;
// --alt <pfad>: ein Interpreter vor K-117 (z. B. `git show f108e0c:site/js/pizza.js > tmp/pizza-alt.js`) für die echte „vorher“-Zeile
const altPfad = argv.includes('--alt') ? argv[argv.indexOf('--alt') + 1] : null;
const ALT = altPfad ? require(path.resolve(altPfad)) : null;

// Gemeinsame Spiellogik: Geld wächst je Takt um pizzenProSekunde/10; ein Kauf kostet preis(i) und erhöht pizzenProSekunde.
const KOPF = `
Theke theke = neu Theke("Messung");
funghi geld = 10;
funghi rate = 1;            // Pizzen je Sekunde
funghi pizzen = 0;
Blech<salami> stufen = [0, 0, 0, 0, 0];
funghi preis(salami i) { serviere (10 * Mathe.potenz(3, i) * Mathe.potenz(1.15, stufen.stück(i))); }
`;

// Vorher: zeichne() setzt in jedem Takt alle Zutaten neu (so bauten es die Beispiele vor v5; Hand-Vergleiche wie im Pizza-Imperium).
const VORHER = KOPF + `
Schild kasse = neu Schild("", id: "kasse");
Schild info = neu Schild("", id: "info");
Fortschritt balken = neu Fortschritt(0, id: "balken");
Blech<Knopf> knoepfe = [];
für (salami i : [1 .. 5]) {
    salami nr = i;
    knoepfe.hinzu(neu Knopf("", () -> {
        falls (geld >= preis(nr)) { geld = geld - preis(nr); stufen.setze(nr, stufen.stück(nr) + 1); rate = rate + nr; }
        zeichne();
    }, id: "kauf" + i));
}
leer zeichne() {
    kasse.setzeText((geld.euro()));
    info.setzeText((Mathe.boden(pizzen) + " Pizzen, " + rate + "/s"));
    balken.setzeWert(geld / preis(1) > 1 ? 1 : geld / preis(1));
    für (salami i : [1 .. 5]) {
        Knopf k = knoepfe.stück(i);
        k.setzeText(("Ofen " + i + " (" + preis(i).euro() + ")"));
        k.aktiv(geld >= preis(i));
    }
}
Takt takt = neu Takt(100ms, (n) -> {
    geld = geld + rate * n / 10;
    pizzen = pizzen + rate * n / 10;
    zeichne();
}, id: "takt");
Stapel wurzel = neu Stapel([kasse, info, balken, neu Reihe(knoepfe), takt]);
zeichne();
theke.zeige(wurzel);
theke.bediene();
`;

// Nachher (v5): Zustand auf Zetteln, Zutaten binden ihre Eigenschaften; der Takt simuliert nur.
const NACHHER = KOPF + `
Zettel zGeld = neu Zettel(geld);
Zettel zRate = neu Zettel(rate);
Zettel zPizzen = neu Zettel(pizzen);
Zettel zStufen = neu Zettel(0);     // zählt Käufe – Preise hängen davon ab
Schild kasse = neu Schild(id: "kasse");
kasse.binde("text", () -> zGeld.wert().euro());
Schild info = neu Schild(id: "info");
info.binde("text", () -> zPizzen.wert() + " Pizzen, " + zRate.wert() + "/s");
Fortschritt balken = neu Fortschritt(0, id: "balken");
balken.binde("wert", () -> { zStufen.wert(); funghi a = zGeld.wert() / preis(1); serviere (a > 1 ? 1 : a); });
Blech<Knopf> knoepfe = [];
für (salami i : [1 .. 5]) {
    salami nr = i;
    Knopf k = neu Knopf("", () -> {
        falls (geld >= preis(nr)) {
            geld = geld - preis(nr); stufen.setze(nr, stufen.stück(nr) + 1); rate = rate + nr;
            zGeld.setze(geld); zRate.setze(rate); zStufen.setze(zStufen.wert() + 1);
        }
    }, id: "kauf" + i);
    k.binde("text", () -> { zStufen.wert(); serviere ("Ofen " + nr + " (" + preis(nr).euro() + ")"); });
    k.binde("aktiv", () -> { zStufen.wert(); serviere (zGeld.wert() >= preis(nr)); });
    knoepfe.hinzu(k);
}
Takt takt = neu Takt(100ms, (n) -> {
    geld = geld + rate * n / 10;
    pizzen = pizzen + rate * n / 10;
    zGeld.setze(geld); zPizzen.setze(Mathe.boden(pizzen));   // der Zettel ändert sich nur bei ganzer Pizza
}, id: "takt");
Stapel wurzel = neu Stapel([kasse, info, balken, neu Reihe(knoepfe), takt]);
theke.zeige(wurzel);
theke.bediene();
`;

function ereignisse(n) {
  const e = [];
  for (let i = 1; i <= n; i++) {
    e.push({ typ: 'takt', id: 'takt', anzahl: 1 });
    if (i % 50 === 0) e.push({ typ: 'klick', id: 'kauf' + (1 + ((i / 50) % 5)) });
  }
  e.push({ typ: 'geschlossen' });
  return e;
}

function messe(name, quelle, motor) {
  const r = (motor || P).run(quelle, { uiEreignisse: ereignisse(takte), schrittLimit: 1e9 });
  const fehler = r.ereignisse.filter(e => e.typ === 'fehler');
  if (fehler.length) { console.error(name + ': ' + JSON.stringify(fehler[0])); process.exit(1); }
  const ui = r.ereignisse.filter(e => e.typ === 'ui' && e.nachricht.op === 'aendere').map(e => e.nachricht);
  const eintraege = ui.reduce((s, m) => s + m.aenderungen.length, 0);
  const felder = ui.reduce((s, m) => s + m.aenderungen.reduce((t, a) => t + Object.keys(a).length - 1, 0), 0);
  const warn = r.ereignisse.filter(e => e.typ === 'warnung').map(e => e.code + ' ' + e.text);
  const sek = takte / 10;
  return { name, nachrichten: ui.length, eintraege, felder, schritte: r.schritte, sek, warn,
    proSek: { nachrichten: ui.length / sek, eintraege: eintraege / sek, felder: felder / sek, schritte: r.schritte / sek } };
}

const reihen = [];
if (ALT) reihen.push(messe('vorher, Interpreter vor v5', VORHER, ALT));
reihen.push(messe('zeichne je Takt, v5 (K-117)', VORHER));
reihen.push(messe('nachher (Zettel + binde)', NACHHER));
const a = reihen[0], b = reihen[reihen.length - 1];
const z = (x) => (Math.round(x * 10) / 10).toLocaleString('de-DE');
console.log('Theke v5 Messung – ' + takte + ' Takte à 100 ms = ' + a.sek + ' s Spielzeit, ' + Math.floor(takte / 50) + ' Klicks');
console.log('Fassung'.padEnd(30) + 'aendere-Nachr.'.padStart(16) + 'Einträge'.padStart(12) + 'Felder'.padStart(10) + 'Schritte'.padStart(12) + '   je Sekunde: Einträge / Felder / Schritte');
for (const m of reihen) {
  console.log(m.name.padEnd(30) + String(m.nachrichten).padStart(16) + String(m.eintraege).padStart(12) + String(m.felder).padStart(10) + String(m.schritte).padStart(12)
    + '   ' + z(m.proSek.eintraege) + ' / ' + z(m.proSek.felder) + ' / ' + z(m.proSek.schritte));
  for (const w of m.warn) console.log('    Warnung: ' + w);
}
console.log('Ersparnis nachher gegenüber ' + a.name + ': Einträge ' + z(100 - 100 * b.eintraege / a.eintraege) + ' %, Felder ' + z(100 - 100 * b.felder / a.felder) + ' %, Schritte ' + z(100 - 100 * b.schritte / a.schritte) + ' %');
