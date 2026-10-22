# Klärungsprotokoll pizza v3.0 (K-001 …)

Entscheidungsprotokoll des Klärungs-Agenten. Jede Klärung ist verbindlich und in `SPEC.md` §15 (bzw. §11.1)
als Vertragstext eingearbeitet; Regressionstests liegen in `pruefstand/faelle/a10-klaerungen.js` (grün) und
`pruefstand/faelle/a11-klaerungen-offen.js` (Fälle mit ausstehender Umsetzung; zählen nicht als Fehlschlag, derzeit leer).

Leitlinien (in dieser Reihenfolge): (a) bestehendes, sinnvolles Interpreter-Verhalten bevorzugen, (b) Konsistenz
mit Java-artigen Erwartungen und der Pizzeria-Metapher, (c) Portabilität für den Wasm-/EXE-Pfad, (d) Einfachheit.

Die 21 „Klarstellungen“ (Kl. 1–21) des Koordinators, auf die der Prüfstand verweist, sind inzwischen in SPEC §14
eingearbeitet (Interpreter-Agent). Dieses Protokoll ergänzt §14, wiederholt es nicht; wo eine Klärung §14 bestätigt
oder präzisiert, steht das dabei.

Status: **fest** = Interpreter entspricht, Test grün (a10) · **offen** = Interpreter-/Doku-/Host-Änderung nötig
(Auftrag unten, Test in a11 oder nicht automatisierbar).

---

## Entscheidungen

### K-001 Pizza-Literal und Aufrufklammern *(abgelöst durch K-105 – es gibt kein Pizza-Literal mehr)*
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
- **Betroffen:** SPEC §11.1, §14.11, §15; U-02 (Interpreter, umgesetzt in 0d34810), U-07 (Doku).
- **Status:** fest (Tests a10).

### K-008 `liesZahl`/`frageZahl` am Eingabeende
- **Frage:** `funghi x = Bestellannahme.frageZahl(…)` wirft bei EOF TypAnanas, weil `karton` nicht in `funghi` passt.
- **Entscheidung:** EOF liefert weiterhin `karton` (konsistent mit `lies()`; `hatMehr()` existiert). Neu: optionaler
  **Ersatzwert** `liesZahl(ersatz)` / `frageZahl(text, ersatz)` (auch benannt `ersatz: …`), der **nur bei EOF**
  zurückgegeben wird; ungültige Eingabe bleibt TypAnanas. Keine neue Ananas-Klasse.
- **Begründung:** Java-artig (`getOrDefault`), eine Zeile für Spiele-Autoren, keine Sonderregel im Typsystem,
  keine zusätzliche Fehlerart im HOST-ABI. (`standard` ist ein Schlüsselwort, daher `ersatz`.)
- **Betroffen:** SPEC §11.1; U-03 (Interpreter, umgesetzt in 0d34810), U-07 (Doku/Beispiele).
- **Status:** fest (Tests a10).

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
- **Betroffen:** Interpreter (U-04, umgesetzt in 0d34810), Host (U-12), Compiler/Laufzeit (U-11), Differenztests (U-14), ARCHITEKTUR §1 (Hinweis).
- **Status:** fest (Interpreter), offen (Host, Compiler, Differenztests).

### K-015 `abbrechen`/`weiter` außerhalb einer Schleife
- **Frage:** Heute beendet `abbrechen` in Methode/Lambda/Ofen still den Block (Wert `karton`); §4 schweigt.
- **Entscheidung:** **Parse-Fehler** `PizzaFehler P0012: 'abbrechen' steht außerhalb einer Schleife.` bzw.
  `… 'weiter' …` (art `syntax`, Exit 2, auch von `PizzaLang.parse` gemeldet). Erlaubte Kontexte: `abbrechen` im Rumpf
  von `solange`/`für` oder im Arm einer `wähle`-**Anweisung**; `weiter` nur im Schleifenrumpf. Methoden-, Konstruktor-,
  Lambda- und Ofen-Rümpfe beginnen einen neuen Kontext (eine umgebende Schleife zählt nicht).
- **Begründung:** Java-Verhalten, statisch prüfbar (gut für den Compiler), stilles Verschlucken ist eine Fehlerquelle.
- **Betroffen:** Interpreter-Parser (U-05, umgesetzt in 0d34810), `tests/differenz/korpus/kontrolle-ausserhalb-schleife.pizza` (U-15), Doku (U-07). Ergänzung für `wähle`-Ausdrücke: K-055.
- **Status:** fest (Tests a10).

### K-016 Besitzprüfung ist syntaktisch; `schieb` für alle Typen *(Besitzprüfung abgelöst durch K-105; `schieb`-Teil gilt weiter)*
- **Entscheidung:** BesitzAnanas nur, wenn die rechte Seite einer Deklaration/Zuweisung ein **Name oder Feldzugriff**
  ist (Klammern darum ändern nichts) und zu einer Pizza auswertet. `?:`, Blech-Literale, Methodenrückgaben
  (`m.hole(k)`, `s.pizza()`) lösen sie nicht aus. `schieb(x)` funktioniert für Variablen **jeden** Typs (danach
  weggeschoben), nicht für Felder (`schieb(k.p)` → LaufzeitAnanas „schieb braucht genau einen Variablennamen“).
- **Begründung:** Laufzeit-Referenzzählung wäre teuer und schwer portabel; die syntaktische Regel ist stabil und lehrbar.
- **Status:** fest.

### K-017 Identität von Pizzen, Gleichheit und Schlüssel *(Pizza-/Belag-Teil abgelöst durch K-105; Schlüsselregeln gelten weiter)*
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

### K-023 Preisrundung und Sonderpreise *(abgelöst durch K-105)*
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

### K-026 Hawaii-Auslöser präzisiert *(Belag-Teil abgelöst durch K-105: nur noch Typ `hawaii` und `neu Hawaii(…)`)*
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
- **Betroffen:** Interpreter (U-21, umgesetzt in 0d34810). **Status:** fest (Test a10).

### K-039 Pizza-Methoden mit Text *(abgelöst durch K-105)*
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
- **Betroffen:** Interpreter (U-16, umgesetzt in 0d34810). **Status:** fest (Test a10).

### K-043 Host-Ladefehler
- **Entscheidung:** Kann ein Host ein `.pkarton` nicht laden (ungültig, falsche ABI-Version), sendet er
  `{typ:"fehler", code:"HOST", art:"intern", text:"PizzaFehler HOST: <Grund>"}` und `ende` mit **Exit 2** (wie
  PizzaFehler – das Programm wurde nie gestartet), nicht `art:"ananas"`.
- **Betroffen:** HOST-ABI.md §4/§9 (U-11), Host (U-12), ARCHITEKTUR §1 (`art` erweitert). **Status:** offen.

### K-044 `art`-Werte und Wand-Zeitlimit der UI
- **Entscheidung:** `art` ∈ {`syntax`, `pizzafehler`, `ananas`, `limit`, `intern`}. `intern` = Fehler von Host/Worker **vor**
  dem Programmstart (K-043 Ladefehler, Worker-/WASM-Instanziierungsfehler); interne Fehler eines **laufenden** Motors
  bleiben `art: "ananas"` (K-014). Das 10-s-Wand-Zeitlimit der UI/CLI meldet
  ~~`P0003`~~ – **ersetzt durch K-083/3 (Nutzerentscheidung): das Wand-Zeitlimit entfällt ganz**, es gilt überall nur das Schrittlimit P0002;
  der Playground bietet „Abbrechen“. `W-WASM`/`wasm` im Worker → `art:"intern"`, Code `WASM`.
- **Betroffen:** ARCHITEKTUR §1/§2, SPEC §12, UI (U-17: P0003 entfernen), Doku 30:ref-playground. **Status:** fest (Vertrag), offen (UI).

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
- **Betroffen:** Interpreter (U-18, umgesetzt in 0d34810), Host-JSON (U-12). **Status:** fest (Test a10), offen (Host).

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
- **Betroffen:** bin/pizza.js (U-13, umgesetzt in 0d34810), Host (U-12). **Status:** fest (CLI), offen (Host).

### K-055 `abbrechen`/`weiter` im Block-Arm eines `wähle`-Ausdrucks
- **Frage:** K-015 erlaubt `abbrechen` im Arm einer `wähle`-**Anweisung** (verlässt das `wähle`). Gilt das auch für
  Block-Arme eines `wähle`-**Ausdrucks**, der innerhalb einer Schleife steht?
- **Entscheidung (Vorschlag Interpreter-Agent, bestätigt):** Nein. Block-Arme eines `wähle`-Ausdrucks beginnen – wie
  Lambda- und Ofen-Rümpfe – einen **neuen Kontext**: `abbrechen`/`weiter` dort → P0012, auch wenn der Ausdruck in einer
  Schleife steht. Den Wert liefert `serviere (x);` (§14.5).
- **Begründung:** Ein Ausdruck muss einen Wert liefern; ein stilles `karton` durch `abbrechen` wäre genau das, was K-015
  abschafft. Die Anweisungsform bleibt wie bei Java-`switch` (break verlässt das switch). Konsistent mit K-015, da dort
  „Kontextgrenze = alles, was einen Wert produziert“ gilt (Lambda, Ofen, wähle-Ausdruck).
- **Betroffen:** SPEC §15.3 (K-015 ergänzt), Doku (U-07). **Status:** fest (Test a10).

### K-056 Theke: Rückruf-Signaturen
- **Entscheidung:** `beiKlick(fn)` → `fn()`; `beiAenderung(fn)` → `fn(wert)` (Eingabe: Text, Haken: diavolo); `beiEnter(fn)` →
  `fn(text)`. Erneute Registrierung ersetzt, `karton` entfernt. Der Zustand (`wert()`, `an()`) ist **vor** dem Rückruf aktualisiert.
- **Begründung:** Beispiel in THEKE §2 (`() -> {…}`), Lambda-Toleranz erlaubt trotzdem `x -> …`; Java-Listener-Muster. Interpreter (da07b46) entspricht.
- **Status:** fest (a13).

### K-057 Theke: Bündelung, Synchronisationspunkte, Reihenfolge
- **Entscheidung (Interpreter-Auslegung bestätigt):** Änderungen an gezeigten Zutaten werden gepuffert; Synchronisationspunkte:
  vor jedem Warten in `bediene()`, nach jedem Rückruf (auch bei Ananas, vor dem Verlassen), vor `schliesse`, vor dem erneuten
  `fenster` bei `setzeTitel`, am Programmende (Theke noch offen). Eine `aendere`-Nachricht, ein Eintrag je Zutat (Reihenfolge der
  ersten Änderung), letzter Wert gewinnt; `stil` als ganzes Objekt; `hinzu`/`leeren` als vollständige `kinder`-Liste. Nicht gezeigte
  Zutaten erzeugen keine Nachricht; vom Renderer gemeldete Werte werden nicht zurückgesendet. `ausgabe` des Rückrufs steht vor der `aendere`.
- **Status:** fest (a13).

### K-058 Theke: `zeige()`, `setzeTitel`, Wiederöffnen
- **Entscheidung:** erstes `zeige` → `fenster` + `baum`; erneutes `zeige` → neuer `baum`, offene Änderungen verfallen, IDs bleiben;
  `zeige` nach Schließen öffnet wieder (`fenster` + `baum`); `setzeTitel` an gezeigter Theke sendet `fenster` erneut (kein eigenes
  `aendere`-Format); `zeige(karton)`/Nicht-Zutat → `TypAnanas: zeige() braucht eine Zutat, nicht karton.`; `zeige` liefert die Theke.
- **Begründung:** Interpreter-Verhalten; `fenster` als Titel-Transport spart ein Protokollfeld.
- **Status:** fest (a13).

### K-059 Theke: ein Elternteil
- **Entscheidung:** höchstens ein Container, keine Doppelnennung, keine Zyklen, gezeigte Wurzel gilt als belegt →
  `LaufzeitAnanas: Die Zutat 'z1' liegt schon woanders auf der Theke.` / `Die Zutat 'z1' kann nicht in sich selbst liegen.`;
  `leeren()` löst Kinder; `hinzu` liefert den Container.
- **Status:** fest (a13).

### K-060 Theke: IDs
- **Entscheidung:** Auto-IDs `z1, z2, …` nur für unbenannte Zutaten, belegte Nummern werden übersprungen (`id: "z2"` erlaubt);
  `id:` an jeder Zutat; `Theke` verbraucht keine Nummer; doppelt → `LaufzeitAnanas: Die ID 'ok' gibt es schon.`, leer → LaufzeitAnanas.
- **Status:** fest (a13).

### K-061 Theke ohne `bediene()` / Programmende (Nutzerentscheidung)
- **Frage:** Sendet das Programmende `schliesse`? (Interpreter da07b46: nein; mein erster Vorschlag: ja.)
- **Entscheidung (vom Nutzer getroffen, überschreibt die Interpreter-Auslegung):** **Ja.** Am Programmende wird ein noch offenes
  Fenster geschlossen wie bei normalen Programmen: nach dem letzten Puffer-Flush sendet die Laufzeit `{"v":1,"op":"schliesse"}` –
  nur wenn das Fenster offen ist (gezeigt und nicht `geschlossen`/`schliesse()`), auch bei Ende durch ungefangene Ananas oder
  P0002 – die `ui`-Nachrichten (Flush, `schliesse`) stehen dann **vor** dem `fehler`-Ereignis („Fenster zu, dann Fehlermeldung“;
  Interpreter c0bb852, Compiler hat Parität geprüft). Bei Hawaii-Panik gibt es keine Nachricht
  (harter Abbruch); Host und UI schließen das Fenster selbst. Host: Fenster zu → Prozess endet mit dem Exit-Code des Programms.
  Eine nie gezeigte Theke sendet nichts.
- **Betroffen:** Interpreter (U-34, umgesetzt in c0bb852), Beispiel-`.ui-erwartet` (U-35), UI-Vorschaufenster (U-36), Host (U-28), Compiler/Laufzeit (U-27).
- **Status:** fest (a13).

### K-062 Theke: eine pro Programm, eingebaute Klassen
- **Entscheidung:** zweites `neu Theke` → `LaufzeitAnanas: Es gibt nur eine Theke pro Programm.`; `bediene()` ohne `zeige` →
  `Die Theke ist leer.`; `bediene()` nach Schließen kehrt sofort zurück. `neu Zutat()` → RohlingAnanas; `erbt Knopf` → P0010;
  eine eigene Klasse `Knopf` hat Vorrang vor der eingebauten.
- **Status:** fest (a13).

### K-063 Theke ohne Renderer / Testfolge
- **Entscheidung:** Fehlen `onUiWarte` und `uiEreignisse`: W0100 **je Aufrufstelle** (allgemeine Warnregel §10), sofortige Rückkehr;
  `ui`-Ereignisse werden trotzdem emittiert (auch im CLI ohne GUI prüfbar). `uiEreignisse` erschöpft → `geschlossen`; `onUiWarte`
  liefert `null` oder wirft → `geschlossen`. `schliesse()` im Rückruf: Rückruf läuft zu Ende, danach kehrt `bediene()` zurück.
- **Status:** fest (a13).

### K-064 Theke: Ereignisse mit unpassendem Ziel
- **Entscheidung:** Ereignisse für unbekannte IDs, falsche Zutatenart, fehlende Rückrufe, falschen `wert`-Typ, inaktive Knöpfe,
  unbekannten `typ` → ignoriert; `aenderung` ohne Rückruf setzt den Zustand still; Haken akzeptiert `true`/`false` und `"true"`/`"false"`.
  `{"typ":"bereit"}` (native Hülle) ist intern.
- **Status:** fest (a13).

### K-065 Theke × Ananas, Panik, Eingabe, Ofen, Lieferung
- **Entscheidung:** Ananas aus Rückrufen verlassen `bediene()` (fangbar), Theke bleibt offen (am Programmende dann `schliesse`, K-061);
  Panik beendet sofort (Exit 39, keine `schliesse`-Nachricht – Host/UI schließen das Fenster selbst); `Bestellannahme`/`Bote` in
  Rückrufen wie überall; Warten verbraucht kein Budget; `bediene()` in `wennDa` erlaubt.
- **Status:** fest (a13).

### K-066 Theke: Werte und Typen
- **Entscheidung:** Texte speichern die Textform jedes Werts (`neu Knopf(5)` → `"5"`); `aktiv`/`setzeAn`/`sichtbar`/`an:` verlangen
  diavolo; `breite`/`hoehe` Ganzzahl (TypAnanas sonst), Standard 480×360, Werte ≤ 0 überlässt der Renderer seinem Standard;
  `titel` optional, Standard `""` (Renderer zeigt „Theke“). Fehlendes Argument und `karton` je Parameter: K-102.
- **Status:** fest (a13).

### K-067 Theke: Protokoll-Zahlformat und Testvergleich
- **Entscheidung:** JSON-Zahlen (Ganzzahlen für `breite`/`hoehe`; Stilwerte dürfen Kommazahlen sein), `true`/`false`, Strings.
  Zustandsfelder immer (`text`; `wert`; `text`+`an`; `kinder`), optionale Felder (`platzhalter` nicht leer, `aktiv: false`,
  `sichtbar: false`, `stil`) nur bei Abweichung. Harnische vergleichen `ui`-Nachrichten kanonisch (Schlüssel sortiert, Reihenfolge
  der Nachrichten zählt); `.ui-erwartet`/`.ereignisse` sind JSON-Lines; `ui` steht nicht in `.erwartet`.
- **Betroffen:** Prüfstand (umgesetzt), tests/run-tests.js (U-25), Differenz (U-26). **Status:** fest (Vertrag).

### K-068 Theke: Stile
- **Entscheidung:** `breite`/`hoehe`/`abstand`: Zahl ≥ 0 in Pixeln, Kommazahlen erlaubt (Renderer rundet), keine Einheiten-Strings;
  `ausrichtung` `links|mitte|rechts`; `schrift`, `farbe` wie THEKE §2. Unbekannter Schlüssel → `LaufzeitAnanas: Stil 'x' gibt es
  nicht. Erlaubt: …`; ungültiger Wert → `LaufzeitAnanas: Wert 'lila' ist für Stil 'farbe' nicht erlaubt. Erlaubt: …`;
  negative Zahl → LaufzeitAnanas, Nicht-Zahl → TypAnanas. Nachricht trägt das **ganze** Stil-Objekt. Der Renderer kennt zusätzlich
  Synonyme (`start|oben|zentriert|ende|unten|strecken`) – kein Widerspruch, aus pizza nicht erreichbar.
- **Status:** fest (a13).

### K-069 Theke: Schritte
- **Entscheidung:** Aufrufknoten wie überall; `t.bediene();` ohne Rückruf = 3 Schritte; Warten und Zustellung kosten 0.
- **Status:** fest (a13).

### K-070 W0100
- **Entscheidung:** `W0100: Keine Theke verfügbar – Fenster wird nicht angezeigt.`, einmal je Aufrufstelle, beeinflusst den Exit-Code nicht.
- **Status:** fest (a13).

### K-071 Theke: Textformen
- **Entscheidung (Interpreter-Form übernommen, statt `Knopf#z3`):** Zutaten `Knopf(z3)`, Theke `Theke(<titel>)` bzw. `Theke()`.
- **Status:** fest (a13).

### K-072 Theke: Compiler/Host
- **Entscheidung:** Compiler meldet `nichtUnterstuetzt` für Theke, bis `ui_senden`/`ui_warte` da sind (Fallback Interpreter);
  `ui_warte` mit Retry-Muster (K-013); Host schließt das Fenster bei `schliesse` bzw. am Laufende und beendet den Prozess mit dem Exit-Code (K-061).
- **Status:** offen (U-27, U-28).

### K-073 Theke: Setter lösen keine Rückrufe aus; identische Werte
- **Frage (Beispiel-Agent):** Lösen `setzeAn`/`setzeWert` `beiAenderung` aus? Zählt `setzeText` mit identischem Wert?
- **Entscheidung:** Programmatische Setter lösen **keine** Rückrufe aus (verhindert Rückkopplungsschleifen; Rückrufe = Nutzerhandlung).
  Ein Setzen auf den identischen Wert zählt als Änderung (einfach, deterministisch; Renderer-Update ist idempotent).
- **Status:** fest (a13).

### K-074 Doku-Codeblöcke mit Theke
- **Entscheidung:** Doku-Codeblöcke dürfen `uiEreignisse: object[]` und `uiErwartet: object[]` tragen (analog K-050); alle Harnische
  übergeben/prüfen sie. Prüfstand umgesetzt.
- **Betroffen:** tests/run-tests.js (U-31, umgesetzt in d35d412), ARCHITEKTUR §6. **Status:** fest.

### K-075 Theke: Stil entfernen
- **Frage (Renderer):** Renderer behandelt `stil` als Teil-Update (`null` setzt zurück), Interpreter sendet das ganze Objekt – ein
  entfernter Schlüssel bliebe im Renderer stehen. Heute: `stil("breite", karton)` → TypAnanas.
- **Entscheidung:** `stil(schlüssel, karton)` entfernt den Stil; die nächste Nachricht trägt im Stil-Objekt `null` für entfernte
  Schlüssel (kompatibel mit beiden Lesarten). Renderer bleibt unverändert.
- **Betroffen:** Interpreter (U-32, umgesetzt in d35d412). **Status:** fest (a13).

### K-076 Text-Methoden und Codepoints (Fuzz-Fund W2)
- **Frage:** `"🍕".ersetze("", "-")` zerschneidet im Interpreter das Surrogatpaar (`split("")`), der Wasm-Pfad lässt den Text unverändert.
- **Entscheidung:** Ein **leerer Suchtext ersetzt nichts** – `t.ersetze("", x)` liefert `t` unverändert (auch für ASCII: nicht mehr
  `"a-b"`). Allgemein arbeiten alle Text-Methoden auf **Codepoints** (`länge`, `zeichen`, `zerlege("")`, `für`), nur `<`/`sortiere`
  vergleichen bewusst nach UTF-16-Codeeinheiten (K-040). Weitere UTF-16-Abhängigkeiten gibt es nicht (`enthält`, `beginntMit`,
  `endetMit`, `ersetze` mit nicht-leerem Suchtext, `trimme`, `wiederhole`, `groß`/`klein` sind codepoint-sicher; Text hat kein `umdrehen`).
- **Begründung:** Einfach und portabel; Java-`replace("", "-")` (`-a-b-`) und JS-`split/join` (`a-b`) widersprechen sich ohnehin.
- **Betroffen:** Interpreter (U-33, umgesetzt in d35d412), Fuzz-Repro `tests/fuzz/funde/text-ersetze-leer-surrogat.pizza`. **Status:** fest (a10).

### K-077 Zufall: Saat als Laufoption (Nutzerwunsch „RNG“)
- **Frage:** Spiele laufen mit fester Saat 42 (K-049) immer gleich.
- **Entscheidung:** Neue Option `optionen.zufallsSaat` (Ganzzahl; wird wie `Zufall.saat(n)` auf `n mod 2^32` normalisiert; fehlt
  oder ist keine Ganzzahl → **42**). Damit bleiben Tests, Beispiele, Doku und Differenztests deterministisch. **Playground, CLI und
  EXE/Host** verwenden standardmäßig eine **echte** Saat (z. B. aus Zeit/`crypto`) und zeigen **denselben Text** `Saat: N` an
  (Playground: Infozeile in der Konsole + Option „feste Saat 42“; CLI/EXE: `--saat=N`, ohne Option Zeile `Saat: N` im Terminal).
  Kein neues Ereignis – wer die Saat erzeugt, zeigt sie an (K-082: gleicher Inhalt, Hülle verschieden).
- **Begründung:** Reproduzierbarkeit bleibt (Saat ablesen → `--saat`), Determinismus der Harnische bleibt, keine Protokolländerung.
- **Betroffen:** Interpreter (U-37), CLI (U-38), UI (U-39), Host/Compiler (U-40: HOST-ABI Export `saat_setzen(i32)` vor `start`,
  optional – fehlt der Export, bleibt 42), Doku (U-41). **Status:** fest (Interpreter ce303cb, a10); offen: CLI, UI, Host/Compiler.

### K-078 Zufall: API und exakte Algorithmen
- **Entscheidung:** Generator **mulberry32** (32-Bit-Zustand), Ziehung `r ∈ [0, 1)` mit Auflösung 2⁻³², jede Methode zieht genau so oft
  wie angegeben:
  - `Zufall.saat(n)` setzt den globalen Strom neu (n Ganzzahl, sonst TypAnanas; normalisiert `n mod 2^32`, also `-1` → 4294967295);
    `Zufall.saat()` liefert die normalisierte Saat des aktuellen Stroms (Standard 42).
  - `Zufall.zahl(a, b)` = `a + floor(r · (b − a + 1))` (Ganzzahlen, a > b wird getauscht; bewusst wie bisher, K-049) – 1 Ziehung.
  - `Zufall.kommazahl()` = `r`; `Zufall.kommazahl(a, b)` = `a + r · (b − a)` (Zahlen, a > b getauscht) – 1 Ziehung.
  - `Zufall.wahr(p)` = `r < p` (p Zahl, sonst TypAnanas; p ≤ 0 → immer `nein`, p ≥ 1 → immer `ja`) – immer 1 Ziehung.
  - `Zufall.wähle(blech)` = `blech.stück(1 + floor(r · n))`; leeres Blech → `KeinStückAnanas: Das Blech ist leer – kein Stück da.` – 1 Ziehung.
  - `Zufall.mische(blech)` → **neues** Blech, Fisher-Yates von hinten: für `i = n−1 … 1`: `j = floor(r · (i + 1))`, tausche `i`/`j`
    (n−1 Ziehungen; n ≤ 1 → Kopie ohne Ziehung).
  - Unabhängige Generatoren: `neu Zufall(saat)` mit denselben Methoden (eigener Strom, beeinflusst den globalen nicht);
    `neu Zufall()` zieht seine Saat aus dem globalen Strom: `floor(r · 2^32)` (1 Ziehung). Textform `Zufall(<saat>)`.
  - Referenzwerte (Saat 7): `zahl(1, 6)` → 1 1 6 5 4 3; `kommazahl()` → 0.011704753153026104, 0.06195825757458806, 0.97690763277933;
    `mische([1, 2, 3, 4, 5])` → `[4, 2, 3, 5, 1]`; `neu Zufall()` nach `saat(7)` → Saat 50271532. Saat 42: 4 3 6 (K-049).
- **Begründung:** Bit-identisch in Interpreter, Wasm und Host (nur Ganzzahl-Arithmetik und IEEE-Multiplikation); Schrittkosten wie
  normale Aufrufe.
- **Status:** fest (Interpreter ce303cb, a10); Compiler/Host offen (U-40).

### K-079 Vorratskammer: persistenter Zustand (Nutzerwunsch „State“)
- **Entscheidung – Sprache:** `Vorratskammer v = neu Vorratskammer("pizza-imperium");` – Name = Namensraum `[a-z0-9-]{1,40}`, sonst
  `LaufzeitAnanas: Ungültiger Kammername 'X' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).`; mehrfaches `neu` mit gleichem Namen → dieselbe
  Kammer. Methoden: `lege(schlüssel, wert)` → Kammer, `hole(schlüssel)` (fehlt → `karton`), `hole(schlüssel, ersatz)`, `hat(schlüssel)`,
  `entferne(schlüssel)` → alter Wert/`karton`, `schlüssel()` → Blech (Einfügereihenfolge), `länge()`, `leeren()`, `name()`.
  Schlüssel sind Texte (sonst TypAnanas). Erlaubte Werte: `salami`, `funghi` (endlich), `margherita`, `diavolo`, `karton`, Blech und
  Speisekarte daraus (verschachtelt; Speisekarten-Schlüssel Texte) – sonst
  `TypAnanas: 'X' lässt sich nicht einlagern (erlaubt: Zahlen, Texte, Wahrheitswerte, karton, Bleche und Speisekarten daraus).`
  **Wertsemantik:** `lege` und `hole` kopieren tief (spätere Änderungen am Blech wirken nicht in die Kammer und umgekehrt).
  Limit **1 MiB** serialisiert pro Kammer und **2 MiB** für alle Kammern eines Programms (passt in jeden localStorage, K-082) →
  `LaufzeitAnanas: Die Vorratskammer 'x' ist voll (Limit 1 MiB).` bzw. `… Der Vorrat ist voll (Limit 2 MiB).` (Änderung wird verworfen).
  Textform `Vorratskammer(<name>)`.
