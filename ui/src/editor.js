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
import { KEYWORDS, TYPEN, BUILTINS, ANANAS, ANNOTATIONEN, MITGLIEDER, KONSTANTEN, ALLE_METHODEN, textArgumentVorschlaege } from "./woerter.js";

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
  snippetCompletion("ofen(zeit: ${1:60s}) {\n\t${}\n\tserviere ((${karton}));\n} roh (r) {\n\tserviere ((r.teilergebnis()));\n};",
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
  // Theke v5/v7 (SPEC §16.8, §16.10) und Vorratskammer mit Namensraum (§15.4, K-106)
  snippetCompletion("Zettel ${name} = neu Zettel(${0});", { label: "Zettel", detail: "beobachtbarer Wert (Theke v5)", type: "class", boost: 3 }),
  snippetCompletion("Zettel ${name} = Zettel.aus(() -> ${});", { label: "Zettel.aus", detail: "abgeleiteter Zettel (Theke v7)", type: "function", boost: 3 }),
  // Herd (SPEC §18): Grundgerüst eines Spiels
  snippetCompletion("Herd ${herd} = neu Herd(\"${Mein Spiel}\", breite: ${640}, hoehe: ${360});\n${}\n${herd}.backe(() -> {\n\t\n});",
    { label: "Herd", detail: "Spiel-Engine: Fenster + Spielschleife", type: "class", boost: 3 }),
  snippetCompletion("Vorratskammer ${kammer} = neu Vorratskammer(\"${spielstand}\", namensraum: \"${mein-spiel}\");",
    { label: "Vorratskammer", detail: "persistenter Zustand (mit Namensraum)", type: "class", boost: 3 }),
];

function pizzaVervollstaendigung(ctx) {
  // Text-Argumente: stil("…"), bindeStil("…"), binde("…"), animiere("…") und Stil-Werte
  const zeile = ctx.state.doc.lineAt(ctx.pos);
  const txt = textArgumentVorschlaege(zeile.text.slice(0, ctx.pos - zeile.from));
  if (txt) return { from: zeile.from + txt.von, options: txt.liste.map((w) => ({ label: w, type: txt.art })), validFor: /^[\p{L}]*$/u };

  // Annotationen
  const anno = ctx.matchBefore(/@[\p{L}_]*/u);
  if (anno) return { from: anno.from + 1, options: ANNOTATIONEN.map((a) => ({ label: a, type: "annotation", detail: "Annotation" })) };

  // Mitglieder nach Punkt
  const punkt = ctx.matchBefore(/[\p{L}\p{N}_)\]]+\.[\p{L}_]*/u);
  if (punkt) {
    const [obj] = punkt.text.split(".");
    const from = punkt.from + punkt.text.lastIndexOf(".") + 1;
    const liste = MITGLIEDER[obj] || ALLE_METHODEN;
    return { from, options: liste.map((m) => ({ label: m, type: KONSTANTEN.has(m) ? "constant" : "method", apply: m })), validFor: /^[\p{L}\p{N}_]*$/u };
  }

  const wort = ctx.matchBefore(/[\p{L}_][\p{L}\p{N}_]*/u);
  if (!wort && !ctx.explicit) return null;
  const from = wort ? wort.from : ctx.pos;
  const optionen = [
    ...SNIPPETS,
    ...[...KEYWORDS].map((k) => ({ label: k, type: "keyword" })),
    ...[...TYPEN].filter((k) => !BUILTINS.has(k)).map((k) => ({ label: k, type: "type", detail: "Typ" })), // Zufall: nur als Modul
    ...[...BUILTINS].map((k) => ({ label: k, type: /^[a-z]/.test(k) ? "function" : "namespace", detail: "eingebaut" })),
    ...[...ANANAS].map((k) => ({ label: k, type: "class", detail: "Ananas" })),
  ];
  return { from, options: optionen, validFor: /^[\p{L}\p{N}_]*$/u };
}

const VERVOLL_ICON = { keyword: "ckeyword", function: "cfunction", method: "cmethod", variable: "cvariable", class: "cclass",
  type: "ctype", constant: "cconstant", namespace: "cnamespace", property: "cmethod", text: "csnippet", annotation: "cannotation" };

