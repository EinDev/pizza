// Herd im Browser (Paket H6, HERD.md §7.2): Kern laden, Lauf vorbereiten, Vorschaufenster mit Canvas, Render-Worker.
//
// Threads: Programm-Worker (js/worker.js: Interpreter oder Wasm-Programm + kern.wasm) ──Bildpakete (MessagePort,
// übertragene ArrayBuffer)──▶ Render-Worker (js/herd/render-worker.js: Glut-Wasm, OffscreenCanvas, requestAnimationFrame)
// ──nächster Takt samt Eingabe (Herd-Puffer, SAB/Atomics)──▶ Programm-Worker. Die Seite vermittelt nur beim Aufbau: Sie
// kompiliert kern.wasm einmal (WebAssembly.Module für jeden Lauf), legt Port und Puffer an, öffnet das Fenster bei
// herd/fenster, überträgt das Canvas und reicht Eingaben weiter. Rückfall ohne OffscreenCanvas/rAF im Worker: dieselbe Glut
// (js/herd/zeichner.js) im Hauptthread. Kein WebGPU und kein WebGL2 → Meldung, das Programm bekommt „geschlossen“.

const KEIN_KONTEXT = "Dieser Browser kann weder WebGPU noch WebGL2 – der Herd braucht eines davon.";
const PUFFER_BYTES = 16 + 8192;
const HERD_KLASSEN = ["Herd", "Teil", "Form", "Bildchen"];
const V1_KOMPONENTEN = ["Rechteck", "Kreis", "Text", "Bild", "Koerper", "Licht", "Kamera", "Bewegung", "Animation", "Partikel"];

let kernVersprechen = null, schemaVersprechen = null, skriptVersprechen = null, schemaGeladen = null;

