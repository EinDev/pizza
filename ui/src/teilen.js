// Teilen über die Durchreiche (PROJEKTE.md §4, K-143) – ohne DOM, damit Node-Tests den echten Dienst ansprechen.
//
// Ein geteiltes Projekt ist ein Manifest (`pizza-projekt/1`, kanonisch vom Dienst gespeichert) plus inhaltsadressierte Blobs
// (SHA-256 der Bytes). Teilen: Manifest bauen → `POST api/blob/fehlend` → fehlende Blobs nacheinander `PUT api/blob/<sha>` →
// `POST api/teilen` (neuer Link, Antwort mit dem Bearbeitungsschlüssel – nur dieses eine Mal) bzw. `POST api/teilen/<id>` mit
// `Authorization: Bearer <schlüssel>` (neue Version). Laden: `GET api/teilen/<id>[@n]` → Blobs per `GET api/blob/<sha>`, jeder
// Blob wird gegen Hash und Größe geprüft, Texte streng als UTF-8 gelesen (§1.3).
//
// Links (E21): `#h=<id>`, `#h=<id>@<n>`, `#app=<id>`, `#app=<id>@<n>`; alte Hastebin-Schlüssel (10 Kleinbuchstaben) verfallen
// mit klarer Meldung (F6). Die Wiederholung bei 429 ist sanft: ohne `Retry-After` (nginx `limit_req`) wartet der Client 1, 2, 4,
// 8 s; nennt der Dienst selbst eine lange Wartezeit, wird nicht wiederholt, sondern seine Meldung gezeigt.
import {
  ausDateien, aendereProjektdatei, dateiArt, dekodiereText, erzeugeProjektdatei, formatGroesse, groesse, istPruefung,
  leseProjektdateiLokal, normalisiereText, pruefeGrenzen, pruefePfad, PROJEKTDATEI, GRENZEN,
} from "./projekt.js";

export const FORMAT = "pizza-projekt/1";
export const ID_MUSTER = /^[0-9A-Za-z]{12}$/;
export const ALT_MUSTER = /^[a-z]{10}$/;
export const SCHLUESSEL_MUSTER = /^[A-Za-z0-9_-]{43}$/;
export const ALT_TEXT = "Dieser Link stammt vom alten Teilen-Dienst und ist nicht mehr verfügbar.";
export const WEG_TEXT = "Diesen Link gibt es nicht (mehr). Geteilte Links laufen eine Weile nach der letzten Version ab.";
const NAME_MAX = 80;
const BESCHREIBUNG_MAX = 500;

/** Fehler beim Teilen/Laden – `art`: "weg" (404), "alt" (F6), "schluessel" (403), "grenze", "netz", "server". */
export class TeilenFehler extends Error {
  constructor(text, { art = "server", status = null } = {}) { super(text); this.name = "TeilenFehler"; this.art = art; this.status = status; }
}

// ───────────────────────────── Links ─────────────────────────────

