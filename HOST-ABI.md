# pizzaiolo – Host-ABI v2 (verbindlich)

Diese Datei beschreibt, wie ein **Host** (JS: Browser/Node · Rust/wasmi: nativ/EXE) ein kompiliertes
pizza-Programm (`.pkarton`) ausführt. Ein Host braucht nur das hier – keine Kenntnis von IR oder Laufzeit-Interna.

> **Stand:** v2 ist der Vertrag (Projekte, K-141, PROJEKTE.md). **Umgesetzt ist noch v1** – Compiler, Laufzeit und Hosts liefern bzw.
> erwarten `abi_version() = 1` und `warnung`/`fehler` **ohne** `datei_ptr, datei_len`, bis Paket PA2 alle zusammen umstellt (§9).
> Alles andere in dieser Datei gilt für v1 und v2 gleich; die v2-Änderungen sind mit **v2** markiert.

## 1. Das `.pkarton`

- Ein `.pkarton` ist **genau ein gültiges WebAssembly-Modul** (Binärformat, Magie `\0asm`, Version 1).
  Der Compiler **linkt** das Programm und die Laufzeit (`laufzeit.wasm`, Rust `no_std`) zu einem einzigen
  Modul zusammen. Es gibt keinen Container, keine zweite Datei, kein Linken im Host.
- Erlaubte Wasm-Features: **MVP + bulk-memory + multi-value + mutable-globals + sign-ext + nontrapping-fptoint**.
  Kein GC, kein Exception Handling, kein `externref`, keine SIMD, keine Threads.
  (Läuft daher in Browsern, Node, wasmi, wasmtime und über `wasm2c`.)
- Custom Section `pizzaiolo` (UTF-8-JSON, nur informativ, Host darf sie ignorieren):
  `{ "format": "pkarton/1", "abi": 2, "compiler": "<version>", "laufzeit": "<hash>", "projekt": { "name": "<name>", "dateien": n } }`
  (**v2**: `abi` 2, `projekt` informativ – Name aus `pizza.json`, Zahl der Programmdateien).
- **v2 – Projekte im Modul** (SPEC §2, §11.2, §18.5): Alle erreichbaren `.pizza`-Dateien sind in **ein** Modul kompiliert. Ein **passives
  Datensegment** des Moduls trägt die Dateinamen-Tabelle (Datei-Index → Pfad, für `datei` in Ereignissen), die **Kiste** (Tabelle Pfad →
  Offset, Länge, Art, nach Bytefolge sortiert; Textdateien, Teiglinge statt Quellbilder, je Quell-Hash einmal) und die
  Standard-Argumente aus `pizza.json`. Das Segment gehört der Laufzeit (Format darf sich mit ihr ändern) – **der Host liest nichts
  davon** und braucht keinen Abschnitts-Leser; der EXE-Anhang `PKARTON1` bleibt unverändert.
- Dateiendung `.pkarton`; MIME `application/wasm`.

## 2. Imports (Modulname `pizza`)

Alle Texte sind **UTF-8**, übergeben als `(ptr: i32, len: i32)` in den exportierten `memory`.
Der Host muss die Bytes **während des Aufrufs** kopieren/dekodieren (Speicher kann später wachsen/sich ändern).
`zeile`/`spalte` sind ab 1; **0 bedeutet „unbekannt“** (→ `null` im Ereignis).
**v2:** `datei_ptr, datei_len` = Projektpfad der Datei, zu der `zeile`/`spalte` gehören (UTF-8); **`datei_len = 0` bedeutet `null`** –
so bei allen Programmen aus genau einer `.pizza`-Datei (SPEC §2.6). Der Host setzt `datei` **immer** ins Ereignis, direkt vor `zeile`.

| Import | Signatur | Ereignis (ARCHITEKTUR §1) |
|---|---|---|
| `ausgabe` | `(ptr i32, len i32) -> ()` | `{ typ: "ausgabe", text }` |
| `fehlerausgabe` | `(ptr i32, len i32) -> ()` | `{ typ: "fehlerausgabe", text }` |
| `warnung` | **v2:** `(code_ptr i32, code_len i32, text_ptr i32, text_len i32, datei_ptr i32, datei_len i32, zeile i32, spalte i32) -> ()` (v1 ohne `datei_*`) | `{ typ: "warnung", code, text, datei, zeile, spalte }` |
| `fehler` | **v2:** `(art i32, code_ptr i32, code_len i32, text_ptr i32, text_len i32, datei_ptr i32, datei_len i32, zeile i32, spalte i32) -> ()` (v1 ohne `datei_*`) | `{ typ: "fehler", code, art, text, datei, zeile, spalte }` |
| `panik` | `(ptr i32, len i32) -> ()` | `{ typ: "panik", text }` |
| `schreibe` | `(ptr i32, len i32) -> ()` | `{ typ: "ausgabe", text, umbruch: false }` (`Bote.schreibe`) |
| `leeren` | `() -> ()` | `{ typ: "leeren" }` (`Bote.leeren`) |
| `eingabe` | `(art i32, prompt_ptr i32, prompt_len i32, puffer_ptr i32, puffer_kap i32) -> i32` | siehe unten; Host emittiert danach `{ typ: "eingabe", text }` |
| `ui_senden` | `(ptr i32, len i32) -> ()` | Theke (THEKE.md §3): UTF-8-JSON an den Renderer; Ereignis `{ typ: "ui", nachricht }` |
| `ui_warte` | `(puffer_ptr i32, puffer_kap i32) -> i32` | Theke: nächstes Renderer-Ereignis (UTF-8-JSON), siehe unten |
| `echtzeit_ms` | `() -> f64` | Wanduhr: ms seit 1970-01-01 (ganze ms) für `Uhr.echt()` (K-087) |
| `vorrat_lesen` | `(name_ptr i32, name_len i32, puffer_ptr i32, puffer_kap i32) -> i32` | Vorratskammer: gespeicherten Inhalt lesen (K-081), siehe unten |
| `vorrat_schreiben` | `(name_ptr i32, name_len i32, json_ptr i32, json_len i32, ereignis_ptr i32, ereignis_len i32) -> i32` | Vorratskammer: Änderung melden + speichern; Ereignis `{ typ: "vorrat", name, schluessel, wert }` |