- **Schreibzeitpunkt:** **sofort bei jeder Änderung** (`lege`, `entferne`, `leeren`) – einfach, robust bei Abbruch/Panik, kein zusätzlicher
  Synchronisationspunkt nötig.
- **Status:** fest (Interpreter ce303cb, a10).

### K-080 Vorratskammer: API, Ereignisse, Serialisierung
- **Entscheidung:** `optionen.vorrat?: { [name]: Eintrag[] }` mit `Eintrag = [schlüssel, wert]` (Eingangszustand, JSON-Werte wie unten);
  Ereignis bei jeder Änderung: `{ typ: "vorrat", name, schluessel, wert }` – `wert: null` bei `entferne`, `schluessel: null` bei `leeren`
  (nicht in `.erwartet`). `optionen.onVorrat?(name, eintraege)` erhält nach jeder Änderung die **vollständige** Kammer (Persistenz-Hook);
  fehlen `vorrat` **und** `onVorrat`, warnt das erste `neu Vorratskammer` einmal pro Programm
  `W0101: Keine Vorratskammer verfügbar – Zustand wird nicht gespeichert.` (Kammer arbeitet im Speicher weiter).
  **Serialisierung (JSON, Version 1):** `{"v":1,"name":"x","eintraege":[["schlüssel",wert],…]}` – Zahlen als JSON-Zahlen (Textform
  `String(x)`, `-0` → `0`, `NaN`/`Infinity` nicht einlagerbar), Texte als Strings, `ja`/`nein` → `true`/`false`, `karton` → `null`,
  Blech → Array, Speisekarte → `{"speisekarte":[["k",v],…]}` (Paarliste erhält Reihenfolge und Schlüsseltyp). Harnische vergleichen
  `vorrat`-Ereignisse kanonisch; Testdateien `<name>.vorrat.json` (Eingangszustand im Format `{ name: eintraege }`).
- **Begründung:** Paarlisten statt Objekten, weil JS-Objekte ganzzahlähnliche Schlüssel umsortieren; vollständige Kammer im Hook hält
  Backends trivial (eine Datei/ein localStorage-Eintrag je Kammer).
- **Status:** fest (Interpreter ce303cb, a10); Harnische außer Prüfstand/run-tests offen (U-43).

### K-081 Vorratskammer: Backends (Playground, EXE/Host, Wasm)
- **Entscheidung:** Playground: `localStorage["pizza.vorrat.<name>"]` = Serialisierung aus K-080; **kein** Ansichts-Dialog – nur der Befehl
  „Vorrat löschen“ (Kammer wählen/alle), gleichlautend auch in der EXE (`--vorrat-loeschen <name|alle>`, K-083/5); Worker-Brücke synchron (wie Eingabe). EXE/Host: Datei `%APPDATA%\pizza\vorrat\<name>.json` bzw.
  `$XDG_DATA_HOME/pizza/vorrat/<name>.json` (Fallback `~/.local/share`), **atomar** (Temp-Datei + Umbenennen). HOST-ABI (optionale
  Imports, ABI-kompatibel: Modul deklariert sie nur bei Nutzung, Host ohne Unterstützung → W0101-Verhalten): `vorrat_lesen(name_ptr,
  name_len, puffer_ptr, puffer_kap) -> i32` (Länge des JSON, `-1` = keine Kammer, `> kap` → Retry wie K-013) und
  `vorrat_schreiben(name_ptr, name_len, json_ptr, json_len) -> i32` (0 = ok, < 0 → `LaufzeitAnanas: Die Vorratskammer 'x' konnte nicht
  gespeichert werden.`). Lesen beim ersten `neu Vorratskammer(name)`, Schreiben bei jeder Änderung.
- **Betroffen:** UI (U-39), Host (U-42), Compiler/HOST-ABI (U-40), Doku (U-41), Harnische (U-43), Beispiel Idle-Game (U-44).
- **Status:** offen.

### K-082 Grundsatz „Browser = nativ“ (Nutzerentscheidung)
- **Entscheidung:** Sprache, Standardbibliothek, Eingabe, Zufall, Vorratskammer und Theke verhalten sich im Playground und nativ
  (EXE/Linux) **gleich**, und es wird **das Gleiche angezeigt** (Texte, Codes, Zeilenangaben, Banner, Zahl-/Dauer-Format,
  Theke-Inhalt mit gleicher Engine/CSS/Thema/Standardgröße). Zulässig sind nur Hüllen-Unterschiede (OS-Fensterrahmen vs.
  schwebendes Fenster, Terminal vs. Konsolen-Panel, Dateispeicherort vs. localStorage). Was nur nativ Sinn ergibt, wird nicht gebaut.
- **Festgehalten:** SPEC.md und ARCHITEKTUR.md (Kopf). Jede künftige Klärung wird daran geprüft.
- **Status:** fest.

### K-083 Prüfung aller Verträge gegen K-082 – Befunde
Technische Angleichungen (vom Klärungs-Agenten entschieden, Aufträge unten):
- **Anzeigeform von Warnungen/Fehlern (U-45):** überall exakt `<text>` + ` (Zeile Z, Spalte S)` wenn vorhanden – Playground-Konsole
  (statt „Z. 30:7“-Präfix), CLI, EXE. Das Ereignis selbst bleibt unverändert.
- **`detail` (K-014) wird nirgends angezeigt** – nur Ereignisdatum für Entwickler (CLI/Host: nur mit `--debug`).
- **`leeren` ohne Terminal** (Pipe/Datei): keine Steuersequenz – zulässige Hülle (eine Pipe ist keine Anzeige); auf jeder Anzeige wird geleert.
- **Hawaii-Banner:** gleicher Text; stderr (Terminal) vs. Fehlerausgabe (Konsole) ist Hülle – ok.
- **Eingabe-EOF:** Strg+D (Terminal) vs. Knopf (Konsole) ist Hülle; Echo der Eingabezeile erscheint überall genau einmal – ok.
- **Zufallssaat-Anzeige:** derselbe Text `Saat: N` (K-077 angepasst).
- **Vorratskammer-Grenzen:** 1 MiB je Kammer + 2 MiB gesamt, identische Fehlertexte (K-079 angepasst); Speicherort ist Hülle.
- **Theke-Standardgröße 480×360, Schließen → `geschlossen`, gleiche Engine/CSS** – bereits gleich (K-066, THEKE §1).
- **Exit-Code-Anzeige:** UI-Badge vs. Shell-`$?` – Hülle; CLI zeigt `Exit-Code: N` nur mit `--info` (bestehend).

Verstöße mit Nutzerwirkung – **Entscheidung des Nutzers nötig** (an den Koordinator gemeldet, Empfehlung in Klammern):
1. **Linux-Variante ohne Theke** (`linux-x64` statisch, W0100) – im Browser gibt es die Theke immer. (Empfehlung: streichen; nur
   Varianten mit Theke; fehlt WebKitGTK/WebView2 → klare Fehlermeldung statt stiller W0100-Betrieb.)
2. **Programm-Argumente** (`hauptgang(Blech<margherita> args)`): CLI/EXE können sie übergeben, der Playground nicht.
   (Empfehlung: Eingabefeld „Argumente“ im Playground; Alternative: Args aus der Sprache streichen.)
3. **Wand-Zeitlimit 10 s (P0003)** gibt es nur im Playground; nativ läuft dasselbe Programm weiter. (Empfehlung: P0003 abschaffen –
   das Schrittlimit P0002 gilt überall gleich, der Playground behält nur „Abbrechen“.)
4. **Theke-Thema:** Playground folgt dem Seiten-Thema (hell/dunkel per Umschalter), nativ dem System. (Empfehlung: beide folgen dem
   Systemthema; der Playground-Umschalter wirkt nicht auf die Theke. Alternative: Umschalter auch im nativen Fenster.)
5. **Vorrat-Verwaltung:** Playground-Dialog „Vorrat“ (ansehen/löschen) hätte nativ kein Gegenstück. (Empfehlung: Dialog weglassen;
   Verwaltung über die Sprache (`leeren`) und einen gleichen Befehl/Knopf „Vorrat löschen“ in beiden Hüllen.)
6. **Eingabe-Fallback „Eingaben vorab eintragen“** ohne Cross-Origin-Isolation (EINGABE §3) ist ein anderer Modus als nativ.
   (Empfehlung: streichen – ohne Isolation klare Fehlermeldung; die Auslieferung setzt die Header ohnehin.)
7. **Saat-Standard:** echte Saat in Playground, CLI und EXE – gleich (keine Frage); nur Tests/Beispiele mit 42 – ok.
**Nutzerentscheidungen (alle sechs Punkte, über den Koordinator):**
1. Linux-Variante ohne Theke **gestrichen** (auch arm64-musl ohne Fenster); nur Varianten mit Fenster; fehlende WebView → klare Meldung.
   Host-Build: Windows per cargo-xwin (MSVC, eine EXE mit Fenster), Linux-Fenster-Variante auf bookworm.
2. **Argumente-Feld** im Playground für `hauptgang(args)`.
3. **Wand-Zeitlimit P0003 abgeschafft** – nur Schrittlimit + Abbrechen (K-044 angepasst).
4. **Thema:** Browser folgt dem OS-Thema und damit auch das Programmfenster; schaltet der Nutzer die Seite um, gilt das auch für das
   Programmfenster; nativ: OS-Thema.
5. **Nur „Vorrat löschen“** als gleicher Befehl in beiden Hüllen, kein Ansichts-Dialog.
6. Eingabe-Fallback „Eingaben vorab“ **gestrichen** – ohne Cross-Origin-Isolation klare Fehlermeldung.
- **Festgehalten:** THEKE.md §4, EINGABE.md §3, ARCHITEKTUR §2, SPEC §2/§12/§15.3 (K-044)/§15.4/§16.2.
- **Status:** fest (Vertrag); Umsetzung U-17, U-39, U-42, U-53 … U-55.

### K-084 Theke v2: `Takt` – Zeitgeber (Nutzerentscheidung: Takt hat Vorrang)
- **Entscheidung (Vorschlag THEKE-ERWEITERUNGEN §1 übernommen):** `Takt` ist eine **unsichtbare Zutat**: `neu Takt(intervall, beiTakt?)`
  (auch `intervall:`/`beiTakt:`/`id:`), Methoden `aktiv(diavolo)`/`aktiv()`, `setzeIntervall(d)`, `intervall()`, `beiTakt(fn)`
  (ersetzt; `karton` entfernt). Er läuft nur, wenn er im **gezeigten Baum** liegt; mehrere Takte = mehrere Zutaten; Start/Stopp über
  die normale `aendere`-Bündelung (`aktiv`), neuer `baum`/`schliesse` beenden ihn. `intervall`: Dauer (sonst TypAnanas), auf ganze
  ms gerundet (K-047), **≥ 100 ms** sonst `LaufzeitAnanas: Ein Takt braucht mindestens 100ms, nicht 50ms.`; `Uhr.vorspulen`/die
  simulierte Uhr haben keinen Einfluss. Rückruf `fn(anzahl)` mit `anzahl` (salami ≥ 1) = seit dem letzten Schlag verstrichene
  Intervalle (Nachholregel); fehlendes/ungültiges `anzahl` → 1. Ereignis für unbekannte ID, Nicht-Takt oder inaktiven Takt → ignoriert
  (K-064). Textform `Takt(t1)`; `erbt Takt` → P0010.
- **Protokoll:** Knoten `{"id","art":"takt","intervall":1000}` (+ `aktiv:false` bei Abweichung); Renderer → Programm
  `{"typ":"takt","id","anzahl"}`. **Nachholregel des Renderers** (Engine `theke.js`, läuft identisch im Playground und in der nativen
  WebView – K-082): `anzahl = floor((jetzt − letzter) / intervall)` (≥ 1), `letzter += anzahl·intervall`; Intervallwechsel startet die
  Zählung neu; `aktiv:false`, Entfernen aus dem Baum, neuer `baum`, `schliesse` stoppen den Timer. Die Brücken (Playground-Warteschlange,
  Host-Kanal) **fassen** aufeinanderfolgende `takt`-Ereignisse derselben `id` zusammen (Summe der `anzahl`) – in beiden Hüllen gleich.
- **Determinismus:** Schläge sind gewöhnliche Ereignisse (`uiEreignisse`/`.ereignisse` im Test, echte Zeit im Renderer). Warten kostet
  weder Schritte noch simulierte Zeit; der Rückruf zählt seine Anweisungen (K-069).
- **Begründung:** Kein neues `op`, keine Protokollversion, kein Host-Code (Timer in der Engine) → Browser = nativ automatisch.
- **Betroffen:** Interpreter (U-48, umgesetzt in 4b7a2af), Compiler (U-49), UI/Host-Brücken (U-50), Doku (U-51), Idle-Beispiel (U-52).
- **Status:** fest (a13).

### K-085 Zahlformat `tausender(n?)`, `kompakt(n?)`, `euro(kompakt: ja)`
- **Entscheidung:** `x.tausender(n = 0)`: Rundung nach K-048 auf n Stellen, Tausendergruppen mit Punkt, Dezimalkomma, genau n
  Nachkommastellen (`1234567.tausender()` → `1.234.567`, `.tausender(2)` → `1.234.567,00`, `(-1234.5).tausender()` → `-1.235`).
  `x.kompakt(n = 2)`: größte Stufe mit `|x| ≥ 10^k`: `Tsd.` 10³, `Mio.` 10⁶, `Mrd.` 10⁹, `Bio.` 10¹², `Brd.` 10¹⁵, `Trio.` 10¹⁸;
  Ergebnis = `runden(x / Stufe, n)` als Dezimaltext mit Komma **ohne** nachgestellte Nullen + Leerzeichen + Stufe
  (`1234567.kompakt()` → `1,23 Mio.`, `.kompakt(1)` → `1,2 Mio.`, `2000000.kompakt()` → `2 Mio.`, `1500.kompakt()` → `1,5 Tsd.`);
  `|x| < 1000` → `runden(x, n)` mit Komma (`999.5.kompakt()` → `999,5`, `12.345.kompakt()` → `12,35`); `|x| ≥ 10²¹` → ~~JS-Textform mit
  Komma (`1,5e+22`)~~ **ersetzt durch K-103** (weitere Stufen bis `Dezd.`, darüber `m × 10ⁿ`). `x.euro(kompakt: ja)` = `kompakt(2) + " €"`. Reine Textoperationen → identisch in allen Motoren.
- **Betroffen:** Interpreter (U-48, umgesetzt in 4b7a2af), Compiler/Laufzeit (U-49), Doku (U-51). **Status:** fest (a10).

### K-086 Theke v2: `Fortschritt`, `Abschnitt`, `Tabelle`, `Reiter`, `hinweis`, `schrift: "riesig"`
- **Entscheidung (Vorschläge §3–§7 übernommen):**
  - `Fortschritt(wert: 0, text: "")`: `wert()`/`setzeWert(x)` (Zahl, auf 0…1 geklemmt, NaN → 0 – auch in der Sprache), `text()`/`setzeText`;
    Knoten `{"art":"fortschritt","wert":0.25}` + `text` nur wenn nicht leer. Keine Ereignisse.
  - `Abschnitt(titel, Blech<Zutat>)`: Container wie Stapel plus `titel()`/`setzeTitel`; Knoten `{"art":"abschnitt","titel","kinder"}`.
  - `Tabelle(spalten, zeilen)`: `spalten()`/`setzeSpalten(blech)`, `zeilen()`/`setzeZeilen(blech)`; Zellen werden als **Textform**
    gespeichert (K-066); Knoten `{"art":"tabelle","spalten":[…],"zeilen":[[…]]}`; `setzeZeilen` sendet die ganze Liste. Keine Ereignisse.
  - `hinweis(text)`/`hinweis()` an **jeder** Zutat (Tooltip); Feld `hinweis` nur wenn nicht leer; gilt in `baum` und `aendere`.
  - `Reiter(titel, seiten)`: `waehle(n)` (1-basiert, außerhalb → KeinStückAnanas), `gewaehlt()`, `beiAenderung(fn)` → `fn(n)`;
    Knoten `{"art":"reiter","titel":[…],"gewaehlt":1,"kinder":[…]}`; Ereignis `{"typ":"aenderung","id","wert":n}` (Zustand vor dem
    Rückruf aktualisiert; `wert` keine Ganzzahl in 1…k → ignoriert). Fehlende Titel → „Seite n“ (Renderer).
  - Stil `schrift` zusätzlich `"riesig"` (Whitelist und Fehlertext-Liste K-068 erweitern).
  - `Meldung` (P3-Idee) **nicht** in v2.
- **Betroffen:** Interpreter (U-48, umgesetzt in 4b7a2af), Compiler (U-49), Doku (U-51); Renderer bereits umgesetzt. **Status:** fest (a13).

### K-087 Lange laufende Theke-Programme: Schrittlimit je Rückruf, `Uhr.echt()`
- **Entscheidung:** (1) Das Schrittlimit (P0002) gilt für die Top-Level-Ausführung (inkl. `hauptgang`, `wennDa`-Phase) und **für jeden
  Theke-Rückruf jeweils neu**: beim Zustellen eines Ereignisses wird die Zählbasis gesetzt; `schritte`, `Uhr.jetzt()` und Budgets zählen
  unverändert weiter (nur die P0002-Prüfung bezieht sich auf `schritte − Basis`). Die Basis wird **nur** beim Zustellen eines
  Ereignisses gesetzt und sonst nie zurückgesetzt – nach `bediene()` gilt die Basis des letzten Rückrufs also auch für den folgenden
  Top-Level-Code (Interpreter 4b7a2af; bestätigt: einfachste Regel, deterministisch). Deterministisch und in allen Motoren gleich.
  (2) `Uhr.echt()` → Dauer seit 1970-01-01 (Wanduhr, ganze ms); Test: `optionen.echtzeit` (Startwert in ms, wächst nicht);
  HOST-ABI-Import `echtzeit_ms() -> f64` (Compiler/Host). Browser = nativ: beide liefern die Systemzeit.
- **Begründung:** Idle-Spiele laufen stundenlang; Endlosschleifen in einem Rückruf werden weiterhin erkannt.
- **Betroffen:** Interpreter (U-48, umgesetzt in 4b7a2af), Compiler/HOST-ABI (U-49), Host (U-50), Doku (U-51). **Status:** fest (a13).

### K-088 Vorratskammer: Namensräume im Playground, CLI-Löschbefehle, Doku-Blöcke (Nutzerentscheidungen)
- **Entscheidung:** (a) **Beispiel-Tabs** im Playground nutzen einen eigenen Vorrat-Namensraum `localStorage["pizza.vorrat-beispiel.<name>"]`,
  **eigene Tabs** die echten Kammern `pizza.vorrat.<name>` – Beispiele können den Spielstand des Nutzers nicht überschreiben; der Befehl
  „Vorrat löschen“ wirkt auf den Namensraum des aktiven Tabs. (b) **CLI/EXE:** `--vorrat-loeschen <name>` löscht genau eine Kammer
  (auch eine Kammer namens `alle`), `--vorrat-loeschen-alle` löscht alle; beide ohne Programmlauf, Texte `Vorrat '<name>' gelöscht.`
  und `Alle Vorräte gelöscht.` auf stdout, ungültiger Name → Exit 2 mit Hinweis (Interpreter-CLI fc38340). Host/EXE übernehmen
  dieselben Optionen und Texte (K-082). (c) Doku-Codeblöcke dürfen `zufallsSaat`, `vorrat`, `vorratErwartet` und `echtzeit`
  tragen (wie die Optionen; Prüfstand umgesetzt, ARCHITEKTUR §6).
- **Begründung:** Beispiele sind Lehrmaterial, kein Spielstand; „alle“ als Wert wäre mit einer Kammer dieses Namens mehrdeutig.
- **Betroffen:** UI (U-53 ergänzt), Host (U-54 ergänzt), tests/run-tests.js (U-43 ergänzt). **Status:** fest (Vertrag); CLI umgesetzt.

### K-089 Speicher-/Textgrenze: einheitlich fangbare Kühlschrank-Ananas in allen Motoren (Nutzerentscheidung)
- **Frage:** Fuzz-Fund gueltig-s42-266 – `t = t + t` in einer Schleife sprengt die Text-/Speichergrenze. Der Interpreter
  meldete den V8-`RangeError` („Invalid string length“) als internen Fehler (K-014), die Wasm-Laufzeit trappte in `alloc_roh`.
- **Entscheidung:** Erreicht ein Programm die Speicher-/Textgrenze eines Motors, melden **alle Motoren** einheitlich die
  fangbare `LaufzeitAnanas: Der Kühlschrank ist voll (Speicherlimit erreicht).` – Interpreter: Engine-Grenzen der JS-Engine
  (`RangeError` „Invalid string/array length“, Allokationsfehler) werden in `normalisiere` darauf abgebildet; Wasm/Host:
  die Laufzeit prüft die Allokation vorab (`verkette`) und wirft die Ananas, statt zu trappen. Die **genaue Grenze** (und damit
  die Schrittzahl/Ausgabe bis zum Wurf) darf je Motor verschieden sein; Differenztests werten solche Abweichungen als
  „speicherlimit“ (dokumentierte Grenze, kein Fehler). K-014 (interner Fehler) bleibt echten Motorfehlern vorbehalten.
- **Begründung:** Gleicher, fangbarer Text in allen Motoren; ein Speicherüberlauf ist ein Programmzustand, kein Ofendefekt.
- **Betroffen:** Interpreter (`site/js/pizza.js` `normalisiere`), Wasm-Laufzeit (`laufzeit/src/text.rs` `verkette`),
  `tests/differenz/motoren.js`, Regressionsfall `tests/faelle/kuehlschrank-voll-text`; Prüfstand a10 K-089.
  **Status:** fest; umgesetzt in f88cb62.

### K-090 Theke v3: Animationen – Sprache, Protokoll, Determinismus (Nutzerwunsch „ein paar Animationen“ im Idle-Game)
- **Frage:** Wie bekommt das Pizza-Imperium hüpfende Knöpfe, schwebende „+12“, Funkeln bei Glückstreffern, einblendende Zeilen,
  aufpoppende Erfolge und eine pulsierende Kasse – einfach, erweiterbar, deterministisch, in Browser und EXE gleich (K-082)?
- **Entscheidung:**
  - **Sprache:** `zutat.animiere(art, dauer?)` (auch benannt `art:`, `dauer:`, K-094) an jeder Zutat → die Zutat (verkettbar);
    `theke.schwebe(text, bei?, farbe?, dauer?)` (positional in dieser Reihenfolge oder benannt) → die Theke; `bei: karton`/fehlend = Fenstermitte.
  - **Vokabular:** genau `puls`, `huepfen`, `wackeln`, `funkeln`, `einblenden`, `aufpoppen` (ASCII wie `waehle`/`hoehe`; Vergleich der
    Textform, K-066). `ausblenden` gibt es **nicht** (eine einmalige Animation endet im Normalzustand; Verschwinden = `sichtbar(nein)` mit
    `uebergang`, K-091; kurzlebige Meldungen = `schwebe`). Erweiterung wie bei Zutaten: Laufzeit-Liste + Renderer-Registry.
  - **Fehler (Ananas, unabhängig vom Fensterzustand):** `LaufzeitAnanas: Animation 'tanzen' gibt es nicht. Erlaubt: puls, huepfen, wackeln, funkeln, einblenden, aufpoppen.` ·
    `TypAnanas: animiere(dauer: …) braucht eine Dauer, nicht 300.` (bzw. `schwebe(dauer: …)`) · Dauer auf ganze ms (K-047), dann
    50 ms … 5 s, sonst `LaufzeitAnanas: Eine Animation dauert 50ms bis 5s, nicht 10s.` · `TypAnanas: schwebe(bei: …) braucht eine Zutat, nicht 5.` ·
    `farbe` wie Stil `farbe` mit dem Text aus K-068.
  - **Nicht gezeigt (keine Ananas – rein visuell):** Theke nicht offen → `W0102: Animation entfällt – die Theke ist nicht offen.`;
    Zutat (bzw. `bei`) nicht im gezeigten Baum → `W0102: Animation entfällt – 'z3' liegt nicht auf der Theke.`; je Aufrufstelle (§10),
    kein Eintrag. „Gezeigt“ wie K-057 (auch `sichtbar(nein)`, nicht gewählte Reiter-Seite, `Takt`).
  - **Protokoll:** neues Feld `animationen` der `aendere`-Nachricht (kein neues `op`, `v` bleibt 1):
    `{"v":1,"op":"aendere","aenderungen":[…],"animationen":[{"id":"z2","art":"huepfen"},{"id":"z1","art":"puls","dauer":300},{"art":"schwebe","text":"+12","id":"z2","farbe":"basilikum"}]}`.
    Optionale Felder (`dauer`, `id`, `farbe`) genau dann, wenn angegeben und nicht `karton`. `animationen` nur wenn nicht leer;
    `aendere` wird auch für reine Animationen gesendet (`aenderungen: []`).
  - **Bündelung (zu K-057):** Aufrufreihenfolge, **keine** Zusammenfassung, höchstens 32 Einträge je Nachricht (die ersten 32 bleiben,
    weitere entfallen still); gleiche Synchronisationspunkte wie Änderungen; Renderer wendet erst `aenderungen`, dann `animationen` an.
    `zeige` verwirft gepufferte Animationen (K-058); am Programmende Flush vor `schliesse` (K-061); nach `geschlossen` entsteht nichts (W0102).
  - **Determinismus:** keine Ereignisse zurück, keine Wartezeit, kein Einfluss auf Zustand/Rückrufe/Uhr/Budgets; Schritte = normale
    Aufrufknoten (K-069: `k.animiere("puls");` = `k.hinweis("puls");`). Test über `ui`-Nachrichten (`.ui-erwartet`, `uiErwartet`).
- **Begründung:** Feld in `aendere` statt eigenem `op`: eine Nachricht = ein Bild – in der nativen WebView ist jedes `evaluate_script`
  eine eigene Aufgabe, zwischen zwei Nachrichten könnte gezeichnet werden (eine neue Zeile würde vor ihrem `einblenden` kurz aufblitzen);
  alte Renderer ignorieren das unbekannte Feld still. Animationen sind Ereignisse, kein Zustand – daher eine Liste neben `aenderungen`
  statt Felder je Zutat („letzter Wert gewinnt“ würde zwei Pulse verschlucken, ein neuer `baum` würde sie wiederholen).
  W0102 statt Ananas: eine Animation darf den Programmablauf nicht ändern (z. B. Speichern nach dem Schließen des Fensters).
- **Betroffen:** Interpreter (U-56), Compiler/Laufzeit (U-57), Renderer (U-58), Doku/Beispiel (U-59). **Status:** Interpreter
  umgesetzt (U-56, aed3450; Fälle in a13); Renderer umgesetzt (U-58, c2b1bd3, bbf5092; Nachträge K-092/K-093 siehe dort);
  offen: Wasm-Laufzeit (U-57; pizzaiolo meldet bis dahin `nichtUnterstuetzt`, abaf357), Doku/Beispiel (U-59). Ergänzungen: K-093, K-094.

### K-091 Theke v3: `uebergang` – weiche Zustandswechsel
- **Entscheidung:** `zutat.uebergang(diavolo)` / `uebergang()` an jeder Zutat (Setter → Zutat, Getter → diavolo; Nicht-diavolo →
  `TypAnanas: Erwartet diavolo (ja/nein), bekam 1.`, K-066), Standard `nein`; Feld `uebergang: true` im `baum` nur bei `ja`, in `aendere`
  der neue Wert (wie `aktiv`). Wirkung im Renderer: `sichtbar`-Wechsel blendet ein/aus (Ausblenden: sofort nicht bedienbar, Element
  erst nach dem Ausblenden versteckt); Behälter (`stapel`, `reihe`, `abschnitt`, `reiter`) blenden per `kinder`-Änderung **neu hinzugekommene**
  Kinder ein (nicht beim ersten `baum`; entfernte verschwinden sofort; bei `reiter` nur eine neue Seite, die zugleich gewählt ist – eine
  nicht gewählte Seite ist nicht gezeigt und blendet erst gar nicht). `Fortschritt` gleitet **immer** (bestehendes Renderer-Verhalten,
  jetzt verbindlich). Kein Hochzählen/Überblenden von Texten (der Zustand ist formatierter Text).
