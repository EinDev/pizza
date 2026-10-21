// Doku-Tab: Navigation nach gruppe/ordnung, Suche, Abschnittsansicht.
import { markdownDom, markdownText } from "./markdown.js";
import { highlightStatisch } from "./sprache.js";

const TIER = {
  1: { text: "läuft im Playground", klasse: "tier-1" },
  2: { text: "läuft im Playground · simuliert", klasse: "tier-2" },
  3: { text: "nur Spezifikation", klasse: "tier-3" },
};

export function tierBadge(tier, kurz = false) {
  const d = TIER[tier];
  if (!d) return null;
  const b = document.createElement("span");
  b.className = "tier-badge " + d.klasse;
  b.textContent = kurz ? (tier === 3 ? "Spezifikation" : "läuft") : d.text;
  b.title = tier === 2 ? "Tier 2 – läuft im Playground mit vereinfachter/simulierter Semantik" : tier === 3 ? "Tier 3 – nur Spezifikation" : "Tier 1 – läuft exakt wie beschrieben";
  return b;
}

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}

function abschnitteLaden() {
  const roh = (typeof self !== "undefined" && Array.isArray(self.PIZZA_DOKU)) ? self.PIZZA_DOKU : [];
  const gesehen = new Set();
  return roh
    .filter((a) => a && typeof a === "object" && a.id && a.titel && !gesehen.has(a.id) && gesehen.add(a.id))
    .map((a) => ({ ...a, ordnung: Number(a.ordnung) || 0, gruppe: a.gruppe || "Sonstiges", inhalt: Array.isArray(a.inhalt) ? a.inhalt : [] }))
    .sort((a, b) => a.ordnung - b.ordnung || String(a.titel).localeCompare(String(b.titel), "de"));
}

function suchtext(a) {
  const teile = [a.titel, a.gruppe];
  for (const b of a.inhalt) {
    if (b.md) teile.push(markdownText(b.md));
    if (b.code) teile.push(b.code);
    if (b.text) teile.push(b.text);
    if (b.kopf) teile.push(b.kopf.join(" "));
    if (b.zeilen) teile.push(b.zeilen.flat().join(" "));
  }
  return teile.join(" \n ").toLowerCase();
}

