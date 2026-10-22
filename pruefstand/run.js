#!/usr/bin/env node
"use strict";
// Unabhängiger Prüfstand für pizza v3.1.
//   node pruefstand/run.js [A|B] [filter] [-v]
// Teil A: Black-Box-Konformitätstests gegen site/js/pizza.js (nur öffentliche API).
// Teil B: Interpreter-freie Prüfungen (Manifeste, Doku, SVGs, index.html, CDN).
// Quelle aller Erwartungen: SPEC.md, ARCHITEKTUR.md und die verbindlichen Klarstellungen – nicht der Interpreter.

const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");
const teilB = require("./teil-b");
const { BANNER } = require("./lib/helfer");

const INTERPRETER = process.env.PRUEFSTAND_INTERPRETER ? path.resolve(process.env.PRUEFSTAND_INTERPRETER) : path.join(teilB.ROOT, "site", "js", "pizza.js");
const STANDARD_LIMIT = 5_000_000; // SPEC §7.1 Standard; Endlosschleifen fängt zusätzlich das Worker-Timeout ab
const TIMEOUT_MS = 15000;

// ───────────────────────── Argumente ─────────────────────────
const argv = process.argv.slice(2);
const verbose = argv.includes("-v") || argv.includes("--verbose");
const pos = argv.filter((a) => !a.startsWith("-"));
let teil = "AB";
if (pos[0] && /^(A|B|AB)$/i.test(pos[0])) teil = pos.shift().toUpperCase();
const filter = pos.join(" ").toLowerCase();
const passt = (p, name) => !filter || (p + " " + name).toLowerCase().includes(filter);

const farbe = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (farbe ? `\x1b[${code}m${s}\x1b[0m` : s);
const grün = (s) => c(32, s), rot = (s) => c(31, s), gelb = (s) => c(33, s), grau = (s) => c(90, s), fett = (s) => c(1, s);

// ───────────────────────── Worker ─────────────────────────
class Ausführer {
  constructor() { this.w = null; this.id = 0; }
  start() {
    this.w = new Worker(path.join(__dirname, "lib", "arbeiter.js"), { workerData: { pfad: INTERPRETER } });
    this.w.unref();
  }
  run(code, optionen) {
    if (!this.w) this.start();
    const id = ++this.id;
    return new Promise((resolve) => {
      let fertig = false;
      const ende = (r) => { if (fertig) return; fertig = true; clearTimeout(t); this.w && this.w.off("message", onMsg); this.w && this.w.off("error", onErr); resolve(r); };
      const onMsg = (m) => { if (m.id === id) ende(m); };
      const onErr = (e) => { this.w = null; ende({ fehler: "Worker abgestürzt: " + e }); };
      const t = setTimeout(() => {
        const w = this.w; this.w = null;
        if (w) w.terminate();
        ende({ fehler: `Timeout nach ${TIMEOUT_MS} ms (JS-seitig hängend?)` });
      }, TIMEOUT_MS);
      this.w.on("message", onMsg);
      this.w.on("error", onErr);
      this.w.postMessage({ id, code, optionen });
    });
  }
  stop() { if (this.w) this.w.terminate(); this.w = null; }
}

// ───────────────────────── Bewertung ─────────────────────────
const norm = (s) => String(s).replace(/\r\n/g, "\n");
const j = (x) => JSON.stringify(x);

function erwartetText(res) {
  return res.ereignisse
    .filter((e) => e.typ === "ausgabe" || e.typ === "fehlerausgabe" || e.typ === "leeren" || e.typ === "panik")
    // SPEC §11.1 / ARCHITEKTUR §3: umbruch:false ohne Zeilenumbruch, leeren als Zeile «leeren», eingabe nie
    .map((e) => (e.typ === "leeren" ? "«leeren»\n" : norm(e.text) + (e.umbruch === false ? "" : "\n")))
    .join("");
}

// Theke (SPEC §16): ui-Nachrichten kanonisch (Schlüssel sortiert) vergleichen – Reihenfolge der Nachrichten zählt.
function kanon(x) {
  if (Array.isArray(x)) return "[" + x.map(kanon).join(",") + "]";
  if (x && typeof x === "object") return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + kanon(x[k])).join(",") + "}";
  return JSON.stringify(x);
}
function uiNachrichten(res) {
  return (res.ereignisse || []).filter((e) => e.typ === "ui").map((e) => e.nachricht);
}
// JSON-Lines (.ereignisse, .ui-erwartet): eine JSON-Zeile pro Eintrag, Leerzeilen ignoriert
function jsonZeilen(t) {
  return norm(t).split("\n").filter((z) => z.trim()).map((z) => JSON.parse(z));
}

