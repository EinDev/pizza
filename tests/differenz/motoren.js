'use strict';
/*
 * Motoren für Differenztests: Interpreter (Referenz), Wasm-in-Node (pizzaiolo), nativer Host (host/).
 * Jeder Motor liefert für (quelltext, optionen) ein normalisiertes Ergebnis
 *   { status: "ok", exitCode, ereignisse, schritte, zeitMs, ms }
 *   { status: "fallback", grund }            – Compiler meldet nichtUnterstuetzt (Wasm/Host)
 *   { status: "wurf", fehler }               – Motor hat eine JS-Exception/Absturz produziert
 *   { status: "übersprungen", grund }        – Motor kann diesen Fall nicht ausführen
 * Motoren, die (noch) nicht existieren, sind nicht "verfuegbar" und werden übersprungen.
 *
 * Küchenbrigade (THREADS §5 Punkt 3/4, K-104/14): nur für Programme mit `brigade` laufen zusätzlich
 *   interpreter-chaos (Permutation, koeche: 4) · wasm-koeche4 · wasm-chaos (Saat 7) · wasm-rueck (Saat 0) ·
 *   host-koeche4 (--koeche=4) · host-chaos (--koeche=4 --kuechen-chaos=N); N je Programm aus dem Quelltext.
 *   Alle müssen dieselben normalisierten Ereignisse, Exit-Codes, schritte und zeitMs liefern; `koeche` wird ignoriert.
 *
 * Umgebung:
 *   PIZZA_HOST=<pfad>        nativer Host (sonst host/target/{release,debug}/pizza-host[.exe])
 *   PIZZA_MOTOREN=a,b        nur diese Motoren (z. B. "interpreter,wasm")
 *   PIZZA_KUECHEN_CHAOS=N    feste Chaos-Saat für interpreter-chaos/host-chaos
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
// Nie ein sichtbarer Dialog aus Testläufen (K-096-Meldungsfenster, Windows-Fehlerdialoge, Theke-Fenster): alle
// gestarteten Hosts/EXEs erben PIZZA_KEIN_DIALOG=1 (host/src/konsole.rs).
process.env.PIZZA_KEIN_DIALOG = '1';

const ROOT = path.join(__dirname, '..', '..');
const PizzaLang = require(path.join(ROOT, 'site', 'js', 'pizza.js'));

function normalisiere(ereignisse) {
  const aus = [];
  for (const e of ereignisse || []) {
    if (!e || e.typ === 'motor') continue;
    const k = {};
    // K-014: motorspezifisches 'detail' ignorieren; K-046: umbruch:true ≙ fehlendem umbruch.
    for (const s of Object.keys(e)) {
      if (s === 'motor' || s === 'kompilierMs' || s === 'detail') continue;
      if (s === 'koeche') continue;   // K-100: Anzahl der Köche ist Host-Metadatum (ende, motor …), nie beobachtbar
      if (s === 'umbruch' && e[s] === true) continue;
      k[s] = e[s];
    }
    // K-080: vorrat-Ereignisse kanonisch (JSON-Werte, -0 → 0, Feldreihenfolge fest)
    if (k.typ === 'vorrat') {
      aus.push({ typ: 'vorrat', name: k.name, schluessel: k.schluessel === undefined ? null : k.schluessel, wert: kanonisch(k.wert) });
      continue;
    }
    aus.push(k);
  }
  return aus;
}

function kanonisch(w) {
  if (w === undefined) return null;
  return JSON.parse(JSON.stringify(w, (_, v) => (typeof v === 'number' && Object.is(v, -0) ? 0 : v)));
}

function ergebnisAus(r, ms) {
  if (!r || typeof r !== 'object') return { status: 'wurf', fehler: 'Rückgabe ist kein Objekt: ' + String(r) };
  return {
    status: 'ok',
    exitCode: r.exitCode,
    ereignisse: normalisiere(r.ereignisse),
    schritte: r.schritte,
    zeitMs: r.zeitMs,
    ms,
  };
}

function laufOptionen(opt) {
  const o = {};
  if (opt && opt.schrittLimit != null) o.schrittLimit = opt.schrittLimit;
  if (opt && opt.args) o.args = opt.args.slice();
  if (opt && opt.eingabe) o.eingabe = opt.eingabe.slice();
  if (opt && opt.uiEreignisse) o.uiEreignisse = JSON.parse(JSON.stringify(opt.uiEreignisse));
  if (opt && opt.zufallsSaat !== undefined) o.zufallsSaat = opt.zufallsSaat;
  if (opt && opt.vorrat) o.vorrat = JSON.parse(JSON.stringify(opt.vorrat));
  if (opt && opt.echtzeit !== undefined) o.echtzeit = opt.echtzeit;
  return o;
}

/**
 * Lauf-Optionen, die ein Motor erst können muss (U-43). Fehlt die Unterstützung, zählt der Fall als Fallback.
 *   zufallsSaat (K-077) · vorrat (K-080/081) · echtzeit (K-087)
 */
