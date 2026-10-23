// Durchreiche – Lager: Ablage im Volume als Dateien (PROJEKTE.md §4.5, §4.7).
//
//   <daten>/blobs/ab/abcdef…        Dateiname = SHA-256 des Inhalts (Manifeste sind auch Blobs)
//   <daten>/links/Xy/Xy12345678ab.json
//   <daten>/tmp/…                   Schreiben: tmp → fsync → rename (atomar)
//
// Ein Prozess; alle ändernden Schritte (Posten, Löschen, Blob-Abschluss, `fehlend`, Müllabfuhr) laufen unter EINER
// Sperre im Speicher. Pfade im Volume entstehen nur aus geprüften IDs/Hashes, nie aus Nutzerpfaden.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { HASH_MUSTER, ID_MUSTER, abgelaufen, tag } from "./regeln.mjs";

const ZWEI_HEX = /^[0-9a-f]{2}$/;
const ZWEI_B62 = /^[0-9A-Za-z]{2}$/;

/** Fehlercode für das Protokoll – nie die Meldung (Node-Meldungen enthalten Pfade, also Hashes/IDs). */
export const fehlerArt = (e) => (e && (e.code || e.name)) || "unbekannt";

export class Lager {
  /**
   * @param {object} k  Konfiguration (regeln.leseKonfig)
   * @param {{ jetzt?: () => number, log?: (zeile: string) => void }} o
   */
  constructor(k, o = {}) {
    this.k = k;
    this.wurzel = path.resolve(k.daten);
    this.jetzt = o.jetzt || Date.now;
    this.log = o.log || (() => {});
    this.blobs = new Map();       // hash → Größe in Bytes (alles, was im Volume liegt)
    this.links = new Map();       // id → { id, schluesselHash, erstellt, geaendert, versionen: [{ n, manifest, zeit }] }
    this.manifeste = new Map();   // Manifest-Hash → [Blob-Hashes der Dateien] (ohne Duplikate)
    this.refs = new Map();        // Blob-Hash → Anzahl Verweise aus lebenden Links (Manifest selbst + Dateien)
    this.speicher = 0;            // Summe aller Blobgrößen
    this.refBytes = 0;            // Summe der Größen referenzierter Blobs
    this.loseVonIp = new Map();   // Blob-Hash → { ip, zeit, groesse } für frisch hochgeladene, noch lose Blobs
    this._kette = Promise.resolve();
  }

  // ───────────── Sperre ─────────────

  /** Führt fn exklusiv aus (eine globale Sperre für alle ändernden Schritte). */
  async sperre(fn) {
    const vorher = this._kette;
    let frei;
    this._kette = new Promise((r) => { frei = r; });
    await vorher;
    try { return await fn(); } finally { frei(); }
  }

  // ───────────── Pfade ─────────────

  blobPfad(hash) {
    if (!HASH_MUSTER.test(hash)) throw new Error("ungültiger Hash");
    return path.join(this.wurzel, "blobs", hash.slice(0, 2), hash);
  }

  linkPfad(id) {
    if (!ID_MUSTER.test(id)) throw new Error("ungültige ID");
    return path.join(this.wurzel, "links", id.slice(0, 2), id + ".json");
  }

  // ───────────── Start ─────────────

