/* pizza v3.0 – Theke: Render-Engine des UI-Frameworks (THEKE.md, Protokoll v1).
 *
 *   var t = PizzaTheke.erzeuge(container, { sende: function (ereignis) {}, thema: "auto", fenster: function (info) {} });
 *   t.empfange(nachricht);   // Objekt oder JSON-String (Programm → Renderer)
 *   t.schliessen();          // Einbettung schließt das Fenster → sendet einmalig {"typ":"geschlossen"}
 *   t.zerstoere();           // räumt Listener und DOM auf (sendet nichts)
 *
 *   PizzaTheke.registriere(art, { erzeuge: function (knoten, ctx) { return element; },
 *                                 aktualisiere: function (element, felder, ctx) {},
 *                                 felder?: ["text", …] });   // bekannte Felder (sonst einmalige Warnung)
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
                   ende: "ende", rechts: "ende", unten: "ende", strecken: "strecken" }
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
      } else if (k === "ausrichtung") {
        if (weg) { setzeKlasse(el, "theke-ausrichtung-", null); continue; }
        if (!hat.call(STIL.ausrichtung, w)) { warne("Ungültiger Wert für stil.ausrichtung:", w); continue; }
        setzeKlasse(el, "theke-ausrichtung-", STIL.ausrichtung[w]);
      } else {
        warne("Unbekannter Stil-Schlüssel ignoriert (" + art + "):", k);
      }
    }
  }

  // ------------------------------------------------------------------ Zutaten-Registry
  var registry = Object.create(null);
  var ALLGEMEINE_FELDER = ["id", "art", "stil", "sichtbar", "hinweis"];

  function registriere(art, def) {
    if (typeof art !== "string" || !art) throw new TypeError("PizzaTheke.registriere: art muss ein nicht-leerer String sein");
    if (!def || typeof def.erzeuge !== "function") throw new TypeError("PizzaTheke.registriere: erzeuge(knoten, ctx) fehlt");
    registry[art] = {
      erzeuge: def.erzeuge,
      aktualisiere: typeof def.aktualisiere === "function" ? def.aktualisiere : function () {},
      felder: Array.isArray(def.felder) ? def.felder.slice() : null
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
      ctx.bei("click", function () { if (!el.disabled) ctx.sende("klick"); });
      return el;
    },
    aktualisiere: function (el, f) {
      textFeld(el, f);
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

  // ---- abschnitt: Karte mit Überschrift, Inhalt als Stapel
  registriere("abschnitt", {
    felder: ["titel", "kinder"],
    erzeuge: function (k, ctx) {
      var d = ctx.dokument;
      var el = d.createElement("section");
      el.className = "theke-abschnitt";
      var kopf = d.createElement("h3"); kopf.className = "theke-abschnitt-titel"; kopf.hidden = true;
      var inhalt = d.createElement("div"); inhalt.className = "theke-behaelter theke-stapel theke-abschnitt-inhalt";
      el.appendChild(kopf); el.appendChild(inhalt);
      return el;
    },
    aktualisiere: function (el, f, ctx) {
      if (hat.call(f, "titel")) {
        var t = alsText(f.titel);
        el.children[0].textContent = t;
        el.children[0].hidden = t === "";
      }
      if (hat.call(f, "kinder")) ctx.setzeKinder(el.children[1], f.kinder);
    }
  });

  // ---- tabelle: spalten + zeilen (Texte), Zahlenspalten rechtsbündig
  var tabellenZustand = new WeakMap();
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
  function zeichneTabelle(el, z, d) {
    var tab = el.firstChild, kopf = tab.tHead, rumpf = tab.tBodies[0];
    var n = z.spalten.length, s, r;
    for (r = 0; r < z.zeilen.length; r++) n = Math.max(n, z.zeilen[r].length);
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
        th.textContent = s < z.spalten.length ? z.spalten[s] : "";
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
        td.textContent = s < z.zeilen[r].length ? z.zeilen[r][s] : "";
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
        var n = leiste.children.length, jetzt = reiterAktuell(z);
        if (!n || !tabVon(e.target)) return;
        var ziel = e.key === "ArrowRight" ? jetzt % n + 1 : e.key === "ArrowLeft" ? (jetzt + n - 2) % n + 1
          : e.key === "Home" ? 1 : e.key === "End" ? n : 0;
        if (!ziel) return;
        e.preventDefault();
        waehleReiter(z, ziel, true);
      }, leiste);
      return el;
    },
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
  /** Gewählte Seite, auf 1…n geklemmt (gewaehlt bleibt roh gespeichert, falls später Seiten dazukommen). */
  function reiterAktuell(z) { return Math.max(1, Math.min(z.gewaehlt, reiterAnzahl(z))); }
  function zeichneReiter(z) {
    var d = z.ctx.dokument, n = reiterAnzahl(z), g = reiterAktuell(z), i;
    while (z.leiste.children.length > n) z.leiste.removeChild(z.leiste.lastChild);
    while (z.leiste.children.length < n) {
      var b = d.createElement("button");
      b.type = "button";
      b.className = "theke-reiter-tab";
      b.setAttribute("role", "tab");
      z.leiste.appendChild(b);
    }
    for (i = 0; i < n; i++) {
      var tab = z.leiste.children[i], an = i + 1 === g;
      var t = i < z.titel.length && z.titel[i] !== "" ? z.titel[i] : "Seite " + (i + 1);
      if (tab.textContent !== t) tab.textContent = t;
      tab.setAttribute("data-theke-nr", String(i + 1));
      tab.setAttribute("aria-selected", an ? "true" : "false");
      tab.tabIndex = an ? 0 : -1;
      tab.classList.toggle("theke-reiter-tab-an", an);
    }
    var seiten = z.seiten.children;
    for (i = 0; i < seiten.length; i++) seiten[i].classList.toggle("theke-reiter-aus", i + 1 !== g);
    if (n) z.seiten.setAttribute("aria-label", z.leiste.children[g - 1].textContent); else z.seiten.removeAttribute("aria-label");
  }
  /** Nutzer wählt Seite nr: sofort lokal umschalten, dann (nur bei echter Änderung) aenderung senden. */
  function waehleReiter(z, nr, fokus) {
    var n = reiterAnzahl(z);
    if (!(nr >= 1 && nr <= n)) return;
    var vorher = reiterAktuell(z);
    z.gewaehlt = nr;
    zeichneReiter(z);
    if (fokus && z.leiste.children[nr - 1]) z.leiste.children[nr - 1].focus();
    if (nr !== vorher) z.ctx.sende("aenderung", { wert: nr });
  }

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
        : function (h) { return wirt("clearInterval").clearInterval(h); }
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
    var inhalt = dok.createElement("div");
    inhalt.className = "theke-inhalt";
    wurzelEl.appendChild(inhalt);
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
        setzeKinder: function (el, kinder) { setzeKinder(el, kinder); },
        /** fn() wird einmal gerufen, wenn die Zutat verschwindet (entfernt, neuer baum, schliesse, zerstoere). */
        beimEntfernen: function (fn) { if (typeof fn === "function") eintrag.aufraeumen.push(fn); },
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
        if (k.art === undefined || k.art === alt.art) { aktualisiereEintrag(alt, k); return alt.el; }
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
      return el;
    }

    function aktualisiereEintrag(e, felder) {
      if (hat.call(felder, "sichtbar")) e.el.hidden = felder.sichtbar === false;
      if (hat.call(felder, "stil")) wendeStilAn(e.el, felder.stil, e.art);
      if (hat.call(felder, "hinweis")) {
        var h = alsText(felder.hinweis);
        if (h) e.el.setAttribute("title", h); else e.el.removeAttribute("title");
      }
      var def = e.def;
      if (def.felder) {
        for (var f in felder) {
          if (!hat.call(felder, f) || ALLGEMEINE_FELDER.indexOf(f) >= 0 || def.felder.indexOf(f) >= 0) continue;
          var schl = e.art + "." + f;
          if (!gewarnt[schl]) { gewarnt[schl] = true; warne("Unbekanntes Feld ignoriert:", schl); }
        }
      }
      try { def.aktualisiere(e.el, felder, e.ctx); }
      catch (err) { warne("Zutat „" + e.art + "“: aktualisiere() fehlgeschlagen:", err); }
    }

    var PLATZHALTER_DEF = {
      felder: null,
      aktualisiere: function (el, f, ctx) {
        var e = el.getAttribute(ID_ATTR) !== null ? knoten.get(el.getAttribute(ID_ATTR)) : null;
        var kb = e && e.kinderEl;
        if (kb && hat.call(f, "kinder")) setzeKinder(kb, f.kinder);
      }
    };

    function setzeKinder(el, kinder) {
      if (!Array.isArray(kinder)) { warne("kinder muss eine Liste sein:", kinder); return; }
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
    }

    function leereAlles() {
      var alle = [];
      eintragVon.forEach(function (e) { alle.push(e); });
      eintragVon.clear();
      knoten.clear();
      for (var i = 0; i < alle.length; i++) raeumeAuf(alle[i]);
      inhalt.textContent = "";
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
        inhalt.appendChild(baue(n.wurzel));
      },
      aendere: function (n) {
        if (!Array.isArray(n.aenderungen)) { warne("aendere ohne aenderungen-Liste"); return; }
        for (var i = 0; i < n.aenderungen.length; i++) {
          var a = n.aenderungen[i];
          if (!istObjekt(a) || a.id === undefined || a.id === null) { warne("Ungültige Änderung ignoriert:", a); continue; }
          var e = knoten.get(String(a.id));
          if (!e) { warne("Änderung für unbekannte Zutat ignoriert:", a.id); continue; }
          try { aktualisiereEintrag(e, a); } catch (err) { warne("Änderung fehlgeschlagen:", err); }
        }
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
        if (wurzelEl.parentNode) wurzelEl.parentNode.removeChild(wurzelEl);
      }
    };
  }

  return {
    version: VERSION,
    erzeuge: erzeuge,
    registriere: registriere,
    arten: zutatArten
  };
});
