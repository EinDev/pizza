// Projektmenü im Kopf (PROJEKTE.md §3.1): „≡ Projekt ▾ <Name>“ mit Liste (Suche, zuletzt geändert zuerst) und den Befehlen
// Neues Projekt · Umbenennen · Duplizieren · Löschen (Rückfrage im Seiten-Dialog) · Als ZIP herunterladen · ZIP importieren ·
// Als Programm … · Teilen … · Zuletzt gelöscht (Papierkorb, 10 Einträge). Dazu ZIP-Export/-Import (zip.js) und das Banner
// „Projekte werden nicht gespeichert“, wenn IndexedDB fehlt.
import { oeffneMenue } from "./menue.js";
import { schreibeZip, leseZip } from "./zip.js";
import { segmentAusName, ausDateien } from "./projekt.js";

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}

/** Relative Zeitangabe für die Projektliste. */
export function vorWann(ms, jetzt = Date.now()) {
  const s = Math.max(0, Math.round((jetzt - ms) / 1000));
  if (s < 60) return "gerade eben";
  const m = Math.round(s / 60);
  if (m < 60) return "vor " + m + " Min.";
  const h = Math.round(m / 60);
  if (h < 24) return "vor " + h + " Std.";
  const t = Math.round(h / 24);
  return t === 1 ? "gestern" : "vor " + t + " Tagen";
}

/** Datei herunterladen (Blob-URL nur als Download, nie als Bild – CSP). */
export function herunterladenBlob(daten, name, typ) {
  const blob = daten instanceof Blob ? daten : new Blob([daten], { type: typ || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** ZIP-Import → Projektdaten { name, dateien, hauptdatei } | { fehler }; meldungen = übersprungen/umbenannt. */
export async function importiereZip(bytes, dateiname) {
  const r = await leseZip(bytes);
  if (!r.ok) return { fehler: r.fehler };
  if (!Object.keys(r.dateien).length) return { fehler: "In dieser ZIP-Datei ist keine Datei, die der Ofen kennt.", meldungen: r.meldungen };
  const standard = r.wurzel || String(dateiname || "projekt").replace(/\.zip$/i, "");
  const a = ausDateien(r.dateien, standard);
  return {
    name: a.fehler ? standard : a.name,
    hauptdatei: a.fehler ? null : a.hauptdatei,
    dateien: r.dateien,
    meldungen: r.meldungen.concat(a.fehler ? [a.fehler.replace(/^PizzaFehler \w+: /, "") + " Name und Hauptdatei aus dem Archiv."] : []),
  };
}

export function erstelleProjektmenue({ knopf, namenEl, banner, projekte, frage, fragText, toast, tabs, beiExe, beiTeilen, beiNeu }) {
  function zeichneKnopf() {
    namenEl.textContent = projekte.aktiv.name;
    knopf.title = "Projekt „" + projekte.aktiv.name + "“ – Projekte wechseln, anlegen, exportieren …";
  }
  projekte.an("wechsel", zeichneKnopf);
  projekte.an("liste", zeichneKnopf);
  zeichneKnopf();
  if (banner) {
    banner.hidden = projekte.dauerhaft;
    if (!projekte.dauerhaft) banner.querySelector(".banner-text").textContent = "Projekte werden nicht gespeichert – sichere sie als ZIP." + (projekte.grund ? " (" + projekte.grund + ")" : "");
  }

  async function umbenennen() {
    const n = await fragText("Projekt umbenennen", "Neuer Name für „" + projekte.aktiv.name + "“:", projekte.aktiv.name, "Umbenennen");
    if (n == null || !n.trim()) return;
    const neu = await projekte.umbenennen(n);
    toast("Projekt heißt jetzt „" + neu + "“.", "ok");
  }
  async function loeschen(id = projekte.aktiv.id) {
    const p = projekte.liste().find((x) => x.id === id);
    if (!p) return;
    const ok = await frage("Projekt löschen?", "„" + p.name + "“ wird gelöscht. Über „Zuletzt gelöscht“ im Projektmenü holst du es zurück (die letzten 10).", "Löschen");
    if (!ok) return;
    await projekte.loesche(id);
    toast("„" + p.name + "“ gelöscht.", "info");
  }
  async function dupliziere() {
    const p = await projekte.dupliziere();
    toast("Kopie „" + p.name + "“ angelegt.", "ok");
  }
  async function zipExport() {
    await projekte.speichern();
    const { projekt } = projekte.sammlung({ mitProjektdatei: true });
    const ordner = segmentAusName(projekte.aktiv.name, "projekt");
    herunterladenBlob(schreibeZip(projekt.dateien, { ordner }), ordner + ".zip", "application/zip");
  }
  let zipEingabe = null;
  function zipDialog() {
    if (!zipEingabe) {
      zipEingabe = document.createElement("input");
      zipEingabe.type = "file";
      zipEingabe.accept = ".zip,application/zip";
      zipEingabe.hidden = true;
      zipEingabe.dataset.testid = "zip-eingabe";
      zipEingabe.addEventListener("change", async () => { const f = zipEingabe.files && zipEingabe.files[0]; zipEingabe.value = ""; if (f) await zipImport(f); });
      document.body.appendChild(zipEingabe);
    }
    zipEingabe.click();
  }
  /** ZIP-Datei (File/Blob) als neues Projekt öffnen. */
  async function zipImport(datei) {
    let bytes;
    try { bytes = new Uint8Array(await datei.arrayBuffer()); } catch (e) { toast("„" + (datei.name || "ZIP") + "“ konnte nicht gelesen werden.", "fehler"); return null; }
    const r = await importiereZip(bytes, datei.name);
    if (r.fehler) { toast(r.fehler, "fehler"); return null; }
    const p = await projekte.neu({ name: r.name, dateien: r.dateien, hauptdatei: r.hauptdatei });
    const n = Object.keys(r.dateien).length;
    toast("„" + p.name + "“ importiert (" + n + (n === 1 ? " Datei" : " Dateien") + ")." + (r.meldungen.length ? " " + r.meldungen.join(" ") : ""), r.meldungen.length ? "info" : "ok");
    return p;
  }

  function oeffnen(anker = knopf) {
    const kopf = el("div", "menue-suche");
    const eingabe = el("input");
    eingabe.type = "search";
    eingabe.placeholder = "Projekte durchsuchen …";
    eingabe.setAttribute("aria-label", "Projekte durchsuchen");
    eingabe.dataset.testid = "projekt-suche";
    kopf.appendChild(eingabe);
    const eintraege = (q) => {
      q = q.trim().toLowerCase();
      const aktivId = projekte.aktiv.id;
      const alle = projekte.liste();
      const liste = alle.filter((p) => !q || p.name.toLowerCase().includes(q));
      const korb = projekte.papierkorb().filter((p) => !q || p.name.toLowerCase().includes(q));
      const e = [
        { text: "Neues Projekt", icon: "plus", kuerzel: "Strg+Alt+N", aktion: () => beiNeu(), testid: "projekt-neu" },
        { text: "Umbenennen …", icon: "pencil", aktion: umbenennen, testid: "projekt-umbenennen" },
        { text: "Duplizieren", icon: "copy", aktion: dupliziere, testid: "projekt-duplizieren" },
        { text: "Löschen …", icon: "trash", aktion: () => loeschen(), gefahr: true, testid: "projekt-loeschen" },
        "-",
        { text: "Als ZIP herunterladen", icon: "archive", aktion: zipExport, testid: "projekt-zip-export" },
        { text: "ZIP importieren …", icon: "upload", aktion: zipDialog, testid: "projekt-zip-import" },
        { text: "Als Programm herunterladen …", icon: "monitor", aktion: () => beiExe(), testid: "projekt-exe" },
        { text: "Teilen …", icon: "share", aktion: () => beiTeilen(), testid: "projekt-teilen" },
        "-",
        { ueberschrift: "Projekte (" + alle.length + ")" },
      ];
      if (!liste.length) e.push({ leer: "Kein Projekt passt." });
      for (const p of liste) {
        e.push({ text: p.name, icon: p.id === aktivId ? "check" : "folder", aktiv: p.id === aktivId, zusatz: vorWann(p.geaendert), aktion: () => projekte.wechsle(p.id), testid: "projekt-liste-eintrag" });
      }
      e.push("-", { ueberschrift: "Zuletzt gelöscht" });
      if (!korb.length) e.push({ leer: projekte.papierkorb().length ? "Kein gelöschtes Projekt passt." : "Papierkorb ist leer." });
      for (const p of korb) e.push({ text: p.name, icon: "restore", zusatz: vorWann(p.geloescht), aktion: async () => { await projekte.wiederherstellen(p.id); toast("„" + p.name + "“ wiederhergestellt.", "ok"); }, testid: "projekt-papierkorb-eintrag" });
      return e;
    };
    const m = oeffneMenue({ anker, eintraege: eintraege(""), label: "Projekte", testid: "projekt-menue", kopf, breit: true });
    eingabe.addEventListener("input", () => m.zeichne(eintraege(eingabe.value)));
    eingabe.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); m.fokusErster(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const k = m.wurzel.querySelector('[data-testid="projekt-liste-eintrag"]:not(:disabled)') || m.wurzel.querySelector(".menue-eintrag:not(:disabled)");
        if (k) k.click();
      }
    });
    requestAnimationFrame(() => eingabe.focus());
  }
  knopf.addEventListener("click", () => oeffnen());

  return { oeffnen, umbenennen, loeschen, dupliziere, zipExport, zipDialog, zipImport, zeichneKnopf, get tabs() { return tabs; } };
}

