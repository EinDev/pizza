# Klärungsprotokoll pizza v3.0 (K-001 …)

Entscheidungsprotokoll des Klärungs-Agenten. Jede Klärung ist verbindlich und in `SPEC.md` §15 (bzw. §11.1)
als Vertragstext eingearbeitet; Regressionstests liegen in `pruefstand/faelle/a10-klaerungen.js` (grün) und
`pruefstand/faelle/a11-klaerungen-offen.js` (rot, bis die Umsetzungsaufträge erledigt sind).

Leitlinien (in dieser Reihenfolge): (a) bestehendes, sinnvolles Interpreter-Verhalten bevorzugen, (b) Konsistenz
mit Java-artigen Erwartungen und der Pizzeria-Metapher, (c) Portabilität für den Wasm-/EXE-Pfad, (d) Einfachheit.

Die 21 „Klarstellungen“ (Kl. 1–21) des Koordinators, auf die der Prüfstand verweist, sind inzwischen in SPEC §14
eingearbeitet (Interpreter-Agent). Dieses Protokoll ergänzt §14, wiederholt es nicht; wo eine Klärung §14 bestätigt
oder präzisiert, steht das dabei.

Status: **fest** = Interpreter entspricht, Test grün (a10) · **offen** = Interpreter-/Doku-/Host-Änderung nötig
(Auftrag unten, Test in a11 oder nicht automatisierbar).

---

## Entscheidungen

### K-001 Pizza-Literal und Aufrufklammern
- **Frage:** Zählt die Klammer eines Aufrufs zum Pizza-Literal? Ist `Bote.sage((Salami, Tomate))` gültig?
- **Entscheidung:** Nein. Nur zwei Klammern in **Ausdrucksposition** bilden ein Literal. `Bote.sage((Salami))` übergibt
  den Belag-Wert `Salami`; `Bote.sage((Salami, Tomate))` ist ein Syntaxfehler P0001 (Argumentausdruck `(Salami, Tomate)`
  hat ein Komma); das Literal im Aufruf braucht drei Klammern: `Bote.sage(((Salami, Tomate)))`. Bei `((X))` mit genau
  einem Namen gewinnt ein bekannter Belagname gegen eine gleichnamige Variable.
- **Begründung:** Stabil, bereits so im Interpreter und im Prüfstand (a05) kodiert; eine kontextabhängige Zählung der
  Aufrufklammer wäre für Parser (Wasm-Frontend nutzt denselben Parser) und Leser überraschender.
- **Betroffen:** SPEC §5, §14.5 (bestätigt), §15.1. Optionaler Auftrag: Parser-Hinweis im Fehlertext (siehe unten, U-01).
- **Status:** fest.

### K-002 W0032 bei drei und mehr Schreibweisen
- **Frage:** §10 „Einmal pro Paar“ (→ 3 Warnungen bei `pizza`/`Pizza`/`PIZZA`) vs. „einmal pro Code+Stelle“ (→ 2).
- **Entscheidung:** Eine Warnung **pro später deklariertem Namen** an dessen Stelle, Text nennt den frühesten
  kollidierenden Namen. n Schreibweisen → n−1 Warnungen. §10 wird entsprechend präzisiert; §14.8 bestätigt.
- **Begründung:** Die allgemeine Regel „einmal pro Code+Stelle“ ist die stärkere Invariante (gilt für alle Warnungen),
  Interpreterverhalten bleibt.
- **Status:** fest.

### K-003 Zahlliterale und unäres Minus
- **Entscheidung:** Zahlliteral = `Ziffern[_Ziffern]*[.Ziffern[_Ziffern]*]`. Kein Exponent (`1e3`), kein führender
  (`.5`) oder abschließender Punkt (`5.`) – jeweils Syntaxfehler P0001. `-` ist ein Operator mit geringerer Bindung
  als Postfix: `-2.5.runden()` = `-(2.5.runden())`; nur ein nacktes `-Zahl`/`-Dauer` wird zu einem negativen Literal
  gefaltet. Für Methodenaufrufe auf negativen Zahlen Klammern setzen: `(-2.5).runden()`.
- **Begründung:** Entspricht §1/§5 und Java; portabler Lexer.
- **Status:** fest.

### K-004 Wertebereich von `salami`
- **Frage:** WASM.md will `salami` als `i32` – der Interpreter rechnet mit IEEE-754-Doubles ohne Überlauf.
- **Entscheidung:** `salami` ist eine **ganzzahlige IEEE-754-Double**: exakt bis ±2^53, darüber IEEE-Rundung
  (`9007199254740992 + 1 == 9007199254740992`), kein Zweierkomplement-Überlauf (`2147483647 + 1 = 2147483648`),
  Textform wie `String(x)` (`1e+21`). Ein Backend darf `i32`/`i64` nur mit Überlaufprüfung und Rückfall auf `f64`
  verwenden; beobachtbares Verhalten muss identisch sein.
- **Begründung:** Stabilität und Einfachheit; Schülerprogramme erwarten „große Zahlen funktionieren einfach“.
- **Betroffen:** WASM.md §1 Punkt 2 (Auftrag U-10: Formulierung „ungeboxt als i32“ relativieren).
- **Status:** fest (Interpreter), offen (WASM.md-Text).

### K-005 NaN und Infinity
- **Frage:** `Mathe.wurzel(-1)` liefert `NaN`, `Mathe.potenz(10, 400)` liefert `Infinity` – Fehler oder Wert?
- **Entscheidung:** IEEE-Semantik bleibt: `NaN`, `Infinity`, `-Infinity` sind gültige `funghi`-Werte mit genau
  diesen Textformen; `NaN == NaN` → `nein`; `salami` kann sie nicht halten (TypAnanas „keine Ganzzahl“).
  Division durch 0 (auch `0.0`) bleibt RechenAnanas (§5).
