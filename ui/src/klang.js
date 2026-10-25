// Klang im Browser (SPEC §18.8, HERD.md §12.4 H-K14, K-153): Erzeuger laden, Lauf vorbereiten, Wiedergabe mit WebAudio.
//
// Der Programm-Worker (js/worker.js) erzeugt die Klänge mit klang.wasm (bitgleich mit nativ) und schickt die Ereignisse
// { typ: "klang", art: "spiele"|"stoppe"|"setze", … } an die Seite, die PCM eines Klangs einmal als { typ: "klang-pcm",
// klang, bytes, rate, kanaele } (geladene Klänge, H-K19a: eigene Rate, mono/stereo verschachtelt – WebAudio rechnet um) und bei Herd-Programmen je Bild den Hörer (Kamera) als { typ: "klang-hoerer", h }. Hier entsteht daraus
// Ton: je Spur AudioBufferSource → Tiefpass → Gain → StereoPanner → Gesamt-Gain → Ausgang. Raum wie nativ (herd_klang::raum).
// Autoplay: der AudioContext startet erst mit der ersten Nutzeraktion (Klick/Taste); vorher Gespieltes entfällt still,
// laufende Schleifen (Regen, Brummen) setzen dann ein. Stummschalter (gemerkt in localStorage „pizza.stumm“). In
// automatisierten Browsern (navigator.webdriver, E2E) ist der Ton immer stumm.

import { iconSvg } from "./icons.js";

const RATE = 48000;
let modulVersprechen = null;

/**
 * Seite anbinden: Wiedergabe + Stummschalter (Knopf im Kopf des Vorschaufensters) + Entsperren bei der ersten Nutzeraktion.
 * → { klang, ereignis(ev) für ausfuehrung.beiKlang, start(), ende() }; window.__klangStand für E2E.
 */
export function klangAnbinden(knopf) {
  const klang = erstelleKlang();
  const male = () => {
    if (!knopf) return;
    knopf.innerHTML = iconSvg(klang.stumm ? "stumm" : "ton");
    knopf.setAttribute("aria-pressed", klang.stumm ? "true" : "false");
    knopf.setAttribute("aria-label", klang.stumm ? "Ton an" : "Ton aus");
  };
  if (knopf) {
    knopf.addEventListener("pointerdown", (e) => e.stopPropagation());   // nicht das Fenster ziehen
    knopf.addEventListener("click", (e) => { e.stopPropagation(); klang.setzeStumm(!klang.stumm); male(); });
    male();
  }
  // Autoplay-Regel: AudioContext erst mit einer Nutzeraktion (Backen-Klick, Taste, Klick ins Spiel)
  for (const art of ["pointerdown", "keydown", "touchstart"]) document.addEventListener(art, () => klang.entsperren(), { capture: true, passive: true });
  if (typeof window !== "undefined") {
    window.__klangStand = () => klang.stand();
    // Prüfhilfe (E2E): PCM über dieselbe Wiedergabe in einen OfflineAudioContext rendern – nie hörbar
    window.__klangOffline = (bytes, ereignisse, hoerer, rate, kanaele) => klangOffline(bytes, ereignisse, hoerer, rate, kanaele);
  }
  return {
    klang,
    ereignis(ev) {
      if (ev.typ === "klang-pcm") klang.pcm(ev.klang, ev.bytes, ev.rate, ev.kanaele);
      else if (ev.typ === "klang-hoerer") klang.hoerer(ev.h);
      else { klang.ereignis(ev); if (knopf) knopf.hidden = false; }
    },
    start() { klang.ende(true); if (knopf) knopf.hidden = true; },
    ende() { klang.ende(false); },
  };
}

/** Nutzt das Programm Klang? Statischer Zugriff `Klang.…` im AST (wie der Interpreter, pruefeKlang); ohne Parser per Regex. */
export function nutztKlang(code) {
  const src = String(code || "");
  if (!/\bKlang\s*\./.test(src)) return false;
  const PL = typeof window !== "undefined" ? window.PizzaLang : null;
  if (PL && typeof PL.parse === "function") {
    let p = null;
    try { p = PL.parse(src); } catch (e) { p = null; }
    if (p && !p.ok) return true;    // im Zweifel laden (kostet nur klang.wasm)
    if (p && p.ast) {
      const stapel = [p.ast];
      let n = 0;
      while (stapel.length) {
        const x = stapel.pop();
        if (!x || typeof x !== "object") continue;
        if (++n > 2000000) return true;
        if (Array.isArray(x)) { for (const y of x) if (y && typeof y === "object") stapel.push(y); continue; }
        if ((x.k === "MCall" || x.k === "Mem") && x.obj && x.obj.k === "Name" && x.obj.n === "Klang") return true;
        for (const k in x) { const v = x[k]; if (v && typeof v === "object") stapel.push(v); }
      }
      return false;
    }
  }
  return true;
}

