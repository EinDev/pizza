# pizza v3.0 – Sprachspezifikation (verbindlich)

> **Grundsatz (Nutzerentscheidung, K-082): Browser = nativ.** Alles funktioniert im Playground (Browser) und nativ (EXE/Linux)
> **gleich** – Sprache, Standardbibliothek, Eingabe, Zufall, Vorratskammer, Theke – und es wird auch **das Gleiche angezeigt**:
> identische Texte (Ausgaben, Warnungen, Fehlermeldungen samt Wortlaut, Codes und Zeilenangaben, Hawaii-Banner), identische
> Zahl-/Dauer-Formatierung, identischer Theke-Fensterinhalt (gleiche Render-Engine, gleiches CSS/Thema, gleiche Standardgröße).
> Unterschiede sind nur in der technischen Hülle zulässig (Fensterrahmen des Betriebssystems vs. schwebendes Fenster, Terminal vs.
> Konsolen-Panel, Speicherort einer Datei vs. localStorage). **Was nur nativ Sinn ergibt, wird nicht gebaut.**

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
- Texte: `"..."` mit Escapes `\n`, `\t`, `\r`, `\"`, `\\`, `\'` – andere Sequenzen und Zeilenumbrüche im Text sind Syntaxfehler (K-025).
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
Sie wird mit einem leeren `Blech` (oder den übergebenen Args) aufgerufen – Args kommen aus der Kommandozeile (CLI/EXE) bzw. dem
Feld „Argumente“ des Playgrounds (K-083/2, gleich in beiden Hüllen).

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
- Im Konstruktor ruft `unten(args);` den Basiskonstruktor auf. Fehlt der Aufruf, wird der Basis-Konstruktor **ohne Argumente** aufgerufen;
  gibt es nur Basiskonstruktoren mit Parametern, ist das ein Aritätsfehler (`LaufzeitAnanas: Konstruktor von 'Basis' erwartet 1 Argument, bekam 0.`, K-037).
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
  `karton` ist für alle Typen außer `salami`, `funghi`, `diavolo` erlaubt (also auch für `margherita`, §14.6/K-034). Andere/unbekannte Typen (z. B. `Blech<T>`) werden nicht geprüft.
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
  Ereignis `panik` mit exakt diesem Text, Exit-Code **39**. Kanal (K-012, Nutzerentscheidung): CLI, nativer Host und EXE
  schreiben den Banner nach **stderr**; die Web-UI zeigt ihn als normale Fehlerausgabe (kein Crash-Overlay). In `.erwartet`
  steht er wie jedes Ereignis des Ausgabestroms (ARCHITEKTUR §3):

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
  – wenn in einem Scope (Block/Parameterliste/Klassenmitglieder) zwei Namen sich nur in Groß-/Kleinschreibung unterscheiden.
  Einmal pro **später deklariertem** Namen, gepaart mit der frühesten kollidierenden Schreibweise (n Schreibweisen → n−1 Warnungen; §14.8, K-002).
- Warnungen werden einmal pro Code+Stelle ausgegeben und beeinflussen den Exit-Code nicht.

---

## 11. Standardbibliothek (Tier 1, sofern nicht in §7)

| Objekt/Typ | Mitglieder |
|---|---|
| `Bote` | `sage(x)` – Ausgabe + Zeilenumbruch · `fehler(x)` – Fehlerausgabe |
| `Uhr` | `jetzt()`, `vorspulen(d)` |
| `Mathe` | `wurzel(x)`, `max(a, b)`, `min(a, b)`, `abs(x)`, `runden(x)`, `boden(x)`, `decke(x)`, `PI` |
| `Zufall` | `zahl(a, b)` – ganzzahlig, inklusive, **deterministisch**: mulberry32 mit Saat 42 (`optionen.zufallsSaat`), `a + floor(r · (b − a + 1))` (K-049); ferner `saat([n])`, `kommazahl([a, b])`, `wahr(p)`, `wähle(blech)`, `mische(blech)`, `neu Zufall([saat])` – §15.4 (K-077/K-078, offen) |
| `Vorratskammer` | persistenter Zustand über Läufe: `neu Vorratskammer(name)`, `lege`, `hole`, `hat`, `entferne`, `schlüssel`, `länge`, `leeren`, `name` – §15.4 (K-079 … K-081, offen) |
| `Spiegel` | `felder(obj)` (§7.8) |
| Zahl | `euro()` → `"8,00 €"`, `runden()` / `runden(n)`, `abs()`, `alsText()`, `ganz()` (abschneiden) |
| Text | `länge()`, `groß()`, `klein()`, `enthält(s)`, `zerlege(trenner)` → Blech, `ersetze(a, b)`, `trimme()`, `zeichen(i)` (ab 1), `wiederhole(n)`, `beginntMit(s)`, `alsZahl()` |
| Blech | `länge()`, `stück(i)` (**ab 1**, außerhalb → `KeinStückAnanas`), `hinzu(x)` (gibt Blech zurück), `entferne(i)`, `setze(i, x)`, `enthält(x)`, `belege(fn)` (map), `filtere(fn)`, `zusammenklappen(fn)` / `zusammenklappen(fn, start)` (reduce), `summe()`, `erstes()`, `letztes()`, `umdrehen()`, `sortiere()` / `sortiere((a, b) -> ...)`, `verbinde(trenner)`, `istLeer()`, `schneide(n)` |
| Speisekarte | `lege(k, v)`, `hole(k[, ersatz])` (fehlt → `ersatz`, sonst `karton`; auch benannt `ersatz:`, K-095), `hat(k)`, `entferne(k)`, `schlüssel()`, `werte()`, `länge()` |
| Dauer | `+ -` mit Dauer, `* /` mit Zahl, Vergleiche, `inMs()`, `inSekunden()` |
| `neu Blech<T>()`, `neu Speisekarte<K, V>()`, `neu Pizza()` (= `(())`) | |

`hauptgang`-Args: Blech von Texten.

---

### 11.1 Ein- und Ausgabe für interaktive Programme (Tier 1)

Übernommen aus `EINGABE.md` (dort bleiben Browser-, Host- und CLI-Details §3–§5); Präzisierungen aus `KLAERUNGEN.md` (K-007 … K-013, K-031, K-042).

**Ausgabe**

| Aufruf | Wirkung | Ereignis |
|---|---|---|
| `Bote.sage(x, …)` | Text + Zeilenumbruch | `{ typ: "ausgabe", text }` (`umbruch` weggelassen = kanonisch; `umbruch: true` gleichbedeutend) |
| `Bote.schreibe(x, …)` | Text **ohne** Zeilenumbruch (Eingabeaufforderungen, Spielfelder) | `{ typ: "ausgabe", text, umbruch: false }` |
| `Bote.leeren()` | Konsole leeren | `{ typ: "leeren" }` |

**Eingabe – `Bestellannahme` (zeilenbasiert)**

| Aufruf | Rückgabe |
|---|---|
| `lies()` | nächste Zeile als `margherita`, **unverändert** (kein Trimmen; nur ein abschließendes `\n`/`\r\n` entfernt); `karton` bei Eingabeende (EOF) |
| `frage(text)` | `Bote.schreibe(text)` + `lies()` – der Prompt wird **vom Programm** ausgegeben, auch wenn EOF folgt |
| `liesZahl([ersatz])` / `frageZahl(text[, ersatz])` | Zeile als Zahl nach der **Zahltext-Grammatik** (unten); ungültig → `TypAnanas: '<zeile>' ist keine Zahl.` (die Zeile ist verbraucht); EOF → `karton`, bzw. `ersatz`, falls angegeben (auch benannt `ersatz: …`). `ersatz` gilt **nur** bei EOF. *(K-008)* |
| `hatMehr()` | `diavolo` – interaktiv (`onEingabe`) immer `ja`; vorgegebene Eingabe: `nein`, sobald erschöpft |

- **Zahltext-Grammatik** (gilt gleich für `liesZahl`, `frageZahl` und `Text.alsZahl()`; K-007): Leerraum außen entfernen, dann
  `[+-]? Ziffern[_Ziffern]* ( (.|,) Ziffern[_Ziffern]* )?` – Punkt **oder** Komma als Dezimaltrenner, Unterstriche wie in
  Literalen. Kein Hex, kein Exponent, kein `.5`/`5.`, kein `Infinity`/`NaN`, keine Unicode-Ziffern → TypAnanas
  (`alsZahl`: `"<text>" ist keine Zahl.`).
- **EOF ist endgültig:** nach dem ersten EOF liefert jeder weitere Leseversuch EOF (`karton`), `hatMehr()` → `nein` (K-042).
- Jeder Aufruf kostet nur seine Ausdrucksknoten (§14.1); **Warten** auf Eingabe verbraucht weder Schritte noch simulierte Zeit
  noch Ofen-/Lieferbudget. Eingabe ist in allen Phasen verfügbar (auch in der `wennDa`-Phase nach Programmende); ein
  `@Kühlschrank`-Treffer liest nicht erneut.
- Die Eingabe wird **nicht** vom Programm wiederholt (Echo ist Sache von UI/Terminal). Keine Längenbegrenzung für Zeilen –
  in keinem Motor.
- Spiele **müssen** `karton` als „Spieler ist gegangen“ behandeln und sauber enden.

**API (ARCHITEKTUR §1):** `optionen.eingabe?: string[]` (vorgegebene Zeilen; ein `null`-Eintrag bedeutet EOF ab dort) ·
`optionen.onEingabe?: (anfrage) => string | null` – synchron, `anfrage = { prompt: string|null, art: "zeile"|"zahl" }`;
`null`, `undefined` oder eine Exception bedeuten EOF, andere Werte werden zu Text; hat Vorrang vor `eingabe`; fehlt beides
→ sofort EOF. `prompt` ist **informativ** (z. B. Platzhalter des Eingabefelds) und darf von Host/UI nie zusätzlich
ausgegeben werden. Nach **jedem** Leseversuch folgt `{ typ: "eingabe", text }` (`text: null` bei EOF).

