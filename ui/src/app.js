// App-Link (#app=<key>): startet ein geteiltes Programm direkt im Vollbild – ohne Editor, Panels oder Code.
// Bis zum Start ist nur ein Ladebalken zu sehen (js/thema.js setzt data-app vor dem ersten Zeichnen, CSS blendet alles
// andere aus). Ablauf: Code laden (api/teilen/<key>) → Motor prüfen (+ Theke-Renderer vorladen) → im Worker
// kompilieren (Motor „Auto“: Wasm, sonst Interpreter) → starten. Danach füllt die Theke bzw. die Konsole das Fenster –
// gleiche Konsole, gleicher Renderer wie im Playground (Browser = nativ). Am Ende: Ausgabe + „Nochmal“ / „Code ansehen“.
// Vorrat: dieselben Kammern wie geteilte Tabs im Playground (localStorage „pizza.vorrat.<name>“, siehe vorrat.js).
import { erstelleKonsole } from "./konsole.js";
import { erstelleAusfuehrung, workerAuftrag, interaktivMoeglich, ladeMotoren } from "./ausfuehrung.js";
import { erstelleVorschau, ladeRenderer } from "./vorschau.js";
import { VORRAT, vorratVerfuegbar, vorratLaden, vorratSpeichern } from "./vorrat.js";

const TITEL = "pizza-App";
const AUSGABE_TYPEN = new Set(["ausgabe", "fehlerausgabe", "warnung", "fehler", "panik", "eingabe", "leeren", "system"]);

