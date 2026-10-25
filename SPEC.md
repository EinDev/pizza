# pizza v3.1 – Sprachspezifikation (verbindlich)

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
  verschiedene, gültige Bezeichner. (`pizza` ist seit v3.0 **kein** Keyword mehr.)
- Zahlen: `42`, `1_000_000`, `7.50`. Unterstriche werden ignoriert.
- Dauer-Literale: Zahl **direkt** gefolgt von Einheit `ms`, `s`, `min`, `h`, `d` → Wert vom Typ `Dauer`
  (intern Millisekunden). Beispiele: `90s`, `30min`, `1h`, `3d`, `500ms`, `1.5s`.
- Texte: `"..."` mit Escapes `\n`, `\t`, `\r`, `\"`, `\\`, `\'` – andere Sequenzen und Zeilenumbrüche im Text sind Syntaxfehler (K-025).
- Operatoren/Satzzeichen: `+ - * / % == != < <= > >= && || ! ? : -> = += -= *= /= ++ -- . , ; ( ) { } [ ] @ ..`
- Anweisungen enden mit `;`. Blöcke stehen in `{ }`.

### Reservierte Keywords

```
paket import klasse rezeptur rohling calzone quattrostagioni
erbt erfüllt speisekarte familienrezept geheimrezept tiefkühl gebacken
leer neu dies unten serviere falls sonst für solange wähle fall standard
probier verbrannt rand wirf wirft abbrechen weiter ja nein karton ofen roh
```

- `ja` / `nein` – Wahrheitswerte. `karton` – null („leerer Karton“).
- Builtin-**Funktionen** (keine Keywords, aber global vordefiniert): `teig`, `bestelle`, `schieb`, `zwischenstand`.
- `belag` und `auf` sind seit K-105 **keine** reservierten Wörter mehr (gewöhnliche Bezeichner).

### Eingebaute Typnamen

| Typ | Bedeutung |
|---|---|
| `salami` | Ganzzahl |
| `funghi` | Kommazahl |
| `margherita` | Text |
| `diavolo` | Wahrheitswert |
| `Dauer` | Zeitdauer |
| `Blech<T>` | Liste |
| `Speisekarte<K, V>` | Map |
| `Teig<T>`, `Lieferung<T>`, `Zustellung<T>`, `Reste<T>`, `Rohling<T>` | Pizza-Funktionen (§7) |
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

Ein Programm darf aus **mehreren Dateien** eines Projekts bestehen (§2.1 … §2.6, K-138 … K-141; Konzept und Begründungen:
`PROJEKTE.md`). Für Programme aus genau einer `.pizza`-Datei ändert sich nichts. *Umgesetzt im Interpreter und in der CLI
(PROJEKTE.md PA1; Fälle `pruefstand/faelle/a19-projekte.js`, Ordner-Fälle `tests/faelle/projekt-*/`); `Kiste` und `Bildchen.laden`
(§11.2, §18.5) seit PD2 (Ordner-Fälle `tests/faelle/projekt-kiste/`, `projekt-bilder/`). Seit PA2 kompiliert auch der Wasm-Motor
Projekte (ein Modul, HOST-ABI v2) – Interpreter, Wasm und nativer Host bitgleich (Differenzkorpus `tests/differenz/korpus/projekt-*/`).*

### 2.1 Projekt, Projektdatei, Pfade (K-138)

- Ein **Projekt** ist ein Ordner; das Programm sieht ihn als **Dateisammlung** `{ pfad → Inhalt }` (dieselbe Form in API, Worker,
  CLI, ZIP, Teilen und pkarton; ARCHITEKTUR §1). Ein Text als Programm ist die Sammlung `{ "hauptgang.pizza": text }`.
- **Hauptdatei:** Feld `hauptdatei` der Projektdatei; sonst `hauptgang.pizza`; sonst – falls es genau **eine** `.pizza`-Datei gibt – diese.
  Gibt es keine → `PizzaFehler P0015: Die Datei "hauptgang.pizza" gibt es im Projekt nicht.`
- **Projektdatei `pizza.json`** (optional, an der Wurzel): `{ "pizza": 1, "name"?, "hauptdatei"?, "beschreibung"?, "args"? }`.
  `pizza` = Formatversion (Pflicht, Ganzzahl; > 1 → `PizzaFehler HOST: Diese Projektdatei braucht eine neuere pizza-Version.`);
  `name` ≤ 80 Zeichen (Anzeige, Standard: Ordnername bzw. Hauptdatei ohne `.pizza`), `hauptdatei` ein Pfad (Regeln unten),
  `beschreibung` ≤ 500 Zeichen, `args` ≤ 32 Texte à ≤ 200 Zeichen = **Standard-Argumente** für `hauptgang`, wenn keine Argumente
  übergeben werden (CLI, App-Link, EXE, Playground-Startwert). Unbekannte Felder werden ignoriert. Ungültig →
  `PizzaFehler P0015: pizza.json ist ungültig: <Grund>.` mit `<Grund>` ∈ `kein gültiges JSON` · `kein Objekt` · `"pizza" fehlt` ·
  `"<feld>" muss ein Text sein` · `"pizza" muss eine Ganzzahl sein` (auch für Werte unter 1) · `"args" muss ein Blech aus Texten sein` ·
  `"<feld>" ist zu lang` (`args`: mehr als 32 Einträge oder einer über 200 Zeichen); ein ungültiger Pfad in `hauptdatei` →
  `PizzaFehler P0015: "<pfad>" ist kein gültiger Dateipfad …` (Ort `pizza.json`).
- **Pfade** (eine Regel überall, `PizzaLang.projekt.pruefePfad`): relativ zur Projektwurzel, Trenner `/`, Segmente
  `[a-z0-9_-][a-z0-9_.-]*` (nicht mit `.` beginnend), keine leeren Segmente, kein `.`/`..`, höchstens 120 Zeichen und 8 Ebenen.
  Der Ordner `pruefung/` an der Wurzel gehört **nicht** zum Programm (Testdateien, ARCHITEKTUR §6). Dateiarten: `.pizza`, `.png`,
  `.jpg`/`.jpeg`, Modelle `.glb`/`.gltf` mit Puffern `.bin` (H-K16; Binärdateien wie Bilder, auch `.gltf`), Text (`.txt`, `.json`,
  `.csv`, `.md`). Ein ungültiger Pfad in der Sammlung →
  `PizzaFehler P0015: "<pfad>" ist kein gültiger Dateipfad (nur a–z, 0–9, -, _, . und /).`
- **Textdateien** sind UTF-8; der Lader ersetzt `\r\n` durch `\n` (einzelnes `\r` und ein BOM bleiben) – in jedem Motor, damit
  `Kiste`, Hashes und Teilen unter Windows dieselben Bytes sehen wie im Browser. Kommt eine Textdatei (nach Endung) als Bytes, wird
  sie streng dekodiert; ungültig → `PizzaFehler P0015: <pfad> ist kein gültiger UTF-8-Text.`
- **Grenzen des Laders** (ohne `pruefung/`): ≤ 100 Dateien, je Datei ≤ 2 MiB, `.pizza` ≤ 512 KiB, zusammen ≤ 8 MiB →
  `PizzaFehler P0020: Das Projekt ist zu groß für den Ofen (<Grund>).` mit `<Grund>` ∈ `101 Dateien, höchstens 100` ·
  `<pfad> hat 2,5 MB, höchstens 2 MB` · `<pfad> hat 601 KB, höchstens 512 KB` · `zusammen 8,4 MB, höchstens 8 MB`
  (KB = Bytes / 1024, MB = Bytes / 1 048 576, je **aufgerundet** auf eine ganze Zahl bzw. eine Nachkommastelle, Dezimalkomma).
  Bilder: §18.5.

### 2.2 `bestellt` und Ladereihenfolge (K-139)

```pizza
// hauptgang.pizza
bestellt "rezepte/teig.pizza";

Teig t = neu Teig(250);
Bote.sage((t));
```

- `bestellt "<pfad>";` holt eine andere `.pizza`-Datei ins Programm – nur auf oberster Ebene, an beliebiger Stelle (wie `paket`/
  `import`). Argument: ein **Textliteral** (Pfad relativ zur **Projektwurzel**, nicht zur Datei; Regeln §2.1). `bestellt` ist ein
  **kontextuelles** Schlüsselwort: nur `bestellt` + Textliteral auf oberster Ebene ist eine Bestellung; sonst bleibt `bestellt` ein
  normaler Bezeichner (`KEYWORDS` unverändert). Fehlt das `;` → P0001 wie bei `paket`.
- Ungültiger Pfad → `PizzaFehler P0015: "<pfad>" ist kein gültiger Dateipfad (nur a–z, 0–9, -, _, . und /).` (schon beim Parsen);
  keine `.pizza`-Endung → `PizzaFehler P0015: "<pfad>" ist keine .pizza-Datei – bestellen kann man nur Rezepte.`; Datei fehlt →
  `PizzaFehler P0015: Die Datei "<pfad>" gibt es im Projekt nicht.` (auch für `bestellt` in einem Text-Programm).
- **Ladereihenfolge:** Tiefensuche ab der Hauptdatei; jede Datei wird beim ersten Besuch geparst, ihre `bestellt` in
  **Textreihenfolge** besucht, danach kommt sie selbst in die Ladeliste (Abhängigkeiten zuerst, jede Datei einmal, Hauptdatei
  zuletzt). Nicht erreichbare `.pizza`-Dateien gehören nicht zum Programm (keine Warnung).
- **Kreis** (eine gerade besuchte Datei wird erneut erreicht, auch die Hauptdatei oder die Datei selbst) →
  `PizzaFehler P0014: Kreisbestellung: hauptgang.pizza → a.pizza → b.pizza → a.pizza.` (Position: das `bestellt`, das den Kreis
  schließt). Die Hauptdatei kann also niemand bestellen – gemeinsamer Zustand gehört in eine Nebendatei, die alle bestellen.
- Dieselbe Datei zweimal in **einer** Datei bestellt → `W0004: "<pfad>" ist schon bestellt.` (Position: das zweite `bestellt`).
- **Ablauf:** Das Programm ist die Verkettung der Dateirümpfe in Ladereihenfolge; darauf gilt der Snack-Modus oben unverändert
  (Hoisting aller Deklarationen, dann Top-Level-Anweisungen – also zuerst die Variablen-Initialisierungen der Nebendateien, dann die
  Anweisungen der Hauptdatei –, dann `hauptgang`). Statische Initialisierung, Annotationen und Analyse laufen auf diesem einen Programm.
  Laden und Bestellen kosten **keine Schritte**: Ein Programm hat in einer oder in mehreren Dateien dieselben Ereignisse, `schritte`
  und `zeitMs` (nur `datei` und die Ortsangaben unterscheiden sich).

### 2.3 Hauptdatei und Nebendateien (K-139)

- **Nebendateien** (alle außer der Hauptdatei) enthalten nur `bestellt`, `paket`, `import`, Klassen, Rezepturen, quattrostagioni,
  Top-Level-Funktionen und Top-Level-Variablen (auch `gebacken`, beliebiger Initialisierer, Mehrfachdeklaration). Jede andere
  Anweisung (Position: ihr erstes Token) → `PizzaFehler P0017: In <datei> dürfen nur Rezepte stehen (Klassen, Funktionen, Variablen) –
  Anweisungen gehören in die Hauptdatei <hauptdatei>.`
- `hauptgang` (Methode, auch in verschachtelter Klasse, oder Top-Level-Funktion) steht nur in der Hauptdatei; sonst →
  `PizzaFehler P0017: hauptgang gehört in die Hauptdatei <hauptdatei>, nicht nach <datei>.` In der Hauptdatei gilt der Einstieg wie oben.

### 2.4 Ein Namensraum, Sichtbarkeit (K-140)

- Alle obersten Namen (Klassen, Rezepturen, quattrostagioni – auch **verschachtelte**, die ohnehin global registriert werden, §14.5 –,
  Top-Level-Funktionen und -Variablen) liegen in **einem** Projekt-Namensraum. Derselbe Name in zwei Dateien (auch `geheimrezept`-Namen
  und Überladungen einer Top-Level-Funktion über Dateigrenzen) → `PizzaFehler P0016: 'Teig' gibt es zweimal – in rezepte/teig.pizza
  (Zeile 3) und in hauptgang.pizza (Zeile 10).` (Position: das spätere in Ladereihenfolge). Innerhalb einer Datei gilt alles wie bisher;
  eine eigene Klasse gleichen Namens wie eine eingebaute hat projektweit Vorrang.
- **Sichtbar** in einer Datei sind ihre eigenen obersten Namen und die nicht-`geheimrezept` obersten Namen der Dateien, die sie **direkt**
  bestellt (nicht transitiv); Standardbibliothek und eingebaute Klassen immer. `geheimrezept` auf oberster Ebene = nur in der eigenen
  Datei. Mitglieder von Klassen (`speisekarte`/`familienrezept`/`geheimrezept`) bleiben unverändert (Klassengrenzen, nicht Dateigrenzen).
- **Ladeprüfung** (im gemeinsamen Lader, gleich für Interpreter und Compiler; je Datei in Ladereihenfolge, darin nach Position): Ein
  Bezeichner-Token t in Datei F, das nicht direkt hinter `.` oder `@` steht, kein benanntes Argument `t:` ist und gleich einem obersten
  Namen N einer **anderen** Datei G ist, wird geprüft – außer t ist irgendwo in F als lokale Variable, Parameter, Lambda-Parameter,
  `für`-/Fang-/`roh`-Variable, Generik-Parameter oder Mitglied deklariert, oder t ist ein Mitgliedsname irgendeiner Klasse bzw. ein
  Wertname irgendeines quattrostagioni des Projekts. Dann: N ist `geheimrezept` → `PizzaFehler P0018: 'salzAnteil' ist ein Geheimrezept
  von rezepte/teig.pizza.`; G wird von F nicht direkt bestellt → `PizzaFehler P0019: 'Teig' kommt aus rezepte/teig.pizza – bestelle die
  Datei hier: bestellt "rezepte/teig.pizza";` (Position: t). Die Prüfung ist bewusst **konservativ** (meldet nie Gültiges; Zweifelsfälle
  laufen einfach, der Namensraum ist ja projektweit).

### 2.5 Reihenfolge der Ladeprüfungen (K-139)

Der erste Fehler bricht ab – Exit 2, `schritte` 0, **ohne** vorherige Warnungen (wie ein Syntaxfehler):
1. `pizza.json` (P0015, HOST) und Pfade der Sammlung (P0015), Hauptdatei vorhanden (P0015);
2. Tiefensuche: Syntaxfehler (P0001/K0001), P0014, P0015 in Besuchsreihenfolge;
3. Grenzen der Sammlung (P0020, §2.1);
4. P0017 → P0016 → P0018/P0019 (je Datei in Ladereihenfolge, darin nach Position).

Danach wie bisher: Warnungen (zuerst W0004 des Laders in Ladereihenfolge, dann W0666, W0032 …), Startprüfungen (§14.7), zuletzt die
Teigmenge (P0020, §18.5). Ereignis-`art` der Ladeprüfungen `"pizzafehler"`; was schon der Parser meldet (Syntaxfehler und der
ungültige Pfad im `bestellt`, P0015), hat `"syntax"` – so meldet `parse()` genau dann einen Fehler, wenn der Lauf mit `"syntax"` endet.

### 2.6 Fehlerorte (K-141)

- `fehler`- und `warnung`-Ereignisse tragen das Feld **`datei`** (Projektpfad) **immer**, direkt vor `zeile`; `zeile`/`spalte` zählen in
  dieser Datei. **`datei` ist `null`**, solange das Programm aus genau einer `.pizza`-Datei besteht (Text, CLI-Datei oder
  Ein-Datei-Projekt) – dann sieht alles aus wie bisher. Fehler der Projektdatei: `datei: "pizza.json"`, ohne Zeile; Fehler der Sammlung
  ohne Ort (Grenzen, ungültiger Pfad, fehlende Hauptdatei, Teigmenge): `datei`, `zeile`, `spalte` = `null`.
- Ladeprüfungen und Syntaxfehler tragen die Datei, in der die Ursache steht. Genauer für Ladefehler (das Programm steht da noch nicht
  fest): Ein Text-Programm (ohne Sammlung) nennt nie eine Datei; in einer Sammlung nennt jeder Fehler an einem `bestellt` (P0014,
  P0015) seine Datei und jeder andere Fehler mit Ort (Syntax, P0016 … P0019), sobald die Sammlung mehr als eine `.pizza`-Datei hat –
  ein Syntaxfehler in einem Ein-Datei-Projekt sieht also aus wie bisher.
- **Texte:** Nur die ungefangene Ananas trägt einen Ort im `text` – in der Hauptdatei wie bisher `… (Zeile 12)`, in Nebendateien
  `… (rezepte/teig.pizza, Zeile 12)`. Alle anderen Orte bauen die Hüllen (CLI, nativer Host, Playground-Konsole) aus den Feldern: Sie
  nennen den Pfad, **sobald `datei ≠ null`** (also in Mehrdatei-Programmen auch für die Hauptdatei): `<text> (Zeile Z, Spalte S)` bzw.
  `<text> (rezepte/teig.pizza, Zeile Z, Spalte S)` (K-083, HOST-ABI §7).
- Warnungen gelten einmal je Code + **Datei** + Zeile + Spalte (§10, §14.8).

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

Unbekannte Annotationen (auch das frühere `@Nach`, K-105) werden geparst und ignoriert.

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
Blech-Literal `[a, b, c]`, Bereich `[a .. b]` (inklusive), Lambda, `neu Typ<...>(args)`, `ofen`-Ausdruck.

- `+` mit mindestens einem Text → Textverkettung. `/` ist exakte Division; Division durch 0 → `RechenAnanas` („Durch null teilen? Das ergibt keine Stücke.“).
- `==`/`!=`: Wertgleichheit für Zahlen, Texte, Wahrheitswerte, Dauer; sonst Identität.
- Lambdas: `(a, b) -> ausdruck`, `x -> ausdruck`, `() -> { block mit serviere (...); }`. Closures fangen den Scope ein.
  Funktionswerte werden mit `f(x)` aufgerufen.
- Benannte Argumente: `name: ausdruck` in Argumentlisten (für Builtins und für eigene Methoden – dann nach Parametername).
- Methodenreferenz: `obj.methode` / `Klasse.methode` ohne `()` → gebundener Funktionswert.
- Doppelte Klammern um Ausdrücke sind stilistisch erwünscht (`Bote.sage(("Hallo"));`) und haben keine Bedeutung –
  `((x))` ist immer eine normale Klammerung. Ein **Pizza-Literal** `((Tomate, Käse))` gibt es seit K-105 nicht mehr:
  `((a, b))` und `(())` sind gewöhnliche Syntaxfehler P0001.

### Textform von Werten (`alsText`, Ausgabe)

| Wert | Text |
|---|---|
| Ganzzahl / Kommazahl | JS-Darstellung: `8`, `7.5`, `0.1` |
| `ja`/`nein` | `ja` / `nein` |
| `karton` | `karton` |
| Text | roh (ohne Anführungszeichen) |
| Blech | `[1, 2, 3]` |
| Speisekarte | `{a: 1, b: 2}` |
| Dauer | `1min 30s`, `90ms`, `2h`, `3d 4h`; 0 → `0ms` (größte Einheiten zuerst, Nullteile weglassen) |
| Objekt | `alsText()` falls vorhanden, sonst `Klassenname@N` (N = laufende Instanznummer ab 1) |
| Ananas | `Typ: Nachricht` |

---

## 6. Pizzen & Beläge – entfallen (K-105)

Das eingebaute Objekt `Pizza` (Literal `((Tomate, Mozzarella))`, Zutatenliste mit Preisen, `@Nach`/B0012, `belag … auf Pizza`-Decorators,
`preis()`/`beläge()`/`hat()`/`anzahlBeläge()`/`übrig()`, Belag-Werte) war Fachlogik einer Pizzeria und ist **kein Teil der Sprache mehr**
(Nutzerentscheidung K-105). Wer eine Pizza braucht, schreibt eine eigene Klasse `Pizza` – Beispiele und Doku zeigen, wie.
Großgeschriebene Namen sind gewöhnliche Namen (`Tomate` → `LaufzeitAnanas: 'Tomate' ist nicht definiert.`), `neu Pizza()` ohne eigene
Klasse → `UnbekanntePizzaAnanas: Klasse 'Pizza' steht nicht auf der Speisekarte.` Die Nummerierung der Abschnitte bleibt stabil.

---

## 7. Pizza-Funktionen

### 7.1 Simulierte Uhr & Schritte (Tier 2)

