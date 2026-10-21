'use strict';
/* Laufzeit-Formatierung (Rust) gegen JS: String(x), euro(), runden(), Dauer-Text, alsZahl. */
const fs = require('fs');
const path = require('path');
const datei = process.env.PIZZA_LAUFZEIT || path.join(__dirname, '..', '..', 'site', 'js', 'pizzaiolo', 'laufzeit.wasm');

function laden() {
  const leer = () => 0;
  const inst = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(datei)), {
    pizza: { ausgabe: leer, fehlerausgabe: leer, warnung: leer, fehler: leer, panik: leer, schreibe: leer, leeren: leer, eingabe: () => -1, ui_senden: leer, ui_warte: () => -1, vorrat_lesen: () => -1, vorrat_schreiben: () => 0, echtzeit_ms: () => 0 },
  });
  const e = inst.exports;
  const textVon = (w) => {
    const p = Number(BigInt.asUintN(32, w));
    const mem = new DataView(e.memory.buffer);
    const len = mem.getUint32(p + 4, true);
    return Buffer.from(new Uint8Array(e.memory.buffer, mem.getUint32(p + 12, true), len)).toString('utf8');
  };
  const zahlW = (x) => { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, x, true); return b.getBigInt64(0, true); };
  const textW = (s) => {
    const b = Buffer.from(s, 'utf8');
    const p = e.arg_puffer(b.length + 16);
    const dv = new DataView(e.memory.buffer);
    dv.setUint32(p, 1, true); dv.setUint32(p + 4, b.length, true); dv.setUint32(p + 8, 0, true); dv.setUint32(p + 12, p + 16, true);
    new Uint8Array(e.memory.buffer).set(b, p + 16);
    return BigInt.asIntN(64, (0xFFFE0000n << 32n) | BigInt(p));
  };
  return { e, textVon, zahlW, textW };
}

// Referenzen aus dem Interpreter (gleiche Formeln)
function zahlText(v) { return Object.is(v, -0) ? '0' : String(v); }
function rundeAuf(x, n) {
  if (!n) return Math.sign(x) * Math.round(Math.abs(x));
  const f = Math.pow(10, n);
  const r = Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9) / f;
  return Object.is(r, -0) ? 0 : r;
}
function zahlMitKomma(x) { return zahlText(x).replace('.', ','); }
const KOMPAKT_STUFEN = [[1e63, 'Dezd.'], [1e60, 'Dez.'], [1e57, 'Nond.'], [1e54, 'Non.'], [1e51, 'Oktd.'], [1e48, 'Okt.'],
  [1e45, 'Septd.'], [1e42, 'Sept.'], [1e39, 'Sextd.'], [1e36, 'Sext.'], [1e33, 'Quintd.'], [1e30, 'Quint.'],
  [1e27, 'Quadrd.'], [1e24, 'Quadr.'], [1e21, 'Trd.'], [1e18, 'Trio.'], [1e15, 'Brd.'], [1e12, 'Bio.'], [1e9, 'Mrd.'],
  [1e6, 'Mio.'], [1e3, 'Tsd.']];
function kompaktText(x, n) {
  if (x !== x) return 'NaN';
  if (!isFinite(x)) return x < 0 ? '-∞' : '∞';
  const a = Math.abs(x);
  if (a >= 1e66) {
    const [ms, es] = a.toExponential().split('e');
    let e = Number(es);
    let m = rundeAuf(Number(ms), n);
    if (m >= 10) { m = rundeAuf(m / 10, n); e += 1; }
    return (x < 0 ? '-' : '') + zahlMitKomma(m) + ' × 10' + String(e).replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
  }
  for (const [f, name] of KOMPAKT_STUFEN) if (a >= f) return zahlMitKomma(rundeAuf(x / f, n)) + ' ' + name;
  return zahlMitKomma(rundeAuf(x, n));
}
function euroText(x) {
  if (!isFinite(x) || Math.abs(x) >= 1e21) return kompaktText(x, 2) + ' €';
  const r = Math.round(Math.abs(x) * 100 + 1e-9) / 100;
  const [g, k] = r.toFixed(2).split('.');
  return (x < 0 && r !== 0 ? '-' : '') + g + ',' + k + ' €';
}
function dauerText(ms) {
  const neg = ms < 0;
  let r = Math.round(Math.abs(ms));
  if (r === 0) return '0ms';
  const teile = [];
  for (const [n, f] of [['d', 86400000], ['h', 3600000], ['min', 60000], ['s', 1000], ['ms', 1]]) {
    const q = Math.floor(r / f);
    if (q) { teile.push(q + n); r -= q * f; }
  }
  return (neg ? '-' : '') + teile.join(' ');
}

