# pizzaiolo – IR v1 („Teigling“)

Die IR ist die Grenze zwischen Frontend (`site/js/pizzaiolo/frontend.js`) und allen Backends
(`backend-wasm.js` jetzt, C/nativ später). Sie ist **reines JSON** (serialisierbar mit `JSON.stringify`,
keine Zyklen, keine Funktionen) und wird von `ir.js` validiert (`IR.pruefe(programm)`) und gedruckt (`IR.drucke`).

Grundidee: Die IR ist ein **aufgelöster, typisierter Baum** – nah am AST, aber
- alle Namen sind aufgelöst (lokal / Zelle / global / dynamisch),
- jeder Knoten trägt seinen **statischen Typ** (`t`) und seine **Schrittzahl** (`st`),
- Deklarationen (Klassen, Beläge, …) sind Tabellen, Funktionen sind flach durchnummeriert,
- statische Prüfungen (Warnungen W0666/W0032, Startfehler P0010/P0011/Q0004/R0001/A0001) sind bereits erledigt.

## 1. Programm

```js
{
  format: "pizza-ir/1",
  pos: [[0,0], [z,s], …],          // Positionstabelle; Index 0 = unbekannt (null/null). Knoten referenzieren per Index.
  warnungen: [{ code, text, pos }], // statische Warnungen, bereits in Ausgabereihenfolge (analysiere())
  startfehler: null | { code, text, pos },   // dann: nur Warnungen + dieser Fehler, Exit 2, 0 Schritte
  klassen:    [Klasse],             // Reihenfolge = Registrierung (klassenListe des Interpreters), inkl. innerer
  rezepturen: [{ name, basen: [name], methoden: [name] }],
  enums:      [{ name, werte: [name×4] }],
  belaege:    [{ name, preis, nach: [name], methoden: { name: fnId } }],   // nur eigene `belag`-Deklarationen
  globaleFunktionen: { name: [fnId] },   // top-level Methoden (Überladung nach Parameterzahl)
  globale:    [{ name, t, gebacken, zustand }],   // Variablen des globalen Scopes (Snack-Modus)
  funktionen: [Funktion],
  vorbereiten: [Init],              // Annotationen (@Kühlschrank, @PizzaVeraltet), statische Feld-Inits – in Interpreter-Reihenfolge
  oben: fnId,                       // Top-Level-Anweisungen (Snack-Modus) als Funktion
  haupt: null | { klasse: name|null, name: "hauptgang" }
}
```

### Klasse
```js
{ name, basis: name|null, erfuellt: [name], rohling, gebacken, calzone,
  felder: [{ name, t: Typ, gebacken, sicht: null|"geheimrezept"|"familienrezept", statisch, init: fnId|null }],
  methoden: [{ name, fn: fnId|null /*rohling*/, statisch, sicht, haltbar: null|"init", veraltet: bool, ueberschreibt }],
  ktoren: [{ fn: fnId, hatUnten }],
  feldInit: fnId|null }            // Instanzfeld-Initialisierer der Klasse (feldInit() des Interpreters)
```

### Typ (deklarierter Quelltyp)
`{ name: "salami"|"funghi"|"margherita"|"diavolo"|"Dauer"|"Pizza"|"hawaii"|<Klassenname>|…, feld: n }` oder `null`.
Wird für Laufzeit-Typprüfungen (`TypAnanas`) unverändert benutzt.

## 2. Funktionen

```js
{ id, art: "methode"|"ktor"|"lambda"|"belag"|"oben"|"feldinit"|"init",
  name, klasse: name|null, ktor: bool,            // statischer Kontext (ctx.klasse / ctx.ktor)
  params: [{ name, typ: Typ, nieKarton, gebacken, slot }],
  strikt: bool,                                   // Methoden: Argumentzahl prüfen; Lambdas: nein
  lokale: [{ name, d: Darst, zelle: bool }],      // slot = Index
  fang: [slot],                                   // Zellen, die eine Lambda aus der Umgebung erbt (Index in env)
  rueck: Darst,                                   // Rückgabe-Darstellung (Optimierung; "wert" = generisch)
  body: [Anw]  | ausdr: Ausdr                    // Lambda mit Ausdrucksrumpf: ausdr
}
```

**Darstellungen** (`Darst`, Backend-relevant): `"zahl"` (f64, ungeboxt; salami/funghi), `"bool"` (i32),
`"wert"` (generischer Wert, geboxt). Ein Slot ist nur dann ungeboxt, wenn das Frontend beweist, dass er nie
`karton`, „weggeschoben“ oder einen anderen Typ hält (deklarierter Typ salami/funghi/diavolo, nie Ziel von `schieb`).

## 3. Ausdrücke (`Ausdr`)

Jeder Ausdruck: `{ k, t, st, pos, … }` mit `t` ∈ `"zahl"|"ganz"|"bool"|"text"|"wert"` (statisches Wissen;
`"ganz"` = sicher ganzzahlig & endlich) und `st` = Schritte, die **dieser Knoten selbst** zählt (0 oder 1).

