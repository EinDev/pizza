// Durchreiche – Regeln: Grenzen, Pfade, IDs, Schlüssel, Manifest (PROJEKTE.md §4, SPEC.md §2.1).
// Nur node:-Module, keine Abhängigkeiten. Alles hier ist rein (kein Dateizugriff) und dadurch leicht testbar.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// ───────────────────────────── Grenzen ─────────────────────────────

const MIB = 1024 * 1024;

/** Ganzzahl ≥ min aus einer Umgebungsvariablen, sonst der Standard. */
function zahl(env, name, standard, min = 0) {
  const roh = env[name];
  if (roh === undefined || roh === "") return standard;
  const t = String(roh).trim();
  if (!/^[0-9]+$/.test(t)) return standard;
  const n = Number(t);
  return Number.isSafeInteger(n) && n >= min ? n : standard;
}

/**
 * Grenzen und Einstellungen aus der Umgebung (PROJEKTE.md §4.5, §4.6). Ungültige Werte fallen auf den Standard zurück.
 * Die Rate-Grenzen sind „Anfragen je Minute und IP“ im gleitenden Fenster; Standard = nginx-Rate + nginx-Burst, damit
 * nginx die erste Linie bleibt und der Dienst nur greift, wenn jemand nginx umgeht.
 */
export function leseKonfig(env = process.env) {
  return {
    port: zahl(env, "PORT", 8291, 0),
    daten: env.TEILEN_DATEN || "/daten",
    ablaufTage: zahl(env, "TEILEN_ABLAUF_TAGE", 90),
    speicherMaxBytes: zahl(env, "TEILEN_SPEICHER_MAX_MB", 2048, 1) * MIB,
    maxDateien: zahl(env, "TEILEN_MAX_DATEIEN", 100, 1),
    maxDateiBytes: zahl(env, "TEILEN_MAX_DATEI_BYTES", 2 * MIB, 1),
    maxProjektBytes: zahl(env, "TEILEN_MAX_PROJEKT_BYTES", 8 * MIB, 1),
    maxPizzaBytes: zahl(env, "TEILEN_MAX_PIZZA_BYTES", 512 * 1024, 1),
    maxManifestBytes: zahl(env, "TEILEN_MAX_MANIFEST_BYTES", 64 * 1024, 1024),
    maxVersionen: zahl(env, "TEILEN_MAX_VERSIONEN", 200, 1),
    loseJeIpBytes: zahl(env, "TEILEN_LOSE_JE_IP_MB", 32, 0) * MIB,
    loseAnteilProzent: zahl(env, "TEILEN_LOSE_ANTEIL_PROZENT", 10, 0),
    neueBytesJeIp: zahl(env, "TEILEN_NEU_JE_IP_MB", 64, 0) * MIB,
    rateSchreiben: zahl(env, "TEILEN_RATE_SCHREIBEN", 13, 0),
    rateLesen: zahl(env, "TEILEN_RATE_LESEN", 80, 0),
    rateFehlend: zahl(env, "TEILEN_RATE_FEHLEND", 80, 0),
    rateBlobHoch: zahl(env, "TEILEN_RATE_BLOB", 360, 0),
    aufraeumenMinuten: zahl(env, "TEILEN_AUFRAEUMEN_MINUTEN", 60, 1),
    loseHaltbarMs: 60 * 60 * 1000,
  };
}

/** Antwort von GET /api/konfig (PROJEKTE.md §4.3). */
export function konfigAntwort(k) {
  return {
    teilen: true,
    aufbewahrungTage: k.ablaufTage > 0 ? k.ablaufTage : null,
    aufbewahrungAb: "letzte-version",
    grenzen: {
      dateien: k.maxDateien,
      dateiBytes: k.maxDateiBytes,
      projektBytes: k.maxProjektBytes,
      pizzaBytes: k.maxPizzaBytes,
      manifestBytes: k.maxManifestBytes,
    },
  };
}

// ───────────────────────────── IDs, Hashes, Schlüssel ─────────────────────────────

export const ID_MUSTER = /^[0-9A-Za-z]{12}$/;
export const HASH_MUSTER = /^[0-9a-f]{64}$/;
export const AUTH_MUSTER = /^Bearer ([A-Za-z0-9_-]{43})$/;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Link-ID: 12 Zeichen Base62, je Zeichen Verwerfungsverfahren (Byte ≥ 248 verwerfen, dann % 62) – keine bevorzugten Zeichen. */
export function neueId(zufall = randomBytes) {
  let id = "";
  while (id.length < 12) {
    for (const b of zufall(16)) {
      if (b >= 248) continue;
      id += BASE62[b % 62];
      if (id.length === 12) break;
    }
  }
  return id;
}

/** Bearbeitungsschlüssel: 32 Byte Zufall, Base64url (43 Zeichen). */
export function neuerSchluessel() {
  return randomBytes(32).toString("base64url");
}

