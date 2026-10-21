// Doku: ein durchgehender Artikel mit allen Abschnitten + immer sichtbares Inhaltsverzeichnis (Scroll-Spy).
// Zwei Ansichten mit identischem Aufbau: im Seitenpanel und im Lesemodus (Popup). Layout per Container-Query.
import { markdownDom, markdownText } from "./markdown.js";
import { highlightStatisch } from "./sprache.js";

const TIER = {
  1: { text: "läuft im Playground", klasse: "tier-1", titel: "Tier 1 – läuft exakt wie beschrieben" },
  2: { text: "läuft (simuliert)", klasse: "tier-2", titel: "Tier 2 – läuft im Playground mit vereinfachter/simulierter Semantik" },
  3: { text: "nur Spezifikation", klasse: "tier-3", titel: "Tier 3 – nur Spezifikation, läuft nicht im Playground" },
};

export function tierBadge(tier, kurz = false) {
  const d = TIER[tier];
  if (!d) return null;
  const b = document.createElement("span");
  b.className = "tier-badge " + d.klasse;
  b.textContent = kurz ? (tier === 3 ? "Spezifikation" : "läuft") : d.text;
  b.title = d.titel;
  return b;
}

const ICON = {
  kopieren: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  oeffnen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  backen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>',
  lupe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
};

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}

function iconKnopf(icon, label, klasse = "") {
  const k = el("button", "icon-knopf " + klasse);
  k.type = "button";
  k.title = label;
  k.setAttribute("aria-label", label);
  k.innerHTML = ICON[icon];
  return k;
}

const SICHERES_BILD = /^(?!.*\.\.)[\w\-./]+\.(svg|png|jpe?g|webp|gif|avif)$/i;

function abschnitteLaden() {
  const roh = (typeof self !== "undefined" && Array.isArray(self.PIZZA_DOKU)) ? self.PIZZA_DOKU : [];
  const gesehen = new Set();
  return roh
    .filter((a) => a && typeof a === "object" && a.id && a.titel && !gesehen.has(a.id) && gesehen.add(a.id))
    .map((a) => ({ ...a, ordnung: Number(a.ordnung) || 0, gruppe: a.gruppe || "Sonstiges", inhalt: Array.isArray(a.inhalt) ? a.inhalt : [] }))
    .sort((a, b) => a.ordnung - b.ordnung || String(a.titel).localeCompare(String(b.titel), "de"));
}

function blockText(b) {
  if (!b) return "";
  const t = [];
  if (b.md) t.push(markdownText(b.md));
  if (b.code) t.push(b.code);
  if (b.text) t.push(b.text);
  if (b.titel) t.push(b.titel);
  if (b.alt) t.push(b.alt);
  if (b.unterschrift) t.push(b.unterschrift);
  if (b.kopf) t.push(b.kopf.join(" "));
  if (b.zeilen) t.push(b.zeilen.flat().join(" "));
  if (Array.isArray(b.inhalt)) t.push(b.inhalt.map(blockText).join(" "));
  return t.join(" \n ");
}

// Suchtreffer im DOM markieren (nur Textknoten, XSS-sicher)
function markiere(wurzel, q) {
  if (!q) return;
  const walker = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT);
  const knoten = [];
  while (walker.nextNode()) knoten.push(walker.currentNode);
  for (const n of knoten) {
    const text = n.nodeValue;
    const klein = text.toLowerCase();
    let i = klein.indexOf(q);
    if (i < 0) continue;
    const frag = document.createDocumentFragment();
    let pos = 0;
    while (i >= 0) {
      if (i > pos) frag.appendChild(document.createTextNode(text.slice(pos, i)));
      frag.appendChild(el("mark", "such-treffer", text.slice(i, i + q.length)));
      pos = i + q.length;
      i = klein.indexOf(q, pos);
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    n.parentNode.replaceChild(frag, n);
  }
}