/** Wert hinter `h=`/`app=` → { id, version } | { alt: true } | null (ungültig). `@` darf URL-kodiert (%40) kommen. */
export function leseLinkWert(wert) {
  const w = String(wert == null ? "" : wert).replace(/%40/gi, "@");
  if (ALT_MUSTER.test(w)) return { alt: true };
  const m = /^([0-9A-Za-z]{12})(?:@([1-9][0-9]{0,5}))?$/.exec(w);
  return m ? { id: m[1], version: m[2] ? Number(m[2]) : null } : null;
}
/** `location.hash` → { art: "h" | "app", wert, link } | null. */
export function linkAusHash(hash) {
  const m = /(?:^#|&)(h|app)=([^&]*)(?:&|$)/.exec(String(hash || ""));
  return m ? { art: m[1], wert: m[2], link: leseLinkWert(m[2]) } : null;
}
export const linkWert = (id, version = null) => id + (version ? "@" + version : "");
/** Alle vier Adressen eines Links (E21). */
export function linkAdressen(basis, id, version) {
  return {
    code: basis + "#h=" + id, app: basis + "#app=" + id,
    codeFest: basis + "#h=" + linkWert(id, version), appFest: basis + "#app=" + linkWert(id, version),
  };
}
/** Projekt-Quelle eines geöffneten Code-Links (PROJEKTE §3.2): `teilen:<id>@<n>`. */
export const teilenQuelle = (id, version) => "teilen:" + id + "@" + version;
/** Eingegebener Schlüssel (F10) → bereinigt oder null. */
export function pruefeSchluessel(text) {
  const s = String(text == null ? "" : text).trim().replace(/^Bearer\s+/i, "");
  return SCHLUESSEL_MUSTER.test(s) ? s : null;
}

/** Seitentitel einer App: „zahlenraten.pizza“ → „zahlenraten“. */
export function appTitel(name) {
  const n = saeubere(name, NAME_MAX);
  return n ? n.replace(/\.pizza$/i, "").trim() || null : null;
}
function saeubere(text, max) {
  if (typeof text !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const n = [...text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim()].slice(0, max).join("");
  return n.isWellFormed && !n.isWellFormed() ? null : (n || null);
}

// ───────────────────────────── /api/konfig, Texte ─────────────────────────────

/** Antwort von /api/konfig → { teilen, tage (Zahl, null = unbegrenzt, undefined = unbekannt), grenzen }. */
export function leseKonfig(k) {
  const g = k && typeof k.grenzen === "object" && k.grenzen ? k.grenzen : {};
  const zahl = (x, std) => (Number.isSafeInteger(x) && x > 0 ? x : std);
  return {
    teilen: !(k && k.teilen === false),
    tage: !k || !("aufbewahrungTage" in k) ? undefined : (Number.isFinite(k.aufbewahrungTage) && k.aufbewahrungTage > 0 ? k.aufbewahrungTage : null),
    grenzen: {
      dateien: zahl(g.dateien, GRENZEN.dateien), dateiBytes: zahl(g.dateiBytes, GRENZEN.datei),
      projektBytes: zahl(g.projektBytes, GRENZEN.gesamt), pizzaBytes: zahl(g.pizzaBytes, GRENZEN.pizza),
    },
  };
}
const zweistellig = (n) => String(n).padStart(2, "0");
/** UTC-Datum `JJJJ-MM-TT` → „TT.MM.JJJJ“. */
export const datumText = (tag) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tag || "")); return m ? m[3] + "." + m[2] + "." + m[1] : ""; };
/** Ablauftag (einschließlich) bei einer Version heute: UTC heute + Tage (wie der Dienst, §4.5). */
export function ablaufAb(tage, jetzt = Date.now()) {
  if (!(tage > 0)) return null;
  const d = new Date(Date.parse(new Date(jetzt).toISOString().slice(0, 10) + "T00:00:00Z") + tage * 86_400_000);
  return d.getUTCFullYear() + "-" + zweistellig(d.getUTCMonth() + 1) + "-" + zweistellig(d.getUTCDate());
}
/** Aufbewahrung im Dialog (§4.4). `ablauf` (UTC-Tag vom Dienst) hat Vorrang vor der Rechnung. */
export function dauerText(konfig, { ablauf, jetzt } = {}) {
  if (!konfig || konfig.tage === undefined) return "";
  if (konfig.tage === null) return "Der Link bleibt gespeichert, bis du ihn löschst.";
  const bis = datumText(ablauf || ablaufAb(konfig.tage, jetzt));
  return "Der Link bleibt " + (konfig.tage === 1 ? "1 Tag" : konfig.tage + " Tage") + " nach der letzten Version gültig (bis " + bis +
    ") – jede neue Version verlängert ihn.";
}
/** „3 Dateien, 182 KB“. */
export const umfangText = (anzahl, bytes) => (anzahl === 1 ? "1 Datei" : anzahl + " Dateien") + ", " + formatGroesse(bytes);

