// Doku: Geschichte – Warum es pizza gibt.
// Format siehe ARCHITEKTUR.md §4.
(function () {
  const ziel = typeof self !== "undefined" ? self : globalThis;
  const doku = (ziel.PIZZA_DOKU = ziel.PIZZA_DOKU || []);

  doku.push(
    {
      id: "geschichte-warum",
      gruppe: "Geschichte",
      ordnung: 0,
      titel: "Warum pizza?",
      tier: 1,
      inhalt: [
        {
          art: "text",
          md:
            "Die meisten Programmiersprachen entstehen, weil jemand ein Problem mit Speicher, Typen oder Nebenläufigkeit hatte. " +
            "pizza entstand, weil an einem Freitagabend in Wuppertal 412 Pizzen auf einen Server warteten, der sie lieber nacheinander durchdenken wollte.\n\n" +
            "Diese Seite erzählt, woher jede seltsame Entscheidung der Sprache kommt. Keine davon ist ausgedacht. Fast keine."
        }
      ]
    },

    {
      id: "geschichte-freitag",
      gruppe: "Geschichte",
      ordnung: 10,
      titel: "Ein Bon in acht Streifen",
      tier: 1,
      inhalt: [
        {
          art: "text",
          md:
            "Die Pizzeria „Da Pina“ eröffnete 1971 in Wuppertal-Elberfeld. Giuseppina Esposito, genannt **Nonna Pina**, hatte aus Neapel einen Sauerteig, drei Sprichwörter und einen jungen Pizzaiolo namens **Luigi Cuomo** mitgebracht. " +
            "2003 gab es 23 Filialen – und einen Vertrag mit der Düsseldorfer Beratung *Brettschneider & Partner*, die das Bestellwesen digitalisieren sollte.\n\n" +
            "Das Ergebnis hieß **PINA-ORDER 7**: 1,4 Millionen Zeilen Java auf einem einzigen Server im Keller der Zentrale."
        },
        {
          art: "hinweis",
          ton: "pizza",
          md: "„Pizza ist eine Domäne wie jede andere.“\n\n– *Dr. Brettschneider, auf Nonnas Frage, ob sich die Herren mit Pizza auskennen*"
        },
        {
          art: "text",
          md:
            "Am Freitag, dem 13. Oktober 2006, um 19:42 Uhr ging die Sammelbestellung der Stadtwerke ein: 412 Pizzen. PINA-ORDER 7 verarbeitete Bestellungen streng nacheinander, in einem einzigen Thread. Die Küchendrucker aller Filialen verstummten.\n\n" +
            "Luigi wartete vier Minuten. Dann riss er den Bon aus dem Drucker, schnitt ihn mit dem Pizzaroller in acht Streifen – „acht, nie sieben, bei sieben streiten sich die Leute“ – und verteilte sie an acht Kollegen. " +
            "Dazu gab er genau eine Regel aus: Nichts bleibt länger als 90 Sekunden im Ofen. Was dann nicht fertig ist, geht raus, wie es ist. " +
            "Um 20:31 Uhr waren die Stadtwerke satt. Der Server rechnete noch.\n\n" +
            "Im selben Chaos ordnete das System eine einzige Margherita gleichzeitig Tisch 12 und Tisch 14 zu – es hatte eine Referenz kopiert statt einer Pizza. " +
            "Ein Kellner trug sie zwanzig Minuten hin und her, bis Luigi sie ihm aus der Hand nahm."
        },
        {
          art: "hinweis",
          ton: "pizza",
          md: "„Eine Pizza kann nicht an zwei Tischen gleichzeitig sein.“\n\n– *Luigi Cuomo, 13. Oktober 2006, ca. 20:10 Uhr*"
        },
        {
          art: "text",
          md:
            "Das Werbeversprechen „30 Minuten oder gratis“ kostete an diesem Abend 9.340 Euro.\n\n" +
            "Um drei Uhr nachts saß **Enzo Esposito**, Nonnas Enkel und seit drei Monaten Diplom-Informatiker, in der leeren Küche und schrieb auf die Innenseite eines Pizzakartons, was Luigi getan hatte. " +
            "Es war das erste pizza-Programm."
        }
      ]
    },

    {
      id: "geschichte-ananas",
      gruppe: "Geschichte",
      ordnung: 20,
      titel: "Die Ananas von Hannover",
      tier: 1,
      inhalt: [
        {
          art: "text",
          md:
            "Im März 2007 setzte **Filiale 39** in Hannover eigenmächtig eine Pizza Hawaii auf die Karte. Das Belag-Enum von PINA-ORDER 7 kannte keine Ananas. " +
            "Die erste Bestellung löste eine NullPointerException aus, die sich durch den Monolithen fraß und alle 23 Kassen gleichzeitig abschaltete.\n\n" +
            "Als man Luigi den Stacktrace zeigte, sagte er nichts. Er schaute nur. Dann band er die Schürze ab und verließ den Raum. " +
            "Am nächsten Morgen lag auf dem Server im Keller ein Karton mit einer kalten Pizza. Niemand hat je gefragt, wer ihn dort abgelegt hat.\n\n" +
            "Seitdem heißt in der Küche jedes Problem „Ananas“ – und in pizza jede Exception. " +
            "Wer heute eine Hawaii backt, bekommt die ganze Nacht in einem Kasten: Der Pizzaiolo schaut nur, er verlässt den Raum, der Core Dump landet in `reste.kaltepizza`. " +
            "Exit-Code 39. Nach der Filiale."
        }
      ]
    },

    {
      id: "geschichte-bedingungen",
      gruppe: "Geschichte",
      ordnung: 30,
      titel: "Nonnas drei Bedingungen",
      tier: 1,
      inhalt: [
        {
          art: "text",
          md:
            "Enzo brauchte Geld für seine Sprache, und das Geld gehörte Nonna. Sie stellte drei Bedingungen, eine pro Sprichwort.\n\n" +
            "**Erstens:** „Wenn ich es lese, will ich merken, dass es um Pizza geht.“\n\n" +
            "**Zweitens** zählte sie auf einer ausgedruckten Seite Java 2.114 eckige und spitze Klammern und sagte: „Daran schneidet man sich.“ " +
            "Klammern in pizza sind deshalb rund, gern doppelt, wie ein Rand – und wer etwas serviert, serviert es mit Teller: `serviere ((x));`."
        },
        {
          art: "hinweis",
          ton: "pizza",
          md: "„Mein Teig geht 24 Stunden. Wer früher bäckt, dem schmeckt es flach.“\n\n– *Nonna Pina, dritte Bedingung*"
        },
        {
          art: "text",
          md:
            "Den Rest lieferte der Betrieb. Die Speisekarte wurde 11.000-mal pro Abend frisch aus der Datenbank geholt, worauf Nonna Kühlschrank und Mikrowelle verlangte: " +
            "„Was gestern gut war, ist heute noch gut. Nur ein bisschen matschig.“ " +
            "Die Fahrer fuhren seit jeher zuerst zu den Kunden mit gutem Trinkgeld, und wer nach 30 Minuten noch wartete, bekam die Pizza umsonst. Enzo musste beides nur noch aufschreiben.\n\n" +
            "Die beste Geschichte aber lieferte Brettschneider selbst. Sein Logging-Framework las per Reflection sämtliche Felder aller Objekte aus – auch das private Feld `teigRezept` – " +
            "und verschickte die Logdatei jeden Montag an 40 Empfänger. Enzo erfand die **Calzone**: Was zugeklappt ist, bleibt zu. Wer sie aufklappt, verliert die Garantie.\n\n" +
            "Warum dann eine Syntax wie Java? Weil Enzo Brettschneiders 14 Entwickler übernehmen musste; ihr Vertrag lief bis 2019. „Wir tauschen die Zutaten, nicht die Küche.“ " +
            "Und warum deutsch? Weil Luigi die Fehlermeldungen verstehen sollte."
        }
      ]
    },

    {
      id: "geschichte-versionen",
      gruppe: "Geschichte",
      ordnung: 40,
      titel: "Von pizzateig zu PiZZa",
      tier: 1,
      inhalt: [
        {
          art: "text",
          md:
            "**pizza 1.0** (2008) setzte Nonnas erste Bedingung wörtlich um: die *Pizzadichte-Regel*. Jedes achte Token musste das Wort „pizza“ enthalten; " +
            "Programme begannen mit `pizzateig` und endeten mit `pizzarand`. Ein überliefertes Fragment (läuft in v3.0 nicht mehr):"
        },
        {
          art: "code",
          sprache: "shell",
          ausfuehrbar: false,
          code:
            "pizzateig pizzaHallo pizzaklasse\n" +
            "    pizzaBote pizzasage \"Hallo, Pizzawelt!\" pizzapizza\n" +
            "pizzarand  // Pizzadichte: 7 von 8 Token. Compiler: zufrieden."
        },
        {
          art: "text",
          md:
            "2013 kaufte die Gastroplan AG die Kette, und mit ihr kam Brettschneider zurück. **pizza 2.0 Enterprise** bekam eine Spezifikation von 600 Seiten, ein Build-Tool mit `ofen.xml`, ein Komitee, " +
            "`pizza` als reserviertes Keyword in elf Kontexten und, aus Compliance-Gründen, eine Pizzadichte von 25 Prozent. " +
            "Die Entwickler erfüllten die Quote mit Bezeichnern wie `pizzaPizzaBestellPizzaPizza`.\n\n" +
            "Am Freitag, dem 13. Oktober 2023 – auf den Tag 17 Jahre nach dem ersten Ausfall – brauchte der pizza-2.0-Compiler für die neue Wochenkarte 47 Minuten. " +
            "Die Küchendrucker verstummten. Luigi, inzwischen 67, riss den Bon aus dem Drucker und schnitt ihn in acht Streifen.\n\n" +
            "**pizza 3.0** ist Enzos Rückbau. Die Pizzadichte-Regel ist abgeschafft, `pizza` ist kein Keyword mehr. " +
            "In der ersten Woche nannten die Entwickler aus Erleichterung alles `PiZZa`, `piZZA` und `PizZa`, und weil es niemandem schadete, blieb es erlaubt. " +
            "Nur eine Warnung erinnert daran, dass selbst Luigi zwei davon einmal verwechselt hat."
        }
      ]
    },

    {
      id: "geschichte-erstes-programm",
      gruppe: "Geschichte",
      ordnung: 50,
      titel: "Das erste pizza-Programm",
      tier: 1,
      inhalt: [
        {
          art: "text",
          md:
            "Der Pizzakarton von 2006 hängt gerahmt in der Zentrale. Zur Vorstellung von pizza 3.0 hat Enzo ihn in heutige Schreibweise übertragen – " +
            "412 Bons, in acht Stapel geschnitten, mit Luigis Ofenregel als Zeitbudget:"
        },
        {
          art: "code",
          ausfuehrbar: false,
          tier: 2,
          code:
            "// Das erste pizza-Programm – Enzo Esposito, 14. Oktober 2006, 03:12 Uhr\n" +
            "// (übertragen in die Schreibweise von pizza 3.0)\n" +
            "Blech<salami> bons = [1 .. 412];\n" +
            "\n" +
            "salami fertig = ofen(temperatur: 485, zeit: 90s) {\n" +
            "    salami summe = (0);\n" +
            "    für (Blech<salami> stapel : bons.schneide(8)) {\n" +
            "        summe += stapel.länge();\n" +
            "        zwischenstand((summe));\n" +
            "    }\n" +
            "    serviere ((summe));\n" +
            "} roh (r) {\n" +
            "    serviere ((r.teilergebnis()));   // geht raus, wie es ist\n" +
            "};\n" +
            "\n" +
            "Bote.sage((\"Pizzen raus: \" + fertig));"
        }
      ]
    },

    {
      id: "geschichte-zeitleiste",
      gruppe: "Geschichte",
      ordnung: 60,
      titel: "Zeitleiste und Herkunft",
      tier: 1,
      inhalt: [
        {
          art: "tabelle",
          kopf: ["Jahr", "Ereignis"],
          zeilen: [
            ["1971", "„Da Pina“ eröffnet in Wuppertal-Elberfeld"],
            ["2003", "PINA-ORDER 7 geht live (1,4 Mio. Zeilen Java, ein Server)"],
            ["2006", "Freitag, 13. Oktober: 412 Pizzen, ein Thread, ein Pizzaroller"],
            ["2007", "Die Ananas von Hannover (Filiale 39)"],
            ["2008", "pizza 1.0 mit Pizzadichte-Regel, `pizzateig` und `pizzarand`"],
            ["2013", "pizza 2.0 Enterprise: 600 Seiten Spezifikation, `ofen.xml`, Komitee"],
            ["2023", "Freitag, 13. Oktober: 47 Minuten Compilerlauf, wieder acht Streifen"],
            ["2026", "pizza 3.0: `pizza` ist frei, `PiZZa` auch"]
          ]
        },
        {
          art: "text",
          md: "Und weil jede Entscheidung irgendwo herkommt:"
        },
        {
          art: "tabelle",
          kopf: ["Was geschah", "Was daraus wurde"],
          zeilen: [
            ["Luigi schneidet den Bon in acht Streifen", "Parallelität mit `schneide(8)`; Warnung `S0007` bei sieben Stücken"],
            ["„Nichts bleibt länger als 90 Sekunden im Ofen“", "`ofen(…) { } roh (r) { }` mit Teilergebnis"],
            ["Typenschild an Luigis Ofen: max. 485 °C", "`VerbranntAnanas`: „Zu heiß! Selbst Neapel hat Grenzen.“"],
            ["Eine Margherita an Tisch 12 und Tisch 14", "Ownership: `schieb`, `teile`, `BesitzAnanas`"],
            ["„30 Minuten oder gratis“ (9.340 €)", "`warte(max: 30min)` und `oderGratis`"],
            ["Die Fahrer und das Trinkgeld", "`trinkgeld(n)` als Priorität"],
            ["Nonnas Teig geht 24 Stunden", "Lazy Evaluation mit `teig`, Warnung `T0007`"],
            ["Speisekarte 11.000-mal pro Abend geladen", "`@Kühlschrank` und `mikrowelle`"],
            ["`teigRezept` im Montags-Log", "`calzone`, `aufklappen()`, Garantie erloschen"],
            ["Filiale Bielefeld legt 2009 den Käse unter die Tomate", "`@Nach`, Fehler `B0012`: „Das ist keine Pizza, das ist ein Auflauf.“"],
            ["Die Ananas von Hannover", "Exceptions heißen Ananas; `hawaii` ist Kernel Panic, Exit-Code 39"],
            ["„Daran schneidet man sich“", "Runde Klammern, `serviere ((x));` mit Klammerpflicht"],
            ["14 übernommene Java-Entwickler", "Klassen, Pakete, `speisekarte tiefkühl leer hauptgang`"]
          ]
        }
      ]
    },

    {
      id: "geschichte-heute",
      gruppe: "Geschichte",
      ordnung: 70,
      titel: "Heute",
      tier: 1,
      inhalt: [
        {
          art: "text",
          md:
            "Bei der Vorstellung von pizza 3.0 legte Enzo Luigi das Programm vom Pizzakarton vor, in heutiger Schreibweise. Luigi las es zweimal. " +
            "Er sagte nichts. Er schaute nur. Dann nickte er und ging zurück an den Ofen. Für diesen Fall gibt es in der Spezifikation keine Warnung.\n\n" +
            "Nonna, 91, zählte die Ecken. „Sechs. Für Wuppertal geht das.“"
        }
      ]
    }
  );
})();