// ---------- Lint ----------
function pizzaLinter(view, projektDiagnose) {
  const PL = window.PizzaLang;
  if (!PL || typeof PL.parse !== "function") return [];
  const doc = view.state.doc;
  let erg;
  try { erg = PL.parse(doc.toString()); } catch (e) { return []; }
  if (!erg) return [];
  // Syntax ok → Projektprüfung (P0014–P0019, nach PA1 über PizzaLang.projekt.lade; vorher liefert sie nichts)
  if (erg.ok) {
    const pf = projektDiagnose ? projektDiagnose(doc.toString()) : null;
    return pf ? lintEintrag(doc, pf) : [];
  }
  if (!erg.fehler) return [];
  return lintEintrag(doc, erg.fehler);
}
function lintEintrag(doc, f) {
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

// ---------- JSON (pizza.json und andere .json-Dateien) ----------
function jsonLinter(view, pruefe) {
  const text = view.state.doc.toString();
  if (!text.trim()) return [];
  let fehler = null;
  try { JSON.parse(text); } catch (e) { fehler = "Kein gültiges JSON: " + (e && e.message ? e.message : String(e)); }
  if (!fehler && pruefe) fehler = pruefe(text);
  return fehler ? [{ from: 0, to: Math.min(text.length, view.state.doc.line(1).to || 1), severity: "error", source: "JSON", markClass: "cm-pizza-lint", message: fehler }] : [];
}
/** Dateiart des Zustands ("pizza" | "json" | "text") – Hervorhebung nur bei pizza neu aufbauen. */
const artFeld = StateField.define({ create: () => "pizza", update: (v) => v });

// ---------- Themen ----------
const basisThema = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--editor-schrift, 14px)" },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.6" },
  ".cm-content": { padding: "12px 0" },
});
const hellThema = EditorView.theme({}, { dark: false });
const dunkelThema = EditorView.theme({}, { dark: true });

export function erstelleEditor({ eltern, inhalt, beiAenderung, tasten, projektDiagnose = null }) {
  const themaFach = new Compartment();
  const spracheFach = new Compartment();   // Herd-Schema nachgeladen → Hervorhebung neu (neuHervorheben)
  const dunkel = () => document.documentElement.dataset.theme === "dark";
  const themaExt = () => (dunkel() ? dunkelThema : hellThema);
  const gemeinsam = [
    lineNumbers(), highlightActiveLineGutter(), lintGutter(),
    highlightSpecialChars(), history(), drawSelection(), dropCursor(),
    EditorState.allowMultipleSelections.of(true), indentOnInput(), bracketMatching(), closeBrackets(),
    rectangularSelection(), crosshairCursor(), highlightActiveLine(), highlightSelectionMatches(),
    EditorState.tabSize.of(4),
    sprungFeld, lintAttribute,
    keymap.of([...(tasten || []), ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap,
      ...foldKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
    basisThema,
    EditorView.updateListener.of((u) => { if (u.docChanged && beiAenderung) beiAenderung(u.state.doc.toString()); }),
  ];
  // Dateiarten (PROJEKTE §3.1): .pizza mit Hervorhebung, Live-Diagnose und Vervollständigung; Textdateien ohne pizza-Hervorhebung,
  // pizza.json/.json mit JSON-Prüfung.
  const proArt = {
    pizza: () => [
      foldGutter({ markerDOM: (offen) => iconEl(offen ? "chevronDown" : "chevronRight", "cm-faltmarke") }), klammerFalten,
      autocompletion({
        override: [pizzaVervollstaendigung], icons: false, activateOnTyping: true,
        addToOptions: [{ position: 20, render: (c) => iconEl(VERVOLL_ICON[c.type] || "cvariable", "cm-pizza-icon cm-pizza-icon-" + (c.type || "text")) }],
      }),
      spracheFach.of(pizzaUnterstuetzung()),
      linter((view) => pizzaLinter(view, projektDiagnose), { delay: 350 }),
      placeholder("// Schreib hier deine Pizza …"),
      EditorView.contentAttributes.of({ "aria-label": "pizza-Quelltext", spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
    ],
    json: (pruefe) => [
      linter((view) => jsonLinter(view, pruefe), { delay: 350 }),
      EditorView.contentAttributes.of({ "aria-label": "JSON-Datei", spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
    ],
    text: () => [
      EditorView.contentAttributes.of({ "aria-label": "Textdatei", spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
    ],
  };
  /** Neuer, unabhängiger Zustand (eigene Undo-Historie) – je Datei. art: "pizza" | "json" | "text"; pruefe(text) → null | Fehlertext. */
  const neuerZustand = (doc, { art = "pizza", pruefe = null } = {}) => EditorState.create({
    doc,
    extensions: [gemeinsam, artFeld.init(() => art), (proArt[art] || proArt.text)(pruefe), themaFach.of(themaExt())],
  });
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
    /** Wortlisten haben sich geändert (z. B. Komponenten aus schema.json): Text neu einfärben. */
    neuHervorheben() {
      if (view.state.field(artFeld, false) !== "pizza") return;
      view.dispatch({ effects: spracheFach.reconfigure([]) });
      view.dispatch({ effects: spracheFach.reconfigure(pizzaUnterstuetzung()) });
    },
    suchen() { openSearchPanel(view); },
  };
}