- **Begründung:** Methode wie `sichtbar`/`aktiv` statt Stil-Schlüssel: kein neuer Werttyp in `stil`, und der Fehlertext von K-068
  (Whitelist, in a13 und `tests/faelle` geprüft) bleibt unverändert.
- **Betroffen:** U-56, U-57, U-58. **Status:** Interpreter umgesetzt (U-56, aed3450; a13); Renderer umgesetzt (U-58, c2b1bd3; `reiter`
  als Behälter nachgetragen, Test in `tests/theke/run.js`); offen: U-57 (Wasm).

### K-092 Theke v3: Darstellung, Barrierefreiheit, Registry (Renderer)
- **Entscheidung:** Standarddauern `puls` 400 ms (Skalierung 1 → 1,12 → 1), `huepfen` 350 ms (6 px hoch und zurück), `wackeln` 400 ms
  (±6/±4 px seitlich), `funkeln` 800 ms (Leuchten in Thema-Gold + einige Funken an festen Positionen), `einblenden` 300 ms (Deckkraft
  0 → 1, 4 px von unten), `aufpoppen` 450 ms (Skalierung 0,6 → 1,08 → 1 mit Einblenden), `schwebe` 1000 ms (Text fett, startet oben
  mittig über `bei` bzw. in der Fenstermitte, steigt 40 px und blendet aus), `uebergang` 200 ms. **Gleichzeitige Schwebetexte am selben
  Anker** (dieselbe `bei`-Zutat bzw. die Fenstermitte) stapeln sich: jeder Text bekommt den kleinsten freien Platz 0, 1, 2, … unter den
  dort noch laufenden Texten (der Platz wird mit dem Ende wieder frei – kein Hochzählen); Platz n startet n × 20 px (eine Zeile) höher
  und seitlich reihum 0, −12, +12, −6, +6 px versetzt – kein Zufall, mit gesteuerter Uhr reproduzierbar. **Sichtbar halten** (Lage, nie
  Layout): reicht der Platz nach oben für Text + Steigen nicht (Zähler ganz oben), startet der Text tiefer; am Rand rückt er nach innen;
  ein Stapel-Platz, für den der Platz nach oben (Text + Steigen) nicht reicht, stapelt stattdessen nach unten über die Zutat (lesbar
  dank Textschatten – besser als abgeschnitten). Nur `transform`/`opacity`/Leuchten, eigene Ebene für Schwebetexte – das Layout
  ändert sich nie. Gleiche Zutat: neue Animation ersetzt die laufende (Neustart bei gleicher Art); Schwebetexte addieren sich (höchstens
  20 gleichzeitig, der älteste weicht). Unbekannte `id`, versteckte Zutat (auch `bei` eines `schwebe`), `takt` → still ignoriert – **kein**
  Ersatz in der Fenstermitte: ein Text ohne seinen Ursprung verwirrt, und den echten Fehlfall (nicht auf der Theke) meldet schon der
  Interpreter als W0102; unbekannte `art` → einmalige Konsolenwarnung.
  Farben über die Thema-Variablen (hell/dunkel). **`prefers-reduced-motion: reduce`:** keine Bewegung, keine Übergänge – `puls`,
  `huepfen`, `wackeln`, `aufpoppen`, `einblenden`, `uebergang` entfallen; `funkeln` = ruhiges Leuchten; `schwebe` = Text ruhig für die
  Dauer, dann weg (Information bleibt); `Fortschritt` springt. Registry: `PizzaTheke.registriereAnimation(art, { dauer, spiele(el, eintrag, ctx) })`,
  die eingebauten Arten über dieselbe API. Keine Inline-Styles (strikte CSP der nativen Hülle): `@keyframes`-Klassen oder `Element.animate()`.
- **Begründung:** Eine Engine + ein CSS in Playground und WebView (WebView2/WebKitGTK melden die OS-Einstellung „Animationen“ als
  `prefers-reduced-motion`) → gleiches Bild (K-082); feste Versätze statt Zufall → reproduzierbare Screenshots.
- **Betroffen:** Renderer (U-58). **Status:** umgesetzt (c2b1bd3, bbf5092; Stapel/Sichtbar-halten/kein Fenstermitte-Ersatz vom Klärungs-Agenten
  nachgezogen – `tests/theke/run.js`, Screenshots `tests/theke/visuell.mjs` hell/dunkel/reduziert).

### K-093 Theke v3: `animiere` ohne Art, `schwebe` ohne Text (Lücke aus der Interpreter-Umsetzung U-56)
- **Frage:** `k.animiere()` meldet im Interpreter `Animation 'karton' gibt es nicht. …` (die Textform des fehlenden Arguments wird
  gegen die Liste geprüft); `t.schwebe()` ist erlaubt und lässt „karton“ schweben. K-090 regelte beides nicht.
- **Entscheidung:**
  - **`animiere()` / `animiere(karton)` / `animiere(5)`:** Die Art ist ein **Vokabular-Schlüssel**, kein Typ-Pflichtargument. Ein
    fehlendes Argument gilt wie überall bei eingebauten Methoden als `karton`, seine Textform (K-066) wird gegen die Liste geprüft →
    `LaufzeitAnanas: Animation 'karton' gibt es nicht. Erlaubt: puls, huepfen, wackeln, funkeln, einblenden, aufpoppen.` (bzw. `'5'`).
    Das ist genau das `stil()`-Muster (`LaufzeitAnanas: Stil 'karton' gibt es nicht. Erlaubt: …`, K-068); **keine** eigene Ananas
    „animiere() braucht eine Art“. Der Zusatz `nicht karton` bleibt den **Typ**-Pflichtargumenten vorbehalten (`zeige() braucht eine
    Zutat, nicht karton.`, `Ein Takt braucht eine Dauer, nicht karton.`, `animiere(dauer: …) braucht eine Dauer, nicht …`).
  - **`schwebe()` / `schwebe(karton)`:** `text` ist Inhalt, kein Attribut – fehlend oder `karton` ergibt die Textform `karton`
    (K-066: `neu Knopf(5)` → `"5"`, `karton` → `"karton"`), also einen Schwebetext „karton“: Eintrag `{"art":"schwebe","text":"karton"}`,
    keine Ananas, keine Warnung. Ein leerer Text (`schwebe("")`) bleibt erlaubt (Eintrag mit `"text":""`); der Renderer zeigt dafür
    nichts – **kein Element**, zählt nicht zum Limit 20 und belegt keinen Stapel-Platz; dasselbe gilt für Text nur aus Leerraum.
- **Begründung:** Leitlinie (a): der Interpreter verhält sich so, der eigene Regressionsfall `tests/faelle/theke-animationen-fehler`
  kodiert den Text bereits; (b) ein Fehlertext je Vokabular-Methode (`stil`, `animiere`) statt zweier; ein schwebendes „karton“ ist
  harmlos, deterministisch und pizza-typisch (der leere Karton fliegt).
- **Betroffen:** SPEC §16.6 (Arten, `schwebe`); Wasm-Laufzeit (U-57) übernimmt dieselben Texte/Einträge; Renderer (leerer Text).
  **Status:** fest (a13; Renderer umgesetzt, `tests/theke/run.js`).

### K-094 Theke v3: benannte Parameter bei `animiere` und `schwebe`
- **Frage:** K-090 nannte für `animiere` nur `dauer:` als benannten Parameter; der Interpreter nimmt auch `art:` benannt an
  (`k.animiere(dauer: 300ms, art: "wackeln")`), bei `schwebe` alle vier (`text:`, `bei:`, `farbe:`, `dauer:`).
- **Entscheidung:** **Alle** Parameter beider Methoden sind positional (in der Reihenfolge der Signatur) **oder** benannt mit den
  Namen aus der Signatur: `animiere(art, dauer)` → `art:`, `dauer:`; `schwebe(text, bei, farbe, dauer)` → `text:`, `bei:`, `farbe:`,
  `dauer:`. Es gilt die allgemeine Bindungsregel (wie bei Pizza-Methoden, §14.9; die Vorrangregel steht ausdrücklich in §16.6): Positionsargumente belegen die Parameter von vorn,
  benannte füllen die restlichen; ist ein Parameter positional belegt **und** benannt angegeben, gilt der **positionale** Wert
  (`k.animiere("puls", art: "huepfen")` → `puls`); unbekannte benannte Argumente werden ignoriert (K-028). Fehlertexte nennen den
  Parameter stets in der benannten Form (`animiere(dauer: …) braucht …`, `schwebe(bei: …) braucht …`), egal wie er übergeben wurde.
- **Begründung:** Konsistenz mit `Theke(breite:, hoehe:)`, `Eingabe(platzhalter:)`, `frageZahl(text, ersatz:)`: eingebaute Methoden mit
  mehreren Parametern kennen alle Namen ihrer Signatur; eine Sonderliste „nur `dauer:`“ wäre im Interpreter zusätzlicher Code
  und für Lernende überraschend.
- **Betroffen:** SPEC §16.6, THEKE.md §8; Wasm-Laufzeit (U-57). **Status:** fest (a13).

### K-095 `Speisekarte.hole(k, ersatz)` – Ersatzwert wie bei der Vorratskammer (Befund aus dem Pizza-Imperium)
- **Frage:** `karte.hole(k, 0)` lieferte bei fehlendem Schlüssel `karton`, nicht `0`. SPEC §11 kannte nur `hole(k)`; eingebaute
  Methoden ignorieren überzählige Argumente stillschweigend, alle drei Motoren verhielten sich gleich – also kein Vertragsbruch,
  aber eine Lücke: `Vorratskammer.hole(k[, ersatz])` (K-079), `liesZahl([ersatz])`/`frageZahl(text[, ersatz])` (K-008) und die
  K-028-Liste benannter Argumente kennen `ersatz` längst, die Doku lehrt `v.hole("besuche", 0) + 1` als Idiom. Das
  Pizza-Imperium wich auf `hat()` aus.
- **Entscheidung:** `Speisekarte.hole(k[, ersatz])` mit genau der Semantik von K-079: `ersatz` positional oder benannt `ersatz:`;
  er gilt **nur**, wenn `hat(k)` `nein` ist – ein gespeicherter `karton` (`lege(k, karton)` ist erlaubt) bleibt `karton`; `ersatz` kommt
  **unverändert** zurück (keine Kopie – anders als die Vorratskammer, die alle Werte tief kopiert, weil die Speisekarte
  Referenzen hält); `hole(k)` und `hole(k, karton)` bleiben wie bisher `karton`. Positional vor benannt (`hole(k, 5, ersatz: 7)` → `5`),
  unbekannte benannte Argumente werden ignoriert (K-028).
- **Begründung:** Leitlinie (b)/(d): dieselbe Signatur für die beiden Schlüssel-Wert-Typen der Sprache; das Zähler-Idiom
  `k.lege(s, k.hole(s, 0) + 1)` ist in Spielen und Simulationen allgegenwärtig. Die Umsetzung ist in Interpreter und Wasm-Laufzeit
  je eine Zeile; der native Host führt die Laufzeit im `.pkarton` aus und braucht keine Änderung. Keine bestehende Ausgabe ändert
  sich (kein Beispiel, kein Testfall, kein Doku-Block ruft `hole` mit zwei Argumenten auf).
- **Betroffen:** SPEC §11, §14.11 (Speisekarte), §15.2; `site/js/pizza.js` (`KARTE_M.hole`), `laufzeit/src/std_m.rs`
  (`karte_methode`, neu gebaute `laufzeit.wasm`/`laufzeit-daten.js`); Doku-Tabelle (U-60 ✅). **Status:** fest (a10, 2 Fälle;
  `tests/faelle/k095-speisekarte-hole-ersatz`; Differenztests Interpreter = Wasm = Host).

### K-096 Theke-Programm ohne Fenster: nativ Abbruch statt W0100 (Nutzerentscheidung)
- **Frage:** K-083/1 verlangt für fehlendes WebKitGTK/WebView2 eine klare Fehlermeldung statt stillem W0100-Betrieb; der Linux-Starter
  (0d42e56) setzt das für fehlendes WebKitGTK um. Offen waren: Linux mit WebKitGTK, aber ohne Anzeige (SSH), und Windows ohne
  WebView2-Runtime bzw. eine WebView, die sich nicht erzeugen lässt – dort lief das Programm bisher mit W0100 fensterlos weiter.
- **Entscheidung (Nutzer):** Ein Programm mit Theke (Importgruppe `theke`, `pizza.ui_*`) als EXE oder `pizza-host`-Aufruf, das kein
  Fenster bekommen kann, **bricht ab**: verständliche Meldung auf stderr, **Exit 2**, vor dem ersten Wasm-Befehl (Vorprüfung) bzw.
  sofort, falls das Fenster erst beim Öffnen scheitert. Meldungen:
  - keine Anzeige (Linux ohne `DISPLAY`/`WAYLAND_DISPLAY`): `Dieses Programm braucht einen Bildschirm für sein Theke-Fenster. Es wurde
    keiner gefunden (weder DISPLAY noch WAYLAND_DISPLAY gesetzt, z. B. in einer SSH-Sitzung) – bitte in einer grafischen Sitzung starten.`
  - Windows ohne WebView2-Runtime (Vorprüfung `webview_version`) oder WebView nicht erzeugbar: `Dieses Programm braucht die Microsoft
    Edge WebView2 Runtime für sein Theke-Fenster. Bitte „Microsoft Edge WebView2 Runtime“ installieren (kostenlos von Microsoft:
    https://developer.microsoft.com/microsoft-edge/webview2/).`
  - Linux, WebKitGTK fehlt: unverändert die Starter-Meldung (K-083); WebKitGTK startet nicht: `Das Theke-Fenster dieses Programms
    konnte nicht geöffnet werden (die WebView WebKitGTK 4.1 ließ sich nicht starten).`
  Technische Details nur mit `--debug` (`detail: …`). Unter Windows-Subsystem-EXEs ohne Terminal: `AttachConsole` beim Eltern-Terminal,
  sonst zusätzlich ein Meldungsfenster (wie bisher `konsole::wichtige_meldung`).
- **Ausnahmen (unverändert, W0100):** JSON-Modus (`--ereignisse-json`/`PIZZA_EREIGNISSE_JSON`, außer `PIZZA_THEKE=1`), `--ui-ereignisse`,
  `PIZZA_THEKE=0` (Tests/CI), Entwickler-Build ohne Feature `theke`/`starter`. Programme ohne Theke laufen immer, auch ohne Anzeige.
  Interpreter-CLI `bin/pizza.js` und Library (`optionen` ohne `onUiWarte`/`uiEreignisse`) behalten W0100 (K-063/K-070) – sie haben nie
  ein Fenster. Im Browser gibt es immer ein Fenster (K-082: nur nativ betroffen).
- **Betroffen:** THEKE.md §4, SPEC §16 (Ohne Renderer), HOST-ABI §1 (Gruppen), `host/` (`src/anzeige.rs`, `theke.rs`, `main.rs`,
  `starter.rs`, README, Tests), Doku-Referenz. **Status:** fest, umgesetzt (U-61, U-62 ✅).

### K-097 Küchenbrigade – Produktentscheidungen F1–F10 (Nutzerentscheidung, alle wie empfohlen)
- **Frage:** Wie bekommt pizza echte Parallelität, ohne Determinismus und „Browser = nativ“ (K-082) aufzugeben? (THREADS.md §7)
- **Entscheidung:** F1 (a) neue, ausdrückliche Blech-Methode; alles Bestehende (`belege`, `zusammenklappen`, `teig`, `bestelle`)
  bleibt sequentiell und unverändert · F2 (a) Name `brigade(fn)`, Fehlerklasse `KüchenAnanas` · F3 (a) Stücke dürfen ausgeben –
  gepuffert, in Stückreihenfolge · F4 (a) kein gemeinsamer veränderlicher Zustand, keine Sperren; nur Rückgabewerte (und Ausgaben)
  verlassen die Küche · F5 (a) Uhr = kritischer Pfad (Anschnitt + längstes Stück), `schritte` = Summe · F6 (a) Anzahl der Köche
  nur als Host-Einstellung (`auto` = logische Kerne, höchstens 16; Playground-Popover, `--koeche=N`), nie beobachtbar ·
  F7 (a) Stücke sehen die Hauptküche lesend (Schnappschuss), Schreiben → `KüchenAnanas` · F8 (a) der Interpreter bleibt die
  sequentielle Referenz; echte Köche im Wasm-Motor (Browser, Node, nativ), Interpreter-Köche (P8) nur bei Bedarf ·
  F9 (a) Hintergrund-Köche später als eigenes Konstrukt (`koch(fn)`/`abholen()`), `teig`/`bestelle` bleiben · F10 (a) Objekte
  eigener Klassen verlassen die Küche als tiefe Kopie mit gleicher Nummer.
- **Begründung:** Kein bestehendes Programm ändert sich (z. B. `raetsel/pizzaiolos.pizza` schreibt aus `belege` in ein statisches
  Feld); jede Planungsabhängigkeit (Sperren, ungeordnete Ausgaben, Wanduhr) widerspräche dem Grundsatz „sequentielle Referenz
  definiert die Semantik“.
- **Festgehalten:** SPEC §17 (neu), §7.4, §8, §13, §14.1, §15.3; ARCHITEKTUR §1/§2; IR.md §1; HOST-ABI §2/§3/§6/§7 (Entwurf).
- **Status:** fest (Vertrag); Umsetzung U-63 … U-70.

### K-098 Küchenbrigade: Schnappschuss, `KüchenAnanas`, Kartonfähigkeit – Texte und Präzisierungen
- **Entscheidung:** Regeln S1–S5 und Kartonfähigkeit wörtlich aus THREADS.md §2.3/§2.4 übernommen (SPEC §17.3/§17.5, alle
  Meldungstexte exakt). Präzisierungen des Klärungs-Agenten (aus dem Grundsatz „sequentielle Referenz“ abgeleitet):
  1. Die Wache prüft **vor jeder Wirkung** der Operation: kein Teilzustand, keine Warnung (T0007 bei `backen`, W0013 bei
     `aufklappen`), kein zusätzlicher Schritt; sie greift auch auf indirekten Wegen (Methoden, unqualifizierte Felder, Lambdas).
  2. „Teig noch nicht gebacken“ = Wert noch nicht berechnet (weder durch `gehenlassen` noch durch `backen`); sonst ist `backen()` ein
     Lesezugriff. Ziehen aus einem vorhandenen `Zufall`-Objekt schließt `saat(n)` ein; `saat()` liest.
  3. **Werfen** einer vorhandenen Ananas ist erlaubt (verändert nichts); sie verlässt die Küche als Kopie.
  4. S4 gilt auch für Getter (`s.text()` einer vorhandenen Zutat); ein Leseversuch der Bestellannahme verbraucht keine Eingabe
     und erzeugt kein `eingabe`-Ereignis.
  5. `<Art>` bei nicht kartonfähigen Werten = erster nicht kartonfähiger Teilwert in Tiefensuche (Elemente in Reihenfolge,
     Speisekarten Schlüssel vor Wert, Felder in Deklarationsreihenfolge, Basisklassen zuerst); Methodenreferenzen wie `Bote.sage`
     sind `Eine Funktion`, Theke **und** Zutaten `Eine Theke-Zutat`.
  6. `KüchenAnanas` ist eine eingebaute Ananas wie die übrigen (§8): `neu KüchenAnanas("…")` ist erlaubt; eine **eigene** Klasse
     gleichen Namens überschattet sie wie bei allen eingebauten Ananas (bestehende Programme bleiben gültig, vgl. 37c88f2) –
     auch für die von den Wachen geworfene Ananas (wie heute z. B. eine eigene `StreitAnanas` die interne `b / 2`-Ananas fängt).
  7. Verschachtelte Brigade: Variablen und Objekte des äußeren Stücks sind für die innere Brigade Hauptküchen-Eigentum.
- **Begründung:** Gleiche Stelle, gleicher Schritt, gleicher Text in jedem Motor; keine Teilwirkungen, die eine parallele
  Ausführung anders sähe.
- **Betroffen:** Interpreter (U-63 ✅), Compiler/Laufzeit (U-66), Doku (U-65). Prüfstand: `a14-kueche.js`.
- **Status:** fest (Vertrag); Interpreter entspricht (72cb857 ff., Lücken in K-101).

### K-099 Küchenbrigade: Determinismus D1–D15, Uhr und Schritte
- **Entscheidung:** D1–D15 wörtlich aus THREADS.md §3 (SPEC §17.6). §14.1 wird ergänzt: Uhr/`zeitMs` = Schritte + vorgespulte
  Zeit **+ Brigade-Ersparnis (≤ 0)**; die Summenprüfung D7 (P0002 am `brigade`-Aufruf mit tatsächlicher Schrittsumme) ist die
  einzige Ausnahme von „Abbruch beim Schritt Limit + 1“. Präzisierungen: `Zufall.saat()` im Stück liefert die Küchensaat `sᵢ`;
  ein leeres Blech zieht keine Saaten; nach D5 gilt eine in einem Stück ausgegebene Warnung auch für die Hauptküche als ausgegeben;
  der Kühlschrank-Cache eines Hauptküchen-Objekts ist kein Feld (D12 statt S3).
- **Referenzwerte** (Prüfstand a14, aus der sequentiellen Referenz abgeleitet): `[1, 2, 3, 4].brigade(x -> x * x)` → schritte 20,
  zeitMs 11; + `Bote.sage((Uhr.jetzt()))` → `16ms`; vorspulen-Beispiel → `4s 21ms` (schritte 45, zeitMs 4021); D7 Limit 30 mit
  `x * x * x * x` → P0002 Zeile 1, schritte 36, zeitMs 15; D9 Saat 42 → `[248, 359, 896]`, danach `670`, Saaten
  `2581720956, 1925393290, 3661312704`; D8 Ofen 27ms reicht für vier Stücke à `{ Uhr.vorspulen(10ms); serviere (x); }`, 26ms nicht.
- **Begründung:** Jedes Stück ist eine reine Funktion von (Schnappschuss, Element, Stücknummer, Anschnitt-Zählern); das
  Zusammenführen ist eine feste Faltung → unabhängig von Köche-Anzahl und Planung.
- **Betroffen:** Interpreter (U-63 ✅), Compiler/Laufzeit (U-66), Harnische (U-70). **Status:** fest (Vertrag); Interpreter
  entspricht (72cb857 ff.; Stück-P0002 präzisiert in K-101/2).

### K-100 Küchenbrigade: Köche-Einstellung, Optionen, HOST-ABI-Gruppe `kueche`, Klassenindex
- **Entscheidung:** (1) Köche nur im Host: Interpreter-/JS-Option `koeche` (Interpreter: akzeptiert und ignoriert),
  Testoption `kuechenChaos: saat` (Stücke in pseudozufälliger Reihenfolge, Ergebnis muss gleich sein), optionales `ende`-Feld
  `koeche` (nicht in `.erwartet`, von Differenztests ignoriert); Playground-Popover „Köche: auto | 1 | 2 | 4 | 8“
  (localStorage) neben „feste Saat“; Statusleiste und `--info` zeigen denselben Text `Köche: N` (K-082) – **Nutzerentscheidung: nur bei Programmen mit
  `brigade` (Gruppe `kueche`)**, das Popover bleibt immer sichtbar; CLI/EXE `--koeche=N`
  (`auto` = Standard, `1` = aus); `bin/pizza.js` akzeptiert `--koeche=N` ebenfalls (Interpreter: immer `Köche: 1`).
  (2) HOST-ABI: neue optionale Importgruppe `kueche` (`kueche_auftrag`, `kueche_bericht`) und Export `kueche_stueck` –
  **Entwurf**, abwärtskompatibel, `abi_version` bleibt 1; endgültig mit Paket P2. (3) IR: `KüchenAnanas` wird mit P2
  Laufzeitklasse 17, eigene Klassen beginnen bei 18 (seit K-105: Klasse 15, eigene ab 16; intern; jedes `.pkarton` bringt seine Laufzeit mit). Bis dahin meldet das
  Frontend `brigade`/`KüchenAnanas` als `nichtUnterstuetzt` (P1b, 37c88f2) → Playground „Auto“ nutzt den Interpreter.
- **Begründung:** Die Anzahl der Köche ist eine Leistungsentscheidung des Hosts; die Sprache sieht sie nie.
- **Festgehalten:** ARCHITEKTUR §1/§2/§6, IR.md §1, HOST-ABI §2/§3/§6/§7. **Status:** fest (Vertrag); Umsetzung U-64 … U-70.

### K-101 Küchenbrigade: Vertragslücken aus der Interpreter-Umsetzung (P1, 72cb857/f29baa7/8f922fd)
- **Frage:** Der Interpreter-Agent meldete vier Stellen, an denen SPEC §17 schwieg oder sich widersprach. Entscheidung jeweils
  **wie umgesetzt** (die Umsetzung folgt an allen vier Stellen der sequentiellen Referenz, K-097/F8):
  1. **Kartonfähigkeit von `Rohling<T>` (roh-Info) und Pizza-Sicht** (`unten` als Wert in einer Belag-Methode; Pizza-Sicht seit K-105 gegenstandslos) – beide fehlten in
     der Tabelle (THREADS §2.4 = SPEC §17.5). Entscheidung: **kartonfähig**, da beide auch aus `belege` als Werte zurückkommen
     (`roh (info) { serviere (info); }`, `serviere (unten)`) und keine Küchenmaschinerie tragen. Kopie: `Roh(…)` mit kopiertem
     Teilergebnis und gleicher `verbrauchteZeit()`; Sicht mit gleicher Schichtenzahl auf eine Pizza-Kopie. Die Tiefensuche
     (K-098/5) reicht in das Teilergebnis bzw. die Pizza hinein (`Roh(Teig)` → `Ein Teig`). Die `<Art>`-Liste bleibt
     abschließend – kein neuer Text.
  2. **Stück-P0002 (D7):** `schritte` = `S₀ + s₁ + … + s_{k−1} + (R + 1)` – die Arbeit der berücksichtigten Stücke nach D3/D6
     (Limit + 1 nur bei k = 1); die **Küchenuhr** des abbrechenden Stücks steht bei Limit + 1 (`zeitMs` = Limit + 1 ohne
     Vorspulen). D7 sagte „Limit + 1 wie gewohnt“, §14.1 nannte die Summenprüfung die „einzige Ausnahme“ – beides stimmte nur
     für k = 1 und widersprach D3 („Stücke > k: keine Schritte“ – also zählen Stücke ≤ k). Jetzt: beide Brigade-Fälle sind die
     Ausnahme; `schritte` ist immer Arbeit, die Uhr Zeit (D6). Referenz: Limit 100, `[1, 2].brigade(x -> { falls (x == 2)
     { solange (ja) { } } serviere (x); });` → schritte 107, zeitMs 101 (S₀ = 6, s₁ = 6, R = 94). Position des Stück-P0002 wie
     bei `belege` (dasselbe Programm mit `belege` meldet dieselbe Zeile – die der Anweisung mit dem Aufruf, nicht die der
     Schleife in der Küche; D3 entsprechend präzisiert, Prüfstand prüft `zeile: 1`).
  3. **`neu Zutat()` in der Küche** → `RohlingAnanas: Ein Rohling ist nicht essbar.` (nicht der S4-Text). S4 betrifft nur
     Operationen, die in der Hauptküche gelingen würden; eine abstrakte Klasse ist nirgends instanziierbar, der Fehler ist
     ortsunabhängig (sequentiell identisch).
  4. **Reihenfolge der Wache** (SPEC §17.3, Absatz „Reihenfolge der Wache“): (a) Operanden/Argumente auswerten (Schritte und
     Wirkungen zählen), (b) Ziel auflösen (unbekannte Variable/Feld → gewohnte `LaufzeitAnanas`), (c) Küchenwache (0 Schritte),
     (d) operationseigene Prüfungen (Index, Schlüssel, Typ, `gebacken`, Einlagerungstyp, Budget). Folge: `setze(99, …)`
     auf einem Hauptküchen-Blech → `KüchenAnanas` statt `KeinStückAnanas`; `z = "text"` → `KüchenAnanas` statt `TypAnanas`;
     `g = 2` (gebacken) → `KüchenAnanas` statt `GebackenAnanas`; `o.q = 1` (kein Feld) → `LaufzeitAnanas`. Für Zuweisungen heißt
     das „nach der rechten Seite“, für Blech-/Speisekarten-/Kammer-Methoden „vor der Indexprüfung“ – ein Prinzip, zwei Sichten.
     P2 (Wasm, U-66) baut genau diese Folge nach (`frozen_top`-Wache als erste Prüfung in jeder `rt_*`-Schreiboperation).
