// pizza-Interpreter · Statische Analyse (Warnungen vor dem Start)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// =====================================================================
// STATISCHE ANALYSE (Warnungen vor dem Start: W0666, W0032)
// =====================================================================

// rang: Datei-Index → Position in der Ladeliste (Projekte, SPEC §14.8); ohne rang zählt nur die Position (eine Datei).
function analysiere(ast, rang) {
  const warn = [];
  let hawaii = null;
  const r = (d) => (rang ? rang[d || 0] : 0);
  const frueher = (a, b) => r(a.d) - r(b.d) || a.z - b.z || a.s - b.s;
  const merke = (n) => { const o = { z: n.z, s: n.s, d: n.di || 0 }; if (!hawaii || frueher(o, hawaii) < 0) hawaii = o; };
  const gemergt = new Set();
  const pruefe = (namen) => {
    const gesehen = new Set();
    for (let j = 1; j < namen.length; j++) {
      for (let i = 0; i < j; i++) {
        const a = namen[i], b = namen[j];
        if (a.name !== b.name && a.name.toLowerCase() === b.name.toLowerCase()) {
          const key = a.name + '\u0000' + b.name;
          if (gesehen.has(key)) continue;
          gesehen.add(key);
          warn.push({ code: 'W0032', text: 'W0032: \'' + a.name + '\' und \'' + b.name + '\' sind im selben Scope definiert. Selbst der Pizzaiolo verwechselt die beiden.', zeile: b.z, spalte: b.s, d: b.d || 0 });
        }
      }
    }
  };
  const declsVon = (stmts, oben) => {
    const r = [];
    for (const st of stmts) {
      if (st.k === 'Var') for (const d of st.decls) r.push({ name: d.name, z: d.z, s: d.s, d: d.di });
      else if (oben && st.k === 'Methode') r.push({ name: st.name, z: st.nz, s: st.ns, d: st.di });
    }
    return r;
  };
  const blockNamen = (b) => { if (b && b.k === 'Block') { gemergt.add(b); return declsVon(b.body, false); } return []; };
  const geh = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const x of n) geh(x); return; }
    switch (n.k) {
      case 'Typ': if (n.name === 'hawaii') merke(n); break;
      case 'Programm': pruefe(declsVon(n.body, true)); break;
      case 'Block': if (!gemergt.has(n)) pruefe(declsVon(n.body, false)); break;
      case 'Methode': case 'Ktor': case 'Lambda':
        pruefe(n.params.map(p => ({ name: p.name, z: p.z, s: p.s, d: p.di })).concat(blockNamen(n.body)));
        break;
      case 'FuerJedes': pruefe([{ name: n.name, z: n.nz, s: n.ns, d: n.di }].concat(blockNamen(n.body))); break;
      case 'Fuer': {
        const ns = n.init && n.init.k === 'Var' ? n.init.decls.map(d => ({ name: d.name, z: d.z, s: d.s, d: d.di })) : [];
        pruefe(ns.concat(blockNamen(n.body)));
        break;
      }
      case 'Klasse': {
        const ns = [];
        for (const f of n.felder) for (const d of f.decls) ns.push({ name: d.name, z: d.z, s: d.s, d: d.di });
        for (const m of n.methoden) ns.push({ name: m.name, z: m.nz, s: m.ns, d: m.di });
        pruefe(ns);
        break;
      }
      case 'Probier':
        for (const f of n.faenge) pruefe([{ name: f.name, z: f.nz, s: f.ns, d: f.di }].concat(blockNamen(f.block)));
        break;
      case 'Ofen':
        if (n.roh) pruefe([{ name: n.roh.name, z: n.roh.nz, s: n.roh.ns, d: n.roh.di }].concat(blockNamen(n.roh.block)));
        for (const f of n.faenge) pruefe([{ name: f.name, z: f.nz, s: f.ns, d: f.di }].concat(blockNamen(f.block)));
        break;
    }
    for (const key in n) {
      const v = n[key];
      if (v && typeof v === 'object') geh(v);
    }
  };
  geh(ast);
  warn.sort((a, b) => r(a.d) - r(b.d) || a.zeile - b.zeile || a.spalte - b.spalte);
  if (hawaii) warn.unshift({ code: 'W0666', text: 'W0666: Typ \'hawaii\' gefunden. Der Pizzaiolo sagt nichts. Er schaut nur.', zeile: hawaii.z, spalte: hawaii.s, d: hawaii.d });
  return warn;
}
