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
              ["`sage(x)`", "Gibt `x` als Text aus, danach kommt ein Zeilenumbruch.", "`Bote.sage((\"Ciao!\"));`"],
              ["`fehler(x)`", "Wie `sage`, aber auf die Fehlerausgabe (in der Konsole rot). Der Exit-Code bleibt gleich.", "`Bote.fehler((\"Kein Basilikum mehr!\"));`"]
            ]),
            { art: "hinweis", ton: "info", md: "Die doppelten Klammern in `Bote.sage((x));` haben keine Bedeutung – sie sind nur stilistisch erwünscht. Wie Pizza, Blech, Dauer & Co. als Text aussehen, steht im Kapitel *Ausdrücke*." }
          ]
        }
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
              ["`vorspulen(d)`", "Die Uhr springt um die Dauer `d` vor – praktisch, um Haltbarkeiten (`@Kühlschrank`) zu testen.", "`Uhr.vorspulen((3d));`"]
            ]),
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
              ["`max(a, b)`", "Größerer Wert", "`Mathe.max(3, 7)` → `7`"],
              ["`min(a, b)`", "Kleinerer Wert", "`Mathe.min(3, 7)` → `3`"],
              ["`abs(x)`", "Betrag (ohne Minus)", "`Mathe.abs(-12)` → `12`"],
              ["`runden(x)`", "Auf Ganzzahl runden", "`Mathe.runden(7.4)` → `7`"],
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
                "Bote.sage((Mathe.abs(-12)));"
              )
            },
            { art: "ausgabe", text: z("7 / 8", "12") }
          ]
        },
        {
          art: "details",
          titel: "Zufall: Methode und Seed",
          inhalt: [
            { art: "text", md: "`Zufall` rechnet mit einem festen Startwert (Seed 42). Deshalb ist die „zufällige“ Folge bei jedem Lauf dieselbe – jedes Rezept bleibt nachkochbar." },
            tab([
              ["`zahl(a, b)`", "Ganzzahl zwischen `a` und `b`, beide Grenzen **inklusive**.", "`salami w = Zufall.zahl(1, 6);`"]
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
            { art: "text", md: "Tipp: Methoden lieber auf Variablen oder geklammerten Ausdrücken aufrufen, z. B. `preis.euro()` oder `((2.5)).euro()`." },
            tab([
              ["`euro()`", "Als Eurobetrag mit Komma und zwei Nachkommastellen", "`8` → `\"8,00 €\"`"],
              ["`runden()`", "Auf Ganzzahl runden", "`3.6` → `4`"],
              ["`runden(n)`", "Auf `n` Nachkommastellen runden", "`3.14159.runden(2)` → `3.14`"],
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
            { art: "ausgabe", text: z("3", "-7", "7.9", "3.14159!") }
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
              ["`alsZahl()`", "Text als Zahl", "`\"42\".alsZahl()` → `42`"]
            ]),
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
                "Bote.sage((zahl.alsZahl() + 8));"
              )
            },
            { art: "ausgabe", text: z("Pizza Margherita (16 Zeichen)", "ja", "Pizza Funghi", "[Tomate, Mozzarella, Basilikum]", "nanana", "ja", "50") },
            { art: "hinweis", ton: "info", md: "`für (margherita c : text) { … }` läuft über die einzelnen Zeichen eines Textes." }
          ]
        },
        {
          art: "details",
          titel: "Dauer: Literale, Rechnen, Methoden",
          inhalt: [
            { art: "text", md: "Eine Dauer schreibst du als Zahl **direkt** gefolgt von der Einheit: `500ms`, `90s`, `30min`, `1h`, `3d`, auch `1.5s`. Intern zählt pizza in Millisekunden. Als Text erscheinen die größten Einheiten zuerst, Nullteile fallen weg (`1min 30s`)." },
            tab([
              ["`+` / `-`", "Mit anderer Dauer", "`1min + 30s` → `1min 30s`"],
              ["`*` / `/`", "Mit einer Zahl", "`2h / 4` → `30min`"],
              ["`== != < <= > >=`", "Vergleiche", "`90s == 1min + 30s` → `ja`"],
              ["`inMs()`", "Als Millisekunden", "`(90s).inMs()` → `90000`"],
              ["`inSekunden()`", "Als Sekunden", "`(90s).inSekunden()` → `90`"]
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
                "Bote.sage((3d + 4h));"
              )
            },
            { art: "ausgabe", text: z("3min", "30min", "90000", "ja", "3d 4h") }
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
            { art: "text", md: "Schreibweisen: `[a, b, c]`, Bereiche `[1 .. 8]` (inklusive), leeres Blech: `neu Blech<salami>()`. Wer `stück(0)` verlangt, bekommt eine `KeinStückAnanas`." },
            tab([
              ["`länge()`", "Anzahl Elemente", "`[3, 1, 4].länge()` → `3`"],
              ["`stück(i)`", "Element an Position `i` (**ab 1**); außerhalb → `KeinStückAnanas`", "`b.stück(1)`"],
              ["`hinzu(x)`", "Hängt `x` an, gibt das Blech zurück (verkettbar)", "`b.hinzu(9).hinzu(2)`"],
              ["`entferne(i)`", "Entfernt das Element an Position `i`", "`b.entferne(1)`"],
              ["`setze(i, x)`", "Ersetzt das Element an Position `i`", "`b.setze(2, 7)`"],
              ["`enthält(x)`", "Ist `x` drauf?", "`b.enthält(4)` → `ja`"],
              ["`belege(fn)`", "map: wendet `fn` auf jedes Element an", "`b.belege(x -> x * 2)`"],
              ["`filtere(fn)`", "Behält nur Elemente, für die `fn` `ja` liefert", "`b.filtere(x -> x > 2)`"],
              ["`zusammenklappen(fn)` / `(fn, start)`", "reduce: fasst alles zu einem Wert zusammen", "`b.zusammenklappen((a, c) -> a + c, 0)`"],
              ["`summe()`", "Summe aller Zahlen", "`[1, 2, 3].summe()` → `6`"],
              ["`erstes()` / `letztes()`", "Erstes bzw. letztes Element", "`b.letztes()`"],
              ["`umdrehen()`", "Reihenfolge umkehren", "`b.umdrehen()`"],
              ["`sortiere()` / `sortiere((a, b) -> …)`", "Sortieren, optional mit Vergleichsfunktion", "`b.sortiere()`"],
              ["`verbinde(trenner)`", "Elemente zu einem Text verbinden", "`b.verbinde(\", \")`"],
              ["`istLeer()`", "Ist das Blech leer?", "`neu Blech<salami>().istLeer()` → `ja`"],
              ["`schneide(n)`", "In `n` Teil-Bleche schneiden (siehe *Schneiden*), `schneide(auto)` = 8", "`[1 .. 8].schneide(4)`"]
            ]),
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
            { art: "text", md: "Großgeschrieben (`Speisekarte<K, V>`) ist es der Typ. Kleingeschrieben (`speisekarte`) ist es der Modifikator für *public*. `für (K k : karte)` läuft über die **Schlüssel**." },
            tab([
              ["`lege(k, v)`", "Legt `v` unter Schlüssel `k` ab (überschreibt)", "`karte.lege(\"Salami\", 9.5)`"],
              ["`hole(k)`", "Wert zu `k`; fehlt er → `karton`", "`karte.hole(\"Salami\")`"],
              ["`hat(k)`", "Gibt es den Schlüssel?", "`karte.hat(\"Tonno\")` → `nein`"],
              ["`entferne(k)`", "Entfernt den Eintrag", "`karte.entferne(\"Salami\")`"],
              ["`schlüssel()`", "`Blech` aller Schlüssel", "`karte.schlüssel()`"],
              ["`werte()`", "`Blech` aller Werte", "`karte.werte()`"],
              ["`länge()`", "Anzahl Einträge", "`karte.länge()`"]
            ]),
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
        { art: "text", md: "**Eingebaute Funktionen und Objekte** – ebenfalls keine Keywords: `teig`, `bestelle`, `schieb`, `teile`, `zwischenstand` sowie `Bote`, `Uhr`, `Mathe`, `Zufall`, `Spiegel`." }
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
            ["`P0011`", "Eine `gebacken`e (finale) Klasse soll mit `erbt` erweitert werden.", "2"],
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
            ["`W0003`", "Erster Aufruf einer `@PizzaVeraltet`-Methode", "Grund aus der Annotation"],
            ["`W0013`", "`aufklappen()` auf einer Calzone", "„Garantie erloschen. Das ist jetzt eine ganz normale Pizza.“"],
            ["`W0032`", "Zwei Namen im selben Scope unterscheiden sich nur in Groß-/Kleinschreibung", "„Selbst der Pizzaiolo verwechselt die beiden.“"],
            ["`W0666`", "Typ `hawaii` oder Belag-Bezeichner für die Frucht, die man nicht nennt, im Quelltext", "„Der Pizzaiolo sagt nichts. Er schaut nur.“"],
            ["`S0007`", "`schneide(7)`", "„7 Stücke? Wer schneidet eine Pizza in 7 Stücke?“"],
            ["`T0007`", "`backen()` ohne vorheriges `gehenlassen()`", "„Das schmeckt flach.“"]
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
            ["`2`", "PizzaFehler (Syntax, `B0012`, `R0001`, `Q0004`, `A0001`, `P0011`, `K0001` …)"],
            ["`3`", "Schrittlimit (`P0002`) – die Pizza ist noch im Ofen"],
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
        { art: "hinweis", ton: "pizza", md: "Warum ausgerechnet 39? Weil es keine gute Antwort auf Ananas gibt. Warnungen verändern den Exit-Code übrigens nie." }
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
        { art: "hinweis", ton: "warnung", md: "**Nur Spezifikation.** Die Toolchain gibt es (noch) nur auf dem Papier. Im Browser läuft pizza direkt im Interpreter – Ofen vorheizen nicht nötig." },
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
            ["`Strg+S`", "Code lokal im Browser speichern"],
            ["`Strg+B`", "Seitenpanel (Doku · Beispiele) ein-/ausklappen"]
          ]
        },
        { art: "text", md: "Jeden Code-Block dieser Doku und jedes Beispiel übernimmst du mit **„Im Editor öffnen“**. Ein Lauf darf höchstens 10 Sekunden echte Zeit dauern – danach heißt es: „Die Pizza ist noch im Ofen (Zeitlimit)“." },
        { art: "hinweis", ton: "pizza", md: "Alles läuft lokal in deinem Browser. Kein Server sieht deinen Code – nicht einmal, wenn du `hawaii` schreibst." }
      ]
    }
  );
})();