function benoetigteOptionen(opt) {
  const f = [];
  if (opt && opt.zufallsSaat !== undefined) f.push('zufallsSaat');
  if (opt && opt.vorrat) f.push('vorrat');
  if (opt && opt.echtzeit !== undefined) f.push('echtzeit');
  return f;
}

/** Unterstützt der Interpreter schon interaktive Eingabe (EINGABE.md)? */
let _eingabe = null;
function eingabeUnterstuetzt() {
  if (_eingabe === null) {
    try { _eingabe = PizzaLang.run('Bestellannahme.hatMehr(); Bote.schreibe(("")); Bote.leeren();', { eingabe: [] }).exitCode === 0; }
    catch (_) { _eingabe = false; }
  }
  return _eingabe;
}

const jetzt = () => Number(process.hrtime.bigint()) / 1e6;

// ---------------------------------------------------------------- Interpreter
const interpreter = {
  name: 'interpreter',
  verfuegbar: true,
  grund: null,
  lauf(q, opt) {
    const t0 = jetzt();
    let r;
    try { r = PizzaLang.run(q, laufOptionen(opt)); }
    catch (e) { return { status: 'wurf', fehler: String(e && e.stack || e) }; }
    return ergebnisAus(r, jetzt() - t0);
  },
};

// ---------------------------------------------------------------- Chaos-Planung (THREADS §5 Punkt 4)
const BRIGADE_RE = /\.\s*brigade\b/;
/** Chaos-Saat je Programm (stabil, je Fall verschieden – so sieht der Fuzzer viele Planungen). PIZZA_KUECHEN_CHAOS=N: fest. */
function chaosSaat(q) {
  if (process.env.PIZZA_KUECHEN_CHAOS) return Number(process.env.PIZZA_KUECHEN_CHAOS) >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < q.length; i++) { h ^= q.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return 1 + ((h >>> 0) % 99991);
}

// Interpreter mit Chaos-Planung (Permutation der Stücke) und `koeche: 4` (akzeptiert, ignoriert – K-100) – nur mit brigade.
const interpreterChaos = {
  name: 'interpreter-chaos',
  verfuegbar: true,
  grund: null,
  lauf(q, opt) {
    if (!BRIGADE_RE.test(q)) return { status: 'übersprungen', grund: 'ohne brigade' };
    const t0 = jetzt();
    let r;
    try { r = PizzaLang.run(q, Object.assign(laufOptionen(opt), { koeche: 4, kuechenChaos: chaosSaat(q) })); }
    catch (e) { return { status: 'wurf', fehler: String(e && e.stack || e) }; }
    return ergebnisAus(r, jetzt() - t0);
  },
};

// ---------------------------------------------------------------- Wasm (pizzaiolo)
function ladePizzaiolo() {
  const p = path.join(ROOT, 'site', 'js', 'pizzaiolo.js');
  if (!fs.existsSync(p)) return { fehlt: 'site/js/pizzaiolo.js fehlt' };
  try {
    // pizzaiolo.js benötigt PizzaLang – in Node zusätzlich global bereitstellen.
    if (!globalThis.PizzaLang) globalThis.PizzaLang = PizzaLang;
    const P = require(p);
    const Z = P && typeof P.run === 'function' ? P : (P && P.Pizzaiolo) || globalThis.Pizzaiolo;
    if (!Z || typeof Z.run !== 'function') return { fehlt: 'pizzaiolo.js exportiert keine run()-Funktion' };
    if (typeof Z.unterstuetzt === 'function' && !Z.unterstuetzt()) return { fehlt: 'Pizzaiolo.unterstuetzt() = nein' };
    return { Z };
  } catch (e) {
    return { fehlt: 'pizzaiolo.js lädt nicht: ' + (e && e.message) };
  }
}