/** Kleiner Text-Dialog (Seiten-Dialog statt prompt()) → Promise<string | null>. */
export function erstelleTextFrage(dlg) {
  let kette = Promise.resolve();
  return function fragText(titel, text, vorgabe = "", ja = "OK") {
    if (typeof dlg.showModal !== "function") return Promise.resolve(window.prompt(text, vorgabe));
    const naechste = kette.then(() => new Promise((resolve) => {
      dlg.querySelector(".dlg-titel").textContent = titel;
      dlg.querySelector(".dlg-text").textContent = text;
      const feld = dlg.querySelector("input");
      const jaK = dlg.querySelector('button[value="ja"]');
      const neinK = dlg.querySelector('button[value="nein"]');
      jaK.textContent = ja;
      feld.value = vorgabe;
      let fertig = false;
      const ende = (w) => {
        if (fertig) return;
        fertig = true;
        jaK.removeEventListener("click", beiJa); neinK.removeEventListener("click", beiNein);
        dlg.removeEventListener("cancel", beiNein); feld.removeEventListener("keydown", beiTaste);
        if (dlg.open) dlg.close();
        resolve(w);
      };
      const beiJa = (e) => { e.preventDefault(); ende(feld.value); };
      const beiNein = (e) => { e.preventDefault(); ende(null); };
      const beiTaste = (e) => { if (e.key === "Enter") { e.preventDefault(); ende(feld.value); } };
      jaK.addEventListener("click", beiJa); neinK.addEventListener("click", beiNein);
      dlg.addEventListener("cancel", beiNein); feld.addEventListener("keydown", beiTaste);
      if (!dlg.open) dlg.showModal();
      feld.focus(); feld.select();
    }));
    kette = naechste.catch(() => {});
    return naechste;
  };
}

