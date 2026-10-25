#!/usr/bin/env node
/*
 * Herd-Sichtprüfung (HERD.md §8): führt ein pizza-Programm im Interpreter aus, zeichnet dabei alle verändernden Aufrufe
 * des Herd-ABI als Szenen-Skript (herd/README.md §7.1) auf und rendert gewünschte Bilder mit `herd-bild` offscreen auf dem
 * Software-Adapter (WARP/lavapipe, HERD_SOFTWARE=1 – nie die echte GPU, kein Fenster) zu PNGs.
 *
 *   node tests/herd/bild.js prog.pizza|projektordner [--ereignisse datei] [--bild n[,m…]] [--png ordner] [--groesse BxH]
 *                                      [--skript datei.herd] [--echtzeit ms] [--zone ms] [--schreibe] [--json] [--still]
 *
 * Projekt (PROJEKTE §1.5, §7): ein Ordner mit pizza.json bzw. eine .pizza darin läuft als Projekt (alle Dateien außer pruefung/);
 *               die Testdateien liegen dann in <ordner>/pruefung/ (ereignisse, herd-erwartet, erwartet) statt neben dem Programm.
 * --ereignisse  Renderer-Ereignisse (JSON-Lines; Standard: <prog>.ereignisse bzw. pruefung/ereignisse, sonst ein {"typ":"takt"})
 * --bild        Bildnummern (bildnummer des Herds), z. B. 1,60,120; „letztes“ = das letzte gesendete Bild (Standard)
 * --png         Ordner für die PNGs (<prog>-<n>.png); ohne --png wird nur aufgezeichnet und geprüft
 * --groesse     Zielgröße in Pixeln (Standard: Spielfeldgröße des Herds)
 * --skript      das aufgezeichnete Szenen-Skript zusätzlich hier speichern
 * --echtzeit    feste Wanduhr für Uhr.echt() (ms seit 1970, K-087), --zone fester Versatz für Uhr.zone() (ms, K-154) –
 *               wie die Manifestfelder echtzeit/zone (tests/herd/erwartet.js reicht sie durch)
 * --schreibe    <prog>.herd-erwartet (herd-Ereignisse ohne typ) und <prog>.erwartet (Ausgabe) neben dem Programm schreiben –
 *               bei Projekten pruefung/herd-erwartet und pruefung/erwartet; spielt das Programm Klang (K-153), auch
 *               <prog>.klang-erwartet bzw. pruefung/klang-erwartet (klang-Ereignisse ohne typ)
 * --json        die herd-Ereignisse (ohne typ) als JSON-Array ausgeben – für Doku-Blöcke (herdErwartet); dazu den
 *               Code des Blocks als .pizza und seine uiEreignisse als .ereignisse speichern (nach Kern-Änderungen neu erzeugen)
 * --still       keine Ausgabe des Programms anzeigen
 *
 * Selbstprüfung: Das Skript wird mit herd/skript.js gegen kern.wasm nachgespielt; jedes Bild muss dieselben Szenen- und
 * Paket-Hashes liefern wie der Interpreter-Lauf – dann zeigt herd-bild genau das Bild, das das Programm erzeugt hat.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2);
const MIT_WERT = ['--ereignisse', '--bild', '--png', '--groesse', '--skript', '--echtzeit', '--zone'];
const wert = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const datei = argv.find((a, i) => !a.startsWith('--') && !MIT_WERT.includes(argv[i - 1]));
if (!datei) {
  console.error('Aufruf: node tests/herd/bild.js prog.pizza [--ereignisse datei] [--bild n,m] [--png ordner] [--groesse BxH] [--skript datei.herd] [--schreibe]');
  process.exit(2);
}
// Projekt: Ordner mit pizza.json (bzw. .pizza darin) – gemeinsamer Leser scripts/beispiele.js
const BSP = require(path.join(ROOT, 'scripts', 'beispiele.js'));
const projektWurzel = BSP.findeProjekt(datei);
const hauptdatei = projektWurzel ? (fs.statSync(datei).isDirectory()
  ? (BSP.leseProjektdatei(path.join(projektWurzel, BSP.PROJEKTDATEI)).hauptdatei || BSP.HAUPTDATEI)
  : path.relative(projektWurzel, path.resolve(datei)).split(path.sep).join('/')) : null;
/** Testdatei des Programms: pruefung/<art> im Projekt, sonst <prog><endung> daneben. */
const testDatei = (art, endung) => projektWurzel ? path.join(projektWurzel, BSP.PRUEFUNG, art) : datei.replace(/\.pizza$/, endung);
const name = projektWurzel ? path.basename(projektWurzel) : path.basename(datei).replace(/\.pizza$/, '');
// Teiglinge aus Bildchen.laden: je Aufruf eine Datei im Temp-Ordner, im Skript als `teigling_datei "<pfad>"` (herd/README §7.1)
// (mit --skript bleiben sie neben dem Skript in <skript>-teige/, damit es sich später nachspielen lässt, z. B. herd-skript --mess)
const TEIGE = wert('--skript') ? path.resolve(wert('--skript').replace(/\.herd$/, '') + '-teige') : fs.mkdtempSync(path.join(os.tmpdir(), 'herd-teige-'));
if (wert('--skript')) fs.mkdirSync(TEIGE, { recursive: true });
else process.on('exit', () => { try { fs.rmSync(TEIGE, { recursive: true, force: true }); } catch (e) { /* egal */ } });
let teige = 0;

