/* pizza v3.0 – Doku: Standardbibliothek (500–599) & Referenz/Toolchain (600–699) */
(function () {
  "use strict";
  const ziel = typeof self !== "undefined" ? self : globalThis;
  const z = (...zeilen) => zeilen.join("\n");
  const STD = "Standardbibliothek";
  const REF = "Referenz";

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
        { art: "text", md: "Der `Bote` bringt deine Werte an den Tisch – also in die Konsole. Die Standardbibliothek ist immer da, ein `import` ist nicht nötig." },
        {
          art: "tabelle",
          kopf: ["Methode", "Beschreibung", "Beispiel"],
          zeilen: [
            ["`sage(x)`", "Gibt `x` als Text aus, danach Zeilenumbruch.", "`Bote.sage((\"Ciao!\"));`"],
            ["`fehler(x)`", "Wie `sage`, aber auf die Fehlerausgabe (in der Konsole rot). Der Exit-Code bleibt unberührt.", "`Bote.fehler((\"Kein Basilikum mehr!\"));`"]
          ]
        },
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
        { art: "hinweis", ton: "info", md: "Doppelte Klammern wie in `Bote.sage((x));` haben keine Bedeutung – sie sind nur stilistisch erwünscht. Die Textform aller Werte (Pizza, Blech, Dauer …) steht im Kapitel *Ausdrücke*." }
      ]
    },
    {
      id: "std-uhr",
      gruppe: STD,
      ordnung: 510,
      titel: "Uhr – simulierte Zeit",
      tier: 2,
      inhalt: [
        { art: "text", md: "Die `Uhr` ist **simuliert**: Jeder Schritt (ausgewerteter Ausdruck oder Anweisung) kostet genau **1 ms**. Echte Zeit spielt keine Rolle – deshalb ist jeder Lauf reproduzierbar." },
        {
          art: "tabelle",
          kopf: ["Methode", "Beschreibung", "Beispiel"],
          zeilen: [
            ["`jetzt()`", "Dauer seit Programmstart.", "`Dauer t = Uhr.jetzt();`"],
            ["`vorspulen(d)`", "Die Uhr springt um die Dauer `d` vor – praktisch, um Haltbarkeiten (`@Kühlschrank`) zu testen.", "`Uhr.vorspulen((3d));`"]
          ]
        },
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
        { art: "hinweis", ton: "pizza", md: "Konkrete Werte von `Uhr.jetzt()` hängen von der Schrittzahl ab. Vergleiche lieber mit `<`/`>=` als mit `==` – auch ein Pizzaiolo misst die Backzeit nicht auf die Millisekunde." }
      ]
    },
    {
      id: "std-mathe",
      gruppe: STD,
      ordnung: 520,
      titel: "Mathe",
      tier: 1,
      inhalt: [
        { art: "text", md: "Für alles, was rund ist – und Pizzen sind rund." },
        {
          art: "tabelle",
          kopf: ["Methode", "Beschreibung", "Beispiel"],
          zeilen: [
            ["`wurzel(x)`", "Quadratwurzel", "`Mathe.wurzel(16)` → `4`"],
            ["`max(a, b)`", "Größerer Wert", "`Mathe.max(3, 7)` → `7`"],
            ["`min(a, b)`", "Kleinerer Wert", "`Mathe.min(3, 7)` → `3`"],
            ["`abs(x)`", "Betrag", "`Mathe.abs(-12)` → `12`"],
            ["`runden(x)`", "Auf Ganzzahl runden", "`Mathe.runden(7.4)` → `7`"],
            ["`boden(x)`", "Abrunden", "`Mathe.boden(7.9)` → `7`"],
            ["`decke(x)`", "Aufrunden", "`Mathe.decke(7.1)` → `8`"],
            ["`PI`", "Die Kreiszahl (Konstante, ohne `()`)", "`Mathe.PI`"]
          ]
        },
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
            "Bote.sage((Mathe.boden(7.9) + \" / \" + Mathe.decke(7.1)));",
            "Bote.sage((Mathe.abs(-12)));"
          )
        },
        { art: "ausgabe", text: z("Fläche: 804 cm²", "4", "10", "7 / 8", "12") }
      ]
    },
    {
      id: "std-zufall",
      gruppe: STD,
      ordnung: 530,
      titel: "Zufall",
      tier: 1,
      inhalt: [
        { art: "text", md: "`Zufall` würfelt – aber **deterministisch** mit festem Seed 42. Jeder Lauf liefert dieselbe Folge. So bleibt jedes Rezept nachkochbar." },
        {
          art: "tabelle",
          kopf: ["Methode", "Beschreibung", "Beispiel"],
          zeilen: [
            ["`zahl(a, b)`", "Ganzzahl zwischen `a` und `b`, beide **inklusive**.", "`salami w = Zufall.zahl(1, 6);`"]
          ]
        },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "Blech<margherita> sorten = [\"Margherita\", \"Funghi\", \"Diavolo\", \"Quattro Formaggi\"];",
            "salami wahl = Zufall.zahl(1, sorten.länge());",
            "Bote.sage((\"Heute empfiehlt der Chef: \" + sorten.stück(wahl)));",
            "salami wurf = Zufall.zahl(1, 6);",
            "Bote.sage((wurf >= 1 && wurf <= 6));"
          )
        },
        { art: "hinweis", ton: "info", md: "Welche Sorte der Chef empfiehlt, verraten wir hier nicht – probier es aus. Sie ist bei jedem Lauf dieselbe." }
      ]
    },
    {
      id: "std-spiegel",
      gruppe: STD,
      ordnung: 540,
      titel: "Spiegel – Reflection",
      tier: 1,
      inhalt: [
        { art: "text", md: "Mit dem `Spiegel` schaust du in ein Objekt hinein – auch in seine `geheimrezept`-Felder. Nur eine zugeklappte `calzone` lässt sich nicht in den Teig schauen." },
        {
          art: "tabelle",
          kopf: ["Methode", "Beschreibung", "Beispiel"],
          zeilen: [
            ["`felder(obj)`", "`Speisekarte` aller Felder (Name → Wert), inklusive `geheimrezept`. Bei zugeklappter Calzone → `ZugeklapptAnanas`.", "`Spiegel.felder(neu Koch())`"]
          ]
        },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "klasse Koch {",
            "    margherita name = \"Luigi\";",
            "    geheimrezept salami geheimzutaten = 7;",
            "}",
            "calzone klasse Tresor {",
            "    geheimrezept margherita code = \"1234\";",
            "}",
            "",
            "Bote.sage((Spiegel.felder(neu Koch())));",
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
        { art: "ausgabe", text: z("{name: Luigi, geheimzutaten: 7}", "Die Calzone ist zu. Nutze aufklappen().", "{code: 1234}") }
      ]
    },
    {
      id: "std-zahl",
      gruppe: STD,
      ordnung: 550,
      titel: "Zahl-Methoden",
      tier: 1,
      inhalt: [
        { art: "text", md: "Methoden auf `salami`- und `funghi`-Werten. Tipp: Methoden lieber auf Variablen oder geklammerten Ausdrücken aufrufen, z. B. `preis.euro()` oder `((2.5)).euro()`." },
        {
          art: "tabelle",
          kopf: ["Methode", "Beschreibung", "Beispiel"],
          zeilen: [
            ["`euro()`", "Als Eurobetrag mit Komma und zwei Nachkommastellen", "`8` → `\"8,00 €\"`"],
            ["`runden()`", "Auf Ganzzahl runden", "`3.6` → `4`"],
            ["`runden(n)`", "Auf `n` Nachkommastellen runden", "`3.14159.runden(2)` → `3.14`"],
            ["`abs()`", "Betrag", "`-7.9` → `7.9`"],
            ["`ganz()`", "Nachkommastellen abschneiden (nicht runden!)", "`-7.9` → `-7`"],
            ["`alsText()`", "Textform", "`7.5` → `\"7.5\"`"]
          ]
        },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "funghi preis = ((Tomate, Mozzarella, Basilikum)).preis();",
            "Bote.sage((preis.euro()));",
            "funghi pi = 3.14159;",
            "Bote.sage((pi.runden(2)));",
            "Bote.sage((pi.runden()));",
            "funghi minus = -7.9;",
            "Bote.sage((minus.ganz()));",
            "Bote.sage((minus.abs()));",
            "Bote.sage((pi.alsText() + \"!\"));"
          )
        },
        { art: "ausgabe", text: z("8,00 €", "3.14", "3", "-7", "7.9", "3.14159!") }
      ]
    },
    {
      id: "std-text",
      gruppe: STD,
      ordnung: 560,
      titel: "Text-Methoden",
      tier: 1,
      inhalt: [
        { art: "text", md: "Methoden auf `margherita`-Werten (Texten). Wie beim Blech wird ab **1** gezählt – das erste Stück ist Stück 1, nicht Stück 0." },
        {
          art: "tabelle",
          kopf: ["Methode", "Beschreibung", "Beispiel"],
          zeilen: [
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
          ]
        },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "margherita bestellung = \"  Pizza Margherita  \";",
            "margherita t = bestellung.trimme();",
            "Bote.sage((t + \" (\" + t.länge() + \" Zeichen)\"));",
            "Bote.sage((t.groß()));",
            "Bote.sage((t.enthält(\"Marg\")));",
            "Bote.sage((t.ersetze(\"Margherita\", \"Funghi\")));",
            "Bote.sage((t.zeichen(1)));",
            "margherita zutaten = \"Tomate,Mozzarella,Basilikum\";",
            "Bote.sage((zutaten.zerlege(\",\")));",
            "margherita na = \"na\";",
            "Bote.sage((na.wiederhole(3)));",
            "Bote.sage((t.beginntMit(\"Pizza\")));",
            "margherita zahl = \"42\";",
            "Bote.sage((zahl.alsZahl() + 8));"
          )
        },
        { art: "ausgabe", text: z("Pizza Margherita (16 Zeichen)", "PIZZA MARGHERITA", "ja", "Pizza Funghi", "P", "[Tomate, Mozzarella, Basilikum]", "nanana", "ja", "50") },
        { art: "hinweis", ton: "info", md: "`für (margherita c : text) { … }` läuft über die einzelnen Zeichen eines Textes." }
      ]
    },
    {
      id: "std-blech",
      gruppe: STD,
      ordnung: 570,
      titel: "Blech – Listen",
      tier: 1,
      inhalt: [
        { art: "text", md: "Ein `Blech<T>` ist eine Liste. Literale: `[a, b, c]`, Bereiche `[1 .. 8]` (inklusive), leer: `neu Blech<salami>()`. **Gezählt wird ab 1** – wer `stück(0)` verlangt, bekommt eine `KeinStückAnanas`." },
        {
          art: "tabelle",
          kopf: ["Methode", "Beschreibung", "Beispiel"],
          zeilen: [
            ["`länge()`", "Anzahl Elemente", "`[3, 1, 4].länge()` → `3`"],
            ["`stück(i)`", "Element an Position `i` (**ab 1**); außerhalb → `KeinStückAnanas`", "`b.stück(1)`"],
            ["`hinzu(x)`", "Hängt `x` an, gibt das Blech zurück (verkettbar)", "`b.hinzu(9).hinzu(2)`"],
            ["`entferne(i)`", "Entfernt das Element an Position `i`", "`b.entferne(1)`"],
            ["`setze(i, x)`", "Ersetzt das Element an Position `i`", "`b.setze(2, 7)`"],
            ["`enthält(x)`", "Ist `x` drauf?", "`b.enthält(4)` → `ja`"],
            ["`belege(fn)`", "map: wendet `fn` auf jedes Element an", "`b.belege(x -> x * 2)`"],
            ["`filtere(fn)`", "behält nur Elemente, für die `fn` `ja` liefert", "`b.filtere(x -> x > 2)`"],
            ["`zusammenklappen(fn)` / `(fn, start)`", "reduce", "`b.zusammenklappen((a, c) -> a + c, 0)`"],
            ["`summe()`", "Summe aller Zahlen", "`[1, 2, 3].summe()` → `6`"],
            ["`erstes()` / `letztes()`", "Erstes bzw. letztes Element", "`b.letztes()`"],
            ["`umdrehen()`", "Reihenfolge umkehren", "`b.umdrehen()`"],
            ["`sortiere()` / `sortiere((a, b) -> …)`", "Sortieren, optional mit Vergleichsfunktion", "`b.sortiere()`"],
            ["`verbinde(trenner)`", "Elemente zu einem Text verbinden", "`b.verbinde(\", \")`"],
            ["`istLeer()`", "Ist das Blech leer?", "`neu Blech<salami>().istLeer()` → `ja`"],
            ["`schneide(n)`", "In `n` Teil-Bleche schneiden (siehe *Schneiden*), `schneide(auto)` = 8", "`[1 .. 8].schneide(4)`"]
          ]
        },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "Blech<salami> b = [3, 1, 4, 1, 5];",
            "Bote.sage((b.länge() + \" Stück, erstes: \" + b.stück(1)));",
            "Bote.sage((b.summe()));",
            "Bote.sage((b.belege(x -> x * 2)));",
            "Bote.sage((b.filtere(x -> x > 2)));",
            "Bote.sage((b.zusammenklappen((a, c) -> a + c, 100)));",
            "Bote.sage((b.enthält(4)));",
            "Bote.sage((b.verbinde(\" - \")));",
            "Bote.sage(([1 .. 5]));",
            "Bote.sage((neu Blech<salami>().istLeer()));",
            "probier {",
            "    b.stück(99);",
            "} verbrannt (KeinStückAnanas a) {",
            "    Bote.sage((\"Stück 99? Das Blech ist doch kein Partyblech.\"));",
            "}",
            "Bote.sage((b.hinzu(9).sortiere()));"
          )
        },
        { art: "ausgabe", text: z("5 Stück, erstes: 3", "14", "[6, 2, 8, 2, 10]", "[3, 4, 5]", "114", "ja", "3 - 1 - 4 - 1 - 5", "[1, 2, 3, 4, 5]", "ja", "Stück 99? Das Blech ist doch kein Partyblech.", "[1, 1, 3, 4, 5, 9]") }
      ]
    },
    {
      id: "std-speisekarte",
      gruppe: STD,
      ordnung: 580,
      titel: "Speisekarte – Maps",
      tier: 1,
      inhalt: [
        { art: "text", md: "Eine `Speisekarte<K, V>` ordnet Schlüsseln Werte zu – wie eine echte Speisekarte Gerichten Preise. Großgeschrieben ist es der Typ; kleingeschrieben (`speisekarte`) ist es der Modifikator für *public*." },
        {
          art: "tabelle",
          kopf: ["Methode", "Beschreibung", "Beispiel"],
          zeilen: [
            ["`lege(k, v)`", "Legt `v` unter Schlüssel `k` ab (überschreibt)", "`karte.lege(\"Salami\", 9.5)`"],
            ["`hole(k)`", "Wert zu `k`; fehlt er → `karton`", "`karte.hole(\"Salami\")`"],
            ["`hat(k)`", "Gibt es den Schlüssel?", "`karte.hat(\"Tonno\")` → `nein`"],
            ["`entferne(k)`", "Entfernt den Eintrag", "`karte.entferne(\"Salami\")`"],
            ["`schlüssel()`", "`Blech` aller Schlüssel", "`karte.schlüssel()`"],
            ["`werte()`", "`Blech` aller Werte", "`karte.werte()`"],
            ["`länge()`", "Anzahl Einträge", "`karte.länge()`"]
          ]
        },
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
            "}",
            "karte.entferne(\"Salami\");",
            "Bote.sage((karte.schlüssel()));",
            "Bote.sage((karte.werte()));"
          )
        },
        { art: "ausgabe", text: z("{Margherita: 8, Salami: 9.5}", "karton", "ja, 2", "Margherita: 8,00 €", "Salami: 9,50 €", "[Margherita]", "[8]") },
        { art: "hinweis", ton: "info", md: "`für (K k : karte)` läuft über die **Schlüssel** der Speisekarte." }
      ]
    },
    {
      id: "std-dauer",
      gruppe: STD,
      ordnung: 590,
      titel: "Dauer",
      tier: 1,
      inhalt: [
        { art: "text", md: "Dauer-Literale schreibt man als Zahl **direkt** gefolgt von der Einheit: `500ms`, `90s`, `30min`, `1h`, `3d`, auch `1.5s`. Intern zählt pizza in Millisekunden. Die Textform zeigt die größten Einheiten zuerst und lässt Nullteile weg (`1min 30s`)." },
        {
          art: "tabelle",
          kopf: ["Operation / Methode", "Beschreibung", "Beispiel"],
          zeilen: [
            ["`+` / `-`", "Mit anderer Dauer", "`1min + 30s` → `1min 30s`"],
            ["`*` / `/`", "Mit einer Zahl", "`2h / 4` → `30min`"],
            ["`== != < <= > >=`", "Vergleiche", "`90s == 1min + 30s` → `ja`"],
            ["`inMs()`", "Als Millisekunden", "`(90s).inMs()` → `90000`"],
            ["`inSekunden()`", "Als Sekunden", "`(90s).inSekunden()` → `90`"]
          ]
        },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            "Dauer backzeit = 1min + 30s;",
            "Bote.sage((backzeit));",
            "Bote.sage((backzeit * 2));",
            "Bote.sage((2h / 4));",
            "Bote.sage((backzeit.inSekunden()));",
            "Bote.sage((backzeit.inMs()));",
            "Bote.sage((90s == backzeit));",
            "Bote.sage((3d + 4h));"
          )
        },
        { art: "ausgabe", text: z("1min 30s", "3min", "30min", "90", "90000", "ja", "3d 4h") }
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
        { art: "text", md: "Alle 40 reservierten Keywords von pizza v3.0 mit ihrer Java-Entsprechung. **Groß-/Kleinschreibung zählt:** `speisekarte` ist ein Keyword, `Speisekarte` ein Typ. Und `pizza` ist seit v3.0 **kein** Keyword mehr – `pizza`, `Pizza` und `PiZZa` sind ganz normale Bezeichner." },
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
        { art: "text", md: "**Eingebaute Typen** (keine Keywords):" },
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
        { art: "text", md: "**Globale Builtin-Funktionen** (ebenfalls keine Keywords): `teig`, `bestelle`, `schieb`, `teile`, `zwischenstand` – und die Objekte `Bote`, `Uhr`, `Mathe`, `Zufall`, `Spiegel`." }
      ]
    },
    {
      id: "ref-codes",
      gruppe: REF,
      ordnung: 610,
      titel: "Fehler- & Warnungscodes",
      tier: 1,
      inhalt: [
        { art: "text", md: "**PizzaFehler** sind fatal: Das Programm startet gar nicht erst oder bricht sofort ab (Exit-Code 2, beim Schrittlimit 3). Sie lassen sich **nicht** mit `probier` fangen – im Gegensatz zu Ananas." },
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
        { art: "text", md: "**Warnungen** erscheinen einmal pro Code und Stelle und ändern den Exit-Code **nicht**." },
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
        { art: "text", md: "Ein `K0001` in freier Wildbahn – pizza lässt kein `serviere` ohne Klammern durch:" },
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
        { art: "text", md: "Und ein `B0012` – Käse gehört **auf** die Tomate:" },
        {
          art: "code",
          ausfuehrbar: true,
          exitCode: 2,
          tier: 1,
          code: "Pizza auflauf = ((Käse, Tomate));"
        },
        { art: "text", md: "Warnungen dagegen sind nur ein Stirnrunzeln – das Programm läuft weiter:" },
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
        { art: "text", md: "Jeder Lauf endet mit einem Exit-Code. Die Konsole zeigt ihn als Badge." },
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
        { art: "text", md: "Exit-Code 1 zum Nachkochen:" },
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
        { art: "hinweis", ton: "warnung", md: "**Nur Spezifikation.** Die Toolchain gibt es (noch) nur auf dem Papier. Im Browser läuft pizza direkt im Interpreter – Ofen vorheizen nicht nötig." },
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
        { art: "text", md: "Der Editor ist der Tresen – hier die Handgriffe für den schnellen Service:" },
        {
          art: "tabelle",
          kopf: ["Kürzel", "Aktion"],
          zeilen: [
            ["`Strg+Enter`", "Programm ausführen – ab in den Ofen"],
            ["`Strg+S`", "Code lokal im Browser speichern"],
            ["`Strg+B`", "Seitenpanel (Doku · Beispiele) ein-/ausklappen"]
          ]
        },
        { art: "text", md: "Jeder Code-Block in dieser Doku und jedes Beispiel lässt sich mit **„Im Editor öffnen“** direkt übernehmen. Ein Lauf darf höchstens 10 Sekunden echte Zeit dauern – danach heißt es: „Die Pizza ist noch im Ofen (Zeitlimit)“." },
        { art: "hinweis", ton: "pizza", md: "Alles läuft lokal in deinem Browser. Kein Server sieht deinen Code – nicht einmal, wenn du `hawaii` schreibst." }
      ]
    }
  );
})();
