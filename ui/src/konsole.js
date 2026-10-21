import { iconSvg } from "./icons.js";

// Konsole: Ausgabe-Ereignisse anzeigen, Exit-Badge, Laufzeit, Sprung zu Zeilen.

const EXIT = {
  0: { text: "gegessen", klasse: "ok", titel: "Exit-Code 0 – alles gut" },
  1: { text: "Ananas", klasse: "ananas", titel: "Exit-Code 1 – ungefangene Ananas" },
  2: { text: "Fehler", klasse: "fehler", titel: "Exit-Code 2 – PizzaFehler" },
  3: { text: "noch im Ofen", klasse: "ofen", titel: "Exit-Code 3 – Schritt- oder Zeitlimit" },
  39: { text: "Exit", klasse: "fehler", titel: "Exit-Code 39 – Hawaii (Ananas auf der Pizza)" },
};

const MAX_EINTRAEGE = 5000;

export function erstelleKonsole({ springe }) {
  const inhalt = document.getElementById("konsole-inhalt");
  const badge = document.getElementById("exit-badge");
  const info = document.getElementById("lauf-info");
  const motorBadge = document.getElementById("motor-badge");
  let anzahl = 0, gekappt = false;
  let letzteAusgabe = null; // fortlaufende Ausgabezeilen zusammenfassen
  let ausgabePuffer = [];
  let rafGeplant = false;

  function leeren(hinweis = true) {
    inhalt.textContent = "";
    anzahl = 0; gekappt = false; letzteAusgabe = null; ausgabePuffer = [];
    if (hinweis) {
      const p = document.createElement("p");
      p.className = "konsole-leer";
      p.textContent = "Konsole ist leer.";
      inhalt.appendChild(p);
    }
  }

  function zumEnde() {
    inhalt.scrollTop = inhalt.scrollHeight;
  }

  function planeZeichnen() {
    if (rafGeplant) return;
    rafGeplant = true;
    requestAnimationFrame(() => { rafGeplant = false; zeichneAusgaben(); });
  }

  // Laufender Ausgabeblock (pre-wrap): Bote.sage hängt Text+Zeilenumbruch an, Bote.schreibe nur Text.
  function blockFuer(typ, frag) {
    const letzter = frag.lastChild || (!frag.childNodes.length ? inhalt.lastChild : null);
    if (letzteAusgabe && letzteAusgabe === letzter && letzteAusgabe.dataset.typ === typ) return letzteAusgabe;
    letzteAusgabe = zeile(typ, "");
    frag.appendChild(letzteAusgabe);
    return letzteAusgabe;
  }

  function zeichneAusgaben() {
    if (!ausgabePuffer.length) return;
    let unten = inhalt.scrollHeight - inhalt.scrollTop - inhalt.clientHeight < 40;
    let frag = document.createDocumentFragment();
    for (const ev of ausgabePuffer) {
      if (ev.typ === "leeren") {
        // Bote.leeren(): alles bisher Gezeichnete verwerfen
        frag = document.createDocumentFragment();
        inhalt.textContent = "";
        anzahl = 0; gekappt = false; letzteAusgabe = null; unten = true;
        continue;
      }
      if (anzahl >= MAX_EINTRAEGE) {
        if (!gekappt) {
          gekappt = true;
          letzteAusgabe = null;
          frag.appendChild(zeile("system", `… weitere Ausgaben werden ausgeblendet (mehr als ${MAX_EINTRAEGE} Zeilen). Tipp: Bote.leeren() zeichnet Spielfelder neu.`));
        }
        continue;
      }
      anzahl++;
      if (ev.typ === "panik") {
        // Hawaii: ganz normale Fehlerausgabe (stderr-Stil, mehrzeilig)
        letzteAusgabe = null;
        const block = zeile("fehlerausgabe", String(ev.text == null ? "" : ev.text) + "\n");
        block.classList.add("k-panik-text");
        block.dataset.testid = "konsole-panik";
        frag.appendChild(block);
        continue;
      }
      if (ev.typ === "ausgabe" || ev.typ === "fehlerausgabe") {
        const block = blockFuer(ev.typ, frag);
        block.appendChild(document.createTextNode((ev.text == null ? "" : String(ev.text)) + (ev.umbruch === false ? "" : "\n")));
      } else if (ev.typ === "eingabe") {
        // Echo der gelesenen Zeile – direkt hinter einer offenen Eingabeaufforderung
        const block = blockFuer("ausgabe", frag);
        const echo = document.createElement("span");
        echo.className = ev.text == null ? "k-echo k-echo-eof" : "k-echo";
        echo.dataset.testid = "konsole-echo";
        echo.textContent = ev.text == null ? "⏎ Eingabe beendet (EOF)" : String(ev.text);
        block.appendChild(echo);
        block.appendChild(document.createTextNode("\n"));
      } else {
        letzteAusgabe = null;
        frag.appendChild(meldung(ev));
      }
    }
    ausgabePuffer = [];
    inhalt.appendChild(frag);
    if (unten) zumEnde();
  }

  function zeile(typ, text) {
    const e = document.createElement("div");
    if (typ === "ausgabe" || typ === "fehlerausgabe") e.className = "k-zeile k-" + typ;
    e.className = "k-zeile k-" + typ;
    e.dataset.typ = typ;
    e.dataset.testid = "konsole-" + typ;
    e.textContent = text == null ? "" : String(text);
    return e;
  }

  function meldung(ev) {
    const typ = ev.typ;
    const e = document.createElement(ev.zeile != null ? "button" : "div");
    e.className = "k-meldung k-" + typ + (ev.art ? " k-art-" + ev.art : "");
    e.dataset.testid = "konsole-" + typ;
    if (ev.zeile != null) {
      e.type = "button";
      e.title = `Zu Zeile ${ev.zeile} springen`;
      e.dataset.sprung = String(ev.zeile);
      if (typ === "fehler") e.dataset.testid = "konsole-fehler-sprung";
      e.addEventListener("click", () => springe(ev.zeile, ev.spalte));
    }
    const icon = document.createElement("span");
    icon.className = "k-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = iconSvg(typ === "warnung" ? "warn" : typ === "panik" ? "ananas" : typ === "system" ? "info" : ev.art === "ananas" ? "ananas" : "error");
    e.appendChild(icon);
    const text = document.createElement("span");
    text.className = "k-text";
    if (ev.code && typ === "warnung") {
      const c = document.createElement("span");
      c.className = "k-code";
      c.textContent = ev.code;
      text.appendChild(c);
      text.appendChild(document.createTextNode(" "));
      // Text beginnt evtl. bereits mit dem Code
      const t = String(ev.text || "").replace(new RegExp("^" + ev.code + ":\\s*"), "");
      text.appendChild(document.createTextNode(t));
    } else {
      text.appendChild(document.createTextNode(String(ev.text || "")));
    }
    e.appendChild(text);
    if (ev.zeile != null) {
      const ort = document.createElement("span");
      ort.className = "k-ort";
      ort.dataset.testid = "konsole-ort";
      ort.textContent = "Z. " + ev.zeile + (ev.spalte != null ? ":" + ev.spalte : "");
      e.appendChild(ort);
    }
    return e;
  }

  // ---------- Eingabezeile (nur bei Anfrage) ----------
  const eForm = document.getElementById("konsole-eingabe");
  const eFeld = document.getElementById("konsole-eingabe-feld");
  const eEof = document.getElementById("konsole-eingabe-eof");
  const verlauf = [];
  let verlaufPos = 0, entwurf = "", antwortFn = null;
  function sende(text) {
    if (!antwortFn) return;
    const f = antwortFn;
    antwortFn = null;
    if (text != null && text !== "" && verlauf[verlauf.length - 1] !== text) { verlauf.push(text); if (verlauf.length > 100) verlauf.shift(); }
    verlaufPos = verlauf.length;
    eFeld.value = "";
    eForm.hidden = true;
    eForm.classList.remove("zahl");
    f(text);
  }
  eForm.addEventListener("submit", (e) => { e.preventDefault(); sende(eFeld.value); });
  eEof.addEventListener("click", () => sende(null));
  eFeld.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) { e.preventDefault(); sende(null); return; }
    if (e.key === "ArrowUp" && verlauf.length) {
      e.preventDefault();
      if (verlaufPos === verlauf.length) entwurf = eFeld.value;
      verlaufPos = Math.max(0, verlaufPos - 1);
      eFeld.value = verlauf[verlaufPos];
    } else if (e.key === "ArrowDown" && verlaufPos < verlauf.length) {
      e.preventDefault();
      verlaufPos++;
      eFeld.value = verlaufPos === verlauf.length ? entwurf : verlauf[verlaufPos];
    }
  });

  return {
    leeren,
    /** Zeigt die Eingabezeile; antwort(text|null) wird genau einmal aufgerufen. */
    frageEingabe(anfrage, antwort) {
      zeichneAusgaben(); // Aufforderung (Bote.schreibe) sofort sichtbar machen
      zumEnde();
      antwortFn = antwort;
      verlaufPos = verlauf.length;
      entwurf = "";
      eFeld.value = "";
      const zahl = anfrage && anfrage.art === "zahl";
      eForm.classList.toggle("zahl", zahl);
      eFeld.inputMode = zahl ? "decimal" : "text";
      const prompt = anfrage && anfrage.prompt ? String(anfrage.prompt).trim() : "";
      eFeld.placeholder = (zahl ? "Zahl eingeben … (Enter sendet, Strg+D beendet)" : "Eingabe … (Enter sendet, Strg+D beendet)");
      eForm.hidden = false;
      eFeld.focus({ preventScroll: true });
    },
    versteckeEingabe() { antwortFn = null; eForm.hidden = true; eFeld.value = ""; },
    get wartet() { return !!antwortFn; },
    ereignis(ev) {
      if (!ev || !ev.typ) return;
      const leer = inhalt.querySelector(".konsole-leer");
      if (leer) leer.remove();
      if (ev.typ === "ende" || ev.typ === "ui" || ev.typ === "ui-warte") return;
      ausgabePuffer.push(ev);
      planeZeichnen();
    },
    system(text, art = "system") {
      const leer = inhalt.querySelector(".konsole-leer");
      if (leer) leer.remove();
      ausgabePuffer.push({ typ: art === "fehler" ? "fehler" : "system", art: art === "fehler" ? "intern" : undefined, text });
      planeZeichnen();
    },
    sofortZeichnen: zeichneAusgaben,
    setzeMotor(ev) {
      if (!motorBadge) return;
      if (!ev) { motorBadge.hidden = true; return; }
      motorBadge.hidden = false;
      const wasm = ev.motor === "wasm";
      motorBadge.className = "motor-badge " + (wasm ? "wasm" : "interpreter") + (ev.grund ? " fallback" : "");
      if (wasm && ev.grund) {
        motorBadge.className = "motor-badge wasm-fehler";
        motorBadge.textContent = "Wasm ✕ nicht möglich";
        motorBadge.title = ev.grund;
        motorBadge.dataset.motor = "wasm";
        return;
      }
      let text = wasm ? "Wasm ⚡" : "Interpreter";
      if (wasm && typeof ev.kompilierMs === "number") text += " · " + formatMs(ev.kompilierMs) + " kompiliert";
      // Grund steht im Tooltip – das Badge bleibt kurz
      motorBadge.textContent = text;
      motorBadge.title = wasm ? "Ausgeführt als WebAssembly" : ev.grund ? "Interpreter, weil: " + ev.grund : "Ausgeführt im Interpreter";
      motorBadge.dataset.motor = ev.motor;
    },
    setzeLauf({ laeuft, name }) {
      badge.hidden = !laeuft;
      if (laeuft && motorBadge) motorBadge.hidden = true;
      if (laeuft) {
        badge.className = "exit-badge laeuft";
        badge.textContent = "im Ofen …";
        badge.title = "Programm läuft";
        info.textContent = name ? name + " ist im Ofen …" : "";
      }
    },
    setzeExit(code, { schritte, zeitMs, wandMs, laufMs, zusatz, name } = {}) {
      const d = EXIT[code] || { text: "Exit " + code, klasse: "fehler", titel: "Exit-Code " + code };
      badge.hidden = false;
      badge.className = "exit-badge " + d.klasse;
      badge.dataset.exitCode = String(code);
      badge.textContent = d.text + " · " + code;
      badge.title = d.titel;
      const teile = [];
      if (name) teile.push(name);
      if (zusatz) teile.push(zusatz);
      if (laufMs != null) teile.push("Lauf " + formatMs(laufMs));
      if (wandMs != null) teile.push(formatMs(wandMs) + " gesamt");
      if (zeitMs != null) teile.push(formatMs(zeitMs) + " Ofenzeit");
      if (schritte != null) teile.push(new Intl.NumberFormat("de-DE").format(schritte) + " Schritte");
      info.textContent = teile.join(" · ");
    },
  };
}

function formatMs(ms) {
  if (ms < 10) return (Math.round(ms * 10) / 10).toLocaleString("de-DE") + " ms";
  if (ms < 1000) return Math.round(ms) + " ms";
  return (ms / 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " s";
}
