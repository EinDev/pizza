// Bildvorschau für Bilddateien des Projekts (PROJEKTE.md §3.1, §5.8): Pixelgröße, Dateigröße, pixelscharfe Zoomstufen; Anzeige
// über eine data:-URL (CSP img-src 'self' data: bleibt); dazu „vorgebacken … · n Stufen“ aus dem Teigling (Vorbacker, PD1).
import { bildInfo, dataUrl, pruefeBild } from "./bilder.js";
import { formatGroesse } from "./projekt.js";

const STUFEN = [0, 1, 2, 4, 8]; // 0 = einpassen

export function erstelleBildvorschau({ wurzel, editorEl, vorbacker = null }) {
  const kopf = document.createElement("div");
  kopf.className = "bv-kopf";
  const info = document.createElement("span");
  info.className = "bv-info";
  info.dataset.testid = "bildvorschau-info";
  kopf.appendChild(info);
  const knoepfe = document.createElement("div");
  knoepfe.className = "bv-zoom";
  knoepfe.setAttribute("role", "group");
  knoepfe.setAttribute("aria-label", "Zoom");
  kopf.appendChild(knoepfe);
  const flaeche = document.createElement("div");
  flaeche.className = "bv-flaeche";
  const bild = document.createElement("img");
  bild.className = "bv-bild";
  bild.alt = "";
  bild.dataset.testid = "bildvorschau-bild";
  bild.decoding = "async";
  flaeche.appendChild(bild);
  const fehler = document.createElement("p");
  fehler.className = "bv-fehler";
  fehler.dataset.testid = "bildvorschau-fehler";
  fehler.hidden = true;
  flaeche.appendChild(fehler);
  wurzel.replaceChildren(kopf, flaeche);

  let stufe = 0, aktuell = null;
  for (const s of STUFEN) {
    const k = document.createElement("button");
    k.type = "button";
    k.className = "knopf knopf-mini";
    k.textContent = s === 0 ? "Einpassen" : s + "×";
    k.dataset.stufe = String(s);
    k.dataset.testid = "bildvorschau-zoom";
    k.addEventListener("click", () => { stufe = s; wende(); });
    knoepfe.appendChild(k);
  }
  function wende() {
    for (const k of knoepfe.children) k.setAttribute("aria-pressed", String(Number(k.dataset.stufe) === stufe));
    flaeche.classList.toggle("einpassen", stufe === 0);
    if (aktuell && aktuell.info && aktuell.info.breite && stufe > 0) {
      bild.style.width = aktuell.info.breite * stufe + "px";
      bild.style.height = aktuell.info.hoehe * stufe + "px";
    } else { bild.style.width = ""; bild.style.height = ""; }
  }

  return {
    /** pfad + bytes zeigen; null blendet die Vorschau aus (Editor wieder sichtbar). */
    zeige(pfad, bytes) {
      if (!pfad) { wurzel.hidden = true; editorEl.hidden = false; aktuell = null; bild.removeAttribute("src"); return; }
      const i = bildInfo(bytes);
      const p = pruefeBild(pfad, bytes);
      aktuell = { pfad, info: i };
      wurzel.hidden = false;
      editorEl.hidden = true;
      wurzel.dataset.pfad = pfad;
      delete wurzel.dataset.vorgebacken;
      bild.alt = pfad;
      info.textContent = (i && i.breite ? i.breite + " × " + i.hoehe + " · " : "") + "Quelle " + formatGroesse(bytes.byteLength) + (i ? " · " + i.art.toUpperCase() : "");
      fehler.hidden = p.ok;
      fehler.textContent = p.ok ? "" : p.fehler;
      if (i) bild.src = dataUrl(bytes); else bild.removeAttribute("src");
      bild.hidden = !i;
      stufe = i && i.breite && i.breite <= 256 && i.hoehe <= 256 ? 2 : 0;
      wende();
      // Vorbacken (aus dem Cache, sonst einmal neu): Größe und Stufen des Teiglings bzw. die Meldung wie zur Laufzeit
      if (vorbacker && p.ok) {
        const fuer = aktuell;
        vorbacker.vorbacke(pfad, bytes).then((r) => {
          if (aktuell !== fuer) return;
          if (r.ok) info.textContent += " · vorgebacken " + formatGroesse(r.teigling.byteLength) + " · " + r.kopf.stufen + (r.kopf.stufen === 1 ? " Stufe" : " Stufen");
          else if (r.fehler) { fehler.hidden = false; fehler.textContent = r.fehler; }
          wurzel.dataset.vorgebacken = r.ok ? "ja" : r.fehler ? "fehler" : "nein";
        });
      }
    },
    get offen() { return !wurzel.hidden; },
  };
}
