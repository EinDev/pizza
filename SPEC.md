# pizza v3.0 – Sprachspezifikation (verbindlich)

Diese Datei ist der **Vertrag** zwischen Interpreter, Beispielen, Doku und UI.
Alles, was hier als **Tier 1** oder **Tier 2** markiert ist, MUSS der Interpreter
(`site/js/pizza.js`) ausführen können. **Tier 3** ist nur Spezifikation (Doku zeigt
Badge „nur Spezifikation“), der Parser darf es aber nicht ablehnen, wo angegeben.

- **Tier 1** – läuft exakt wie beschrieben.
- **Tier 2** – läuft mit vereinfachter/simulierter Semantik (z. B. Parallelität sequentiell simuliert).
- **Tier 3** – nur Spezifikation (Toolchain, Generics-Prüfung, `wirft`-Prüfung).

Alle Meldungen, Fehlertexte und Bezeichner der Sprache sind **deutsch**.

---

## 1. Lexik (Tier 1)

- Quelltext ist UTF-8. Zeilen/Spalten zählen ab 1.
- Kommentare: `// bis Zeilenende` und `/* mehrzeilig */`.
- Bezeichner: Unicode-Buchstaben (inkl. `äöüÄÖÜß`), Ziffern, `_`; nicht mit Ziffer beginnend.
  **Groß-/Kleinschreibung ist signifikant.** `pizza`, `Pizza`, `PiZZa`, `piZZA` sind vier
  verschiedene, gültige Bezeichner. (`pizza` ist in v3.0 **kein** Keyword mehr.)
- Zahlen: `42`, `1_000_000`, `7.50`. Unterstriche werden ignoriert.
- Dauer-Literale: Zahl **direkt** gefolgt von Einheit `ms`, `s`, `min`, `h`, `d` → Wert vom Typ `Dauer`
  (intern Millisekunden). Beispiele: `90s`, `30min`, `1h`, `3d`, `500ms`, `1.5s`.
- Texte: `"..."` mit Escapes `\n`, `\t`, `\"`, `\\`.
- Operatoren/Satzzeichen: `+ - * / % == != < <= > >= && || ! ? : -> = += -= *= /= ++ -- . , ; ( ) { } [ ] @ ..`
- Anweisungen enden mit `;`. Blöcke stehen in `{ }`.

### Reservierte Keywords

```
paket import klasse rezeptur rohling calzone belag auf quattrostagioni
erbt erfüllt speisekarte familienrezept geheimrezept tiefkühl gebacken
leer neu dies unten serviere falls sonst für solange wähle fall standard
probier verbrannt rand wirf wirft abbrechen weiter ja nein karton ofen roh
```

- `ja` / `nein` – Wahrheitswerte. `karton` – null („leerer Karton“).
- Builtin-**Funktionen** (keine Keywords, aber global vordefiniert): `teig`, `bestelle`, `schieb`, `teile`, `zwischenstand`.

### Eingebaute Typnamen

| Typ | Bedeutung |
|---|---|
| `salami` | Ganzzahl |
| `funghi` | Kommazahl |
| `margherita` | Text |
| `diavolo` | Wahrheitswert |
| `Dauer` | Zeitdauer |
| `Pizza` | Pizza (siehe §6) |
| `Blech<T>` | Liste |
| `Speisekarte<K, V>` | Map |
| `Teig<T>`, `Lieferung<T>`, `Zustellung<T>`, `Stück<T>`, `Reste<T>`, `Rohling<T>` | Pizza-Funktionen (§7) |
| `hawaii` | kompiliert. Siehe §9. |

Generics werden geparst, aber **nicht geprüft** (Tier 3).

---

## 2. Programmaufbau (Tier 1)

```pizza
paket de.luigi.pizzeria;          // optional, wird ignoriert
import pizza.ofen.*;              // optional, wird ignoriert (Standardbibliothek ist immer da)

speisekarte klasse Pizzeria {
    speisekarte tiefkühl leer hauptgang(Blech<margherita> args) {
        Bote.sage(("Hallo, Pizzawelt!"));
    }
}
```

