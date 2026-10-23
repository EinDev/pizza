// pizza-Interpreter · Projekte: Dateisammlung, Pfade, pizza.json, gemeinsamer Lader (SPEC §2.1 … §2.6, K-138 … K-141)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).
//
// PizzaLang.projekt.lade ist DER Lader für alle Motoren (Interpreter jetzt, Compiler ab PROJEKTE PA2): pizza.json,
// Pfade, Textnormalisierung, Tiefensuche über `bestellt`, Grenzen und die konservativen Projektprüfungen
// P0014 … P0020 und W0004 in der Reihenfolge von SPEC §2.5. Ergebnis ist EIN Programm (Verkettung in Ladereihenfolge),
// jeder Knoten mit Datei-Index d (dateien[0] = Hauptdatei).

// =====================================================================
// PROJEKTE
// =====================================================================

const PROJEKT_GRENZEN = { dateien: 100, datei: 2 * 1048576, pizza: 512 * 1024, gesamt: 8 * 1048576 };
const PFAD_STUECK = /^[a-z0-9_-][a-z0-9_.-]*$/;
const TEXT_ENDUNGEN = ['.pizza', '.txt', '.json', '.csv', '.md'];
const PRUEFUNG = 'pruefung/';
// in Nebendateien erlaubte oberste Knoten (SPEC §2.3; paket/import verwirft schon der Parser, Leer = einzelnes ';')
const NEBEN_ERLAUBT = new Set(['Bestellt', 'Klasse', 'Rezeptur', 'Enum', 'Methode', 'Var', 'Leer']);

// SPEC §2.1: null = gültig, sonst ein kurzer Grund (Text). Dieselbe Regel prüft die Durchreiche unabhängig.
function pruefePfad(pfad) {
  if (typeof pfad !== 'string') return 'Ein Dateipfad ist ein Text.';
  if (pfad.length === 0) return 'Der Dateipfad ist leer.';
  if (pfad.length > 120) return 'Der Dateipfad ist länger als 120 Zeichen.';
  const teile = pfad.split('/');
  if (teile.length > 8) return 'Der Dateipfad hat mehr als 8 Ebenen.';
  for (const t of teile) {
    if (t === '') return 'Der Dateipfad hat ein leeres Stück (/ am Anfang, am Ende oder doppelt).';
    if (!PFAD_STUECK.test(t)) return 'Erlaubt sind nur a–z, 0–9, -, _, . und / (kein Stück beginnt mit .).';
  }
  return null;
}
function pfadFehlerText(pfad) { return '"' + pfad + '" ist kein gültiger Dateipfad (nur a–z, 0–9, -, _, . und /).'; }
function istPizzaPfad(pfad) { return pfad.length > 6 && pfad.slice(-6) === '.pizza'; }
function istTextPfad(pfad) {
  for (const e of TEXT_ENDUNGEN) if (pfad.length > e.length && pfad.slice(-e.length) === e) return true;
  return false;
}
// SPEC §2.1: \r\n → \n (einzelnes \r und ein BOM bleiben); idempotent
function normText(t) { return t.indexOf('\r\n') < 0 ? t : t.replace(/\r\n/g, '\n'); }

// UTF-8-Länge eines Texts (wie TextEncoder: einzelne Surrogate zählen als U+FFFD = 3 Bytes) – ohne TextEncoder,
// damit der Lader auch im Worker-Kontext ohne Web-APIs läuft.
function utf8Laenge(t) {
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < t.length && (t.charCodeAt(i + 1) & 0xFC00) === 0xDC00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}
// Strenges UTF-8 (wie TextDecoder fatal, ignoreBOM): ungültig → null; ein BOM bleibt als U+FEFF erhalten.
function utf8Text(b) {
  let aus = '';
  const teile = [];
  for (let i = 0; i < b.length;) {
    const x = b[i];
    let cp, n;
    if (x < 0x80) { cp = x; n = 1; }
    else if (x >= 0xC2 && x <= 0xDF) { cp = x & 0x1F; n = 2; }
    else if (x >= 0xE0 && x <= 0xEF) { cp = x & 0x0F; n = 3; }
    else if (x >= 0xF0 && x <= 0xF4) { cp = x & 0x07; n = 4; }
    else return null;
    if (i + n > b.length) return null;
    for (let k = 1; k < n; k++) {
      const y = b[i + k];
      if ((y & 0xC0) !== 0x80) return null;
      cp = (cp << 6) | (y & 0x3F);
    }
    if ((n === 3 && (cp < 0x800 || (cp >= 0xD800 && cp <= 0xDFFF))) || (n === 4 && (cp < 0x10000 || cp > 0x10FFFF))) return null;
    aus += String.fromCodePoint(cp);
    if (aus.length > 8192) { teile.push(aus); aus = ''; }
    i += n;
  }
  teile.push(aus);
  return teile.join('');
}
// Größen für P0020 (SPEC §2.1): KB ganzzahlig, MB mit einer Nachkommastelle, je aufgerundet, Dezimalkomma
function kbText(bytes) { return Math.ceil(bytes / 1024) + ' KB'; }
function mbText(bytes) { const z = Math.ceil(bytes * 10 / 1048576); return Math.floor(z / 10) + ',' + (z % 10) + ' MB'; }

