# Projekte, Mehrdatei-Programme, Bilder und Teilen mit Versionen (Konzept, Entwurf zur Freigabe)

> **Status: Konzept (Phase 1).** Nichts hiervon ist umgesetzt. `SPEC.md`, `KLAERUNGEN.md`, `ARCHITEKTUR.md`, `HOST-ABI.md`,
> `WASM.md` und `HERD.md` werden **erst nach Freigabe** angepasst (Paket P0, §11). Die vorgeschlagenen K-Einträge (§12) stehen nur
> hier. Offene Fragen an den Nutzer: §10 (jeweils mit Empfehlung – ohne Rückmeldung gilt die Empfehlung).
>
> **Grundsätze, die überall gelten:** Browser = nativ (K-082) · Interpreter, Wasm und nativer Host bitgleich · keine
> Rückwärtskompatibilität nötig, aber alle Beispiele, Doku-Beispiele und Tests laufen · keine echten Domains (nur
> `pizza.example.com`) · einfache, lustig benannte High-Level-Konzepte · einfach, aber erweiterbar.

Nutzerwunsch: „Unsere Codebasis wird ziemlich groß. Füge Mehrdatei-Unterstützung hinzu und organisiere die Projekte in Ordnern, nicht
in Dateien. Das Teilen muss gründlich umgebaut werden, weil wir Hastebin dafür nicht verwenden können. Und füge Mehr-Versionen-
Unterstützung hinzu, sodass ein Teilen-Link ‚aktualisiert‘ werden kann.“ Präzisierung: „Ziel ist, tatsächlich **Texturen** und mehrere
Dateien zur Strukturierung von Code zu verwenden.“

Inhalt: §0 Kurzfassung · §1 Projektformat · §2 Teil A Modulsystem · §3 Teil B Projekte als Ordner · §4 Teil C Teilen-Dienst ·
§5 Teil D Bilder und Dateien (Assets) · §6 Auswirkungen je Komponente · §7 Migrationsplan Beispiele · §8 Sicherheit und Datenschutz ·
§9 Verworfene Alternativen · §10 Offene Fragen · §11 Paketplan · §12 Vorgeschlagene K-Einträge

---

## 0. Kurzfassung – alle Entscheidungen auf einen Blick

| # | Entscheidung | Warum | Verworfen (Kurzgrund) |
|---|---|---|---|
| E1 | Ein **Projekt** ist ein Ordner; Projektdatei **`pizza.json`** (optional), Hauptdatei Standard **`hauptgang.pizza`** | sprechend, passt zum Einstieg `hauptgang`; ohne Projektdatei lauffähig | `rezept.json` (Kollision mit Typ `Rezept`), Pflicht-Projektdatei (Hürde für Kleinstprojekte) |
| E2 | Ein Projekt ist **eine Dateisammlung** `{ pfad → Inhalt }` – dieselbe Form in Interpreter-API, Worker, CLI, ZIP, Teilen-Dienst, pkarton | eine Datenform für A–D, keine Umrechnungen | je Teil eigene Formate |
| E3 | Pfade: relativ zur Projektwurzel, `/`, nur `a-z 0-9 - _ .`, Segmente nicht mit `.` beginnend, kein `..`, ≤ 120 Zeichen, ≤ 8 Ebenen | Windows (Groß/klein egal), ZIP und URLs ohne Sonderfälle; schließt Pfad-Ausbruch aus | Unicode-/Großbuchstaben-Pfade (Kollisionen auf Windows, Normalisierungsprobleme) |
| E4 | Modul-Anweisung **`bestellt "rezepte/teig.pizza";`** – kontextuelles Schlüsselwort (nicht reserviert), nur auf oberster Ebene | lustig, eindeutig parsebar (Bezeichner + Textliteral ist sonst nie gültig), bricht keinen Bezeichner | `import "…"` umwidmen (unlustig, `import x.y.*;` hat schon andere, ignorierte Bedeutung); reserviertes Wort |
| E5 | **Ein Projekt-Namensraum** für oberste Deklarationen; gleicher Name in zwei Dateien → Startfehler | einfachste Regel, keine qualifizierten Namen nötig, Texte (`alsText`, Fehlermeldungen) bleiben unverändert | Namensraum je Datei mit `teig.Teig` (Umbau der Namensauflösung in zwei Motoren, Textformen ändern sich) |
| E6 | **Sichtbarkeit:** eine Datei sieht ihre eigenen Deklarationen und die der Dateien, die sie **direkt** bestellt; `geheimrezept` auf oberster Ebene = nur in der eigenen Datei | `bestellt` hat Bedeutung, Abhängigkeiten sind ablesbar; vorhandener Modifikator | transitive Sichtbarkeit (versteckte Abhängigkeiten), gar keine Prüfung (`bestellt` wäre Deko) |
| E7 | Prüfung von E5/E6 als **Startprüfung** im gemeinsamen Code (`PizzaLang.intern.pruefe`) – konservativ, nie falsch-positiv | Compiler und Interpreter nutzen dieselbe Funktion → bitgleich ohne doppelte Umsetzung | Laufzeitprüfung in beiden Motoren |
| E8 | **Nebendateien** enthalten nur Deklarationen (Klassen, Rezepturen, quattrostagioni, Top-Level-Funktionen), Top-Level-**Variablen** und `bestellt`; sonstige Anweisungen und `hauptgang` nur in der Hauptdatei | Ablauf bleibt in einer Datei lesbar; Ladereihenfolge betrifft nur Initialisierungen | Snack-Code überall (unübersichtliche Reihenfolge) |
| E9 | **Ladereihenfolge:** Tiefensuche ab Hauptdatei, `bestellt` in Textreihenfolge, Abhängigkeiten zuerst, jede Datei einmal, Hauptdatei zuletzt; nicht erreichbare Dateien gehören nicht zum Programm; **Zyklus = Fehler** | deterministisch, ohne Sortierregeln; entspricht dem Lesen von oben nach unten | alphabetisch (überraschend), Zyklen erlauben (Initialisierungsreihenfolge unklar) |
| E10 | Fehlerorte: Ereignisse bekommen Feld **`datei`**; Texte nennen die Datei **nur außerhalb der Hauptdatei** („(rezepte/teig.pizza, Zeile 12)“); `datei` ist `null`, solange das Programm aus genau einer `.pizza`-Datei besteht | alle bestehenden `.erwartet`/`.fehler`/Doku-Texte bleiben gültig | Datei immer im Text (alle Testdateien neu) |
| E11 | **Host-ABI v2:** `warnung`/`fehler` bekommen `datei_ptr, datei_len`; `abi_version()` = 2; pkarton bleibt **ein** Wasm-Modul | Host muss nichts über Projekte wissen; keine Abschnitts-Parser im Host | Dateiindex + Tabelle in Custom Section (jeder Host bräuchte einen Abschnittsleser) |
| E12 | **Assets** (Bilder, Textdateien) liegen im Projektordner und werden ins pkarton als **Datensegment** eingebettet; EXE-Format (`PKARTON1`-Anhang) unverändert | „ein Modul, kein Container“ (HOST-ABI §1) bleibt wahr, Host liest nichts nach | zweiter Anhang/Container, Host-Import `datei_lesen` |
| E13 | **PNG** wird im **Herd-Kern (Rust, no_std)** dekodiert – überall derselbe Code (`kern.wasm` im Browser/Interpreter/Wasm, nativ eingebaut) | bitgleich per Konstruktion; Browser-Decoder (Farbmanagement, Gamma) wären es nicht | Browser `createImageBitmap`/Canvas (nicht bitgleich), Dekodierung in `pizza.js` (zweite Implementierung) |
| E14 | Sprach-API: **`Bildchen.laden("bilder/teig.png")`** (Herd) und **`Kiste`** für Projektdateien (`Kiste.text`, `Kiste.zeilen`, `Kiste.gibts`, `Kiste.liste`) – nur lesend | kleine Fläche, passt zu bestehendem `Bildchen`; „Kiste“ = Lieferkiste des Projekts | Dateisystem-API (nativ-only, widerspricht K-082) |
| E15 | Playground speichert Projekte in **IndexedDB** (Dateien inkl. Binärdaten); `localStorage` nur für kleine Einstellungen | Bilder sprengen das 5-MB-Limit von localStorage; IndexedDB speichert `Uint8Array` direkt | localStorage + Base64 (zu klein, 33 % Aufschlag) |
| E16 | **Ein aktives Projekt je Fenster**, Tabs = offene Dateien dieses Projekts; Projektliste zum Wechseln | einfach, eindeutig, was „Ausführen“ startet | gemischte Tabs aus mehreren Projekten |
| E17 | **ZIP** Import/Export ohne Bibliothek (Export „stored“, Import „stored“ + Deflate über `DecompressionStream`) | keine Abhängigkeit, CSP bleibt | JSZip o. ä. (Abhängigkeit, Bundle-Größe) |
| E18 | Eigener Teilen-Dienst **„Durchreiche“** (Node, **keine** Abhängigkeiten), Container ersetzt hastebin + redis; Ablage im Volume als Dateien | schlank, prüfbar, keine Lieferkette; Node ist im Repo ohnehin Pflicht | Rust-Dienst (mehr Bauzeit), SQLite (Abhängigkeit), weiter Hastebin (nicht nutzbar) |
| E19 | Speicher **inhaltsadressiert** (SHA-256-Blobs) + je Version ein **Manifest**; Hochladen: fehlende Blobs ermitteln → einzeln hochladen → Manifest | Dedup über Versionen und Links hinweg (Texturen nur einmal), kleine Requests | ein großer JSON-Body mit Base64 je Version |
| E20 | **Link-ID** stabil (12 Zeichen Base62, ≈ 71 bit), **Bearbeitungsschlüssel** 256 bit, nur einmal ausgeliefert, serverseitig nur als Hash; Link zeigt die **neueste** Version, `@n` eine feste | „Link aktualisieren“ ohne Konten; nicht erratbar | Konten/Anmeldung (Datenschutz, Aufwand), Schlüssel im Link |
| E21 | Links: **`#h=<id>`**, **`#h=<id>@<n>`**, **`#app=<id>`**, **`#app=<id>@<n>`** | wie bisher, nur ID-Format neu | Pfad-URLs (Server-Routing nötig) |
| E22 | Aufbewahrung: **90 Tage ab letzter Version** (Umgebungsvariable `TEILEN_ABLAUF_TAGE`, 0 = unbegrenzt); `/api/konfig` liefert sie der Dienst selbst | eine Quelle statt zweier gleich zu haltender Variablen | Ablauf ab Erstellung (aktualisierte Links würden trotzdem sterben) |
| E23 | Beispiele: **jedes Beispiel ein Ordner** `site/beispiele/<kategorie>/<projekt>/` mit `pizza.json` und Testordner **`pruefung/`**; Manifest nennt Ordner + Dateiliste | selbstbeschreibende Projekte; statisches Hosting kann keine Ordner auflisten | Dateiliste nur in `pizza.json` (Galerie müsste jede Projektdatei laden) |
| E24 | Einzeldatei-Programme bleiben **gültig** (= Ein-Datei-Projekt): CLI, API (`run(string)`), Testfälle, Doku-Blöcke | Übergang (Pizza-Imperium) und Kleinstprogramme bleiben einfach | Zwang zum Ordner |

