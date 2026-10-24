// Projektverwaltung des Playgrounds (PROJEKTE.md §3.1–§3.3, K-142, Nutzerentscheidungen F11/F12): genau EIN aktives Projekt je
// Fenster, dessen Dateien im Speicher liegen; alle Projekte in der Ablage (IndexedDB, sonst nur im Speicher). Ohne DOM – die
// Oberfläche (tabs.js, dateibaum.js, projektmenue.js) hört auf Ereignisse und ruft die Methoden unten.
//
// Ereignisse (an(art, fn)): "wechsel" (anderes Projekt aktiv), "dateien" (Dateiliste/Hauptdatei geändert), "liste" (Projektliste),
// "extern" ({ pfad }: Datei in einem anderen Fenster gespeichert und hier neu geladen), "meldung" ({ text, art }).
import {
  HAUPTDATEI_STANDARD, PROJEKTDATEI, pruefePfad, dateiArt, sammlung as baueSammlung, projektNameAus, eindeutigerPfad,
  aendereProjektdatei, leseProjektdateiLokal, erzeugeProjektdatei, pizzaPfadAusName,
} from "./projekt.js";
import { oeffneAblage } from "./ablage.js";
import { migriereTabs, leseAlteTabs, ALTE_TABS, MAX_PAPIERKORB } from "./migration.js";

export const AKTIV_SCHLUESSEL = "pizza.projekt";
const SPEICHER_VERZOEGERUNG = 400;

let zaehler = 0;
export const neueProjektId = () => "p" + Date.now().toString(36) + (zaehler++).toString(36) + Math.floor(Math.random() * 1296).toString(36);

const sitzung = {
  hole(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  setze(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* egal */ } },
};

/** Neuer Projekt-Datensatz (Felder wie PROJEKTE §3.2). */
export function neuerDatensatz({ id = neueProjektId(), name, hauptdatei, args = "", quelle = null, offen, jetzt = Date.now() }) {
  return {
    id, name: projektNameAus(name), hauptdatei, args, erstellt: jetzt, geaendert: jetzt,
    offen: offen || [hauptdatei], aktiv: hauptdatei, angeheftet: [], quelle, teilen: null, ordner: [],
  };
}

/**
 * @param {{ speicher: { hole, setze, entferne? }, willkommen: string, ablage?: object, kanal?: BroadcastChannel | null }} o
 */