// ───────────────────────────── SHA-256 ─────────────────────────────

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
/** Rückfall ohne `crypto.subtle` (unsicherer Kontext, z. B. http im LAN). */
export function sha256Js(bytes) {
  const n = bytes.length, bits = n * 8;
  const laenge = ((n + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(laenge);
  m.set(bytes); m[n] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(laenge - 8, Math.floor(bits / 0x100000000)); dv.setUint32(laenge - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < laenge; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
}
/** SHA-256 als 64 Kleinbuchstaben-Hex. */
export async function sha256Hex(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (subtle) {
    try {
      const d = new Uint8Array(await subtle.digest("SHA-256", bytes));
      let s = "";
      for (const b of d) s += b.toString(16).padStart(2, "0");
      return s;
    } catch (e) { /* Rückfall */ }
  }
  return sha256Js(bytes);
}

// ───────────────────────────── Manifest ─────────────────────────────

const kodierer = new TextEncoder();
const bytesVon = (inhalt) => (inhalt instanceof Uint8Array ? inhalt : kodierer.encode(normalisiereText(inhalt)));

/**
 * Sammlung (`projekte.sammlung({ mitProjektdatei: true }).projekt`: { dateien, hauptdatei, name }) → { manifest, blobs: Map(sha →
 * Bytes), anzahl, bytes }. `name`, `hauptdatei`, `beschreibung`, `args` sind Kopien aus pizza.json (§4.2) – maßgeblich bleibt beim
 * Empfänger `ausDateien`. Weicht deren Hauptdatei vom Projekt ab (pizza.json ohne `hauptdatei`, mehrere .pizza-Dateien), bekommt
 * die geteilte pizza.json die Hauptdatei des Projekts – sonst liefe beim Empfänger etwas anderes.
 */
export async function baueManifest(projekt) {
  const dateien = {};
  for (const [p, i] of Object.entries(projekt.dateien || {})) if (!istPruefung(p)) dateien[p] = i;
  if (dateien[PROJEKTDATEI] == null) dateien[PROJEKTDATEI] = erzeugeProjektdatei(projekt);
  for (const p of Object.keys(dateien)) {
    const f = pruefePfad(p);
    if (f) throw new TeilenFehler(f, { art: "grenze" });
  }
  let aus = ausDateien(dateien, projekt.name);
  if (aus.fehler) throw new TeilenFehler(String(aus.fehler).replace(/^PizzaFehler [A-Z0-9]+: /, ""), { art: "grenze" });
  if (projekt.hauptdatei && aus.hauptdatei !== projekt.hauptdatei && typeof dateien[projekt.hauptdatei] === "string") {
    const neu = aendereProjektdatei(dateien[PROJEKTDATEI], { hauptdatei: projekt.hauptdatei });
    if (neu != null) { dateien[PROJEKTDATEI] = neu; aus = ausDateien(dateien, projekt.name); }
  }
  if (dateiArt(aus.hauptdatei) !== "pizza" || typeof dateien[aus.hauptdatei] !== "string") {
    throw new TeilenFehler("Die Hauptdatei „" + aus.hauptdatei + "“ fehlt im Projekt.", { art: "grenze" });
  }
  const pj = leseProjektdateiLokal(dateien[PROJEKTDATEI]);
  const blobs = new Map();
  const liste = [];
  let summe = 0;
  for (const pfad of Object.keys(dateien).sort()) {
    const b = bytesVon(dateien[pfad]);
    const sha = await sha256Hex(b);
    blobs.set(sha, b);
    liste.push({ pfad, sha256: sha, groesse: b.byteLength });
    summe += b.byteLength;
  }
  const manifest = { format: FORMAT, name: saeubere(aus.name, NAME_MAX) || saeubere(projekt.name, NAME_MAX) || "unbenannt", hauptdatei: aus.hauptdatei };
  const beschreibung = pj && !pj.fehler ? saeubere(pj.beschreibung, BESCHREIBUNG_MAX) : null;
  if (beschreibung) manifest.beschreibung = beschreibung;
  if (aus.args && aus.args.length) manifest.args = aus.args.slice();
  manifest.dateien = liste;
  return { manifest, blobs, anzahl: liste.length, bytes: summe, dateien };
}

/** Grenzen vor dem Hochladen (§4.6, Werte aus /api/konfig) → null | Grund. */
export function pruefeTeilenGrenzen(dateien, grenzen = leseKonfig(null).grenzen) {
  const lokal = pruefeGrenzen(dateien);
  if (lokal) return lokal;
  const pfade = Object.keys(dateien).filter((p) => !istPruefung(p));
  if (pfade.length > grenzen.dateien) return pfade.length + " Dateien, höchstens " + grenzen.dateien;
  let summe = 0;
  for (const p of pfade) {
    const n = groesse(dateien[p]);
    if (n > grenzen.dateiBytes) return p + " hat " + formatGroesse(n) + ", höchstens " + formatGroesse(grenzen.dateiBytes);
    if (dateiArt(p) === "pizza" && n > grenzen.pizzaBytes) return p + " hat " + formatGroesse(n) + ", höchstens " + formatGroesse(grenzen.pizzaBytes);
    summe += n;
  }
  if (summe > grenzen.projektBytes) return "zusammen " + formatGroesse(summe) + ", höchstens " + formatGroesse(grenzen.projektBytes);
  return null;
}

// ───────────────────────────── HTTP ─────────────────────────────

const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));

async function anfrage(o, pfad, init = {}) {
  const f = o.fetch || globalThis.fetch;
  const warte = o.warte || schlafen;
  const versuche = o.versuche == null ? 4 : o.versuche;
  for (let i = 0; ; i++) {
    let r;
    try { r = await f((o.basis || "") + pfad, { credentials: "same-origin", ...init }); }
    catch (e) { throw new TeilenFehler("Keine Verbindung zum Server. Bitte versuch es später erneut.", { art: "netz" }); }
    if (r.status !== 429 || i >= versuche) return r;
    const ra = Number(r.headers && r.headers.get ? r.headers.get("Retry-After") : NaN);
    if (Number.isFinite(ra) && ra > 10) return r;           // der Dienst selbst bremst lange → seine Meldung zeigen
    await warte(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(8000, 1000 * 2 ** i));
  }
}
async function json(r) { try { return await r.json(); } catch (e) { return null; } }
const JSON_KOPF = { "Content-Type": "application/json", Accept: "application/json" };

async function fehlerAus(r, standard) {
  const d = await json(r);
  const text = d && typeof d.fehler === "string" ? d.fehler : null;
  if (r.status === 404) {
    if (d && d.alt === true) return new TeilenFehler(ALT_TEXT, { art: "alt", status: 404 });
    return new TeilenFehler(WEG_TEXT, { art: "weg", status: 404 });
  }
  if (r.status === 403) return new TeilenFehler("Der Schlüssel passt nicht zu diesem Link.", { art: "schluessel", status: 403 });
  if (r.status === 429) return new TeilenFehler(text || "Gerade gibt es zu viele Anfragen. Bitte versuch es gleich noch einmal.", { art: "server", status: 429 });
  if (r.status === 413) return new TeilenFehler(text || "Das Projekt ist zu groß zum Teilen.", { art: "grenze", status: 413 });
  if (r.status === 422 || r.status === 409 || r.status === 507) return new TeilenFehler(text || standard, { art: r.status === 507 ? "server" : "grenze", status: r.status });
  return new TeilenFehler(standard, { art: "server", status: r.status });
}
const STANDARD_TEILEN = "Teilen ist gerade nicht möglich. Bitte versuch es später erneut.";

/** GET /api/konfig → leseKonfig(…); nicht erreichbar → Teilen an, Aufbewahrung unbekannt. */
export async function holeKonfig(o = {}) {
  try {
    const r = await anfrage({ ...o, versuche: 0 }, "api/konfig", { headers: { Accept: "application/json" }, cache: "no-store" });
    return leseKonfig(r.ok ? await json(r) : null);
  } catch (e) { return leseKonfig(null); }
}

/**
 * Projekt teilen. o: { basis, fetch, warte, projekt, link?: { id, schluessel } (neue Version), grenzen?, fortschritt?(schritt,
 * i, n) } → { id, version, schluessel?, unveraendert?, hochgeladen, anzahl, bytes }. Wirft TeilenFehler.
 */
export async function teile(o) {
  const { manifest, blobs, anzahl, bytes, dateien } = await baueManifest(o.projekt);
  const grund = pruefeTeilenGrenzen(dateien, o.grenzen);
  if (grund) throw new TeilenFehler("Das Projekt ist zu groß zum Teilen (" + grund + ").", { art: "grenze" });
  const melde = o.fortschritt || (() => {});
  let hochgeladen = 0;
  async function hochladen(hashes) {
    let i = 0;
    for (const h of hashes) {
      const b = blobs.get(h);
      if (!b) continue;
      melde("hochladen", ++i, hashes.length);
      const r = await anfrage(o, "api/blob/" + h, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: b });
      if (r.status !== 200 && r.status !== 201) throw await fehlerAus(r, STANDARD_TEILEN);
      hochgeladen++;
    }
  }
  melde("pruefen", 0, 0);
  const rf = await anfrage(o, "api/blob/fehlend", { method: "POST", headers: JSON_KOPF, body: JSON.stringify({ sha256: [...blobs.keys()] }) });
  if (!rf.ok) throw await fehlerAus(rf, STANDARD_TEILEN);
  const fehlend = await json(rf);
  await hochladen(fehlend && Array.isArray(fehlend.fehlend) ? fehlend.fehlend : [...blobs.keys()]);
  const pfad = o.link ? "api/teilen/" + o.link.id : "api/teilen";
  const kopf = o.link ? { ...JSON_KOPF, Authorization: "Bearer " + o.link.schluessel } : JSON_KOPF;
  for (let versuch = 0; ; versuch++) {
    melde("speichern", 0, 0);
    const r = await anfrage(o, pfad, { method: "POST", headers: kopf, body: JSON.stringify(manifest) });
    if (r.status === 409 && versuch === 0) {
      const d = await json(r);
      if (d && Array.isArray(d.fehlend)) { await hochladen(d.fehlend); continue; }
      throw new TeilenFehler(d && d.fehler ? d.fehler : STANDARD_TEILEN, { art: "grenze", status: 409 });
    }
    if (r.status !== 200 && r.status !== 201) throw await fehlerAus(r, STANDARD_TEILEN);
    const d = await json(r);
    if (!d || !ID_MUSTER.test(String(d.id)) || !Number.isSafeInteger(d.version)) throw new TeilenFehler(STANDARD_TEILEN, { art: "server", status: r.status });
    const aus = { id: d.id, version: d.version, hochgeladen, anzahl, bytes };
    if (typeof d.schluessel === "string" && SCHLUESSEL_MUSTER.test(d.schluessel)) aus.schluessel = d.schluessel;
    if (d.unveraendert === true) aus.unveraendert = true;
    return aus;
  }
}

