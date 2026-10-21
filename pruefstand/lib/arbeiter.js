"use strict";
// Worker-Thread: lädt den Interpreter und führt einzelne Fälle aus.
// So kann der Prüfstand einen hängenden Interpreter per Timeout beenden.
const { parentPort, workerData } = require("worker_threads");

let lang = null;
let ladeFehler = null;
try {
  lang = require(workerData.pfad);
} catch (e) {
  ladeFehler = String((e && e.stack) || e);
}

parentPort.on("message", (m) => {
  if (!lang) {
    parentPort.postMessage({ id: m.id, fehler: "Interpreter nicht ladbar: " + ladeFehler });
    return;
  }
  try {
    const onEvent = [];
    const opt = Object.assign({}, m.optionen, { onEvent: (e) => onEvent.push(e) });
    const res = lang.run(m.code, opt);
    // nur klonbare Daten zurückgeben
    const kopie = JSON.parse(JSON.stringify(res));
    kopie._onEvent = JSON.parse(JSON.stringify(onEvent));
    parentPort.postMessage({ id: m.id, res: kopie });
  } catch (e) {
    parentPort.postMessage({ id: m.id, fehler: "run() hat eine JS-Exception geworfen: " + String((e && e.stack) || e) });
  }
});
