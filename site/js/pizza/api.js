// pizza-Interpreter · API (run, intern, öffentliches Objekt)
// Abschnitt von site/js/pizza.js (gemeinsamer Gültigkeitsbereich; Reihenfolge und Bau: scripts/baue-pizza.js).

// =====================================================================
// API
// =====================================================================

// quelle: Text (Ein-Datei-Programm) oder Projekt { dateien, hauptdatei?, name? } (SPEC §2, ARCHITEKTUR §1)
function run(quelle, optionen) {
  optionen = optionen || {};
  const ereignisse = [];
  const onEvent = typeof optionen.onEvent === 'function' ? optionen.onEvent : null;
  const emit = (e) => {
    ereignisse.push(e);
    if (onEvent !== null) { try { onEvent(e); } catch (x) { /* Beobachterfehler ignorieren */ } }
  };
  let L = null, exitCode = 0;
  let p;
  try { p = ladeProjekt(quelle); }
  catch (e) { p = { ok: false, fehler: { code: 'LaufzeitAnanas', art: 'ananas', text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', datei: null, zeile: null, spalte: null, detail: String(e && e.message) } }; }
  if (!p.ok) {
    // Ladefehler (SPEC §2.5): Exit 2, 0 Schritte, keine Warnungen davor
    const f = p.fehler;
    const ev = { typ: 'fehler', code: f.code, art: f.art, text: f.text, datei: f.datei, zeile: f.zeile, spalte: f.spalte };
    if (f.detail !== undefined) { ev.detail = f.detail; exitCode = 1; } else exitCode = 2;
    emit(ev);
  } else {
    try {
      // Standard-Argumente aus pizza.json gelten, wenn keine Argumente übergeben werden (SPEC §2.1)
      const opt = Object.assign({}, optionen, { kiste: p.kiste });
      if (p.args.length && !(Array.isArray(optionen.args) && optionen.args.length)) opt.args = p.args;
      L = new Laufzeit(p.ast, opt, emit);
      const rang = p.ast.ladeRang;
      // zuerst W0004 des Laders, dann die statische Analyse (SPEC §2.5); einmal je Code + Datei + Zeile + Spalte
      for (const w of p.warnungen.concat(analysiere(p.ast, rang))) {
        const key = warnSchluessel(w.code, w.d, w.zeile, w.spalte);
        if (L.warnSet.has(key)) continue;
        L.warnSet.add(key);
        emit({ typ: 'warnung', code: w.code, text: w.text, datei: L.dateiPfad(w.d), zeile: w.zeile, spalte: w.spalte });
      }
      L.start();
    } catch (e) {
      if (L) {
        try { exitCode = L.behandleEnde(e); }
        catch (e2) {
          emit({ typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas', text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', datei: null, zeile: null, spalte: null, detail: String(e2 && e2.message) });
          exitCode = 1;
        }
      } else {
        emit({ typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas', text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', datei: null, zeile: null, spalte: null, detail: String(e && e.message) });
        exitCode = 1;
      }
    }
  }
  const schritte = L ? L.schritte : 0;
  const zeitMs = L ? L.schritte + L.offset : 0;
  emit({ typ: 'ende', exitCode, schritte, zeitMs });
  return { exitCode, ereignisse, schritte, zeitMs };
}

// Startprüfung ohne Programmlauf (für Compiler-Frontends – der Wasm-Compiler nutzt genau diese Funktion, PROJEKTE PA2):
// registriert alle Deklarationen und führt die Prüfungen aus SPEC §14.7 aus (Q0004, P0010, P0011, R0001, A0001, P0013).
// → { fehler: null | { code, text, zeile, spalte, d } wie das fehler-Ereignis (art "pizzafehler", d = Datei-Index),
//     herdNoetig } – herdNoetig: das Programm braucht den Herd-Kern vor dem Start (K-128, wie in start()).
function startpruefung(ast) {
  const L = new Laufzeit(ast, {}, () => {});
  try {
    for (const d of ast.body) if (DEKL.has(d.k)) L.registriere(d);
    L.pruefe();
    return { fehler: null, herdNoetig: !!L.herdNoetig, klangNoetig: !!L.klangNoetig };
  } catch (e) {
    if (e instanceof PizzaFehlerSig) return { fehler: { code: e.code, text: 'PizzaFehler ' + e.code + ': ' + e.text, zeile: e.zeile, spalte: e.spalte, d: e.d || 0 }, herdNoetig: !!L.herdNoetig, klangNoetig: !!L.klangNoetig };
    throw e;
  }
}
function pruefeStart(ast) { return startpruefung(ast).fehler; }

return {
  version: VERSION,
  KEYWORDS: KEYWORDS.slice(),
  TYPEN: TYPEN.slice(),
  BUILTINS: BUILTINS.slice(),
  ANANAS: ANANAS.slice(),
  PANIK_TEXT: PANIK_BANNER,
  parse,
  run,
  // Projekte (SPEC §2, ARCHITEKTUR §1): gemeinsamer Lader, pizza.json, Pfadregel
  projekt: {
    lade: projektLade,
    ausDateien: (dateien) => { const r = ausDateien(dateien); return r.fehler ? { fehler: r.fehler } : r; },
    pruefePfad
  },
  // Für Compiler-Frontends (pizzaiolo), keine stabile Endnutzer-API; Beschreibung in ARCHITEKTUR §1.
  intern: {
    analysiere: (ast) => analysiere(ast, ast && ast.ladeRang).map(w => ({ code: w.code, text: w.text, zeile: w.zeile, spalte: w.spalte, d: w.d || 0 })),
    pruefe: pruefeStart,
    startpruefung,
    ANANAS_BAUM: ANANAS_BAUM.map(a => [a[0], a[1]]),
    MAX_STAPEL,
    STANDARD_LIMIT,
    UI_STIL: JSON.parse(JSON.stringify(UI_STIL)),
    HERD_TYPEN: HERD_KLASSEN.concat(HERD_KOMPONENTEN),
    KLANG_TYPEN: KLANG_KLASSEN.slice(),
    WINKEL: Object.assign({}, WINKEL),  // K-137: Winkelfunktionen (Bitgleichheitstest gegen die Wasm-Laufzeit)
    LOGEXP: Object.assign({}, LOGEXP)   // U-72: log/log10/log2/exp (ebenso)
  }
};