- **Begründung:** Gleiche Stelle, gleicher Schritt, gleicher Text in jedem Motor; die Umsetzung war an allen vier Stellen die
  natürliche Lesart der sequentiellen Referenz – ein Auftrag an den Interpreter ist nicht nötig.
- **Festgehalten:** SPEC §14.1 (P0002), §17.3 (Reihenfolge der Wache, S4-Hinweis), §17.5 (zwei Tabellenzeilen, Tiefensuche),
  §17.6 D7. Prüfstand: `a14-kueche.js` (umbenannt aus `a14-kueche-offen.js`, Abnahme P1; sieben neue Fälle K-101/1–4, 61 gesamt).
- **Betroffen:** Compiler/Laufzeit (U-66: Kartonkopie von Rohling/Sicht, Wachen-Reihenfolge, Stück-P0002-Summe), Doku (U-65,
  Hinweis). **Status:** fest; Interpreter entspricht (72cb857, f29baa7, 8f922fd).

### K-102 Theke: Text-Parameter bei fehlendem Argument und `karton` (Befund: Konstruktor ≠ Setter)
- **Frage:** `neu Schild()` → `""`, aber `neu Schild(karton)` → `"karton"`; `setzeText()`/`setzeText(karton)` → `"karton"`;
  `hinweis(karton)` → `""`; `neu Theke(karton)`, `neu Abschnitt(karton)`, `neu Eingabe(karton)`, `neu Fortschritt(0, karton)` → `""`.
  K-066 („Textform jedes Werts“) und K-093 (`schwebe(karton)` → „karton“) sagen nichts über optionale Konstruktor-Parameter;
  Interpreter und Wasm waren bitgleich, aber uneinheitlich.
- **Entscheidung:** Die Regel folgt der Einteilung des Protokolls (K-067):
  - **Zustandsfelder** (immer im Knoten: `text` von Schild/Knopf/Haken, `wert` der Eingabe, `titel` von Theke und Abschnitt,
    Spalten/Zellen der Tabelle, Reiter-Titel, Schwebetext): **Textform jedes Werts**, auch `karton` → `"karton"` (K-066, K-093).
    Fehlt das Argument im **Konstruktor**, gilt der Standard der Signatur (`""`, Listen `[]`); fehlt es in einer **Methode**
    (`setzeText()`, `setzeTitel()`, `setzeWert()`, `schwebe()`), gilt es wie überall als `karton` → `"karton"`.
  - **Optionale Felder** (nur bei Abweichung im Knoten: `platzhalter`, `hinweis`, `text` des Fortschritts – wie `stil`, K-075, und
    Rückrufe, K-056): `karton` heißt **weglassen** → `""` (bzw. entfernt), fehlend ebenso – im Konstruktor **und** im Setter:
    `Fortschritt.setzeText(karton)`/`setzeText()` → `""`, `hinweis(karton)` → `""`.
  - **Typisierte Parameter** (`breite:`, `hoehe:`, `an:`, `wert` des Fortschritts, `intervall`, `dauer`, `bei`, `farbe`, Bleche):
    fehlend oder `karton` → Standard; unverändert.
  Merksatz: „Was immer angezeigt wird, nimmt jeden Wert als Text – auch karton. Was man weglassen kann, lässt karton weg.“
- **Änderungen:** `neu Theke(karton)` → Titel `"karton"` (Textform `Theke(karton)`), `neu Eingabe(karton)` → `wert` `"karton"`,
  `neu Abschnitt(karton)` → `titel` `"karton"`, `Fortschritt.setzeText(karton)`/`setzeText()` → `""`. Alles andere bleibt:
  `Schild/Knopf/Haken(karton)` → `"karton"`, `platzhalter: karton` → `""`, `Reiter(karton)` → `[]`, Zellen `[1, karton]` →
  `["1", "karton"]`, `schwebe()` → „karton“ (K-093), `hinweis(karton)` → `""`.
- **Begründung:** (a) K-066, K-067, K-075 und K-093 bleiben unangetastet; (b) nur vier Stellen je Laufzeit ändern sich;
  (c) es ist dieselbe Unterscheidung, die das Protokoll ohnehin trifft, und für Lernende in einem Satz erklärbar.
- **Betroffen:** SPEC §16.2 (Werte), §16.6 (`schwebe`); THEKE.md §1; Interpreter (`uiNeu`, Fortschritt-`setzeText`), Wasm-Laufzeit
  (`laufzeit/src/theke.rs`); Regressionsfall `tests/faelle/theke-texte-karton`, Prüfstand a13 (K-102); Doku-Referenz (Theke-Abschnitt,
  Agent site/js/doku). **Status:** fest, umgesetzt (Interpreter + Wasm bitgleich, `test:differenz` grün).

### K-103 Zahlformat für beliebig große Zahlen (Befund aus dem Pizza-Imperium: Kasse „2,0844997640411506e+21 €“)
- **Frage:** `kompakt`, `euro()` und `tausender` fielen ab 10²¹ auf die JS-Exponentform (`1,5e+22`, `2,0844997640411506e+21 €`,
  `2,08e+21`) zurück; ∞ ergab `Infinity,undefined €`. Idle-Spiele erreichen solche Zahlen in Minuten.
- **Entscheidung (ersetzt die 10²¹-Regel aus K-085):**
  - `x.kompakt(n)`: Stufen der deutschen langen Skala, größte mit `|x| ≥ 10^k`: `Tsd.` 10³, `Mio.` 10⁶, `Mrd.` 10⁹, `Bio.` 10¹²,
    `Brd.` 10¹⁵, `Trio.` 10¹⁸, `Trd.` 10²¹, `Quadr.` 10²⁴, `Quadrd.` 10²⁷, `Quint.` 10³⁰, `Quintd.` 10³³, `Sext.` 10³⁶, `Sextd.` 10³⁹,
    `Sept.` 10⁴², `Septd.` 10⁴⁵, `Okt.` 10⁴⁸, `Oktd.` 10⁵¹, `Non.` 10⁵⁴, `Nond.` 10⁵⁷, `Dez.` 10⁶⁰, `Dezd.` 10⁶³ (Regel wie K-085:
    `runden(x / Stufe, n)`, Komma, ohne nachgestellte Nullen; Übertrag innerhalb der Stufe bleibt wie bisher: `999999.kompakt(0)` →
    `1000 Tsd.`). Ab `|x| ≥ 10⁶⁶`: **`m × 10ᵉ`** mit hochgestelltem Exponenten (U+2070 ff., `×` U+00D7): Mantisse und Exponent aus
    der kürzesten Ziffernfolge (= `x.toExponential()`, dieselben Ziffern wie die Textform), `m = runden(Mantisse, n)` mit Komma ohne
    nachgestellte Nullen; ergibt die Rundung 10, wird daraus `1 × 10ᵉ⁺¹` (`9,999·10⁷⁰.kompakt()` → `1 × 10⁷¹`, `.kompakt(4)` →
    `9,999 × 10⁷⁰`). Beispiele: `1,5 Trd.`, `15 Trd.` (1,5·10²²), `1,5 × 10⁶⁶`, `1 × 10³⁰⁰`, `-1 × 10³⁰⁰`.
    Nie über `log10`/`pow` – nur Literal-Vergleiche, IEEE-Division und Ziffernfolge → bitgleich in allen Motoren.
  - Unendlich/NaN in allen drei Formaten: `∞`, `-∞`, `NaN` (`euro`: `∞ €`).
  - `x.tausender(n)` und `x.euro()` (ohne kompakt): unverändert bis `|x| < 10²¹`; ab `|x| ≥ 10²¹` sowie für ∞/NaN **wie
    `kompakt(2)`** (`euro` mit ` €`): `2,08 Trd. €`, `2,08 Trd.`. Volle Ziffernreihen jenseits von 21 Stellen sind weder lesbar noch
    exakt (nur 17 signifikante Stellen); die Grenze 10²¹ ist dieselbe, ab der JS selbst in die Exponentform wechselt.
  - **Textform bleibt** (§14.11, K-005): `text(x)`, `"" + x`, `Bote.sage(x)`, `serviere` zeigen weiterhin `String(x)`
    (`2.5e+21`, `Infinity`). Sie ist die rundreisefähige Rohform; lesbare Ausgabe ist Sache von `tausender`/`kompakt`/`euro`.
- **Begründung:** Stufen bis Dezilliarde decken jedes realistische Spiel ab und lesen sich wie Zeitungssprache; darüber ist
  `× 10ⁿ` kürzer und verständlicher als erfundene Kürzel. Textform zu ändern hätte hunderte Testausgaben und die Rundreise
  `alsZahl(text(x))` berührt.
- **Betroffen:** SPEC §14.11/Zahlformat, Interpreter (`kompaktText`/`tausenderText`/`euroText`), Wasm-Laufzeit (`laufzeit/src/zahl.rs`),
  Regressionsfall `tests/faelle/k103-grosse-zahlen`, Prüfstand a10 (K-085 angepasst, K-103 neu), `tests/wasm/laufzeit-zahlen.js`,
  Doku-Referenz. Idle-Beispiel: Wächter `summe < 10²¹ ? … : "unbezahlbar"` wird überflüssig; Sterne/Zähler mit `tausender()` formatieren.
  **Status:** fest, umgesetzt (Interpreter + Wasm bitgleich, `test:differenz` grün).

### K-104 Küchenbrigade im Wasm: Umsetzungsentscheidungen und Vertragslücken aus P2 (U-66)
- **Frage:** THREADS.md §4.3–§4.5 ließ beim Wasm-Motor einige Punkte offen bzw. als Entwurf. Entscheidung des Compiler-Agenten
  (Ergebnis bitgleich zum Interpreter auf allen `kueche-*`, a14 und dem Korpus; Interpreter-Referenz unverändert):
  1. **Inline-Pfad** (`kueche_auftrag` → `-1`): Stücke laufen nacheinander mit demselben Code und demselben Zustands-Reset wie
     in einem Klon (`kueche_stueck`); jeder Bericht wird hinter die Heap-Grenze gerettet, **zusammengeführt wird erst nach dem
     letzten (bzw. ersten abbrechenden) Stück** – nicht nach jedem Bericht (THREADS §4.4 Punkt 4), weil der Reset sonst das
     Warnungsgedächtnis des Zusammenführens (D5) zurückdrehen würde. Beobachtbar ist das nicht (D4: Ereignisse vor der Rückkehr).
  2. **Innere Brigaden** (in einem Stück) laufen immer im Modul; `kueche_auftrag` kommt nur aus der Hauptküche, nie
     verschachtelt (erlaubt nach SPEC §17.1 „Hosts dürfen innere Brigaden sequentiell ausführen“).
  3. Stücknummern in `kueche_stueck`/`kueche_bericht` sind **1 … n**. `kueche_stueck` erzeugt der Compiler (multi-value-Hülle um
     `rt_kueche_stueck`/`rt_kueche_laenge`; der C-ABI von Rust kennt keine Mehrfachrückgabe) und exportiert es nur mit Gruppe
     `kueche`. Die Gruppe wird syntaktisch erkannt (`….brigade(…)`/`….brigade`); eine eigene Methode `brigade` importiert sie
     ebenfalls (harmlos). Ohne Gruppe liefern die Linker-Stubs `-1` → Inline-Pfad.
  4. **Zustand der Hauptküche** (THREADS §4.4 Punkt 6, Variante (c) verallgemeinert): beim Anschnitt wird der ganze veränderliche
     statische Bereich der Laufzeit `[STATISCH_START, __heap_base)` (.data/.bss, derzeit 640 Bytes; der Linker setzt
     `STATISCH_START` per Datensegment, `laufzeit/baue.js` ermittelt ihn) in den Auftrag kopiert und vor jedem Stück
     zurückgeschrieben (dazu `HEAP_TOP := Grenze`, Klassenzähler, `tot`-Flags der Rahmen, W0003-Flags). Wachsende Laufzeitstrukturen
     (Lieferungen, Warnungen, Namen, Rahmen, Kühlschrank …) fallen damit automatisch auf ihren Stand beim Anschnitt zurück.
     Wo die Laufzeit sonst *lesend* in Hauptküchen-Objekte schriebe, tut sie es in einer Küche nicht: Kühlschrank copy-on-write
     (D12), kein nachträglicher Hashindex einer Speisekarte, keine Namens-ID-Merker in Texten der Hauptküche.
  5. **Kartonformat:** `PKF1` (HOST-ABI Anhang A) enthält ein Tag „fest“ (Bits eines unveränderlichen Werts, der beim Anschnitt
     schon existierte) – gültig nur zwischen Instanzen mit demselben Schnappschuss. Das Format ist daher laufzeitintern und
     **nicht** das zwischen Interpreter und Laufzeit geteilte Format aus THREADS §4.3; P8 (Interpreter-Köche) braucht ein
     eigenes, namensbasiertes Format. Berichte (Status, sᵢ, dᵢ, cᵢ, Lieferungen, Ananas-Zähler, Ereignisse, Nutzlast) ebenda.
  6. **D13:** Jedes Stück darf `min(Restspeicher beim Anschnitt, 256 MiB)` neu belegen, gemessen ab der Heap-Spitze beim
     Stückbeginn (Inline-Pfad: hinter den geretteten Berichten) – in beiden Pfaden derselbe Betrag.
  7. **Trap** in einem Stück auf dem Inline-Pfad beendet den Lauf wie jeder Trap (K-014, interner Fehler, Exit 1); „Trap im
     Klon → Abbruch dieses Stücks“ (THREADS §4.5) gilt nur für Klone (P3/P4).
  8. Die „Schnappschuss-Invarianz im Debug-Build“ (THREADS §5 Punkt 6) entfällt vorerst: Freie Kapazität von Vektoren, die
     Text-Anhänge-Arena und der Argumentstapel liegen unterhalb der Grenze und werden von Stücken legitim beschrieben (nur
     ungenutzte Bytes). Ersatz: `tests/wasm/klon-host.js` führt jedes Brigade-Programm des Korpus zusätzlich mit echten
     Klon-Instanzen (Speicherkopie) in drei Planungen aus (vor, rückwärts mit wiederverwendetem Klon, je Stück ein Klon) –
     identisch zum Interpreter.
  9. Nebenbei: Zuweisungen an „Feld oder globale Variable“ gleichen Namens (unqualifiziert in einer Methode) kompilieren jetzt
     (bisher Fallback „mehrdeutig“; nötig für `beispiele/pizzafunktionen/kuechenbrigade.pizza` im reinen Wasm-Modus).
  10. **JS-Köche (P3, U-67)** – Entscheidungen des Compiler-Agenten (`site/js/pizzaiolo/koch.js`, `host-js.js`):
     (a) `Pizzaiolo.kuechenPool(k)` → `Promise<Pool | null>`, `k` = `"auto"` (logische Kerne, höchstens 16) oder Zahl; der Pool
     hat **k − 1 Worker, der aufrufende Thread ist der k-te Koch** (er wartet ohnehin). `null` bei k ≤ 1, ohne
     `SharedArrayBuffer`/Cross-Origin-Isolation, im Browser-Hauptthread (`Atomics.wait` verboten) oder ohne Worker. Nur ein
     Pool-Objekt in `optionen.koeche` bringt Köche; Zahlen/`"auto"` → `-1` (THREADS §4.6). Node-Harnische: `kuechenPoolSync(k)`
     (Node-Worker starten auch, während der Erzeuger in `Atomics.wait` steht). `pool.beenden()` beendet alle Köche.
     (b) Hinweg per `postMessage` (Modul einmal je Worker, je Brigade Schnappschuss-SAB + Steuer-SAB); Rückweg nur über einen
     festen Fach-SAB je Koch (1 MiB, Berichte blockweise). Weil der aufrufende Thread mitkocht, kann ein Koch, der die Nachricht
     nie erhält, den Lauf nicht festhalten. Planung: dynamische Warteschlange (`Atomics.add`); Stücke hinter dem kleinsten
     bekannten Abbruch werden übersprungen (D3, nie gelesen).
     (c) Köche je Brigade: `min(k − 1, n − 1, Budget / Speichergröße − 3)` Worker (Budget Browser 2 GiB, Node 50 % RAM); ein
     Stück oder kein Platz → `-1`. Klone werden über Stücke und Brigaden wiederverwendet (Speicher hinter dem Schnappschuss wird
     genullt); ein Klon, der den Schnappschuss um > 64 MiB übersteigt, wird neu angelegt.
     (d) **Trap in einem Klon** → der Host wirft in `kueche_bericht(i)` für dieses Stück; die Hauptinstanz endet damit wie bei
     einem Trap auf dem Inline-Pfad (Punkt 7, K-014, `detail` = „Trap in einem Koch (Stück i): …“). Ein früherer Abbruch gewinnt
     nach D3 von selbst (die Laufzeit fragt Berichte nur bis zum ersten Abbruch ab). Kein neuer Berichtsstatus.
     (e) `ende.koeche` / Rückgabe `koeche` nur, wenn wirklich Köche gekocht haben (sonst bleibt `ende` unverändert; Anzeige 1).
     Differenztests ignorieren das Feld.
     (f) Testoption `kuechenChaos: saat` (nur mit Pool): Saat 0 = Stücke strikt rückwärts, sonst gemischt; dazu kurze
     Verzögerungen je Koch (0–2 ms, insgesamt ≈ 32 je Brigade). Differenz-Varianten `wasm-koeche4`, `wasm-chaos` (Saat 7),
     `wasm-rueck` (Saat 0) – nur Programme mit `brigade`.
     (g) CSP: Koch-Worker laden `js/pizzaiolo/koch.js` per URL (`worker-src 'self'`), keine Blob-Worker; Browser-URL relativ
     zum Lauf-Worker wie `importScripts`, Option `url`. Geprüft in Chrome (headless) mit den Headern aus `nginx.conf`.
     (h) **Koch stirbt** (Worker beendet/abgestürzt, OOM – kein Wasm-Trap): Während einer Brigade blockiert der aufrufende
     Thread und sieht `error`/`exit`/`messageerror` nicht. Ist alles vergeben und seit `max(1 s, 3 × längstes bekanntes
     Stück)` kein Fortschritt, kocht er das kleinste offene Stück (≤ kleinster Abbruch) selbst nach – bitgleich, weil jedes
     Stück beim Schnappschuss beginnt; kommt es doch noch vom (nur langsamen) Koch, zählt es nicht doppelt. Fertig ist die
     Brigade, sobald die Stücke 1 … min(n, kleinster Abbruch) da sind. Ein Koch, dessen Fach-Wort `F_AKTUELL` beim Beginn
     einer Brigade noch steht (gestorben oder noch an Alt-Arbeit), bekommt keine Stücke; nach den Ereignissen fliegt er ganz
     aus dem Pool (`pool.lebend`). Test: `tests/wasm/koch-ausfall.js` (eigener Prozess mit Zeitgrenze, `terminate()` mitten
     im Stück). Echter Wasm-Trap (`unreachable`) in einem Klon: handgebautes Modul in `tests/wasm/run.js`.
  11. **Nativer Host (P4, U-68)** – Entscheidungen des Native-Host-Agenten (`host/src/kueche.rs`, `laufen.rs`, `main.rs`):
     (a) Köche = `std::thread::scope`-Threads je Brigade (Stapel 16 MiB wie der Programm-Thread, HOST-ABI §6), je Koch eine
     Klon-Instanz (eigener wasmi-`Store`, gleiches `Module`/`Engine`); Klone werden über Stücke und Brigaden eines Laufs
     wiederverwendet (Speicher hinter dem Schnappschuss wird genullt), nach einem Trap verworfen. Der Schnappschuss wird nicht
     kopiert, sondern während der Brigade aus dem Speicher der Hauptinstanz gelesen (`data_and_store_mut`); je Koch eine Kopie.
     (b) Planung: dynamische Warteschlange (`AtomicUsize`), Stücke hinter dem kleinsten Abbruch werden nicht begonnen (D3);
     Berichte nur bis zum ersten Abbruch. Köche je Brigade `min(koeche, n, 50 % RAM / Speichergröße)`; ≤ 1 → `-1`.
     (c) **Trap in einem Klon** als frühester Abbruch → `kueche_auftrag` trappt in der Hauptinstanz (interner Fehler, K-014,
     `detail` = wasmi-Meldung), gleiche Wirkung wie Punkt 7 und wie P3 (10 d); ein früherer echter Abbruch gewinnt (D3).
     (d) **Lohnt-sich-Schätzung:** Die Speicherkopie kostet O(Speichergröße) je Brigade, und der Speicher wächst ohne GC mit
     jeder Brigade (u. a. 64 KiB Berichtspuffer je Brigade auf dem Köche-Pfad, `laufzeit/src/kueche.rs`). Gemessen: 2000
     Brigaden à 8 winzige Stücke mit 2 Köchen 10,4 s statt 0,06 s inline. Deshalb misst der Host je Stückzahl n Arbeit (Summe
     der Stückzeiten) gegen Wandzeit; ohne ≥ 10 % Gewinn antwortet er für Brigaden mit derselben Stückzahl `-1` und probiert
     Köche erst nach 1, 2, 4 … 64 Brigaden wieder (danach: 0,08–0,13 s). Unbeobachtbar (Planung frei); unter Chaos immer Köche.
     (e) CLI/EXE `--koeche=auto|1…64` (sonst `--koeche braucht auto oder eine Zahl von 1 bis 64.`, Exit 2). `--info` hängt bei
     Programmen mit Gruppe `kueche` ` · Köche: N` an die Endzeile (`— Exit-Code … · Uhr … ms · Köche: N`); N = höchste
     tatsächlich genutzte Anzahl im Lauf (1, wenn keine Brigade Köche bekam). Das JSON-`ende` bleibt ohne `koeche`.
     (f) Testoption `--kuechen-chaos=N`: Permutation (jede vierte Brigade strikt rückwärts), 0–3 ms Verzögerung je Stück,
     gelegentlich frischer Klon. Differenz-Varianten: `host` läuft mit `--koeche=1`, `host-koeche4` mit `--koeche=4` (nur
     Programme mit `brigade`; `PIZZA_KUECHEN_CHAOS=N` schaltet Chaos zu). Smoke `host/smoke-koeche.js` in CI.
     (g) Speedup (Windows, 24 logische Kerne, 8 Stücke à 3,2·10⁶ Schritte): 1 / 2 / 4 / 8 Köche = 7,2 / 3,6 / 1,9 / 1,0 s
     (7,0×); 200 Brigaden à 8 Stücke à 4·10⁴ Schritte: 20,4 / 10,3 / 5,5 / 3,5 s (5,9×).
     (h) **Robustheit:** Der Host wartet nur per `join` der Scope-Threads (kein Condvar/Park → kein Weckrennen wie bei
     `Atomics.wait` in P3). Lücke behoben: fiel ein Koch aus, nachdem er den kleinsten Abbruch gesetzt hatte, fehlte dessen
     Bericht und `kueche_auftrag` antwortete `0` mit gekürzten Berichten. Jetzt kocht der aufrufende Thread jedes fehlende
     Stück ≤ kleinster Abbruch in einem Klon nach (sonst `-1`); ein nicht anlegbarer Klon ist ein Ausfall, kein Trap.
     Chaos lässt gelegentlich einen Koch ausfallen (Berichte verworfen); Stresstest `host/tests/kueche.rs` (80 Brigaden ×
     Köche 2–8 × Saaten). Echter Trap im Klon: `trap_im_klon_ist_interner_fehler` (`unreachable`).
  12. **Speicher je Brigade (Laufzeit, ohne GC):** Der Auftrag der Hauptküche (`gefroren == 0`) wird über alle Brigaden eines
     Laufs wiederverwendet (statische Zelle `HAUPT_AUFTRAG`, `laufzeit/src/kueche.rs`; Felder neu gesetzt, Vektoren geleert, Kapazität bleibt). Er trägt
     auch die Arbeitsfläche: Berichtsliste (Kapazität ≥ n vor der Grenze), **ein** Berichtspuffer (Köche-Pfad: alle Berichte
     hintereinander per `kueche_bericht` direkt hinein, anfangs 64 KiB, wächst bei Bedarf auf ≥ das Doppelte; Inline-Pfad: die
     hinter die Grenze geretteten Berichte ziehen nach dem letzten Stück hierher um und die Heap-Spitze springt auf die Grenze
     zurück), Memo der Kartonleser und Zählermaxima. Wachsen kostet nur beim neuen Höchststand (alter Puffer bleibt liegen).
     Innere Brigaden (in einem Stück) legen wie bisher einen eigenen Auftrag an – er verschwindet mit dem Stück; ihr Puffer
     wächst nie zusätzlich (D13 unverändert). Reentranz ausgeschlossen: der Köche-Pfad kommt nur aus der Hauptküche, Klone und
     Stücke rufen ihn nie, beim Zusammenführen läuft kein Programmcode. Liegen bleiben je Brigade nur noch die Ergebnisse
     (Blech + Werte) und ≤ 15 Bytes Ausrichtung. Gemessen (2000 Brigaden à 4 winzige Stücke, JS-Host): Speicher der
     Hauptinstanz inline 7,13 → 3,13 MiB, mit 4 Köchen 132,13 → 3,13 MiB und 49,5 → 3,1 s; inline 20 000 Brigaden 44,13 → 6,13 MiB.
     Unbeobachtbar (Differenz inkl. `wasm-koeche4`/`wasm-chaos`/`wasm-rueck`/`host-koeche4` ohne Abweichung). Die
     Lohnt-sich-Schätzung des nativen Hosts (11 d) bleibt; ihr Anlass „Speicher wächst je Brigade“ ist damit entfallen.
  13. **Playground (P5, U-69)** – Entscheidungen des UI-Agenten (`site/js/worker.js`, `ui/src/ausfuehrung.js`, `koeche.js`):
     (a) Der Lauf-Worker erkennt die Gruppe `kueche` wie der Compiler am AST (`MCall`/`Mem` namens `brigade`, nach
     `PizzaLang.parse`; ein Wort `brigade` im Kommentar zählt nicht) und legt nur dann – und nur, wenn Wasm laufen kann
     (nicht bei Motor „Interpreter“) – **vor** `run` per `Pizzaiolo.kuechenPool(k, { url: js/pizzaiolo/koch.js })` einen
     Pool an (Kinder-Worker des Lauf-Workers). Der Pool wird je Anzahl gemerkt, auch ein `null`-Ergebnis (keine Isolation,
     Köche laden nicht) – so wartet nicht jeder Lauf erneut auf die Frist von `kuechenPool`. Andere Anzahl → alter Pool
     `beenden()`, neuer Pool; `Köche: 1` → kein Pool, ein vorhandener wird beendet (geändert mit P6, Punkt 14 e).
     (b) **Wiederverwendung zwischen Läufen:** Solange ein Pool lebt, meldet `ende` (Worker → Seite) zusätzlich
     `poolWarm: true`; die Seite beendet diesen Lauf-Worker dann nicht, sondern nimmt ihn für den nächsten Lauf (auch
     ohne `brigade`). „Abbrechen“ und Worker-Fehler beenden ihn per `terminate()` – damit alle Köche (Kinder-Worker);
     der nächste Lauf startet einen neuen Lauf-Worker und legt einen neuen Pool an. Ohne Pool bleibt es beim frischen
     Worker je Lauf.
     (c) `ende` (Worker → Seite) trägt `koeche` nur bei Programmen mit `brigade`: die tatsächlich genutzte Anzahl aus dem
     JS-Host (Punkt 10 e), sonst 1 (Interpreter, Rückfall, keine Isolation, `Köche: 1`). Die Statusleiste hängt dann
     ` · Köche: N` an (Text wie `--info`, K-082; auch im Tooltip), sonst nichts.
     (d) Einstellung „Köche: auto | 1 | 2 | 4 | 8“ als Segmentwahl im Lauf-Popover unter „Feste Saat 42“, gespeichert in
     `localStorage` `pizza.koeche` (Standard `auto`; Abweichung zeigt wie Argumente/Saat den Punkt am Knopf „Lauf“);
     der App-Modus (`#app=`) liest denselben Schlüssel. Ohne Cross-Origin-Isolation steht im Popover dezent „Ohne
     Cross-Origin-Isolation kocht hier nur ein Koch – gleiches Ergebnis, nur langsamer.“ CSP unverändert (`worker-src
     'self'`, Koch-Worker per URL).
  14. **Harnische (P6, U-70)** – Entscheidungen des Harnisch-Agenten:
     (a) **Fuzz** (`tests/fuzz/generator.js`, Option `brigade`, `run.js --brigade-anteil` Standard 0,3 bzw. `FUZZ_BRIGADE_ANTEIL`):
     `quelle.brigade(k -> { … serviere ((…)); })` als Anweisung (oft in `probier`) und als Ausdruck, verschachtelt bis Tiefe 2,
     Quellen auch `schneide(n)`/leer; Rümpfe mit Ausgaben, `Bote.fehler`, Würfen in Stück k, Uhr (`vorspulen`/`jetzt`),
     Zufall (global, `saat`, `neu Zufall()`), `neu FuzzBon` (Klasse ohne statischen Zähler, Ergebnis als Kopie mit Nummer),
     Endlosschleife in einem Stück (P0002), Kammer lesen/schreiben, Ofen/Teig/Lieferung in der Küche und Brigade im Ofen (D8).
     Schreibzugriffe zielen in der Küche zu 90 % auf eigene Variablen, sonst bewusst auf Hauptküchen-Eigentum (Wache);
     selten nicht kartonfähige Ergebnisse; mit Brigade zu 15 % ein kleines Schrittlimit (300–20 000, D7). Mutator kennt
     `brigade`/`KüchenAnanas`. Abnahme: Seed 2026, 10⁴ gültige (2959 mit Brigade) + 10⁴ kaputte Programme, alle Motoren
     und Varianten **ohne Abweichung** (≈ 17 min lokal).
     (b) **Differenz:** neue Motoren `interpreter-chaos` (`koeche: 4`, `kuechenChaos` = Saat aus dem Quelltext-Hash, je
     Programm verschieden) und `host-chaos` (`--koeche=4 --kuechen-chaos=N`, gleiche Saat); `host-koeche4` ohne Chaos.
     `PIZZA_KUECHEN_CHAOS=N` fixiert die Saat. Das Feld `koeche` wird in **jedem** Ereignis ignoriert (Host-Metadatum).
     (c) **Prüfstand:** Fälle dürfen `koeche`/`kuechenChaos` tragen (durchgereicht); jeder Fall mit `brigade` läuft
     zusätzlich mit `{koeche: 4, kuechenChaos: 7}`, `{koeche: 1, kuechenChaos: 0}`, `{koeche: "auto"}` und muss dieselbe
     Folge (ohne `koeche`), denselben Exit-Code und dieselben schritte/zeitMs liefern (Köche-Gegenprobe); neuer a14-Fall.
     (d) **CI:** Job „Differenz & Fuzz“ 1000 gültige + 500 kaputte Programme (mit Brigade, Wasm-Köche-Varianten, lokal
     ≈ 50 s); Job „host“ zusätzlich Köche-Differenz (`--filter kueche`, host/host-koeche4/host-chaos/interpreter-chaos)
     und unter Linux 150 Brigade-Fuzzprogramme gegen den nativen Host.
     (e) **Playground:** Wechsel der Köche-Einstellung (auch per `storage`-Ereignis) beendet einen ruhenden, warm
     gehaltenen Lauf-Worker samt Köche-Pool sofort (`ausfuehrung.verwerfeWarm()`); der Lauf-Worker beendet bei `k = 1`
     einen vorhandenen Pool (meldet danach kein `poolWarm`). Ersetzt den Halbsatz in 13 (a). E2E in `12-koeche`.
     (f) Bereits abgedeckt und nicht doppelt gebaut: reiner Wasm-Modus mit `kuechenbrigade.pizza` (E2E 07 „alle Beispiele
     in allen Modi“), Popover/Statusleiste/Abbrechen/ohne Isolation/App-Modus (E2E 12). Schnappschuss-Invarianz siehe
     Punkt 8; Stress/Leistung (§5 Punkt 7/8) sind nicht Teil der P6-Abnahme.