- **Begründung:** Kein Nachprüfen jeder Rechenoperation nötig (Wasm-Geschwindigkeit), Formatierung ist in der
  Laufzeit ohnehin JS-identisch; Java-Doubles verhalten sich gleich.
- **Status:** fest.

### K-006 Restoperator `%`
- **Entscheidung:** Rest mit dem Vorzeichen des Dividenden, auch für Kommazahlen (`-7.5 % 2 = -1.5`), `% 0` →
  RechenAnanas. Entspricht Java und Wasm `f64`-Semantik (`fmod`).
- **Status:** fest.

### K-007 Einheitliche Zahltext-Grammatik (`alsZahl`, `liesZahl`, `frageZahl`)
- **Frage:** `alsZahl()` akzeptiert JS-`Number()`-Formen (`0x1A`, `1e2`, `.5`, `_`), kein Komma; `liesZahl()` akzeptiert
  Komma, aber kein `_`, dafür Hex/Exponent. Nicht portabel und inkonsistent.
- **Entscheidung:** Eine Grammatik für alle drei: Leerraum außen entfernen, dann
  `[+-]? Ziffern[_Ziffern]* ( (.|,) Ziffern[_Ziffern]* )?` – Punkt **oder** Komma als Dezimaltrenner, Unterstriche wie
  in Literalen. Alles andere (Hex, Exponent, `.5`, `5.`, `Infinity`, Unicode-Ziffern) → TypAnanas. Fehlertexte bleiben:
  `alsZahl`: `"<text>" ist keine Zahl.`, `liesZahl`/`frageZahl`: `'<eingabe>' ist keine Zahl.`
- **Begründung:** Portabilität (Rust-Laufzeit muss keine JS-`Number()`-Grammatik nachbauen), Konsistenz mit §1 und
  deutschem Dezimalkomma; Spiele lesen Zahlen auf einem Weg.
- **Betroffen:** SPEC §11.1, §14.11, §15; Auftrag U-02 (Interpreter), U-07 (Doku).
- **Status:** offen (Test a11).

### K-008 `liesZahl`/`frageZahl` am Eingabeende
- **Frage:** `funghi x = Bestellannahme.frageZahl(…)` wirft bei EOF TypAnanas, weil `karton` nicht in `funghi` passt.
- **Entscheidung:** EOF liefert weiterhin `karton` (konsistent mit `lies()`; `hatMehr()` existiert). Neu: optionaler
  **Ersatzwert** `liesZahl(ersatz)` / `frageZahl(text, ersatz)` (auch benannt `ersatz: …`), der **nur bei EOF**
  zurückgegeben wird; ungültige Eingabe bleibt TypAnanas. Keine neue Ananas-Klasse.
- **Begründung:** Java-artig (`getOrDefault`), eine Zeile für Spiele-Autoren, keine Sonderregel im Typsystem,
  keine zusätzliche Fehlerart im HOST-ABI. (`standard` ist ein Schlüsselwort, daher `ersatz`.)
- **Betroffen:** SPEC §11.1; Auftrag U-03 (Interpreter), U-07 (Doku/Beispiele).
- **Status:** offen (Test a11).

### K-009 Zeilen lesen: Trimmen, Umbruch, EOF, Prompt
- **Entscheidung:** `lies()` liefert die Zeile unverändert (kein Trimmen), nur **ein** abschließendes `\n` bzw. `\r\n`
  wird entfernt; leere Zeile → `""`; Unicode bleibt (Länge = Codepoints). `liesZahl` trimmt. Eine ungültige Zahlzeile
  ist **verbraucht**. Der Prompt von `frage`/`frageZahl` wird **vor** dem Lesen ausgegeben – auch wenn danach EOF folgt.
  Nach EOF liefert jeder weitere Aufruf `karton`, `hatMehr()` → `nein`; das `eingabe`-Ereignis trägt dann `text: null`.
- **Status:** fest.

### K-010 Eingabe, Schritte, Budgets, Phasen
- **Entscheidung:** Ein Lesevorgang kostet nur seine Ausdrucksknoten (`Bestellannahme.lies();` = 3 Schritte), Warten
  kostet nichts – also auch kein Ofen-/Lieferbudget. Eingabe ist in **allen** Phasen verfügbar (statische
  Initialisierer, Top-Level, `hauptgang`, `wennDa`-Phase nach Programmende). Ein `@Kühlschrank`-Treffer liest nicht
  erneut. Mit `onEingabe` ist `hatMehr()` immer `ja`.
- **Status:** fest.

### K-011 Wer gibt den Prompt aus? (HOST-ABI)
- **Frage:** Modul (als `schreibe`) oder Host aus `prompt_ptr/len`?
- **Entscheidung:** Das **Programm** (Interpreter bzw. Wasm-Modul über `ausgabe` mit Umbruch-Flag 0) gibt den Prompt
  aus; `prompt` in `onEingabe`-Anfrage und HOST-ABI ist **informativ** (z. B. Platzhalter des Eingabefelds) und darf
  vom Host nie zusätzlich ausgegeben werden.
- **Begründung:** Genau eine Quelle für den Ereignisstrom; so verhält sich der Interpreter, so prüfen `.erwartet`-Dateien.
- **Betroffen:** EINGABE.md §2/§4 (Präzisierung), HOST-ABI.md (Auftrag U-11), Host (U-12).
- **Status:** fest (Interpreter), Host-Annahme bestätigt.

