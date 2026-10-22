# Küchenbrigade – echte Parallelität in pizza (Entwurf, verbindlich formuliert)

> **Abgelöst:** §2 (Sprachmodell) und §3 (Determinismus) sind als Vertrag in **SPEC §17** übernommen (K-097 … K-100);
> bei Widersprüchen gilt SPEC §17. Dieses Dokument bleibt Plan für Umsetzung, Motoren und Phasen (§4–§6).

> **Grundsatz (K-082): Browser = nativ.** Was hier steht, verhält sich im Playground, in Node, im nativen Host und in der EXE
> **gleich** und zeigt **das Gleiche** an. Zusätzlich gilt für dieses Dokument: **Die sequentielle Referenz definiert die
> Semantik; echte Threads sind eine unbeobachtbare Optimierung.** Kein Ereignis, kein Text, kein Exit-Code, keine
> `schritte`, keine `zeitMs` dürfen von der Anzahl der Threads, von ihrer Planung oder von der Wanduhr abhängen.

**Status:** Entwurf für den Koordinator (Branch `multithreading`). Abschnitte 1–6 sind so formuliert, dass sie nach Klärung der
offenen Produktfragen (§7) als SPEC §17 / KLAERUNGEN K-089 ff. / HOST-ABI-Gruppe `kueche` übernommen werden können. Wo eine
Produktfrage eine Regel berührt, steht die **empfohlene** Option im Text und der Verweis `[F n]`.

Begriffe (Pizzeria-Metapher, verbindlich):

| Begriff | Bedeutung |
|---|---|
| **Hauptküche** | das laufende Programm (Top-Level, `hauptgang`, Rückrufe, `wennDa`-Phase) |
| **Brigade** | ein Aufruf `blech.brigade(fn)` – verteilt die Elemente eines Blechs auf Köche |
| **Stück** | ein Element des Blechs + der Aufruf `fn(element)` darauf; Stücke sind von 1 bis n nummeriert (**Stückreihenfolge**) |
| **Küche** | der isolierte Ausführungskontext eines Stücks (eigene Uhr, eigener Zufall, eigene Objekte) |
| **Koch** | ein Thread/Worker des Hosts. Anzahl = Host-Einstellung `koeche`, **nie** beobachtbar |
| **Anschnitt** | der Moment, in dem die Brigade die Stücke startet (fork) |
| **Schnappschuss** | der Zustand der Hauptküche beim Anschnitt; in der Küche **nur lesbar** |
| **Zusammenführen** | Ergebnisse, Ereignisse, Zähler und Abbrüche der Stücke werden in Stückreihenfolge übernommen (join) |

---

## 1. Ziele & Nicht-Ziele

### Ziele
1. **Speedup bei Rechenarbeit:** Ein pizza-Programm kann rechenintensive, unabhängige Teilaufgaben auf mehrere Kerne verteilen.
   Zielwert (Wasm-Motor, Stücke ≥ 10⁶ Schritte): Speedup ≥ 0,6 × Köche für bis zu 8 Köche, in Browser, Node und nativ.
2. **Vollständiger Determinismus:** Ergebnis, Ereignisfolge (Texte, Codes, Zeilen), Exit-Code, `schritte` und `zeitMs` sind
   unabhängig von Köche-Anzahl, Planung und Hardware bitgleich – in Interpreter, Wasm-in-JS und nativem Host.
3. **Browser = nativ:** gleiche Sprache, gleiche Grenzen, gleiche Fehlertexte; Unterschiede nur in der Hülle (Worker vs. Thread).
4. **Rückwärtskompatibel:** Kein bestehendes Programm ändert sein Verhalten. `belege`, `schneide`, `teig`, `bestelle` bleiben
   exakt wie in SPEC §7/§14 [F 1]. HOST-ABI bleibt `abi_version` 1 (neue optionale Importgruppe).
5. **Pizzeria-Metapher:** Köche arbeiten in eigenen Küchen; wer in die Hauptküche greift, bekommt eine `KüchenAnanas`; die
   simulierte Uhr zeigt die Ersparnis („der langsamste Koch zählt“, vgl. `simulationen/freitagabend-ansturm.pizza`).
6. **Ehrlicher Rückfall:** Jeder Host darf ohne Threads arbeiten (keine SharedArrayBuffer, keine verschachtelten Worker,
   `koeche = 1`) – das Ergebnis ist identisch, nur langsamer.

### Nicht-Ziele
- **Kein Multiprocessing** (nur nativ sinnvoll, K-082).
- **Kein gemeinsamer veränderlicher Zustand, keine Sperren** in Version 1 [F 4]. Keine Datenrennen, keine Atomics in der Sprache.
- **Keine Wasm-Threads** (shared memory/atomics) – das `.pkarton` bleibt MVP + bulk-memory + multi-value + … (HOST-ABI §1).
- **Keine Parallelisierung bestehender Konstrukte** (`belege`, `zusammenklappen`, `teig.gehenlassen`, `bestelle`) in Version 1;
  Hintergrund-Köche sind ein späteres Paket [F 9].
- **Keine Wand-Zeitgrenzen**, keine Prioritäten, keine Thread-Steuerung aus der Sprache [F 6].
- Der Interpreter muss nicht parallel laufen; er ist die Referenz [F 8].

---

## 2. Sprachmodell

### 2.1 Das Konstrukt: `blech.brigade(fn)` (Tier 1) [F 1, F 2]

```pizza
Blech<salami> bons = [1 .. 4_000_000];
Blech<salami> teilsummen = bons.schneide(8).brigade(stapel -> stapel.summe());   // 8 Stücke, parallel
salami gesamt = teilsummen.zusammenklappen((a, b) -> a + b);                      // sequentiell, wie bisher
```

- `blech.brigade(fn)` ist eine neue **Blech-Methode**. Ergebnis: ein **neues** Blech `[fn(b₁), …, fn(bₙ)]` in Stückreihenfolge –
  wie `belege`, aber jedes Stück läuft in einer eigenen Küche (§2.2–§2.5) und Zeit/Zähler werden nach §3 zusammengeführt.
- `fn` wird wie bei `belege` mit genau einem Argument aufgerufen (Lambdas tolerant, §14.9); ist `fn` keine Funktion, entsteht
  derselbe Fehler wie bei `belege`.
- Leeres Blech → `[]` ohne Anschnitt (keine Zufallsziehung, keine Kosten außer den Aufrufknoten).
- Typischer Partner ist `schneide(n)` (Stückzahl = Programmentscheidung, `n` ist Pflicht – K-127). Die Stückzahl ist nie von der Hardware
  abhängig. Die Anzahl der Stücke ist beobachtbar, die Anzahl der Köche nie.
- `brigade` ist kein Keyword (keine neuen reservierten Wörter, bestehende Bezeichner bleiben gültig); `BUILTINS` ändert sich nicht.
- Schritte: der Aufruf kostet seine normalen Knoten (§14.1), jeder Rückruf zählt seine Anweisungen/Ausdrücke; Anschnitt und
  Zusammenführen sind Bibliotheksarbeit (0 Schritte). Stapeltiefe: jedes Stück beginnt mit der Tiefe des Aufrufs + 1 (wie ein
  `belege`-Rückruf, §14.4).
- Verschachtelte Brigaden (eine Brigade in einem Stück) sind erlaubt und folgen denselben Regeln mit der Küche als „Hauptküche“
  der inneren Brigade. Hosts dürfen innere Brigaden in der Küche sequentiell ausführen (identisches Ergebnis).

### 2.2 Was ein Stück darf