- **Festgehalten:** HOST-ABI §2/§3/§6 + Anhang A (Gruppe `kueche` endgültig, `abi_version` bleibt 1), IR.md §1/§6a/§7.
- **Betroffen:** P3 (U-67, JS-Köche) und P4 (U-68, nativ) setzen auf Punkt 1–3/5 auf; der native Host beantwortet die Gruppe
  bis P4 mit `-1`/`-2` (minimal in `host/src/laufen.rs`); P4 siehe Punkt 11 (U-68 ✅). **Status:** fest; Compiler/Laufzeit entspricht (U-66 ✅), JS-Köche Punkt 10 (U-67 ✅), Playground Punkt 13 (U-69 ✅), Harnische Punkt 14 (U-70 ✅).

### K-105 Sprach-Bereinigung: das eingebaute Objekt `Pizza`, Beläge und alle Pizza-Fachlogik werden entfernt (Nutzerentscheidung)
- **Anlass (Nutzer, wörtlich):** „Entferne Konstanten, sowas wie das Objekt ‚Pizza‘ – das ist Fachlogik und gehört auch nicht in eine
  Spaß-Sprache wie die hier. Hier sollen nur Dinge, die in einer ordentlichen, sehr high-level Programmiersprache auch wären. Nur lustig
  benannt und vielleicht ein paar merkwürdige Konzepte, das ist okay.“
- **Leitlinie:** Ein eingebautes Ding **bleibt**, wenn es ein allgemeines Sprachkonzept ist, das eine gute High-Level-Sprache auch hätte
  (nur pizza-lustig benannt), oder ein kleines, aber allgemeines „merkwürdiges Konzept“. Es geht **raus**, wenn es Domänendaten oder
  Fachlogik einer Pizzeria ist (Rezepte, Preise, Zutatenkatalog, Schichtregeln, Stückzählung einer Pizza). Halb-Allgemeines wird
  entfernt, wenn es nur über das Pizza-Objekt existiert – Beispiele definieren so etwas künftig selbst (eigene Klasse `Pizza`).
- **Bestandsaufnahme (AST-gestützt, nicht per Textsuche):** 181 von 1071 Programmen/Codeblöcken nutzten Pizza-Fachlogik – 22 Beispiele
  (davon 2 Idle), 54 `tests/faelle`, 14 Differenzkorpus, 1 `tests/wasm/faelle`, 22 Doku-Codeblöcke (und 3 ganze Doku-Abschnitte),
  72 Prüfstand-Fälle (a06 komplett, dazu a03/a04/a05/a07/a08/a10/a13/a14). Alle eingebauten Objekte, Klassen, Konstanten und
  Methoden wurden eingeordnet:

  **RAUS (Fachlogik):**

  | Was | Begründung |
  |---|---|
  | Typ `Pizza`, Pizza-Literal `((A, B))` / `(())`, `neu Pizza()` | das Domänenobjekt selbst (bisher SPEC §6) |
  | Belag-Werte (großgeschriebener Name → Belag), die eingebaute **Zutatenliste** (24 Beläge mit Preisen und `@Nach`), **Grundpreis 5.00** | Katalogdaten einer Pizzeria |
  | Pizza-Methoden `preis()`, `beläge()`, `hat()`, `anzahlBeläge()`, `übrig()`, `beschreibung()`; Belag-Methoden `name()`, `preis()`; `p + Belag`, `p - Belag`, `p += Belag`; `für (b : pizza)`; Beläge als Speisekarten-/Kühlschrank-Schlüssel; Pizza-Gleichheit nach Belägen | Rezept- und Preislogik |
  | `belag X auf Pizza { … }` (Decorator-Dispatch mit `unten`-Sicht), Keywords `belag` und `auf` (nicht mehr reserviert), `@Nach(…)`, **PizzaFehler B0012** („Auflauf“) | Schichtregeln einer Pizza; damit gibt es keinen PizzaFehler mehr, der erst zur Laufzeit entsteht |
  | `UnbekannterBelagAnanas` | nur für Beläge |
  | `teile(p)`, Typ `Stück<T>`, `essen()`, `istGegessen()`, `pizza()`, `übrig()`, `BesitzAnanas`, Meldungen „Pizza ist alle.“ / „Dieses Stück ist schon gegessen.“ | Referenzzählung „8 Stücke je Pizza“ und die Besitzprüfung griffen ausschließlich auf Pizza-Werte (K-016/K-017). Abweichung von der Beispiel-Liste des Nutzers („Ownership schieb/teile“): `schieb` bleibt (unten); ein allgemeines `teile` für beliebige Objekte wäre ein neues Sprachkonzept (jede Zuweisung `Foo b = a;` würde zur BesitzAnanas) – falls gewünscht, als eigene Klärung neu entwerfen |
  | Hawaii-Auslöser (b) „Pizza mit Belag `Ananas` entsteht“; W0666 für den bloßen Namen `Ananas` und für `Ananas` im Pizza-Literal | hingen am Belag; `Ananas` ist jetzt nur noch die Basisklasse der Ausnahmen (bloßer Name = Klassenwert, Textform `Ananas`, keine Warnung) |
  | API `PizzaLang.BELAEGE`, `intern.BELAEGE`, `intern.GRUNDPREIS`; `TYPEN` ohne `Pizza`/`Stück`, `BUILTINS` ohne `teile`, `ANANAS` ohne `BesitzAnanas`/`UnbekannterBelagAnanas`, `KEYWORDS` ohne `belag`/`auf`; Editor-Highlighting und Autovervollständigung der Beläge | folgen der Sprache (ARCHITEKTUR §1, §5) |
  | §17.5 Kartonfähigkeit: Zeilen Pizza, Pizza-Sicht, Belag, Stück; „Ein Stück“ in der Aufzählung nicht kartonfähiger Arten; K-101/3 „Pizza-Sicht kartonfähig“ | gegenstandslos |

  **BLEIBT (allgemeine Konzepte, lustig benannt):** Typen `salami`/`funghi`/`margherita`/`diavolo`/`Dauer`/`Blech`/`Speisekarte`;
  Modifikatoren, `rezeptur`, `quattrostagioni` (Enum mit genau 4 Werten – merkwürdig, aber allgemein), `calzone`/`aufklappen` (Kapselung),
  Annotationen `@PizzaÜberschreibt`/`@PizzaVeraltet`/`@NieKarton`/`@Pizzaiolo`/`@Kühlschrank`; `Bote`, `Bestellannahme` (I/O), `Uhr`
  (simulierte Zeit), `Mathe` (inkl. `PI`), `Zufall`, `Spiegel` (Reflection), `Vorratskammer` (Persistenz); `teig`/`backen` (Lazy),
  `ofen`/`zwischenstand`/`roh` (Zeitbudget), `bestelle`/`Lieferung`/`trinkgeld`/`wennDa` (Async), `schneide`/`belege`/`zusammenklappen`/
  `brigade` (Parallelität), `@Kühlschrank`/`mikrowelle`/`frisch` (Caching), **`schieb(x)`** (Move-Semantik für jede Variable, danach
  `LeererKartonAnanas: 'p' wurde weggeschoben – der Karton ist leer.`); alle Werte-Methoden inkl. `euro()`/`tausender()`/`kompakt()`
  (Zahlformat); Ananas-Hierarchie samt `StreitAnanas` (faires Schneiden), `KeinStückAnanas` (Index), `UnbekanntePizzaAnanas` (= unbekannte
  Klasse bei `neu`, Text „steht nicht auf der Speisekarte“ – genau die gewünschte „unbekannt“-Meldung); Hawaii-Easter-Egg mit Typ `hawaii`
  (W0666, Panik bei Zuweisung) und `neu Hawaii(…)`; Theke mit Farbnamen `tomate|basilikum|…` (Themenfarben); alle Floskeln in Meldungen
  („7 Stücke? Wer schneidet eine Pizza in 7 Stücke?“, „Zu spät – die Pizza ist kalt.“, „Das ist jetzt eine ganz normale Pizza.“, „Zu viele
  Pizzen übereinander“) – Humor, keine Fachlogik. Doppelte Klammern `Bote.sage(("Hallo"))` bleiben stilistisch erwünscht und bedeutungslos
  (§5); der Parser braucht keine Literal-Heuristik mehr.
- **Verhalten bei Nutzung entfernter Dinge** (wie bei jedem unbekannten Namen, keine Sonderbehandlung):
  `Bote.sage((Tomate));` → `LaufzeitAnanas: 'Tomate' ist nicht definiert.` · `teile(x)` → `LaufzeitAnanas: 'teile' ist nicht definiert.` ·
  `neu Pizza()` ohne eigene Klasse → `UnbekanntePizzaAnanas: Klasse 'Pizza' steht nicht auf der Speisekarte.` · `((Tomate, Käse))`, `(())`,
  `belag X auf Pizza { }` → Syntaxfehler P0001 · Typen `Pizza`, `Belag`, `Stück<…>` sind ungeprüfte unbekannte Typen (§14.6) · eine **eigene**
  Klasse `Pizza` und eigene Variablen `Tomate` usw. funktionieren wie jede andere Klasse/Variable.
- **Betroffen:** SPEC §1 (Keywords, Typen), §5 (Pizza-Literal, Textform), **§6 entfällt**, §7.5 (nur noch `schieb`), §8, §9, §11, §12, §14.5/§14.6/
  §14.9/§14.11, §15.1/§15.2 (K-001, K-016, K-017, K-023, K-026, K-039 abgelöst), §17.3/§17.5; ARCHITEKTUR §1/§5; WASM.md §2; IR.md; README;
  THEKE unverändert (nur Floskeln). Interpreter `site/js/pizza.js`, Compiler `site/js/pizzaiolo/{frontend,backend-wasm}.js`, Laufzeit
  `laufzeit/src/{wert,namen,ops,pf,start,std_m,klassen}.rs` (Neubau `laufzeit.wasm`), UI `ui/src/{woerter,sprache,editor}.js` (Neubau
  `app.bundle.js`), Host unverändert (die Laufzeit steckt im `.pkarton`). Beispiele, Doku, `tests/faelle`, Differenzkorpus, `tests/wasm/faelle`,
  E2E `02-ausfuehrung` (Hawaii-Auslöser), Prüfstand (a06 ersetzt durch K-105-Fälle, Anpassungen in a03/a04/a05/a07/a08/a10/a13/a14).
- **Idle (`site/beispiele/idle/**`, anderer Agent; Nutzerentscheidung: entfernt wird erst nach „Idle angepasst“):** zu ersetzen sind
  `erste-pizzeria.pizza` Z. 8–9 (`Pizza margherita = ((Tomate, Mozzarella, Basilikum)); … margherita.preis()` → feste Zahl 8 oder eigene
  Klasse) und `pizza-imperium.pizza` (Stand master 5e6bf55) Z. 372 (`Pizza rezept = ((…))`), Z. 374 (`Blech<Belag> SEITEN = [Salami, …]` →
  `Blech<margherita>`), Z. 422 (`rezept.preis()`), Z. 447 (`rezept.beläge()`), Z. 684–685 (`Belag b = SEITEN.stück(seite); rezept = rezept + b;`),
  Z. 815, 903, 1033 (`rezept = ((Tomate, Mozzarella, Basilikum))`), Z. 1036 (`rezept = rezept + SEITEN.stück(seite)`), Z. 2140 (Belag-Textform im
  Knopf) – z. B. eigene Klasse `Rezept` mit `Blech<margherita>` Beläge und `Speisekarte` Preise (Grundpreis 5, Tomate 1, Mozzarella 1,5, Basilikum 0,5,
  Salami 1,5, Pilze 1, Oliven 1, Parmesan 1,2, Rucola 1, Gorgonzola 1,5, Artischocken 1,5, Knoblauch 0,3 – dann bleiben alle Zahlen des Spiels gleich).
- **Multithreading-Branch (`D:\Projekte\pizza-threads`, Merge-Hinweise – im Merge von master in `multithreading` erledigt: PKF1 ohne Tags 11/22/23, Stück-Status 3 frei, Name `brigade` = 190, Fuzz-Generator vereint):** `laufzeit/src/kueche.rs` kopiert `A_PIZZA`/`A_SICHT`/`A_STUECK`/
  `A_BELAG` für PKF1 (Z. 188, 213, 226, 251–258, 342–348) – diese Zweige entfallen; `namen.rs` verliert `UnbekannterBelagAnanas`,
  `BesitzAnanas` und die Belag-Namen (Indizes der Namen und der eingebauten Ananas verschieben sich – `frontend.js` „Klassenindex 18 + n“
  und IR.md §1 werden zu „16 + n“); `laufzeit.wasm` ist ein Binärkonflikt (nach dem Merge neu bauen); `a14-kueche.js`, `kueche-*`-Fälle
  und SPEC §17.5 verweisen auf Pizza-Sicht/Stück; Beispiel-/Test-/Doku-Dateien des Branches enthalten noch Pizza-Literale, falls dort
  geändert (`besitz.pizza`, `schneiden.pizza`, `freitagabend-ansturm.pizza`, `hanoi.pizza`, Doku, `std-besitz.pizza` – auf diesem Branch zu `std-schieb.pizza` –, `teile-rand.pizza` – hier gelöscht –, `hawaii-pizza` – hier `hawaii-nicht-fangbar`).
- **Status:** fest (Entscheidung). Umsetzung vollständig auf dem lokalen Branch `bereinigung-pizza-objekt` (Worktree `D:\Projekte\pizza-bereinigung`);
  Merge nach master erst nach „Idle angepasst“. Prüfstand: K-105-Fälle in `a10-klaerungen.js` (vor dem Merge in `a11-klaerungen-offen.js`).
### K-106 Vorratskammer: Namensraum – ein Spielstand für alle Fassungen eines Programms (Nutzerwunsch)
- **Frage/Befund:** Nutzerwunsch „Namespaces im Savegame, sodass ein Spiel in mehreren Versionen dasselbe Storage verwendet.“
  Befund im Code: Der Kammername ist **bereits** der geräteweite Schlüssel – im Playground teilen eigene Tabs, Datei-Tabs,
  geteilte Tabs (`#h=`) und App-Links (`#app=`, jeder Teilen-Schlüssel) `localStorage["pizza.vorrat.<name>"]`, EXE und CLI
  `<ordner>/<name>.json`. Getrennt ist nur der Beispiel-/Doku-Namensraum `pizza.vorrat-beispiel.<name>` (K-088 a) – und das
  Idle-Spiel läuft als Beispiel: Galerie-Tab und App-Link haben verschiedene Stände. Zusätzlich fehlte eine Gruppierung mehrerer
  Kammern eines Spiels und ein Weg, diese Zuordnung im Programm auszusprechen.
- **Entscheidung – Sprache:** `neu Vorratskammer(name, namensraum)` – zweiter Parameter, positional oder benannt
  (`neu Vorratskammer("spielstand", namensraum: "pizza-imperium")`, K-094/K-095). `namensraum` fehlend oder `karton` → **ohne**
  Namensraum (alles wie bisher; typisierter Parameter nach K-102); sonst Textform des Werts, erlaubt `[a-z0-9-]{1,40}`, sonst
  `LaufzeitAnanas: Ungültiger Namensraum 'X' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).` (geprüft **nach** dem Kammernamen).
  **Kennung** einer Kammer = `name` ohne bzw. `namensraum + "/" + name` mit Namensraum (`pizza-imperium/spielstand`). Die Kennung
  ist der Schlüssel in `optionen.vorrat`, das erste Argument von `onVorrat(kennung, eintraege)`, das Feld `name` im Ereignis
  `{ typ: "vorrat", name, schluessel, wert }` und in der Serialisierung (`{"v":1,"name":"<kennung>","eintraege":[…]}`), der Name
  im HOST-ABI (`vorrat_lesen`/`vorrat_schreiben`, Signaturen unverändert), der Name in den Ananas-Texten (`Die Vorratskammer
  'pizza-imperium/spielstand' ist voll (Limit 1 MiB).`, `… konnte nicht gespeichert werden.`, KüchenAnanas aus K-099) und die
  Textform `Vorratskammer(pizza-imperium/spielstand)`. **Gleiche Kennung = gleiche Kammer** (ersetzt „gleicher Name“ aus K-079):
  `neu Vorratskammer("a")` und `neu Vorratskammer("a", namensraum: "x")` sind zwei Kammern. Neue Methode `namensraum()` → Text
  oder `karton`; `name()` bleibt der Kammername ohne Raum. Limits (1 MiB je Kammer, 2 MiB je Programm) unverändert. Bitgleich in
  Interpreter und Wasm-Laufzeit.
- **Entscheidung – Ablage (ergänzt K-088 a):** Ohne Namensraum gehört die Kammer dem **Tab**: Beispiel-/Doku-Tabs →
  `pizza.vorrat-beispiel.<name>`, alle anderen → `pizza.vorrat.<name>` (K-088 bleibt). Mit Namensraum gehört die Kammer dem
  **Programm**: im Browser immer `localStorage["pizza.vorrat.<raum>/<name>"]` – auch im Beispiel-/Doku-Tab, in geteilten Tabs und
  App-Links jeder Fassung; nativ `<ordner>/<raum>/<name>.json` (EXE und `node bin/pizza.js` im selben Datenordner; `--vorrat=ordner`
  und `--kein-vorrat` wirken wie bisher auf alle Kammern). Browser und native Ablage bleiben getrennt (verschiedene Speicher), das
  Verhalten ist gleich. Begründung für die Beispiele: Der Namensraum ist die ausdrückliche Erklärung des Autors „dies ist **ein**
  Spielstand, wo immer das Programm läuft“ – genau der Fall des Idle-Spiels; Lehrbeispiele ohne Namensraum bleiben isoliert und
  können weiterhin nichts verfälschen. Tests fassen den echten Vorrat nie an: Prüfstand/run-tests/Doku-Blöcke arbeiten mit
  `optionen.vorrat` im Speicher (bzw. W0101), `host/test.js` mit `--kein-vorrat`, E2E in frischen Browser-Kontexten.
- **Verwaltung:** Playground „Vorrat löschen“ bietet die Kammern des aktiven Tab-Namensraums **und** alle Kammern mit Namensraum
  (Anzeige mit Kennung `raum/name`); „Alle Vorräte löschen“ löscht genau diese Liste. CLI/EXE: `--vorrat-loeschen <kennung>`
  (auch `raum/name`), `--vorrat-loeschen-alle` löscht zusätzlich alle `<raum>/<name>.json` gültiger Kennung (leer gewordene
  Raum-Ordner werden entfernt); Texte `Vorrat 'raum/name' gelöscht.`, `Vorrat 'raum/name' gibt es nicht.`; ungültige Kennung →
  Exit 2 `Ungültiger Kammername 'X' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen, mit Namensraum 'raum/name').` (CLI und Host gleich).
- **Sicherheit:** Host (Rust), CLI und Browser prüfen die Kennung **selbst** (höchstens ein `/`, beide Teile einzeln gegen
  `[a-z0-9-]{1,40}`) und bauen Pfade nur aus den geprüften Teilen (`ordner.join(raum).join(name + ".json")`), nie aus dem Rohtext;
  ungültige Kennung → `vorrat_lesen` liefert `-1`, `vorrat_schreiben` `-1` (Speicher-Ananas) – kein Pfad-Traversal, auch bei einem
  manipulierten `.pkarton`.
- **Kompatibilität:** Ohne Namensraum ändert sich nichts (Schlüssel, Dateien, Ereignisse, Texte, `.vorrat.json`). Die Migration
  alter Stände ist Sache des Programms: alte Kammer (ohne Namensraum) öffnen, Einträge kopieren, alte Kammer leeren – im
  Beispiel-Tab findet sie den Beispiel-Stand, im App-Link den echten, beide landen im gemeinsamen Raum.
- **Betroffen:** SPEC §15.4 + Tabelle §15; Interpreter (`neueKammer`, Kammer-Identität, Textform, `namensraum()`); Wasm-Laufzeit
  (`laufzeit/src/vorrat.rs`, Name `namensraum`); HOST-ABI (Kennungsform); Host (`laufen.rs` Validierung/Pfadbau, `main.rs` Löschen);
  CLI (`bin/pizza.js`); UI (`ui/src/vorrat.js`, `main.js`, `app.js`); Doku-Referenz; Regressionsfälle `tests/faelle/k106-*`,
  Prüfstand a10, `tests/differenz`, `host/test.js`, E2E (zwei App-Links mit gleichem Namensraum teilen den Stand; Beispiel-Tab mit
  Namensraum schreibt nach `pizza.vorrat.`). Idle-Spiel (eigener Agent): `neu Vorratskammer("spielstand", namensraum: "pizza-imperium")`
  + Migration. **Status:** fest, umgesetzt (Interpreter + Wasm bitgleich, Host, CLI, UI, Doku; `test:differenz`, E2E grün).

### Theke v4 – Wünsche W1 … W7 des Idle-Agenten (THEKE-ERWEITERUNGEN.md §11.5): K-107 … K-113

Gemeinsame Leitlinie (Nutzer: „keep it simple, but extendable“; nur, was eine ordentliche High-Level-Sprache/UI-Bibliothek auch
hätte – keine Fachlogik; Browser = nativ, K-082): **Protokoll bleibt v1** – neue `art`, neue Felder, neue Ereignis-`typ`; alte
Renderer zeigen für neue Zutaten den Platzhalter und ignorieren neue Felder/Ereignisse (K-064/K-067). Alle neuen Namen gehen in
beiden Laufzeiten gleich (bitgleiche `ui`-Nachrichten, `test:differenz`). Zustands-/Optional-Regel K-102 gilt unverändert.
Nicht übernommen wird nur W6 (K-112). K-104 ist im Multithreading-Branch vergeben.

### K-107 Theke v4: `Reiter` – Titel ändern, Seiten ausblenden (W1)
- **Frage:** Reiter erst zeigen, wenn eine Spielebene offen ist; Kennzeichen „•“ für Neues im Reitertitel.
- **Entscheidung – Titel:** `reiter.setzeTitel(n, text)` → Reiter (verkettbar) und `reiter.titel(n)` → Text. `n` ist eine ganze Zahl
  `1 … Seitenzahl` (Zahl der Kinder, wie `waehle`), sonst dieselbe Ananas wie `waehle`:
  `KeinStückAnanas: Seite 7 gibt es nicht – der Reiter hat 2 Seiten.` (Textform von `n`, „1 Seite“ im Singular). `text` ist ein
  **Zustandsfeld** (K-102): Textform jedes Werts, `karton`/fehlend → `"karton"`. Ist die Titelliste kürzer als `n`, wird sie mit `""`
  aufgefüllt (der Renderer zeigt dort weiter „Seite k“). `titel(n)` liefert `""` für einen fehlenden Titel. Nachricht: Feld `titel`
  als **ganze Liste** (wie `kinder`, K-057; ein Eintrag je Zutat, letzter Wert gewinnt).
- **Entscheidung – Seiten ausblenden:** **kein neues Feld, keine neue Methode.** Eine Reiter-Seite ist eine Zutat; `seite.sichtbar(nein)`
  blendet beim Renderer **den Reiter und die Seite** aus (Tab verschwindet aus der Leiste; Pfeiltasten/Home/End überspringen ihn),
  `sichtbar(ja)` bringt beide zurück. `gewaehlt` bleibt Programmzustand: zeigt es auf eine unsichtbare Seite, zeigt der Renderer die
  **nächste sichtbare Seite danach**, sonst die letzte sichtbare davor, und sendet **nichts** (Setter lösen keine Rückrufe aus,
  K-073; der nächste Klick sendet die echte Seitennummer). Alle Seiten unsichtbar → leere Leiste, leere Fläche. `waehle(n)` auf eine
  unsichtbare Seite ist erlaubt (Zustand), der Renderer zeigt die Ersatzseite. Mit `uebergang(ja)` an der Seite blendet die Seite weich
  aus; der Tab verschwindet sofort. Begründung: Ein Konzept (`sichtbar`) statt drei; kein bestehendes Programm versteckt heute eine
  Reiter-Seite direkt (Idle-Spiel und Beispiele geprüft), die Änderung bricht nichts.
