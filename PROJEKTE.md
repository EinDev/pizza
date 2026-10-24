# Projekte, Mehrdatei-Programme, Bilder und Teilen mit Versionen (Konzept)

> **Status: geprüft (2026-10-23); P0 umgesetzt (Commit „PROJEKTE P0: Verträge …“, 2026-10-23).** Alle Fragen vom Nutzer entschieden
> (§10), Prüfbefunde eingearbeitet (§13). Die **Verträge** stehen jetzt in `SPEC.md` (§2.1 … §2.6, §11.2, §14.5, §14.7, §14.8, §18.5),
> `KLAERUNGEN.md` (K-138 … K-147, Aufträge U-73 … U-79), `ARCHITEKTUR.md` (§1–§3, §6), `HOST-ABI.md` (v2 als Vertrag), `WASM.md` (§4)
> und `HERD.md` (§12.1 Regel 3: reservierte Nummern); Prüfstand `pruefstand/faelle/a19-projekte.js` (seit PA1/PD2 grün; `a19-projekte-offen.js` entfiel mit PD2).
> **Bei Abweichung gilt der Vertrag**; dieses Konzept bleibt Begründung und Plan. **PA1 umgesetzt** (Lader, Interpreter, CLI –
> Commit „PROJEKTE PA1: …“, Präzisierungen in §11), **PD1** (Vorbacker), **PD2** (Kiste/Bildchen.laden im Interpreter), **PA2** (Wasm + Host,
> HOST-ABI v2), **PB1** (Playground-Projekte), **PC1** (Durchreiche) und **PB2** (Teilen-UI, App-Link) ebenso; übrige Pakete siehe §11;
> `herd/README.md` (Kern-ABI §3, Bildpaket §4) schreibt PD1.
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
§9 Verworfene Alternativen · §10 Entscheidungen des Nutzers · §11 Paketplan · §12 Vorgeschlagene K-Einträge · §13 Prüfbefunde

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
| E7 | Prüfung von E5/E6 als **Ladeprüfung** im gemeinsamen Lader (`PizzaLang.projekt.lade`, §2.7) – konservativ, nie falsch-positiv | Compiler und Interpreter rufen denselben Lader → bitgleich ohne doppelte Umsetzung (die Startprüfung `intern.pruefe` ist im Compiler ein eigener Port und daher **nicht** der Ort) | Laufzeitprüfung in beiden Motoren |
| E8 | **Nebendateien** enthalten nur Deklarationen (Klassen, Rezepturen, quattrostagioni, Top-Level-Funktionen), Top-Level-**Variablen** und `bestellt`; sonstige Anweisungen und `hauptgang` nur in der Hauptdatei | Ablauf bleibt in einer Datei lesbar; Ladereihenfolge betrifft nur Initialisierungen | Snack-Code überall (unübersichtliche Reihenfolge) |
| E9 | **Ladereihenfolge:** Tiefensuche ab Hauptdatei, `bestellt` in Textreihenfolge, Abhängigkeiten zuerst, jede Datei einmal, Hauptdatei zuletzt; nicht erreichbare Dateien gehören nicht zum Programm; **Zyklus = Fehler** | deterministisch, ohne Sortierregeln; entspricht dem Lesen von oben nach unten | alphabetisch (überraschend), Zyklen erlauben (Initialisierungsreihenfolge unklar) |
| E10 | Fehlerorte: Ereignisse bekommen Feld **`datei`**; das `text`-Feld (nur Ananas-Texte tragen dort einen Ort) nennt die Datei **nur außerhalb der Hauptdatei** („(rezepte/teig.pizza, Zeile 12)“); Hüllen (CLI, Host, Konsole) nennen den Pfad, sobald `datei ≠ null` (§2.6); `datei` ist `null`, solange das Programm aus genau einer `.pizza`-Datei besteht | alle bestehenden `.erwartet`/`.fehler`/Doku-Texte bleiben gültig | Datei immer im Text (alle Testdateien neu) |
| E11 | **Host-ABI v2:** `warnung`/`fehler` bekommen `datei_ptr, datei_len` (auch im Küchenbericht, §2.8); `abi_version()` = 2; pkarton bleibt **ein** Wasm-Modul | Host muss nichts über Projekte wissen; keine Abschnitts-Parser im Host | Dateiindex + Tabelle in Custom Section (jeder Host bräuchte einen Abschnittsleser) |
| E12 | **Assets** (Bilder, Textdateien) liegen im Projektordner; ins pkarton kommen sie als **Datensegment** (Bilder als vorgebackene Teiglinge, §5); EXE-Format (`PKARTON1`-Anhang) unverändert | „ein Modul, kein Container“ (HOST-ABI §1) bleibt wahr, Host liest nichts nach | zweiter Anhang/Container, Host-Import `datei_lesen` |
| E13 | **PNG und JPEG nur als Eingabe** (Nutzerentscheidung): ein eigener Rust-Decoder (`herd/teigling`, no_std, als `teigling.wasm` überall derselbe Code) **backt** sie beim Packen (Playground-Erstladen, EXE-Export, Teilen) einmalig zu einem **Teigling** vor – GPU-taugliches RGBA8 + vorberechnete Mipmaps, per Hash gecacht; GPU-Kompression später ohne Sprachänderung | bitgleich per Konstruktion; Ladezeit, VRAM/Bandbreite, Download-Größe, Mipmaps gegen Moiré | Browser `createImageBitmap`/Canvas (nicht bitgleich), Dekodieren bei jedem Lauf im Kern (Ladezeit, keine Mipmaps), sofort KTX2/Basis (Encoder-Determinismus und Aufwand offen) |
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
    ├── erwartet, ereignisse, herd-erwartet, ui-erwartet, eingabe, exitcode, warnungen, fehler, optionen.json, vorrat.json,
        vorrat-erwartet, orte (§6.1)
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
| `args` | nein | Standard-Argumente für `hauptgang` (Blech aus Texten, ≤ 32 Einträge à ≤ 200 Zeichen): gelten überall, wo **keine** Argumente übergeben werden – CLI, App-Link, EXE (die Laufzeit nimmt die im Modul eingebetteten Standard-Argumente, wenn der Host 0 Argumente liefert) und Startwert des Playground-Felds „Argumente“ |

Ungültige `pizza.json` (kein JSON, `pizza` fehlt, Feld mit falschem Typ) → Ladefehler `PizzaFehler P0015: pizza.json ist ungültig: <Grund>.`
(Grund z. B. `"hauptdatei" muss ein Text sein`). Das Playground-Feld „Argumente“ ist **lokal** (IndexedDB `args`, Startwert aus
`pizza.json`); geteilt und exportiert wird nur `pizza.json` – es gibt keine zweite Quelle.

Unbekannte Felder werden ignoriert (erweiterbar: z. B. später `koeche`, `symbol`). **Bewusst nicht** in `pizza.json`: Fenstergröße,
Titel von Theke/Herd – die stehen im Code (`neu Herd("…", breite: …)`), sonst gäbe es zwei Quellen.

### 1.3 Pfadregeln (E3)

- Pfad = Segmente mit `/`, je Segment `[a-z0-9_-][a-z0-9_.-]*` (nicht mit `.` beginnend), keine leeren Segmente, kein `.`/`..`,
  Gesamtlänge ≤ 120, ≤ 8 Ebenen. Ordner `pruefung/` an der Wurzel ist für Tests reserviert und gehört nicht zum Programm.
- Gleiche Prüfung (eine Funktion `PizzaLang.projekt.pruefePfad`) in Interpreter, CLI, Playground (Umbenennen, ZIP-Import), Teilen-Dienst.
  Der Dienst prüft **unabhängig** noch einmal (eigene Kopie der Regel, durch gemeinsame Testfälle abgesichert).
- Erlaubte Dateiarten v1: `.pizza`, `.png`, `.jpg`/`.jpeg`, `.txt`, `.json`, `.csv`, `.md` (Beschreibung/Notizen; nur Anzeige). Andere Endungen →
  im Playground nicht anlegbar, beim ZIP-Import übersprungen (mit Meldung), CLI ignoriert sie mit Warnung auf stderr.
- **Textdateien an der Projektgrenze** (CLI-Lader, ZIP-Import, Datei hinzufügen, Teilen-Download, Durchreiche): Inhalt muss gültiges
  UTF-8 sein (sonst abgelehnt: „<pfad> ist kein gültiger UTF-8-Text.“; JS `TextDecoder("utf-8", { fatal: true, ignoreBOM: true })`,
  Rust `str::from_utf8`), ein BOM bleibt erhalten, **`\r\n` → `\n`** (einzelnes `\r` bleibt). Grund: `core.autocrlf=true` ohne
  `.gitattributes` checkt Textdateien unter Windows mit CRLF aus – ohne Normalisierung lieferten `Kiste.text`, Hashes und Teilen-Dedup
  unter Windows andere Bytes als im Browser bzw. im Docker-Bau. Zusätzlich legt PD1 eine `.gitattributes` an, die nur Binärdateien
  festlegt (`*.png *.jpg *.jpeg *.teigling *.wasm binary`) – Textdateien regelt die Normalisierung, nicht Git.
- **Grenzen des Laders** (alle Motoren gleich, damit lokal Lauffähiges auch teil- und exportierbar ist): ≤ 100 Dateien, je Datei
  ≤ 2 MiB, `.pizza` ≤ 512 KiB, gesamt ≤ 8 MiB (ohne `pruefung/`) → `PizzaFehler P0020: Das Projekt ist zu groß für den Ofen (<Grund>).`
  (z. B. `130 Dateien, höchstens 100`); Teigmenge §5.3.

### 1.4 Die Dateisammlung (E2) – überall dieselbe Form

```js
{ hauptdatei: "hauptgang.pizza", name: "Teigball",
  dateien: { "hauptgang.pizza": "…Text…", "welt/tisch.pizza": "…", "bilder/tischdecke.png": Uint8Array, "pizza.json": "…" } }
```
Texte (`.pizza .txt .json .csv .md`) als String (UTF-8, normalisiert nach §1.3), alles andere als `Uint8Array`. `pizza.json` darf
fehlen; ist sie da, werden `name`, `hauptdatei` und `args` der Sammlung **aus ihr abgeleitet** (`PizzaLang.projekt.ausDateien`) – es gibt
keine zweite Quelle. **Beim Teilen, ZIP- und EXE-Export erzeugt der Playground eine fehlende `pizza.json`** (aus Projektname und
Hauptdatei); Umbenennen eines Projekts mit `pizza.json` ändert deren `name`. Empfänger (Code-/App-Link, ZIP-Import) leiten alles mit
`ausDateien` ab, nie aus Begleitfeldern.

### 1.5 Ein-Datei-Programme (E24)

Ein String ist eine Sammlung `{ dateien: { "hauptgang.pizza": code }, hauptdatei: "hauptgang.pizza" }`. **Regel für alle Motoren und
Eingabeformen:** Besteht das Programm (die erreichbaren Dateien, §2.2) aus genau **einer** `.pizza`-Datei, ist das Feld `datei` der Ereignisse
`null` und kein Text nennt eine Datei – egal ob als String, CLI-Datei oder Ein-Datei-Projekt geladen. So vergleichen Differenztests nie
`null` mit einem Pfad, und keine bestehende Testdatei ändert sich. `bestellt` in einem Ein-Datei-Programm ohne
Sammlung → `PizzaFehler P0015` (Datei fehlt). CLI: `node bin/pizza.js spiel/hauptgang.pizza` → Projektwurzel = nächster Ordner aufwärts
(höchstens 8 Ebenen) mit `pizza.json`; die angegebene Datei ist die Hauptdatei und muss unter der Wurzel liegen. **Ohne** `pizza.json`
ist die Wurzel der Ordner der Datei, aber die Sammlung besteht nur aus der Datei und den per `bestellt` erreichten `.pizza`-Dateien
(bei Bedarf gelesen) – die CLI durchsucht nie ungefragt einen Ordner (z. B. `tests/faelle/` mit über 1000 Dateien). Assets (`Kiste`,
`Bildchen.laden`) brauchen also ein Projekt: `pizza.json` oder Aufruf mit dem Ordner (`node bin/pizza.js spiel/`).

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
  Endung `.pizza` Pflicht. Kontextuelles Schlüsselwort: `bestellt` bleibt als Bezeichner gültig (geprüft 2026-10-23: im Repo kommt
  `bestellt` nur in Texten/Kommentaren vor, nie als Bezeichner).
- **Parser** (`programm()` in `site/js/pizza/parser.js`): auf oberster Ebene, wenn das Token ein `name` mit Wert `bestellt` ist **und** das
  nächste ein `text`-Token, entsteht ein Knoten `{ k: 'Bestellt', pfad, z, s }` (anders als `paket`/`import`, die der Parser verwirft).
  Gilt der Wert des Literals nach Escape-Auflösung nicht nach §1.3 → P0015 (ungültiger Pfad). `bestellt` ohne folgendes `;` → P0001 wie
  bei `paket`. Alles andere (`bestellt = 3;`, `bestellt(x)`) bleibt ein normaler Bezeichner.
- Doppelte Bestellung derselben Datei in einer Datei → Warnung `W0004: "rezepte/teig.pizza" ist schon bestellt.` (harmlos; Position = das
  zweite `bestellt`). Nummer W0004 statt W01xx, weil W00xx die statischen Warnungen sind (W0003, W0013, W0032) und W01xx die der
  Laufzeitumgebung (W0100 … W0104).
- Eine Datei darf sich nicht selbst bestellen → Zyklus (P0014). Ebenso kann **niemand die Hauptdatei bestellen** (sie ist die Wurzel der
  Tiefensuche, jede Bestellung wäre ein Kreis): Nebendateien sehen daher nie Namen der Hauptdatei. Gemeinsamer Zustand (Spielobjekt,
  Zettel, Konstanten), den Nebendateien brauchen, gehört in eine Nebendatei (z. B. `zustand.pizza`), die alle bestellen.
- `paket …;` und `import x.y.*;` bleiben erlaubt und **ignoriert** (SPEC §2).

### 2.2 Programm = erreichbare Dateien, Ladereihenfolge (E9)

1. Start bei der Hauptdatei. Für jede Datei: parsen, ihre `bestellt` in **Textreihenfolge** besuchen (Tiefensuche), danach die Datei selbst
   in die **Ladeliste** aufnehmen (Abhängigkeiten zuerst). Schon besuchte Dateien werden übersprungen. Die Hauptdatei steht damit zuletzt.
2. Eine Datei, die gerade besucht wird, erneut zu erreichen = **Zyklus** → `PizzaFehler P0014: Kreisbestellung: hauptgang.pizza → a.pizza → b.pizza → a.pizza.`
   (Position: das `bestellt`, das den Kreis schließt).
3. Fehlende Datei → `PizzaFehler P0015: Die Datei "rezepte/tieg.pizza" gibt es im Projekt nicht.`; ungültiger Pfad →
   `PizzaFehler P0015: "Rezepte/Teig.pizza" ist kein gültiger Dateipfad (nur a–z, 0–9, -, _, . und /).`
4. `.pizza`-Dateien, die nicht erreichbar sind, gehören nicht zum Programm (keine Warnung – im Playground grau markiert).
5. **Syntaxfehler** werden in Besuchsreihenfolge gemeldet (eine Datei wird beim ersten Besuch geparst); der erste beendet den Start
   (wie heute: ein Syntaxfehler, Exit 2).
6. **Reihenfolge der Ladeprüfungen** (der erste Fehler bricht ab, alle mit Exit 2, 0 Schritten und **ohne** vorherige Warnungen – wie ein
   Syntaxfehler heute): `pizza.json` (P0015) → Tiefensuche mit Syntaxfehlern, P0014, P0015 in Besuchsreihenfolge → Grenzen (P0020 Dateien/
   Größe) → P0017 → P0016 → P0018/P0019 (je Datei in Ladereihenfolge, darin nach Position). Erst danach folgen wie heute die Warnungen
   (zuerst W0004 aus dem Lader in Ladereihenfolge, dann `analysiere`: W0666, W0032 …) und die bestehenden Startprüfungen (Q0004, P0010,
   P0011, R0001, A0001, P0013), zuletzt P0020 (Teigmenge, §5.3). Ereignis-`art` der Ladeprüfungen: `"pizzafehler"`, Syntax: `"syntax"`.

**Ablauf (erweitert SPEC §2 „Snack-Modus“):** Das Programm ist die **Verkettung der Dateirümpfe in Ladereihenfolge** (Hauptdatei zuletzt);
darauf gilt SPEC §2 unverändert: (1) alle Deklarationen registrieren (Hoisting), (2) Top-Level-Anweisungen in Reihenfolge – das sind
zuerst die Variablen-Initialisierungen der Nebendateien, dann die Anweisungen der Hauptdatei –, (3) `hauptgang`. Statische
Initialisierungen, Annotationen (`@Kühlschrank` …) und die Analyse laufen auf diesem einen Programm: Der **Programm-Scope von W0032 umfasst
alle Dateien**, W0666 kommt einmal je Programm (erste Fundstelle in Ladereihenfolge), W0003 einmal je Methode. Die Doppelmeldungs-Sperre
für Warnungen (`warnSet`, heute Schlüssel `code:zeile:spalte`) bekommt die Datei in den Schlüssel (`code:datei:zeile:spalte`) – sonst
verschluckte sie Warnungen an gleicher Zeile/Spalte in zwei Dateien; dasselbe im Compiler-Port von `analysiere` und in der Laufzeit. Laden und Bestellen kosten **keine Schritte** – Schrittzahlen eines Programms ändern sich nicht, wenn man es auf Dateien aufteilt
(Prüfstand-Fall: dasselbe Programm als eine und als drei Dateien → identische Ereignisse inkl. `schritte`/`zeitMs`, nur `datei`-Felder
verschieden).

### 2.3 Nebendateien (E8)

Erlaubt: `bestellt`, `paket`, `import`, Klassen, Rezepturen, quattrostagioni, Top-Level-Funktionen, Top-Level-Variablen (auch `gebacken`,
mit beliebigem Initialisierer, auch Mehrfachdeklaration `salami a = 1, b;`). Jede andere Anweisung (Position: ihr erstes Token) →
`PizzaFehler P0017: In rezepte/teig.pizza dürfen nur Rezepte stehen (Klassen, Funktionen, Variablen) – Anweisungen gehören in die Hauptdatei hauptgang.pizza.`
**`hauptgang` gehört in die Hauptdatei:** eine Methode (auch in einer verschachtelten Klasse) oder Top-Level-Funktion `hauptgang` in
einer Nebendatei →
`PizzaFehler P0017: hauptgang gehört in die Hauptdatei hauptgang.pizza, nicht nach rezepte/teig.pizza.` In der Hauptdatei wird er wie heute
gesucht (K-033: erste Klasse mit `hauptgang`, sonst Top-Level-Funktion). Damit ist der Einstieg immer eindeutig, unabhängig von der
Ladereihenfolge.

### 2.4 Namen und Konflikte (E5)

- Alle obersten Namen (Klassen, Rezepturen, quattrostagioni, Top-Level-Funktionen, Top-Level-Variablen) liegen in **einem**
  Projekt-Namensraum. **Verschachtelte** Klassen/Rezepturen/quattrostagioni zählen mit (sie werden heute schon global registriert,
  SPEC §14.5) und gehören zur Datei ihrer äußeren Klasse. Derselbe Name in zwei Dateien →
  `PizzaFehler P0016: 'Teig' gibt es zweimal – in rezepte/teig.pizza (Zeile 3) und in hauptgang.pizza (Zeile 10).` (Position: das
  spätere in Ladereihenfolge). Das gilt auch für `geheimrezept`-Namen (Namen bleiben projektweit eindeutig – einfache Regel, kein Verstecken).
- Überladung von Top-Level-Funktionen (gleicher Name, andere Arität) **über Dateigrenzen hinweg** → ebenfalls P0016 (Überladungen gehören
  in eine Datei).
