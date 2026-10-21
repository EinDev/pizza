'use strict';
/*
 * Minimaler Host mit „Köchen“ für die Küchenbrigade (HOST-ABI §2 Gruppe `kueche`, §3 `kueche_stueck`; THREADS.md §4.4).
 * Prüft den Klon-Vertrag schon vor P3: `kueche_auftrag` kopiert den Speicher der Hauptinstanz in Klon-Instanzen desselben
 * Moduls und ruft dort `kueche_stueck(auftrag, i)`; die Hauptinstanz holt die Berichte über `kueche_bericht` (Retry K-013).
 * Alles sequentiell im selben Thread – die Planung ist frei (D2), deshalb mehrere Strategien:
 *   vor   – ein Klon für alle Stücke, 1 … n          rueck – ein Klon, n … 1 (Klon führt mehrere Stücke nacheinander aus)
 *   je    – je Stück ein frischer Klon                 Klone dürfen keine Ausgabe-/Ende-Imports rufen (sonst Fehler)
 */
const ARTEN = ['syntax', 'pizzafehler', 'ananas', 'limit'];

function fuehreMitKlonen(modul, optionen = {}, strategie = 'vor') {
  const ereignisse = [];
  const emit = (e) => ereignisse.push(e);
  const dek = new TextDecoder();
  let inst = null;
  const mem = () => new Uint8Array(inst.exports.memory.buffer);
  const t = (p, n) => dek.decode(mem().subarray(p, p + n));
  const pos = (x) => (x > 0 ? x : null);
  const eingabe = Array.isArray(optionen.eingabe) ? optionen.eingabe.slice() : [];
  let eof = false, ausstehend = null;
  const echtzeit = typeof optionen.echtzeit === 'number' ? Math.round(optionen.echtzeit) : 1700000000000;
  let berichte = null;
  const stats = { auftraege: 0, stuecke: 0, klone: 0 };

  const klonImporte = () => {
    const verboten = (name) => () => { throw new Error('Klon rief pizza.' + name); };
    const pizza = {};
    for (const n of ['ausgabe', 'schreibe', 'fehlerausgabe', 'leeren', 'warnung', 'fehler', 'panik', 'ui_senden', 'vorrat_lesen', 'vorrat_schreiben', 'kueche_bericht']) pizza[n] = verboten(n);
    pizza.eingabe = () => -1;
    pizza.ui_warte = (p, kap) => (kap < 0 ? 0 : -1);
    pizza.echtzeit_ms = () => echtzeit;
    pizza.kueche_auftrag = () => -1;
    return { pizza };
  };
  const neuerKlon = (schnapp) => {
    stats.klone++;
    const k = new WebAssembly.Instance(modul, klonImporte());
    const fehlt = schnapp.length / 65536 - k.exports.memory.buffer.byteLength / 65536;
    if (fehlt > 0) k.exports.memory.grow(fehlt);
    new Uint8Array(k.exports.memory.buffer).set(schnapp);
    return k;
  };
  const stueck = (k, auftrag, i) => {
    stats.stuecke++;
    const [p, n] = k.exports.kueche_stueck(auftrag, i);
    return new Uint8Array(k.exports.memory.buffer).slice(p, p + n);
  };

  const pizza = {
    ausgabe: (p, n) => emit({ typ: 'ausgabe', text: t(p, n) }),
    schreibe: (p, n) => emit({ typ: 'ausgabe', text: t(p, n), umbruch: false }),
    fehlerausgabe: (p, n) => emit({ typ: 'fehlerausgabe', text: t(p, n) }),
    leeren: () => emit({ typ: 'leeren' }),
    warnung: (cp, cn, tp, tn, z, s) => emit({ typ: 'warnung', code: t(cp, cn), text: t(tp, tn), zeile: pos(z), spalte: pos(s) }),
    fehler: (a, cp, cn, tp, tn, z, s) => emit({ typ: 'fehler', code: t(cp, cn), art: ARTEN[a], text: t(tp, tn), zeile: pos(z), spalte: pos(s) }),
    panik: (p, n) => emit({ typ: 'panik', text: t(p, n) }),
    eingabe: (art, pp, pn, bp, kap) => {
      if (art === 2) return !eof && eingabe.some(x => x !== null) ? 1 : 0;
      if (ausstehend === null) {
        let z = null;
        if (!eof && eingabe.length) z = eingabe.shift();
        if (z === null) eof = true;
        emit({ typ: 'eingabe', text: z });
        if (z === null) return -1;
        ausstehend = new TextEncoder().encode(z);
      }
      const b = ausstehend;
      if (b.length > kap) return b.length;
      mem().set(b, bp);
      ausstehend = null;
      return b.length;
    },
    ui_senden: (p, n) => emit({ typ: 'ui', nachricht: JSON.parse(t(p, n)) }),
    ui_warte: (p, kap) => (kap < 0 ? 0 : -1),
    vorrat_lesen: (np, nn, bp, kap) => (kap < 0 ? 0 : -1),
    vorrat_schreiben: (np, nn, jp, jn, ep, en) => { const ev = JSON.parse(t(ep, en)); emit({ typ: 'vorrat', name: t(np, nn), schluessel: ev.schluessel, wert: ev.wert }); return 0; },
    echtzeit_ms: () => echtzeit,
    kueche_auftrag: (auftrag, n) => {
      stats.auftraege++;
      const schnapp = mem().slice();
      berichte = new Array(n).fill(null);
      if (strategie === 'je') {
        for (let i = 1; i <= n; i++) berichte[i - 1] = stueck(neuerKlon(schnapp), auftrag, i);
      } else {
        const k = neuerKlon(schnapp);
        const reihe = [];
        for (let i = 1; i <= n; i++) reihe.push(i);
        if (strategie === 'rueck') reihe.reverse();
        for (const i of reihe) berichte[i - 1] = stueck(k, auftrag, i);
      }
      return 0;
    },
    kueche_bericht: (i, p, kap) => {
      const b = berichte && berichte[i - 1];
      if (!b) return -2;
      if (b.length > kap) return b.length;
      mem().set(b, p);
      return b.length;
    },
  };
  inst = new WebAssembly.Instance(modul, { pizza });
  const e = inst.exports;
  if (typeof optionen.schrittLimit === 'number' && optionen.schrittLimit > 0) e.limit_setzen(optionen.schrittLimit);
  if (typeof optionen.zufallsSaat === 'number' && Number.isInteger(optionen.zufallsSaat)) e.saat_setzen(optionen.zufallsSaat);
  for (const a of (Array.isArray(optionen.args) ? optionen.args.map(String) : [])) {
    const b = new TextEncoder().encode(a);
    const p = e.arg_puffer(b.length);
    mem().set(b, p);
    e.arg_fertig(b.length);
  }
  let exitCode;
  try { exitCode = e.start(); } catch (x) {
    emit({ typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas', text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', zeile: null, spalte: null, detail: String(x && x.message) });
    exitCode = 1;
  }
  emit({ typ: 'ende', exitCode, schritte: e.schritte(), zeitMs: e.zeitMs() });
  return { exitCode, ereignisse, schritte: e.schritte(), zeitMs: e.zeitMs(), stats };
}

module.exports = { fuehreMitKlonen };