function ladeFehler(code, text, datei, zeile, spalte, art) {
  return { ok: false, fehler: { code, art: art || 'pizzafehler', text: 'PizzaFehler ' + code + ': ' + text, datei: datei === undefined ? null : datei, zeile: zeile == null ? null : zeile, spalte: spalte == null ? null : spalte } };
}
function istBytes(v) { return v instanceof Uint8Array || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(v) && !(v instanceof DataView)); }

// pizza.json auswerten (SPEC §2.1) – liefert { name, hauptdatei, args, dateien } bzw. { fehler } (P0015/HOST, Ort pizza.json).
// dateien: normalisierte Sammlung ohne pruefung/ (Texte als String mit \n, Bytes als Uint8Array).
// vorschlag: Begleitfelder der Hülle { name?, hauptdatei? } – ein ausdrücklich übergebenes hauptdatei hat Vorrang (CLI §1.5).
function ausDateien(dateien, vorschlag) {
  const f = (code, text, datei) => ladeFehler(code, text, datei).fehler;
  if (dateien === null || typeof dateien !== 'object') return { fehler: f('HOST', 'Ein Projekt braucht Dateien ({ pfad: Inhalt }).', null) };
  vorschlag = vorschlag || {};
  const sammlung = {};
  for (const pfad of Object.keys(dateien).sort()) {
    if (pfad.slice(0, PRUEFUNG.length) === PRUEFUNG) continue;
    let v = dateien[pfad];
    if (typeof v === 'string') { if (istTextPfad(pfad)) v = normText(v); }
    else if (istBytes(v)) {
      const b = v instanceof Uint8Array ? v : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      if (istTextPfad(pfad)) {
        const t = utf8Text(b);
        if (t === null) return { fehler: f('P0015', pfad + ' ist kein gültiger UTF-8-Text.', pruefePfad(pfad) === null ? pfad : null) };
        v = normText(t);
      } else v = b;
    } else return { fehler: f('P0015', 'Die Datei "' + pfad + '" hat keinen Inhalt (Text oder Bytes).', null) };
    sammlung[pfad] = v;
  }
  // 1. pizza.json
  let pj = null;
  if (Object.prototype.hasOwnProperty.call(sammlung, 'pizza.json')) {
    const ungueltig = (grund) => ({ fehler: f('P0015', 'pizza.json ist ungültig: ' + grund + '.', 'pizza.json') });
    const roh = sammlung['pizza.json'];
    try { pj = JSON.parse(typeof roh === 'string' ? roh : ''); } catch (e) { return ungueltig('kein gültiges JSON'); }
    if (pj === null || typeof pj !== 'object' || Array.isArray(pj)) return ungueltig('kein Objekt');
    if (!Object.prototype.hasOwnProperty.call(pj, 'pizza')) return ungueltig('"pizza" fehlt');
    if (typeof pj.pizza !== 'number' || !Number.isInteger(pj.pizza) || pj.pizza < 1) return ungueltig('"pizza" muss eine Ganzzahl sein');
    if (pj.pizza > 1) return { fehler: f('HOST', 'Diese Projektdatei braucht eine neuere pizza-Version.', 'pizza.json') };
    for (const [feld, max] of [['name', 80], ['hauptdatei', 120], ['beschreibung', 500]]) {
      if (pj[feld] === undefined) continue;
      if (typeof pj[feld] !== 'string') return ungueltig('"' + feld + '" muss ein Text sein');
      if (feld !== 'hauptdatei' && pj[feld].length > max) return ungueltig('"' + feld + '" ist zu lang');
    }
    if (pj.hauptdatei !== undefined && pruefePfad(pj.hauptdatei) !== null) return { fehler: f('P0015', pfadFehlerText(pj.hauptdatei), 'pizza.json') };
    if (pj.args !== undefined) {
      if (!Array.isArray(pj.args) || pj.args.some(a => typeof a !== 'string')) return ungueltig('"args" muss ein Blech aus Texten sein');
      if (pj.args.length > 32 || pj.args.some(a => a.length > 200)) return ungueltig('"args" ist zu lang');
    }
  }
  // 2. Pfade der Sammlung (Bytefolge), 3. Hauptdatei
  for (const pfad of Object.keys(sammlung)) if (pruefePfad(pfad) !== null) return { fehler: f('P0015', pfadFehlerText(pfad), null) };
  let haupt = typeof vorschlag.hauptdatei === 'string' ? vorschlag.hauptdatei : (pj && pj.hauptdatei !== undefined ? pj.hauptdatei : null);
  if (haupt === null) {
    const pizzas = Object.keys(sammlung).filter(istPizzaPfad);
    haupt = Object.prototype.hasOwnProperty.call(sammlung, 'hauptgang.pizza') || pizzas.length !== 1 ? 'hauptgang.pizza' : pizzas[0];
  }
  if (pruefePfad(haupt) !== null) return { fehler: f('P0015', pfadFehlerText(haupt), null) };
  if (!Object.prototype.hasOwnProperty.call(sammlung, haupt)) return { fehler: f('P0015', 'Die Datei "' + haupt + '" gibt es im Projekt nicht.', null) };
  if (!istPizzaPfad(haupt)) return { fehler: f('P0015', '"' + haupt + '" ist keine .pizza-Datei – bestellen kann man nur Rezepte.', null) };
  const saeubere = (t) => t.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 80);
  let name = pj && pj.name !== undefined ? pj.name : (typeof vorschlag.name === 'string' ? vorschlag.name : null);
  if (name === null || saeubere(name) === '') name = haupt.slice(haupt.lastIndexOf('/') + 1, -6);
  return { name: saeubere(name), hauptdatei: haupt, args: pj && pj.args ? pj.args.slice() : [], dateien: sammlung };
}