- Jeder ausgewertete Ausdruck/jede Anweisung ist ein **Schritt**. Die simulierte Uhr läuft **1 ms pro Schritt**.
- `Uhr.jetzt()` → Dauer seit Programmstart. `Uhr.vorspulen(d)` → Uhr springt um `d` weiter.
- Wanduhr (nicht simuliert, §16.5): `Uhr.echt()` → Dauer seit 1970 (UTC), `Uhr.zone()` → Versatz der Ortszeit zu UTC (K-154).
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
salami s = ofen(zeit: 90s) {
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
- Argument `zeit` (Standard 60s), benannt oder positional (`ofen(90s)`). Budget in Schritten = `zeit_ms` (K-127: eine
  Ofentemperatur gibt es nicht mehr).
- Budget überschritten → `roh (r)`-Zweig (falls vorhanden) mit `r.teilergebnis()` (letzter `zwischenstand` oder `karton`)
  und `r.verbrauchteZeit()` (Dauer). Ohne `roh`-Zweig → wirft `VerbranntAnanas("Zu lange im Ofen: Budget von N Schritten überschritten.")`.
- `verbrannt`-Zweige fangen Ananas, die im Block geworfen werden; Syntax wie bei `probier`. Nicht gefangene laufen weiter nach außen.
- `roh` und `verbrannt` sind beide optional, Reihenfolge: erst `roh`, dann `verbrannt`.
- Das gesamte `ofen(...) {...} ...` ist ein **Ausdruck**; als Anweisung mit `;` abschließen.

### 7.4 Schneiden – Parallelität (Tier 2: sequentiell simuliert)

- `blech.schneide(n)` → Blech aus `n` Teil-Blechen (so gleichmäßig wie möglich, vordere Stücke ggf. größer); `n` ist eine
  Ganzzahl ≥ 1 und Pflicht (K-127: kein `schneide(auto)`, keine Warnung bei 7 Stücken mehr).
- Operator `blech / n` → wie `schneide(n)`, aber **fair**: geht es nicht auf →
  `StreitAnanas: 8 Stücke lassen sich nicht fair durch 3 teilen.`
- Danach typisch `.belege(fn)` (map) und `.zusammenklappen(fn)` (reduce) – das sind normale Blech-Methoden.
- **Echte Parallelität:** `.brigade(fn)` statt `.belege(fn)` verteilt die Stücke auf Köche (§17, Küchenbrigade); `schneide`,
  `belege` und `zusammenklappen` selbst bleiben sequentiell und unverändert.

### 7.5 Schieben – Ownership (Tier 1)

- `schieb(x)` – `x` muss ein Bezeichner (Variable jeden Typs) sein. Liefert den Wert; die Variable ist danach **weggeschoben**:
  jeder Lesezugriff → `LeererKartonAnanas: 'p' wurde weggeschoben – der Karton ist leer.` (Neuzuweisung erlaubt.)
  Felder lassen sich nicht schieben (`schieb(k.p)` → `LaufzeitAnanas`, K-016). Das Argument kostet keinen Schritt (§14.1).
- Zuweisung und Deklaration per Name (`Pizza b = a;`) sind für **jeden** Typ erlaubt – die frühere Besitzprüfung
  (`BesitzAnanas`) und die Stückzählung `teile(p)`/`Stück<Pizza>`/`übrig()` gehörten zum entfernten Pizza-Objekt (K-105).

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

### 7.7 Lieferung – Async mit Priorität (Tier 2)

```pizza
Lieferung<salami> l = bestelle(() -> (rechne()));
l.priorität(5);                                  // gibt die Lieferung zurück
Zustellung<salami> z = l.warte(max: 30min);
salami wert = z.oderGratis((0));
```
- `bestelle(fn)` → `Lieferung`, Funktion läuft noch nicht.
- `priorität(n)` → setzt die Priorität (jede Zahl, Standard 0, der letzte Aufruf gilt); sie ordnet nur die `wennDa`-Phase (K-127).
- `warte(max: d)` → führt jetzt aus mit Budget `d_ms` Schritten → `Zustellung` mit
  `pünktlich()`, `wert()` (zu spät → wirft `LieferAnanas: Zu spät – die Pizza ist kalt.`), `oderGratis(v)` (zu spät → `v`).
  Ananas aus `fn` werden bei `wert()`/`oderGratis()` weitergeworfen. Mehrfaches `warte` liefert dieselbe Zustellung.
- `wennDa(fn)` → registriert Rückruf; alle noch nicht gewarteten Lieferungen mit Rückruf laufen **nach Programmende**
  (nach `hauptgang`), sortiert nach Priorität absteigend, bei Gleichstand in Bestellreihenfolge. Budget dort: unbegrenzt.

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
    ├── GebackenAnanas          ├── TypAnanas
    ├── KeinStückAnanas         ├── ZugriffsAnanas
    ├── ZugeklapptAnanas        ├── UnbekanntePizzaAnanas
    └── KüchenAnanas      (§17, K-098)
```
Reihenfolge der eingebauten Ananas (verbindlich für `PizzaLang.ANANAS` und die Klassenindizes der Wasm-Laufzeit, K-105): Ananas,
GeprüfteAnanas, VerbranntAnanas, LieferAnanas, LaufzeitAnanas, StreitAnanas, RechenAnanas, LeererKartonAnanas, RohlingAnanas,
GebackenAnanas, TypAnanas, KeinStückAnanas, ZugriffsAnanas, ZugeklapptAnanas, UnbekanntePizzaAnanas, KüchenAnanas (16).
`BesitzAnanas` und `UnbekannterBelagAnanas` gibt es nicht mehr (`neu BesitzAnanas(…)` → UnbekanntePizzaAnanas wie bei jeder unbekannten Klasse).
- Erzeugen: `neu VerbranntAnanas("Nachricht")`. Methoden: `nachricht()`, `holeNachricht()` (Alias), `typ()` (Klassenname).
- Eigene Ananas: `klasse MeineAnanas erbt LaufzeitAnanas { speisekarte MeineAnanas(margherita m) { unten(m); } }`.
- Eigene Klassen und Ananas sind mit `verbrannt (Typ a)` fangbar (instanceof inkl. Vererbung).
- Interne Fehler (z. B. Methode nicht gefunden, Variable unbekannt) sind `LaufzeitAnanas` mit passender Meldung,
  etwa `LaufzeitAnanas: 'x' ist nicht definiert.` / `LaufzeitAnanas: Methode 'foo' gibt es auf Blech nicht.`
  Auch die Nutzung entfernter Sprachteile (K-105) ist nur das: `Tomate` → `'Tomate' ist nicht definiert.`, `teile(x)` →
  `'teile' ist nicht definiert.`, `neu Pizza()` → `UnbekanntePizzaAnanas: Klasse 'Pizza' steht nicht auf der Speisekarte.`
- `TypAnanas` bei Typverletzung an Deklarationen/Zuweisungen/Parametern für `salami` (muss ganzzahlig sein),
  `funghi` (Zahl), `margherita` (Text), `diavolo` (Wahrheitswert), `Dauer`, eigene Klassen (instanceof).
  `karton` ist für alle Typen außer `salami`, `funghi`, `diavolo` erlaubt (also auch für `margherita`, §14.6/K-034). Andere/unbekannte Typen (z. B. `Blech<T>`) werden nicht geprüft.
  Meldung: `TypAnanas: 'x' ist salami, aber der Wert 3.5 ist keine Ganzzahl.` (sinngemäß, Inhalt frei)
- Ungefangene Ananas → Programmende, Ausgabe als Fehler-Ereignis `Ungefangene Ananas – Typ: Nachricht (Zeile N)`, Exit-Code 1.
- Lesen einer Variable, die `karton` ist, ist ok; **Methodenaufruf/Feldzugriff auf `karton`** → `LeererKartonAnanas: Der Karton ist leer.`
- `wirft`-Klauseln werden nicht geprüft (Tier 3).

---

## 9. Hawaii (Tier 1) – Easter Egg

- `hawaii` ist ein gültiger Typ. Der Parser akzeptiert alles.
- Vor dem Start: enthält der Quelltext den Typ `hawaii`, gibt es **eine** Warnung
  `W0666: Typ 'hawaii' gefunden. Der Pizzaiolo sagt nichts. Er schaut nur.` (Der Name `Ananas` ist nur noch die Basisklasse
  der Ausnahmen, §8 – als bloßer Name der Klassenwert mit Textform `Ananas`, keine Warnung; K-105.)
- **Panik-Auslöser** zur Laufzeit: (a) eine Variable/Feld/Parameter vom Typ `hawaii` erhält einen Wert,
  (b) `neu Hawaii(...)` (Klasse namens `Hawaii`, beliebige eigene Klasse – auch ohne Deklaration).
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
- Warnungen werden einmal pro Code+Stelle (Datei, Zeile, Spalte – §2.6) ausgegeben und beeinflussen den Exit-Code nicht.

---

## 11. Standardbibliothek (Tier 1, sofern nicht in §7)

| Objekt/Typ | Mitglieder |
|---|---|
| `Bote` | `sage(x)` – Ausgabe + Zeilenumbruch · `fehler(x)` – Fehlerausgabe |
| `Uhr` | `jetzt()`, `vorspulen(d)` |
| `Mathe` | `wurzel(x)`, `max(a, b)`, `min(a, b)`, `abs(x)`, `runden(x)`, `boden(x)`, `decke(x)`, `PI`; ferner `potenz(a, b)`, `runden(x, n)`, `log(x)`, `log10(x)`, `log2(x)`, `exp(x)`, `E` (§14.11, K-111); `sin(x)`, `cos(x)`, `tan(x)`, `asin(x)`, `acos(x)`, `atan(x)`, `atan2(y, x)`, `bogen(grad)`, `grad(bogen)` (§14.11, K-137) |
| `Zufall` | `zahl(a, b)` – ganzzahlig, inklusive, **deterministisch**: mulberry32 mit Saat 42 (`optionen.zufallsSaat`), `a + floor(r · (b − a + 1))` (K-049); ferner `saat([n])`, `kommazahl([a, b])`, `wahr(p)`, `wähle(blech)`, `mische(blech)`, `neu Zufall([saat])` – §15.4 (K-077/K-078, offen) |
| `Vorratskammer` | persistenter Zustand über Läufe: `neu Vorratskammer(name[, namensraum])`, `lege`, `hole`, `hat`, `entferne`, `schlüssel`, `länge`, `leeren`, `name`, `namensraum` – §15.4 (K-079 … K-081, K-106) |
| `Spiegel` | `felder(obj)` (§7.8) |
| `Kiste` | Projektdateien lesen: `text(pfad)`, `zeilen(pfad)`, `gibts(pfad)`, `liste(ordner = "")` – §11.2 (K-146, offen) |
| Zahl | `währung(symbol)` → `8.währung("€")` = `"8,00 €"` (K-127), `runden()` / `runden(n)`, `abs()`, `alsText()`, `ganz()` (abschneiden) |
| Text | `länge()`, `groß()`, `klein()`, `enthält(s)`, `zerlege(trenner)` → Blech, `ersetze(a, b)`, `trimme()`, `zeichen(i)` (ab 1), `wiederhole(n)`, `beginntMit(s)`, `alsZahl()` |
| Blech | `länge()`, `stück(i)` (**ab 1**, außerhalb → `KeinStückAnanas`), `hinzu(x)` (gibt Blech zurück), `entferne(i)`, `setze(i, x)`, `enthält(x)`, `belege(fn)` (map), `filtere(fn)`, `zusammenklappen(fn)` / `zusammenklappen(fn, start)` (reduce), `summe()`, `erstes()`, `letztes()`, `umdrehen()`, `sortiere()` / `sortiere((a, b) -> ...)`, `verbinde(trenner)`, `istLeer()`, `schneide(n)` |
| Speisekarte | `lege(k, v)`, `hole(k[, ersatz])` (fehlt → `ersatz`, sonst `karton`; auch benannt `ersatz:`, K-095), `hat(k)`, `entferne(k)`, `schlüssel()`, `werte()`, `länge()` |
| Dauer | `+ -` mit Dauer, `* /` mit Zahl, Vergleiche, `inMs()`, `inSekunden()` |
| `neu Blech<T>()`, `neu Speisekarte<K, V>()` | |

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
Beispiele (Projektordner, K-144): die Eingabe liegt in `<ordner>/pruefung/eingabe` (eine Zeile pro Eingabe), das Manifest markiert
Spiele mit `"interaktiv": true` (ARCHITEKTUR §3/§6).

### 11.2 `Kiste` – Projektdateien lesen (K-146; umgesetzt im Interpreter mit PROJEKTE.md PD2, in Wasm/Host mit PA2 – die Sammlung liefert `projekt.lade` als `kiste`)

Die **Kiste** sind alle Dateien der Sammlung (§2.1) außer `pruefung/` – auch `.pizza`-Dateien, `pizza.json` und Bilder, auch nicht
erreichbare Dateien. Nur lesend; Schreiben bleibt Sache der Vorratskammer (§15.4). Eingebautes Modul wie `Bote` (eine eigene Klasse
`Kiste` hat Vorrang); in Stücken einer `brigade` erlaubt (lesend, deterministisch).

| Aufruf | Ergebnis | Fehler |
|---|---|---|
| `Kiste.text(pfad)` | `margherita` – Inhalt wie in der Sammlung (UTF-8, `\n`-Zeilenenden, §2.1) | fehlt oder ungültiger Pfad → `LaufzeitAnanas: Die Datei "<pfad>" liegt nicht in der Kiste.`; keine Text-Endung (`.txt .json .csv .md .pizza`) → `LaufzeitAnanas: <pfad> ist kein Text.` (nach **Endung**, nicht nach Bytes) |
| `Kiste.zeilen(pfad)` | `Blech<margherita>` – `text` an `\n` getrennt, eine leere letzte Zeile entfällt | wie `text` |
| `Kiste.gibts(pfad)` | `diavolo` – `ja` nur für Dateien (nicht für Ordner) | nie (ungültiger Pfad → `nein`) |
| `Kiste.liste(ordner = "")` | `Blech<margherita>` aller Dateipfade unter `ordner` (rekursiv; `""` = alle, sonst Präfix `ordner + "/"`), nach Bytefolge sortiert | ungültiger oder unbekannter Ordner (auch mit Schluss-`/`) → leeres Blech |

- Argument kein Text → `TypAnanas: Kiste.text() braucht einen Text für 'pfad', nicht 5.` (ebenso `zeilen`, `gibts`, `liste` mit `'ordner'`).
- Jeder Aufruf ist ein normaler Aufruf (keine größenabhängigen Schritte). Im `.pkarton` liegt die Kiste als Datensegment (HOST-ABI §1);
  ein EXE enthält damit auch die Quelltexte lesbar.

## 12. Exit-Codes

| Code | Bedeutung |
|---|---|
| 0 | gegessen (alles gut) |
| 1 | ungefangene Ananas |
| 2 | PizzaFehler (Syntax, R0001, Q0004, A0001, P0010, P0011, K0001, P0012 [K-015], Ladeprüfungen P0014 … P0020 [§2.5] …; Host-Ladefehler `HOST` [K-043]) – alle entstehen vor dem Start; einen PizzaFehler zur Laufzeit (früher B0012) gibt es seit K-105 nicht mehr |
| 3 | Schrittlimit (P0002) – ein Wand-Zeitlimit gibt es nicht (K-083/3) |
| 39 | Hawaii |

## 13. Tier 3 – nur Spezifikation

- Toolchain: Compiler `pizzaiolo backe`, Build-Tool `pizzaofen` mit `ofen.xml`, Archive `.pkarton`, Paketmanager `pizzabote`.
- Statische Prüfung von Generics und `wirft`.
- Echte Hintergrund-Threads bei `teig` und `bestelle` bzw. ein eigenes Konstrukt „Hintergrund-Köche“ (§17.8, K-097/F9).
  (Echte Parallelität ist mit `brigade` Tier 1 geworden, §17; `schneide`/`belege` bleiben sequentiell.)

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
  `unten` als Wert, `neu`, Blech-Literal, Bereich,
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
  Ergänzung Küchenbrigade (§17.6 D6): Uhr und `zeitMs` = Schritte + vorgespulte Zeit **+ Brigade-Ersparnis (≤ 0)** – nach einer
  Brigade zählt die Uhr nur den kritischen Pfad (Anschnitt + längstes Stück), `schritte` die Summe aller Stücke.
- **P0002:** Abbruch beim Schritt Nummer `schrittLimit + 1` (Standard 5 000 000). Nicht fangbar; `rand` läuft nicht.
  Einzige Ausnahme: P0002 in oder nach einer Brigade (§17.6 D7) meldet die tatsächliche **Arbeit** – Stück-P0002: Schritte der
  Stücke 1 … k−1 plus Limit + 1 des abbrechenden Stücks k (die Küchenuhr steht bei Limit + 1); Summenprüfung: P0002 am
  `brigade`-Aufruf mit der Schrittsumme. Beides kann größer als `schrittLimit + 1` sein (K-101/2).

### 14.2 Budgets von Ofen und Lieferung

- Budgets messen die **simulierte Uhr** (Schritte + `Uhr.vorspulen`). Ein Budget von N erlaubt N Uhr-Millisekunden ab
  Beginn; überschritten ist es, sobald die Uhr > Start + N ist (beim N+1-ten Schritt oder direkt nach einem
  `vorspulen`, das darüber hinausführt).
- **Ofen:** Start nach Auswertung der Argumente; N = `floor(zeit_ms)`; `zeit` auch positional (`ofen(90s)`, weitere
  Positionsargumente werden ausgewertet und ignoriert), `zeit` darf eine Zahl (ms) sein, sonst TypAnanas
  (`ofen(zeit: …) braucht eine Dauer, nicht "x".`). `verbrauchteZeit()` = Uhr beim Abbruch − Start
  (Beispiel: `ofen(zeit: 5ms) { solange (ja) { } }` → `6ms`).
- Mehrere verschachtelte Budgets gleichzeitig überschritten → das **äußerste** greift; innere Öfen/Lieferungen werden
  ohne ihren `roh`-Zweig verlassen.
- Die `verbrannt`-Zweige eines Ofens fangen Ananas aus dem Block, und die
  „Zu lange im Ofen“-Ananas (wenn kein `roh` existiert) – nicht aber Ananas aus dem `roh`- oder einem `verbrannt`-Block.
- Ohne `serviere` ist der Wert eines Ofens `karton`. `abbrechen`/`weiter` direkt im Ofen-Block sind ein Parse-Fehler P0012 (K-015).
- `rand` läuft auch bei einem Budget-Abbruch, aber nie bei Panik, P0002 oder PizzaFehlern.
- **Lieferung:** `warte()` ohne `max` = unbegrenzt; `warte(30min)` positional erlaubt; Budget = `floor(max_ms)`;
  `priorität` ändert das Budget nicht (K-127). `zwischenstand` außerhalb eines Ofens wird ignoriert.

### 14.3 `wennDa`-Zeitpunkte

- `wennDa(fn)` auf eine bereits gewartete, pünktliche, fehlerfreie Lieferung → `fn(wert)` sofort.
- `wennDa` vor `warte` registriert → `fn(wert)` direkt nach einem pünktlichen, fehlerfreien `warte`.
  Zu spät oder mit Ananas → kein Rückruf.
- Nach Programmende (nach `hauptgang`, nur bei normalem Ende) laufen alle nie gewarteten Lieferungen mit Rückruf –
  immer die offene mit der höchsten Priorität zuerst, bei Gleichstand die früher bestellte; während dieser Phase neu
  registrierte werden mit einsortiert. Kein Budget. Ananas dort → ungefangen (Exit 1). Lieferungen ohne `wennDa`
  laufen nie.

### 14.4 Rekursion und Stapeltiefe (deterministisch)

- Die Laufzeit führt eine **Stapeltiefe T** (Start 0). T erhöht sich um 1 für die Dauer
  - jeder ausgeführten Anweisung,
  - jedes zusammengesetzten Ausdrucks (alle Ausdrucksknoten außer Literalen, Namen, `dies`, `unten` als Wert und
    Lambda-Erzeugung),
  - jedes Aufrufs eines Rumpfs – gleich welcher Art: Methode, statische Methode, Top-Level-Funktion, Konstruktor
    (je Klasse der Kette mit eigenem Konstruktor), Lambda, Methodenreferenz,
    Kühlschrank-Methode (`mikrowelle`/`frisch` eingeschlossen), `wennDa`-Rückruf, implizites `alsText`, Rückrufe aus
    der Bibliothek (`belege`, `filtere`, `sortiere`, `teig`, `bestelle` …),
  - jedes Aufrufs eines Bibliotheks-Funktionswerts (`teig(…)`, `bestelle(…)`, `zwischenstand(…)`,
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

- **Doppelte Klammern** sind immer normale Klammern: `Bote.sage((x))`, `Bote.sage(((x)))`, `serviere ((MAX));` meinen den
  Ausdruck `x` bzw. `MAX`. Ein Komma in einer Klammer (`((a, b))`) oder eine leere Klammer (`(())`) ist ein Syntaxfehler P0001;
  großgeschriebene Namen werden wie alle Namen aufgelöst (Variable, Klasse, quattrostagioni, Modul – sonst `'X' ist nicht definiert.`).
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
- Präfix `++x;`/`--x;`; `+=` usw. auch für Text und Dauer; `x++` auf Nicht-Zahlen = `x + 1`.
- Generische Parameter `<T>` an Klassen/Methoden werden übersprungen; `Typ[]` ist erlaubt (ungeprüft);
  `für (x : liste)` ohne Typ erlaubt.
- `bestellt "<pfad>";` (§2.2) ist ein **kontextuelles** Schlüsselwort: nur auf oberster Ebene und nur vor einem Textliteral; sonst ein
  normaler Bezeichner. Parser-Knoten `{ k: 'Bestellt', pfad, z, s }` (anders als `paket`/`import`, die verworfen werden).
- `paket`/`import` dürfen überall auf oberster Ebene stehen. Klassen/Rezepturen/quattrostagioni dürfen in Klassen
  verschachtelt sein und werden global registriert.
- `serviere` auf oberster Ebene beendet die Top-Level-Anweisungen; `hauptgang` läuft trotzdem.

### 14.6 Typen und `karton`

- `karton` ist erlaubt für alle Typen außer `salami`, `funghi`, `diavolo` (→ TypAnanas). `margherita`,
  `Dauer`, Klassen, Rezepturen und quattrostagioni dürfen `karton` halten. (Folge für Eingaben:
  `Bestellannahme.liesZahl()` liefert bei EOF `karton` – nicht direkt in `salami`/`funghi` speichern.)
- Typnamen, die keine eingebaute oder eigene Klasse/Rezeptur/quattrostagioni sind (z. B. `Rezept`, `T`, `Blech<…>`,
  `Pizza` ohne eigene Klasse, `Stück<…>`), sowie Typen mit `[]` werden nicht geprüft. quattrostagioni-Typen prüfen die Zugehörigkeit.
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
  Als vorhanden gelten Methoden der Basisklassenkette, aller erfüllten Rezepturen
  (inkl. geerbter Rezepturen und der Rezepturen der Basisklassen), `alsText` immer, bei Ananas-Klassen
  `nachricht`/`holeNachricht`/`typ`.
- **W0003:** `Methode 'm' ist veraltet.` bzw. `Methode 'm' ist veraltet. Grund: <grund>` – einmal pro Methode,
  Position = erster Aufruf.
- **Ladeprüfungen** (Projekte, §2.5) kommen vor allem anderen: P0014 Kreisbestellung · P0015 Datei/Pfad/`pizza.json` ·
  P0016 Name zweimal · P0017 Anweisung bzw. `hauptgang` in einer Nebendatei · P0018 Geheimrezept einer anderen Datei · P0019 nicht
  bestellt · P0020 zu groß (Sammlung §2.1; Teigmenge §18.5, diese erst nach den Startprüfungen). Texte wörtlich in §2.1 … §2.4, §18.5.
  Warnung **W0004** `"<pfad>" ist schon bestellt.` (W00xx = statische Warnungen, W01xx = Laufzeitumgebung).
- Startprüfungen in dieser Reihenfolge: Q0004/P0010/P0011 in Quelltextreihenfolge, dann Vererbungszyklen, dann
  R0001/A0001 in Quelltextreihenfolge. Der erste Fehler bricht ab. „Quelltextreihenfolge“ heißt in Projekten: Dateien in
  Ladereihenfolge, darin nach Position.
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
- Allgemein werden Warnungen einmal pro Code + Datei + Zeile + Spalte ausgegeben (W0003 einmal pro Methode, W0666 genau einmal
  an der ersten Fundstelle).
- **Projekte (§2, K-140):** Der Programm-Scope umfasst die obersten Variablen und Funktionen **aller** Dateien (gemeldet an der späteren
  in Ladereihenfolge); W0666 kommt einmal je Programm (erste Fundstelle in Ladereihenfolge). Warnungen erscheinen nach Dateien in
  Ladereihenfolge, darin nach Position.

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
  Speisekarten (Schlüssel) und einen quattrostagioni-Typ (Werte).

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
  `runden()`/`runden(n)`/`Mathe.runden` runden symmetrisch (−2.5 → −3, 2.675 → 2.68). `währung(symbol, kompakt: nein)` (K-127,
  vormals `euro()`): zwei Nachkommastellen, Komma, ohne Tausendertrennung, dann ` ` + Textform von `symbol`, falls angegeben, nicht `karton`
  und nicht leer (`1234567.89.währung("€")` → `1234567,89 €`, `(-3).währung("€")` → `-3,00 €`, `8.währung()` → `8,00`); `kompakt: ja` sowie ab
  `|x| ≥ 10²¹` und bei ∞/NaN wie `kompakt(2)` (K-103).
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
  `blech / n` mit n < 0 → `StreitAnanas: In n Stücke teilen? Das geht nicht.`.
- Indexfehler: `KeinStückAnanas: Stück i gibt es nicht – das Blech hat n Stück(e).` (Einzahl „Stück“);
  `erstes`/`letztes` auf leerem Blech: `KeinStückAnanas: Das Blech ist leer – kein Stück da.`;
  Text: `Zeichen i gibt es nicht – der Text hat n Zeichen.`
- Speisekarte: zusätzlich `istLeer()`; `lege` liefert die Speisekarte; `entferne(k)` liefert den alten Wert oder
  `karton`. `hole(k, ersatz)` (auch `ersatz:`) liefert `ersatz` **nur**, wenn `hat(k)` `nein` ist – ein gespeicherter `karton` bleibt
  `karton`; `ersatz` kommt unverändert zurück (keine Kopie); positional vor benannt wie in §14.9 (K-095).
- Mathe: `max`/`min` mit beliebig vielen Zahlen (keine → RechenAnanas), zusätzlich `potenz(a, b)`, `runden(x, n)`; **K-111:** `log(x)`
  (natürlicher Logarithmus), `log10(x)`, `log2(x)`, `exp(x)` und die Konstante `E` – Verhalten und Bitmuster wie `Math.log/log10/log2/exp/E`
  in JavaScript (`log(0)` → `-Infinity`, `log(-1)` → `NaN`, `exp(710)` → `Infinity`; Nicht-Zahl → TypAnanas wie `wurzel`); kein `log(x, basis)`.
  **K-137:** `sin(x)`, `cos(x)`, `tan(x)`, `asin(x)`, `acos(x)`, `atan(x)` und `atan2(y, x)` (erst `y`, dann `x`) im Bogenmaß, Ergebnis
  `funghi`. Das Bitmuster ist für jede Eingabe festgelegt durch Sun fdlibm 5.3 (`s_sin.c`, `s_cos.c`, `s_tan.c`, `e_asin.c`, `e_acos.c`,
  `s_atan.c`, `e_atan2.c` mit `e_rem_pio2.c`/`k_rem_pio2.c`, in der Fassung von V8 `src/base/ieee754.cc`) – nicht durch das `Math.*` des
  jeweiligen JS-Motors (die Motoren weichen voneinander ab). NaN/±∞/−0 wie dort und wie JS: `sin(±∞)`/`cos(±∞)`/`tan(±∞)` → `NaN`,
  `asin`/`acos` außerhalb [−1, 1] → `NaN`, `atan(±∞)` → `±π/2`, `sin(−0)` → `−0`, `atan2(±0, −0)` → `±π`, `atan2(±0, +0)` → `±0`, `atan2(y, ±0)` → `±π/2`.
  Umrechnung mit festem Rechenweg (eine Multiplikation, die Konstante ist der korrekt gerundete Quotient):
  `bogen(g)` = `g · (π / 180)`, `grad(b)` = `b · (180 / π)` – also z. B. `grad(bogen(30))` = `29.999999999999996`.
  Nicht-Zahl → TypAnanas wie `wurzel` (`atan2` prüft erst `y`, dann `x`). Schritte: normaler Aufruf.
- Textformen weiterer Werte: Teig `Teig(roh)` / `Teig(<wert>)`; Lieferung `Lieferung #n`; Zustellung
  `Zustellung(<wert>)` / `Zustellung(zu spät)` / `Zustellung(Ananas)`; Reste
  `Reste(<wert>)`; roh-Info `Roh(<teilergebnis>)`; Funktionen `<Funktion>`; Klassen, Module und quattrostagioni-Typen
  ihr Name. Zusätzlich `lieferung.istGeliefert()`, `funktion.rufe(…)`.
- `Uhr.vorspulen` akzeptiert auch Zahlen (ms); negativ → `RechenAnanas: Die Uhr lässt sich nicht zurückdrehen.`
- `Zufall.zahl(a, b)`: Ganzzahlen, a > b werden getauscht; Generator mulberry32 mit Seed 42, pro Lauf neu;
  Ergebnis `a + floor(r × (b − a + 1))`.
- `Spiegel.felder(obj)`: Felder der Basisklassen zuerst, jeweils in Deklarationsreihenfolge; Nicht-Objekt → TypAnanas.

---

## 15. Verbindliche Auslegungen aus dem Klärungsprotokoll (`KLAERUNGEN.md`)

Jede Nummer verweist auf den Eintrag in `KLAERUNGEN.md` (Frage, Begründung, Status, Tests in `pruefstand/faelle/a10-*.js`/`a11-*.js`).
Einträge mit **[offen …]** beschreiben das Sollverhalten; die genannte Komponente wird nachgezogen (der Referenz-Interpreter entspricht allen Einträgen seit Commit 0d34810).

### 15.1 Syntax und Werte
- **K-001** *(abgelöst durch K-105)* Es gibt kein Pizza-Literal mehr; `((X))` ist eine normale Klammer, `f((A, B))` bleibt
  Syntaxfehler P0001, ebenso `f(((A, B)))` (§14.5).
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
  `zeit`, `symbol`, `kompakt`, `haltbar`, `grund`, `ersatz`); unbekannte benannte Argumente werden ignoriert.
- **K-048** Rundung: `runden()` = `sign(x)·round(|x|)`; `runden(n>0)` = `sign(x)·round(|x|·10^n + 1e-9)/10^n`;
  `währung()` (vormals `euro()`, K-127) = `round(|x|·100 + 1e-9)/100` mit Vorzeichen, Komma, zwei Stellen, nie `-0,00`.
- **K-049** `Zufall.zahl`: mulberry32, Seed 42 (§11); erste Werte von `zahl(1, 6)`: 4, 3, 6, 5, 2, 4, 2, 4, 6, 3.
- **K-053** `schrittLimit` ≤ 0/NaN/fehlend → 5 000 000; nicht-ganzzahlig → Abbruch beim Schritt `floor(limit) + 1`.

### 15.2 Typen, Objekte, Standardbibliothek
- **K-016** *(Besitzprüfung abgelöst durch K-105)* Keine BesitzAnanas mehr; `schieb(x)` für Variablen jeden Typs; nicht für
  Felder (LaufzeitAnanas „schieb braucht genau einen Variablennamen“).
- **K-017** *(Pizza-Teil abgelöst durch K-105)* Speisekarten-Schlüssel: Zahl/Text/Wahrheitswert/`karton` nach Wert (`1` = `1.0`),
  quattrostagioni-Werte, sonst (Dauer, Blech, Objekte) nach Identität.
- **K-018** Kühlschrank-Schlüssel = Textform der Argumente (Objekte eigener Klassen nach Identität); geworfene Ananas
  werden nicht gecacht; gecachte Werte kommen per Referenz zurück (§14.10).
- **K-019** *(Trinkgeld abgelöst durch K-127)* `wennDa` ersetzt den früheren Rückruf; `priorität` nimmt jede Zahl (der letzte
  Wert gilt, kein Einfluss auf das Budget); eine Zustellung ist endgültig.
- **K-020** *(Temperatur abgelöst durch K-127)* Ofen: `zeit ≤ 0` → Budget ≤ 0 (erster Schritt überschreitet).
- **K-021** Bereich `[a .. b]`: beliebige Zahlen, Schritt 1 ab `a`, inklusive, absteigend bei `a > b`;
  mehr als 10 000 001 Elemente → `RechenAnanas: Der Bereich ist zu groß für ein Blech.`
- **K-022** `sortiere` ist stabil; Vergleichsfunktion muss eine Zahl liefern (Vorzeichen zählt); ohne Funktion nur
  Zahlen, Texte (UTF-16-Codeeinheiten, K-040), Dauern, Werte eines quattrostagioni – sonst TypAnanas.
- **K-023** *(abgelöst durch K-105)* Es gibt keine eingebauten Preise mehr.
- **K-026** Hawaii: Panik bei jeder Zuweisung (auch `karton`) an `hawaii`-Variable/-Feld/-Parameter, nicht bei
  Deklaration ohne Initialisierer; `Blech<hawaii>` nur W0666; W0666 nur für den Typ `hawaii` (der Belag-Teil – bloßer Name
  `Ananas`, `Ananas` im Pizza-Literal, Panik durch eine Pizza mit Ananas – ist durch K-105 abgelöst; `Ananas` ist der
  Klassenwert der Basis-Ananas); Panik in allen Phasen; `neu Hawaii(…)` auch ohne Klasse.
- **K-029** `Spiegel.felder`: Instanzfelder (keine `tiefkühl`), Basisklassen zuerst; `karton` → LeererKartonAnanas,
  Nicht-Objekt → TypAnanas; Unterklassen einer Calzone sind zugeklappt; `aufklappen()` auf Nicht-Calzone → LaufzeitAnanas.
- **K-033** `hauptgang`: Name entscheidet (erste Klasse, sonst Top-Level-Funktion); Signatur ungeprüft; erster Parameter
  erhält das Args-Blech; mehr als ein Parameter → Aritätsfehler; Rückgabewert ignoriert.
- **K-034** `margherita` darf `karton` halten (§8).
- **K-035** `Teig.istAufgegangen()` → `ja` nur nach `gehenlassen()`.
- **K-036** Rückgabetyp ungeprüft: `serviere;` → `karton`, `serviere (x)` in `leer` liefert `x`, Rumpfende → `karton`.
- **K-037** Basiskonstruktor ohne `unten(…)`: parameterloser Aufruf oder Aritätsfehler (§3).
- **K-038** *(abgelöst durch K-127)* `auto` ist überall ein gewöhnlicher Name; undeklariert → `LaufzeitAnanas: 'auto' ist nicht definiert.`, auch in `schneide(auto)`.
- **K-127** Zweite Bereinigung: kein `ofen(temperatur:)`, `trinkgeld` → `priorität` (nur Reihenfolge), `euro()` → `währung(symbol)`,
  kein `schneide(auto)`/`schneide()`, keine Warnung S0007 (§7.3, §7.4, §7.7, §14.2, §14.11).
- **K-039** *(abgelöst durch K-105)* Keine Pizza-Methoden mehr; `+` mit einem Text bleibt Textverkettung (§5).
- **K-095** `Speisekarte.hole(k[, ersatz])` wie `Vorratskammer.hole` (K-079): `ersatz` (positional oder `ersatz:`) nur bei
  fehlendem Schlüssel (`hat(k)` = `nein`), gespeicherter `karton` bleibt `karton`, `ersatz` ohne Kopie; `hole(k)` unverändert.
- **K-076** `ersetze("", x)` lässt den Text unverändert; alle Text-Methoden arbeiten auf Codepoints, nur `<`/`sortiere`
  nach UTF-16-Codeeinheiten (K-040).
- **K-047** Die simulierte Uhr zählt ganze Millisekunden: `Uhr.vorspulen(d)` rundet kaufmännisch auf ms,
  `schritte`/`zeitMs` sind Ganzzahlen, Budgets `floor(...)` (Ofen `floor(zeit_ms)`, Lieferung `floor(max_ms)`).

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
- **K-097 … K-100 (Nutzerentscheidungen F1–F10) [offen: alle Motoren]** Küchenbrigade `blech.brigade(fn)`, `KüchenAnanas`,
  Schnappschuss-Regeln, Kartonfähigkeit, Determinismus D1–D15, Köche nur als Host-Einstellung – Vertrag in §17.
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

### 15.4 Zufall und Vorratskammer (K-077 … K-081, K-106)

- **Saat (K-077):** `optionen.zufallsSaat` (Ganzzahl, normalisiert `mod 2^32`; fehlt/ungültig → 42). Playground, CLI (`--saat=N`,
  sonst Infozeile `Saat: N`) und EXE nutzen standardmäßig eine echte Saat und zeigen **denselben Text** `Saat: N` an (Konsole bzw. Terminal, keine Ereignis-Ausgabe); Tests/Beispiele bleiben bei 42.
