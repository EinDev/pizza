/* Herd – Zeichner (Paket H6, HERD.md §7.2). Klassisches Skript, läuft im Render-Worker (render-worker.js) und im
 * Hauptthread-Rückfall (ui/src/herd.js lädt es per <script>). Braucht die Glue der Glut (glut.js → wasm_bindgen).
 *
 *   HerdZeichner.starte({ canvas, puffer, port, breite, hoehe, wasmUrl, melde }) → Promise<Zeichner>
 *     canvas   OffscreenCanvas (Worker) oder HTMLCanvasElement (Hauptthread)
 *     puffer   SharedArrayBuffer des Herd-Takt-Wegs (Layout unten) – der Zeichner ist der EINZIGE Schreiber von Takten
 *     port     MessagePort direkt vom Programm-Worker: SharedArrayBuffer = Bildfach (einmal je Fenster; Int32 [0] belegt,
 *              Paket ab Byte 16), Zahl n = Bildpaket mit n Bytes im Fach (nach g.bild gibt der Zeichner es frei), ArrayBuffer =
 *              Bildpaket übertragen (zu groß fürs Fach oder Fach noch belegt)
 *     breite/hoehe  Gerätepixel
 *     manuell  (nur E2E) keine Takte anfordern – die Seite schreibt sie selbst (window.__herdTakt), z. B. aus .ereignisse
 *     messung  (nur Messläufe, window.__herdMessung) je rAF Zeitpunkt, Zeit in g.bild, nachgeholte Takte, Wartezeit auf das
 *              Paket – gemeldet etwa jede Sekunde als {typ:"messung", bilder:[{raf, t, ms, dauer, bild, takte, warte, bytes, fach}]}
 *     melde(n) Rückmeldung an die Seite: {typ:"bereit", schnittstelle, adapter} · {typ:"fehler", art, text} ·
 *              {typ:"statistik", fps, bild, drawCalls, instanzen, schnittstelle} ·
 *              {typ:"anlauf", bereitMs, bilder:[{t, abstand, bild, ms}]} – einmal nach den ersten 30 Bildern (Messung wie
 *              `--herd-messung` nativ: t/abstand ab dem Start bzw. vorigen Bild, bild = Bildnummer, ms = Zeit in g.bild)
 *   Zeichner: eingabe(ereignis) · groesse(b, h) · stopp()
 *   Eingabe-Ereignisse (von der Seite): {typ:"taste", name, unten} · {typ:"maus", x, y} · {typ:"knopf", bit, unten, x?, y?} ·
 *     {typ:"bewegung", dx, dy} (Rohbewegung, summiert bis zum nächsten Takt) · {typ:"rad", wert} · {typ:"gefangen", an} ·
 *     {typ:"loslassen"} (Fokusverlust)
 *
 * Takt-Weg (SAB, Int32): [0] Folgenummer (vom Zeichner hochgezählt, Programm-Worker wartet per Atomics.wait darauf),
 *   [1] geschlossen (≠ 0: Fenster zu – setzen Seite oder Zeichner, zurückgesetzt vom Programm-Worker beim nächsten `fenster`),
 *   [2] Länge der JSON-Nachricht in Bytes, ab Byte 16 UTF-8 `{"typ":"takt","anzahl":n,"tasten":[…],"maus":[x,y],"knoepfe":k}`,
 *   dazu nur bei Bedarf `"bewegung":[dx,dy]` (Rohbewegung seit dem letzten Takt, ≠ 0), `"rad":r` (Rasten, ≠ 0) und
 *   `"gefangen":ja|nein` (Mausfang, nur bei Wechsel – SPEC §18.3).
 *   Es ist immer höchstens ein Takt ausstehend (der nächste wird erst nach dem Zeichnen des Bildes angefordert), deshalb
 *   überschreibt der Zeichner die Nachricht nie, während der Programm-Worker sie liest.
 * Nachholregel (HERD.md §5): anzahl = vergangene 1/60-s-Schritte seit dem letzten Takt, 1 … 4; was darüber liegt, verfällt.
 * Ist beim rAF noch kein Schritt fällig, fordert ein Wecker (setTimeout) den Takt zum fälligen Zeitpunkt an (wie nativ).
 * Anlauf: die Uhr beginnt erst im rAF nach dem ersten gezeichneten Bild – das erste Bild (Programmstart, alle Ressourcen,
 * erstes Zeichnen) holt nichts nach. Gezeichnet wird nur im requestAnimationFrame (= Bildwiederholrate, VSync), jeweils das neueste Bildpaket.
 */