/** klang.wasm einmal je Seite kompilieren (WebAssembly.Module geht an jeden Lauf-Worker). */
export function ladeKlangModul() {
  if (!modulVersprechen) {
    modulVersprechen = (async () => {
      const r = await fetch("js/herd/klang.wasm");
      if (!r.ok) throw new Error("klang.wasm: HTTP " + r.status);
      return WebAssembly.compile(await r.arrayBuffer());
    })().catch((e) => { modulVersprechen = null; throw e; });
  }
  return modulVersprechen;
}

/** Extra-Felder für ausfuehrung.starte: { klangKern } (fehlt das Modul, meldet der Lauf HOST wie nativ) oder {}. */
export async function klangLaufVorbereiten(code) {
  if (!nutztKlang(code)) return {};
  try { return { klangKern: await ladeKlangModul() }; } catch (e) { return {}; }
}

/** Raum am Hörer (Spiegel von herd_klang::raum): [lautstaerke, panorama, tiefpass Hz]. */
export function raum(lage, reichweite, h) {
  const dx = lage[0] - h.x, dy = lage[1] - h.y, dz = lage[2] - h.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const r = reichweite > 0 ? reichweite : 1;
  if (d >= r) return [0, 0, 900];
  let g = d <= 1 ? 1 : 1 / d;
  const rand = 0.6 * r;
  if (d > rand) { const t = (d - rand) / (r - rand); g *= 1 - t * t * (3 - 2 * t); }
  let pan = d > 1e-9 ? (dx * h.rx + dy * h.ry + dz * h.rz) / d : 0;
  pan *= d < 1 ? d : 1;
  const tief = 18000 * Math.pow(900 / 18000, d / r);
  return [g, Math.max(-1, Math.min(1, pan)), tief];
}

function gemerktStumm() {
  try { return localStorage.getItem("pizza.stumm") === "1"; } catch (e) { return false; }
}
function automatisiert() {
  return typeof navigator !== "undefined" && navigator.webdriver === true && !(typeof window !== "undefined" && window.__klangHoerbar === true);
}

/**
 * Wiedergabe. kontext: eigener AudioContext/OfflineAudioContext (Tests); ohne: ein AudioContext entsteht bei der ersten
 * Nutzeraktion (entsperren()).
 */
