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

  /** K-154: Wert von `zone_ms` – optionen.zone fest (gerundet); feste Wanduhr ohne zone → 0; sonst Ortszeit − UTC (ganze Minuten). */
  function zoneMs(zone, echtzeit) {
    if (typeof zone === 'number' && isFinite(zone)) return Math.round(zone);
    if (typeof echtzeit === 'number' && isFinite(echtzeit)) return 0;
    const m = Math.round(-new Date(Date.now()).getTimezoneOffset());
    return m === 0 ? 0 : m * 60000;
  }

  // ---------- Herd (HOST-ABI §2, Gruppe herd): Kern-Modul laden ----------
  const HERD_KERN_FEHLT = 'PizzaFehler HOST: Der Herd-Kern fehlt (kern.wasm).';
  let herdStandard;                          // undefined: noch nicht versucht · null: nicht vorhanden · Module
  const herdCache = new WeakMap();           // Bytes → Module
  /** optionen.herdKern (WebAssembly.Module oder Bytes) bzw. in Node site/js/herd/kern.wasm → Module oder null */
  function herdModul(k) {
    if (k !== undefined && k !== null) {
      if (k instanceof WebAssembly.Module) return k;
      if (typeof k !== 'object') return null;
      let m = herdCache.get(k);
      if (m === undefined) { try { m = new WebAssembly.Module(k); } catch (e) { m = null; } herdCache.set(k, m); }
      return m;
    }
    if (herdStandard === undefined) {
      herdStandard = null;
      // HERD-NODE-ANFANG – nur Node (wie pizza.js); im Browser übergibt der Worker optionen.herdKern
      if (typeof require === 'function' && typeof __dirname === 'string') {
        try { herdStandard = new WebAssembly.Module(require('fs').readFileSync(require('path').join(__dirname, '..', 'herd', 'kern.wasm'))); } catch (e) { herdStandard = null; }
      }
      // HERD-NODE-ENDE
    }
    return herdStandard;
  }
  /** neue Kern-Instanz (eine Welt je Lauf) oder null */
  function herdInstanz(k) {
    const m = herdModul(k);
    if (m === null) return null;
    try {
      const e = new WebAssembly.Instance(m, {}).exports;
      return typeof e.abi_version === 'function' && e.abi_version() === 1 ? e : null;
    } catch (e) { return null; }
  }
  const herdStubs = new WeakMap();           // Laufzeit-Modul → Platzhalter für Modul „herd“ (Programme ohne Gruppe herd)
  function herdPlatzhalter(modul) {
    let s = herdStubs.get(modul);
    if (s === undefined) {
      s = {};
      for (const im of WebAssembly.Module.imports(modul)) if (im.module === 'herd') s[im.name] = () => { throw new Error('Herd-Kern nicht geladen (herd.' + im.name + ')'); };
      herdStubs.set(modul, s);
    }
    return s;
  }
  function brauchtHerd(modul) {
    if (modul instanceof WebAssembly.Module) return WebAssembly.Module.imports(modul).some(i => i.module === 'herd');
    return Array.isArray(modul.gruppen) ? modul.gruppen.includes('herd') : WebAssembly.Module.imports(modul.programm).some(i => i.module === 'herd');
  }

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
    let ausstehend = null, uiAusstehend = null, uiPos = 0, vorratAusstehend = null;
    let inst = null;
    // Köche: nur ein Pool-Objekt (Pizzaiolo.kuechenPool) bringt Köche; Zahlen/"auto" erzeugen keinen Pool (THREADS §4.6)
    const pool = optionen.koeche && typeof optionen.koeche === 'object' && typeof optionen.koeche.brigade === 'function' ? optionen.koeche : null;
    let berichte = null, koecheGenutzt = 0;
    const mem = () => new Uint8Array(inst.exports.memory.buffer);
    const t = (p, n) => dek.decode(mem().subarray(p, p + n));
    const pos = (x) => (x > 0 ? x : null);
    // Herd: Kern-Instanz nur für Programme mit Gruppe herd; ihre Exporte werden direkt als Modul „herd“ gebunden
    const laufzeitModul = modul instanceof WebAssembly.Module ? modul : modul.laufzeit;
    const kern = brauchtHerd(modul) ? herdInstanz(optionen.herdKern) : null;
    const onHerd = typeof optionen.onHerd === 'function' ? optionen.onHerd : null;
    let kernU8 = null;
    const kernMem = () => { const b = kern.memory.buffer; if (kernU8 === null || kernU8.buffer !== b) kernU8 = new Uint8Array(b); return kernU8; };
    // Renderer-Ereignisse (Theke ui_warte und Herd herd_warte teilen dieselbe Quelle: onUiWarte / uiEreignisse)
    const warte = (bp, kap) => {
      if (kap < 0) return (typeof optionen.onUiWarte === 'function' || Array.isArray(optionen.uiEreignisse)) ? 1 : 0;
      if (uiAusstehend === null) {
        let ev = null;
        if (typeof optionen.onUiWarte === 'function') { try { ev = optionen.onUiWarte(); } catch (e) { ev = null; } }
        else if (Array.isArray(optionen.uiEreignisse)) ev = uiPos < optionen.uiEreignisse.length ? optionen.uiEreignisse[uiPos++] : { typ: 'geschlossen' };
        if (ev === null || ev === undefined || typeof ev !== 'object') return -1;
        uiAusstehend = enk.encode(typeof ev === 'string' ? ev : JSON.stringify(ev));
      }
      const b = uiAusstehend;
      if (b.length > kap) return b.length;
      mem().set(b, bp);
      uiAusstehend = null;
      return b.length;
    };
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
      echtzeit_ms: () => (typeof optionen.echtzeit === 'number' && isFinite(optionen.echtzeit) ? Math.round(optionen.echtzeit) : Date.now()),
      zone_ms: () => zoneMs(optionen.zone, optionen.echtzeit),   // K-154
      vorrat_lesen: (np, nn, bp, kap) => {
        const vorratOpt = optionen.vorrat !== null && typeof optionen.vorrat === 'object' ? optionen.vorrat : null;
        if (kap < 0) return (vorratOpt !== null || typeof optionen.onVorrat === 'function') ? 1 : 0;
        if (vorratAusstehend === null) {
          if (vorratOpt === null) return -1;
          let e = null;
          try { e = vorratOpt[t(np, nn)]; } catch (x) { e = null; }
          if (e && !Array.isArray(e) && Array.isArray(e.eintraege)) e = e.eintraege;
          if (!Array.isArray(e)) return -1;
          vorratAusstehend = enk.encode(JSON.stringify(e.map(p => Array.isArray(p) ? [p[0], p[1] === undefined ? null : p[1]] : null)));
        }
        const b = vorratAusstehend;
        if (b.length > kap) return b.length;
        mem().set(b, bp);
        vorratAusstehend = null;
        return b.length;
      },
      vorrat_schreiben: (np, nn, jp, jn, ep, en) => {
        const name = t(np, nn);
        const ev = JSON.parse(t(ep, en));
        emit({ typ: 'vorrat', name, schluessel: ev.schluessel, wert: ev.wert });
        if (typeof optionen.onVorrat === 'function') {
          let ok = true;
          try { ok = optionen.onVorrat(name, JSON.parse(t(jp, jn)).eintraege) !== false; } catch (x) { ok = false; }
          if (!ok) return -1;
        }
        return 0;
      },
      // Küchenbrigade (HOST-ABI §2, Gruppe kueche; THREADS §4.6): mit einem Köche-Pool (optionen.koeche = Pool aus
      // Pizzaiolo.kuechenPool) laufen die Stücke in Klon-Instanzen; ohne Pool (Zahl, "auto", 1 …) → -1, das Modul führt
      // die Stücke selbst nacheinander aus (Inline-Pfad, gleiches Ergebnis).
      kueche_auftrag: (auftrag, n) => {
        berichte = null;
        if (pool === null) return -1;
        const r = pool.brigade(modul, mem(), auftrag, n, { chaos: optionen.kuechenChaos, echtzeit: optionen.echtzeit, zone: optionen.zone });
        if (r === null) return -1;
        berichte = r.berichte;
        if (r.koeche > koecheGenutzt) koecheGenutzt = r.koeche;
        return 0;
      },
      kueche_bericht: (i, p, kap) => {
        const b = berichte !== null ? berichte[i - 1] : undefined;
        if (b === undefined || b === null) return -2;
        // Trap in einem Klon → Abbruch „interner Fehler“ (K-014) in der Hauptinstanz, wie ein Trap auf dem Inline-Pfad (K-104)
        if (!(b instanceof Uint8Array)) throw new Error('Trap in einem Koch (Stück ' + i + '): ' + b.trap);
        if (b.length > kap) return b.length;   // Retry (K-013)
        mem().set(b, p);
        return b.length;
      },
      ui_warte: warte,
      // Gruppe herd (HOST-ABI §2): Kern da? (pflicht = 1 und fehlt → HOST-Fehler wie im Interpreter, K-128)
      herd_kern: (pflicht) => {
        if (kern !== null) return 1;
        if (pflicht === 1) emit({ typ: 'fehler', code: 'HOST', art: 'intern', text: HERD_KERN_FEHLT, zeile: null, spalte: null });
        return 0;
      },
      // Kopierweg (selten: Texte, Listen, Hashes): Programm-Speicher ↔ Kern-Speicher
      herd_schreibe: (kp, pp, n) => { kernMem().set(mem().subarray(pp, pp + n), kp); },
      herd_lies: (pp, kp, n) => { mem().set(kernMem().subarray(kp, kp + n), pp); },
      herd_warte: warte,
      // Ereignis (JSON ohne typ); Bildpaket-Bytes nur an onHerd, nie in die Ereignisliste (SPEC §18.7)
      herd_senden: (p, n, paketLen) => {
        const daten = JSON.parse(t(p, n));
        const art = daten.art;
        delete daten.art;
        emit(Object.assign({ typ: 'herd', art }, daten));
        if (onHerd !== null) {
          if (paketLen >= 0 && kern !== null) { const z = kern.bild_zeiger(); daten.bytes = kernMem().slice(z, z + paketLen); }
          try { onHerd(art, daten); } catch (x) { /* Renderer-Fehler ignorieren */ }
        }
      },
    };
    // Modul „herd“: die Exporte von kern.wasm direkt (numerische Aufrufe ohne JS dazwischen); ohne Kern Platzhalter
    const herd = kern !== null ? kern : herdPlatzhalter(laufzeitModul);
    let e, startFn;
    if (modul instanceof WebAssembly.Module) {
      inst = new WebAssembly.Instance(modul, { pizza, herd });
      e = inst.exports;
      startFn = e.start;
    } else {
      inst = new WebAssembly.Instance(modul.laufzeit, { pizza, herd });
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
    if (typeof optionen.zufallsSaat === 'number' && Number.isInteger(optionen.zufallsSaat) && e.saat_setzen) e.saat_setzen(optionen.zufallsSaat);
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
    // `koeche` (K-100): nur wenn wirklich Köche gekocht haben – sonst bleibt `ende` wie bisher
    if (koecheGenutzt > 0) {
      emit({ typ: 'ende', exitCode, schritte, zeitMs, koeche: koecheGenutzt });
      return { exitCode, ereignisse, schritte, zeitMs, koeche: koecheGenutzt };
    }
    emit({ typ: 'ende', exitCode, schritte, zeitMs });
    return { exitCode, ereignisse, schritte, zeitMs };
  }

  function fuehreAus(pkarton, optionen) {
    return fuehreModulAus(new WebAssembly.Module(pkarton), optionen);
  }

  return { fuehreAus, fuehreModulAus, PanikAbbruch };
});