(function (global) {
  "use strict";
  var SCHRITT_MS = 1000 / 60;
  var MAX_NACHHOLEN = 4;
  var ANLAUF_BILDER = 30;
  var KOPF = 16;
  var FACH_KOPF = 16;          // Bildfach: Int32 [0] belegt, Paket ab Byte 16 (worker.js FACH_KOPF)
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
    var paketImFach = false;     // paket ist eine Ansicht ins Bildfach (nach g.bild freigeben)
    var fachBelegt = null, fachDaten = null;   // Bildfach des Programm-Workers (SharedArrayBuffer, worker.js herdBruecke)
    var weckId = 0;              // Wecker: Takt war beim rAF noch nicht fällig → zum fälligen Zeitpunkt anfordern
    var ausstehend = false;      // Takt angefordert, Bild noch nicht da
    var t0 = 0, gesendet = 0;    // Nachholrechnung: Takte seit t0
    var angesetzt = false, ersterGezeichnet = false;   // Anlauf: erstes Bild gezeichnet, Uhr danach neu angesetzt
    var tStart = jetzt(), anlauf = { typ: "anlauf", bereitMs: 0, bilder: [] }, tVorher = 0;
    var gehalten = new Set(), kurz = new Set(), maus = [0, 0], knoepfe = 0, knoepfeKurz = 0;
    var bewegung = [0, 0], rad = 0, gefangen = false, gefangenGemeldet = false;   // Mausfang (SPEC §18.3)
    var statT = jetzt(), statBilder = 0, letzteStat = null, letzteBildnr = 0;
    // Messung (o.messung, nur Messläufe): je rAF ein Eintrag, gemeldet ~1×/s als {typ:"messung", bilder:[…]}
    var mess = o.messung ? [] : null, messT = 0, tAnfrage = 0, tEmpfang = 0, paketBytes = 0;
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
        if (anzahl < 1) return false;                                           // schneller als 60 Hz: noch nicht fällig
        gesendet = soll;
      }
      var tasten = [];
      gehalten.forEach(function (n) { tasten.push(n); });
      kurz.forEach(function (n) { if (!gehalten.has(n)) tasten.push(n); });
      kurz.clear();
      var nachricht = { typ: "takt", anzahl: anzahl, tasten: tasten, maus: [maus[0], maus[1]], knoepfe: knoepfe | knoepfeKurz };
      if (bewegung[0] !== 0 || bewegung[1] !== 0) nachricht.bewegung = [bewegung[0], bewegung[1]];
      if (rad !== 0) nachricht.rad = rad;
      if (gefangen !== gefangenGemeldet) { nachricht.gefangen = gefangen; gefangenGemeldet = gefangen; }
      knoepfeKurz = 0; bewegung = [0, 0]; rad = 0;
      var bytes = kodierer.encode(JSON.stringify(nachricht));
      if (bytes.length > daten.length) bytes = kodierer.encode(JSON.stringify({ typ: "takt", anzahl: anzahl }));
      daten.set(bytes);
      Atomics.store(ctrl, 2, bytes.length);
      Atomics.add(ctrl, 0, 1);
      Atomics.notify(ctrl, 0);
      ausstehend = true;
      if (mess) tAnfrage = t;
      return true;
    }

    /** Nächsten Takt anfordern – oder, wenn er noch nicht fällig ist, zum fälligen Zeitpunkt (wie nativ
     *  Taktgeber::faellig). Früher wartete der Zeichner dann bis zum nächsten rAF: läuft der Bildschirm nicht genau mit
     *  60,000 Hz (59,94 Hz, 60,02 Hz …), wandert der rAF-Zeitpunkt langsam über eine Taktgrenze, und dort fiel bei jedem
     *  kleinen Zittern ein Bild aus (0 Takte) und das nächste holte 2 nach – Ruckler „hier und da“, alle 10–20 s. */
    function fordereAn() {
      if (aus || o.manuell || ausstehend || paket || Atomics.load(ctrl, 1) !== 0) return;
      if (taktAnfordern() || weckId) return;
      var bis = t0 + gesendet * SCHRITT_MS - jetzt();
      weckId = setTimeout(wecke, bis > 0 ? Math.ceil(bis) : 0);
    }
    function wecke() { weckId = 0; fordereAn(); }

    /** Bildfach wieder freigeben (das Paket darin ist gezeichnet oder verworfen). */
    function fachFrei() {
      if (paketImFach && fachBelegt) Atomics.store(fachBelegt, 0, 0);
      paketImFach = false;
    }

    function schlag(rafT) {
      rafId = 0;
      if (aus) return;
      var gezeichnet = !!paket;
      var tSchlag = mess ? jetzt() : 0, msBild = 0, warteMs = -1, nrVor = letzteBildnr, bytesJetzt = paketBytes, ausFach = paketImFach;
      if (mess && gezeichnet) warteMs = tEmpfang - tAnfrage;
      if (paket) {
        var p = paket;
        paket = null;
        var tb = jetzt();
        try { g.bild(p); }
        catch (e) { fachFrei(); fehler("zeichnen", "Der Herd konnte nicht zeichnen: " + (e && e.message ? e.message : String(e)), true); return; }
        // Bildnummer (u32 LE ab Byte 8) vor dem Freigeben lesen: danach darf der Programm-Worker das Fach überschreiben
        if (p.length >= 12) letzteBildnr = (p[8] | (p[9] << 8) | (p[10] << 16) | (p[11] << 24)) >>> 0;
        fachFrei();
        if (mess) msBild = jetzt() - tb;
        statBilder++;
        if (!angesetzt && t0 !== 0) ersterGezeichnet = true;
        if (anlauf && anlauf.bilder.length < ANLAUF_BILDER) {
          var te = jetzt();
          anlauf.bilder.push({ t: te - tStart, abstand: te - (tVorher || tStart), bild: letzteBildnr, ms: te - tb });
          tVorher = te;
          if (anlauf.bilder.length === ANLAUF_BILDER) { melde(anlauf); anlauf = null; }
        }
      }
      // Anlauf: die Uhr beginnt im rAF **nach** dem ersten Bild (erst dann hat der Browser es fertig gezeichnet – Shader,
      // Hochladen) und ist um anderthalb Schritte versetzt: Takt 2 geht sofort hinaus, und die folgenden rAF-Zeitpunkte
      // liegen mitten zwischen zwei Takten statt auf der Grenze (sonst wechseln 0 und 2 Takte je Bild beim kleinsten Zittern)
      if (ersterGezeichnet && !angesetzt) {
        if (gezeichnet) { plane(); return; }
        t0 = jetzt() - 1.5 * SCHRITT_MS; angesetzt = true;
      }
      fordereAn();
      var t = jetzt();
      if (mess) {
        // raf = Zeitstempel des rAF, t = Beginn des Rückrufs, ms = g.bild, takte = Bildnummer-Sprung, warte = Anforderung → Paket
        mess.push({ raf: rafT || tSchlag, t: tSchlag, ms: msBild, dauer: t - tSchlag, bild: gezeichnet ? letzteBildnr : 0, takte: gezeichnet ? letzteBildnr - nrVor : 0, warte: warteMs, bytes: gezeichnet ? bytesJetzt : 0, fach: ausFach });
        if (t - messT >= 1000) { melde({ typ: "messung", bilder: mess }); mess = []; messT = t; }
      }
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
      var d = m.data, neu;
      if (typeof SharedArrayBuffer !== "undefined" && d instanceof SharedArrayBuffer) {   // Bildfach (einmal je Fenster)
        fachBelegt = new Int32Array(d, 0, 1); fachDaten = new Uint8Array(d, FACH_KOPF);
        return;
      }
      if (typeof d === "number") neu = fachDaten && d <= fachDaten.length ? fachDaten.subarray(0, d) : null;
      else if (d instanceof ArrayBuffer) neu = new Uint8Array(d);
      else if (d && d.buffer instanceof ArrayBuffer) neu = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
      else return;
      fachFrei();   // ein noch ungezeichnetes Paket im Fach wird vom neueren ersetzt
      paket = neu;
      paketImFach = typeof d === "number" && neu !== null;
      if (!paket) { ausstehend = false; plane(); return; }   // Zahl ohne Fach (sollte nicht vorkommen): Takt nicht verlieren
      if (mess) { tEmpfang = jetzt(); paketBytes = paket.byteLength; }
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
      } else if (e.typ === "bewegung" && isFinite(e.dx) && isFinite(e.dy)) {
        bewegung[0] += e.dx; bewegung[1] += e.dy;
      } else if (e.typ === "rad" && isFinite(e.wert)) {
        rad += e.wert;
      } else if (e.typ === "gefangen") {
        gefangen = e.an === true;
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
      if (weckId) clearTimeout(weckId);
      weckId = 0;
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
        anlauf.bereitMs = jetzt() - tStart;
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