// ARCHITEKTUR §3: .erwartet endet mit genau einem Zeilenumbruch → beidseitig höchstens EINEN entfernen (K-052),
// damit ein abschließendes Bote.sage(("")) prüfbar bleibt.
const ohneSchlussUmbruch = (s) => s.replace(/\n$/, "");
// ARCHITEKTUR §4: Doku-ausgabe-Blöcke dürfen den Panik-Banner weglassen (K-030) → Banner beidseitig entfernen.
const ohneBanner = (s) => s.split(BANNER + "\n").join("").split(BANNER).join("");

function bewerte(f, res) {
  const err = [];
  const ev = Array.isArray(res.ereignisse) ? res.ereignisse : [];
  if (!Array.isArray(res.ereignisse)) return ["Ergebnis ohne ereignisse-Array"];
  const ende = ev[ev.length - 1];
  if (!ende || ende.typ !== "ende") err.push("letztes Ereignis ist nicht 'ende'");
  else if (ende.exitCode !== res.exitCode) err.push(`ende.exitCode ${ende.exitCode} ≠ exitCode ${res.exitCode}`);
  if (ev.filter((e) => e.typ === "ende").length > 1) err.push("mehrere 'ende'-Ereignisse");

  const fehlerEv = ev.find((e) => e.typ === "fehler");
  if (f.exit !== null && f.exit !== undefined && res.exitCode !== f.exit) {
    err.push(`Exit-Code ${res.exitCode}, erwartet ${f.exit}` + (fehlerEv ? ` — ${fehlerEv.code}: ${fehlerEv.text}` : ""));
  }
  const aus = ev.filter((e) => e.typ === "ausgabe").map((e) => norm(e.text));
  if (f.out && j(aus) !== j(f.out)) err.push(`Ausgabe ${j(aus)}\n          erwartet ${j(f.out)}`);
  if (f.outEnthält) {
    let k = 0;
    for (const t of aus) if (t === f.outEnthält[k]) k++;
    if (k < f.outEnthält.length) err.push(`Ausgabe ${j(aus)} enthält nicht der Reihe nach ${j(f.outEnthält)}`);
  }
  if (f.fehlerOut) {
    const fa = ev.filter((e) => e.typ === "fehlerausgabe").map((e) => norm(e.text));
    if (j(fa) !== j(f.fehlerOut)) err.push(`fehlerausgabe ${j(fa)}, erwartet ${j(f.fehlerOut)}`);
  }
  if (f.fehler) {
    if (!fehlerEv) err.push("kein 'fehler'-Ereignis");
    else {
      const e = f.fehler;
      if (e.code !== undefined && fehlerEv.code !== e.code) err.push(`fehler.code ${j(fehlerEv.code)}, erwartet ${j(e.code)} (Text: ${fehlerEv.text})`);
      if (e.art !== undefined && fehlerEv.art !== e.art) err.push(`fehler.art ${j(fehlerEv.art)}, erwartet ${j(e.art)}`);
      if (e.text !== undefined && norm(fehlerEv.text) !== e.text) err.push(`fehler.text ${j(fehlerEv.text)}\n          erwartet ${j(e.text)}`);
      if (e.textEnthält !== undefined && !norm(fehlerEv.text || "").includes(e.textEnthält)) err.push(`fehler.text ${j(fehlerEv.text)} enthält nicht ${j(e.textEnthält)}`);
      if (e.zeile !== undefined && fehlerEv.zeile !== e.zeile) err.push(`fehler.zeile ${fehlerEv.zeile}, erwartet ${e.zeile}`);
    }
  }
  const warn = ev.filter((e) => e.typ === "warnung");
  for (const code of f.warn || []) if (!warn.some((w) => w.code === code)) err.push(`Warnung ${code} fehlt (Warnungen: ${j(warn.map((w) => w.code))})`);
  for (const [code, n] of Object.entries(f.warnAnzahl || {})) {
    const ist = warn.filter((w) => w.code === code).length;
    if (ist !== n) err.push(`Warnung ${code}: ${ist}×, erwartet ${n}×`);
  }
  for (const [code, teil] of Object.entries(f.warnText || {})) {
    const w = warn.find((x) => x.code === code);
    if (w && !norm(w.text || "").includes(teil)) err.push(`Warnung ${code}: Text ${j(w.text)} enthält nicht ${j(teil)}`);
  }
  for (const code of f.noWarn || []) if (warn.some((w) => w.code === code)) err.push(`unerwartete Warnung ${code}`);
  if (f.panik) {
    const p = ev.find((e) => e.typ === "panik");
    if (!p) err.push("kein 'panik'-Ereignis");
    else if (norm(p.text).replace(/\n+$/, "") !== BANNER) err.push(`Panik-Text weicht vom SPEC-Banner ab:\n${norm(p.text)}`);
  } else if (ev.some((e) => e.typ === "panik")) err.push("unerwartetes 'panik'-Ereignis");
  if (f.erwartetDatei !== undefined) {
    let ist = erwartetText(res);
    let soll = norm(f.erwartetDatei);
    if (f.bannerOptional) { ist = ohneBanner(ist); soll = ohneBanner(soll); }
    if (ohneSchlussUmbruch(ist) !== ohneSchlussUmbruch(soll)) err.push(`Ausgabe weicht von .erwartet ab:\n--- ist ---\n${ist}--- soll ---\n${soll}`);
  }
  if (f.ui !== undefined) {
    const ist = uiNachrichten(res);
    if (kanon(ist) !== kanon(f.ui)) err.push(`ui-Nachrichten weichen ab:\n--- ist ---\n${ist.map(kanon).join("\n")}\n--- soll ---\n${f.ui.map(kanon).join("\n")}`);
  }
  if (f.vorratEreignisse !== undefined) {
    const ist = (res.ereignisse || []).filter((e) => e.typ === "vorrat").map((e) => ({ name: e.name, schluessel: e.schluessel, wert: e.wert }));
    if (kanon(ist) !== kanon(f.vorratEreignisse)) err.push("vorrat-Ereignisse weichen ab:\n--- ist ---\n" + ist.map(kanon).join("\n") + "\n--- soll ---\n" + f.vorratEreignisse.map(kanon).join("\n"));
  }
  if (f.check) {
    let r;
    try { r = f.check(res); } catch (e) { r = "check() warf: " + e; }
    if (typeof r === "string") err.push(r);
    else if (Array.isArray(r)) err.push(...r);
  }
  return err;
}

