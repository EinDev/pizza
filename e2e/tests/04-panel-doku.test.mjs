// Seitenpanel & Doku: Strg+B, Inhaltsverzeichnis, Scroll-Spy, Suche, details, Bilder, Lightbox, Lesemodus, „Öffnen & backen“.
import assert from "node:assert/strict";
import {
  e2e, strg, zeigePanelTab, setzePanel, panelOffen, warteLaufEnde, konsolenAusgabe, exitBadge, EXIT_TEXT, editorTabs, schlafe, bereit,
} from "../hilfen.mjs";

const P = "#doku-panel";

async function dokuBereit(page, wurzel = P) {
  await page.waitForSelector(wurzel + " .doku-artikel .doku-abschnitt");
  await page.waitForSelector(wurzel + " .toc-eintrag[aria-current]");
}

e2e("Strg+B schaltet das Seitenpanel um (und merkt es sich)", async ({ page, oeffne }) => {
  await oeffne();
  assert.equal(await panelOffen(page), true, "am Desktop standardmäßig offen");
  await page.focus("#editor .cm-content");
  await strg(page, "KeyB");
  assert.equal(await panelOffen(page), false);
  const zu = await page.evaluate(() => ({
    klasse: document.getElementById("arbeitsbereich").classList.contains("panel-zu"),
    inert: document.getElementById("panel").inert,
    gemerkt: localStorage.getItem("pizza.panel"),
  }));
  assert.deepEqual(zu, { klasse: true, inert: true, gemerkt: "0" });
  // Editor wird breiter
  await page.reload({ waitUntil: "load" });
  await bereit(page);
  assert.equal(await panelOffen(page), false, "Zustand überlebt Reload");
  await page.focus("#editor .cm-content");
  await strg(page, "KeyB");
  assert.equal(await panelOffen(page), true);
  // Schließen-Knopf im Panel
  await page.click("#panel-schliessen");
  assert.equal(await panelOffen(page), false);
});

e2e("Doku: Inhaltsverzeichnis, Klick springt, Scroll-Spy folgt", async ({ page, oeffne }) => {
  await oeffne();
  await zeigePanelTab(page, "doku");
  await dokuBereit(page);
  const info = await page.evaluate((p) => ({
    abschnitte: document.querySelectorAll(p + " .doku-abschnitt").length,
    toc: document.querySelectorAll(p + " .toc-eintrag").length,
    gruppen: [...document.querySelectorAll(p + " .toc-gruppe-titel")].map((g) => g.textContent),
    daten: self.PIZZA_DOKU.length,
  }), P);
  assert.equal(info.abschnitte, info.daten, "jeder Doku-Abschnitt wird gerendert");
  assert.equal(info.toc, info.abschnitte, "jeder Abschnitt im Inhaltsverzeichnis");
  assert.ok(info.gruppen.length >= 3, "Gruppen: " + info.gruppen.join(", "));

  // Klick auf einen späten TOC-Eintrag
  const ziel = await page.$$eval(P + " .toc-eintrag", (l) => l[Math.floor(l.length * 0.7)].dataset.id);
  await page.$eval(`${P} .toc-eintrag[data-id="${ziel}"]`, (a) => a.click());
  await page.waitForFunction((p, id) => document.querySelector(`${p} .toc-eintrag[aria-current]`).dataset.id === id, {}, P, ziel);
  const lage = await page.evaluate((p, id) => {
    const art = document.querySelector(p + " .doku-artikel");
    const sek = art.querySelector(`.doku-abschnitt[data-id="${id}"]`);
    return { oben: sek.getBoundingClientRect().top - art.getBoundingClientRect().top, fokus: document.activeElement.closest(".doku-abschnitt")?.dataset.id };
  }, P, ziel);
  assert.ok(Math.abs(lage.oben) < 40, "Abschnitt steht oben im Artikel: " + lage.oben);
  assert.equal(lage.fokus, ziel, "Überschrift bekommt den Fokus");
  assert.equal(await page.evaluate(() => localStorage.getItem("pizza.doku")), ziel, "Position gemerkt");

  // Scroll-Spy: manuell zu einem anderen Abschnitt scrollen
  await schlafe(750); // Spy-Sperre nach Sprung
  const spy = await page.$$eval(P + " .doku-abschnitt", (s) => s[3].dataset.id);
  await page.$eval(`${P} .doku-artikel`, (art, id) => {
    const sek = art.querySelector(`.doku-abschnitt[data-id="${id}"]`);
    art.scrollTop = sek.offsetTop + 10;
  }, spy);
  await page.waitForFunction((p, id) => document.querySelector(`${p} .toc-eintrag[aria-current]`).dataset.id === id, { timeout: 3000 }, P, spy);
  // ganz nach unten → letzter Abschnitt aktiv
  await page.$eval(`${P} .doku-artikel`, (art) => { art.scrollTop = art.scrollHeight; });
  const letzter = await page.$$eval(P + " .doku-abschnitt", (s) => s[s.length - 1].dataset.id);
  await page.waitForFunction((p, id) => document.querySelector(`${p} .toc-eintrag[aria-current]`).dataset.id === id, { timeout: 3000 }, P, letzter);
});

