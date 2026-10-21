import { icon as iconEl } from "./icons.js";

const GRUPPE_ICON = { Ofen: "play", Motor: "zap", Konsole: "terminal", Tabs: "files", "Wechseln zu": "file", Teilen: "share",
  Ansicht: "panel", Editor: "search", "Beispiel öffnen": "pizza", Doku: "book" };

// Befehlspalette (Strg+Shift+P / F1): alle Aktionen durchsuchbar, mit Tastenkürzeln.
// befehle(): [{ id, titel, gruppe?, kuerzel?, aktion, verfuegbar?: () => boolean }]

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");

/** Punktzahl für unscharfe Suche: alle Wörter müssen vorkommen; Wortanfänge zählen mehr. */
export function bewerte(text, anfrage) {
  const t = norm(text), w = norm(anfrage).trim().split(/\s+/).filter(Boolean);
  if (!w.length) return 1;
  let p = 0;
  for (const wort of w) {
    const i = t.indexOf(wort);
    if (i < 0) return 0;
    p += i === 0 ? 30 : /[\s:(\-/.]/.test(t[i - 1]) ? 20 : 5;
  }
  return p - t.length / 100;
}

export function erstellePalette({ befehle }) {
  const dlg = el("dialog", "palette");
  dlg.dataset.testid = "befehlspalette";
  dlg.setAttribute("aria-label", "Befehlspalette");
  const kopf = el("div", "palette-kopf");
  const eingabe = el("input", "palette-eingabe");
  eingabe.type = "text";
  eingabe.placeholder = "Befehl suchen … (z. B. „backen“, „tabs schließen“, „beispiel“)";
  eingabe.setAttribute("role", "combobox");
  eingabe.setAttribute("aria-expanded", "true");
  eingabe.setAttribute("aria-controls", "palette-liste");
  eingabe.setAttribute("aria-autocomplete", "list");
  eingabe.dataset.testid = "befehlspalette-eingabe";
  eingabe.spellcheck = false;
  kopf.appendChild(eingabe);
  const liste = el("div", "palette-liste");
  liste.id = "palette-liste";
  liste.setAttribute("role", "listbox");
  liste.setAttribute("aria-label", "Befehle");
  const fuss = el("div", "palette-fuss");
  fuss.innerHTML = "<span><kbd>↑</kbd><kbd>↓</kbd> wählen</span><span><kbd>↵</kbd> ausführen</span><span><kbd>Esc</kbd> schließen</span>";
  dlg.appendChild(kopf);
  dlg.appendChild(liste);
  dlg.appendChild(fuss);
  document.body.appendChild(dlg);

  let treffer = [], auswahl = 0, vorherFokus = null;

  function zeichne() {
    const q = eingabe.value;
    const alle = befehle().filter((b) => !b.verfuegbar || b.verfuegbar());
    treffer = alle
      .map((b) => ({ b, p: bewerte((b.gruppe ? b.gruppe + ": " : "") + b.titel, q) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => (q.trim() ? b.p - a.p : 0))
      .slice(0, 80)
      .map((x) => x.b);
    auswahl = Math.min(auswahl, Math.max(0, treffer.length - 1));
    liste.textContent = "";
    if (!treffer.length) { liste.appendChild(el("div", "palette-leer", "Kein Befehl gefunden.")); eingabe.removeAttribute("aria-activedescendant"); return; }
    treffer.forEach((b, i) => {
      const z = el("div", "palette-eintrag" + (i === auswahl ? " gewaehlt" : ""));
      z.id = "palette-opt-" + i;
      z.setAttribute("role", "option");
      z.setAttribute("aria-selected", String(i === auswahl));
      z.dataset.testid = "befehlspalette-eintrag";
      z.dataset.befehl = b.id;
      z.appendChild(iconEl(b.icon || GRUPPE_ICON[b.gruppe] || "command", "palette-icon"));
      if (b.gruppe) z.appendChild(el("span", "palette-gruppe", b.gruppe));
      z.appendChild(el("span", "palette-titel", b.titel));
      if (b.kuerzel) z.appendChild(el("kbd", "palette-kuerzel", b.kuerzel));
      z.addEventListener("mousemove", () => { if (auswahl !== i) { auswahl = i; markiere(); } });
      z.addEventListener("click", () => fuehreAus(i));
      liste.appendChild(z);
    });
    markiere();
  }
  function markiere() {
    [...liste.children].forEach((z, i) => { z.classList.toggle("gewaehlt", i === auswahl); z.setAttribute("aria-selected", String(i === auswahl)); });
    const g = liste.children[auswahl];
    if (g) {
      eingabe.setAttribute("aria-activedescendant", g.id);
      if (g.offsetTop < liste.scrollTop) liste.scrollTop = g.offsetTop;
      else if (g.offsetTop + g.offsetHeight > liste.scrollTop + liste.clientHeight) liste.scrollTop = g.offsetTop + g.offsetHeight - liste.clientHeight;
    }
  }
  function fuehreAus(i) {
    const b = treffer[i];
    if (!b) return;
    schliessen(false);
    setTimeout(() => b.aktion(), 0);
  }
  function schliessen(fokusZurueck = true) {
    if (dlg.open) dlg.close();
    if (fokusZurueck && vorherFokus && vorherFokus.isConnected) vorherFokus.focus();
  }

  eingabe.addEventListener("input", () => { auswahl = 0; zeichne(); });
  eingabe.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); auswahl = Math.min(treffer.length - 1, auswahl + 1); markiere(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); auswahl = Math.max(0, auswahl - 1); markiere(); }
    else if (e.key === "PageDown") { e.preventDefault(); auswahl = Math.min(treffer.length - 1, auswahl + 8); markiere(); }
    else if (e.key === "PageUp") { e.preventDefault(); auswahl = Math.max(0, auswahl - 8); markiere(); }
    else if (e.key === "Enter") { e.preventDefault(); fuehreAus(auswahl); }
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) schliessen(); });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); schliessen(); });

  return {
    oeffnen(vorgabe = "") {
      if (dlg.open) { eingabe.select(); return; }
      vorherFokus = document.activeElement;
      eingabe.value = vorgabe;
      auswahl = 0;
      zeichne();
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      eingabe.focus();
      eingabe.select();
    },
    schliessen,
    get offen() { return dlg.open; },
  };
}