- Innerhalb **einer** Datei gilt alles wie bisher.
- Eingebaute Klassen (Theke-Zutaten, Herd-Klassen): „eine eigene Klasse gleichen Namens hat Vorrang“ gilt projektweit.

### 2.5 Sichtbarkeit (E6, E7)

- Eine Datei **sieht**: ihre eigenen obersten Namen + die nicht-`geheimrezept` obersten Namen der Dateien, die sie **direkt** bestellt.
  Die Standardbibliothek und eingebaute Klassen sind immer sichtbar.
- **Prüfung (Ladeprüfung in `PizzaLang.projekt.lade`, auf den Tokens jeder Datei – der Lexer liegt in `site/js/pizza/lexer.js`, der Compiler ruft
  denselben Lader; deterministisch, Reihenfolge = Ladereihenfolge, dann Position):**
  Für jede Datei F und jedes Bezeichner-Token t in F, das (a) nicht direkt hinter `.` oder `@` steht, (b) kein benanntes Argument `t:`
  (auch in Annotationen) ist, (c) gleich einem obersten Namen N einer anderen Datei G ist und (d) **nicht** irgendwo in F als lokale
  Variable, Parameter, Lambda-Parameter, `für`-/Fang-/`roh`-Variable, Generik-Parameter (`<T>`) oder Mitglied deklariert ist und **kein**
  Mitgliedsname irgendeiner Klasse und **kein** Wertname irgendeines quattrostagioni des Projekts ist (`fall WINTER ->`):
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
  CLI (K-083): `<text> (Zeile Z, Spalte S)` bzw. `<text> (rezepte/teig.pizza, Zeile Z, Spalte S)`. **Regel für alle Hüllen** (CLI,
  nativer Host, Playground-Konsole): Pfad nennen, sobald `datei ≠ null` – also in Mehrdatei-Programmen auch für die Hauptdatei
  (`(hauptgang.pizza, Zeile 3, Spalte 1)`). So braucht kein Host zu wissen, welche Datei die Hauptdatei ist; Ein-Datei-Programme
  (`datei = null`) sehen aus wie heute.
- Die Ladeprüfungen P0014–P0019 und Syntaxfehler tragen die Datei, in der die Ursache steht.
- **Was sich an Texten wirklich ändert:** Das `text`-Feld enthält einen Ort nur bei der ungefangenen Ananas (`… (Zeile 12)`, heute in
  `site/js/pizza/laufzeit/kern.js` und `laufzeit/src/start.rs` angehängt) – dort wird es in Nebendateien `… (rezepte/teig.pizza, Zeile 12)`. Alle anderen Orte
  (Warnungen, PizzaFehler) stehen nur in den Feldern; die Ortsangabe davor/dahinter bauen die Hüllen (CLI `bin/pizza.js` `pos`/
  `meldungText` – dessen Regex `\s\(Zeile (\d+)\)$` muss auch `(<pfad>, Zeile N)` erkennen –, Playground-Konsole, nativer Host
  HOST-ABI §7) aus `datei`/`zeile`/`spalte`.
- **Ereignisform:** `{ typ: "fehler", code, art, text, datei, zeile, spalte }` bzw. `{ typ: "warnung", code, text, datei, zeile, spalte }`
  – `datei` steht **immer** im Ereignis (auch als `null`) direkt vor `zeile`. Tests, die ganze Ereignisse vergleichen
  (z. B. `tests/run-tests.js` „Herd-Kern fehlt“), bekommen `datei: null` ergänzt; Testdateien (`.erwartet`, `.fehler`, `.warnungen`) bleiben.
- **Stapel:** Bei ungefangener Ananas zählt der Ort, an dem sie entsteht (wie heute) – keine Aufrufkette (unverändert).

### 2.7 API (Interpreter, `site/js/pizza.js`; Quellen `site/js/pizza/`, ARCHITEKTUR §1)

```js
PizzaLang.run(quelle, optionen)           // quelle: string (Ein-Datei) | Projekt { dateien, hauptdatei?, name? } (§1.4)
                                          // neu in optionen: teiglinge?: { pfad → Uint8Array } (vorgebackene Bilder, §5.4),
                                          //   vorbacker?: WebAssembly.Module von teigling.wasm (wie herdKern; Node: site/js/herd/teigling.wasm)
PizzaLang.parse(quelltext, { datei }?)    // eine Datei (Live-Diagnose); kennt jetzt den Knoten 'Bestellt'; datei = Index für die Knoten (Standard 0)
PizzaLang.projekt.lade(projekt)           // → { ok: true, ladeliste: [pfad], ast, dateien: [pfad…], warnungen: [W0004…] }
                                          //   | { ok: false, fehler: { code, art, text, datei, zeile, spalte } } – gemeinsamer Lader (Interpreter + Compiler)
PizzaLang.projekt.ausDateien(dateien)     // pizza.json auswerten → { name, hauptdatei, args, dateien } | { fehler } (P0015)
PizzaLang.projekt.pruefePfad(pfad)        // → null | Fehlertext
```
Jeder AST-Knoten kennt seine Datei (Feld `di` = Index in `dateien`, seit PA1 – `d` war an Knoten schon belegt; `dateien[0]` ist die Hauptdatei); der Lader liefert **ein**
zusammengesetztes Programm in Ladereihenfolge (`ast.body` = Verkettung). Der Wasm-Compiler (`site/js/pizzaiolo.js` →
`frontend.js`) ruft `projekt.lade` statt `PizzaLang.parse` und nimmt dieses Programm statt eines einzelnen ASTs → identische
Hoisting-/Initialisierungsreihenfolge; seine Positionstabelle (`this.pos`) speichert den Datei-Index mit. Wichtig: Der Compiler hat
**eigene Ports** von `analysiere` und der Startprüfung (`frontend.js`, nicht `PizzaLang.intern.pruefe`) – alles Projektbezogene liegt
deshalb im Lader, die Ports bekommen nur Datei-Index und Doppelmeldungs-Schlüssel (§2.2) nachgezogen. `PizzaLang.run(string)` bleibt
die Ein-Datei-Abkürzung (`projekt.lade({ dateien: { "hauptgang.pizza": quelle } })`).

### 2.8 Wasm, pkarton, Host (E11, E12)

- `Pizzaiolo.kompiliere(quelle, optionen)` und `Pizzaiolo.run(quelle, …)` nehmen dieselbe `quelle` wie `PizzaLang.run`. **Alle**
  erreichbaren Dateien landen in **einem** Modul; Assets als Datensegment (§5.6).
- **HOST-ABI v2:** `warnung(code, text, datei_ptr, datei_len, zeile, spalte)`, `fehler(art, code, text, datei_ptr, datei_len, zeile, spalte)`;
  `datei_len` 0 = `null`. `abi_version()` → 2. Hosts lehnen 1 mit Ladefehler ab (keine Rückwärtskompatibilität nötig; alle `.pkarton`
  entstehen ohnehin neu). Custom Section `pizzaiolo`: `"abi": 2`, zusätzlich `"projekt": { "name", "dateien": n }` (informativ).
  Die Laufzeit hält eine Tabelle Datei-Index → Pfad im Datensegment; die **Positionstabelle** des Moduls (Ananas-`pos`, Schrittlimit)
  bekommt den Datei-Index dazu.
- **Küchenbericht** (HOST-ABI Anhang A): Ereignis 5 `warnung` bekommt `bytes datei` (leer = `null`) vor `bytes code`; `pos` zeigt in die
  erweiterte Positionstabelle. Format gehört der Laufzeit, Hosts reichen es nur weiter – betroffen sind trotzdem die Zusammenführung in
  `host/src/kueche.rs` und `site/js/pizzaiolo/koch.js`.
- **Alle ABI-Nutzer** (nicht nur `host-js.js`): `site/js/pizzaiolo/host-js.js`, `host/src/laufen.rs`, `host/src/kueche.rs`,
  `host/tests/abi.rs`, `tests/wasm/klon-host.js`, `tests/wasm/herd.js`, `tests/herd/bild.js`, `tests/herd/zeige.js` (vor PA2 per
  `git grep -n "warnung\|fehler:" -- host tests site/js/pizzaiolo` erneut vollständig ermitteln).
- Nativer Host (`pizza-host`, EXE): neue Signatur und Ortsausgabe nach §2.6 (HOST-ABI §7: `⚠ <text> (<pfad>, Zeile z, Spalte s)`, Pfad nur
  wenn `datei ≠ null`, §2.6); sonst keine Änderung – er kennt weiter nur ein `.pkarton`.
- **Standard-Argumente** aus `pizza.json` (§1.2) bettet der Compiler ein; die Laufzeit nimmt sie, wenn der Host 0 Argumente übergibt.
- Differenztests: Ereignisse inklusive `datei` werden in allen drei Motoren verglichen.

### 2.9 CLI

`node bin/pizza.js <ordner | ordner/pizza.json | datei.pizza> [args…]` – Ordner/Projektdatei → Projekt (alle Dateien unter der Wurzel
außer `pruefung/`, rekursiv, Grenzen §1.3); Datei → §1.5. Unterscheidung über `fs.statSync` (Ordner) bzw. Dateiname `pizza.json`.
`--ast` gibt die Ladeliste und die ASTs aus. Der Kompilier-Weg zur EXE (überall, wo heute `.pizza` → `.pkarton`) nimmt ebenfalls Ordner. Fehlerausgabe
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
  bzw. Canvas (CSP `img-src 'self' data:` bleibt, keine `blob:`-Bilder). Die **Gültigkeitsprüfung** (PNG/JPEG, Größe) macht der Vorbacker
  (§5.3) beim Hinzufügen – dieselbe Meldung wie zur Laufzeit.
- Textdateien (`.txt .json .csv .md`) öffnen im Editor ohne pizza-Hervorhebung.

### 3.2 Lokale Speicherung (E15, E16)

- IndexedDB-Datenbank `pizza`, Version 1:
  - `projekte` (Schlüssel `id`): `{ id, name, hauptdatei, args, erstellt, geaendert, offen: [pfad…], aktiv: pfad, angeheftet: [pfad…],
    quelle: null | "beispiel:<id>" | "doku:<id>" | "teilen:<id>@<n>", teilen: null | { id, version, schluessel? } }`
  - `dateien` (Schlüssel `[projektId, pfad]`): `{ inhalt: string | Uint8Array, basis }` (`basis` = Stand für „geändert“-Punkt).
  - `teiglinge` (Schlüssel = SHA-256 der Quelle + `teigling/1`): `{ bytes, groesse, zuletzt }` – vorgebackene Bilder, LRU über
    `zuletzt` bis 128 MiB (§5.4).
- **Ohne IndexedDB** (blockiert, Fehler beim Öffnen): Projekte leben nur im Speicher, Seitenbanner „Projekte werden nicht gespeichert –
  sichere sie als ZIP.“ (kein Browser-Popup); der Playground bleibt voll nutzbar.
- Undo-Historie, Cursor, Scroll bleiben im Speicher (wie heute). Speichern mit Verzögerung (wie heute), außerdem bei `pagehide`.
- Mehrere Playground-Fenster: `BroadcastChannel("pizza-projekte")` meldet Änderungen; das andere Fenster lädt die betroffene Datei neu,
  falls sie dort nicht ungespeichert geändert ist (sonst Hinweis „in einem anderen Fenster geändert“ – zuletzt gespeichert gewinnt).
- Kein `navigator.storage.persist()` (kann in Firefox eine Browser-Abfrage zeigen); Hinweis in „Über“: Browser dürfen Daten bei
  Speichermangel löschen – ZIP-Export sichert.
- Kleine Einstellungen (Thema, Köche, Doku-Seite, feste Saat) bleiben in `localStorage`.
- **Vorratskammer** (Korrektur nach Prüfung – heute gibt es **keinen** Präfix je Tab-Name): Regel K-088 bleibt, nur die Unterscheidung
  wandert vom Tab-Schlüssel (`bsp:`/`doku:`) an `projekt.quelle`: Projekte mit `quelle` `beispiel:…`/`doku:…` nutzen
  `pizza.vorrat-beispiel.<kennung>`, alle übrigen Projekte und der App-Link `pizza.vorrat.<kennung>`; Kammern mit Namensraum
  (`raum/name`, K-106) unverändert immer `pizza.vorrat.<raum>/<name>` (`vorratPraefix` in `ui/src/vorrat.js` bekommt das Projekt statt
  des Tabs). Kammern bleiben in `localStorage`.
- **Migration** (einmalig beim ersten Start): jeder Tab aus `pizza.tabs` wird ein Ein-Datei-Projekt (Name = Tab-Name ohne `.pizza`,
  Datei `hauptgang.pizza`, `args` übernommen; Tab-Schlüssel `bsp:<id>` → `quelle: "beispiel:<id>"`, `doku:<id>` → `"doku:<id>"`,
  `geteilt:…`/`datei:…`/`willkommen` → `null`); `pizza.tabs` wird erst nach erfolgreichem Schreiben in IndexedDB entfernt. Geschlossene
  Tabs („Wiederherstellen“) → Projekte im Papierkorb (Liste „Zuletzt gelöscht“, 10 Einträge, wie `MAX_GESCHLOSSEN`).

### 3.3 Beispiele im Playground

Ein Beispiel öffnen legt eine **Projektkopie** an (`quelle: "beispiel:<id>"`); erneutes Öffnen springt in diese Kopie, solange sie
unverändert ist, sonst Wahl „Zu meiner Kopie“ / „Frische Kopie“. Die Dateien lädt der Playground anhand der Dateiliste im Manifest (§7.2);
`pruefung/` wird nicht geladen.

### 3.4 ZIP (E17)

- **Export:** Ordner `<projektname>/…` mit allen Dateien inkl. erzeugter `pizza.json` (falls nicht vorhanden), Methode „stored“, CRC-32,
  UTF-8-Namensflag. Kleiner eigener Schreiber (~80 Zeilen) in `ui/src/zip.js`.
- **Import:** „stored“ und „deflate“ (`DecompressionStream("deflate-raw")`); Größen und Namen aus dem **zentralen Verzeichnis** (nicht
  aus den lokalen Köpfen – so gehen auch Archive mit Datendeskriptor, Bit 3, wie sie Windows/macOS erzeugen); CRC-32 jedes Eintrags wird
  geprüft. Haben alle Einträge einen gemeinsamen Wurzelordner, wird er entfernt; `__MACOSX/`, Einträge mit Segmenten ab `.` und Ordner-
  einträge werden still übersprungen; ASCII-Großbuchstaben werden zu Kleinbuchstaben, wenn das Ergebnis gültig und eindeutig ist
  (Meldung „umbenannt“); übrige Pfade nach §1.3 geprüft (ungültig → übersprungen und gemeldet; nie außerhalb des Projekts = kein
  Zip-Slip); Grenzen wie §4.6 (Dateizahl, Einzel-/Gesamtgröße, **entpackt** gemessen, Abbruch beim Überschreiten während des Entpackens
  = keine ZIP-Bombe); Verschlüsselung/ZIP64/andere Methoden → Meldung „Diese ZIP-Datei kann der Playground nicht lesen.“
- CLI braucht kein ZIP (Ordner sind dort nativ).

### 3.5 EXE-Export und App-Link

- **EXE:** Projekt kompilieren (alle Dateien + vorgebackene Bilder, §5.6) → `PizzaExe.baue(pkarton, ziel)` wie heute; Dateiname aus `name`.
  Fehlende Importgruppen (`PizzaExe.fehlendeGruppen`) wie heute.
- **App-Link** `#app=<id>[@n]`: lädt das Manifest und die Blobs (§4), baut die Sammlung, startet wie heute im Vollbild; Titel = `name`.
  „Code ansehen“ öffnet `#h=<id>[@n]` (Projekt im Playground).
- **Code-Link** `#h=<id>[@n]`: öffnet das geteilte Projekt als lokale Kopie (`quelle: "teilen:<id>@<n>"`); ist die ID die eines eigenen
  Projekts mit Schlüssel, wird **dieses** Projekt fokussiert (ggf. Hinweis „neuere Version auf dem Server – laden?“ im Seitenbanner).

### 3.6 Worker-Protokoll (ARCHITEKTUR §2)

`{ typ: "start", projekt: { dateien, hauptdatei, name }, args?, teiglinge?, vorbacker? }` – Binärdateien und Teiglinge als
`ArrayBuffer`-Transfer, `vorbacker` = `WebAssembly.Module` von `teigling.wasm` (einmal je Seite kompiliert, wie `herdKern`). Ebenso
`{ typ: "kompiliere", projekt, teiglinge?, vorbacker? }` (EXE-Export). `code` als Ein-Datei-Abkürzung bleibt erlaubt. Der Wasm-Motor
bekommt dieselben Felder (`Pizzaiolo.kompiliere/run(quelle, { teiglinge, vorbacker })`, `faehigkeiten.laufOptionen` ergänzt); der
Rückfall auf den Interpreter (`nichtUnterstuetzt`, Motor `auto`) reicht das Projekt unverändert weiter.

---

## 4. Teil C – Teilen-Dienst „Durchreiche“ (ohne Hastebin, mit Versionen)

### 4.1 Überblick

```
Browser ──https──▶ nginx (pizza, einzige Domain)  ──/api/teilen…, /api/blob…, /api/konfig──▶  durchreiche:8291 (nur internes Netz)
                                                                                      └─ Volume durchreiche-daten:/daten
```
- Verzeichnis `durchreiche/` im Repo: `server.mjs` (Node ≥ 22, nur `node:`-Module), `lager.mjs` (Ablage), `regeln.mjs` (Pfade/Grenzen),
  `test/*.test.mjs` (`node --test`), `Dockerfile` (`node:<gepinnt>-alpine`, `USER node`, `read_only`, nur `/daten` beschreibbar).
- Ersetzt die Dienste `hastebin` und `redis`, das Verzeichnis `hastebin/` und das Volume `hastebin-daten`.

### 4.2 Datenmodell

- **Blob:** Dateiinhalt, adressiert über SHA-256 (64 Hex). Unveränderlich, dedupliziert über alle Links und Versionen.
- **Manifest** (selbst ein Blob, JSON, kanonisch serialisiert):
  `{ "format": "pizza-projekt/1", "name", "hauptdatei", "beschreibung"?, "args"?, "dateien": [ { "pfad", "sha256", "groesse" } ] }`
  (Dateien nach Pfad sortiert). Für die spätere GPU-Kompression (§5.7) ist je Bild ein Feld `teigling` (SHA-256 des vorgebackenen Blobs)
  vorgesehen; in v1 gibt es es nicht – Empfänger backen aus der Quelle vor (Cache-Schlüssel = Quell-Hash).
  - **Kanonisch** heißt: UTF-8, ohne Leerraum, Schlüssel in genau der obigen Reihenfolge (fehlende optionale weggelassen), `sha256` als
    64 Kleinbuchstaben-Hex. Der **Dienst serialisiert neu** (er speichert nie die Client-Bytes); der Manifest-Hash ist der SHA-256 dieser
    Bytes – damit ist „gleiches Manifest“ (§4.3) ein Hash-Vergleich.
  - **Prüfung beim Posten** (sonst `422 { "fehler" }`): `format` genau `"pizza-projekt/1"`; unbekannte Felder → 422 (das Format wächst
    über eine neue `format`-Version); `pfad` nach §1.3 (eigene Kopie der Regel), keine doppelten Pfade, kein `pruefung/`; `hauptdatei`
    steht in `dateien` und endet auf `.pizza`; `pizza.json` vorhanden; `name` ≤ 80, `beschreibung` ≤ 500 Zeichen ohne Steuerzeichen;
    `args` wie §1.2; `groesse` = echte Blobgröße; **Typregel je Endung gegen die Blob-Bytes**: `.png` beginnt mit der PNG-Signatur, `.jpg`/
    `.jpeg` mit `FF D8 FF`, Textendungen sind gültiges UTF-8 ohne `\r\n` (§1.3) und `.pizza` ≤ 512 KiB. Erst hier kann der Dienst Typen
    prüfen – beim `PUT` kennt er nur den Hash.
  - `name`, `hauptdatei`, `beschreibung`, `args` im Manifest sind **Kopien aus `pizza.json`** für die Anzeige ohne Blob-Download (Teilen-
    Vorschau, App-Titel vor dem Laden); maßgeblich ist beim Empfänger `projekt.ausDateien` (§1.4).