**Einstiegspunkt:** Die erste Klasse mit einer Methode `tiefkühl leer hauptgang(Blech<margherita> args)`.
Sie wird mit einem leeren `Blech` (oder den übergebenen Args) aufgerufen.

**Snack-Modus:** Anweisungen dürfen auch direkt auf oberster Ebene stehen (zwischen Deklarationen).
Ablauf: (1) alle Deklarationen werden registriert (Hoisting), (2) Top-Level-Anweisungen laufen
in Reihenfolge, (3) existiert `hauptgang`, wird er danach aufgerufen. So sind kurze Snippets lauffähig:

```pizza
Bote.sage(("Hallo!"));
```

---

## 3. Deklarationen (Tier 1, sofern nicht anders markiert)

### Modifikatoren

| pizza | Java | Regel |
|---|---|---|
| `speisekarte` | public | überall sichtbar |
| `familienrezept` | protected | eigene Klasse + Unterklassen |
| `geheimrezept` | private | nur eigene Klasse → sonst `ZugriffsAnanas` |
| *(keiner)* | package-private („Hausrezept“) | wie `speisekarte` |
| `tiefkühl` | static | |
| `gebacken` | final | Feld: nur bei Initialisierung oder im Konstruktor zuweisbar, sonst `GebackenAnanas`. Klasse: nicht erweiterbar → `PizzaFehler P0011` |
| `rohling` | abstract | Klasse nicht instanziierbar (`RohlingAnanas`: „Ein Rohling ist nicht essbar.“); Methoden ohne Rumpf (`;`) |
| `calzone` | – | siehe §7.8 |

Modifikatoren dürfen in beliebiger Reihenfolge stehen.

### Klassen

```
[Annotationen] [Modifikatoren] klasse Name [<T, ...>] [erbt Basis] [erfüllt R1, R2] { Mitglieder }
```

Mitglieder:
- Feld: `[mods] Typ name [= ausdruck];`
- Methode: `[mods] Typ|leer name(Parameter) [wirft A, B] { ... }` (bei `rohling`: `;` statt Rumpf)
- Konstruktor: `[mods] Name(Parameter) { ... }` – Name = Klassenname.
- Parameter: `[@Annotation] Typ name`.
- Im Konstruktor ruft `unten(args);` den Basiskonstruktor auf. Fehlt der Aufruf, wird der Basis-Konstruktor ohne Argumente aufgerufen (falls vorhanden).
- `dies` = aktuelle Instanz, `unten.methode()` = Methode der Basisklasse.
- Unqualifizierte Namen in Methoden: lokal → Instanzfeld → statisches Feld (eigene Klasse, dann Basis). Unqualifizierte Aufrufe `m()` → Instanz- oder statische Methode.
- Statische Mitglieder: `Klasse.feld`, `Klasse.methode()`.
- Methode `alsText()` (falls definiert) wird für Textumwandlung genutzt (wie `toString`).

### Rezepturen (Interfaces)

```pizza
speisekarte rezeptur Backbar {
    leer backe(salami grad) wirft VerbranntAnanas;
    diavolo istFertig();
}
```
Eine nicht-`rohling`-Klasse, die eine Rezeptur `erfüllt`, muss alle Methoden implementieren
(geprüft beim Programmstart) → sonst `PizzaFehler R0001: Klasse 'X' erfüllt Rezeptur 'Y' nicht: Methode 'z' fehlt.`
`wirft` wird geparst, aber nicht geprüft (Tier 3).

### quattrostagioni (Enums)

```pizza
quattrostagioni Jahreszeit { FRÜHLING, SOMMER, HERBST, WINTER }
```
Genau **4** Werte, sonst `PizzaFehler Q0004: quattrostagioni braucht genau 4 Werte, nicht N.`
Zugriff `Jahreszeit.SOMMER`; Methoden `name()`, `position()` (1–4); `Jahreszeit.werte()` → Blech.
Textform: der Name (`SOMMER`).

### Annotationen

Syntax: `@Name`, `@Name(wert)`, `@Name(schlüssel: wert, ...)` (auch `schlüssel = wert` erlaubt).

