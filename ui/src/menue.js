import { icon as iconEl } from "./icons.js";

// Kleines, zugängliches Popup-Menü (role="menu") für Kontextmenüs und das „Alle Tabs“-Menü.
// eintraege: [{ text, aktion, kuerzel?, deaktiviert?, gefahr?, testid?, icon? } | "-" | { ueberschrift } | { element }]

let offenesMenue = null;

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}

export function schliesseMenue() {
  if (offenesMenue) offenesMenue.schliessen();
}

/**
 * Öffnet ein Menü an Position {x, y} oder unter einem Element (anker).
 * @returns {{ schliessen: Function, wurzel: HTMLElement }}
 */
export function oeffneMenue({ eintraege, x, y, anker, label = "Menü", testid, kopf, breit = false }) {
  schliesseMenue();
  const vorherFokus = document.activeElement;
  const wurzel = el("div", "menue" + (breit ? " menue-breit" : ""));
  wurzel.setAttribute("role", "menu");
  wurzel.setAttribute("aria-label", label);
  if (testid) wurzel.dataset.testid = testid;
  if (kopf) wurzel.appendChild(kopf);
  const liste = el("div", "menue-liste");
  wurzel.appendChild(liste);

  function zeichne(neueEintraege) {
    liste.textContent = "";
    for (const e of neueEintraege) {
      if (e === "-") { const t = el("div", "menue-trenner"); t.setAttribute("role", "separator"); liste.appendChild(t); continue; }
      if (e.ueberschrift) { liste.appendChild(el("div", "menue-ueberschrift", e.ueberschrift)); continue; }
      if (e.leer) { liste.appendChild(el("div", "menue-leer", e.leer)); continue; }
      const k = el("button", "menue-eintrag" + (e.gefahr ? " gefahr" : "") + (e.aktiv ? " aktiv" : ""));
      k.type = "button";
      k.setAttribute("role", "menuitem");
      k.tabIndex = -1;
      if (e.testid) k.dataset.testid = e.testid;
      if (e.deaktiviert) {
        k.disabled = true;
        k.setAttribute("aria-disabled", "true");
        if (e.grund) { k.title = e.grund; k.dataset.grund = e.grund; }
      } else if (e.titel) k.title = e.titel;
      const ic = e.icon ? iconEl(e.icon, "menue-icon") : el("span", "menue-icon");
      ic.setAttribute("aria-hidden", "true");
      k.appendChild(ic);
      k.appendChild(el("span", "menue-text", e.text));
      if (e.zusatz) k.appendChild(el("span", "menue-zusatz", e.zusatz));
      if (e.kuerzel) { const kb = el("kbd", "menue-kuerzel", e.kuerzel); k.appendChild(kb); }
      k.addEventListener("click", () => { schliessen(false); e.aktion && e.aktion(); });
      liste.appendChild(k);
    }
  }
  zeichne(eintraege);
  document.body.appendChild(wurzel);

  // Positionieren
  const r = anker ? anker.getBoundingClientRect() : { left: x || 0, bottom: y || 0, right: x || 0 };
  const breite = wurzel.offsetWidth || 240, hoehe = wurzel.offsetHeight || 200;
  let left = anker ? Math.min(r.left, r.right - breite) : r.left;
  if (anker && left < 8) left = r.left;
  let top = r.bottom + (anker ? 4 : 0);
  left = Math.max(8, Math.min(left, window.innerWidth - breite - 8));
  if (top + hoehe > window.innerHeight - 8) top = Math.max(8, (anker ? r.top - hoehe - 4 : window.innerHeight - hoehe - 8));
  wurzel.style.left = left + "px";
  wurzel.style.top = top + "px";

  const items = () => [...liste.querySelectorAll(".menue-eintrag:not(:disabled)")];
  function fokus(i) {
    const it = items();
    if (!it.length) return;
    it[(i + it.length) % it.length].focus();
  }
  wurzel.addEventListener("keydown", (e) => {
    const it = items();
    const i = it.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); fokus(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); fokus(i < 0 ? -1 : i - 1); }
    else if (e.key === "Home") { e.preventDefault(); fokus(0); }
    else if (e.key === "End") { e.preventDefault(); fokus(-1); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); schliessen(true); }
    else if (e.key === "Tab") { e.preventDefault(); schliessen(true); }
  });
  const aussen = (e) => { if (!wurzel.contains(e.target)) schliessen(false); };
  setTimeout(() => {
    document.addEventListener("pointerdown", aussen, true);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
  }, 0);
  const blur = () => schliessen(false);

  function schliessen(fokusZurueck) {
    if (!wurzel.isConnected) return;
    document.removeEventListener("pointerdown", aussen, true);
    window.removeEventListener("blur", blur);
    window.removeEventListener("resize", blur);
    wurzel.remove();
    if (offenesMenue === api) offenesMenue = null;
    if (fokusZurueck && vorherFokus && vorherFokus.isConnected) vorherFokus.focus();
  }
  const api = { schliessen: () => schliessen(true), wurzel, zeichne, fokusErster: () => fokus(0) };
  offenesMenue = api;
  if (!kopf) requestAnimationFrame(() => fokus(0));
  return api;
}
