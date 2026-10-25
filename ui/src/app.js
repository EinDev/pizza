// App-Link (#app=<id>[@n], PROJEKTE §3.5): startet ein geteiltes Projekt direkt im Vollbild – ohne Editor, Panels oder Code.
// Bis zum Start ist nur ein Ladebalken zu sehen (js/thema.js setzt data-app vor dem ersten Zeichnen, CSS blendet alles
// andere aus). Ablauf: Manifest + Blobs laden (teilen.js, ohne @n die neueste Version – der App-Link „aktualisiert sich“) →
// Sammlung bauen, Bilder vorbacken → Motor prüfen (+ Theke-Renderer vorladen) → im Worker kompilieren (Motor „Auto“: Wasm,
// sonst Interpreter) → starten. Titel = Projektname; Standard-Argumente aus pizza.json. Danach füllt die Theke bzw. die Konsole das Fenster –
// gleiche Konsole, gleicher Renderer wie im Playground (Browser = nativ). Während der Laufzeit dezent „App bearbeiten“
// (oben rechts, zum Code-Link). Am Ende: Ausgabe + „Nochmal“ / „Code ansehen“.
// Vorrat: dieselben Kammern wie geteilte Tabs im Playground (localStorage „pizza.vorrat.<name>“, siehe vorrat.js).
import { erstelleKonsole } from "./konsole.js";
import { erstelleAusfuehrung, workerAuftrag, interaktivMoeglich, ladeMotoren } from "./ausfuehrung.js";
import { leseKoeche, koecheFuerLauf } from "./koeche.js";
import { erstelleVorschau, ladeRenderer } from "./vorschau.js";
import { erstelleHerdAnzeige, herdLaufVorbereiten, ladeHerdKern, nutztHerd } from "./herd.js";
import { klangAnbinden, klangLaufVorbereiten } from "./klang.js";
import { VORRAT, vorratVerfuegbar, vorratLaden, vorratSpeichern } from "./vorrat.js";
import { ladeGeteilt, leseLinkWert, linkWert, appTitel, ohneErzeugteProjektdatei, TeilenFehler, ALT_TEXT, WEG_TEXT } from "./teilen.js";
import { sammlung, programmText, dateiArt } from "./projekt.js";
import { erstelleVorbacker } from "./bilder.js";

const TITEL = "pizza-App";
const AUSGABE_TYPEN = new Set(["ausgabe", "fehlerausgabe", "warnung", "fehler", "panik", "eingabe", "leeren", "system"]);