---

## 1. Projektformat (gemeinsame Grundlage für A–D)

### 1.1 Aufbau

```
teigball/                         ← Projektwurzel (Ordnername = Standard-Projektname)
├── pizza.json                    ← Projektdatei (optional)
├── hauptgang.pizza               ← Hauptdatei (Standardname)
├── welt/tisch.pizza              ← Nebendateien, beliebig in Ordnern
├── welt/beläge.pizza             ✗ ungültig (ä) → welt/belaege.pizza
├── bilder/tischdecke.png         ← Assets (§5)
├── daten/level-1.txt
└── pruefung/                     ← Testdateien (nur Repo/Harnische, gehören NICHT zum Programm)
    ├── erwartet, ereignisse, herd-erwartet, ui-erwartet, eingabe, exitcode, warnungen, fehler, optionen.json, vorrat.json
```

### 1.2 `pizza.json`

```json
{
  "pizza": 1,
  "name": "Teigball",
  "hauptdatei": "hauptgang.pizza",
  "beschreibung": "Rolle eine Teigkugel über die Riesenpizza.",
  "args": []
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `pizza` | ja | Formatversion (1). Unbekannt/höher → Ladefehler `PizzaFehler HOST: Diese Projektdatei braucht eine neuere pizza-Version.` |
| `name` | nein | Anzeigename (Titel des App-Links, Projektliste, EXE-Dateiname); Standard: Ordnername bzw. Name der Hauptdatei ohne `.pizza`; ≤ 80 Zeichen, Steuerzeichen entfernt (wie heute `saeubereName`) |
| `hauptdatei` | nein | Pfad der Hauptdatei; Standard `hauptgang.pizza`, sonst – falls es genau **eine** `.pizza`-Datei gibt – diese |
| `beschreibung` | nein | ≤ 500 Zeichen, nur Anzeige (Galerie, Teilen-Vorschau) |
| `args` | nein | Standard-Argumente für `hauptgang` (Playground-Feld „Argumente“, CLI ohne Argumente) |

Unbekannte Felder werden ignoriert (erweiterbar: z. B. später `koeche`, `symbol`). **Bewusst nicht** in `pizza.json`: Fenstergröße,
Titel von Theke/Herd – die stehen im Code (`neu Herd("…", breite: …)`), sonst gäbe es zwei Quellen.

### 1.3 Pfadregeln (E3)

- Pfad = Segmente mit `/`, je Segment `[a-z0-9_-][a-z0-9_.-]*` (nicht mit `.` beginnend), keine leeren Segmente, kein `.`/`..`,
  Gesamtlänge ≤ 120, ≤ 8 Ebenen. Ordner `pruefung/` an der Wurzel ist für Tests reserviert und gehört nicht zum Programm.
- Gleiche Prüfung (eine Funktion `PizzaLang.intern.pruefePfad`) in Interpreter, CLI, Playground (Umbenennen, ZIP-Import), Teilen-Dienst.
  Der Dienst prüft **unabhängig** noch einmal (eigene Kopie der Regel, durch gemeinsame Testfälle abgesichert).
- Erlaubte Dateiarten v1: `.pizza`, `.png`, `.txt`, `.json`, `.csv`, `.md` (Beschreibung/Notizen; nur Anzeige). Andere Endungen →
  im Playground nicht anlegbar, beim ZIP-Import übersprungen (mit Meldung), CLI ignoriert sie mit Warnung auf stderr.

### 1.4 Die Dateisammlung (E2) – überall dieselbe Form

```js
{ hauptdatei: "hauptgang.pizza", name: "Teigball",
  dateien: { "hauptgang.pizza": "…Text…", "welt/tisch.pizza": "…", "bilder/tischdecke.png": Uint8Array, "pizza.json": "…" } }
```
Texte (`.pizza .txt .json .csv .md`) als String (UTF-8), alles andere als `Uint8Array`. `pizza.json` darf fehlen; ist sie da, werden
`name`, `hauptdatei` und `args` der Sammlung **aus ihr abgeleitet** (`PizzaLang.projekt.ausDateien`) – es gibt keine zweite Quelle.

### 1.5 Ein-Datei-Programme (E24)

Ein String ist eine Sammlung `{ dateien: { "hauptgang.pizza": code }, hauptdatei: "hauptgang.pizza" }`. **Regel für alle Motoren und
Eingabeformen:** Besteht das Programm (die erreichbaren Dateien, §2.2) aus genau **einer** `.pizza`-Datei, ist das Feld `datei` der Ereignisse
`null` und kein Text nennt eine Datei – egal ob als String, CLI-Datei oder Ein-Datei-Projekt geladen. So vergleichen Differenztests nie
`null` mit einem Pfad, und keine bestehende Testdatei ändert sich. `bestellt` in einem Ein-Datei-Programm ohne
Sammlung → `PizzaFehler P0015` (Datei fehlt). CLI: `node bin/pizza.js spiel/hauptgang.pizza` → Projektwurzel = nächster Ordner aufwärts
mit `pizza.json`, sonst der Ordner der Datei; die angegebene Datei ist die Hauptdatei.

---

## 2. Teil A – Mehrdatei-Programme (Sprache)

### 2.1 Syntax

```pizza
// hauptgang.pizza
bestellt "rezepte/teig.pizza";
bestellt "rezepte/belag.pizza";