// Küchenbrigade (SPEC §17.7, K-100): Die Anzahl der Köche ist eine Host-Einstellung und nie beobachtbar; ein `koeche`-Feld
// im `ende` ist Metadatum. Jeder Fall mit brigade läuft deshalb zusätzlich mit anderen Köche-/Chaos-Optionen und muss
// dieselbe Folge (ohne `koeche`), denselben Exit-Code und dieselben schritte/zeitMs liefern.
const BRIGADE = /\.\s*brigade\b/;
const KOECHE_VARIANTEN = [{ koeche: 4, kuechenChaos: 7 }, { koeche: 1, kuechenChaos: 0 }, { koeche: "auto" }];
const ohneKoeche = (ev) => (ev || []).map((e) => { if (!e || !("koeche" in e)) return e; const k = Object.assign({}, e); delete k.koeche; return k; });
async function koecheGegenprobe(aus, code, optionen, basis) {
  const err = [];
  const soll = j(ohneKoeche(basis.ereignisse));
  for (const v of KOECHE_VARIANTEN) {
    const o = Object.assign({}, optionen, v);
    const m = await aus.run(code, o);
    const was = "Köche-Variante " + j(v);
    if (m.fehler) { err.push(was + ": " + m.fehler); continue; }
    if (m.res.exitCode !== basis.exitCode) err.push(`${was}: Exit-Code ${m.res.exitCode} ≠ ${basis.exitCode}`);
    if (m.res.schritte !== basis.schritte || m.res.zeitMs !== basis.zeitMs) err.push(`${was}: schritte/zeitMs ${m.res.schritte}/${m.res.zeitMs} ≠ ${basis.schritte}/${basis.zeitMs}`);
    if (j(ohneKoeche(m.res.ereignisse)) !== soll) err.push(`${was}: andere Ereignisfolge (Köche/Planung beobachtbar)`);
  }
  return err;
}