export async function erstelleProjekte({ speicher, willkommen, ablage = null, kanal } = {}) {
  ablage = ablage || await oeffneAblage();
  const fensterId = neueProjektId();
  const hoerer = new Map();
  const melde = (art, daten) => { for (const fn of hoerer.get(art) || []) { try { fn(daten); } catch (e) { console.error(e); } } };

  /** id → Datensatz (auch gelöschte, mit Feld geloescht) */
  const datensaetze = new Map();
  for (const p of await ablage.ladeProjekte()) if (p && p.id) datensaetze.set(p.id, normalisiere(p));

  // ---------- erster Start: Migration der alten Tabs (F12) oder Willkommen ----------
  let startId = null;
  if (!datensaetze.size) {
    const alt = leseAlteTabs(speicher);
    const m = alt ? migriereTabs(alt, { neueId: neueProjektId }) : null;
    if (m && m.projekte.length) {
      try {
        await ablage.schreibeProjekte(m.projekte);
        // erst nach erfolgreichem Schreiben entfernen – und nur, wenn die Projekte dauerhaft liegen
        if (ablage.dauerhaft && speicher.entferne) speicher.entferne(ALTE_TABS);
      } catch (e) { /* bleibt im Speicher; pizza.tabs bleibt für den nächsten Versuch */ }
      for (const { projekt } of m.projekte) datensaetze.set(projekt.id, normalisiere(projekt));
      startId = m.aktiv;
    } else {
      const p = neuerDatensatz({ name: "willkommen", hauptdatei: "willkommen.pizza" });
      datensaetze.set(p.id, p);
      await sicher(() => ablage.schreibeProjekte([{ projekt: p, dateien: [{ pfad: p.hauptdatei, inhalt: willkommen, basis: willkommen }] }]));
      startId = p.id;
    }
  }

  // ---------- aktives Projekt ----------
  /** { rec, dateien: Map(pfad → { inhalt, basis, gespeichert }) } */
  let aktiv = null;
  let timer = null;
  const schmutzig = new Set();   // Pfade mit ungespeichertem Inhalt (Ablage)
  const weg = new Set();          // gelöschte Pfade, noch aus der Ablage zu entfernen
  let recSchmutzig = false;

  function normalisiere(p) {
    const r = { ...p };
    r.offen = Array.isArray(r.offen) ? r.offen.filter((x) => typeof x === "string") : [];
    r.angeheftet = Array.isArray(r.angeheftet) ? r.angeheftet.filter((x) => typeof x === "string") : [];
    r.ordner = Array.isArray(r.ordner) ? r.ordner.filter((x) => typeof x === "string") : [];
    r.args = typeof r.args === "string" ? r.args : "";
    r.name = projektNameAus(r.name);
    return r;
  }
  async function sicher(fn) {
    try { await fn(); return true; } catch (e) {
      melde("meldung", { text: "Speichern im Browser fehlgeschlagen (" + (e && e.message ? e.message : String(e)) + "). Sichere dein Projekt als ZIP.", art: "fehler" });
      return false;
    }
  }
  const sichtbare = () => [...datensaetze.values()].filter((p) => !p.geloescht).sort((a, b) => b.geaendert - a.geaendert);

  async function lade(id) {
    const rec = datensaetze.get(id);
    const liste = await ablage.ladeDateien(id);
    const dateien = new Map();
    for (const d of liste) dateien.set(d.pfad, { inhalt: d.inhalt, basis: d.basis === undefined ? d.inhalt : d.basis, gespeichert: d.inhalt });
    // Datensatz an die Dateien angleichen (z. B. nach Löschen in einem anderen Fenster)
    if (!dateien.size) {
      const pfad = rec.hauptdatei && dateiArt(rec.hauptdatei) === "pizza" ? rec.hauptdatei : HAUPTDATEI_STANDARD;
      dateien.set(pfad, { inhalt: "", basis: "", gespeichert: null });
      schmutzig.add(pfad);
    }
    if (!dateien.has(rec.hauptdatei)) {
      const pizzas = [...dateien.keys()].filter((p) => dateiArt(p) === "pizza").sort();
      rec.hauptdatei = dateien.has(HAUPTDATEI_STANDARD) ? HAUPTDATEI_STANDARD : pizzas[0] || [...dateien.keys()][0];
    }
    rec.offen = rec.offen.filter((p) => dateien.has(p));
    if (!rec.offen.length) rec.offen = [rec.hauptdatei];
    if (!dateien.has(rec.aktiv) || !rec.offen.includes(rec.aktiv)) rec.aktiv = rec.offen[0];
    rec.angeheftet = rec.angeheftet.filter((p) => rec.offen.includes(p));
    return { rec, dateien };
  }

  function merkeAktiv(id) { sitzung.setze(AKTIV_SCHLUESSEL, id); speicher.setze(AKTIV_SCHLUESSEL, id); }

  const startKandidat = [startId, sitzung.hole(AKTIV_SCHLUESSEL), speicher.hole(AKTIV_SCHLUESSEL)].find((id) => id && datensaetze.has(id) && !datensaetze.get(id).geloescht);
  let erstes = startKandidat || (sichtbare()[0] && sichtbare()[0].id);
  if (!erstes) {
    const p = neuerDatensatz({ name: "unbenannt-1", hauptdatei: "unbenannt-1.pizza" });
    datensaetze.set(p.id, p);
    await sicher(() => ablage.schreibeProjekte([{ projekt: p, dateien: [{ pfad: p.hauptdatei, inhalt: "", basis: "" }] }]));
    erstes = p.id;
  }
  aktiv = await lade(erstes);
  merkeAktiv(erstes);

  // ---------- Speichern (entprellt wie früher die Tabs, zusätzlich sofort bei pagehide) ----------
  function planeSpeichern() { clearTimeout(timer); timer = setTimeout(() => speichern(), SPEICHER_VERZOEGERUNG); }
  async function speichern() {
    clearTimeout(timer);
    timer = null;
    if (!aktiv) return;
    const { rec, dateien } = aktiv;
    const id = rec.id;
    const pfade = [...schmutzig];
    const geloescht = [...weg];
    const mitRec = recSchmutzig;
    schmutzig.clear(); weg.clear(); recSchmutzig = false;
    if (!pfade.length && !geloescht.length && !mitRec) return;
    const ok = await sicher(async () => {
      for (const p of geloescht) await ablage.loescheDatei(id, p);
      for (const p of pfade) {
        const d = dateien.get(p);
        if (!d) continue;
        await ablage.schreibeDatei(id, p, { inhalt: d.inhalt, basis: d.basis });
        d.gespeichert = d.inhalt;
      }
      await ablage.schreibeProjekt(rec);
    });
    if (ok && kanal) { try { kanal.postMessage({ fenster: fensterId, projekt: id, pfade, geloescht }); } catch (e) { /* egal */ } }
  }
  const aendereRec = (geaendert = true) => { recSchmutzig = true; if (geaendert) aktiv.rec.geaendert = Date.now(); planeSpeichern(); };

  // ---------- mehrere Fenster (BroadcastChannel „pizza-projekte“) ----------
  if (kanal === undefined) { try { kanal = typeof BroadcastChannel === "function" ? new BroadcastChannel("pizza-projekte") : null; } catch (e) { kanal = null; } }
  if (kanal) {
    kanal.onmessage = async (m) => {
      const d = m && m.data;
      if (!d || d.fenster === fensterId || !d.projekt) return;
      const alle = await ablage.ladeProjekte().catch(() => null);
      if (alle) {
        for (const p of alle) {
          if (aktiv && p.id === aktiv.rec.id) { const r = aktiv.rec; r.name = p.name; r.geaendert = Math.max(r.geaendert, p.geaendert); continue; }
          datensaetze.set(p.id, normalisiere(p));
        }
        for (const id of [...datensaetze.keys()]) if (!alle.some((p) => p.id === id) && (!aktiv || id !== aktiv.rec.id)) datensaetze.delete(id);
        melde("liste");
      }
      if (!aktiv || d.projekt !== aktiv.rec.id) return;
      const neu = await ablage.ladeDateien(d.projekt).catch(() => null);
      if (!neu) return;
      let geaendert = false;
      for (const n of neu) {
        if (!(d.pfade || []).includes(n.pfad)) continue;
        const lokal = aktiv.dateien.get(n.pfad);
        if (lokal && lokal.inhalt !== lokal.gespeichert) {
          melde("meldung", { text: "„" + n.pfad + "“ wurde in einem anderen Fenster geändert – zuletzt gespeichert gewinnt.", art: "info" });
          continue;
        }
        aktiv.dateien.set(n.pfad, { inhalt: n.inhalt, basis: n.basis, gespeichert: n.inhalt });
        if (lokal) melde("extern", { pfad: n.pfad }); else geaendert = true;
      }
      for (const p of d.geloescht || []) {
        const lokal = aktiv.dateien.get(p);
        if (lokal && lokal.inhalt === lokal.gespeichert && aktiv.dateien.size > 1) { aktiv.dateien.delete(p); geaendert = true; }
      }
      if (geaendert) melde("dateien");
    };
  }

  // ---------- Hilfen ----------
  const rec = () => aktiv.rec;
  const istProjektdateiGueltig = () => {
    const t = aktiv.dateien.get(PROJEKTDATEI);
    const r = t ? leseProjektdateiLokal(t.inhalt) : null;
    return r && !r.fehler ? r : null;
  };
  function eindeutigerName(name, ausser) {
    const belegt = new Set(sichtbare().filter((p) => p.id !== ausser).map((p) => p.name));
    if (!belegt.has(name)) return name;
    for (let i = 2; ; i++) { const n = name + "-" + i; if (!belegt.has(n)) return n; }
  }
  function papierkorbAufraeumen() {
    const geloescht = [...datensaetze.values()].filter((p) => p.geloescht).sort((a, b) => b.geloescht - a.geloescht);
    for (const p of geloescht.slice(MAX_PAPIERKORB)) { datensaetze.delete(p.id); sicher(() => ablage.loescheProjekt(p.id)); }
  }
  /** pizza.json mitziehen (name/hauptdatei), falls vorhanden und gültig (PROJEKTE §1.4). */
  function projektdateiNachziehen(felder) {
    const d = aktiv.dateien.get(PROJEKTDATEI);
    if (!d || typeof d.inhalt !== "string") return;
    const neu = aendereProjektdatei(d.inhalt, felder);
    if (neu != null && neu !== d.inhalt) { d.inhalt = neu; schmutzig.add(PROJEKTDATEI); melde("extern", { pfad: PROJEKTDATEI }); }
  }

  async function wechsle(id) {
    if (!datensaetze.has(id) || datensaetze.get(id).geloescht || (aktiv && aktiv.rec.id === id)) return false;
    await speichern();
    aktiv = await lade(id);
    datensaetze.set(id, aktiv.rec);
    merkeAktiv(id);
    melde("wechsel");
    return true;
  }

  /** Neues Projekt anlegen und aktivieren. dateien: { pfad → inhalt }; unveraendert: basis = inhalt (kein „geändert“-Punkt). */
  async function neu({ name = null, dateien = null, hauptdatei = null, quelle = null, args = "", unveraendert = true } = {}) {
    let n = name;
    if (!n) { let i = 1; const namen = new Set(sichtbare().map((p) => p.name)); while (namen.has("unbenannt-" + i)) i++; n = "unbenannt-" + i; }
    n = eindeutigerName(projektNameAus(n));
    const ds = dateien && Object.keys(dateien).length ? dateien : { [hauptdatei || pizzaPfadAusName(n)]: "" };
    let hd = hauptdatei && ds[hauptdatei] != null ? hauptdatei : null;
    if (!hd) {
      const pj = leseProjektdateiLokal(ds[PROJEKTDATEI]);
      if (pj && !pj.fehler && pj.hauptdatei && ds[pj.hauptdatei] != null) hd = pj.hauptdatei;
    }
    if (!hd) {
      const pizzas = Object.keys(ds).filter((p) => dateiArt(p) === "pizza").sort();
      hd = ds[HAUPTDATEI_STANDARD] != null ? HAUPTDATEI_STANDARD : pizzas[0] || Object.keys(ds)[0];
    }
    // Startwert des Felds „Argumente“ aus pizza.json (PROJEKTE §1.2) – danach lokal je Projekt
    let a = args;
    if (!a) {
      const pj = leseProjektdateiLokal(ds[PROJEKTDATEI]);
      if (pj && !pj.fehler && pj.args && pj.args.length) a = pj.args.map((x) => (/^[^\s"'\\]+$/.test(x) ? x : '"' + x.replace(/[\\"]/g, "\\$&") + '"')).join(" ");
    }
    const p = neuerDatensatz({ name: n, hauptdatei: hd, quelle, args: a });
    p.offen = [hd];
    datensaetze.set(p.id, p);
    const liste = Object.entries(ds).map(([pfad, inhalt]) => ({ pfad, inhalt, basis: unveraendert ? inhalt : (typeof inhalt === "string" ? "" : inhalt) }));
    await sicher(() => ablage.schreibeProjekte([{ projekt: p, dateien: liste }]));
    if (kanal) { try { kanal.postMessage({ fenster: fensterId, projekt: p.id, pfade: [], geloescht: [] }); } catch (e) { /* egal */ } }
    await speichern();
    aktiv = await lade(p.id);
    merkeAktiv(p.id);
    melde("liste");
    melde("wechsel");
    return p;
  }
  async function loesche(id = aktiv.rec.id) {
    const p = datensaetze.get(id);
    if (!p || p.geloescht) return;
    if (aktiv && aktiv.rec.id === id) await speichern();
    p.geloescht = Date.now();
    await sicher(() => ablage.schreibeProjekt(p));
    papierkorbAufraeumen();
    if (aktiv && aktiv.rec.id === id) {
      const naechstes = sichtbare()[0];
      if (naechstes) { aktiv = await lade(naechstes.id); merkeAktiv(naechstes.id); melde("wechsel"); }
      else await neu({});
    }
    melde("liste");
  }

  async function wiederherstellen(id) {
    const p = datensaetze.get(id);
    if (!p || !p.geloescht) return false;
    delete p.geloescht;
    p.name = eindeutigerName(p.name, p.id);
    p.geaendert = Date.now();
    await sicher(() => ablage.schreibeProjekt(p));
    melde("liste");
    await wechsle(id);
    return true;
  }

  return {
    get dauerhaft() { return ablage.dauerhaft; },
    get grund() { return ablage.grund; },
    ablage,
    an(art, fn) { if (!hoerer.has(art)) hoerer.set(art, []); hoerer.get(art).push(fn); },

    // ----- Projekte -----
    get aktiv() { return rec(); },
    liste: () => sichtbare().map((p) => ({ ...p })),
    papierkorb: () => [...datensaetze.values()].filter((p) => p.geloescht).sort((a, b) => b.geloescht - a.geloescht).map((p) => ({ ...p })),
    findeQuelle: (quelle) => sichtbare().find((p) => p.quelle === quelle) || null,
    wechsle,
    neu,
    loesche,
    wiederherstellen,
    async umbenennen(name) {
      const n = eindeutigerName(projektNameAus(name), rec().id);
      if (n === rec().name) return n;
      rec().name = n;
      projektdateiNachziehen({ name: n });
      aendereRec();
      melde("liste");
      return n;
    },
    async dupliziere() {
      await speichern();
      const ds = {};
      for (const [p, d] of aktiv.dateien) ds[p] = d.inhalt instanceof Uint8Array ? d.inhalt.slice() : d.inhalt;
      return neu({ name: rec().name + "-kopie", dateien: ds, hauptdatei: rec().hauptdatei, args: rec().args, unveraendert: false });
    },
    /** Ist das aktive Projekt unverändert gegenüber seiner Quelle (alle Dateien = basis)? */
    unveraendert: () => [...aktiv.dateien.values()].every((d) => d.inhalt === d.basis || (d.inhalt instanceof Uint8Array && d.basis instanceof Uint8Array && d.inhalt.length === d.basis.length)),
    async istUnveraendert(id) {
      if (aktiv && aktiv.rec.id === id) return this.unveraendert();
      const liste = await ablage.ladeDateien(id);
      return liste.every((d) => d.inhalt === d.basis || d.inhalt instanceof Uint8Array);
    },

    // ----- Dateien des aktiven Projekts -----
    pfade: () => [...aktiv.dateien.keys()].sort(),
    ordner: () => rec().ordner.slice(),
    hat: (pfad) => aktiv.dateien.has(pfad),
    inhalt: (pfad) => (aktiv.dateien.has(pfad) ? aktiv.dateien.get(pfad).inhalt : null),
    basis: (pfad) => (aktiv.dateien.has(pfad) ? aktiv.dateien.get(pfad).basis : null),
    istGeaendert(pfad) { const d = aktiv.dateien.get(pfad); return !!d && typeof d.inhalt === "string" && d.inhalt !== d.basis; },
    alleInhalte() { const r = {}; for (const [p, d] of aktiv.dateien) r[p] = d.inhalt; return r; },
    setzeInhalt(pfad, text) {
      const d = aktiv.dateien.get(pfad);
      if (!d || d.inhalt === text) return;
      d.inhalt = text;
      schmutzig.add(pfad);
      aendereRec();
    },
    /** Strg+S: Datei als gespeichert markieren (basis = inhalt). */
    sichern(pfad) {
      const d = aktiv.dateien.get(pfad);
      if (!d) return;
      d.basis = d.inhalt;
      schmutzig.add(pfad);
      aendereRec(false);
      return speichern();
    },
    /** Datei anlegen → null | Fehlertext. */
    neueDatei(pfad, inhalt = "") {
      const f = pruefePfad(pfad);
      if (f) return f;
      if (aktiv.dateien.has(pfad)) return `„${pfad}“ gibt es schon.`;
      if ([...aktiv.dateien.keys()].some((p) => p.startsWith(pfad + "/")) || rec().ordner.includes(pfad)) return `„${pfad}“ ist schon ein Ordner.`;
      const teile = pfad.split("/");
      for (let i = 1; i < teile.length; i++) if (aktiv.dateien.has(teile.slice(0, i).join("/"))) return `„${teile.slice(0, i).join("/")}“ ist eine Datei, kein Ordner.`;
      aktiv.dateien.set(pfad, { inhalt, basis: inhalt, gespeichert: null });
      rec().ordner = rec().ordner.filter((o) => !pfad.startsWith(o + "/"));
      schmutzig.add(pfad);
      aendereRec();
      melde("dateien");
      return null;
    },
    neuerOrdner(pfad) {
      const f = pruefePfadOrdner(pfad);
      if (f) return f;
      if (aktiv.dateien.has(pfad)) return `„${pfad}“ ist schon eine Datei.`;
      if (rec().ordner.includes(pfad) || [...aktiv.dateien.keys()].some((p) => p.startsWith(pfad + "/"))) return `Den Ordner „${pfad}“ gibt es schon.`;
      rec().ordner.push(pfad);
      aendereRec();
      melde("dateien");
      return null;
    },
    /** Datei oder Ordner umbenennen/verschieben → null | Fehlertext. */
    verschiebe(alt, neuPfad) {
      if (alt === neuPfad) return null;
      const istOrdner = !aktiv.dateien.has(alt);
      const betroffen = istOrdner ? [...aktiv.dateien.keys()].filter((p) => p.startsWith(alt + "/")) : [alt];
      if (istOrdner && !betroffen.length && !rec().ordner.includes(alt)) return `„${alt}“ gibt es nicht.`;
      if (istOrdner && (neuPfad + "/").startsWith(alt + "/")) return "Ein Ordner kann nicht in sich selbst liegen.";
      const ziel = (p) => (istOrdner ? neuPfad + p.slice(alt.length) : neuPfad);
      for (const p of betroffen) {
        const z = ziel(p);
        const f = pruefePfad(z);
        if (f) return f;
        if (aktiv.dateien.has(z) && !betroffen.includes(z)) return `„${z}“ gibt es schon.`;
      }
      if (istOrdner && !betroffen.length) { const f = pruefePfadOrdner(neuPfad); if (f) return f; }
      if (!istOrdner && dateiArt(alt) !== dateiArt(neuPfad) && (dateiArt(alt) === "bild" || dateiArt(neuPfad) === "bild")) return "Bild- und Textdateien lassen sich nicht ineinander umbenennen.";
      const r = rec();
      for (const p of betroffen) {
        const z = ziel(p);
        const d = aktiv.dateien.get(p);
        aktiv.dateien.delete(p);
        aktiv.dateien.set(z, { ...d, gespeichert: null });
        weg.add(p); weg.delete(z); schmutzig.delete(p); schmutzig.add(z);
        r.offen = r.offen.map((x) => (x === p ? z : x));
        r.angeheftet = r.angeheftet.map((x) => (x === p ? z : x));
        if (r.aktiv === p) r.aktiv = z;
        if (r.hauptdatei === p) { r.hauptdatei = z; projektdateiNachziehen({ hauptdatei: z }); }
      }
      r.ordner = r.ordner.map((o) => (o === alt || o.startsWith(alt + "/") ? (istOrdner ? neuPfad + o.slice(alt.length) : o) : o));
      aendereRec();
      melde("dateien", { umbenannt: Object.fromEntries(betroffen.map((p) => [p, ziel(p)])) });
      return null;
    },
    /** Datei oder Ordner löschen → null | Fehlertext. Die letzte Datei bleibt (ein Projekt braucht eine Datei). */
    loescheDatei(pfad) {
      const betroffen = aktiv.dateien.has(pfad) ? [pfad] : [...aktiv.dateien.keys()].filter((p) => p.startsWith(pfad + "/"));
      const r = rec();
      if (!betroffen.length) { r.ordner = r.ordner.filter((o) => o !== pfad && !o.startsWith(pfad + "/")); aendereRec(); melde("dateien"); return null; }
      if (betroffen.length >= aktiv.dateien.size) return "Ein Projekt braucht mindestens eine Datei.";
      for (const p of betroffen) { aktiv.dateien.delete(p); weg.add(p); schmutzig.delete(p); }
      r.offen = r.offen.filter((p) => aktiv.dateien.has(p));
      r.angeheftet = r.angeheftet.filter((p) => aktiv.dateien.has(p));
      r.ordner = r.ordner.filter((o) => o !== pfad && !o.startsWith(pfad + "/"));
      if (!aktiv.dateien.has(r.hauptdatei)) {
        const pizzas = [...aktiv.dateien.keys()].filter((p) => dateiArt(p) === "pizza").sort();
        r.hauptdatei = pizzas[0] || [...aktiv.dateien.keys()].sort()[0];
        projektdateiNachziehen({ hauptdatei: r.hauptdatei });
      }
      if (!r.offen.length) r.offen = [r.hauptdatei];
      if (!r.offen.includes(r.aktiv)) r.aktiv = r.offen[0];
      aendereRec();
      melde("dateien");
      return null;
    },
    setzeHauptdatei(pfad) {
      if (!aktiv.dateien.has(pfad) || dateiArt(pfad) !== "pizza") return "Hauptdatei kann nur eine .pizza-Datei sein.";
      rec().hauptdatei = pfad;
      projektdateiNachziehen({ hauptdatei: pfad });
      aendereRec();
      melde("dateien");
      return null;
    },
    /** Nach dem Bearbeiten von pizza.json: name/hauptdatei übernehmen (eine Quelle, PROJEKTE §1.4). */
    projektdateiUebernehmen() {
      const pj = istProjektdateiGueltig();
      if (!pj) return;
      let anders = false;
      if (pj.hauptdatei && aktiv.dateien.has(pj.hauptdatei) && dateiArt(pj.hauptdatei) === "pizza" && pj.hauptdatei !== rec().hauptdatei) { rec().hauptdatei = pj.hauptdatei; anders = true; }
      if (pj.name && projektNameAus(pj.name) !== rec().name) { rec().name = eindeutigerName(projektNameAus(pj.name), rec().id); anders = true; melde("liste"); }
      if (anders) { aendereRec(); melde("dateien"); }
    },
    eindeutigerPfad: (pfad) => eindeutigerPfad(pfad, new Set(aktiv.dateien.keys())),

    // ----- Tabs, Argumente -----
    setzeTabs({ offen, aktiv: a, angeheftet }) {
      const r = rec();
      if (offen) r.offen = offen.slice();
      if (a !== undefined) r.aktiv = a;
      if (angeheftet) r.angeheftet = angeheftet.slice();
      aendereRec(false);
    },
    setzeArgs(text) { rec().args = String(text || ""); aendereRec(false); },

    // ----- Lauf -----
    /** Sammlung für Worker/Export (ohne pruefung/); mitProjektdatei: fehlende pizza.json erzeugen (ZIP/EXE/Teilen). */
    sammlung({ mitProjektdatei = false } = {}) {
      const ds = this.alleInhalte();
      if (mitProjektdatei && ds[PROJEKTDATEI] == null) ds[PROJEKTDATEI] = erzeugeProjektdatei(rec());
      return baueSammlung(rec(), ds);
    },

    speichern,
    sofortSpeichern() { speichern(); },
  };
}

/** Ordnerpfad prüfen (wie Dateipfade, aber ohne Dateiart). */
function pruefePfadOrdner(pfad) {
  const f = pruefePfad(pfad + "/x.txt");
  return f ? `„${pfad}“ ist kein gültiger Ordnername (nur a–z, 0–9, -, _, .).` : null;
}