speisekarte klasse Pizzeria {
    speisekarte tiefkühl leer hauptgang(Blech<margherita> args) {
        Teig t = neu Teig(250);
        Bote.sage((Belag.HAUS + " auf " + t));
    }
}
```
```pizza
// rezepte/teig.pizza
klasse Teig {
    salami gramm;
    Teig(salami g) { gramm = g; }
    margherita alsText() { serviere gramm + " g Teig"; }
}
geheimrezept funghi salzAnteil() { serviere 0.02; }   // nur in dieser Datei
```

- `bestellt "<pfad>";` – nur auf oberster Ebene, vor oder zwischen Deklarationen (Position egal, wie `paket`/`import`). Das Argument ist
  ein **Textliteral** (keine Ausdrücke, keine Escapes außer den üblichen). Pfad **relativ zur Projektwurzel** (nicht zur Datei), Regeln §1.3,
  Endung `.pizza` Pflicht. Kontextuelles Schlüsselwort: `bestellt` bleibt als Bezeichner gültig (Prüfung: im Korpus kommt `bestellt` nur
  in Texten/Ausgaben vor, nie als Bezeichner).
- Doppelte Bestellung derselben Datei in einer Datei → Warnung `W0105: "rezepte/teig.pizza" ist schon bestellt.` (harmlos).
- Eine Datei darf sich nicht selbst bestellen → Zyklus (P0014).
- `paket …;` und `import x.y.*;` bleiben erlaubt und **ignoriert** (SPEC §2).

### 2.2 Programm = erreichbare Dateien, Ladereihenfolge (E9)

1. Start bei der Hauptdatei. Für jede Datei: parsen, ihre `bestellt` in **Textreihenfolge** besuchen (Tiefensuche), danach die Datei selbst
   in die **Ladeliste** aufnehmen (Abhängigkeiten zuerst). Schon besuchte Dateien werden übersprungen. Die Hauptdatei steht damit zuletzt.
2. Eine Datei, die gerade besucht wird, erneut zu erreichen = **Zyklus** → `PizzaFehler P0014: Kreisbestellung: hauptgang.pizza → a.pizza → b.pizza → a.pizza.`
   (Position: das `bestellt`, das den Kreis schließt).
3. Fehlende Datei → `PizzaFehler P0015: Die Datei "rezepte/tieg.pizza" gibt es im Projekt nicht.`; ungültiger Pfad →
   `PizzaFehler P0015: "Rezepte/Teig.pizza" ist kein gültiger Dateipfad (nur a–z, 0–9, -, _, . und /).`
4. `.pizza`-Dateien, die nicht erreichbar sind, gehören nicht zum Programm (keine Warnung – im Playground grau markiert).
5. **Syntaxfehler** werden in Ladereihenfolge gemeldet; der erste beendet den Start (wie heute: ein Syntaxfehler, Exit 2).

**Ablauf (erweitert SPEC §2 „Snack-Modus“):** (1) alle Deklarationen **aller** geladenen Dateien registrieren (Hoisting, Ladereihenfolge),
(2) Top-Level-Variablen der Nebendateien in Ladereihenfolge initialisieren, (3) Top-Level-Anweisungen der Hauptdatei, (4) `hauptgang`.
Statische Initialisierungen, Annotationen (`@Kühlschrank` …) und W0666/W0032-Analyse laufen in Ladereihenfolge, innerhalb einer Datei wie
heute. Laden und Bestellen kosten **keine Schritte** – Schrittzahlen eines Programms ändern sich nicht, wenn man es auf Dateien aufteilt
(Prüfstand-Fall: dasselbe Programm als eine und als drei Dateien → identische Ereignisse inkl. `schritte`/`zeitMs`, nur `datei`-Felder
verschieden).

### 2.3 Nebendateien (E8)

Erlaubt: `bestellt`, `paket`, `import`, Klassen, Rezepturen, quattrostagioni, Top-Level-Funktionen, Top-Level-Variablen (auch `gebacken`,
mit beliebigem Initialisierer). Jede andere Anweisung →
`PizzaFehler P0017: In rezepte/teig.pizza dürfen nur Rezepte stehen (Klassen, Funktionen, Variablen) – Anweisungen gehören in die Hauptdatei hauptgang.pizza.`
**`hauptgang` gehört in die Hauptdatei:** eine Methode oder Top-Level-Funktion `hauptgang` in einer Nebendatei →
`PizzaFehler P0017: hauptgang gehört in die Hauptdatei hauptgang.pizza, nicht nach rezepte/teig.pizza.` In der Hauptdatei wird er wie heute
gesucht (K-033: erste Klasse mit `hauptgang`, sonst Top-Level-Funktion). Damit ist der Einstieg immer eindeutig, unabhängig von der
Ladereihenfolge.

### 2.4 Namen und Konflikte (E5)

- Alle obersten Namen (Klassen, Rezepturen, quattrostagioni, Top-Level-Funktionen, Top-Level-Variablen) liegen in **einem**
  Projekt-Namensraum. Derselbe Name in zwei Dateien →
  `PizzaFehler P0016: 'Teig' gibt es zweimal – in rezepte/teig.pizza (Zeile 3) und in hauptgang.pizza (Zeile 10).` (Position: das
  spätere in Ladereihenfolge). Das gilt auch für `geheimrezept`-Namen (Namen bleiben projektweit eindeutig – einfache Regel, kein Verstecken).
- Überladung von Top-Level-Funktionen (gleicher Name, andere Arität) **über Dateigrenzen hinweg** → ebenfalls P0016 (Überladungen gehören
  in eine Datei).
- Innerhalb **einer** Datei gilt alles wie bisher.
- Eingebaute Klassen (Theke-Zutaten, Herd-Klassen): „eine eigene Klasse gleichen Namens hat Vorrang“ gilt projektweit.

### 2.5 Sichtbarkeit (E6, E7)

- Eine Datei **sieht**: ihre eigenen obersten Namen + die nicht-`geheimrezept` obersten Namen der Dateien, die sie **direkt** bestellt.
  Die Standardbibliothek und eingebaute Klassen sind immer sichtbar.
- **Prüfung (Startprüfung, Teil von `PizzaLang.intern.pruefe`, deterministisch, Reihenfolge = Ladereihenfolge, dann Position):**
  Für jede Datei F und jedes Bezeichner-Token t in F, das (a) nicht direkt hinter `.` steht, (b) kein benanntes Argument `t:` ist,
  (c) gleich einem obersten Namen N einer anderen Datei G ist und (d) **nicht** in F als lokale Variable, Parameter, Lambda-Parameter oder
  Mitglied deklariert ist und **kein** Mitgliedsname irgendeiner Klasse des Projekts ist:
  - N ist `geheimrezept` → `PizzaFehler P0018: 'salzAnteil' ist ein Geheimrezept von rezepte/teig.pizza.`
  - G wird von F nicht direkt bestellt → `PizzaFehler P0019: 'Teig' kommt aus rezepte/teig.pizza – bestelle die Datei hier: bestellt "rezepte/teig.pizza";`
- Die Regel ist **konservativ**: Sie meldet nie etwas, das gültig wäre (wegen (d) überspringt sie mehrdeutige Fälle). In diesen seltenen
  Fällen läuft das Programm einfach (Namensraum ist ja projektweit). Weil Interpreter und Compiler dieselbe Funktion aufrufen, ist das
  Verhalten in allen Motoren gleich.
- Mitglieder (`speisekarte`/`familienrezept`/`geheimrezept` an Feldern/Methoden) verhalten sich **unverändert** – Klassengrenzen, nicht
  Dateigrenzen.

### 2.6 Fehlerorte (E10)

- Ereignisse `fehler` und `warnung` erhalten das Feld **`datei`** (Projektpfad; `null` bei Programmen aus genau einer Datei, §1.5).
  `zeile`/`spalte` beziehen sich auf diese Datei.
- Texte: In der Hauptdatei unverändert („Ungefangene Ananas – … (Zeile 12)“). In anderen Dateien „(rezepte/teig.pizza, Zeile 12)“ – dasselbe Muster wie in der CLI.
  CLI (K-083): `<text> (Zeile Z, Spalte S)` bzw. `<text> (rezepte/teig.pizza, Zeile Z, Spalte S)`.
- Die Startprüfungen P0014–P0019 und Syntaxfehler tragen die Datei, in der die Ursache steht.
- **Stapel:** Bei ungefangener Ananas zählt der Ort, an dem sie entsteht (wie heute) – keine Aufrufkette (unverändert).

### 2.7 API (Interpreter, `site/js/pizza.js`)

```js
PizzaLang.run(quelle, optionen)           // quelle: string (Ein-Datei) | Projekt { dateien, hauptdatei?, name? } (§1.4)
PizzaLang.parse(quelltext)                // unverändert (eine Datei, Live-Diagnose)
PizzaLang.projekt.lade(projekt)           // → { ok, ladeliste: [pfad], ast, dateien: [pfad…], fehler? } – gemeinsamer Lader (Interpreter + Compiler)
PizzaLang.projekt.ausDateien(dateien)     // pizza.json auswerten → { name, hauptdatei, args, dateien }
PizzaLang.projekt.pruefePfad(pfad)        // → null | Fehlertext
```
Jeder AST-Knoten kennt seine Datei (Index in `dateien`); der Lader liefert **ein** zusammengesetztes Programm in Ladereihenfolge. Der
Wasm-Compiler (`frontend.js`) nimmt dieses Programm statt eines einzelnen ASTs → identische Hoisting-/Initialisierungsreihenfolge.

### 2.8 Wasm, pkarton, Host (E11, E12)

- `Pizzaiolo.kompiliere(quelle, optionen)` und `Pizzaiolo.run(quelle, …)` nehmen dieselbe `quelle` wie `PizzaLang.run`. **Alle**
  erreichbaren Dateien landen in **einem** Modul; Assets als Datensegment (§5.5).
- **HOST-ABI v2:** `warnung(code, text, datei_ptr, datei_len, zeile, spalte)`, `fehler(art, code, text, datei_ptr, datei_len, zeile, spalte)`;
  `datei_len` 0 = `null`. `abi_version()` → 2. Hosts lehnen 1 mit Ladefehler ab (keine Rückwärtskompatibilität nötig; alle `.pkarton`
  entstehen ohnehin neu). Custom Section `pizzaiolo`: zusätzlich `"projekt": { "name", "dateien": n }` (informativ).
- Nativer Host (`pizza-host`, EXE): nur die neue Signatur; sonst keine Änderung – er kennt weiter nur ein `.pkarton`.
- Differenztests: Ereignisse inklusive `datei` werden in allen drei Motoren verglichen.

### 2.9 CLI

`node bin/pizza.js <ordner | ordner/pizza.json | datei.pizza> [args…]` – Ordner/Projektdatei → Projekt; Datei → §1.5. `--ast` gibt die
Ladeliste und die ASTs aus. Der Kompilier-Weg zur EXE (überall, wo heute `.pizza` → `.pkarton`) nimmt ebenfalls Ordner. Fehlerausgabe
nach §2.6.

---

## 3. Teil B – Projekte als Ordner (Playground, Beispiele, EXE, App-Link)

### 3.1 Bedienkonzept

```
┌ Kopf: [≡ Projekt ▾ Teigball]  [▶ Backen] [Argumente] [Teilen] [EXE] …                        ┐
├──────────────┬───────────────────────────────────────────────────────────────────────────────┤
│ Teigball     │ [★ hauptgang.pizza] [welt/tisch.pizza ×] [bilder/tischdecke.png ×]             │
│ ★ hauptgang  │                                                                               │
│ ▾ welt       │   Editor / Bildvorschau                                                        │
│    tisch     │                                                                               │
│ ▾ bilder     │                                                                               │
│    tischdecke│                                                                               │
│ + Datei  + Ordner │ Konsole / Theke / Herd-Fenster (unverändert)                              │
└──────────────┴───────────────────────────────────────────────────────────────────────────────┘
```

- **Projektmenü** (≡): Neues Projekt · Projekt öffnen (Liste mit Suche, zuletzt geändert zuerst) · Umbenennen · Duplizieren · Löschen
  (mit Rückfrage im Seiten-Dialog, kein Browser-Popup) · Als ZIP herunterladen · ZIP importieren · Als EXE … · Teilen …
- **Dateibaum** (links, einklappbar; Handy: Schublade): Datei/Ordner anlegen, umbenennen (Pfadregeln live geprüft), verschieben per
  Drag & Drop, löschen, „Als Hauptdatei“ (★). Bilder per Drag & Drop oder „Datei hinzufügen“ hochladen. Nicht erreichbare `.pizza`-Dateien
  grau mit Hinweis „wird von keiner Datei bestellt“. `pizza.json` erscheint als normale Datei (Text, mit Prüfung).
- **Tabs** = geöffnete Dateien des aktiven Projekts (bestehende Tab-Funktionen: Anheften, Schließen, Wiederherstellen, Drag & Drop,
  Mausrad, „Alle Tabs“). Tab-Titel = Dateiname, bei Mehrdeutigkeit mit Ordner.
- **Ausführen** startet immer das **Projekt** (Hauptdatei), egal welcher Tab aktiv ist. Ein-Datei-Projekte verhalten sich wie heute.
- **Fehler springen:** Klick auf einen Fehler/eine Warnung (Konsole, Editor-Diagnose) öffnet `datei` als Tab und setzt den Cursor.
  Live-Diagnose: Syntax je Datei beim Tippen (wie heute), Projektprüfungen (P0014–P0019) beim Speichern mit kurzer Verzögerung.
- **Vervollständigung:** oberste Namen aller Projektdateien; Vorschlag „bestellt "…" ergänzen“ als Schnellkorrektur zu P0019.
- **Bildvorschau:** Bilddateien öffnen eine Vorschau (Pixelgröße, Dateigröße, pixelscharfe Zoomstufen) – angezeigt über ein `data:`-URL
  bzw. Canvas (CSP `img-src 'self' data:` bleibt, keine `blob:`-Bilder). Die **Gültigkeitsprüfung** (PNG-Format, Größe) macht der Herd-Kern
  (§5.3) – dieselbe Meldung wie zur Laufzeit.
- Textdateien (`.txt .json .csv .md`) öffnen im Editor ohne pizza-Hervorhebung.

### 3.2 Lokale Speicherung (E15, E16)

- IndexedDB-Datenbank `pizza`, Version 1:
  - `projekte` (Schlüssel `id`): `{ id, name, hauptdatei, args, erstellt, geaendert, offen: [pfad…], aktiv: pfad, angeheftet: [pfad…],
    quelle: null | "beispiel:<id>" | "teilen:<id>@<n>", teilen: null | { id, version, schluessel? } }`
  - `dateien` (Schlüssel `[projektId, pfad]`): `{ inhalt: string | Uint8Array, basis }` (`basis` = Stand für „geändert“-Punkt).
- Undo-Historie, Cursor, Scroll bleiben im Speicher (wie heute). Speichern mit Verzögerung (wie heute), außerdem bei `pagehide`.
- Mehrere Playground-Fenster: `BroadcastChannel("pizza-projekte")` meldet Änderungen; das andere Fenster lädt die betroffene Datei neu,
  falls sie dort nicht ungespeichert geändert ist (sonst Hinweis „in einem anderen Fenster geändert“ – zuletzt gespeichert gewinnt).
- Kein `navigator.storage.persist()` (kann in Firefox eine Browser-Abfrage zeigen); Hinweis in „Über“: Browser dürfen Daten bei
  Speichermangel löschen – ZIP-Export sichert.
- Kleine Einstellungen (Thema, Köche, Doku-Seite, feste Saat) bleiben in `localStorage`.
- **Vorratskammer:** Präfix je Projekt = Projektname (wie heute der Tab-Name), App-Link nutzt denselben Präfix → wie heute teilen sich
  Playground-Projekt und App-Link gleichen Namens ihre Kammern; Namensraum-Kammern (`raum/name`, K-106) unverändert global.
- **Migration** (einmalig beim ersten Start): jeder Tab aus `pizza.tabs` wird ein Ein-Datei-Projekt (Name = Tab-Name ohne `.pizza`,
  Datei `hauptgang.pizza`, `args` übernommen); `pizza.tabs` wird danach entfernt. Geschlossene Tabs („Wiederherstellen“) → Projekte im
  Papierkorb (Liste „Zuletzt gelöscht“, 10 Einträge, wie `MAX_GESCHLOSSEN`).

### 3.3 Beispiele im Playground

Ein Beispiel öffnen legt eine **Projektkopie** an (`quelle: "beispiel:<id>"`); erneutes Öffnen springt in diese Kopie, solange sie
unverändert ist, sonst Wahl „Zu meiner Kopie“ / „Frische Kopie“. Die Dateien lädt der Playground anhand der Dateiliste im Manifest (§7.2);
`pruefung/` wird nicht geladen.

### 3.4 ZIP (E17)

- **Export:** Ordner `<projektname>/…` mit allen Dateien inkl. erzeugter `pizza.json` (falls nicht vorhanden), Methode „stored“, CRC-32,
  UTF-8-Namensflag. Kleiner eigener Schreiber (~80 Zeilen) in `ui/src/zip.js`.
- **Import:** „stored“ und „deflate“ (`DecompressionStream("deflate-raw")`); haben alle Einträge einen gemeinsamen Wurzelordner, wird er
  entfernt; Pfade nach §1.3 geprüft (ungültig → übersprungen und gemeldet; nie außerhalb des Projekts = kein Zip-Slip); Grenzen wie §4.6
  (Dateizahl, Einzel-/Gesamtgröße, **entpackt** gemessen, Abbruch beim Überschreiten während des Entpackens = keine ZIP-Bombe);
  Verschlüsselung/ZIP64 → Meldung „Diese ZIP-Datei kann der Playground nicht lesen.“
- CLI braucht kein ZIP (Ordner sind dort nativ).

### 3.5 EXE-Export und App-Link

- **EXE:** Projekt kompilieren (alle Dateien + Assets, §5.5) → `PizzaExe.baue(pkarton, ziel)` wie heute; Dateiname aus `name`.
  Fehlende Importgruppen (`PizzaExe.fehlendeGruppen`) wie heute.
- **App-Link** `#app=<id>[@n]`: lädt das Manifest und die Blobs (§4), baut die Sammlung, startet wie heute im Vollbild; Titel = `name`.
  „Code ansehen“ öffnet `#h=<id>[@n]` (Projekt im Playground).
