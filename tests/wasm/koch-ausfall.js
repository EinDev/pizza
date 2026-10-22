'use strict';
/*
 * Ein Koch stirbt mitten im Stück (K-104/10 h). Läuft als eigener Prozess (tests/wasm/run.js startet ihn mit Zeitgrenze),
 * weil der aufrufende Thread während einer Brigade blockiert – ein Hängen fängt nur die Zeitgrenze von außen.
 *
 * Ablauf: Pool mit 4 Köchen, kurze Nachkoch-Frist. Sobald der aufrufende Thread wartet und ein Koch gerade an einem Stück
 * kocht, beendet der Test-Haken diesen Worker per terminate(). Erwartet: Ergebnis gleich Interpreter, mindestens ein
 * Stück nachgekocht; eine zweite Brigade auf demselben Pool läuft ohne den toten Koch (3 statt 4); nach einer Runde der
 * Ereignisschleife ist er auch per exit-Ereignis aus dem Pool. Ausgabe: eine JSON-Zeile.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const Z = require(path.join(ROOT, 'site', 'js', 'pizzaiolo.js'));
const P = require(path.join(ROOT, 'site', 'js', 'pizza.js'));
const koch = Z._teile.koch;

const F_AKTUELL = 7;
const quelle = [
  'Blech<salami> r = [1, 2, 3, 4, 5, 6, 7, 8].brigade(x -> {',
  '  salami s = 0;',
  '  für (salami i = 0; i < 20000 * x * x; i++) { s = s + (i % 7) * x; }',
  '  serviere (s);',
  '});',
  'Bote.sage((r));'
].join('\n');
const opt = { schrittLimit: 1e9, echtzeit: 1700000000000 };
const norm = (r) => JSON.stringify([r.ereignisse.filter(e => e.typ !== 'motor').map(e => {
  const k = Object.assign({}, e); delete k.detail; delete k.koeche; if (k.umbruch === true) delete k.umbruch; return k;
}), r.exitCode, r.schritte]);

(async () => {
  const aus = { ok: false };
  const pool = koch.kuechenPoolSync(4, { nachkochFrist: 200 });
  if (!pool) { aus.grund = 'kein Pool'; console.log(JSON.stringify(aus)); return; }
  try {
    const soll = norm(P.run(quelle, Object.assign({}, opt)));
    let getoetet = null;
    pool._testHaken = ({ koeche }) => {
      if (getoetet !== null) return;
      const k = koeche.find(x => Atomics.load(x.fach, F_AKTUELL) !== 0);
      if (!k) return;
      getoetet = { stueck: Atomics.load(k.fach, F_AKTUELL), nr: pool._koeche.indexOf(k) + 1 };
      k.worker.terminate();
    };
    const t0 = Date.now();
    const r1 = Z.run(quelle, Object.assign({ motor: 'wasm', koeche: pool }, opt));
    aus.ms1 = Date.now() - t0;
    pool._testHaken = null;
    aus.getoetet = getoetet;
    aus.nachgekocht = pool.nachgekocht;
    aus.gleich1 = norm(r1) === soll;
    aus.koeche1 = r1.koeche;
    // zweite Brigade: der tote Koch steht noch mitten im Stück (F_AKTUELL) → bleibt draußen
    const r2 = Z.run(quelle, Object.assign({ motor: 'wasm', koeche: pool }, opt));
    aus.gleich2 = norm(r2) === soll;
    aus.koeche2 = r2.koeche;
    // eine Runde Ereignisschleife: exit-Ereignis markiert den Koch als tot
    await new Promise(ok => setTimeout(ok, 100));
    aus.lebend = pool.lebend;
    if (!aus.gleich1) aus.ist = norm(r1).slice(0, 300);
    aus.ok = getoetet !== null && aus.nachgekocht >= 1 && aus.gleich1 && aus.gleich2 && aus.koeche2 === 3 && aus.lebend === 2;
  } catch (e) {
    aus.fehler = String(e && e.stack || e);
  } finally {
    pool.beenden();
  }
  console.log(JSON.stringify(aus));
})();