**`.erwartet` (ARCHITEKTUR §3):** `ausgabe` mit `umbruch: false` wird ohne Zeilenumbruch angehängt (der nächste Text
steht in derselben Zeile), `leeren` erscheint als eigene Zeile `«leeren»`, `eingabe`-Ereignisse erscheinen **nicht**.
Beispiel-Manifeste: optional `"eingabe": "<pfad>.eingabe"` (eine Zeile pro Eingabe) und `"interaktiv": true`; eine
gleichnamige `.eingabe`-Datei neben der `.pizza` gilt als Fallback.

## 12. Exit-Codes

| Code | Bedeutung |
|---|---|
| 0 | gegessen (alles gut) |
| 1 | ungefangene Ananas |
| 2 | PizzaFehler (Syntax, B0012, R0001, Q0004, A0001, P0010, P0011, K0001, P0012 [K-015] …; Host-Ladefehler `HOST` [K-043]) |
| 3 | Schrittlimit (P0002) – ein Wand-Zeitlimit gibt es nicht (K-083/3) |
| 39 | Hawaii |

## 13. Tier 3 – nur Spezifikation

- Toolchain: Compiler `pizzaiolo backe`, Build-Tool `pizzaofen` mit `ofen.xml`, Archive `.pkarton`, Paketmanager `pizzabote`, Flag `--temperatur=485` (Optimierung).
- Statische Prüfung von Generics und `wirft`.
- Echte Parallelität bei `schneide` / echte Hintergrund-Threads bei `teig` und `bestelle`.

---

## 14. Präzisierungen & Erweiterungen (verbindlich, Stand Referenz-Interpreter)

Dieser Abschnitt legt fest, was §1–§13 offen lassen, und dokumentiert Erweiterungen des Referenz-Interpreters
(`site/js/pizza.js`). Er ändert nichts an §1–§13. Ein-/Ausgabe (`Bote.schreibe`, `Bote.leeren`, `Bestellannahme`)
regelt `EINGABE.md`.

### 14.1 Schrittzählung (exakt, beobachtbar über `Uhr.jetzt()`, Budgets, P0002, `schritte`)

- **Ein Schritt** = jede Ausführung einer Anweisung + jede Auswertung eines Ausdrucksknotens.
- **Anweisungen, die zählen:** jede Anweisung in einem Rumpf (auch leeres `;`, ein verschachtelter `{ }`-Block als
  Anweisung, `serviere`, `abbrechen`, `weiter`, `wirf`, `probier`), die `für`-Init und jede `für`-Update-Anweisung,
  ein `sonst falls` (als verschachtelte `falls`-Anweisung), der Körper eines `wähle`-Arms ohne geschweifte Klammern.
- **Kein eigener Schritt** für: den Rumpf von Methoden/Konstruktoren/Lambdas, Schleifenrümpfe, `falls`-/`sonst`-Blöcke,
  Fang-, `rand`-, Ofen- und `roh`-Blöcke sowie Block-Arme von `wähle` (deren Anweisungen zählen einzeln).
- **Ausdrucksknoten (je 1 Schritt):** Literale (Zahl, Dauer, Text, `ja`/`nein`, `karton`), Name, Binär-, Logik-,
  Unär- und `?:`-Operator, jeder Aufruf (`f(x)`, `o.m(x)`, `unten(…)`, `f(x)(y)`), Mitgliedszugriff `o.f`, `dies`,
  `unten` als Wert, `neu`, Pizza-Literal (als Ganzes, Belagnamen zählen nicht einzeln), Blech-Literal, Bereich,
  Lambda-Erzeugung, `ofen`-Ausdruck, `wähle`-Ausdruck. Jedes Argument (auch benannte) ist ein eigener Ausdruck.
- **Nicht gezählt:** das Ziel einer Zuweisung oder von `++`/`--`, wenn es ein Name ist (bei `a.b = …` wird `a`
  ausgewertet und zählt); der Methoden- bzw. Funktionsname selbst; `unten` in `unten.m()`; das Argument von `schieb(x)`;
  `fall`-Werte, die als bloßer Name mit einem quattrostagioni-Wert verglichen werden. `fall`-Werte werden nur bis zum
  ersten Treffer ausgewertet; `&&`, `||`, `?:` werten kurzgeschlossen aus.
- **Auch gezählt:** Feld-Initialisierer (bei jedem `neu`), statische Initialisierer und Annotationsargumente
  (`@Kühlschrank(haltbar: …)`, `@PizzaVeraltet(grund: …)`) – einmal vor den Top-Level-Anweisungen; Rückrufe von
  Bibliotheksfunktionen (`belege`, `sortiere`, `teig`, `bestelle` …) zählen ihre Ausdrücke/Anweisungen.
  Bibliotheksarbeit selbst, Deklarationen, der Aufruf von `hauptgang` und von `wennDa`-Rückrufen nach Programmende
  sowie das Warten auf Eingabe kosten nichts.
- **Referenzwerte:** `salami x = 1;` = 2 · `salami x = 1 + 2 * 3;` = 6 · `Bote.sage((1));` = 4 · `x++;` = 1 ·
  `x += 1;` = 2 · `falls (ja) { } sonst { }` = 2 · `für (salami i = 0; i < 3; i++) { }` = 18 ·
  `f(1);` mit `salami f(salami a) { serviere ((a)); }` = 5 · `Uhr.vorspulen(1h);` = 4 (`zeitMs` = 3 600 004).
- `Uhr.jetzt()` = bisherige Schritte (inklusive des Aufrufknotens) + vorgespulte Zeit; als erste Anweisung liefert
  `Bote.sage((Uhr.jetzt()));` also `5ms`. `zeitMs` = Schritte + vorgespulte Zeit.
- **P0002:** Abbruch beim Schritt Nummer `schrittLimit + 1` (Standard 5 000 000). Nicht fangbar; `rand` läuft nicht.

### 14.2 Budgets von Ofen und Lieferung

- Budgets messen die **simulierte Uhr** (Schritte + `Uhr.vorspulen`). Ein Budget von N erlaubt N Uhr-Millisekunden ab
  Beginn; überschritten ist es, sobald die Uhr > Start + N ist (beim N+1-ten Schritt oder direkt nach einem
  `vorspulen`, das darüber hinausführt).
- **Ofen:** Start nach Auswertung der Argumente; N = `floor(zeit_ms × temperatur / 250)`; Argumente auch positional
  (`ofen(450, 90s)`), `zeit` darf eine Zahl (ms) sein, nicht-numerische Argumente → TypAnanas
  (`ofen(zeit: …) braucht eine Dauer, nicht "x".`). `verbrauchteZeit()` = Uhr beim Abbruch − Start
  (Beispiel: `ofen(zeit: 5ms) { solange (ja) { } }` → `6ms`).
- Mehrere verschachtelte Budgets gleichzeitig überschritten → das **äußerste** greift; innere Öfen/Lieferungen werden
  ohne ihren `roh`-Zweig verlassen.
- Die `verbrannt`-Zweige eines Ofens fangen Ananas aus dem Block, die Temperatur-Ananas und die
  „Zu lange im Ofen“-Ananas (wenn kein `roh` existiert) – nicht aber Ananas aus dem `roh`- oder einem `verbrannt`-Block.
- Ohne `serviere` ist der Wert eines Ofens `karton`. `abbrechen`/`weiter` direkt im Ofen-Block sind ein Parse-Fehler P0012 (K-015).
- `rand` läuft auch bei einem Budget-Abbruch, aber nie bei Panik, P0002 oder PizzaFehlern.
- **Lieferung:** `warte()` ohne `max` = unbegrenzt; `warte(30min)` positional erlaubt; `trinkgeld` summiert sich;
  Budget = `max × (1 + Summe/10)`. `zwischenstand` außerhalb eines Ofens wird ignoriert.

### 14.3 `wennDa`-Zeitpunkte

- `wennDa(fn)` auf eine bereits gewartete, pünktliche, fehlerfreie Lieferung → `fn(wert)` sofort.
- `wennDa` vor `warte` registriert → `fn(wert)` direkt nach einem pünktlichen, fehlerfreien `warte`.
  Zu spät oder mit Ananas → kein Rückruf.
- Nach Programmende (nach `hauptgang`, nur bei normalem Ende) laufen alle nie gewarteten Lieferungen mit Rückruf –
  immer die offene mit dem höchsten Trinkgeld zuerst, bei Gleichstand die früher bestellte; während dieser Phase neu
  registrierte werden mit einsortiert. Kein Budget. Ananas dort → ungefangen (Exit 1). Lieferungen ohne `wennDa`
  laufen nie.

### 14.4 Rekursion und Stapeltiefe (deterministisch)

- Die Laufzeit führt eine **Stapeltiefe T** (Start 0). T erhöht sich um 1 für die Dauer
  - jeder ausgeführten Anweisung,
  - jedes zusammengesetzten Ausdrucks (alle Ausdrucksknoten außer Literalen, Namen, `dies`, `unten` als Wert und
    Lambda-Erzeugung),
  - jedes Aufrufs eines Rumpfs – gleich welcher Art: Methode, statische Methode, Top-Level-Funktion, Konstruktor
    (je Klasse der Kette mit eigenem Konstruktor), Belag-Methode (Dispatch), Lambda, Methodenreferenz,
    Kühlschrank-Methode (`mikrowelle`/`frisch` eingeschlossen), `wennDa`-Rückruf, implizites `alsText`, Rückrufe aus
    der Bibliothek (`belege`, `filtere`, `sortiere`, `teig`, `bestelle` …),
  - jedes Aufrufs eines Bibliotheks-Funktionswerts (`teig(…)`, `bestelle(…)`, `teile(…)`, `zwischenstand(…)`,
    Methodenreferenzen wie `Bote.sage` oder `"abc".länge` als Wert aufgerufen). Direkte Aufrufe wie `Bote.sage(…)`
    oder `b.länge()` zählen nur über ihren Aufrufknoten.
- Würde T **1500** überschreiten, entsteht an genau dieser Stelle die fangbare
  `LaufzeitAnanas: Zu viele Pizzen übereinander (Stapelüberlauf).` Beim Fangen (durch `probier`, einen Ofen oder
  `warte`) springt T auf den Stand beim Eintritt in dieses `probier`/den Ofen/`warte` zurück.
