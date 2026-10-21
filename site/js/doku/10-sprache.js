/* pizza v3.0 – Doku: Einstieg, Sprache, Ananas & Hawaii (ordnung 100–299, 400–499) */
(function () {
  "use strict";
  const ziel = typeof self !== "undefined" ? self : globalThis;

  // Template-Tag: Backslashes bleiben roh (pizza-Escapes wie \n), erste/letzte Leerzeile weg.
  function code(s, ...v) {
    return String.raw(s, ...v).replace(/^\r?\n/, "").replace(/\r?\n[ \t]*$/, "").replace(/\r\n/g, "\n");
  }

  (ziel.PIZZA_DOKU = ziel.PIZZA_DOKU || []).push(
    // ───────────────────────────── EINSTIEG ─────────────────────────────
    {
      id: "erste-pizza",
      gruppe: "Einstieg",
      ordnung: 100,
      titel: "Erste Pizza in 30 Sekunden",
      tier: 1,
      inhalt: [
        { art: "text", md: "Kein Vorheizen, kein Projekt-Setup: Tippe eine Zeile in den Editor und drücke **Strg+Enter**. Im *Snack-Modus* dürfen Anweisungen direkt auf oberster Ebene stehen – perfekt für den kleinen Hunger zwischendurch." },
        { art: "code", code: code`
Bote.sage(("Hallo, Pizzawelt!"));
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Hallo, Pizzawelt!" },
        { art: "text", md: "Und weil wir hier in einer Pizzeria sind, backen wir gleich eine echte Pizza. Beläge stehen in doppelten runden Klammern, von unten nach oben. Der Teig kostet `5.00`, jeder Belag kommt dazu:" },
        { art: "code", code: code`
Pizza meine = ((Tomate, Mozzarella, Basilikum));
Bote.sage(meine);
Bote.sage(("Kostet: " + meine.preis().euro()));
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "((Tomate, Mozzarella, Basilikum))\nKostet: 8,00 €" },
        { art: "hinweis", ton: "pizza", md: "Jeder Code-Block in dieser Doku hat einen Knopf **„Im Editor öffnen“**. Einfach ausprobieren – es brennt höchstens die Pizza an, nie dein Rechner." }
      ]
    },
    {
      id: "programmaufbau",
      gruppe: "Einstieg",
      ordnung: 110,
      titel: "Programmaufbau mit hauptgang",
      tier: 1,
      inhalt: [
        { art: "text", md: "Ein „richtiges“ pizza-Programm hat einen **Hauptgang**: die erste Klasse mit einer Methode `tiefkühl leer hauptgang(Blech<margherita> args)`. `paket` und `import` sind erlaubt, werden aber ignoriert – die Standardbibliothek steht ohnehin immer auf dem Tresen." },
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
        { art: "text", md: "Snack-Modus und Hauptgang vertragen sich: Erst werden alle Deklarationen registriert (sie dürfen also auch *nach* ihrer Verwendung stehen), dann laufen die Top-Level-Anweisungen der Reihe nach, und **danach** wird `hauptgang` serviert." },
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
      ]
    },
    {
      id: "philosophie",
      gruppe: "Einstieg",
      ordnung: 120,
      titel: "Philosophie in 3 Sätzen",
      tier: 1,
      inhalt: [
        { art: "text", md: "1. **Klammern sind rund wie Pizza** – deshalb gibt es davon reichlich: `Bote.sage((\"…\"))` ist guter Stil, und `serviere` geht nur mit Klammern.\n\n2. **Alles ist eine Pizzeria-Metapher**: Ganzzahlen heißen `salami`, Exceptions heißen *Ananas*, `null` ist ein leerer `karton`, und `static` heißt `tiefkühl`.\n\n3. **Wer Ananas auf die Pizza legt, trägt die Konsequenzen** – mehr dazu im Kapitel *Hawaii*, wenn du dich traust." },
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
      titel: "Lexik & Kommentare",
      tier: 1,
      inhalt: [
        { art: "text", md: "Quelltext ist UTF-8, Bezeichner dürfen Umlaute und `ß` enthalten (`größe`, `Käse`). Anweisungen enden mit `;`, Blöcke stehen in `{ }`.\n\n- Kommentare: `// bis Zeilenende` und `/* mehrzeilig */`\n- Zahlen: `42`, `7.50`, `1_000_000` (Unterstriche sind nur Deko)\n- Dauer-Literale: Zahl **direkt** gefolgt von `ms`, `s`, `min`, `h` oder `d`, z. B. `90s`, `1.5s`\n- Texte: `\"...\"` mit den Escapes `\\n`, `\\t`, `\\\"` und `\\\\`\n- Wahrheitswerte `ja` / `nein`, der leere Karton `karton`" },
        { art: "code", code: code`
// Ein Kommentar bis zum Zeilenende
/* Ein Kommentar,
   so lang wie eine Familienpizza */
salami gäste = 1_000_000;
funghi preis = 7.50;
Dauer backzeit = 90s;
margherita gruß = "Er sagte: \"Buon appetito!\"\nUnd ging.";
Bote.sage(gäste);
Bote.sage(preis);
Bote.sage(backzeit);
Bote.sage(gruß);
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "1000000\n7.5\n1min 30s\nEr sagte: \"Buon appetito!\"\nUnd ging." },
        { art: "text", md: "Reservierte Keywords (keine Bezeichner!):" },
        { art: "tabelle", kopf: ["Bereich", "Keywords"], zeilen: [
          ["Struktur", "`paket` `import` `klasse` `rezeptur` `rohling` `calzone` `belag` `auf` `quattrostagioni` `erbt` `erfüllt`"],
          ["Modifikatoren", "`speisekarte` `familienrezept` `geheimrezept` `tiefkühl` `gebacken`"],
          ["Werte & Objekte", "`leer` `neu` `dies` `unten` `ja` `nein` `karton`"],
          ["Kontrollfluss", "`serviere` `falls` `sonst` `für` `solange` `wähle` `fall` `standard` `abbrechen` `weiter`"],
          ["Ananas & Ofen", "`probier` `verbrannt` `rand` `wirf` `wirft` `ofen` `roh`"]
        ] },
        { art: "hinweis", ton: "info", md: "`pizza` ist seit v3.0 **kein** Keyword mehr – du darfst deine Variable also endlich `pizza` nennen." }
      ]
    },
    {
      id: "gross-klein",
      gruppe: "Sprache",
      ordnung: 205,
      titel: "Groß- und Kleinschreibung",
      tier: 1,
      inhalt: [
        { art: "text", md: "Groß-/Kleinschreibung ist **signifikant**: `pizza`, `Pizza`, `PiZZa` und `piZZA` sind vier verschiedene, gültige Bezeichner. Erlaubt ist das – empfehlenswert nicht. Definierst du in einem Scope zwei Namen, die sich nur in der Schreibweise unterscheiden, meldet der Pizzaiolo einmal pro Paar die Warnung **W0032**:" },
        { art: "code", code: code`
salami PiZZa = 1;
salami piZZA = 2;
Bote.sage(PiZZa + piZZA);
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "3" },
        { art: "hinweis", ton: "warnung", md: "`W0032: 'PiZZa' und 'piZZA' sind im selben Scope definiert. Selbst der Pizzaiolo verwechselt die beiden.` – Warnungen ändern den Exit-Code nicht, nur die Laune des Kollegen beim Code-Review." },
        { art: "text", md: "Großschreibung hat außerdem eine Bedeutung: Ein großgeschriebener Bezeichner, der weder Variable noch Klasse ist, wird als **Belag** gelesen. Deshalb funktioniert `p + Salami` ohne Anführungszeichen – und `Salamy` endet in einer `UnbekannterBelagAnanas`." },
        { art: "code", code: code`
margherita pizza = "kleingeschrieben, ganz legal";
Pizza belegt = ((Tomate)) + Salami;
Bote.sage(pizza);
Bote.sage(belegt);
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "kleingeschrieben, ganz legal\n((Tomate, Salami))" }
      ]
    },
    {
      id: "typen",
      gruppe: "Sprache",
      ordnung: 210,
      titel: "Typen",
      tier: 1,
      inhalt: [
        { art: "text", md: "Jeder Grundtyp ist nach einer Pizza benannt – je nachdem, wie er sich anfühlt:" },
        { art: "tabelle", kopf: ["pizza", "Bedeutung", "Beispiel"], zeilen: [
          ["`salami`", "Ganzzahl", "`8`"],
          ["`funghi`", "Kommazahl", "`7.5`"],
          ["`margherita`", "Text", "`\"Hallo\"`"],
          ["`diavolo`", "Wahrheitswert", "`ja`, `nein`"],
          ["`Dauer`", "Zeitdauer", "`90s`, `30min`"],
          ["`Pizza`", "Pizza", "`((Tomate, Käse))`"],
          ["`Blech<T>`", "Liste", "`[1, 2, 3]`, `[1 .. 8]`"],
          ["`Speisekarte<K, V>`", "Map", "`neu Speisekarte<margherita, funghi>()`"],
          ["`hawaii`", "kompiliert.", "– (siehe *Hawaii*)"]
        ] },
        { art: "code", code: code`
salami stücke = 8;
funghi preis = 9.5;
margherita name = "Diavolo";
diavolo scharf = ja;
Dauer backzeit = 2min;
Pizza p = ((Tomate, Käse, Chili));
Blech<margherita> sorten = ["Margherita", "Funghi"];
Speisekarte<margherita, funghi> karte = neu Speisekarte<margherita, funghi>();
karte.lege("Margherita", 8);
karte.lege("Diavolo", 9.5);
Pizza nichts = karton;

Bote.sage(stücke + " Stücke " + name + ", scharf: " + scharf);
Bote.sage(backzeit + 30s);
Bote.sage(p);
Bote.sage(sorten);
Bote.sage(karte);
Bote.sage(nichts);
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "8 Stücke Diavolo, scharf: ja\n2min 30s\n((Tomate, Käse, Chili))\n[Margherita, Funghi]\n{Margherita: 8, Diavolo: 9.5}\nkarton" },
        { art: "text", md: "Typen werden bei Deklaration, Zuweisung und Parameterübergabe geprüft – `salami` muss ganzzahlig sein, `margherita` ein Text usw. Verstöße werfen eine `TypAnanas`. `karton` passt in alle Nicht-Primitive (also nicht in `salami`, `funghi`, `margherita`, `diavolo`)." },
        { art: "code", code: code`
probier {
    salami stücke = 3.5;
} verbrannt (TypAnanas a) {
    Bote.sage(("TypAnanas! Halbe Stücke gibt es nicht."));
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "TypAnanas! Halbe Stücke gibt es nicht." },
        { art: "hinweis", ton: "info", md: "Generics wie `Blech<salami>` werden geparst, aber **nicht geprüft** (Tier 3). Ein `Blech<salami>` nimmt dir also auch einen Text nicht übel – der Pizzaiolo schon." }
      ]
    },
    {
      id: "variablen",
      gruppe: "Sprache",
      ordnung: 220,
      titel: "Variablen & der leere Karton",
      tier: 1,
      inhalt: [
        { art: "text", md: "Deklaration: `Typ name = ausdruck;` (der Initialwert ist optional). Zuweisen mit `=`, `+=`, `-=`, `*=`, `/=`, hoch- und runterzählen mit `x++;` / `x--;`. Variablen leben in ihrem Block `{ }` – wie Belag auf seiner Pizza." },
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
        { art: "ausgabe", text: "8\nTisch: der große am Fenster" },
        { art: "text", md: "`karton` ist der leere Karton (anderswo `null`). Eine Variable, die `karton` enthält, darfst du lesen und ausgeben – aber wer im leeren Karton nach Pizza greift (Methodenaufruf oder Feldzugriff), bekommt eine `LeererKartonAnanas`." },
        { art: "code", code: code`
Pizza bestellung = karton;
Bote.sage(bestellung);
probier {
    Bote.sage((bestellung.preis()));
} verbrannt (LeererKartonAnanas a) {
    Bote.sage((a.nachricht()));
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "karton\nDer Karton ist leer." },
        { art: "hinweis", ton: "pizza", md: "Pizzen haben genau **einen Besitzer**: `Pizza q = p;` wirft eine `BesitzAnanas`. Wie man Pizzen weitergibt (`schieb`, `teile`), steht bei den Pizza-Funktionen." }
      ]
    },
    {
      id: "operatoren",
      gruppe: "Sprache",
      ordnung: 230,
      titel: "Operatoren & Klammerpflicht",
      tier: 1,
      inhalt: [
        { art: "text", md: "Präzedenz von niedrig nach hoch: `?:` · `||` · `&&` · `== !=` · `< <= > >=` · `+ -` · `* / %` · unär `! -`.\n\n- `+` mit mindestens einem Text verkettet (von links nach rechts!).\n- `/` teilt exakt: `7 / 2` ist `3.5`. Durch `0` teilen wirft eine `RechenAnanas`.\n- `==` vergleicht Zahlen, Texte, Wahrheitswerte, Dauern und sogar Pizzen nach Wert." },
        { art: "code", code: code`
Bote.sage((7 / 2));
Bote.sage((7 % 2));
Bote.sage((2 + 3 * 4));
Bote.sage(("Tisch " + 4 + 2));
Bote.sage(("Tisch " + (4 + 2)));

salami hunger = 3;
hunger += 3;
Bote.sage((hunger > 5 && !nein));
Bote.sage((hunger == 6 ? "satt" : "hungrig"));
Bote.sage((((Tomate, Käse)) == ((Tomate, Käse))));
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "3.5\n1\n14\nTisch 42\nTisch 6\nja\nsatt\nja" },
        { art: "text", md: "**Klammerpflicht.** Runde Klammern sind in pizza keine Formsache, sondern Pflicht:\n\n- `falls`, `solange`, `für` und `wähle` brauchen Klammern um die Bedingung **und** geschweifte Klammern um den Block.\n- `serviere` (return) braucht Klammern: `serviere (x);`. Nur in `leer`-Methoden darf ein nacktes `serviere;` stehen.\n\nWer `serviere x;` schreibt, bekommt den Fehler **K0001** – Exit-Code 2, das Programm startet gar nicht erst:" },
        { art: "code", code: code`
klasse Kasse {
    tiefkühl salami summe(salami a, salami b) {
        serviere a + b;
    }
}
Bote.sage((Kasse.summe(1, 2)));
`, ausfuehrbar: true, exitCode: 2, tier: 1 },
        { art: "hinweis", ton: "warnung", md: "`PizzaFehler K0001: Klammerpflicht! serviere braucht Klammern: serviere (x);` – Richtig wäre `serviere ((a + b));`. Doppelte Klammern sind stilistisch erwünscht und schaden nie." }
      ]
    },
    {
      id: "kontrollfluss",
      gruppe: "Sprache",
      ordnung: 240,
      titel: "Kontrollfluss",
      tier: 1,
      inhalt: [
        { art: "text", md: "`falls` / `sonst falls` / `sonst` entscheiden, `solange` wiederholt, solange der Ofen heiß ist:" },
        { art: "code", code: code`
salami grad = 420;
falls (grad > 485) {
    Bote.sage(("Verbrannt!"));
} sonst falls (grad >= 400) {
    Bote.sage(("Perfekt neapolitanisch."));
} sonst {
    Bote.sage(("Eher Auflauf."));
}

salami minuten = 3;
solange (minuten > 0) {
    Bote.sage(("Noch " + minuten + " Minuten"));
    minuten--;
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Perfekt neapolitanisch.\nNoch 3 Minuten\nNoch 2 Minuten\nNoch 1 Minuten" },
        { art: "text", md: "`für` gibt es in zwei Sorten: klassisch mit `(init; bedingung; update)` und als *für-jedes* über ein Blech, die Zeichen eines Texts oder die Schlüssel einer Speisekarte. Bereiche `[a .. b]` sind inklusive. `abbrechen;` verlässt die Schleife, `weiter;` springt zum nächsten Durchlauf." },
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
        { art: "ausgabe", text: "1\n3\n5\n7\nStück 1\nStück 2\nO-f-e-n-\nMehl: 25\nHefe: 2" },
        { art: "text", md: "`wähle` ist ein `switch` ohne Durchfallen: Nach `->` steht genau eine Anweisung oder ein Block. Mehrere Werte pro `fall` werden mit Komma getrennt, `standard` fängt den Rest." },
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
      ]
    },
    {
      id: "methoden-lambdas",
      gruppe: "Sprache",
      ordnung: 250,
      titel: "Methoden, Lambdas & benannte Argumente",
      tier: 1,
      inhalt: [
        { art: "text", md: "Methoden wohnen in Klassen: `[Modifikatoren] Typ|leer name(Parameter) { ... }`. Rückgabe mit `serviere ((wert));`. Statische Methoden (`tiefkühl`) ruft man über den Klassennamen auf.\n\n**Benannte Argumente** (`name: wert`) funktionieren auch für eigene Methoden – zugeordnet wird nach Parametername, die Reihenfolge ist dann egal." },
        { art: "code", code: code`
klasse Küche {
    tiefkühl funghi mitTrinkgeld(funghi preis, salami prozent) {
        serviere ((preis + preis * prozent / 100));
    }
    tiefkühl leer ansage(margherita text) {
        falls (text == "") { serviere; }
        Bote.sage(("Achtung: " + text));
    }
}

Bote.sage((Küche.mitTrinkgeld(8, 10)));
Bote.sage((Küche.mitTrinkgeld(prozent: 25, preis: 8)));
Küche.ansage("");
Küche.ansage("Ofen ist heiß!");
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "8.8\n10\nAchtung: Ofen ist heiß!" },
        { art: "text", md: "**Lambdas** schreibt man `x -> ausdruck`, `(a, b) -> ausdruck` oder mit Block `() -> { serviere ((...)); }`. Sie fangen ihren Scope ein (Closures) und werden mit `f(x)` aufgerufen. `Klasse.methode` ohne `()` ist eine **Methodenreferenz** – ein fertig gebackener Funktionswert." },
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
      ]
    },
    {
      id: "klassen-modifikatoren",
      gruppe: "Sprache",
      ordnung: 260,
      titel: "Klassen & Modifikatoren",
      tier: 1,
      inhalt: [
        { art: "text", md: "Eine Klasse besteht aus Feldern, Konstruktoren (Name = Klassenname) und Methoden. `dies` ist die aktuelle Instanz, `neu Klasse(args)` erzeugt eine neue. Definierst du `alsText()`, wird es für die Textausgabe benutzt – sonst heißt dein Objekt schlicht `Klassenname@N`." },
        { art: "tabelle", kopf: ["pizza", "Java", "Bedeutung"], zeilen: [
          ["`speisekarte`", "public", "steht auf der Karte – überall sichtbar"],
          ["`familienrezept`", "protected", "eigene Klasse + Unterklassen"],
          ["`geheimrezept`", "private", "nur eigene Klasse, sonst `ZugriffsAnanas`"],
          ["*(keiner)*", "package-private", "„Hausrezept“ – wie `speisekarte`"],
          ["`tiefkühl`", "static", "gehört der Klasse, nicht der Instanz"],
          ["`gebacken`", "final", "Feld: nur bei Initialisierung/im Konstruktor zuweisbar (`GebackenAnanas`); Klasse: nicht erweiterbar (`P0011`)"],
          ["`rohling`", "abstract", "nicht instanziierbar (`RohlingAnanas`), Methoden ohne Rumpf"],
          ["`calzone`", "–", "echte Kapselung, siehe Pizza-Funktionen"]
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
    Bote.sage((luigi.name));
} verbrannt (ZugriffsAnanas a) {
    Bote.sage(("Geheimrezept bleibt geheim."));
}
probier {
    luigi.öfen = 3;
} verbrannt (GebackenAnanas a) {
    Bote.sage(("Gebacken ist gebacken."));
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Pizzeria Da Luigi (2 Öfen)\nFilialen: 2\nGeheimrezept bleibt geheim.\nGebacken ist gebacken." },
        { art: "hinweis", ton: "info", md: "Unqualifizierte Namen in Methoden werden so gesucht: lokal → Instanzfeld → statisches Feld (eigene Klasse, dann Basis). Deshalb geht im Beispiel oben `name` statt `dies.name`." }
      ]
    },
    {
      id: "vererbung",
      gruppe: "Sprache",
      ordnung: 265,
      titel: "Vererbung, rohling & unten",
      tier: 1,
      inhalt: [
        { art: "text", md: "`klasse B erbt A` – B bekommt alles von A. Im Konstruktor ruft `unten(args);` den Basiskonstruktor auf (fehlt er, wird der argumentlose aufgerufen, falls vorhanden). `unten.methode()` ruft die Version der Basisklasse – denn die Basis liegt bei pizza bekanntlich *unten*.\n\nEine `rohling`-Klasse ist ein ungebackener Teig: man kann von ihr erben, aber sie nicht essen." },
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
        { art: "ausgabe", text: "Echter Holzofen mit 485 Grad\nEin Rohling ist nicht essbar." },
        { art: "text", md: "Eine `gebacken` Klasse ist fertig – wer davon erben will, bekommt **P0011** (Exit-Code 2) noch vor dem ersten Bissen:" },
        { art: "code", code: code`
gebacken klasse Margherita { }
klasse MargheritaPlus erbt Margherita { }
`, ausfuehrbar: true, exitCode: 2, tier: 1 }
      ]
    },
    {
      id: "rezepturen",
      gruppe: "Sprache",
      ordnung: 270,
      titel: "Rezepturen (Interfaces)",
      tier: 1,
      inhalt: [
        { art: "text", md: "Eine `rezeptur` legt fest, *was* gekocht wird, nicht *wie*. Klassen `erfüllen` eine oder mehrere Rezepturen (`erfüllt R1, R2`). Beim Programmstart prüft der Pizzaiolo, ob jede nicht-`rohling`-Klasse alle Methoden ihrer Rezepturen mitbringt. `wirft`-Klauseln werden geparst, aber nicht geprüft (Tier 3)." },
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
        { art: "ausgabe", text: "nein\nja" },
        { art: "text", md: "Fehlt eine Methode, gibt es **R0001** (Exit-Code 2): `Klasse 'Suppe' erfüllt Rezeptur 'Schneidbar' nicht: Methode 'stücke' fehlt.` – Suppe lässt sich eben schlecht schneiden." },
        { art: "code", code: code`
rezeptur Schneidbar {
    salami stücke();
}
klasse Suppe erfüllt Schneidbar { }
`, ausfuehrbar: true, exitCode: 2, tier: 1 }
      ]
    },
    {
      id: "quattrostagioni",
      gruppe: "Sprache",
      ordnung: 280,
      titel: "quattrostagioni (Enums)",
      tier: 1,
      inhalt: [
        { art: "text", md: "Eine Quattro Stagioni hat vier Viertel – und ein `quattrostagioni` hat **genau vier** Werte. Nicht drei, nicht fünf. Zugriff über `Typ.WERT`, dazu `name()`, `position()` (1–4) und `Typ.werte()`." },
        { art: "code", code: code`
quattrostagioni Jahreszeit { FRÜHLING, SOMMER, HERBST, WINTER }

Jahreszeit jetzt = Jahreszeit.SOMMER;
Bote.sage(jetzt);
Bote.sage((jetzt.position()));
Bote.sage((Jahreszeit.werte()));

für (Jahreszeit j : Jahreszeit.werte()) {
    wähle (j) {
        fall Jahreszeit.SOMMER -> Bote.sage((j.name() + ": Pizza im Garten"));
        standard -> Bote.sage((j.name() + ": Pizza drinnen"));
    }
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "SOMMER\n2\n[FRÜHLING, SOMMER, HERBST, WINTER]\nFRÜHLING: Pizza drinnen\nSOMMER: Pizza im Garten\nHERBST: Pizza drinnen\nWINTER: Pizza drinnen" },
        { art: "text", md: "Drei Werte? Dann ist es keine Quattro Stagioni, sondern **Q0004** (Exit-Code 2):" },
        { art: "code", code: code`
quattrostagioni Mahlzeit { FRÜHSTÜCK, MITTAG, ABEND }
`, ausfuehrbar: true, exitCode: 2, tier: 1 },
        { art: "hinweis", ton: "warnung", md: "`PizzaFehler Q0004: quattrostagioni braucht genau 4 Werte, nicht 3.` – Tipp: Mitternachtssnack ergänzen." }
      ]
    },
    {
      id: "annotationen",
      gruppe: "Sprache",
      ordnung: 290,
      titel: "Annotationen",
      tier: 1,
      inhalt: [
        { art: "text", md: "Annotationen sind die Zettel am Pizzakarton: `@Name`, `@Name(wert)` oder `@Name(schlüssel: wert, ...)` (auch `schlüssel = wert`)." },
        { art: "tabelle", kopf: ["Annotation", "Wirkung"], zeilen: [
          ["`@PizzaÜberschreibt`", "Methode muss in Basisklasse/Rezeptur existieren, sonst `A0001` beim Start"],
          ["`@PizzaVeraltet(grund: \"...\")`", "Warnung `W0003` beim ersten Aufruf"],
          ["`@NieKarton`", "an Parametern: `karton` als Argument → `LeererKartonAnanas`"],
          ["`@Pizzaiolo(autor: \"...\")`", "nur Metadaten – Ehre, wem Ehre gebührt"],
          ["`@Kühlschrank(haltbar: Dauer)`", "Methoden-Cache (siehe Pizza-Funktionen)"],
          ["`@Nach(Belag, ...)`", "Schichtreihenfolge eigener Beläge (siehe Pizza-Funktionen)"]
        ] },
        { art: "code", code: code`
klasse Lieferdienst {
    @PizzaVeraltet(grund: "Nimm lieber bestelle()")
    tiefkühl leer rufeAn() {
        Bote.sage(("Ring ring..."));
    }

    @Pizzaiolo(autor: "Luigi")
    tiefkühl funghi kassiere(@NieKarton Pizza p) {
        serviere ((p.preis()));
    }
}

Lieferdienst.rufeAn();
Lieferdienst.rufeAn();
Bote.sage((Lieferdienst.kassiere(((Tomate, Salami)))));
probier {
    Lieferdienst.kassiere(karton);
} verbrannt (LeererKartonAnanas a) {
    Bote.sage(("Leerer Karton? Dafür zahlt niemand."));
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "Ring ring...\nRing ring...\n7.5\nLeerer Karton? Dafür zahlt niemand." },
        { art: "text", md: "Die `W0003`-Warnung erscheint nur beim **ersten** Aufruf – der Pizzaiolo wiederholt sich nicht gern. Und wer `@PizzaÜberschreibt` an eine Methode klebt, die es oben gar nicht gibt, bekommt **A0001** (Exit-Code 2):" },
        { art: "code", code: code`
klasse Brot {
    speisekarte leer kneten() { }
}
klasse Pizzabrot erbt Brot {
    @PizzaÜberschreibt
    speisekarte leer knetten() { }
}
`, ausfuehrbar: true, exitCode: 2, tier: 1 }
      ]
    },

    // ───────────────────────────── ANANAS & HAWAII ─────────────────────────────
    {
      id: "ananas-hierarchie",
      gruppe: "Ananas & Hawaii",
      ordnung: 400,
      titel: "Ananas – die Exception-Hierarchie",
      tier: 1,
      inhalt: [
        { art: "text", md: "Wenn etwas schiefgeht, wirft pizza eine **Ananas**. Das passt: Niemand will sie, und trotzdem landet sie immer wieder auf dem Tisch. Alle Ananas stammen von `Ananas` ab und teilen sich in zwei Familien:\n\n- `GeprüfteAnanas` – Ärger, mit dem man rechnen muss: `VerbranntAnanas`, `LieferAnanas`\n- `LaufzeitAnanas` – Ärger, der einfach passiert: `StreitAnanas`, `RechenAnanas`, `LeererKartonAnanas`, `RohlingAnanas`, `BesitzAnanas`, `GebackenAnanas`, `TypAnanas`, `KeinStückAnanas`, `ZugriffsAnanas`, `UnbekannterBelagAnanas`, `ZugeklapptAnanas`, `UnbekanntePizzaAnanas`" },
        { art: "tabelle", kopf: ["Ananas", "Typischer Anlass"], zeilen: [
          ["`RechenAnanas`", "Division durch 0 – „Durch null teilen? Das ergibt keine Stücke.“"],
          ["`KeinStückAnanas`", "`blech.stück(i)` außerhalb des Blechs (Zählung ab 1!)"],
          ["`LeererKartonAnanas`", "Methodenaufruf/Feldzugriff auf `karton`"],
          ["`TypAnanas`", "`salami x = 3.5;`"],
          ["`ZugriffsAnanas`", "fremder Zugriff auf ein `geheimrezept`"],
          ["`UnbekannterBelagAnanas`", "Belag steht nicht auf der Zutatenliste"],
          ["`LaufzeitAnanas`", "interne Fehler, z. B. „'x' ist nicht definiert.“"]
        ] },
        { art: "text", md: "Jede Ananas hat `nachricht()` (Alias `holeNachricht()`) und `typ()` (Klassenname). Als Text sieht sie so aus: `Typ: Nachricht`. Gefangen wird inklusive Vererbung – wer `LaufzeitAnanas` fängt, fängt auch alle ihre Kinder." },
        { art: "code", code: code`
Blech<salami> blech = [1, 2, 3];
probier {
    Bote.sage((blech.stück(1)));
    Bote.sage((blech.stück(4)));
} verbrannt (LaufzeitAnanas a) {
    Bote.sage(("Gefangen: " + a.typ()));
}

probier {
    wirf neu VerbranntAnanas("Rand ist schwarz.");
} verbrannt (Ananas a) {
    Bote.sage(a);
}
`, ausfuehrbar: true, tier: 1 },
        { art: "ausgabe", text: "1\nGefangen: KeinStückAnanas\nVerbranntAnanas: Rand ist schwarz." }
      ]
    },
    {
      id: "probier-verbrannt-rand",
      gruppe: "Ananas & Hawaii",
      ordnung: 410,
      titel: "probier, verbrannt & rand",
      tier: 1,
      inhalt: [
        { art: "text", md: "`probier { }` versucht es, `verbrannt (Typ a) { }` fängt (beliebig viele, typisiert oder untypisiert als `verbrannt (a)`), und `rand { }` wird **immer** gegessen – egal, ob die Pizza gelungen ist. Geworfen wird mit `wirf ausdruck;`." },
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
      ]
    },
    {
      id: "eigene-ananas",
      gruppe: "Ananas & Hawaii",
      ordnung: 420,
      titel: "Eigene Ananas",
      tier: 1,
      inhalt: [
        { art: "text", md: "Eigene Ananas sind ganz normale Klassen, die von `LaufzeitAnanas` (oder `GeprüfteAnanas`) erben und die Nachricht per `unten(m)` nach unten durchreichen. `typ()` liefert dann deinen Klassennamen." },
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
      ]
    },
    {
      id: "exit-codes",
      gruppe: "Ananas & Hawaii",
      ordnung: 430,
      titel: "Exit-Codes",
      tier: 1,
      inhalt: [
        { art: "text", md: "Am Ende jedes Laufs zeigt die Konsole, wie es dem Gast geschmeckt hat:" },
        { art: "tabelle", kopf: ["Code", "Bedeutung"], zeilen: [
          ["`0`", "gegessen – alles gut"],
          ["`1`", "ungefangene Ananas"],
          ["`2`", "PizzaFehler – Syntax, `K0001`, `B0012`, `R0001`, `Q0004`, `A0001`, `P0011` …"],
          ["`3`", "Schrittlimit (`P0002`) – die Pizza ist noch im Ofen"],
          ["`39`", "Hawaii. Frag nicht."]
        ] },
        { art: "text", md: "Eine Ananas, die niemand fängt, beendet das Programm mit Exit-Code 1. Was vorher ausgegeben wurde, bleibt natürlich stehen:" },
        { art: "code", code: code`
Bote.sage(("Gleich gibt's Streit..."));
wirf neu StreitAnanas("Wer hat das letzte Stück gegessen?");
Bote.sage(("Das hier wird nie serviert."));
`, ausfuehrbar: true, exitCode: 1, tier: 1 },
        { art: "ausgabe", text: "Gleich gibt's Streit..." },
        { art: "hinweis", ton: "warnung", md: "In der Konsole erscheint: `Ungefangene Ananas – StreitAnanas: Wer hat das letzte Stück gegessen? (Zeile 2)`" },
        { art: "text", md: "Und wer den Ofen nie ausschaltet, landet nach 5 000 000 Schritten bei Exit-Code 3 (`P0002: Die Pizza ist noch im Ofen.`):" },
        { art: "code", code: code`
solange (ja) {
    // Nur noch fünf Minuten...
}
`, ausfuehrbar: false, tier: 1 }
      ]
    },
    {
      id: "hawaii",
      gruppe: "Ananas & Hawaii",
      ordnung: 490,
      titel: "Hawaii",
      tier: 1,
      inhalt: [
        { art: "text", md: "`hawaii` ist ein gültiger Typ. `Ananas` steht auf der Zutatenliste. Der Parser akzeptiert alles. Er ist höflich.\n\nSobald dein Quelltext so etwas auch nur *enthält*, meldet sich der Pizzaiolo noch vor dem Start mit **W0666** – er sagt nichts. Er schaut nur." },
        { art: "hinweis", ton: "warnung", md: "Was passiert, wenn du es wirklich tust, steht hier nicht. Manche Dinge muss man selbst erleben. Speichere vorher deine Arbeit (`Strg+S`)." },
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
        { art: "text", md: "Nur so viel: Exit-Code `39`, kein `verbrannt` und kein `rand` hilft. Danach bleibt die Küche erst mal kalt." }
      ]
    }
  );
})();