export function startApp(wert) {
  const link = leseLinkWert(wert);
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

  let code = null, geteilt = null, titel = TITEL, istTheke = false, istHerd = false, faehigkeiten = null, hatAusgabe = false, laeuft = false;
  let bildLauf = {};

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

  // „Code ansehen“: derselbe Link als Code-Link (#h=<id>[@n]) – neu laden, damit der Playground startet
  const codeUrl = location.href.split("#")[0] + "#h=" + (link && link.id ? linkWert(link.id, link.version) : String(wert));
  linkCode.href = codeUrl;
  function codeAnsehen() { location.assign(codeUrl); location.reload(); }
  linkCode.addEventListener("click", (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // neuer Tab o. Ä.: Browser machen lassen
    e.preventDefault();
    codeAnsehen();
  });
  // „App bearbeiten“: während der ganzen Laufzeit dezent in einer Ecke – echter Link zum Code-Link (Mittelklick/neuer
  // Tab geht), normaler Klick wie „Code ansehen“. Theke: im Streifen links neben dem X (kein zusätzlicher Platz);
  // Konsole: schmaler Streifen über der Ausgabe, damit nichts verdeckt wird. Während des Ladebalkens unsichtbar.
  function bearbeitenLink(testid) {
    const a = document.createElement("a");
    a.className = "app-bearbeiten";
    a.href = codeUrl;
    a.dataset.testid = testid;
    a.title = "Code dieser App im Playground öffnen";
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span>App bearbeiten</span>';
    a.addEventListener("click", (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      codeAnsehen();
    });
    return a;
  }
  const appKopf = document.createElement("div");
  appKopf.className = "app-kopf";
  appKopf.appendChild(bearbeitenLink("app-bearbeiten"));
  konsoleEl.insertBefore(appKopf, konsoleEl.firstChild);

  // Hash ändert sich (z. B. Zurück-Taste) → neu laden, Modus entscheidet thema.js
  window.addEventListener("hashchange", () => location.reload());

  // Dezentes X (statt Titelleiste) = Schließen des EXE-Fensters: sendet {typ:"geschlossen"} (vorschau.js).
  // Das Programm läuft danach weiter wie nativ; am Ende kommt die Leiste „Nochmal“/„Code ansehen“.
  const knopfZu = $("vorschau-schliessen");
  $("vorschau-kopf").classList.add("app-zu");
  $("vorschau-kopf").removeAttribute("title");
  $("vorschau-kopf").insertBefore(bearbeitenLink("app-bearbeiten-theke"), knopfZu);
  knopfZu.title = "Beenden";
  knopfZu.setAttribute("aria-label", "App beenden");
  knopfZu.addEventListener("click", () => {
    // Läuft das Programm ohne Fenster still weiter, nicht ewig eine leere Fläche zeigen
    setTimeout(() => { if (laeuft && !vorschau.offen) zeigeKonsole(); }, 400);
  });

  // Thema: wie im Playground (gemerkte Wahl, sonst OS – auch live)
  const vorschau = erstelleVorschau({
    beiEreignis: (ev) => { if (herd.aktiv && ev && ev.typ === "geschlossen") herd.nutzerSchliesst(); else ausfuehrung.uiEreignis(ev); },
    beiZu: null, vollbild: true,
  });
  // Herd (H6): Spielfeld bildschirmfüllend, seitentreu (die Glut passt ein); ohne Statuszeile
  const herd = erstelleHerdAnzeige({ vorschau, vollbild: true, status: false, beiMeldung: (text) => { konsole.system(text, "fehler"); hatAusgabe = true; } });
  // Klang (K-153): Wiedergabe mit WebAudio, Stummschalter im Kopf
  const klang = klangAnbinden($("vorschau-ton"));
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
      herd.beenden();
      klang.start();
      vorschau.beenden();
      konsole.leeren(false);
      hatAusgabe = false;
      ende.hidden = true;
    },
    beiMotor() {
      fortschritt(0.9);
      // Konsolenprogramm: ab jetzt läuft es – Konsole zeigen. Theke: warten, bis das Fenster kommt.
      if (!istTheke && !istHerd) zeigeKonsole();
    },
    beiHerd(ev) {
      if (ev && ev.art === "fenster" && ev.titel != null) document.title = String(ev.titel) || titel;
      herd.ereignis(ev);
      if (ev && ev.art === "schliesse") zeigeKonsole();
      else requestAnimationFrame(zeige);
    },
    beiKlang(ev) { klang.ereignis(ev); },
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
      laeuft = false;
      konsole.sofortZeichnen();
      konsole.versteckeEingabe();
      herd.beenden();
      klang.ende();
      vorschau.beenden();
      konsoleEl.hidden = !(hatAusgabe || !(istTheke || istHerd));
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

  async function starten() {
    html.classList.remove("app-gestartet");
    fortschritt(0.7);
    konsoleEl.hidden = true;
    ende.hidden = true;
    const saat = neueSaat();
    const vorratAktiv = vorratVerfuegbar();
    laeuft = true;
    const herdLauf = istHerd ? await herdLaufVorbereiten(code) : null;
    const klangLauf = await klangLaufVorbereiten(code);   // K-153: klang.wasm nur für Programme mit Klang.…
    // je Lauf eine frische Sammlung (die Puffer gehen per Transfer an den Worker)
    ausfuehrung.starte(sammlung({ hauptdatei: geteilt.hauptdatei, name: geteilt.name }, geteilt.dateien), geteilt.args, "auto", {
      pizzaiolo: !!(faehigkeiten && faehigkeiten.wasm),
      pizzaioloGrund: faehigkeiten && faehigkeiten.grund,
      zufallsSaat: saat,
      vorrat: vorratAktiv ? vorratLaden(VORRAT) : undefined,
      vorratAktiv,
      koeche: koecheFuerLauf(leseKoeche()),   // dieselbe Einstellung wie im Playground (THREADS §4.8)
      ...(herdLauf ? herdLauf.extra : {}),
      ...klangLauf,
      ...bildLauf,
    });
    herd.lauf(herdLauf && herdLauf.kontext);
    // Kein „Saat: N“ wie im Playground/Terminal – in der App stört es nur
  }
  knopfNochmal.addEventListener("click", () => {
    if (geteilt == null) { location.reload(); return; }
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
    if (link && link.alt) { zeigeEnde(ALT_TEXT, { fehler: true, nochmal: false, codeLink: false }); return; }
    if (!link) { zeigeEnde("Diese App gibt es nicht (mehr). Der Link ist unvollständig oder ungültig.", { fehler: true, nochmal: false, codeLink: false }); return; }
    try {
      geteilt = await ladeGeteilt({ basis: "", fortschritt: (s, i, n) => { if (s === "laden" && n) fortschritt(0.15 + 0.2 * (i / n)); } }, link.id, link.version);
    } catch (e) {
      const f = e instanceof TeilenFehler ? e : null;
      if (f && (f.art === "weg" || f.art === "alt")) {
        zeigeEnde(f.art === "alt" ? ALT_TEXT : WEG_TEXT.replace("Diesen Link", "Diese App"), { fehler: true, nochmal: false, codeLink: false });
      } else if (f && f.art === "netz") {
        zeigeEnde("Die App kann gerade nicht geladen werden – keine Verbindung zum Server.", { fehler: true, codeLink: false });
      } else {
        zeigeEnde("Die App kann gerade nicht geladen werden. Bitte versuch es später erneut.", { fehler: true, codeLink: false });
      }
      return;
    }
    geteilt.dateien = ohneErzeugteProjektdatei(geteilt.dateien, geteilt);
    code = programmText(geteilt.dateien);
    fortschritt(0.35);
    // Seitentitel = Projektname (ohne „.pizza“); eine Theke setzt später ihren Fenstertitel
    titel = appTitel(geteilt.name) || TITEL;
    document.title = titel;
    istTheke = /\bneu\s+Theke\s*\(/.test(code);
    istHerd = nutztHerd(code);
    // Wie im Playground: interaktive Programme brauchen Cross-Origin-Isolation (kein Ersatzmodus)
    if (!interaktivMoeglich() && (istTheke || /\bneu\s+Herd\s*\(/.test(code) || /\bBestellannahme\s*\./.test(code))) {
      konsoleEl.hidden = false;
      konsole.leeren(false);
      konsole.system("Dieser Browser erlaubt keine interaktive Eingabe (Cross-Origin-Isolation fehlt). Das Programm wurde nicht gestartet.", "fehler");
      zeigeEnde("Programm nicht gestartet.", { fehler: true, nochmal: false });
      return;
    }
    // Bilder und Modelle (PD1/PD2, H-K16): einmal vorbacken (ohne Cache), der Interpreter prüft jeden Teigling/Modellteig
    const bilder = Object.fromEntries(Object.entries(geteilt.dateien).filter(([p, i]) => (dateiArt(p) === "bild" || dateiArt(p) === "modell") && i instanceof Uint8Array));
    const backen = Object.keys(bilder).length ? (async () => {
      const vb = erstelleVorbacker({ ablage: null });
      const [modul, teiglinge] = await Promise.all([vb.modul(), vb.teiglingeFuer(bilder, geteilt.dateien)]);
      bildLauf = { teiglinge, ...(modul ? { vorbacker: modul } : {}) };
    })() : null;
    const [f] = await Promise.all([pruefeMotor(), istTheke ? ladeRenderer() : null, istHerd ? ladeHerdKern().catch(() => null) : null, backen]);
    faehigkeiten = f;
    fortschritt(0.55);
    starten();
  }

  document.body.classList.add("bereit");
  laden();
}