const pz = ladePizzaiolo();

/**
 * Fähigkeiten des Wasm-Motors (WASM.md §4): Pizzaiolo.faehigkeiten =
 *   { version, abi, laufOptionen: [...], importgruppen: [...], features: [...], ereignisse: [...], motoren: [...] }
 * → null, wenn pizzaiolo (noch) keine maschinenlesbare Auskunft hat.
 */
let _wasmFaehigkeiten;
function wasmFaehigkeiten() {
  if (_wasmFaehigkeiten !== undefined) return _wasmFaehigkeiten;
  _wasmFaehigkeiten = null;
  const Z = pz.Z;
  if (!Z) return null;
  let f = Z.faehigkeiten;
  try { if (typeof f === 'function') f = f(); } catch (_) { f = null; }
  if (Array.isArray(f)) _wasmFaehigkeiten = { laufOptionen: f.slice() };
  else if (f && typeof f === 'object') _wasmFaehigkeiten = f;
  return _wasmFaehigkeiten;
}

/**
 * Kann der Wasm-Motor eine Lauf-Option (U-43)? Maßgeblich ist Pizzaiolo.faehigkeiten.laufOptionen;
 * nur ohne diese Auskunft (ältere pizzaiolo-Stände) Rückfall auf Quelltextsuche.
 */
let _wasmQuelle = null;
function wasmKann(option) {
  const Z = pz.Z;
  if (!Z) return false;
  const f = wasmFaehigkeiten();
  if (f) {
    if (Array.isArray(f.laufOptionen)) return f.laufOptionen.includes(option);
    if (option in f) return !!f[option];   // ältere Objektform { option: true }
  }
  if (_wasmQuelle === null) {
    _wasmQuelle = '';
    const dateien = [path.join(ROOT, 'site', 'js', 'pizzaiolo.js')];
    const dir = path.join(ROOT, 'site', 'js', 'pizzaiolo');
    if (fs.existsSync(dir)) for (const d of fs.readdirSync(dir)) if (d.endsWith('.js')) dateien.push(path.join(dir, d));
    for (const d of dateien) { try { _wasmQuelle += fs.readFileSync(d, 'utf8'); } catch (_) {} }
  }
  return _wasmQuelle.includes(option);
}

function kompiliere(q) {
  if (!pz.Z || typeof pz.Z.kompiliere !== 'function') return null;
  try { return pz.Z.kompiliere(q); }
  catch (e) { return { wurf: String(e && e.stack || e) }; }
}

function fallbackGrund(k) {
  const liste = k.nichtUnterstuetzt || [];
  return liste.map(n => (n.zeile != null ? 'Z' + n.zeile + ': ' : '') + (n.grund || '?')).join('; ') || 'nichtUnterstuetzt';
}

function kompilat(q, cache) {
  if (cache && 'kompilat' in cache) return cache.kompilat;
  const k = kompiliere(q);
  if (cache) cache.kompilat = k;
  return k;
}

