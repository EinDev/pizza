// Kleiner, XSS-sicherer Markdown-Renderer für die Doku-Untermenge:
// **fett**, *kursiv*, `code`, [text](url), Leerzeilen = Absätze, "- " Listen.
// Erzeugt ausschließlich DOM-Knoten über createElement/textContent – nie innerHTML.

const SICHERE_URL = /^(?:#|\.{0,2}\/|https?:\/\/|mailto:|[\w\-./]+(?:#.*)?$)/i;

export function sichereUrl(url) {
  const u = String(url || "").trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^(https?|mailto):/i.test(u)) return null;
  return SICHERE_URL.test(u) ? u : null;
}

/** Inline-Markdown → Array von Knoten-Beschreibungen (DOM-frei, testbar). */
export function inlineParsen(text) {
  const out = [];
  let i = 0, puffer = "";
  const flush = () => { if (puffer) { out.push({ typ: "text", text: puffer }); puffer = ""; } };
  while (i < text.length) {
    const c = text[i];
    if (c === "\\" && i + 1 < text.length && /[*`[\]\\_()]/.test(text[i + 1])) { puffer += text[i + 1]; i += 2; continue; }
    if (c === "`") {
      // gleich lange Backtick-Folge suchen
      let n = 1; while (text[i + n] === "`") n++;
      const zu = text.indexOf("`".repeat(n), i + n);
      if (zu !== -1) {
        flush();
        let inhalt = text.slice(i + n, zu);
        if (n > 1 && inhalt.startsWith(" ") && inhalt.endsWith(" ")) inhalt = inhalt.slice(1, -1);
        out.push({ typ: "code", text: inhalt });
        i = zu + n; continue;
      }
    }
    if (c === "*" && text[i + 1] === "*") {
      const zu = text.indexOf("**", i + 2);
      if (zu > i + 2) { flush(); out.push({ typ: "fett", kinder: inlineParsen(text.slice(i + 2, zu)) }); i = zu + 2; continue; }
    }
    if (c === "*" && text[i + 1] !== "*" && text[i + 1] !== " ") {
      let zu = i + 1;
      while (true) {
        zu = text.indexOf("*", zu);
        if (zu === -1) break;
        if (text[zu + 1] === "*") { zu += 2; continue; }
        break;
      }
      if (zu > i + 1) { flush(); out.push({ typ: "kursiv", kinder: inlineParsen(text.slice(i + 1, zu)) }); i = zu + 1; continue; }
    }
    if (c === "[") {
      const m = /^\[([^\]]+)\]\(([^)\s]*)\)/.exec(text.slice(i));
      if (m) { flush(); out.push({ typ: "link", url: sichereUrl(m[2]), kinder: inlineParsen(m[1]) }); i += m[0].length; continue; }
    }
    puffer += c; i++;
  }
  flush();
  return out;
}

/** Block-Markdown → [{typ:"absatz", inline} | {typ:"liste", punkte:[inline]}] */
export function blockParsen(md) {
  const bloecke = [];
  const zeilen = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  let absatz = [], liste = null, geordnet = false;
  const absatzEnde = () => { if (absatz.length) { bloecke.push({ typ: "absatz", inline: inlineParsen(absatz.join(" ")) }); absatz = []; } };
  const listeEnde = () => { if (liste) { bloecke.push({ typ: "liste", geordnet, punkte: liste.map(inlineParsen) }); liste = null; } };
  for (const roh of zeilen) {
    const z = roh.trimEnd();
    const lm = /^\s*[-*]\s+(.*)$/.exec(z);
    const om = /^\s*\d+[.)]\s+(.*)$/.exec(z);
    if (!z.trim()) { absatzEnde(); listeEnde(); continue; }
    if (lm || om) {
      const neuGeordnet = !lm;
      absatzEnde();
      if (liste && geordnet !== neuGeordnet) listeEnde();
      geordnet = neuGeordnet;
      (liste = liste || []).push((lm || om)[1]);
      continue;
    }
    if (liste && /^\s{2,}\S/.test(roh)) { liste[liste.length - 1] += " " + z.trim(); continue; }
    listeEnde();
    absatz.push(z.trim());
  }
  absatzEnde(); listeEnde();
  return bloecke;
}

function inlineDom(knoten, ziel, linkKlick) {
  for (const k of knoten) {
    if (k.typ === "text") ziel.appendChild(document.createTextNode(k.text));
    else if (k.typ === "code") { const e = document.createElement("code"); e.textContent = k.text; ziel.appendChild(e); }
    else if (k.typ === "fett" || k.typ === "kursiv") {
      const e = document.createElement(k.typ === "fett" ? "strong" : "em");
      inlineDom(k.kinder, e, linkKlick); ziel.appendChild(e);
    } else if (k.typ === "link") {
      if (!k.url) { const e = document.createElement("span"); inlineDom(k.kinder, e, linkKlick); ziel.appendChild(e); continue; }
      const a = document.createElement("a");
      a.setAttribute("href", k.url);
      if (/^https?:/i.test(k.url)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
      if (linkKlick) a.addEventListener("click", (ev) => linkKlick(ev, k.url));
      inlineDom(k.kinder, a, linkKlick);
      ziel.appendChild(a);
    }
  }
}

/** Rendert Markdown in ein DocumentFragment. */
export function markdownDom(md, { linkKlick, inline = false } = {}) {
  const frag = document.createDocumentFragment();
  if (inline) { inlineDom(inlineParsen(String(md || "")), frag, linkKlick); return frag; }
  for (const b of blockParsen(md)) {
    if (b.typ === "absatz") { const p = document.createElement("p"); inlineDom(b.inline, p, linkKlick); frag.appendChild(p); }
    else {
      const ul = document.createElement(b.geordnet ? "ol" : "ul");
      for (const punkt of b.punkte) { const li = document.createElement("li"); inlineDom(punkt, li, linkKlick); ul.appendChild(li); }
      frag.appendChild(ul);
    }
  }
  return frag;
}

/** Klartext (für Suche). */
export function markdownText(md) {
  const flach = (kn) => kn.map((k) => (k.kinder ? flach(k.kinder) : k.text || "")).join("");
  return blockParsen(md).map((b) => (b.typ === "absatz" ? flach(b.inline) : b.punkte.map(flach).join(" "))).join(" ");
}
