// CodeMirror-6-Editor mit pizza-Sprache, Lint, Autovervollständigung und Zeilenmarkierung.
import { EditorState, StateEffect, StateField, Compartment } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection,
  dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars, Decoration, placeholder, ViewPlugin,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, foldService, indentOnInput } from "@codemirror/language";

import { searchKeymap, highlightSelectionMatches, openSearchPanel } from "@codemirror/search";
import {
  autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, snippetCompletion,
} from "@codemirror/autocomplete";
import { linter, lintGutter, lintKeymap, forceLinting, forEachDiagnostic } from "@codemirror/lint";
import { pizzaUnterstuetzung } from "./sprache.js";
import { icon as iconEl } from "./icons.js";
import { KEYWORDS, TYPEN, BUILTINS, BELAEGE, BELAG_NACH, ANANAS, ANNOTATIONEN } from "./woerter.js";

// Falten von { … }-Blöcken (StreamLanguage liefert keine Faltbereiche)
const klammerFalten = foldService.of((state, von, bis) => {
  const zeile = state.doc.sliceString(von, bis).replace(/\/\/.*$/, "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const auf = zeile.lastIndexOf("{");
  if (auf < 0 || zeile.indexOf("}", auf) >= 0) return null;
  const text = state.doc.sliceString(bis, Math.min(state.doc.length, bis + 200000));
  let tiefe = 1, imText = false, i = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (imText) { if (c === "\\") i++; else if (c === '"' || c === "\n") imText = false; continue; }
    if (c === '"') imText = true;
    else if (c === "/" && text[i + 1] === "/") { const n = text.indexOf("\n", i); if (n < 0) break; i = n; }
    else if (c === "{") tiefe++;
    else if (c === "}" && --tiefe === 0) break;
  }
  if (tiefe !== 0) return null;
  const ende = bis + i;
  return ende > bis + 1 ? { from: bis, to: ende } : null;
});

// ---------- Lint-Bereiche mit eigenem Attribut (für Tests/Styling): data-pizza-lint ----------
function lintDeko(view) {
  const r = [];
  forEachDiagnostic(view.state, (d, von, bis) => {
    if (bis > von) r.push(Decoration.mark({ attributes: { "data-pizza-lint": d.severity } }).range(von, bis));
  });
  return Decoration.set(r, true);
}
const lintAttribute = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = lintDeko(view); }
  update(u) { this.decorations = lintDeko(u.view); }
}, { decorations: (p) => p.decorations });