### K-012 Kanal des Panik-Banners; Hawaii in der Web-UI (Nutzerentscheidung)
- **Entscheidung (vom Nutzer getroffen):** (1) Der Panik-Banner geht bei CLI, nativem Host und EXE nach **stderr**
  (wie `fehler`-Ereignisse); `ausgabe`/`fehlerausgabe` wie bisher (stdout/stderr). Exit-Code 39. In `.erwartet`-Dateien
  bleibt der Banner enthalten (ARCHITEKTUR §3 – Ereignisstrom, nicht Kanal). (2) Die **Web-UI behandelt Hawaii nicht
  besonders**: kein Crash-Overlay, kein Sofort-Terminate; der Banner erscheint als normale Fehlerausgabe in der Konsole,
  der Exit-Code 39 wird wie jeder andere angezeigt.
- **Betroffen:** `bin/pizza.js` (bereits stderr), `pizza-host` (Auftrag U-12: stdout → stderr), HOST-ABI §7 (bestätigt),
  ARCHITEKTUR §2/§5 (hier angepasst), SPEC §9 (Satz ergänzt), UI/E2E (U-22: Overlay entfernen; README und Doku
  beschreiben kein Overlay – nichts zu ändern).
- **Status:** fest (Vertrag), offen (Host, UI, Doku).

### K-013 Lange Eingabezeilen (HOST-ABI)
- **Entscheidung:** **Keine Kürzung** in keinem Motor (Interpreter kürzt nicht). HOST-ABI: `eingabe(...)` liefert die
  benötigte Bytelänge; passt sie nicht in `puffer_kap`, schreibt der Host **nichts**, behält die Zeile und das Modul
  ruft mit größerem Puffer erneut. `-1` bleibt EOF.
- **Begründung:** Einziges Verhalten, das in allen drei Motoren identische Ereignisse liefert, ohne dem Interpreter
  ein künstliches Limit aufzuerlegen.
- **Betroffen:** HOST-ABI.md + Laufzeit (U-11), Host (U-12).
- **Status:** offen.

### K-014 Interne Fehler (Wasm-Trap, JS-Exception, Host-Fehler)
- **Entscheidung:** Ereignis `fehler` mit `code: "LaufzeitAnanas"`, `art: "ananas"`, Text **exakt**
  `Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.` (plus ` (Zeile N)`, wenn bekannt), Exit 1.
  Motorspezifische Details kommen in ein **optionales Feld `detail`** (nicht in `.erwartet`, von Differenztests ignoriert).
- **Begründung:** Vergleichbare Ereignisse über Motoren; Details bleiben für die Fehlersuche erhalten.
- **Betroffen:** Interpreter (U-04), Host (U-12), Compiler/Laufzeit (U-11), Differenztests (U-14), ARCHITEKTUR §1 (Hinweis).
- **Status:** offen.

### K-015 `abbrechen`/`weiter` außerhalb einer Schleife
- **Frage:** Heute beendet `abbrechen` in Methode/Lambda/Ofen still den Block (Wert `karton`); §4 schweigt.
- **Entscheidung:** **Parse-Fehler** `PizzaFehler P0012: 'abbrechen' steht außerhalb einer Schleife.` bzw.
  `… 'weiter' …` (art `syntax`, Exit 2, auch von `PizzaLang.parse` gemeldet). Erlaubte Kontexte: `abbrechen` im Rumpf
  von `solange`/`für` oder im Arm einer `wähle`-**Anweisung**; `weiter` nur im Schleifenrumpf. Methoden-, Konstruktor-,
  Lambda- und Ofen-Rümpfe beginnen einen neuen Kontext (eine umgebende Schleife zählt nicht).
- **Begründung:** Java-Verhalten, statisch prüfbar (gut für den Compiler), stilles Verschlucken ist eine Fehlerquelle.
- **Betroffen:** Interpreter-Parser (U-05), `tests/differenz/korpus/kontrolle-ausserhalb-schleife.pizza` (U-15), Doku (U-07).
- **Status:** offen (Test a11).

### K-016 Besitzprüfung ist syntaktisch; `schieb` für alle Typen
- **Entscheidung:** BesitzAnanas nur, wenn die rechte Seite einer Deklaration/Zuweisung ein **Name oder Feldzugriff**
  ist (Klammern darum ändern nichts) und zu einer Pizza auswertet. `?:`, Blech-Literale, Methodenrückgaben
  (`m.hole(k)`, `s.pizza()`) lösen sie nicht aus. `schieb(x)` funktioniert für Variablen **jeden** Typs (danach
  weggeschoben), nicht für Felder (`schieb(k.p)` → LaufzeitAnanas „schieb braucht genau einen Variablennamen“).
- **Begründung:** Laufzeit-Referenzzählung wäre teuer und schwer portabel; die syntaktische Regel ist stabil und lehrbar.
- **Status:** fest.

### K-017 Identität von Pizzen, Gleichheit und Schlüssel
- **Entscheidung:** Der `teile`-Zähler (`übrig`) hängt am Pizza-Objekt; `p + Belag`/`p - Belag` erzeugen eine neue
  Pizza mit `übrig() == 8`. `==` und `Blech.enthält` vergleichen Pizzen nach Belägen. **Speisekarten-Schlüssel**:
  Zahlen, Texte, Wahrheitswerte, `karton` nach Wert (`1` und `1.0` gleich), Beläge nach Name, quattrostagioni-Werte als
  solche, alles andere (Pizza, Dauer, Blech, Objekte) nach **Identität**.
- **Begründung:** Stabilität; strukturelles Hashing wäre für den Wasm-Pfad unnötig komplex.
- **Status:** fest.

### K-018 Kühlschrank-Schlüssel und gecachte Werte
- **Entscheidung (präzisiert §14.10):** Schlüssel = **Textform** der Argumente (Blech/Pizza/Dauer nach Inhalt, `1` = `1.0`,
  `"1"` ≠ `1`), Objekte eigener Klassen nach **Identität** (unabhängig von `alsText`). Geworfene Ananas werden nicht
  gecacht (nächster Aufruf rechnet erneut). Gecachte Werte werden **per Referenz** zurückgegeben (dieselbe Pizza, dasselbe Blech).
