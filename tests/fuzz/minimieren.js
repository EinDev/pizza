'use strict';
/*
 * Automatisches Minimieren (Delta-Debugging) eines pizza-Programms.
 *   minimiere(code, istInteressant, { maxPruefungen, maxMs }) → { code, pruefungen, ms }
 * istInteressant(kandidat) muss true liefern, solange die ursprüngliche Abweichung (gleiche Signatur) besteht.
 * Stufen: (1) ganze Blöcke entfernen, (2) ddmin über Zeilen, (3) ddmin über Tokens je Zeile,
 *         (4) Literale vereinfachen.
 */

function bloecke(zeilen) {
  // Paare (start, ende) für Zeilen, die mit '{' enden, bis zur passenden Zeile, die mit '}' beginnt (gleiche Einrückung).
  const out = [];
  const ind = z => z.length - z.trimStart().length;
  zeilen.forEach((z, i) => {
    if (!/\{\s*$/.test(z)) return;
    for (let j = i + 1; j < zeilen.length; j++) {
      const t = zeilen[j].trimStart();
      if (ind(zeilen[j]) === ind(z) && t.startsWith('}')) {
        if (/\{\s*$/.test(t)) continue; // "} sonst {", "} verbrannt (...) {" – gehört zur Kette
        out.push([i, j]);
        break;
      }
      if (ind(zeilen[j]) < ind(z) && zeilen[j].trim()) break;
    }
  });
  return out.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
}

function ddmin(teile, test, budget) {
  let n = 2;
  while (teile.length >= 2 && budget.ok()) {
    const groesse = Math.ceil(teile.length / n);
    let weiter = false;
    for (let i = 0; i < teile.length && budget.ok(); i += groesse) {
      const rest = teile.slice(0, i).concat(teile.slice(i + groesse));
      if (rest.length && test(rest)) { teile = rest; n = Math.max(n - 1, 2); weiter = true; break; }
    }
    if (!weiter) {
      if (n >= teile.length) break;
      n = Math.min(n * 2, teile.length);
    }
  }
  return teile;
}

const TOKEN_RE = /"(?:[^"\\\n]|\\.)*"|\/\/[^\n]*|\d+(?:\.\d+)?(?:ms|s|min|h|d)?|[\p{L}_][\p{L}\p{N}_]*|->|\.\.|[=!<>]=|&&|\|\||\+\+|--|[+\-*/%]=|\s+|./gu;

function minimiere(code, istInteressant, opt = {}) {
  const t0 = Date.now();
  const maxP = opt.maxPruefungen || 1500, maxMs = opt.maxMs || 60000;
  let pruefungen = 0;
  const budget = { ok: () => pruefungen < maxP && Date.now() - t0 < maxMs };
  const cache = new Map();
  const test = q => {
    if (cache.has(q)) return cache.get(q);
    pruefungen++;
    let r = false;
    try { r = !!istInteressant(q); } catch (_) { r = false; }
    cache.set(q, r);
    return r;
  };

  let zeilen = code.replace(/\r\n/g, '\n').split('\n');
  // (1) Blöcke
  let fortschritt = true;
  while (fortschritt && budget.ok()) {
    fortschritt = false;
    for (const [a, b] of bloecke(zeilen)) {
      if (!budget.ok()) break;
      const kand = zeilen.slice(0, a).concat(zeilen.slice(b + 1));
      if (test(kand.join('\n'))) { zeilen = kand; fortschritt = true; break; }
      // Block "auspacken": Kopf/Fuß weg, Inhalt behalten
      const aus = zeilen.slice(0, a).concat(zeilen.slice(a + 1, b), zeilen.slice(b + 1));
      if (test(aus.join('\n'))) { zeilen = aus; fortschritt = true; break; }
    }
  }
  // (2) Zeilen
  zeilen = ddmin(zeilen, z => test(z.join('\n')), budget);
  // (3) Tokens je Zeile
  for (let i = 0; i < zeilen.length && budget.ok(); i++) {
    const toks = zeilen[i].match(TOKEN_RE) || [];
    if (toks.length < 2) continue;
    const neu = ddmin(toks, ts => { const z = zeilen.slice(); z[i] = ts.join(''); return test(z.join('\n')); }, budget);
    zeilen[i] = neu.join('');
  }
  // (4) Literale vereinfachen
  const ersatz = [[/"(?:[^"\\\n]|\\.)+"/g, '""'], [/\b\d{2,}(?:\.\d+)?\b/g, '1']];
  for (let i = 0; i < zeilen.length && budget.ok(); i++) {
    for (const [re, durch] of ersatz) {
      const kand = zeilen.slice();
      kand[i] = zeilen[i].replace(re, durch);
      if (kand[i] !== zeilen[i] && test(kand.join('\n'))) zeilen = kand;
    }
  }
  const roh = zeilen.join('\n');
  const kompakt = zeilen.filter(z => z.trim()).join('\n') + '\n';
  const ergebnis = test(kompakt) ? kompakt : (test(roh) ? roh : code);
  return { code: ergebnis, pruefungen, ms: Date.now() - t0 };
}

module.exports = { minimiere, ddmin };