- **Code-Link** `#h=<id>[@n]`: öffnet das geteilte Projekt als lokale Kopie (`quelle: "teilen:<id>@<n>"`); ist die ID die eines eigenen
  Projekts mit Schlüssel, wird **dieses** Projekt fokussiert (ggf. Hinweis „neuere Version auf dem Server – laden?“ im Seitenbanner).

### 3.6 Worker-Protokoll (ARCHITEKTUR §2)

`{ typ: "start", projekt: { dateien, hauptdatei, name }, args? }` – Binärdateien als `ArrayBuffer`-Transfer. `code` als Ein-Datei-Abkürzung
bleibt erlaubt.

---

## 4. Teil C – Teilen-Dienst „Durchreiche“ (ohne Hastebin, mit Versionen)

### 4.1 Überblick

```
Browser ──https──▶ nginx (pizza, einzige Domain)  ──/api/teilen…, /api/konfig──▶  durchreiche:8291 (nur internes Netz)
                                                                                      └─ Volume durchreiche-daten:/daten
```
- Verzeichnis `durchreiche/` im Repo: `server.mjs` (Node ≥ 22, nur `node:`-Module), `lager.mjs` (Ablage), `regeln.mjs` (Pfade/Grenzen),
  `test/*.test.mjs` (`node --test`), `Dockerfile` (`node:<gepinnt>-alpine`, `USER node`, `read_only`, nur `/daten` beschreibbar).
- Ersetzt die Dienste `hastebin` und `redis`, das Verzeichnis `hastebin/` und das Volume `hastebin-daten`.

### 4.2 Datenmodell

- **Blob:** Dateiinhalt, adressiert über SHA-256 (64 Hex). Unveränderlich, dedupliziert über alle Links und Versionen.
- **Manifest** (selbst ein Blob, JSON, kanonisch serialisiert):
  `{ "format": "pizza-projekt/1", "name", "hauptdatei", "beschreibung"?, "args"?, "dateien": [ { "pfad", "sha256", "groesse" } ] }`
  (Dateien nach Pfad sortiert).
- **Link:** `{ id, schluesselHash, erstellt, geaendert, versionen: [ { n, manifest: sha256, zeit } ] }` – `n` ab 1, lückenlos.
- Zeitangaben auf ganze Tage gerundet (UTC-Datum), damit möglichst wenig Nutzungsdaten entstehen.

### 4.3 HTTP-Schnittstelle (über nginx unter `/api/`)

| Methode + Pfad | Zweck | Antwort |
|---|---|---|
| `GET /api/konfig` | Fähigkeiten für die UI | `{ "teilen": true, "aufbewahrungTage": 90, "aufbewahrungAb": "letzteVersion", "grenzen": { "dateien": 100, "dateiBytes": 2097152, "projektBytes": 8388608 } }`; Dienst nicht erreichbar → nginx liefert `{"teilen":false}` |
| `POST /api/blob/fehlend` | Body `{ "sha256": [ … ] }` (≤ 101 Einträge) | `{ "fehlend": [ … ] }` |
| `PUT /api/blob/<sha256>` | Body = Rohbytes (≤ `dateiBytes`) | `201` neu / `200` vorhanden; Hash wird geprüft (`422` bei Abweichung) |
| `GET /api/blob/<sha256>` | Inhalt | `application/octet-stream`, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment` |
| `POST /api/teilen` | Body = Manifest | neuer Link: `201 { "id", "version": 1, "schluessel" }`; fehlende Blobs → `409 { "fehlend": [ … ] }` |
| `POST /api/teilen/<id>` | Body = Manifest, Kopf `Authorization: Bearer <schluessel>` | neue Version: `201 { "id", "version": n }`; falscher Schlüssel `403`; unbekannt/abgelaufen `404` |
| `GET /api/teilen/<id>` | neueste Version | `{ "id", "version", "versionen", "geaendert", "ablauf", "projekt": <Manifest> }`, `Cache-Control: no-cache` |
| `GET /api/teilen/<id>@<n>` | feste Version | wie oben, `Cache-Control: public, max-age=31536000, immutable` (Ablauf trotzdem nach §4.5) |
| `DELETE /api/teilen/<id>` | Link samt allen Versionen löschen (mit Schlüssel) | `204` |
| `GET /healthz` | nur intern (Healthcheck) | `200 ok` |

- Ablauf beim Teilen (Client, `ui/src/teilen.js`): Manifest bauen → `fehlend` fragen → fehlende Blobs nacheinander hochladen → Manifest
  posten (bei `409` einmal wiederholen). Eine **neue Version** mit unveränderten Bildern lädt nur die geänderten Textdateien hoch.
- Gleiches Manifest wie die neueste Version → keine neue Version, Antwort `200 { "id", "version": <alt>, "unveraendert": true }`.
- Fehlertexte als JSON `{ "fehler": "<deutscher Satz>" }`, ohne Interna.

### 4.4 Versionen, Schlüssel, Links

- Beim Erstellen erzeugt der Dienst `id` (12 Zeichen Base62 aus `crypto.randomBytes`) und `schluessel` (32 Byte, Base64url), speichert
  nur `sha256(schluessel)` und vergleicht mit `crypto.timingSafeEqual`. Der Schlüssel wird **nur einmal** ausgeliefert.
- Der Playground legt den Schlüssel im Projekt ab (`projekte.teilen.schluessel`, IndexedDB). Im Teilen-Dialog: „Bearbeitungsschlüssel
  kopieren“ / „Schlüssel eingeben“ (für ein anderes Gerät) – ohne Konten.
- **Dialog „Teilen“** (ein Seiten-Dialog, keine Browser-Popups):
  - Projekt ohne Link oder ohne Schlüssel: „Link erstellen“.
  - Projekt mit Link + Schlüssel: Auswahl **„Neue Version teilen (Link bleibt gleich)“** (Standard) oder **„Neuer Link“**.
  - Text: „Wir speichern dein Projekt (3 Dateien, 182 KB) auf unserem Server. Der Link bleibt 90 Tage nach der letzten Version gültig
    (bis 20.01.2027) – jede neue Version verlängert ihn. Ältere Versionen bleiben unter demselben Link abrufbar.“ (`aufbewahrungTage: null`
    → „… bleibt gespeichert, bis du ihn löschst.“)
  - Danach: Code-Link, App-Link, Version „v3“, Links zu „diese Version fest“ (`@3`), „Link löschen“.
- **Links** (E21): `#h=<id>` / `#app=<id>` = immer die neueste Version (der App-Link „aktualisiert sich“); `#h=<id>@3` / `#app=<id>@3` = fest.
  Regex `^[0-9A-Za-z]{12}(@[1-9][0-9]{0,5})?$`. Alte Hastebin-Schlüssel (10 Kleinbuchstaben) → Meldung „Dieser Link stammt vom alten
  Teilen-Dienst und ist nicht mehr verfügbar.“ (siehe Frage F6).