| Bereich | Regel in der Küche |
|---|---|
| Argument `bᵢ`, Variablen der Hauptküche (global, gefangen), statische Felder, Felder vorhandener Objekte, Elemente vorhandener Bleche/Speisekarten | **lesen** erlaubt – Wert = Schnappschuss beim Anschnitt (§2.3) |
| Eigene Variablen (Parameter, lokale Variablen des Rückrufs und aller von ihm aufgerufenen Rümpfe), eigene Objekte | lesen und schreiben, wie immer |
| Methoden/Funktionen aufrufen, `neu Klasse(…)`, Pizzen bauen, Rekursion, `probier`, `ofen`, `teig`, `bestelle` (eigene) | erlaubt |
| `Bote.sage`, `Bote.schreibe`, `Bote.fehler`, `Bote.leeren` | erlaubt; Ereignisse werden gepuffert und in Stückreihenfolge ausgegeben (§3 D4) [F 3] |
| Warnungen (T0007, W0003, W0013 …) | erlaubt; Ausgabe in Stückreihenfolge, „einmal pro Code + Stelle“ über alle Stücke und die Hauptküche (§3 D5) |
| `Uhr.jetzt()`, `Uhr.vorspulen(d)` | Küchenuhr (§3 D6) |
| `Uhr.echt()` | erlaubt (Wanduhr; Test: `optionen.echtzeit`) |
| `Zufall.*`, `neu Zufall()` | eigener Strom der Küche (§3 D9) |
| `@Kühlschrank`, `mikrowelle`, `frisch` | lesen aus dem Schnappschuss-Cache, Schreiben in einen Küchen-Cache, der am Stückende verfällt (§3 D12) |
| Vorratskammer: `hole`, `hat`, `schlüssel`, `länge`, `name` auf einer **vorhandenen** Kammer | erlaubt (Schnappschuss) |
| `zwischenstand(x)` | wirkt nur auf Öfen, die **in** der Küche geöffnet wurden; sonst ignoriert (wie außerhalb eines Ofens, §14.2) |
| verschachtelte `brigade` | erlaubt (§2.1) |

### 2.3 Der Schnappschuss – Lesen ja, Schreiben nein [F 7]

**Regel S1:** Alles, was beim Anschnitt existiert („gehört der Hauptküche“), ist in der Küche **nur lesbar**. Das sind:
Variablen der Hauptküche (globale, Top-Level, gefangene Zellen umgebender Funktionen/Lambdas), statische Felder, alle vorhandenen
Objekte samt Feldern, Bleche, Speisekarten, Teige, Lieferungen, Zustellungen,
`Zufall`-Objekte, Vorratskammern, Calzones und alle Theke-Zutaten.

**Regel S2:** Was eine Küche selbst erzeugt (Variablen ihrer Rümpfe, mit `neu`/Literal/Bibliothek erzeugte Werte), gehört ihr und
ist frei veränderbar. Andere Küchen können es nie erreichen (es gibt keinen beschreibbaren gemeinsamen Ort).

**Regel S3:** Jeder Versuch, etwas der Hauptküche zu verändern, wirft an genau dieser Stelle eine fangbare
`KüchenAnanas` (neue eingebaute Klasse `KüchenAnanas erbt LaufzeitAnanas`). Die Prüfung ist eine **Laufzeitprüfung** und
damit unabhängig von der Planung: dieselbe Stelle, derselbe Schritt, in jedem Motor.

Verändernde Operationen und ihr Text (`<n>` = Name der Variable bzw. des Felds):

| Operation (auf Hauptküchen-Eigentum) | Meldung |
|---|---|
| Zuweisung, `+=`, `++`, `schieb(x)` an Variable/statisches Feld | `KüchenAnanas: '<n>' gehört der Hauptküche – ein Koch darf es nur lesen.` |
| Feldzuweisung `o.f = …` an vorhandenem Objekt | `KüchenAnanas: '<f>' gehört der Hauptküche – ein Koch darf es nur lesen.` |
| `hinzu`, `entferne`, `setze` auf vorhandenem Blech | `KüchenAnanas: Dieses Blech gehört der Hauptküche – nimm eine kopie().` |
| `lege`, `entferne` auf vorhandener Speisekarte | `KüchenAnanas: Diese Speisekarte gehört der Hauptküche – ein Koch darf sie nur lesen.` |
| `gehenlassen()`, `backen()` (noch nicht gebacken) auf vorhandenem Teig | `KüchenAnanas: Dieser Teig gehört der Hauptküche – ein Koch darf ihn nur ansehen.` |
| `priorität`, `warte` (noch nicht gewartet), `wennDa` auf vorhandener Lieferung | `KüchenAnanas: Diese Lieferung gehört der Hauptküche – ein Koch darf sie nur ansehen.` |
| Ziehen aus einem vorhandenen `Zufall`-Objekt | `KüchenAnanas: Dieser Zufall gehört der Hauptküche – nimm Zufall direkt oder neu Zufall().` |
| `lege`, `entferne`, `leeren` auf vorhandener Vorratskammer | `KüchenAnanas: Die Vorratskammer 'x' gehört der Hauptküche – ein Koch darf nur nachsehen.` |
| `aufklappen()` auf vorhandener Calzone | `KüchenAnanas: Diese Calzone gehört der Hauptküche – ein Koch darf sie nicht aufklappen.` |

Bereits fertige Zustände bleiben lesbar: `backen()` eines gebackenen Teigs liefert den Wert, `warte()` einer gewarteten Lieferung
die gespeicherte Zustellung, `wert()` usw. sind Lesezugriffe.

**Regel S4 – nur in der Hauptküche** (wirft beim Aufruf, auch bei reinen Abfragen):

| Operation | Meldung |
|---|---|
| `Bestellannahme.*` (`lies`, `frage`, `liesZahl`, `frageZahl`, `hatMehr`) | `KüchenAnanas: Bestellannahme gibt es nur in der Hauptküche.` |
| `neu Theke`/`neu <Zutat>` und jede Methode einer Theke oder Zutat | `KüchenAnanas: Die Theke gibt es nur in der Hauptküche.` |
| `neu Vorratskammer(…)` | `KüchenAnanas: Neue Vorratskammern gibt es nur in der Hauptküche.` |

Begründung: Eingabe und Theke warten auf den Menschen und sind an genau einen Ort gebunden (eine Theke pro Programm, K-062);
neue Kammern lesen vom Host. Eine Reihenfolge-Regel für Eingaben aus parallelen Stücken wäre nur durch Serialisierung
erreichbar und brächte nichts.

**Regel S5 – Lieferungen und Teige einer Küche** gehören der Küche. Am Stückende verfallen sie: Lieferungen mit `wennDa`, die in
der Küche bestellt und dort nicht gewartet wurden, laufen **nie** (sie nehmen nicht an der `wennDa`-Phase nach Programmende teil).

### 2.4 Was eine Küche verlassen kann – kartonfähige Werte

Rückgabewerte der Stücke (und geworfene Werte, §3 D3) werden beim Zusammenführen **tief kopiert** („in den Karton gepackt“):

| Wert | kartonfähig? | Kopie |
|---|---|---|
| `salami`, `funghi` (auch NaN/Infinity), `margherita`, `diavolo`, `karton`, `Dauer`, quattrostagioni-Wert | ja | Wert |
| `Blech`, `Speisekarte` | ja, wenn alle Elemente/Schlüssel/Werte kartonfähig | neue Objekte; geteilte Teile und Zyklen **innerhalb** des Ergebnisses bleiben geteilt |
| Objekt einer eigenen Klasse, eigene Ananas, eingebaute Ananas | ja, wenn alle Felder kartonfähig [F 10] | neues Objekt, **gleiche Nummer** `Klasse@N` (§3 D10), Calzone-Zustand bleibt |
| Klasse, Rezeptur, quattrostagioni-Typ, Module (`Bote`, `Mathe` …) als Wert | ja | dieselbe (unveränderliche) Referenz |
| Funktion, Lambda, Methodenreferenz, `Teig`, `Lieferung`, `Zustellung`, `Reste`, `Zufall`-Objekt, `Vorratskammer`, Theke/Zutat | **nein** | – |

- Nicht kartonfähig → `KüchenAnanas: <Art> passt in keinen Karton – nur Werte können die Küche verlassen.` mit `<Art>` ∈
  `Eine Funktion`, `Ein Teig`, `Eine Lieferung`, `Eine Zustellung`, `Reste`, `Ein Zufall`, `Eine Vorratskammer`,
  `Eine Theke-Zutat`. Die Ananas entsteht **in der Küche** am Ende des Stücks (Position = Position des `brigade`-Aufrufs,
  Schritte unverändert) und gilt als Abbruch dieses Stücks (§3 D3).
- **Identität:** Ergebnisse sind immer Kopien, auch wenn ein Stück einen Wert der Hauptküche unverändert zurückgibt
  (`b.brigade(x -> x)` liefert neue Bleche; `==` auf Blechen/Objekten ist daher `nein`, auf Zahlen/Texten Wertgleichheit).
