// pizza v3.0 Playground – Einstieg.
import { erstelleEditor } from "./editor.js";
import { erstelleKonsole } from "./konsole.js";
import { erstelleAusfuehrung, workerAuftrag } from "./ausfuehrung.js";
import { erstelleDoku } from "./doku.js";
import { erstelleBeispiele } from "./beispiele.js";
import { codeKodieren, codeDekodieren, codeAusHash } from "./teilen.js";
import { ausInterpreterErgaenzen } from "./woerter.js";
import { erstelleTabs } from "./tabs.js";

const WILLKOMMEN = `// Willkommen im pizza-Playground!
// Strg+Enter (oder „Backen“) schiebt dein Programm in den Ofen.

Pizza p = ((Tomate, Mozzarella, Basilikum));
Bote.sage(("Frisch aus dem Ofen: " + p));
Bote.sage(("Das macht " + p.preis().euro() + "."));

// Ein Ofen mit Zeitbudget: summiert, solange die Zeit reicht.
salami summe = ofen(temperatur: 300, zeit: 90s) {
    salami s = 0;
    für (salami i : [1 .. 10]) {
        s += i;
        zwischenstand((s));
    }
    serviere ((s));
} roh (r) {
    serviere ((r.teilergebnis()));
};
Bote.sage(("Summe aus dem Ofen: " + summe));

Blech<margherita> gäste = ["Luigi", "Mario", "Giulia"];
für (margherita name : gäste) {
    Bote.sage(("Buon appetito, " + name + "!"));
}
`;

// ---------- Hilfen ----------
const $ = (id) => document.getElementById(id);
const speicher = {
  hole(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  setze(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privat/voll */ } },
};
const schmal = window.matchMedia("(max-width: 899.98px)");
const wenigBewegung = window.matchMedia("(prefers-reduced-motion: reduce)");

let toastTimer = null;
function toast(text, art = "info") {
  const t = $("toast");
  t.textContent = text;
  t.dataset.art = art;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add("sichtbar"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("sichtbar");
    setTimeout(() => (t.hidden = true), 250);
  }, 2600);
}

function frage(titel, text, ja = "Ersetzen") {
  const dlg = $("dialog-frage");
  if (typeof dlg.showModal !== "function") return Promise.resolve(window.confirm(text));
  $("dialog-titel").textContent = titel;
  $("dialog-text").textContent = text;
  $("dialog-ja").textContent = ja;
  return new Promise((resolve) => {
    dlg.returnValue = "";
    dlg.addEventListener("close", () => resolve(dlg.returnValue === "ja"), { once: true });
    dlg.showModal();
    $("dialog-ja").focus();
  });
}