- Höchstens **200 Versionen** je Link; danach `409 { "fehler": "Dieser Link hat schon 200 Versionen – teile einen neuen Link." }`.

### 4.5 Aufbewahrung und Aufräumen

- `TEILEN_ABLAUF_TAGE` (Standard 90; 0 = unbegrenzt). Ablauf = `geaendert` + Tage (also ab der **letzten Version**); abgelaufene Links
  liefern sofort `404`, der Aufräumlauf (stündlich) löscht sie.
- **Blob-Müllabfuhr** (täglich): Markieren (alle Manifeste lebender Links + deren Blobs), Löschen aller übrigen Blobs, die älter als
  24 h sind (frisch hochgeladene, noch nicht gepostete Blobs bleiben).
- **Speicherdeckel** `TEILEN_SPEICHER_MAX_MB` (Standard 2048): darüber `507 { "fehler": "Der Teilen-Speicher ist gerade voll …" }`.

### 4.6 Grenzen (alle per Umgebungsvariable einstellbar, `/api/konfig` meldet sie)

| Grenze | Standard | Durchsetzung |
|---|---|---|
| Dateien je Projekt | 100 | Dienst (Manifest), Playground vorab |
| Einzeldatei | 2 MiB | nginx `client_max_body_size` (Blob-Location), Dienst |
| Projekt gesamt | 8 MiB | Dienst (Summe `groesse` der Manifest-Einträge, gegen echte Blobgrößen geprüft) |
| Manifest | 64 KiB | nginx + Dienst |
| `.pizza`-Datei | 512 KiB | Dienst (Typregel) |
| Anfragen | Erstellen/Version/Löschen: 10/min je IP (Burst 3); Manifest lesen (`GET /api/teilen/…`): 60/min (Burst 20); Blob-PUT und `fehlend`: 600/min (Burst 200); Blob-GET: **kein** Zähler im Dienst, nginx 1200/min (Burst 300) | nginx `limit_req` (erste Linie) + Dienst (gleitendes Fenster je `X-Real-IP`, nur im Speicher). Begründung: ein Projekt sind bis zu 101 Anfragen (Manifest + Blobs); Blobs sind unveränderlich und `immutable` gecacht, wiederholtes Öffnen kostet den Server kaum etwas, und Missbrauch begrenzen Größen-, Speicher- und Erstell-Grenzen |
| Versionen je Link | 200 | Dienst |

### 4.7 Ablage im Volume

```
/daten/blobs/ab/abcdef…            (Dateiname = SHA-256)
/daten/links/Xy/Xy12345678ab.json
/daten/tmp/…                       (Schreiben: tmp → fsync → rename, dadurch atomar)
```
Ein Prozess, je Link eine Sperre im Speicher; kein Datenbankserver. Beim Start: `tmp/` leeren, Index der Links (ID → geaendert) aufbauen.

### 4.8 Container, nginx, Coolify

- `compose.yaml`: Dienst `durchreiche` (`expose: 8291`, kein Port, keine Domain), Volume `durchreiche-daten:/daten`, `read_only`,
  `tmpfs /tmp`, `no-new-privileges`, Healthcheck `wget -q --spider http://127.0.0.1:8291/healthz`. Dienst `pizza` bekommt
  `TEILEN_URL: ${TEILEN_URL:-http://durchreiche:8291}` (leer = Teilen aus). `hastebin`, `redis`, `hastebin-daten`, `SERVICE_PASSWORD_REDIS`
  entfallen.
- Umbenennungen: `HASTEBIN_URL` → `TEILEN_URL` (compose, Dockerfile `NGINX_ENVSUBST_FILTER`, `docker-entrypoint-pizza.envsh`,
  `nginx-teilen.conf.template`), `HASTEBIN_ABLAUF_SEKUNDEN` → `TEILEN_ABLAUF_TAGE` (nur noch bei `durchreiche`), `TEILEN_AUFBEWAHRUNG_TAGE`
  entfällt (der Dienst beantwortet `/api/konfig`).
- `nginx.conf`: `location ^~ /api/` proxyt an `$teilen_upstream` (Variable + Resolver wie heute, damit nginx ohne den Dienst startet);
  `access_log off` für `/api/` (IDs sind Zugriffsrechte); `client_max_body_size` 2m (Blob) bzw. 64k (sonst); `limit_req` wie §4.6;
  `/api/konfig` mit Rückfall `{"teilen":false}` bei 502/503/504. CSP und alle Sicherheitsheader **unverändert** (`connect-src 'self'` reicht).
- Coolify: weiterhin **eine** Domain nur für `pizza` (`SERVICE_URL_PIZZA_8080`), `durchreiche` ohne Domain. `compose.lokal.yaml`
  unverändert (nur `pizza` auf `127.0.0.1`). Hinweis im Betriebsabschnitt der README: altes Volume `hastebin-daten` nach dem Umzug von Hand
  löschen.

### 4.9 Tests

- Unit (`node --test durchreiche/test`): Pfad-/Grenzregeln (gemeinsame Fallliste mit dem Playground), Hash-Prüfung, Schlüssel (falsch,
  fehlt, Zeitvergleich), Versionen (1 … n, `@n`, unverändert, 200er-Grenze), Ablauf (Uhr injizierbar), Müllabfuhr, atomares Schreiben
  (abgebrochenes tmp), Speicherdeckel, Rate-Limit, kein Inhalt im Log (Log-Senke abfangen).
- E2E (neu `18-teilen-versionen.test.mjs`, mit lokalem Dienst aus `e2e/server.mjs` gestartet, `windowsHide`): Teilen → Link öffnen →
  ändern → „Neue Version“ → alter Link zeigt v2 → `@1` zeigt v1 → App-Link startet v2 → „Neuer Link“ → Löschen → 404-Meldung; Projekt mit
  PNG (Dedup: zweite Version lädt das Bild nicht erneut hoch – gezählte PUTs); Projekt mit 100 Dateien zweimal hintereinander öffnen ohne 429.
- Docker: `docker compose -f compose.yaml -f compose.lokal.yaml build` (gedrosselt) + Rauchtest gegen `/api/konfig`.

---

## 5. Teil D – Bilder und Dateien (Assets)

### 5.1 Ziel

Texturen und Sprites als **echte Bilddateien** im Projekt (`bilder/…png`) für Herd (2D-`Bild`, `Animation`, 3D-`Koerper.bild`), dazu
einfache Datendateien (Level als Text, Tabellen). Später (nicht v1): Bilder in der Theke, Ton (`klang`, K-135/H-K14), eigene Schriften,
JSON als Speisekarte.

### 5.2 Sprache

```pizza
Herd herd = neu Herd("Teigball", breite: 960, hoehe: 540);
Bildchen decke = Bildchen.laden("bilder/tischdecke.png");
Blech<Bildchen> lauf = [Bildchen.laden("bilder/bote-1.png"), Bildchen.laden("bilder/bote-2.png")];
herd.koerper(Form.ebene(), bild: decke).setzeGroesse(20);
margherita level = Kiste.text("daten/level-1.txt");
```

| API | Ergebnis | Fehler |
|---|---|---|
| `Bildchen.laden(pfad)` (statisch) | `Bildchen` (wie `neu Bildchen`, eigene ID im Kern) | Pfad ungültig/fehlt → `LaufzeitAnanas: Die Datei "bilder/x.png" liegt nicht in der Kiste.`; kein PNG/beschädigt → `LaufzeitAnanas: bilder/x.png ist kein lesbares PNG-Bild.`; zu groß → `LaufzeitAnanas: bilder/x.png ist zu groß (2400 × 800) – höchstens 1024 × 1024 Pixel.`; vor `neu Herd` → Text aus §18.1 |
| `Kiste.text(pfad)` | `margherita` (UTF-8, Zeilenenden unverändert) | fehlt wie oben; kein gültiges UTF-8 → `LaufzeitAnanas: daten/x.txt ist kein Text (UTF-8).` |
| `Kiste.zeilen(pfad)` | `Blech<margherita>` (Trenner `\n`, `\r\n` → `\n`, letzte leere Zeile entfällt) | wie `text` |
| `Kiste.gibts(pfad)` | `diavolo` | nie (ungültiger Pfad → `nein`) |
| `Kiste.liste(ordner = "")` | `Blech<margherita>` aller Dateipfade unter `ordner`, sortiert (Bytefolge) | – |

- **Kiste** = alle Projektdateien außer `pruefung/` (auch `.pizza`, damit z. B. ein Programm seinen eigenen Quelltext zeigen kann) – nur lesen.
  Kein Schreiben: Dauerhaftes Speichern bleibt Aufgabe der Vorratskammer (§15.4).
