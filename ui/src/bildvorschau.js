// Bildvorschau für Bilddateien des Projekts (PROJEKTE.md §3.1, §5.8): Pixelgröße, Dateigröße, pixelscharfe Zoomstufen; Anzeige
// über eine data:-URL (CSP img-src 'self' data: bleibt); dazu „vorgebacken … · n Stufen“ aus dem Teigling (Vorbacker, PD1).
// Modelle (H-K16, .glb/.gltf): Kennzahlen aus dem Modellteig („612 Ecken · 3 Bilder · vorgebacken 1,2 MB“) bzw. die Meldung wie
// zur Laufzeit; Puffer (.bin): nur die Größe. Klänge (H-K19a/b, .wav/.flac/.ogg): Kennzahlen aus dem Klangteig („2,5 s · 22 050 Hz ·
// mono · vorgebacken 108 KB“) und ein Abspielknopf – Ton erst nach dem Klick (Autoplay-Regel), in automatisierten Browsern
// (E2E) stumm in einen OfflineAudioContext gerendert (data-gespielt mit dem Pegel).
import { bildInfo, dataUrl, pruefeBild, modellInfo, pruefeModell, klangInfo, pruefeKlang } from "./bilder.js";
import { formatGroesse, dateiArt } from "./projekt.js";

/** 612 · 12 000 (Leerzeichen als Tausendertrenner, wie die Meldungen des Vorbackers) */
const tausender = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const STUFEN = [0, 1, 2, 4, 8]; // 0 = einpassen

/** 2,5 s · 1:05 min (Dezimalkomma) */
const sekunden = (s) => (s < 60 ? (Math.round(s * 100) / 100).toString().replace(".", ",") + " s" : Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0") + " min");

/** Klangteig (H-K19a, Kopf 64 B: Rate @48, Kanäle @52, Frames @56) → { pcm: Int16Array, rate, kanaele, frames } | null */
function klangPcm(t) {
  if (!(t instanceof Uint8Array) || t.length < 64 || t[10] !== 0) return null;
  const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const rate = dv.getUint32(48, true), kanaele = dv.getUint16(52, true), frames = dv.getUint32(56, true);
  if (frames < 1 || (kanaele !== 1 && kanaele !== 2) || 64 + frames * kanaele * 2 !== t.length) return null;
  const pcm = new Int16Array(frames * kanaele);
  for (let i = 0; i < pcm.length; i++) pcm[i] = dv.getInt16(64 + 2 * i, true);
  return { pcm, rate, kanaele, frames };
}
function audioPuffer(ctx, k) {
  const b = ctx.createBuffer(k.kanaele, k.frames, k.rate);
  for (let c = 0; c < k.kanaele; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < k.frames; i++) d[i] = k.pcm[i * k.kanaele + c] / 32767;
  }
  return b;
}

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
  // Abspielknopf (nur für Klänge)
  const spielen = document.createElement("button");
  spielen.type = "button";
  spielen.className = "knopf knopf-mini bv-spielen";
  spielen.dataset.testid = "klangvorschau-spielen";
  spielen.hidden = true;
  spielen.textContent = "▶ Abspielen";
  kopf.appendChild(spielen);
  wurzel.replaceChildren(kopf, flaeche);
  let klangTeig = null, klangQuelle = null, klangKontext = null;
  function klangHalt() {
    if (klangQuelle) { try { klangQuelle.stop(); } catch (e) { /* schon aus */ } klangQuelle = null; }
    spielen.textContent = "▶ Abspielen";
  }
  spielen.addEventListener("click", async () => {
    if (klangQuelle) { klangHalt(); return; }
    const pcm = klangPcm(klangTeig);
    if (!pcm) return;
    const automatisiert = typeof navigator !== "undefined" && navigator.webdriver === true;
    const OAC = typeof window !== "undefined" && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
    const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (automatisiert) {
      // E2E: nie hörbar – derselbe Puffer offline gerendert, Pegel als Prüfwert
      if (!OAC) return;
      const ctx = new OAC(pcm.kanaele, pcm.frames, pcm.rate);
      const q = ctx.createBufferSource();
      q.buffer = audioPuffer(ctx, pcm);
      q.connect(ctx.destination);
      q.start();
      const b = await ctx.startRendering();
      let s = 0;
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      wurzel.dataset.gespielt = String(Math.sqrt(s / Math.max(1, d.length)));
      return;
    }
    if (!AC) return;
    if (!klangKontext) klangKontext = new AC();
    try { await klangKontext.resume(); } catch (e) { /* bleibt still */ }
    const q = klangKontext.createBufferSource();
    q.buffer = audioPuffer(klangKontext, pcm);
    q.connect(klangKontext.destination);
    q.onended = () => { if (klangQuelle === q) klangHalt(); };
    q.start();
    klangQuelle = q;
    spielen.textContent = "■ Anhalten";
  });

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
      klangHalt();
      klangTeig = null;
      spielen.hidden = true;
      knoepfe.hidden = false;
      delete wurzel.dataset.gespielt;
      if (!pfad) { wurzel.hidden = true; editorEl.hidden = false; aktuell = null; bild.removeAttribute("src"); return; }
      const art = dateiArt(pfad);
      if (art === "klang") return zeigeKlang(pfad, bytes);
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

  function zeigeKlang(pfad, bytes) {
    aktuell = { pfad, info: null };
    wurzel.hidden = false;
    editorEl.hidden = true;
    wurzel.dataset.pfad = pfad;
    delete wurzel.dataset.vorgebacken;
    bild.removeAttribute("src");
    bild.hidden = true;
    knoepfe.hidden = true;
    const ki = klangInfo(bytes);
    info.textContent = "Klang" + (ki ? " (" + ki.art.toUpperCase() + ")" : "") + " · Quelle " + formatGroesse(bytes.byteLength);
    const p = pruefeKlang(pfad, bytes);
    fehler.hidden = p.ok;
    fehler.textContent = p.ok ? "" : p.fehler;
    stufe = 0;
    wende();
    if (vorbacker && vorbacker.vorbackeKlang && p.ok) {
      const fuer = aktuell;
      vorbacker.vorbackeKlang(pfad, bytes).then((r) => {
        if (aktuell !== fuer) return;
        if (r.ok) {
          const k = r.kopf;
          info.textContent += " · " + sekunden(k.dauer) + " · " + tausender(k.rate) + " Hz · " + (k.kanaele === 2 ? "stereo" : "mono") + " · vorgebacken "
            + formatGroesse(r.teig.byteLength);
          klangTeig = r.teig;
          spielen.hidden = false;
        } else if (r.fehler) { fehler.hidden = false; fehler.textContent = r.fehler; }
        wurzel.dataset.vorgebacken = r.ok ? "ja" : r.fehler ? "fehler" : "nein";
      });
    }
  }

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