| Annotation | Wirkung |
|---|---|
| `@PizzaÜberschreibt` | Methode muss in Basisklasse/Rezeptur existieren → sonst `PizzaFehler A0001` (bei Start) |
| `@PizzaVeraltet(grund: "...")` | Warnung `W0003` beim ersten Aufruf |
| `@NieKarton` (Parameter) | `karton` als Argument → `LeererKartonAnanas` |
| `@Pizzaiolo(autor: "...")` | nur Metadaten |
| `@Kühlschrank(haltbar: Dauer)` | Methoden-Cache, §7.6 |
| `@Nach(Belag, ...)` | an `belag`-Deklaration, §6 |

---

## 4. Anweisungen (Tier 1)

- Variablendeklaration: `Typ name [= ausdruck];` (Typ darf `<...>`-Generics und `[]` tragen).
- Zuweisung: `ziel = ausdruck;`, `+=`, `-=`, `*=`, `/=`, `x++;`, `x--;` (Ziel: Variable oder Feld `a.b`).
- Ausdrucksanweisung: `ausdruck;`
- `falls (bedingung) { } sonst falls (bedingung) { } sonst { }` – Klammern um Bedingung und Blöcke **Pflicht**.
- `solange (bedingung) { }`
- `für (Typ x : ausdruck) { }` (über Blech, Text-Zeichen, Speisekarte-Schlüssel) und `für (init; bedingung; update) { }`.
- `wähle (ausdruck) { fall w1, w2 -> anweisung_oder_block  ...  standard -> ... }` – kein Durchfallen.
- `serviere (ausdruck);` – **Klammerpflicht**. `serviere;` (ohne Wert) ist in `leer`-Methoden erlaubt.
  `serviere x;` ohne Klammern → `PizzaFehler K0001: Klammerpflicht! serviere braucht Klammern: serviere (x);`
- `wirf ausdruck;` – wirft eine Ananas.
- `probier { } verbrannt (Typ a) { } verbrannt (a) { } rand { }` – try / catch (mehrfach, typisiert oder untypisiert) / finally.
- `abbrechen;` (break), `weiter;` (continue).

---

## 5. Ausdrücke (Tier 1)

Präzedenz (niedrig → hoch): `?:` · `||` · `&&` · `== !=` · `< <= > >=` · `+ -` · `* / %` · unär `! -` · Postfix (Aufruf, Mitglied `.`) · Primär.

Primär: Zahl, Dauer, Text, `ja`, `nein`, `karton`, Bezeichner, `dies`, `unten`, `(ausdruck)`,
Pizza-Literal, Blech-Literal `[a, b, c]`, Bereich `[a .. b]` (inklusive), Lambda, `neu Typ<...>(args)`, `ofen`-Ausdruck.

- `+` mit mindestens einem Text → Textverkettung. `/` ist exakte Division; Division durch 0 → `RechenAnanas` („Durch null teilen? Das ergibt keine Stücke.“).
- `==`/`!=`: Wertgleichheit für Zahlen, Texte, Wahrheitswerte, Dauer, Pizzen (gleiche Beläge in gleicher Reihenfolge), Beläge; sonst Identität.
- Lambdas: `(a, b) -> ausdruck`, `x -> ausdruck`, `() -> { block mit serviere (...); }`. Closures fangen den Scope ein.
  Funktionswerte werden mit `f(x)` aufgerufen.
- Benannte Argumente: `name: ausdruck` in Argumentlisten (für Builtins und für eigene Methoden – dann nach Parametername).
- Methodenreferenz: `obj.methode` / `Klasse.methode` ohne `()` → gebundener Funktionswert.
- **Pizza-Literal** `((Belag, Belag, ...))` bzw. `(())`: Der Parser erkennt `(` `(` gefolgt von
  ausschließlich großgeschriebenen einfachen Bezeichnern (kommagetrennt) und `)` `)` als Pizza-Literal.
  Alles andere (`((x + 1))`, `(("Text"))`, `((a.b))`) ist eine normale doppelte Klammerung.