- **Link:** `{ id, schluesselHash, erstellt, geaendert, versionen: [ { n, manifest: sha256, zeit } ] }` – `n` ab 1, lückenlos.
- Zeitangaben auf ganze Tage gerundet (UTC-Datum `JJJJ-MM-TT`), damit möglichst wenig Nutzungsdaten entstehen. Ausnahme, nie ausgeliefert:
  die Datei-Änderungszeit (`mtime`) der Blobs, die die Müllabfuhr (§4.5) braucht.

### 4.3 HTTP-Schnittstelle (über nginx unter `/api/`)

| Methode + Pfad | Zweck | Antwort |
|---|---|---|
| `GET /api/konfig` | Fähigkeiten für die UI | `{ "teilen": true, "aufbewahrungTage": 90, "aufbewahrungAb": "letzte-version", "grenzen": { "dateien": 100, "dateiBytes": 2097152, "projektBytes": 8388608, "pizzaBytes": 524288, "manifestBytes": 65536 } }` (`aufbewahrungTage: null` = unbegrenzt; Schreibweise mit Bindestrich wie die heutigen Werte `erstellung`/`letzter-abruf`); `TEILEN_URL` leer **oder** Dienst nicht erreichbar → nginx liefert `{"teilen":false}` |
| `POST /api/blob/fehlend` | Body `{ "sha256": [ … ] }` (≤ `grenzen.dateien` Einträge, 64 Kleinbuchstaben-Hex) | `{ "fehlend": [ … ] }`; als vorhanden gemeldete Blobs bekommen eine frische `mtime` (sonst könnte die Müllabfuhr sie zwischen Antwort und Manifest löschen) |
| `PUT /api/blob/<sha256>` | Body = Rohbytes (≤ `dateiBytes`) | `201` neu / `200` vorhanden; Hash wird beim Schreiben in `tmp/` mitgerechnet und vor dem `rename` geprüft (`422` bei Abweichung) |
| `GET /api/blob/<sha256>` | Inhalt | `application/octet-stream`, `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment` |
| `POST /api/teilen` | Body = Manifest | neuer Link: `201 { "id", "version": 1, "schluessel" }`; fehlende Blobs → `409 { "fehlend": [ … ] }` |
| `POST /api/teilen/<id>` | Body = Manifest, Kopf `Authorization: Bearer <schluessel>` | neue Version: `201 { "id", "version": n }`; falscher Schlüssel `403`; unbekannt/abgelaufen `404` |
| `GET /api/teilen/<id>` | neueste Version | `{ "id", "version", "versionen", "geaendert", "ablauf", "projekt": <Manifest> }` (`versionen` = Anzahl, `geaendert`/`ablauf` = UTC-Datum, `ablauf: null` = unbegrenzt), `Cache-Control: no-store` |
| `GET /api/teilen/<id>@<n>` | feste Version | wie oben, `Cache-Control: private, max-age=31536000, immutable` (Ablauf trotzdem nach §4.5; `private`, damit gelöschte Links in keinem geteilten Cache weiterleben) |
| `DELETE /api/teilen/<id>` | Link samt allen Versionen löschen (mit Schlüssel) | `204` |
| `GET /healthz` | nur intern (Healthcheck) | `200 ok` |

- Ablauf beim Teilen (Client, `ui/src/teilen.js`): Manifest bauen → `fehlend` fragen → fehlende Blobs nacheinander hochladen → Manifest
  posten (bei `409` einmal wiederholen). Eine **neue Version** mit unveränderten Bildern lädt nur die geänderten Textdateien hoch.
- Gleiches Manifest wie die neueste Version → keine neue Version, Antwort `200 { "id", "version": <alt>, "unveraendert": true }`.
- Fehlertexte als JSON `{ "fehler": "<deutscher Satz>" }`, ohne Interna.
- **Cache-Control setzt nginx**, nicht der Dienst: `nginx-proxy.conf` versteckt und ignoriert Upstream-`Cache-Control`
  (`proxy_hide_header`/`proxy_ignore_headers`), der Wert kommt aus der Map `$pizza_cache_control` (heute `~^/api/ → no-store`). PC1
  ergänzt dort **vor** der `/api/`-Zeile: `~^/api/blob/[0-9a-f]{64}$` und `~^/api/teilen/[0-9A-Za-z]{12}@[0-9]+$` →
  `private, max-age=31536000, immutable` (Map-Regexe werden in Reihenfolge geprüft); nur für Status 200 (`$pizza_cache_header`).
- **Anfragen mit Body** (`POST`, `PUT`) verlangen `Content-Type: application/json` (bzw. `application/octet-stream` beim Blob-PUT),
  sonst `415` – ein fremdes HTML-Formular kann so keine Links im Namen eines Besuchers anlegen (Formulare senden nur
  `text/plain`/`form`-Typen ohne CORS-Vorabfrage). CORS-Header gibt es nicht.

### 4.4 Versionen, Schlüssel, Links

- Beim Erstellen erzeugt der Dienst `id` (12 Zeichen Base62 aus `crypto.randomBytes`, je Zeichen **Verwerfungsverfahren** – Byte ≥ 248
  verwerfen, dann `% 62` –, damit keine Zeichen bevorzugt werden) und `schluessel` (32 Byte, Base64url = 43 Zeichen), speichert nur
  `sha256(schluessel)` und vergleicht mit `crypto.timingSafeEqual`. Der Schlüssel wird **nur einmal** ausgeliefert. Eine neue Linkdatei
  wird nur angelegt, wenn es die ID noch nicht gibt (Prüfung unter der globalen Sperre, §4.5) – eine (praktisch unmögliche) Kollision
  führt zu einer neuen ID statt zum Überschreiben. `Authorization` wird vor dem Hashen geprüft (`^Bearer [A-Za-z0-9_-]{43}$`, sonst `403`).
- Ein eingegebener Schlüssel („Schlüssel eingeben“) wird nicht vorab geprüft; passt er nicht, meldet die nächste „Neue Version“ `403` →
  „Der Schlüssel passt nicht zu diesem Link.“ Liefert der Server für einen eigenen Link `404`, entfernt der Playground `projekte.teilen`
  (mit Hinweis „Der Link ist abgelaufen oder gelöscht.“).
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
  Teilen-Dienst und ist nicht mehr verfügbar.“ (Entscheidung F6).
- Höchstens **200 Versionen** je Link; danach `409 { "fehler": "Dieser Link hat schon 200 Versionen – teile einen neuen Link." }`.

### 4.5 Aufbewahrung und Aufräumen

- `TEILEN_ABLAUF_TAGE` (Standard 90; 0 = unbegrenzt). Ablauf = `geaendert` + Tage (also ab der **letzten Version**); der Link gilt bis
  einschließlich dieses UTC-Datums (`ablauf` im GET, Datum im Dialog), ab dem Folgetag liefert er sofort `404`, der Aufräumlauf
  (stündlich) löscht ihn.
- **Blob-Müllabfuhr** (stündlich, mit dem Aufräumlauf): Markieren (alle Manifeste lebender Links + deren Blobs), Löschen aller übrigen
  Blobs, deren `mtime` älter als **1 h** ist (frisch hochgeladene, noch nicht gepostete Blobs bleiben; ein Teilen dauert Sekunden).
  Müllabfuhr und `POST /api/teilen…` laufen unter **einer** globalen Sperre im Prozess (das Posten prüft die Existenz aller Blobs unter
  dieser Sperre) – sonst könnte ein Link auf einen gerade gelöschten Blob zeigen.
- **Lose Blobs** (hochgeladen, noch von keinem Manifest benutzt) sind die billigste Missbrauchsfläche (PUT braucht keinen Schlüssel):
  je IP höchstens **32 MiB** lose Blobs in der letzten Stunde (Zähler nur im Speicher), insgesamt höchstens **10 %** des Speicherdeckels
  lose – darüber `429` bzw. `507`. Neue Bytes in Links je IP höchstens **64 MiB/h** (gleitendes Fenster, im Speicher).
- **Speicherdeckel** `TEILEN_SPEICHER_MAX_MB` (Standard 2048, Summe im Speicher geführt, beim Start durch Durchlauf ermittelt): darüber
  `507 { "fehler": "Der Teilen-Speicher ist gerade voll …" }`. Bekanntes Restrisiko: Viele IPs zugleich können den Deckel füllen – dann
  scheitert nur das **Teilen** (Lesen läuft weiter); lose Blobs verschwinden nach 1 h von selbst.

### 4.6 Grenzen (alle per Umgebungsvariable einstellbar, `/api/konfig` meldet sie)

| Grenze | Standard | Durchsetzung |
|---|---|---|
| Dateien je Projekt | 100 | Dienst (Manifest), Playground vorab |
| Einzeldatei | 2 MiB | nginx `client_max_body_size` (Blob-Location), Dienst |
| Projekt gesamt | 8 MiB | Dienst (Summe `groesse` der Manifest-Einträge, gegen echte Blobgrößen geprüft) |
| Manifest | 64 KiB | nginx + Dienst |
| `.pizza`-Datei | 512 KiB | Dienst (Typregel) |
| Anfragen | Erstellen/Version/Löschen: 10/min je IP (Burst 3); Manifest lesen (`GET /api/teilen/…`): 60/min (Burst 20); `fehlend`: 60/min (Burst 20); Blob-PUT: 240/min (Burst 120) plus Byte-Grenzen §4.5; Blob-GET: **kein** Zähler im Dienst, nginx 1200/min (Burst 300) | nginx `limit_req` (erste Linie; je Klasse eine eigene `limit_req_zone`, Schlüssel `$binary_remote_addr` nach `real_ip`) + Dienst (gleitendes Fenster je `X-Real-IP`, das nginx in `nginx-proxy.conf` aus `$remote_addr` **überschreibt** – der Client kann es nicht fälschen; nur im Speicher). Begründung: ein Projekt sind bis zu 101 Anfragen (Manifest + Blobs); Blobs sind unveränderlich und gecacht, wiederholtes Öffnen kostet den Server kaum etwas, und Missbrauch begrenzen Größen-, Byte-, Speicher- und Erstell-Grenzen |
| Versionen je Link | 200 | Dienst |
| Bilder | PNG/JPEG ≤ 2048 × 2048; Teigmenge ≤ 32 MiB je Projekt (§5.3) | Playground und Teilen vorab (Vorbacker); der Dienst prüft nur Signatur und Größe, er dekodiert nichts |

### 4.7 Ablage im Volume

```
/daten/blobs/ab/abcdef…            (Dateiname = SHA-256)
/daten/links/Xy/Xy12345678ab.json
/daten/tmp/…                       (Schreiben: tmp → fsync → rename, dadurch atomar)
```
Ein Prozess, je Link eine Sperre im Speicher plus die globale Sperre für Posten/Müllabfuhr (§4.5); kein Datenbankserver. Beim Start:
`tmp/` leeren, Index der Links (ID → geaendert) und Speichersumme aufbauen. **Pfade im Volume entstehen nur aus geprüften Werten**: ID
gegen `^[0-9A-Za-z]{12}$`, Hash gegen `^[0-9a-f]{64}$` **vor** jedem Dateizugriff; Nutzerpfade (`pfad` im Manifest) werden nie zu
Dateinamen.

### 4.8 Container, nginx, Coolify

- `compose.yaml`: Dienst `durchreiche` (`expose: 8291`, kein Port, keine Domain), Volume `durchreiche-daten:/daten`, `read_only`,
  `tmpfs /tmp`, `no-new-privileges`, Healthcheck `wget -q --spider http://127.0.0.1:8291/healthz`. Dienst `pizza` bekommt
  `TEILEN_URL: ${TEILEN_URL:-http://durchreiche:8291}` (leer = Teilen aus). `hastebin`, `redis`, `hastebin-daten`, `SERVICE_PASSWORD_REDIS`
  entfallen.
- Umbenennungen: `HASTEBIN_URL` → `TEILEN_URL` (compose, Dockerfile `NGINX_ENVSUBST_FILTER`, `docker-entrypoint-pizza.envsh`,
  `nginx-teilen.conf.template`), `HASTEBIN_ABLAUF_SEKUNDEN` → `TEILEN_ABLAUF_TAGE` (nur noch bei `durchreiche`), `TEILEN_AUFBEWAHRUNG_TAGE`
  entfällt (der Dienst beantwortet `/api/konfig`).
- `nginx.conf`: `location ^~ /api/` proxyt an `$teilen_upstream` (Variable + Resolver wie heute, damit nginx ohne den Dienst startet);
  `access_log off` für `/api/` (IDs sind Zugriffsrechte) **und** `error_log /dev/stderr crit;` in `/api/` – sonst schreiben
  `limit_req` (heute `limit_req_log_level warn`) und Upstream-Fehler die Anfragezeile samt ID ins Fehlerprotokoll; `client_max_body_size`
  2m (Blob) bzw. 64k (sonst); `limit_req` wie §4.6; Methoden je Location (`PUT` nur Blob, `DELETE` nur Link); `/api/konfig` mit
  Rückfall `{"teilen":false}` bei 502/503/504. CSP und alle Sicherheitsheader **unverändert** (`connect-src 'self'` reicht).
- `nginx-proxy.conf` (heute `proxy_pass_request_headers off`, reicht nur ausgewählte Köpfe weiter): zusätzlich
  `proxy_set_header Content-Type $content_type;` und – nur in der Location für `POST`/`DELETE /api/teilen/<id>` –
  `proxy_set_header Authorization $http_authorization;`. Ohne diese Zeilen käme der Schlüssel nie beim Dienst an.
- Abhängigkeiten: `durchreiche/Dockerfile` nutzt dasselbe gepinnte Image wie der Haupt-Dockerfile (`ARG NODE_IMAGE=node:24.22.1-alpine3.24`);
  `.github/dependabot.yml` ersetzt `/hastebin` durch `/durchreiche` (Docker).
- Coolify: weiterhin **eine** Domain nur für `pizza` (`SERVICE_URL_PIZZA_8080`), `durchreiche` ohne Domain. `compose.lokal.yaml`
  unverändert (nur `pizza` auf `127.0.0.1`). Hinweis im Betriebsabschnitt der README: altes Volume `hastebin-daten` nach dem Umzug von Hand
  löschen.

### 4.9 Tests

- Unit (`node --test durchreiche/test`): Pfad-/Grenzregeln (gemeinsame Fallliste mit dem Playground), Hash-Prüfung, Schlüssel (falsch,
  fehlt, Zeitvergleich), Versionen (1 … n, `@n`, unverändert, 200er-Grenze), Ablauf (Uhr injizierbar), Müllabfuhr, atomares Schreiben
  (abgebrochenes tmp), Speicherdeckel, Rate-Limit, kein Inhalt im Log (Log-Senke abfangen).
- `node --test durchreiche/test` wird Teil von `npm test` (bzw. `scripts/test-alles.js`) und der Docker-Test-Stufe.
- E2E: `e2e/server.mjs` ersetzt seine Hastebin-Attrappe (`/api/teilen`) durch einen Proxy auf einen echten Durchreiche-Prozess
  (Kindprozess `node durchreiche/server.mjs`, `windowsHide: true`, Datenordner unter `e2e/tmp/`, beim Ende gelöscht); bestehender Test
  `06-teilen-thema-mobil` wird auf das neue Format umgestellt. Neu `18-teilen-versionen.test.mjs`: Teilen → Link öffnen →
  ändern → „Neue Version“ → alter Link zeigt v2 → `@1` zeigt v1 → App-Link startet v2 → „Neuer Link“ → Löschen → 404-Meldung; Projekt mit
  PNG (Dedup: zweite Version lädt das Bild nicht erneut hoch – gezählte PUTs); Projekt mit 100 Dateien zweimal hintereinander öffnen ohne 429.
- Docker: `docker compose -f compose.yaml -f compose.lokal.yaml build` (gedrosselt) + Rauchtest gegen `/api/konfig`.

---

## 5. Teil D – Bilder und Dateien (Assets)

> **Nutzerentscheidung (§10, F15):** PNG und JPEG sind nur **Eingabeformate**. Ein eigener Rust-Decoder wandelt sie beim **Vorbacken**
> (EXE-Export, Teilen, erstes Laden im Playground) einmalig in ein internes, GPU-taugliches Texturformat mit vorberechneten Mipmaps um –
> v1 unkomprimiert, Ergebnis per Hash gecacht; GPU-Kompression ist eine spätere Stufe ohne Änderung an Sprache oder Projekten. Die API
> bleibt `Bildchen.laden("bilder/x.png")`. Gründe: Ladezeit, VRAM/Bandbreite, Download-Größe, Mipmaps gegen Moiré.

### 5.1 Ziel

Texturen und Sprites als **echte Bilddateien** im Projekt (`bilder/…png|jpg`) für Herd (2D-`Bild`, `Animation`, 3D-`Koerper.bild`), dazu
einfache Datendateien (Level als Text, Tabellen). Später (nicht v1): Bilder in der Theke, Ton (`klang`, K-135/H-K14), eigene Schriften,
JSON als Speisekarte, GPU-komprimierte Teiglinge (§5.7).

### 5.2 Sprache

```pizza
Herd herd = neu Herd("Teigball", breite: 960, hoehe: 540);
Bildchen decke = Bildchen.laden("bilder/tischdecke.png");
Blech<Bildchen> lauf = [Bildchen.laden("bilder/bote-1.png"), Bildchen.laden("bilder/bote-2.jpg")];
herd.koerper(Form.ebene(), bild: decke).setzeGroesse(20);
margherita level = Kiste.text("daten/level-1.txt");
```

| API | Ergebnis | Fehler |
|---|---|---|
| `Bildchen.laden(pfad)` (statisch) | `Bildchen` (eigene ID im Kern; `breite()`/`hoehe()` = Originalgröße) | Pfad ungültig/fehlt → `LaufzeitAnanas: Die Datei "bilder/x.png" liegt nicht in der Kiste.`; keine Bilddatei/beschädigt → `LaufzeitAnanas: bilder/x.png ist kein lesbares Bild (PNG oder JPEG).`; zu groß → `LaufzeitAnanas: bilder/x.png ist zu groß (2400 × 800) – höchstens 2048 × 2048 Pixel.`; vor `neu Herd` → Text aus SPEC §18.1 (`Erst braucht es einen Herd …`) |
| `Kiste.text(pfad)` | `margherita` (Inhalt wie in der Sammlung, also UTF-8 mit `\n`-Zeilenenden, §1.3) | fehlt wie oben; Datei ohne Textendung (Bilder) → `LaufzeitAnanas: bilder/x.png ist kein Text.` – entschieden nach **Endung**, nicht nach Bytes (Textdateien sind an der Projektgrenze schon geprüft) |
| `Kiste.zeilen(pfad)` | `Blech<margherita>` (Trenner `\n`, letzte leere Zeile entfällt) | wie `text` |
| `Kiste.gibts(pfad)` | `diavolo` – `ja` nur für Dateien (nicht für Ordner) | nie (ungültiger Pfad → `nein`) |
| `Kiste.liste(ordner = "")` | `Blech<margherita>` aller Dateipfade unter `ordner` (rekursiv; `""` = alle, sonst Präfix `ordner + "/"`, `ordner` ohne Schluss-`/`), sortiert (Bytefolge) | ungültiger oder unbekannter Ordner → leeres Blech |

- **Prüfreihenfolge** (alle Motoren): Argument kein Text → `TypAnanas: Bildchen.laden() braucht einen Text für 'pfad', nicht 5.` (ebenso
  `Kiste.text()` usw.) → vor `neu Herd` (nur `Bildchen.laden`) → Pfad ungültig/fehlt → Fehler-Teigling.