export function sha256(daten) {
  return createHash("sha256").update(daten).digest("hex");
}

/** Hash des Schlüssels (nur der wird gespeichert). */
export function schluesselHash(schluessel) {
  return sha256(Buffer.from(schluessel, "utf8"));
}

/** Prüft den Authorization-Kopf gegen den gespeicherten Hash – Format vor dem Hashen, Vergleich zeitkonstant. */
export function schluesselPasst(authKopf, gespeicherterHash) {
  const m = typeof authKopf === "string" ? AUTH_MUSTER.exec(authKopf) : null;
  if (!m || typeof gespeicherterHash !== "string" || !HASH_MUSTER.test(gespeicherterHash)) return false;
  const a = Buffer.from(schluesselHash(m[1]), "hex");
  const b = Buffer.from(gespeicherterHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ───────────────────────────── Pfade (eigene Kopie von SPEC §2.1) ─────────────────────────────

const SEGMENT = /^[a-z0-9_-][a-z0-9_.-]*$/;

/** null = gültig, sonst ein kurzer Grund. Gleiche Regel wie PizzaLang.projekt.pruefePfad (gemeinsame Fallliste in test/pfade.json). */
export function pruefePfad(pfad) {
  if (typeof pfad !== "string" || pfad === "") return "leer";
  if (pfad.length > 120) return "länger als 120 Zeichen";
  const teile = pfad.split("/");
  if (teile.length > 8) return "mehr als 8 Ebenen";
  for (const t of teile) if (!SEGMENT.test(t)) return "ungültiges Segment";
  return null;
}

export const TEXT_ENDUNGEN = new Set([".pizza", ".txt", ".json", ".csv", ".md"]);
export const BILD_ENDUNGEN = new Set([".png", ".jpg", ".jpeg"]);

export function endung(pfad) {
  const i = pfad.lastIndexOf(".");
  const j = pfad.lastIndexOf("/");
  return i > j ? pfad.slice(i) : "";
}

// ───────────────────────────── Inhaltsregeln je Endung ─────────────────────────────

const PNG_SIGNATUR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const utf8Streng = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** null = passt, sonst deutscher Grund. Prüft die echten Blob-Bytes gegen die Endung des Pfads (PROJEKTE.md §4.2). */
export function pruefeInhalt(pfad, bytes, k) {
  const e = endung(pfad);
  if (e === ".png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATUR) ? null : pfad + " ist kein PNG-Bild.";
  if (e === ".jpg" || e === ".jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? null : pfad + " ist kein JPEG-Bild.";
  if (TEXT_ENDUNGEN.has(e)) {
    try { utf8Streng.decode(bytes); } catch { return pfad + " ist kein gültiger UTF-8-Text."; }
    if (bytes.includes("\r\n")) return pfad + " enthält Windows-Zeilenenden (\\r\\n).";
    if (e === ".pizza" && bytes.length > k.maxPizzaBytes) return pfad + " ist größer als " + Math.ceil(k.maxPizzaBytes / 1024) + " KB.";
    return null;
  }
  return pfad + " hat eine nicht erlaubte Dateiart.";
}

// ───────────────────────────── Manifest ─────────────────────────────

const STEUERZEICHEN = /[\u0000-\u001f\u007f-\u009f]/;
const MANIFEST_FELDER = new Set(["format", "name", "hauptdatei", "beschreibung", "args", "dateien"]);
const DATEI_FELDER = new Set(["pfad", "sha256", "groesse"]);

class Ungueltig extends Error {}
const weg = (grund) => { throw new Ungueltig(grund); };
const istObjekt = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const zeichen = (s) => [...s].length;

function anzeigeText(wert, feld, max) {
  if (typeof wert !== "string") weg('"' + feld + '" muss ein Text sein.');
  if (!wert.isWellFormed()) weg('"' + feld + '" enthält ungültige Zeichen.');
  if (STEUERZEICHEN.test(wert)) weg('"' + feld + '" enthält Steuerzeichen.');
  if (zeichen(wert) > max) weg('"' + feld + '" ist länger als ' + max + " Zeichen.");
}

/**
 * Prüft ein gepostetes Manifest (schon geparst) ohne Blob-Zugriff und liefert die kanonische Form:
 * `{ manifest, bytes, hash }` oder `{ fehler }`. Typregeln gegen die Blob-Bytes prüft der Aufrufer (pruefeInhalt).
 */
export function pruefeManifest(m, k) {
  try {
    if (!istObjekt(m)) weg("Das Manifest muss ein Objekt sein.");
    for (const f of Object.keys(m)) if (!MANIFEST_FELDER.has(f)) weg('Unbekanntes Feld "' + f + '" im Manifest.');
    if (m.format !== "pizza-projekt/1") weg('"format" muss "pizza-projekt/1" sein.');
    anzeigeText(m.name, "name", 80);
    if (m.name.trim() === "") weg('"name" darf nicht leer sein.');
    if (typeof m.hauptdatei !== "string") weg('"hauptdatei" muss ein Text sein.');
    if (m.beschreibung !== undefined) anzeigeText(m.beschreibung, "beschreibung", 500);
    if (m.args !== undefined) {
      if (!Array.isArray(m.args) || m.args.some((a) => typeof a !== "string")) weg('"args" muss ein Blech aus Texten sein.');
      if (m.args.length > 32) weg('"args" hat mehr als 32 Einträge.');
      for (const a of m.args) {
        if (!a.isWellFormed()) weg('"args" enthält ungültige Zeichen.');
        if (zeichen(a) > 200) weg('Ein Eintrag in "args" ist länger als 200 Zeichen.');
      }
    }
    if (!Array.isArray(m.dateien)) weg('"dateien" muss eine Liste sein.');
    if (m.dateien.length === 0) weg("Das Projekt hat keine Dateien.");
    if (m.dateien.length > k.maxDateien) weg("Das Projekt hat " + m.dateien.length + " Dateien, höchstens " + k.maxDateien + ".");
    const pfade = new Set();
    let summe = 0;
    const dateien = [];
    for (const d of m.dateien) {
      if (!istObjekt(d)) weg('Jeder Eintrag in "dateien" muss ein Objekt sein.');
      for (const f of Object.keys(d)) if (!DATEI_FELDER.has(f)) weg('Unbekanntes Feld "' + f + '" in "dateien".');
      if (typeof d.pfad !== "string" || pruefePfad(d.pfad) !== null) weg("Ein Dateipfad ist ungültig (nur a–z, 0–9, -, _, . und /).");
      if (d.pfad.startsWith("pruefung/")) weg("Der Ordner pruefung/ gehört nicht zum Projekt.");
      const e = endung(d.pfad);
      if (!TEXT_ENDUNGEN.has(e) && !BILD_ENDUNGEN.has(e)) weg(d.pfad + " hat eine nicht erlaubte Dateiart.");
      if (pfade.has(d.pfad)) weg(d.pfad + " steht doppelt im Manifest.");
      pfade.add(d.pfad);
      if (typeof d.sha256 !== "string" || !HASH_MUSTER.test(d.sha256)) weg('"sha256" muss 64 Hex-Kleinbuchstaben haben.');
      if (!Number.isSafeInteger(d.groesse) || d.groesse < 0) weg('"groesse" muss eine Ganzzahl ≥ 0 sein.');
      if (d.groesse > k.maxDateiBytes) weg(d.pfad + " ist größer als " + (k.maxDateiBytes / MIB).toLocaleString("de-DE") + " MB.");
      summe += d.groesse;
      dateien.push({ pfad: d.pfad, sha256: d.sha256, groesse: d.groesse });
    }
    if (summe > k.maxProjektBytes) weg("Das Projekt ist zusammen größer als " + (k.maxProjektBytes / MIB).toLocaleString("de-DE") + " MB.");
    if (!pfade.has(m.hauptdatei) || endung(m.hauptdatei) !== ".pizza") weg('"hauptdatei" muss eine .pizza-Datei des Projekts sein.');
    if (!pfade.has("pizza.json")) weg("pizza.json fehlt im Projekt.");
    dateien.sort((a, b) => (a.pfad < b.pfad ? -1 : a.pfad > b.pfad ? 1 : 0));
    // Kanonisch: Schlüssel in fester Reihenfolge, optionale weggelassen, ohne Leerraum (PROJEKTE.md §4.2).
    const manifest = { format: m.format, name: m.name, hauptdatei: m.hauptdatei };
    if (m.beschreibung !== undefined) manifest.beschreibung = m.beschreibung;
    if (m.args !== undefined) manifest.args = [...m.args];
    manifest.dateien = dateien;
    const bytes = Buffer.from(JSON.stringify(manifest), "utf8");
    if (bytes.length > k.maxManifestBytes) weg("Das Manifest ist zu groß.");
    return { manifest, bytes, hash: sha256(bytes), summe };
  } catch (e) {
    if (e instanceof Ungueltig) return { fehler: e.message };
    throw e;
  }
}

// ───────────────────────────── Datum ─────────────────────────────

/** UTC-Datum JJJJ-MM-TT. */
export function tag(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Ablaufdatum (einschließlich) = geaendert + Tage; null = unbegrenzt. */
export function ablaufTag(geaendert, tage) {
  if (!(tage > 0)) return null;
  const ms = Date.parse(geaendert + "T00:00:00Z") + tage * 86_400_000;
  return tag(ms);
}

/** Ist der Link heute (UTC) abgelaufen? Gilt bis einschließlich des Ablauftags. */
export function abgelaufen(geaendert, tage, heute) {
  const a = ablaufTag(geaendert, tage);
  return a !== null && heute > a;
}