- **Referenz:** `salami summe(salami n) { falls (n == 0) { serviere (0); } serviere ((n + summe(n - 1))); }` mit
  `Bote.sage((summe(n)));` als Top-Level-Anweisung läuft bis n = 373; ab n = 374 kommt der Stapelüberlauf. Dasselbe
  gilt für das Lambda `lam = n -> n == 0 ? 0 : lam(n - 1) + 1;` mit `Bote.sage((lam(n)));`.
- Damit ist der Abbruch unabhängig vom Stack des Wirts (Node, Browser-Worker, Wasm-Host) und vom JIT-Zustand;
  ein tatsächlicher Überlauf des Wirt-Stacks darf nie vorher eintreten. Falls er doch eintritt, wird er mit demselben
  Text gemeldet (dann gilt das als Fehler des Motors).

### 14.5 Syntax-Präzisierungen und Erweiterungen

- **Pizza-Literal:** zwei unmittelbar aufeinanderfolgende `(` in **Ausdrucksposition**. Syntaktische Klammern zählen
  nicht mit – weder die eines Aufrufs noch die von `falls`/`solange`/`wähle`: `Bote.sage((Salami))` = Aufruf mit dem
  Ausdruck `(Salami)` → Belag-Wert `Salami`; `Bote.sage(((Salami)))` → Pizza `((Salami))`.
- `((X))` mit genau **einem** Namen, der kein bekannter Belag (und nicht `Ananas`) ist, wird als normale Klammer
  gelesen (Variable, Klasse, …), z. B. `serviere ((MAX));`. Unbekannte großgeschriebene Namen → UnbekannterBelagAnanas.
- Reservierte Wörter sind kleingeschrieben; andere Schreibweisen (`Ofen`, `Klasse`) sind normale Bezeichner. Ein
  reserviertes Wort als Name → `P0001: 'falls' ist ein reserviertes Wort und kann nicht als Name für die Variable verwendet werden`.
- Fehlendes `;`: gemeldete Position = Ende des vorigen Tokens, wenn das gefundene Token in einer neuen Zeile steht.
- Alle Syntaxfehler haben Code P0001 (bzw. K0001) und Ereignis-`art` `"syntax"`, Exit 2. Der K0001-Text enthält den
  tatsächlichen Ausdruck: `serviere x * 2;` → `Klammerpflicht! serviere braucht Klammern: serviere (x * 2);`.
- **Top-Level-Funktionen** (Snack-Modus): `salami quadrat(salami x) { … }` außerhalb von Klassen, gehoben, auch mit
  Annotationen und `<T>`. Eine Top-Level-Funktion `hauptgang` wird aufgerufen, wenn keine Klasse einen hat.
- **`wähle` als Ausdruck:** `margherita s = wähle (x) { fall 1 -> "eins"; standard -> "?"; };` Arme sind Ausdrücke
  (mit `;` oder `,` abgeschlossen) oder Blöcke, deren `serviere` den Wert liefert (ohne die Methode zu verlassen).
  Kein Treffer → `karton`.
- **`wähle` als Anweisung:** `fall`-Arme in Reihenfolge, `standard` nur ohne Treffer (egal wo er steht).
  `abbrechen` im Arm verlässt nur das `wähle`; `serviere` im Arm verlässt die Methode. Bloßer Name als `fall`-Wert bei
  quattrostagioni-Subjekt = Wertname (`fall WINTER ->`).
- **Überladung** nach Anzahl der Argumente (Positions- + benannte) für Methoden, Konstruktoren und Top-Level-Funktionen;
  passt keine Anzahl, gilt die erste Deklaration (→ Aritätsfehler).
- **Mehrfachdeklaration** `salami a = 1, b, c = a + 2;` (Variablen und Felder); Kommas in `für`-Init und -Update.
- Präfix `++x;`/`--x;`; `+=` usw. auch für Text, Dauer und Pizza (`p += Käse`); `x++` auf Nicht-Zahlen = `x + 1`.
- Generische Parameter `<T>` an Klassen/Methoden werden übersprungen; `Typ[]` ist erlaubt (ungeprüft);
  `für (x : liste)` ohne Typ erlaubt.
- `paket`/`import` dürfen überall auf oberster Ebene stehen. Klassen/Rezepturen/quattrostagioni dürfen in Klassen
  verschachtelt sein und werden global registriert.
- `serviere` auf oberster Ebene beendet die Top-Level-Anweisungen; `hauptgang` läuft trotzdem.

### 14.6 Typen und `karton`

- `karton` ist erlaubt für alle Typen außer `salami`, `funghi`, `diavolo` (→ TypAnanas). `margherita`, `Pizza`,
  `Dauer`, Klassen, Rezepturen und quattrostagioni dürfen `karton` halten. (Folge für Eingaben:
  `Bestellannahme.liesZahl()` liefert bei EOF `karton` – nicht direkt in `salami`/`funghi` speichern.)
- Typnamen, die keine eingebaute oder eigene Klasse/Rezeptur/quattrostagioni sind (z. B. `Rezept`, `T`, `Blech<…>`,
  `Belag`), sowie Typen mit `[]` werden nicht geprüft. quattrostagioni-Typen prüfen die Zugehörigkeit.
- Standardwerte ohne Initialisierer: `salami`/`funghi` → 0, `diavolo` → nein, sonst `karton`.
- `gebacken`: lokale Variable ohne Initialisierer → genau eine spätere Zuweisung erlaubt; Felder: beliebig oft im
  Konstruktor (inkl. Feld-Initialisierern); Parameter mit `gebacken` sind unveränderlich.
- Bedingungen (`falls`, `solange`, `für`, `?:`, Operanden von `&&`/`||`/`!`, Ergebnis der `filtere`-Funktion) müssen
  `diavolo` sein → sonst `TypAnanas: Erwartet diavolo (ja/nein), bekam X.`
- `==`: `1 == 1.0` → ja; verschiedene Typen → nein; Blech, Speisekarte, Objekte, Funktionen per Identität.
- `<`, `<=`, `>`, `>=`: Zahlen, Texte (lexikografisch nach UTF-16-Codeeinheiten), Dauer, Werte desselben
  quattrostagioni (nach Position); sonst `TypAnanas: X und Y kann man nicht vergleichen.`

### 14.7 Zusätzliche Fehlercodes und Texte

- **P0010** (PizzaFehler, Exit 2, beim Start): `Klasse 'K' erbt von 'X' – diese Klasse gibt es nicht.` ·
  `Klasse 'K' erfüllt 'X' – diese Rezeptur gibt es nicht.` · `Rezeptur 'R' erbt von 'X' – diese Rezeptur gibt es nicht.` ·
  `Klasse 'A' erbt im Kreis – das ist ein Teigknoten.`
- **A0001:** `Methode 'm' in 'K' ist mit @PizzaÜberschreibt markiert, überschreibt aber nichts.`
  (bei Belägen `… in Belag 'B' …`). Als vorhanden gelten Methoden der Basisklassenkette, aller erfüllten Rezepturen
  (inkl. geerbter Rezepturen und der Rezepturen der Basisklassen), `alsText` immer, bei Ananas-Klassen
  `nachricht`/`holeNachricht`/`typ`, bei Belägen die Pizza-Methoden (`preis`, `beschreibung`, …).
- **W0003:** `Methode 'm' ist veraltet.` bzw. `Methode 'm' ist veraltet. Grund: <grund>` – einmal pro Methode,
  Position = erster Aufruf.
- Startprüfungen in dieser Reihenfolge: Q0004/P0010/P0011 in Quelltextreihenfolge, dann Vererbungszyklen, dann
  R0001/A0001 in Quelltextreihenfolge. Der erste Fehler bricht ab.
- Ungefangene Ananas: Zeile = Anweisung, in der geworfen bzw. der Fehler ausgelöst wurde. Geworfene Nicht-Ananas-Objekte:
  `Ungefangene Ananas – <Textform> (Zeile N)`, `code` = Klassenname.

### 14.8 W0032

- Scopes: das Programm (Top-Level-Variablen und -Funktionen, **keine** Klassennamen), jeder Block, die Mitglieder
  einer Klasse (Felder und Methoden, ohne Konstruktoren). Parameter (Methode, Konstruktor, Lambda) bilden mit den
  direkten Deklarationen ihres Rumpfs **einen** Scope; ebenso `für`-Variable(n) + Schleifenrumpf, Fangvariable + Block,
  `roh`-Variable + Block.
- Gemeldet an der späteren Deklaration als `'<frühere>' und '<spätere>'`. **Einmal pro neuer Deklaration:** jede
  Deklaration wird mit der ersten früheren gleichlautenden Schreibweise gepaart. Bei `pizza`, `PiZZa`, `piZZA` im selben
  Scope entstehen also **2** Warnungen (`'pizza' und 'PiZZa'`, `'pizza' und 'piZZA'`).
- Allgemein werden Warnungen einmal pro Code + Zeile + Spalte ausgegeben (W0003 einmal pro Methode, W0666 genau einmal
  an der ersten Fundstelle).

### 14.9 Objekte, Klassen, Aufrufe

- `Klasse@N`: N zählt **global** über alle mit `neu` erzeugten Objekte ab 1 (auch `neu XAnanas(…)` und das automatisch
  erzeugte Objekt für einen nicht-`tiefkühl` `hauptgang`). Intern von der Laufzeit erzeugte Ananas zählen nicht.
- Nicht-`tiefkühl` `hauptgang`: Es wird ein Objekt der Klasse (ohne Argumente) erzeugt und die Methode darauf aufgerufen.
- Konstruktion: ohne `unten(…)` → Basis-Konstruktor ohne Argumente, dann eigene Feld-Initialisierer, dann Rumpf. Mit
  `unten(…)` im Rumpf laufen Basis-Konstruktion und eigene Feld-Initialisierer an dieser Stelle. Eine Klasse ohne
  Konstruktor reicht Argumente an die Basis weiter; gibt es nirgends einen Konstruktor, sind Argumente ein Fehler.
- Arität: `LaufzeitAnanas: Methode 'm' erwartet N Argument(e), bekam M.`; unbekannter benannter Parameter:
  `… hat keinen Parameter 'x'.` (wird zuerst geprüft). Lambdas sind tolerant: fehlende Argumente → `karton`,
  überzählige werden ignoriert.
