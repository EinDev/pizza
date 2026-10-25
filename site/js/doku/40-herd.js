/* pizza v3.1 – Doku: Herd (Spiele) (591–598) – Doku v2; Bilder he-*, Beispiele site/beispiele/herd/<projekt>/ (Projektordner, K-144) */
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
            { art: "text", md: "Unter **Beispiele → Herd (Spiele)** liegen zum Anschauen und Weiterbauen:\n\n- **Teigfänger** (2D): Fang mit deiner Pizza die Beläge vor dem Steinofen – aber keine Ananas! Sprites als PNG-Dateien mit Animation, Funken und Spritzer als Partikel, Ebenen, eine wackelnde Ziegelwand.\n- **Teigball** (3D): Rolle eine Teigkugel über die Riesenpizza und sammle acht Beläge. Abendsonne mit Schatten, Steinöfen aus Ziegeln, eine Margherita als Textur, Nebel, eine weich folgende Kamera und ein HUD.\n- **Pizzeria** (3D): eine kleine Küche mit Gastraum aus fertigen **3D-Modellen** (glTF von Kenney, CC0) – Ofentür, Kühlschrank und Pizzakarton gehen auf, alle Tische wechseln mit einem Belag die Farbe (siehe *Ausbau: neue Komponenten → 3D-Modelle*).\n- **Hallo Herd**, **Drehender Würfel** und **Steuerung** als kleine Lernbeispiele.\n\nTeigfänger und Teigball sind **Projekte aus mehreren Dateien** (Herd, Welt, Figuren, Anzeige – siehe *Projekte und Dateien*), ihre Bilder liegen als PNG und JPEG im Ordner `bilder/` und werden mit `Bildchen.laden` geladen (siehe *Formen und Bildchen*)." },
            { art: "bild", src: "img/doku/he-teigfaenger.png", alt: "Teigfänger: Vor einer Ziegelwand mit einem Steinofen, in dem Flammen auf Holzscheiten lodern, fallen Beläge herab; unten fängt eine Pizza auf einem hölzernen Schieber sie auf. Oben links die Punkte, rechts drei Herzen, vorn eine Holztheke.", unterschrift: "Teigfänger – das 2D-Spiel aus den Beispielen." }
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
        { art: "bild", src: "img/doku/he-teigball.png", alt: "Teigball: Eine Teigkugel aus Hefeteig rollt über eine riesige Margherita mit Tomatensoße, zerlaufenem Mozzarella und knuspriger Kruste, darauf Salami, Oliven, Basilikum und Champignons. Ringsum Steinöfen aus Ziegeln mit glühendem Maul und Laternen auf einer rot-weiß karierten Tischdecke; Abendhimmel und Nebel am Horizont, oben ein HUD.", unterschrift: "Teigball – das 3D-Spiel aus den Beispielen: Sonne mit Schatten, Punktlichter in den Öfen, Nebel, Himmelsverlauf, Texturen aus Bilddateien, Durchsichtiges, 2D-Anzeige darüber." },
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
                ["`herd.licht(x, y, z, farbe:, reichweite: 10)`", "Punktlicht – beliebig viele wirken gleichzeitig (hunderte kosten kaum mehr als acht); mit `licht().setzeKegel(30)` wird es ein Spot, der dorthin leuchtet, wohin sein Teil schaut (`schaueAuf`)"],
                ["`herd.umgebung(f, staerke: 0.35)`", "Grundhelligkeit, damit Schatten nicht schwarz werden"],
                ["`herd.himmel(oben, unten)`", "Verlauf hinter der Szene: Zenit → Horizont"],
                ["`herd.nebel(f, von, bis)`", "ab Abstand `von` verblasst alles bis `bis` in Farbe `f` – nimm die Horizontfarbe, dann verschmilzt der Boden mit dem Himmel"],
                ["`koerper(…, leuchten: 1)`", "leuchtet selbst (Lampen, Glut), unabhängig vom Licht; mit `koerper().setzeStrahlen(6)` und einer `Stimmung` heller als Weiß, mit Bloom"],
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
        { art: "bild", src: "img/doku/he-steuerung.png", alt: "Ein Pizzabote mit roter Mütze und Pizzakarton läuft über eine Blumenwiese vor grünen Hügeln, im Himmel liegen Basilikumblätter, die per Mausklick hingelegt wurden. Oben steht die Mausposition.", unterschrift: "Das Beispiel „Steuerung“: Pfeiltasten laufen, Leertaste springt, Klick legt ein Blatt." },
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
                ["`herd.maus(k = 1)` / `herd.klick(k = 1)`", "Maustaste gehalten / gerade gedrückt (1 links, 2 rechts, 3 Mitte); Tippen auf dem Handy zählt als 1"],
                ["`herd.mausFangen(an = ja)`", "Maus fangen wollen (`nein`: freigeben) – gefangen wird sie mit dem nächsten Klick ins Bild"],
                ["`herd.mausGefangen()`", "`ja`, solange die Maus gefangen ist (Esc oder Fensterwechsel geben sie frei)"],
                ["`herd.mausDX()`, `herd.mausDY()`", "Rohbewegung der Maus in diesem Takt in Pixeln (rechts/unten positiv) – auch ohne Fang"],
                ["`herd.mausrad()`", "Mausrad in diesem Takt in Rasten (positiv = zu dir hin gedreht)"]
              ]
            },
            { art: "text", md: "**Tastennamen** wie bei der `Tastatur` der Theke: `Links`, `Rechts`, `Hoch`, `Runter`, `Leertaste`, `Enter`, `Escape`, Buchstaben wie getippt (`a`, `w` …; mit Umschalt `A`, `W`). Dazu kennt der Herd die **Modifikatoren** `Umschalt`, `Strg` und `Alt` als eigene Tasten – `herd.taste(\"Umschalt\")` ist also „rennen“. Der Eingabezustand kommt mit jedem Takt vom Fenster – deshalb laufen aufgenommene Spiele in Tests immer gleich ab." }
          ]
        },
        { art: "text", md: "**Umsehen wie im Ego-Shooter:** `herd.mausFangen()` sagt dem Fenster, dass das Spiel die Maus fangen möchte. Der nächste Klick ins Bild fängt sie (der Klick selbst kommt wie jeder Klick an, `herd.mausGefangen()` ist in diesem Takt noch `nein`): Der Zeiger verschwindet und bleibt im Fenster, und `mausDX()`/`mausDY()` liefern, wie weit die Maus in diesem Takt bewegt wurde – ohne Rand, du kannst dich beliebig oft im Kreis drehen. **Esc** gibt die Maus frei (Esc geht dann nicht ans Spiel), ein neuer Klick fängt sie wieder. Im Browser und in der EXE verhält sich das gleich; in Tests stehen Bewegung und Fang mit in den `.ereignisse`." },
        {
          art: "code",
          ausfuehrbar: true,
          tier: 2,
          uiEreignisse: [{"typ":"takt","anzahl":1},{"typ":"takt","anzahl":2,"gefangen":true,"bewegung":[120,-40]},{"typ":"takt","anzahl":1,"bewegung":[80,0]}],
          herdErwartet: [
            {"art":"mausfang","an":true},
            {"art":"fenster","titel":"Umsehen","breite":320,"hoehe":180},
            {"art":"bild","bildnummer":1,"szene":"1ab1a3e156f6d321","paket":"671b0c82ae6ed358"},
            {"art":"bild","bildnummer":3,"szene":"5060c0d9630a1ad2","paket":"2cf5720a54215104"},
            {"art":"bild","bildnummer":4,"szene":"5626a454274d4d6c","paket":"5a459133a6188a1f"}
          ],
          code: z(
            "Herd herd = neu Herd(\"Umsehen\", breite: 320, hoehe: 180);",
            "herd.himmel(\"himmel\", \"mozzarella\");",
            "Teil kiste = herd.koerper(Form.wuerfel(), 0, 0.5, -4, farbe: \"tomate\");",
            "herd.sonne();",
            "funghi gier = 0;      // links/rechts in Grad",
            "funghi nick = 0;      // hoch/runter in Grad",
            "herd.mausFangen();    // Klick ins Bild fängt die Maus, Esc gibt sie frei",
            "herd.backe(() -> {",
            "    gier = gier + herd.mausDX() * 0.15;",
            "    nick = Mathe.max(-85, Mathe.min(85, nick - herd.mausDY() * 0.15));",
            "    funghi g = Mathe.bogen(gier);",
            "    funghi n = Mathe.bogen(nick);",
            "    herd.kamera().setzeLage(0, 1.6, 0).schaueAuf(Mathe.sin(g) * Mathe.cos(n), 1.6 + Mathe.sin(n), -Mathe.cos(g) * Mathe.cos(n));",
            "});",
            "Bote.sage((\"Blick \" + gier + \"° / \" + nick + \"°, gefangen: \" + herd.mausGefangen()));"
          )
        },
        { art: "ausgabe", text: "Blick 30° / 6°, gefangen: ja" }
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
                ["`Licht`","3D","`art` punkt (punkt|sonne), `farbe` weiss, `staerke` 1, `reichweite` 10, `schatten` ja, `kegel` 0, `kegelRand` 0.25, `schattenGuete` aus, `schattenWeich` 1, `kaskaden` 1, `schattenWeite` 0","Punktlicht, Spot (`kegel` > 0: halber Öffnungswinkel, leuchtet entlang −z des Teils) oder Sonne (`art`); beliebig viele Punktlichter und Spots wirken (bis 4096 sichtbare, je Zelle der Sicht 255); bis 8 werfen mit `schattenGuete` Schatten, die Sonne mit `kaskaden` in Stufen"],
                ["`Kamera`","3D","`sicht` 60, `nah` 0.1, `fern` 500, `aktiv` ja","Blickwinkel `sicht` in Grad; es zeichnet die aktive Kamera mit der kleinsten ID"],
                ["`Bewegung`","2D + 3D","`tempoX` 0, `tempoY` 0, `tempoZ` 0, `beschleunigungX` 0, `beschleunigungY` 0, `beschleunigungZ` 0, `drehtempo` 0, `daempfung` 0","je Takt: Tempo += Beschleunigung·dt, Dämpfung, Lage += Tempo·dt; `drehtempo` in Grad/s"],
                ["`Animation`","2D","`bilder` [], `proSekunde` 8, `schleife` ja, `laeuft` ja, `nummer` 1 – braucht Bild","blättert durch `bilder` (braucht ein `Bild` am selben Teil); ohne `schleife` stoppt sie am Ende"],
                ["`Partikel`","2D","`rate` 30, `lebensdauer` 1, `tempo` 80, `richtung` 270, `streuung` 360, `schwerkraft` 0, `groesse` 6, `groesseEnde` 0, `farbe` senf, `farbeEnde` tomate, `aktiv` ja, `saat` 0","Teilchen-Sprüher, die Teilchen leben in der Engine; `richtung` 0 = rechts, 90 = unten"],
                ["`Linie`","2D","`zuX` 100, `zuY` 0, `dicke` 2, `farbe` ofen, `rund` nein","Strecke von der Lage des Teils zum Endpunkt (`zuX`, `zuY`) relativ zum Teil; `rund` = runde Enden"],
                ["`Rahmen`","2D","`bildchen` karton, `kante` 4, `breite` 64, `hoehe` 32, `groesse` 1, `farbe` weiss","9-Slice-Tafel: Ecken (`kante` Bildchen-Pixel) bleiben scharf, Kanten und Mitte werden auf `breite` × `hoehe` gestreckt"],
                ["`Funken`","3D","`rate` 30, `lebensdauer` 1, `tempo` 2, `richtungX` 0, `richtungY` 1, `richtungZ` 0, `streuung` 30, `schwerkraft` 0, `groesse` 0.2, `groesseEnde` 0, `farbe` senf, `farbeEnde` tomate, `mischung` leuchtend, `weltlage` ja, `aktiv` ja, `saat` 0; Regen: `streckung` 0, `licht` 0, `volumen` 0, `aufschlag` nein, `boden` 0, `spritzer` 3, `regen` nein; Aufprall: `kollision` keine, `aufprall` vergehen, `abprall` 0.3","3D-Teilchen, die zur Kamera schauen: Ausstoß im Kegel um die Richtung (`streuung` = halber Öffnungswinkel in Grad), `leuchtend` addiert sich zu Glut, `deckend` mischt (Rauch); Regen: Striche entlang der Bewegung, im Licht der Szene, Volumen um das Teil, Spritzer am Boden, Rate × `Stimmung.regen`; Aufprall auf einer Ebene oder an festen Fühlern und Gelände: vergehen, abprallen oder liegen bleiben"],
                ["`Gleiten`","beide","`was` x, `nach` 0, `dauer` 1, `kurve` sanft, `schleife` einmal, `laeuft` ja","Tween: eine Größe der Lage (`x`, `y`, `z`, `drehung`, `neigung`, `rollen`, `groesse`) gleitet vom aktuellen Wert nach `nach`; Kurven `linear`, `sanft`, `rein`, `raus`, `federnd`, `huepfend`; `einmal`, `wiederholen`, `pendeln`"],
                ["`Ablauf`","beide","`zeiten` [], `xWerte`, `yWerte`, `zWerte`, `drehWerte`, `groesseWerte` [], `kurve` linear, `schleife` ja, `tempo` 1, `zeit` 0, `laeuft` ja","Keyframes: zu den `zeiten` gelten die Werte aus den Wertelisten (Blech aus Zahlen), dazwischen `linear` oder `sanft`; `zeit` setzen springt"],
                ["`Belag`","3D","`farbe` weiss, `glanz` 0.3, `leuchten` 0, `bild` karton","geteiltes Material: jeder `Koerper` mit `belag` = dieses Teil zeichnet mit diesen Werten statt den eigenen; zeichnet selbst nichts"],
                ["`Fuehler`","beide","`form` auto, `breite`/`hoehe`/`tiefe`/`radius` 0, `versatzX`/`versatzY`/`versatzZ` 0, `gruppe` 1, `maske` 4294967295, `ausloeser` ja; nur lesen: `beruehrt`, `betreten`, `verlassen` (Bleche aus Teilen), `anzahl`","Kollider: meldet je Takt, welche anderen Fühler-Teile er berührt und welche neu dazugekommen bzw. weg sind – kein Rückruf, sondern Zustand wie die Tasten"],
                ["`Blick`","2D","`zoom` 1, `aktiv` ja, `festAb` 1000, `grenzeLinks`/`grenzeOben`/`grenzeRechts`/`grenzeUnten` 0; nur lesen: `mausX`, `mausY`","2D-Kamera: die Lage des Teils ist die Mitte der Sicht, `zoom` vergrößert, die Drehung dreht die Sicht; Teile mit `ebene` ≥ `festAb` bleiben als HUD stehen; Grenzen halten die Sicht in der Welt; `mausX`/`mausY` = die Maus in Weltkoordinaten"],
                ["`Leine`","beide","`ziel` karton, `abstandX`/`abstandY`/`abstandZ` 0, `weich` 0, `totzone` 0, `schaue` nein","Folgekamera: das Teil folgt nach jedem Takt dem Ziel mit Abstand – starr oder weich, mit Totzone; in 3D schaut es auf Wunsch aufs Ziel"],
                ["`Wucht`","2D","`art` dynamisch, `masse` 1, `tempoX`/`tempoY` 0, `schwerkraft` 0, `daempfung` 0, `abprall` 0, `reibung` 0.2, `stossX`/`stossY` 0; nur lesen: `amBoden`","Physik: Schwerkraft, Stöße, Abprall, Reibung, Stapeln – braucht einen `Fuehler` mit `ausloeser: nein`; ein solcher Fühler ohne Wucht ist eine feste Wand"],
                ["`Vieleck`","2D","`punkte` [], `farbe` weiss, `umriss` 0","gefülltes Vieleck aus `[x1, y1, x2, y2, …]` relativ zum Teil (3 … 256 Punkte, ohne Selbstüberschneidung – sonst wird nichts gezeichnet); `umriss` > 0 = nur ein Rand dieser Dicke"],
                ["`Gelaende`","3D","`hoehen` [], `spalten` 32, `zeilen` 32, `weite` 1, `farbe` basilikum, `glanz` 0.1, `bild` karton, `schatten` ja","Gelände aus einer Höhenkarte: die Engine baut daraus ein Netz mit glatten Normalen (neu nur, wenn sich Höhen, Seiten oder Weite ändern) und zeichnet es wie einen Körper mit Schatten; `bild` liegt einmal über der ganzen Fläche"],
                ["`Vorlage`","beide","`name` \"\"","Prefab: das Teil ruht samt Kindern (keine Systeme, unsichtbar, trifft nichts); `kopie()` macht daraus wache Teile ohne Vorlage"],
                ["`Fliesen`","2D","`bilder` [], `spalten` 16, `zeilen` 9, `karte` [], `kachel` 32, `fest` []","Kachelkarte: `karte` zeilenweise von oben, Kachel n zeigt `bilder[n]` (0 = leer); Lage = **obere linke Ecke**; Nummern in `fest` sind für `Wucht` feste Wände und Böden; gezeichnet wird nur, was zu sehen ist"],
                ["`Kulisse`","beide","`aktiv` ja, `name` \"\"","Szenenwechsel: mit `aktiv: nein` ruht das Teil samt Kindern wie eine Vorlage (unsichtbar, keine Systeme, Kamera/Blick/Licht darin zählen nicht); `setzeAktiv(ja)` schaltet die Kulisse wieder an"],
                ["`Belag` (Material)","3D","`relief` karton, `kachel` 0, `abbildung` uv, `modell` klassisch, `metall` 0, `nass` 0 (zusätzlich zu Farbe, Glanz, Leuchten, Bild, strahlen)","Oberflächen: Relief-Bild (Normale + Rauheit), Kachelung in uv oder Weltmaß, physikalisches Licht (`modell: \"pbr\"`), Metall, Nässe mit Pfützen"],
                ["`Belag` (Karten)","3D","`normalKarte` karton, `normalStaerke` 1, `stoffKarte` karton, `leuchtKarte` karton, `leuchtFarbe` weiss, `schwelle` 0, `beidseitig` nein","Normal-, Stoff- (Verdeckung/Rauheit/Metall) und Leucht-Karte, Ausschnitt (Alpha-Clip, auch im Schatten), einseitig/beidseitig; Modelle bringen ihre Karten mit (H-K26)"],
                ["`Stimmung`","3D","`belichtung` 1, `bloom` 0, `bloomSchwelle` 1, `bloomWeite` 0.7, `nebelDichte` 0, `nebelHoehe` 0, `nebelAbfall` 0.25, `nebelFarbe` #1c1a2a, `saettigung` 1, `vignette` 0, `koernung` 0, `spiegelung` 0, `spiegelHoehe` 0, `regen` 0, `spiegelGuete` einfach, `verdeckung` 0, `verdeckungWeite` 0.5, `bildspiegel` 0","Bildlook: HDR mit Belichtung und filmischer Tonkurve, Bloom, Höhennebel, Sättigung, Vignette, Filmkorn, Spiegelung nasser Böden (einfach oder voll), Regenstärke (Pfützenringe, Rinnsale), Verdeckung (SSAO) und Bildraum-Spiegelung (SSR); es gilt die wache mit der kleinsten Teil-ID"],
                ["`Himmelszelt`","3D","`bilder` [], `oben` himmel, `horizont` mozzarella, `boden` teig, `sonnenscheibe` 0, `sterne` 0","Skybox: Verlauf mit Sonnenscheibe und Sternen oder sechs Seiten aus Bildchen; ersetzt `herd.himmel(…)`, es gilt das wache mit der kleinsten Teil-ID"],
                ["`Taster`","2D","`inhalt` \"\", `breite` 120, `hoehe` 36, `farbe` kruste, `farbeDrueber` senf, `farbeGedrueckt` tomate, `textFarbe` weiss, `groesse` 18, `rundung` 8, `aktiv` ja; nur lesen: `drueber`, `gedrueckt`, `geklickt`","Schaltfläche für die Maus: `geklickt` ist genau einen Takt lang `ja`, wenn auf dem Taster gedrückt und über ihm losgelassen wurde"],
                ["`Leiste`","2D","`wert` 0.5, `breite` 160, `hoehe` 14, `farbe` basilikum, `farbeLeer` grau, `rundung` 7","Füllbalken (Leben, Fortschritt): von links ist der Anteil `wert` (0 … 1) gefüllt"],
                ["`Regler`","2D","`wert` 0.5, `von` 0, `bis` 1, `breite` 160, `farbe` kruste, `knauf` senf; nur lesen: `geaendert`","Schieberegler: mit gedrückter Maus ziehen setzt `wert` zwischen `von` und `bis`"],
                ["`Tafel`","2D","`breite` 240, `hoehe` 160, `farbe` #2f2a26e0, `titel` \"\", `rundung` 10, `ziehbar` nein","Fläche für Bedienelemente: ihr Inhalt sind ihre Kinder; verdeckt, was darunter liegt, `ziehbar` = mit der Maus verschieben"],
                ["`Schwung`","3D","`art` dynamisch, `masse` 1, `tempoX`/`tempoY`/`tempoZ` 0, `drehtempoX`/`drehtempoY`/`drehtempoZ` 0, `schwerkraft` 0, `daempfung` 0, `drehdaempfung` 0.05, `abprall` 0, `reibung` 0.5, `stossX`/`stossY`/`stossZ` 0, `drehsperre` nein; nur lesen: `amBoden`, `ruht`","3D-Physik: Kästen, Kugeln und Kapseln fallen, rollen, kippen und stapeln sich – braucht einen `Fuehler` mit `ausloeser: nein`; ein solcher Fühler ohne Schwung ist fest, mit `form: \"netz\"` auch ein Gelände oder eine eigene Form"],
                ["`Figur`","3D","`laufX`/`laufZ` 0, `sprung` 0, `schwerkraft` 9.81, `stufe` 0.3, `hang` 45, `haut` 0.02, `schieben` 0, `mitfahren` ja; nur lesen: `amBoden`, `boden`, `bodenHoehe`, `bodenNormaleX`/`Y`/`Z`, `tempoX`/`Y`/`Z`, `anWand`, `anDecke`","Figur-Steuerung: eine aufrechte Kapsel läuft mit dem Wunschtempo, springt, steigt Stufen, gleitet an Wänden, rutscht an zu steilen Hängen und fährt auf bewegten Böden mit – braucht einen `Fuehler`"],
                ["`Strahl`","3D","`richtungX`/`richtungZ` 0, `richtungY` −1, `achsen` welt, `laenge` 1000, `maske` alle, `ausloeser` nein, `ausMaus` nein; nur lesen: `getroffen`, `abstand`, `punktX`/`Y`/`Z`, `normaleX`/`Y`/`Z`","Strahl-Abfrage: was liegt in einer Richtung (oder unter der Maus)? Beim Lesen gerechnet, trifft Fühler-Formen; nach unten gerichtet die Höhe über einem Gelände"],
                ["`Etikett`","beide","`name` \"\"","Name eines Teils: `herd.modell` setzt ihn je Knoten eines 3D-Modells; `teil.finde(name)` sucht ihn im Teilbaum"],
                ["`Puppe`","3D","`folge` \"\", `tempo` 1, `schleife` ja, `zeit` 0, `laeuft` ja, `blende` 0.2; nur lesen: `dauer`, `fertig`","Spielt die Animationen (Folgen) eines Modells aus `herd.modell` ab und blendet beim Wechsel über; die Knoten bleiben Teile, an die man etwas hängen kann"],
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
        { art: "kurz", md: "**Formen** sind die Gestalt eines 3D-Körpers – fertige Grundformen oder deine eigene aus Punkten und Dreiecken. **Bildchen** sind kleine Pixelbilder aus Text oder Bilddateien (PNG, JPEG) aus deinem Projekt: für 2D-Figuren, Animationen und als Textur auf 3D-Körpern." },
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
        },
        {
          art: "details",
          titel: "Bilder aus Dateien: Bildchen.laden",
          inhalt: [
            { art: "text", md: "Für größere, weiche oder fotografische Bilder legst du **PNG- oder JPEG-Dateien** in dein Projekt (am besten in einen Ordner `bilder/`) und lädst sie mit `Bildchen.laden(\"bilder/bote-1.png\")`. Heraus kommt ein ganz normales `Bildchen` – es passt überall, wo ein Bildchen steht: `herd.bild(…)`, `Animation`, `Rahmen`, `Fliesen`, `Himmelszelt` und als Textur `bild:` an einem `Koerper` oder `Belag`. Durchsichtiges im PNG bleibt durchsichtig." },
            {
              art: "code",
              ausfuehrbar: false,
              tier: 1,
              code: z(
                "Herd herd = neu Herd(\"Steuerung\");",
                "Blech<Bildchen> schritte = [Bildchen.laden(\"bilder/bote-1.png\"), Bildchen.laden(\"bilder/bote-2.png\"),",
                "                            Bildchen.laden(\"bilder/bote-3.png\"), Bildchen.laden(\"bilder/bote-4.png\")];",
                "Teil bote = herd.bild(schritte.stück(1), 320, 296, groesse: 0.5);   // 80 × 100 Pixel → 40 × 50 auf dem Spielfeld",
                "bote.mit(neu Animation(bilder: schritte, proSekunde: 10));",
                "herd.koerper(Form.zylinder(), bild: Bildchen.laden(\"bilder/pizza.jpg\"));   // Textur: der Deckel zeigt das Bild von oben",
                "herd.backe();"
              )
            },
            { art: "text", md: "- **Größe:** `breite()`/`hoehe()` sind die Pixel der Datei, höchstens 2048 × 2048. `groesse` zählt Bildschirmpixel je Bildpixel – vergrößert bleibt das Bild pixelscharf, verkleinert wird es weich (die Engine rechnet beim Laden **Mipmaps** vor, so flimmert auch eine karierte Tischdecke in der Ferne nicht). Tipp: Sprites in doppelter Größe malen und mit `groesse: 0.5` zeichnen.\n- **Gleicher Pfad, gleiches Bild:** Ein zweites `Bildchen.laden` mit demselben Pfad liefert dasselbe `Bildchen` – laden kostet nur einmal.\n- **Kacheln:** Ein `Belag` mit `kachel` wiederholt das Bild (Seitenlänge eine Zweierpotenz, z. B. 256 × 256) – so deckt im Teigball ein kleines Karomuster den ganzen Tisch.\n- **Fehler:** Fehlt die Datei oder ist sie kein lesbares PNG/JPEG, wirft `Bildchen.laden` eine `LaufzeitAnanas`. Alle Bilder eines Projekts zusammen dürfen vorgebacken höchstens 64 MB groß sein (`P0020`; ein 1024 × 1024-Bild braucht etwa 5,3 MB).\n\nDie Beispiele **Steuerung** (Laufbilder und Landschaft), **Teigfänger** (alle Sprites) und **Teigball** (Tischdecke, Pizza, Kruste, Ziegel) zeigen das im Großen; ihre Bilder malt das Skript `scripts/texturen-herd.js`." }
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
        },
        {
          art: "details",
          titel: "Wucht: Physik in 2D",
          inhalt: [
            { art: "text", md: "Eine **`Wucht`** macht ein 2D-Teil zum Körper mit Masse: Er fällt (`schwerkraft`, Pixel/s² nach unten – **1200** fühlt sich nach Spiel an, Standard ist 0), prallt ab (`abprall` 0 … 1), reibt (`reibung` 0 … 1) und wird gebremst (`daempfung`). Die Form kommt vom **`Fuehler`** am selben Teil, und gestoßen wird nur, wenn der Fühler `ausloeser: nein` hat. Ein solcher Fühler **ohne** Wucht ist fest – so baut man Boden und Wände. `stossX`/`stossY` ist ein Einmal-Stoß (im nächsten Takt ändert sich das Tempo um Stoß / `masse`, danach steht wieder 0), `amBoden()` sagt, ob der Körper im letzten Takt von unten gestützt wurde – gut fürs Springen." },
            { art: "text", md: "`art: \"kinematisch\"` fährt mit seinem Tempo, schiebt andere und lässt sich selbst nicht schieben (eine Plattform), `\"fest\"` bewegt sich nie. Formen sind Kreise und achsenparallele Rechtecke, gedreht wird nichts: Kugeln **gleiten** statt zu rollen. **Tipp:** Was schneller als seine halbe Größe je Takt fliegt, kann durch dünne Wände tunneln – Wände dick machen. Mit `Bewegung` am selben Teil wirken beide; besser nur eines." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Wucht","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"6765c177d8e93b91","paket":"b78bea7ca99c6b54"},
                {"art":"bild","bildnummer":8,"szene":"6f91da7b6edff464","paket":"1a7543049f445687"},
                {"art":"bild","bildnummer":12,"szene":"2b7e5a98b172b0ea","paket":"eae67d2e4024895b"},
                {"art":"bild","bildnummer":16,"szene":"6973060357d7bc79","paket":"4fc193d46308ad58"},
                {"art":"bild","bildnummer":20,"szene":"9074292961b99b0c","paket":"3b9e82321be0c10b"},
                {"art":"bild","bildnummer":24,"szene":"55edac847e005b7d","paket":"a34a05a96b1b7c7e"},
                {"art":"bild","bildnummer":28,"szene":"7dfa8c27774a2dc2","paket":"36bb2dc9c6193f06"},
                {"art":"bild","bildnummer":32,"szene":"10adb15260dce52d","paket":"cb7d249e637d8efc"},
                {"art":"bild","bildnummer":36,"szene":"49dcffcc6257b813","paket":"c55693f77287cf14"},
                {"art":"bild","bildnummer":40,"szene":"cc494e8a5b2b3aff","paket":"4e1305fcb4265c03"},
                {"art":"bild","bildnummer":44,"szene":"4c0d5e40b9a496bb","paket":"1b089cb05db196a2"},
                {"art":"bild","bildnummer":48,"szene":"63ea82fdf9a93576","paket":"544dfdc9e381a0ca"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Wucht\", breite: 320, hoehe: 180);",
                "Teil boden = herd.rechteck(160, 170, 320, 20, farbe: \"basilikum\");",
                "boden.mit(neu Fuehler(ausloeser: nein));",
                "Teil ball = herd.kreis(80, 30, 10, farbe: \"teig\");",
                "ball.mit(neu Fuehler(ausloeser: nein));",
                "Wucht w = ball.mit(neu Wucht(schwerkraft: 1200, abprall: 0.5, tempoX: 60));",
                "salami sprung = 0;",
                "herd.backe(() -> {",
                "  falls (w.amBoden() && sprung == 0) { w.setzeStossY(-300); sprung = herd.bildnummer(); }",
                "});",
                "Bote.sage((w + \" \" + w.art() + \" \" + w.amBoden() + \" \" + (sprung > 0) + \" \" + (ball.x() > 80)));"
              )
            },
            { art: "ausgabe", text: z("Wucht(4) dynamisch nein ja ja") },
            { art: "text", md: "Ein ganzes Beispiel sind die **Teigkugeln** unter *Beispiele → Herd*: Ein Klick wirft eine Teigkugel in die Pizzaschachtel, ein Nudelholz fährt darüber, die Leertaste rüttelt." }
          ]
        },
        {
          art: "details",
          titel: "Vieleck: beliebige Formen",
          inhalt: [
            { art: "text", md: "Ein **`Vieleck`** zeichnet eine gefüllte Form aus Punkten: `punkte` ist ein Blech aus Zahlen `[x1, y1, x2, y2, …]` relativ zum Teil (3 bis 256 Punkte), die Ecken werden der Reihe nach verbunden und der letzte Punkt mit dem ersten. Die Form darf **einspringende Ecken** haben (ein L, ein Stern, ein gebogenes Band), aber ihre Kanten dürfen sich **nicht kreuzen oder berühren** – eine solche Form (oder eine mit weniger als 3 Punkten) zeichnet Herd einfach nicht, ohne Fehler. Lage, Drehung, Größe und Ebene des Teils wirken wie bei jeder anderen 2D-Form; `umriss` > 0 zeichnet nur einen Rand dieser Dicke nach innen (wie beim `Rechteck`). Für `trifft` und `Fuehler` zählt das umschließende Rechteck der Punkte." },
            { art: "text", md: "Die Engine zerlegt jedes Vieleck selbst in Dreiecke – nur einmal, solange sich die Punkte nicht ändern. Tipp: Kreisbögen baust du mit `Mathe.cos`/`Mathe.sin` in einer Schleife, z. B. ein Pizzastück aus der Mitte und sieben Punkten auf dem Rand." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Vieleck","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"9ef5040ae9182873","paket":"079e67b7e729926a"},
                {"art":"bild","bildnummer":8,"szene":"50ee47720b7701e3","paket":"d657106d9e2b7f4e"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Vieleck\", breite: 320, hoehe: 180);",
                "Blech<funghi> stueck = [0, 0];",
                "für (salami k = 0; k <= 6; k++) {",
                "    funghi w = Mathe.bogen(-22.5 + k * 7.5);",
                "    stueck = stueck.hinzu(Mathe.cos(w) * 80).hinzu(Mathe.sin(w) * 80);",
                "}",
                "Teil pizza = herd.gruppe(160, 90);",
                "pizza.mit(neu Bewegung(drehtempo: 30));",
                "Vieleck v = pizza.mit(neu Vieleck(punkte: stueck, farbe: \"tomate\"));",
                "herd.gruppe(200, 60).mit(neu Vieleck(punkte: [-20, -20, 20, -20, 20, -5, -5, -5, -5, 20, -20, 20], farbe: \"basilikum\", umriss: 3));",
                "herd.backe();",
                "Bote.sage((v + \" \" + v.punkte().länge() / 2 + \" Punkte, Drehung \" + pizza.drehung()));"
              )
            },
            { art: "ausgabe", text: z("Vieleck(3) 8 Punkte, Drehung 4") },
            { art: "text", md: "Ein ganzes Beispiel sind die **Pizzastücke** unter *Beispiele → Herd*: Eine Pizza aus acht Vieleck-Stücken mit Kruste, Käse und Belag dreht sich auf dem Brett; ein Klick zieht ein Stück heraus." }
          ]
        },
        {
          art: "details",
          titel: "Gelaende: Hügel aus einer Höhenkarte",
          inhalt: [
            { art: "text", md: "Ein **`Gelaende`** an einem 3D-Teil ist eine Landschaft aus einer **Höhenkarte**: `hoehen` ist ein Blech aus Zahlen, Zeile für Zeile `spalten` Werte (je 2 … 256, also höchstens 65 536 Punkte; fehlende Werte zählen als 0). Die Punkte liegen `weite` auseinander, mittig um das Teil: Spalte 1 links (−x), Zeile 1 hinten (−z), die Höhe ist y. Daraus baut die Engine selbst ein Netz mit glatten Normalen und zeichnet es wie einen `Koerper` – mit `farbe`, `glanz`, Schatten (`schatten`) und einem Bildchen als Textur, das **einmal über die ganze Fläche** gespannt wird (auch ein `Bildchen.laden`-Bild)." },
            { art: "text", md: "Das Netz entsteht im **Takt** – vor dem ersten Takt gibt es noch keins (auch keine Hülle für `trifft`). Neu gebaut wird nur, wenn sich `hoehen`, `spalten`, `zeilen` oder `weite` wirklich ändern; dieselben Werte noch einmal zu setzen kostet fast nichts. Jedes neue Netz ist eine neue Ressource, die die Engine behält – also **nicht in jedem Takt umformen**, sondern bei Ereignissen. Für `trifft` zählt der Kasten um das ganze Gelände; wo genau der Boden liegt, rechnet das Programm mit derselben Formel aus, mit der es die Höhen gebaut hat. Einen Farbverlauf nach Höhe gibt es (noch) nicht – dafür eine Textur." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":2},{"typ":"takt","anzahl":2}],
              herdErwartet: [
                {"art":"fenster","titel":"Gelaende","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":2,"szene":"3d25ee536d7a25b4","paket":"e04437cc433971bc"},
                {"art":"bild","bildnummer":4,"szene":"3d25ee536d7a25b4","paket":"f72af465eef202a8"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Gelaende\", breite: 320, hoehe: 180);",
                "herd.kamera().setzeLage(0, 6, 9).schaueAuf(0, 0, 0);",
                "Blech<funghi> h = [];",
                "für (salami j = 0; j < 12; j++) {",
                "  für (salami i = 0; i < 12; i++) { h.hinzu(Mathe.sin(i * 0.6) * Mathe.cos(j * 0.5)); }",
                "}",
                "Teil land = herd.raum(0, 0, 0);",
                "Gelaende g = land.mit(neu Gelaende(hoehen: h, spalten: 12, zeilen: 12, weite: 0.8));",
                "Teil ball = herd.koerper(Form.kugel(), 0, 1.2, 0, farbe: \"tomate\").setzeGroesse(0.5);",
                "Bote.sage((\"vor dem Takt: \" + ball.trifft(land)));",
                "herd.backe();",
                "Bote.sage((g + \" \" + g.spalten() + \"×\" + g.zeilen() + \", \" + g.hoehen().länge() + \" Höhen, trifft \" + ball.trifft(land)));"
              )
            },
            { art: "ausgabe", text: z("vor dem Takt: nein", "Gelaende(3) 12×12, 144 Höhen, trifft ja") },
            { art: "text", md: "Ein ganzes Beispiel sind die **Hügel** unter *Beispiele → Herd*: eine Tomatenplantage im Hügelland, die Kamera kreist um den Hof, und die Leertaste lässt die Hügel wachsen – die Tomatenstöcke wandern mit." }
          ]
        },
        {
          art: "details",
          titel: "Vorlage: Muster für viele gleiche Teile",
          inhalt: [
            { art: "text", md: "Eine **`Vorlage`** macht ein Teil zum ruhenden Muster (wie ein Prefab in Unity): Es **ruht samt allen Kindern** – keine Bewegung, keine Animation, keine Teilchen, keine Fühler oder Physik –, wird nicht gezeichnet und trifft nichts. Seine Komponenten und Werte bleiben aber da und lassen sich lesen und ändern. **`kopie()`** macht daraus ein waches Teil **ohne** Vorlage, mit allen Kindern und Komponenten – so baut man Gegnerwellen, Geschosse oder Pizzen am Fließband: einmal zusammenstecken, beliebig oft kopieren." },
            { art: "text", md: "`ohne(\"Vorlage\")` weckt das Muster selbst auf. Ein Teil, das man an eine Vorlage hängt, ruht mit; die Kopie eines **Kindes** der Vorlage hängt am selben Eltern-Teil und ruht deshalb auch – kopiere die Vorlage selbst. `name` dient nur der Anzeige." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Vorlage","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"d3da7f4300c3c07b","paket":"f5391310d4a92f96"},
                {"art":"bild","bildnummer":8,"szene":"297fc17164ae7169","paket":"fbc1748e4b8b7205"},
                {"art":"bild","bildnummer":12,"szene":"ceef872965922eed","paket":"6305c24509b36f4d"},
                {"art":"bild","bildnummer":16,"szene":"5a685ebbed9c3735","paket":"98cd2814bacf6d7a"},
                {"art":"bild","bildnummer":20,"szene":"e13901a7156d3541","paket":"87af1d092a2fd4a0"},
                {"art":"bild","bildnummer":24,"szene":"6a0aba30dba56b4f","paket":"3eaeb1c7ef02cb48"},
                {"art":"bild","bildnummer":28,"szene":"c2269d37c77d7ca7","paket":"d022f659833f2adb"},
                {"art":"bild","bildnummer":32,"szene":"3c63d3e0bcc6df29","paket":"36428f462a22a586"},
                {"art":"bild","bildnummer":36,"szene":"f18cb6c8dbdbcdc4","paket":"8b37e3276c11267f"},
                {"art":"bild","bildnummer":40,"szene":"28bb91704f8cf64a","paket":"6baaa464e9ccc910"},
                {"art":"bild","bildnummer":44,"szene":"e6f0b21f9ac7feb1","paket":"8e44a618ec51833a"},
                {"art":"bild","bildnummer":48,"szene":"e45c731fc5e38819","paket":"25551410c9166b17"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Vorlage\", breite: 320, hoehe: 180);",
                "Teil muster = herd.kreis(20, 90, 10, farbe: \"aubergine\");",
                "muster.mit(neu Bewegung(tempoX: 80));",
                "muster.mit(neu Vorlage(name: \"Olive\"));",
                "Blech<Teil> oliven = [muster.kopie()];",
                "herd.backe(() -> {",
                "  falls (herd.bildnummer() % 12 == 0) { Teil o = muster.kopie(); o.verschiebe(0, (oliven.länge() % 3 - 1) * 40); oliven.hinzu(o); }",
                "});",
                "Bote.sage((muster.vorlage().name() + \" \" + muster.x() + \" \" + oliven.länge() + \" \" + (oliven.erstes().vorlage() == karton)));"
              )
            },
            { art: "ausgabe", text: z("Olive 20 5 ja") },
            { art: "text", md: "Ein ganzes Beispiel ist der **Pizzaofen** unter *Beispiele → Herd*: Aus einer Vorlage mit Belag, Dampf, Fühler und Wucht wirft der Ofen jede Sekunde eine Pizza aus, die über die Theke in die Kiste rutscht." }
          ]
        },
        {
          art: "details",
          titel: "Fliesen: Kachelkarten",
          inhalt: [
            { art: "text", md: "**`Fliesen`** legt ein ganzes Level aus gleich großen Kacheln an ein Teil: `bilder` ist ein Blech aus Bildchen, `karte` ein Blech aus Zahlen, **zeilenweise von oben** (`spalten` Einträge je Zeile), und die Zahl n zeigt `bilder[n]` – 0 ist leer, eine Zahl ohne Bildchen bleibt unsichtbar, eine zu kurze Karte ist am Ende leer. `kachel` ist die Seitenlänge einer Kachel im Spielfeld (das Bildchen wird darauf gestreckt). Anders als `Rechteck` und `Bild` liegt die Lage des Teils an der **oberen linken Ecke** des Rasters. Eine Karte darf bis zu 1024 × 1024 Kacheln groß sein, ein Blech aber höchstens 65 536 Zahlen haben – größere Welten setzt du aus mehreren Fliesen-Teilen nebeneinander zusammen." },
            { art: "text", md: "Die Nummern in **`fest`** sind für die Physik feste Wände und Böden: Ein Teil mit `Fuehler(ausloeser: nein)` und `Wucht` steht darauf, prallt ab und rutscht über die Fugen zwischen zwei Kacheln, ohne hängenzubleiben (Kacheln zählen als Gruppe 1). Gezeichnet werden **nur die Kacheln, die gerade zu sehen sind** – mit einem `Blick` auch in riesigen Karten. Zwei Raster übereinander (Hintergrund in einer kleineren `ebene`) geben Tiefe." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Fliesen","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"e7c7bdf84dee973f","paket":"ae1a7260cc1cf3cc"},
                {"art":"bild","bildnummer":8,"szene":"dbf0ae5879b18955","paket":"527be5bb058d4d58"},
                {"art":"bild","bildnummer":12,"szene":"5f29001995761a26","paket":"6002b245414d0b60"},
                {"art":"bild","bildnummer":16,"szene":"dcc2b7d7742c0efc","paket":"47bf14d8ce6fc1df"},
                {"art":"bild","bildnummer":20,"szene":"1e6090e6bdbcf435","paket":"8993ba12d3349894"},
                {"art":"bild","bildnummer":24,"szene":"d8a4d3ce82aaee53","paket":"b8f420cc1f249348"},
                {"art":"bild","bildnummer":28,"szene":"6842c503c8b713de","paket":"0b63d150106342e8"},
                {"art":"bild","bildnummer":32,"szene":"321437351139bed7","paket":"530576983f1537e1"},
                {"art":"bild","bildnummer":36,"szene":"e4aaa916eb02c589","paket":"ce8990b4ede26b25"},
                {"art":"bild","bildnummer":40,"szene":"a03694007078b1c3","paket":"c7bc77b5cff385b9"},
                {"art":"bild","bildnummer":44,"szene":"a03694007078b1c3","paket":"bd13ba05086f003d"},
                {"art":"bild","bildnummer":48,"szene":"a03694007078b1c3","paket":"df0089e1c8dcafb1"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Fliesen\", breite: 320, hoehe: 180);",
                "Bildchen stein = neu Bildchen([\"gggo\", \"gggo\", \"oooo\", \"gogg\"]);",
                "Bildchen gras = neu Bildchen([\".b.b\", \"bbbb\", \"kkkk\", \"kkkk\"]);",
                "Blech<margherita> level = [",
                "    \"          \",",
                "    \"      22  \",",
                "    \"          \",",
                "    \"22    1   \",",
                "    \"1111111111\"",
                "];",
                "Blech<funghi> karte = [];",
                "für (margherita zeile : level) {",
                "    für (salami c = 1; c <= zeile.länge(); c++) {",
                "        margherita z = zeile.zeichen(c);",
                "        falls (z == \" \") { karte.hinzu(0); } sonst { karte.hinzu(z.alsZahl()); }",
                "    }",
                "}",
                "Fliesen f = herd.gruppe(0, 20).mit(neu Fliesen(bilder: [stein, gras], spalten: 10, zeilen: 5, karte: karte, kachel: 32, fest: [1, 2]));",
                "Teil kiste = herd.rechteck(120, 20, 16, 16, farbe: \"senf\");",
                "kiste.mit(neu Fuehler(ausloeser: nein));",
                "Wucht w = kiste.mit(neu Wucht(schwerkraft: 1200, tempoX: 60));",
                "herd.backe();",
                "Bote.sage((f + \" \" + f.karte().länge() + \" Kacheln, Kiste bei y = \" + Mathe.runden(kiste.y()) + \", amBoden \" + w.amBoden()));"
              )
            },
            { art: "ausgabe", text: z("Fliesen(3) 50 Kacheln, Kiste bei y = 140, amBoden ja") },
            { art: "text", md: "Ein ganzes Beispiel ist die **Hüpfwelt** unter *Beispiele → Herd*: Der Pizzabote springt durch einen Keller aus Kacheln, sammelt Pizzen und bringt sie zur Tür; der Blick folgt ihm an der Leine." }
          ]
        },
        {
          art: "details",
          titel: "Kulisse: Titelbild, Spiel, Pause – Szenen wechseln",
          inhalt: [
            { art: "text", md: "Eine **`Kulisse`** fasst einen Teilbaum zu einer Szene zusammen – ein Titelbild, ein Level, ein Pausenmenü. Alles, was an dem Teil mit der Kulisse hängt, gehört dazu. Mit **`aktiv: nein`** **ruht** die ganze Kulisse wie eine `Vorlage`: keine Bewegung, keine Animation, keine Fühler oder Physik, nichts wird gezeichnet, und eine `Kamera`, ein `Blick` oder ein `Licht` darin zählt nicht. Gewechselt wird mit `setzeAktiv`: `titel.kulisse().setzeAktiv(nein); spiel.kulisse().setzeAktiv(ja);` – sofort, noch im selben Takt." },
            { art: "text", md: "Mehrere Kulissen dürfen zugleich aktiv sein (eine Anzeige über Spiel und Pause), Kulissen dürfen ineinander stecken (eine ausgeschaltete äußere schaltet alle inneren mit aus). Werte wie Punkte und Lagen bleiben beim Ausschalten erhalten; zum **Entladen** entfernt man den Teilbaum mit `entferne()`. Die Welt-Einstellungen (Hintergrund, Himmel, Nebel) gelten für alle Kulissen. `kopie()` kopiert die Kulisse mit – samt `aktiv`. Szenen aus Dateien laden gibt es (noch) nicht: Man baut alle Kulissen im Programm und schaltet um." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Kulisse","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"07eaf5b77f0bab85","paket":"2a2c705443ae5419"},
                {"art":"bild","bildnummer":8,"szene":"07eaf5b77f0bab85","paket":"d9ffcb1ab783cb02"},
                {"art":"bild","bildnummer":12,"szene":"07eaf5b77f0bab85","paket":"47039e409ecd150e"},
                {"art":"bild","bildnummer":16,"szene":"07eaf5b77f0bab85","paket":"18969988f287476a"},
                {"art":"bild","bildnummer":20,"szene":"70d296bfc7b47604","paket":"8a3dc6830f7f0f68"},
                {"art":"bild","bildnummer":24,"szene":"4fff338b835d7d68","paket":"3326c8f17756172c"},
                {"art":"bild","bildnummer":28,"szene":"886a74307535e8cc","paket":"53c79f492ca85190"},
                {"art":"bild","bildnummer":32,"szene":"45d2306d263f874b","paket":"f96434b11ca055a9"},
                {"art":"bild","bildnummer":36,"szene":"21a99a84cd471935","paket":"2b7dc4f4caba96c5"},
                {"art":"bild","bildnummer":40,"szene":"098d5ed4c8b2938f","paket":"c56716d6d1cd8721"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Kulisse\", breite: 320, hoehe: 180);",
                "Teil titel = herd.gruppe();",
                "titel.mit(neu Kulisse(name: \"Titel\"));",
                "herd.text(\"Pizza!\", 160, 70, groesse: 32, ausrichtung: \"mitte\").haenge(titel);",
                "Teil spiel = herd.gruppe();",
                "spiel.mit(neu Kulisse(aktiv: nein, name: \"Spiel\"));",
                "Teil ball = herd.kreis(20, 90, 12, farbe: \"tomate\");",
                "ball.mit(neu Bewegung(tempoX: 60));",
                "ball.haenge(spiel);",
                "herd.backe(() -> {",
                "  falls (herd.bildnummer() == 20) { titel.kulisse().setzeAktiv(nein); spiel.kulisse().setzeAktiv(ja); }",
                "});",
                "Bote.sage((spiel.kulisse().name() + \" aktiv: \" + spiel.kulisse().aktiv() + \", Ball x = \" + ball.x()));"
              )
            },
            { art: "ausgabe", text: z("Spiel aktiv: ja, Ball x = 41") },
            { art: "text", md: "Ein ganzes Beispiel sind die **Kulissen** unter *Beispiele → Herd*: Titelbild, Spiel mit Pause auf der Leertaste und eine Ende-Kulisse – ein Spiel, vier Szenen." }
          ]
        },
        {
          art: "details",
          titel: "Himmelszelt: Himmel mit Sonne, Sternen oder Bildern",
          inhalt: [
            { art: "text", md: "Ein **`Himmelszelt`** an irgendeinem 3D-Teil ist der Himmel hinter der ganzen Szene (eine Skybox wie in Unity) und ersetzt den einfachen Verlauf von `herd.himmel(…)`. Ohne Bilder rechnet die Engine ihn selbst: von `boden` unter dem Horizont über `horizont` bis `oben` im Zenit, dazu eine **Sonnenscheibe** (`sonnenscheibe` = Durchmesser in Grad) genau dort, wohin das Sonnenlicht zeigt – stellst du `herd.sonne()` tiefer, geht sie unter – und **Sterne** (`sterne` von 0 bis 1 = wie hell sie leuchten). Ohne `herd.umgebung(…)` färbt `oben` auch das Umgebungslicht." },
            { art: "text", md: "Mit `bilder` werden die sechs Würfelseiten zu Bildern: **rechts, links, oben, unten, vorn, hinten** (vorn = dorthin, wohin die Kamera am Anfang schaut). Gedacht ist ein aufgeklapptes Kreuz um `vorn`: `oben` schließt an die Oberkante von `vorn` an, `unten` an die Unterkante. Es gehen Bildchen aus Zeichen und geladene Bilder (`Bildchen.laden`); sie werden weich vergrößert, durchsichtige Stellen zeigen den gerechneten Himmel dahinter – so stehen Berge vor dem Abendrot. Fehlen Seiten (kürzeres Blech), bleiben sie gerechnet; Sonne und Sterne gibt es nur dort. Hängen mehrere Himmelszelte, gilt das mit der kleinsten Teil-ID (ruhende unter einer `Vorlage` zählen nicht). Die Bodenfarbe heißt `boden`, weil `unten` in pizza ein Schlüsselwort ist." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":2},{"typ":"takt","anzahl":2}],
              herdErwartet: [
                {"art":"fenster","titel":"Himmelszelt","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":2,"szene":"d4c5966799a6de3e","paket":"b8bbdf2c59e2bfe4"},
                {"art":"bild","bildnummer":4,"szene":"b16fdb03a1989936","paket":"e0c6192aa1a7a466"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Himmelszelt\", breite: 320, hoehe: 180);",
                "herd.sonne().setzeLage(-0.3, 0.12, -1);",
                "herd.kamera().setzeLage(0, 1.5, 6).schaueAuf(0, 2.5, -4);",
                "Himmelszelt zelt = herd.raum(0, 0, 0).mit(neu Himmelszelt(oben: \"#22306a\", horizont: \"#f39a5b\", boden: \"#2c2433\", sonnenscheibe: 4, sterne: 0.5));",
                "herd.koerper(Form.ebene(), 0, 0, 0, farbe: \"#5d6b4a\").setzeGroesse(30, 1, 30);",
                "herd.backe(() -> { zelt.setzeSterne(Mathe.min(1, zelt.sterne() + 0.125)); });",
                "Bote.sage((zelt + \" \" + zelt.oben() + \" \" + zelt.sonnenscheibe() + \" \" + zelt.sterne()));"
              )
            },
            { art: "ausgabe", text: z("Himmelszelt(3) #22306a 4 1") },
            { art: "text", md: "Ein ganzes Beispiel ist die **Sternennacht** unter *Beispiele → Herd*: Über dem Hügelland sinkt die Sonne, der Himmel färbt sich vom Abendrot zum Nachtblau, die Sterne gehen auf, und im Hof wird Licht gemacht." }
          ]
        },
        {
          art: "details",
          titel: "Viele Lichter und Spots",
          inhalt: [
            { art: "text", md: "Jedes `Licht` mit `art: \"punkt\"` leuchtet – auch hunderte auf einmal: Lichterketten, Neonschilder, Laternen. Die Engine teilt die Sicht in Zellen (16 Kacheln breit, je nach Seitenverhältnis 9 hoch, 24 Tiefenscheiben) und merkt sich je Zelle, welche Lichter dort hinreichen; jedes Pixel rechnet nur die Lichter seiner Zelle. Damit das schnell bleibt, gib jedem Licht eine passende `reichweite` – ein Licht wirkt nur innerhalb dieses Abstands (zum Rand hin weich abnehmend). Bis 4096 sichtbare Lichter je Bild (die nächsten zur Kamera zuerst), je Zelle höchstens 255." },
            { art: "text", md: "Ein **Spot** ist ein Licht mit **`kegel`** > 0 (halber Öffnungswinkel in Grad, bis 90): Er leuchtet in die Richtung, in die sein Teil schaut – `schaueAuf(x, y, z)` richtet ihn aus wie die Kamera. **`kegelRand`** (0 … 1) ist der Anteil des Kegels, der weich ausläuft (0 = harte Kante). Schatten werfen Punktlichter und Spots erst mit `schattenGuete` (nächster Abschnitt)." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":2},{"typ":"takt","anzahl":2}],
              herdErwartet: [
                {"art":"fenster","titel":"Lichter","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":2,"szene":"f13dad013ee3190f","paket":"78e74a2442c5dd44"},
                {"art":"bild","bildnummer":4,"szene":"7d5a854769666b5f","paket":"cef0e111ee9e0a0e"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Lichter\", breite: 320, hoehe: 180);",
                "herd.himmel(\"#0b0d18\", \"#1d1830\");",
                "herd.sonne().licht().setzeStaerke(0);",
                "herd.koerper(Form.ebene(), farbe: \"#555560\", glanz: 0.6).setzeGroesse(30, 1, 30);",
                "für (salami i = 0; i < 40; i++) {",
                "    herd.licht((i % 8 - 3.5) * 1.5, 0.4, 2 - (i / 8).ganz() * 1.5, farbe: i % 2 == 0 ? \"#ff4d6d\" : \"#22c6ff\", reichweite: 2);",
                "}",
                "Teil spot = herd.licht(0, 5, 0, farbe: \"#fff1d0\", reichweite: 9);",
                "spot.schaueAuf(0, 0, -1);",
                "spot.licht().setzeKegel(25).setzeStaerke(4);",
                "herd.backe(() -> { spot.verschiebe(0.25, 0, 0); });",
                "Bote.sage((spot.licht() + \" \" + spot.licht().kegel() + \" \" + spot.x()));"
              )
            },
            { art: "ausgabe", text: z("Licht(44) 25 1") },
            { art: "text", md: "Ein ganzes Beispiel ist das **Lichterfest** unter *Beispiele → Herd*: 144 Glühbirnen in sechs Lichterketten über einer Altstadtgasse und Laternen als Spots." }
          ]
        },
        {
          art: "details",
          titel: "Schatten von Punktlichtern, Spots und Sonnen-Kaskaden",
          inhalt: [
            { art: "text", md: "Die Sonne wirft immer Schatten. Ein Punktlicht oder Spot wirft erst, wenn du **`schattenGuete`** setzt: `\"grob\"`, `\"mittel\"` oder `\"fein\"` (256, 512 oder 1024 Bildpunkte je Richtung). Für ein Punktlicht rendert die Engine sechs Bilder um das Licht herum (je eine Würfelseite), für einen Spot bis 60° eines – alle als Kacheln in einem gemeinsamen Schatten-Atlas. **Höchstens 8** Lichter werfen je Bild Schatten: die, die im Bild wirken, die nächsten zur Kamera zuerst. Passt eine Kachel nicht mehr in den Atlas (viele feine Würfel), wirft das Licht still keinen Schatten. Wer wirft, bestimmt wie immer `Koerper.schatten` – eine leuchtende Birne direkt am Licht sollte `setzeSchatten(nein)` bekommen, sonst verdeckt sie ihr eigenes Licht." },
            { art: "text", md: "**`schattenWeich`** (0 … 4) macht die Kanten weicher (1 = wie bisher, 0 = hart) – auch für die Sonne. Für weite Sichten teilt **`kaskaden`** (1 … 4, nur Sonne) die Sicht in Stufen: vorn feine Schatten, hinten grobe; **`schattenWeite`** sagt, wie weit (in Einheiten ab der Kamera) die Sonne Schatten wirft (0 = automatisch wie bisher, höchstens 60)." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":2},{"typ":"takt","anzahl":2}],
              herdErwartet: [
                {"art":"fenster","titel":"Schatten","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":2,"szene":"c2c343a047daaf2b","paket":"f4899d9dad95e3cf"},
                {"art":"bild","bildnummer":4,"szene":"aff318d2491be3fb","paket":"b7064c5c6839f4f2"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Schatten\", breite: 320, hoehe: 180);",
                "herd.himmel(\"#0b0d18\", \"#1d1830\");",
                "herd.sonne().licht().setzeStaerke(0);",
                "herd.koerper(Form.ebene(), farbe: \"#8a8478\").setzeGroesse(30, 1, 30);",
                "für (salami i = 0; i < 5; i++) {",
                "    herd.koerper(Form.wuerfel(), (i - 2) * 1.6, 0.5, -1 + (i % 2), farbe: \"#c87850\");",
                "}",
                "Teil birne = herd.licht(0, 2.2, 1, farbe: \"#ffd9a0\", reichweite: 9);",
                "birne.licht().setzeStaerke(2).setzeSchattenGuete(\"mittel\").setzeSchattenWeich(1.5);",
                "Teil spot = herd.licht(-4, 5, 3, farbe: \"#9fd0ff\", reichweite: 12);",
                "spot.schaueAuf(0, 0, -1);",
                "spot.licht().setzeKegel(30).setzeStaerke(5).setzeSchattenGuete(\"fein\");",
                "herd.backe(() -> { birne.verschiebe(0.2, 0, 0); });",
                "Bote.sage((birne.licht().schattenGuete() + \" \" + spot.licht().schattenGuete() + \" \" + birne.x()));"
              )
            },
            { art: "ausgabe", text: z("mittel fein 0.8") },
            { art: "text", md: "Ein ganzes Beispiel ist die **Laternengasse** unter *Beispiele → Herd*: sechs Laternen und zwei Wandstrahler mit Schatten, per Taster auf Tag mit Sonnen-Kaskaden umschaltbar." }
          ]
        },
        {
          art: "details",
          titel: "Volles Spiegelbild",
          inhalt: [
            { art: "text", md: "Eine `Stimmung` mit `spiegelung` lässt nasse Böden spiegeln. Mit **`spiegelGuete: \"voll\"`** wird das Spiegelbild so vollständig wie das Bild selbst: volle Größe, **alle** Lichter (die Engine legt dafür eine zweite Lichter-Tabelle für die gespiegelte Kamera an), Schatten von Sonne, Punktlichtern und Spots, Durchsichtiges, `Funken` und Regen. Was nur im Spiegel zu sehen ist – ein Neonschild über dem oberen Bildrand, eine Laterne hinter dir –, zählt dann auch als sichtbar. Gehwege und Stufen bis 0,2 über der Spiegelebene spiegeln voll mit (die Engine nimmt eine Ebene für alles; auf dem Gehweg ist das Bild deshalb ein wenig versetzt). Der Standard `\"einfach\"` ist billiger: halbe Größe, nur Undurchsichtiges, die 8 nächsten Lichter." },
            { art: "text", md: "Ein ganzes Beispiel ist der **Regenplatz** unter *Beispiele → Herd*: eine Piazza im Regen mit 150 Neonlichtern, deren Spiegelbild per Taster zwischen einfach und voll wechselt." }
          ]
        },
        {
          art: "details",
          titel: "Bildschirmraum: Verdeckung und Bildraum-Spiegelung",
          inhalt: [
            { art: "text", md: "Zwei Effekte rechnet die Engine aus dem fertigen Bild, ohne dass du etwas setzen musst. **`verdeckung`** (0 … 2, „SSAO“) schätzt aus der Tiefe des Bildes, wie viel Umgebungslicht eine Stelle abbekommt: Ecken, Fugen, der Spalt unter einem Fass und die Kante unter einem Vordach werden dunkler. **`verdeckungWeite`** ist der Radius in Metern (Standard 0.5) – größer für weite Räume, kleiner für feine Fugen. Direkte Lichter und Leuchten bleiben unberührt." },
            { art: "text", md: "**`bildspiegel`** (0 … 1, „SSR“) lässt glatte Flächen mit `Belag(modell: \"pbr\")` spiegeln, was im Bild zu sehen ist – polierte Fliesen, Metall, Glanzlack, auch senkrechte Wände. Ein Strahl läuft durchs Tiefenbild, bis er etwas trifft; je rauer die Fläche, desto unschärfer das Spiegelbild. Was nicht im Bild ist (hinter dir, über dem Bildrand), fällt weich auf die Umgebung zurück. Auf der Ebene einer planaren `spiegelung` hat diese Vorrang (sie kennt auch, was außerhalb des Bildes liegt); `bildspiegel` übernimmt die übrigen Flächen." },
            { art: "text", md: "Ein ganzes Beispiel ist der **Pizzakeller** unter *Beispiele → Herd*: Gewölbe, Fässer, Kupfertheke und Holzofen; der Taster schaltet den Bildschirmraum an und aus." }
          ]
        },
        {
          art: "details",
          titel: "Material: Relief, Kachelung, physikalisches Licht und Nässe",
          inhalt: [
            { art: "text", md: "Ein **`Belag`** kann mehr als Farbe und Bild: Mit **`modell: \"pbr\"`** rechnet die Engine physikalisch (GGX-Glanz, Fresnel, die Umgebung spiegelt sich) – `glanz` wird zur Glätte (1 = spiegelglatt), **`metall`** (0 … 1) färbt den Glanz in der Eigenfarbe. **`nass`** (0 … 1) macht Flächen feucht, dunkler und glatter, und auf Böden entstehen **Pfützen**, in denen sich die Lichter spiegeln." },
            { art: "text", md: "Fürs Fotorealistische: **`kachel`** wiederholt das Bild – mit `abbildung: \"uv\"` `kachel`-mal über die Fläche, mit **`abbildung: \"welt\"`** in Weltmaß (`kachel` = Kantenlänge einer Kachel in Einheiten, egal wie groß der Körper ist – ideal für Wände und Straßen aus gestreckten Würfeln). **`relief`** ist ein zweites Bild mit der Oberflächenform: Rot und Grün = Normale (wie „Normal Map“ im OpenGL-Format), Blau = Rauheit. Kachelung und Relief brauchen Bilddateien (`Bildchen.laden`) mit quadratischer Zweierpotenz-Kante (256, 512, 1024 …); `scripts/texturen-neon.js` zeigt, wie man aus Fototexturen (Farbe, Normale, Rauheit/AO) passende Bilder macht." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":2},{"typ":"takt","anzahl":2}],
              herdErwartet: [
                {"art":"fenster","titel":"Material","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":2,"szene":"2b3ffec0a126b97f","paket":"273597b306a45fa9"},
                {"art":"bild","bildnummer":4,"szene":"c4b6b08a8f03f2c1","paket":"b72a009bd7cd9790"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Material\", breite: 320, hoehe: 180);",
                "herd.himmel(\"#101426\", \"#3a3050\");",
                "herd.umgebung(\"#8090c0\", staerke: 0.2);",
                "herd.sonne().licht().setzeStaerke(0.2);",
                "herd.kamera().setzeLage(0, 1.2, 6).schaueAuf(0, 0.3, 0);",
                "Belag nass = herd.raum().mit(neu Belag(farbe: \"#5a5a66\", glanz: 0.5, modell: \"pbr\", nass: 0.8));",
                "Belag chrom = herd.raum().mit(neu Belag(farbe: \"#d8dce4\", glanz: 0.85, modell: \"pbr\", metall: 1));",
                "herd.koerper(Form.ebene()).setzeGroesse(20, 1, 20).koerper().setzeBelag(nass.teil());",
                "herd.koerper(Form.kugel(), 0, 0.6, 0).setzeGroesse(1.2).koerper().setzeBelag(chrom.teil());",
                "herd.licht(-1.5, 0.5, 1, farbe: \"#ff3df0\", reichweite: 5).licht().setzeStaerke(3);",
                "herd.licht(1.5, 0.5, 1, farbe: \"#22e6ff\", reichweite: 5).licht().setzeStaerke(3);",
                "herd.backe(() -> { chrom.setzeGlanz(chrom.glanz() - 0.05); });",
                "Bote.sage((nass.modell() + \" \" + nass.nass() + \" \" + chrom.metall()));"
              )
            },
            { art: "ausgabe", text: z("pbr 0.8 1") },
            { art: "text", md: "Ein ganzes Beispiel ist **Neon-Napoli** unter *Beispiele → Herd*: Fototexturen für Asphalt, Beton, Ziegel, Fliesen, Wellblech und Rolltore, alle mit Relief, nass und in Weltmaß gekachelt." }
          ]
        },
        {
          art: "details",
          titel: "Belag-Karten: Normal-, Stoff- und Leucht-Karte, Ausschnitt, beidseitig",
          inhalt: [
            { art: "text", md: "Fotorealistische Materialien bestehen aus mehreren Bildern – genau so, wie sie aus Blender oder von Poly Haven kommen. Ein **`Belag`** nimmt sie als **Karten**: **`normalKarte`** ist eine „Normal Map“ (Rot, Grün, Blau = Richtung der Oberfläche, OpenGL-Format wie glTF) und hat Vorrang vor der Normale des `relief`; **`normalStaerke`** macht die Unebenheiten flacher (0) oder kräftiger (2). **`stoffKarte`** ist das „ORM“- bzw. „arm“-Bild: Rot = Verdeckung (Fugen und Ritzen bekommen weniger Umgebungslicht), Grün = Rauheit, Blau = Metall – mal `glanz` und `metall` des Belags. **`leuchtKarte`** leuchtet in **`leuchtFarbe`** (mal `leuchten` und `strahlen`), zum Beispiel Displays oder Lampenschirme." },
            { art: "text", md: "**`schwelle`** schneidet aus: Wo die Deckkraft von Farbe und Bild unter der Schwelle liegt, ist der Körper nicht da – auch sein Schatten nicht. So werden aus einfachen Flächen Blätter, Zäune oder Gitter, die trotzdem deckend gezeichnet werden. Beläge mit Karten sind **einseitig** wie in glTF: Von hinten sieht man die Fläche nicht. Mit **`beidseitig: ja`** sieht man beide Seiten (für Blätter und dünne Wände). Ohne Karten bleibt alles wie zuvor – Herd zeigt dann immer beide Seiten." },
            { art: "text", md: "Modelle bringen ihre Karten selbst mit: `Modell.laden` übernimmt Normal-, Metall/Rauheit-, Verdeckungs- und Leucht-Bild, `alphaMode: MASK` als `schwelle` und `doubleSided` als `beidseitig`. Wie beim Relief brauchen die Karten Bilddateien (`Bildchen.laden`) mit quadratischer Zweierpotenz-Kante." },
            {
              art: "code",
              ausfuehrbar: false,
              tier: 1,
              code: z(
                "Belag holz = herd.raum().mit(neu Belag(modell: \"pbr\", bild: Bildchen.laden(\"bilder/holz-farbe.jpg\"),",
                "    normalKarte: Bildchen.laden(\"bilder/holz-normale.jpg\"), stoffKarte: Bildchen.laden(\"bilder/holz-arm.jpg\")));",
                "Belag laub = herd.raum().mit(neu Belag(bild: Bildchen.laden(\"bilder/blatt.png\"), schwelle: 0.5, beidseitig: ja));",
                "Belag schirm = herd.raum().mit(neu Belag(farbe: \"#202024\", leuchten: 1, leuchtKarte: Bildchen.laden(\"bilder/anzeige.png\"),",
                "    leuchtFarbe: \"#80e0ff\"));",
                "Modell farn = Modell.laden(\"modelle/farn/fern_02_1k.gltf\");",
                "Belag blatt = farn.belaege().stück(1).belag();",
                "Bote.sage((blatt.schwelle() + \" \" + blatt.beidseitig()));   // 0.5 ja"
              )
            },
            { art: "text", md: "Ein ganzes Beispiel ist die **Werkstatt** unter *Beispiele → Herd*: Holzkisten und Farne von Poly Haven mit allen Karten; N schaltet die Normalen, F die Rückseiten der Farnblätter." }
          ]
        },
        {
          art: "details",
          titel: "Stimmung: Bloom, Tonkurve und Höhennebel",
          inhalt: [
            { art: "text", md: "Eine **`Stimmung`** an irgendeinem 3D-Teil ist die Bildbearbeitung der Szene (wie ein Post-Processing-Volume in Unity). Dann rechnet die Engine mit echten Helligkeiten (HDR): Was heller als Weiß ist, bleibt erhalten und wird erst am Schluss mit einer filmischen **Tonkurve** (ACES) auf den Bildschirm gebracht – `belichtung` macht alles heller oder dunkler. **`bloom`** (0 … 4) lässt alles über der `bloomSchwelle` weich ausstrahlen, `bloomWeite` (0 … 1) macht den Schein breiter. Damit ein Körper heller als seine Farbe leuchtet, gib ihm `leuchten: 1` und **`strahlen`** (am `Koerper` oder `Belag`, z. B. 6) – das ist Neon." },
            { art: "text", md: "Der **Höhennebel** ist unten dicht und wird nach oben dünner: `nebelDichte` gilt auf der Höhe `nebelHoehe`, je Einheit darüber nimmt sie um den Faktor e^(−`nebelAbfall`) ab; er färbt in `nebelFarbe`. Dazu `saettigung` (0 grau … 2 bunt), `vignette` (dunkle Ecken) und `koernung` (Filmkorn). **`spiegelung`** (0 … 1) lässt nasse Böden spiegeln: Die Engine zeichnet die Szene zusätzlich an der Ebene in Höhe `spiegelHoehe` gespiegelt, und glatte, nasse Flächen dort (`Belag` mit `modell: \"pbr\"`, z. B. `nass`) zeigen dieses Spiegelbild – Neonschilder in Pfützen. **`spiegelGuete`** wählt die Güte: `\"einfach\"` (Standard) spiegelt in halber Größe nur Himmel und Undurchsichtiges mit den 8 nächsten Lichtern; `\"voll\"` spiegelt in voller Größe alles – alle Lichter, Schatten, Glas, Funken und Regen – und zeigt auch, was nur im Spiegel zu sehen ist (etwa ein Schild über dem Bildrand). Es gilt die wache Stimmung mit der kleinsten Teil-ID; schaltest du sie ab (z. B. über eine `Kulisse`), zeichnet die Engine wieder wie ohne. 2D-Teile liegen immer unverändert darüber." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":2},{"typ":"takt","anzahl":2}],
              herdErwartet: [
                {"art":"fenster","titel":"Stimmung","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":2,"szene":"71c643ef1285f6d8","paket":"ceeae6beba5d4337"},
                {"art":"bild","bildnummer":4,"szene":"d423156b593a41f3","paket":"220042e6b97a6a79"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Stimmung\", breite: 320, hoehe: 180);",
                "herd.himmel(\"#07080f\", \"#231c33\");",
                "herd.sonne().licht().setzeStaerke(0);",
                "herd.koerper(Form.ebene(), farbe: \"#24242c\", glanz: 0.8).setzeGroesse(20, 1, 20);",
                "Teil roehre = herd.koerper(Form.zylinder(), 0, 1.5, -1, farbe: \"#ff3df0\", leuchten: 1);",
                "roehre.setzeRollen(90).setzeGroesse(0.12, 3, 0.12);",
                "roehre.koerper().setzeStrahlen(6);",
                "Stimmung s = herd.raum().mit(neu Stimmung(bloom: 1, nebelDichte: 0.1, vignette: 0.3));",
                "herd.backe(() -> { s.setzeBelichtung(s.belichtung() + 0.25); });",
                "Bote.sage((s + \" \" + s.belichtung() + \" \" + roehre.koerper().strahlen()));"
              )
            },
            { art: "ausgabe", text: z("Stimmung(5) 2 6") },
            { art: "text", md: "Ein ganzes Beispiel ist das **Neonschild** unter *Beispiele → Herd*: eine Pizzeria-Reklame im Nebel, die Leertaste schaltet die Stimmung aus und an." }
          ]
        },
        {
          art: "details",
          titel: "Regen: Striche, Licht, Spritzer und Pfützenringe",
          inhalt: [
            { art: "text", md: "Regen sind **`Funken`** mit ein paar Zusatzfeldern. **`streckung`** ist die Belichtungszeit in Sekunden: Jeder Tropfen wird als dünner **Strich** entlang seiner Bewegung gezeichnet (Länge = Tempo × `streckung`, z. B. 0.03), der zum Schwanz hin ausläuft – so sieht schneller Regen aus, nicht wie Schnee. **`licht`** (0 … 1) lässt die Tropfen im Licht der Szene leuchten: Neonschilder und Laternen färben sie, gegen das Licht gesehen werden sie heller; abseits der Lichter bleiben sie dunkel. **`volumen`** (halbe Kantenlänge in Einheiten) verteilt den Ausstoß über ein waagerechtes Quadrat um das Teil, und wer es verlässt, kommt auf der anderen Seite wieder herein – häng den Sprüher an den Spieler oder setz ihn jeden Takt dorthin, dann regnet es überall, wo du hinsiehst, mit wenigen tausend Tropfen." },
            { art: "text", md: "Mit **`aufschlag: ja`** enden die Tropfen unter der Höhe **`boden`** und werfen **`spritzer`** (0 … 16, Standard 3) kurze Spritzer hoch. Die Regenstärke ist ein Wert: **`Stimmung.regen`** (0 … 1) – Funken mit **`regen: ja`** stoßen `rate` × `regen` Tropfen aus, und auf nassen Böden (`Belag` mit `modell: \"pbr\"` und `nass`) laufen **Ringe** durch die Pfützen, an nassen Wänden **Rinnsale** herab. Ohne Stimmung regnen die Funken mit voller Rate, nur die Ringe fehlen." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Regen","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"2ecb3bbab2b821b1","paket":"3993a47001b977c8"},
                {"art":"bild","bildnummer":8,"szene":"c43c162818fcfea5","paket":"55d69c3e8b52baf5"},
                {"art":"bild","bildnummer":12,"szene":"0a68a02113ce1474","paket":"cafd1e76dea6668f"},
                {"art":"bild","bildnummer":16,"szene":"1f7e6afe0dbc6cf2","paket":"de9a92f66c2e8daa"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Regen\", breite: 320, hoehe: 180);",
                "herd.himmel(\"#07080f\", \"#231a33\");",
                "herd.kamera().setzeLage(0, 1.6, 6).schaueAuf(0, 1, 0);",
                "Stimmung st = herd.raum().mit(neu Stimmung(bloom: 0.8, spiegelung: 1, regen: 0.8));",
                "Belag nass = herd.raum().mit(neu Belag(farbe: \"#4a4a55\", glanz: 0.5, modell: \"pbr\", nass: 1));",
                "herd.koerper(Form.ebene()).setzeGroesse(20, 1, 20).koerper().setzeBelag(nass.teil());",
                "herd.licht(0, 2, -1, farbe: \"#ff3df0\", reichweite: 6).licht().setzeStaerke(4);",
                "Funken regen = herd.raum(0, 8, 3).mit(neu Funken(rate: 2000, lebensdauer: 1.2, tempo: 10, richtungY: -1, streuung: 3,",
                "    groesse: 0.02, groesseEnde: 0.02, farbe: \"#d0d8ffa0\", farbeEnde: \"#d0d8ffa0\",",
                "    streckung: 0.03, licht: 1, volumen: 5, aufschlag: ja, regen: ja));",
                "herd.backe(() -> { st.setzeRegen(Mathe.max(0, st.regen() - 0.01)); });",
                "Bote.sage((regen.streckung() + \" \" + regen.volumen() + \" \" + regen.spritzer() + \" \" + regen.regen()));"
              )
            },
            { art: "ausgabe", text: z("0.03 5 3 ja") },
            { art: "text", md: "Ein ganzes Beispiel ist **Neon-Napoli** unter *Beispiele → Herd*: Regen um den Spieler, der in den Farben der Neonschilder glitzert, Spritzer auf dem Asphalt und Ringe in den Pfützen." }
          ]
        },
        {
          art: "details",
          titel: "Funken-Aufprall: abprallen, liegen bleiben, vergehen",
          inhalt: [
            { art: "text", md: "**`kollision`** lässt `Funken` auf etwas treffen. `\"boden\"` ist eine waagerechte Ebene auf der Höhe **`boden`** – billig und für flache Böden genug. `\"welt\"` prüft jedes Teilchen auf seinem Weg im Takt gegen **alle festen Fühler** (Kasten, Kugel, Kapsel, Netz) und das **Gelände** (Fühler mit Form `\"netz\"`): Regen landet auf Dächern und Gehwegen, Funken springen über Hügel. Auslöser, Figuren und dynamische `Schwung`-Körper zählen nicht. Der Standard `\"keine\"` lässt alles durch (dann gilt wie bisher `aufschlag`)." },
            { art: "text", md: "**`aufprall`** sagt, was danach passiert: `\"vergehen\"` (Standard – Regen), `\"abprallen\"` (zurück mit dem Anteil **`abprall`** des Tempos senkrecht zur Fläche, Standard 0.3; entlang der Fläche gleitet es weiter, wird der Sprung zu klein, rutscht es nur noch) oder `\"liegen\"` (bleibt als Glut liegen, bis seine `lebensdauer` um ist). Bei jedem kräftigen Aufprall steigen **`spritzer`** kleine Teilchen von der Fläche auf – höchstens 1 000 neue je Takt und Emitter." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Aufprall","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"2f1faffb3fe8eac3","paket":"ad5188aac8e76870"},
                {"art":"bild","bildnummer":8,"szene":"b919296690b207a4","paket":"b9e28eb8108840e3"},
                {"art":"bild","bildnummer":12,"szene":"eaf4ba868c0451a8","paket":"bbbc90b2b2deae30"},
                {"art":"bild","bildnummer":16,"szene":"a3c4932ca85d64e7","paket":"37221d63ed8b4ebc"},
                {"art":"bild","bildnummer":20,"szene":"bb2789e091ca6a2d","paket":"94168e0aa26defd4"},
                {"art":"bild","bildnummer":24,"szene":"1e7607b21e82c4b6","paket":"104cb3c58abd2d71"},
                {"art":"bild","bildnummer":28,"szene":"c1fc463c8976203d","paket":"b50d4e6a1f5832e1"},
                {"art":"bild","bildnummer":32,"szene":"02a44077af18a4c4","paket":"cb95cbd58590585f"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Aufprall\", breite: 320, hoehe: 180);",
                "herd.kamera().setzeLage(0, 3, 7).schaueAuf(0, 0.8, 0);",
                "Teil dach = herd.koerper(Form.wuerfel(), 0, 1, 0, farbe: \"tomate\").setzeGroesse(2, 0.2, 2);",
                "dach.mit(neu Fuehler(ausloeser: nein));",
                "herd.koerper(Form.ebene(), farbe: \"oliven\").setzeGroesse(12, 1, 12).mit(neu Fuehler(ausloeser: nein));",
                "Funken regen = herd.raum(0, 3, 0).mit(neu Funken(rate: 800, lebensdauer: 1.2, tempo: 8, richtungY: -1, streuung: 2,",
                "    groesse: 0.03, streckung: 0.03, volumen: 2.5, kollision: \"welt\", spritzer: 3));",
                "Funken funken = herd.raum(-2, 0.8, 0).mit(neu Funken(rate: 60, lebensdauer: 3, tempo: 4, richtungX: 1, schwerkraft: 9.81,",
                "    kollision: \"welt\", aufprall: \"abprallen\", abprall: 0.5, spritzer: 0));",
                "herd.backe(() -> { funken.teil().setzeDrehung(herd.bildnummer() * 4); });",
                "Bote.sage((regen.kollision() + \" \" + regen.aufprall() + \" \" + funken.aufprall() + \" \" + funken.abprall()));"
              )
            },
            { art: "ausgabe", text: z("welt vergehen abprallen 0.5") },
            { art: "text", md: "Ein ganzes Beispiel ist **Funkenschlag** unter *Beispiele → Herd*: Funken aus einem Ofenschlot springen über die Hänge und an Steinen ab, Regen spritzt auf Steinen und Dach auf; die Leertaste schaltet zwischen abprallen, liegen und vergehen." }
          ]
        },
        {
          art: "details",
          titel: "Taster, Leiste, Regler, Tafel: Bedienelemente mit der Maus",
          inhalt: [
            { art: "text", md: "Vier 2D-Bausteine für Menüs und Anzeigen. Ein **`Taster`** ist eine Schaltfläche mit Text (`Knopf` heißt in pizza schon das Element der Theke): `drueber` = die Maus ist über ihm, `gedrueckt` = auf ihm gedrückt und noch gehalten, `geklickt` = über ihm losgelassen – genau einen Takt lang. `aktiv: nein` macht ihn blass und taub. Eine **`Leiste`** zeigt einen Anteil `wert` von 0 bis 1 als Balken (Leben, Fortschritt). Ein **`Regler`** stellt `wert` zwischen `von` und `bis` ein: auf ihn drücken und ziehen, `geaendert` meldet jede Änderung. Eine **`Tafel`** ist die Fläche darunter – ihr Inhalt sind ihre **Kinder** (`haenge`), mit `ziehbar: ja` schiebt man sie samt Inhalt mit der Maus herum." },
            { art: "text", md: "Wie bei `Fuehler` sind das **Zustände je Takt**, keine Rückrufe: Die Engine wertet die Maus nach jedem Takt aus, das Programm liest das Ergebnis im nächsten. Treffer hat immer nur das **oberste** Element unter der Maus (höhere `ebene`, bei Gleichstand das später erzeugte) – eine Tafel verdeckt also, was unter ihr liegt, ihre Kinder liegen über ihr. Wer auf etwas drückt, „hält“ es fest, bis er loslässt: Ein Regler zieht weiter, auch wenn die Maus ihn verlässt, und ein Taster zählt nur, wenn auf ihm gedrückt **und** losgelassen wurde. Mit einem `Blick` liegen Bedienelemente in der Welt; mit `ebene` ≥ `festAb` stehen sie fest im Bild (HUD). `blick.mausX()`/`mausY()` liefern die Maus in Weltkoordinaten." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":1,"maus":[110,90]},{"typ":"takt","anzahl":1,"maus":[110,90],"knoepfe":1},{"typ":"takt","anzahl":1,"maus":[110,90],"knoepfe":0},{"typ":"takt","anzahl":1,"maus":[110,90],"knoepfe":1},{"typ":"takt","anzahl":1,"maus":[110,90],"knoepfe":0},{"typ":"takt","anzahl":1,"maus":[160,135],"knoepfe":1},{"typ":"takt","anzahl":1,"maus":[200,135],"knoepfe":1},{"typ":"takt","anzahl":1,"maus":[200,135],"knoepfe":0}],
              herdErwartet: [
                {"art":"fenster","titel":"Knöpfe","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":1,"szene":"b9ffec8f0736228d","paket":"b514fd844f16b1c4"},
                {"art":"bild","bildnummer":2,"szene":"acbb99c5a7516d7e","paket":"78f1a928f007cc6b"},
                {"art":"bild","bildnummer":3,"szene":"cae4bbc033492f9e","paket":"3aa6caaf95aa4a39"},
                {"art":"bild","bildnummer":4,"szene":"af324436e0ecc41b","paket":"0a41cb89c8b3c9a3"},
                {"art":"bild","bildnummer":5,"szene":"6fdcc7688388e8fb","paket":"4ae535de2d971a65"},
                {"art":"bild","bildnummer":6,"szene":"b136f525a99fd753","paket":"9b443f6e50f039e4"},
                {"art":"bild","bildnummer":7,"szene":"995df5f402c61377","paket":"914bba275ae97b21"},
                {"art":"bild","bildnummer":8,"szene":"984dfaf401dee8c6","paket":"5dcf42b4d661696a"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Knöpfe\", breite: 320, hoehe: 180);",
                "Teil tafel = herd.gruppe(160, 90);",
                "tafel.mit(neu Tafel(breite: 220, hoehe: 140, titel: \"Ofen\", ziehbar: ja));",
                "Taster mehr = herd.gruppe(-50, 0).haenge(tafel).mit(neu Taster(inhalt: \"Mehr\", breite: 90));",
                "Leiste leiste = herd.gruppe(50, 0).haenge(tafel).mit(neu Leiste(wert: 0, breite: 80));",
                "Regler hitze = herd.gruppe(0, 45).haenge(tafel).mit(neu Regler(von: 150, bis: 300, wert: 200));",
                "salami klicks = 0;",
                "herd.backe(() -> {",
                "  falls (mehr.geklickt()) { klicks++; leiste.setzeWert((klicks / 4)); }",
                "  falls (hitze.geaendert()) { Bote.sage((\"Hitze \" + hitze.wert())); }",
                "});",
                "Bote.sage((\"Klicks: \" + klicks + \", Leiste \" + leiste.wert()));"
              )
            },
            { art: "ausgabe", text: z("Hitze 225", "Hitze 262.5", "Klicks: 2, Leiste 0.5") },
            { art: "text", md: "Ein ganzes Beispiel ist der **Pizza-Konfigurator** unter *Beispiele → Herd*: Regler für Größe und Käse, Taster für den Belag, eine Ofenleiste – alles auf einer Tafel, die sich verschieben lässt." }
          ]
        },
        {
          art: "details",
          titel: "Kniff: eigene Klassen als Komponente",
          inhalt: [
            { art: "text", md: "Statt alle Spiellogik in die eine Funktion von `backe` zu schreiben, kann jedes Ding sein Verhalten selbst mitbringen: eine eigene Klasse, die **`erbt Kniff`** (wie ein MonoBehaviour in Unity). `teil.mit(neu Wackler())` hängt sie an ein Teil, `teil()` liefert in ihren Methoden dieses Teil. Überschreiben lassen sich `start()` (einmal, vor dem ersten `takt()`), `takt()` (jeden Takt), `beimBetreten(Teil anderes)` und `beimVerlassen(Teil anderes)` (aus dem `Fuehler` desselben Teils), `beimKlick()` (wenn ihr `Taster` geklickt wurde) und `beimEntfernen()` (nach `teil.ohne(kniff)` oder `entferne()` – `teil()` ist dann schon `karton`)." },
            { art: "text", md: "Die Rückrufe laufen nach den Systemen des Takts: Teile in der Reihenfolge ihrer ID, je Teil die Kniffe in der Reihenfolge des Anhängens – mehrere je Teil sind erlaubt, `teil.kniffe()` listet sie. Ruhende Teile (`Vorlage`, ausgeschaltete `Kulisse`) bekommen keine Rückrufe. `kopie()` nimmt **keine** Kniffe mit: Für viele gleiche Figuren schreibt man eine Funktion, die das Teil baut und seine Kniffe anhängt. `neu Kniff()` selbst geht nicht – `Kniff` ist ein Rohling." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Kniffe","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"141b04aed3ffaa70","paket":"ba437684330f8736"},
                {"art":"bild","bildnummer":8,"szene":"a45b6357facdd966","paket":"44d8c3f8ff7d4423"},
                {"art":"bild","bildnummer":12,"szene":"7df4e6de19b19d44","paket":"4689826bbe7b9d46"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Kniffe\", breite: 320, hoehe: 180);",
                "klasse Pendel erbt Kniff {",
                "  funghi mitte;",
                "  leer start() { mitte = teil().x(); }",
                "  leer takt() { teil().setzeLage(mitte + Mathe.sin(herd.zeit() * 6) * 40, teil().y()); }",
                "}",
                "klasse Zaehler erbt Kniff {",
                "  salami n = 0;",
                "  leer takt() { n++; }",
                "  leer beimEntfernen() { Bote.sage((\"weg nach \" + n + \" Takten\")); }",
                "}",
                "Teil kugel = herd.kreis(160, 90, 12, farbe: \"tomate\");",
                "kugel.mit(neu Pendel());",
                "Zaehler z = kugel.mit(neu Zaehler());",
                "herd.backe(() -> { falls (herd.bildnummer() == 10) { kugel.ohne(z); } });",
                "Bote.sage((kugel.kniffe() + \" x = \" + kugel.x().runden()));"
              )
            },
            { art: "ausgabe", text: z("weg nach 9 Takten", "[Pendel@1] x = 197") },
            { art: "text", md: "Ein ganzes Spiel ist **Kniffe** unter *Beispiele → Herd*: Der Bote, die Münzen, eine Olive auf Streife und eine Tomate, die ihn verfolgt, sind je eine Kniff-Klasse; ein Taster mit `beimKlick` streut neue Münzen aus." }
          ]
        },
        {
          art: "details",
          titel: "3D-Modelle aus Dateien: Modell.laden, herd.modell, finde",
          inhalt: [
            { art: "text", md: "Fertige 3D-Modelle – Möbel, Lebensmittel, Figuren aus Blender oder aus freien Paketen wie denen von Kenney – legst du als **glTF-Datei** ins Projekt: `.glb` (alles in einer Datei) oder `.gltf` mit seinen `.bin`- und Bilddateien daneben. `Modell.laden(\"modelle/tisch.glb\")` lädt es (gleicher Pfad → dasselbe Modell), `herd.modell(m, x, y, z)` stellt eine Kopie in die Welt und liefert ihr Wurzel-Teil. Darunter liegt **ein Teil je Knoten** des Modells, mit Lage, Drehung und Größe wie in der Datei und dem Knotennamen als **`Etikett`** – `teil.finde(\"door\")` holt so die Ofentür, die sich drehen lässt wie jedes Teil. 1 Meter im Modell ist 1 Einheit, oben ist +y." },
            {
              art: "code",
              ausfuehrbar: false,
              tier: 1,
              code: z(
                "Herd herd = neu Herd(\"Küche\");",
                "Modell herdModell = Modell.laden(\"modelle/kitchen-stove.glb\");",
                "Modell tisch = Modell.laden(\"modelle/table-round.glb\");",
                "Teil herdTeil = herd.modell(herdModell, 0, 0, -2);",
                "Teil tuer = herdTeil.finde(\"door\");                   // ein Knoten des Modells",
                "tuer.setzeNeigung(-80);                                // Ofentür auf",
                "für (salami i = 0; i < 3; i++) { herd.modell(tisch, i * 1.5, 0.27, 0); }",
                "tisch.belaege().stück(1).belag().setzeFarbe(\"tomate\");    // alle drei Tische zugleich",
                "Bote.sage((herdModell.namen() + \" \" + tisch.breite() + \" m breit\"));",
                "herd.backe();"
              )
            },
            { art: "text", md: "- **Materialien** werden zu geteilten **Belägen** (`m.belaege()`): Grundfarbe und Grundfarb-Bild, Metall, Glanz (1 − Rauheit), Leuchten; Normal- und Rauheit-Bild werden zum Relief. Eine Farbe am Belag gilt für jede Kopie des Modells.\n- **Lichter** aus dem Modell (Punkt und Spot) werden `Licht`-Komponenten; Kameras und Richtungslichter im Modell entfallen.\n- `m.namen()` listet die Knotennamen, `m.breite()`/`hoehe()`/`tiefe()` die Größe, `m.folgen()` die Animationen (abspielen kommt später).\n- **Grenzen:** höchstens 500 000 Ecken, 1 024 Knoten, 64 Materialien und 32 Bilder (je ≤ 2048 × 2048) je Modell. Komprimierte Modelle (Draco, meshopt, KTX2) kann der Herd nicht – speichere sie in Blender oder mit `gltf-transform` ohne Kompression als `.glb`. FBX und OBJ wandelst du genauso vorher in glTF um.\n- Modelle werden wie Bilder **vorgebacken** und zählen zur Teigmenge (64 MB für alle Bilder und Modelle zusammen)." },
            { art: "text", md: "Auch ohne Modell kannst du Teile benennen und wiederfinden – `finde` sucht im ganzen Teilbaum, das Teil selbst eingeschlossen:" },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Herd herd = neu Herd(\"Etikett\");",
                "Teil wagen = herd.raum();",
                "wagen.mit(neu Etikett(name: \"Wagen\"));",
                "Teil rad = herd.koerper(Form.zylinder(), 1, 0, 0);",
                "rad.haenge(wagen);",
                "rad.mit(neu Etikett(name: \"Rad\"));",
                "Bote.sage(((wagen.finde(\"Rad\") == rad) + \" \" + wagen.finde(\"Lenker\") + \" \" + rad.etikett().name()));"
              )
            },
            { art: "ausgabe", text: z("ja karton Rad") },
            { art: "text", md: "Ein ganzes Beispiel ist die **Pizzeria** unter *Beispiele → Herd*: 21 Modelle aus dem Kenney Furniture Kit und Food Kit (CC0), eine Kamera zum Umkreisen, Türen und Deckel über `finde`." }
          ]
        },
        {
          art: "details",
          titel: "Animationen aus Modellen: Puppe",
          inhalt: [
            { art: "text", md: "Bringt ein glTF-Modell **Animationen** mit (`m.folgen()` nennt ihre Namen), spielt eine **`Puppe`** an seiner Wurzel sie ab: `folge` wählt die Animation, `tempo` (negativ = rückwärts), `schleife`, `laeuft` und `zeit` (setzen = springen) steuern sie, `dauer` und `fertig` liest du ab – `fertig` ist in dem Takt ja, in dem die Folge ihr Ende erreicht (mit Schleife: bei jeder Runde). Ein Wechsel von `folge` **blendet** in `blende` Sekunden über; `\"\"` kehrt in die Ruhelage zurück." },
            {
              art: "code",
              ausfuehrbar: false,
              tier: 1,
              code: z(
                "Herd herd = neu Herd(\"Puppen\");",
                "Modell roboter = Modell.laden(\"modelle/roboter.glb\");",
                "Teil r = herd.modell(roboter, 0, 0, -3);",
                "Puppe p = r.mit(neu Puppe(folge: \"Laufen\"));",
                "herd.koerper(Form.wuerfel(), 0, 0, 0).setzeGroesse(0.2).haenge(r.finde(\"Hand.R\"));   // trägt einen Würfel",
                "herd.backe(() -> {",
                "  falls (herd.gedrueckt(\"Leertaste\")) { p.setzeFolge(\"Winken\"); }",
                "  falls (p.fertig() && p.folge() == \"Winken\") { p.setzeFolge(\"Laufen\"); }",
                "});"
              )
            },
            { art: "text", md: "- Die **Gelenke sind Teile**: die Puppe schreibt nur Lage, Drehung und Größe, die eine Animation wirklich bewegt – alles andere bleibt in deiner Hand, und was du an ein Gelenk hängst, wandert mit.\n- Interpoliert wird `STEP` (springt) und `LINEAR` (Drehungen auf dem kürzesten Weg); `CUBICSPLINE` geht linear von Stützwert zu Stützwert. Größen, die nur die alte oder nur die neue Folge bewegt, blenden gegen die Ruhelage des Modells.\n- `kopie()` einer Modell-Wurzel bekommt eine eigene Puppe mit eigener Zeit. Gehäutete Figuren (Skinning) verformen sich erst mit einer späteren Stufe; bis dahin bewegen sich nur starre Teile (Roboterarme, Türen, Räder, Rotoren)." },
            { art: "text", md: "Zum Ausprobieren: die **Puppenbühne** unter *Beispiele → Herd* – das Khronos-Testmodell „InterpolationTest“ (CC0) mit neun Folgen, ein Taster wechselt sie mit Überblenden, eine Tomate hängt am drehenden Würfel." }
          ]
        },
        {
          art: "details",
          titel: "Klang: Töne, Geräusche, Musik und Raum",
          inhalt: [
            { art: "text", md: "**`Klang`** erzeugt Klänge – auch ohne Herd: `Klang.ton(frequenz, dauer, welle: \"sinus\")` (Wellen `sinus`, `rechteck`, `saege`, `dreieck`, `rauschen`; mit `bis:` gleitet die Tonhöhe), `Klang.rauschen(dauer, art: \"rosa\")` (`weiss`, `rosa`, `braun` – Regen, Wind, Stadt), `Klang.noten(\"C4 E4 G4:2 - C5\", tempo: 120)` (deutsche Notennamen mit `H`, `#`/`b`, `:n` Viertel, `-` Pause) und `Klang.stille(d)`. Jede Formung liefert einen **neuen** Klang: `huelle(anschlag, abfall, halten, ausklang)`, `tiefpass(hz)`, `hochpass(hz)`, `verstaerke(f)`, `mische(anderer, ab: s)`, `dann(anderer)`, `wiederhole(n)` und `nahtlos(ueberblendung)` für Schleifen ohne Knacken." },
            { art: "text", md: "`k.spiele(lautstaerke: 1, schleife: nein, tonhoehe: 1, panorama: 0)` startet eine **`Spur`**: `stoppe()`, `laeuft()`, `setzeLautstaerke`, `setzeTonhoehe`, `setzePanorama` – und mit `setzeLage(x, y, z)` klingt sie im Raum: Der Hörer ist die Kamera des Herds, leiser mit dem Abstand (bis `setzeReichweite(r)` still), links/rechts nach der Blickrichtung, entfernt dumpfer. Die Zeit ist simuliert (mit Herd die Bildzeit), `beimEnde(fn)` meldet im Spiel das Ende einer Spur. Im Browser setzt der Ton mit dem ersten Klick ein; der Lautsprecher im Fensterkopf schaltet stumm." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              code: z(
                "Klang ping = Klang.ton(880, 0.15, welle: \"dreieck\", bis: 1320);",
                "Klang regen = Klang.rauschen(2, art: \"rosa\").tiefpass(1500).nahtlos(0.2);",
                "Klang melodie = Klang.noten(\"C4 E4 G4 C5:2\", tempo: 160);",
                "Spur s = regen.spiele(schleife: ja, lautstaerke: 0.4);",
                "s.setzeLage(3, 0, -5).setzeReichweite(25);",
                "Spur m = melodie.spiele();",
                "ping.spiele(panorama: -0.5);",
                "Bote.sage((ping.dauer() + \" s, Melodie \" + melodie.dauer() + \" s\"));",
                "Uhr.vorspulen(2s);",
                "Bote.sage((m.laeuft() + \" \" + s.laeuft()));"
              )
            },
            { art: "ausgabe", text: z("0.15 s, Melodie 1.875 s", "nein ja") },
            { art: "text", md: "Die Samples sind in jedem Motor **bitgleich** (Interpreter, Wasm, nativ); das Hörbare macht die Wiedergabe – im Browser WebAudio, nativ das Audiogerät (Windows `waveOut`, Linux ALSA). Zum Ausprobieren: **Pizza-Klavier** und die Klangkulisse von **Neon-Napoli** unter *Beispiele → Herd*." }
          ]
        },
        {
          art: "details",
          titel: "Klänge aus Dateien: Klang.laden (WAV, FLAC und OGG)",
          inhalt: [
            { art: "text", md: "Aufgenommene Geräusche – Regen, Schritte, eine Ladenglocke – legst du als **`.wav`**, **`.flac`** oder **`.ogg`** (Vorbis, z. B. die freien Kenney-Klänge) ins Projekt (mono oder stereo, 8 000 … 96 000 Hz, höchstens 10 Minuten) und lädst sie mit **`Klang.laden(\"klaenge/regen.flac\")`** – auch ohne Herd. Vor dem Start bäckt der Vorbacker jede Klangdatei zu einem **Klangteig** (16 Bit, die Abtastrate bleibt; umgerechnet wird erst beim Abspielen). Im Dateibaum zeigt die Vorschau Dauer, Rate und Kanäle und hat einen Abspielknopf." },
            {
              art: "code",
              ausfuehrbar: false,
              tier: 1,
              code: z(
                "Klang regen = Klang.laden(\"klaenge/regen.flac\");",
                "Klang schritt = Klang.laden(\"klaenge/schritt-1.flac\");",
                "Klang wind = Klang.rauschen(4, art: \"braun\").tiefpass(400).nahtlos(0.3);   // erzeugt",
                "regen.spiele(lautstaerke: 0.6, schleife: ja);",
                "wind.spiele(lautstaerke: 0.3, schleife: ja);                               // gemischt: zwei Spuren zugleich",
                "schritt.spiele(tonhoehe: 0.95, panorama: -0.2);",
                "Bote.sage((regen.dauer() + \" s\"));"
              )
            },
            { art: "text", md: "- Geladene Klänge spielst du wie erzeugte: `spiele(lautstaerke, schleife, tonhoehe, panorama)`, die Spur kann `setzeLage` (Raum) und `beimEnde`. **Formen** (`huelle`, `tiefpass`, `mische` …) gehen nur mit erzeugten Klängen – gemischt wird, indem mehrere Spuren zugleich laufen.\n- Fehler kommen mit dem Pfad: `klaenge/x.wav ist kein lesbarer Klang (WAV, FLAC oder OGG).`, `… ist zu lang (12:30) – höchstens 10 Minuten.`, `… hat 6 Kanäle – höchstens 2 (Mono oder Stereo).`\n- Alle Klänge eines Projekts zusammen dürfen vorgebacken höchstens 64 MB groß sein (`PizzaFehler P0021`); MP3 und Opus gehen (noch) nicht – wandle sie z. B. mit Audacity in FLAC oder OGG Vorbis.\n- Ausprobieren: **Geräuschkiste** unter *Beispiele → Herd* (freie CC0-Geräusche von Freesound)." }
          ]
        },
        {
          art: "details",
          titel: "Schwung: Physik in 3D",
          inhalt: [
            { art: "text", md: "Ein **`Schwung`** macht ein 3D-Teil zum Körper mit Masse – das Gegenstück zur `Wucht` in 2D, aber mit **Drehung**: Kisten kippen über die Kante, Kugeln rollen den Hang hinab, Türme wanken. Die Form kommt wieder vom **`Fuehler`** am selben Teil (`ausloeser: nein`), und sie dreht sich mit dem Teil: `form: \"kasten\"` (Seiten aus `breite`/`hoehe`/`tiefe` oder aus dem Körper), `\"kugel\"` (`radius`) und `\"kapsel\"` (entlang der y-Achse des Teils, `radius` und Gesamthöhe `hoehe` – gut für Figuren und Stangen). `schwerkraft` zieht nach unten (Einheiten/s², Standard 0, **9.81** fühlt sich nach Erde an), `abprall`, `reibung` (Standard 0.5), `daempfung` und `drehdaempfung` wie bei der Wucht; `stossX`/`stossY`/`stossZ` ist ein Einmal-Stoß, `drehtempoX`/`Y`/`Z` (Grad/s) dreht den Körper an." },
            { art: "text", md: "Ein Fühler mit `ausloeser: nein` **ohne** Schwung ist fest. Mit **`form: \"netz\"`** wird ein `Gelaende` zum Boden, auf dem alles liegen bleibt (genau das gezeichnete Netz), oder die eigene Form eines `Koerper` (Dreiecke, einseitig: es zählt die Vorderseite). `art: \"kinematisch\"` fährt und dreht sich mit seinem Tempo und nimmt, was darauf liegt, mit; `\"fest\"` bewegt sich nie; `drehsperre: ja` lässt nur schieben, nicht drehen. Liegt alles still, **schläft** der Körper (`ruht()` ist ja) und kostet nichts – ein Stoß, ein neues Tempo, `setzeLage` oder ein Aufprall weckt ihn. **Tipp:** Was je Takt weiter fliegt als seine halbe Größe, kann durch dünne Wände tunneln – Böden dick machen." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Schwung","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"f867933877282451","paket":"4e08504a96802596"},
                {"art":"bild","bildnummer":8,"szene":"3740417e80c206e3","paket":"8bc8609134b7363b"},
                {"art":"bild","bildnummer":12,"szene":"cccd08b42b9f44d7","paket":"6f1748ec9d372efa"},
                {"art":"bild","bildnummer":16,"szene":"06360109c6ae96cd","paket":"44446cd4cbbffc3d"},
                {"art":"bild","bildnummer":20,"szene":"9ceb22b0debf5ed9","paket":"802fd833900e8cc3"},
                {"art":"bild","bildnummer":24,"szene":"7488102207379349","paket":"26209aef54599cae"},
                {"art":"bild","bildnummer":28,"szene":"0a87b965d5cddcfb","paket":"c92bdf1ef2d67b0b"},
                {"art":"bild","bildnummer":32,"szene":"e2b292016e4d315c","paket":"43d59ba2c806b7a2"},
                {"art":"bild","bildnummer":36,"szene":"485ded7519973d5b","paket":"5a9377eec4fd0d89"},
                {"art":"bild","bildnummer":40,"szene":"ff229d9bbe0b6619","paket":"8e927d2146585ad4"},
                {"art":"bild","bildnummer":44,"szene":"969ad853d413b92b","paket":"5f24386e495a1791"},
                {"art":"bild","bildnummer":48,"szene":"6acac6f7b8cb800c","paket":"521db623697080ee"},
                {"art":"bild","bildnummer":52,"szene":"c2e145bd83603a61","paket":"1ce780106eb3e152"},
                {"art":"bild","bildnummer":56,"szene":"002ab82093940d9b","paket":"2f9312c2e2d939ec"},
                {"art":"bild","bildnummer":60,"szene":"05033e8ca315e242","paket":"9479d62d17567401"},
                {"art":"bild","bildnummer":64,"szene":"6d33bd5ec15520c5","paket":"9acbb4169fa01ef4"},
                {"art":"bild","bildnummer":68,"szene":"ac28951929c2efe4","paket":"e8def1975506a98a"},
                {"art":"bild","bildnummer":72,"szene":"556dea5974c1ba1e","paket":"a9c9f896f0c81602"},
                {"art":"bild","bildnummer":76,"szene":"19d03070d54de48e","paket":"d089267f2c8935c0"},
                {"art":"bild","bildnummer":80,"szene":"eb2d52254e96520b","paket":"15ac3ac964e693c9"},
                {"art":"bild","bildnummer":84,"szene":"b9169012ac47de24","paket":"2beceef3854b1948"},
                {"art":"bild","bildnummer":88,"szene":"8d9c8d104e13b277","paket":"62e3c312dbfb00fb"},
                {"art":"bild","bildnummer":92,"szene":"d288cb59cb35b2ed","paket":"b5e743c9a0229ddc"},
                {"art":"bild","bildnummer":96,"szene":"1942f55338e6b471","paket":"ffcbe75ce46c257b"},
                {"art":"bild","bildnummer":100,"szene":"650c81f782855e7e","paket":"4206d45ee55594fa"},
                {"art":"bild","bildnummer":104,"szene":"15da90cae6b62ba9","paket":"9e50a336bf17fc67"},
                {"art":"bild","bildnummer":108,"szene":"d8f1afdf30d5296b","paket":"86ab3861130c3d87"},
                {"art":"bild","bildnummer":112,"szene":"fd6558bd69819fa1","paket":"ac45e5f5729e3e95"},
                {"art":"bild","bildnummer":116,"szene":"774f563e93822434","paket":"90aa8ff2a6381cf3"},
                {"art":"bild","bildnummer":120,"szene":"3a54c91bbed270ff","paket":"a917966f65db5851"},
                {"art":"bild","bildnummer":124,"szene":"abf2fd53816e4349","paket":"8d8bda66a9987223"},
                {"art":"bild","bildnummer":128,"szene":"23d5fab76dff0cc5","paket":"002a31a3f1825c2e"},
                {"art":"bild","bildnummer":132,"szene":"d080a7a7121f3301","paket":"c53369b2d3683fd9"},
                {"art":"bild","bildnummer":136,"szene":"b330c3de30c68ce4","paket":"734164ddb754cd81"},
                {"art":"bild","bildnummer":140,"szene":"9d23b72feec98a53","paket":"f702914c1279bc20"},
                {"art":"bild","bildnummer":144,"szene":"74cd91dcfb4fbf2f","paket":"b0d84708fd3b8d6a"},
                {"art":"bild","bildnummer":148,"szene":"421a852823a2dfc9","paket":"a7f157d66d20c69c"},
                {"art":"bild","bildnummer":152,"szene":"3d6990413eb09616","paket":"2ffa0877e0d0798a"},
                {"art":"bild","bildnummer":156,"szene":"e7550ee64a4ee999","paket":"13353aa18bb4e221"},
                {"art":"bild","bildnummer":160,"szene":"2f033bf47bd565ee","paket":"a601ad76b0c9ac66"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Schwung\", breite: 320, hoehe: 180);",
                "herd.kamera().setzeLage(0, 3, 7).schaueAuf(0, 1, 0);",
                "Teil boden = herd.koerper(Form.wuerfel(), 0, -0.5, 0, farbe: \"basilikum\").setzeGroesse(10, 1, 10);",
                "boden.mit(neu Fuehler(ausloeser: nein));",
                "Teil kiste = herd.koerper(Form.wuerfel(), 0, 2, 0, farbe: \"senf\").setzeRollen(35);",
                "kiste.mit(neu Fuehler(form: \"kasten\", ausloeser: nein));",
                "Schwung s = kiste.mit(neu Schwung(schwerkraft: 9.81));",
                "Teil ball = herd.koerper(Form.kugel(teile: 16), -1.5, 3, 0, farbe: \"tomate\").setzeGroesse(0.6);",
                "ball.mit(neu Fuehler(form: \"kugel\", radius: 0.3, ausloeser: nein));",
                "ball.mit(neu Schwung(schwerkraft: 9.81, abprall: 0.6, tempoX: 1));",
                "herd.backe(() -> {",
                "  falls (herd.gedrueckt(\"Leertaste\")) { s.setzeStossY(6); }",
                "});",
                "Bote.sage((s + \" \" + s.art() + \" nach \" + herd.bildnummer() + \" Bildern: amBoden \" + s.amBoden() + \", ruht \" + s.ruht()));",
                "Bote.sage((\"liegt flach: \" + (kiste.rollen().runden() % 90 == 0) + \", Ball rollt: \" + (ball.x() > -1.5)));"
              )
            },
            { art: "ausgabe", text: z("Schwung(4) dynamisch nach 160 Bildern: amBoden ja, ruht ja", "liegt flach: ja, Ball rollt: ja") },
            { art: "text", md: "Ein ganzes Beispiel ist der **Kistenturm** unter *Beispiele → Herd*: Ein Turm aus Pizzakartons steht auf einer Lichtung zwischen Hügeln, ein Klick wirft eine Teigkugel – der Turm kippt, und die Kartons purzeln über das Gelände." }
          ]
        },
        {
          art: "details",
          titel: "Figur und Strahl: laufen, springen, zielen",
          inhalt: [
            { art: "text", md: "Eine **`Figur`** ist die Spielfigur aus Unitys CharacterController: eine **aufrechte Kapsel** (Form vom `Fuehler` am selben Teil, am besten `form: \"kapsel\"` mit `radius` und `hoehe`), der das Programm nur sagt, **wie schnell sie laufen möchte** – `laufX`/`laufZ` in Einheiten/s, Weltachsen. Den Rest macht der Herd jeden Takt: Schwerkraft (**9.81** schon eingestellt), Stufen bis `stufe` (0.3) nimmt sie einfach, Hänge bis `hang` Grad (45) läuft sie hinauf, steilere halten sie auf; an Wänden gleitet sie entlang, und steht sie auf etwas, das sich bewegt (eine kinematische Plattform, ein Aufzug mit `Ablauf`), fährt sie mit (`mitfahren`). `sprung` ist ein Einmal-Sprung (Tempo nach oben, nur am Boden, danach 0). Lesen kann man `amBoden`, `boden` (worauf sie steht), `bodenHoehe`, die Normale des Bodens, `anWand`, `anDecke` und das **tatsächliche** Tempo `tempoX`/`Y`/`Z`." },
            { art: "text", md: "Anfahren, Bremsen und Sprinten bleiben im Programm – so fühlt sich die Steuerung an, wie du willst. Hindernisse sind alle Fühler mit `ausloeser: nein` (feste, kinematische, dynamische, Netze, Gelände, andere Figuren); dynamische `Schwung`-Körper schiebt die Figur nur mit **`schieben`** an (Stoß je Sekunde Berührung). `haut` hält einen kleinen Abstand zu allem." },
            { art: "text", md: "Ein **`Strahl`** fragt: *Was liegt in dieser Richtung?* Ab der Lage seines Teils in `richtungX`/`Y`/`Z` (Welt- oder mit `achsen: \"teil\"` Teil-Achsen) bis `laenge`, oder mit **`ausMaus: ja`** von der Kamera durch die Maus. Die Antworten sind Felder, die **beim Lesen** gerechnet werden: `getroffen` (das Teil oder `karton`), `abstand`, `punktX`/`Y`/`Z`, `normaleX`/`Y`/`Z`. Getroffen werden Fühler-Formen (Auslöser nur mit `ausloeser: ja`, Gruppen über `maske`), nie das eigene Teil. **Höhenabfrage:** ein Strahl nach unten über einem Gelände mit `form: \"netz\"` liefert genau die Höhe des gezeichneten Netzes." },
            {
              art: "code",
              ausfuehrbar: true,
              tier: 1,
              uiEreignisse: [{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4},{"typ":"takt","anzahl":4}],
              herdErwartet: [
                {"art":"fenster","titel":"Figur","breite":320,"hoehe":180},
                {"art":"bild","bildnummer":4,"szene":"1f4c11811e140c23","paket":"cbae0962289243b9"},
                {"art":"bild","bildnummer":8,"szene":"f63b07a74d7d1c2e","paket":"bb83fbbca7082fb6"},
                {"art":"bild","bildnummer":12,"szene":"0011e88e4e575439","paket":"07cb1a2c46815111"},
                {"art":"bild","bildnummer":16,"szene":"b5589f1fd71c1417","paket":"59f2e5e5fb8c8513"},
                {"art":"bild","bildnummer":20,"szene":"f441775e79cb2905","paket":"8a4c736c36731d56"},
                {"art":"bild","bildnummer":24,"szene":"86343e8c9395b3ae","paket":"08005ed71ede7c75"},
                {"art":"bild","bildnummer":28,"szene":"da6ac83a251016f8","paket":"6699373e529cfc53"},
                {"art":"bild","bildnummer":32,"szene":"d50289688afc84ad","paket":"8891c17c03e269c6"},
                {"art":"bild","bildnummer":36,"szene":"479ce29149417fd2","paket":"62c768b44e504637"},
                {"art":"bild","bildnummer":40,"szene":"e2bee88c19f9a5d5","paket":"eaf2960fb5bbd778"},
                {"art":"bild","bildnummer":44,"szene":"0086a5034f145044","paket":"1f970dc379cab7ac"},
                {"art":"bild","bildnummer":48,"szene":"a350b9b194957507","paket":"3df613fe848e09c4"},
                {"art":"bild","bildnummer":52,"szene":"ec8ee6275aa57480","paket":"b0d8e6c35aee7108"},
                {"art":"bild","bildnummer":56,"szene":"b5b1e2cd20705f60","paket":"565b48e68675b7e0"},
                {"art":"bild","bildnummer":60,"szene":"5b4f140c4f3818aa","paket":"fb5bba94dfde30fc"},
                {"art":"bild","bildnummer":64,"szene":"2cd7d4533712baeb","paket":"462e0f4bee40d3bb"},
                {"art":"bild","bildnummer":68,"szene":"2837d87c6b2151a4","paket":"b862bb71abc7d00a"},
                {"art":"bild","bildnummer":72,"szene":"69394337892e60b9","paket":"f413daa151dc1917"},
                {"art":"bild","bildnummer":76,"szene":"4e38f8f3aa20af30","paket":"d464361ec8a82a11"},
                {"art":"bild","bildnummer":80,"szene":"65883afacc321fc0","paket":"7fabcc0d7df3055a"},
                {"art":"bild","bildnummer":84,"szene":"c85a5c8f9449a6b1","paket":"4501ec4e8339126f"},
                {"art":"bild","bildnummer":88,"szene":"23ecd7a0dc0787de","paket":"735da347ac318d1b"},
                {"art":"bild","bildnummer":92,"szene":"ba936bbfee6fd26b","paket":"b23853bee7c6e4c8"},
                {"art":"bild","bildnummer":96,"szene":"d2f6ce8b5f7ffa77","paket":"c3bcd6f3175cdf79"},
                {"art":"bild","bildnummer":100,"szene":"23090f9b447b9b00","paket":"4e64d7a4c8104797"},
                {"art":"bild","bildnummer":104,"szene":"e811fc82dd1f259e","paket":"bc3408b35796508f"},
                {"art":"bild","bildnummer":108,"szene":"55e92a1051637637","paket":"0b351aa8fc23ec3f"},
                {"art":"bild","bildnummer":112,"szene":"556d576dc3fd3d66","paket":"517ebe2e21950113"},
                {"art":"bild","bildnummer":116,"szene":"81bd6d634a7c4306","paket":"2c727d3de142c4f0"},
                {"art":"bild","bildnummer":120,"szene":"5f85c42edbde724a","paket":"e36c403112de8aa0"},
                {"art":"bild","bildnummer":124,"szene":"cf8ac903c28aa6c0","paket":"2e9c2ef281bcc268"},
                {"art":"bild","bildnummer":128,"szene":"b3c53dba4ce79295","paket":"c8705eb3a5250cd6"},
                {"art":"bild","bildnummer":132,"szene":"e2f8008a575d9f90","paket":"90c6d15417472a33"},
                {"art":"bild","bildnummer":136,"szene":"0a4b9dc46f37a4ec","paket":"155b2846d67e0edf"},
                {"art":"bild","bildnummer":140,"szene":"ac5842a68ff030b0","paket":"4b3e6893a3fd8c00"},
                {"art":"bild","bildnummer":144,"szene":"d050008bbe541cdf","paket":"94325dee54c02f20"},
                {"art":"bild","bildnummer":148,"szene":"ece0744fe92acbd4","paket":"10152455cc58d2f9"},
                {"art":"bild","bildnummer":152,"szene":"eed33dc46596a017","paket":"7319a8e55e05b65c"},
                {"art":"bild","bildnummer":156,"szene":"a0675ed225690fe0","paket":"1874d092bf7fe916"},
                {"art":"bild","bildnummer":160,"szene":"528462ec60426712","paket":"1fd64c20cb6c1503"}
              ],
              code: z(
                "Herd herd = neu Herd(\"Figur\", breite: 320, hoehe: 180);",
                "herd.kamera().setzeLage(2, 4, 8).schaueAuf(2, 0.5, 0);",
                "Teil boden = herd.koerper(Form.wuerfel(), 0, -0.5, 0, farbe: \"basilikum\").setzeGroesse(12, 1, 12);",
                "boden.mit(neu Fuehler(ausloeser: nein));",
                "für (salami i = 0; i < 4; i++) {",
                "  Teil stufe = herd.koerper(Form.wuerfel(), 1.2 + i * 0.4, (i + 1) * 0.1, 0, farbe: \"kruste\").setzeGroesse(0.4, (i + 1) * 0.2, 2);",
                "  stufe.mit(neu Fuehler(ausloeser: nein));",
                "}",
                "Teil bote = herd.koerper(Form.zylinder(), -1, 0.9, 0, farbe: \"tomate\").setzeGroesse(0.6, 1.8, 0.6);",
                "bote.mit(neu Fuehler(form: \"kapsel\", ausloeser: nein));   // Maße aus dem Zylinder: Radius 0.3, Höhe 1.8",
                "Figur f = bote.mit(neu Figur(laufX: 1.2));",
                "Strahl lot = herd.raum(1.6, 10, 0.6).mit(neu Strahl());",
                "herd.backe(() -> {",
                "  falls (herd.gedrueckt(\"Leertaste\") && f.amBoden()) { f.setzeSprung(5); }",
                "});",
                "Bote.sage((f + \" nach \" + herd.bildnummer() + \" Bildern: Fuß auf \" + (bote.y() - 0.9).runden(2) + \", amBoden \" + f.amBoden()));",
                "Bote.sage((\"Strahl trifft eine Stufe: \" + (lot.getroffen() != karton) + \" in Höhe \" + lot.punktY().runden(2)));"
              )
            },
            { art: "ausgabe", text: z("Figur(8) nach 160 Bildern: Fuß auf 0.82, amBoden ja", "Strahl trifft eine Stufe: ja in Höhe 0.4") },
            { art: "text", md: "Ein ganzes Beispiel ist **Parkour** unter *Beispiele → Herd*: ein Pizzabote in der Schulterperspektive mit Mausfang – Treppen, Rampen, fahrende Plattformen, ein Aufzug, und ein Strahl durchs Fadenkreuz trifft Teigscheiben; ein zweiter Strahl holt die Kamera vor Wände." }
          ]
        }
      ]
    }
  );
})();
