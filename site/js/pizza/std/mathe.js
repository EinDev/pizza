// pizza-Interpreter · Standardbibliothek: Mathe (fdlibm-Ports WINKEL und LOGEXP)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// ---------------------------------------------------------------- K-137: Winkelfunktionen (fdlibm, wie V8 12.x)
// Nicht Math.sin & Co.: JS-Motoren rechnen dort verschieden (Node 22/V8 12.4 = fdlibm, Chrome 156 weicht in jeder
// Winkelfunktion ab). Dieser Port von Sun fdlibm 5.3 (V8 src/base/ieee754.cc) ist derselbe Algorithmus wie in der
// Wasm-Laufzeit (laufzeit/src/zahl.rs) – nur Double-Operationen, also in jedem Motor dieselben Bits.
// fdlibm: „Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved. Developed at SunSoft, a Sun Microsystems,
// Inc. business. Permission to use, copy, modify, and distribute this software is freely granted, provided that this
// notice is preserved.“
const WINKEL = (function () {
  const dv = new DataView(new ArrayBuffer(8));
  const hi = (x) => { dv.setFloat64(0, x); return dv.getInt32(0); };
  const lo = (x) => { dv.setFloat64(0, x); return dv.getUint32(4); };
  const worte = (h, l) => { dv.setInt32(0, h); dv.setUint32(4, l); return dv.getFloat64(0); };
  const ohneLo = (x) => { dv.setFloat64(0, x); dv.setUint32(4, 0); return dv.getFloat64(0); };
  const zweiHoch = (n) => worte((n + 1023) << 20, 0);   // 2^n, |n| ≤ 1022 (hier stets normal)
  const ZWEI_DURCH_PI = [
    0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163, 0xABDEBB, 0xC561B7, 0x246E3A,
    0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C, 0x7026B4, 0x5F7E41,
    0x3991D6, 0x398353, 0x39F49C, 0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D, 0x367ECF,
    0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7, 0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08,
    0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E, 0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880,
    0x4D7327, 0x310606, 0x1556CA, 0x73A8C9, 0x60E27B, 0xC08C6B
  ];
  const NPIO2_HW = [
    0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A,
    0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A,
    0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
    0x404858EB, 0x404921FB
  ];
  const PIO2_TEILE = [1.57079625129699707031e+00, 7.54978941586159635335e-08, 5.39030252995776476554e-15, 3.28200341580791294123e-22,
    1.27065575308067607349e-29, 1.22933308981111328932e-36, 2.73370053816464559624e-44, 2.16741683877804819444e-51];
  const TWO24 = 1.67772160000000000000e+07, TWON24 = 5.96046447753906250000e-08;
  const ganz = (x) => x < 0 ? Math.ceil(x) : Math.floor(x);   // (int32_t)x für |x| < 2^31

  // k_rem_pio2.c, prec = 2 (jk = 4)
  function kernelRemPio2(x, y, e0) {
    const jk = 4, jp = 4, jx = x.length - 1;
    let jv = ganz((e0 - 3) / 24);
    if (jv < 0) jv = 0;
    let q0 = e0 - 24 * (jv + 1);
    const f = new Array(20).fill(0), q = new Array(20).fill(0), fq = new Array(20).fill(0), iq = new Array(20).fill(0);
    for (let i = 0, j = jv - jx; i <= jx + jk; i++, j++) f[i] = j < 0 ? 0 : ZWEI_DURCH_PI[j];
    for (let i = 0; i <= jk; i++) { let fw = 0; for (let j = 0; j <= jx; j++) fw += x[j] * f[jx + i - j]; q[i] = fw; }
    let jz = jk, z, n, ih;
    for (;;) {
      z = q[jz];
      for (let i = 0, j = jz; j > 0; i++, j--) {
        const fw = ganz(TWON24 * z);
        iq[i] = ganz(z - TWO24 * fw);
        z = q[j - 1] + fw;
      }
      z = z * zweiHoch(q0);
      z -= 8 * Math.floor(z * 0.125);
      n = ganz(z);
      z -= n;
      ih = 0;
      if (q0 > 0) {
        const i = iq[jz - 1] >> (24 - q0);
        n += i;
        iq[jz - 1] -= i << (24 - q0);
        ih = iq[jz - 1] >> (23 - q0);
      } else if (q0 === 0) ih = iq[jz - 1] >> 23;
      else if (z >= 0.5) ih = 2;
      if (ih > 0) {
        n += 1;
        let carry = 0;
        for (let i = 0; i < jz; i++) {
          const j = iq[i];
          if (carry === 0) { if (j !== 0) { carry = 1; iq[i] = 0x1000000 - j; } } else iq[i] = 0xFFFFFF - j;
        }
        if (q0 === 1) iq[jz - 1] &= 0x7FFFFF; else if (q0 === 2) iq[jz - 1] &= 0x3FFFFF;
        if (ih === 2) { z = 1 - z; if (carry !== 0) z -= zweiHoch(q0); }
      }
      if (z === 0) {
        let j = 0;
        for (let i = jz - 1; i >= jk; i--) j |= iq[i];
        if (j === 0) {
          let k = 1;
          while (jk >= k && iq[jk - k] === 0) k++;
          for (let i = jz + 1; i <= jz + k; i++) {
            f[jx + i] = ZWEI_DURCH_PI[jv + i];
            let fw = 0; for (let j2 = 0; j2 <= jx; j2++) fw += x[j2] * f[jx + i - j2];
            q[i] = fw;
          }
          jz += k;
          continue;
        }
      }
      break;
    }
    if (z === 0) {
      jz -= 1; q0 -= 24;
      while (iq[jz] === 0) { jz--; q0 -= 24; }
    } else {
      z = z * zweiHoch(-q0);
      if (z >= TWO24) {
        const fw = ganz(TWON24 * z);
        iq[jz] = ganz(z - TWO24 * fw);
        jz += 1; q0 += 24;
        iq[jz] = fw;
      } else iq[jz] = ganz(z);
    }
    let fw = zweiHoch(q0);
    for (let i = jz; i >= 0; i--) { q[i] = fw * iq[i]; fw *= TWON24; }
    for (let i = jz; i >= 0; i--) {
      fw = 0;
      for (let k = 0; k <= jp && k <= jz - i; k++) fw += PIO2_TEILE[k] * q[i + k];
      fq[jz - i] = fw;
    }
    fw = 0;
    for (let i = jz; i >= 0; i--) fw += fq[i];
    y[0] = ih === 0 ? fw : -fw;
    fw = fq[0] - fw;
    for (let i = 1; i <= jz; i++) fw += fq[i];
    y[1] = ih === 0 ? fw : -fw;
    return n & 7;
  }

  // e_rem_pio2.c
  const INVPIO2 = 6.36619772367581382433e-01, PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11,
    PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21, PIO2_3 = 2.02226624871116645580e-21,
    PIO2_3T = 8.47842766036889956997e-32;
  function remPio2(x, y) {
    const hx = hi(x), ix = hx & 0x7FFFFFFF;
    if (ix <= 0x3FE921FB) { y[0] = x; y[1] = 0; return 0; }
    if (ix < 0x4002D97C) {
      let z;
      if (hx > 0) {
        z = x - PIO2_1;
        if (ix !== 0x3FF921FB) { y[0] = z - PIO2_1T; y[1] = (z - y[0]) - PIO2_1T; } else { z -= PIO2_2; y[0] = z - PIO2_2T; y[1] = (z - y[0]) - PIO2_2T; }
        return 1;
      }
      z = x + PIO2_1;
      if (ix !== 0x3FF921FB) { y[0] = z + PIO2_1T; y[1] = (z - y[0]) + PIO2_1T; } else { z += PIO2_2; y[0] = z + PIO2_2T; y[1] = (z - y[0]) + PIO2_2T; }
      return -1;
    }
    if (ix <= 0x413921FB) {
      let t = Math.abs(x);
      const n = ganz(t * INVPIO2 + 0.5), fn = n;
      let r = t - fn * PIO2_1, w = fn * PIO2_1T;
      if (n < 32 && ix !== NPIO2_HW[n - 1]) y[0] = r - w;
      else {
        const j = ix >> 20;
        y[0] = r - w;
        let i = j - ((hi(y[0]) >> 20) & 0x7FF);
        if (i > 16) {
          t = r; w = fn * PIO2_2; r = t - w; w = fn * PIO2_2T - ((t - r) - w); y[0] = r - w;
          i = j - ((hi(y[0]) >> 20) & 0x7FF);
          if (i > 49) { t = r; w = fn * PIO2_3; r = t - w; w = fn * PIO2_3T - ((t - r) - w); y[0] = r - w; }
        }
      }
      y[1] = (r - y[0]) - w;
      if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
      return n;
    }
    if (ix >= 0x7FF00000) { y[0] = y[1] = x - x; return 0; }
    const e0 = (ix >> 20) - 1046;
    let z = worte(ix - (e0 << 20), lo(x));
    const tx = [0, 0, 0];
    for (let i = 0; i < 2; i++) { tx[i] = ganz(z); z = (z - tx[i]) * TWO24; }
    tx[2] = z;
    let nx = 3;
    while (tx[nx - 1] === 0) nx--;
    const n = kernelRemPio2(tx.slice(0, nx), y, e0);
    if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
    return n;
  }

  // k_cos.c, k_sin.c, k_tan.c
  function kCos(x, y) {
    const ix = hi(x) & 0x7FFFFFFF;
    if (ix < 0x3E400000 && ganz(x) === 0) return 1;
    const z = x * x;
    const r = z * (4.16666666666666019037e-02 + z * (-1.38888888888741095749e-03 + z * (2.48015872894767294178e-05 +
      z * (-2.75573143513906633035e-07 + z * (2.08757232129817482790e-09 + z * -1.13596475577881948265e-11)))));
    if (ix < 0x3FD33333) return 1 - (0.5 * z - (z * r - x * y));
    const qx = ix > 0x3FE90000 ? 0.28125 : worte(ix - 0x00200000, 0);
    const iz = 0.5 * z - qx, a = 1 - qx;
    return a - (iz - (z * r - x * y));
  }
  function kSin(x, y, iy) {
    const ix = hi(x) & 0x7FFFFFFF;
    if (ix < 0x3E400000 && ganz(x) === 0) return x;
    const z = x * x, v = z * x;
    const r = 8.33333333332248946124e-03 + z * (-1.98412698298579493134e-04 + z * (2.75573137070700676789e-06 +
      z * (-2.50507602534068634195e-08 + z * 1.58969099521155010221e-10)));
    const S1 = -1.66666666666666324348e-01;
    return iy === 0 ? x + v * (S1 + z * r) : x - ((z * (0.5 * y - v * r) - y) - v * S1);
  }
  const T = [3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02, 2.18694882948595424599e-02,
    8.86323982359930005737e-03, 3.59207910759131235356e-03, 1.45620945432529025516e-03, 5.88041240820264096874e-04,
    2.46463134818469906812e-04, 7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
    2.59073051863633712884e-05];
  const PIO4 = 7.85398163397448278999e-01, PIO4LO = 3.06161699786838301793e-17;
  function kTan(x, y, iy) {
    const hx = hi(x), ix = hx & 0x7FFFFFFF;
    let z, w, v, s, r, a, t;
    if (ix < 0x3E300000 && ganz(x) === 0) {
      if (((ix | lo(x)) | (iy + 1)) === 0) return 1 / Math.abs(x);
      if (iy === 1) return x;
      w = x + y; z = ohneLo(w); v = y - (z - x);
      a = -1 / w; t = ohneLo(a); s = 1 + t * z;
      return t + a * (s + t * v);
    }
    if (ix >= 0x3FE59428) {
      if (hx < 0) { x = -x; y = -y; }
      z = PIO4 - x; w = PIO4LO - y; x = z + w; y = 0;
    }
    z = x * x; w = z * z;
    r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))));
    v = z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12])))));
    s = z * x;
    r = y + z * (s * (r + v) + y);
    r += T[0] * s;
    w = x + r;
    if (ix >= 0x3FE59428) { v = iy; return (1 - ((hx >> 30) & 2)) * (v - 2 * (x - (w * w / (w + v) - r))); }
    if (iy === 1) return w;
    z = ohneLo(w); v = r - (z - x);
    a = -1 / w; t = ohneLo(a); s = 1 + t * z;
    return t + a * (s + t * v);
  }

  const yy = [0, 0];
  function sin(x) {
    const ix = hi(x) & 0x7FFFFFFF;
    if (ix <= 0x3FE921FB) return kSin(x, 0, 0);
    if (ix >= 0x7FF00000) return x - x;
    switch (remPio2(x, yy) & 3) {
      case 0: return kSin(yy[0], yy[1], 1);
      case 1: return kCos(yy[0], yy[1]);
      case 2: return -kSin(yy[0], yy[1], 1);
      default: return -kCos(yy[0], yy[1]);
    }
  }
  function cos(x) {
    const ix = hi(x) & 0x7FFFFFFF;
    if (ix <= 0x3FE921FB) return kCos(x, 0);
    if (ix >= 0x7FF00000) return x - x;
    switch (remPio2(x, yy) & 3) {
      case 0: return kCos(yy[0], yy[1]);
      case 1: return -kSin(yy[0], yy[1], 1);
      case 2: return -kCos(yy[0], yy[1]);
      default: return kSin(yy[0], yy[1], 1);
    }
  }
  function tan(x) {
    const ix = hi(x) & 0x7FFFFFFF;
    if (ix <= 0x3FE921FB) return kTan(x, 0, 1);
    if (ix >= 0x7FF00000) return x - x;
    const n = remPio2(x, yy);
    return kTan(yy[0], yy[1], 1 - ((n & 1) << 1));
  }

  // e_asin.c, e_acos.c (gemeinsame rationale Näherung R(z) = p/q)
  const PIO2_HI = 1.57079632679489655800e+00, PIO2_LO = 6.12323399573676603587e-17, PIO4_HI = 7.85398163397448278999e-01;
  const pS = (z) => z * (1.66666666666666657415e-01 + z * (-3.25565818622400915405e-01 + z * (2.01212532134862925881e-01 +
    z * (-4.00555345006794114027e-02 + z * (7.91534994289814532176e-04 + z * 3.47933107596021167570e-05)))));
  const qS = (z) => 1 + z * (-2.40339491173441421878e+00 + z * (2.02094576023350569471e+00 + z * (-6.88283971605453293030e-01 +
    z * 7.70381505559019352791e-02)));
  function asin(x) {
    const hx = hi(x), ix = hx & 0x7FFFFFFF;
    let t = 0, w, p, q, c, r, s;
    if (ix >= 0x3FF00000) {
      if (((ix - 0x3FF00000) | lo(x)) === 0) return x * PIO2_HI + x * PIO2_LO;
      return NaN;
    } else if (ix < 0x3FE00000) {
      if (ix < 0x3E400000) { if (1.0e300 + x > 1) return x; } else t = x * x;
      p = pS(t); q = qS(t); w = p / q;
      return x + x * w;
    }
    w = 1 - Math.abs(x); t = w * 0.5;
    p = pS(t); q = qS(t); s = Math.sqrt(t);
    if (ix >= 0x3FEF3333) {
      w = p / q;
      t = PIO2_HI - (2 * (s + s * w) - PIO2_LO);
    } else {
      w = ohneLo(s);
      c = (t - w * w) / (s + w);
      r = p / q;
      p = 2 * s * r - (PIO2_LO - 2 * c);
      q = PIO4_HI - 2 * w;
      t = PIO4_HI - (p - q);
    }
    return hx > 0 ? t : -t;
  }
  function acos(x) {
    const hx = hi(x), ix = hx & 0x7FFFFFFF;
    let z, p, q, r, w, s, c, df;
    if (ix >= 0x3FF00000) {
      if (((ix - 0x3FF00000) | lo(x)) === 0) return hx > 0 ? 0 : 3.14159265358979311600e+00 + 2 * PIO2_LO;
      return NaN;
    }
    if (ix < 0x3FE00000) {
      if (ix <= 0x3C600000) return PIO2_HI + PIO2_LO;
      z = x * x; p = pS(z); q = qS(z); r = p / q;
      return PIO2_HI - (x - (PIO2_LO - x * r));
    } else if (hx < 0) {
      z = (1 + x) * 0.5; p = pS(z); q = qS(z); s = Math.sqrt(z); r = p / q;
      w = r * s - PIO2_LO;
      return 3.14159265358979311600e+00 - 2 * (s + w);
    }
    z = (1 - x) * 0.5; s = Math.sqrt(z); df = ohneLo(s);
    c = (z - df * df) / (s + df);
    p = pS(z); q = qS(z); r = p / q;
    w = r * s + c;
    return 2 * (df + w);
  }

  // s_atan.c, e_atan2.c
  const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
  const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
  const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
    9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
    4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
  function atan(x) {
    const hx = hi(x), ix = hx & 0x7FFFFFFF;
    let id;
    if (ix >= 0x44100000) {
      if (x !== x) return x + x;
      return hx > 0 ? ATANHI[3] + ATANLO[3] : -ATANHI[3] - ATANLO[3];
    }
    if (ix < 0x3FDC0000) {
      if (ix < 0x3E400000) { if (1.0e300 + x > 1) return x; }
      id = -1;
    } else {
      x = Math.abs(x);
      if (ix < 0x3FF30000) {
        if (ix < 0x3FE60000) { id = 0; x = (2 * x - 1) / (2 + x); } else { id = 1; x = (x - 1) / (x + 1); }
      } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1 + 1.5 * x); } else { id = 3; x = -1 / x; }
    }
    let z = x * x;
    const w = z * z;
    const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
    const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
    if (id < 0) return x - x * (s1 + s2);
    z = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
    return hx < 0 ? -z : z;
  }
  const TINY = 1.0e-300, PI_O_4 = 7.8539816339744827900E-01, PI_O_2 = 1.5707963267948965580E+00,
    PI = 3.1415926535897931160E+00, PI_LO = 1.2246467991473531772E-16;
  function atan2(y, x) {
    if (x !== x || y !== y) return x + y;
    if (x === 1) return atan(y);
    const hx = hi(x), lx = lo(x), hy = hi(y), ly = lo(y);
    const ix = hx & 0x7FFFFFFF, iy = hy & 0x7FFFFFFF;
    let m = ((hy >> 31) & 1) | ((hx >> 30) & 2);
    if ((iy | ly) === 0) return m <= 1 ? y : (m === 2 ? PI + TINY : -PI - TINY);
    if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
    if (ix === 0x7FF00000) {
      if (iy === 0x7FF00000) return [PI_O_4 + TINY, -PI_O_4 - TINY, 3 * PI_O_4 + TINY, -3 * PI_O_4 - TINY][m];
      return [0, -0, PI + TINY, -PI - TINY][m];
    }
    if (iy === 0x7FF00000) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;
    const k = (iy - ix) >> 20;
    let z;
    if (k > 60) { z = PI_O_2 + 0.5 * PI_LO; m &= 1; } else if (hx < 0 && k < -60) z = 0; else z = atan(Math.abs(y / x));
    switch (m) {
      case 0: return z;
      case 1: return -z;
      case 2: return PI - (z - PI_LO);
      default: return (z - PI_LO) - PI;
    }
  }
  // K-137: fester Rechenweg grad · (π / 180) bzw. bogen · (180 / π) – die Konstanten sind korrekt gerundete Quotienten
  const BOGEN_PRO_GRAD = Math.PI / 180, GRAD_PRO_BOGEN = 180 / Math.PI;
  return { sin, cos, tan, asin, acos, atan, atan2, bogen: (x) => x * BOGEN_PRO_GRAD, grad: (x) => x * GRAD_PRO_BOGEN };
})();