- Schritte: jeder Aufruf ein normaler Aufruf (keine größenabhängigen Kosten – einfach und in allen Motoren gleich).
- Zahl-/Textformen: `Bildchen(<breite>×<hoehe>)` wie bisher; `Kiste` ist eine eingebaute Klasse wie `Mathe` (nur statisch).
- `Bildchen.laden` gehört zu Herd (Ressource im Kern, §18.5) und erzeugt die Importgruppe `herd`; `Kiste` gehört zur Basis (neue kleine
  Importgruppe nicht nötig, §5.5).

### 5.3 PNG-Dekodierung im Herd-Kern (E13) – deterministisch

- Neue Kern-Funktion `bildchen_png(ptr, len) → id | Fehlercode` (Kern-ABI, `herd/README.md`) neben dem vorhandenen `bildchen_rgba`.
- Decoder: eigener kleiner PNG-Leser in `herd/kern/src/png.rs` (Chunks, CRC, Filter 0–4, Paletten, tRNS) + Inflate über
  `miniz_oxide` (`no_std` + `alloc`, ohne `std`-Feature; Alternative: eigenes Inflate ~300 Zeilen, falls die Abhängigkeit stört).
- Unterstützt: Farbtypen Grau, Grau+Alpha, RGB, RGBA, Palette; Bittiefen 1/2/4/8 (16 bit → **abschneiden auf die oberen 8 Bit**, fest
  definiert). Nicht unterstützt (Fehler „kein lesbares PNG“): Interlacing (Adam7), APNG (Animationen werden über mehrere Dateien
  + `Animation` gebaut), fehlerhafte CRC.
- **Farbregeln:** Rohwerte, **keine** Gamma-/Farbraum-Korrektur (`gAMA`, `cHRM`, `sRGB`, `iCCP` werden ignoriert); Alpha **nicht
  vormultipliziert** (wie `bildchen_rgba`); tRNS wie Spezifikation. Ergebnis RGBA8 → gleicher Weg wie `bildchen_rgba` (Atlas).
- **Grenzen:** ≤ 1024 × 1024 Pixel je Bild (passt mit Abstand auf eine 2048er-Atlasseite), vor dem Entpacken aus `IHDR` geprüft
  (Dekompressionsbombe: Ausgabe hart auf `breite × hoehe × 4 + Zeilenfilter` begrenzt). Text-Bildchen bleiben bei 256 × 256 (§18.5).
- Bitgleich: Derselbe Rust-Code läuft im Interpreter (über `kern.wasm`), in der Wasm-Laufzeit (Importgruppe `herd` → `kern.wasm` bzw. nativ
  eingebaut) und im Host. `szene`/`paket`-Hashes (K-134) decken die Pixel ab.
- Atlas: Bilder bis 1024² brauchen ggf. neue Seiten; Atlas-Seitenverwaltung (vorhandenes `ATLAS_SEITE`/`ATLAS_STUECK`) bleibt; Speicher
  nur für tatsächlich geladene Bilder.

### 5.4 Playground, Teilen, Caching

- Hochladen per Dateibaum/Drag & Drop; Typ nach Endung **und** Signatur (PNG-Magie) geprüft; Vorschau §3.1; Grenzen wie §4.6.
- Teilen: Bilder sind Blobs (§4.2) – unveränderte Bilder werden zwischen Versionen nie neu hochgeladen; Blob-Antworten sind `immutable`
  und damit vom Browser-Cache gedeckt. Geöffnete Projekte liegen danach ohnehin in IndexedDB.
- Herd-Kern im Browser: dekodierte Bilder werden **nicht** gecacht (jeder Lauf dekodiert neu – deterministisch und einfach; 1 MiB PNG
  dekodiert in Millisekunden).

### 5.5 Einbettung in pkarton/EXE (E12)

- Der Compiler legt alle Kiste-Dateien in ein **passives Datensegment** und eine kleine Tabelle (Pfad → Offset, Länge, sortiert) in den
  Datenbereich der Laufzeit. `Kiste.*` und `Bildchen.laden` lesen daraus; `Bildchen.laden` reicht die Bytes über den bestehenden Herd-Weg
  (neuer Importaufruf `bildchen_png` in der Gruppe `herd`, generisch wie die übrigen) an den Kern.
- Projekt-Grenze für EXE und Wasm: wie §4.6 (8 MiB) – damit bleibt der Speicherbedarf klein; der Compiler meldet Überschreitung als
  `PizzaFehler P0020: Das Projekt ist zu groß für den Ofen (9,2 MB, höchstens 8 MB).`
- Der Host liest weiter nur ein `.pkarton`; EXE-Anhang `PKARTON1` und `PizzaExe.verbinde` bleiben unverändert.
- Optimierung (später, nicht v1): nur Dateien einbetten, die das Programm per **Literal** anspricht – v1 bettet alle ein (dynamische Pfade
  wie `"bilder/bote-" + i + ".png"` müssen funktionieren).

### 5.6 Folgen für K-136

K-136 begründete Text-Bildchen mit „Dateien hätten im Browser keinen Ort“. Mit Projekten haben sie einen. K-136 bleibt für Text-Bildchen
gültig; der neue Eintrag (K-145) ergänzt Bilddateien und hebt die Begründung auf. HERD.md-Roadmap H-K8 („größere Bilder“) gilt damit
als erledigt.

---

## 6. Auswirkungen je Komponente

| Komponente | Änderung |
|---|---|
| `site/js/pizza.js` (Interpreter) | Projekt-Lader (`projekt.lade`, gemeinsam mit Compiler), `bestellt` (kontextuell) im Parser, Datei-Index an AST-Knoten, Ladereihenfolge, P0014–P0020/W0105 in `intern.pruefe`, Feld `datei` an `fehler`/`warnung`, Ortstexte §2.6, `Kiste`, `Bildchen.laden` (über `kern.wasm`) |
| `site/js/pizzaiolo/*` (Compiler) | Eingabe = geladenes Programm; Dateinamen-Tabelle; ABI v2 (`datei_ptr/len`); Datensegment + Tabelle für Kiste; `Kiste`-Aufrufe in der Laufzeit; `faehigkeiten.abi = 2` |
| `laufzeit/` (Rust no_std) | Fehler-/Warnungsimporte mit Datei; Kiste-Tabelle lesen; `Kiste.*`; `Bildchen.laden` → Import `bildchen_png` |
| `herd/kern` | `png.rs`, Kern-Export `bildchen_png`, Fehlercodes 61 ff. (kein PNG, zu groß), Atlas für bis 1024²; `schema.json`/`kern.wasm` neu erzeugen; `herd/test-kern.js` (nativ = Wasm) mit PNG-Fällen |
| `host/` (Rust) | ABI v2 (`warnung`/`fehler`), Importgruppe `herd` + `bildchen_png`, sonst unverändert (`karton.rs` unverändert) |
| `site/js/pizzaiolo/host-js.js`, `site/js/exe.js` | ABI v2; `exe.js` unverändert bis auf Dateinamen aus `name` |
| `bin/pizza.js` | Ordner/`pizza.json`/Datei, Projektwurzel-Suche, Ausgabe §2.6, `--ast` mit Ladeliste |
| `site/js/worker.js` | Startnachricht mit Projekt (§3.6) |
| `ui/src/*` | neu: `projekte.js` (IndexedDB, Migration), `dateibaum.js`, `zip.js`, `bildvorschau.js`; Umbau: `tabs.js` (Dateien statt Skripte), `main.js` (Projektmenü, Ausführen = Projekt, Fehler-Sprung), `teilen.js` (Manifest/Blobs/Schlüssel), `app.js` (Manifest laden), `beispiele.js` (Ordner), `vorrat.js` (Präfix Projektname), `sprache.js`/`editor.js` (Vervollständigung, Diagnose je Datei) |
| `site/js/doku/*` | neues Kapitel „Projekte und Dateien“ (bestellt, Sichtbarkeit, Kiste, Bilder); Doku-Codeblöcke mit Feld `dateien: { pfad: text }` (+ optional `hauptdatei`) für Mehrdatei-Beispiele, „Im Playground öffnen“ legt ein Projekt an |
| nginx, Dockerfile, envsh, Template, compose | §4.8; Dockerfile: `site/beispiele/**` Ordner werden wie bisher kopiert; Test-Stufe ruft die umgestellten Harnische |
| Harnische (`tests/run-tests.js`, `pruefstand`, `tests/differenz`, `tests/wasm`, `tests/herd`, `tests/theke`, E2E) | Ordner-Fälle §6.1, Manifest-Format §7.2 |
| Doku-Dateien | SPEC §2 (Projekte, `bestellt`, Ladereihenfolge, Sichtbarkeit), §11 (`Kiste`), §14.7 (P0014–P0020, W0105), §18.5 (`Bildchen.laden`), ARCHITEKTUR §1–§3, §6, HOST-ABI v2 (§2, §9), WASM §4, HERD.md (Kern-ABI, H-K8), README (Betrieb), CHANGELOG |

### 6.1 Testformate (ARCHITEKTUR §6, erweitert)

- **Ordner-Fall:** `tests/faelle/<name>/` = Projekt (§1.1) mit `pruefung/` (`erwartet`, `exitcode`, `warnungen`, `fehler`, `optionen.json`,
  `eingabe`, `ereignisse`, `ui-erwartet`, `herd-erwartet`, `vorrat.json`). Bestehende Ein-Datei-Fälle (`<name>.pizza` + Begleitdateien)
  **bleiben** – keine Massenumstellung der Testfälle.
- `.warnungen`/`.fehler` vergleichen weiter Texte; neu optional `pruefung/orte` (JSON-Lines `{ "code", "datei", "zeile", "spalte" }`), um
  Dateiorte zu prüfen.
- **Differenzkorpus:** `tests/differenz/korpus/<name>/` als Projekt; Kopfzeilen (`// exit:` …) in der Hauptdatei.
- **Prüfstand:** `F(gruppe, name, code, erwartung)` – `code` darf ein Projekt-Objekt `{ dateien, hauptdatei }` sein; neue Datei
  `a19-projekte.js` (Ladereihenfolge, Zyklen, Konflikte, Sichtbarkeit, Nebendatei-Regel, Fehlerorte, gleiches Programm 1 vs. n Dateien,
  Kiste, Bildchen.laden mit Test-PNGs, Grenzen).