- Die Prüfung der Kartonfähigkeit kostet 0 Schritte und ruft **kein** `alsText()` auf.

### 2.5 Gemeinsamer Zustand

Version 1 hat **keinen** gemeinsamen veränderlichen Zustand und deshalb **keine Sperren** [F 4]. Der einzige Kanal aus der Küche
ist der Rückgabewert (plus Ausgaben). Begründung: Jede Sperre („Ofen-Reservierung“) macht die Reihenfolge der Zugriffe von der
Planung abhängig – das widerspricht Ziel 2. Ein deterministischer Ersatz (z. B. ein nur anhängbarer „Bestellblock“, der in
Stückreihenfolge zusammengeführt wird) ist mit Rückgabewerten bereits ausdrückbar und kann später ergänzt werden.

### 2.6 Statische Hilfe (optional, später)

Der Editor/das Frontend darf zusätzlich eine Warnung erzeugen, wenn ein **direkt** an `brigade` übergebenes Lambda erkennbar in
eine gefangene/globale Variable schreibt: `W0201: Dieser Koch schreibt in 'x' – das gehört der Hauptküche.` Das ersetzt die
Laufzeitprüfung nicht (indirekte Schreibzugriffe über Methoden wie in `raetsel/pizzaiolos.pizza` sieht nur die Laufzeit).
Wird W0201 eingeführt, muss sie wie W0666/W0032 Teil von `analysiere()`/IR `warnungen` sein (gleich in allen Motoren). Nicht in
Phase 1.

### 2.7 Ausblick: Hintergrund-Köche (nicht Version 1) [F 9]

Dieselbe Küchen-Semantik trägt später auch ein asynchrones Konstrukt, z. B. `Auftrag<T> a = koch(() -> …);` … `a.abholen()`:
Anschnitt beim Erzeugen (Schnappschuss, Uhr T₀), Zusammenführen bei `abholen()` (Ereignisse dort in Erzeugungsreihenfolge,
Uhr = max(Uhr jetzt, T₀ + d)). `teig`/`bestelle` behalten ihre heutige Semantik.

---

## 3. Determinismus

Alle Regeln sind so gewählt, dass **jedes Stück eine reine Funktion von (Schnappschuss, Element, Stücknummer, Anschnitt-Zählern)**
ist und das Zusammenführen eine feste Faltung in Stückreihenfolge. Daraus folgt Unabhängigkeit von Köche-Anzahl und Planung.

Beim Anschnitt merkt sich die Brigade: Schritte `S₀`, Uhr `T₀ = S₀ + offset`, Limitbasis und Limit (K-087), aktive
Ofen-/Lieferungs-Budgets (Ende-Zeitpunkte `E_f`), Stapeltiefe, Objektzähler `N₀`, Lieferungszähler `L₀`.

**D1 – Unabhängige Ausführung.** Jedes Stück i läuft so, als liefe es allein direkt nach dem Anschnitt: Schritte ab `S₀`, Uhr ab
`T₀`, Objektnummern ab `N₀`, Lieferungsnummern ab `L₀`, eigener Zufallsstrom (D9), leerer Küchen-Cache (D12). Kein Stück sieht
Wirkungen eines anderen.

**D2 – Stückreihenfolge.** Zusammengeführt wird immer in Stückreihenfolge 1 … n, unabhängig davon, wann welcher Koch fertig wird.

**D3 – Abbrüche: der erste in Stückreihenfolge gewinnt.** Ein Stück endet normal (Wert) oder bricht ab: ungefangene Ananas,
Budget-Überschreitung eines äußeren Ofens/einer äußeren Lieferung (D8), P0002 (D7), PizzaFehler (seit K-105 keiner mehr zur Laufzeit), Hawaii-Panik,
nicht kartonfähiges Ergebnis (§2.4). Sei `k` das **kleinste** abgebrochene Stück. Dann:
- Die Ereignisse der Stücke 1 … k−1 und die Ereignisse von Stück k **bis zum Abbruch** werden ausgegeben (D4); Stücke > k
  gelten als nie gelaufen (keine Ereignisse, keine Schritte, keine Uhr).
- Der Abbruch wird in der Hauptküche **am `brigade`-Aufruf** fortgesetzt: eine Ananas (kopiert nach §2.4, mit ihrer
  ursprünglichen Zeile) wird dort geworfen und ist mit `probier`/`verbrannt` um den Aufruf fangbar; Budget-Abbrüche greifen wie
  in §14.2 (äußerster überschrittener Rahmen); P0002, PizzaFehler und Panik beenden das Programm wie gewohnt (Panik: Banner,
  Exit 39; das `fehler`-Ereignis trägt Text und Zeile aus der Küche). Ist der geworfene Wert nicht kartonfähig, wird stattdessen
  `KüchenAnanas: Was der Koch geworfen hat, passt in keinen Karton.` geworfen.
- Hosts dürfen Stücke > k abbrechen, sobald k feststeht und alle Stücke < k fertig sind (Optimierung, unbeobachtbar).

**D4 – Ereignisse.** `ausgabe`/`fehlerausgabe`/`leeren`/`warnung` eines Stücks werden in der Küche gepuffert und beim
Zusammenführen in Stückreihenfolge **vor** der Rückkehr des `brigade`-Aufrufs ausgegeben; innerhalb eines Stücks in
Auftretensreihenfolge. (Hüllen dürfen die Ereignisse von Stück k bereits live zeigen, sobald alle Stücke < k ohne Abbruch fertig
sind – „geordnetes Streaming“; das ändert die Folge nicht.) `eingabe`, `ui`, `vorrat` kommen in Küchen nicht vor (§2.3 S3/S4).

**D5 – Warnungen.** Die Regel „einmal pro Code + Stelle“ (§10, §14.8; W0003 einmal pro Methode) gilt über die gesamte
Ereignisfolge: Eine Warnung eines Stücks wird beim Zusammenführen unterdrückt, wenn dieselbe Warnung bereits in der Hauptküche
oder in einem früheren Stück ausgegeben wurde. (Das ist genau die Folge, die sequentielle Ausführung ergäbe.)

**D6 – Uhr: der langsamste Koch zählt** [F 5]. Küchenuhr von Stück i: `T₀ + (eigene Schritte) + (eigenes vorspulen)`;
`dᵢ` = Küchenuhr am Stückende − `T₀`. Nach dem Zusammenführen gilt in der Hauptküche
- `schritte = S₀ + Σ sᵢ` (Arbeit – Summe aller Schritte der berücksichtigten Stücke, D3),
- `Uhr = T₀ + max dᵢ` (über die berücksichtigten Stücke; Zeit – kritischer Pfad),
- intern `offset := Uhr − schritte` (darf kleiner werden als vorher; `zeitMs` kann damit kleiner als `schritte` sein).
SPEC §14.1 „Uhr = Schritte + vorgespulte Zeit“ wird ergänzt: „… + Brigade-Ersparnis (≤ 0)“. Das `ende`-Ereignis zeigt so
Arbeit (`schritte`) und simulierte Zeit (`zeitMs`) getrennt.

**Referenz** (mit `belege` statt `brigade` zum Vergleich, Interpreter heute):

| Programm | `belege` | `brigade` |
|---|---|---|
| `Blech<salami> r = [1, 2, 3, 4].brigade(x -> x * x);` | schritte 20, zeitMs 20 | schritte 20, zeitMs **11** (Anschnitt bei Uhr 8, jedes Stück 3) |
| dito + `Bote.sage((Uhr.jetzt()));` | Ausgabe `25ms` | Ausgabe `16ms`, schritte 25, zeitMs 16 |
| `[1, 2, 3, 4].brigade(x -> { Uhr.vorspulen(x * 1s); serviere (x); });` + `Bote.sage((Uhr.jetzt()));` | `10s 45ms` | `4s 21ms` (Stück 4: 8 Schritte + 4 s) |

Die `belege`-Werte sind mit dem heutigen Interpreter gemessen; die `brigade`-Werte sind daraus nach D6 abgeleitet und werden in
P1 als Abnahmewerte in den Prüfstand übernommen.

