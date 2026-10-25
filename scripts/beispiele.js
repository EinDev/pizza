#!/usr/bin/env node
/*
 * Beispiele als Projektordner (PROJEKTE.md §7, K-144, ARCHITEKTUR §3/§6) – Werkzeug und gemeinsamer Leser aller Harnische.
 *
 *   node scripts/beispiele.js --pruefe      Manifeste und Platte vergleichen (Teil von `npm test`); Exit 1 bei Abweichung
 *   node scripts/beispiele.js --schreibe    abgeleitete Manifestfelder neu schreiben: dateien, titel/beschreibung (aus pizza.json),
 *                                           exitCode (Anzeige-Kopie von pruefung/exitcode)
 *   node scripts/beispiele.js --umziehen    Einträge im alten Format (datei + Begleitdateien) in Ordner umziehen – idempotent:
 *                                           Einträge mit `ordner` bleiben, wie sie sind (seit PB5 kennen Galerie, Harnische
 *                                           und --pruefe nur noch `ordner`; ein alter Eintrag ist ein Fehler)
 *
 * Zielstruktur: site/beispiele/<kategorie>/<projekt>/{pizza.json, hauptgang.pizza, …, pruefung/{erwartet, eingabe, ereignisse,
 * ui-erwartet, herd-erwartet, klang-erwartet, vorrat.json, exitcode}}; Manifest-Eintrag mit `ordner` + `dateien` (ohne pruefung/).
 *
 * Als Modul (CommonJS; aus ESM per Default-Import):
 *   const B = require('scripts/beispiele.js');
 *   B.leseBeispiele() → [Beispiel]  (Einträge mit `ordner`)
 *   Beispiel: { teil, kategorie, eintrag, id, titel, name, format, ordner, ordnerPfad, dateien, hauptdatei, hauptdateiPfad,
 *               hauptdateiUrl, quelle, projekt, programm, exitCode, optionen, pruefPfad(art), pruefText(art), erwartet, eingabe,
 *               ereignisse, uiErwartet, herdErwartet, klangErwartet, vorrat, laufOptionen() }
 *   B.pruefe() → [Fehlertext]   B.leseOrdner(abs) → { pfad → Text | Uint8Array }   B.findeProjekt(datei) → Wurzel | null
 */
'use strict';
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const BSP = path.join(WURZEL, 'site', 'beispiele');
const PROJEKTDATEI = 'pizza.json';
const HAUPTDATEI = 'hauptgang.pizza';
const PRUEFUNG = 'pruefung';
const TEXT_ENDUNG = /\.(pizza|txt|json|csv|md)$/;
const ERLAUBTE_ENDUNG = /\.(pizza|txt|json|csv|md|png|jpg|jpeg)$/;   // PROJEKTE §1.3
const EXITCODES = [0, 1, 2, 3, 39];

/**
 * Testdateien: Name in pruefung/ ↔ Manifestfeld und Endung im alten Format (ARCHITEKTUR §6). `feld` = altes Manifestfeld
 * (null = nur gleichnamige Datei neben der .pizza).
 */
const PRUEF_ARTEN = [
  { art: 'erwartet', feld: 'erwartet', endung: '.erwartet' },
  { art: 'eingabe', feld: 'eingabe', endung: '.eingabe' },
  { art: 'ereignisse', feld: 'ereignisse', endung: '.ereignisse' },
  { art: 'ui-erwartet', feld: 'uiErwartet', endung: '.ui-erwartet' },
  { art: 'herd-erwartet', feld: 'herdErwartet', endung: '.herd-erwartet' },
  { art: 'klang-erwartet', feld: 'klangErwartet', endung: '.klang-erwartet' },
  { art: 'vorrat.json', feld: 'vorrat', endung: '.vorrat.json' },
  { art: 'vorrat-erwartet', feld: null, endung: '.vorrat-erwartet' },
  { art: 'exitcode', feld: null, endung: '.exitcode' },
];
const PRUEF_NAMEN = new Set(PRUEF_ARTEN.map((a) => a.art));
/** Manifestfelder des alten Formats, die mit dem Umzug entfallen (liegen dann in pruefung/). */
const ALTE_FELDER = ['datei', 'erwartet', 'eingabe', 'ereignisse', 'herdErwartet', 'uiErwartet', 'vorrat', 'exitCode'];
/** Laufoptionen aus dem Manifest (K-077, K-087, K-154) – bleiben im Eintrag. */
const LAUF_FELDER = ['args', 'zufallsSaat', 'echtzeit', 'zone', 'schrittLimit'];

