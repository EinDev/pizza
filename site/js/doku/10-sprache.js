/* pizza v3.0 – Doku: Einstieg, Sprache, Ananas & Hawaii (ordnung 100–299, 400–499) – Doku v2 */
(function () {
  "use strict";
  const ziel = typeof self !== "undefined" ? self : globalThis;

  // Template-Tag: Backslashes bleiben roh (pizza-Escapes wie \n), erste/letzte Leerzeile weg.
  function code(s, ...v) {
    return String.raw(s, ...v).replace(/^\r?\n/, "").replace(/\r?\n[ \t]*$/, "").replace(/\r\n/g, "\n");
  }
  const bild = (datei, alt, unterschrift) => ({ art: "bild", src: "img/doku/" + datei, alt, unterschrift });

  (ziel.PIZZA_DOKU = ziel.PIZZA_DOKU || []).push(
    // ───────────────────────────── EINSTIEG ─────────────────────────────
    {
      id: "erste-pizza",
      gruppe: "Einstieg",
      ordnung: 100,
      titel: "Erste Pizza in 30 Sekunden",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Tippe ein paar Zeilen in den Editor und drücke **Strg+Enter** – schon läuft dein erstes Programm. `Bote.sage(...)` schreibt etwas in die Konsole." },
        { art: "code", code: code`
Bote.sage(("Hallo, Pizzawelt!"));
Pizza meine = ((Tomate, Mozzarella, Basilikum));
Bote.sage(meine);
Bote.sage(("Kostet: " + meine.preis().euro()));
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Hallo, Pizzawelt!\n((Tomate, Mozzarella, Basilikum))\nKostet: 8,00 €" },
        { art: "details", titel: "Was passiert da Zeile für Zeile?", inhalt: [
          { art: "text", md: "- Zeile 1 gibt einen Text aus.\n- Zeile 2 backt eine Pizza. Beläge stehen in doppelten runden Klammern, **von unten nach oben**.\n- Zeile 3 zeigt die Pizza.\n- Zeile 4 fragt nach dem Preis: Teig `5.00` plus jeder Belag (Tomate 1.00, Mozzarella 1.50, Basilikum 0.50)." },
          { art: "text", md: "Das Ganze läuft im **Snack-Modus**: Anweisungen dürfen direkt dastehen, ohne Klasse drumherum. Wie ein „richtiges“ Programm aussieht, zeigt der nächste Abschnitt." },
          { art: "hinweis", ton: "pizza", md: "Jeder Code-Block in dieser Doku hat einen Knopf **„Im Editor öffnen“**. Einfach ausprobieren – es brennt höchstens die Pizza an, nie dein Rechner." }
        ] }
      ]
    },
    {
      id: "programmaufbau",
      gruppe: "Einstieg",
      ordnung: 110,
      titel: "Programmaufbau mit hauptgang",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Ein großes Programm ist verpackt wie eine Lieferung: außen der Karton (`paket`), darin eine Klasse, darin der `hauptgang` – dort startet alles." },
        bild("sp-programm.svg", "Ein Pizzakarton mit der Aufschrift paket. Darin eine Box klasse Pizzeria, darin eine gelbe Box hauptgang mit Bote.sage.", "Von außen nach innen: paket → klasse → hauptgang. Für kurze Snacks reicht auch eine einzelne Zeile."),
        { art: "code", code: code`
paket de.luigi.pizzeria;
import pizza.ofen.*;

speisekarte klasse Pizzeria {
    speisekarte tiefkühl leer hauptgang(Blech<margherita> args) {
        Bote.sage(("Buonasera! Gäste am Tisch: " + args.länge()));
    }
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Buonasera! Gäste am Tisch: 0" },
        { art: "details", titel: "Genauer: paket, import und die Startreihenfolge", inhalt: [
          { art: "text", md: "- `paket` und `import` sind erlaubt, werden aber ignoriert – die Standardbibliothek ist immer da.\n- Gestartet wird der `hauptgang` der **ersten Klasse**, die einen hat. `args` ist ein Blech mit Texten (hier leer). Füllen kannst du es im Playground über das Feld **„Argumente“**, in der Kommandozeile und beim heruntergeladenen Programm hinter dem Programmnamen.\n- Es zählt nur der Name: `hauptgang()` ohne Parameter geht auch, ebenso ohne `tiefkühl` (dann wird vorher ein Objekt der Klasse gebacken). Mehr als ein Parameter ist ein Fehler, ein Rückgabewert wird ignoriert.\n- Hat keine Klasse einen `hauptgang`, darf es auch eine lose Funktion `hauptgang` sein." },
          { art: "text", md: "Snack-Modus und Hauptgang vertragen sich: Erst werden alle Klassen registriert (sie dürfen also auch *nach* ihrer Verwendung stehen), dann laufen die losen Anweisungen der Reihe nach, und **danach** wird `hauptgang` serviert." },
          { art: "code", code: code`
Bote.sage(("1. Antipasto"));

klasse Menü {
    tiefkühl leer hauptgang(Blech<margherita> args) {
        Bote.sage(("3. Hauptgang"));
    }
}

Bote.sage(("2. " + Küche.vorspeise()));

klasse Küche {
    tiefkühl margherita vorspeise() {
        serviere (("Bruschetta"));
    }
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "1. Antipasto\n2. Bruschetta\n3. Hauptgang" }
        ] }
      ]
    },
    {
      id: "philosophie",
      gruppe: "Einstieg",
      ordnung: 120,
      titel: "Philosophie in 3 Sätzen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "pizza ist eine Spaß-Sprache: Alles heißt wie in einer Pizzeria, runde Klammern sind Pflicht, und Ananas bedeutet Ärger." },
        { art: "text", md: "1. **Klammern sind rund wie Pizza** – doppelte Klammern wie `Bote.sage((\"…\"))` sind guter Stil.\n2. **Alles ist Pizzeria**: Ganzzahlen heißen `salami`, Fehler heißen *Ananas*, „nichts“ ist ein leerer `karton`.\n3. **Wer Ananas auf die Pizza legt, trägt die Konsequenzen** – siehe *Hawaii*, wenn du dich traust." },
        { art: "code", code: code`
// Doppelt rund ist doppelt lecker – und bedeutet trotzdem nichts.
Bote.sage(("Rund ist gesund."));
Bote.sage((((6 * 7))));
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Rund ist gesund.\n42" }
      ]
    },

    // ───────────────────────────── SPRACHE ─────────────────────────────
    {
      id: "lexik",
      gruppe: "Sprache",
      ordnung: 200,
      titel: "Schreibregeln & Kommentare",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Jede Anweisung endet mit `;`. Zusammengehörendes steht in `{ }`. Alles hinter `//` ist ein Kommentar – eine Notiz für Menschen, die der Computer überspringt." },
        { art: "code", code: code`
// Kommentar: wird ignoriert
/* Kommentar über
   mehrere Zeilen */
salami gäste = 1_000_000;
funghi preis = 7.50;
Dauer backzeit = 90s;
Bote.sage(gäste);
Bote.sage(preis);
Bote.sage(backzeit);
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "1000000\n7.5\n1min 30s" },
        { art: "details", titel: "Zahlen, Zeiten und Texte im Detail", inhalt: [
          { art: "text", md: "- Zahlen: `42`, `7.50`, `1_000_000` (Unterstriche sind nur Deko). Kein Exponent (`1e3`) und keine halben Zahlen wie `.5` oder `5.` – schreib `0.5` bzw. `5.0`.\n- Zeitdauern: Zahl **direkt** gefolgt von `ms`, `s`, `min`, `h` oder `d`, z. B. `90s`, `1.5s`\n- Texte stehen in `\"...\"` und passen in eine Zeile. Sonderzeichen: `\\n` (neue Zeile), `\\t` (Tab), `\\r` (Wagenrücklauf), `\\\"` und `\\'` (Anführungszeichen), `\\\\` (Backslash) – andere Kombinationen mit `\\` sind ein Syntaxfehler\n- Namen dürfen Umlaute und `ß` enthalten: `größe`, `Käse`\n- Wahrheitswerte `ja` / `nein`, der leere Karton `karton`" },
          { art: "code", code: code`
margherita gruß = "Er sagte: \"Buon appetito!\"\nUnd ging.";
Bote.sage(gruß);
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "Er sagte: \"Buon appetito!\"\nUnd ging." }
        ] },
        { art: "details", titel: "Reservierte Wörter (Keywords)", inhalt: [
          { art: "text", md: "Diese Wörter gehören der Sprache – du kannst sie nicht als Namen benutzen:" },
          { art: "tabelle", kopf: ["Bereich", "Keywords"], zeilen: [
            ["Struktur", "`paket` `import` `klasse` `rezeptur` `rohling` `calzone` `belag` `auf` `quattrostagioni` `erbt` `erfüllt`"],
            ["Modifikatoren", "`speisekarte` `familienrezept` `geheimrezept` `tiefkühl` `gebacken`"],
            ["Werte & Objekte", "`leer` `neu` `dies` `unten` `ja` `nein` `karton`"],
            ["Kontrollfluss", "`serviere` `falls` `sonst` `für` `solange` `wähle` `fall` `standard` `abbrechen` `weiter`"],
            ["Ananas & Ofen", "`probier` `verbrannt` `rand` `wirf` `wirft` `ofen` `roh`"]
          ] },
          { art: "hinweis", ton: "info", md: "`pizza` ist seit v3.0 **kein** Keyword mehr – du darfst deine Variable also endlich `pizza` nennen." }
        ] }
      ]
    },
    {
      id: "gross-klein",
      gruppe: "Sprache",
      ordnung: 205,
      titel: "Groß- und Kleinschreibung",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "`pizza` und `Pizza` sind zwei verschiedene Namen – Groß und Klein zählt. Und: Ein großgeschriebenes Wort wie `Salami` ist ein **Belag**." },
        { art: "code", code: code`
margherita pizza = "kleingeschrieben, ganz legal";
Pizza belegt = ((Tomate)) + Salami;
Bote.sage(pizza);
Bote.sage(belegt);
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "kleingeschrieben, ganz legal\n((Tomate, Salami))" },
        { art: "details", titel: "Fast gleiche Namen und die Warnung W0032", inhalt: [
          { art: "text", md: "`pizza`, `Pizza`, `PiZZa` und `piZZA` sind vier gültige, verschiedene Namen. Erlaubt – aber verwirrend. Stehen zwei solche Namen im selben Block, warnt der Pizzaiolo einmal pro Paar mit **W0032**:" },
          { art: "code", code: code`
salami PiZZa = 1;
salami piZZA = 2;
Bote.sage(PiZZa + piZZA);
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "3" },
          { art: "hinweis", ton: "warnung", md: "`W0032: 'PiZZa' und 'piZZA' sind im selben Scope definiert. Selbst der Pizzaiolo verwechselt die beiden.` – Warnungen ändern den Exit-Code nicht." },
          { art: "text", md: "Ein großgeschriebenes Wort, das weder Variable noch Klasse ist, wird als Belag gelesen. Tippfehler wie `Salamy` enden deshalb in einer `UnbekannterBelagAnanas`." }
        ] }
      ]
    },
    {
      id: "typen",
      gruppe: "Sprache",
      ordnung: 210,
      titel: "Typen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Ein **Typ** sagt, welche Sorte Wert in eine Variable passt – wie Gläser im Zutatenregal: ins `salami`-Glas kommen nur Ganzzahlen, ins `margherita`-Glas nur Texte." },
        bild("sp-typen.svg", "Ein Regal mit acht Gläsern: salami enthält 8, funghi 7.5, margherita \"Hallo\", diavolo ja/nein, Dauer 90s, Pizza eine Pizza, Blech [1, 2, 3], Speisekarte {Tisch: 4}.", "Jeder Typ ist ein eigenes Glas im Regal."),
        { art: "code", code: code`
salami stücke = 8;
funghi preis = 9.5;
margherita name = "Diavolo";
diavolo scharf = ja;
Dauer backzeit = 2min;
Pizza p = ((Tomate, Käse, Chili));
Blech<margherita> sorten = ["Margherita", "Funghi"];
Bote.sage(stücke + " Stücke " + name + ", scharf: " + scharf);
Bote.sage(backzeit + 30s);
Bote.sage(p);
Bote.sage(sorten);
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "8 Stücke Diavolo, scharf: ja\n2min 30s\n((Tomate, Käse, Chili))\n[Margherita, Funghi]" },
        { art: "details", titel: "Alle Typen auf einen Blick", inhalt: [
          { art: "tabelle", kopf: ["pizza", "Bedeutung", "Beispiel"], zeilen: [
            ["`salami`", "Ganzzahl", "`8`"],
            ["`funghi`", "Kommazahl", "`7.5`"],
            ["`margherita`", "Text", "`\"Hallo\"`"],
            ["`diavolo`", "Wahrheitswert", "`ja`, `nein`"],
            ["`Dauer`", "Zeitdauer", "`90s`, `30min`"],
            ["`Pizza`", "Pizza", "`((Tomate, Käse))`"],
            ["`Blech<T>`", "Liste", "`[1, 2, 3]`, `[1 .. 8]`"],
            ["`Speisekarte<K, V>`", "Map (Schlüssel → Wert)", "`neu Speisekarte<margherita, funghi>()`"],
            ["`hawaii`", "kompiliert.", "– (siehe *Hawaii*)"]
          ] },
          { art: "code", code: code`
Speisekarte<margherita, funghi> karte = neu Speisekarte<margherita, funghi>();
karte.lege("Margherita", 8);
karte.lege("Diavolo", 9.5);
Pizza nichts = karton;
Bote.sage(karte);
Bote.sage(nichts);
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "{Margherita: 8, Diavolo: 9.5}\nkarton" }
        ] },
        { art: "details", titel: "Falscher Wert im Glas: TypAnanas", inhalt: [
          { art: "text", md: "Typen werden geprüft, wenn du eine Variable anlegst, zuweist oder einer Methode etwas übergibst. Passt der Wert nicht, gibt es eine `TypAnanas`. `karton` passt in alle Typen außer `salami`, `funghi` und `diavolo` – ein `margherita` darf also leer sein (wichtig beim Lesen von Eingaben)." },
          { art: "code", code: code`
probier {
    salami stücke = 3.5;
} verbrannt (TypAnanas a) {
    Bote.sage(("TypAnanas! Halbe Stücke gibt es nicht."));
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "TypAnanas! Halbe Stücke gibt es nicht." },
          { art: "hinweis", ton: "info", md: "Die Angabe in spitzen Klammern (`Blech<salami>`) wird gelesen, aber **nicht geprüft** (Tier 3). Ein `Blech<salami>` nimmt dir also auch einen Text nicht übel – der Pizzaiolo schon." }
        ] }
      ]
    },
    {
      id: "variablen",
      gruppe: "Sprache",
      ordnung: 220,
      titel: "Variablen & der leere Karton",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Eine **Variable** ist ein beschrifteter Karton: Typ und Name drauf, Wert rein. Den Inhalt kannst du jederzeit austauschen. `karton` heißt: Der Karton ist leer." },
        bild("sp-variable.svg", "Drei Kartons: gäste mit 4, nach gäste = gäste * 2 derselbe Karton mit 8, und ein leerer Karton bestellung = karton.", "Name bleibt, Inhalt wechselt. Ein leerer Karton heißt karton."),
        { art: "code", code: code`
salami gäste = 4;
gäste = gäste * 2;
Bote.sage(gäste);
gäste += 1;
Bote.sage(gäste);

Pizza bestellung = karton;
Bote.sage(bestellung);
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "8\n9\nkarton" },
        { art: "details", titel: "Kurzschreibweisen und wo eine Variable lebt", inhalt: [
          { art: "text", md: "- `x += 2` heißt `x = x + 2` (genauso `-=`, `*=`, `/=`)\n- `x++;` zählt um 1 hoch, `x--;` um 1 runter\n- Eine Variable gilt nur in ihrem Block `{ }` – wie Belag auf seiner Pizza." },
          { art: "code", code: code`
salami gäste = 4;
gäste = gäste * 2;
gäste -= 1;
gäste++;
Bote.sage(gäste);

falls (gäste > 5) {
    margherita tisch = "der große am Fenster";
    Bote.sage(("Tisch: " + tisch));
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "8\nTisch: der große am Fenster" }
        ] },
        { art: "details", titel: "Vorsicht: in einen leeren Karton greifen", inhalt: [
          { art: "text", md: "Einen leeren Karton darfst du anschauen und ausgeben. Wer aber hineingreift – also eine Methode aufruft oder ein Feld liest –, bekommt eine `LeererKartonAnanas`." },
          { art: "code", code: code`
Pizza bestellung = karton;
probier {
    Bote.sage((bestellung.preis()));
} verbrannt (LeererKartonAnanas a) {
    Bote.sage((a.nachricht()));
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "Der Karton ist leer." },
          { art: "hinweis", ton: "pizza", md: "Pizzen haben genau **einen Besitzer**: `Pizza q = p;` wirft eine `BesitzAnanas`. Wie man Pizzen weitergibt (`schieb`, `teile`), steht bei den Pizza-Funktionen." }
        ] }
      ]
    },
    {
      id: "operatoren",
      gruppe: "Sprache",
      ordnung: 230,
      titel: "Rechnen, Vergleichen & Klammerpflicht",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Gerechnet wird wie in der Schule: Punkt vor Strich. Aufpassen: `+` mit einem Text klebt zusammen statt zu rechnen – setze im Zweifel Klammern." },
        { art: "code", code: code`
Bote.sage((7 / 2));
Bote.sage((2 + 3 * 4));
Bote.sage(("Tisch " + 4 + 2));
Bote.sage(("Tisch " + (4 + 2)));
salami hunger = 6;
Bote.sage((hunger > 5 ? "satt" : "hungrig"));
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "3.5\n14\nTisch 42\nTisch 6\nsatt" },
        { art: "details", titel: "Alle Operatoren und ihre Reihenfolge", inhalt: [
          { art: "tabelle", kopf: ["Operator", "Bedeutung"], zeilen: [
            ["`+ - * /`", "rechnen; `/` teilt exakt (`7 / 2` ist `3.5`), durch `0` → `RechenAnanas`"],
            ["`%`", "Rest beim Teilen (`7 % 2` ist `1`); Vorzeichen wie die linke Zahl (`-7 % 2` ist `-1`), `% 0` → `RechenAnanas`"],
            ["`== !=`", "gleich / ungleich – nach Wert für Zahlen (`1 == 1.0`), Texte, Wahrheitswerte, Dauern, Beläge und Pizzen (gleiche Beläge in gleicher Reihenfolge); Bleche, Speisekarten und Objekte nur, wenn es **dasselbe** Ding ist"],
            ["`< <= > >=`", "kleiner / größer – für Zahlen, Texte (alphabetisch), Dauern und Werte desselben `quattrostagioni` (nach Position); sonst `TypAnanas`"],
            ["`+` mit Text", "klebt zusammen, sobald eine Seite ein Text ist – auch `((Tomate)) + \"!\"`"],
            ["`&& || !`", "und / oder / nicht"],
            ["`a ? b : c`", "wenn `a`, dann `b`, sonst `c`"]
          ] },
          { art: "text", md: "Reihenfolge von schwach nach stark bindend: `?:` · `||` · `&&` · `== !=` · `< <= > >=` · `+ -` · `* / %` · `! -` (vorangestellt) · Methodenaufruf mit `.`. Deshalb ist `-2.5.runden()` dasselbe wie `-(2.5.runden())` – für Methoden auf negativen Zahlen Klammern setzen: `(-2.5).runden()`." },
          { art: "code", code: code`
Bote.sage((7 % 2));
salami hunger = 3;
hunger += 3;
Bote.sage((hunger > 5 && !nein));
Bote.sage((((Tomate, Käse)) == ((Tomate, Käse))));
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "1\nja\nja" }
        ] },
        { art: "details", titel: "Klammerpflicht und Fehler K0001", inhalt: [
          { art: "text", md: "Runde Klammern sind in pizza Pflicht:\n\n- `falls`, `solange`, `für` und `wähle` brauchen `( )` um die Bedingung **und** `{ }` um den Block.\n- `serviere` (Rückgabe) braucht Klammern: `serviere (x);`. Ein nacktes `serviere;` (ohne Wert) beendet die Methode und liefert `karton` – gedacht für `leer`-Methoden.\n\nWer `serviere x;` schreibt, bekommt **K0001** – Exit-Code 2, das Programm startet gar nicht erst:" },
          { art: "code", code: code`
klasse Kasse {
    tiefkühl salami summe(salami a, salami b) {
        serviere a + b;
    }
}
Bote.sage((Kasse.summe(1, 2)));
`, ausfuehrbar: true, exitCode: 2, tier: 1 },
          { art: "hinweis", ton: "warnung", md: "`PizzaFehler K0001: Klammerpflicht! serviere braucht Klammern: serviere (x);` – Richtig wäre `serviere ((a + b));`." }
        ] }
      ]
    },
    {
      id: "kontrollfluss",
      gruppe: "Sprache",
      ordnung: 240,
      titel: "Entscheiden & Wiederholen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "`falls` ist eine Weggabelung: Je nach Antwort geht es links oder rechts (`sonst`) weiter. `solange` läuft im Kreis, bis die Antwort *nein* ist." },
        bild("sp-kontrollfluss.svg", "Links: Raute mit der Frage grad > 400, bei ja geht es zum falls-Block, bei nein zum sonst-Block, danach läuft das Programm weiter. Rechts: ein Kreis, der die Frage minuten > 0 stellt und bei ja backen, minuten-- ausführt; bei nein geht es raus.", "falls/sonst = Weggabelung, solange = Runde im Kreis."),
        { art: "code", code: code`
salami grad = 420;
falls (grad > 400) {
    Bote.sage(("Perfekt!"));
} sonst {
    Bote.sage(("Weiterbacken."));
}
salami minuten = 3;
solange (minuten > 0) {
    Bote.sage(("Noch " + minuten + " Minuten"));
    minuten--;
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Perfekt!\nNoch 3 Minuten\nNoch 2 Minuten\nNoch 1 Minuten" },
        { art: "details", titel: "Mehr Wege: sonst falls", inhalt: [
          { art: "text", md: "Mit `sonst falls` hängst du weitere Fragen an. Die erste, die *ja* ergibt, gewinnt." },
          { art: "code", code: code`
salami grad = 420;
falls (grad > 485) {
    Bote.sage(("Verbrannt!"));
} sonst falls (grad >= 400) {
    Bote.sage(("Perfekt neapolitanisch."));
} sonst {
    Bote.sage(("Eher Auflauf."));
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "Perfekt neapolitanisch." }
        ] },
        { art: "details", titel: "für-Schleifen, abbrechen & weiter", inhalt: [
          { art: "text", md: "`für` gibt es in zwei Sorten:\n\n- **für jedes**: `für (salami i : [1 .. 10])` – geht ein Blech, die Zeichen eines Texts oder die Schlüssel einer Speisekarte durch. `[a .. b]` zählt in Einerschritten von `a` bis einschließlich `b` – ist `a` größer als `b`, rückwärts: `[3 .. 1]` ist `[3, 2, 1]`.\n- **klassisch**: `für (start; bedingung; schritt)`.\n\n`abbrechen;` verlässt die Schleife, `weiter;` springt zur nächsten Runde." },
          { art: "code", code: code`
für (salami i : [1 .. 10]) {
    falls (i % 2 == 0) { weiter; }
    falls (i > 7) { abbrechen; }
    Bote.sage(i);
}

für (salami stück = 1; stück <= 2; stück++) {
    Bote.sage(("Stück " + stück));
}

margherita buchstaben = "";
für (margherita z : "Ofen") {
    buchstaben += z + "-";
}
Bote.sage(buchstaben);

Speisekarte<margherita, salami> lager = neu Speisekarte<margherita, salami>();
lager.lege("Mehl", 25);
lager.lege("Hefe", 2);
für (margherita zutat : lager) {
    Bote.sage((zutat + ": " + lager.hole(zutat)));
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "1\n3\n5\n7\nStück 1\nStück 2\nO-f-e-n-\nMehl: 25\nHefe: 2" }
        ] },
        { art: "details", titel: "abbrechen & weiter nur in Schleifen (P0012)", inhalt: [
          { art: "text", md: "`abbrechen` und `weiter` gehören in den Rumpf einer `solange`- oder `für`-Schleife. `abbrechen` darf außerdem in einem Arm einer `wähle`-**Anweisung** stehen – dort verlässt es nur das `wähle`. Überall sonst gibt es schon vor dem Start den PizzaFehler **P0012** (Exit-Code 2)." },
          { art: "text", md: "Wichtig: Eine Methode, ein Konstruktor, ein Lambda, ein `ofen`-Block und ein Block-Arm eines `wähle`-**Ausdrucks** beginnen jeweils von vorn. Eine Schleife *drumherum* zählt dort nicht – ein `abbrechen` im Lambda kann die äußere Schleife nicht beenden. Im `wähle`-Ausdruck lieferst du den Wert stattdessen mit `serviere (x);`." },
          { art: "code", code: code`
klasse Kasse {
    tiefkühl leer prüfe(salami betrag) {
        falls (betrag < 0) {
            abbrechen;   // keine Schleife weit und breit
        }
    }
}
`, ausfuehrbar: true, exitCode: 2, tier: 1 },
          { art: "hinweis", ton: "warnung", md: "`PizzaFehler P0012: 'abbrechen' steht außerhalb einer Schleife.` – Richtig wäre hier `serviere;`, das beendet die Methode." }
        ] },
        { art: "details", titel: "wähle: viele Fälle auf einmal", inhalt: [
          { art: "text", md: "`wähle` vergleicht einen Wert mit mehreren Möglichkeiten. Nach `->` steht eine Anweisung oder ein Block. Mehrere Werte pro `fall` trennst du mit Komma, `standard` fängt den Rest. Anders als `switch` in Java fällt nichts durch – kein `break` nötig. `wähle` geht auch als **Ausdruck**, der einen Wert liefert: `margherita s = wähle (x) { fall 1 -> \"eins\"; standard -> \"?\"; };` – in Block-Armen mit `serviere (wert);`." },
          { art: "code", code: code`
für (margherita bestellung : ["Marinara", "Funghi", "Hawaii?"]) {
    wähle (bestellung) {
        fall "Margherita", "Marinara" -> Bote.sage(("Klassiker!"));
        fall "Funghi" -> {
            Bote.sage(("Mit Pilzen."));
            Bote.sage(("Kein break nötig."));
        }
        standard -> Bote.sage(("Haben wir nicht. Nie gehabt."));
    }
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "Klassiker!\nMit Pilzen.\nKein break nötig.\nHaben wir nicht. Nie gehabt." }
        ] }
      ]
    },
    {
      id: "methoden-lambdas",
      gruppe: "Sprache",
      ordnung: 250,
      titel: "Methoden & Lambdas",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Eine **Methode** ist ein Arbeitsschritt mit Namen: Zutaten (Parameter) rein, Ergebnis mit `serviere` raus. Einmal geschrieben, beliebig oft benutzt." },
        bild("sp-methode.svg", "Zwei Zettel preis: 8 und prozent: 10 gehen in einen Ofen namens mitTrinkgeld. Heraus kommt über serviere ein Teller mit 8.8.", "Parameter rein, serviere raus."),
        { art: "code", code: code`
klasse Küche {
    tiefkühl funghi mitTrinkgeld(funghi preis, salami prozent) {
        serviere ((preis + preis * prozent / 100));
    }
}

Bote.sage((Küche.mitTrinkgeld(8, 10)));
Bote.sage((Küche.mitTrinkgeld(prozent: 25, preis: 8)));
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "8.8\n10" },
        { art: "details", titel: "So liest du eine Methode", inhalt: [
          { art: "text", md: "`tiefkühl funghi mitTrinkgeld(funghi preis, salami prozent)`\n\n- `tiefkühl` – gehört zur Klasse selbst; Aufruf über den Klassennamen: `Küche.mitTrinkgeld(...)`\n- `funghi` – was zurückkommt (eine Kommazahl). `leer` heißt: es kommt nichts zurück.\n- `(funghi preis, salami prozent)` – die Parameter\n\n**Benannte Argumente** (`prozent: 25`) ordnen nach Parametername zu – die Reihenfolge ist dann egal.\n\nDer Rückgabetyp ist ein Versprechen an den Leser, keine Kontrolle: Ein nacktes `serviere;` beendet jede Methode und liefert `karton`; eine Methode, die ohne `serviere` endet, liefert ebenfalls `karton`. Typisch ist `serviere;` in einer `leer`-Methode, um vorzeitig aufzuhören:" },
          { art: "code", code: code`
klasse Küche {
    tiefkühl leer ansage(margherita text) {
        falls (text == "") { serviere; }
        Bote.sage(("Achtung: " + text));
    }
}

Küche.ansage("");
Küche.ansage("Ofen ist heiß!");
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "Achtung: Ofen ist heiß!" }
        ] },
        { art: "details", titel: "Lambdas: Mini-Methoden ohne Namen", inhalt: [
          { art: "text", md: "Ein **Lambda** ist eine kleine Funktion zum Mitgeben: `x -> x * 10` heißt „nimm x, gib x mal 10 zurück“. Formen: `x -> ausdruck`, `(a, b) -> ausdruck` oder mit Block `x -> { serviere ((...)); }`. Lambdas merken sich Variablen aus ihrer Umgebung (Closures). `Klasse.methode` ohne `()` ist eine **Methodenreferenz** – die Methode selbst als Wert. Funktionswerte rufst du mit `f(x)` auf oder ausdrücklich mit `f.rufe(x)`. Fehlende Argumente werden bei Lambdas zu `karton`, überzählige ignoriert." },
          { art: "code", code: code`
klasse Küche {
    tiefkühl salami verdopple(salami x) {
        serviere ((x * 2));
    }
}

Blech<salami> zahlen = [1, 2, 3, 4];
Bote.sage((zahlen.belege(x -> x * 10)));
Bote.sage((zahlen.filtere(x -> x % 2 == 0)));
Bote.sage((zahlen.zusammenklappen((a, b) -> a + b)));
Bote.sage((zahlen.belege(Küche.verdopple)));

// Closure: das Lambda merkt sich 'faktor' aus dem umgebenden Scope.
salami faktor = 3;
Bote.sage((zahlen.belege(x -> x * faktor)));

// Lambda mit Block-Rumpf und serviere
Bote.sage((zahlen.belege(x -> {
    salami belegt = x + 100;
    serviere ((belegt));
})));
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "[10, 20, 30, 40]\n[2, 4]\n10\n[2, 4, 6, 8]\n[3, 6, 9, 12]\n[101, 102, 103, 104]" }
        ] }
      ]
    },
    {
      id: "klassen-modifikatoren",
      gruppe: "Sprache",
      ordnung: 260,
      titel: "Klassen & Objekte",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Eine **Klasse** ist ein Rezept. Mit `neu` backst du daraus echte **Objekte** – so viele du willst, jedes mit eigenen Werten." },
        bild("sp-klasse-objekt.svg", "Links eine Rezeptkarte = klasse mit name, Konstruktor und alsText(). Ein Pfeil neu führt zu drei gebackenen Pizzen namens luigi, mario und anna.", "Ein Rezept, viele Pizzen."),
        { art: "code", code: code`
klasse Pizzeria {
    margherita name = "";
    Pizzeria(margherita name) { dies.name = name; }
    margherita alsText() {
        serviere (("Pizzeria " + name));
    }
}

Pizzeria luigi = neu Pizzeria("Da Luigi");
Pizzeria mario = neu Pizzeria("Mamma Mia");
Bote.sage(luigi);
Bote.sage(mario);
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Pizzeria Da Luigi\nPizzeria Mamma Mia" },
        { art: "details", titel: "Die Bausteine einer Klasse", inhalt: [
          { art: "text", md: "- **Feld** (`margherita name`): eine Variable, die jedes Objekt für sich hat.\n- **Konstruktor** (`Pizzeria(...)`, heißt wie die Klasse): läuft beim `neu` und richtet das Objekt ein.\n- **Methode** (`alsText()`): was das Objekt kann. `alsText()` wird automatisch für die Ausgabe benutzt – ohne heißt dein Objekt schlicht `Pizzeria@1`.\n- `dies` meint das Objekt selbst. `dies.name` ist das Feld, `name` allein wäre hier der Parameter." },
          { art: "hinweis", ton: "info", md: "Namen in Methoden werden so gesucht: lokal → Feld des Objekts → `tiefkühl`-Feld (eigene Klasse, dann Basis). Deshalb reicht in `alsText()` einfach `name`." }
        ] },
        { art: "details", titel: "Modifikatoren: tiefkühl, gebacken, rohling …", inhalt: [
          { art: "tabelle", kopf: ["pizza", "Java", "Bedeutung"], zeilen: [
            ["`tiefkühl`", "static", "gehört der Klasse, nicht dem einzelnen Objekt"],
            ["`gebacken`", "final", "Feld: nur beim Anlegen/im Konstruktor setzbar (`GebackenAnanas`); Klasse: nicht erweiterbar (`P0011`)"],
            ["`rohling`", "abstract", "Klasse kann nicht mit `neu` gebacken werden (`RohlingAnanas`), Methoden ohne Rumpf"],
            ["`calzone`", "–", "echte Kapselung, siehe Pizza-Funktionen"],
            ["`speisekarte` / `familienrezept` / `geheimrezept`", "public / protected / private", "wer darf zugreifen – siehe *Sichtbarkeit*"]
          ] },
          { art: "text", md: "Modifikatoren dürfen in beliebiger Reihenfolge stehen – `tiefkühl speisekarte` schmeckt genauso wie `speisekarte tiefkühl`." },
          { art: "code", code: code`
klasse Pizzeria {
    geheimrezept margherita name = "";
    gebacken salami öfen = 2;
    tiefkühl salami anzahl = 0;

    speisekarte Pizzeria(margherita name) {
        dies.name = name;
        Pizzeria.anzahl += 1;
    }
    speisekarte margherita alsText() {
        serviere (("Pizzeria " + name + " (" + öfen + " Öfen)"));
    }
}

Pizzeria luigi = neu Pizzeria("Da Luigi");
Pizzeria mario = neu Pizzeria("Mamma Mia");
Bote.sage(luigi);
Bote.sage(("Filialen: " + Pizzeria.anzahl));

probier {
    luigi.öfen = 3;
} verbrannt (GebackenAnanas a) {
    Bote.sage(("Gebacken ist gebacken."));
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "Pizzeria Da Luigi (2 Öfen)\nFilialen: 2\nGebacken ist gebacken." }
        ] }
      ]
    },
    {
      id: "sichtbarkeit",
      gruppe: "Sprache",
      ordnung: 262,
      titel: "Sichtbarkeit: wer darf was sehen?",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Drei Wörter legen fest, wer an ein Feld oder eine Methode darf: `speisekarte` – alle; `familienrezept` – die Klasse und ihre Kinder; `geheimrezept` – nur die Klasse selbst." },
        bild("sp-sichtbarkeit.svg", "Ein Gastraum (speisekarte) mit Gästen, darin die Küche (familienrezept) mit Köchen, darin ein dunkler Tresor (geheimrezept), in den nur die Klasse selbst darf.", "Je weiter innen, desto weniger Leute dürfen rein."),
        { art: "code", code: code`
klasse Pizzeria {
    speisekarte margherita name = "Da Luigi";
    geheimrezept margherita soße = "Omas Tomaten";
}

Pizzeria luigi = neu Pizzeria();
Bote.sage((luigi.name));
probier {
    Bote.sage((luigi.soße));
} verbrannt (ZugriffsAnanas a) {
    Bote.sage(("Geheimrezept bleibt geheim."));
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Da Luigi\nGeheimrezept bleibt geheim." },
        { art: "details", titel: "Tabelle und Vergleich mit Java", inhalt: [
          { art: "tabelle", kopf: ["pizza", "Java", "Wer darf zugreifen?"], zeilen: [
            ["`speisekarte`", "public", "alle – steht auf der Karte"],
            ["`familienrezept`", "protected", "eigene Klasse + Klassen, die davon `erbt`"],
            ["`geheimrezept`", "private", "nur die eigene Klasse, sonst `ZugriffsAnanas`"],
            ["*(nichts)*", "package-private", "„Hausrezept“ – verhält sich wie `speisekarte`"]
          ] },
          { art: "hinweis", ton: "pizza", md: "Selbst ein `geheimrezept` lässt sich per Reflection (`Spiegel.felder`) auslesen – außer die Klasse ist eine zugeklappte `calzone`. Mehr dazu bei den Pizza-Funktionen." }
        ] }
      ]
    },
    {
      id: "vererbung",
      gruppe: "Sprache",
      ordnung: 265,
      titel: "Vererbung, rohling & unten",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Mit `erbt` bekommt eine Klasse alles von einer anderen und legt Eigenes obendrauf. Mit `unten` erreichst du die Eltern-Klasse – die Basis liegt bei Pizza eben unten." },
        bild("sp-vererbung.svg", "Stammbaum: Oben Pizza mit Teig und backen(). Darunter Margherita und Diavolo, die beide von Pizza erben und Basilikum bzw. Chili dazulegen.", "Kinder erben alles von oben und legen Eigenes drauf."),
        { art: "code", code: code`
klasse Gericht {
    margherita beschreibe() {
        serviere (("Teig, gebacken"));
    }
}
klasse Diavolo erbt Gericht {
    margherita beschreibe() {
        serviere ((unten.beschreibe() + " + Chili"));
    }
}
Gericht g = neu Diavolo();
Bote.sage((g.beschreibe()));
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Teig, gebacken + Chili" },
        { art: "details", titel: "Konstruktoren, rohling und @PizzaÜberschreibt", inhalt: [
          { art: "text", md: "- Im Konstruktor ruft `unten(args);` den Konstruktor der Eltern-Klasse auf. Fehlt `unten(…)`, wird der Eltern-Konstruktor **ohne Argumente** aufgerufen. Braucht er Argumente, ist das eine `LaufzeitAnanas` („Konstruktor von 'Ofen' erwartet 1 Argument, bekam 0.“) – also `unten(…)` nicht vergessen. Hat die Kind-Klasse gar keinen eigenen Konstruktor, reicht sie ihre Argumente einfach nach oben durch.\n- `unten.methode()` ruft die Version der Eltern-Klasse.\n- Eine `rohling`-Klasse ist ungebackener Teig: Man kann von ihr erben, aber nicht mit `neu` eine machen. `rohling`-Methoden haben keinen Rumpf – die Kinder müssen sie liefern.\n- `@PizzaÜberschreibt` prüft, dass es die Methode oben wirklich gibt." },
          { art: "code", code: code`
rohling klasse Ofen {
    familienrezept salami grad = 0;

    speisekarte Ofen(salami grad) {
        dies.grad = grad;
    }
    rohling speisekarte margherita art();

    speisekarte margherita beschreibe() {
        serviere ((art() + " mit " + grad + " Grad"));
    }
}

klasse Holzofen erbt Ofen {
    speisekarte Holzofen() {
        unten(485);
    }
    @PizzaÜberschreibt
    speisekarte margherita art() {
        serviere (("Holzofen"));
    }
    @PizzaÜberschreibt
    speisekarte margherita beschreibe() {
        serviere (("Echter " + unten.beschreibe()));
    }
}

Ofen meinOfen = neu Holzofen();
Bote.sage((meinOfen.beschreibe()));

probier {
    Ofen roher = neu Ofen(250);
} verbrannt (RohlingAnanas a) {
    Bote.sage((a.nachricht()));
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "Echter Holzofen mit 485 Grad\nEin Rohling ist nicht essbar." }
        ] },
        { art: "details", titel: "gebacken: Von dieser Klasse erbt niemand (P0011)", inhalt: [
          { art: "text", md: "Eine `gebacken` Klasse ist fertig. Wer davon erben will, bekommt **P0011** (Exit-Code 2) noch vor dem ersten Bissen:" },
          { art: "code", code: code`
gebacken klasse Margherita { }
klasse MargheritaPlus erbt Margherita { }
`, ausfuehrbar: true, exitCode: 2, tier: 1 }
        ] }
      ]
    },
    {
      id: "rezepturen",
      gruppe: "Sprache",
      ordnung: 270,
      titel: "Rezepturen (Interfaces)",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Eine **Rezeptur** ist eine Checkliste: Sie sagt, *welche* Methoden eine Klasse haben muss – aber nicht, *wie* sie funktionieren. Eine Klasse verspricht mit `erfüllt`, die Liste abzuarbeiten." },
        { art: "code", code: code`
rezeptur Backbar {
    leer backe(salami grad);
}

klasse Flammkuchen erfüllt Backbar {
    speisekarte leer backe(salami grad) {
        Bote.sage(("Flammkuchen bei " + grad + " Grad"));
    }
}

Flammkuchen f = neu Flammkuchen();
f.backe(300);
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Flammkuchen bei 300 Grad" },
        { art: "details", titel: "Ausführliches Beispiel mit wirft", inhalt: [
          { art: "text", md: "Eine Klasse darf mehrere Rezepturen erfüllen: `erfüllt R1, R2`. Die Angabe `wirft` (welche Ananas fliegen können) wird gelesen, aber nicht geprüft (Tier 3)." },
          { art: "code", code: code`
speisekarte rezeptur Backbar {
    leer backe(salami grad) wirft VerbranntAnanas;
    diavolo istFertig();
}

klasse Flammkuchen erfüllt Backbar {
    geheimrezept diavolo fertig = nein;

    speisekarte leer backe(salami grad) wirft VerbranntAnanas {
        falls (grad > 485) {
            wirf neu VerbranntAnanas("Zu heiß für Flammkuchen!");
        }
        fertig = ja;
    }
    speisekarte diavolo istFertig() {
        serviere ((fertig));
    }
}

Flammkuchen f = neu Flammkuchen();
Bote.sage((f.istFertig()));
f.backe(300);
Bote.sage((f.istFertig()));
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "nein\nja" }
        ] },
        { art: "details", titel: "Versprechen gebrochen: Fehler R0001", inhalt: [
          { art: "text", md: "Beim Programmstart prüft der Pizzaiolo jede Klasse (außer `rohling`). Fehlt eine Methode, gibt es **R0001** (Exit-Code 2): `Klasse 'Suppe' erfüllt Rezeptur 'Schneidbar' nicht: Methode 'stücke' fehlt.` – Suppe lässt sich eben schlecht schneiden." },
          { art: "code", code: code`
rezeptur Schneidbar {
    salami stücke();
}
klasse Suppe erfüllt Schneidbar { }
`, ausfuehrbar: true, exitCode: 2, tier: 1 }
        ] }
      ]
    },
    {
      id: "quattrostagioni",
      gruppe: "Sprache",
      ordnung: 280,
      titel: "quattrostagioni (Enums)",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Ein `quattrostagioni` ist eine feste Auswahl aus **genau vier** Werten – wie die vier Viertel einer Quattro Stagioni. Nicht drei, nicht fünf." },
        bild("sp-quattro.svg", "Eine Pizza in vier Vierteln: FRÜHLING 1, SOMMER 2, HERBST 3, WINTER 4. Daneben: genau 4 feste Werte, 3 oder 5 Werte ergeben Fehler Q0004.", "Vier Viertel, vier Werte, Position 1 bis 4."),
        { art: "code", code: code`
quattrostagioni Jahreszeit { FRÜHLING, SOMMER, HERBST, WINTER }

Jahreszeit jetzt = Jahreszeit.SOMMER;
Bote.sage(jetzt);
Bote.sage((jetzt.position()));
Bote.sage((Jahreszeit.werte()));
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "SOMMER\n2\n[FRÜHLING, SOMMER, HERBST, WINTER]" },
        { art: "details", titel: "Alle Werte durchgehen mit wähle", inhalt: [
          { art: "text", md: "Jeder Wert kennt `name()` und `position()` (1–4). `Typ.werte()` liefert alle vier als Blech." },
          { art: "code", code: code`
quattrostagioni Jahreszeit { FRÜHLING, SOMMER, HERBST, WINTER }

für (Jahreszeit j : Jahreszeit.werte()) {
    wähle (j) {
        fall Jahreszeit.SOMMER -> Bote.sage((j.name() + ": Pizza im Garten"));
        standard -> Bote.sage((j.name() + ": Pizza drinnen"));
    }
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "FRÜHLING: Pizza drinnen\nSOMMER: Pizza im Garten\nHERBST: Pizza drinnen\nWINTER: Pizza drinnen" }
        ] },
        { art: "details", titel: "Drei Werte? Fehler Q0004", inhalt: [
          { art: "text", md: "Drei Werte sind keine Quattro Stagioni, sondern **Q0004** (Exit-Code 2):" },
          { art: "code", code: code`
quattrostagioni Mahlzeit { FRÜHSTÜCK, MITTAG, ABEND }
`, ausfuehrbar: true, exitCode: 2, tier: 1 },
          { art: "hinweis", ton: "warnung", md: "`PizzaFehler Q0004: quattrostagioni braucht genau 4 Werte, nicht 3.` – Tipp: Mitternachtssnack ergänzen." }
        ] }
      ]
    },
    {
      id: "annotationen",
      gruppe: "Sprache",
      ordnung: 290,
      titel: "Annotationen",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Annotationen sind Zettel, die du an Methoden oder Parameter klebst: `@Name`. Sie geben dem Pizzaiolo Zusatz-Infos – hier: „Diese Methode ist veraltet“." },
        { art: "code", code: code`
klasse Lieferdienst {
    @PizzaVeraltet(grund: "Nimm lieber bestelle()")
    tiefkühl leer rufeAn() {
        Bote.sage(("Ring ring..."));
    }
}

Lieferdienst.rufeAn();
Lieferdienst.rufeAn();
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Ring ring...\nRing ring..." },
        { art: "hinweis", ton: "info", md: "Zusätzlich erscheint in der Konsole **einmal** die Warnung `W0003` – der Pizzaiolo wiederholt sich nicht gern." },
        { art: "details", titel: "Alle Annotationen", inhalt: [
          { art: "text", md: "Schreibweisen: `@Name`, `@Name(wert)` oder `@Name(schlüssel: wert, ...)` (auch `schlüssel = wert`)." },
          { art: "tabelle", kopf: ["Annotation", "Wirkung"], zeilen: [
            ["`@PizzaÜberschreibt`", "Methode muss in Eltern-Klasse/Rezeptur existieren, sonst `A0001` beim Start"],
            ["`@PizzaVeraltet(grund: \"...\")`", "Warnung `W0003` beim ersten Aufruf"],
            ["`@NieKarton`", "an Parametern: `karton` als Argument → `LeererKartonAnanas`"],
            ["`@Pizzaiolo(autor: \"...\")`", "nur Info – Ehre, wem Ehre gebührt"],
            ["`@Kühlschrank(haltbar: Dauer)`", "merkt sich Ergebnisse (siehe Pizza-Funktionen)"],
            ["`@Nach(Belag, ...)`", "Schichtreihenfolge eigener Beläge (siehe Pizza-Funktionen)"]
          ] },
          { art: "code", code: code`
klasse Kasse {
    @Pizzaiolo(autor: "Luigi")
    tiefkühl funghi kassiere(@NieKarton Pizza p) {
        serviere ((p.preis()));
    }
}

Bote.sage((Kasse.kassiere(((Tomate, Salami)))));
probier {
    Kasse.kassiere(karton);
} verbrannt (LeererKartonAnanas a) {
    Bote.sage(("Leerer Karton? Dafür zahlt niemand."));
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "7.5\nLeerer Karton? Dafür zahlt niemand." }
        ] },
        { art: "details", titel: "Tippfehler beim Überschreiben: A0001", inhalt: [
          { art: "text", md: "Wer `@PizzaÜberschreibt` an eine Methode klebt, die es oben gar nicht gibt (hier: `knetten` statt `kneten`), bekommt **A0001** (Exit-Code 2):" },
          { art: "code", code: code`
klasse Brot {
    speisekarte leer kneten() { }
}
klasse Pizzabrot erbt Brot {
    @PizzaÜberschreibt
    speisekarte leer knetten() { }
}
`, ausfuehrbar: true, exitCode: 2, tier: 1 }
        ] }
      ]
    },

    // ───────────────────────────── ANANAS & HAWAII ─────────────────────────────
    {
      id: "ananas-hierarchie",
      gruppe: "Ananas & Hawaii",
      ordnung: 400,
      titel: "Ananas – wenn etwas schiefgeht",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Geht etwas schief, *wirft* pizza eine **Ananas** (anderswo: Exception). Ananas sind wie ein Stammbaum sortiert: Wer eine Familie fängt, fängt alle Kinder mit." },
        bild("sp-ananas-baum.svg", "Stammbaum: Oben Ananas. Darunter GeprüfteAnanas mit VerbranntAnanas und LieferAnanas, und LaufzeitAnanas mit zwölf Kindern von StreitAnanas bis UnbekanntePizzaAnanas.", "Alle Ananas stammen von Ananas ab."),
        { art: "code", code: code`
Blech<salami> blech = [1, 2, 3];
probier {
    Bote.sage((blech.stück(4)));
} verbrannt (LaufzeitAnanas a) {
    Bote.sage(("Gefangen: " + a.typ()));
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Gefangen: KeinStückAnanas" },
        { art: "details", titel: "Die zwei Familien und typische Anlässe", inhalt: [
          { art: "text", md: "- `GeprüfteAnanas` – Ärger, mit dem man rechnen muss: `VerbranntAnanas`, `LieferAnanas`\n- `LaufzeitAnanas` – Ärger, der einfach passiert: alle anderen" },
          { art: "tabelle", kopf: ["Ananas", "Typischer Anlass"], zeilen: [
            ["`RechenAnanas`", "Teilen durch 0 – „Durch null teilen? Das ergibt keine Stücke.“"],
            ["`KeinStückAnanas`", "`blech.stück(i)` außerhalb des Blechs (Zählung ab 1!)"],
            ["`LeererKartonAnanas`", "Methode oder Feld auf `karton`"],
            ["`TypAnanas`", "`salami x = 3.5;`"],
            ["`ZugriffsAnanas`", "fremder Zugriff auf ein `geheimrezept`"],
            ["`UnbekannterBelagAnanas`", "Belag steht nicht auf der Zutatenliste"],
            ["`LaufzeitAnanas`", "sonstige Fehler, z. B. „'x' ist nicht definiert.“"]
          ] }
        ] },
        { art: "details", titel: "Was eine Ananas kann", inhalt: [
          { art: "text", md: "Jede Ananas hat `nachricht()` (auch `holeNachricht()`) und `typ()` (Klassenname). Als Text sieht sie so aus: `Typ: Nachricht`. Selbst werfen kannst du sie mit `wirf neu …(\"Nachricht\");`." },
          { art: "code", code: code`
probier {
    wirf neu VerbranntAnanas("Rand ist schwarz.");
} verbrannt (Ananas a) {
    Bote.sage(a);
    Bote.sage((a.nachricht()));
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "VerbranntAnanas: Rand ist schwarz.\nRand ist schwarz." }
        ] }
      ]
    },
    {
      id: "probier-verbrannt-rand",
      gruppe: "Ananas & Hawaii",
      ordnung: 410,
      titel: "probier, verbrannt & rand",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "`probier` versucht etwas. Fliegt eine Ananas, fängt `verbrannt` sie auf wie ein Netz. `rand` läuft **immer** – egal, ob es geklappt hat." },
        bild("sp-probier.svg", "Ablauf: probier führt bei Erfolg zu alles gut. Fliegt eine Ananas, landet sie im Fangnetz verbrannt. Beide Wege enden im rand, der immer läuft.", "verbrannt ist das Fangnetz, rand wird immer gegessen."),
        { art: "code", code: code`
probier {
    Bote.sage(("Teile 12 € durch 0 Gäste ..."));
    Bote.sage((12 / 0));
} verbrannt (RechenAnanas a) {
    Bote.sage((a.nachricht()));
} rand {
    Bote.sage(("Der Rand wird immer gegessen."));
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Teile 12 € durch 0 Gäste ...\nDurch null teilen? Das ergibt keine Stücke.\nDer Rand wird immer gegessen." },
        { art: "details", titel: "Mehrere Netze und das Allzweck-Netz", inhalt: [
          { art: "text", md: "Du darfst mehrere `verbrannt` hintereinander schreiben – das erste passende fängt. `verbrannt (a)` ohne Typ fängt jede Ananas. Geworfen wird mit `wirf ausdruck;`." },
          { art: "code", code: code`
klasse Kasse {
    tiefkühl funghi proStück(funghi preis, salami stücke) {
        serviere ((preis / stücke));
    }
}

für (salami stücke : [4, 0]) {
    probier {
        Bote.sage(("Pro Stück: " + Kasse.proStück(12, stücke)));
    } verbrannt (StreitAnanas a) {
        Bote.sage(("Streit am Tisch!"));
    } verbrannt (RechenAnanas a) {
        Bote.sage((a.nachricht()));
    } rand {
        Bote.sage(("Der Rand wird immer gegessen."));
    }
}

probier {
    wirf neu StreitAnanas("Wer hat das letzte Stück?");
} verbrannt (a) {
    Bote.sage(("Irgendwas ist passiert: " + a));
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "Pro Stück: 3\nDer Rand wird immer gegessen.\nDurch null teilen? Das ergibt keine Stücke.\nDer Rand wird immer gegessen.\nIrgendwas ist passiert: StreitAnanas: Wer hat das letzte Stück?" },
          { art: "hinweis", ton: "pizza", md: "Es gibt genau **eine** Sache, die kein `probier` der Welt fangen kann. Sie ist gelb, stachelig und gehört nicht auf Pizza." }
        ] }
      ]
    },
    {
      id: "eigene-ananas",
      gruppe: "Ananas & Hawaii",
      ordnung: 420,
      titel: "Eigene Ananas",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Eine eigene Ananas ist eine ganz normale Klasse, die von `LaufzeitAnanas` erbt. Die Nachricht reichst du mit `unten(m)` nach unten durch." },
        { art: "code", code: code`
klasse TeigRissAnanas erbt LaufzeitAnanas {
    speisekarte TeigRissAnanas(margherita m) {
        unten(m);
    }
}

probier {
    wirf neu TeigRissAnanas("Teig ist gerissen.");
} verbrannt (TeigRissAnanas a) {
    Bote.sage(a);
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "TeigRissAnanas: Teig ist gerissen." },
        { art: "details", titel: "Ausführliches Beispiel", inhalt: [
          { art: "text", md: "Statt `LaufzeitAnanas` geht auch `GeprüfteAnanas` als Eltern-Klasse. `typ()` liefert deinen Klassennamen." },
          { art: "code", code: code`
klasse TeigRissAnanas erbt LaufzeitAnanas {
    speisekarte TeigRissAnanas(margherita m) {
        unten(m);
    }
}

klasse Bäcker {
    tiefkühl leer wirfTeig(salami höhe) wirft TeigRissAnanas {
        falls (höhe > 2) {
            wirf neu TeigRissAnanas("Teig bei " + höhe + " m gerissen.");
        }
        Bote.sage(("Teig fliegt " + höhe + " m hoch."));
    }
}

für (salami h : [1 .. 3]) {
    probier {
        Bäcker.wirfTeig(h);
    } verbrannt (TeigRissAnanas a) {
        Bote.sage(a);
        Bote.sage(("Typ: " + a.typ()));
    }
}
`, ausfuehrbar: true, tier: 1 },
          { art: "ausgabe", text: "Teig fliegt 1 m hoch.\nTeig fliegt 2 m hoch.\nTeigRissAnanas: Teig bei 3 m gerissen.\nTyp: TeigRissAnanas" }
        ] }
      ]
    },
    {
      id: "exit-codes",
      gruppe: "Ananas & Hawaii",
      ordnung: 430,
      titel: "Exit-Codes",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Am Ende jedes Laufs zeigt die Konsole eine Zahl, den **Exit-Code**. `0` heißt: hat geschmeckt. Alles andere heißt: Da ist was schiefgegangen." },
        bild("sp-exit-codes.svg", "Fünf Karten: 0 gegessen, 1 ungefangene Ananas, 2 PizzaFehler, 3 noch im Ofen, 39 Hawaii.", "Die Zahl am Ende sagt, wie es geschmeckt hat."),
        { art: "code", code: code`
Bote.sage(("Gleich gibt's Streit..."));
wirf neu StreitAnanas("Wer hat das letzte Stück gegessen?");
Bote.sage(("Das hier wird nie serviert."));
`, ausfuehrbar: true, exitCode: 1, tier: 1 },
        { art: "ausgabe", text: "Gleich gibt's Streit..." },
        { art: "details", titel: "Alle Exit-Codes und die Endlosschleife", inhalt: [
          { art: "tabelle", kopf: ["Code", "Bedeutung"], zeilen: [
            ["`0`", "gegessen – alles gut"],
            ["`1`", "ungefangene Ananas"],
            ["`2`", "PizzaFehler – Syntax, `K0001`, `B0012`, `R0001`, `Q0004`, `A0001`, `P0011`, `P0012` …"],
            ["`3`", "Schrittlimit (`P0002`) – die Pizza ist noch im Ofen"],
            ["`39`", "Hawaii. Frag nicht."]
          ] },
          { art: "hinweis", ton: "warnung", md: "Im Beispiel oben erscheint in der Konsole: `Ungefangene Ananas – StreitAnanas: Wer hat das letzte Stück gegessen? (Zeile 2)`. Was vorher ausgegeben wurde, bleibt stehen." },
          { art: "text", md: "Wer den Ofen nie ausschaltet, landet nach 5 000 000 Schritten bei Exit-Code 3 (`P0002: Die Pizza ist noch im Ofen.`):" },
          { art: "code", code: code`
solange (ja) {
    // Nur noch fünf Minuten...
}
`, ausfuehrbar: false, tier: 1 }
        ] }
      ]
    },
    {
      id: "hawaii",
      gruppe: "Ananas & Hawaii",
      ordnung: 490,
      titel: "Hawaii",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "`hawaii` ist ein gültiger Typ, und `Ananas` steht auf der Zutatenliste. Der Parser ist höflich und akzeptiert alles. Der Pizzaiolo nicht." },
        { art: "code", code: code`
Bote.sage(("Der Gast bestellt etwas Exotisches..."));
probier {
    Pizza mutig = ((Tomate, Käse, Schinken)) + Ananas;
    Bote.sage(("Hat doch geklappt?"));
} verbrannt (a) {
    Bote.sage(("Puh, gerade noch gefangen."));
} rand {
    Bote.sage(("Wenigstens der Rand..."));
}
`, ausfuehrbar: true, exitCode: 39, tier: 1 },
        { art: "ausgabe", text: "Der Gast bestellt etwas Exotisches..." },
        { art: "hinweis", ton: "warnung", md: "Was danach passiert, steht hier nicht. Manche Dinge muss man selbst erleben. Keine Angst um deinen Code: Editor und Tabs bleiben, wie sie sind – nur das Programm ist vorbei." },
        { art: "details", titel: "Nur so viel …", inhalt: [
          { art: "text", md: "- Schon wenn dein Quelltext so etwas *enthält*, meldet sich der Pizzaiolo vor dem Start mit **W0666** – einmal. Er sagt nichts. Er schaut nur.\n- Das Programm endet sofort mit Exit-Code `39`. Kein `verbrannt` und kein `rand` hilft.\n- Im Playground erscheint die Nachricht des Pizzaiolo in der Konsole – dort, wo auch andere Fehler stehen. Im Terminal (Kommandozeile, heruntergeladenes Programm) landet sie auf der Fehlerausgabe (*stderr*)." }
        ] },
        { art: "details", titel: "Was genau löst es aus?", inhalt: [
          { art: "tabelle", kopf: ["Code", "Folge"], zeilen: [
            ["`Pizza p = ((Tomate, Ananas));` oder `p + Ananas`", "Exit-Code 39 – eine Pizza mit dieser Frucht ist entstanden"],
            ["`hawaii x = 1;` – jede Zuweisung an eine `hawaii`-Variable, ein solches Feld oder einen solchen Parameter, **auch** `hawaii x = karton;`", "Exit-Code 39"],
            ["`neu Hawaii(…)` – egal, ob es die Klasse gibt", "Exit-Code 39"],
            ["`hawaii x;` (ohne Wert) oder `Blech<hawaii>`", "nur W0666 – noch ist nichts passiert"],
            ["Den Belag allein anfassen: `Bote.sage((Ananas))`, `p.hat(Ananas)`, `p - Ananas`, `Ananas.preis()`", "nur W0666 – schauen ist erlaubt"],
            ["`Ananas` als Exception-Familie (`verbrannt (Ananas a)`), Namen wie `Q.Ananas`", "nichts – das ist eine ganz normale Ananas"]
          ] },
          { art: "text", md: "Das gilt in jeder Phase des Programms – auch in Lieferungen und `wennDa`-Rückrufen nach Programmende." }
        ] }
      ]
    }
  );
})();
