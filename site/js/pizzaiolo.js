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
      koch: require('./pizzaiolo/koch.js'),
      vorbackerApi: () => require('./herd/teigling.js'),   // Vorbacker-Hülle (PROJEKTE §5.3), nur für Projekte mit Bildern
    };
    PizzaLang = require('./pizza.js');
  } else {
    const DATEIEN = ['kodierer', 'linker', 'frontend', 'ir', 'backend-wasm', 'host-js', 'laufzeit-daten', 'koch'];
    const fehlt = !root.PizzaioloTeile || !root.PizzaioloTeile.hostJs || !root.PizzaioloTeile.laufzeitDaten;
    if (fehlt && typeof importScripts === 'function') {
      for (const d of DATEIEN) importScripts('pizzaiolo/' + d + '.js');
    }
    teile = root.PizzaioloTeile || {};
    // Vorbacker-Hülle erst bei Bedarf (Projekt mit Bildern): im Worker per importScripts (relativ zu js/), sonst schon geladen
    teile.vorbackerApi = () => {
      if (!root.PizzaVorbacker && typeof importScripts === 'function') { try { importScripts('herd/teigling.js'); } catch (e) { /* fehlt → HOST-Fehler */ } }
      return root.PizzaVorbacker || null;
    };
    PizzaLang = root.PizzaLang;
  }
  const api = fabrik(teile, PizzaLang);
  if (imNode) module.exports = api;
  else root.Pizzaiolo = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function (teile, PizzaLang) {
  'use strict';
  const VERSION = '3.1.0';
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

  // ------------------------------------------------------------ Projekte (SPEC §2, PROJEKTE.md §2.8, §5.6; PA2)
  const BILD_ENDUNG = /\.(png|jpe?g)$/;
  const TEXT_ENDUNG = /\.(pizza|txt|json|csv|md)$/;
  const ART_TEXT = 0, ART_BILD = 1, ART_SONST = 2;   // laufzeit/src/kiste.rs
  const enk = new TextEncoder();

  // Vorbacker (teigling.wasm, PROJEKTE §5.3/§5.4): optionen.vorbacker (WebAssembly.Module oder Bytes) wie im Interpreter,
  // in Node ohne Option site/js/herd/teigling.wasm. Je Modul eine Instanz (zustandslos zwischen Aufrufen).
  const vorbackerCache = new WeakMap();
  let vorbackerNode;
  function vorbacker(opt) {
    const V = teile.vorbackerApi ? teile.vorbackerApi() : null;
    if (!V) return null;
    if (opt !== undefined && opt !== null) {
      if (typeof opt !== 'object') return null;
      // eigene Hülle { vorbacken, sha256 } (wie im Interpreter, z. B. ein Vorbacker aus PizzaVorbacker)
      if (typeof opt.vorbacken === 'function' && typeof opt.sha256 === 'function') {
        if (typeof opt.besorge === 'function') return opt;
        return { besorge: (t, q) => { const k = t ? V.kopf(t) : null; return k && k.sha256 === V.hex(opt.sha256(q)) ? t : opt.vorbacken(q); } };
      }
      let v = vorbackerCache.get(opt);
      if (v === undefined) {
        try { v = opt instanceof WebAssembly.Module ? V.ausModul(opt) : V.ausBytes(opt); } catch (e) { v = null; }
        vorbackerCache.set(opt, v);
      }
      return v;
    }
    if (vorbackerNode === undefined) {
      vorbackerNode = null;
      if (typeof V.node === 'function' && typeof process !== 'undefined' && process.versions && process.versions.node) {
        try { vorbackerNode = V.node(); } catch (e) { vorbackerNode = null; }
      }
    }
    return vorbackerNode;
  }

  /**
   * Kiste fürs Datensegment (HOST-ABI §1 v2): Pfade nach Bytefolge, Texte als UTF-8, Bilder als Teigling (geprüft bzw. neu
   * vorgebacken – ein veralteter Cache ändert nie das Ergebnis), gleiche Inhalte nur einmal; dazu die Teigmenge (P0020).
   * → { ok: true, kiste: { eintraege, daten }, teigmengeFehler } | { ok: false, fehler } (Vorbacker fehlt, wie im Interpreter)
   */
  function baueKiste(sammlung, optionen) {
    const pfade = Object.keys(sammlung || {}).sort();   // Pfade sind ASCII (SPEC §2.1) → Codeeinheiten = Bytefolge
    const bilder = pfade.filter(p => BILD_ENDUNG.test(p));
    let vb = null;
    if (bilder.length) {
      vb = vorbacker(optionen.vorbacker);
      if (vb === null) return { ok: false, fehler: { code: 'HOST', art: 'intern', text: 'PizzaFehler HOST: Der Vorbacker fehlt (teigling.wasm).', datei: null, zeile: null, spalte: null } };
    }
    const V = vb ? teile.vorbackerApi() : null;
    const teiglinge = optionen.teiglinge && typeof optionen.teiglinge === 'object' ? optionen.teiglinge : {};
    const stuecke = [], gesehen = new Map(), eintraege = [], fertig = [];
    let laenge = 0;
    const lege = (schluessel, bytes) => {
      let o = gesehen.get(schluessel);
      if (o === undefined) { o = laenge; gesehen.set(schluessel, o); stuecke.push(bytes); laenge += bytes.length; }
      return o;
    };
    for (const pfad of pfade) {
      const v = sammlung[pfad];
      const bytes = typeof v === 'string' ? enk.encode(v) : (v instanceof Uint8Array ? v : new Uint8Array(v || 0));
      if (BILD_ENDUNG.test(pfad)) {
        const t = vb.besorge(teiglinge[pfad] instanceof Uint8Array ? teiglinge[pfad] : null, bytes);
        const k = V.kopf(t);
        fertig.push(t);
        eintraege.push({ pfad, art: ART_BILD, off: lege('t:' + (k ? k.sha256 + ':' + t.length : pfad), t), len: t.length });
      } else if (TEXT_ENDUNG.test(pfad)) {
        eintraege.push({ pfad, art: ART_TEXT, off: lege('p:' + pfad, bytes), len: bytes.length });
      } else eintraege.push({ pfad, art: ART_SONST, off: 0, len: 0 });
    }
    const daten = new Uint8Array(laenge);
    let o = 0;
    for (const s of stuecke) { daten.set(s, o); o += s.length; }
    return { ok: true, kiste: { eintraege, daten }, teigmengeFehler: V ? V.teigmengeFehler(V.teigmenge(fertig)) : null };
  }

  /**
   * Quelle (Text oder Projekt) → IR über den gemeinsamen Lader (wie PizzaLang.run).
   * → { ok: true, ir, projekt } | { ok: false, fehler } | { ok: false, nichtUnterstuetzt } (| intern)
   */
  function vorbereite(quelle, optionen) {
    const p = PizzaLang.projekt.lade(quelle);
    if (!p.ok) return { ok: false, fehler: p.fehler };
    const k = baueKiste(p.kiste, optionen);
    if (!k.ok) return { ok: false, fehler: k.fehler };
    const dateien = p.ast.dateiPfade || null;
    const warnungen = p.warnungen.map(w => ({ code: w.code, text: w.text, zeile: w.zeile, spalte: w.spalte, d: w.datei !== null && dateien ? Math.max(0, dateien.indexOf(w.datei)) : 0 }));
    const f = teile.frontend.frontend(p.ast, { PizzaLang, warnungen, teigmengeFehler: k.teigmengeFehler, projekt: { dateien, args: p.args, kiste: k.kiste } });
    if (!f.ok) return { ok: false, nichtUnterstuetzt: f.nichtUnterstuetzt };
    return { ok: true, ir: f.ir, projekt: { name: p.name, dateien: p.ladeliste.length } };
  }

  function nichtUnterstuetztAus(e, ir) {
    if (e instanceof teile.backendWasm.NichtUnterstuetzt) {
      const pos = typeof e.p === 'number' && ir && ir.pos[e.p] ? ir.pos[e.p] : [null, null, 0];
      const pfade = ir && ir.projekt && ir.projekt.dateien;
      return { ok: false, nichtUnterstuetzt: [{ datei: pfade && pos[0] ? pfade[pos[2] || 0] || null : null, zeile: pos[0] || null, spalte: pos[1] || null, grund: e.grund }] };
    }
    return { ok: false, nichtUnterstuetzt: [{ datei: null, zeile: null, spalte: null, grund: 'Interner Compilerfehler: ' + (e && e.message) }], intern: e };
  }

  /** interner Schnellpfad: Programm als kleines Zusatzmodul zur gecachten Laufzeit */
  function kompiliereTeil(quelle, optionen) {
    const t0 = jetzt();
    let ir = null;
    try {
      const v = vorbereite(quelle, optionen || {});
      if (!v.ok) return v;
      ir = v.ir;
      const mb = new teile.linker.ProgrammModulbau(laufzeit(), teile.laufzeitDaten.info);
      teile.backendWasm.erzeuge(ir, mb, teile.laufzeitDaten.info);
      const b = mb.baue();
      const modul = { laufzeit: laufzeitModul(), programm: new WebAssembly.Module(b.bytes), tabellenZuwachs: b.tabellenZuwachs, speicherSeiten: b.speicherSeiten, gruppen: (ir.gruppen || []).slice() };
      return { ok: true, modul, kompilierMs: jetzt() - t0 };
    } catch (e) { return nichtUnterstuetztAus(e, ir); }
  }

  function unterstuetzt() {
    try { return typeof WebAssembly === 'object' && typeof WebAssembly.Module === 'function' && !!teile.backendWasm && !!PizzaLang; }
    catch (e) { return false; }
  }

  /** Quelle (Text oder Projekt, wie PizzaLang.run) → { ok, pkarton, kompilierMs, statistik } | { ok:false, fehler } | { ok:false, nichtUnterstuetzt } */
  function kompiliere(quelle, optionen) {
    optionen = optionen || {};
    const t0 = jetzt();
    let ir = null;
    try {
      const v = vorbereite(quelle, optionen);
      if (!v.ok) return v;
      ir = v.ir;
      const mb = new teile.linker.Modulbau(laufzeit(), teile.laufzeitDaten.info, ir.gruppen || []);
      teile.backendWasm.erzeuge(ir, mb, teile.laufzeitDaten.info);
      const pkarton = mb.baue({ format: 'pkarton/1', abi: 2, compiler: VERSION, laufzeit: teile.laufzeitDaten.info.hash, projekt: v.projekt });
      const kompilierMs = jetzt() - t0;
      return { ok: true, pkarton, kompilierMs, statistik: { funktionen: ir.funktionen.length, bytes: pkarton.length }, ir: optionen.mitIR ? ir : undefined };
    } catch (e) { return nichtUnterstuetztAus(e, ir); }
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
    const k = kompiliereTeil(quelltext, optionen);
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
    abi: 2,
    laufOptionen: Object.freeze(['args', 'schrittLimit', 'speicherMiB', 'onEvent', 'eingabe', 'onEingabe', 'zufallsSaat',
      'vorrat', 'onVorrat', 'echtzeit', 'zone', 'uiEreignisse', 'onUi', 'onUiWarte', 'motor', 'koeche', 'kuechenChaos', 'herdKern', 'onHerd',
      'herdAnsicht', 'klangKern', 'onKlang', 'teiglinge', 'vorbacker']),
    importgruppen: Object.freeze(['basis', 'theke', 'vorrat', 'echtzeit', 'kueche', 'herd', 'klang']),
    features: Object.freeze(['theke', 'theke-v2', 'takt', 'zufall', 'vorratskammer', 'zahlformat', 'uhr-echt', 'uhr-zone',
      'schrittlimit-je-rueckruf', 'eingabe', 'interaktiv', 'brigade', 'herd', 'projekte', 'kiste', 'bildchen-laden', 'klang']),
    ereignisse: Object.freeze(['ausgabe', 'fehlerausgabe', 'leeren', 'warnung', 'fehler', 'panik', 'eingabe', 'ui', 'vorrat', 'herd', 'klang', 'motor', 'ende']),
    motoren: Object.freeze(['auto', 'wasm', 'interpreter']),
  });

  /**
   * Köche-Pool für die Küchenbrigade (THREADS §4.6): kuechenPool(k = "auto" | 1 | 2 | 4 | 8 …, { url?, budget? })
   * → Promise<Pool | null>. Vor dem Lauf anlegen und als optionen.koeche übergeben; ohne Pool (null, Zahl, "auto")
   * führt das Modul die Stücke selbst aus – gleiches Ergebnis. pool.koeche = Anzahl Köche, pool.beenden() beendet sie.
   * "auto" = logische Kerne, höchstens 16. null ohne SharedArrayBuffer/Cross-Origin-Isolation, im Browser-Hauptthread
   * oder ohne (verschachtelte) Worker.
   */
  function kuechenPool(k, optionen) {
    if (!teile.koch) return Promise.resolve(null);
    return teile.koch.kuechenPool(k, optionen);
  }

  // projekte: kompiliert Projekte (Dateisammlungen) – der Worker gibt sie dem Wasm-Motor erst damit (PROJEKTE PB1/PA2)
  return { version: VERSION, projekte: true, faehigkeiten, unterstuetzt, kompiliere, run, fuehreAus, kuechenPool, _kompiliereTeil: kompiliereTeil, _teile: teile };
});