const wasm = {
  name: 'wasm',
  verfuegbar: !!pz.Z,
  grund: pz.fehlt || null,
  lauf(q, opt, cache, extra) {
    const k = kompilat(q, cache);
    if (k && k.wurf) return { status: 'wurf', fehler: 'kompiliere() hat geworfen: ' + k.wurf };
    if (k && k.ok === false && k.nichtUnterstuetzt) return { status: 'fallback', grund: fallbackGrund(k) };
    const noetig = benoetigteOptionen(opt);
    if (/Vorratskammer/.test(q) && !noetig.includes('vorrat')) noetig.push('vorrat');   // K-081: Backend nötig (sonst W0101-Verhalten)
    const fehlt = noetig.filter(o => !wasmKann(o));
    if (fehlt.length) return { status: 'fallback', grund: 'Lauf-Option ' + fehlt.join(', ') + ' noch nicht unterstützt' };
    const t0 = jetzt();
    let r;
    try { r = pz.Z.run(q, Object.assign(laufOptionen(opt), { motor: 'wasm' }, extra || {})); }
    catch (e) { return { status: 'wurf', fehler: 'run() hat geworfen: ' + String(e && e.stack || e) }; }
    const ms = jetzt() - t0;
    // Syntaxfehler laufen nie in Wasm; sonst muss wirklich Wasm gelaufen sein (kein stiller Fallback).
    const syntax = k && k.ok === false && k.fehler;
    if (!syntax && r && r.motor && r.motor !== 'wasm') return { status: 'fallback', grund: 'run() lief mit motor="' + r.motor + '" (stiller Fallback)' };
    return ergebnisAus(r, ms);
  },
};

// ---------------------------------------------------------------- Wasm mit Köchen (THREADS §5 Punkt 3/4, P3)
// Nur Programme mit `brigade`; ein Pool mit 4 Köchen (3 Worker + Hauptthread) für alle Fälle, synchron angelegt (Node).
let _pool;
function koechePool() {
  if (_pool === undefined) {
    _pool = null;
    try {
      const koch = pz.Z && pz.Z._teile && pz.Z._teile.koch;
      if (koch && typeof koch.kuechenPoolSync === 'function') _pool = koch.kuechenPoolSync(4);
    } catch (_) { _pool = null; }
  }
  return _pool;
}
function koecheVariante(name, extra) {
  return {
    name,
    verfuegbar: !!(pz.Z && pz.Z._teile && pz.Z._teile.koch && pz.Z._teile.koch.moeglich()),
    grund: pz.fehlt || 'keine Köche möglich (SharedArrayBuffer/worker_threads fehlen)',
    lauf(q, opt, cache) {
      if (!BRIGADE_RE.test(q)) return { status: 'übersprungen', grund: 'ohne brigade' };
      const pool = koechePool();
      if (!pool) return { status: 'übersprungen', grund: 'Köche-Pool nicht anlegbar' };
      return wasm.lauf(q, opt, cache, Object.assign({ koeche: pool }, extra));
    },
  };
}
const wasmKoeche4 = koecheVariante('wasm-koeche4', {});
const wasmChaos = koecheVariante('wasm-chaos', { kuechenChaos: 7 });
const wasmRueck = koecheVariante('wasm-rueck', { kuechenChaos: 0 });

// ---------------------------------------------------------------- Nativer Host
function findeHost() {
  const kandidaten = [];
  if (process.env.PIZZA_HOST) kandidaten.push(process.env.PIZZA_HOST);
  const exe = process.platform === 'win32' ? '.exe' : '';
  for (const art of ['release', 'debug']) kandidaten.push(path.join(ROOT, 'host', 'target', art, 'pizza-host' + exe));
  kandidaten.push(path.join(ROOT, 'host', 'pizza-host' + exe));
  for (const k of kandidaten) if (k && fs.existsSync(k)) return k;
  return null;
}

const hostPfad = findeHost();

/** Optionen des Hosts laut --hilfe (einmal gelesen). */
let _hostHilfe = null;
function hostHilfe() {
  if (_hostHilfe === null) {
    try { const p = cp.spawnSync(hostPfad, ['--hilfe'], { windowsHide: true, encoding: 'utf8', timeout: 10000 }); _hostHilfe = String(p.stdout || '') + String(p.stderr || ''); }
    catch (_) { _hostHilfe = ''; }
  }
  return _hostHilfe;
}
const HOST_FLAG = { zufallsSaat: '--saat', vorrat: '--vorrat', echtzeit: '--echtzeit' };
function hostKann(option) { return hostHilfe().includes(HOST_FLAG[option]); }

/** Vorrat-Eingangszustand { kennung: eintraege | {v,name,eintraege} } → Dateien <name>.json bzw. <raum>/<name>.json (K-080/K-106). */
function schreibeVorrat(ordner, vorrat) {
  fs.mkdirSync(ordner, { recursive: true });
  for (const [name, wert] of Object.entries(vorrat || {})) {
    const eintraege = Array.isArray(wert) ? wert : (wert && wert.eintraege) || [];
    const datei = path.join(ordner, name + '.json');
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    fs.writeFileSync(datei, JSON.stringify({ v: 1, name, eintraege }));
  }
}
let tmpDir = null;
let tmpZaehler = 0;