- `geheimrezept`/`familienrezept` gelten auch für unqualifizierte Methodenaufrufe aus Unterklassen. Statische Methoden
  sind auch über Objekte aufrufbar; `Klasse.methode()` einer Instanzmethode ohne passende Instanz → LaufzeitAnanas.
- Ein Feld, das eine Funktion hält, ist wie eine Methode aufrufbar (`obj.f(4)`, `Klasse.g(1)`).
- Methodenreferenzen funktionieren auch auf Werten der Standardbibliothek (`"abc".länge`, `Mathe.wurzel`, `Bote.sage`).
- Closures fangen Variablen **per Referenz**. Die Variable einer klassischen `für (salami i = …; …; …)`-Schleife ist
  **eine** Variable für alle Durchläufe (Lambdas sehen den Endwert); `für (x : …)` und Variablen im Schleifenrumpf sind
  pro Durchlauf neu.
- `für (x : …)` läuft über eine Kopie des Blechs (Änderungen während der Schleife wirken nicht), über Texte (Zeichen),
  Speisekarten (Schlüssel), einen quattrostagioni-Typ (Werte) und Pizzen (Beläge).

### 14.10 Kühlschrank

- Cache pro Instanz (statische Methoden: pro Klasse; Top-Level-Funktionen: global). Schlüssel = Methode + Argumentwerte
  (benannte Argumente werden in Parameterreihenfolge einsortiert; Objekte nach Identität).
- Frisch, solange Alter ≤ `haltbar` (Alter = Uhr jetzt − Uhr bei Fertigstellung der Berechnung).
  `@Kühlschrank` ohne Argument = unbegrenzt haltbar.
- `.mikrowelle(…)`/`.frisch(…)` gehen auch bei Methoden ohne `@Kühlschrank` und bei Lambdas (immer neu berechnet,
  nie matschig).

### 14.11 Standardbibliothek – Präzisierungen und Ergänzungen

- `Bote.sage(a, b, …)`, `Bote.fehler(…)`, `Bote.schreibe(…)`: mehrere Argumente werden mit Leerzeichen verbunden;
  `Bote.sage()` gibt eine leere Zeile aus.
- Zahlen: Textform wie JavaScript `String(x)` (`1e+21`, `1e-7`, `-0` → `0`, `0.30000000000000004`).
  `runden()`/`runden(n)`/`Mathe.runden` runden symmetrisch (−2.5 → −3, 2.675 → 2.68). `euro()`: zwei Nachkommastellen,
  Komma, ohne Tausendertrennung (`1234567,89 €`, `-3,00 €`).
- Dauer: zusätzlich `inMinuten()`; Textform rundet auf ganze ms, negative Dauer mit `-` (`-1min 30s`);
  `Dauer / Dauer` → Zahl; Zahl × Dauer → Dauer; Division durch 0 → RechenAnanas.
- Text: zusätzlich `endetMit(s)`, `istLeer()`, `alsText()`. `länge()`/`zeichen(i)` zählen Unicode-Zeichen (Codepoints).
  `zerlege("")` → einzelne Zeichen. `alsZahl()` folgt der Zahltext-Grammatik aus K-007 (Leerraum außen, `_`, Punkt oder Komma); sonst `TypAnanas: "<text>" ist keine Zahl.`
  `groß()`/`klein()` wie JavaScript (`ß` → `SS`).
- Blech: `entferne(i)` liefert das entfernte Element; `hinzu`, `setze` liefern das Blech; `hinzu()` ohne Argument fügt
  `karton` an; `sortiere`, `umdrehen`, `belege`, `filtere` liefern **neue** Bleche; zusätzlich `kopie()`;
  `verbinde()` ohne Trenner = `""`; `zusammenklappen` auf leerem Blech ohne Startwert → `karton`; `summe()` leer → 0
  (Bleche aus Dauern → Dauer); `schneide(n)` mit n > Länge → leere Teilbleche; `schneide(n < 1)` →
  `StreitAnanas: In n Stücke schneiden? Das geht nicht.`; `blech / 0` → RechenAnanas;
  `blech / n` mit n < 0 → `StreitAnanas: In n Stücke teilen? Das geht nicht.`; S0007 auch bei `blech / 7`.
- Indexfehler: `KeinStückAnanas: Stück i gibt es nicht – das Blech hat n Stück(e).` (Einzahl „Stück“);
  `erstes`/`letztes` auf leerem Blech: `KeinStückAnanas: Das Blech ist leer – kein Stück da.`;
  Text: `Zeichen i gibt es nicht – der Text hat n Zeichen.`
- Speisekarte: zusätzlich `istLeer()`; `lege` liefert die Speisekarte; `entferne(k)` liefert den alten Wert oder
  `karton`; Beläge als Schlüssel werden über ihren Namen gespeichert (`hole(Salami)` = `hole("Salami")`).
  `hole(k, ersatz)` (auch `ersatz:`) liefert `ersatz` **nur**, wenn `hat(k)` `nein` ist – ein gespeicherter `karton` bleibt
  `karton`; `ersatz` kommt unverändert zurück (keine Kopie); positional vor benannt wie in §14.9 (K-095).
- Mathe: `max`/`min` mit beliebig vielen Zahlen (keine → RechenAnanas), zusätzlich `potenz(a, b)`, `runden(x, n)`.
- Textformen weiterer Werte: Teig `Teig(roh)` / `Teig(<wert>)`; Lieferung `Lieferung #n`; Zustellung
  `Zustellung(<wert>)` / `Zustellung(zu spät)` / `Zustellung(Ananas)`; Stück `Stück von <pizza>`; Reste
  `Reste(<wert>)`; roh-Info `Roh(<teilergebnis>)`; Funktionen `<Funktion>`; Klassen, Module und quattrostagioni-Typen
  ihr Name. Zusätzlich `stück.essen()` → `karton`, `lieferung.istGeliefert()`, `funktion.rufe(…)`.
- `Uhr.vorspulen` akzeptiert auch Zahlen (ms); negativ → `RechenAnanas: Die Uhr lässt sich nicht zurückdrehen.`
- `Zufall.zahl(a, b)`: Ganzzahlen, a > b werden getauscht; Generator mulberry32 mit Seed 42, pro Lauf neu;
  Ergebnis `a + floor(r × (b − a + 1))`.
- `Spiegel.felder(obj)`: Felder der Basisklassen zuerst, jeweils in Deklarationsreihenfolge; Nicht-Objekt → TypAnanas.

---

## 15. Verbindliche Auslegungen aus dem Klärungsprotokoll (`KLAERUNGEN.md`)

Jede Nummer verweist auf den Eintrag in `KLAERUNGEN.md` (Frage, Begründung, Status, Tests in `pruefstand/faelle/a10-*.js`/`a11-*.js`).
Einträge mit **[offen …]** beschreiben das Sollverhalten; die genannte Komponente wird nachgezogen (der Referenz-Interpreter entspricht allen Einträgen seit Commit 0d34810).

### 15.1 Syntax und Werte
- **K-001** Pizza-Literal nur bei zwei Klammern in Ausdrucksposition: `f((A))` = Belag `A`, `f((A, B))` = Syntaxfehler P0001,
  `f(((A, B)))` = Pizza. Bei `((X))` gewinnt ein bekannter Belagname gegen eine gleichnamige Variable.
- **K-002** W0032: eine Warnung pro später deklariertem Namen (siehe §10, §14.8).
- **K-003** Zahlliterale ohne Exponent und ohne führenden/abschließenden Punkt. `-` bindet schwächer als Postfix:
  `-2.5.runden()` = `-(2.5.runden())`; nur nacktes `-Zahl`/`-Dauer` wird zum negativen Literal.
- **K-004** `salami` = ganzzahlige IEEE-754-Double: exakt bis ±2^53, kein Zweierkomplement-Überlauf
  (`2147483647 + 1 = 2147483648`), Textform wie `String(x)`. Backends dürfen `i32`/`i64` nur mit Überlaufprüfung nutzen.
- **K-005** `NaN`, `Infinity`, `-Infinity` sind gültige `funghi`-Werte mit genau diesen Textformen (`Mathe.wurzel(-1)`,
  Überlauf); `NaN == NaN` → `nein`; `salami` kann sie nicht halten (TypAnanas). Division durch 0 bleibt RechenAnanas.
- **K-006** `%`: Rest mit Vorzeichen des Dividenden, auch für Kommazahlen; `% 0` → RechenAnanas.
- **K-024** Nachgestelltes Komma erlaubt in `[1, 2,]` und `quattrostagioni { A, B, C, D, }`; sonst Syntaxfehler.
- **K-025** Text-Escapes genau `\n \t \r \" \\ \'` (§1).
- **K-027** Texte in Blech/Speisekarte erscheinen ohne Anführungszeichen (`[""]` → `[]`) – bewusst.
- **K-028** Eingebaute Funktionen kennen nur ihre dokumentierten benannten Argumente (`stellen`, `start`, `max`,
  `temperatur`, `zeit`, `haltbar`, `grund`, `ersatz`); unbekannte benannte Argumente werden ignoriert.
- **K-048** Rundung: `runden()` = `sign(x)·round(|x|)`; `runden(n>0)` = `sign(x)·round(|x|·10^n + 1e-9)/10^n`;
  `euro()` = `round(|x|·100 + 1e-9)/100` mit Vorzeichen, Komma, zwei Stellen, nie `-0,00 €`.
- **K-049** `Zufall.zahl`: mulberry32, Seed 42 (§11); erste Werte von `zahl(1, 6)`: 4, 3, 6, 5, 2, 4, 2, 4, 6, 3.
- **K-053** `schrittLimit` ≤ 0/NaN/fehlend → 5 000 000; nicht-ganzzahlig → Abbruch beim Schritt `floor(limit) + 1`.

### 15.2 Typen, Objekte, Standardbibliothek
- **K-016** Besitzprüfung ist syntaktisch: nur rechte Seite = Name/Feldzugriff (auch geklammert) → BesitzAnanas; `?:`,
  Blech-Literale, Methodenrückgaben nicht. `schieb(x)` für Variablen jeden Typs; nicht für Felder (LaufzeitAnanas).
