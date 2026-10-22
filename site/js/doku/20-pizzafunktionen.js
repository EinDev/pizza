/* pizza v3.1 – Doku: Pizza-Funktionen (ordnung 300–399) – Doku v2: kurz, Bild, ein Beispiel, Rest in details */
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
        bild("pf-ueberblick.svg", "Spickzettel: neun Pizza-Metaphern und das Programmierkonzept dahinter, z. B. Teig = Lazy Evaluation, Ofen = Zeitlimit mit Teilergebnis", "Jede Metapher steht für ein echtes Konzept."),
        { art: "text", md: "Ein kleiner Rundgang durch die Küche: etwas in den Ofen schieben, ein Blech schneiden, eine Bestellung an einen anderen Tisch schieben." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'salami ergebnis = ofen(zeit: 90s) {',
            '    serviere (([1 .. 8].summe()));',
            '};',
            'Bote.sage(("Aus dem Ofen: " + ergebnis));',
            'Blech<Blech<salami>> teller = [1 .. 8] / 4;',
            'Bote.sage(("Geschnitten: " + teller));',
            'Blech<margherita> tisch1 = ["Margherita", "Funghi"];',
            'Blech<margherita> tisch2 = schieb(tisch1);',
            'Bote.sage(("Geschoben: " + tisch2));'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "Aus dem Ofen: 36",
            "Geschnitten: [[1, 2], [3, 4], [5, 6], [7, 8]]",
            "Geschoben: [Margherita, Funghi]"
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
                ["Simulierte Uhr, Schritte", "Deterministische virtuelle Zeit, Fuel-/Step-Counter", "2"],
                ["`teig(...)`, `gehenlassen()`, `backen()`", "Lazy Evaluation, Thunk mit Memoisierung (`Lazy<T>`)", "2"],
                ["`ofen(...) { } roh (r) { }`", "Timeout mit Zeitbudget und Teilergebnis (*anytime algorithm*)", "2"],
                ["`schneide(n)`, `blech / n`", "Datenparallelität, Fork/Join, Map-Reduce", "2 (sequentiell simuliert)"],
                ["`blech.brigade(fn)`, `KüchenAnanas`", "Echte Parallelität (paralleles Map) ohne gemeinsamen Zustand, deterministisch", "1"],
                ["`schieb(p)`, `LeererKartonAnanas`", "Ownership & Move-Semantik (à la Rust): ein Wert wechselt den Besitzer, der alte Karton ist leer", "2 (Laufzeitprüfung)"],
                ["`@Kühlschrank`, `.mikrowelle()`", "Memoisierung/Caching mit TTL, *stale-while-revalidate*", "2"],
                ["`bestelle`, `priorität`, `warte`, `wennDa`", "Futures/Promises, Prioritäten, Timeout mit Fallback, Callbacks", "2"],
                ["`calzone klasse`, `aufklappen()`", "Starke Kapselung, die auch Reflection standhält", "1"]
              ]
            },
            { art: "hinweis", ton: "info", md: "Der Playground läuft komplett im Browser und ist deterministisch: Es gibt **keine echten Threads** und **keine Wanduhr**, und mit derselben Zufalls-Saat (siehe *Zufall*) kommt bei jedem Lauf dasselbe heraus. Zeit wird in Schritten gemessen (1 Schritt = 1 ms simulierte Zeit). `schneide` mit `belege`, `teig` und `bestelle` laufen nacheinander; echte Hintergrund-Threads bei `teig` und `bestelle` sind **Tier 3** – also nur Spezifikation. Mehrere Köche gleichzeitig gibt es mit der *Küchenbrigade* (`brigade`) – mit genau demselben Ergebnis wie nacheinander." }
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
        bild("pf-ofen.svg", "Ofen mit Zeitbudget-Balken und Zwischenstand-Punkten. Drei Ausgänge: fertig im Budget, Zeit um (roh mit Teilergebnis), Ananas (verbrannt)", "Fertig, roh oder verbrannt – der Ofen hat drei Ausgänge."),
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
          titel: "Aufbau und Budget",
          inhalt: [
            {
              art: "code",
              ausfuehrbar: false,
              tier: 2,
              code: z(
                'salami s = ofen(zeit: 90s) {',
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
                ["`zeit:`", "Argument (Dauer, eine Zahl gilt als ms), Standard **60s**"],
                ["`ofen(90s)`", "Ohne Namen geht es auch: das erste Argument ist die Zeit"],
                ["Budget", "**zeit_ms** Schritte – 1 Schritt = 1 ms simulierte Zeit"],
                ["`serviere ((x));`", "liefert den Wert des `ofen`-Ausdrucks – verlässt **nicht** die umgebende Methode"],
                ["`roh (r)`", "läuft bei Budgetüberschreitung; `r.teilergebnis()` (letzter `zwischenstand` oder `karton`), `r.verbrauchteZeit()` (Dauer)"],
                ["`verbrannt (…)`", "fängt Ananas aus dem Block (auch „Zu lange im Ofen“, wenn es keinen `roh`-Zweig gibt), Syntax wie bei `probier`"]
              ]
            },
            {
              art: "tabelle",
              kopf: ["Aufruf", "Budget in Schritten"],
              zeilen: [
                ["Standardwert (60s)", "**60 000**"],
                ["`ofen(zeit: 90s)` oder `ofen(90s)`", "**90 000**"],
                ["`ofen(zeit: 1s)`", "**1 000**"],
                ["`ofen(zeit: 50ms)`", "**50** – das reicht für kaum mehr als ein Aufbacken"],
                ["`ofen(zeit: 0ms)`", "**0** – schon der erste Schritt ist zu viel (`roh` bzw. `VerbranntAnanas`)"]
              ]
            },
            { art: "text", md: "`roh` und `verbrannt` sind beide optional; wenn beide da sind, steht `roh` zuerst. Das ganze `ofen(...) {...}` ist ein **Ausdruck** und wird als Anweisung mit `;` abgeschlossen. Die genaue verbrauchte Zeit und das genaue Teilergebnis hängen davon ab, wie viele Schritte eine Schleifenrunde kostet." },
            { art: "hinweis", ton: "info", md: "**Tier 2:** Das Budget wird in Schritten der simulierten Uhr gemessen, nicht in echter Zeit. Eine Ofentemperatur gibt es nicht – wer mehr Budget will, gibt mehr Zeit." }
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
            { art: "text", md: "Ganz ohne Zeit geht es auch nicht: Bei `ofen(zeit: 0ms)` ist schon der erste Schritt zu viel. Ohne `roh`-Zweig fängt der eigene `verbrannt`-Zweig das – genauso wie selbst geworfene Ananas:" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 2,
              code: z(
                'margherita ergebnis = ofen(zeit: 0ms) {',
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
            { art: "ausgabe", text: z("verkohlt: Zu lange im Ofen: Budget von 0 Schritten überschritten.", "gerettet: Rand angebrannt") }
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
            'Blech<Blech<salami>> stücke = zahlen.schneide(8);   // 8 Stücke',
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
          titel: "Schreibweisen und fair teilen mit /",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Schreibweise", "Wirkung"],
              zeilen: [
                ["`blech.schneide(n)`", "`n` Teil-Bleche, möglichst gleich groß, vordere ggf. größer; `n` ist eine Ganzzahl und **Pflicht** (`schneide()` → `TypAnanas: schneide braucht eine Ganzzahl, nicht karton.`)"],
                ["`blech / n`", "wie `schneide(n)`, aber **fair**: geht es nicht auf → `StreitAnanas`; `/ 0` → `RechenAnanas`"],
                ["mehr Stücke als Elemente", "`[1, 2, 3].schneide(5)` → `[[1], [2], [3], [], []]` – leere Teller gibt es auch"],
                ["`schneide(0)` oder weniger", "`StreitAnanas: In 0 Stücke schneiden? Das geht nicht.`"]
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
                '// Jede Stückzahl ab 1 ist erlaubt, auch eine ungerade:',
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
            { art: "hinweis", ton: "info", md: "**Tier 2 – `belege` arbeitet nacheinander.** Die Stücke laufen der Reihe nach in einer Küche; die Uhr zählt die Zeit aller Stücke zusammen. Sollen die Köche wirklich gleichzeitig arbeiten, nimm `brigade` statt `belege` – siehe *Küchenbrigade*." }
          ]
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "pf-brigade",
      gruppe: G,
      ordnung: 365,
      titel: "Küchenbrigade (echte Parallelität)",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Mit `brigade` bekommt jedes Element eines Blechs eine **eigene Küche** mit eigenem Koch. Alle kochen gleichzeitig – auf der Pizza-Uhr zählt nur der **langsamste**. In die Hauptküche dürfen die Köche nur **hineinschauen**." },
        bild("pf-brigade.svg", "Oben die abgeschlossene Hauptküche mit bons, namen und gezählt = 0 als Schnappschuss. Gestrichelte Pfeile: vier Küchen schauen hinein. Jede Küche hat einen Koch und einen eigenen Uhrbalken, Küche 2 ist am langsamsten. Ein roter, durchgestrichener Pfeil zurück in die Hauptküche: schreiben gibt eine KüchenAnanas. Unten kommen vier Kartons 1 bis 4 und ergeben das Blech [r1, r2, r3, r4] – immer in dieser Reihenfolge", "Lesen ja, schreiben nein – und zurück kommt nur, was serviert wird."),
        { art: "text", md: "Programmier-Begriff: **paralleles Map** (Fork/Join ohne gemeinsamen Zustand). `blech.brigade(fn)` liefert genau dasselbe Blech wie `blech.belege(fn)` – gleiche Werte, gleiche Reihenfolge. Der Unterschied: Jedes Element läuft in einer abgeschotteten Küche, und die Zeit wird so gemessen, als hätten alle Köche gleichzeitig angefangen." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 1,
          code: z(
            'Blech<salami> bestellungen = [3, 1, 4, 2];   // Minuten im Ofen',
            '',
            'salami backe(salami minuten) {',
            '    Uhr.vorspulen(minuten * 1min);',
            '    serviere (minuten * 2);                  // zwei Pizzen pro Ofenminute',
            '}',
            '',
            'Dauer t0 = Uhr.jetzt();',
            'Blech<salami> a = bestellungen.belege(m -> backe(m));',
            'Bote.sage(("belege:  " + a + " nach " + (Uhr.jetzt() - t0)));',
            '',
            'Dauer t1 = Uhr.jetzt();',
            'Blech<salami> b = bestellungen.brigade(m -> backe(m));',
            'Bote.sage(("brigade: " + b + " nach " + (Uhr.jetzt() - t1)));'
          )
        },
        { art: "ausgabe", text: z("belege:  [6, 2, 8, 4] nach 10min 64ms", "brigade: [6, 2, 8, 4] nach 4min 28ms") },
        { art: "text", md: "Gleiches Ergebnis, aber `belege` braucht 3 + 1 + 4 + 2 = 10 Minuten, die Brigade nur so lange wie der Koch mit den 4 Minuten. Die gezählten Schritte (die **Arbeit**) sind bei beiden gleich – nur die **Zeit** ist kürzer." },
        {
          art: "details",
          titel: "Was ein Koch darf – und was nicht (KüchenAnanas)",
          inhalt: [
            { art: "text", md: "Beim Start der Brigade wird die Hauptküche **eingefroren**: Alles, was es da schon gibt – Variablen, Objekte, Bleche, Speisekarten –, darf ein Koch **lesen**, aber nicht verändern. Was er selbst anlegt, gehört ihm und ist frei veränderbar. Der einzige Weg zurück ist `serviere`." },
            {
              art: "tabelle",
              kopf: ["In der Küche", "erlaubt?"],
              zeilen: [
                ["Variablen und Objekte der Hauptküche **lesen**", "ja – Stand vom Start der Brigade"],
                ["eigene Variablen, `neu`, eigene Bleche und Speisekarten, `kopie()`", "ja, lesen und ändern"],
                ["Methoden aufrufen, `ofen`, `probier`, eigene `teig`/`bestelle`, `Uhr`, `Zufall`", "ja"],
                ["`Bote.sage` & Co.", "ja – die Ausgaben erscheinen in der Reihenfolge der Elemente"],
                ["Variable oder Feld der Hauptküche ändern (`=`, `+=`, `++`)", "nein → `KüchenAnanas`"],
                ["`hinzu`/`entferne`/`setze` auf einem Blech der Hauptküche", "nein → `KüchenAnanas` (nimm eine `kopie()`)"],
                ["`Bestellannahme`, `Theke`, `neu Vorratskammer(…)`", "nein – gibt es nur in der Hauptküche"],
                ["Funktion, Teig, Lieferung oder Zufall-Objekt **servieren**", "nein – nur Werte passen in den Karton"]
              ]
            },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                'Blech<margherita> fertig = [];',
                'salami gezählt = 0;',
                'probier {',
                '    [1, 2, 3].brigade(nr -> {',
                '        Blech<margherita> meins = fertig.kopie();   // eigene Kopie: frei veränderbar',
                '        meins.hinzu(("Pizza " + nr));',
                '        gezählt++;                                    // gehört der Hauptküche!',
                '        serviere (nr);',
                '    });',
                '} verbrannt (KüchenAnanas a) {',
                '    Bote.sage((a.nachricht()));',
                '}',
                'probier {',
                '    [1, 2].brigade(nr -> fertig.hinzu(("Pizza " + nr)));',
                '} verbrannt (KüchenAnanas a) {',
                '    Bote.sage((a.nachricht()));',
                '}',
                'Blech<salami> zahlen = [1, 2, 3].brigade(nr -> nr * 10);',
                'gezählt = zahlen.länge();          // zurück in der Hauptküche: alles erlaubt',
                'Bote.sage((zahlen + " / gezählt: " + gezählt));'
              )
            },
            { art: "ausgabe", text: z("'gezählt' gehört der Hauptküche – ein Koch darf es nur lesen.", "Dieses Blech gehört der Hauptküche – nimm eine kopie().", "[10, 20, 30] / gezählt: 3") },
            { art: "text", md: "Die `KüchenAnanas` ist eine `LaufzeitAnanas`. Sie fliegt genau an der Stelle, an der geschrieben werden soll – noch bevor sich etwas ändert –, und lässt sich im Koch oder um den `brigade`-Aufruf herum fangen. Auch was nicht in den Karton passt, gibt eine:" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                'probier {',
                '    [1, 2].brigade(x -> (y -> y + x));     // eine Funktion servieren',
                '} verbrannt (KüchenAnanas a) {',
                '    Bote.sage((a.nachricht()));',
                '}',
                'probier {',
                '    [1].brigade(x -> Bestellannahme.lies());',
                '} verbrannt (KüchenAnanas a) {',
                '    Bote.sage((a.nachricht()));',
                '}'
              )
            },
            { art: "ausgabe", text: z("Eine Funktion passt in keinen Karton – nur Werte können die Küche verlassen.", "Bestellannahme gibt es nur in der Hauptküche.") },
            { art: "hinweis", ton: "pizza", md: "Zurück kommen immer **Kopien** – auch eigene Objekte, Bleche und Speisekarten. Die gehören dann wieder der Hauptküche und sind dort frei veränderbar." }
          ]
        },
        {
          art: "details",
          titel: "Immer dasselbe Ergebnis – egal wie viele Köche",
          inhalt: [
            { art: "text", md: "Eine Brigade ist **deterministisch**: Ausgabe, Ananas, Exit-Code, Schritte und Pizza-Uhr sind bei jedem Lauf gleich – genau so, als hätten die Köche einer nach dem anderen gekocht.\n\n- **Reihenfolge:** Das Ergebnis-Blech und alle Ausgaben kommen in der Reihenfolge der Elemente, egal welcher Koch zuerst fertig ist.\n- **Ärger:** Werfen mehrere Köche eine Ananas, gewinnt die des **ersten** Elements. Sie fliegt am `brigade`-Aufruf weiter; Köche dahinter zählen, als wären sie nie gelaufen.\n- **Zufall:** Jede Küche würfelt mit einem eigenen Würfel. Dessen Saat zieht die Hauptküche beim Start der Brigade der Reihe nach – mit derselben Saat kommt also immer dasselbe heraus.\n- **Uhr:** Jede Küche hat eine eigene Uhr. Danach steht die Uhr der Hauptküche dort, wo der langsamste Koch fertig wurde." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                'Zufall.saat(42);',
                'Blech<salami> würfe = [1, 2, 3].brigade(x -> {',
                '    Bote.sage(("Koch " + x + " würfelt"));',
                '    serviere (Zufall.zahl(1, 1000));',
                '});',
                'Bote.sage((würfe));',
                'Bote.sage((Zufall.zahl(1, 1000)));   // die Hauptküche würfelt weiter'
              )
            },
            { art: "ausgabe", text: z("Koch 1 würfelt", "Koch 2 würfelt", "Koch 3 würfelt", "[248, 359, 896]", "670") },
            { art: "text", md: "**Stücke und Köche sind zweierlei.** Wie viele Stücke es gibt, bestimmt dein Programm – meist mit `schneide(n)`. Wie viele Köche gleichzeitig daran arbeiten, bestimmt dagegen der Rechner, auf dem das Programm läuft. Daran ändert sich nur, wie lange du in echt wartest – nie das Ergebnis." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                'Blech<salami> bons = [1 .. 1000];',
                'Blech<salami> teilsummen = bons.schneide(4).brigade(stapel -> stapel.summe());',
                'Bote.sage((teilsummen));',
                'Bote.sage((teilsummen.zusammenklappen((a, b) -> a + b)));'
              )
            },
            { art: "ausgabe", text: z("[31375, 93875, 156375, 218875]", "500500") },
            { art: "hinweis", ton: "info", md: "Die Küchenbrigade läuft im Interpreter; der Wasm-Motor (Beta) kann sie noch nicht – mit „Auto (Beta)“ übernimmt dann der Interpreter. Er lässt die Köche nacheinander kochen: Ergebnis und Pizza-Uhr sind genau dieselben." },
            { art: "hinweis", ton: "pizza", md: "Ein ganzes Fest mit 24 Pizzen, vier Köchen und einem Koch, der heimlich mitzählen will, zeigt das Beispiel **Küchenbrigade** unter *Pizza-Funktionen*." }
          ]
        }
      ]
    },

    // ------------------------------------------------------------------
    {
      id: "pf-schieb",
      gruppe: G,
      ordnung: 370,
      titel: "Schieben (Ownership)",
      tier: 2,
      inhalt: [
        { art: "kurz", md: "Mit `schieb(x)` wandert der Inhalt eines Kartons an einen anderen Tisch. Der alte Karton ist danach **leer** – wer hineingreift, bekommt eine `LeererKartonAnanas`." },
        bild("pf-besitz.svg", "q = schieb(p) bewegt die Pizza von Tisch 1 zu Tisch 2, an Tisch 1 bleibt ein leerer Karton. Darunter: Lesen von p gibt eine LeererKartonAnanas, p = … füllt den Karton wieder.", "Schieben bewegt den ganzen Inhalt – zurück bleibt ein leerer Karton."),
        { art: "text", md: "Programmier-Begriff: **Move-Semantik** (Ownership wie in Rust). Ein Wert hat einen Besitzer; `schieb` gibt ihn ausdrücklich weiter, statt ihn stillschweigend zu teilen." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          code: z(
            'Blech<margherita> bestellung = ["Margherita", "Funghi"];',
            'Blech<margherita> tisch2 = schieb(bestellung);   // wandert zu tisch2',
            'Bote.sage((tisch2));',
            'probier {',
            '    Bote.sage((bestellung));',
            '} verbrannt (LeererKartonAnanas e) {',
            '    Bote.sage((e.nachricht()));',
            '}',
            'bestellung = ["Diavolo"];                         // neuer Karton, neues Glück',
            'Bote.sage((bestellung));'
          )
        },
        {
          art: "ausgabe",
          text: z(
            "[Margherita, Funghi]",
            "'bestellung' wurde weggeschoben – der Karton ist leer.",
            "[Diavolo]"
          )
        },
        {
          art: "details",
          titel: "Alle Regeln: schieben, zuweisen, neu füllen",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Situation", "Was passiert"],
              zeilen: [
                ["`T q = schieb(p);`", "Der Wert wandert zu `q`; `p` ist danach ein leerer Karton. Geht mit Variablen **jeden Typs** – Zahlen, Texte, Bleche, Objekte"],
                ["Lesen von `p` nach `schieb(p)`", "`LeererKartonAnanas: 'p' wurde weggeschoben – der Karton ist leer.` – auch `Bote.sage((p))` zählt als Lesen"],
                ["`p = …;` nach `schieb(p)`", "erlaubt – der Karton ist wieder voll und ganz normal benutzbar"],
                ["`schieb(k.feld)`, `schieb(p + 1)`", "geht nicht: `LaufzeitAnanas: schieb braucht genau einen Variablennamen: schieb(p).`"],
                ["`T q = p;` (ohne `schieb`)", "erlaubt – bei Blechen, Speisekarten und Objekten zeigen `p` und `q` dann auf **dasselbe** Ding; Zahlen und Texte werden kopiert"],
                ["`f(p)`, `serviere ((p));`", "erlaubt und kein Schieben – `p` bleibt voll"]
              ]
            },
            { art: "text", md: "Der Unterschied zwischen Zuweisen und Schieben wird bei Blechen sichtbar: Nach `b = a` hängt ein `b.hinzu(…)` auch an `a` – es ist dasselbe Blech. Nach `schieb(a)` gibt es `a` nicht mehr, und niemand kann sich wundern, warum sein Blech plötzlich länger ist." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 2,
              code: z(
                'Blech<margherita> a = ["Margherita"];',
                'Blech<margherita> b = a;             // zwei Namen, ein Blech',
                'b.hinzu("Funghi");',
                'Bote.sage((a));',
                '',
                'Blech<margherita> c = schieb(a);     // jetzt gehört es nur noch c',
                'c.hinzu("Diavolo");',
                'Bote.sage((c));',
                'probier {',
                '    Bote.sage((a.länge()));',
                '} verbrannt (LeererKartonAnanas e) {',
                '    Bote.sage((e.nachricht()));',
                '}'
              )
            },
            {
              art: "ausgabe",
              text: z(
                "[Margherita, Funghi]",
                "[Margherita, Funghi, Diavolo]",
                "'a' wurde weggeschoben – der Karton ist leer."
              )
            },
            { art: "hinweis", ton: "info", md: "**Tier 2 – Laufzeitprüfung statt Borrow-Checker.** Der Playground merkt sich nur, dass der Karton leer ist, und meckert erst, wenn jemand hineingreift. Eine Prüfung vor dem Start wie in Rust gibt es nicht." }
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
      titel: "Lieferung (Async mit Priorität)",
      tier: 2,
      inhalt: [
        { art: "kurz", md: "Mit `bestelle` gibst du eine Bestellung auf – gekocht wird aber erst, wenn du auf die Lieferung **wartest**. Wer zuerst drankommt, sagt die **Priorität**. Zu spät = gratis." },
        bild("pf-lieferung.svg", "Links eine Warteschlange von Bestellungen, sortiert nach Priorität: Diavolo 5, Margherita 2, Funghi 2. Mitte ein Roller, der erst bei warte losfährt. Rechts eine 30-Minuten-Uhr: pünktlich gibt wert(), zu spät gibt oderGratis", "Die Lieferung startet erst beim Warten."),
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
            'l.priorität(5);',
            'Zustellung<salami> z = l.warte(max: 30min);',
            'Bote.sage(("Pünktlich? " + z.pünktlich()));',
            'Bote.sage(("Geliefert: " + z.oderGratis((0))));'
          )
        },
        { art: "ausgabe", text: z("Bestellt. Noch passiert nichts.", "Bote fährt los ...", "Pünktlich? ja", "Geliefert: 42") },
        {
          art: "details",
          titel: "Alle Methoden und das Budget",
          inhalt: [
            {
              art: "tabelle",
              kopf: ["Methode", "auf", "Wirkung"],
              zeilen: [
                ["`priorität(n)`", "Lieferung", "setzt die Priorität (jede Zahl, Standard 0; der **letzte** Aufruf gilt). Sie ordnet nur die Rückrufe nach Programmende – am Budget ändert sie nichts. Gibt die Lieferung zurück (verkettbar)."],
                ["`warte(max: d)` / `warte(d)`", "Lieferung", "führt **jetzt** aus, Budget genau `d_ms` Schritte → `Zustellung`. Erneutes `warte` liefert dieselbe Zustellung – geliefert ist geliefert."],
                ["`warte()`", "Lieferung", "ohne Zeitlimit: wartet, bis die Pizza da ist"],
                ["`istGeliefert()`", "Lieferung", "`ja`, sobald einmal gewartet wurde"],
                ["`wennDa(fn)`", "Lieferung", "Rückruf mit dem Wert: klingelt direkt nach einem pünktlichen `warte` (bzw. sofort, wenn schon pünktlich geliefert) – sonst **nach Programmende**. Ein zweites `wennDa` ersetzt das erste."],
                ["`pünktlich()`", "Zustellung", "`ja`, wenn das Budget gereicht hat"],
                ["`wert()`", "Zustellung", "der Wert; zu spät → `LieferAnanas: Zu spät – die Pizza ist kalt.`"],
                ["`oderGratis(v)`", "Zustellung", "der Wert; zu spät → `v` (die Pizza geht aufs Haus)"]
              ]
            },
            { art: "text", md: "Ananas, die `fn` selbst wirft, fliegen **nicht** schon bei `warte`, sondern erst bei `wert()` bzw. `oderGratis()` – `pünktlich()` kann also `ja` sein, obwohl in der Küche etwas schiefging. Ein `wennDa`-Rückruf läuft dann gar nicht." },
            { art: "text", md: "**Zeit wirkt, Priorität nicht.** Zwei gleiche Bestellungen: 100 Schritte (`warte(max: 100ms)`) reichen nicht für eine Schleife mit 200 Runden – daran ändert auch eine hohe Priorität nichts. Mit `warte(max: 10s)` ist genug Zeit." },
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
                'Lieferung<salami> eilig = bestelle(() -> (Küche.rechne()));',
                'Lieferung<salami> gemütlich = bestelle(() -> (Küche.rechne()));',
                'eilig.priorität(99);   // ändert das Budget nicht',
                '',
                'Zustellung<salami> kalt = eilig.warte(max: 100ms);',
                'Bote.sage(("Eilig pünktlich? " + kalt.pünktlich()));',
                'Bote.sage(("Eilig bekommt: " + kalt.oderGratis((0))));',
                'probier {',
                '    Bote.sage((kalt.wert()));',
                '} verbrannt (LieferAnanas e) {',
                '    Bote.sage((e.nachricht()));',
                '}',
                '',
                'Zustellung<salami> heiß = gemütlich.warte(max: 10s);',
                'Bote.sage(("Gemütlich pünktlich? " + heiß.pünktlich()));',
                'Bote.sage(("Gemütlich bekommt: " + heiß.wert()));'
              )
            },
            {
              art: "ausgabe",
              text: z(
                "Eilig pünktlich? nein",
                "Eilig bekommt: 0",
                "Zu spät – die Pizza ist kalt.",
                "Gemütlich pünktlich? ja",
                "Gemütlich bekommt: 20100"
              )
            }
          ]
        },
        {
          art: "details",
          titel: "Rückrufe mit wennDa: wer zuerst klingelt",
          inhalt: [
            { art: "text", md: "Wer nicht warten will, hinterlässt eine Nachricht an der Tür. Wird doch noch pünktlich gewartet, klingelt es direkt nach dem `warte`. Alle Lieferungen mit Rückruf, die bis zum Programmende **nicht** per `warte` abgeholt wurden, laufen **nach Programmende** – sortiert nach **Priorität absteigend**, bei Gleichstand in **Bestellreihenfolge**. Ein Budget gibt es dort nicht mehr. Lieferungen ganz ohne `wennDa` und ohne `warte` werden nie gebacken." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 2,
              code: z(
                'Lieferung<margherita> erste = bestelle(() -> ("Margherita"));',
                'Lieferung<margherita> zweite = bestelle(() -> ("Diavolo"));',
                'Lieferung<margherita> dritte = bestelle(() -> ("Funghi"));',
                '',
                'erste.priorität(2);',
                'zweite.priorität(5);',
                'dritte.priorität(2);',
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
