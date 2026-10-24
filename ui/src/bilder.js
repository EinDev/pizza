// Bilddateien im Playground (PROJEKTE.md §3.1, §5.4, §5.8): Typprüfung nach Endung UND Signatur, Kopfdaten (Pixelgröße) für die
// Vorschau, data:-URL (CSP img-src 'self' data: bleibt – keine blob:-Bilder) und die Schnittstelle zum Vorbacker.
//
// Vorbacker (PD1): `site/js/herd/teigling.js` (Hülle PizzaVorbacker) + `teigling.wasm`, erst beim ersten Bild geladen. Beim
// Hinzufügen prüft zuerst der Kopf (Endung, Signatur, Größe – schnell, ohne Wasm), dann bäckt der Vorbacker vor; Ergebnis im
// IndexedDB-Speicher `teiglinge` (Schlüssel PizzaVorbacker.cacheSchluessel = SHA-256 der Quelle + Formatversion, LRU 128 MiB).
// Beim Lauf gehen die Teiglinge und das kompilierte Modul an den Worker (`teiglinge`, `vorbacker`); der Interpreter prüft jeden.

export const MAX_SEITE = 2048;
export const VORBACKER_URL = "js/herd/teigling.wasm";
export const HUELLE_URL = "js/herd/teigling.js";

const istPng = (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
const istJpeg = (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** Kopfdaten → { art: "png" | "jpeg", breite, hoehe } | { art, breite: null, hoehe: null } (Signatur ok, Kopf unklar) | null. */
export function bildInfo(b) {
  if (!(b instanceof Uint8Array)) return null;
  if (istPng(b)) {
    if (b.length >= 24 && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52) {
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      return { art: "png", breite: dv.getUint32(16), hoehe: dv.getUint32(20) };
    }
    return { art: "png", breite: null, hoehe: null };
  }
  if (istJpeg(b)) {
    // Segmente bis zum ersten SOFn (außer DHT C4, JPG C8, DAC CC)
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const laenge = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { art: "jpeg", breite: (b[i + 7] << 8) | b[i + 8], hoehe: (b[i + 5] << 8) | b[i + 6] };
      }
      if (m === 0xda || laenge < 2) break;
      i += 2 + laenge;
    }
    return { art: "jpeg", breite: null, hoehe: null };
  }
  return null;
}

/** Prüfung beim Hinzufügen: Endung + Signatur + Größe → { ok: true, info } | { ok: false, fehler } (Texte wie SPEC §18.5). */
export function pruefeBild(pfad, bytes) {
  const info = bildInfo(bytes);
  const e = String(pfad).split(".").pop().toLowerCase();
  const erwartet = e === "png" ? "png" : e === "jpg" || e === "jpeg" ? "jpeg" : null;
  if (!info || !erwartet || info.art !== erwartet || info.breite === 0 || info.hoehe === 0) return { ok: false, fehler: `${pfad} ist kein lesbares Bild (PNG oder JPEG).` };
  if (info.breite > MAX_SEITE || info.hoehe > MAX_SEITE) return { ok: false, fehler: `${pfad} ist zu groß (${info.breite} × ${info.hoehe}) – höchstens ${MAX_SEITE} × ${MAX_SEITE} Pixel.` };
  return { ok: true, info };
}

/** data:-URL für die Vorschau (nur für erkannte Bilder). */
export function dataUrl(bytes) {
  const info = bildInfo(bytes);
  const typ = info && info.art === "png" ? "image/png" : "image/jpeg";
  let s = "";
  const STUECK = 0x8000;
  for (let i = 0; i < bytes.length; i += STUECK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + STUECK));
  return "data:" + typ + ";base64," + btoa(s);
}

/** Hex-Text eines Hashes. */
const hex = (u8) => [...u8].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Meldung zu einem Fehler-Teigling (Texte wie SPEC §18.5 – zur Laufzeit erzeugt sie der Herd-Kern genauso). */
export function teiglingFehlerText(pfad, kopf) {
  if (!kopf) return `${pfad} ist kein lesbares Bild (PNG oder JPEG).`;
  if (kopf.fehler && kopf.fehler.art === "zu-gross") return `${pfad} ist zu groß (${kopf.fehler.breite} × ${kopf.fehler.hoehe}) – höchstens ${MAX_SEITE} × ${MAX_SEITE} Pixel.`;
  if (kopf.fehler) return `${pfad} ist kein lesbares Bild (PNG oder JPEG).`;
  return null;
}