### Basis-Importe und optionale Importgruppen (abwärtskompatibel)

Ein `.pkarton` importiert **nur, was das Programm braucht**:
- **Basis (immer):** `ausgabe`, `schreibe`, `fehlerausgabe`, `leeren`, `warnung`, `fehler`, `panik`, `eingabe`.
- **Gruppe `theke`:** `ui_senden`, `ui_warte` – nur wenn das Programm die Theke benutzt (`neu Theke/Schild/…`).
- **Gruppe `vorrat`:** `vorrat_lesen`, `vorrat_schreiben` – nur wenn das Programm `neu Vorratskammer(…)` enthält.
- **Gruppe `echtzeit`:** `echtzeit_ms` – nur wenn das Programm `Uhr.echt` verwendet. JS-Host: `optionen.echtzeit`
  (fester Startwert in ms, gerundet, wächst nicht) bzw. `Date.now()`; nativ: Systemzeit. Liefert ganze Millisekunden.
- **Gruppe `herd` (SPEC §18, Paket H4):** Modul `herd` (Exporte von `kern.wasm`, siehe unten) und `herd_kern`, `herd_schreibe`,
  `herd_lies`, `herd_warte`, `herd_senden` – nur wenn das Programm Herd-Klassen benutzt (`neu Herd/Form/Bildchen/<Komponente>`,
  `Form.…`, `Herd.…`, `Bildchen.…` – Letzteres für `Bildchen.laden`, K-145). Siehe unten „Herd“.
- **Gruppe `kueche` (SPEC §17, K-100, K-104):** `kueche_auftrag`, `kueche_bericht` – nur wenn das Programm `brigade` aufruft
  (Methodenaufruf oder Methodenreferenz `….brigade`); dazu der Export `kueche_stueck` (§3). Siehe unten „Küchenbrigade“.
- Künftige Gruppen und neue Importe in bestehenden Gruppen werden genauso ergänzt (additiv; sie ändern `abi_version` nicht). Die
  Version steigt nur, wenn Bestehendes bricht – zuletzt **v2** durch `datei` an `warnung`/`fehler` (§9).

Die Custom Section `pizzaiolo` nennt die benötigten Gruppen: `"gruppen": ["theke", "vorrat"]`.
**Hosts prüfen vor dem Instanziieren** die Importliste des Moduls (JS: `WebAssembly.Module.imports`, wasmi:
`Module::imports()`). Fehlt einem Host eine Funktion, meldet er (K-043)
`{ typ: "fehler", code: "HOST", art: "intern", text: "PizzaFehler HOST: Dieses Programm braucht die Funktion 'pizza.<name>' (Gruppe <gruppe>), die dieser Host nicht kennt – bitte pizza-host aktualisieren.", zeile: null, spalte: null }`
und `ende` mit Exit-Code 2. Ein Host, der eine Gruppe kennt, aber nicht anbieten kann (z. B. kein Speicherort,
kein Fenster), stellt die Funktionen trotzdem bereit und antwortet wie unten beschrieben „nicht verfügbar“ –
das Programm läuft dann mit W0100 (Theke) bzw. W0101 (Vorrat) weiter. Ausnahme (K-096): Der native Host startet ein Programm
mit Gruppe `theke`, für das kein Fenster möglich ist (keine Anzeige, WebView fehlt), gar nicht erst, sondern meldet das und endet
mit Exit 2; W0100 bleibt dort dem JSON-/Testmodus (`--ereignisse-json`, `--ui-ereignisse`, `PIZZA_THEKE=0`) vorbehalten.

`art` bei `fehler`: `1` = `"pizzafehler"`, `2` = `"ananas"`, `3` = `"limit"` (`0` = `"syntax"`, kommt aus Wasm nie vor;
`"intern"` erzeugt nur der Host selbst, siehe §4).

Alle Texte sind bereits fertig formatiert (z. B. `Ungefangene Ananas – StreitAnanas: Pizza ist alle. (Zeile 12)`,
`W0003: Methode 'x' ist veraltet.`). Der Host fügt nichts hinzu und entfernt nichts.

**`panik`**: Der Host meldet das Ereignis. Er **darf** danach sofort abbrechen (JS: werfen, wasmi: Trap/`Err`
zurückgeben) – dann beendet er den Lauf selbst mit Exit-Code **39** (und `ende`). Kehrt `panik` normal zurück,
wickelt das Modul selbst ab und `start` liefert 39. Beides ist korrekt.

**`eingabe`** (EINGABE.md, SPEC §11.1, K-009/K-011/K-013/K-042):
- `art` 0 = `"zeile"`, 1 = `"zahl"` – lesen. `prompt_len = -1` bedeutet `prompt: null`. Der Prompt ist **nur
  informativ** (z. B. Platzhalter eines Eingabefelds): das Modul hat ihn vorher selbst per `schreibe` ausgegeben,
  der Host gibt ihn **nie** zusätzlich aus.
- Rückgabe: Byte-Länge der Zeile (ohne Zeilenumbruch, UTF-8), **`-1` = EOF**. Ist die Länge **größer als `puffer_kap`**,
  schreibt der Host nichts, **behält die Zeile** und gibt die benötigte Länge zurück; das Modul ruft sofort erneut mit
  ausreichend großem Puffer (gleiche `art`). Es wird nie gekürzt.
- Der Host emittiert `{ typ: "eingabe", text }` genau einmal pro gelieferter Zeile bzw. EOF (`text: null`) – beim
  Retry nicht doppelt.
