'use strict';
/*
 * Führt einen Fall in allen verfügbaren Motoren aus und vergleicht gegen den Interpreter.
 * Zusätzlich Selbstkonsistenz des Interpreters: zweiter Lauf identisch, onEvent = ereignisse,
 * parse() wirft nie und stimmt mit dem Syntaxfehler-Ereignis von run() überein.
 */
const M = require('./motoren');

const MOTOREN = M.ALLE;

/**
 * → {
 *   ref: Ergebnis Interpreter,
 *   je: { motor: { status, ergebnis, abw?, grund? } },
 *   probleme: [{ motor, art, details: string[] }]   // art: ereignisse|exitCode|schritte|wurf|invariante|selbst
 *   fallbacks: [{ motor, grund }], speicher: [{ motor, details }]
 * }
 */
function pruefeFall(code, optionen = {}, einst = {}) {
  const selbst = einst.selbst !== false;
  const out = { je: {}, probleme: [], fallbacks: [], speicher: [] };
  const ref = M.interpreter.lauf(code, optionen);
  out.ref = ref;
  out.je.interpreter = { status: ref.status, ergebnis: ref };
  if (ref.status !== 'ok') {
    out.probleme.push({ motor: 'interpreter', art: 'wurf', details: [ref.fehler] });
    return out;
  }
  for (const p of M.invarianten(ref)) out.probleme.push({ motor: 'interpreter', art: 'invariante', details: [p] });

  if (selbst) {
    const zweit = M.interpreter.lauf(code, optionen);
    const d = zweit.status === 'ok' ? M.vergleiche(ref, zweit) : { details: ['zweiter Lauf: ' + zweit.fehler] };
    if (d) out.probleme.push({ motor: 'interpreter', art: 'selbst', details: ['zweiter Lauf weicht ab:'].concat(d.details) });
    // onEvent muss genau die Ereignisliste liefern.
    try {
      const gesehen = [];
      const o = Object.assign({}, optionen, { onEvent: e => gesehen.push(e) });
      if (o.args) o.args = o.args.slice();
      const r3 = M.PizzaLang.run(code, o);
      if (JSON.stringify(gesehen) !== JSON.stringify(r3.ereignisse)) out.probleme.push({ motor: 'interpreter', art: 'selbst', details: ['onEvent-Folge ≠ ereignisse'] });
    } catch (e) { out.probleme.push({ motor: 'interpreter', art: 'wurf', details: ['run mit onEvent warf: ' + e] }); }
    let pr;
    try { pr = M.PizzaLang.parse(code); }
    catch (e) { out.probleme.push({ motor: 'interpreter', art: 'wurf', details: ['parse() warf: ' + (e && e.stack || e)] }); }
    if (pr) {
      const syn = ref.ereignisse.find(e => e.typ === 'fehler' && e.art === 'syntax');
      if (typeof pr.ok !== 'boolean') out.probleme.push({ motor: 'interpreter', art: 'selbst', details: ['parse() ohne ok-Feld'] });
      else if (!pr.ok && !syn) out.probleme.push({ motor: 'interpreter', art: 'selbst', details: ['parse() meldet ' + JSON.stringify(pr.fehler) + ', run() aber keinen Syntaxfehler'] });
      else if (pr.ok && syn) out.probleme.push({ motor: 'interpreter', art: 'selbst', details: ['parse() ok, run() meldet Syntaxfehler ' + syn.text] });
      else if (!pr.ok && syn && (pr.fehler.code !== syn.code || pr.fehler.zeile !== syn.zeile || pr.fehler.spalte !== syn.spalte || pr.fehler.text !== syn.text)) {
        out.probleme.push({ motor: 'interpreter', art: 'selbst', details: ['parse()-Fehler ' + JSON.stringify(pr.fehler) + ' ≠ run()-Syntaxfehler ' + JSON.stringify(syn)] });
      }
    }
  }

  const cache = {};
  for (const m of MOTOREN) {
    if (m === M.interpreter) continue;
    if (!m.verfuegbar) { out.je[m.name] = { status: 'nicht verfügbar', grund: m.grund }; continue; }
    const r = m.lauf(code, optionen, cache);
    const eintrag = { status: r.status, ergebnis: r, grund: r.grund };
    out.je[m.name] = eintrag;
    if (r.status === 'fallback') { out.fallbacks.push({ motor: m.name, grund: r.grund }); continue; }
    if (r.status === 'übersprungen') continue;
    if (r.status === 'wurf') { out.probleme.push({ motor: m.name, art: 'wurf', details: [r.fehler] }); continue; }
    for (const p of M.invarianten(r)) out.probleme.push({ motor: m.name, art: 'invariante', details: [p] });
    const abw = M.vergleiche(ref, r);
    if (abw) {
      eintrag.abw = abw;
      if (abw.art === 'speicherlimit') out.speicher.push({ motor: m.name, details: abw.details });
      else out.probleme.push({ motor: m.name, art: abw.art, details: abw.details });
    } else eintrag.status = 'gleich';
  }
  return out;
}

/** Kurzer Fingerabdruck einer Abweichung – für Minimierung („dieselbe Art Fehler“). */
function signatur(ergebnis) {
  return ergebnis.probleme.map(p => p.motor + ':' + p.art).sort().join(',');
}

module.exports = { pruefeFall, signatur, MOTOREN, M };