- **K-017** `übrig` hängt am Pizza-Objekt; `p + Belag`/`p - Belag` → neue Pizza mit 8 Stücken. `==`/`Blech.enthält`
  vergleichen Pizzen nach Belägen. Speisekarten-Schlüssel: Zahl/Text/Wahrheitswert/`karton` nach Wert (`1` = `1.0`),
  Beläge nach Name, quattrostagioni-Werte, sonst (Pizza, Dauer, Blech, Objekte) nach Identität.
- **K-018** Kühlschrank-Schlüssel = Textform der Argumente (Objekte eigener Klassen nach Identität); geworfene Ananas
  werden nicht gecacht; gecachte Werte kommen per Referenz zurück (§14.10).
- **K-019** `wennDa` ersetzt den früheren Rückruf; `trinkgeld` nimmt jede Zahl (Faktor `1 + Summe/10` ≤ 0 → sofort zu
  spät); eine Zustellung ist endgültig.
- **K-020** Ofen: `temperatur ≤ 0` oder `zeit = 0` → Budget 0 (erster Schritt überschreitet); Grenze exakt `> 485`.
- **K-021** Bereich `[a .. b]`: beliebige Zahlen, Schritt 1 ab `a`, inklusive, absteigend bei `a > b`;
  mehr als 10 000 001 Elemente → `RechenAnanas: Der Bereich ist zu groß für ein Blech.`
- **K-022** `sortiere` ist stabil; Vergleichsfunktion muss eine Zahl liefern (Vorzeichen zählt); ohne Funktion nur
  Zahlen, Texte (UTF-16-Codeeinheiten, K-040), Dauern, Werte eines quattrostagioni – sonst TypAnanas.
- **K-023** Preis: je Standardbelag `runde2(unten + Standardpreis)`; eigene `preis()`-Methoden ungerundet;
  `Ananas.preis()` = 0; eigene Beläge ohne Tabellenpreis 1.00.
- **K-026** Hawaii: Panik bei jeder Zuweisung (auch `karton`) an `hawaii`-Variable/-Feld/-Parameter, nicht bei
  Deklaration ohne Initialisierer; `Blech<hawaii>` nur W0666; Belag-Wert `Ananas` allein (ausgeben, `hat`, `-`, `preis()`)
  keine Panik; W0666 nur für Typ `hawaii`, bloßen Namen `Ananas` und `Ananas` im Pizza-Literal (nicht `Q.Ananas`,
  `k.Ananas()`); Panik in allen Phasen; `neu Hawaii(…)` auch ohne Klasse.
- **K-029** `Spiegel.felder`: Instanzfelder (keine `tiefkühl`), Basisklassen zuerst; `karton` → LeererKartonAnanas,
  Nicht-Objekt → TypAnanas; Unterklassen einer Calzone sind zugeklappt; `aufklappen()` auf Nicht-Calzone → LaufzeitAnanas.
- **K-033** `hauptgang`: Name entscheidet (erste Klasse, sonst Top-Level-Funktion); Signatur ungeprüft; erster Parameter
  erhält das Args-Blech; mehr als ein Parameter → Aritätsfehler; Rückgabewert ignoriert.
- **K-034** `margherita` darf `karton` halten (§8).
- **K-035** `Teig.istAufgegangen()` → `ja` nur nach `gehenlassen()`.
- **K-036** Rückgabetyp ungeprüft: `serviere;` → `karton`, `serviere (x)` in `leer` liefert `x`, Rumpfende → `karton`.
- **K-037** Basiskonstruktor ohne `unten(…)`: parameterloser Aufruf oder Aritätsfehler (§3).
- **K-038** `auto` nur als Argument von `schneide`; sonst `LaufzeitAnanas: 'auto' ist nicht definiert.`
- **K-039** `p.hat("Tomate")` wie `p.hat(Tomate)`; `p + "x"` ist Textverkettung.
- **K-095** `Speisekarte.hole(k[, ersatz])` wie `Vorratskammer.hole` (K-079): `ersatz` (positional oder `ersatz:`) nur bei
  fehlendem Schlüssel (`hat(k)` = `nein`), gespeicherter `karton` bleibt `karton`, `ersatz` ohne Kopie; `hole(k)` unverändert.
- **K-076** `ersetze("", x)` lässt den Text unverändert; alle Text-Methoden arbeiten auf Codepoints, nur `<`/`sortiere`
  nach UTF-16-Codeeinheiten (K-040).
- **K-047** Die simulierte Uhr zählt ganze Millisekunden: `Uhr.vorspulen(d)` rundet kaufmännisch auf ms,
  `schritte`/`zeitMs` sind Ganzzahlen, Budgets `floor(...)` (Lieferung: `floor(max_ms × Faktor)`).

### 15.3 Ein-/Ausgabe, Motoren, Hosts (siehe §11.1)
- **K-007** Einheitliche Zahltext-Grammatik für `alsZahl`, `liesZahl`, `frageZahl` (§11.1).
- **K-008** `liesZahl(ersatz)` / `frageZahl(text, ersatz)`: Ersatzwert nur bei EOF (§11.1).
- **K-009/K-010** Zeilen unverändert, Prompt vor dem Lesen, ungültige Zeile verbraucht, Warten kostet nichts (§11.1).
- **K-011** Der Prompt wird vom Programm ausgegeben; `prompt` in Anfrage/HOST-ABI ist informativ.
- **K-012 (Nutzerentscheidung)** Panik-Banner bei CLI/Host/EXE → **stderr**, Exit 39; die Web-UI behandelt Hawaii nicht
  besonders (kein Crash-Overlay, Banner als normale Fehlerausgabe in der Konsole, Exit-Code 39 wie jeder andere). Siehe §9.
- **K-013 [offen]** Keine Kürzung langer Zeilen; HOST-ABI liefert benötigte Länge, Modul wiederholt mit größerem Puffer.
- **K-014 [offen Host/Compiler]** Interner Fehler jedes Motors: `fehler` mit `code "LaufzeitAnanas"`, `art "ananas"`, Text exakt
  `Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.` (+ ` (Zeile N)`), optionales Feld `detail`, Exit 1.
- **K-089 (Nutzerentscheidung)** Speicher-/Textgrenze eines Motors (z. B. `t = t + t` in einer Schleife) ist **kein** interner
  Fehler: alle Motoren werfen die fangbare `LaufzeitAnanas: Der Kühlschrank ist voll (Speicherlimit erreicht).` (Interpreter
  bildet Engine-Grenzen wie „Invalid string length“ darauf ab, die Wasm-Laufzeit wirft statt zu trappen). Die genaue Grenze
  und damit die Schrittzahl bis zum Wurf darf je Motor verschieden sein.
- **K-015** `abbrechen`/`weiter` außerhalb einer Schleife (bzw. `abbrechen` außerhalb von Schleife oder
  `wähle`-Anweisung) → `PizzaFehler P0012: 'abbrechen' steht außerhalb einer Schleife.` / `… 'weiter' …` (Parse-Fehler,
  art `syntax`, Exit 2). Methoden-, Konstruktor-, Lambda- und Ofen-Rümpfe beginnen einen neuen Kontext.
- **K-055** Auch Block-Arme eines `wähle`-**Ausdrucks** beginnen einen neuen Kontext: `abbrechen`/`weiter` dort → P0012,
  selbst innerhalb einer Schleife; den Wert liefert `serviere (x);`. (Arme der `wähle`-**Anweisung**: `abbrechen` erlaubt, K-015.)
- **K-040** Textordnung nach UTF-16-Codeeinheiten (§14.6) – auch in der Wasm-Laufzeit.
- **K-041 [offen]** HOST-ABI: separater Import `schreibe(ptr, len)`; `ausgabe` bleibt zweistellig.
- **K-042** EOF ist endgültig (§11.1).
- **K-043 [offen]** Host-Ladefehler: `{typ:"fehler", code:"HOST", art:"intern"}`, Exit 2.
- **K-044** `art` ∈ {syntax, pizzafehler, ananas, limit, intern}; `intern` nur für Host-/Worker-Fehler vor dem
  Programmstart (K-043), interne Fehler eines laufenden Motors bleiben `ananas` (K-014). **Kein Wand-Zeitlimit** (P0003 gestrichen,
  Nutzerentscheidung K-083/3): überall gilt nur das Schrittlimit P0002; der Playground bietet „Abbrechen“.
- **K-045** Bei Widersprüchen zwischen WASM.md und HOST-ABI.md gilt HOST-ABI.md.
- **K-046 [offen]** `umbruch` wird bei `Bote.sage` weggelassen (kanonisch); Exit-Codes genau {0, 1, 2, 3, 39}.
- **K-030/K-050/K-051/K-052** Doku-`ausgabe` darf den Panik-Banner weglassen; Doku-Codeblöcke dürfen `eingabe: string[]`
  tragen; `.eingabe`-Fallback neben der `.pizza`; `.erwartet` endet mit genau einem `\n` (Harnische normalisieren höchstens einen).
- **K-054** `leeren` im Terminal: `\x1b[2J\x1b[3J\x1b[H` nur bei TTY.

### 15.4 Zufall und Vorratskammer (K-077 … K-081; Interpreter ce303cb – Hosts/Compiler offen)

- **Saat (K-077):** `optionen.zufallsSaat` (Ganzzahl, normalisiert `mod 2^32`; fehlt/ungültig → 42). Playground, CLI (`--saat=N`,
  sonst Infozeile `Saat: N`) und EXE nutzen standardmäßig eine echte Saat und zeigen **denselben Text** `Saat: N` an (Konsole bzw. Terminal, keine Ereignis-Ausgabe); Tests/Beispiele bleiben bei 42.
- **Zufall-API (K-078):** mulberry32, `r ∈ [0,1)`; `saat(n)`/`saat()`; `zahl(a, b)` = `a + floor(r·(b−a+1))`; `kommazahl()` = `r`,
  `kommazahl(a, b)` = `a + r·(b−a)`; `wahr(p)` = `r < p`; `wähle(blech)` = Stück `1 + floor(r·n)` (leer → KeinStückAnanas);
  `mische(blech)` = neues Blech, Fisher-Yates von hinten (`i = n−1 … 1`, `j = floor(r·(i+1))`); `neu Zufall(saat)` eigener Strom,
  `neu Zufall()` zieht die Saat `floor(r·2^32)` aus dem globalen Strom; Textform `Zufall(<saat>)`. Jede Methode zieht genau einmal
  (`mische`: n−1). Referenz Saat 7: `zahl(1, 6)` → 1 1 6 5 4 3, `mische([1 .. 5])` → `[4, 2, 3, 5, 1]`.