**D7 – Schrittlimit P0002.** Jedes Stück hat als eigenes Limit den Rest beim Anschnitt `R = (Limitbasis + Limit) − S₀`; es
bricht beim eigenen Schritt `R + 1` mit P0002 ab (Abbruch nach D3). Nach dem Zusammenführen ohne Abbruch wird geprüft:
`S₀ + Σ sᵢ > Limitbasis + Limit` → P0002 **am `brigade`-Aufruf** (Position des Aufrufs, `schritte` = tatsächliche Summe, kann
größer als `Limit + 1` sein – einzige Ausnahme von §14.1). Theke-Rückrufe (K-087): Stücke erben die Limitbasis; die Basis wird
in Küchen nie neu gesetzt.

**D8 – Ofen- und Lieferungsbudgets.** Äußere Budgets (in der Hauptküche geöffnet) gelten in jeder Küche gegen die Küchenuhr:
Stück i überschreitet Rahmen f, sobald seine Küchenuhr > `E_f` ist (gleiche Regel wie §14.2, „äußerster greift“). Das ist ein
Abbruch nach D3; die Hauptküche setzt am `brigade`-Aufruf mit diesem Rahmen fort (innere Rahmen verlassen ohne `roh`),
`verbrauchteZeit()` = Uhr nach D6 − Start des Ofens. In der Küche geöffnete Öfen/Lieferungen verhalten sich wie immer.

**D9 – Zufall.** Beim Anschnitt zieht die Hauptküche aus ihrem globalen Strom **n** Saaten in Stückreihenfolge, je
`sᵢ = floor(r · 2³²)` (wie `neu Zufall()`, K-078); Stück i benutzt als globalen Strom `Zufall` einen mulberry32-Strom mit
Saat `sᵢ` (der i-ten gezogenen Saat – **nicht** der Stücknummer).
Die Hauptküche zieht danach normal weiter (n Ziehungen verbraucht, auch wenn kein Stück Zufall nutzt). `Zufall.saat(n)` in der
Küche setzt nur den Küchenstrom.

**D10 – Objektnummern** (`Klasse@N`, §14.9). Jede Küche nummeriert ab `N₀ + 1`. Nach dem Zusammenführen zählt die Hauptküche ab
`N₀ + max cᵢ` weiter (cᵢ = Anzahl `neu` in Stück i; über die berücksichtigten Stücke). Nummern können sich also zwischen Stücken
wiederholen; kopierte Ergebnisobjekte behalten ihre Nummer. Gleiches gilt für Lieferungsnummern (`Lieferung #n`).

**D11 – Stapeltiefe.** Jedes Stück beginnt mit der Tiefe des `brigade`-Rückrufs (Aufruftiefe + 1) und hat dieselbe Grenze 1500
(§14.4). Der Wirt-Stapel eines Kochs muss dieselbe Tiefe erlauben wie der Hauptthread (HOST-ABI §6).

**D12 – Kühlschrank.** Eine Küche liest Cache-Einträge des Schnappschusses (Frische nach Küchenuhr, §14.10) und schreibt neue
oder erneuerte Einträge in einen Küchen-Cache, der am Stückende verfällt. Der Cache der Hauptküche ändert sich durch eine Brigade
nie.

**D13 – Speicher (Wasm/nativ).** Jede Küche darf höchstens `min(Restspeicher beim Anschnitt, 256 MiB)` neu belegen (Restspeicher
= Speicherlimit − belegter Heap). Überschreitung → `LaufzeitAnanas: Der Kühlschrank ist voll (Speicherlimit erreicht).` in der
Küche (fangbar, Abbruch nach D3). Der Interpreter hat weiterhin kein Limit (bekannte, dokumentierte Abweichung wie heute).

**D14 – Hawaii.** Panik in Stück i ist ein Abbruch nach D3: nur wenn kein früheres Stück abgebrochen ist, erscheint der Banner
(nach den Ausgaben der Stücke 1 … i), Exit 39. W0666 ist statisch und ändert sich nicht.

**D15 – Was die Hauptküche nach der Brigade sieht.** Unverändert: alle eigenen Variablen, Objekte, Caches, Theke, Kammern,
Lieferungen. Geändert: `schritte`, Uhr (D6), Zufallsstrom (D9), Objekt-/Lieferungszähler (D10), Warnungsgedächtnis (D5) und das
Ergebnisblech.

**Folgerung (testbar):** Für jedes Programm sind die Ergebnisse mit `koeche = 1`, `koeche = n` und unter beliebiger Permutation
der Ausführungsreihenfolge der Stücke identisch (§5).

---

## 4. Umsetzung je Motor

### 4.1 Gemeinsamer Kern: „Küchenauftrag“ und „Küchenbericht“

Alle Motoren implementieren dieselben zwei Funktionen:
- `stück(auftrag, i) → bericht` – führt Stück i nach D1 aus. Der **Bericht** enthält: Status (`ok` | `ananas` | `budget(f)` |
  `limit` | `pizzafehler` | `panik`), `sᵢ`, `dᵢ`, `cᵢ` (neu-Zähler), Lieferungszähler, gepufferte Ereignisse (mit Warnungsschlüssel
  für D5) und den Ergebniswert bzw. geworfenen Wert im **Kartonformat** (§4.3).
- `zusammenführen(auftrag, berichte) ` – die Faltung nach D2–D15 in der Hauptküche.

Die sequentielle Referenz ist `for i in 1..n: bericht[i] = stück(auftrag, i)` mit Abbruch der Schleife beim ersten Abbruch –
**dieselben** Funktionen, die Köche parallel aufrufen. So ist `koeche = 1` kein Sonderweg, sondern derselbe Code.

### 4.2 Interpreter (`site/js/pizza.js`) – sequentielle Referenz (Phase 1)

- `BLECH_M.brigade`: Anschnitt (Zähler merken, n Saaten ziehen), dann je Stück:
  1. Küchenzustand setzen: `schritte = S₀`, `offset` so, dass Uhr = `T₀`; `grenze` aus Rest-Limit (D7) und äußeren Rahmen
     (`frames` bleiben, gelten als „fremd“: `zwischenstand` ignoriert sie, D8); `instanzen = N₀`, `lieferNr = L₀`;
     `zufallGlobal` = Küchenstrom; Kühlschrank-Überlagerung leer; Ereignisse in einen Puffer statt `onEvent`.
  2. **Einfrieren:** Menge `gefroren` (WeakSet) aller beim Anschnitt erreichbaren veränderlichen Dinge – globaler `Scope` und
     seine Kette, Scope-Kette der Funktion `fn`, statische Felder aller Klassen, das Blech und seine Elemente, transitiv durch
     Bleche, Speisekarten (Schlüssel und Werte), Objekte (Felder), Pizzen, Teige, Lieferungen, Zustellungen, Stücke,
     Zufall-Objekte, Kammern, Funktionswerte (deren Scopes). Einmal pro Brigade aufgebaut (nicht pro Stück) – die Stücke können
     den Graphen nicht verändern. Kosten O(erreichbarer Zustand), 0 Schritte.
  3. **Wachen** an allen verändernden Stellen (Tabelle §2.3): `if (this.kueche !== null && this.kueche.gefroren.has(x)) throw …`
     – Variablen-/Feldzuweisung, `schieb`, Blech-/Speisekarten-Mutatoren, Teig, Lieferung, Zufall-Objekt,
     Kammer, `aufklappen`; S4-Operationen prüfen nur `this.kueche !== null`. Außerhalb einer Brigade kostet die Wache einen
     Null-Vergleich.
  4. Rückruf ausführen; Ergebnis/Wurf nach §2.4 kopieren (Kopie mit Memo-Map für Teilung/Zyklen).
  5. Hauptküchenzustand für das nächste Stück wiederherstellen; Lieferungen der Küche aus `this.lieferungen` entfernen (S5).
- Danach Zusammenführen nach §3 (Ereignisse mit D5-Deduplizierung über `warnSet` ausgeben, Zähler, Uhr, Abbruch).
- Neue Ananas-Klasse `KüchenAnanas` in `ANANAS_BAUM` **am Ende** anhängen (bestehende Indizes bleiben; im Wasm verschiebt sich
  der erste Index eigener Klassen von 17 auf 18 – intern, IR.md §1 anpassen).
- `optionen.koeche` wird akzeptiert und ignoriert (Interpreter immer sequentiell, [F 8]). Optional `optionen.kuechenChaos: saat`
  (nur Tests): führt die Stücke in einer pseudozufälligen Permutation aus und verwirft danach nach D3 – muss dasselbe Ergebnis
  liefern (Selbsttest der Unabhängigkeit).