function parseHostAusgabe(stdout) {
  const t = String(stdout || '').trim();
  if (!t) return [];
  try {
    const j = JSON.parse(t);
    if (Array.isArray(j)) return j;
    if (j && Array.isArray(j.ereignisse)) return j.ereignisse;
    return [j];
  } catch (_) { /* JSON-Zeilen */ }
  return t.split(/\r?\n/).filter(z => z.trim()).map(z => JSON.parse(z));
}

const host = {
  name: 'host',
  verfuegbar: !!(hostPfad && pz.Z && typeof pz.Z.kompiliere === 'function'),
  grund: !hostPfad ? 'host/target/*/pizza-host nicht gebaut (oder PIZZA_HOST setzen)' : (!pz.Z ? 'braucht pizzaiolo.js zum Kompilieren' : null),
  // THREADS §5 Punkt 3: `host` = ohne Köche (`--koeche=1`, Inline-Pfad), Variante `host-koeche4` unten.
  lauf(q, opt, cache, koeche = ['--koeche=1']) {
    const k = kompilat(q, cache);
    if (k && k.wurf) return { status: 'wurf', fehler: 'kompiliere() hat geworfen: ' + k.wurf };
    if (k && k.ok === false && k.nichtUnterstuetzt) return { status: 'fallback', grund: fallbackGrund(k) };
    if (!k || !k.ok) return { status: 'übersprungen', grund: 'Syntaxfehler – kein .pkarton' };
    const fehlt = benoetigteOptionen(opt).filter(o => !hostKann(o));
    if (fehlt.length) return { status: 'fallback', grund: 'Host-Option für ' + fehlt.join(', ') + ' fehlt' };
    // Ohne optionen.vorrat warnt der Interpreter W0101; der Host hätte sonst echte Dateien im Nutzerverzeichnis.
    const nutztVorrat = /Vorratskammer/.test(q);
    if (nutztVorrat && !(opt && opt.vorrat) && !hostHilfe().includes('--kein-vorrat')) {
      return { status: 'fallback', grund: 'Host ohne --kein-vorrat: Vorratskammer ohne optionen.vorrat nicht vergleichbar' };
    }
    if (!tmpDir) tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pizza-diff-'));
    const datei = path.join(tmpDir, 'p' + (tmpZaehler++) + '.pkarton');
    fs.writeFileSync(datei, k.pkarton);
    // CLI laut host/src/main.rs: pizza-host [--ereignisse-json] [--schritte=N] programm.pkarton [args…]
    const argv = ['--ereignisse-json'];
    if (hostHilfe().includes('--koeche')) argv.push(...koeche);
    if (opt && opt.schrittLimit != null) argv.push('--schritte=' + opt.schrittLimit);
    // Theke (THEKE.md §5): vorgegebene Renderer-Ereignisse als JSON-Lines-Datei → --ui-ereignisse.
    let uiDatei = null;
    if (opt && Array.isArray(opt.uiEreignisse)) {
      uiDatei = path.join(tmpDir, 'p' + (tmpZaehler++) + '.ereignisse');
      fs.writeFileSync(uiDatei, opt.uiEreignisse.map(e => JSON.stringify(e) + '\n').join(''));
      argv.push('--ui-ereignisse', uiDatei);
    }
    let vorratOrdner = null;
    // K-077: keine Ganzzahl → wie fehlende Saat (42); --saat lehnt das (wie bin/pizza.js) ab, der JSON-Modus nutzt ohne --saat 42.
    if (opt && Number.isInteger(opt.zufallsSaat)) argv.push('--saat=' + opt.zufallsSaat);
    if (opt && opt.echtzeit !== undefined) argv.push('--echtzeit=' + opt.echtzeit);
    if (opt && opt.vorrat) {
      vorratOrdner = path.join(tmpDir, 'vorrat' + (tmpZaehler++));
      schreibeVorrat(vorratOrdner, opt.vorrat);
      argv.push('--vorrat=' + vorratOrdner);
    } else if (nutztVorrat) argv.push('--kein-vorrat');
    argv.push(datei);
    if (opt && opt.args && opt.args.length) argv.push(...opt.args);
    const t0 = jetzt();
    // Eingabe (EINGABE.md §4): pizza-host liest Zeilen von stdin, EOF → -1.
    // K-042: ein null-Eintrag bedeutet EOF ab dieser Stelle → stdin dort beenden.
    let zeilenIn = opt && opt.eingabe ? opt.eingabe : [];
    const nullAb = zeilenIn.indexOf(null);
    if (nullAb >= 0) zeilenIn = zeilenIn.slice(0, nullAb);
    const stdin = zeilenIn.map(z => z + '\n').join('');
    const p = cp.spawnSync(hostPfad, argv, { windowsHide: true, encoding: 'utf8', input: stdin, timeout: 60000, maxBuffer: 256 * 1024 * 1024 });
    const ms = jetzt() - t0;
    try { fs.unlinkSync(datei); if (uiDatei) fs.unlinkSync(uiDatei); if (vorratOrdner) fs.rmSync(vorratOrdner, { recursive: true, force: true }); } catch (_) {}
    if (p.error) return { status: 'wurf', fehler: 'Host-Start: ' + p.error.message };
    let ev;
    try { ev = parseHostAusgabe(p.stdout); }
    catch (e) { return { status: 'wurf', fehler: 'Host-Ausgabe ist kein JSON: ' + e.message + '\n' + String(p.stdout).slice(0, 500) + '\n' + String(p.stderr).slice(0, 500) }; }
    const ende = ev.filter(e => e && e.typ === 'ende').pop();
    if (!ende) return { status: 'wurf', fehler: 'Host lieferte kein "ende"-Ereignis (Prozess-Exit ' + p.status + ')\n' + String(p.stderr).slice(0, 500) };
    const res = ergebnisAus({ exitCode: ende.exitCode, ereignisse: ev, schritte: ende.schritte, zeitMs: ende.zeitMs }, ms);
    res.prozessExit = p.status;
    return res;
  },
};

