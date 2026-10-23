#!/usr/bin/env node
// Durchreiche – der Teilen-Dienst des pizza-Playgrounds (PROJEKTE.md §4, K-143).
// Node ≥ 22, nur node:-Module. Nur im internen Netz erreichbar; nginx (pizza) reicht /api/… unverändert durch.
//
//   node durchreiche/server.mjs            Port aus PORT (8291), Daten in TEILEN_DATEN (/daten)
//
// Als Modul: `starte({ konfig?, jetzt?, log?, host? })` → { port, lager, aufraeumen(), schliesse() } (Tests, e2e).

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Lager, fehlerArt } from "./lager.mjs";
import {
  HASH_MUSTER, ID_MUSTER, ablaufTag, konfigAntwort, leseKonfig, neueId, neuerSchluessel, pruefeInhalt, pruefeManifest,
  schluesselHash, schluesselPasst, endung, TEXT_ENDUNGEN,
} from "./regeln.mjs";

const MINUTE = 60_000;
const STUNDE = 60 * MINUTE;
const FEST = "private, max-age=31536000, immutable";

class Antwort extends Error {
  constructor(status, koerper, kopf = {}) { super("Antwort " + status); this.status = status; this.koerper = koerper; this.kopf = kopf; }
}
const raus = (status, fehler, kopf) => { throw new Antwort(status, { fehler }, kopf); };

/** Gleitendes Fenster je Schlüssel (nur im Speicher). */
class Fenster {
  constructor(dauerMs, jetzt) { this.dauer = dauerMs; this.jetzt = jetzt; this.m = new Map(); }
  _eintraege(schluessel) {
    const grenze = this.jetzt() - this.dauer;
    const e = (this.m.get(schluessel) || []).filter((x) => x.t > grenze);
    if (e.length) this.m.set(schluessel, e); else this.m.delete(schluessel);
    return e;
  }
  summe(schluessel) { return this._eintraege(schluessel).reduce((s, x) => s + x.w, 0); }
  plus(schluessel, w = 1) { const e = this._eintraege(schluessel); e.push({ t: this.jetzt(), w }); this.m.set(schluessel, e); }
  /** true = erlaubt (und gezählt); limit 0 = unbegrenzt. */
  zaehle(schluessel, limit) {
    if (!limit) return true;
    if (this.summe(schluessel) >= limit) return false;
    this.plus(schluessel);
    return true;
  }
  aufraeumen() { for (const k of [...this.m.keys()]) this._eintraege(k); }
}

function medienTyp(req) {
  return String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
}

/** Liest einen Body bis max Bytes; null = zu groß (Rest wird verworfen). */
async function leseKoerper(req, max) {
  const laenge = Number(req.headers["content-length"]);
  if (Number.isFinite(laenge) && laenge > max) { req.resume(); return null; }
  const teile = [];
  let n = 0;
  for await (const s of req) {
    n += s.length;
    if (n > max) { if (n > 2 * max + 65536) break; continue; }
    teile.push(s);
  }
  return n > max ? null : Buffer.concat(teile);
}

async function leseJson(req, max, zuGross) {
  if (medienTyp(req) !== "application/json") raus(415, "Erwartet wird Content-Type application/json.");
  const roh = await leseKoerper(req, max);
  if (roh === null) raus(413, zuGross, { Connection: "close" });
  try { return JSON.parse(roh.toString("utf8")); } catch { raus(422, "Der Inhalt ist kein gültiges JSON."); }
}