  async oeffne() {
    for (const d of ["blobs", "links", "tmp"]) await fsp.mkdir(path.join(this.wurzel, d), { recursive: true });
    // tmp leeren: abgebrochene Schreibvorgänge eines früheren Laufs
    for (const f of await fsp.readdir(path.join(this.wurzel, "tmp"))) await fsp.rm(path.join(this.wurzel, "tmp", f), { recursive: true, force: true });
    // Blobs zählen
    for (const d of await fsp.readdir(path.join(this.wurzel, "blobs"))) {
      if (!ZWEI_HEX.test(d)) continue;
      for (const f of await fsp.readdir(path.join(this.wurzel, "blobs", d))) {
        if (!HASH_MUSTER.test(f) || !f.startsWith(d)) continue;
        const st = await fsp.stat(path.join(this.wurzel, "blobs", d, f));
        if (!st.isFile()) continue;
        this.blobs.set(f, st.size);
        this.speicher += st.size;
      }
    }
    // Links laden
    let kaputt = 0;
    for (const d of await fsp.readdir(path.join(this.wurzel, "links"))) {
      if (!ZWEI_B62.test(d)) continue;
      for (const f of await fsp.readdir(path.join(this.wurzel, "links", d))) {
        const id = f.endsWith(".json") ? f.slice(0, -5) : "";
        if (!ID_MUSTER.test(id) || !id.startsWith(d)) continue;
        try {
          const link = JSON.parse(await fsp.readFile(path.join(this.wurzel, "links", d, f), "utf8"));
          if (link.id !== id || !Array.isArray(link.versionen)) throw new Error("Form");
          this.links.set(id, link);
        } catch { kaputt++; }
      }
    }
    for (const link of this.links.values()) for (const v of link.versionen) await this._ladeManifest(v.manifest);
    this._zaehleRefsNeu();
    if (kaputt) this.log("Start: " + kaputt + " unlesbare Linkdatei(en) übersprungen");
  }

  async _ladeManifest(hash) {
    if (this.manifeste.has(hash)) return;
    let dateien = [];
    try {
      const m = JSON.parse(await fsp.readFile(this.blobPfad(hash), "utf8"));
      dateien = [...new Set(m.dateien.map((d) => d.sha256))];
    } catch { /* fehlendes/kaputtes Manifest: nur der Verweis auf sich selbst zählt */ }
    this.manifeste.set(hash, dateien);
  }

  _verweise(manifestHash) {
    return [manifestHash, ...(this.manifeste.get(manifestHash) || [])];
  }

  _plus(hash) {
    const n = this.refs.get(hash) || 0;
    this.refs.set(hash, n + 1);
    if (n === 0) {
      if (this.blobs.has(hash)) this.refBytes += this.blobs.get(hash);
      this.loseVonIp.delete(hash);
    }
  }

  _minus(hash) {
    const n = this.refs.get(hash) || 0;
    if (n <= 1) {
      this.refs.delete(hash);
      if (n === 1 && this.blobs.has(hash)) this.refBytes -= this.blobs.get(hash);
    } else this.refs.set(hash, n - 1);
  }

  _zaehleRefsNeu() {
    this.refs.clear();
    this.refBytes = 0;
    for (const link of this.links.values()) for (const v of link.versionen) for (const h of this._verweise(v.manifest)) this._plus(h);
  }

  // ───────────── Kennzahlen ─────────────

  /** Bytes in Blobs, auf die kein lebender Link zeigt. */
  get loseBytes() { return this.speicher - this.refBytes; }

  /** Lose Bytes, die diese IP in der letzten Stunde hochgeladen hat. */
  loseBytesVon(ip) {
    const grenze = this.jetzt() - this.k.loseHaltbarMs;
    let s = 0;
    for (const [h, e] of this.loseVonIp) {
      if (e.zeit < grenze || (this.refs.get(h) || 0) > 0) { this.loseVonIp.delete(h); continue; }
      if (e.ip === ip) s += e.groesse;
    }
    return s;
  }

  istReferenziert(hash) { return (this.refs.get(hash) || 0) > 0; }

  // ───────────── Dateien schreiben ─────────────

  _tmpPfad() { return path.join(this.wurzel, "tmp", randomBytes(12).toString("hex")); }

  async _syncOrdner(ordner) {
    // Ordner-fsync macht den rename dauerhaft (Linux); unter Windows nicht möglich → still übergehen
    let fh;
    try { fh = await fsp.open(ordner, "r"); await fh.sync(); } catch { /* plattformabhängig */ } finally { if (fh) await fh.close().catch(() => {}); }
  }