// ───────────────────────── Teil A ─────────────────────────
function ladeFälle() {
  const dir = path.join(__dirname, "faelle");
  const fälle = [];
  for (const d of fs.readdirSync(dir).filter((x) => x.endsWith(".js")).sort()) {
    // *-offen.js: Fälle zu Klärungen, deren Umsetzung noch aussteht (KLAERUNGEN.md) – zählen nicht als Fehlschlag.
    const offen = /-offen\.js$/.test(d);
    for (const f of require(path.join(dir, d))) fälle.push(offen ? Object.assign({ offen: true }, f) : f);
  }
  return fälle;
}

function beispielFälle() {
  const p = "Beispiele (ARCHITEKTUR §3)";
  return teilB.ladeManifeste().beispiele.map((b) => {
    const f = {
      p, name: `${b.teil} ${b.id}`, code: fs.readFileSync(b.datei, "utf8"), exit: b.exitCode,
      erwartetDatei: fs.readFileSync(b.erwartet, "utf8"), panikErlaubt: true,
      eingabe: eingabeZeilen(b),
    };
    // THEKE.md §5 / SPEC §16: .ereignisse (JSON-Lines → uiEreignisse) und .ui-erwartet (JSON-Lines aller ui-Nachrichten)
    const ev = b.datei.replace(/\.pizza$/, ".ereignisse"), ue = b.datei.replace(/\.pizza$/, ".ui-erwartet");
    if (fs.existsSync(ev)) f.uiEreignisse = jsonZeilen(fs.readFileSync(ev, "utf8"));
    if (fs.existsSync(ue)) f.ui = jsonZeilen(fs.readFileSync(ue, "utf8"));
    return f;
  });
}

// SPEC §11.1 / ARCHITEKTUR §3: vorgegebene Eingabe aus dem Manifest-Feld "eingabe", sonst aus der gleichnamigen
// .eingabe-Datei neben der .pizza (Fallback, K-051). Eine Zeile pro Eingabe, letzter Zeilenumbruch zählt nicht.
function eingabeZeilen(b) {
  const datei = b.eingabe || b.datei.replace(/\.pizza$/, ".eingabe");
  if (!fs.existsSync(datei)) return undefined;
  return eingabeAusText(fs.readFileSync(datei, "utf8"));
}
function eingabeAusText(t) {
  const zeilen = norm(t).split("\n");
  if (zeilen.length && zeilen[zeilen.length - 1] === "") zeilen.pop();
  return zeilen;
}

function dokuFälle() {
  const p = "Doku-Code (ARCHITEKTUR §4)";
  const out = [];
  for (const d of teilB.ladeDoku()) {
    if (!d.abschnitte) continue;
    for (const a of d.abschnitte) {
      if (!a || !Array.isArray(a.inhalt)) continue;
      const besuche = (inhalt, pfad) => {
        inhalt.forEach((b, i) => {
          if (!b) return;
          if (b.art === "details" && Array.isArray(b.inhalt)) besuche(b.inhalt, `${pfad}${i}.`);
          if (b.art !== "code" || typeof b.code !== "string") return;
          if (b.sprache === "xml" || b.sprache === "shell") return;
          const name = `${d.datei}:${a.id} #${pfad}${i}`;
          if (b.ausfuehrbar === true) {
            const f = { p, name, code: b.code, exit: typeof b.exitCode === "number" ? b.exitCode : 0, panikErlaubt: true };
            // ARCHITEKTUR §4 / K-050: Codeblöcke dürfen vorgegebene Eingabe tragen (string[] oder Text mit Zeilen)
            if (Array.isArray(b.eingabe)) f.eingabe = b.eingabe.map(String);
            else if (typeof b.eingabe === "string") f.eingabe = eingabeAusText(b.eingabe);
            // SPEC §16.4 / K-074: Theke-Blöcke dürfen uiEreignisse (Ereignisobjekte) und uiErwartet (ui-Nachrichten) tragen
            if (Array.isArray(b.uiEreignisse)) f.uiEreignisse = b.uiEreignisse;
            if (Array.isArray(b.uiErwartet)) f.ui = b.uiErwartet;
            // SPEC §15.4 / K-077, K-080, K-087: feste Saat, Vorrat-Eingangszustand, feste Wanduhr für Doku-Blöcke
            if (typeof b.zufallsSaat === "number") f.zufallsSaat = b.zufallsSaat;
            if (b.vorrat && typeof b.vorrat === "object") f.vorrat = b.vorrat;
            if (Array.isArray(b.vorratErwartet)) f.vorratEreignisse = b.vorratErwartet;
            if (typeof b.echtzeit === "number") f.echtzeit = b.echtzeit;
            const next = inhalt[i + 1];
            // Doku-"ausgabe" darf den Panik-Banner weglassen (ARCHITEKTUR §4, K-030) → Banner beidseitig entfernt
            if (next && next.art === "ausgabe" && typeof next.text === "string") { f.erwartetDatei = next.text; f.bannerOptional = true; }
            out.push(f);
          } else if (b.ausfuehrbar === false) {
            out.push({ p, name: name + " (nur parsen)", parseOnly: b.code });
          }
        });
      };
      besuche(a.inhalt, "");
    }
  }
  return out;
}

