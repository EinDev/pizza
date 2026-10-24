// Editor-Tabs = geöffnete Dateien des AKTIVEN Projekts (PROJEKTE.md §3.1, Nutzerentscheidung F11). Jede Datei hat einen eigenen
// EditorState (Undo-Historie, Cursor, Scroll – nur im Speicher, auch über Projektwechsel hinweg). Inhalte und die Liste der offenen
// Tabs gehören dem Projekt (projekte.js speichert sie). Funktionen wie früher: Kontextmenü, Sammel-Schließen, Wiederherstellen,
// Anheften, Drag & Drop, Mausrad-Scrollen, „Alle Tabs“-Menü mit Suche, Umbenennen (= Datei umbenennen), Herunterladen.
// Der Knopf „+“ legt ein neues Ein-Datei-PROJEKT an (wie früher ein neuer Tab); neue Dateien im Projekt entstehen im Dateibaum.
import { oeffneMenue } from "./menue.js";
import { iconSvg } from "./icons.js";
import { tabTitel, dateiArt, pruefeProjektdatei, PROJEKTDATEI } from "./projekt.js";

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

/** Editor-Art einer Datei. */
export function editorArt(pfad) {
  const a = dateiArt(pfad);
  if (a === "pizza") return "pizza";
  if (/\.json$/i.test(pfad)) return "json";
  return "text";
}

/**
 * @param {{ editor, leiste, projekte, frage, toast, beiWechsel?(pfad), beiNeu?(), beiTeilen?(), beiExe?(), zeigeBinaer?(pfad|null),
 *           beiUmbenennen?(pfad), beiHauptdatei?(pfad) }} o
 */
