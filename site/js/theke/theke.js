/* pizza v3.0 – Theke: Render-Engine des UI-Frameworks (THEKE.md, Protokoll v1).
 *
 *   var t = PizzaTheke.erzeuge(container, { sende: function (ereignis) {}, thema: "auto", fenster: function (info) {} });
 *   t.empfange(nachricht);   // Objekt oder JSON-String (Programm → Renderer)
 *   t.schliessen();          // Einbettung schließt das Fenster → sendet einmalig {"typ":"geschlossen"}
 *   t.zerstoere();           // räumt Listener und DOM auf (sendet nichts)
 *
 *   PizzaTheke.registriere(art, { erzeuge: function (knoten, ctx) { return element; },
 *                                 aktualisiere: function (element, felder, ctx) {},
 *                                 felder?: ["text", …],      // bekannte Felder (sonst einmalige Warnung)
 *                                 kindSichtbar?: function (element, kindEl, ctx) {},   // v4: ein Kind hat sichtbar (v6: oder marke) gewechselt
 *                                 taste?: function (element, taste, ctx, e) { return aktiv; } });   // v4: Tastendruck (K-110)
 *
 * Reines DOM, keine Abhängigkeiten, kein Netzwerk, kein eval, keine Inline-Handler (strikte CSP).
 * Arbeitet ausschließlich mit container.ownerDocument – keine Annahmen über die umgebende Seite.
 */