// ---------- Zeilenmarkierung (Sprung aus der Konsole) ----------
const markiereZeile = StateEffect.define();
const zeilenDeko = Decoration.line({ class: "cm-pizza-sprungzeile", attributes: { "data-pizza-sprung": "true" } });
const sprungFeld = StateField.define({
  create: () => Decoration.none,
  update(deko, tr) {
    for (const e of tr.effects) if (e.is(markiereZeile)) {
      return e.value == null ? Decoration.none : Decoration.set([zeilenDeko.range(e.value)]);
    }
    return tr.docChanged ? Decoration.none : deko;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ---------- Autovervollständigung ----------
const SNIPPETS = [
  snippetCompletion("klasse ${Name} {\n\t${}\n}", { label: "klasse", detail: "Klasse", type: "keyword", boost: 5 }),
  snippetCompletion("speisekarte klasse ${Pizzeria} {\n\tspeisekarte tiefkühl leer hauptgang(Blech<margherita> args) {\n\t\t${}\n\t}\n}",
    { label: "hauptgang", detail: "Einstiegspunkt", type: "keyword", boost: 5 }),
  snippetCompletion("ofen(temperatur: ${1:250}, zeit: ${2:60s}) {\n\t${}\n\tserviere ((${karton}));\n} roh (r) {\n\tserviere ((r.teilergebnis()));\n};",
    { label: "ofen", detail: "Zeitbudget", type: "keyword", boost: 5 }),
  snippetCompletion("probier {\n\t${}\n} verbrannt (${LaufzeitAnanas} a) {\n\tBote.fehler((a.nachricht()));\n}",
    { label: "probier", detail: "try/catch", type: "keyword", boost: 5 }),
  snippetCompletion("falls (${bedingung}) {\n\t${}\n}", { label: "falls", detail: "if", type: "keyword", boost: 4 }),
  snippetCompletion("falls (${bedingung}) {\n\t${}\n} sonst {\n\t\n}", { label: "falls … sonst", detail: "if/else", type: "keyword", boost: 3 }),
  snippetCompletion("solange (${bedingung}) {\n\t${}\n}", { label: "solange", detail: "while", type: "keyword", boost: 4 }),
  snippetCompletion("für (${salami} ${x} : ${blech}) {\n\t${}\n}", { label: "für", detail: "for-each", type: "keyword", boost: 4 }),
  snippetCompletion("wähle (${wert}) {\n\tfall ${1:1} -> ${2}\n\tstandard -> \n}", { label: "wähle", detail: "switch", type: "keyword", boost: 4 }),
  snippetCompletion("serviere ((${}));", { label: "serviere", detail: "return", type: "keyword", boost: 4 }),
  snippetCompletion("Bote.sage((${}));", { label: "Bote.sage", detail: "Ausgabe", type: "function", boost: 6 }),
  snippetCompletion("quattrostagioni ${Name} { ${A}, ${B}, ${C}, ${D} }", { label: "quattrostagioni", detail: "Enum mit 4 Werten", type: "keyword", boost: 3 }),
  snippetCompletion("@Nach(${Tomate})\nbelag ${Name} auf Pizza {\n\tspeisekarte funghi preis() {\n\t\tserviere ((unten.preis() + ${1.00}));\n\t}\n}",
    { label: "belag", detail: "eigener Belag", type: "keyword", boost: 3 }),
  snippetCompletion("((Tomate, Mozzarella, Basilikum))", { label: "((Margherita))", detail: "Pizza-Literal", type: "constant", boost: 2 }),
];

const MITGLIEDER = {
  Bote: ["sage", "fehler"], Uhr: ["jetzt", "vorspulen"], Mathe: ["wurzel", "max", "min", "abs", "runden", "boden", "decke", "PI"],
  Zufall: ["zahl"], Spiegel: ["felder"],
};
const ALLE_METHODEN = ["preis", "beläge", "hat", "anzahlBeläge", "alsText", "übrig", "name", "euro", "runden", "abs", "ganz",
  "länge", "groß", "klein", "enthält", "zerlege", "ersetze", "trimme", "zeichen", "wiederhole", "beginntMit", "alsZahl",
  "stück", "hinzu", "entferne", "setze", "belege", "filtere", "zusammenklappen", "summe", "erstes", "letztes", "umdrehen",
  "sortiere", "verbinde", "istLeer", "schneide", "lege", "hole", "schlüssel", "werte", "inMs", "inSekunden",
  "gehenlassen", "backen", "istAufgegangen", "trinkgeld", "warte", "wennDa", "pünktlich", "wert", "oderGratis",
  "teilergebnis", "verbrauchteZeit", "pizza", "essen", "istGegessen", "mikrowelle", "frisch", "istMatschig",
  "aufklappen", "nachricht", "holeNachricht", "typ", "position", "beschreibung"];

function preisText(p) { return p == null ? "löst Hawaii aus" : p.toFixed(2).replace(".", ",") + " €"; }

function pizzaVervollstaendigung(ctx) {
  // Annotationen
  const anno = ctx.matchBefore(/@[\p{L}_]*/u);
  if (anno) return { from: anno.from + 1, options: ANNOTATIONEN.map((a) => ({ label: a, type: "annotation", detail: "Annotation" })) };

  // Mitglieder nach Punkt
  const punkt = ctx.matchBefore(/[\p{L}\p{N}_)\]]+\.[\p{L}_]*/u);
  if (punkt) {
    const [obj] = punkt.text.split(".");
    const from = punkt.from + punkt.text.lastIndexOf(".") + 1;
    const liste = MITGLIEDER[obj] || ALLE_METHODEN;
    return { from, options: liste.map((m) => ({ label: m, type: m === "PI" ? "constant" : "method", apply: m })), validFor: /^[\p{L}\p{N}_]*$/u };
  }

  const wort = ctx.matchBefore(/[\p{L}_][\p{L}\p{N}_]*/u);
  if (!wort && !ctx.explicit) return null;
  const from = wort ? wort.from : ctx.pos;
  // Innerhalb eines Pizza-Literals nur Beläge
  const zeileVor = ctx.state.doc.lineAt(ctx.pos);
  const davor = zeileVor.text.slice(0, from - zeileVor.from);
  const inPizza = /\(\(\s*(?:[\p{Lu}][\p{L}\p{N}_]*\s*,\s*)*$/u.test(davor);
  const belaege = [...BELAEGE.entries()].map(([name, preis]) => ({
    label: name, type: "constant", detail: preisText(preis),
    info: BELAG_NACH.has(name) ? "@Nach(" + BELAG_NACH.get(name).join(", ") + ")" : undefined,
    boost: inPizza ? 10 : -1,
  }));
  if (inPizza) return { from, options: belaege, validFor: /^[\p{L}\p{N}_]*$/u };
  const optionen = [
    ...SNIPPETS,
    ...[...KEYWORDS].map((k) => ({ label: k, type: "keyword" })),
    ...[...TYPEN].map((k) => ({ label: k, type: "type", detail: "Typ" })),
    ...[...BUILTINS].map((k) => ({ label: k, type: /^[a-z]/.test(k) ? "function" : "namespace", detail: "eingebaut" })),
    ...[...ANANAS].map((k) => ({ label: k, type: "class", detail: "Ananas" })),
    ...belaege,
  ];
  return { from, options: optionen, validFor: /^[\p{L}\p{N}_]*$/u };
}

const VERVOLL_ICON = { keyword: "ckeyword", function: "cfunction", method: "cmethod", variable: "cvariable", class: "cclass",
  type: "ctype", constant: "cconstant", namespace: "cnamespace", property: "cmethod", text: "csnippet", annotation: "cannotation" };

// ---------- Lint ----------
function pizzaLinter(view) {
  const PL = window.PizzaLang;
  if (!PL || typeof PL.parse !== "function") return [];
  const doc = view.state.doc;
  let erg;
  try { erg = PL.parse(doc.toString()); } catch (e) { return []; }
  if (!erg || erg.ok || !erg.fehler) return [];
  const f = erg.fehler;
  let von = 0, bis = doc.length;
  if (f.zeile != null) {
    const z = doc.line(Math.min(Math.max(1, f.zeile), doc.lines));
    von = Math.min(z.from + Math.max(0, (f.spalte || 1) - 1), z.to);
    // bis Wortende markieren
    const rest = doc.sliceString(von, z.to);
    const m = /^[\p{L}\p{N}_]+|^\S/u.exec(rest);
    bis = von + (m ? m[0].length : 0);
    if (bis === von && von > z.from) von--;
    if (bis === von) bis = Math.min(von + 1, doc.length);
  }
  return [{ from: von, to: bis, severity: "error", source: f.code || "Syntax", markClass: "cm-pizza-lint", message: (f.code && !String(f.text).includes(f.code) ? f.code + ": " : "") + f.text }];
}

// ---------- Themen ----------
const basisThema = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--editor-schrift, 14px)" },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.6" },
  ".cm-content": { padding: "12px 0" },
});
const hellThema = EditorView.theme({}, { dark: false });
const dunkelThema = EditorView.theme({}, { dark: true });

