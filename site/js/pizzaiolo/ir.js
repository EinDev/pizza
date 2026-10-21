/*
 * pizzaiolo – IR-Hilfen: Prüfung (Struktur) und Druck (lesbare Form). Siehe IR.md.
 */
(function (root, fabrik) {
  'use strict';
  const api = fabrik();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else { root.PizzaioloTeile = root.PizzaioloTeile || {}; root.PizzaioloTeile.ir = api; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';
  const AUSDR = new Set(['konst', 'lies', 'bin', 'log', 'un', 'tern', 'mcall', 'untenM', 'ncall', 'call', 'mem', 'dies', 'unten', 'untenCall', 'neu', 'pizza', 'blech', 'bereich', 'lambda', 'schieb', 'ofen', 'waehleA']);
  const ANW = new Set(['ausdr', 'leer', 'var', 'zuw', 'inc', 'block', 'falls', 'solange', 'fuer', 'fuerJedes', 'waehle', 'serviere', 'wirf', 'probier', 'abbrechen', 'weiter', 'feldinit', 'statinit', 'annoHaltbar', 'annoVeraltet', 'rufeInit']);

  /** Prüft die IR-Struktur; liefert Liste von Problemen (leer = ok) */
  function pruefe(ir) {
    const p = [];
    if (!ir || ir.format !== 'pizza-ir/1') return ['falsches Format'];
    if (!Array.isArray(ir.pos) || !ir.pos.length) p.push('Positionstabelle fehlt');
    if (ir.startfehler) return p;
    const nFn = ir.funktionen.length;
    const geh = (n, fn, wo) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach((x, i) => geh(x, fn, wo + '[' + i + ']')); return; }
      if (n.k && !AUSDR.has(n.k) && !ANW.has(n.k)) p.push(wo + ': unbekannter Knoten ' + n.k);
      if (n.k && typeof n.p === 'number' && (n.p < 0 || n.p >= ir.pos.length)) p.push(wo + ': Position außerhalb');
      if (n.k === 'lies' && n.ref && n.ref.art === 'lokal' && !(n.ref.slot >= 0 && n.ref.slot < fn.slots.length)) p.push(wo + ': Slot außerhalb');
      if (n.k === 'lambda' && !(n.fn >= 0 && n.fn < nFn)) p.push(wo + ': Lambda-Funktion fehlt');
      for (const k in n) { if (k === 'ref') continue; const v = n[k]; if (v && typeof v === 'object') geh(v, fn, wo + '.' + k); }
    };
    ir.funktionen.forEach((fn, i) => {
      if (fn.id !== i) p.push('Funktion ' + i + ': id ' + fn.id);
      geh(fn.body, fn, 'fn' + i + '.body');
      geh(fn.ausdr, fn, 'fn' + i + '.ausdr');
    });
    try { JSON.parse(JSON.stringify(ir)); } catch (e) { p.push('nicht serialisierbar: ' + e.message); }
    return p;
  }

  function drucke(ir) {
    const z = [];
    for (const fn of ir.funktionen || []) {
      z.push('fn#' + fn.id + ' ' + fn.art + ' ' + fn.name + '(' + fn.params.map(q => q.name + ':' + q.darst).join(', ') + ')' + (fn.fang.length ? ' fang=' + fn.fang.length : ''));
      z.push('  slots: ' + fn.slots.map((s, i) => i + ':' + s.name + '/' + s.darst + (s.zelle ? '*' : '')).join(' '));
      const k = (n, e) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(x => k(x, e)); return; }
        if (n.k) z.push('  '.repeat(e) + n.k + (n.name ? ' ' + n.name : '') + (n.tf ? ' tf=' + n.tf : ''));
        for (const key of Object.keys(n)) { const v = n[key]; if (v && typeof v === 'object' && key !== 'ref') k(v, e + 1); }
      };
      k(fn.body || fn.ausdr, 2);
    }
    return z.join('\n');
  }

  return { pruefe, drucke, AUSDR, ANW };
});
