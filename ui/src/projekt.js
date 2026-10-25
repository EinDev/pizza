// Projekte im Playground (PROJEKTE.md §1, §3; SPEC §2.1; K-138, K-142): Pfadregeln, Dateiarten, Textnormalisierung, pizza.json,
// Grenzen und die Sammlung für den Worker – ohne DOM, damit Node-Tests sie direkt prüfen.
//
// Lader-Anbindung: Dies ist die EINZIGE Stelle der Seite, die `PizzaLang.projekt.*` (PA1: pruefePfad, ausDateien, lade) benutzt.
// `pruefePfad`, `ausDateien` und `ladePruefung` nehmen den Lader des geladenen Interpreters; die lokalen Fassungen (gleicher
// Wortlaut wie SPEC §2.1) sind nur Rückfall ohne Interpreter (Node-Tests, kaputtes pizza.js) und für Dinge, die der Lader nicht
// anbietet (Grenzen vor dem Hinzufügen, Live-Prüfung von pizza.json im Editor).
// Die Gegenstelle im Worker ist `quelleFuer` in site/js/worker.js.

export const HAUPTDATEI_STANDARD = "hauptgang.pizza";
export const PROJEKTDATEI = "pizza.json";
export const KIB = 1024, MIB = 1024 * 1024;
/** Grenzen des Laders (SPEC §2.1, ohne pruefung/): gelten beim Hinzufügen, beim ZIP-Import und für den Lauf. */
export const GRENZEN = { dateien: 100, datei: 2 * MIB, pizza: 512 * KIB, gesamt: 8 * MIB };

const TEXT_ENDUNGEN = new Set(["pizza", "txt", "json", "csv", "md"]);
const BILD_ENDUNGEN = new Set(["png", "jpg", "jpeg"]);
// Modelle (H-K16): glTF als Binärdatei (auch .gltf – JSON, aber gehasht wie gespeichert) und Puffer .bin für externe Daten
const MODELL_ENDUNGEN = new Set(["glb", "gltf"]);
const DATEN_ENDUNGEN = new Set(["bin"]);
// Klänge (H-K19a/b): WAV, FLAC und OGG Vorbis als Binärdatei, vorgebacken zum Klangteig
const KLANG_ENDUNGEN = new Set(["wav", "flac", "ogg"]);
const SEGMENT = /^[a-z0-9_-][a-z0-9_.-]*$/;

/** Der Lader des Interpreters (PA1), falls vorhanden. */
function lader() {
  const PL = typeof globalThis !== "undefined" ? globalThis.PizzaLang : null;
  return PL && PL.projekt && typeof PL.projekt === "object" ? PL.projekt : null;
}
/** true, sobald der Interpreter Projekte selbst laden kann (nur Anzeige/Hinweise; der Lauf entscheidet im Worker). */
export function laderVorhanden() { return !!(lader() && typeof lader().lade === "function"); }

export function endung(pfad) {
  const n = String(pfad || "").split("/").pop();
  const i = n.lastIndexOf(".");
  return i > 0 ? n.slice(i + 1).toLowerCase() : "";
}
/** "pizza" | "text" | "bild" | "modell" | "klang" | "daten" | null (nicht erlaubte Endung, PROJEKTE §1.3). */
export function dateiArt(pfad) {
  const e = endung(pfad);
  if (e === "pizza") return "pizza";
  if (TEXT_ENDUNGEN.has(e)) return "text";
  if (BILD_ENDUNGEN.has(e)) return "bild";
  if (MODELL_ENDUNGEN.has(e)) return "modell";
  if (DATEN_ENDUNGEN.has(e)) return "daten";
  if (KLANG_ENDUNGEN.has(e)) return "klang";
  return null;
}
export const istText = (pfad) => { const a = dateiArt(pfad); return a === "pizza" || a === "text"; };
/** Binärdateien (Bilder, Modelle, Klänge, Puffer) – liegen als Uint8Array in der Sammlung. */
export const istBinaerArt = (pfad) => { const a = dateiArt(pfad); return a === "bild" || a === "modell" || a === "klang" || a === "daten"; };
/** Dateien, die der Vorbacker vor dem Lauf bäckt (Bilder → Teigling, Modelle → Modellteig, Klänge → Klangteig). */
export const istVorbackArt = (pfad) => { const a = dateiArt(pfad); return a === "bild" || a === "modell" || a === "klang"; };
/** Testordner an der Wurzel – gehört nicht zum Programm (SPEC §2.1). */
export const istPruefung = (pfad) => String(pfad).startsWith("pruefung/");