- **EOF ist endgültig**: nach dem ersten EOF liefert jeder weitere Leseversuch sofort `-1` (mit Ereignis `text: null`),
  ohne den Nutzer erneut zu fragen. Ein `null`-Eintrag in `optionen.eingabe` bedeutet EOF ab dort.
- `art` 2 = **Abfrage `hatMehr()`** (liest nichts, kein Ereignis): `1`, wenn noch Eingabe möglich ist (interaktiv immer,
  solange kein EOF war; vorgegebene Zeilen: noch ein Nicht-`null`-Eintrag übrig), sonst `0`.
- JS-Host: `optionen.onEingabe({ prompt, art })` (Vorrang; `null`/`undefined`/Wurf = EOF) bzw. `optionen.eingabe: string[]`;
  fehlt beides → sofort EOF. Warten kostet keine Schritte. Nativer Host: liest von stdin.

**`ui_senden` / `ui_warte`** (THEKE.md): `ui_senden` übergibt eine Protokollnachricht (JSON) an den Renderer.
`ui_warte` blockiert bis zum nächsten Renderer-Ereignis und liefert dessen JSON-Länge; `-1` = kein Renderer bzw.
Fenster geschlossen; Länge `> puffer_kap` → nichts geschrieben, Ereignis bleibt, erneuter Aufruf mit größerem Puffer
(wie bei `eingabe`). **`puffer_kap = -1`** ist eine Abfrage ohne Warten: `1` = ein Renderer ist verfügbar (JS-Host:
`optionen.onUiWarte` oder `optionen.uiEreignisse` gesetzt), `0` = keiner (→ `bediene()` meldet W0100 und kehrt zurück).
Hosts ohne Theke implementieren `ui_senden` als No-Op (bzw. nur Ereignis) und `ui_warte` mit `-1` bzw. `0` für die Abfrage.
Warten kostet keine Schritte. Die Laufzeit importiert beide Funktionen; Hosts müssen sie bereitstellen.

**`vorrat_lesen` / `vorrat_schreiben`** (K-079–K-081, K-106):
- `name` ist die **Kennung** der Kammer (K-106): `name` ohne bzw. `namensraum/name` mit Namensraum (`pizza-imperium/spielstand`),
  beide Teile `[a-z0-9-]{1,40}`. Der Host **prüft die Kennung selbst** (höchstens ein `/`, Teile einzeln) und baut Pfade nur aus
  den geprüften Teilen (`<ordner>/<raum>/<name>.json`); ungültige Kennung → `vorrat_lesen` `-1`, `vorrat_schreiben` `-1`
  (kein Pfad-Traversal, auch bei manipuliertem Modul). JS-Host: Schlüssel von `optionen.vorrat`/`onVorrat` = Kennung.
- `vorrat_lesen(name, puffer, -1)` ist eine **Abfrage**: `1` = Speicherung verfügbar (JS-Host: `optionen.vorrat` oder
  `optionen.onVorrat` gesetzt; nativ: Speicherort beschreibbar), `0` = nicht verfügbar → das Modul warnt beim ersten
  `neu Vorratskammer` einmal `W0101` und arbeitet nur im Speicher.
- `vorrat_lesen(name, puffer, kap)`: liefert die gespeicherten **Einträge** der Kammer `name` als UTF-8-JSON-Array
  `[["schlüssel", wert], …]` (Format K-080; ein gespeichertes Objekt `{"v":1,"name":…,"eintraege":[…]}` gibt der Host als
  dessen `eintraege` weiter) und gibt die Länge zurück; `-1` = keine Kammer gespeichert; Länge `> kap` → nichts
  geschrieben, erneuter Aufruf mit größerem Puffer (wie K-013). Aufgerufen beim ersten `neu Vorratskammer(name)`.
  JS-Host: `JSON.stringify(optionen.vorrat[name])`.
- `vorrat_schreiben(name, json, ereignis)` wird nach **jeder** Änderung aufgerufen (`lege`, `entferne`, `leeren`):
  `json` = vollständige Serialisierung `{"v":1,"name":"x","eintraege":[…]}` (K-080), `ereignis` = `{"schluessel":…,"wert":…}`.
  Der Host emittiert zuerst `{ typ: "vorrat", name, schluessel, wert }` (Werte aus `ereignis`), speichert dann die Kammer
  (JS: `optionen.onVorrat(name, eintraege)`; nativ: Datei atomar schreiben, K-081) und gibt `0` zurück; `< 0` = Speichern
  fehlgeschlagen → `LaufzeitAnanas: Die Vorratskammer 'x' konnte nicht gespeichert werden.` Ohne Speicherung (Abfrage = 0)
  emittiert der Host nur das Ereignis und gibt `0` zurück. Größenprüfung (1 MiB) macht das Modul selbst.

**Küchenbrigade – Gruppe `kueche`** (SPEC §17, K-100, K-104; Umsetzung THREADS.md §4.3–§4.5, Berichts- und Kartonformat Anhang A):

| Import | Signatur | Bedeutung |
|---|---|---|
| `kueche_auftrag` | `(auftrag_ptr i32, n i32) -> i32` | Führt die Stücke i = 1 … n in **Klon-Instanzen** desselben Moduls aus (Schnappschuss = linearer Speicher der aufrufenden Instanz **jetzt**, kein geteilter Speicher, keine Wasm-Threads): je Stück `kueche_stueck(auftrag_ptr, i)` in einem Klon, Bericht (Bytes) aufbewahren. `0` = Berichte liegen bereit; `-1` = keine Köche (das Modul führt die Stücke selbst nacheinander aus – „Inline-Pfad“, gleiches Ergebnis). Muss Stücke nach einem früheren Abbruch nicht ausführen (SPEC §17.6 D3). |
| `kueche_bericht` | `(i i32, puffer_ptr i32, kap i32) -> i32` | Länge des Berichts von Stück i (1 … n); `> kap` → nichts geschrieben, erneut mit größerem Puffer (K-013); `-2` = Stück nicht ausgeführt. Der Host reicht die Bytes unverändert durch (Format: Anhang A, nur informativ). |

