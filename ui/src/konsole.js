// Konsole: Ausgabe-Ereignisse anzeigen, Exit-Badge, Laufzeit, Sprung zu Zeilen.

const EXIT = {
  0: { text: "gegessen", klasse: "ok", titel: "Exit-Code 0 – alles gut" },
  1: { text: "Ananas", klasse: "ananas", titel: "Exit-Code 1 – ungefangene Ananas" },
  2: { text: "Fehler", klasse: "fehler", titel: "Exit-Code 2 – PizzaFehler" },
  3: { text: "noch im Ofen", klasse: "ofen", titel: "Exit-Code 3 – Schritt- oder Zeitlimit" },
  39: { text: "🍍 39", klasse: "hawaii", titel: "Exit-Code 39 – Hawaii" },
};

const MAX_EINTRAEGE = 5000;

export function erstelleKonsole({ springe }) {
  const inhalt = document.getElementById("konsole-inhalt");
  const badge = document.getElementById("exit-badge");
  const info = document.getElementById("lauf-info");
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

  function zeichneAusgaben() {
    if (!ausgabePuffer.length) return;
    const unten = inhalt.scrollHeight - inhalt.scrollTop - inhalt.clientHeight < 40;
    const frag = document.createDocumentFragment();
    for (const ev of ausgabePuffer) {
      if (anzahl >= MAX_EINTRAEGE) {
        if (!gekappt) {
          gekappt = true;
          frag.appendChild(zeile("system", `… weitere Ausgaben werden ausgeblendet (mehr als ${MAX_EINTRAEGE} Zeilen).`));
        }
        continue;
      }
      anzahl++;
      if (ev.typ === "ausgabe" || ev.typ === "fehlerausgabe") {
        if (letzteAusgabe && letzteAusgabe.dataset.typ === ev.typ && letzteAusgabe.parentNode === inhalt && !frag.childNodes.length) {
          letzteAusgabe.textContent += "\n" + ev.text;
        } else if (letzteAusgabe && letzteAusgabe.dataset.typ === ev.typ && letzteAusgabe.parentNode === frag) {
          letzteAusgabe.textContent += "\n" + ev.text;
        } else {
          letzteAusgabe = zeile(ev.typ, ev.text);
          frag.appendChild(letzteAusgabe);
        }
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
    e.className = "k-zeile k-" + typ;
    e.dataset.typ = typ;
    e.textContent = text == null ? "" : String(text);
    return e;
  }

  function meldung(ev) {
    const typ = ev.typ;
    const e = document.createElement(ev.zeile != null ? "button" : "div");
    e.className = "k-meldung k-" + typ + (ev.art ? " k-art-" + ev.art : "");
    if (ev.zeile != null) {
      e.type = "button";
      e.title = `Zu Zeile ${ev.zeile} springen`;
      e.addEventListener("click", () => springe(ev.zeile, ev.spalte));
    }
    const icon = document.createElement("span");
    icon.className = "k-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = typ === "warnung" ? "⚠" : typ === "panik" ? "🍍" : typ === "system" ? "ℹ" : "✕";
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
      ort.textContent = "Z. " + ev.zeile + (ev.spalte != null ? ":" + ev.spalte : "");
      e.appendChild(ort);
    }
    return e;
  }

  return {
    leeren,
    ereignis(ev) {
      if (!ev || !ev.typ) return;
      const leer = inhalt.querySelector(".konsole-leer");
      if (leer) leer.remove();
      if (ev.typ === "ende") return;
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
    setzeLauf({ laeuft }) {
      badge.hidden = !laeuft;
      if (laeuft) {
        badge.className = "exit-badge laeuft";
        badge.textContent = "im Ofen …";
        badge.title = "Programm läuft";
        info.textContent = "";
      }
    },
    setzeExit(code, { schritte, zeitMs, wandMs, zusatz } = {}) {
      const d = EXIT[code] || { text: "Exit " + code, klasse: "fehler", titel: "Exit-Code " + code };
      badge.hidden = false;
      badge.className = "exit-badge " + d.klasse;
      badge.textContent = d.text + (code !== 39 ? " · " + code : "");
      badge.title = d.titel;
      const teile = [];
      if (zusatz) teile.push(zusatz);
      if (wandMs != null) teile.push(formatMs(wandMs) + " echt");
      if (zeitMs != null) teile.push(formatMs(zeitMs) + " Ofenzeit");
      if (schritte != null) teile.push(new Intl.NumberFormat("de-DE").format(schritte) + " Schritte");
      info.textContent = teile.join(" · ");
    },
  };
}

function formatMs(ms) {
  if (ms < 1000) return Math.round(ms) + " ms";
  return (ms / 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 }) + " s";
}