// ---------------------------------------------------------------- K-111/U-72: log, log10, log2, exp (fdlibm, wie V8 12.x)
// Wie WINKEL: nicht Math.log & Co. (Chrome 156 liefert andere Bits als Node 22 und die Wasm-Laufzeit). Port derselben
// Routinen wie laufzeit/src/zahl.rs bzw. V8 src/base/ieee754.cc: Sun e_log.c, e_log10.c (über log), FreeBSD e_log2.c mit
// k_log1p, fdlibm e_exp.c mit V8-Sonderfall exp(1) = E. Nur Double-Operationen. fdlibm-Lizenzvermerk siehe WINKEL.
const LOGEXP = (function () {
  const dv = new DataView(new ArrayBuffer(8));
  const hi = (x) => { dv.setFloat64(0, x); return dv.getInt32(0); };
  const lo = (x) => { dv.setFloat64(0, x); return dv.getUint32(4); };
  const mitHi = (x, h) => { dv.setFloat64(0, x); dv.setInt32(0, h); return dv.getFloat64(0); };
  const ohneLo = (x) => { dv.setFloat64(0, x); dv.setUint32(4, 0); return dv.getFloat64(0); };
  const worte = (h, l) => { dv.setInt32(0, h); dv.setUint32(4, l); return dv.getFloat64(0); };
  const LG1 = 6.666666666666735130e-01, LG2 = 3.999999999940941908e-01, LG3 = 2.857142874366239149e-01,
    LG4 = 2.222219843214978396e-01, LG5 = 1.818357216161805012e-01, LG6 = 1.531383769920937332e-01,
    LG7 = 1.479819860511658591e-01, LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10,
    TWO54 = 1.80143985094819840000e+16;

  // e_log.c
  function log(x) {
    let hx = hi(x), k = 0;
    const lx = lo(x);
    if (hx < 0x00100000) {
      if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
      if (hx < 0) return NaN;
      k -= 54; x *= TWO54; hx = hi(x);
    }
    if (hx >= 0x7FF00000) return x + x;
    k += (hx >> 20) - 1023;
    hx &= 0x000FFFFF;
    let i = (hx + 0x95F64) & 0x100000;
    x = mitHi(x, hx | (i ^ 0x3FF00000));
    k += i >> 20;
    const f = x - 1;
    if ((0x000FFFFF & (2 + hx)) < 3) {
      if (f === 0) { if (k === 0) return 0; return k * LN2_HI + k * LN2_LO; }
      const r = f * f * (0.5 - 0.33333333333333333 * f);
      if (k === 0) return f - r;
      return k * LN2_HI - ((r - k * LN2_LO) - f);
    }
    const s = f / (2 + f), dk = k, z = s * s;
    i = hx - 0x6147A;
    const w = z * z, j = 0x6B851 - hx;
    const t1 = w * (LG2 + w * (LG4 + w * LG6));
    const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
    i |= j;
    const r = t2 + t1;
    if (i > 0) {
      const hfsq = 0.5 * f * f;
      return k === 0 ? f - (hfsq - s * (hfsq + r)) : dk * LN2_HI - ((hfsq - (s * (hfsq + r) + dk * LN2_LO)) - f);
    }
    return k === 0 ? f - s * (f - r) : dk * LN2_HI - ((s * (f - r) - dk * LN2_LO) - f);
  }

  // e_log10.c
  const IVLN10 = 4.34294481903251816668e-01, LOG10_2HI = 3.01029995663611771306e-01, LOG10_2LO = 3.69423907715893078616e-13;
  function log10(x) {
    let hx = hi(x), k = 0;
    const lx = lo(x);
    if (hx < 0x00100000) {
      if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
      if (hx < 0) return NaN;
      k -= 54; x *= TWO54; hx = hi(x);
    }
    if (hx >= 0x7FF00000) return x + x;
    k += (hx >> 20) - 1023;
    const i = k >>> 31;
    hx = (hx & 0x000FFFFF) | ((0x3FF - i) << 20);
    const y = k + i;
    x = mitHi(x, hx);
    const z = y * LOG10_2LO + IVLN10 * log(x);
    return z + y * LOG10_2HI;
  }

  // k_log.h k_log1p(f): log(1+f) - f + hfsq für |f| klein
  function kLog1p(f) {
    const s = f / (2 + f), z = s * s, w = z * z;
    const t1 = w * (LG2 + w * (LG4 + w * LG6));
    const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
    const r = t2 + t1, hfsq = 0.5 * f * f;
    return s * (hfsq + r);
  }

  // FreeBSD e_log2.c
  const IVLN2HI = 1.44269504072144627571e+00, IVLN2LO = 1.67517131648865118353e-10;
  function log2(x) {
    let hx = hi(x), k = 0;
    const lx = lo(x);
    if (hx < 0x00100000) {
      if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
      if (hx < 0) return NaN;
      k -= 54; x *= TWO54; hx = hi(x);
    }
    if (hx >= 0x7FF00000) return x + x;
    if (hx === 0x3FF00000 && lx === 0) return 0;
    k += (hx >> 20) - 1023;
    hx &= 0x000FFFFF;
    const i = (hx + 0x95F64) & 0x100000;
    x = mitHi(x, hx | (i ^ 0x3FF00000));
    k += i >> 20;
    const y = k, f = x - 1, hfsq = 0.5 * f * f, r = kLog1p(f);
    const h = ohneLo(f - hfsq);
    const l = (f - h) - hfsq + r;
    let valHi = h * IVLN2HI, valLo = (l + h) * IVLN2LO + l * IVLN2HI;
    const w = y + valHi;
    valLo += (y - w) + valHi;
    valHi = w;
    return valLo + valHi;
  }

  // e_exp.c (V8: exp(1) = E)
  const HALF = [0.5, -0.5], O_THRESHOLD = 7.09782712893383973096e+02, U_THRESHOLD = -7.45133219101941108420e+02,
    LN2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01], LN2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10],
    INVLN2 = 1.44269504088896338700e+00, P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03,
    P3 = 6.61375632143793436117e-05, P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08,
    E = 2.718281828459045, HUGE = 1.0e+300, TWOM1000 = 9.33263618503218878990e-302, TWO1023 = 8.988465674311579539e307;
  function exp(x) {
    let hi_ = 0, lo_ = 0, k = 0;
    const hx0 = hi(x), xsb = (hx0 >> 31) & 1, hx = hx0 & 0x7FFFFFFF;
    if (hx >= 0x40862E42) {
      if (hx >= 0x7FF00000) {
        if (((hx & 0xFFFFF) | lo(x)) !== 0) return x + x;
        return xsb === 0 ? x : 0;
      }
      if (x > O_THRESHOLD) return HUGE * HUGE;
      if (x < U_THRESHOLD) return TWOM1000 * TWOM1000;
    }
    if (hx > 0x3FD62E42) {
      if (hx < 0x3FF0A2B2) {
        if (x === 1) return E;
        hi_ = x - LN2HI[xsb]; lo_ = LN2LO[xsb]; k = 1 - xsb - xsb;
      } else {
        k = Math.trunc(INVLN2 * x + HALF[xsb]);
        hi_ = x - k * LN2HI[0]; lo_ = k * LN2LO[0];
      }
      x = hi_ - lo_;
    } else if (hx < 0x3E300000) {
      if (HUGE + x > 1) return 1 + x;
    } else k = 0;
    const t = x * x;
    const twopk = k >= -1021 ? worte((0x3FF00000 + (k << 20)) | 0, 0) : worte((0x3FF00000 + ((k + 1000) << 20)) | 0, 0);
    const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
    if (k === 0) return 1 - ((x * c) / (c - 2) - x);
    const y = 1 - ((lo_ - (x * c) / (2 - c)) - hi_);
    if (k >= -1021) return k === 1024 ? y * 2 * TWO1023 : y * twopk;
    return y * twopk * TWOM1000;
  }
  return { log, log10, log2, exp };
})();