// ---------- Aufzeichnung: WebAssembly.Instance für kern.wasm umhüllen (die echten Exporte sind eingefroren) ----------
const ZEILEN = [];
let kernMem = null;
const zahl = (x) => Object.is(x, -0) ? '-0' : Number.isNaN(x) ? '(0/0)' : x === Infinity ? '(1/0)' : x === -Infinity ? '(-1/0)' : String(x);
const dec = new TextDecoder();
const u8 = () => new Uint8Array(kernMem.buffer);
const dv = () => new DataView(kernMem.buffer);
const textAn = (p, n) => JSON.stringify(dec.decode(u8().slice(p, p + n)));
function folge(p, n) {   // Folge aus u32 Länge + UTF-8
  const aus = [], d = dv();
  let o = p;
  while (o < p + n) { const l = d.getUint32(o, true); aus.push(dec.decode(u8().slice(o + 4, o + 4 + l))); o += 4 + l; }
  return aus;
}
const f64s = (p, n) => { const d = dv(); return Array.from({ length: n }, (_, i) => zahl(d.getFloat64(p + 8 * i, true))); };
const u32s = (p, n) => { const d = dv(); return Array.from({ length: n }, (_, i) => d.getUint32(p + 4 * i, true)); };

// je verändernder Aufruf: Argumente → Skript-Argumente (vor dem Aufruf gelesen, der Austauschpuffer wird wiederverwendet)
const I = (a) => String(a | 0), F = zahl;
const AUFZEICHNEN = {
  welt_neu: (a) => [F(a[0]), F(a[1]), textAn(a[2], a[3])],
  welt_titel: (a) => [textAn(a[0], a[1])],
  welt_hintergrund: (a) => [textAn(a[0], a[1])],
  welt_himmel: (a) => [textAn(a[0], a[1]), a[3] ? textAn(a[2], a[3]) : textAn(a[0], a[1])],
  welt_umgebung: (a) => [textAn(a[0], a[1]), F(a[2])],
  welt_nebel: (a) => [textAn(a[0], a[1]), F(a[2]), F(a[3])],
  teil_neu: (a) => [I(a[0])], teil_entferne: (a) => [I(a[0])], teil_kopie: (a) => [I(a[0])],
  teil_haenge: (a) => [I(a[0]), I(a[1])],
  teil_setze: (a) => [I(a[0]), I(a[1]), F(a[2])],
  teil_lage: (a) => [I(a[0]), F(a[1]), F(a[2]), F(a[3])],
  teil_verschiebe: (a) => [I(a[0]), F(a[1]), F(a[2]), F(a[3])],
  teil_groesse: (a) => [I(a[0]), F(a[1]), F(a[2]), F(a[3])],
  teil_schaue: (a) => [I(a[0]), F(a[1]), F(a[2]), F(a[3])],
  komp_neu: (a) => [I(a[0])], komp_haenge: (a) => [I(a[0]), I(a[1])], komp_loese: (a) => [I(a[0])],
  setze_zahl: (a) => [I(a[0]), I(a[1]), F(a[2])],
  setze_text: (a) => [I(a[0]), I(a[1]), textAn(a[2], a[3])],
  setze_liste: (a) => [I(a[0]), I(a[1]), '[' + u32s(a[2], a[3]).join(', ') + ']'],
  setze_zahlen: (a) => [I(a[0]), I(a[1]), '[' + f64s(a[2], a[3]).join(', ') + ']'],
  form_grund: (a) => [I(a[0]), F(a[1]), F(a[2])],
  form_eigene: (a) => ['[' + f64s(a[0], a[1]).join(', ') + ']', '[' + f64s(a[2], a[3]).join(', ') + ']', I(a[4])],
  bildchen_neu: (a) => {
    const z = folge(a[0], a[1]), f = folge(a[2], a[3]), paare = [];
    for (let i = 0; i + 1 < f.length; i += 2) paare.push('[' + JSON.stringify(f[i]) + ', ' + JSON.stringify(f[i + 1]) + ']');
    return ['[' + z.map(t => JSON.stringify(t)).join(', ') + ']', '[' + paare.join(', ') + ']'];
  },
  bildchen_rgba: (a) => [I(a[0]), I(a[1]), '[' + Array.from(u8().slice(a[2], a[2] + a[0] * a[1] * 4)).join(',') + ']'],
  eingabe: (a) => [F(a[0]), F(a[1]), I(a[2])], takt: () => [], paket_voll: () => [],
  bild: (a) => [I(a[0])],
  bildchen_teigling: (a) => {
    const p = path.join(TEIGE, 't' + (++teige) + '.teigling');
    fs.writeFileSync(p, u8().slice(a[0], a[0] + a[1]));
    return [JSON.stringify(p)];
  },
};
const UMBENANNT = { bildchen_teigling: 'teigling_datei' };
let istKern = false;
const EchteInstanz = WebAssembly.Instance;
function Huelle(modul, importe) {
  const echt = new EchteInstanz(modul, importe);
  const namen = WebAssembly.Module.exports(modul).map(e => e.name);
  if (!namen.includes('welt_neu') || !namen.includes('bild_zeiger')) return echt;
  istKern = true;
  kernMem = echt.exports.memory;
  const ex = {};
  for (const n of namen) {
    const f = echt.exports[n];
    const auf = AUFZEICHNEN[n];
    if (typeof f !== 'function' || !auf) { ex[n] = f; continue; }
    ex[n] = (...a) => {
      const args = auf(a), zeile = (UMBENANNT[n] || n) + (args.length ? ' ' + args.join(' ') : '');
      const r = f(...a);
      if (!(typeof r === 'number' && r < 0)) ZEILEN.push(zeile);   // fehlgeschlagene Aufrufe ändern nichts
      return r;
    };
  }
  return { exports: ex };
}
Huelle.prototype = EchteInstanz.prototype;
WebAssembly.Instance = Huelle;