- Doppelte Klammern um Ausdrücke sind stilistisch erwünscht (`Bote.sage(("Hallo"));`) und haben keine Bedeutung.

### Textform von Werten (`alsText`, Ausgabe)

| Wert | Text |
|---|---|
| Ganzzahl / Kommazahl | JS-Darstellung: `8`, `7.5`, `0.1` |
| `ja`/`nein` | `ja` / `nein` |
| `karton` | `karton` |
| Text | roh (ohne Anführungszeichen) |
| Blech | `[1, 2, 3]` |
| Speisekarte | `{a: 1, b: 2}` |
| Pizza | `((Tomate, Mozzarella))`, leer: `(())` |
| Belag | Name, z. B. `Salami` |
| Dauer | `1min 30s`, `90ms`, `2h`, `3d 4h`; 0 → `0ms` (größte Einheiten zuerst, Nullteile weglassen) |
| Objekt | `alsText()` falls vorhanden, sonst `Klassenname@N` (N = laufende Instanznummer ab 1) |
| Ananas | `Typ: Nachricht` |

---

## 6. Pizzen & Beläge (Tier 1)

- `Pizza p = ((Tomate, Mozzarella, Basilikum));` – Reihenfolge = von unten nach oben.
- `p + Salami` → **neue** Pizza mit Salami oben; `p - Chili` → neue Pizza ohne (alle) Chili.
- Großgeschriebener Bezeichner, der keine Variable/Klasse ist, aber ein bekannter Belag → Belag-Wert.
  Unbekannt → `UnbekannterBelagAnanas: 'Xyz' steht nicht auf der Zutatenliste.`
- Pizza-Methoden: `preis()`, `beläge()` (Blech der Belagnamen als Text), `hat(Belag)`, `anzahlBeläge()`, `alsText()`, `übrig()` (§7.5).
- Belag-Methoden: `name()`, `preis()`.
- **Grundpreis** Teig: `5.00`.

### Eingebaute Zutatenliste

| Belag | Preis | @Nach |
|---|---|---|
| Tomate | 1.00 | |
| Mozzarella | 1.50 | Tomate |
| Käse | 1.00 | Tomate |
| Basilikum | 0.50 | Mozzarella |
| Salami | 1.50 | |
| Schinken | 1.50 | |
| Pilze | 1.00 | |
| Oliven | 1.00 | |
| Zwiebeln | 0.50 | |
| Paprika | 0.80 | |
| Chili | 0.50 | |
| Peperoni | 0.80 | |
| Rucola | 1.00 | Mozzarella |
| Parmesan | 1.20 | Tomate |
| Gorgonzola | 1.50 | Tomate |
| Thunfisch | 2.00 | |
| Sardellen | 1.80 | |
| Artischocken | 1.50 | |
| Spinat | 1.00 | |
| Ei | 0.80 | |
| Mais | 0.50 | |
| Knoblauch | 0.30 | |
| Kapern | 0.70 | |
| Ananas | – | löst §9 aus |

`((Tomate, Mozzarella, Basilikum)).preis()` = 5.00 + 1.00 + 1.50 + 0.50 = `8`.

### @Nach – Schichtreihenfolge

Belag X mit `@Nach(Y)` darf **nicht unterhalb** von Y liegen (fehlt Y ganz, ist alles ok).
Geprüft bei jeder Pizza-Erzeugung (Literal, `+`). Verstoß → fataler Fehler:
`PizzaFehler B0012: 'Käse' liegt unter 'Tomate'. Das ist keine Pizza, das ist ein Auflauf.`

### Eigene Beläge (Decorators)

```pizza
@Nach(Tomate)
belag Trüffel auf Pizza {
    speisekarte funghi preis() {
        serviere ((unten.preis() + 4.50));
    }
    speisekarte margherita beschreibung() {
        serviere (("edel: " + unten.beschreibung()));
    }
}
```