export function erstelleDoku({ oeffneCode, backeCode }) {
  const nav = document.getElementById("doku-nav");
  const inhalt = document.getElementById("doku-inhalt");
  const suche = document.getElementById("doku-suche");
  const layout = document.getElementById("doku-layout");
  const navToggle = document.getElementById("doku-nav-toggle");
  const navAktuell = document.getElementById("doku-nav-aktuell");
  function navOffen(offen) {
    layout.classList.toggle("nav-offen", offen);
    navToggle.setAttribute("aria-expanded", String(offen));
  }
  navToggle.addEventListener("click", () => {
    const offen = !layout.classList.contains("nav-offen");
    navOffen(offen);
    if (offen) { const a = nav.querySelector("[aria-current]") || nav.querySelector(".nav-eintrag"); if (a) { a.scrollIntoView({ block: "nearest" }); a.focus(); } }
  });
  layout.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && layout.classList.contains("nav-offen")) { e.stopPropagation(); navOffen(false); navToggle.focus(); }
  });
  let abschnitte = [];
  let aktuell = null;
  let gemerkt = null;
  try { gemerkt = localStorage.getItem("pizza.doku"); } catch (e) { /* egal */ }

  function linkKlick(ev, url) {
    if (url.startsWith("#") && !url.startsWith("#code=")) {
      const id = decodeURIComponent(url.slice(1));
      if (abschnitte.some((a) => a.id === id)) { ev.preventDefault(); zeige(id, true); }
      else ev.preventDefault();
    }
  }

  function codeBlock(b, abschnitt) {
    const wrap = el("figure", "doku-code");
    const pre = el("pre", "code-statisch");
    const code = el("code");
    code.appendChild(highlightStatisch(String(b.code || ""), b.sprache || "pizza"));
    pre.appendChild(code);
    wrap.appendChild(pre);
    const leiste = el("figcaption", "doku-code-leiste");
    const tier = b.tier ?? abschnitt.tier;
    if (b.sprache && b.sprache !== "pizza") leiste.appendChild(el("span", "code-sprache", b.sprache));
    else {
      const tb = tierBadge(tier, true);
      if (tb) leiste.appendChild(tb);
    }
    leiste.appendChild(el("span", "flex-luecke"));
    const kopieren = el("button", "knopf knopf-mini", "Kopieren");
    kopieren.type = "button";
    kopieren.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.code); kopieren.textContent = "Kopiert ✓"; }
      catch (e) { kopieren.textContent = "Nicht möglich"; }
      setTimeout(() => (kopieren.textContent = "Kopieren"), 1500);
    });
    leiste.appendChild(kopieren);
    if (!b.sprache || b.sprache === "pizza") {
      const oeffnen = el("button", "knopf knopf-mini", "Im Editor öffnen");
      oeffnen.type = "button";
      oeffnen.addEventListener("click", () => oeffneCode(b.code, abschnitt.titel));
      leiste.appendChild(oeffnen);
      if (b.ausfuehrbar) {
        const backen = el("button", "knopf knopf-mini knopf-mini-primaer", "Öffnen & backen ▶");
        backen.type = "button";
        backen.addEventListener("click", () => backeCode(b.code, abschnitt.titel));
        leiste.appendChild(backen);
      }
    }
    wrap.appendChild(leiste);
    return wrap;
  }

  function blockDom(b, abschnitt) {
    switch (b && b.art) {
      case "text": { const d = el("div", "doku-text"); d.appendChild(markdownDom(b.md, { linkKlick })); return d; }
      case "code": return codeBlock(b, abschnitt);
      case "tabelle": {
        const scroll = el("div", "tabelle-scroll");
        const tab = el("table", "doku-tabelle");
        if (Array.isArray(b.kopf)) {
          const thead = el("thead"); const tr = el("tr");
          b.kopf.forEach((k) => { const th = el("th"); th.scope = "col"; th.appendChild(markdownDom(String(k), { inline: true, linkKlick })); tr.appendChild(th); });
          thead.appendChild(tr); tab.appendChild(thead);
        }
        const tbody = el("tbody");
        (b.zeilen || []).forEach((z) => {
          const tr = el("tr");
          (z || []).forEach((zelle) => { const td = el("td"); td.appendChild(markdownDom(String(zelle ?? ""), { inline: true, linkKlick })); tr.appendChild(td); });
          tbody.appendChild(tr);
        });
        tab.appendChild(tbody); scroll.appendChild(tab);
        return scroll;
      }
      case "hinweis": {
        const ton = ["info", "warnung", "pizza"].includes(b.ton) ? b.ton : "info";
        const d = el("aside", "doku-hinweis ton-" + ton);
        const icon = el("span", "hinweis-icon", ton === "warnung" ? "⚠" : ton === "pizza" ? "🍕" : "i");
        icon.setAttribute("aria-hidden", "true");
        d.appendChild(icon);
        const t = el("div", "hinweis-text");
        t.appendChild(markdownDom(b.md, { linkKlick }));
        d.appendChild(t);
        return d;
      }
      case "ausgabe": {
        const f = el("figure", "doku-ausgabe");
        f.appendChild(el("figcaption", null, "Ausgabe"));
        f.appendChild(el("pre", null, String(b.text ?? "")));
        return f;
      }
      default: return null;
    }
  }

  function zeichneNav(filter) {
    nav.textContent = "";
    const q = (filter || "").trim().toLowerCase();
    const treffer = q ? abschnitte.filter((a) => a._such.includes(q)) : abschnitte;
    if (!treffer.length) {
      nav.appendChild(el("p", "nav-leer", q ? `Nichts gefunden für „${filter.trim()}“.` : "Noch keine Doku vorhanden."));
      return;
    }
    const gruppen = new Map();
    for (const a of treffer) {
      if (!gruppen.has(a.gruppe)) gruppen.set(a.gruppe, []);
      gruppen.get(a.gruppe).push(a);
    }
    for (const [gruppe, liste] of gruppen) {
      const g = el("div", "nav-gruppe");
      g.appendChild(el("h3", "nav-gruppe-titel", gruppe));
      const ul = el("ul");
      for (const a of liste) {
        const li = el("li");
        const knopf = el("button", "nav-eintrag");
        knopf.type = "button";
        knopf.dataset.id = a.id;
        knopf.appendChild(el("span", "nav-titel", a.titel));
        if (a.tier === 3) { const p = el("span", "nav-punkt tier-3"); p.title = "nur Spezifikation"; knopf.appendChild(p); }
        if (aktuell && aktuell.id === a.id) knopf.setAttribute("aria-current", "true");
        knopf.addEventListener("click", () => zeige(a.id, true));
        li.appendChild(knopf);
        ul.appendChild(li);
      }
      g.appendChild(ul);
      nav.appendChild(g);
    }
  }

  function zeige(id, fokus) {
    const a = abschnitte.find((x) => x.id === id) || abschnitte[0];
    if (!a) return leerZustand();
    aktuell = a;
    navAktuell.textContent = a.titel;
    navOffen(false);
    try { localStorage.setItem("pizza.doku", a.id); } catch (e) { /* egal */ }
    nav.querySelectorAll(".nav-eintrag").forEach((k) => {
      if (k.dataset.id === a.id) k.setAttribute("aria-current", "true"); else k.removeAttribute("aria-current");
    });
    inhalt.textContent = "";
    const kopf = el("header", "doku-abschnitt-kopf");
    kopf.appendChild(el("div", "doku-gruppe", a.gruppe));
    const h = el("h2", "doku-titel", a.titel);
    h.id = "doku-titel-" + a.id;
    kopf.appendChild(h);
    const tb = tierBadge(a.tier);
    if (tb) kopf.appendChild(tb);
    inhalt.appendChild(kopf);
    for (const b of a.inhalt) {
      const d = blockDom(b, a);
      if (d) inhalt.appendChild(d);
    }
    // Vor/Zurück
    const i = abschnitte.indexOf(a);
    const fuss = el("nav", "doku-fuss");
    fuss.setAttribute("aria-label", "Weiterblättern");
    if (i > 0) fuss.appendChild(blaetter(abschnitte[i - 1], "← Zurück"));
    fuss.appendChild(el("span", "flex-luecke"));
    if (i < abschnitte.length - 1) fuss.appendChild(blaetter(abschnitte[i + 1], "Weiter →"));
    inhalt.appendChild(fuss);
    inhalt.scrollTop = 0;
    if (fokus) inhalt.focus({ preventScroll: true });
  }

  function blaetter(a, label) {
    const k = el("button", "doku-blaettern");
    k.type = "button";
    k.appendChild(el("span", "blaettern-label", label));
    k.appendChild(el("span", "blaettern-titel", a.titel));
    k.addEventListener("click", () => zeige(a.id, true));
    return k;
  }

  function leerZustand() {
    inhalt.textContent = "";
    navAktuell.textContent = "";
    const d = el("div", "leer-zustand");
    d.appendChild(el("div", "leer-icon", "📖"));
    d.appendChild(el("h2", null, "Die Doku ist noch im Ofen"));
    d.appendChild(el("p", null, "Sobald die Doku-Dateien (js/doku/*.js) vorhanden sind, erscheint sie hier."));
    inhalt.appendChild(d);
  }

  function laden() {
    abschnitte = abschnitteLaden();
    abschnitte.forEach((a) => (a._such = suchtext(a)));
    zeichneNav(suche.value);
    if (!abschnitte.length) leerZustand();
    else zeige(gemerkt && abschnitte.some((a) => a.id === gemerkt) ? gemerkt : abschnitte[0].id, false);
  }

  let suchTimer = null;
  suche.addEventListener("input", () => {
    clearTimeout(suchTimer);
    suchTimer = setTimeout(() => {
      zeichneNav(suche.value);
      const erster = nav.querySelector(".nav-eintrag");
      if (suche.value.trim() && erster && !nav.querySelector("[aria-current]")) zeige(erster.dataset.id, false);
      navOffen(!!suche.value.trim());
    }, 120);
  });
  suche.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const erster = nav.querySelector(".nav-eintrag"); if (erster) erster.click(); }
    if (e.key === "Escape" && suche.value) { e.stopPropagation(); suche.value = ""; zeichneNav(""); }
  });

  laden();
  return { laden, zeige };
}