- Ein Host, der die Gruppe kennt, aber keine Threads hat (oder `koeche = 1`), stellt beide Imports bereit und antwortet `-1`
  (`kueche_bericht` wird dann nie gerufen). Ein Host ohne die Gruppe meldet den bekannten Ladefehler (K-043).
- Das Modul fragt `kueche_auftrag` nur in der Hauptküche; **innere** Brigaden (eine Brigade in einem Stück) laufen immer im
  Modul selbst (K-104). `kueche_auftrag` kann also während eines Laufs mehrmals kommen, aber nie verschachtelt.
- Die Berichte hängen nur vom Speicher beim Aufruf und von i ab – Reihenfolge, Verteilung auf Klone und Wiederverwendung eines
  Klons für mehrere Stücke sind frei (jedes `kueche_stueck` setzt den Klon selbst auf den Anschnitt zurück).
- Speicherbedarf eines Klons: so groß wie der Speicher der aufrufenden Instanz beim Aufruf (der Klon wächst vorher auf diese
  Größe und bekommt die Kopie); danach kann er beim Ausführen eines Stücks weiter wachsen.
- **Klon-Instanzen** rufen `ausgabe`, `schreibe`, `fehlerausgabe`, `leeren`, `warnung`, `fehler` und `panik` **nie** auf (das
  Modul schreibt Ereignisse und Abbruchstatus in den Bericht; die Hauptinstanz gibt sie beim Zusammenführen über die normalen
  Imports aus). Hosts behandeln solche Aufrufe in Klonen als Trap (K-014), **nie** als Lauf-Abbruch – auch `panik` nicht.
  In Klonen gilt: `eingabe` → `-1`, `ui_warte` → `-1`/`0`, `ui_senden` und `vorrat_*` → Trap (S4 verhindert Aufrufe),
  `echtzeit_ms` wie sonst, `kueche_auftrag` → `-1` (innere Brigaden laufen im Klon sequentiell).
- Trap in einem Klon → das Stück gilt als Abbruch „interner Fehler“ (Text K-014, `detail` = Trap-Meldung), Zusammenführen nach D3.
- Die Anzahl der Köche (`koeche`, §7) wählt der Host; sie darf nie ein Ereignis, einen Exit-Code, `schritte` oder `zeitMs` ändern.

**Herd – Gruppe `herd`** (SPEC §18, HERD.md, Kern-ABI `herd/README.md` §3; Paket H4):

Die Gruppe hat zwei Teile. **Modul `herd`**: Importe mit **genau den Namen und Signaturen der Exporte von `kern.wasm`** – ein
JS-Host bindet sie direkt (`imports.herd = kernInstanz.exports`, numerische Aufrufe Wasm → Wasm ohne JS dazwischen), ein nativer
Host je Import eine Hostfunktion, die die gleichnamige Methode von `herd_kern::Kern` ruft. Alle Zeiger dieser Importe zeigen in
den **Speicher des Kerns** (Austauschpuffer `puffer(len)`); das Modul liest und schreibt dort nie selbst, sondern über den
Kopierweg unten. **Modul `pizza`**: fünf Hostfunktionen `herd_*`. Das Modul importiert nur, was die Laufzeit braucht:

| Import (Modul `herd`) | Signatur | Kern-ABI (README §3) |
|---|---|---|
| `puffer` | `(len i32) -> i32` | Austauschpuffer im Kern-Speicher |
| `fehler_art`, `fehler_neu` | `() -> i32` | Fehlerprotokoll |
| `fehler_text` | `(ptr i32, kap i32) -> i32` | Text des letzten Fehlers (Retry K-013) |
| `melde_typfehler` | `(typ i32, feld i32, ptr i32, len i32) -> i32` | TypAnanas mit Darstellung des Werts |
| `welt_neu` | `(breite f64, hoehe f64, ptr i32, len i32) -> i32` | `neu Herd` |
| `welt_titel`, `welt_hintergrund` | `(ptr i32, len i32) -> i32` | |
| `welt_himmel` | `(op i32, on i32, up i32, un i32) -> i32` | |
| `welt_umgebung` | `(ptr i32, len i32, staerke f64) -> i32` | |
| `welt_nebel` | `(ptr i32, len i32, von f64, bis f64) -> i32` | |
| `teil_neu` | `(raum i32) -> i32` | |
| `teil_entferne`, `teil_kopie` | `(teil i32) -> i32` | |
| `teil_haenge`, `teil_trifft` | `(a i32, b i32) -> i32` | |
| `teil_kinder` | `(teil i32, ptr i32, kap i32) -> i32` | Retry (kap in Elementen) |
| `teil_setze` | `(teil i32, feld i32, wert f64) -> i32` | Lage-Feld |
| `teil_hole` | `(teil i32, feld i32) -> f64` | NaN + `fehler_neu` = Fehler |
| `teil_lage`, `teil_verschiebe`, `teil_groesse`, `teil_schaue` | `(teil i32, x f64, y f64, z f64) -> i32` | |
| `komp_neu` | `(typ i32) -> i32` | **generisch**: Typnummer aus dem Schema |
| `komp_haenge` | `(komp i32, teil i32) -> i32` | |
| `komp_loese` | `(komp i32) -> i32` | |
| `komp_von`, `komp_info` | `(a i32, b i32) -> i32` | |
| `typ_nummer` | `(ptr i32, len i32) -> i32` | |
| `feld_nummer` | `(typ i32, ptr i32, len i32) -> i32` | |
| `setze_zahl` | `(komp i32, feld i32, wert f64) -> i32` | **generisch**: Feldnummer aus dem Schema |
| `hole_zahl` | `(komp i32, feld i32) -> f64` | |
| `setze_text`, `hole_text`, `setze_liste`, `hole_liste` | `(komp i32, feld i32, ptr i32, len/kap i32) -> i32` | Texte/Listen im Kern-Speicher |
| `setze_zahlen`, `hole_zahlen` | `(komp i32, feld i32, ptr i32, n/kap i32) -> i32` | Feldtyp `zahl-liste` (H-K0, K-149): f64 LE im Kern-Speicher, `hole_zahlen` mit Retry (kap in Elementen); `teil-liste` geht über `setze_liste`/`hole_liste` |
| `form_grund` | `(art i32, teile f64, dicke f64) -> i32` | |
| `form_eigene` | `(pp i32, pn i32, dp i32, dn i32, glatt i32) -> i32` | |
| `bildchen_neu` | `(zp i32, zn i32, fp i32, fn i32) -> i32` | |
| `bildchen_teigling` | `(ptr i32, len i32) -> i32` | `Bildchen.laden` (K-145, K-147; ab PD1/PA2): `len` Bytes eines Teiglings im Kern-Speicher → Bildchen-ID; der Kern prüft nur den Kopf. Die Laufzeit holt den Teigling aus ihrem Datensegment (`memory.init`) und kopiert ihn mit `herd_schreibe` in den Kern – einmal je Pfad |
| `ressource_hole` | `(id i32, was i32) -> f64` | |
| `takt`, `paket_voll` | `() -> i32` | |
| `bild` | `(bildnummer i32) -> i32` | Länge des Bildpakets |
| `hash_szene`, `hash_paket` | `(ptr i32) -> i32` | 16 Hex-Ziffern in den Kern-Puffer |
| `schema_json` | `(ptr i32, kap i32) -> i32` | Schema (Retry); daraus baut die Laufzeit alle Komponentenklassen |

