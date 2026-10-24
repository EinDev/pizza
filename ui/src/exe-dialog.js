// „Als Programm herunterladen“ (EXE/Linux) und „.pkarton herunterladen“ – aus main.js herausgelöst (PB1-Refactor).
// Ablauf: Worker kompiliert das PROJEKT (Nachricht „kompiliere“ mit projekt, ARCHITEKTUR §2) → .pkarton →
// PizzaExe.baue(pkarton, ziel) → Blob → Download. js/exe.js wird erst bei Bedarf geladen; solange Compiler oder Host-Programme
// fehlen, ist der Knopf deaktiviert (mit Grund). Browser = nativ: Ein-Datei-Projekte ergeben dieselbe EXE wie früher ein Tab.
import { workerAuftrag } from "./ausfuehrung.js";

const $ = (id) => document.getElementById(id);

/**
 * @param {{ toast, speicher, motor: { faehigkeiten: object|null, warte(): Promise }, holeMotoren(): Promise<{wasm, exe}>,
 *           auftrag(): { nachricht, transfer } | Promise<…>, anzeigeName(): string }} o
 */
export function erstelleExeDialog({ toast, speicher, motor, holeMotoren, auftrag, anzeigeName }) {
  const knopfExe = $("knopf-exe");
  const knopfPkarton = $("knopf-pkarton");
  const exeDlg = $("dialog-exe");
  let exeLaden = null, exeZiele = null, exeGrund = "Wird geprüft …", exeBeschaeftigt = false, exeMoeglich = false;
  const IST_WINDOWS = /Windows|Win32|Win64/i.test(navigator.userAgent || "") || /^Win/i.test(navigator.platform || "");
  const zielId = (z) => String(typeof z === "string" ? z : z && (z.id || z.name || z.ziel) || "");
  const zielName = (z) => String(typeof z === "string" ? z : z && (z.titel || z.name || z.label || z.id) || "?");
  const zielEndung = (z) => {
    const e = z && typeof z === "object" && (z.endung || z.erweiterung || z.suffix);
    if (typeof e === "string") return e && !e.startsWith(".") ? "." + e : e;
    return /win/i.test(zielId(z)) ? ".exe" : "";
  };
  const dateibasis = () => String(anzeigeName() || "programm").replace(/\.pizza$/i, "").replace(/[\\/:*?"<>|]+/g, "-") || "programm";

  async function kompiliere(zeitlimit) {
    const { nachricht, transfer } = await auftrag();
    return workerAuftrag(nachricht, "pkarton", zeitlimit, transfer);
  }
  function kompilierGrund(r, lang) {
    let grund = (r && r.grund) || "Kompilieren nicht möglich.";
    if (r && r.fehler) grund = "Syntaxfehler" + (r.fehler.datei ? " in " + r.fehler.datei : "") + (r.fehler.zeile ? " in Zeile " + r.fehler.zeile : "") + ": " + r.fehler.text;
    else if (r && Array.isArray(r.nichtUnterstuetzt) && r.nichtUnterstuetzt.length) {
      if (lang) {
        grund = "Dieses Programm lässt sich noch nicht als Programm backen – " +
          r.nichtUnterstuetzt.slice(0, 3).map((n) => (n.zeile ? "Zeile " + n.zeile + ": " : "") + n.grund).join("; ") + ".";
      } else {
        const n = r.nichtUnterstuetzt[0];
        grund = "Noch nicht als Wasm kompilierbar" + (n.zeile ? " (Zeile " + n.zeile + ")" : "") + ": " + n.grund;
      }
    }
    return grund;
  }

  // ---------- .pkarton (WebAssembly) herunterladen ----------
  knopfPkarton.addEventListener("click", async () => {
    const name = dateibasis() + ".pkarton";
    knopfPkarton.disabled = true;
    const r = await kompiliere(20_000);
    knopfPkarton.disabled = false;
    if (!r || !r.ok) { toast(kompilierGrund(r, false), "fehler"); return; }
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
  function wendeAn() {
    const f = motor.faehigkeiten;
    const compiler = !!(f && f.wasm);
    let grund = null;
    if (!f) grund = "Wird geprüft …";
    else if (!compiler) grund = "Der Wasm-Compiler ist noch nicht verfügbar" + (f.grund ? " (" + f.grund + ")" : "") + ".";
    else if (!exeMoeglich) grund = exeGrund;
    else if (exeZiele && !exeZiele.length) grund = exeGrund; // Ziele schon geladen, aber leer
    knopfExe.setAttribute("aria-disabled", String(!!grund));
    knopfExe.classList.toggle("deaktiviert", !!grund);
    knopfExe.title = grund ? "Als Programm herunterladen – noch nicht möglich: " + grund : "Als Programm (z. B. Windows-.exe) herunterladen";
    knopfExe.dataset.grund = grund || "";
    return grund;
  }
  // js/exe.js und bin/ziele.json werden erst beim Öffnen des Dialogs geladen (keine Anfragen beim Seitenstart).
  async function pruefe() {
    await motor.warte();
    const mo = await holeMotoren();
    exeMoeglich = mo.exe;
    if (!mo.exe) exeGrund = "Die Host-Programme für Windows/Linux werden noch gebaut.";
    return wendeAn();
  }
  wendeAn();
  pruefe();

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
  function voraussetzungZeigen(ziel) {
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
  async function oeffnen() {
    if (exeBeschaeftigt) return;
    let grund = wendeAn();
    if (grund && motor.faehigkeiten) { grund = await pruefe(); } // vielleicht inzwischen verfügbar
    if (grund) { toast("Als Programm herunterladen geht noch nicht: " + grund, "fehler"); return; }
    if (!exeZiele || !exeZiele.length) {
      knopfExe.classList.add("laedt");
      const PE = await ladeExeSkript();
      knopfExe.classList.remove("laedt");
      if (!PE) { exeLaden = null; wendeAn(); toast("Als Programm herunterladen geht gerade nicht: " + exeGrund, "fehler"); return; }
    }
    $("exe-tabname").textContent = "„" + (anzeigeName() || "unbenannt") + "“";
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
      r.addEventListener("change", () => { if (r.checked) voraussetzungZeigen(z); });
      l.appendChild(r);
      const n = document.createElement("span");
      n.textContent = zielName(z);
      l.appendChild(n);
      const e = zielEndung(z);
      if (e) { const k = document.createElement("code"); k.textContent = e; l.appendChild(k); }
      feld.appendChild(l);
    }
    voraussetzungZeigen(vorwahl);
    exeStatus(null); exeFehler(null);
    $("exe-hinweise").open = false;
    $("exe-los").disabled = false;
    if (typeof exeDlg.showModal === "function") exeDlg.showModal(); else exeDlg.setAttribute("open", "");
    $("exe-los").focus();
  }
  async function bauen() {
    if (exeBeschaeftigt) return;
    const gewaehlt = exeDlg.querySelector('input[name="exe-ziel"]:checked');
    const ziel = exeZiele.find((z) => zielId(z) === (gewaehlt && gewaehlt.value)) || exeZiele[0];
    speicher.setze("pizza.exeZiel", zielId(ziel));
    const PEvorab = window.PizzaExe;
    const dateiname = PEvorab && typeof PEvorab.dateiname === "function" ? PEvorab.dateiname(anzeigeName() || "programm", ziel) : dateibasis() + zielEndung(ziel);
    exeBeschaeftigt = true;
    $("exe-los").disabled = true;
    exeFehler(null);
    try {
      exeStatus(1, "1/3 · Code wird zu WebAssembly gebacken …");
      const r = await kompiliere(30_000);
      if (!r || !r.ok) throw new Error(kompilierGrund(r, true));
      exeStatus(2, "2/3 · Programm für " + zielName(ziel) + " wird verpackt …");
      const PE = await ladeExeSkript();
      if (!PE) throw new Error(exeGrund);
      // Importgruppen, die der Host des Ziels (noch) nicht kennt (z. B. `herd` vor H5) → kein Download einer EXE,
      // die beim Start nur K-043 meldet. Ziele mit `gruppen` in ziele.json bestimmen selbst, was geht.
      if (typeof PE.fehlendeGruppen === "function") {
        let fehlend = [];
        try { fehlend = PE.fehlendeGruppen(r.daten, ziel); } catch (e) { /* Prüfung nicht möglich → baue() entscheidet */ }
        if (fehlend.length) throw new Error(PE.gruppenMeldung(fehlend));
      }
      let blob;
      try { blob = await PE.baue(r.daten, ziel); }
      catch (e) { if (e && e.code === "GRUPPE_FEHLT") throw e; throw new Error("Das Programm konnte nicht verpackt werden: " + (e && e.message ? e.message : String(e)) + " (fehlen die Host-Programme unter bin/?)"); }
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
  knopfExe.addEventListener("click", oeffnen);
  $("exe-los").addEventListener("click", bauen);
  $("exe-abbrechen").addEventListener("click", () => exeDlg.close());
  exeDlg.addEventListener("cancel", (e) => { if (exeBeschaeftigt) e.preventDefault(); });
  knopfPkarton.addEventListener("click", () => { if (exeDlg.open) exeDlg.close(); }, true);

  return { oeffnen, wendeAn, pruefe };
}
