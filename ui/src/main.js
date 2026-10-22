// pizza v3.1 Playground – Einstieg.
import { erstelleEditor } from "./editor.js";
import { erstelleKonsole } from "./konsole.js";
import { erstelleAusfuehrung, workerAuftrag, interaktivMoeglich, ladeMotoren } from "./ausfuehrung.js";
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
import { verpacke, entpacke } from "./teilen.js";
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
function frage(titel, text, ja = "Ersetzen") {
  const dlg = $("dialog-frage");
  if (typeof dlg.showModal !== "function") return Promise.resolve(window.confirm(text));
  const naechste = frageKette.then(() => new Promise((resolve) => {
    $("dialog-titel").textContent = titel;
    $("dialog-text").textContent = text;
    $("dialog-ja").textContent = ja;
    const jaKnopf = $("dialog-ja");
    const neinKnopf = dlg.querySelector('button[value="nein"]');
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
    beiWechsel(t) { const f = document.getElementById("args"); if (f && t) { f.value = t.args || ""; f.dispatchEvent(new Event("lauf-punkt")); } },
    beiTeilen: () => $("knopf-teilen").click(),
    beiExe: () => exeDialogOeffnen(),
    toast,
  });
  tabs.laden();
  // Herd: Komponenten, Felder, Teil-Methoden, Grundformen und Palette aus site/js/herd/schema.json für Vervollständigung und
  // Hervorhebung (HERD.md §3.3) – eine neue Komponente im Kern erscheint ohne Änderung an der UI
  ladeHerdSchema().then((s) => { if (herdSchemaErgaenzen(s)) editor.neuHervorheben(); });

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

  // ---------- .pkarton (WebAssembly) herunterladen ----------
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

  // ---------- Als Programm (EXE) herunterladen ----------
  // Ablauf: Worker kompiliert → .pkarton → PizzaExe.baue(pkarton, ziel) → Blob → Download.
  // js/exe.js wird erst bei Bedarf geladen; solange Compiler oder Host-Programme fehlen, ist der Knopf deaktiviert (mit Grund).
  const knopfExe = $("knopf-exe");
  const exeDlg = $("dialog-exe");
  let exeLaden = null, exeZiele = null, exeGrund = "Wird geprüft …", exeBeschaeftigt = false;
  const IST_WINDOWS = /Windows|Win32|Win64/i.test(navigator.userAgent || "") || /^Win/i.test(navigator.platform || "");
  const zielId = (z) => String(typeof z === "string" ? z : z && (z.id || z.name || z.ziel) || "");
  const zielName = (z) => String(typeof z === "string" ? z : z && (z.titel || z.name || z.label || z.id) || "?");
  const zielEndung = (z) => {
    const e = z && typeof z === "object" && (z.endung || z.erweiterung || z.suffix);
    if (typeof e === "string") return e && !e.startsWith(".") ? "." + e : e;
    return /win/i.test(zielId(z)) ? ".exe" : "";
  };
  function ladeExeSkript() {
    if (exeLaden) return exeLaden;
    exeLaden = new Promise((resolve) => {
      if (window.PizzaExe) { resolve(window.PizzaExe); return; }
      const s = document.createElement("script");
      s.src = "js/exe.js";
      s.onload = () => resolve(window.PizzaExe || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    }).then(async (PE) => {
      if (!PE || typeof PE.baue !== "function") { exeGrund = "Der Programm-Bauer (js/exe.js) ist noch nicht verfügbar."; return null; }
      try {
        const z = await (typeof PE.ziele === "function" ? PE.ziele() : []);
        const liste = Array.isArray(z) ? z : (z && Array.isArray(z.ziele) ? z.ziele : []);
        exeZiele = liste.filter((x) => x && zielId(x) && x.verfuegbar !== false);
      } catch (e) { exeZiele = []; }
      if (!exeZiele.length) { exeGrund = "Die Host-Programme fehlen noch auf dem Server."; return null; }
      return PE;
    });
    return exeLaden;
  }
  function wendeExeAn() {
    const compiler = !!(faehigkeiten && faehigkeiten.wasm);
    let grund = null;
    if (!faehigkeiten) grund = "Wird geprüft …";
    else if (!compiler) grund = "Der Wasm-Compiler ist noch nicht verfügbar" + (faehigkeiten.grund ? " (" + faehigkeiten.grund + ")" : "") + ".";
    else if (!exeMoeglich) grund = exeGrund;
    else if (exeZiele && !exeZiele.length) grund = exeGrund; // Ziele schon geladen, aber leer
    knopfExe.setAttribute("aria-disabled", String(!!grund));
    knopfExe.classList.toggle("deaktiviert", !!grund);
    knopfExe.title = grund ? "Als Programm herunterladen – noch nicht möglich: " + grund : "Als Programm (z. B. Windows-.exe) herunterladen";
    knopfExe.dataset.grund = grund || "";
    return grund;
  }
  // js/exe.js und bin/ziele.json werden erst beim Öffnen des Dialogs geladen (keine Anfragen beim Seitenstart).
  let exeMoeglich = false;
  async function pruefeExe() {
    await (pruefungLaeuft || Promise.resolve(faehigkeiten));
    const mo = await holeMotoren();
    exeMoeglich = mo.exe;
    if (!mo.exe) exeGrund = "Die Host-Programme für Windows/Linux werden noch gebaut.";
    return wendeExeAn();
  }
  wendeExeAn();
  pruefeExe();

  function exeStatus(schritt, text) {
    $("exe-status").hidden = schritt == null;
    $("exe-fortschritt").value = schritt || 0;
    $("exe-status-text").textContent = text || "";
  }
  function exeFehler(text) {
    $("exe-fehler").hidden = !text;
    $("exe-fehler").textContent = text || "";
  }
  // Voraussetzung der gewählten Plattform sichtbar unter der Auswahl; Installationsbefehle als <code>.
  function exeVoraussetzungZeigen(ziel) {
    const p = $("exe-voraussetzung");
    const text = ziel && ziel.voraussetzung ? String(ziel.voraussetzung) : "";
    p.replaceChildren();
    p.hidden = !text;
    if (!text) return;
    const b = document.createElement("strong");
    b.textContent = "Voraussetzung: ";
    p.appendChild(b);
    text.split(/((?:sudo )?(?:apt|apt-get|dnf|pacman|zypper) [^,;)]+)/).forEach((teil, i) => {
      if (!teil) return;
      if (i % 2) { const k = document.createElement("code"); k.textContent = teil.trim(); p.appendChild(k); }
      else p.appendChild(document.createTextNode(teil));
    });
  }
  async function exeDialogOeffnen() {
    if (exeBeschaeftigt) return;
    let grund = wendeExeAn();
    if (grund && faehigkeiten) { grund = await pruefeExe(); } // vielleicht inzwischen verfügbar
    if (grund) { toast("Als Programm herunterladen geht noch nicht: " + grund, "fehler"); return; }
    if (!exeZiele || !exeZiele.length) {
      knopfExe.classList.add("laedt");
      const PE = await ladeExeSkript();
      knopfExe.classList.remove("laedt");
      if (!PE) { exeLaden = null; wendeExeAn(); toast("Als Programm herunterladen geht gerade nicht: " + exeGrund, "fehler"); return; }
    }
    const t = tabs.aktiv();
    $("exe-tabname").textContent = "„" + ((t && t.name) || "unbenannt.pizza") + "“";
    const feld = $("exe-ziele");
    feld.querySelectorAll("label").forEach((l) => l.remove());
    const gemerkt = speicher.hole("pizza.exeZiel");
    const vorwahl = exeZiele.find((z) => zielId(z) === gemerkt) ||
      exeZiele.find((z) => (IST_WINDOWS ? /win/i : /linux/i).test(zielId(z) + " " + zielName(z))) || exeZiele[0];
    for (const z of exeZiele) {
      const l = document.createElement("label");
      l.className = "exe-ziel";
      const r = document.createElement("input");
      r.type = "radio";
      r.name = "exe-ziel";
      r.value = zielId(z);
      r.checked = z === vorwahl;
      r.dataset.testid = "exe-ziel";
      r.addEventListener("change", () => { if (r.checked) exeVoraussetzungZeigen(z); });
      l.appendChild(r);
      const n = document.createElement("span");
      n.textContent = zielName(z);
      l.appendChild(n);
      const e = zielEndung(z);
      if (e) { const k = document.createElement("code"); k.textContent = e; l.appendChild(k); }
      feld.appendChild(l);
    }
    exeVoraussetzungZeigen(vorwahl);
    exeStatus(null); exeFehler(null);
    $("exe-hinweise").open = false;
    $("exe-los").disabled = false;
    if (typeof exeDlg.showModal === "function") exeDlg.showModal(); else exeDlg.setAttribute("open", "");
    $("exe-los").focus();
  }
  async function exeBauen() {
    if (exeBeschaeftigt) return;
    const gewaehlt = exeDlg.querySelector('input[name="exe-ziel"]:checked');
    const ziel = exeZiele.find((z) => zielId(z) === (gewaehlt && gewaehlt.value)) || exeZiele[0];
    speicher.setze("pizza.exeZiel", zielId(ziel));
    const t = tabs.aktiv();
    const basis = ((t && t.name) || "programm.pizza").replace(/\.pizza$/i, "").replace(/[\\/:*?"<>|]+/g, "-") || "programm";
    const PEvorab = window.PizzaExe;
    const dateiname = PEvorab && typeof PEvorab.dateiname === "function" ? PEvorab.dateiname((t && t.name) || "programm", ziel) : basis + zielEndung(ziel);
    exeBeschaeftigt = true;
    $("exe-los").disabled = true;
    exeFehler(null);
    try {
      exeStatus(1, "1/3 · Code wird zu WebAssembly gebacken …");
      const r = await workerAuftrag({ typ: "kompiliere", code: editor.text() }, "pkarton", 30_000);
      if (!r || !r.ok) {
        let grund = (r && r.grund) || "Kompilieren nicht möglich.";
        if (r && r.fehler) grund = "Syntaxfehler" + (r.fehler.zeile ? " in Zeile " + r.fehler.zeile : "") + ": " + r.fehler.text;
        else if (r && Array.isArray(r.nichtUnterstuetzt) && r.nichtUnterstuetzt.length) {
          grund = "Dieses Programm lässt sich noch nicht als Programm backen – " +
            r.nichtUnterstuetzt.slice(0, 3).map((n) => (n.zeile ? "Zeile " + n.zeile + ": " : "") + n.grund).join("; ") + ".";
        }
        throw new Error(grund);
      }
      exeStatus(2, "2/3 · Programm für " + zielName(ziel) + " wird verpackt …");
      const PE = await ladeExeSkript();
      if (!PE) throw new Error(exeGrund);
      let blob;
      try { blob = await PE.baue(r.daten, ziel); }
      catch (e) { throw new Error("Das Programm konnte nicht verpackt werden: " + (e && e.message ? e.message : String(e)) + " (fehlen die Host-Programme unter bin/?)"); }
      if (!(blob instanceof Blob)) blob = new Blob([blob], { type: "application/octet-stream" });
      exeStatus(3, "3/3 · Fertig – „" + dateiname + "“ (" + new Intl.NumberFormat("de-DE").format(Math.round(blob.size / 1024)) + " KB) wird heruntergeladen.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = dateiname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      $("exe-chmod").textContent = "chmod +x " + dateiname + " && ./" + dateiname;
      $("exe-hinweise").open = true;
    } catch (e) {
      exeStatus(null);
      exeFehler(e && e.message ? e.message : String(e));
    } finally {
      exeBeschaeftigt = false;
      $("exe-los").disabled = false;
    }
  }
  knopfExe.addEventListener("click", exeDialogOeffnen);
  $("exe-los").addEventListener("click", exeBauen);
  $("exe-abbrechen").addEventListener("click", () => exeDlg.close());
  exeDlg.addEventListener("cancel", (e) => { if (exeBeschaeftigt) e.preventDefault(); });
  knopfPkarton.addEventListener("click", () => { if (exeDlg.open) exeDlg.close(); }, true);

  // ---------- Lauf-Einstellungen (Popover in der Konsolenleiste): Argumente pro Tab, feste Saat ----------
  const argsFeld = $("args");
  const laufKnopf = $("knopf-lauf-optionen");
  const laufPopover = $("lauf-popover");
  { const h = ARGUMENTE_HILFE.replace(/^Argumente für hauptgang\(args\) – /, ""); $("args-hilfe").textContent = h.charAt(0).toUpperCase() + h.slice(1); }
  argsFeld.value = (tabs.aktiv() && tabs.aktiv().args) || "";
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
  argsFeld.addEventListener("input", () => { tabs.setzeArgs(argsFeld.value); laufPunkt(); });
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
    const praefix = vorratPraefix(tabs.aktiv());
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
    const t = tabs.aktiv();
    const code = editor.text();
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
    laufTabId = t ? t.id : null;
    laufName = t ? t.name : "";
    const saat = neueSaat();
    laufVorratPraefix = vorratPraefix(t);
    const vorratAktiv = vorratVerfuegbar();
    ausfuehrung.starte(code, zerlegeArgumente(t ? t.args : ""), motor, {
      pizzaiolo: !!(faehigkeiten && faehigkeiten.wasm),
      pizzaioloGrund: faehigkeiten && faehigkeiten.grund,
      zufallsSaat: saat,
      vorrat: vorratAktiv ? vorratLaden(laufVorratPraefix) : undefined,
      vorratAktiv,
      koeche: koecheFuerLauf(leseKoeche()),
      ...(herdLauf ? herdLauf.extra : {}),
    });
    herd.lauf(herdLauf && herdLauf.kontext);
    konsole.saat(saat);
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

  // ---------- Teilen: Links über unseren Server – Code öffnen (#h=<key>) und App starten (#app=<key>, app.js) ----------
  const teilenDlg = $("dialog-teilen");
  let teilenCode = "", teilenName = "";
  function teilenSchritt(name) {
    teilenDlg.querySelectorAll(".teilen-schritt").forEach((s) => { s.hidden = s.dataset.schritt !== name; });
  }
  async function kopiere(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
  }
  // /api/konfig: nur das Feld „teilen“ (bool) zählt
  let konfigVersprechen = null;
  function holeKonfig() {
    if (!konfigVersprechen) {
      konfigVersprechen = fetch("api/konfig", { headers: { Accept: "application/json" } })
        .then((r) => (r.ok ? r.json() : null))
        .then((k) => ({
          teilen: !(k && k.teilen === false),
          tage: k && typeof k.aufbewahrungTage === "number" && Number.isFinite(k.aufbewahrungTage) && k.aufbewahrungTage >= 0 ? k.aufbewahrungTage : null,
          ab: k && k.aufbewahrungAb === "letzter-abruf" ? "letzter-abruf" : "erstellung",
        }))
        .catch(() => ({ teilen: true, tage: null }));
    }
    return konfigVersprechen;
  }
  /** „Der Link funktioniert 90 Tage lang (bis 19.01.2027).“ – nur wenn der Server die Dauer nennt. */
  function dauerText(k) {
    if (!k || k.tage == null) return "";
    if (k.tage === 0) return "Der Link läuft nicht ab.";
    const zahl = k.tage.toLocaleString("de-DE", { maximumFractionDigits: 2 });
    const t = k.tage === 1 ? "1 Tag" : zahl + " Tage";
    if (k.ab === "letzter-abruf") return "Der Link funktioniert " + t + " nach dem letzten Öffnen.";
    const bis = new Date(Date.now() + k.tage * 86_400_000);
    return "Der Link funktioniert " + t + " lang (bis " + bis.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + ").";
  }
  function setzeDauer(k) {
    const text = dauerText(k);
    for (const id of ["teilen-dauer", "teilen-dauer-fertig"]) { $(id).textContent = text; $(id).hidden = !text; }
  }
  function setzeTeilenVerfuegbar(k) {
    setzeDauer(k);
    const aus = !!(k && k.teilen === false);
    const senden = $("teilen-senden");
    senden.disabled = aus;
    senden.title = aus ? "Teilen ist auf diesem Server gerade nicht eingerichtet." : "";
    $("teilen-aus").hidden = !aus;
  }
  async function linkErstellen() {
    teilenSchritt("laeuft");
    let fehler = null;
    try {
      const r = await fetch("api/teilen", { method: "POST", headers: { "Content-Type": "text/plain; charset=utf-8" }, body: verpacke(teilenName, teilenCode) });
      let daten = null;
      try { daten = await r.json(); } catch (e) { daten = null; }
      if (r.ok && daten && typeof daten.key === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(daten.key)) {
        const basis = location.href.split("#")[0];
        const url = basis + "#h=" + daten.key;
        try { history.replaceState(null, "", "#h=" + daten.key); } catch (e) { /* egal */ }
        letzterHash = location.hash;
        const appUrl = basis + "#app=" + daten.key;
        $("teilen-url").value = url;
        $("teilen-url-app").value = appUrl;
        $("teilen-kopieren").textContent = "Kopieren";
        setzeDauer(await holeKonfig());
        teilenSchritt("fertig");
        // Der App-Link ist der, den man meistens weitergibt → er landet automatisch in der Zwischenablage
        const ok = await kopiere(appUrl);
        $("teilen-kopieren-app").textContent = ok ? "Kopiert ✓" : "Kopieren";
        $("teilen-fertig-text").textContent = "„" + teilenName + "“ ist gespeichert." +
          (ok ? " Der App-Link ist schon in der Zwischenablage." : "") + " Jeder mit einem der Links kann den Code lesen.";
        $("teilen-url-app").focus();
        $("teilen-url-app").select();
        return;
      }
      if (r.status === 413) fehler = "Das Skript ist zu groß zum Teilen.";
      else if (r.status === 429) fehler = "Gerade gibt es zu viele Anfragen. Bitte versuch es gleich noch einmal.";
      else fehler = "Teilen ist gerade nicht möglich. Bitte versuch es später erneut.";
    } catch (e) {
      fehler = "Teilen ist gerade nicht möglich – keine Verbindung zum Server. Bitte versuch es später erneut.";
    }
    $("teilen-fehlertext").textContent = fehler;
    teilenSchritt("fehler");
    $("teilen-nochmal").focus();
  }
  $("knopf-teilen").addEventListener("click", () => {
    const t = tabs.aktiv();
    teilenCode = editor.text();
    teilenName = (t && t.name) || "unbenannt.pizza";
    $("teilen-tabname").textContent = "„" + teilenName + "“";
    holeKonfig().then(setzeTeilenVerfuegbar);
    teilenSchritt("frage");
    if (typeof teilenDlg.showModal !== "function") { teilenDlg.setAttribute("open", ""); return; }
    teilenDlg.showModal();
    $("teilen-abbrechen").focus();
  });
  $("teilen-senden").addEventListener("click", linkErstellen);
  $("teilen-nochmal").addEventListener("click", linkErstellen);
  $("teilen-abbrechen").addEventListener("click", () => teilenDlg.close());
  $("teilen-schliessen").addEventListener("click", () => teilenDlg.close());
  $("teilen-fehler-schliessen").addEventListener("click", () => teilenDlg.close());
  $("teilen-kopieren").addEventListener("click", async () => {
    const ok = await kopiere($("teilen-url").value);
    if (!ok) { $("teilen-url").select(); }
    $("teilen-kopieren").textContent = ok ? "Kopiert ✓" : "Bitte manuell kopieren";
  });
  $("teilen-kopieren-app").addEventListener("click", async () => {
    const ok = await kopiere($("teilen-url-app").value);
    if (!ok) { $("teilen-url-app").focus(); $("teilen-url-app").select(); }
    $("teilen-kopieren-app").textContent = ok ? "Kopiert ✓" : "Bitte manuell kopieren";
  });

  // Geteilte Links (#h=<key>) öffnen als neuer Tab
  let letzterHash = location.hash;
  async function hashLaden() {
    const h = /(?:^#|&)h=([A-Za-z0-9_-]{1,64})(?:&|$)/.exec(location.hash || "");
    if (!h) return false;
    const key = h[1];
    try {
      const r = await fetch("api/teilen/" + encodeURIComponent(key), { headers: { Accept: "text/plain" } });
      if (r.status === 404) { toast("Diesen geteilten Code gibt es nicht (mehr).", "fehler"); return false; }
      if (!r.ok) { toast("Der geteilte Code kann gerade nicht geladen werden. Bitte später erneut versuchen.", "fehler"); return false; }
      const { name, code } = entpacke(await r.text());
      tabs.oeffne(code, name || "Geteilt " + key + ".pizza", "geteilt:" + key);
      return true;
    } catch (e) {
      toast("Der geteilte Code kann gerade nicht geladen werden – keine Verbindung.", "fehler");
      return false;
    }
  }
  window.addEventListener("hashchange", () => {
    if (location.hash === letzterHash) return;
    // App-Link (z. B. per Zurück-Taste): Seite neu laden – der App-Modus entscheidet sich vor dem ersten Zeichnen (thema.js)
    if (/(?:^#|&)app=[A-Za-z0-9_-]{1,64}(?:&|$)/.test(location.hash)) { location.reload(); return; }
    letzterHash = location.hash;
    hashLaden().then((ok) => { if (ok) toast("Geteilter Code in neuem Tab geöffnet.", "ok"); });
  });
  hashLaden().then((ok) => { if (ok) toast("Geteilter Code in neuem Tab geöffnet.", "ok"); });

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
      { id: "exe", icon: "monitor",  gruppe: "Ofen", titel: "Als Programm herunterladen (.exe / Linux) …", aktion: exeDialogOeffnen },
      { id: "pkarton", icon: "package",  gruppe: "Ofen", titel: "Als .pkarton (WebAssembly) herunterladen", aktion: () => knopfPkarton.click(), verfuegbar: () => !knopfPkarton.hidden },
      { id: "konsole-leeren", icon: "trash",  gruppe: "Konsole", titel: "Konsole leeren", aktion: () => $("konsole-leeren").click() },
      { id: "konsole-toggle", icon: "terminal",  gruppe: "Konsole", titel: "Konsole ein-/ausklappen", aktion: () => $("konsole-toggle").click() },
      { id: "tab-neu", icon: "plus",  gruppe: "Tabs", titel: "Neuer Tab", kuerzel: K("Strg+Alt+N"), aktion: () => tabs.neu() },
      { id: "datei-oeffnen", icon: "folderOpen",  gruppe: "Tabs", titel: "Datei öffnen …", kuerzel: K("Strg+O"), aktion: () => tabs.dateiDialog() },
      { id: "tab-schliessen", icon: "x",  gruppe: "Tabs", titel: "Tab schließen", kuerzel: K("Alt+W"), aktion: () => tabs.schliesseAktiven() },
      { id: "tabs-andere", icon: "closeOthers",  gruppe: "Tabs", titel: "Andere Tabs schließen", aktion: () => tabs.schliesseAndere() },
      { id: "tabs-rechts", icon: "closeRight",  gruppe: "Tabs", titel: "Tabs rechts davon schließen", aktion: () => tabs.schliesseRechts() },
      { id: "tabs-gespeicherte", icon: "saved",  gruppe: "Tabs", titel: "Gespeicherte Tabs schließen", aktion: () => tabs.schliesseGespeicherte() },
      { id: "tabs-alle", icon: "closeAll",  gruppe: "Tabs", titel: "Alle Tabs schließen", aktion: () => tabs.schliesseAlle() },
      { id: "tab-wiederherstellen", icon: "restore",  gruppe: "Tabs", titel: "Geschlossenen Tab wiederherstellen", kuerzel: K("Alt+Shift+T"), aktion: () => tabs.wiederherstellen(0), verfuegbar: () => tabs.geschlossen.length > 0 },
      { id: "tab-duplizieren", icon: "copy",  gruppe: "Tabs", titel: "Tab duplizieren", aktion: () => tabs.dupliziere() },
      { id: "tab-anheften", icon: "pin",  gruppe: "Tabs", titel: (tabs.aktiv() && tabs.aktiv().angeheftet) ? "Tab lösen" : "Tab anheften", aktion: () => tabs.anheften() },
      { id: "tab-umbenennen", icon: "pencil",  gruppe: "Tabs", titel: "Tab umbenennen", kuerzel: "F2", aktion: () => tabs.umbenennen() },
      { id: "tab-download", icon: "download",  gruppe: "Tabs", titel: "Tab als .pizza herunterladen", aktion: () => tabs.herunterladen() },
      { id: "tab-speichern", icon: "saved",  gruppe: "Tabs", titel: "Tab lokal speichern", kuerzel: K("Strg+S"), aktion: speichern },
      { id: "tab-naechster", icon: "chevronRight",  gruppe: "Tabs", titel: "Nächster Tab", kuerzel: K("Alt+Bild↓"), aktion: () => tabs.naechster(1) },
      { id: "tab-voriger", gruppe: "Tabs", titel: "Vorheriger Tab", kuerzel: K("Alt+Bild↑"), aktion: () => tabs.naechster(-1) },
      { id: "tabs-liste", icon: "chevronDown",  gruppe: "Tabs", titel: "Alle Tabs anzeigen …", aktion: () => tabs.alleTabsMenue() },
      ...tabs.liste.filter((t) => !t.aktiv).map((t) => ({ id: "tab-zu-" + t.id, gruppe: "Wechseln zu", titel: t.name, aktion: () => tabs.wechsle(t.id) })),
      ...vorratNamen(vorratPraefix(tabs.aktiv())).map((n) => ({ id: "vorrat-" + n, icon: "trash", gruppe: "Vorrat", titel: "Vorrat löschen: " + n, aktion: () => vorratLoeschen(n) })),
      { id: "vorrat-alle", icon: "trash", gruppe: "Vorrat", titel: "Alle Vorräte löschen", aktion: () => vorratLoeschen(null), verfuegbar: () => vorratNamen(vorratPraefix(tabs.aktiv())).length > 0 },
      { id: "argumente", icon: "terminal", gruppe: "Ofen", titel: "Argumente für hauptgang(args) bearbeiten", aktion: () => laufOptionenOeffnen(true) },
      { id: "feste-saat", icon: "sliders", gruppe: "Ofen", titel: "Feste Saat 42 " + (document.getElementById("feste-saat").checked ? "ausschalten" : "einschalten"), aktion: () => { const b = $("feste-saat"); b.checked = !b.checked; b.dispatchEvent(new Event("change")); toast(b.checked ? "Feste Saat 42 ist an." : "Jeder Lauf bekommt wieder eine echte Zufallssaat.", "info"); } },
      { id: "teilen", icon: "share",  gruppe: "Teilen", titel: "Code teilen …", aktion: () => $("knopf-teilen").click() },
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

  // ---------- Dateien per Drag & Drop in den Editor ----------
  const werkbankEl = document.querySelector(".werkbank");
  let ziehZaehler = 0;
  const hatDateien = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  werkbankEl.addEventListener("dragenter", (e) => { if (!hatDateien(e)) return; e.preventDefault(); ziehZaehler++; werkbankEl.classList.add("datei-ziel"); });
  werkbankEl.addEventListener("dragover", (e) => { if (!hatDateien(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  werkbankEl.addEventListener("dragleave", (e) => { if (!hatDateien(e)) return; if (--ziehZaehler <= 0) { ziehZaehler = 0; werkbankEl.classList.remove("datei-ziel"); } });
  werkbankEl.addEventListener("drop", (e) => {
    if (!hatDateien(e)) return;
    e.preventDefault();
    e.stopPropagation();
    ziehZaehler = 0;
    werkbankEl.classList.remove("datei-ziel");
    tabs.oeffneDateien(e.dataTransfer.files);
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
    if (mod && !e.shiftKey && !e.altKey && taste === "o") { stopp(); tabs.dateiDialog(); return; }
    // Tabs
    if (mod && e.altKey && taste === "n") { stopp(); tabs.neu(); return; }
    if (e.altKey && !mod && taste === "n") { stopp(); tabs.neu(); return; }
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

// App-Link (#app=<key>): js/thema.js hat data-app gesetzt → nur die App starten, kein Editor (app.js)
function los() {
  const key = document.documentElement.dataset.app;
  if (key) { startApp(key); return; }
  // Doku-Daten lädt js/thema.js parallel nach (nicht im App-Modus); start() braucht sie schon (Doku-Panel, Palette)
  Promise.resolve(window.pizzaDokuGeladen).then(start);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", los);
else los();