/** Nur die Kopfdaten eines Links (ohne Blobs) → { id, version, versionen, geaendert, ablauf, manifest }. */
export async function holeLink(o, id, version = null) {
  // neueste Version nie aus dem Cache; `@n` und Blobs sind unveränderlich (nginx: private, immutable)
  const r = await anfrage(o, "api/teilen/" + linkWert(id, version), { headers: { Accept: "application/json" }, ...(version ? {} : { cache: "no-store" }) });
  if (!r.ok) throw await fehlerAus(r, "Der geteilte Code kann gerade nicht geladen werden. Bitte versuch es später erneut.");
  const d = await json(r);
  const m = d && d.projekt;
  if (!d || !m || m.format !== FORMAT || !Array.isArray(m.dateien) || !Number.isSafeInteger(d.version)) {
    throw new TeilenFehler("Dieser geteilte Link hat ein unbekanntes Format.", { art: "server", status: r.status });
  }
  return { id: d.id, version: d.version, versionen: d.versionen, geaendert: d.geaendert, ablauf: d.ablauf, manifest: m };
}

/**
 * Geteiltes Projekt laden: { id, version, versionen, geaendert, ablauf, manifest, dateien, name, hauptdatei, args }.
 * Blobs: höchstens `parallel` gleichzeitig (Blob-GET hat im Dienst keinen Zähler, nginx 1200/min).
 */
