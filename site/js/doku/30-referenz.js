/* pizza v3.1 – Doku: Standardbibliothek (500–599), Herd (591–598) & Referenz/Toolchain (600–699) – Doku v2 */
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
            "Dauer backzeit = 90s;",
            "Bote.sage((backzeit));",
            "Bote.sage(([1, 2, 3]));",
            "Bote.fehler((\"Kein Basilikum mehr!\"));"
          )
        },
        { art: "ausgabe", text: z("Bestellung Nr. 42", "1min 30s", "[1, 2, 3]", "Kein Basilikum mehr!") },
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
            { art: "hinweis", ton: "pizza", md: "`0.30000000000000004` ist kein Rechenfehler von pizza, sondern ganz normales Kommazahl-Krümeln. Für Geld gibt es `währung(\"€\")` – zwei Stellen, Komma, Währungszeichen." }
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
                "Bote.sage((\"Rechnung: \" + summe.währung(\"€\")));"
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
              ["`vorspulen(d)`", "Die Uhr springt um die Dauer `d` vor (eine Zahl gilt als Millisekunden) – praktisch, um Haltbarkeiten (`@Kühlschrank`) zu testen. Rückwärts geht nicht: `RechenAnanas`.", "`Uhr.vorspulen((3d));`"],
              ["`echt()`", "Die **echte** Uhrzeit: Dauer seit dem 1. Januar 1970 (ganze ms). Ändert sich von Lauf zu Lauf – gut für Idle-Spiele („Wie lange war der Spieler weg?“), schlecht für Tests.", "`Dauer jetzt = Uhr.echt();`"]
            ]),
            { art: "text", md: "`Uhr.jetzt()` und `Uhr.echt()` sind zwei verschiedene Uhren: `jetzt()` zählt Programmschritte und ist bei jedem Lauf gleich, `echt()` ist die Wanduhr deines Computers. Zusammen mit der *Vorratskammer* misst du so die Zeit zwischen zwei Spielrunden:" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              echtzeit: 1767225600000,   // feste Wanduhr (2026-01-01) für Tests/Differenztest (K-087)
              code: z(
                "Vorratskammer v = neu Vorratskammer(\"idle\");",
                "funghi zuletzt = v.hole(\"zuletzt\", Uhr.echt().inMs());",
                "Dauer weg = Uhr.echt() - (zuletzt * 1ms);",
                "v.lege(\"zuletzt\", Uhr.echt().inMs());",
                "Bote.sage((\"Weg gewesen: mindestens 0 Sekunden? \" + (weg >= 0ms)));"
              )
            },
            { art: "ausgabe", text: "Weg gewesen: mindestens 0 Sekunden? ja" },
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
      titel: "Mathe",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "`Mathe` rechnet für dich: Wurzel, Potenz, Logarithmus, Runden, Kreiszahl – Pizzen sind rund. Fürs Würfeln gibt es `Zufall` (eigener Abschnitt)." },
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
              ["`log(x)`", "Natürlicher Logarithmus (Basis `E`)", "`Mathe.log(Mathe.E)` → `1`"],
              ["`log10(x)`", "Zehnerlogarithmus – wie viele Nullen?", "`Mathe.log10(1000)` → `3`"],
              ["`log2(x)`", "Zweierlogarithmus – wie oft verdoppelt?", "`Mathe.log2(8)` → `3`"],
              ["`exp(x)`", "`E` hoch `x` (Umkehrung von `log`)", "`Mathe.exp(0)` → `1`"],
              ["`PI`", "Die Kreiszahl (Konstante, ohne `()`)", "`Mathe.PI`"],
              ["`E`", "Die Eulersche Zahl 2,718… (Konstante, ohne `()`)", "`Mathe.E`"]
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
            { art: "text", md: "**Unmögliches und Riesiges:** `Mathe.wurzel(-1)` liefert `NaN` (*keine Zahl*), `Mathe.potenz(10, 400)` liefert `Infinity`. Beides sind gültige `funghi`-Werte; `NaN == NaN` ist allerdings `nein`. In ein `salami` passen sie nicht (`TypAnanas`). Teilen durch 0 bleibt eine `RechenAnanas`." },
            { art: "text", md: "**Logarithmen** beantworten „`E`/10/2 hoch was ergibt `x`?“ – praktisch, wenn ein Idle-Spiel ausrechnen soll, wie viele Öfen man sich auf einmal leisten kann, ohne eine Schleife zu drehen. Die Umkehrung ist `exp`: `Mathe.exp(Mathe.log(x))` ist (bis aufs Krümeln) wieder `x`." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Bote.sage((Mathe.log10(1000) + \" / \" + Mathe.log2(8)));",
                "Bote.sage((Mathe.log(Mathe.E) + \" / \" + Mathe.exp(0)));",
                "salami preis = 50;",
                "salami kasse = 5000;",
                "Bote.sage((\"Zehnerpotenzen im Budget: \" + Mathe.boden(Mathe.log10(kasse / preis))));"
              )
            },
            { art: "ausgabe", text: z("3 / 3", "1 / 1", "Zehnerpotenzen im Budget: 2") },
            { art: "text", md: "**Sonderfälle** wie in jeder Sprache: `Mathe.log(0)` ist `-Infinity`, `Mathe.log(-1)` ist `NaN`, `Mathe.exp(710)` ist `Infinity`; `NaN` wird durchgereicht. Ein `log(x, basis)` mit zwei Argumenten gibt es absichtlich **nicht**: `Mathe.log(1000) / Mathe.log(10)` ergibt `2.9999999999999996` – Kommazahl-Krümel. Nimm für Zehner- und Zweierpotenzen immer `log10` und `log2`, die liefern glatte `3`." }
          ]
        }
      ]
    },
    {
      id: "std-zufall",
      gruppe: STD,
      ordnung: 525,
      titel: "Zufall – würfeln, mischen, auswählen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "`Zufall` würfelt Zahlen, wirft Münzen, zieht aus einem Blech und mischt Karten. Jeder Lauf bekommt eine neue **Saat** (den Startwert des Würfels) – wer dieselbe Saat wieder einsetzt, bekommt exakt dieselben Würfe." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "Zufall.saat(7);   // feste Saat: jedes Mal dieselben Würfe",
            "Blech<margherita> sorten = [\"Margherita\", \"Funghi\", \"Diavolo\", \"Quattro Formaggi\"];",
            "Bote.sage((\"Würfel: \" + Zufall.zahl(1, 6)));",
            "Bote.sage((\"Kommazahl: \" + Zufall.kommazahl().runden(3)));",
            "Bote.sage((\"Münzwurf: \" + Zufall.wahr(0.5)));",
            "Bote.sage((\"Der Chef empfiehlt: \" + Zufall.wähle(sorten)));",
            "Bote.sage((\"Gemischt: \" + Zufall.mische([1, 2, 3, 4, 5])));"
          )
        },
        { art: "ausgabe", text: z("Würfel: 1", "Kommazahl: 0.062", "Münzwurf: nein", "Der Chef empfiehlt: Diavolo", "Gemischt: [5, 1, 4, 2, 3]") },
        {
          art: "details",
          titel: "Alle Methoden von Zufall",
          inhalt: [
            tab([
              ["`zahl(a, b)`", "Ganzzahl zwischen `a` und `b`, beide Grenzen **inklusive** (ist `a > b`, werden sie getauscht). Nur Ganzzahlen, sonst `TypAnanas`.", "`Zufall.zahl(1, 6)`"],
              ["`kommazahl()`", "Kommazahl von 0 (inklusive) bis 1 (exklusive)", "`Zufall.kommazahl()`"],
              ["`kommazahl(a, b)`", "Kommazahl zwischen `a` und `b`", "`Zufall.kommazahl(10, 20)`"],
              ["`wahr(p)`", "`ja` mit Wahrscheinlichkeit `p` (0 bis 1); `p ≤ 0` → immer `nein`, `p ≥ 1` → immer `ja`", "`Zufall.wahr(0.25)` – in einem von vier Fällen `ja`"],
              ["`wähle(blech)`", "Ein zufälliges Stück aus dem Blech; leeres Blech → `KeinStückAnanas`", "`Zufall.wähle(sorten)`"],
              ["`mische(blech)`", "Ein **neues**, gemischtes Blech – das Original bleibt, wie es ist", "`Zufall.mische(karten)`"],
              ["`saat(n)`", "Setzt die Saat: ab hier kommen immer dieselben Würfe", "`Zufall.saat(7);`"],
              ["`saat()`", "Liefert die aktuelle Saat", "`Bote.sage((Zufall.saat()));`"]
            ]),
            { art: "text", md: "Der Würfel ist ein bekannter, fester Rechenweg (*mulberry32*). Darum würfelt pizza im Playground, in der Kommandozeile, im heruntergeladenen Programm und mit beiden Motoren **bit-genau gleich** – gleiche Saat, gleiche Würfe." }
          ]
        },
        {
          art: "details",
          titel: "Die Saat: echter Zufall oder jedes Mal gleich?",
          inhalt: [
            { art: "text", md: "- **Normalfall:** Jeder Lauf bekommt eine **echte, neue** Saat. Damit du einen spannenden Lauf wiederholen kannst, wird sie angezeigt: `Saat: 3141592` – im Playground als erste Zeile oben in der Konsole, in der Kommandozeile und im heruntergeladenen Programm als Zeile im Terminal (auf der Fehlerausgabe, damit sie deine Ausgabe nicht stört).\n- **Feste Saat 42:** Im Playground setzt du dafür das Häkchen **„feste Saat 42“** in der Konsolenleiste; in der Kommandozeile und beim heruntergeladenen Programm gibt es `--saat=42` (oder jede andere Zahl, z. B. die angezeigte: `--saat=3141592`). Tests, die Beispiele und die Code-Blöcke dieser Doku laufen immer mit Saat 42 – darum stimmen die gezeigten Ausgaben.\n- **Im Programm:** `Zufall.saat(n)` legt die Saat selbst fest – praktisch zum Testen deines Spiels." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Zufall.saat(7);",
                "Bote.sage(([1 .. 6].belege(x -> Zufall.zahl(1, 6))));",
                "Zufall.saat(7);",
                "Bote.sage(([1 .. 6].belege(x -> Zufall.zahl(1, 6))));"
              )
            },
            { art: "ausgabe", text: z("[1, 1, 6, 5, 4, 3]", "[1, 1, 6, 5, 4, 3]") },
            { art: "hinweis", ton: "info", md: "Die Saat ist eine Ganzzahl; sie wird auf den Bereich 0 … 4 294 967 295 umgerechnet (`Zufall.saat(-1)` ergibt `4294967295`). Keine Ganzzahl → `TypAnanas`." }
          ]
        },
        {
          art: "details",
          titel: "Eigene Würfel: neu Zufall",
          inhalt: [
            { art: "text", md: "`neu Zufall(saat)` baut einen **eigenen** Würfel mit denselben Methoden. Er hat seine eigene Folge und bringt den gemeinsamen `Zufall` nicht durcheinander – nützlich, wenn z. B. die Karte eines Spiels immer gleich sein soll, die Würfe aber nicht. `neu Zufall()` ohne Saat holt sich seine Saat vom gemeinsamen `Zufall`." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Zufall karte = neu Zufall(7);   // Spielfeld: immer gleich",
                "Bote.sage(karte);",
                "Bote.sage((karte.mische([\"A\", \"B\", \"C\", \"D\"])));",
                "Bote.sage((karte.zahl(1, 6) + \" / \" + karte.wahr(0.5)));"
              )
            },
            { art: "ausgabe", text: z("Zufall(7)", "[C, B, D, A]", "5 / nein") }
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
        { art: "kurz", md: "Zahlen, Texte und Zeitdauern bringen eigene Methoden mit. Du rufst sie mit einem Punkt auf: `preis.währung(\"€\")`, `text.groß()`, `backzeit.inSekunden()`." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "funghi preis = 5 + 1 + 1.5 + 0.5;   // Teig, Tomate, Mozzarella, Basilikum",
            "Bote.sage((preis.währung(\"€\")));",
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
              ["`währung(symbol)`", "Als Geldbetrag: kaufmännisch auf zwei Stellen gerundet, Komma, ohne Tausenderpunkte, nie `-0,00`; dahinter ein Leerzeichen und `symbol` (auch benannt: `symbol:`). Ohne Symbol (oder mit `karton`/leerem Text) nur der Betrag", "`8.währung(\"€\")` → `\"8,00 €\"`, `0.015.währung(\"€\")` → `\"0,02 €\"`, `2.5.währung(\"CHF\")` → `\"2,50 CHF\"`, `8.währung()` → `\"8,00\"`"],
              ["`runden()`", "Kaufmännisch auf Ganzzahl runden (.5 von der Null weg)", "`3.5` → `4`, `-2.5` → `-3`"],
              ["`runden(n)`", "Kaufmännisch auf `n` Nachkommastellen (auch benannt: `runden(stellen: 2)`)", "`3.14159.runden(2)` → `3.14`"],
              ["`abs()`", "Betrag (ohne Minus)", "`-7.9` → `7.9`"],
              ["`ganz()`", "Nachkommastellen abschneiden (nicht runden!)", "`-7.9` → `-7`"],
              ["`alsText()`", "Als Text", "`7.5` → `\"7.5\"`"],
              ["`tausender()` / `tausender(n)`", "Als Text mit Tausenderpunkten und Dezimalkomma, kaufmännisch auf `n` Stellen (Standard 0)", "`1234567.tausender(2)` → `\"1.234.567,00\"`"],
              ["`kompakt()` / `kompakt(n)`", "Kurz mit Stufe (`Tsd.`, `Mio.`, `Mrd.`, `Bio.`, `Brd.`, `Trio.`, `Trd.`, `Quadr.` … bis `Dezd.`, darüber `1,5 × 10⁷⁰`), höchstens `n` Nachkommastellen (Standard 2), ohne Nullen am Ende", "`1234567.kompakt()` → `\"1,23 Mio.\"`"],
              ["`währung(symbol, kompakt: ja)`", "Geldbetrag in Kurzform wie `kompakt(2)`", "`1234567.währung(\"€\", kompakt: ja)` → `\"1,23 Mio. €\"`"]
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
            { art: "text", md: "**Große Zahlen lesbar machen** – praktisch für Spielstände und Kassen: `tausender` setzt Punkte, `kompakt` kürzt ab. Unter 1000 gibt es keine Stufe, nur das Komma; weiter geht es mit `Trd.`, `Quadr.`, `Quadrd.`, `Quint.` … bis `Dezd.` (10⁶³), darüber `1,5 × 10⁷⁰`. `tausender` und `währung()` wechseln ab 10²¹ in dieselbe Kurzform; Unendlich wird `∞`. Nur die rohe Textform (`Bote.sage((x))`) bleibt bei `2.5e+21`." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "salami umsatz = 1234567;",
                "Bote.sage((umsatz.tausender()));",
                "Bote.sage((umsatz.tausender(2)));",
                "Bote.sage((umsatz.kompakt() + \" / \" + umsatz.kompakt(1)));",
                "Bote.sage((1500.kompakt() + \" / \" + 2000000.kompakt() + \" / \" + 12.345.kompakt()));",
                "Bote.sage((umsatz.währung(\"€\", kompakt: ja)));"
              )
            },
            { art: "ausgabe", text: z("1.234.567", "1.234.567,00", "1,23 Mio. / 1,2 Mio.", "1,5 Tsd. / 2 Mio. / 12,35", "1,23 Mio. €") },
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
              ["`enthält(x)`", "–", "Ist `x` drauf? Zahlen, Texte, Dauern nach Wert; Bleche und Objekte nach Identität", "`b.enthält(4)` → `ja`"],
              ["`belege(fn)`", "neu", "map: wendet `fn` auf jedes Element an", "`b.belege(x -> x * 2)`"],
              ["`brigade(fn)`", "neu", "wie `belege`, aber jedes Element in einer eigenen Küche – gleichzeitig, Hauptküche nur lesbar (siehe *Küchenbrigade*)", "`b.brigade(x -> x * 2)`"],
              ["`filtere(fn)`", "neu", "Behält nur Elemente, für die `fn` `ja` liefert", "`b.filtere(x -> x > 2)`"],
              ["`zusammenklappen(fn)` / `(fn, start)`", "–", "reduce: fasst alles zu einem Wert zusammen; `start` geht auch benannt (`start: 0`); leeres Blech ohne Start → `karton`", "`b.zusammenklappen((a, c) -> a + c, 0)`"],
              ["`summe()`", "–", "Summe aller Zahlen (bei Dauern eine Dauer); leer → `0`", "`[1, 2, 3].summe()` → `6`"],
              ["`erstes()` / `letztes()`", "–", "Erstes bzw. letztes Element; leeres Blech → `KeinStückAnanas`", "`b.letztes()`"],
              ["`umdrehen()`", "neu", "Reihenfolge umkehren", "`b.umdrehen()`"],
              ["`sortiere()` / `sortiere((a, b) -> …)`", "neu", "Sortieren (stabil). Ohne Funktion nur Zahlen, Texte, Dauern oder Werte eines `quattrostagioni`. Die Funktion liefert eine Zahl: negativ = `a` zuerst.", "`b.sortiere((a, c) -> c - a)`"],
              ["`verbinde(trenner)`", "–", "Elemente zu einem Text verbinden; ohne Trenner direkt aneinander", "`b.verbinde(\", \")`"],
              ["`istLeer()`", "–", "Ist das Blech leer?", "`neu Blech<salami>().istLeer()` → `ja`"],
              ["`schneide(n)`", "neu", "In `n` Teil-Bleche schneiden (siehe *Schneiden*); `n` ist Pflicht (Ganzzahl ≥ 1); mehr Stücke als Elemente → leere Teil-Bleche", "`[1 .. 8].schneide(4)`"]
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
            "    Bote.sage((name + \": \" + karte.hole(name).währung(\"€\")));",
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
              ["`hole(k, ersatz)`", "Wie `hole`, aber fehlt der Schlüssel → `ersatz` statt `karton` (auch benannt: `ersatz: 0`)", "`karte.hole(\"Tonno\", 0)` → `0`"],
              ["`hat(k)`", "Gibt es den Schlüssel?", "`karte.hat(\"Tonno\")` → `nein`"],
              ["`entferne(k)`", "Entfernt den Eintrag und gibt den alten Wert zurück (fehlte er: `karton`)", "`karte.entferne(\"Salami\")` → `9.5`"],
              ["`schlüssel()`", "`Blech` aller Schlüssel", "`karte.schlüssel()`"],
              ["`werte()`", "`Blech` aller Werte", "`karte.werte()`"],
              ["`länge()`", "Anzahl Einträge", "`karte.länge()`"],
              ["`istLeer()`", "Gibt es gar keinen Eintrag?", "`karte.istLeer()`"]
            ]),
            { art: "text", md: "**Was taugt als Schlüssel?** Zahlen, Texte, `ja`/`nein` und `karton` zählen nach ihrem **Wert** (`1` und `1.0` sind derselbe Schlüssel, `\"1\"` ein anderer), `quattrostagioni`-Werte als solche. Alles andere – Dauern, Bleche, Objekte – zählt nach **Identität**: nur genau dasselbe Ding findet den Eintrag wieder." },
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
            { art: "ausgabe", text: z("[Margherita]", "[8]") },
            { art: "text", md: "**Zählen mit Ersatzwert:** `hole(k, 0)` liefert beim ersten Mal `0` statt `karton` – so zählst du ohne `hat()`-Umweg: `k.lege(s, k.hole(s, 0) + 1)`. Der Ersatz gilt nur, wenn der Schlüssel ganz fehlt; ein absichtlich gespeicherter `karton` bleibt `karton`." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Speisekarte<margherita, salami> zähler = neu Speisekarte<margherita, salami>();",
                "für (margherita s : [\"Salami\", \"Tonno\", \"Salami\"]) {",
                "    zähler.lege(s, zähler.hole(s, 0) + 1);",
                "}",
                "Bote.sage((zähler));"
              )
            },
            { art: "ausgabe", text: "{Salami: 2, Tonno: 1}" }
          ]
        }
      ]
    },
    {
      id: "std-vorrat",
      gruppe: STD,
      ordnung: 585,
      titel: "Vorratskammer – Spielstand speichern",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Normalerweise vergisst ein Programm alles, sobald es endet. Was du in eine `Vorratskammer` legst, ist beim **nächsten Lauf noch da** – für Spielstände, Highscores und Einstellungen." },
        { art: "bild", src: "img/doku/re-vorrat.svg", alt: "Lauf 1 legt punkte 120 in ein Regal namens Vorratskammer pizza-imperium, in dem auch name Luigi und ein Blech stehen. Lauf 2 holt punkte wieder heraus und bekommt 120. Darunter: im Playground wird im Browser gespeichert, im Programm oder Terminal als Datei.", unterschrift: "Was Lauf 1 ins Regal stellt, holt Lauf 2 wieder heraus." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "Vorratskammer v = neu Vorratskammer(\"pizzeria\");",
            "salami besuche = v.hole(\"besuche\", 0) + 1;",
            "v.lege(\"besuche\", besuche);",
            "Bote.sage((\"Besuch Nr. \" + besuche));"
          )
        },
        { art: "ausgabe", text: "Besuch Nr. 1" },
        { art: "text", md: "Beim nächsten Lauf steht dort `Besuch Nr. 2`, dann `3` … Die Zahl oben (`1`) ist die Ausgabe beim allerersten Lauf. Backst du das Beispiel im Playground (Knopf „Backen“ an diesem Block), läuft es in einem eigenen Tab mit echtem Speicher: Jedes weitere Backen zählt hoch (`2`, `3` …). Dieser Beispiel-Stand ist vom Stand deiner eigenen Programme getrennt (siehe unten). Nur die automatischen Tests der Doku laufen ganz ohne Speicher." },
        {
          art: "details",
          titel: "Alle Methoden der Vorratskammer",
          inhalt: [
            { art: "text", md: "`neu Vorratskammer(name)` öffnet die Kammer mit diesem Namen – gibt es sie noch nicht, ist sie leer. Der Name besteht aus Kleinbuchstaben `a–z`, Ziffern und `-` (1–40 Zeichen), z. B. `\"pizza-imperium\"`; sonst gibt es eine `LaufzeitAnanas`. Optional kommt ein **Namensraum** dazu – `neu Vorratskammer(\"spielstand\", namensraum: \"pizza-imperium\")` (auch ohne `namensraum:` als zweites Argument; `karton` heißt „ohne“). Für ihn gelten dieselben Zeichenregeln, sonst `LaufzeitAnanas: Ungültiger Namensraum '…' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen).` Die **Kennung** der Kammer ist dann `raum/name` (`pizza-imperium/spielstand`) – so erscheint sie in der Textform `Vorratskammer(pizza-imperium/spielstand)` und in Fehlertexten. Zweimal `neu` mit derselben Kennung öffnet dieselbe Kammer; `neu Vorratskammer(\"a\")` und `neu Vorratskammer(\"a\", namensraum: \"x\")` sind zwei verschiedene. Wozu der Namensraum gut ist, steht unten unter *Ein Spielstand für alle Fassungen deines Spiels*." },
            tab([
              ["`lege(schlüssel, wert)`", "Legt `wert` ab (überschreibt) und speichert **sofort**; gibt die Kammer zurück (verkettbar)", "`v.lege(\"punkte\", 120)`"],
              ["`hole(schlüssel)`", "Gespeicherter Wert; fehlt er → `karton`", "`v.hole(\"punkte\")`"],
              ["`hole(schlüssel, ersatz)`", "Wie `hole`, aber `ersatz` statt `karton` – ideal für den allerersten Lauf", "`v.hole(\"leben\", 3)`"],
              ["`hat(schlüssel)`", "Gibt es den Eintrag?", "`v.hat(\"name\")`"],
              ["`entferne(schlüssel)`", "Entfernt den Eintrag, gibt den alten Wert zurück (oder `karton`)", "`v.entferne(\"punkte\")`"],
              ["`schlüssel()`", "Blech aller Schlüssel, in der Reihenfolge des ersten Ablegens", "`v.schlüssel()`"],
              ["`länge()`", "Anzahl Einträge", "`v.länge()`"],
              ["`leeren()`", "Räumt die ganze Kammer leer (z. B. für „Neues Spiel“)", "`v.leeren();`"],
              ["`name()`", "Name der Kammer (ohne Namensraum)", "`v.name()`"],
              ["`namensraum()`", "Namensraum der Kammer als Text – ohne Namensraum `karton`", "`v.namensraum()`"]
            ]),
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Vorratskammer v = neu Vorratskammer(\"spielstand\");",
                "v.lege(\"name\", \"Luigi\").lege(\"punkte\", 120).lege(\"pizzen\", [\"Margherita\", \"Funghi\"]);",
                "Bote.sage(v.schlüssel(), v.hole(\"leben\"), v.hole(\"leben\", 3));",
                "Blech<margherita> p = v.hole(\"pizzen\");",
                "p.hinzu(\"Diavolo\");             // ändert nur die Kopie",
                "Bote.sage(p, v.hole(\"pizzen\"));",
                "Bote.sage((v.entferne(\"punkte\") + \" Punkte entfernt, übrig: \" + v.länge()));"
              )
            },
            { art: "ausgabe", text: z("[name, punkte, pizzen] karton 3", "[Margherita, Funghi, Diavolo] [Margherita, Funghi]", "120 Punkte entfernt, übrig: 2") }
          ]
        },
        {
          art: "details",
          titel: "Ein Spielstand für alle Fassungen deines Spiels (Namensraum)",
          inhalt: [
            { art: "text", md: "Ohne Namensraum gehört eine Kammer dem **Tab**, in dem das Programm läuft: Ein Beispiel aus der Galerie hat einen anderen Stand als derselbe Code in deinem eigenen Tab. Das ist beim Ausprobieren genau richtig – aber nicht für ein Spiel, das du über Jahre weiterbaust: Du teilst Fassung 2 per App-Link, Fassung 3 öffnest du im Editor, und überall soll derselbe Spielstand weitergehen.\n\nDafür gibst du der Kammer einen **Namensraum**: `neu Vorratskammer(\"spielstand\", namensraum: \"pizza-imperium\")`. Damit erklärst du: „Das ist **ein** Spielstand, wo immer dieses Programm läuft.“ Im Playground teilen sich eigene Tabs, Beispiele, geteilte Tabs und App-Links jeder Fassung den Eintrag `pizza.vorrat.pizza-imperium/spielstand` im Browser; heruntergeladenes Programm und Kommandozeile teilen sich die Datei `…/pizza/vorrat/pizza-imperium/spielstand.json`. Browser und Programm bleiben weiterhin getrennt. Mehrere Kammern desselben Spiels (`spielstand`, `erfolge`, `einstellungen`) bekommen einfach denselben Namensraum." },
            { art: "text", md: "**Umzug eines alten Spielstands:** Hat dein Spiel bisher ohne Namensraum gespeichert, öffnest du beide Kammern, kopierst die Einträge einmalig in die neue und leerst die alte. Im Beispiel-Tab findet das Programm so den Beispiel-Stand, im App-Link den echten – beide landen im gemeinsamen Raum. Dieser Block hat bewusst keinen „Backen“-Knopf: Der Namensraum `spiel` würde sonst in deinem echten Vorrat (`pizza.vorrat.spiel/stand`) landen. Du kannst ihn mit „In neuem Editor-Tab öffnen“ ansehen und anpassen (eigener Namensraum!). Die Ausgabe unten stammt aus einem Lauf mit vorgefüllter alter Kammer (`punkte = 120`); ohne alten Stand gäbe es nichts umzuziehen und statt `120` stünde dort `karton`:" },
            {
              art: "code",
              nurTest: true, // Doku-Test führt aus, aber kein „Backen“-Knopf (Namensraum würde den echten Vorrat berühren)
              tier: 1,
              vorrat: { spiel: [["punkte", 120]] },
              vorratErwartet: [{ name: "spiel/stand", schluessel: "punkte", wert: 120 }, { name: "spiel", schluessel: null, wert: null }],
              code: z(
                "Vorratskammer alt = neu Vorratskammer(\"spiel\");                        // bisher",
                "Vorratskammer stand = neu Vorratskammer(\"stand\", namensraum: \"spiel\"); // ab jetzt",
                "falls (stand.länge() == 0 && alt.länge() > 0) {",
                "  für (margherita k : alt.schlüssel()) { stand.lege(k, alt.hole(k)); }",
                "  alt.leeren();",
                "}",
                "Bote.sage(stand, stand.namensraum(), stand.name(), stand.hole(\"punkte\"), alt.länge());"
              )
            },
            { art: "ausgabe", text: "Vorratskammer(spiel/stand) spiel stand 120 0" },
            { art: "text", md: "Beim zweiten Lauf ist die alte Kammer leer, die Bedingung greift nicht mehr – der Umzug passiert nur einmal. Die leere alte Kammer kannst du später mit **„Vorrat löschen“** ganz entfernen." }
          ]
        },
        {
          art: "details",
          titel: "Was passt hinein?",
          inhalt: [
            { art: "text", md: "- **Schlüssel** sind Texte.\n- **Werte:** Zahlen, Texte, `ja`/`nein`, `karton` sowie Bleche und Speisekarten daraus (auch verschachtelt, Speisekarten mit Text-Schlüsseln). Dauern, Objekte, Funktionen, `NaN` und `Infinity` lassen sich nicht einlagern → `TypAnanas: '…' lässt sich nicht einlagern (…).`\n- **Kopien:** `lege` und `hole` kopieren den Wert. Änderst du danach ein geholtes Blech, ändert sich die Kammer nicht – erst wieder mit `lege`.\n- **Platz:** höchstens 1 MiB je Kammer und 2 MiB für alle Kammern eines Programms. Ist es voll, gibt es `LaufzeitAnanas: Die Vorratskammer '…' ist voll (Limit 1 MiB).` und die Änderung wird verworfen. Für Spielstände reicht das locker.\n- **Sofort gespeichert:** Jede Änderung (`lege`, `entferne`, `leeren`) wird sofort gesichert – auch wenn das Programm danach abstürzt oder abgebrochen wird." }
          ]
        },
        {
          art: "details",
          titel: "Wo liegt der Vorrat? Und wie wird man ihn los?",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Wo das Programm läuft", "Wo der Vorrat liegt"],
              zeilen: [
                ["Playground (ohne Namensraum)", "im Speicher deines Browsers (nur auf diesem Gerät, in diesem Browser). Die Kammer gehört dem **Tab**: Tabs, die du aus **Beispiele** oder dieser Doku öffnest, haben einen **eigenen** Spielstand – so verfälscht das Ausprobieren eines Beispiels nie den Stand deiner eigenen Programme."],
                ["Playground (mit Namensraum)", "ebenfalls im Speicher deines Browsers, als `pizza.vorrat.<raum>/<name>` – die Kammer gehört dem **Programm**: eigene Tabs, Beispiele, geteilte Tabs und App-Links jeder Fassung teilen sich diesen Stand."],
                ["Windows (`.exe`, Kommandozeile)", "als Datei `%APPDATA%\\pizza\\vorrat\\<name>.json`, mit Namensraum `%APPDATA%\\pizza\\vorrat\\<raum>\\<name>.json`"],
                ["Linux (Programm, Kommandozeile)", "als Datei `~/.local/share/pizza/vorrat/<name>.json` (bzw. unter `$XDG_DATA_HOME`), mit Namensraum `…/vorrat/<raum>/<name>.json`"]
              ]
            },
            { art: "text", md: "Playground und heruntergeladenes Programm verhalten sich gleich – nur der Speicherort ist ein anderer. Darum teilen sie sich auch **keinen** Spielstand (auch nicht mit Namensraum): Wer im Browser spielt und dann die `.exe` startet, fängt dort neu an. Heruntergeladenes Programm und Kommandozeile (`node bin/pizza.js`) nutzen dagegen **denselben** Ordner und damit denselben Stand." },
            { art: "text", md: "**Vorrat löschen:** Im Programm selbst mit `v.leeren()` – etwa hinter einem Knopf „Neues Spiel“. Von außen gibt es dafür überall denselben Befehl **„Vorrat löschen“**: im Playground in der Befehlspalette (`F1` → „Vorrat löschen“; Kammern mit Namensraum stehen dort als `raum/name`), beim heruntergeladenen Programm und in der Kommandozeile als `--vorrat-loeschen <name>` bzw. `--vorrat-loeschen raum/name` (eine Kammer) oder `--vorrat-loeschen-alle` (alle – auch die Kammern in Namensraum-Ordnern). Die Rückmeldung lautet `Vorrat '<name>' gelöscht.`, `Vorrat '<name>' gibt es nicht.` bzw. `Alle Vorräte gelöscht.` – siehe *Kommandozeile & Programm-Optionen*. Einen Dialog zum Ansehen gibt es absichtlich nicht – der Vorrat gehört deinem Programm. In der Kommandozeile startet `--kein-vorrat` einen Lauf, der nichts liest und nichts speichert; `--vorrat=ordner` legt die Dateien in einen eigenen Ordner." },
            { art: "hinweis", ton: "info", md: "**W0101:** Kann nirgends gespeichert werden (z. B. in dieser Doku, in Tests oder mit `--kein-vorrat`), meldet pizza einmal `W0101: Keine Vorratskammer verfügbar – Zustand wird nicht gespeichert.` Die Kammer funktioniert dann trotzdem – nur eben bis zum Programmende." }
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
            "    preis.setzeText((\"Macht \" + (n * 8).währung(\"€\")));",
            "});",
            "theke.zeige(neu Stapel([preis, anzahl, backen]));",
            "theke.bediene();"
          )
        },
        { art: "text", md: "Tippt der Gast `2` und klickt **Backen!**, steht auf dem Schild `Macht 16,00 €`. Das Programm endet, wenn der Gast das Fenster schließt. Die Theke läuft in beiden Motoren gleich – im Interpreter und im Wasm-Motor (auch im heruntergeladenen Programm). Soll das Schild der Eingabe schon beim Tippen folgen, ganz ohne Knopf, bindest du es: `preis.binde(\"text\", () -> …)` – siehe *Zettel & Bindungen*." },
        {
          art: "details",
          titel: "Alle Zutaten",
          inhalt: [
            { art: "text", md: "Jedes Bauteil heißt **Zutat**. Alle Zutaten können `id()`, `sichtbar(ja/nein)`, `stil(schlüssel, wert)`, `animiere(art)` und `uebergang(ja/nein)` (siehe *Animationen* unten), `marke(text)` (ein Abzeichen am Reiter, siehe *Reiter*) sowie `binde(eigenschaft, fn)` und `bindeStil(schlüssel, fn)` – eine Eigenschaft oder ein Stil folgt dann einem Ausdruck (siehe *Zettel & Bindungen*). Die verändernden Methoden (`setzeText`, `aktiv`, `stil`, `sichtbar`, `beiKlick` …) geben die Zutat selbst zurück – du kannst sie also **verketten**: `neu Knopf(\"OK\").aktiv(nein).stil(\"farbe\", \"basilikum\")`. Ein erneutes `beiKlick`/`beiAenderung`/`beiTaste` **ersetzt** den alten Rückruf, `karton` entfernt ihn." },
            {
              art: "tabelle",
              kopf: ["Zutat", "Wozu", "Erzeugen", "Methoden"],
              zeilen: [
                ["`Theke`", "das Fenster", "`neu Theke(titel, breite: 480, hoehe: 360)`", "`zeige(zutat)`, `bediene()`, `schliesse()`, `setzeTitel(t)`, `schwebe(text, bei)`"],
                ["`Schild`", "Text zum Anzeigen", "`neu Schild(text)`", "`text()`, `setzeText(t)`"],
                ["`Knopf`", "Knopf zum Klicken", "`neu Knopf(text)` oder `neu Knopf(text, () -> { … })`", "`text()`, `setzeText(t)`, `beiKlick(fn)`, `aktiv(ja/nein)`"],
                ["`Eingabe`", "einzeiliges Textfeld", "`neu Eingabe(wert: \"\", platzhalter: \"\")`", "`wert()`, `setzeWert(t)`, `beiAenderung(fn)` (bekommt den Text), `beiEnter(fn)`"],
                ["`Haken`", "Ankreuzfeld", "`neu Haken(text, an: nein)`", "`an()`, `setzeAn(ja/nein)`, `beiAenderung(fn)` (bekommt `ja`/`nein`)"],
                ["`Stapel`", "Zutaten untereinander", "`neu Stapel([a, b, c])`", "`hinzu(zutat)`, `leeren()`"],
                ["`Reihe`", "Zutaten nebeneinander", "`neu Reihe([a, b, c])`", "`hinzu(zutat)`, `leeren()`"],
                ["`Abschnitt`", "Stapel mit Überschrift, auf Wunsch zuklappbar", "`neu Abschnitt(\"Karte\", [a, b])`", "wie `Stapel`, dazu `titel()`, `setzeTitel(t)`, `klappbar(ja)` (der Gast darf am Kopf zu- und aufklappen), `zu(ja)`/`zu()` (Inhalt eingeklappt – geht auch ohne `klappbar`), `beiAenderung(fn)` (bekommt `ja`, wenn zugeklappt wurde)"],
                ["`Reiter`", "mehrere Seiten mit Reitern oben, eine ist sichtbar", "`neu Reiter([\"Ofen\", \"Karte\"], [seite1, seite2])`", "`waehle(n)` (ab 1), `gewaehlt()`, `beiAenderung(fn)` (bekommt die Seitennummer), `setzeTitel(n, t)`, `titel(n)`. Eine Seite mit `sichtbar(nein)` verliert ihren Reiter"],
                ["`Auswahl`", "Umschalter: genau eine Option ist gewählt", "`neu Auswahl([\"1×\", \"10×\", \"100×\", \"Max\"], gewaehlt: 1)`", "`waehle(n)` (ab 1), `gewaehlt()`, `optionen()`, `setzeOptionen(b)`, `beiAenderung(fn)` (bekommt die Nummer), `aktiv(ja/nein)`"],
                ["`Fortschritt`", "Fortschrittsbalken", "`neu Fortschritt(wert: 0, text: \"\")`", "`wert()`, `setzeWert(x)` (0 bis 1, wird begrenzt), `text()`, `setzeText(t)`"],
                ["`Tabelle`", "Tabelle zum Anzeigen", "`neu Tabelle(spalten, zeilen)`", "`spalten()`, `setzeSpalten(b)`, `zeilen()`, `setzeZeilen(b)` – Zellen erscheinen als Text"],
                ["`Takt`", "unsichtbarer Zeitgeber", "`neu Takt(1s, anzahl -> { … })`", "`aktiv(ja/nein)`, `intervall()`, `setzeIntervall(d)`, `beiTakt(fn)`"],
                ["`Tastatur`", "unsichtbar wie der Takt: meldet Tastendrücke im Fenster", "`neu Tastatur(taste -> { … })`", "`beiTaste(fn)` (bekommt den Tastennamen als Text), `aktiv(ja/nein)` – muss im gezeigten Baum liegen (siehe *Tasten, Umschalter, Klappen*)"],
                ["`Zettel`", "**keine Zutat**: ein beobachtbarer Wert, an den Zutaten ihre Eigenschaften binden", "`neu Zettel(wert)`", "`wert()`, `setze(w)` – siehe *Zettel & Bindungen*"]
              ]
            },
            { art: "text", md: "Stapel, Reihen, Abschnitte und Reiter lassen sich ineinander schachteln – so baust du jedes Layout aus Kästen. Jede Zutat kann außerdem einen **Hinweis** tragen: `knopf.hinweis(\"Lässt den Teig gehen\")` zeigt den Text, wenn der Gast mit der Maus darüber fährt; `hinweis()` liest ihn." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{ typ: "klick", id: "z4" }, { typ: "klick", id: "z4" }, { typ: "aenderung", id: "z6", wert: 2 }],
              code: z(
                "Theke theke = neu Theke(\"Pizzeria\");",
                "Fortschritt teig = neu Fortschritt(wert: 0.25, text: \"Teig geht …\");",
                "Tabelle karte = neu Tabelle([\"Pizza\", \"Preis\"], [[\"Margherita\", 8.währung(\"€\")], [\"Funghi\", 9.währung(\"€\")]]);",
                "Abschnitt preise = neu Abschnitt(\"Karte\", [karte]);",
                "Knopf warten = neu Knopf(\"Warten\", () -> { teig.setzeWert(teig.wert() + 0.5); });",
                "warten.hinweis(\"Lässt den Teig weiter gehen\");",
                "Reiter reiter = neu Reiter([\"Ofen\", \"Karte\"], [neu Stapel([teig, warten]), preise]);",
                "reiter.beiAenderung(n -> { Bote.sage((\"Seite \" + n)); });",
                "theke.zeige(reiter);",
                "theke.bediene();",
                "Bote.sage((\"Teig: \" + teig.wert() + \", Seite \" + reiter.gewaehlt()));"
              )
            },
            { art: "ausgabe", text: z("Seite 2", "Teig: 1, Seite 2") },
            { art: "text", md: "Der Gast klickt zweimal auf **Warten** (der Balken bleibt bei 1 = voll stehen) und wechselt dann auf den Reiter **Karte**." }
          ]
        },
        {
          art: "details",
          titel: "Fehlt etwas oder ist es karton?",
          inhalt: [
            { art: "text", md: "Merksatz: **Was immer angezeigt wird, nimmt jeden Wert als Text – auch `karton`. Was man weglassen kann, lässt `karton` weg.** Der Text eines `Schild`s, `Knopf`s oder `Haken`s, der Wert einer `Eingabe` und der Titel von `Theke` und `Abschnitt` werden angezeigt: `karton` erscheint dort als Wort „karton“. Fehlt das Argument ganz, bleibt beim Erzeugen der Text leer. Der Text eines `Fortschritt`s (und `platzhalter` und `hinweis`) ist dagegen optional: `karton` heißt dort „nichts anzeigen“." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Schild a = neu Schild(karton);",
                "Schild b = neu Schild();",
                "Fortschritt f = neu Fortschritt(wert: 0.5, text: \"halb\");",
                "f.setzeText(karton);",
                "Bote.sage((\"[\" + a.text() + \"]\"));",
                "Bote.sage((\"[\" + b.text() + \"]\"));",
                "Bote.sage((\"[\" + f.text() + \"]\"));"
              )
            },
            { art: "ausgabe", text: z("[karton]", "[]", "[]") }
          ]
        },
        {
          art: "details",
          titel: "Zettel & Bindungen – die Theke folgt dem Zustand",
          inhalt: [
            { art: "text", md: "Ein gutes Theke-Programm ändert seinen Zustand **nur in Rückrufen** – und was der Gast sieht, folgt diesem Zustand **von selbst**. Dafür gibt es den `Zettel` (ein Wert, der weiß, wer ihn liest) und `binde` (eine Eigenschaft, die einem Ausdruck folgt). Der `Takt` ist dann nur noch für die Simulation da – nicht fürs Zeichnen." },
            { art: "text", md: "**Vorher – so sah es bis v4 aus:** Ein `zeichne()` setzt nach jedem Klick und jedem Takt alle Schilder und Knöpfe neu. Das funktioniert, aber jeder Rückruf muss daran denken, `zeichne()` zu rufen, und `zeichne()` muss alles kennen, was auf der Theke liegt." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{ typ: "takt", id: "backofen", anzahl: 1 }, { typ: "klick", id: "verkaufen" }, { typ: "klick", id: "verkaufen" }, { typ: "takt", id: "backofen", anzahl: 2 }, { typ: "klick", id: "verkaufen" }],
              uiErwartet: [
                { v: 1, op: "fenster", titel: "Pizzeria", breite: 480, hoehe: 360 },
                { v: 1, op: "baum", wurzel: { id: "z1", art: "stapel", kinder: [{ id: "lager", art: "schild", text: "Im Lager: 0" }, { id: "kasse", art: "schild", text: "0,00 €" }, { id: "verkaufen", art: "knopf", text: "Verkaufen", aktiv: false }, { id: "backofen", art: "takt", intervall: 1000 }] } },
                { v: 1, op: "aendere", aenderungen: [{ id: "lager", text: "Im Lager: 1" }, { id: "verkaufen", aktiv: true }] },
                { v: 1, op: "aendere", aenderungen: [{ id: "lager", text: "Im Lager: 0" }, { id: "kasse", text: "8,00 €" }, { id: "verkaufen", aktiv: false }] },
                { v: 1, op: "aendere", aenderungen: [{ id: "lager", text: "Im Lager: 2" }, { id: "verkaufen", aktiv: true }] },
                { v: 1, op: "aendere", aenderungen: [{ id: "lager", text: "Im Lager: 1" }, { id: "kasse", text: "16,00 €" }] }
              ],
              code: z(
                "Theke theke = neu Theke(\"Pizzeria\");",
                "salami pizzen = 0;",
                "salami geld = 0;",
                "Schild lager = neu Schild(id: \"lager\");",
                "Schild kasse = neu Schild(id: \"kasse\");",
                "Knopf verkaufen = neu Knopf(\"Verkaufen\", id: \"verkaufen\");",
                "Takt backofen = neu Takt(1s, id: \"backofen\");",
                "leer zeichne() {",
                "    lager.setzeText((\"Im Lager: \" + pizzen));",
                "    kasse.setzeText(geld.währung(\"€\"));",
                "    verkaufen.aktiv(pizzen > 0);",
                "}",
                "backofen.beiTakt(anzahl -> { pizzen += anzahl; zeichne(); });",
                "verkaufen.beiKlick(() -> { pizzen--; geld += 8; zeichne(); });",
                "zeichne();",
                "theke.zeige(neu Stapel([lager, kasse, verkaufen, backofen]));",
                "theke.bediene();",
                "Bote.sage((pizzen + \" Pizzen übrig, \" + geld.währung(\"€\") + \" in der Kasse\"));"
              )
            },
            { art: "ausgabe", text: "1 Pizzen übrig, 16,00 € in der Kasse" },
            { art: "text", md: "**Nachher – mit `Zettel` und `binde`:** Die beiden Zahlen liegen auf Zetteln. Jedes Schild und der Knopf **binden** ihre Eigenschaft einmal beim Aufbau an einen Ausdruck; die Rückrufe ändern nur noch die Zettel. Kein `zeichne()`, keine Merkvariable, kein Vergleich von Hand." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{ typ: "takt", id: "backofen", anzahl: 1 }, { typ: "klick", id: "verkaufen" }, { typ: "klick", id: "verkaufen" }, { typ: "takt", id: "backofen", anzahl: 2 }, { typ: "klick", id: "verkaufen" }],
              uiErwartet: [
                { v: 1, op: "fenster", titel: "Pizzeria", breite: 480, hoehe: 360 },
                { v: 1, op: "baum", wurzel: { id: "z1", art: "stapel", kinder: [{ id: "lager", art: "schild", text: "Im Lager: 0" }, { id: "kasse", art: "schild", text: "0,00 €" }, { id: "verkaufen", art: "knopf", text: "Verkaufen", aktiv: false }, { id: "backofen", art: "takt", intervall: 1000 }] } },
                { v: 1, op: "aendere", aenderungen: [{ id: "lager", text: "Im Lager: 1" }, { id: "verkaufen", aktiv: true }] },
                { v: 1, op: "aendere", aenderungen: [{ id: "lager", text: "Im Lager: 0" }, { id: "kasse", text: "8,00 €" }, { id: "verkaufen", aktiv: false }] },
                { v: 1, op: "aendere", aenderungen: [{ id: "lager", text: "Im Lager: 2" }, { id: "verkaufen", aktiv: true }] },
                { v: 1, op: "aendere", aenderungen: [{ id: "lager", text: "Im Lager: 1" }, { id: "kasse", text: "16,00 €" }] }
              ],
              code: z(
                "Theke theke = neu Theke(\"Pizzeria\");",
                "Zettel pizzen = neu Zettel(0);",
                "Zettel geld = neu Zettel(0);",
                "Schild lager = neu Schild(id: \"lager\");",
                "lager.binde(\"text\", () -> (\"Im Lager: \" + pizzen.wert()));",
                "Schild kasse = neu Schild(id: \"kasse\");",
                "kasse.binde(\"text\", () -> geld.wert().währung(\"€\"));",
                "Knopf verkaufen = neu Knopf(\"Verkaufen\", id: \"verkaufen\");",
                "verkaufen.binde(\"aktiv\", () -> pizzen.wert() > 0);",
                "verkaufen.beiKlick(() -> { pizzen.setze(pizzen.wert() - 1); geld.setze(geld.wert() + 8); });",
                "Takt backofen = neu Takt(1s, anzahl -> { pizzen.setze(pizzen.wert() + anzahl); }, id: \"backofen\");",
                "theke.zeige(neu Stapel([lager, kasse, verkaufen, backofen]));",
                "theke.bediene();",
                "Bote.sage((pizzen.wert() + \" Pizzen übrig, \" + geld.wert().währung(\"€\") + \" in der Kasse\"));"
              )
            },
            { art: "ausgabe", text: "1 Pizzen übrig, 16,00 € in der Kasse" },
            { art: "text", md: "Der Ofen tickt einmal (1 Pizza, der Knopf wird aktiv), der Gast verkauft (0 Pizzen, 8 €, Knopf aus), klickt noch einmal ins Leere (ein Klick auf einen inaktiven Knopf wird ignoriert), der Ofen holt zwei Schläge nach, ein letzter Verkauf. Beide Fassungen schicken **genau dieselben Nachrichten** ans Fenster – die Theke sendet nur, was sich wirklich ändert. Der Unterschied steckt im Programm: Die zweite Fassung weiß an einer Stelle, *wie* etwas angezeigt wird, und an einer anderen, *wann* sich etwas ändert." },
            { art: "text", md: "**Die Bausteine:**" },
            {
              art: "tabelle",
              kopf: ["Baustein", "Was er tut"],
              zeilen: [
                ["`neu Zettel(wert)`", "ein beobachtbarer Wert – keine Zutat, wird nicht gezeigt. Ohne Argument steht `karton` drauf. Textform `Zettel(5)`."],
                ["`zettel.wert()`", "liest den Wert. Innerhalb einer Bindung merkt sich die Theke: *Diese Bindung hängt an diesem Zettel.*"],
                ["`zettel.setze(w)`", "schreibt den Wert. Ist er **ungleich** dem alten (wie `==`), werden alle Bindungen, die den Zettel gelesen haben, neu gerechnet. Gibt den Zettel zurück."],
                ["`Zettel.aus(fn)`", "ein **abgeleiteter** Zettel: sein Wert ist das Ergebnis von `fn` (Funktion ohne Parameter) und wird nur neu gerechnet, wenn sich eine gelesene Quelle ändert – wie eine Bindung, nur ohne Zutat. `setze` ist verboten (er hat schon einen Schreiber). Siehe *Abgeleitete Zettel* unten."],
                ["`zutat.binde(eigenschaft, fn)`", "bindet eine Eigenschaft (`\"text\"`, `\"aktiv\"`, `\"wert\"`, `\"an\"`, `\"sichtbar\"`, `\"hinweis\"` …) an eine Funktion ohne Parameter. Wird sofort einmal ausgewertet; danach immer, wenn sich eine gelesene Quelle ändert. Gibt die Zutat zurück (verkettbar)."],
                ["`zutat.bindeStil(schlüssel, fn)`", "dasselbe für einen Stil (`\"farbe\"`, `\"breite\"`, `\"zeilen\"` …). Liefert `fn` `karton`, wird der Stil entfernt."],
                ["`binde(eigenschaft, karton)`, `bindeStil(schlüssel, karton)`", "löst die Bindung – danach darf die Eigenschaft wieder von Hand gesetzt werden. Ein erneutes `binde` derselben Eigenschaft ersetzt die alte Bindung."]
              ]
            },
            { art: "text", md: "**Bindbar sind:** `Schild` `text`; `Knopf` `text`, `aktiv`; `Eingabe` `wert`; `Haken` `text`, `an`; `Takt` `aktiv`, `intervall`; `Fortschritt` `wert`, `text`; `Abschnitt` `titel`, `klappbar`, `zu`; `Tabelle` `spalten`, `zeilen`; `Reiter` `gewaehlt`; `Auswahl` `optionen`, `gewaehlt`, `aktiv`; `Tastatur` `aktiv` – und bei **jeder** Zutat `sichtbar`, `hinweis` und `marke`. Alle Stile gehen über `bindeStil`. Die Kinder eines Stapels sind nicht bindbar: Listen bleiben bei `hinzu` und `leeren`. Etwas anderes ergibt `LaufzeitAnanas: 'farbe' lässt sich an Schild(z1) nicht binden. Bindbar: text, sichtbar, hinweis, marke.`; ohne Funktion `TypAnanas: binde() braucht eine Funktion, z. B. () -> { … }.`" },
            { art: "text", md: "**Quellen: Zettel *und* Zutaten.** Nicht nur `zettel.wert()` wird als Quelle gemerkt, sondern auch jeder **Getter einer Zutat**: `eingabe.wert()`, `haken.an()`, `knopf.aktiv()`, `reiter.gewaehlt()`, `abschnitt.zu()`, `schild.text()` … Tippt der Gast in eine Eingabe oder hakt er etwas an, rechnen alle Bindungen neu, die diesen Getter gelesen haben – ganz ohne `beiAenderung`. Der Pizzarechner braucht so keinen einzigen Rückruf mehr:" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{ typ: "aenderung", id: "anzahl", wert: "3" }, { typ: "aenderung", id: "familie", wert: true }, { typ: "aenderung", id: "anzahl", wert: "3" }],
              uiErwartet: [
                { v: 1, op: "fenster", titel: "Preis", breite: 480, hoehe: 360 },
                { v: 1, op: "baum", wurzel: { id: "z1", art: "stapel", kinder: [{ id: "anzahl", art: "eingabe", wert: "1" }, { id: "familie", art: "haken", text: "Familienpizza (+4 €)", an: false }, { id: "preis", art: "schild", text: "8,00 €" }] } },
                { v: 1, op: "aendere", aenderungen: [{ id: "preis", text: "24,00 €" }] },
                { v: 1, op: "aendere", aenderungen: [{ id: "preis", text: "36,00 €" }] }
              ],
              code: z(
                "Theke theke = neu Theke(\"Preis\");",
                "Eingabe anzahl = neu Eingabe(wert: \"1\", id: \"anzahl\");",
                "Haken familie = neu Haken(\"Familienpizza (+4 €)\", id: \"familie\");",
                "Schild preis = neu Schild(id: \"preis\");",
                "preis.binde(\"text\", () -> {",
                "    salami stueck = familie.an() ? 12 : 8;",
                "    serviere ((anzahl.wert().alsZahl() * stueck).währung(\"€\"));",
                "});",
                "theke.zeige(neu Stapel([anzahl, familie, preis]));",
                "theke.bediene();",
                "Bote.sage((\"Zum Schluss: \" + preis.text()));"
              )
            },
            { art: "ausgabe", text: "Zum Schluss: 36,00 €" },
            { art: "text", md: "Der Gast tippt `3` (24 €), hakt die Familienpizza an (36 €) und tippt noch einmal `3` – derselbe Wert, also keine Nachricht. Die Quellen werden bei **jeder** Auswertung neu gesammelt: Liest ein Ausdruck eine Quelle nur in einem `falls`-Zweig, hängt die Bindung nur dann an ihr. Was außerhalb einer Bindung gelesen wird, merkt sich niemand." },
            { art: "text", md: "**Die Regeln – kurz und in Nutzersprache:**\n\n- **Wann wird gerechnet?** Einmal **sofort beim `binde`** (danach liefert `schild.text()` schon den gebundenen Wert) – und sonst nur an den **Synchronisationspunkten**: nach jedem Rückruf, bevor `bediene()` wieder wartet, vor `zeige`, vor `schliesse` und am Programmende. Genau dann, wenn die Theke sowieso ihre Nachricht baut. Zwischenzustände in einem Rückruf sieht niemand; eine Bindung, die eine andere liest, folgt ihr am nächsten Synchronisationspunkt.\n- **Nur echte Änderungen.** Setzt eine Bindung oder ein Setter eine Eigenschaft auf **denselben** Wert, passiert nichts: keine Nachricht, keine Folgeberechnung. Das gilt seit v5 auch für `setzeText`, `aktiv(…)`, `stil(…)` & Co. – der frühere Satz „ein identischer Wert wird trotzdem gesendet“ gilt **nicht mehr**. Hand-Vergleiche wie `falls (neu != gezeigt)` kannst du streichen.\n- **Eine Bindung rechnet nur.** Im Ausdruck ist alles verboten, was Zustand ändert oder sendet: Setter wie `setzeText`, `hinzu`, `leeren`, `animiere`, `zeige`, `schliesse` und `zettel.setze` → `LaufzeitAnanas: Eine Bindung rechnet nur – 'setzeText' ist darin nicht erlaubt.` Getter, Rechnen, `Bote.sage`, eigene Methoden und `neu …` sind erlaubt. Wirft der Ausdruck, kommt die Ananas aus `binde()` bzw. aus `bediene()` wie bei einem Rückruf – fangbar mit `probier`, die Theke bleibt offen; was vorher schon berechnet war, geht noch ans Fenster.\n- **Eine Eigenschaft hat einen Schreiber.** Ist `text` gebunden, wirft `setzeText` → `LaufzeitAnanas: 'text' von Schild(z1) ist gebunden – setze den Zettel, nicht die Zutat.` Nur der **Gast** darf trotzdem schreiben: Tippt er in eine gebundene `Eingabe`, gilt sein Text, bis sich eine Quelle der Bindung ändert.\n- **Kreise.** Lesen zwei Bindungen einander und werden nie stabil, gibt die Theke nach 100 Durchläufen auf: `LaufzeitAnanas: Die Bindungen kommen nicht zur Ruhe – 'text' von Schild(z1) hängt von sich selbst ab.` Danach gelten alle Bindungen als beruhigt; erst die nächste Quellenänderung rechnet wieder. Ketten (A liest B, B liest einen Zettel) sind harmlos – sie konvergieren, weil nur echte Änderungen weitergegeben werden.\n- **Blech oder Objekt auf einem Zettel.** `setze` vergleicht Zahlen, Texte, `ja`/`nein`, `karton` und Dauern nach Wert, alles andere nach **Identität**. Ein Blech, das du mit `hinzu` veränderst, ist dasselbe Blech – `liste.setze(liste.wert())` ändert nichts. Setze stattdessen eine Kopie: `liste.setze(liste.wert().kopie())` – oder nimm den Taktgeber-Trick unten." },
            { art: "hinweis", ton: "info", md: "**W0103 – die Bindung, die nur einmal rechnet:** Liest ein Ausdruck bei seiner ersten Auswertung **weder Zettel noch Zutat-Getter** (etwa nur eine gewöhnliche Variable oder ein Blech), kann die Theke nie merken, dass sich etwas geändert hat – die Bindung wird nie wieder berechnet, und du bekommst `W0103: Die Bindung 'text' von Schild(z1) liest weder Zettel noch Zutat – sie rechnet nur einmal.` (bei Stilen: `Die Bindung Stil 'farbe' von …`). Typischer Fehler: `anzeige.binde(\"text\", () -> bestellungen.länge() + \" Bestellungen\")` mit einem gewöhnlichen `Blech` – Dein Rückruf ruft `hinzu`, das Schild bleibt bei 0. Ausweg für objektlastige Zustände: ein Zettel `stand` als **Taktgeber**." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{ typ: "klick", id: "neue" }, { typ: "klick", id: "neue" }],
              uiErwartet: [
                { v: 1, op: "fenster", titel: "Bestellungen", breite: 480, hoehe: 360 },
                { v: 1, op: "baum", wurzel: { id: "z1", art: "stapel", kinder: [{ id: "anzeige", art: "schild", text: "Bestellt (0): " }, { id: "neue", art: "knopf", text: "Salami bestellen" }] } },
                { v: 1, op: "aendere", aenderungen: [{ id: "anzeige", text: "Bestellt (1): Salami" }] },
                { v: 1, op: "aendere", aenderungen: [{ id: "anzeige", text: "Bestellt (2): Salami, Salami" }] }
              ],
              code: z(
                "Theke theke = neu Theke(\"Bestellungen\");",
                "Blech<margherita> bestellungen = [];",
                "Zettel stand = neu Zettel(0);",
                "Schild anzeige = neu Schild(id: \"anzeige\");",
                "anzeige.binde(\"text\", () -> {",
                "    stand.wert();                                   // Taktgeber lesen – sonst W0103",
                "    serviere ((\"Bestellt (\" + bestellungen.länge() + \"): \" + bestellungen.verbinde(\", \")));",
                "});",
                "Knopf neue = neu Knopf(\"Salami bestellen\", () -> {",
                "    bestellungen.hinzu(\"Salami\");                   // das Blech ändert sich in sich – kein Zettel merkt es",
                "    stand.setze(stand.wert() + 1);                  // darum: Taktgeber weiterdrehen",
                "}, id: \"neue\");",
                "theke.zeige(neu Stapel([anzeige, neue]));",
                "theke.bediene();",
                "Bote.sage((anzeige.text()));"
              )
            },
            { art: "ausgabe", text: "Bestellt (2): Salami, Salami" },
            { art: "text", md: "**Abgeleitete Zettel – eine Rechnung, viele Leser.** Hängen Text, `aktiv` und Balken einer Zutat an derselben (womöglich teuren) Rechnung, legst du die Rechnung auf einen **abgeleiteten Zettel**: `Zettel preis = Zettel.aus(() -> …);`. Er rechnet sofort einmal und danach nur, wenn sich eine seiner Quellen ändert – an denselben Synchronisationspunkten und nach denselben Regeln wie eine Bindung. Beliebig viele Bindungen (und andere abgeleitete Zettel) lesen ihn mit `preis.wert()`; die Rechnung läuft trotzdem nur **einmal** je Änderung. Ein Memo von Hand (`falls (takt == schonGerechnet) …`) brauchst du nicht mehr." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{ typ: "klick", id: "backen" }, { typ: "klick", id: "backen" }, { typ: "klick", id: "kaufen" }, { typ: "klick", id: "backen" }],
              uiErwartet: [
                {"v":1,"op":"fenster","titel":"Ofen-Upgrade","breite":480,"hoehe":360},
                {"v":1,"op":"baum","wurzel":{"id":"z1","art":"stapel","kinder":[{"id":"info","art":"schild","text":"Ofen Stufe 1 – 0,00 € in der Kasse"},{"id":"kaufen","art":"knopf","text":"Ausbauen für 10,00 €","aktiv":false},{"id":"balken","art":"fortschritt","wert":0},{"id":"backen","art":"knopf","text":"Backen +8 €"}]}},
                {"v":1,"op":"aendere","aenderungen":[{"id":"info","text":"Ofen Stufe 1 – 8,00 € in der Kasse"},{"id":"balken","wert":0.8}]},
                {"v":1,"op":"aendere","aenderungen":[{"id":"info","text":"Ofen Stufe 1 – 16,00 € in der Kasse"},{"id":"kaufen","aktiv":true},{"id":"balken","wert":1}]},
                {"v":1,"op":"aendere","aenderungen":[{"id":"info","text":"Ofen Stufe 2 – 6,00 € in der Kasse"},{"id":"kaufen","text":"Ausbauen für 40,00 €","aktiv":false},{"id":"balken","wert":0.15}]},
                {"v":1,"op":"aendere","aenderungen":[{"id":"info","text":"Ofen Stufe 2 – 14,00 € in der Kasse"},{"id":"balken","wert":0.35}]}
              ],
              code: z(
                "Theke theke = neu Theke(\"Ofen-Upgrade\");",
                "Zettel geld = neu Zettel(0);",
                "Zettel stufe = neu Zettel(1);",
                "Zettel preis = Zettel.aus(() -> 10 * stufe.wert() * stufe.wert());   // eine Rechnung für alle drei",
                "Schild info = neu Schild(id: \"info\");",
                "info.binde(\"text\", () -> (\"Ofen Stufe \" + stufe.wert() + \" – \" + geld.wert().währung(\"€\") + \" in der Kasse\"));",
                "Knopf kaufen = neu Knopf(\"\", id: \"kaufen\");",
                "kaufen.binde(\"text\", () -> (\"Ausbauen für \" + preis.wert().währung(\"€\")));",
                "kaufen.binde(\"aktiv\", () -> geld.wert() >= preis.wert());",
                "kaufen.beiKlick(() -> { geld.setze(geld.wert() - preis.wert()); stufe.setze(stufe.wert() + 1); });",
                "Fortschritt balken = neu Fortschritt(id: \"balken\");",
                "balken.binde(\"wert\", () -> geld.wert() / preis.wert());",
                "Knopf backen = neu Knopf(\"Backen +8 €\", () -> { geld.setze(geld.wert() + 8); }, id: \"backen\");",
                "theke.zeige(neu Stapel([info, kaufen, balken, backen]));",
                "theke.bediene();",
                "Bote.sage((\"Stufe \" + stufe.wert() + \", nächster Ausbau \" + preis.wert().währung(\"€\")));"
              )
            },
            { art: "ausgabe", text: "Stufe 2, nächster Ausbau 40,00 €" },
            { art: "text", md: "Zweimal backen (16 €, der Ausbau für 10 € wird möglich), ausbauen (Stufe 2, 6 € übrig – der Preis springt auf 40 €, Knopftext und Balken folgen), noch einmal backen. `preis` rechnet dabei genau zweimal: beim Erzeugen und nach dem Ausbau.\n\n- **Wann?** Wie eine Bindung: sofort beim `Zettel.aus`, danach an den Synchronisationspunkten. **Im selben Rückruf** liefert `preis.wert()` nach `stufe.setze(…)` noch den alten Preis (wie `schild.text()` einer gebundenen Zutat) – rechne dort mit den Quellen selbst. Ohne `zeige`/`bediene` gibt es keine Synchronisationspunkte; dann rechnet er nur beim Erzeugen.\n- **Gleich bleibt gleich:** Liefert `fn` denselben Wert (wie `==`), merkt niemand etwas. Ein **neues Blech** je Rechnung ist aber immer „anders“ (Identität) – die Leser rechnen dann jedes Mal mit; die Theke sendet trotzdem nur echte Änderungen.\n- **Er rechnet nur:** `fn` darf nichts ändern (wie eine Bindung), `preis.setze(…)` wirft `LaufzeitAnanas: Der Zettel ist abgeleitet – setze seine Quellen, nicht ihn.`, `Zettel.aus` in einer Bindung wirft `Eine Bindung rechnet nur – 'aus' ist darin nicht erlaubt.` Liest `fn` keine Quelle, gibt es `W0103: Der abgeleitete Zettel liest weder Zettel noch Zutat – er rechnet nur einmal.`; kreisen abgeleitete Zettel ohne Ruhe, heißt es nach 100 Durchläufen `Die Bindungen kommen nicht zur Ruhe – ein abgeleiteter Zettel hängt von sich selbst ab.`" },
            { art: "text", md: "**So stellst du ein `zeichne()`-Programm um – in fünf Schritten:**\n\n1. Jede angezeigte Größe auf einen `Zettel` legen – oder sie direkt aus Zutat-Gettern ableiten (`anzahl.wert()`, `haken.an()`).\n2. Jeden `setzeText`-, `aktiv`- und `stil`-Aufruf in `zeichne()` durch ein `binde`/`bindeStil` beim Aufbau ersetzen – in derselben Reihenfolge.\n3. Rückrufe ändern nur noch Zettel und Zustand; der Aufruf `zeichne()` fliegt raus.\n4. „gezeigt“-Merkvariablen und Vergleiche von Hand streichen – die Theke sendet ohnehin nur echte Änderungen.\n5. Der `Takt` ruft nur noch die Simulation (`pizzen.setze(pizzen.wert() + anzahl)`), nie das Zeichnen.\n\nSo umgestellt sind in den Beispielen der **Ofen-Timer** (Zettel `timer`, Anzeige und Knöpfe gebunden) und der **Pizzarechner** (Text und Farbe des Preis-Schilds hängen direkt an der Eingabe und den Haken). Ein `Zettel` ohne Theke ist übrigens eine ganz gewöhnliche Schachtel – `wert()` und `setze()` funktionieren auch in einem Konsolenprogramm, nur beobachtet ihn dann niemand." }
          ]
        },
        {
          art: "details",
          titel: "Takt: die Theke tickt",
          inhalt: [
            { art: "text", md: "Ein `Takt` ist eine unsichtbare Zutat, die regelmäßig ihren Rückruf aufruft – für Uhren, Animationen und Idle-Spiele. Er läuft nur, solange er im **gezeigten** Baum liegt und `aktiv` ist; leg ihn einfach mit in einen Stapel. Der Takt treibt die **Simulation** an – was angezeigt wird, folgt dem Zustand über Bindungen (siehe *Zettel & Bindungen*).\n\n- Das Intervall ist eine Dauer von **mindestens 100 ms** (sonst `LaufzeitAnanas: Ein Takt braucht mindestens 100ms, nicht 50ms.`).\n- Der Rückruf bekommt `anzahl`: wie viele Takte seit dem letzten Aufruf vergangen sind. Normal ist das 1; war der Rechner kurz beschäftigt, holt der Takt verpasste Schläge auf einmal nach. Rechne darum immer mit `anzahl`.\n- Der Takt misst **echte** Zeit, nicht die simulierte Uhr – `Uhr.vorspulen` beschleunigt ihn nicht.\n- `aktiv(nein)` hält ihn an, `setzeIntervall(d)` ändert das Tempo." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{ typ: "takt", id: "z2", anzahl: 1 }, { typ: "takt", id: "z2", anzahl: 2 }],
              code: z(
                "Theke theke = neu Theke(\"Ofenuhr\");",
                "salami sekunden = 0;",
                "Schild anzeige = neu Schild(\"0 s\").stil(\"schrift\", \"riesig\");",
                "Takt takt = neu Takt(1s, anzahl -> {",
                "    sekunden += anzahl;",
                "    anzeige.setzeText((sekunden + \" s\"));",
                "    falls (sekunden >= 3) { theke.schliesse(); }",
                "});",
                "theke.zeige(neu Stapel([anzeige, takt]));",
                "theke.bediene();",
                "Bote.sage((\"Fertig nach \" + sekunden + \" s\"));"
              )
            },
            { art: "ausgabe", text: "Fertig nach 3 s" },
            { art: "text", md: "Hier kamen ein Schlag mit `anzahl` 1 und einer mit 2 – zusammen 3 Sekunden. `schrift: \"riesig\"` macht die Anzeige extra groß." },
            { art: "text", md: "**Meldungen der Reihe nach:** Eine eingebaute „Meldung“ mit Warteschlange gibt es absichtlich nicht – wie lange eine Nachricht steht und wie viele warten dürfen, entscheidet dein Spiel. Die Bausteine hast du schon: ein `Schild` als Anzeige, ein `Blech` als Schlange, ein `Takt`, der alle zwei Sekunden die nächste Zeile holt, und `animiere(\"einblenden\")` für den Auftritt." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{ typ: "takt", id: "melder", anzahl: 1 }, { typ: "takt", id: "melder", anzahl: 1 }, { typ: "klick", id: "stern" }, { typ: "takt", id: "melder", anzahl: 1 }, { typ: "takt", id: "melder", anzahl: 1 }],
              code: z(
                "Theke theke = neu Theke(\"Pizzeria\");",
                "Blech<margherita> schlange = [\"Neuer Ofen!\", \"Luigi ist da.\"];",
                "salami gezeigt = 0;",
                "Schild meldung = neu Schild(\"\", id: \"meldung\");",
                "Knopf stern = neu Knopf(\"Stern verdienen\", id: \"stern\").beiKlick(() -> { schlange.hinzu(\"+1 Stern\"); });",
                "Takt melder = neu Takt(2s, id: \"melder\").beiTakt(anzahl -> {",
                "    falls (schlange.istLeer()) { theke.schliesse(); }   // im Spiel eher: meldung.setzeText(\"\")",
                "    sonst {",
                "        meldung.setzeText(schlange.erstes()).animiere(\"einblenden\");",
                "        schlange.entferne(1);",
                "        gezeigt++;",
                "    }",
                "});",
                "theke.zeige(neu Stapel([meldung, stern, melder]));",
                "theke.bediene();",
                "Bote.sage((gezeigt + \" Meldungen gezeigt, \" + schlange.länge() + \" übrig\"));"
              )
            },
            { art: "ausgabe", text: "3 Meldungen gezeigt, 0 übrig" },
            { art: "text", md: "Zwei Schläge zeigen die beiden vorbereiteten Meldungen, dann klickt der Gast auf **Stern verdienen**, der dritte Schlag zeigt „+1 Stern“, der vierte findet die Schlange leer. Willst du Gleiches zusammenfassen („+3 Sterne“) oder nur die letzten fünf behalten, ist das eine Zeile mehr in deinem Rückruf – genau darum ist es keine fertige Zutat." }
          ]
        },
        {
          art: "details",
          titel: "Tasten, Umschalter, Klappen",
          inhalt: [
            { art: "text", md: "Drei Zutaten für Spiele, die mehr sind als ein Knopf: Die **`Auswahl`** ist ein Umschalter, bei dem genau eine Option gewählt ist (`1× · 10× · 100×` statt drei Knöpfe); ein **klappbarer `Abschnitt`** räumt Erledigtes aus dem Blick; die **`Tastatur`** hört auf Tastendrücke im Fenster. Sie ist – wie der `Takt` – unsichtbar und muss trotzdem im gezeigten Baum liegen, also mit in den Stapel." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [
                { typ: "taste", id: "tasten", taste: "Leertaste" },
                { typ: "aenderung", id: "menge", wert: 2 },
                { typ: "taste", id: "tasten", taste: "Leertaste" },
                { typ: "taste", id: "tasten", taste: "a" },
                { typ: "aenderung", id: "hilfe", wert: true },
                { typ: "taste", id: "tasten", taste: "Enter" }
              ],
              code: z(
                "Theke theke = neu Theke(\"Pizzabäcker\");",
                "Blech<salami> schritte = [1, 10, 100];",
                "salami pizzen = 0;",
                "salami schritt = 1;",
                "Schild anzeige = neu Schild(\"0 Pizzen\", id: \"anzeige\").stil(\"schrift\", \"riesig\").stil(\"zeilen\", 1);",
                "Auswahl menge = neu Auswahl([\"1×\", \"10×\", \"100×\"], id: \"menge\");",
                "menge.beiAenderung(n -> { schritt = schritte.stück(n); });",
                "Abschnitt hilfe = neu Abschnitt(\"Hilfe\", [neu Schild(\"Leertaste backt, Enter macht Feierabend.\")], id: \"hilfe\").klappbar(ja);",
                "hilfe.beiAenderung(zu -> { Bote.sage((\"Hilfe zugeklappt: \" + zu)); });",
                "Tastatur tasten = neu Tastatur(id: \"tasten\");",
                "tasten.beiTaste(taste -> {",
                "    falls (taste == \"Leertaste\") { pizzen += schritt; anzeige.setzeText((pizzen + \" Pizzen\")); }",
                "    sonst falls (taste == \"Enter\") { theke.schliesse(); }",
                "});",
                "theke.zeige(neu Stapel([anzeige, menge, hilfe, tasten]));",
                "theke.bediene();",
                "Bote.sage((pizzen + \" Pizzen, Schritt \" + schritt + \", Option \" + menge.gewaehlt() + \", Hilfe zu: \" + hilfe.zu()));"
              )
            },
            { art: "ausgabe", text: z("Hilfe zugeklappt: ja", "11 Pizzen, Schritt 10, Option 2, Hilfe zu: ja") },
            { art: "text", md: "Der Gast drückt die Leertaste (1 Pizza), schaltet auf **10×**, drückt wieder Leertaste (11 Pizzen), tippt ein `a` (interessiert den Rückruf nicht), klappt die Hilfe zu und beendet mit **Enter**. In den Testereignissen sieht das so aus: `{\"typ\":\"taste\",\"id\":\"tasten\",\"taste\":\"Leertaste\"}`, `{\"typ\":\"aenderung\",\"id\":\"menge\",\"wert\":2}` und `{\"typ\":\"aenderung\",\"id\":\"hilfe\",\"wert\":true}` – beim Abschnitt ist `wert` der neue `zu`-Zustand." },
            { art: "text", md: "**Auswahl:** `neu Auswahl(optionen, gewaehlt: 1)` – die Optionen sind ein Blech, jeder Eintrag wird als Text gezeigt. `waehle(n)` und `gewaehlt()` zählen ab 1 wie beim Reiter; eine Nummer außerhalb ergibt `KeinStückAnanas: Option 7 gibt es nicht – die Auswahl hat 4 Optionen.` `setzeOptionen(b)` tauscht die Liste aus, die gewählte Nummer bleibt. Mit `aktiv(nein)` ist der Umschalter ausgegraut und Ereignisse werden ignoriert. Wie beim Haken ist der Zustand schon umgeschaltet, wenn dein Rückruf läuft – `menge.gewaehlt()` liefert darin bereits die neue Nummer." },
            { art: "text", md: "**Klappbarer Abschnitt:** `klappbar(ja)` macht den Kopf zum Knopf (Pfeil ▸/▾); `zu(ja)` klappt den Inhalt zu, auch ohne `klappbar` – dann steuert nur dein Programm. Klappt der Gast, kommt `beiAenderung(fn)` mit `ja` (zu) oder `nein` (offen); setzt dein Programm `zu(…)`, kommt nichts. Die Kinder eines zugeklappten Abschnitts liegen weiter auf der Theke (kein `W0102`), nur zeigt das Fenster eine Animation dort nicht. Mit `uebergang(ja)` am Abschnitt gleitet der Inhalt weich auf und zu." },
            { art: "text", md: "**Reiter:** `setzeTitel(n, text)` ändert die Beschriftung einer Seite (`reiter.setzeTitel(2, \"Karte •\")` für „hier gibt es Neues“), `titel(n)` liest sie. Eine Seite verschwindet samt Reiter mit `seite.sichtbar(nein)` – kein eigenes Kommando, dasselbe `sichtbar` wie überall. `gewaehlt()` bleibt dabei Programmzustand: Versteckst du die gewählte Seite, zeigt der Gast-Bildschirm ersatzweise die nächste sichtbare Seite dahinter (sonst die letzte davor), ohne dass ein Ereignis kommt – erst der nächste Klick auf einen Reiter meldet wieder eine echte Seitennummer. **Marke:** `seite.marke(\"⭐ 3\")` hängt ein kleines Abzeichen über den Reiter dieser Seite – es schwebt über der Ecke und schiebt keinen Reiter zur Seite, egal wie lang es ist oder wann es kommt (der Platz darüber ist immer frei). `marke(\"\")` oder `marke(karton)` nimmt es weg, `marke()` liest es. Am schönsten mit einer Bindung: `seite.binde(\"marke\", () -> (sterne.wert() > 0 ? \"⭐ \" + sterne.wert() : \"\"))`." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Stapel lager = neu Stapel([neu Schild(\"Noch zu.\")]);",
                "Reiter reiter = neu Reiter([\"Ofen\", \"Karte\", \"Lager\"], [neu Schild(\"Heiß!\"), neu Schild(\"Margherita 8 €\"), lager]);",
                "lager.sichtbar(nein);            // der Reiter „Lager“ verschwindet aus der Leiste",
                "reiter.waehle(3);                // erlaubt – der Gast sieht ersatzweise „Karte“",
                "reiter.setzeTitel(3, \"Lager • neu\");",
                "lager.marke(\"3\");                // Abzeichen über dem Reiter „Lager“",
                "Bote.sage((reiter.titel(3) + \" / gewählt: \" + reiter.gewaehlt() + \" / Marke: \" + lager.marke()));"
              )
            },
            { art: "ausgabe", text: "Lager • neu / gewählt: 3 / Marke: 3" },
            { art: "text", md: "**Tastatur:** `neu Tastatur(taste -> { … })` oder `beiTaste(fn)` – der Rückruf bekommt den Namen der Taste als Text. Ein Druck ist ein Ereignis: Hält der Gast die Taste gedrückt, kommt **keine** Wiederholung. Mehrere aktive Tastaturen im Baum bekommen jede Taste. Tasten, die der Gast in eine fokussierte `Eingabe` tippt, gehören dem Feld und erreichen die Tastatur nicht; eine Taste hat genau einen Empfänger: Nach einem Mausklick liegt der Fokus wieder auf der Theke, die Leertaste geht also an die Tastatur und klickt den Knopf nicht noch einmal; wer einen Knopf mit Tab ansteuert, löst ihn mit Leertaste/Enter aus, und die Tastatur bekommt diese Taste dann nicht. Im Playground gehen Tasten an die Theke, sobald der Gast einmal ins Vorschaufenster geklickt hat; was du im Editor tippst, bleibt im Editor." },
            {
              art: "tabelle",
              kopf: ["Taste", "Name im Rückruf"],
              zeilen: [
                ["Leertaste", "`\"Leertaste\"`"],
                ["Pfeiltasten", "`\"Links\"`, `\"Rechts\"`, `\"Hoch\"`, `\"Runter\"`"],
                ["Rücktaste, Entf", "`\"Rücktaste\"`, `\"Entfernen\"`"],
                ["Pos1, Ende, Bild ↑/↓", "`\"Pos1\"`, `\"Ende\"`, `\"BildHoch\"`, `\"BildRunter\"`"],
                ["Enter, Escape, Tab", "`\"Enter\"`, `\"Escape\"`, `\"Tab\"`"],
                ["Funktionstasten", "`\"F1\"` … `\"F12\"`"],
                ["Zeichen", "so, wie sie getippt werden: `\"a\"`, `\"A\"`, `\"1\"`, `\"+\"`, `\"ä\"` – Umschalt + a kommt also als `\"A\"`"],
                ["Umschalt, Strg, Alt, AltGr, Windows-Taste, Feststelltaste …", "kommen **nicht** allein an (nur ihre Wirkung auf Zeichen)"]
              ]
            }
          ]
        },
        {
          art: "details",
          titel: "Animationen: hüpfen, funkeln, schweben",
          inhalt: [
            { art: "text", md: "Ein bisschen Bewegung macht ein Spiel lebendig: Der Knopf hüpft, die Kasse pulsiert, über dem Knopf steigt „+1“ auf. Animationen sind **rein visuell** – sie ändern nichts am Ablauf deines Programms: kein Ereignis, keine Wartezeit, kein Einfluss auf Variablen oder Uhr. Ein hüpfender Knopf bleibt klickbar, und dein Programm macht genau dasselbe wie ohne Animation." },
            { art: "bild", src: "img/doku/re-animationen.svg", alt: "Sechs Kacheln: puls (ein Schild wird kurz größer, 400 ms), huepfen (ein Knopf springt hoch, 350 ms), wackeln (ein Knopf wackelt seitlich, 400 ms), funkeln (ein Schild leuchtet golden mit Funken, 800 ms), einblenden (eine neue Zeile erscheint von unten, 300 ms), aufpoppen (ein Erfolg springt aus klein auf volle Größe, 450 ms). Rechts steigt ein grünes +12 über einem Knopf auf und verblasst (schwebe, 1 s). Unten: rein visuell, kein Ereignis, keine Wartezeit, der Knopf bleibt klickbar.", unterschrift: "Sechs Arten für `animiere` und der Schwebetext von `schwebe` – mit ihren Standarddauern." },
            {
              art: "tabelle",
              kopf: ["Methode", "an", "Was passiert"],
              zeilen: [
                ["`animiere(art, dauer)`", "jeder Zutat", "spielt die Animation einmal ab; `dauer` ist freiwillig. Gibt die Zutat zurück (verkettbar)."],
                ["`schwebe(text, bei, farbe, dauer)`", "der `Theke`", "lässt `text` über der Zutat `bei` aufsteigen und verblassen – ohne `bei` in der Fenstermitte. `farbe` wie beim Stil (`tomate`, `basilikum`, `mozzarella`, `kruste`, `normal`). Nur `text` ist nötig; gibt die Theke zurück."],
                ["`uebergang(ja)`", "jeder Zutat", "schaltet weiches Ein- und Ausblenden ein: `sichtbar(…)` blendet über, und in `Stapel`, `Reihe` und `Abschnitt` blenden **neu hinzugefügte** Zutaten ein. `uebergang()` liest den Wert (Standard `nein`)."]
              ]
            },
            {
              art: "tabelle",
              kopf: ["Animation", "Wirkung", "Standarddauer"],
              zeilen: [
                ["`puls`", "kurz etwas größer, dann zurück – z. B. die Kasse nach einem Verkauf", "400 ms"],
                ["`huepfen`", "springt ein Stück hoch und landet wieder", "350 ms"],
                ["`wackeln`", "wackelt seitlich – „das geht gerade nicht“", "400 ms"],
                ["`funkeln`", "leuchtet golden mit ein paar Funken – für Glückstreffer", "800 ms"],
                ["`einblenden`", "erscheint sanft von unten – für neue Zeilen", "300 ms"],
                ["`aufpoppen`", "springt aus klein auf volle Größe – für Erfolge", "450 ms"],
                ["`schwebe`", "Text steigt auf und verblasst", "1 s"],
                ["`uebergang`", "weiches Ein- und Ausblenden", "200 ms"]
              ]
            },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{ typ: "klick", id: "z2" }, { typ: "klick", id: "z2" }, { typ: "klick", id: "z2" }],
              code: z(
                "Theke theke = neu Theke(\"Pizzeria\");",
                "salami pizzen = 0;",
                "Schild kasse = neu Schild(\"0 Pizzen\").stil(\"schrift\", \"gross\");",
                "Knopf backen = neu Knopf(\"Backen!\", () -> {",
                "    pizzen++;",
                "    kasse.setzeText((pizzen + \" Pizzen\")).animiere(\"puls\");",
                "    backen.animiere(\"huepfen\");",
                "    theke.schwebe(\"+1\", bei: backen, farbe: \"basilikum\");",
                "    falls (pizzen == 3) { kasse.animiere(\"funkeln\", 1s); }",
                "});",
                "theke.zeige(neu Stapel([kasse, backen]));",
                "theke.bediene();",
                "Bote.sage((\"Gebacken: \" + pizzen));"
              )
            },
            { art: "ausgabe", text: "Gebacken: 3" },
            { art: "text", md: "Bei jedem Klick pulsiert die Kasse, der Knopf hüpft, und ein grünes „+1“ schwebt über ihm hoch. Beim dritten Klick funkelt die Kasse eine Sekunde lang. Die Ausgabe ist dieselbe wie ganz ohne Animationen." },
            { art: "text", md: "**Regeln im Überblick:**\n\n- Die Art ist genau einer der sechs Namen oben (Groß-/Kleinschreibung zählt). Sonst: `LaufzeitAnanas: Animation 'tanzen' gibt es nicht. Erlaubt: puls, huepfen, wackeln, funkeln, einblenden, aufpoppen.`\n- `dauer` ist eine Dauer von **50 ms bis 5 s**. Zu kurz oder zu lang: `LaufzeitAnanas: Eine Animation dauert 50ms bis 5s, nicht 10s.` Eine Zahl statt einer Dauer: `TypAnanas: animiere(dauer: …) braucht eine Dauer, nicht 300.` Ohne `dauer` gilt die Standarddauer der Art.\n- Alle Parameter gehen auch benannt: `knopf.animiere(\"wackeln\", dauer: 200ms)`, `theke.schwebe(\"+12\", bei: knopf, farbe: \"basilikum\")`.\n- `bei` muss eine Zutat sein (sonst `TypAnanas: schwebe(bei: …) braucht eine Zutat, nicht 5.`), `farbe` einer der Farbwerte vom Stil.\n- Eine neue Animation an derselben Zutat ersetzt die laufende; mehrere Schwebetexte dürfen gleichzeitig steigen. Die anderen Zutaten verrutschen dabei nie.\n- Ein `Fortschritt` gleitet immer weich zum neuen Wert – dafür brauchst du kein `uebergang`." },
            { art: "hinweis", ton: "info", md: "**W0102:** Ist die Theke gerade nicht offen (noch nichts gezeigt oder schon geschlossen) oder liegt die Zutat nicht auf der gezeigten Theke, fällt die Animation einfach aus – mit einer Warnung statt eines Fehlers: `W0102: Animation entfällt – die Theke ist nicht offen.` bzw. `W0102: Animation entfällt – 'z3' liegt nicht auf der Theke.` Dein Programm läuft weiter; ein Spiel kann so nach dem Schließen des Fensters noch in Ruhe speichern. Falsche Argumente (unbekannte Art, Dauer außerhalb von 50 ms bis 5 s) sind dagegen immer eine Ananas." },
            { art: "text", md: "**Weiche Übergänge:** Mit `uebergang(ja)` an einem Stapel blendet jede neu hinzugefügte Zeile sanft ein; an einer Zutat blendet `sichtbar(ja)`/`sichtbar(nein)` über, statt hart umzuschalten." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{ typ: "klick", id: "z3" }, { typ: "klick", id: "z3" }, { typ: "klick", id: "z3" }, { typ: "klick", id: "z3" }, { typ: "klick", id: "z3" }],
              code: z(
                "Theke theke = neu Theke(\"Bestellungen\");",
                "Stapel liste = neu Stapel([]).uebergang(ja);",
                "Schild lob = neu Schild(\"Fünf Bestellungen!\").sichtbar(nein);",
                "salami n = 0;",
                "Knopf neue = neu Knopf(\"Neue Bestellung\", () -> {",
                "    n++;",
                "    liste.hinzu(neu Schild((\"Bestellung \" + n)));",
                "    falls (n == 5) { lob.sichtbar(ja).animiere(\"aufpoppen\"); }",
                "});",
                "theke.zeige(neu Stapel([neue, liste, lob]));",
                "theke.bediene();",
                "Bote.sage((n + \" Bestellungen, Übergang: \" + liste.uebergang()));"
              )
            },
            { art: "ausgabe", text: "5 Bestellungen, Übergang: ja" },
            { art: "text", md: "Jede neue Bestellung gleitet in die Liste; bei der fünften erscheint das Lob und poppt auf." },
            { art: "text", md: "**Weniger Bewegung:** Hast du im Betriebssystem „Animationen reduzieren“ bzw. „Bewegung reduzieren“ eingeschaltet, bewegt sich nichts: `puls`, `huepfen`, `wackeln`, `einblenden`, `aufpoppen` und `uebergang` entfallen, `funkeln` leuchtet nur ruhig, ein Schwebetext steht für seine Dauer still da (die Information bleibt), und ein `Fortschritt` springt direkt zum neuen Wert. Das gilt im Playground und im heruntergeladenen Programm gleich." }
          ]
        },
        {
          art: "details",
          titel: "Die Ereignisschleife: bediene()",
          inhalt: [
            { art: "text", md: "`theke.bediene()` ist der Pizzaiolo hinter der Theke: Er **wartet**, bis der Gast etwas tut, ruft den passenden Rückruf auf (`beiKlick`, `beiAenderung`, `beiEnter`, `beiTakt`, `beiTaste`) und wartet weiter. Erst wenn das Fenster geschlossen wird oder dein Code `theke.schliesse()` ruft, geht es nach `bediene()` weiter.\n\n- Vorher muss etwas gezeigt werden: `bediene()` ohne `zeige(…)` → `LaufzeitAnanas: Die Theke ist leer.`\n- Ein zweites `bediene()` nach dem Schließen kehrt sofort zurück.\n- Pro Programm gibt es **eine** Theke: ein zweites `neu Theke(…)` → `LaufzeitAnanas: Es gibt nur eine Theke pro Programm.`\n- Ein Klick auf einen Knopf mit `aktiv(nein)` wird einfach ignoriert – kein Rückruf, kein Fehler. Dasselbe gilt für Ereignisse, für die kein Rückruf eingetragen ist.\n- Ändert ein Rückruf mehrere Zutaten, sieht der Gast alles auf einmal, sobald der Rückruf fertig ist.\n- Wirft ein Rückruf eine Ananas, fliegt sie aus `bediene()` heraus – fang sie mit `probier` um `bediene()`.\n- Warten auf den Gast kostet keine Schritte und keine Zeit auf der simulierten Uhr (wie bei der `Bestellannahme`).\n- Das **Schrittlimit** (5 000 000, `P0002`) gilt für das Programm bis zum `bediene()` und danach **für jeden Rückruf neu**. Ein Spiel darf also stundenlang laufen und Tausende Klicks oder Takte verarbeiten – nur ein einzelner Rückruf, der sich in einer Endlosschleife verfängt, wird gestoppt. `Uhr.jetzt()` zählt dabei einfach weiter." },
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
                ["`senkrecht`", "`\"oben\"`, `\"mitte\"`, `\"unten\"`, `\"strecken\"` – die Lage quer zu einer `Reihe`: an der Reihe für **alle** Kinder (ohne Stil stehen sie mittig), an einer Zutat direkt in einer Reihe nur für sie selbst. `\"oben\"` macht zwei verschieden hohe Spalten oben bündig, `\"strecken\"` gleich hoch. Andere Zutaten ignorieren den Schlüssel."],
                ["`schrift`", "`\"klein\"`, `\"normal\"`, `\"gross\"`, `\"riesig\"`, `\"mono\"`"],
                ["`farbe`", "`\"tomate\"`, `\"basilikum\"`, `\"mozzarella\"`, `\"kruste\"`, `\"normal\"`"],
                ["`zeilen`", "ganze Zahl ≥ 1: die Zutat ist **genau** so viele Textzeilen hoch – auch bei kürzerem Text; längerer Text wird mit „…“ abgeschnitten. Wirkt auf den Text von `Schild`, `Knopf` und `Haken`, auf den Titel eines `Abschnitt`s und auf **jede Zelle** einer `Tabelle` (dann teilen sich die Spalten die Breite gleichmäßig – kein Text schiebt eine Spalte); andere Zutaten ignorieren den Schlüssel. Achtung: `stil(\"zeilen\", 1)` sind Textzeilen **je Zelle**, `tabelle.zeilen()` die Datenzeilen."],
                ["`mindestbreite`", "Pixel (Zahl ≥ 0): die Zutat wird nie schmaler als das, darf aber wachsen – damit Knöpfe stehen bleiben, wenn ihr Text sich ändert"],
                ["`spalten`", "nur `Tabelle`: Blech aus Zahlen > 0 – die **Gewichte** der Spalten. `[1, 6, 3]` teilt die Breite 10 % · 60 % · 30 %; fehlende Gewichte zählen 1, überzählige entfallen. Die Spalten stehen dann fest: langer Text bricht in der Zelle um (mit `zeilen` wird er abgeschnitten) und schiebt keine Spalte. Achtung, Namensgleichheit: `stil(\"spalten\", …)` sind Breiten, `tabelle.spalten()` die Überschriften."]
              ]
            },
            { art: "text", md: "`zeilen` und `mindestbreite` sorgen für ein **ruhiges Layout**: Ein `Schild` mit `stil(\"zeilen\", 2)` wackelt nicht, wenn die Meldung mal eine Zeile länger ist, und ein Kaufknopf mit `stil(\"mindestbreite\", 120)` springt nicht, wenn aus `9 €` plötzlich `1.250 €` wird. `stil(schlüssel, karton)` entfernt einen Stil wieder. Für feste Raster: Der Inhalt des Fensters ist **immer `breite − 40` Pixel** breit – mit und ohne Rollbalken (bei `breite: 860` also 820: zwei Spalten à 404 mit `abstand` 12 passen genau nebeneinander)." },
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
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [],
              uiErwartet: [
                {"v":1,"op":"fenster","titel":"Erfolge","breite":480,"hoehe":360},
                {"v":1,"op":"baum","wurzel":{"id":"erfolge","art":"tabelle","spalten":["","Erfolg","Ziel"],"zeilen":[["🍕","Erste Pizza","1 Pizza"],["🔥","Heißer Ofen","250 °C"]],"stil":{"spalten":[1,6,3]}}},
                {"v":1,"op":"schliesse"}
              ],
              code: z(
                "Theke theke = neu Theke(\"Erfolge\");",
                "Tabelle erfolge = neu Tabelle([\"\", \"Erfolg\", \"Ziel\"], [[\"🍕\", \"Erste Pizza\", \"1 Pizza\"], [\"🔥\", \"Heißer Ofen\", \"250 °C\"]], id: \"erfolge\");",
                "erfolge.stil(\"spalten\", [1, 6, 3]);      // Symbol schmal, Name breit, Ziel mittel",
                "theke.zeige(erfolge);",
                "Bote.sage((erfolge.zeilen().länge() + \" Erfolge\"));"
              )
            },
            { art: "ausgabe", text: "2 Erfolge" },
            { art: "text", md: "Unbekannte Schlüssel ergeben `LaufzeitAnanas: Stil 'x' gibt es nicht. Erlaubt: breite, hoehe, abstand, ausrichtung, schrift, farbe, zeilen, mindestbreite, senkrecht, spalten.`; unpassende Werte eine `LaufzeitAnanas` mit der Liste der erlaubten Werte (`Wert 'lila' ist für Stil 'farbe' nicht erlaubt. Erlaubt: …`) bzw. eine `TypAnanas` (`Stil 'zeilen' braucht eine ganze Zahl ≥ 1, nicht 0.`)." }
          ]
        },
        {
          art: "details",
          titel: "Wo erscheint das Fenster? (Playground, EXE, Linux, ohne Bildschirm, W0100)",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Wo", "Was der Gast sieht"],
              zeilen: [
                ["Playground", "ein schwebendes **Vorschaufenster** über dem Editor, bei jedem Lauf in der Größe `breite` × `hoehe` deines Programms (höchstens so groß wie das Browserfenster; ziehst du es während des Laufs größer, bleibt das bis zum Laufende); Schließen-Knopf = Fenster zu. Abbrechen (`Esc`) geht immer."],
                ["Windows (`.exe`)", "ein echtes Fenster, gezeichnet von der eingebauten WebView2 von Windows 10/11. Fehlt sie, bricht das Programm mit einer klaren Fehlermeldung ab (mit Link zum kostenlosen Download)."],
                ["Linux", "ein echtes Fenster; braucht die Bibliothek **WebKitGTK 4.1** auf dem Rechner (meist über den Paketmanager installierbar). Fehlt sie, gibt es eine klare Fehlermeldung."],
                ["Linux ohne Bildschirm (z. B. per SSH)", "kein Fenster möglich – das Programm bricht sofort mit einer verständlichen Meldung ab und bittet, es in einer grafischen Sitzung zu starten."]
              ]
            },
            { art: "text", md: "Das Fenster erscheint erst beim ersten `zeige(…)`. Programme ohne Theke bleiben reine Konsolenprogramme. Unter Windows startet eine `.exe` mit Theke **ohne Terminal** – siehe *Motoren & Programm herunterladen*. Was eine Plattform braucht, zeigt auch der Dialog **„Als Programm herunterladen“**." },
            { art: "text", md: "**Hell oder dunkel:** Im Playground folgt das Programmfenster dem Thema der Seite – standardmäßig dem deines Betriebssystems; schaltest du die Seite um, wechselt das Fenster mit. Im heruntergeladenen Programm folgt es dem Thema des Betriebssystems. Inhalt, Farben und Standardgröße (480 × 360) sind überall gleich." },
            { art: "text", md: "**Kein Fenster möglich?** Kann ein heruntergeladenes Programm (oder `pizza-host`) mit Theke sein Fenster nicht öffnen – kein Bildschirm, WebView2 oder WebKitGTK fehlt –, läuft es **nicht** blind weiter: Es schreibt eine verständliche Meldung und endet mit **Exit-Code 2**, noch bevor dein Code startet. Programme ohne Theke betrifft das nicht; sie laufen auch ohne Bildschirm." },
            { art: "hinweis", ton: "info", md: "**W0100:** Wo es grundsätzlich nie ein Fenster gibt – in Tests, in dieser Doku, in der Kommandozeile `node bin/pizza.js` oder wenn das Fenster absichtlich abgeschaltet ist (JSON-Modus, `--ui-ereignisse`, `PIZZA_THEKE=0`) –, meldet pizza nur `W0100: Keine Theke verfügbar – Fenster wird nicht angezeigt.`. `bediene()` kehrt dann sofort zurück, und das Programm läuft ganz normal weiter – das ist eine Warnung, kein Fehler." }
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
        { art: "kurz", md: "Alle 38 reservierten Wörter von pizza v3.1 auf einen Blick – mit dem passenden Java-Wort daneben." },
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
            ["`unten`", "super", "die Eltern-Klasse – die Basis liegt unten"],
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
            ["`hawaii`", "–", "kompiliert. Mehr sagen wir dazu nicht."]
          ]
        },
        { art: "text", md: "Dazu kommen die Typen der Pizza-Funktionen (`Teig<T>`, `Lieferung<T>`, `Zustellung<T>`, `Reste<T>`), die Theke-Zutaten und **deine eigenen Klassen** – jede Klasse ist auch ein Typ." },
        { art: "text", md: "**Eingebaute Funktionen und Objekte** – ebenfalls keine Keywords: `teig`, `bestelle`, `schieb`, `zwischenstand` sowie `Bote` (`sage`, `schreibe`, `fehler`, `leeren`), `Bestellannahme` (`lies`, `frage`, `liesZahl`, `frageZahl`, `hatMehr`), `Uhr`, `Mathe`, `Zufall` (auch `neu Zufall(saat)`), `Spiegel`, `Vorratskammer` – und für Fenster die Theke-Zutaten `Theke`, `Schild`, `Knopf`, `Eingabe`, `Haken`, `Stapel`, `Reihe`, `Abschnitt`, `Reiter`, `Fortschritt`, `Tabelle`, `Takt`, `Auswahl`, `Tastatur`. `auto` ist ein ganz gewöhnlicher Name." },
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
            ["`P0010`", "Eine Klasse `erbt`/`erfüllt` etwas, das es nicht gibt, oder erbt im Kreis („ein Teigknoten“).", "2"],
            ["`P0011`", "Eine `gebacken`e (finale) Klasse soll mit `erbt` erweitert werden.", "2"],
            ["`P0012`", "`abbrechen` oder `weiter` steht außerhalb einer Schleife – zum Beispiel direkt in einer Methode.", "2"],
            ["`K0001`", "„Klammerpflicht!“ – `serviere x;` statt `serviere (x);`.", "2"],
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
            ["`W0666`", "Typ `hawaii` im Quelltext (genau einmal pro Programm)", "„Der Pizzaiolo sagt nichts. Er schaut nur.“"],
            ["`T0007`", "`backen()` ohne vorheriges `gehenlassen()`", "„Das schmeckt flach.“"],
            ["`W0100`", "`theke.bediene()`, wo es nie ein Fenster gibt (Tests, Doku, `node bin/pizza.js`, `PIZZA_THEKE=0`) – ein heruntergeladenes Programm ohne möglichen Bildschirm bricht dagegen mit Exit 2 ab", "„Keine Theke verfügbar – Fenster wird nicht angezeigt.“"],
            ["`W0101`", "`neu Vorratskammer(…)`, aber es gibt keinen Speicher (einmal pro Programm)", "„Keine Vorratskammer verfügbar – Zustand wird nicht gespeichert.“"],
            ["`W0102`", "`animiere`/`schwebe`, aber die Theke ist nicht offen oder die Zutat liegt nicht auf ihr (je Aufrufstelle)", "„Animation entfällt – die Theke ist nicht offen.“"],
            ["`W0103`", "`binde`/`bindeStil` bzw. `Zettel.aus`, dessen Ausdruck bei der ersten Auswertung weder einen Zettel noch einen Zutat-Getter liest (je Aufrufstelle) – die Bindung bzw. der abgeleitete Zettel rechnet nie wieder", "„Die Bindung 'text' von Schild(z1) liest weder Zettel noch Zutat – sie rechnet nur einmal.“ bzw. „Der abgeleitete Zettel liest weder Zettel noch Zutat – er rechnet nur einmal.“"]
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
            "Teig<salami> t = teig(() -> (4));",
            "salami flach = t.backen();     // T0007",
            "Bote.sage((PiZZa + PizZa + \" / \" + flach));"
          )
        },
        { art: "ausgabe", text: "3 / 4" },
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
            { art: "text", md: "Und ein `Q0004` – drei Jahreszeiten sind keine Quattro Stagioni:" },
            {
              art: "code",
              ausfuehrbar: true,
              exitCode: 2,
              tier: 1,
              code: "quattrostagioni Jahreszeit { FRÜHLING, SOMMER, WINTER }"
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
            ["`2`", "PizzaFehler (Syntax, `R0001`, `Q0004`, `A0001`, `P0010`, `P0011`, `P0012`, `K0001` …) – das Programm startet gar nicht erst. Auch: ein `.pkarton`, das sich nicht laden lässt (`HOST`)."],
            ["`3`", "die Pizza ist noch im Ofen: Schrittlimit (`P0002`) erreicht"],
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
            ["`pizzabote`", "Paketmanager", "liefert Abhängigkeiten, z. B. `pizzabote hol extra-käse`"]
          ]
        },
        { art: "text", md: "**Compiler** – einzelne Dateien backen:" },
        {
          art: "code",
          sprache: "shell",
          ausfuehrbar: false,
          tier: 3,
          code: z(
            "$ pizzaiolo backe Pizzeria.pizza"
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
        { art: "hinweis", ton: "info", md: "Ebenfalls Tier 3: statische Prüfung von Generics und `wirft`-Klauseln sowie echte Parallelität bei `belege`, `teig` und `bestelle`. Der Interpreter parst all das, simuliert es aber nur. Für echte Parallelität gibt es die *Küchenbrigade* (`brigade`)." }
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
            { art: "text", md: "Der Knopf **„Als Programm herunterladen“** backt den Code des aktiven Tabs zu WebAssembly und packt ihn mit einem kleinen Host-Programm zusammen – direkt in deinem Browser, ohne Server. Heraus kommt eine Datei für die gewählte Plattform: unter Windows eine `.exe`, unter Linux eine ausführbare Datei ohne Endung. Beide können ein **Theke-Fenster** öffnen: Windows nutzt dafür die eingebaute WebView2, Linux braucht **WebKitGTK 4.1** (fehlt es, sagt das Programm das deutlich). Programm-Argumente schreibst du beim Start hinter den Namen: `./programm Luigi 3`." },
            {
              art: "tabelle",
              kopf: ["System", "So startest du es"],
              zeilen: [
                ["Windows", "Doppelklick oder in der Eingabeaufforderung starten. Konsolenprogramme öffnen beim Doppelklick ein Terminal, Programme mit Theke nur ihr Fenster. Die `.exe` ist nicht signiert: Zeigt **SmartScreen** „Der Computer wurde durch Windows geschützt“, klick auf *Weitere Informationen → Trotzdem ausführen*."],
                ["Linux", "Erst ausführbar machen, dann starten: `chmod +x programm && ./programm`"]
              ]
            },
            { art: "text", md: "Das Programm läuft im **Terminal**. `Bote.sage` schreibt dorthin, Fehler und – falls es so weit kommt – der Hawaii-Banner landen auf der Fehlerausgabe (*stderr*). Eingaben für die `Bestellannahme` tippst du direkt ein; **Strg+D** beendet die Eingabe (Windows: **Strg+Z**, dann Enter). Der Exit-Code des Programms ist derselbe wie im Playground. Der **Spielstand** (Vorratskammer) liegt in `%APPDATA%\pizza\vorrat` bzw. `$XDG_DATA_HOME/pizza/vorrat` (sonst `~/.local/share/pizza/vorrat`; Kammern mit Namensraum im Unterordner `<raum>/`) – derselbe Ordner wie bei `node bin/pizza.js`, Programm und Kommandozeile teilen sich also den Stand." },
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
          titel: "Windows: Programme mit Theke starten ohne Terminal",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Programm", "Doppelklick", "Aus einem Terminal gestartet"],
              zeilen: [
                ["mit Theke", "nur das Fenster, kein Terminal (Ausgaben von `Bote.sage` sieht man dann nicht)", "Ausgaben und Eingaben erscheinen im Terminal; Umleitungen wie `> datei` oder Pipes funktionieren"],
                ["ohne Theke", "öffnet wie gewohnt ein Terminal", "wie jedes Konsolenprogramm"]
              ]
            },
            { art: "text", md: "Ein Theke-Programm ist für Windows ein Fenster-Programm: Eine interaktive Eingabeaufforderung oder PowerShell **wartet nicht** darauf – der Prompt kommt sofort zurück, und `%ERRORLEVEL%`/`$LASTEXITCODE` sind noch leer. Wer warten und den Exit-Code haben will, startet es aus einer Batch-Datei, mit `start \"\" /wait programm.exe` (cmd) bzw. `Start-Process -Wait programm.exe` (PowerShell). Fehlt beim Start ohne Terminal etwas Wichtiges (z. B. WebView2), zeigt das Programm die Meldung in einem kleinen Fenster. Linux ist davon nicht betroffen." }
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
      id: "ref-kommandozeile",
      gruppe: REF,
      ordnung: 637,
      titel: "Kommandozeile & Programm-Optionen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Außerhalb des Browsers startest du pizza im Terminal: mit `node bin/pizza.js datei.pizza` aus dem Projekt oder direkt als heruntergeladenes Programm. Beide verstehen **dieselben Optionen** und zeigen dasselbe an wie der Playground." },
        {
          art: "code",
          sprache: "shell",
          ausfuehrbar: false,
          tier: 1,
          code: z(
            "$ node bin/pizza.js zahlenraten.pizza",
            "Saat: 3141592",
            "Wie heißt du? …",
            "$ node bin/pizza.js --saat=3141592 zahlenraten.pizza   # genau derselbe Lauf",
            "$ ./zahlenraten --saat=42 Luigi 3                     # Programm mit Argumenten"
          )
        },
        { art: "text", md: "Optionen stehen **vor** dem Dateinamen bzw. direkt hinter dem Programmnamen; alles danach sind Argumente für `hauptgang(args)`. Soll ein Argument selbst mit `--` beginnen, setzt du `--` als **Ende der Optionen** davor." },
        {
          art: "tabelle",
          kopf: ["Option", "Wirkung"],
          zeilen: [
            ["`--eingabe datei`", "Liest die Eingaben für die `Bestellannahme` zeilenweise aus `datei` statt von der Tastatur"],
            ["`--schritte=N`", "Schrittlimit setzen (Standard 5 000 000, siehe `P0002`)"],
            ["`--saat=N`", "Feste Zufalls-Saat. Ohne Option gibt es eine echte Saat, angezeigt als `Saat: N`"],
            ["`--vorrat=ordner`", "Vorratskammern in `ordner` statt im Standardordner ablegen"],
            ["`--kein-vorrat`", "Nichts lesen, nichts speichern – die Kammern leben nur im Speicher (Warnung `W0101`)"],
            ["`--vorrat-loeschen <kennung>`", "Löscht die Kammer `<name>` bzw. `raum/name` (mit Namensraum) und beendet sich (startet kein Programm)"],
            ["`--vorrat-loeschen-alle`", "Löscht alle Kammern – auch die in Namensraum-Ordnern – und beendet sich"],
            ["`--info`", "Am Ende Exit-Code, Schritte und Uhr ausgeben"],
            ["`--debug`", "Bei internen Fehlern zusätzlich technische Details zeigen (sonst nie)"],
            ["`--ast`", "Nur den Syntaxbaum ausgeben, nichts ausführen – für Neugierige"],
            ["`--hilfe`", "Kurze Übersicht aller Optionen"],
            ["`--version`", "Zeigt die Sprachversion (`pizza 3.1.0`; die EXE nennt sie hinter ihrem Namen)"],
            ["`--`", "Ende der Optionen: alles danach geht unverändert an `hauptgang(args)`"]
          ]
        },
        {
          art: "details",
          titel: "Ende der Optionen: --",
          inhalt: [
            {
              art: "code",
              sprache: "shell",
              ausfuehrbar: false,
              tier: 1,
              code: z(
                "$ node bin/pizza.js spiel.pizza -- --mein-arg      # args = [\"--mein-arg\"]",
                "$ ./spiel -- --saat=7 Luigi                        # args = [\"--saat=7\", \"Luigi\"]",
                "$ node bin/pizza.js --saat=42 -- --komisch.pizza   # Datei: --komisch.pizza"
              )
            },
            { art: "text", md: "Nur das **erste** `--` vor dem ersten Programmargument zählt und wird verbraucht; ein späteres `--` kommt als normales Argument bei `hauptgang` an. Steht `--` in der Kommandozeile **vor** dem Dateinamen, ist das nächste Argument die Datei – auch wenn es mit `--` beginnt. Das gilt für `node bin/pizza.js` und das heruntergeladene Programm gleichermaßen." }
          ]
        },
        {
          art: "details",
          titel: "Vorrat löschen: Meldungen",
          inhalt: [
            {
              art: "code",
              sprache: "shell",
              ausfuehrbar: false,
              tier: 1,
              code: z(
                "$ node bin/pizza.js --vorrat-loeschen pizza-imperium",
                "Vorrat 'pizza-imperium' gelöscht.",
                "$ node bin/pizza.js --vorrat-loeschen pizza-imperium",
                "Vorrat 'pizza-imperium' gibt es nicht.",
                "$ node bin/pizza.js --vorrat-loeschen pizza-imperium/spielstand   # Kammer mit Namensraum",
                "Vorrat 'pizza-imperium/spielstand' gelöscht.",
                "$ node bin/pizza.js --vorrat-loeschen-alle",
                "Alle Vorräte gelöscht."
              )
            },
            { art: "text", md: "Eine ungültige Kennung ergibt `Ungültiger Kammername '<kennung>' (erlaubt: a–z, 0–9, '-', 1–40 Zeichen, mit Namensraum 'raum/name').` mit Exit-Code 2. `--vorrat=ordner` lässt sich mit beiden Löschbefehlen kombinieren." }
          ]
        },
        {
          art: "details",
          titel: "Was im Terminal wohin geht",
          inhalt: [
            { art: "text", md: "- `Bote.sage`/`Bote.schreibe` → normale Ausgabe (*stdout*).\n- `Bote.fehler`, Warnungen, Fehler, der Hawaii-Banner und die Zeile `Saat: N` → Fehlerausgabe (*stderr*).\n- Warnungen und Fehler sehen überall gleich aus: `<Text> (Zeile Z, Spalte S)`.\n- Der Exit-Code ist der des Programms (`echo $?` bzw. `echo %ERRORLEVEL%`)." }
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
        { art: "text", md: "Jeden Code-Block dieser Doku und jedes Beispiel übernimmst du mit **„Im Editor öffnen“**. Ein Lauf darf so lange dauern, wie er will – gestoppt wird nur durch das Schrittlimit (`P0002`, 5 000 000 Schritte, Exit-Code 3) oder durch dich: **Esc** bzw. **Abbrechen**." },
        { art: "text", md: "**Argumente:** Im Playground gibt es das Feld **„Argumente“**. Was du dort einträgst, bekommt `hauptgang(Blech<margherita> args)` als Blech von Texten – genau wie beim Aufruf in der Kommandozeile oder beim heruntergeladenen Programm (`./programm Luigi 3`). Ohne Eintrag ist das Blech leer." },
        { art: "text", md: "**Zufall & Vorrat:** Oben in der Konsole steht bei jedem Lauf `Saat: N`; mit dem Häkchen **„feste Saat 42“** würfelt jeder Lauf gleich (siehe *Zufall*). Vorratskammern liegen im Speicher deines Browsers; Beispiel- und Doku-Tabs haben einen eigenen Spielstand – außer die Kammer trägt einen Namensraum, dann teilen alle Tabs denselben. Aufräumen: Befehlspalette (`F1`) → **„Vorrat löschen“** (siehe *Vorratskammer*)." },
        {
          art: "details",
          titel: "Code teilen",
          inhalt: [
            { art: "text", md: "Der Knopf **„Teilen“** erstellt einen Link zu deinem Skript. Dafür wird das Skript des aktiven Tabs **auf unserem Server gespeichert** – erst, wenn du im Dialog auf **„Link erstellen“** klickst. Wie lange der Link funktioniert, steht im Dialog. Jeder mit dem Link kann den Code lesen." },
            { art: "text", md: "Du bekommst **zwei Links** zum selben gespeicherten Skript, jeden mit eigenem Kopieren-Knopf; der App-Link landet gleich in der Zwischenablage. Der Name des Tabs wird mitgespeichert.\n\n- **App starten** (`…/#app=<key>`) – zeigt nur einen Ladebalken, übersetzt das Programm im Browser (Motor *Auto*) und startet es sofort im Vollbild: Eine Theke füllt das ganze Fenster, ein Konsolenprogramm bekommt eine Vollbild-Konsole mit Eingabe. Seitentitel ist der Tab-Name (eine Theke nimmt ihren Fenstertitel). Das dezente **×** oben rechts beendet eine Theke-App wie das Schließen des Programmfensters. Am Ende stehen die Ausgabe und die Knöpfe **„Nochmal“** und **„Code ansehen“** da. Der Spielstand (Vorratskammer) ist derselbe wie bei geteilten Tabs im Playground.\n- **Code öffnen** (`…/#h=<key>`) – öffnet das Skript im Playground in einem neuen Editor-Tab mit dem geteilten Namen." },
            { art: "hinweis", ton: "warnung", md: "Teile keine Passwörter oder anderen Geheimnisse – auch nicht als Kommentar im Code." }
          ]
        },
        { art: "hinweis", ton: "pizza", md: "Ausgeführt wird alles lokal in deinem Browser. Dein Code verlässt ihn nur, wenn du ihn selbst teilst – nicht einmal, wenn du `hawaii` schreibst." }
      ]
    }
  );
})();

