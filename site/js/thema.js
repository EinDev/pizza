/* Thema vor dem ersten Zeichnen setzen (kein Aufblitzen). Extern wegen CSP script-src 'self'. */
(function () {
  var t = null;
  try { t = localStorage.getItem("pizza.thema"); } catch (e) {}
  if (t !== "light" && t !== "dark") t = (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  document.documentElement.dataset.theme = t;
})();