const posix = (p) => p.split(path.sep).join('/');
const istDatei = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const istOrdner = (p) => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const byteVergleich = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const jsonZeilen = (t) => String(t).replace(/\r\n/g, '\n').split('\n').filter((z) => z.trim()).map((z) => JSON.parse(z));
/** Eingabezeilen (SPEC §11.1): eine Zeile je Eingabe, der letzte Zeilenumbruch zählt nicht. */
function eingabeZeilen(text) {
  const z = String(text).replace(/\r\n/g, '\n').split('\n');
  if (z.length && z[z.length - 1] === '') z.pop();
  return z;
}

// ---------------------------------------------------------------- Projektordner

/** Text- oder Binärinhalt einer Projektdatei (wie bin/pizza.js: Texte streng UTF-8, `\r\n` → `\n`; sonst Bytes). */
function leseInhalt(abs, rel) {
  const b = fs.readFileSync(abs);
  if (!TEXT_ENDUNG.test(rel)) return new Uint8Array(b);
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b).replace(/\r\n/g, '\n');
}

/** Alle Dateipfade eines Projektordners (ohne pruefung/ an der Wurzel und ohne versteckte Einträge), nach Bytefolge. */
function ordnerPfade(wurzel) {
  const aus = [];
  (function geh(abs, rel) {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (r !== PRUEFUNG) geh(path.join(abs, e.name), r); continue; }
      aus.push(r);
    }
  })(wurzel, '');
  return aus.sort(byteVergleich);
}

/** Projektordner → Dateisammlung { pfad → Text | Uint8Array } (ohne pruefung/). */
function leseOrdner(wurzel, pfade = ordnerPfade(wurzel)) {
  const dateien = {};
  for (const r of pfade) dateien[r] = leseInhalt(path.join(wurzel, ...r.split('/')), r);
  return dateien;
}

/**
 * Projektwurzel zu einer Datei oder einem Ordner (wie bin/pizza.js, PROJEKTE §1.5): ein Ordner ist selbst die Wurzel; zu einer Datei
 * der nächste Ordner aufwärts mit pizza.json (höchstens 8 Ebenen) – sonst null (Datei = Text-Programm).
 */
function findeProjekt(ziel) {
  let d = path.resolve(ziel);
  if (istOrdner(d)) return d;
  d = path.dirname(d);
  for (let i = 0; i < 8; i++) {
    if (istDatei(path.join(d, PROJEKTDATEI))) return d;
    const hoch = path.dirname(d);
    if (hoch === d) break;
    d = hoch;
  }
  return null;
}

/** pizza.json lesen → Objekt | { fehler }. */
function leseProjektdatei(abs) {
  let j;
  try { j = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) { return { fehler: 'kein gültiges JSON (' + e.message + ')' }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { fehler: 'kein Objekt' };
  return j;
}

/** Kanonische Dateiliste eines Beispiels: pizza.json, Hauptdatei, dann der Rest nach Bytefolge. */
function kanonischeListe(pfade, hauptdatei) {
  const vorn = [PROJEKTDATEI, hauptdatei].filter((p, i, a) => pfade.includes(p) && a.indexOf(p) === i);
  return vorn.concat(pfade.filter((p) => !vorn.includes(p)).sort(byteVergleich));
}

// ---------------------------------------------------------------- Manifeste

function leseJson(abs) { return JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^﻿/, '')); }

