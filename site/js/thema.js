/* Thema vor dem ersten Zeichnen setzen (kein Aufblitzen). Extern wegen CSP script-src 'self'.
 * Außerdem: App-Link (#app=<key>) → data-app am <html>, damit das CSS sofort nur den Ladebalken zeigt
 * (kein Editor, keine Panels, auch nicht kurz). Nur ohne App-Link: Doku-Daten (js/doku/*.js) nachladen. */
(function () {
  var t = null;
  try { t = localStorage.getItem("pizza.thema"); } catch (e) {}
  if (t !== "light" && t !== "dark") t = (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  document.documentElement.dataset.theme = t;
  var app = /(?:^#|&)app=([A-Za-z0-9_-]{1,64})(?:&|$)/.exec(location.hash || "");
  if (app) { document.documentElement.dataset.app = app[1]; return; }
  // Playground: Doku-Daten (~230 KB) gleich parallel laden – in Reihenfolge ausgeführt (async=false);
  // main.js wartet vor dem Start auf window.pizzaDokuGeladen. Der App-Link braucht sie nicht.
  var liste = [];
  try { liste = JSON.parse(document.getElementById("doku-dateien").textContent) || []; } catch (e) {}
  window.pizzaDokuGeladen = Promise.all(liste.map(function (src) {
    return new Promise(function (fertig) {
      var s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = s.onerror = function () { fertig(); };
      document.head.appendChild(s);
    });
  }));
})();