function start() {
  const PL = window.PizzaLang || null;
  ausInterpreterErgaenzen(PL);
  if (PL && PL.version) {
    const v = String(PL.version).split(".");
    $("version").textContent = "v" + v[0] + "." + (v[1] || "0");
    $("version").title = "Interpreter " + PL.version;
  }

  // ---------- Editor & Tabs ----------
  let tabs = null;
  const editor = erstelleEditor({
    eltern: $("editor"),
    inhalt: "",
    beiAenderung() { if (tabs) tabs.beiAenderung(); },
  });
  tabs = erstelleTabs({
    editor, leiste: $("editor-tabs"), speicher, frage, willkommen: WILLKOMMEN,
    beiWechsel() { /* Platz für künftige Anzeigen */ },
  });
  tabs.laden();

  function speichern() {
    const t = tabs.sichern();
    if (t) toast("„" + t.name + "“ lokal gespeichert.", "ok");
  }

  // ---------- Konsole & Ausführung ----------
  let laufTabId = null;
  const konsole = erstelleKonsole({
    springe: (z, s) => {
      if (laufTabId && tabs.aktiv() && tabs.aktiv().id !== laufTabId) tabs.wechsle(laufTabId);
      editor.springeZu(z, s);
    },
  });
  const knopfBacken = $("knopf-backen"), knopfAbbr = $("knopf-abbrechen");
  let laufName = "";

  const ausfuehrung = erstelleAusfuehrung({
    beiStart() {
      konsole.leeren(false);
      konsole.setzeLauf({ laeuft: true, name: laufName });
      knopfBacken.hidden = true;
      knopfAbbr.hidden = false;
      document.body.classList.add("laeuft");
      logoBacken(true);
      konsoleOeffnen();
    },
    beiEreignis(ev) { konsole.ereignis(ev); },
    beiEnde(info) {
      konsole.sofortZeichnen();
      knopfBacken.hidden = false;
      knopfAbbr.hidden = true;
      document.body.classList.remove("laeuft");
      logoBacken(false);
      if (info.abgebrochen) {
        konsole.setzeExit("–", { wandMs: info.wandMs, zusatz: "abgebrochen", name: laufName });
        $("exit-badge").className = "exit-badge abgebrochen";
        $("exit-badge").textContent = "abgebrochen";
      } else {
        konsole.setzeExit(info.exitCode, { schritte: info.schritte, zeitMs: info.zeitMs, wandMs: info.wandMs, laufMs: info.laufMs, zusatz: info.zusatz, name: laufName });
      }
      if (document.activeElement === knopfAbbr) knopfBacken.focus();
    },
    beiPanik(text) { zeigeHawaii(text); },
    beiMotor(ev) { konsole.setzeMotor(ev); },
  });

  // ---------- Motor (Wasm / Interpreter) ----------
  const motorWahl = $("motor-wahl");
  const gespeicherterMotor = speicher.hole("pizza.motor");
  motorWahl.value = ["auto", "wasm", "interpreter"].includes(gespeicherterMotor) ? gespeicherterMotor : "auto";
  motorWahl.addEventListener("change", () => {
    speicher.setze("pizza.motor", motorWahl.value);
    toast("Motor: " + motorWahl.options[motorWahl.selectedIndex].text, "info");
  });

  // ---------- .pkarton (WebAssembly) herunterladen ----------
  const knopfPkarton = $("knopf-pkarton");
  workerAuftrag({ typ: "pruefe" }, "faehigkeiten", 20_000).then((f) => {
    if (f && f.wasm) {
      knopfPkarton.hidden = false;
      const opt = motorWahl.querySelector('option[value="auto"]');
      if (opt && f.version) opt.title = "pizzaiolo " + f.version;
    } else {
      const opt = motorWahl.querySelector('option[value="auto"]');
      if (opt) opt.textContent = "Auto";
      motorWahl.title = "WebAssembly-Compiler nicht verfügbar" + (f && f.grund ? ": " + f.grund : "") + " – es läuft der Interpreter.";
    }
  });
  knopfPkarton.addEventListener("click", async () => {
    const t = tabs.aktiv();
    const name = ((t && t.name) || "programm.pizza").replace(/\.pizza$/i, "") + ".pkarton";
    knopfPkarton.disabled = true;
    const r = await workerAuftrag({ typ: "kompiliere", code: editor.text() }, "pkarton", 20_000);
    knopfPkarton.disabled = false;
    if (!r || !r.ok) {
      let grund = (r && r.grund) || "Kompilieren nicht möglich.";
      if (r && r.fehler) grund = "Syntaxfehler" + (r.fehler.zeile ? " in Zeile " + r.fehler.zeile : "") + ": " + r.fehler.text;
      else if (r && Array.isArray(r.nichtUnterstuetzt) && r.nichtUnterstuetzt.length) {
        const n = r.nichtUnterstuetzt[0];
        grund = "Noch nicht als Wasm kompilierbar" + (n.zeile ? " (Zeile " + n.zeile + ")" : "") + ": " + n.grund;
      }
      toast(grund, "fehler");
      return;
    }
    const blob = new Blob([r.daten], { type: "application/wasm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    $("pkarton-text").textContent = "„" + name + "“ wurde heruntergeladen (" + new Intl.NumberFormat("de-DE").format(r.daten.byteLength) + " Bytes" +
      (typeof r.kompilierMs === "number" ? ", in " + (Math.round(r.kompilierMs * 10) / 10).toLocaleString("de-DE") + " ms kompiliert" : "") + ").";
    $("pkarton-cmd-run").textContent = "pizza-host " + name;
    $("pkarton-cmd-exe").textContent = "pizzaofen exe " + name + " -o " + name.replace(/\.pkarton$/, "") + ".exe";
    const dlg = $("dialog-pkarton");
    if (typeof dlg.showModal === "function") dlg.showModal(); else toast("„" + name + "“ heruntergeladen.", "ok");
  });

  const logoBild = $("logo-bild");
  if (logoBild) {
    const marke = logoBild.parentNode;
    const geladen = () => { marke.classList.add("mit-bild"); };
    const fehler = () => {
      if (logoBild.dataset.backen) { logoBild.removeAttribute("data-backen"); logoBild.src = "img/logo.svg"; return; }
      marke.classList.remove("mit-bild");
      logoBild.hidden = true;
    };
    logoBild.addEventListener("load", geladen);
    logoBild.addEventListener("error", fehler);
    if (logoBild.complete) { if (logoBild.naturalWidth > 0) geladen(); else fehler(); }
  }
  function logoBacken(an) {
    if (!logoBild || logoBild.hidden) return;
    if (an) { logoBild.dataset.backen = "1"; logoBild.src = "img/logo-backen.svg"; }
    else if (logoBild.dataset.backen) { logoBild.removeAttribute("data-backen"); logoBild.src = "img/logo.svg"; }
  }

  function backen() {
    if (ausfuehrung.laeuft) return;
    const t = tabs.aktiv();
    laufTabId = t ? t.id : null;
    laufName = t ? t.name : "";
    ausfuehrung.starte(editor.text(), [], motorWahl.value);
  }
  knopfBacken.addEventListener("click", backen);
  knopfAbbr.addEventListener("click", () => ausfuehrung.abbrechen());
  $("konsole-leeren").addEventListener("click", () => {
    konsole.leeren(true);
    $("exit-badge").hidden = true;
    $("lauf-info").textContent = "";
  });

  // ---------- Hawaii ----------
  const hawaii = $("hawaii");
  let fokusVorHawaii = null;
  function zeigeHawaii(text) {
    $("hawaii-banner").textContent = text || "PIZZA-VM KERNEL PANIC";
    fokusVorHawaii = document.activeElement;
    hawaii.hidden = false;
    document.body.classList.add("hawaii-aktiv");
    hawaii.classList.remove("glitch");
    void hawaii.offsetWidth;
    if (!wenigBewegung.matches) hawaii.classList.add("glitch");
    setTimeout(() => $("hawaii-neustart").focus(), 30);
  }
  function hawaiiSchliessen() {
    hawaii.hidden = true;
    document.body.classList.remove("hawaii-aktiv");
    konsole.system("PizzaVM neu gestartet. Der Ofen ist wieder warm – ohne Ananas, bitte.");
    (fokusVorHawaii && fokusVorHawaii.isConnected ? fokusVorHawaii : editor.view.contentDOM).focus();
    if (fokusVorHawaii === knopfAbbr) editor.view.focus();
  }
  $("hawaii-neustart").addEventListener("click", hawaiiSchliessen);
  hawaii.addEventListener("keydown", (e) => {
    if (e.key === "Tab") { e.preventDefault(); $("hawaii-neustart").focus(); }
    if (e.key === "Escape") { e.preventDefault(); hawaiiSchliessen(); }
  });

  // ---------- Konsole: Größe & Einklappen ----------
  const werkbank = document.querySelector(".werkbank");
  const konsoleEl = $("konsole");
  const trennerK = $("trenner-konsole");
  let konsoleHoehe = Number(speicher.hole("pizza.konsoleHoehe")) || 220;
  let konsoleZu = speicher.hole("pizza.konsoleZu") === "1";

  function wendeKonsoleAn() {
    const max = Math.max(120, werkbank.clientHeight - 140);
    konsoleHoehe = Math.min(Math.max(96, konsoleHoehe), max);
    werkbank.style.setProperty("--konsole-hoehe", konsoleHoehe + "px");
    konsoleEl.classList.toggle("zu", konsoleZu);
    werkbank.classList.toggle("konsole-zu", konsoleZu);
    $("konsole-toggle").setAttribute("aria-expanded", String(!konsoleZu));
    trennerK.setAttribute("aria-valuenow", String(Math.round(konsoleHoehe)));
    trennerK.setAttribute("aria-valuemin", "96");
    trennerK.setAttribute("aria-valuemax", String(Math.round(max)));
  }
  function konsoleOeffnen() { if (konsoleZu) { konsoleZu = false; speicher.setze("pizza.konsoleZu", "0"); wendeKonsoleAn(); } }
  $("konsole-toggle").addEventListener("click", () => {
    konsoleZu = !konsoleZu;
    speicher.setze("pizza.konsoleZu", konsoleZu ? "1" : "0");
    wendeKonsoleAn();
  });
  ziehbar(trennerK, "y", {
    start: () => konsoleHoehe,
    bewege: (anfang, delta) => { konsoleZu = false; konsoleHoehe = anfang - delta; wendeKonsoleAn(); },
    ende: () => { speicher.setze("pizza.konsoleHoehe", String(Math.round(konsoleHoehe))); speicher.setze("pizza.konsoleZu", "0"); },
    taste: (richtung) => { konsoleZu = false; konsoleHoehe -= richtung * 24; wendeKonsoleAn(); speicher.setze("pizza.konsoleHoehe", String(Math.round(konsoleHoehe))); },
  });
  wendeKonsoleAn();

  // ---------- Seitenpanel ----------
  const bereich = $("arbeitsbereich");
  const panel = $("panel");
  const trennerP = $("trenner-panel");
  const schleier = $("panel-schleier");
  let panelBreite = Number(speicher.hole("pizza.panelBreite")) || 440;
  let panelOffen = schmal.matches ? false : speicher.hole("pizza.panel") !== "0";
  let fokusVorPanel = null;

  function wendePanelAn() {
    const max = Math.max(300, Math.min(window.innerWidth * 0.7, window.innerWidth - 360));
    panelBreite = Math.min(Math.max(300, panelBreite), max);
    bereich.style.setProperty("--panel-breite", panelBreite + "px");
    bereich.classList.toggle("panel-zu", !panelOffen);
    bereich.classList.toggle("panel-sheet", schmal.matches);
    panel.hidden = false;
    panel.setAttribute("aria-hidden", String(!panelOffen));
    panel.inert = !panelOffen;
    if (schmal.matches) {
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", String(panelOffen));
    } else {
      panel.removeAttribute("role");
      panel.removeAttribute("aria-modal");
    }
    schleier.hidden = !(schmal.matches && panelOffen);
    $("knopf-panel").setAttribute("aria-expanded", String(panelOffen));
    trennerP.setAttribute("aria-valuenow", String(Math.round(panelBreite)));
    trennerP.setAttribute("aria-valuemin", "300");
    trennerP.setAttribute("aria-valuemax", String(Math.round(max)));
    document.body.classList.toggle("sheet-offen", schmal.matches && panelOffen);
  }
  function setzePanel(offen, { fokus = true } = {}) {
    if (offen === panelOffen) return;
    if (offen) fokusVorPanel = document.activeElement;
    panelOffen = offen;
    if (!schmal.matches) speicher.setze("pizza.panel", offen ? "1" : "0");
    wendePanelAn();
    if (offen) {
      aktiverTabGeladen();
      if (fokus && schmal.matches) setTimeout(() => panel.querySelector('[role="tab"][aria-selected="true"]').focus(), 50);
    } else if (fokus && panel.contains(document.activeElement)) {
      (fokusVorPanel && fokusVorPanel.isConnected && !panel.contains(fokusVorPanel) ? fokusVorPanel : editor.view.contentDOM).focus();
    }
  }
  const panelUmschalten = () => setzePanel(!panelOffen);
  $("knopf-panel").addEventListener("click", panelUmschalten);
  $("panel-schliessen").addEventListener("click", () => setzePanel(false));
  schleier.addEventListener("click", () => setzePanel(false));
  schmal.addEventListener("change", () => { if (schmal.matches) panelOffen = false; else panelOffen = speicher.hole("pizza.panel") !== "0"; wendePanelAn(); });
  window.addEventListener("resize", () => { wendePanelAn(); wendeKonsoleAn(); });
  ziehbar(trennerP, "x", {
    start: () => panelBreite,
    bewege: (anfang, delta) => { panelBreite = anfang - delta; wendePanelAn(); },
    ende: () => speicher.setze("pizza.panelBreite", String(Math.round(panelBreite))),
    taste: (richtung) => { panelBreite -= richtung * 32; wendePanelAn(); speicher.setze("pizza.panelBreite", String(Math.round(panelBreite))); },
  });

  // Tabs
  const panelTabs = [...panel.querySelectorAll('[role="tab"]')];
  let aktiverTab = speicher.hole("pizza.tab") === "beispiele" ? "beispiele" : "doku";
  function waehleTab(name, fokus) {
    aktiverTab = name;
    speicher.setze("pizza.tab", name);
    for (const t of panelTabs) {
      const an = t.id === "tab-" + name;
      t.setAttribute("aria-selected", String(an));
      t.tabIndex = an ? 0 : -1;
      $(t.getAttribute("aria-controls")).hidden = !an;
      if (an && fokus) t.focus();
    }
    aktiverTabGeladen();
  }
  panelTabs.forEach((t, i) => {
    t.addEventListener("click", () => waehleTab(t.id.replace("tab-", ""), false));
    t.addEventListener("keydown", (e) => {
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % panelTabs.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + panelTabs.length) % panelTabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = panelTabs.length - 1;
      if (j != null) { e.preventDefault(); waehleTab(panelTabs[j].id.replace("tab-", ""), true); }
    });
  });

  // ---------- Doku & Beispiele (öffnen jeweils in einem eigenen Editor-Tab) ----------
  function oeffneCode(code, titel, schluessel) {
    const name = (titel || "doku").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) + ".pizza";
    const { neu } = tabs.oeffne(code, name, schluessel);
    if (!neu) toast("Bereits geöffnet – zum Tab gewechselt.", "info");
    if (schmal.matches) setzePanel(false, { fokus: false });
    editor.view.focus();
    return true;
  }
  // Lesemodus (großes Popup) & Bild-Lightbox
  const lesemodus = $("doku-lesemodus");
  const lightbox = $("bild-lightbox");
  function zeigeBild(src, alt, unterschrift) {
    $("lightbox-bild").src = src;
    $("lightbox-bild").alt = alt || "";
    $("lightbox-text").textContent = unterschrift || alt || "";
    if (typeof lightbox.showModal === "function") lightbox.showModal(); else window.open(src, "_blank", "noopener");
  }
  $("lightbox-zu").addEventListener("click", () => lightbox.close());
  lightbox.addEventListener("click", (e) => { if (e.target === lightbox || e.target.tagName === "FIGURE") lightbox.close(); });

  const doku = erstelleDoku({
    oeffneCode,
    backeCode: (code, titel, schluessel) => { oeffneCode(code, titel, schluessel); backen(); },
    zeigeBild,
    vorAktion: () => { if (lesemodus.open) lesemodus.close(); },
  });
  const dokuPanel = doku.ansicht($("doku-panel"), "panel");
  let dokuModal = null;
  function lesemodusOeffnen() {
    if (typeof lesemodus.showModal !== "function") return;
    if (!dokuModal) dokuModal = doku.ansicht($("doku-modal"), "modal");
    lesemodus.showModal();
    requestAnimationFrame(() => dokuModal.zeigeGemerkt());
    dokuModal.artikel.focus({ preventScroll: true });
  }
  $("knopf-lesemodus").addEventListener("click", lesemodusOeffnen);
  $("pkarton-doku").addEventListener("click", () => {
    $("dialog-pkarton").close();
    lesemodusOeffnen();
    if (dokuModal) { dokuModal.suche.value = "pkarton"; dokuModal.suche.dispatchEvent(new Event("input")); }
  });
  $("lesemodus-zu").addEventListener("click", () => lesemodus.close());
  lesemodus.addEventListener("click", (e) => { if (e.target === lesemodus) lesemodus.close(); });
  lesemodus.addEventListener("close", () => { if (panelOffen && aktiverTab === "doku") dokuPanel.zeigeGemerkt(); });
  const beispiele = erstelleBeispiele({
    ladeCode(code, name, fehler, schluessel) {
      if (fehler) { toast(fehler, "fehler"); return; }
      const { neu } = tabs.oeffne(code, name, schluessel);
      toast(neu ? "„" + name + "“ in neuem Tab geöffnet. Strg+Enter zum Backen." : "„" + name + "“ ist schon offen – zum Tab gewechselt.", "ok");
      if (schmal.matches) setzePanel(false, { fokus: false });
      editor.view.focus();
    },
  });
  let dokuPositioniert = false;
  function aktiverTabGeladen() {
    $("knopf-lesemodus").hidden = aktiverTab !== "doku";
    if (panelOffen && aktiverTab === "beispiele") beispiele.laden();
    if (panelOffen && aktiverTab === "doku" && !dokuPositioniert) {
      dokuPositioniert = true;
      requestAnimationFrame(() => dokuPanel.zeigeGemerkt());
    }
  }
  waehleTab(aktiverTab, false);
  wendePanelAn();

  // ---------- Thema ----------
  const themaKnopf = $("knopf-thema");
  function setzeThema(t, merken) {
    document.documentElement.dataset.theme = t;
    if (merken) speicher.setze("pizza.thema", t);
    editor.setzeThema(t === "dark");
    themaKnopf.setAttribute("aria-label", t === "dark" ? "Helles Thema einschalten" : "Dunkles Thema einschalten");
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", t === "dark" ? "#16171a" : "#fbf7f0"));
  }
  setzeThema(document.documentElement.dataset.theme === "dark" ? "dark" : "light", false);
  themaKnopf.addEventListener("click", () => setzeThema(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    const gemerkt = speicher.hole("pizza.thema");
    if (gemerkt !== "light" && gemerkt !== "dark") setzeThema(e.matches ? "dark" : "light", false);
  });

  // ---------- Teilen: Hastebin (mit Warnung) oder Link ohne Server ----------
  const teilenDlg = $("dialog-teilen");
  let teilenCode = "", teilenName = "";
  function teilenSchritt(name) {
    teilenDlg.querySelectorAll(".teilen-schritt").forEach((s) => { s.hidden = s.dataset.schritt !== name; });
  }
  async function kopiere(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
  }
  async function zeigeLink(url, text) {
    $("teilen-url").value = url;
    $("teilen-fertig-text").textContent = text;
    teilenSchritt("fertig");
    const ok = await kopiere(url);
    $("teilen-kopieren").textContent = ok ? "Kopiert ✓" : "Kopieren";
    $("teilen-url").focus();
    $("teilen-url").select();
  }
  async function lokalerLink() {
    const wert = await codeKodieren(teilenCode);
    const url = location.href.split("#")[0] + "#code=" + wert;
    try { history.replaceState(null, "", "#code=" + wert); } catch (e) { /* egal */ }
    letzterHash = location.hash;
    let text = "Nichts wurde gesendet – der Code steckt komprimiert im Link selbst.";
    if (url.length > 8000) text += " Achtung: Der Link ist sehr lang (" + url.length + " Zeichen) und funktioniert evtl. nicht überall.";
    await zeigeLink(url, text);
  }
  async function anHastebin() {
    teilenSchritt("laeuft");
    let fehler = null;
    try {
      const r = await fetch("api/teilen", { method: "POST", headers: { "Content-Type": "text/plain; charset=utf-8" }, body: teilenCode });
      let daten = null;
      try { daten = await r.json(); } catch (e) { daten = null; }
      if (r.ok && daten && typeof daten.key === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(daten.key)) {
        const url = location.href.split("#")[0] + "#h=" + daten.key;
        try { history.replaceState(null, "", "#h=" + daten.key); } catch (e) { /* egal */ }
        letzterHash = location.hash;
        await zeigeLink(url, "„" + teilenName + "“ liegt jetzt auf hastebin.com. Jeder mit diesem Link kann den Code lesen.");
        return;
      }
      if (r.status === 503) fehler = "Teilen über Hastebin ist auf diesem Server gerade nicht eingerichtet" + (daten && daten.fehler ? " (" + daten.fehler + ")" : "") + ".";
      else if (r.status === 429) fehler = "Zu viele Anfragen – Hastebin bittet um eine kurze Pause. Versuch es gleich noch einmal.";
      else if (r.status === 413) fehler = "Der Code ist zu groß für Hastebin.";
      else fehler = "Hastebin hat nicht wie erwartet geantwortet (HTTP " + r.status + ")" + (daten && daten.fehler ? ": " + daten.fehler : "") + ".";
    } catch (e) {
      fehler = "Keine Verbindung zu Hastebin – bist du offline?";
    }
    $("teilen-fehlertext").textContent = fehler + " Du kannst stattdessen einen Link ohne Server erzeugen – dabei wird nichts gesendet.";
    teilenSchritt("fehler");
    $("teilen-fehler-lokal").focus();
  }
  $("knopf-teilen").addEventListener("click", () => {
    const t = tabs.aktiv();
    teilenCode = editor.text();
    teilenName = (t && t.name) || "unbenannt.pizza";
    $("teilen-tabname").textContent = "„" + teilenName + "“";
    teilenSchritt("frage");
    if (typeof teilenDlg.showModal !== "function") { teilenDlg.setAttribute("open", ""); return; }
    teilenDlg.showModal();
    $("teilen-abbrechen").focus(); // Senden ist bewusst NICHT vorausgewählt
  });
  $("teilen-senden").addEventListener("click", anHastebin);
  $("teilen-lokal").addEventListener("click", lokalerLink);
  $("teilen-fehler-lokal").addEventListener("click", lokalerLink);
  $("teilen-abbrechen").addEventListener("click", () => teilenDlg.close());
  $("teilen-schliessen").addEventListener("click", () => teilenDlg.close());
  $("teilen-fehler-schliessen").addEventListener("click", () => teilenDlg.close());
  $("teilen-kopieren").addEventListener("click", async () => {
    const ok = await kopiere($("teilen-url").value);
    if (!ok) { $("teilen-url").select(); }
    $("teilen-kopieren").textContent = ok ? "Kopiert ✓" : "Bitte manuell kopieren";
  });

  let letzterHash = location.hash;
  async function hashLaden() {
    const h = /(?:^#|&)h=([A-Za-z0-9_-]{1,64})(?:&|$)/.exec(location.hash || "");
    if (h) {
      const key = h[1];
      try {
        const r = await fetch("api/teilen/" + encodeURIComponent(key), { headers: { Accept: "text/plain" } });
        if (r.status === 404) { toast("Diesen geteilten Code gibt es nicht (mehr) auf Hastebin.", "fehler"); return false; }
        if (r.status === 503) { toast("Hastebin ist auf diesem Server nicht eingerichtet – der Code kann nicht geladen werden.", "fehler"); return false; }
        if (!r.ok) { toast("Geteilter Code konnte nicht geladen werden (HTTP " + r.status + ").", "fehler"); return false; }
        const code = await r.text();
        tabs.oeffne(code, "Geteilt " + key + ".pizza", "hastebin:" + key);
        return true;
      } catch (e) {
        toast("Geteilter Code konnte nicht geladen werden – keine Verbindung.", "fehler");
        return false;
      }
    }
    const wert = codeAusHash(location.hash);
    if (!wert) return false;
    const code = await codeDekodieren(wert);
    if (code == null) { toast("Der geteilte Link ist beschädigt – kein Code gefunden.", "fehler"); return false; }
    // Geteilter Code öffnet als eigener Tab – vorhandene Tabs bleiben unberührt.
    tabs.oeffne(code, "geteilt.pizza", "hash:" + wert.slice(0, 200));
    return true;
  }
  window.addEventListener("hashchange", () => {
    if (location.hash === letzterHash) return;
    letzterHash = location.hash;
    hashLaden().then((ok) => { if (ok) toast("Geteilter Code in neuem Tab geöffnet.", "ok"); });
  });
  hashLaden().then((ok) => { if (ok) toast("Geteilter Code in neuem Tab geöffnet.", "ok"); });

  // ---------- Tastenkürzel (Capture: vor CodeMirror) ----------
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!hawaii.hidden) return;
    if (mod && e.key === "Enter") { e.preventDefault(); e.stopPropagation(); backen(); return; }
    if (mod && !e.shiftKey && !e.altKey && (e.key === "s" || e.key === "S")) { e.preventDefault(); e.stopPropagation(); speichern(); return; }
    if (mod && !e.shiftKey && !e.altKey && (e.key === "b" || e.key === "B")) { e.preventDefault(); e.stopPropagation(); panelUmschalten(); return; }
    if (e.key === "Escape") {
      if (document.querySelector("dialog[open]")) return;
      if (ausfuehrung.laeuft) { e.preventDefault(); ausfuehrung.abbrechen(); return; }
      if (schmal.matches && panelOffen) { e.preventDefault(); setzePanel(false); }
    }
  }, true);

  // Wenn der Interpreter fehlt: freundlicher Hinweis
  if (!PL) {
    $("editor-status").textContent = "Interpreter nicht geladen – keine Live-Diagnose";
    $("editor-status").classList.add("warnung");
  }

  window.addEventListener("pagehide", () => tabs.sofortSpeichern());
  document.addEventListener("visibilitychange", () => { if (document.hidden) tabs.sofortSpeichern(); });
  editor.view.focus();
  document.body.classList.add("bereit");
}

