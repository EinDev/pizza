# pizzaiolo – IR v1 („Teigling“)

Die IR ist die Grenze zwischen Frontend (`site/js/pizzaiolo/frontend.js`) und allen Backends
(`backend-wasm.js` jetzt, C/nativ später). Sie ist **reines JSON** (serialisierbar, keine Zyklen, keine Funktionen),
wird von `ir.js` geprüft (`IR.pruefe(ir)` → Liste von Problemen) und gedruckt (`IR.drucke(ir)`).
Erzeugen: `Pizzaiolo.kompiliere(q, { mitIR: true }).ir` bzw. `frontend.frontend(PizzaLang.parse(q).ast).ir`.

Grundidee: ein **aufgelöster Baum** – nah am AST, aber
- alle Namen sind aufgelöst (lokal / Zelle / global / dynamisch / Laufzeitname),
- jeder Knoten trägt Position `p` (Index in `pos`) und statische Stapeltiefe `tf`,
- Deklarationen sind Registrierungs-Einträge, Funktionen sind flach durchnummeriert,
- statische Prüfungen sind erledigt: Warnungen (W0666, W0032) und Startfehler (P0010, P0011, Q0004, R0001, A0001).

## 1. Programm

```js
{
  format: "pizza-ir/1",
  pos: [[0,0], [z,s], …],              // Positionstabelle; Index 0 = unbekannt (null/null)
  warnungen: [{ code, text, pos }],    // statische Warnungen in Ausgabereihenfolge (wie analysiere())
  startfehler: null | { code, text, pos },  // dann: nur Warnungen + dieser Fehler, Exit 2, 0 Schritte
  registrierung: [Reg],                // exakt in Registrierungsreihenfolge des Interpreters (siehe unten)
  methoden: [{ art, klasse, name }],   // Laufzeit-Methoden-IDs = Index (Reihenfolge der rt_methode/rt_ktor/rt_belag_methode)
  globale: [name],                     // Variablen des globalen Scopes (Speicherzellen, Anfangswert „undefiniert“)
  globaleFunktionen: [name],           // Top-Level-Methoden: globale Variable mit Gebunden-Wert
  globalInfos: { name: { typ, gebacken } },
  schiebNamen: [name],                 // Namen, die irgendwo Ziel von schieb(x) sind (Lesezugriffe prüfen „weggeschoben“)
  funktionen: [Funktion],              // id = Index (= Laufzeit-Funktions-ID)
  vorbereiten: fnId,                   // Annotationen + statische Initialisierer (Interpreter: vorbereiten())
  oben: fnId                           // Top-Level-Anweisungen; liefert den Wert der globalen Variable `hauptgang`
}
```

`Reg` (Reihenfolge = `registriere()`; innere Klassen direkt nach der äußeren):
- `{ art: "klasse", name, idx, flags (1 rohling, 2 gebacken, 4 calzone), basis, erfuellt: [name],
  felder: [{ name, typ, flags (1 gebacken, 2 statisch), sicht (0, 1 geheim, 2 familie) }],
  methoden: [{ name, fn|null, flags (1 statisch), sicht, nparam, pos, mid }], ktoren: [{ fn, hatUnten, mid }],
  feldInit: fnId|null, statInit: fnId|null }` – `idx` = Laufzeit-Klassenindex (17 + n; 0–16 sind die eingebauten Ananas).
  `KüchenAnanas` (SPEC §17, K-100) gibt es im Wasm noch nicht: Programme mit `brigade` oder `KüchenAnanas` meldet das
  Frontend als `nichtUnterstuetzt`. Erst mit THREADS-Paket P2 wird sie Laufzeitklasse 17 (`erbt LaufzeitAnanas`, am Ende von
  `ANANAS_BAUM`, bestehende Indizes 0–16 bleiben) und eigene Klassen beginnen bei **18** (`idx` = 18 + n; 0–17 eingebaut).
  Die Verschiebung ist intern (jedes `.pkarton` bringt seine Laufzeit mit; kein ABI-Bruch). Eine eigene Klasse namens
  `KüchenAnanas` überschattet die eingebaute wie bei allen eingebauten Ananas (K-098).
- `{ art: "rezeptur", name, basen: [name] }`, `{ art: "enum", name, werte: [name×4] }`,
- `{ art: "belag", name, nach: [name]|null (null = Tabellenwert), methoden: [{ name, fn, mid }] }`,
- `{ art: "globalfn", name, fn, nparam, pos, mid }`.
Basisklassen/Rezepturen werden **nach** allen Registrierungen über den Namen verknüpft (Map-Semantik: spätere gewinnen).

## 2. Funktionen

