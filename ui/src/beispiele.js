// Beispiele-Tab: lädt beispiele/index.json → Teil-Manifeste → Karten nach Kategorie.
import { tierBadge } from "./doku.js";
import { iconSvg } from "./icons.js";

const BASIS = "beispiele/";

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}

async function json(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(url + ": HTTP " + r.status);
  return r.json();
}

const EXIT_TEXT = { 0: "gegessen", 1: "Ananas", 2: "Fehler", 3: "noch im Ofen", 39: "🍍 Hawaii" };

export function erstelleBeispiele({ ladeCode }) {
  const liste = document.getElementById("beispiele-liste");
  const suche = document.getElementById("beispiele-suche");
  const chips = document.getElementById("beispiele-kategorien");
  let kategorien = []; // [{kategorie, beispiele:[]}]
  let aktivKat = null;
  let geladen = false, laedt = false;

  async function laden() {
    if (geladen || laedt) return;
    laedt = true;
    liste.textContent = "";
    liste.appendChild(el("p", "lade-hinweis", "Beispiele werden aus dem Ofen geholt …"));
    try {
      const index = await json(BASIS + "index.json");
      const teile = Array.isArray(index && index.teile) ? index.teile : [];
      const ergebnisse = await Promise.allSettled(teile.map((t) => json(BASIS + t)));
      kategorien = ergebnisse
        .filter((e) => e.status === "fulfilled" && e.value && Array.isArray(e.value.beispiele))
        .map((e) => ({ kategorie: String(e.value.kategorie || "Weitere"), beispiele: e.value.beispiele.filter((b) => b && b.datei) }))
        .filter((k) => k.beispiele.length);
      geladen = true;
    } catch (e) {
      kategorien = [];
    }
    laedt = false;
    zeichneChips();
    zeichne();
  }

  function zeichneChips() {
    chips.textContent = "";
    if (kategorien.length < 2) return;
    const alle = [{ kategorie: null, label: "Alle" }, ...kategorien.map((k) => ({ kategorie: k.kategorie, label: k.kategorie }))];
    for (const k of alle) {
      const c = el("button", "chip", k.label);
      c.type = "button";
      c.setAttribute("aria-pressed", String(aktivKat === k.kategorie));
      c.addEventListener("click", () => { aktivKat = k.kategorie; zeichneChips(); zeichne(); });
      chips.appendChild(c);
    }
  }

  function zeichne() {
    liste.textContent = "";
    if (!kategorien.length) {
      const d = el("div", "leer-zustand");
      d.appendChild(el("div", "leer-icon", "🍕"));
      d.appendChild(el("h2", null, "Noch keine Beispiele"));
      d.appendChild(el("p", null, "Die Beispielprogramme werden gerade belegt. Schau gleich noch mal vorbei."));
      const nochmal = el("button", "knopf knopf-geist", "Erneut laden");
      nochmal.type = "button";
      nochmal.addEventListener("click", () => { geladen = false; laden(); });
      d.appendChild(nochmal);
      liste.appendChild(d);
      return;
    }
    const q = suche.value.trim().toLowerCase();
    let anzahl = 0;
    for (const k of kategorien) {
      if (aktivKat && k.kategorie !== aktivKat) continue;
      const treffer = k.beispiele.filter((b) => !q || [b.titel, b.beschreibung, b.id, b.interaktiv ? "interaktiv spiel" : "", ...(b.schlagworte || [])].join(" ").toLowerCase().includes(q));
      if (!treffer.length) continue;
      const sektion = el("section", "bsp-kategorie");
      sektion.dataset.testid = "beispiel-kategorie";
      sektion.dataset.kategorie = k.kategorie;
      const h = el("h3", "bsp-kategorie-titel");
      h.appendChild(el("span", null, k.kategorie));
      h.appendChild(el("span", "anzahl", String(treffer.length)));
      sektion.appendChild(h);
      const grid = el("div", "bsp-grid");
      for (const b of treffer) grid.appendChild(karte(b));
      sektion.appendChild(grid);
      liste.appendChild(sektion);
      anzahl += treffer.length;
    }
    if (!anzahl) liste.appendChild(el("p", "nav-leer", `Kein Beispiel passt zu „${suche.value.trim()}“.`));
  }

  function karte(b) {
    const k = el("button", "bsp-karte");
    k.type = "button";
    k.dataset.testid = "beispiel-karte";
    k.dataset.id = b.id || "";
    const kopf = el("div", "bsp-kopf");
    const titel = el("span", "bsp-titel", b.titel || b.id);
    titel.dataset.testid = "beispiel-titel";
    kopf.appendChild(titel);
    if (typeof b.exitCode === "number" && b.exitCode !== 0) {
      const ex = el("span", "bsp-exit exit-" + b.exitCode, EXIT_TEXT[b.exitCode] || "Exit " + b.exitCode);
      ex.title = "Erwarteter Exit-Code " + b.exitCode;
      ex.dataset.testid = "beispiel-exit";
      kopf.appendChild(ex);
    }
    k.appendChild(kopf);
    if (b.beschreibung) k.appendChild(el("p", "bsp-beschreibung", b.beschreibung));
    const fuss = el("div", "bsp-fuss");
    if (b.interaktiv) {
      const ia = el("span", "bsp-interaktiv");
      ia.innerHTML = iconSvg("gamepad") + "<span>interaktiv</span>";
      ia.title = "Spiel: Du gibst während des Laufs Eingaben in der Konsole ein.";
      ia.dataset.testid = "beispiel-interaktiv";
      fuss.appendChild(ia);
    }
    (b.schlagworte || []).slice(0, 4).forEach((s) => fuss.appendChild(el("span", "schlagwort", s)));
    const tb = tierBadge(b.tier, true);
    if (tb && b.tier !== 1) fuss.appendChild(tb);
    k.appendChild(fuss);
    k.addEventListener("click", async () => {
      k.classList.add("laedt");
      try { await oeffneBeispiel(b); } finally { k.classList.remove("laedt"); }
    });
    return k;
  }

  suche.addEventListener("input", zeichne);
  suche.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && suche.value) { e.stopPropagation(); suche.value = ""; zeichne(); }
  });

  async function oeffneBeispiel(b) {
    try {
      const r = await fetch(BASIS + b.datei, { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const code = await r.text();
      await ladeCode(code, (b.datei.split("/").pop() || "beispiel.pizza"), null, "bsp:" + b.datei);
    } catch (e) {
      ladeCode(null, null, "Beispiel „" + (b.titel || b.id) + "“ konnte nicht geladen werden (" + e.message + ").");
    }
  }

  return {
    laden,
    /** Alle geladenen Beispiele (für die Befehlspalette). */
    get liste() {
      return kategorien.flatMap((k) => k.beispiele.map((b) => ({ titel: b.titel || b.id, kategorie: k.kategorie, id: b.id, oeffnen: () => oeffneBeispiel(b) })));
    },
  };
}