async function teilA() {
  console.log(fett("\n══ Teil A – Konformitätstests (Black-Box gegen site/js/pizza.js) ══"));
  let lang = null;
  if (!fs.existsSync(INTERPRETER)) {
    console.log(gelb("übersprungen – Interpreter fehlt (site/js/pizza.js)"));
    return { übersprungen: true, ok: 0, fail: 0, gruppen: [] };
  }
  try {
    lang = require(INTERPRETER);
  } catch (e) {
    console.log(gelb("übersprungen – Interpreter fehlt/lädt nicht: " + (e && e.message)));
    return { übersprungen: true, ok: 0, fail: 0, gruppen: [] };
  }
  if (!lang || typeof lang.run !== "function" || typeof lang.parse !== "function") {
    console.log(gelb("übersprungen – Interpreter fehlt (keine run/parse-Funktion exportiert)"));
    return { übersprungen: true, ok: 0, fail: 0, gruppen: [] };
  }

  const alle = [...ladeFälle(), ...beispielFälle(), ...dokuFälle()].filter((f) => passt(f.p, f.name));
  const gruppen = new Map();
  for (const f of alle) {
    if (!gruppen.has(f.p)) gruppen.set(f.p, []);
    gruppen.get(f.p).push(f);
  }
  const aus = new Ausführer();
  let ok = 0, fail = 0, offenOk = 0, offenRot = 0;
  const statistik = [];
  for (const [p, fälle] of gruppen) {
    let gOk = 0;
    const istOffen = fälle.every((f) => f.offen);
    const meldungen = [];
    for (const f of fälle) {
      let err;
      if (f.api) {
        try { const r = f.api(lang); err = r === undefined ? [] : [].concat(r); } catch (e) { err = ["API-Prüfung warf: " + e]; }
      } else if (f.parseOnly !== undefined) {
        try {
          const r = lang.parse(f.parseOnly);
          err = r && r.ok ? [] : ["parse-Fehler: " + j(r && r.fehler)];
        } catch (e) { err = ["parse warf: " + e]; }
      } else {
        const optionen = { schrittLimit: f.schrittLimit || STANDARD_LIMIT };
        if (f.args) optionen.args = f.args;
        if (f.eingabe) optionen.eingabe = f.eingabe;
        if (f.uiEreignisse) optionen.uiEreignisse = f.uiEreignisse;
        if (f.zufallsSaat !== undefined) optionen.zufallsSaat = f.zufallsSaat;   // K-077
        if (f.vorrat !== undefined) optionen.vorrat = f.vorrat;                 // K-080
        if (f.echtzeit !== undefined) optionen.echtzeit = f.echtzeit;           // K-087
        if (f.koeche !== undefined) optionen.koeche = f.koeche;                 // K-100: Host-Einstellung, nie beobachtbar
        if (f.kuechenChaos !== undefined) optionen.kuechenChaos = f.kuechenChaos;
        const m = await aus.run(f.code, optionen);
        if (m.fehler) err = [m.fehler];
        else {
          if (f.panikErlaubt && m.res.exitCode === 39) f.panik = true;
          err = bewerte(f, m.res);
          if (f.zweimal && !err.length) {
            const m2 = await aus.run(f.code, optionen);
            if (m2.fehler) err.push(m2.fehler);
            else if (j(m2.res.ereignisse) !== j(m.res.ereignisse)) err.push("zweiter Lauf liefert andere Ereignisse (nicht deterministisch)");
          }
          // Köche-Gegenprobe (SPEC §17.7, K-100, THREADS §5 Punkt 3/4): koeche/kuechenChaos dürfen nichts ändern
          if (BRIGADE.test(f.code) && !err.length) err.push(...await koecheGegenprobe(aus, f.code, optionen, m.res));
        }
      }
      if (f.offen) {
        // offene Klärung: rot ist der erwartete Zustand; grün heißt „Umsetzung erledigt → nach a10 verschieben“
        if (err.length) { offenRot++; if (verbose) meldungen.push({ f, err }); }
        else { offenOk++; gOk++; meldungen.push({ f, err: [], hinweis: "jetzt grün – Fall in eine nicht-offene Datei verschieben (z. B. a10-klaerungen.js)" }); }
        continue;
      }
      if (err.length) { fail++; meldungen.push({ f, err }); }
      else { ok++; gOk++; if (verbose) meldungen.push({ f, err: [] }); }
    }
    const kopf = `${p}`.padEnd(34) + ` ${gOk}/${fälle.length}`;
    if (istOffen) console.log(gelb("○ ") + kopf + grau("  (offen – Umsetzung ausstehend, zählt nicht als Fehlschlag)"));
    else console.log(gOk === fälle.length ? grün("✓ ") + kopf : rot("✗ ") + kopf);
    for (const { f, err, hinweis } of meldungen) {
      if (hinweis) { console.log(gelb("    ! " + f.name) + grau(" – " + hinweis)); continue; }
      if (!err.length) { console.log(grau("    ✓ " + f.name)); continue; }
      console.log((f.offen ? gelb("    ○ ") : rot("    ✗ ")) + f.name);
      for (const e of err) console.log("        " + e.split("\n").join("\n        "));
    }
    statistik.push({ p, ok: gOk, n: fälle.length, offen: istOffen });
  }
  aus.stop();
  return { übersprungen: false, ok, fail, offenOk, offenRot, gruppen: statistik };
}