e2e("Doku: Suche filtert, markiert Treffer, öffnet passende details; Esc leert", async ({ page, oeffne }) => {
  await oeffne();
  await zeigePanelTab(page, "doku");
  await dokuBereit(page);
  const gesamt = await page.$$eval(P + " .doku-abschnitt", (s) => s.length);
  await page.click(P + " .doku-suche input");
  await page.keyboard.type("lieferung");
  await page.waitForSelector(P + " .such-info");
  const r = await page.evaluate((p) => ({
    info: document.querySelector(p + " .such-info").textContent,
    abschnitte: document.querySelectorAll(p + " .doku-abschnitt").length,
    marks: document.querySelectorAll(p + " .doku-artikel mark.such-treffer").length,
    tocMarks: document.querySelectorAll(p + " .toc-liste mark").length,
    detailsMitTrefferZu: [...document.querySelectorAll(p + " details")].filter((d) => d.querySelector("mark") && !d.open).length,
  }), P);
  assert.ok(r.abschnitte > 0 && r.abschnitte < gesamt, `gefiltert: ${r.abschnitte} von ${gesamt}`);
  assert.match(r.info, new RegExp(`^${r.abschnitte} von ${gesamt} Abschnitten`));
  assert.ok(r.marks > 0, "Treffer markiert");
  assert.equal(r.detailsMitTrefferZu, 0, "details mit Treffern sind aufgeklappt");

  // Keine Treffer
  await page.keyboard.type("xyzzy-gibtsnicht");
  await page.waitForSelector(P + " .toc-leer");
  assert.match(await page.$eval(P + " .nav-leer", (e) => e.textContent), /Nichts gefunden/);

  // Esc leert die Suche
  await page.keyboard.press("Escape");
  await page.waitForFunction((p, n) => !document.querySelector(p + " .such-info") && document.querySelectorAll(p + " .doku-abschnitt").length === n, {}, P, gesamt);
  assert.equal(await page.$eval(P + " .doku-suche input", (i) => i.value), "");
});

e2e("Doku: details aufklappbar, „kurz“-Box vorhanden", async ({ page, oeffne }) => {
  await oeffne();
  await zeigePanelTab(page, "doku");
  await dokuBereit(page);
  const anzahl = await page.$$eval(P + " details.doku-details", (d) => d.length);
  assert.ok(anzahl > 5, "details-Blöcke: " + anzahl);
  assert.equal(await page.$$eval(P + " details.doku-details[open]", (d) => d.length), 0, "standardmäßig zugeklappt");
  const sel = P + " details.doku-details";
  await page.$eval(sel, (d) => d.scrollIntoView({ block: "center" }));
  // Sichtbarkeit über checkVisibility (Chrome rendert zugeklappten Inhalt mit content-visibility: hidden)
  const sichtbar = () => page.$eval(sel + " .details-inhalt", (e) => e.checkVisibility());
  const vorher = await sichtbar();
  await page.click(sel + " > summary");
  assert.equal(await page.$eval(sel, (d) => d.open), true);
  assert.equal(vorher, false, "zugeklappt unsichtbar");
  assert.equal(await sichtbar(), true, "aufgeklappt sichtbar");
  await page.click(sel + " > summary");
  assert.equal(await page.$eval(sel, (d) => d.open), false);
  assert.ok(await page.$$eval(P + " .doku-kurz", (k) => k.length) >= 10);
});