- **Vorratskammer (K-079):** `neu Vorratskammer(name)` (`[a-z0-9-]{1,40}`), `lege(k, v)`, `hole(k[, ersatz])`, `hat(k)`, `entferne(k)`,
  `schlüssel()`, `länge()`, `leeren()`, `name()`; Werte: Zahlen (endlich), Texte, Wahrheitswerte, `karton`, Bleche/Speisekarten daraus;
  tiefe Kopie bei `lege`/`hole`; 1 MiB je Kammer und 2 MiB für alle Kammern eines Programms (passt in jeden localStorage); Schreiben sofort bei jeder Änderung; Textform `Vorratskammer(<name>)`.
- **API/Format (K-080):** `optionen.vorrat` (`{ name: [[k, v], …] }`), `optionen.onVorrat(name, eintraege)` (Doku-Blöcke: Felder `zufallsSaat`,
  `vorrat`, `vorratErwartet`, `echtzeit`, K-088), Ereignis
  `{ typ: "vorrat", name, schluessel, wert }` (nicht in `.erwartet`); ohne beides `W0101: Keine Vorratskammer verfügbar – Zustand wird
  nicht gespeichert.` (einmal pro Programm). Serialisierung `{"v":1,"name":"x","eintraege":[["k",wert],…]}`, Speisekarte als
  `{"speisekarte":[["k",v],…]}`, `karton` → `null`, `ja`/`nein` → `true`/`false`.
- **Backends (K-081):** Playground `localStorage["pizza.vorrat.<name>"]`; EXE/Host JSON-Datei im Nutzer-Datenverzeichnis, atomar;
  Verwaltung nur über den gleichen Befehl „Vorrat löschen“ in beiden Hüllen (kein Ansichts-Dialog, K-083/5); Beispiel-Tabs im
  Playground nutzen den Namensraum `pizza.vorrat-beispiel.<name>`, eigene Tabs `pizza.vorrat.<name>`; CLI/EXE: `--vorrat-loeschen <name>`
  (eine Kammer) und `--vorrat-loeschen-alle`, Texte `Vorrat '<name>' gelöscht.` / `Alle Vorräte gelöscht.` (K-088);
  HOST-ABI optionale Imports `vorrat_lesen`/`vorrat_schreiben` (Retry wie K-013); Host ohne Unterstützung → W0101-Verhalten.

---

## 16. Theke – UI-Framework (Tier 1 im Interpreter; Wasm/EXE: THEKE.md §6)

Übernommen aus `THEKE.md` (Sprache, Protokoll, API); dort bleiben Browser-/Host-/Renderer-Details (§3–§7). Präzisierungen
aus `KLAERUNGEN.md` K-056 … K-075 (Stand Referenz-Interpreter da07b46, Renderer `site/js/theke/`). Prüfstand: `a13-theke.js`.

### 16.1 Zutaten (v1)

| Klasse | Zweck | Konstruktor | Methoden |
|---|---|---|---|
| `Theke` | Fenster | `(titel = "", breite: 480, hoehe: 360)` | `zeige(zutat)` → Theke, `bediene()`, `schliesse()`, `titel()`, `setzeTitel(t)` |
| `Schild` | Text | `(text)` | `text()`, `setzeText(t)` |
| `Knopf` | Button | `(text, beiKlick?)` (auch `beiKlick: fn`) | `text()`, `setzeText(t)`, `beiKlick(fn)`, `aktiv(diavolo)` / `aktiv()` |
| `Eingabe` | Textfeld | `(wert: "", platzhalter: "")` | `wert()`, `setzeWert(t)`, `beiAenderung(fn)`, `beiEnter(fn)` |
| `Haken` | Checkbox | `(text, an: nein)` | `an()`, `setzeAn(diavolo)`, `beiAenderung(fn)` |
| `Stapel` / `Reihe` | Container vertikal / horizontal | `(Blech<Zutat>)` | `hinzu(zutat)` → Container, `leeren()` |

Basisklasse `Zutat` (`neu Zutat()` → RohlingAnanas): `id()`, `sichtbar(diavolo)` / `sichtbar()`, `stil(schlüssel, wert)`.
Jede Zutat nimmt `id: "…"` im Konstruktor. **Setter liefern die Zutat** (verkettbar); `aktiv()`/`sichtbar()` ohne Argument sind Getter.
Die Namen `Theke`, `Zutat`, `Schild`, `Knopf`, `Eingabe`, `Haken`, `Stapel`, `Reihe` sind eingebaute Klassen: `erbt Knopf` →
PizzaFehler P0010 (nicht erweiterbar); eine **eigene** Klasse gleichen Namens hat Vorrang. Die Programm-Schritte zählen wie bei
jedem Aufruf (§14.1); **Warten** in `bediene()` kostet weder Schritte noch Zeit noch Ofen-/Lieferbudget.

### 16.2 Verhalten (verbindlich)

- **Rückrufe (K-056):** `beiKlick(fn)` → `fn()`; `beiAenderung(fn)` → `fn(wert)` (Eingabe: Text, Haken: diavolo);
  `beiEnter(fn)` → `fn(text)`. Lambdas sind tolerant (§14.9). Erneute Registrierung ersetzt den Rückruf, `karton` entfernt ihn.
  Vor dem Rückruf ist der neue Wert gesetzt (`wert()`/`an()` liefern im Rückruf den geänderten Wert).
- **Setter (K-073):** `setzeText`/`setzeWert`/`setzeAn`/`aktiv`/`sichtbar`/`stil` lösen **keine** Rückrufe aus; ein Setzen auf den
  identischen Wert zählt trotzdem als Änderung (Nachricht wird gesendet).
- **Ereignisschleife (K-057):** `bediene()` sendet gepufferte Änderungen, wartet auf ein Ereignis, führt den Rückruf aus,
  sendet dessen Änderungen als **eine** `aendere`-Nachricht (auch wenn der Rückruf eine Ananas wirft – dann vor dem Verlassen)
  und wartet erneut. Ende: Ereignis `geschlossen` (kein Rückruf) oder `schliesse()` (Rückruf läuft zu Ende, danach Rückkehr;
  weitere Ereignisse werden nicht zugestellt). Reihenfolge im Ereignisstrom: `ausgabe`-Ereignisse des Rückrufs vor der `aendere`-Nachricht.
- **Bündelung (K-057):** Änderungen an **gezeigten** Zutaten werden gepuffert und an Synchronisationspunkten gesendet: vor jedem
  Warten in `bediene()`, nach jedem Rückruf, vor `schliesse`, vor dem erneuten `fenster` bei `setzeTitel`, am Programmende
  (wenn die Theke noch offen ist, gefolgt von `schliesse`, K-061). Eine `aendere`-Nachricht hat **einen Eintrag je Zutat** (Reihenfolge = erste Änderung),
  spätere Werte derselben Eigenschaft überschreiben frühere; `stil` wird als **ganzes** Stil-Objekt gesendet, `hinzu`/`leeren`
  als vollständige `kinder`-Liste (`leeren()` → `[]`). Änderungen an nicht gezeigten Zutaten erzeugen keine Nachricht (ihr Zustand
  steht im nächsten `baum`). Vom Renderer gemeldete Werte (`aenderung`/`enter`) werden nicht zurückgesendet.
- **`zeige` (K-058):** sendet beim ersten Mal `fenster`, dann `baum` mit dem vollständigen Zustand; gepufferte Änderungen verfallen.
  Erneutes `zeige` ersetzt den Baum (IDs bleiben); nach `geschlossen`/`schliesse()` öffnet `zeige` die Theke wieder (`fenster` + `baum`).
  `setzeTitel` an gezeigter Theke sendet `fenster` erneut. `zeige(karton)`/Nicht-Zutat → `TypAnanas: zeige() braucht eine Zutat, nicht karton.`
- **Ein Elternteil (K-059):** Eine Zutat liegt in höchstens einem Container, nur einmal, nicht in sich selbst; die gezeigte Wurzel
  gilt als belegt. Verstoß bei Konstruktor, `hinzu`, `zeige` → `LaufzeitAnanas: Die Zutat 'z1' liegt schon woanders auf der Theke.`
  bzw. `Die Zutat 'z1' kann nicht in sich selbst liegen.` `leeren()` löst die Kinder.
- **IDs (K-060):** automatisch `z1, z2, …` in Erzeugungsreihenfolge **unbenannter** Zutaten (bereits belegte Nummern werden
  übersprungen; `id: "z2"` ist erlaubt); `Theke` verbraucht keine Nummer. Benannte IDs müssen eindeutig und nicht leer sein →
  `LaufzeitAnanas: Die ID 'ok' gibt es schon.` bzw. LaufzeitAnanas bei leerer ID.
- **Eine Theke (K-062):** `neu Theke` zum zweiten Mal → `LaufzeitAnanas: Es gibt nur eine Theke pro Programm.`;
  `bediene()` ohne `zeige` → `LaufzeitAnanas: Die Theke ist leer.`; `bediene()` nach Schließen kehrt sofort zurück (ohne Warnung).
- **Programmende (K-061, Nutzerentscheidung):** Ein noch offenes Fenster wird am Programmende **geschlossen**: nach dem
  letzten Puffer-Flush sendet die Laufzeit `{"v":1,"op":"schliesse"}` – nur wenn das Fenster offen ist (gezeigt, nicht
  `geschlossen`/`schliesse()`), auch bei Ende durch ungefangene Ananas oder P0002 (die `ui`-Nachrichten stehen dann **vor** dem `fehler`-Ereignis).
  Bei Hawaii-Panik keine Nachricht; Host und UI schließen das Fenster selbst. Host: Fenster zu → Prozessende mit dem Exit-Code.
  Eine nie gezeigte Theke sendet nichts; nach `geschlossen` wird nichts mehr gesendet.
