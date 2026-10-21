// pizza v3.0 Playground – Einstieg.
import { erstelleEditor } from "./editor.js";
import { erstelleKonsole } from "./konsole.js";
import { erstelleAusfuehrung } from "./ausfuehrung.js";
import { erstelleDoku } from "./doku.js";
import { erstelleBeispiele } from "./beispiele.js";
import { codeKodieren, codeDekodieren, codeAusHash } from "./teilen.js";
import { ausInterpreterErgaenzen } from "./woerter.js";

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

  // ---------- Zustand Editorinhalt ----------
  let basis = speicher.hole("pizza.basis");
  let dateiName = speicher.hole("pizza.datei") || "willkommen.pizza";
  let anfangsCode = speicher.hole("pizza.code");
  if (anfangsCode == null) { anfangsCode = WILLKOMMEN; basis = WILLKOMMEN; }
  if (basis == null) basis = anfangsCode;

  let speicherTimer = null;
  function aktualisiereSchmutz(text) {
    const schmutzig = text !== basis;
    $("datei-punkt").hidden = !schmutzig;
    $("datei-name").textContent = dateiName;
  }

  const editor = erstelleEditor({
    eltern: $("editor"),
    inhalt: anfangsCode,
    beiAenderung(text) {
      aktualisiereSchmutz(text);
      clearTimeout(speicherTimer);
      speicherTimer = setTimeout(() => speicher.setze("pizza.code", text), 400);
    },
  });
  aktualisiereSchmutz(anfangsCode);

  function setzeInhalt(code, name) {
    basis = code;
    dateiName = name || "unbenannt.pizza";
    speicher.setze("pizza.basis", basis);
    speicher.setze("pizza.datei", dateiName);
    editor.setzeText(code);
    speicher.setze("pizza.code", code);
    aktualisiereSchmutz(code);
  }

  async function ladeMitRueckfrage(code, name) {
    const text = editor.text();
    if (text === code) return true;
    if (text !== basis && text.trim()) {
      const ok = await frage("Änderungen verwerfen?", "Im Editor stehen ungespeicherte Änderungen. Wenn du fortfährst, werden sie durch „" + (name || "den neuen Code") + "“ ersetzt.");
      if (!ok) return false;
    }
    setzeInhalt(code, name);
    return true;
  }

  function speichern() {
    const text = editor.text();
    basis = text;
    speicher.setze("pizza.code", text);
    speicher.setze("pizza.basis", text);
    aktualisiereSchmutz(text);
    toast("Lokal gespeichert – im Browser abgelegt.", "ok");
  }

  // ---------- Konsole & Ausführung ----------
  const konsole = erstelleKonsole({ springe: (z, s) => editor.springeZu(z, s) });
  const knopfBacken = $("knopf-backen"), knopfAbbr = $("knopf-abbrechen");

  const ausfuehrung = erstelleAusfuehrung({
    beiStart() {
      konsole.leeren(false);
      konsole.setzeLauf({ laeuft: true });
      knopfBacken.hidden = true;
      knopfAbbr.hidden = false;
      document.body.classList.add("laeuft");
      konsoleOeffnen();
    },
    beiEreignis(ev) { konsole.ereignis(ev); },
    beiEnde(info) {
      konsole.sofortZeichnen();
      knopfBacken.hidden = false;
      knopfAbbr.hidden = true;
      document.body.classList.remove("laeuft");
      if (info.abgebrochen) {
        konsole.setzeExit("–", { wandMs: info.wandMs, zusatz: "abgebrochen" });
        $("exit-badge").className = "exit-badge abgebrochen";
        $("exit-badge").textContent = "abgebrochen";
      } else {
        konsole.setzeExit(info.exitCode, { schritte: info.schritte, zeitMs: info.zeitMs, wandMs: info.wandMs, zusatz: info.zusatz });
      }
      if (document.activeElement === knopfAbbr) knopfBacken.focus();
    },
    beiPanik(text) { zeigeHawaii(text); },
  });

  function backen() {
    if (ausfuehrung.laeuft) return;
    ausfuehrung.starte(editor.text());
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
  const tabs = [...panel.querySelectorAll('[role="tab"]')];
  let aktiverTab = speicher.hole("pizza.tab") === "beispiele" ? "beispiele" : "doku";
  function waehleTab(name, fokus) {
    aktiverTab = name;
    speicher.setze("pizza.tab", name);
    for (const t of tabs) {
      const an = t.id === "tab-" + name;
      t.setAttribute("aria-selected", String(an));
      t.tabIndex = an ? 0 : -1;
      $(t.getAttribute("aria-controls")).hidden = !an;
      if (an && fokus) t.focus();
    }
    aktiverTabGeladen();
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => waehleTab(t.id.replace("tab-", ""), false));
    t.addEventListener("keydown", (e) => {
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = tabs.length - 1;
      if (j != null) { e.preventDefault(); waehleTab(tabs[j].id.replace("tab-", ""), true); }
    });
  });

  // ---------- Doku & Beispiele ----------
  async function oeffneCode(code, titel) {
    const name = (titel || "doku").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") + ".pizza";
    const ok = await ladeMitRueckfrage(code, name);
    if (ok) {
      if (schmal.matches) setzePanel(false, { fokus: false });
      editor.view.focus();
    }
    return ok;
  }
  const doku = erstelleDoku({
    oeffneCode,
    backeCode: async (code, titel) => { if (await oeffneCode(code, titel)) backen(); },
  });
  const beispiele = erstelleBeispiele({
    async ladeCode(code, name, fehler) {
      if (fehler) { toast(fehler, "fehler"); return; }
      const ok = await ladeMitRueckfrage(code, name);
      if (ok) {
        toast("„" + name + "“ geladen. Strg+Enter zum Backen.", "ok");
        if (schmal.matches) setzePanel(false, { fokus: false });
        editor.view.focus();
      }
    },
  });
  function aktiverTabGeladen() { if (panelOffen && aktiverTab === "beispiele") beispiele.laden(); }
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

  // ---------- Teilen ----------
  $("knopf-teilen").addEventListener("click", async () => {
    const wert = await codeKodieren(editor.text());
    const url = location.href.split("#")[0] + "#code=" + wert;
    try { history.replaceState(null, "", "#code=" + wert); } catch (e) { /* egal */ }
    letzterHash = location.hash;
    let kopiert = false;
    try { await navigator.clipboard.writeText(url); kopiert = true; } catch (e) { /* kein Clipboard */ }
    toast(kopiert ? "Link kopiert – teile deine Pizza!" : "Link steht in der Adresszeile.", "ok");
    if (url.length > 8000) toast("Achtung: Der Link ist sehr lang (" + url.length + " Zeichen).", "warnung");
  });

  let letzterHash = location.hash;
  async function hashLaden(mitRueckfrage) {
    const wert = codeAusHash(location.hash);
    if (!wert) return false;
    const code = await codeDekodieren(wert);
    if (code == null) { toast("Der geteilte Link ist beschädigt – kein Code gefunden.", "fehler"); return false; }
    if (mitRueckfrage) return ladeMitRueckfrage(code, "geteilt.pizza");
    setzeInhalt(code, "geteilt.pizza");
    return true;
  }
  window.addEventListener("hashchange", () => {
    if (location.hash === letzterHash) return;
    letzterHash = location.hash;
    hashLaden(true);
  });
  hashLaden(false).then((ok) => { if (ok) toast("Geteilter Code geladen.", "ok"); });

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

  window.addEventListener("pagehide", () => speicher.setze("pizza.code", editor.text()));
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
