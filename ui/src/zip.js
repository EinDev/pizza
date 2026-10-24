// ZIP ohne Bibliothek (PROJEKTE.md §3.4, E17, K-142).
//   Export: Methode „stored“, CRC-32, UTF-8-Namensflag (Bit 11), alles unter dem Ordner <projektname>/.
//   Import: „stored“ und „deflate“ (DecompressionStream("deflate-raw")); Namen und Größen aus dem ZENTRALEN Verzeichnis (so gehen
//   auch Archive mit Datendeskriptor, Bit 3); CRC-32 je Eintrag geprüft; gemeinsamer Wurzelordner entfernt; __MACOSX/, Segmente ab
//   „.“ und Ordnereinträge still übersprungen; ASCII-Großbuchstaben → klein, wenn eindeutig und gültig („umbenannt“); übrige Pfade
//   nach SPEC §2.1 geprüft (ungültig → übersprungen und gemeldet; nie außerhalb des Projekts); Grenzen ENTPACKT gemessen, Abbruch
//   beim Überschreiten während des Entpackens (keine ZIP-Bombe). Verschlüsselung, ZIP64, andere Methoden → nicht lesbar.
import { GRENZEN, dateiArt, pruefePfadLokal, dekodiereText, istText, formatGroesse } from "./projekt.js";

export const NICHT_LESBAR = "Diese ZIP-Datei kann der Playground nicht lesen.";

const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABELLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const utf8 = new TextEncoder();
const alsBytes = (inhalt) => (inhalt instanceof Uint8Array ? inhalt : utf8.encode(String(inhalt)));

