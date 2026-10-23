// pizza-Interpreter · Lexer
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// =====================================================================
// LEXER
// =====================================================================

class SyntaxFehler {
  constructor(text, zeile, spalte, code) {
    this.text = text; this.zeile = zeile; this.spalte = spalte; this.code = code || 'P0001';
  }
}

const IDENT_START = /[\p{L}_]/u;
const IDENT_REST = /[\p{L}\p{M}\p{N}_]/u;
const ZAHL_RE = /[0-9][0-9_]*(?:\.[0-9][0-9_]*)?/y;
const EINHEIT_RE = /(ms|min|s|h|d)(?![\p{L}\p{M}\p{N}_])/uy;
const EINHEITEN = { ms: 1, s: 1000, min: 60000, h: 3600000, d: 86400000 };
const OPS2 = new Set(['->', '==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '++', '--', '..']);
const OPS1 = new Set('+-*/%<>!?:=.,;(){}[]@'.split(''));

function lexe(q) {
  const toks = [];
  const n = q.length;
  let i = 0, z = 1, zs = 0;
  if (q.charCodeAt(0) === 0xFEFF) { i = 1; zs = 1; }
  while (i < n) {
    const c = q[i];
    if (c === '\n') { z++; i++; zs = i; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ') { i++; continue; }
    const s = i - zs + 1;
    if (c === '/' && q[i + 1] === '/') { while (i < n && q[i] !== '\n') i++; continue; }
    if (c === '/' && q[i + 1] === '*') {
      const sz = z;
      i += 2;
      while (i < n && !(q[i] === '*' && q[i + 1] === '/')) { if (q[i] === '\n') { z++; zs = i + 1; } i++; }
      if (i >= n) throw new SyntaxFehler('Kommentar /* … */ wird nie geschlossen.', sz, s);
      i += 2;
      continue;
    }
    if (c >= '0' && c <= '9') {
      ZAHL_RE.lastIndex = i;
      const m = ZAHL_RE.exec(q);
      const roh = m[0];
      const v = Number(roh.replace(/_/g, ''));
      let j = i + roh.length;
      EINHEIT_RE.lastIndex = j;
      const e = EINHEIT_RE.exec(q);
      if (e) { j += e[0].length; toks.push({ t: 'dauer', v: v * EINHEITEN[e[1]], z, s, o: i, oe: j }); }
      else toks.push({ t: 'zahl', v, z, s, o: i, oe: j });
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1, out = '';
      for (;;) {
        if (j >= n || q[j] === '\n') throw new SyntaxFehler('Text wird nicht geschlossen – fehlt ein \'"\'?', z, s);
        const ch = q[j];
        if (ch === '"') { j++; break; }
        if (ch === '\\') {
          const e = q[j + 1];
          if (e === 'n') out += '\n';
          else if (e === 't') out += '\t';
          else if (e === '"') out += '"';
          else if (e === '\\') out += '\\';
          else if (e === "'") out += "'";
          else if (e === 'r') out += '\r';
          else throw new SyntaxFehler('Unbekannte Escape-Sequenz \'\\' + (e === undefined ? '' : e) + '\' im Text.', z, j - zs + 1);
          j += 2;
          continue;
        }
        out += ch;
        j++;
      }
      toks.push({ t: 'text', v: out, z, s, o: i, oe: j });
      i = j;
      continue;
    }
    const cp = q.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    if (IDENT_START.test(ch)) {
      let j = i + ch.length;
      while (j < n) {
        const ch2 = String.fromCodePoint(q.codePointAt(j));
        if (!IDENT_REST.test(ch2)) break;
        j += ch2.length;
      }
      const w = q.slice(i, j);
      toks.push({ t: KW.has(w) ? 'kw' : 'name', v: w, z, s, o: i, oe: j });
      i = j;
      continue;
    }
    const zwei = q.substr(i, 2);
    if (OPS2.has(zwei)) { toks.push({ t: 'op', v: zwei, z, s, o: i, oe: i + 2 }); i += 2; continue; }
    if (OPS1.has(c)) { toks.push({ t: 'op', v: c, z, s, o: i, oe: i + 1 }); i++; continue; }
    throw new SyntaxFehler('Unerwartetes Zeichen \'' + ch + '\'.', z, s);
  }
  toks.push({ t: 'eof', v: '', z, s: i - zs + 1, o: i, oe: i });
  return toks;
}
