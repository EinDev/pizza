// Editor-Tabs: jeder Tab hat einen eigenen EditorState (Undo-Historie, Cursor, Scroll).
// Persistenz: localStorage "pizza.tabs" = { aktiv, tabs: [{ id, name, schluessel, text, basis }] }.

const SPEICHER = "pizza.tabs";

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}

let zaehler = 0;
const neueId = () => "t" + Date.now().toString(36) + (zaehler++).toString(36);

export function erstelleTabs({ editor, leiste, speicher, frage, willkommen, beiWechsel }) {
  /** @type {{id:string,name:string,schluessel:string|null,basis:string,state:any,text:string,scroll:number}[]} */
  let tabs = [];
  let aktivId = null;
  let speicherTimer = null;

  const aktiv = () => tabs.find((t) => t.id === aktivId) || null;
  const textVon = (t) => (t.id === aktivId ? editor.text() : t.state ? t.state.doc.toString() : t.text);
  const istSchmutzig = (t) => textVon(t) !== t.basis;

  // ---------- Laden ----------
  function laden() {
    let daten = null;
    try { daten = JSON.parse(speicher.hole(SPEICHER) || "null"); } catch (e) { daten = null; }
    if (daten && Array.isArray(daten.tabs) && daten.tabs.length) {
      tabs = daten.tabs
        .filter((t) => t && typeof t.text === "string")
        .map((t) => ({ id: String(t.id || neueId()), name: String(t.name || "unbenannt.pizza"), schluessel: t.schluessel || null,
          text: t.text, basis: typeof t.basis === "string" ? t.basis : t.text, state: null, scroll: 0 }));
      aktivId = tabs.some((t) => t.id === daten.aktiv) ? daten.aktiv : tabs[0] && tabs[0].id;
    }
    if (!tabs.length) {
      // Migration aus der Ein-Dokument-Version
      const alt = speicher.hole("pizza.code");
      const altBasis = speicher.hole("pizza.basis");
      if (alt != null && alt !== willkommen) {
        tabs.push({ id: neueId(), name: speicher.hole("pizza.datei") || "mein-code.pizza", schluessel: null, text: alt, basis: altBasis ?? alt, state: null, scroll: 0 });
      }
      tabs.unshift({ id: neueId(), name: "willkommen.pizza", schluessel: "willkommen", text: willkommen, basis: willkommen, state: null, scroll: 0 });
      aktivId = tabs[tabs.length - 1].id;
    }
    const t = aktiv();
    t.state = editor.neuerZustand(t.text);
    editor.setzeZustand(t.state);
    zeichne();
  }

  function speichern(sofort) {
    clearTimeout(speicherTimer);
    const los = () => {
      const daten = { aktiv: aktivId, tabs: tabs.map((t) => ({ id: t.id, name: t.name, schluessel: t.schluessel, text: textVon(t), basis: t.basis })) };
      speicher.setze(SPEICHER, JSON.stringify(daten));
    };
    if (sofort) los(); else speicherTimer = setTimeout(los, 400);
  }

  // ---------- Darstellung ----------
  function zeichne() {
    leiste.textContent = "";
    const liste = el("div", "etabs-liste");
    liste.setAttribute("role", "tablist");
    liste.setAttribute("aria-label", "Geöffnete Dateien");
    for (const t of tabs) liste.appendChild(tabKnoten(t));
    leiste.appendChild(liste);
    const plus = el("button", "etab-neu");
    plus.type = "button";
    plus.title = "Neuer Tab";
    plus.setAttribute("aria-label", "Neuer leerer Tab");
    plus.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    plus.addEventListener("click", () => neu());
    leiste.appendChild(plus);
    const a = liste.querySelector('[aria-selected="true"]');
    if (a && a.scrollIntoView) a.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function tabKnoten(t) {
    const istAktiv = t.id === aktivId;
    const wrap = el("div", "etab" + (istAktiv ? " aktiv" : "") + (istSchmutzig(t) ? " schmutzig" : ""));
    wrap.dataset.id = t.id;
    const knopf = el("button", "etab-knopf");
    knopf.type = "button";
    knopf.setAttribute("role", "tab");
    knopf.setAttribute("aria-selected", String(istAktiv));
    knopf.setAttribute("aria-controls", "editor");
    knopf.tabIndex = istAktiv ? 0 : -1;
    knopf.title = t.name + " – Doppelklick zum Umbenennen";
    knopf.appendChild(el("span", "etab-name", t.name));
    knopf.addEventListener("click", () => wechsle(t.id));
    knopf.addEventListener("dblclick", () => umbenennen(t.id));
    knopf.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); schliesse(t.id); } });
    knopf.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(t);
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = tabs.length - 1;
      else if (e.key === "F2") { e.preventDefault(); umbenennen(t.id); return; }
      else if (e.key === "Delete") { e.preventDefault(); schliesse(t.id); return; }
      if (j != null) {
        e.preventDefault();
        wechsle(tabs[j].id, { fokusEditor: false });
        const k = leiste.querySelector(`.etab[data-id="${tabs[j].id}"] .etab-knopf`);
        if (k) k.focus();
      }
    });
    wrap.appendChild(knopf);
    const zu = el("button", "etab-zu");
    zu.type = "button";
    zu.title = "Tab schließen";
    zu.setAttribute("aria-label", t.name + " schließen");
    zu.innerHTML = '<span class="etab-punkt" aria-hidden="true"></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
    zu.addEventListener("click", (e) => { e.stopPropagation(); schliesse(t.id); });
    wrap.appendChild(zu);
    return wrap;
  }

  function aktualisiereMarker() {
    for (const w of leiste.querySelectorAll(".etab")) {
      const t = tabs.find((x) => x.id === w.dataset.id);
      if (t) w.classList.toggle("schmutzig", istSchmutzig(t));
    }
  }

  // ---------- Aktionen ----------
  function sichereAktiven() {
    const a = aktiv();
    if (!a) return;
    a.state = editor.zustand();
    a.text = a.state.doc.toString();
    a.scroll = editor.view.scrollDOM.scrollTop;
  }

  function wechsle(id, { fokusEditor = true } = {}) {
    const ziel = tabs.find((t) => t.id === id);
    if (!ziel) return;
    if (id !== aktivId) {
      sichereAktiven();
      aktivId = id;
      if (!ziel.state) ziel.state = editor.neuerZustand(ziel.text);
      editor.setzeZustand(ziel.state);
      const s = ziel.scroll || 0;
      requestAnimationFrame(() => { editor.view.scrollDOM.scrollTop = s; });
      zeichne();
      speichern();
      beiWechsel && beiWechsel(ziel);
    }
    if (fokusEditor) editor.view.focus();
  }

  /** Öffnet Code in einem Tab. Gleicher Schlüssel → vorhandenen Tab fokussieren. */
  function oeffne(code, name, schluessel) {
    if (schluessel) {
      const da = tabs.find((t) => t.schluessel === schluessel);
      if (da) { wechsle(da.id); return { tab: da, neu: false }; }
    }
    const a = aktiv();
    // Unberührten, leeren Tab wiederverwenden
    if (a && !a.schluessel && editor.text() === "" && a.basis === "") {
      a.name = eindeutigerName(name || "unbenannt.pizza", a.id);
      a.schluessel = schluessel || null;
      a.basis = code;
      editor.setzeZustand((a.state = editor.neuerZustand(code)));
      zeichne(); speichern();
      beiWechsel && beiWechsel(a);
      editor.view.focus();
      return { tab: a, neu: true };
    }
    sichereAktiven();
    const t = { id: neueId(), name: eindeutigerName(name || "unbenannt.pizza"), schluessel: schluessel || null, text: code, basis: code, state: null, scroll: 0 };
    const pos = a ? tabs.indexOf(a) + 1 : tabs.length;
    tabs.splice(pos, 0, t);
    aktivId = null;
    wechsle(t.id);
    return { tab: t, neu: true };
  }

  function eindeutigerName(name, ausser) {
    const belegt = new Set(tabs.filter((t) => t.id !== ausser).map((t) => t.name));
    if (!belegt.has(name)) return name;
    const m = /^(.*?)(\.pizza)?$/.exec(name);
    for (let i = 2; ; i++) { const n = `${m[1]}-${i}${m[2] || ""}`; if (!belegt.has(n)) return n; }
  }

  function neu() {
    let n = 1;
    const namen = new Set(tabs.map((t) => t.name));
    while (namen.has(`unbenannt-${n}.pizza`)) n++;
    sichereAktiven();
    const t = { id: neueId(), name: `unbenannt-${n}.pizza`, schluessel: null, text: "", basis: "", state: null, scroll: 0 };
    tabs.push(t);
    aktivId = null;
    wechsle(t.id);
  }

  async function schliesse(id) {
    const t = tabs.find((x) => x.id === id);
    if (!t) return;
    if (istSchmutzig(t) && textVon(t).trim()) {
      const ok = await frage("Tab schließen?", `„${t.name}“ hat ungespeicherte Änderungen. Beim Schließen gehen sie verloren.`, "Schließen");
      if (!ok) return;
    }
    const i = tabs.indexOf(t);
    tabs.splice(i, 1);
    if (!tabs.length) {
      const leer = { id: neueId(), name: "unbenannt-1.pizza", schluessel: null, text: "", basis: "", state: null, scroll: 0 };
      tabs.push(leer);
    }
    if (id === aktivId) {
      aktivId = null;
      wechsle(tabs[Math.min(i, tabs.length - 1)].id);
    } else {
      zeichne();
      speichern();
    }
  }

  function umbenennen(id) {
    const t = tabs.find((x) => x.id === id);
    const w = leiste.querySelector(`.etab[data-id="${id}"]`);
    if (!t || !w) return;
    const knopf = w.querySelector(".etab-knopf");
    const eingabe = el("input", "etab-eingabe");
    eingabe.value = t.name;
    eingabe.setAttribute("aria-label", "Neuer Name für " + t.name);
    eingabe.spellcheck = false;
    eingabe.size = Math.max(8, t.name.length);
    knopf.replaceWith(eingabe);
    eingabe.focus();
    const punkt = t.name.lastIndexOf(".");
    eingabe.setSelectionRange(0, punkt > 0 ? punkt : t.name.length);
    let fertig = false;
    const ende = (uebernehmen) => {
      if (fertig) return;
      fertig = true;
      const n = eingabe.value.trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60);
      if (uebernehmen && n) t.name = eindeutigerName(n, t.id);
      zeichne(); speichern();
      if (t.id === aktivId) beiWechsel && beiWechsel(t);
      const k = leiste.querySelector(`.etab[data-id="${id}"] .etab-knopf`);
      if (k) k.focus();
    };
    eingabe.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); ende(true); }
      else if (e.key === "Escape") { e.preventDefault(); ende(false); }
    });
    eingabe.addEventListener("input", () => { eingabe.size = Math.max(8, eingabe.value.length); });
    eingabe.addEventListener("blur", () => ende(true));
  }

  return {
    laden,
    aktiv,
    oeffne,
    neu,
    wechsle,
    schliesse,
    get anzahl() { return tabs.length; },
    beiAenderung() { aktualisiereMarker(); speichern(); },
    /** Strg+S: aktiven Tab als gespeichert markieren. */
    sichern() {
      const a = aktiv();
      if (!a) return null;
      a.basis = editor.text();
      aktualisiereMarker();
      speichern(true);
      return a;
    },
    sofortSpeichern() { speichern(true); },
  };
}