/** index.json + Teil-Manifeste → { teile: [{ teil, pfad, manifest }], fehler } (fehlende/ungültige Teile als Fehler). */
function leseManifeste(basis = BSP) {
  const fehler = [];
  const teile = [];
  const ip = path.join(basis, 'index.json');
  if (!istDatei(ip)) return { teile, fehler: ['site/beispiele/index.json fehlt'] };
  let index;
  try { index = leseJson(ip); } catch (e) { return { teile, fehler: ['index.json: ungültiges JSON (' + e.message + ')'] }; }
  if (!index || !Array.isArray(index.teile) || !index.teile.length) return { teile, fehler: ["index.json: 'teile' fehlt oder leer"] };
  for (const teil of index.teile) {
    if (typeof teil !== 'string') { fehler.push('index.json: Teil ist kein String: ' + JSON.stringify(teil)); continue; }
    const mp = path.join(basis, teil);
    if (!istDatei(mp)) { fehler.push('index.json verweist auf fehlende Datei ' + teil); continue; }
    let m;
    try { m = leseJson(mp); } catch (e) { fehler.push(teil + ': ungültiges JSON (' + e.message + ')'); continue; }
    teile.push({ teil, pfad: mp, manifest: m });
  }
  return { teile, fehler };
}

/**
 * Ein Manifest-Eintrag mit `ordner` → Beispiel. Dateien werden erst beim Zugriff gelesen.
 */
function beispiel(teil, kategorie, b, basis = BSP) {
  const ordnerPfad = path.join(basis, ...b.ordner.split('/'));
  const dateien = Array.isArray(b.dateien) ? b.dateien.slice() : [];
  const pj = istDatei(path.join(ordnerPfad, PROJEKTDATEI)) ? leseProjektdatei(path.join(ordnerPfad, PROJEKTDATEI)) : {};
  const hauptdatei = typeof pj.hauptdatei === 'string' ? pj.hauptdatei : HAUPTDATEI;
  const hauptdateiUrl = b.ordner + '/' + hauptdatei;
  const hauptdateiPfad = path.join(basis, ...hauptdateiUrl.split('/'));
  /** Pfad einer Testdatei (pruefung/<art>) – null, wenn es sie nicht gibt. */
  const pruefPfad = (art) => {
    if (!PRUEF_NAMEN.has(art)) throw new Error('unbekannte Testdatei-Art: ' + art);
    const p = path.join(ordnerPfad, PRUEFUNG, art);
    return istDatei(p) ? p : null;
  };
  const pruefText = (art) => { const p = pruefPfad(art); return p ? fs.readFileSync(p, 'utf8') : null; };
  const nurWenn = (t, f) => (t === null ? null : f(t));
  const optionen = {};
  for (const k of LAUF_FELDER) if (b[k] !== undefined) optionen[k] = b[k];
  const B = {
    teil, kategorie, eintrag: b,
    id: b.id, titel: b.titel, beschreibung: b.beschreibung,
    /** Testname in den Harnischen: <teil ohne .json>/<id>. */
    name: teil.replace(/\.json$/, '') + '/' + (b.id || b.ordner),
    format: 'ordner',
    ordner: b.ordner, ordnerPfad,
    dateien, hauptdatei, hauptdateiPfad,
    /** Pfad der Hauptdatei relativ zu site/beispiele/ (für fetch im Browser). */
    hauptdateiUrl,
    optionen,
    pruefPfad, pruefText,
    get quelle() { return fs.readFileSync(hauptdateiPfad, 'utf8'); },
    /** Dateisammlung (genau die Manifest-Dateiliste, wie die Galerie sie lädt) mit Hauptdatei. */
    get projekt() { return { dateien: leseOrdner(ordnerPfad, dateien), hauptdatei }; },
    /** Genau eine .pizza-Datei (= gleiches Programm als Text, PROJEKTE §1.5)? */
    get einDatei() { return dateien.filter((p) => /.pizza$/.test(p)).length === 1; },
    /** Was die Harnische laufen lassen: das Projekt. */
    get programm() { return B.projekt; },
    get exitCode() {
      const t = pruefText('exitcode');
      return t === null ? 0 : Number(t.trim());
    },
    get erwartet() { return pruefText('erwartet'); },
    get eingabe() { return nurWenn(pruefText('eingabe'), eingabeZeilen); },
    get ereignisse() { return nurWenn(pruefText('ereignisse'), jsonZeilen); },
    get uiErwartet() { return nurWenn(pruefText('ui-erwartet'), jsonZeilen); },
    get herdErwartet() { return nurWenn(pruefText('herd-erwartet'), jsonZeilen); },
    get klangErwartet() { return nurWenn(pruefText('klang-erwartet'), jsonZeilen); },
    get vorrat() { return nurWenn(pruefText('vorrat.json'), JSON.parse); },
    /** Optionen für PizzaLang.run: Manifest-Laufoptionen + eingabe/uiEreignisse/vorrat aus den Testdateien. */
    laufOptionen() {
      const o = Object.assign({ args: [] }, optionen);
      const e = B.eingabe; if (e) o.eingabe = e;
      const ev = B.ereignisse; if (ev) o.uiEreignisse = ev;
      const v = B.vorrat; if (v) o.vorrat = v;
      return o;
    },
  };
  return B;
}