- **Zufall-API (K-078):** mulberry32, `r ∈ [0,1)`; `saat(n)`/`saat()`; `zahl(a, b)` = `a + floor(r·(b−a+1))`; `kommazahl()` = `r`,
  `kommazahl(a, b)` = `a + r·(b−a)`; `wahr(p)` = `r < p`; `wähle(blech)` = Stück `1 + floor(r·n)` (leer → KeinStückAnanas);
  `mische(blech)` = neues Blech, Fisher-Yates von hinten (`i = n−1 … 1`, `j = floor(r·(i+1))`); `neu Zufall(saat)` eigener Strom,
  `neu Zufall()` zieht die Saat `floor(r·2^32)` aus dem globalen Strom; Textform `Zufall(<saat>)`. Jede Methode zieht genau einmal
  (`mische`: n−1). Referenz Saat 7: `zahl(1, 6)` → 1 1 6 5 4 3, `mische([1 .. 5])` → `[4, 2, 3, 5, 1]`.
- **Vorratskammer (K-079):** `neu Vorratskammer(name)` (`[a-z0-9-]{1,40}`), `lege(k, v)`, `hole(k[, ersatz])`, `hat(k)`, `entferne(k)`,
  `schlüssel()`, `länge()`, `leeren()`, `name()`; Werte: Zahlen (endlich), Texte, Wahrheitswerte, `karton`, Bleche/Speisekarten daraus;
  tiefe Kopie bei `lege`/`hole`; 1 MiB je Kammer und 2 MiB für alle Kammern eines Programms (passt in jeden localStorage); Schreiben sofort bei jeder Änderung; Textform `Vorratskammer(<kennung>)`.
- **Namensraum (K-106):** `neu Vorratskammer(name, namensraum)` (zweiter Parameter, auch `namensraum:`; fehlend/`karton` = ohne;
  `[a-z0-9-]{1,40}`, sonst `LaufzeitAnanas: Ungültiger Namensraum 'X' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).`). **Kennung** =
  `name` bzw. `namensraum/name`; sie steht in `optionen.vorrat`, `onVorrat`, dem `vorrat`-Ereignis (`name`), der Serialisierung, im
  HOST-ABI, in den Ananas-Texten und der Textform; gleiche Kennung = gleiche Kammer. `namensraum()` → Text oder `karton`, `name()`
  ohne Raum. Ablage: ohne Namensraum gehört die Kammer dem Tab (K-088), mit Namensraum dem Programm – Browser immer
  `pizza.vorrat.<raum>/<name>` (auch Beispiel-/Doku-Tabs, geteilte Tabs, App-Links jeder Fassung), nativ `<ordner>/<raum>/<name>.json`;
  Host/CLI/Browser validieren die Kennung selbst (kein Pfad-Traversal). „Vorrat löschen“ bietet zusätzlich alle Kammern mit
  Namensraum; `--vorrat-loeschen raum/name`, `--vorrat-loeschen-alle` erfasst auch Raum-Ordner.
- **API/Format (K-080):** `optionen.vorrat` (`{ name: [[k, v], …] }`), `optionen.onVorrat(name, eintraege)` (Doku-Blöcke: Felder `zufallsSaat`,
  `vorrat`, `vorratErwartet`, `echtzeit`, `zone`, K-088/K-154), Ereignis
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
| `Schild` | Text | `(text = "")` | `text()`, `setzeText(t)` |
| `Knopf` | Button | `(text = "", beiKlick?)` (auch `beiKlick: fn`) | `text()`, `setzeText(t)`, `beiKlick(fn)`, `aktiv(diavolo)` / `aktiv()` |
| `Eingabe` | Textfeld | `(wert: "", platzhalter: "")` | `wert()`, `setzeWert(t)`, `beiAenderung(fn)`, `beiEnter(fn)` |
| `Haken` | Checkbox | `(text = "", an: nein)` | `an()`, `setzeAn(diavolo)`, `beiAenderung(fn)` |
| `Stapel` / `Reihe` | Container vertikal / horizontal | `(Blech<Zutat>)` | `hinzu(zutat)` → Container, `leeren()` |
| `Zettel` (v5, §16.8) | beobachtbarer Wert (keine Zutat) | `(wert = karton)`; v7: `Zettel.aus(fn)` – abgeleitet (§16.10) | `wert()`, `setze(w)` → Zettel |

Basisklasse `Zutat` (`neu Zutat()` → RohlingAnanas): `id()`, `sichtbar(diavolo)` / `sichtbar()`, `stil(schlüssel, wert)`,
v5: `binde(eigenschaft, fn)`, `bindeStil(schlüssel, fn)` (§16.8), v6: `marke(t)` / `marke()` (Badge am Reiter-Tab, §16.9).
Jede Zutat nimmt `id: "…"` im Konstruktor. **Setter liefern die Zutat** (verkettbar); `aktiv()`/`sichtbar()` ohne Argument sind Getter.
Die Namen `Theke`, `Zutat`, `Schild`, `Knopf`, `Eingabe`, `Haken`, `Stapel`, `Reihe` (v2: `Takt`, `Fortschritt`, `Abschnitt`, `Tabelle`,
`Reiter`; v4: `Auswahl`, `Tastatur`) sind eingebaute Klassen: `erbt Knopf` →
PizzaFehler P0010 (nicht erweiterbar); eine **eigene** Klasse gleichen Namens hat Vorrang. Die Programm-Schritte zählen wie bei
jedem Aufruf (§14.1); **Warten** in `bediene()` kostet weder Schritte noch Zeit noch Ofen-/Lieferbudget.

### 16.2 Verhalten (verbindlich)

- **Rückrufe (K-056):** `beiKlick(fn)` → `fn()`; `beiAenderung(fn)` → `fn(wert)` (Eingabe: Text, Haken: diavolo);
  `beiEnter(fn)` → `fn(text)`. Lambdas sind tolerant (§14.9). Erneute Registrierung ersetzt den Rückruf, `karton` entfernt ihn.
  Vor dem Rückruf ist der neue Wert gesetzt (`wert()`/`an()` liefern im Rückruf den geänderten Wert).
- **Setter (K-073, K-117):** `setzeText`/`setzeWert`/`setzeAn`/`aktiv`/`sichtbar`/`stil` lösen **keine** Rückrufe aus; ein Setzen auf den
  **gleichen** Wert ändert nichts – keine Nachricht (K-117, §16.8; bis Theke v4 galt das Gegenteil). Der Setter einer **gebundenen**
  Eigenschaft wirft (K-116).
- **Ereignisschleife (K-057):** `bediene()` sendet gepufferte Änderungen, wartet auf ein Ereignis, führt den Rückruf aus,
  sendet dessen Änderungen als **eine** `aendere`-Nachricht (auch wenn der Rückruf eine Ananas wirft – dann vor dem Verlassen)
  und wartet erneut. Ende: Ereignis `geschlossen` (kein Rückruf) oder `schliesse()` (Rückruf läuft zu Ende, danach Rückkehr;
  weitere Ereignisse werden nicht zugestellt). Reihenfolge im Ereignisstrom: `ausgabe`-Ereignisse des Rückrufs vor der `aendere`-Nachricht.