// Nativer Host mit 4 Köchen (P4, `--koeche=4`) und mit Chaos-Planung (`--kuechen-chaos=N`) – nur Programme mit brigade.
const hostKoeche4 = {
  name: 'host-koeche4',
  verfuegbar: host.verfuegbar && hostHilfe().includes('--koeche'),
  grund: host.grund || 'Host ohne --koeche',
  lauf(q, opt, cache) {
    if (!BRIGADE_RE.test(q)) return { status: 'übersprungen', grund: 'ohne brigade' };
    return host.lauf(q, opt, cache, ['--koeche=4']);
  },
};
const hostChaos = {
  name: 'host-chaos',
  verfuegbar: host.verfuegbar && hostHilfe().includes('--kuechen-chaos'),
  grund: host.grund || 'Host ohne --kuechen-chaos',
  lauf(q, opt, cache) {
    if (!BRIGADE_RE.test(q)) return { status: 'übersprungen', grund: 'ohne brigade' };
    return host.lauf(q, opt, cache, ['--koeche=4', '--kuechen-chaos=' + chaosSaat(q)]);
  },
};

function aufraeumen() {
  if (_pool) { try { _pool.beenden(); } catch (_) {} _pool = null; }
  if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }
}

let ALLE = [interpreter, interpreterChaos, wasm, wasmKoeche4, wasmChaos, wasmRueck, host, hostKoeche4, hostChaos];
if (process.env.PIZZA_MOTOREN) {
  const nur = process.env.PIZZA_MOTOREN.split(',').map(s => s.trim());
  for (const m of ALLE) if (m !== interpreter && !nur.includes(m.name)) { m.verfuegbar = false; m.grund = 'per PIZZA_MOTOREN abgewählt'; }
}

const SPEICHER_RE = /Der Kühlschrank ist voll/;

/**
 * Vergleicht Referenz r0 (Interpreter) mit Ergebnis r (beide status "ok").
 * → null (gleich) | { art, details: string[] }
 *   art: "speicherlimit" (dokumentierte Grenze: ein Motor meldet Kühlschrank voll, Grenzen je Motor verschieden)
 *        | "ereignisse" | "exitCode" | "schritte"
 */