/**
 * Projektprüfung für die Live-Diagnose (PROJEKTE §3.1: P0014–P0019 beim Tippen mit kurzer Verzögerung) → Fehler { code, text,
 * datei, zeile, spalte } | null. Ohne Lader (vor PA1) immer null – die Syntaxprüfung je Datei bleibt davon unberührt.
 */
export function ladePruefung(projekt) {
  const L = lader();
  if (!L || typeof L.lade !== "function") return null;
  try {
    const r = L.lade(projekt);
    return r && r.ok === false && r.fehler ? r.fehler : null;
  } catch (e) { return null; }
}

/** Lokale Pfadregel (SPEC §2.1) – null oder Fehlertext. */
export function pruefePfadLokal(pfad) {
  const p = String(pfad == null ? "" : pfad);
  const fehler = `"${p}" ist kein gültiger Dateipfad (nur a–z, 0–9, -, _, . und /).`;
  if (!p || p.length > 120) return fehler;
  const teile = p.split("/");
  if (teile.length > 8) return fehler;
  for (const t of teile) if (!t || t === "." || t === ".." || !SEGMENT.test(t)) return fehler;
  return null;
}
/** Pfad prüfen (Lader, sonst lokale Regel) → null | Fehlertext. Zusätzlich: nur erlaubte Dateiarten. */
export function pruefePfad(pfad) {
  const L = lader();
  let f = null;
  if (L && typeof L.pruefePfad === "function") {
    // Der Lader liefert einen kurzen Grund – angezeigt wird der Wortlaut der P0015-Meldung mit diesem Grund
    let grund;
    try { grund = L.pruefePfad(pfad); } catch (e) { grund = pruefePfadLokal(pfad); }
    if (grund) f = `"${pfad}" ist kein gültiger Dateipfad (nur a–z, 0–9, -, _, . und /)` + (/kein gültiger Dateipfad/.test(grund) ? "." : ": " + String(grund).replace(/\.$/, "") + ".");
  } else f = pruefePfadLokal(pfad);
  if (f) return String(f).replace(/^PizzaFehler P0015: /, "");
  if (!dateiArt(pfad)) return `„${String(pfad).split("/").pop()}“: diese Dateiart kennt der Ofen nicht (erlaubt: .pizza, .png, .jpg, .glb, .gltf, .bin, .wav, .flac, .ogg, .txt, .json, .csv, .md).`;
  return null;
}