- **Betroffen:** SPEC §16.5-Tabelle (Reiter) + §16.7; THEKE.md §8; Interpreter (`UI_TABELLEN.reiter`), Wasm (`theke.rs` zart 10);
  Renderer (`zeichneReiter`, `gezeigt`), `tests/theke`, Prüfstand a13, `tests/faelle/theke-v4-*`, Differenzkorpus, Doku-Referenz.
  **Status:** fest.

### K-108 Theke v4: einklappbarer `Abschnitt` (W2)
- **Frage:** „Erledigt“- und Kleinbetriebe-Zeilen sollen sich zu- und aufklappen lassen (bisher Knopf „▸ zeigen“ + `sichtbar`).
- **Entscheidung:** Zwei Wahrheitswerte am `Abschnitt`, beide Getter/Setter-Überladungen wie `aktiv`/`sichtbar`:
  - `klappbar(diavolo)` / `klappbar()` – der Gast darf den Abschnitt am Kopf zu- und aufklappen (Standard `nein`).
  - `zu(diavolo)` / `zu()` – Inhalt eingeklappt (Standard `nein`). Auch ohne `klappbar` setzbar (Programm steuert allein).
  - `beiAenderung(fn)` → `fn(zu)` (diavolo, `ja` = zugeklappt); wie bei Haken ist der Zustand **vor** dem Rückruf aktualisiert;
    `karton` entfernt den Rückruf. Nicht-diavolo → `TypAnanas: Erwartet diavolo (ja/nein), bekam 1.` (K-066).
  - Konstruktor bleibt `(titel, kinder)`; Verkettung: `neu Abschnitt("Erledigt", zeilen).klappbar(ja).zu(ja)`.
- **Protokoll:** Felder `klappbar:true` und `zu:true` nur bei Abweichung im `baum`, in `aendere` der neue Wert (`true`/`false`).
  Ereignis Renderer → Programm: `{"typ":"aenderung","id":"z5","wert":true}` (`wert` = neuer `zu`-Zustand, `true`/`false`, auch
  `"true"`/`"false"` wie beim Haken). Das Programm nimmt es nur an, wenn die Zutat ein Abschnitt mit `klappbar == ja` im gezeigten
  Baum ist; sonst ignoriert (K-064). Auch ohne Rückruf wird `zu` übernommen.
- **Renderer:** Mit `klappbar` wird der Kopf ein Knopf (`<button aria-expanded>`, Pfeil ▸/▾ vor dem Titel; leerer Titel → nur der
  Pfeil), Klick/Enter/Leertaste schaltet **sofort lokal** um und sendet `aenderung` nur bei echtem Wechsel; `zu` vom Programm sendet
  nie. `zu` versteckt den Inhalt (`hidden` am Inhaltsbereich – Kinder eines zugeklappten Abschnitts gelten für Animationen als nicht
  gezeigt, K-090/K-092); mit `uebergang(ja)` am Abschnitt blendet der Inhalt weich ein/aus. Ohne `klappbar` und ohne `zu` sieht
  der Abschnitt aus wie bisher. Alte Renderer: immer offen.
- **Betroffen:** SPEC §16.5-Tabelle (Abschnitt) + §16.7; THEKE.md §8; Interpreter, Wasm (`theke.rs` zart 8, `verteile`), Renderer
  (`abschnitt`, `gezeigt`), `tests/theke`, a13, `tests/faelle`, Differenzkorpus, Doku. **Status:** fest.

### K-109 Theke v4: `Auswahl` – Umschalter / Segment-Auswahl (W3)
- **Frage:** Kaufmenge 1× · 10× · 100× · Max als ein Steuerelement statt vier eingefärbter Knöpfe.
- **Entscheidung:** Neue Zutat **`Auswahl`** – genau eine Option ist gewählt (ein Reiter ohne Seiten, Bedienung wie Radioknöpfe):
  - `neu Auswahl(optionen, gewaehlt: 1)` (auch benannt `optionen:`, `gewaehlt:`; `id:` wie überall). `optionen` ist ein Blech, die
    Einträge werden als **Textform** gespeichert (Zustandsfeld, K-066/K-102: `karton` → `"karton"`); fehlend/`karton` → `[]`;
    kein Blech → `TypAnanas: Auswahl braucht ein Blech mit Optionen, nicht 5.` `gewaehlt` fehlend/`karton` → `1` (auch bei leerer
    Liste – wie `Reiter`), sonst ganze Zahl `1 … Anzahl`, sonst `KeinStückAnanas: Option 7 gibt es nicht – die Auswahl hat 4
    Optionen.` („1 Option“ im Singular).
  - Methoden: `optionen()` → Kopie des Blechs, `setzeOptionen(blech)` (gleiche Prüfung/Ananas wie der Konstruktor; `gewaehlt`
    bleibt unverändert, der Renderer klemmt auf `1 … n`), `waehle(n)` (Prüfung wie oben, verkettbar), `gewaehlt()`,
    `beiAenderung(fn)` → `fn(n)`, `aktiv(diavolo)` / `aktiv()`. Textform `Auswahl(z3)`, `erbt Auswahl` → P0010, Typname `Auswahl`.
- **Protokoll:** `{"id":"z3","art":"auswahl","optionen":["1×","10×","100×","Max"],"gewaehlt":1}` (+ `aktiv:false` bei Abweichung);
  in `aendere`: `optionen` als ganze Liste, `gewaehlt`, `aktiv`. Ereignis `{"typ":"aenderung","id":"z3","wert":2}` – angenommen
  nur für eine aktive `Auswahl` im gezeigten Baum mit ganzem `wert` in `1 … Anzahl` (sonst ignoriert, K-064); Zustand vor dem
  Rückruf aktualisiert (K-056), auch ohne Rückruf.
- **Renderer:** Segment-Leiste (`role="radiogroup"`, Optionen als `<button role="radio" aria-checked>`), gewählte Option in der
  Themenfarbe (`stil.farbe`), Pfeil links/rechts (mit Umlauf), Home/End; Klick/Taste schaltet sofort lokal um und sendet nur bei
  echtem Wechsel; `gewaehlt` vom Programm sendet nie; ungültiges/zu großes `gewaehlt` wird wie beim Reiter auf `1 … n` geklemmt;
  `aktiv:false` deaktiviert alle Knöpfe. Alte Renderer: Platzhalter.
- **Betroffen:** SPEC §11-Typliste (Namen), §16.5-Tabelle + §16.7; THEKE.md §2/§8; Interpreter (`TYPEN`, `UI_KLASSEN`, `uiNeu`,
  `uiBaum`, `uiVerteile`, `pruefeTyp`), Wasm (`namen.rs`: `Auswahl`, `optionen`, `setzeOptionen`; `theke.rs` zart 11), Compiler
  (`frontend.js` THEKE/UNTERSTUETZTE_TYPEN), Renderer (`registriere("auswahl")`), `tests/theke`, a13, `tests/faelle`, Differenzkorpus,
  Doku. **Status:** fest.

### K-110 Theke v4: `Tastatur` – Tastenereignisse (W4)
- **Frage:** Minispiele („Fangen!“) ohne Maus bedienen; Tasten müssen deterministisch testbar sein (`.ereignisse`).
- **Entscheidung:** Tastatur ist – wie `Takt` – eine **unsichtbare Zutat**, keine Methode der `Theke`: `neu Tastatur(beiTaste?)`
  (auch benannt `beiTaste:`; `id:`), `beiTaste(fn)` → `fn(taste)` (Text), `aktiv(diavolo)` / `aktiv()`. Sie muss im gezeigten Baum
  liegen (K-057) und nutzt den vorhandenen Zustellungsweg über `id`; kein neues `op`, keine Theke-Methode, keine Änderung an Brücken/
  Host. Mehrere aktive Tastaturen im Baum bekommen jede Taste (Baumreihenfolge). Textform `Tastatur(z1)`, `erbt Tastatur` → P0010.
  `animiere` an einer Tastatur ist erlaubt und bleibt unsichtbar (wie Takt).
- **Protokoll:** Knoten `{"id":"z1","art":"tastatur"}` (+ `aktiv:false`); Ereignis `{"typ":"taste","id":"z1","taste":"Leertaste"}`.
  Das Programm nimmt es an für eine aktive `Tastatur` im gezeigten Baum mit Rückruf und nicht-leerem Text in `taste`; sonst ignoriert.
  Zustellung kostet 0 Schritte, der Rückruf zählt (K-069). `.ereignisse` darf `taste`-Zeilen enthalten.
- **Tastennamen (Renderer, verbindliches Vokabular):** `e.key` des Browsers, deutsch für die Sondertasten:
  `" "` → `Leertaste`, `ArrowLeft/Right/Up/Down` → `Links`/`Rechts`/`Hoch`/`Runter`, `Backspace` → `Rücktaste`, `Delete` → `Entfernen`,
  `Home` → `Pos1`, `End` → `Ende`, `PageUp`/`PageDown` → `BildHoch`/`BildRunter`; unverändert `Enter`, `Escape`, `Tab`, `F1` … `F12`;
  Zeichen so, wie sie getippt werden (`a`, `A`, `1`, `+`, `ä`). **Nicht gesendet:** reine Modifikatoren (`Shift`, `Control`, `Alt`,
  `AltGraph`, `Meta`, `CapsLock`, `NumLock`, `ScrollLock`, `Fn`), `Dead`/`Unidentified`, Eingaben während einer Komposition
  (`isComposing`/keyCode 229), **Wiederholungen bei gedrückter Taste** (`e.repeat` – ein Druck = ein Ereignis) und Tasten in einer
  fokussierten `Eingabe` (die gehören dem Feld). ~~Tasten erreichen die Tastatur **zusätzlich** zu dem, was ein fokussierter Knopf/Reiter
  damit tut (Leertaste klickt den fokussierten Knopf und kommt als `Leertaste` an).~~ **Ersetzt durch K-114:** eine Taste, ein Empfänger.
- **Fokus (Browser = nativ):** Das Theke-Wurzelelement ist fokussierbar (`tabindex="-1"`); der Tastatur-Listener hängt dort – Tasten
  im Playground-Editor erreichen die Theke nie. Ein Klick ins Fenster gibt ihm den Fokus; beim `baum` fokussiert der Renderer die Wurzel,
  wenn nichts anderes fokussiert ist (nativ: sofort; Playground: ohne Fokusdiebstahl). Liegt eine aktive Tastatur im Baum, unterdrückt der
  Renderer die Standardwirkung (Scrollen) von Leertaste/Pfeilen/Pos1/Ende/Bild **nur**, wenn kein Element im Fenster fokussiert ist.
- **Betroffen:** SPEC §11-Typliste, §16.5-Tabelle + §16.7; THEKE.md §2/§6 (Ausblick „Tastaturereignisse“ erledigt); Interpreter,
  Wasm (`namen.rs`: `Tastatur`, `beiTaste`; `theke.rs` zart 12, `verteile` `"taste"`), Compiler-Listen, Renderer
  (`registriere("tastatur")`, Wurzel-`tabindex`, Fokus bei `baum`), `fenster.html` unverändert, `tests/theke` (jsdom `KeyboardEvent`),
  `visuell.mjs` (`page.keyboard.press`), a13, `tests/faelle`, Differenzkorpus, E2E 09 (Editor-Tippen bleibt Editor), Doku. **Status:** fest.

### K-111 Standardbibliothek: `Mathe.log`, `log10`, `log2`, `exp`, `E` (W5)
- **Frage:** Max-Kauf in geschlossener Form statt Schleife – `Mathe.log` fehlt.
- **Entscheidung:** `Mathe.log(x)` (natürlicher Logarithmus), `Mathe.log10(x)`, `Mathe.log2(x)`, `Mathe.exp(x)` und die Konstante
  `Mathe.E` (ohne Klammern, wie `PI`). Verhalten exakt wie `Math.log/log10/log2/exp/E` in JavaScript inklusive Sonderfälle
  (`log(0)` → `-Infinity`, `log(-1)` → `NaN`, `log(Infinity)` → `Infinity`, `exp(-Infinity)` → `0`, `exp(710)` → `Infinity`, `NaN`
  durchgereicht; K-005). Kein zweistelliges `log(x, basis)` – `log(1000)/log(10)` wäre `2.9999999999999996`, dafür gibt es `log10`/`log2`.
  Nicht-Zahl → TypAnanas wie bei `wurzel`. Schritte: normaler Aufruf.
- **Bitgleichheit (Pflicht):** Die Wasm-Laufzeit muss für jeden Eingabewert dasselbe Bitmuster liefern wie V8 (`Math.*`,
  `src/base/ieee754.cc`: Sun-fdlibm `e_log.c`, `e_log10.c` in der Form `ivln10 · log(x)`, FreeBSD `e_log2.c` mit `k_log1p`, `e_exp.c`
  mit Sonderfall `exp(1) = E`). **Befund der Umsetzung:** `libm` 0.2 (musl) weicht ab – 1515 von 86 200 Stichproben (log 36, log10 1470,
  exp(1) 9) –, deshalb sind die vier Routinen als fdlibm-Port in `laufzeit/src/zahl.rs` (nur Double-Operationen); Nachweis
  `tests/wasm/laufzeit-zahlen.js`: 24 550 Eingaben × 4 Funktionen = 98 200 Bitvergleiche, 0 Abweichungen (Pseudozufall, exp-Bereich
  [−745, 710], subnormal, Ränder 0/−0/5e-324/1±1e-16/±∞/NaN/1e±300). Begründung: K-103 meidet `log10`/`pow` wegen genau dieser Gefahr;
  `Mathe.log` ist aber ein erwartbarer Standardbaustein jeder Sprache.
- **Betroffen:** SPEC §11-Tabelle (`Mathe`) + §14.11; Interpreter (`MATHE_M`, Modul-Konstante `E`), Wasm (`namen.rs`: `log`, `log10`,
  `log2`, `exp`, `E`; `std_m.rs`, `klassen.rs` Konstante, `zahl.rs`), `tests/wasm/laufzeit-zahlen.js`, Prüfstand a10/a08, `tests/faelle`,
  Differenzkorpus, Doku-Referenz (Mathe-Tabelle). **Status:** fest.

### K-112 `Meldung`/Toast mit Warteschlange – **abgelehnt** (W6)
- **Frage:** Mehrere Neuigkeiten kurz hintereinander anzeigen (Warteschlange statt „letzte gewinnt“).
- **Entscheidung:** Keine Zutat. Wie lange eine Meldung steht, wie viele warten dürfen, ob Gleiches zusammengefasst wird – das ist
  Anwendungslogik, und die Bausteine sind da: ein `Schild` (oder `Abschnitt`), ein `Blech` als Schlange, ein `Takt`, der alle 2 s die
  nächste Zeile zeigt, dazu `animiere("einblenden")`/`schwebe` für Flüchtiges. Ein UI-Baukasten dieser Größe braucht keine Toast-Politik;
  eine fertige `Meldung` müsste Dauer, Stapelung, Position und Verdrängung festlegen und würde doch nie allen Spielen passen. Die
  Doku-Referenz bekommt das Muster als Beispiel („Meldungen der Reihe nach“); THEKE-ERWEITERUNGEN.md streicht die Idee.
- **Status:** fest (abgelehnt).

### K-113 Theke v4: Stile `zeilen` und `mindestbreite` – ruhiges Layout (W7)
- **Frage:** Texte wachsen, Knöpfe sollen stehen bleiben: feste Zeilenzahl mit Auslassung für `Schild` bzw. Mindestbreite für Knöpfe.
- **Entscheidung:** Zwei neue Schlüssel in der Stil-Whitelist (K-068), angehängt – die erlaubte Liste lautet jetzt
  `breite, hoehe, abstand, ausrichtung, schrift, farbe, zeilen, mindestbreite` (Fehlertexte entsprechend, in beiden Laufzeiten gleiche Reihenfolge):
  - `zeilen`: ganze Zahl ≥ 1 – die Zutat ist **genau** so viele Textzeilen hoch (auch bei kürzerem Text), längerer Text wird mit „…“
    abgeschnitten; sonst `TypAnanas: Stil 'zeilen' braucht eine ganze Zahl ≥ 1, nicht 0.` Wirkt beim Renderer auf den Text von `Schild`,
    `Knopf` und `Haken`; andere Zutaten ignorieren ihn (Vorwärtskompatibilität, kein Fehler).
  - `mindestbreite`: Zahl ≥ 0 in Pixeln (wie `breite`; Fehlertext `Stil 'mindestbreite' braucht eine Zahl ≥ 0, nicht -1.`) – die Zutat
    wird nie schmaler, darf aber wachsen (`min-width`); für jede Zutat.
  - `stil(k, karton)` entfernt den Stil (K-075, Nachricht `null`). Protokoll unverändert (`stil`-Objekt); alte Renderer warnen in der
    Konsole und ignorieren die Schlüssel.
- **Betroffen:** SPEC §16.2 (Stile), THEKE.md §2; Interpreter (`UI_STIL`), Wasm (`theke.rs` `STIL_NAMEN`, Zahl-Prüfung je Art statt
  `ki <= 2`, hartkodierte Erlaubt-Liste), Renderer (`wendeStilAn`, CSS `--theke-zeilen`/`--theke-mindestbreite`), `tests/theke`,
  `visuell.mjs`, a13 (zwei Erlaubt-Texte Z. 346/701), `tests/faelle/theke-fehlerfaelle.erwartet`, Doku. **Status:** fest.

### K-114 Nachtrag zu K-110: eine Taste, ein Empfänger – Fokus nach Mausklick (Renderer)
- **Befund:** Nach einem Mausklick bleibt der Knopf fokussiert (Chromium/WebView2; Safari/WebKitGTK nicht – also schon heute
  plattformabhängig). Die nächste Leertaste klickte ihn nativ **und** kam als `taste` an: im Pizza-Imperium backte die Leertaste und kaufte
  zugleich den zuletzt geklickten Kauf-Knopf. Das „zusätzlich“ aus K-110 ist in der Praxis ein Fehler.
- **Entscheidung (Renderer, Browser = nativ, kein Protokoll-/Sprachwechsel):**
  1. **Zeigerklick gibt den Fokus an die Wurzel.** Ein Klick mit `e.detail > 0` (Maus/Touch) auf ein Bedienelement – Knopf,
     Klapp-Knopf eines Abschnitts, Haken (auch über seinen Text), Reiter-Tab, Auswahl-Option – lässt den Fokus nicht dort: der Renderer
     fokussiert danach die Theke-Wurzel (`preventScroll`). Klicks per Tastatur (`detail 0`) und Klicks in eine `Eingabe` ändern den Fokus
     nicht. So geht die Leertaste nach einem Mausklick an die Tastatur – und nur dorthin.
  2. **Eine Taste gehört genau einem Empfänger.** Hat der Nutzer ein Bedienelement per Tab fokussiert, gehören ihm die Tasten, die es selbst
     verarbeitet: Leertaste/Enter auf Knopf, Klapp-Knopf, Haken, Reiter-Tab und Auswahl-Option; Pfeile links/rechts und Pos1/Ende auf
     Reiter/Auswahl (deren Handler rufen `preventDefault`). Diese Tasten erreichen **keine** Tastatur. Alle anderen Tasten (Buchstaben,
     Ziffern, `Escape`, `Tab`, Hoch/Runter …) kommen weiter an. Ein Haken ist dabei keine `Eingabe` (bisher schluckte ein fokussierter Haken
     jede Taste); Textfelder behalten alle Tasten.
- **Barrierefreiheit:** Tab + Leertaste/Enter bedient jeden Knopf wie bisher – mit oder ohne Tastatur im Baum –, der Fokus bleibt dabei
  auf dem Knopf. Nur Mausnutzer verlieren den (für sie unsichtbaren, `:focus-visible` greift nicht) Fokus auf dem Knopf; Tab von der Wurzel
  aus beginnt beim ersten Bedienelement der Theke.
- **Verworfen:** Leertaste/Enter auf fokussierten Knöpfen immer per `preventDefault` schlucken, sobald eine Tastatur zuhört – dann könnten
  Tastaturnutzer in Spielen mit Tastatur keinen Knopf mehr auslösen. Zeitfenster („Mitklick schlucken“) im Programm – nicht deterministisch
  und Sache des Renderers.
- **Folge:** Der 300-ms-Workaround im Pizza-Imperium ist überflüssig (es gibt keinen Mitklick mehr) und entfällt (Testdateien aus echtem
  Lauf neu: nur die vier verschluckten `klick backen` fehlen, Ausgabe und UI-Nachrichten unverändert).
- **Betroffen:** SPEC §16.7 (Tastatur), `site/js/theke/theke.js` (`zeigerKlick`, `tastenDruck`, `inEingabe`), `site/js/theke/README.md`,
  Doku-Referenz (Tastatur), `tests/theke/run.js`, E2E 09, Host neu gebaut (Renderer eingebettet), `site/beispiele/idle/pizza-imperium.pizza`.
  **Status:** fest.

### K-115 Theke: `kinder` in `aendere` zeigt den Zustand beim Senden – ganzer Knoten = ganzer Zustand
- **Befund (Pizza-Imperium):** Die `kinder`-Liste eines `aendere`-Eintrags wurde beim `hinzu`/`leeren` als Schnappschuss gebaut. Stand in
  derselben Nachricht **vor** dem Elternteil schon ein Eintrag eines Kindes (Reihenfolge = erste Änderung, K-057) und änderte das Programm
  das Kind **nach** dem `hinzu` (z. B. `sichtbar(ja)`), überschrieb der Renderer den neuen Einzelwert mit dem veralteten Schnappschuss
  (`sichtbar:false`). Ebenso ging ein vorher gepuffertes `stil`-`null` verloren, weil der Schnappschuss die ausstehenden Stil-Löschungen
  des Kindes als gesendet markierte. Zweiter Fall (Renderer): eine Zutat wandert in **einer** Nachricht von Behälter p nach q und wird
  unterwegs (nicht gezeigt, also ohne eigenen Eintrag) geändert – der Renderer verwendet das Element nach `id` wieder und behandelte den
  vollständigen Knoten als Teil-Update; nur bei Abweichung gesendete Felder (`sichtbar:false`, `aktiv:false`, `stil`, …) blieben stehen.
- **Grundsatz (verbindlich):** Was der Renderer nach einer Nachricht zeigt, entspricht dem Programmzustand am Synchronisationspunkt.
- **Entscheidung:**
  1. `hinzu`/`leeren` merken `kinder` nur vor; die Liste (vollständige Teilbäume wie im `baum`) entsteht **beim Senden** aus dem
     aktuellen Zustand. Position des Eintrags bleibt „erste Änderung“, alle Werte einer Nachricht stammen damit vom selben Zeitpunkt –
     die Reihenfolge der Einträge kann keinen veralteten Wert mehr nach vorn holen. Das Serialisieren eines Teilbaums gilt wie im `baum`
     als Senden der ausstehenden Stil-Löschungen seiner Zutaten (K-075) – jetzt am Synchronisationspunkt statt beim `hinzu`.
  2. Renderer: Ein **vollständiger Knoten** (mit `art`) in einer `kinder`-Liste ist der ganze Zustand der Zutat, auch wenn das Element
     wiederverwendet wird: fehlende Standardfelder gelten als Standard (`sichtbar:true`, `hinweis:""`, `uebergang:false`, `aktiv:true`
     bei Knopf/Takt/Auswahl/Tastatur, `platzhalter:""`, Fortschritt-`text:""`, Abschnitt `klappbar`/`zu:false`), `stil` ersetzt den
     ganzen Stil. Ein Verweis `{"id"}` ohne `art` bleibt Teil-Update (Element unverändert).
  - Protokoll bleibt `v:1` (gleiche Felder, gleiche Form); geändert hat sich nur, **wann** der Inhalt von `kinder` entsteht. Kein
    `.ui-erwartet` der Beispiele/Fälle ändert sich (Pizza-Imperium umgeht den Fall bereits; Workaround darf bleiben).
- **Betroffen:** SPEC §16.2 (Bündelung), §16.3; THEKE.md; Interpreter (`uiAendere`/`uiFlush`), Wasm (`theke.rs` `aendere_kinder`/
  `ui_flush`), Renderer (`baueIntern`, `mitStandard`), Host neu gebaut (Renderer eingebettet). Tests: `tests/faelle/k115-kinder-schnappschuss`,
  a13 (K-115), `tests/theke` (zwei Fälle). **Status:** fest.

### Theke v5 – ereignisgetriebenes, reaktives Programmiermodell (Nutzerwunsch): K-116 … K-118
Nutzer: „Mach bitte ein Redesign vom UI, ich will event-driven UI, nicht sowas mit repaint bei jedem Frame.“ Präzisierung: Rückwärts-
kompatibilität ist nicht gefordert, die Beispiele müssen laufen. **Befund:** Theke-Programme (Pizza-Imperium, Ofen-Timer) schreiben eine
`zeichne()`-Funktion, die in jedem Takt (10/s) und nach jedem Klick **alle** Zutaten neu setzt – mit Hand-Vergleichen (`falls (k.text() != t)`)
gegen K-073, weil jeder Setter sonst eine Nachricht erzeugt. Der Zustand liegt doppelt vor (Spiel und „gezeigt“-Variablen), und die Takt-Schleife
ist zugleich Simulation und Neuzeichnen. **Ziel:** Zustandsänderungen nur in Rückrufen; was der Gast sieht, folgt dem Zustand von selbst;
der Takt bleibt nur für die Simulation. Protokoll bleibt v1, der Renderer bleibt unverändert – Bindungen werden in der Laufzeit aufgelöst.

### K-116 Theke v5: `Zettel` (beobachtbarer Wert) und `binde` (Bindung einer Eigenschaft an einen Ausdruck)
- **Modell (verbindlich, SPEC §16.8):** Ein **`Zettel`** ist ein beobachtbarer Wert („der Zettel an der Theke – die Küche schreibt, die Theke
  liest“): `neu Zettel(wert = karton)`, `wert()`, `setze(w)` → Zettel. Jede Zutat **bindet** eine Eigenschaft an einen Ausdruck:
  `zutat.binde(eigenschaft, () -> …)` → Zutat, `zutat.bindeStil(schlüssel, () -> …)` → Zutat; `binde(eigenschaft, karton)` /
  `bindeStil(schlüssel, karton)` löst die Bindung (wie `stil(k, karton)`, K-075). Der Ausdruck ist eine Funktion ohne Parameter.
- **Abhängigkeiten werden automatisch erfasst:** Während der Ausdruck einer Bindung läuft, merkt sich die Laufzeit jeden gelesenen `Zettel`
  (`wert()`) **und jeden gelesenen Zutat-Getter** (`text()`, `wert()`, `an()`, `aktiv()`, `sichtbar()`, `hinweis()`, `uebergang()`,
  `intervall()`, `titel()` (Abschnitt; `titel(n)` des Reiters zählt als `titel`), `klappbar()`, `zu()`, `gewaehlt()`, `optionen()`, `spalten()`,
  `zeilen()`) als Quelle `(Objekt, Feld)`. Die Quellen werden bei **jeder** Auswertung neu erfasst (bedingte Lesezugriffe). Ändert sich eine
  Quelle – `Zettel.setze` mit **ungleichem** Wert (Gleichheit wie `==`, K-017: Zahl/Text/diavolo/karton nach Wert, `Dauer` nach ms, sonst
  Identität), ein Zutat-Setter, ein Renderer-Ereignis (`aenderung`/`enter` setzt `wert`/`an`/`gewaehlt`/`zu`) oder eine andere Bindung –, wird
  jede Bindung, die diese Quelle gelesen hat, **schmutzig**. Zutat-Getter sind damit selbst beobachtbar: `preis.binde("text", () -> …
  anzahl.wert() …)` folgt dem Tippen des Gastes ohne `beiAenderung`.
