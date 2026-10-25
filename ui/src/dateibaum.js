// Dateibaum des aktiven Projekts (PROJEKTE.md §3.1, §5.8): Dateien und Ordner anlegen, umbenennen (Pfadregeln live geprüft),
// verschieben per Drag & Drop, löschen (Rückfrage im Seiten-Dialog), „Als Hauptdatei“ (★), Dateien hochladen (Knopf oder
// Drag & Drop, Bilder mit Signaturprüfung). Nicht erreichbare .pizza-Dateien grau mit Hinweis „wird von keiner Datei bestellt“.
// Links einklappbar; auf schmalen Bildschirmen eine Schublade.
import { oeffneMenue } from "./menue.js";
import { iconSvg } from "./icons.js";
import {
  dateiArt, pruefePfad, erreichbarePizzas, dekodiereText, pruefeGrenzen, segmentAusName, formatGroesse, GRENZEN, PROJEKTDATEI,
} from "./projekt.js";
import { pruefeBild, pruefeModell } from "./bilder.js";
import { istZip } from "./zip.js";

function el(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}
const ICON = { pizza: "pizza", text: "file", bild: "image", modell: "package", daten: "archive", ordner: "folder" };   // H-K16: Modelle, Puffer

/** Pfade + leere Ordner → Baum { name, pfad, ordner: Map, dateien: [] }. */
export function baueBaum(pfade, ordner = []) {
  const wurzel = { name: "", pfad: "", ordner: new Map(), dateien: [] };
  const knoten = (teile) => {
    let k = wurzel;
    for (let i = 0; i < teile.length; i++) {
      if (!k.ordner.has(teile[i])) k.ordner.set(teile[i], { name: teile[i], pfad: teile.slice(0, i + 1).join("/"), ordner: new Map(), dateien: [] });
      k = k.ordner.get(teile[i]);
    }
    return k;
  };
  for (const o of ordner) knoten(o.split("/"));
  for (const p of pfade) { const t = p.split("/"); knoten(t.slice(0, -1)).dateien.push(p); }
  return wurzel;
}

/**
 * Hochgeladene Dateien prüfen und vorbereiten → { neu: [{ pfad, inhalt }], meldungen: [text], zip: File[] }.
 * ordner: Zielordner ("" = Wurzel); belegt: vorhandene Pfade; bisher: { pfad → inhalt } für die Grenzen.
 */
export async function bereiteDateienVor(files, { ordner = "", belegt = new Set(), bisher = {} } = {}) {
  const neu = [], meldungen = [], zip = [];
  const vergeben = new Set(belegt);
  for (const f of Array.from(files || [])) {
    let bytes;
    try { bytes = new Uint8Array(await f.arrayBuffer()); } catch (e) { meldungen.push("„" + f.name + "“ konnte nicht gelesen werden."); continue; }
    if (/\.zip$/i.test(f.name) || istZip(bytes)) { zip.push(f); continue; }
    const art = dateiArt(f.name);
    if (!art) { meldungen.push("„" + f.name + "“: diese Dateiart kennt der Ofen nicht (erlaubt: .pizza, .png, .jpg, .glb, .gltf, .bin, .txt, .json, .csv, .md)."); continue; }
    const punkt = f.name.lastIndexOf(".");
    const endung = f.name.slice(punkt + 1).toLowerCase();
    const name = segmentAusName(f.name.slice(0, punkt), "datei") + "." + endung;
    let pfad = (ordner ? ordner + "/" : "") + name;
    const fp = pruefePfad(pfad);
    if (fp) { meldungen.push(fp); continue; }
    if (vergeben.has(pfad)) {
      const m = /^(.*?)(\.[a-z0-9]+)$/.exec(pfad);
      for (let i = 2; ; i++) { const n = m[1] + "-" + i + m[2]; if (!vergeben.has(n)) { pfad = n; break; } }
    }
    let inhalt;
    if (art === "bild") {
      const p = pruefeBild(pfad, bytes);
      if (!p.ok) { meldungen.push(p.fehler); continue; }
      inhalt = bytes;
    } else if (art === "modell") {
      const p = pruefeModell(pfad, bytes);
      if (!p.ok) { meldungen.push(p.fehler); continue; }
      inhalt = bytes;
    } else if (art === "daten") {
      inhalt = bytes;
    } else {
      const t = dekodiereText(bytes, pfad);
      if (!t.ok) { meldungen.push(t.fehler); continue; }
      inhalt = t.text;
    }
    const probe = { ...bisher, [pfad]: inhalt };
    for (const x of neu) probe[x.pfad] = x.inhalt;
    const g = pruefeGrenzen(probe);
    if (g) { meldungen.push("„" + f.name + "“ passt nicht mehr ins Projekt (" + g + ")."); continue; }
    vergeben.add(pfad);
    neu.push({ pfad, inhalt });
  }
  return { neu, meldungen, zip };
}

