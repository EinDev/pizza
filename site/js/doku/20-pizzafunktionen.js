/* pizza v3.0 – Doku: Pizza-Funktionen (ordnung 300–399) – Doku v2: kurz, Bild, ein Beispiel, Rest in details */
(function () {
  "use strict";
  const ziel = typeof self !== "undefined" ? self : globalThis;
  const z = (...zeilen) => zeilen.join("\n");
  const G = "Pizza-Funktionen";
  const bild = (datei, alt, unterschrift) => ({ art: "bild", src: "img/doku/" + datei, alt, unterschrift });

  (ziel.PIZZA_DOKU = ziel.PIZZA_DOKU || []).push(
    // ------------------------------------------------------------------
    {
      id: "pizzafunktionen-warum",
      gruppe: G,
      ordnung: 300,
      titel: "Warum Pizza-Funktionen?",
      tier: 2,
      inhalt: [
        { art: "kurz", md: "Pizza-Funktionen sind echte Programmier-Ideen im Pizza-Kostüm: **Teig**, **Ofen**, **Stücke**, **Lieferung**. Wer die Pizzeria versteht, versteht auch das Konzept dahinter." },
        bild("pf-ueberblick.svg", "Spickzettel: zehn Pizza-Metaphern und das Programmierkonzept dahinter, z. B. Teig = Lazy Evaluation, Ofen = Zeitlimit mit Teilergebnis", "Jede Metapher steht für ein echtes Konzept."),
        { art: "text", md: "Ein kleiner Rundgang durch die Küche: Pizza bestellen, in den Ofen schieben, schneiden, ein Stück abgeben." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Pizza p = ((Tomate, Mozzarella, Basilikum));',
            'Bote.sage(("Bestellt: " + p + " für " + p.preis().euro()));',
            'salami ergebnis = ofen(temperatur: 450, zeit: 90s) {',
            '    serviere (([1 .. 8].summe()));',
            '};',
            'Bote.sage(("Aus dem Ofen: " + ergebnis));',
            'Blech<Blech<salami>> teller = [1 .. 8] / 4;',
            'Bote.sage(("Geschnitten: " + teller));',
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
        },
        {
          art: "details",
          titel: "Spickzettel für Umsteiger: Metapher, Konzept, Tier",
          inhalt: [
            { art: "text", md: "Für alle, die schon eine andere Sprache sprechen. Die Spalte *Tier* sagt, wie ehrlich der Playground das Konzept umsetzt: **Tier 1** läuft exakt wie beschrieben, **Tier 2** läuft vereinfacht bzw. simuliert (z. B. Parallelität nacheinander, Zeit als Schrittzähler)." },
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
            { art: "hinweis", ton: "info", md: "Der Playground läuft komplett im Browser und ist deterministisch: Es gibt **keine echten Threads** und **keine Wanduhr**, und mit derselben Zufalls-Saat (siehe *Zufall*) kommt bei jedem Lauf dasselbe heraus. Zeit wird in Schritten gemessen (1 Schritt = 1 ms simulierte Zeit). Echte Parallelität bei `schneide` und echte Hintergrund-Threads bei `teig` und `bestelle` sind **Tier 3** – also nur Spezifikation." }
          ]
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
        { art: "kurz", md: "Eine Pizza schreibst du in **doppelten Klammern**: `((Tomate, Mozzarella))`. Der erste Belag liegt unten, der letzte oben. Preis = 5 € Teig + alle Beläge." },
        bild("pf-literal.svg", "Pizza im Querschnitt: unten Teig 5,00 €, darauf Tomate 1,00 €, Mozzarella 1,50 €, Basilikum 0,50 €. Summe 8,00 €", "Von links nach rechts im Code = von unten nach oben auf der Pizza."),
        { art: "text", md: "Programmier-Begriff: Eine Pizza ist ein **unveränderlicher Wert**. `p + Salami` baut eine **neue** Pizza – `p` selbst bleibt, wie es ist." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            'Pizza p = ((Tomate, Mozzarella, Basilikum));',
            'Bote.sage((p));',
            'Bote.sage((p.preis().euro()));',
            '',
            'Pizza scharf = p + Salami;   // neue Pizza',
            'Bote.sage((scharf));',
            'Bote.sage((p));              // p ist unverändert'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "((Tomate, Mozzarella, Basilikum))",
            "8,00 €",
            "((Tomate, Mozzarella, Basilikum, Salami))",
            "((Tomate, Mozzarella, Basilikum))"
          )
        },
        {
          art: "details",
          titel: "Mehr: Methoden, Gleichheit, Entfernen mit -",
          inhalt: [
            { art: "text", md: "- `p - Chili` liefert eine **neue** Pizza ohne (alle) Chili.\n- `p + \"Text\"` ist dagegen kein Belag, sondern Textverkettung: `((Tomate)) + \"!\"` ergibt den Text `((Tomate))!`.\n- Die leere Pizza (nur Teig) heißt `(())` oder `neu Pizza()`.\n- Zwei Pizzen sind gleich (`==`), wenn sie dieselben Beläge in derselben Reihenfolge haben." },
            {
              art: "tabelle",
              kopf: ["Methode", "auf", "Ergebnis"],
              zeilen: [
                ["`preis()`", "Pizza", "Grundpreis 5.00 + Summe der Belagpreise"],
                ["`beläge()`", "Pizza", "Blech der Belagnamen (als Text), unten → oben"],
                ["`hat(Belag)`", "Pizza", "`ja`, wenn der Belag drauf ist; der Name als Text geht auch: `p.hat(\"Tomate\")`"],
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
                'Pizza scharf = ((Tomate, Mozzarella, Basilikum, Chili, Salami));',
                'Bote.sage((scharf.preis()));',
                'Bote.sage((scharf - Chili));',
                'Bote.sage((scharf.hat(Chili)));',
                'Bote.sage((scharf.beläge()));',
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
                "10",
                "((Tomate, Mozzarella, Basilikum, Salami))",
                "ja",
                "[Tomate, Mozzarella, Basilikum, Chili, Salami]",
                "(()) kostet 5",
                "ja",
                "Salami kostet 1,50 €"
              )
            }
          ]
        },
        {
          art: "details",
          titel: "Wann ist ((…)) eine Pizza? Und unbekannte Beläge",
          inhalt: [
            { art: "text", md: "Der Parser erkennt ein Pizza-Literal nur, wenn zwischen `((` und `))` ausschließlich **großgeschriebene, einfache Bezeichner** stehen, durch Kommas getrennt. Alles andere – `((x + 1))`, `((\"Text\"))`, `((a.b))` – ist eine gewöhnliche doppelte Klammerung." },
            { art: "text", md: "**Achtung bei Aufrufen:** Die Klammer des Aufrufs zählt nicht mit. `Bote.sage((Salami))` übergibt den **Belag** `Salami`, `Bote.sage((Salami, Tomate))` ist ein Syntaxfehler. Eine Pizza im Aufruf braucht drei Klammern: `Bote.sage(((Salami, Tomate)))` – oder du legst sie vorher in eine Variable." },
            { art: "text", md: "Ein großgeschriebener Name, der weder Variable noch Klasse ist, wird auf der **Zutatenliste** nachgeschlagen. Steht er dort nicht, gibt es eine `UnbekannterBelagAnanas` – die kann man fangen:" },
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
            { art: "hinweis", ton: "pizza", md: "Preise sind Kommazahlen. Bei Belägen aus der Zutatenliste rundet pizza jede Schicht auf Cent, damit keine Krümel wie `7.800000000000001` entstehen. Eigene `preis()`-Methoden rechnen ungerundet – für die Rechnung gibt es `preis().euro()`." }
          ]
        },
        {
          art: "details",
          titel: "Die eingebaute Zutatenliste (Preise und @Nach)",
          inhalt: [
            { art: "text", md: "Die Spalte `@Nach` sagt, über welchem Belag eine Zutat liegen muss (siehe *Eigene Beläge*)." },
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
                ["Ananas", "0.00", "löst Hawaii aus, sobald sie auf einer Pizza liegt"]
              ]
            },
            { art: "hinweis", ton: "warnung", md: "`Ananas` steht zwar auf der Zutatenliste, aber eine Pizza mit Ananas löst eine **nicht fangbare Kernel-Panik** aus (Exit-Code 39). Details im Abschnitt über Hawaii. Wir haben Sie gewarnt." }
          ]
        }
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
        { art: "kurz", md: "Mit `belag` erfindest du eigene Zutaten. Jede Schicht fragt die Schichten **darunter** (`unten`) und legt ihren Teil obendrauf." },
        bild("pf-belag-decorator.svg", "Links: Trüffel fragt mit unten nach dem Preis von Tomate und Teig (6,00) und legt 4,50 drauf, macht 10,50. Rechts: Käse über Tomate ist eine Pizza, Käse unter Tomate ein Auflauf (B0012)", "Oben fragt nach unten, das Ergebnis wandert zurück nach oben."),
        { art: "text", md: "Programmier-Begriff: Das ist das **Decorator-Muster**. `unten` funktioniert wie `super` in Java oder `next()` in einer Middleware-Kette." },
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
            '}',
            '',
            'Pizza fein = ((Tomate, Trüffel));',
            'Bote.sage((fein.preis()));   // 5 Teig + 1 Tomate + 4.50'
          )
        },
        { art: "ausgabe", text: "10.5" },
        {
          art: "details",
          titel: "So funktioniert der Dispatch (mit zweitem Beispiel)",
          inhalt: [
            { art: "text", md: "Eine Pizza mit den Schichten `s1 … sk` (unten → oben) beantwortet einen Methodenaufruf `m` von **oben nach unten**:\n\n- Ganz unten beim Teig (`k == 0`) antwortet die eingebaute Pizza: `preis()` liefert den Grundpreis 5.00, `beschreibung()` liefert `\"Teig\"`.\n- Definiert die oberste betrachtete Schicht `sk` die Methode `m`, wird sie ausgeführt. Darin ist `dies` die **ganze** Pizza und `unten` eine Sicht auf die Schichten `1 … k-1`.\n- Sonst wird nach unten durchgereicht. Bei `preis` kommt dabei der Standardpreis der übersprungenen Schicht dazu (laut Zutatenliste, unbekannte eigene Beläge kosten 1.00)." },
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
            { art: "text", md: "Nachgerechnet für `deluxe`: Extrakäse hat kein eigenes `preis()` → 1.00 + Preis darunter. Trüffel rechnet `unten.preis() + 4.50`, darunter liegt Tomate (1.00) auf dem Teig (5.00). Macht 1.00 + 4.50 + 1.00 + 5.00 = **11.5**. Bei `beschreibung()` wickelt jede Schicht ihren Text um das Ergebnis von unten." },
            { art: "text", md: "Eigene Methoden wie `beschreibung()` sind auf **jeder** Pizza aufrufbar, die den Belag trägt. Sie dürfen auch eingebaute Beläge wie `Käse` neu definieren; ohne eigenes `preis()` gilt dann weiter der Preis aus der Zutatenliste." }
          ]
        },
        {
          art: "details",
          titel: "@Nach: die Schichtreihenfolge und Fehler B0012",
          inhalt: [
            { art: "text", md: "Ein Belag mit `@Nach(Y)` darf **nicht unterhalb** von `Y` liegen. Fehlt `Y` auf der Pizza ganz, ist alles erlaubt. Geprüft wird bei **jeder** Pizza-Erzeugung – im Literal und bei `+`. Weil `+` immer oben auflegt, fliegt man auch damit auf die Nase, wenn man Tomate über den Käse kippt:" },
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
            { art: "text", md: "Das gilt genauso für eigene Beläge. `@Nach` steht direkt vor der `belag`-Deklaration und darf mehrere Beläge nennen:" },
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
        }
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
        { art: "kurz", md: "pizza hat keine echte Uhr. Jeder Rechenschritt lässt die Uhr um **1 ms** weiterticken – so kommt bei jedem Lauf exakt dasselbe heraus." },
        bild("pf-uhr.svg", "Eine Uhr und eine Reihe Kästchen: jeder Schritt zählt +1 ms. Uhr.vorspulen(3d) springt auf einmal drei Tage vor", "Zeit = gezählte Schritte. Vorspulen geht auch."),
        { art: "text", md: "Programmier-Begriff: **virtuelle Zeit** bzw. ein Schrittzähler. Zeitangaben schreibst du als **Dauer**: Zahl direkt gefolgt von `ms`, `s`, `min`, `h` oder `d`." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Dauer pause = 90s;',
            'Bote.sage((pause));',
            'Bote.sage((1h + 30min));',
            '',
            'Uhr.vorspulen(3d);   // drei Tage später, sofort',
            'Bote.sage(("Drei Tage später? " + (Uhr.jetzt() > 3d)));'
          )
        },
        { art: "ausgabe", text: z("1min 30s", "1h 30min", "Drei Tage später? ja") },
        {
          art: "details",
          titel: "Mehr: Rechnen mit Dauern, Schritte messen",
          inhalt: [
            { art: "text", md: "- `Uhr.jetzt()` liefert die `Dauer` seit Programmstart.\n- `Uhr.vorspulen(d)` lässt die Uhr um `d` springen – praktisch, um Kühlschrank-Haltbarkeiten zu testen, ohne drei Tage zu warten. Die Uhr zählt ganze Millisekunden, `vorspulen(0.5ms)` wird auf 1 ms gerundet.\n- Warten auf eine Eingabe des Gastes kostet keine Zeit auf dieser Uhr.\n- Dauern lassen sich addieren, mit Zahlen multiplizieren und vergleichen; als Text erscheinen sie mit den größten Einheiten zuerst." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 2,
              code: z(
                'Dauer pause = 90s;',
                'Bote.sage((pause * 2));',
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
                'Bote.sage(("Mehr als 50 Schritte? " + (gebraucht > 50ms)));',
                'Bote.sage(("Weniger als 10 Sekunden? " + (gebraucht < 10s)));'
              )
            },
            {
              art: "ausgabe",
              text: z(
                "3min",
                "1s 500ms",
                "90000",
                "Summe: 5050",
                "Mehr als 50 Schritte? ja",
                "Weniger als 10 Sekunden? ja"
              )
            },
            { art: "hinweis", ton: "info", md: "**Tier 2:** Wie viele Schritte genau eine Anweisung kostet, ist ein Implementierungsdetail. Verlassen Sie sich auf Größenordnungen (*„eine Schleife mit 100 Runden braucht mehr als 100 Schritte“*), nicht auf exakte Zahlen." }
          ]
        },
        {
          art: "details",
          titel: "Das Schrittlimit (P0002, Exit-Code 3)",
          inhalt: [
            { art: "text", md: "Damit eine Endlosschleife nicht den Browser verheizt, gibt es ein Limit von **5 000 000 Schritten**. Wird es erreicht, endet das Programm mit **Exit-Code 3**:\n\n`PizzaFehler P0002: Die Pizza ist noch im Ofen. (Schrittlimit erreicht – Endlosschleife?)`" },
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
            { art: "hinweis", ton: "pizza", md: "Das Schrittlimit gilt überall gleich – im Playground, in der Kommandozeile und im heruntergeladenen Programm. Eine echte Stoppuhr gibt es nicht. Wer nicht warten will, drückt im Playground **Esc** bzw. **Abbrechen**. Fünf Millionen Schritte schafft ein moderner Browser aber meist in wenigen Sekunden." }
          ]
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "pf-teig",
      gruppe: G,
      ordnung: 340,
      titel: "Teig (Lazy Evaluation)",
      tier: 2,
      inhalt: [
        { art: "kurz", md: "**Teig** = etwas wird erst berechnet, wenn du es brauchst – und dann nur **einmal**." },
        bild("pf-teig.svg", "Drei Stationen: roh (nur das Rezept, nichts berechnet), aufgegangen nach gehenlassen() (jetzt gerechnet, Ergebnis 42 gemerkt), gebacken mit backen() (Wert abholen)", "teig() merkt sich nur das Rezept. Gerechnet wird beim Gehenlassen oder spätestens beim Backen."),
        { art: "text", md: "Programmier-Begriff: **Lazy Evaluation** (faule Auswertung) mit Merk-Effekt. `teig(fn)` packt eine Funktion ein, **ohne sie auszuführen**." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'salami zähler = 0;',
            'Teig<salami> t = teig(() -> {',
            '    zähler += 1;',
            '    serviere ((6 * 7));',
            '});',
            'Bote.sage(("Aufgegangen? " + t.istAufgegangen()));',
            't.gehenlassen();',
            'Bote.sage((t.backen()));',
            'Bote.sage((t.backen()));',
            'Bote.sage(("Berechnet: " + zähler + "x"));'
          )
        },
        { art: "ausgabe", text: z("Aufgegangen? nein", "42", "42", "Berechnet: 1x") },
        {
          art: "details",
          titel: "Alle Teig-Methoden und die Warnung T0007",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Methode", "Wirkung"],
              zeilen: [
                ["`gehenlassen()`", "berechnet den Wert „im Hintergrund“ und merkt ihn sich; gibt den Teig zurück"],
                ["`backen()`", "liefert den Wert; berechnet ihn nur, falls noch nicht geschehen"],
                ["`istAufgegangen()`", "`ja`, sobald `gehenlassen()` aufgerufen wurde – ein bloßes `backen()` lässt den Teig **nicht** aufgehen, auch wenn der Wert dann berechnet ist"]
              ]
            },
            { art: "text", md: "Teig, den niemand backt, wird nie berechnet – auch wenn darin eine Division durch null steckt:" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 2,
              code: z(
                'Teig<salami> gefahr = teig(() -> (1 / 0));',
                'Bote.sage(("Aufgegangen? " + gefahr.istAufgegangen()));',
                'Bote.sage(("Nichts passiert."));'
              )
            },
            { art: "ausgabe", text: z("Aufgegangen? nein", "Nichts passiert.") },
            { art: "text", md: "Wer `backen()` aufruft, ohne den Teig vorher `gehenlassen()` zu haben, bekommt trotzdem seinen Wert – aber auch eine Warnung:\n\n`T0007: Teig wird gebacken, ohne gehen gelassen worden zu sein. Das schmeckt flach.`" },
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
            { art: "hinweis", ton: "info", md: "**Tier 2:** „Im Hintergrund“ heißt im Playground: `gehenlassen()` rechnet **sofort und nacheinander**. Einen echten Hintergrund-Thread gibt es nicht (Tier 3). Für das Ergebnis macht das keinen Unterschied." }
          ]
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "pf-ofen",
      gruppe: G,
      ordnung: 350,
      titel: "Ofen (Zeitbudget)",
      tier: 2,
      inhalt: [
        { art: "kurz", md: "Der **Ofen** gibt einer Rechnung ein Zeitlimit. Wird sie nicht rechtzeitig fertig, bekommst du den letzten **Zwischenstand** statt gar nichts." },
        bild("pf-ofen.svg", "Ofen mit Thermometer (höchstens 485 °C) und Zeitbudget-Balken mit Zwischenstand-Punkten. Drei Ausgänge: fertig im Budget, Zeit um (roh mit Teilergebnis), zu heiß oder Ananas (verbrannt)", "Fertig, roh oder verbrannt – der Ofen hat drei Ausgänge."),
        { art: "text", md: "Programmier-Begriff: ein **Timeout mit Teilergebnis**. Mit `zwischenstand(x)` merkt sich der Block, was schon fertig ist; der `roh`-Zweig holt es bei Zeitüberschreitung ab." },
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
            '    serviere ((r.teilergebnis()));',
            '};',
            'Bote.sage(("Etwas gar? " + (s > 0)));',
            'Bote.sage(("Ganz fertig? " + (s == 500_000_500_000)));'
          )
        },
        { art: "ausgabe", text: z("Etwas gar? ja", "Ganz fertig? nein") },
        {
          art: "details",
          titel: "Aufbau, Budget-Formel und Temperatur",
          inhalt: [
            {
              art: "code",
              ausfuehrbar: false,
              tier: 2,
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
                ["`temperatur:`", "benanntes Argument (Zahl), Standard **250**; 485 geht gerade noch, alles darüber (auch 485.5) → `VerbranntAnanas(\"Zu heiß! Selbst Neapel hat Grenzen.\")`"],
                ["`zeit:`", "benanntes Argument (Dauer, eine Zahl gilt als ms), Standard **60s**"],
                ["`ofen(450, 90s)`", "Ohne Namen geht es auch: erst Temperatur, dann Zeit"],
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
                ["`ofen(temperatur: 500)`", "gar keins: `VerbranntAnanas`, bevor der Block startet"],
                ["`ofen(temperatur: 0)` oder `ofen(zeit: 0ms)`", "**0** – schon der erste Schritt ist zu viel (`roh` bzw. `VerbranntAnanas`)"]
              ]
            },
            { art: "text", md: "`roh` und `verbrannt` sind beide optional; wenn beide da sind, steht `roh` zuerst. Das ganze `ofen(...) {...}` ist ein **Ausdruck** und wird als Anweisung mit `;` abgeschlossen. Die genaue verbrauchte Zeit und das genaue Teilergebnis hängen davon ab, wie viele Schritte eine Schleifenrunde kostet." },
            { art: "hinweis", ton: "info", md: "**Tier 2:** Das Budget wird in Schritten der simulierten Uhr gemessen. `temperatur` ist nur ein Multiplikator – der Playground rechnet nicht wirklich schneller, wenn man aufdreht." }
          ]
        },
        {
          art: "details",
          titel: "Weitere Beispiele: serviere im Ofen, verbrannt",
          inhalt: [
            { art: "text", md: "`serviere` im Ofen verlässt nur den Ofen, nicht die Methode drumherum:" },
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
                'Bote.sage((Bäcker.backe()));'
              )
            },
            { art: "ausgabe", text: "außen, nach innen" },
            { art: "text", md: "Ohne `roh`-Zweig wirft ein überzogener Ofen eine `VerbranntAnanas` mit der Meldung `Zu lange im Ofen: Budget von N Schritten überschritten.` Die lässt sich fangen:" },
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
            { art: "text", md: "Zu heiß ist auch keine Lösung. Über 485 Grad verweigert der Ofen den Dienst – der eigene `verbrannt`-Zweig fängt das, genauso wie selbst geworfene Ananas:" },
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
            { art: "ausgabe", text: z("verkohlt: Zu heiß! Selbst Neapel hat Grenzen.", "gerettet: Rand angebrannt") }
          ]
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "pf-schneiden",
      gruppe: G,
      ordnung: 360,
      titel: "Schneiden (Parallelität)",
      tier: 2,
      inhalt: [
        { art: "kurz", md: "Große Arbeit teilst du wie eine große Pizza: in **Stücke schneiden**, jedes Stück von einem Koch bearbeiten lassen, Ergebnisse **zusammenklappen**." },
        bild("pf-schneiden.svg", "Ein Blech mit den Zahlen 1 bis 16 wird in 8 Stücke geschnitten. 8 Köche rechnen je eine Teilsumme (3, 7, 11 … 31). Zusammenklappen ergibt 136", "Schneiden, belegen, zusammenklappen."),
        { art: "text", md: "Programmier-Begriff: **Map-Reduce** bzw. Fork/Join. `schneide(n)` teilt auf, `belege(fn)` bearbeitet jedes Stück (map), `zusammenklappen(fn)` fasst zusammen (reduce)." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Blech<salami> zahlen = [1 .. 16];',
            'Blech<Blech<salami>> stücke = zahlen.schneide(auto);   // 8 Stücke',
            'Bote.sage((stücke));',
            '',
            'Blech<salami> teilsummen = stücke.belege(teil -> teil.summe());',
            'Bote.sage((teilsummen));',
            'Bote.sage((teilsummen.zusammenklappen((a, b) -> a + b)));'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "[[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16]]",
            "[3, 7, 11, 15, 19, 23, 27, 31]",
            "136"
          )
        },
        {
          art: "details",
          titel: "Schreibweisen, fair teilen mit / und Warnung S0007",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Schreibweise", "Wirkung"],
              zeilen: [
                ["`blech.schneide(n)`", "`n` Teil-Bleche, möglichst gleich groß, vordere ggf. größer"],
                ["`blech.schneide(auto)`", "8 Stücke – wie bei einer richtigen Pizza. `auto` gibt es **nur** hier; anderswo heißt es `LaufzeitAnanas: 'auto' ist nicht definiert.`"],
                ["`blech / n`", "wie `schneide(n)`, aber **fair**: geht es nicht auf → `StreitAnanas`; `/ 0` → `RechenAnanas`"],
                ["mehr Stücke als Elemente", "`[1, 2, 3].schneide(5)` → `[[1], [2], [3], [], []]` – leere Teller gibt es auch"],
                ["`schneide(0)` oder weniger", "`StreitAnanas: In 0 Stücke schneiden? Das geht nicht.`"],
                ["`schneide(7)`", "funktioniert, aber Warnung `S0007` (auch bei `blech / 7`)"]
              ]
            },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 2,
              code: z(
                'Bote.sage(([1 .. 8].schneide(3)));   // vordere Stücke größer',
                'Bote.sage(([1 .. 8] / 4));',
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
            {
              art: "ausgabe",
              text: z(
                "[[1, 2, 3], [4, 5, 6], [7, 8]]",
                "[[1, 2], [3, 4], [5, 6], [7, 8]]",
                "8 Stücke lassen sich nicht fair durch 3 teilen.",
                "[[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14]]"
              )
            },
            { art: "hinweis", ton: "pizza", md: "`S0007: 7 Stücke? Wer schneidet eine Pizza in 7 Stücke?` – Warnungen ändern den Exit-Code nicht. Nur, wie der Pizzaiolo Sie ansieht." },
            { art: "hinweis", ton: "info", md: "**Tier 2 – Parallelität wird nacheinander simuliert.** Die Stücke laufen im Playground in einem einzigen Thread; das Ergebnis ist dasselbe, nur die Geschwindigkeit nicht. Echte Parallelität auf mehreren Kernen ist **Tier 3**." }
          ]
        }
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
        { art: "kurz", md: "Eine Pizza steht immer an **genau einem Tisch**. Weitergeben geht mit `schieb` (dann ist dein Karton leer) – oder du gibst mit `teile` nur ein **Stück** ab." },
        bild("pf-besitz.svg", "Oben: q = schieb(p) bewegt die Pizza von Tisch 1 zu Tisch 2, an Tisch 1 bleibt ein leerer Karton. Kopieren mit Pizza q = p gibt eine BesitzAnanas. Unten: teile(p) nimmt ein Stück heraus, p.übrig() sinkt von 8 auf 7", "Schieben bewegt die ganze Pizza, teilen gibt ein Stück ab."),
        { art: "text", md: "Programmier-Begriff: **Ownership** mit Move-Semantik, wie in Rust. Jeder Wert hat genau einen Besitzer." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Pizza p = ((Tomate, Mozzarella));',
            'Pizza q = schieb(p);          // p wandert zu q',
            'Bote.sage((q));',
            'probier {',
            '    Bote.sage((p));',
            '} verbrannt (LeererKartonAnanas e) {',
            '    Bote.sage((e.nachricht()));',
            '}',
            'Stück<Pizza> s = teile(q);',
            'Bote.sage(("Noch übrig: " + q.übrig()));'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "((Tomate, Mozzarella))",
            "'p' wurde weggeschoben – der Karton ist leer.",
            "Noch übrig: 7"
          )
        },
        {
          art: "details",
          titel: "Alle Regeln: kopieren, schieben, neu zuweisen",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Situation", "Was passiert"],
              zeilen: [
                ["`Pizza q = p;` oder `q = k.pizza;` (rechts steht nur ein Name oder Feldzugriff, auch in Klammern, und der Wert ist eine Pizza)", "`BesitzAnanas: Eine Pizza kann nicht an zwei Tischen gleichzeitig sein. Nutze schieb(p) oder teile(p).`"],
                ["rechts steht etwas anderes: `a ? p : q`, `[p]`, `m.hole(k)`, `s.pizza()`", "keine Prüfung – die Regel schaut nur auf die Schreibweise"],
                ["`Pizza q = schieb(p);`", "Besitz wandert zu `q`; `p` ist danach ein leerer Karton. `schieb` geht mit Variablen jeden Typs, aber nicht mit Feldern (`schieb(k.p)` → `LaufzeitAnanas`)"],
                ["`Pizza q = p + Käse;`", "erlaubt – das ist eine **neue** Pizza mit wieder 8 Stücken"],
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
                'probier {',
                '    Pizza kopie = p;              // zwei Tische, eine Pizza?',
                '} verbrannt (BesitzAnanas e) {',
                '    Bote.sage((e.nachricht()));',
                '}',
                'Pizza q = schieb(p);',
                'p = ((Tomate, Salami));           // Neuzuweisung ist erlaubt',
                'Bote.sage((p));'
              )
            },
            {
              art: "ausgabe",
              text: z(
                "Eine Pizza kann nicht an zwei Tischen gleichzeitig sein. Nutze schieb(p) oder teile(p).",
                "((Tomate, Salami))"
              )
            },
            { art: "hinweis", ton: "info", md: "**Tier 2 – Laufzeitprüfung statt Borrow-Checker.** Der Playground prüft Ownership erst, wenn die Zeile ausgeführt wird, und nur an der **Schreibweise**: Steht rechts vom `=` ein bloßer Name oder Feldzugriff, der eine Pizza enthält, gibt es die `BesitzAnanas`. Steht dort etwas Komplizierteres (`p + Salami`, ein Methodenaufruf, `?:`), schaut niemand nach." }
          ]
        },
        {
          art: "details",
          titel: "Stücke: essen, zählen, Streit",
          inhalt: [
            { art: "text", md: "Jede Pizza hat 8 Stücke. Ein `Stück<Pizza>` kennt seine Pizza (`pizza()`), kann gegessen werden (`essen()`) und weiß, ob das schon passiert ist (`istGegessen()`). Zweimal dasselbe Stück essen gibt Streit – und ein neuntes Stück auch." },
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
            }
          ]
        }
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
        { art: "kurz", md: "Der **Kühlschrank** merkt sich das Ergebnis einer Methode eine Weile. Fragst du nochmal, wird nicht neu gekocht. Ist es zu alt, ist es **matschig**." },
        bild("pf-kuehlschrank.svg", "Kühlschrank mit der gespeicherten Karte Nr. 1, haltbar 3 Tage. Die Mikrowelle liefert frisch: Wert aus dem Kühlschrank, nicht matschig; abgelaufen: alten Wert sofort, matschig, danach neu kochen", "Bis 3 Tage frisch, danach matschig – gemessen auf der simulierten Uhr."),
        { art: "text", md: "Programmier-Begriff: ein **Cache mit Ablaufzeit**. `@Kühlschrank(haltbar: …)` an einer Methode schaltet ihn ein." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'klasse Drucker {',
            '    salami gedruckt = 0;',
            '    @Kühlschrank(haltbar: 3d)',
            '    speisekarte margherita karte(margherita tag) {',
            '        gedruckt++;',
            '        serviere (("Karte Nr. " + gedruckt));',
            '    }',
            '}',
            'Drucker d = neu Drucker();',
            'Bote.sage((d.karte("Mo") + ", " + d.karte("Mo")));   // 2. Mal aus dem Kühlschrank',
            'Uhr.vorspulen(4d);',
            'Bote.sage(("Matschig? " + d.karte.mikrowelle("Mo").istMatschig()));'
          )
        },
        { art: "ausgabe", text: z("Karte Nr. 1, Karte Nr. 1", "Matschig? ja") },
        {
          art: "details",
          titel: "Mikrowelle, frisch() und alle Zustände",
          inhalt: [
            { art: "text", md: "Ergebnisse werden **pro Instanz und Argumentliste** aufbewahrt. Über die **Methodenreferenz** (Methodenname ohne Klammern) kommt man an die Reste:\n\n- `obj.methode.mikrowelle(args)` → `Reste<T>` mit `wert()` und `istMatschig()`.\n- `obj.methode.frisch(args)` → erzwingt eine Neuberechnung." },
            {
              art: "tabelle",
              kopf: ["Zustand des Kühlschranks", "`mikrowelle(...)` liefert", "`istMatschig()`"],
              zeilen: [
                ["leer (nie berechnet)", "frisch berechneten Wert", "`nein`"],
                ["Wert vorhanden und frisch", "Wert aus dem Kühlschrank", "`nein`"],
                ["Wert abgelaufen", "den **alten** Wert sofort – danach wird der Kühlschrank direkt neu befüllt", "`ja`"]
              ]
            },
            { art: "text", md: "Der letzte Fall heißt *stale-while-revalidate*: lieber sofort eine etwas matschige Pizza als gar keine." },
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
            { art: "hinweis", ton: "info", md: "**Tier 2:** Haltbarkeit wird auf der **simulierten** Uhr gemessen. Drei Tage vergehen also nur mit `Uhr.vorspulen(...)`. Der Kühlschrank lebt nur so lange wie das Programm; nichts wird dauerhaft gespeichert." }
          ]
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "pf-lieferung",
      gruppe: G,
      ordnung: 390,
      titel: "Lieferung (Async mit Trinkgeld)",
      tier: 2,
      inhalt: [
        { art: "kurz", md: "Mit `bestelle` gibst du eine Bestellung auf – gekocht wird aber erst, wenn du auf die Lieferung **wartest**. Mehr Trinkgeld = mehr Zeit. Zu spät = gratis." },
        bild("pf-lieferung.svg", "Links eine Warteschlange von Bestellungen, sortiert nach Trinkgeld: Diavolo 5 €, Margherita 2 €, Funghi 2 €. Mitte ein Roller, der erst bei warte losfährt. Rechts eine 30-Minuten-Uhr: pünktlich gibt wert(), zu spät gibt oderGratis", "Die Lieferung startet erst beim Warten."),
        { art: "text", md: "Programmier-Begriff: ein **Future** (auch *Promise*) mit Zeitlimit und Ersatzwert." },
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
            'l.trinkgeld(5);',
            'Zustellung<salami> z = l.warte(max: 30min);',
            'Bote.sage(("Pünktlich? " + z.pünktlich()));',
            'Bote.sage(("Geliefert: " + z.oderGratis((0))));'
          )
        },
        { art: "ausgabe", text: z("Bestellt. Noch passiert nichts.", "Bote fährt los ...", "Pünktlich? ja", "Geliefert: 42") },
        {
          art: "details",
          titel: "Alle Methoden und die Budget-Formel",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Methode", "auf", "Wirkung"],
              zeilen: [
                ["`trinkgeld(n)`", "Lieferung", "Priorität; jeder Euro erhöht das Budget um 10 %. Mehrere Trinkgelder **zählen zusammen**. Gibt die Lieferung zurück (verkettbar)."],
                ["`warte(max: d)` / `warte(d)`", "Lieferung", "führt **jetzt** aus, Budget `d_ms × (1 + Trinkgeld-Summe/10)` Schritte → `Zustellung`. Erneutes `warte` liefert dieselbe Zustellung – geliefert ist geliefert."],
                ["`warte()`", "Lieferung", "ohne Zeitlimit: wartet, bis die Pizza da ist"],
                ["`istGeliefert()`", "Lieferung", "`ja`, sobald einmal gewartet wurde"],
                ["`wennDa(fn)`", "Lieferung", "Rückruf mit dem Wert: klingelt direkt nach einem pünktlichen `warte` (bzw. sofort, wenn schon pünktlich geliefert) – sonst **nach Programmende**. Ein zweites `wennDa` ersetzt das erste."],
                ["`pünktlich()`", "Zustellung", "`ja`, wenn das Budget gereicht hat"],
                ["`wert()`", "Zustellung", "der Wert; zu spät → `LieferAnanas: Zu spät – die Pizza ist kalt.`"],
                ["`oderGratis(v)`", "Zustellung", "der Wert; zu spät → `v` (die Pizza geht aufs Haus)"]
              ]
            },
            { art: "text", md: "Ananas, die `fn` selbst wirft, fliegen **nicht** schon bei `warte`, sondern erst bei `wert()` bzw. `oderGratis()` – `pünktlich()` kann also `ja` sein, obwohl in der Küche etwas schiefging. Ein `wennDa`-Rückruf läuft dann gar nicht." },
            { art: "text", md: "**Trinkgeld wirkt.** Zwei gleiche Bestellungen mit 100 ms Budget: Ohne Trinkgeld reichen 100 Schritte nicht für eine Schleife mit 200 Runden. Mit 990 € Trinkgeld wird das Budget verhundertfacht (`100 × (1 + 990/10) = 10 000` Schritte)." },
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
            }
          ]
        },
        {
          art: "details",
          titel: "Rückrufe mit wennDa: wer zuerst klingelt",
          inhalt: [
            { art: "text", md: "Wer nicht warten will, hinterlässt eine Nachricht an der Tür. Wird doch noch pünktlich gewartet, klingelt es direkt nach dem `warte`. Alle Lieferungen mit Rückruf, die bis zum Programmende **nicht** per `warte` abgeholt wurden, laufen **nach Programmende** – sortiert nach **Trinkgeld absteigend**, bei Gleichstand in **Bestellreihenfolge**. Ein Budget gibt es dort nicht mehr. Lieferungen ganz ohne `wennDa` und ohne `warte` werden nie gebacken." },
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
            { art: "hinweis", ton: "info", md: "**Tier 2 – keine echte Nebenläufigkeit.** `warte` führt die Bestellung im Playground **sofort und nacheinander** aus und misst Schritte statt Uhrzeit; „zu spät“ heißt: das Schrittbudget war aufgebraucht. Echte Hintergrund-Threads bei `bestelle` sind **Tier 3**." }
          ]
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "pf-calzone",
      gruppe: G,
      ordnung: 395,
      titel: "Calzone (echte Kapselung)",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Eine **Calzone** ist zugeklappt: Was drin ist, sieht niemand – nicht mal der `Spiegel`. Erst `aufklappen()` macht sie zu einer ganz normalen Pizza." },
        bild("pf-calzone.svg", "Links eine zugeklappte Calzone mit Schloss; der Spiegel sieht nichts und meldet ZugeklapptAnanas. Nach aufklappen() rechts eine offene Pizza; der Spiegel zeigt {stand: 1000}, dazu Warnung W0013", "Zu ist zu – bis man aufklappt."),
        { art: "text", md: "Programmier-Begriff: **starke Kapselung**, die auch *Reflection* standhält. `Spiegel.felder(obj)` ist pizzas Reflection: Bei normalen Klassen zeigt sie alle Felder, auch die geheimen." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            'calzone klasse Konto {',
            '    geheimrezept funghi stand = (1000.0);',
            '}',
            'Konto k = neu Konto();',
            'probier {',
            '    Bote.sage((Spiegel.felder(k)));',
            '} verbrannt (ZugeklapptAnanas e) {',
            '    Bote.sage((e.nachricht()));',
            '}',
            'k.aufklappen();                 // Warnung W0013',
            'Bote.sage((Spiegel.felder(k)));'
          )
        },
        { art: "ausgabe", text: z("Die Calzone ist zu. Nutze aufklappen().", "{stand: 1000}") },
        {
          art: "details",
          titel: "Vergleich mit normaler Klasse, alle Regeln",
          inhalt: [
            { art: "text", md: "- Normale Klasse: `Spiegel.felder(obj)` liefert eine `Speisekarte` **aller** Felder, auch der `geheimrezept`-Felder.\n- Zugeklappte Calzone: `Spiegel.felder(obj)` → `ZugeklapptAnanas: Die Calzone ist zu. Nutze aufklappen().`\n- `geheimrezept`-Felder sind von außen wie gewohnt tabu (`ZugriffsAnanas`).\n- `obj.aufklappen()` (nur bei Calzone) öffnet sie – mit Warnung `W0013: Garantie erloschen. Das ist jetzt eine ganz normale Pizza.` Danach funktioniert `Spiegel.felder(obj)`, und `geheimrezept`-Felder sind von außen les- und schreibbar." },
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
                '',
                'k.aufklappen();                 // Warnung W0013',
                'k.stand = 0.0;                  // jetzt geht alles. wirklich alles.',
                'Bote.sage((k.zeigeStand()));'
              )
            },
            { art: "ausgabe", text: z("{inhalt: 12.5}", "ZugriffsAnanas", "0") },
            { art: "hinweis", ton: "pizza", md: "Eine aufgeklappte Calzone bleibt für immer eine ganz normale Pizza. Zuklappen ist nicht vorgesehen – das hat in der Geschichte der italienischen Küche noch niemand ohne Sauerei geschafft." }
          ]
        }
      ]
    }
  );
})();