e2e("Doku: alle Bilder laden (kein 404), Lightbox öffnet und schließt", async ({ page, oeffne }) => {
  await oeffne();
  await zeigePanelTab(page, "doku");
  await dokuBereit(page);
  const bilder = await page.$$eval(P + " .doku-bild img", (i) => i.map((x) => x.getAttribute("src")));
  assert.ok(bilder.length >= 20, "Doku-Bilder: " + bilder.length);
  // alle Quellen erreichbar und SVG
  const status = await page.evaluate(async (liste) => Promise.all([...new Set(liste)].map(async (s) => {
    const r = await fetch(s);
    return [s, r.status, r.headers.get("content-type")];
  })), bilder);
  for (const [s, st, typ] of status) {
    assert.equal(st, 200, s);
    assert.match(typ, /^image\//, s);
  }
  // jedes Bild wirklich dekodiert (lazy: einzeln in den Blick scrollen). Bilder in zugeklappten
  // <details> lädt der Browser erst nach dem Aufklappen – also wie ein Nutzer erst aufklappen.
  const n = bilder.length;
  for (let i = 0; i < n; i++) {
    await page.$$eval(P + " .doku-bild img", (imgs, k) => {
      for (let d = imgs[k].closest("details"); d; d = d.parentElement.closest("details")) d.open = true;
      imgs[k].scrollIntoView({ block: "center" });
    }, i);
    await page.waitForFunction((p, k) => { const im = document.querySelectorAll(p + " .doku-bild img")[k]; return im.complete && im.naturalWidth > 0; }, { timeout: 5000 }, P, i);
  }
  assert.equal(await page.$$eval(P + " figure.doku-bild[hidden]", (f) => f.length), 0, "kein Bild per onerror versteckt");

  // Lightbox
  const knopf = (await page.$$(P + " .doku-bild .bild-knopf"))[0];
  await knopf.evaluate((k) => k.scrollIntoView({ block: "center" }));
  const src = await knopf.$eval("img", (i) => i.getAttribute("src"));
  await knopf.click();
  await page.waitForSelector("#bild-lightbox[open]");
  await page.waitForFunction(() => { const i = document.getElementById("lightbox-bild"); return i.complete && i.naturalWidth > 0; });
  assert.ok((await page.$eval("#lightbox-bild", (i) => i.src)).endsWith(src));
  assert.notEqual(await page.$eval("#lightbox-text", (e) => e.textContent.trim()), "", "Bildunterschrift/Alt-Text gesetzt");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("bild-lightbox").open);
  await knopf.click();
  await page.waitForSelector("#bild-lightbox[open]");
  await page.click("#lightbox-zu");
  await page.waitForFunction(() => !document.getElementById("bild-lightbox").open);
});

e2e("Doku: Lesemodus-Popup mit eigenem Inhaltsverzeichnis, „Öffnen & backen“ daraus schließt es", async ({ page, oeffne }) => {
  await oeffne();
  await zeigePanelTab(page, "doku");
  await dokuBereit(page);
  await page.click("#knopf-lesemodus");
  await page.waitForSelector("#doku-lesemodus[open]");
  await dokuBereit(page, "#doku-modal");
  const m = await page.evaluate(() => {
    const d = document.getElementById("doku-lesemodus").getBoundingClientRect();
    return { w: d.width, h: d.height, toc: document.querySelectorAll("#doku-modal .toc-eintrag").length, vw: innerWidth };
  });
  assert.ok(m.w > m.vw * 0.6, "Lesemodus ist groß: " + JSON.stringify(m));
  assert.ok(m.toc > 10);
  // Esc schließt
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("doku-lesemodus").open);
  // wieder öffnen, X schließt
  await page.click("#knopf-lesemodus");
  await page.waitForSelector("#doku-lesemodus[open]");
  await page.click("#lesemodus-zu");
  await page.waitForFunction(() => !document.getElementById("doku-lesemodus").open);
  // wieder öffnen, „Öffnen & backen“
  await page.click("#knopf-lesemodus");
  await page.waitForSelector("#doku-lesemodus[open]");
  const tabsVorher = (await editorTabs(page)).length;
  await page.$eval("#doku-modal .doku-code .icon-knopf.primaer", (k) => { k.scrollIntoView({ block: "center" }); k.click(); });
  await page.waitForFunction(() => !document.getElementById("doku-lesemodus").open);
  await warteLaufEnde(page);
  assert.equal((await editorTabs(page)).length, tabsVorher + 1);
  assert.equal((await exitBadge(page)).text, EXIT_TEXT[0]);
  // Lesemodus-Knopf nur im Doku-Tab sichtbar
  await zeigePanelTab(page, "beispiele");
  assert.equal(await page.$eval("#knopf-lesemodus", (k) => k.hidden), true);
});

