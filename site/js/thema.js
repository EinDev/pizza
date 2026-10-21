/* Thema vor dem ersten Zeichnen setzen (kein Aufblitzen). Extern wegen CSP script-src 'self'.
 * Außerdem: App-Link (#app=<key>) → data-app am <html>, damit das CSS sofort nur den Ladebalken zeigt
 * (kein Editor, keine Panels, auch nicht kurz). */
(function () {
  var t = null;
  try { t = localStorage.getItem("pizza.thema"); } catch (e) {}
  if (t !== "light" && t !== "dark") t = (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  document.documentElement.dataset.theme = t;
  var app = /(?:^#|&)app=([A-Za-z0-9_-]{1,64})(?:&|$)/.exec(location.hash || "");
  if (app) document.documentElement.dataset.app = app[1];
})();
