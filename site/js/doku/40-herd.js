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
                ["`Koerper`","3D","`form` karton, `farbe` weiss, `glanz` 0.3, `leuchten` 0, `bild` karton, `schatten` ja, `belag` karton","3D-Körper aus einer Form; `glanz` 0 … 1, `leuchten` 0 … 1, `bild` = Textur, `schatten` = wirft Schatten, `belag` = Teil mit geteiltem Material (`Belag`)"],
                ["`Licht`","3D","`art` punkt (punkt|sonne), `farbe` weiss, `staerke` 1, `reichweite` 10, `schatten` ja","Punktlicht oder Sonne (`art`); höchstens 8 Punktlichter wirken (die nächsten zur Kamera)"],
                ["`Kamera`","3D","`sicht` 60, `nah` 0.1, `fern` 500, `aktiv` ja","Blickwinkel `sicht` in Grad; es zeichnet die aktive Kamera mit der kleinsten ID"],
                ["`Bewegung`","2D + 3D","`tempoX` 0, `tempoY` 0, `tempoZ` 0, `beschleunigungX` 0, `beschleunigungY` 0, `beschleunigungZ` 0, `drehtempo` 0, `daempfung` 0","je Takt: Tempo += Beschleunigung·dt, Dämpfung, Lage += Tempo·dt; `drehtempo` in Grad/s"],
                ["`Animation`","2D","`bilder` [], `proSekunde` 8, `schleife` ja, `laeuft` ja, `nummer` 1 – braucht Bild","blättert durch `bilder` (braucht ein `Bild` am selben Teil); ohne `schleife` stoppt sie am Ende"],
                ["`Partikel`","2D","`rate` 30, `lebensdauer` 1, `tempo` 80, `richtung` 270, `streuung` 360, `schwerkraft` 0, `groesse` 6, `groesseEnde` 0, `farbe` senf, `farbeEnde` tomate, `aktiv` ja, `saat` 0","Teilchen-Sprüher, die Teilchen leben in der Engine; `richtung` 0 = rechts, 90 = unten"],
                ["`Linie`","2D","`zuX` 100, `zuY` 0, `dicke` 2, `farbe` ofen, `rund` nein","Strecke von der Lage des Teils zum Endpunkt (`zuX`, `zuY`) relativ zum Teil; `rund` = runde Enden"],
                ["`Rahmen`","2D","`bildchen` karton, `kante` 4, `breite` 64, `hoehe` 32, `groesse` 1, `farbe` weiss","9-Slice-Tafel: Ecken (`kante` Bildchen-Pixel) bleiben scharf, Kanten und Mitte werden auf `breite` × `hoehe` gestreckt"],
                ["`Funken`","3D","`rate` 30, `lebensdauer` 1, `tempo` 2, `richtungX` 0, `richtungY` 1, `richtungZ` 0, `streuung` 30, `schwerkraft` 0, `groesse` 0.2, `groesseEnde` 0, `farbe` senf, `farbeEnde` tomate, `mischung` leuchtend, `weltlage` ja, `aktiv` ja, `saat` 0","3D-Teilchen, die zur Kamera schauen: Ausstoß im Kegel um die Richtung (`streuung` = halber Öffnungswinkel in Grad), `leuchtend` addiert sich zu Glut, `deckend` mischt (Rauch)"],
                ["`Gleiten`","beide","`was` x, `nach` 0, `dauer` 1, `kurve` sanft, `schleife` einmal, `laeuft` ja","Tween: eine Größe der Lage (`x`, `y`, `z`, `drehung`, `neigung`, `rollen`, `groesse`) gleitet vom aktuellen Wert nach `nach`; Kurven `linear`, `sanft`, `rein`, `raus`, `federnd`, `huepfend`; `einmal`, `wiederholen`, `pendeln`"],
                ["`Ablauf`","beide","`zeiten` [], `xWerte`, `yWerte`, `zWerte`, `drehWerte`, `groesseWerte` [], `kurve` linear, `schleife` ja, `tempo` 1, `zeit` 0, `laeuft` ja","Keyframes: zu den `zeiten` gelten die Werte aus den Wertelisten (Blech aus Zahlen), dazwischen `linear` oder `sanft`; `zeit` setzen springt"],
                ["`Belag`","3D","`farbe` weiss, `glanz` 0.3, `leuchten` 0, `bild` karton","geteiltes Material: jeder `Koerper` mit `belag` = dieses Teil zeichnet mit diesen Werten statt den eigenen; zeichnet selbst nichts"],
                ["`Fuehler`","beide","`form` auto, `breite`/`hoehe`/`tiefe`/`radius` 0, `versatzX`/`versatzY`/`versatzZ` 0, `gruppe` 1, `maske` 4294967295, `ausloeser` ja; nur lesen: `beruehrt`, `betreten`, `verlassen` (Bleche aus Teilen), `anzahl`","Kollider: meldet je Takt, welche anderen Fühler-Teile er berührt und welche neu dazugekommen bzw. weg sind – kein Rückruf, sondern Zustand wie die Tasten"],
                ["`Blick`","2D","`zoom` 1, `aktiv` ja, `festAb` 1000, `grenzeLinks`/`grenzeOben`/`grenzeRechts`/`grenzeUnten` 0","2D-Kamera: die Lage des Teils ist die Mitte der Sicht, `zoom` vergrößert, die Drehung dreht die Sicht; Teile mit `ebene` ≥ `festAb` bleiben als HUD stehen; Grenzen halten die Sicht in der Welt"],
                ["`Leine`","beide","`ziel` karton, `abstandX`/`abstandY`/`abstandZ` 0, `weich` 0, `totzone` 0, `schaue` nein","Folgekamera: das Teil folgt nach jedem Takt dem Ziel mit Abstand – starr oder weich, mit Totzone; in 3D schaut es auf Wunsch aufs Ziel"]
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
    },
    {
      id: "herd-ausbau",
      gruppe: HERD,
      ordnung: 599,
      titel: "Ausbau: neue Komponenten",
      tier: 1,
      inhalt: [
        { art: "kurz", md: "Nach den Komponenten der ersten Fassung kommen nach und nach neue Bausteine dazu – jeder ist eine eingebaute Klasse wie alle anderen (`neu …`, `teil.mit(…)`, Getter und Setter). Hier steht je Ausbaustufe, was sie kann." },
        {
          art: "details",
          titel: "Linie und Rahmen",
          inhalt: [
            { art: "text", md: "**`Linie`** zeichnet eine Strecke von der Lage des Teils zum Endpunkt (`zuX`, `zuY`) – relativ zum Teil, also dreht und skaliert sie mit ihm. `dicke` ist die Strichbreite, `rund: ja` gibt runde Enden. **`Rahmen`** macht aus einem kleinen Bildchen eine Tafel beliebiger Größe (9-Slice): die vier Ecken (`kante` Bildchen-Pixel breit) bleiben scharf, Kanten und Mitte werden auf `breite` × `hoehe` gestreckt; `groesse` = Bildschirmpixel je Bildchen-Pixel der Ecken, `farbe` tönt. Beide treffen mit `trifft` als Rechteck." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Linien und Rahmen","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"4979bea0edd79fed","paket":"697051380670f5ea"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Linien und Rahmen\", breite: 320, hoehe: 180);",
                "Bildchen karte = neu Bildchen([\"kkkkkk\", \"kttttk\", \"ktmmtk\", \"ktmmtk\", \"kttttk\", \"kkkkkk\"]);",
                "Teil tafel = herd.gruppe(160, 90);",
                "tafel.mit(neu Rahmen(bildchen: karte, kante: 2, breite: 240, hoehe: 120, groesse: 4));   // Ecken 8 × 8 Pixel, Rest gestreckt",
                "Teil zeiger = herd.gruppe(160, 90);",
                "Linie l = zeiger.mit(neu Linie(zuX: 80, zuY: -30, dicke: 6, farbe: \"ofen\", rund: ja));",
                "zeiger.mit(neu Bewegung(drehtempo: 90));                                                // das Teil dreht, die Linie dreht mit",
                "herd.backe();",
                "Bote.sage((l + \" \" + l.zuX() + \" \" + l.dicke() + \" \" + zeiger.drehung().runden(1) + \" \" + tafel.rahmen().breite()));"
              )
            },
            { art: "ausgabe", text: z("Linie(4) 80 6 6 240") },
            { art: "text", md: "Ein ganzes Beispiel ist die **Pizza-Uhr** unter *Beispiele → Herd*: Zeiger als Linien auf einer Rahmen-Tafel; in jedem Takt stellt das Programm alle drei Zeiger nach `Uhr.echt() + Uhr.zone()` – die Uhr geht also richtig, in deiner Zeitzone." }
          ]
        },
        {
          art: "details",
          titel: "Funken: Teilchen im Raum",
          inhalt: [
            { art: "text", md: "**`Funken`** ist der Teilchen-Sprüher für 3D (zu `Partikel` in 2D): Je Sekunde entstehen `rate` Teilchen am Teil und fliegen mit `tempo` Einheiten je Sekunde in einem Kegel um die Richtung (`richtungX`, `richtungY`, `richtungZ`, in den Achsen des Teils) – `streuung` ist der halbe Öffnungswinkel in Grad (0 = gerader Strahl, 180 = in alle Richtungen). `schwerkraft` zieht nach unten (negativ: sie steigen wie in warmer Luft), Größe und Farbe laufen über die `lebensdauer` von `groesse`/`farbe` zu `groesseEnde`/`farbeEnde`. Die Teilchen schauen immer zur Kamera. `mischung: \"leuchtend\"` addiert das Licht (Glut, Funken, Magie – wo sie sich überlagern, wird es heller), `\"deckend\"` mischt normal (Rauch, Staub; die Engine zeichnet von hinten nach vorn). Mit `weltlage: nein` wandern die Teilchen mit dem Teil mit. Höchstens 10 000 Teilchen je Sprüher." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Funken","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"f9b9e9657f3f07d7","paket":"81f5fd5067834b47"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Funken\", breite: 320, hoehe: 180);",
                "herd.himmel(\"#121833\", \"#5b3b4c\");",
                "Teil esse = herd.raum(0, 0, 0);",
                "Funken f = esse.mit(neu Funken(rate: 60, tempo: 3, streuung: 25, schwerkraft: 1.5, farbe: \"#fff2b8\", farbeEnde: \"#ff5a1a00\"));",
                "herd.raum(0, 0.5, 0).mit(neu Funken(mischung: \"deckend\", rate: 8, lebensdauer: 2, tempo: 0.8, groesse: 0.4, groesseEnde: 1.2, farbe: \"#6d646a90\", farbeEnde: \"#3c364400\"));",
                "herd.kamera().setzeLage(0, 2, 8).schaueAuf(0, 1.5, 0);",
                "herd.backe();",
                "Bote.sage((f + \" \" + f.rate() + \" \" + f.mischung() + \" \" + f.streuung() + \" \" + esse.funken().weltlage()));"
              )
            },
            { art: "ausgabe", text: z("Funken(3) 60 leuchtend 25 ja") },
            { art: "text", md: "Ein ganzes Beispiel sind die **Ofenfunken** unter *Beispiele → Herd*: ein Steinofen bei Nacht mit Glutfunken aus Maul und Schlot und deckendem Rauch; die Leertaste legt Holz nach." }
          ]
        },
        {
          art: "details",
          titel: "Gleiten und Ablauf: Tweens und Keyframes",
          inhalt: [
            { art: "text", md: "**`Gleiten`** bewegt **eine** Größe der Lage – `was`: `x`, `y`, `z`, `drehung`, `neigung`, `rollen` oder `groesse` (alle Achsen) – in `dauer` Sekunden vom Wert, den sie im ersten Takt hat, nach `nach`. Die `kurve` bestimmt das Gefühl: `linear` gleichmäßig, `sanft` weich an beiden Enden, `rein` langsam los, `raus` sanft ankommen, `federnd` schwingt über das Ziel hinaus und federt zurück, `huepfend` prallt am Ziel ab. `schleife: \"einmal\"` endet exakt auf `nach` und setzt `laeuft` auf nein – `setzeNach(…)` und `setzeLaeuft(ja)` starten einen neuen Lauf vom aktuellen Wert; `wiederholen` beginnt jede Runde von vorn, `pendeln` läuft hin und zurück. Je Teil gibt es ein Gleiten; für mehrere Größen zugleich nimm Kind-Teile oder einen Ablauf." },
            { art: "text", md: "**`Ablauf`** spielt **Keyframes**: `zeiten` ist ein Blech aus Zahlen (Sekunden, aufsteigend), dazu je Größe eine Werteliste – `xWerte`, `yWerte`, `zWerte`, `drehWerte`, `groesseWerte`. Zur Zeit `zeiten[i]` gilt der i-te Wert, dazwischen wird `linear` oder `sanft` übergeblendet; eine leere Liste lässt die Größe in Ruhe, eine kürzere hält ihren letzten Wert. `tempo` (negativ = rückwärts) und `schleife` steuern den Lauf, ohne Schleife hält er am Ende an; `setzeZeit(t)` springt an jede Stelle." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Gleiten","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"057555b4939bb88b","paket":"0565a070c4322ac2"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Gleiten\", breite: 320, hoehe: 180);",
                "Teil tafel = herd.rechteck(-60, 60, 100, 50, farbe: \"teig\", rundung: 8);",
                "Gleiten g = tafel.mit(neu Gleiten(nach: 160, dauer: 0.8, kurve: \"federnd\"));",
                "Teil bote = herd.kreis(20, 150, 8, farbe: \"tomate\");",
                "bote.mit(neu Ablauf(zeiten: [0, 1, 2], xWerte: [20, 300, 20], yWerte: [150, 120, 150], kurve: \"sanft\"));",
                "herd.backe();",
                "Bote.sage((g + \" \" + g.kurve() + \" \" + g.laeuft() + \" \" + bote.ablauf().zeiten() + \" \" + bote.x().runden(1)));"
              )
            },
            { art: "ausgabe", text: z("Gleiten(3) federnd ja [0, 1, 2] 23.6") },
            { art: "text", md: "Ein ganzes Beispiel ist die **Speisekarte** unter *Beispiele → Herd*: Die Menütafel gleitet federnd herein, die Zeilen folgen nacheinander, Lampen pendeln, und der Bote läuft seinen Ablauf-Pfad; die Leertaste schiebt die Karte weg und wieder her." }
          ]
        },
        {
          art: "details",
          titel: "Belag: ein Material für viele Körper",
          inhalt: [
            { art: "text", md: "**`Belag`** ist ein geteiltes Material: `farbe`, `glanz`, `leuchten` und `bild` wie beim `Koerper` – aber an einem eigenen Teil, meist einem leeren `herd.raum()`. Jeder Körper, dessen Feld **`belag`** auf dieses Teil zeigt (`koerper().setzeBelag(b.teil())`), zeichnet mit den Werten des Belags statt mit seinen eigenen. Änderst du einen Wert am Belag, ändern sich alle diese Körper auf einmal. Die eigenen Werte des Körpers bleiben erhalten: Mit `setzeBelag(karton)`, `ohne(\"Belag\")` am Belag-Teil oder wenn es entfernt wird, zeigt er sie wieder – ohne Fehler." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Beläge","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"e3e71933dc02b517","paket":"f41f26b1ed3f8f18"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Beläge\", breite: 320, hoehe: 180);",
                "Belag tomate = herd.raum().mit(neu Belag(farbe: \"tomate\", glanz: 0.7));",
                "für (salami i = 0; i < 5; i++) {",
                "    herd.koerper(Form.wuerfel(), i * 1.5 - 3, 0.5, 0).koerper().setzeBelag(tomate.teil());",
                "}",
                "herd.backe(() -> { falls (herd.bildnummer() == 2) { tomate.setzeFarbe(\"basilikum\"); } });   // alle fünf werden grün",
                "Bote.sage((tomate + \" \" + tomate.farbe() + \" \" + tomate.glanz()));"
              )
            },
            { art: "ausgabe", text: z("Belag(3) basilikum 0.7") },
            { art: "text", md: "Ein ganzes Beispiel sind die **Beläge** unter *Beispiele → Herd*: 60 Würfel, drei Beläge; die Leertaste wechselt die Sorte des Tomaten-Belags, und alle seine Würfel ändern sich." }
          ]
        },
        {
          art: "details",
          titel: "Fühler: wer berührt wen?",
          inhalt: [
            { art: "text", md: "Ein **`Fuehler`** macht ein Teil zum Kollider. Nach jedem Takt (nach allen Bewegungen) prüft die Engine alle Fühler gegeneinander und schreibt drei **Lesefelder**: `beruehrt()` – alle Teile, deren Fühler sich gerade mit diesem überlappen (Blech aus Teilen, nach ID), `betreten()` – die seit dem letzten Takt neu dazugekommen sind, `verlassen()` – die nicht mehr berührt werden; `anzahl()` zählt `beruehrt`. Es gibt keinen Rückruf: Du fragst im nächsten Takt nach, genau wie bei `herd.taste(…)`. Setzen lassen sich die Lesefelder nicht (`Fuehler.betreten kann man nur lesen.`), ein entferntes Teil fällt aus den Listen heraus." },
            { art: "text", md: "Die Form: `form: \"auto\"` nimmt die Hülle wie `trifft` (Kreis bleibt Kreis, sonst Rechteck bzw. Kasten in Weltlage). `\"kreis\"`/`\"kugel\"` mit `radius`, `\"rechteck\"`/`\"kasten\"` mit `breite`, `hoehe`, `tiefe` – jede 0 nimmt die Größe aus der Hülle; `versatzX/Y/Z` verschiebt die Form (dreht und wächst mit dem Teil). Gedrehte Rechtecke werden achsenparallel umschlossen. **Gruppen und Masken:** `gruppe` ist eine Zahl 1 … 32, `maske` die Summe der Gruppen-Bits, die der Fühler spürt (Gruppe 1 = 1, Gruppe 2 = 2, Gruppe 3 = 4, …; Standard: alle). Ein Paar zählt nur, wenn **beide** einander spüren, beide sichtbar sind und im gleichen Raum liegen. `ausloeser: nein` macht den Fühler später für die Physik fest." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Fühler","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"e353b0124331e7cd","paket":"62948a0ad27a5ae8"},
                {"art":"bild","bildnummer":8,"szene":"0cd44765a40e4ce3","paket":"ffe267a9baf3e2e0"},
                {"art":"bild","bildnummer":12,"szene":"5ccfa19ba08fa6d7","paket":"075fea178a1b718c"},
                {"art":"bild","bildnummer":16,"szene":"4db4e06c6d49975b","paket":"7518abc4a750ac5d"},
                {"art":"bild","bildnummer":20,"szene":"f3c79a5206b48ed7","paket":"220370fddea974a1"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Fühler\", breite: 320, hoehe: 180);",
                "Teil bote = herd.kreis(40, 90, 14, farbe: \"tomate\");",
                "Fuehler sinn = bote.mit(neu Fuehler(gruppe: 1, maske: 2));",
                "bote.mit(neu Bewegung(tempoX: 240));",
                "Teil muenze = herd.kreis(120, 90, 8, farbe: \"senf\");",
                "muenze.mit(neu Fuehler(gruppe: 2, maske: 1));",
                "salami punkte = 0;",
                "herd.backe(() -> {",
                "  für (Teil t : sinn.betreten()) { t.entferne(); punkte++; }",
                "});",
                "Bote.sage((sinn + \" \" + punkte + \" \" + muenze.entfernt() + \" \" + sinn.anzahl() + \" \" + sinn.form()));"
              )
            },
            { art: "ausgabe", text: z("Fuehler(3) 1 ja 0 auto") },
            { art: "text", md: "Ein ganzes Beispiel sind die **Münzen** unter *Beispiele → Herd*: Der Bote sammelt mit den Pfeiltasten Münzen ein, eine Olive kullert hin und her und kostet drei Münzen." }
          ]
        },
        {
          art: "details",
          titel: "Blick und Leine: Kamera für große Welten",
          inhalt: [
            { art: "text", md: "Ohne Kamera ist das Spielfeld die ganze 2D-Welt. Ein **`Blick`** macht ein Teil zur 2D-Kamera: Seine Lage ist ab dann die **Mitte der Sicht** – liegt der Blick bei (1000, 500), steht dieser Weltpunkt in der Fenstermitte, und die Welt darf beliebig groß sein. `zoom` vergrößert (2 = doppelt so groß, 0.5 = Übersicht), die Drehung des Teils dreht die Sicht. Alles mit **`ebene` ≥ `festAb`** (Standard 1000) bleibt fest im Fenster stehen – so baust du Punkteanzeige, Leisten und Knöpfe (jedes HUD-Teil braucht seine eigene Ebene, sie vererbt sich nicht). Mit den Grenzen `grenzeLinks`, `grenzeOben`, `grenzeRechts`, `grenzeUnten` (nicht alle 0) bleibt die Sicht in der Welt: Am Rand hält das Bild an, auch wenn das Teil weiterläuft. Es gilt der aktive Blick mit der kleinsten ID." },
            { art: "text", md: "Eine **`Leine`** lässt ein Teil einem `ziel` folgen – nach jedem Takt, nachdem sich alles bewegt hat. `abstandX/Y/Z` legt fest, wo es relativ zum Ziel steht; `weich: 0` folgt starr, größere Werte ziehen weich nach (`weich` ist der Anteil des Wegs, der nach einer Sekunde noch übrig ist, also 0.05 = schnell, 0.5 = gemächlich). Mit `totzone` darf sich das Ziel ein Stück bewegen, ohne dass die Kamera ruckelt. In 3D hängt man die Leine an `herd.kamera()`, `schaue: ja` richtet die Kamera dabei aufs Ziel: `herd.kamera().mit(neu Leine(ziel: auto, abstandY: 3, abstandZ: 8, weich: 0.05, schaue: ja));`" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Blick","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"86445d99e7e30012","paket":"e74176645fbb66a5"},
                {"art":"bild","bildnummer":8,"szene":"ae5369bd8bad66c4","paket":"92d4323bbf357de0"},
                {"art":"bild","bildnummer":12,"szene":"946f1e7f002e3849","paket":"4179e1abb1620928"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Blick\", breite: 320, hoehe: 180);",
                "für (salami i = 0; i < 20; i++) { herd.rechteck(i * 100, 60 + (i % 3) * 30, 60, 40, farbe: \"teig\"); }   // Stadt, 2000 breit",
                "Teil roller = herd.kreis(20, 90, 10, farbe: \"tomate\");",
                "roller.mit(neu Bewegung(tempoX: 240));",
                "Teil kamera = herd.gruppe(160, 90);",
                "Blick b = kamera.mit(neu Blick(zoom: 1.5, grenzeRechts: 2000, grenzeUnten: 180));",
                "kamera.mit(neu Leine(ziel: roller, weich: 0.1));",
                "herd.text(\"Punkte: 7\", 8, 6, farbe: \"ofen\").setzeEbene(1000);                                // HUD bleibt stehen",
                "herd.backe();",
                "Bote.sage((b + \" \" + b.zoom() + \" \" + b.festAb() + \" \" + roller.x() + \" \" + kamera.x().runden(1)));   // die Kamera zieht weich nach"
              )
            },
            { art: "ausgabe", text: z("Blick(24) 1.5 1000 68 118.6") },
            { art: "text", md: "Ein ganzes Beispiel ist die **Weite Welt** unter *Beispiele → Herd*: Der Lieferroller fährt durch eine Stadt, die dreimal so breit und doppelt so hoch ist wie das Fenster, die Kamera hängt an seiner Leine, und die Lieferungen oben stehen fest; die Leertaste zoomt heraus." }
          ]
        }
      ]
    }
  );
})();