function zahlen() {
  const z = [0, -0, 1, -1, 0.1 + 0.2, 1 / 3, 2 / 3, 123456789.123, 5e-324, 1.7976931348623157e308, -1.5, 7.5, 8, 1e21, 1e-7, 123e-20,
    0.000001, 0.0000001, 999999999999999900000, 1e300, Infinity, -Infinity, NaN, 2 ** 53, 2 ** 53 + 2, 4.35, 0.5, 1.005, 100, 1234.5678];
  for (let e = -10; e <= 25; e++) { z.push(Math.pow(10, e)); z.push(-Math.pow(10, e)); z.push(1.5 * Math.pow(10, e)); z.push(1.23456789 * Math.pow(10, e)); }
  let s = 12345;
  for (let i = 0; i < 2000; i++) { s = (s * 1103515245 + 12345) % 2147483648; z.push((s / 2147483648 - 0.5) * Math.pow(10, (s % 40) - 15)); }
  for (let i = 0; i < 3000; i++) { s = (s * 1103515245 + 12345) % 2147483648; z.push((s % 1000003) / Math.pow(2, s % 30) * Math.pow(10, (s % 9) - 4)); }
  return z;
}

function pruefe() {
  const { e, textVon, zahlW, textW } = laden();
  const fehler = [];
  const gleich = (was, ist, soll) => { if (ist !== soll) fehler.push(was + ': ' + JSON.stringify(ist) + ' ≠ ' + JSON.stringify(soll)); };
  const zs = zahlen();
  for (const x of zs) gleich('String(' + x + ')', textVon(e.rt_text(zahlW(x))), zahlText(x));
  const euros = [0, 0.005, 0.015, 0.025, 1.005, 1.015, 2.675, 8, 8.5, -0.004, -0.005, -1.235, 1234.565, 99.995, 0.1 + 0.2, 1e15 + 0.3, 1e20, 1e21, 123456789.125, -0,
    2.0844997640411506e21, -1.5e22, 999.999e21, 1e63, 1e66, -9.999e70, 9.7e70, 1e300, 1.7976931348623157e308, Infinity, -Infinity, NaN];
  for (let i = 0; i < 400; i++) euros.push(Math.round(Math.random() * 1e6) / 1000 + 0.005);
  for (const x of euros.concat(zs)) gleich('euro(' + x + ')', textVon(e.rt_test_euro(x)), euroText(x));
  for (const x of zs.filter(isFinite).concat([2.5, -2.5, 0.49999999999999994, 1.005, 1.255])) for (const n of [0, 1, 2, 3]) {
    const ist = e.rt_test_runden(x, n), soll = rundeAuf(x, n);
    if (!Object.is(ist, soll) && !(Number.isNaN(ist) && Number.isNaN(soll))) fehler.push('runden(' + x + ',' + n + '): ' + ist + ' ≠ ' + soll);
  }
  const dauern = [0, 1, 999, 1000, 1500, 60000, 90000, 3600000, 86400000, 90061001, -90000, 0.4, 0.5, -0.5, 1e22, 3 * 86400000 + 4 * 3600000];
  for (const x of dauern) gleich('Dauer(' + x + ')', textVon(e.rt_test_dauer(x)), dauerText(x));
  const texte = ['3,5', '1_000,5', '1__0', '_1', '1_', '42', ' 7.5 ', '1_000', '0x1F', '0b101', '0o17', '1e3', '.5', '5.', '+5', '-5', 'abc', '', '  ', 'Infinity', '1e', '1e400', '-0', '٣'];
  for (const t of texte) {
    const tt = t.trim();
    const ok = /^[+-]?[0-9]+(?:_[0-9]+)*(?:[.,][0-9]+(?:_[0-9]+)*)?$/.test(tt);
    const soll = ok ? zahlText(Number(tt.replace(/_/g, '').replace(',', '.'))) : 'FEHLER';
    const w = e.rt_test_alszahl(textW(t));
    const ist = (BigInt.asUintN(64, w) >> 48n) === 0xFFFCn ? 'FEHLER' : textVon(e.rt_text(w));
    gleich('alsZahl(' + JSON.stringify(t) + ')', ist, soll);
  }
  return { anzahl: zs.length * 2 + euros.length + texte.length, fehler };
}

module.exports = { pruefe };
if (require.main === module) {
  const r = pruefe();
  for (const f of r.fehler.slice(0, 40)) console.log('  ✗ ' + f);
  console.log(r.fehler.length ? r.fehler.length + ' Abweichungen' : 'Laufzeit-Formatierung: alles gleich (' + r.anzahl + ' Fälle)');
  process.exitCode = r.fehler.length ? 1 : 0;
}