function vergleiche(r0, r) {
  const d = [];
  if (r.exitCode !== r0.exitCode) d.push('exitCode: ' + r0.exitCode + ' ≠ ' + r.exitCode);
  if (r.schritte !== r0.schritte) d.push('schritte: ' + r0.schritte + ' ≠ ' + r.schritte);
  if (r.zeitMs !== r0.zeitMs) d.push('zeitMs: ' + r0.zeitMs + ' ≠ ' + r.zeitMs);
  if (r.prozessExit != null && r.prozessExit !== r.exitCode) d.push('Prozess-Exit-Code ' + r.prozessExit + ' ≠ exitCode ' + r.exitCode);
  const a = r0.ereignisse, b = r.ereignisse;
  let erste = -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) { erste = i; break; }
  }
  if (erste >= 0) {
    d.push('Ereignis #' + erste + ' (Anzahl ' + a.length + ' / ' + b.length + '):  (- interpreter, + motor)');
    for (let i = Math.max(0, erste - 2); i < Math.min(Math.max(a.length, b.length), erste + 3); i++) {
      const x = JSON.stringify(a[i]), y = JSON.stringify(b[i]);
      if (x === y) d.push('    ' + x);
      else { d.push('  - ' + (x === undefined ? '(fehlt)' : x)); d.push('  + ' + (y === undefined ? '(fehlt)' : y)); }
    }
  }
  if (!d.length) return null;
  // Speichergrenzen sind je Motor verschieden (Wasm: 1024 MiB UTF-8-Heap, Interpreter: Grenze der JS-Engine, z. B. V8 ~2^29
  // UTF-16-Einheiten je Text) – meldet irgendein Motor „Kühlschrank voll“ (auch per verbrannt gefangen), ist die Abweichung dokumentiert.
  const voll = e => (e.typ === 'fehler' || e.typ === 'ausgabe') && SPEICHER_RE.test(e.text || '');
  const speicher = b.some(voll) || a.some(voll);
  let art;
  if (speicher) art = 'speicherlimit';
  else if (erste >= 0) art = 'ereignisse';
  else if (r.exitCode !== r0.exitCode) art = 'exitCode';
  else art = 'schritte';
  return { art, details: d, ersteAbweichung: erste };
}

/** Prüft ein einzelnes Ergebnis auf API-Invarianten (Ereignis-API, ende am Schluss, Exit-Codes). */
function invarianten(r) {
  const p = [];
  if (r.status !== 'ok') return p;
  if (![0, 1, 2, 3, 39].includes(r.exitCode)) p.push('unerwarteter Exit-Code ' + r.exitCode);
  const ev = r.ereignisse;
  const ende = ev[ev.length - 1];
  if (!ende || ende.typ !== 'ende') p.push('letztes Ereignis ist nicht "ende"');
  else {
    if (ende.exitCode !== r.exitCode) p.push('ende.exitCode ' + ende.exitCode + ' ≠ exitCode ' + r.exitCode);
    if (ende.schritte !== r.schritte || ende.zeitMs !== r.zeitMs) p.push('ende.schritte/zeitMs passen nicht zur Rückgabe');
  }
  if (ev.filter(e => e.typ === 'ende').length !== 1) p.push('nicht genau ein "ende"-Ereignis');
  for (const e of ev) if (e.typ === 'fehler' && /Interne?r? Fehler|Interner|TypeError|ReferenceError|undefined/.test(e.text || '')) p.push('verdächtiger Fehlertext: ' + e.text);
  if (r.exitCode === 39 && !ev.some(e => e.typ === 'panik')) p.push('Exit 39 ohne panik-Ereignis');
  return p;
}

module.exports = { benoetigteOptionen, wasmKann, wasmFaehigkeiten, eingabeUnterstuetzt, ALLE, interpreter, interpreterChaos, wasm, wasmKoeche4, wasmChaos, wasmRueck, host, hostKoeche4, hostChaos, chaosSaat, vergleiche, invarianten, normalisiere, aufraeumen, PizzaLang, ROOT };