| Import (Modul `pizza`) | Signatur | Bedeutung |
|---|---|---|
| `herd_kern` | `(pflicht i32) -> i32` | `1` = Kern da. `0` = fehlt; bei `pflicht = 1` (Startprüfung, Programm enthält `neu Herd/Form/Bildchen` oder `Form.…`/`Herd.…`/`Bildchen.…`) sendet der Host vorher `{ typ: "fehler", code: "HOST", art: "intern", text: "PizzaFehler HOST: Der Herd-Kern fehlt (kern.wasm).", zeile: null, spalte: null }` und das Modul endet mit Exit 2, 0 Schritten (wie der Interpreter, K-128) |
| `herd_schreibe` | `(kern_ptr i32, ptr i32, len i32) -> ()` | Kopierweg Programm → Kern: `len` Bytes ab `ptr` (Programm-Speicher) nach `kern_ptr` (Kern-Speicher) |
| `herd_lies` | `(ptr i32, kern_ptr i32, len i32) -> ()` | Kopierweg Kern → Programm |
| `herd_warte` | `(puffer_ptr i32, puffer_kap i32) -> i32` | nächstes Fenster-Ereignis (UTF-8-JSON, z. B. `{"typ":"takt","anzahl":2,"tasten":[…],"maus":[x,y],"knoepfe":1}`, `{"typ":"geschlossen"}`); genau wie `ui_warte`: `-1` = kein Renderer/geschlossen, Länge `> kap` → nichts geschrieben, Retry (K-013), **`kap = -1`** = Abfrage „Renderer da?“ (`1`/`0`; `0` → `backe` öffnet und schließt das Fenster und warnt W0104). JS-Host: dieselbe Quelle wie `ui_warte` (`onUiWarte` bzw. `uiEreignisse`) |
| `herd_senden` | `(ptr i32, len i32, paket_len i32) -> ()` | Fenster-Ereignis als JSON **ohne** `typ`: `{"art":"fenster","titel","breite","hoehe"}`, `{"art":"bild","bildnummer","szene","paket"}`, `{"art":"schliesse"}`. Der Host meldet `{ typ: "herd", … }` (Schlüsselreihenfolge wie im JSON) und gibt es an den Renderer. `paket_len ≥ 0` (nur `bild`): das Bildpaket liegt im Kern ab `bild_zeiger()` (`paket_len` Bytes, gültig bis zum nächsten `bild`) – der Host liest es dort für den Renderer (JS: `optionen.onHerd(art, daten)` mit `daten.bytes`); die Bytes stehen **nie** im Ereignis |

- **Ablauf je Bild** (Vertrag für bitgleiche Hashes, wie der Interpreter): Fenster öffnen = `paket_voll` + `herd_senden(fenster)`; je
  `takt`-Ereignis Eingabe übernehmen, `n` × (Rückruf, `takt`), dann `bild(n)` → `hash_szene` → `hash_paket` → `herd_senden(bild)`.
  Spielschleife, Eingabezustand, Schrittbudget je Takt (K-087), Fehlertexte und W0104 erledigt das Modul; der Host kennt keine
  Komponente, kein Feld und keinen Feldtyp – eine neue Komponente im Kern ändert dieses ABI nicht.
- **Ohne Fenster/Renderer**: `herd_warte(…, -1)` → `0`; der Host stellt alle Importe trotzdem bereit (Programm läuft mit W0104).
  Der native Host bricht Herd-Programme ohne mögliches Fenster vor dem Start ab (K-130), W0104 nur im JSON-/Testmodus.
- **Ohne Gruppe**: ein Host, der `herd` nicht kennt, meldet beim Laden K-043 (`'herd.<name>'`). Programme ohne Herd importieren
  die Gruppe nicht (der Linker entfernt sie). Der JS-Host instanziiert `kern.wasm` nur für Programme mit Gruppe `herd` – je Lauf eine
  neue Kern-Instanz (eine Welt je Programm); `optionen.herdKern` (`WebAssembly.Module` oder Bytes), in Node ohne Option
  `site/js/herd/kern.wasm`. Im zweiteiligen Schnellpfad (Laufzeit importiert immer alles) bekommen Programme ohne Herd Platzhalter.