- **Auswertung nur an Synchronisationspunkten (K-057):** vor jedem Warten in `bediene()`, nach jedem Rückruf, vor `schliesse`, vor dem
  erneuten `fenster` bei `setzeTitel`, vor dem `baum` bei `zeige` und am Programmende (`uiEnde`) – **vor** dem Bau der `aendere`-Nachricht
  bzw. des `baum`s, so dass Nachricht und Programmzustand übereinstimmen (K-115). Dazu einmal **sofort beim `binde`** (die Eigenschaft steht
  danach schon; `z.text()` liefert den gebundenen Wert). Algorithmus (beide Laufzeiten gleich): höchstens 100 Durchläufe; je Durchlauf alle
  Bindungen in **Registrierungsreihenfolge** (ein erneutes `binde` derselben Eigenschaft ersetzt die alte Bindung und zählt als neue
  Registrierung), jede schmutzige wird **vor** ihrer Auswertung sauber markiert (eine werfende Bindung läuft erst wieder, wenn sich eine Quelle
  ändert) und ausgewertet; ihr Ergebnis wird wie der gleichnamige Setter geprüft/umgewandelt (Textform, diavolo-Pflicht, Fortschritt-Klemmen,
  Takt-Intervall, Listen, Bereichsprüfung von `gewaehlt`, Stil-Whitelist; `karton` bei `bindeStil` entfernt den Stil) und **nur bei echter
  Änderung** (K-117) gesetzt – das macht wieder Bindungen schmutzig, die diese Eigenschaft lesen. Sind nach 100 Durchläufen noch Bindungen
  schmutzig → `LaufzeitAnanas: Die Bindungen kommen nicht zur Ruhe – 'text' von Schild(z1) hängt von sich selbst ab.` (genannt wird die
  erste schmutzige Bindung in Registrierungsreihenfolge; Stil-Bindung: `Stil 'farbe' von Schild(z1)`). Bindungen werden an **allen**
  Zutaten ausgewertet, auch an nicht gezeigten (ihr Zustand stimmt dann beim `hinzu`/`zeige`); Nachrichten entstehen wie immer nur für gezeigte.
- **Bindbare Eigenschaften** (Name = Protokollfeld; Reihenfolge = Text „Bindbar: …“): Schild `text`; Knopf `text, aktiv`; Eingabe `wert`;
  Haken `text, an`; Takt `aktiv, intervall`; Fortschritt `wert, text`; Abschnitt `titel, klappbar, zu`; Tabelle `spalten, zeilen`; Reiter
  `gewaehlt`; Auswahl `optionen, gewaehlt, aktiv`; Tastatur `aktiv`; **jede** Zutat zusätzlich `sichtbar, hinweis` (am Ende der Liste); Stile
  nur über `bindeStil` (die Tabelle hat `zeilen` als Eigenschaft **und** als Stil). Sonst `LaufzeitAnanas: 'farbe' lässt sich an Schild(z1)
  nicht binden. Bindbar: text, sichtbar, hinweis.` Kein Blech-/`kinder`-Binden (Listen bleiben imperativ: `hinzu`/`leeren`; Ausblick).
  `binde()`/`bindeStil()` ohne Funktion → `TypAnanas: binde() braucht eine Funktion, z. B. () -> { … }.` (bzw. `bindeStil()`); unbekannter
  Stil wie `stil` (`Stil 'x' gibt es nicht. Erlaubt: …`). Eigenschaftsname und Stilschlüssel als Textform (K-066).
- **Eine Eigenschaft hat einen Schreiber:** Der Setter einer gebundenen Eigenschaft (`setzeText`, `aktiv(d)`, `stil(k, …)` bei gebundenem
  Stil, `waehle`, `setzeOptionen`, …) → `LaufzeitAnanas: 'text' von Schild(z1) ist gebunden – setze den Zettel, nicht die Zutat.` (Stil:
  `Stil 'farbe' von Schild(z1) ist gebunden – …`). Renderer-Ereignisse dürfen eine gebundene Eigenschaft setzen (der Gast tippt in eine
  gebundene `Eingabe`, wählt in einer gebundenen `Auswahl`): der Zustand folgt dem Gast, bis sich eine Quelle der Bindung ändert.
- **Steps (K-069/K-087):** `neu Zettel`, `wert()`, `setze()`, `binde()` kosten die normalen Aufrufknoten; die Auswertung einer Bindung zählt
  die Schritte ihres Ausdrucks (wie ein Rückruf) – an Synchronisationspunkten innerhalb des gerade laufenden Rückruf-Budgets (K-087), beim
  `binde` sofort. Warten kostet weiterhin 0. Ein `Zettel` ohne Theke ist eine gewöhnliche Schachtel (keine Nachricht, keine Warnung).
- **Küchenbrigade (S4):** `Zettel`, `binde`, `bindeStil` gibt es nur in der Hauptküche: `neu Zettel` und jede Zettel-Methode in einer Küche →
  `KüchenAnanas: Zettel gibt es nur in der Hauptküche.`; `binde`/`bindeStil` werfen wie alle Zutat-Methoden `Die Theke gibt es nur in der Hauptküche.`
  Ein Zettel ist nicht kartonfähig („Ein Zettel“ in der Kartonfehler-Meldung wie „Eine Theke-Zutat“).
- **Typ, Textform, Namen:** `Zettel` ist eingebauter Typname (wie `Zutat`; eigene Klasse `Zettel` hat Vorrang, `erbt Zettel` → P0010);
  Textform `Zettel(<Textform des Werts>)` (`Zettel(5)`, `Zettel(karton)`); Typname in Fehlertexten `Zettel`. `Zettel` zählt zur Importgruppe
  `theke` des Compilers (kein eigener Import). Keine abgeleiteten Zettel in v5 (`Zettel.aus(fn)` – Ausblick; jede Bindung **ist** bereits ein
  abgeleiteter Ausdruck).
- **Begründung:** Signale mit automatischer Abhängigkeitserfassung sind das Modell moderner UI-Bibliotheken (Solid, Vue, Svelte 5), passen zur
  synchronen Sprache (keine Zeitpunkte außer K-057) und brauchen weder Protokoll- noch Renderer-Änderung. Zutat-Getter als Quellen ersparen
  die meisten `beiAenderung`-Rückrufe. Die Auswertung an Synchronisationspunkten (statt sofort beim `setze`) bündelt wie bisher und macht
  Zwischenzustände unsichtbar. Verworfen: Dirty-Checking aller Bindungen je Synchronisationspunkt (das wäre wieder „neu zeichnen je Takt“,
  nur versteckt), typisierte `bindeText`/`bindeAktiv`-Methoden (mehr API, nicht erweiterbar), Setter-Vorrang statt Ananas (zwei Schreiber).
- **Betroffen:** SPEC §16.1 (Zettel-Zeile), §16.2 (Setter), §16.8 (neu); THEKE.md §2/§8; Interpreter `site/js/pizza.js`; Wasm `laufzeit/src/theke.rs`,
  `namen.rs`, `klassen.rs`, Compiler `frontend.js` (Typ `Zettel`); Doku `30-referenz.js` (Abschnitt „Zettel & Bindungen“, vorher/nachher);
  Beispiele `site/beispiele/theke/` (Umstellung); Prüfstand `a15-theke-zettel.js`; `tests/faelle/theke-zettel-*`; `tests/wasm/faelle`.
  Renderer und Host unverändert. **Status:** fest (Umsetzung in diesem Block).

### K-117 Theke v5: nur echte Änderungen werden gesendet (ersetzt den zweiten Satz von K-073)
- **Entscheidung:** Ein Setter (oder eine Bindung), der eine Eigenschaft auf den **gleichen** Wert setzt, ändert nichts: keine Nachricht, keine
  schmutzige Bindung. Gleichheit je Feld: Texte (`text`, `wert` der Eingabe, `titel`, `hinweis`, `platzhalter`) zeichengleich; `aktiv`,
  `sichtbar`, `an`, `klappbar`, `zu`, `uebergang` als diavolo; Zahlen (`wert` des Fortschritts **nach** dem Klemmen, `intervall` nach der Rundung,
  `gewaehlt`) nach Wert; Listen (`spalten`, `optionen`, `titel` des Reiters) elementweise zeichengleich, `zeilen` zeilen- und elementweise;
  `stil` als ganzes Objekt (Schlüsselmenge und Werte; `stil(k, karton)` für einen nicht gesetzten Schlüssel ändert nichts und sendet kein `null`);
  `kinder`: `hinzu` ändert immer, `leeren()` eines leeren Behälters nicht. Ein Renderer-Ereignis mit unverändertem Wert (gleicher Text,
  gleiche Seite) ändert ebenfalls nichts (Rückruf läuft trotzdem, K-056). Die Position eines Eintrags in `aendere` ist weiterhin die **erste
  echte** Änderung der Zutat (K-057); „a → b → a“ innerhalb eines Rückrufs sendet `a` (Vergleich gegen den aktuellen Zustand, nicht gegen den
  zuletzt gesendeten – einfacher und in beiden Laufzeiten gleich).
- **Begründung:** Mit Bindungen ist „nur echte Änderungen“ Voraussetzung (sonst würde jede Auswertung senden); dieselbe Regel für Setter macht
  die Hand-Vergleiche des Pizza-Imperiums überflüssig und das Modell einheitlich: *Die Theke sendet, was sich ändert.* Protokoll bleibt v1
  (gleiche Felder), es entfallen nur Einträge. Testdateien (`.ui-erwartet`), die identische Setzvorgänge enthielten, wurden neu erzeugt; a13-Fälle
  zu K-073 umgeschrieben.
- **Betroffen:** SPEC §16.2 (Setter, Bündelung), THEKE.md §2/§8; Interpreter + Wasm (`uiSetze`/`setze` als zentrale Schreibstelle); Beispiele
  und Fälle mit `.ui-erwartet`. **Status:** fest.

### K-118 Theke v5: Eine Bindung rechnet nur – Verbote, Zyklen, Warnung W0103
- **Nur Rechnen:** Innerhalb eines Bindungs-Ausdrucks ist jede Methode, die Zustand ändert oder sendet, verboten: alle Setter von Zutaten
  (`setzeText`, `setzeWert`, `setzeAn`, `aktiv(d)`, `sichtbar(d)`, `hinweis(t)`, `uebergang(d)`, `stil(k, w)`, `setzeIntervall`,
  `setzeTitel`, `klappbar(d)`, `zu(d)`, `waehle`, `setzeOptionen`, `setzeSpalten`, `setzeZeilen`), `hinzu`, `leeren`, `binde`, `bindeStil`,
  `animiere`, `Theke.schwebe`/`zeige`/`bediene`/`schliesse`/`setzeTitel` und `Zettel.setze` →
  `LaufzeitAnanas: Eine Bindung rechnet nur – 'setzeText' ist darin nicht erlaubt.` (Methodenname wie gerufen; überladene Getter/Setter
  `aktiv()`, `sichtbar()`, `hinweis()`, `uebergang()`, `klappbar()`, `zu()` sind **ohne** Argument erlaubt). Getter, Konstruktoren
  (`neu Schild(…)`, `neu Zettel(…)`), `Bote.sage`, Rechnen, eigene Methoden sind erlaubt. Ein werfender Ausdruck lässt die Bindung sauber
  (K-116) und wirft aus `binde()` bzw. aus `bediene()` wie ein Rückruf (fangbar mit `probier`); die Theke bleibt offen.
- **Zyklen:** Durch das Schreibverbot können nur Bindungen untereinander kreisen (A liest B, B liest A mit wechselnden Werten) – erkannt durch
  die 100-Durchläufe-Grenze (K-116). Ketten (A liest B, B liest einen Zettel) konvergieren in ≤ Kettenlänge Durchläufen, weil nur echte
  Änderungen weitergeben (K-117); Kreise mit stabilen Werten sind harmlos.
- **W0103 (je Aufrufstelle, §10):** Liest eine Bindung bei ihrer **ersten** Auswertung (beim `binde`) weder Zettel noch Zutat-Getter, wird sie nie
  wieder berechnet: `W0103: Die Bindung 'text' von Schild(z1) liest weder Zettel noch Zutat – sie rechnet nur einmal.` (Stil: `Die Bindung
  Stil 'farbe' von …`). Typischer Fehler: ein gewöhnliches Feld statt eines Zettels lesen. Ausweg für objektlastige Zustände: ein Zettel
  `stand` als Taktgeber (`stand.setze(stand.wert() + 1)` im Rückruf, `stand.wert();` am Anfang des Ausdrucks).
- **Betroffen:** SPEC §16.8, THEKE.md §8, Doku-Referenz (Fehlertexte-Tabelle W0103), Interpreter, Wasm. **Status:** fest.

### K-119 Theke v5: Vertragslücken aus der Umsetzung (Interpreter a07c1f1, Wasm 75b2b0e/67c446f) – entschieden wie umgesetzt
- **Erlaubt in Bindungen:** `bei*`-Registrierungen (`beiKlick`, `beiAenderung`, `beiEnter`, `beiTakt`, `beiTaste`), `id()`, `alsText()`,
  `Theke.titel()` – sie ändern keinen Zustand, den der Renderer sieht, und stehen nicht auf der Verbotsliste von K-118.
- **`binde` wertet nur die neue Bindung sofort aus;** Bindungen, die deren Eigenschaft lesen, folgen erst am nächsten Synchronisationspunkt
  (`a.text()` zeigt bis dahin den alten Wert).
- **Prüfreihenfolge:** Argument-Umwandlung vor der Gebunden-Prüfung (gebundene Eigenschaft + falscher Typ → TypAnanas, nicht „ist gebunden“);
  `stil(k, w)`: Schlüssel-Whitelist → Wert → Gebunden; `binde(e, fn)`: Eigenschaftsname vor Funktionsprüfung, auch bei `binde(e, karton)`
  (ungültiger Name → LaufzeitAnanas). `titel(n)` eines Reiters mit ungültigem `n` wirft KeinStückAnanas **ohne** Quellenregistrierung.
- **Werfende Erstauswertung** beim `binde`: die Bindung bleibt registriert (sauber, ohne Quellen – rechnet nie wieder, bis sie ersetzt oder
  gelöst wird); W0103 wird nach dem Ausdruck und **vor** der Setter-Prüfung des Ergebnisses ausgegeben (wirft der Ausdruck selbst → keine Warnung).
- **Bindungs-Ananas im Flush** (Lücke zu K-057): die bereits gepufferten `aendere`-Einträge (inkl. Werte vorher ausgewerteter Bindungen) und
  Animationen gehen **vor** dem Weiterwerfen hinaus – wie bei einer Rückruf-Ananas; an allen Synchronisationspunkten, auch `uiEnde` vor `schliesse`.
- **Nach der Zyklus-Ananas** („kommen nicht zur Ruhe“) gelten **alle** Bindungen als sauber; sie rechnen erst wieder, wenn sich eine Quelle
  ändert (dann ggf. erneute Ananas). Das Programm läuft weiter, `uiEnde` wirft nicht erneut. Zähler: höchstens 100 Durchläufe; innerhalb eines
  Durchlaufs werden Bindungen, die durch eine frühere Bindung desselben Durchlaufs schmutzig wurden und noch nicht an der Reihe waren, im selben
  Durchlauf ausgewertet (beide Laufzeiten gleich).
- **`setze()` ohne Argument** → `karton`. `Theke.setzeTitel` mit gleichem Titel sendet `fenster` erneut (die Theke ist keine Zutat, K-117 gilt
  für Zutaten-Eigenschaften); `Zettel.setze` auf einen Wert mit anderem Typ, aber gleicher Textform ist eine Änderung (`gleich`, nicht Textform).
- **Betroffen:** SPEC §16.8 (nachgetragen). **Status:** fest.

### Theke v6 – Wünsche aus dem Idle-Redesign (THEKE-ERWEITERUNGEN.md §12, „Knöpfe dürfen nie wandern“): K-120 … K-124

Fünf Wünsche des Idle-Agenten (statisches Raster 860 × 800, zwei Spalten, acht feste Reiter). Rückwärtskompatibilität war ausdrücklich
nicht nötig; alle Beispiele, Doku-Blöcke und Tests laufen umgestellt. Protokoll bleibt v1 (neuer Stil-Schlüssel, neues optionales Feld
`marke`); Interpreter und Wasm-Laufzeit senden bitgleiche `ui`-Nachrichten. Umgesetzt: Laufzeiten a732d3e, Renderer b6d4177, UI 03d6c1e.

### K-120 Theke v6: Stil `senkrecht` – Lage quer zur Reihe (Wunsch 1: „Reihe mit ausrichtung oben/strecken“) – anders gelöst
- **Problem:** Eine `Reihe` zentriert ungleich hohe Kinder senkrecht (`align-items: center`); zwei Spalten-Stapel verschiedener Höhe stehen
  dann nicht oben bündig, und ihre Inhalte wandern, wenn eine Spalte wächst.
- **Entscheidung:** **eigener Stil-Schlüssel `senkrecht`** mit `oben | mitte | unten | strecken` statt neuer Werte für `ausrichtung`.
  Begründung: `ausrichtung` ist an der Reihe die **Hauptachse** (`links|mitte|rechts` = waagrecht); dieselbe Taste für die Querachse wäre
  mehrdeutig (`mitte`), schlösse „rechts **und** oben“ aus, und die vorhandenen Renderer-Synonyme (`oben` = `start`) wirken an der Reihe
  waagrecht – sie wären stillschweigend falsch. `ausrichtung` bleibt unverändert `links|mitte|rechts`.
- **Wirkung (Renderer):** an einer `Reihe` die Lage **aller Kinder** quer zur Reihe (`align-items`; ohne Stil bleibt es `mitte`);
  an einer Zutat, die **direkt in einer Reihe** liegt, ihre **eigene** Lage (`align-self`, schlägt `ausrichtung`); sonst ohne Wirkung (wie
  `zeilen` an einer Eingabe). `strecken` = alle Kinder so hoch wie das höchste (gleich hohe Spalten). Die Reihe bricht weiter um
  (`flex-wrap`), jede Zeile für sich.
- **Laufzeit:** Whitelist endet auf `…, zeilen, mindestbreite, senkrecht` (Fehlertext `Stil 'x' gibt es nicht. Erlaubt: breite, hoehe,
  abstand, ausrichtung, schrift, farbe, zeilen, mindestbreite, senkrecht.`); Wert-Prüfung wie `ausrichtung` (Textform, sonst
  `LaufzeitAnanas: Wert 'links' ist für Stil 'senkrecht' nicht erlaubt. Erlaubt: oben, mitte, unten, strecken.`); `karton` entfernt
  (K-075); bindbar per `bindeStil("senkrecht", …)`.
- **Betroffen:** SPEC §16.2/§16.9, THEKE.md §2/§8, Referenz `std-theke`. **Status:** fest.

### K-121 Theke v6: Stil `zeilen` auch für den Abschnitt-Titel und jede Tabellenzelle (Wunsch 2) – umgesetzt (nur Renderer)
- `zeilen` war schon an jeder Zutat erlaubt (K-113: „andere Zutaten ignorieren ihn“); keine Laufzeit- und keine Protokolländerung.
- **Abschnitt:** der Titel ist **genau n Zeilen** hoch, längerer Text endet mit „…“ – auch klappbar (der Pfeil bleibt, geklemmt wird der
  Text daneben). Ein leerer Titel eines nicht klappbaren Abschnitts zeigt wie bisher keinen Kopf.
- **Tabelle:** **jede Zelle** (auch die Kopfzeile) ist genau n Zeilen hoch, Rest „…“; die Tabelle bekommt dabei **feste Spalten**
  (`table-layout: fixed`, die Spalten teilen sich die Breite gleichmäßig) – sonst würde ein längerer Text die Spalten verschieben. Zahlen-
  Spalten bleiben rechtsbündig. Namensgleichheit beachten: `stil("zeilen", n)` = Textzeilen **je Zelle**, `Tabelle.zeilen()` = Datenzeilen.
- **Betroffen:** SPEC §16.2/§16.9, Referenz `std-theke` (Stil-Tabelle). **Status:** fest.

### K-122 Theke v6: feste Innenbreite unabhängig vom Rollbalken (Wunsch 3) – umgesetzt (Renderer, gleiches CSS in Browser und EXE)
- **Vorher:** Innenbreite 820 px ohne / 805 px mit Rollbalken (Fenster 860) – erscheint der Rollbalken, bricht eine knapp passende Reihe um.
- **Jetzt:** Die Theke rollt senkrecht **immer** (`overflow-y: scroll`) mit einem gestalteten **8-px-Rollbalken** (Spur durchsichtig, ohne
  Überlauf unsichtbar, Daumen in Themenfarben hell/dunkel); der Inhalt hat links 20 px, rechts 12 px + 8 px Rinne. **Innenbreite =
  `breite − 40` px, mit und ohne Rollbalken** (860 → 820). Gemessen (`tests/theke/visuell.mjs`, echte Rollbalken): 440 → 400 mit und ohne.
  Gilt für Chromium/Edge (Playground), WebView2 (EXE Windows) und WebKitGTK (EXE Linux) – alle kennen `::-webkit-scrollbar`. Firefox:
  `scrollbar-gutter: stable` + schmaler Standard-Rollbalken (Innenbreite kann dort um wenige px abweichen).
- Waagrecht schneidet der Inhaltsbereich ab (`overflow-x: clip`): eine Animation am Rand (`puls`, `aufpoppen`) lässt keinen waagrechten
  Rollbalken aufblitzen. Behälter mit `stil("hoehe", …)` rollen unverändert (`overflow: auto`, keine reservierte Rinne).
- **Faustregel fürs Raster:** zwei Spalten der Breite b mit `abstand` a passen nebeneinander, wenn `2·b + a ≤ breite − 40` (860: 2 · 404 + 12).
- **Betroffen:** SPEC §16.9, THEKE.md §4/§8, `site/js/theke/README.md`. **Status:** fest.

### K-123 Playground-Vorschau: jeder Lauf übernimmt `breite`/`hoehe` (Wunsch 4) – umgesetzt (UI)
- **Vorher:** nur der erste Lauf einer Sitzung übernahm die Programmgröße, danach galt die gemerkte Größe – ein Programm mit 860 × 800
  erschien nach einem 480 × 360-Programm zu klein (und umgekehrt).
- **Jetzt:** **jeder Lauf** nimmt `breite`/`hoehe` des Programms (nie größer als der Viewport), einmal je Lauf beim ersten `fenster`.
  Hat der Nutzer das Fenster **in diesem Lauf** schon verschoben oder an der Ecke gezogen, bleibt seine Größe bis zum Laufende (ein
  erneutes `fenster` durch `setzeTitel` ändert nichts). Position: zentriert, bis der Nutzer das Fenster einmal verschiebt – danach öffnet
  es an der gemerkten Stelle (Sitzung, `sessionStorage`). App-Link (Vollbild) unverändert; die EXE übernimmt die Größe ohnehin.
- **Betroffen:** THEKE.md §4 (Browser), `ui/src/vorschau.js`, E2E `09-theke`. **Status:** fest.

### K-124 Theke v6: `marke` – Badge am Reiter-Tab, der nichts verschiebt (Wunsch 5: „feste Tab-Breite oder Badge“) – Badge umgesetzt
- **Entscheidung:** **Badge**, keine feste Tab-Breite. Acht Reiter mit Emoji-Titeln füllen 860 px schon fast (gemessen 793 px); gleich
  breite Tabs gewinnen nichts, und ein Zähler im Titel verschiebt die Nachbarn weiterhin. Die Marke liegt **über** der rechten oberen
  Tab-Ecke, absolut positioniert in einem Rand, den die Reiter-Leiste **immer** hat (7 px oben) – Tab und Nachbarn bewegen sich nie,
  egal ob, wie lang oder wann eine Marke erscheint (lang → „…“).
- **Sprache:** `zutat.marke(t)` → Zutat / `marke()` → Text an **jeder Zutat** (wie `hinweis`): der `Reiter` zeigt die Marke einer
  **Seite** an deren Tab – wie K-107 (die Seite steuert ihren Tab per `sichtbar`), ohne Seitennummer. Optionales Feld wie `hinweis`:
  `karton` → `""` (= keine Marke), sonst Textform; ohne Argument Getter (Quelle einer Bindung). **Bindbar** für jede Zutat:
  `Bindbar: …, sichtbar, hinweis, marke.`; Setter einer gebundenen Marke → `'marke' von Stapel(imp) ist gebunden – …`; `marke(t)` in einer
  Bindung → `Eine Bindung rechnet nur – 'marke' ist darin nicht erlaubt.` Außerhalb eines Reiters wird die Marke gesendet, aber nicht angezeigt.
- **Protokoll:** Feld `marke` (Text) im Knoten **nur wenn nicht leer**, in `aendere` der neue Wert; K-115/K-117 gelten (ganzer Knoten ohne
  `marke` = keine Marke; gleicher Wert sendet nichts). Wasm: Name `marke` = 206, Feld 16.
- **Renderer:** Tab = `span.theke-reiter-tab-text` + `span.theke-reiter-marke` (`aria-hidden`; der Tab bekommt `aria-label` „Titel (Marke)“);
  Farbe aus `farbe` des Reiters (Ton), hell/dunkel.
- **Betroffen:** SPEC §16.1/§16.3/§16.8/§16.9, THEKE.md §2/§3/§8, Referenz `std-theke`. **Status:** fest.
---

## Offene Umsetzungen (Aufträge für andere Agents)