| `k` | Felder | Bedeutung |
|---|---|---|
| `konst` | `wert`, `art: zahl\|text\|bool\|karton\|dauer` | Literal |
| `lokal` | `slot` | lokale Variable / Parameter (`zelle` → über Zelle) |
| `umg` | `idx` | geerbte Zelle aus der Lambda-Umgebung |
| `global` | `idx`, `name` | Variable des globalen Scopes (ggf. „noch nicht deklariert“ → dynamischer Fallback) |
| `name` | `name` | dynamische Namensauflösung (Felder von `dies`, statische Felder, Globale, Klassen, Beläge, …) |
| `mem` | `obj`, `name` | Feldzugriff / Methodenreferenz |
| `bin` | `op`, `l`, `r` | `+ - * / % == != < <= > >=` |
| `log` | `op`, `l`, `r` | `&& \|\|` |
| `un` | `op`, `e` | `! -` |
| `tern` | `c`, `a`, `b` | `?:` |
| `mcall` | `obj`, `name`, `args` | Methodenaufruf |
| `ncall` | `name`, `args`, `ziel?` | unqualifizierter Aufruf; `ziel = {fn}` wenn statisch auflösbar (Direktaufruf) |
| `call` | `callee`, `args` | Funktionswert aufrufen |
| `unten` / `untenCall` / `untenM` | … | `unten`, `unten(…)` im Konstruktor, `unten.m(…)` |
| `dies` | – | |
| `neu` | `typ`, `args` | |
| `pizza` | `belaege: [name]` | Pizza-Literal |
| `blech` / `bereich` | `elemente` / `a`,`b` | |
| `lambda` | `fn`, `fang: [Quelle]` | Closure (Quelle = `{slot}` oder `{umg}`) |
| `ofen` | `args`, `body`, `roh`, `faenge` | Ofen-Ausdruck |
| `waehleA` | `subj`, `faelle` | wähle als Ausdruck |
| `schieb` | `ziel` | `schieb(x)` |

`args = { pos: [Ausdr], ben: null | [{ name, e: Ausdr }] }`.

## 4. Anweisungen (`Anw`)

Jede Anweisung `{ k, st, pos, … }` (`st` = 1 für jede Anweisung, die der Interpreter mit `fuehre` ausführt).

`ausdr`, `var` (`decls: [{slot|global, init, typ, gebacken}]`), `zuw` (`ziel`, `op`, `wert`), `inc`, `block`
(`neuerScope`), `falls`, `solange`, `fuer`, `fuerJedes`, `waehle`, `serviere`, `wirf`, `probier`
(`block`, `faenge: [{typ, slot, block}]`, `rand`), `abbrechen`, `weiter`, `leer`.

## 5. Schritt-Semantik (verbindlich für alle Backends)

1. Der Interpreter zählt **jeden** `ausw`-Aufruf (Ausdrucksknoten) und **jeden** `fuehre`-Aufruf (Anweisung) als
   einen Schritt, **vor** der Auswertung des Knotens: `schritte++; if (schritte > grenze) grenzeErreicht()`.
   Bei einer Anweisung wird die aktuelle Position (`z/s`) **erst nach** dieser Prüfung gesetzt.
2. Die IR trägt diese Schritte als `st` an den Knoten. Backends dürfen Schritte **bündeln**, solange an jedem
   beobachtbaren Punkt dieselbe Summe steht. Beobachtbar sind: jede Laufzeitfunktion, jeder Aufruf, jede
   Speicher-/Variablenänderung, jeder mögliche Wurf, Rücksprünge und Schleifenkanten.
   Vor einem solchen Punkt müssen alle bis dahin „ausgewerteten“ Schritte addiert und geprüft sein.
3. Überschreitet ein Bündel von `k` Schritten die Grenze, muss das Backend den genauen Überschreitungspunkt
   rekonstruieren: `schritte = max(s0+1, floor(grenze)+1)`; lag er auf dem ersten Schritt eines Bündels, das mit
   einer Anweisung beginnt, gilt noch die **alte** Position. (Wasm: `rt_grenze(k, flags, posNeu)`.)
4. Die Uhr ist `schritte + offset` (ms). `grenze = min(limit, ofen/lieferung-Budgetenden − offset)`.

## 6. Ananas-Konvention (ohne Wasm-EH)

- Ein globales **Signalregister** (`sig`): 0 = keins, 1 = Ananas (fangbar), 2 = Budget (Ofen/Lieferung; nur von
  `ofen`/`warte` gefangen, `rand` läuft), 3 = PizzaFehler (fatal), 4 = Schrittlimit (fatal), 5 = Panik (fatal,
  nicht fangbar, `rand` läuft nicht).
- Jede Operation, die werfen kann (Laufzeitfunktion, Aufruf), wird danach mit `sig != 0` geprüft; gesetzt →
  Sprung zum innersten Handler der Funktion (`probier`, `ofen`) oder zum Funktionsende (Rückgabe, Aufrufer prüft).
- Die Ananas-Nutzlast (Objekt, Zeile, Spalte) liegt in der Laufzeit. Erzeugte Ananas tragen die **aktuelle
  Position** (`pos`-Register), `wirf` die Position der `wirf`-Anweisung.
- Rückgabewerte laufen wie im Interpreter über ein globales `rueck`-Register (wichtig für `rand`-Blöcke).
- Jede Funktion sichert beim Eintritt das `pos`-Register und stellt es beim Verlassen (auch bei Signal) wieder her.

## 7. Fallback

Konstrukte, die das Frontend (noch) nicht exakt abbilden kann, werden als
`nichtUnterstuetzt: [{ zeile, spalte, grund }]` gemeldet – dann läuft der Interpreter.
