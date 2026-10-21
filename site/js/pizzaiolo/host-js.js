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
        emit({ typ: 'eingabe', text: zeile });
        if (zeile === null) return -1;
        let b = enk.encode(zeile);
        if (b.length > kap) {
          let n = kap;
          while (n > 0 && (b[n] & 0xC0) === 0x80) n--;
          b = b.subarray(0, n);
        }
        mem().set(b, bp);
        return b.length;
      },
    };
    inst = new WebAssembly.Instance(modul, { pizza });
    const e = inst.exports;
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
      exitCode = e.start();
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
