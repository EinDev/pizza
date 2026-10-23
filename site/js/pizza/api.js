// pizza-Interpreter · API (run, intern, öffentliches Objekt)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// =====================================================================
// API
// =====================================================================

function run(quelltext, optionen) {
  optionen = optionen || {};
  const ereignisse = [];
  const onEvent = typeof optionen.onEvent === 'function' ? optionen.onEvent : null;
  const emit = (e) => {
    ereignisse.push(e);
    if (onEvent !== null) { try { onEvent(e); } catch (x) { /* Beobachterfehler ignorieren */ } }
  };
  let L = null, exitCode = 0;
  const p = parse(quelltext);
  if (!p.ok) {
    emit({ typ: 'fehler', code: p.fehler.code, art: 'syntax', text: p.fehler.text, zeile: p.fehler.zeile, spalte: p.fehler.spalte });
    exitCode = 2;
  } else {
    try {
      L = new Laufzeit(p.ast, optionen, emit);
      for (const w of analysiere(p.ast)) {
        const key = w.code + ':' + w.zeile + ':' + w.spalte;
        if (L.warnSet.has(key)) continue;
        L.warnSet.add(key);
        emit({ typ: 'warnung', code: w.code, text: w.text, zeile: w.zeile, spalte: w.spalte });
      }
      L.start();
    } catch (e) {
      if (L) {
        try { exitCode = L.behandleEnde(e); }
        catch (e2) {
          emit({ typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas', text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', zeile: null, spalte: null, detail: String(e2 && e2.message) });
          exitCode = 1;
        }
      } else {
        emit({ typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas', text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', zeile: null, spalte: null, detail: String(e && e.message) });
        exitCode = 1;
      }
    }
  }
  const schritte = L ? L.schritte : 0;
  const zeitMs = L ? L.schritte + L.offset : 0;
  emit({ typ: 'ende', exitCode, schritte, zeitMs });
  return { exitCode, ereignisse, schritte, zeitMs };
}

// Startprüfung ohne Programmlauf (für Compiler-Frontends): registriert alle Deklarationen und
// führt die Prüfungen aus SPEC §14.7 aus (Q0004, P0010, P0011, R0001, A0001).
// → null, wenn alles passt, sonst { code, text, zeile, spalte } wie das fehler-Ereignis (art "pizzafehler").
function pruefeStart(ast) {
  const L = new Laufzeit(ast, {}, () => {});
  try {
    for (const d of ast.body) if (DEKL.has(d.k)) L.registriere(d);
    L.pruefe();
    return null;
  } catch (e) {
    if (e instanceof PizzaFehlerSig) return { code: e.code, text: 'PizzaFehler ' + e.code + ': ' + e.text, zeile: e.zeile, spalte: e.spalte };
    throw e;
  }
}

return {
  version: VERSION,
  KEYWORDS: KEYWORDS.slice(),
  TYPEN: TYPEN.slice(),
  BUILTINS: BUILTINS.slice(),
  ANANAS: ANANAS.slice(),
  PANIK_TEXT: PANIK_BANNER,
  parse,
  run,
  // Für Compiler-Frontends (pizzaiolo), keine stabile Endnutzer-API; Beschreibung in ARCHITEKTUR §1.
  intern: {
    analysiere: (ast) => analysiere(ast).map(w => Object.assign({}, w)),
    pruefe: pruefeStart,
    ANANAS_BAUM: ANANAS_BAUM.map(a => [a[0], a[1]]),
    MAX_STAPEL,
    STANDARD_LIMIT,
    UI_STIL: JSON.parse(JSON.stringify(UI_STIL)),
    HERD_TYPEN: HERD_KLASSEN.concat(HERD_KOMPONENTEN),
    WINKEL: Object.assign({}, WINKEL),  // K-137: Winkelfunktionen (Bitgleichheitstest gegen die Wasm-Laufzeit)
    LOGEXP: Object.assign({}, LOGEXP)   // U-72: log/log10/log2/exp (ebenso)
  }
};