// Oberste Namen einer Datei (SPEC §2.4): Klassen/Rezepturen/quattrostagioni (auch verschachtelte), Funktionen, Variablen
function obersteNamen(body) {
  const r = [];
  const typ = (n, geheim) => {
    r.push({ name: n.name, z: n.nz, s: n.ns, geheim });
    if (n.k === 'Klasse') for (const i of n.innere) typ(i, false);
  };
  for (const st of body) {
    const geheim = !!(st.mods && st.mods.indexOf('geheimrezept') >= 0);
    if (st.k === 'Klasse' || st.k === 'Rezeptur' || st.k === 'Enum') typ(st, geheim);
    else if (st.k === 'Methode') r.push({ name: st.name, z: st.nz, s: st.ns, geheim });
    else if (st.k === 'Var') for (const d of st.decls) r.push({ name: d.name, z: d.z, s: d.s, geheim });
  }
  r.sort((a, b) => a.z - b.z || a.s - b.s);
  return r;
}
// In einer Datei lokal gebundene Namen (Variablen in Blöcken, Parameter, Lambda-, für-, Fang-, roh-Variablen) – §2.4 (d)
function lokaleNamen(ast, ziel) {
  const stapel = [ast];
  while (stapel.length) {
    const n = stapel.pop();
    if (Array.isArray(n)) { for (const x of n) if (x !== null && typeof x === 'object') stapel.push(x); continue; }
    if (n.k === 'Var') for (const d of n.decls) ziel.add(d.name);
    else if (n.k === 'FuerJedes') ziel.add(n.name);
    if (Array.isArray(n.params)) for (const p of n.params) ziel.add(p.name);
    if (Array.isArray(n.faenge)) for (const fa of n.faenge) ziel.add(fa.name);
    if (n.k === 'Ofen' && n.roh) ziel.add(n.roh.name);
    for (const key in n) { const x = n[key]; if (x !== null && typeof x === 'object') stapel.push(x); }
  }
}
// Mitgliedsnamen aller Klassen/Rezepturen und Wertnamen aller quattrostagioni (§2.4 (d), projektweit)
function mitgliedsNamen(body, ziel) {
  const typ = (n) => {
    if (n.k === 'Klasse') {
      for (const f of n.felder) for (const d of f.decls) ziel.add(d.name);
      for (const m of n.methoden) ziel.add(m.name);
      for (const i of n.innere) typ(i);
    } else if (n.k === 'Rezeptur') for (const m of n.methoden) ziel.add(m.name);
    else if (n.k === 'Enum') for (const w of n.werte) ziel.add(w.n);
  };
  for (const st of body) typ(st);
}
// erste hauptgang-Methode/-Funktion einer Datei (auch in verschachtelten Klassen) – für P0017
function hauptgangIn(body) {
  let best = null;
  const nimm = (m) => { if (m.name === 'hauptgang' && (!best || m.nz < best.nz || (m.nz === best.nz && m.ns < best.ns))) best = m; };
  const klasse = (k) => { for (const m of k.methoden) nimm(m); for (const i of k.innere) if (i.k === 'Klasse') klasse(i); };
  for (const st of body) {
    if (st.k === 'Methode') nimm(st);
    else if (st.k === 'Klasse') klasse(st);
  }
  return best;
}