- **Gleicher Pfad, gleiches Bild:** `Bildchen.laden` mit einem schon geladenen Pfad liefert **dasselbe** `Bildchen`-Objekt (keine neue
  Ressource, kein zweites `TEXTUR`-Delta); die Zuordnung Pfad → Bildchen lebt im Laufzeitzustand, gleich in Interpreter und Laufzeit.
- **Herd-Erkennung vor dem Start** (Importgruppe `herd`, `herd_kern(pflicht)`, Interpreter `herdNoetig`, `frontend.js`
  „braucht den Herd-Kern“): `Bildchen.laden` zählt wie `neu Bildchen` – HOST-ABI §2 und beide Motoren ergänzen `Bildchen.…`.
- **Küche:** `Kiste.*` ist in `brigade`-Stücken erlaubt (nur lesend, deterministisch); `Bildchen.laden` ist eine Herd-Methode und wirft dort
  wie alle Herd-Methoden (SPEC §18.1 „Küche“).

- Das Programm spricht Bilder immer über den **Quellpfad** an (`bilder/x.png`); dass intern ein Teigling benutzt wird, ist unsichtbar.
  Ein vorbereiteter Teigling und eine Umwandlung „im letzten Moment“ liefern dieselben Bytes – das Ergebnis eines Laufs hängt nie davon ab,
  ob oder wo vorgebacken wurde.
- Die Fehler (kein Bild, zu groß) stellt der Vorbacker fest. Im Playground/beim Export erscheinen sie sofort am Dateibaum; zur Laufzeit wirft
  `Bildchen.laden` die Ananas erst, wenn das Programm das Bild wirklich lädt (gleich in allen Motoren: der Kiste-Eintrag trägt dann einen
  Fehler-Teigling, §5.3).
- **Kiste** = alle Projektdateien außer `pruefung/` (auch `.pizza`), nur lesen; Schreiben bleibt Aufgabe der Vorratskammer (SPEC §15.4).
  Folge für den EXE-Export: Die Quelltexte liegen damit lesbar im `.pkarton` (Hinweis im EXE-Dialog und in der Doku).
- Schritte: jeder Aufruf ein normaler Aufruf (keine größenabhängigen Kosten).
- `Bildchen.laden` gehört zu Herd (Ressource im Kern, SPEC §18.5, Importgruppe `herd`; ID aus dem gemeinsamen Ressourcen-Zähler für
  Formen und Bildchen); `Kiste` gehört zur Basis (eingebautes Modul wie `Bote`; eine eigene Klasse `Kiste` hat wie üblich Vorrang).
- Text-Bildchen (`neu Bildchen(zeilen, …)`) bleiben unverändert (≤ 256 × 256, Atlas, pixelscharf).

### 5.3 Der Vorbacker und das Format „Teigling“ (E13)

**Vorbacker** = Rust-Crate `herd/teigling` (`no_std` + `alloc`, einzige Abhängigkeit `miniz_oxide` für Inflate, ebenfalls `no_std`),
übersetzt nach `site/js/herd/teigling.wasm` (Browser-Worker, Node-CLI, Interpreter, Harnische). Eine Funktion:
`vorbacken(quellbytes) → teigling` (bei Fehlern ein Fehler-Teigling), dazu `sha256(bytes)` (für die Cache-Prüfung §5.4 – synchrones
SHA-256 gibt es im Browser sonst nicht). Derselbe Code überall ⇒ **bitgleich per Konstruktion**; zusätzlich rechnet der Vorbacker **nur
mit Ganzzahlen** (keine `f32`/`f64`), damit auch die nativen Tests ohne Sonderfälle gleich sind. Bau wie `kern-wasm` (Ziel
`wasm32v1-none`, eigener Allokator, über `node herd/baue.js`); Crate im Workspace `herd/Cargo.toml`, `miniz_oxide` in der dort schon
gesperrten Version (Cargo.lock). Der native Host braucht ihn **nicht** (er bekommt fertige Teiglinge im pkarton).

**Decoder (deterministisch, keine Farbverwaltung):**
- **PNG:** Farbtypen Grau, Grau+Alpha, RGB, RGBA, Palette (+`tRNS`; bei Grau/RGB als Farbschlüssel, verglichen in der **Original**-
  Bittiefe vor dem Kürzen); alle fünf Zeilenfilter; dekomprimierte Länge muss **genau** `Höhe × (1 + Zeilenbytes)` sein (sonst Fehler);
  Bittiefen 1/2/4/8, 16 bit → obere 8 Bit, Grau < 8 bit hochskaliert per `v × 255 / (2^b − 1)`. Nicht unterstützt:
  Interlacing (Adam7), APNG (Animationen über mehrere Dateien + `Animation`), fehlerhafte CRC. `gAMA`/`cHRM`/`sRGB`/`iCCP` werden ignoriert
  (Rohwerte).
- **JPEG:** Baseline und progressiv, Huffman, 8 bit, 1 Komponente (Grau) oder 3 (YCbCr/JFIF), Abtastfaktoren 1 … 4 mit ganzzahligem
  Verhältnis zur Luma (4:4:4, 4:2:2, 4:2:0, 4:4:0, 4:1:1), Restart-Marker (`DRI`/`RSTn`, in Kamerabildern üblich).
  **Festgelegte Rechenwege:** ganzzahlige IDCT nach libjpeg „islow“ (`jidctint`), Chroma-Hochrechnung durch **Wiederholen** (kein „fancy
  upsampling“), YCbCr → RGB mit den 16-bit-Festkomma-Tabellen von libjpeg (`jdcolor`), Rundung/Klemmung wie dort. Nicht unterstützt:
  arithmetische Kodierung, 12 bit, CMYK/Adobe-Transform, verlustfrei/hierarchisch. **EXIF-Drehung wird ignoriert** (gespeicherte
  Pixelreihenfolge zählt; Doku-Hinweis: Fotos vorher gerade speichern).
- Ergebnis jeder Dekodierung: RGBA8, **nicht vormultipliziert** (JPEG: Alpha 255).

**Mipmaps (v1):** Stufe 0 = Originalgröße; jede weitere Stufe halbiert Breite und Höhe (abgerundet, mindestens 1) bis 1 × 1. Jedes
Zielpixel aus dem 2 × 2-Block der Vorstufe (bei ungerader Größe letzte Zeile/Spalte wiederholt), **alpha-gewichtet, nur Ganzzahlen**:
`a = (Σa + 2) >> 2`; je Farbkanal `c = Σa > 0 ? (Σ c·a + Σa/2) / Σa : 0` (Ganzzahldivision) – verhindert dunkle Säume an durchsichtigen
Rändern. Gerechnet in den gespeicherten (sRGB-kodierten) Werten, keine Linearisierung in v1 (fest dokumentiert; eine Verbesserung wäre eine
neue Formatversion).

**Format „Teigling“ v1** (Little Endian; interne Endung `.teigling`, nie Teil eines Projekts):

```
 0  8  Magie "TEIGLING"
 8  2  Version = 1
10  1  Pixelformat: 0 = RGBA8 unkomprimiert (v1) · später z. B. 1 = BC7, 2 = ASTC 4×4, 3 = ETC2 (§5.7) · 255 = Fehler
11  1  Stufen n (1 … 12)
12  2  Breite      14  2  Höhe
16  4  Flags: Bit 0 = hat Durchsichtiges (irgendwo Alpha < 255), Bit 1 = Quelle war JPEG
20 32  SHA-256 der Quelldatei
52  …  n × (u32 Länge, Bytes der Stufe, Zeilen von oben)
```
Fehler-Teigling: Pixelformat 255, Stufen 0, Breite/Höhe im Kopf 0, ab Byte 52 `u16` Fehlercode (1 kein lesbares Bild, 2 zu groß),
`u16 0`, `u32 Breite`, `u32 Höhe` (für den Text „zu groß (2400 × 800)“ – PNG-/JPEG-Größen passen nicht immer in `u16`). Länge eines
Fehler-Teiglings: 64 Bytes; er zählt nicht zur Teigmenge.

**Grenzen:** Quelldatei ≤ 2 MiB, ≤ 2048 × 2048 Pixel (vor dem Dekodieren aus `IHDR`/`SOF` geprüft; Ausgabepuffer hart begrenzt → keine
Dekompressionsbombe). Größe eines Teiglings ≈ Breite × Höhe × 4 × 4/3 (2048² ≈ 21,3 MiB, 1024² ≈ 5,3 MiB, 256² ≈ 0,34 MiB). **Teigmenge**
je Projekt (Summe aller Teiglinge) ≤ 32 MiB – begrenzt EXE-Größe, Wasm-Speicher und VRAM; Überschreitung beim Vorbacken/Kompilieren →
`PizzaFehler P0020: Die Bilder sind zusammen zu groß für den Ofen (41,2 MB vorgebacken, höchstens 32 MB).` (Interpreter und Compiler
prüfen gleich, vor dem Start.) **Genau:** Teigmenge = Summe der Längen aller Teiglinge **verschiedener Quell-Hashes** (gleiche Bilder unter
zwei Pfaden zählen und liegen einmal, §5.6), Grenze 33 554 432 Bytes; Text: Bytes / 1 048 576, auf eine Nachkommastelle **aufgerundet**,
Dezimalkomma (so steht nie „32,0 MB … höchstens 32 MB“). Weil P0020 alle Größen kennen muss, sind vor dem Start **alle** Bilder des
Projekts vorgebacken (aus dem Cache oder neu) – in jedem Motor.

### 5.4 Wann wird vorgebacken, wo liegt das Ergebnis (Caching)

| Anlass | Was passiert |
|---|---|
| **Playground: Bild hinzufügen, erstes Laden eines Projekts** | sofort vorbacken (Worker, `teigling.wasm`), Fehler am Dateibaum, Vorschau aus Stufe 0; Ergebnis im IndexedDB-Speicher `teiglinge` (Schlüssel = SHA-256 der Quelle + `teigling/1`), LRU bis 128 MiB |
| **Ausführen** (Playground, App-Link, CLI) | der Lauf bekommt `optionen.teiglinge: { pfad → bytes }` aus dem Cache; der Lader **prüft jeden** (Magie, Version, SHA-256 im Kopf = SHA-256 der Quelldatei über `vorbacker.sha256`) und backt fehlende oder unpassende selbst vor (`optionen.vorbacker`, Node: `site/js/herd/teigling.wasm`) – ein veralteter Cache kann das Ergebnis also nie ändern. Fehlt der Vorbacker bei einem Projekt mit Bildern → `{ typ: "fehler", code: "HOST", art: "intern", text: "PizzaFehler HOST: Der Vorbacker fehlt (teigling.wasm).", datei: null, zeile: null, spalte: null }`, Exit 2 (wie „Herd-Kern fehlt“) |
| **EXE-Export / Kompilieren** | alle Bilder vorbacken (Cache), Teiglinge statt Quellbilder ins pkarton (§5.6) |
| **Teilen** | vor dem Hochladen vorbacken = Prüfung (ungültige oder zu große Bilder werden nicht geteilt). Hochgeladen werden in v1 nur die **Quellbilder** (PNG/JPEG sind viel kleiner als unkomprimierte Teiglinge → kleinerer Download); Empfänger bedienen sich aus ihrem Cache (Schlüssel = Quell-Hash) oder backen einmal vor. Ab GPU-Kompression (§5.7) legt der Dienst die Teiglinge zusätzlich als Blobs ab (Manifest-Feld `teigling`, Dedup), dann entfällt das Vorbacken beim Empfänger |
| **Node-CLI / Harnische** | Vorbacken im Prozess (Speicher-Cache je Lauf); kein Plattencache in v1 |

Der Cache-Schlüssel enthält die Formatversion: ein neuer Vorbacker erzeugt neue Schlüssel, alte Einträge verfallen über die LRU.

### 5.5 Herd-Kern und Glut

- Neue Kern-Funktion `bildchen_teigling(ptr, len) → id | Fehlercode` (Kern-ABI, `herd/README.md` §3) neben `bildchen_rgba`; der Kern prüft
  nur den Kopf (Magie, Version, Größen, Längen) und übernimmt die Bytes – er dekodiert nichts. Fehler-Teigling → Fehlercode → Ananas-Text
  §5.2. Kern-Fehlercodes **61** (kein lesbares Bild) und **62** (zu groß); höchster belegter Code ist heute 60 (`herd/README.md` §3) –
  HERD-Stufen vergeben neue Codes danach, vor dem Schreiben erneut prüfen. Wie alle Importe des Moduls `herd` zeigt `ptr` in den
  **Kern**-Speicher: Die Laufzeit kopiert den Teigling aus ihrem passiven Datensegment (`memory.init`) in den eigenen Speicher und von
  dort mit `herd_schreibe` in den Kern (zwei Kopien je Bild, einmal je Pfad); im Interpreter schreibt die Anbindung direkt in den
  Kern-Speicher.
- Geladene Bilder sind **eigene Texturen** mit Mip-Kette (nicht im Bildchen-Atlas). **Bildpaket nur additiv** (HERD.md §12.1 Regel 3,
  `VERSION` bleibt 1, Pakete ohne geladene Bilder bleiben byte-gleich): neuer Ressourcen-Delta-Abschnitt **`TEXTUR = 5`** (die Deltas
  sind heute 1–4, HERD-Stufen belegen 14/15) mit `u32 id, u8 format, u8 stufen, u16 b, u16 h`, dann je Stufe `u32 länge` + Bytes –
  einmal je Bild, nicht je Verwendung. Verweis aus den Instanzen ohne Formatänderung: **2D** neue `flach_art` **`TEXTURBILD = 6`**
  (5 = `DREIECK` ist von H-K3b belegt) mit `seite` = Textur-ID, `u0 v0 u1 v1` = `0 0 b h`; **3D** in `INST3D.textur` Bit 17 = „eigene
  Textur“, Bits 0–15 = Textur-ID (Bit 16 = hat Textur wie heute). Die Glut lädt Texturen als `Rgba8Unorm` wie den Atlas.
- Abtastung: **Vergrößerung nächster Nachbar** (pixelscharf wie bisher), **Verkleinerung trilinear über die Mipmaps** (kein Moiré bei
  kleinen Sprites und Texturen in der Ferne); Text-Bildchen bleiben im Atlas ohne Mipmaps.
- `szene`/`paket`-Hashes (K-134) decken die Teigling-Bytes ab → bitgleich; Pixel wie bisher mit Toleranz (K-129).
- WebGL2-Rückfall: 2048² ist dort garantiert (`MAX_TEXTURE_SIZE ≥ 2048`).

### 5.6 Einbettung in pkarton/EXE (E12)

- Der Compiler legt **Teiglinge** (statt der Quellbilder, je Quell-Hash einmal) und alle übrigen Kiste-Dateien in ein **passives
  Datensegment** samt Tabelle (Pfad → Offset, Länge, Art; Pfade sortiert nach Bytefolge, damit `Kiste.liste` ohne Sortieren auskommt und
  das Modul für dieselbe Sammlung byte-gleich ist). `Bildchen.laden` reicht den Teigling über einen neuen generischen Importaufruf `bildchen_teigling` der Gruppe
  `herd` an den Kern; `Kiste.*` liest Textdateien. Quellbilder sind in der Kiste als Pfad sichtbar (`Kiste.gibts`/`liste`), ihre Bytes
  werden nicht zusätzlich eingebettet (`Kiste.text` auf ein Bild → „kein Text“, wie bei der Quelle).
- Der Host liest weiter nur ein `.pkarton`; EXE-Anhang `PKARTON1` und `PizzaExe.verbinde` bleiben unverändert.
- Grenzen für Kompilieren: Quelldateien wie §4.6, Teigmenge ≤ 32 MiB (P0020).
- Später (nicht v1): nur Bilder einbetten, die per Literal angesprochen werden – v1 bettet alle ein (dynamische Pfade wie
  `"bilder/bote-" + i + ".png"` müssen funktionieren).

### 5.7 Spätere Stufe: GPU-Kompression (ohne Änderung an Sprache und Projekten)

- Neue Pixelformate im Teigling (BC7 für Desktop, ASTC/ETC2 für Mobil) oder KTX2/Basis Universal als Hülle mit Umkodierung zur Laufzeit je
  GPU-Fähigkeit. Sprache, Projektdateien und `Bildchen.laden` bleiben gleich; es ändern sich nur Vorbacker-Version, Glut-Upload und
  Cache-Schlüssel.
- Bitgleichheit: Der Kompressor muss deterministisch sein (feste Parameter, ein Thread); zusätzlich legt der Teilen-Dienst die Teiglinge als
  Blobs ab, sodass Empfänger dieselben Bytes nutzen, statt neu zu komprimieren. `paket`-Hashes beziehen sich auf die Teigling-Bytes.
- Format- und Encoder-Wahl fällt in jener Stufe nach Messung (Ladezeit, VRAM, Downloadgröße, Qualität); die Teigmenge-Grenze wird dann
  auf die komprimierte Größe bezogen.

### 5.8 Playground (Ergänzung zu §3.1)

Hochladen per Dateibaum/Drag & Drop; Typ nach Endung **und** Signatur (PNG-/JPEG-Magie) geprüft; Vorschau aus Teigling-Stufe 0 über Canvas
bzw. `data:`-URL (CSP unverändert), Anzeige z. B. „1024 × 1024 · Quelle 312 KB · vorgebacken 5,3 MB · 11 Stufen“; die Teigmenge des
Projekts steht in der Projektleiste.

### 5.9 Folgen für K-136

K-136 begründete Text-Bildchen mit „Dateien hätten im Browser keinen Ort“. Mit Projekten haben sie einen. K-136 bleibt für Text-Bildchen
gültig; K-145 und K-147 ergänzen Bilddateien und das Teigling-Format und heben die Begründung auf (beide seit P0 in `KLAERUNGEN.md`). In HERD.md ist der Teil „größere
Bilder/Texturen“ der Roadmap bereits als „abgelöst durch PROJEKTE.md (PD1/PD3)“ vermerkt; die Stufe **H-K8 selbst (`Vorlage`) bleibt**
bestehen und ist nicht Teil dieses Konzepts.

---

## 6. Auswirkungen je Komponente