// ───────────────────────── Teil B ─────────────────────────
function teilBausführen() {
  console.log(fett("\n══ Teil B – Interpreter-freie Prüfungen ══"));
  let ok = 0, fail = 0;
  const statistik = [];
  for (const pr of teilB.pruefungen().filter((x) => passt(x.p, x.name))) {
    let r;
    try { r = pr.fn(); } catch (e) { r = { fehler: ["Prüfung warf: " + (e && e.stack || e)] }; }
    const fehler = r.fehler || [];
    const hinweise = r.hinweise || [];
    if (fehler.length) fail++; else ok++;
    console.log((fehler.length ? rot("✗ ") : grün("✓ ")) + pr.p.padEnd(40) + " " + pr.name);
    for (const f of fehler) console.log(rot("    ✗ ") + f);
    const zeige = verbose ? hinweise : hinweise.slice(0, 3);
    for (const h of zeige) console.log(grau("    · " + h));
    if (!verbose && hinweise.length > 3) console.log(grau(`    · … ${hinweise.length - 3} weitere Hinweise (-v)`));
    statistik.push({ p: pr.p, ok: fehler.length ? 0 : 1, n: 1, fehler: fehler.length });
  }
  return { ok, fail, gruppen: statistik };
}

// ───────────────────────── main ─────────────────────────
(async () => {
  let fehlgeschlagen = false;
  const zus = [];
  if (teil.includes("A")) {
    const a = await teilA();
    if (a.übersprungen) zus.push("Teil A: übersprungen – Interpreter fehlt");
    else {
      zus.push(`Teil A: ${a.ok}/${a.ok + a.fail} Fälle bestanden` + (a.fail ? rot(` (${a.fail} Abweichungen)`) : ""));
      if (a.offenOk + a.offenRot) {
        zus.push(`Teil A offen: ${a.offenOk}/${a.offenOk + a.offenRot} Klärungsfälle mit ausstehender Umsetzung bereits grün` +
          (a.offenOk ? gelb(" – grüne Fälle in eine nicht-offene Datei verschieben") : ""));
      }
      if (a.fail) fehlgeschlagen = true;
    }
  }
  if (teil.includes("B")) {
    const b = teilBausführen();
    zus.push(`Teil B: ${b.ok}/${b.ok + b.fail} Prüfungen bestanden` + (b.fail ? rot(` (${b.fail} mit Fehlern)`) : ""));
    if (b.fail) fehlgeschlagen = true;
  }
  console.log(fett("\n══ Zusammenfassung ══"));
  for (const z of zus) console.log("  " + z);
  process.exitCode = fehlgeschlagen ? 1 : 0;
})().catch((e) => {
  console.error("Prüfstand-Fehler:", e);
  process.exitCode = 2;
});
