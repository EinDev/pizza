#!/usr/bin/env node
'use strict';
/*
 * Bitgleich-Test des Vorbackers (PROJEKTE.md §5.3, K-147, blockierend): Jeder goldene Fall aus herd/teigling (Testbilder
 * entstehen im Rust-Erzeuger `testbild.rs`, keine Binärdateien im Repo) wird
 *   - nativ vorgebacken (herd-teigling, gleiche Quelle wie teigling.wasm) und
 *   - mit site/js/herd/teigling.wasm über die JS-Hülle site/js/herd/teigling.js
 * und beide Teiglinge müssen **dieselben Bytes** haben (SHA-256 + Länge) und mit herd/teigling/golden.txt übereinstimmen.
 * Dazu: SHA-256 der Hülle = node:crypto, Kopf-Leser, passt/besorge (Cache-Prüfung §5.4), Teigmenge und MB-Text (P0020).
 * Modelle (H-K16) und Klänge (H-K19a): Testdateien unter herd/teigling/testmodelle bzw. testklaenge, wasm = golden-modelle.txt
 * bzw. golden-klaenge.txt (die cargo test -p herd-teigling nativ prüft), Kopf-Leser, besorge, Teig-/Klangmenge.
 * Aufruf: node herd/test-teigling.js [--ohne-cargo]
 * Gedrosselt: cargo mit -j 2, Kindprozesse ohne Fenster (windowsHide).
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const assert = require('assert');
const PizzaVorbacker = require('../site/js/herd/teigling.js');

const HIER = __dirname;
const EXE = path.join(HIER, 'target', 'debug', 'herd-teigling' + (process.platform === 'win32' ? '.exe' : ''));
const ORDNER = path.join(HIER, 'target', 'teigling-faelle');
const GOLDEN = path.join(HIER, 'teigling', 'golden.txt');

if (!process.argv.includes('--ohne-cargo')) {
  const r = cp.spawnSync('cargo', ['build', '-j', '2', '-p', 'herd-teigling', '--features', 'testbilder', '--bin', 'herd-teigling'],
    { cwd: HIER, stdio: 'inherit', env: { ...process.env, CARGO_BUILD_JOBS: '2' }, windowsHide: true, shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('cargo build -p herd-teigling fehlgeschlagen'); process.exit(1); }
}
fs.rmSync(ORDNER, { recursive: true, force: true });
const r = cp.spawnSync(EXE, ['faelle', ORDNER], { encoding: 'utf8', maxBuffer: 1 << 26, windowsHide: true });
if (r.status !== 0) { console.error('herd-teigling faelle: ' + r.stderr); process.exit(1); }
const nativ = r.stdout.split('\n').map((z) => z.trim()).filter(Boolean);
const golden = fs.readFileSync(GOLDEN, 'utf8').split(/\r?\n/).map((z) => z.trim()).filter((z) => z && !z.startsWith('#'));

const vb = PizzaVorbacker.node();
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let fehler = 0;
const melde = (t) => { fehler++; console.log('FEHL ' + t); };

if (nativ.length !== golden.length) melde('nativ ' + nativ.length + ' Fälle, golden.txt ' + golden.length);
const teiglinge = {};
const t0 = Date.now();
for (let i = 0; i < nativ.length; i++) {
  const [name, natSha, natLen] = nativ[i].split(' ');
  if (golden[i] !== nativ[i]) melde(name + ': nativ ≠ golden.txt (' + nativ[i] + ' / ' + golden[i] + ')');
  const quelle = new Uint8Array(fs.readFileSync(path.join(ORDNER, name + '.quelle')));
  const t = vb.vorbacken(quelle);
  const ws = sha(t);
  if (ws !== natSha || String(t.length) !== natLen) { melde(name + ': wasm ' + ws + ' ' + t.length + ' ≠ nativ ' + natSha + ' ' + natLen); continue; }
  if (PizzaVorbacker.hex(vb.sha256(quelle)) !== sha(quelle)) melde(name + ': sha256 der Hülle ≠ node:crypto');
  const k = PizzaVorbacker.kopf(t);
  if (!k) { melde(name + ': Kopf ungültig'); continue; }
  if (k.sha256 !== sha(quelle)) melde(name + ': SHA-256 im Kopf ≠ Quelle');
  if (!vb.passt(t, quelle)) melde(name + ': passt() = nein');
  teiglinge[name] = t;
}
const t1 = Date.now();

// Kopf-Leser und Fehler-Teiglinge
const kz = PizzaVorbacker.kopf(teiglinge['png-zu-gross-70000x10']);
assert.deepStrictEqual(kz && kz.fehler, { code: 2, art: 'zu-gross', breite: 70000, hoehe: 10 });
assert.deepStrictEqual(PizzaVorbacker.kopf(teiglinge['png-fehler-crc']).fehler, { code: 1, art: 'kein-bild', breite: 0, hoehe: 0 });
const kj = PizzaVorbacker.kopf(teiglinge['jpeg-420-ungerade']);
assert.strictEqual(kj.breite, 37); assert.strictEqual(kj.hoehe, 23); assert.strictEqual(kj.stufen, 6); assert.strictEqual(kj.jpeg, true);
assert.strictEqual(PizzaVorbacker.kopf(teiglinge['png-typ6-8bit']).durchsichtig, true);
const s0 = PizzaVorbacker.stufe(teiglinge['png-1x9'], 0);
assert.strictEqual(s0.rgba.length, 1 * 9 * 4);
assert.strictEqual(PizzaVorbacker.stufe(teiglinge['png-1x9'], 3).hoehe, 1);
// verfälschter Teigling / fremde Quelle → passt nicht, besorge backt neu
const q = new Uint8Array(fs.readFileSync(path.join(ORDNER, 'png-1x1.quelle')));
const echt = teiglinge['png-1x1'];
const kaputt = echt.slice(); kaputt[11] ^= 1;
assert.strictEqual(PizzaVorbacker.kopf(kaputt), null);
assert.strictEqual(vb.passt(kaputt, q), false);
assert.strictEqual(vb.passt(teiglinge['png-1x9'], q), false);
assert.strictEqual(sha(vb.besorge(teiglinge['png-1x9'], q)), sha(echt));
assert.strictEqual(vb.besorge(echt, q), echt);
assert.strictEqual(sha(vb.besorge(null, q)), sha(echt));
// Teigmenge: gleiche Quelle unter zwei Pfaden zählt einmal, Fehler-Teiglinge nicht
const menge = PizzaVorbacker.teigmenge({ 'a.png': echt, 'b.png': echt, 'c.png': teiglinge['png-fehler-crc'], 'd.jpg': teiglinge['jpeg-1x1'] });
assert.strictEqual(menge, echt.length + teiglinge['jpeg-1x1'].length);
assert.strictEqual(PizzaVorbacker.megabyte(67108864), '64,0');
assert.strictEqual(PizzaVorbacker.megabyte(67108865), '64,1');
assert.strictEqual(PizzaVorbacker.megabyte(89478880), '85,4');
assert.strictEqual(PizzaVorbacker.teigmengeFehler(67108864), null);
assert.strictEqual(PizzaVorbacker.teigmengeFehler(67108865), 'Die Bilder sind zusammen zu groß für den Ofen (64,1 MB vorgebacken, höchstens 64 MB).');
assert.strictEqual(PizzaVorbacker.teigmengeFehler(89478880), 'Die Bilder sind zusammen zu groß für den Ofen (85,4 MB vorgebacken, höchstens 64 MB).');
assert.strictEqual(PizzaVorbacker.cacheSchluessel('ab'), 'ab/teigling/1');

// ---------- Modelle (H-K16): goldene Modellteige (cargo test -p herd-teigling schreibt/prüft golden-modelle.txt nativ) ----------
const TM = path.join(HIER, 'teigling', 'testmodelle');
const sammlung = {};
const geh = (abs, rel) => { for (const e of fs.readdirSync(abs, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) geh(path.join(abs, e.name), r); else sammlung[r] = new Uint8Array(fs.readFileSync(path.join(abs, e.name))); } };
geh(TM, '');
const goldenM = fs.readFileSync(path.join(HIER, 'teigling', 'golden-modelle.txt'), 'utf8').split(/\r?\n/).map((z) => z.trim()).filter((z) => z && !z.startsWith('#'));
assert.strictEqual(vb.hatModelle, true, 'teigling.wasm kennt Modelle');
const teige = {};
const t2 = Date.now();
for (const z of goldenM) {
  const [name, gSha, gLen] = z.split(' ');
  const { teig, paket } = vb.modellAusSammlung(name, sammlung);
  if (sha(teig) !== gSha || String(teig.length) !== gLen) { melde(name + ': wasm ' + sha(teig) + ' ' + teig.length + ' ≠ golden-modelle.txt ' + gSha + ' ' + gLen); continue; }
  const k = PizzaVorbacker.modellKopf(teig);
  if (!k) { melde(name + ': Modellkopf ungültig'); continue; }
  if (k.sha256 !== sha(paket)) melde(name + ': SHA-256 im Kopf ≠ Quellpaket');
  if (!k.fehler && vb.modellBesorge(teig, name, sammlung) !== teig) melde(name + ': modellBesorge verwirft einen passenden Teig');
  teige[name] = teig;
}
const t3 = Date.now();
const kw = PizzaVorbacker.modellKopf(teige['wuerfel.glb']);
assert.deepStrictEqual([kw.ecken, kw.dreiecke, kw.knoten, kw.netze, kw.materialien, kw.bilder, kw.fehler], [24, 12, 1, 1, 1, 0, null]);
assert.strictEqual(kw.sha256, sha(sammlung['wuerfel.glb']), '.glb ohne Nachbardateien: SHA-256 der Datei');
assert.deepStrictEqual(PizzaVorbacker.modellKopf(teige['fehler-draco.glb']).fehler, { code: 2, text: 'braucht die Erweiterung KHR_draco_mesh_compression – die kann der Herd nicht.' });
assert.deepStrictEqual(vb.modellBraucht('m/textur.gltf', sammlung['textur.gltf']).map((d) => d.uri + ' ' + d.pfad).slice(0, 2), ['textur.bin m/textur.bin', 'bilder/farbe.png m/bilder/farbe.png']);
// veralteter/fremder Teig → neu gebacken; Teigmenge: Modelle ohne Fehler, eingebettete Bilder je Quelle einmal (auch über Bilddateien)
assert.strictEqual(sha(vb.modellBesorge(teige['wuerfel.glb'], 'textur.gltf', sammlung)), sha(teige['textur.gltf']));
const mT = PizzaVorbacker.teigmenge({ a: teige['textur.gltf'], b: teige['textur-eingebettet.gltf'], c: teige['fehler-kaputt.glb'] });
const farbeTeigling = vb.vorbacken(sammlung['bilder/farbe.png']);
assert.ok(mT < teige['textur.gltf'].length + teige['textur-eingebettet.gltf'].length, 'gleiche Bilder in zwei Modellen zählen einmal');
assert.strictEqual(PizzaVorbacker.teigmenge({ a: teige['textur.gltf'], b: teige['textur-eingebettet.gltf'], f: farbeTeigling }), mT, 'Bilddatei = eingebettetes Bild');
assert.strictEqual(PizzaVorbacker.teigmenge({ w: teige['wuerfel.glb'] }), teige['wuerfel.glb'].length);
assert.strictEqual(PizzaVorbacker.teigmengeFehler(67108865, true), 'Die Bilder und Modelle sind zusammen zu groß für den Ofen (64,1 MB vorgebacken, höchstens 64 MB).');
assert.strictEqual(PizzaVorbacker.modellCacheSchluessel('ab'), 'ab/modell/1');

// ---------- Klänge (H-K19a): goldene Klangteige (cargo test -p herd-teigling prüft golden-klaenge.txt und erwartet.txt nativ) ----------
const TK = path.join(HIER, 'teigling', 'testklaenge');
const goldenK = fs.readFileSync(path.join(HIER, 'teigling', 'golden-klaenge.txt'), 'utf8').split(/\r?\n/).map((z) => z.trim()).filter((z) => z && !z.startsWith('#'));
const erwK = {};
for (const z of fs.readFileSync(path.join(TK, 'erwartet.txt'), 'utf8').split(/\r?\n/)) if (z && !z.startsWith('#')) { const i = z.indexOf(' '); erwK[z.slice(0, i)] = z.slice(i + 1); }
assert.strictEqual(vb.hatKlaenge, true, 'teigling.wasm kennt Klänge');
assert.strictEqual(goldenK.length, Object.keys(erwK).length, 'golden-klaenge.txt und erwartet.txt haben dieselben Dateien');
const klaenge = {}, klangQuellen = {};
const t4 = Date.now();
for (const z of goldenK) {
  const [name, gSha, gLen] = z.split(' ');
  const quelle = new Uint8Array(fs.readFileSync(path.join(TK, name)));
  const teig = vb.klangVorbacken(quelle);
  if (sha(teig) !== gSha || String(teig.length) !== gLen) { melde(name + ': wasm ' + sha(teig) + ' ' + teig.length + ' ≠ golden-klaenge.txt ' + gSha + ' ' + gLen); continue; }
  const k = PizzaVorbacker.klangKopf(teig);
  if (!k) { melde(name + ': Klangkopf ungültig'); continue; }
  if (k.sha256 !== sha(quelle)) melde(name + ': SHA-256 im Kopf ≠ Quelle');
  const e = erwK[name];
  if (e.startsWith('fehler ')) {
    const m = /^fehler (\d+) (.*)$/.exec(e);
    if (!k.fehler || k.fehler.code !== +m[1] || k.fehler.text !== m[2]) melde(name + ': Fehler ' + JSON.stringify(k.fehler) + ' statt ' + e);
  } else {
    const f = e.split(' ');
    const ist = [k.rate, k.kanaele, k.bits, k.frames, (k.flac ? 1 : 0) | (k.float ? 2 : 0), sha(teig.subarray(64))].join(' ');
    if (k.fehler || ist !== f.slice(0, 6).join(' ')) melde(name + ': Klangkopf/PCM ' + ist + ' statt ' + f.slice(0, 6).join(' '));
    if (k.pcmBytes !== teig.length - 64 || k.dauer !== k.frames / k.rate) melde(name + ': pcmBytes/dauer');
    if (vb.klangBesorge(teig, quelle) !== teig) melde(name + ': klangBesorge verwirft einen passenden Teig');
  }
  if (PizzaVorbacker.istKlangPfad('klaenge/' + name) !== /\.(wav|flac)$/.test(name)) melde(name + ': istKlangPfad');
  klaenge[name] = teig; klangQuellen[name] = quelle;
}
const t5 = Date.now();
// Kopf-Leser wie Rust (klang_tests::kopf_pruefung): Felder, Längen, Fehler-Teig
const kt = klaenge['wav-16-stereo.wav'], kk = PizzaVorbacker.klangKopf(kt);
assert.deepStrictEqual([kk.rate, kk.kanaele, kk.bits, kk.frames, kk.dauer, kk.flac, kk.float, kk.pcmBytes, kk.fehler], [44100, 2, 16, 1000, 1000 / 44100, false, false, 4000, null]);
for (const l of [kt.length - 1, kt.length + 1, 63, 64]) { const v = new Uint8Array(l); v.set(kt.subarray(0, Math.min(l, kt.length))); assert.strictEqual(PizzaVorbacker.klangKopf(v), null, 'Länge ' + l); }
for (const i of [0, 7, 8, 9, 10, 11, 13, 52, 53, 55, 56, 57, 60, 63]) { const v = kt.slice(); v[i] ^= 4; assert.strictEqual(PizzaVorbacker.klangKopf(v), null, 'Byte ' + i); }
{ const v = kt.slice(); v[12] ^= 1; assert.strictEqual(PizzaVorbacker.klangKopf(v).flac, true); v[12] ^= 3; assert.strictEqual(PizzaVorbacker.klangKopf(v), null, 'Float mit 16 bit'); }
{ const v = kt.slice(); v[20] ^= 0xFF; assert.ok(PizzaVorbacker.klangKopf(v), 'SHA-256 ist frei'); }
const kf = klaenge['fehler-kanaele.wav'];
assert.deepStrictEqual(PizzaVorbacker.klangKopf(kf).fehler, { code: 4, text: 'hat 6 Kanäle – höchstens 2 (Mono oder Stereo).' });
for (const [i, x] of [[64, 7], [64, 0], [66, 1], [12, 1], [50, 1], [63, 1]]) { const v = kf.slice(); v[i] = x; assert.strictEqual(PizzaVorbacker.klangKopf(v), null, 'Fehler-Teig Byte ' + i); }
{ const v = kf.slice(); v[v.length - 1] = 0xFF; assert.strictEqual(PizzaVorbacker.klangKopf(v), null, 'kein UTF-8'); }
assert.strictEqual(PizzaVorbacker.klangKopf(klaenge['klick-24.flac']).flac, true);
assert.strictEqual(PizzaVorbacker.klangKopf(klaenge['wav-float-mono.wav']).float, true);
assert.strictEqual(PizzaVorbacker.klangKopf(teiglinge['png-1x1']), null, 'Teigling ist kein Klangteig');
// besorge: fremder/verfälschter/Fehler-Teig → neu gebacken
const qt = klangQuellen['ton-mono.wav'], tt = klaenge['ton-mono.wav'];
assert.strictEqual(sha(vb.klangBesorge(klaenge['akkord-stereo.flac'], qt)), sha(tt));
assert.strictEqual(sha(vb.klangBesorge(null, qt)), sha(tt));
{ const v = tt.slice(); v[52] = 3; assert.strictEqual(sha(vb.klangBesorge(v, qt)), sha(tt)); }
assert.strictEqual(sha(vb.klangBesorge(klaenge['fehler-kaputt.wav'], klangQuellen['fehler-kaputt.wav'])), sha(klaenge['fehler-kaputt.wav']));
// Klangmenge: gleiche Quelle zweimal zählt einmal, Fehler-Teige und Teiglinge nicht; Klangteige nicht in der Teigmenge
const km = PizzaVorbacker.klangmenge({ a: tt, b: tt, c: klaenge['akkord-stereo.flac'], d: klaenge['fehler-rate.wav'], e: teiglinge['png-1x1'] });
assert.strictEqual(km, tt.length + klaenge['akkord-stereo.flac'].length);
assert.strictEqual(PizzaVorbacker.klangmenge([tt, klaenge['ton-mono.wav']]), tt.length);
assert.strictEqual(PizzaVorbacker.teigmenge({ k: tt }), 0, 'Klangteige zählen nicht zur Teigmenge');
assert.strictEqual(PizzaVorbacker.klangmengeFehler(67108864), null);
assert.strictEqual(PizzaVorbacker.klangmengeFehler(67108865), 'Die Klänge sind zusammen zu groß für den Ofen (64,1 MB vorgebacken, höchstens 64 MB).');
assert.strictEqual(PizzaVorbacker.klangmengeFehler(73610000), 'Die Klänge sind zusammen zu groß für den Ofen (70,2 MB vorgebacken, höchstens 64 MB).');
assert.strictEqual(PizzaVorbacker.MAX_KLANGMENGE, 67108864);
assert.strictEqual(PizzaVorbacker.klangCacheSchluessel('ab'), 'ab/klang/1');
assert.deepStrictEqual(['a.wav', 'b/c.flac', 'd.WAV', 'e.ogg', 'f.wav.txt'].map(PizzaVorbacker.istKlangPfad), [true, true, false, false, false]);

if (fehler) { console.log(fehler + ' Abweichung(en)'); process.exit(1); }
console.log('Vorbacker nativ = teigling.wasm = golden.txt: ' + nativ.length + ' Fälle bitgleich (wasm ' + (t1 - t0) + ' ms), Hülle geprüft');
console.log('Modelle nativ = teigling.wasm = golden-modelle.txt: ' + goldenM.length + ' Testmodelle bitgleich (wasm ' + (t3 - t2) + ' ms)');
console.log('Klänge nativ = teigling.wasm = golden-klaenge.txt: ' + goldenK.length + ' Testklänge bitgleich (wasm ' + (t5 - t4) + ' ms)');