| Nr. | Datei(en) | Was | Testfall |
|---|---|---|---|
| U-01 (gegenstandslos seit K-105) | `site/js/pizza.js` (Parser) | Fehlertext bei `f((A, B))` ergänzen: „Hinweis: Pizza-Literal im Aufruf braucht drei Klammern: f(((A, B)))“ – entfällt, es gibt kein Pizza-Literal mehr | a10 K-001 (Code bleibt P0001) |
| U-02 | `site/js/pizza.js` (`alsZahl`, `alsEingabeZahl`) | K-007: gemeinsame Grammatik `[+-]?Ziffern[_Ziffern]*((.|,)Ziffern[_Ziffern]*)?` nach trim; Hex/Exponent/`.5`/`5.`/`Infinity` → TypAnanas; Fehlertexte unverändert | a11 K-007 (3 Fälle) |
| U-03 | `site/js/pizza.js` (`Bestellannahme`) | K-008: `liesZahl(ersatz)`, `frageZahl(text, ersatz)`, auch benannt `ersatz:`; nur bei EOF; `onEingabe`-Anfrage unverändert | a11 K-008 (2 Fälle) |
| U-04 | `site/js/pizza.js` (`behandleEnde`, `run`) | K-014: Text interner Fehler exakt `Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.` (+ ` (Zeile N)`), Details in Feld `detail` | nicht automatisierbar (Code-Review) |
| U-05 | `site/js/pizza.js` (Parser) | K-015: P0012 für `abbrechen`/`weiter` außerhalb Schleife (bzw. `wähle`-Anweisung für `abbrechen`); Kontext-Reset an Methoden-/Konstruktor-/Lambda-/Ofen-Rümpfen; `parse()` meldet ihn | a11 K-015 (5 Fälle) |
| U-06 | `tests/faelle/`, `tests/run-tests.js` | Eigene Interpreter-Tests für U-02/U-03/U-05 | – |
| U-07 | `site/js/doku/*.js` | K-007 (Zahltext-Grammatik, Dezimalkomma), K-008 (`ersatz`), K-015 (P0012), K-003 (`(-2.5).runden()`), K-005 (NaN/Infinity), K-026 (Hawaii-Auslöser) dokumentieren; Spiele-Beispiele dürfen `frageZahl(text, ersatz)` nutzen | Doku-Harness |
| U-08 | `site/beispiele/spiele/*.pizza` (optional) | Workarounds „Text lesen + alsZahl“ durch `frageZahl(text, ersatz)` ersetzen, sobald U-03 da ist | Beispiel-Tests |
| U-09 ✅ | `EINGABE.md` | erledigt (Klärungs-Agent): Kopfhinweis „abgelöst durch SPEC §11.1“, K-007/K-008/K-011/K-012/K-013/K-041/K-042 nachgezogen | – |
| U-10 | `WASM.md` §1 Punkt 2 | K-004: „ungeboxt als i32“ → „als f64 bzw. i32/i64 mit Überlaufprüfung; beobachtbar wie ganzzahlige Doubles“ | Differenztests |
| U-11 | `HOST-ABI.md`, `laufzeit/`, `site/js/pizzaiolo*` (Compiler-Agent) | K-011 (prompt informativ, Modul gibt Prompt aus), K-013 (Retry-Protokoll statt Kürzung: Rückgabe = benötigte Länge, Host schreibt nichts, wenn `puffer_kap` zu klein), K-014 (`detail`-Feld, fester Text), K-012 (Banner → stdout-Pfad des Hosts) | tests/differenz |
| U-12 | `host/src/*.rs` (Native-Host-Agent) | K-011 (Prompt nicht ausgeben), K-013 (Zeile puffern, Retry), K-014 (fester Text + `detail`), K-012 (Banner → **stderr**, derzeit stdout), K-041 (Dreier-Form von `ausgabe` entfernen), K-043 (Ladefehler `code:"HOST"`, `art:"intern"`, Exit 2), K-046 (unbekannte Exit-Codes → interner Fehler), K-047/§14.11 (JSON-Zahlen wie `String(x)`) | ABI-Tests |
| U-13 | `bin/pizza.js` | K-054: `leeren` → `\x1b[2J\x1b[3J\x1b[H` bei TTY (K-012 ist in der CLI bereits erfüllt: Banner auf stderr) | manuell |
| U-22 | `ui/**`, `e2e/**` (UI-/E2E-Agent) | K-012: Crash-Overlay und Sofort-Terminate bei `panik` entfernen; Banner als Fehlerausgabe in der Konsole, Exit 39 normal; E2E-Erwartung „Overlay bei Exit 39“ anpassen (README und Doku enthalten keine Overlay-Beschreibung) | e2e |
| U-23 ✅ (da07b46) | `site/js/pizza.js`, `tests/faelle/` | Theke umgesetzt; SPEC §16 / K-056 … K-073 an die Interpreter-Auslegungen angeglichen | a13 (23 Fälle) |
| U-24 ✅ (c279044, d9c9090) | `site/js/theke/**` | Renderer entspricht §16.3 (`kinder`-Listen, Platzhalter, `ausrichtung` links/mitte/rechts + Synonyme); keine Abweichung offen | tests/theke |
| U-25 | `tests/run-tests.js` (Interpreter-Agent) | `.ereignisse` → `uiEreignisse`, `.ui-erwartet` kanonisch vergleichen (K-067); `ui` nicht in `.erwartet` | – |
| U-26 | `tests/differenz/` (Differenz-Agent) | `ui`-Ereignisse vergleichen (`nachricht` kanonisch), `uiEreignisse` aus `.ereignisse` | – |
| U-27 | `HOST-ABI.md`, `laufzeit/`, `site/js/pizzaiolo*` (Compiler-Agent) | `ui_senden`/`ui_warte` (Retry wie K-013), bis dahin `nichtUnterstuetzt` für Theke (K-072) | tests/differenz |
| U-28 | `host/**` (Native-Host-Agent) | Theke-Fenster (wry/tao), `ui_warte` blockierend, Fenster zu bei `schliesse`/Laufende/Panik → Prozessende mit Exit-Code (K-061), W0100-Variante ohne Theke (K-063, K-072) | Smoke-Test |
| U-30 | `site/beispiele/theke.json` (Beispiel-Agent) | Prüfstand B1: ids `tictactoe` und `belag-baukasten` sind doppelt (auch in spiele.json/simulationen.json) – ids müssen programmweit eindeutig sein (ARCHITEKTUR §3) | Prüfstand B1 |
| U-31 | `tests/run-tests.js` (Interpreter-Agent) | K-074: Doku-Codeblöcke `uiEreignisse`/`uiErwartet` auswerten; `.ereignisse`/`.ui-erwartet` wie Prüfstand (kanonisch) | Doku-Harness |
| U-32 | `site/js/pizza.js` (Interpreter-Agent) | K-075: `stil(schlüssel, karton)` entfernt den Stil, Nachricht trägt `null` für entfernte Schlüssel | a12-theke-offen.js |
| U-34 | `site/js/pizza.js` (Interpreter-Agent) | K-061: nach dem letzten Puffer-Flush `schliesse` senden, wenn das Fenster offen ist – bei normalem Ende, ungefangener Ananas und P0002 (nach dem `fehler`-Ereignis, vor `ende`); nicht nach `geschlossen`/`schliesse()`, nicht bei Panik, nicht ohne `zeige` | a12-theke-offen.js (5 Fälle) |
| U-35 | `site/beispiele/theke/*.ui-erwartet` (Beispiel-Agent) | K-061: nach U-34 neu erzeugen (abschließendes `schliesse`) | Prüfstand Beispiele |
| U-36 | `ui/**` (UI-Agent) | K-061: Vorschaufenster schließt bei `schliesse` und am Laufende (auch Panik) | e2e |
| U-33 | `site/js/pizza.js` (Interpreter-Agent) | K-076: `ersetze("", x)` lässt den Text unverändert (kein `split("")`); Fuzz-Repro grün machen | a11 K-076 |
| U-37 ✅ (ce303cb) | `site/js/pizza.js`, `tests/faelle/` | K-077 … K-080: Option `zufallsSaat`; `Zufall.saat/kommazahl/wahr/wähle/mische`, `neu Zufall(saat)`; Klasse `Vorratskammer` mit Option `vorrat`, Hook `onVorrat`, Ereignis `vorrat`, W0101, Serialisierung v1, Limit 1 MiB | a11 (10 Fälle) |
| U-38 | `bin/pizza.js` | K-077: `--saat=N`; ohne Option echte Saat + `Saat: N` auf stderr; K-081: Vorrat als JSON-Datei im Nutzer-Datenverzeichnis (wie Host) | manuell |
| U-39 | `ui/**`, `site/js/worker.js` (UI-Agent) | K-077: echte Saat je Lauf, Badge „Saat N“, Option „feste Saat 42“; K-081: Vorrat in localStorage `pizza.vorrat.<name>`, Dialog „Vorrat“, synchrone Worker-Brücke | e2e |
| U-40 | `HOST-ABI.md`, `laufzeit/`, `site/js/pizzaiolo*` (Compiler-Agent) | K-077: optionaler Export `saat_setzen(i32)` vor `start`; K-078: identische Algorithmen; K-081: optionale Imports `vorrat_lesen`/`vorrat_schreiben` (Retry wie K-013), ABI-kompatibel | tests/differenz |
| U-41 | `site/js/doku/*.js` (Doku-Agent) | Zufall-API (K-078), Saat/Reproduzierbarkeit (K-077), Vorratskammer (K-079 … K-081) | Doku-Harness |
| U-42 | `host/**` (Native-Host-Agent) | K-077: `--saat=N`/echte Saat + Anzeige; K-081: Datei `%APPDATA%pizzaorrat<name>.json` bzw. `$XDG_DATA_HOME/pizza/vorrat/<name>.json`, atomar; ohne Unterstützung W0101-Verhalten | Smoke-Test |
| U-43 | `tests/run-tests.js`, `tests/differenz/` | K-077/080: `zufallsSaat` und `<name>.vorrat.json` durchreichen, `vorrat`-Ereignisse kanonisch vergleichen (Prüfstand bereits umgesetzt) | – |
| U-44 | `site/beispiele/` (Beispiel-Agent) | Idle-Game mit `Vorratskammer` und `.vorrat.json`; Spiele mit echter Saat prüfen (Tests bleiben bei 42) | Prüfstand Beispiele |
| U-45 | `ui/**`, `bin/pizza.js`, `host/**` | K-083: einheitliche Anzeigeform von Warnungen/Fehlern `<text> (Zeile Z, Spalte S)`; `detail` nie anzeigen (nur `--debug`) | e2e / manuell |
| U-46 | `ui/**` | K-083: Saat-Infozeile `Saat: N` in der Konsole statt Badge; Option „feste Saat 42“ | e2e |
| U-47 ✅ | Klärungs-Agent | K-083: Nutzerentscheidungen 1–6 in THEKE.md §4, EINGABE.md §3, ARCHITEKTUR §2, SPEC §2/§12/§15.3/§15.4/§16.2 eingearbeitet | – |
| U-53 | `ui/**` (UI-Agent) | K-083: Feld „Argumente“ (→ `optionen.args`), P0003/Wand-Zeitlimit entfernen (nur „Abbrechen“), Theke-Thema folgt dem Seiten-Thema (Standard OS), Befehl „Vorrat löschen“ (K-088: Beispiel-Tabs → `pizza.vorrat-beispiel.<name>`, eigene Tabs → `pizza.vorrat.<name>`), „Eingaben vorab“-Fallback entfernen → klare Fehlermeldung ohne Isolation | e2e |
| U-54 | `host/**`, `ziele.json`, `host/baue-ziele.sh`, Dockerfile-Stage exe (Host-/Infra-Agent) | K-083/1: nur Fenster-Varianten (Windows x64 via cargo-xwin/MSVC, Linux x64 bookworm/WebKitGTK 4.1), statische/arm64-Varianten ohne Fenster entfernen; fehlende WebView → klare Fehlermeldung; `--vorrat-loeschen <name>` und `--vorrat-loeschen-alle` mit den CLI-Texten (K-088); OS-Thema | Smoke |
| U-55 | `site/js/doku/30-referenz.js` (Doku-Agent), `e2e/**` (E2E-Agent) | Zeitlimit-Texte entfernen (P0003), Argumente-Feld, „Vorrat löschen“ dokumentieren; E2E-Zeitlimit-Test entfernen | – |
| U-48 ✅ (4b7a2af) | `site/js/pizza.js`, `tests/faelle/` | K-084 `Takt`; K-085 `tausender`/`kompakt`/`euro(kompakt:)`; K-086 `Fortschritt`/`Abschnitt`/`Tabelle`/`Reiter`/`hinweis`/`schrift: riesig`; K-087 Schrittlimit je Rückruf, `Uhr.echt()` + Option `echtzeit` | a12 (8 Fälle), a11 (2 Fälle) |
| U-49 | `laufzeit/`, `site/js/pizzaiolo*`, `HOST-ABI.md` (Compiler-Agent) | dieselben Klassen/Methoden; Import `echtzeit_ms() -> f64`; Schrittlimit je Rückruf | tests/differenz |
| U-50 ✅ | `ui/src/ausfuehrung.js`, `host/**` (UI-/Host-Agent) | K-084: aufeinanderfolgende `takt`-Ereignisse derselben id zusammenfassen (Summe `anzahl`); K-087: `echtzeit_ms` im Host | e2e / Smoke |
| U-51 | `site/js/doku/*.js` (Doku-Agent) | Theke v2 (Takt, Zutaten, hinweis), Zahlformat, `Uhr.echt()`, Schrittlimit je Rückruf | Doku-Harness |
| U-52 | `site/beispiele/idle/` (Idle-Agent) | nach U-48: Takt statt „Minute warten“, `.ereignisse`/`.ui-erwartet` neu erzeugen, eigene `Format`-Klasse durch `kompakt()` ersetzen | Prüfstand Beispiele |
| U-29 | `site/js/doku/*.js`, `site/beispiele/theke*` (Doku-/Beispiel-Agent) | Abschnitt „Theke“ mit Rückruf-Signaturen (K-056), Bündelung (K-057), IDs (K-060), W0100 (K-070); Beispiele mit `.ereignisse`/`.ui-erwartet` | Prüfstand Beispiele |
| U-56 ✅ (aed3450) | `site/js/pizza.js`, `tests/faelle/` (Interpreter-Agent) | K-090/091: `animiere`, `Theke.schwebe`, `uebergang`; Puffer `animationen` (Reihenfolge, max. 32) an den K-057-Synchronisationspunkten, Verwerfen bei `zeige`, W0102 je Aufrufstelle, Fehlertexte; entspricht auch K-093/K-094 | a13 (11 Fälle) |
| U-57 ✅ | `site/js/pizzaiolo/`, `laufzeit/` (Compiler-Agent) | dasselbe in der Wasm-Laufzeit (K-090 … K-091, K-093, K-094), byte-gleiche `ui`-Nachrichten; HOST-ABI unverändert (`ui_senden`); setzt Theke im Compiler voraus (U-27/U-49) | tests/differenz |
| U-58 ✅ (c2b1bd3, bbf5092; Nachträge Klärungs-Agent) | `site/js/theke/**`, `tests/theke/` (Renderer-Agent) | K-090 … K-093: `aendere.animationen`, `uebergang` (auch `reiter`), Animations-Registry (`leer`-Hook), Schwebetext-Stapel je Anker, `prefers-reduced-motion`, Thema; Host nur neu bauen (eingebettete Engine) | tests/theke + visuell |
| U-59 | `site/js/doku/*.js`, `site/beispiele/idle/` (Doku-/Idle-Agent) | nach U-56: Abschnitt „Animationen“ (Doku-Teil erledigt (4827f14); Idle-Teil offen); Pizza-Imperium mit `huepfen`/`schwebe`/`funkeln`/`aufpoppen`/`puls`, `.ui-erwartet` neu erzeugen | Doku-Harness, Prüfstand Beispiele |
| U-60 ✅ | `site/js/doku/30-referenz.js` (Doku-Agent; Datei ist gerade in Bearbeitung) | K-095: Tabellenzeile `hole(k)` → `hole(k[, ersatz])` („fehlt er → `ersatz`, sonst `karton`“), Beispiel `karte.hole("Tonno", 0)`; Idiom `k.lege(s, k.hole(s, 0) + 1)` erwähnen; Pizza-Imperium darf `hat()`-Umweg durch `hole(k, 0)` ersetzen (Idle-Agent, U-59) | Doku-Harness |
| U-61 ✅ | `host/**`, THEKE.md, SPEC, HOST-ABI (Host-Agent) | K-096: Theke-Programm ohne Fenster (keine Anzeige, WebView2 fehlt, WebView scheitert) → Meldung + Exit 2 statt W0100; Ausnahmen JSON-Modus/`--ui-ereignisse`/`PIZZA_THEKE=0` | cargo test (`theke_ohne_fenster_bricht_ab` u. a.), test-exe-js |
| U-62 ✅ | `site/js/doku/30-referenz.js` (Doku-Agent) | K-096: Abschnitt „Wo erscheint das Fenster?“ und W0100-Tabelle: W0100 nur noch Tests/Doku/`node bin/pizza.js`; EXE/`pizza-host` ohne Fenster (SSH, WebView2 fehlt) → Meldung + Exit 2 | Doku-Harness |
| U-14 | `tests/differenz/vergleich.js` | K-014: Feld `detail` beim Vergleich ignorieren | – |
| U-15 | `tests/differenz/korpus/` | K-015: `kontrolle-ausserhalb-schleife.pizza` auf P0012 (Exit 2) umstellen; K-040: Korpusfall Textordnung U+1F355 vs. U+FF5E | tests/differenz |
| U-16 | `site/js/pizza.js` (`liesZeile`) | K-042: EOF endgültig (Flag setzen; `null`-Eintrag in `eingabe` = EOF ab dort) | a11 K-042 |
| U-17 | `ui/src/ausfuehrung.js`, `site/js/worker.js` (UI-Agent) | K-044 (neu): Wand-Zeitlimit **entfernen** (kein P0003, nur „Abbrechen“); Worker-Fehler → `art:"intern"`, Code `WASM`/`INTERN` | e2e |
| U-18 | `site/js/pizza.js` (`Uhr.vorspulen`, `warte`) | K-047: `vorspulen` rundet auf ganze ms; Lieferbudget `floor(max_ms × Faktor)`; `zeitMs` ganzzahlig | a11 K-047 |
| U-19 ✅ | `pruefstand/run.js`, `pruefstand/teil-b.js` | erledigt (Klärungs-Agent): Doku-`eingabe`, Manifestfeld `eingabe` + `.eingabe`-Fallback, B1 prüft `interaktiv`/verwaiste `.eingabe`, nur ein Schluss-Umbruch, Banner beidseitig entfernt; `*-offen.js`-Fälle zählen nicht als Fehlschlag und melden grüne Fälle als „nach a10 verschieben“ | Prüfstand selbst |
| U-20 ✅ | `ARCHITEKTUR.md` §6 | erledigt (Klärungs-Agent): Testfall-Dateiformate dokumentiert | – |
| U-21 | `site/js/pizza.js` (`globalerName`, `aufrufZiel`) | K-038: `auto` nur als `schneide`-Argument; sonst `LaufzeitAnanas: 'auto' ist nicht definiert.` | a11 K-038 |
| U-63 ✅ (72cb857, f29baa7, 8f922fd) | `site/js/pizza.js`, `tests/faelle/kueche-*`, `tests/run-tests.js` (Interpreter-Agent, THREADS P1) | K-097 … K-099: `brigade`, `KüchenAnanas` (am Ende von `ANANAS_BAUM`), Einfrieren + Wachen, Kartonkopie, Zusammenführen D1–D15, Optionen `koeche` (ignoriert) und `kuechenChaos`; Abnahme durch den Klärungs-Agenten: Lücken in K-101 festgeschrieben, `a14-kueche-offen.js` → `a14-kueche.js` | a14 (alle Fälle grün) |
| U-64 ✅ (37c88f2) | `site/js/pizzaiolo/frontend.js` (Compiler-Agent, P1b) | K-100: `brigade`/`KüchenAnanas` → `nichtUnterstuetzt` (Auto fällt auf den Interpreter zurück) | tests/wasm |
| U-65 | `site/js/doku/20-pizzafunktionen.js`, `site/beispiele/pizzafunktionen/kuechenbrigade.pizza` (Doku-/Beispiel-Agent, P1c) | SPEC §17 erklären (Teilsummen, Uhr `belege` vs. `brigade`, gefangene KüchenAnanas); Doku-Blöcke laufen im Prüfstand | Prüfstand Doku/Beispiele |
| U-66 ✅ (70f05a8 ff.) | `laufzeit/**`, `site/js/pizzaiolo/**`, `IR.md`, `HOST-ABI.md` (Compiler-Agent, P2) | K-098 … K-101: `rt_brigade`, `frozen_top`-Wachen, Küchenbericht/PKF, Inline-Pfad (Import `kueche_auftrag` → `-1`), Klassenindex 18 + n; HOST-ABI-Entwurf `kueche` endgültig machen – Umsetzungsentscheidungen in K-104 | tests/differenz `kueche-*`, tests/wasm (Klon-Host) |
| U-67 ✅ | `site/js/pizzaiolo/host-js.js`, `pizzaiolo.js`, `koch.js` (Compiler-Agent, P3) | K-100: `kuechenPool`, Klon-Instanzen, SAB-Protokoll, Option `koeche`, `kuechenChaos` | Differenz `wasm` vs. `wasm-koeche4` |
| U-68 ✅ | `host/**` (Native-Host-Agent, P4) | K-100: Gruppe `kueche`, `--koeche=N`, `--info` `Köche: N`, Koch-Stapel wie Hauptthread | Differenz `host-koeche4`, CI-Smoke |
| U-69 ✅ | `site/js/worker.js`, `ui/**` (UI-Agent, P5; Entscheidungen K-104 Punkt 13) | K-100: Pool vor dem Lauf, Popover „Köche: auto \| 1 \| 2 \| 4 \| 8“, Statusleiste `Köche: N`, Abbrechen beendet alle Köche | e2e |
| U-70 ✅ | `tests/differenz/**`, `tests/fuzz/**`, `e2e/**`, `pruefstand/run.js` (Harnisch-Agents, P6) | K-099/K-100: Köche-Varianten, Chaos-Planung, Fuzz-Produktionen `brigade`, Feld `koeche` ignorieren; Prüfstand optional Feld `koeche` durchreichen – erledigt, Entscheidungen K-104 Punkt 14 | tests/fuzz, tests/differenz, e2e |
| U-71 ✅ | `site/beispiele/idle/erste-pizzeria.ui-erwartet` (Idle-Agent) | erledigt: Beispiel auf `Zettel`/`binde` umgestellt (Kasse, Pizzen pro Klick, Teigschaber als Zettel; Texte und `kaufen:aktiv` gebunden; Rückrufe setzen nur Zettel, kein `zeige()` mehr); `.ui-erwartet` aus echtem Lauf neu erzeugt (18/18 Nachrichten, `fenster`/`baum` gleich, in `aendere` entfallen nur Einträge mit unverändertem Wert), `.erwartet`/`.ereignisse` unverändert | Prüfstand Beispiele, E2E „Alle Beispiele“ |

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
streichen) · 20:stuecke-ownership (heute `pf-schieb`; Besitz-/Stück-Teil mit K-105 entfallen) · 20:pf-ofen („über 485“, positional) ·
20:pf-schneiden (`auto` K-038, `/ 0` RechenAnanas, n > Länge) · 20:pizza-literale (Abschnitt mit K-105 entfernt) · 30:ref-codes (W0003 pro
Methode, W0666 pro Programm) · 30:ref-playground (Zeitlimit-Text an UI angleichen, K-044) · 10:kontrollfluss (Bereich rückwärts, K-021).

## Hinweise an den Koordinator
- Theke v6 (Wünsche des Idle-Redesigns, THEKE-ERWEITERUNGEN §12): K-120 … K-124 festgehalten, SPEC §16.9; umgesetzt in Interpreter + Wasm
  (a732d3e – `senkrecht`, `marke`; bitgleich), Renderer (b6d4177 – `senkrecht`, `zeilen` an Abschnitt/Tabelle, feste Innenbreite `breite − 40`,
  Marke über dem Tab), UI (03d6c1e – Vorschau nimmt die Programmgröße je Lauf), Host neu gebaut (Renderer eingebettet). Protokollsichtbar:
  Erlaubt-Text der Stile endet auf `…, senkrecht`, Bindbar-Liste auf `…, hinweis, marke` (Fälle/Prüfstand angepasst; neu a16-theke-v6).
  Merge-Hinweis Multithreading-Branch: `laufzeit/src/namen.rs` hängt `marke` als 206 an (NAMEN 207).
- Theke v5 (Nutzerwunsch „event-driven UI, kein Repaint je Frame“): K-116 … K-119 festgehalten, SPEC §16.8, THEKE.md §2/§8; umgesetzt
  und bitgleich in Interpreter (a07c1f1, ce98d85), Wasm-Laufzeit (75b2b0e, 67c446f, 1b431e7 – Art 24, Namen 203–205), Doku/Beispiele (6feefdc);
  Renderer und Host unverändert. `test:differenz` 1040 Fälle ohne Abweichung, Host 55/55. **K-117 ist protokollsichtbar** (identische Setzvorgänge
  senden nichts mehr): alle `.ui-erwartet` der Theke-Beispiele neu erzeugt; offen nur `idle/erste-pizzeria` (U-71, rot bis zur Neuerzeugung).
  Messung `node bench/theke-zettel.js --alt tmp/pizza-alt.js` (600 Takte): `aendere`-Einträge −77 %, Felder −86 %, Schritte −48 %.
- Theke v4 (Wünsche W1–W7 des Idle-Agenten): K-107 … K-113 festgehalten, SPEC §16.7, THEKE.md §8; umgesetzt und abgenommen in Interpreter
  (6cfa564), Wasm-Laufzeit (793acac, fdlibm-Port für `Mathe.log/log10/log2/exp`), Renderer (07fd5b3) und Doku-Referenz (845611c … 7724990);
  `test:differenz` 1006 Fälle ohne Abweichung, Host nur neu gebaut. Das Idle-Spiel darf jetzt selbst umstellen (Reiter `setzeTitel`/`sichtbar`,
  klappbare Abschnitte, `Auswahl` für die Kaufmenge, `Tastatur` in den Minispielen, `Mathe.log` für Max-Kauf, `stil("zeilen", n)`).
  Merge-Hinweis Multithreading-Branch: `laufzeit/src/namen.rs` hängt 12 Namen 190–201 an (`Auswahl`, `Tastatur`, `optionen`, `setzeOptionen`,
  `klappbar`, `zu`, `beiTaste`, `log`, `log10`, `log2`, `exp`, `E`) – der Branch endet nach `farbe` (188) mit `brigade`, `KüchenAnanas`
  und kennt `namensraum` (189) nicht: beide Enden anhängen, Konstanten neu nummerieren, `laufzeit.wasm` neu bauen (`ANANAS_BAUM` bleibt).
- Küchenbrigade (THREADS.md, Nutzerentscheidungen F1–F10 wie empfohlen): K-097 … K-100, SPEC §17 (THREADS §2/§3 damit
  abgelöst; THREADS bleibt Plan für §4–§6); HOST-ABI-Gruppe `kueche` als Entwurf; Aufträge U-63 … U-70 (U-63 erledigt in
  72cb857 ff., U-64 in 37c88f2). P1 abgenommen: `a14-kueche.js` (62 Fälle, nach dem master-Merge +1 für Theke v3 in S4) grün; die vier Vertragslücken des Interpreter-Agenten
  sind in K-101 wie umgesetzt entschieden (Rohling/Pizza-Sicht kartonfähig, Stück-P0002 = Arbeit der Stücke 1 … k, `neu Zutat()`
  → RohlingAnanas, Wachen-Reihenfolge Operanden → Ziel → Wache → eigene Prüfungen) – P2 (U-66) muss sie nachbauen.
- K-095 (Befund Pizza-Imperium): `Speisekarte.hole(k[, ersatz])` wie `Vorratskammer.hole` – Interpreter und Wasm-Laufzeit umgesetzt
  (Klärungs-Agent), Host unverändert (Laufzeit steckt im `.pkarton`); Doku-Tabelle nachgetragen (U-60 ✅).
- Theke (THEKE.md): als SPEC §16 übernommen, K-056 … K-075 festgehalten (K-061 per Nutzerentscheidung: `schliesse` am Programmende, offen bis U-34) und an die Interpreter-Auslegungen (da07b46) und den Renderer (c279044, d9c9090) angeglichen; `a13-theke.js` grün; offen nur noch K-061 (`a12-theke-offen.js`, Interpreter-Umsetzung U-34 läuft). Der Prüfstand unterstützt `uiEreignisse`, `ui`, `.ereignisse`, `.ui-erwartet` und Doku-`uiEreignisse`/`uiErwartet`.
- Theke v3 Animationen (Nutzerwunsch): K-090 … K-092 festgehalten, SPEC §16.6, THEKE.md §8; Interpreter umgesetzt (U-56, aed3450),
  Fälle in a13 (a12 leer); Lücken aus der Umsetzung als K-093 (`animiere()`/`schwebe()` ohne Argument) und K-094 (alle Parameter
  auch benannt) festgehalten – Interpreter entspricht, kein neuer Auftrag. Renderer umgesetzt (U-58, c2b1bd3, bbf5092); Rückfragen des
  Renderer-Agenten entschieden: Schwebetexte am selben Anker stapeln sich senkrecht (kleinster freier Platz, 20 px je Zeile), Sichtbar-
  halten festgehalten, `reiter` ist Behälter für `uebergang`, leerer Schwebetext erzeugt kein Element, kein Fenstermitte-Ersatz für
  versteckte `bei`-Zutaten (K-091 … K-093 ergänzt). Offen: U-57 (Wasm; pizzaiolo-Fallback auf den Interpreter, abaf357), U-59 (Doku/Idle).
- K-088: Vorrat-Namensräume (Beispiel-Tabs vs. eigene Tabs), CLI `--vorrat-loeschen <name>`/`--vorrat-loeschen-alle`, Doku-Block-Felder `zufallsSaat`/`vorrat`/`vorratErwartet`/`echtzeit` (Prüfstand umgesetzt).
- Zufall/Vorratskammer (Nutzerwünsche „RNG“, „State“): K-077 … K-081 festgehalten, SPEC §15.4 und §11; Interpreter ce303cb entspricht (10 Fälle in a10 grün); offen: CLI/UI/Host/Compiler (U-38 … U-44).
- Theke v2 (Takt zuerst, Nutzerentscheidung): K-084 … K-087 aus THEKE-ERWEITERUNGEN.md übernommen, SPEC §16.5; 8 offene Fälle in a12, 2 in a11 (Zahlformat); Aufträge U-48 … U-52.
- Interpreter-Commit 0d34810 setzt U-01…06, 13, 16, 18, 21 um; die 13 a11-Fälle wurden nach a10 verschoben, a11 ist leer (Konvention bleibt).
- Von den im Auftrag genannten Beispielen waren Pizza-Literal, W0032, Panik-Banner, Schrittzählung, Zahlformatierung,
  Blech-Mutation und `karton` je Typ bereits in SPEC §14 (Interpreter-Agent) geklärt; dieses Protokoll bestätigt und
  ergänzt sie (K-001, K-002, K-005, K-010, K-017, K-030) und fügt die neuen Punkte aus EINGABE/HOST-ABI hinzu.