- **Spätere Option (Phase 8, [F 8]):** echte Parallelität im Interpreter über einen Worker-Pool: Jeder Pool-Worker parst
  denselben Quelltext einmal pro Lauf (gleiche Knotennummern, Registrierung ohne Ausführung), bekommt den Schnappschuss im
  Kartonformat (erweitert um Funktionswerte = Knotennummer + Scope-Kette) und führt `stück(i)` aus; deserialisierte Objekte sind
  automatisch `gefroren`. Messung (§4.8): lohnt erst bei warmem Pool und Stücken ≥ ~10⁴ Schritten; Wasm ist ohnehin ~8× schneller.

### 4.3 Kartonformat (PKF, für Ergebnisse, Würfe und Interpreter-Schnappschüsse)

Binär, little-endian, versioniert (`PKF1`), von Interpreter (JS) und Laufzeit (Rust) identisch geschrieben/gelesen:
Tags für `karton`, `ja`/`nein`, Zahl (f64), Text (UTF-8), Dauer (f64 ms), quattrostagioni (Typname, Position),
Blech, Speisekarte (Paarliste, Schlüsselart erhalten wie K-017), Objekt (Klassenname, Nummer, Flags,
Felder in Deklarationsreihenfolge inkl. Basisklassen), Ananas (Klasse, Nachricht, Zeile/Spalte), Referenz auf bereits
geschriebenes Objekt (Teilung/Zyklen), Klasse/Modul (Name). Unbekannter Tag → interner Fehler (K-014). Das Format ist intern
(kein Nutzer-Dateiformat), wird aber in `IR.md`/`HOST-ABI.md` beschrieben, weil Host und Laufzeit es austauschen.

### 4.4 Wasm (`laufzeit/`, `site/js/pizzaiolo/`) – unabhängige Instanzen, keine Wasm-Threads

**Entscheidung:** keine Wasm-Threads/shared memory. Gründe: verletzt HOST-ABI §1 (MVP-Profil), wasmi und viele `wasm2c`-Setups
unterstützen es nicht oder nur teilweise, die Rust-Laufzeit (`static mut ZUSTAND`, Bump-Allocator) ist bewusst single-threaded,
und Datenrennen wären ohnehin verboten (§2.5). Stattdessen **Klon-Instanzen**: dieselbe Modul-Kompilation, eine Instanz je Koch,
**kein geteilter Speicher**.

Mechanik:
1. **Anschnitt in der Laufzeit** (`rt_brigade`): Auftrag als Heap-Objekt anlegen (Elemente, `fn`, S₀, T₀, Rest-Limit, Budgets,
   Tiefe, N₀, L₀, n Saaten, Kühlschrank-Verweis) und `frozen_top := HEAP_TOP` setzen. Danach importiert die Laufzeit
   `pizza.kueche_auftrag(auftrag, n)`.
2. **Einfrieren per Adresse:** Der Bump-Allocator legt neue Objekte immer oberhalb von `frozen_top` an. Jede verändernde
   Laufzeitfunktion (Blech/Speisekarte/Felder/Zellen/globale Zellen/Teig/Lieferung/Zufall/Kammer/Calzone) prüft
   `adresse < frozen_top` → KüchenAnanas (§2.3). Generierter Code, der Zellen/Globale direkt schreibt, bekommt denselben
   Vergleich (eine `i32`-Vergleichsinstruktion; außerhalb einer Brigade ist `frozen_top = 0`). Ungeboxte Wasm-Locals sind immer
   eigen. (Kommt in Phase 2 der Speicherverwaltung ein GC, wird `frozen_top` durch ein Kopf-Bit „Hauptküche“ ersetzt.)
3. **Host mit Köchen** (Import liefert `0`): Der Host kopiert den gesamten linearen Speicher der aufrufenden Instanz (Schnappschuss,
   ~1 ms je 4–8 MiB), lässt k Köche je eine Klon-Instanz desselben `Module` anlegen bzw. wiederverwenden, deren Speicher auf
   dieselbe Größe wachsen und mit dem Schnappschuss überschreiben, und ruft dort für jedes zugeteilte Stück den Export
   `kueche_stueck(auftrag, i) -> (ptr, len)` auf. Die Laufzeit setzt bei jedem Aufruf Küchenzustand und `HEAP_TOP := frozen_top`
   zurück (deshalb genügt **eine** Speicherkopie pro Koch und Brigade). Alle Laufzeitzustände liegen im linearen Speicher
   (`ZUSTAND`, Allocator, Argumentstapel); einzige Wasm-Global-Ausnahme `__stack_pointer` behält im Klon seinen Startwert
   (Pflicht für den Compiler: keine weiteren veränderlichen Wasm-Globals mit Laufzeitzustand). Der Host bewahrt die Berichte
   auf; die Hauptinstanz holt sie mit `kueche_bericht(i, puffer, kap)` (Retry wie K-013) und führt nach §3 zusammen.
4. **Host ohne Köche** (Import liefert `-1`, `koeche = 1`, keine SharedArrayBuffer …): Die Laufzeit ruft `kueche_stueck` für
   i = 1 … n **in sich selbst** auf (gleicher Code, gleicher Heap-Reset) und führt nach jedem Bericht sofort zusammen.
5. In der Küche ruft die Laufzeit **keinen** der Imports `ausgabe`, `schreibe`, `fehlerausgabe`, `leeren`, `warnung`,
   `fehler`, `panik`, `eingabe`, `ui_senden`, `ui_warte`, `vorrat_lesen`, `vorrat_schreiben` auf, sondern schreibt Ereignisse
   und den Abbruchstatus (auch Panik) in den Bericht; die Hauptinstanz gibt sie beim Zusammenführen über die normalen Imports aus.
   Der Host muss Ereignisse daher nicht kennen. Besonders `panik`: HOST-ABI erlaubt dem Host, in `panik` den Lauf abzubrechen –
   ein Klon darf das nie auslösen, sonst könnte eine Ananas eines früheren Stücks nicht mehr nach D3 gewinnen.
6. **Wachsende Laufzeitstrukturen unterhalb `frozen_top`.** Jede Laufzeitstruktur, die vor dem Anschnitt angelegt wurde und
   während eines Stücks wachsen könnte (Warnungsgedächtnis, Lieferungsliste, Kühlschrank-Tabellen, `ARGS`, Namens-/Interntabellen,
   Theke-/Kammer-Register), würde beim Wachsen ihren Puffer oberhalb `frozen_top` neu anlegen; nach dem Heap-Reset zeigte der
   Zeiger ins Leere. Regel für den Küchenmodus: Solche Strukturen werden (a) nie berührt, (b) durch küchenlokale Strukturen
   oberhalb `frozen_top` ersetzt, die am Stückende verfallen (Warnungen, Lieferungen, Kühlschrank-Überlagerung), oder (c) ihr
   `(ptr, len, cap)` wird im Auftrag gesichert und nach jedem `kueche_stueck` wiederhergestellt. Das gilt für den Inline-Pfad
   und für Klone, die mehrere Stücke nacheinander ausführen.
7. Frontend: bis Phase 2 meldet `frontend.js` für `.brigade(` `nichtUnterstuetzt` (Grund „Küchenbrigade noch nicht im
   Wasm-Ofen“) → Playground „Auto“ nutzt den Interpreter. `Pizzaiolo.faehigkeiten.importgruppen` bekommt `kueche`,
   `laufOptionen` bekommt `koeche`.

**Bewertung `wasm2c`/EXE:** Klon-Instanzen sind in `wasm2c` normale zusätzliche Instanz-Strukturen; Speicherkopie ist `memcpy`;
Köche sind `pthread`s des C-Hosts. Es wird keine Threads-Unterstützung des Wasm-Profils gebraucht – das Modul bleibt portabel.
Alternative „nur Ergebnisse serialisieren, Klon frisch starten“ wurde verworfen: Der Klon bräuchte dann den gesamten
Schnappschuss (Globale, statische Felder, Closure-Umgebung) als PKF – die Speicherkopie liefert ihn gratis und hält Zeiger gültig.

### 4.5 HOST-ABI – neue optionale Importgruppe `kueche` (abwärtskompatibel, `abi_version` bleibt 1)