// Der gemeinsame Lader (ARCHITEKTUR §1). quelle: Text (Ein-Datei-Programm ohne Sammlung) oder Projekt { dateien, hauptdatei?, name? }.
// → { ok: true, ladeliste, dateien, ast, warnungen, args, kiste, name, hauptdatei } | { ok: false, fehler: { code, art, text, datei, zeile, spalte } }
function ladeProjekt(quelle) {
  const einzeln = quelle === null || quelle === undefined || typeof quelle !== 'object';
  const projekt = einzeln ? { dateien: { 'hauptgang.pizza': quelle == null ? '' : String(quelle) } } : quelle;
  // Stufe 1: pizza.json, Pfade, Hauptdatei (SPEC §2.5)
  const aus = ausDateien(projekt.dateien, einzeln ? null : { name: projekt.name, hauptdatei: projekt.hauptdatei });
  if (aus.fehler) return { ok: false, fehler: aus.fehler };
  const sammlung = aus.dateien, haupt = aus.hauptdatei;
  // Ort eines Ladefehlers (SPEC §2.6): Text-Programme nennen nie eine Datei; in Sammlungen nennt ihn jeder Fehler an einem
  // `bestellt` und – sobald die Sammlung mehr als eine .pizza-Datei hat – jeder andere Fehler mit Ort.
  const mehrPizza = Object.keys(sammlung).filter(istPizzaPfad).length > 1;
  const ort = (pfad, ausBestellt) => (einzeln || !(ausBestellt || mehrPizza) ? null : pfad);

  // Stufe 2: Tiefensuche (Syntaxfehler, P0014, P0015 in Besuchsreihenfolge)
  const info = new Map();     // pfad → { d, ast, toks, generika, bestellt: Set }
  const dateien = [];         // Datei-Index → Pfad (Besuchsreihenfolge, [0] = Hauptdatei)
  const ladeliste = [];
  const aktiv = [];
  const w0004 = [];
  let fehler = null;
  const besuche = (pfad) => {
    const d = dateien.length;
    dateien.push(pfad);
    aktiv.push(pfad);
    let p;
    try { p = parseIntern(sammlung[pfad], d); }
    catch (e) {
      const sf = syntaxFehlerAus(e);
      fehler = { ok: false, fehler: { code: sf.code, art: 'syntax', text: sf.text, datei: ort(pfad, sf.code === 'P0015'), zeile: sf.zeile, spalte: sf.spalte } };
      return;
    }
    const eintrag = { d, ast: p.ast, toks: p.toks, generika: p.generika, bestellt: new Set() };
    info.set(pfad, eintrag);
    for (const b of p.ast.body) {
      if (b.k !== 'Bestellt') continue;
      const q = b.pfad;
      if (!istPizzaPfad(q)) { fehler = ladeFehler('P0015', '"' + q + '" ist keine .pizza-Datei – bestellen kann man nur Rezepte.', ort(pfad, true), b.z, b.s); return; }
      if (eintrag.bestellt.has(q)) { w0004.push({ code: 'W0004', text: 'W0004: "' + q + '" ist schon bestellt.', pfad, z: b.z, s: b.s }); continue; }
      eintrag.bestellt.add(q);
      if (aktiv.indexOf(q) >= 0) { fehler = ladeFehler('P0014', 'Kreisbestellung: ' + aktiv.concat([q]).join(' → ') + '.', ort(pfad, true), b.z, b.s); return; }
      if (info.has(q)) continue;
      if (!Object.prototype.hasOwnProperty.call(sammlung, q)) { fehler = ladeFehler('P0015', 'Die Datei "' + q + '" gibt es im Projekt nicht.', ort(pfad, true), b.z, b.s); return; }
      besuche(q);
      if (fehler) return;
    }
    aktiv.pop();
    ladeliste.push(pfad);
  };
  besuche(haupt);
  if (fehler) return fehler;

  // Stufe 3: Grenzen der Sammlung (ohne pruefung/)
  const pfade = Object.keys(sammlung);
  if (pfade.length > PROJEKT_GRENZEN.dateien) return ladeFehler('P0020', 'Das Projekt ist zu groß für den Ofen (' + pfade.length + ' Dateien, höchstens ' + PROJEKT_GRENZEN.dateien + ').');
  let gesamt = 0;
  for (const pfad of pfade) {
    const v = sammlung[pfad];
    const n = typeof v === 'string' ? utf8Laenge(v) : v.length;
    gesamt += n;
    if (istPizzaPfad(pfad) && n > PROJEKT_GRENZEN.pizza) return ladeFehler('P0020', 'Das Projekt ist zu groß für den Ofen (' + pfad + ' hat ' + kbText(n) + ', höchstens 512 KB).');
    if (n > PROJEKT_GRENZEN.datei) return ladeFehler('P0020', 'Das Projekt ist zu groß für den Ofen (' + pfad + ' hat ' + mbText(n) + ', höchstens 2 MB).');
  }
  if (gesamt > PROJEKT_GRENZEN.gesamt) return ladeFehler('P0020', 'Das Projekt ist zu groß für den Ofen (zusammen ' + mbText(gesamt) + ', höchstens 8 MB).');

  const rang = new Array(dateien.length);
  ladeliste.forEach((pfad, i) => { rang[info.get(pfad).d] = i; });
  const mehr = ladeliste.length > 1;
  if (mehr) {
    // Stufe 4a: P0017 – Nebendateien nur mit Rezepten, hauptgang nur in der Hauptdatei
    for (const pfad of ladeliste) {
      if (pfad === haupt) continue;
      const body = info.get(pfad).ast.body;
      let st = null;
      for (const x of body) if (!NEBEN_ERLAUBT.has(x.k)) { st = x; break; }
      const hg = hauptgangIn(body);
      if (hg && (!st || hg.nz < st.z || (hg.nz === st.z && hg.ns < st.s))) {
        return ladeFehler('P0017', 'hauptgang gehört in die Hauptdatei ' + haupt + ', nicht nach ' + pfad + '.', pfad, hg.nz, hg.ns);
      }
      if (st) return ladeFehler('P0017', 'In ' + pfad + ' dürfen nur Rezepte stehen (Klassen, Funktionen, Variablen) – Anweisungen gehören in die Hauptdatei ' + haupt + '.', pfad, st.z, st.s);
    }
    // Stufe 4b: P0016 – ein Projekt-Namensraum
    const besitzer = new Map();   // name → { pfad, z, geheim }
    for (const pfad of ladeliste) {
      for (const n of obersteNamen(info.get(pfad).ast.body)) {
        const b = besitzer.get(n.name);
        if (!b) { besitzer.set(n.name, { pfad, z: n.z, geheim: n.geheim }); continue; }
        if (b.pfad === pfad) { if (n.geheim) b.geheim = true; continue; }
        return ladeFehler('P0016', '\'' + n.name + '\' gibt es zweimal – in ' + b.pfad + ' (Zeile ' + b.z + ') und in ' + pfad + ' (Zeile ' + n.z + ').', pfad, n.z, n.s);
      }
    }
    // Stufe 4c: P0018/P0019 – Sichtbarkeit (konservativ, auf den Tokens jeder Datei)
    const mitglieder = new Set();
    for (const pfad of ladeliste) mitgliedsNamen(info.get(pfad).ast.body, mitglieder);
    for (const pfad of ladeliste) {
      const e = info.get(pfad);
      const lokal = new Set(e.generika);
      lokaleNamen(e.ast.body, lokal);
      const t = e.toks;
      let anno = 0;   // Klammertiefe in Annotations-Argumenten (dort ist auch `name = wert` ein benanntes Argument)
      for (let i = 0; i < t.length; i++) {
        const k = t[i];
        if (k.t === 'kw' && (k.v === 'paket' || k.v === 'import')) { while (i + 1 < t.length && !(t[i + 1].t === 'op' && t[i + 1].v === ';') && t[i + 1].t !== 'eof') i++; continue; }
        if (k.t === 'op') {
          if (anno > 0) { if (k.v === '(') anno++; else if (k.v === ')') anno--; }
          else if (k.v === '(' && i >= 2 && t[i - 1].t === 'name' && (t[i - 2].t === 'op' && (t[i - 2].v === '@' || t[i - 2].v === '.'))) {
            // Annotation @a(…) bzw. @a.b(…): Rückwärts bis zum '@' prüfen
            let j = i - 1;
            while (j >= 2 && t[j - 1].t === 'op' && t[j - 1].v === '.' && t[j - 2].t === 'name') j -= 2;
            if (j >= 1 && t[j - 1].t === 'op' && t[j - 1].v === '@') anno = 1;
          }
          continue;
        }
        if (k.t !== 'name') continue;
        if (k.v === 'bestellt' && t[i + 1].t === 'text') { i++; continue; }
        const vor = i > 0 ? t[i - 1] : null, nach = t[i + 1];
        if (vor && vor.t === 'op' && (vor.v === '.' || vor.v === '@')) continue;
        if (nach.t === 'op' && (nach.v === ':' || (anno > 0 && nach.v === '='))) continue;
        const b = besitzer.get(k.v);
        if (!b || b.pfad === pfad || lokal.has(k.v) || mitglieder.has(k.v)) continue;
        if (b.geheim) return ladeFehler('P0018', '\'' + k.v + '\' ist ein Geheimrezept von ' + b.pfad + '.', pfad, k.z, k.s);
        if (!e.bestellt.has(b.pfad)) return ladeFehler('P0019', '\'' + k.v + '\' kommt aus ' + b.pfad + ' – bestelle die Datei hier: bestellt "' + b.pfad + '";', pfad, k.z, k.s);
      }
    }
  }

  // EIN Programm: Rümpfe in Ladereihenfolge (ohne Bestellt-Knoten), Hoisting/Snack-Modus wie SPEC §2
  let ast;
  if (!mehr) {
    ast = info.get(haupt).ast;
    if (ast.body.some(x => x.k === 'Bestellt')) ast.body = ast.body.filter(x => x.k !== 'Bestellt');
  } else {
    const body = [];
    for (const pfad of ladeliste) for (const x of info.get(pfad).ast.body) if (x.k !== 'Bestellt') body.push(x);
    ast = { k: 'Programm', z: 1, s: 1, di: 0, body };
  }
  ast.dateiPfade = mehr ? dateien.slice() : null;   // null = Ein-Datei-Programm (Feld datei der Ereignisse bleibt null)
  ast.ladeRang = rang;                               // Datei-Index → Position in der Ladeliste (Reihenfolge der Warnungen)
  w0004.sort((a, b) => rang[info.get(a.pfad).d] - rang[info.get(b.pfad).d] || a.z - b.z || a.s - b.s);
  const warnungen = w0004.map(w => ({ code: w.code, text: w.text, datei: mehr ? w.pfad : null, zeile: w.z, spalte: w.s, d: info.get(w.pfad).d }));
  return { ok: true, ladeliste, dateien, ast, warnungen, args: aus.args, kiste: sammlung, name: aus.name, hauptdatei: haupt };
}

// Öffentliche Sicht von projekt.lade: ohne interne Felder (d an Warnungen bleibt am AST)
function projektLade(quelle) {
  const r = ladeProjekt(quelle);
  if (!r.ok) return r;
  return {
    ok: true, ladeliste: r.ladeliste.slice(), dateien: r.dateien.slice(), ast: r.ast,
    warnungen: r.warnungen.map(w => ({ code: w.code, text: w.text, datei: w.datei, zeile: w.zeile, spalte: w.spalte })),
    args: r.args.slice(), kiste: r.kiste, name: r.name, hauptdatei: r.hauptdatei
  };
}
