// Theke-Vorschau (THEKE.md §4): schwebendes App-Fenster über allem (außer Dialogen/Toasts).
// Titelleiste verschiebt, Ecke ändert die Größe, Startgröße aus breite/hoehe (zentriert, nie größer als der Viewport),
// Position/Größe pro Sitzung gemerkt. Kein Abdunkeln – Editor/Konsole bleiben bedienbar. Esc schließt NICHT.
// Mobil (< 600px): Vollbild-Sheet. Renderer (js/theke/theke.js + theke.css) wird erst bei Bedarf geladen.
import { iconSvg } from "./icons.js";

const MERKER = "pizza.vorschau";
const KOPF_HOEHE = 38;

let rendererVersprechen = null;
/** Lädt js/theke/theke.js + theke.css einmal (auch vorab, z. B. beim App-Link). */
export function ladeRenderer() {
  if (!rendererVersprechen) {
    rendererVersprechen = new Promise((resolve) => {
      if (!document.querySelector("link[data-theke-css]")) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = "js/theke/theke.css";
        l.dataset.thekeCss = "1";
        document.head.appendChild(l);
      }
      if (window.PizzaTheke) { resolve(window.PizzaTheke); return; }
      const s = document.createElement("script");
      s.src = "js/theke/theke.js";
      s.onload = () => resolve(window.PizzaTheke && typeof window.PizzaTheke.erzeuge === "function" ? window.PizzaTheke : null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    }).then((r) => { if (!r) rendererVersprechen = null; return r; });
  }
  return rendererVersprechen;
}