| Import (Modul `pizza`) | Signatur | Bedeutung |
|---|---|---|
| `kueche_auftrag` | `(auftrag_ptr i32, n i32) -> i32` | Führt Stücke 1 … n in Klon-Instanzen aus (Schnappschuss = Speicher der aufrufenden Instanz **jetzt**). `0` = Berichte liegen bereit, `-1` = keine Köche (Modul arbeitet selbst, §4.4 Punkt 4). Muss nicht alle Stücke ausführen, wenn ein früheres abbrach (D3) – fehlende Berichte meldet `kueche_bericht` mit `-2`. |
| `kueche_bericht` | `(i i32, puffer_ptr i32, kap i32) -> i32` | Länge des Berichts von Stück i; `> kap` → nichts geschrieben, erneut mit größerem Puffer (K-013); `-2` = Stück nicht ausgeführt. |

| Export | Signatur | Bedeutung |
|---|---|---|
| `kueche_stueck` | `(auftrag_ptr i32, i i32) -> (i32, i32)` | nur von Hosts in **Klon-Instanzen** aufzurufen; liefert Zeiger/Länge des Berichts im Klon-Speicher |

- Das Modul importiert die Gruppe nur, wenn das Programm `brigade` enthält (Custom Section `"gruppen": [..., "kueche"]`).
  Ein Host ohne die Gruppe meldet den bekannten Ladefehler (HOST-ABI §2, K-043). Ein Host, der die Gruppe kennt, aber keine
  Threads hat, antwortet `-1`.
- **Re-Entranz (HOST-ABI §2 „Imports dürfen nicht zurück in das Modul rufen“):** bleibt gültig – `kueche_auftrag` ruft nie die
  aufrufende Instanz, nur andere Instanzen desselben Moduls. Die Regel wird entsprechend präzisiert.
- **Imports der Klon-Instanzen:** `ausgabe`, `schreibe`, `fehlerausgabe`, `leeren`, `warnung`, `fehler` und `panik` werden in
  Klonen nie aufgerufen (§4.4 Punkt 5; Host: Trap → K-014, nie Lauf-Abbruch); `eingabe` → `-1`,
  `ui_warte` → `-1`/`0`, `ui_senden` → Trap, `vorrat_*` → Trap (S4 verhindert Aufrufe), `echtzeit_ms` → Wanduhr bzw.
  `optionen.echtzeit`, `kueche_auftrag` → `-1` (innere Brigaden laufen im Klon sequentiell).
- Trap in einem Klon (Bug, Speicher des Hosts erschöpft) → Stück gilt als Abbruch „interner Fehler“: Die Hauptinstanz meldet nach
  D3 `Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.` (K-014; Text fest, `detail` = Trap-Meldung).
- Speicherbudget des Hosts: Der Host wählt k ≤ `koeche` so, dass k × Speichergröße ≤ Hostbudget (Browser 2 GiB gesamt, nativ
  50 % RAM) – reine Leistungsentscheidung.

### 4.6 JS-Host (`site/js/pizzaiolo/host-js.js`, `pizzaiolo.js`) – Browser und Node

- Neue asynchrone Fabrik `Pizzaiolo.kuechenPool(k) → Promise<Pool>` (Node: `worker_threads`, Browser: `Worker`); Pool-Worker
  laden `pizzaiolo/koch.js`, erhalten das kompilierte `WebAssembly.Module` per `postMessage` (strukturierbar) und warten per
  `Atomics.wait` auf Aufträge. `optionen.koeche`: Zahl (Pool wird nicht automatisch erzeugt → `-1`) oder ein Pool-Objekt.
- `kueche_auftrag` ist synchron: Speicher in einen `SharedArrayBuffer` kopieren, Aufträge per Steuerwort verteilen (dynamische
  Warteschlange mit `Atomics.add` – Planung ist frei, D2 macht sie unbeobachtbar), mit `Atomics.wait` auf Fertigmeldungen
  warten; Berichte kommen blockweise über einen festen SAB je Koch (Standard 1 MiB) – der Hauptthread wacht pro Block auf und
  kopiert. Kein `postMessage` auf dem Rückweg (der Hauptthread blockiert).
- **Pool vor dem Lauf anlegen:** Ein blockierter Thread darf nicht darauf warten, dass neue Worker erst starten (Worker-Start
  braucht die Ereignisschleife des Erzeugers – vgl. Emscripten-`PTHREAD_POOL_SIZE`). Deshalb wird der Pool **asynchron vor**
  `run` erzeugt; ohne Pool → `-1`.
- Ohne `SharedArrayBuffer`/`Atomics` (keine Cross-Origin-Isolation) oder ohne verschachtelte Worker → `-1` (gleiches Ergebnis).
- **Zweiteiliger Schnellpfad (WASM.md §2):** Der JS-Host instanziiert intern Laufzeitmodul + kleines Programmmodul, das
  `memory`, Tabelle und `rt_*` importiert. Ein Klon ist dann ein **Paar** aus Laufzeit- und Programminstanz mit eigenem
  Speicher und eigener Tabelle; die Speicherkopie zielt auf das `memory` der Laufzeitinstanz (Eigentümerin), `kueche_stueck`
  wird auf der Instanz aufgerufen, die den Export trägt (Laufzeit). Der Pool erhält beide `WebAssembly.Module`. Alternativ darf
  der Pool das gelinkte `.pkarton` verwenden – beide Wege müssen dieselben Berichte liefern (Differenztest).

### 4.7 Nativer Host (`host/`) und EXE

- `host/src/kueche.rs`: `kueche_auftrag` kopiert `memory.data(&caller)` in einen `Arc<[u8]>`, verteilt Stücke auf
  `std::thread::scope`-Köche (je Koch eigener `Store` + `Instance` desselben `Module`/`Engine` – wasmi-`Engine`/`Module` sind
  `Send + Sync`), Stapelgrenzen wie Hauptinstanz (HOST-ABI §6), Berichte in `Vec<Option<Vec<u8>>>`; frühes Beenden späterer
  Stücke über einen `AtomicUsize` „kleinster Abbruch“. Köche-Threads leben nur während der Brigade (oder als Pool im `Zustand`).
- CLI/EXE: `--koeche=N` (`auto` = Standard, `1` = aus). `--info` zeigt zusätzlich `Köche: N` (Text identisch zum Playground,
  K-082). Theke-Programme: Die Brigade läuft im Programm-Thread, das Fenster bleibt bedienbar; Fenster schließen beendet den
  Prozess wie bisher.
- `auto` = Anzahl logischer Kerne (`available_parallelism`), höchstens 16 [F 6].

### 4.8 Playground (`site/js/worker.js`, `ui/`)

- Der Lauf-Worker prüft nach dem Kompilieren die Gruppe `kueche`; nur dann erzeugt er vor `run` einen Pool (Kinder-Worker des
  Lauf-Workers → „Abbrechen“ = `worker.terminate()` beendet automatisch alle Köche). Kosten gemessen (Node): Pool aus 8 Workern
  ≈ 30–45 ms; Browser ähnlich. Später optional ein seitenweiter, warm gehaltener Pool (MessagePort-Übergabe), der bei
  „Abbrechen“ ebenfalls beendet und neu erzeugt wird.
- Lauf-Einstellungen-Popover: **„Köche: auto | 1 | 2 | 4 | 8“** (localStorage), neben „feste Saat“. Statusleiste nach dem Lauf:
  `Köche: N` (tatsächlich genutzte Anzahl; 1 bei Interpreter/Rückfall). `ende` bekommt das optionale Feld `koeche`
  (nicht in `.erwartet`, von Differenztests ignoriert).
- Interpreter-Rückfall („Auto“ bei `nichtUnterstuetzt`): läuft sequentiell, gleiches Ergebnis.
- Vorschau der Ausgaben: Ereignisse eines Stücks erscheinen frühestens, wenn alle früheren Stücke fertig sind (D4).

### 4.9 Messungen (Prototyp, Node 22, 24 logische Kerne, nicht eingecheckt)

