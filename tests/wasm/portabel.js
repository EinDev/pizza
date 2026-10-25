'use strict';
/*
 * Portabilitätsprüfung für .pkarton/laufzeit.wasm (WASM.md §1.4):
 * erlaubt sind nur MVP + bulk-memory + multi-value + mutable-globals + sign-ext + nontrapping-fptoint.
 * Dekodiert jeden Funktionsrumpf vollständig und meldet jede Instruktion/Typangabe außerhalb dieser Menge.
 */
const path = require('path');
const K = require(path.join(__dirname, '..', '..', 'site', 'js', 'pizzaiolo', 'kodierer.js'));

const WERTTYPEN = new Set([0x7f, 0x7e, 0x7d, 0x7c]);

function pruefePortabel(bytes) {
  const probleme = [];
  const m = K.leseModul(bytes);
  for (const t of m.typen) for (const x of t.p.concat(t.e)) if (!WERTTYPEN.has(x)) probleme.push('Typ mit Nicht-Zahl-Werttyp 0x' + x.toString(16));
  for (const i of m.importe) {
    // Modul „herd“ = Exporte des Herd-Kerns (HOST-ABI §2, Gruppe herd), Modul „klang“ = Exporte von klang.wasm (Gruppe klang)
    if (i.modul !== 'pizza' && i.modul !== 'herd' && i.modul !== 'klang') probleme.push('Import aus fremdem Modul: ' + i.modul + '.' + i.name);
    if (i.art !== 0) probleme.push('Nicht-Funktions-Import: ' + i.name);
  }
  if (m.tabellen.length > 1) probleme.push('mehr als eine Tabelle');
  for (const t of m.tabellen) if (t.t !== 0x70) probleme.push('Tabelle nicht funcref');
  if (m.speicher.length > 1) probleme.push('mehr als ein Speicher');
  for (const g of m.globale) if (!WERTTYPEN.has(g.t)) probleme.push('Global mit Typ 0x' + g.t.toString(16));
  m.code.forEach((rumpf, fi) => {
    const r = new K.Leser(rumpf, 0);
    const n = r.u32();
    for (let i = 0; i < n; i++) { r.u32(); const t = r.byte(); if (!WERTTYPEN.has(t)) probleme.push('Funktion ' + fi + ': Lokal mit Typ 0x' + t.toString(16)); }
    const fehler = (was) => { probleme.push('Funktion ' + fi + ' @' + r.i + ': ' + was); };
    while (r.i < rumpf.length) {
      const op = r.byte();
      if (op <= 0x01 || op === 0x05 || op === 0x0b || op === 0x0f || op === 0x1a || op === 0x1b) continue;
      if (op >= 0x02 && op <= 0x04) {
        const bt = r.b[r.i];
        if (bt === 0x40 || WERTTYPEN.has(bt)) r.i++;
        else if (bt === 0x70 || bt === 0x6f) { fehler('Blocktyp Referenztyp'); r.i++; }
        else r.s32();  // Typindex (multi-value)
        continue;
      }
      if (op === 0x0c || op === 0x0d) { r.u32(); continue; }
      if (op === 0x0e) { let k = r.u32(); while (k--) r.u32(); r.u32(); continue; }
      if (op === 0x10) { r.u32(); continue; }
      if (op === 0x11) {
        r.u32();
        const tb = r.b[r.i];
        if (tb !== 0x00) fehler('call_indirect mit Tabellenindex-Kodierung ≠ 0x00 (reference-types)');
        r.u32();
        continue;
      }
      if (op >= 0x20 && op <= 0x24) { r.u32(); continue; }
      if (op >= 0x28 && op <= 0x3e) { r.u32(); r.u32(); continue; }
      if (op === 0x3f || op === 0x40) { if (r.byte() !== 0) fehler('memory.size/grow mit Speicherindex ≠ 0'); continue; }
      if (op === 0x41) { r.s32(); continue; }
      if (op === 0x42) { r.s64(); continue; }
      if (op === 0x43) { r.i += 4; continue; }
      if (op === 0x44) { r.i += 8; continue; }
      if (op >= 0x45 && op <= 0xbf) continue;
      if (op >= 0xc0 && op <= 0xc4) continue;   // sign-ext
      if (op === 0xfc) {
        const sub = r.u32();
        if (sub <= 7) continue;                    // nontrapping-fptoint
        if (sub === 8) { r.u32(); r.byte(); continue; }   // memory.init
        if (sub === 9) { r.u32(); continue; }              // data.drop
        if (sub === 10) { r.byte(); r.byte(); continue; }  // memory.copy
        if (sub === 11) { r.byte(); continue; }            // memory.fill
        if (sub === 12) { r.u32(); r.u32(); continue; }    // table.init
        if (sub === 13) { r.u32(); continue; }             // elem.drop
        if (sub === 14) { r.u32(); r.u32(); continue; }    // table.copy
        fehler('0xFC ' + sub + ' (reference-types/andere Erweiterung)');
        break;
      }
      fehler('Opcode 0x' + op.toString(16) + ' nicht erlaubt (SIMD/EH/GC/Referenzen/Tail-Calls)');
      break;
    }
  });
  return probleme;
}

module.exports = { pruefePortabel };

if (require.main === module) {
  const fs = require('fs');
  for (const f of process.argv.slice(2)) {
    const p = pruefePortabel(fs.readFileSync(f));
    console.log(f + ': ' + (p.length ? p.length + ' Probleme\n  ' + p.slice(0, 20).join('\n  ') : 'portabel'));
  }
}
