/* Herd – Zeichner (Paket H6, HERD.md §7.2). Klassisches Skript, läuft im Render-Worker (render-worker.js) und im
 * Hauptthread-Rückfall (ui/src/herd.js lädt es per <script>). Braucht die Glue der Glut (glut.js → wasm_bindgen).
 *
 *   HerdZeichner.starte({ canvas, puffer, port, breite, hoehe, wasmUrl, melde }) → Promise<Zeichner>
 *     canvas   OffscreenCanvas (Worker) oder HTMLCanvasElement (Hauptthread)
 *     puffer   SharedArrayBuffer des Herd-Takt-Wegs (Layout unten) – der Zeichner ist der EINZIGE Schreiber von Takten
 *     port     MessagePort: Bildpakete (ArrayBuffer, übertragen) direkt vom Programm-Worker
 *     breite/hoehe  Gerätepixel
 *     manuell  (nur E2E) keine Takte anfordern – die Seite schreibt sie selbst (window.__herdTakt), z. B. aus .ereignisse
 *     melde(n) Rückmeldung an die Seite: {typ:"bereit", schnittstelle, adapter} · {typ:"fehler", art, text} ·
 *              {typ:"statistik", fps, bild, drawCalls, instanzen, schnittstelle}
 *   Zeichner: eingabe(ereignis) · groesse(b, h) · stopp()
 *
 * Takt-Weg (SAB, Int32): [0] Folgenummer (vom Zeichner hochgezählt, Programm-Worker wartet per Atomics.wait darauf),
 *   [1] geschlossen (≠ 0: Fenster zu – setzen Seite oder Zeichner, zurückgesetzt vom Programm-Worker beim nächsten `fenster`),
 *   [2] Länge der JSON-Nachricht in Bytes, ab Byte 16 UTF-8 `{"typ":"takt","anzahl":n,"tasten":[…],"maus":[x,y],"knoepfe":k}`.
 *   Es ist immer höchstens ein Takt ausstehend (der nächste wird erst nach dem Zeichnen des Bildes angefordert), deshalb
 *   überschreibt der Zeichner die Nachricht nie, während der Programm-Worker sie liest.
 * Nachholregel (HERD.md §5): anzahl = vergangene 1/60-s-Schritte seit dem letzten Takt, 1 … 4; was darüber liegt, verfällt.
 */