  /** Schreibt bytes atomar nach ziel: tmp → fsync → rename. */
  async schreibeAtomar(ziel, bytes) {
    const tmp = this._tmpPfad();
    const fh = await fsp.open(tmp, "wx");
    try {
      await fh.writeFile(bytes);
      await fh.sync();
    } finally { await fh.close(); }
    try {
      await fsp.mkdir(path.dirname(ziel), { recursive: true });
      await fsp.rename(tmp, ziel);
    } catch (e) { await fsp.rm(tmp, { force: true }); throw e; }
    await this._syncOrdner(path.dirname(ziel));
  }

  async _setzeZeit(datei) {
    const t = this.jetzt() / 1000;
    await fsp.utimes(datei, t, t);
  }

  /** Frische mtime (unter der Sperre aufrufen), damit die Müllabfuhr den Blob nicht gleich löscht. */
  async beruehre(hash) {
    try { await this._setzeZeit(this.blobPfad(hash)); } catch { /* verschwunden? dann gilt er als fehlend */ }
  }

  /**
   * Nimmt einen Blob aus einem Strom an. Hash und Größe werden beim Schreiben in tmp/ mitgerechnet.
   * vorpruefung(groesse) läuft unter der Sperre direkt vor dem rename und darf einen Fehler-Status liefern.
   * @returns {Promise<{ status: "neu"|"vorhanden"|"zu-gross"|"falsch"|"abgebrochen"|string, groesse?: number }>}
   */
  async nimmBlob(strom, hash, maxBytes, ip, vorpruefung) {
    const tmp = this._tmpPfad();
    const fh = await fsp.open(tmp, "wx");
    const h = createHash("sha256");
    let groesse = 0;
    let status = null;
    try {
      for await (const stueck of strom) {
        groesse += stueck.length;
        if (groesse > maxBytes) {
          // weiter lesen (verwerfen), damit die 413-Antwort noch ankommt; bei grobem Überschreiten Verbindung kappen
          status = "zu-gross";
          if (groesse > 2 * maxBytes + 65536) break;
          continue;
        }
        h.update(stueck);
        await fh.write(stueck);
      }
      if (!status && strom.complete === false) status = "abgebrochen";
      if (!status) await fh.sync();
    } catch { status = status || "abgebrochen"; } finally { await fh.close(); }
    if (!status && h.digest("hex") !== hash) status = "falsch";
    if (status) { await fsp.rm(tmp, { force: true }); return { status }; }
    return this.sperre(async () => {
      if (this.blobs.has(hash)) {
        await fsp.rm(tmp, { force: true });
        await this.beruehre(hash);
        return { status: "vorhanden", groesse };
      }
      const nein = vorpruefung ? vorpruefung(groesse) : null;
      if (nein) { await fsp.rm(tmp, { force: true }); return { status: nein }; }
      const ziel = this.blobPfad(hash);
      try {
        await fsp.mkdir(path.dirname(ziel), { recursive: true });
        await fsp.rename(tmp, ziel);
      } catch (e) { await fsp.rm(tmp, { force: true }); throw e; }
      await this._syncOrdner(path.dirname(ziel));
      await this._setzeZeit(ziel);
      this.blobs.set(hash, groesse);
      this.speicher += groesse;
      if (this.istReferenziert(hash)) this.refBytes += groesse;
      else this.loseVonIp.set(hash, { ip, zeit: this.jetzt(), groesse });
      return { status: "neu", groesse };
    });
  }

  /** Legt einen Blob aus Bytes an (für Manifeste; unter der Sperre aufrufen). */
  async legeBlobAn(hash, bytes) {
    if (this.blobs.has(hash)) { await this.beruehre(hash); return false; }
    const ziel = this.blobPfad(hash);
    await this.schreibeAtomar(ziel, bytes);
    await this._setzeZeit(ziel);
    this.blobs.set(hash, bytes.length);
    this.speicher += bytes.length;
    if (this.istReferenziert(hash)) this.refBytes += bytes.length;
    return true;
  }

  leseBlob(hash) { return fsp.readFile(this.blobPfad(hash)); }

  /** Liest höchstens n Bytes vom Anfang eines Blobs. */
  async leseAnfang(hash, n) {
    const fh = await fsp.open(this.blobPfad(hash), "r");
    try {
      const puffer = Buffer.alloc(n);
      const { bytesRead } = await fh.read(puffer, 0, n, 0);
      return puffer.subarray(0, bytesRead);
    } finally { await fh.close(); }
  }