- Registriert `Trüffel` als Belag (darf auch eingebaute wie `Käse` neu definieren; Preis-Default dann aus der Tabelle).
- **Dispatch** einer Methode `m` auf einer Pizza mit Schichten `[s1 .. sk]` (unten → oben):
  `aufruf(k, m)`: ist `k == 0` → eingebaute Pizza-Methode (Grundpreis bei `preis`; `beschreibung()` → `"Teig"`).
  Definiert Schicht `k` die Methode `m` → ausführen mit `dies` = ganze Pizza, `unten` = Sicht auf Schichten `1..k-1`.
  Sonst: bei `m == preis` → `aufruf(k-1, preis) + Standardpreis(sk)` (Tabelle, unbekannt 1.00); bei anderen → `aufruf(k-1, m)`.
- Eigene Methoden (wie `beschreibung`) sind so auf jeder Pizza aufrufbar, die den Belag trägt.

---

## 7. Pizza-Funktionen

### 7.1 Simulierte Uhr & Schritte (Tier 2)

- Jeder ausgewertete Ausdruck/jede Anweisung ist ein **Schritt**. Die simulierte Uhr läuft **1 ms pro Schritt**.
- `Uhr.jetzt()` → Dauer seit Programmstart. `Uhr.vorspulen(d)` → Uhr springt um `d` weiter.
- Globales Limit: **5 000 000 Schritte** (konfigurierbar) → `PizzaFehler P0002: Die Pizza ist noch im Ofen. (Schrittlimit erreicht – Endlosschleife?)`, Exit-Code 3.

### 7.2 Teig – Lazy Evaluation (Tier 2)

```pizza
Teig<salami> t = teig(() -> (teureBerechnung()));
t.gehenlassen();          // berechnet „im Hintergrund“ (sofort), merkt sich: aufgegangen
salami x = t.backen();    // liefert den Wert (berechnet höchstens einmal)
```
- `backen()` ohne vorheriges `gehenlassen()` → berechnet jetzt + Warnung
  `T0007: Teig wird gebacken, ohne gehen gelassen worden zu sein. Das schmeckt flach.`
- `istAufgegangen()` → diavolo. `gehenlassen()` gibt den Teig zurück.

### 7.3 Ofen – Zeitbudget mit Teilergebnis (Tier 2)

```pizza
salami s = ofen(temperatur: 450, zeit: 90s) {
    ...
    zwischenstand((summe));     // merkt Teilergebnis
    ...
    serviere ((summe));         // Wert des ofen-Ausdrucks (verlässt NICHT die umgebende Methode)
} roh (r) {
    serviere ((r.teilergebnis()));
} verbrannt (VerbranntAnanas a) {
    serviere ((-1));
};
```
- Benannte Argumente `temperatur` (Standard 250) und `zeit` (Standard 60s).
- `temperatur > 485` → wirft `VerbranntAnanas("Zu heiß! Selbst Neapel hat Grenzen.")`.
- Budget in Schritten = `zeit_ms × temperatur / 250`. (Heißer Ofen = schneller.)
- Budget überschritten → `roh (r)`-Zweig (falls vorhanden) mit `r.teilergebnis()` (letzter `zwischenstand` oder `karton`)
  und `r.verbrauchteZeit()` (Dauer). Ohne `roh`-Zweig → wirft `VerbranntAnanas("Zu lange im Ofen: Budget von N Schritten überschritten.")`.
- `verbrannt`-Zweige fangen Ananas, die im Block (oder durch zu hohe Temperatur) geworfen werden; Syntax wie bei `probier`. Nicht gefangene laufen weiter nach außen.
- `roh` und `verbrannt` sind beide optional, Reihenfolge: erst `roh`, dann `verbrannt`.
- Das gesamte `ofen(...) {...} ...` ist ein **Ausdruck**; als Anweisung mit `;` abschließen.

### 7.4 Schneiden – Parallelität (Tier 2: sequentiell simuliert)

- `blech.schneide(n)` → Blech aus `n` Teil-Blechen (so gleichmäßig wie möglich, vordere Stücke ggf. größer).
  `schneide(auto)` → 8 Stücke. `auto` ist hier ein Sonderbezeichner (nur als Argument von `schneide`).