- Neue Pflichtfälle: Mehrdatei (3 Motoren), Zyklus, fehlende Datei, Konflikt, Geheimrezept, Unbestellt, Fehler in Nebendatei (Text + Ort),
  PNG-Varianten (Palette+tRNS, Grau 1 bit, 16 bit, RGBA, interlaced → Fehler, beschädigte CRC → Fehler, zu groß → Fehler).

---

## 7. Migrationsplan Beispiele

### 7.1 Zielstruktur

```
site/beispiele/index.json                       (unverändert: Liste der Kategorie-Manifeste)
site/beispiele/grundlagen.json                  (Manifest, Einträge mit "ordner" + "dateien")
site/beispiele/grundlagen/hallo-welt/pizza.json
site/beispiele/grundlagen/hallo-welt/hauptgang.pizza
site/beispiele/grundlagen/hallo-welt/pruefung/erwartet
site/beispiele/herd/teigball/{pizza.json, hauptgang.pizza, welt/*.pizza, bilder/*.png, pruefung/*}
```

### 7.2 Manifest (ARCHITEKTUR §3, neu)

```json
{ "id": "teigball", "titel": "Teigball", "beschreibung": "…", "ordner": "herd/teigball",
  "dateien": ["pizza.json", "hauptgang.pizza", "welt/tisch.pizza", "bilder/tischdecke.png"],
  "tier": 1, "schlagworte": ["Herd", "3D"], "herd": true, "interaktiv": false }
```
`datei`, `erwartet`, `eingabe`, `ereignisse`, `herdErwartet`, `exitCode` entfallen (liegen in `pruefung/`). `dateien` ohne `pruefung/`.
`node scripts/beispiele.js --pruefe` (Teil von `npm test`) vergleicht Manifest und Platte; `--schreibe` aktualisiert die Dateilisten.

### 7.3 Schritte

1. **Werkzeug** `scripts/beispiele.js --umziehen`: jede `x.pizza` + Begleitdateien → `x/hauptgang.pizza`, `x/pizza.json` (Name = Titel),
   `x/pruefung/*`; Manifeste umschreiben. Ein-Datei-Projekte, rein mechanisch, Ausgaben unverändert (Harnische vorher/nachher gleich).
2. Harnische, Galerie, Doku-Verweise, E2E (`05-beispiele`, `09-theke`, `14-herd-playground`, `11-app-link`) auf Ordner umstellen.
3. **Aufteilen** (inhaltlich, je Beispiel `.erwartet`/`.herd-erwartet` müssen **gleich** bleiben, außer wo PNGs bewusst Bildchen ersetzen):
   - `herd/teigball` (286 Zeilen): `hauptgang.pizza` (Spielzustand, Schleife) · `welt/tisch.pizza` (Himmel, Tisch, Öfen, Laternen als
     Funktionen) · `welt/belaege.pizza` (Basilikum-Form, Beläge) · `hud.pizza`; **Tischdecke als PNG** (`bilder/tischdecke.png`) –
     neues `herd-erwartet` (bewusst, Pixel sehen gleich aus).
   - `herd/teigfaenger` (258): `hauptgang.pizza`, `figuren.pizza`, `hud.pizza`; Sprites als PNG (Bote, Teig) → Vorzeigebeispiel 2D.
   - `herd/steuerung`: Animation aus `bilder/bote-1.png … -4.png` (zeigt `Animation` mit Bilddateien).
   - Neues kleines Beispiel `grundlagen/rezeptbuch` (3 Dateien: Klassen in `rezepte/`, Konstanten, Geheimrezept) und `grundlagen/kiste`
     (Level aus `daten/level.txt`).
   - Übrige Beispiele (≤ 180 Zeilen) bleiben Ein-Datei-Projekte.
4. **Pizza-Imperium – erst nach „Idle frei“** (anderer Lead arbeitet an Paket 5/6). Bis dahin bleibt `site/beispiele/idle/pizza-imperium.*`
   als Einzeldatei unverändert lauffähig (Übergang: das Umzugswerkzeug überspringt es, Manifest-Eintrag im alten Format wird von Galerie und
   Harnischen weiter gelesen – die Lesefunktion akzeptiert `datei` **oder** `ordner` bis Schritt 4 erledigt ist, danach wird `datei`
   entfernt). Vorgeschlagene Aufteilung (4223 Zeilen, Stand afac084; endgültig nach Paket 5/6 neu zählen):

   | Datei | Inhalt (heute Zeilen) |
   |---|---|
   | `hauptgang.pizza` | Kopf, Konstante `ANTEIL_MAX`, Start/`hauptgang` (1–93 + Start) |
   | `modell/upgrades.pizza` | `Upgrade`, `Geheimrezept`, `Feinkost`, `Rezept`, `Meisterbrief` (94–229) |
   | `modell/ziele.pizza` | `Herausforderung`, `Erfolg`, `Kampagne`, `Projekt` (230–351) |
   | `modell/betrieb.pizza` | `Bereich`, `Posten`, `Helfer`, `Gast`, `Katze` (262–497) |
   | `spiel.pizza` | `Spiel` (498–2047; ggf. später weiter in `spiel/*.pizza` nach Themen) |
   | `minispiele.pizza` | `Minispiel`, `Spielecke` (2048–2595) |
   | `theke/kopf.pizza`, `theke/betrieb.pizza`, `theke/rezepte.pizza`, `theke/imperium.pizza`, `theke/nonna.pizza`, `theke/spiele.pizza`, `theke/erfolge.pizza` | Panels (2596–4223) |

   Bedingung: `pruefung/erwartet`, `ereignisse`, `ui-erwartet` byte-gleich; Schritte gleich (§2.2). Hinweis: Klassenname `Geheimrezept`
   kollidiert nicht mit dem Modifikator `geheimrezept` (Groß/klein signifikant). Klasse `Projekt` bleibt erlaubt (kein reserviertes Wort).

---

## 8. Sicherheit und Datenschutz (Teilen-Dienst und Dateien)

- **Nur intern erreichbar:** kein Port, keine Domain; nur nginx spricht mit dem Dienst. Kein CORS (alles same-origin). CSP/Header unverändert.
- **Was gespeichert wird:** Dateiinhalte, Manifeste, Erstellungs-/Änderungsdatum (Tagesgenauigkeit), Hash des Schlüssels. **Nicht**:
  IP-Adressen, User-Agent, Zugriffszeiten. IPs leben nur im Arbeitsspeicher des Rate-Limiters (gleitendes Fenster, ≤ 10 min).
- **Kein Logging von Inhalten**, IDs oder Schlüsseln: Dienst loggt nur Start, Aufräumzahlen, Fehlerarten; nginx `access_log off` für `/api/`.
  Ein Test fängt die Log-Ausgabe ab und prüft, dass weder Inhalt noch ID darin vorkommt.
- **IDs als Zugriffsrecht:** ≥ 71 bit Zufall → nicht aufzählbar; es gibt **keine** Liste aller Links. Alte Versionen sind für jeden mit dem
  Link abrufbar (im Dialog gesagt); Löschen entfernt alle Versionen.
- **Schlüssel:** 256 bit, nur einmal übertragen, serverseitig gehasht, Zeitkonstant-Vergleich, nur im `Authorization`-Kopf (nie in URLs).
  Im Browser in IndexedDB am Projekt.
- **Eingaben:** Größen vor dem Lesen begrenzt (Stream-Zähler), JSON-Tiefe/Länge begrenzt, Pfade nach §1.3 (kein `..`, keine absoluten
  Pfade, keine Steuerzeichen), Hash jedes Blobs geprüft, Dateien im Volume heißen nur nach Hash/ID (nie nach Nutzerpfaden).
- **Ausgabe:** Blobs immer `application/octet-stream` + `nosniff` + `attachment` → nie als HTML/SVG im Origin interpretiert (kein SVG in v1).
  Die UI liest Blobs nur per `fetch`.
- **Verfügbarkeit:** Rate-Limits doppelt (nginx + Dienst), Speicherdeckel, Versionsgrenze, Timeouts (nginx), atomares Schreiben.
- **Container:** `USER node`, `read_only`, `no-new-privileges`, keine Abhängigkeiten (`npm ci` entfällt), gepinntes Basis-Image.
- **Datei-Inhalte im Client:** PNG nur im Kern (Rust, Grenzen vor dem Entpacken), ZIP-Import mit Pfadprüfung und Entpack-Grenze,
  Bildvorschau via `data:`/Canvas.
- **Bekannte Restrisiken (akzeptiert):** Wer einen Inhalt kennt, kann über den Blob-Hash prüfen, ob er irgendwo geteilt wurde (Hashes sind
  nicht aufzählbar, nur bestätigbar) – vertretbar, da keine Zuordnung zu Links/Personen. Missbrauch zum Ablegen fremder Dateien wird durch
  Typprüfung (nur §1.3-Endungen; PNG-Magie), Größen- und Ablaufgrenzen eingedämmt.
- **Nutzertext** (sinngemäß wie heute): „Wir speichern dein Projekt auf unserem Server“ + Aufbewahrungsdauer + Hinweis auf alte Versionen.

---

## 9. Verworfene Alternativen (Auswahl, mit Begründung)

- **Namensraum je Datei mit qualifizierten Namen** (`bestellt "teig.pizza" als t; neu t.Teig()`): mächtiger, aber Umbau der Namensauflösung
  in Interpreter **und** Compiler, neue Textformen, Mehrdeutigkeit mit Mitgliedszugriff. Nachrüstbar: `als` kann später additiv kommen.
