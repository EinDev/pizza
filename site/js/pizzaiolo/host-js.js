/*
 * pizzaiolo – JS-Host: führt ein .pkarton (ein Wasm-Modul, HOST-ABI.md) synchron aus.
 * Rückgabe wie PizzaLang.run: { exitCode, ereignisse, schritte, zeitMs }.
 */
(function (root, fabrik) {
  'use strict';
  const api = fabrik();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else { root.PizzaioloTeile = root.PizzaioloTeile || {}; root.PizzaioloTeile.hostJs = api; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';
  const ARTEN = ['syntax', 'pizzafehler', 'ananas', 'limit'];
  const dek = new TextDecoder();
  const enk = new TextEncoder();

  class PanikAbbruch extends Error {}

  /**
   * Führt aus. modul: WebAssembly.Module des Einzelmoduls (.pkarton) – oder zweiteilig:
   * { laufzeit: WebAssembly.Module, programm: WebAssembly.Module, tabellenZuwachs, speicherSeiten }.
   */
  function fuehreModulAus(modul, optionen) {
    optionen = optionen || {};
    const ereignisse = [];
    const onEvent = typeof optionen.onEvent === 'function' ? optionen.onEvent : null;
    const emit = (e) => {
      ereignisse.push(e);
      if (onEvent !== null) { try { onEvent(e); } catch (x) { /* Beobachterfehler ignorieren */ } }
    };
    const onEingabe = typeof optionen.onEingabe === 'function' ? optionen.onEingabe : null;
    const eingabe = Array.isArray(optionen.eingabe) ? optionen.eingabe.map(x => x == null ? null : String(x)) : null;
    let eingabePos = 0;
    let eof = false;
    let ausstehend = null, uiAusstehend = null, uiPos = 0;
    let inst = null;
    const mem = () => new Uint8Array(inst.exports.memory.buffer);
    const t = (p, n) => dek.decode(mem().subarray(p, p + n));
    const pos = (x) => (x > 0 ? x : null);
    const pizza = {
      ausgabe: (p, n) => emit({ typ: 'ausgabe', text: t(p, n) }),
      schreibe: (p, n) => emit({ typ: 'ausgabe', text: t(p, n), umbruch: false }),
      fehlerausgabe: (p, n) => emit({ typ: 'fehlerausgabe', text: t(p, n) }),
      leeren: () => emit({ typ: 'leeren' }),
      warnung: (cp, cn, tp, tn, z, s) => emit({ typ: 'warnung', code: t(cp, cn), text: t(tp, tn), zeile: pos(z), spalte: pos(s) }),
      fehler: (a, cp, cn, tp, tn, z, s) => emit({ typ: 'fehler', code: t(cp, cn), art: ARTEN[a] || 'ananas', text: t(tp, tn), zeile: pos(z), spalte: pos(s) }),
      panik: (p, n) => emit({ typ: 'panik', text: t(p, n) }),
      eingabe: (art, pp, pn, bp, kap) => {
        if (art === 2) {
          if (eof) return 0;
          if (onEingabe !== null) return 1;
          return eingabe !== null && eingabePos < eingabe.length && eingabe[eingabePos] !== null ? 1 : 0;
        }
        if (ausstehend === null) {
          const prompt = pn >= 0 ? t(pp, pn) : null;
          let zeile = null;
          if (eof) { /* EOF ist endgültig (K-042) */ }
          else if (onEingabe !== null) {
            try { zeile = onEingabe({ prompt, art: art === 1 ? 'zahl' : 'zeile' }); } catch (e) { zeile = null; }
            if (zeile === undefined) zeile = null;
          } else if (eingabe !== null && eingabePos < eingabe.length) {
            zeile = eingabe[eingabePos++];
          }
          if (zeile !== null) zeile = String(zeile).replace(/\r?\n$/, '');
          else eof = true;
          emit({ typ: 'eingabe', text: zeile });
          if (zeile === null) return -1;
          ausstehend = enk.encode(zeile);
        }
        const b = ausstehend;
        if (b.length > kap) return b.length;   // Retry mit größerem Puffer (K-013)
        mem().set(b, bp);
        ausstehend = null;
        return b.length;
      },
      ui_senden: (p, n) => {
        let nachricht;
        try { nachricht = JSON.parse(t(p, n)); } catch (e) { nachricht = t(p, n); }
        emit({ typ: 'ui', nachricht });
        if (typeof optionen.onUi === 'function') { try { optionen.onUi(nachricht); } catch (e) { /* ignorieren */ } }
      },
      ui_warte: (bp, kap) => {
        if (uiAusstehend === null) {
          let ev = null;
          if (typeof optionen.onUiWarte === 'function') { try { ev = optionen.onUiWarte(); } catch (e) { ev = null; } }
          else if (Array.isArray(optionen.uiEreignisse)) ev = uiPos < optionen.uiEreignisse.length ? optionen.uiEreignisse[uiPos++] : { typ: 'geschlossen' };
          if (ev === null || ev === undefined) return -1;
          uiAusstehend = enk.encode(typeof ev === 'string' ? ev : JSON.stringify(ev));
        }
        const b = uiAusstehend;
        if (b.length > kap) return b.length;
        mem().set(b, bp);
        uiAusstehend = null;
        return b.length;
      },
    };
    let e, startFn;
    if (modul instanceof WebAssembly.Module) {
      inst = new WebAssembly.Instance(modul, { pizza });
      e = inst.exports;
      startFn = e.start;
    } else {
      inst = new WebAssembly.Instance(modul.laufzeit, { pizza });
      e = inst.exports;
      const tab = e.__indirect_function_table;
      if (modul.tabellenZuwachs) tab.grow(modul.tabellenZuwachs);
      const fehlend = modul.speicherSeiten - e.memory.buffer.byteLength / 65536;
      if (fehlend > 0) e.memory.grow(fehlend);
      const imp = { memory: e.memory, __indirect_function_table: tab };
      for (const k of Object.keys(e)) if (k.startsWith('rt_')) imp[k] = e[k];
      const pinst = new WebAssembly.Instance(modul.programm, { laufzeit: imp });
      startFn = pinst.exports.start;
    }
    if (typeof optionen.schrittLimit === 'number' && optionen.schrittLimit > 0) e.limit_setzen(optionen.schrittLimit);
    if (typeof optionen.speicherMiB === 'number') e.speicher_limit_setzen(optionen.speicherMiB);
    for (const a of (Array.isArray(optionen.args) ? optionen.args.map(String) : [])) {
      const b = enk.encode(a);
      const p = e.arg_puffer(b.length);
      mem().set(b, p);
      e.arg_fertig(b.length);
    }
    let exitCode;
    try {
      exitCode = startFn();
      if (![0, 1, 2, 3, 39].includes(exitCode)) throw new Error('unerwarteter Exit-Code ' + exitCode);
    } catch (x) {
      if (typeof process !== 'undefined' && process.env && process.env.PIZZAIOLO_DEBUG) console.error(x && x.stack);
      emit({ typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas', text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', zeile: null, spalte: null, detail: String(x && x.message) });
      exitCode = 1;
    }
    const schritte = e.schritte();
    const zeitMs = e.zeitMs();
    emit({ typ: 'ende', exitCode, schritte, zeitMs });
    return { exitCode, ereignisse, schritte, zeitMs };
  }

  function fuehreAus(pkarton, optionen) {
    return fuehreModulAus(new WebAssembly.Module(pkarton), optionen);
  }

  return { fuehreAus, fuehreModulAus, PanikAbbruch };
});