- **Ohne Renderer (K-063):** fehlen `onUiWarte` und `uiEreignisse`, warnt `bediene()` **je Aufrufstelle** (§10)
  `W0100: Keine Theke verfügbar – Fenster wird nicht angezeigt.` und kehrt sofort zurück; `fenster`/`baum`/`aendere`/`schliesse`
  werden trotzdem als `ui`-Ereignisse ausgegeben. `uiEreignisse` erschöpft → `geschlossen`; `onUiWarte` liefert `null` oder wirft → `geschlossen`.
  Nativ (EXE/`pizza-host`) kommt ein Theke-Programm, das kein Fenster bekommen kann (keine Anzeige, WebView fehlt), gar nicht bis W0100:
  es bricht vorher mit Meldung und Exit 2 ab (K-096, THEKE.md §4); W0100 gilt dort nur im JSON-/Testmodus.
- **Ereignisse (K-064):** `klick` nur für `Knopf` mit `aktiv == ja` und Rückruf; `aenderung`/`enter` für `Eingabe` (Text) bzw.
  `aenderung` für `Haken` (`true`/`false`, auch `"true"`/`"false"`). Ereignisse für unbekannte IDs, falsche Zutatenart, falschen
  `wert`-Typ, inaktive Knöpfe oder unbekannten `typ` werden **ignoriert**; `aenderung` ohne Rückruf aktualisiert trotzdem den Zustand.
  `{"typ":"bereit"}` ist ein internes Signal der nativen Hülle und erreicht das Programm nicht.
- **Ananas & Panik (K-065):** Ananas aus Rückrufen verlassen `bediene()` (fangbar mit `probier`); die Theke bleibt offen, erneutes
  `bediene()` wartet weiter. Panik beendet sofort (Exit 39, keine `schliesse`-Nachricht – Host/UI schließen selbst). `Bestellannahme`/`Bote` funktionieren in Rückrufen
  wie überall; `bediene()` in Ofen/Lieferung verbraucht beim Warten kein Budget; `bediene()` in `wennDa`-Rückrufen ist erlaubt.
- **Werte (K-066):** `setzeText`/`setzeTitel`/`setzeWert`/`platzhalter`/Konstruktor-Texte speichern die Textform jedes Werts;
  `aktiv`/`setzeAn`/`sichtbar`/`an:` verlangen diavolo (`TypAnanas: Erwartet diavolo (ja/nein), bekam 1.`); `breite`/`hoehe`
  ganzzahlig (`TypAnanas: Theke(breite: …) braucht eine Ganzzahl, nicht 2.5.`), Standard 480×360, Werte ≤ 0 überlässt der Renderer seinem Standard.
- **Stile (K-068):** `breite`/`hoehe`/`abstand`: Zahl ≥ 0 in Pixeln (Kommazahlen erlaubt, Renderer rundet) –
  `LaufzeitAnanas: Stil 'breite' braucht eine Zahl ≥ 0, nicht -1.` bzw. TypAnanas bei Nicht-Zahl; `ausrichtung` ∈ `links|mitte|rechts`;
  `schrift` ∈ `klein|normal|gross|mono`; `farbe` ∈ `tomate|basilikum|mozzarella|kruste|normal`. Unbekannter Schlüssel →
  `LaufzeitAnanas: Stil 'x' gibt es nicht. Erlaubt: breite, hoehe, abstand, ausrichtung, schrift, farbe.`; ungültiger Wert →
  `LaufzeitAnanas: Wert 'lila' ist für Stil 'farbe' nicht erlaubt. Erlaubt: …`. Keine freien CSS-Strings, keine Einheiten.
  **K-075:** `stil(schlüssel, karton)` entfernt den Stil; die Nachricht trägt `null` für entfernte Schlüssel.
- **Thema (K-083/4):** Das Programmfenster folgt im Playground dem Seiten-Thema (Standard OS-Thema; der Umschalter wirkt auch auf
  das Fenster), nativ dem OS-Thema – dieselbe Engine, dasselbe CSS. Nativ gibt es nur Varianten **mit** Fenster (K-083/1); fehlt die
  System-WebView, erscheint eine klare Fehlermeldung.
- **Textform (K-071):** Zutaten `Knopf(z3)` (Klassenname + ID in Klammern), Theke `Theke(<titel>)` (leer: `Theke()`).
- **Schritte (K-069):** Erzeugen/Setzen/`bediene()` kosten die normalen Aufrufknoten; Rückrufe zählen ihre Anweisungen;
  Warten und Zustellung eines Ereignisses kosten 0 (`t.bediene();` ohne Rückruf = 3 Schritte).

### 16.3 Protokoll (Version 1, JSON)

Programm → Renderer als Ereignis `{ typ: "ui", nachricht }`:
`{"v":1,"op":"fenster","titel":"…","breite":480,"hoehe":360}` (erstes `zeige`, erneut bei `setzeTitel` und Wiederöffnen) ·
`{"v":1,"op":"baum","wurzel":{…}}` · `{"v":1,"op":"aendere","aenderungen":[{"id":"z1","text":"…"},{"id":"z3","aktiv":false}]}` ·
`{"v":1,"op":"schliesse"}` (durch `schliesse()` und am Programmende bei offenem Fenster, K-061).
Knoten `{"id","art",…}` mit `art` ∈ `schild|knopf|eingabe|haken|stapel|reihe`. **Zustandsfelder immer:** `schild`/`knopf`: `text`;
`eingabe`: `wert`; `haken`: `text`, `an`; `stapel`/`reihe`: `kinder` (ggf. `[]`). **Nur bei Abweichung vom Standard:**
`platzhalter` (nicht leer), `aktiv: false`, `sichtbar: false`, `stil: {…}` (ganzes Objekt). Zahlen als JSON-Zahlen, Texte als
Strings, Wahrheitswerte `true`/`false`. In `aendere` gelten dieselben Felder (v3: zusätzlich `uebergang` und die Liste `animationen` neben `aenderungen`, §16.6); `kinder` ist die vollständige Kinderliste – der
Renderer akzeptiert dort auch `{"id":"z1"}` ohne `art` als Verweis auf einen bekannten Knoten (der Interpreter sendet Teilbäume
vollständig); der Renderer behandelt `stil` als Teil-Update (`null` setzt zurück).
Renderer → Programm: `{"typ":"klick","id"}`, `{"typ":"aenderung","id","wert"}`, `{"typ":"enter","id","wert"}`, `{"typ":"geschlossen"}`.
Unbekannte Felder/`art`/`op`/`typ` werden ignoriert bzw. als Platzhalter gerendert (Vorwärtskompatibilität); `v` steigt nur bei
inkompatiblen Änderungen. Der Renderer kennt für `ausrichtung` zusätzliche Synonyme (`start|oben|zentriert|ende|unten|strecken`) –
aus pizza sind nur `links|mitte|rechts` erreichbar.

### 16.4 API & Tests (ARCHITEKTUR §1, §6)

`optionen.onUi(nachricht)`, `optionen.onUiWarte() → ereignis | null` (synchron), `optionen.uiEreignisse: object[]`.
Testdateien: `<name>.ereignisse` (JSON-Lines → `uiEreignisse`), `<name>.ui-erwartet` (JSON-Lines aller `ui`-Nachrichten,
kanonisch – Schlüsselreihenfolge egal, Nachrichtenreihenfolge zählt); Doku-Codeblöcke: `uiEreignisse: object[]`,
`uiErwartet: object[]` (K-074). `ui`-Ereignisse stehen **nicht** in `.erwartet`. Compiler ohne Theke-Unterstützung meldet
`nichtUnterstuetzt` (Playground fällt auf den Interpreter zurück); HOST-ABI `ui_warte` folgt dem Retry-Muster von K-013.

### 16.5 Erweiterungen v2 (K-084 … K-087; Interpreter 4b7a2af, Renderer vorhanden – Compiler/Host offen)

Übernommen aus `THEKE-ERWEITERUNGEN.md`; kein neues `op`, keine neue Protokollversion (neue `art`/Felder; alte Renderer zeigen Platzhalter).

| Klasse / Methode | Konstruktor | Methoden | Knoten (Zustandsfelder immer, optionale nur bei Abweichung) |
|---|---|---|---|
| `Takt` (unsichtbar) | `(intervall, beiTakt?)` – Dauer ≥ 100 ms, ganze ms | `aktiv(d)`/`aktiv()`, `setzeIntervall(d)`, `intervall()`, `beiTakt(fn)` → `fn(anzahl)` | `{"art":"takt","intervall":1000}` (+ `aktiv:false`) · Ereignis `{"typ":"takt","id","anzahl"}` |
| `Fortschritt` | `(wert: 0, text: "")` – wert 0…1 geklemmt, NaN → 0 | `wert()`, `setzeWert`, `text()`, `setzeText` | `{"art":"fortschritt","wert":0.25}` (+ `text`) |
| `Abschnitt` | `(titel, Blech<Zutat>)` | wie Stapel + `titel()`, `setzeTitel` | `{"art":"abschnitt","titel","kinder"}` |
| `Tabelle` | `(spalten, zeilen)` – Zellen als Textform | `spalten()`, `setzeSpalten`, `zeilen()`, `setzeZeilen` | `{"art":"tabelle","spalten":[…],"zeilen":[[…]]}` |
| `Reiter` | `(titel, seiten)` | `waehle(n)` (1-basiert, sonst KeinStückAnanas), `gewaehlt()`, `beiAenderung(fn)` → `fn(n)` | `{"art":"reiter","titel":[…],"gewaehlt":1,"kinder":[…]}` · Ereignis `{"typ":"aenderung","id","wert":n}` |
| alle Zutaten | – | `hinweis(text)`, `hinweis()` | Feld `hinweis` (nur nicht leer) |
| Stil | – | `schrift` zusätzlich `"riesig"` | – |

- **Takt (K-084):** läuft nur im gezeigten Baum; `anzahl` (salami ≥ 1) = verstrichene Intervalle (Nachholregel des Renderers:
  `floor((jetzt − letzter)/intervall)`, Brücken summieren aufeinanderfolgende Schläge derselben `id`); Schläge auf unbekannte,
  inaktive oder Nicht-Takt-Zutaten werden ignoriert; `anzahl` fehlt/ungültig → 1; `< 100ms` →
  `LaufzeitAnanas: Ein Takt braucht mindestens 100ms, nicht 50ms.`; Textform `Takt(t1)`; Warten kostet nichts, der Rückruf zählt.
