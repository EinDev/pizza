// pizza v3.1 Playground – Einstieg. Projekte (PROJEKTE.md §3, K-142): ein aktives Projekt je Fenster (projekte.js), Tabs =
// offene Dateien (tabs.js), Dateibaum (dateibaum.js), Projektmenü/ZIP (projektmenue.js), EXE-Dialog (exe-dialog.js).
import { erstelleEditor } from "./editor.js";
import { erstelleKonsole } from "./konsole.js";
import { erstelleAusfuehrung, workerAuftrag, interaktivMoeglich, ladeMotoren } from "./ausfuehrung.js";
import { erstelleProjekte } from "./projekte.js";
import { erstelleDateibaum } from "./dateibaum.js";
import { erstelleProjektmenue, erstelleTextFrage } from "./projektmenue.js";
import { erstelleBildvorschau } from "./bildvorschau.js";
import { erstelleExeDialog } from "./exe-dialog.js";
import { programmText, pizzaPfadAusName, projektNameAus, ladePruefung, dateiArt, groesse } from "./projekt.js";
import { erstelleVorbacker, pruefeBild } from "./bilder.js";
import { erstelleDoku } from "./doku.js";
import { erstelleBeispiele } from "./beispiele.js";
import { ausInterpreterErgaenzen, herdSchemaErgaenzen } from "./woerter.js";
import { erstelleTabs } from "./tabs.js";
import { erstellePalette } from "./palette.js";
import { erstelleVorschau } from "./vorschau.js";
import { erstelleHerdAnzeige, herdLaufVorbereiten, nutztHerd, ladeHerdSchema } from "./herd.js";
import { zerlegeArgumente, ARGUMENTE_HILFE } from "./argumente.js";
import { VORRAT, VORRAT_BEISPIEL, vorratPraefix, vorratVerfuegbar, vorratLaden, vorratSpeichern as vorratSchreiben, vorratNamen, vorratEntfernen, vorratSchluessel } from "./vorrat.js";
import { startApp } from "./app.js";
import {
  teile, ladeGeteilt, holeLink, loescheLink, holeKonfig, linkAusHash, linkAdressen, teilenQuelle, pruefeSchluessel, dauerText, umfangText,
  ohneErzeugteProjektdatei, TeilenFehler, ALT_TEXT,
} from "./teilen.js";
import { leseKoeche, speichereKoeche, koecheFuerLauf, koecheMoeglich, KOECHE_SCHLUESSEL } from "./koeche.js";

