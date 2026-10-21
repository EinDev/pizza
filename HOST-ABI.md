# pizzaiolo – Host-ABI v1 (verbindlich)

Diese Datei beschreibt, wie ein **Host** (JS: Browser/Node · Rust/wasmi: nativ/EXE) ein kompiliertes
pizza-Programm (`.pkarton`) ausführt. Ein Host braucht nur das hier – keine Kenntnis von IR oder Laufzeit-Interna.

## 1. Das `.pkarton`

- Ein `.pkarton` ist **genau ein gültiges WebAssembly-Modul** (Binärformat, Magie `\0asm`, Version 1).
  Der Compiler **linkt** das Programm und die Laufzeit (`laufzeit.wasm`, Rust `no_std`) zu einem einzigen
  Modul zusammen. Es gibt keinen Container, keine zweite Datei, kein Linken im Host.
- Erlaubte Wasm-Features: **MVP + bulk-memory + multi-value + mutable-globals + sign-ext + nontrapping-fptoint**.
  Kein GC, kein Exception Handling, kein `externref`, keine SIMD, keine Threads.
  (Läuft daher in Browsern, Node, wasmi, wasmtime und über `wasm2c`.)
- Custom Section `pizzaiolo` (UTF-8-JSON, nur informativ, Host darf sie ignorieren):
  `{ "format": "pkarton/1", "abi": 1, "compiler": "<version>", "laufzeit": "<hash>" }`.
- Dateiendung `.pkarton`; MIME `application/wasm`.

## 2. Imports (Modulname `pizza`)

Alle Texte sind **UTF-8**, übergeben als `(ptr: i32, len: i32)` in den exportierten `memory`.
Der Host muss die Bytes **während des Aufrufs** kopieren/dekodieren (Speicher kann später wachsen/sich ändern).
`zeile`/`spalte` sind ab 1; **0 bedeutet „unbekannt“** (→ `null` im Ereignis).

| Import | Signatur | Ereignis (ARCHITEKTUR §1) |
|---|---|---|
| `ausgabe` | `(ptr i32, len i32) -> ()` | `{ typ: "ausgabe", text }` |
| `fehlerausgabe` | `(ptr i32, len i32) -> ()` | `{ typ: "fehlerausgabe", text }` |
| `warnung` | `(code_ptr i32, code_len i32, text_ptr i32, text_len i32, zeile i32, spalte i32) -> ()` | `{ typ: "warnung", code, text, zeile, spalte }` |
| `fehler` | `(art i32, code_ptr i32, code_len i32, text_ptr i32, text_len i32, zeile i32, spalte i32) -> ()` | `{ typ: "fehler", code, art, text, zeile, spalte }` |
| `panik` | `(ptr i32, len i32) -> ()` | `{ typ: "panik", text }` |
| `schreibe` | `(ptr i32, len i32) -> ()` | `{ typ: "ausgabe", text, umbruch: false }` (`Bote.schreibe`) |
| `leeren` | `() -> ()` | `{ typ: "leeren" }` (`Bote.leeren`) |
| `eingabe` | `(art i32, prompt_ptr i32, prompt_len i32, puffer_ptr i32, puffer_kap i32) -> i32` | siehe unten; Host emittiert danach `{ typ: "eingabe", text }` |

`art` bei `fehler`: `1` = `"pizzafehler"`, `2` = `"ananas"`, `3` = `"limit"` (`0` = `"syntax"`, kommt aus Wasm nie vor).

Alle Texte sind bereits fertig formatiert (z. B. `Ungefangene Ananas – StreitAnanas: Pizza ist alle. (Zeile 12)`,
`W0003: Methode 'x' ist veraltet.`). Der Host fügt nichts hinzu und entfernt nichts.

**`panik`**: Der Host meldet das Ereignis. Er **darf** danach sofort abbrechen (JS: werfen, wasmi: Trap/`Err`
zurückgeben) – dann beendet er den Lauf selbst mit Exit-Code **39** (und `ende`). Kehrt `panik` normal zurück,
wickelt das Modul selbst ab und `start` liefert 39. Beides ist korrekt.