- **Status:** fest.

### K-019 Lieferung: Rückruf, Trinkgeld, Endgültigkeit
- **Entscheidung:** `wennDa` **ersetzt** einen früheren Rückruf. `trinkgeld(n)` akzeptiert jede Zahl (auch negativ oder
  gebrochen), Faktor `1 + Summe/10` kann ≤ 0 werden → sofort zu spät. Eine Zustellung ist endgültig: weiteres `warte`
  oder `trinkgeld` ändert sie nicht.
- **Status:** fest.

### K-020 Ofen-Randwerte
- **Entscheidung:** `temperatur ≤ 0` oder `zeit = 0` → Budget 0 → der erste Schritt überschreitet (roh-Zweig bzw.
  VerbranntAnanas). `temperatur` muss eine Zahl sein (nicht notwendig ganzzahlig); Grenze exakt `> 485` (485 erlaubt,
  485.5 Verbrannt). Positionsargumente `ofen(250, 1s)` erlaubt (§14.2).
- **Status:** fest.

### K-021 Bereich `[a .. b]`
- **Entscheidung:** a, b beliebige Zahlen (sonst TypAnanas); Schritt 1 ab `a` (auch nicht-ganz: `[0.5 .. 2.5]` =
  `[0.5, 1.5, 2.5]`), inklusive bis `b`, absteigend bei `a > b`; mehr als 10 000 001 Elemente →
  `RechenAnanas: Der Bereich ist zu groß für ein Blech.`
- **Status:** fest.

### K-022 `sortiere`
- **Entscheidung:** stabil; Vergleichsfunktion muss eine Zahl liefern (sonst TypAnanas), nur das **Vorzeichen** zählt
  (inkonsistente Funktionen → Reihenfolge unspezifiziert). Ohne Funktion nur Zahlen, Texte (UTF-16-Codeeinheiten,
  §14.6), Dauern, Werte eines quattrostagioni; `diavolo`, Pizzen, Objekte → TypAnanas.
- **Status:** fest.

### K-023 Preisrundung und Sonderpreise
- **Entscheidung:** Für Standardbeläge wird je Schicht `runde2(preis_unten + Standardpreis)` gebildet (vermeidet
  `0.30000000000000004`); eigene `preis()`-Methoden liefern ungerundet. `Ananas.preis()` = 0; eigene Beläge ohne
  Tabellenpreis 1.00 (auch als `Belag.preis()`).
- **Status:** fest.

### K-024 Nachgestellte Kommas
- **Entscheidung:** erlaubt im Blech-Literal (`[1, 2,]`) und in `quattrostagioni { A, B, C, D, }`; Syntaxfehler im
  Pizza-Literal, in Argument- und Parameterlisten, Deklarationen.
- **Status:** fest.

### K-025 Text-Escapes
- **Entscheidung:** genau `\n \t \r \" \\ \'`; jede andere Sequenz (auch `\u…`) →
  `P0001: Unbekannte Escape-Sequenz '\x' im Text.`; Zeilenumbruch im Text → Syntaxfehler. §1 ergänzt um `\r`, `\'`.
- **Status:** fest.

### K-026 Hawaii-Auslöser präzisiert
- **Entscheidung:** Panik bei **jeder** Zuweisung an eine `hawaii`-Variable/-Feld/-Parameter – auch `karton`
  (`hawaii x = karton;`); Deklaration ohne Initialisierer → keine Panik. `Blech<hawaii>` → nur W0666. Der Belag-Wert
  `Ananas` allein (`Bote.sage((Ananas))`, `p.hat(Ananas)`, `p - Ananas`, `Ananas.preis()`) → keine Panik.
  W0666 löst aus: Typ `hawaii`, bloßer Name `Ananas` als Wert, `Ananas` im Pizza-Literal – nicht Mitgliedsnamen
  (`Q.Ananas`, `k.Ananas()`) oder Deklarationsnamen. Panik gilt in allen Phasen (auch Lieferungen, `wennDa`-Phase).
  `neu Hawaii(...)` paniert auch ohne Klasse `Hawaii`.
- **Status:** fest.

### K-027 Textform-Mehrdeutigkeiten
- **Entscheidung:** Texte in Blech/Speisekarte erscheinen ohne Anführungszeichen; `[""]` wird `[]`, `{1: a, 1: b}`
  (Zahl 1 und Text "1") ist möglich. Bewusst beibehalten (Lesbarkeit für Anfänger); wer unterscheiden muss, nutzt `länge()`.
- **Status:** fest.

### K-028 Benannte Argumente bei eingebauten Funktionen
- **Entscheidung:** Builtins kennen nur die dokumentierten Namen (`stellen`, `start`, `max`, `temperatur`, `zeit`,
  `haltbar`, `grund`, `ersatz`); unbekannte benannte Argumente werden **ignoriert** (`Mathe.max(a: 1, b: 2)` →
  „max() ohne Zahlen?“). Bei eigenen Methoden gilt bei Doppelbelegung Position + Name der Positionswert. Beibehalten.
- **Begründung:** Stabilität; ein Fehler wäre schöner, lohnt aber den Eingriff derzeit nicht (Kandidat für später).
- **Status:** fest.

### K-029 `Spiegel.felder` und Calzone
- **Entscheidung:** nur Instanzfelder (keine `tiefkühl`-Felder), Basisklassen zuerst; `karton` → LeererKartonAnanas,
  Nicht-Objekt → TypAnanas. Unterklassen einer Calzone sind zugeklappt. `aufklappen()` auf Nicht-Calzone →
  LaufzeitAnanas; mehrfach → W0013 je Stelle. `speisekarte`-Felder einer Calzone sind von außen lesbar.