(function (global) {
  "use strict";
  var SCHRITT_MS = 1000 / 60;
  var MAX_NACHHOLEN = 4;
  var KOPF = 16;
  var KEIN_KONTEXT = "Dieser Browser kann weder WebGPU noch WebGL2 – der Herd braucht eines davon.";
  var glueBereit = null;

  function ladeGlue(wasmUrl) {
    if (!glueBereit) {
      if (typeof wasm_bindgen !== "function") return Promise.reject(new Error("glut.js ist nicht geladen"));
      glueBereit = wasm_bindgen({ module_or_path: wasmUrl });
    }
    return glueBereit;
  }

  function jetzt() { return performance.now(); }

  /** Schreibt das Geschlossen-Kennzeichen und weckt den Programm-Worker. */
  function setzeGeschlossen(puffer) {
    if (!puffer) return;
    var c = new Int32Array(puffer, 0, 4);
    Atomics.store(c, 1, 1);
    Atomics.notify(c, 0);
  }

  function starte(o) {
    var melde = typeof o.melde === "function" ? o.melde : function () {};
    var ctrl = new Int32Array(o.puffer, 0, 4);
    var daten = new Uint8Array(o.puffer, KOPF);
    var kodierer = new TextEncoder();
    var g = null, aus = false, rafId = 0;
    var paket = null;            // empfangenes, noch nicht gezeichnetes Bildpaket (Uint8Array)
    var ausstehend = false;      // Takt angefordert, Bild noch nicht da
    var t0 = 0, gesendet = 0;    // Nachholrechnung: Takte seit t0
    var gehalten = new Set(), kurz = new Set(), maus = [0, 0], knoepfe = 0, knoepfeKurz = 0;
    var statT = jetzt(), statBilder = 0, letzteStat = null, letzteBildnr = 0;
    var raf = typeof global.requestAnimationFrame === "function" ? global.requestAnimationFrame.bind(global) : null;
    var caf = typeof global.cancelAnimationFrame === "function" ? global.cancelAnimationFrame.bind(global) : function () {};

    /** Fehler melden und aufhören. schliessen: auch das Programm benachrichtigen (beim Anlegen entscheidet die Seite –
     *  sie versucht ggf. noch den Hauptthread-Rückfall). */
    function fehler(art, text, schliessen) {
      if (aus) return;
      melde({ typ: "fehler", art: art, text: text });
      stopp();
      if (schliessen) setzeGeschlossen(o.puffer);
    }

    function taktAnfordern() {
      var t = jetzt();
      var anzahl;
      if (gesendet === 0 && t0 === 0) { t0 = t; anzahl = 1; gesendet = 1; }
      else {
        var soll = Math.floor((t - t0) / SCHRITT_MS) + 1;
        if (soll - gesendet > MAX_NACHHOLEN) gesendet = soll - MAX_NACHHOLEN;   // zu weit zurück: Rest verfällt
        anzahl = soll - gesendet;
        if (anzahl < 1) return false;                                           // schneller als 60 Hz: auf den nächsten Schlag warten
        gesendet = soll;
      }
      var tasten = [];
      gehalten.forEach(function (n) { tasten.push(n); });
      kurz.forEach(function (n) { if (!gehalten.has(n)) tasten.push(n); });
      kurz.clear();
      var nachricht = { typ: "takt", anzahl: anzahl, tasten: tasten, maus: [maus[0], maus[1]], knoepfe: knoepfe | knoepfeKurz };
      knoepfeKurz = 0;
      var bytes = kodierer.encode(JSON.stringify(nachricht));
      if (bytes.length > daten.length) bytes = kodierer.encode(JSON.stringify({ typ: "takt", anzahl: anzahl }));
      daten.set(bytes);
      Atomics.store(ctrl, 2, bytes.length);
      Atomics.add(ctrl, 0, 1);
      Atomics.notify(ctrl, 0);
      ausstehend = true;
      return true;
    }

    function schlag() {
      rafId = 0;
      if (aus) return;
      if (paket) {
        var p = paket;
        paket = null;
        try { g.bild(p); }
        catch (e) { fehler("zeichnen", "Der Herd konnte nicht zeichnen: " + (e && e.message ? e.message : String(e)), true); return; }
        letzteBildnr = p.length >= 12 ? new DataView(p.buffer, p.byteOffset, p.byteLength).getUint32(8, true) : letzteBildnr;
        statBilder++;
      }
      if (!o.manuell && !ausstehend && Atomics.load(ctrl, 1) === 0) taktAnfordern();
      var t = jetzt();
      if (t - statT >= 1000) {
        var s = g.statistik();
        letzteStat = { typ: "statistik", fps: Math.round(statBilder * 1000 / (t - statT)), bild: letzteBildnr, drawCalls: s[0], instanzen: s[2] + s[3], schnittstelle: g.schnittstelle() };
        melde(letzteStat);
        statT = t; statBilder = 0;
      }
      plane();
    }

    function plane() {
      if (aus || rafId || !g) return;
      // weiter schlagen, solange ein Bild zu zeichnen ist oder ein Takt angefordert werden kann
      if (paket || (!ausstehend && !o.manuell)) rafId = raf(schlag);
    }

    function empfange(m) {
      if (aus) return;
      var d = m.data;
      if (d instanceof ArrayBuffer) paket = new Uint8Array(d);
      else if (d && d.buffer instanceof ArrayBuffer) paket = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
      else return;
      ausstehend = false;
      plane();
    }

    function eingabe(e) {
      if (!e || aus) return;
      if (e.typ === "taste" && typeof e.name === "string") {
        if (e.unten) { gehalten.add(e.name); kurz.add(e.name); } else gehalten.delete(e.name);
      } else if (e.typ === "maus" && isFinite(e.x) && isFinite(e.y)) {
        maus = [e.x, e.y];
      } else if (e.typ === "knopf" && (e.bit === 1 || e.bit === 2 || e.bit === 4)) {
        if (e.unten) { knoepfe |= e.bit; knoepfeKurz |= e.bit; } else knoepfe &= ~e.bit;
        if (isFinite(e.x) && isFinite(e.y)) maus = [e.x, e.y];
      } else if (e.typ === "loslassen") {
        gehalten.clear(); knoepfe = 0;
      }
    }

    function groesse(b, h) {
      if (aus || !g) return;
      b = Math.max(1, Math.round(b)); h = Math.max(1, Math.round(h));
      if (o.canvas.width !== b) o.canvas.width = b;
      if (o.canvas.height !== h) o.canvas.height = h;
      g.groesse(b, h);
    }

    function stopp() {
      if (aus) return;
      aus = true;
      if (rafId) caf(rafId);
      rafId = 0;
      try { o.port.onmessage = null; } catch (e) { /* egal */ }   // schließen tut der Besitzer (Port ggf. zurück an die Seite)
      if (g) { try { g.free(); } catch (e) { /* egal */ } g = null; }
    }

    var zeichner = { eingabe: eingabe, groesse: groesse, stopp: stopp, get statistik() { return letzteStat; } };
    if (!raf) { fehler("kein-raf", "requestAnimationFrame fehlt"); return Promise.resolve(zeichner); }
    return ladeGlue(o.wasmUrl).then(function () {
      if (aus) return zeichner;
      o.canvas.width = Math.max(1, o.breite | 0);
      o.canvas.height = Math.max(1, o.hoehe | 0);
      return wasm_bindgen.GlutWeb.erzeuge(o.canvas, o.canvas.width, o.canvas.height, 4).then(function (glut) {
        if (aus) { glut.free(); return zeichner; }
        g = glut;
        // erst jetzt zustellen lassen: vorher fordert niemand einen Takt an, also kommt auch kein Paket
        o.port.onmessage = empfange;
        melde({ typ: "bereit", schnittstelle: g.schnittstelle(), adapter: g.adapter(), msaa: g.msaa() });
        plane();
        return zeichner;
      });
    }).catch(function (e) {
      var text = e && e.message ? e.message : String(e);
      fehler("kein-kontext", text);
      return zeichner;
    });
  }

  global.HerdZeichner = { starte: starte, setzeGeschlossen: setzeGeschlossen, KEIN_KONTEXT: KEIN_KONTEXT, KOPF: KOPF };
})(typeof self !== "undefined" ? self : this);