export function erstelleKlang({ kontext = null, hoerbar = false } = {}) {
  let ctx = kontext, gesamt = null;
  const roh = new Map();         // Hash → { p: Int16Array (PCM, verschachtelt), rate, kanaele }
  const puffer = new Map();      // Hash → AudioBuffer
  const spuren = new Map();      // Nummer → Zustand { klang, laut, ton, pan, lage, reichweite, schleife, knoten }
  let hoerer = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0 };
  let stumm = gemerktStumm();
  let gespielt = 0;

  function knotenBauen() {
    if (gesamt || !ctx) return;
    gesamt = ctx.createGain();
    gesamt.gain.value = !hoerbar && (stumm || automatisiert()) ? 0 : 0.8;
    gesamt.connect(ctx.destination);
  }
  function bufferVon(hash) {
    let b = puffer.get(hash);
    if (b) return b;
    const r = roh.get(hash);
    if (!r || !ctx) return null;
    const { p, rate, kanaele } = r, n = Math.floor(p.length / kanaele);
    b = ctx.createBuffer(kanaele, Math.max(1, n), rate);
    for (let k = 0; k < kanaele; k++) {
      const d = b.getChannelData(k);
      for (let i = 0; i < n; i++) d[i] = p[i * kanaele + k] / 32767;
    }
    puffer.set(hash, b);
    return b;
  }
  function werte(s) {
    let g = s.laut, pan = s.pan, fc = 20000;
    if (s.lage) {
      const [gr, pr, tr] = raum(s.lage, s.reichweite, hoerer);
      g *= gr; pan = Math.max(-1, Math.min(1, pan + pr)); fc = tr;
    }
    return { g, pan, fc };
  }
  function anwenden(s, sofort) {
    if (!s.knoten || !ctx) return;
    const w = werte(s), t = ctx.currentTime, k = s.knoten;
    if (t - k.beginn < 0.01) sofort = true;   // gleich nach dem Start (z. B. spiele + setzeLage im selben Takt): ohne Gleiten
    if (sofort) {
      k.gain.gain.value = w.g; k.pan.pan.value = w.pan; k.tief.frequency.value = w.fc; k.quelle.playbackRate.value = s.ton;
    } else {
      k.gain.gain.setTargetAtTime(w.g, t, 0.02); k.pan.pan.setTargetAtTime(w.pan, t, 0.02);
      k.tief.frequency.setTargetAtTime(w.fc, t, 0.05); k.quelle.playbackRate.setTargetAtTime(s.ton, t, 0.02);
    }
  }
  function starte(s) {
    const b = bufferVon(s.klang);
    if (!b) return;
    knotenBauen();
    const quelle = ctx.createBufferSource();
    quelle.buffer = b;
    quelle.loop = s.schleife;
    const tief = ctx.createBiquadFilter();
    tief.type = "lowpass";
    tief.Q.value = 0.5;
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    quelle.connect(tief).connect(gain).connect(pan).connect(gesamt);
    s.knoten = { quelle, tief, gain, pan, beginn: ctx.currentTime };
    anwenden(s, true);
    quelle.onended = () => { if (s.knoten && s.knoten.quelle === quelle) { trenne(s); if (!s.schleife) spuren.delete(s.nr); } };
    quelle.start();
    gespielt++;
  }
  function trenne(s) {
    if (!s.knoten) return;
    const k = s.knoten;
    s.knoten = null;
    try { k.quelle.onended = null; k.quelle.stop(); } catch (e) { /* schon aus */ }
    try { k.pan.disconnect(); } catch (e) { /* egal */ }
  }
  const laeuftCtx = () => ctx && ctx.state !== "closed" && (ctx.state === "running" || typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext);

  return {
    /** Erste Nutzeraktion: AudioContext anlegen/fortsetzen; laufende Schleifen setzen ein. */
    entsperren() {
      if (typeof window === "undefined") return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!ctx) {
        if (!AC) return;
        try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { try { ctx = new AC(); } catch (e2) { return; } }
      }
      if (ctx.state === "suspended" && typeof ctx.resume === "function") {
        ctx.resume().then(() => { for (const s of spuren.values()) if (s.schleife && !s.knoten) starte(s); }).catch(() => {});
      } else if (laeuftCtx()) for (const s of spuren.values()) if (s.schleife && !s.knoten) starte(s);
    },
    /** PCM eines Klangs (einmal je Hash); rate/kanaele fehlen bei erzeugten Klängen (48 kHz mono). */
    pcm(hash, bytes, rate, kanaele) {
      if (roh.has(hash) || !bytes) return;
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const p = new Int16Array(u8.length >> 1);
      for (let i = 0; i < p.length; i++) { const v = u8[2 * i] | (u8[2 * i + 1] << 8); p[i] = v > 32767 ? v - 65536 : v; }
      const k = kanaele === 2 ? 2 : 1;
      roh.set(hash, { p, rate: rate >= 8000 && rate <= 96000 ? rate : RATE, kanaele: p.length >= k ? k : 1 });
    },
    /** Ereignis { typ: "klang", art, … } des Programms. */
    ereignis(ev) {
      if (!ev) return;
      if (ev.art === "spiele") {
        const s = { nr: ev.spur, klang: ev.klang, laut: +ev.lautstaerke || 0, ton: +ev.tonhoehe || 1, pan: +ev.panorama || 0, lage: null, reichweite: 30, schleife: ev.schleife === true, knoten: null };
        spuren.set(s.nr, s);
        if (laeuftCtx()) starte(s);
        else if (!s.schleife) spuren.delete(s.nr);   // vor der ersten Nutzeraktion: entfällt still
      } else if (ev.art === "stoppe") {
        const s = spuren.get(ev.spur);
        if (s) { trenne(s); spuren.delete(ev.spur); }
      } else if (ev.art === "setze") {
        const s = spuren.get(ev.spur);
        if (!s) return;
        s.laut = +ev.lautstaerke; s.ton = +ev.tonhoehe; s.pan = +ev.panorama;
        s.lage = Array.isArray(ev.lage) ? ev.lage.map(Number) : null;
        s.reichweite = +ev.reichweite || 30;
        anwenden(s, false);
      }
    },
    /** Hörer (Kamera) aus dem Bildpaket: { x, y, z, rx, ry, rz }. */
    hoerer(h) {
      if (!h) return;
      hoerer = h;
      for (const s of spuren.values()) if (s.lage) anwenden(s, false);
    },
    /** Lauf vorbei: Schleifen aus, einzelne Klänge klingen aus. alles: auch diese (neuer Lauf). */
    ende(alles = false) {
      for (const s of [...spuren.values()]) if (alles || s.schleife) { trenne(s); spuren.delete(s.nr); }
    },
    setzeStumm(b) {
      stumm = !!b;
      try { localStorage.setItem("pizza.stumm", stumm ? "1" : "0"); } catch (e) { /* egal */ }
      if (gesamt && ctx) gesamt.gain.setTargetAtTime(!hoerbar && (stumm || automatisiert()) ? 0 : 0.8, ctx.currentTime, 0.02);
    },
    get stumm() { return stumm; },
    /** Stand für Tests (E2E): Puffer, laufende Spuren, Kontext. */
    stand() {
      return { klaenge: roh.size, spuren: [...spuren.values()].map((s) => ({ spur: s.nr, schleife: s.schleife, laeuft: !!s.knoten, lage: s.lage })),
        kontext: ctx ? ctx.state : null, stumm, automatisiert: automatisiert(), gespielt, hoerer };
    },
    get kontext() { return ctx; },
  };
}