/** Alle Beispiele aus allen Teil-Manifesten (in Manifest-Reihenfolge). */
function leseBeispiele({ basis = BSP } = {}) {
  const { teile } = leseManifeste(basis);
  const aus = [];
  for (const { teil, manifest } of teile) {
    for (const b of (manifest && Array.isArray(manifest.beispiele) ? manifest.beispiele : [])) {
      if (b && typeof b === 'object' && typeof b.ordner === 'string') aus.push(beispiel(teil, manifest.kategorie, b, basis));
    }
  }
  return aus;
}

// ---------------------------------------------------------------- Manifest schreiben (Einrückung 2, Text-/Zahl-Listen einzeilig)

function formatiere(wert, einr = '') {
  if (Array.isArray(wert)) {
    if (wert.every((x) => x === null || typeof x !== 'object')) return '[' + wert.map((x) => JSON.stringify(x)).join(', ') + ']';
    const i2 = einr + '  ';
    return '[\n' + wert.map((x) => i2 + formatiere(x, i2)).join(',\n') + '\n' + einr + ']';
  }
  if (wert && typeof wert === 'object') {
    const i2 = einr + '  ';
    const k = Object.keys(wert).filter((x) => wert[x] !== undefined);
    if (!k.length) return '{}';
    return '{\n' + k.map((x) => i2 + JSON.stringify(x) + ': ' + formatiere(wert[x], i2)).join(',\n') + '\n' + einr + '}';
  }
  return JSON.stringify(wert);
}
const schreibeJson = (abs, wert) => fs.writeFileSync(abs, formatiere(wert) + '\n');

/** Eintrag in fester Feldreihenfolge (id, titel, beschreibung, ordner, dateien, exitCode, tier, schlagworte, Rest). */
function ordneEintrag(e) {
  const vorn = ['id', 'titel', 'beschreibung', 'ordner', 'dateien', 'exitCode', 'tier', 'schlagworte'];
  const aus = {};
  for (const k of vorn) if (e[k] !== undefined) aus[k] = e[k];
  for (const k of Object.keys(e)) if (!vorn.includes(k)) aus[k] = e[k];
  return aus;
}

// ---------------------------------------------------------------- --umziehen

/**
 * Alte Einträge (datei + Begleitdateien) → Projektordner. Rein mechanisch, Inhalte byte-gleich (umbenannt, nicht kopiert).
 * → { umgezogen: [id] }; wirft bei Begleitdateien, die es nicht zuordnen kann.
 */