| Messung | Ergebnis |
|---|---|
| Start eines Pools (leere Worker), k = 1 / 4 / 8 | 20 / 22 / 28 ms; mit `pizza.js` k = 8: 45 ms (≈ 6–9 ms Laden je Worker) |
| Leere Fork-Join-Runde mit `Atomics.wait`/`notify`, k = 1 / 4 / 8 | 3 / 12 / 21 µs |
| Interpreter-Durchsatz (Zählschleife) | ≈ 56–80 Mio. Schritte/s; Wasm ≈ 600 Mio. Schritte/s |
| Interpreter, 8 Stücke, **kalte** Worker (JIT je Worker neu) | Speedup < 1 bis ~1,8·10⁵ Schritte/Stück, 4,1× bei 3,6·10⁶ |
| Interpreter, 8 Stücke, **warmer** Pool | 1,6× (6·10² Schr.), 3,1× (6·10³), 4,8× (3·10⁴), 5,7× (6·10⁵), 6,2× (2,4·10⁶) |
| `WebAssembly.Instance` eines `.pkarton` (348 KB) | 0,03 ms; Speicher nach Instanziierung 1,1 MiB |
| Speicherkopie 4 / 64 MiB | 0,7 / 10,5 ms |
| `structuredClone` eines Blechs mit 10⁶ Zahlen | 17 ms (Richtwert für Interpreter-Schnappschüsse) |

Folgerungen: (1) Klon-Instanzen + Speicherkopie sind für Wasm billig (≪ 1 ms bei typischen Programmen). (2) Pools müssen
**warm** gehalten werden (JIT-Aufwärmen pro Worker dominiert sonst) – innerhalb eines Laufs immer wiederverwenden. (3) Die
Interpreter-Parallelität lohnt sich erst bei warmem Pool und groben Stücken; Priorität hat Wasm [F 8].

---

## 5. Tests

1. **Prüfstand** `pruefstand/faelle/a14-kueche.js` (erst `a14-kueche-offen.js`): jede Regel aus §2/§3 mit exakten Texten –
   alle KüchenAnanas-Texte, S4, Kartonfähigkeit, D3 (Abbruch in Stück 2 von 4, Ausgaben 1–2 sichtbar, 3–4 nicht), D5
   (W0003 in zwei Stücken → einmal), D6-Referenzen aus der Tabelle, D7 (Stück-P0002 und Summen-P0002 am Aufruf), D8 (äußerer
   Ofen, `verbrauchteZeit`), D9 (Saaten 42 → feste Werte), D10 (`Klasse@N`), D12, D14, verschachtelte Brigade, leeres Blech.
