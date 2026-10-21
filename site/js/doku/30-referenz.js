/* pizza v3.0 – Doku: Standardbibliothek (500–599) & Referenz/Toolchain (600–699) – Doku v2 */
(function () {
  "use strict";
  const ziel = typeof self !== "undefined" ? self : globalThis;
  const z = (...zeilen) => zeilen.join("\n");
  const STD = "Standardbibliothek";
  const REF = "Referenz";
  const tab = (zeilen, kopf) => ({ art: "tabelle", kopf: kopf || ["Methode", "Was sie tut", "Beispiel"], zeilen });

  (ziel.PIZZA_DOKU = ziel.PIZZA_DOKU || []).push(
    // ------------------------------------------------------------------
    // Standardbibliothek
    // ------------------------------------------------------------------
    {
      id: "std-bote",
      gruppe: STD,
      ordnung: 500,
      titel: "Bote – Ausgabe",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Der `Bote` bringt deine Werte an den Tisch – also in die Konsole. Er ist immer da, du musst nichts importieren." },
        { art: "bild", src: "img/doku/re-bote.svg", alt: "Zwei Lieferwege: Bote.sage bringt normale Ausgabe in die Konsole, Bote.fehler bringt rote Fehlerausgabe.", unterschrift: "Zwei Lieferwege: `sage` für normale Ausgabe, `fehler` für die rote Fehlerspur." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "Bote.sage((\"Bestellung Nr. \" + 42));",
            "Pizza p = ((Tomate, Mozzarella));",
            "Bote.sage((p));",
            "Bote.sage(([1, 2, 3]));",
            "Bote.fehler((\"Kein Basilikum mehr!\"));"
          )
        },
        { art: "ausgabe", text: z("Bestellung Nr. 42", "((Tomate, Mozzarella))", "[1, 2, 3]", "Kein Basilikum mehr!") },
        {
          art: "details",
          titel: "Alle Methoden des Boten",
          inhalt: [
            tab([
              ["`sage(x)`", "Gibt `x` als Text aus, danach kommt ein Zeilenumbruch. `Bote.sage()` ohne Argument gibt eine leere Zeile aus.", "`Bote.sage((\"Ciao!\"));`"],
              ["`schreibe(x)`", "Wie `sage`, aber **ohne** Zeilenumbruch – für Fragen an den Gast und Spielfelder.", "`Bote.schreibe((\"Tisch? \"));`"],
              ["`fehler(x)`", "Wie `sage`, aber auf die Fehlerausgabe (in der Konsole rot). Der Exit-Code bleibt gleich.", "`Bote.fehler((\"Kein Basilikum mehr!\"));`"],
              ["`leeren()`", "Wischt die Konsole sauber (im Terminal: Bildschirm löschen).", "`Bote.leeren();`"]
            ]),
            { art: "text", md: "Mehrere Argumente werden mit Leerzeichen verbunden: `Bote.sage(\"Tisch\", 4)` gibt `Tisch 4` aus. Wie man den Gast etwas **fragt**, steht unter *Ein- und Ausgabe: Bestellannahme*." },
            { art: "hinweis", ton: "info", md: "Die doppelten Klammern in `Bote.sage((x));` haben keine Bedeutung – sie sind nur stilistisch erwünscht." }
          ]
        },
        {
          art: "details",
          titel: "Wie Werte als Text aussehen",
          inhalt: [
            { art: "text", md: "So erscheinen Werte bei `Bote.sage`, bei `+` mit einem Text und bei `alsText()`:" },
            {
              art: "tabelle",
              kopf: ["Wert", "Text"],
              zeilen: [
                ["Ganzzahl / Kommazahl", "wie gewohnt: `8`, `7.5`, `0.1`; sehr groß/klein mit Exponent: `1e+21`; dazu `NaN`, `Infinity`"],
                ["`ja` / `nein`", "`ja` / `nein`"],
                ["`karton`", "`karton`"],
                ["Text", "roh, ohne Anführungszeichen"],
                ["Blech", "`[1, 2, 3]` – Texte darin ohne Anführungszeichen"],
                ["Speisekarte", "`{a: 1, b: 2}`"],
                ["Pizza", "`((Tomate, Mozzarella))`, leer: `(())`"],
                ["Belag", "sein Name, z. B. `Salami`"],
                ["Dauer", "`1min 30s`, `90ms`, `2h`, `3d 4h`; größte Einheit zuerst, Nullteile fallen weg; `0ms`; negativ mit `-`"],
                ["Objekt", "Ergebnis von `alsText()`, sonst `Klassenname@N` (N = laufende Nummer ab 1)"],
                ["Ananas", "`Typ: Nachricht`"],
                ["Funktion", "`<Funktion>`"]
              ]
            },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "klasse Gast { }",
                "Bote.sage((neu Gast()));",
                "Bote.sage((\"Blech: \" + [\"a\", \"b\"]));",
                "Bote.sage((90s + 250ms));",
                "Bote.sage((0.1 + 0.2));"
              )
            },
            { art: "ausgabe", text: z("Gast@1", "Blech: [a, b]", "1min 30s 250ms", "0.30000000000000004") },
            { art: "hinweis", ton: "pizza", md: "`0.30000000000000004` ist kein Rechenfehler von pizza, sondern ganz normales Kommazahl-Krümeln. Für Geld gibt es `euro()`." }
          ]
        }
      ]
    },
    {
      id: "std-eingabe",
      gruppe: STD,
      ordnung: 505,
      titel: "Ein- und Ausgabe: Bestellannahme",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Mit der `Bestellannahme` fragt dein Programm den Gast etwas und wartet auf seine Antwort – eine Zeile pro Bestellung. Der `Bote` bringt Frage und Antwort an den Tisch. So entstehen interaktive Programme und Spiele." },
        { art: "bild", src: "img/doku/re-bestellannahme.svg", alt: "Bestelltresen: Der Gast tippt 3 und Enter. Die Bestellannahme macht daraus einen Bon (lies oder liesZahl) und reicht ihn an dein Programm weiter. Auf dem Rückweg bringt der Bote mit schreibe die Frage und mit sage die Antwort. Geht der Gast (Strg+D), kommt ein leerer Karton an.", unterschrift: "Der Gast tippt, die Bestellannahme reicht eine Zeile weiter, der Bote antwortet. Ist der Gast weg, kommt `karton`." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          eingabe: ["Luigi", "3"],
          code: z(
            "margherita name = Bestellannahme.frage(\"Wie heißt du? \");",
            "falls (name == karton) {",
            "    Bote.sage((\"Schade – der Gast ist schon weg.\"));",
            "} sonst {",
            "    funghi stücke = Bestellannahme.frageZahl(\"Wie viele Stücke? \", 1);",
            "    Bote.sage((\"Ciao \" + name + \", \" + stücke + \" Stück kommen!\"));",
            "}"
          )
        },
        { art: "ausgabe", text: "Wie heißt du? Wie viele Stücke? Ciao Luigi, 3 Stück kommen!" },
        { art: "text", md: "Hier hat der Gast `Luigi` und `3` getippt. Das Programm wiederholt die Eingaben nicht – in der Konsole siehst du sie trotzdem, weil die Konsole mitschreibt. Im Playground erscheint unter der Konsole ein Eingabefeld, sobald das Programm fragt." },
        {
          art: "details",
          titel: "Alle Methoden der Bestellannahme",
          inhalt: [
            tab([
              ["`lies()`", "Nächste Zeile als Text, genau so, wie getippt (nichts wird abgeschnitten). Ist der Gast weg: `karton`.", "`margherita z = Bestellannahme.lies();`"],
              ["`frage(text)`", "Schreibt `text` (ohne Zeilenumbruch) und liest dann eine Zeile – wie `Bote.schreibe(text)` + `lies()`.", "`Bestellannahme.frage(\"Name? \")`"],
              ["`liesZahl()` / `liesZahl(ersatz)`", "Nächste Zeile als Zahl. Keine Zahl → `TypAnanas` (die Zeile ist dann verbraucht). Gast weg → `karton` bzw. `ersatz`.", "`Bestellannahme.liesZahl(0)`"],
              ["`frageZahl(text)` / `frageZahl(text, ersatz)`", "Wie `frage`, aber als Zahl – mit denselben Regeln wie `liesZahl`.", "`Bestellannahme.frageZahl(\"Tisch? \", ersatz: 1)`"],
              ["`hatMehr()`", "Kommt noch eine Zeile? Bei vorgegebener Eingabe `nein`, sobald alles gelesen ist. Im Playground, wo der Gast live tippt, immer `ja` – bis er die Eingabe beendet.", "`solange (Bestellannahme.hatMehr()) { … }`"]
            ]),
            { art: "text", md: "Zur Ausgabe gehören `Bote.schreibe(x)` (ohne Zeilenumbruch), `Bote.sage(x)` (mit Zeilenumbruch) und `Bote.leeren()` (Konsole wischen):" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Bote.schreibe((\"Ofen heizt\"));",
                "für (salami i : [1 .. 3]) { Bote.schreibe((\".\")); }",
                "Bote.sage((\" fertig!\"));"
              )
            },
            { art: "ausgabe", text: "Ofen heizt... fertig!" }
          ]
        },
        {
          art: "details",
          titel: "Wenn der Gast geht: karton und der Ersatzwert",
          inhalt: [
            { art: "text", md: "Das Ende der Eingabe heißt **EOF** (*end of file*). Im Playground beendest du die Eingabe mit **Strg+D** oder dem Knopf **Ende** neben dem Eingabefeld, im Terminal mit Strg+D (Windows: Strg+Z, dann Enter). Ab dann liefert jeder Leseversuch `karton`, und `hatMehr()` sagt `nein` – für immer, auch beim nächsten Aufruf." },
            { art: "hinweis", ton: "warnung", md: "`karton` passt nicht in `salami` oder `funghi`. `salami n = Bestellannahme.liesZahl();` endet am Eingabeende also mit einer `TypAnanas`. Prüfe vorher auf `karton` – oder gib einen **Ersatzwert** mit." },
            { art: "text", md: "Der Ersatzwert (`liesZahl(ersatz)`, `frageZahl(text, ersatz)`, auch benannt `ersatz: …`) wird **nur** am Eingabeende zurückgegeben. Tippt der Gast Unsinn, gibt es trotzdem eine `TypAnanas`. Hier ist die Eingabe schon zu Ende:" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "salami tisch = Bestellannahme.frageZahl(\"Tisch? \", ersatz: 1);",
                "Bote.sage((\"→ Tisch \" + tisch));"
              )
            },
            { art: "ausgabe", text: "Tisch? → Tisch 1" },
            { art: "text", md: "Eine Rechnung, die Zahlen liest, bis nichts mehr kommt:" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              eingabe: ["8", "9,5", "1.5"],
              code: z(
                "funghi summe = 0;",
                "solange (Bestellannahme.hatMehr()) {",
                "    summe += Bestellannahme.liesZahl(ersatz: 0);",
                "}",
                "Bote.sage((\"Rechnung: \" + summe.euro()));"
              )
            },
            { art: "ausgabe", text: "Rechnung: 19,00 €" },
            { art: "hinweis", ton: "pizza", md: "Spiele **müssen** `karton` als „Der Gast ist gegangen“ behandeln und sauber enden. Wer einfach weiterfragt, redet mit einem leeren Tisch." }
          ]
        },
        {
          art: "details",
          titel: "Welche Texte sind Zahlen?",
          inhalt: [
            { art: "text", md: "`liesZahl`, `frageZahl` und `Text.alsZahl()` verstehen dieselben Zahlen. Leerraum am Anfang und Ende wird ignoriert, dann gilt:\n\n- optional `+` oder `-` vorne,\n- Ziffern, gern mit `_` gruppiert (`1_000`),\n- optional Nachkommastellen mit **Punkt oder Komma**: `2.5` und `2,5` sind gleich.\n\nNicht erlaubt: Hex (`0x1A`), Exponent (`1e3`), `.5` oder `5.` ohne Ziffer auf beiden Seiten, `Infinity`, `NaN`. Das gibt eine `TypAnanas` mit der Meldung `'<eingabe>' ist keine Zahl.`" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              eingabe: [" 1_000 ", "2,5", "1e3"],
              code: z(
                "für (salami runde : [1 .. 3]) {",
                "    probier {",
                "        Bote.sage((Bestellannahme.liesZahl()));",
                "    } verbrannt (TypAnanas a) {",
                "        Bote.sage((a.nachricht()));",
                "    }",
                "}"
              )
            },
            { art: "ausgabe", text: z("1000", "2.5", "'1e3' ist keine Zahl.") }
          ]
        },
        { art: "hinweis", ton: "info", md: "Fertige interaktive Spiele findest du unter **Beispiele → Spiele**: Zahlenraten, Tic-Tac-Toe gegen Diavolo, Siebzehn und Pizza, Pizzen versenken, Vier Oliven, Snake und die Türme von Hanoi. Öffnen, backen, mitspielen." }
      ]
    },
    {
      id: "std-uhr",
      gruppe: STD,
      ordnung: 510,
      titel: "Uhr – simulierte Zeit",
      tier: 2,
      inhalt: [
        { art: "kurz", md: "Die `Uhr` tickt nicht echt: Jeder Programmschritt kostet genau **1 ms**. Darum kommt bei jedem Lauf exakt dasselbe heraus." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            "Dauer start = Uhr.jetzt();",
            "Uhr.vorspulen(20min);          // Teig gehen lassen …",
            "Dauer gewartet = Uhr.jetzt() - start;",
            "Bote.sage((gewartet >= 20min));",
            "Bote.sage((gewartet < 21min));"
          )
        },
        { art: "ausgabe", text: z("ja", "ja") },
        {
          art: "details",
          titel: "Alle Methoden der Uhr",
          inhalt: [
            tab([
              ["`jetzt()`", "Dauer seit Programmstart.", "`Dauer t = Uhr.jetzt();`"],
              ["`vorspulen(d)`", "Die Uhr springt um die Dauer `d` vor (eine Zahl gilt als Millisekunden) – praktisch, um Haltbarkeiten (`@Kühlschrank`) zu testen. Rückwärts geht nicht: `RechenAnanas`.", "`Uhr.vorspulen((3d));`"]
            ]),
            { art: "text", md: "Die Uhr zählt **ganze Millisekunden**: `Uhr.vorspulen(0.5ms)` wird kaufmännisch auf 1 ms gerundet, `0.4ms` auf 0 ms. Dauer-Werte selbst dürfen Kommazahlen sein (`10s / 3`)." },
            { art: "hinweis", ton: "pizza", md: "Der genaue Wert von `Uhr.jetzt()` hängt von der Schrittzahl ab. Vergleiche lieber mit `<` oder `>=` statt mit `==` – auch ein Pizzaiolo misst die Backzeit nicht auf die Millisekunde." }
          ]
        }
      ]
    },
    {
      id: "std-mathe",
      gruppe: STD,
      ordnung: 520,
      titel: "Mathe & Zufall",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "`Mathe` rechnet für dich (Wurzel, Runden, Kreiszahl – Pizzen sind rund). `Zufall` würfelt, aber **immer gleich**: Jeder Lauf liefert dieselben Zahlen." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "salami radius = 16;   // 32er Pizza",
            "funghi fläche = Mathe.PI * radius * radius;",
            "Bote.sage((\"Fläche: \" + Mathe.runden(fläche) + \" cm²\"));",
            "Bote.sage((Mathe.wurzel(16)));",
            "Bote.sage((Mathe.max(3, 7) + Mathe.min(3, 7)));",
            "salami wurf = Zufall.zahl(1, 6);",
            "Bote.sage((wurf >= 1 && wurf <= 6));"
          )
        },
        { art: "ausgabe", text: z("Fläche: 804 cm²", "4", "10", "ja") },
        {
          art: "details",
          titel: "Alle Methoden von Mathe",
          inhalt: [
            tab([
              ["`wurzel(x)`", "Quadratwurzel", "`Mathe.wurzel(16)` → `4`"],
              ["`potenz(a, b)`", "`a` hoch `b`", "`Mathe.potenz(2, 10)` → `1024`"],
              ["`max(a, b, …)`", "Größter Wert – beliebig viele Zahlen; ganz ohne Zahl → `RechenAnanas`", "`Mathe.max(3, 9, 7)` → `9`"],
              ["`min(a, b, …)`", "Kleinster Wert – beliebig viele Zahlen", "`Mathe.min(4, 2, 8)` → `2`"],
              ["`abs(x)`", "Betrag (ohne Minus)", "`Mathe.abs(-12)` → `12`"],
              ["`runden(x)`", "Kaufmännisch auf Ganzzahl runden (.5 geht von der Null weg)", "`Mathe.runden(2.5)` → `3`, `Mathe.runden(-2.5)` → `-3`"],
              ["`runden(x, n)`", "Kaufmännisch auf `n` Nachkommastellen", "`Mathe.runden(2.675, 2)` → `2.68`"],
              ["`boden(x)`", "Abrunden", "`Mathe.boden(7.9)` → `7`"],
              ["`decke(x)`", "Aufrunden", "`Mathe.decke(7.1)` → `8`"],
              ["`PI`", "Die Kreiszahl (Konstante, ohne `()`)", "`Mathe.PI`"]
            ]),
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Bote.sage((Mathe.boden(7.9) + \" / \" + Mathe.decke(7.1)));",
                "Bote.sage((Mathe.abs(-12)));",
                "Bote.sage((Mathe.potenz(2, 10)));",
                "Bote.sage((Mathe.max(3, 9, 7)));",
                "Bote.sage((Mathe.runden(2.675, 2)));"
              )
            },
            { art: "ausgabe", text: z("7 / 8", "12", "1024", "9", "2.68") },
            { art: "text", md: "**Kaufmännisch runden** heißt: Bei genau .5 geht es von der Null weg (`2.5` → `3`, `-0.5` → `-1`). Bei Nachkommastellen gleicht pizza das Kommazahl-Krümeln aus, deshalb wird `1.005` auf zwei Stellen zu `1.01` und `0.125` zu `0.13` – so wie man es auf dem Kassenbon erwartet." },
            { art: "text", md: "**Unmögliches und Riesiges:** `Mathe.wurzel(-1)` liefert `NaN` (*keine Zahl*), `Mathe.potenz(10, 400)` liefert `Infinity`. Beides sind gültige `funghi`-Werte; `NaN == NaN` ist allerdings `nein`. In ein `salami` passen sie nicht (`TypAnanas`). Teilen durch 0 bleibt eine `RechenAnanas`." }
          ]
        },
        {
          art: "details",
          titel: "Zufall: Methode und Seed",
          inhalt: [
            { art: "text", md: "`Zufall` rechnet mit einem festen Startwert (Seed 42). Deshalb ist die „zufällige“ Folge bei jedem Lauf dieselbe – jedes Rezept bleibt nachkochbar." },
            tab([
              ["`zahl(a, b)`", "Ganzzahl zwischen `a` und `b`, beide Grenzen **inklusive** (ist `a > b`, werden sie getauscht). Nur Ganzzahlen als Grenzen, sonst `TypAnanas`.", "`salami w = Zufall.zahl(1, 6);`"]
            ]),
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Blech<margherita> sorten = [\"Margherita\", \"Funghi\", \"Diavolo\", \"Quattro Formaggi\"];",
                "salami wahl = Zufall.zahl(1, sorten.länge());",
                "Bote.sage((\"Heute empfiehlt der Chef: \" + sorten.stück(wahl)));"
              )
            },
            { art: "hinweis", ton: "info", md: "Welche Sorte der Chef empfiehlt, verraten wir nicht – probier es aus. Es ist bei jedem Lauf dieselbe." }
          ]
        }
      ]
    },
    {
      id: "std-spiegel",
      gruppe: STD,
      ordnung: 540,
      titel: "Spiegel – in Objekte schauen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Mit dem `Spiegel` schaust du in ein Objekt hinein und siehst alle Felder – sogar die `geheimrezept`-Felder (private). Nur eine zugeklappte `calzone` bleibt blickdicht." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "klasse Koch {",
            "    margherita name = \"Luigi\";",
            "    geheimrezept salami geheimzutaten = 7;",
            "}",
            "Bote.sage((Spiegel.felder(neu Koch())));"
          )
        },
        { art: "ausgabe", text: "{name: Luigi, geheimzutaten: 7}" },
        {
          art: "details",
          titel: "Methode und die Calzone-Ausnahme",
          inhalt: [
            tab([
              ["`felder(obj)`", "`Speisekarte` aller Felder (Name → Wert), auch `geheimrezept`. Bei zugeklappter Calzone → `ZugeklapptAnanas`.", "`Spiegel.felder(neu Koch())`"]
            ]),
            { art: "text", md: "Eine `calzone` muss man erst `aufklappen()` – das kostet die Garantie (Warnung `W0013`):" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "calzone klasse Tresor {",
                "    geheimrezept margherita code = \"1234\";",
                "}",
                "Tresor t = neu Tresor();",
                "probier {",
                "    Spiegel.felder(t);",
                "} verbrannt (ZugeklapptAnanas a) {",
                "    Bote.sage((a.nachricht()));",
                "}",
                "t.aufklappen();                 // Warnung W0013",
                "Bote.sage((Spiegel.felder(t)));"
              )
            },
            { art: "ausgabe", text: z("Die Calzone ist zu. Nutze aufklappen().", "{code: 1234}") }
          ]
        }
      ]
    },
    {
      id: "std-zahl",
      gruppe: STD,
      ordnung: 550,
      titel: "Werte-Methoden: Zahl, Text, Dauer",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Zahlen, Texte und Zeitdauern bringen eigene Methoden mit. Du rufst sie mit einem Punkt auf: `preis.euro()`, `text.groß()`, `backzeit.inSekunden()`." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "funghi preis = ((Tomate, Mozzarella, Basilikum)).preis();",
            "Bote.sage((preis.euro()));",
            "funghi pi = 3.14159;",
            "Bote.sage((pi.runden(2)));",
            "margherita bestellung = \"  Pizza Margherita  \";",
            "margherita t = bestellung.trimme();",
            "Bote.sage((t.groß()));",
            "Bote.sage((t.zeichen(1)));",
            "Dauer backzeit = 1min + 30s;",
            "Bote.sage((backzeit));",
            "Bote.sage((backzeit.inSekunden()));"
          )
        },
        { art: "ausgabe", text: z("8,00 €", "3.14", "PIZZA MARGHERITA", "P", "1min 30s", "90") },
        {
          art: "details",
          titel: "Zahl-Methoden (salami, funghi)",
          inhalt: [
            tab([
              ["`euro()`", "Als Eurobetrag: kaufmännisch auf zwei Stellen gerundet, Komma, ohne Tausenderpunkte; nie `-0,00 €`", "`8` → `\"8,00 €\"`, `0.015` → `\"0,02 €\"`"],
              ["`runden()`", "Kaufmännisch auf Ganzzahl runden (.5 von der Null weg)", "`3.5` → `4`, `-2.5` → `-3`"],
              ["`runden(n)`", "Kaufmännisch auf `n` Nachkommastellen (auch benannt: `runden(stellen: 2)`)", "`3.14159.runden(2)` → `3.14`"],
              ["`abs()`", "Betrag (ohne Minus)", "`-7.9` → `7.9`"],
              ["`ganz()`", "Nachkommastellen abschneiden (nicht runden!)", "`-7.9` → `-7`"],
              ["`alsText()`", "Als Text", "`7.5` → `\"7.5\"`"]
            ]),
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "funghi pi = 3.14159;",
                "Bote.sage((pi.runden()));",
                "funghi minus = -7.9;",
                "Bote.sage((minus.ganz()));",
                "Bote.sage((minus.abs()));",
                "Bote.sage((pi.alsText() + \"!\"));"
              )
            },
            { art: "ausgabe", text: z("3", "-7", "7.9", "3.14159!") },
            { art: "text", md: "**Vorsicht mit dem Minus:** `-` bindet schwächer als der Methodenpunkt. `-2.5.abs()` heißt also `-(2.5.abs())` und ergibt `-2.5`. Für Methoden auf negativen Zahlen Klammern setzen:" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Bote.sage((-2.5.abs()));",
                "Bote.sage(((-2.5).abs()));",
                "Bote.sage(((-0.5).runden()));"
              )
            },
            { art: "ausgabe", text: z("-2.5", "2.5", "-1") },
            { art: "hinweis", ton: "info", md: "Ganzzahlen (`salami`) sind exakt bis etwa 9 Billiarden (2^53) und laufen nicht über: `2147483647 + 1` ist `2147483648`. Der Rest `%` hat das Vorzeichen der linken Zahl: `-7.5 % 2` ist `-1.5`." }
          ]
        },
        {
          art: "details",
          titel: "Text-Methoden (margherita)",
          inhalt: [
            { art: "text", md: "Wie beim Blech wird ab **1** gezählt: Das erste Zeichen ist Zeichen 1, nicht Zeichen 0." },
            tab([
              ["`länge()`", "Anzahl Zeichen", "`\"Pizza\".länge()` → `5`"],
              ["`groß()` / `klein()`", "Groß- bzw. Kleinbuchstaben", "`\"pizza\".groß()` → `\"PIZZA\"`"],
              ["`enthält(s)`", "Kommt `s` vor?", "`\"Margherita\".enthält(\"her\")` → `ja`"],
              ["`zerlege(trenner)`", "Zerlegt in ein `Blech` von Texten", "`\"a,b\".zerlege(\",\")` → `[a, b]`"],
              ["`ersetze(a, b)`", "Ersetzt `a` durch `b`", "`\"Pizza Salami\".ersetze(\"Salami\", \"Funghi\")`"],
              ["`trimme()`", "Entfernt Leerraum am Anfang und Ende", "`\"  Teig  \".trimme()` → `\"Teig\"`"],
              ["`zeichen(i)`", "Zeichen an Position `i` (ab 1)", "`\"Pizza\".zeichen(1)` → `\"P\"`"],
              ["`wiederhole(n)`", "Text `n`-mal hintereinander", "`\"na\".wiederhole(3)` → `\"nanana\"`"],
              ["`beginntMit(s)`", "Beginnt der Text mit `s`?", "`\"Pizzeria\".beginntMit(\"Pizza\")` → `nein`"],
              ["`endetMit(s)`", "Endet der Text mit `s`?", "`\"Pizza\".endetMit(\"za\")` → `ja`"],
              ["`istLeer()`", "Ist der Text `\"\"`?", "`\"\".istLeer()` → `ja`"],
              ["`alsText()`", "Der Text selbst", "`\"Teig\".alsText()` → `\"Teig\"`"],
              ["`alsZahl()`", "Text als Zahl: Punkt **oder** Komma, `_` erlaubt, Leerraum außen egal; sonst `TypAnanas` (siehe *Ein- und Ausgabe*)", "`\"2,5\".alsZahl()` → `2.5`"]
            ]),
            { art: "text", md: "`länge()` und `zeichen(i)` zählen echte Zeichen, auch Emoji: `\"🍕\".länge()` ist `1`. `groß()` macht aus `ß` ein `SS`." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "margherita t = \"Pizza Margherita\";",
                "Bote.sage((t + \" (\" + t.länge() + \" Zeichen)\"));",
                "Bote.sage((t.enthält(\"Marg\")));",
                "Bote.sage((t.ersetze(\"Margherita\", \"Funghi\")));",
                "margherita zutaten = \"Tomate,Mozzarella,Basilikum\";",
                "Bote.sage((zutaten.zerlege(\",\")));",
                "margherita na = \"na\";",
                "Bote.sage((na.wiederhole(3)));",
                "Bote.sage((t.beginntMit(\"Pizza\")));",
                "margherita zahl = \"42\";",
                "Bote.sage((zahl.alsZahl() + 8));",
                "Bote.sage((\" 1_000,5 \".alsZahl()));",
                "Bote.sage((t.endetMit(\"rita\")));"
              )
            },
            { art: "ausgabe", text: z("Pizza Margherita (16 Zeichen)", "ja", "Pizza Funghi", "[Tomate, Mozzarella, Basilikum]", "nanana", "ja", "50", "1000.5", "ja") },
            { art: "hinweis", ton: "info", md: "`für (margherita c : text) { … }` läuft über die einzelnen Zeichen eines Textes." }
          ]
        },
        {
          art: "details",
          titel: "Dauer: Literale, Rechnen, Methoden",
          inhalt: [
            { art: "text", md: "Eine Dauer schreibst du als Zahl **direkt** gefolgt von der Einheit: `500ms`, `90s`, `30min`, `1h`, `3d`, auch `1.5s`. Intern zählt pizza in Millisekunden. Als Text erscheinen die größten Einheiten zuerst, Nullteile fallen weg (`1min 30s`), negative Dauern mit `-` (`-1min 30s`)." },
            tab([
              ["`+` / `-`", "Mit anderer Dauer", "`1min + 30s` → `1min 30s`"],
              ["`*` / `/`", "Mit einer Zahl (auch `2 * 30s`); durch 0 → `RechenAnanas`", "`2h / 4` → `30min`"],
              ["Dauer `/` Dauer", "Wie oft passt die eine in die andere? Ergibt eine Zahl.", "`90s / 30s` → `3`"],
              ["`== != < <= > >=`", "Vergleiche", "`90s == 1min + 30s` → `ja`"],
              ["`inMs()`", "Als Millisekunden", "`(90s).inMs()` → `90000`"],
              ["`inSekunden()`", "Als Sekunden", "`(90s).inSekunden()` → `90`"],
              ["`inMinuten()`", "Als Minuten", "`(90s).inMinuten()` → `1.5`"]
            ], ["Operation / Methode", "Was sie tut", "Beispiel"]),
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Dauer backzeit = 1min + 30s;",
                "Bote.sage((backzeit * 2));",
                "Bote.sage((2h / 4));",
                "Bote.sage((backzeit.inMs()));",
                "Bote.sage((90s == backzeit));",
                "Bote.sage((3d + 4h));",
                "Bote.sage((backzeit / 30s));",
                "Bote.sage((backzeit.inMinuten()));"
              )
            },
            { art: "ausgabe", text: z("3min", "30min", "90000", "ja", "3d 4h", "3", "1.5") }
          ]
        }
      ]
    },
    {
      id: "std-blech",
      gruppe: STD,
      ordnung: 570,
      titel: "Blech – Listen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Ein `Blech` ist eine Liste – ein Backblech mit nummerierten Stücken. **Gezählt wird ab 1:** Das erste Stück ist `stück(1)`." },
        { art: "bild", src: "img/doku/re-blech.svg", alt: "Ein Backblech mit fünf Stücken, nummeriert 1 bis 5, Werte 3, 1, 4, 1, 5. Darunter wie ein Fließband: belege verdoppelt jedes Stück, filtere behält nur Stücke größer 2, zusammenklappen fasst alles zu 14 zusammen.", unterschrift: "Die Nummern beginnen bei 1. `belege`, `filtere` und `zusammenklappen` arbeiten wie ein Fließband." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "Blech<salami> b = [3, 1, 4, 1, 5];",
            "Bote.sage((b.länge() + \" Stück, erstes: \" + b.stück(1)));",
            "Bote.sage((b.belege(x -> x * 2)));",
            "Bote.sage((b.filtere(x -> x > 2)));",
            "Bote.sage((b.zusammenklappen((a, c) -> a + c, 100)));",
            "Bote.sage((b.hinzu(9).sortiere()));"
          )
        },
        { art: "ausgabe", text: z("5 Stück, erstes: 3", "[6, 2, 8, 2, 10]", "[3, 4, 5]", "114", "[1, 1, 3, 4, 5, 9]") },
        {
          art: "details",
          titel: "Alle Methoden des Blechs",
          inhalt: [
            { art: "text", md: "Schreibweisen: `[a, b, c]` (ein Komma am Ende ist erlaubt), Bereiche `[1 .. 8]` (inklusive, rückwärts mit `[5 .. 1]`), leeres Blech: `neu Blech<salami>()`. Wer `stück(0)` verlangt, bekommt eine `KeinStückAnanas`." },
            { art: "text", md: "**Ändern oder neu?** Die Spalte *Blech* sagt, ob eine Methode **dein Blech verändert** oder ein **neues** liefert und deins in Ruhe lässt. Wer eine unabhängige Kopie braucht, nimmt `kopie()`." },
            tab([
              ["`länge()`", "–", "Anzahl Elemente", "`[3, 1, 4].länge()` → `3`"],
              ["`stück(i)`", "–", "Element an Position `i` (**ab 1**); außerhalb → `KeinStückAnanas`", "`b.stück(1)`"],
              ["`hinzu(x)`", "**ändert**", "Hängt `x` an, gibt **dasselbe** Blech zurück (verkettbar); `hinzu()` ohne Argument hängt `karton` an", "`b.hinzu(9).hinzu(2)`"],
              ["`entferne(i)`", "**ändert**", "Entfernt das Element an Position `i` und gibt **das Element** zurück", "`b.entferne(1)` → `3`"],
              ["`setze(i, x)`", "**ändert**", "Ersetzt das Element an Position `i`, gibt das Blech zurück", "`b.setze(2, 7)`"],
              ["`kopie()`", "neu", "Unabhängige Kopie", "`Blech<salami> k = b.kopie();`"],
              ["`enthält(x)`", "–", "Ist `x` drauf? (Pizzen werden nach Belägen verglichen)", "`b.enthält(4)` → `ja`"],
              ["`belege(fn)`", "neu", "map: wendet `fn` auf jedes Element an", "`b.belege(x -> x * 2)`"],
              ["`filtere(fn)`", "neu", "Behält nur Elemente, für die `fn` `ja` liefert", "`b.filtere(x -> x > 2)`"],
              ["`zusammenklappen(fn)` / `(fn, start)`", "–", "reduce: fasst alles zu einem Wert zusammen; `start` geht auch benannt (`start: 0`); leeres Blech ohne Start → `karton`", "`b.zusammenklappen((a, c) -> a + c, 0)`"],
              ["`summe()`", "–", "Summe aller Zahlen (bei Dauern eine Dauer); leer → `0`", "`[1, 2, 3].summe()` → `6`"],
              ["`erstes()` / `letztes()`", "–", "Erstes bzw. letztes Element; leeres Blech → `KeinStückAnanas`", "`b.letztes()`"],
              ["`umdrehen()`", "neu", "Reihenfolge umkehren", "`b.umdrehen()`"],
              ["`sortiere()` / `sortiere((a, b) -> …)`", "neu", "Sortieren (stabil). Ohne Funktion nur Zahlen, Texte, Dauern oder Werte eines `quattrostagioni`. Die Funktion liefert eine Zahl: negativ = `a` zuerst.", "`b.sortiere((a, c) -> c - a)`"],
              ["`verbinde(trenner)`", "–", "Elemente zu einem Text verbinden; ohne Trenner direkt aneinander", "`b.verbinde(\", \")`"],
              ["`istLeer()`", "–", "Ist das Blech leer?", "`neu Blech<salami>().istLeer()` → `ja`"],
              ["`schneide(n)`", "neu", "In `n` Teil-Bleche schneiden (siehe *Schneiden*), `schneide(auto)` = 8; mehr Stücke als Elemente → leere Teil-Bleche", "`[1 .. 8].schneide(4)`"]
            ], ["Methode", "Blech", "Was sie tut", "Beispiel"]),
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Blech<salami> b = [3, 1, 2];",
                "Blech<salami> sortiert = b.sortiere();   // neu – b bleibt",
                "Bote.sage((b + \" / \" + sortiert));",
                "Blech<salami> k = b.kopie();",
                "b.hinzu(9);                              // ändert b",
                "Bote.sage((b + \" / Kopie: \" + k));",
                "Bote.sage((\"entfernt: \" + b.entferne(1) + \", übrig: \" + b));"
              )
            },
            { art: "ausgabe", text: z("[3, 1, 2] / [1, 2, 3]", "[3, 1, 2, 9] / Kopie: [3, 1, 2]", "entfernt: 3, übrig: [1, 2, 9]") },
            { art: "hinweis", ton: "info", md: "`==` vergleicht Bleche (und Speisekarten) nach **Identität**: `[1, 2] == [1, 2]` ist `nein`, denn es sind zwei verschiedene Bleche. Nur dasselbe Blech ist gleich." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Blech<salami> b = [3, 1, 4, 1, 5];",
                "Bote.sage((b.summe()));",
                "Bote.sage((b.enthält(4)));",
                "Bote.sage((b.verbinde(\" - \")));",
                "Bote.sage(([1 .. 5]));",
                "Bote.sage((neu Blech<salami>().istLeer()));",
                "probier {",
                "    b.stück(99);",
                "} verbrannt (KeinStückAnanas a) {",
                "    Bote.sage((\"Stück 99? Das Blech ist doch kein Partyblech.\"));",
                "}"
              )
            },
            { art: "ausgabe", text: z("14", "ja", "3 - 1 - 4 - 1 - 5", "[1, 2, 3, 4, 5]", "ja", "Stück 99? Das Blech ist doch kein Partyblech.") }
          ]
        }
      ]
    },
    {
      id: "std-speisekarte",
      gruppe: STD,
      ordnung: 580,
      titel: "Speisekarte – Maps",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Eine `Speisekarte` merkt sich Paare: zu jedem **Schlüssel** einen **Wert** – wie eine echte Karte zu jedem Gericht einen Preis." },
        { art: "bild", src: "img/doku/re-speisekarte.svg", alt: "Menütafel mit den Zeilen Margherita 8 und Salami 9.5. karte.hole(\"Salami\") liefert 9.5, karte.hole(\"Tonno\") liefert einen leeren Karton.", unterschrift: "Links der Schlüssel, rechts der Wert. Fehlt ein Eintrag, gibt `hole` einen leeren `karton` zurück." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "Speisekarte<margherita, funghi> karte = neu Speisekarte<margherita, funghi>();",
            "karte.lege(\"Margherita\", 8);",
            "karte.lege(\"Salami\", 9.5);",
            "Bote.sage((karte));",
            "Bote.sage((karte.hole(\"Tonno\")));",
            "Bote.sage((karte.hat(\"Salami\") + \", \" + karte.länge()));",
            "für (margherita name : karte) {",
            "    Bote.sage((name + \": \" + karte.hole(name).euro()));",
            "}"
          )
        },
        { art: "ausgabe", text: z("{Margherita: 8, Salami: 9.5}", "karton", "ja, 2", "Margherita: 8,00 €", "Salami: 9,50 €") },
        {
          art: "details",
          titel: "Alle Methoden der Speisekarte",
          inhalt: [
            { art: "text", md: "Großgeschrieben (`Speisekarte<K, V>`) ist es der Typ. Kleingeschrieben (`speisekarte`) ist es der Modifikator für *public*. `für (K k : karte)` läuft über die **Schlüssel** – in der Reihenfolge, in der sie zuerst hineingelegt wurden." },
            tab([
              ["`lege(k, v)`", "Legt `v` unter Schlüssel `k` ab (überschreibt), gibt die Speisekarte zurück", "`karte.lege(\"Salami\", 9.5)`"],
              ["`hole(k)`", "Wert zu `k`; fehlt er → `karton`", "`karte.hole(\"Salami\")`"],
              ["`hat(k)`", "Gibt es den Schlüssel?", "`karte.hat(\"Tonno\")` → `nein`"],
              ["`entferne(k)`", "Entfernt den Eintrag und gibt den alten Wert zurück (fehlte er: `karton`)", "`karte.entferne(\"Salami\")` → `9.5`"],
              ["`schlüssel()`", "`Blech` aller Schlüssel", "`karte.schlüssel()`"],
              ["`werte()`", "`Blech` aller Werte", "`karte.werte()`"],
              ["`länge()`", "Anzahl Einträge", "`karte.länge()`"],
              ["`istLeer()`", "Gibt es gar keinen Eintrag?", "`karte.istLeer()`"]
            ]),
            { art: "text", md: "**Was taugt als Schlüssel?** Zahlen, Texte, `ja`/`nein` und `karton` zählen nach ihrem **Wert** (`1` und `1.0` sind derselbe Schlüssel, `\"1\"` ein anderer). Beläge zählen nach ihrem Namen (`hole(Salami)` = `hole(\"Salami\")`), `quattrostagioni`-Werte als solche. Alles andere – Pizzen, Dauern, Bleche, Objekte – zählt nach **Identität**: nur genau dasselbe Ding findet den Eintrag wieder." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Speisekarte<margherita, funghi> karte = neu Speisekarte<margherita, funghi>();",
                "karte.lege(\"Margherita\", 8);",
                "karte.lege(\"Salami\", 9.5);",
                "karte.entferne(\"Salami\");",
                "Bote.sage((karte.schlüssel()));",
                "Bote.sage((karte.werte()));"
              )
            },
            { art: "ausgabe", text: z("[Margherita]", "[8]") }
          ]
        }
      ]
    },
    {
      id: "std-theke",
      gruppe: STD,
      ordnung: 590,
      titel: "Theke – Fenster & Knöpfe",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Mit der `Theke` bekommt dein Programm ein eigenes Fenster mit Schildern, Eingabefeldern und Knöpfen – wie eine Pizzatheke, an der der Gast zeigt und klickt. Im Playground erscheint es als Vorschaufenster, im heruntergeladenen Programm als echtes Fenster." },
                { art: "bild", src: "img/doku/re-theke.svg", alt: "Ein Fenster namens Pizzarechner mit grüner Markise. Darin ein Stapel aus Schild (Macht 16,00 €), Eingabe (2), Haken (extra Käse) und Knopf (Backen!). Ein Klick auf den Knopf geht an theke.bediene(), das den Rückruf aufruft; der Rückruf ändert mit setzeText das Schild.", unterschrift: "Zutaten in einem Stapel, Klick → `bediene()` ruft deinen Rückruf → der Rückruf ändert, was der Gast sieht." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          uiEreignisse: [{ typ: "aenderung", id: "z2", wert: "2" }, { typ: "klick", id: "z3" }],
          code: z(
            "Theke theke = neu Theke(\"Pizzarechner\", breite: 420, hoehe: 320);",
            "Schild preis = neu Schild(\"Noch nichts bestellt.\");",
            "Eingabe anzahl = neu Eingabe(platzhalter: \"Wie viele Pizzen?\");",
            "Knopf backen = neu Knopf(\"Backen!\", () -> {",
            "    funghi n = anzahl.wert().alsZahl();",
            "    preis.setzeText((\"Macht \" + (n * 8).euro()));",
            "});",
            "theke.zeige(neu Stapel([preis, anzahl, backen]));",
            "theke.bediene();"
          )
        },
        { art: "text", md: "Tippt der Gast `2` und klickt **Backen!**, steht auf dem Schild `Macht 16,00 €`. Das Programm endet, wenn der Gast das Fenster schließt. Die Theke läuft im Interpreter; der Wasm-Motor (Beta) kann sie noch nicht – mit „Auto (Beta)“ übernimmt dann der Interpreter." },
        {
          art: "details",
          titel: "Alle Zutaten",
          inhalt: [
            { art: "text", md: "Jedes Bauteil heißt **Zutat**. Alle Zutaten können `id()`, `sichtbar(ja/nein)` und `stil(schlüssel, wert)`. Die verändernden Methoden (`setzeText`, `aktiv`, `stil`, `sichtbar`, `beiKlick` …) geben die Zutat selbst zurück – du kannst sie also **verketten**: `neu Knopf(\"OK\").aktiv(nein).stil(\"farbe\", \"basilikum\")`. Ein erneutes `beiKlick`/`beiAenderung` **ersetzt** den alten Rückruf." },
            {
              art: "tabelle",
              kopf: ["Zutat", "Wozu", "Erzeugen", "Methoden"],
              zeilen: [
                ["`Theke`", "das Fenster", "`neu Theke(titel, breite: 480, hoehe: 360)`", "`zeige(zutat)`, `bediene()`, `schliesse()`, `setzeTitel(t)`"],
                ["`Schild`", "Text zum Anzeigen", "`neu Schild(text)`", "`text()`, `setzeText(t)`"],
                ["`Knopf`", "Knopf zum Klicken", "`neu Knopf(text)` oder `neu Knopf(text, () -> { … })`", "`text()`, `setzeText(t)`, `beiKlick(fn)`, `aktiv(ja/nein)`"],
                ["`Eingabe`", "einzeiliges Textfeld", "`neu Eingabe(wert: \"\", platzhalter: \"\")`", "`wert()`, `setzeWert(t)`, `beiAenderung(fn)` (bekommt den Text), `beiEnter(fn)`"],
                ["`Haken`", "Ankreuzfeld", "`neu Haken(text, an: nein)`", "`an()`, `setzeAn(ja/nein)`, `beiAenderung(fn)` (bekommt `ja`/`nein`)"],
                ["`Stapel`", "Zutaten untereinander", "`neu Stapel([a, b, c])`", "`hinzu(zutat)`, `leeren()`"],
                ["`Reihe`", "Zutaten nebeneinander", "`neu Reihe([a, b, c])`", "`hinzu(zutat)`, `leeren()`"]
              ]
            },
            { art: "text", md: "Stapel und Reihen lassen sich ineinander schachteln – so baust du jedes Layout aus Kästen. Weitere Zutaten (Listen, Bilder, eine Leinwand für Spiele …) kommen später dazu; dein Code bleibt dabei gültig." }
          ]
        },
        {
          art: "details",
          titel: "Die Ereignisschleife: bediene()",
          inhalt: [
            { art: "text", md: "`theke.bediene()` ist der Pizzaiolo hinter der Theke: Er **wartet**, bis der Gast etwas tut, ruft den passenden Rückruf auf (`beiKlick`, `beiAenderung`, `beiEnter`) und wartet weiter. Erst wenn das Fenster geschlossen wird oder dein Code `theke.schliesse()` ruft, geht es nach `bediene()` weiter.\n\n- Vorher muss etwas gezeigt werden: `bediene()` ohne `zeige(…)` → `LaufzeitAnanas: Die Theke ist leer.`\n- Ein zweites `bediene()` nach dem Schließen kehrt sofort zurück.\n- Pro Programm gibt es **eine** Theke: ein zweites `neu Theke(…)` → `LaufzeitAnanas: Es gibt nur eine Theke pro Programm.`\n- Ein Klick auf einen Knopf mit `aktiv(nein)` wird einfach ignoriert – kein Rückruf, kein Fehler. Dasselbe gilt für Ereignisse, für die kein Rückruf eingetragen ist.\n- Ändert ein Rückruf mehrere Zutaten, sieht der Gast alles auf einmal, sobald der Rückruf fertig ist.\n- Wirft ein Rückruf eine Ananas, fliegt sie aus `bediene()` heraus – fang sie mit `probier` um `bediene()`.\n- Warten auf den Gast kostet keine Schritte und keine Zeit auf der simulierten Uhr (wie bei der `Bestellannahme`)." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{ typ: "klick", id: "z2" }, { typ: "klick", id: "z2" }, { typ: "klick", id: "z3" }],
              code: z(
                "Theke theke = neu Theke(\"Zähler\");",
                "salami klicks = 0;",
                "Schild anzeige = neu Schild(\"0 Pizzen\");",
                "Knopf mehr = neu Knopf(\"+1\", () -> {",
                "    klicks++;",
                "    anzeige.setzeText((klicks + \" Pizzen\"));",
                "});",
                "Knopf fertig = neu Knopf(\"Fertig\", () -> { theke.schliesse(); });",
                "theke.zeige(neu Stapel([anzeige, neu Reihe([mehr, fertig])]));",
                "theke.bediene();",
                "Bote.sage((\"Bestellt: \" + klicks));"
              )
            },
            { art: "text", md: "Klickt der Gast zweimal auf **+1** und dann auf **Fertig**, steht danach in der Konsole:" },
            { art: "ausgabe", text: "Bestellt: 2" }
          ]
        },
        {
          art: "details",
          titel: "IDs und Stil",
          inhalt: [
            { art: "text", md: "**IDs:** Jede Zutat bekommt automatisch eine ID – `z1`, `z2`, … in der Reihenfolge, in der du sie mit `neu` erzeugst. Bei jedem Lauf dieselben, darum sind Theke-Programme testbar. Eigene IDs gehen auch: `neu Knopf(\"OK\", id: \"ok\")`." },
            { art: "text", md: "**Stil:** `zutat.stil(schlüssel, wert)` kennt nur eine kleine, feste Liste – freies CSS gibt es absichtlich nicht (sicher und überall gleich):" },
            {
              art: "tabelle",
              kopf: ["Schlüssel", "Werte"],
              zeilen: [
                ["`breite`, `hoehe`", "Größe in Pixeln (Ganzzahl ≥ 0)"],
                ["`abstand`", "Luft um die Zutat in Pixeln (Ganzzahl ≥ 0)"],
                ["`ausrichtung`", "`\"links\"`, `\"mitte\"`, `\"rechts\"`"],
                ["`schrift`", "`\"klein\"`, `\"normal\"`, `\"gross\"`, `\"mono\"`"],
                ["`farbe`", "`\"tomate\"`, `\"basilikum\"`, `\"mozzarella\"`, `\"kruste\"`, `\"normal\"`"]
              ]
            },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Schild titel = neu Schild(\"Pizzeria Luigi\", id: \"titel\")",
                "    .stil(\"schrift\", \"gross\")",
                "    .stil(\"farbe\", \"tomate\")",
                "    .stil(\"ausrichtung\", \"mitte\");",
                "Bote.sage((titel.id() + \": \" + titel.text()));"
              )
            },
            { art: "ausgabe", text: "titel: Pizzeria Luigi" },
            { art: "text", md: "Unbekannte Schlüssel ergeben `LaufzeitAnanas: Unbekannter Stil 'x'.`, unpassende Werte eine `TypAnanas`." }
          ]
        },
        {
          art: "details",
          titel: "Wo erscheint das Fenster? (Playground, EXE, Linux, W0100)",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Wo", "Was der Gast sieht"],
              zeilen: [
                ["Playground", "ein schwebendes **Vorschaufenster** über dem Editor; Schließen-Knopf = Fenster zu. Das 10-Sekunden-Zeitlimit ruht, solange auf den Gast gewartet wird; Abbrechen (`Esc`) geht immer."],
                ["Windows (`.exe`)", "ein echtes Fenster, gezeichnet von der eingebauten WebView2 von Windows 10/11. Fehlt sie, gibt es eine verständliche Meldung und das Programm läuft in der Konsole weiter."],
                ["Linux mit Theke", "ein echtes Fenster; braucht die Bibliothek **WebKitGTK 4.1** auf dem Rechner (meist über den Paketmanager installierbar)."],
                ["Linux ohne Theke", "die schlanke Variante ohne Fenster – Theke-Programme laufen dort als reines Konsolenprogramm (siehe W0100)."]
              ]
            },
            { art: "text", md: "Das Fenster erscheint erst beim ersten `zeige(…)`. Programme ohne Theke bleiben reine Konsolenprogramme. Welche Variante was braucht, zeigt auch der Dialog **„Als Programm herunterladen“**." },
            { art: "hinweis", ton: "info", md: "**W0100:** Gibt es nirgends ein Fenster (z. B. im Terminal ohne grafische Oberfläche oder in der Linux-Variante ohne Theke), meldet pizza `W0100: Keine Theke verfügbar – Fenster wird nicht angezeigt.`. `bediene()` kehrt dann sofort zurück, und das Programm läuft ganz normal weiter – das ist eine Warnung, kein Fehler." }
          ]
        }
      ]
    },

    // ------------------------------------------------------------------
    // Referenz & Toolchain
    // ------------------------------------------------------------------
    {
      id: "ref-keywords",
      gruppe: REF,
      ordnung: 600,
      titel: "Keyword-Spickzettel",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Alle 40 reservierten Wörter von pizza v3.0 auf einen Blick – mit dem passenden Java-Wort daneben." },
        { art: "hinweis", ton: "info", md: "**Groß-/Kleinschreibung zählt:** `speisekarte` ist ein Keyword, `Speisekarte` ein Typ. Und `pizza` ist seit v3.0 **kein** Keyword mehr – `pizza`, `Pizza` und `PiZZa` sind ganz normale Namen." },
        {
          art: "tabelle",
          kopf: ["pizza", "Java", "Bemerkung"],
          zeilen: [
            ["`paket`", "package", "optional, wird ignoriert"],
            ["`import`", "import", "optional, Standardbibliothek ist immer da"],
            ["`klasse`", "class", ""],
            ["`rezeptur`", "interface", "Fehlende Methode → `R0001`"],
            ["`rohling`", "abstract", "nicht essbar → `RohlingAnanas`"],
            ["`calzone`", "– (versiegelte Kapselung)", "`Spiegel` kommt nicht rein, `aufklappen()` → `W0013`"],
            ["`belag`", "– (Decorator)", "`belag Trüffel auf Pizza { … }`"],
            ["`auf`", "–", "Ziel eines `belag`"],
            ["`quattrostagioni`", "enum", "genau 4 Werte, sonst `Q0004`"],
            ["`erbt`", "extends", ""],
            ["`erfüllt`", "implements", ""],
            ["`speisekarte`", "public", "als Typ `Speisekarte<K, V>` = Map"],
            ["`familienrezept`", "protected", ""],
            ["`geheimrezept`", "private", "sonst `ZugriffsAnanas`"],
            ["`tiefkühl`", "static", ""],
            ["`gebacken`", "final", "Klasse erweitern → `P0011`"],
            ["`leer`", "void", ""],
            ["`neu`", "new", ""],
            ["`dies`", "this", ""],
            ["`unten`", "super", "die Schicht darunter"],
            ["`serviere`", "return", "**Klammerpflicht**: `serviere (x);`, sonst `K0001`"],
            ["`falls`", "if", "Klammern Pflicht"],
            ["`sonst`", "else", "`sonst falls` = else if"],
            ["`für`", "for", "klassisch und `für (T x : blech)`"],
            ["`solange`", "while", ""],
            ["`wähle`", "switch", "kein Durchfallen"],
            ["`fall`", "case", "`fall 1, 2 -> …`"],
            ["`standard`", "default", ""],
            ["`probier`", "try", ""],
            ["`verbrannt`", "catch", "auch im `ofen`-Ausdruck"],
            ["`rand`", "finally", "der Rand bleibt immer übrig"],
            ["`wirf`", "throw", ""],
            ["`wirft`", "throws", "wird nicht geprüft (Tier 3)"],
            ["`abbrechen`", "break", ""],
            ["`weiter`", "continue", ""],
            ["`ja`", "true", ""],
            ["`nein`", "false", ""],
            ["`karton`", "null", "der leere Karton"],
            ["`ofen`", "–", "Ausdruck mit Zeitbudget"],
            ["`roh`", "–", "Zweig bei überschrittenem `ofen`-Budget"]
          ]
        },
        { art: "text", md: "**Eingebaute Typen** – das sind Namen, keine Keywords:" },
        {
          art: "tabelle",
          kopf: ["pizza", "Java", "Bedeutung"],
          zeilen: [
            ["`salami`", "int / long", "Ganzzahl"],
            ["`funghi`", "double", "Kommazahl"],
            ["`margherita`", "String", "Text"],
            ["`diavolo`", "boolean", "Wahrheitswert"],
            ["`Dauer`", "Duration", "Zeitdauer"],
            ["`Blech<T>`", "List<T>", "Liste"],
            ["`Speisekarte<K, V>`", "Map<K, V>", "Map"],
            ["`Pizza`", "–", "Pizza mit Belägen"],
            ["`hawaii`", "–", "kompiliert. Mehr sagen wir dazu nicht."]
          ]
        },
        { art: "text", md: "**Eingebaute Funktionen und Objekte** – ebenfalls keine Keywords: `teig`, `bestelle`, `schieb`, `teile`, `zwischenstand` sowie `Bote` (`sage`, `schreibe`, `fehler`, `leeren`), `Bestellannahme` (`lies`, `frage`, `liesZahl`, `frageZahl`, `hatMehr`), `Uhr`, `Mathe`, `Zufall`, `Spiegel` – und für Fenster die Theke-Zutaten `Theke`, `Schild`, `Knopf`, `Eingabe`, `Haken`, `Stapel`, `Reihe`. `auto` gibt es nur als Argument von `schneide(auto)`." },
        { art: "text", md: "**Einstieg `hauptgang`:** Es zählt nur der Name. Gestartet wird der `hauptgang` der ersten Klasse im Quelltext, gibt es keinen, eine Top-Level-Funktion `hauptgang`. Er darf ohne Parameter auskommen; hat er einen, bekommt der das `Blech<margherita>` der Programm-Argumente. Mehr als ein Parameter ist ein Fehler, ein Rückgabewert wird ignoriert." }
      ]
    },
    {
      id: "ref-codes",
      gruppe: REF,
      ordnung: 610,
      titel: "Fehler- & Warnungscodes",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Ein **PizzaFehler** stoppt das Programm sofort – er lässt sich nicht fangen. Eine **Warnung** ist nur ein Stirnrunzeln: Das Programm läuft weiter." },
        { art: "text", md: "**PizzaFehler** – fatal. Exit-Code 2, beim Schrittlimit 3. Anders als Ananas lassen sie sich **nicht** mit `probier` fangen." },
        {
          art: "tabelle",
          kopf: ["Code", "Bedeutung", "Exit"],
          zeilen: [
            ["`P0001`", "Syntaxfehler – der Parser erkennt im Rezept kein Rezept.", "2"],
            ["`P0002`", "„Die Pizza ist noch im Ofen.“ – Schrittlimit (Standard 5 000 000) erreicht, vermutlich eine Endlosschleife.", "3"],
            ["`P0003`", "„Die Pizza ist noch im Ofen (Zeitlimit).“ – der Lauf hat im Playground länger als 10 Sekunden echte Zeit gebraucht.", "3"],
            ["`P0010`", "Eine Klasse `erbt`/`erfüllt` etwas, das es nicht gibt, oder erbt im Kreis („ein Teigknoten“).", "2"],
            ["`P0011`", "Eine `gebacken`e (finale) Klasse soll mit `erbt` erweitert werden.", "2"],
            ["`P0012`", "`abbrechen` oder `weiter` steht außerhalb einer Schleife – zum Beispiel direkt in einer Methode.", "2"],
            ["`K0001`", "„Klammerpflicht!“ – `serviere x;` statt `serviere (x);`.", "2"],
            ["`B0012`", "`@Nach`-Verstoß: ein Belag liegt unter dem, auf den er gehört. „Das ist keine Pizza, das ist ein Auflauf.“", "2"],
            ["`R0001`", "Eine Klasse `erfüllt` eine Rezeptur, aber eine Methode fehlt.", "2"],
            ["`Q0004`", "`quattrostagioni` hat nicht genau 4 Werte.", "2"],
            ["`A0001`", "`@PizzaÜberschreibt` an einer Methode, die es in Basisklasse/Rezeptur nicht gibt.", "2"]
          ]
        },
        { art: "text", md: "**Warnungen** – erscheinen einmal pro Code und Stelle und ändern den Exit-Code **nicht**." },
        {
          art: "tabelle",
          kopf: ["Code", "Auslöser", "Meldung (gekürzt)"],
          zeilen: [
            ["`W0003`", "Erster Aufruf einer `@PizzaVeraltet`-Methode (einmal pro Methode)", "Grund aus der Annotation"],
            ["`W0013`", "`aufklappen()` auf einer Calzone", "„Garantie erloschen. Das ist jetzt eine ganz normale Pizza.“"],
            ["`W0032`", "Zwei Namen im selben Scope unterscheiden sich nur in Groß-/Kleinschreibung", "„Selbst der Pizzaiolo verwechselt die beiden.“"],
            ["`W0666`", "Typ `hawaii` oder Belag-Bezeichner für die Frucht, die man nicht nennt, im Quelltext (genau einmal pro Programm)", "„Der Pizzaiolo sagt nichts. Er schaut nur.“"],
            ["`S0007`", "`schneide(7)`", "„7 Stücke? Wer schneidet eine Pizza in 7 Stücke?“"],
            ["`T0007`", "`backen()` ohne vorheriges `gehenlassen()`", "„Das schmeckt flach.“"],
            ["`W0100`", "`theke.bediene()`, aber nirgends kann ein Fenster erscheinen", "„Keine Theke verfügbar – Fenster wird nicht angezeigt.“"]
          ]
        },
        { art: "text", md: "Zwei Warnungen in Aktion – das Programm läuft trotzdem bis zum Ende:" },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "salami PiZZa = 1;",
            "salami PizZa = 2;              // W0032",
            "Blech<salami> stücke = [1 .. 8].schneide(7);   // S0007",
            "Bote.sage((PiZZa + PizZa + \" / \" + stücke.länge()));"
          )
        },
        { art: "ausgabe", text: "3 / 7" },
        {
          art: "details",
          titel: "Zum Nachkochen: zwei echte PizzaFehler",
          inhalt: [
            { art: "text", md: "Ein `K0001` – pizza lässt kein `serviere` ohne Klammern durch:" },
            {
              art: "code",
              ausfuehrbar: true,
              exitCode: 2,
              tier: 1,
              code: z(
                "klasse Kasse {",
                "    salami summe() {",
                "        serviere 42;",
                "    }",
                "}",
                "Bote.sage((neu Kasse().summe()));"
              )
            },
            { art: "text", md: "Und ein `B0012` – Käse gehört **auf** die Tomate, nicht darunter:" },
            {
              art: "code",
              ausfuehrbar: true,
              exitCode: 2,
              tier: 1,
              code: "Pizza auflauf = ((Käse, Tomate));"
            }
          ]
        },
        { art: "hinweis", ton: "info", md: "Ananas (Exceptions) haben keinen Nummerncode – ihr Code ist der Klassenname, z. B. `StreitAnanas`. Ungefangen enden sie mit `Ungefangene Ananas – Typ: Nachricht (Zeile N)` und Exit-Code 1." }
      ]
    },
    {
      id: "ref-exitcodes",
      gruppe: REF,
      ordnung: 620,
      titel: "Exit-Codes",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Jeder Lauf endet mit einer Zahl, dem Exit-Code. Er sagt, wie es ausgegangen ist: 0 heißt „gegessen“, alles andere heißt „da ist was schiefgelaufen“. Die Konsole zeigt ihn als Badge." },
        { art: "bild", src: "img/doku/re-exitcodes.svg", alt: "Kassenbon mit den Exit-Codes: 0 gegessen, 1 ungefangene Ananas, 2 PizzaFehler, 3 noch im Ofen, 39 Hawaii. Warnungen ändern den Code nie.", unterschrift: "Der Kassenbon jedes Laufs." },
        {
          art: "tabelle",
          kopf: ["Code", "Bedeutung"],
          zeilen: [
            ["`0`", "gegessen – alles gut"],
            ["`1`", "ungefangene Ananas"],
            ["`2`", "PizzaFehler (Syntax, `B0012`, `R0001`, `Q0004`, `A0001`, `P0010`, `P0011`, `P0012`, `K0001` …) – das Programm startet gar nicht erst. Auch: ein `.pkarton`, das sich nicht laden lässt (`HOST`)."],
            ["`3`", "die Pizza ist noch im Ofen: Schrittlimit (`P0002`) oder 10-Sekunden-Zeitlimit im Playground (`P0003`)"],
            ["`39`", "Hawaii. Der Pizzaiolo hat den Raum verlassen."]
          ]
        },
        { art: "text", md: "Exit-Code 1 zum Nachkochen – eine Ananas, die niemand fängt:" },
        {
          art: "code",
          ausfuehrbar: true,
          exitCode: 1,
          tier: 1,
          code: z(
            "Bote.sage((\"Wer hat das letzte Stück gegessen?\"));",
            "wirf neu StreitAnanas(\"Alle zeigen aufeinander.\");"
          )
        },
        { art: "ausgabe", text: "Wer hat das letzte Stück gegessen?" },
        { art: "hinweis", ton: "pizza", md: "Warum ausgerechnet 39? Weil es keine gute Antwort auf Ananas gibt. Warnungen verändern den Exit-Code übrigens nie. Andere Zahlen als 0, 1, 2, 3 und 39 gibt es nicht." }
      ]
    },
    {
      id: "ref-toolchain",
      gruppe: REF,
      ordnung: 630,
      titel: "Toolchain",
      tier: 3,
      inhalt: [
        { art: "kurz", md: "So würde eine „echte“ pizza-Küche arbeiten: Quelltext rein in den Ofen, fertige Pizza im Karton raus. Der Bote liefert fehlende Zutaten." },
        { art: "hinweis", ton: "warnung", md: "**Größtenteils Spezifikation.** `pizzaofen` mit `ofen.xml` und der `pizzabote` gibt es nur auf dem Papier. Der Compiler `pizzaiolo` (backt zu WebAssembly) und das `.pkarton` gibt es dagegen schon als Beta – siehe *Motoren & Programm herunterladen*. Die Befehle unten zeigen, wie die vollständige Küche einmal aussehen soll." },
        { art: "bild", src: "img/doku/re-toolchain.svg", alt: "Pipeline: Pizzeria.pizza geht in den Ofen (pizzaiolo backe, pizzaofen), heraus kommt ein .pkarton, daraus die fertige Pizza. Darunter bringt der pizzabote Zutaten wie extra-käse zum Ofen.", unterschrift: "Vom Quelltext zum Karton – und der Bote bringt die Zutaten." },
        {
          art: "tabelle",
          kopf: ["Werkzeug", "Java-Gegenstück", "Aufgabe"],
          zeilen: [
            ["`pizzaiolo backe`", "javac", "Compiler: backt Quelltext zu ausführbarem Code"],
            ["`pizzaofen` + `ofen.xml`", "Maven + pom.xml", "Build-Tool mit Projektbeschreibung"],
            ["`.pkarton`", ".jar", "Archiv – die fertige Pizza zum Mitnehmen"],
            ["`pizzabote`", "Paketmanager", "liefert Abhängigkeiten, z. B. `pizzabote hol extra-käse`"],
            ["`--temperatur=485`", "-O", "Optimierung: heißer ist schneller. Mehr als 485 hält selbst Neapel nicht aus."]
          ]
        },
        { art: "text", md: "**Compiler** – einzelne Dateien backen, optional mit Optimierung:" },
        {
          art: "code",
          sprache: "shell",
          ausfuehrbar: false,
          tier: 3,
          code: z(
            "$ pizzaiolo backe Pizzeria.pizza",
            "$ pizzaiolo backe --temperatur=485 Pizzeria.pizza"
          )
        },
        {
          art: "details",
          titel: "Build-Tool, Paketmanager und Archiv",
          inhalt: [
            { art: "text", md: "**Build-Tool** – `pizzaofen` liest die `ofen.xml` im Projektverzeichnis. Die Version eines Projekts in Arbeit endet traditionell auf `-PIZZASHOT`:" },
            {
              art: "code",
              sprache: "xml",
              ausfuehrbar: false,
              tier: 3,
              code: z(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
                "<ofen>",
                "  <paket>de.luigi.pizzeria</paket>",
                "  <name>pizzeria</name>",
                "  <version>1.0-PIZZASHOT</version>",
                "  <zutaten>",
                "    <zutat>extra-käse</zutat>",
                "  </zutaten>",
                "</ofen>"
              )
            },
            { art: "text", md: "**Paketmanager & Archiv** – Abhängigkeiten holt der `pizzabote`, das Ergebnis des Builds ist ein `.pkarton`:" },
            {
              art: "code",
              sprache: "shell",
              ausfuehrbar: false,
              tier: 3,
              code: z(
                "$ pizzabote hol extra-käse",
                "$ pizzaofen",
                "$ ls",
                "ofen.xml  pizzeria-1.0-PIZZASHOT.pkarton  src/"
              )
            }
          ]
        },
        { art: "hinweis", ton: "info", md: "Ebenfalls Tier 3: statische Prüfung von Generics und `wirft`-Klauseln sowie echte Parallelität bei `schneide`, `teig` und `bestelle`. Der Interpreter parst all das, simuliert es aber nur." }
      ]
    },
    {
      id: "ref-motoren",
      gruppe: REF,
      ordnung: 635,
      titel: "Motoren & Programm herunterladen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "pizza kann auf zwei Motoren laufen: dem **Interpreter** (liest dein Rezept Zeile für Zeile) und **WebAssembly** (backt es vorher fertig – schneller). Mit WebAssembly lässt sich dein Programm auch als eigenständiges Programm für Windows oder Linux herunterladen." },
        { art: "hinweis", ton: "warnung", md: "**Beta:** Der WebAssembly-Motor ist neu. Standard bleibt der **Interpreter**; Wasm wählst du in der Werkzeugleiste mit **„Wasm (Beta)“** oder **„Auto (Beta)“**. Kann dein Browser kein Wasm, steht dort „Wasm (bald)“ bzw. der Grund – und alles läuft weiter im Interpreter." },
        {
          art: "tabelle",
          kopf: ["Motor", "Was er macht", "Wann"],
          zeilen: [
            ["Interpreter", "führt den Quelltext direkt aus; kann die ganze Sprache", "Standard, immer verfügbar"],
            ["Wasm (Beta)", "der Compiler `pizzaiolo` backt dein Programm zu WebAssembly, der Browser führt es aus", "auf Wunsch"],
            ["Auto (Beta)", "nimmt Wasm, wenn möglich, sonst den Interpreter (der Grund steht am Motor-Abzeichen in der Konsole)", "auf Wunsch"]
          ]
        },
        { art: "text", md: "Beide Motoren liefern **dieselbe Ausgabe**, dieselben Fehler und denselben Exit-Code – inklusive Schrittzählung und simulierter Uhr. Wählst du ausdrücklich „Wasm“ und dein Programm nutzt etwas, das der Compiler noch nicht kann, sagt die Konsole das, statt heimlich umzuschalten." },
        {
          art: "details",
          titel: "Als Programm herunterladen (Windows/Linux)",
          inhalt: [
            { art: "text", md: "Der Knopf **„Als Programm herunterladen“** backt den Code des aktiven Tabs zu WebAssembly und packt ihn mit einem kleinen Host-Programm zusammen – direkt in deinem Browser, ohne Server. Heraus kommt eine Datei für die gewählte Plattform: unter Windows eine `.exe`, unter Linux eine ausführbare Datei ohne Endung." },
            {
              art: "tabelle",
              kopf: ["System", "So startest du es"],
              zeilen: [
                ["Windows", "Doppelklick oder in der Eingabeaufforderung starten. Die `.exe` ist nicht signiert: Zeigt **SmartScreen** „Der Computer wurde durch Windows geschützt“, klick auf *Weitere Informationen → Trotzdem ausführen*."],
                ["Linux", "Erst ausführbar machen, dann starten: `chmod +x programm && ./programm`"]
              ]
            },
            { art: "text", md: "Das Programm läuft im **Terminal**. `Bote.sage` schreibt dorthin, Fehler und – falls es so weit kommt – der Hawaii-Banner landen auf der Fehlerausgabe (*stderr*). Eingaben für die `Bestellannahme` tippst du direkt ein; **Strg+D** beendet die Eingabe (Windows: **Strg+Z**, dann Enter). Der Exit-Code des Programms ist derselbe wie im Playground." },
            {
              art: "code",
              sprache: "shell",
              ausfuehrbar: false,
              tier: 1,
              code: z(
                "$ chmod +x zahlenraten",
                "$ ./zahlenraten",
                "$ echo $?",
                "0"
              )
            }
          ]
        },
        {
          art: "details",
          titel: "Für Fortgeschrittene: .pkarton und pizza-host",
          inhalt: [
            { art: "text", md: "Im selben Dialog gibt es **„nur .pkarton“**: das reine WebAssembly-Paket ohne Host. Es läuft mit dem Kommandozeilen-Host `pizza-host` und lässt sich mit `pizzaofen exe` nachträglich zu einem Programm backen:" },
            {
              art: "code",
              sprache: "shell",
              ausfuehrbar: false,
              tier: 1,
              code: z(
                "$ pizza-host zahlenraten.pkarton",
                "$ pizzaofen exe zahlenraten.pkarton -o zahlenraten.exe"
              )
            },
            { art: "text", md: "Ein `.pkarton`, das sich nicht laden lässt (kaputt oder falsche Version), meldet `PizzaFehler HOST: …` und endet mit Exit-Code 2 – das Programm ist dann gar nicht erst gestartet." }
          ]
        }
      ]
    },
    {
      id: "ref-playground",
      gruppe: REF,
      ordnung: 640,
      titel: "Playground-Kürzel",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Der Editor ist der Tresen – hier die Handgriffe für den schnellen Service." },
        {
          art: "tabelle",
          kopf: ["Kürzel", "Aktion"],
          zeilen: [
            ["`Strg+Enter`", "Programm ausführen – ab in den Ofen"],
            ["`Esc`", "Laufendes Programm abbrechen"],
            ["`Strg+S`", "Code lokal im Browser speichern"],
            ["`Strg+O`", "`.pizza`-Datei öffnen (oder Datei auf den Editor ziehen)"],
            ["`Alt+N`", "Neuer Tab"],
            ["`Alt+W`", "Tab schließen"],
            ["`Strg+B`", "Seitenpanel (Doku · Beispiele) ein-/ausklappen"],
            ["`F1` / `Strg+Shift+P`", "Befehlspalette – alle Aktionen durchsuchbar"],
            ["`Strg+D`", "im Eingabefeld der Konsole: Eingabe beenden (das Programm bekommt `karton`)"]
          ]
        },
        { art: "text", md: "Jeden Code-Block dieser Doku und jedes Beispiel übernimmst du mit **„Im Editor öffnen“**. Ein Lauf darf höchstens 10 Sekunden echte Zeit dauern – Warten auf deine Eingabe zählt nicht mit. Danach heißt es `PizzaFehler P0003: Die Pizza ist noch im Ofen (Zeitlimit).` mit Exit-Code 3." },
        {
          art: "details",
          titel: "Code teilen",
          inhalt: [
            { art: "text", md: "Der Knopf **„Teilen“** erstellt einen Link zu deinem Skript. Dafür wird das Skript des aktiven Tabs **auf unserem Server gespeichert** – erst, wenn du im Dialog auf **„Link erstellen“** klickst. Wie lange der Link funktioniert, steht im Dialog. Jeder mit dem Link kann den Code lesen; wer ihn öffnet, bekommt das Skript direkt in den Editor." },
            { art: "hinweis", ton: "warnung", md: "Teile keine Passwörter oder anderen Geheimnisse – auch nicht als Kommentar im Code." }
          ]
        },
        { art: "hinweis", ton: "pizza", md: "Ausgeführt wird alles lokal in deinem Browser. Dein Code verlässt ihn nur, wenn du ihn selbst teilst – nicht einmal, wenn du `hawaii` schreibst." }
      ]
    }
  );
})();