/** site/js/herd/schema.json (einmal; null, wenn nicht ladbar). Quelle für Editor und Herd-Erkennung (HERD.md §3.3). */
export function ladeHerdSchema() {
  if (!schemaVersprechen) {
    schemaVersprechen = fetch("js/herd/schema.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((s) => { if (!s) schemaVersprechen = null; else schemaGeladen = s; return s; });
  }
  return schemaVersprechen;
}

/** Nutzt das Programm den Herd? Wie der Interpreter (pruefeHerd): `neu Herd/Form/Bildchen/<Komponente>(…)` oder ein statischer
 *  Zugriff `Form.…`/`Herd.…` – per AST, damit Wörter in Texten/Kommentaren (z. B. „Text“) nicht zählen. Ohne Interpreter:
 *  ein strenger regulärer Ausdruck. Ein Fehlalarm kostet nur das Laden von kern.wasm (und einen asynchronen Start). */
export function nutztHerd(code, schema = schemaGeladen) {
  const src = String(code || "");
  const namen = new Set(HERD_KLASSEN.concat(schema && Array.isArray(schema.komponenten) ? schema.komponenten.map((k) => k.name) : V1_KOMPONENTEN));
  if (!/\b(?:Herd|Form|Bildchen)\s*\.|\bneu\s+[A-ZÄÖÜ]/.test(src)) return false;
  const PL = typeof window !== "undefined" ? window.PizzaLang : null;
  if (PL && typeof PL.parse === "function") {
    let p = null;
    try { p = PL.parse(src); } catch (e) { p = null; }
    if (p && !p.ok) return false;                    // Syntaxfehler: der Lauf endet vor dem ersten Herd-Aufruf
    if (p && p.ast) {
      const stapel = [p.ast];
      let n = 0;
      while (stapel.length) {
        const x = stapel.pop();
        if (!x || typeof x !== "object") continue;
        if (++n > 2000000) return true;
        if (Array.isArray(x)) { for (const y of x) if (y && typeof y === "object") stapel.push(y); continue; }
        if (x.k === "Neu" && x.typ && namen.has(x.typ.name)) return true;
        if ((x.k === "MCall" || x.k === "Mem") && x.obj && x.obj.k === "Name" && (x.obj.n === "Form" || x.obj.n === "Herd" || x.obj.n === "Bildchen")) return true;
        for (const k in x) { const v = x[k]; if (v && typeof v === "object") stapel.push(v); }
      }
      return false;
    }
  }
  return new RegExp("\\bneu\\s+(?:" + [...namen].join("|") + ")\\s*\\(|\\b(?:Form|Herd|Bildchen)\\s*\\.").test(src);
}

/** kern.wasm einmal je Seite kompilieren (WebAssembly.Module geht an jeden Lauf-Worker). */
export function ladeHerdKern() {
  if (!kernVersprechen) {
    kernVersprechen = (async () => {
      const r = await fetch("js/herd/kern.wasm");
      if (!r.ok) throw new Error("kern.wasm: HTTP " + r.status);
      if (typeof WebAssembly.compileStreaming === "function" && /application\/wasm/.test(r.headers.get("content-type") || "")) {
        return WebAssembly.compileStreaming(r);
      }
      return WebAssembly.compile(await r.arrayBuffer());
    })().catch((e) => { kernVersprechen = null; throw e; });
  }
  return kernVersprechen;
}

/** Bereitet einen Herd-Lauf vor: { extra: {herdKern, herdPort, herdPuffer} (für ausfuehrung.starte), kontext } oder null. */
export async function herdLaufVorbereiten(code) {
  const schema = await ladeHerdSchema();
  if (!nutztHerd(code, schema)) return null;
  let kern = null;
  try { kern = await ladeHerdKern(); } catch (e) { kern = null; }   // fehlt er, meldet der Lauf HOST (wie nativ)
  if (!kern) return { extra: {}, kontext: null };
  const kanal = new MessageChannel();
  const puffer = new SharedArrayBuffer(PUFFER_BYTES);
  // E2E (window.__herdManuell): Takte kommen aus .ereignisse statt vom Zeichner, herd/bild-Ereignisse gehen an die Seite (Hashes)
  const manuell = typeof window !== "undefined" && window.__herdManuell === true;
  const extra = { herdKern: kern, herdPort: kanal.port1, herdPuffer: puffer };
  if (manuell) extra.herdBilderMelden = true;
  return { extra, kontext: { port: kanal.port2, puffer, manuell } };
}

/** Schreibt einen Takt in den Herd-Puffer (nur E2E im Modus __herdManuell; sonst ist der Zeichner der einzige Schreiber). */
function schreibeTakt(puffer, ereignis) {
  const c = new Int32Array(puffer, 0, 4);
  const bytes = new TextEncoder().encode(JSON.stringify(ereignis));
  new Uint8Array(puffer, 16).set(bytes);
  Atomics.store(c, 2, bytes.length);
  Atomics.add(c, 0, 1);
  Atomics.notify(c, 0);
}

function setzeGeschlossen(puffer) {
  if (!puffer) return;
  const c = new Int32Array(puffer, 0, 4);
  Atomics.store(c, 1, 1);
  Atomics.notify(c, 0);
}

function ladeSkript(src) {
  return new Promise((ok, fehler) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => ok();
    s.onerror = () => fehler(new Error(src + " lädt nicht"));
    document.head.appendChild(s);
  });
}
function ladeZeichnerSkripte() {
  if (!skriptVersprechen) {
    skriptVersprechen = ladeSkript("js/herd/glut.js").then(() => ladeSkript("js/herd/zeichner.js")).catch((e) => { skriptVersprechen = null; throw e; });
  }
  return skriptVersprechen;
}

/** Kann der Browser überhaupt WebGPU oder WebGL2? (nur für die Meldung nach einem Fehlschlag) */
async function grafikDa() {
  try { if (navigator.gpu && (await navigator.gpu.requestAdapter())) return true; } catch (e) { /* weiter */ }
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch (e) { return false; }
}

/** Tastenname nach K-110 (wie js/theke/theke.js tastenName); null = nicht senden. */
const TASTEN_DEUTSCH = { " ": "Leertaste", Spacebar: "Leertaste", ArrowLeft: "Links", ArrowRight: "Rechts", ArrowUp: "Hoch",
  ArrowDown: "Runter", Backspace: "Rücktaste", Delete: "Entfernen", Home: "Pos1", End: "Ende", PageUp: "BildHoch", PageDown: "BildRunter" };