- **Klone** (Küchenbrigade): alle Importe der Gruppe (`herd.*` und `pizza.herd_*`) sind in Klon-Instanzen **Trap**; das Modul ruft
  sie dort nie (Herd-Methoden, `neu Herd/…` und Herd-Komponenten werfen vorher `KüchenAnanas: Den Herd gibt es nur in der Hauptküche.`).

Imports dürfen **nicht** zurück in das Modul rufen (keine Re-Entranz). Präzisierung für `kueche_auftrag`: Der Host ruft dabei nie
die **aufrufende** Instanz, sondern nur andere Instanzen desselben Moduls (Klone, Export `kueche_stueck`).

## 3. Exports

| Export | Signatur | Bedeutung |
|---|---|---|
| `memory` | Memory | linearer Speicher (wächst ggf. während des Laufs) |
| `abi_version` | `() -> i32` | liefert `2` (**v2**; bis PA2 noch `1`) |
| `limit_setzen` | `(schritte f64) -> ()` | Schrittlimit (`optionen.schrittLimit`); Werte ≤ 0 oder NaN → Standard 5 000 000. Optional, vor `start`. |
| `speicher_limit_setzen` | `(mib i32) -> ()` | Heap-Obergrenze in MiB (Standard 1024, max. 3072). Optional, vor `start`. |
| `arg_puffer` | `(len i32) -> i32` | liefert Zeiger auf `len` beschreibbare Bytes für das nächste Argument |
| `arg_fertig` | `(len i32) -> ()` | übernimmt die `len` Bytes aus dem zuletzt gelieferten Puffer als nächstes Argument |
| `saat_setzen` | `(saat f64) -> ()` | Zufallssaat (`optionen.zufallsSaat`, K-077); nur Ganzzahlen, normalisiert `n mod 2^32`; ohne Aufruf 42. Optional, vor `start`. Hosts/Playground erzeugen standardmäßig eine echte Saat und zeigen `Saat: N` an. |
| `start` | `() -> i32` | führt das Programm aus, liefert den **Exit-Code** |
| `schritte` | `() -> f64` | ausgeführte Schritte (ganzzahlig) |
| `zeitMs` | `() -> f64` | simulierte Uhr in ms (= Schritte + vorgespulte Zeit + Brigade-Ersparnis ≤ 0, SPEC §14.1/§17.6) |
| `kueche_stueck` | `(auftrag_ptr i32, i i32) -> (i32, i32)` | Gruppe `kueche` (nur vorhanden, wenn das Modul die Gruppe importiert): nur von Hosts in **Klon-Instanzen** aufzurufen (Speicher = Kopie der Hauptinstanz bei `kueche_auftrag`, `start` nie gerufen); führt Stück i (1 … n) aus und liefert Zeiger/Länge des Berichts im Klon-Speicher (gültig bis zum nächsten Aufruf im selben Klon) |

Weitere Exports (Laufzeit-Interna, Präfix `rt_`/`__`) sind **nicht** Teil des ABI und dürfen sich ändern.

### Argumente für `hauptgang` (Speicherprotokoll)

Für jedes Argument `a` (in Reihenfolge), **vor** `start`:
```
bytes = utf8(a)
p = arg_puffer(bytes.length)        // darf 0 Bytes sein
memory[p .. p+len) = bytes          // Speicher-Ansicht NACH dem Aufruf neu holen (memory kann gewachsen sein)
arg_fertig(bytes.length)
```
Ohne Aufrufe ist `args` ein leeres Blech – **v2:** bzw. die im Modul eingebetteten Standard-Argumente aus `pizza.json` (`args`,
SPEC §2.1); der Host muss sie nicht kennen.

## 4. Ablauf eines Laufs

```
inst = instanziiere(pkarton, { pizza: { ausgabe, fehlerausgabe, warnung, fehler, panik } })
[inst.limit_setzen(n)] [inst.speicher_limit_setzen(mib)] [Args übergeben]
exitCode = inst.start()              // alle Ereignisse kommen synchron, in Auftretensreihenfolge
emit { typ: "ende", exitCode, schritte: inst.schritte(), zeitMs: inst.zeitMs() }
```
- Pro Instanz wird `start` **höchstens einmal** aufgerufen.
- **Trap** (Bug, Wasm-Stapelüberlauf, Speicher des Hosts erschöpft) während `start` (K-014): Der Host meldet
  `{ typ: "fehler", code: "LaufzeitAnanas", art: "ananas", text: "Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.", zeile: null, spalte: null, detail: "<Trap-Meldung>" }`
  (fester Text; Details nur im optionalen Feld `detail`), Exit-Code **1**, danach `ende` mit `schritte()`/`zeitMs()`
  (nach einem Trap weiter aufrufbar). Ausnahme: der Host hat selbst in `panik` abgebrochen → Exit-Code 39 ohne Fehlerereignis.
- Liefert `start` einen Exit-Code außerhalb {0, 1, 2, 3, 39}, behandelt der Host das wie einen Trap (K-046).
- **Ladefehler** (kein gültiges Modul, falsche `abi_version`, fehlende Exporte) (K-043/K-044): Ein v2-Host lehnt jede andere
  Version als 2 ab (Grund `Dieses Programm wurde für eine andere pizza-Version gebaut (ABI 1, dieser Host kennt 2).`; es gibt keine
  Rückwärtskompatibilität – `.pkarton` entstehen ohnehin neu). Der Host sendet
  `{ typ: "fehler", code: "HOST", art: "intern", text: "PizzaFehler HOST: <Grund>", zeile: null, spalte: null }` und
  `ende` mit Exit-Code **2**, `schritte: 0`, `zeitMs: 0`.
- Das Schrittlimit, Ofen-/Lieferbudgets, Ananas, Hawaii-Panik usw. behandelt **das Modul selbst** – der Host
  muss nichts davon kennen.

## 5. Exit-Codes

