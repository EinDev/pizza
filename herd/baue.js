#!/usr/bin/env node
'use strict';
/*
 * Baut den Herd-Kern und den Vorbacker (Rust no_std → wasm32v1-none, ohne wasm-bindgen, ohne Importe) und legt ab:
 *   site/js/herd/kern.wasm       (Binär, eingecheckt)
 *   site/js/herd/schema.json     (Schema der Komponenten aus dem Kern, eingecheckt)
 *   site/js/herd/teigling.wasm   (Vorbacker PNG/JPEG → Teigling, PROJEKTE.md §5.3, glTF → Modellteig, H-K16; Binär, eingecheckt)
 *   site/js/herd/klang.wasm      (Klang-Erzeuger: Töne, Rauschen, Noten → PCM 48 kHz, H-K14/K-153; Binär, eingecheckt)
 * Aufruf: node herd/baue.js [--ohne-cargo] [--pruefe]
 *   --pruefe: baut nichts, vergleicht schema.json mit dem eingecheckten kern.wasm und prüft teigling.wasm (keine Importe,
 *             Exporte, SHA-256 von "abc") und klang.wasm (keine Importe, Exporte, ein Golden-Hash) – Exit 1 bei Abweichung
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const HIER = __dirname;
const ZIEL = path.join(HIER, '..', 'site', 'js', 'herd');
const ROH = path.join(HIER, 'target', 'wasm32v1-none', 'release', 'herd_kern_wasm.wasm');
const ROH_TEIGLING = path.join(HIER, 'target', 'wasm32v1-none', 'release', 'herd_teigling_wasm.wasm');
const TEIGLING_EXPORTE = ['memory', 'abi_version', 'teigling_version', 'puffer', 'vorbacken', 'sha256', 'ergebnis', 'freigeben',
  'modell_version', 'modell_vorbacken', 'modell_braucht', 'klang_version', 'klang_vorbacken'];   // Modelle: H-K16, Klänge: H-K19a
const ROH_KLANG = path.join(HIER, 'target', 'wasm32v1-none', 'release', 'herd_klang_wasm.wasm');
const KLANG_EXPORTE = ['memory', 'abi_version', 'puffer', 'fehler_art', 'fehler_text', 'fehler_neu', 'ton', 'rauschen', 'stille', 'noten',
  'huelle', 'tiefpass', 'hochpass', 'verstaerke', 'mische', 'dann', 'wiederhole', 'nahtlos', 'dauer', 'hash', 'pcm', 'pcm_laenge',
  'laden', 'rate', 'kanaele'];

function schemaAus(bytes) {
  const m = new WebAssembly.Module(bytes);
  if (WebAssembly.Module.imports(m).length) throw new Error('kern.wasm darf keine Importe haben');
  const k = new WebAssembly.Instance(m, {}).exports;
  let kap = 1 << 16;
  for (;;) {
    const p = k.puffer(kap);
    const n = k.schema_json(p, kap);
    if (n <= kap) return Buffer.from(new Uint8Array(k.memory.buffer, p, n)).toString('utf8');
    kap = n;
  }
}

/** Prüft teigling.wasm: keine Importe, alle Exporte, SHA-256("abc"). Liefert die Zahl der Exporte. */
function pruefeTeigling(bytes) {
  const m = new WebAssembly.Module(bytes);
  if (WebAssembly.Module.imports(m).length) throw new Error('teigling.wasm darf keine Importe haben');
  const namen = WebAssembly.Module.exports(m).map((e) => e.name);
  for (const n of TEIGLING_EXPORTE) if (!namen.includes(n)) throw new Error('teigling.wasm: Export ' + n + ' fehlt');
  const t = new WebAssembly.Instance(m, {}).exports;
  const p = t.puffer(3);
  new Uint8Array(t.memory.buffer, p, 3).set([97, 98, 99]);
  t.sha256(p, 3);
  const hex = Buffer.from(new Uint8Array(t.memory.buffer, t.ergebnis(), 32)).toString('hex');
  if (hex !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') throw new Error('teigling.wasm: SHA-256 falsch');
  return namen.length;
}

/** Prüft klang.wasm: keine Importe, alle Exporte, Hash des ersten Golden-Tons (herd/klang/golden.txt). Liefert die Zahl der Exporte. */
function pruefeKlang(bytes) {
  const m = new WebAssembly.Module(bytes);
  if (WebAssembly.Module.imports(m).length) throw new Error('klang.wasm darf keine Importe haben');
  const namen = WebAssembly.Module.exports(m).map((e) => e.name);
  for (const n of KLANG_EXPORTE) if (!namen.includes(n)) throw new Error('klang.wasm: Export ' + n + ' fehlt');
  const k = new WebAssembly.Instance(m, {}).exports;
  const w = Buffer.from('sinus');
  const p = k.puffer(16);
  new Uint8Array(k.memory.buffer, p, w.length).set(w);
  const id = k.ton(440, 0.5, p, w.length, 0.5, 0, 0.005, 0.02);
  if (id !== 1 || k.hash(id, p) !== 16) throw new Error('klang.wasm: ton() fehlgeschlagen');
  const hex = Buffer.from(new Uint8Array(k.memory.buffer, p, 16)).toString('latin1');
  const golden = fs.readFileSync(path.join(HIER, 'klang', 'golden.txt'), 'utf8');
  const soll = (/^ton 440 0\.5 sinus 0\.5 0 0\.005 0\.02 = ([0-9a-f]{16})/m.exec(golden) || [])[1];
  if (hex !== soll) throw new Error('klang.wasm: Hash ' + hex + ' statt ' + soll + ' (herd/klang/golden.txt)');
  return namen.length;
}

const pruefe = process.argv.includes('--pruefe');
if (!pruefe && !process.argv.includes('--ohne-cargo')) {
  const r = cp.spawnSync('cargo', ['build', '-j', '2', '--release', '-p', 'herd-kern-wasm', '-p', 'herd-teigling-wasm', '-p', 'herd-klang-wasm', '--target', 'wasm32v1-none'], { cwd: HIER, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('cargo build fehlgeschlagen'); process.exit(1); }
}
if (pruefe) {
  const soll = schemaAus(fs.readFileSync(path.join(ZIEL, 'kern.wasm')));
  const ist = fs.readFileSync(path.join(ZIEL, 'schema.json'), 'utf8').replace(/\r\n/g, '\n');   // Checkout mit core.autocrlf liefert CRLF
  if (soll !== ist) { console.error('site/js/herd/schema.json ist nicht aktuell (node herd/baue.js)'); process.exit(1); }
  try { pruefeTeigling(fs.readFileSync(path.join(ZIEL, 'teigling.wasm'))); } catch (e) { console.error(e.message + ' (node herd/baue.js)'); process.exit(1); }
  try { pruefeKlang(fs.readFileSync(path.join(ZIEL, 'klang.wasm'))); } catch (e) { console.error(e.message + ' (node herd/baue.js)'); process.exit(1); }
  console.log('schema.json aktuell, teigling.wasm und klang.wasm in Ordnung');
  process.exit(0);
}
const bytes = fs.readFileSync(ROH);
const schema = schemaAus(bytes);
JSON.parse(schema); // muss gültiges JSON sein
const teigling = fs.readFileSync(ROH_TEIGLING);
const teiglingExporte = pruefeTeigling(teigling);
const klang = fs.readFileSync(ROH_KLANG);
const klangExporte = pruefeKlang(klang);
fs.mkdirSync(ZIEL, { recursive: true });
fs.writeFileSync(path.join(ZIEL, 'kern.wasm'), bytes);
fs.writeFileSync(path.join(ZIEL, 'schema.json'), schema);
fs.writeFileSync(path.join(ZIEL, 'teigling.wasm'), teigling);
fs.writeFileSync(path.join(ZIEL, 'klang.wasm'), klang);
const exporte = WebAssembly.Module.exports(new WebAssembly.Module(bytes)).length;
console.log('kern.wasm: ' + bytes.length + ' Bytes, ' + exporte + ' Exporte; schema.json: ' + schema.length + ' Bytes; teigling.wasm: ' + teigling.length + ' Bytes, ' + teiglingExporte + ' Exporte; klang.wasm: ' + klang.length + ' Bytes, ' + klangExporte + ' Exporte');