const P = require(path.join(ROOT, 'site', 'js', 'pizza.js'));

// ---------- Lauf ----------
let evDatei = wert('--ereignisse');
if (evDatei === null && fs.existsSync(testDatei('ereignisse', '.ereignisse'))) evDatei = testDatei('ereignisse', '.ereignisse');
const ereignisse = evDatei !== null
  ? fs.readFileSync(evDatei, 'utf8').split(/\r?\n/).filter(z => z.trim()).map(z => JSON.parse(z))
  : [{ typ: 'takt' }];
const quelle = projektWurzel ? { dateien: BSP.leseOrdner(projektWurzel), hauptdatei } : fs.readFileSync(datei, 'utf8');
const t0 = process.hrtime.bigint();
const laufOpt = { uiEreignisse: ereignisse };
if (wert('--echtzeit') !== null) laufOpt.echtzeit = Number(wert('--echtzeit'));
if (wert('--zone') !== null) laufOpt.zone = Number(wert('--zone'));
const r = P.run(quelle, laufOpt);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
WebAssembly.Instance = EchteInstanz;

const still = argv.includes('--still') || argv.includes('--json');
const ausgabe = [];
for (const e of r.ereignisse) {
  if (e.typ === 'ausgabe') ausgabe.push(e.umbruch === false ? e.text : e.text + '\n');
  else if (e.typ === 'fehlerausgabe') ausgabe.push(e.text + '\n');
  else if (e.typ === 'panik') ausgabe.push(e.text + '\n');
  else if (e.typ === 'leeren') ausgabe.push('«leeren»\n');
}
if (!still) process.stdout.write(ausgabe.join(''));
for (const e of r.ereignisse) if (e.typ === 'warnung' || e.typ === 'fehler') console.log('[' + e.typ + '] ' + e.text);
const herd = r.ereignisse.filter(e => e.typ === 'herd').map(e => { const o = Object.assign({}, e); delete o.typ; return o; });
const bilder = herd.filter(e => e.art === 'bild');
const fenster = herd.find(e => e.art === 'fenster');
const ende = r.ereignisse[r.ereignisse.length - 1];
console.log('Exit ' + r.exitCode + ' · ' + bilder.length + ' Bilder · ' + ms.toFixed(0) + ' ms im Interpreter' +
  (bilder.length ? ' (' + (ms / bilder.length).toFixed(2) + ' ms je Bild)' : '') +
  (ende && typeof ende.schritte === 'number' ? ' · ' + ende.schritte + ' Schritte' : '') + ' · ' + ZEILEN.length + ' ABI-Aufrufe aufgezeichnet');
if (!istKern) { console.log('Kein Herd-Kern benutzt – nichts zu zeigen.'); process.exit(r.exitCode ? 1 : 0); }

