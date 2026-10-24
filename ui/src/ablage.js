// Ablage der Playground-Projekte (PROJEKTE.md §3.2, K-142): IndexedDB „pizza“ Version 1 mit den Speichern
//   projekte  (Schlüssel id)                 { id, name, hauptdatei, args, erstellt, geaendert, offen, aktiv, angeheftet, quelle, teilen, geloescht? }
//   dateien   (Schlüssel [projekt, pfad])    { projekt, pfad, inhalt: string | Uint8Array, basis }
//   teiglinge (Schlüssel schluessel)         { schluessel, bytes, groesse, zuletzt }   – vorgebackene Bilder, LRU bis 128 MiB
// Ohne IndexedDB (blockiert, privat, Fehler beim Öffnen) dieselbe Schnittstelle nur im Speicher (`dauerhaft: false`) – der
// Playground bleibt voll nutzbar und zeigt ein Banner. localStorage bleibt kleinen Einstellungen und den Vorratskammern vorbehalten.

export const DB_NAME = "pizza";
export const DB_VERSION = 1;
export const TEIGLING_GRENZE = 128 * 1024 * 1024;

const kopie = (v) => (v instanceof Uint8Array ? v.slice() : v);

/** Speicher-Ablage (Rückfall und Tests). */
export function speicherAblage(grund = null) {
  const projekte = new Map();
  const dateien = new Map(); // id → Map(pfad → { inhalt, basis })
  const teiglinge = new Map();
  let uhr = 0;
  const dateienVon = (id) => { if (!dateien.has(id)) dateien.set(id, new Map()); return dateien.get(id); };
  return {
    dauerhaft: false,
    grund,
    async ladeProjekte() { return [...projekte.values()].map((p) => structuredClone(p)); },
    async schreibeProjekt(p) { projekte.set(p.id, structuredClone(p)); },
    async loescheProjekt(id) { projekte.delete(id); dateien.delete(id); },
    async ladeDateien(id) {
      return [...dateienVon(id).entries()].map(([pfad, d]) => ({ pfad, inhalt: kopie(d.inhalt), basis: kopie(d.basis) }));
    },
    async schreibeDatei(id, pfad, { inhalt, basis }) { dateienVon(id).set(pfad, { inhalt: kopie(inhalt), basis: kopie(basis) }); },
    async loescheDatei(id, pfad) { dateienVon(id).delete(pfad); },
    async schreibeProjekte(liste) {
      for (const { projekt, dateien: ds } of liste) {
        projekte.set(projekt.id, structuredClone(projekt));
        const m = dateienVon(projekt.id);
        m.clear();
        for (const d of ds) m.set(d.pfad, { inhalt: kopie(d.inhalt), basis: kopie(d.basis) });
      }
    },
    async teiglingHole(schluessel) {
      const t = teiglinge.get(schluessel);
      if (!t) return null;
      t.zuletzt = ++uhr;
      return t.bytes.slice();
    },
    async teiglingLege(schluessel, bytes) {
      teiglinge.set(schluessel, { schluessel, bytes: bytes.slice(), groesse: bytes.byteLength, zuletzt: ++uhr });
      let summe = 0;
      for (const t of teiglinge.values()) summe += t.groesse;
      const alt = [...teiglinge.values()].sort((a, b) => a.zuletzt - b.zuletzt);
      while (summe > TEIGLING_GRENZE && alt.length > 1) { const t = alt.shift(); teiglinge.delete(t.schluessel); summe -= t.groesse; }
    },
    schliessen() {},
  };
}

const anfrage = (r) => new Promise((ok, nein) => { r.onsuccess = () => ok(r.result); r.onerror = () => nein(r.error); });
const fertig = (tx) => new Promise((ok, nein) => {
  tx.oncomplete = () => ok();
  tx.onerror = () => nein(tx.error);
  tx.onabort = () => nein(tx.error || new Error("Transaktion abgebrochen"));
});