| Komponente | Änderung |
|---|---|
| `site/js/pizza/` (Interpreter, gebaut zu `site/js/pizza.js`; Lader als neuer Abschnitt `projekt.js`, `bestellt` in `parser.js`) | Projekt-Lader (`projekt.lade`, gemeinsam mit Compiler) mit P0014–P0019, P0020 (Grenzen) und W0004, `bestellt` (kontextuell) im Parser, Datei-Index `d` an AST-Knoten, Ladereihenfolge, `warnSet`-Schlüssel mit Datei, Feld `datei` an `fehler`/`warnung`, Ortstext der Ananas §2.6, `Kiste`, `Bildchen.laden` (Teigling aus `optionen.teiglinge`, geprüft/ergänzt über `optionen.vorbacker`, dann `kern.wasm`), P0020 (Teigmenge), Herd-Erkennung um `Bildchen.…` |
| `site/js/pizzaiolo.js`, `site/js/pizzaiolo/*` (Compiler) | `kompiliere`/`run` rufen `projekt.lade`; Ports von `analysiere`/Startprüfung mit Datei-Index; Positionstabelle mit Datei; Dateinamen-Tabelle; ABI v2 (`datei_ptr/len`); Datensegment + Tabelle für Kiste und Standard-Argumente; `Kiste`-Aufrufe in der Laufzeit; Küchenbericht (`koch.js`); `faehigkeiten.abi = 2`, `laufOptionen` + `teiglinge`/`vorbacker` |
| `laufzeit/` (Rust no_std) | Fehler-/Warnungsimporte mit Datei; Kiste-Tabelle lesen; `Kiste.*`; `Bildchen.laden` → Import `bildchen_teigling` |
| `herd/teigling` (neu, Rust no_std) | Vorbacker: PNG- und JPEG-Decoder, Mipmaps, Teigling-Format; `site/js/herd/teigling.wasm` + kleine JS-Hülle; Tests nativ = Wasm, goldene Teiglinge (SHA-256) für alle Decoder-Fälle; `teigling.wasm` wird wie `kern.wasm` eingecheckt und im Docker-Bau nicht neu erzeugt |
| `herd/kern` | Kern-Export `bildchen_teigling` (nur Kopfprüfung), Fehlercodes 61/62 (kein Bild, zu groß), Bildpaket-Abschnitt `TEXTUR = 5`, `flach_art::TEXTURBILD = 6`, `INST3D.textur` Bit 17 (§5.5); `kern.wasm` + `schema.json` mit `node herd/baue.js` neu erzeugen; `herd/test-kern.js` mit Teigling-Szene |
| `herd/glut`, `herd/glut-web` | eigene Texturen mit Mip-Kette, Abtastung (vergrößern nächster Nachbar, verkleinern trilinear), Referenzbilder neu |
| `host/` (Rust) | ABI v2 (`warnung`/`fehler` in `laufen.rs`, Küchenbericht in `kueche.rs`, `tests/abi.rs`), Ortsausgabe §2.6, Importgruppe `herd` + `bildchen_teigling`, sonst unverändert (`karton.rs` unverändert; kein Decoder nativ nötig) |
| `site/js/pizzaiolo/host-js.js`, `site/js/exe.js`, Test-Hosts | ABI v2 (auch `tests/wasm/klon-host.js`, `tests/wasm/herd.js`, `tests/herd/bild.js`, `tests/herd/zeige.js`); `exe.js` unverändert bis auf Dateinamen aus `name` |
| `bin/pizza.js` | Ordner/`pizza.json`/Datei, Projektwurzel-Suche (§1.5), Textnormalisierung §1.3, Ausgabe §2.6 (`meldungText`-Regex), `--ast` mit Ladeliste |
| `site/js/worker.js` | `start`/`kompiliere` mit Projekt, Teiglingen und Vorbacker (§3.6) |
| `ui/src/*` | neu: `projekte.js` (IndexedDB, Migration), `dateibaum.js`, `zip.js`, `bildvorschau.js`; Umbau: `tabs.js` (Dateien statt Skripte), `main.js` (Projektmenü, Ausführen = Projekt, Fehler-Sprung, Teilen-Abschnitt), `teilen.js` (Manifest/Blobs/Schlüssel), `app.js` (Manifest laden), `beispiele.js` (Ordner), `doku.js` („Im Playground öffnen“ → Projekt), `vorrat.js` (Präfix nach `projekt.quelle`, §3.2), `argumente.js` (Startwert aus `pizza.json`), `sprache.js`/`editor.js` (Vervollständigung, Diagnose je Datei); bestehende Tests `ui/test/teilen.mjs`, `ui/test/vorrat.mjs`, `ui/test/argumente.mjs` umstellen |
| `site/js/doku/*` | neues Kapitel „Projekte und Dateien“ (bestellt, Sichtbarkeit, Kiste, Bilder); Doku-Codeblöcke mit Feld `dateien: { pfad: text }` (+ optional `hauptdatei`) für Mehrdatei-Beispiele, „Im Playground öffnen“ legt ein Projekt an |
| nginx, Dockerfile, envsh, Template, compose | §4.8; Dockerfile: `site/beispiele/**` Ordner werden wie bisher kopiert; Test-Stufe ruft die umgestellten Harnische |
| Harnische (`tests/run-tests.js`, `pruefstand`, `tests/differenz`, `tests/wasm`, `tests/herd`, `tests/theke`, E2E) | Ordner-Fälle §6.1, Manifest-Format §7.2 |
| Doku-Dateien | SPEC §2 (Projekte, `bestellt`, Ladereihenfolge, Sichtbarkeit), §11 (`Kiste`), §14.7 (P0014–P0020, W0004), §14.8 (W0032-Programm-Scope über alle Dateien), §18.1/§18.5 (`Bildchen.laden`), ARCHITEKTUR §1–§3, §6, HOST-ABI v2 (§1 Custom Section, §2, §7, §9, Anhang A), WASM §4, `herd/README.md` (Kern-ABI §3, Bildpaket §4 – in PD1), README (Betrieb), CHANGELOG; HERD.md nur §12.1 Regel 3 (reservierte Nummern, P0) |
| Repo-Pflege | `.gitattributes` (Binärdateien, §1.3), `.github/dependabot.yml` (`/durchreiche` statt `/hastebin`) |

### 6.1 Testformate (ARCHITEKTUR §6, erweitert)

- **Ordner-Fall:** `tests/faelle/<name>/` = Projekt (§1.1) mit `pruefung/` (`erwartet`, `exitcode`, `warnungen`, `fehler`, `optionen.json`,
  `eingabe`, `ereignisse`, `ui-erwartet`, `herd-erwartet`, `vorrat.json`, `vorrat-erwartet`, `orte`). Bestehende Ein-Datei-Fälle (`<name>.pizza` + Begleitdateien)
  **bleiben** – keine Massenumstellung der Testfälle.
- `.warnungen`/`.fehler` vergleichen weiter Texte; neu optional `pruefung/orte` (JSON-Lines `{ "code", "datei", "zeile", "spalte" }`), um
  Dateiorte zu prüfen.
- **Differenzkorpus:** `tests/differenz/korpus/<name>/` als Projekt; Kopfzeilen (`// exit:` …) in der Hauptdatei.
- **Prüfstand:** `F(gruppe, name, code, erwartung)` – `code` darf ein Projekt-Objekt `{ dateien, hauptdatei }` sein; neue Datei
  `a19-projekte.js` (Ladereihenfolge, Zyklen, Konflikte, Sichtbarkeit, Nebendatei-Regel, Fehlerorte, gleiches Programm 1 vs. n Dateien,
  Kiste, Bildchen.laden mit Test-PNGs, Grenzen).
- Neue Pflichtfälle: Mehrdatei (3 Motoren), Zyklus (auch „Nebendatei bestellt die Hauptdatei“), fehlende Datei, ungültige `pizza.json`,
  Konflikt (auch verschachtelte Klasse, Überladung über Dateien), Geheimrezept, Unbestellt, Nicht-Treffer der Sichtbarkeitsprüfung
  (Parameter, Lambda, `fall WERT`, `<T>`, Mitgliedsname, benanntes Argument gleich einem fremden obersten Namen → **kein** Fehler),
  Reihenfolge der Ladeprüfungen (§2.2 Nr. 6), W0004, gleiche Warnung an gleicher Zeile/Spalte in zwei Dateien (beide gemeldet),
  CRLF-Textdatei (`Kiste.text` liefert `\n`), Grenzen (101 Dateien → P0020), Fehler in Nebendatei (Text + Ort),
  PNG-Varianten (Palette+tRNS, Grau 1 bit, 16 bit, RGBA, interlaced → Fehler, beschädigte CRC → Fehler, zu groß → Fehler), JPEG-Varianten
  (Baseline/progressiv, 4:4:4/4:2:2/4:2:0, Grau, CMYK → Fehler, abgeschnitten → Fehler), Mipmaps mit Durchsichtigem und ungeraden Größen,
  Teigmenge (P0020); jeweils als goldene SHA-256 des Teiglings, identisch nativ und Wasm.

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
`datei`, `erwartet`, `eingabe`, `ereignisse`, `herdErwartet`, `uiErwartet`, `exitCode` entfallen (liegen in `pruefung/`); `tier`,
`schlagworte`, `herd`, `theke`, `echtzeit`, `interaktiv` bleiben. `dateien` ohne `pruefung/`. Das Werkzeug `scripts/beispiele.js` ist
**neu** (PB3): `--pruefe` (Teil von `npm test`) vergleicht Manifest und Platte, `--schreibe` aktualisiert die Dateilisten, `--umziehen`
siehe §7.3.

### 7.3 Schritte

1. **Werkzeug** `scripts/beispiele.js --umziehen`: jede `x.pizza` + Begleitdateien → `x/hauptgang.pizza`, `x/pizza.json` (Name = Titel),
   `x/pruefung/*`; Manifeste umschreiben. Ein-Datei-Projekte, rein mechanisch, Ausgaben unverändert (Harnische vorher/nachher gleich).
2. Harnische, Galerie, Doku-Verweise, E2E (`05-beispiele`, `09-theke`, `14-herd-playground`, `11-app-link`) auf Ordner umstellen.
3. **Aufteilen** (inhaltlich; `pruefung/erwartet`/`herd-erwartet` bleiben **gleich**, außer wo Bilddateien bewusst Text-Bildchen ersetzen).
   Muster aus der Prüfung: Teigball/Teigfänger bauen ihre Szene heute mit **Anweisungen auf oberster Ebene** (`für`-Schleifen,
   `herd.koerper(…)`) und der obersten Variable `herd`. Nebendateien dürfen keine Anweisungen und sehen die Hauptdatei nicht – also
   `Herd herd = neu Herd(…)` (und was alle brauchen) nach `welt/herd.pizza`, Szenenteile als Funktionen (`leer baueTisch() { … }`), die
   die Hauptdatei in der bisherigen Reihenfolge aufruft. Nur so bleiben Ressourcen-IDs, Teil-IDs und damit `herd-erwartet` gleich.
   - `herd/teigball` (286 Zeilen): `hauptgang.pizza` (Spielzustand, Schleife) · `welt/tisch.pizza` (Himmel, Tisch, Öfen, Laternen als
     Funktionen) · `welt/belaege.pizza` (Basilikum-Form, Beläge) · `hud.pizza`; **Tischdecke als PNG** (`bilder/tischdecke.png`) –
     neues `herd-erwartet` (bewusst; mit Mipmaps ohne Moiré in der Ferne).
   - `herd/teigfaenger` (258): `hauptgang.pizza`, `figuren.pizza`, `hud.pizza`; Sprites als PNG (Bote, Teig) → Vorzeigebeispiel 2D.
   - `herd/steuerung`: Animation aus `bilder/bote-1.png … -4.png` (zeigt `Animation` mit Bilddateien).
   - Neues kleines Beispiel `grundlagen/rezeptbuch` (3 Dateien: Klassen in `rezepte/`, Konstanten, Geheimrezept) und `grundlagen/kiste`
     (Level aus `daten/level.txt`).
   - Übrige Beispiele (≤ 180 Zeilen) bleiben Ein-Datei-Projekte.
4. **Pizza-Imperium – erst nach „Idle frei“** (anderer Lead arbeitet an Paket 5/6). Bis dahin bleibt `site/beispiele/idle/pizza-imperium.*`
   als Einzeldatei unverändert lauffähig (Übergang: das Umzugswerkzeug überspringt es, Manifest-Eintrag im alten Format wird von Galerie und
   Harnischen weiter gelesen – die Lesefunktion akzeptiert `datei` **oder** `ordner` bis Schritt 4 erledigt ist, danach wird `datei`
   entfernt). Vorgeschlagene Aufteilung (4223 Zeilen, Stand afac084; am 2026-10-23 schon **4808** Zeilen / 287 KiB mit Wettbewerb,
   Album, Banca – die Zeilenangaben unten sind daher nur noch grob; endgültig nach Paket 5/6 neu zählen):

   | Datei | Inhalt (heute Zeilen) |
   |---|---|
   | `hauptgang.pizza` | Kopf, Konstante `ANTEIL_MAX`, Start/`hauptgang` (1–93 + Start) |
   | `modell/upgrades.pizza` | `Upgrade`, `Geheimrezept`, `Feinkost`, `Rezept`, `Meisterbrief` |
   | `modell/ziele.pizza` | `Herausforderung`, `Erfolg`, `Kampagne`, `Projekt` |
   | `modell/betrieb.pizza` | `Bereich`, `Posten`, `Helfer`, `Gast`, `Katze` (die drei `modell/`-Dateien zusammen: Zeilen 94–497) |
   | `spiel.pizza` | `Spiel` (498–2047; ggf. später weiter in `spiel/*.pizza` nach Themen) |
   | `minispiele.pizza` | `Minispiel`, `Spielecke` (2048–2595) |
   | `theke/kopf.pizza`, `theke/betrieb.pizza`, `theke/rezepte.pizza`, `theke/imperium.pizza`, `theke/nonna.pizza`, `theke/spiele.pizza`, `theke/erfolge.pizza` | Panels (2596–4223) |

   **Wichtig (Prüfbefund):** Die Theke-Panels lesen heute oberste Variablen der Datei (`spiel`, `ecke`, `kammer`, die Zettel `z…`,
   Breiten-Konstanten, `MENGEN`, Hilfsfunktionen wie `panel()`/`zeile()`). Weil niemand die Hauptdatei bestellen kann (§2.1), müssen
   diese in eine Nebendatei **`zustand.pizza`** (Spielobjekt, Zettel, Konstanten, Hilfsfunktionen), die alle `theke/*.pizza` bestellen.
   Die Anweisungen (`falls (kammer.hat(…)) spiel.ladeAus(…)`, `neu Theke`, Panel-Aufbau, `theke.zeige…`) bleiben in `hauptgang.pizza`.
   Dadurch laufen die Variablen-Initialisierungen der Nebendateien **vor** dem Laden des Spielstands (heute stehen Zettel und Panels
   teils danach) – vor dem Umbau prüfen, dass kein Initialisierer vom geladenen Zustand abhängt (sonst die betroffene Variable in der
   Hauptdatei initialisieren).
   Bedingung: `pruefung/erwartet`, `ereignisse`, `ui-erwartet` byte-gleich; Schritte gleich (§2.2). Hinweis: Klassenname `Geheimrezept`
   kollidiert nicht mit dem Modifikator `geheimrezept` (Groß/klein signifikant). Klasse `Projekt` bleibt erlaubt (kein reserviertes Wort).

---

## 8. Sicherheit und Datenschutz (Teilen-Dienst und Dateien)

- **Nur intern erreichbar:** kein Port, keine Domain; nur nginx spricht mit dem Dienst. Kein CORS (alles same-origin). CSP/Header unverändert.
- **Was gespeichert wird:** Dateiinhalte, Manifeste, Erstellungs-/Änderungsdatum (Tagesgenauigkeit), Hash des Schlüssels. **Nicht**:
  IP-Adressen, User-Agent, Zugriffszeiten. IPs leben nur im Arbeitsspeicher des Rate-Limiters und der Byte-Zähler (gleitende Fenster,
  ≤ 60 min, §4.5).
- **Kein Logging von Inhalten**, IDs oder Schlüsseln: Dienst loggt nur Start, Aufräumzahlen, Fehlerarten; nginx `access_log off` und
  `error_log … crit` für `/api/` (§4.8).
  Ein Test fängt die Log-Ausgabe ab und prüft, dass weder Inhalt noch ID darin vorkommt.
- **IDs als Zugriffsrecht:** ≥ 71 bit Zufall → nicht aufzählbar; es gibt **keine** Liste aller Links. Alte Versionen sind für jeden mit dem
  Link abrufbar (im Dialog gesagt); Löschen entfernt alle Versionen.
- **Schlüssel:** 256 bit, nur einmal übertragen, serverseitig gehasht, Zeitkonstant-Vergleich, nur im `Authorization`-Kopf (nie in URLs).
  Im Browser in IndexedDB am Projekt.
- **Eingaben:** Größen vor dem Lesen begrenzt (Stream-Zähler), JSON-Tiefe/Länge begrenzt, Pfade nach §1.3 (kein `..`, keine absoluten
  Pfade, keine Steuerzeichen), Hash jedes Blobs geprüft, Dateien im Volume heißen nur nach Hash/ID (nie nach Nutzerpfaden).
- **Ausgabe:** Blobs immer `application/octet-stream` + `nosniff` + `attachment` → nie als HTML/SVG im Origin interpretiert (kein SVG in v1).
  Die UI liest Blobs nur per `fetch`.
- **Verfügbarkeit:** Rate-Limits doppelt (nginx + Dienst), Byte-Grenzen je IP und für lose Blobs, Speicherdeckel, Versionsgrenze,
  Timeouts (nginx), atomares Schreiben.
- **Fremde Seiten:** keine Cookies, kein CORS; Schreiben mit Schlüssel nur per `Authorization`-Kopf, Bodies nur mit JSON-/Binär-Typ
  (`415` sonst, §4.3) → kein CSRF.
- **Container:** `USER node`, `read_only`, `no-new-privileges`, keine Abhängigkeiten (`npm ci` entfällt), gepinntes Basis-Image.
- **Datei-Inhalte im Client:** Bilder dekodiert nur der Vorbacker (Rust, im Browser in der Wasm-Sandbox, Grenzen vor dem Entpacken), ZIP-Import mit Pfadprüfung und Entpack-Grenze,
  Bildvorschau via `data:`/Canvas.
- **Bekannte Restrisiken (akzeptiert):** Wer einen Inhalt kennt, kann über den Blob-Hash prüfen, ob er irgendwo geteilt wurde (Hashes sind
  nicht aufzählbar, nur bestätigbar) – vertretbar, da keine Zuordnung zu Links/Personen. Missbrauch zum Ablegen fremder Dateien wird durch
  Typprüfung (nur §1.3-Endungen; PNG-/JPEG-Magie), Größen- und Ablaufgrenzen eingedämmt.
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

## 10. Entscheidungen des Nutzers

Alle Fragen der ersten Fassung sind entschieden; das Konzept setzt sie überall so um. Die Nummern bleiben zur Nachverfolgung erhalten.

| # | Frage | Entscheidung | umgesetzt in |
|---|---|---|---|
| F1 | Wort für die Modul-Anweisung | **`bestellt "…";`** (kontextuell; Benennung freigegeben: „Naming ist mir egal“) | E4, §2.1 |
| F2 | Projektdatei und Standard-Hauptdatei | **`pizza.json`**, **`hauptgang.pizza`** (Benennung freigegeben) | E1, §1.2 |
| F3 | Sichtbarkeit | **streng:** sichtbar ist nur, was eine Datei direkt bestellt (sonst P0019) | E6, E7, §2.5 |
| F4 | Snack-Anweisungen | **nur in der Hauptdatei**; Nebendateien: Deklarationen, Top-Level-Variablen, `bestellt` | E8, §2.3 |
| F5 | Pfadzeichen | **nur ASCII-Kleinbuchstaben, Ziffern, `-`, `_`, `.`** (Benennung freigegeben) | E3, §1.3 |
| F6 | Alte Hastebin-Links | **verfallen** mit klarer Meldung; keine Übernahme | §4.4 |
| F7 | Aufbewahrung | **90 Tage ab letzter Version**, per `TEILEN_ABLAUF_TAGE` änderbar (0 = unbegrenzt) | E22, §4.5 |
| F8 | Grenzen | **100 Dateien, 2 MB je Datei, 8 MB je Projekt** (Quelldateien); Bilder **PNG oder JPEG ≤ 2048 × 2048**; **Teigmenge ≤ 32 MB** je Projekt (vorgebackene Bilder, unkomprimiert mit Mipmaps ≈ 5,3 MB je 1024²-Bild); mit GPU-Kompression (§5.7) gilt die Teigmenge für die komprimierte Größe | §4.6, §5.3 |
| F9 | Alte Versionen | **für alle mit dem Link abrufbar** (`@n`); gelöscht wird nur der ganze Link | §4.4, §8 |
| F10 | Bearbeitungsschlüssel | **zwischen Geräten übertragbar** (kopieren/einfügen), ohne Konten | §4.4 |
| F11 | Projekte im Playground | **ein aktives Projekt je Fenster**, Tabs = Dateien | E16, §3.1 |
| F12 | Bestehende Playground-Tabs | **jeder Tab wird ein eigenes Ein-Datei-Projekt** | §3.2 |
| F13 | Technik des Teilen-Dienstes | **Node ohne Abhängigkeiten** | E18, §4.1 |
| F14 | Pizza-Imperium | **Aufteilung wie §7.3**, erst nach „Idle frei“, Feinschnitt nach Paket 5/6 | §7.3 |
| F15 | Bilder/Texturen | **PNG und JPEG nur als Eingabe;** ein eigener Rust-Decoder backt sie beim Packen (Playground-Erstladen, EXE-Export, Teilen) einmalig zu **Teiglingen** vor (GPU-taugliches RGBA8 + vorberechnete Mipmaps, per Hash gecacht); GPU-Kompression später ohne Änderung an Sprache oder Projekten; API `Bildchen.laden("bilder/x.png")`; Herd-Beispiele bekommen echte Texturen/Sprites | E13, §5, §7.3 |