export function erstelleEditor({ eltern, inhalt, beiAenderung, tasten }) {
  const themaFach = new Compartment();
  const dunkel = () => document.documentElement.dataset.theme === "dark";
  const themaExt = () => (dunkel() ? dunkelThema : hellThema);
  const erweiterungen = [
    lineNumbers(), highlightActiveLineGutter(), foldGutter({ markerDOM: (offen) => iconEl(offen ? "chevronDown" : "chevronRight", "cm-faltmarke") }),
    klammerFalten, lintGutter(),
    highlightSpecialChars(), history(), drawSelection(), dropCursor(),
    EditorState.allowMultipleSelections.of(true), indentOnInput(), bracketMatching(), closeBrackets(),
    autocompletion({
      override: [pizzaVervollstaendigung], icons: false, activateOnTyping: true,
      addToOptions: [{ position: 20, render: (c) => iconEl(VERVOLL_ICON[c.type] || "cvariable", "cm-pizza-icon cm-pizza-icon-" + (c.type || "text")) }],
    }),
    rectangularSelection(), crosshairCursor(), highlightActiveLine(), highlightSelectionMatches(),
    EditorState.tabSize.of(4),
    pizzaUnterstuetzung(),
    linter(pizzaLinter, { delay: 350 }),
    sprungFeld, lintAttribute,
    placeholder("// Schreib hier deine Pizza …"),
    keymap.of([...(tasten || []), ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap,
      ...foldKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
    basisThema,
    EditorView.updateListener.of((u) => { if (u.docChanged && beiAenderung) beiAenderung(u.state.doc.toString()); }),
    EditorView.contentAttributes.of({ "aria-label": "pizza-Quelltext", spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
  ];
  const neuerZustand = (doc) => EditorState.create({ doc, extensions: [erweiterungen, themaFach.of(themaExt())] });
  const view = new EditorView({ parent: eltern, state: neuerZustand(inhalt || "") });

  return {
    view,
    text: () => view.state.doc.toString(),
    /** Neuer, unabhängiger Zustand (eigene Undo-Historie) – für Editor-Tabs. */
    neuerZustand,
    zustand: () => view.state,
    setzeZustand(state) {
      view.setState(state);
      // Thema des (evtl. älteren) Zustands angleichen und neu diagnostizieren
      view.dispatch({ effects: themaFach.reconfigure(themaExt()) });
      forceLinting(view);
    },
    setzeText(neu) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: neu }, selection: { anchor: 0 }, scrollIntoView: true });
    },
    springeZu(zeile, spalte) {
      const doc = view.state.doc;
      if (zeile == null) { view.focus(); return; }
      const z = doc.line(Math.min(Math.max(1, zeile), doc.lines));
      const pos = Math.min(z.from + Math.max(0, (spalte || 1) - 1), z.to);
      view.dispatch({
        selection: { anchor: pos },
        effects: [markiereZeile.of(z.from), EditorView.scrollIntoView(pos, { y: "center" })],
      });
      view.focus();
    },
    setzeThema() { view.dispatch({ effects: themaFach.reconfigure(themaExt()) }); },
    lintNeu() { forceLinting(view); },
    suchen() { openSearchPanel(view); },
  };
}
