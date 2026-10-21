'use strict';
/** Deterministischer PRNG (mulberry32) + Helfer. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed für Programm i aus Grundseed (stabil, unabhängig von der Reihenfolge). */
function seedFuer(grund, i, salz = 0) {
  let h = (grund >>> 0) ^ Math.imul(i + 1, 0x9E3779B1) ^ Math.imul(salz + 7, 0x85EBCA77);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

class Zufall {
  constructor(seed) { this.r = mulberry32(seed); }
  f() { return this.r(); }
  int(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  chance(p) { return this.r() < p; }
  wahl(liste) { return liste[Math.floor(this.r() * liste.length)]; }
  /** gewichtete Wahl: [[gewicht, wert], ...] */
  gewichtet(paare) {
    let s = 0;
    for (const [g] of paare) s += g;
    let x = this.r() * s;
    for (const [g, w] of paare) { if ((x -= g) < 0) return w; }
    return paare[paare.length - 1][1];
  }
}

module.exports = { Zufall, mulberry32, seedFuer };