function umziehen({ basis = BSP, log = () => {} } = {}) {
  const { teile, fehler } = leseManifeste(basis);
  if (fehler.length) throw new Error(fehler.join('\n'));
  const umgezogen = [];
  for (const { teil, pfad, manifest } of teile) {
    let geaendert = false;
    manifest.beispiele = (manifest.beispiele || []).map((b) => {
      if (!b || typeof b.datei !== 'string' || typeof b.ordner === 'string') return b;
      if (!/\.pizza$/.test(b.datei)) throw new Error(teil + ' ' + b.id + ': datei endet nicht auf .pizza');
      const ordner = b.datei.replace(/\.pizza$/, '');
      const quelle = path.join(basis, ...b.datei.split('/'));
      const ziel = path.join(basis, ...ordner.split('/'));
      if (!istDatei(quelle)) throw new Error(teil + ' ' + b.id + ': ' + b.datei + ' fehlt');
      if (fs.existsSync(ziel)) throw new Error(teil + ' ' + b.id + ': Zielordner ' + ordner + '/ gibt es schon');
      // Begleitdateien zuordnen: Manifestfeld oder gleichnamige Datei; andere <name>.* neben der .pizza → Abbruch
      const altBasis = quelle.replace(/\.pizza$/, '');
      const zuordnung = [];
      for (const a of PRUEF_ARTEN) {
        const p = a.feld && typeof b[a.feld] === 'string' ? path.join(basis, ...b[a.feld].split('/')) : altBasis + a.endung;
        if (a.feld && typeof b[a.feld] === 'string' && !istDatei(p)) throw new Error(teil + ' ' + b.id + ': ' + b[a.feld] + ' fehlt');
        if (istDatei(p)) zuordnung.push([p, a.art]);
      }
      const name = path.basename(altBasis);
      const bekannt = new Set([quelle, ...zuordnung.map(([p]) => p)].map((p) => path.resolve(p)));
      for (const f of fs.readdirSync(path.dirname(quelle))) {
        const p = path.resolve(path.dirname(quelle), f);
        if (f.startsWith(name + '.') && !bekannt.has(p) && istDatei(p) && !leseManifesteNennen(teile, p, basis)) {
          throw new Error(teil + ' ' + b.id + ': unbekannte Begleitdatei ' + posix(path.relative(basis, p)) + ' – bitte zuordnen');
        }
      }
      fs.mkdirSync(path.join(ziel, PRUEFUNG), { recursive: true });
      fs.renameSync(quelle, path.join(ziel, HAUPTDATEI));
      for (const [p, art] of zuordnung) fs.renameSync(p, path.join(ziel, PRUEFUNG, art));
      const exitCode = typeof b.exitCode === 'number' ? b.exitCode : 0;
      if (exitCode !== 0) {
        if (zuordnung.some(([, art]) => art === 'exitcode')) throw new Error(teil + ' ' + b.id + ': exitCode im Manifest und .exitcode-Datei');
        fs.writeFileSync(path.join(ziel, PRUEFUNG, 'exitcode'), exitCode + '\n');
      }
      const pj = { pizza: 1, name: b.titel, hauptdatei: HAUPTDATEI };
      if (typeof b.beschreibung === 'string' && b.beschreibung) pj.beschreibung = b.beschreibung;
      schreibeJson(path.join(ziel, PROJEKTDATEI), pj);
      const neu = {};
      for (const k of Object.keys(b)) if (!ALTE_FELDER.includes(k)) neu[k] = b[k];
      neu.ordner = ordner;
      neu.dateien = kanonischeListe(ordnerPfade(ziel), HAUPTDATEI);
      if (exitCode !== 0) neu.exitCode = exitCode;
      geaendert = true;
      umgezogen.push(b.id);
      log('  ' + b.datei + ' → ' + ordner + '/');
      return ordneEintrag(neu);
    });
    if (geaendert) schreibeJson(pfad, manifest);
  }
  return { umgezogen };
}
/** Nennt ein anderer (alter) Eintrag diese Datei? (dann gehört sie nicht zum gerade umziehenden Beispiel) */
function leseManifesteNennen(teile, abs, basis) {
  const r = posix(path.relative(basis, abs));
  return teile.some(({ manifest }) => (manifest.beispiele || []).some((b) => b && ALTE_FELDER.some((f) => b[f] === r)));
}

// ---------------------------------------------------------------- --schreibe

/** Abgeleitete Felder neu schreiben (dateien, titel/beschreibung aus pizza.json, exitCode-Kopie). → Anzahl geänderter Manifeste */
function schreibe({ basis = BSP } = {}) {
  const { teile, fehler } = leseManifeste(basis);
  if (fehler.length) throw new Error(fehler.join('\n'));
  let n = 0;
  for (const { pfad, manifest } of teile) {
    const vorher = JSON.stringify(manifest);
    manifest.beispiele = (manifest.beispiele || []).map((b) => {
      if (!b || typeof b.ordner !== 'string') return b;
      const op = path.join(basis, ...b.ordner.split('/'));
      if (!istOrdner(op)) return b;
      const pj = istDatei(path.join(op, PROJEKTDATEI)) ? leseProjektdatei(path.join(op, PROJEKTDATEI)) : {};
      const neu = Object.assign({}, b);
      if (!pj.fehler && typeof pj.name === 'string') neu.titel = pj.name;
      if (!pj.fehler && typeof pj.beschreibung === 'string') neu.beschreibung = pj.beschreibung;
      neu.dateien = kanonischeListe(ordnerPfade(op), typeof pj.hauptdatei === 'string' ? pj.hauptdatei : HAUPTDATEI);
      const ep = path.join(op, PRUEFUNG, 'exitcode');
      const exit = istDatei(ep) ? Number(fs.readFileSync(ep, 'utf8').trim()) : 0;
      if (exit !== 0) neu.exitCode = exit; else delete neu.exitCode;
      return ordneEintrag(neu);
    });
    if (JSON.stringify(manifest) !== vorher) { schreibeJson(pfad, manifest); n++; }
  }
  return n;
}