(function (wurzel, fabrik) {
  var api = fabrik();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (wurzel) wurzel.PizzaTheke = api;
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var VERSION = 1;
  var hat = Object.prototype.hasOwnProperty;
  var ID_ATTR = "data-theke-id";

  // ------------------------------------------------------------------ Hilfen
  function warne() {
    if (typeof console !== "undefined" && console.warn) console.warn.apply(console, ["[Theke]"].concat([].slice.call(arguments)));
  }
  function istObjekt(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
  function alsText(x) { return x === undefined || x === null ? "" : String(x); }

  // ------------------------------------------------------------------ Stil-Whitelist (THEKE.md §2)
  var GROESSE_MAX = 4000;
  var STIL = {
    schrift: ["klein", "normal", "gross", "riesig", "mono"],
    farbe: ["tomate", "basilikum", "mozzarella", "kruste", "normal"],
    ausrichtung: { start: "start", links: "start", oben: "start", mitte: "mitte", zentriert: "mitte",
                   ende: "ende", rechts: "ende", unten: "ende", strecken: "strecken" },
    // v6 (K-120): Lage quer zur Reihe – an einer Reihe für ihre Kinder, an einer Zutat direkt in einer Reihe für sich selbst
    senkrecht: ["oben", "mitte", "unten", "strecken"]
  };

  /** Länge: Zahl (px) oder "voll"/"auto". Liefert CSS-Wert oder null. */
  function laenge(w) {
    if (typeof w === "number" && isFinite(w)) return Math.max(0, Math.min(GROESSE_MAX, w)) + "px";
    if (w === "voll") return "100%";
    if (w === "auto") return "auto";
    return null;
  }

  function setzeKlasse(el, praefix, wert) {
    var weg = [];
    for (var i = 0; i < el.classList.length; i++) if (el.classList[i].indexOf(praefix) === 0) weg.push(el.classList[i]);
    for (var j = 0; j < weg.length; j++) el.classList.remove(weg[j]);
    if (wert) el.classList.add(praefix + wert);
  }

  /** Wendet ein Stil-Objekt an (nur Whitelist; `null` setzt einen Schlüssel zurück). */
  function wendeStilAn(el, stil, art) {
    if (!istObjekt(stil)) { if (stil !== undefined) warne("stil muss ein Objekt sein:", stil); return; }
    for (var k in stil) {
      if (!hat.call(stil, k)) continue;
      var w = stil[k], weg = w === null || w === undefined;
      if (k === "breite" || k === "hoehe") {
        var css = weg ? null : laenge(w);
        if (!weg && css === null) { warne("Ungültiger Wert für stil." + k + ":", w); continue; }
        if (css === null) { el.style.removeProperty("--theke-" + k); el.classList.remove("theke-hat-" + k); }
        else { el.style.setProperty("--theke-" + k, css); el.classList.add("theke-hat-" + k); }
      } else if (k === "abstand") {
        if (weg) { el.style.removeProperty("--theke-abstand"); el.classList.remove("theke-hat-abstand"); continue; }
        if (typeof w !== "number" || !isFinite(w)) { warne("Ungültiger Wert für stil.abstand:", w); continue; }
        el.style.setProperty("--theke-abstand", Math.max(0, Math.min(200, w)) + "px");
        el.classList.add("theke-hat-abstand");
      } else if (k === "schrift" || k === "farbe") {
        if (weg || w === "normal") { setzeKlasse(el, "theke-" + k + "-", null); continue; }
        if (STIL[k].indexOf(w) < 0) { warne("Ungültiger Wert für stil." + k + ":", w); continue; }
        setzeKlasse(el, "theke-" + k + "-", w);
      } else if (k === "senkrecht") {
        if (weg) { setzeKlasse(el, "theke-senkrecht-", null); continue; }
        if (STIL.senkrecht.indexOf(w) < 0) { warne("Ungültiger Wert für stil.senkrecht:", w); continue; }
        setzeKlasse(el, "theke-senkrecht-", w);
      } else if (k === "ausrichtung") {
        if (weg) { setzeKlasse(el, "theke-ausrichtung-", null); continue; }
        if (!hat.call(STIL.ausrichtung, w)) { warne("Ungültiger Wert für stil.ausrichtung:", w); continue; }
        setzeKlasse(el, "theke-ausrichtung-", STIL.ausrichtung[w]);
      } else if (k === "zeilen") {
        // v4 (K-113): genau n Textzeilen hoch, längerer Text mit „…“ – wirkt per CSS auf schild/knopf/haken,
        // v6 (K-121) auch auf den Abschnitt-Titel und jede Tabellenzelle; sonst still.
        if (weg) { el.style.removeProperty("--theke-zeilen"); el.classList.remove("theke-hat-zeilen"); continue; }
        if (typeof w !== "number" || !isFinite(w) || w < 1 || Math.floor(w) !== w) { warne("Ungültiger Wert für stil.zeilen:", w); continue; }
        el.style.setProperty("--theke-zeilen", String(w));
        el.classList.add("theke-hat-zeilen");
      } else if (k === "spalten") {
        // v7 (K-126): Spaltengewichte einer Tabelle – feste Spalten (table-layout: fixed) im Verhältnis der Gewichte;
        // fehlende Gewichte zählen 1, überzählige entfallen. Andere Zutaten ignorieren den Stil.
        if (weg) { spaltenGewichte.delete(el); el.classList.remove("theke-hat-spalten"); setzeSpalten(el); continue; }
        if (!Array.isArray(w) || !w.length || !w.every(function (x) { return typeof x === "number" && isFinite(x) && x > 0; })) {
          warne("Ungültiger Wert für stil.spalten:", w); continue;
        }
        spaltenGewichte.set(el, w.slice());
        el.classList.add("theke-hat-spalten");
        setzeSpalten(el);
      } else if (k === "mindestbreite") {
        // v4 (K-113): nie schmaler als … (min-width), darf wachsen – für jede Zutat.
        var mb = weg ? null : laenge(w);
        if (!weg && mb === null) { warne("Ungültiger Wert für stil.mindestbreite:", w); continue; }
        if (mb === null) { el.style.removeProperty("--theke-mindestbreite"); el.classList.remove("theke-hat-mindestbreite"); }
        else { el.style.setProperty("--theke-mindestbreite", mb); el.classList.add("theke-hat-mindestbreite"); }
      } else {
        warne("Unbekannter Stil-Schlüssel ignoriert (" + art + "):", k);
      }
    }
  }

  // ------------------------------------------------------------------ Zutaten-Registry
  var registry = Object.create(null);
  var ALLGEMEINE_FELDER = ["id", "art", "stil", "sichtbar", "hinweis", "uebergang", "marke"];

  // K-115: Ein vollständiger Knoten (mit art) in einer kinder-Liste ist der ganze Zustand der Zutat. Felder, die das Programm nur
  // bei Abweichung vom Standard sendet, gelten dort als Standard – auch wenn das Element wiederverwendet wird (Zutat wandert).
  var STIL_SCHLUESSEL = ["breite", "hoehe", "abstand", "ausrichtung", "schrift", "farbe", "zeilen", "mindestbreite", "senkrecht", "spalten"];
  var STANDARD_FELDER = {
    knopf: { aktiv: true }, takt: { aktiv: true }, auswahl: { aktiv: true }, tastatur: { aktiv: true },
    eingabe: { platzhalter: "" }, fortschritt: { text: "" }, abschnitt: { klappbar: false, zu: false }
  };
  function mitStandard(k) {
    var f = { sichtbar: true, hinweis: "", uebergang: false, marke: "" }, x;
    var art = hat.call(STANDARD_FELDER, k.art) ? STANDARD_FELDER[k.art] : {};
    for (x in art) f[x] = art[x];
    for (x in k) if (hat.call(k, x)) f[x] = k[x];
    var stil = {}, alt = istObjekt(k.stil) ? k.stil : {};
    for (var i = 0; i < STIL_SCHLUESSEL.length; i++) stil[STIL_SCHLUESSEL[i]] = null;
    for (x in alt) if (hat.call(alt, x)) stil[x] = alt[x];
    f.stil = stil;
    return f;
  }

  function registriere(art, def) {
    if (typeof art !== "string" || !art) throw new TypeError("PizzaTheke.registriere: art muss ein nicht-leerer String sein");
    if (!def || typeof def.erzeuge !== "function") throw new TypeError("PizzaTheke.registriere: erzeuge(knoten, ctx) fehlt");
    registry[art] = {
      erzeuge: def.erzeuge,
      aktualisiere: typeof def.aktualisiere === "function" ? def.aktualisiere : function () {},
      felder: Array.isArray(def.felder) ? def.felder.slice() : null,
      /** v4: optional – ein direktes Kind (auch in einem inneren Bereich) hat sichtbar gewechselt → Behälter zeichnet nach. */
      kindSichtbar: typeof def.kindSichtbar === "function" ? def.kindSichtbar : null,
      /** v4: optional – Tastendruck auf der Theke (K-110); true zurückgeben = aktiv angenommen (Baumreihenfolge). */
      taste: typeof def.taste === "function" ? def.taste : null
    };
  }
  function zutatArten() { return Object.keys(registry); }

  // ------------------------------------------------------------------ v1-Zutaten
  function textFeld(el, felder) { if (hat.call(felder, "text")) el.textContent = alsText(felder.text); }

  registriere("schild", {
    felder: ["text"],
    erzeuge: function (k, ctx) { var el = ctx.dokument.createElement("div"); el.className = "theke-schild"; return el; },
    aktualisiere: function (el, f) { textFeld(el, f); }
  });

  registriere("knopf", {
    felder: ["text", "aktiv"],
    erzeuge: function (k, ctx) {
      var el = ctx.dokument.createElement("button");
      el.type = "button";
      el.className = "theke-knopf";
      // Text in einem inneren span: so bleibt er bei stil.zeilen (K-113) zentriert und abschneidbar.
      var txt = ctx.dokument.createElement("span"); txt.className = "theke-knopf-text";
      el.appendChild(txt);
      ctx.bei("click", function () { if (!el.disabled) ctx.sende("klick"); });
      return el;
    },
    aktualisiere: function (el, f) {
      if (hat.call(f, "text")) el.firstChild.textContent = alsText(f.text);
      if (hat.call(f, "aktiv")) el.disabled = f.aktiv === false;
    }
  });

  registriere("eingabe", {
    felder: ["wert", "platzhalter", "aktiv"],
    erzeuge: function (k, ctx) {
      var el = ctx.dokument.createElement("input");
      el.type = "text";
      el.className = "theke-eingabe";
      el.setAttribute("autocomplete", "off");
      el.setAttribute("spellcheck", "false");
      ctx.bei("input", function () { ctx.sende("aenderung", { wert: el.value }); });
      ctx.bei("keydown", function (e) {
        if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); ctx.sende("enter", { wert: el.value }); }
      });
      return el;
    },
    aktualisiere: function (el, f) {
      // Nur bei echter Änderung setzen – sonst springt der Cursor, während getippt wird.
      if (hat.call(f, "wert")) { var w = alsText(f.wert); if (el.value !== w) el.value = w; }
      if (hat.call(f, "platzhalter")) {
        var p = alsText(f.platzhalter);
        el.placeholder = p;
        if (p) el.setAttribute("aria-label", p); else el.removeAttribute("aria-label");
      }
      if (hat.call(f, "aktiv")) el.disabled = f.aktiv === false;
    }
  });

  registriere("haken", {
    felder: ["text", "an", "aktiv"],
    erzeuge: function (k, ctx) {
      var d = ctx.dokument;
      var el = d.createElement("label"); el.className = "theke-haken";
      var box = d.createElement("input"); box.type = "checkbox"; box.className = "theke-haken-box";
      var txt = d.createElement("span"); txt.className = "theke-haken-text";
      el.appendChild(box); el.appendChild(txt);
      ctx.bei("change", function () { ctx.sende("aenderung", { wert: !!box.checked }); }, box);
      return el;
    },
    aktualisiere: function (el, f) {
      var box = el.querySelector(".theke-haken-box"), txt = el.querySelector(".theke-haken-text");
      if (hat.call(f, "text")) txt.textContent = alsText(f.text);
      if (hat.call(f, "an")) box.checked = f.an === true;
      if (hat.call(f, "aktiv")) { box.disabled = f.aktiv === false; el.classList.toggle("theke-inaktiv", f.aktiv === false); }
    }
  });

  function behaelter(klasse) {
    return {
      felder: ["kinder"],
      erzeuge: function (k, ctx) { var el = ctx.dokument.createElement("div"); el.className = "theke-behaelter " + klasse; return el; },
      aktualisiere: function (el, f, ctx) { if (hat.call(f, "kinder")) ctx.setzeKinder(el, f.kinder); }
    };
  }
  registriere("stapel", behaelter("theke-stapel"));
  registriere("reihe", behaelter("theke-reihe"));

  // ------------------------------------------------------------------ v2-Zutaten (THEKE-ERWEITERUNGEN.md)
  // Ebenfalls nur über registriere/ctx gebaut. Zustand je Element in WeakMaps (Felder kommen einzeln über aendere).

  // ---- takt: unsichtbarer Zeitgeber, sendet {"typ":"takt","id","anzahl":n}
  var TAKT_MIN = 100, TAKT_STANDARD = 1000;
  var taktZustand = new WeakMap();

  function taktIntervall(w, ctx) {
    if (typeof w !== "number" || !isFinite(w)) {
      ctx.warne("Ungültiges takt.intervall (" + ctx.id + "):", w, "– nehme " + TAKT_STANDARD + " ms.");
      return TAKT_STANDARD;
    }
    if (w < TAKT_MIN) { ctx.warne("takt.intervall " + w + " ms < " + TAKT_MIN + " ms (" + ctx.id + ") – nehme " + TAKT_MIN + " ms."); return TAKT_MIN; }
    return w;
  }
  function taktStopp(z) {
    if (z.handle === null) return;
    var h = z.handle;
    z.handle = null;
    try { z.ctx.zeitgeber.loescheIntervall(h); } catch (e) { z.ctx.warne("takt: loescheIntervall fehlgeschlagen:", e); }
  }
  /** (Neu-)Start: Zählung beginnt jetzt. Der Timer läuft feiner als das Intervall (intervall/4, 25…250 ms), damit ein
   *  minimal zu früh feuernder Timer keinen ganzen Schlag verspätet; gezählt wird nach der Uhr, nicht nach Aufrufen. */
  function taktStart(z) {
    taktStopp(z);
    if (!z.aktiv || z.weg) return;
    var zg = z.ctx.zeitgeber;
    z.letzter = zg.jetzt();
    var fein = Math.max(25, Math.min(250, Math.round(z.intervall / 4)));
    var handle = zg.setzeIntervall(function () {
      if (z.weg || !z.aktiv || z.handle !== handle) return;
      try {
        var anzahl = Math.floor((zg.jetzt() - z.letzter) / z.intervall);
        if (anzahl >= 1) {
          z.letzter += anzahl * z.intervall;
          z.ctx.sende("takt", { anzahl: anzahl });
        }
      } catch (e) { z.ctx.warne("takt: Schlag fehlgeschlagen:", e); }
    }, fein);
    z.handle = handle;
  }

  registriere("takt", {
    felder: ["intervall", "aktiv"],
    erzeuge: function (k, ctx) {
      var el = ctx.dokument.createElement("div");
      el.className = "theke-takt";
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      var z = { ctx: ctx, intervall: TAKT_STANDARD, aktiv: true, handle: null, letzter: 0, weg: false, gestartet: false };
      taktZustand.set(el, z);
      ctx.beimEntfernen(function () { z.weg = true; taktStopp(z); });
      return el;
    },
    aktualisiere: function (el, f, ctx) {
      var z = taktZustand.get(el);
      if (!z) return;
      var neu = !z.gestartet;
      if (hat.call(f, "intervall")) {
        var ms = taktIntervall(f.intervall, ctx);
        if (ms !== z.intervall) { z.intervall = ms; neu = true; }
      }
      if (hat.call(f, "aktiv")) {
        var a = f.aktiv !== false;
        if (a !== z.aktiv) { z.aktiv = a; neu = true; }
      }
      if (!neu) return;
      z.gestartet = true;
      if (z.aktiv) taktStart(z); else taktStopp(z);
    }
  });

  // ---- fortschritt: Balken, wert 0…1, optionaler Text mittig
  function anteil(w) { return typeof w === "number" && isFinite(w) ? Math.max(0, Math.min(1, w)) : 0; }
  function zeigeAnteil(el, a) {
    el.style.setProperty("--theke-wert", Math.round(a * 1000) / 10 + "%");
    el.setAttribute("aria-valuenow", String(Math.round(a * 100)));
  }

  registriere("fortschritt", {
    felder: ["wert", "text"],
    erzeuge: function (k, ctx) {
      var d = ctx.dokument;
      var el = d.createElement("div");
      el.className = "theke-fortschritt";
      el.setAttribute("role", "progressbar");
      el.setAttribute("aria-valuemin", "0");
      el.setAttribute("aria-valuemax", "100");
      var fuell = d.createElement("div"); fuell.className = "theke-fortschritt-fuellung";
      var txt = d.createElement("div"); txt.className = "theke-fortschritt-text";
      var hell = d.createElement("div"); hell.className = "theke-fortschritt-text theke-fortschritt-text-hell";
      hell.setAttribute("aria-hidden", "true");   // gleicher Text in Kontrastfarbe, auf die Füllung zugeschnitten
      el.appendChild(fuell); el.appendChild(txt); el.appendChild(hell);
      zeigeAnteil(el, 0);
      return el;
    },
    aktualisiere: function (el, f) {
      if (hat.call(f, "wert")) zeigeAnteil(el, anteil(f.wert));
      if (hat.call(f, "text")) {
        var t = alsText(f.text);
        el.children[1].textContent = t;
        el.children[2].textContent = t;
        el.classList.toggle("theke-fortschritt-mit-text", t !== "");
        if (t) el.setAttribute("aria-valuetext", t); else el.removeAttribute("aria-valuetext");
      }
    }
  });

  // ---- abschnitt: Karte mit Überschrift, Inhalt als Stapel; v4 (K-108): klappbar (Kopf wird Knopf) und zu (Inhalt hidden)
  var abschnittZustand = new WeakMap();

  registriere("abschnitt", {
    felder: ["titel", "kinder", "klappbar", "zu"],
    erzeuge: function (k, ctx) {
      var d = ctx.dokument;
      var el = d.createElement("section");
      el.className = "theke-abschnitt";
      var kopf = d.createElement("h3"); kopf.className = "theke-abschnitt-titel"; kopf.hidden = true;
      var inhalt = d.createElement("div"); inhalt.className = "theke-behaelter theke-stapel theke-abschnitt-inhalt";
      el.appendChild(kopf); el.appendChild(inhalt);
      // Der Klapp-Knopf (Pfeil ▸/▾ per CSS vor dem Titel) sitzt nur bei klappbar im Kopf.
      var knopf = d.createElement("button"); knopf.type = "button"; knopf.className = "theke-abschnitt-knopf";
      // Titeltext in einem span: so klemmt stil.zeilen (K-121) den Text, nicht den Pfeil davor
      var knopfText = d.createElement("span"); knopfText.className = "theke-abschnitt-knopf-text"; knopf.appendChild(knopfText);
      var z = { ctx: ctx, titel: "", klappbar: false, zu: false, kopf: kopf, inhalt: inhalt, knopf: knopf, knopfText: knopfText };
      abschnittZustand.set(el, z);
      ctx.bei("click", function () {
        if (!z.klappbar) return;
        z.zu = !z.zu;                       // sofort lokal, Ereignis nur bei echtem Wechsel (hier immer einer)
        zeichneAbschnitt(z);
        ctx.sende("aenderung", { wert: z.zu });
      }, knopf);
      return el;
    },
    aktualisiere: function (el, f, ctx) {
      var z = abschnittZustand.get(el);
      if (!z) return;
      if (hat.call(f, "titel")) z.titel = alsText(f.titel);
      if (hat.call(f, "klappbar")) z.klappbar = f.klappbar === true;
      if (hat.call(f, "zu")) z.zu = f.zu === true;
      if (hat.call(f, "titel") || hat.call(f, "klappbar") || hat.call(f, "zu")) zeichneAbschnitt(z);
      if (hat.call(f, "kinder")) ctx.setzeKinder(z.inhalt, f.kinder);
    }
  });
  function zeichneAbschnitt(z) {
    var kopf = z.kopf, knopf = z.knopf;
    kopf.classList.toggle("theke-abschnitt-titel-klappbar", z.klappbar);
    if (z.klappbar) {
      if (knopf.parentNode !== kopf) { kopf.textContent = ""; kopf.appendChild(knopf); }
      z.knopfText.textContent = z.titel;
      knopf.setAttribute("aria-expanded", z.zu ? "false" : "true");
      kopf.hidden = false;                 // leerer Titel → nur der Pfeil
    } else {
      if (knopf.parentNode === kopf) kopf.removeChild(knopf);
      kopf.textContent = z.titel;
      kopf.hidden = z.titel === "";
    }
    z.ctx.blende(z.inhalt, !z.zu);         // hidden am Inhaltsbereich; mit uebergang weich
  }

  // ---- tabelle: spalten + zeilen (Texte), Zahlenspalten rechtsbündig
  var tabellenZustand = new WeakMap();
  // v7 (K-126): stil.spalten je Element (Gewichte); wirkt nur an Tabellen
  var spaltenGewichte = new WeakMap();
  // Zahl (auch 1.234,5 · 1 234 · −3 · 1,5e3), optional mit Größenwort und/oder Einheit: 1,2 Mio. · 8,00 € · 12 % · 0,3/s
  var ZAHL = /^[+\-−]?\s?(?:\d{1,3}(?:[.   ']\d{3})+|\d+)(?:[.,]\d+)?(?:e[+\-]?\d+)?(?:\s?(?:Tsd\.|Mio\.|Mrd\.|Bio\.|Brd\.|Trio\.|k|K|M))?(?:\s?(?:%|‰|€|\$|\/s|\/min|ms|s|x|×))?$/;
  var LEER_ZELLE = /^(?:|[-–—]|…)$/;

  registriere("tabelle", {
    felder: ["spalten", "zeilen"],
    erzeuge: function (k, ctx) {
      var d = ctx.dokument;
      var el = d.createElement("div");
      el.className = "theke-tabelle";
      var tab = d.createElement("table"); tab.className = "theke-tabelle-tab";
      tab.appendChild(d.createElement("thead"));
      tab.appendChild(d.createElement("tbody"));
      el.appendChild(tab);
      tabellenZustand.set(el, { spalten: [], zeilen: [] });
      zeichneTabelle(el, tabellenZustand.get(el), d);
      return el;
    },
    aktualisiere: function (el, f, ctx) {
      var z = tabellenZustand.get(el);
      if (!z) return;
      if (hat.call(f, "spalten")) {
        if (Array.isArray(f.spalten)) z.spalten = f.spalten.map(alsText);
        else { ctx.warne("tabelle.spalten muss eine Liste sein:", f.spalten); z.spalten = []; }
      }
      if (hat.call(f, "zeilen")) {
        if (Array.isArray(f.zeilen)) z.zeilen = f.zeilen.map(function (r) { return (Array.isArray(r) ? r : [r]).map(alsText); });
        else { ctx.warne("tabelle.zeilen muss eine Liste sein:", f.zeilen); z.zeilen = []; }
      }
      if (hat.call(f, "spalten") || hat.call(f, "zeilen")) zeichneTabelle(el, z, ctx.dokument);
    }
  });
  function spaltenZahl(z) {
    var n = z.spalten.length;
    for (var r = 0; r < z.zeilen.length; r++) n = Math.max(n, z.zeilen[r].length);
    return n;
  }
  /** v7 (K-126): colgroup aus stil.spalten – Breite je Spalte = Gewicht / Summe (in %), fehlende Gewichte 1; ohne Stil keine colgroup. */
  function setzeSpalten(el) {
    var z = tabellenZustand.get(el);
    if (!z) return;
    var tab = el.firstChild, d = el.ownerDocument;
    if (tab.firstChild && tab.firstChild.nodeName === "COLGROUP") tab.removeChild(tab.firstChild);
    var g = spaltenGewichte.get(el), n = spaltenZahl(z);
    if (!g || !n) return;
    var summe = 0, s, gew = [];
    for (s = 0; s < n; s++) { gew.push(s < g.length ? g[s] : 1); summe += gew[s]; }
    var cg = d.createElement("colgroup");
    for (s = 0; s < n; s++) {
      var col = d.createElement("col");
      col.style.width = (Math.round(gew[s] / summe * 1e6) / 1e4) + "%";
      cg.appendChild(col);
    }
    tab.insertBefore(cg, tab.firstChild);
  }
  /** Zelltext in einem span: so klemmt stil.zeilen (K-121) jede Zelle auf genau n Zeilen (td selbst kann das nicht). */
  function zellText(zelle, text, d) {
    var sp = d.createElement("span"); sp.className = "theke-tabelle-text"; sp.textContent = text;
    zelle.appendChild(sp);
  }
  function zeichneTabelle(el, z, d) {
    var tab = el.firstChild, kopf = tab.tHead, rumpf = tab.tBodies[0];
    var n = spaltenZahl(z), s, r;
    setzeSpalten(el);
    var zahl = [];
    for (s = 0; s < n; s++) {
      var gesehen = false, nurZahlen = true;
      for (r = 0; r < z.zeilen.length && nurZahlen; r++) {
        var c = s < z.zeilen[r].length ? z.zeilen[r][s].trim() : "";
        if (LEER_ZELLE.test(c)) continue;
        if (ZAHL.test(c)) gesehen = true; else nurZahlen = false;
      }
      zahl.push(gesehen && nurZahlen);
    }
    kopf.textContent = "";
    kopf.hidden = z.spalten.length === 0;
    if (z.spalten.length) {
      var kz = d.createElement("tr");
      for (s = 0; s < n; s++) {
        var th = d.createElement("th");
        th.setAttribute("scope", "col");
        zellText(th, s < z.spalten.length ? z.spalten[s] : "", d);
        if (zahl[s]) th.className = "theke-tabelle-zahl";
        kz.appendChild(th);
      }
      kopf.appendChild(kz);
    }
    rumpf.textContent = "";
    if (!z.zeilen.length) {
      var lz = d.createElement("tr"), ltd = d.createElement("td");
      ltd.className = "theke-tabelle-leer";
      ltd.colSpan = Math.max(1, n);
      ltd.textContent = "–";
      lz.appendChild(ltd); rumpf.appendChild(lz);
      return;
    }
    for (r = 0; r < z.zeilen.length; r++) {
      var tr = d.createElement("tr");
      for (s = 0; s < n; s++) {
        var td = d.createElement("td");
        zellText(td, s < z.zeilen[r].length ? z.zeilen[r][s] : "", d);
        if (zahl[s]) td.className = "theke-tabelle-zahl";
        tr.appendChild(td);
      }
      rumpf.appendChild(tr);
    }
  }

  // ---- reiter: Tabs über Seiten (kinder), gewaehlt 1-basiert, Ereignis {"typ":"aenderung","id","wert":n}
  var reiterZustand = new WeakMap();

  registriere("reiter", {
    felder: ["titel", "gewaehlt", "kinder"],
    erzeuge: function (k, ctx) {
      var d = ctx.dokument;
      var el = d.createElement("div");
      el.className = "theke-reiter";
      var leiste = d.createElement("div"); leiste.className = "theke-reiter-leiste"; leiste.setAttribute("role", "tablist");
      var seiten = d.createElement("div"); seiten.className = "theke-reiter-seiten"; seiten.setAttribute("role", "tabpanel");
      el.appendChild(leiste); el.appendChild(seiten);
      var z = { ctx: ctx, titel: [], gewaehlt: 1, leiste: leiste, seiten: seiten };
      reiterZustand.set(el, z);
      function tabVon(ziel) {
        while (ziel && ziel !== leiste) { if (ziel.parentNode === leiste) return ziel; ziel = ziel.parentNode; }
        return null;
      }
      ctx.bei("click", function (e) {
        var tab = tabVon(e.target);
        if (tab) waehleReiter(z, Number(tab.getAttribute("data-theke-nr")), false);
      }, leiste);
      ctx.bei("keydown", function (e) {
        // Nur über sichtbare Seiten wandern (K-107): Pfeile mit Umlauf, Home/End.
        var ziel = naechsteNr(reiterSichtbare(z), reiterAktuell(z), e.key);
        if (!ziel || !tabVon(e.target)) return;
        e.preventDefault();
        waehleReiter(z, ziel, true);
      }, leiste);
      return el;
    },
    /** Eine Seite hat sichtbar gewechselt (auch weich): Tab aus-/einblenden, ggf. Ersatzseite zeigen – ohne Ereignis. */
    kindSichtbar: function (el) { var z = reiterZustand.get(el); if (z) zeichneReiter(z); },
    aktualisiere: function (el, f, ctx) {
      var z = reiterZustand.get(el);
      if (!z) return;
      if (hat.call(f, "titel")) {
        if (Array.isArray(f.titel)) z.titel = f.titel.map(alsText);
        else { ctx.warne("reiter.titel muss eine Liste sein:", f.titel); z.titel = []; }
      }
      if (hat.call(f, "gewaehlt")) {
        var g = f.gewaehlt;
        if (typeof g === "number" && isFinite(g) && g >= 1 && Math.floor(g) === g) z.gewaehlt = g;
        else { ctx.warne("Ungültiges reiter.gewaehlt (" + ctx.id + "):", g); z.gewaehlt = 1; }
      }
      if (hat.call(f, "kinder")) {
        // Seiten, die woandershin wandern, dürfen die Verstecken-Klasse nicht mitnehmen.
        for (var i = 0; i < z.seiten.children.length; i++) z.seiten.children[i].classList.remove("theke-reiter-aus");
        ctx.setzeKinder(z.seiten, f.kinder);
      }
      zeichneReiter(z);
    }
  });
  function reiterAnzahl(z) { return Math.max(z.titel.length, z.seiten.children.length); }
  /** Ist eine Zutat (Seite, Option …) versteckt? hidden oder gerade weich ausblendend (uebergang). */
  function versteckt(el) { return el.hidden === true || el.classList.contains("theke-ueb-aus"); }
  /** Nummern (1-basiert) der sichtbaren Seiten; ein Tab ohne Seite (titel länger als kinder) zählt als sichtbar. */
  function reiterSichtbare(z) {
    var n = reiterAnzahl(z), seiten = z.seiten.children, liste = [];
    for (var i = 0; i < n; i++) if (i >= seiten.length || !versteckt(seiten[i])) liste.push(i + 1);
    return liste;
  }
  /** Tatsächlich gezeigte Seite (K-107): gewaehlt (auf 1…n geklemmt), wenn sichtbar; sonst die nächste sichtbare danach,
   *  sonst die letzte sichtbare davor; 0 = keine (alle versteckt oder keine Seiten). gewaehlt bleibt roh gespeichert. */
  function reiterAktuell(z) {
    var n = reiterAnzahl(z);
    if (!n) return 0;
    var g = Math.max(1, Math.min(z.gewaehlt, n)), s = reiterSichtbare(z);
    if (!s.length) return 0;
    for (var i = 0; i < s.length; i++) if (s[i] >= g) return s[i];
    return s[s.length - 1];
  }
  /** Ziel einer Tastennavigation in einer sortierten Nummernliste: Pfeile mit Umlauf, Home/End; 0 = keine. */
  function naechsteNr(liste, jetzt, taste) {
    var n = liste.length;
    if (!n) return 0;
    var k = liste.indexOf(jetzt);
    if (k < 0) k = 0;
    if (taste === "ArrowRight") return liste[(k + 1) % n];
    if (taste === "ArrowLeft") return liste[(k + n - 1) % n];
    if (taste === "Home") return liste[0];
    if (taste === "End") return liste[n - 1];
    return 0;
  }
  function zeichneReiter(z) {
    var d = z.ctx.dokument, n = reiterAnzahl(z), g = reiterAktuell(z), i;
    var seiten = z.seiten.children;
    while (z.leiste.children.length > n) z.leiste.removeChild(z.leiste.lastChild);
    while (z.leiste.children.length < n) {
      var b = d.createElement("button");
      b.type = "button";
      b.className = "theke-reiter-tab";
      b.setAttribute("role", "tab");
      // Titel im span; die Marke (v6, K-124) liegt als Badge über der rechten oberen Ecke – sie verschiebt keinen Tab
      var bt = d.createElement("span"); bt.className = "theke-reiter-tab-text"; b.appendChild(bt);
      var bm = d.createElement("span"); bm.className = "theke-reiter-marke"; bm.hidden = true; bm.setAttribute("aria-hidden", "true");
      b.appendChild(bm);
      z.leiste.appendChild(b);
    }
    for (i = 0; i < n; i++) {
      var tab = z.leiste.children[i], an = i + 1 === g;
      var t = i < z.titel.length && z.titel[i] !== "" ? z.titel[i] : "Seite " + (i + 1);
      if (tab.firstChild.textContent !== t) tab.firstChild.textContent = t;
      var m = i < seiten.length ? seiten[i].getAttribute("data-theke-marke") || "" : "";
      if (tab.lastChild.textContent !== m) tab.lastChild.textContent = m;
      tab.lastChild.hidden = m === "";
      if (m) tab.setAttribute("aria-label", t + " (" + m + ")"); else tab.removeAttribute("aria-label");
      tab.setAttribute("data-theke-nr", String(i + 1));
      tab.setAttribute("aria-selected", an ? "true" : "false");
      tab.tabIndex = an ? 0 : -1;
      tab.classList.toggle("theke-reiter-tab-an", an);
      tab.hidden = i < seiten.length && versteckt(seiten[i]);   // versteckte Seite → kein Tab (K-107)
    }
    for (i = 0; i < seiten.length; i++) seiten[i].classList.toggle("theke-reiter-aus", i + 1 !== g);
    if (g) z.seiten.setAttribute("aria-label", z.leiste.children[g - 1].firstChild.textContent); else z.seiten.removeAttribute("aria-label");
  }
  /** Nutzer wählt Seite nr: sofort lokal umschalten, dann (nur bei echter Änderung der gezeigten Seite) aenderung senden. */
  function waehleReiter(z, nr, fokus) {
    var n = reiterAnzahl(z);
    if (!(nr >= 1 && nr <= n)) return;
    var vorher = reiterAktuell(z);
    z.gewaehlt = nr;
    zeichneReiter(z);
    if (fokus && z.leiste.children[nr - 1]) z.leiste.children[nr - 1].focus();
    if (nr !== vorher) z.ctx.sende("aenderung", { wert: nr });
  }

  // ---- auswahl (v4, K-109): Segment-Leiste, genau eine Option gewählt; Ereignis {"typ":"aenderung","id","wert":n}
  var auswahlZustand = new WeakMap();

  registriere("auswahl", {
    felder: ["optionen", "gewaehlt", "aktiv"],
    erzeuge: function (k, ctx) {
      var d = ctx.dokument;
      var el = d.createElement("div");
      el.className = "theke-auswahl";
      el.setAttribute("role", "radiogroup");
      var z = { ctx: ctx, optionen: [], gewaehlt: 1, aktiv: true, el: el };
      auswahlZustand.set(el, z);
      function optionVon(ziel) {
        while (ziel && ziel !== el) { if (ziel.parentNode === el) return ziel; ziel = ziel.parentNode; }
        return null;
      }
      ctx.bei("click", function (e) {
        var o = optionVon(e.target);
        if (o && z.aktiv && !o.disabled) waehleAuswahl(z, Number(o.getAttribute("data-theke-nr")), false);
      });
      ctx.bei("keydown", function (e) {
        if (!z.aktiv || !optionVon(e.target)) return;
        var alle = [], ziel;
        for (var i = 1; i <= z.optionen.length; i++) alle.push(i);
        ziel = naechsteNr(alle, auswahlAktuell(z), e.key);
        if (!ziel) return;
        e.preventDefault();
        waehleAuswahl(z, ziel, true);
      });
      return el;
    },
    aktualisiere: function (el, f, ctx) {
      var z = auswahlZustand.get(el);
      if (!z) return;
      if (hat.call(f, "optionen")) {
        if (Array.isArray(f.optionen)) z.optionen = f.optionen.map(alsText);
        else { ctx.warne("auswahl.optionen muss eine Liste sein:", f.optionen); z.optionen = []; }
      }
      if (hat.call(f, "gewaehlt")) {
        var g = f.gewaehlt;
        if (typeof g === "number" && isFinite(g) && g >= 1 && Math.floor(g) === g) z.gewaehlt = g;
        else { ctx.warne("Ungültiges auswahl.gewaehlt (" + ctx.id + "):", g); z.gewaehlt = 1; }
      }
      if (hat.call(f, "aktiv")) z.aktiv = f.aktiv !== false;
      zeichneAuswahl(z);
    }
  });
  /** Gewählte Option, auf 1…n geklemmt (wie beim Reiter; gewaehlt bleibt roh). */
  function auswahlAktuell(z) { return Math.max(1, Math.min(z.gewaehlt, z.optionen.length)); }
  function zeichneAuswahl(z) {
    var d = z.ctx.dokument, n = z.optionen.length, g = auswahlAktuell(z), el = z.el;
    while (el.children.length > n) el.removeChild(el.lastChild);
    while (el.children.length < n) {
      var b = d.createElement("button");
      b.type = "button";
      b.className = "theke-auswahl-option";
      b.setAttribute("role", "radio");
      el.appendChild(b);
    }
    for (var i = 0; i < n; i++) {
      var o = el.children[i], an = i + 1 === g;
      if (o.textContent !== z.optionen[i]) o.textContent = z.optionen[i];
      o.setAttribute("data-theke-nr", String(i + 1));
      o.setAttribute("aria-checked", an ? "true" : "false");
      o.tabIndex = an ? 0 : -1;
      o.disabled = !z.aktiv;
      o.classList.toggle("theke-auswahl-option-an", an);
    }
    el.classList.toggle("theke-inaktiv", !z.aktiv);
  }
  /** Gast wählt Option nr: sofort lokal, aenderung nur bei echtem Wechsel. */
  function waehleAuswahl(z, nr, fokus) {
    if (!(nr >= 1 && nr <= z.optionen.length)) return;
    var vorher = auswahlAktuell(z);
    z.gewaehlt = nr;
    zeichneAuswahl(z);
    if (fokus && z.el.children[nr - 1]) z.el.children[nr - 1].focus();
    if (nr !== vorher) z.ctx.sende("aenderung", { wert: nr });
  }

  // ---- tastatur (v4, K-110): unsichtbar wie takt; Ereignis {"typ":"taste","id","taste":"…"} für jede aktive Tastatur
  // im Baum (Baumreihenfolge). Der keydown-Listener hängt am Theke-Wurzelelement (Engine), Tastennamen s. tastenName.
  var tastaturZustand = new WeakMap();

  registriere("tastatur", {
    felder: ["aktiv"],
    erzeuge: function (k, ctx) {
      var el = ctx.dokument.createElement("div");
      el.className = "theke-tastatur";
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      tastaturZustand.set(el, { aktiv: true });
      return el;
    },
    aktualisiere: function (el, f) {
      var z = tastaturZustand.get(el);
      if (z && hat.call(f, "aktiv")) z.aktiv = f.aktiv !== false;
    },
    taste: function (el, name, ctx) {
      var z = tastaturZustand.get(el);
      if (!z || !z.aktiv) return false;
      ctx.sende("taste", { taste: name });
      return true;
    }
  });

  /** Tastenname nach K-110 aus einem keydown-Ereignis; null = nicht senden (Modifikator, Dead, Komposition, Wiederholung). */
  var TASTEN_DEUTSCH = { " ": "Leertaste", Spacebar: "Leertaste", ArrowLeft: "Links", ArrowRight: "Rechts", ArrowUp: "Hoch",
    ArrowDown: "Runter", Backspace: "Rücktaste", Delete: "Entfernen", Home: "Pos1", End: "Ende", PageUp: "BildHoch", PageDown: "BildRunter" };
  var MODIFIKATOREN = ["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "NumLock", "ScrollLock", "Fn", "FnLock",
    "Hyper", "Super", "Symbol", "SymbolLock", "OS", "Dead", "Unidentified"];
  /** Tasten, deren Standardwirkung (Scrollen) die Theke unterdrückt, wenn eine aktive Tastatur zuhört und nichts fokussiert ist. */
  var SCROLL_TASTEN = ["Leertaste", "Links", "Rechts", "Hoch", "Runter", "Pos1", "Ende", "BildHoch", "BildRunter"];
  function tastenName(e) {
    if (!e || typeof e.key !== "string" || e.key === "") return null;
    if (e.repeat || e.isComposing || e.keyCode === 229) return null;
    if (MODIFIKATOREN.indexOf(e.key) >= 0) return null;
    return hat.call(TASTEN_DEUTSCH, e.key) ? TASTEN_DEUTSCH[e.key] : e.key;
  }
  /** Ziel in einer Eingabe (Textfeld/textarea/select/contenteditable)? Die Tasten gehören dem Feld. Ein Haken (checkbox) ist
   *  keine Eingabe, sondern ein Bedienelement (K-114). */
  function inEingabe(ziel) {
    if (!ziel || ziel.nodeType !== 1) return false;
    var tag = ziel.tagName;
    if (tag === "INPUT") return ["checkbox", "radio", "button", "submit", "reset"].indexOf(ziel.type) < 0;
    return tag === "TEXTAREA" || tag === "SELECT" || ziel.isContentEditable === true;
  }
  /** Bedienelemente der Theke, die Leertaste/Enter selbst auslösen (K-114). */
  var BEDIENELEMENTE = ".theke-knopf, .theke-abschnitt-knopf, .theke-haken-box, .theke-reiter-tab, .theke-auswahl-option";
  function bedienelement(ziel) {
    return !!(ziel && ziel.nodeType === 1 && typeof ziel.closest === "function" && ziel.closest(BEDIENELEMENTE));
  }

  // ------------------------------------------------------------------ v3: Animations-Registry (K-090 … K-092, SPEC §16.6)
  // Animationen sind Ereignisse, kein Zustand: aendere.animationen wird nach aenderungen abgespielt. Eingebaute Arten laufen
  // über dieselbe API wie eigene. Nur transform/opacity/Leuchten (CSS-@keyframes-Klassen, Dauer per CSSOM-Custom-Property –
  // CSP-fest, keine Inline-Styles); Schwebetexte und Funken liegen in einer eigenen Ebene → das Layout ändert sich nie.
  var ANIM_MIN = 50, ANIM_MAX = 5000;
  var UEBERGANG_MS = 200;
  var SCHWEBE_MAX = 20;
  var SCHWEBE_STEIGEN = 40;                      // px (theke.css @keyframes theke-schwebe)
  var SCHWEBE_VERSATZ = [0, -12, 12, -6, 6];   // px, seitlich je Platz reihum – kein Zufall (reproduzierbare Bilder)
  var SCHWEBE_ZEILE = 20;                        // px je Platz: gleichzeitige Texte am selben Anker stapeln sich (K-092)
  var NACHLAUF_MS = 34;                          // ~2 Frames: Klasse erst nach dem letzten Bild entfernen
  var FUNKEN = 8;
  var animRegistry = Object.create(null);

  /** PizzaTheke.registriereAnimation(art, { dauer, spiele(el, eintrag, ctx), ebene?, leer? }).
   *  dauer: Standarddauer in ms (ohne Feld dauer im Eintrag). ebene: true = läuft in der Schwebe-Ebene (el darf null sein =
   *  Fenstermitte), ersetzt nichts und zählt zum Limit von 20; sonst ersetzt sie die laufende Animation derselben Zutat.
   *  leer(eintrag) → true: es gäbe nichts zu zeigen – der Eintrag wird übersprungen (kein Lauf, zählt nicht zum Limit).
   *  spiele darf eine Aufräumfunktion zurückgeben (gerufen am Ende, beim Ersetzen, Entfernen, neuen baum, schliesse). */
  function registriereAnimation(art, def) {
    if (typeof art !== "string" || !art) throw new TypeError("PizzaTheke.registriereAnimation: art muss ein nicht-leerer String sein");
    if (!def || typeof def.spiele !== "function") throw new TypeError("PizzaTheke.registriereAnimation: spiele(el, eintrag, ctx) fehlt");
    var d = typeof def.dauer === "number" && isFinite(def.dauer) ? klemmeDauer(def.dauer) : 400;
    animRegistry[art] = { dauer: d, spiele: def.spiele, ebene: def.ebene === true, leer: typeof def.leer === "function" ? def.leer : null };
  }
  function animationsArten() { return Object.keys(animRegistry); }
  function klemmeDauer(ms) { return Math.max(ANIM_MIN, Math.min(ANIM_MAX, Math.round(ms))); }

  /** Eingebaute Bewegungs-Animation: eine @keyframes-Klasse am Element; bei reduzierter Bewegung entfällt sie (K-092). */
  function bewegung(art, dauer) {
    registriereAnimation(art, {
      dauer: dauer,
      spiele: function (el, eintrag, ctx) { if (!ctx.reduziert) ctx.klasse(el, "theke-anim-" + art); }
    });
  }
  bewegung("puls", 400);
  bewegung("huepfen", 350);
  bewegung("wackeln", 400);
  bewegung("einblenden", 300);
  bewegung("aufpoppen", 450);

  registriereAnimation("funkeln", {
    dauer: 800,
    spiele: function (el, eintrag, ctx) {
      if (ctx.reduziert) { ctx.klasse(el, "theke-anim-funkeln-ruhig"); return; }   // ruhiges Leuchten, keine Funken
      ctx.klasse(el, "theke-anim-funkeln");
      var f = ctx.teil("theke-funken", ctx.lage(el));
      f.setAttribute("aria-hidden", "true");
      for (var i = 0; i < FUNKEN; i++) {
        var s = ctx.dokument.createElement("span");
        s.className = "theke-funke";
        f.appendChild(s);
      }
    }
  });

  registriereAnimation("schwebe", {
    dauer: 1000,
    ebene: true,
    /** Leerer Text (auch nur Leerraum): nichts zu zeigen – kein Element, zählt nicht zum Limit (K-093). */
    leer: function (eintrag) { return alsText(eintrag.text).trim() === ""; },
    spiele: function (el, eintrag, ctx) {
      var wo = ctx.lage(el);
      var t = ctx.teil("theke-schwebe" + (ctx.reduziert ? " theke-schwebe-ruhig" : ""), wo);
      t.textContent = alsText(eintrag.text);
      var farbe = eintrag.farbe;
      if (typeof farbe === "string" && farbe !== "normal" && STIL.farbe.indexOf(farbe) >= 0) t.classList.add("theke-farbe-" + farbe);
      // Gleichzeitige Texte am selben Anker: Platz 0, 1, 2, … (kleinster freier) → je eine Zeile höher, seitlich reihum (K-092).
      var versatz = SCHWEBE_VERSATZ[ctx.nummer % SCHWEBE_VERSATZ.length];
      var hoch = ctx.nummer * SCHWEBE_ZEILE;
      t.style.setProperty("--theke-versatz", versatz + "px");
      // Im sichtbaren Ausschnitt halten (nur wenn der Ausschnitt bekannt ist – ohne Layout, z. B. jsdom, bleibt die rohe Lage):
      // Startpunkt = oben mittig über der Zutat; reicht der Platz nach oben (Text + Steigen) nicht – z. B. ein Zähler ganz
      // oben –, startet der Text tiefer; am Rand rückt er nach innen; ein Stapel-Platz, für den der Platz nach oben (Text +
      // Steigen) nicht reicht, stapelt nach unten (über die Zutat) statt beim Steigen abgeschnitten zu werden. Nur Lage, kein Layout.
      var s = ctx.sicht(), tb = t.offsetWidth, th = t.offsetHeight;
      var x = wo.x + wo.b / 2, y = wo.y;
      var halb = tb / 2 + Math.abs(versatz) + 4;
      if (s.x1 - s.x0 > 2 * halb) x = Math.max(s.x0 + halb, Math.min(s.x1 - halb, x));
      if (s.y1 > s.y0) {
        var obenMin = s.y0 + th + (ctx.reduziert ? 0 : SCHWEBE_STEIGEN) + 4;
        y = Math.min(s.y1, Math.max(y, obenMin));
        if (hoch > 0 && y - hoch < obenMin) hoch = -hoch;
      }
      t.style.setProperty("--theke-hoch", hoch + "px");
      t.style.setProperty("--theke-x", (Math.round(x * 10) / 10) + "px");
      t.style.setProperty("--theke-y", (Math.round(y * 10) / 10) + "px");
      t.style.setProperty("--theke-b", "0px");
    }
  });

  /** Interne Art für uebergang (Einblenden bei sichtbar:true bzw. neuem Kind) – teilt den Platz mit den anderen Animationen. */
  var UEBERGANG_EIN = {
    dauer: UEBERGANG_MS, ebene: false,
    spiele: function (el, eintrag, ctx) { ctx.klasse(el, "theke-ueb-ein"); }
  };

  // ------------------------------------------------------------------ Zeitgeber (optionen.zeitgeber)
  /** Uhr der Instanz; fehlende Funktionen kommen aus dem Fenster des Dokuments (bzw. global). */
  function baueZeitgeber(z, dok) {
    z = istObjekt(z) ? z : {};
    var ansicht = (dok && dok.defaultView) || (typeof globalThis !== "undefined" ? globalThis : null);
    function wirt(name) { return ansicht && typeof ansicht[name] === "function" ? ansicht : globalThis; }
    return {
      jetzt: typeof z.jetzt === "function" ? function () { return z.jetzt(); } : function () {
        var p = ansicht && ansicht.performance;
        return p && typeof p.now === "function" ? p.now() : Date.now();
      },
      setzeIntervall: typeof z.setzeIntervall === "function" ? function (fn, ms) { return z.setzeIntervall(fn, ms); }
        : function (fn, ms) { return wirt("setInterval").setInterval(fn, ms); },
      loescheIntervall: typeof z.loescheIntervall === "function" ? function (h) { return z.loescheIntervall(h); }
        : function (h) { return wirt("clearInterval").clearInterval(h); },
      nach: typeof z.nach === "function" ? function (fn, ms) { return z.nach(fn, ms); }
        : function (fn, ms) { return wirt("setTimeout").setTimeout(fn, ms); },
      loescheNach: typeof z.loescheNach === "function" ? function (h) { return z.loescheNach(h); }
        : function (h) { return wirt("clearTimeout").clearTimeout(h); }
    };
  }

  // ------------------------------------------------------------------ Instanz
  function erzeuge(container, optionen) {
    if (!container || !container.ownerDocument) throw new TypeError("PizzaTheke.erzeuge: container muss ein DOM-Element sein");
    optionen = optionen || {};
    var dok = container.ownerDocument;
    var sendeFn = typeof optionen.sende === "function" ? optionen.sende : function () {};
    var knoten = new Map();      // id → { el, art, def, listener: [[typ, fn, ziel]], aufraeumen: [fn] }
    var eintragVon = new Map();  // Element → Eintrag (auch Zutaten ohne id – sonst liefe z. B. ein Takt ewig weiter)
    var gewarnt = Object.create(null);
    var imBau = Object.create(null);
    var geschlossen = false, zerstoert = false;
    var titel = "";
    var zeitgeber = baueZeitgeber(optionen.zeitgeber, dok);

    var wurzelEl = dok.createElement("div");
    wurzelEl.className = "theke";
    wurzelEl.setAttribute("tabindex", "-1");   // v4 (K-110): fokussierbar, Tastatur-Listener hängt hier
    wurzelEl.addEventListener("keydown", tastenDruck);
    wurzelEl.addEventListener("click", zeigerKlick);
    var inhalt = dok.createElement("div");
    inhalt.className = "theke-inhalt";
    wurzelEl.appendChild(inhalt);
    // Schwebe-Ebene (v3): deckt den Inhalt ab (auch gescrollt), schneidet ab, fängt keine Klicks, ändert kein Layout.
    var ebene = dok.createElement("div");
    ebene.className = "theke-ebene";
    var laeufe = new Map();       // Element → laufende Animation (eine je Zutat)
    var ebenenLaeufe = [];        // Schwebetexte u. Ä. in Startreihenfolge (höchstens SCHWEBE_MAX); je Lauf anker + platz
    var baumDa = false;
    var neueKinder = null;        // während def.aktualisiere: neu hinzugekommene Kinder eines uebergang-Behälters (K-091)
    container.appendChild(wurzelEl);
    setzeThema(optionen.thema);
    zeigeLeer("Die Theke wird vorbereitet …");

    function setzeThema(t) {
      if (t === "hell" || t === "light") wurzelEl.setAttribute("data-theme", "light");
      else if (t === "dunkel" || t === "dark") wurzelEl.setAttribute("data-theme", "dark");
      else wurzelEl.removeAttribute("data-theme");
    }

    function sende(ereignis) {
      if (zerstoert) return;
      try { sendeFn(ereignis); } catch (e) { warne("sende() hat geworfen:", e); }
    }

    function zeigeLeer(text) {
      inhalt.textContent = "";
      var el = dok.createElement("div");
      el.className = "theke-leer";
      el.textContent = text;
      inhalt.appendChild(el);
      inhalt.appendChild(ebene);
    }

    // -------------------------------------------------------------- v4: Tasten (K-110)
    /** keydown auf der Theke: Tastenname bestimmen, jeder Zutat mit def.taste in Baumreihenfolge zustellen; die
     *  Standardwirkung (Scrollen) nur unterdrücken, wenn eine aktive Tastatur zuhört und nichts im Fenster fokussiert ist. */
    function tastenDruck(e) {
      if (geschlossen || zerstoert || !baumDa) return;
      var name = tastenName(e);
      if (name === null || inEingabe(e.target)) return;
      // K-114: eine Taste gehört genau einem Empfänger. Was ein fokussiertes Bedienelement selbst verarbeitet (Leertaste/Enter
      // klicken es, Pfeile/Pos1/Ende wandern in Reiter/Auswahl – deren Handler haben preventDefault gerufen), erreicht keine Tastatur.
      if (e.defaultPrevented) return;
      if ((name === "Leertaste" || name === "Enter") && e.target !== wurzelEl && bedienelement(e.target)) return;
      var alle = inhalt.querySelectorAll(".theke-zutat"), aktiv = false;
      for (var i = 0; i < alle.length; i++) {
        var en = eintragVon.get(alle[i]);
        if (!en || !en.def.taste) continue;
        try { if (en.def.taste(alle[i], name, en.ctx, e)) aktiv = true; }
        catch (err) { warne("Zutat „" + en.art + "“: taste() fehlgeschlagen:", err); }
      }
      if (aktiv && e.target === wurzelEl && SCROLL_TASTEN.indexOf(name) >= 0) e.preventDefault();
    }
    /** K-114: Nach einem Zeigerklick (Maus/Touch, e.detail > 0) auf ein Bedienelement bleibt der Fokus nicht dort, sondern geht
     *  an die Wurzel – sonst klickte die nächste Leertaste/Enter den Knopf erneut. Tastatur-Aktivierung (detail 0) bleibt unberührt. */
    function zeigerKlick(e) {
      if (zerstoert || !(e.detail > 0) || !bedienelement(e.target)) return;
      if (dok.activeElement === wurzelEl) return;
      try { wurzelEl.focus({ preventScroll: true }); } catch (err) { try { wurzelEl.focus(); } catch (err2) { /* egal */ } }
    }
    /** Beim baum: Wurzel fokussieren, wenn nichts anderes fokussiert ist (nativ sofort; Playground ohne Fokusdiebstahl). */
    function fokussiereWurzel() {
      var a = dok.activeElement;
      if (a && a !== dok.body) return;
      try { wurzelEl.focus({ preventScroll: true }); } catch (e) { try { wurzelEl.focus(); } catch (e2) { /* egal */ } }
    }

    // -------------------------------------------------------------- v3: Animationen & uebergang
    /** prefers-reduced-motion: reduce (WebView2/WebKitGTK melden die OS-Einstellung). Ohne matchMedia (jsdom): nein. */
    function reduziert() {
      var w = dok.defaultView;
      try { return !!(w && typeof w.matchMedia === "function" && w.matchMedia("(prefers-reduced-motion: reduce)").matches); }
      catch (e) { return false; }
    }
    /** Liegt die Zutat sichtbar auf der Theke? (nicht hidden, nicht ausblendend, keine nicht gewählte Reiter-Seite, kein Takt) */
    function gezeigt(el) {
      if (!el || !inhalt.contains(el)) return false;
      for (var n = el; n && n !== inhalt; n = n.parentNode) {
        if (n.nodeType !== 1) continue;
        if (n.hidden || n.classList.contains("theke-reiter-aus") || n.classList.contains("theke-takt") ||
            n.classList.contains("theke-tastatur") || n.classList.contains("theke-ueb-aus")) return false;
      }
      return true;
    }
    /** Lage eines Elements in Ebenen-Koordinaten {x, y, b, h}; ohne Element: Mitte des sichtbaren Fensterausschnitts. */
    function lage(el) {
      var i = inhalt.getBoundingClientRect();
      if (!el) {
        var w = wurzelEl.getBoundingClientRect();
        return { x: w.left + wurzelEl.clientWidth / 2 - i.left, y: w.top + wurzelEl.clientHeight / 2 - i.top, b: 0, h: 0 };
      }
      var r = el.getBoundingClientRect();
      return { x: r.left - i.left, y: r.top - i.top, b: r.width, h: r.height };
    }
    function setzePx(el, name, wert) { el.style.setProperty(name, (Math.round(wert * 10) / 10) + "px"); }

    function beendeLauf(l) {
      if (l.fertig) return;
      l.fertig = true;
      if (l.timer !== null) { try { zeitgeber.loescheNach(l.timer); } catch (e) { /* egal */ } l.timer = null; }
      if (l.ebene) { var k = ebenenLaeufe.indexOf(l); if (k >= 0) ebenenLaeufe.splice(k, 1); }
      else if (laeufe.get(l.el) === l) laeufe.delete(l.el);
      var fns = l.stop.splice(0, l.stop.length);
      for (var i = fns.length - 1; i >= 0; i--) {
        try { fns[i](); } catch (e) { warne("Animation „" + l.art + "“: Aufräumen fehlgeschlagen:", e); }
      }
    }
    function stoppeAlleLaeufe() {
      var alle = ebenenLaeufe.slice();
      laeufe.forEach(function (l) { alle.push(l); });
      for (var i = 0; i < alle.length; i++) beendeLauf(alle[i]);
    }
    /** Kleinster freier Platz (0, 1, 2, …) unter den laufenden Ebenen-Animationen desselben Ankers – wird am Ende wieder frei. */
    function freierPlatz(anker) {
      var belegt = [];
      for (var i = 0; i < ebenenLaeufe.length; i++) if (ebenenLaeufe[i].anker === anker) belegt[ebenenLaeufe[i].platz] = true;
      var p = 0;
      while (belegt[p]) p++;
      return p;
    }

    function animCtx(l, dauer, nummer) {
      return {
        dokument: dok,
        dauer: dauer,
        reduziert: reduziert(),
        /** Platz dieser Ebenen-Animation am selben Anker (0, 1, 2, …; kleinster freier unter den laufenden) – für feste Versätze. */
        nummer: nummer,
        ebene: ebene,
        warne: warne,
        lage: lage,
        /** Sichtbarer Ausschnitt des Fensters in Ebenen-Koordinaten {x0, y0, x1, y1}. */
        sicht: function () {
          var w = wurzelEl.getBoundingClientRect(), i = inhalt.getBoundingClientRect();
          var x0 = w.left + wurzelEl.clientLeft - i.left, y0 = w.top + wurzelEl.clientTop - i.top;
          return { x0: x0, y0: y0, x1: x0 + wurzelEl.clientWidth, y1: y0 + wurzelEl.clientHeight };
        },
        /** Startet die @keyframes-Klasse am Element (gleiche Klasse → Neustart); Dauer als --theke-anim-dauer. */
        klasse: function (ziel, name) {
          ziel.classList.remove(name);
          void ziel.offsetWidth;            // Stil neu berechnen → gleiche Animation startet wirklich neu
          ziel.style.setProperty("--theke-anim-dauer", dauer + "ms");
          ziel.classList.add(name);
          l.stop.push(function () { ziel.classList.remove(name); ziel.style.removeProperty("--theke-anim-dauer"); });
        },
        /** Neues Element in der Ebene, an `wo` ({x, y, b, h}) ausgerichtet; verschwindet am Ende von selbst. */
        teil: function (klasse, wo) {
          var t = dok.createElement("div");
          t.className = klasse;
          wo = wo || lage(null);
          setzePx(t, "--theke-x", wo.x); setzePx(t, "--theke-y", wo.y);
          setzePx(t, "--theke-b", wo.b); setzePx(t, "--theke-h", wo.h);
          t.style.setProperty("--theke-anim-dauer", dauer + "ms");
          ebene.appendChild(t);
          l.stop.push(function () { if (t.parentNode) t.parentNode.removeChild(t); });
          return t;
        },
        /** fn() wird einmal am Ende gerufen (auch beim Ersetzen/Entfernen). */
        beimEnde: function (fn) { if (typeof fn === "function") l.stop.push(fn); }
      };
    }

    function starteAnimation(def, art, el, eintrag, dauer, anker) {
      if (!def.ebene) { var alt = laeufe.get(el); if (alt) beendeLauf(alt); }
      var l = { art: art, el: el, ebene: def.ebene, stop: [], timer: null, fertig: false, anker: anker, platz: 0 };
      var nummer = 0;
      if (def.ebene) {
        while (ebenenLaeufe.length >= SCHWEBE_MAX) beendeLauf(ebenenLaeufe[0]);   // der älteste weicht (sein Platz wird frei)
        nummer = l.platz = freierPlatz(anker);
        ebenenLaeufe.push(l);
      } else {
        laeufe.set(el, l);
      }
      try {
        var r = def.spiele(el, eintrag, animCtx(l, dauer, nummer));
        if (typeof r === "function") l.stop.push(r);
      } catch (e) {
        warne("Animation „" + art + "“: spiele() fehlgeschlagen:", e);
        beendeLauf(l);
        return;
      }
      if (!l.fertig) l.timer = zeitgeber.nach(function () { l.timer = null; beendeLauf(l); }, dauer + NACHLAUF_MS);
    }

    /** aendere.animationen: in Reihenfolge, nach den Änderungen. Unbekannte id / nicht gezeigt / takt → still. */
    function spieleAnimationen(liste) {
      if (liste === undefined) return;
      if (!Array.isArray(liste)) { if (!gewarnt["animationen"]) { gewarnt["animationen"] = true; warne("animationen muss eine Liste sein:", liste); } return; }
      if (geschlossen || !baumDa) return;
      for (var i = 0; i < liste.length; i++) {
        var a = liste[i];
        if (!istObjekt(a)) continue;
        var art = typeof a.art === "string" ? a.art : "";
        var def = animRegistry[art];
        if (!def) {
          if (!gewarnt["animation " + art]) { gewarnt["animation " + art] = true; warne("Unbekannte Animation ignoriert:", art || a.art); }
          continue;
        }
        var el = null, anker = "mitte";
        if (a.id !== undefined && a.id !== null) {
          var e = knoten.get(String(a.id));
          if (!e || !gezeigt(e.el)) continue;
          el = e.el;
          anker = "id " + e.id;
        } else if (!def.ebene) continue;
        if (def.leer && def.leer(a)) continue;   // z. B. schwebe mit leerem Text: nichts zu zeigen (K-093)
        var dauer = typeof a.dauer === "number" && isFinite(a.dauer) ? klemmeDauer(a.dauer) : def.dauer;
        try { starteAnimation(def, art, el, a, dauer, anker); } catch (err) { warne("Animation fehlgeschlagen:", err); }
      }
    }

    /** sichtbar-Wechsel der Zutat; mit uebergang weich. Danach erfährt der Behälter davon (def.kindSichtbar, K-107). */
    function setzeSichtbar(e, an) {
      if (blende(e, e, an)) meldeKindSichtbar(e.el);
    }
    /** Ruft def.kindSichtbar der nächsten umgebenden Zutat (auch über innere Bereiche wie die Reiter-Seitenfläche hinweg). */
    function meldeKindSichtbar(kindEl) {
      for (var p = kindEl.parentNode; p && p !== inhalt; p = p.parentNode) {
        var e = eintragVon.get(p);
        if (!e) continue;
        if (e.def.kindSichtbar) {
          try { e.def.kindSichtbar(p, kindEl, e.ctx); } catch (err) { warne("Zutat „" + e.art + "“: kindSichtbar() fehlgeschlagen:", err); }
        }
        return;
      }
    }
    /** Ein-/Ausblenden eines Ziels {el, ausblenden} der Zutat e (die Zutat selbst oder ein Teil wie der Abschnitt-Inhalt):
     *  hidden; mit uebergang der Zutat weich (Ausblenden: sofort inert + theke-ueb-aus, nach 200 ms hidden). Reduzierte
     *  Bewegung → sofort. Liefert true, wenn sich etwas geändert hat. */
    function blende(e, ziel, an) {
      var el = ziel.el;
      var weich = e.uebergang === true && e.gebaut === true && !reduziert();
      if (ziel.ausblenden !== undefined && ziel.ausblenden !== null) {   // läuft gerade ein Ausblenden?
        if (!an) return false;
        beendeAusblenden(ziel);
        el.hidden = false;
        if (weich) starteAnimation(UEBERGANG_EIN, "uebergang", el, {}, UEBERGANG_MS, null);
        return true;
      }
      if (an === !el.hidden) return false;
      if (an) {
        el.hidden = false;
        if (weich) starteAnimation(UEBERGANG_EIN, "uebergang", el, {}, UEBERGANG_MS, null);
        return true;
      }
      if (!weich) { el.hidden = true; return true; }
      var alt = laeufe.get(el);
      if (alt) beendeLauf(alt);
      el.setAttribute("inert", "");              // sofort nicht mehr bedienbar (zusätzlich: pointer-events none, sende gesperrt)
      var fokus = dok.activeElement;
      if (fokus && fokus !== dok.body && el.contains(fokus) && typeof fokus.blur === "function") fokus.blur();
      el.style.setProperty("--theke-anim-dauer", UEBERGANG_MS + "ms");
      el.classList.add("theke-ueb-aus");
      ziel.ausblenden = zeitgeber.nach(function () {
        ziel.ausblenden = null;
        beendeAusblenden(ziel);
        el.hidden = true;
      }, UEBERGANG_MS + NACHLAUF_MS);
      return true;
    }
    function beendeAusblenden(ziel) {
      if (ziel.ausblenden !== undefined && ziel.ausblenden !== null) { try { zeitgeber.loescheNach(ziel.ausblenden); } catch (err) { /* egal */ } }
      ziel.ausblenden = null;
      ziel.el.classList.remove("theke-ueb-aus");
      ziel.el.removeAttribute("inert");
      ziel.el.style.removeProperty("--theke-anim-dauer");
    }
    /** Teil-Element einer Zutat (z. B. Abschnitt-Inhalt) ein-/ausblenden – gleiche Mechanik wie sichtbar (ctx.blende). */
    function blendeTeil(e, el, an) {
      if (!el || el.nodeType !== 1) return;
      if (!e.teile) e.teile = new Map();
      var ziel = e.teile.get(el);
      if (!ziel) { ziel = { el: el, ausblenden: null }; e.teile.set(el, ziel); }
      blende(e, ziel, an);
    }

    // -------------------------------------------------------------- Knoten bauen / entfernen
    function entferneRekursiv(el) {
      if (!el || el.nodeType !== 1) return;
      var els = [el].concat([].slice.call(el.querySelectorAll(".theke-zutat")));
      for (var i = 0; i < els.length; i++) {
        var e = eintragVon.get(els[i]);
        if (!e) continue;
        eintragVon.delete(els[i]);
        if (e.id !== null && knoten.get(e.id) === e) knoten.delete(e.id);
        raeumeAuf(e);
      }
    }
    /** Einziger Ausgang einer Zutat: Listener lösen, beimEntfernen-Rückrufe (Timer o. Ä.) aufrufen. */
    function raeumeAuf(e) {
      var lauf = e.el ? laeufe.get(e.el) : null;
      if (lauf) beendeLauf(lauf);
      if (e.ausblenden !== undefined && e.ausblenden !== null) { try { zeitgeber.loescheNach(e.ausblenden); } catch (err) { /* egal */ } e.ausblenden = null; }
      if (e.teile) {                             // Teil-Elemente (ctx.blende): Timer und Einblend-Läufe beenden
        e.teile.forEach(function (ziel) {
          if (ziel.ausblenden !== null) { try { zeitgeber.loescheNach(ziel.ausblenden); } catch (err) { /* egal */ } ziel.ausblenden = null; }
          var l = laeufe.get(ziel.el);
          if (l) beendeLauf(l);
        });
        e.teile.clear();
      }
      for (var i = 0; i < e.listener.length; i++) { var l = e.listener[i]; l[2].removeEventListener(l[0], l[1]); }
      e.listener.length = 0;
      var fns = e.aufraeumen.splice(0, e.aufraeumen.length);
      for (var j = 0; j < fns.length; j++) {
        try { fns[j](); } catch (err) { warne("Zutat „" + e.art + "“: beimEntfernen-Rückruf fehlgeschlagen:", err); }
      }
    }

    function platzhalter(k, grund) {
      var el = dok.createElement("div");
      el.className = "theke-platzhalter";
      el.setAttribute("role", "note");
      var kopf = dok.createElement("div");
      kopf.className = "theke-platzhalter-kopf";
      kopf.textContent = grund;
      el.appendChild(kopf);
      return el;
    }

    function ctxFuer(eintrag, id) {
      return {
        dokument: dok,
        id: id,
        /** Sendet {typ, id, ...extra} ans Programm. */
        sende: function (typ, extra) {
          if (geschlossen) return;
          // Ausblendende Zutat (uebergang) ist sofort nicht mehr bedienbar – auch wenn der Browser inert nicht kennt.
          if (eintrag.el && eintrag.el.closest && eintrag.el.closest(".theke-ueb-aus")) return;
          var e = { typ: typ, id: id };
          if (extra) for (var k in extra) if (hat.call(extra, k)) e[k] = extra[k];
          sende(e);
        },
        /** Registriert einen DOM-Listener, der beim Entfernen automatisch gelöst wird. */
        bei: function (typ, fn, ziel) {
          ziel = ziel || eintrag.el;
          if (!ziel) { eintrag.spaeter.push([typ, fn]); return; }
          ziel.addEventListener(typ, fn);
          eintrag.listener.push([typ, fn, ziel]);
        },
        /** Baut ein Kind-Element aus einem Knoten (für eigene Behälter-Zutaten). */
        baue: function (kind) { return baue(kind); },
        /** Ersetzt die Kinder eines Behälters; vorhandene IDs werden wiederverwendet (Fokus bleibt). */
        setzeKinder: function (el, kinder) { setzeKinder(el, kinder, eintrag); },
        /** fn() wird einmal gerufen, wenn die Zutat verschwindet (entfernt, neuer baum, schliesse, zerstoere). */
        beimEntfernen: function (fn) { if (typeof fn === "function") eintrag.aufraeumen.push(fn); },
        /** Teil-Element der Zutat ein-/ausblenden (hidden; mit uebergang der Zutat weich) – wie sichtbar, z. B. Abschnitt-Inhalt. */
        blende: function (el, an) { blendeTeil(eintrag, el, an !== false); },
        /** Uhr der Instanz: { jetzt(), setzeIntervall(fn, ms), loescheIntervall(h) } (optionen.zeitgeber, für Tests). */
        zeitgeber: zeitgeber,
        warne: warne
      };
    }

    function baue(k) {
      if (!istObjekt(k)) {
        warne("Ungültiger Knoten ignoriert:", k);
        return platzhalter(null, "Ungültige Zutat");
      }
      var id = typeof k.id === "string" || typeof k.id === "number" ? String(k.id) : null;
      if (id !== null && imBau[id]) { warne("Zutat enthält sich selbst:", id); return platzhalter(null, "Zutat „" + id + "“ enthält sich selbst"); }
      if (id !== null) imBau[id] = true;
      try { return baueIntern(k, id); } finally { if (id !== null) delete imBau[id]; }
    }

    function baueIntern(k, id) {
      // Bekannte ID ohne Art bzw. mit gleicher Art → vorhandenes Element wiederverwenden und aktualisieren.
      if (id !== null && knoten.has(id)) {
        var alt = knoten.get(id);
        if (k.art === undefined) { aktualisiereEintrag(alt, k); return alt.el; }
        if (k.art === alt.art) { aktualisiereEintrag(alt, mitStandard(k)); return alt.el; }   // K-115: ganzer Zustand
        entferneRekursiv(alt.el);
        if (alt.el.parentNode) alt.el.parentNode.removeChild(alt.el);
      }
      var art = typeof k.art === "string" ? k.art : "";
      var def = registry[art];
      var eintrag = { el: null, id: id, art: art, def: def, listener: [], spaeter: [], aufraeumen: [] };
      var ctx = eintrag.ctx = ctxFuer(eintrag, id);
      var el;
      if (!def) {
        warne("Unbekannte Zutat „" + art + "“ – Platzhalter.");
        el = platzhalter(k, "Unbekannte Zutat „" + (art || "?") + "“");
        eintrag.def = PLATZHALTER_DEF;
        if (Array.isArray(k.kinder)) {
          var kb = dok.createElement("div"); kb.className = "theke-behaelter theke-stapel"; el.appendChild(kb);
          eintrag.kinderEl = kb;
        }
      } else {
        try { el = def.erzeuge(k, ctx); } catch (e) { warne("Zutat „" + art + "“: erzeuge() fehlgeschlagen:", e); el = null; }
        if (!el || el.nodeType !== 1) {
          el = platzhalter(k, "Zutat „" + art + "“ konnte nicht erzeugt werden");
          eintrag.def = PLATZHALTER_DEF;
        }
      }
      eintrag.el = el;
      for (var i = 0; i < eintrag.spaeter.length; i++) ctx.bei(eintrag.spaeter[i][0], eintrag.spaeter[i][1]);
      eintrag.spaeter.length = 0;
      el.classList.add("theke-zutat");
      if (art) el.setAttribute("data-theke-art", art);
      eintragVon.set(el, eintrag);
      if (id !== null) {
        el.setAttribute(ID_ATTR, id);
        knoten.set(id, eintrag);
      }
      aktualisiereEintrag(eintrag, k);
      eintrag.gebaut = true;   // ab jetzt sind sichtbar-/kinder-Wechsel echte Wechsel (uebergang)
      return el;
    }

    function aktualisiereEintrag(e, felder) {
      if (hat.call(felder, "uebergang")) e.uebergang = felder.uebergang === true;
      if (hat.call(felder, "sichtbar")) setzeSichtbar(e, felder.sichtbar !== false);
      if (hat.call(felder, "stil")) wendeStilAn(e.el, felder.stil, e.art);
      if (hat.call(felder, "hinweis")) {
        var h = alsText(felder.hinweis);
        if (h) e.el.setAttribute("title", h); else e.el.removeAttribute("title");
      }
      if (hat.call(felder, "marke")) {
        // v6 (K-124): die Marke zeigt der Reiter am Tab dieser Seite; sonst wird sie nur gemerkt
        var m = alsText(felder.marke);
        if (m !== (e.el.getAttribute("data-theke-marke") || "")) {
          if (m) e.el.setAttribute("data-theke-marke", m); else e.el.removeAttribute("data-theke-marke");
          if (e.gebaut) meldeKindSichtbar(e.el);
        }
      }
      var def = e.def;
      if (def.felder) {
        for (var f in felder) {
          if (!hat.call(felder, f) || ALLGEMEINE_FELDER.indexOf(f) >= 0 || def.felder.indexOf(f) >= 0) continue;
          var schl = e.art + "." + f;
          if (!gewarnt[schl]) { gewarnt[schl] = true; warne("Unbekanntes Feld ignoriert:", schl); }
        }
      }
      var aussen = neueKinder;
      neueKinder = [];
      try { def.aktualisiere(e.el, felder, e.ctx); }
      catch (err) { warne("Zutat „" + e.art + "“: aktualisiere() fehlgeschlagen:", err); }
      var einblenden = neueKinder;
      neueKinder = aussen;
      // Erst jetzt ist der Behälter fertig (z. B. hat reiter die nicht gewählten Seiten markiert): nur gezeigte Kinder blenden ein.
      for (var n = 0; n < einblenden.length; n++) {
        if (eintragVon.has(einblenden[n]) && gezeigt(einblenden[n])) starteAnimation(UEBERGANG_EIN, "uebergang", einblenden[n], {}, UEBERGANG_MS, null);
      }
    }

    var PLATZHALTER_DEF = {
      felder: null,
      aktualisiere: function (el, f, ctx) {
        var e = el.getAttribute(ID_ATTR) !== null ? knoten.get(el.getAttribute(ID_ATTR)) : null;
        var kb = e && e.kinderEl;
        if (kb && hat.call(f, "kinder")) setzeKinder(kb, f.kinder);
      }
    };

    /** besitzer: Eintrag der Behälter-Zutat (für uebergang: neu hinzugekommene Kinder blenden ein, nicht im ersten Bau). */
    function setzeKinder(el, kinder, besitzer) {
      if (!Array.isArray(kinder)) { warne("kinder muss eine Liste sein:", kinder); return; }
      var vorher = [].slice.call(el.children);
      var neu = [];
      for (var i = 0; i < kinder.length; i++) {
        var c = baue(kinder[i]);
        if (neu.indexOf(c) >= 0) { warne("Zutat mehrfach im Baum:", kinder[i] && kinder[i].id); continue; }
        neu.push(c);
      }
      // Erst die neuen Kinder einsortieren (verschiebt wiederverwendete Elemente), dann Reste abmelden.
      for (var m = 0; m < neu.length; m++) {
        if (el.children[m] !== neu[m]) el.insertBefore(neu[m], el.children[m] || null);
      }
      var rest = [].slice.call(el.children, neu.length);
      for (var j = 0; j < rest.length; j++) { entferneRekursiv(rest[j]); el.removeChild(rest[j]); }
      if (besitzer && besitzer.uebergang === true && besitzer.gebaut === true && neueKinder && !reduziert()) {
        for (var n = 0; n < neu.length; n++) {
          if (vorher.indexOf(neu[n]) < 0) neueKinder.push(neu[n]);   // Einblenden startet nach def.aktualisiere (aktualisiereEintrag)
        }
      }
    }

    function leereAlles() {
      stoppeAlleLaeufe();
      baumDa = false;
      var alle = [];
      eintragVon.forEach(function (e) { alle.push(e); });
      eintragVon.clear();
      knoten.clear();
      for (var i = 0; i < alle.length; i++) raeumeAuf(alle[i]);
      inhalt.textContent = "";
      ebene.textContent = "";
      inhalt.appendChild(ebene);
    }

    // -------------------------------------------------------------- Operationen
    var OPS = {
      fenster: function (n) {
        if (hat.call(n, "titel")) titel = alsText(n.titel);
        geschlossen = false;
        wurzelEl.classList.remove("theke-geschlossen");
        var info = { titel: titel };
        if (typeof n.breite === "number" && isFinite(n.breite)) info.breite = n.breite;
        if (typeof n.hoehe === "number" && isFinite(n.hoehe)) info.hoehe = n.hoehe;
        if (info.breite) wurzelEl.style.setProperty("--theke-fenster-breite", info.breite + "px");
        if (info.hoehe) wurzelEl.style.setProperty("--theke-fenster-hoehe", info.hoehe + "px");
        if (titel) wurzelEl.setAttribute("aria-label", titel); else wurzelEl.removeAttribute("aria-label");
        if (typeof optionen.fenster === "function") {
          try { optionen.fenster(info); } catch (e) { warne("fenster() hat geworfen:", e); }
        }
      },
      baum: function (n) {
        geschlossen = false;
        wurzelEl.classList.remove("theke-geschlossen");
        leereAlles();
        if (!istObjekt(n.wurzel)) { warne("baum ohne wurzel"); zeigeLeer("Die Theke ist leer."); return; }
        inhalt.insertBefore(baue(n.wurzel), ebene);
        baumDa = true;
        fokussiereWurzel();
      },
      aendere: function (n) {
        var liste = n.aenderungen;
        if (!Array.isArray(liste)) { warne("aendere ohne aenderungen-Liste"); liste = []; }
        for (var i = 0; i < liste.length; i++) {
          var a = liste[i];
          if (!istObjekt(a) || a.id === undefined || a.id === null) { warne("Ungültige Änderung ignoriert:", a); continue; }
          var e = knoten.get(String(a.id));
          if (!e) { warne("Änderung für unbekannte Zutat ignoriert:", a.id); continue; }
          try { aktualisiereEintrag(e, a); } catch (err) { warne("Änderung fehlgeschlagen:", err); }
        }
        // v3: erst alle Änderungen, dann die Animationen (eine Nachricht = ein Bild; einblenden auf ein neues Kind wirkt).
        spieleAnimationen(n.animationen);
      },
      schliesse: function () {
        schliesseIntern();
        if (typeof optionen.geschlossen === "function") {
          try { optionen.geschlossen(); } catch (e) { warne("geschlossen() hat geworfen:", e); }
        }
      }
    };

    function schliesseIntern() {
      geschlossen = true;
      leereAlles();
      wurzelEl.classList.add("theke-geschlossen");
      zeigeLeer("Die Theke ist geschlossen.");
    }

    function empfange(nachricht) {
      if (zerstoert) return;
      try {
        var n = nachricht;
        if (typeof n === "string") {
          try { n = JSON.parse(n); } catch (e) { warne("Nachricht ist kein gültiges JSON:", e && e.message); return; }
        }
        if (!istObjekt(n)) { warne("Nachricht ist kein Objekt:", n); return; }
        if (typeof n.v === "number" && n.v > VERSION) warne("Protokollversion " + n.v + " > " + VERSION + " – versuche es trotzdem.");
        if (typeof n.op !== "string" || !hat.call(OPS, n.op)) { warne("Unbekannte Operation ignoriert:", n.op); return; }
        OPS[n.op](n);
      } catch (e) {
        warne("Nachricht konnte nicht verarbeitet werden:", e);
      }
    }

    return {
      element: wurzelEl,
      empfange: empfange,
      /** Von der Einbettung zu rufen, wenn der Nutzer das Fenster schließt. Sendet einmalig {"typ":"geschlossen"}. */
      schliessen: function () {
        if (zerstoert || geschlossen) return;
        schliesseIntern();
        sende({ typ: "geschlossen" });
      },
      setzeThema: setzeThema,
      titel: function () { return titel; },
      zerstoere: function () {
        if (zerstoert) return;
        leereAlles();
        zerstoert = true;
        wurzelEl.removeEventListener("keydown", tastenDruck);
        wurzelEl.removeEventListener("click", zeigerKlick);
        if (wurzelEl.parentNode) wurzelEl.parentNode.removeChild(wurzelEl);
      }
    };
  }

  return {
    version: VERSION,
    erzeuge: erzeuge,
    registriere: registriere,
    arten: zutatArten,
    registriereAnimation: registriereAnimation,
    animationsArten: animationsArten
  };
});