/* pizza v3.1 – Doku: Herd (Spiele) (591–598) – Doku v2; Bilder he-*, Beispiele site/beispiele/herd/ */
(function () {
  "use strict";
  const ziel = typeof self !== "undefined" ? self : globalThis;
  const z = (...zeilen) => zeilen.join("\n");
  const HERD = "Herd (Spiele)";

  (ziel.PIZZA_DOKU = ziel.PIZZA_DOKU || []).push(
    {
      id: "herd",
      gruppe: HERD,
      ordnung: 591,
      titel: "Herd – Spiele bauen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Mit dem `Herd` baust du Spiele in 2D und 3D: Du legst **Teile** in eine Szene und gibst ihnen **Komponenten** – einen Kreis zum Zeichnen, eine Bewegung zum Fliegen, ein Licht zum Leuchten. Den Rest erledigt die Engine, 60-mal pro Sekunde. Im Playground erscheint das Spiel im Vorschaufenster, im heruntergeladenen Programm als eigenes Fenster." },
        { art: "bild", src: "img/doku/he-teil.svg", alt: "Ein Teil als Pizza: Es hat immer eine Lage und trägt Komponenten wie Kreis, Bewegung und Partikel als Belag. Das Programm hält nur einen Griff darauf; das Teil lebt in der Engine.", unterschrift: "Ein Teil = Lage + Komponenten. Dein Programm hält nur den Griff – gerechnet und gezeichnet wird in der Engine." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
          herdErwartet: [
            {"art":"fenster","titel":"Hallo Herd","breite":640,"hoehe":360},
            {"art":"bild","bildnummer":4,"szene":"bb0f775224d5be55","paket":"48f836cf54301c99"},
            {"art":"bild","bildnummer":8,"szene":"bab0526e87b56d55","paket":"9e29066dedd588ba"},
            {"art":"bild","bildnummer":12,"szene":"6edeb94789c674fe","paket":"785e19af1dd44ad9"}
          ],
          code: z(
            "Herd herd = neu Herd(\"Hallo Herd\");",
            "herd.hintergrund(\"ofen\");",
            "Teil ball = herd.kreis(320, 180, 16, farbe: \"tomate\");",
            "Bewegung flug = ball.mit(neu Bewegung(tempoX: 240, tempoY: 160));     // Pixel pro Sekunde",
            "herd.backe(() -> {",
            "    falls (ball.y() < 16 || ball.y() > 344) { flug.setzeTempoY(-flug.tempoY()); }",
            "    falls (ball.x() < 16 || ball.x() > 624) { flug.setzeTempoX(-flug.tempoX()); }",
            "});",
            "Bote.sage((\"Nach \" + herd.zeit() + \" s ist der Ball bei x = \" + ball.x()));"
          )
        },
        { art: "ausgabe", text: "Nach 0.2 s ist der Ball bei x = 368" },
        { art: "text", md: "Was passiert hier? `herd.kreis(…)` legt ein Teil mit einer Kreis-Komponente an, `mit(neu Bewegung(…))` hängt eine Bewegung dazu – ab jetzt fliegt der Ball **von selbst**. `herd.backe(fn)` öffnet das Fenster und startet die Spielschleife: In jedem **Takt** ruft sie deinen Rückruf auf, dann bewegt die Engine alles weiter und zeichnet ein Bild. Dein Rückruf entscheidet nur noch die Spielregeln – hier: am Rand abprallen. `backe` kehrt zurück, wenn das Fenster geschlossen wird (oder du `herd.schliesse()` rufst)." },
        {
          art: "details",
          titel: "Fertige Spiele zum Ausprobieren",
          inhalt: [
            { art: "text", md: "Unter **Beispiele → Herd (Spiele)** liegen zum Anschauen und Weiterbauen:\n\n- **Teigfänger** (2D): Fang mit deiner Pizza die Beläge vor dem Steinofen – aber keine Ananas! Pixel-Bildchen mit Animation, Funken und Spritzer als Partikel, Ebenen, eine wackelnde Ziegelwand.\n- **Teigball** (3D): Rolle eine Teigkugel über die Riesenpizza und sammle acht Beläge. Abendsonne mit Schatten, glühende Öfen, Nebel, eine weich folgende Kamera und ein HUD.\n- **Hallo Herd**, **Drehender Würfel** und **Steuerung** als kleine Lernbeispiele." },
            { art: "bild", src: "img/doku/he-teigfaenger.png", alt: "Teigfänger: Vor einem Steinofen mit Pixel-Flammen fallen Beläge herab, unten fängt eine Pizza auf einem Schieber sie auf. Oben links die Punkte, rechts drei Herzen.", unterschrift: "Teigfänger – das 2D-Spiel aus den Beispielen." }
          ]
        },
        {
          art: "details",
          titel: "Für Fortgeschrittene: Fenster, Tests und Gleichheit",
          inhalt: [
            { art: "text", md: "- **Ein Herd pro Programm.** `neu Herd(titel, breite: 640, hoehe: 360)` – das Spielfeld ist immer so groß, das Fenster darf größer sein (es wird seitentreu eingepasst). `herd.bildnummer()` zählt die Takte, `herd.zeit()` = Takte / 60 in Sekunden – nie die Wanduhr.\n- **Gleiche Eingaben, gleiches Spiel.** Der Zufall von pizza ist deterministisch, die Engine auch: Im Interpreter, als Wasm und in der EXE entsteht bitgleich dieselbe Szene. Tests spielen aufgenommene Takte ab (`.ereignisse`) und vergleichen Prüfsummen jedes Bildes (`.herd-erwartet`).\n- **Ohne Fenster** (z. B. in der Kommandozeile ohne Grafik) öffnet und schließt `backe` das Fenster sofort und warnt `W0104: Kein Herd verfügbar – Fenster wird nicht angezeigt.`\n- **Theke und Herd** gibt es nicht im selben Programm (`P0013`), Ton kommt später." },
            { art: "bild", src: "img/doku/he-schichten.svg", alt: "Drei Schichten: oben dein pizza-Programm, darunter der Herd-Kern mit Teilen und Komponenten, unten die Glut, die auf der Grafikkarte zeichnet.", unterschrift: "Programm → Herd-Kern (Szene, Komponenten, Systeme) → Glut (zeichnet auf der Grafikkarte)." }
          ]
        }
      ]
    },
    {
      id: "herd-2d",
      gruppe: HERD,
      ordnung: 592,
      titel: "2D: Formen, Bildchen, Partikel",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "In 2D zählst du in Pixeln des Spielfelds: (0, 0) ist oben links, y wächst nach unten. Rechtecke, Kreise, Texte und Pixel-Bildchen sind Teile; die **Ebene** bestimmt, was oben liegt, und alles 2D liegt über einer 3D-Szene – perfekt für Anzeigen (HUD)." },
        { art: "bild", src: "img/doku/he-komponenten.png", alt: "Acht Felder: Rechteck mit Umriss, Kreis mit Ring, Text in zwei Größen, ein Pizzastück als Pixel-Bild, eine animierte Flamme, sprühende Partikel, ein drehender Balken mit Kind-Kreis und drei sich überlappende Rechtecke in Ebenen.", unterschrift: "Die 2D-Bausteine: Rechteck, Kreis, Text, Bild, Animation, Partikel, Bewegung mit Kind, Ebenen." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
          herdErwartet: [
            {"art":"fenster","titel":"Pizza im Ofen","breite":640,"hoehe":360},
            {"art":"bild","bildnummer":4,"szene":"cc638054bd0dc9e3","paket":"72cf82bb8a176905"},
            {"art":"bild","bildnummer":8,"szene":"deefb6b4e07e9547","paket":"5bb0816af355d353"}
          ],
          code: z(
            "Herd herd = neu Herd(\"Pizza im Ofen\");",
            "herd.hintergrund(\"ofen\");",
            "Bildchen pizza = neu Bildchen([\"...kk...\", \"..kmtk..\", \".ktmttk.\", \".kttmtk.\", \"kkkkkkkk\"]);",
            "Teil stueck = herd.bild(pizza, 320, 190, groesse: 12);",
            "stueck.mit(neu Bewegung(drehtempo: 60));                      // die Engine dreht",
            "Teil feuer = herd.gruppe(320, 330).setzeEbene(-1);             // Ebene -1: hinter der Pizza",
            "feuer.mit(neu Partikel(rate: 90, tempo: 150, richtung: 270, streuung: 40, farbe: \"ananas\", farbeEnde: \"tomate\"));",
            "herd.text(\"Pizza im Ofen\", 320, 20, groesse: 28, farbe: \"senf\", ausrichtung: \"mitte\");",
            "herd.backe();",
            "Bote.sage((pizza + \" ist \" + stueck.drehung() + \" Grad gedreht\"));"
          )
        },
        { art: "ausgabe", text: "Bildchen(8×5) ist 8 Grad gedreht" },
        { art: "text", md: "Das Pizzastück ist ein **Bildchen** aus Text: Jedes Zeichen ist ein Pixel in einer Palettenfarbe (`k` = kruste, `t` = tomate, `m` = mozzarella, `.` = durchsichtig), `groesse: 12` macht aus jedem Pixel 12 × 12 Bildschirmpixel – pixelscharf. Die Funken sind **Partikel**: Die Engine erzeugt, bewegt und färbt jedes Teilchen selbst." },
        {
          art: "details",
          titel: "Alle 2D-Fabriken",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Aufruf", "Legt an", "Hinweis"],
              zeilen: [
                ["`herd.rechteck(x, y, b, h, farbe:, rundung: 0, umriss: 0)`", "Teil + `Rechteck`", "x, y = Mitte; `umriss` > 0 zeichnet nur den Rand"],
                ["`herd.kreis(x, y, r, farbe:, umriss: 0)`", "Teil + `Kreis`", "Mittelpunkt und Radius"],
                ["`herd.text(t, x, y, groesse: 16, farbe: \"ofen\", ausrichtung: \"links\")`", "Teil + `Text`", "y = Oberkante; `ausrichtung` links, mitte, rechts"],
                ["`herd.bild(bildchen, x, y, groesse: 1)`", "Teil + `Bild`", "Mitte; `teil.bild().setzeSpiegeln(ja)` spiegelt"],
                ["`herd.gruppe(x = 0, y = 0)`", "leeres 2D-Teil", "Halter für Kinder oder Partikel"]
              ]
            },
            { art: "text", md: "**Farben** sind Palettennamen (`tomate`, `basilikum`, `ofen`, … – siehe *Formen und Bildchen*) oder `#rgb`, `#rrggbb`, `#rrggbbaa` – die letzten zwei Ziffern sind die Deckkraft: `\"#2f2a26c0\"` ist ein halb durchsichtiges Dunkel. `Herd.farbe(r, g, b, a)` baut so einen Text aus Zahlen." }
          ]
        },
        {
          art: "details",
          titel: "Ebenen, Hierarchie, Animation, Partikel",
          inhalt: [
            { art: "text", md: "- **Ebenen:** `teil.setzeEbene(n)` – größere Ebenen liegen oben; bei gleicher Ebene gewinnt das später angelegte Teil. Hintergrund z. B. -10, Spielfiguren 0, HUD 10.\n- **Hierarchie:** `kind.haenge(eltern)` – das Kind liegt dann relativ zu den Eltern, dreht und bewegt sich mit, und `eltern.sichtbar(nein)` versteckt alle Kinder. Im Teigfänger hängen gefangene Beläge an der Pizza und fahren von selbst mit; die ganze Ziegelwand hängt an einer Gruppe, die beim Ananas-Treffer wackelt.\n- **Animation:** `teil.mit(neu Animation(bilder: [a, b, c], proSekunde: 8))` blättert durch Bildchen (braucht ein `Bild` am selben Teil). `setzeLaeuft(nein)` hält sie an, `setzeSchleife(nein)` spielt sie einmal.\n- **Partikel:** `rate` Teilchen je Sekunde, die `lebensdauer` lang leben, mit `tempo` in `richtung` (Grad, 0 = rechts, 90 = unten, 270 = oben) ± `streuung` fliegen, `schwerkraft` zieht nach unten, Größe und Farbe gleiten von `groesse`/`farbe` zu `groesseEnde`/`farbeEnde`. Die Teilchen bleiben in der Welt liegen, wenn der Sprüher weiterzieht – so entstehen Schweife. Für einen kurzen Spritzer setzt du den Sprüher an die Stelle, `setzeAktiv(ja)`, und ein paar Takte später `setzeAktiv(nein)`.\n- **Treffer:** `a.trifft(b)` prüft, ob sich die Umrisse überlappen (Kreis als Kreis, sonst als Rechteck)." }
          ]
        }
      ]
    },
    {
      id: "herd-3d",
      gruppe: HERD,
      ordnung: 593,
      titel: "3D: Kamera, Licht, Schatten, Nebel",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "In 3D baust du Körper aus Formen, stellst Lichter auf und schaust durch eine Kamera. Die Sonne wirft weiche Schatten, Nebel und ein Himmelsverlauf machen den Horizont schön – und alles 2D liegt darüber." },
        { art: "bild", src: "img/doku/he-teigball.png", alt: "Teigball: Eine Teigkugel rollt über eine riesige Pizza mit Mozzarella, Salami, Oliven, Basilikum und Champignons. Ringsum Steinöfen mit glühendem Maul, Laternen und eine halb durchsichtige Ölflasche auf einer karierten Tischdecke; Abendhimmel und Nebel am Horizont, oben ein HUD.", unterschrift: "Teigball – das 3D-Spiel aus den Beispielen: Sonne mit Schatten, Punktlichter in den Öfen, Nebel, Himmelsverlauf, Textur, Durchsichtiges, 2D-Anzeige darüber." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
          herdErwartet: [
            {"art":"fenster","titel":"Würfel","breite":640,"hoehe":360},
            {"art":"bild","bildnummer":4,"szene":"e3bb45d5140c4766","paket":"a22f84b4a9fd612a"},
            {"art":"bild","bildnummer":8,"szene":"8a944e4ce1f140b6","paket":"8033d00cf2c77c93"}
          ],
          code: z(
            "Herd herd = neu Herd(\"Würfel\");",
            "herd.himmel(\"#5b8fd6\", \"#ffe2b8\");                         // Verlauf: Zenit, Horizont",
            "herd.nebel(\"#ffe2b8\", 8, 30);                               // Nebel in Horizontfarbe",
            "herd.koerper(Form.ebene(), 0, -0.5, 0, farbe: \"basilikum\").setzeGroesse(40, 1, 40);",
            "Teil wuerfel = herd.koerper(Form.wuerfel(), farbe: \"tomate\", glanz: 0.6);",
            "wuerfel.mit(neu Bewegung(drehtempo: 45));                   // Grad pro Sekunde",
            "herd.licht(1.5, 1, 1.5, farbe: \"senf\", reichweite: 5);",
            "herd.kamera().setzeLage(0, 2, 4).schaueAuf(0, 0, 0);",
            "herd.backe();",
            "Bote.sage((\"Gedreht um \" + wuerfel.drehung() + \" Grad\"));"
          )
        },
        { art: "ausgabe", text: "Gedreht um 6 Grad" },
        { art: "text", md: "`herd.koerper(form, x, y, z, farbe:, glanz:)` legt einen Körper an; `Form.wuerfel()` ist eine der Grundformen (siehe *Formen und Bildchen*). Die **Sonne** gibt es schon – sie wirft Schatten. `herd.licht(…)` stellt ein farbiges **Punktlicht** dazu, und die **Kamera** schaut mit `schaueAuf` auf den Würfel." },
        {
          art: "details",
          titel: "Koordinaten und Kamera",
          inhalt: [
            { art: "text", md: "- **Achsen:** x nach rechts, **y nach oben**, z zu dir hin (Einheiten frei wählbar, z. B. Meter). Grundformen sind 1 groß und liegen um ihren Mittelpunkt.\n- **Drehen:** `setzeDrehung(g)` um die Hochachse (y), `setzeNeigung(g)` um x, `setzeRollen(g)` um z – in Grad. `setzeGroesse(sx, sy, sz)` streckt.\n- **Kamera:** `herd.kamera()` ist ein ganz normales Teil (anfangs bei (0, 3, 8), Blick auf den Ursprung). `setzeLage(…)` + `schaueAuf(x, y, z)` richten sie aus; `herd.kamera().kamera().setzeSicht(50)` ändert den Blickwinkel. Eine **Folgekamera** baust du, indem du sie jeden Takt ein Stück Richtung Spieler schiebst und auf ihn schauen lässt (siehe Teigball) – oder du hängst sie mit `haenge` an das Spieler-Teil.\n- **Hierarchie** wirkt wie in 2D: Ein Ofen ist ein `herd.raum(x, y, z)` mit Kuppel, Schlot, Maul und Licht als Kindern – `ofen.setzeDrehung(45)` dreht alles zusammen." }
          ]
        },
        {
          art: "details",
          titel: "Licht, Schatten, Himmel und Nebel",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Aufruf", "Wirkung"],
              zeilen: [
                ["`herd.sonne().setzeLage(x, y, z)`", "Richtung **zur** Sonne; flach = lange Schatten. `herd.sonne().licht().setzeFarbe(f).setzeStaerke(s)`"],
                ["`herd.licht(x, y, z, farbe:, reichweite: 10)`", "Punktlicht; bis zu 8 wirken gleichzeitig (die nächsten zur Kamera)"],
                ["`herd.umgebung(f, staerke: 0.35)`", "Grundhelligkeit, damit Schatten nicht schwarz werden"],
                ["`herd.himmel(oben, unten)`", "Verlauf hinter der Szene: Zenit → Horizont"],
                ["`herd.nebel(f, von, bis)`", "ab Abstand `von` verblasst alles bis `bis` in Farbe `f` – nimm die Horizontfarbe, dann verschmilzt der Boden mit dem Himmel"],
                ["`koerper(…, leuchten: 1)`", "leuchtet selbst (Lampen, Glut), unabhängig vom Licht"],
                ["Farbe mit Deckkraft, z. B. `\"#2e6fd980\"`", "halb durchsichtig (Glas, Wasser)"],
                ["`koerper(…).koerper().setzeSchatten(nein)`", "wirft keinen Schatten"]
              ]
            }
          ]
        }
      ]
    },
    {
      id: "herd-eingabe",
      gruppe: HERD,
      ordnung: 594,
      titel: "Eingabe: Tasten und Maus",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Im Rückruf von `backe` fragst du ab, was der Spieler gerade tut: Ist eine Taste **gehalten** (`taste`) oder **gerade gedrückt** worden (`gedrueckt`)? Wo ist die Maus, wurde geklickt?" },
        { art: "bild", src: "img/doku/he-steuerung.png", alt: "Ein Pizzabote aus Pixeln springt über einer Wiese, im Himmel liegen Basilikumblätter, die per Mausklick hingelegt wurden. Oben steht die Mausposition.", unterschrift: "Das Beispiel „Steuerung“: Pfeiltasten laufen, Leertaste springt, Klick legt ein Blatt." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          uiEreignisse: [{"typ":"takt","anzahl":4,"tasten":["Rechts"]},{"typ":"takt","anzahl":2,"tasten":["Leertaste"],"maus":[100,120],"knoepfe":1},{"typ":"takt","tasten":[],"knoepfe":0}],
          herdErwartet: [
            {"art":"fenster","titel":"Steuerung","breite":640,"hoehe":360},
            {"art":"bild","bildnummer":4,"szene":"ab82d7e220402d15","paket":"af8d6c69f3a06af2"},
            {"art":"bild","bildnummer":6,"szene":"6dee6fedde46548c","paket":"adf20153aa312cce"},
            {"art":"bild","bildnummer":7,"szene":"6dee6fedde46548c","paket":"60be7648ae5ee14b"}
          ],
          code: z(
            "Herd herd = neu Herd(\"Steuerung\");",
            "Teil schieber = herd.rechteck(320, 330, 100, 16, farbe: \"kruste\", rundung: 8);",
            "Teil anzeige = herd.text(\"Pfeiltasten, Leertaste, Maus!\", 16, 12, groesse: 20);",
            "herd.backe(() -> {",
            "    falls (herd.taste(\"Links\")) { schieber.verschiebe(-6, 0); }       // gehalten",
            "    falls (herd.taste(\"Rechts\")) { schieber.verschiebe(6, 0); }",
            "    falls (herd.gedrueckt(\"Leertaste\")) { anzeige.text().setzeInhalt(\"Hopp!\"); }   // gerade gedrückt",
            "    falls (herd.klick()) { herd.kreis(herd.mausX(), herd.mausY(), 8, farbe: \"basilikum\"); }",
            "});",
            "Bote.sage((\"Schieber bei x = \" + schieber.x() + \", Maus bei \" + herd.mausX() + \", \" + herd.mausY()));"
          )
        },
        { art: "ausgabe", text: "Schieber bei x = 344, Maus bei 100, 120" },
        {
          art: "details",
          titel: "Alle Eingabe-Methoden",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Methode", "Liefert"],
              zeilen: [
                ["`herd.taste(n)`", "`ja`, solange die Taste gehalten wird – gut für Bewegung"],
                ["`herd.gedrueckt(n)` / `herd.losgelassen(n)`", "`ja` nur im Takt, in dem sie gedrückt bzw. losgelassen wurde – gut für Sprung, Schuss, Menü"],
                ["`herd.mausX()`, `herd.mausY()`", "Mausposition in Spielfeld-Pixeln"],
                ["`herd.maus(k = 1)` / `herd.klick(k = 1)`", "Maustaste gehalten / gerade gedrückt (1 links, 2 rechts, 3 Mitte); Tippen auf dem Handy zählt als 1"]
              ]
            },
            { art: "text", md: "**Tastennamen** wie bei der `Tastatur` der Theke: `Links`, `Rechts`, `Hoch`, `Runter`, `Leertaste`, `Enter`, `Escape`, Buchstaben wie getippt (`a`, `w` …). Der Eingabezustand kommt mit jedem Takt vom Fenster – deshalb laufen aufgenommene Spiele in Tests immer gleich ab." }
          ]
        }
      ]
    },
    {
      id: "herd-komponenten",
      gruppe: HERD,
      ordnung: 595,
      titel: "Komponenten-Referenz",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Jede Komponente ist eine eingebaute Klasse: `neu Bewegung(tempoX: 60)` legt sie an, `teil.mit(…)` hängt sie an. Danach liest du jedes Feld mit `feld()` und änderst es mit `setzeFeld(wert)` – für alle Komponenten gleich." },
        { art: "bild", src: "img/doku/he-teil.svg", alt: "Ein Teil als Pizza mit Lage und Komponenten als Belag.", unterschrift: "Komponenten sind der Belag eines Teils – je Art höchstens eine." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          uiEreignisse: [{"typ":"takt","anzahl":4}],
          herdErwartet: [
            {"art":"fenster","titel":"Komponenten","breite":640,"hoehe":360},
            {"art":"bild","bildnummer":4,"szene":"448298469ca974a4","paket":"ec67c2b7b5d2b55f"}
          ],
          code: z(
            "Herd herd = neu Herd(\"Komponenten\");",
            "Teil t = herd.kreis(100, 100, 20, farbe: \"tomate\");",
            "Bewegung b = t.mit(neu Bewegung(tempoX: 60));",
            "b.setzeDaempfung(0.5).setzeDrehtempo(90);                     // Setter lassen sich verketten",
            "Bote.sage((b + \" \" + b.tempoX() + \" \" + b.hole(\"daempfung\") + \" \" + t.kreis().farbe()));",
            "t.kreis().setze(\"radius\", 30);                                // generisch nach Feldname",
            "Bote.sage((t.kreis().radius() + \" \" + (t.animation() == karton)));",
            "herd.backe();",
            "Bote.sage((\"Tempo nach 4 Takten: \" + b.tempoX().runden(2)));"
          )
        },
        { art: "ausgabe", text: z("Bewegung(3) 60 0.5 tomate", "30 ja", "Tempo nach 4 Takten: 57.29") },
        {
          art: "details",
          titel: "Alle Komponenten und ihre Felder (Standardwerte)",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Komponente", "Raum", "Felder (Standard)", "Was sie tut"],
              zeilen: [
                ["`Rechteck`","2D","`breite` 10, `hoehe` 10, `farbe` weiss, `rundung` 0, `umriss` 0","gefülltes Rechteck (Mitte = Lage), `umriss` > 0 zeichnet nur den Rand"],
                ["`Kreis`","2D","`radius` 10, `farbe` weiss, `umriss` 0","Kreis, `umriss` > 0 = Ring"],
                ["`Text`","2D","`inhalt` \"\", `groesse` 16, `farbe` ofen, `ausrichtung` links (links|mitte|rechts)","Text in der eingebauten Schrift; `ausrichtung` bezieht sich auf x, y ist die Oberkante"],
                ["`Bild`","2D","`bildchen` karton, `groesse` 1, `farbe` weiss, `spiegeln` nein","ein Bildchen, pixelscharf; `groesse` = Bildschirmpixel je Bildchen-Pixel, `farbe` tönt"],
                ["`Koerper`","3D","`form` karton, `farbe` weiss, `glanz` 0.3, `leuchten` 0, `bild` karton, `schatten` ja","3D-Körper aus einer Form; `glanz` 0 … 1, `leuchten` 0 … 1, `bild` = Textur, `schatten` = wirft Schatten"],
                ["`Licht`","3D","`art` punkt (punkt|sonne), `farbe` weiss, `staerke` 1, `reichweite` 10, `schatten` ja","Punktlicht oder Sonne (`art`); höchstens 8 Punktlichter wirken (die nächsten zur Kamera)"],
                ["`Kamera`","3D","`sicht` 60, `nah` 0.1, `fern` 500, `aktiv` ja","Blickwinkel `sicht` in Grad; es zeichnet die aktive Kamera mit der kleinsten ID"],
                ["`Bewegung`","2D + 3D","`tempoX` 0, `tempoY` 0, `tempoZ` 0, `beschleunigungX` 0, `beschleunigungY` 0, `beschleunigungZ` 0, `drehtempo` 0, `daempfung` 0","je Takt: Tempo += Beschleunigung·dt, Dämpfung, Lage += Tempo·dt; `drehtempo` in Grad/s"],
                ["`Animation`","2D","`bilder` [], `proSekunde` 8, `schleife` ja, `laeuft` ja, `nummer` 1 – braucht Bild","blättert durch `bilder` (braucht ein `Bild` am selben Teil); ohne `schleife` stoppt sie am Ende"],
                ["`Partikel`","2D","`rate` 30, `lebensdauer` 1, `tempo` 80, `richtung` 270, `streuung` 360, `schwerkraft` 0, `groesse` 6, `groesseEnde` 0, `farbe` senf, `farbeEnde` tomate, `aktiv` ja, `saat` 0","Teilchen-Sprüher, die Teilchen leben in der Engine; `richtung` 0 = rechts, 90 = unten"]
              ]
            },
            { art: "text", md: "Die Liste kommt direkt aus der Engine (`site/js/herd/schema.json`) – kommt eine Komponente dazu, steht sie sofort in pizza zur Verfügung." }
          ]
        },
        {
          art: "details",
          titel: "Zugriff im Detail",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Schreibweise", "Bedeutung"],
              zeilen: [
                ["`neu Partikel(rate: 50, farbe: \"senf\")`", "Felder benannt (oder in Schema-Reihenfolge); fehlende bekommen den Standard"],
                ["`k.rate()` / `k.setzeRate(80)`", "lesen / ändern; Setter liefern die Komponente → verkettbar"],
                ["`k.hole(\"rate\")` / `k.setze(\"rate\", 80)`", "dasselbe über den Feldnamen als Text"],
                ["`teil.partikel()`", "die Komponente dieser Art am Teil – oder `karton`"],
                ["`teil.ohne(\"Partikel\")`", "nimmt sie wieder ab"],
                ["`k.teil()`", "das Teil, an dem sie hängt (oder `karton`)"]
              ]
            },
            { art: "text", md: "Falsche Werte meldet die Engine mit klaren Texten, z. B. `TypAnanas: Bewegung.tempoX braucht eine Zahl, nicht \"schnell\".` oder `LaufzeitAnanas: Bewegung.daempfung muss zwischen 0 und 1 liegen, nicht 2.` Zwei Komponenten derselben Art an einem Teil gehen nicht (`Teil 3 hat schon eine Bewegung.`), 2D-Komponenten nur an 2D-Teilen." }
          ]
        }
      ]
    },
    {
      id: "herd-ressourcen",
      gruppe: HERD,
      ordnung: 596,
      titel: "Formen und Bildchen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "**Formen** sind die Gestalt eines 3D-Körpers – fertige Grundformen oder deine eigene aus Punkten und Dreiecken. **Bildchen** sind kleine Pixelbilder aus Text: für 2D-Figuren, Animationen und als Textur auf 3D-Körpern." },
        { art: "bild", src: "img/doku/he-formen.png", alt: "Würfel, Kugel, Zylinder, Kegel, Ring und ein selbst gebautes Pizzastück nebeneinander mit Schatten; dahinter ein rot-weiß karierter Würfel und eine halb durchsichtige blaue Kugel.", unterschrift: "Die sechs Grundformen, eine eigene Form (Pizzastück), eine Bildchen-Textur und etwas Durchsichtiges." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          uiEreignisse: [{"typ":"takt","anzahl":4}],
          herdErwartet: [
            {"art":"fenster","titel":"Formen","breite":640,"hoehe":360},
            {"art":"bild","bildnummer":4,"szene":"2f6171e7d235aaa8","paket":"2eb2c058ec3bd69f"}
          ],
          code: z(
            "Herd herd = neu Herd(\"Formen\");",
            "Form keil = neu Form([0, 0, 0,  0.5, 0, -0.9,  -0.5, 0, -0.9,  0, 0.2, 0,  0.5, 0.2, -0.9,  -0.5, 0.2, -0.9],",
            "    [3, 4, 5,  0, 2, 1,  0, 1, 4,  0, 4, 3,  1, 2, 5,  1, 5, 4,  2, 0, 3,  2, 3, 5]);   // ein Pizzastück",
            "Bildchen karo = neu Bildchen([\"tm\", \"mt\"]);                    // 2 × 2 Pixel: tomate, mozzarella",
            "herd.koerper(keil, -1, 0, 0.4, farbe: \"kruste\").mit(neu Bewegung(drehtempo: 30));",
            "herd.koerper(Form.wuerfel(), 1, 0.5, 0, bild: karo);             // Bildchen als Textur",
            "herd.koerper(Form.ring(dicke: 0.3), 0, 1.6, -1, farbe: \"#2e6fd980\");   // halb durchsichtig",
            "herd.kamera().setzeLage(0, 2, 4).schaueAuf(0, 0.5, 0);",
            "herd.backe();",
            "Bote.sage((karo + \" \" + karo.breite() + \"x\" + karo.hoehe()));"
          )
        },
        { art: "ausgabe", text: "Bildchen(2×2) 2x2" },
        {
          art: "details",
          titel: "Grundformen und eigene Formen",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Form", "Gestalt (Größe 1 um den Mittelpunkt)"],
              zeilen: [
                ["`Form.wuerfel()`", "Würfel, Kante 1"],
                ["`Form.kugel(teile: 24)`", "Kugel, Durchmesser 1; `teile` = Feinheit (3 … 128)"],
                ["`Form.zylinder(teile: 32)`, `Form.kegel(teile: 32)`", "Durchmesser 1, Höhe 1"],
                ["`Form.ebene()`", "flaches Quadrat 1 × 1, Vorderseite nach oben – als Boden mit `setzeGroesse(50, 1, 50)`"],
                ["`Form.ring(dicke: 0.3, teile: 32)`", "Ring (Donut), liegt flach; `dicke` relativ 0.05 … 0.9"],
                ["`neu Form(punkte, dreiecke, glatt: nein)`", "eigene Form: `punkte` = [x1, y1, z1, x2, …], `dreiecke` = je drei Punkt-Nummern ab 0, **gegen den Uhrzeigersinn** von außen gesehen; `glatt: ja` rundet die Schattierung"]
              ]
            },
            { art: "text", md: "Eine Form legst du einmal an und benutzt sie für beliebig viele Körper – die Engine zeichnet gleiche Formen in einem Rutsch." }
          ]
        },
        {
          art: "details",
          titel: "Bildchen: Zeichen und Farben",
          inhalt: [
            { art: "text", md: "`neu Bildchen(zeilen, farben: karton)` – jede Zeile ist ein Text, jedes Zeichen ein Pixel. `.` und Leerzeichen sind durchsichtig, kürzere Zeilen werden rechts aufgefüllt, höchstens 256 × 256. Eigene Farben gibst du als `Speisekarte` mit: `farben.lege(\"x\", \"#00ff00\")`. Fest eingebaut sind diese Zeichen:" },
            {
              art: "tabelle",
              kopf: ["Zeichen", "Farbe", "Wert"],
              zeilen: [
                ["`w`","`weiss`","#FFFFFF"],
                ["`s`","`schwarz`","#000000"],
                ["`g`","`grau`","#8A8580"],
                ["`o`","`ofen`","#2F2A26"],
                ["`t`","`tomate`","#D9452B"],
                ["`r`","`salami`","#A83232"],
                ["`p`","`schinken`","#F2A0A0"],
                ["`b`","`basilikum`","#3E8E41"],
                ["`l`","`oliven`","#6B7A2A"],
                ["`m`","`mozzarella`","#FFF6E0"],
                ["`e`","`teig`","#E8C48A"],
                ["`k`","`kruste`","#C8955A"],
                ["`a`","`ananas`","#F5C518"],
                ["`y`","`senf`","#F2B33D"],
                ["`h`","`himmel`","#8EC9F0"],
                ["`u`","`wasser`","#2E6FD9"],
                ["`v`","`aubergine`","#5B2A6E"]
              ]
            }
          ]
        }
      ]
    },
    {
      id: "herd-leistung",
      gruppe: HERD,
      ordnung: 597,
      titel: "Leistungstipps: die Engine arbeiten lassen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Die Engine ist schnell, dein Rückruf ist pizza-Code. Also: Alles, was fließt – fliegen, drehen, blättern, sprühen –, übernimmt eine Komponente. Dein Rückruf ändert nur, **was sich wirklich ändert**." },
        { art: "bild", src: "img/doku/he-takt.svg", alt: "Ein Takt in fünf Schritten: Eingabe, dein Rückruf, Systeme der Engine, Bildpaket, Glut zeichnet – dann der nächste Takt. Faustregel: Rückruf nur für Spielregeln, Engine für alles Fließende.", unterschrift: "Ein Takt: Eingabe → dein Rückruf → Systeme → Bildpaket → Zeichnen. 60-mal pro Sekunde." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
          herdErwartet: [
            {"art":"fenster","titel":"Sternenhimmel","breite":640,"hoehe":360},
            {"art":"bild","bildnummer":4,"szene":"3f94d3c25de8ebb2","paket":"0ec9e4cf5801c462"},
            {"art":"bild","bildnummer":8,"szene":"748d09536ec845de","paket":"2b7e5846893762cf"},
            {"art":"bild","bildnummer":12,"szene":"63f8f99be44695d0","paket":"93986a865b494006"}
          ],
          code: z(
            "Herd herd = neu Herd(\"Sternenhimmel\");",
            "herd.hintergrund(\"ofen\");",
            "für (salami i = 0; i < 300; i++) {                                   // 300 Sterne – die Engine bewegt alle",
            "    herd.kreis(Zufall.zahl(0, 640), Zufall.zahl(0, 360), 2, farbe: \"senf\").mit(neu Bewegung(tempoX: -Zufall.zahl(20, 120)));",
            "}",
            "Teil uhr = herd.text(\"0 s\", 16, 12, groesse: 20, farbe: \"weiss\");",
            "salami alt = 0;",
            "herd.backe(() -> {",
            "    salami s = herd.zeit().ganz();",
            "    falls (s != alt) { uhr.text().setzeInhalt((s + \" s\")); alt = s; }   // nur bei Änderung",
            "});"
          )
        },
        { art: "text", md: "300 Sterne fliegen, und der Rückruf tut fast nichts: Er schreibt die Uhr nur neu, wenn sich die Sekunde ändert." },
        {
          art: "details",
          titel: "Die wichtigsten Tipps",
          inhalt: [
            { art: "text", md: "- **Bewegung statt `setzeLage` in jedem Takt.** Tempo, Beschleunigung, Dämpfung und Drehtempo rechnet die Engine. Ändere sie nur, wenn sich etwas ändert (Taste gedrückt, Abprall).\n- **Nur bei Änderung schreiben.** Texte, Farben und Sichtbarkeit nur setzen, wenn der neue Wert anders ist – merk dir den alten in einer Variablen.\n- **Wiederverwenden statt neu anlegen.** Für fallende Dinge, Schüsse oder Gegner einen festen Vorrat von Teilen anlegen und mit `setzeLage` + `sichtbar(ja/nein)` recyceln. Für Vorlagen gibt es `kopie()` (kopiert alle Komponenten und Kinder).\n- **Effekte als Partikel.** Hunderte Teilchen kosten einen Sprüher – nicht hundert Teile.\n- **Wenige Arten, viele Dinge.** Gleiche Formen, Bildchen und 2D-Teile zeichnet die Engine gesammelt (Instancing); die Zahl der Zeichenaufrufe wächst mit der Zahl der *Arten*, nicht der Objekte.\n- **Hierarchie nutzen.** Eine Gruppe bewegen statt zwanzig Kinder einzeln.\n- **Treffer gezielt prüfen.** `trifft` nur für die Paare, die zählen (Spieler gegen Gegner), nicht jeder gegen jeden.\n\nZum Vergleich: Teigfänger und Teigball brauchen im Interpreter weniger als eine halbe Millisekunde je Takt." }
          ]
        }
      ]
    },
    {
      id: "herd-erweitern",
      gruppe: HERD,
      ordnung: 598,
      titel: "Neue Komponente hinzufügen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Die Engine wächst wie Unity: Eine neue Komponente ist **eine Rust-Datei** im Herd-Kern plus **eine Zeile** in der Komponentenliste. pizza kennt sie danach von selbst – ohne Änderung an Sprache, Compiler oder Host." },
        { art: "bild", src: "img/doku/he-schichten.svg", alt: "Drei Schichten: Programm, Herd-Kern mit der Komponentenliste (Kreis, Koerper, Licht, Bewegung … und eine neue), Glut.", unterschrift: "Neue Bausteine kommen in die Komponentenliste des Kerns – darüber und darunter ändert sich nichts." },
        {
          art: "code",
          ausfuehrbar: false,
          tier: 1,
          code: z(
            "// So sähe eine gedachte Komponente „Pendel“ in pizza aus – sobald sie im Kern steht:",
            "Herd herd = neu Herd(\"Pendel\");",
            "Teil lampe = herd.kreis(320, 120, 20, farbe: \"senf\");",
            "Pendel p = lampe.mit(neu Pendel(weite: 40));",
            "p.setzeTempo(2);",
            "herd.backe();"
          )
        },
        { art: "text", md: "Die Schritte (ausführlich in `HERD.md` §9):\n\n- **Rust-Datei** `herd/kern/src/komponenten/pendel.rs`: Name, Raum (2D/3D/beide), Felder mit Typ, Standard und Bereich (das **Schema**), dazu optional ein **System** (`takt`, läuft jeden Takt über alle Pendel) und ein Bildbeitrag.\n- **Eine Zeile** in `herd/kern/src/komponenten/mod.rs` – die Position ist die Reihenfolge der Systeme.\n- `node herd/baue.js` baut `kern.wasm` und `schema.json` neu. Getter, Setter, Fehlertexte, Editor-Vervollständigung und die Tabelle in *Komponenten-Referenz* entstehen aus dem Schema.\n- Tests: ein `cargo test`, ein Fall `tests/faelle/herd-pendel.*`, ein Doku-Absatz." },
        {
          art: "details",
          titel: "Was als Nächstes kommt",
          inhalt: [
            { art: "text", md: "Die Roadmap in `HERD.md` §10 orientiert sich an Unity: 2D-Kamera und Folgekamera, Material, Linien und Vielecke, Tweens, 3D-Partikel, Kollider mit Ereignissen, 2D-Physik, Vorlagen, Szenenwechsel, Kachelkarten, Gelände und Skybox, UI-Bausteine, eigene pizza-Klassen als Komponente und Ton – jeweils als eigene Komponente nach diesem Muster." }
          ]
        }
      ]
    }
  );
})();