export function erstelleTabs({ editor, leiste, projekte, frage, toast, beiWechsel, beiNeu, beiTeilen, beiExe, zeigeBinaer }) {
  /** Zustände je Projekt und Datei: "id\npfad" → { state, scroll } */
  const zustaende = new Map();
  const geschlossen = []; // je Fenster: [{ projekt, pfad }]
  let listeEl = null;
  let aktivPfad = null;
  let geladenFuer = null; // Projekt-ID, deren Datei gerade im Editor liegt
  let pjTimer = null;

  const P = () => projekte.aktiv;
  const schluessel = (pfad) => P().id + "\n" + pfad;
  const offen = () => P().offen.slice();
  const angeheftet = (pfad) => P().angeheftet.includes(pfad);
  const istBinaer = (pfad) => projekte.inhalt(pfad) instanceof Uint8Array;
  const istSchmutzig = (pfad) => projekte.istGeaendert(pfad);

  function ordnen(liste) {
    const a = P().angeheftet;
    return [...liste.filter((p) => a.includes(p)), ...liste.filter((p) => !a.includes(p))];
  }
  function merkeTabs() { projekte.setzeTabs({ offen: ordnen(offen()), aktiv: aktivPfad, angeheftet: P().angeheftet }); }

  function zustandFuer(pfad) {
    const k = schluessel(pfad);
    let z = zustaende.get(k);
    const inhalt = projekte.inhalt(pfad);
    if (!z || z.state.doc.toString() !== inhalt) {
      const art = editorArt(pfad);
      z = { state: editor.neuerZustand(typeof inhalt === "string" ? inhalt : "", { art, pruefe: pfad === PROJEKTDATEI ? pruefeProjektdatei : null }), scroll: z ? z.scroll : 0 };
      zustaende.set(k, z);
    }
    return z;
  }

  function sichereAktiven() {
    if (!aktivPfad || !geladenFuer || istBinaerAktiv) return;
    const k = geladenFuer + "\n" + aktivPfad;
    zustaende.set(k, { state: editor.zustand(), scroll: editor.view.scrollDOM.scrollTop });
  }

  let istBinaerAktiv = false;
  /** Datei in den Editor (bzw. die Bildvorschau) laden. */
  function lade(pfad) {
    aktivPfad = pfad;
    geladenFuer = P().id;
    if (istBinaer(pfad)) {
      istBinaerAktiv = true;
      zeigeBinaer && zeigeBinaer(pfad);
    } else {
      istBinaerAktiv = false;
      zeigeBinaer && zeigeBinaer(null);
      const z = zustandFuer(pfad);
      editor.setzeZustand(z.state);
      const s = z.scroll || 0;
      requestAnimationFrame(() => { editor.view.scrollDOM.scrollTop = s; });
    }
  }

  // ---------- Darstellung ----------
  function zeichne() {
    const altScroll = listeEl ? listeEl.scrollLeft : 0;
    leiste.textContent = "";
    listeEl = el("div", "etabs-liste");
    listeEl.setAttribute("role", "tablist");
    listeEl.setAttribute("aria-label", "Geöffnete Dateien von " + P().name);
    const titel = tabTitel(offen());
    for (const pfad of ordnen(offen())) listeEl.appendChild(tabKnoten(pfad, titel[pfad]));
    listeEl.scrollLeft = altScroll;
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
    plus.title = "Neues Projekt (Strg+Alt+N)";
    plus.setAttribute("aria-label", "Neues leeres Projekt");
    plus.dataset.testid = "editor-tab-neu";
    plus.innerHTML = SVG.plus;
    plus.addEventListener("click", () => beiNeu && beiNeu());
    knoepfe.appendChild(plus);

    const alle = el("button", "etab-aktion");
    alle.type = "button";
    alle.title = "Alle Dateien & zuletzt geschlossene";
    alle.setAttribute("aria-label", "Alle Tabs anzeigen");
    alle.setAttribute("aria-haspopup", "menu");
    alle.dataset.testid = "editor-tabs-alle";
    const n = offen().length;
    alle.innerHTML = SVG.liste + (n > 1 ? `<span class="etab-anzahl">${n}</span>` : "");
    alle.addEventListener("click", () => alleTabsMenue(alle));
    knoepfe.appendChild(alle);

    const mehr = el("button", "etab-aktion");
    mehr.type = "button";
    mehr.title = "Tab-Aktionen";
    mehr.setAttribute("aria-label", "Aktionen für den aktiven Tab");
    mehr.setAttribute("aria-haspopup", "menu");
    mehr.dataset.testid = "editor-tab-menue";
    mehr.innerHTML = SVG.mehr;
    mehr.addEventListener("click", () => kontextMenue(aktivPfad, { anker: mehr }));
    knoepfe.appendChild(mehr);
    leiste.appendChild(knoepfe);

    const a = listeEl.querySelector(".etab.aktiv");
    if (a) {
      const l = a.offsetLeft, r = l + a.offsetWidth;
      if (l < listeEl.scrollLeft) listeEl.scrollLeft = l - 8;
      else if (r > listeEl.scrollLeft + listeEl.clientWidth) listeEl.scrollLeft = r - listeEl.clientWidth + 8;
    }
  }

  let ziehPfad = null;
  function tabKnoten(pfad, titel) {
    const istAktiv = pfad === aktivPfad;
    const haupt = pfad === P().hauptdatei && projekte.pfade().length > 1;
    const pin = angeheftet(pfad);
    const wrap = el("div", "etab" + (istAktiv ? " aktiv" : "") + (istSchmutzig(pfad) ? " schmutzig" : "") + (pin ? " angeheftet" : "") + (haupt ? " haupt" : ""));
    wrap.dataset.id = pfad;
    wrap.dataset.pfad = pfad;
    wrap.dataset.testid = "editor-tab";
    if (istAktiv) wrap.dataset.aktiv = "true";
    if (pin) wrap.dataset.angeheftet = "true";
    if (haupt) wrap.dataset.haupt = "true";
    wrap.draggable = true;

    const knopf = el("button", "etab-knopf");
    knopf.type = "button";
    knopf.setAttribute("role", "tab");
    knopf.setAttribute("aria-selected", String(istAktiv));
    knopf.setAttribute("aria-controls", "editor");
    knopf.tabIndex = istAktiv ? 0 : -1;
    knopf.title = pfad + (haupt ? " (Hauptdatei)" : "") + (pin ? " (angeheftet)" : "") + " – Doppelklick: umbenennen · Rechtsklick: Menü";
    if (pin) { const p = el("span", "etab-pin"); p.innerHTML = SVG.pin; knopf.appendChild(p); }
    if (haupt) { const s = el("span", "etab-haupt", "★"); s.setAttribute("aria-label", "Hauptdatei"); knopf.appendChild(s); }
    const nameEl = el("span", "etab-name", titel);
    nameEl.dataset.testid = "editor-tab-name";
    knopf.appendChild(nameEl);
    knopf.dataset.testid = "editor-tab-knopf";
    knopf.addEventListener("click", () => wechsle(pfad));
    knopf.addEventListener("dblclick", () => umbenennen(pfad));
    wrap.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); schliesse(pfad); } });
    wrap.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
    wrap.addEventListener("contextmenu", (e) => { e.preventDefault(); kontextMenue(pfad, { x: e.clientX, y: e.clientY }); });
    knopf.addEventListener("keydown", (e) => {
      const liste = ordnen(offen());
      const i = liste.indexOf(pfad);
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % liste.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + liste.length) % liste.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = liste.length - 1;
      else if (e.key === "F2") { e.preventDefault(); umbenennen(pfad); return; }
      else if (e.key === "Delete") { e.preventDefault(); schliesse(pfad); return; }
      else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) { e.preventDefault(); kontextMenue(pfad, { anker: wrap }); return; }
      if (j != null) {
        e.preventDefault();
        if (e.ctrlKey && e.shiftKey) { verschiebe(pfad, liste[j], j > i); fokusTab(pfad); return; }
        wechsle(liste[j], { fokusEditor: false });
        fokusTab(liste[j]);
      }
    });
    wrap.appendChild(knopf);

    if (!pin) {
      const zu = el("button", "etab-zu");
      zu.type = "button";
      zu.title = "Tab schließen (Alt+W) – die Datei bleibt im Projekt";
      zu.tabIndex = -1;
      zu.setAttribute("aria-label", titel + " schließen");
      zu.dataset.testid = "editor-tab-schliessen";
      zu.innerHTML = '<span class="etab-punkt" aria-hidden="true"></span>' + SVG.zu;
      zu.addEventListener("click", (e) => { e.stopPropagation(); schliesse(pfad); });
      wrap.appendChild(zu);
    } else {
      const p = el("span", "etab-punkt etab-punkt-pin");
      p.setAttribute("aria-hidden", "true");
      wrap.appendChild(p);
    }

    wrap.addEventListener("dragstart", (e) => {
      ziehPfad = pfad;
      wrap.classList.add("zieht");
      try { e.dataTransfer.setData("application/x-pizza-tab", pfad); e.dataTransfer.effectAllowed = "move"; } catch (x) { /* egal */ }
    });
    wrap.addEventListener("dragend", () => { ziehPfad = null; wrap.classList.remove("zieht"); leiste.querySelectorAll(".drop-links,.drop-rechts").forEach((x) => x.classList.remove("drop-links", "drop-rechts")); });
    wrap.addEventListener("dragover", (e) => {
      if (!ziehPfad || ziehPfad === pfad) return;
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      const rechts = e.clientX > r.left + r.width / 2;
      wrap.classList.toggle("drop-rechts", rechts);
      wrap.classList.toggle("drop-links", !rechts);
    });
    wrap.addEventListener("dragleave", () => wrap.classList.remove("drop-links", "drop-rechts"));
    wrap.addEventListener("drop", (e) => {
      if (!ziehPfad) return;
      e.preventDefault();
      const rechts = wrap.classList.contains("drop-rechts");
      wrap.classList.remove("drop-links", "drop-rechts");
      verschiebe(ziehPfad, pfad, rechts);
    });
    return wrap;
  }

  function fokusTab(pfad) {
    const k = [...leiste.querySelectorAll(".etab")].find((w) => w.dataset.pfad === pfad);
    if (k) k.querySelector(".etab-knopf").focus();
  }

  function aktualisiereMarker() {
    for (const w of leiste.querySelectorAll(".etab")) w.classList.toggle("schmutzig", istSchmutzig(w.dataset.pfad));
  }

  // ---------- Menüs ----------
  function kontextMenue(pfad, pos) {
    if (!pfad || !projekte.hat(pfad)) return;
    const liste = ordnen(offen());
    const i = liste.indexOf(pfad);
    const rechts = liste.slice(i + 1).filter((x) => !angeheftet(x));
    const andere = liste.filter((x) => x !== pfad && !angeheftet(x));
    const pin = angeheftet(pfad);
    const titel = pfad.split("/").pop();
    oeffneMenue({
      ...pos,
      label: "Tab-Menü für " + pfad,
      testid: "tab-kontextmenue",
      eintraege: [
        { text: "Schließen", icon: "x", kuerzel: "Alt+W", aktion: () => schliesse(pfad), deaktiviert: pin || liste.length < 2, grund: pin ? "Angeheftete Tabs zuerst lösen." : "Die letzte offene Datei bleibt offen.", testid: "tab-menue-schliessen" },
        { text: "Andere schließen", icon: "closeOthers", aktion: () => schliesseMehrere(andere), deaktiviert: !andere.length, grund: "Keine anderen (nicht angehefteten) Tabs offen.", testid: "tab-menue-andere" },
        { text: "Rechts davon schließen", icon: "closeRight", aktion: () => schliesseMehrere(rechts), deaktiviert: !rechts.length, grund: "Rechts von diesem Tab ist nichts.", testid: "tab-menue-rechts" },
        "-",
        { text: pin ? "Lösen" : "Anheften", icon: pin ? "pinOff" : "pin", aktion: () => anheften(pfad), testid: "tab-menue-anheften" },
        { text: "Umbenennen", icon: "pencil", kuerzel: "F2", aktion: () => { wechsle(pfad, { fokusEditor: false }); umbenennen(pfad); }, testid: "tab-menue-umbenennen" },
        { text: "Als Hauptdatei", icon: "star", aktion: () => { const f = projekte.setzeHauptdatei(pfad); if (f) toast(f, "fehler"); else toast("„" + pfad + "“ ist jetzt die Hauptdatei.", "ok"); }, deaktiviert: dateiArt(pfad) !== "pizza" || P().hauptdatei === pfad, grund: P().hauptdatei === pfad ? "Ist schon die Hauptdatei." : "Nur .pizza-Dateien können Hauptdatei sein.", testid: "tab-menue-hauptdatei" },
        "-",
        { text: "„" + titel + "“ herunterladen", icon: "download", aktion: () => herunterladen(pfad), testid: "tab-menue-download" },
        { text: "Als Programm herunterladen …", icon: "monitor", aktion: () => beiExe && beiExe(), testid: "tab-menue-exe" },
        { text: "Teilen …", icon: "share", aktion: () => beiTeilen && beiTeilen(), testid: "tab-menue-teilen" },
        "-",
        { text: "Geschlossenen Tab wiederherstellen", icon: "restore", kuerzel: "Alt+Shift+T", aktion: () => wiederherstellen(0), deaktiviert: !geschlosseneHier().length, grund: "Noch kein Tab geschlossen.", testid: "tab-menue-wiederherstellen" },
      ],
    });
  }

  const geschlosseneHier = () => geschlossen.filter((g) => g.projekt === P().id && projekte.hat(g.pfad) && !offen().includes(g.pfad));

  function alleTabsMenue(anker) {
    const kopf = el("div", "menue-suche");
    const eingabe = el("input");
    eingabe.type = "search";
    eingabe.placeholder = "Dateien durchsuchen …";
    eingabe.setAttribute("aria-label", "Dateien durchsuchen");
    eingabe.dataset.testid = "tabs-suche";
    kopf.appendChild(eingabe);
    const eintraege = (q) => {
      q = q.trim().toLowerCase();
      const passt = (p) => !q || p.toLowerCase().includes(q);
      const o = ordnen(offen());
      const offenListe = o.filter(passt);
      const weitere = projekte.pfade().filter((p) => !o.includes(p) && passt(p));
      const zu = geschlosseneHier().map((g, i) => ({ g, i })).filter(({ g }) => passt(g.pfad));
      const e = [{ ueberschrift: "Geöffnet (" + o.length + ")" }];
      if (!offenListe.length) e.push({ leer: "Kein Tab passt." });
      for (const p of offenListe) e.push({ text: p, icon: angeheftet(p) ? "pin" : istSchmutzig(p) ? "dot" : "file", aktiv: p === aktivPfad, aktion: () => wechsle(p), testid: "tabs-liste-eintrag" });
      if (weitere.length) {
        e.push("-", { ueberschrift: "Weitere Dateien im Projekt" });
        for (const p of weitere) e.push({ text: p, icon: "file", aktion: () => oeffneDatei(p), testid: "tabs-datei-eintrag" });
      }
      e.push("-", { ueberschrift: "Zuletzt geschlossen" });
      if (!zu.length) e.push({ leer: geschlosseneHier().length ? "Kein geschlossener Tab passt." : "Noch nichts geschlossen." });
      for (const { g, i } of zu) e.push({ text: g.pfad, icon: "restore", zusatz: i === 0 ? "Alt+Shift+T" : "", aktion: () => wiederherstellen(i), testid: "tabs-geschlossen-eintrag" });
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
  function wechsle(pfad, { fokusEditor = true } = {}) {
    if (!projekte.hat(pfad)) return;
    if (pfad !== aktivPfad || geladenFuer !== P().id) {
      sichereAktiven();
      if (!offen().includes(pfad)) projekte.setzeTabs({ offen: [...offen(), pfad] });
      lade(pfad);
      merkeTabs();
      zeichne();
      beiWechsel && beiWechsel(pfad);
    }
    if (fokusEditor && !istBinaerAktiv) editor.view.focus();
  }

  /** Datei als Tab öffnen (neben dem aktiven) bzw. dorthin wechseln. */
  function oeffneDatei(pfad, opt) {
    if (!projekte.hat(pfad)) return false;
    if (!offen().includes(pfad)) {
      const liste = ordnen(offen());
      const i = liste.indexOf(aktivPfad);
      liste.splice(i < 0 ? liste.length : i + 1, 0, pfad);
      projekte.setzeTabs({ offen: liste });
    }
    wechsle(pfad, opt);
    return true;
  }

  function naechster(delta) {
    const liste = ordnen(offen());
    if (liste.length < 2) return;
    const i = liste.indexOf(aktivPfad);
    wechsle(liste[(i + delta + liste.length) % liste.length]);
  }

  function anheften(pfad) {
    const a = P().angeheftet;
    const neu = a.includes(pfad) ? a.filter((x) => x !== pfad) : [...a, pfad];
    projekte.setzeTabs({ angeheftet: neu, offen: ordnen(offen()) });
    projekte.setzeTabs({ offen: ordnen(offen()) });
    zeichne();
    fokusTab(pfad);
  }

  function verschiebe(pfad, ziel, dahinter) {
    if (pfad === ziel) return;
    const liste = ordnen(offen()).filter((p) => p !== pfad);
    let pos = liste.indexOf(ziel) + (dahinter ? 1 : 0);
    const n = liste.filter((x) => angeheftet(x)).length;
    pos = angeheftet(pfad) ? Math.min(pos, n) : Math.max(pos, n);
    liste.splice(pos, 0, pfad);
    projekte.setzeTabs({ offen: liste });
    zeichne();
  }

  function entferne(pfade) {
    const weg = new Set(pfade);
    const liste = ordnen(offen());
    const rest = liste.filter((p) => !weg.has(p));
    if (!rest.length) return;
    for (const p of liste) if (weg.has(p)) { geschlossen.unshift({ projekt: P().id, pfad: p }); }
    geschlossen.splice(MAX_GESCHLOSSEN * 4);
    const altIndex = liste.indexOf(aktivPfad);
    projekte.setzeTabs({ offen: rest });
    if (weg.has(aktivPfad)) {
      sichereAktiven();
      aktivPfad = null;
      wechsle(rest[Math.min(Math.max(0, altIndex), rest.length - 1)]);
    } else { merkeTabs(); zeichne(); }
  }

  function schliesse(pfad) {
    if (angeheftet(pfad)) { toast && toast("Angeheftete Tabs zuerst lösen.", "info"); return; }
    if (offen().length < 2) { toast && toast("Die letzte offene Datei bleibt offen.", "info"); return; }
    entferne([pfad]);
  }
  /** Mehrere Tabs schließen – ohne Rückfrage: die Dateien bleiben im Projekt. */
  function schliesseMehrere(pfade) {
    const liste = pfade.filter((p) => offen().includes(p) && !angeheftet(p));
    if (!liste.length) return;
    const bleibt = offen().filter((p) => !liste.includes(p));
    if (!bleibt.length) liste.splice(liste.indexOf(aktivPfad) >= 0 ? liste.indexOf(aktivPfad) : 0, 1);
    entferne(liste);
    if (liste.length > 1 && toast) toast(liste.length + " Tabs geschlossen – Alt+Shift+T holt sie zurück.", "info");
  }

  function wiederherstellen(i = 0) {
    const g = geschlosseneHier()[i];
    if (!g) { toast && toast("Kein geschlossener Tab zum Wiederherstellen.", "info"); return; }
    geschlossen.splice(geschlossen.indexOf(g), 1);
    oeffneDatei(g.pfad);
  }

  function herunterladen(pfad = aktivPfad) {
    if (!projekte.hat(pfad)) return;
    const inhalt = pfad === aktivPfad && !istBinaerAktiv ? editor.text() : projekte.inhalt(pfad);
    const blob = new Blob([inhalt], { type: inhalt instanceof Uint8Array ? "application/octet-stream" : "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = pfad.split("/").pop();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /** Tab-Titel bearbeiten = Datei umbenennen (Pfadregeln live geprüft). */
  function umbenennen(pfad = aktivPfad) {
    const w = [...leiste.querySelectorAll(".etab")].find((x) => x.dataset.pfad === pfad);
    if (!w || !projekte.hat(pfad)) return;
    const knopf = w.querySelector(".etab-knopf");
    const eingabe = el("input", "etab-eingabe");
    eingabe.dataset.testid = "editor-tab-umbenennen";
    eingabe.value = pfad;
    eingabe.setAttribute("aria-label", "Neuer Pfad für " + pfad);
    eingabe.spellcheck = false;
    eingabe.size = Math.max(8, pfad.length);
    knopf.replaceWith(eingabe);
    w.draggable = false;
    eingabe.focus();
    const punkt = pfad.lastIndexOf(".");
    const start = pfad.lastIndexOf("/") + 1;
    eingabe.setSelectionRange(start, punkt > start ? punkt : pfad.length);
    let fertig = false;
    const ende = (uebernehmen) => {
      if (fertig) return;
      fertig = true;
      let n = eingabe.value.trim();
      if (uebernehmen && n && n !== pfad) {
        // Bequemlichkeit: „Rezept“ → „rezept.pizza“ (Endung ergänzt, Großbuchstaben klein)
        if (!/\.[a-z0-9]+$/i.test(n)) n += "." + pfad.split(".").pop();
        n = n.replace(/[A-Z]/g, (c) => c.toLowerCase());
        const f = projekte.verschiebe(pfad, n);
        if (f) toast && toast(f, "fehler");
        else pfad = n;
      }
      zeichne();
      fokusTab(pfad);
    };
    eingabe.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); ende(true); }
      else if (e.key === "Escape") { e.preventDefault(); ende(false); }
    });
    eingabe.addEventListener("input", () => {
      eingabe.size = Math.max(8, eingabe.value.length);
      eingabe.classList.toggle("ungueltig", !!eingabe.value.trim() && /[^a-zA-Z0-9_.\/-]/.test(eingabe.value));
    });
    eingabe.addEventListener("blur", () => ende(true));
  }

  // ---------- Projekt-Ereignisse ----------
  projekte.an("wechsel", () => { sichereAktiven(); lade(P().aktiv); zeichne(); beiWechsel && beiWechsel(aktivPfad); });
  projekte.an("dateien", (info) => {
    const um = info && info.umbenannt;
    if (um) for (const [alt, neu] of Object.entries(um)) {
      const z = zustaende.get(schluessel(alt));
      if (z) { zustaende.delete(schluessel(alt)); zustaende.set(schluessel(neu), z); }
      for (const g of geschlossen) if (g.projekt === P().id && g.pfad === alt) g.pfad = neu;
    }
    const altPfad = um && um[aktivPfad] ? aktivPfad : null;
    if (altPfad) aktivPfad = um[altPfad];
    if (!projekte.hat(aktivPfad)) { aktivPfad = null; lade(P().aktiv); beiWechsel && beiWechsel(aktivPfad); }
    else if (altPfad && !istBinaerAktiv && (editorArt(altPfad) !== editorArt(aktivPfad) || aktivPfad === PROJEKTDATEI || altPfad === PROJEKTDATEI)) {
      // Dateiart geändert (z. B. .txt → .pizza): neuer Zustand mit passender Sprache, gleicher Inhalt
      const z = editor.neuerZustand(editor.text(), { art: editorArt(aktivPfad), pruefe: aktivPfad === PROJEKTDATEI ? pruefeProjektdatei : null });
      zustaende.set(schluessel(aktivPfad), { state: z, scroll: editor.view.scrollDOM.scrollTop });
      editor.setzeZustand(z);
    }
    zeichne();
  });
  projekte.an("extern", ({ pfad }) => {
    zustaende.delete(schluessel(pfad));
    if (pfad === aktivPfad && !istBinaerAktiv) lade(pfad);
    aktualisiereMarker();
  });

  return {
    /** Erstes Zeichnen nach dem Start. */
    laden() { lade(P().aktiv); zeichne(); },
    get aktivPfad() { return aktivPfad; },
    get binaerAktiv() { return istBinaerAktiv; },
    wechsle,
    oeffneDatei,
    naechster,
    schliesse: (p) => schliesse(p || aktivPfad),
    schliesseAktiven: () => schliesse(aktivPfad),
    schliesseAndere: () => schliesseMehrere(offen().filter((p) => p !== aktivPfad)),
    schliesseRechts: () => { const l = ordnen(offen()); return schliesseMehrere(l.slice(l.indexOf(aktivPfad) + 1)); },
    schliesseAlle: () => schliesseMehrere(offen().filter((p) => p !== aktivPfad)),
    wiederherstellen,
    anheften: () => anheften(aktivPfad),
    umbenennen: () => umbenennen(aktivPfad),
    herunterladen: () => herunterladen(aktivPfad),
    kontextMenue: () => { const w = leiste.querySelector(".etab.aktiv"); kontextMenue(aktivPfad, { anker: w || leiste }); },
    alleTabsMenue: () => alleTabsMenue(leiste.querySelector('[data-testid="editor-tabs-alle"]') || leiste),
    get liste() { return ordnen(offen()).map((p) => ({ pfad: p, name: p, aktiv: p === aktivPfad, angeheftet: angeheftet(p), schmutzig: istSchmutzig(p) })); },
    get geschlossen() { return geschlosseneHier().map((g) => g.pfad); },
    zeichne,
    /** Editor geändert → Inhalt ins Projekt (entprellt gespeichert). */
    beiAenderung(text) {
      if (!aktivPfad || istBinaerAktiv || geladenFuer !== P().id) return;
      projekte.setzeInhalt(aktivPfad, text);
      aktualisiereMarker();
      if (aktivPfad === PROJEKTDATEI) { clearTimeout(pjTimer); pjTimer = setTimeout(() => projekte.projektdateiUebernehmen(), 600); }
    },
    /** Strg+S: aktive Datei als gespeichert markieren. */
    sichern() {
      if (!aktivPfad) return null;
      projekte.sichern(aktivPfad);
      aktualisiereMarker();
      return aktivPfad;
    },
    /** Sprung zu Fehlerort (PROJEKTE §3.1): datei null → Hauptdatei. */
    springe(datei, zeile, spalte) {
      const ziel = datei && projekte.hat(datei) ? datei : P().hauptdatei;
      if (ziel !== aktivPfad || geladenFuer !== P().id) oeffneDatei(ziel, { fokusEditor: false });
      if (!istBinaerAktiv) editor.springeZu(zeile, spalte);
    },
  };
}
