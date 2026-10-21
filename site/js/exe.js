/*
 * PizzaExe – baut im Browser eine eigenständige EXE aus einem .pkarton (UMD, ohne Abhängigkeiten).
 *
 *   PizzaExe.ziele(optionen?)                      → Promise<{ version, format, trailer, ziele: [{ id, name, datei, endung, groesse, sha256 }] }>
 *   PizzaExe.baue(pkartonBytes, ziel, optionen?)    → Promise<Blob>   (Host-Binary laden, sha256 prüfen, .pkarton + Trailer anhängen)
 *   PizzaExe.verbinde(hostBytes, pkartonBytes, { theke }?) → Uint8Array (synchron, gleiche Bytes wie `pizza-host exe`)
 *   PizzaExe.brauchtTheke(pkartonBytes)             → Promise<boolean> (importiert die Gruppe `theke`, pizza.ui_*)
 *   PizzaExe.dateiname(name, ziel)                  → z. B. "hallo-welt.exe" / "hallo-welt-linux-x64"
 *   PizzaExe.hinweis(ziel)                          → kurzer Text für die UI (SmartScreen / chmod +x)
 *
 * optionen: { basis = "bin/" (URL-Präfix von ziele.json und Binaries), fetch = globalThis.fetch, pruefen = true }
 * Format (host/README.md): [Host-Binary][pkarton][u64 LE Länge][8 Byte "PKARTON1"].
 * Windows (PE): Subsystem im PE-Kopf = WINDOWS (2) für Programme mit Theke (kein Terminal beim Doppelklick),
 * sonst CONSOLE (3) – wie host/src/karton.rs.
 */
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.PizzaExe = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAGIE = [0x50, 0x4b, 0x41, 0x52, 0x54, 0x4f, 0x4e, 0x31]; // "PKARTON1"
  var zwischenspeicher = {}; // URL → Promise<Uint8Array>
  var zieleCache = {};

  function opt(o) {
    o = o || {};
    var basis = o.basis == null ? 'bin/' : String(o.basis);
    if (basis && basis.charAt(basis.length - 1) !== '/') basis += '/';
    var f = o.fetch || (typeof fetch === 'function' ? fetch.bind(typeof self !== 'undefined' ? self : globalThis) : null);
    return { basis: basis, fetch: f, pruefen: o.pruefen !== false };
  }

  function alsBytes(x) {
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    throw new TypeError('PizzaExe: Bytes erwartet (Uint8Array/ArrayBuffer).');
  }

  function istWasm(b) {
    return b.length >= 8 && b[0] === 0 && b[1] === 0x61 && b[2] === 0x73 && b[3] === 0x6d;
  }

  /** Länge eines bereits angehängten .pkarton (inkl. Trailer) oder 0. */
  function anhangLaenge(b) {
    var n = b.length;
    if (n < 16) return 0;
    for (var i = 0; i < 8; i++) if (b[n - 8 + i] !== MAGIE[i]) return 0;
    var len = 0;
    for (var j = 7; j >= 0; j--) len = len * 256 + b[n - 16 + j];
    return len <= n - 16 ? len + 16 : 0;
  }

  /** Position des Subsystem-Felds im PE-Kopf (e_lfanew + 24 + 68) oder -1 (kein PE, z. B. ELF). */
  function subsystemPos(b) {
    if (b.length < 0x40 || b[0] !== 0x4d || b[1] !== 0x5a) return -1; // "MZ"
    var pe = (b[0x3c] | (b[0x3d] << 8) | (b[0x3e] << 16) | (b[0x3f] << 24)) >>> 0;
    var opt = pe + 24;
    if (b.length < opt + 70 || b[pe] !== 0x50 || b[pe + 1] !== 0x45 || b[pe + 2] !== 0 || b[pe + 3] !== 0) return -1;
    var magie = b[opt] | (b[opt + 1] << 8);
    if (magie !== 0x10b && magie !== 0x20b) return -1;
    return opt + 68;
  }

  /** Subsystem eines PE-Binaries (2 = Fenster, 3 = Konsole) oder null. */
  function subsystem(b) {
    b = alsBytes(b);
    var p = subsystemPos(b);
    return p < 0 ? null : b[p] | (b[p + 1] << 8);
  }

  function brauchtTheke(pkarton) {
    try {
      var p = alsBytes(pkarton);
      return WebAssembly.compile(p).then(function (m) {
        return WebAssembly.Module.imports(m).some(function (i) { return i.module === 'pizza' && /^ui_/.test(i.name); });
      });
    } catch (e) { return Promise.reject(e); }
  }

  function verbinde(host, pkarton, optionen) {
    host = alsBytes(host);
    pkarton = alsBytes(pkarton);
    var theke = !!(optionen && optionen.theke);
    var basisLen = host.length - anhangLaenge(host); // wie karton::baue_exe: alten Anhang ersetzen
    var aus = new Uint8Array(basisLen + pkarton.length + 16);
    aus.set(host.subarray(0, basisLen), 0);
    var sp = subsystemPos(aus);
    if (sp >= 0) { aus[sp] = theke ? 2 : 3; aus[sp + 1] = 0; }
    aus.set(pkarton, basisLen);
    var p = basisLen + pkarton.length;
    var len = pkarton.length;
    for (var i = 0; i < 8; i++) { aus[p + i] = len % 256; len = Math.floor(len / 256); }
    aus.set(MAGIE, p + 8);
    return aus;
  }

  function hex(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }

  function sha256(bytes) {
    var c = (typeof crypto !== 'undefined' && crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
    if (!c || !c.subtle) return Promise.resolve(null); // kein sicherer Kontext (http) → nur Größe prüfbar
    return c.subtle.digest('SHA-256', bytes).then(hex);
  }

  function lade(url, o) {
    if (!o.fetch) return Promise.reject(new Error('PizzaExe: fetch nicht verfügbar.'));
    return o.fetch(url).then(function (r) {
      if (!r.ok) throw new Error('PizzaExe: ' + url + ' nicht ladbar (HTTP ' + r.status + ').');
      return r.arrayBuffer();
    }).then(function (ab) { return new Uint8Array(ab); });
  }

  function ziele(optionen) {
    var o = opt(optionen);
    var url = o.basis + 'ziele.json';
    if (!zieleCache[url]) {
      zieleCache[url] = lade(url, o).then(function (b) {
        var j = JSON.parse(new TextDecoder().decode(b));
        if (!j || !Array.isArray(j.ziele)) throw new Error('PizzaExe: ziele.json ungültig.');
        return j;
      });
      zieleCache[url].catch(function () { delete zieleCache[url]; });
    }
    return zieleCache[url];
  }

  function findeZiel(ziel, o) {
    if (ziel && typeof ziel === 'object' && ziel.datei) return Promise.resolve(ziel);
    return ziele(o).then(function (j) {
      for (var i = 0; i < j.ziele.length; i++) if (j.ziele[i].id === ziel) return j.ziele[i];
      throw new Error('PizzaExe: unbekanntes Ziel ' + ziel + '.');
    });
  }

  function ladeHost(z, o) {
    var url = o.basis + z.datei;
    if (!zwischenspeicher[url]) {
      zwischenspeicher[url] = lade(url, o).then(function (b) {
        if (z.groesse != null && b.length !== z.groesse) throw new Error('PizzaExe: ' + z.datei + ' hat die falsche Größe.');
        if (!o.pruefen || !z.sha256) return b;
        return sha256(b).then(function (h) {
          if (h !== null && h !== String(z.sha256).toLowerCase()) throw new Error('PizzaExe: Prüfsumme von ' + z.datei + ' stimmt nicht.');
          return b;
        });
      });
      zwischenspeicher[url].catch(function () { delete zwischenspeicher[url]; });
    }
    return zwischenspeicher[url];
  }

  function baue(pkarton, ziel, optionen) {
    var o = opt(optionen);
    var p;
    try { p = alsBytes(pkarton); } catch (e) { return Promise.reject(e); }
    if (!istWasm(p)) return Promise.reject(new Error('PizzaExe: kein gültiges .pkarton (WebAssembly-Magie fehlt).'));
    // optionen werden auch für ziele() gebraucht (basis/fetch)
    // Kompilieren verboten (CSP ohne 'wasm-unsafe-eval') → wie bisher Konsolen-EXE statt Abbruch.
    var theke = brauchtTheke(p).catch(function () { return false; });
    return Promise.all([findeZiel(ziel, optionen), theke]).then(function (r) {
      var z = r[0], theke = r[1];
      return ladeHost(z, o).then(function (host) {
        return new Blob([verbinde(host, p, { theke: theke })], { type: 'application/octet-stream' });
      });
    });
  }

  function dateiname(name, ziel) {
    var basis = String(name || 'pizza').replace(/\.(pizza|pkarton)$/i, '')
      .replace(/[^A-Za-z0-9äöüÄÖÜß._-]+/g, '-').replace(/^-+|-+$/g, '') || 'pizza';
    var id = ziel && typeof ziel === 'object' ? ziel.id : ziel;
    var endung = ziel && typeof ziel === 'object' && ziel.endung != null ? ziel.endung : (/^windows/.test(id || '') ? '.exe' : '');
    if (endung === '.exe') return basis + '.exe';
    return basis + (id ? '-' + id : '');
  }

  function hinweis(ziel) {
    var id = ziel && typeof ziel === 'object' ? ziel.id : String(ziel || '');
    if (/^windows/.test(id)) return 'Die EXE ist nicht signiert: Windows SmartScreen warnt evtl. („Weitere Informationen“ → „Trotzdem ausführen“), manche Virenscanner schlagen an. Konsolenprogramme öffnen ein Terminal; Programme mit Theke starten ohne Terminal (aus der Eingabeaufforderung gestartet, erscheinen ihre Ausgaben dort): programm.exe [args]';
    if (/^linux/.test(id)) return 'Heruntergeladene Dateien sind nicht ausführbar: erst „chmod +x datei“, dann „./datei [args]“.';
    return '';
  }

  return { version: '1.0.0', ziele: ziele, baue: baue, verbinde: verbinde, brauchtTheke: brauchtTheke, subsystem: subsystem, dateiname: dateiname, hinweis: hinweis, _anhangLaenge: anhangLaenge };
});