export function erstelleDoku({ oeffneCode, backeCode, zeigeBild, vorAktion }) {
  let abschnitte = [];
  let gemerkt = null;
  try { gemerkt = localStorage.getItem("pizza.doku"); } catch (e) { /* egal */ }
  const wenigBewegung = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: true };
  const ansichten = [];

  function merke(id) {
    gemerkt = id;
    try { localStorage.setItem("pizza.doku", id); } catch (e) { /* egal */ }
  }

  // ---------- eine Ansicht ----------
  function erstelleAnsicht(wurzel, { name }) {
    wurzel.textContent = "";
    wurzel.classList.add("doku-ansicht");
    const praefix = "dk-" + name + "-";

    // Inhaltsverzeichnis (Suche + Liste)
    const toc = el("nav", "doku-toc");
    toc.setAttribute("aria-label", "Inhaltsverzeichnis");
    const suchWrap = el("div", "doku-suche");
    suchWrap.innerHTML = ICON.lupe;
    const suche = el("input");
    suche.type = "search";
    suche.dataset.testid = "doku-suche";
    suche.placeholder = "Suchen …";
    suche.autocomplete = "off";
    suche.setAttribute("aria-label", "Doku durchsuchen");
    suchWrap.appendChild(suche);
    const tocListe = el("div", "toc-liste");
    toc.appendChild(suchWrap);
    toc.appendChild(tocListe);

    const artikel = el("div", "doku-artikel");
    artikel.tabIndex = -1;
    artikel.setAttribute("role", "document");
    artikel.setAttribute("aria-label", "pizza-Dokumentation");

    wurzel.appendChild(toc);
    wurzel.appendChild(artikel);

    const a = { name, wurzel, toc, tocListe, artikel, suche, aktivId: null, gerendert: false, sektionen: [], tocKnoten: new Map(), sperreSpy: 0 };

    function linkKlick(ev, url) {
      if (url.startsWith("#") && !url.startsWith("#code=")) {
        ev.preventDefault();
        const id = decodeURIComponent(url.slice(1));
        if (abschnitte.some((x) => x.id === id)) springe(id);
      }
    }

    function codeBlock(b, abschnitt, nr) {
      const fig = el("figure", "doku-code");
      const pre = el("pre", "code-statisch");
      const code = el("code");
      const sprache = b.sprache || "pizza";
      code.appendChild(highlightStatisch(String(b.code || ""), sprache));
      pre.appendChild(code);
      fig.appendChild(pre);
      const leiste = el("div", "code-aktionen");
      if (sprache !== "pizza") leiste.appendChild(el("span", "code-sprache", sprache));
      else if ((b.tier ?? abschnitt.tier) === 3) leiste.appendChild(tierBadge(3, true));
      const kopieren = iconKnopf("kopieren", "Code kopieren");
      kopieren.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(b.code); kopieren.innerHTML = ICON.ok; kopieren.classList.add("ok"); }
        catch (e) { kopieren.title = "Kopieren nicht möglich"; }
        setTimeout(() => { kopieren.innerHTML = ICON.kopieren; kopieren.classList.remove("ok"); }, 1400);
      });
      leiste.appendChild(kopieren);
      if (sprache === "pizza") {
        const schluessel = "doku:" + abschnitt.id + ":" + nr;
        const oeffnen = iconKnopf("oeffnen", "In neuem Editor-Tab öffnen");
        oeffnen.dataset.testid = "doku-code-oeffnen";
        oeffnen.addEventListener("click", () => { vorAktion && vorAktion(); oeffneCode(b.code, abschnitt.titel, schluessel); });
        leiste.appendChild(oeffnen);
        if (b.ausfuehrbar) {
          const backen = iconKnopf("backen", "In Editor-Tab öffnen und backen", "primaer");
          backen.dataset.testid = "doku-code-backen";
          backen.addEventListener("click", () => { vorAktion && vorAktion(); backeCode(b.code, abschnitt.titel, schluessel); });
          leiste.appendChild(backen);
        }
      }
      fig.appendChild(leiste);
      return fig;
    }

    function blockDom(b, abschnitt, zaehler) {
      switch (b && b.art) {
        case "kurz": {
          const d = el("div", "doku-kurz");
          d.appendChild(markdownDom(b.md, { linkKlick }));
          return d;
        }
        case "text": { const d = el("div", "doku-text"); d.appendChild(markdownDom(b.md, { linkKlick })); return d; }
        case "code": return codeBlock(b, abschnitt, zaehler.code++);
        case "bild": {
          const src = String(b.src || "");
          if (!SICHERES_BILD.test(src)) return null;
          const fig = el("figure", "doku-bild");
          const knopf = el("button", "bild-knopf");
          knopf.type = "button";
          knopf.title = "Bild vergrößern";
          const img = el("img");
          img.loading = "lazy";
          img.decoding = "async";
          img.alt = String(b.alt || "");
          img.addEventListener("error", () => { fig.hidden = true; });
          img.src = src;
          knopf.appendChild(img);
          knopf.addEventListener("click", () => zeigeBild && zeigeBild(src, img.alt, b.unterschrift || ""));
          fig.appendChild(knopf);
          if (b.unterschrift) {
            const cap = el("figcaption");
            cap.appendChild(markdownDom(String(b.unterschrift), { inline: true, linkKlick }));
            fig.appendChild(cap);
          }
          return fig;
        }
        case "details": {
          const d = el("details", "doku-details");
          const s = el("summary");
          s.appendChild(el("span", "details-titel", String(b.titel || "Mehr dazu")));
          d.appendChild(s);
          const innen = el("div", "details-inhalt");
          for (const kind of Array.isArray(b.inhalt) ? b.inhalt : []) {
            const k = blockDom(kind, abschnitt, zaehler);
            if (k) innen.appendChild(k);
          }
          d.appendChild(innen);
          return d;
        }
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
          const icon = el("span", "hinweis-icon", ton === "warnung" ? "!" : ton === "pizza" ? "🍕" : "i");
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

    function render() {
      const q = suche.value.trim().toLowerCase();
      artikel.textContent = "";
      tocListe.textContent = "";
      a.sektionen = [];
      a.tocKnoten = new Map();
      if (!abschnitte.length) {
        const d = el("div", "leer-zustand");
        d.appendChild(el("div", "leer-icon", "📖"));
        d.appendChild(el("h2", null, "Die Doku ist noch im Ofen"));
        d.appendChild(el("p", null, "Sobald die Doku-Dateien (js/doku/*.js) vorhanden sind, erscheint sie hier."));
        artikel.appendChild(d);
        return;
      }
      const treffer = q ? abschnitte.filter((x) => x._such.includes(q)) : abschnitte;
      if (!treffer.length) {
        tocListe.appendChild(el("p", "toc-leer", "Keine Treffer"));
        artikel.appendChild(el("p", "nav-leer", `Nichts gefunden für „${suche.value.trim()}“.`));
        return;
      }
      if (q) {
        artikel.appendChild(el("p", "such-info", `${treffer.length} von ${abschnitte.length} Abschnitten passen zu „${suche.value.trim()}“.`));
      }
      let gruppe = null, tocGruppe = null;
      for (const x of treffer) {
        if (x.gruppe !== gruppe) {
          gruppe = x.gruppe;
          artikel.appendChild(el("h2", "doku-gruppen-titel", gruppe));
          const g = el("div", "toc-gruppe");
          g.appendChild(el("div", "toc-gruppe-titel", gruppe));
          tocGruppe = el("ul");
          g.appendChild(tocGruppe);
          tocListe.appendChild(g);
        }
        // Inhaltsverzeichnis
        const li = el("li");
        const link = el("a", "toc-eintrag");
        link.href = "#" + x.id;
        link.dataset.id = x.id;
        link.dataset.testid = "doku-toc-eintrag";
        link.appendChild(el("span", "toc-titel", x.titel));
        if (x.tier === 3) { const p = el("span", "toc-punkt"); p.title = "nur Spezifikation"; link.appendChild(p); }
        link.addEventListener("click", (e) => { e.preventDefault(); springe(x.id, true); });
        li.appendChild(link);
        tocGruppe.appendChild(li);
        a.tocKnoten.set(x.id, link);

        // Abschnitt
        const sek = el("section", "doku-abschnitt");
        sek.id = praefix + x.id;
        sek.dataset.id = x.id;
        sek.dataset.testid = "doku-abschnitt";
        sek.setAttribute("aria-labelledby", sek.id + "-titel");
        const kopf = el("header", "doku-abschnitt-kopf");
        const h = el("h3", "doku-titel", x.titel);
        h.id = sek.id + "-titel";
        kopf.appendChild(h);
        const tb = tierBadge(x.tier);
        if (tb && x.tier !== 1) kopf.appendChild(tb);
        sek.appendChild(kopf);
        const zaehler = { code: 0 };
        for (const b of x.inhalt) {
          const d = blockDom(b, x, zaehler);
          if (d) sek.appendChild(d);
        }
        artikel.appendChild(sek);
        a.sektionen.push(sek);
      }
      if (q) {
        markiere(artikel, q);
        markiere(tocListe, q);
        // Treffer in zugeklappten Details sichtbar machen
        artikel.querySelectorAll("details").forEach((d) => { if (d.querySelector("mark")) d.open = true; });
      }
      a.gerendert = true;
    }

    function setzeAktiv(id, { tocScrollen = true } = {}) {
      if (a.aktivId === id) return;
      const alt = a.tocKnoten.get(a.aktivId);
      if (alt) alt.removeAttribute("aria-current");
      a.aktivId = id;
      const neu = a.tocKnoten.get(id);
      if (neu) {
        neu.setAttribute("aria-current", "location");
        if (tocScrollen) {
          // nur innerhalb der Liste scrollen, nicht die Seite
          const box = tocListe;
          if (box.scrollWidth > box.clientWidth + 4) {
            const l = neu.offsetLeft - box.offsetLeft;
            if (l < box.scrollLeft || l + neu.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = l - 24;
          } else {
            const t = neu.offsetTop - box.offsetTop;
            if (t < box.scrollTop || t + neu.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = t - box.clientHeight / 3;
          }
        }
      }
      if (!suche.value.trim()) merke(id);
    }

    function springe(id, fokus) {
      const sek = a.sektionen.find((s) => s.dataset.id === id);
      if (!sek) return;
      a.sperreSpy = Date.now() + 700;
      const ziel = Math.max(0, sek.offsetTop - 6);
      try { artikel.scrollTo({ top: ziel, behavior: wenigBewegung.matches || !fokus ? "auto" : "smooth" }); }
      catch (e) { artikel.scrollTop = ziel; }
      setzeAktiv(id);
      if (fokus) {
        const h = sek.querySelector(".doku-titel");
        if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
      }
    }

    // Scroll-Spy
    let raf = 0;
    artikel.addEventListener("scroll", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (Date.now() < a.sperreSpy || !a.sektionen.length) return;
        const oben = artikel.scrollTop + 48;
        let aktiv = a.sektionen[0];
        for (const s of a.sektionen) { if (s.offsetTop <= oben) aktiv = s; else break; }
        // ganz unten: letzten Abschnitt aktivieren
        if (artikel.scrollTop + artikel.clientHeight >= artikel.scrollHeight - 4) aktiv = a.sektionen[a.sektionen.length - 1];
        setzeAktiv(aktiv.dataset.id);
      });
    }, { passive: true });

    let suchTimer = null;
    suche.addEventListener("input", () => {
      clearTimeout(suchTimer);
      suchTimer = setTimeout(() => {
        render();
        a.aktivId = null;
        artikel.scrollTop = 0;
        if (a.sektionen[0]) setzeAktiv(a.sektionen[0].dataset.id, {});
        if (!suche.value.trim() && gemerkt) springe(gemerkt);
      }, 160);
    });
    suche.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && suche.value) { e.stopPropagation(); e.preventDefault(); suche.value = ""; suche.dispatchEvent(new Event("input")); }
      if (e.key === "Enter" && a.sektionen[0]) { e.preventDefault(); springe(a.sektionen[0].dataset.id, true); }
    });

    a.render = render;
    a.springe = springe;
    a.zeigeGemerkt = () => {
      if (!a.gerendert) render();
      const id = gemerkt && a.sektionen.some((s) => s.dataset.id === gemerkt) ? gemerkt : a.sektionen[0] && a.sektionen[0].dataset.id;
      if (id) { a.aktivId = null; springe(id); }
    };
    ansichten.push(a);
    return a;
  }

  function laden() {
    abschnitte = abschnitteLaden();
    abschnitte.forEach((x) => (x._such = (x.titel + " \n " + x.gruppe + " \n " + x.inhalt.map(blockText).join(" \n ")).toLowerCase()));
    for (const a of ansichten) a.render();
  }

  laden();
  return {
    laden,
    ansicht(wurzel, name) {
      const a = erstelleAnsicht(wurzel, { name });
      a.render();
      return a;
    },
    get aktuell() { return gemerkt; },
  };
}