**`eingabe`** (EINGABE.md, `Bestellannahme`): `art` 0 = `"zeile"`, 1 = `"zahl"`; `prompt_len = -1` bedeutet
`prompt: null` (sonst ist der Prompt bereits vorher per `schreibe` ausgegeben worden und wird nur zur Info
übergeben). Der Host liefert die nächste Eingabezeile (ohne Zeilenumbruch) als UTF-8 in
`[puffer_ptr, puffer_ptr + puffer_kap)` und gibt die Byte-Länge zurück; **`-1` = EOF**. Zu lange Zeilen werden
auf `puffer_kap` Bytes (an einer UTF-8-Zeichengrenze) gekürzt, der Rest verworfen (`puffer_kap` ist ≥ 65 536).
Der Host emittiert direkt danach `{ typ: "eingabe", text }` (`text: null` bei EOF). JS-Host: `optionen.onEingabe`
(Vorrang) bzw. `optionen.eingabe: string[]`; fehlt beides → sofort EOF. Warten kostet keine Schritte.
Nativer Host: liest von stdin.

Imports dürfen **nicht** zurück in das Modul rufen (keine Re-Entranz).

## 3. Exports

| Export | Signatur | Bedeutung |
|---|---|---|
| `memory` | Memory | linearer Speicher (wächst ggf. während des Laufs) |
| `abi_version` | `() -> i32` | liefert `1` |
| `limit_setzen` | `(schritte f64) -> ()` | Schrittlimit (`optionen.schrittLimit`); Werte ≤ 0 oder NaN → Standard 5 000 000. Optional, vor `start`. |
| `speicher_limit_setzen` | `(mib i32) -> ()` | Heap-Obergrenze in MiB (Standard 64). Optional, vor `start`. |
| `arg_puffer` | `(len i32) -> i32` | liefert Zeiger auf `len` beschreibbare Bytes für das nächste Argument |
| `arg_fertig` | `(len i32) -> ()` | übernimmt die `len` Bytes aus dem zuletzt gelieferten Puffer als nächstes Argument |
| `start` | `() -> i32` | führt das Programm aus, liefert den **Exit-Code** |
| `schritte` | `() -> f64` | ausgeführte Schritte (ganzzahlig) |
| `zeitMs` | `() -> f64` | simulierte Uhr in ms (= Schritte + vorgespulte Zeit) |

Weitere Exports (Laufzeit-Interna, Präfix `rt_`/`__`) sind **nicht** Teil des ABI und dürfen sich ändern.

### Argumente für `hauptgang` (Speicherprotokoll)

Für jedes Argument `a` (in Reihenfolge), **vor** `start`:
```
bytes = utf8(a)
p = arg_puffer(bytes.length)        // darf 0 Bytes sein
memory[p .. p+len) = bytes          // Speicher-Ansicht NACH dem Aufruf neu holen (memory kann gewachsen sein)
arg_fertig(bytes.length)
```
Ohne Aufrufe ist `args` ein leeres Blech.

## 4. Ablauf eines Laufs

```
inst = instanziiere(pkarton, { pizza: { ausgabe, fehlerausgabe, warnung, fehler, panik } })
[inst.limit_setzen(n)] [inst.speicher_limit_setzen(mib)] [Args übergeben]
exitCode = inst.start()              // alle Ereignisse kommen synchron, in Auftretensreihenfolge
emit { typ: "ende", exitCode, schritte: inst.schritte(), zeitMs: inst.zeitMs() }
```
- Pro Instanz wird `start` **höchstens einmal** aufgerufen.
- **Trap** (Bug, Wasm-Stapelüberlauf, Speicher des Hosts erschöpft) während `start`: Der Host meldet
  `{ typ: "fehler", code: "LaufzeitAnanas", art: "ananas", text: "Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen: <Trap-Meldung>", zeile: null, spalte: null }`,
  Exit-Code **1**, danach `ende` mit `schritte()`/`zeitMs()` (nach einem Trap weiter aufrufbar). Ausnahme: der Host hat
  selbst in `panik` abgebrochen → Exit-Code 39 ohne Fehlerereignis.
- Das Schrittlimit, Ofen-/Lieferbudgets, Ananas, Hawaii-Panik usw. behandelt **das Modul selbst** – der Host
  muss nichts davon kennen.

## 5. Exit-Codes

| Code | Bedeutung |
|---|---|
| 0 | gegessen (alles gut) |
| 1 | ungefangene Ananas (inkl. Speicherlimit: `LaufzeitAnanas: Der Kühlschrank ist voll (Speicherlimit erreicht).`) |
| 2 | PizzaFehler (B0012, R0001, Q0004, A0001, P0010, P0011 …) |
| 3 | Schrittlimit (P0002) |
| 39 | Hawaii-Panik |

