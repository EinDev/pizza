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
        { art: "kurz", md: "`Mathe` rechnet für dich: Wurzel, Potenz, Runden, Kreiszahl – Pizzen sind rund. Fürs Würfeln gibt es `Zufall` (eigener Abschnitt)." },
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
        { art: "kurz", md: "Zahlen, Texte und Zeitdauern bringen eigene Methoden mit. Du rufst sie mit einem Punkt auf: `preis.euro()`, `text.groß()`, `backzeit.inSekunden()`." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "funghi preis = 5 + 1 + 1.5 + 0.5;   // Teig, Tomate, Mozzarella, Basilikum",
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
              ["`alsText()`", "Als Text", "`7.5` → `\"7.5\"`"],
              ["`tausender()` / `tausender(n)`", "Als Text mit Tausenderpunkten und Dezimalkomma, kaufmännisch auf `n` Stellen (Standard 0)", "`1234567.tausender(2)` → `\"1.234.567,00\"`"],
              ["`kompakt()` / `kompakt(n)`", "Kurz mit Stufe (`Tsd.`, `Mio.`, `Mrd.`, `Bio.`, `Brd.`, `Trio.`, `Trd.`, `Quadr.` … bis `Dezd.`, darüber `1,5 × 10⁷⁰`), höchstens `n` Nachkommastellen (Standard 2), ohne Nullen am Ende", "`1234567.kompakt()` → `\"1,23 Mio.\"`"],
              ["`euro(kompakt: ja)`", "Eurobetrag in Kurzform", "`1234567.euro(kompakt: ja)` → `\"1,23 Mio. €\"`"]
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
            { art: "text", md: "**Große Zahlen lesbar machen** – praktisch für Spielstände und Kassen: `tausender` setzt Punkte, `kompakt` kürzt ab. Unter 1000 gibt es keine Stufe, nur das Komma; weiter geht es mit `Trd.`, `Quadr.`, `Quadrd.`, `Quint.` … bis `Dezd.` (10⁶³), darüber `1,5 × 10⁷⁰`. `tausender` und `euro()` wechseln ab 10²¹ in dieselbe Kurzform; Unendlich wird `∞`. Nur die rohe Textform (`Bote.sage((x))`) bleibt bei `2.5e+21`." },
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
                "Bote.sage((umsatz.euro(kompakt: ja)));"
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
        { art: "text", md: "Beim nächsten Lauf steht dort `Besuch Nr. 2`, dann `3` … Die Doku führt Beispiele ohne Speicher aus – darum steht hier immer `1`, und die Konsole zeigt die Warnung **W0101** (siehe unten)." },
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
            { art: "text", md: "**Umzug eines alten Spielstands:** Hat dein Spiel bisher ohne Namensraum gespeichert, öffnest du beide Kammern, kopierst die Einträge einmalig in die neue und leerst die alte. Im Beispiel-Tab findet das Programm so den Beispiel-Stand, im App-Link den echten – beide landen im gemeinsamen Raum. Für die Ausgabe unten ist die alte Kammer mit `punkte = 120` vorgefüllt; backst du den Block selbst, ist sie leer, es gibt nichts umzuziehen und statt `120` steht dort `karton`:" },
            {
              art: "code",
              ausfuehrbar: true,
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
            { art: "text", md: "Jedes Bauteil heißt **Zutat**. Alle Zutaten können `id()`, `sichtbar(ja/nein)`, `stil(schlüssel, wert)`, `animiere(art)` und `uebergang(ja/nein)` (siehe *Animationen* unten). Die verändernden Methoden (`setzeText`, `aktiv`, `stil`, `sichtbar`, `beiKlick` …) geben die Zutat selbst zurück – du kannst sie also **verketten**: `neu Knopf(\"OK\").aktiv(nein).stil(\"farbe\", \"basilikum\")`. Ein erneutes `beiKlick`/`beiAenderung` **ersetzt** den alten Rückruf." },
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
                ["`Abschnitt`", "Stapel mit Überschrift", "`neu Abschnitt(\"Karte\", [a, b])`", "wie `Stapel`, dazu `titel()`, `setzeTitel(t)`"],
                ["`Reiter`", "mehrere Seiten mit Reitern oben, eine ist sichtbar", "`neu Reiter([\"Ofen\", \"Karte\"], [seite1, seite2])`", "`waehle(n)` (ab 1), `gewaehlt()`, `beiAenderung(fn)` (bekommt die Seitennummer)"],
                ["`Fortschritt`", "Fortschrittsbalken", "`neu Fortschritt(wert: 0, text: \"\")`", "`wert()`, `setzeWert(x)` (0 bis 1, wird begrenzt), `text()`, `setzeText(t)`"],
                ["`Tabelle`", "Tabelle zum Anzeigen", "`neu Tabelle(spalten, zeilen)`", "`spalten()`, `setzeSpalten(b)`, `zeilen()`, `setzeZeilen(b)` – Zellen erscheinen als Text"],
                ["`Takt`", "unsichtbarer Zeitgeber", "`neu Takt(1s, anzahl -> { … })`", "`aktiv(ja/nein)`, `intervall()`, `setzeIntervall(d)`, `beiTakt(fn)`"]
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
                "Tabelle karte = neu Tabelle([\"Pizza\", \"Preis\"], [[\"Margherita\", 8.euro()], [\"Funghi\", 9.euro()]]);",
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
          titel: "Takt: die Theke tickt",
          inhalt: [
            { art: "text", md: "Ein `Takt` ist eine unsichtbare Zutat, die regelmäßig ihren Rückruf aufruft – für Uhren, Animationen und Idle-Spiele. Er läuft nur, solange er im **gezeigten** Baum liegt und `aktiv` ist; leg ihn einfach mit in einen Stapel.\n\n- Das Intervall ist eine Dauer von **mindestens 100 ms** (sonst `LaufzeitAnanas: Ein Takt braucht mindestens 100ms, nicht 50ms.`).\n- Der Rückruf bekommt `anzahl`: wie viele Takte seit dem letzten Aufruf vergangen sind. Normal ist das 1; war der Rechner kurz beschäftigt, holt der Takt verpasste Schläge auf einmal nach. Rechne darum immer mit `anzahl`.\n- Der Takt misst **echte** Zeit, nicht die simulierte Uhr – `Uhr.vorspulen` beschleunigt ihn nicht.\n- `aktiv(nein)` hält ihn an, `setzeIntervall(d)` ändert das Tempo." },
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
            { art: "text", md: "Hier kamen ein Schlag mit `anzahl` 1 und einer mit 2 – zusammen 3 Sekunden. `schrift: \"riesig\"` macht die Anzeige extra groß." }
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
            { art: "text", md: "`theke.bediene()` ist der Pizzaiolo hinter der Theke: Er **wartet**, bis der Gast etwas tut, ruft den passenden Rückruf auf (`beiKlick`, `beiAenderung`, `beiEnter`) und wartet weiter. Erst wenn das Fenster geschlossen wird oder dein Code `theke.schliesse()` ruft, geht es nach `bediene()` weiter.\n\n- Vorher muss etwas gezeigt werden: `bediene()` ohne `zeige(…)` → `LaufzeitAnanas: Die Theke ist leer.`\n- Ein zweites `bediene()` nach dem Schließen kehrt sofort zurück.\n- Pro Programm gibt es **eine** Theke: ein zweites `neu Theke(…)` → `LaufzeitAnanas: Es gibt nur eine Theke pro Programm.`\n- Ein Klick auf einen Knopf mit `aktiv(nein)` wird einfach ignoriert – kein Rückruf, kein Fehler. Dasselbe gilt für Ereignisse, für die kein Rückruf eingetragen ist.\n- Ändert ein Rückruf mehrere Zutaten, sieht der Gast alles auf einmal, sobald der Rückruf fertig ist.\n- Wirft ein Rückruf eine Ananas, fliegt sie aus `bediene()` heraus – fang sie mit `probier` um `bediene()`.\n- Warten auf den Gast kostet keine Schritte und keine Zeit auf der simulierten Uhr (wie bei der `Bestellannahme`).\n- Das **Schrittlimit** (5 000 000, `P0002`) gilt für das Programm bis zum `bediene()` und danach **für jeden Rückruf neu**. Ein Spiel darf also stundenlang laufen und Tausende Klicks oder Takte verarbeiten – nur ein einzelner Rückruf, der sich in einer Endlosschleife verfängt, wird gestoppt. `Uhr.jetzt()` zählt dabei einfach weiter." },
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
                ["`schrift`", "`\"klein\"`, `\"normal\"`, `\"gross\"`, `\"riesig\"`, `\"mono\"`"],
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
          titel: "Wo erscheint das Fenster? (Playground, EXE, Linux, ohne Bildschirm, W0100)",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Wo", "Was der Gast sieht"],
              zeilen: [
                ["Playground", "ein schwebendes **Vorschaufenster** über dem Editor; Schließen-Knopf = Fenster zu. Abbrechen (`Esc`) geht immer."],
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
        { art: "kurz", md: "Alle 38 reservierten Wörter von pizza v3.0 auf einen Blick – mit dem passenden Java-Wort daneben." },
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
        { art: "text", md: "**Eingebaute Funktionen und Objekte** – ebenfalls keine Keywords: `teig`, `bestelle`, `schieb`, `zwischenstand` sowie `Bote` (`sage`, `schreibe`, `fehler`, `leeren`), `Bestellannahme` (`lies`, `frage`, `liesZahl`, `frageZahl`, `hatMehr`), `Uhr`, `Mathe`, `Zufall` (auch `neu Zufall(saat)`), `Spiegel`, `Vorratskammer` – und für Fenster die Theke-Zutaten `Theke`, `Schild`, `Knopf`, `Eingabe`, `Haken`, `Stapel`, `Reihe`, `Abschnitt`, `Reiter`, `Fortschritt`, `Tabelle`, `Takt`. `auto` gibt es nur als Argument von `schneide(auto)`." },
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
            ["`S0007`", "`schneide(7)`", "„7 Stücke? Wer schneidet eine Pizza in 7 Stücke?“"],
            ["`T0007`", "`backen()` ohne vorheriges `gehenlassen()`", "„Das schmeckt flach.“"],
            ["`W0100`", "`theke.bediene()`, wo es nie ein Fenster gibt (Tests, Doku, `node bin/pizza.js`, `PIZZA_THEKE=0`) – ein heruntergeladenes Programm ohne möglichen Bildschirm bricht dagegen mit Exit 2 ab", "„Keine Theke verfügbar – Fenster wird nicht angezeigt.“"],
            ["`W0101`", "`neu Vorratskammer(…)`, aber es gibt keinen Speicher (einmal pro Programm)", "„Keine Vorratskammer verfügbar – Zustand wird nicht gespeichert.“"]
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