  blobStrom(hash) { return fs.createReadStream(this.blobPfad(hash)); }

  // ───────────── Links ─────────────

  heute() { return tag(this.jetzt()); }

  /** Lebender Link oder undefined (abgelaufene gelten sofort als weg, gelöscht wird beim Aufräumen). */
  lebenderLink(id) {
    const l = this.links.get(id);
    if (!l || abgelaufen(l.geaendert, this.k.ablaufTage, this.heute())) return undefined;
    return l;
  }

  /** Ist die ID frei (Speicher und Volume; Letzteres fängt auch Dateisysteme ohne Groß/klein ab)? */
  idFrei(id) {
    return !this.links.has(id) && !fs.existsSync(this.linkPfad(id));
  }

  /** Speichert eine neue Version (unter der Sperre). link = vorhandener Link oder neuer Datensatz. */
  async speichereVersion(link, manifestHash, dateiHashes) {
    const heute = this.heute();
    const neu = {
      ...link,
      geaendert: heute,
      versionen: [...link.versionen, { n: link.versionen.length + 1, manifest: manifestHash, zeit: heute }],
    };
    await this.schreibeAtomar(this.linkPfad(neu.id), Buffer.from(JSON.stringify(neu), "utf8"));
    if (!this.manifeste.has(manifestHash)) this.manifeste.set(manifestHash, [...new Set(dateiHashes)]);
    this.links.set(neu.id, neu);
    for (const h of this._verweise(manifestHash)) this._plus(h);
    return neu;
  }

  /** Löscht einen Link samt allen Versionen (unter der Sperre). Lose gewordene, ältere Blobs gehen gleich mit. */
  async loescheLink(id) {
    const link = this.links.get(id);
    if (!link) return false;
    await fsp.rm(this.linkPfad(id), { force: true });
    this.links.delete(id);
    const kandidaten = new Set();
    for (const v of link.versionen) for (const h of this._verweise(v.manifest)) { this._minus(h); kandidaten.add(h); }
    await this._entferneLose(kandidaten);
    return true;
  }

  /** Löscht unreferenzierte Blobs aus `hashes`, deren mtime älter als 1 h ist. */
  async _entferneLose(hashes) {
    const grenze = this.jetzt() - this.k.loseHaltbarMs;
    let n = 0;
    for (const h of hashes) {
      if (this.istReferenziert(h) || !this.blobs.has(h)) continue;
      const datei = this.blobPfad(h);
      let st;
      try { st = await fsp.stat(datei); } catch { continue; }
      if (st.mtimeMs >= grenze) continue;
      await fsp.rm(datei, { force: true });
      this.speicher -= this.blobs.get(h);
      this.blobs.delete(h);
      this.loseVonIp.delete(h);
      n++;
    }
    for (const h of hashes) if (!this.istReferenziert(h) && !this.blobs.has(h)) this.manifeste.delete(h);
    return n;
  }

  /**
   * Aufräumlauf (stündlich): abgelaufene Links löschen, dann Müllabfuhr – markieren (alle Manifeste lebender Links + deren
   * Blobs) und alle übrigen Blobs löschen, deren mtime älter als 1 h ist.
   */
  aufraeumen() {
    return this.sperre(async () => {
      const heute = this.heute();
      let links = 0;
      for (const [id, l] of [...this.links]) {
        if (!abgelaufen(l.geaendert, this.k.ablaufTage, heute)) continue;
        await fsp.rm(this.linkPfad(id), { force: true });
        this.links.delete(id);
        links++;
      }
      this._zaehleRefsNeu();
      const blobs = await this._entferneLose([...this.blobs.keys()].filter((h) => !this.istReferenziert(h)));
      for (const h of [...this.manifeste.keys()]) if (!this.istReferenziert(h)) this.manifeste.delete(h);
      this.loseBytesVon(""); // alte Einträge der IP-Zähler wegräumen
      return { links, blobs };
    });
  }
}
