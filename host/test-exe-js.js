#!/usr/bin/env node
/*
 * Test für site/js/exe.js:  node host/test-exe-js.js
 *  - PizzaExe.baue(pkarton, ziel) liefert byte-genau dasselbe wie `pizza-host exe` mit demselben Host-Binary.
 *  - Prüfsumme/Größe werden geprüft, falsches .pkarton abgelehnt, Dateinamen/Hinweise.
 *  - Die erzeugte EXE läuft (für die Plattform, auf der der Test läuft).
 * Ziele: host/ziele/ (Ausgabe von baue-ziele.sh, falls vorhanden) und das lokale Release-Binary.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const PizzaExe = require(path.join(__dirname, '..', 'site', 'js', 'exe.js'));

let fehler = 0;
const ok = (b, t) => { console.log((b ? '  ✓  ' : '  ✗  ') + t); if (!b) fehler++; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pizza-exe-js-'));
const pkarton = fs.readFileSync(path.join(__dirname, 'tests', 'demo.pkarton'));

// Lokales Release-Binary bauen und als Ziel "lokal" anbieten. Linux ohne WebKitGTK-Entwicklerpakete: nur der
// Starter ohne Theke-Teil (src/starter.rs) – Konsolenprogramme laufen, das Fenster wird hier nicht gebraucht.
const ext = process.platform === 'win32' ? '.exe' : '';
const ohneWebkitDev = process.platform === 'linux' && spawnSync('pkg-config', ['--exists', 'webkit2gtk-4.1']).status !== 0;
if (ohneWebkitDev) console.log('  (WebKitGTK-Entwicklerpakete fehlen – lokales Binary als Starter ohne Theke-Teil)');
const r = spawnSync('cargo', ['build', '--quiet', '--release'].concat(ohneWebkitDev ? ['--no-default-features', '--features', 'starter'] : []), { cwd: __dirname, stdio: 'inherit' });
if (r.status !== 0) { console.error('cargo build fehlgeschlagen'); process.exit(2); }
const lokal = path.join(__dirname, 'target', 'release', 'pizza-host' + ext);

const verz = path.join(tmp, 'bin');
fs.mkdirSync(verz);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const ziele = [];
const lokalBytes = fs.readFileSync(lokal);
fs.copyFileSync(lokal, path.join(verz, 'lokal' + ext));
ziele.push({ id: process.platform === 'win32' ? 'windows-lokal' : 'linux-lokal', name: 'lokal', datei: 'lokal' + ext, endung: ext, groesse: lokalBytes.length, sha256: sha(lokalBytes), _pfad: lokal, _laeuft: true });
const zieleDir = path.join(__dirname, 'ziele');
if (fs.existsSync(path.join(zieleDir, 'ziele.json'))) {
  for (const z of JSON.parse(fs.readFileSync(path.join(zieleDir, 'ziele.json'), 'utf8')).ziele) {
    fs.copyFileSync(path.join(zieleDir, z.datei), path.join(verz, z.datei));
    const laeuft = (process.platform === 'win32' && z.id === 'windows-x64') || (process.platform === 'linux' && process.arch === 'x64' && z.id === 'linux-x64');
    ziele.push(Object.assign({}, z, { _pfad: path.join(zieleDir, z.datei), _laeuft: laeuft }));
  }
} else console.log('  (host/ziele fehlt – nur lokales Binary; Cross-Ziele mit sh host/baue-ziele.sh host/ziele)');
fs.writeFileSync(path.join(verz, 'ziele.json'), JSON.stringify({ version: 'test', ziele: ziele.map(({ _pfad, _laeuft, ...z }) => z) }));

// fetch-Ersatz: liest aus dem Testverzeichnis, zählt Aufrufe.
let abrufe = 0;
const dateiFetch = async (url) => {
  abrufe++;
  const p = path.join(tmp, url);
  if (!fs.existsSync(p)) return { ok: false, status: 404 };
  const b = fs.readFileSync(p);
  return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
};
const optionen = { basis: 'bin', fetch: dateiFetch };

(async () => {
  const liste = await PizzaExe.ziele(optionen);
  ok(liste.ziele.length === ziele.length, 'ziele() lädt ziele.json (' + liste.ziele.length + ' Ziele)');

  for (const z of ziele) {
    const blob = await PizzaExe.baue(new Uint8Array(pkarton), z.id, optionen);
    const bytes = Buffer.from(await blob.arrayBuffer());
    // Referenz: gleiche Bytes wie karton::baue_exe (Host + pkarton + u64 LE + "PKARTON1").
    const trailer = Buffer.alloc(16); trailer.writeBigUInt64LE(BigInt(pkarton.length)); trailer.write('PKARTON1', 8, 'latin1');
    const erwartet = Buffer.concat([fs.readFileSync(z._pfad), pkarton, trailer]);
    ok(bytes.equals(erwartet), z.id + ': Blob = Host + pkarton + Trailer (' + bytes.length + ' Bytes)');
    if (z._laeuft) {
      // Byte-Vergleich mit `pizza-host exe` desselben Binaries und Ausführung.
      const ziel = path.join(tmp, 'ref-' + z.id + ext);
      const e = spawnSync(z._pfad, ['exe', path.join(__dirname, 'tests', 'demo.pkarton'), '-o', ziel], { encoding: 'utf8' });
      ok(e.status === 0 && fs.readFileSync(ziel).equals(bytes), z.id + ': identisch mit `pizza-host exe`');
      const aus = path.join(tmp, PizzaExe.dateiname('demo.pizza', z));
      fs.writeFileSync(aus, bytes, { mode: 0o755 });
      const l = spawnSync(aus, ['Margherita'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      ok(l.status === 1 && l.stdout.replace(/\r/g, '') === 'Margherita\nHallo aus der EXE\n', z.id + ': erzeugte EXE läuft (Exit ' + l.status + ')');
    }
  }

  // Programm mit Theke (Import pizza.ui_senden) → Windows-EXE mit Subsystem WINDOWS (2), sonst CONSOLE (3);
  // byte-gleich mit `pizza-host exe`. Minimales Modul: Typ (i32,i32)->() + Import.
  const thekeKarton = Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 1, 6, 1, 0x60, 2, 0x7f, 0x7f, 0,
    2, 19, 1, 5, ...Buffer.from('pizza'), 9, ...Buffer.from('ui_senden'), 0, 0]);
  ok(await PizzaExe.brauchtTheke(thekeKarton) === true && await PizzaExe.brauchtTheke(pkarton) === false, 'brauchtTheke erkennt Importgruppe theke');
  for (const z of ziele) {
    const host = fs.readFileSync(z._pfad);
    const istPe = PizzaExe.subsystem(host) !== null;
    ok(istPe === /^windows/.test(z.id), z.id + ': PE erkannt = ' + istPe);
    const mit = Buffer.from(await (await PizzaExe.baue(thekeKarton, z.id, optionen)).arrayBuffer());
    const ohne = Buffer.from(await (await PizzaExe.baue(pkarton, z.id, optionen)).arrayBuffer());
    ok(PizzaExe.subsystem(mit) === (istPe ? 2 : null) && PizzaExe.subsystem(ohne) === (istPe ? 3 : null), z.id + ': Subsystem Theke/Konsole');
    if (z._laeuft) {
      const kp = path.join(tmp, 'theke.pkarton');
      fs.writeFileSync(kp, thekeKarton);
      const ziel = path.join(tmp, 'ref-theke-' + z.id + ext);
      const e = spawnSync(z._pfad, ['exe', kp, '-o', ziel], { encoding: 'utf8' });
      ok(e.status === 0 && fs.readFileSync(ziel).equals(mit), z.id + ': Theke-EXE identisch mit `pizza-host exe`');
      if (z.id === 'linux-x64') {
        // Starter: ohne WebKitGTK (hier simuliert) verständliche Meldung + Exit 2, kein Lader-Fehler, kein Fensterversuch.
        fs.chmodSync(ziel, 0o755);
        const l = spawnSync(ziel, [], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PIZZA_TEST_OHNE_WEBKIT: '1' }) });
        ok(l.status === 2 && /braucht WebKitGTK 4\.1.*sudo apt install libwebkit2gtk-4\.1-0/.test(l.stderr), z.id + ': Theke-EXE ohne WebKitGTK → Meldung, Exit 2 (' + l.status + ')');
      }
    }
  }

  const vorher = abrufe;
  await PizzaExe.baue(pkarton, ziele[0].id, optionen);
  ok(abrufe === vorher, 'Host-Binary wird zwischengespeichert');

  // Manipuliertes Binary → Prüfsumme.
  const falsch = Object.assign({}, ziele[0], { sha256: '0'.repeat(64), datei: ziele[0].datei });
  delete falsch._pfad; delete falsch._laeuft;
  let abgelehnt = false;
  // Zwischenspeicher umgehen: eigener basis-Pfad
  fs.mkdirSync(path.join(tmp, 'bin2'));
  fs.copyFileSync(path.join(verz, ziele[0].datei), path.join(tmp, 'bin2', ziele[0].datei));
  try { await PizzaExe.baue(pkarton, falsch, { basis: 'bin2/', fetch: dateiFetch }); abgelehnt = false; } catch (e) { abgelehnt = /Prüfsumme/.test(e.message); }
  ok(abgelehnt, 'falsche sha256 wird abgelehnt');

  let keinWasm = false;
  try { await PizzaExe.baue(new Uint8Array([1, 2, 3]), ziele[0].id, optionen); } catch (e) { keinWasm = /pkarton/.test(e.message); }
  ok(keinWasm, 'Bytes ohne \\0asm werden abgelehnt');

  ok(PizzaExe.dateiname('Hallo Welt.pizza', { id: 'windows-x64', endung: '.exe' }) === 'Hallo-Welt.exe', 'dateiname Windows');
  ok(PizzaExe.dateiname('hallo-welt', 'linux-x64') === 'hallo-welt-linux-x64', 'dateiname Linux');
  ok(/chmod \+x/.test(PizzaExe.hinweis('linux-x64')) && /SmartScreen/.test(PizzaExe.hinweis('windows-x64')), 'Hinweise');
  // Doppeltes Einbetten ersetzt den alten Anhang (wie karton::baue_exe).
  const zweimal = PizzaExe.verbinde(PizzaExe.verbinde(lokalBytes, pkarton), pkarton);
  ok(Buffer.from(zweimal).equals(Buffer.from(PizzaExe.verbinde(lokalBytes, pkarton))), 'erneutes Einbetten ersetzt Anhang');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fehler ? '\n' + fehler + ' Fehler' : '\nAlles gut.');
  process.exit(fehler ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
