/*
 * pizzaiolo – pizza → WebAssembly (Compiler + JS-Host). API siehe WASM.md §4.
 * UMD: Browser/Worker → self.Pizzaiolo (benötigt self.PizzaLang; lädt die Teile per importScripts aus js/pizzaiolo/),
 *      Node → module.exports.
 */
(function (root, fabrik) {
  'use strict';
  const imNode = typeof module === 'object' && module && module.exports && typeof require === 'function';
  let teile, PizzaLang;
  if (imNode) {
    teile = {
      kodierer: require('./pizzaiolo/kodierer.js'),
      linker: require('./pizzaiolo/linker.js'),
      frontend: require('./pizzaiolo/frontend.js'),
      ir: require('./pizzaiolo/ir.js'),
      backendWasm: require('./pizzaiolo/backend-wasm.js'),
      hostJs: require('./pizzaiolo/host-js.js'),
      laufzeitDaten: require('./pizzaiolo/laufzeit-daten.js'),
    };
    PizzaLang = require('./pizza.js');
  } else {
    const DATEIEN = ['kodierer', 'linker', 'frontend', 'ir', 'backend-wasm', 'host-js', 'laufzeit-daten'];
    const fehlt = !root.PizzaioloTeile || !root.PizzaioloTeile.hostJs || !root.PizzaioloTeile.laufzeitDaten;
    if (fehlt && typeof importScripts === 'function') {
      for (const d of DATEIEN) importScripts('pizzaiolo/' + d + '.js');
    }
    teile = root.PizzaioloTeile || {};
    PizzaLang = root.PizzaLang;
  }
  const api = fabrik(teile, PizzaLang);
  if (imNode) module.exports = api;
  else root.Pizzaiolo = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function (teile, PizzaLang) {
  'use strict';
  const VERSION = '0.1.0';
  const jetzt = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  let laufzeitBytes = null;
  function laufzeit() {
    if (laufzeitBytes) return laufzeitBytes;
    const d = teile.laufzeitDaten;
    if (typeof Buffer !== 'undefined') laufzeitBytes = new Uint8Array(Buffer.from(d.base64, 'base64'));
    else {
      const s = atob(d.base64);
      const b = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
      laufzeitBytes = b;
    }
    return laufzeitBytes;
  }

  let laufzeitModulCache = null;
  function laufzeitModul() {
    if (!laufzeitModulCache) laufzeitModulCache = new WebAssembly.Module(laufzeit());
    return laufzeitModulCache;
  }

  /** interner Schnellpfad: Programm als kleines Zusatzmodul zur gecachten Laufzeit */
  function kompiliereTeil(quelltext) {
    const t0 = jetzt();
    const p = PizzaLang.parse(quelltext);
    if (!p.ok) return { ok: false, fehler: p.fehler };
    let ir = null;
    try {
      const f = teile.frontend.frontend(p.ast);
      if (!f.ok) return { ok: false, nichtUnterstuetzt: f.nichtUnterstuetzt };
      ir = f.ir;
      const mb = new teile.linker.ProgrammModulbau(laufzeit(), teile.laufzeitDaten.info);
      teile.backendWasm.erzeuge(ir, mb, teile.laufzeitDaten.info);
      const b = mb.baue();
      const modul = { laufzeit: laufzeitModul(), programm: new WebAssembly.Module(b.bytes), tabellenZuwachs: b.tabellenZuwachs, speicherSeiten: b.speicherSeiten };
      return { ok: true, modul, kompilierMs: jetzt() - t0 };
    } catch (e) {
      if (e instanceof teile.backendWasm.NichtUnterstuetzt) {
        const pos = typeof e.p === 'number' && ir && ir.pos[e.p] ? ir.pos[e.p] : [null, null];
        return { ok: false, nichtUnterstuetzt: [{ zeile: pos[0] || null, spalte: pos[1] || null, grund: e.grund }] };
      }
      return { ok: false, nichtUnterstuetzt: [{ zeile: null, spalte: null, grund: 'Interner Compilerfehler: ' + (e && e.message) }], intern: e };
    }
  }

  function unterstuetzt() {
    try { return typeof WebAssembly === 'object' && typeof WebAssembly.Module === 'function' && !!teile.backendWasm && !!PizzaLang; }
    catch (e) { return false; }
  }

  /** Quelltext → { ok, pkarton, kompilierMs, statistik } | { ok:false, fehler } | { ok:false, nichtUnterstuetzt } */
  function kompiliere(quelltext, optionen) {
    optionen = optionen || {};
    const t0 = jetzt();
    const p = PizzaLang.parse(quelltext);
    if (!p.ok) return { ok: false, fehler: p.fehler };
    let ir = null;
    try {
      const f = teile.frontend.frontend(p.ast);
      if (!f.ok) return { ok: false, nichtUnterstuetzt: f.nichtUnterstuetzt };
      ir = f.ir;
      const mb = new teile.linker.Modulbau(laufzeit(), teile.laufzeitDaten.info, ir.gruppen || []);
      teile.backendWasm.erzeuge(ir, mb, teile.laufzeitDaten.info);
      const pkarton = mb.baue({ format: 'pkarton/1', abi: 1, compiler: VERSION, laufzeit: teile.laufzeitDaten.info.hash });
      const kompilierMs = jetzt() - t0;
      return { ok: true, pkarton, kompilierMs, statistik: { funktionen: ir.funktionen.length, bytes: pkarton.length }, ir: optionen.mitIR ? ir : undefined };
    } catch (e) {
      if (e instanceof teile.backendWasm.NichtUnterstuetzt) {
        const pos = typeof e.p === 'number' && ir && ir.pos[e.p] ? ir.pos[e.p] : [null, null];
        return { ok: false, nichtUnterstuetzt: [{ zeile: pos[0] || null, spalte: pos[1] || null, grund: e.grund }] };
      }
      return { ok: false, nichtUnterstuetzt: [{ zeile: null, spalte: null, grund: 'Interner Compilerfehler: ' + (e && e.message) }], intern: e };
    }
  }

  function fuehreAus(pkarton, optionen) {
    const r = teile.hostJs.fuehreAus(pkarton, optionen);
    r.motor = 'wasm';
    return r;
  }

  function sende(optionen, ev) {
    if (typeof optionen.onEvent === 'function') { try { optionen.onEvent(ev); } catch (e) { /* ignorieren */ } }
  }

  /** wie PizzaLang.run; optionen.motor: "auto" | "wasm" | "interpreter" */
  function run(quelltext, optionen) {
    optionen = optionen || {};
    const motor = optionen.motor || 'auto';
    if (motor === 'interpreter') {
      const r = PizzaLang.run(quelltext, optionen);
      r.motor = 'interpreter';
      r.kompilierMs = 0;
      return r;
    }
    const k = kompiliereTeil(quelltext);
    if (k.ok) {
      let motorEv = null;
      if (motor === 'auto') { motorEv = { typ: 'motor', motor: 'wasm', kompilierMs: k.kompilierMs }; sende(optionen, motorEv); }
      const r = teile.hostJs.fuehreModulAus(k.modul, optionen);
      if (motorEv) r.ereignisse.unshift(motorEv);
      r.motor = 'wasm';
      r.kompilierMs = k.kompilierMs;
      return r;
    }
    const grund = k.fehler ? 'Syntaxfehler' : (k.nichtUnterstuetzt || []).map(n => n.grund + (n.zeile ? ' (Zeile ' + n.zeile + ')' : '')).join('; ');
    if (motor === 'wasm' && !k.fehler) throw new Error('pizzaiolo: nicht unterstützt: ' + grund);
    let motorEv = null;
    if (motor === 'auto') { motorEv = { typ: 'motor', motor: 'interpreter', grund }; sende(optionen, motorEv); }
    const r = PizzaLang.run(quelltext, optionen);
    if (motorEv) r.ereignisse.unshift(motorEv);
    r.motor = 'interpreter';
    r.kompilierMs = 0;
    return r;
  }

  /** Maschinenlesbar: was dieser Compiler/JS-Host unterstützt (für Harnische, UI, Differenztests) */
  const faehigkeiten = Object.freeze({
    version: VERSION,
    abi: 1,
    laufOptionen: Object.freeze(['args', 'schrittLimit', 'speicherMiB', 'onEvent', 'eingabe', 'onEingabe', 'zufallsSaat',
      'vorrat', 'onVorrat', 'echtzeit', 'uiEreignisse', 'onUi', 'onUiWarte', 'motor']),
    importgruppen: Object.freeze(['basis', 'theke', 'vorrat', 'echtzeit', 'kueche']),
    features: Object.freeze(['theke', 'theke-v2', 'takt', 'zufall', 'vorratskammer', 'zahlformat', 'uhr-echt',
      'schrittlimit-je-rueckruf', 'eingabe', 'interaktiv', 'brigade']),
    ereignisse: Object.freeze(['ausgabe', 'fehlerausgabe', 'leeren', 'warnung', 'fehler', 'panik', 'eingabe', 'ui', 'vorrat', 'motor', 'ende']),
    motoren: Object.freeze(['auto', 'wasm', 'interpreter']),
  });

  return { version: VERSION, faehigkeiten, unterstuetzt, kompiliere, run, fuehreAus, _kompiliereTeil: kompiliereTeil, _teile: teile };
});