e2e("Doku: „Im Editor öffnen“ und „Öffnen & backen“ aus dem Panel", async ({ page, oeffne }) => {
  await oeffne();
  await zeigePanelTab(page, "doku");
  await dokuBereit(page);
  // Abschnitt mit Code + erwarteter Ausgabe direkt danach suchen
  const ziel = await page.$$eval(P + " .doku-abschnitt", (secs) => {
    for (const s of secs) {
      const figs = [...s.querySelectorAll(":scope > .doku-code")];
      for (const f of figs) {
        if (f.querySelector(".icon-knopf.primaer") && f.nextElementSibling && f.nextElementSibling.classList.contains("doku-ausgabe")) {
          return { id: s.dataset.id, titel: s.querySelector(".doku-titel").textContent, ausgabe: f.nextElementSibling.querySelector("pre").textContent, code: f.querySelector("pre").textContent };
        }
      }
    }
    return null;
  });
  assert.ok(ziel, "Abschnitt mit Code + Ausgabe gefunden");
  const fig = `${P} .doku-abschnitt[data-id="${ziel.id}"] > .doku-code`;
  // Öffnen (ohne Backen)
  await page.$eval(fig + ' .icon-knopf[aria-label="In neuem Editor-Tab öffnen"]', (k) => { k.scrollIntoView({ block: "center" }); k.click(); });
  const tab = (await editorTabs(page)).find((t) => t.aktiv);
  assert.ok(tab.name.endsWith(".pizza"));
  assert.equal(await page.$eval("#exit-badge", (b) => b.hidden), true, "nur öffnen, nicht backen");
  // Öffnen & backen → gleicher Tab (gleicher Schlüssel), Lauf mit erwarteter Ausgabe
  await page.$eval(fig + " .icon-knopf.primaer", (k) => { k.scrollIntoView({ block: "center" }); k.click(); });
  await warteLaufEnde(page);
  assert.equal((await editorTabs(page)).filter((t) => t.name === tab.name).length, 1, "kein doppelter Tab");
  assert.equal((await konsolenAusgabe(page)).trimEnd(), ziel.ausgabe.trimEnd());
});

e2e("Doku-Layout: im schmalen Panel steht das Inhaltsverzeichnis oben, der Artikel nutzt die volle Breite", async ({ page, oeffne }) => {
  await oeffne();
  await zeigePanelTab(page, "doku");
  await dokuBereit(page);
  const m = await page.evaluate((p) => {
    const box = (q) => { const r = document.querySelector(q).getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, r: r.right }; };
    return { panel: box(p), toc: box(p + " .doku-toc"), art: box(p + " .doku-artikel") };
  }, P);
  assert.ok(m.panel.w < 600, "Testannahme: Panel ist schmal (" + m.panel.w + ")");
  assert.ok(m.art.w >= m.panel.w * 0.8, `Artikel zu schmal: ${Math.round(m.art.w)} von ${Math.round(m.panel.w)} px (Container-Query greift nicht?)`);
  assert.ok(m.toc.h < m.panel.h * 0.3 && m.toc.t <= m.art.t, "Inhaltsverzeichnis als Leiste über dem Artikel");
  assert.ok(m.art.r <= m.panel.r + 1, "Artikel ragt nicht aus dem Panel");
});