function dosZeit(d) {
  const zeit = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const datum = (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { zeit, datum };
}

/**
 * Schreibt ein ZIP („stored“). dateien: { pfad → string | Uint8Array }; ordner: Wurzelordner im Archiv (ohne „/“) oder "".
 * Pfade werden sortiert (byte-gleiches Archiv für dieselbe Sammlung und dasselbe Datum).
 */
export function schreibeZip(dateien, { ordner = "", datum = new Date() } = {}) {
  const { zeit, datum: tag } = dosZeit(datum);
  const eintraege = Object.keys(dateien).sort().map((pfad) => {
    const daten = alsBytes(dateien[pfad]);
    return { name: utf8.encode((ordner ? ordner + "/" : "") + pfad), daten, crc: crc32(daten) };
  });
  let groesse = 22;
  for (const e of eintraege) groesse += 30 + e.name.length + e.daten.length + 46 + e.name.length;
  const aus = new Uint8Array(groesse);
  const dv = new DataView(aus.buffer);
  let o = 0;
  const u16 = (v) => { dv.setUint16(o, v, true); o += 2; };
  const u32 = (v) => { dv.setUint32(o, v >>> 0, true); o += 4; };
  for (const e of eintraege) {
    e.offset = o;
    u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(zeit); u16(tag);
    u32(e.crc); u32(e.daten.length); u32(e.daten.length); u16(e.name.length); u16(0);
    aus.set(e.name, o); o += e.name.length;
    aus.set(e.daten, o); o += e.daten.length;
  }
  const cdStart = o;
  for (const e of eintraege) {
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(zeit); u16(tag);
    u32(e.crc); u32(e.daten.length); u32(e.daten.length); u16(e.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(e.offset);
    aus.set(e.name, o); o += e.name.length;
  }
  const cdGroesse = o - cdStart;
  u32(0x06054b50); u16(0); u16(0); u16(eintraege.length); u16(eintraege.length); u32(cdGroesse); u32(cdStart); u16(0);
  return aus;
}

class ZipFehler extends Error {}
const nichtLesbar = () => new ZipFehler(NICHT_LESBAR);

/** Zentrales Verzeichnis lesen → [{ name, methode, flags, crc, gepackt, entpackt, offset }]. */
function verzeichnis(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.length;
  if (n < 22) throw nichtLesbar();
  let eocd = -1;
  for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw nichtLesbar();
  const anzahl = dv.getUint16(eocd + 10, true);
  const cdGroesse = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (anzahl === 0xffff || cdOffset === 0xffffffff || cdGroesse === 0xffffffff) throw nichtLesbar(); // ZIP64
  if (dv.getUint16(eocd + 4, true) !== 0 || dv.getUint16(eocd + 6, true) !== 0) throw nichtLesbar(); // mehrteilig
  if (cdOffset + cdGroesse > eocd) throw nichtLesbar();
  const liste = [];
  let o = cdOffset;
  const latin = new TextDecoder("latin1");
  const utf = new TextDecoder("utf-8");
  for (let i = 0; i < anzahl; i++) {
    if (o + 46 > n || dv.getUint32(o, true) !== 0x02014b50) throw nichtLesbar();
    const flags = dv.getUint16(o + 8, true);
    const methode = dv.getUint16(o + 10, true);
    const crc = dv.getUint32(o + 16, true);
    const gepackt = dv.getUint32(o + 20, true);
    const entpackt = dv.getUint32(o + 24, true);
    const nl = dv.getUint16(o + 28, true), el = dv.getUint16(o + 30, true), kl = dv.getUint16(o + 32, true);
    const offset = dv.getUint32(o + 42, true);
    if (gepackt === 0xffffffff || entpackt === 0xffffffff || offset === 0xffffffff) throw nichtLesbar();
    const rohName = bytes.subarray(o + 46, o + 46 + nl);
    const name = (flags & 0x0800 ? utf : latin).decode(rohName);
    liste.push({ name, methode, flags, crc, gepackt, entpackt, offset });
    o += 46 + nl + el + kl;
  }
  return liste;
}

/** Rohdaten eines Eintrags (Offset aus dem lokalen Kopf, Größe aus dem zentralen Verzeichnis). */
function rohdaten(bytes, e) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (e.offset + 30 > bytes.length || dv.getUint32(e.offset, true) !== 0x04034b50) throw nichtLesbar();
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  if (start + e.gepackt > bytes.length) throw nichtLesbar();
  return bytes.subarray(start, start + e.gepackt);
}

class GrenzFehler extends Error {}

/** Deflate entpacken mit Obergrenze (bricht beim Überschreiten ab – keine ZIP-Bombe). */
async function inflate(daten, grenze) {
  if (typeof DecompressionStream !== "function") throw nichtLesbar();
  let ds;
  try { ds = new DecompressionStream("deflate-raw"); } catch (e) { throw nichtLesbar(); }
  const schreiber = ds.writable.getWriter();
  schreiber.write(daten).catch(() => {});
  schreiber.close().catch(() => {});
  const leser = ds.readable.getReader();
  const teile = [];
  let n = 0;
  for (;;) {
    let r;
    try { r = await leser.read(); } catch (e) { throw nichtLesbar(); }
    if (r.done) break;
    n += r.value.byteLength;
    if (n > grenze) { leser.cancel().catch(() => {}); throw new GrenzFehler(); }
    teile.push(r.value);
  }
  const aus = new Uint8Array(n);
  let o = 0;
  for (const t of teile) { aus.set(t, o); o += t.byteLength; }
  return aus;
}

const unsichtbar = (name) => name.endsWith("/") || name.split("/").some((s) => s === "__MACOSX" || s.startsWith("."));

/**
 * Liest ein ZIP → { ok: true, dateien: { pfad → string | Uint8Array }, wurzel: string | null, meldungen: string[] }
 *              | { ok: false, fehler }.
 * `grenzen` (Standard: Lader-Grenzen SPEC §2.1) werden entpackt gemessen.
 */
export async function leseZip(eingabe, { grenzen = GRENZEN, pruefePfad = pruefePfadLokal } = {}) {
  const bytes = eingabe instanceof Uint8Array ? eingabe : new Uint8Array(eingabe);
  const meldungen = [];
  try {
    const liste = verzeichnis(bytes).filter((e) => !unsichtbar(e.name.replace(/\\/g, "/")));
    for (const e of liste) {
      if (e.flags & 0x0001) throw nichtLesbar();            // verschlüsselt
      if (e.methode !== 0 && e.methode !== 8) throw nichtLesbar();
    }
    // gemeinsamer Wurzelordner
    let namen = liste.map((e) => e.name.replace(/\\/g, "/"));
    let wurzel = null;
    if (namen.length && namen.every((n) => n.includes("/"))) {
      const erster = namen[0].split("/")[0];
      if (namen.every((n) => n.split("/")[0] === erster)) { wurzel = erster; namen = namen.map((n) => n.slice(erster.length + 1)); }
    }
    // Pfade prüfen; Großbuchstaben → klein, wenn eindeutig und dann gültig
    const kandidaten = [];
    const belegt = new Set(namen.filter((n) => !pruefePfad(n)));
    namen.forEach((n, i) => {
      let pfad = n;
      if (pruefePfad(pfad)) {
        const klein = n.replace(/[A-Z]/g, (c) => c.toLowerCase());
        if (klein !== n && !pruefePfad(klein) && !belegt.has(klein)) { belegt.add(klein); meldungen.push(`„${n}“ umbenannt in „${klein}“.`); pfad = klein; }
        else { meldungen.push(`„${n}“ übersprungen: ungültiger Dateipfad (nur a–z, 0–9, -, _, . und /).`); return; }
      }
      if (!dateiArt(pfad)) { meldungen.push(`„${n}“ übersprungen: diese Dateiart kennt der Ofen nicht.`); return; }
      kandidaten.push({ pfad, e: liste[i] });
    });
    if (kandidaten.length > grenzen.dateien) return { ok: false, fehler: `Das Projekt ist zu groß für den Ofen (${kandidaten.length} Dateien, höchstens ${grenzen.dateien}).` };
    const dateien = {};
    let summe = 0;
    for (const { pfad, e } of kandidaten) {
      const grenzeDatei = Math.min(grenzen.datei, grenzen.gesamt - summe);
      const zuGross = () => (summe + e.entpackt > grenzen.gesamt || e.entpackt <= grenzen.datei
        ? `Das Projekt ist zu groß für den Ofen (zusammen mehr als ${formatGroesse(grenzen.gesamt)}).`
        : `Das Projekt ist zu groß für den Ofen (${pfad} hat mehr als ${formatGroesse(grenzen.datei)}).`);
      if (e.entpackt > grenzeDatei) return { ok: false, fehler: zuGross() };
      const roh = rohdaten(bytes, e);
      let daten;
      if (e.methode === 0) daten = roh;
      else {
        try { daten = await inflate(roh, grenzeDatei); }
        catch (x) { if (x instanceof GrenzFehler) return { ok: false, fehler: zuGross() }; throw x; }
      }
      if (daten.length !== e.entpackt || crc32(daten) !== e.crc) throw nichtLesbar();
      summe += daten.length;
      if (istText(pfad)) {
        const t = dekodiereText(daten, pfad);
        if (!t.ok) { meldungen.push(t.fehler + " Übersprungen."); continue; }
        dateien[pfad] = t.text;
      } else dateien[pfad] = daten.slice();
    }
    return { ok: true, dateien, wurzel, meldungen };
  } catch (x) {
    if (x instanceof ZipFehler) return { ok: false, fehler: x.message };
    return { ok: false, fehler: NICHT_LESBAR };
  }
}

/** Ist das ein ZIP (Signatur)? */
export function istZip(bytes) {
  return bytes && bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5) && (bytes[3] === 4 || bytes[3] === 6);
}