if (argv.includes('--json')) {
  console.log('[\n' + herd.map(e => '  ' + JSON.stringify(e)).join(',\n') + '\n]');
}
if (argv.includes('--schreibe')) {
  const he = testDatei('herd-erwartet', '.herd-erwartet'), er = testDatei('erwartet', '.erwartet');
  fs.mkdirSync(path.dirname(he), { recursive: true });
  fs.writeFileSync(he, herd.map(e => JSON.stringify(e) + '\n').join(''));
  fs.writeFileSync(er, ausgabe.join(''));
  console.log('geschrieben: ' + he + ', ' + er);
  const klang = r.ereignisse.filter(e => e.typ === 'klang').map(e => { const o = Object.assign({}, e); delete o.typ; return o; });
  if (klang.length) {
    const ke = testDatei('klang-erwartet', '.klang-erwartet');
    fs.writeFileSync(ke, klang.map(e => JSON.stringify(e) + '\n').join(''));
    console.log('geschrieben: ' + ke + ' (' + klang.length + ' Klang-Ereignisse)');
  }
}

// ---------- Skript ----------
const breite = fenster ? fenster.breite : 640, hoehe = fenster ? fenster.hoehe : 360;
const skriptText = '# aufgezeichnet von tests/herd/bild.js aus ' + (projektWurzel ? name + '/' + hauptdatei : path.basename(datei)) + '\n' + ZEILEN.join('\n') + '\n';
if (wert('--skript')) fs.writeFileSync(wert('--skript'), skriptText);

// Selbstprüfung: Nachspielen gegen kern.wasm, Hashes je Bild vergleichen
{
  const { lies, Spieler } = require(path.join(ROOT, 'herd', 'skript.js'));
  const modul = new WebAssembly.Module(fs.readFileSync(path.join(ROOT, 'site', 'js', 'herd', 'kern.wasm')));
  const sp = new Spieler(new WebAssembly.Instance(modul, {}));
  sp.nurBilder = true;
  const b = sp.spiele(lies(skriptText)).filter(z => z.startsWith('B '));
  const soll = bilder.map(e => 'B ' + e.bildnummer + ' ' + e.szene + ' ' + e.paket);
  const erste = soll.findIndex((z, i) => z !== b[i]);
  if (erste >= 0 || b.length !== soll.length) {
    console.error('Selbstprüfung: Nachspielen weicht ab bei Bild ' + (erste >= 0 ? erste + 1 : soll.length + 1) + ':\n  Lauf    ' + (soll[erste] || '–') + '\n  Skript  ' + (b[erste] || '–'));
    process.exit(1);
  }
  console.log('Selbstprüfung: alle ' + soll.length + ' Bilder bitgleich nachgespielt');
}

// ---------- Rendern ----------
const pngOrdner = wert('--png');
if (pngOrdner === null) process.exit(0);
if (!bilder.length) { console.error('Keine Bilder gesendet.'); process.exit(1); }
let nummern = (wert('--bild') || 'letztes').split(',').map(s => s.trim()).filter(Boolean)
  .map(s => s === 'letztes' ? bilder[bilder.length - 1].bildnummer : Number(s));
const gibt = new Set(bilder.map(e => e.bildnummer));
for (const n of nummern) if (!gibt.has(n)) { console.error('Bild ' + n + ' wurde nicht gesendet (gesendet: ' + bilder.map(e => e.bildnummer).join(',') + ').'); process.exit(2); }
const groesse = wert('--groesse') || (breite + 'x' + hoehe);
const kandidaten = ['debug', 'release'].map(p => path.join(ROOT, 'herd', 'target', p, 'herd-bild' + (process.platform === 'win32' ? '.exe' : '')))
  .filter(p => fs.existsSync(p)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
if (!kandidaten.length) { console.error('herd-bild fehlt: cargo build -j 2 -p herd-werkzeug (im Ordner herd/).'); process.exit(2); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'herd-bild-'));
const skriptDatei = path.join(tmp, name + '.herd');
fs.writeFileSync(skriptDatei, skriptText);
fs.mkdirSync(pngOrdner, { recursive: true });
const env = Object.assign({}, process.env, { HERD_SOFTWARE: '1' });
delete env.HERD_GPU;
const lauf = spawnSync(kandidaten[0], ['bild', skriptDatei, pngOrdner, '--bilder=' + nummern.join(','), '--groesse=' + groesse],
  { windowsHide: true, env, encoding: 'utf8', maxBuffer: 1 << 26 });
fs.rmSync(tmp, { recursive: true, force: true });
if (lauf.status !== 0) { console.error('herd-bild: ' + (lauf.stderr || lauf.error)); process.exit(1); }
process.stderr.write(lauf.stderr.split('\n').filter(z => /Adapter/.test(z)).map(z => z + '\n').join(''));
process.stdout.write(lauf.stdout);