const MODIFIKATOREN = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "NumLock", "ScrollLock", "Fn", "FnLock",
  "Hyper", "Super", "Symbol", "SymbolLock", "OS", "Dead", "Unidentified"]);
export function herdTastenName(e) {
  if (!e || typeof e.key !== "string" || e.key === "" || e.isComposing || e.keyCode === 229 || MODIFIKATOREN.has(e.key)) return null;
  return Object.prototype.hasOwnProperty.call(TASTEN_DEUTSCH, e.key) ? TASTEN_DEUTSCH[e.key] : e.key;
}

/**
 * Herd-Anzeige im Vorschaufenster.
 * @param {{ vorschau, vollbild?: boolean, beiMeldung?: (text: string) => void, status?: boolean }} o
 */
export function erstelleHerdAnzeige({ vorschau, vollbild = false, beiMeldung = null, status = true }) {
  let kontext = null;          // { port, puffer } des laufenden Laufs
  let r = null;                // aktueller Renderer
  let portDa = null;           // Promise<MessagePort>: Port ist (wieder) bei der Seite
  let feld = { breite: 640, hoehe: 360 };
  let nr = 0;

  function holePort(port) { portDa = Promise.resolve(port); }

  function stoppeRenderer() {
    const alt = r;
    r = null;
    if (!alt) return;
    alt.aus = true;
    if (alt.beobachter) alt.beobachter.disconnect();
    for (const [el, typ, fn] of alt.hoerer) el.removeEventListener(typ, fn);
    if (alt.worker) {
      // Port kommt mit „gestoppt“ zurück; bis dahin wartet ein neues Fenster
      let fertig;
      portDa = new Promise((ok) => { fertig = ok; });
      const w = alt.worker;
      const t = setTimeout(() => { w.terminate(); fertig(null); }, 2000);
      w.onmessage = (m) => {
        if (m.data && (m.data.typ === "gestoppt" || m.data.port)) { clearTimeout(t); w.terminate(); fertig(m.data.port || null); }
      };
      w.postMessage({ typ: "stopp" });
    } else if (alt.zeichner) {
      alt.zeichner.stopp();
    }
  }

  function zeigeHinweis(inhalt, text) {
    inhalt.textContent = "";
    const p = document.createElement("p");
    p.className = "vorschau-hinweis";
    p.dataset.testid = "herd-hinweis";
    p.textContent = text;
    inhalt.appendChild(p);
  }

  function melde(rr, n) {
    if (!n || rr.aus) return;
    if (n.typ === "bereit") {
      rr.schnittstelle = n.schnittstelle;
      if (rr.statusEl) { rr.statusEl.dataset.schnittstelle = n.schnittstelle; rr.statusEl.textContent = n.schnittstelle; }
      rr.canvas.dataset.bereit = "1";
      rr.canvas.dataset.schnittstelle = n.schnittstelle;
    } else if (n.typ === "statistik") {
      if (rr.statusEl) {
        rr.statusEl.textContent = n.schnittstelle + " · " + n.fps + " fps · " + n.drawCalls + " Draw-Call" + (n.drawCalls === 1 ? "" : "s") + " · " +
          n.instanzen.toLocaleString("de-DE") + " Instanzen";
      }
      rr.canvas.dataset.bild = String(n.bild);
    } else if (n.typ === "fehler") {
      fehlschlag(rr, n);
    }
  }

  async function fehlschlag(rr, n) {
    if (rr.aus) return;
    // Anlegen im Worker gescheitert → derselbe Lauf im Hauptthread (frisches Canvas: das alte gehört dem Worker)
    if (rr.worker && (n.art === "kein-raf" || n.art === "kein-kontext") && n.port) {
      rr.worker.terminate();
      rr.worker = null;
      holePort(n.port);
      const inhalt = rr.inhalt;
      r = null;
      rr.aus = true;
      for (const [el, typ, fn] of rr.hoerer) el.removeEventListener(typ, fn);
      if (rr.beobachter) rr.beobachter.disconnect();
      starteRenderer(inhalt, { hauptthread: true });
      return;
    }
    const text = n.art === "kein-kontext" && !(await grafikDa()) ? KEIN_KONTEXT : (n.art === "kein-kontext" ? "Der Herd konnte nicht starten: " + n.text : n.text);
    stoppeRenderer();
    if (kontext) setzeGeschlossen(kontext.puffer);
    zeigeHinweis(rr.inhalt, text);
    if (beiMeldung) beiMeldung(text);
  }

  /** Gerätepixel des Canvas (HiDPI scharf). */
  function geraetePixel(canvas, eintrag) {
    if (eintrag && eintrag.devicePixelContentBoxSize && eintrag.devicePixelContentBoxSize[0]) {
      const s = eintrag.devicePixelContentBoxSize[0];
      return [s.inlineSize, s.blockSize];
    }
    const d = window.devicePixelRatio || 1;
    return [Math.round(canvas.clientWidth * d), Math.round(canvas.clientHeight * d)];
  }

  /** Spielfeld-Koordinaten (seitentreu eingepasst wie die Glut). */
  function spielfeld(canvas, e) {
    const b = canvas.getBoundingClientRect();
    const s = Math.min(b.width / feld.breite, b.height / feld.hoehe) || 1;
    const ox = (b.width - feld.breite * s) / 2, oy = (b.height - feld.hoehe * s) / 2;
    return [(e.clientX - b.left - ox) / s, (e.clientY - b.top - oy) / s];
  }

  async function starteRenderer(inhalt, { hauptthread = false } = {}) {
    const meinNr = nr;
    const port = await portDa;
    if (meinNr !== nr || !kontext) return;
    if (!port) { zeigeHinweis(inhalt, "Der Herd ist ausgefallen (Bildkanal verloren)."); setzeGeschlossen(kontext.puffer); return; }
    inhalt.textContent = "";
    const canvas = document.createElement("canvas");
    canvas.className = "herd-canvas";
    canvas.dataset.testid = "herd-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Herd-Spielfeld");
    inhalt.appendChild(canvas);
    let statusEl = null;
    if (status && !vollbild) {
      statusEl = document.createElement("div");
      statusEl.className = "herd-status";
      statusEl.dataset.testid = "herd-status";
      inhalt.appendChild(statusEl);
    }
    const rr = { canvas, inhalt, statusEl, hoerer: [], aus: false, worker: null, zeichner: null, beobachter: null, schnittstelle: null };
    r = rr;
    const [b, h] = geraetePixel(canvas);
    const sende = (ereignis) => {
      if (rr.aus) return;
      if (rr.worker) rr.worker.postMessage({ typ: "eingabe", ereignis });
      else if (rr.zeichner) rr.zeichner.eingabe(ereignis);
    };
    const hoere = (el, typ, fn, opt) => { el.addEventListener(typ, fn, opt); rr.hoerer.push([el, typ, fn]); };

    // Eingabe nur bei Fokus (Canvas fokussierbar); ohne Wiederholungen; Fokusverlust = alles losgelassen
    hoere(canvas, "keydown", (e) => {
      const n = herdTastenName(e);
      if (n === null) return;
      if (n !== "Tab" && n !== "Escape") e.preventDefault();   // Seite nicht scrollen; Tab/Esc bleiben für die Bedienung
      if (!e.repeat) sende({ typ: "taste", name: n, unten: true });
    });
    hoere(canvas, "keyup", (e) => { const n = herdTastenName(e); if (n !== null) sende({ typ: "taste", name: n, unten: false }); });
    hoere(canvas, "blur", () => sende({ typ: "loslassen" }));
    const BIT = [1, 4, 2];   // PointerEvent.button 0 links, 1 Mitte, 2 rechts → 1, 4, 2 (SPEC §18.3)
    hoere(canvas, "pointerdown", (e) => {
      canvas.focus({ preventScroll: true });
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* egal */ }
      const [x, y] = spielfeld(canvas, e);
      sende({ typ: "knopf", bit: e.pointerType === "touch" ? 1 : BIT[e.button] || 0, unten: true, x, y });
      e.preventDefault();
    });
    hoere(canvas, "pointerup", (e) => { const [x, y] = spielfeld(canvas, e); sende({ typ: "knopf", bit: e.pointerType === "touch" ? 1 : BIT[e.button] || 0, unten: false, x, y }); });
    hoere(canvas, "pointercancel", () => sende({ typ: "loslassen" }));
    hoere(canvas, "pointermove", (e) => { const [x, y] = spielfeld(canvas, e); sende({ typ: "maus", x, y }); });
    hoere(canvas, "contextmenu", (e) => e.preventDefault());

    if (typeof ResizeObserver === "function") {
      rr.beobachter = new ResizeObserver((eintraege) => {
        if (rr.aus) return;
        const [nb, nh] = geraetePixel(canvas, eintraege[0]);
        if (rr.worker) rr.worker.postMessage({ typ: "groesse", breite: nb, hoehe: nh });
        else if (rr.zeichner) rr.zeichner.groesse(nb, nh);
      });
      try { rr.beobachter.observe(canvas, { box: "device-pixel-content-box" }); } catch (e) { rr.beobachter.observe(canvas); }
    }

    const offscreen = !hauptthread && typeof canvas.transferControlToOffscreen === "function" && typeof Worker === "function";
    if (offscreen) {
      let w;
      try { w = new Worker("js/herd/render-worker.js"); } catch (e) { w = null; }
      if (w) {
        rr.worker = w;
        w.onmessage = (m) => melde(rr, m.data);
        w.onerror = (e) => { e.preventDefault && e.preventDefault(); melde(rr, { typ: "fehler", art: "zeichnen", text: "Der Herd ist ausgefallen: " + (e.message || "Fehler im Render-Worker") }); };
        const off = canvas.transferControlToOffscreen();
        portDa = null;
        w.postMessage({ typ: "start", canvas: off, puffer: kontext.puffer, port, breite: Math.max(1, b), hoehe: Math.max(1, h), manuell: !!kontext.manuell }, [off, port]);
        return;
      }
    }
    try { await ladeZeichnerSkripte(); } catch (e) { melde(rr, { typ: "fehler", art: "kein-kontext", text: e.message }); return; }
    if (rr.aus) return;
    rr.zeichner = await window.HerdZeichner.starte({
      canvas, puffer: kontext.puffer, port, breite: Math.max(1, b), hoehe: Math.max(1, h), wasmUrl: "js/herd/glut_bg.wasm", manuell: !!kontext.manuell,
      melde: (n) => melde(rr, n),
    });
    if (rr.aus) rr.zeichner.stopp();
  }

  function oeffne(info) {
    const titel = info.titel ? String(info.titel) : "Herd";
    feld = { breite: Number(info.breite) || 640, hoehe: Number(info.hoehe) || 360 };
    const warOffen = vorschau.offen && r;
    const inhalt = vorschau.herd({ titel, breite: feld.breite, hoehe: feld.hoehe });
    if (warOffen) return;
    nr++;
    starteRenderer(inhalt).then(() => {
      if (r && r.canvas && !vollbild) r.canvas.focus({ preventScroll: true });
      else if (r && r.canvas && vollbild) r.canvas.focus({ preventScroll: true });
    });
  }

  return {
    /** Neuer Lauf (oder null: kein Herd). Räumt einen alten Lauf auf. */
    lauf(k) {
      this.beenden();
      kontext = k;
      if (k) holePort(k.port);
      if (k && k.manuell) window.__herdTakt = (ev) => { if (kontext === k) schreibeTakt(k.puffer, ev); };
    },
    /** Ereignis typ "herd" vom Programm-Worker (fenster | schliesse). */
    ereignis(ev) {
      if (!ev || !kontext) return;
      if (ev.art === "fenster") oeffne(ev);
      else if (ev.art === "schliesse") { nr++; stoppeRenderer(); vorschau.beenden(); }
    },
    /** Nutzer schließt das Fenster (X): Programm bekommt „geschlossen“. */
    nutzerSchliesst() {
      if (!kontext) return;
      setzeGeschlossen(kontext.puffer);
      nr++;
      stoppeRenderer();
    },
    /** Lauf vorbei/abgebrochen. */
    beenden() {
      nr++;
      stoppeRenderer();
      if (kontext) { try { kontext.port.close(); } catch (e) { /* egal */ } }
      kontext = null;
      portDa = null;
    },
    get aktiv() { return !!kontext; },
    get renderer() { return r; },
  };
}