// ---------------------------------------------------------------- --pruefe

/** Manifeste gegen die Platte prüfen → [Fehlertext] (leer = alles in Ordnung). */
function pruefe({ basis = BSP } = {}) {
  let pruefePfad = null;
  try { pruefePfad = require(path.join(WURZEL, 'site', 'js', 'pizza.js')).projekt.pruefePfad; } catch (e) { /* ohne Interpreter: nur Grundregel */ }
  const pfadFehler = (p) => (pruefePfad ? pruefePfad(p) : /^[a-z0-9_-][a-z0-9_.-]*(\/[a-z0-9_-][a-z0-9_.-]*)*$/.test(p) ? null : 'ungültiger Pfad');
  const { teile, fehler } = leseManifeste(basis);
  const ids = new Map();
  const belegt = new Set(['index.json', ...teile.map((t) => t.teil)]);   // Dateien relativ zu site/beispiele, die jemand nennt
  const ordnerListe = [];
  for (const { teil, manifest: m } of teile) {
    if (typeof m.kategorie !== 'string' || !m.kategorie) fehler.push(teil + ": 'kategorie' fehlt");
    if (!Array.isArray(m.beispiele)) { fehler.push(teil + ": 'beispiele' ist kein Array"); continue; }
    m.beispiele.forEach((b, i) => {
      const wo = teil + '#' + i + (b && b.id ? ' (' + b.id + ')' : '');
      if (!b || typeof b !== 'object') { fehler.push(wo + ': kein Objekt'); return; }
      for (const k of ['id', 'titel', 'beschreibung']) if (typeof b[k] !== 'string' || !b[k].trim()) fehler.push(wo + ": Pflichtfeld '" + k + "' fehlt/leer");
      if (![1, 2, 3].includes(b.tier)) fehler.push(wo + ': tier ' + JSON.stringify(b.tier) + ' ∉ {1,2,3}');
      if (!Array.isArray(b.schlagworte) || b.schlagworte.some((s) => typeof s !== 'string')) fehler.push(wo + ": 'schlagworte' ist kein Text-Array");
      if ('interaktiv' in b && typeof b.interaktiv !== 'boolean') fehler.push(wo + ": 'interaktiv' ist kein Boolean");
      if (typeof b.id === 'string') { if (ids.has(b.id)) fehler.push(wo + ": id '" + b.id + "' doppelt (auch in " + ids.get(b.id) + ')'); else ids.set(b.id, teil); }
      const B = typeof b.ordner === 'string' ? beispiel(teil, m.kategorie, b, basis) : null;
      if (B) pruefeOrdnerEintrag(b, B, wo, fehler, pfadFehler, belegt, ordnerListe, basis);
      else if (typeof b.datei === 'string') fehler.push(wo + ': altes Format (datei) – node scripts/beispiele.js --umziehen');
      else fehler.push(wo + ": 'ordner' fehlt");
      if (B && b.interaktiv === true && !B.pruefPfad('eingabe')) fehler.push(wo + ': interaktiv ohne Eingabedatei (pruefung/eingabe, SPEC §11.1)');
    });
  }
  // Waisen: jede Datei unter site/beispiele/ gehört einem Eintrag (Ordner) oder ist ein Manifest
  (function geh(abs) {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, e.name);
      const r = posix(path.relative(basis, p));
      if (e.isDirectory()) { if (!ordnerListe.includes(r)) geh(p); continue; }
      if (!belegt.has(r)) fehler.push(r + ' gehört zu keinem Beispiel (in keinem Manifest genannt)');
    }
  })(basis);
  return fehler;
}

