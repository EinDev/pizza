"use strict";
// Kleiner XML-Wohlgeformtheits-Check (ohne Abhängigkeiten).
// Prüft: Tags paarweise verschachtelt, genau ein Wurzelelement, Attribute gequotet und eindeutig,
// gültige Entities, Kommentare/CDATA/PI geschlossen. Liefert [] oder Liste von Fehlermeldungen.

const NAME = /^[A-Za-z_:][\w.:\-]*/;
const ENTITY = /^&(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/;

function zeileVon(s, i) {
  let z = 1;
  for (let k = 0; k < i && k < s.length; k++) if (s.charCodeAt(k) === 10) z++;
  return z;
}

function pruefeText(s, von, bis, fehler) {
  for (let i = s.indexOf("&", von); i !== -1 && i < bis; i = s.indexOf("&", i + 1)) {
    if (!ENTITY.test(s.slice(i, i + 12))) fehler.push(`Zeile ${zeileVon(s, i)}: ungültige Entity/nacktes '&'`);
  }
}

function wohlgeformt(src) {
  const s = src.replace(/^﻿/, "");
  const fehler = [];
  const stapel = [];
  let wurzeln = 0;
  let i = 0;
  const n = s.length;
  while (i < n && fehler.length < 10) {
    const lt = s.indexOf("<", i);
    const textEnde = lt === -1 ? n : lt;
    // Text zwischen Tags
    if (textEnde > i) {
      const text = s.slice(i, textEnde);
      if (stapel.length === 0 && text.trim() !== "") fehler.push(`Zeile ${zeileVon(s, i)}: Text außerhalb des Wurzelelements`);
      pruefeText(s, i, textEnde, fehler);
    }
    if (lt === -1) break;
    i = lt;
    if (s.startsWith("<!--", i)) {
      const e = s.indexOf("-->", i + 4);
      if (e === -1) { fehler.push(`Zeile ${zeileVon(s, i)}: Kommentar nicht geschlossen`); break; }
      if (s.slice(i + 4, e).includes("--")) fehler.push(`Zeile ${zeileVon(s, i)}: '--' im Kommentar`);
      i = e + 3;
      continue;
    }
    if (s.startsWith("<![CDATA[", i)) {
      const e = s.indexOf("]]>", i);
      if (e === -1) { fehler.push(`Zeile ${zeileVon(s, i)}: CDATA nicht geschlossen`); break; }
      if (stapel.length === 0) fehler.push(`Zeile ${zeileVon(s, i)}: CDATA außerhalb des Wurzelelements`);
      i = e + 3;
      continue;
    }
    if (s.startsWith("<?", i)) {
      const e = s.indexOf("?>", i);
      if (e === -1) { fehler.push(`Zeile ${zeileVon(s, i)}: Verarbeitungsanweisung nicht geschlossen`); break; }
      i = e + 2;
      continue;
    }
    if (s.startsWith("<!DOCTYPE", i)) {
      // einfache DOCTYPE ohne internes Subset bzw. mit [...]
      let e = s.indexOf(">", i);
      const k = s.indexOf("[", i);
      if (k !== -1 && k < e) e = s.indexOf(">", s.indexOf("]", k));
      if (e === -1) { fehler.push("DOCTYPE nicht geschlossen"); break; }
      i = e + 1;
      continue;
    }
    if (s[i + 1] === "/") {
      const m = NAME.exec(s.slice(i + 2));
      if (!m) { fehler.push(`Zeile ${zeileVon(s, i)}: ungültiges End-Tag`); break; }
      let j = i + 2 + m[0].length;
      while (/\s/.test(s[j] || "")) j++;
      if (s[j] !== ">") { fehler.push(`Zeile ${zeileVon(s, i)}: End-Tag </${m[0]}> nicht geschlossen`); break; }
      const oben = stapel.pop();
      if (oben !== m[0]) {
        fehler.push(`Zeile ${zeileVon(s, i)}: </${m[0]}> passt nicht zu <${oben === undefined ? "(nichts)" : oben}>`);
        break;
      }
      i = j + 1;
      continue;
    }
    // Start-Tag
    const m = NAME.exec(s.slice(i + 1));
    if (!m) { fehler.push(`Zeile ${zeileVon(s, i)}: '<' ohne gültigen Tag-Namen`); break; }
    const name = m[0];
    let j = i + 1 + name.length;
    const attrs = new Set();
    let selbst = false;
    for (;;) {
      const vorher = j;
      while (/\s/.test(s[j] || "")) j++;
      if (j >= n) { fehler.push(`Zeile ${zeileVon(s, i)}: Tag <${name}> nicht geschlossen`); return fehler; }
      if (s[j] === ">") { j++; break; }
      if (s.startsWith("/>", j)) { selbst = true; j += 2; break; }
      if (j === vorher) { fehler.push(`Zeile ${zeileVon(s, j)}: Leerraum vor Attribut fehlt in <${name}>`); return fehler; }
      const a = NAME.exec(s.slice(j));
      if (!a) { fehler.push(`Zeile ${zeileVon(s, j)}: ungültiges Attribut in <${name}>`); return fehler; }
      if (attrs.has(a[0])) fehler.push(`Zeile ${zeileVon(s, j)}: Attribut '${a[0]}' doppelt in <${name}>`);
      attrs.add(a[0]);
      j += a[0].length;
      while (/\s/.test(s[j] || "")) j++;
      if (s[j] !== "=") { fehler.push(`Zeile ${zeileVon(s, j)}: Attribut '${a[0]}' ohne Wert`); return fehler; }
      j++;
      while (/\s/.test(s[j] || "")) j++;
      const q = s[j];
      if (q !== '"' && q !== "'") { fehler.push(`Zeile ${zeileVon(s, j)}: Attribut '${a[0]}' nicht gequotet`); return fehler; }
      const e = s.indexOf(q, j + 1);
      if (e === -1) { fehler.push(`Zeile ${zeileVon(s, j)}: Attributwert nicht geschlossen`); return fehler; }
      if (s.slice(j + 1, e).includes("<")) fehler.push(`Zeile ${zeileVon(s, j)}: '<' im Attributwert`);
      pruefeText(s, j + 1, e, fehler);
      j = e + 1;
    }
    if (stapel.length === 0) {
      wurzeln++;
      if (wurzeln > 1) fehler.push(`Zeile ${zeileVon(s, i)}: mehr als ein Wurzelelement`);
    }
    if (!selbst) stapel.push(name);
    i = j;
  }
  if (stapel.length) fehler.push(`nicht geschlossene Elemente: ${stapel.map((x) => "<" + x + ">").join(" ")}`);
  if (wurzeln === 0) fehler.push("kein Wurzelelement");
  return fehler;
}

module.exports = { wohlgeformt };