- `n == 7` → Warnung `S0007: 7 Stücke? Wer schneidet eine Pizza in 7 Stücke?`
- Operator `blech / n` → wie `schneide(n)`, aber **fair**: geht es nicht auf →
  `StreitAnanas: 8 Stücke lassen sich nicht fair durch 3 teilen.`
- Danach typisch `.belege(fn)` (map) und `.zusammenklappen(fn)` (reduce) – das sind normale Blech-Methoden.

### 7.5 Stücke – Ownership & Referenzzählung (Tier 2: Laufzeitprüfung)

- Eine Pizza hat genau einen Besitzer. Deklaration/Zuweisung, deren rechte Seite **ein einfacher Bezeichner
  oder Feldzugriff** ist, der zu einer Pizza auswertet → `BesitzAnanas: Eine Pizza kann nicht an zwei Tischen gleichzeitig sein. Nutze schieb(p) oder teile(p).`
  (Übergabe als Argument und Rückgabe sind erlaubt.)
- `schieb(x)` – `x` muss ein Bezeichner sein. Liefert den Wert; die Variable ist danach weggeschoben:
  jeder Lesezugriff → `LeererKartonAnanas: 'p' wurde weggeschoben – der Karton ist leer.` (Neuzuweisung erlaubt.)
- `teile(p)` → `Stück<Pizza>`. Jede Pizza hat 8 Stücke; `p.übrig()` startet bei 8 und sinkt pro `teile`.
  Bei 0 → `StreitAnanas: Pizza ist alle.`
- Stück-Methoden: `pizza()` (die geteilte Pizza), `essen()` (zweites `essen()` am selben Stück → `StreitAnanas: Dieses Stück ist schon gegessen.`), `istGegessen()`.

### 7.6 Kühlschrank & Mikrowelle – Caching (Tier 2)

```pizza
@Kühlschrank(haltbar: 3d)
speisekarte margherita holeKarte() { ... }
```
- Ergebnisse werden pro Instanz und Argumentliste gecacht und sind `haltbar` lang (simulierte Uhr).
- `obj.holeKarte.mikrowelle(args)` (Methodenreferenz + `mikrowelle`) → `Reste<T>` mit `wert()` und `istMatschig()`:
  - kein Cache → berechnen, `istMatschig() == nein`
  - Cache frisch → Cache, `nein`
  - Cache abgelaufen → alter Wert sofort, `istMatschig() == ja`, und der Cache wird direkt danach neu befüllt.
- Methodenreferenz `.frisch(args)` → erzwingt Neuberechnung.

### 7.7 Lieferung – Async mit Trinkgeld (Tier 2)

```pizza
Lieferung<salami> l = bestelle(() -> (rechne()));
l.trinkgeld(5);                                  // gibt die Lieferung zurück
Zustellung<salami> z = l.warte(max: 30min);
salami wert = z.oderGratis((0));
```
- `bestelle(fn)` → `Lieferung`, Funktion läuft noch nicht.
- `trinkgeld(n)` → Priorität; jeder Euro erhöht das Budget um 10 %.
- `warte(max: d)` → führt jetzt aus mit Budget `d_ms × (1 + trinkgeld/10)` Schritten → `Zustellung` mit
  `pünktlich()`, `wert()` (zu spät → wirft `LieferAnanas: Zu spät – die Pizza ist kalt.`), `oderGratis(v)` (zu spät → `v`).
  Ananas aus `fn` werden bei `wert()`/`oderGratis()` weitergeworfen. Mehrfaches `warte` liefert dieselbe Zustellung.
- `wennDa(fn)` → registriert Rückruf; alle noch nicht gewarteten Lieferungen mit Rückruf laufen **nach Programmende**
  (nach `hauptgang`), sortiert nach Trinkgeld absteigend, bei Gleichstand in Bestellreihenfolge. Budget dort: unbegrenzt.

### 7.8 Calzone – echte Kapselung (Tier 1)