- **Status:** fest.

### K-030 Panik-Banner in Doku-`ausgabe`-Blöcken
- **Entscheidung (bestätigt ARCHITEKTUR §4, Interpreter-Agent):** In Doku-`ausgabe`-Blöcken ist der Banner optional
  (Prüfstand `ohnePanik`); in Beispiel-`.erwartet`-Dateien steht er immer (ARCHITEKTUR §3).
- **Status:** fest.

### K-031 Ein-/Ausgabe als SPEC §11.1
- **Entscheidung:** EINGABE.md wird als §11.1 Vertragstext übernommen, mit diesen Präzisierungen: Einträge von
  `optionen.eingabe` sind Texte; `onEingabe`, das `undefined` liefert oder wirft, gilt als EOF, andere Nicht-Texte werden
  zu Text; Prompt-Ereignis `{typ:"ausgabe", umbruch:false}`; `eingabe`-Ereignis nach **jedem** Leseversuch (bei EOF
  `text: null`); `.erwartet`: Prompt ohne Umbruch, Eingabe-Echo nie, `leeren` als `«leeren»`.
- **Status:** fest.

### K-032 Rekursionstiefe (Info)
- Lambdas zählen in die Aufruftiefe 900 (§14.4) – Umsetzung durch den Interpreter-Agent angekündigt; keine eigene Klärung.

### K-033 `hauptgang`-Signatur
- **Entscheidung:** Es zählt der Name `hauptgang` (erste Klasse in Quelltextreihenfolge, sonst Top-Level-Funktion);
  Signatur ungeprüft: ohne Parameter erlaubt, der erste Parameter erhält das Args-Blech (Typprüfung wie üblich),
  mehr als ein Parameter → Aritätsfehler; Rückgabewert wird ignoriert.
- **Status:** fest.

### K-034 `karton` in `margherita`
- **Entscheidung (bestätigt §14.6):** `margherita` darf `karton` halten (Text ist ein Referenztyp); §8 „für alle
  Nicht-Primitive“ wird zu „für alle Typen außer `salami`, `funghi`, `diavolo`“. Doku 10:typen widerspricht → U-07.
- **Status:** fest.

### K-035 `istAufgegangen()`
- **Entscheidung:** `ja` genau dann, wenn `gehenlassen()` aufgerufen wurde – nicht schon, wenn der Wert (durch `backen()`)
  berechnet ist. Doku 20:pf-teig korrigieren (U-07).
- **Status:** fest.

### K-036 `serviere` und Rückgabetyp
- **Entscheidung:** Der Rückgabetyp wird nicht geprüft: `serviere;` in einer Nicht-`leer`-Methode liefert `karton`,
  `serviere (x);` in einer `leer`-Methode liefert `x` (Aufrufer darf ihn benutzen), Methodenende ohne `serviere` → `karton`.
  Doku „Nur in leer-Methoden…“ abschwächen (U-07).
- **Status:** fest.

### K-037 Basiskonstruktor ohne `unten(…)`
- **Entscheidung:** Fehlt `unten(…)`, wird der Basiskonstruktor **ohne Argumente** aufgerufen; gibt es nur
  Basiskonstruktoren mit Parametern → `LaufzeitAnanas: Konstruktor von 'Basis' erwartet N Argument(e), bekam 0.`
  (kein stilles Überspringen). Klassen ohne eigenen Konstruktor reichen Argumente an die Basis durch (§14.9). §3 präzisiert.
- **Status:** fest.

### K-038 `auto` außerhalb von `schneide`
- **Frage:** `Bote.sage((auto))` gibt `auto` aus (globaler Sentinel), `blech / auto` → TypAnanas „Unbekanntes“.
- **Entscheidung:** `auto` ist nur als Argument von `schneide(auto)` gültig; jede andere Verwendung des undeklarierten
  Namens → `LaufzeitAnanas: 'auto' ist nicht definiert.` Eine eigene Variable `auto` ist erlaubt und gewinnt.
- **Begründung:** Kein Sentinel-Wert im Typsystem (Wasm-Laufzeit braucht keinen „Unbekanntes“-Typ).
- **Betroffen:** Interpreter (U-21). **Status:** offen (Test a11).

### K-039 Pizza-Methoden mit Text
- **Entscheidung:** `p.hat("Tomate")` akzeptiert einen Belagnamen als Text (gleich `p.hat(Tomate)`); `p + "x"` ist
  Textverkettung (§5: `+` mit Text). Beibehalten und dokumentieren (U-07).
- **Status:** fest.

### K-040 Textordnung (Compiler-Hinweis)
- **Entscheidung (bestätigt §14.6):** `<`/`sortiere` ordnen nach **UTF-16-Codeeinheiten** (`"😀" < "￿"` → `ja`), während
  `länge()`/`zeichen()`/`zerlege("")`/`für` Codepoints zählen. Die Rust-Laufzeit muss `encode_utf16`-Vergleich nutzen.
- **Betroffen:** WASM.md §2 (U-10), Differenz-Korpus (U-15: Fall mit U+1F355 vs. U+FF5E).
- **Status:** fest (Sprache), offen (Vertragstext WASM.md).

### K-041 HOST-ABI: Umbruch-Flag vs. `schreibe`
- **Entscheidung:** Separater Import `schreibe(ptr, len)`; `ausgabe(ptr, len)` bleibt zweistellig. Die undokumentierte
  Dreier-Form im Host entfällt.
- **Betroffen:** EINGABE.md §4 (U-09), Host (U-12), HOST-ABI.md (U-11). **Status:** offen.

### K-042 EOF ist endgültig
- **Entscheidung:** Hat ein Leseversuch EOF geliefert, liefern alle weiteren EOF – in jedem Motor. Ein `null`-Eintrag in
  `optionen.eingabe` bedeutet EOF ab dieser Stelle (spätere Einträge werden ignoriert). `hatMehr()` nach EOF → `nein`.