function pruefeOrdnerEintrag(b, B, wo, fehler, pfadFehler, belegt, ordnerListe, basis) {
  for (const k of ALTE_FELDER) if (k !== 'exitCode' && k in b) fehler.push(wo + ": Feld '" + k + "' gehört zum alten Format (Testdateien liegen in pruefung/)");
  const pf = b.ordner.split('/').length !== 2 ? 'nicht <kategorie>/<projekt>' : pfadFehler(b.ordner);
  if (pf) { fehler.push(wo + ': ordner ' + JSON.stringify(b.ordner) + ': ' + pf); return; }
  const op = B.ordnerPfad;
  if (!istOrdner(op)) { fehler.push(wo + ': Ordner ' + b.ordner + '/ fehlt'); return; }
  for (const o of ordnerListe) if (o === b.ordner || o.startsWith(b.ordner + '/') || b.ordner.startsWith(o + '/')) fehler.push(wo + ': Ordner ' + b.ordner + ' überschneidet sich mit ' + o);
  ordnerListe.push(b.ordner);
  // pizza.json
  const pjp = path.join(op, PROJEKTDATEI);
  let hauptdatei = HAUPTDATEI;
  if (!istDatei(pjp)) fehler.push(wo + ': ' + b.ordner + '/pizza.json fehlt');
  else {
    const pj = leseProjektdatei(pjp);
    if (pj.fehler) fehler.push(wo + ': pizza.json: ' + pj.fehler);
    else {
      if (pj.pizza !== 1) fehler.push(wo + ': pizza.json: "pizza" muss 1 sein');
      if (pj.name !== b.titel) fehler.push(wo + ': pizza.json "name" ' + JSON.stringify(pj.name) + ' ≠ titel ' + JSON.stringify(b.titel) + ' (node scripts/beispiele.js --schreibe)');
      if (pj.beschreibung !== undefined && pj.beschreibung !== b.beschreibung) fehler.push(wo + ': pizza.json "beschreibung" weicht vom Manifest ab (node scripts/beispiele.js --schreibe)');
      if (typeof pj.beschreibung === 'string' && pj.beschreibung.length > 500) fehler.push(wo + ': beschreibung länger als 500 Zeichen');
      if (typeof pj.name === 'string' && pj.name.length > 80) fehler.push(wo + ': name länger als 80 Zeichen');
      if (pj.hauptdatei !== undefined && typeof pj.hauptdatei !== 'string') fehler.push(wo + ': pizza.json "hauptdatei" muss ein Text sein');
      if (typeof pj.hauptdatei === 'string') hauptdatei = pj.hauptdatei;
    }
  }
  if (!istDatei(path.join(op, ...hauptdatei.split('/')))) fehler.push(wo + ': Hauptdatei ' + b.ordner + '/' + hauptdatei + ' fehlt');
  // Dateiliste = Platte (ohne pruefung/), kanonische Reihenfolge, gültige Pfade
  const platte = ordnerPfade(op);
  const soll = kanonischeListe(platte, hauptdatei);
  if (!Array.isArray(b.dateien)) fehler.push(wo + ": 'dateien' fehlt (node scripts/beispiele.js --schreibe)");
  else if (JSON.stringify(b.dateien) !== JSON.stringify(soll)) {
    const fehlt = platte.filter((p) => !b.dateien.includes(p)), zuviel = b.dateien.filter((p) => !platte.includes(p));
    fehler.push(wo + ': dateien passt nicht zur Platte' + (fehlt.length ? ' – nicht genannt: ' + fehlt.join(', ') : '') +
      (zuviel.length ? ' – fehlt auf der Platte: ' + zuviel.join(', ') : '') + (!fehlt.length && !zuviel.length ? ' – Reihenfolge' : '') + ' (node scripts/beispiele.js --schreibe)');
  }
  for (const p of platte) {
    const f = pfadFehler(p) || (ERLAUBTE_ENDUNG.test(p) ? null : 'Dateiart nicht erlaubt (.pizza, .png, .jpg, .jpeg, .txt, .json, .csv, .md)');
    if (f) fehler.push(wo + ': ' + p + ': ' + f);
  }
  for (const p of platte) belegt.add(b.ordner + '/' + p);
  // pruefung/: nur bekannte Testdateien, erwartet Pflicht, exitcode gültig und = Anzeige-Kopie im Manifest
  const pdir = path.join(op, PRUEFUNG);
  if (istOrdner(pdir)) {
    for (const e of fs.readdirSync(pdir, { withFileTypes: true })) {
      if (!e.isFile() || !PRUEF_NAMEN.has(e.name)) fehler.push(wo + ': unbekannte Testdatei ' + PRUEFUNG + '/' + e.name + ' (erlaubt: ' + [...PRUEF_NAMEN].join(', ') + ')');
      else belegt.add(b.ordner + '/' + PRUEFUNG + '/' + e.name);
    }
  }
  const erw = B.pruefText('erwartet');
  if (erw === null) fehler.push(wo + ': ' + b.ordner + '/pruefung/erwartet fehlt');
  else if (erw.length && !erw.endsWith('\n')) fehler.push(wo + ': pruefung/erwartet ohne abschließenden Zeilenumbruch (ARCHITEKTUR §3)');
  const et = B.pruefText('exitcode');
  const exit = et === null ? 0 : Number(et.trim());
  if (et !== null && !(/^\d+\s*$/.test(et) && EXITCODES.includes(exit))) fehler.push(wo + ': pruefung/exitcode ' + JSON.stringify(et) + ' ∉ {' + EXITCODES + '}');
  if ((b.exitCode === undefined ? 0 : b.exitCode) !== exit) fehler.push(wo + ': exitCode im Manifest (Anzeige) ' + JSON.stringify(b.exitCode) + ' ≠ pruefung/exitcode ' + exit + ' (node scripts/beispiele.js --schreibe)');
  if (b.exitCode === 0) fehler.push(wo + ': exitCode 0 steht nicht im Manifest (node scripts/beispiele.js --schreibe)');
}

