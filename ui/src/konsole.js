import { iconSvg } from "./icons.js";

// Konsole: Ausgabe-Ereignisse anzeigen, Exit-Badge, Laufzeit, Sprung zu Zeilen.

const EXIT = {
  0: { text: "gegessen", klasse: "ok", titel: "Exit-Code 0 – alles gut" },
  1: { text: "Ananas", klasse: "ananas", titel: "Exit-Code 1 – ungefangene Ananas" },
  2: { text: "Fehler", klasse: "fehler", titel: "Exit-Code 2 – PizzaFehler" },
  3: { text: "noch im Ofen", klasse: "ofen", titel: "Exit-Code 3 – Schrittlimit erreicht" },
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
    // Sprung (PROJEKTE §3.1): Klick öffnet `datei` (null = Hauptdatei) als Tab und setzt den Cursor
    const datei = ev.datei == null ? null : String(ev.datei);
    const springbar = ev.zeile != null || datei != null;
    const e = document.createElement(springbar ? "button" : "div");
    e.className = "k-meldung k-" + typ + (ev.art ? " k-art-" + ev.art : "");
    e.dataset.testid = "konsole-" + typ;
    if (springbar) {
      e.type = "button";
      e.title = ev.zeile != null ? `Zu ${datei ? datei + ", " : ""}Zeile ${ev.zeile} springen` : `${datei} öffnen`;
      if (ev.zeile != null) e.dataset.sprung = String(ev.zeile);
      if (datei) e.dataset.datei = datei;
      if (typ === "fehler") e.dataset.testid = "konsole-fehler-sprung";
      e.addEventListener("click", () => springe(ev.zeile, ev.spalte, datei));
    }
    const icon = document.createElement("span");
    icon.className = "k-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = iconSvg(typ === "warnung" ? "warn" : typ === "panik" ? "ananas" : typ === "system" ? "info" : ev.art === "ananas" ? "ananas" : "error");
    e.appendChild(icon);
    // K-083/U-45: sichtbarer Text exakt wie in der CLI – Ereignistext unverändert, Ort als „ (Zeile Z, Spalte S)“;
    // ein vorhandenes „ (Zeile N)“ am Ende (ungefangene Ananas) wird ersetzt. detail wird nie angezeigt.
    const { rumpf, ort } = meldungTeile(ev);
    const text = document.createElement("span");
    text.className = "k-text";
    text.appendChild(document.createTextNode(rumpf));
    if (ort) {
      const o = document.createElement("span");
      o.className = "k-ort";
      o.dataset.testid = "konsole-ort";
      o.textContent = ort;
      text.appendChild(o);
    }
    e.appendChild(text);
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
      if (ev.typ === "ende" || ev.typ === "ui" || ev.typ === "ui-warte" || ev.typ === "vorrat") return;
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
    /** Hinweiszeile der Hülle (z. B. „Vorrat 'x' gelöscht.“) – gleicher Text wie die CLI, keine Programmausgabe. */
    info(text) {
      const leer = inhalt.querySelector(".konsole-leer");
      if (leer) leer.remove();
      zeichneAusgaben();
      letzteAusgabe = null;
      const z = document.createElement("div");
      z.className = "k-zeile k-info";
      z.dataset.testid = "konsole-info";
      z.textContent = text;
      inhalt.appendChild(z);
      zumEnde();
    },
    /** K-077: Infozeile „Saat: N“ am Anfang der Konsole (gleicher Text wie die CLI). */
    saat(n) {
      const leer = inhalt.querySelector(".konsole-leer");
      if (leer) leer.remove();
      const z = document.createElement("div");
      z.className = "k-zeile k-saat";
      z.dataset.testid = "konsole-saat";
      z.textContent = "Saat: " + n;
      inhalt.insertBefore(z, inhalt.firstChild);
    },
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
      // Kurz im Badge, Details (Kompilierzeit, Grund) im Tooltip
      motorBadge.innerHTML = iconSvg(wasm ? "zap" : "cpu");
      motorBadge.appendChild(document.createTextNode(wasm ? "Wasm" : "Interpreter"));
      motorBadge.title = wasm
        ? "Ausgeführt als WebAssembly" + (typeof ev.kompilierMs === "number" ? " · " + formatMs(ev.kompilierMs) + " kompiliert" : "")
        : ev.grund ? "Interpreter, weil: " + ev.grund : "Ausgeführt im Interpreter";
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
    setzeExit(code, { schritte, zeitMs, wandMs, laufMs, zusatz, name, koeche } = {}) {
      const d = EXIT[code] || { text: "Exit " + code, klasse: "fehler", titel: "Exit-Code " + code };
      badge.hidden = false;
      badge.className = "exit-badge " + d.klasse;
      badge.dataset.exitCode = String(code);
      badge.textContent = d.text + " · " + code;
      badge.title = d.titel;
      // Sichtbar: Hauptdatei (bzw. Projekt) · Laufzeit · Schritte; alles Weitere im Tooltip
      const zahl = (n) => new Intl.NumberFormat("de-DE").format(n);
      const kurz = [], lang = [];
      if (name) { kurz.push(name); lang.push("Projekt: " + name); }
      if (zusatz) { kurz.push(zusatz); lang.push(zusatz); }
      if (laufMs != null) { kurz.push(formatMs(laufMs)); lang.push("Lauf: " + formatMs(laufMs)); }
      else if (wandMs != null) kurz.push(formatMs(wandMs));
      if (schritte != null) { kurz.push(zahl(schritte) + " Schritte"); lang.push("Schritte: " + zahl(schritte)); }
      // Küchenbrigade (SPEC §17.7): nur bei Programmen mit brigade – gleicher Text wie --info (K-082)
      if (typeof koeche === "number" && koeche >= 1) { kurz.push("Köche: " + koeche); lang.push("Köche: " + koeche); }
      if (wandMs != null) lang.push("Gesamt (mit Start): " + formatMs(wandMs));
      if (zeitMs != null) lang.push("Ofenzeit (simuliert): " + formatMs(zeitMs));
      info.textContent = kurz.join(" · ");
      info.title = lang.join("\n");
    },
  };
}