- **Import einzelner Namen** (`bestellt Teig aus "teig.pizza";`): mehr Schreibarbeit, kaum Nutzen bei projektweit eindeutigen Namen.
- **Pfade relativ zur bestellenden Datei:** derselbe Pfad hieße je nach Ort Verschiedenes; Umbenennen eines Ordners bräche Bestellungen.
- **Zyklen erlauben:** Initialisierungsreihenfolge von Top-Level-Variablen wäre nicht mehr ablesbar.
- **Assets im Browser dekodieren:** `createImageBitmap` wendet je nach Browser Farbprofil/Gamma an → nicht bitgleich zu nativ.
- **Hastebin weiter nutzen/anderes Pastebin:** nicht nutzbar (Vorgabe), keine Versionen, keine Binärdateien.
- **SQLite/Redis im Dienst:** zusätzliche Abhängigkeit/Container; die Datenmenge ist klein, Dateien + Hashes reichen.
- **Konten/Anmeldung für Versionen:** Datenschutz, Aufwand; der Bearbeitungsschlüssel löst das ohne personenbezogene Daten.
- **Projektdatei Pflicht:** Hürde für „schnell zwei Dateien“; Standards decken den Normalfall.

---

## 10. Offene Fragen an den Nutzer (gesammelt, je mit Empfehlung)

Benennungen (Modul-Anweisung `bestellt`, `pizza.json`, `hauptgang.pizza`, Pfade nur in ASCII-Kleinbuchstaben) entscheidet der Koordinator – der Nutzer hat sie freigegeben („Naming ist mir egal“); sie gelten wie in §0 beschrieben.

| # | Frage | Empfehlung |
|---|---|---|
| F3 | Strenge Sichtbarkeit (direkt bestellen, sonst P0019) oder projektweit alles sichtbar? | **streng** – `bestellt` dokumentiert Abhängigkeiten; Fehlertext nennt die fehlende Zeile |
| F4 | Snack-Anweisungen nur in der Hauptdatei (Nebendateien: Deklarationen + Variablen)? | **ja** |
| F6 | Alte Hastebin-Links: verfallen lassen oder einmalig übernehmen (Skript liest Redis und legt Links an)? | **verfallen lassen** mit klarer Meldung – keine Rückwärtskompatibilität gefordert, Übernahme bräuchte die alte Redis-Instanz |
| F7 | Aufbewahrung: 90 Tage ab letzter Version? | **ja**, per `TEILEN_ABLAUF_TAGE` änderbar |
| F8 | Grenzen: 100 Dateien, 2 MB je Datei, 8 MB je Projekt, Bilder ≤ 1024 × 1024, nur PNG | **ja** für v1 (JPEG/größere Bilder später, wenn ein Spiel es braucht) |
| F9 | Alte Versionen für alle mit dem Link sichtbar; Löschen nur ganzer Link? | **ja** (einfach, im Dialog erklärt) |
| F10 | Bearbeitungsschlüssel zwischen Geräten übertragbar (kopieren/einfügen)? | **ja**, ohne Konten |
| F11 | Ein aktives Projekt je Fenster (Tabs = Dateien) statt gemischter Tabs aus mehreren Projekten? | **ja** |
| F12 | Bestehende Playground-Tabs: jeder Tab ein eigenes Projekt? | **ja** (jeder Tab war ein eigenständiges Programm) |
| F13 | Teilen-Dienst in Node ohne Abhängigkeiten (statt Rust)? | **Node** |
| F14 | Aufteilung des Pizza-Imperiums wie §7.3 (nach „Idle frei“)? | **ja**, Feinschnitt nach Paket 5/6 |
| F15 | Herd-Beispiele bekommen echte PNG-Texturen/Sprites (Teigball, Teigfänger, Steuerung) statt Text-Bildchen? | **ja** für je ein Element pro Spiel; Text-Bildchen bleiben als Sprachmittel und in einfachen Beispielen |

---

## 11. Paketplan (spätere Umsetzung)

| Paket | Inhalt | Dateien (Schwerpunkt) | hängt ab von | parallel zu |
|---|---|---|---|---|
| **P0 Vertrag** | SPEC §2/§11/§14.7/§18.5, K-138 … K-146, ARCHITEKTUR §1–§3/§6, HOST-ABI v2, WASM §4, HERD.md, Prüfstand-Fälle als `*-offen` | Doku-Dateien, `pruefstand/faelle/a19-projekte-offen.js` | Freigabe | – |
| **PA1 Lader + Interpreter + CLI** | `projekt.*`, `bestellt`, Ladereihenfolge, Prüfungen, `datei`-Feld, Texte, CLI Ordner, Ordner-Fälle in `tests/run-tests.js`, `a19` grün | `site/js/pizza.js`, `bin/pizza.js`, `tests/faelle/*/`, `tests/run-tests.js` | P0 | PC1, PD1 |
| **PC1 Durchreiche** | Dienst, Unit-Tests, Dockerfile, compose/nginx/envsh/Template, Entfernen hastebin/redis | `durchreiche/**`, `compose*.yaml`, `nginx*.conf*`, `Dockerfile`, `docker-entrypoint-pizza.envsh`, `hastebin/` (löschen) | P0 (§1.3, §4) | PA1, PD1 |
| **PD1 PNG im Kern** | `png.rs`, `bildchen_png`, Fehlercodes, Atlas ≤ 1024², Tests nativ = Wasm, `kern.wasm` | `herd/kern/**`, `herd/README.md`, `site/js/herd/kern.wasm` | P0 | PA1, PC1 |
| **PA2 Wasm + Host** | Compiler auf Lader, ABI v2, Kiste-Datensegment, `Kiste`/`Bildchen.laden` in der Laufzeit, Host (JS + Rust, `-j 2`), Differenzkorpus-Ordner | `site/js/pizzaiolo/**`, `laufzeit/**`, `host/**`, `tests/differenz/**`, `tests/wasm/**` | PA1, PD1 | PB1 |
| **PB1 Playground-Projekte** | IndexedDB, Migration, Dateibaum, Tabs je Datei, Hauptdatei, Fehler-Sprung, ZIP, Bildvorschau, Worker-Protokoll | `ui/src/**`, `site/js/worker.js`, `site/index.html`, `site/css/**` | PA1 (API; vorher mit Ein-Datei-Stub) | PA2 |
| **PD2 Kiste/Bildchen.laden im Interpreter** | `Kiste`, `Bildchen.laden` über `kern.wasm`, Prüfstand | `site/js/pizza.js` | PA1, PD1 | PA2, PB1 |
| **PB2 Teilen-UI + App-Link + EXE** | `teilen.js` (Manifest/Blobs/Schlüssel/Dialog), `app.js`, `#h=`/`#app=` mit `@n`, EXE aus Projekt, E2E Teilen | `ui/src/teilen.js`, `ui/src/app.js`, `ui/src/main.js`, `e2e/tests/18-*.mjs`, `e2e/server.mjs` | PB1, PC1, PA2 | PB3 |
| **PB3 Beispiele umziehen** | Werkzeug, Manifeste, Galerie, Harnische, Doku-Kapitel + `dateien`-Codeblöcke, E2E 05/09/11/14 | `scripts/beispiele.js`, `site/beispiele/**` (ohne Imperium), `site/js/doku/**`, Harnische | PA1, PB1 | PB2 |
| **PB4 Herd mit Bildern** | Teigball/Teigfänger/Steuerung aufteilen + PNGs, `rezeptbuch`, `kiste`, `.herd-erwartet` neu | `site/beispiele/herd/**`, `site/beispiele/grundlagen/**` | PB3, PD2, PA2 | – |
| **PB5 Imperium** | Aufteilen nach §7.3, Übergangsleser entfernen | `site/beispiele/idle/**`, Lesefunktion der Manifeste | **„Idle frei“**, PB3 | – |
| **PZ Abnahme** | `npm test`, `node pruefstand/run.js`, `npm run test:wasm`, `npm run test:differenz`, `cargo test -j 2` (host), `node host/test.js` (`PIZZA_KEIN_DIALOG=1`), `npm --prefix ui test`, E2E komplett (headless, eine Chrome-Instanz), `docker compose -f compose.yaml -f compose.lokal.yaml build` (gedrosselt), CHANGELOG | – | alle | – |

Wellen (höchstens 3 parallel, je eigener Worktree): **W1** PA1 · PC1 · PD1 → **W2** PA2 · PB1 · PD2 → **W3** PB2 · PB3 → **W4** PB4 ·
(PB5 sobald frei) → PZ. Jedes Paket endet mit grünen Tests seines Bereichs und einem lokalen Commit; gepusht wird gebündelt.

---

## 12. Vorgeschlagene K-Einträge (erst nach Freigabe in `KLAERUNGEN.md`; nächste freie Nummer K-138, vor dem Schreiben erneut prüfen)

| Nr. | Titel | Kern |
|---|---|---|
| K-138 | Projekte: Ordner, `pizza.json`, Hauptdatei, Pfadregeln, Dateisammlung | E1–E3, E24, §1 |
| K-139 | `bestellt`: Syntax, erreichbare Dateien, Ladereihenfolge, Zyklen, Nebendateien, `hauptgang` nur in der Hauptdatei | E4, E8, E9, §2.1–§2.3 (P0014, P0015, P0017, W0105) |
| K-140 | Ein Projekt-Namensraum, Sichtbarkeit, `geheimrezept` auf oberster Ebene, konservative Startprüfung | E5–E7, §2.4–§2.5 (P0016, P0018, P0019) |
| K-141 | Fehlerorte mit Datei; Host-ABI v2 | E10, E11, §2.6, §2.8 |
| K-142 | Playground-Projekte: IndexedDB, ein Projekt je Fenster, Migration der Tabs, ZIP | E15–E17, §3 |
| K-143 | Teilen-Dienst Durchreiche: Blobs + Manifeste, Versionen, Schlüssel, Links `@n`, Ablauf ab letzter Version, Grenzen, Datenschutz | E18–E22, §4, §8 |
| K-144 | Beispiele als Ordner, Manifest mit Dateiliste, `pruefung/`, Testformate für Ordner-Fälle | E23, §6.1, §7 |
| K-145 | Bilddateien: `Bildchen.laden`, PNG im Kern (Farbregeln, Grenzen), Einbettung als Datensegment (ergänzt K-136) | E12, E13, §5.3, §5.5 (P0020) |
| K-146 | `Kiste`: lesender Zugriff auf Projektdateien | E14, §5.2 |
