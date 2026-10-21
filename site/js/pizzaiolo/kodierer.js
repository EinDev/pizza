/*
 * pizzaiolo – Wasm-Kodierer: LEB128, Typen, Instruktionen, Sections, Modul-Leser (für den Linker).
 * Keine Abhängigkeiten. UMD-Teil: self.PizzaioloTeile.kodierer / module.exports
 */
(function (root, fabrik) {
  'use strict';
  const api = fabrik();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else { root.PizzaioloTeile = root.PizzaioloTeile || {}; root.PizzaioloTeile.kodierer = api; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const T = { i32: 0x7f, i64: 0x7e, f32: 0x7d, f64: 0x7c, funcref: 0x70, leer: 0x40 };

  // ------------------------------------------------------------ Byte-Puffer
  class Puffer {
    constructor(n) { this.b = new Uint8Array(n || 256); this.n = 0; }
    platz(k) {
      if (this.n + k <= this.b.length) return;
      let neu = this.b.length * 2;
      while (neu < this.n + k) neu *= 2;
      const b = new Uint8Array(neu);
      b.set(this.b.subarray(0, this.n));
      this.b = b;
    }
    byte(x) { this.platz(1); this.b[this.n++] = x & 0xff; }
    bytes(a) { this.platz(a.length); this.b.set(a, this.n); this.n += a.length; }
    u32(x) { // LEB128 vorzeichenlos
      x >>>= 0;
      do { let b = x & 0x7f; x >>>= 7; if (x !== 0) b |= 0x80; this.byte(b); } while (x !== 0);
    }
    s32(x) {
      x |= 0;
      for (;;) {
        const b = x & 0x7f; x >>= 7;
        if ((x === 0 && (b & 0x40) === 0) || (x === -1 && (b & 0x40) !== 0)) { this.byte(b); return; }
        this.byte(b | 0x80);
      }
    }
    s64(x) { // x: BigInt
      x = BigInt.asIntN(64, BigInt(x));
      for (;;) {
        const b = Number(x & 0x7fn); x >>= 7n;
        if ((x === 0n && (b & 0x40) === 0) || (x === -1n && (b & 0x40) !== 0)) { this.byte(b); return; }
        this.byte(b | 0x80);
      }
    }
    f64(x) { this.platz(8); new DataView(this.b.buffer, this.b.byteOffset).setFloat64(this.n, x, true); this.n += 8; }
    name(s) { const u = utf8(s); this.u32(u.length); this.bytes(u); }
    vec(liste, f) { this.u32(liste.length); for (const x of liste) f(this, x); }
    fertig() { return this.b.slice(0, this.n); }
  }

  const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  function utf8(s) {
    if (enc) return enc.encode(s);
    return Uint8Array.from(Buffer.from(s, 'utf8'));
  }

  // ------------------------------------------------------------ Opcodes
  const OP = {
    unreachable: 0x00, nop: 0x01, block: 0x02, loop: 0x03, if: 0x04, else: 0x05, end: 0x0b, br: 0x0c, br_if: 0x0d,
    br_table: 0x0e, return: 0x0f, call: 0x10, call_indirect: 0x11, drop: 0x1a, select: 0x1b,
    local_get: 0x20, local_set: 0x21, local_tee: 0x22, global_get: 0x23, global_set: 0x24,
    i32_load: 0x28, i64_load: 0x29, f64_load: 0x2b, i32_load8_u: 0x2d, i32_store: 0x36, i64_store: 0x37, f64_store: 0x39, i32_store8: 0x3a,
    memory_size: 0x3f, memory_grow: 0x40,
    i32_const: 0x41, i64_const: 0x42, f64_const: 0x44,
    i32_eqz: 0x45, i32_eq: 0x46, i32_ne: 0x47, i32_lt_s: 0x48, i32_lt_u: 0x49, i32_gt_s: 0x4a, i32_gt_u: 0x4b,
    i32_le_s: 0x4c, i32_le_u: 0x4d, i32_ge_s: 0x4e, i32_ge_u: 0x4f,
    i64_eqz: 0x50, i64_eq: 0x51, i64_ne: 0x52, i64_lt_s: 0x53, i64_lt_u: 0x54, i64_gt_s: 0x55, i64_gt_u: 0x56,
    i64_le_s: 0x57, i64_le_u: 0x58, i64_ge_s: 0x59, i64_ge_u: 0x5a,
    f64_eq: 0x61, f64_ne: 0x62, f64_lt: 0x63, f64_gt: 0x64, f64_le: 0x65, f64_ge: 0x66,
    i32_add: 0x6a, i32_sub: 0x6b, i32_mul: 0x6c, i32_and: 0x71, i32_or: 0x72, i32_xor: 0x73, i32_shl: 0x74, i32_shr_u: 0x76,
    i64_add: 0x7c, i64_sub: 0x7d, i64_and: 0x83, i64_or: 0x84, i64_xor: 0x85, i64_shr_u: 0x88, i64_shl: 0x86,
    f64_abs: 0x99, f64_neg: 0x9a, f64_ceil: 0x9b, f64_floor: 0x9c, f64_trunc: 0x9d, f64_nearest: 0x9e, f64_sqrt: 0x9f,
    f64_add: 0xa0, f64_sub: 0xa1, f64_mul: 0xa2, f64_div: 0xa3, f64_min: 0xa4, f64_max: 0xa5, f64_copysign: 0xa6,
    i32_wrap_i64: 0xa7, i32_trunc_f64_s: 0xaa, i64_extend_i32_u: 0xad, i64_extend_i32_s: 0xac, f64_convert_i32_s: 0xb7,
    f64_convert_i32_u: 0xb8, i64_reinterpret_f64: 0xbd, f64_reinterpret_i64: 0xbf,
  };

  // ------------------------------------------------------------ Funktionsrumpf-Bauer
  class Code {
    constructor() { this.p = new Puffer(512); }
    op(o) { if (typeof o !== 'number') throw new Error('unbekannter Opcode'); this.p.byte(o); return this; }
    i32(x) { this.p.byte(OP.i32_const); this.p.s32(x); return this; }
    i64(x) { this.p.byte(OP.i64_const); this.p.s64(x); return this; }
    f64(x) { this.p.byte(OP.f64_const); this.p.f64(x); return this; }
    get(i) { this.p.byte(OP.local_get); this.p.u32(i); return this; }
    set(i) { this.p.byte(OP.local_set); this.p.u32(i); return this; }
    tee(i) { this.p.byte(OP.local_tee); this.p.u32(i); return this; }
    gget(i) { this.p.byte(OP.global_get); this.p.u32(i); return this; }
    gset(i) { this.p.byte(OP.global_set); this.p.u32(i); return this; }
    call(i) { this.p.byte(OP.call); this.p.u32(i); return this; }
    callInd(typ) { this.p.byte(OP.call_indirect); this.p.u32(typ); this.p.byte(0); return this; }
    block(t) { this.p.byte(OP.block); this.p.byte(t === undefined ? T.leer : t); return this; }
    loop(t) { this.p.byte(OP.loop); this.p.byte(t === undefined ? T.leer : t); return this; }
    if_(t) { this.p.byte(OP.if); this.p.byte(t === undefined ? T.leer : t); return this; }
    else_() { this.p.byte(OP.else); return this; }
    end() { this.p.byte(OP.end); return this; }
    br(t) { this.p.byte(OP.br); this.p.u32(t); return this; }
    brIf(t) { this.p.byte(OP.br_if); this.p.u32(t); return this; }
    mem(o, ausr, off) { this.p.byte(o); this.p.u32(ausr); this.p.u32(off >>> 0); return this; }
    ld64(off) { return this.mem(OP.i64_load, 3, off); }
    ldf(off) { return this.mem(OP.f64_load, 3, off); }
    ld32(off) { return this.mem(OP.i32_load, 2, off); }
    st64(off) { return this.mem(OP.i64_store, 3, off); }
    stf(off) { return this.mem(OP.f64_store, 3, off); }
    st32(off) { return this.mem(OP.i32_store, 2, off); }
    bytes() { return this.p.fertig(); }
  }

  // ------------------------------------------------------------ Modul-Leser (für den Linker)
  class Leser {
    constructor(b, i) { this.b = b; this.i = i || 0; }
    byte() { return this.b[this.i++]; }
    u32() { let r = 0, s = 0, b; do { b = this.b[this.i++]; r |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return r >>> 0; }
    s32() { let r = 0, s = 0, b; do { b = this.b[this.i++]; r |= (b & 0x7f) << s; s += 7; } while (b & 0x80); if (s < 32 && (b & 0x40)) r |= (~0 << s); return r | 0; }
    s64() { let r = 0n, s = 0n, b; do { b = this.b[this.i++]; r |= BigInt(b & 0x7f) << s; s += 7n; } while (b & 0x80); if (s < 64n && (b & 0x40)) r |= (-1n << s); return BigInt.asIntN(64, r); }
    name() { const n = this.u32(); const s = this.b.subarray(this.i, this.i + n); this.i += n; return new TextDecoder().decode(s); }
  }

  function leseModul(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b[0] !== 0 || b[1] !== 0x61 || b[2] !== 0x73 || b[3] !== 0x6d) throw new Error('kein Wasm-Modul');
    const r = new Leser(b, 8);
    const sections = [];
    while (r.i < b.length) {
      const id = r.byte();
      const len = r.u32();
      const start = r.i;
      sections.push({ id, start, end: start + len, bytes: b.subarray(start, start + len) });
      r.i = start + len;
    }
    const m = { bytes: b, sections, typen: [], importe: [], funktionen: [], tabellen: [], speicher: [], globale: [], exporte: [], elemente: [], code: [], daten: [], custom: [] };
    for (const s of sections) {
      const q = new Leser(b, s.start);
      switch (s.id) {
        case 0: m.custom.push({ name: q.name(), bytes: b.subarray(q.i, s.end) }); break;
        case 1: { const n = q.u32(); for (let i = 0; i < n; i++) { q.byte(); const p = []; let k = q.u32(); while (k--) p.push(q.byte()); const e = []; k = q.u32(); while (k--) e.push(q.byte()); m.typen.push({ p, e }); } break; }
        case 2: {
          const n = q.u32();
          for (let i = 0; i < n; i++) {
            const modul = q.name(), name = q.name(), art = q.byte();
            let typ = null;
            if (art === 0) typ = q.u32();
            else if (art === 1) { q.byte(); const f = q.byte(); q.u32(); if (f & 1) q.u32(); }
            else if (art === 2) { const f = q.byte(); q.u32(); if (f & 1) q.u32(); }
            else if (art === 3) { q.byte(); q.byte(); }
            m.importe.push({ modul, name, art, typ });
          }
          break;
        }
        case 3: { const n = q.u32(); for (let i = 0; i < n; i++) m.funktionen.push(q.u32()); break; }
        case 4: { const n = q.u32(); for (let i = 0; i < n; i++) { const t = q.byte(); const f = q.byte(); const min = q.u32(); const max = (f & 1) ? q.u32() : null; m.tabellen.push({ t, min, max }); } break; }
        case 5: { const n = q.u32(); for (let i = 0; i < n; i++) { const f = q.byte(); const min = q.u32(); const max = (f & 1) ? q.u32() : null; m.speicher.push({ min, max }); } break; }
        case 6: {
          const n = q.u32();
          for (let i = 0; i < n; i++) {
            const t = q.byte(), mut = q.byte();
            const s0 = q.i;
            const op = q.byte();
            let wert = null;
            if (op === OP.i32_const) wert = q.s32();
            else if (op === OP.i64_const) wert = q.s64();
            else if (op === OP.f64_const) q.i += 8;
            else if (op === OP.global_get) q.u32();
            q.byte(); // end
            m.globale.push({ t, mut, wert, init: b.subarray(s0, q.i) });
          }
          break;
        }
        case 7: { const n = q.u32(); for (let i = 0; i < n; i++) { const name = q.name(); const art = q.byte(); const idx = q.u32(); m.exporte.push({ name, art, idx }); } break; }
        case 9: m.elementRoh = s.bytes; break;
        case 10: { const n = q.u32(); for (let i = 0; i < n; i++) { const len = q.u32(); m.code.push(b.subarray(q.i, q.i + len)); q.i += len; } break; }
        case 11: m.datenRoh = s.bytes; break;
        case 12: m.datenAnzahl = q.u32(); break;
      }
    }
    m.anzahlImportFunktionen = m.importe.filter(x => x.art === 0).length;
    m.anzahlImportGlobale = m.importe.filter(x => x.art === 3).length;
    m.export = (name) => m.exporte.find(e => e.name === name) || null;
    return m;
  }

  function section(id, inhalt) {
    const p = new Puffer(inhalt.length + 8);
    p.byte(id); p.u32(inhalt.length); p.bytes(inhalt);
    return p.fertig();
  }

  function verbinde(teile) {
    let n = 0;
    for (const t of teile) n += t.length;
    const r = new Uint8Array(n);
    let o = 0;
    for (const t of teile) { r.set(t, o); o += t.length; }
    return r;
  }

  return { T, OP, Puffer, Code, Leser, leseModul, section, verbinde, utf8 };
});
