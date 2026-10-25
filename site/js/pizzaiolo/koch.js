/*
 * pizzaiolo – Köche für die Küchenbrigade (THREADS.md §4.6, HOST-ABI §2 Gruppe `kueche`, K-104).
 *
 * Eine Datei, zwei Rollen:
 *   1. Teil des JS-Hosts (Node: require, Browser/Worker: PizzaioloTeile.koch): `kuechenPool(k)` erzeugt k − 1 Koch-Worker
 *      (Node: worker_threads, Browser: Worker mit name "pizza-koch"); der aufrufende Thread ist selbst der k-te Koch.
 *   2. Skript eines Koch-Workers (erkannt an workerData.pizzaKoch bzw. self.name === "pizza-koch").
 *
 * Protokoll (kein geteilter Wasm-Speicher, keine Wasm-Threads – THREADS §4.4):
 *   - Hinweg per postMessage: { typ: "modul" } einmal je Modul (WebAssembly.Module ist strukturierbar), je Brigade
 *     { typ: "brigade" } mit dem Schnappschuss (SharedArrayBuffer mit einer Kopie des Hauptspeichers) und einem kleinen
 *     Steuer-SAB (Warteschlange, kleinster Abbruch). Der Hauptthread blockiert danach; die Köche empfangen trotzdem, weil
 *     ihre Ereignisschleifen frei sind. Der Hauptthread arbeitet selbst mit – ein Koch, der nie antwortet, kann den Lauf
 *     also nicht festhalten (er holt sich nur kein Stück).
 *   - Stücke verteilt eine dynamische Warteschlange (Atomics.add); die Planung ist frei (SPEC §17.6 D2).
 *   - Rückweg nur über SharedArrayBuffer: je Koch ein fester Fach-SAB (Standard 1 MiB), Berichte blockweise; der Koch
 *     wartet, bis der Hauptthread den Block abgeholt hat. Weckwort im Pool-SAB. Kein postMessage zurück (Hauptthread blockiert).
 *   - Trap in einem Klon → Fach-Art "trap" mit Meldung; der JS-Host wirft dann in `kueche_bericht` (→ K-014 in der
 *     Hauptinstanz, wie ein Trap auf dem Inline-Pfad, K-104).
 *   - Stirbt ein Koch mitten im Stück (K-104/10 h), kocht der aufrufende Thread nach einer Frist ohne Fortschritt die
 *     offenen Stücke selbst nach (bitgleich); ein toter Koch (F_AKTUELL bleibt stehen, error/exit) bekommt keine Stücke mehr.
 */