const WILLKOMMEN = `// Willkommen im pizza-Playground!
// Strg+Enter (oder „Backen“) schiebt dein Programm in den Ofen.

Blech<margherita> beläge = ["Tomate", "Mozzarella", "Basilikum"];
Bote.sage(("Frisch aus dem Ofen: Margherita mit " + beläge.verbinde(", ")));
funghi preis = 5.00 + 1.00 + 1.50 + 0.50;
Bote.sage(("Das macht " + preis.währung("€") + "."));

// Ein Ofen mit Zeitbudget: summiert, solange die Zeit reicht.
salami summe = ofen(zeit: 90s) {
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
  entferne(k) { try { localStorage.removeItem(k); } catch (e) { /* egal */ } },
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

// Rückfrage-Dialog: Antwort kommt direkt aus den Knopf-Klicks (nicht aus returnValue/close-Reihenfolge),
// Anfragen werden nacheinander abgearbeitet – so gibt es keine Wettläufe bei schnellem Bestätigen.
let frageKette = Promise.resolve();
function frage(titel, text, ja = "Ersetzen", nein = "Abbrechen") {
  const dlg = $("dialog-frage");
  if (typeof dlg.showModal !== "function") return Promise.resolve(window.confirm(text));
  const naechste = frageKette.then(() => new Promise((resolve) => {
    $("dialog-titel").textContent = titel;
    $("dialog-text").textContent = text;
    $("dialog-ja").textContent = ja;
    const jaKnopf = $("dialog-ja");
    const neinKnopf = dlg.querySelector('button[value="nein"]');
    neinKnopf.textContent = nein;
    let fertig = false;
    const ende = (wert) => {
      if (fertig) return;
      fertig = true;
      jaKnopf.removeEventListener("click", beiJa);
      neinKnopf.removeEventListener("click", beiNein);
      dlg.removeEventListener("cancel", beiNein);
      dlg.removeEventListener("close", beiClose);
      if (dlg.open) dlg.close();
      resolve(wert);
    };
    const beiJa = (e) => { e.preventDefault(); ende(true); };
    const beiNein = (e) => { e.preventDefault(); ende(false); };
    const beiClose = () => ende(dlg.returnValue === "ja");
    jaKnopf.addEventListener("click", beiJa);
    neinKnopf.addEventListener("click", beiNein);
    dlg.addEventListener("cancel", beiNein);
    dlg.addEventListener("close", beiClose);
    dlg.returnValue = "";
    if (!dlg.open) dlg.showModal();
    jaKnopf.focus();
  }));
  frageKette = naechste.catch(() => {});
  return naechste;
}

async function start() {
  const PL = window.PizzaLang || null;
  ausInterpreterErgaenzen(PL);
  if (PL && PL.version) {
    const v = String(PL.version).split(".");
    $("version").textContent = "v" + v[0] + "." + (v[1] || "0");
    $("version").title = "Interpreter " + PL.version;
  }

  // ---------- Projekte, Editor, Tabs, Dateibaum ----------
  // Erster Start: alte Tabs (pizza.tabs) werden zu Ein-Datei-Projekten (F12); ohne IndexedDB nur im Speicher + Banner.
  const projekte = await erstelleProjekte({ speicher, willkommen: WILLKOMMEN });
  projekte.an("meldung", ({ text, art }) => toast(text, art));
  const fragText = erstelleTextFrage($("dialog-eingabe"));
  let tabs = null, baum = null, exe = null;
  const editor = erstelleEditor({
    eltern: $("editor"),
    inhalt: "",
    beiAenderung(text) { if (tabs) tabs.beiAenderung(text); },
    // Live-Diagnose der Projektprüfungen (PROJEKTE §3.1) – nur in Mehrdatei-Projekten und nur für Fehler in der offenen Datei
    projektDiagnose(text) {
      if (!tabs || !tabs.aktivPfad || projekte.pfade().length < 2) return null;
      const { projekt } = projekte.sammlung();
      projekt.dateien[tabs.aktivPfad] = text;
      const f = ladePruefung(projekt);
      return f && f.datei === tabs.aktivPfad ? f : null;
    },
  });
  // Vorbacker (PD1): teigling.js + teigling.wasm erst beim ersten Bild; Teiglinge im IndexedDB-Speicher „teiglinge“
  const vorbacker = erstelleVorbacker({ ablage: projekte.ablage });
  const bildvorschau = erstelleBildvorschau({ wurzel: $("bildvorschau"), editorEl: $("editor"), vorbacker });
  tabs = erstelleTabs({
    editor, leiste: $("editor-tabs"), projekte, frage, toast,
    beiWechsel() { argsAnzeigen(); if (baum) baum.markiere(); },
    beiNeu: () => neuesProjekt(),
    beiTeilen: () => $("knopf-teilen").click(),
    beiExe: () => exe.oeffnen(),
    zeigeBinaer: (pfad) => bildvorschau.zeige(pfad, pfad ? projekte.inhalt(pfad) : null),
  });
  const projektmenue = erstelleProjektmenue({
    knopf: $("knopf-projekt"), namenEl: $("projekt-name"), banner: $("projekt-banner"), projekte, frage, fragText, toast, tabs,
    beiExe: () => exe.oeffnen(), beiTeilen: () => $("knopf-teilen").click(), beiNeu: () => neuesProjekt(),
  });
  baum = erstelleDateibaum({
    wurzel: $("dateibaum"), umschalter: $("knopf-dateibaum"), projekte, tabs, frage, toast, schmal, speicher, vorbacker,
    beiZip: (f) => projektmenue.zipImport(f),
  });
  tabs.laden();
  baum.zeichne();
  async function neuesProjekt() {
    await projekte.neu({});
    editor.view.focus();
  }
  function argsAnzeigen() {
    const f = document.getElementById("args");
    if (f) { f.value = projekte.aktiv.args || ""; f.dispatchEvent(new Event("lauf-punkt")); }
  }
  // Herd: Komponenten, Felder, Teil-Methoden, Grundformen und Palette aus site/js/herd/schema.json für Vervollständigung und
  // Hervorhebung (HERD.md §3.3) – eine neue Komponente im Kern erscheint ohne Änderung an der UI
  ladeHerdSchema().then((s) => { if (herdSchemaErgaenzen(s)) editor.neuHervorheben(); });

  function speichern() {
    const p = tabs.sichern();
    if (p) toast("„" + p + "“ lokal gespeichert.", "ok");
  }

  /**
   * Code (Beispiel, Doku-Block) als Ein-Datei-Projekt bzw. Dateien (geteilter Link: { pfad → inhalt }, Name, opt.hauptdatei/teilen)
   * als Projekt öffnen (PROJEKTE §3.3, §3.5). Gleiche Quelle → in die vorhandene Kopie springen, solange sie unverändert ist; sonst
   * Wahl „Zu meiner Kopie“ / „Frische Kopie“.
   */
  async function oeffneAlsProjekt(code, dateiname, quelle, opt = {}) {
    const da = quelle ? projekte.findeQuelle(quelle) : null;
    if (da) {
      const frisch = (await projekte.istUnveraendert(da.id)) ? false
        : await frage("Schon einmal geöffnet", "Deine Kopie „" + da.name + "“ ist geändert. Zu deiner Kopie wechseln oder eine frische Kopie anlegen?", "Frische Kopie", "Zu meiner Kopie");
      if (!frisch) { await projekte.wechsle(da.id); return { neu: false }; }
    }
    if (code && typeof code === "object") {
      await projekte.neu({ name: projektNameAus(dateiname), dateien: code, hauptdatei: opt.hauptdatei || null, quelle, teilen: opt.teilen || null });
      return { neu: true };
    }
    const pfad = pizzaPfadAusName(dateiname);
    await projekte.neu({ name: projektNameAus(dateiname), dateien: { [pfad]: code }, quelle });
    return { neu: true };
  }

  // ---------- Konsole & Ausführung ----------
  let laufProjektId = null;
  const konsole = erstelleKonsole({
    // Sprung zum Fehlerort (PROJEKTE §3.1): zurück ins gelaufene Projekt, `datei` als Tab öffnen, Cursor setzen
    springe: async (z, s, datei) => {
      if (laufProjektId && projekte.aktiv.id !== laufProjektId) await projekte.wechsle(laufProjektId);
      tabs.springe(datei, z, s);
    },
  });
  const knopfBacken = $("knopf-backen"), knopfAbbr = $("knopf-abbrechen");
  let laufName = "";

  // Theke-Vorschaufenster (UI-Ereignisse gehen über die Ausführung zurück ans Programm)
  const vorschau = erstelleVorschau({
    // Herd (H6): Schließen-Knopf → „geschlossen“ über den Herd-Puffer; sonst Theke-Ereignisse an das Programm
    beiEreignis: (ev) => { if (herd.aktiv && ev && ev.typ === "geschlossen") herd.nutzerSchliesst(); else ausfuehrung.uiEreignis(ev); },
    beiZu: () => editor.view.focus(),
  });
  const herd = erstelleHerdAnzeige({ vorschau, beiMeldung: (text) => konsole.system(text, "fehler") });

  const ausfuehrung = erstelleAusfuehrung({
    beiUi(n) { vorschau.nachricht(n); },
    beiHerd(ev) { herd.ereignis(ev); },
    beiVorrat(name, eintraege) { vorratSpeichern(laufVorratPraefix, name, eintraege); },
    beiStart() {
      herd.beenden();
      vorschau.beenden();
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
      konsole.versteckeEingabe();
      herd.beenden();
      vorschau.beenden();
      knopfBacken.hidden = false;
      knopfAbbr.hidden = true;
      document.body.classList.remove("laeuft");
      logoBacken(false);
      if (info.abgebrochen) {
        konsole.setzeExit("–", { wandMs: info.wandMs, zusatz: "abgebrochen", name: laufName });
        $("exit-badge").className = "exit-badge abgebrochen";
        $("exit-badge").textContent = "abgebrochen";
      } else {
        konsole.setzeExit(info.exitCode, { schritte: info.schritte, zeitMs: info.zeitMs, wandMs: info.wandMs, laufMs: info.laufMs, zusatz: info.zusatz, name: laufName, koeche: info.koeche });
      }
      if (document.activeElement === knopfAbbr) knopfBacken.focus();
    },
    beiPanik() { /* Hawaii wird wie jeder andere Fehler in der Konsole gezeigt */ },
    beiMotor(ev) { konsole.setzeMotor(ev); },
    beiEingabeAnfrage(ev) {
      konsoleOeffnen();
      $("exit-badge").className = "exit-badge wartet";
      $("exit-badge").textContent = "wartet auf Eingabe";
      konsole.frageEingabe(ev, (text) => {
        ausfuehrung.antworte(text);
        $("exit-badge").className = "exit-badge laeuft";
        $("exit-badge").textContent = "im Ofen …";
      });
    },
    beiEingabeEnde() { konsole.versteckeEingabe(); },
  });

  // ---------- Motor (Wasm / Interpreter) ----------
  // Fähigkeiten werden genau einmal pro Seite geprüft (und erneut nur, wenn der Nutzer die Auswahl öffnet
  // und die letzte Prüfung > 30 s zurückliegt). „Wasm“ fällt nie stillschweigend auf den Interpreter zurück.
  const motorWahl = $("motor-wahl");
  const optAuto = motorWahl.querySelector('option[value="auto"]');
  const optWasm = motorWahl.querySelector('option[value="wasm"]');
  const knopfPkarton = $("knopf-pkarton");
  // Standard ist Auto (Wasm mit Fallback). Einmalig: Wer durch die Zwischen-Migration (Stand 2) auf „interpreter“
  // gesetzt wurde und nicht selbst gewählt hat, kommt zurück auf Auto. Explizite Wahl wird respektiert.
  if (speicher.hole("pizza.motorStand") !== "3") {
    if (speicher.hole("pizza.motorStand") === "2" && speicher.hole("pizza.motor") === "interpreter" && speicher.hole("pizza.motorExplizit") !== "1") {
      speicher.setze("pizza.motor", "auto");
    }
    speicher.setze("pizza.motorStand", "3");
  }
  const gespeicherterMotor = () => {
    const m = speicher.hole("pizza.motor");
    return ["auto", "wasm", "interpreter"].includes(m) ? m : "auto";
  };
  let faehigkeiten = null, letztePruefung = 0, pruefungLaeuft = null;
  function wendeMotorAn() {
    const wasm = !!(faehigkeiten && faehigkeiten.wasm);
    const unbekannt = !faehigkeiten;
    optWasm.disabled = !wasm && !unbekannt;
    optWasm.textContent = wasm || unbekannt ? "Wasm" : "Wasm (bald)";
    const grund = faehigkeiten && !wasm ? (faehigkeiten.grund || "Wasm-Compiler nicht verfügbar") : "";
    optWasm.title = grund ? "Nicht verfügbar: " + grund : (faehigkeiten && faehigkeiten.version ? "pizzaiolo " + faehigkeiten.version : "");
    optAuto.textContent = wasm || unbekannt ? "Auto (Wasm)" : "Auto";
    optAuto.title = wasm || unbekannt ? "Wasm, bei Bedarf (z. B. Theke) Interpreter" : "Interpreter, bis der Wasm-Compiler verfügbar ist";
    const g = gespeicherterMotor();
    // gespeicherte Wahl „wasm“ als „Auto“ anzeigen, aber NICHT überschreiben
    motorWahl.value = g === "wasm" && optWasm.disabled ? "auto" : g;
    zeigeMotorIcon();
    motorWahl.title = grund ? "Ausführungsmotor – Wasm nicht verfügbar: " + grund : "Ausführungsmotor: WebAssembly (schnell) oder Interpreter";
    knopfPkarton.hidden = !wasm;
  }
  let motorenVersprechen = null;
  /** Liest js/motoren.json ({ wasm, exe }); fehlt sie, gilt alles als nicht verfügbar. */
  function holeMotoren(neu = false) {
    if (!motorenVersprechen || neu) {
      motorenVersprechen = ladeMotoren();
    }
    return motorenVersprechen;
  }
  function pruefeFaehigkeiten() {
    if (pruefungLaeuft) return pruefungLaeuft;
    letztePruefung = Date.now();
    // Erst das immer vorhandene Manifest js/motoren.json lesen – nur bei wasm:true wird pizzaiolo.js
    // überhaupt angefasst (keine 404-Fehler, wenn der Compiler noch nicht ausgeliefert ist).
    pruefungLaeuft = holeMotoren(true).then((mo) => (mo.wasm
      ? workerAuftrag({ typ: "pruefe" }, "faehigkeiten", 20_000)
      : { typ: "faehigkeiten", interpreter: true, wasm: false, grund: "Wasm-Compiler wird noch gebacken" })).then((f) => {
      const vorher = faehigkeiten && faehigkeiten.wasm;
      faehigkeiten = f && f.typ === "faehigkeiten" ? f : { wasm: false, grund: (f && f.grund) || "Prüfung fehlgeschlagen" };
      pruefungLaeuft = null;
      wendeMotorAn();
      if (vorher === false && faehigkeiten.wasm) toast("Wasm-Motor ist jetzt verfügbar.", "ok");
      return faehigkeiten;
    });
    return pruefungLaeuft;
  }
  wendeMotorAn();
  pruefeFaehigkeiten();
  const vielleichtNeuPruefen = () => { if (faehigkeiten && !faehigkeiten.wasm && Date.now() - letztePruefung > 30_000) pruefeFaehigkeiten(); };
  motorWahl.addEventListener("pointerdown", vielleichtNeuPruefen);
  motorWahl.addEventListener("focus", vielleichtNeuPruefen);
  function zeigeMotorIcon() {
    const motorIcon = $("motor-icon");
    motorIcon.innerHTML = motorWahl.value === "interpreter"
      ? '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'
      : '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>';
    motorIcon.classList.toggle("interpreter", motorWahl.value === "interpreter");
  }
  motorWahl.addEventListener("change", () => {
    zeigeMotorIcon();
    speicher.setze("pizza.motor", motorWahl.value);
    speicher.setze("pizza.motorExplizit", "1");
    const name = motorWahl.options[motorWahl.selectedIndex].text;
    toast(ausfuehrung.laeuft ? "Motor: " + name + " – gilt ab dem nächsten Lauf." : "Motor: " + name, "info");
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

  // ---------- Als Programm (EXE) / .pkarton herunterladen (exe-dialog.js): kompiliert wird das aktive Projekt ----------
  exe = erstelleExeDialog({
    toast, speicher, holeMotoren,
    motor: { get faehigkeiten() { return faehigkeiten; }, warte: () => pruefungLaeuft || Promise.resolve(faehigkeiten) },
    // Projekt samt vorgebackenen Bildern (PROJEKTE §3.5/§3.6); Mehrdatei-Projekte backt der Wasm-Compiler erst mit PA2
    auftrag: async () => {
      const { projekt, uebertragbar } = projekte.sammlung({ mitProjektdatei: true });
      const nachricht = { typ: "kompiliere", projekt };
      const bilder = Object.fromEntries(Object.entries(projekt.dateien).filter(([p, i]) => dateiArt(p) === "bild" && i instanceof Uint8Array));
      if (Object.keys(bilder).length) {
        const [modul, teiglinge] = await Promise.all([vorbacker.modul(), vorbacker.teiglingeFuer(bilder)]);
        nachricht.teiglinge = teiglinge;
        if (modul) nachricht.vorbacker = modul;
      }
      return { nachricht, transfer: uebertragbar };
    },
    anzeigeName: () => projekte.aktiv.name,
  });

  // ---------- Lauf-Einstellungen (Popover in der Konsolenleiste): Argumente je Projekt, feste Saat ----------
  const argsFeld = $("args");
  const laufKnopf = $("knopf-lauf-optionen");
  const laufPopover = $("lauf-popover");
  { const h = ARGUMENTE_HILFE.replace(/^Argumente für hauptgang\(args\) – /, ""); $("args-hilfe").textContent = h.charAt(0).toUpperCase() + h.slice(1); }
  argsFeld.value = projekte.aktiv.args || "";
  function laufPunkt() {
    const args = argsFeld.value.trim(), fest = $("feste-saat").checked, koeche = leseKoeche();
    $("lauf-punkt").hidden = !args && !fest && koeche === "auto";
    laufKnopf.title = "Lauf-Einstellungen" + (args ? " · Argumente: " + args : "") + (fest ? " · feste Saat 42" : "") +
      (koeche !== "auto" ? " · Köche: " + koeche : "");
  }
  function laufOptionenOeffnen(fokusArgs = true) {
    konsoleOeffnen();
    laufPopover.hidden = false;
    laufKnopf.setAttribute("aria-expanded", "true");
    if (fokusArgs) { argsFeld.focus(); argsFeld.select(); }
  }
  function laufOptionenSchliessen(fokusZurueck) {
    if (laufPopover.hidden) return;
    laufPopover.hidden = true;
    laufKnopf.setAttribute("aria-expanded", "false");
    if (fokusZurueck) laufKnopf.focus();
  }
  laufKnopf.addEventListener("click", () => (laufPopover.hidden ? laufOptionenOeffnen(true) : laufOptionenSchliessen(false)));
  laufPopover.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); laufOptionenSchliessen(true); } });
  document.addEventListener("pointerdown", (e) => { if (!laufPopover.hidden && !$("lauf-optionen").contains(e.target)) laufOptionenSchliessen(false); }, true);
  argsFeld.addEventListener("input", () => { projekte.setzeArgs(argsFeld.value); laufPunkt(); });
  argsFeld.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); laufOptionenSchliessen(false); backen(); } });

  // ---------- Zufallssaat (K-077) ----------
  const festeSaatBox = $("feste-saat");
  festeSaatBox.checked = speicher.hole("pizza.festeSaat") === "1";
  festeSaatBox.addEventListener("change", () => { speicher.setze("pizza.festeSaat", festeSaatBox.checked ? "1" : "0"); laufPunkt(); });
  argsFeld.addEventListener("lauf-punkt", laufPunkt);

  // ---------- Köche für die Küchenbrigade (SPEC §17.7, THREADS §4.8): auto | 1 | 2 | 4 | 8, pro Browser ----------
  const koecheFeld = $("koeche-wahl");
  function koecheZeigen() {
    const w = leseKoeche();
    for (const r of koecheFeld.querySelectorAll('input[name="koeche"]')) r.checked = r.value === w;
  }
  koecheZeigen();
  koecheFeld.addEventListener("change", (e) => {
    // Wechsel → warmen Lauf-Worker samt Köchen freigeben (sonst lebte z. B. bei „Köche: 1“ der alte Pool weiter)
    if (e.target && e.target.name === "koeche") { speichereKoeche(e.target.value); laufPunkt(); ausfuehrung.verwerfeWarm(); }
  });
  // Ohne Cross-Origin-Isolation gibt es keine echten Köche – gleiches Ergebnis wie „Köche: 1“, nur ein dezenter Hinweis
  $("koeche-hinweis").hidden = koecheMoeglich();
  window.addEventListener("storage", (e) => { if (e.key === KOECHE_SCHLUESSEL) { koecheZeigen(); laufPunkt(); ausfuehrung.verwerfeWarm(); } });
  laufPunkt();
  function neueSaat() {
    if (festeSaatBox.checked) return 42;
    try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; }
    catch (e) { return Math.floor(Math.random() * 4294967296); }
  }

  // ---------- Vorratskammer (K-079 … K-081), Namensräume siehe vorrat.js ----------
  let laufVorratPraefix = VORRAT;
  function vorratSpeichern(praefix, name, eintraege) {
    if (!vorratSchreiben(praefix, name, eintraege)) toast("Der Vorrat „" + name + "“ konnte im Browser nicht gespeichert werden (Speicher voll?).", "fehler");
  }

  // „Vorrat löschen“ (gleiche Texte wie bin/pizza.js --vorrat-loeschen / --vorrat-loeschen-alle).
  // Angeboten werden die Kammern des Tab-Namensraums und alle Kammern mit Namensraum (Kennung raum/name, K-106).
  async function vorratLoeschen(kennung) {
    const praefix = vorratPraefix(projekte.aktiv);
    const beispiel = praefix === VORRAT_BEISPIEL;
    if (kennung == null) {
      const namen = vorratNamen(praefix);
      const mitRaum = namen.some((n) => n.includes("/"));
      const welche = beispiel
        ? (mitRaum ? "Alle Vorräte der Beispiele und alle Kammern mit Namensraum" : "Alle Vorräte der Beispiele")
        : "Alle gespeicherten Vorratskammern";
      const ok = await frage("Alle Vorräte löschen?", welche + " werden gelöscht. Spielstände gehen dabei verloren.", "Alle löschen");
      if (!ok) return;
      for (const n of namen) vorratEntfernen(praefix, n);
      konsoleOeffnen();
      konsole.info("Alle Vorräte gelöscht.");
      return;
    }
    let da = false;
    try { da = localStorage.getItem(vorratSchluessel(praefix, kennung)) !== null; } catch (e) { da = false; }
    if (!da) { konsoleOeffnen(); konsole.info("Vorrat '" + kennung + "' gibt es nicht."); return; }
    const raum = kennung.includes("/") ? " (Kammer mit Namensraum, allen Tabs und App-Links gemeinsam)" : (beispiel ? " (Vorrat der Beispiele)" : "");
    const ok = await frage("Vorrat löschen?", "Die Vorratskammer „" + kennung + "“" + raum + " wird gelöscht. Ein Spielstand darin geht verloren.", "Löschen");
    if (!ok) return;
    vorratEntfernen(praefix, kennung);
    konsoleOeffnen();
    konsole.info("Vorrat '" + kennung + "' gelöscht.");
  }

  let backenWartet = false;
  async function backen() {
    if (ausfuehrung.laeuft) return;
    // Ausführen startet immer das PROJEKT (Hauptdatei), egal welcher Tab aktiv ist (PROJEKTE §3.1)
    const P = projekte.aktiv;
    const code = programmText(projekte.alleInhalte());
    // Interaktive Programme (Eingabe, Theke) brauchen SharedArrayBuffer/Atomics → Cross-Origin-Isolation.
    // Ohne sie gibt es keinen Ersatzmodus (Browser = nativ), sondern eine klare Fehlermeldung.
    if (!interaktivMoeglich() && (/\bBestellannahme\s*\./.test(code) || /\bneu\s+Theke\s*\(/.test(code) || /\bneu\s+Herd\s*\(/.test(code))) {
      konsole.leeren(false);
      $("exit-badge").hidden = true;
      $("lauf-info").textContent = "";
      konsole.system("Dieser Browser erlaubt keine interaktive Eingabe (Cross-Origin-Isolation fehlt). Das Programm wurde nicht gestartet.", "fehler");
      konsoleOeffnen();
      return;
    }
    // Erster Lauf direkt nach dem Laden: auf die laufende Fähigkeiten-Prüfung warten, sonst nähme „Auto“/„Wasm“
    // fälschlich den Interpreter (faehigkeiten wäre noch null).
    const motor = motorWahl.value;
    if (motor !== "interpreter" && !faehigkeiten) {
      if (backenWartet) return;
      backenWartet = true;
      try { await (pruefungLaeuft || pruefeFaehigkeiten()); } finally { backenWartet = false; }
      if (ausfuehrung.laeuft) return;
    }
    // Herd (H6): kern.wasm (einmal je Seite kompiliert), Port zum Render-Worker und Takt-Puffer – nur für Herd-Programme
    let herdLauf = null;
    if (nutztHerd(code) && interaktivMoeglich()) {
      if (backenWartet) return;
      backenWartet = true;
      try { herdLauf = await herdLaufVorbereiten(code); } finally { backenWartet = false; }
      if (ausfuehrung.laeuft) return;
    }
    // Bilder (PD1/PD2): vorgebackene Teiglinge aus dem Cache + das Vorbacker-Modul für den Worker (der Interpreter prüft jeden)
    let bildLauf = {};
    const bilder = Object.fromEntries(Object.entries(projekte.alleInhalte()).filter(([p, i]) => dateiArt(p) === "bild" && i instanceof Uint8Array));
    if (Object.keys(bilder).length) {
      if (backenWartet) return;
      backenWartet = true;
      try {
        const [modul, teiglinge] = await Promise.all([vorbacker.modul(), vorbacker.teiglingeFuer(bilder)]);
        bildLauf = { teiglinge, ...(modul ? { vorbacker: modul } : {}) };
      } finally { backenWartet = false; }
      if (ausfuehrung.laeuft) return;
    }
    if (projekte.aktiv.id !== P.id) return; // während des Wartens das Projekt gewechselt
    laufProjektId = P.id;
    laufName = projekte.pfade().length > 1 ? P.name + " (" + P.hauptdatei + ")" : P.hauptdatei;
    const saat = neueSaat();
    laufVorratPraefix = vorratPraefix(P);
    const vorratAktiv = vorratVerfuegbar();
    ausfuehrung.starte(projekte.sammlung(), zerlegeArgumente(P.args), motor, {
      pizzaiolo: !!(faehigkeiten && faehigkeiten.wasm),
      pizzaioloGrund: faehigkeiten && faehigkeiten.grund,
      zufallsSaat: saat,
      vorrat: vorratAktiv ? vorratLaden(laufVorratPraefix) : undefined,
      vorratAktiv,
      koeche: koecheFuerLauf(leseKoeche()),
      ...(herdLauf ? herdLauf.extra : {}),
      ...bildLauf,
      ...festeUhr(),
    });
    herd.lauf(herdLauf && herdLauf.kontext);
    konsole.saat(saat);
  }
  /** E2E (window.__laufUhr): feste Wanduhr/Zeitzone aus dem Beispiel-Manifest (echtzeit/zone, K-087/K-154) wie in den Node-Tests. */
  function festeUhr() {
    const u = window.__laufUhr, o = {};
    if (!u || typeof u !== "object") return o;
    if (typeof u.echtzeit === "number") o.echtzeit = u.echtzeit;
    if (typeof u.zone === "number") o.zone = u.zone;
    return o;
  }
  knopfBacken.addEventListener("click", backen);
  knopfAbbr.addEventListener("click", () => ausfuehrung.abbrechen());
  $("konsole-leeren").addEventListener("click", () => {
    konsole.leeren(true);
    $("exit-badge").hidden = true;
    $("lauf-info").textContent = "";
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

  // ---------- Doku & Beispiele (öffnen jeweils als eigenes Ein-Datei-Projekt, quelle doku:/beispiel:) ----------
  async function oeffneCode(code, titel, schluessel) {
    const name = (titel || "doku").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) + ".pizza";
    const { neu } = await oeffneAlsProjekt(code, name, schluessel);
    if (!neu) toast("Bereits geöffnet – zum Projekt gewechselt.", "info");
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
    backeCode: async (code, titel, schluessel) => { await oeffneCode(code, titel, schluessel); backen(); },
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
    async ladeCode(code, name, fehler, schluessel) {
      if (fehler) { toast(fehler, "fehler"); return; }
      // Tab-Schlüssel „bsp:<datei>“ der Galerie → Projekt-Quelle „beispiel:<datei>“ (PROJEKTE §3.2/§3.3)
      const quelle = schluessel && schluessel.startsWith("bsp:") ? "beispiel:" + schluessel.slice(4) : schluessel;
      const { neu } = await oeffneAlsProjekt(code, name, quelle);
      toast(neu ? "„" + name + "“ als neues Projekt geöffnet. Strg+Enter zum Backen." : "„" + name + "“ ist schon offen – zum Projekt gewechselt.", "ok");
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
    if (typeof vorschau !== "undefined") vorschau.setzeThema();
    themaKnopf.setAttribute("aria-label", t === "dark" ? "Helles Thema einschalten" : "Dunkles Thema einschalten");
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", t === "dark" ? "#16171a" : "#fbf7f0"));
  }
  setzeThema(document.documentElement.dataset.theme === "dark" ? "dark" : "light", false);
  themaKnopf.addEventListener("click", () => setzeThema(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true));
  // Zurück zum Systemthema (Seite und Theke-Fenster folgen dann wieder dem OS)
  function themaWieSystem() {
    try { localStorage.removeItem("pizza.thema"); } catch (e) { /* egal */ }
    setzeThema(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light", false);
    toast("Thema folgt wieder dem System.", "info");
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    const gemerkt = speicher.hole("pizza.thema");
    if (gemerkt !== "light" && gemerkt !== "dark") setzeThema(e.matches ? "dark" : "light", false);
  });

  // ---------- Teilen (PROJEKTE §4, K-143): Projekt über die Durchreiche – Code-Link #h=<id>[@n], App-Link #app=<id>[@n] (app.js) ----------
  const teilenDlg = $("dialog-teilen");
  const teilenOpt = { basis: "" };
  let teilenGeteilt = null;   // { id, version, schluessel? } des zuletzt erstellten Links (Fertig-Schritt)
  let teilenProjektId = null;
  function teilenSchritt(name) {
    teilenDlg.querySelectorAll(".teilen-schritt").forEach((s) => { s.hidden = s.dataset.schritt !== name; });
  }
  async function kopiere(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
  }
  let konfigVersprechen = null;
  function holeTeilenKonfig() {
    if (!konfigVersprechen) konfigVersprechen = holeKonfig(teilenOpt);
    return konfigVersprechen;
  }
  /** Link-ID, zu der dieses Projekt gehört (eigener Link oder geöffneter Code-Link), und ob wir den Schlüssel haben. */
  const linkVon = (P) => (P.teilen && P.teilen.id ? P.teilen : null);
  function setzeTeilenVerfuegbar(k) {
    const text = dauerText(k);
    $("teilen-dauer").textContent = text;
    $("teilen-dauer").hidden = !text;
    const aus = !!(k && k.teilen === false);
    const senden = $("teilen-senden");
    senden.disabled = aus;
    senden.title = aus ? "Teilen ist auf diesem Server gerade nicht eingerichtet." : "";
    $("teilen-aus").hidden = !aus;
  }
  function frageZeigen() {
    const P = projekte.aktiv;
    const l = linkVon(P);
    const mitSchluessel = !!(l && l.schluessel);
    $("teilen-wahl").hidden = !mitSchluessel;
    if (mitSchluessel) {
      teilenDlg.querySelector('input[name="teilen-wahl"][value="version"]').checked = true;
      $("teilen-wahl-info").textContent = l.version ? "– bisher v" + l.version : "";
    }
    $("teilen-schluessel-frage").hidden = !(l && !l.schluessel);
    const wahlNeu = () => !mitSchluessel || teilenDlg.querySelector('input[name="teilen-wahl"]:checked').value === "neu";
    $("teilen-senden").textContent = wahlNeu() ? "Link erstellen" : "Neue Version teilen";
    teilenDlg.querySelectorAll('input[name="teilen-wahl"]').forEach((r) => { r.onchange = () => { $("teilen-senden").textContent = wahlNeu() ? "Link erstellen" : "Neue Version teilen"; }; });
    teilenSchritt("frage");
  }
  function zeigeFertig(t, { unveraendert = false, kopiert = false } = {}) {
    const basis = location.href.split("#")[0];
    const a = linkAdressen(basis, t.id, t.version);
    $("teilen-url").value = a.code;
    $("teilen-url-app").value = a.app;
    $("teilen-url-fest").value = a.codeFest;
    $("teilen-url-app-fest").value = a.appFest;
    $("teilen-version").textContent = "v" + t.version;
    $("teilen-fest").open = false;
    $("teilen-schluessel-bereich").hidden = !t.schluessel;
    $("teilen-schluessel-bereich").open = false;
    for (const id of ["teilen-kopieren", "teilen-kopieren-fest", "teilen-kopieren-app-fest", "teilen-schluessel-kopieren"]) $(id).textContent = id === "teilen-schluessel-kopieren" ? "Bearbeitungsschlüssel kopieren" : "Kopieren";
    $("teilen-kopieren-app").textContent = kopiert ? "Kopiert ✓" : "Kopieren";
    const name = "„" + projekte.aktiv.name + "“";
    $("teilen-fertig-text").textContent = (unveraendert
      ? name + " ist unverändert – Version v" + t.version + " gilt weiter."
      : name + " ist gespeichert" + (t.version > 1 ? " – Version v" + t.version + " unter demselben Link." : ".")) +
      (kopiert ? " Der App-Link ist schon in der Zwischenablage." : "") + " Jeder mit einem der Links kann den Code lesen.";
    teilenSchritt("fertig");
  }
  function teilenFehler(text) {
    $("teilen-fehlertext").textContent = text;
    teilenSchritt("fehler");
    $("teilen-nochmal").focus();
  }
  async function linkErstellen() {
    const P = projekte.aktiv;
    teilenProjektId = P.id;
    const l = linkVon(P);
    const neueVersion = !!(l && l.schluessel) && !$("teilen-wahl").hidden && teilenDlg.querySelector('input[name="teilen-wahl"]:checked').value === "version";
    teilenSchritt("laeuft");
    const status = $("teilen-status-text");
    status.textContent = neueVersion ? "Neue Version wird geteilt …" : "Link wird erstellt …";
    try {
      const k = await holeTeilenKonfig();
      // Bilder: Kopf/Größe wie beim Hinzufügen, Teigmenge wie beim Lauf (F8) – vor dem Hochladen
      const alle = projekte.alleInhalte();
      for (const [pfad, i] of Object.entries(alle)) {
        if (dateiArt(pfad) !== "bild" || !(i instanceof Uint8Array)) continue;
        const b = pruefeBild(pfad, i);
        if (!b.ok) throw new TeilenFehler(b.fehler, { art: "grenze" });
      }
      const { projekt } = projekte.sammlung({ mitProjektdatei: true });
      const r = await teile({
        ...teilenOpt, projekt, grenzen: k.grenzen, link: neueVersion ? { id: l.id, schluessel: l.schluessel } : null,
        fortschritt(schritt, i, n) {
          if (schritt === "hochladen") status.textContent = "Datei " + i + " von " + n + " wird hochgeladen …";
          else if (schritt === "speichern") status.textContent = neueVersion ? "Neue Version wird gespeichert …" : "Link wird gespeichert …";
        },
      });
      const t = { id: r.id, version: r.version, schluessel: neueVersion ? l.schluessel : r.schluessel };
      await projekte.setzeTeilen(t, P.id);
      teilenGeteilt = t;
      try { history.replaceState(null, "", "#h=" + t.id); } catch (e) { /* egal */ }
      letzterHash = location.hash;
      const tageText = dauerText(k);
      $("teilen-dauer-fertig").textContent = tageText;
      $("teilen-dauer-fertig").hidden = !tageText;
      // Der App-Link ist der, den man meistens weitergibt → er landet automatisch in der Zwischenablage
      const kopiert = await kopiere(linkAdressen(location.href.split("#")[0], t.id).app);
      zeigeFertig(t, { unveraendert: !!r.unveraendert, kopiert });
      $("teilen-url-app").focus();
      $("teilen-url-app").select();
    } catch (e) {
      if (!(e instanceof TeilenFehler)) { console.error(e); teilenFehler("Teilen ist gerade nicht möglich. Bitte versuch es später erneut."); return; }
      if (neueVersion && e.art === "weg") {
        // eigener Link abgelaufen oder gelöscht → Verbindung lösen (§4.4)
        await projekte.setzeTeilen(null, P.id);
        teilenFehler("Der Link ist abgelaufen oder gelöscht. „Erneut versuchen“ erstellt einen neuen Link.");
        return;
      }
      if (e.art === "schluessel") {
        await projekte.setzeTeilen({ id: l.id, version: l.version }, P.id);   // falscher Schlüssel → vergessen, neu eingeben
        teilenFehler(e.message + " Gib ihn neu ein oder teile einen neuen Link.");
        return;
      }
      teilenFehler(e.message);
    }
  }
  $("knopf-teilen").addEventListener("click", () => {
    const P = projekte.aktiv;
    const { projekt } = projekte.sammlung({ mitProjektdatei: true });
    let bytes = 0;
    for (const i of Object.values(projekt.dateien)) bytes += groesse(i);
    $("teilen-tabname").textContent = "„" + P.name + "“";
    $("teilen-umfang").textContent = umfangText(Object.keys(projekt.dateien).length, bytes);
    setzeTeilenVerfuegbar(null);
    holeTeilenKonfig().then(setzeTeilenVerfuegbar);
    frageZeigen();
    if (typeof teilenDlg.showModal !== "function") { teilenDlg.setAttribute("open", ""); return; }
    teilenDlg.showModal();
    $("teilen-abbrechen").focus();
  });
  $("teilen-senden").addEventListener("click", linkErstellen);
  $("teilen-nochmal").addEventListener("click", linkErstellen);
  $("teilen-abbrechen").addEventListener("click", () => teilenDlg.close());
  $("teilen-schliessen").addEventListener("click", () => teilenDlg.close());
  $("teilen-fehler-schliessen").addEventListener("click", () => teilenDlg.close());
  for (const [knopf, feld] of [["teilen-kopieren", "teilen-url"], ["teilen-kopieren-app", "teilen-url-app"], ["teilen-kopieren-fest", "teilen-url-fest"], ["teilen-kopieren-app-fest", "teilen-url-app-fest"]]) {
    $(knopf).addEventListener("click", async () => {
      const ok = await kopiere($(feld).value);
      if (!ok) { $(feld).focus(); $(feld).select(); }
      $(knopf).textContent = ok ? "Kopiert ✓" : "Bitte manuell kopieren";
    });
  }
  // Bearbeitungsschlüssel übertragen (F10): kopieren hier, „Schlüssel eingeben“ auf dem anderen Gerät
  $("teilen-schluessel-kopieren").addEventListener("click", async () => {
    const s = teilenGeteilt && teilenGeteilt.schluessel;
    if (!s) return;
    const ok = await kopiere(s);
    $("teilen-schluessel-kopieren").textContent = ok ? "Schlüssel kopiert ✓" : "Kopieren nicht möglich";
    if (ok) toast("Bearbeitungsschlüssel kopiert – füge ihn auf dem anderen Gerät unter „Teilen“ → „Schlüssel eingeben“ ein.", "ok");
  });
  $("teilen-schluessel-eingeben").addEventListener("click", () => {
    $("teilen-schluessel-feld").value = "";
    $("teilen-schluessel-fehler").hidden = true;
    teilenSchritt("schluessel");
    $("teilen-schluessel-feld").focus();
  });
  $("teilen-schluessel-zurueck").addEventListener("click", frageZeigen);
  async function schluesselUebernehmen() {
    const s = pruefeSchluessel($("teilen-schluessel-feld").value);
    if (!s) {
      $("teilen-schluessel-fehler").textContent = "Das ist kein Bearbeitungsschlüssel (43 Zeichen aus A–Z, a–z, 0–9, - und _).";
      $("teilen-schluessel-fehler").hidden = false;
      return;
    }
    const l = linkVon(projekte.aktiv);
    if (!l) { frageZeigen(); return; }
    // nicht vorab geprüft (§4.4): passt er nicht, meldet die nächste neue Version 403
    await projekte.setzeTeilen({ id: l.id, version: l.version, schluessel: s });
    toast("Schlüssel übernommen – du kannst jetzt neue Versionen dieses Links teilen.", "ok");
    frageZeigen();
  }
  $("teilen-schluessel-ok").addEventListener("click", schluesselUebernehmen);
  $("teilen-schluessel-feld").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); schluesselUebernehmen(); } });
  $("teilen-loeschen").addEventListener("click", async () => {
    const t = teilenGeteilt;
    if (!t || !t.schluessel) return;
    const ok = await frage("Link löschen?", "Der Link und alle seine Versionen werden vom Server gelöscht. Wer ihn hat, kann das Projekt danach nicht mehr öffnen. Dein Projekt hier bleibt erhalten.", "Link löschen");
    if (!ok) return;
    try {
      await loescheLink(teilenOpt, t.id, t.schluessel);
      if (teilenProjektId) await projekte.setzeTeilen(null, teilenProjektId);
      teilenGeteilt = null;
      if (teilenDlg.open) teilenDlg.close();
      try { if (linkAusHash(location.hash)) { history.replaceState(null, "", location.pathname + location.search); letzterHash = location.hash; } } catch (e) { /* egal */ }
      toast("Link gelöscht.", "ok");
    } catch (e) {
      toast(e instanceof TeilenFehler ? e.message : "Der Link kann gerade nicht gelöscht werden.", "fehler");
    }
  });

  // Neuere Version eines eigenen Links (§3.5): Hinweis im Seitenbanner, „Laden“ ersetzt die Dateien des Projekts
  const teilenBanner = $("teilen-banner");
  let bannerLaden = null;
  function zeigeTeilenBanner(text, laden) {
    $("teilen-banner-text").textContent = text;
    bannerLaden = laden;
    teilenBanner.hidden = false;
  }
  $("teilen-banner-zu").addEventListener("click", () => { teilenBanner.hidden = true; bannerLaden = null; });
  $("teilen-banner-laden").addEventListener("click", async () => {
    const f = bannerLaden;
    teilenBanner.hidden = true;
    bannerLaden = null;
    if (f) await f();
  });
  projekte.an("wechsel", () => { teilenBanner.hidden = true; bannerLaden = null; });

  // Geteilte Links (#h=<id>[@n]) öffnen das Projekt als lokale Kopie (quelle teilen:<id>@<n>) bzw. das eigene Projekt
  let letzterHash = location.hash;
  async function hashLaden() {
    const h = linkAusHash(location.hash);
    if (!h || h.art !== "h") return false;
    if (h.link && h.link.alt) { toast(ALT_TEXT, "fehler"); return false; }
    if (!h.link) { toast("Dieser geteilte Link ist ungültig.", "fehler"); return false; }
    const { id, version } = h.link;
    try {
      // Eigenes Projekt mit Schlüssel (§3.5): dieses fokussieren, nicht kopieren
      const eigen = version == null ? projekte.liste().find((p) => p.teilen && p.teilen.id === id && p.teilen.schluessel) : null;
      if (eigen) {
        await projekte.wechsle(eigen.id);
        const kopf = await holeLink(teilenOpt, id).catch((e) => e);
        if (kopf instanceof TeilenFehler && kopf.art === "weg") {
          await projekte.setzeTeilen(null, eigen.id);
          toast("Der Link ist abgelaufen oder gelöscht.", "info");
        } else if (!(kopf instanceof Error) && kopf.version > (eigen.teilen.version || 0)) {
          zeigeTeilenBanner("Auf dem Server gibt es eine neuere Version (v" + kopf.version + ") dieses Projekts – laden?", async () => {
            try {
              const g = await ladeGeteilt(teilenOpt, id, kopf.version);
              if (projekte.aktiv.id !== eigen.id) await projekte.wechsle(eigen.id);
              await projekte.ersetzeDateien(ohneErzeugteProjektdatei(g.dateien, g), { hauptdatei: g.hauptdatei });
              await projekte.setzeTeilen({ ...projekte.aktiv.teilen, version: g.version });
              toast("Version v" + g.version + " geladen.", "ok");
            } catch (e) { toast(e instanceof TeilenFehler ? e.message : "Die neuere Version kann gerade nicht geladen werden.", "fehler"); }
          });
        }
        return "eigen";
      }
      const g = await ladeGeteilt(teilenOpt, id, version);
      const dateien = ohneErzeugteProjektdatei(g.dateien, g);
      await oeffneAlsProjekt(dateien, g.name, teilenQuelle(id, g.version), { hauptdatei: g.hauptdatei, teilen: { id, version: g.version } });
      return true;
    } catch (e) {
      if (e instanceof TeilenFehler) toast(e.art === "weg" ? "Diesen geteilten Code gibt es nicht (mehr)." : e.message, "fehler");
      else { console.error(e); toast("Der geteilte Code kann gerade nicht geladen werden.", "fehler"); }
      return false;
    }
  }
  const nachHashLaden = (ok) => {
    if (ok === "eigen") toast("Dein geteiltes Projekt ist geöffnet.", "ok");
    else if (ok) toast("Geteilter Code als Projekt geöffnet.", "ok");
  };
  window.addEventListener("hashchange", () => {
    if (location.hash === letzterHash) return;
    // App-Link (z. B. per Zurück-Taste): Seite neu laden – der App-Modus entscheidet sich vor dem ersten Zeichnen (thema.js)
    const h = linkAusHash(location.hash);
    if (h && h.art === "app") { location.reload(); return; }
    letzterHash = location.hash;
    hashLaden().then(nachHashLaden);
  });
  hashLaden().then(nachHashLaden);

  // ---------- Befehlspalette ----------
  const motorNamen = { auto: "Auto (Wasm)", wasm: "Wasm", interpreter: "Interpreter" };
  function setzeMotor(m) {
    motorWahl.value = m;
    motorWahl.dispatchEvent(new Event("change"));
  }
  function zeigeDoku(id) {
    setzePanel(true, { fokus: false });
    waehleTab("doku", false);
    requestAnimationFrame(() => dokuPanel.springe(id, true));
  }
  const IST_MAC = /Mac|iPhone|iPad/.test(navigator.platform || "");
  const K = (s) => (IST_MAC ? s.replace(/Strg\+/g, "⌘").replace(/Alt\+/g, "⌥").replace(/Shift\+/g, "⇧") : s);
  const palette = erstellePalette({
    befehle: () => [
      { id: "backen", icon: "play",  gruppe: "Ofen", titel: "Backen (Programm ausführen)", kuerzel: K("Strg+Enter"), aktion: backen, verfuegbar: () => !ausfuehrung.laeuft },
      { id: "abbrechen", icon: "stop",  gruppe: "Ofen", titel: "Lauf abbrechen", kuerzel: "Esc", aktion: () => ausfuehrung.abbrechen(), verfuegbar: () => ausfuehrung.laeuft },
      ...Object.entries(motorNamen).map(([m, n]) => ({ id: "motor-" + m, icon: m === "interpreter" ? "cpu" : "zap", gruppe: "Motor", titel: n + (motorWahl.value === m ? " (aktiv)" : ""), aktion: () => setzeMotor(m), verfuegbar: () => m !== "wasm" || !optWasm.disabled })),
      { id: "exe", icon: "monitor",  gruppe: "Ofen", titel: "Als Programm herunterladen (.exe / Linux) …", aktion: () => exe.oeffnen() },
      { id: "pkarton", icon: "package",  gruppe: "Ofen", titel: "Als .pkarton (WebAssembly) herunterladen", aktion: () => $("knopf-pkarton").click(), verfuegbar: () => !$("knopf-pkarton").hidden },
      { id: "konsole-leeren", icon: "trash",  gruppe: "Konsole", titel: "Konsole leeren", aktion: () => $("konsole-leeren").click() },
      { id: "konsole-toggle", icon: "terminal",  gruppe: "Konsole", titel: "Konsole ein-/ausklappen", aktion: () => $("konsole-toggle").click() },
      { id: "projekt-neu", icon: "plus", gruppe: "Projekt", titel: "Neues Projekt", kuerzel: K("Strg+Alt+N"), aktion: neuesProjekt },
      { id: "projekt-oeffnen", icon: "folderOpen", gruppe: "Projekt", titel: "Projekt öffnen …", aktion: () => projektmenue.oeffnen() },
      { id: "projekt-umbenennen", icon: "pencil", gruppe: "Projekt", titel: "Projekt umbenennen …", aktion: () => projektmenue.umbenennen() },
      { id: "projekt-duplizieren", icon: "copy", gruppe: "Projekt", titel: "Projekt duplizieren", aktion: () => projektmenue.dupliziere() },
      { id: "projekt-loeschen", icon: "trash", gruppe: "Projekt", titel: "Projekt löschen …", aktion: () => projektmenue.loeschen() },
      { id: "projekt-zip", icon: "archive", gruppe: "Projekt", titel: "Projekt als ZIP herunterladen", aktion: () => projektmenue.zipExport() },
      { id: "projekt-zip-import", icon: "upload", gruppe: "Projekt", titel: "ZIP importieren …", aktion: () => projektmenue.zipDialog() },
      ...projekte.liste().filter((p) => p.id !== projekte.aktiv.id).map((p) => ({ id: "projekt-zu-" + p.id, icon: "folder", gruppe: "Projekt wechseln", titel: p.name, aktion: () => projekte.wechsle(p.id) })),
      { id: "datei-neu", icon: "filePlus", gruppe: "Dateien", titel: "Neue Datei …", aktion: () => baum.neueDatei("") },
      { id: "ordner-neu", icon: "folderPlus", gruppe: "Dateien", titel: "Neuer Ordner …", aktion: () => baum.neuerOrdner("") },
      { id: "datei-oeffnen", icon: "upload", gruppe: "Dateien", titel: "Dateien hinzufügen (Bilder, Texte, .pizza, ZIP) …", kuerzel: K("Strg+O"), aktion: () => baum.dateiDialog("") },
      { id: "dateibaum", icon: "files", gruppe: "Ansicht", titel: "Dateibaum ein-/ausblenden", aktion: () => baum.umschalten() },
      { id: "tab-schliessen", icon: "x",  gruppe: "Tabs", titel: "Tab schließen", kuerzel: K("Alt+W"), aktion: () => tabs.schliesseAktiven() },
      { id: "tabs-andere", icon: "closeOthers",  gruppe: "Tabs", titel: "Andere Tabs schließen", aktion: () => tabs.schliesseAndere() },
      { id: "tabs-rechts", icon: "closeRight",  gruppe: "Tabs", titel: "Tabs rechts davon schließen", aktion: () => tabs.schliesseRechts() },
      { id: "tab-wiederherstellen", icon: "restore",  gruppe: "Tabs", titel: "Geschlossenen Tab wiederherstellen", kuerzel: K("Alt+Shift+T"), aktion: () => tabs.wiederherstellen(0), verfuegbar: () => tabs.geschlossen.length > 0 },
      { id: "tab-anheften", icon: "pin",  gruppe: "Tabs", titel: tabs.liste.some((t) => t.aktiv && t.angeheftet) ? "Tab lösen" : "Tab anheften", aktion: () => tabs.anheften() },
      { id: "tab-umbenennen", icon: "pencil",  gruppe: "Tabs", titel: "Datei umbenennen", kuerzel: "F2", aktion: () => tabs.umbenennen() },
      { id: "tab-hauptdatei", icon: "star", gruppe: "Tabs", titel: "Aktive Datei als Hauptdatei", aktion: () => { const f = projekte.setzeHauptdatei(tabs.aktivPfad); toast(f || "„" + tabs.aktivPfad + "“ ist jetzt die Hauptdatei.", f ? "fehler" : "ok"); }, verfuegbar: () => /\.pizza$/.test(tabs.aktivPfad || "") && tabs.aktivPfad !== projekte.aktiv.hauptdatei },
      { id: "tab-download", icon: "download",  gruppe: "Tabs", titel: "Datei herunterladen", aktion: () => tabs.herunterladen() },
      { id: "tab-speichern", icon: "saved",  gruppe: "Tabs", titel: "Datei lokal speichern", kuerzel: K("Strg+S"), aktion: speichern },
      { id: "tab-naechster", icon: "chevronRight",  gruppe: "Tabs", titel: "Nächster Tab", kuerzel: K("Alt+Bild↓"), aktion: () => tabs.naechster(1) },
      { id: "tab-voriger", gruppe: "Tabs", titel: "Vorheriger Tab", kuerzel: K("Alt+Bild↑"), aktion: () => tabs.naechster(-1) },
      { id: "tabs-liste", icon: "chevronDown",  gruppe: "Tabs", titel: "Alle Tabs anzeigen …", aktion: () => tabs.alleTabsMenue() },
      ...projekte.pfade().filter((p) => p !== tabs.aktivPfad).map((p) => ({ id: "datei-zu-" + p, icon: "file", gruppe: "Datei öffnen", titel: p, aktion: () => tabs.oeffneDatei(p) })),
      ...vorratNamen(vorratPraefix(projekte.aktiv)).map((n) => ({ id: "vorrat-" + n, icon: "trash", gruppe: "Vorrat", titel: "Vorrat löschen: " + n, aktion: () => vorratLoeschen(n) })),
      { id: "vorrat-alle", icon: "trash", gruppe: "Vorrat", titel: "Alle Vorräte löschen", aktion: () => vorratLoeschen(null), verfuegbar: () => vorratNamen(vorratPraefix(projekte.aktiv)).length > 0 },
      { id: "argumente", icon: "terminal", gruppe: "Ofen", titel: "Argumente für hauptgang(args) bearbeiten", aktion: () => laufOptionenOeffnen(true) },
      { id: "feste-saat", icon: "sliders", gruppe: "Ofen", titel: "Feste Saat 42 " + (document.getElementById("feste-saat").checked ? "ausschalten" : "einschalten"), aktion: () => { const b = $("feste-saat"); b.checked = !b.checked; b.dispatchEvent(new Event("change")); toast(b.checked ? "Feste Saat 42 ist an." : "Jeder Lauf bekommt wieder eine echte Zufallssaat.", "info"); } },
      { id: "teilen", icon: "share",  gruppe: "Teilen", titel: "Projekt teilen …", aktion: () => $("knopf-teilen").click() },
      { id: "panel", icon: "panel",  gruppe: "Ansicht", titel: "Seitenpanel ein-/ausblenden", kuerzel: K("Strg+B"), aktion: panelUmschalten },
      { id: "doku", icon: "book",  gruppe: "Ansicht", titel: "Doku anzeigen", aktion: () => { setzePanel(true); waehleTab("doku", true); } },
      { id: "beispiele", icon: "pizza",  gruppe: "Ansicht", titel: "Beispiele anzeigen", aktion: () => { setzePanel(true); waehleTab("beispiele", true); } },
      { id: "lesemodus", icon: "maximize",  gruppe: "Ansicht", titel: "Doku im Lesemodus öffnen", aktion: lesemodusOeffnen },
      { id: "thema", icon: document.documentElement.dataset.theme === "dark" ? "sun" : "moon", gruppe: "Ansicht", titel: document.documentElement.dataset.theme === "dark" ? "Helles Thema" : "Dunkles Thema", aktion: () => themaKnopf.click() },
      { id: "thema-system", icon: "monitor", gruppe: "Ansicht", titel: "Thema wie das System", aktion: themaWieSystem, verfuegbar: () => speicher.hole("pizza.thema") != null },
      { id: "suchen", icon: "search",  gruppe: "Editor", titel: "Im Code suchen", kuerzel: K("Strg+F"), aktion: () => { editor.view.focus(); editor.suchen(); } },
      ...beispiele.liste.map((b) => ({ id: "bsp-" + b.id, gruppe: "Beispiel öffnen", titel: b.titel + " · " + b.kategorie, aktion: () => b.oeffnen() })),
      ...doku.abschnitte.map((a) => ({ id: "doku-" + a.id, gruppe: "Doku", titel: a.titel + " · " + a.gruppe, aktion: () => zeigeDoku(a.id) })),
    ],
  });
  function paletteOeffnen() {
    beispiele.laden(); // Beispiele für die Suche nachladen (einmalig)
    palette.oeffnen();
  }
  $("knopf-palette").addEventListener("click", paletteOeffnen);

  // ---------- Dateien per Drag & Drop in den Editor: ins aktive Projekt (wie „Dateien hinzufügen“) ----------
  const werkbankEl = document.querySelector(".werkbank");
  let ziehZaehler = 0;
  // Ablegen auf dem Dateibaum regelt dateibaum.js selbst (Zielordner)
  const hatDateien = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files") && !(e.target && e.target.closest && e.target.closest("#dateibaum"));
  werkbankEl.addEventListener("dragenter", (e) => { if (!hatDateien(e)) return; e.preventDefault(); ziehZaehler++; werkbankEl.classList.add("datei-ziel"); });
  werkbankEl.addEventListener("dragover", (e) => { if (!hatDateien(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  werkbankEl.addEventListener("dragleave", (e) => { if (!hatDateien(e)) return; if (--ziehZaehler <= 0) { ziehZaehler = 0; werkbankEl.classList.remove("datei-ziel"); } });
  werkbankEl.addEventListener("drop", (e) => {
    if (!hatDateien(e)) return;
    e.preventDefault();
    e.stopPropagation();
    ziehZaehler = 0;
    werkbankEl.classList.remove("datei-ziel");
    baum.hinzufuegen(e.dataTransfer.files, "");   // ins aktive Projekt; ZIP-Dateien werden als eigenes Projekt importiert
  }, true);

  // ---------- Tastenkürzel (Capture: vor CodeMirror) ----------
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const taste = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const stopp = () => { e.preventDefault(); e.stopPropagation(); };
    if (palette.offen) return;
    // Befehlspalette
    if (taste === "F1" || (mod && e.shiftKey && taste === "p")) { stopp(); paletteOeffnen(); return; }
    if (document.querySelector("dialog[open]")) return;
    if (mod && !e.shiftKey && taste === "Enter") { stopp(); backen(); return; }
    if (mod && !e.shiftKey && !e.altKey && taste === "s") { stopp(); speichern(); return; }
    if (mod && !e.shiftKey && !e.altKey && taste === "b") { stopp(); panelUmschalten(); return; }
    if (mod && !e.shiftKey && !e.altKey && taste === "o") { stopp(); baum.dateiDialog(""); return; }
    // Projekte & Tabs
    if (mod && e.altKey && taste === "n") { stopp(); neuesProjekt(); return; }
    if (e.altKey && !mod && taste === "n") { stopp(); neuesProjekt(); return; }
    if (e.altKey && !mod && !e.shiftKey && taste === "w") { stopp(); tabs.schliesseAktiven(); return; }
    if (e.altKey && e.shiftKey && !mod && taste === "t") { stopp(); tabs.wiederherstellen(0); return; }
    if (mod && e.shiftKey && taste === "t") { stopp(); tabs.wiederherstellen(0); return; } // wo der Browser es zulässt
    if (mod && taste === "Tab") { stopp(); tabs.naechster(e.shiftKey ? -1 : 1); return; } // wo der Browser es zulässt
    if ((mod || e.altKey) && taste === "PageDown") { stopp(); tabs.naechster(1); return; }
    if ((mod || e.altKey) && taste === "PageUp") { stopp(); tabs.naechster(-1); return; }
    if (e.key === "Escape") {
      if (e.target && e.target.closest && e.target.closest("#vorschau")) return; // Esc im Theke-Fenster: nichts tun
      if (ausfuehrung.laeuft) { e.preventDefault(); ausfuehrung.abbrechen(); return; }
      if (schmal.matches && panelOffen) { e.preventDefault(); setzePanel(false); }
    }
  }, true);

  // Wenn der Interpreter fehlt: freundlicher Hinweis
  if (!PL) {
    $("editor-status").textContent = "Interpreter nicht geladen – keine Live-Diagnose";
    $("editor-status").classList.add("warnung");
  }

  window.addEventListener("pagehide", () => projekte.sofortSpeichern());
  document.addEventListener("visibilitychange", () => { if (document.hidden) projekte.sofortSpeichern(); });
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

// App-Link (#app=<id>[@n]): js/thema.js hat data-app gesetzt → nur die App starten, kein Editor (app.js)
function los() {
  const key = document.documentElement.dataset.app;
  if (key) { startApp(key); return; }
  // Doku-Daten lädt js/thema.js parallel nach (nicht im App-Modus); start() braucht sie schon (Doku-Panel, Palette)
  Promise.resolve(window.pizzaDokuGeladen).then(start);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", los);
else los();