/** Name/Pfad-Vorschlag → gültiges Pfadsegment (Kleinbuchstaben, Umlaute ausgeschrieben, Sonstiges → „-“). */
export function segmentAusName(name, standard = "datei") {
  let s = String(name || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_.-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|-+$/g, "")
    .slice(0, 80);
  s = s.replace(/^\.+/, "");
  return s || standard;
}
/** Tab-/Dateiname → gültiger Pfad einer .pizza-Datei („Hallo Welt.pizza“ → „hallo-welt.pizza“). */
export function pizzaPfadAusName(name) {
  const basis = segmentAusName(String(name || "").replace(/\.pizza$/i, ""), "hauptgang").replace(/\.+$/, "") || "hauptgang";
  return basis + ".pizza";
}
/** Anzeigename aus einem Datei-/Tab-Namen (ohne .pizza, Steuerzeichen raus, ≤ 80 Zeichen – wie saeubereName). */
export function projektNameAus(name) {
  const n = String(name || "").replace(/\.pizza$/i, "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  return n || "unbenannt";
}

/** Textnormalisierung an der Projektgrenze (PROJEKTE §1.3): \r\n → \n, einzelnes \r und BOM bleiben. */
export const normalisiereText = (s) => String(s).replace(/\r\n/g, "\n");

/** Bytes → Text (UTF-8 streng, BOM bleibt) oder Fehler. */
export function dekodiereText(bytes, pfad) {
  try {
    const t = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    return { ok: true, text: normalisiereText(t) };
  } catch (e) {
    return { ok: false, fehler: `${pfad} ist kein gültiger UTF-8-Text.` };
  }
}

const kodierer = typeof TextEncoder === "function" ? new TextEncoder() : null;
/** Größe in Bytes (Texte als UTF-8). */
export function groesse(inhalt) {
  if (inhalt instanceof Uint8Array) return inhalt.byteLength;
  return kodierer ? kodierer.encode(String(inhalt)).byteLength : String(inhalt).length;
}
const komma = (x) => String(x).replace(".", ",");
const kb = (n) => Math.ceil(n / KIB);
const mb = (n) => Math.ceil((n / MIB) * 10) / 10;
/** „312 KB“ / „5,3 MB“ (aufgerundet wie P0020). */
export function formatGroesse(n) {
  if (n < KIB) return n + " B";
  if (n < MIB) return kb(n) + " KB";
  return komma(mb(n)) + " MB";
}

/** Grenzen prüfen (SPEC §2.1, P0020-Gründe) – null oder Grund. pruefung/ zählt nicht. */
export function pruefeGrenzen(dateien) {
  const pfade = Object.keys(dateien).filter((p) => !istPruefung(p));
  if (pfade.length > GRENZEN.dateien) return `${pfade.length} Dateien, höchstens ${GRENZEN.dateien}`;
  let summe = 0;
  for (const p of pfade) {
    const n = groesse(dateien[p]);
    if (n > GRENZEN.datei) return `${p} hat ${komma(mb(n))} MB, höchstens 2 MB`;
    if (dateiArt(p) === "pizza" && n > GRENZEN.pizza) return `${p} hat ${kb(n)} KB, höchstens 512 KB`;
    summe += n;
  }
  if (summe > GRENZEN.gesamt) return `zusammen ${komma(mb(summe))} MB, höchstens 8 MB`;
  return null;
}

/** Lokale Auswertung von pizza.json (SPEC §2.1) → { name?, hauptdatei?, args? } | { fehler } | null (keine Projektdatei). */
export function leseProjektdateiLokal(text) {
  if (text == null) return null;
  const ungueltig = (g) => ({ fehler: `PizzaFehler P0015: pizza.json ist ungültig: ${g}.` });
  let j;
  try { j = JSON.parse(String(text)); } catch (e) { return ungueltig("kein gültiges JSON"); }
  if (!j || typeof j !== "object" || Array.isArray(j)) return ungueltig("kein Objekt");
  if (!("pizza" in j)) return ungueltig('"pizza" fehlt');
  if (!Number.isInteger(j.pizza)) return ungueltig('"pizza" muss eine Ganzzahl sein');
  if (j.pizza > 1) return { fehler: "PizzaFehler HOST: Diese Projektdatei braucht eine neuere pizza-Version." };
  for (const f of ["name", "hauptdatei", "beschreibung"]) if (f in j && typeof j[f] !== "string") return ungueltig(`"${f}" muss ein Text sein`);
  if ("name" in j && j.name.length > 80) return ungueltig('"name" ist zu lang');
  if ("beschreibung" in j && j.beschreibung.length > 500) return ungueltig('"beschreibung" ist zu lang');
  if ("args" in j && (!Array.isArray(j.args) || j.args.some((a) => typeof a !== "string"))) return ungueltig('"args" muss ein Blech aus Texten sein');
  if ("args" in j && (j.args.length > 32 || j.args.some((a) => a.length > 200))) return ungueltig('"args" ist zu lang');
  const r = {};
  if ("name" in j) r.name = j.name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if ("hauptdatei" in j) r.hauptdatei = j.hauptdatei;
  if ("args" in j) r.args = j.args.slice();
  if ("beschreibung" in j) r.beschreibung = j.beschreibung;
  return r;
}

/** Hauptdatei nach SPEC §2.1 bestimmen: pizza.json → hauptgang.pizza → einzige .pizza-Datei → vorschlag. */
export function bestimmeHauptdatei(dateien, vorschlag) {
  const pj = leseProjektdateiLokal(dateien[PROJEKTDATEI]);
  if (pj && !pj.fehler && pj.hauptdatei) return pj.hauptdatei;
  if (vorschlag && typeof dateien[vorschlag] === "string") return vorschlag;
  if (typeof dateien[HAUPTDATEI_STANDARD] === "string") return HAUPTDATEI_STANDARD;
  const pizzas = Object.keys(dateien).filter((p) => dateiArt(p) === "pizza" && !istPruefung(p));
  return pizzas.length === 1 ? pizzas[0] : (vorschlag || HAUPTDATEI_STANDARD);
}

/** pizza.json auswerten (Lader, sonst lokal) → { name, hauptdatei, args } | { fehler }. */
export function ausDateien(dateien, standardName) {
  const L = lader();
  if (L && typeof L.ausDateien === "function") {
    try {
      const r = L.ausDateien(dateien);
      if (r && !r.fehler) return { name: r.name || standardName || "unbenannt", hauptdatei: r.hauptdatei, args: Array.isArray(r.args) ? r.args : [] };
      if (r && r.fehler) return { fehler: typeof r.fehler === "string" ? r.fehler : r.fehler.text };
    } catch (e) { /* lokale Regel */ }
  }
  const pj = leseProjektdateiLokal(dateien[PROJEKTDATEI]);
  if (pj && pj.fehler) return { fehler: pj.fehler };
  const hauptdatei = bestimmeHauptdatei(dateien);
  return {
    name: (pj && pj.name) || standardName || projektNameAus(hauptdatei.split("/").pop()),
    hauptdatei,
    args: (pj && pj.args) || [],
  };
}

/** Text einer erzeugten pizza.json (beim ZIP-/EXE-Export und Teilen, wenn das Projekt keine hat; PROJEKTE §1.4). */
export function erzeugeProjektdatei({ name, hauptdatei }) {
  return JSON.stringify({ pizza: 1, name: String(name || "unbenannt").slice(0, 80), hauptdatei: hauptdatei || HAUPTDATEI_STANDARD }, null, 2) + "\n";
}

/** Felder einer vorhandenen pizza.json ändern (Umbenennen, „Als Hauptdatei“) – null, wenn sie kein gültiges Objekt ist. */
export function aendereProjektdatei(text, felder) {
  let j;
  try { j = JSON.parse(String(text)); } catch (e) { return null; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  for (const [k, v] of Object.entries(felder)) j[k] = v;
  return JSON.stringify(j, null, 2) + "\n";
}

/** Live-Prüfung des Texts einer pizza.json (Editor-Diagnose) → null | Fehlertext. */
export function pruefeProjektdatei(text) {
  const r = leseProjektdateiLokal(text);
  return r && r.fehler ? r.fehler : null;
}

/**
 * Sammlung für den Worker (ARCHITEKTUR §2): { dateien, hauptdatei, name } – ohne pruefung/, Texte normalisiert, Binärdaten als
 * Kopie (die Puffer werden übertragen). `uebertragbar` listet die ArrayBuffer für postMessage.
 */
export function sammlung(projekt, dateien) {
  const aus = {};
  const uebertragbar = [];
  for (const [pfad, inhalt] of Object.entries(dateien)) {
    if (istPruefung(pfad)) continue;
    if (inhalt instanceof Uint8Array) { const k = inhalt.slice(); aus[pfad] = k; uebertragbar.push(k.buffer); }
    else aus[pfad] = normalisiereText(inhalt);
  }
  return { projekt: { dateien: aus, hauptdatei: projekt.hauptdatei, name: projekt.name }, uebertragbar };
}

/** Alle .pizza-Texte des Programms hintereinander (für Erkennungen wie „nutzt Herd/Theke/Eingabe“). */
export function programmText(dateien) {
  return Object.entries(dateien).filter(([p, i]) => dateiArt(p) === "pizza" && !istPruefung(p) && typeof i === "string").map(([, i]) => i).join("\n");
}

/** Tab-Titel: Dateiname; bei gleichem Namen in mehreren Ordnern mit Ordner („welt/tisch.pizza“). */
export function tabTitel(pfade) {
  const zaehl = new Map();
  for (const p of pfade) { const n = p.split("/").pop(); zaehl.set(n, (zaehl.get(n) || 0) + 1); }
  const r = {};
  for (const p of pfade) { const n = p.split("/").pop(); r[p] = zaehl.get(n) > 1 ? p : n; }
  return r;
}

/** Eindeutiger Pfad im Projekt: „a.pizza“ → „a-2.pizza“ … */
export function eindeutigerPfad(pfad, belegt) {
  if (!belegt.has(pfad)) return pfad;
  const m = /^(.*?)(\.[a-z0-9]+)?$/.exec(pfad);
  for (let i = 2; ; i++) { const n = `${m[1]}-${i}${m[2] || ""}`; if (!belegt.has(n)) return n; }
}

/** Erreichbarkeit (nur Anzeige im Dateibaum, „wird von keiner Datei bestellt“): einfache Suche nach `bestellt "…";`. */
export function erreichbarePizzas(dateien, hauptdatei) {
  const gesehen = new Set();
  const stapel = [hauptdatei];
  const re = /(?:^|[;\s}])bestellt\s+"([^"\\\n]*)"\s*;/g;
  while (stapel.length) {
    const p = stapel.pop();
    if (gesehen.has(p) || typeof dateien[p] !== "string") continue;
    gesehen.add(p);
    const text = dateien[p].replace(/\/\/[^\n]*/g, "");
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) stapel.push(m[1]);
  }
  return gesehen;
}