// ---------- Ziehen von Trennern (Maus/Touch/Tastatur) ----------
function ziehbar(griff, achse, { start, bewege, ende, taste }) {
  griff.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    griff.setPointerCapture(e.pointerId);
    const anfang = start();
    const p0 = achse === "x" ? e.clientX : e.clientY;
    document.body.classList.add("zieht", "zieht-" + achse);
    const weiter = (ev) => bewege(anfang, (achse === "x" ? ev.clientX : ev.clientY) - p0);
    const stopp = () => {
      griff.removeEventListener("pointermove", weiter);
      griff.removeEventListener("pointerup", stopp);
      griff.removeEventListener("pointercancel", stopp);
      document.body.classList.remove("zieht", "zieht-" + achse);
      ende();
    };
    griff.addEventListener("pointermove", weiter);
    griff.addEventListener("pointerup", stopp);
    griff.addEventListener("pointercancel", stopp);
  });
  griff.addEventListener("keydown", (e) => {
    const vor = achse === "x" ? "ArrowRight" : "ArrowDown";
    const zurueck = achse === "x" ? "ArrowLeft" : "ArrowUp";
    if (e.key === vor) { e.preventDefault(); taste(1); }
    else if (e.key === zurueck) { e.preventDefault(); taste(-1); }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