/** Öffnet IndexedDB; bei Fehler (oder ohne IndexedDB) die Speicher-Ablage mit Grund. */
export async function oeffneAblage({ idb = typeof indexedDB !== "undefined" ? indexedDB : null, zeitlimit = 4000 } = {}) {
  if (!idb) return speicherAblage("IndexedDB ist in diesem Browser nicht verfügbar.");
  let db;
  try {
    db = await new Promise((ok, nein) => {
      let r;
      try { r = idb.open(DB_NAME, DB_VERSION); } catch (e) { nein(e); return; }
      const t = setTimeout(() => nein(new Error("IndexedDB antwortet nicht")), zeitlimit);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("projekte")) d.createObjectStore("projekte", { keyPath: "id" });
        if (!d.objectStoreNames.contains("dateien")) d.createObjectStore("dateien", { keyPath: ["projekt", "pfad"] });
        if (!d.objectStoreNames.contains("teiglinge")) d.createObjectStore("teiglinge", { keyPath: "schluessel" }).createIndex("zuletzt", "zuletzt");
      };
      r.onsuccess = () => { clearTimeout(t); ok(r.result); };
      r.onerror = () => { clearTimeout(t); nein(r.error); };
      r.onblocked = () => { /* anderes Fenster mit alter Version – wartet auf dessen Schließen */ };
    });
  } catch (e) {
    return speicherAblage("IndexedDB lässt sich nicht öffnen (" + (e && e.message ? e.message : String(e)) + ").");
  }
  return idbAblage(db);
}

function idbAblage(db) {
  const KeyRange = typeof IDBKeyRange !== "undefined" ? IDBKeyRange : null;
  const bereich = (id) => KeyRange.bound([id, ""], [id, "￿"]);
  const tx = (speicher, art = "readonly") => db.transaction(speicher, art);
  db.onversionchange = () => { try { db.close(); } catch (e) { /* egal */ } };
  return {
    dauerhaft: true,
    grund: null,
    async ladeProjekte() { return anfrage(tx("projekte").objectStore("projekte").getAll()); },
    async schreibeProjekt(p) { const t = tx("projekte", "readwrite"); t.objectStore("projekte").put(p); await fertig(t); },
    async loescheProjekt(id) {
      const t = tx(["projekte", "dateien"], "readwrite");
      t.objectStore("projekte").delete(id);
      t.objectStore("dateien").delete(bereich(id));
      await fertig(t);
    },
    async ladeDateien(id) {
      const liste = await anfrage(tx("dateien").objectStore("dateien").getAll(bereich(id)));
      return liste.map((d) => ({ pfad: d.pfad, inhalt: d.inhalt, basis: d.basis }));
    },
    async schreibeDatei(id, pfad, { inhalt, basis }) {
      const t = tx("dateien", "readwrite");
      t.objectStore("dateien").put({ projekt: id, pfad, inhalt, basis });
      await fertig(t);
    },
    async loescheDatei(id, pfad) { const t = tx("dateien", "readwrite"); t.objectStore("dateien").delete([id, pfad]); await fertig(t); },
    /** Mehrere Projekte samt Dateien in EINER Transaktion (Migration: alles oder nichts). */
    async schreibeProjekte(liste) {
      const t = tx(["projekte", "dateien"], "readwrite");
      const ps = t.objectStore("projekte"), ds = t.objectStore("dateien");
      for (const { projekt, dateien } of liste) {
        ps.put(projekt);
        ds.delete(bereich(projekt.id));
        for (const d of dateien) ds.put({ projekt: projekt.id, pfad: d.pfad, inhalt: d.inhalt, basis: d.basis });
      }
      await fertig(t);
    },
    async teiglingHole(schluessel) {
      const t = tx("teiglinge", "readwrite");
      const s = t.objectStore("teiglinge");
      const v = await anfrage(s.get(schluessel));
      if (v) { v.zuletzt = Date.now(); s.put(v); }
      await fertig(t);
      return v ? v.bytes : null;
    },
    async teiglingLege(schluessel, bytes) {
      const t = tx("teiglinge", "readwrite");
      const s = t.objectStore("teiglinge");
      s.put({ schluessel, bytes, groesse: bytes.byteLength, zuletzt: Date.now() });
      await fertig(t);
      // LRU: älteste Einträge entfernen, bis die Summe passt (der neueste bleibt immer)
      const t2 = tx("teiglinge", "readwrite");
      const s2 = t2.objectStore("teiglinge");
      const eintraege = [];
      await new Promise((ok, nein) => {
        const c = s2.index("zuletzt").openCursor();
        c.onsuccess = () => { const cur = c.result; if (!cur) { ok(); return; } eintraege.push([cur.value.schluessel, cur.value.groesse]); cur.continue(); };
        c.onerror = () => nein(c.error);
      });
      let summe = eintraege.reduce((a, [, g]) => a + g, 0);
      for (const [k, g] of eintraege) {
        if (summe <= TEIGLING_GRENZE || k === schluessel) break;
        s2.delete(k);
        summe -= g;
      }
      await fertig(t2);
    },
    schliessen() { try { db.close(); } catch (e) { /* egal */ } },
  };
}