| Code | Bedeutung |
|---|---|
| 0 | gegessen (alles gut) |
| 1 | ungefangene Ananas (inkl. Speicherlimit: `LaufzeitAnanas: Der Kühlschrank ist voll (Speicherlimit erreicht).`) |
| 2 | PizzaFehler (R0001, Q0004, A0001, P0010, P0011 … – alle vor dem Start; zur Laufzeit entsteht seit K-105 keiner mehr) |
| 3 | Schrittlimit (P0002) |
| 39 | Hawaii-Panik |

Syntaxfehler (`art: "syntax"`) entstehen nie zur Laufzeit – ein Programm mit Syntaxfehler wird nicht kompiliert.

## 6. Anforderungen an Hosts

- **Stapel:** Das Modul begrenzt die pizza-Aufruftiefe selbst (900, wie der Interpreter → `LaufzeitAnanas:
  Zu viele Pizzen übereinander (Stapelüberlauf).`). Ein pizza-Aufruf kann bis zu ~8 Wasm-Rahmen belegen.
  Hosts müssen daher **≥ 16 384 verschachtelte Wasm-Aufrufe** und **≥ 4 MiB Wert-Stapel** erlauben
  (wasmi: `Config`-Stapelgrenzen entsprechend setzen). Die Rust-Laufzeit hat zusätzlich einen eigenen
  Schattenstapel (1 MiB) im linearen Speicher.
- **Speicher:** Der lineare Speicher wächst über `memory.grow` bis Heap-Limit + Reserve + statische Daten
  (Standard ~ 1,1 GiB im Extremfall; typische Programme brauchen wenige MiB). Hosts sollen bis 2 GiB zulassen.
- **Determinismus:** Keine Imports für Zeit/Zufall – Uhr und Zufall (mulberry32, Seed 42) sind simuliert.
  Gleiches `.pkarton` + gleiche Args ⇒ gleiche Ereignisse, gleicher Exit-Code, gleiche `schritte`/`zeitMs` – auch für jede
  Anzahl Köche und jede Planung (SPEC §17).
- **Köche (Gruppe `kueche`):** Der Wirt-Stapel jedes Kochs muss dieselben Grenzen erlauben wie der Hauptthread (oben).
  Die Anzahl der gleichzeitigen Klone wählt der Host so, dass Klone × Speichergröße in sein Budget passt (Browser 2 GiB gesamt,
  nativ 50 % RAM) – reine Leistungsentscheidung.

## 7. Empfohlene CLI-Ausgabe (nativer Host, wie `bin/pizza.js`)

| Ereignis | Ausgabe |
|---|---|
| `ausgabe` | stdout: `text + "\n"` |
| `fehlerausgabe` | stderr: `text + "\n"` |
| `warnung` | stderr: `"⚠ " + text + " (Zeile z, Spalte s)"` (Positionsteil nur, wenn bekannt); **v2:** bei `datei ≠ null` `" (<datei>, Zeile z, Spalte s)"` bzw. `" (<datei>)"` ohne Zeile |
| `fehler` | stderr: `text` (+ Position bei `pizzafehler`, Form wie bei `warnung`, mit Datei sobald `datei ≠ null` – SPEC §2.6) |
| `schreibe` | stdout: `text` (ohne Umbruch, flushen) |
| `leeren` | stdout: ESC-Sequenz `[2J`, `[3J`, `[H` (K-054), nur wenn stdout ein Terminal ist |
| `eingabe` | Zeile von stdin lesen (`

`/`
` entfernen), EOF → `-1` |
| `panik` | stderr: `text` (Banner auf stderr, K-012) |
| `ende` | Prozess-Exit-Code = `exitCode` |

Option **`--koeche=N`** (`auto` = Standard: logische Kerne, höchstens 16; `1` = keine Köche) für Programme mit Gruppe `kueche`
(SPEC §17.7, K-100); `--info` zeigt zusätzlich `Köche: N` (tatsächlich genutzt – derselbe Text wie in der Playground-Statusleiste), **nur** wenn das
Programm die Gruppe `kueche` nutzt (Nutzerentscheidung K-100).

## 8. Minimaler JS-Host (Referenz)

```js
function fuehreAus(pkarton, args = [], emit = console.log) {
  let inst;
  const mem = () => new Uint8Array(inst.exports.memory.buffer);
  const t = (p, n) => new TextDecoder().decode(mem().subarray(p, p + n));
  const pos = (x) => (x > 0 ? x : null);
  const ARTEN = ['syntax', 'pizzafehler', 'ananas', 'limit'];
  const pizza = {
    ausgabe: (p, n) => emit({ typ: 'ausgabe', text: t(p, n) }),
    fehlerausgabe: (p, n) => emit({ typ: 'fehlerausgabe', text: t(p, n) }),
    warnung: (cp, cn, tp, tn, dp, dn, z, s) => emit({ typ: 'warnung', code: t(cp, cn), text: t(tp, tn), datei: dn ? t(dp, dn) : null, zeile: pos(z), spalte: pos(s) }),
    fehler: (a, cp, cn, tp, tn, dp, dn, z, s) => emit({ typ: 'fehler', code: t(cp, cn), art: ARTEN[a], text: t(tp, tn), datei: dn ? t(dp, dn) : null, zeile: pos(z), spalte: pos(s) }),
    panik: (p, n) => emit({ typ: 'panik', text: t(p, n) }),
    schreibe: (p, n) => emit({ typ: 'ausgabe', text: t(p, n), umbruch: false }),
    leeren: () => emit({ typ: 'leeren' }),
    eingabe: (art, pp, pn, bp, kap) => {           // hier: keine Eingabe → EOF
      if (art === 2) return 0;
      emit({ typ: 'eingabe', text: null });
      return -1;
    },
    ui_senden: (p, n) => emit({ typ: 'ui', nachricht: JSON.parse(t(p, n)) }),
    ui_warte: () => -1,
    kueche_auftrag: () => -1,                        // keine Köche → das Modul führt die Stücke selbst aus
    kueche_bericht: () => -2,
  };
  inst = new WebAssembly.Instance(new WebAssembly.Module(pkarton), { pizza });
  if (inst.exports.abi_version() !== 2) throw new Error('falsche ABI-Version');   // Ladefehler (§4)
  for (const a of args) {
    const b = new TextEncoder().encode(a);
    const p = inst.exports.arg_puffer(b.length);
    mem().set(b, p);
    inst.exports.arg_fertig(b.length);
  }
  let exitCode;
  try { exitCode = inst.exports.start(); }
  catch (e) {
    emit({ typ: 'fehler', code: 'LaufzeitAnanas', art: 'ananas',
      text: 'Ungefangene Ananas – LaufzeitAnanas: Interner Fehler im Ofen.', datei: null, zeile: null, spalte: null, detail: e.message });
    exitCode = 1;
  }
  emit({ typ: 'ende', exitCode, schritte: inst.exports.schritte(), zeitMs: inst.exports.zeitMs() });
  return exitCode;
}
```