---

## 11. Paketplan (spätere Umsetzung)

| Paket | Inhalt | Dateien (Schwerpunkt) | hängt ab von | parallel zu | Stand |
|---|---|---|---|---|---|
| **P0 Vertrag** | SPEC §2/§11/§14.7/§14.8/§18.5, K-138 … K-147, ARCHITEKTUR §1–§3/§6, HOST-ABI v2 (inkl. §7, Anhang A), WASM §4, HERD.md §12.1 Regel 3, Prüfstand-Fälle als `*-offen` (`herd/README.md` schreibt PD1) | Doku-Dateien, `pruefstand/faelle/a19-projekte-offen.js` | unabhängige Prüfung dieses Konzepts (erledigt, §13) | – | **umgesetzt** (Commit „PROJEKTE P0: …“, 2026-10-23; Präzisierungen unten) |
| **PA1 Lader + Interpreter + CLI** | `projekt.*` (inkl. Ladeprüfungen P0014–P0020 Grenzen, W0004, Textnormalisierung), `bestellt`, Ladereihenfolge, `datei`-Feld, `warnSet`, Ananas-Ortstext, CLI Ordner, Ordner-Fälle in `tests/run-tests.js`, `a19` Lader-Fälle grün (nach `a19-projekte.js` verschieben; Kiste/Bild-Fälle bleiben bis PD2 in `a19-projekte-offen.js`, ARCHITEKTUR §6) | `site/js/pizza.js`, `bin/pizza.js`, `tests/faelle/*/`, `tests/run-tests.js`, `pruefstand/faelle/a19-*` | P0 | PC1, PD1 | **umgesetzt** (Commit „PROJEKTE PA1: …“; Präzisierungen unten) |
| **PC1 Durchreiche** | Dienst, Unit-Tests (in `npm test`), Dockerfile, compose/nginx/proxy-conf/envsh/Template, dependabot, README-Betrieb, Entfernen hastebin/redis | `durchreiche/**`, `compose*.yaml`, `nginx*.conf*`, `Dockerfile`, `docker-entrypoint-pizza.envsh`, `.github/dependabot.yml`, `README.md`, `hastebin/` (löschen) | P0 (§1.3, §4) | PA1, PD1 | **umgesetzt** (Commit „PROJEKTE PC1: …“, 2026-10-23, mit PB2 auf PB1/PA2 rebased; Präzisierungen unten) |
| **PD1 Vorbacker** | Crate `herd/teigling`: PNG, JPEG (islow-IDCT, Festkomma-Farbe), Mipmaps, Teigling-Format, Grenzen, `sha256`; `teigling.wasm` + JS-Hülle; goldene Teiglinge, Tests nativ = Wasm; Kern-Export `bildchen_teigling` + Abschnitt `TEXTUR` + `TEXTURBILD`/Bit 17; `.gitattributes` | `herd/teigling/**`, `herd/Cargo.toml`, `herd/baue.js`, `herd/kern/**`, `herd/README.md`, `site/js/herd/teigling.wasm`, `site/js/herd/kern.wasm`, `site/js/herd/schema.json`, `.gitattributes` | P0 | PA1, PC1 | **umgesetzt** (Commit „PROJEKTE PD1: …“, 2026-10-23; Rechenwege und Festlegungen `herd/README.md` §11, K-147; Glut-Darstellung bleibt PD3) |
| **PD3 Glut-Texturen** | eigene Texturen mit Mip-Kette, Abtastung, Referenzbild (neues `tests/herd/bilder/<name>.herd` + `.png`, bestehende unverändert), Messung (Ladezeit, VRAM) | `herd/glut/**`, `herd/glut-web/**`, `site/js/herd/glut*.{js,wasm}`, `tests/herd/bilder/` | PD1 | PB2, PB3 | **umgesetzt** (Commit „PROJEKTE PD3: …“, 2026-10-24; Präzisierungen unten) |
| **PA2 Wasm + Host** | Compiler auf Lader (Ports mit Datei-Index), ABI v2 in **allen** Hosts (§2.8), Küchenbericht, Kiste-Datensegment, Standard-Argumente, `Kiste`/`Bildchen.laden` in der Laufzeit, Host (JS + Rust, `-j 2`), Teiglinge ins Datensegment, Differenzkorpus-Ordner | `site/js/pizzaiolo.js`, `site/js/pizzaiolo/**`, `laufzeit/**`, `host/**`, `tests/differenz/**`, `tests/wasm/**`, `tests/herd/bild.js`, `tests/herd/zeige.js` | PA1, PD1 | PB1, PD2 | **umgesetzt** (Commit „PROJEKTE PA2: …“; Präzisierungen unten) |
| **PB1 Playground-Projekte** | IndexedDB (inkl. Teigling-Cache, Rückfall ohne IndexedDB), Migration, Dateibaum, Tabs je Datei, Hauptdatei, Fehler-Sprung, ZIP, Vorbacken beim Hinzufügen + Bildvorschau, Worker-Protokoll (`start`/`kompiliere`), Vorrat-Präfix | `ui/src/**` (ohne `teilen.js`/`app.js`), `ui/test/**`, `site/js/worker.js`, `site/index.html`, `site/css/**`, E2E `03-tabs`, `10-argumente-vorrat` | PA1 (API), PD1 (JS-Hülle) | PA2, PD2 | **umgesetzt** (Commit „PROJEKTE PB1: …“, 2026-10-24) auf Lader (PA1), Vorbacker (PD1) und Kiste/Bildchen.laden (PD2); Wasm-Projekte folgen mit PA2; Präzisierungen unten |
| **PD2 Kiste/Bildchen.laden im Interpreter** | `Kiste`, `Bildchen.laden` (`optionen.teiglinge` + Prüfung über `optionen.vorbacker`), P0020 Teigmenge, Herd-Erkennung, Prüfstand | `site/js/pizza/` (`std/`, `herd/`), `pruefstand/faelle/a19-*` | PA1, PD1 | PA2, PB1 | **umgesetzt** (Commit „PROJEKTE PD2: …“, 2026-10-23; Präzisierungen unten) |
| **PB2 Teilen-UI + App-Link + EXE** | `teilen.js` (Manifest/Blobs/Schlüssel/Dialog), `app.js`, `#h=`/`#app=` mit `@n`, EXE aus Projekt, E2E Teilen (neu 18, umgestellt 06, 11) | `ui/src/teilen.js`, `ui/src/app.js`, `ui/src/main.js` (Teilen-Abschnitt), `ui/test/teilen.mjs`, `e2e/tests/06-*.mjs`, `e2e/tests/11-*.mjs`, `e2e/tests/18-*.mjs`, `e2e/server.mjs` | PB1, PC1, PA2 | PB3 | **umgesetzt** (Commit „PROJEKTE PB2: …“, 2026-10-24) mit PC1 im selben Stand, auf PA2 (EXE aus Mehrdatei-Projekten über `Pizzaiolo.projekte`); Präzisierungen unten |
| **PB3 Beispiele umziehen** | Werkzeug (neu), Manifeste, Galerie, Harnische, Doku-Kapitel + `dateien`-Codeblöcke (nur Textdateien; Bilder nur in Beispielen), E2E 05/09/14 | `scripts/beispiele.js`, `site/beispiele/**` (ohne Imperium), `site/js/doku/**`, `ui/src/beispiele.js`, `ui/src/doku.js`, Harnische (`tests/run-tests.js` Gruppen beispiele/doku, `tests/herd/erwartet.js`, `tests/differenz`-Beispielquelle) | PA1, PB1 | PB2 | offen |
| **PB4 Herd mit Bildern** | Teigball/Teigfänger/Steuerung aufteilen (Muster §7.3 Schritt 3) + PNG/JPEG-Texturen, `rezeptbuch`, `kiste`, `.herd-erwartet` neu (bewusst; nach HERD.md §12.1 Regel 2 sonst eine Regression – im Commit und in K-145 als gewollt vermerken) | `site/beispiele/herd/**`, `site/beispiele/grundlagen/**` | PB3, PD2, PD3, PA2 | – | offen |
| **PB5 Imperium** | Aufteilen nach §7.3 (mit `zustand.pizza`), Übergangsleser entfernen | `site/beispiele/idle/**`, Lesefunktion der Manifeste | **„Idle frei“**, PB3 | – | offen |
| **PZ Abnahme** | `npm test` (inkl. `node --test durchreiche/test`, `scripts/beispiele.js --pruefe`), `node pruefstand/run.js`, `npm run test:wasm`, `npm run test:differenz`, `cargo test -j 2` (host **und** herd, inkl. `herd/teigling`), `node herd/baue.js --pruefe`, `node herd/test-kern.js`, `node tests/herd/erwartet.js` (Prüfmodus), `node host/test.js` (`PIZZA_KEIN_DIALOG=1`), `npm --prefix ui test`, E2E komplett (headless, eine Chrome-Instanz), `docker compose -f compose.yaml -f compose.lokal.yaml build` (gedrosselt) + Rauchtest `/api/konfig`, CHANGELOG | – | alle | – | offen |

**Präzisierungen aus P0** (im Vertrag festgelegt, wo das Konzept offen war – spätere Pakete richten sich danach):
- `bestellt` auf eine Nicht-`.pizza`-Datei → `PizzaFehler P0015: "<pfad>" ist keine .pizza-Datei – bestellen kann man nur Rezepte.`;
  ungültige Pfade in der Sammlung selbst und eine fehlende Hauptdatei sind ebenfalls P0015 (SPEC §2.1).
- `pizza.json`-Gründe fest (`kein gültiges JSON`, `kein Objekt`, `"pizza" fehlt`, `"<feld>" muss ein Text sein` …), Ort `datei:
  "pizza.json"` ohne Zeile; Fehler der Sammlung ohne Ort (Grenzen, Pfade, Hauptdatei, Teigmenge) mit `datei/zeile/spalte = null`.
- P0020-Gründe: `101 Dateien, höchstens 100` · `<pfad> hat 2,5 MB, höchstens 2 MB` · `<pfad> hat 601 KB, höchstens 512 KB` ·
  `zusammen 8,4 MB, höchstens 8 MB` (KB/MB aufgerundet, Dezimalkomma wie bei der Teigmenge).
- Die `\r\n`-Normalisierung macht **auch der Lader** (`projekt.lade`, idempotent) – so liefern API, Worker und CLI dieselben Bytes,
  egal wer die Sammlung gebaut hat.
- Ladeprüfungs-Stufe 1 = `pizza.json` + Pfade der Sammlung + Hauptdatei (SPEC §2.5); „Quelltextreihenfolge“ der Startprüfungen und
  Reihenfolge der Warnungen = Dateien in Ladereihenfolge, darin nach Position.
- `projekt.lade` liefert zusätzlich `args` und `kiste` (ARCHITEKTUR §1). `Kiste.liste("ordner/")` (Schluss-`/`) → leeres Blech;
  `TypAnanas`-Parametername `'pfad'` bzw. `'ordner'`.
- `Bildchen.laden` steht nur in SPEC §18.5 (nicht §18.1), damit der Rebase mit den Herd-Stufen klein bleibt; HOST-ABI v2 ist als
  Vertrag markiert („umgesetzt ist noch v1“), v2-Ladefehler-Text für andere Versionen in HOST-ABI §4; CLI-Ort mit Datei ohne Zeile:
  `(<datei>)`.
- HERD.md bekommt (abweichend von der ersten Planung) nur die **Reservierung** der Nummern aus §5.5 in §12.1 Regel 3 und einen Verweis
  bei H-K8 – sonst könnten H-K-Stufen sie vor PD1 vergeben.
- Prüfstand: Projekt-Fälle bauen ihre PNG-Dateien im Fall-Skript (zlib + CRC, keine Binärdateien im Repo); die Differenztests
  überspringen Projekt-Fälle, bis PA2 Projekte kompiliert.

**Präzisierungen aus PA1** (umgesetzt; PA2, PD2, PB1 richten sich danach):
- Datei-Index am Knoten heißt **`di`** (nicht `d`: `Inc.d` = ±1 und `Block.d` = „hat Deklarationen“ gab es schon). `parse(q, { datei })`
  setzt `di` an jedes Objekt mit Position; `projekt.lade` liefert am Programm zusätzlich `ast.dateiPfade` (null = Ein-Datei-Programm)
  und `ast.ladeRang` (`di` → Position in der Ladeliste; danach sortieren `analysiere` und W0666). Laufzeitorte: `this.d` neben
  `this.z/this.s`, `AnanasWurf`/`PizzaFehlerSig` tragen `d`; Doppelmeldungs-Sperre `warnSchluessel(code, di, zeile, spalte)`.
- **`art`:** was schon `parse()` meldet (Syntax, ungültiger Pfad im `bestellt`), ist `"syntax"` (SPEC §2.5) – sonst widerspräche
  `parse()` dem Lauf (Selbstprüfung der Differenztests).
- **`datei` bei Ladefehlern** (SPEC §2.6): Text-Programm nie; in Sammlungen Fehler an einem `bestellt` immer, sonst sobald die Sammlung
  mehr als eine `.pizza`-Datei hat (Syntaxfehler im Ein-Datei-Projekt bleibt ohne Datei).
- **Hauptdatei:** ausdrücklich übergebenes `projekt.hauptdatei` > `pizza.json` > `hauptgang.pizza` > einzige `.pizza` – nötig für den
  CLI-Aufruf mit einer Datei in einem Projekt (§1.5). Hüllen, die nur weiterreichen (PB1/PB2), lassen das Begleitfeld weg.
- **Sichtbarkeitsprüfung** (§2.5): Generik-Namen sammelt der Parser in `generikaUeberspringen`; übersprungen werden außerdem
  `paket`/`import`-Zeilen, das Wort `bestellt` vor einem Text und in Annotations-Argumenten auch `name = wert`. Name einer Datei, die
  nur die Hauptdatei kennt, in einer Nebendatei → P0019 mit dem (unerfüllbaren) Vorschlag `bestellt "hauptgang.pizza";` – Text wie Vertrag.
- **Nebendateien** dürfen auch ein einzelnes `;` enthalten (leere Anweisung, keine Wirkung). P0016-Position = Name der späteren
  Deklaration (Klassen/Rezepturen/quattrostagioni haben dafür jetzt `nz/ns`); P0017 für `hauptgang` an seinem Namen.
- **Text-Programme** (`run(string)`) laufen durch denselben Lader – also auch Grenzen (P0020 ab 512 KiB) und `\r\n` → `\n`.
- **CLI:** Ordner bzw. `pizza.json` → alle Dateien außer `pruefung/` (versteckte Einträge `.…` still übergangen; fremde Endungen und
  Nicht-`.pizza`-Dateien mit ungültigem Pfad wie `README.md` mit `Hinweis: … wird ignoriert` auf stderr; höchstens 8 Ebenen); Datei → Wurzel mit `pizza.json` aufwärts (≤ 8 Ebenen) oder – ohne – Datei + per `bestellt` erreichte Dateien;
  eine Datei **ohne** `bestellt` läuft weiter als Text (Ausgabe unverändert). `--ast` gibt bei Projekten `{ ladeliste, dateien, ast }` aus.
- **Wasm bis PA2:** `Pizzaiolo.kompiliere/run` lehnen Projekte (Objekt-Quelle) und `bestellt` mit `nichtUnterstuetzt` ab (Grund nennt
  PA2) – `run` fällt auf den Interpreter zurück; der JS-Host liefert `datei: null`; `tests/differenz/motoren.js` und `host/test.js`
  ergänzen beim nativen Host das fehlende `datei` als `null`. PA2 entfernt diese Brücken.
- **Prüfstand:** `a19-projekte.js` (57 Fälle, grün), `a19-projekte-offen.js` (19 Kiste-/Bild-Fälle für PD2 – mit PD2 verschoben), Hilfen in
  `pruefstand/lib/projekt-helfer.js`. Befund: Der Fall „Ladereihenfolge = Tiefensuche“ benutzte `xc` aus `c.pizza`, das die
  Hauptdatei nur transitiv bestellt (nach §2.5 P0019) – er bestellt `c.pizza` jetzt selbst (Ladeliste unverändert).
- **Ordner-Fälle:** `tests/faelle/<name>/` mit `pruefung/` (alle Begleitdateien ohne Punkt-Präfix, dazu `orte`); `tests/run-tests.js`
  prüft bei allen Fällen zusätzlich, dass `datei` direkt vor `zeile` steht.

**Präzisierungen aus PD2** (umgesetzt im Interpreter; PA2 bildet dasselbe in Laufzeit und Host nach):
- **Bild = Endung** `.png`/`.jpg`/`.jpeg` (wie „Text“ nach Endung). Vor dem Start (nach den Startprüfungen und dem Herd-Kern, vor
  `@Kühlschrank`-Ausdrücken) werden **alle** Bilder der Kiste vorgebacken – auch in Programmen ohne Herd, weil P0020 alle Größen
  braucht; Projekte ohne Bilder laden den Vorbacker nie. Reihenfolge der HOST-Fehler: Herd-Kern fehlt → Vorbacker fehlt → P0020.
  Ein Bild, das als Text übergeben wird, gilt als seine UTF-8-Bytes.
- **Cache-Prüfung:** je Pfad wird die SHA-256 der Quelle gerechnet (`vorbacker.sha256`); ein Teigling aus `optionen.teiglinge` gilt nur
  mit vollständig gültigem Kopf (Magie, Version, Format, Stufen, Längen – wie `PizzaVorbacker.kopf`) **und** passendem Hash, sonst
  wird neu vorgebacken. Je Quell-Hash wird höchstens einmal vorgebacken (gleiche Bytes unter zwei Pfaden = ein Teigling); die
  Teigmenge zählt jeden Hash einmal, Fehler-Teiglinge nicht.
- **`optionen.vorbacker`:** `WebAssembly.Module`, Bytes oder ein Objekt mit `vorbacken(bytes)`/`sha256(bytes)` (z. B.
  `PizzaVorbacker.node()`); ungültig oder nicht ladbar → „Der Vorbacker fehlt“. Der Interpreter hat dafür eine eigene kleine Hülle
  (`herd/kern.js`), weil `pizza.js` ohne Abhängigkeiten auch per `importScripts` lädt. Die CLI übergibt `teigling.js`’ `node()`, sobald
  das Projekt Bilder hat.
- **`Bildchen.laden`** (Reihenfolge wie §5.2): Text? → `this.herd === null` → `bildchen_teigling(ptr, 0)` liefert den Kern-Text von
  Code 3 („Erst braucht es einen Herd …“, kein eigener Text in der Anbindung) → Pfad schon geladen → **dasselbe** Objekt ohne
  Kern-Aufruf (Zuordnung Pfad → Bildchen je Lauf) → Pfad nicht in der Kiste → Teigling an den Kern; eine Datei ohne Bild-Endung
  schickt **0 Bytes** (Kern: ungültiger Kopf → Code 61 „kein lesbares Bild“). Bei Code 61/62 liest die Anbindung `fehler_code`
  vor `fehler_neu` und wirft `LaufzeitAnanas: <pfad> <fehler_text>`; andere Codes wie üblich. Ein fehlgeschlagenes Laden wird
  nicht gemerkt (nächster Aufruf versucht es erneut) und verbraucht keine ID. In der `brigade` wirft es die Herd-Küchen-Ananas
  vor der Typprüfung (wie alle Herd-Methoden).
- **`Kiste`:** Prüfung „liegt nicht in der Kiste“ vor „kein Text“; `Kiste.liste()` ohne Argument und `Kiste.liste("")` = alle;
  `Kiste.zeilen("")`-Inhalt `""` → `[]`. Eigene Klassen `Kiste` und `Bildchen` haben Vorrang vor den eingebauten Modulen (wie
  `Zettel`/`Herd`/`Form`). `PizzaLang.BUILTINS` enthält `Kiste`; `Bildchen` bleibt ein Typ (`TYPEN`).