(function (root, fabrik) {
  'use strict';
  const imNode = typeof module === 'object' && module && module.exports && typeof require === 'function';
  const api = fabrik(root, imNode);
  if (imNode) module.exports = api;
  else { root.PizzaioloTeile = root.PizzaioloTeile || {}; root.PizzaioloTeile.koch = api; }
  // Rolle 2: Koch-Worker
  if (imNode) {
    let wt = null;
    try { wt = require('worker_threads'); } catch (e) { wt = null; }
    if (wt && !wt.isMainThread && wt.workerData && wt.workerData.pizzaKoch) {
      api._kochStarten(wt.workerData, (f) => wt.parentPort.on('message', f), (m) => wt.parentPort.postMessage(m));
    }
  } else if (typeof importScripts === 'function' && typeof root.postMessage === 'function' && root.name === 'pizza-koch') {
    let gestartet = false;
    root.addEventListener('message', function init(ev) {
      if (gestartet || !ev.data || ev.data.typ !== 'init') return;
      gestartet = true;
      root.removeEventListener('message', init);
      api._kochStarten(ev.data, (f) => root.addEventListener('message', (e) => f(e.data)), (m) => root.postMessage(m));
    });
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function (root, imNode) {
  'use strict';

  // ---- gemeinsame Konstanten
  const FACH_KOPF = 32;                 // Bytes Kopf je Fach (8 × i32)
  // F_AKTUELL: Stück, an dem der Koch gerade kocht (0 = keins) – bleibt bei einem mitten im Stück gestorbenen Koch stehen
  const F_ZUSTAND = 0, F_STUECK = 1, F_GESAMT = 2, F_OFFSET = 3, F_LAENGE = 4, F_ART = 5, F_BRIGADE = 6, F_AKTUELL = 7;
  const ART_BERICHT = 0, ART_TRAP = 1, ART_UEBERSPRUNGEN = 2;
  const S_NAECHSTES = 0, S_MIN_ABBRUCH = 1;   // Steuer-SAB je Brigade (i32)
  const W_WECK = 0, W_BEREIT = 1;             // Pool-SAB (i32)
  const STANDARD_FACH = 1 << 20;
  const KLON_UEBERHANG = 64 << 20;            // Klon verwerfen, wenn sein Speicher den Schnappschuss um mehr übersteigt
  const MAX_AUTO = 16;                        // F6/K-097: auto = logische Kerne, höchstens 16
  // Nachkochen (Koch gestorben, K-104/10 h): ohne Fortschritt so lange warten, bevor der aufrufende Thread ein vergebenes,
  // noch offenes Stück selbst kocht – mindestens NACHKOCH_FRIST ms, sonst NACHKOCH_FAKTOR × längstes bekanntes Stück.
  const NACHKOCH_FRIST = 1000;
  const NACHKOCH_FAKTOR = 3;
  const jetzt = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  const sabDa = () => typeof SharedArrayBuffer === 'function' && typeof Atomics === 'object' && typeof Atomics.wait === 'function';

  /** Darf dieser Thread blockieren? (Browser-Hauptthread: Atomics.wait wirft TypeError) */
  function kannWarten() {
    if (!sabDa()) return false;
    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 1, 0); return true; } catch (e) { return false; }
  }

  function kerne() {
    let n = 1;
    try {
      if (imNode) { const os = require('os'); n = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length; }
      else if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) n = navigator.hardwareConcurrency;
    } catch (e) { n = 1; }
    return Math.max(1, Math.min(MAX_AUTO, n | 0));
  }

  /** k: "auto" | Zahl → Anzahl Köche (≥ 1, höchstens 16 bei auto, sonst höchstens 64) */
  function anzahl(k) {
    if (k === undefined || k === null || k === 'auto') return kerne();
    const z = Math.floor(Number(k));
    return isFinite(z) && z >= 1 ? Math.min(z, 64) : 1;
  }

  function standardBudget() {
    if (imNode) { try { return Math.max(256 << 20, Math.floor(require('os').totalmem() / 2)); } catch (e) { /* weiter */ } }
    return 2 * 1024 * 1024 * 1024;   // Browser: 2 GiB gesamt (THREADS §4.5)
  }

  // ---- Klon-Instanzen (in Kochen und im Hauptthread identisch)

  /** K-154: Wert von `zone_ms` – optionen.zone fest (gerundet); feste Wanduhr ohne zone → 0; sonst Ortszeit − UTC (ganze Minuten). */
  function zoneMs(zone, echtzeit) {
    if (typeof zone === 'number' && isFinite(zone)) return Math.round(zone);
    if (typeof echtzeit === 'number' && isFinite(echtzeit)) return 0;
    const m = Math.round(-new Date(Date.now()).getTimezoneOffset());
    return m === 0 ? 0 : m * 60000;
  }

  /** Importe eines Klons (HOST-ABI §2 „Klon-Instanzen“): Ausgabe-/Ende-Imports → Trap, nie Lauf-Abbruch. */
  function klonImporte(modul, echtzeit, zone) {
    const pizza = {}, herd = {}, klang = {};
    const verboten = (m, n) => () => { throw new Error('Klon rief ' + m + '.' + n); };
    // Gruppen herd und klang (Module „herd“/„klang“ und pizza.herd_*/klang_*): in Klonen immer Trap – die Laufzeit ruft sie dort nie (KüchenAnanas)
    for (const im of WebAssembly.Module.imports(modul)) {
      if (im.module === 'pizza') pizza[im.name] = verboten('pizza', im.name);
      else if (im.module === 'herd') herd[im.name] = verboten('herd', im.name);
      else if (im.module === 'klang') klang[im.name] = verboten('klang', im.name);
    }
    pizza.eingabe = () => -1;
    pizza.ui_warte = (p, kap) => (kap < 0 ? 0 : -1);
    pizza.echtzeit_ms = () => (typeof echtzeit === 'number' && isFinite(echtzeit) ? Math.round(echtzeit) : Date.now());
    pizza.zone_ms = () => zoneMs(zone, echtzeit);
    pizza.kueche_auftrag = () => -1;   // innere Brigaden laufen im Klon sequentiell
    pizza.kueche_bericht = () => -2;
    return { pizza, herd, klang };
  }

  /** desc: WebAssembly.Module (.pkarton) oder { laufzeit, programm, tabellenZuwachs, speicherSeiten } (Schnellpfad). */
  function neuerKlon(desc, echtzeit, zone) {
    if (desc instanceof WebAssembly.Module) {
      const inst = new WebAssembly.Instance(desc, klonImporte(desc, echtzeit, zone));
      return { memory: inst.exports.memory, ks: inst.exports.kueche_stueck, brigade: -1 };
    }
    const lz = new WebAssembly.Instance(desc.laufzeit, klonImporte(desc.laufzeit, echtzeit, zone));
    const e = lz.exports;
    const tab = e.__indirect_function_table;
    if (desc.tabellenZuwachs) tab.grow(desc.tabellenZuwachs);
    const fehlend = desc.speicherSeiten - e.memory.buffer.byteLength / 65536;
    if (fehlend > 0) e.memory.grow(fehlend);
    const imp = { memory: e.memory, __indirect_function_table: tab };
    for (const k of Object.keys(e)) if (k.startsWith('rt_')) imp[k] = e[k];
    const p = new WebAssembly.Instance(desc.programm, { laufzeit: imp });
    return { memory: e.memory, ks: p.exports.kueche_stueck, brigade: -1 };
  }

  /** Schnappschuss in den Klon: gleiche Größe (wachsen), Kopie, Rest dahinter nullen (wie frisch gewachsener Speicher). */
  function bespiele(klon, schnapp) {
    const L = schnapp.length;
    const fehlt = Math.ceil((L - klon.memory.buffer.byteLength) / 65536);
    if (fehlt > 0) klon.memory.grow(fehlt);
    const m = new Uint8Array(klon.memory.buffer);
    m.set(schnapp);
    if (m.length > L) m.fill(0, L);
  }

  // ---- Chaos-Planung (Testoption kuechenChaos: saat)
  function zufall(saat) {
    let a = (saat >>> 0) || 0x9e3779b9;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** Reihenfolge der Stücke: Saat 0 = strikt rückwärts, sonst gemischt (Fisher-Yates). */
  function chaosReihe(n, saat) {
    const r = new Int32Array(n);
    for (let i = 0; i < n; i++) r[i] = i + 1;
    if (saat === 0) { r.reverse(); return r; }
    const z = zufall(saat);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(z() * (i + 1)); const t = r[i]; r[i] = r[j]; r[j] = t; }
    return r;
  }
  /** künstliche Verzögerung (0–2 ms, jedes zweite Stück, bei großen Brigaden insgesamt etwa 32) – je Saat, Koch und Stück */
  function chaosPause(saat, koch, i, n) {
    const z = zufall((saat * 31 + koch * 7919 + i * 104729) >>> 0);
    if (z() >= Math.min(0.5, 32 / n)) return;
    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, z() * 2); } catch (e) { /* nicht blockierbar */ }
  }

  /** atomar: x[idx] = min(x[idx], v) */
  function atomMin(x, idx, v) {
    for (;;) {
      const alt = Atomics.load(x, idx);
      if (v >= alt) return;
      if (Atomics.compareExchange(x, idx, alt, v) === alt) return;
    }
  }

  /**
   * Zieht Stücke aus der Warteschlange der Brigade b, bis sie leer ist. b: Brigade-Nachricht (steuer, schnapp, laenge,
   * reihe, n, auftrag, nr, chaos, echtzeit, zone). liefere(i, art, bytes) übergibt das Ergebnis (bytes: Bericht oder Trap-Meldung,
   * gültig nur während des Aufrufs). zustand: { klon, modulId } – Klon wird über Stücke und Brigaden wiederverwendet.
   */
  function arbeite(zustand, desc, modulId, b, kochNr, liefere, fach) {
    const st = new Int32Array(b.steuer);
    for (;;) {
      const q = Atomics.add(st, S_NAECHSTES, 1);
      if (q >= b.n) return;
      stueckAusfuehren(zustand, desc, modulId, b, kochNr, b.reihe ? b.reihe[q] : q + 1, liefere, fach);
    }
  }

  /** ein Stück i in einem (wiederverwendeten) Klon; fach (nur Koch-Worker): F_AKTUELL = i während des Kochens */
  function stueckAusfuehren(zustand, desc, modulId, b, kochNr, i, liefere, fach) {
    const st = new Int32Array(b.steuer);
    if (i > Atomics.load(st, S_MIN_ABBRUCH)) { liefere(i, ART_UEBERSPRUNGEN, null); return; }   // D3: wird nie gelesen
    if (fach) Atomics.store(fach, F_AKTUELL, i);
    if (b.chaos !== null && b.chaos !== undefined) chaosPause(b.chaos, kochNr, i, b.n);
    let art = ART_BERICHT, bytes;
    try {
      if (zustand.klon === null || zustand.modulId !== modulId) { zustand.klon = null; zustand.klon = neuerKlon(desc, b.echtzeit, b.zone); zustand.modulId = modulId; }
      const k = zustand.klon;
      if (k.brigade !== b.nr) { bespiele(k, new Uint8Array(b.schnapp, 0, b.laenge)); k.brigade = b.nr; }
      const [p, n] = k.ks(b.auftrag, i);
      bytes = new Uint8Array(k.memory.buffer, p, n);
      if (n < 4 || (bytes[0] | bytes[1] | bytes[2] | bytes[3]) !== 0) atomMin(st, S_MIN_ABBRUCH, i);
    } catch (x) {
      art = ART_TRAP;
      bytes = new TextEncoder().encode(String(x && x.message || x));
      zustand.klon = null;   // Zustand nach einem Trap unbrauchbar (u. a. __stack_pointer)
      atomMin(st, S_MIN_ABBRUCH, i);
    }
    if (fach) Atomics.store(fach, F_AKTUELL, 0);
    liefere(i, art, bytes);
    // Ein wiederverwendeter Klon wächst, wenn Stücke über das Speicherende beim Anschnitt hinaus belegen – dann neu anlegen.
    if (zustand.klon !== null && zustand.klon.memory.buffer.byteLength > b.laenge + KLON_UEBERHANG) zustand.klon = null;
  }

  // ---- Rolle 2: Koch-Worker
  function kochStarten(init, empfange, sende) {
    const fach = new Int32Array(init.fach);
    const fachBytes = new Uint8Array(init.fach);
    const kap = init.fach.byteLength - FACH_KOPF;
    const weck = new Int32Array(init.pool);
    let modul = { id: -1, desc: null };   // nur das zuletzt gesandte Modul (der Pool schickt es bei Wechsel neu)
    const zustand = { klon: null, modulId: -1 };
    const liefere = (nr) => (i, art, bytes) => {
      const gesamt = bytes ? bytes.length : 0;
      let off = 0;
      do {
        while (Atomics.load(fach, F_ZUSTAND) === 1) Atomics.wait(fach, F_ZUSTAND, 1);   // warten, bis der Hauptthread das Fach geleert hat
        const len = Math.min(kap, gesamt - off);
        if (len > 0) fachBytes.set(bytes.subarray(off, off + len), FACH_KOPF);
        fach[F_STUECK] = i; fach[F_GESAMT] = gesamt; fach[F_OFFSET] = off; fach[F_LAENGE] = len; fach[F_ART] = art; fach[F_BRIGADE] = nr;
        Atomics.store(fach, F_ZUSTAND, 1);
        Atomics.add(weck, W_WECK, 1);
        Atomics.notify(weck, W_WECK);
        off += len;
      } while (off < gesamt);
    };
    empfange((m) => {
      if (!m || typeof m !== 'object') return;
      if (m.typ === 'modul') {
        modul = { id: m.id, desc: m.modul };
      } else if (m.typ === 'brigade') {
        const st = new Int32Array(m.steuer);
        if (Atomics.load(st, S_NAECHSTES) >= m.n) return;   // zu spät: alles schon verteilt
        if (modul.id !== m.modulId) return;                 // Modul fehlt → der aufrufende Thread kocht ohne diesen Koch
        arbeite(zustand, modul.desc, m.modulId, m, init.nr, liefere(m.nr), fach);
      } else if (m.typ === 'ende') {
        if (typeof close === 'function') close(); else if (typeof process !== 'undefined') process.exit(0);
      }
    });
    Atomics.add(weck, W_BEREIT, 1);
    Atomics.notify(weck, W_BEREIT);
    sende({ typ: 'bereit', nr: init.nr });
  }

  // ---- Rolle 1: Pool im aufrufenden Thread
  let modulZaehler = 0;
  const modulIds = new WeakMap();
  const modulId = (desc) => {
    const schluessel = desc instanceof WebAssembly.Module ? desc : desc.programm;
    let id = modulIds.get(schluessel);
    if (id === undefined) { id = ++modulZaehler; modulIds.set(schluessel, id); }
    return id;
  };

  class Pool {
    constructor(k, koeche, poolSab, budget) {
      this.koeche = k;               // Köche insgesamt (Worker + aufrufender Thread)
      this._koeche = koeche;         // [{ worker, fach (Int32Array), fachBytes, modulId }]
      this._weck = new Int32Array(poolSab);
      this._budget = budget;
      this._nr = 0;
      this._eigen = { klon: null, modulId: -1 };
      this._beendet = false;
      this._frist = NACHKOCH_FRIST;
      this.nachgekocht = 0;          // Stücke, die der aufrufende Thread für einen ausgefallenen Koch gekocht hat
      this._testHaken = null;        // nur Tests: (info) => …, im Warten einer Brigade aufgerufen
    }

    /** Köche (Worker), die noch leben (kein error/exit/messageerror; Pool nicht beendet) */
    get lebend() { return this._beendet ? 0 : this._koeche.filter(k => !k.tot).length; }

    /**
     * Synchron (im blockierenden Import `kueche_auftrag`): Stücke 1 … n in Klonen von desc ausführen.
     * speicher: Uint8Array des Hauptspeichers. → { berichte: Array(n) von Uint8Array | { trap } | undefined, koeche } oder
     * null (keine Köche → Inline-Pfad).
     */
    brigade(desc, speicher, auftrag, n, opt) {
      opt = opt || {};
      if (this._beendet || n < 2) return null;
      const L = speicher.length;
      const passt = Math.floor(this._budget / Math.max(L, 65536)) - 3;   // Hauptspeicher + Schnappschuss + eigener Klon
      // Nur Köche, die leben (Ereignis error/exit/messageerror) und frei sind: steht F_AKTUELL vor einer neuen Brigade noch,
      // kocht der Koch an einem Stück einer früheren Brigade – oder er starb mitten darin (dann bleibt er draußen).
      const frei = this._koeche.filter(k => !k.tot && Atomics.load(k.fach, F_AKTUELL) === 0);
      const w = Math.max(0, Math.min(frei.length, n - 1, passt));
      if (w === 0) return null;
      const nr = ++this._nr;
      const id = modulId(desc);
      const schnappSab = new SharedArrayBuffer(L);
      const schnapp = new Uint8Array(schnappSab);
      schnapp.set(speicher);
      const steuerSab = new SharedArrayBuffer(16);
      const st = new Int32Array(steuerSab);
      st[S_MIN_ABBRUCH] = n + 1;
      const chaos = typeof opt.chaos === 'number' && isFinite(opt.chaos) ? Math.floor(opt.chaos) : null;
      const reihe = chaos !== null ? chaosReihe(n, chaos) : null;
      const auftragNachricht = { typ: 'brigade', nr, modulId: id, steuer: steuerSab, schnapp: schnappSab, laenge: L, auftrag, n,
        reihe, chaos, echtzeit: opt.echtzeit, zone: opt.zone };
      const genutzt = frei.slice(0, w);
      for (const k of genutzt) {
        if (k.modulId !== id) { k.worker.postMessage({ typ: 'modul', id, modul: desc }); k.modulId = id; }
        k.worker.postMessage(auftragNachricht);
      }
      const berichte = new Array(n);
      const teile = new Map();      // Koch → { i, puffer }
      // Je Stück erledigt? (Ein nachgekochtes Stück kann später auch noch vom langsamen Koch kommen – gleiche Bytes, es
      // zählt nicht doppelt.) Fertig ist die Brigade, wenn die Stücke 1 … min(n, kleinster Abbruch) erledigt sind (D3).
      const fertig = new Uint8Array(n + 1);
      let fertigBis = 0;            // Stücke 1 … fertigBis erledigt
      const t0 = jetzt();
      let fortschritt = t0, laengstes = 0;
      const ablegen = (i, art, bytes) => {
        if (fertig[i]) return;
        fertig[i] = 1;
        if (art === ART_BERICHT) berichte[i - 1] = bytes;
        else if (art === ART_TRAP) berichte[i - 1] = { trap: new TextDecoder().decode(bytes) };
        const t = jetzt();
        if (laengstes === 0) laengstes = t - t0;   // erstes Ergebnis: obere Schranke für die Dauer eines Stücks
        fortschritt = t;
        while (fertigBis < n && fertig[fertigBis + 1]) fertigBis++;
      };
      const allesDa = () => fertigBis >= Math.min(n, Atomics.load(st, S_MIN_ABBRUCH));
      const abholen = () => {
        for (const k of genutzt) {
          const f = k.fach;
          if (Atomics.load(f, F_ZUSTAND) !== 1) continue;
          if (f[F_BRIGADE] === nr) {
            const i = f[F_STUECK], gesamt = f[F_GESAMT], off = f[F_OFFSET], len = f[F_LAENGE], art = f[F_ART];
            let t = teile.get(k);
            if (off === 0) { t = { i, puffer: new Uint8Array(gesamt) }; teile.set(k, t); }
            if (len > 0) t.puffer.set(k.fachBytes.subarray(FACH_KOPF, FACH_KOPF + len), off);
            if (off + len >= gesamt) { teile.delete(k); ablegen(i, art, t.puffer); }
          }
          Atomics.store(f, F_ZUSTAND, 0);
          Atomics.notify(f, F_ZUSTAND);
        }
      };
      // Der aufrufende Thread kocht mit; Ergebnisse direkt (ohne Fach)
      const eigenLiefere = (i, art, bytes) => ablegen(i, art, bytes ? bytes.slice() : null);
      const eigenesStueck = (i) => {
        const ts = jetzt();
        stueckAusfuehren(this._eigen, desc, id, auftragNachricht, 0, i, eigenLiefere, null);
        laengstes = Math.max(laengstes, jetzt() - ts);
      };
      for (;;) {
        abholen();
        if (allesDa()) break;
        if (Atomics.load(st, S_NAECHSTES) < n) {
          // genau ein Stück selbst ziehen (danach wieder Fächer leeren, damit die Köche weiterarbeiten)
          const q = Atomics.add(st, S_NAECHSTES, 1);
          if (q < n) eigenesStueck(reihe ? reihe[q] : q + 1);
          continue;
        }
        const s = Atomics.load(this._weck, W_WECK);
        abholen();
        if (allesDa()) break;
        if (this._testHaken) this._testHaken({ nr, koeche: genutzt });
        // Alles vergeben, aber seit der Frist kein Fortschritt: ein Koch ist womöglich gestorben (Worker beendet, OOM …;
        // sein error/exit-Ereignis sieht der blockierte Thread nicht). Das kleinste offene Stück selbst kochen – gleiches
        // Ergebnis, weil jedes Stück aus demselben Schnappschuss beginnt (K-104/4); kommt es doch noch vom Koch, zählt
        // es nicht doppelt. Ein bloß langsamer Koch kostet so höchstens Rechenzeit, nie das Ergebnis.
        if (jetzt() - fortschritt >= Math.max(this._frist, NACHKOCH_FAKTOR * laengstes)) {
          const m = Math.min(n, Atomics.load(st, S_MIN_ABBRUCH));
          let i = fertigBis + 1;
          while (i <= m && fertig[i]) i++;
          if (i <= m) {
            this.nachgekocht++;
            eigenesStueck(i);
            fortschritt = jetzt();
            continue;
          }
        }
        Atomics.wait(this._weck, W_WECK, s, 50);
      }
      return { berichte, koeche: w + 1 };
    }

    /** Beendet alle Köche (der Pool ist danach unbrauchbar → Inline-Pfad). */
    beenden() {
      if (this._beendet) return;
      this._beendet = true;
      this._eigen.klon = null;
      for (const k of this._koeche) { try { k.worker.terminate(); } catch (e) { /* ignorieren */ } }
    }
  }

  // ---- Pool anlegen
  /** Basis-URL für koch.js im Browser: neben diesem Skript bzw. js/pizzaiolo/ relativ zum Worker (wie importScripts). */
  const eigeneUrl = (() => {
    try {
      if (!imNode && typeof document !== 'undefined' && document.currentScript && document.currentScript.src) return document.currentScript.src;
    } catch (e) { /* weiter */ }
    return null;
  })();
  function kochUrl(opt) {
    if (opt && opt.url) return opt.url;
    if (eigeneUrl) return new URL('koch.js', eigeneUrl).href;
    return new URL('pizzaiolo/koch.js', root.location.href).href;
  }

  function moeglich() {
    if (!sabDa() || !kannWarten()) return false;
    if (imNode) { try { require('worker_threads'); return true; } catch (e) { return false; } }
    return typeof Worker === 'function';
  }

  /** legt k − 1 Koch-Worker an; → { pool, bereit: Promise<boolean> } */
  function anlegen(k, opt) {
    opt = opt || {};
    const fachGroesse = Math.max(4096, (opt.fachBytes | 0) || STANDARD_FACH) + FACH_KOPF;
    const poolSab = new SharedArrayBuffer(16);
    const koeche = [];
    const versprechen = [];
    for (let nr = 1; nr < k; nr++) {
      const fach = new SharedArrayBuffer(fachGroesse);
      const init = { typ: 'init', pizzaKoch: true, fach, pool: poolSab, nr };
      const eintrag = { worker: null, fach: new Int32Array(fach), fachBytes: new Uint8Array(fach), modulId: -1, tot: false };
      let worker;
      if (imNode) {
        const { Worker } = require('worker_threads');
        worker = new Worker(__filename, { workerData: init });
        const w = worker;
        // Koch abgestürzt/beendet → fliegt aus dem Pool. Wirkt ab der nächsten Brigade: während einer Brigade blockiert der
        // aufrufende Thread (keine Ereignisse) und kocht die Stücke eines toten Kochs nach Frist selbst nach (Pool.brigade).
        const tot = () => { eintrag.tot = true; };
        w.on('error', tot);
        w.on('exit', tot);
        w.on('messageerror', tot);
        if (opt.asynchron) {
          versprechen.push(new Promise((ok) => {
            const fertig = (x) => { w.off('message', bereit); w.off('exit', weg); w.unref(); ok(x); };
            const bereit = (m) => { if (m && m.typ === 'bereit') fertig(true); };
            const weg = () => fertig(false);
            w.on('message', bereit);
            w.on('exit', weg);
          }));
        } else w.unref();
      } else {
        worker = new Worker(kochUrl(opt), { name: 'pizza-koch' });
        const tot = (e) => { if (e && e.preventDefault) e.preventDefault(); eintrag.tot = true; };
        worker.addEventListener('error', tot);
        worker.addEventListener('messageerror', tot);
        versprechen.push(new Promise((ok) => {
          worker.addEventListener('message', (e) => { if (e.data && e.data.typ === 'bereit') ok(true); });
          worker.addEventListener('error', (e) => { if (e && e.preventDefault) e.preventDefault(); ok(false); });
        }));
        worker.postMessage(init);
      }
      eintrag.worker = worker;
      koeche.push(eintrag);
    }
    const budget = typeof opt.budget === 'number' && opt.budget > 0 ? opt.budget : standardBudget();
    const pool = new Pool(k, koeche, poolSab, budget);
    if (typeof opt.nachkochFrist === 'number' && opt.nachkochFrist >= 0) pool._frist = opt.nachkochFrist;
    return { pool, bereit: Promise.all(versprechen).then(l => l.every(Boolean)) };
  }

  /**
   * Pizzaiolo.kuechenPool(k = "auto", { url?, budget?, fachBytes? }) → Promise<Pool | null>.
   * null, wenn keine Köche möglich sind (k ≤ 1, kein SharedArrayBuffer/Atomics bzw. keine Cross-Origin-Isolation,
   * Browser-Hauptthread, kein Worker) – dann einfach ohne Pool laufen (Inline-Pfad, gleiches Ergebnis).
   * Der Pool muss VOR dem Lauf existieren (ein blockierter Thread kann keine Worker starten, THREADS §4.6).
   */
  function kuechenPool(k, opt) {
    const n = anzahl(k);
    if (n <= 1 || !moeglich()) return Promise.resolve(null);
    let a;
    try { a = anlegen(n, Object.assign({}, opt, { asynchron: true })); } catch (e) { return Promise.resolve(null); }
    // Ein Koch, der nie „bereit“ meldet (Ladefehler, CSP …), darf den Lauf nicht verhindern: nach 10 s ohne Pool weiter
    let uhr = null;
    const frist = new Promise((ok) => { uhr = setTimeout(() => ok(false), (opt && opt.frist) || 10000); });
    return Promise.race([a.bereit, frist]).then((ok) => {
      clearTimeout(uhr);
      if (ok) return a.pool;
      a.pool.beenden();
      return null;
    });
  }

  /** nur Node (Harnische/Bench): wie kuechenPool, aber synchron – Node-Worker starten auch, während dieser Thread wartet. */
  function kuechenPoolSync(k, opt) {
    const n = anzahl(k);
    if (!imNode || n <= 1 || !moeglich()) return null;
    const a = anlegen(n, opt);
    const w = a.pool._weck;
    const bis = Date.now() + 20000;
    while (Atomics.load(w, W_BEREIT) < n - 1) {
      const rest = bis - Date.now();
      if (rest <= 0) { a.pool.beenden(); return null; }
      Atomics.wait(w, W_BEREIT, Atomics.load(w, W_BEREIT), rest);
    }
    return a.pool;
  }

  return { kuechenPool, kuechenPoolSync, moeglich, anzahl, chaosReihe, Pool, _kochStarten: kochStarten };
});