## 9. Versionierung

Änderungen, die Hosts brechen, erhöhen `abi_version` und `"abi"` in der Custom Section. Hosts sollen bei
unbekannter Version mit einer klaren Meldung abbrechen (§4).

| Version | Änderung gegenüber der vorigen |
|---|---|
| 1 | Grundfassung (Basis-Importe, Gruppen `theke`, `vorrat`, `echtzeit`, `kueche`, `herd` – Gruppen und neue Importe sind additiv) |
| **2** (K-141; Vertrag, Umsetzung PA2) | `warnung` und `fehler` bekommen `datei_ptr, datei_len` vor `zeile` (§2), Ereignisse das Feld `datei`; `abi_version()` = 2, Hosts lehnen 1 ab; Küchenbericht-Ereignis `warnung` mit `bytes datei` (Anhang A); Custom Section `abi: 2` + `projekt`; Standard-Argumente im Modul (§3); additiv in derselben Fassung: `herd.bildchen_teigling`, Herd-Erkennung `Bildchen.…` |

## Anhang A: Küchenbericht und Kartonformat `PKF1` (informativ, K-104)

Hosts reichen Berichte nur als Bytes weiter; das Format gehört der Laufzeit (`laufzeit/src/kueche.rs`) und darf sich mit ihr
ändern (jedes `.pkarton` bringt seine Laufzeit mit). Alle Zahlen little-endian; `u32`/`i32` 4 Bytes, `f64` 8 Bytes,
`bytes` = `u32` Länge + Bytes.

**Bericht** eines Stücks: `u32 status` (0 ok · 1 Ananas · 2 Budget · 3 PizzaFehler · 4 Schrittlimit · 5 Panik ·
6 geworfener Wert nicht kartonfähig) · `f64 sᵢ` (Schritte) · `f64 dᵢ` (Küchenuhr − T₀) · `f64 cᵢ` (`neu`) · `f64` Lieferungen ·
`u32 k`, `k × f64` (Zähler der eingebauten Ananas-Klassen, D10) · `bytes` Ereignisse · Nutzlast:
ok → `PKF1`-Wert · Ananas → `i32 pos`, `PKF1`-Objekt · Budget → `u32 frame_id` · (Status 3, früher PizzaFehler, seit K-105 frei) · Schrittlimit → `i32 pos` · sonst nichts. `pos` = Index in die Positionstabelle des Moduls.

**Ereignisse** (in Auftretensreihenfolge, D4): `u8 art` · 1 `ausgabe` / 2 `schreibe` / 3 `fehlerausgabe`: `bytes text` ·
4 `leeren` · 5 `warnung`: `i32 methode` (W0003: Methoden-ID für „einmal pro Methode“, sonst −1), `i32 zeile`, `i32 spalte`,
**v2:** `bytes datei` (leer = `null`), `bytes code`, `bytes text`. `pos` zeigt ab v2 in die um den Datei-Index erweiterte Positionstabelle. Die Hauptinstanz gibt sie beim Zusammenführen über die normalen Imports aus (D5-Filter dort).

**`PKF1`** (Magie `PKF1`, dann ein Wert; Tiefensuche in Kartonreihenfolge, SPEC §17.5): `u8 tag` und Nutzlast –
0 `karton` · 1 `nein` · 2 `ja` · 3 Zahl `f64` · 4 `auto` (seit K-127 nicht mehr erzeugt, Tag bleibt reserviert) · 5 Text `bytes` · 6 Dauer `f64` · 7 **fest** `u64` (unveränderlicher
Wert – Text, Dauer, Klasse, Rezeptur, quattrostagioni-Typ/-Wert, Modul –, der beim Anschnitt schon existierte: die
Bits des Werts, gültig nur zwischen Instanzen mit demselben Schnappschuss) · 8 Modul `u32 id` · 9 Typ `u32 art`, `u32 id`
(Klasse/quattrostagioni-Typ/Rezeptur) · 10 quattrostagioni-Wert `u32 typ`, `f64 position` · 12 weggeschoben ·
13 unbelegt · 20 Blech `u32 n`, n Werte · 21 Speisekarte `u32 n`, n × (Schlüssel, Wert) · 24 Objekt `u32 klasse`, `f64 nummer`, `u32 zugeklappt`,
Wert `nachricht`, `u32 n`, n × (`u32 feldinfo`, `u8 eigen`, Wert) · 25 Rohling Wert `teilergebnis`, Wert `verbrauchteZeit` ·
30 Verweis `u32 i` (i-tes bereits geschriebenes Blech/Speisekarte/Objekt/Rohling – Teilung und Zyklen). Die Tags 11, 22 und 23 (Belag, Pizza, Pizza-Sicht) sind seit K-105 frei.
Nicht kartonfähige Werte haben kein Tag (das Stück endet mit der KüchenAnanas bzw. Status 6).