export function erstelleDateibaum({ wurzel, umschalter, projekte, tabs, frage, toast, beiZip, schmal, speicher, vorbacker = null }) {
  const eingeklappt = new Set();
  let ziel = null; // gezogener Pfad (Datei/Ordner) innerhalb des Baums
  let bearbeitung = null; // { art: "neu-datei"|"neu-ordner"|"umbenennen", ordner, pfad }

  const kopf = el("div", "baum-kopf");
  const titel = el("span", "baum-titel");
  titel.dataset.testid = "dateibaum-titel";
  kopf.appendChild(titel);
  const knopf = (icon, label, testid, aktion) => {
    const k = el("button", "baum-knopf");
    k.type = "button";
    k.title = label;
    k.setAttribute("aria-label", label);
    k.dataset.testid = testid;
    k.innerHTML = iconSvg(icon);
    k.addEventListener("click", aktion);
    kopf.appendChild(k);
    return k;
  };
  knopf("filePlus", "Neue Datei", "baum-neue-datei", () => starteBearbeitung({ art: "neu-datei", ordner: "" }));
  knopf("folderPlus", "Neuer Ordner", "baum-neuer-ordner", () => starteBearbeitung({ art: "neu-ordner", ordner: "" }));
  knopf("upload", "Dateien hinzufügen (Bilder, Texte, .pizza, ZIP)", "baum-hochladen", () => dateiDialog(""));
  const liste = el("div", "baum-liste");
  liste.setAttribute("role", "tree");
  liste.setAttribute("aria-label", "Dateien des Projekts");
  liste.dataset.testid = "dateibaum-liste";
  const fuss = el("div", "baum-fuss");
  fuss.dataset.testid = "dateibaum-fuss";
  wurzel.replaceChildren(kopf, liste, fuss);

  // ---------- Sichtbarkeit (Schublade auf schmalen Bildschirmen) ----------
  const BAUM = "pizza.baum";
  function sichtbar() {
    const g = speicher.hole(BAUM);
    if (schmal.matches) return wurzel.classList.contains("schublade-offen");
    if (g === "1") return true;
    if (g === "0") return false;
    // Ein-Datei-Projekt (eine Datei, daneben höchstens pizza.json – z. B. jedes Beispiel aus der Galerie): Baum anfangs zu
    return projekte.pfade().filter((p) => p !== "pizza.json").length > 1 || projekte.ordner().length > 0;
  }
  function wendeAn() {
    const an = sichtbar();
    wurzel.hidden = !an;
    document.body.classList.toggle("baum-offen", an);
    if (umschalter) { umschalter.setAttribute("aria-expanded", String(an)); umschalter.classList.toggle("aktiv", an); }
  }
  function umschalten(an = !sichtbar()) {
    if (schmal.matches) wurzel.classList.toggle("schublade-offen", an);
    else speicher.setze(BAUM, an ? "1" : "0");
    wendeAn();
    if (an) { const a = liste.querySelector(".baum-eintrag.aktiv") || liste.querySelector(".baum-eintrag"); if (a) a.focus(); }
  }
  if (umschalter) umschalter.addEventListener("click", () => umschalten());
  schmal.addEventListener("change", () => { wurzel.classList.remove("schublade-offen"); wendeAn(); });

  // ---------- Zeichnen ----------
  function zeichne() {
    const P = projekte.aktiv;
    titel.textContent = P.name;
    titel.title = P.name + " – Hauptdatei: " + P.hauptdatei;
    const pfade = projekte.pfade();
    const pizzas = pfade.filter((p) => dateiArt(p) === "pizza");
    const inhalte = projekte.alleInhalte();
    const erreichbar = pizzas.length > 1 ? erreichbarePizzas(inhalte, P.hauptdatei) : new Set(pizzas);
    const baum = baueBaum(pfade, projekte.ordner());
    liste.textContent = "";
    const zeile = (tiefe, inhalt) => { inhalt.style.setProperty("--tiefe", tiefe); return inhalt; };
    const zeichneKnoten = (k, tiefe) => {
      for (const o of [...k.ordner.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        const zu = eingeklappt.has(o.pfad);
        const e = eintrag({ pfad: o.pfad, name: o.name, art: "ordner", tiefe, zu });
        liste.appendChild(zeile(tiefe, e));
        if (bearbeitung && bearbeitung.art === "umbenennen" && bearbeitung.pfad === o.pfad) e.replaceWith(eingabeZeile(tiefe));
        if (!zu) {
          zeichneKnoten(o, tiefe + 1);
          if (bearbeitung && bearbeitung.art !== "umbenennen" && bearbeitung.ordner === o.pfad) liste.appendChild(eingabeZeile(tiefe + 1));
        }
      }
      for (const p of k.dateien.sort((a, b) => a.localeCompare(b))) {
        if (bearbeitung && bearbeitung.art === "umbenennen" && bearbeitung.pfad === p) { liste.appendChild(eingabeZeile(tiefe)); continue; }
        const art = dateiArt(p) || "text";
        const e = eintrag({ pfad: p, name: p.split("/").pop(), art, tiefe, haupt: p === P.hauptdatei, grau: art === "pizza" && !erreichbar.has(p) });
        liste.appendChild(zeile(tiefe, e));
      }
    };
    zeichneKnoten(baum, 0);
    if (bearbeitung && bearbeitung.art !== "umbenennen" && !bearbeitung.ordner) liste.appendChild(eingabeZeile(0));
    let summe = 0;
    for (const p of pfade) { const i = inhalte[p]; summe += i instanceof Uint8Array ? i.byteLength : new TextEncoder().encode(i).byteLength; }
    fuss.textContent = pfade.length + (pfade.length === 1 ? " Datei" : " Dateien") + " · " + formatGroesse(summe) + " von " + formatGroesse(GRENZEN.gesamt) +
      (projekte.dauerhaft ? "" : " · nur im Speicher");
    wendeAn();
    const fokus = liste.querySelector(".baum-eingabe");
    if (fokus) requestAnimationFrame(() => { fokus.focus(); if (bearbeitung && bearbeitung.auswahl) fokus.setSelectionRange(...bearbeitung.auswahl); bearbeitung && (bearbeitung.auswahl = null); });
  }

  function eintrag({ pfad, name, art, tiefe, zu, haupt, grau }) {
    const e = el("button", "baum-eintrag baum-" + art + (pfad === tabs.aktivPfad ? " aktiv" : "") + (grau ? " unerreichbar" : "") + (haupt ? " haupt" : ""));
    e.type = "button";
    e.setAttribute("role", "treeitem");
    e.dataset.pfad = pfad;
    e.dataset.testid = art === "ordner" ? "baum-ordner" : "baum-datei";
    if (art === "ordner") e.setAttribute("aria-expanded", String(!zu));
    if (haupt) e.dataset.haupt = "true";
    e.title = pfad + (haupt ? " – Hauptdatei" : "") + (grau ? " – wird von keiner Datei bestellt" : "") +
      (art === "ordner" ? "" : projekte.istGeaendert(pfad) ? " – geändert" : "");
    e.style.setProperty("--tiefe", tiefe);
    const ic = el("span", "baum-icon");
    ic.setAttribute("aria-hidden", "true");
    ic.innerHTML = iconSvg(art === "ordner" ? (zu ? "chevronRight" : "chevronDown") : ICON[art] || "file");
    e.appendChild(ic);
    e.appendChild(el("span", "baum-name", name));
    if (haupt) { const s = el("span", "baum-stern", "★"); s.setAttribute("aria-label", "Hauptdatei"); e.appendChild(s); }
    if (grau) { const h = el("span", "sr-only", " (wird von keiner Datei bestellt)"); e.appendChild(h); }
    e.addEventListener("click", () => {
      if (art === "ordner") { if (eingeklappt.has(pfad)) eingeklappt.delete(pfad); else eingeklappt.add(pfad); zeichne(); return; }
      tabs.oeffneDatei(pfad);
      if (schmal.matches) umschalten(false);
    });
    e.addEventListener("contextmenu", (ev) => { ev.preventDefault(); menue(pfad, art, { x: ev.clientX, y: ev.clientY }); });
    e.addEventListener("keydown", (ev) => {
      if (ev.key === "F2") { ev.preventDefault(); starteBearbeitung({ art: "umbenennen", pfad }); }
      else if (ev.key === "Delete") { ev.preventDefault(); loeschen(pfad); }
      else if (ev.key === "ContextMenu" || (ev.key === "F10" && ev.shiftKey)) { ev.preventDefault(); menue(pfad, art, { anker: e }); }
      else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        const alle = [...liste.querySelectorAll(".baum-eintrag")];
        const i = alle.indexOf(e) + (ev.key === "ArrowDown" ? 1 : -1);
        if (alle[i]) alle[i].focus();
      } else if (art === "ordner" && (ev.key === "ArrowLeft" || ev.key === "ArrowRight")) {
        ev.preventDefault();
        if (ev.key === "ArrowLeft") eingeklappt.add(pfad); else eingeklappt.delete(pfad);
        zeichne();
        const neu = [...liste.querySelectorAll(".baum-eintrag")].find((x) => x.dataset.pfad === pfad);
        if (neu) neu.focus();
      }
    });
    // Ziehen innerhalb des Baums: auf einen Ordner (oder die Liste = Wurzel) verschieben
    e.draggable = true;
    e.addEventListener("dragstart", (ev) => { ziel = pfad; try { ev.dataTransfer.setData("application/x-pizza-datei", pfad); ev.dataTransfer.effectAllowed = "move"; } catch (x) { /* egal */ } });
    e.addEventListener("dragend", () => { ziel = null; liste.querySelectorAll(".drop-ziel").forEach((x) => x.classList.remove("drop-ziel")); });
    if (art === "ordner") {
      e.addEventListener("dragover", (ev) => { if (ziel || hatDateien(ev)) { ev.preventDefault(); ev.stopPropagation(); e.classList.add("drop-ziel"); } });
      e.addEventListener("dragleave", () => e.classList.remove("drop-ziel"));
      e.addEventListener("drop", (ev) => { ev.preventDefault(); ev.stopPropagation(); e.classList.remove("drop-ziel"); fallenLassen(ev, pfad); });
    }
    return e;
  }

  const hatDateien = (ev) => ev.dataTransfer && [...(ev.dataTransfer.types || [])].includes("Files");
  liste.addEventListener("dragover", (ev) => { if (ziel || hatDateien(ev)) { ev.preventDefault(); ev.stopPropagation(); liste.classList.add("drop-ziel"); } });
  liste.addEventListener("dragleave", (ev) => { if (ev.target === liste) liste.classList.remove("drop-ziel"); });
  liste.addEventListener("drop", (ev) => { ev.preventDefault(); ev.stopPropagation(); liste.classList.remove("drop-ziel"); fallenLassen(ev, ""); });

  function fallenLassen(ev, ordner) {
    if (ziel) {
      const quelle = ziel;
      ziel = null;
      const neu = (ordner ? ordner + "/" : "") + quelle.split("/").pop();
      if (neu === quelle || (ordner + "/").startsWith(quelle + "/")) return;
      const f = projekte.verschiebe(quelle, neu);
      if (f) toast(f, "fehler"); else toast("„" + quelle + "“ → „" + neu + "“", "ok");
      return;
    }
    if (hatDateien(ev)) hinzufuegen(ev.dataTransfer.files, ordner);
  }

  // ---------- Bearbeitung (neue Datei/Ordner, umbenennen) ----------
  function starteBearbeitung(b) {
    if (!sichtbar()) umschalten(true);
    if (b.ordner) eingeklappt.delete(b.ordner);
    bearbeitung = b;
    if (b.art === "umbenennen") {
      const name = b.pfad.split("/").pop();
      const p = name.lastIndexOf(".");
      const start = b.pfad.length - name.length;
      b.wert = b.pfad;
      b.auswahl = [start, p > 0 ? start + p : b.pfad.length];
    } else {
      b.wert = (b.ordner ? b.ordner + "/" : "") + (b.art === "neu-datei" ? "" : "");
      b.auswahl = null;
    }
    zeichne();
  }
  function eingabeZeile(tiefe) {
    const b = bearbeitung;
    const w = el("div", "baum-bearbeitung");
    w.style.setProperty("--tiefe", tiefe);
    const eingabe = el("input", "baum-eingabe");
    eingabe.type = "text";
    eingabe.spellcheck = false;
    eingabe.value = b.wert;
    eingabe.dataset.testid = "baum-eingabe";
    eingabe.placeholder = b.art === "neu-ordner" ? "ordner" : "datei.pizza";
    eingabe.setAttribute("aria-label", b.art === "umbenennen" ? "Neuer Pfad für " + b.pfad : b.art === "neu-ordner" ? "Name des neuen Ordners" : "Name der neuen Datei");
    const hinweis = el("div", "baum-hinweis");
    hinweis.dataset.testid = "baum-hinweis";
    hinweis.setAttribute("aria-live", "polite");
    const pruefe = () => {
      let v = eingabe.value.trim();
      if (!v || v.endsWith("/")) { hinweis.textContent = ""; return null; }
      if (b.art === "neu-datei" && !/\.[a-z0-9]+$/i.test(v)) v += ".pizza";
      const f = b.art === "neu-ordner" ? (pruefePfad(v + "/x.txt") ? `„${v}“ ist kein gültiger Ordnername (nur a–z, 0–9, -, _, .).` : null) : pruefePfad(v);
      hinweis.textContent = f || "";
      eingabe.classList.toggle("ungueltig", !!f);
      return f ? null : v;
    };
    let fertig = false;
    const ende = (uebernehmen, ausBlur = false) => {
      if (fertig) return;
      fertig = true;
      const v = pruefe();
      if (uebernehmen && eingabe.value.trim() && !v) {
        if (ausBlur) uebernehmen = false;           // Fokus woanders hin: ungültige Eingabe verwerfen
        else { fertig = false; eingabe.focus(); return; }
      }
      bearbeitung = null;
      if (uebernehmen && v) {
        let f = null;
        if (b.art === "neu-datei") {
          f = projekte.neueDatei(v, v === PROJEKTDATEI ? '{\n  "pizza": 1,\n  "name": ' + JSON.stringify(projekte.aktiv.name) + ',\n  "hauptdatei": ' + JSON.stringify(projekte.aktiv.hauptdatei) + "\n}\n" : "");
          if (!f) tabs.oeffneDatei(v);
        } else if (b.art === "neu-ordner") f = projekte.neuerOrdner(v);
        else if (v !== b.pfad) f = projekte.verschiebe(b.pfad, v);
        if (f) { toast(f, "fehler"); bearbeitung = b; b.wert = eingabe.value; fertig = false; }
      }
      zeichne();
    };
    eingabe.addEventListener("input", pruefe);
    eingabe.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); ende(true); }
      else if (e.key === "Escape") { e.preventDefault(); ende(false); }
    });
    eingabe.addEventListener("blur", () => setTimeout(() => {
      if (fertig || document.activeElement === eingabe || !eingabe.isConnected) return;
      const v = eingabe.value.trim();
      ende(!!v && v !== (b.ordner ? b.ordner + "/" : ""), true);
    }, 0));
    w.append(eingabe, hinweis);
    requestAnimationFrame(pruefe);
    return w;
  }

  // ---------- Menü ----------
  function menue(pfad, art, pos) {
    const P = projekte.aktiv;
    const ordner = art === "ordner" ? pfad : pfad.split("/").slice(0, -1).join("/");
    oeffneMenue({
      ...pos,
      label: "Aktionen für " + pfad,
      testid: "baum-menue",
      eintraege: [
        ...(art !== "ordner" ? [{ text: "Öffnen", icon: "file", aktion: () => tabs.oeffneDatei(pfad), testid: "baum-menue-oeffnen" }] : []),
        { text: "Neue Datei hier …", icon: "filePlus", aktion: () => starteBearbeitung({ art: "neu-datei", ordner }), testid: "baum-menue-neue-datei" },
        { text: "Neuer Ordner hier …", icon: "folderPlus", aktion: () => starteBearbeitung({ art: "neu-ordner", ordner }), testid: "baum-menue-neuer-ordner" },
        { text: "Dateien hinzufügen …", icon: "upload", aktion: () => dateiDialog(ordner), testid: "baum-menue-hochladen" },
        "-",
        ...(art === "pizza" ? [{ text: "Als Hauptdatei", icon: "star", aktion: () => { const f = projekte.setzeHauptdatei(pfad); if (f) toast(f, "fehler"); }, deaktiviert: P.hauptdatei === pfad, grund: "Ist schon die Hauptdatei.", testid: "baum-menue-hauptdatei" }] : []),
        { text: "Umbenennen", icon: "pencil", kuerzel: "F2", aktion: () => starteBearbeitung({ art: "umbenennen", pfad }), testid: "baum-menue-umbenennen" },
        { text: "Löschen", icon: "trash", kuerzel: "Entf", aktion: () => loeschen(pfad), gefahr: true, testid: "baum-menue-loeschen" },
      ],
    });
  }

  async function loeschen(pfad) {
    const istOrdner = !projekte.hat(pfad);
    const anzahl = istOrdner ? projekte.pfade().filter((p) => p.startsWith(pfad + "/")).length : 1;
    if (anzahl) {
      const ok = await frage(istOrdner ? "Ordner löschen?" : "Datei löschen?",
        istOrdner ? `Der Ordner „${pfad}“ mit ${anzahl} ${anzahl === 1 ? "Datei" : "Dateien"} wird gelöscht.` : `„${pfad}“ wird aus dem Projekt gelöscht.`, "Löschen");
      if (!ok) return;
    }
    const f = projekte.loescheDatei(pfad);
    if (f) toast(f, "fehler");
  }

  // ---------- Hochladen ----------
  let dateiEingabe = null, hochladenOrdner = "";
  function dateiDialog(ordner) {
    hochladenOrdner = ordner || "";
    if (!dateiEingabe) {
      dateiEingabe = document.createElement("input");
      dateiEingabe.type = "file";
      dateiEingabe.accept = ".pizza,.png,.jpg,.jpeg,.glb,.gltf,.bin,.txt,.json,.csv,.md,.zip";
      dateiEingabe.multiple = true;
      dateiEingabe.hidden = true;
      dateiEingabe.dataset.testid = "baum-datei-eingabe";
      dateiEingabe.addEventListener("change", () => { hinzufuegen(dateiEingabe.files, hochladenOrdner); dateiEingabe.value = ""; });
      document.body.appendChild(dateiEingabe);
    }
    dateiEingabe.click();
  }
  /** Dateien ins aktive Projekt (ZIP-Dateien → Import als eigenes Projekt). */
  async function hinzufuegen(files, ordner = "") {
    const vorbereitet = await bereiteDateienVor(files, { ordner, belegt: new Set(projekte.pfade()), bisher: projekte.alleInhalte() });
    const { meldungen, zip } = vorbereitet;
    // Bilder und Modelle sofort vorbacken (PROJEKTE §5.4, H-K16): dieselbe Prüfung wie zur Laufzeit, Ergebnis im Teigling-Cache.
    // Modelle mit allen Dateien des Projekts und der neuen (ein .gltf braucht seine .bin/Bilder); fehlt nur eine Nachbardatei,
    // kommt das Modell trotzdem ins Projekt (die Datei kann noch folgen) – die Meldung steht dann am Dateibaum.
    const neu = [], hinweise = [];
    const probe = { ...projekte.alleInhalte() };
    for (const x of vorbereitet.neu) probe[x.pfad] = x.inhalt;
    for (const x of vorbereitet.neu) {
      if (vorbacker && x.inhalt instanceof Uint8Array && dateiArt(x.pfad) === "bild") {
        const r = await vorbacker.vorbacke(x.pfad, x.inhalt);
        if (!r.ok && r.fehler) { meldungen.push(r.fehler); continue; }
      } else if (vorbacker && x.inhalt instanceof Uint8Array && dateiArt(x.pfad) === "modell" && vorbacker.vorbackeModell) {
        const r = await vorbacker.vorbackeModell(x.pfad, probe);
        if (!r.ok && r.fehler && r.code !== 5) { meldungen.push(r.fehler); continue; }
        if (!r.ok && r.fehler) hinweise.push(r.fehler);
      }
      neu.push(x);
    }
    meldungen.push(...hinweise);
    for (const x of neu) { const f = projekte.neueDatei(x.pfad, x.inhalt); if (f) meldungen.push(f); }
    if (neu.length === 1) tabs.oeffneDatei(neu[0].pfad);
    if (meldungen.length) toast(meldungen.join(" "), "fehler");
    else if (neu.length) toast(neu.length === 1 ? "„" + neu[0].pfad + "“ hinzugefügt." : neu.length + " Dateien hinzugefügt.", "ok");
    for (const z of zip) await beiZip(z);
    return neu;
  }

  projekte.an("wechsel", () => { bearbeitung = null; eingeklappt.clear(); zeichne(); });
  projekte.an("dateien", zeichne);
  projekte.an("liste", () => { titel.textContent = projekte.aktiv.name; });

  return {
    zeichne,
    umschalten,
    get sichtbar() { return sichtbar(); },
    neueDatei: (ordner = "") => starteBearbeitung({ art: "neu-datei", ordner }),
    neuerOrdner: (ordner = "") => starteBearbeitung({ art: "neu-ordner", ordner }),
    dateiDialog,
    hinzufuegen,
    /** aktiven Eintrag hervorheben (nach Tab-Wechsel) */
    markiere() { for (const e of liste.querySelectorAll(".baum-eintrag")) e.classList.toggle("aktiv", e.dataset.pfad === tabs.aktivPfad); },
  };
}