- **Zahlformat (K-085):** `x.tausender(n = 0)` → `1.234.567` / `1.234.567,00`; `x.kompakt(n = 2)` → `1,23 Mio.` (Stufen `Tsd.`, `Mio.`,
  `Mrd.`, `Bio.`, `Brd.`, `Trio.`; ohne nachgestellte Nullen; `< 1000` → `runden(x, n)` mit Komma; `≥ 10²¹` → `1,5e+22`);
  `euro(kompakt: ja)` → `1,23 Mio. €`.
- **Laufzeit (K-087):** Schrittlimit P0002 gilt für die Top-Level-Ausführung und **je Theke-Rückruf neu**: die Zählbasis wird beim
  Zustellen eines Ereignisses gesetzt und sonst nie zurückgesetzt (nach `bediene()` gilt die Basis des letzten Rückrufs weiter);
  `schritte`/`Uhr.jetzt()` zählen unverändert; `Uhr.echt()` → Dauer seit 1970 (ganze ms; Test: `optionen.echtzeit` fester Startwert; HOST-ABI `echtzeit_ms`).
- Ereignis-Kompatibilität: `.ereignisse` darf schon heute `takt`-Zeilen enthalten (unbekannte `typ` werden ignoriert, K-064).

### 16.6 Theke v3: Animationen (K-090 … K-094; Interpreter U-56 und Renderer U-58 umgesetzt; offen: Compiler U-57)

Animationen sind **rein visuell**: Sie ändern keinen Programmzustand, erzeugen keine Ereignisse und haben keine Wartezeit.
Keine neue Protokollversion, kein neues `op` (neues Feld `animationen` in `aendere`, neues Feld `uebergang`; alte Renderer ignorieren beides).

| Methode | an | Rückgabe | Protokoll-Eintrag |
|---|---|---|---|
| `animiere(art, dauer?)` (auch benannt: `art:`, `dauer:`) | jeder Zutat | die Zutat | `{"id":"z1","art":"puls"}` (+ `"dauer":300`) in `animationen` |
| `schwebe(text, bei?, farbe?, dauer?)` (auch benannt: `text:`, `bei:`, `farbe:`, `dauer:`) | `Theke` | die Theke | `{"art":"schwebe","text":"+12"}` (+ `"id"` von `bei`, `"farbe"`, `"dauer"`) in `animationen` |
| `uebergang(diavolo)` / `uebergang()` | jeder Zutat | Setter → Zutat, Getter → diavolo | Feld `"uebergang":true` (Standard `nein`; im `baum` nur bei `ja`, in `aendere` immer der neue Wert) |

- **Arten (K-090):** genau `puls`, `huepfen`, `wackeln`, `funkeln`, `einblenden`, `aufpoppen` (Vergleich der Textform, K-066;
  Groß-/Kleinschreibung zählt). Sonst `LaufzeitAnanas: Animation 'tanzen' gibt es nicht. Erlaubt: puls, huepfen, wackeln, funkeln, einblenden, aufpoppen.`
  `animiere` an einem `Takt` ist erlaubt und bleibt unsichtbar. Neue Arten = Eintrag in der Laufzeit-Liste + Animations-Registry des Renderers (wie Zutaten).
  Die Art ist ein Vokabular-Schlüssel wie bei `stil` (K-093): fehlendes Argument oder `karton` wird als Textform `karton` geprüft →
  `LaufzeitAnanas: Animation 'karton' gibt es nicht. Erlaubt: …`; `animiere(5)` → `Animation '5' …`. Keine eigene „braucht eine Art“-Ananas.
- **Benannte Parameter (K-094):** Alle Parameter von `animiere` und `schwebe` sind positional oder benannt (`art:`, `dauer:` bzw.
  `text:`, `bei:`, `farbe:`, `dauer:`), Bindung wie §14.9: Positionsargumente von vorn, benannte füllen den Rest, bei doppelter Angabe
  gilt der positionale Wert, unbekannte Namen werden ignoriert (K-028). Fehlertexte nennen den Parameter immer benannt (`animiere(dauer: …) braucht …`).
- **Dauer (K-090):** `dauer` ist eine `Dauer` (sonst `TypAnanas: animiere(dauer: …) braucht eine Dauer, nicht 300.` bzw.
  `schwebe(dauer: …) …`), auf ganze ms gerundet (K-047), danach **50 ms ≤ dauer ≤ 5 s**, sonst
  `LaufzeitAnanas: Eine Animation dauert 50ms bis 5s, nicht 10s.` (Dauer in Textform). Ohne `dauer` (oder `karton`) fehlt das Feld;
  der Renderer nimmt die Standarddauer der Art (K-092).
- **`schwebe` (K-090):** `text` wird als Textform gespeichert (K-066), auch leer (der Renderer zeigt für leeren Text oder nur
  Leerraum nichts und zählt ihn nicht zum Limit, K-093); fehlend oder `karton` → Schwebetext `"karton"`
  (K-093; keine Ananas, keine Warnung); `bei` ist eine Zutat oder `karton` (= Fenstermitte),
  sonst `TypAnanas: schwebe(bei: …) braucht eine Zutat, nicht 5.`; `farbe` ∈ `tomate|basilikum|mozzarella|kruste|normal` mit den
  Texten von K-068 (`LaufzeitAnanas: Wert 'lila' ist für Stil 'farbe' nicht erlaubt. Erlaubt: tomate, basilikum, mozzarella, kruste, normal.`).
  Optionale Felder (`id`, `farbe`, `dauer`) stehen **genau dann** im Eintrag, wenn das Argument angegeben und nicht `karton` ist.
- **Prüfreihenfolge:** Argumente (Art, `bei`, `farbe`, `dauer`) werden immer geprüft – Fehler sind Ananas, unabhängig vom Fensterzustand.
  Danach: ist die Theke nicht offen (nie gezeigt, nach `geschlossen`/`schliesse()`, keine Theke) → Warnung (§10, **je Aufrufstelle**)
  `W0102: Animation entfällt – die Theke ist nicht offen.`; liegt die Zutat (bei `schwebe`: `bei`) nicht im gezeigten Baum →
  `W0102: Animation entfällt – 'z3' liegt nicht auf der Theke.` In beiden Fällen entsteht **kein** Eintrag; keine Ananas (rein visuell).
  Gezeigt heißt wie in K-057 „im Baum der offenen Theke“ – auch `sichtbar(nein)`, nicht gewählte Reiter-Seiten und `Takt` (Renderer zeigt dann nichts).
- **Bündelung (K-090):** Einträge werden **in Aufrufreihenfolge** gepuffert, **nicht** zusammengefasst (zwei `puls` = zwei Einträge),
  höchstens **32 je Nachricht** (weitere entfallen still; die ersten 32 bleiben). Gesendet wird an denselben Synchronisationspunkten
  wie Änderungen (K-057) als Feld der `aendere`-Nachricht: `{"v":1,"op":"aendere","aenderungen":[…],"animationen":[…]}` – `animationen`
  nur wenn nicht leer; gibt es nur Animationen, ist `aenderungen` `[]`. Der Renderer wendet erst `aenderungen`, dann `animationen` an
  (eine Nachricht = ein Bild; `einblenden` auf eine im selben Rückruf per `hinzu` eingefügte Zutat funktioniert). `zeige` verwirft
  gepufferte Animationen wie gepufferte Änderungen (K-058); am Programmende gehen sie mit dem letzten Flush vor `schliesse` hinaus (K-061).
- **Determinismus (K-090):** Keine Rückmeldung vom Renderer (kein „Animation fertig“), kein Einfluss auf Rückrufe, Zustand, Zeit oder
  Budgets; eine laufende Animation hält keine Ereignisse auf (ein hüpfender Knopf bleibt klickbar). Schritte: die normalen Aufrufknoten
  (§14.1, K-069) – `k.animiere("puls");` kostet so viel wie `k.hinweis("puls");`; die Warnung W0102 kostet nichts.
  `ui`-Nachrichten sind in `.ui-erwartet`/`uiErwartet` testbar.
- **`uebergang` (K-091):** `uebergang(diavolo)` (sonst `TypAnanas: Erwartet diavolo (ja/nein), bekam 1.`) schaltet weiche Übergänge
  der Zutat: Wechsel von `sichtbar` blendet ein/aus (Ausblenden: sofort nicht mehr bedienbar), in Behältern (`Stapel`, `Reihe`,
  `Abschnitt`, `Reiter`) blenden **neu hinzugekommene** Kinder ein (nicht im ersten `baum`; entfernte verschwinden sofort; bei `Reiter`
  nur eine neue Seite, die zugleich gewählt ist). Kein Hochzählen von Texten. Ein `Fortschritt`
  gleitet **immer** (unabhängig von `uebergang`). Setter lösen keine Rückrufe aus (K-073); Textform unverändert.
- **Darstellung (K-092, Renderer):** Standarddauern `puls` 400 ms, `huepfen` 350 ms, `wackeln` 400 ms, `funkeln` 800 ms,
  `einblenden` 300 ms, `aufpoppen` 450 ms, `schwebe` 1000 ms, `uebergang` 200 ms; nur `transform`/`opacity`/Leuchten – das Layout der
  Nachbarn ändert sich nie; eine neue Animation an derselben Zutat ersetzt die laufende (Schwebetexte addieren sich, höchstens 20
  gleichzeitig; gleichzeitige Texte am selben Anker stapeln sich je eine Zeile höher auf dem kleinsten freien Platz und seitlich reihum
  versetzt – ohne Zufall; der Renderer hält sie im sichtbaren Ausschnitt, K-092). Farben aus dem Thema (hell/dunkel). **`prefers-reduced-motion: reduce`:** keine Bewegung, keine Übergänge –
  `puls`, `huepfen`, `wackeln`, `aufpoppen`, `einblenden` und `uebergang` entfallen, `funkeln` leuchtet nur ruhig, `schwebe` zeigt den
  Text ruhig (ohne Steigen) für die Dauer, `Fortschritt` springt. WebView2 und WebKitGTK melden die OS-Einstellung als
  `prefers-reduced-motion` – dieselbe Engine und dasselbe CSS ergeben in Playground und EXE dasselbe Bild (K-082).
