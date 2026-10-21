// Editor-Tabs: jeder Tab hat einen eigenen EditorState (Undo-Historie, Cursor, Scroll).
// Persistenz: localStorage "pizza.tabs" = { aktiv, tabs: [...], geschlossen: [...] }.
// Funktionen: Kontextmenü, Sammel-Schließen mit einer Rückfrage, Wiederherstellen, Anheften,
// Duplizieren, Drag & Drop, Mausrad-Scrollen, „Alle Tabs“-Menü mit Suche, Herunterladen.
import { oeffneMenue } from "./menue.js";
import { iconSvg } from "./icons.js";

const SPEICHER = "pizza.tabs";
const MAX_GESCHLOSSEN = 10;

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}
const SVG = {
  plus: iconSvg("plus"),
  zu: iconSvg("x"),
  liste: iconSvg("chevronDown"),
  mehr: iconSvg("more"),
  pin: iconSvg("pin"),
};

let zaehler = 0;
const neueId = () => "t" + Date.now().toString(36) + (zaehler++).toString(36);

export function erstelleTabs({ editor, leiste, speicher, frage, willkommen, beiWechsel, beiTeilen, beiExe, toast }) {
  /** @type {{id:string,name:string,schluessel:string|null,basis:string,state:any,text:string,scroll:number,angeheftet:boolean}[]} */
  let tabs = [];
  let geschlossen = [];
  let aktivId = null;
  let speicherTimer = null;
  let listeEl = null;

  const aktiv = () => tabs.find((t) => t.id === aktivId) || null;
  const finde = (id) => tabs.find((t) => t.id === id) || null;
  const textVon = (t) => (t.id === aktivId ? editor.text() : t.state ? t.state.doc.toString() : t.text);
  const istSchmutzig = (t) => textVon(t) !== t.basis;
  const neuerTab = (werte) => ({ id: neueId(), name: "unbenannt.pizza", schluessel: null, text: "", basis: "", state: null, scroll: 0, angeheftet: false, ...werte });
  const ordnen = () => { tabs = [...tabs.filter((t) => t.angeheftet), ...tabs.filter((t) => !t.angeheftet)]; };

  // ---------- Laden / Speichern ----------
  function laden() {
    let daten = null;
    try { daten = JSON.parse(speicher.hole(SPEICHER) || "null"); } catch (e) { daten = null; }
    if (daten && Array.isArray(daten.tabs) && daten.tabs.length) {
      tabs = daten.tabs
        .filter((t) => t && typeof t.text === "string")
        .map((t) => neuerTab({ id: String(t.id || neueId()), name: String(t.name || "unbenannt.pizza"), schluessel: t.schluessel || null,
          text: t.text, basis: typeof t.basis === "string" ? t.basis : t.text, angeheftet: !!t.angeheftet }));
      aktivId = tabs.some((t) => t.id === daten.aktiv) ? daten.aktiv : tabs[0] && tabs[0].id;
      if (Array.isArray(daten.geschlossen)) geschlossen = daten.geschlossen.filter((g) => g && typeof g.text === "string").slice(0, MAX_GESCHLOSSEN);
    }
    if (!tabs.length) {
      // Migration aus der Ein-Dokument-Version
      const alt = speicher.hole("pizza.code");
      const altBasis = speicher.hole("pizza.basis");
      if (alt != null && alt !== willkommen) tabs.push(neuerTab({ name: speicher.hole("pizza.datei") || "mein-code.pizza", text: alt, basis: altBasis ?? alt }));
      tabs.unshift(neuerTab({ name: "willkommen.pizza", schluessel: "willkommen", text: willkommen, basis: willkommen }));
      aktivId = tabs[tabs.length - 1].id;
    }
    ordnen();
    const t = aktiv();
    t.state = editor.neuerZustand(t.text);
    editor.setzeZustand(t.state);
    zeichne();
  }

  function speichern(sofort) {
    clearTimeout(speicherTimer);
    const los = () => {
      const daten = {
        aktiv: aktivId,
        tabs: tabs.map((t) => ({ id: t.id, name: t.name, schluessel: t.schluessel, text: textVon(t), basis: t.basis, angeheftet: t.angeheftet || undefined })),
        geschlossen,
      };
      speicher.setze(SPEICHER, JSON.stringify(daten));
    };
    if (sofort) los(); else speicherTimer = setTimeout(los, 400);
  }

  // ---------- Darstellung ----------
  function zeichne() {
    const altScroll = listeEl ? listeEl.scrollLeft : 0;
    leiste.textContent = "";
    listeEl = el("div", "etabs-liste");
    listeEl.setAttribute("role", "tablist");
    listeEl.setAttribute("aria-label", "Geöffnete Dateien");
    for (const t of tabs) listeEl.appendChild(tabKnoten(t));
    listeEl.scrollLeft = altScroll;
    // Mausrad → horizontal scrollen
    listeEl.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && listeEl.scrollWidth > listeEl.clientWidth) {
        e.preventDefault();
        listeEl.scrollLeft += e.deltaY;
      }
    }, { passive: false });
    leiste.appendChild(listeEl);

    const knoepfe = el("div", "etabs-knoepfe");
    const plus = el("button", "etab-aktion");
    plus.type = "button";
    plus.title = "Neuer Tab (Strg+Alt+N)";
    plus.setAttribute("aria-label", "Neuer leerer Tab");
    plus.dataset.testid = "editor-tab-neu";
    plus.innerHTML = SVG.plus;
    plus.addEventListener("click", () => neu());
    knoepfe.appendChild(plus);

    const alle = el("button", "etab-aktion");
    alle.type = "button";
    alle.title = "Alle Tabs & zuletzt geschlossene";
    alle.setAttribute("aria-label", "Alle Tabs anzeigen");
    alle.setAttribute("aria-haspopup", "menu");
    alle.dataset.testid = "editor-tabs-alle";
    alle.innerHTML = SVG.liste + (tabs.length > 1 ? `<span class="etab-anzahl">${tabs.length}</span>` : "");
    alle.addEventListener("click", () => alleTabsMenue(alle));
    knoepfe.appendChild(alle);

    const mehr = el("button", "etab-aktion");
    mehr.type = "button";
    mehr.title = "Tab-Aktionen";
    mehr.setAttribute("aria-label", "Aktionen für den aktiven Tab");
    mehr.setAttribute("aria-haspopup", "menu");
    mehr.dataset.testid = "editor-tab-menue";
    mehr.innerHTML = SVG.mehr;
    mehr.addEventListener("click", () => kontextMenue(aktivId, { anker: mehr }));
    knoepfe.appendChild(mehr);
    leiste.appendChild(knoepfe);

    const a = listeEl.querySelector(".etab.aktiv");
    if (a) {
      const l = a.offsetLeft, r = l + a.offsetWidth;
      if (l < listeEl.scrollLeft) listeEl.scrollLeft = l - 8;
      else if (r > listeEl.scrollLeft + listeEl.clientWidth) listeEl.scrollLeft = r - listeEl.clientWidth + 8;
    }
  }

  let ziehId = null;
  function tabKnoten(t) {
    const istAktiv = t.id === aktivId;
    const wrap = el("div", "etab" + (istAktiv ? " aktiv" : "") + (istSchmutzig(t) ? " schmutzig" : "") + (t.angeheftet ? " angeheftet" : ""));
    wrap.dataset.id = t.id;
    wrap.dataset.testid = "editor-tab";
    if (istAktiv) wrap.dataset.aktiv = "true";
    if (t.angeheftet) wrap.dataset.angeheftet = "true";
    wrap.draggable = true;

    const knopf = el("button", "etab-knopf");
    knopf.type = "button";
    knopf.setAttribute("role", "tab");
    knopf.setAttribute("aria-selected", String(istAktiv));
    knopf.setAttribute("aria-controls", "editor");
    knopf.tabIndex = istAktiv ? 0 : -1;
    knopf.title = t.name + (t.angeheftet ? " (angeheftet)" : "") + " – Doppelklick: umbenennen · Rechtsklick: Menü";
    if (t.angeheftet) { const p = el("span", "etab-pin"); p.innerHTML = SVG.pin; knopf.appendChild(p); }
    const nameEl = el("span", "etab-name", t.name);
    nameEl.dataset.testid = "editor-tab-name";
    knopf.appendChild(nameEl);
    knopf.dataset.testid = "editor-tab-knopf";
    knopf.addEventListener("click", () => wechsle(t.id));
    knopf.addEventListener("dblclick", () => umbenennen(t.id));
    wrap.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); schliesse(t.id); } });
    wrap.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
    wrap.addEventListener("contextmenu", (e) => { e.preventDefault(); kontextMenue(t.id, { x: e.clientX, y: e.clientY }); });
    knopf.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(t);
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = tabs.length - 1;
      else if (e.key === "F2") { e.preventDefault(); umbenennen(t.id); return; }
      else if (e.key === "Delete") { e.preventDefault(); schliesse(t.id); return; }
      else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) { e.preventDefault(); kontextMenue(t.id, { anker: wrap }); return; }
      if (j != null) {
        e.preventDefault();
        if (e.ctrlKey && e.shiftKey) { verschiebe(t.id, tabs[j].id, j > i); fokusTab(t.id); return; }
        wechsle(tabs[j].id, { fokusEditor: false });
        fokusTab(tabs[j].id);
      }
    });
    wrap.appendChild(knopf);

    if (!t.angeheftet) {
      const zu = el("button", "etab-zu");
      zu.type = "button";
      zu.title = "Tab schließen (Alt+W)";
      zu.tabIndex = -1;
      zu.setAttribute("aria-label", t.name + " schließen");
      zu.dataset.testid = "editor-tab-schliessen";
      zu.innerHTML = '<span class="etab-punkt" aria-hidden="true"></span>' + SVG.zu;
      zu.addEventListener("click", (e) => { e.stopPropagation(); schliesse(t.id); });
      wrap.appendChild(zu);
    } else {
      const p = el("span", "etab-punkt etab-punkt-pin");
      p.setAttribute("aria-hidden", "true");
      wrap.appendChild(p);
    }

    // Drag & Drop zum Umsortieren
    wrap.addEventListener("dragstart", (e) => {
      ziehId = t.id;
      wrap.classList.add("zieht");
      try { e.dataTransfer.setData("application/x-pizza-tab", t.id); e.dataTransfer.effectAllowed = "move"; } catch (x) { /* egal */ }
    });
    wrap.addEventListener("dragend", () => { ziehId = null; wrap.classList.remove("zieht"); leiste.querySelectorAll(".drop-links,.drop-rechts").forEach((x) => x.classList.remove("drop-links", "drop-rechts")); });
    wrap.addEventListener("dragover", (e) => {
      if (!ziehId || ziehId === t.id) return;
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      const rechts = e.clientX > r.left + r.width / 2;
      wrap.classList.toggle("drop-rechts", rechts);
      wrap.classList.toggle("drop-links", !rechts);
    });
    wrap.addEventListener("dragleave", () => wrap.classList.remove("drop-links", "drop-rechts"));
    wrap.addEventListener("drop", (e) => {
      if (!ziehId) return;
      e.preventDefault();
      const rechts = wrap.classList.contains("drop-rechts");
      wrap.classList.remove("drop-links", "drop-rechts");
      verschiebe(ziehId, t.id, rechts);
    });
    return wrap;
  }

  function fokusTab(id) {
    const k = leiste.querySelector(`.etab[data-id="${id}"] .etab-knopf`);
    if (k) k.focus();
  }

  function aktualisiereMarker() {
    for (const w of leiste.querySelectorAll(".etab")) {
      const t = finde(w.dataset.id);
      if (t) w.classList.toggle("schmutzig", istSchmutzig(t));
    }
  }

  // ---------- Menüs ----------
  function kontextMenue(id, pos) {
    const t = finde(id);
    if (!t) return;
    const i = tabs.indexOf(t);
    const rechts = tabs.slice(i + 1).filter((x) => !x.angeheftet);
    const andere = tabs.filter((x) => x !== t && !x.angeheftet);
    const gespeicherte = tabs.filter((x) => !x.angeheftet && !istSchmutzig(x));
    oeffneMenue({
      ...pos,
      label: "Tab-Menü für " + t.name,
      testid: "tab-kontextmenue",
      eintraege: [
        { text: "Schließen", icon: "x", kuerzel: "Alt+W", aktion: () => schliesse(t.id), deaktiviert: t.angeheftet, grund: "Angeheftete Tabs zuerst lösen.", testid: "tab-menue-schliessen" },
        { text: "Andere schließen", icon: "closeOthers", aktion: () => schliesseMehrere(andere.map((x) => x.id)), deaktiviert: !andere.length, grund: "Keine anderen (nicht angehefteten) Tabs offen.", testid: "tab-menue-andere" },
        { text: "Rechts davon schließen", icon: "closeRight", aktion: () => schliesseMehrere(rechts.map((x) => x.id)), deaktiviert: !rechts.length, grund: "Rechts von diesem Tab ist nichts.", testid: "tab-menue-rechts" },
        { text: "Gespeicherte schließen", icon: "saved", aktion: () => schliesseMehrere(gespeicherte.map((x) => x.id)), deaktiviert: !gespeicherte.length, grund: "Kein Tab ohne ungespeicherte Änderungen.", testid: "tab-menue-gespeicherte" },
        { text: "Alle schließen", icon: "closeAll", aktion: () => schliesseAlle(), deaktiviert: !tabs.some((x) => !x.angeheftet), grund: "Nur angeheftete Tabs offen.", testid: "tab-menue-alle", gefahr: true },
        "-",
        { text: t.angeheftet ? "Lösen" : "Anheften", icon: t.angeheftet ? "pinOff" : "pin", aktion: () => anheften(t.id), testid: "tab-menue-anheften" },
        { text: "Duplizieren", icon: "copy", aktion: () => dupliziere(t.id), testid: "tab-menue-duplizieren" },
        { text: "Umbenennen", icon: "pencil", kuerzel: "F2", aktion: () => { wechsle(t.id, { fokusEditor: false }); umbenennen(t.id); }, testid: "tab-menue-umbenennen" },
        "-",
        { text: "Als .pizza herunterladen", icon: "download", aktion: () => herunterladen(t.id), testid: "tab-menue-download" },
        { text: "Als Programm herunterladen …", icon: "monitor", aktion: () => { wechsle(t.id); beiExe && beiExe(); }, testid: "tab-menue-exe" },
        { text: "Teilen …", icon: "share", aktion: () => { wechsle(t.id); beiTeilen && beiTeilen(); }, testid: "tab-menue-teilen" },
        "-",
        { text: "Geschlossenen Tab wiederherstellen", icon: "restore", kuerzel: "Alt+Shift+T", aktion: () => wiederherstellen(0), deaktiviert: !geschlossen.length, grund: "Noch kein Tab geschlossen.", testid: "tab-menue-wiederherstellen" },
      ],
    });
  }

  function alleTabsMenue(anker) {
    const kopf = el("div", "menue-suche");
    const eingabe = el("input");
    eingabe.type = "search";
    eingabe.placeholder = "Tabs durchsuchen …";
    eingabe.setAttribute("aria-label", "Tabs durchsuchen");
    eingabe.dataset.testid = "tabs-suche";
    kopf.appendChild(eingabe);
    const eintraege = (q) => {
      q = q.trim().toLowerCase();
      const offen = tabs.filter((t) => !q || t.name.toLowerCase().includes(q));
      const zu = geschlossen.map((g, i) => ({ g, i })).filter(({ g }) => !q || g.name.toLowerCase().includes(q));
      const e = [{ ueberschrift: "Geöffnet (" + tabs.length + ")" }];
      if (!offen.length) e.push({ leer: "Kein Tab passt." });
      for (const t of offen) e.push({ text: t.name, icon: t.angeheftet ? "pin" : istSchmutzig(t) ? "dot" : "file", aktiv: t.id === aktivId, aktion: () => wechsle(t.id), testid: "tabs-liste-eintrag" });
      e.push("-", { ueberschrift: "Zuletzt geschlossen" });
      if (!zu.length) e.push({ leer: geschlossen.length ? "Kein geschlossener Tab passt." : "Noch nichts geschlossen." });
      for (const { g, i } of zu) e.push({ text: g.name, icon: "restore", zusatz: i === 0 ? "Alt+Shift+T" : "", aktion: () => wiederherstellen(i), testid: "tabs-geschlossen-eintrag" });
      e.push("-", { text: "Datei öffnen …", icon: "folderOpen", aktion: () => dateiDialog(), testid: "tabs-datei-oeffnen" },
        { text: "Alle schließen", icon: "closeAll", aktion: () => schliesseAlle(), gefahr: true, deaktiviert: !tabs.some((t) => !t.angeheftet), grund: "Nur angeheftete Tabs offen." });
      return e;
    };
    const m = oeffneMenue({ anker, eintraege: eintraege(""), label: "Alle Tabs", testid: "tabs-alle-menue", kopf, breit: true });
    eingabe.addEventListener("input", () => m.zeichne(eintraege(eingabe.value)));
    eingabe.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); m.fokusErster(); }
      else if (e.key === "Enter") { e.preventDefault(); const k = m.wurzel.querySelector(".menue-eintrag:not(:disabled)"); if (k) k.click(); }
    });
    requestAnimationFrame(() => eingabe.focus());
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
    const ziel = finde(id);
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

  function naechster(delta) {
    if (tabs.length < 2) return;
    const i = tabs.findIndex((t) => t.id === aktivId);
    wechsle(tabs[(i + delta + tabs.length) % tabs.length].id);
  }

  function einfuegen(t, nachAktivem = true) {
    sichereAktiven();
    const a = aktiv();
    let pos = a && nachAktivem ? tabs.indexOf(a) + 1 : tabs.length;
    if (!t.angeheftet) pos = Math.max(pos, tabs.filter((x) => x.angeheftet).length);
    tabs.splice(pos, 0, t);
    ordnen();
    aktivId = null;
    wechsle(t.id);
  }

  /** Öffnet Code in einem Tab. Gleicher Schlüssel → vorhandenen Tab fokussieren. */
  function oeffne(code, name, schluessel) {
    if (schluessel) {
      const da = tabs.find((t) => t.schluessel === schluessel);
      if (da) { wechsle(da.id); return { tab: da, neu: false }; }
    }
    const a = aktiv();
    // Unberührten, leeren Tab wiederverwenden
    if (a && !a.schluessel && !a.angeheftet && editor.text() === "" && a.basis === "") {
      a.name = eindeutigerName(name || "unbenannt.pizza", a.id);
      a.schluessel = schluessel || null;
      a.basis = code;
      editor.setzeZustand((a.state = editor.neuerZustand(code)));
      zeichne(); speichern();
      beiWechsel && beiWechsel(a);
      editor.view.focus();
      return { tab: a, neu: true };
    }
    const t = neuerTab({ name: eindeutigerName(name || "unbenannt.pizza"), schluessel: schluessel || null, text: code, basis: code });
    einfuegen(t);
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
    const t = neuerTab({ name: `unbenannt-${n}.pizza` });
    tabs.push(t);
    aktivId = null;
    wechsle(t.id);
  }

  function dupliziere(id) {
    const t = finde(id);
    if (!t) return;
    const text = textVon(t);
    const kopie = neuerTab({ name: eindeutigerName(t.name.replace(/(\.pizza)?$/, "-kopie$1")), text, basis: "" });
    if (aktivId !== id) wechsle(id, { fokusEditor: false });
    einfuegen(kopie);
  }

  function anheften(id) {
    const t = finde(id);
    if (!t) return;
    t.angeheftet = !t.angeheftet;
    // angeheftet → ans Ende der angehefteten Gruppe; gelöst → an den Anfang der übrigen
    tabs.splice(tabs.indexOf(t), 1);
    const n = tabs.filter((x) => x.angeheftet).length;
    tabs.splice(n, 0, t);
    zeichne(); speichern();
    fokusTab(id);
  }

  function verschiebe(id, zielId, dahinter) {
    const t = finde(id), ziel = finde(zielId);
    if (!t || !ziel || t === ziel) return;
    tabs.splice(tabs.indexOf(t), 1);
    let pos = tabs.indexOf(ziel) + (dahinter ? 1 : 0);
    const n = tabs.filter((x) => x.angeheftet).length;
    pos = t.angeheftet ? Math.min(pos, n) : Math.max(pos, n);
    tabs.splice(pos, 0, t);
    zeichne(); speichern();
  }

  function merkeGeschlossen(t) {
    const text = textVon(t);
    if (!text.trim() && !t.schluessel) return; // leere Tabs nicht merken
    geschlossen.unshift({ name: t.name, text, basis: t.basis, schluessel: t.schluessel, angeheftet: t.angeheftet });
    geschlossen = geschlossen.slice(0, MAX_GESCHLOSSEN);
  }

  function entferne(ids) {
    const weg = new Set(ids);
    const aktivWeg = weg.has(aktivId);
    const altIndex = tabs.findIndex((t) => t.id === aktivId);
    for (const t of tabs) if (weg.has(t.id)) merkeGeschlossen(t);
    tabs = tabs.filter((t) => !weg.has(t.id));
    if (!tabs.length) tabs.push(neuerTab({ name: "unbenannt-1.pizza" }));
    if (aktivWeg) {
      aktivId = null;
      wechsle(tabs[Math.min(Math.max(0, altIndex), tabs.length - 1)].id);
    } else {
      zeichne();
      speichern();
    }
  }

  async function schliesse(id) {
    const t = finde(id);
    if (!t) return;
    if (istSchmutzig(t) && textVon(t).trim()) {
      const ok = await frage("Tab schließen?", `„${t.name}“ hat ungespeicherte Änderungen. Du kannst den Tab danach über „Geschlossenen Tab wiederherstellen“ (Alt+Shift+T) zurückholen.`, "Schließen");
      if (!ok) return;
    }
    entferne([id]);
  }

  /** Mehrere Tabs schließen – höchstens EINE Rückfrage, die alle ungespeicherten auflistet. */
  async function schliesseMehrere(ids) {
    const liste = ids.map(finde).filter(Boolean);
    if (!liste.length) return;
    const schmutzig = liste.filter((t) => istSchmutzig(t) && textVon(t).trim());
    if (schmutzig.length) {
      const namen = schmutzig.map((t) => "• " + t.name).join("\n");
      const ok = await frage(
        liste.length === 1 ? "Tab schließen?" : liste.length + " Tabs schließen?",
        (schmutzig.length === 1 ? "Dieser Tab hat ungespeicherte Änderungen:" : "Diese Tabs haben ungespeicherte Änderungen:") + "\n" + namen +
          "\nDie letzten " + MAX_GESCHLOSSEN + " geschlossenen Tabs lassen sich wiederherstellen.",
        liste.length === 1 ? "Schließen" : "Alle " + liste.length + " schließen");
      if (!ok) return;
    }
    entferne(liste.map((t) => t.id));
    if (liste.length > 1 && toast) toast(liste.length + " Tabs geschlossen – Alt+Shift+T holt sie zurück.", "info");
  }

  function schliesseAlle() { return schliesseMehrere(tabs.filter((t) => !t.angeheftet).map((t) => t.id)); }

  function wiederherstellen(i = 0) {
    const g = geschlossen[i];
    if (!g) { toast && toast("Kein geschlossener Tab zum Wiederherstellen.", "info"); return; }
    geschlossen.splice(i, 1);
    const schluessel = g.schluessel && !tabs.some((t) => t.schluessel === g.schluessel) ? g.schluessel : null;
    const t = neuerTab({ name: eindeutigerName(g.name), text: g.text, basis: g.basis ?? g.text, schluessel, angeheftet: !!g.angeheftet });
    einfuegen(t);
  }

  function herunterladen(id) {
    const t = finde(id || aktivId);
    if (!t) return;
    const name = /\.pizza$/i.test(t.name) ? t.name : t.name + ".pizza";
    const blob = new Blob([textVon(t)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  // ---------- Datei öffnen (Dialog oder Drag & Drop) ----------
  let dateiEingabe = null;
  function dateiDialog() {
    if (!dateiEingabe) {
      dateiEingabe = document.createElement("input");
      dateiEingabe.type = "file";
      dateiEingabe.accept = ".pizza,.txt,text/plain";
      dateiEingabe.multiple = true;
      dateiEingabe.hidden = true;
      dateiEingabe.dataset.testid = "datei-eingabe";
      dateiEingabe.addEventListener("change", () => { oeffneDateien(dateiEingabe.files); dateiEingabe.value = ""; });
      document.body.appendChild(dateiEingabe);
    }
    dateiEingabe.click();
  }
  async function oeffneDateien(dateien) {
    let n = 0;
    for (const f of Array.from(dateien || [])) {
      if (f.size > 2_000_000) { toast && toast("„" + f.name + "“ ist zu groß (max. 2 MB).", "fehler"); continue; }
      if (!/\.(pizza|txt)$/i.test(f.name) && f.type && !f.type.startsWith("text/")) { toast && toast("„" + f.name + "“ ist keine .pizza-Datei.", "fehler"); continue; }
      try {
        const text = await f.text();
        oeffne(text, f.name, "datei:" + f.name + ":" + f.size + ":" + (f.lastModified || 0));
        n++;
      } catch (e) { toast && toast("„" + f.name + "“ konnte nicht gelesen werden.", "fehler"); }
    }
    if (n && toast) toast(n === 1 ? "Datei in neuem Tab geöffnet." : n + " Dateien in neuen Tabs geöffnet.", "ok");
  }

  function umbenennen(id) {
    const t = finde(id);
    const w = leiste.querySelector(`.etab[data-id="${id}"]`);
    if (!t || !w) return;
    const knopf = w.querySelector(".etab-knopf");
    const eingabe = el("input", "etab-eingabe");
    eingabe.dataset.testid = "editor-tab-umbenennen";
    eingabe.value = t.name;
    eingabe.setAttribute("aria-label", "Neuer Name für " + t.name);
    eingabe.spellcheck = false;
    eingabe.size = Math.max(8, t.name.length);
    knopf.replaceWith(eingabe);
    w.draggable = false;
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
      fokusTab(id);
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
    naechster,
    schliesse,
    schliesseAktiven: () => aktivId && (finde(aktivId).angeheftet ? toast && toast("Angeheftete Tabs zuerst lösen.", "info") : schliesse(aktivId)),
    schliesseMehrere,
    schliesseAndere: () => schliesseMehrere(tabs.filter((t) => t.id !== aktivId && !t.angeheftet).map((t) => t.id)),
    schliesseRechts: () => { const i = tabs.findIndex((t) => t.id === aktivId); return schliesseMehrere(tabs.slice(i + 1).filter((t) => !t.angeheftet).map((t) => t.id)); },
    schliesseGespeicherte: () => schliesseMehrere(tabs.filter((t) => !t.angeheftet && !istSchmutzig(t)).map((t) => t.id)),
    schliesseAlle,
    wiederherstellen,
    dupliziere: () => dupliziere(aktivId),
    anheften: () => anheften(aktivId),
    umbenennen: () => umbenennen(aktivId),
    herunterladen: () => herunterladen(aktivId),
    dateiDialog,
    oeffneDateien,
    kontextMenue: () => { const w = leiste.querySelector(".etab.aktiv"); kontextMenue(aktivId, { anker: w || leiste }); },
    alleTabsMenue: () => alleTabsMenue(leiste.querySelector('[data-testid="editor-tabs-alle"]') || leiste),
    get liste() { return tabs.map((t) => ({ id: t.id, name: t.name, aktiv: t.id === aktivId, angeheftet: t.angeheftet, schmutzig: istSchmutzig(t) })); },
    get geschlossen() { return geschlossen.map((g) => g.name); },
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