/** Ort-Zusatz wie bin/pizza.js (SPEC §2.6): „ (Zeile Z, Spalte S)“ bzw. „ (Zeile Z)“; mit Datei (datei ≠ null, also
 *  Mehrdatei-Programm) „ (pfad, Zeile Z, Spalte S)“, ohne Zeile „ (pfad)“. */
export function ortText(ev) {
  if (!ev) return "";
  const datei = ev.datei == null ? null : String(ev.datei);
  if (ev.zeile == null) return datei ? " (" + datei + ")" : "";
  return " (" + (datei ? datei + ", " : "") + "Zeile " + ev.zeile + (ev.spalte != null ? ", Spalte " + ev.spalte : "") + ")";
}
/** Text einer Warnung/eines Fehlers wie in der CLI, aufgeteilt in Rumpf und Ort (für die Hervorhebung). Ein Ort am Textende
 *  („ (Zeile N)“ bzw. „ (pfad, Zeile N)“ der ungefangenen Ananas) wird durch den vollständigen Ort ersetzt. */
export function meldungTeile(ev) {
  const t = String(ev && ev.text != null ? ev.text : "");
  if (!ev || (ev.zeile == null && ev.datei == null)) return { rumpf: t, ort: "" };
  const m = /\s\((?:([a-z0-9_.\/-]+), )?Zeile (\d+)\)$/.exec(t);
  if (m && Number(m[2]) === ev.zeile && (!m[1] || m[1] === String(ev.datei))) return { rumpf: t.slice(0, m.index), ort: ortText(ev) };
  return { rumpf: t, ort: ortText(ev) };
}

function formatMs(ms) {
  if (ms < 10) return (Math.round(ms * 10) / 10).toLocaleString("de-DE") + " ms";
  if (ms < 1000) return Math.round(ms) + " ms";
  return (ms / 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " s";
}