- `calzone klasse Konto { geheimrezept funghi stand = (1000.0); }`
- `Spiegel.felder(obj)` (Reflection) → `Speisekarte` aller Felder (inkl. `geheimrezept`) bei normalen Klassen.
  Bei zugeklappter Calzone → `ZugeklapptAnanas: Die Calzone ist zu. Nutze aufklappen().`
- `obj.aufklappen()` (nur Calzone) → Warnung `W0013: Garantie erloschen. Das ist jetzt eine ganz normale Pizza.`
  Danach funktioniert `Spiegel.felder(obj)` und `geheimrezept`-Felder sind von außen lesbar/schreibbar.

---

## 8. Ananas – Exceptions (Tier 1)

```
Ananas
├── GeprüfteAnanas
│   ├── VerbranntAnanas
│   └── LieferAnanas
└── LaufzeitAnanas
    ├── StreitAnanas            ├── RechenAnanas
    ├── LeererKartonAnanas      ├── RohlingAnanas
    ├── BesitzAnanas            ├── GebackenAnanas
    ├── TypAnanas               ├── KeinStückAnanas
    ├── ZugriffsAnanas          ├── UnbekannterBelagAnanas
    └── ZugeklapptAnanas        └── UnbekanntePizzaAnanas
```
- Erzeugen: `neu VerbranntAnanas("Nachricht")`. Methoden: `nachricht()`, `holeNachricht()` (Alias), `typ()` (Klassenname).
- Eigene Ananas: `klasse MeineAnanas erbt LaufzeitAnanas { speisekarte MeineAnanas(margherita m) { unten(m); } }`.
- Eigene Klassen und Ananas sind mit `verbrannt (Typ a)` fangbar (instanceof inkl. Vererbung).
- Interne Fehler (z. B. Methode nicht gefunden, Variable unbekannt) sind `LaufzeitAnanas` mit passender Meldung,
  etwa `LaufzeitAnanas: 'x' ist nicht definiert.` / `LaufzeitAnanas: Methode 'foo' gibt es auf Pizza nicht.`
- `TypAnanas` bei Typverletzung an Deklarationen/Zuweisungen/Parametern für `salami` (muss ganzzahlig sein),
  `funghi` (Zahl), `margherita` (Text), `diavolo` (Wahrheitswert), `Pizza`, `Dauer`, eigene Klassen (instanceof).
  `karton` ist für alle Nicht-Primitive erlaubt. Andere/unbekannte Typen (z. B. `Blech<T>`) werden nicht geprüft.
  Meldung: `TypAnanas: 'x' ist salami, aber der Wert 3.5 ist keine Ganzzahl.` (sinngemäß, Inhalt frei)
- Ungefangene Ananas → Programmende, Ausgabe als Fehler-Ereignis `Ungefangene Ananas – Typ: Nachricht (Zeile N)`, Exit-Code 1.
- Lesen einer Variable, die `karton` ist, ist ok; **Methodenaufruf/Feldzugriff auf `karton`** → `LeererKartonAnanas: Der Karton ist leer.`
- `wirft`-Klauseln werden nicht geprüft (Tier 3).

---

## 9. Hawaii (Tier 1) – Easter Egg

- `hawaii` ist ein gültiger Typ; `Ananas` ist auf der Zutatenliste. Der Parser akzeptiert alles.
- Vor dem Start: enthält der Quelltext den Typ `hawaii` oder den Belag-Bezeichner `Ananas` (als Wert, nicht
  die Exception-Klassen), gibt es **eine** Warnung `W0666: Typ 'hawaii' gefunden. Der Pizzaiolo sagt nichts. Er schaut nur.`
- **Panik-Auslöser** zur Laufzeit: (a) eine Variable/Feld/Parameter vom Typ `hawaii` erhält einen Wert,
  (b) eine Pizza mit dem Belag `Ananas` entsteht (Literal oder `+ Ananas`), (c) `neu Hawaii(...)` (Klasse namens `Hawaii`, beliebige eigene Klasse).
- Panik ist **nicht fangbar** (`probier`/`verbrannt`/`rand` werden übergangen), beendet sofort,
  Ereignis `panik` mit exakt diesem Text, Exit-Code **39**:

```
╔══════════════════════════════════════════════╗
║   🍍  PIZZA-VM KERNEL PANIC  🍍              ║
║                                              ║
║   Fataler Fehler: ANANAS_AUF_PIZZA           ║
║   Adresse 0xPIZZA → Ofen überhitzt           ║
║   Der Pizzaiolo hat den Raum verlassen.      ║
║                                              ║
║   Core dumped → reste.kaltepizza             ║
╚══════════════════════════════════════════════╝
Exit-Code: 39
```

---

## 10. Weitere Warnungen (Tier 1)

- `W0032: 'PiZZa' und 'PizZa' sind im selben Scope definiert. Selbst der Pizzaiolo verwechselt die beiden.`
  – wenn in einem Scope (Block/Parameterliste/Klassenmitglieder) zwei Namen sich nur in Groß-/Kleinschreibung unterscheiden. Einmal pro Paar.
- Warnungen werden einmal pro Code+Stelle ausgegeben und beeinflussen den Exit-Code nicht.

---

## 11. Standardbibliothek (Tier 1, sofern nicht in §7)

| Objekt/Typ | Mitglieder |
|---|---|
| `Bote` | `sage(x)` – Ausgabe + Zeilenumbruch · `fehler(x)` – Fehlerausgabe |
| `Uhr` | `jetzt()`, `vorspulen(d)` |
| `Mathe` | `wurzel(x)`, `max(a, b)`, `min(a, b)`, `abs(x)`, `runden(x)`, `boden(x)`, `decke(x)`, `PI` |
| `Zufall` | `zahl(a, b)` – ganzzahlig, inklusive, **deterministisch** (fester Seed 42, z. B. mulberry32) |
| `Spiegel` | `felder(obj)` (§7.8) |
| Zahl | `euro()` → `"8,00 €"`, `runden()` / `runden(n)`, `abs()`, `alsText()`, `ganz()` (abschneiden) |
| Text | `länge()`, `groß()`, `klein()`, `enthält(s)`, `zerlege(trenner)` → Blech, `ersetze(a, b)`, `trimme()`, `zeichen(i)` (ab 1), `wiederhole(n)`, `beginntMit(s)`, `alsZahl()` |
| Blech | `länge()`, `stück(i)` (**ab 1**, außerhalb → `KeinStückAnanas`), `hinzu(x)` (gibt Blech zurück), `entferne(i)`, `setze(i, x)`, `enthält(x)`, `belege(fn)` (map), `filtere(fn)`, `zusammenklappen(fn)` / `zusammenklappen(fn, start)` (reduce), `summe()`, `erstes()`, `letztes()`, `umdrehen()`, `sortiere()` / `sortiere((a, b) -> ...)`, `verbinde(trenner)`, `istLeer()`, `schneide(n)` |
| Speisekarte | `lege(k, v)`, `hole(k)` (fehlt → `karton`), `hat(k)`, `entferne(k)`, `schlüssel()`, `werte()`, `länge()` |
| Dauer | `+ -` mit Dauer, `* /` mit Zahl, Vergleiche, `inMs()`, `inSekunden()` |
| `neu Blech<T>()`, `neu Speisekarte<K, V>()`, `neu Pizza()` (= `(())`) | |

`hauptgang`-Args: Blech von Texten.

---

## 12. Exit-Codes

| Code | Bedeutung |
|---|---|
| 0 | gegessen (alles gut) |
| 1 | ungefangene Ananas |
| 2 | PizzaFehler (Syntax, B0012, R0001, Q0004, A0001, P0011, K0001 …) |
| 3 | Schrittlimit (P0002) |
| 39 | Hawaii |

## 13. Tier 3 – nur Spezifikation

- Toolchain: Compiler `pizzaiolo backe`, Build-Tool `pizzaofen` mit `ofen.xml`, Archive `.pkarton`, Paketmanager `pizzabote`, Flag `--temperatur=485` (Optimierung).
- Statische Prüfung von Generics und `wirft`.
- Echte Parallelität bei `schneide` / echte Hintergrund-Threads bei `teig` und `bestelle`.