- **Begründung:** EINGABE.md §1 („nach EOF erneut → wieder karton“), Host-stdin verhält sich so.
- **Betroffen:** Interpreter (U-16). **Status:** offen (Test a11).

### K-043 Host-Ladefehler
- **Entscheidung:** Kann ein Host ein `.pkarton` nicht laden (ungültig, falsche ABI-Version), sendet er
  `{typ:"fehler", code:"HOST", art:"intern", text:"PizzaFehler HOST: <Grund>"}` und `ende` mit **Exit 2** (wie
  PizzaFehler – das Programm wurde nie gestartet), nicht `art:"ananas"`.
- **Betroffen:** HOST-ABI.md §4/§9 (U-11), Host (U-12), ARCHITEKTUR §1 (`art` erweitert). **Status:** offen.

### K-044 `art`-Werte und Wand-Zeitlimit der UI
- **Entscheidung:** `art` ∈ {`syntax`, `pizzafehler`, `ananas`, `limit`, `intern`}. `intern` = Fehler von Host/Worker **vor**
  dem Programmstart (K-043 Ladefehler, Worker-/WASM-Instanziierungsfehler); interne Fehler eines **laufenden** Motors
  bleiben `art: "ananas"` (K-014). Das 10-s-Wand-Zeitlimit der UI/CLI meldet
  `{typ:"fehler", code:"P0003", art:"limit", text:"PizzaFehler P0003: Die Pizza ist noch im Ofen. (Zeitlimit von 10 s erreicht)"}`,
  Exit 3 – nicht P0002 (das ist das Schrittlimit). `W-WASM`/`wasm` im Worker → `art:"intern"`, Code `WASM`.
- **Betroffen:** ARCHITEKTUR §1 (hier geändert), UI (U-17), Worker (U-17). **Status:** offen (UI).

### K-045 WASM.md vs. HOST-ABI.md
- **Entscheidung:** Bei Widersprüchen gilt **HOST-ABI.md** (`panik` darf zurückkehren, Modul wickelt ab; `schritte()`/`zeitMs()`
  als Exportfunktionen). WASM.md wird angeglichen (U-10).
- **Status:** offen (Vertragstext).

### K-046 Kanonische Ereignisform und Exit-Codes
- **Entscheidung:** `umbruch` wird bei `Bote.sage` **weggelassen** (kanonisch); Vergleicher behandeln `umbruch:true` wie
  fehlend. Exit-Codes sind genau {0, 1, 2, 3, 39}; liefert ein Modul etwas anderes, behandelt der Host das als internen
  Fehler (K-014, Exit 1).
- **Betroffen:** Differenztests (U-14), HOST-ABI §5 (U-11), Host (U-12). **Status:** offen.

### K-047 Ganzzahlige Uhr
- **Frage:** `Uhr.vorspulen(0.5ms)` macht `zeitMs` = 10.5; Budgets mit Bruch-Millisekunden.
- **Entscheidung:** Die simulierte Uhr zählt **ganze Millisekunden**: `Uhr.vorspulen(d)` rundet `d` kaufmännisch auf
  ganze ms (`0.5ms` → 1, `0.4ms` → 0); `schritte` und `zeitMs` sind stets Ganzzahlen; Budgets sind `floor(...)`
  (Ofen bereits, Lieferung: `floor(max_ms × Faktor)`). Dauer-Werte selbst bleiben Kommazahlen (`10s / 3`).
- **Begründung:** Portabel (i64-Zähler), vergleichbar, §14.2 spricht von „Uhr-Millisekunden“.
- **Betroffen:** Interpreter (U-18), Host-JSON (U-12). **Status:** offen (Test a11).

### K-048 Rundungsformel
- **Entscheidung (präzisiert §14.11):** `x.runden()`/`Mathe.runden(x)` = `sign(x) · round(|x|)` (half away from zero, keine
  Epsilon-Korrektur); `x.runden(n)`/`Mathe.runden(x, n)` mit n > 0 = `sign(x) · round(|x| · 10^n + 1e-9) / 10^n`;
  `euro()` = `round(|x| · 100 + 1e-9) / 100`, Vorzeichen davor, Komma, zwei Stellen, `-0,00 €` nie (→ `0,00 €`).
  Referenzwerte: `2.675.runden(2)` = 2.68, `1.005.runden(2)` = 1.01, `0.125.runden(2)` = 0.13, `(-0.5).runden()` = −1,
  `0.015.euro()` = `0,02 €`, `(-0.001).euro()` = `0,00 €`.
- **Status:** fest.

### K-049 Zufall verbindlich
- **Entscheidung:** §11 „z. B. mulberry32“ → verbindlich mulberry32, Seed 42, `a + floor(r · (b − a + 1))`;
  Nicht-Ganzzahl → `TypAnanas: Zufall.zahl braucht eine Ganzzahl, nicht 2.5.`; erste Werte von `zahl(1, 6)`: 4, 3, 6, 5, 2, 4, 2, 4, 6, 3.
- **Status:** fest.

### K-050 `eingabe` für Doku-Codeblöcke
- **Entscheidung:** Ein Doku-Codeblock darf `eingabe: string[]` tragen (ARCHITEKTUR §4); alle Harnische (Interpreter-Tests,
  Prüfstand, Differenz, E2E) übergeben es als `optionen.eingabe`. Ohne Feld → EOF.
- **Betroffen:** tests/run-tests.js (U-06), pruefstand/run.js (U-19). **Status:** offen.