2. **tests/faelle/** `kueche-*.pizza` + `.erwartet` (+ `.exitcode`, `.fehler`, `.warnungen`) – laufen in `run-tests.js`
   und damit automatisch im Differenz-Harness.
3. **Differenztests** (`tests/differenz/`): Korpus `kueche-*.pizza`; `motoren.js` bekommt Varianten
   `wasm` (`koeche: 1` → Inline-Pfad), `wasm-koeche4` (Pool mit 4 Köchen), `host` (`--koeche=1`), `host-koeche4`. Alle Varianten
   müssen identische normalisierte Ereignisse, Exit-Codes, `schritte`, `zeitMs` liefern (Feld `koeche` wird ignoriert).
4. **Chaos-Planung:** Testoption `kuechenChaos: saat` in allen Motoren (Interpreter: Permutation; JS-Host/nativ: zufällige
   Reihenfolge + künstliche Verzögerungen je Koch, auch umgekehrte Reihenfolge) – Ergebnis muss gleich `koeche = 1` sein.
5. **Fuzzing** (`tests/fuzz/generator.js`): neue Produktionen `x.brigade(lambda)` mit Rümpfen aus Ausgaben, Warnungen, Würfen,
   Schreibzugriffen auf gefangene/globale Variablen, statische Felder und Felder vorhandener Objekte, Ofen-Budgets, kleinem
   Schrittlimit, Zufall, `neu`, verschachtelter Brigade; Orakel: 1 vs. n Köche, Chaos, alle Motoren.
6. **Schnappschuss-Invarianz (Wasm, Debug-Build):** Prüfsumme des Heaps `[HEAP_START, frozen_top)` plus der statischen Daten,
   die kein Laufzeitzustand sind, vor/nach jedem Stück muss gleich sein (findet vergessene Wachen in der Laufzeit). `ZUSTAND`,
   Schattenstapel und Argumentstapel ändern sich legitim und sind ausgenommen. Interpreter-Gegenstück: Debug-Option, die `gefroren` per
   `Object.freeze` zusätzlich hart einfriert.
7. **Stress:** 10⁴ winzige Stücke; 8 Stücke mit Rekursionstiefe 373 (§14.4-Referenz); Stücke mit 10⁵ Ausgabezeilen; jedes Stück
   wirft (erstes gewinnt); Speicherlimit in einem Stück; 64 MiB Heap beim Anschnitt.
8. **Leistung** (`bench/run.js`): `brigade` mit 8 Stücken à 10⁶ Schritte, Ziel Speedup ≥ 0,6 × k (k ≤ 8) im Wasm-Motor;
   Regression ohne `brigade` ≤ 3 % (Wachen).
9. **E2E** (`e2e/`): Programm mit langer Brigade starten → „Abbrechen“ → keine weiteren Ereignisse, keine CPU-Last mehr
   (alle Köche beendet), nächster Lauf funktioniert; Popover „Köche“ 1 vs. 4 ergibt gleiche Konsole; Statusleiste `Köche: N`.
   Nativ: Smoke-Test `--koeche=4` in CI (Linux), Ctrl+C beendet alle Threads.

---

## 6. Phasenplan

Jedes Paket ist für **einen** frischen Agenten geschnitten; Zuständigkeiten nach ARCHITEKTUR §6. Commit nur eigener Pfade.

| Paket | Agent | Dateien | Inhalt | Abhängig von | Abnahme |
|---|---|---|---|---|---|
| **P0 Vertrag** | Klärungs-Agent (+ Koordinator für §7) | `SPEC.md` (§7.4 Verweis, neuer §17 „Küchenbrigade“, §13 Tier-3-Zeile „echte Parallelität bei schneide“ ersetzen, §14.1 Uhr-Ergänzung), `KLAERUNGEN.md` (K-089 ff.), `pruefstand/faelle/a14-kueche-offen.js` | Produktentscheidungen §7 eintragen, §2/§3 als Vertragstext übernehmen, Prüfstandsfälle mit exakten Erwartungen | Nutzerantworten | Fälle parsen, laufen „offen“; SPEC widerspruchsfrei zu §14/§16 |
| **P1 Referenz** ★ | Interpreter-Agent | `site/js/pizza.js`, `tests/faelle/kueche-*`, `tests/run-tests.js` | §4.2: `brigade`, `KüchenAnanas`, Einfrieren, Wachen, Kartonkopie, Zusammenführen, `kuechenChaos` | P0 | a14 grün (Datei → `a14-kueche.js`), alle bestehenden Tests unverändert grün, Bench ohne `brigade` ≤ 3 % langsamer |
| **P1b Wasm-Rückfall** | Compiler-Agent | `site/js/pizzaiolo/frontend.js` | `.brigade(` → `nichtUnterstuetzt` | P0 | Playground „Auto“ fällt zurück; `motor: "wasm"` zeigt klare Meldung |
| **P1c Doku & Beispiel** | Doku-/Beispiel-Agent | `site/js/doku/20-pizzafunktionen.js` (Abschnitt „Küchenbrigade“, Bild `pf-brigade.svg`), `site/beispiele/pizzafunktionen/kuechenbrigade.pizza` (+ `.erwartet`, Manifest) | Erklärung, Beispiel (Teilsummen, Uhr-Vergleich `belege` vs. `brigade`, gefangene KüchenAnanas) | P1 | Doku-Blöcke laufen im Prüfstand; Beispiel grün |
| **P2 Wasm inline** | Compiler-Agent | `laufzeit/**`, `site/js/pizzaiolo/**`, `IR.md`, `HOST-ABI.md` (§2 Gruppe `kueche`, §3 Export, PKF-Anhang) | §4.3–§4.5: `rt_brigade`, `frozen_top`-Wachen, Küchenzustand, Bericht, PKF, Inline-Pfad; JS-Host antwortet `-1` | P1 | Differenz Interpreter ↔ Wasm grün auf allen `kueche-*` + Korpus; Bench-Regression ≤ 3 %; Schnappschuss-Invarianz im Debug-Build |
| **P3 JS-Köche** ★ | Compiler-Agent | `site/js/pizzaiolo/host-js.js`, `pizzaiolo.js`, neu `site/js/pizzaiolo/koch.js` | §4.6: `kuechenPool`, Klon-Instanzen, SAB-Protokoll, Chaos-Option | P2 | Differenz `wasm` vs. `wasm-koeche4` vs. Chaos identisch; Speedup ≥ 0,6 × k in `bench/` (Node) |
| **P4 Nativ** | Native-Host-Agent | `host/**` (neu `kueche.rs`), `host/README.md` | §4.7: Gruppe `kueche`, `--koeche`, Pool, frühes Beenden, Chaos | P2 (P3 als Vorbild) | Differenz `host`/`host-koeche4` grün; CI-Smoke `--koeche=4`; EXE-Bau unverändert |
| **P5 Playground** | UI-Agent | `site/js/worker.js`, `ui/**`, `site/index.html`, `site/js/app.bundle.js` | §4.8: Pool vor dem Lauf, Popover „Köche“, Statusleiste, Abbrechen | P3 | Manuell + P6-E2E; ohne Isolation identisches Ergebnis mit `Köche: 1` |
| **P6 Harnische** | Differenz-Agent, E2E-Agent | `tests/differenz/**`, `tests/fuzz/**`, `e2e/tests/**` | §5 Punkte 3–7, 9 | Differenz: P2; Köche-Varianten: P3/P4; E2E: P5 | Fuzz 10⁴ Fälle ohne Abweichung; E2E grün in CI |
| P7 Statische Hilfe (optional) | Interpreter- + Compiler-Agent | `pizza.js` (`analysiere`), `frontend.js` | W0201 (§2.6) | P1, P2 | gleiche Warnungen in allen Motoren |
| P8 Interpreter-Köche (optional) | Interpreter-Agent | `pizza.js`, neu `site/js/pizza-koch.js` | §4.2 „Spätere Option“ | P1, P5 | Differenz `interpreter` vs. `interpreter-koeche4` identisch; Speedup bei groben Stücken |
| P9 Hintergrund-Köche (optional) | Klärung → Interpreter → Compiler | SPEC, … | §2.7 `koch(fn)`/`abholen()` | P1–P4 | eigener Entwurf |

★ = Meilensteine. **M1 (P0 + P1 + P1b + P1c):** Semantik fest, im Playground nutzbar (sequentiell; die Uhr zeigt schon die
Ersparnis). **M2 (P2 + P3 + P5):** echter Speedup im Browser und in Node. **M3 (P4 + P6):** nativ/EXE gleichauf, volle
Absicherung. P1b kann sofort nach P0 parallel zu P1 laufen; P2 kann nach P0 beginnen, die Abnahme braucht P1.

**Phase 1 = minimaler, wertvoller Schnitt (M1):** ein neues Wort (`brigade`), eine neue Ananas, Regeln vollständig spezifiziert
und in der Referenz getestet – keine ABI-, Host- oder UI-Änderung nötig, kein bestehendes Programm betroffen. Alles Weitere ist
reine Beschleunigung gegen ein festes, getestetes Verhalten.

---

## 7. Offene Produktfragen

Jede Frage mit Optionen; **Empfehlung fett**. Die Empfehlungen sind im Text oben bereits eingearbeitet.

**F 1 – Welches Konstrukt läuft echt parallel?**
- **(a) Neue, ausdrückliche Blech-Methode (`brigade`), alles Bestehende bleibt sequentiell.** Kein Programm ändert sich.
- (b) `belege(fn, parallel: ja)` als Schalter an der bestehenden Methode.
- (c) `belege` auf dem Ergebnis von `schneide` wird automatisch parallel. Bricht `raetsel/pizzaiolos.pizza` (schreibt aus dem
  Rückruf in das statische Feld `Küche.erste`) und ändert die Uhr bestehender Programme.

**F 2 – Name der parallelen Methode** (und der Ananas)
- **(a) `brigade(fn)` – „die Küchenbrigade belegt alle Stücke gleichzeitig“; Fehlerklasse `KüchenAnanas`.**
- (b) `verteile(fn)` (sachlich, weniger Pizza).
- (c) `köche(fn)` bzw. `anKöche(fn)` (verspielt, liest sich als Plural-Substantiv seltsam).

**F 3 – Dürfen Stücke Ausgaben machen?**
- **(a) Ja – gepuffert, in Stückreihenfolge ausgegeben (D4).** Debug-Ausgaben bleiben möglich, deterministisch.
- (b) Nein – `Bote.*` in der Küche wirft KüchenAnanas (einfacher, aber unfreundlich beim Ausprobieren).
- (c) Ja, live und ungeordnet – widerspricht dem Grundsatz (Ausgabe hinge von der Planung ab); nicht empfohlen.

**F 4 – Kommt gemeinsamer veränderlicher Zustand?**
- **(a) Nein. Nur Rückgabewerte (und Ausgaben) verlassen die Küche.**
- (b) Später ein deterministischer „Bestellblock“ (nur anhängen, Zusammenführung in Stückreihenfolge).
- (c) Echte Sperren („Ofen-Reservierung“ mit `reserviere { … }`) – nicht deterministisch, bräuchte eine Ausnahme vom Grundsatz.

**F 5 – Was zeigt die simulierte Uhr nach einer Brigade?**
- **(a) Kritischer Pfad: Anschnitt + längstes Stück (D6); `schritte` = Summe.** Speedup wird in `Uhr.jetzt()` sichtbar.
- (b) Summe wie sequentiell (Uhr = Schritte). Unsichtbar, aber Stücke könnten `Uhr.jetzt()` dann erst nach ihren Vorgängern
  kennen – echte Parallelität wäre nur mit nachträglicher Korrektur möglich.
- (c) Kritischer Pfad + Verwaltungsaufschlag (z. B. +1 ms je Stück) – „Koordination kostet“, didaktisch, aber willkürlich.

**F 6 – Wie wird die Anzahl der Köche (Threads) bestimmt?**
- **(a) Nur Host-Einstellung: `auto` (= logische Kerne, höchstens 16) im Playground-Popover und als `--koeche=N` nativ; nie
  beobachtbar.**
- (b) Zusätzlich Sprach-Hinweis `brigade(fn, köche: 4)` als Obergrenze (bleibt unbeobachtbar, aber verleitet zum Missverständnis,
  dass Stücke = Köche sind).
- (c) Standard `1`, Parallelität nur auf ausdrücklichen Wunsch des Nutzers (sicherer bei Speicher, aber kein „Wow“).

**F 7 – Was sieht ein Stück von der Hauptküche?**
- **(a) Alles lesend (Schnappschuss), Schreiben → KüchenAnanas (§2.3).**
- (b) Nur das eigene Element und Konstanten; jeder Zugriff auf Variablen/Felder der Hauptküche → KüchenAnanas (strenger,
  einfacher zu implementieren, aber Methodenaufrufe auf Klassen mit statischen Konstanten wie `Küche.N` scheitern).
- (c) Kopie-Semantik: Schreiben erlaubt, Änderungen verfallen still am Stückende (bequem, aber stille Datenverluste).

**F 8 – Bekommt der Interpreter echte Parallelität?**
- **(a) Zunächst nein: Der Interpreter ist die sequentielle Referenz; echte Köche gibt es im Wasm-Motor (Browser, Node, nativ).
  P8 nur bei Bedarf.**
- (b) Ja, als P8 direkt nach M2.
- (c) Ja, sofort in Phase 1 (verzögert M1 deutlich; braucht Schnappschuss-Serialisierung inkl. Funktionswerten).

**F 9 – Hintergrund-Köche für `teig`/`bestelle`?**
- **(a) Später, als eigenes Konstrukt mit Küchen-Semantik (`koch(fn)`/`abholen()`, §2.7); `teig`/`bestelle` bleiben.**
- (b) Nie – `brigade` reicht.
- (c) `teig.gehenlassen()` startet echt im Hintergrund (Semantikänderung: der Teig sähe dann nur den Schnappschuss).

**F 10 – Dürfen Objekte eigener Klassen die Küche verlassen?**
- **(a) Ja, als tiefe Kopie mit gleicher Nummer (§2.4).**
- (b) Nein, nur „einlagerbare“ Werte wie bei der Vorratskammer (Zahlen, Texte, Wahrheitswerte, `karton`, Bleche/Speisekarten
  daraus) plus Dauer – einfacher, aber OOP-Programme müssen Ergebnisse umpacken.
