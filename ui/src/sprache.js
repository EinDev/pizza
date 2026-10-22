// pizza-Sprachmodus für CodeMirror 6 (StreamLanguage) + statischer Highlighter für Doku-Codeblöcke.
import { StreamLanguage, StringStream, HighlightStyle, syntaxHighlighting, indentUnit } from "@codemirror/language";
import { tags as t, Tag } from "@lezer/highlight";
import { KEYWORDS, TYPEN, BUILTINS, ANANAS } from "./woerter.js";

// Eigene Tags
export const pizzaTags = {
  ananas: Tag.define(t.className),
  dauer: Tag.define(t.number),
  builtin: Tag.define(t.variableName),
  wahrheit: Tag.define(t.bool),
};

const ID_START = /[\p{L}_]/u;
const ID_REST = /^[\p{L}\p{N}_]*/u;
const DAUER = /^\d[\d_]*(?:\.\d[\d_]*)?(?:ms|min|s|h|d)(?![\p{L}\p{N}_])/u;
const ZAHL = /^\d[\d_]*(?:\.\d[\d_]*)?/;
const OPERATOR = /^(?:->|\.\.|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|[+\-*/%<>=!?:])/;

function istAnanas(w) {
  return ANANAS.has(w) || (/Ananas$/.test(w) && w !== "Ananas" && /^[A-ZÄÖÜ]/.test(w));
}

/** Token-Funktion; gibt Token-Namen zurück (siehe tokenTable). */
function token(stream, state) {
  if (state.kommentar) {
    if (stream.skipTo("*/")) { stream.pos += 2; state.kommentar = false; }
    else stream.skipToEnd();
    return "kommentar";
  }
  if (stream.eatSpace()) return null;

  if (stream.match("//")) { stream.skipToEnd(); return "kommentar"; }
  if (stream.match("/*")) {
    state.kommentar = true;
    if (stream.skipTo("*/")) { stream.pos += 2; state.kommentar = false; } else stream.skipToEnd();
    return "kommentar";
  }

  const ch = stream.peek();
  if (ch === '"') {
    stream.next();
    let esc = false, c;
    while ((c = stream.next()) != null) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') break;
    }
    return "text";
  }
  if (ch === "@") {
    stream.next();
    stream.match(ID_REST);
    return "annotation";
  }
  if (/\d/.test(ch)) {
    if (stream.match(DAUER)) return "dauer";
    stream.match(ZAHL);
    return "zahl";
  }
  if (ID_START.test(ch)) {
    stream.next();
    stream.match(ID_REST);
    const w = stream.current();
    if (w === "ja" || w === "nein" || w === "karton") return "wahrheit";
    if (KEYWORDS.has(w)) return state.nachPunkt ? "eigenschaft" : "keyword";
    if (TYPEN.has(w)) return "typ";
    if (istAnanas(w)) return "ananas";
    if (BUILTINS.has(w)) return "builtin";
    if (state.nachPunkt) return stream.match(/^\s*\(/, false) ? "methode" : "eigenschaft";
    if (stream.match(/^\s*\(/, false)) return /^[A-ZÄÖÜ]/.test(w) ? "klasse" : "funktion";
    if (/^[A-ZÄÖÜ]/.test(w)) return "klasse";
    return "variable";
  }
  if (stream.match(OPERATOR)) return "operator";
  if (stream.match(/^[{}]/)) return "klammer";
  if (stream.match(/^[()[\]]/)) return "klammer";
  stream.next();
  return "satz";
}

const sprachDef = {
  name: "pizza",
  startState: () => ({ kommentar: false, nachPunkt: false, tiefe: 0 }),
  copyState: (s) => ({ ...s }),
  token(stream, state) {
    if (stream.sol()) state.nachPunkt = false;
    const vorher = stream.pos;
    const typ = token(stream, state);
    if (typ !== null) {
      const txt = stream.string.slice(vorher, stream.pos);
      state.nachPunkt = txt === ".";
      if (txt === "{") state.tiefe++;
      else if (txt === "}") state.tiefe = Math.max(0, state.tiefe - 1);
    }
    return typ;
  },
  indent(state, textNach, cx) {
    const zu = /^\s*}/.test(textNach) ? 1 : 0;
    return Math.max(0, state.tiefe - zu) * cx.unit;
  },
  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
    indentOnInput: /^\s*}$/,
  },
  tokenTable: {
    kommentar: t.comment,
    text: t.string,
    annotation: t.annotation,
    dauer: pizzaTags.dauer,
    zahl: t.number,
    wahrheit: pizzaTags.wahrheit,
    keyword: t.keyword,
    typ: t.typeName,
    ananas: pizzaTags.ananas,
    builtin: pizzaTags.builtin,
    eigenschaft: t.propertyName,
    methode: t.function(t.propertyName),
    funktion: t.function(t.variableName),
    klasse: t.className,
    variable: t.variableName,
    operator: t.operator,
    klammer: t.bracket,
    satz: t.punctuation,
  },
};

export const pizzaSprache = StreamLanguage.define(sprachDef);

// CSS-Klassen pro Token (für Editor UND statische Darstellung identisch)
const KLASSE = {
  kommentar: "tk-kommentar", text: "tk-text",
  annotation: "tk-annotation", dauer: "tk-dauer", zahl: "tk-zahl",
  wahrheit: "tk-wahrheit", keyword: "tk-keyword", typ: "tk-typ", ananas: "tk-ananas", builtin: "tk-builtin",
  eigenschaft: "tk-eigenschaft", methode: "tk-methode", funktion: "tk-funktion", klasse: "tk-klasse",
  variable: "tk-variable", operator: "tk-operator", klammer: "tk-klammer", satz: "tk-satz",
};

export const pizzaHighlightStil = HighlightStyle.define(
  Object.entries(sprachDef.tokenTable).map(([name, tag]) => ({ tag, class: KLASSE[name] }))
);

export function pizzaUnterstuetzung() {
  return [pizzaSprache, syntaxHighlighting(pizzaHighlightStil), indentUnit.of("    ")];
}

/** Statisches Highlighting: liefert ein DocumentFragment (nur Textknoten + spans, XSS-sicher). */
export function highlightStatisch(code, sprache = "pizza") {
  const frag = document.createDocumentFragment();
  if (sprache !== "pizza") { frag.appendChild(document.createTextNode(code)); return frag; }
  const state = sprachDef.startState();
  const zeilen = code.split("\n");
  zeilen.forEach((zeile, i) => {
    if (i > 0) frag.appendChild(document.createTextNode("\n"));
    state.nachPunkt = false;
    const stream = new StringStream(zeile, 4, 4);
    while (!stream.eol()) {
      const start = stream.pos;
      stream.start = start;
      const typ = sprachDef.token(stream, state);
      if (stream.pos === start) stream.pos++; // Sicherheitsnetz
      const txt = zeile.slice(start, stream.pos);
      const k = typ && KLASSE[typ];
      if (k) {
        const s = document.createElement("span");
        s.className = k;
        s.textContent = txt;
        frag.appendChild(s);
      } else frag.appendChild(document.createTextNode(txt));
    }
  });
  return frag;
}