/**
 * Rendert Klang-Ereignisse mit der Wiedergabe in einen OfflineAudioContext (stumm, für Tests): bytes = PCM (Hash "probe"),
 * ereignisse = [{ art: "spiele"|"setze"|…, … }] (klang wird auf "probe" gesetzt), hoerer optional. → { links, rechts } (RMS je Kanal).
 */
export async function klangOffline(bytes, ereignisse, hoerer, rate, kanaele) {
  const OAC = typeof window !== "undefined" && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (!OAC) return null;
  const ctx = new OAC(2, RATE / 2, RATE);
  const k = erstelleKlang({ kontext: ctx, hoerbar: true });
  k.pcm("probe", bytes, rate, kanaele);
  if (hoerer) k.hoerer(hoerer);
  for (const e of ereignisse) k.ereignis(Object.assign({}, e, e.art === "spiele" ? { klang: "probe" } : {}));
  const b = await ctx.startRendering();
  const rms = (d) => { let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / d.length); };
  return { links: rms(b.getChannelData(0)), rechts: rms(b.getChannelData(1)) };
}

/** Hörer aus einem Bildpaket (Abschnitt SZENE = 10: ansicht_proj spaltenweise, kamera ab Byte 128); null ohne SZENE. */
export function hoererAusPaket(bytes) {
  if (!bytes || bytes.byteLength < 32) return null;
  const dv = new DataView(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x3150_5a48) return null;   // "HZP1"
  const n = dv.getUint32(20, true);
  let i = 32;
  for (let k = 0; k < n && i + 8 <= dv.byteLength; k++) {
    const art = dv.getUint32(i, true), len = dv.getUint32(i + 4, true), d = i + 8;
    if (art === 10 && d + 140 <= dv.byteLength) {
      let rx = dv.getFloat32(d, true), ry = dv.getFloat32(d + 16, true), rz = dv.getFloat32(d + 32, true);
      const l = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (l > 1e-9) { rx /= l; ry /= l; rz /= l; } else { rx = 1; ry = 0; rz = 0; }
      return { x: dv.getFloat32(d + 128, true), y: dv.getFloat32(d + 132, true), z: dv.getFloat32(d + 136, true), rx, ry, rz };
    }
    i = d + ((len + 3) & ~3);
  }
  return null;
}