const MATHE_M = tabelle({
  'wurzel': function (m, pos) { return Math.sqrt(this.zahl(pos[0], 'wurzel')); },
  'max': function (m, pos) { if (!pos.length) throw this.ananas('RechenAnanas', 'max() ohne Zahlen?'); return Math.max.apply(null, pos.map(x => this.zahl(x, 'max'))); },
  'min': function (m, pos) { if (!pos.length) throw this.ananas('RechenAnanas', 'min() ohne Zahlen?'); return Math.min.apply(null, pos.map(x => this.zahl(x, 'min'))); },
  'abs': function (m, pos) { return Math.abs(this.zahl(pos[0], 'abs')); },
  'runden': function (m, pos) { return rundeAuf(this.zahl(pos[0], 'runden'), pos.length > 1 ? this.ganzzahl(pos[1], 'runden') : 0); },
  'boden': function (m, pos) { return Math.floor(this.zahl(pos[0], 'boden')); },
  'decke': function (m, pos) { return Math.ceil(this.zahl(pos[0], 'decke')); },
  'potenz': function (m, pos) { return Math.pow(this.zahl(pos[0], 'potenz'), this.zahl(pos[1], 'potenz')); },
  // K-111/U-72: fdlibm-Port LOGEXP statt Math.* (Sonderfälle: log(0) → -Infinity, log(-1) → NaN, exp(710) → Infinity)
  'log': function (m, pos) { return LOGEXP.log(this.zahl(pos[0], 'log')); },
  'log10': function (m, pos) { return LOGEXP.log10(this.zahl(pos[0], 'log10')); },
  'log2': function (m, pos) { return LOGEXP.log2(this.zahl(pos[0], 'log2')); },
  'exp': function (m, pos) { return LOGEXP.exp(this.zahl(pos[0], 'exp')); },
  // K-137: Winkelfunktionen im Bogenmaß – fdlibm-Port WINKEL statt Math.* (in jedem JS-Motor und in Wasm dieselben Bits)
  'sin': function (m, pos) { return WINKEL.sin(this.zahl(pos[0], 'sin')); },
  'cos': function (m, pos) { return WINKEL.cos(this.zahl(pos[0], 'cos')); },
  'tan': function (m, pos) { return WINKEL.tan(this.zahl(pos[0], 'tan')); },
  'asin': function (m, pos) { return WINKEL.asin(this.zahl(pos[0], 'asin')); },
  'acos': function (m, pos) { return WINKEL.acos(this.zahl(pos[0], 'acos')); },
  'atan': function (m, pos) { return WINKEL.atan(this.zahl(pos[0], 'atan')); },
  'atan2': function (m, pos) { const y = this.zahl(pos[0], 'atan2'); return WINKEL.atan2(y, this.zahl(pos[1], 'atan2')); },
  'bogen': function (m, pos) { return WINKEL.bogen(this.zahl(pos[0], 'bogen')); },
  'grad': function (m, pos) { return WINKEL.grad(this.zahl(pos[0], 'grad')); }
});
