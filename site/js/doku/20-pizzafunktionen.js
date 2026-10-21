/* pizza v3.0 – Doku: Pizza-Funktionen (ordnung 300–399) */
(function () {
  "use strict";
  const ziel = typeof self !== "undefined" ? self : globalThis;
  const z = (...zeilen) => zeilen.join("\n");
  const G = "Pizza-Funktionen";

  (ziel.PIZZA_DOKU = ziel.PIZZA_DOKU || []).push(
    // ------------------------------------------------------------------
    {
      id: "pizzafunktionen-warum",
      gruppe: G,
      ordnung: 300,
      titel: "Warum Pizza-Funktionen?",
      tier: 2,
      inhalt: [
        { art: "text", md: "Andere Sprachen haben *Futures*, *Lazy Values*, *Timeouts* und *Ownership*. pizza hat **Lieferungen**, **Teig**, **Öfen** und **Stücke**. Hinter jeder Metapher steckt ein echtes, ernst gemeintes Programmierkonzept – nur eben mit mehr Mozzarella." },
        { art: "text", md: "Die folgende Tabelle ist der Spickzettel für alle, die schon eine andere Sprache sprechen. Die Spalte *Tier* sagt, wie ehrlich der Playground das Konzept umsetzt: **Tier 1** läuft exakt wie beschrieben, **Tier 2** läuft mit vereinfachter bzw. simulierter Semantik (z. B. Parallelität sequentiell, Zeit als Schrittzähler)." },
        {
          art: "tabelle",
          kopf: ["Pizza-Metapher", "Echtes Konzept", "Tier"],
          zeilen: [
            ["Pizza-Literal `((Tomate, Käse))`, `p + Salami`", "Unveränderliche Werte (immutable data): jede Änderung erzeugt eine neue Pizza", "1"],
            ["Eigener `belag … auf Pizza`, `unten`", "Decorator-Pattern / Middleware-Kette (`unten` ≈ `super` bzw. `next`)", "1"],
            ["`@Nach(Tomate)` / B0012 „Auflauf“", "Invarianten, die bei jeder Konstruktion geprüft werden", "1"],
            ["Simulierte Uhr, Schritte", "Deterministische virtuelle Zeit, Fuel-/Step-Counter", "2"],
            ["`teig(...)`, `gehenlassen()`, `backen()`", "Lazy Evaluation, Thunk mit Memoisierung (`Lazy<T>`)", "2"],
            ["`ofen(...) { } roh (r) { }`", "Timeout mit Zeitbudget und Teilergebnis (*anytime algorithm*)", "2"],
            ["`schneide(n)`, `blech / n`", "Datenparallelität, Fork/Join, Map-Reduce", "2 (sequentiell simuliert)"],
            ["`schieb(p)`, `teile(p)`, `BesitzAnanas`", "Ownership & Move-Semantik (à la Rust), Referenzzählung", "2 (Laufzeitprüfung)"],
            ["`@Kühlschrank`, `.mikrowelle()`", "Memoisierung/Caching mit TTL, *stale-while-revalidate*", "2"],
            ["`bestelle`, `trinkgeld`, `warte`, `wennDa`", "Futures/Promises, Prioritäten, Timeout mit Fallback, Callbacks", "2"],
            ["`calzone klasse`, `aufklappen()`", "Starke Kapselung, die auch Reflection standhält", "1"]
          ]
        },
        { art: "hinweis", ton: "info", md: "Der Playground läuft komplett im Browser und ist deterministisch: Es gibt **keine echten Threads** und **keine Wanduhr**. Zeit wird in Schritten gemessen (1 Schritt = 1 ms simulierte Zeit). Echte Parallelität bei `schneide`, echte Hintergrund-Threads bei `teig` und `bestelle` sind **Tier 3** – also nur Spezifikation für den (ebenfalls nur spezifizierten) Compiler `pizzaiolo`." },
        { art: "text", md: "Ein kleiner Rundgang durch die Küche – hier kommen Pizza, Ofen, Schneiden und Stücke zusammen:" },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Pizza p = ((Tomate, Mozzarella, Basilikum));',
            'Bote.sage(("Bestellt: " + p + " für " + p.preis().euro()));',
            '',
            'salami ergebnis = ofen(temperatur: 450, zeit: 90s) {',
            '    serviere (([1 .. 8].summe()));',
            '};',
            'Bote.sage(("Aus dem Ofen: " + ergebnis));',
            '',
            'Blech<salami> teller = [1 .. 8] / 4;',
            'Bote.sage(("Geschnitten: " + teller));',
            '',
            'Stück<Pizza> meins = teile(p);',
            'Bote.sage(("Noch übrig: " + p.übrig() + " Stücke"));'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "Bestellt: ((Tomate, Mozzarella, Basilikum)) für 8,00 €",
            "Aus dem Ofen: 36",
            "Geschnitten: [[1, 2], [3, 4], [5, 6], [7, 8]]",
            "Noch übrig: 7 Stücke"
          )
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "pizza-literale",
      gruppe: G,
      ordnung: 310,
      titel: "Pizza-Literale & Beläge",
      tier: 1,
      inhalt: [
        { art: "text", md: "Eine Pizza ist in pizza ein ganz normaler Wert vom Typ `Pizza`. Man schreibt sie als **Pizza-Literal** in doppelten runden Klammern: `((Tomate, Mozzarella, Basilikum))`. Die Reihenfolge ist die **Schichtreihenfolge von unten nach oben** – Tomate liegt auf dem Teig, Basilikum ganz oben. Die leere Pizza (nur Teig) heißt `(())` oder `neu Pizza()`." },
        { art: "text", md: "Der Parser erkennt ein Pizza-Literal nur, wenn zwischen `((` und `))` ausschließlich **großgeschriebene, einfache Bezeichner** stehen, durch Kommas getrennt. Alles andere – `((x + 1))`, `((\"Text\"))`, `((a.b))` – ist eine ganz gewöhnliche doppelte Klammerung, die in pizza ohnehin zum guten Ton gehört." },
        { art: "text", md: "Pizzen sind **unveränderlich**:\n\n- `p + Salami` liefert eine **neue** Pizza mit Salami ganz oben.\n- `p - Chili` liefert eine **neue** Pizza ohne (alle) Chili.\n- `p` selbst bleibt, wie es ist. Kein Pizzaiolo kratzt nachträglich Beläge von einer fertigen Pizza." },
        { art: "text", md: "Der Preis einer Pizza ist der **Grundpreis von 5,00** für den Teig plus die Preise aller Beläge. Zwei Pizzen sind gleich (`==`), wenn sie dieselben Beläge in derselben Reihenfolge haben." },
        {
          art: "tabelle",
          kopf: ["Methode", "auf", "Ergebnis"],
          zeilen: [
            ["`preis()`", "Pizza", "Grundpreis 5.00 + Summe der Belagpreise"],
            ["`beläge()`", "Pizza", "Blech der Belagnamen (als Text), unten → oben"],
            ["`hat(Belag)`", "Pizza", "`ja`, wenn der Belag drauf ist"],
            ["`anzahlBeläge()`", "Pizza", "Anzahl der Schichten"],
            ["`alsText()`", "Pizza", "z. B. `((Tomate, Mozzarella))`, leer: `(())`"],
            ["`übrig()`", "Pizza", "verbleibende Stücke, siehe *Stücke & Ownership*"],
            ["`name()`", "Belag", "Name als Text, z. B. `Salami`"],
            ["`preis()`", "Belag", "Preis laut Zutatenliste"]
          ]
        },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            'Pizza p = ((Tomate, Mozzarella, Basilikum));',
            'Bote.sage((p));',
            'Bote.sage((p.preis()));',
            'Bote.sage((p.preis().euro()));',
            '',
            'Pizza scharf = p + Chili + Salami;   // neue Pizza, p bleibt unverändert',
            'Bote.sage((scharf));',
            'Bote.sage((scharf.preis()));',
            'Bote.sage((scharf - Chili));',
            'Bote.sage((scharf.hat(Chili)));',
            'Bote.sage((scharf.beläge()));',
            'Bote.sage((p));',
            '',
            'Pizza nackt = (());',
            'Bote.sage((nackt + " kostet " + nackt.preis()));',
            '',
            'Pizza a1 = ((Tomate, Käse));',
            'Pizza a2 = ((Tomate, Käse));',
            'Bote.sage((a1 == a2));',
            'Bote.sage((Salami.name() + " kostet " + Salami.preis().euro()));'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "((Tomate, Mozzarella, Basilikum))",
            "8",
            "8,00 €",
            "((Tomate, Mozzarella, Basilikum, Chili, Salami))",
            "10",
            "((Tomate, Mozzarella, Basilikum, Salami))",
            "ja",
            "[Tomate, Mozzarella, Basilikum, Chili, Salami]",
            "((Tomate, Mozzarella, Basilikum))",
            "(()) kostet 5",
            "ja",
            "Salami kostet 1,50 €"
          )
        },
        { art: "text", md: "Ein großgeschriebener Bezeichner, der weder Variable noch Klasse ist, wird auf der **Zutatenliste** nachgeschlagen. Steht er dort nicht, gibt es eine `UnbekannterBelagAnanas` – die ist fangbar, denn Gummibärchen auf Pizza ist zwar falsch, aber kein Weltuntergang:" },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            'probier {',
            '    Pizza kinder = ((Tomate, Gummibärchen));',
            '    Bote.sage((kinder));',
            '} verbrannt (UnbekannterBelagAnanas e) {',
            '    Bote.sage((e.nachricht()));',
            '}'
          )
        },
        { art: "ausgabe", text: "'Gummibärchen' steht nicht auf der Zutatenliste." },
        { art: "text", md: "**Die eingebaute Zutatenliste.** Die Spalte `@Nach` gibt an, über welchem Belag eine Zutat liegen muss (siehe *Eigene Beläge*)." },
        {
          art: "tabelle",
          kopf: ["Belag", "Preis", "@Nach"],
          zeilen: [
            ["Tomate", "1.00", ""],
            ["Mozzarella", "1.50", "Tomate"],
            ["Käse", "1.00", "Tomate"],
            ["Basilikum", "0.50", "Mozzarella"],
            ["Salami", "1.50", ""],
            ["Schinken", "1.50", ""],
            ["Pilze", "1.00", ""],
            ["Oliven", "1.00", ""],
            ["Zwiebeln", "0.50", ""],
            ["Paprika", "0.80", ""],
            ["Chili", "0.50", ""],
            ["Peperoni", "0.80", ""],
            ["Rucola", "1.00", "Mozzarella"],
            ["Parmesan", "1.20", "Tomate"],
            ["Gorgonzola", "1.50", "Tomate"],
            ["Thunfisch", "2.00", ""],
            ["Sardellen", "1.80", ""],
            ["Artischocken", "1.50", ""],
            ["Spinat", "1.00", ""],
            ["Ei", "0.80", ""],
            ["Mais", "0.50", ""],
            ["Knoblauch", "0.30", ""],
            ["Kapern", "0.70", ""],
            ["Ananas", "–", "löst Hawaii aus"]
          ]
        },
        { art: "hinweis", ton: "warnung", md: "`Ananas` steht zwar auf der Zutatenliste, aber eine Pizza mit Ananas löst eine **nicht fangbare Kernel-Panik** aus (Exit-Code 39). Details im Abschnitt über Hawaii. Wir haben Sie gewarnt." },
        { art: "hinweis", ton: "pizza", md: "Preise sind Kommazahlen. Wer viele Beläge mit `0.80` stapelt, kann die üblichen Fließkomma-Krümel sehen (`7.800000000000001`). Für die Rechnung gibt es `preis().euro()` – das rundet auf zwei Stellen und setzt ein Komma, wie es sich gehört." }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "eigene-belaege",
      gruppe: G,
      ordnung: 320,
      titel: "Eigene Beläge (Decorators)",
      tier: 1,
      inhalt: [
        { art: "text", md: "Mit `belag Name auf Pizza { … }` definieren Sie einen eigenen Belag. Das ist das **Decorator-Pattern** in essbar: Jede Schicht kann Methoden der Pizza überschreiben oder neue hinzufügen und mit `unten` auf die Schichten **darunter** zugreifen – so wie `super` bzw. `next()` in einer Middleware-Kette." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            '@Nach(Tomate)',
            'belag Trüffel auf Pizza {',
            '    speisekarte funghi preis() {',
            '        serviere ((unten.preis() + 4.50));',
            '    }',
            '    speisekarte margherita beschreibung() {',
            '        serviere (("edel: " + unten.beschreibung()));',
            '    }',
            '}',
            '',
            'belag Extrakäse auf Pizza {',
            '    speisekarte margherita beschreibung() {',
            '        serviere ((unten.beschreibung() + " + viel Käse"));',
            '    }',
            '}',
            '',
            'Pizza fein = ((Tomate, Mozzarella, Trüffel));',
            'Bote.sage((fein.preis()));',
            'Bote.sage((fein.beschreibung()));',
            '',
            'Pizza deluxe = ((Tomate, Trüffel, Extrakäse));',
            'Bote.sage((deluxe));',
            'Bote.sage((deluxe.preis()));',
            'Bote.sage((deluxe.beschreibung()));'
          )
        },
        { art: "ausgabe", text: z("12", "edel: Teig", "((Tomate, Trüffel, Extrakäse))", "11.5", "edel: Teig + viel Käse") },
        { art: "text", md: "**So funktioniert der Dispatch.** Eine Pizza mit den Schichten `s1 … sk` (unten → oben) beantwortet einen Methodenaufruf `m` von **oben nach unten**:\n\n- Ist man ganz unten beim Teig angekommen (`k == 0`), antwortet die eingebaute Pizza: `preis()` liefert den Grundpreis 5.00, `beschreibung()` liefert `\"Teig\"`.\n- Definiert die oberste betrachtete Schicht `sk` die Methode `m`, wird sie ausgeführt. Darin ist `dies` die **ganze** Pizza und `unten` eine Sicht auf die Schichten `1 … k-1`.\n- Sonst wird nach unten durchgereicht. Bei `preis` kommt dabei der Standardpreis der übersprungenen Schicht dazu (laut Zutatenliste, unbekannte eigene Beläge kosten 1.00)." },
        { art: "text", md: "Nachgerechnet für `deluxe`: Extrakäse hat kein eigenes `preis()` → 1.00 + Preis darunter. Trüffel rechnet `unten.preis() + 4.50`, darunter liegt Tomate (1.00) auf dem Teig (5.00). Macht 1.00 + 4.50 + 1.00 + 5.00 = **11.5**. Bei `beschreibung()` wickelt jede Schicht ihren Text um das Ergebnis von unten – klassischer Decorator." },
        { art: "text", md: "Eigene Methoden wie `beschreibung()` sind auf **jeder** Pizza aufrufbar, die den Belag trägt. Sie dürfen auch eingebaute Beläge wie `Käse` neu definieren; ohne eigenes `preis()` gilt dann weiter der Preis aus der Zutatenliste." },
        { art: "text", md: "**@Nach – die Schichtreihenfolge.** Ein Belag mit `@Nach(Y)` darf **nicht unterhalb** von `Y` liegen. Fehlt `Y` auf der Pizza ganz, ist alles erlaubt. Geprüft wird bei **jeder** Pizza-Erzeugung – im Literal und bei `+`. Weil `+` immer oben auflegt, fliegt man auch damit auf die Nase, wenn man Tomate über den Käse kippt:" },
        {
          art: "code",
          ausfuehrbar: true,
          exitCode: 2,
          tier: 1,
          code: z(
            'Pizza gut = ((Tomate, Käse));',
            'Bote.sage((gut));',
            'Pizza auchGut = ((Käse));          // keine Tomate da? Dann ist alles erlaubt.',
            'Bote.sage((auchGut));',
            'Pizza auflauf = auchGut + Tomate;  // Tomate über den Käse kippen ...',
            'Bote.sage(("Das hier liest niemand mehr."));'
          )
        },
        { art: "ausgabe", text: z("((Tomate, Käse))", "((Käse))") },
        { art: "hinweis", ton: "warnung", md: "Ein Verstoß ist **keine Ananas**, sondern ein fataler `PizzaFehler` – `probier`/`verbrannt` helfen nicht, das Programm endet mit **Exit-Code 2**:\n\n`PizzaFehler B0012: 'Käse' liegt unter 'Tomate'. Das ist keine Pizza, das ist ein Auflauf.`" },
        { art: "text", md: "Das gilt genauso für eigene Beläge – `@Nach` gehört direkt vor die `belag`-Deklaration und darf mehrere Beläge nennen, z. B. `@Nach(Tomate, Mozzarella)`:" },
        {
          art: "code",
          ausfuehrbar: true,
          exitCode: 2,
          tier: 1,
          code: z(
            '@Nach(Tomate, Mozzarella)',
            'belag Burrata auf Pizza { }',
            '',
            'Pizza cremig = ((Tomate, Mozzarella, Burrata));',
            'Bote.sage((cremig.preis()));',
            'Pizza falsch = ((Burrata, Tomate));   // B0012: Burrata liegt unter Tomate'
          )
        },
        { art: "ausgabe", text: "8.5" }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "simulierte-uhr",
      gruppe: G,
      ordnung: 330,
      titel: "Simulierte Uhr & Schritte",
      tier: 2,
      inhalt: [
        { art: "text", md: "Viele Pizza-Funktionen haben mit Zeit zu tun: Öfen haben Backzeiten, Lieferungen kommen zu spät, Reste im Kühlschrank werden matschig. Damit das im Browser **deterministisch** und reproduzierbar bleibt, benutzt pizza keine echte Uhr, sondern eine **simulierte**:\n\n- Jeder ausgewertete Ausdruck und jede Anweisung ist ein **Schritt**.\n- Die simulierte Uhr läuft **1 ms pro Schritt**.\n- `Uhr.jetzt()` liefert die `Dauer` seit Programmstart, `Uhr.vorspulen(d)` lässt die Uhr um `d` springen – praktisch, um Kühlschrank-Haltbarkeiten zu testen, ohne drei Tage zu warten." },
        { art: "hinweis", ton: "info", md: "**Tier 2:** Wie viele Schritte genau eine Anweisung kostet, ist ein Implementierungsdetail des Playgrounds. Verlassen Sie sich auf Größenordnungen (*„eine Schleife mit 100 Runden braucht mehr als 100 Schritte“*), nicht auf exakte Zahlen." },
        { art: "text", md: "Zeitangaben schreibt man als **Dauer-Literal**: Zahl direkt gefolgt von `ms`, `s`, `min`, `h` oder `d`. Dauern lassen sich addieren, mit Zahlen multiplizieren und vergleichen; als Text erscheinen sie mit den größten Einheiten zuerst." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Dauer pause = 90s;',
            'Bote.sage((pause));',
            'Bote.sage((pause * 2));',
            'Bote.sage((1h + 30min));',
            'Bote.sage((1.5s));',
            'Bote.sage((pause.inMs()));',
            '',
            'Dauer start = Uhr.jetzt();',
            'salami summe = 0;',
            'für (salami i = 1; i <= 100; i++) {',
            '    summe += i;',
            '}',
            'Dauer gebraucht = Uhr.jetzt() - start;',
            'Bote.sage(("Summe: " + summe));',
            'Bote.sage(("Mehr als 100 Schritte? " + (gebraucht > 100ms)));',
            'Bote.sage(("Weniger als 10 Sekunden? " + (gebraucht < 10s)));',
            '',
            'Uhr.vorspulen(3d);',
            'Bote.sage(("Drei Tage später? " + (Uhr.jetzt() > 3d)));'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "1min 30s",
            "3min",
            "1h 30min",
            "1s 500ms",
            "90000",
            "Summe: 5050",
            "Mehr als 100 Schritte? ja",
            "Weniger als 10 Sekunden? ja",
            "Drei Tage später? ja"
          )
        },
        { art: "text", md: "**Das Schrittlimit.** Damit eine Endlosschleife nicht den Browser verheizt, gibt es ein globales Limit von **5 000 000 Schritten**. Wird es erreicht, endet das Programm mit **Exit-Code 3**:\n\n`PizzaFehler P0002: Die Pizza ist noch im Ofen. (Schrittlimit erreicht – Endlosschleife?)`" },
        {
          art: "code",
          ausfuehrbar: true,
          exitCode: 3,
          tier: 2,
          code: z(
            'Bote.sage(("Ofen an. Ich schau mal kurz weg ..."));',
            'solange (ja) {',
            '    // der Pizzaiolo wartet. und wartet. und wartet.',
            '}'
          )
        },
        { art: "ausgabe", text: "Ofen an. Ich schau mal kurz weg ..." },
        { art: "hinweis", ton: "pizza", md: "Zusätzlich zieht die Weboberfläche nach **10 Sekunden echter Zeit** den Stecker. Fünf Millionen Schritte schafft ein moderner Browser aber meist deutlich schneller – die Pizza verbrennt also vorher von selbst." }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "teig",
      gruppe: G,
      ordnung: 340,
      titel: "Teig (Lazy Evaluation)",
      tier: 2,
      inhalt: [
        { art: "text", md: "Guter Teig braucht Zeit. `teig(fn)` verpackt eine Berechnung, **ohne sie auszuführen** – ein *Thunk*, wie man in der funktionalen Küche sagt. Das Ergebnis vom Typ `Teig<T>` wird erst gebacken, wenn jemand den Wert wirklich braucht, und dann **höchstens einmal** berechnet (Memoisierung)." },
        {
          art: "tabelle",
          kopf: ["Methode", "Wirkung"],
          zeilen: [
            ["`gehenlassen()`", "berechnet den Wert „im Hintergrund“ und merkt ihn sich; gibt den Teig zurück"],
            ["`backen()`", "liefert den Wert; berechnet ihn nur, falls noch nicht geschehen"],
            ["`istAufgegangen()`", "`ja`, sobald der Wert berechnet ist"]
          ]
        },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'salami zähler = 0;',
            '',
            'Teig<salami> t = teig(() -> {',
            '    zähler += 1;',
            '    serviere ((6 * 7));',
            '});',
            '',
            '// Dieser Teig würde beim Backen explodieren – wird aber nie gebacken.',
            'Teig<salami> gefahr = teig(() -> (1 / 0));',
            '',
            'Bote.sage(("Aufgegangen? " + t.istAufgegangen()));',
            't.gehenlassen();',
            'Bote.sage(("Aufgegangen? " + t.istAufgegangen()));',
            'Bote.sage((t.backen()));',
            'Bote.sage((t.backen()));',
            'Bote.sage(("Berechnet: " + zähler + "x"));'
          )
        },
        { art: "ausgabe", text: z("Aufgegangen? nein", "Aufgegangen? ja", "42", "42", "Berechnet: 1x") },
        { art: "text", md: "Der Teig `gefahr` enthält eine Division durch null – weil ihn aber niemand backt, passiert: nichts. Genau das ist der Witz an Lazy Evaluation." },
        { art: "text", md: "Wer `backen()` aufruft, ohne den Teig vorher `gehenlassen()` zu haben, bekommt trotzdem seinen Wert – aber auch eine Warnung vom Pizzaiolo:\n\n`T0007: Teig wird gebacken, ohne gehen gelassen worden zu sein. Das schmeckt flach.`" },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Teig<margherita> fladen = teig(() -> ("Fladenbrot"));',
            'Bote.sage((fladen.backen()));   // Warnung T0007, Exit-Code bleibt 0'
          )
        },
        { art: "ausgabe", text: "Fladenbrot" },
        { art: "hinweis", ton: "info", md: "**Tier 2:** „Im Hintergrund“ heißt im Playground: `gehenlassen()` rechnet **sofort und sequentiell**. Es gibt keinen echten Hintergrund-Thread – der ist Tier 3. Für die Semantik (einmal berechnen, später abholen) macht das keinen Unterschied." }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "ofen",
      gruppe: G,
      ordnung: 350,
      titel: "Ofen (Zeitbudget)",
      tier: 2,
      inhalt: [
        { art: "text", md: "Der `ofen` ist ein **Ausdruck**, der einen Block mit einem **Zeitbudget** ausführt. Er ist pizzas Antwort auf Timeouts – mit einer Besonderheit: Läuft die Zeit ab, ist nicht alles verloren. Mit `zwischenstand(x)` merkt sich der Block ein **Teilergebnis**, das man im `roh`-Zweig abholen kann (ein sogenannter *anytime algorithm*)." },
        {
          art: "code",
          ausfuehrbar: false,
          code: z(
            'salami s = ofen(temperatur: 450, zeit: 90s) {',
            '    // ... rechnen ...',
            '    zwischenstand((teilsumme));   // Teilergebnis merken',
            '    serviere ((summe));            // Wert des ofen-Ausdrucks',
            '} roh (r) {',
            '    serviere ((r.teilergebnis())); // Budget überschritten',
            '} verbrannt (VerbranntAnanas a) {',
            '    serviere ((-1));               // Ananas im Block',
            '};'
          )
        },
        {
          art: "tabelle",
          kopf: ["Teil", "Bedeutung"],
          zeilen: [
            ["`temperatur:`", "benanntes Argument, Standard **250**; über **485** → `VerbranntAnanas(\"Zu heiß! Selbst Neapel hat Grenzen.\")`"],
            ["`zeit:`", "benanntes Argument (Dauer), Standard **60s**"],
            ["Budget", "**zeit_ms × temperatur / 250** Schritte – ein heißer Ofen backt schneller"],
            ["`serviere ((x));`", "liefert den Wert des `ofen`-Ausdrucks – verlässt **nicht** die umgebende Methode"],
            ["`roh (r)`", "läuft bei Budgetüberschreitung; `r.teilergebnis()` (letzter `zwischenstand` oder `karton`), `r.verbrauchteZeit()` (Dauer)"],
            ["`verbrannt (…)`", "fängt Ananas aus dem Block (oder durch zu hohe Temperatur), Syntax wie bei `probier`"]
          ]
        },
        {
          art: "tabelle",
          kopf: ["Aufruf", "Budget in Schritten"],
          zeilen: [
            ["Standardwerte (250 Grad, 60s)", "60 000 × 250 / 250 = **60 000**"],
            ["`ofen(temperatur: 450, zeit: 90s)`", "90 000 × 450 / 250 = **162 000**"],
            ["`ofen(temperatur: 485, zeit: 1s)`", "1 000 × 485 / 250 = **1 940**"],
            ["`ofen(zeit: 50ms)`", "**50** – das reicht für kaum mehr als ein Aufbacken"],
            ["`ofen(temperatur: 500)`", "gar keins: `VerbranntAnanas`, bevor der Block startet"]
          ]
        },
        { art: "text", md: "Im Budget: Der Block läuft durch, `serviere` liefert den Wert. Beachten Sie, dass `serviere` im Ofen nur den Ofen verlässt, nicht die Methode drumherum:" },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'klasse Bäcker {',
            '    speisekarte tiefkühl margherita backe() {',
            '        margherita x = ofen(zeit: 1s) {',
            '            serviere (("innen"));',
            '        };',
            '        serviere (("außen, nach " + x));',
            '    }',
            '}',
            '',
            'salami s = ofen(temperatur: 450, zeit: 90s) {',
            '    salami summe = 0;',
            '    für (salami i = 1; i <= 100; i++) {',
            '        summe += i;',
            '    }',
            '    serviere ((summe));',
            '};',
            'Bote.sage(("Fertig gebacken: " + s));',
            'Bote.sage((Bäcker.backe()));'
          )
        },
        { art: "ausgabe", text: z("Fertig gebacken: 5050", "außen, nach innen") },
        { art: "text", md: "Über dem Budget mit `roh`-Zweig: Eine Schleife über eine Million Zahlen passt niemals in 1 000 Schritte. Der Ofen bricht ab, und wir nehmen, was bis dahin gar ist:" },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'salami s = ofen(zeit: 1s) {',
            '    salami summe = 0;',
            '    für (salami i = 1; i <= 1_000_000; i++) {',
            '        summe += i;',
            '        zwischenstand((summe));',
            '    }',
            '    serviere ((summe));',
            '} roh (r) {',
            '    Bote.sage(("Noch roh nach " + r.verbrauchteZeit()));',
            '    serviere ((r.teilergebnis()));',
            '};',
            'Bote.sage(("Teilergebnis vorhanden? " + (s > 0)));',
            'Bote.sage(("Vollständig? " + (s == 500_000_500_000)));'
          )
        },
        { art: "text", md: "Die genaue verbrauchte Zeit (ungefähr 1 s simulierte Zeit) und das genaue Teilergebnis hängen davon ab, wie viele Schritte eine Schleifenrunde kostet – sicher ist nur: Es gibt ein Teilergebnis, und es ist nicht die volle Summe." },
        { art: "text", md: "Ohne `roh`-Zweig wirft ein überzogener Ofen eine `VerbranntAnanas` mit der Meldung `Zu lange im Ofen: Budget von N Schritten überschritten.` Die lässt sich wie jede Ananas fangen:" },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'probier {',
            '    salami s = ofen(zeit: 1s) {',
            '        solange (ja) { }',
            '        serviere ((1));',
            '    };',
            '    Bote.sage((s));',
            '} verbrannt (VerbranntAnanas e) {',
            '    Bote.sage((e.nachricht()));',
            '}'
          )
        },
        { art: "ausgabe", text: "Zu lange im Ofen: Budget von 1000 Schritten überschritten." },
        { art: "text", md: "Zu heiß ist auch keine Lösung. Ab 486 Grad verweigert der Ofen den Dienst – der eigene `verbrannt`-Zweig fängt das:" },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'margherita ergebnis = ofen(temperatur: 500, zeit: 10s) {',
            '    serviere (("perfekt"));',
            '} verbrannt (VerbranntAnanas e) {',
            '    serviere (("verkohlt: " + e.nachricht()));',
            '};',
            'Bote.sage((ergebnis));',
            '',
            'margherita kruste = ofen(zeit: 10s) {',
            '    wirf neu VerbranntAnanas("Rand angebrannt");',
            '} verbrannt (e) {',
            '    serviere (("gerettet: " + e.nachricht()));',
            '};',
            'Bote.sage((kruste));'
          )
        },
        { art: "ausgabe", text: z("verkohlt: Zu heiß! Selbst Neapel hat Grenzen.", "gerettet: Rand angebrannt") },
        { art: "hinweis", ton: "info", md: "**Tier 2:** Das Budget wird in Schritten der simulierten Uhr gemessen, nicht in echten Millisekunden. `temperatur` ist dabei nur ein Multiplikator – der Playground rechnet nicht wirklich schneller, wenn man aufdreht. Ananas, die keiner der `verbrannt`-Zweige fängt, fliegen einfach weiter nach außen." }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "schneiden",
      gruppe: G,
      ordnung: 360,
      titel: "Schneiden (Parallelität)",
      tier: 2,
      inhalt: [
        { art: "text", md: "Eine große Aufgabe teilt man wie eine große Pizza: in Stücke. `blech.schneide(n)` zerlegt ein Blech in `n` Teil-Bleche – so gleichmäßig wie möglich, vordere Stücke bekommen bei Rest je eins mehr. Danach arbeitet man die Stücke mit `.belege(fn)` (map) ab und klappt die Teilergebnisse mit `.zusammenklappen(fn)` (reduce) zusammen. Das ist **Fork/Join** bzw. **Map-Reduce** mit Käse." },
        {
          art: "tabelle",
          kopf: ["Schreibweise", "Wirkung"],
          zeilen: [
            ["`blech.schneide(n)`", "`n` Teil-Bleche, möglichst gleich groß, vordere ggf. größer"],
            ["`blech.schneide(auto)`", "8 Stücke – wie bei einer richtigen Pizza (`auto` gibt es nur hier)"],
            ["`blech / n`", "wie `schneide(n)`, aber **fair**: geht es nicht auf → `StreitAnanas`"],
            ["`schneide(7)`", "funktioniert, aber Warnung `S0007`"]
          ]
        },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Blech<salami> zahlen = [1 .. 8];',
            'Bote.sage((zahlen.schneide(3)));',
            'Bote.sage(([1 .. 16].schneide(auto)));',
            '',
            '// Map-Reduce: jedes Stück einzeln summieren, dann zusammenklappen',
            'Blech<salami> teilsummen = (zahlen / 4).belege(teil -> (teil.summe()));',
            'Bote.sage((teilsummen));',
            'Bote.sage((teilsummen.zusammenklappen((a, b) -> (a + b))));'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "[[1, 2, 3], [4, 5, 6], [7, 8]]",
            "[[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16]]",
            "[3, 7, 11, 15]",
            "36"
          )
        },
        { art: "text", md: "Der `/`-Operator ist der strenge Bruder von `schneide`: Er besteht auf gleich großen Stücken. Acht Stücke durch drei? Da gibt es Streit am Tisch." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'probier {',
            '    Bote.sage(([1 .. 8] / 3));',
            '} verbrannt (StreitAnanas e) {',
            '    Bote.sage((e.nachricht()));',
            '}',
            '',
            '// Erlaubt, aber der Pizzaiolo runzelt die Stirn (Warnung S0007):',
            'Bote.sage(([1 .. 14].schneide(7)));'
          )
        },
        { art: "ausgabe", text: z("8 Stücke lassen sich nicht fair durch 3 teilen.", "[[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14]]") },
        { art: "hinweis", ton: "pizza", md: "`S0007: 7 Stücke? Wer schneidet eine Pizza in 7 Stücke?` – Warnungen ändern den Exit-Code nicht. Sie ändern nur, wie der Pizzaiolo Sie ansieht." },
        { art: "hinweis", ton: "info", md: "**Tier 2 – Parallelität wird im Playground sequentiell simuliert.** Die Stücke werden nacheinander in einem einzigen Thread abgearbeitet; das Ergebnis ist dasselbe, nur die Geschwindigkeit nicht. Echte parallele Ausführung auf mehreren Kernen ist **Tier 3** (nur Spezifikation)." }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "stuecke-ownership",
      gruppe: G,
      ordnung: 370,
      titel: "Stücke & Ownership",
      tier: 2,
      inhalt: [
        { art: "text", md: "Eine Pizza hat **genau einen Besitzer**. Wer schon einmal versucht hat, eine Pizza gleichzeitig an Tisch 3 und Tisch 7 zu servieren, kennt das Problem. pizza löst es wie Rust: mit **Ownership** und **Move-Semantik**, ergänzt um **Referenzzählung** für geteilte Stücke." },
        {
          art: "tabelle",
          kopf: ["Situation", "Was passiert"],
          zeilen: [
            ["`Pizza q = p;` (rechts steht nur ein Bezeichner oder Feldzugriff, der eine Pizza ist)", "`BesitzAnanas: Eine Pizza kann nicht an zwei Tischen gleichzeitig sein. Nutze schieb(p) oder teile(p).`"],
            ["`Pizza q = schieb(p);`", "Besitz wandert zu `q`; `p` ist danach ein leerer Karton"],
            ["Lesen von `p` nach `schieb(p)`", "`LeererKartonAnanas: 'p' wurde weggeschoben – der Karton ist leer.`"],
            ["`p = ((Tomate));` nach `schieb(p)`", "erlaubt – neuer Karton, neues Glück"],
            ["`f(p)`, `serviere ((p));`", "erlaubt: Argumente und Rückgaben sind keine Doppelbesitze"],
            ["`teile(p)`", "liefert ein `Stück<Pizza>`, `p.übrig()` sinkt um 1 (Start: 8)"],
            ["`teile(p)` bei 0 übrigen Stücken", "`StreitAnanas: Pizza ist alle.`"]
          ]
        },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Pizza p = ((Tomate, Mozzarella));',
            '',
            'probier {',
            '    Pizza kopie = p;              // zwei Tische, eine Pizza?',
            '} verbrannt (BesitzAnanas e) {',
            '    Bote.sage((e.nachricht()));',
            '}',
            '',
            'Pizza q = schieb(p);              // so geht es richtig',
            'Bote.sage((q));',
            '',
            'probier {',
            '    Bote.sage((p));',
            '} verbrannt (LeererKartonAnanas e) {',
            '    Bote.sage((e.nachricht()));',
            '}',
            '',
            'p = ((Tomate, Salami));           // Neuzuweisung ist erlaubt',
            'Bote.sage((p));'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "Eine Pizza kann nicht an zwei Tischen gleichzeitig sein. Nutze schieb(p) oder teile(p).",
            "((Tomate, Mozzarella))",
            "'p' wurde weggeschoben – der Karton ist leer.",
            "((Tomate, Salami))"
          )
        },
        { art: "text", md: "**Teilen statt schieben.** Mit `teile(p)` behält `p` seinen Besitzer, gibt aber ein **Stück** ab. Jede Pizza hat 8 Stücke. Ein `Stück<Pizza>` kennt seine Pizza (`pizza()`), kann gegessen werden (`essen()`) und weiß, ob das schon passiert ist (`istGegessen()`). Zweimal dasselbe Stück essen geht nicht – auch nicht in pizza." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Pizza party = ((Tomate, Mozzarella, Salami));',
            'Stück<Pizza> s1 = teile(party);',
            'Stück<Pizza> s2 = teile(party);',
            'Bote.sage(("Übrig: " + party.übrig()));',
            '',
            's1.essen();',
            'Bote.sage(("Gegessen? " + s1.istGegessen()));',
            'Bote.sage((s2.pizza()));',
            '',
            'probier {',
            '    s1.essen();',
            '} verbrannt (StreitAnanas e) {',
            '    Bote.sage((e.nachricht()));',
            '}',
            '',
            'für (salami i = 1; i <= 6; i++) {',
            '    teile(party);',
            '}',
            'Bote.sage(("Übrig: " + party.übrig()));',
            'probier {',
            '    teile(party);',
            '} verbrannt (StreitAnanas e) {',
            '    Bote.sage((e.nachricht()));',
            '}'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "Übrig: 6",
            "Gegessen? ja",
            "((Tomate, Mozzarella, Salami))",
            "Dieses Stück ist schon gegessen.",
            "Übrig: 0",
            "Pizza ist alle."
          )
        },
        { art: "hinweis", ton: "info", md: "**Tier 2 – Laufzeitprüfung statt Borrow-Checker.** Der Playground prüft Ownership erst beim Ausführen der betroffenen Zeile. Ein echter statischer Borrow-Checker, der Ihnen das schon vor dem Backen sagt, ist nicht eingebaut. Außerdem gilt die Regel nur für die einfachste Form: Steht rechts vom `=` ein komplizierterer Ausdruck (`p + Salami`, ein Methodenaufruf), entsteht ohnehin eine neue bzw. übergebene Pizza." }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "kuehlschrank-mikrowelle",
      gruppe: G,
      ordnung: 380,
      titel: "Kühlschrank & Mikrowelle",
      tier: 2,
      inhalt: [
        { art: "text", md: "Was man nicht aufisst, kommt in den Kühlschrank. Die Annotation `@Kühlschrank(haltbar: Dauer)` an einer Methode schaltet **Memoisierung mit Ablaufzeit (TTL)** ein: Ergebnisse werden **pro Instanz und Argumentliste** aufbewahrt und sind `haltbar` lang gut – gemessen auf der simulierten Uhr." },
        { art: "text", md: "Für feinere Kontrolle greift man über die **Methodenreferenz** (Methodenname ohne Klammern) auf die Reste zu:\n\n- `obj.methode.mikrowelle(args)` → `Reste<T>` mit `wert()` und `istMatschig()`.\n- `obj.methode.frisch(args)` → erzwingt eine Neuberechnung." },
        {
          art: "tabelle",
          kopf: ["Zustand des Kühlschranks", "`mikrowelle(...)` liefert", "`istMatschig()`"],
          zeilen: [
            ["leer (nie berechnet)", "frisch berechneten Wert", "`nein`"],
            ["Wert vorhanden und frisch", "Wert aus dem Kühlschrank", "`nein`"],
            ["Wert abgelaufen", "den **alten** Wert sofort – danach wird der Kühlschrank direkt neu befüllt", "`ja`"]
          ]
        },
        { art: "text", md: "Der letzte Fall ist das bekannte Muster *stale-while-revalidate*: lieber sofort eine etwas matschige Pizza als gar keine." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'klasse Pizzeria {',
            '    salami aufrufe = 0;',
            '',
            '    @Kühlschrank(haltbar: 3d)',
            '    speisekarte margherita holeKarte(margherita tag) {',
            '        dies.aufrufe += 1;',
            '        serviere (("Karte für " + tag + " (Version " + dies.aufrufe + ")"));',
            '    }',
            '}',
            '',
            'Pizzeria luigi = neu Pizzeria();',
            'Bote.sage((luigi.holeKarte("Montag")));',
            'Bote.sage((luigi.holeKarte("Montag")));      // aus dem Kühlschrank',
            'Bote.sage((luigi.holeKarte("Dienstag")));    // andere Argumente, neuer Eintrag',
            '',
            'Reste<margherita> r = luigi.holeKarte.mikrowelle("Montag");',
            'Bote.sage((r.wert() + " – matschig? " + r.istMatschig()));',
            '',
            'Uhr.vorspulen(4d);                            // vier Tage später ...',
            'Reste<margherita> alt = luigi.holeKarte.mikrowelle("Montag");',
            'Bote.sage((alt.wert() + " – matschig? " + alt.istMatschig()));',
            'Bote.sage((luigi.holeKarte("Montag")));      // inzwischen neu befüllt',
            'Bote.sage((luigi.holeKarte.frisch("Montag")));'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "Karte für Montag (Version 1)",
            "Karte für Montag (Version 1)",
            "Karte für Dienstag (Version 2)",
            "Karte für Montag (Version 1) – matschig? nein",
            "Karte für Montag (Version 1) – matschig? ja",
            "Karte für Montag (Version 3)",
            "Karte für Montag (Version 4)"
          )
        },
        { art: "hinweis", ton: "info", md: "**Tier 2:** Haltbarkeit wird auf der **simulierten** Uhr gemessen. Drei Tage vergehen im Playground also nur, wenn Sie `Uhr.vorspulen(...)` benutzen – oder 259 200 000 Schritte rechnen, was am Schrittlimit scheitert. Der Kühlschrank lebt nur so lange wie das Programm; nichts wird dauerhaft gespeichert." }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "lieferung",
      gruppe: G,
      ordnung: 390,
      titel: "Lieferung (Async mit Trinkgeld)",
      tier: 2,
      inhalt: [
        { art: "text", md: "`bestelle(fn)` ist pizzas Variante von *Futures/Promises*: Man gibt eine Bestellung auf und bekommt eine `Lieferung<T>` zurück. **Losgefahren wird noch nicht** – die Funktion läuft erst, wenn jemand auf die Lieferung wartet." },
        {
          art: "tabelle",
          kopf: ["Methode", "auf", "Wirkung"],
          zeilen: [
            ["`trinkgeld(n)`", "Lieferung", "Priorität; jeder Euro erhöht das Budget um 10 %. Gibt die Lieferung zurück."],
            ["`warte(max: d)`", "Lieferung", "führt **jetzt** aus, Budget `d_ms × (1 + trinkgeld/10)` Schritte → `Zustellung`. Erneutes `warte` liefert dieselbe Zustellung."],
            ["`wennDa(fn)`", "Lieferung", "registriert einen Rückruf für **nach Programmende**"],
            ["`pünktlich()`", "Zustellung", "`ja`, wenn das Budget gereicht hat"],
            ["`wert()`", "Zustellung", "der Wert; zu spät → `LieferAnanas: Zu spät – die Pizza ist kalt.`"],
            ["`oderGratis(v)`", "Zustellung", "der Wert; zu spät → `v` (die Pizza geht aufs Haus)"]
          ]
        },
        { art: "text", md: "Ananas, die `fn` selbst wirft, kommen bei `wert()` bzw. `oderGratis()` wieder zum Vorschein." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Lieferung<salami> l = bestelle(() -> {',
            '    Bote.sage(("Bote fährt los ..."));',
            '    serviere ((6 * 7));',
            '});',
            'Bote.sage(("Bestellt. Noch passiert nichts."));',
            '',
            'l.trinkgeld(5);',
            'Zustellung<salami> z = l.warte(max: 30min);',
            'Bote.sage(("Pünktlich? " + z.pünktlich()));',
            'Bote.sage(("Geliefert: " + z.wert()));',
            'Bote.sage((l.warte(max: 1ms).wert()));     // dieselbe Zustellung, keine zweite Fahrt'
          )
        },
        { art: "ausgabe", text: z("Bestellt. Noch passiert nichts.", "Bote fährt los ...", "Pünktlich? ja", "Geliefert: 42", "42") },
        { art: "text", md: "**Trinkgeld wirkt.** Zwei identische Bestellungen mit einem Budget von 100 ms: Ohne Trinkgeld reichen 100 Schritte niemals für eine Schleife mit 200 Runden. Mit 990 € Trinkgeld wird das Budget verhundertfacht (`100 × (1 + 990/10) = 10 000` Schritte) – der Bote fährt mit Blaulicht." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'klasse Küche {',
            '    speisekarte tiefkühl salami rechne() {',
            '        salami s = 0;',
            '        für (salami i = 1; i <= 200; i++) {',
            '            s += i;',
            '        }',
            '        serviere ((s));',
            '    }',
            '}',
            '',
            'Lieferung<salami> geizig = bestelle(() -> (Küche.rechne()));',
            'Lieferung<salami> großzügig = bestelle(() -> (Küche.rechne()));',
            'großzügig.trinkgeld(990);',
            '',
            'Zustellung<salami> kalt = geizig.warte(max: 100ms);',
            'Bote.sage(("Geizig pünktlich? " + kalt.pünktlich()));',
            'Bote.sage(("Geizig bekommt: " + kalt.oderGratis((0))));',
            'probier {',
            '    Bote.sage((kalt.wert()));',
            '} verbrannt (LieferAnanas e) {',
            '    Bote.sage((e.nachricht()));',
            '}',
            '',
            'Zustellung<salami> heiß = großzügig.warte(max: 100ms);',
            'Bote.sage(("Großzügig pünktlich? " + heiß.pünktlich()));',
            'Bote.sage(("Großzügig bekommt: " + heiß.wert()));'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "Geizig pünktlich? nein",
            "Geizig bekommt: 0",
            "Zu spät – die Pizza ist kalt.",
            "Großzügig pünktlich? ja",
            "Großzügig bekommt: 20100"
          )
        },
        { art: "text", md: "**Rückrufe mit `wennDa`.** Wer nicht warten will, hinterlässt eine Nachricht an der Tür. Alle Lieferungen, die einen Rückruf haben und bis zum Programmende **nicht** per `warte` abgeholt wurden, laufen **nach Programmende** (also auch nach `hauptgang`) – sortiert nach **Trinkgeld absteigend**, bei Gleichstand in **Bestellreihenfolge**. Ein Budget gibt es dort nicht mehr; der Laden hat ja eh schon zu." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Lieferung<margherita> erste = bestelle(() -> ("Margherita"));',
            'Lieferung<margherita> zweite = bestelle(() -> ("Diavolo"));',
            'Lieferung<margherita> dritte = bestelle(() -> ("Funghi"));',
            '',
            'erste.trinkgeld(2);',
            'zweite.trinkgeld(5);',
            'dritte.trinkgeld(2);',
            '',
            'erste.wennDa(x -> (Bote.sage(("Klingel! " + x))));',
            'zweite.wennDa(x -> (Bote.sage(("Klingel! " + x))));',
            'dritte.wennDa(x -> (Bote.sage(("Klingel! " + x))));',
            '',
            'Bote.sage(("Programm fertig. Jetzt klingelt es:"));'
          )
        },
        { art: "ausgabe", text: z("Programm fertig. Jetzt klingelt es:", "Klingel! Diavolo", "Klingel! Margherita", "Klingel! Funghi") },
        { art: "text", md: "Diavolo hat mit 5 € das meiste Trinkgeld und kommt zuerst. Margherita und Funghi haben je 2 € – da entscheidet die Bestellreihenfolge." },
        { art: "hinweis", ton: "info", md: "**Tier 2 – keine echte Nebenläufigkeit.** `warte` führt die Bestellung im Playground **sofort und sequentiell** aus und misst dabei Schritte statt Wanduhrzeit; „zu spät“ heißt: das Schrittbudget war aufgebraucht. Auch die `wennDa`-Rückrufe laufen nacheinander. Echte Hintergrund-Threads bei `bestelle` sind **Tier 3**." }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "calzone",
      gruppe: G,
      ordnung: 395,
      titel: "Calzone (echte Kapselung)",
      tier: 1,
      inhalt: [
        { art: "text", md: "In vielen Sprachen ist `private` eher ein freundlicher Hinweis: Mit Reflection kommt man trotzdem an alles heran. In pizza auch – bei normalen Klassen. `Spiegel.felder(obj)` liefert eine `Speisekarte` **aller** Felder, auch der `geheimrezept`-Felder." },
        { art: "text", md: "Eine **Calzone** dagegen ist zugeklappt. Was drin ist, bleibt drin:\n\n- `Spiegel.felder(obj)` auf einer zugeklappten Calzone → `ZugeklapptAnanas: Die Calzone ist zu. Nutze aufklappen().`\n- `geheimrezept`-Felder sind von außen wie gewohnt tabu (`ZugriffsAnanas`).\n- `obj.aufklappen()` (nur bei Calzone) öffnet sie – mit Warnung `W0013: Garantie erloschen. Das ist jetzt eine ganz normale Pizza.` Danach funktioniert `Spiegel.felder(obj)`, und `geheimrezept`-Felder sind von außen les- und schreibbar." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            'klasse Sparschwein {',
            '    geheimrezept funghi inhalt = (12.5);',
            '}',
            '',
            'calzone klasse Konto {',
            '    geheimrezept funghi stand = (1000.0);',
            '    speisekarte funghi zeigeStand() {',
            '        serviere ((stand));',
            '    }',
            '}',
            '',
            '// Normale Klasse: der Spiegel sieht alles.',
            'Bote.sage((Spiegel.felder(neu Sparschwein())));',
            '',
            'Konto k = neu Konto();',
            'probier {',
            '    Bote.sage((k.stand));',
            '} verbrannt (ZugriffsAnanas e) {',
            '    Bote.sage((e.typ()));',
            '}',
            'probier {',
            '    Bote.sage((Spiegel.felder(k)));',
            '} verbrannt (ZugeklapptAnanas e) {',
            '    Bote.sage((e.nachricht()));',
            '}',
            '',
            'k.aufklappen();                 // Warnung W0013',
            'Bote.sage((Spiegel.felder(k)));',
            'k.stand = 0.0;                  // jetzt geht alles. wirklich alles.',
            'Bote.sage((k.zeigeStand()));'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "{inhalt: 12.5}",
            "ZugriffsAnanas",
            "Die Calzone ist zu. Nutze aufklappen().",
            "{stand: 1000}",
            "0"
          )
        },
        { art: "hinweis", ton: "pizza", md: "Eine aufgeklappte Calzone ist für immer eine ganz normale Pizza. Zuklappen ist nicht vorgesehen – das hat in der Geschichte der italienischen Küche noch niemand ohne Sauerei geschafft." }
      ]
    }
  );
})();