Syntaxfehler (`art: "syntax"`) entstehen nie zur Laufzeit – ein Programm mit Syntaxfehler wird nicht kompiliert.

## 6. Anforderungen an Hosts

- **Stapel:** Das Modul begrenzt die pizza-Aufruftiefe selbst (900, wie der Interpreter → `LaufzeitAnanas:
  Zu viele Pizzen übereinander (Stapelüberlauf).`). Ein pizza-Aufruf kann bis zu ~8 Wasm-Rahmen belegen.
  Hosts müssen daher **≥ 16 384 verschachtelte Wasm-Aufrufe** und **≥ 4 MiB Wert-Stapel** erlauben
  (wasmi: `Config`-Stapelgrenzen entsprechend setzen). Die Rust-Laufzeit hat zusätzlich einen eigenen
  Schattenstapel (1 MiB) im linearen Speicher.
- **Speicher:** Der lineare Speicher wächst über `memory.grow` bis Heap-Limit + statische Daten
  (Standard ~ 70 MiB). Hosts sollen mindestens 128 MiB zulassen.
- **Determinismus:** Keine Imports für Zeit/Zufall – Uhr und Zufall (mulberry32, Seed 42) sind simuliert.
  Gleiches `.pkarton` + gleiche Args ⇒ gleiche Ereignisse, gleicher Exit-Code, gleiche `schritte`/`zeitMs`.

## 7. Empfohlene CLI-Ausgabe (nativer Host, wie `bin/pizza.js`)

| Ereignis | Ausgabe |
|---|---|
| `ausgabe` | stdout: `text + "\n"` |
| `fehlerausgabe` | stderr: `text + "\n"` |
| `warnung` | stderr: `"⚠ " + text + " (Zeile z, Spalte s)"` (Positionsteil nur, wenn bekannt) |
| `fehler` | stderr: `text` (+ Position bei `pizzafehler`) |
| `panik` | stderr: `text` |
| `ende` | Prozess-Exit-Code = `exitCode` |

## 8. Minimaler JS-Host (Referenz)

```js
function fuehreAus(pkarton, args = [], emit = console.log) {
  let inst;
  const mem = () => new Uint8Array(inst.exports.memory.buffer);
  const t = (p, n) => new TextDecoder().decode(mem().subarray(p, p + n));
  const pos = (x) => (x > 0 ? x : null);
  const ARTEN = ['syntax', 'pizzafehler', 'ananas', 'limit'];
  const pizza = {
    ausgabe: (p, n) => emit({ typ: 'ausgabe', text: t(p, n) }),
    fehlerausgabe: (p, n) => emit({ typ: 'fehlerausgabe', text: t(p, n) }),
    warnung: (cp, cn, tp, tn, z, s) => emit({ typ: 'warnung', code: t(cp, cn), text: t(tp, tn), zeile: pos(z), spalte: pos(s) }),
    fehler: (a, cp, cn, tp, tn, z, s) => emit({ typ: 'fehler', code: t(cp, cn), art: ARTEN[a], text: t(tp, tn), zeile: pos(z), spalte: pos(s) }),
    panik: (p, n) => emit({ typ: 'panik', text: t(p, n) }),
    schreibe: (p, n) => emit({ typ: 'ausgabe', text: t(p, n), umbruch: false }),
    leeren: () => emit({ typ: 'leeren' }),
    eingabe: (art, pp, pn, bp, kap) => {           // hier: keine Eingabe → EOF
      emit({ typ: 'eingabe', text: null });
      return -1;
    },
  };
  inst = new WebAssembly.Instance(new WebAssembly.Module(pkarton), { pizza });
  for (const a of args) {
    const b = new TextEncoder().encode(a);
    const p = inst.exports.arg_puffer(b.length);
    mem().set(b, p);
    inst.exports.arg_fertig(b.length);
  }
  let exitCode;
  try { exitCode = inst.exports.start(); }
  catch (e) {
    emit({ typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas',
      text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen: ' + e.message, zeile: null, spalte: null });
    exitCode = 1;
  }
  emit({ typ: 'ende', exitCode, schritte: inst.exports.schritte(), zeitMs: inst.exports.zeitMs() });
  return exitCode;
}
```

## 9. Versionierung

Änderungen, die Hosts brechen, erhöhen `abi_version` und `"abi"` in der Custom Section. Hosts sollen bei
unbekannter Version mit einer klaren Meldung abbrechen.