export function startApp(key) {
  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;
  const lade = $("app-lade"), fuellung = $("app-lade-fuellung");
  const ende = $("app-ende"), endeText = $("app-ende-text"), knopfNochmal = $("app-nochmal"), linkCode = $("app-code");
  const konsoleEl = $("konsole");

  // Konsole aus der (ausgeblendeten) Werkbank direkt ins Fenster holen; sichtbar erst, wenn es etwas zu zeigen gibt
  document.body.insertBefore(konsoleEl, ende);
  konsoleEl.classList.remove("zu");
  konsoleEl.hidden = true;
  document.title = TITEL;

  let code = null, istTheke = false, faehigkeiten = null, hatAusgabe = false;

  function fortschritt(anteil) {
    fuellung.style.setProperty("--anteil", String(anteil));
    lade.setAttribute("aria-valuenow", String(Math.round(anteil * 100)));
  }
  function zeige() {
    if (html.classList.contains("app-gestartet")) return;
    fortschritt(1);
    html.classList.add("app-gestartet");
  }
  function zeigeKonsole() { zeige(); konsoleEl.hidden = false; }
  function zeigeEnde(text, { fehler = false, nochmal = true, codeLink = true } = {}) {
    zeige();
    endeText.textContent = text;
    endeText.classList.toggle("fehler", fehler);
    knopfNochmal.hidden = !nochmal;
    linkCode.hidden = !codeLink;
    ende.classList.toggle("allein", konsoleEl.hidden);
    ende.hidden = false;
    (nochmal ? knopfNochmal : codeLink ? linkCode : endeText).focus({ preventScroll: true });
  }

  // „Code ansehen“: derselbe Schlüssel als Code-Link (#h=…) – neu laden, damit der Playground startet
  const codeUrl = location.href.split("#")[0] + "#h=" + key;
  linkCode.href = codeUrl;
  function codeAnsehen() { location.assign(codeUrl); location.reload(); }
  linkCode.addEventListener("click", (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // neuer Tab o. Ä.: Browser machen lassen
    e.preventDefault();
    codeAnsehen();
  });
  // Hash ändert sich (z. B. Zurück-Taste) → neu laden, Modus entscheidet thema.js
  window.addEventListener("hashchange", () => location.reload());

  // Thema: wie im Playground (gemerkte Wahl, sonst OS – auch live)
  const vorschau = erstelleVorschau({ beiEreignis: (ev) => ausfuehrung.uiEreignis(ev), beiZu: null });
  function setzeMeta() {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", html.dataset.theme === "dark" ? "#16171a" : "#fbf7f0"));
  }
  setzeMeta();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    let gemerkt = null;
    try { gemerkt = localStorage.getItem("pizza.thema"); } catch (err) { /* egal */ }
    if (gemerkt === "light" || gemerkt === "dark") return;
    html.dataset.theme = e.matches ? "dark" : "light";
    setzeMeta();
    vorschau.setzeThema();
  });

  const konsole = erstelleKonsole({ springe: () => codeAnsehen() });

  const ausfuehrung = erstelleAusfuehrung({
    beiStart() {
      vorschau.beenden();
      konsole.leeren(false);
      hatAusgabe = false;
      ende.hidden = true;
    },
    beiMotor() {
      fortschritt(0.9);
      // Konsolenprogramm: ab jetzt läuft es – Konsole zeigen. Theke: warten, bis das Fenster kommt.
      if (!istTheke) zeigeKonsole();
    },
    beiUi(n) {
      if (n && n.op === "fenster" && n.titel != null) document.title = String(n.titel) || "Theke";
      vorschau.nachricht(n);
      if (n && n.op === "schliesse") zeigeKonsole();
      else requestAnimationFrame(zeige);
    },
    beiEreignis(ev) {
      konsole.ereignis(ev);
      if (ev && AUSGABE_TYPEN.has(ev.typ)) {
        hatAusgabe = true;
        if (!vorschau.offen) zeigeKonsole();
      }
    },
    beiVorrat(name, eintraege) {
      if (!vorratSpeichern(VORRAT, name, eintraege)) {
        konsole.system("Der Vorrat „" + name + "“ konnte im Browser nicht gespeichert werden (Speicher voll?).", "fehler");
      }
    },
    beiEingabeAnfrage(ev) {
      zeigeKonsole();
      konsole.frageEingabe(ev, (text) => ausfuehrung.antworte(text));
    },
    beiEingabeEnde() { konsole.versteckeEingabe(); },
    beiPanik() { /* Hawaii erscheint wie im Playground als Fehlerausgabe */ },
    beiEnde(info) {
      konsole.sofortZeichnen();
      konsole.versteckeEingabe();
      vorschau.beenden();
      if (hatAusgabe || !istTheke) konsoleEl.hidden = false;
      const c = info.exitCode;
      zeigeEnde(c === 0 ? "Programm beendet." : "Programm beendet (Exit-Code " + c + ").", { fehler: c !== 0 });
    },
  });

  function neueSaat() {
    let fest = false;
    try { fest = localStorage.getItem("pizza.festeSaat") === "1"; } catch (e) { /* egal */ }
    if (fest) return 42;
    try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; }
    catch (e) { return Math.floor(Math.random() * 4294967296); }
  }

  function starten() {
    html.classList.remove("app-gestartet");
    fortschritt(0.7);
    konsoleEl.hidden = true;
    ende.hidden = true;
    const saat = neueSaat();
    const vorratAktiv = vorratVerfuegbar();
    ausfuehrung.starte(code, [], "auto", {
      pizzaiolo: !!(faehigkeiten && faehigkeiten.wasm),
      pizzaioloGrund: faehigkeiten && faehigkeiten.grund,
      zufallsSaat: saat,
      vorrat: vorratAktiv ? vorratLaden(VORRAT) : undefined,
      vorratAktiv,
    });
    // „Saat: N“ wie die EXE im Terminal (stderr); ein Theke-Fenster hat kein Terminal
    if (!istTheke) konsole.saat(saat);
  }
  knopfNochmal.addEventListener("click", () => {
    if (code == null) { location.reload(); return; }
    starten();
  });

  async function pruefeMotor() {
    const mo = await ladeMotoren();
    if (!mo.wasm) return { wasm: false, grund: "Wasm-Compiler wird noch gebacken" };
    const f = await workerAuftrag({ typ: "pruefe" }, "faehigkeiten", 20_000);
    return f && f.typ === "faehigkeiten" ? f : { wasm: false, grund: (f && f.grund) || "Prüfung fehlgeschlagen" };
  }

  async function laden() {
    fortschritt(0.15);
    let r;
    try {
      r = await fetch("api/teilen/" + encodeURIComponent(key), { headers: { Accept: "text/plain" } });
      if (r.ok) code = await r.text();
    } catch (e) {
      zeigeEnde("Die App kann gerade nicht geladen werden – keine Verbindung zum Server.", { fehler: true, codeLink: false });
      return;
    }
    if (r.status === 404) { zeigeEnde("Diese App gibt es nicht (mehr). Geteilte Links laufen nach einer Weile ab.", { fehler: true, nochmal: false, codeLink: false }); return; }
    if (!r.ok || code == null) { zeigeEnde("Die App kann gerade nicht geladen werden. Bitte versuch es später erneut.", { fehler: true, codeLink: false }); return; }
    fortschritt(0.35);
    istTheke = /\bneu\s+Theke\s*\(/.test(code);
    // Wie im Playground: interaktive Programme brauchen Cross-Origin-Isolation (kein Ersatzmodus)
    if (!interaktivMoeglich() && (istTheke || /\bBestellannahme\s*\./.test(code))) {
      konsoleEl.hidden = false;
      konsole.leeren(false);
      konsole.system("Dieser Browser erlaubt keine interaktive Eingabe (Cross-Origin-Isolation fehlt). Das Programm wurde nicht gestartet.", "fehler");
      zeigeEnde("Programm nicht gestartet.", { fehler: true, nochmal: false });
      return;
    }
    const [f] = await Promise.all([pruefeMotor(), istTheke ? ladeRenderer() : null]);
    faehigkeiten = f;
    fortschritt(0.55);
    starten();
  }

  document.body.classList.add("bereit");
  laden();
}
