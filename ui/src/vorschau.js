// Theke-Vorschau (THEKE.md §4): schwebendes App-Fenster über allem (außer Dialogen/Toasts).
// Titelleiste verschiebt, Ecke ändert die Größe. Größe (K-123): jeder Lauf übernimmt breite/hoehe des Programms (nie größer
// als der Viewport) – außer der Nutzer hat das Fenster in diesem Lauf schon selbst verschoben oder in der Größe geändert.
// Position: zentriert, bis der Nutzer das Fenster einmal verschiebt; danach bleibt die gemerkte Stelle (pro Sitzung). Kein Abdunkeln – Editor/Konsole bleiben bedienbar. Esc schließt NICHT.
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
  // K-123: je Lauf – Programmgröße schon übernommen? Nutzer hat in diesem Lauf verschoben/gezogen?
  let groesseUebernommen = false, nutzerGeaendert = false;

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
  /** Programmgröße übernehmen: zentriert – oder an der gemerkten Stelle, wenn der Nutzer das Fenster je verschoben hat. */
  function zentriere(breite, hoehe) {
    const w = (Number(breite) || 480) + 2, h = (Number(hoehe) || 360) + KOPF_HOEHE + 2;
    const bleib = !!(geo && geo.verschoben);
    geo = bleib ? { w, h, x: geo.x, y: geo.y, verschoben: true } : { w, h, x: (window.innerWidth - w) / 2, y: (window.innerHeight - h) / 2 };
    wende();
  }

  function fensterInfo(info, standard = "Theke") {
    if (info.titel != null) titelEl.textContent = info.titel || standard;
    // K-123: jeder Lauf nimmt breite/hoehe des Programms – einmal je Lauf (setzeTitel sendet fenster erneut) und nur, solange
    // der Nutzer das Fenster in diesem Lauf nicht selbst verschoben oder in der Größe geändert hat
    if (!vollbild && !groesseUebernommen && !nutzerGeaendert) {
      groesseUebernommen = true;
      zentriere(info.breite, info.hoehe);
      merke();
    }
  }

  async function oeffne() {
    const nr = ++laufNr;
    offen = true;
    groesseUebernommen = false;
    nutzerGeaendert = false;
    titelEl.textContent = "Theke";
    inhalt.textContent = "";
    fenster.classList.remove("herd");
    document.getElementById("vorschau-icon").innerHTML = iconSvg("monitor");
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
    fenster.classList.remove("herd");
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
    const bewege = (ev) => {
      geo.x = start.gx + ev.clientX - start.x; geo.y = start.gy + ev.clientY - start.y;
      geo.verschoben = true; nutzerGeaendert = true;
      wende();
    };
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
      if (Math.abs(w - geo.w) > 1 || Math.abs(h - geo.h) > 1) { geo.w = w; geo.h = h; nutzerGeaendert = true; merke(); }
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
    /** Herd-Fenster (HERD.md §7.2): derselbe Rahmen ohne Theke-Renderer – Titel, Größe K-123 (Programmgröße bis Viewport),
     *  verschiebbar, Schließen = {typ:"geschlossen"} über beiEreignis. Liefert den Inhaltsbereich für das Canvas. */
    herd(info) {
      if (!offen) {
        laufNr++;
        offen = true;
        groesseUebernommen = false;
        nutzerGeaendert = false;
        inhalt.textContent = "";
        fenster.classList.add("herd");
        document.getElementById("vorschau-icon").innerHTML = iconSvg("play");
        if (vollbild) wende(); else if (!geo) zentriere(info.breite, info.hoehe); else wende();
        fenster.hidden = false;
      }
      fensterInfo(info, "Herd");
      return inhalt;
    },
    /** Neuer Lauf / Lauf beendet / abgebrochen → Fenster schließen und aufräumen. */
    beenden: aufraeumen,
    get offen() { return offen; },
  };
}