- **Tests:** Prüfstand `a19-projekte.js` (+31 Fälle: die 19 aus `a19-projekte-offen.js`, dazu Bild ohne Bild-Endung, wiederholtes
  Fehlladen, eigene Klasse `Bildchen`, Kiste in der `brigade`, `zeilen`-Randfälle, TypAnanas `liste`/`gibts`, Text-Programm,
  `optionen.teiglinge` (Cache übernommen/veraltet/kaputt, Ergebnis gleich), Vorbacker fehlt, Vorbacker-Formen, Herd-Erkennung) –
  Kiste/Bild-Fälle mit Text-Quelle stehen als API-Fälle, damit die Differenztests sie bis PA2 nicht gegen Wasm laufen lassen;
  Ordner-Fälle `tests/faelle/projekt-kiste/` und `projekt-bilder/` (5 × 3-PNG mit Durchsichtigem und ein minimales 8 × 8-Baseline-JPEG,
  `herd-erwartet` mit dem `TEXTUR`-Paket); CLI-Fall mit Bildordner in `tests/run-tests.js`.
**Präzisierungen aus PB1** (Playground; spätere Pakete richten sich danach):
- **Module** (`ui/src/`): `projekt.js` (Pfade, Dateiarten, Textnormalisierung, `pizza.json`, Grenzen, Sammlung – **einzige** Stelle der
  Seite, die `PizzaLang.projekt.*` nutzt; lokale Regeln mit gleichem Wortlaut nur als Rückfall), `ablage.js` (IndexedDB `pizza` v1 bzw.
  Speicher-Rückfall, gleiche Schnittstelle), `migration.js`, `projekte.js` (ein aktives Projekt je Fenster, Speichern entprellt
  400 ms + `pagehide`, Papierkorb, `BroadcastChannel`), `tabs.js` (Tabs = offene Dateien), `dateibaum.js`, `projektmenue.js`
  (Menü, ZIP), `zip.js`, `bilder.js` (Signatur/Kopf, `data:`-URL, Vorbacker-Schnittstelle), `bildvorschau.js`, `exe-dialog.js`
  (aus `main.js` gelöst). Worker-Gegenstelle: `quelleFuer()` in `site/js/worker.js`.
- **Motor-Wahl im Worker (`quelleFuer`):** Der Worker gibt einem Motor das Projekt nur, wenn er es kann (Interpreter:
  `PizzaLang.projekt.lade` aus PA1 – vorhanden; Wasm: **`Pizzaiolo.projekte === true`** – setzt PA2); sonst den Text der Hauptdatei
  (Rückfall für einen Interpreter ohne Lader). Ein-Datei-Projekte (eine `.pizza` = Hauptdatei, daneben höchstens `pizza.json`) gehen
  immer als Text (§1.5). Mehrdatei-Projekte bis PA2: „Auto“ nimmt den Interpreter, „Wasm“ meldet einen Fehler, `kompiliere` (EXE,
  .pkarton) sagt ab. Der Lader bekommt `hauptdatei` aus dem Projekt-Datensatz mit (ausdrückliche Hauptdatei vor `pizza.json`).
- **Dateiname bei Migration und Ein-Datei-Projekten** (Abweichung vom Text in §3.2): Die Datei behält den zum gültigen Pfad gemachten
  Tab-/Beispielnamen (`willkommen.pizza`, `hallo-welt.pizza`, „Mein Code.pizza“ → `mein-code.pizza`) und ist per `hauptdatei` die
  Hauptdatei; Projektname = Name ohne `.pizza`. `hauptgang.pizza` bleibt der Standard für `pizza.json` ohne `hauptdatei` (SPEC §2.1).
- **Quellen:** Galerie `beispiel:<datei>`, Doku `doku:<abschnitt>:<n>`, Code-Link `teilen:<id>` (PB2 ergänzt `@<n>`); gleiche Quelle →
  in die unveränderte Kopie springen, sonst Wahl „Zu meiner Kopie“ / „Frische Kopie“ (auch für Doku-Blöcke und Code-Links).
- **Bedienung:** „+“ in der Tab-Leiste = neues Ein-Datei-Projekt (wie früher ein neuer Tab); neue Dateien/Ordner entstehen im
  Dateibaum. Tabs schließen ohne Rückfrage (die Datei bleibt im Projekt), die letzte offene Datei bleibt offen; Alt+Shift+T holt
  geschlossene Tabs des Projekts zurück. Doppelklick/F2 auf einen Tab = Datei umbenennen. Strg+O und Ablegen im Editor = Dateien
  hinzufügen (ZIP → neues Projekt). Der Dateibaum ist bei Ein-Datei-Projekten anfangs eingeklappt (Knopf links in der Tab-Leiste,
  Wahl in `localStorage` `pizza.baum`), auf schmalen Bildschirmen eine Schublade. Leere Ordner stehen im Projekt-Datensatz (`ordner`).
- **Teilen bis PB2:** wie bisher **ein** Text – die Hauptdatei; der Dialog weist bei Mehrdatei-Projekten darauf hin. (Seit PB2 wird das ganze Projekt geteilt.)
- **Vorbacker (PD1):** `bilder.js` prüft beim Hinzufügen zuerst den Kopf (Endung + Signatur + Größe, Texte wie SPEC §18.5), dann bäckt
  `site/js/herd/teigling.js` + `teigling.wasm` (beide erst beim ersten Bild geladen) vor – ein Fehler-Teigling ergibt dieselbe Meldung
  wie zur Laufzeit. Teiglinge liegen im IndexedDB-Speicher `teiglinge` unter `PizzaVorbacker.cacheSchluessel` (LRU 128 MiB; `besorge`
  ersetzt veraltete Einträge). Beim Lauf gehen `teiglinge` (aus dem Cache) und `vorbacker` (einmal je Seite kompiliertes Modul) an
  den Worker; der Interpreter prüft jeden Teigling (PD2). Die Bildvorschau zeigt „vorgebacken … · n Stufen“. ZIP-Importe backen
  beim ersten Lauf vor. EXE/.pkarton mit Bildern erst mit PA2.
- **Live-Diagnose P0014–P0019:** über `ladePruefung()` (Lader) im pizza-Linter, nur in Mehrdatei-Projekten und nur für Fehler der
  offenen Datei. Die Herd-Erkennung der Seite (`nutztHerd`) zählt `Bildchen.…` wie `Herd.…` (PD2), Vervollständigung kennt `Kiste`.
  Vervollständigung aus den obersten Namen aller Projektdateien und die Schnellkorrektur „bestellt … ergänzen“ (§3.1) sind **nicht**
  Teil von PB1 (offen).

**Präzisierungen aus PA2** (umgesetzt; PB1, PB2 und PZ richten sich danach):
- **Keine Ports mehr:** Der Compiler nimmt Warnungen (`intern.analysiere`, jetzt mit `d`) und Startprüfung (neu `intern.startpruefung`
  → `{ fehler, herdNoetig }`, Q0004 … P0013 und die Herd-Erkennung K-128 inkl. `Bildchen.…`) direkt aus dem Interpreter; `frontend.js`
  registriert nur noch für das IR. Ladefehler liefert `kompiliere` als `{ ok: false, fehler }` (wie Syntaxfehler), `run` fällt dann auf
  den Interpreter zurück, der denselben Fehler meldet. `nichtUnterstuetzt`-Einträge tragen `datei`.
- **Positionstabelle:** je Eintrag `i32 zeile, spalte, datei` (12 Bytes, `laufzeit/src/start.rs` `POS_BREITE`); Dateinamen per
  `rt_dateien` nur bei Mehrdatei-Programmen. `datei` an Fehlern nur mit bekannter Zeile, an Warnungen immer (wie der Interpreter).
- **Kiste im Modul:** Tabelle (Pfad, Art 0 Text/1 Bild/2 sonst, Offset, Länge) in den Programmdaten, Inhalte im passiven Datensegment
  (Laufzeit liest per erzeugter Kopierfunktion mit `memory.init` über ihren Tabellenindex, nie `data.drop`; `DataCount`-Abschnitt auch im
  zweiteiligen Schnellpfad). Eingebettet nur, wenn das Programm den Namen `Kiste` oder `Bildchen` enthält; gleiche Inhalte (Teiglinge je
  Quell-Hash) einmal; gleiche Sammlung → byte-gleiches `.pkarton`. `Bildchen.laden` kopiert den Teigling in 64-KiB-Stücken in den Kern.
- **Reihenfolge wie PD2:** Vorbacker fehlt → `kompiliere` meldet den HOST-Fehler (Rückfall Interpreter); P0020 (Teigmenge) meldet die
  Laufzeit nach der Herd-Kern-Prüfung (`rt_spaetfehler`), nicht als Startfehler.
- **Standard-Argumente:** `rt_standard_args`; `hauptgang` bekommt sie, wenn der Host 0 Argumente übergibt (EXE ohne Argumente = Browser).
- **Hosts:** JS-Host prüft `abi_version` (falls exportiert) und lehnt ≠ 2 ab; nativer Host zusätzlich an der Signatur von `pizza.warnung`
  (v1-Modul → derselbe Grund statt Linker-Fehler); `Ereignis::Warnung/Fehler` mit `datei` (JSON direkt vor `zeile`, CLI-Ort nach §2.6);
  `bildchen_teigling` gebunden. Die PA1-Brücken (`datei: null` in den Hosts, Normalisierung in `motoren.js`/`host/test.js`) sind entfernt.
- **Differenztests:** Fälle dürfen Projekte sein (Prüfstand-`code`-Objekte, Ordner-Fälle `tests/faelle/<name>/`, neu
  `tests/differenz/korpus/<name>/` mit `pruefung/exitcode|fehler|optionen.json|eingabe`); `*-offen.js` wird nicht verglichen (die
  Referenz kann sie noch nicht). Neue Korpus-Projekte: Mehrdatei (W0004, W0003, W0032 je Datei, Ananas in Nebendatei), Küche (Warnungen
  aus Stücken mit Datei, gleiche Zeile/Spalte in zwei Dateien), Startfehler in Nebendatei (R0001), Standard-/Host-Argumente,
  Schrittlimit, Ladefehler. `tests/wasm/projekte.js`: ABI v2, Custom Section, Kiste, `Bildchen.laden`, Teigmenge, Cache – gegen SPEC
  und bitgleich zum Interpreter.
- **Für PB1/PB2/PB3/PB4:** `Pizzaiolo.projekte === true` (Worker darf Projekte an den Wasm-Motor geben); `Pizzaiolo.kompiliere(projekt,
  { teiglinge, vorbacker })` für den EXE-Export (im Worker lädt `pizzaiolo.js` `herd/teigling.js` bei Bedarf per `importScripts`);
  Custom Section `projekt.name` = Name aus `pizza.json` (Dateiname der EXE). Ein EXE/`.pkarton` mit `Kiste` enthält die Quelltexte lesbar.

**Präzisierungen aus PD3** (umgesetzt in der Glut, nativ und Web; Kern und Bildpaket unverändert, alle Hashes gleich):
- **Ablage:** fünf Größenklassen (128 … 2048, kleinste Zweierpotenz ≥ max(b, h)), je ein `Rgba8Unorm`-Textur-Array mit voller
  Mip-Kette; ein Bild = eine Schicht, die Stufen des Teiglings unverändert in die Mip-Ebenen (keine Neuberechnung auf der GPU).
  Dadurch bleibt 2D **ein** Draw-Call (und 3D einer je Zug), auch mit vielen Bildern, und es braucht keine Bindless-Texturen
  (WebGL2). Die Glut schreibt nur ihre Kopie der Instanzen um (Textur-ID → Klasse/Schicht); das Paket bleibt, wie es ist.
- **Vormultipliziert hochladen**, im Shader zurückrechnen: bilineare/trilineare Mischung an durchsichtigen Rändern ohne dunkle
  Säume (die Teigling-Stufen selbst bleiben „nicht vormultipliziert“, K-147).
- **Abtastung:** Stufe λ aus den Bildschirmableitungen der Texel-Koordinaten (isotrop, am Anfang des Fragment-Shaders), danach nur
  explizite Stufen – gleich in WebGPU, WebGL2 und nativ. λ ≤ 1/16 → nächster Nachbar aus Stufe 0 (pixelscharf wie der Atlas; die
  kleine Schwelle fängt Rechenrauschen bei 1 : 1), sonst trilinear aus zwei bilinearen Stufen, **je auf das Rechteck `u0 v0 u1 v1`
  geklemmt** (Rahmen-Neuntel sprechen nicht über; λ höchstens log2 der Rechteckkante). Schatten-Ausschnitt (Alpha < ½) aus Stufe 0.
  Kein anisotropes Filtern (bräuchte lineare Vergrößerung) – schräge Flächen werden in der Ferne eher weich als flimmernd.
- **Grenzen/Fehler:** unbekanntes Pixelformat in TEXTUR → `Fehler::Paket` (spätere GPU-Formate §5.7 brauchen einen Glut-Zweig);
  mehr als `max_texture_array_layers` Bilder einer Klasse (WebGL2: 256) → das Bild bleibt unbekannt (2D unsichtbar, 3D ohne Textur).
  Grafikspeicher: Zweierpotenz-Kanten genau die Teigling-Stufen, sonst bis knapp × 4 (nächste Klasse) – bei 32 MiB Teigmenge
  höchstens 128 MiB, Messung in `bench/herd/ERGEBNISSE.md` („Glut-Texturen“).
- **Testbilder ohne Byte-Listen:** Hilfsaufruf `teigling_muster m b h` der Szenen-Spieler (Rust über `herd_teigling::teigling_aus`,
  JS nachgebaut, über `teigling.herd` in `node herd/test-kern.js` bitgleich geprüft); Referenzbilder `2d-textur`, `2d-rahmen-textur`,
  `3d-textur` (bestehende PNGs byte-gleich; `herd-bild referenz --nur=…` schreibt nur die genannten). Browser-Pixeltest: E2E 13
  (WebGL2/SwiftShader); WebGPU hat headless ohne echte GPU keinen Software-Adapter und läuft nur über dieselben WGSL-Shader.

**Präzisierungen aus PC1** (Durchreiche umgesetzt; PB2 richtet sich danach):
- Dateien: `durchreiche/regeln.mjs` (Grenzen aus der Umgebung, Pfadregel-Kopie, IDs/Schlüssel, Manifest-Prüfung + Kanonik),
  `lager.mjs` (Volume, Sperre, Zähler, Müllabfuhr), `server.mjs` (HTTP; als Modul `starte({ konfig, jetzt, log, host, port })` → `{ port,
  lager, aufraeumen(), schliesse() }` – so kann `e2e/server.mjs` den echten Dienst im Prozess oder als Kindprozess
  `node durchreiche/server.mjs` mit `PORT=0`, `TEILEN_DATEN=<ordner>` starten; die Startzeile nennt den Port). Tests:
  `durchreiche/test/*.test.mjs`, in `npm test` als Gruppe `durchreiche` (`node tests/run-tests.js durchreiche`); gemeinsame
  Pfad-Fallliste `durchreiche/test/pfade.json` (der Test vergleicht mit `PizzaLang.projekt.pruefePfad` aus PA1 – seit dem Rebase auf PA1 ohne Überspringen).
- Manifest: `name` 1–80 Zeichen (leer → 422), Zeichen = Unicode-Codepunkte, ungepaarte Surrogate → 422; `args`-Einträge ohne
  Steuerzeichen-Prüfung (wie §1.2). Kein gültiges JSON → `422` (nicht 400). Datei ohne erlaubte Endung (§1.3) → 422.
- Ein gleiches Manifest (`unveraendert`) verlängert den Link **nicht** (`geaendert` bleibt).
- Eine globale Sperre für alle ändernden Schritte (Posten, Löschen, Blob-Abschluss, `fehlend`, Müllabfuhr) statt zusätzlicher
  Link-Sperren – vereinfacht, gleiche Garantie. Löschen entfernt lose gewordene Blobs mit `mtime` > 1 h sofort.
- „Lose Blobs je IP“ zählt nur hochgeladene, noch keinem Link zugeordnete Bytes der letzten Stunde; „neue Bytes in Links“ = bisher
  lose Blobs + neues Manifest beim Posten. Weitere Umgebungsvariablen: `TEILEN_MAX_*`, `TEILEN_LOSE_JE_IP_MB`,
  `TEILEN_LOSE_ANTEIL_PROZENT`, `TEILEN_NEU_JE_IP_MB`, `TEILEN_RATE_*` (README „Teilen (Betrieb)“).
- Rate-Grenzen im Dienst = nginx-Rate + Burst je Minute (13/80/80/360), damit nginx die erste Linie bleibt; nginx-Grenzen fest
  in `nginx.conf` (2 MiB Blob, 64 KiB sonst). Achtung PB2: Erstellen/Version/Löschen 10/min mit Burst 3 – mehr als vier
  schreibende Anfragen in wenigen Sekunden ergeben `429` (E2E über nginx entsprechend takten).
- F6 an der Kante: nginx beantwortet `GET /api/teilen/<10 Kleinbuchstaben>` mit `404 {"fehler":"Dieser Link stammt vom alten
  Teilen-Dienst und ist nicht mehr verfügbar.","alt":true}`; die UI kann den Text direkt zeigen (PB2 prüft das Format
  trotzdem selbst, §4.4). `@n` darf URL-kodiert (`%40`) ankommen.
- Übergang bis PB2: `ui/src/teilen.js`/`main.js`/`app.js` und `e2e/server.mjs` (Hastebin-Attrappe, alte `/api/konfig`-Form)
  sind unverändert; E2E läuft gegen die Attrappe weiter grün. Gegen den echten Dienst sendet die alte UI Rohtext → `415`
  (allgemeine Fehlermeldung), alte Links → „gibt es nicht (mehr)“, `aufbewahrungAb: "letzte-version"` zeigt sie wie
  „erstellung“. Deshalb PC1 erst zusammen mit PB2 deployen (gebündelter Push). – Erledigt: PC1 und PB2 liegen zusammen auf `master`.

**Präzisierungen aus PB2** (Teilen-UI, App-Link; spätere Pakete richten sich danach):
- **Client** `ui/src/teilen.js` ohne DOM (Node-Test `ui/test/teilen.mjs` gegen den echten Dienst im Prozess): Links lesen
  (`leseLinkWert`/`linkAusHash`, `%40` = `@`, 10 Kleinbuchstaben = alt), Manifest bauen (`baueManifest` aus
  `projekte.sammlung({ mitProjektdatei: true })`; Hash = SHA-256 der normalisierten UTF-8-Bytes bzw. der Bilddaten; WebCrypto, ohne
  sicheren Kontext ein JS-Rückfall), `teile` (fehlend → PUT nacheinander → POST, bei `409 {fehlend}` einmal nachladen), `ladeGeteilt`
  (Manifest + Blobs, höchstens 4 parallel, Hash und Größe je Blob geprüft, Texte UTF-8-streng), `holeLink`, `loescheLink`, Texte
  (`dauerText`, `umfangText`). **429:** ohne `Retry-After` (nginx) 1/2/4/8 s warten und wiederholen, mit `Retry-After` > 10 s (Dienst) sofort
  die Meldung zeigen. Grenzen aus `/api/konfig` und Bild-Köpfe (`pruefeBild`) vor dem ersten Byte.
- **Hauptdatei beim Teilen:** Leitet `ausDateien` aus der (vorhandenen) `pizza.json` eine andere Hauptdatei ab als das Projekt hat
  (keine `hauptdatei`, mehrere `.pizza`), bekommt nur die **geteilte** `pizza.json` die Hauptdatei des Projekts – sonst liefe beim
  Empfänger etwas anderes. `beschreibung` im Manifest ohne Steuerzeichen (Anzeige-Kopie, §4.2).