```js
{ id, art: "methode"|"ktor"|"lambda"|"belag"|"oben"|"feldinit"|"statinit"|"init",
  name, klasse: idx|null, ktor: bool, belag: bool,   // statischer Kontext (ctx.klasse / ctx.ktor / Belag-Methode)
  plus1: bool,          // Rumpf zählt +1 Stapeltiefe (Methoden, Konstruktoren, Lambdas, Belag-Methoden)
  strikt: bool,         // Argumentzahl prüfen (Methoden ja, Lambdas nein)
  params: [{ name, typ, nieKarton, gebacken, slot, darst }],
  slots: [{ name, typ: {name, feld}|null, gebacken, zelle, weg, unbelegt, darst, redekl? }],
  fang: [{ art: "lokal", slot } | { art: "umg", idx }],   // nur Lambdas: Zellen aus der Elternfunktion (→ Umgebung)
  body: [Anw] | null, ausdr: Ausdr | null,               // Lambda mit Ausdrucksrumpf: ausdr
  hauptgangGlobal?: g }                                   // nur oben
```

**Darstellung** `darst`: `"zahl"` (f64, salami/funghi), `"bool"` (i32, diavolo), `"wert"` (generischer Wert).
Ungeboxt nur, wenn deklarierter Typ salami/funghi/diavolo, nicht gefangen (`zelle`) und nie Ziel von `schieb`.
Ein Slot ist (Scope, Name) – erneute Deklaration im selben Scope ist derselbe Slot (wie `Map.set` im Interpreter).
`zelle`: von einer Lambda gefangen → Heap-Zelle, bei jeder Ausführung der Deklaration neu.
Top-Level-Variablen, die nur im Top-Level-Code vorkommen, werden zu Slots von `oben` befördert.

## 3. Ausdrücke (`Ausdr`)

Jeder Ausdruck: `{ k, p, tf, zus, … }`; `zus` = zusammengesetzt (zählt Stapeltiefe, §14.4).

| `k` | Felder | Bedeutung |
|---|---|---|
| `konst` | `art: zahl\|text\|bool\|karton\|dauer\|auto`, `wert` | Literal (`auto` nur als Argument von `schneide`) |
| `lies` | `ref`, `name` | Name lesen; `ref` siehe unten |
| `bin` | `op` (0 + · 1 − · 2 * · 3 / · 4 % · 5 == · 6 != · 7 < · 8 <= · 9 > · 10 >=), `l`, `r` | |
| `log` | `und`, `l`, `r` | `&&` / `\|\|` (kurzgeschlossen) |
| `un` | `op` (0 `!`, 1 `-`), `e` | |
| `tern` | `c`, `a`, `b` | |
| `mcall` | `obj`, `name`, `args` | `o.m(…)` |
| `untenM` | `name`, `args` | `unten.m(…)` |
| `ncall` | `name`, `ziel`, `args`, `direkt?` | unqualifizierter Aufruf; `ziel.art`: `wert` (lokale Variable), `kontext` (Methoden von `dies`/Pizza zuerst, dann `ziel.ref`), `name` (Wert von `ziel.ref`), `schiebFehler`; `direkt` = fnId bei statisch auflösbarer Top-Level-Funktion |
| `call` | `callee`, `args` | Funktionswert aufrufen |
| `mem` | `obj`, `name` | Feldzugriff / Methodenreferenz |
| `dies`, `unten` | – | |
| `untenCall` | `args` | `unten(…)` im Konstruktor |
| `neu` | `typ`, `args` | `neu Hawaii(…)` → Panik vor den Argumenten |
| `pizza` | `belaege: [name]` | Pizza-Literal (ein einzelner unbekannter Name wird zu `lies`) |
| `blech` / `bereich` | `elemente` / `a`, `b` | |
| `lambda` | `fn` | Closure; Fänge stehen in `funktionen[fn].fang` |
| `schieb` | `ref`, `name` | `schieb(x)` |
| `ofen` | `args`, `body`, `roh: {slot, body}\|null`, `faenge: [{typ, slot, block}]` | Ofen-Ausdruck |
| `waehleA` | `subj`, `faelle: [{labels\|null, block\|null, e\|null}]` | wähle als Ausdruck; Label mit `enumName` = bloßer Name |

`args = { pos: [Ausdr], ben: null | [{ name, e }] }`.

**Namensreferenzen** `ref`: `{art:"lokal", slot}` · `{art:"umg", idx, typName, gebacken}` (Zelle aus der Lambda-Umgebung) ·
`{art:"global", g, name, sicher}` (`sicher` = statisch schon deklariert, sonst Laufzeitprüfung „undefiniert“ → Rückfall auf
den Laufzeitnamen) · `{art:"dyn", name, g|null}` (Feld von `dies`/statisches Feld zur Laufzeit, dann globale Variable, dann
Laufzeitname) · `{art:"gname", name}` (Bote, Klassen, Beläge … oder „ist nicht definiert“).

## 4. Anweisungen (`Anw`)