export async function ladeGeteilt(o, id, version = null) {
  const kopf = await holeLink(o, id, version);
  const m = kopf.manifest;
  const grenze = (o.grenzen && o.grenzen.dateien) || GRENZEN.dateien;
  if (m.dateien.length > grenze) throw new TeilenFehler("Das geteilte Projekt hat zu viele Dateien.", { art: "grenze" });
  for (const d of m.dateien) {
    if (!d || typeof d.pfad !== "string" || pruefePfad(d.pfad) || istPruefung(d.pfad) || !/^[0-9a-f]{64}$/.test(String(d.sha256))) {
      throw new TeilenFehler("Das geteilte Projekt enthält einen ungültigen Dateipfad.", { art: "server" });
    }
  }
  const hashes = [...new Set(m.dateien.map((d) => d.sha256))];
  const bytes = new Map();
  let naechster = 0;
  const melde = o.fortschritt || (() => {});
  async function arbeiter() {
    while (naechster < hashes.length) {
      const h = hashes[naechster++];
      const r = await anfrage(o, "api/blob/" + h, { headers: { Accept: "application/octet-stream" } });
      if (!r.ok) throw await fehlerAus(r, "Der geteilte Code kann gerade nicht geladen werden. Bitte versuch es später erneut.");
      const b = new Uint8Array(await r.arrayBuffer());
      if ((await sha256Hex(b)) !== h) throw new TeilenFehler("Eine geteilte Datei ist beschädigt angekommen.", { art: "server" });
      bytes.set(h, b);
      melde("laden", bytes.size, hashes.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(o.parallel || 4, hashes.length) }, arbeiter));
  const dateien = {};
  for (const d of m.dateien) {
    const b = bytes.get(d.sha256);
    if (b.byteLength !== d.groesse) throw new TeilenFehler("Eine geteilte Datei ist beschädigt angekommen.", { art: "server" });
    if (dateiArt(d.pfad) === "bild") { dateien[d.pfad] = b.slice(); continue; }
    const t = dekodiereText(b, d.pfad);
    if (!t.ok) throw new TeilenFehler(t.fehler, { art: "server" });
    dateien[d.pfad] = t.text;
  }
  const aus = ausDateien(dateien, m.name);
  if (aus.fehler) throw new TeilenFehler(String(aus.fehler).replace(/^PizzaFehler [A-Z0-9]+: /, ""), { art: "server" });
  return { ...kopf, dateien, name: saeubere(aus.name, NAME_MAX) || m.name, hauptdatei: aus.hauptdatei, args: aus.args || [] };
}

/** Link samt allen Versionen löschen (mit Schlüssel). Schon weg (404) gilt als gelöscht. */
export async function loescheLink(o, id, schluessel) {
  const r = await anfrage(o, "api/teilen/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + schluessel } });
  if (r.status === 204 || r.status === 404) return true;
  throw await fehlerAus(r, "Der Link kann gerade nicht gelöscht werden. Bitte versuch es später erneut.");
}

/**
 * Beim Öffnen eines Links: eine pizza.json, die der Playground beim Teilen nur erzeugt hat (genau `erzeugeProjektdatei`), fällt
 * wieder weg – ein geteiltes Ein-Datei-Projekt kommt als Ein-Datei-Projekt an (Name und Hauptdatei trägt der Datensatz).
 */
export function ohneErzeugteProjektdatei(dateien, { name, hauptdatei }) {
  const t = dateien[PROJEKTDATEI];
  if (typeof t !== "string" || t !== erzeugeProjektdatei({ name, hauptdatei })) return dateien;
  const r = { ...dateien };
  delete r[PROJEKTDATEI];
  return r;
}