### K-051 `.eingabe`-Fallback
- **Entscheidung:** Vertraglich ist das Manifestfeld `eingabe`; eine gleichnamige `.eingabe`-Datei neben der `.pizza`
  ist als Fallback erlaubt und muss von allen Harnischen gleich behandelt werden; Prüfstand Teil B prüft, dass jede
  `.eingabe`-Datei referenziert wird und `interaktiv: true` eine `eingabe` hat.
- **Betroffen:** Prüfstand (U-19). **Status:** offen.

### K-052 Schluss-Zeilenumbruch von `.erwartet`
- **Entscheidung:** `.erwartet` endet mit genau einem `\n` (ARCHITEKTUR §3); Harnische normalisieren beidseitig höchstens
  **einen** Schluss-Umbruch, damit `Bote.sage((""))` am Programmende prüfbar bleibt.
- **Betroffen:** tests/run-tests.js (U-06), Prüfstand (U-19). **Status:** offen.

### K-053 `schrittLimit`-Sonderwerte
- **Entscheidung (fest, entspricht HOST-ABI §3):** `schrittLimit` ≤ 0, fehlend oder NaN → Standard 5 000 000;
  nicht-ganzzahlig → Abbruch beim Schritt `floor(limit) + 1` (`10.5` → Schritt 11).
- **Status:** fest.

### K-054 `leeren` im Terminal
- **Entscheidung:** CLI und Host senden bei TTY `\x1b[2J\x1b[3J\x1b[H` (löscht auch den Scrollback); ohne TTY nichts.
- **Betroffen:** bin/pizza.js (U-13). **Status:** offen (kosmetisch).

---

## Offene Umsetzungen (Aufträge für andere Agents)

| Nr. | Datei(en) | Was | Testfall |
|---|---|---|---|
| U-01 (optional) | `site/js/pizza.js` (Parser) | Fehlertext bei `f((A, B))` ergänzen: „Hinweis: Pizza-Literal im Aufruf braucht drei Klammern: f(((A, B)))“ | a10 K-001 (Code bleibt P0001) |
| U-02 | `site/js/pizza.js` (`alsZahl`, `alsEingabeZahl`) | K-007: gemeinsame Grammatik `[+-]?Ziffern[_Ziffern]*((.|,)Ziffern[_Ziffern]*)?` nach trim; Hex/Exponent/`.5`/`5.`/`Infinity` → TypAnanas; Fehlertexte unverändert | a11 K-007 (3 Fälle) |
| U-03 | `site/js/pizza.js` (`Bestellannahme`) | K-008: `liesZahl(ersatz)`, `frageZahl(text, ersatz)`, auch benannt `ersatz:`; nur bei EOF; `onEingabe`-Anfrage unverändert | a11 K-008 (2 Fälle) |
| U-04 | `site/js/pizza.js` (`behandleEnde`, `run`) | K-014: Text interner Fehler exakt `Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.` (+ ` (Zeile N)`), Details in Feld `detail` | nicht automatisierbar (Code-Review) |
| U-05 | `site/js/pizza.js` (Parser) | K-015: P0012 für `abbrechen`/`weiter` außerhalb Schleife (bzw. `wähle`-Anweisung für `abbrechen`); Kontext-Reset an Methoden-/Konstruktor-/Lambda-/Ofen-Rümpfen; `parse()` meldet ihn | a11 K-015 (5 Fälle) |
| U-06 | `tests/faelle/`, `tests/run-tests.js` | Eigene Interpreter-Tests für U-02/U-03/U-05 | – |
| U-07 | `site/js/doku/*.js` | K-007 (Zahltext-Grammatik, Dezimalkomma), K-008 (`ersatz`), K-015 (P0012), K-003 (`(-2.5).runden()`), K-005 (NaN/Infinity), K-026 (Hawaii-Auslöser) dokumentieren; Spiele-Beispiele dürfen `frageZahl(text, ersatz)` nutzen | Doku-Harness |
| U-08 | `site/beispiele/spiele/*.pizza` (optional) | Workarounds „Text lesen + alsZahl“ durch `frageZahl(text, ersatz)` ersetzen, sobald U-03 da ist | Beispiel-Tests |
| U-09 | `EINGABE.md` (Koordinator) | K-008/K-011/K-013 nachziehen oder EINGABE.md auf SPEC §11.1 verweisen lassen | – |
| U-10 | `WASM.md` §1 Punkt 2 | K-004: „ungeboxt als i32“ → „als f64 bzw. i32/i64 mit Überlaufprüfung; beobachtbar wie ganzzahlige Doubles“ | Differenztests |
| U-11 | `HOST-ABI.md`, `laufzeit/`, `site/js/pizzaiolo*` (Compiler-Agent) | K-011 (prompt informativ, Modul gibt Prompt aus), K-013 (Retry-Protokoll statt Kürzung: Rückgabe = benötigte Länge, Host schreibt nichts, wenn `puffer_kap` zu klein), K-014 (`detail`-Feld, fester Text), K-012 (Banner → stdout-Pfad des Hosts) | tests/differenz |
| U-12 | `host/src/*.rs` (Native-Host-Agent) | K-011 (Prompt nicht ausgeben), K-013 (Zeile puffern, Retry), K-014 (fester Text + `detail`), K-012 (Banner → **stderr**, derzeit stdout), K-041 (Dreier-Form von `ausgabe` entfernen), K-043 (Ladefehler `code:"HOST"`, `art:"intern"`, Exit 2), K-046 (unbekannte Exit-Codes → interner Fehler), K-047/§14.11 (JSON-Zahlen wie `String(x)`) | ABI-Tests |
| U-13 | `bin/pizza.js` | K-054: `leeren` → `\x1b[2J\x1b[3J\x1b[H` bei TTY (K-012 ist in der CLI bereits erfüllt: Banner auf stderr) | manuell |
| U-22 | `ui/**`, `e2e/**` (UI-/E2E-Agent) | K-012: Crash-Overlay und Sofort-Terminate bei `panik` entfernen; Banner als Fehlerausgabe in der Konsole, Exit 39 normal; E2E-Erwartung „Overlay bei Exit 39“ anpassen (README und Doku enthalten keine Overlay-Beschreibung) | e2e |
| U-14 | `tests/differenz/vergleich.js` | K-014: Feld `detail` beim Vergleich ignorieren | – |
| U-15 | `tests/differenz/korpus/` | K-015: `kontrolle-ausserhalb-schleife.pizza` auf P0012 (Exit 2) umstellen; K-040: Korpusfall Textordnung U+1F355 vs. U+FF5E | tests/differenz |
| U-16 | `site/js/pizza.js` (`liesZeile`) | K-042: EOF endgültig (Flag setzen; `null`-Eintrag in `eingabe` = EOF ab dort) | a11 K-042 |
| U-17 | `ui/src/ausfuehrung.js`, `site/js/worker.js` (UI-Agent) | K-044: Wand-Zeitlimit → `P0003`/`art:"limit"`; Worker-Fehler → `art:"intern"`, Code `WASM`/`INTERN` | e2e |
| U-18 | `site/js/pizza.js` (`Uhr.vorspulen`, `warte`) | K-047: `vorspulen` rundet auf ganze ms; Lieferbudget `floor(max_ms × Faktor)`; `zeitMs` ganzzahlig | a11 K-047 |
| U-19 ✅ | `pruefstand/run.js`, `pruefstand/teil-b.js` | erledigt (Klärungs-Agent): Doku-`eingabe`, Manifestfeld `eingabe` + `.eingabe`-Fallback, B1 prüft `interaktiv`/verwaiste `.eingabe`, nur ein Schluss-Umbruch, Banner beidseitig entfernt; `*-offen.js`-Fälle zählen nicht als Fehlschlag und melden grüne Fälle als „nach a10 verschieben“ | Prüfstand selbst |
| U-20 ✅ | `ARCHITEKTUR.md` §6 | erledigt (Klärungs-Agent): Testfall-Dateiformate dokumentiert | – |
| U-21 | `site/js/pizza.js` (`globalerName`, `aufrufZiel`) | K-038: `auto` nur als `schneide`-Argument; sonst `LaufzeitAnanas: 'auto' ist nicht definiert.` | a11 K-038 |