export function erstelleVorschau({ beiEreignis, beiZu, vollbild = false }) {
  // vollbild (App-Link): Größe/Position macht das CSS, nichts messen und nichts für den Playground merken
  const fenster = document.getElementById("vorschau");
  const kopf = document.getElementById("vorschau-kopf");
  const titelEl = document.getElementById("vorschau-titel");
  const inhalt = document.getElementById("vorschau-inhalt");
  const zu = document.getElementById("vorschau-schliessen");
  zu.innerHTML = iconSvg("x");
  zu.title = "Schließen";
  document.getElementById("vorschau-icon").innerHTML = iconSvg("monitor");

  let theke = null, warteschlange = [], offen = false, laufNr = 0;
  // Geometrie in CSS-Pixeln: x/y = linke obere Ecke, w/h = Außengröße (inkl. Titelleiste)
  let geo = null;
  if (!vollbild) { try { geo = JSON.parse(sessionStorage.getItem(MERKER) || "null"); } catch (e) { geo = null; } }
  let vorgabeGesetzt = !!geo;

  const mobil = () => window.matchMedia("(max-width: 599.98px)").matches;
  const themaJetzt = () => (document.documentElement.dataset.theme === "dark" ? "dunkel" : "hell");
  function merke() { if (vollbild) return; try { sessionStorage.setItem(MERKER, JSON.stringify(geo)); } catch (e) { /* egal */ } }

  function wende() {
    if (!geo || mobil() || vollbild) { fenster.style.left = fenster.style.top = fenster.style.width = fenster.style.height = ""; return; }
    const vw = window.innerWidth, vh = window.innerHeight;
    geo.w = Math.max(240, Math.min(geo.w, vw - 16));
    geo.h = Math.max(140, Math.min(geo.h, vh - 16));
    geo.x = Math.max(8, Math.min(geo.x, vw - geo.w - 8));
    geo.y = Math.max(8, Math.min(geo.y, vh - geo.h - 8));
    fenster.style.left = geo.x + "px";
    fenster.style.top = geo.y + "px";
    fenster.style.width = geo.w + "px";
    fenster.style.height = geo.h + "px";
  }
  function zentriere(breite, hoehe) {
    const w = (Number(breite) || 480) + 2, h = (Number(hoehe) || 360) + KOPF_HOEHE + 2;
    geo = { w, h, x: (window.innerWidth - w) / 2, y: (window.innerHeight - h) / 2 };
    wende();
  }

  function fensterInfo(info) {
    if (info.titel != null) titelEl.textContent = info.titel || "Theke";
    // Startgröße nur beim ersten Mal in dieser Sitzung aus breite/hoehe (danach gilt die gemerkte Größe)
    if (!vollbild && !vorgabeGesetzt && (info.breite || info.hoehe)) {
      vorgabeGesetzt = true;
      zentriere(info.breite, info.hoehe);
      merke();
    }
  }

  async function oeffne() {
    const nr = ++laufNr;
    offen = true;
    titelEl.textContent = "Theke";
    inhalt.textContent = "";
    if (vollbild) wende(); else if (!geo) zentriere(480, 360); else wende();
    fenster.hidden = false;
    fenster.focus({ preventScroll: true });
    const R = await ladeRenderer();
    if (nr !== laufNr || !offen) return;
    if (!R) {
      const p = document.createElement("p");
      p.className = "vorschau-hinweis";
      p.textContent = "Die Theke (Renderer) ist gerade nicht verfügbar. Das Programm läuft ohne Fenster weiter.";
      inhalt.appendChild(p);
      beiEreignis({ typ: "geschlossen" });
      return;
    }
    theke = R.erzeuge(inhalt, {
      thema: themaJetzt(),
      sende: (ev) => beiEreignis(ev),
      fenster: fensterInfo,
      geschlossen: () => schliesseFenster(),
    });
    const liste = warteschlange; warteschlange = [];
    for (const n of liste) theke.empfange(n);
    // Fokus ins Fenster (erstes bedienbares Element)
    requestAnimationFrame(() => {
      const ziel = inhalt.querySelector("input, button, [tabindex]:not([tabindex='-1'])");
      (ziel || fenster).focus({ preventScroll: true });
    });
  }

  function schliesseFenster() {
    if (!offen) return;
    offen = false;
    const hatteFokus = fenster.contains(document.activeElement);
    fenster.hidden = true;
    if (hatteFokus && beiZu) beiZu();
  }

  function aufraeumen() {
    laufNr++;
    if (theke) { try { theke.zerstoere(); } catch (e) { /* egal */ } }
    theke = null;
    warteschlange = [];
    inhalt.textContent = "";
    schliesseFenster();
  }

  zu.addEventListener("click", () => {
    if (theke) theke.schliessen(); // sendet einmalig {typ:"geschlossen"}
    else beiEreignis({ typ: "geschlossen" });
    schliesseFenster();
    if (beiZu) beiZu();
  });

  // Verschieben an der Titelleiste
  kopf.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button, a") || mobil() || !geo) return;
    e.preventDefault();
    kopf.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY, gx: geo.x, gy: geo.y };
    fenster.classList.add("zieht");
    const bewege = (ev) => { geo.x = start.gx + ev.clientX - start.x; geo.y = start.gy + ev.clientY - start.y; wende(); };
    const ende = () => {
      fenster.classList.remove("zieht");
      kopf.removeEventListener("pointermove", bewege);
      kopf.removeEventListener("pointerup", ende);
      kopf.removeEventListener("pointercancel", ende);
      merke();
    };
    kopf.addEventListener("pointermove", bewege);
    kopf.addEventListener("pointerup", ende);
    kopf.addEventListener("pointercancel", ende);
  });

  // Größe an der Ecke (CSS resize) → merken
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      if (vollbild || !offen || mobil() || !geo || fenster.hidden) return;
      const w = fenster.offsetWidth, h = fenster.offsetHeight;
      if (Math.abs(w - geo.w) > 1 || Math.abs(h - geo.h) > 1) { geo.w = w; geo.h = h; merke(); }
    }).observe(fenster);
  }
  window.addEventListener("resize", () => { if (offen) wende(); });

  return {
    /** Protokoll-Nachricht vom Programm (Ereignis typ "ui"). */
    nachricht(n) {
      if (!offen && !theke) oeffne();
      if (theke) theke.empfange(n); else warteschlange.push(n);
    },
    setzeThema() { if (theke && theke.setzeThema) theke.setzeThema(themaJetzt()); },
    /** Neuer Lauf / Lauf beendet / abgebrochen → Fenster schließen und aufräumen. */
    beenden: aufraeumen,
    get offen() { return offen; },
  };
}