/** Skript (klassisch, UMD) einmal laden → window.PizzaVorbacker. */
function ladeHuelle(url) {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(null);
  if (window.PizzaVorbacker) return Promise.resolve(window.PizzaVorbacker);
  return new Promise((ok) => {
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => ok(window.PizzaVorbacker || null);
    s.onerror = () => ok(null);
    document.head.appendChild(s);
  });
}

/**
 * Vorbacker der Seite (PD1: site/js/herd/teigling.js + teigling.wasm, beide erst bei Bedarf geladen):
 *   modul(): Promise<WebAssembly.Module | null>     – für Worker „start“ als `vorbacker` (einmal je Seite kompiliert)
 *   vorbacke(pfad, bytes): Promise<{ ok: true, teigling, kopf, schluessel } | { ok: false, fehler } | { ok: false, grund }>
 *       Kopfprüfung, dann Cache (Ablage `teiglinge`, Schlüssel = SHA-256 der Quelle + Formatversion) über `besorge`
 *       (ein veralteter Eintrag wird ersetzt) – Fehler-Teiglinge ergeben die Meldung wie zur Laufzeit.
 *   teiglingeFuer({ pfad → bytes }): Promise<{ pfad → teigling }>   – für den Lauf (der Interpreter prüft jeden noch einmal)
 * Für Node-Tests: `huelle` (PizzaVorbacker) und `wasm` (Bytes) direkt übergeben.
 */
export function erstelleVorbacker({ ablage = null, url = VORBACKER_URL, huelleUrl = HUELLE_URL, huelle = null, wasm = null } = {}) {
  let modulV = null, instanzV = null;
  const modul = () => {
    if (!modulV) {
      modulV = (wasm ? Promise.resolve(wasm) : (url ? fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)) : Promise.resolve(null)))
        .then((b) => (b ? WebAssembly.compile(b) : null)).catch(() => null);
    }
    return modulV;
  };
  const instanz = () => {
    if (!instanzV) {
      instanzV = Promise.all([huelle ? Promise.resolve(huelle) : ladeHuelle(huelleUrl), modul()])
        .then(([PV, m]) => (PV && m ? { PV, vb: PV.ausModul(m) } : null)).catch(() => null);
    }
    return instanzV;
  };
  async function vorbacke(pfad, bytes) {
    const p = pruefeBild(pfad, bytes);
    if (!p.ok) return { ok: false, fehler: p.fehler };
    const i = await instanz();
    if (!i) return { ok: false, grund: "Der Vorbacker (teigling.wasm) lässt sich nicht laden." };
    const schluessel = i.PV.cacheSchluessel(hex(i.vb.sha256(bytes)));
    let alt = null;
    try { alt = ablage ? await ablage.teiglingHole(schluessel) : null; } catch (e) { alt = null; }
    const teigling = i.vb.besorge(alt, bytes);
    if (ablage && teigling !== alt) { try { await ablage.teiglingLege(schluessel, teigling); } catch (e) { /* Cache ist nur Beschleunigung */ } }
    const kopf = i.PV.kopf(teigling);
    const fehler = teiglingFehlerText(pfad, kopf);
    if (fehler) return { ok: false, fehler, teigling, schluessel };
    return { ok: true, teigling, kopf, schluessel };
  }
  return {
    get verfuegbar() { return !!(url || wasm); },
    modul,
    vorbacke,
    async teiglingeFuer(bilder) {
      const aus = {};
      for (const [pfad, bytes] of Object.entries(bilder)) {
        const r = await vorbacke(pfad, bytes);
        if (r.teigling) aus[pfad] = r.teigling;
      }
      return aus;
    },
    /** Teigmenge (Summe verschiedener Quellen ohne Fehler-Teiglinge) in Bytes – für die Anzeige. */
    async teigmenge(teiglinge) { const i = await instanz(); return i ? i.PV.teigmenge(teiglinge) : 0; },
  };
}