// ---------------------------------------------------------------- Doku-Codeblöcke (ARCHITEKTUR §4)

/** Doku-Codeblock → Programm: Text (`code`) oder Projekt { dateien, hauptdatei? } (`dateien`: { pfad → Text }, nur Textdateien). */
function dokuProgramm(item) {
  if (item && item.dateien && typeof item.dateien === 'object') {
    const p = { dateien: Object.assign({}, item.dateien) };
    if (typeof item.hauptdatei === 'string') p.hauptdatei = item.hauptdatei;
    return p;
  }
  return String((item && item.code) || '');
}
/** Lesbarer Text eines Blocks (Fehlermeldungen, Textsuchen): bei `dateien` jede Datei mit Kopfzeile `// ── pfad`. */
function dokuText(item) {
  if (item && item.dateien && typeof item.dateien === 'object') return Object.entries(item.dateien).map(([p, t]) => '// ── ' + p + '\n' + t).join('\n');
  return String((item && item.code) || '');
}
/** Sprachen ohne Prüfung (Doku-Blöcke, die kein pizza sind). */
const FREMDE_SPRACHEN = new Set(['xml', 'shell', 'json']);

module.exports = {
  BSP, PROJEKTDATEI, HAUPTDATEI, PRUEFUNG, PRUEF_ARTEN, EXITCODES, FREMDE_SPRACHEN,
  leseManifeste, leseBeispiele, beispiel, leseOrdner, ordnerPfade, findeProjekt, leseProjektdatei, kanonischeListe,
  eingabeZeilen, jsonZeilen, formatiere, umziehen, schreibe, pruefe, dokuProgramm, dokuText,
};

if (require.main === module) {
  const a = process.argv.slice(2);
  if (a.includes('--umziehen')) {
    const r = umziehen({ log: (z) => console.log(z) });
    console.log(r.umgezogen.length + ' Beispiele umgezogen');
    const n = schreibe();
    if (n) console.log(n + ' Manifest(e) nachgeführt');
  } else if (a.includes('--schreibe')) {
    const n = schreibe();
    console.log(n ? n + ' Manifest(e) geschrieben' : 'Manifeste sind aktuell');
  } else if (!a.includes('--pruefe')) {
    console.error('Aufruf: node scripts/beispiele.js --pruefe | --schreibe | --umziehen');
    process.exit(2);
  }
  const f = pruefe();
  if (f.length) { for (const z of f) console.log('✗ ' + z); console.log(f.length + ' Abweichung(en)'); process.exit(1); }
  console.log('✓ ' + leseBeispiele().length + ' Beispiele: Manifeste und Ordner passen');
}
