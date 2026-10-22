/* Herd – Render-Worker (Paket H6, HERD.md §7.2). Gestartet von der Seite (ui/src/herd.js) für jedes Herd-Fenster.
 * Seite → Worker:
 *   { typ: "start", canvas: OffscreenCanvas, puffer: SharedArrayBuffer (Takt-Weg), port: MessagePort, breite, hoehe }
 *       canvas und port übertragen; über den Port kommen die Bildpakete direkt vom Programm-Worker
 *   { typ: "eingabe", ereignis }   – Tastatur/Maus/Touch (den Zustand führt der Zeichner)
 *   { typ: "groesse", breite, hoehe } – Gerätepixel
 *   { typ: "stopp" }                 → { typ: "gestoppt", port } (Port übertragen), dann Ende
 * Worker → Seite: { typ: "bereit", schnittstelle, adapter, msaa } · { typ: "statistik", … } ·
 *   { typ: "fehler", art, text, port? } – beim Anlegen (art "kein-raf" | "kein-kontext") kommt der Port zurück (übertragen),
 *   damit die Seite im Hauptthread weiterzeichnen kann; danach beendet sich der Worker.
 */
"use strict";
importScripts("glut.js", "zeichner.js");

var zeichner = null, port = null, bereit = false, wartend = [];

function anwenden(d) {
  if (d.typ === "eingabe") zeichner.eingabe(d.ereignis);
  else if (d.typ === "groesse") zeichner.groesse(d.breite, d.hoehe);
  else if (d.typ === "stopp") {
    // Port zurück an die Seite: ein neues Fenster desselben Laufs (schliesse → backe) zeichnet weiter über ihn
    zeichner.stopp();
    try { self.postMessage({ typ: "gestoppt", port: port }, [port]); } catch (e) { self.postMessage({ typ: "gestoppt" }); }
    self.close();
  }
}

self.onmessage = function (m) {
  var d = m.data || {};
  if (d.typ === "start") {
    port = d.port;
    if (typeof self.requestAnimationFrame !== "function") {
      self.postMessage({ typ: "fehler", art: "kein-raf", text: "requestAnimationFrame fehlt im Worker", port: port }, [port]);
      self.close();
      return;
    }
    self.HerdZeichner.starte({
      canvas: d.canvas, puffer: d.puffer, port: port, breite: d.breite, hoehe: d.hoehe, wasmUrl: "glut_bg.wasm",
      melde: function (n) {
        if (n.typ === "fehler" && !bereit) { n.port = port; self.postMessage(n, [port]); self.close(); return; }
        if (n.typ === "bereit") bereit = true;
        self.postMessage(n);
      },
    }).then(function (z) {
      zeichner = z;
      var liste = wartend; wartend = [];
      for (var i = 0; i < liste.length; i++) anwenden(liste[i]);
    });
  } else if (!zeichner) {
    wartend.push(d);
  } else anwenden(d);
};