- **Erzeugte `pizza.json`:** Beim Öffnen eines Links (Code- und App-Link) fällt eine `pizza.json` weg, die genau
  `erzeugeProjektdatei({ name, hauptdatei })` entspricht – ein geteiltes Ein-Datei-Projekt kommt als Ein-Datei-Projekt an (Name und
  Hauptdatei trägt der Datensatz); jede andere `pizza.json` bleibt.
- **Projekt-Datensatz:** `teilen = { id, version, schluessel? }` (`projekte.setzeTeilen`, `normalisiereTeilen`); ein geöffneter
  Code-Link speichert `teilen` **ohne** Schlüssel und `quelle = "teilen:<id>@<n>"` mit der tatsächlich geladenen Version (auch bei
  `#h=<id>` ohne `@n`) – gleiche Quelle + unverändert → in die Kopie springen. Eigenes Teilen setzt `teilen` mit Schlüssel, `quelle`
  bleibt. 403 beim Teilen → Schlüssel vergessen (`teilen` ohne Schlüssel, „Schlüssel eingeben“ erneut); 404 bei „Neue Version“ →
  `teilen = null` + Hinweis „Der Link ist abgelaufen oder gelöscht.“
- **Schlüssel übertragen (F10):** „Bearbeitungsschlüssel kopieren“ kopiert nur den Schlüssel (43 Zeichen); „Schlüssel eingeben“
  gibt es für Projekte mit Link-ID ohne Schlüssel (also auf dem anderen Gerät nach dem Öffnen des Code-Links); ungeprüft
  gespeichert, die nächste neue Version zeigt 403. Ohne Schlüssel und ohne Link → nur „Link erstellen“.
- **Dialog:** Auswahl „Neue Version teilen (Link bleibt gleich)“ (Standard, „bisher vN“) / „Neuer Link“ nur mit Schlüssel; Text mit
  Projektname, „n Dateien, x KB“ (inkl. erzeugter `pizza.json`), Aufbewahrung „… nach der letzten Version gültig (bis TT.MM.JJJJ) –
  jede neue Version verlängert ihn“ (Datum = UTC heute + Tage wie im Dienst; `null` → „bis du ihn löschst“), „Ältere Versionen bleiben
  unter demselben Link abrufbar.“ Danach: App-Link (in der Zwischenablage), Code-Link, aufklappbar „Diese Version fest (vN)“ (App
  und Code `@n`) und „Bearbeitungsschlüssel und Löschen“. Gleiches Manifest → „unverändert – Version vN gilt weiter“.
- **Eigener Code-Link** (`#h=<id>` ohne `@n`, lokales Projekt mit dieser ID **und** Schlüssel): Projekt fokussieren; ist die neueste
  Server-Version größer als `teilen.version`, Seitenbanner „neuere Version (vN) – laden?“ → `projekte.ersetzeDateien` (alle Dateien
  ersetzt, `basis = inhalt`, Ereignis `wechsel` mit `ersetzt`), `teilen.version = n`. `#h=<id>@<n>` öffnet immer eine Kopie.
- **App-Link:** `js/thema.js` erkennt `#app=` mit `@`/`%40`; `app.js` lädt über `ladeGeteilt`, backt Bilder ohne Cache vor
  (`erstelleVorbacker({ ablage: null })`), startet mit einer frischen Sammlung je Lauf und den Standard-Argumenten aus `pizza.json`;
  Titel = Projektname; „Code ansehen“/„App bearbeiten“ behalten `@n`. Alte Hastebin-Links (F6) werden ohne Anfrage abgewiesen (Code-
  und App-Link), unbekannte/abgelaufene Links: „Diese App gibt es nicht (mehr) …“.
- **EXE:** der `kompiliere`-Auftrag bekommt `teiglinge`/`vorbacker` wie der Lauf (§3.6); mit PA2 (`Pizzaiolo.projekte === true`) backt
  der Worker Mehrdatei-Projekte samt Bildern (E2E 18: geteiltes Mehrdatei-Projekt mit PNG → EXE „Teigball…“), Ein-Datei-Projekte ergeben
  dieselbe EXE wie bisher. EXE-Dialog: „Dein Projekt …“, Hinweis „auch die `.pizza`-Dateien sind über `Kiste` lesbar“ (§13).
- **E2E:** `e2e/server.mjs` startet die Durchreiche im Prozess (`starte`, 127.0.0.1, Port 0, Daten unter `e2e/tmp/durchreiche-*`,
  beim Ende gelöscht) und reicht `/api/` wie nginx weiter (Content-Type/Authorization, `X-Real-IP`, Cache-Map, F6-Antwort). Schreib-
  und Byte-Grenzen je IP sind dort **aus** (alle Tests einer Datei teilen 127.0.0.1), Lese-Grenzen wie im Betrieb; 429 prüft
  `teilen.modus = "limit"` (mit `Retry-After: 60`), `"aus"` = ohne `TEILEN_URL`. Vorbelegen über `server.teilen.lege/version/hole`
  (betrifft auch E2E 12 und 14). Neu `18-teilen-versionen` (Versionen, `@n`, Schlüssel übertragen, falscher Schlüssel, eigenes
  Projekt + Banner, neuer Link, Löschen → 404, Mehrdatei mit PNG ohne erneuten Upload, 100 Dateien zweimal ohne 429, F6, EXE aus
  einem geteilten Mehrdatei-Projekt).
- **Offen (nicht PB2):** Teilen-Vorschau mit `beschreibung`, Schlüssel eines eigenen Links nachträglich (ohne neues Teilen) kopieren.

Wellen (höchstens 3 parallel, je eigener Worktree): **W1** PA1 · PC1 · PD1 → **W2** PD2 · PA2 · PB1 → **W3** PB2 · PB3 · PD3 → **W4** PB4 ·
(PB5 sobald frei) → PZ. Merge-Reihenfolge in W2: **PD2 → PA2 → PB1** – PA2 schreibt die Differenzfälle für `Kiste`/`Bildchen.laden`
nach dem Rebase auf PD2 (vorher gibt es im Interpreter nichts zu vergleichen). Jedes Paket endet mit grünen Tests seines Bereichs und
einem lokalen Commit; gepusht wird gebündelt.

**Abstimmung mit dem Herd-Stufenplan (HERD.md §12):** Beide Pläne ändern dieselben Engstellen. Regeln:
1. **PD1** zählt in seiner Zeit als die eine Bildpaket-Stufe (`herd/kern/src/paket.rs`) und **PD3** als die eine Glut-Stufe einer
   H-K-Welle (HERD.md §12.1 Regel 3/8) – nicht gleichzeitig mit H-K1, H-K3b, H-K5, H-K11b (Glut/`paket.rs`).
2. **PA1, PA2, PD2** berühren die §9-Ausnahmen der HERD-Planung (`site/js/pizza/`, `laufzeit/`, `site/js/pizzaiolo/`, `HOST-ABI.md`,
   `host/`) und laufen **nicht** parallel zu H-K0, H-K12, H-K13 oder H-K14; wer später merged, rebased und erzeugt Erzeugtes neu
   (`kern.wasm`/`schema.json` mit `node herd/baue.js`, `laufzeit.wasm` mit `npm run baue:laufzeit` – nie von Hand mergen).
3. **PB3** (Umzug aller Beispiele) läuft, wenn keine H-K-Stufe mit neuem Beispiel offen ist; danach legen H-K-Stufen Beispiele als
   Ordner an (HERD.md §12.1 Regel 7). Neue Kern-Fehlercodes und Bildpaket-Nummern (§5.5) vor dem Schreiben gegen `herd/README.md` prüfen.
4. Empfehlung: PROJEKTE W1 (PA1 · PC1 · PD1) **vor** H-K-W1 (H-K0 · H-K3a · H-K5) oder direkt danach – PD1 und H-K5 dürfen nicht in
   dieselbe Welle.

---

## 12. K-Einträge (seit P0 in `KLAERUNGEN.md`, Status offen)

Geprüft 2026-10-23: höchster Eintrag in `KLAERUNGEN.md` (Arbeitsbaum, `master` und alle Worktrees) ist **K-137**; K-138 … K-147
sind frei und bereits von HERD.md §12.5 als durch PROJEKTE.md belegt vermerkt (HERD.md nutzt K-148 … K-153). Die Nummern also **nicht**
verschieben; vor dem Schreiben trotzdem erneut prüfen.

| Nr. | Titel | Kern |
|---|---|---|
| K-138 | Projekte: Ordner, `pizza.json`, Hauptdatei, Pfadregeln, Textnormalisierung, Lader-Grenzen (P0020), Dateisammlung | E1–E3, E24, §1 |
| K-139 | `bestellt`: Syntax, erreichbare Dateien, Ladereihenfolge, Zyklen, Nebendateien, `hauptgang` nur in der Hauptdatei | E4, E8, E9, §2.1–§2.3 (P0014, P0015, P0017, W0004; Ladeprüfungen im gemeinsamen Lader, Reihenfolge §2.2) |
| K-140 | Ein Projekt-Namensraum, Sichtbarkeit, `geheimrezept` auf oberster Ebene, konservative Ladeprüfung im gemeinsamen Lader | E5–E7, §2.4–§2.5 (P0016, P0018, P0019; W0032-Programm-Scope über alle Dateien) |
| K-141 | Fehlerorte mit Datei (Ereignisform, Hüllen-Regel), Host-ABI v2 inkl. Küchenbericht, Standard-Argumente im Modul | E10, E11, §2.6, §2.8 |
| K-142 | Playground-Projekte: IndexedDB, ein Projekt je Fenster, Migration der Tabs, ZIP | E15–E17, §3 |
| K-143 | Teilen-Dienst Durchreiche: Blobs + Manifeste, Versionen, Schlüssel, Links `@n`, Ablauf ab letzter Version, Grenzen, Datenschutz | E18–E22, §4, §8 |
| K-144 | Beispiele als Ordner, Manifest mit Dateiliste, `pruefung/`, Testformate für Ordner-Fälle | E23, §6.1, §7 |
| K-145 | Bilddateien: `Bildchen.laden`, PNG/JPEG nur als Eingabe, Vorbacken beim Packen, Caching, Einbettung als Datensegment, Grenzen (ergänzt K-136) | E12, E13, §5.2, §5.4, §5.6 (P0020) |
| K-146 | `Kiste`: lesender Zugriff auf Projektdateien | E14, §5.2 |
| K-147 | Teigling-Format v1: Decoder-Rechenwege (PNG, JPEG islow/Festkomma, keine Farbverwaltung, EXIF ignoriert), alpha-gewichtete Ganzzahl-Mipmaps, Kopf, Abtastung in Glut; GPU-Kompression als spätere Formatversion | E13, §5.3, §5.5, §5.7 |

---

## 13. Prüfbefunde (unabhängige Prüfung 2026-10-23)

Geprüft gegen den Stand `d4e2ebd` (Code, SPEC, KLAERUNGEN, ARCHITEKTUR, HOST-ABI, WASM, HERD, Hosts, nginx/compose/Dockerfile, Harnische,
E2E). Alle Befunde sind oben eingearbeitet; keine Nutzerentscheidung aus §10 wurde geändert.

| Befund | Schwere | Änderung |
|---|---|---|
| Die Startprüfung `PizzaLang.intern.pruefe` wird vom Compiler **nicht** benutzt (`frontend.js` hat eigene Ports von Startprüfung und `analysiere`) – „gleiche Funktion in beiden Motoren“ stimmte so nicht | hoch | E7, §2.5, §2.7: Projektprüfungen und W0004 im gemeinsamen Lader `projekt.lade`, den der Compiler statt `PizzaLang.parse` ruft |
| Niemand kann die Hauptdatei bestellen (immer Kreis) → Nebendateien sehen keine Namen der Hauptdatei; Imperium-Panels (`spiel`, Zettel, Hilfsfunktionen) und Teigball (`herd`, Szene als Top-Level-Anweisungen) wären so nicht aufteilbar | hoch | §2.1 Regel ausdrücklich, §7.3 Muster (`zustand.pizza`, `welt/herd.pizza`, Szene als Funktionen), Hinweis auf geänderte Initialisierungsreihenfolge |
| Doppelmeldungs-Sperre `warnSet` (Schlüssel `code:zeile:spalte`) hätte Warnungen gleicher Position in zwei Dateien verschluckt | hoch (Bitgleichheit) | §2.2: Schlüssel mit Datei, in Interpreter, Compiler-Port und Laufzeit |
| Textdateien: `core.autocrlf=true` ohne `.gitattributes` → CRLF unter Windows, LF im Browser/Docker; `TextDecoder` entfernt BOM und ersetzt ungültige Bytes → `Kiste.text`, Hashes, Dedup wären nicht bitgleich | hoch (Bitgleichheit) | §1.3 Normalisierung an der Projektgrenze (UTF-8 fatal, BOM bleibt, `\r\n` → `\n`), `Kiste.text` „kein Text“ nach Endung, `.gitattributes` für Binärdateien |
| Veralteter Teigling-Cache konnte das Laufergebnis ändern (Schlüssel nur Pfad in `optionen.teiglinge`) | mittel | §5.4: Lader prüft Kopf-SHA-256 gegen Quelle (`vorbacker.sha256`), backt sonst neu; `optionen.vorbacker` wie `herdKern`; HOST-Fehler „Vorbacker fehlt“ |
| nginx reicht `Authorization` und `Content-Type` nicht weiter (`proxy_pass_request_headers off`) – Versionen/Löschen wären unmöglich | hoch | §4.8 `proxy_set_header Authorization/Content-Type` |
| `Cache-Control` des Dienstes wird von nginx versteckt, die Map setzt für `/api/` immer `no-store` → `immutable` wäre wirkungslos; `public` hätte gelöschte Links in geteilten Caches gehalten | mittel | §4.3: Map-Einträge für Blob/`@n` mit `private, …, immutable` |
| `limit_req_log_level warn` und Upstream-Fehler schreiben die Anfragezeile (= ID) ins Fehlerprotokoll | mittel (Datenschutz) | §4.8, §8: `error_log … crit` in `/api/` |
| Lose Blobs (PUT ohne Schlüssel, 600/min × 2 MiB, 24 h Aufbewahrung) konnten den Speicherdeckel in Minuten füllen | hoch (Verfügbarkeit) | §4.5 Byte-Grenzen je IP, Anteil loser Blobs, Müllabfuhr nach 1 h; §4.6 PUT-Rate gesenkt |
| Rennen Müllabfuhr ↔ Posten (Blob als vorhanden gemeldet, dann gelöscht) | mittel | §4.3 `fehlend` frischt `mtime` auf, §4.5 globale Sperre |
| Manifest: kanonische Form, Typprüfung (beim PUT unbekannt), doppelte Pfade, `name/hauptdatei` als zweite Quelle neben `pizza.json` | mittel | §4.2 Kanonik + Prüfliste, Begleitfelder nur Anzeige, §1.4 `pizza.json` wird beim Teilen/Export erzeugt |
| CSRF über fremde Formulare (Link-Erstellung ohne Schlüssel) | niedrig | §4.3 `415` ohne JSON-/Binärtyp, §8 |
| Base62-ID mit Modulo-Verzerrung, Schlüssel-Format ungeprüft | niedrig | §4.4 Verwerfungsverfahren, Format-Regex vor dem Hashen |
| Vorratskammer: Konzept nahm einen Präfix je Tab-Namen an – den gibt es nicht (K-088: nur `pizza.vorrat.` vs. `pizza.vorrat-beispiel.`) | mittel | §3.2 Regel an `projekt.quelle`, Quelle `doku:` ergänzt, Migration der Tab-Schlüssel |
| W0105 passte nicht zum Nummernkreis (W01xx = Laufzeitumgebung W0100–W0104, W00xx = statisch) | niedrig | → **W0004** (frei); P0014–P0020 sind frei (belegt: P0001–P0003, P0010–P0013) |
| K-Nummern: höchster Eintrag K-137 (Arbeitsbaum, master, Worktrees); HERD.md hat K-138 … K-147 schon als PROJEKTE-Nummern vermerkt und nutzt K-148 … K-153 | Info | §12: Nummern bleiben |
| Küchenbericht (`warnung`-Ereignis, Positionstabelle) und weitere ABI-Nutzer (`host/src/kueche.rs`, `host/tests/abi.rs`, `tests/wasm/klon-host.js`, …) fehlten; nativer Host muss auch die Ortsausgabe ändern | mittel | §2.8 vollständige Liste, Hüllen-Regel §2.6 (Pfad sobald `datei ≠ null`, Host muss die Hauptdatei nicht kennen) |
| Reihenfolge der Ladeprüfungen und ihr Verhältnis zu Warnungen/bestehenden Startprüfungen offen | mittel | §2.2 Nr. 6 |
| Sichtbarkeitsprüfung: Falsch-Positive bei `fall WERT`, Generik-Parametern, `für`/Fang/`roh`, Annotationsnamen; verschachtelte Klassen fehlten im Namensraum | mittel | §2.4, §2.5 |
| Bildpaket: Abschnitts-/Art-Nummern und Verweis aus den Instanzen offen; HERD belegt `flach_art` 5 und Abschnitte 14/15 | mittel | §5.5 `TEXTUR = 5`, `TEXTURBILD = 6`, `INST3D.textur` Bit 17, additiv nach HERD §12.1 Regel 3; Kern-Fehler 61/62 |
| Fehler-Teigling konnte Größen > 65 535 (PNG) für den „zu groß“-Text nicht tragen; P0020-Rechnung und Rundung offen | niedrig | §5.3 Layout mit `u32`, Teigmenge je Quell-Hash, Aufrunden |
| `Bildchen.laden` fehlte in der Herd-Erkennung vor dem Start (HOST-ABI §2, `herdNoetig`, `frontend.js`); doppeltes Laden, Prüfreihenfolge, `TypAnanas` offen | mittel | §5.2 |
| CLI ohne `pizza.json` hätte den ganzen Ordner der Datei (z. B. `tests/faelle/`, > 1000 Dateien) als Projekt gelesen | mittel | §1.5: ohne `pizza.json` nur Datei + bestellte Dateien |
| Projektgrenzen (100 Dateien, 8 MiB) galten nur beim Teilen – lokal Lauffähiges wäre nicht teilbar gewesen; ungültige `pizza.json` ohne Fehlercode | niedrig | §1.2, §1.3: P0015/P0020 im Lader |
| `args`: EXE ohne Argumente hätte die Standard-Argumente nicht gekannt (Browser ≠ nativ) | niedrig | §1.2, §2.8: im Modul eingebettet |
| Worker: `kompiliere` (EXE) und Wasm-Motor ohne Projekt/Teiglinge; Rückfall auf Interpreter | niedrig | §3.6 |
| ZIP-Import aus Windows/macOS (Datendeskriptor, `__MACOSX`, Großbuchstaben) | niedrig | §3.4 |
| Paketplan: PA2-Differenzfälle hängen an PD2 (gleiche Welle); PB2/PB3 hätten beide E2E 11 geändert; E2E 06 (Teilen) fehlte; `durchreiche`-Tests nicht in `npm test`; dependabot/README fehlten; Koordination mit HERD §12 (gleiche Dateien: `paket.rs`, Glut, Interpreter/Laufzeit/Host) fehlte | mittel | §11: Merge-Reihenfolge W2, Dateilisten, PZ-Befehle, Abschnitt „Abstimmung mit dem Herd-Stufenplan“ |
| Imperium ist auf 4808 Zeilen gewachsen (Stand afac084: 4223) | Info | §7.3 Hinweis, Feinschnitt bleibt nach Paket 5/6 |
| HERD.md H-K8 ist heute `Vorlage`; abgelöst ist nur „größere Bilder/Texturen“ | niedrig | §5.9; P0 ergänzt in HERD.md nur Verweis und Nummern-Reservierung (§11 Präzisierungen) |
| `.pizza`-Dateien liegen über die Kiste lesbar im EXE | Info | §5.2 Hinweis im EXE-Dialog/Doku (Folge der Entscheidung „Kiste enthält auch `.pizza`“) |