Doku-Aufträge (U-07) im Detail – aus der Doku-Prüfung des Klärungs-Agenten (Abweichungen Doku ↔ Interpreter/SPEC):
10:typen (karton in margherita, K-034) · 20:pf-teig (`istAufgegangen`, K-035) · 20:pf-lieferung (`wennDa` + `warte`
klingelt sofort, §14.3; `istGeliefert`, `warte()` ohne max, Trinkgeld kumuliert, Ananas erst bei `wert()`) ·
10:operatoren/10:methoden-lambdas („Nur in leer-Methoden“, K-036; Blech/Speisekarte `==` nach Identität; Enum `<`) ·
10:vererbung (Basiskonstruktor-Pflicht, K-037) · 10:programmaufbau/30:ref-keywords (`hauptgang`-Signatur K-033;
`Bestellannahme`, `Bote.schreibe/leeren` im Spickzettel) · 30:std-* (fehlende Methoden `endetMit`, `istLeer`, `alsText`,
`potenz`, `runden(x, n)`, variadische `max/min`, `kopie`, `Speisekarte.istLeer`, `inMinuten`, `Dauer / Dauer`, `summe` auf
Dauern, `rufe`, benannte `start:`/`stellen:`; Rückgabewerte von `entferne`/`setze`/`hinzu`; Leer-Fälle; Mutation vs. Kopie
kennzeichnen; Speisekarten-Reihenfolge und Schlüsseltypen K-017; Rundung „kaufmännisch“ K-048; `alsZahl`-Grammatik K-007;
Textform-Tabelle aus SPEC §5 übernehmen – der Querverweis „Kapitel Ausdrücke“ ist tot; Tipp „Methoden lieber auf Variablen“
streichen) · 20:stuecke-ownership (Prüfung syntaktisch K-016, `p + X` wieder 8 Stücke K-017) · 20:pf-ofen („über 485“, positional) ·
20:pf-schneiden (`auto` K-038, `/ 0` RechenAnanas, n > Länge) · 20:pizza-literale (`hat("Text")` K-039) · 30:ref-codes (W0003 pro
Methode, W0666 pro Programm) · 30:ref-playground (Zeitlimit-Text an UI angleichen, K-044) · 10:kontrollfluss (Bereich rückwärts, K-021).

## Hinweise an den Koordinator
- Stand des letzten Prüfstand-Laufs: alle 13 a11-Fälle (K-007, K-008, K-015, K-038, K-042, K-047) werden mit der **uncommitteten** Arbeitskopie von `site/js/pizza.js` bereits grün gemeldet – sobald der Interpreter-Agent committet hat, die Fälle nach a10 verschieben und die Status in diesem Protokoll/SPEC §15 auf „fest“ setzen.
- Die Prüfstand-Gruppe „§15 Klärungen – Umsetzung offen“ (a11) ist absichtlich rot (derzeit 1/10 grün), bis U-02, U-03
  und U-05 umgesetzt sind; danach die Fälle nach a10 verschieben.
- Von den im Auftrag genannten Beispielen waren Pizza-Literal, W0032, Panik-Banner, Schrittzählung, Zahlformatierung,
  Blech-Mutation und `karton` je Typ bereits in SPEC §14 (Interpreter-Agent) geklärt; dieses Protokoll bestätigt und
  ergänzt sie (K-001, K-002, K-005, K-010, K-017, K-030) und fügt die neuen Punkte aus EINGABE/HOST-ABI hinzu.