- **Bündelung (K-057):** Änderungen an **gezeigten** Zutaten werden gepuffert und an Synchronisationspunkten gesendet: vor jedem
  Warten in `bediene()`, nach jedem Rückruf, vor `schliesse`, vor dem erneuten `fenster` bei `setzeTitel`, am Programmende
  (wenn die Theke noch offen ist, gefolgt von `schliesse`, K-061). Eine `aendere`-Nachricht hat **einen Eintrag je Zutat** (Reihenfolge = erste Änderung),
  spätere Werte derselben Eigenschaft überschreiben frühere; `stil` wird als **ganzes** Stil-Objekt gesendet, `hinzu`/`leeren`
  als vollständige `kinder`-Liste (`leeren()` → `[]`) – mit dem Zustand der Kinder **beim Senden**, nicht beim `hinzu` (K-115:
  was der Renderer nach einer Nachricht zeigt, entspricht dem Programmzustand am Synchronisationspunkt). Änderungen an nicht gezeigten Zutaten erzeugen keine Nachricht (ihr Zustand
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
- **Werte (K-066):** `setzeText`/`setzeTitel`/`setzeWert`/Konstruktor-Texte speichern die Textform jedes Werts (auch `karton` → `"karton"`);
  `aktiv`/`setzeAn`/`sichtbar`/`an:` verlangen diavolo (`TypAnanas: Erwartet diavolo (ja/nein), bekam 1.`); `breite`/`hoehe`
  ganzzahlig (`TypAnanas: Theke(breite: …) braucht eine Ganzzahl, nicht 2.5.`), Standard 480×360, Werte ≤ 0 überlässt der Renderer seinem Standard.
- **Fehlendes Argument und `karton` (K-102):** **Zustandsfelder** (`text` von Schild/Knopf/Haken, `wert` der Eingabe, `titel` von Theke
  und Abschnitt, Spalten/Zellen, Reiter-Titel, Schwebetext) nehmen die Textform jedes Werts – `karton` → `"karton"`; fehlt das Argument
  im Konstruktor, gilt der Standard der Signatur (`""` bzw. `[]`), fehlt es in einer Methode (`setzeText()`, `setzeTitel()`, `setzeWert()`,
  `schwebe()`), gilt es wie überall als `karton` → `"karton"`. **Optionale Felder** (`platzhalter`, `hinweis`, `text` des Fortschritts –
  wie `stil`/Rückrufe) lassen `karton` weg → `""`, im Konstruktor wie im Setter (`Fortschritt.setzeText(karton)` → `""`,
  `hinweis(karton)` → `""`). Typisierte Parameter (`breite:`, `an:`, `dauer`, `bei`, …): fehlend oder `karton` → Standard.
  Merksatz: „Was immer angezeigt wird, nimmt jeden Wert als Text – auch karton. Was man weglassen kann, lässt karton weg.“
- **Stile (K-068):** `breite`/`hoehe`/`abstand`: Zahl ≥ 0 in Pixeln (Kommazahlen erlaubt, Renderer rundet) –
  `LaufzeitAnanas: Stil 'breite' braucht eine Zahl ≥ 0, nicht -1.` bzw. TypAnanas bei Nicht-Zahl; `ausrichtung` ∈ `links|mitte|rechts`;
  `schrift` ∈ `klein|normal|gross|mono|riesig`; `farbe` ∈ `tomate|basilikum|mozzarella|kruste|normal`; **K-113:** `zeilen` ganze Zahl ≥ 1
  (feste Zeilenzahl mit „…“, wirkt auf den Text von Schild/Knopf/Haken; `TypAnanas: Stil 'zeilen' braucht eine ganze Zahl ≥ 1, nicht 0.`),
  `mindestbreite` Zahl ≥ 0 in Pixeln (`min-width`, jede Zutat); **K-120:** `senkrecht` ∈ `oben|mitte|unten|strecken` (Lage quer zur Reihe,
  §16.9); **K-121:** `zeilen` wirkt auch auf den Abschnitt-Titel und jede Tabellenzelle; **K-126:** `spalten` = Spaltengewichte einer
  Tabelle (nicht leeres Blech aus Zahlen > 0, §16.10). Unbekannter Schlüssel →
  `LaufzeitAnanas: Stil 'x' gibt es nicht. Erlaubt: breite, hoehe, abstand, ausrichtung, schrift, farbe, zeilen, mindestbreite, senkrecht, spalten.`; ungültiger Wert →
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
Knoten `{"id","art",…}` mit `art` ∈ `schild|knopf|eingabe|haken|stapel|reihe` (v2: `takt|fortschritt|abschnitt|tabelle|reiter`, v4: `auswahl|tastatur`). **Zustandsfelder immer:** `schild`/`knopf`: `text`;
`eingabe`: `wert`; `haken`: `text`, `an`; `stapel`/`reihe`: `kinder` (ggf. `[]`). **Nur bei Abweichung vom Standard:**
`platzhalter` (nicht leer), `aktiv: false`, `sichtbar: false`, `stil: {…}` (ganzes Objekt), `hinweis` (nicht leer), `marke` (v6, K-124; nicht leer). Zahlen als JSON-Zahlen, Texte als
Strings, Wahrheitswerte `true`/`false`. In `aendere` gelten dieselben Felder (v3: zusätzlich `uebergang` und die Liste `animationen` neben `aenderungen`, §16.6); `kinder` ist die vollständige Kinderliste – der
Renderer akzeptiert dort auch `{"id":"z1"}` ohne `art` als Verweis auf einen bekannten Knoten (der Interpreter sendet Teilbäume
vollständig); ein vollständiger Knoten (mit `art`) ist dort der ganze Zustand – auch bei wiederverwendetem Element gelten fehlende
Felder als Standard und `stil` ersetzt den ganzen Stil (K-115); der Renderer behandelt `stil` als Teil-Update (`null` setzt zurück).
Renderer → Programm: `{"typ":"klick","id"}`, `{"typ":"aenderung","id","wert"}`, `{"typ":"enter","id","wert"}`, `{"typ":"geschlossen"}`
(v2: `{"typ":"takt","id","anzahl"}`, v4: `{"typ":"taste","id","taste"}`).
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
| `Abschnitt` | `(titel = "", Blech<Zutat>)` | wie Stapel + `titel()`, `setzeTitel`; v4 (K-108): `klappbar(d)`/`klappbar()`, `zu(d)`/`zu()`, `beiAenderung(fn)` → `fn(zu)` | `{"art":"abschnitt","titel","kinder"}` (+ `klappbar:true`, `zu:true`) · Ereignis `{"typ":"aenderung","id","wert":true/false}` |
| `Tabelle` | `(spalten, zeilen)` – Zellen als Textform | `spalten()`, `setzeSpalten`, `zeilen()`, `setzeZeilen` | `{"art":"tabelle","spalten":[…],"zeilen":[[…]]}` |
| `Reiter` | `(titel, seiten)` | `waehle(n)` (1-basiert, sonst KeinStückAnanas), `gewaehlt()`, `beiAenderung(fn)` → `fn(n)`; v4 (K-107): `setzeTitel(n, t)`, `titel(n)`; Seite mit `sichtbar(nein)` → Reiter weg | `{"art":"reiter","titel":[…],"gewaehlt":1,"kinder":[…]}` · Ereignis `{"typ":"aenderung","id","wert":n}` |
| `Auswahl` (v4, K-109) | `(optionen, gewaehlt: 1)` – Optionen als Textform | `optionen()`, `setzeOptionen(b)`, `waehle(n)`, `gewaehlt()`, `beiAenderung(fn)` → `fn(n)`, `aktiv(d)`/`aktiv()` | `{"art":"auswahl","optionen":[…],"gewaehlt":1}` (+ `aktiv:false`) · Ereignis `{"typ":"aenderung","id","wert":n}` |
| `Tastatur` (v4, K-110, unsichtbar) | `(beiTaste?)` | `beiTaste(fn)` → `fn(taste)`, `aktiv(d)`/`aktiv()` | `{"art":"tastatur"}` (+ `aktiv:false`) · Ereignis `{"typ":"taste","id","taste":"Leertaste"}` |
| alle Zutaten | – | `hinweis(text)`, `hinweis()` | Feld `hinweis` (nur nicht leer) |
| Stil | – | `schrift` zusätzlich `"riesig"` | – |

- **Takt (K-084):** läuft nur im gezeigten Baum; `anzahl` (salami ≥ 1) = verstrichene Intervalle (Nachholregel des Renderers:
  `floor((jetzt − letzter)/intervall)`, Brücken summieren aufeinanderfolgende Schläge derselben `id`); Schläge auf unbekannte,
  inaktive oder Nicht-Takt-Zutaten werden ignoriert; `anzahl` fehlt/ungültig → 1; `< 100ms` →
  `LaufzeitAnanas: Ein Takt braucht mindestens 100ms, nicht 50ms.`; Textform `Takt(t1)`; Warten kostet nichts, der Rückruf zählt.
- **Zahlformat (K-085):** `x.tausender(n = 0)` → `1.234.567` / `1.234.567,00`; `x.kompakt(n = 2)` → `1,23 Mio.` (Stufen `Tsd.`, `Mio.`,
  `Mrd.`, `Bio.`, `Brd.`, `Trio.`, `Trd.`, `Quadr.`, `Quadrd.`, `Quint.`, … bis `Dezd.` 10⁶³ – K-103; ohne nachgestellte Nullen;
  `< 1000` → `runden(x, n)` mit Komma; `≥ 10⁶⁶` → `1,5 × 10⁷⁰`; ∞/NaN → `∞`/`-∞`/`NaN`); `währung("€", kompakt: ja)` → `1,23 Mio. €`;
  `tausender`/`währung()` ab `|x| ≥ 10²¹` wie `kompakt(2)`. Die Textform (`text(x)`, `Bote.sage(x)`) bleibt `String(x)` (`2.5e+21`).
- **Laufzeit (K-087):** Schrittlimit P0002 gilt für die Top-Level-Ausführung und **je Theke-Rückruf neu**: die Zählbasis wird beim
  Zustellen eines Ereignisses gesetzt und sonst nie zurückgesetzt (nach `bediene()` gilt die Basis des letzten Rückrufs weiter);
  `schritte`/`Uhr.jetzt()` zählen unverändert; `Uhr.echt()` → Dauer seit 1970 (ganze ms; Test: `optionen.echtzeit` fester Startwert; HOST-ABI `echtzeit_ms`).
  `Uhr.zone()` (K-154) → Dauer = Ortszeit − UTC zum Zeitpunkt von `Uhr.echt()` (ganze Minuten, Sommerzeit berücksichtigt, westlich von UTC
  negativ, z. B. `2h` in Mitteleuropa im Sommer, `-5h` in New York im Winter); Ortszeit = `Uhr.echt() + Uhr.zone()`. Test: `optionen.zone`
  (fester Versatz in ms, gerundet); ist `optionen.echtzeit` gesetzt und `zone` nicht, liefert `zone()` `0ms` (Testläufe deterministisch).
  HOST-ABI `zone_ms` (Gruppe `echtzeit`); Browser: `-getTimezoneOffset()`, nativ: Zeitzone des Systems (Windows/Linux) – gleiche Regel.
- Ereignis-Kompatibilität: `.ereignisse` darf schon heute `takt`-Zeilen enthalten (unbekannte `typ` werden ignoriert, K-064).

### 16.6 Theke v3: Animationen (K-090 … K-094; umgesetzt: Interpreter U-56, Renderer U-58, Compiler U-57)

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
  (K-093, K-102; keine Ananas, keine Warnung); `bei` ist eine Zutat oder `karton` (= Fenstermitte),
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

### 16.7 Theke v4: Reiter-Titel/-Seiten, klappbarer Abschnitt, `Auswahl`, `Tastatur`, Stile `zeilen`/`mindestbreite` (K-107 … K-113; umgesetzt: Interpreter 6cfa564, Wasm 793acac, Renderer 07fd5b3)

Kein neues `op`, Protokoll v1 (neue `art` `auswahl`/`tastatur`, neue Felder `klappbar`/`zu`, neues Ereignis `taste`, neue Stil-Schlüssel);
alte Renderer zeigen Platzhalter bzw. ignorieren. Alle Namen in Interpreter und Wasm-Laufzeit gleich (bitgleiche `ui`-Nachrichten).

- **Reiter (K-107):** `setzeTitel(n, text)` → Reiter, `titel(n)` → Text; `n` ganze Zahl `1 … Seitenzahl`, sonst
  `KeinStückAnanas: Seite 7 gibt es nicht – der Reiter hat 2 Seiten.` (wie `waehle`); `text` Zustandsfeld (K-102, `karton` → `"karton"`);
  kürzere Titelliste wird mit `""` aufgefüllt, `titel(n)` eines fehlenden Titels → `""`; Nachricht `titel` als ganze Liste. **Seiten
  ausblenden** über `seite.sichtbar(nein)`: Renderer versteckt Reiter und Seite (Tastaturnavigation überspringt); zeigt `gewaehlt` auf eine
  unsichtbare Seite, zeigt der Renderer die nächste sichtbare danach (sonst die letzte davor) und sendet nichts; `gewaehlt()` bleibt;
  `waehle(n)` auf eine unsichtbare Seite ist erlaubt.
- **Abschnitt (K-108):** `klappbar(d)`/`klappbar()` (Gast darf klappen), `zu(d)`/`zu()` (Inhalt eingeklappt), `beiAenderung(fn)` → `fn(zu)`;
  diavolo-Prüfung wie `sichtbar` (`TypAnanas: Erwartet diavolo (ja/nein), bekam 1.`). Knoten: `klappbar:true`/`zu:true` nur bei Abweichung,
  in `aendere` der neue Wert. Ereignis `{"typ":"aenderung","id","wert":true}` (`wert` = neuer `zu`-Zustand, `true`/`false`/`"true"`/`"false"`)
  wird nur für einen klappbaren Abschnitt im gezeigten Baum angenommen; Zustand vor dem Rückruf aktualisiert, auch ohne Rückruf.
  Renderer: Kopf als Knopf (`aria-expanded`, Pfeil ▸/▾), lokal sofort, Ereignis nur bei echtem Wechsel; `zu` versteckt den Inhalt (`hidden`
  – Kinder gelten für Animationen als nicht gezeigt); mit `uebergang(ja)` weich.
- **Auswahl (K-109):** `neu Auswahl(optionen, gewaehlt: 1)` (benannt `optionen:`/`gewaehlt:`/`id:`). `optionen` Blech → Textformen
  (`karton` → `"karton"`; fehlend/`karton` → `[]`; kein Blech → `TypAnanas: Auswahl braucht ein Blech mit Optionen, nicht 5.`);
  `gewaehlt` fehlend/`karton` → `1`, sonst ganze Zahl `1 … Anzahl` → `KeinStückAnanas: Option 7 gibt es nicht – die Auswahl hat 4 Optionen.`
  („1 Option“). Methoden `optionen()` (Kopie), `setzeOptionen(b)` (gewaehlt bleibt), `waehle(n)`, `gewaehlt()`, `beiAenderung(fn)` → `fn(n)`,
  `aktiv(d)`/`aktiv()`. Knoten `{"art":"auswahl","optionen":[…],"gewaehlt":1}` (+ `aktiv:false`); Ereignis `{"typ":"aenderung","id","wert":n}`
  angenommen für eine aktive Auswahl im gezeigten Baum mit ganzem `wert` in `1 … Anzahl`; Zustand vor dem Rückruf. Textform `Auswahl(z3)`.
  Renderer: Segment-Leiste (`role="radiogroup"`/`radio`), Pfeile mit Umlauf, Home/End, Ereignis nur bei echtem Wechsel, Klemmen wie Reiter.
- **Tastatur (K-110):** unsichtbare Zutat `neu Tastatur(beiTaste?)` (benannt `beiTaste:`), `beiTaste(fn)` → `fn(taste)`, `aktiv(d)`/`aktiv()`;
  läuft nur im gezeigten Baum (K-057). Knoten `{"art":"tastatur"}` (+ `aktiv:false`); Ereignis `{"typ":"taste","id","taste":"Leertaste"}` –
  angenommen für eine aktive Tastatur mit Rückruf und nicht-leerem Text; mehrere aktive Tastaturen bekommen jede Taste (Baumreihenfolge);
  Zustellung 0 Schritte. Tastennamen (Renderer): `e.key`, Sondertasten deutsch – `Leertaste`, `Links`/`Rechts`/`Hoch`/`Runter`, `Rücktaste`,
  `Entfernen`, `Pos1`, `Ende`, `BildHoch`/`BildRunter`; unverändert `Enter`, `Escape`, `Tab`, `F1`…`F12`, Zeichen wie getippt. Nicht gesendet:
  reine Modifikatoren, `Dead`/`Unidentified`, Komposition, Wiederholungen (`e.repeat`), Tasten in einer fokussierten `Eingabe` und (K-114)
  Tasten, die ein fokussiertes Bedienelement selbst verarbeitet (Leertaste/Enter auf Knopf/Haken/Klapp-Knopf/Reiter-Tab/Auswahl-Option,
  Pfeile links/rechts und Pos1/Ende auf Reiter/Auswahl) – eine Taste, ein Empfänger. Ein Zeigerklick (`detail > 0`) auf ein Bedienelement gibt
  den Fokus an die Theke-Wurzel zurück (Tab-Fokus bleibt). Fokus: Theke-Wurzel
  `tabindex="-1"`, Listener dort (Editor-Tasten erreichen die Theke nie), Fokus beim `baum`, wenn nichts fokussiert ist; Standardwirkung von
  Leertaste/Pfeilen/Pos1/Ende/Bild wird nur unterdrückt, wenn kein Element im Fenster fokussiert ist. Textform `Tastatur(z1)`.
- **Stile (K-113):** `zeilen` (ganze Zahl ≥ 1), `mindestbreite` (Zahl ≥ 0, px) – §16.2; Erlaubt-Liste endet auf `…, farbe, zeilen, mindestbreite`.
- **Mathe (K-111):** §11/§14.11. **Meldung/Toast (K-112):** abgelehnt – Anwendungslogik (Schild + Blech + Takt).

### 16.8 Theke v5: reaktives Modell – `Zettel`, `binde`, nur echte Änderungen (K-116 … K-118)

Nutzerwunsch: ereignisgetriebene Oberfläche statt „neu zeichnen bei jedem Takt“. Zustandsänderungen passieren nur in Rückrufen; was der
Gast sieht, **folgt** dem Zustand über Bindungen; der `Takt` bleibt der Simulation vorbehalten. Protokoll bleibt v1, der Renderer ist
unverändert – Bindungen werden in der Laufzeit aufgelöst, Interpreter und Wasm-Laufzeit erzeugen bitgleiche `ui`-Nachrichten.

```pizza
Zettel geld = neu Zettel(0);
Schild kasse = neu Schild();
kasse.binde("text", () -> geld.wert().währung("€"));                 // folgt dem Zettel
Knopf backen = neu Knopf("Backen", () -> { geld.setze(geld.wert() + 8); });
backen.binde("aktiv", () -> geld.wert() < 100);
Eingabe anzahl = neu Eingabe(wert: "1");
Schild preis = neu Schild();
preis.binde("text", () -> anzahl.wert().alsZahl() * 8);        // folgt dem Tippen – ohne beiAenderung
```

- **`Zettel` (K-116):** beobachtbarer Wert, keine Zutat. `neu Zettel(wert = karton)`; `wert()` liest; `setze(w)` → Zettel schreibt und meldet
  die Änderung an alle Bindungen, die den Zettel gelesen haben – **nur wenn** der neue Wert ungleich dem alten ist (Gleichheit wie `==`,
  K-017: Zahl/Text/diavolo/karton nach Wert, `Dauer` nach ms, Blech/Speisekarte/Objekte nach Identität – ein verändertes Blech also neu
  setzen, z. B. `liste.setze(liste.wert().kopie())`). Typname `Zettel` (eingebaut wie `Zutat`: eigene Klasse hat Vorrang, `erbt Zettel` →
  P0010), Textform `Zettel(<Textform des Werts>)`. Ohne Theke eine gewöhnliche Schachtel. Küchenbrigade: nur Hauptküche
  (`KüchenAnanas: Zettel gibt es nur in der Hauptküche.`), nicht kartonfähig („Ein Zettel“).
- **Bindung (K-116):** `zutat.binde(eigenschaft, fn)` → Zutat und `zutat.bindeStil(schlüssel, fn)` → Zutat binden eine Eigenschaft bzw. einen
  Stil an einen Ausdruck `fn` (Funktion ohne Parameter; Lambdas tolerant, §14.9). `binde(eigenschaft, karton)` / `bindeStil(schlüssel, karton)`
  löst die Bindung (kein Fehler, wenn keine besteht); erneutes `binde` derselben Eigenschaft ersetzt die alte Bindung (neue Registrierung).
  Eigenschaftsname/Schlüssel als Textform. **Bindbar** (Reihenfolge = Fehlertext): Schild `text`; Knopf `text, aktiv`; Eingabe `wert`; Haken
  `text, an`; Takt `aktiv, intervall`; Fortschritt `wert, text`; Abschnitt `titel, klappbar, zu`; Tabelle `spalten, zeilen`; Reiter `gewaehlt`;
  Auswahl `optionen, gewaehlt, aktiv`; Tastatur `aktiv`; jede Zutat zusätzlich `sichtbar, hinweis, marke` (v6, K-124); Stile nur über `bindeStil`
  (alle Schlüssel von K-068/K-113/K-120). Sonst `LaufzeitAnanas: 'farbe' lässt sich an Schild(z1) nicht binden. Bindbar: text, sichtbar, hinweis, marke.`; keine Funktion →
  `TypAnanas: binde() braucht eine Funktion, z. B. () -> { … }.` (bzw. `bindeStil()`); unbekannter Stil → `Stil 'x' gibt es nicht. Erlaubt: …`.
  `kinder` sind nicht bindbar (Listen bleiben `hinzu`/`leeren`).
- **Quellen (K-116):** Während `fn` läuft, erfasst die Laufzeit jeden gelesenen Zettel (`wert()`) und jeden gelesenen **Zutat-Getter** –
  `text()`, `wert()`, `an()`, `aktiv()`, `sichtbar()`, `hinweis()`, `marke()`, `uebergang()`, `intervall()`, `titel()`/`titel(n)`, `klappbar()`, `zu()`,
  `gewaehlt()`, `optionen()`, `spalten()`, `zeilen()` – als Quelle `(Objekt, Feld)`; die Quellen werden bei jeder Auswertung neu erfasst
  (bedingte Lesezugriffe). Ändert sich eine Quelle (Zettel-`setze` mit anderem Wert, Zutat-Setter, Renderer-Ereignis `aenderung`/`enter`, das
  `wert`/`an`/`gewaehlt`/`zu` setzt, oder eine andere Bindung), wird jede lesende Bindung **schmutzig**. Lesen außerhalb einer Bindung erfasst nichts.
- **Auswertung (K-116):** einmal **sofort beim `binde`** (danach liefert der Getter den gebundenen Wert) und sonst nur an den
  Synchronisationspunkten von K-057 – vor jedem Warten in `bediene()`, nach jedem Rückruf (auch bei Ananas), vor `schliesse`, vor dem erneuten
  `fenster` bei `setzeTitel`, vor dem `baum` bei `zeige`, am Programmende – jeweils **vor** dem Bau der Nachricht (Nachricht = Zustand am
  Synchronisationspunkt, K-115). Algorithmus: höchstens **100 Durchläufe**; je Durchlauf alle Bindungen in Registrierungsreihenfolge, jede
  schmutzige wird vor der Auswertung sauber markiert und ausgewertet; das Ergebnis wird **wie der gleichnamige Setter** geprüft und umgewandelt
  (Textform mit `karton` → `"karton"` für Zustandsfelder, `karton` → `""` für `hinweis` und Fortschritt-`text`; diavolo-Pflicht
  `TypAnanas: Erwartet diavolo (ja/nein), bekam 1.`; Fortschritt-Klemmen; `taktIntervall`; Listen wie `setzeSpalten`/`setzeZeilen`/
  `setzeOptionen`; `gewaehlt` mit Bereichsprüfung wie `waehle`; Stil-Whitelist, `karton` entfernt den Stil) und **nur bei echter Änderung**
  gesetzt (K-117) – was wiederum lesende Bindungen schmutzig macht. Bindungen werden an allen Zutaten ausgewertet, auch an nicht gezeigten
  (Nachrichten entstehen nur für gezeigte, K-057). Nach 100 Durchläufen noch schmutzig →
  `LaufzeitAnanas: Die Bindungen kommen nicht zur Ruhe – 'text' von Schild(z1) hängt von sich selbst ab.` (erste schmutzige Bindung in
  Registrierungsreihenfolge; Stil-Bindung: `Stil 'farbe' von Schild(z1)`). Eine werfende Bindung bleibt sauber, bis sich eine Quelle ändert;
  die Ananas verlässt `binde()` bzw. `bediene()` wie die eines Rückrufs (fangbar), die Theke bleibt offen.
- **Ein Schreiber (K-116):** Der Setter einer gebundenen Eigenschaft (`setzeText`, `aktiv(d)`, `waehle`, `setzeOptionen`, `stil(k, …)` bei
  gebundenem Stil, …) → `LaufzeitAnanas: 'text' von Schild(z1) ist gebunden – setze den Zettel, nicht die Zutat.` (Stil:
  `Stil 'farbe' von Schild(z1) ist gebunden – …`). Renderer-Ereignisse dürfen gebundene Eigenschaften setzen (der Gast tippt in eine
  gebundene `Eingabe`): der Zustand folgt dem Gast, bis sich eine Quelle der Bindung ändert.
- **Eine Bindung rechnet nur (K-118):** In `fn` sind alle Methoden verboten, die Zustand ändern oder senden – Zutat-Setter (`setzeText`,
  `setzeWert`, `setzeAn`, `aktiv(d)`, `sichtbar(d)`, `hinweis(t)`, `marke(t)`, `uebergang(d)`, `stil(k, w)`, `setzeIntervall`, `setzeTitel`, `klappbar(d)`,
  `zu(d)`, `waehle`, `setzeOptionen`, `setzeSpalten`, `setzeZeilen`), `hinzu`, `leeren`, `binde`, `bindeStil`, `animiere`, `Theke.schwebe`/
  `zeige`/`bediene`/`schliesse`/`setzeTitel`, `Zettel.setze` → `LaufzeitAnanas: Eine Bindung rechnet nur – 'setzeText' ist darin nicht erlaubt.`
  (Methodenname wie gerufen; überladene Getter ohne Argument sind erlaubt). Getter, Konstruktoren, `Bote`, eigene Methoden sind erlaubt.
- **W0103 (K-118, je Aufrufstelle):** Liest eine Bindung bei der ersten Auswertung weder Zettel noch Zutat-Getter, wird sie nie neu berechnet:
  `W0103: Die Bindung 'text' von Schild(z1) liest weder Zettel noch Zutat – sie rechnet nur einmal.` (Stil: `Die Bindung Stil 'farbe' von …`).
  Ausweg für objektlastige Zustände: ein Zettel `stand` als Taktgeber (`stand.setze(stand.wert() + 1)` im Rückruf, `stand.wert();` im Ausdruck).
- **Nur echte Änderungen (K-117, gilt für Setter und Bindungen):** Setzen auf den gleichen Wert ändert nichts – keine Nachricht, keine
  schmutzige Bindung. Gleichheit je Feld: Texte zeichengleich (`text`, Eingabe-`wert`, `titel`, `hinweis`); diavolo (`aktiv`, `sichtbar`, `an`,
  `klappbar`, `zu`, `uebergang`); Zahlen nach Wert (`wert` des Fortschritts nach dem Klemmen, `intervall` nach Rundung, `gewaehlt`); Listen
  elementweise zeichengleich (`spalten`, `optionen`, Reiter-`titel`), `zeilen` zeilen- und elementweise; `stil` als ganzes Objekt
  (`stil(k, karton)` für einen nicht gesetzten Schlüssel ändert nichts und sendet kein `null`); `hinzu` ändert immer, `leeren()` eines leeren
  Behälters nicht. Ein Renderer-Ereignis mit unverändertem Wert ändert nichts (der Rückruf läuft trotzdem). Eintragsposition in `aendere` =
  erste echte Änderung; „a → b → a“ in einem Rückruf sendet `a` (Vergleich gegen den aktuellen Zustand).
- **Schritte (K-069/K-087):** `neu Zettel`, `wert()`, `setze()`, `binde()` kosten normale Aufrufknoten; die Auswertung einer Bindung zählt die
  Schritte ihres Ausdrucks – beim `binde` sofort, sonst am Synchronisationspunkt innerhalb des laufenden Rückruf-Budgets (K-087). Warten 0.
- **Präzisierungen (K-119):** `bei*`-Registrierungen, `id()`, `alsText()`, `Theke.titel()` sind in Bindungen erlaubt. `binde` wertet nur die
  neue Bindung sofort aus (abhängige folgen am nächsten Synchronisationspunkt). Prüfreihenfolge: Argument-Umwandlung vor der Gebunden-Prüfung;
  `stil(k, w)`: Schlüssel → Wert → Gebunden; `binde(e, fn)`: Eigenschaftsname vor Funktionsprüfung (auch bei `karton`). Eine beim `binde`
  werfende Bindung bleibt registriert (sauber, ohne Quellen); W0103 kommt nach dem Ausdruck, vor der Setter-Prüfung des Ergebnisses. Wirft eine
  Bindung im Flush, gehen die gepufferten Einträge und Animationen **vor** dem Weiterwerfen hinaus (wie bei einer Rückruf-Ananas, auch am
  Programmende vor `schliesse`). Nach der Zyklus-Ananas gelten alle Bindungen als sauber (rechnen erst bei der nächsten Quellenänderung wieder);
  innerhalb eines Durchlaufs werden später stehende, inzwischen schmutzige Bindungen noch im selben Durchlauf ausgewertet. `setze()` ohne
  Argument → `karton`; `Theke.setzeTitel` mit gleichem Titel sendet `fenster` erneut (K-117 gilt für Zutaten-Eigenschaften).
- **Umstellung eines `zeichne()`-Programms:** (1) jede angezeigte Größe auf einen `Zettel` legen (oder sie aus Zutat-Gettern ableiten);
  (2) jeden `setzeText`/`aktiv`/`stil`-Aufruf in `zeichne()` durch eine Bindung beim Aufbau ersetzen; (3) Rückrufe ändern nur Zettel/Zustand und
  rufen kein `zeichne()` mehr; (4) „gezeigt“-Merkvariablen und Hand-Vergleiche streichen (K-117); (5) der `Takt` ruft nur die Simulation.

### 16.9 Theke v6: ruhiges Raster – `senkrecht`, `marke`, `zeilen` an Abschnitt/Tabelle, feste Innenbreite (K-120 … K-124)

Wünsche aus dem Idle-Redesign („Knöpfe dürfen nie wandern“, THEKE-ERWEITERUNGEN §12). Protokoll v1 (neuer Stil-Schlüssel, neues
optionales Feld `marke`); Interpreter und Wasm-Laufzeit senden bitgleiche `ui`-Nachrichten.

```pizza
Zettel sterne = neu Zettel(0);
Stapel links = neu Stapel([…]).stil("breite", 404);
Stapel rechts = neu Stapel([…]).stil("breite", 404);
Reihe spalten = neu Reihe([links, rechts]).stil("senkrecht", "oben").stil("abstand", 12);   // 2 · 404 + 12 = 860 − 40
Stapel imperium = neu Stapel([…]);
imperium.binde("marke", () -> (sterne.wert() > 0 ? "⭐ " + sterne.wert() : ""));          // Badge am Tab, verschiebt nichts
Reiter reiter = neu Reiter(["🍕 Backstube", "⭐ Imperium"], [neu Stapel([spalten]), imperium]);
```

- **`senkrecht` (K-120):** Stil `oben|mitte|unten|strecken` – an einer `Reihe` die Lage aller Kinder quer zur Reihe (ohne Stil `mitte`),
  an einer Zutat direkt in einer Reihe ihre eigene Lage (schlägt `ausrichtung`), sonst ohne Wirkung; `strecken` = gleich hohe Kinder.
  `ausrichtung` bleibt `links|mitte|rechts` (Hauptachse der Reihe). Fehlertexte und Bindung wie jeder Vokabular-Stil (§16.2, §16.8).
- **`zeilen` (K-121):** auch Abschnitt-Titel (auch klappbar) und **jede Tabellenzelle** inkl. Kopfzeile genau n Zeilen, Rest „…“; die
  Tabelle hat dann feste, gleich breite Spalten. Nur Renderer.
- **Feste Innenbreite (K-122):** der Inhalt ist **immer `breite − 40` px** breit, mit und ohne Rollbalken (Rinne von 8 px immer
  reserviert; Chromium/Edge, WebView2, WebKitGTK); waagrecht wird abgeschnitten statt gerollt. Nur Renderer.
- **Vorschaugröße (K-123):** die Playground-Vorschau übernimmt `breite`/`hoehe` bei **jedem** Lauf, außer der Nutzer hat das Fenster in
  diesem Lauf schon verschoben oder gezogen. Nur UI.
- **`marke` (K-124):** `zutat.marke(t)` → Zutat, `marke()` → Text, an jeder Zutat; optionales Feld wie `hinweis` (`karton` → `""`, sonst
  Textform; leer = keine Marke). Der `Reiter` zeigt die Marke einer **Seite** als Badge über der rechten oberen Ecke ihres Tabs – im Rand,
  den die Leiste immer hat; Tabs verschieben sich nie. Bindbar (`binde("marke", …)`), Getter ist Quelle, Setter einer gebundenen Marke wirft,
  `marke(t)` in einer Bindung ist verboten (K-118). Knoten-Feld `marke` nur wenn nicht leer; außerhalb eines Reiters gesendet, nicht gezeigt.

### 16.10 Theke v7: abgeleitete Zettel und Spaltengewichte (K-125, K-126)

Zwei Wünsche aus dem Idle-Redesign: eine Rechnung, die mehrere Bindungen teilen, ohne Memo von Hand; Tabellen mit ungleich breiten,
festen Spalten. Protokoll v1 (neuer Stil-Schlüssel mit Listenwert); Interpreter und Wasm-Laufzeit senden bitgleiche `ui`-Nachrichten.

```pizza
Zettel geld = neu Zettel(0);
Zettel stufe = neu Zettel(1);
Zettel preis = Zettel.aus(() -> 10 * stufe.wert() * stufe.wert());   // rechnet nur, wenn sich stufe ändert
kaufen.binde("text", () -> ("Ausbauen für " + preis.wert().währung("€")));
kaufen.binde("aktiv", () -> geld.wert() >= preis.wert());
balken.binde("wert", () -> geld.wert() / preis.wert());             // drei Leser, eine Rechnung
Tabelle erfolge = neu Tabelle(["", "Erfolg", "Ziel"], []).stil("spalten", [1, 6, 3]);   // 10 % · 60 % · 30 %, fest
```

- **Abgeleiteter Zettel (K-125):** `Zettel.aus(fn)` → Zettel; `fn` ist eine Funktion ohne Parameter (Lambdas tolerant, §14.9; sonst
  `TypAnanas: Zettel.aus() braucht eine Funktion, z. B. () -> { … }.`, auch bei `karton`/fehlend). Der Zettel ist eine **Bindung ohne Zutat**:
  Ziel ist sein Wert. Er wird **sofort** ausgewertet (wie `binde`) und danach nur an den Synchronisationspunkten von §16.8, wenn eine
  gelesene Quelle sich geändert hat – im selben Algorithmus (Registrierungsreihenfolge = Erzeugungsreihenfolge zwischen den Bindungen,
  ≤ 100 Durchläufe, schmutzig vor der Auswertung sauber). Quellen wie bei Bindungen (Zettel inkl. anderer abgeleiteter, Zutat-Getter),
  bei jeder Auswertung neu erfasst. Ergebnis wie `Zettel.setze`: nur ein **ungleicher** Wert (`==`, K-017) ändert ihn und macht seine
  Leser schmutzig – ein neues Blech/Objekt je Rechnung zählt also immer als Änderung (Identität). Leser: beliebig viele Bindungen und
  abgeleitete Zettel; die Rechnung läuft einmal je Änderung. `wert()` ist Quelle wie bei jedem Zettel und liefert **zwischen** zwei
  Synchronisationspunkten den zuletzt berechneten Wert (wie ein gebundener Getter, K-119) – im Rückruf nach `stufe.setze(…)` also noch
  den alten. Ohne `zeige`/`bediene` gibt es keine Synchronisationspunkte: dann rechnet er nur beim Erzeugen (und am Programmende).
- **Regeln wie eine Bindung (K-125):** `fn` rechnet nur (K-118 – Setter, `Zettel.setze`, `binde` … werfen); `Zettel.aus` selbst ist in
  einer Bindung und in einem abgeleiteten Zettel verboten (`Eine Bindung rechnet nur – 'aus' ist darin nicht erlaubt.`). Ein Schreiber:
  `setze` auf einen abgeleiteten Zettel → `LaufzeitAnanas: Der Zettel ist abgeleitet – setze seine Quellen, nicht ihn.` W0103 (je
  Aufrufstelle), wenn die erste Auswertung keine Quelle liest: `W0103: Der abgeleitete Zettel liest weder Zettel noch Zutat – er rechnet
  nur einmal.` Werfender Ausdruck: beim Erzeugen fangbar aus `Zettel.aus` (kein Zettel; die Registrierung bleibt ohne Quellen), am
  Synchronisationspunkt aus `bediene()` usw. wie eine Bindung (K-119), der Wert bleibt. Zyklus nach 100 Durchläufen:
  `LaufzeitAnanas: Die Bindungen kommen nicht zur Ruhe – ein abgeleiteter Zettel hängt von sich selbst ab.` (erste schmutzige Bindung
  in Registrierungsreihenfolge; danach alle sauber, K-119). Schritte wie eine Bindung. Ein abgeleiteter Zettel lässt sich nicht lösen –
  er lebt bis zum Programmende (nicht in Schleifen je Takt erzeugen).
- **Name, Typ, Küche (K-125):** `Zettel` ist zusätzlich ein eingebautes Modul mit der Methode `aus` (`Zettel.x()` →
  `Methode 'x' gibt es bei Zettel nicht.`); eine **eigene** Klasse `Zettel` hat Vorrang (dann gilt ihr `Zettel.aus`, K-116). Typ `Zettel`,
  Textform `Zettel(<Wert>)` wie jeder Zettel. Nur Hauptküche: `Zettel.aus` und alle Methoden in einer Küche →
  `KüchenAnanas: Zettel gibt es nur in der Hauptküche.`; nicht kartonfähig („Ein Zettel“).
- **Spaltengewichte (K-126):** Stil `spalten` = **nicht leeres Blech aus endlichen Zahlen > 0**, sonst
  `TypAnanas: Stil 'spalten' braucht ein Blech aus Zahlen > 0, nicht [1, 0].`; gespeichert wird eine Kopie (spätere Änderungen am Blech
  wirken nicht). Gleichheit (K-117) elementweise; `karton` entfernt (K-075); bindbar per `bindeStil("spalten", …)`. Protokoll: Liste
  von Zahlen im `stil`-Objekt (`"stil":{"spalten":[1,6,3]}`). **Renderer:** nur an `Tabelle`; feste Spalten (`table-layout: fixed`) mit
  Breite = Gewicht / Summe der ersten n Gewichte (n = Spaltenzahl; fehlende Gewichte zählen 1, überzählige entfallen); langer Text bricht
  in der Zelle um (mit `zeilen`: abgeschnitten) und verschiebt keine Spalte. Andere Zutaten ignorieren den Stil. `stil("spalten", …)`
  sind Breiten, `tabelle.spalten()` die Überschriften (wie bei `zeilen`, K-121). Gilt Spaltengewichte und `zeilen` zugleich, bestimmen die
  Gewichte die Breiten (ohne `spalten` teilen sich die Spalten mit `zeilen` die Breite gleichmäßig, K-121).
---

## 17. Küchenbrigade – echte Parallelität (Tier 1; K-097 … K-100)

Übernommen aus `THREADS.md` §2–§3 (Entwurf → Vertrag; Produktfragen F1–F10 wie empfohlen entschieden, K-097). THREADS.md bleibt
Planungsdokument für Umsetzung, Motoren und Phasen (§4–§6); bei Widersprüchen gilt dieser Abschnitt. Prüfstand:
`pruefstand/faelle/a14-kueche.js` (Interpreter-Referenz abgenommen: 72cb857 ff., Vertragslücken K-101).

> **Grundsatz:** Die **sequentielle Referenz definiert die Semantik**; echte Threads sind eine unbeobachtbare Optimierung.
> Kein Ereignis, kein Text, kein Exit-Code, keine `schritte`, keine `zeitMs` hängen von der Anzahl der Köche, von ihrer Planung
> oder von der Wanduhr ab – in Interpreter, Wasm-in-JS, nativem Host und EXE, im Browser wie nativ (K-082). Tier 1: der
> Interpreter führt §17 exakt aus (sequentiell, ohne Threads); Wasm-Motor und Hosts dürfen echt parallel rechnen.

Begriffe (verbindlich): **Hauptküche** = das laufende Programm (Top-Level, `hauptgang`, Rückrufe, `wennDa`-Phase) ·
**Brigade** = ein Aufruf `blech.brigade(fn)` · **Stück** = ein Element des Blechs + der Aufruf `fn(element)`; Stücke sind von
1 bis n nummeriert (**Stückreihenfolge**) · **Küche** = der isolierte Ausführungskontext eines Stücks (eigene Uhr, eigener Zufall,
eigene Objekte) · **Koch** = ein Thread/Worker des Hosts (Anzahl = Host-Einstellung `koeche`, **nie** beobachtbar) ·
**Anschnitt** = der Moment, in dem die Brigade die Stücke startet · **Schnappschuss** = der Zustand der Hauptküche beim Anschnitt ·
**Zusammenführen** = Ergebnisse, Ereignisse, Zähler und Abbrüche der Stücke werden in Stückreihenfolge übernommen.

### 17.1 Das Konstrukt `blech.brigade(fn)`

```pizza
Blech<salami> bons = [1 .. 4_000_000];
Blech<salami> teilsummen = bons.schneide(8).brigade(stapel -> stapel.summe());   // 8 Stücke, parallel
salami gesamt = teilsummen.zusammenklappen((a, b) -> a + b);                      // sequentiell, wie bisher
```

- Neue **Blech-Methode**. Ergebnis: ein **neues** Blech `[fn(b₁), …, fn(bₙ)]` in Stückreihenfolge – wie `belege`, aber jedes
  Stück läuft in einer eigenen Küche (§17.2–§17.5); Zeit und Zähler werden nach §17.6 zusammengeführt.
- `fn` wird wie bei `belege` mit genau einem Argument aufgerufen (Lambdas tolerant, §14.9); ist `fn` keine Funktion, entsteht
  derselbe Fehler wie bei `belege` (`TypAnanas: 3 ist keine Funktion – das kann man nicht aufrufen.`).
- Leeres Blech → `[]` **ohne Anschnitt** (keine Zufallsziehung, keine Kosten außer den Aufrufknoten).
- Typischer Partner ist `schneide(n)`: die Anzahl der Stücke ist Programmentscheidung und beobachtbar, die Anzahl der Köche nie.
  Die Stückzahl hängt nie von der Hardware ab.
- `brigade` ist **kein Keyword** (keine neuen reservierten Wörter, bestehende Bezeichner bleiben gültig); `BUILTINS` ändert sich
  nicht. Bestehende Konstrukte (`belege`, `zusammenklappen`, `teig`, `bestelle`) bleiben exakt wie in §7/§14.
- **Schritte:** der Aufruf kostet seine normalen Knoten (§14.1), jeder Rückruf zählt seine Anweisungen/Ausdrücke; Anschnitt,
  Einfrieren, Kartonprüfung und Zusammenführen sind Bibliotheksarbeit (0 Schritte).
- **Stapeltiefe:** jedes Stück beginnt mit der Tiefe des Aufrufs + 1 (wie ein `belege`-Rückruf, §14.4), Grenze 1500.
- **Verschachtelte Brigaden** (eine Brigade in einem Stück) sind erlaubt und folgen denselben Regeln mit der Küche als
  „Hauptküche“ der inneren Brigade (deren Variablen und Objekte sind für die innere Brigade nur lesbar). Hosts dürfen innere
  Brigaden sequentiell ausführen (identisches Ergebnis).
- Eine Brigade ist überall erlaubt, wo `belege` erlaubt ist – auch in Theke-Rückrufen (die Stücke erben die Limitbasis, D7).

### 17.2 Was ein Stück darf

| Bereich | Regel in der Küche |
|---|---|
| Argument `bᵢ`, Variablen der Hauptküche (global, Top-Level, gefangen), statische Felder, Felder vorhandener Objekte, Elemente vorhandener Bleche/Speisekarten | **lesen** erlaubt – Wert = Schnappschuss beim Anschnitt (§17.3) |
| eigene Variablen (Parameter und lokale Variablen des Rückrufs und aller von ihm aufgerufenen Rümpfe), eigene Objekte | lesen und schreiben wie immer |
| Methoden/Funktionen aufrufen, `neu Klasse(…)`, Pizzen bauen, Rekursion, `probier`, `ofen`, eigene `teig`/`bestelle` | erlaubt |
| `Bote.sage`, `Bote.schreibe`, `Bote.fehler`, `Bote.leeren` | erlaubt; Ereignisse werden gepuffert und in Stückreihenfolge ausgegeben (D4) |
| Warnungen (T0007, W0003, W0013 …) | erlaubt; Ausgabe in Stückreihenfolge, „einmal pro Code + Stelle“ über alle Stücke und die Hauptküche (D5) |
| `Uhr.jetzt()`, `Uhr.vorspulen(d)` | Küchenuhr (D6) |
| `Uhr.echt()`, `Uhr.zone()` | erlaubt (Wanduhr/Zeitzone; Test: `optionen.echtzeit`, `optionen.zone`) |
| `Zufall.*`, `neu Zufall()` | eigener Strom der Küche (D9) |
| `@Kühlschrank`, `mikrowelle`, `frisch` | Lesen aus dem Schnappschuss-Cache, Schreiben in einen Küchen-Cache, der am Stückende verfällt (D12) |
| Vorratskammer: `hole`, `hat`, `schlüssel`, `länge`, `name` auf einer **vorhandenen** Kammer | erlaubt (Schnappschuss) |
| `zwischenstand(x)` | wirkt nur auf Öfen, die **in** der Küche geöffnet wurden; sonst ignoriert (wie außerhalb eines Ofens, §14.2) |
| verschachtelte `brigade` | erlaubt (§17.1) |

### 17.3 Der Schnappschuss – Lesen ja, Schreiben nein

**S1:** Alles, was beim Anschnitt existiert („gehört der Hauptküche“), ist in der Küche **nur lesbar**: Variablen der Hauptküche
(globale, Top-Level, gefangene Zellen umgebender Funktionen/Lambdas), statische Felder, alle vorhandenen Objekte samt Feldern,
Bleche, Speisekarten, Teige, Lieferungen, Zustellungen, `Zufall`-Objekte,
Vorratskammern, Calzones und alle Theke-Zutaten.

**S2:** Was eine Küche selbst erzeugt (Variablen ihrer Rümpfe, mit `neu`/Literal/Bibliothek erzeugte Werte, `kopie()`), gehört ihr
und ist frei veränderbar. Andere Küchen können es nie erreichen (es gibt keinen beschreibbaren gemeinsamen Ort).

**S3:** Jeder Versuch, etwas der Hauptküche zu verändern, wirft **an genau dieser Stelle** eine fangbare `KüchenAnanas`
(eingebaute Klasse `KüchenAnanas erbt LaufzeitAnanas`, §8). Die Prüfung ist eine **Laufzeitprüfung** und damit unabhängig von der
Planung: dieselbe Stelle, derselbe Schritt, in jedem Motor. Sie geschieht **vor jeder Wirkung** der Operation (kein Teilzustand,
keine Warnung wie T0007/W0013, kein zusätzlicher Schritt) – auch auf indirekten Wegen (Methoden, Lambdas, unqualifizierte Felder).

| Operation (auf Hauptküchen-Eigentum) | Meldung (`<n>` = Name der Variable bzw. des Felds) |
|---|---|
| Zuweisung, `+=` usw., `++`/`--`, `schieb(x)` an Variable / statisches Feld | `KüchenAnanas: '<n>' gehört der Hauptküche – ein Koch darf es nur lesen.` |
| Feldzuweisung `o.f = …` (auch unqualifiziert in einer Methode) an vorhandenem Objekt | `KüchenAnanas: '<f>' gehört der Hauptküche – ein Koch darf es nur lesen.` |
| `hinzu`, `entferne`, `setze` auf vorhandenem Blech | `KüchenAnanas: Dieses Blech gehört der Hauptküche – nimm eine kopie().` |
| `lege`, `entferne` auf vorhandener Speisekarte | `KüchenAnanas: Diese Speisekarte gehört der Hauptküche – ein Koch darf sie nur lesen.` |
| `gehenlassen()`, `backen()` (Wert noch nicht berechnet) auf vorhandenem Teig | `KüchenAnanas: Dieser Teig gehört der Hauptküche – ein Koch darf ihn nur ansehen.` |
| `priorität`, `warte` (noch nicht gewartet), `wennDa` auf vorhandener Lieferung | `KüchenAnanas: Diese Lieferung gehört der Hauptküche – ein Koch darf sie nur ansehen.` |
| Ziehen aus einem vorhandenen `Zufall`-Objekt (auch `saat(n)`) | `KüchenAnanas: Dieser Zufall gehört der Hauptküche – nimm Zufall direkt oder neu Zufall().` |
| `lege`, `entferne`, `leeren` auf vorhandener Vorratskammer `x` | `KüchenAnanas: Die Vorratskammer 'x' gehört der Hauptküche – ein Koch darf nur nachsehen.` |
| `aufklappen()` auf vorhandener Calzone | `KüchenAnanas: Diese Calzone gehört der Hauptküche – ein Koch darf sie nicht aufklappen.` |

Bereits fertige Zustände bleiben lesbar: `backen()` eines Teigs, dessen Wert schon berechnet ist (durch `gehenlassen` oder
`backen`), liefert den Wert; `warte()` einer gewarteten Lieferung liefert die gespeicherte Zustellung; `wert()`,
`istAufgegangen()`, `saat()` eines Zufall-Objekts usw. sind Lesezugriffe. **Werfen** einer vorhandenen Ananas verändert
nichts und ist erlaubt (sie verlässt die Küche als Kopie, §17.5).

**Reihenfolge der Wache (K-101/4, verbindlich für alle Motoren).** Eine schreibende Operation läuft in der Küche in genau
dieser Folge ab: (a) **Operanden und Argumente** werden wie gewohnt ausgewertet – ihre Schritte zählen, ihre Wirkungen
(Ausgaben, eigene Objekte) treten ein (`z = f(x)` ruft `f` auf, bevor die Wache greift; bei `o.f = …` wird `o` ausgewertet,
bei `+=`/`++` der alte Wert gelesen); (b) das **Ziel wird aufgelöst** – unbekannte Variable, unbekanntes Feld oder ein
nicht instanziierbarer Typ werfen die gewohnte Ananas (`LaufzeitAnanas: 'x' ist nicht definiert.`, `RohlingAnanas`);
(c) die **Küchenwache** prüft (0 Schritte) und wirft die `KüchenAnanas`; (d) erst danach kämen die **eigenen Prüfungen der
Operation** – Index (`KeinStückAnanas`), Schlüssel, Typ (`TypAnanas`), `gebacken` (`GebackenAnanas`), Einlagerungstyp der
Vorratskammer, Budget. `b.setze(99, 5)` auf einem Hauptküchen-Blech wirft also die `KüchenAnanas`, nicht die
`KeinStückAnanas`; `g = 2` auf einer gebackenen Hauptküchen-Variable die `KüchenAnanas`, nicht die `GebackenAnanas`. Eine
gefangene Wache kostet so viele Schritte wie die gelungene Zuweisung (`y = x + 1` = 4, ob `y` eigen ist oder nicht).

**S4 – nur in der Hauptküche** (wirft beim Aufruf, auch bei reinen Abfragen und Gettern):

| Operation | Meldung |
|---|---|
| `Bestellannahme.*` (`lies`, `frage`, `liesZahl`, `frageZahl`, `hatMehr`) | `KüchenAnanas: Bestellannahme gibt es nur in der Hauptküche.` |
| `neu Theke`/`neu <Zutat>` und jede Methode einer Theke oder Zutat | `KüchenAnanas: Die Theke gibt es nur in der Hauptküche.` |
| `neu Vorratskammer(…)` | `KüchenAnanas: Neue Vorratskammern gibt es nur in der Hauptküche.` |

Eingabe und Theke warten auf den Menschen und sind an genau einen Ort gebunden (eine Theke pro Programm, K-062); neue Kammern
lesen vom Host. Ein Leseversuch in der Küche verbraucht keine Eingabe und erzeugt kein `eingabe`-Ereignis. S4 betrifft nur
Operationen, die in der Hauptküche gelingen würden: `neu Zutat()` (abstrakte Basisklasse, §16.1) wirft auch in der Küche die
`RohlingAnanas: Ein Rohling ist nicht essbar.` – wie überall (K-101/3).

**S5 – Lieferungen und Teige einer Küche** gehören der Küche und verfallen am Stückende: Lieferungen mit `wennDa`, die in der
Küche bestellt und dort nicht gewartet wurden, laufen **nie** (sie nehmen nicht an der `wennDa`-Phase nach Programmende teil).

### 17.4 Gemeinsamer Zustand

Version 1 hat **keinen** gemeinsamen veränderlichen Zustand und deshalb **keine Sperren** und keine Atomics in der Sprache
(K-097/F4). Der einzige Kanal aus der Küche ist der Rückgabewert (plus Ausgaben). Jede Sperre machte die Reihenfolge der
Zugriffe von der Planung abhängig.

### 17.5 Was eine Küche verlassen kann – kartonfähige Werte

Rückgabewerte der Stücke (und geworfene Werte, D3) werden beim Zusammenführen **tief kopiert** („in den Karton gepackt“):

| Wert | kartonfähig? | Kopie |
|---|---|---|
| `salami`, `funghi` (auch NaN/Infinity), `margherita`, `diavolo`, `karton`, `Dauer`, quattrostagioni-Wert | ja | Wert |
| `Blech`, `Speisekarte` | ja, wenn alle Elemente/Schlüssel/Werte kartonfähig | neue Objekte; geteilte Teile und Zyklen **innerhalb** des Ergebnisses bleiben geteilt |
| `Rohling<T>` (roh-Info eines Ofens, §7.3) | ja, wenn `teilergebnis()` kartonfähig | neues `Roh(…)` mit kopiertem Teilergebnis und gleicher `verbrauchteZeit()` |
| Objekt einer eigenen Klasse, eigene Ananas, eingebaute Ananas | ja, wenn alle Felder kartonfähig | neues Objekt, **gleiche Nummer** `Klasse@N` (D10), Calzone-Zustand bleibt; Ananas behalten Nachricht und Zeile |
| Klasse, Rezeptur, quattrostagioni-Typ, Module (`Bote`, `Mathe` …) als Wert | ja | dieselbe (unveränderliche) Referenz |
| Funktion, Lambda, Methodenreferenz, `Teig`, `Lieferung`, `Zustellung`, `Reste`, `Zufall`-Objekt, `Vorratskammer`, Theke/Zutat | **nein** | – |

- Nicht kartonfähig → `KüchenAnanas: <Art> passt in keinen Karton – nur Werte können die Küche verlassen.` mit `<Art>` ∈
  `Eine Funktion`, `Ein Teig`, `Eine Lieferung`, `Eine Zustellung`, `Reste`, `Ein Zufall`, `Eine Vorratskammer`,
  `Eine Theke-Zutat` (Theke und Zutaten) – die Aufzählung ist abschließend (K-101/1, `Ein Stück` entfiel mit K-105). Maßgeblich ist der **erste** nicht
  kartonfähige Teilwert in Tiefensuche (Elemente in Reihenfolge, Speisekarten je Paar Schlüssel vor Wert, Felder in
  Deklarationsreihenfolge, Basisklassen zuerst, Teilergebnis eines `Rohling`). Die Ananas
  entsteht **in der Küche** am Ende des Stücks (Position = Position des `brigade`-Aufrufs, Schritte unverändert) und gilt als
  Abbruch dieses Stücks (D3).
- Ist ein **geworfener** Wert nicht kartonfähig, wird stattdessen
  `KüchenAnanas: Was der Koch geworfen hat, passt in keinen Karton.` (Position des `brigade`-Aufrufs) geworfen.
- **Identität:** Ergebnisse sind immer Kopien, auch wenn ein Stück einen Wert der Hauptküche unverändert zurückgibt
  (`b.brigade(x -> x)` liefert neue Bleche; `==` auf Blechen/Objekten ist daher `nein`, auf Zahlen/Texten Wertgleichheit).
  Die Kopien gehören der Hauptküche und sind dort frei veränderbar.
- Die Prüfung der Kartonfähigkeit kostet 0 Schritte und ruft **kein** `alsText()` auf.

### 17.6 Determinismus (D1–D15)

Jedes Stück ist eine **reine Funktion von (Schnappschuss, Element, Stücknummer, Anschnitt-Zählern)**, das Zusammenführen eine
feste Faltung in Stückreihenfolge. Beim Anschnitt merkt sich die Brigade: Schritte `S₀`, Uhr `T₀ = S₀ + offset` (offset =
vorgespulte Zeit + Brigade-Ersparnis, §14.1), Limitbasis und Limit (K-087), aktive Ofen-/Lieferungs-Budgets (Ende-Zeitpunkte
`E_f`), Stapeltiefe, Objektzähler `N₀`, Lieferungszähler `L₀`.

- **D1 – Unabhängige Ausführung.** Jedes Stück i läuft so, als liefe es allein direkt nach dem Anschnitt: Schritte ab `S₀`, Uhr
  ab `T₀`, Objektnummern ab `N₀`, Lieferungsnummern ab `L₀`, eigener Zufallsstrom (D9), leerer Küchen-Cache (D12). Kein Stück
  sieht Wirkungen eines anderen.
- **D2 – Stückreihenfolge.** Zusammengeführt wird immer in Stückreihenfolge 1 … n, unabhängig davon, wann welcher Koch fertig wird.
- **D3 – Abbrüche: der erste in Stückreihenfolge gewinnt.** Ein Stück endet normal (Wert) oder bricht ab: ungefangene Ananas,
  Budget-Überschreitung eines äußeren Ofens/einer äußeren Lieferung (D8), P0002 (D7), PizzaFehler (seit K-105 keiner mehr zur Laufzeit), Hawaii-Panik
  (D14), nicht kartonfähiges Ergebnis (§17.5). Sei `k` das **kleinste** abgebrochene Stück. Dann:
  - Die Ereignisse der Stücke 1 … k−1 und die Ereignisse von Stück k **bis zum Abbruch** werden ausgegeben (D4); Stücke > k
    gelten als **nie gelaufen** (keine Ereignisse, keine Schritte, keine Uhr, keine Zähler).
  - Der Abbruch wird in der Hauptküche **am `brigade`-Aufruf** fortgesetzt: eine Ananas (kopiert nach §17.5, mit ihrer
    ursprünglichen Zeile/Spalte) wird dort geworfen und ist mit `probier`/`verbrannt` um den Aufruf fangbar; Budget-Abbrüche
    greifen wie in §14.2 (äußerster überschrittener Rahmen); P0002, PizzaFehler und Panik beenden das Programm wie gewohnt
    (PizzaFehler und Panik: das `fehler`- bzw. `panik`-Ereignis trägt Text und Zeile aus der Küche; P0002: Position wie bei
    `belege`, D7). Ist der geworfene Wert nicht kartonfähig, gilt §17.5.
  - Hosts dürfen Stücke > k abbrechen, sobald k feststeht und alle Stücke < k fertig sind (Optimierung, unbeobachtbar).
- **D4 – Ereignisse.** `ausgabe`/`fehlerausgabe`/`leeren`/`warnung` eines Stücks werden in der Küche gepuffert und beim
  Zusammenführen in Stückreihenfolge **vor** der Rückkehr des `brigade`-Aufrufs ausgegeben; innerhalb eines Stücks in
  Auftretensreihenfolge. Hüllen dürfen die Ereignisse von Stück k bereits live zeigen, sobald alle Stücke < k ohne Abbruch fertig
  sind („geordnetes Streaming“ – die Folge ändert sich nicht). `eingabe`, `ui`, `vorrat` kommen in Küchen nicht vor (S3/S4).
- **D5 – Warnungen.** „Einmal pro Code + Stelle“ (§10, §14.8; W0003 einmal pro Methode) gilt über die gesamte Ereignisfolge: eine
  Warnung eines Stücks wird beim Zusammenführen unterdrückt, wenn dieselbe Warnung bereits in der Hauptküche oder in einem früheren
  Stück ausgegeben wurde (= die Folge, die sequentielle Ausführung ergäbe). Danach gilt sie auch in der Hauptküche als ausgegeben.
- **D6 – Uhr: der langsamste Koch zählt.** Küchenuhr von Stück i: `T₀ + (eigene Schritte) + (eigenes vorspulen)`;
  `dᵢ` = Küchenuhr am Stückende (bzw. beim Abbruch) − `T₀`. Nach dem Zusammenführen gilt in der Hauptküche
  `schritte = S₀ + Σ sᵢ` (Arbeit – Summe über die berücksichtigten Stücke, D3), `Uhr = T₀ + max dᵢ` (Zeit – kritischer Pfad über
  die berücksichtigten Stücke) und intern `offset := Uhr − schritte` (darf kleiner werden; `zeitMs` kann damit kleiner als
  `schritte` sein). Das `ende`-Ereignis zeigt so Arbeit (`schritte`) und simulierte Zeit (`zeitMs`) getrennt.
  **Referenz** (Vergleich mit `belege`; Prüfstand a14):

  | Programm | `belege` | `brigade` |
  |---|---|---|
  | `Blech<salami> r = [1, 2, 3, 4].brigade(x -> x * x);` | schritte 20, zeitMs 20 | schritte 20, zeitMs **11** (Anschnitt bei Uhr 8, jedes Stück 3) |
  | dito + `Bote.sage((Uhr.jetzt()));` | Ausgabe `25ms` | Ausgabe `16ms`, schritte 25, zeitMs 16 |
  | `[1, 2, 3, 4].brigade(x -> { Uhr.vorspulen(x * 1s); serviere (x); });` + `Bote.sage((Uhr.jetzt()));` | `10s 45ms` | `4s 21ms`, schritte 45 (Stück 4: 8 Schritte + 4 s) |

- **D7 – Schrittlimit P0002.** Jedes Stück hat als eigenes Limit den Rest beim Anschnitt `R = (Limitbasis + Limit) − S₀`; es bricht
  beim eigenen Schritt `R + 1` mit P0002 ab (Abbruch nach D3, Position wie bei `belege`). Die Küchenuhr dieses Stücks steht dann
  bei `T₀ + R + 1` (= Limit + 1 ohne Vorspulen), `schritte` nach D3/D6 = `S₀ + s₁ + … + s_{k−1} + (R + 1)` – die Arbeit der
  berücksichtigten Stücke; nur bei k = 1 ist das Limit + 1 (K-101/2). Nach dem Zusammenführen ohne Abbruch wird geprüft:
  `S₀ + Σ sᵢ > Limitbasis + Limit` → P0002 **am `brigade`-Aufruf** (Position des Aufrufs, `schritte` = tatsächliche Summe).
  Beides sind die einzigen Fälle, in denen `schritte` größer als Limit + 1 ist (§14.1). Stücke erben die Limitbasis (K-087);
  in Küchen wird sie nie neu gesetzt. Referenz: Limit 30, `Blech<salami> r = [1, 2, 3, 4].brigade(x -> x * x * x * x);` →
  P0002 in Zeile 1, schritte 36, zeitMs 15, Exit 3. Limit 100, `[1, 2].brigade(x -> { falls (x == 2) { solange (ja) { } }
  serviere (x); });` → P0002 in Stück 2 (S₀ = 6, s₁ = 6, R = 94): schritte 107, zeitMs 101, Exit 3.
- **D8 – Ofen- und Lieferungsbudgets.** Äußere Budgets (in der Hauptküche geöffnet) gelten in jeder Küche gegen die Küchenuhr:
  Stück i überschreitet Rahmen f, sobald seine Küchenuhr > `E_f` ist (Regel aus §14.2, „äußerster greift“). Das ist ein Abbruch
  nach D3; die Hauptküche setzt am `brigade`-Aufruf mit diesem Rahmen fort (innere Rahmen werden ohne `roh` verlassen),
  `verbrauchteZeit()` = Uhr nach D6 − Start des Ofens. Nach dem Zusammenführen gilt die Uhr nach D6 (eine Brigade kann so in ein
  Budget passen, in das die gleiche Arbeit mit `belege` nicht passt). In der Küche geöffnete Öfen/Lieferungen verhalten sich wie immer.
- **D9 – Zufall.** Beim Anschnitt zieht die Hauptküche aus ihrem globalen Strom **n** Saaten in Stückreihenfolge, je
  `sᵢ = floor(r · 2³²)` (wie `neu Zufall()`, K-078); Stück i benutzt als globalen Strom `Zufall` einen mulberry32-Strom mit Saat
  `sᵢ` (`Zufall.saat()` liefert dort `sᵢ`). Die Hauptküche zieht danach normal weiter (n Ziehungen verbraucht, auch wenn kein
  Stück Zufall nutzt; leeres Blech: keine). `Zufall.saat(n)` in der Küche setzt nur den Küchenstrom. Referenz (Saat 42):
  `[1, 2, 3].brigade(x -> Zufall.zahl(1, 1000))` → `[248, 359, 896]`, danach `Zufall.zahl(1, 1000)` → `670`;
  Saaten `2581720956, 1925393290, 3661312704`.
- **D10 – Objektnummern** (`Klasse@N`, §14.9). Jede Küche nummeriert ab `N₀ + 1`. Nach dem Zusammenführen zählt die Hauptküche ab
  `N₀ + max cᵢ` weiter (cᵢ = Anzahl `neu` in Stück i; über die berücksichtigten Stücke). Nummern können sich zwischen Stücken
  wiederholen; kopierte Ergebnisobjekte behalten ihre Nummer. Gleiches gilt für Lieferungsnummern (`Lieferung #n`).
- **D11 – Stapeltiefe.** Jedes Stück beginnt mit der Tiefe des `brigade`-Rückrufs (Aufruftiefe + 1) und hat dieselbe Grenze 1500
  (§14.4). Der Wirt-Stapel eines Kochs muss dieselbe Tiefe erlauben wie der Hauptthread (HOST-ABI §6).
- **D12 – Kühlschrank.** Eine Küche liest Cache-Einträge des Schnappschusses (Frische nach Küchenuhr, §14.10) und schreibt neue
  oder erneuerte Einträge in einen Küchen-Cache, der am Stückende verfällt. Der Cache der Hauptküche ändert sich durch eine
  Brigade nie (auch nicht über Objekte der Hauptküche – der Cache ist kein Feld, S3 greift nicht).
- **D13 – Speicher (Wasm/nativ).** Jede Küche darf höchstens `min(Restspeicher beim Anschnitt, 256 MiB)` neu belegen
  (Restspeicher = Speicherlimit − belegter Heap). Überschreitung → `LaufzeitAnanas: Der Kühlschrank ist voll (Speicherlimit
  erreicht).` in der Küche (fangbar, sonst Abbruch nach D3; K-089). Der Interpreter hat weiterhin keine feste Grenze (K-089).
- **D14 – Hawaii.** Panik in Stück i ist ein Abbruch nach D3: nur wenn kein früheres Stück abgebrochen ist, erscheint der Banner
  (nach den Ausgaben der Stücke 1 … i), Exit 39. W0666 ist statisch und ändert sich nicht.
- **D15 – Was die Hauptküche nach der Brigade sieht.** Unverändert: alle eigenen Variablen, Objekte, Caches, Theke, Kammern,
  Lieferungen. Geändert: `schritte`, Uhr (D6), Zufallsstrom (D9), Objekt-/Lieferungszähler (D10), Warnungsgedächtnis (D5) und das
  Ergebnisblech.

**Folgerung (testbar):** Für jedes Programm sind die Ergebnisse mit `koeche = 1`, `koeche = n` und unter beliebiger Permutation
der Ausführungsreihenfolge der Stücke identisch (Testoption `kuechenChaos`, ARCHITEKTUR §1).

### 17.7 Köche – nur Host-Einstellung (K-100)

- Die Anzahl der Köche ist **nie** aus der Sprache steuerbar oder beobachtbar (keine Sprach-Option, kein `brigade(fn, köche: …)`).
- Einstellung nur im Host: Playground-Popover „Köche: auto | 1 | 2 | 4 | 8“, CLI/EXE `--koeche=N` (`auto` = Standard, `1` = aus),
  Option `koeche` der JS-APIs (ARCHITEKTUR §1/§2, HOST-ABI §7). `auto` = Anzahl logischer Kerne, höchstens 16.
- Einzige sichtbare Spur ist die Hüllen-Anzeige `Köche: N` (tatsächlich genutzte Anzahl; 1 bei Interpreter oder Rückfall) – **nur** bei
  Programmen, die `brigade` nutzen (Gruppe `kueche`; Nutzerentscheidung K-100), das Popover bleibt immer sichtbar –
  gleicher Text in Playground-Statusleiste und `--info` (K-082). Das optionale `ende`-Feld `koeche` gehört nicht in `.erwartet`
  und wird von Differenztests ignoriert.
- Jeder Host darf ohne Threads arbeiten (keine SharedArrayBuffer, keine verschachtelten Worker, `koeche = 1`): identisches
  Ergebnis, nur langsamer. Der Interpreter ist die sequentielle Referenz (K-097/F8).

### 17.8 Ausblick (nicht Version 1)

- **Statische Hilfe:** `W0201: Dieser Koch schreibt in 'x' – das gehört der Hauptküche.` für direkt an `brigade` übergebene
  Lambdas, die erkennbar in gefangene/globale Variablen schreiben (Code reserviert; ersetzt die Laufzeitprüfung nicht; käme wie
  W0666/W0032 in `analysiere()`/IR `warnungen`).
- **Hintergrund-Köche** (K-097/F9): ein eigenes Konstrukt mit Küchen-Semantik (z. B. `Auftrag<T> a = koch(() -> …);` …
  `a.abholen()`); `teig`/`bestelle` behalten ihre Semantik (§13).
- Ein deterministischer gemeinsamer „Bestellblock“ (nur anhängen, Zusammenführung in Stückreihenfolge) kann später ergänzt werden.

## 18. Herd – Spiel-Engine für 2D und 3D (Tier 1 im Interpreter; K-128 … K-136, Ausbau K-148/K-149)

Konzept, Schichten, Leistungsziele, Erweiterung und Roadmap: `HERD.md`. Hier steht der verbindliche Vertrag für Sprache und Verhalten.
Die Szene lebt in der Engine (Herd-Kern, Rust); Interpreter und Wasm-Laufzeit sind dünne Anbindungen daran. Prüfstand: `a18-herd.js`.

### 18.1 Klassen

| Klasse | Konstruktor | Methoden |
|---|---|---|
| `Herd` | `(titel = "", breite: 640, hoehe: 360)` | Schleife §18.2, Eingabe §18.3, Welt und Fabriken §18.5: `backe(fn = karton)`, `schliesse()`, `titel()`, `setzeTitel(t)`, `breite()`, `hoehe()`, `bildnummer()`, `zeit()` |
| `Teil` | – (nur über Fabriken, `kopie()`) | §18.4 |
| `Form` | `(punkte, dreiecke, glatt: nein)` | `id()`; statisch `Form.wuerfel()`, `Form.kugel(teile: 24)`, `Form.zylinder(teile: 32)`, `Form.kegel(teile: 32)`, `Form.ebene()`, `Form.ring(dicke: 0.3, teile: 32)` |
| `Bildchen` | `(zeilen, farben: karton)` | `breite()`, `hoehe()`, `id()` |
| `Modell` | – (nur `Modell.laden(pfad)`, H-K16) | `namen()`, `folgen()` → `Blech<margherita>`, `belaege()` → `Blech<Teil>`, `breite()`, `hoehe()`, `tiefe()` (§18.5 „Modelle“) |
| Komponenten | `(feld: wert, …)` | generisch aus dem Schema (§18.4), Liste §18.6 |
| `Kniff` | – (Rohling; nur `erbt Kniff`) | `teil()`; überschreibbar `start()`, `takt()`, `beimBetreten(Teil anderes)`, `beimVerlassen(Teil anderes)`, `beimKlick()`, `beimEntfernen()` (§18.4 „Kniffe“, K-152) |

- Alle sind eingebaute Klassen wie die Theke-Zutaten: `erbt Herd` → P0010; eine eigene Klasse gleichen Namens hat Vorrang. **Ausnahme
  `Kniff` (H-K13, K-152):** die einzige erbbare Herd-Klasse – `klasse Wackler erbt Kniff { … }` ist erlaubt, `neu Kniff()` →
  `RohlingAnanas: Ein Rohling ist nicht essbar.`; sie gibt es auch ohne `neu Herd` (anhängen kann man Kniffe nur an Teile). Statisch
  an `Herd`: `Herd.farbe(r, g, b, a = 1)` → `"#rrggbbaa"` (r, g, b gerundet und auf 0 … 255 geklemmt, a auf 0 … 1 geklemmt, × 255 gerundet,
  Kleinbuchstaben). Textformen: `Herd(<titel>)`, `Teil(<id>)`, `Form(<id>)`, `Bildchen(<breite>×<hoehe>)`, `Modell(<pfad>)`, Komponente `<Name>(<teil-id>)`
  bzw. `<Name>()` solange sie an keinem Teil hängt.
- **Ein Herd (K-132):** `neu Herd` zum zweiten Mal → `LaufzeitAnanas: Es gibt nur einen Herd pro Programm.` Fabriken/Ressourcen vor
  `neu Herd` → `LaufzeitAnanas: Erst braucht es einen Herd (neu Herd(…)).`
- **Theke und Herd (K-133):** Enthält ein Programm sowohl `neu Herd(…)` als auch `neu Theke(…)` (jeweils die eingebaute Klasse) → vor dem
  Start `PizzaFehler P0013: Theke und Herd in einem Programm gibt es noch nicht.` (Exit 2, Position des späteren `neu`).
- **Größe:** `breite`/`hoehe` ganzzahlig (`TypAnanas: Herd(breite: …) braucht eine Ganzzahl, nicht 2.5.`), 64 … 4096
  (`LaufzeitAnanas: Herd(breite: …) muss zwischen 64 und 4096 liegen, nicht 10.`); fehlend oder `karton` → Standard. `titel` nimmt die
  Textform (K-102).
- **Kern:** Herd-Programme brauchen den Herd-Kern (`site/js/herd/kern.wasm` bzw. nativ eingebaut). Fehlt er, endet der Lauf vor dem Start
  mit `{ typ: "fehler", code: "HOST", art: "intern", text: "PizzaFehler HOST: Der Herd-Kern fehlt (kern.wasm)." }`, Exit 2 (K-128).
- **Zahlen-Parameter** verlangen salami/funghi (`TypAnanas: <methode>() braucht eine Zahl für '<parameter>', nicht <Darstellung>.`);
  benannte Parameter fehlend oder `karton` → Standard; diavolo-Parameter wie K-066.
- **Küche:** Herd-Methoden in Stücken einer `brigade` → `LaufzeitAnanas` wie Theke-Methoden (`nurHauptkueche`).

### 18.2 Spielschleife (K-132)

- **Takt:** 60 Takte pro simulierter Sekunde. `bildnummer()` = Anzahl begonnener Takte (salami, vor dem ersten 0), `zeit()` =
  `bildnummer() / 60` (funghi, Sekunden).
- **`backe(fn = karton)`** – `fn` ist eine Funktion ohne Parameter oder `karton` (sonst `TypAnanas: backe() braucht eine Funktion, z. B. () -> { … }.`):
  1. Beim ersten `backe` (und nach `schliesse()`/`geschlossen` erneut) wird das Fenster geöffnet (Ereignis `herd`/`fenster`, §18.7).
  2. Es wartet auf ein Fenster-Ereignis (kostet weder Schritte noch Zeit noch Budget). `{"typ":"takt","anzahl":n,…}`: Eingabezustand
     übernehmen (§18.3), dann `n`-mal: `bildnummer` + 1, Schrittlimit-Basis setzen (P0002 je Takt, wie K-087), `fn()` aufrufen (falls
     gesetzt), dann die **Systeme** der Komponenten (Registry-Reihenfolge, `dt = 1/60`), danach ihre **Nachlauf**-Systeme (wieder
     Registry-Reihenfolge; sehen die Lage nach allen Systemen dieses Takts, K-149), danach die **Kniff-Rückrufe** (§18.4, K-152; dasselbe
     Schrittbudget, `gedrueckt`/`losgelassen`/`klick` gelten dort wie in `fn`). Danach **ein** Bild senden (§18.7). `anzahl`
     fehlt/ungültig → 1, größer als 4 → 4. `{"typ":"geschlossen"}` → Schleife endet. Andere Ereignisse werden ignoriert.
  3. `herd.schliesse()` im Rückruf: Der Rückruf läuft zu Ende, Systeme und Bild entfallen, `schliesse` wird gesendet, `backe` kehrt zurück.
     In einem Kniff-Rückruf: der Rückruf läuft zu Ende, die übrigen Kniffe dieses Takts und das Bild entfallen.
- Ananas aus `fn` verlassen `backe` (fangbar); die Systeme dieses Takts laufen nicht, es wird kein Bild gesendet, das Fenster bleibt
  offen; erneutes `backe` macht weiter. Ananas aus einem Kniff-Rückruf ebenso (die Systeme dieses Takts sind dann schon gelaufen, die
  übrigen Kniffe nicht). Panik beendet sofort (kein `schliesse`).
- **Programmende (wie K-061):** offenes Fenster → `schliesse` am Ende, auch bei Ananas/P0002, nicht bei Panik.
- **Ohne Renderer (wie K-063):** fehlen `onUiWarte` und `uiEreignisse` → `backe` öffnet und schließt das Fenster (Ereignisse `fenster`,
  `schliesse`), warnt je Aufrufstelle `W0104: Kein Herd verfügbar – Fenster wird nicht angezeigt.` und kehrt sofort zurück.
  `uiEreignisse` erschöpft oder `onUiWarte` liefert `null`/wirft → `geschlossen`. Nativ bricht ein Herd-Programm ohne mögliches Fenster
  vor dem Start mit Meldung und Exit 2 ab (K-130); W0104 gilt dort nur im JSON-/Testmodus.

### 18.3 Eingabe (K-132)

Jedes `takt`-Ereignis trägt den Eingabezustand; fehlende Felder bleiben wie zuvor (Anfang: nichts gedrückt, Maus `[0, 0]`):
`tasten` (Blech von Tastennamen wie `Tastatur`, K-110), `maus` (`[x, y]` in Spielfeld-Koordinaten), `knoepfe` (Bitmaske 1 links,
2 rechts, 4 Mitte; Touch = 1). Ungültige Felder werden ignoriert. Jeder Motor reicht den Zustand in **jedem** Takt vor `fn()` an den
Herd-Kern (Export `eingabe`, H-K12, K-151); die UI-Bausteine (`Taster`, `Regler`, `Tafel`, §18.6) und `Blick.mausX`/`mausY` lesen ihn
dort. Er gehört nicht zum Szenen-Hash, wirkt nur über Lesefelder.
- `taste(n)` gehalten; `gedrueckt(n)`/`losgelassen(n)` im **ersten** Takt des Ereignisses Wechsel gegenüber dem vorigen Zustand, sonst
  `nein`; `n` nimmt die Textform. `mausX()`, `mausY()` → funghi; `maus(k = 1)` gehalten, `klick(k = 1)` im ersten Takt neu gedrückt
  (`k` 1 … 3, sonst `LaufzeitAnanas: Maustaste 4 gibt es nicht (1 links, 2 rechts, 3 Mitte).`). Außerhalb von `backe`: letzter
  Zustand, `gedrueckt`/`losgelassen`/`klick` → `nein`, `mausDX`/`mausDY`/`mausrad` → `0`.
- **Modifikatoren:** Anders als die `Tastatur` der Theke meldet der Herd `Umschalt`, `Strg` und `Alt` als eigene Tasten (übrige
  Modifikatoren wie Feststell-, Windows-/Befehlstaste und AltGr nicht). Losgelassen wird die Taste, die gedrückt wurde (nach
  physischer Taste): `w` drücken, Umschalt dazu, `w` loslassen lässt kein `W` hängen.
- **Mausfang und relative Bewegung:** Drei weitere Felder des `takt`-Ereignisses: `bewegung` (`[dx, dy]`, Rohbewegung der Maus seit
  dem vorigen `takt`-Ereignis in Pixeln, rechts/unten positiv), `rad` (Mausrad seit dem vorigen Ereignis in Rasten, positiv = zum
  Nutzer hin) – beide sind Summen: fehlen sie oder sind sie ungültig (nicht zwei endliche Zahlen bzw. keine endliche Zahl), gilt `0`
  – und `gefangen` (`true`/`false`, Zustand: fehlt oder ungültig → unverändert, Anfang `false`). `mausDX()`, `mausDY()`, `mausrad()`
  → funghi, im **ersten** Takt des Ereignisses der Wert des Ereignisses, sonst `0` (wie `klick`: nachgeholte Takte drehen nicht
  mehrfach); `mausGefangen()` → diavolo. `herd.mausFangen(an = ja)` (diavolo, sonst `TypAnanas`) → der Herd; äußert den **Wunsch**,
  die Maus zu fangen bzw. (`nein`) freizugeben, und sendet bei einem Wechsel `{"typ":"herd","art":"mausfang","an":ja|nein}` an den
  Renderer (auch vor dem ersten `backe`; gilt für alle Fenster des Laufs). Der Renderer fängt die Maus beim nächsten Klick ins Bild
  (Browser: Pointer Lock braucht eine Nutzergeste; nativ ebenso, Browser = nativ) – dieser Klick kommt wie jeder Klick an,
  `mausGefangen()` ist in seinem Takt noch `nein` –, blendet den Zeiger aus und meldet `gefangen`; Esc (geht dann nicht ans Programm), Fokusverlust, `mausFangen(nein)` und
  Fensterende geben frei. Gefangen bleibt `maus` stehen. `bewegung` liefern die Renderer auch ohne Fang (Zeigerbewegung über dem
  Fenster). Nichts davon geht an den Kern (`eingabe` unverändert).

### 18.4 Teile und Komponenten (K-132)

**Teil** = Objekt der Szene mit `raum` 2D oder 3D (bei der Erzeugung fest), einer **Lage** und beliebig vielen Komponenten (je Art
höchstens eine). 2D: Spielfeld-Pixel, Ursprung oben links, y nach unten, `drehung` in Grad im Uhrzeigersinn, `ebene` (Ganzzahl,
Zeichenreihenfolge, gleich → nach ID); 3D: rechtshändig, y oben, Drehung in Grad – erst `rollen` (z), dann `neigung` (x), dann
`drehung` (y). Kinder liegen relativ zu ihren Eltern (nur gleicher Raum). 2D wird über der 3D-Szene gezeichnet.

| Teil-Methode | Bedeutung |
|---|---|
| `x()`, `y()`, `z()`, `setzeLage(x, y, z = 0)`, `verschiebe(dx, dy, dz = 0)` | Lage relativ zu den Eltern |
| `drehung()`/`setzeDrehung(g)`, `neigung()`/`setzeNeigung(g)`, `rollen()`/`setzeRollen(g)`, `schaueAuf(x, y, z)` | Drehung; `neigung`/`rollen`/`schaueAuf` nur 3D |
| `groesse()` (= x-Größe), `groesseX()`/`groesseY()`/`groesseZ()`, `setzeGroesse(sx, sy = sx, sz = sx)` | Skalierung |
| `ebene()`/`setzeEbene(n)` (2D), `sichtbar()`/`sichtbar(d)` | Reihenfolge, Sichtbarkeit (vererbt) |
| `haenge(an)` (`karton` löst), `eltern()`, `kinder()` | Hierarchie (Zyklus → `LaufzeitAnanas: Teil 3 kann nicht an seinem eigenen Kind hängen.`, anderer Raum → `LaufzeitAnanas: Ein 2D-Teil kann nicht an einem 3D-Teil hängen.`) |
| `entferne()`, `entfernt()` | entfernt das Teil samt Kindern; danach wirft jede andere Methode `LaufzeitAnanas: Teil 7 ist schon entfernt.` |
| `kopie()` | neues Teil mit Kopien aller Komponenten und Kinder; die Komponente `Vorlage` an der Wurzel kommt nicht mit (H-K8: aus dem ruhenden Muster wird ein waches Teil) |
| `trifft(anderes)` → diavolo | Hüllen überlappen sich (2D: Kreis als Kreis, sonst Rechteck in Weltlage; 3D: achsenparallele Hüllquader); anderer Raum oder unsichtbar → `nein` |
| `mit(komponente)` → Komponente | hängt an (§ unten); `<name>()` → die Komponente dieser Art oder `karton`; `ohne("Name")` entfernt sie |
| `mit(kniff)` → Kniff, `ohne(kniff)` → Kniff oder `karton`, `kniffe()` → `Blech<Kniff>` | eigene Kniffe (unten, H-K13) |
| `raum()` → `"2D"`/`"3D"`, `id()` | |
| `finde(name)` → Teil oder `karton` | erstes Teil im Teilbaum (das Teil selbst eingeschlossen, Tiefensuche in Kindreihenfolge, auch ruhende und unsichtbare) mit `Etikett.name` = `name` (H-K16); kein Text → `TypAnanas: finde() braucht einen Text für 'name', nicht 3.` |

**Komponenten generisch (K-132):** Jede Komponente des Schemas (`site/js/herd/schema.json`, erzeugt aus dem Kern) heißt in pizza wie im
Schema und ist eine eingebaute Klasse:
- `neu <Name>(…)`: Felder als benannte Argumente (oder positionell in Schema-Reihenfolge); fehlend/`karton` → Standard.
- Getter `<feld>()`, Setter `setze<Feld>(w)` (erster Buchstabe groß, liefert die Komponente), generisch `hole("feld")`/`setze("feld", w)`
  (unbekannt → `LaufzeitAnanas: <Name> hat kein Feld 'x'.`), `teil()` → Teil oder `karton`.
- Am Teil heißt der Zugriff wie die Komponente mit kleinem Anfangsbuchstaben (`teil.bewegung()`); Komponentennamen kollidieren nie
  mit Teil-Methoden (der Kern prüft das beim Bauen).
- `teil.mit(k)`: `k` hängt noch nirgends (`LaufzeitAnanas: Diese Bewegung hängt schon an Teil 3.`), passt zum Raum
  (`LaufzeitAnanas: Kreis gibt es nur für 2D-Teile.`), die Art fehlt noch (`LaufzeitAnanas: Teil 3 hat schon eine Bewegung.`),
  Voraussetzungen erfüllt (`LaufzeitAnanas: Animation braucht ein Bild am selben Teil.`). Vor dem Anhängen hält die Komponente ihre
  Werte selbst, danach lebt sie in der Engine (Getter zeigen, was die Systeme verändert haben).
- **Feldtypen und Texte:** `zahl` (salami/funghi), `ganz` (Ganzzahl), `diavolo`, `text` (Textform), `wahl` (Text aus fester Liste), `farbe`
  (§18.5), `teil`, `form`, `bildchen`, `bildchen-liste` (Blech), `teil-liste` (Blech aus Teilen), `zahl-liste` (Blech aus Zahlen).
  Falscher Typ → `TypAnanas: <Name>.<feld> braucht <eine Zahl | eine Ganzzahl | ja/nein | eine Farbe | ein Teil | eine Form | ein Bildchen
  | ein Blech aus Bildchen | ein Blech aus Teilen | ein Blech aus Zahlen>, nicht <Darstellung>.`; außerhalb des Bereichs →
  `LaufzeitAnanas: <Name>.<feld> muss zwischen <min> und <max> liegen, nicht <w>.` (bzw. `mindestens <min>`); `wahl` →
  `LaufzeitAnanas: <Name>.<feld> kennt 'x' nicht. Erlaubt: a, b, c.` Die Texte erzeugt der Kern (eine Quelle für alle Motoren).
- **Listenfelder (K-149):** `teil-liste` und `zahl-liste` behalten die Einfügereihenfolge (Doppelte erlaubt), Standard `[]`, höchstens
  65 536 Einträge (`LaufzeitAnanas: <Name>.<feld> darf höchstens 65536 Einträge haben, nicht <n>.`). Der Getter liefert ein neues Blech
  (Ändern daran ändert die Komponente nicht). `teil-liste`: nur lebende Teile (`LaufzeitAnanas: Teil 7 ist schon entfernt.`); später
  entfernte Teile **fallen beim Lesen heraus**. `zahl-liste`: ein Bereich des Felds gilt für jeden Eintrag.
- **Lesefelder (K-149):** Felder, die nur das System der Komponente schreibt (im Schema `lesen`). Getter wie immer; Setter `setze<Feld>(w)`,
  `setze("feld", w)` und das Konstruktor-Argument (auch mit falschem Typ) → `LaufzeitAnanas: <Name>.<feld> kann man nur lesen.`; `karton`
  bzw. ein fehlendes Konstruktor-Argument setzen nichts und sind erlaubt.

**Kniffe – eigene Klassen als Komponente (H-K13, K-152):** Eine Klasse, die (auch über Zwischenklassen) von der eingebauten Klasse
`Kniff` erbt, ist ein Kniff (Unity: MonoBehaviour). Der Herd-Kern kennt Kniffe nicht; sie leben in der Laufzeit.
- `teil.mit(k)` hängt den Kniff an (Teil entfernt → `LaufzeitAnanas: Teil 7 ist schon entfernt.`; hängt er schon irgendwo →
  `LaufzeitAnanas: Dieser Kniff hängt schon an Teil 3.`) und liefert ihn; beliebig viele Kniffe je Teil, auch derselben Klasse.
  `teil.kniffe()` → neues Blech in Anhängereihenfolge; `teil.ohne(k)` löst ihn (hing er nicht an diesem Teil → `karton`, kein Fehler).
  `kopie()` übernimmt **keine** Kniffe (Muster: eine Fabrikfunktion, die das Teil anlegt und seine Kniffe anhängt).
- Im Kniff: `teil()` → das Teil oder `karton` – auch unqualifiziert in Methoden der Klasse (nach den eigenen Methoden, vor globalen
  Namen). `start`, `takt`, `beimBetreten`, `beimVerlassen`, `beimKlick`, `beimEntfernen` sind in `Kniff` leer; eine eigene Methode
  gleichen Namens überschreibt sie (`@PizzaÜberschreibt` erlaubt, `unten.takt()` ruft die leere). Nur überschriebene werden gerufen.
- **Ablauf je Takt** (§18.2, nach Systemen und Nachlauf): Teile mit Kniffen in aufsteigender Teil-ID, je Teil die Kniffe in
  Anhängereihenfolge; welche Teile und Kniffe dran sind, steht zu Beginn der Phase fest (später angehängte laufen ab dem nächsten Takt,
  inzwischen gelöste nicht mehr). **Ruhende Teile** (`Vorlage`, ausgeschaltete `Kulisse`, auch geerbt; §18.6) bekommen **keine**
  Rückrufe – auch `start()` wartet, bis das Teil wach ist; unsichtbare Teile schon. Je Kniff: `start()` (einmal je Kniff, auch nach
  erneutem Anhängen nicht noch einmal), dann `beimBetreten(anderes)` je Eintrag aus `Fuehler.betreten` und `beimVerlassen(anderes)` je
  Eintrag aus `Fuehler.verlassen` desselben Teils (nach ID, die Liste beim Erreichen gelesen), `beimKlick()`, wenn `Taster.geklickt`
  desselben Teils `ja` ist, dann `takt()`. Vor jedem Rückruf gilt: der Kniff hängt noch an diesem Teil.
- `beimEntfernen()` läuft, **nachdem** der Kniff sein Teil verlassen hat – sofort in `teil.ohne(k)` bzw. in `entferne()` des Teils oder
  eines Vorfahren (dann alle betroffenen Kniffe nach Teil-ID und Anhängereihenfolge); `teil()` ist dort schon `karton`.
- Rückrufe kosten Schritte wie jeder Aufruf; P0002 gilt je Takt für `fn` und Kniffe zusammen. In Stücken einer `brigade` → `teil()`,
  `mit`, `ohne`, `kniffe` wie alle Herd-Methoden `KüchenAnanas` (ein Kniff-Objekt aus einer Küche ist eine Kopie und hängt nirgends).

### 18.5 Herd: Welt, Fabriken, Farben, Ressourcen (K-136)

- **Welt:** `hintergrund(f)` (Standard `mozzarella`), `himmel(oben, unten = oben)` (Verlauf hinter der 3D-Szene, Standard =
  Hintergrund), `umgebung(f, staerke: 0.35)`, `nebel(f, von, bis)` (`von ≥ bis` schaltet ab). `kamera()` → das Kamera-Teil (3D, beim
  `neu Herd` angelegt: Lage `(0, 3, 8)`, schaut auf `(0, 0, 0)`, Komponente `Kamera`), `sonne()` → das Sonnen-Teil (3D, Lage = Richtung
  zur Sonne `(0.5, 1, 0.3)`, Komponente `Licht` mit `art: "sonne"`). Beide sind normale Teile (IDs 1 und 2).
- **Fabriken** (Teil anlegen + Komponente anhängen, liefern das Teil): 2D `rechteck(x, y, b, h, farbe: "weiss", rundung: 0, umriss: 0)`
  (`x, y` = Mitte), `kreis(x, y, r, farbe: "weiss", umriss: 0)`, `text(t, x, y, groesse: 16, farbe: "ofen", ausrichtung: "links")`
  (`y` = Oberkante, `x` je nach Ausrichtung), `bild(b, x, y, groesse: 1)` (Mitte), `gruppe(x = 0, y = 0)` (leeres 2D-Teil);
  3D `koerper(form, x = 0, y = 0, z = 0, farbe: "weiss", glanz: 0.3, leuchten: 0, bild: karton)`, `licht(x, y, z, farbe: "weiss",
  reichweite: 10)`, `raum(x = 0, y = 0, z = 0)` (leeres 3D-Teil), `modell(m, x = 0, y = 0, z = 0)` (H-K16, „Modelle“ unten).
- **Farben:** Text – Palettenname (`weiss #FFFFFF`, `schwarz #000000`, `grau #8A8580`, `ofen #2F2A26`, `tomate #D9452B`, `salami #A83232`,
  `schinken #F2A0A0`, `basilikum #3E8E41`, `oliven #6B7A2A`, `mozzarella #FFF6E0`, `teig #E8C48A`, `kruste #C8955A`, `ananas #F5C518`,
  `senf #F2B33D`, `himmel #8EC9F0`, `wasser #2E6FD9`, `aubergine #5B2A6E`) oder `#rgb`/`#rrggbb`/`#rrggbbaa` (Groß/klein egal), sonst
  `LaufzeitAnanas: Farbe 'lila' gibt es nicht. Erlaubt: Palettenname oder '#rrggbb'.`
- **Formen:** Grundformen Größe 1 um den Ursprung (Würfel Kante 1; Kugel/Zylinder/Kegel Durchmesser 1, Höhe 1; Ebene 1 × 1 in y = 0 nach
  oben; Ring Außendurchmesser 1, `dicke` 0.05 … 0.9 relativ). `teile` ganzzahlig 3 … 128 (`LaufzeitAnanas: teile muss zwischen 3 und 128
  liegen, nicht 2.`). Eigene Form: `punkte` Blech aus Zahlen (Länge durch 3 teilbar, 3 … 65 536 Punkte), `dreiecke` Blech aus Ganzzahlen
  (Länge durch 3 teilbar, ≥ 1 Dreieck, Indizes 0 … n − 1, Vorderseite gegen den Uhrzeigersinn) – Texte
  `LaufzeitAnanas: Form braucht Punkte als Blech [x1, y1, z1, …] (Länge durch 3 teilbar).`,
  `LaufzeitAnanas: Form braucht Dreiecke als Blech von Punkt-Nummern (Länge durch 3 teilbar).`,
  `LaufzeitAnanas: Punkt 7 gibt es nicht – die Form hat 4 Punkte.`; `glatt: ja` = gemittelte Normalen.
- **Bildchen:** `zeilen` = nicht leeres Blech aus Texten; Breite = längste Zeile (kürzere durchsichtig aufgefüllt), höchstens 256 × 256
  (`LaufzeitAnanas: Ein Bildchen darf höchstens 256 × 256 Pixel haben.`); `.`/Leerzeichen durchsichtig, Standardzeichen
  `w s g o t r p b l m e k a y h u v` = Palette in obiger Reihenfolge, `farben` (Speisekarte Zeichen → Farbe) hat Vorrang; unbekannt →
  `LaufzeitAnanas: Das Zeichen 'x' hat im Bildchen keine Farbe.`
- Ressourcen werden beim Erzeugen kopiert und an die Engine übergeben (IDs ab 1, gemeinsam für Formen und Bildchen).
- **Bilddateien (K-145, K-147; Vorbacker PD1, Interpreter PD2, Laufzeit/Host PA2 umgesetzt, offen PD3 Glut):** statisch `Bildchen.laden(pfad)` lädt ein PNG oder JPEG
  aus der Kiste (§11.2) als `Bildchen` (`breite()`/`hoehe()` = Originalgröße, Textform `Bildchen(<b>×<h>)`, ID aus demselben Zähler) –
  überall verwendbar, wo ein Bildchen steht (`Bild`, `Animation`, `Rahmen`, `Koerper.bild`). Gleicher Pfad → **dasselbe** Bildchen
  (keine neue Ressource). Prüfreihenfolge: Argument kein Text → `TypAnanas: Bildchen.laden() braucht einen Text für 'pfad', nicht 5.` →
  vor `neu Herd` → `Erst braucht es einen Herd …` (§18.1) → `LaufzeitAnanas: Die Datei "<pfad>" liegt nicht in der Kiste.` →
  `LaufzeitAnanas: <pfad> ist kein lesbares Bild (PNG oder JPEG).` bzw. `LaufzeitAnanas: <pfad> ist zu groß (2400 × 800) – höchstens
  2048 × 2048 Pixel.` Die Bildfehler kommen erst beim Laden (ein nie geladenes kaputtes Bild stört nicht); eine Datei ohne
  Bild-Endung (`.png`/`.jpg`/`.jpeg`) hat keinen Teigling und ist ebenso „kein lesbares Bild“. Ein fehlgeschlagenes Laden verbraucht
  keine ID und wird beim nächsten Aufruf wiederholt. In Stücken einer `brigade`
  wirft es wie alle Herd-Methoden; für die Herd-Erkennung vor dem Start zählt `Bildchen.…` wie `neu Bildchen`.
- **Vorbacken:** PNG/JPEG sind nur Eingabe. Vor dem Start wird **jedes** Bild der Kiste zu einem **Teigling** vorgebacken (RGBA8 nicht
  vormultipliziert + Mipmaps, festes Format und Rechenwege, K-147) – mit demselben Vorbacker `teigling.wasm` in allen Motoren, daher
  bitgleich; ob aus einem Cache oder neu, ändert nie das Ergebnis. Text-Bildchen bleiben unverändert (Atlas, ≤ 256 × 256).
  **Teigmenge** = Summe der Teigling-Längen verschiedener Quelldateien (gleiche Bytes unter zwei Pfaden zählen einmal, Fehler-Teiglinge
  nicht) ≤ 67 108 864 Bytes (64 MiB), sonst vor dem Start `PizzaFehler P0020: Die Bilder sind zusammen zu groß für den Ofen (85,4 MB vorgebacken,
  höchstens 64 MB).` (MB = Bytes / 1 048 576, eine Nachkommastelle aufgerundet, Dezimalkomma). Fehlt der Vorbacker bei einem Projekt mit
  Bildern → `{ typ: "fehler", code: "HOST", art: "intern", text: "PizzaFehler HOST: Der Vorbacker fehlt (teigling.wasm).", datei: null,
  zeile: null, spalte: null }`, Exit 2 (wie der fehlende Herd-Kern). Darstellung: Vergrößern pixelscharf (nächster Nachbar),
  Verkleinern trilinear über die Mipmaps; Pixel wie immer mit Toleranz (K-129).
- **Modelle (H-K16, K-161; HERD.md §13.3):** statisch `Modell.laden(pfad)` lädt ein glTF-2.0-Modell (`.glb` oder `.gltf`; Puffer und
  Bilder eingebettet, als `data:`-URI oder als Dateien neben dem Modell, relativ zu ihm) aus der Kiste als `Modell` (eigene ID im Kern,
  Textform `Modell(<pfad>)`). Gleicher Pfad → **dasselbe** Modell. Prüfreihenfolge wie `Bildchen.laden`: kein Text →
  `TypAnanas: Modell.laden() braucht einen Text für 'pfad', nicht 5.` → vor `neu Herd` → `Erst braucht es einen Herd …` →
  `LaufzeitAnanas: Die Datei "<pfad>" liegt nicht in der Kiste.` → die Meldung des Vorbackers mit dem Pfad davor:
  `<pfad> ist kein lesbares Modell (glTF 2.0).` · `<pfad> braucht die Erweiterung KHR_draco_mesh_compression – die kann der Herd
  nicht.` · `<pfad> ist zu groß (612 000 Ecken) – höchstens 500 000 Ecken.` (ebenso Dreiecke, Knoten, Materialien, Bilder, Häute,
  Gelenke, Folgen) · `<pfad> (Bild 3) ist zu groß (2400 × 800) – höchstens 2048 × 2048 Pixel.` bzw. `… (Bild 3) ist kein lesbares Bild
  (PNG oder JPEG).` · `<pfad> braucht die Datei <uri> – die liegt nicht in der Kiste.` Eine Datei ohne Modell-Endung ist „kein lesbares
  Modell“. `neu Modell(…)` → `RohlingAnanas: 'Modell' kann man nicht mit neu backen.`
  - `herd.modell(m, x = 0, y = 0, z = 0)` → neues 3D-Wurzel-Teil an (x, y, z); darunter ein Teil je glTF-Knoten der Standardszene
    (Tiefensuche in Dateireihenfolge → feste Teil-IDs) mit Lage aus Lage/Drehung/Größe des Knotens (Quaternion → `drehung`/`neigung`/
    `rollen`; `matrix`-Knoten werden zerlegt, Scherung geht verloren, eine Spiegelung landet in `groesseX`) und der Komponente
    `Etikett` (Name des Knotens); `Koerper` je Dreiecks-Primitive (mehrere Primitiven eines Knotens als Kind-Teile ohne Etikett), Lichter
    aus `KHR_lights_punctual` als `Licht` (Punkt, Spot; Richtungslichter entfallen – die Sonne ist `herd.sonne()`). Kein Modell →
    `TypAnanas: modell() braucht ein Modell für 'modell', nicht "x".` Mehr Kopien: `herd.modell` erneut oder `kopie()`.
  - **Beläge:** je Material ein Teil mit `Belag` (+ `Etikett` = Materialname) unter einer ruhenden `Vorlage`-Wurzel, einmal je Modell
    beim Laden angelegt und von allen Kopien geteilt (`m.belaege()`): `baseColorFactor` (linear) → `farbe` (sRGB, bei `BLEND`/`MASK`
    mit Deckkraft), Grundfarb-Bild → `bild`, `metallicFactor` → `metall`, 1 − `roughnessFactor` → `glanz`, `modell` pbr,
    `emissiveFactor` → `leuchten` (größter Anteil) und `KHR_materials_emissive_strength` → `strahlen`; Normal- und
    Metall/Rauheit-Bild → `relief` (Normale x, y; Rauheit) bei REPEAT-Abtaster und UV außerhalb 0 … 1 → `kachel` 1. Eckfarben
    (`COLOR_0`) ohne Grundfarb-Bild backt der Vorbacker in ein Paletten-Bild. Gleiche Bilder mehrerer Modelle liegen einmal im Kern.
  - `m.namen()` (Knotennamen ohne leere, Tiefensuche), `m.folgen()` (Animationen, ab H-K23a), `m.belaege()`, `m.breite()`/`hoehe()`/
    `tiefe()` (Hülle der Ruhelage in Einheiten; 1 glTF-Meter = 1 Einheit, +y oben, Vorderseite +z).
  - **Vorbacken:** jedes Modell der Kiste wird vor dem Start zu einem **Modellteig** vorgebacken (gleicher Vorbacker `teigling.wasm`,
    bitgleich; Schlüssel SHA-256 des Quellpakets aus Modell und benutzten Nachbardateien). Modelle zählen zur **Teigmenge** (eingebettete
    Bilder je Quelle einmal, auch gegenüber gleichen Bilddateien); mit Modellen heißt P0020 `Die Bilder und Modelle sind zusammen zu groß
    für den Ofen (…)`.

### 18.6 Komponenten (v1 und Ausbau)

| Name (Raum) | Felder (Standard) | System / Wirkung |
|---|---|---|
| `Rechteck` (2D) | `breite` 10, `hoehe` 10, `farbe` weiss, `rundung` 0, `umriss` 0 | gefüllt bzw. nur Umriss dieser Dicke |
| `Kreis` (2D) | `radius` 10, `farbe` weiss, `umriss` 0 | |
| `Text` (2D) | `inhalt` "", `groesse` 16, `farbe` ofen, `ausrichtung` links (`links|mitte|rechts`) | eingebettete Schrift, Zeichenvorrat druckbares ASCII + `ÄÖÜäöüß€°·–—„“‚‘…×÷` (sonst `?`) |
| `Bild` (2D) | `bildchen` karton, `groesse` 1 (Pixel je Bildchen-Pixel), `farbe` weiss (Tönung), `spiegeln` nein | pixelscharf |
| `Koerper` (3D) | `form` karton, `farbe` weiss, `glanz` 0.3, `leuchten` 0, `bild` karton (Textur), `schatten` ja (wirft Schatten), `belag` karton (Teil mit geteiltem `Belag`, ab H-K2), `strahlen` 1 (0 … 1000, Faktor auf `leuchten`; Nachtragsfeld, Stimmung) | Zeigt `belag` auf ein Teil mit `Belag`, gelten dessen `farbe`, `glanz`, `leuchten` und `bild` statt der eigenen (die eigenen Werte bleiben erhalten); `belag` karton, Teil entfernt oder ohne `Belag` → die eigenen, kein Fehler. `belag` ist ein Nachtragsfeld (K-149): solange karton, ändert es den Szenen-Hash nicht |
| `Licht` (3D) | `art` punkt (`punkt|sonne`), `farbe` weiss, `staerke` 1, `reichweite` 10, `schatten` ja (nur Sonne), `kegel` 0 (Grad, 0 … 90), `kegelRand` 0.25 (0 … 1), `schattenGuete` aus (`aus|grob|mittel|fein`), `schattenWeich` 1 (0 … 4), `kaskaden` 1 (1 … 4, nur Sonne), `schattenWeite` 0 (≥ 0, nur Sonne) | eine Sonne (die mit der kleinsten ID). Punktlicht: wirkt bis `reichweite` (Abfall (1 − d/reichweite)²). **Spot** bei `kegel` > 0: halber Öffnungswinkel, Richtung = −z des Teils in Weltlage (wie die Kamera; `schaueAuf` richtet ihn aus), weicher Rand über den Anteil `kegelRand` des Winkels. **Viele Lichter** (Clustered Forward): wirken bis 8 Punktlichter ohne Spot, gilt v1 (die 8 nächsten zur Kamera, Bildpaket unverändert); sonst wirken alle sichtbaren (Kugel aus Lage und Reichweite im Sichtkörper), höchstens 4096 je Bild (die nächsten zur Kamera, dann ID) und höchstens 255 je Zelle der Sicht (16 × round(16 · hoehe/breite) Kacheln × 24 Tiefenscheiben). **Schatten** (H-K18, K-160): `schatten` ist der Hauptschalter, `Koerper.schatten` bestimmt die Werfer. Die Sonne wirft immer (v1); Punktlichter und Spots nur mit `schattenGuete` ≠ aus (256/512/1024 Texel je Würfelseite bzw. Kegel), höchstens 8 je Bild – die Engine wählt wirksame (Kugel im Sichtkörper) nach Abstand Kamera – Lichtrand, dann ID; ein Punktlicht = 6 Würfelseiten, ein Spot bis 60° = 1 Kachel (darüber 6); was nicht in den Atlas (4096² Texel) passt, wirft still keinen Schatten. `schattenWeich` = Weichheit des Zeltfilters (1 = 5 × 5 Texel wie v1, 0 = hart, bis 4). Sonne: `kaskaden` 2 … 4 teilt die Sicht in Stufen (je 2048², praktische Teilung), `schattenWeite` > 0 = Reichweite der Sonnenschatten ab der Kamera (0 = wie v1: sichtbare Szene, höchstens 60, Nebel). `kegel`, `kegelRand` und die vier Schattenfelder sind Nachtragsfelder (K-149) |
| `Kamera` (3D) | `sicht` 60 (Grad, 1 … 170), `nah` 0.1, `fern` 500, `aktiv` ja | es zeichnet die aktive Kamera mit der kleinsten ID |
| `Bewegung` (beide) | `tempoX`/`tempoY`/`tempoZ` 0 (Einheiten/s), `beschleunigungX`/`Y`/`Z` 0 (Einheiten/s²), `drehtempo` 0 (Grad/s, um die Hochachse bzw. in 2D um die Bildmitte), `daempfung` 0 (0 … 1, Anteil Tempoverlust je Sekunde) | je Takt: Tempo += Beschleunigung·dt, Tempo ·= (1 − daempfung)^dt, Lage += Tempo·dt |
| `Animation` (2D, braucht `Bild`) | `bilder` [] (Blech aus Bildchen), `proSekunde` 8, `schleife` ja, `laeuft` ja, `nummer` 1 | setzt `Bild.bildchen` auf `bilder[nummer]`; am Ende ohne Schleife `laeuft` → nein |
| `Partikel` (2D) | `rate` 30 (je s), `lebensdauer` 1 (s), `tempo` 80, `richtung` 270 (Grad, 0 = rechts, im Uhrzeigersinn), `streuung` 360, `schwerkraft` 0, `groesse` 6, `groesseEnde` 0, `farbe` senf, `farbeEnde` tomate, `aktiv` ja, `saat` 0 (0 = Teil-ID) | Teilchen leben im Kern (eigener Zufall, deterministisch), höchstens 10 000 je Emitter |
| `Linie` (2D) | `zuX` 100, `zuY` 0 (Endpunkt relativ zum Teil), `dicke` 2 (≥ 0), `farbe` ofen, `rund` nein (runde Enden) | Strecke von der Lage des Teils zum Endpunkt; `rund` verlängert sie je Ende um `dicke`/2 (Halbkreis um den Endpunkt); Länge 0 oder `dicke` 0 zeichnet nichts; Hülle für `trifft`: das gedrehte Rechteck der Strecke (in Weltlage achsenparallel umschlossen) |
| `Rahmen` (2D) | `bildchen` karton, `kante` 4 (Ganzzahl, Bildchen-Pixel der Ecken), `breite` 64, `hoehe` 32 (Größe im Spielfeld, Mitte = Lage), `groesse` 1 (Bildschirmpixel je Bildchen-Pixel der Ecken), `farbe` weiss (Tönung) | 9-Slice: Ecken fest und pixelscharf, Kanten und Mitte gestreckt; `kante` wird auf (Bildchen-Seite − 1)/2 begrenzt (eine Mitte bleibt), Ecken höchstens halb so groß wie die Tafel (dann gestaucht); Hülle für `trifft`: Rechteck `breite` × `hoehe` |
| `Funken` (3D) | `rate` 30 (je s, 0 … 100 000), `lebensdauer` 1 (s), `tempo` 2 (Einheiten/s), `richtungX` 0, `richtungY` 1, `richtungZ` 0 (Achse des Kegels in den Achsen des Teils; Länge 0 = nach oben), `streuung` 30 (halber Öffnungswinkel in Grad, 0 … 180), `schwerkraft` 0 (Einheiten/s² nach −y), `groesse` 0.2, `groesseEnde` 0 (Durchmesser in Einheiten), `farbe` senf, `farbeEnde` tomate, `mischung` leuchtend (`leuchtend`\|`deckend`), `weltlage` ja, `aktiv` ja, `saat` 0 (0 = Teil-ID); Regen (Nachtragsfelder): `streckung` 0 (s, 0 … 10), `licht` 0 (0 … 1), `volumen` 0 (≥ 0), `aufschlag` nein, `boden` 0, `spritzer` 3 (Ganzzahl 0 … 16), `regen` nein; Aufprall (Nachtragsfelder, H-K25): `kollision` keine (`keine`\|`boden`\|`welt`), `aufprall` vergehen (`vergehen`\|`abprallen`\|`liegen`), `abprall` 0.3 (0 … 1) | 3D-Teilchen leben im Kern (eigener Zufall, deterministisch), höchstens 10 000 je Emitter; Ausstoß gleichmäßig im Kegel, Tempo ±25 %; kamerazugewandt gezeichnet, Tiefe getestet, nicht geschrieben, im Nebel; `leuchtend` = additiv, `deckend` = gemischt (von hinten nach vorn sortiert); `weltlage` nein = Teilchen leben im Raum des Teils (Lage, Drehung und Größe des Teils wirken auf ihre Bahnen, nicht auf ihre Größe), ja = sie bleiben, wo sie entstanden. **Regen:** `streckung` > 0 zeichnet jedes Teilchen als Strich entlang seiner Geschwindigkeit (Kopf = Lage des Teilchens, Länge = Tempo × `streckung`, Breite = Größe, mindestens etwa ein Gerätepixel – dünner wird er blasser), zur Kamera um die eigene Achse gedreht, zum Schwanz hin auslaufend; `licht` mischt die Farbe zur beleuchteten Farbe (Umgebung, Nebel- bzw. Stimmungs-Nebelfarbe, Sonne und Punktlichter bzw. die Lichter der Zelle des Teilchens mit Abfall und Kegel, je Licht gewichtet mit Vorwärtsstreuung: gegen das Licht bis 4-fach); `volumen` > 0 stößt gleichmäßig in einem waagerechten Quadrat der halben Kantenlänge `volumen` um das Teil aus (x, z in Weltachsen bzw. in den Achsen des Teils bei `weltlage` nein), wer es waagerecht verlässt, wird um die Kantenlänge auf die Gegenseite versetzt (Spritzer nicht); `aufschlag` ja: Teilchen enden, sobald ihr y unter `boden` fällt (Koordinaten der Teilchen), jeder Tropfen wirft `spritzer` Spritzer (Kegel 50° um +y, Tempo 16 % des Aufschlags ±50 %, Lebensdauer 0,24 s ±30 %, Schwerkraft 9,81, Größe 70 %, Farbe über ihr Leben wie die Tropfen, höchstens bis zur Teilchengrenze); `regen` ja: Rate × `regen` der geltenden `Stimmung` (keine → × 1). **Aufprall** (H-K25): `kollision` boden = waagerechte Ebene y = `boden` (Koordinaten der Teilchen), welt = jedes Teilchen als Strecke seines Wegs im Takt gegen alle festen 3D-Fühler-Formen (Kasten, Kugel, Kapsel, Netz; wach, sichtbar, nicht Auslöser, nicht `Figur`, nicht dynamischer `Schwung`, nicht das eigene Teil) und das Gelände (Fühler `netz`), Stand nach dem vorigen Takt; bei `weltlage` nein wird der Weg in Welt geprüft; erster Treffer, Gleichstand → kleinere Teil-ID. Danach `aufprall`: vergehen; abprallen = Tempo senkrecht zur Fläche × −`abprall` (unter 0,1 Einheiten/s → 0, gleitet), entlang der Fläche bleibt es, 2 mm über der Fläche weiter; liegen = bleibt 2 mm über dem Treffpunkt ohne Tempo, bis seine Lebensdauer um ist (läuft nicht mit dem Volumen um; wird `kollision` wieder keine, fällt es weiter). Je Aufprall mit Normaltempo ≥ 1 Einheit/s `spritzer` Spritzer (wie oben, Kegel um die Flächennormale, Tempo aus dem ganzen Aufpralltempo), höchstens 1 000 neue je Takt und Emitter; Spritzer prallen nicht, sie vergehen. `kollision` keine mit `aufschlag` ja = die Regel oben (unverändert). Alles Standard = wie zuvor; keine Hülle |
| `Gleiten` (beide) | `was` x (`x`\|`y`\|`z`\|`drehung`\|`neigung`\|`rollen`\|`groesse`), `nach` 0, `dauer` 1 (s, ≥ 0), `kurve` sanft (`linear`\|`sanft`\|`rein`\|`raus`\|`federnd`\|`huepfend`), `schleife` einmal (`einmal`\|`wiederholen`\|`pendeln`), `laeuft` ja | Tween einer Lage-Größe (relativ zu den Eltern): Startwert = Wert im ersten laufenden Takt, Zeit = Summe der Takte; `einmal` endet exakt auf `nach` und setzt `laeuft` → nein (wieder `ja` = neuer Lauf vom aktuellen Wert), `wiederholen` beginnt jede Runde neu, `pendeln` läuft in `dauer` hin und in `dauer` zurück; wird `nach` oder `was` während des Laufs geändert, startet es vom aktuellen Wert neu; `dauer` 0 = sofort am Ziel; `groesse` setzt alle Achsen; `z`/`neigung`/`rollen` wirken nur in 3D (in 2D ohne Wirkung, kein Fehler); Kurven: sanft 3t² − 2t³, rein t², raus 1 − (1 − t)², federnd schwingt über das Ziel hinaus, huepfend prallt ab; je Teil ein Gleiten – mehrere Größen zugleich: `Ablauf` oder Kind-Teile |
| `Ablauf` (beide) | `zeiten` [] (Blech aus Zahlen ≥ 0, s, aufsteigend), `xWerte`, `yWerte`, `zWerte`, `drehWerte`, `groesseWerte` [] (Blech aus Zahlen), `kurve` linear (`linear`\|`sanft`), `schleife` ja, `tempo` 1, `zeit` 0 (≥ 0), `laeuft` ja | Keyframes auf der Lage: zur Zeit `zeiten[i]` gilt der i-te Wert jeder nicht leeren Werteliste (leer = nicht animiert; kürzer als `zeiten` → der letzte Wert gilt weiter), dazwischen linear bzw. sanft; vor dem ersten Schlüssel der erste Wert, gleiche Zeiten = Sprung; `zeit` += `tempo`·dt (negativ = rückwärts); Länge = letzter Eintrag von `zeiten`; mit `schleife` von vorn, sonst Halt am Ende bzw. bei 0 (`laeuft` → nein); `zeit` setzen springt (auch angehalten wird der neue Stand einmal angewendet); `zWerte` nur in 3D; `groesseWerte` setzt alle Achsen |
| `Belag` (3D) | `farbe` weiss, `glanz` 0.3, `leuchten` 0 (je 0 … 1), `bild` karton (Textur), `strahlen` 1 (wie `Koerper.strahlen`, Nachtragsfeld); Material (Nachtragsfelder): `relief` karton (Bildchen: R, G = Normale x, y im OpenGL-Sinn, B = Rauheit), `kachel` 0 (0 … 10000; 0 = aus), `abbildung` uv (`uv`\|`welt`), `modell` klassisch (`klassisch`\|`pbr`), `metall` 0, `nass` 0 (je 0 … 1) | geteiltes Material (H-K2), meist an einem eigenen Teil (`herd.raum()`); zeichnet selbst nichts, kein System, keine Hülle. Jeder `Koerper`, dessen `belag` auf dieses Teil zeigt, nimmt alle vier Werte (auch `bild` karton); ein Wert ändern ändert alle diese Körper. Gilt auch, wenn das Belag-Teil unsichtbar ist; `ohne("Belag")` oder `entferne()` → die Körper zeigen wieder ihre eigenen Werte. `Belag b = herd.raum().mit(neu Belag(farbe: "tomate")); herd.koerper(f).koerper().setzeBelag(b.teil());` **Material** (nur über den Belag): `kachel` > 0 wiederholt `bild` und `relief` – `uv`: `kachel`-mal über die Netz-UV, `welt`: in Weltmaß nach der größten Komponente der Normale (Kantenlänge einer Kachel = `kachel`; oben/unten in x, z, Seiten in z bzw. x und −y). Wiederholt werden eigene Texturen (`Bildchen.laden`) mit quadratischer Zweierpotenz-Kante (trilinear, anisotrop), Atlas-Bildchen pixelscharf. `relief` nur aus eigenen Texturen (sonst ohne Wirkung): Normale aus R, G (z = √(1 − x² − y²)), Tangenten aus der Abbildung bzw. den Bildschirmableitungen. `modell` pbr: GGX mit Smith-Sichtbarkeit und Schlick-Fresnel, Rauheit = 1 − `glanz` bzw. Relief-B × 2(1 − `glanz`) (mindestens 0.045; für Punktlichter 0.1), Grundreflexion 0.04 bzw. die Farbe bei `metall`, Halbkugel-Umgebung diffus und gespiegelt. `nass`: Flächen dunkler (× 1 − 0.3 `nass`) und glatter (× 1 − 0.45 `nass`); auf Flächen nach oben Pfützen aus Rauschen in Weltlage (Anteil wächst mit `nass`; glatt, eben, dunkel). Gilt für die `Koerper` mit diesem Belag; alles Standard = Bild und Licht wie zuvor (Bildpaket byte-gleich) |
| `Fuehler` (beide) | `form` auto (`auto`\|`kreis`\|`rechteck`\|`kasten`\|`kugel`\|`kapsel`\|`netz`), `breite`, `hoehe`, `tiefe`, `radius` 0 (≥ 0; 0 = aus der Hülle), `versatzX`/`versatzY`/`versatzZ` 0, `gruppe` 1 (Ganzzahl 1 … 32), `maske` 4294967295 (Ganzzahl 0 … 4294967295, Bit `gruppe − 1` = spürt diese Gruppe), `ausloeser` ja; **Lesefelder** `beruehrt`, `betreten`, `verlassen` (Bleche aus Teilen, nach ID), `anzahl` (Ganzzahl) | Kollider (K-150): läuft im Nachlauf jedes Takts (nach allen Systemen, das Programm liest im nächsten Takt); ein Paar zählt, wenn beide Teile einen angehängten Fühler haben, im gleichen Raum liegen, sichtbar sind, eine Form haben und einander beidseitig spüren (`maske` von A enthält die Gruppe von B und umgekehrt); Ränder zählen. `beruehrt` = alle überlappenden Fühler-Teile, `betreten` = neu gegenüber dem Vortakt, `verlassen` = nicht mehr berührt (entfernte Teile fallen heraus und erscheinen nicht in `verlassen`; ein kopierter oder umgehängter Fühler beginnt mit leerem Vortakt), `anzahl` = Länge von `beruehrt` beim Takt. Formen in Weltlage achsenparallel wie `trifft`: `auto` = Hülle der ersten Komponente mit Hülle (ohne → keine Form), `kreis`/`kugel` = Kreis bzw. Kugel um Lage + Versatz mit `radius` × größter Maßstab (`radius` 0 → um die Hülle), `rechteck`/`kasten` = Box `breite` × `hoehe` (× `tiefe`) um Lage + Versatz, gedreht umschlossen (jede Seite 0 nimmt die Hülle in dieser Weltachse); die Form folgt dem Raum des Teils (`kreis` an einem 3D-Teil = Kugel, `kasten` an einem 2D-Teil = Rechteck); Versatz dreht und skaliert mit dem Teil; `kapsel` (H-K17) = Kasten um eine Kapsel entlang der y-Achse des Teils (Durchmesser 2 · `radius`, Gesamthöhe `hoehe`; fehlt eines, die Hülle), `netz` (H-K17) = die Hülle – für die Meldungen bleibt alles achsenparallel, gedreht und genau rechnet nur die Physik (`Schwung`); `ausloeser` nein = fest für die Physik (`Wucht`, `Schwung`), sonst ohne Wirkung; keine Hülle für `trifft` |
| `Blick` (2D) | `zoom` 1 (0.05 … 20), `aktiv` ja, `festAb` 1000 (Ganzzahl), `grenzeLinks`, `grenzeOben`, `grenzeRechts`, `grenzeUnten` 0; **Lesefelder** `mausX`, `mausY` (ab H-K12) | 2D-Kamera (H-K1): die Weltlage des Teils ist die Mitte der Sicht, seine Drehung (samt Eltern) dreht die Sicht, `zoom` vergrößert (die Größe des Teils zählt nicht); es gilt der aktive Blick mit der kleinsten Teil-ID (sichtbar oder nicht), ohne aktiven Blick ist das Spielfeld die Welt (Bild wie bisher). Teile mit `ebene ≥ festAb` bleiben fest im Spielfeld (HUD; die Ebene vererbt sich nicht – jedes HUD-Teil braucht seine eigene). Sind nicht alle Grenzen 0, wird die Mitte der Sicht so geklemmt, dass die (gedreht umschlossene) Sicht im Rechteck `grenzeLinks` … `grenzeRechts` × `grenzeOben` … `grenzeUnten` bleibt; ist es kleiner als die Sicht, steht sie in seiner Mitte; eine Achse ohne Ausdehnung (z. B. `grenzeOben` = `grenzeUnten` = 0 im Seitenscroller) bleibt frei. Geklemmt wird nur das Bild, die Lage des Teils bleibt. `herd.mausX()`/`mausY()`, `trifft` und `Fuehler` bleiben in Spielfeld- bzw. Welt-Koordinaten; `mausX`/`mausY` des Blicks = die Maus in Weltkoordinaten unter **seiner** Sicht (auch inaktiv; loser Blick → Spielfeld), berechnet beim Lesen aus der Eingabe des Takts – Nachtragsfelder, die den Szenen-Hash nie ändern (K-151); kein System, keine Hülle |
| `Leine` (beide) | `ziel` karton (Teil), `abstandX`, `abstandY`, `abstandZ` 0, `weich` 0 (0 … 0.999), `totzone` 0 (≥ 0), `schaue` nein | Folgekamera (H-K1), läuft im Nachlauf jedes Takts (nach allen Systemen, sieht also die Bewegung desselben Takts): Ziel = Weltlage von `ziel` + Abstand (Weltachsen; `abstandZ` nur in 3D); `weich` 0 = starr genau aufs Ziel, sonst rückt das Teil je Takt um den Anteil `1 − weich^dt` des Rests vor (`weich` = Anteil, der nach einer Sekunde übrig ist); `totzone` > 0: ist das Ziel näher, bleibt das Teil stehen, sonst zieht es bis auf `totzone` heran; `schaue` (nur 3D) richtet das Teil danach wie `schaueAuf` auf die Lage des Ziels (ohne Abstand). Geschrieben wird die Lage des Teils (für Teile ohne Eltern gedacht, wie `schaueAuf`). `ziel` karton, entfernt, das Teil selbst oder in einem anderen Raum → keine Wirkung, kein Fehler. `herd.kamera().mit(neu Leine(ziel: auto, abstandY: 3, abstandZ: 8, weich: 0.05, schaue: ja));` |
| `Wucht` (2D, braucht `Fuehler`) | `art` dynamisch (`dynamisch`\|`kinematisch`\|`fest`), `masse` 1 (≥ 0.001), `tempoX`/`tempoY` 0 (Pixel/s), `schwerkraft` 0 (Pixel/s² nach unten; 1200 fühlt sich nach Spiel an), `daempfung` 0, `abprall` 0, `reibung` 0.2 (je 0 … 1), `stossX`/`stossY` 0; **Lesefeld** `amBoden` (diavolo) | 2D-Physik (K-150, Takt-System nach `Bewegung`/`Gleiten`/`Ablauf`, vor dem Fühler-Nachlauf): Form = Fühler am selben Teil, Kontakte nur zwischen Fühlern mit `ausloeser: nein` (ein solcher Fühler **ohne** Wucht ist fest: Wand, Boden), Masken wie beim Fühler; nur Kreise und achsenparallele Rechtecke (gedrehte umschlossen), **keine Drehung** (Kreise gleiten statt zu rollen). `dynamisch`: tempo += stoss / masse, tempoY += schwerkraft · dt, tempo ·= (1 − daempfung)^dt, danach Kontakte; `kinematisch`: fährt mit tempo, schiebt, lässt sich nicht schieben (keine Schwerkraft, kein Stoß); `fest`: bewegt sich nie. `stoss` wirkt einmal im nächsten Takt und ist danach 0. Löser: feste 4 Iterationen Impuls (Abprall = größerer Wert beider, erst ab 40 Pixel/s Annäherung; Reibung √(a · b), fester Fühler ohne Wucht: abprall 0, reibung 0.2) und 4 Iterationen Positionskorrektur, Kontakte nach (kleinere ID, größere ID). `amBoden` = im letzten Takt nach oben gestützt (Normale mehr als 60° von der Waagerechten). Kein Schlafen, kein Schutz gegen Durchtunneln (Tempo je Takt unter der halben Ausdehnung halten, Wände dick); mit `Bewegung` am selben Teil wirken beide (Bewegung zuerst) – besser nur eines |
| `Vieleck` (2D) | `punkte` [] (Blech aus Zahlen `[x1, y1, x2, y2, …]` relativ zum Teil), `farbe` weiss, `umriss` 0 (≥ 0) | gefülltes einfaches Vieleck (H-K3b): die Punkte werden der Reihe nach verbunden, der letzte mit dem ersten; einspringende Ecken sind erlaubt. Ungültig – ungerade Länge, weniger als 3 oder mehr als 256 Punkte, nicht endliche Werte, Fläche 0, sich kreuzende oder berührende Kanten (doppelte Folgepunkte und Punkte auf einer Geraden mit ihren Nachbarn zählen nicht) – wird **ohne Fehler nicht gezeichnet**. `umriss` > 0: nur ein Rand dieser Dicke nach innen (Gehrung an den Ecken, höchstens 4 Dicken weit). Der Kern zerlegt die Punkte deterministisch in Dreiecke (Ohrenschneiden ab Punkt 0, neu nur bei geänderten Punkten, im Nachlauf). Hülle: umschließendes Rechteck aller Punkte (auch wenn nicht gezeichnet; keine bei leerer Liste) |
| `Gelaende` (3D) | `hoehen` [] (Blech aus Zahlen, zeilenweise `spalten · zeilen` Werte), `spalten` 32, `zeilen` 32 (Ganzzahl 2 … 256), `weite` 1 (≥ 0.001, Punktabstand), `farbe` basilikum, `glanz` 0.1 (0 … 1), `bild` karton (Textur), `schatten` ja | Gelände aus einer Höhenkarte (H-K11a), Takt-System: baut im Takt ein Netz, wenn sich `hoehen`, `spalten`, `zeilen` oder `weite` seit dem letzten Bau geändert haben (Vergleich der Werte; dieselben Werte erneut setzen baut nicht neu) – vor dem ersten Takt gibt es kein Netz und keine Hülle. Punkt (Spalte i, Zeile j, ab 0) bei x = (i − (spalten − 1)/2) · weite, z = (j − (zeilen − 1)/2) · weite (Zeile 0 hinten bei −z), y = Höhe; fehlende Werte = 0, überzählige ohne Wirkung, nicht endliche = 0. Je Zelle zwei Dreiecke (feste Diagonale), Vorderseite oben, glatte Normalen (gemittelt wie `Form.eigene(…, glatt: ja)`), UV (i/(spalten − 1), j/(zeilen − 1)): `bild` liegt einmal über der ganzen Fläche (Atlas-Bildchen oder `Bildchen.laden`). Gezeichnet wie `Koerper` (deckend, `leuchten` 0, `schatten` = wirft Schatten). Jeder Neubau legt eine neue Form-Ressource an (v1 gibt Ressourcen nie frei – nicht je Takt umformen); eine Kopie teilt das Netz, bis sich ihre Werte ändern. Hülle für `trifft`: Kasten um das Netz. Farbverlauf nach Höhe: später |
| `Vorlage` (beide) | `name` "" (nur Anzeige) | Prefab (H-K8): ein Teil mit Vorlage **ruht** samt allen Kindern – keine Systeme (`Bewegung`, `Animation`, `Partikel`, `Funken`, `Gleiten`, `Ablauf`, `Leine`, `Fuehler`, `Wucht`; Teilchen frieren ein, Fühler-Listen bleiben stehen), nicht gezeichnet, `trifft` → nein, kein Fühler/Körper für andere, eine `Kamera` bzw. ein `Blick` darin zählt nicht; Lage, Felder und `sichtbar()` bleiben lesbar und setzbar (`sichtbar()` zeigt das eigene Feld). `kopie()` einer Vorlage liefert ein **waches** Teil **ohne** Vorlage, sonst wie bisher (Kinder, Komponenten, Werte; Emitter mit `saat` 0 nehmen die neue Teil-ID; eine Vorlage an einem Kind bleibt in der Kopie). Die Kopie hängt am selben Eltern-Teil wie das Original: die Kopie eines Kindes einer Vorlage ruht also mit. `ohne("Vorlage")` weckt das Original, `haenge` an ein ruhendes Teil lässt ruhen, Lösen weckt. Kein System, keine Hülle |
| `Fliesen` (2D) | `bilder` [] (Blech aus Bildchen), `spalten` 16, `zeilen` 9 (Ganzzahlen 1 … 1024), `karte` [] (Blech aus Zahlen), `kachel` 32 (≥ 0, Spielfeldpixel je Kachel), `fest` [] (Blech aus Zahlen) | Kachelkarte (H-K10): Raster aus `spalten` × `zeilen` Kacheln, `karte` zeilenweise von oben (Eintrag `(zeile − 1) · spalten + spalte`); jeder Eintrag wird abgerundet, n ≥ 1 zeigt `bilder[n]` (ab 1, wie beim Blech), 0, negative und nicht endliche Werte sind leer, n größer als `bilder` bleibt unsichtbar, eine zu kurze Karte ist am Ende leer (ein Blech hat höchstens 65 536 Zahlen – größere Welten aus mehreren Rastern). Die **Lage des Teils ist die obere linke Ecke** des Rasters (anders als `Rechteck`/`Bild`); Drehung und Größe des Teils wirken aufs ganze Raster, jedes Bildchen wird auf `kachel` × `kachel` gestreckt (ungetönt), `kachel` 0 zeichnet nichts. Gezeichnet werden nur die Kacheln im sichtbaren Ausschnitt (mit aktivem `Blick` dessen Sicht, für `ebene ≥ festAb` das Spielfeld), Zeilen oben → unten, je Zeile links → rechts. Kacheln, deren Nummer in `fest` steht, sind für `Wucht` feste Rechtecke (abprall 0, reibung 0.2, Gruppe 1: es stoßen nur dynamische Körper, deren `maske` Gruppe 1 enthält); Seiten zu einer festen Nachbarkachel sind innen und schieben nie – an den Fugen hakt nichts. Gedrehte Raster: Kacheln achsenparallel umschlossen (K-150). Kacheln erscheinen nicht in `Fuehler.beruehrt`. Hülle für `trifft`/`Fuehler` (auto): das ganze Raster; kein System |
| `Kulisse` (beide) | `aktiv` ja, `name` "" (nur Anzeige) | Szenenwechsel (H-K9) als Teilbaum, den man an- und ausschaltet: mit `aktiv` nein **ruht** das Teil samt allen Kindern wie unter einer `Vorlage` – keine Systeme, nicht gezeichnet, `trifft` → nein, kein Fühler/Körper für andere; eine `Kamera`, ein `Blick` oder ein `Licht` darin zählt nicht (es zeichnet die wache Kamera bzw. der wache aktive Blick mit der kleinsten ID). `setzeAktiv(ja)` weckt den Teilbaum sofort, `setzeAktiv(nein)` lässt ihn sofort ruhen (auch mitten in `backe`); Werte, Lagen und `sichtbar()` bleiben erhalten. Mehrere Kulissen dürfen zugleich aktiv sein; verschachtelt ruht ein Teil, sobald eine Kulisse an ihm oder einem Vorfahren aus ist. `kopie()` kopiert die Kulisse mit (samt `aktiv`). Entladen: `entferne()`. Welt-Einstellungen (`hintergrund`, `himmel`, `umgebung`, `nebel`) bleiben global. Kein `herd.lade(…)`, keine Szenen-Dateien. Kein System, keine Hülle |
| `Himmelszelt` (3D) | `bilder` [] (Blech aus Bildchen: rechts, links, oben, unten, vorn, hinten), `oben` himmel, `horizont` mozzarella, `boden` teig, `sonnenscheibe` 0 (Grad, 0 … 90, 0 = aus), `sterne` 0 (0 … 1) | Skybox (H-K11b) an einem beliebigen 3D-Teil; es gilt das **wache** mit der kleinsten Teil-ID (Sichtbarkeit egal; ruhende unter einer `Vorlage` zählen nicht). Solange eines gilt, ersetzt es den Verlauf von `herd.himmel(…)`; ohne `herd.umgebung(…)` färbt `oben` das Umgebungslicht (Stärke 0.35). Prozedural: Verlauf `boden` (unter dem Horizont) → `horizont` → `oben` (Zenit) nach der Blickrichtung, Sonnenscheibe mit Schein in Richtung des Sonnenlichts (`herd.sonne()`, ohne Sonne (0.5, 1, 0.3); der Horizont schneidet sie ab), Sterne (`sterne` = Helligkeit, zum Horizont hin ausgeblendet). Seiten aus `bilder`: Würfelseiten +x, −x, +y, −y, −z (vorn = Blickrichtung der Standardkamera), +z, als aufgeklapptes Kreuz um `vorn` (Oberkante von `oben` grenzt an `hinten`, die von `unten` an `vorn`); Atlas-Bildchen und `Bildchen.laden`-Bilder, weich gefiltert (bilinear, verkleinert über die Mip-Stufen); die Deckkraft mischt über den prozeduralen Himmel; fehlende Seiten (kürzeres Blech, überzählige ohne Wirkung) bleiben prozedural, Sonne und Sterne nur dort. Kein System, keine Hülle. `unten` ist ein Schlüsselwort, daher heißt die Bodenfarbe `boden` |
| `Stimmung` (3D) | `belichtung` 1 (0.01 … 100), `bloom` 0 (0 … 4), `bloomSchwelle` 1 (0 … 100), `bloomWeite` 0.7 (0 … 1), `nebelDichte` 0 (0 … 10), `nebelHoehe` 0, `nebelAbfall` 0.25 (0 … 10), `nebelFarbe` #1c1a2a, `saettigung` 1 (0 … 2), `vignette` 0 (0 … 1), `koernung` 0 (0 … 1), `spiegelung` 0 (0 … 1), `spiegelHoehe` 0, `regen` 0 (0 … 1, Nachtragsfeld), `spiegelGuete` einfach (`einfach|voll`, Nachtragsfeld), `verdeckung` 0 (0 … 2), `verdeckungWeite` 0.5 (0.01 … 10), `bildspiegel` 0 (0 … 1) (alle drei Nachtragsfelder, H-K24) | Bildlook (Post-Processing-Volume) an einem beliebigen 3D-Teil; es gilt die **wache** mit der kleinsten Teil-ID (Sichtbarkeit egal). Solange eine gilt, rechnet die Glut die 3D-Szene linear in ein HDR-Ziel (ohne die sanfte Schulter von v1) und bildet erst im Abschluss ab: Farbe × `belichtung` + Bloom, ACES-Tonkurve, `saettigung`, `vignette`, `koernung` (je Bild anders), sRGB; 2D liegt unverändert darüber. **Bloom**: Anteil über `bloomSchwelle` (nach Belichtung, weiches Knie) in 6 Stufen verkleinert und mit dem Gewicht `bloomWeite` je Stufe zurückgemischt, × `bloom`. **Höhennebel**: Dichte(y) = `nebelDichte` · e^(−`nebelAbfall` · (y − `nebelHoehe`)), entlang des Blicks geschlossen integriert (Himmel bis `fern` der Kamera), mischt zu `nebelFarbe`; `herd.nebel` wirkt weiter. Leuchten über 1: `Koerper`/`Belag` `strahlen` (`leuchten` × `strahlen` > 1 → Farbe × diesem Wert, auch ohne Stimmung, dann aber auf ≤ 1 abgebildet). **Spiegelung** (`spiegelung` 0 … 1, `spiegelHoehe` 0): bei `spiegelung` > 0 zeichnet die Glut die Szene (Himmel und deckende Körper, nicht Durchsichtiges und Teilchen; was unter der Ebene liegt, entfällt) an der Ebene y = `spiegelHoehe` gespiegelt in ein Bild halber Größe; `Belag`-Flächen mit `modell` pbr, die nach oben zeigen und auf Höhe der Ebene liegen (±0,3), nehmen dieses Bild an derselben Bildschirmstelle (vom Relief verzerrt, mit der Rauheit unscharf), gewichtet mit Fresnel, Glätte (1 − Rauheit)² und `spiegelung`. Im Spiegelbild wirken die 8 nächsten Punktlichter (nicht die Zellen). **`spiegelGuete` voll** (H-K21): das Spiegelbild hat volle Größe und zeigt auch Durchsichtiges und `Funken`; es wirken alle Lichter (eine zweite Zellen-Tabelle für die gespiegelte Kamera), mit Punkt-/Spot- und Sonnenschatten; Körper, Teilchen und Lichter, die nur im Spiegel zu sehen sind, zählen als sichtbar (auch für die Schattenwahl); Flächen bis ±0,2 um die Ebene spiegeln voll (aus ab 0,45, z. B. Gehwege 0,15 über der Straße – eine Ebene für alles, das Bild ist dort um 2 · Höhenunterschied versetzt), Oberseiten niedriger Platten (bis 0,5 über der Ebene) fehlen im Spiegelbild, damit Pfützen auf ihnen die Szene dahinter zeigen. **Regen** (`regen` > 0): auf nassen, nach oben zeigenden pbr-Flächen (`Belag.nass` > 0) laufen Ringe (zwei Lagen Zellen, je Zelle alle 0,8 s ein Tropfen mit Wahrscheinlichkeit ~ `regen`) als Neigung der Normale – in Pfützen voll, sonst 30 % –, sie verzerren auch das Spiegelbild; an nassen Wänden laufen Rinnsale (glatter, dunkler) herab; `Funken` mit `regen` ja stoßen `rate` × `regen` aus. **Bildschirmraum** (H-K24): bei `verdeckung` oder `bildspiegel` > 0 zeichnet die Glut vorab die deckenden Körper ohne Kantenglättung in Tiefe, Normale und Glanz-Gewicht (auf allen Schnittstellen gleich). **Verdeckung** (SSAO, `verdeckung` > 0): je halbem Pixel 12 Abtastungen in der Halbkugel mit Radius `verdeckungWeite` (Welt), zweimal 1D weichgezeichnet; das Umgebungslicht (Halbkugel diffus und gespiegelt) deckender Körper wird mit (1 − Anteil)^`verdeckung` dunkler, direkte Lichter und Leuchten nicht. **Bildraum-Spiegelung** (SSR, `bildspiegel` > 0): glatte `Belag`-Flächen mit `modell` pbr spiegeln, was im Bild zu sehen ist (Strahl durch das Tiefenbild, höchstens 48 Schritte + 6 Halbierungen, unscharf nach Rauheit), gewichtet wie der Umgebungsglanz (Fresnel, Glätte²) × `bildspiegel`; was der Strahl nicht im Bild findet (Fehltreffer, Bildrand, Rückseiten), bleibt Umgebung bzw. planare Spiegelung. Auf der Spiegelebene von `spiegelung` hat die planare Spiegelung Vorrang, SSR spiegelt dort nicht. Durchsichtiges und `Funken` liegen darüber und spiegeln nicht. Ohne Float-Farbpuffer (WebGL2 ohne `EXT_color_buffer_float`) fällt nur die Bildraum-Spiegelung still aus. Kein System, keine Hülle |
| `Taster` (2D) | `inhalt` "", `breite` 120, `hoehe` 36, `farbe` kruste, `farbeDrueber` senf, `farbeGedrueckt` tomate, `textFarbe` weiss, `groesse` 18, `rundung` 8 (je ≥ 0), `aktiv` ja; **Lesefelder** `drueber`, `gedrueckt`, `geklickt` (diavolo) | Schaltfläche (H-K12, K-151; heißt nicht `Knopf`, das ist die Theke): abgerundetes Rechteck um die Lage, Text in der Mitte, Farbe je Zustand. Läuft im Nachlauf (das Programm liest im nächsten Takt, wie Eingabe): `drueber` = oberstes Ziel unter der Maus, solange kein anderes gefangen ist; `gedrueckt` = die linke Taste wurde auf diesem Taster gedrückt und ist noch gehalten (auch außerhalb); `geklickt` = über dem Taster losgelassen, auf dem gedrückt wurde – nur in diesem einen Takt. `aktiv` nein: halbe Deckkraft, alle Lesefelder nein, kein Ziel für die Maus. Hülle: das Rechteck |
| `Leiste` (2D) | `wert` 0.5 (0 … 1), `breite` 160, `hoehe` 14, `farbe` basilikum, `farbeLeer` grau, `rundung` 7 (je ≥ 0) | Füllbalken (H-K12): Grund `farbeLeer` über die ganze Breite, darüber von links der Anteil `wert` in `farbe`; nur Anzeige (kein System, kein Ziel für die Maus). Hülle: das Rechteck |
| `Regler` (2D) | `wert` 0.5, `von` 0, `bis` 1, `breite` 160 (≥ 0), `farbe` kruste (Schiene), `knauf` senf; **Lesefeld** `geaendert` (diavolo) | Schieberegler (H-K12): Schiene 6 hoch, Knauf (Radius 10) bei Anteil (`wert` − `von`)/(`bis` − `von`), geklemmt auf 0 … 1. Läuft im Nachlauf: Drücken auf Schiene oder Knauf (Fläche `breite` + 20 × 20) fängt den Regler, solange die linke Taste gehalten wird setzt die Maus `wert` = `von` + Anteil · (`bis` − `von`) aus ihrer waagerechten Lage (auch außerhalb, geklemmt; `bis` < `von` läuft rückwärts); `geaendert` = die Maus hat `wert` in diesem Takt verändert. Vom Programm gesetzte Werte werden nicht geklemmt. Hülle: die Trefferfläche |
| `Tafel` (2D) | `breite` 240, `hoehe` 160 (je ≥ 0), `farbe` `#2f2a26e0`, `titel` "", `rundung` 10 (≥ 0), `ziehbar` nein | UI-Fläche (H-K12): abgerundetes Rechteck um die Lage, `titel` oben links (18, weiß); der **Inhalt sind die Kinder** des Teils (sie folgen über die Hierarchie, bei gleicher Ebene liegen sie mit ihrer höheren ID darüber). Ziel für die Maus – verdeckt, was unter ihr liegt. `ziehbar`: ist sie gefangen, folgt sie der Maus, solange die linke Taste gehalten wird (Verschiebung im Raum der Eltern). Hülle: das Rechteck |
| `Schwung` (3D, braucht `Fuehler`) | `art` dynamisch (`dynamisch`\|`kinematisch`\|`fest`), `masse` 1 (≥ 0.001), `tempoX`/`tempoY`/`tempoZ` 0 (Einheiten/s), `drehtempoX`/`drehtempoY`/`drehtempoZ` 0 (Grad/s um die Weltachsen), `schwerkraft` 0 (Einheiten/s² nach −y; **9.81** fühlt sich nach Erde an), `daempfung` 0, `drehdaempfung` 0.05, `abprall` 0, `reibung` 0.5 (je 0 … 1), `stossX`/`stossY`/`stossZ` 0, `drehsperre` nein; **Lesefelder** `amBoden`, `ruht` (diavolo) | 3D-Physik (H-K17, K-162; Takt-System nach `Gelaende`, vor dem Fühler-Nachlauf): Form = Fühler am selben Teil, **gedreht** mit dem Teil – `kugel`/`kreis`, `kasten`/`rechteck`/`auto` (Quader in den Achsen des Teils, fehlende Seiten aus der Hülle des `Koerper`), `kapsel` (y-Achse des Teils, `radius`, `hoehe` gesamt; fehlt eines, aus der Hülle), `netz` (nur fest: die Dreiecke der `Koerper`-Form, einseitig mit der Vorderseite, bzw. das Höhenraster des `Gelaende`; an einem beweglichen Körper der Quader um das Netz). Kontakte nur zwischen Fühlern mit `ausloeser: nein`, Masken wie beim Fühler; ein solcher Fühler **ohne** Schwung ist fest. `dynamisch`: tempo += stoss / masse, tempoY −= schwerkraft · dt, Dämpfungen als (1 − d)^dt, dann Kontakte; Drehung aus den Kontakten mit der Trägheit der Form (`drehsperre` ja: keine Drehung); `kinematisch`: fährt und dreht mit tempo/drehtempo, schiebt, lässt sich nicht schieben (keine Schwerkraft, kein Stoß); `fest`: bewegt sich nie. `stoss` wirkt einmal im nächsten Takt und ist danach 0. Schwung schreibt Lage (über die Eltern zurückgerechnet) und `drehung`/`neigung`/`rollen`; setzt das Programm Lage oder Drehung, gilt die neue (der Körper wacht auf). Löser: feste 8 Iterationen Impuls (Normale, zwei Reibungsrichtungen mit √(a · b), Drehung der Kontaktfläche) und 4 Iterationen Positionskorrektur, Abprall = größerer Wert beider ab 0.5 Einheiten/s Annäherung; fester Fühler ohne Schwung: abprall 0, reibung 0.5. `amBoden` = im letzten Takt von unten gestützt (Normale mehr als 30° über der Waagerechten). **Schlafen**: ruhen alle Körper einer Insel (sich berührender dynamischer Körper) 0,5 s lang (unter 0.05 Einheiten/s und 2°/s), schlafen sie (`ruht` ja, Tempo 0, kein Rechenaufwand) bis zu Stoß, gesetztem Tempo, gesetzter Lage, einem wachen oder bewegten Nachbarn oder dem Verschwinden eines Kontaktpartners. Kein Schutz gegen Durchtunneln (Tempo je Takt unter der halben Ausdehnung halten, Wände dick), keine Gelenke |
| `Figur` (3D, braucht `Fuehler`) | `laufX`/`laufZ` 0 (Wunschtempo in Weltachsen, Einheiten/s), `sprung` 0 (≥ 0; Einmal: Tempo nach oben, nur am Boden, danach 0), `schwerkraft` **9.81**, `stufe` 0.3 (≥ 0), `hang` 45 (Grad, 0 … 90), `haut` 0.02 (≥ 0), `schieben` 0 (≥ 0), `mitfahren` ja; **Lesefelder** `amBoden` (diavolo), `boden` (Teil oder `karton`), `bodenHoehe`, `bodenNormaleX`/`bodenNormaleY`/`bodenNormaleZ`, `tempoX`/`tempoY`/`tempoZ` (tatsächlich), `anWand`, `anDecke` (diavolo) | Figur-Steuerung (H-K20, K-165; Takt-System nach `Schwung`, Figuren nach Teil-ID) wie Unity `CharacterController`: eine **aufrechte** Kapsel (Achse Welt-y) aus dem Fühler am selben Teil – `kapsel` mit `radius`/`hoehe` (× Größe des Teils; fehlt eines, aus dem `Koerper`), jede andere Form als Kapsel um ihre Hülle; unsichtbar zählen nur eigene Maße. Hindernisse: alle 3D-Fühler mit `ausloeser: nein` (Masken beidseitig) – feste, kinematische und dynamische Körper (gedreht wie in `Schwung`), Netze, Gelände (als Dreiecke) und die übrigen Figuren; dynamische `Schwung`-Körper schiebt die Figur nur mit `schieben` (Stoß je Sekunde Berührung, waagerecht), für `Schwung` ist die Figur fest. Je Takt: mitfahren (der Punkt auf dem Boden des Vortakts durch dessen aktuelle Welt-Matrix – Plattformen aus `Schwung`, `Ablauf`, `Gleiten` oder Programm), Tempo = (`laufX`, Falltempo − `schwerkraft` · dt, `laufZ`), waagerecht wischen in Teilschritten (≤ halber Radius, höchstens 16) mit je bis zu 4 Durchgängen Herausschieben (Kapsel + `haut`): **Boden** (Normale höchstens `hang` geneigt) senkrecht, **Decke** (Normale nach unten) entlang der Normale, **Wand** waagerecht – so gleitet sie an Wänden und kommt keinen zu steilen Hang hinauf; Kanten bis `stufe` über dem Fuß mit begehbarer Oberseite zählen als Boden. Hält eine Wand bis `stufe` über dem Fuß auf, ein Versuch Hoch–Vor–Runter (gilt, wenn er auf Boden landet und weiter kommt). Dann senkrecht; stand sie im Vortakt und springt nicht, klebt sie bis `stufe` tiefer am Boden (Treppe und Hang hinab). Schreibt die Lage (über die Eltern), Drehung bleibt beim Programm. `tempo*` = Weg / dt ohne Mitfahren. Grenzen: kein geschlossenes Wischen (Tempo je Takt ≤ 8 Radien), Drehung des Bodens dreht die Figur nicht mit |
| `Strahl` (3D) | `richtungX` 0, `richtungY` −1, `richtungZ` 0, `achsen` welt (`welt`\|`teil`), `laenge` 1000 (≥ 0), `maske` 4294967295 (Ganzzahl 0 … 4294967295), `ausloeser` nein, `ausMaus` nein; **Lesefelder** `getroffen` (Teil oder `karton`), `abstand`, `punktX`/`punktY`/`punktZ`, `normaleX`/`normaleY`/`normaleZ` | Strahl-Abfrage (H-K20, K-165) wie Unity `Physics.Raycast` – kein System: die Lesefelder werden **beim Lesen** gegen die Welt im Lesezeitpunkt gerechnet (Haken `lies`, nicht im Szenen-Hash) und gelten bis zur nächsten Änderung der Welt (jeder schreibende Aufruf). Ursprung = Weltlage des Teils, Richtung in Welt- bzw. Teil-Achsen (Länge egal, 0 → kein Treffer), bis `laenge`; `ausMaus` ja: von der aktiven Kamera (kleinste wache ID, sonst die Standardsicht) durch die Maus des Takts. Ziele: 3D-Fühler-Formen (wach, sichtbar, Gruppe in `maske`; Auslöser nur mit `ausloeser` ja), gedreht wie in der Physik, Netz und Gelände einseitig (Vorderseite bzw. von oben), nie das eigene Teil, nur der **Eintritt** zählt (liegt der Ursprung in einer Form, trifft er sie nicht); nächster Treffer, Gleichstand → kleinere Teil-ID; `Koerper` ohne Fühler trifft er nicht. Kein Treffer: `getroffen` `karton`, alle Zahlen 0. **Höhenabfrage:** Strahl nach unten über einem Gelände mit `form: "netz"` → `punktY` = Höhe des gezeichneten Netzes |
| `Etikett` (beide) | `name` "" | Name eines Teils (H-K16, K-161): `herd.modell` setzt ihn je glTF-Knoten (und je Material am Belag-Teil), jedes Programm kann ihn selbst verwenden; `teil.finde(name)` (§18.4) sucht danach. Verborgen trägt es die Knotennummer im Modell (für Animationen ab H-K23a; `kopie()` nimmt sie mit). Kein System, keine Hülle |

**Maus und UI-Bausteine (H-K12, K-151):** Treffer hat nur das **oberste** Ziel unter der Maus – höchste `ebene`, dann höchste
Teil-ID (wie gezeichnet); Ziele sind sichtbare `Taster` (aktiv), `Regler` und `Tafel`. Teile mit `ebene ≥ festAb` des aktiven `Blick`
(HUD) prüfen die Maus in Spielfeld-, alle anderen in Weltkoordinaten; geprüft wird im lokalen Rechteck des Teils (gedreht und
skaliert), Ränder zählen. Drücken der linken Taste **fängt** das getroffene Ziel, Loslassen gibt es frei; nur die linke Taste (Touch)
zählt. Mehrere Takte eines Ereignisses: Drücken/Loslassen nur im ersten.

### 18.7 Schnittstellen und Tests (K-134)

- **Ereignisse:** `{ typ: "herd", art: "fenster", titel, breite, hoehe }`, `{ typ: "herd", art: "bild", bildnummer, szene, paket }`
  (`szene`/`paket` = FNV-1a-64 als 16 Hex-Ziffern über Szenenzustand und Bildpaket, vom Kern berechnet), `{ typ: "herd", art: "schliesse" }`.
  Die Bytes des Bildpakets gehen nur an `optionen.onHerd(art, daten)` (Renderer), nie in die Ereignisliste – als eigene Kopie, mit
  `optionen.herdAnsicht: true` als Ansicht in den Kern-Speicher, die nur während des Aufrufs gilt (Browser-Worker: Bildfach). `herd`-Ereignisse stehen nicht
  in `.erwartet`; Tests vergleichen sie über `<name>.herd-erwartet` (JSON-Lines ohne `typ`, kanonisch wie `.ui-erwartet`) bzw. im
  Doku-Codeblock `herdErwartet`. Renderer-Ereignisse über `onUiWarte`/`uiEreignisse`, Datei `.ereignisse`.
- **Bitgleich** in Interpreter, Wasm und nativem Host: alle Ereignisse inkl. `szene`/`paket`, Schritte, Zeit. **Pixel** visuell gleich
  (gleiche Shader, Toleranzvergleich; K-129).
- **HOST-ABI:** Importgruppe `herd` mit generischen Aufrufen (Teil anlegen, Komponente anlegen, Feld setzen/lesen nach Typ- und
  Feldnummer aus dem Schema, Ressourcen, Takt, Bild, Fenster); eine neue Komponente ändert das ABI nicht. Details `HOST-ABI.md` (Paket H4).

### 18.8 Klang – Töne, Geräusche, Spuren (H-K14, K-153; Importgruppe `klang`)

Klänge werden **erzeugt** (Töne, Rauschen, Noten, Hüllkurven, Filter, Mischen) – Dateien (`Klang.laden`) kommen mit PROJEKTE später.
`Klang` gibt es auch ohne Herd. Die Synthese macht der Klang-Erzeuger (`herd/klang`, Rust `no_std` + `libm`; Browser/Interpreter/Wasm:
`site/js/herd/klang.wasm`, nativ eingebaut): **PCM 48 kHz, mono, i16** – bitgleich in allen Motoren (FNV-1a-64 der PCM-Bytes).

| Klasse | Erzeugen / Methoden |
|---|---|
| `Klang` | statisch `Klang.ton(frequenz, dauer, welle: "sinus", lautstaerke: 0.5, bis: 0, anschlag: 0.005, ausklang: 0.02)` (`welle` ∈ `sinus`, `rechteck`, `saege`, `dreieck`, `rauschen`; `bis` = Zielfrequenz, exponentiell gleitend, 0 = keine), `Klang.rauschen(dauer, art: "weiss", lautstaerke: 0.5, anschlag: 0.005, ausklang: 0.02, saat: 1)` (`art` ∈ `weiss`, `rosa`, `braun`), `Klang.stille(dauer)`, `Klang.noten(text, tempo: 120, welle: "rechteck", lautstaerke: 0.3)`; formen (je ein **neuer** Klang): `huelle(anschlag: 0, abfall: 0, halten: 1, ausklang: 0)`, `tiefpass(frequenz, guete: 0.707)`, `hochpass(frequenz, guete: 0.707)`, `verstaerke(faktor)`, `mische(anderer, ab: 0)`, `dann(anderer)`, `wiederhole(n)`, `nahtlos(ueberblendung: 0.05)`; `dauer()` (Sekunden), `id()`, `spiele(lautstaerke: 1, schleife: nein, tonhoehe: 1, panorama: 0)` → `Spur` |
| `Spur` | `stoppe()`, `laeuft()`, `lautstaerke()`/`setzeLautstaerke(v)` (0 … 2), `tonhoehe()`/`setzeTonhoehe(t)` (0.125 … 8), `panorama()`/`setzePanorama(p)` (−1 … 1), `setzeLage(x, y, z = 0)` (räumlich ab jetzt), `reichweite()`/`setzeReichweite(r)` (1 … 10 000, Standard 30), `klang()`, `beimEnde(fn)`, `id()`; Setter verkettbar |

- **Noten:** durch Leerzeichen (oder Komma) getrennt; Buchstabe `C D E F G A H` (deutsch; `B` = H erniedrigt), `#` erhöht, `b` erniedrigt,
  Oktave 0 … 8 (A4 = 440 Hz, gleichstufig), `:n` = Länge in Vierteln (Standard 1), `-` = Pause; je Note 5 ms Anschlag, 30 ms Ausklang.
- **Wertebereiche** (sonst `LaufzeitAnanas: <methode>() braucht <was> von <min> bis <max>, nicht <w>.`; Texte im Erzeuger): Frequenz 1 … 20 000
  Hz (Filter 10 … 20 000), Dauer über 0 bis 60 Sekunden, Lautstärke 0 … 1 (Erzeugen), Faktor 0 … 16, Güte 0.1 … 20, Tempo 20 … 400,
  `wiederhole` 1 … 1000 (Ganzzahl, sonst `TypAnanas`), `saat` Ganzzahl, `nahtlos` über 0 bis zur halben Dauer; alle Klänge zusammen
  höchstens 5 Minuten (`Die Klänge sind zusammen zu lang …`). Unbekannte Welle/Art/Note → `LaufzeitAnanas` mit der Liste der erlaubten Werte.
  Argumente in Parameterreihenfolge auf den Sprachtyp geprüft (`TypAnanas: ton() braucht eine Zahl für 'frequenz', nicht …`, Text, Klang).
- `neu Klang()`/`neu Spur()` → `RohlingAnanas: 'Klang' kann man nicht mit neu backen.`; eine eigene Klasse `Klang`/`Spur` hat Vorrang.
  Textform `Klang(<id>)`, `Spur(<nummer>)`; Spurnummern ab 1, nie wiederverwendet. In `brigade`-Stücken: `KüchenAnanas: Den Klang gibt es
  nur in der Hauptküche.`; als Karton `Ein Klang`/`Eine Spur` passt in keinen Karton.
- **Zeit (simuliert, nie vom Gerät):** mit Herd die Bildzeit (`herd.zeit()`), sonst die Uhr des Programms (`Uhr.jetzt()`). `laeuft()` =
  nicht gestoppt und `jetzt < ende`, `ende = start + dauer / tonhoehe` (Schleife: nie); `setzeTonhoehe` rechnet den Rest einer laufenden
  Spur um. **`beimEnde(fn)`** (Funktion ohne Parameter oder `karton`): nur in `herd.backe`, nach den Kniffen jedes Takts, für Spuren, die
  bis dahin ausgelaufen sind (nicht gestoppt, ohne Schleife), nach Spurnummer, je einmal; `schliesse()` darin wie in einem Kniff.
- **Ereignisse:** `{ typ: "klang", art: "spiele", spur, klang, lautstaerke, tonhoehe, panorama, schleife }` (`klang` = Hash der PCM, 16
  Hex-Ziffern), `{ typ: "klang", art: "setze", spur, lautstaerke, tonhoehe, panorama, lage, reichweite }` (ganzer Zustand nach jedem Setter
  einer laufenden Spur; `lage` = `[x, y, z]` oder `null`), `{ typ: "klang", art: "stoppe", spur }` (nur, wenn sie lief). Ist ein Herd-Fenster
  offen, sammeln sich die Ereignisse bis zum nächsten Bild (vor `herd/bild`) bzw. bis `schliesse` – ein Klang startet mit dem Bild seines
  Takts; sonst sofort. Die PCM geht nur an `optionen.onKlang(art, daten)` (`daten.bytes` bei `spiele`, **vor** dem Ereignis), nie in die
  Ereignisliste. Tests: `<name>.klang-erwartet` bzw. `pruefung/klang-erwartet` (JSON-Lines ohne `typ`, kanonisch wie `.herd-erwartet`).
- **Erzeuger fehlt** (Programm nennt `Klang.…`): `{ typ: "fehler", code: "HOST", art: "intern", text: "PizzaFehler HOST: Der
  Klang-Erzeuger fehlt (klang.wasm)." }`, Exit 2 vor dem Start.
- **Wiedergabe** (nicht Teil der Bitgleichheit): Browser WebAudio (Ton erst nach der ersten Nutzeraktion, vorher Gespieltes entfällt,
  laufende Schleifen setzen dann ein; Stummschalter), nativ Windows `waveOut`, Linux ALSA (`libasound.so.2` per `dlopen`) – fehlt
  ein Gerät, eine Meldung und das Programm läuft stumm weiter. Räumlich (`setzeLage`): Hörer = Kamera des Herds; Lautstärke bis 1 m voll, dann
  1/Abstand, ab 60 % der Reichweite weich auf 0; Panorama aus der Richtung zur Rechts-Achse des Hörers; Tiefpass 18 kHz nah bis 900 Hz an der
  Reichweite. Tests und JSON-Modus geben nie Ton aus (nativ: `--klang-datei=x.wav` schreibt die Mischung im Takt der Herd-Bilder).