Jede Anweisung `{ k, p, tf, … }`:
`ausdr {e}` · `leer` · `var {decls: [{name, ziel (lokal|global), init, typ, gebacken, besitz, std}]}` ·
`zuw {op, ziel, wert, besitz}` (Ziel: Referenz wie oben, `{art:"mem", obj, name}` oder `{art:"undef", name}`) ·
`inc {ziel, d}` · `block {body}` · `falls {c, dann, sonst, sonstFalls}` · `solange {c, body}` ·
`fuer {init, c, body, upd}` · `fuerJedes {quelle, slot, typ, name, body}` · `waehle {subj, faelle: [{labels, block, anw}]}` ·
`serviere {e}` · `wirf {e}` · `probier {block, faenge: [{typ, slot, block}], rand}` · `abbrechen` · `weiter`.
Nur in Initialisierungsfunktionen (zählen **keinen** eigenen Schritt): `feldinit {name, typ, e, besitz}`,
`statinit {…}`, `annoHaltbar {mid, e}`, `annoVeraltet {mid, e}`, `rufeInit {fn}`.

## 5. Schritt-Semantik (verbindlich für alle Backends)

1. Der Interpreter zählt **jeden** Ausdrucksknoten und **jede** Anweisung als einen Schritt, **vor** der Auswertung:
   `schritte++; if (schritte > grenze) grenzeErreicht()`. Bei einer Anweisung wird die Position erst **nach** dieser
   Prüfung gesetzt. In der IR zählt jeder Knoten genau 1 (Ausnahmen: Init-Anweisungen oben; Enum-Labels in `wähle`, die
   nur verglichen werden, wenn das Subjekt ein quattrostagioni-Wert ist).
2. Backends dürfen Schritte **bündeln**, solange an jedem beobachtbaren Punkt dieselbe Summe steht. Beobachtbar sind:
   jede Laufzeitfunktion, jeder Aufruf, jede Variablenänderung, jeder mögliche Wurf und **jede Kontrollflussgrenze**
   (Verzweigung, Schleife, Sprung) – dort muss das Bündel gebucht sein.
3. Überschreitet ein Bündel von `k` Schritten die Grenze, rekonstruiert das Backend den genauen Punkt:
   `schritte = max(s0+1, floor(grenze)+1)`; lag er auf dem ersten Schritt eines Bündels, das mit einer Anweisung
   beginnt, gilt noch die **alte** Position (Wasm: `rt_grenze(k, flags, posNeu)`).
4. Uhr = `schritte + offset` (ganze ms). `grenze = min(limit, Budgetende − offset)` über alle aktiven Ofen/Lieferungen.
5. **Stapeltiefe** (§14.4): T = Tiefe beim Funktionseintritt + `tf` des Knotens; Überschreitung von 1500 an genau dem
   ersten Knoten mit `tf > 1500 − T₀`. Wasm erzeugt je Funktion eine Variante ohne und eine mit Prüfung je Knoten und
   wählt beim Eintritt (`T₀ + max(tf) ≤ 1500` → ohne).

## 6. Ananas-Konvention (ohne Wasm-EH)

- Ein **Signalregister** `sig`: 0 = keins, 1 = Ananas (fangbar), 2 = Budget (nur `ofen`/`warte` fangen, `rand` läuft),
  3 = PizzaFehler, 4 = Schrittlimit, 5 = Panik (3–5 fatal, `rand` läuft nicht).
- Nach jeder Operation, die werfen kann, `sig != 0` → Sprung zum innersten Handler (`probier`, `ofen`) bzw. Funktionsende.
- Erzeugte Ananas tragen die **aktuelle Position**, `wirf` die Position der `wirf`-Anweisung.
- Rückgabewerte laufen wie im Interpreter über ein globales `rueck`-Register (relevant für `rand`-Blöcke, die
  ihrerseits Funktionen aufrufen). Kontrollfluss aus `probier … rand` heraus läuft erst durch `rand`.
- Methoden, Konstruktoren und Lambdas sichern beim Eintritt die Position und stellen sie beim Verlassen wieder her
  (auch bei Signal); Top-Level-Code und Initialisierer nicht (wie der Interpreter).

## 7. Fallback

Was das Frontend nicht exakt abbilden kann, meldet es als `nichtUnterstuetzt: [{ zeile, spalte, grund }]` – dann läuft
der Interpreter. Derzeit: Variablendeklaration direkt als `wähle`-Arm, Lambda-Zugriff auf eine im umgebenden Scope erst
später deklarierte Variable, erneute Deklaration einer gefangenen Variable bzw. mit anderem Typ, Zuweisung an eine
gefangene gebackene Variable aus einer Lambda, mehrdeutige Ziele (Feld oder globale Variable desselben Namens),
`schieb` mit gleichnamiger Methode/Variable, `schneide(auto)` bei möglichem Feld `auto`.