export async function starte(o = {}) {
  const k = { ...leseKonfig(o.umgebung || process.env), ...(o.konfig || {}) };
  const jetzt = o.jetzt || Date.now;
  const log = o.log || ((z) => console.log(z));
  const lager = new Lager(k, { jetzt, log });
  await lager.oeffne();

  const raten = new Fenster(MINUTE, jetzt);
  const neueBytes = new Fenster(STUNDE, jetzt);

  const ip = (req) => {
    const x = req.headers["x-real-ip"];
    return (typeof x === "string" && x.length <= 64 && x) || req.socket.remoteAddress || "?";
  };
  const begrenze = (req, klasse, limit) => {
    if (!raten.zaehle(klasse + "|" + ip(req), limit)) raus(429, "Zu viele Anfragen – bitte kurz warten.", { "Retry-After": "60" });
  };
  const speicherVoll = () => raus(507, "Der Teilen-Speicher ist gerade voll – bitte später noch einmal versuchen.");

  // ───────────── Links ─────────────

  function projektAntwort(link, v, manifestBytes) {
    return {
      id: link.id,
      version: v.n,
      versionen: link.versionen.length,
      geaendert: link.geaendert,
      ablauf: ablaufTag(link.geaendert, k.ablaufTage),
      projekt: JSON.parse(manifestBytes.toString("utf8")),
    };
  }

  async function leseLink(req, res, id, n) {
    begrenze(req, "lesen", k.rateLesen);
    const link = lager.lebenderLink(id);
    if (!link) raus(404, "Diesen Link gibt es nicht (mehr).");
    const v = n === null ? link.versionen[link.versionen.length - 1] : link.versionen[n - 1];
    if (!v) raus(404, "Diese Version gibt es nicht.");
    let bytes;
    try { bytes = await lager.leseBlob(v.manifest); } catch { raus(404, "Diesen Link gibt es nicht (mehr)."); }
    sende(res, 200, projektAntwort(link, v, bytes), { "Cache-Control": n === null ? "no-store" : FEST });
  }

  /** Prüft ein Manifest gegen die Blobs (unter der Sperre). Liefert die Dateihashes. */
  async function pruefeGegenBlobs(m) {
    const fehlend = [...new Set(m.dateien.filter((d) => !lager.blobs.has(d.sha256)).map((d) => d.sha256))];
    if (fehlend.length) throw new Antwort(409, { fehlend });
    for (const d of m.dateien) {
      if (lager.blobs.get(d.sha256) !== d.groesse) raus(422, "Die Größe von " + d.pfad + " stimmt nicht.");
      const e = endung(d.pfad);
      const bytes = TEXT_ENDUNGEN.has(e) ? await lager.leseBlob(d.sha256) : await lager.leseAnfang(d.sha256, 8);
      const grund = pruefeInhalt(d.pfad, bytes, k);
      if (grund) raus(422, grund);
    }
    return m.dateien.map((d) => d.sha256);
  }

  async function postLink(req, res, id) {
    if (medienTyp(req) !== "application/json") raus(415, "Erwartet wird Content-Type application/json.");
    begrenze(req, "schreiben", k.rateSchreiben);
    if (id !== null) {
      if (!lager.lebenderLink(id)) { req.resume(); raus(404, "Diesen Link gibt es nicht (mehr)."); }
      if (!schluesselPasst(req.headers.authorization, lager.links.get(id).schluesselHash)) { req.resume(); raus(403, "Der Schlüssel passt nicht zu diesem Link."); }
    }
    const roh = await leseJson(req, k.maxManifestBytes, "Das Manifest ist zu groß.");
    const g = pruefeManifest(roh, k);
    if (g.fehler) raus(422, g.fehler);
    const wer = ip(req);
    const ergebnis = await lager.sperre(async () => {
      let link;
      if (id !== null) {
        link = lager.lebenderLink(id);
        if (!link) raus(404, "Diesen Link gibt es nicht (mehr).");
        if (!schluesselPasst(req.headers.authorization, link.schluesselHash)) raus(403, "Der Schlüssel passt nicht zu diesem Link.");
        const letzte = link.versionen[link.versionen.length - 1];
        if (letzte && letzte.manifest === g.hash) return { status: 200, koerper: { id, version: letzte.n, unveraendert: true } };
        if (link.versionen.length >= k.maxVersionen) raus(409, "Dieser Link hat schon " + k.maxVersionen + " Versionen – teile einen neuen Link.");
      }
      const dateiHashes = await pruefeGegenBlobs(g.manifest);
      // Neue Bytes in Links (bisher lose Blobs + neues Manifest) je IP und Stunde
      let neu = lager.blobs.has(g.hash) ? 0 : g.bytes.length;
      for (const h of new Set(dateiHashes)) if (!lager.istReferenziert(h)) neu += lager.blobs.get(h);
      if (k.neueBytesJeIp && neueBytes.summe(wer) + neu > k.neueBytesJeIp) raus(429, "Du hast in der letzten Stunde schon sehr viel geteilt – bitte später noch einmal.", { "Retry-After": "3600" });
      if (!lager.blobs.has(g.hash) && lager.speicher + g.bytes.length > k.speicherMaxBytes) speicherVoll();
      let schluessel = null;
      if (id === null) {
        let neueLinkId;
        do { neueLinkId = neueId(); } while (!lager.idFrei(neueLinkId));
        schluessel = neuerSchluessel();
        const heute = lager.heute();
        link = { id: neueLinkId, schluesselHash: schluesselHash(schluessel), erstellt: heute, geaendert: heute, versionen: [] };
      }
      await lager.legeBlobAn(g.hash, g.bytes);
      const gespeichert = await lager.speichereVersion(link, g.hash, dateiHashes);
      if (neu) neueBytes.plus(wer, neu);
      const koerper = { id: gespeichert.id, version: gespeichert.versionen.length };
      if (schluessel) koerper.schluessel = schluessel;
      return { status: 201, koerper };
    });
    sende(res, ergebnis.status, ergebnis.koerper);
  }

  async function loescheLink(req, res, id) {
    begrenze(req, "schreiben", k.rateSchreiben);
    req.resume();
    await lager.sperre(async () => {
      const link = lager.lebenderLink(id);
      if (!link) raus(404, "Diesen Link gibt es nicht (mehr).");
      if (!schluesselPasst(req.headers.authorization, link.schluesselHash)) raus(403, "Der Schlüssel passt nicht zu diesem Link.");
      await lager.loescheLink(id);
    });
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
  }

  // ───────────── Blobs ─────────────

  async function fehlend(req, res) {
    if (medienTyp(req) !== "application/json") raus(415, "Erwartet wird Content-Type application/json.");
    begrenze(req, "fehlend", k.rateFehlend);
    const roh = await leseJson(req, k.maxManifestBytes, "Die Anfrage ist zu groß.");
    const liste = roh && typeof roh === "object" && !Array.isArray(roh) ? roh.sha256 : undefined;
    if (!Array.isArray(liste) || liste.length > k.maxDateien || liste.some((h) => typeof h !== "string" || !HASH_MUSTER.test(h)))
      raus(422, '"sha256" muss eine Liste von höchstens ' + k.maxDateien + " SHA-256-Werten (64 Hex-Kleinbuchstaben) sein.");
    const antwort = await lager.sperre(async () => {
      const weg = [];
      for (const h of new Set(liste)) {
        if (lager.blobs.has(h)) await lager.beruehre(h);
        else weg.push(h);
      }
      return weg;
    });
    sende(res, 200, { fehlend: antwort });
  }

  async function putBlob(req, res, hash) {
    if (medienTyp(req) !== "application/octet-stream") raus(415, "Erwartet wird Content-Type application/octet-stream.");
    begrenze(req, "blob", k.rateBlobHoch);
    const wer = ip(req);
    if (lager.blobs.has(hash)) {
      req.resume();
      await lager.sperre(() => lager.beruehre(hash));
      return sende(res, 200, { sha256: hash });
    }
    const zuGross = "Die Datei ist zu groß (höchstens " + (k.maxDateiBytes / 1048576).toLocaleString("de-DE") + " MB).";
    const laenge = Number(req.headers["content-length"]);
    if (Number.isFinite(laenge) && laenge > k.maxDateiBytes) { req.resume(); raus(413, zuGross, { Connection: "close" }); }
    const platz = (g) => {
      if (lager.speicher + g > k.speicherMaxBytes) return "voll";
      if (k.loseAnteilProzent && lager.loseBytes + g > (k.speicherMaxBytes * k.loseAnteilProzent) / 100) return "voll";
      if (k.loseJeIpBytes && lager.loseBytesVon(wer) + g > k.loseJeIpBytes) return "ip";
      return null;
    };
    if (Number.isFinite(laenge)) {
      const p = platz(laenge);
      if (p) { req.resume(); if (p === "voll") speicherVoll(); raus(429, "Du hast gerade sehr viele Dateien hochgeladen – bitte später noch einmal.", { "Retry-After": "3600" }); }
    }
    const r = await lager.nimmBlob(req, hash, k.maxDateiBytes, wer, platz);
    if (r.status === "neu") return sende(res, 201, { sha256: hash });
    if (r.status === "vorhanden") return sende(res, 200, { sha256: hash });
    if (r.status === "zu-gross") raus(413, zuGross, { Connection: "close" });
    if (r.status === "falsch") raus(422, "Der Inhalt passt nicht zum SHA-256 in der Adresse.");
    if (r.status === "voll") speicherVoll();
    if (r.status === "ip") raus(429, "Du hast gerade sehr viele Dateien hochgeladen – bitte später noch einmal.", { "Retry-After": "3600" });
    raus(400, "Die Übertragung wurde abgebrochen.");
  }

  function getBlob(req, res, hash) {
    if (!lager.blobs.has(hash)) raus(404, "Diese Datei gibt es nicht (mehr).");
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(lager.blobs.get(hash)),
      "Cache-Control": FEST,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "attachment",
    });
    if (req.method === "HEAD") return res.end();
    const s = lager.blobStrom(hash);
    s.on("error", (e) => { log("Fehler beim Lesen eines Blobs: " + fehlerArt(e)); res.destroy(); });
    s.pipe(res);
  }

  // ───────────── Routing ─────────────

  function sende(res, status, koerper, kopf = {}) {
    const text = JSON.stringify(koerper) + "\n";
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(text)),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...kopf,
    });
    res.end(text);
  }

  const nur = (req, ...methoden) => {
    if (!methoden.includes(req.method)) raus(405, "Diese Methode ist hier nicht erlaubt.", { Allow: methoden.join(", ") });
  };

  async function bearbeite(req, res) {
    let pfad;
    try { pfad = decodeURIComponent(String(req.url || "/").split("?")[0]); } catch { raus(400, "Ungültige Adresse."); }
    if (pfad === "/healthz") {
      nur(req, "GET", "HEAD");
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return res.end("ok\n");
    }
    if (pfad === "/api/konfig") { nur(req, "GET", "HEAD"); return sende(res, 200, konfigAntwort(k)); }
    if (pfad === "/api/blob/fehlend") { nur(req, "POST"); return fehlend(req, res); }
    if (pfad.startsWith("/api/blob/")) {
      const hash = pfad.slice(10);
      if (!HASH_MUSTER.test(hash)) raus(404, "Unbekannter Endpunkt.");
      nur(req, "GET", "HEAD", "PUT");
      return req.method === "PUT" ? putBlob(req, res, hash) : getBlob(req, res, hash);
    }
    if (pfad === "/api/teilen") { nur(req, "POST"); return postLink(req, res, null); }
    if (pfad.startsWith("/api/teilen/")) {
      const m = /^([0-9A-Za-z]{12})(?:@([1-9][0-9]{0,5}))?$/.exec(pfad.slice(12));
      if (!m || !ID_MUSTER.test(m[1])) raus(404, "Diesen Link gibt es nicht (mehr).");
      if (m[2] !== undefined) { nur(req, "GET", "HEAD"); return leseLink(req, res, m[1], Number(m[2])); }
      nur(req, "GET", "HEAD", "POST", "DELETE");
      if (req.method === "POST") return postLink(req, res, m[1]);
      if (req.method === "DELETE") return loescheLink(req, res, m[1]);
      return leseLink(req, res, m[1], null);
    }
    raus(404, "Unbekannter Endpunkt.");
  }

  const server = http.createServer((req, res) => {
    bearbeite(req, res).catch((e) => {
      if (res.headersSent) { res.destroy(); return; }
      if (e instanceof Antwort) { if (!req.complete) req.resume(); return sende(res, e.status, e.koerper, e.kopf); }
      log("Fehler: " + fehlerArt(e));
      sende(res, 500, { fehler: "Interner Fehler im Teilen-Dienst." });
    });
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 20_000;
  server.keepAliveTimeout = 5_000;

  async function aufraeumen() {
    const r = await lager.aufraeumen();
    raten.aufraeumen();
    neueBytes.aufraeumen();
    log("Aufräumen: " + r.links + " Link(s) abgelaufen, " + r.blobs + " Blob(s) entfernt, " + lager.links.size + " Link(s), " +
      (lager.speicher / 1048576).toFixed(1) + " MB belegt");
    return r;
  }
  const uhr = setInterval(() => { aufraeumen().catch((e) => log("Fehler beim Aufräumen: " + fehlerArt(e))); }, k.aufraeumenMinuten * MINUTE);
  uhr.unref();

  await new Promise((ok, nein) => { server.once("error", nein); server.listen(o.port ?? k.port, o.host || "0.0.0.0", ok); });
  const port = server.address().port;
  log("Durchreiche bereit auf Port " + port + ": " + lager.links.size + " Link(s), " + lager.blobs.size + " Blob(s), " +
    (lager.speicher / 1048576).toFixed(1) + " MB, Aufbewahrung " + (k.ablaufTage > 0 ? k.ablaufTage + " Tage ab letzter Version" : "unbegrenzt"));

  return {
    port,
    konfig: k,
    lager,
    aufraeumen,
    schliesse: () => new Promise((ok) => { clearInterval(uhr); server.close(() => ok()); server.closeAllConnections(); }),
  };
}

// Direkt gestartet (nicht importiert)?
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  starte().then((d) => {
    const ende = () => { d.schliesse().then(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
    process.on("SIGTERM", ende);
    process.on("SIGINT", ende);
  }, (e) => {
    console.error("Durchreiche konnte nicht starten: " + fehlerArt(e));
    process.exit(1);
  });
}
