/* pizza v3.0 – Theke-Hülle für den nativen Host (wry/WebView2/WebKitGTK). Siehe README.md in diesem Ordner.
 *   Host → Seite:  pizzaThekeEmpfange("<Protokoll-JSON als String>")   (per evaluate_script)
 *   Seite → Host:  window.ipc.postMessage("<Ereignis-JSON>")            (wry-IPC)
 * Beim Start schickt die Seite einmal {"typ":"bereit"} – das ist KEIN Programm-Ereignis; der Host
 * puffert bis dahin seine Nachrichten und reicht "bereit" nicht ans Programm weiter.
 */
(function () {
  "use strict";
  function posten(ereignis) {
    var json = JSON.stringify(ereignis);
    if (window.ipc && typeof window.ipc.postMessage === "function") window.ipc.postMessage(json);
    else if (window.console) console.log("[Theke → Host]", json);
  }
  var theke = window.PizzaTheke.erzeuge(document.getElementById("theke"), {
    thema: "auto",
    sende: posten,
    fenster: function (info) { document.title = info.titel || "Theke"; }
  });
  window.pizzaThekeEmpfange = function (json) { theke.empfange(json); };
  posten({ typ: "bereit" });
})();
