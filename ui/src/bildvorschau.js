// Bildvorschau für Bilddateien des Projekts (PROJEKTE.md §3.1, §5.8): Pixelgröße, Dateigröße, pixelscharfe Zoomstufen; Anzeige
// über eine data:-URL (CSP img-src 'self' data: bleibt); dazu „vorgebacken … · n Stufen“ aus dem Teigling (Vorbacker, PD1).
// Modelle (H-K16, .glb/.gltf): Kennzahlen aus dem Modellteig („612 Ecken · 3 Bilder · vorgebacken 1,2 MB“) bzw. die Meldung wie
// zur Laufzeit; Puffer (.bin): nur die Größe.
import { bildInfo, dataUrl, pruefeBild, modellInfo, pruefeModell } from "./bilder.js";
import { formatGroesse, dateiArt } from "./projekt.js";

/** 612 · 12 000 (Leerzeichen als Tausendertrenner, wie die Meldungen des Vorbackers) */
const tausender = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

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
    /** pfad + bytes zeigen; null blendet die Vorschau aus (Editor wieder sichtbar). sammlung: alle Projektdateien (Modelle). */
    zeige(pfad, bytes, sammlung = null) {
      if (!pfad) { wurzel.hidden = true; editorEl.hidden = false; aktuell = null; bild.removeAttribute("src"); return; }
      const art = dateiArt(pfad);
      if (art === "modell" || art === "daten") return zeigeModell(pfad, bytes, art, sammlung);
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

  function zeigeModell(pfad, bytes, art, sammlung) {
    aktuell = { pfad, info: null };
    wurzel.hidden = false;
    editorEl.hidden = true;
    wurzel.dataset.pfad = pfad;
    delete wurzel.dataset.vorgebacken;
    bild.removeAttribute("src");
    bild.hidden = true;
    const mi = art === "modell" ? modellInfo(bytes) : null;
    info.textContent = (art === "modell" ? "glTF-Modell" + (mi ? " (" + mi.art.toUpperCase() + ")" : "") : "Daten") + " · Quelle " + formatGroesse(bytes.byteLength);
    const p = art === "modell" ? pruefeModell(pfad, bytes) : { ok: true };
    fehler.hidden = p.ok;
    fehler.textContent = p.ok ? "" : p.fehler;
    stufe = 0;
    wende();
    if (art === "modell" && vorbacker && vorbacker.vorbackeModell && p.ok) {
      const fuer = aktuell;
      vorbacker.vorbackeModell(pfad, sammlung || { [pfad]: bytes }).then((r) => {
        if (aktuell !== fuer) return;
        if (r.ok) {
          const k = r.kopf;
          info.textContent += " · " + tausender(k.ecken) + " Ecken · " + tausender(k.dreiecke) + " Dreiecke · " + k.knoten + " Knoten · " + k.bilder
            + (k.bilder === 1 ? " Bild" : " Bilder") + " · vorgebacken " + formatGroesse(r.teig.byteLength);
        } else if (r.fehler) { fehler.hidden = false; fehler.textContent = r.fehler; }
        wurzel.dataset.vorgebacken = r.ok ? "ja" : r.fehler ? "fehler" : "nein";
      });
    }
  }
}
