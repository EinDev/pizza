// Wortlisten für Highlighting & Autovervollständigung.
// Basis laut SPEC; zur Laufzeit werden die Listen aus window.PizzaLang ergänzt (falls geladen).

export const KEYWORDS = new Set(`paket import klasse rezeptur rohling calzone quattrostagioni
erbt erfüllt speisekarte familienrezept geheimrezept tiefkühl gebacken
leer neu dies unten serviere falls sonst für solange wähle fall standard
probier verbrannt rand wirf wirft abbrechen weiter ja nein karton ofen roh`.split(/\s+/));

export const TYPEN = new Set(["salami", "funghi", "margherita", "diavolo", "Dauer", "Blech",
  "Speisekarte", "Teig", "Lieferung", "Zustellung", "Reste", "Rohling", "hawaii",
  // Theke (SPEC §16.1, §16.5, §16.7, §16.8) – eingebaute Klassen; Zufall/Vorratskammer (§15.4)
  "Theke", "Zutat", "Schild", "Knopf", "Eingabe", "Haken", "Stapel", "Reihe",
  "Takt", "Fortschritt", "Abschnitt", "Tabelle", "Reiter", "Auswahl", "Tastatur", "Zettel", "Zufall", "Vorratskammer",
  // Herd (SPEC §18.1, §18.6) – Klassen und Komponenten v1 (weitere Komponenten ergänzt window.PizzaLang.TYPEN aus dem Schema)
  "Herd", "Teil", "Form", "Bildchen",
  "Rechteck", "Kreis", "Text", "Bild", "Koerper", "Licht", "Kamera", "Bewegung", "Animation", "Partikel"]);

export const BUILTINS = new Set(["Bote", "Bestellannahme", "Uhr", "Mathe", "Zufall", "Spiegel", "teig", "bestelle", "schieb", "zwischenstand"]);

export const ANANAS = new Set(["Ananas", "GeprüfteAnanas", "VerbranntAnanas", "LieferAnanas", "LaufzeitAnanas",
  "StreitAnanas", "RechenAnanas", "LeererKartonAnanas", "RohlingAnanas", "GebackenAnanas",
  "TypAnanas", "KeinStückAnanas", "ZugriffsAnanas", "ZugeklapptAnanas", "UnbekanntePizzaAnanas", "KüchenAnanas"]);

export const ANNOTATIONEN = ["PizzaÜberschreibt", "PizzaVeraltet", "NieKarton", "Pizzaiolo", "Kühlschrank"];

// ---------- Autovervollständigung (SPEC §11, §14.11, §15.4, §16 bis §16.10) ----------

/** Mitglieder eingebauter Module (nach „Modul.“). */
export const MITGLIEDER = {
  Bote: ["sage", "fehler", "schreibe", "leeren"],
  Bestellannahme: ["lies", "liesZahl", "frage", "hatMehr"],
  Uhr: ["jetzt", "vorspulen", "echt"],
  Mathe: ["wurzel", "max", "min", "abs", "runden", "boden", "decke", "potenz", "log", "log10", "log2", "exp", "PI", "E"],
  Zufall: ["zahl", "saat", "kommazahl", "wahr", "wähle", "mische"],
  Spiegel: ["felder"],
  Zettel: ["aus"], // v7 (K-125): abgeleiteter Zettel
};

/** Konstanten (Symbol „constant“ statt „method“). */
export const KONSTANTEN = new Set(["PI", "E"]);

/** Methoden auf Werten/Objekten (nach „ausdruck.“) – Standardbibliothek, Vorratskammer, Theke-Zutaten und Zettel. */
export const ALLE_METHODEN = [...new Set([
  // Zahl, Text, Blech, Speisekarte, Dauer, Lieferung/Teig/Ofen, Ananas (§11, §7)
  "hat", "alsText", "name", "währung", "runden", "abs", "ganz", "tausender", "kompakt",
  "länge", "groß", "klein", "enthält", "zerlege", "ersetze", "trimme", "zeichen", "wiederhole", "beginntMit", "endetMit", "alsZahl",
  "stück", "hinzu", "entferne", "setze", "kopie", "belege", "brigade", "filtere", "zusammenklappen", "summe", "erstes", "letztes", "umdrehen",
  "sortiere", "verbinde", "istLeer", "schneide", "lege", "hole", "schlüssel", "werte", "inMs", "inSekunden", "inMinuten",
  "gehenlassen", "backen", "istAufgegangen", "priorität", "warte", "wennDa", "pünktlich", "wert", "oderGratis", "istGeliefert",
  "teilergebnis", "verbrauchteZeit", "mikrowelle", "frisch", "istMatschig",
  "aufklappen", "nachricht", "holeNachricht", "typ", "position",
  // Vorratskammer (§15.4, K-106)
  "leeren", "namensraum",
  // Theke v1 (§16.1): Theke und Zutaten
  "zeige", "bediene", "schliesse", "titel", "setzeTitel", "text", "setzeText", "beiKlick", "aktiv",
  "setzeWert", "beiAenderung", "beiEnter", "an", "setzeAn", "id", "sichtbar", "stil",
  // v2 (§16.5): Takt, Fortschritt, Abschnitt, Tabelle, Reiter, hinweis
  "intervall", "setzeIntervall", "beiTakt", "spalten", "setzeSpalten", "zeilen", "setzeZeilen", "waehle", "gewaehlt", "hinweis",
  // v3 (§16.6): Animationen
  "animiere", "schwebe", "uebergang",
  // v4 (§16.7): klappbarer Abschnitt, Auswahl, Tastatur
  "klappbar", "zu", "optionen", "setzeOptionen", "beiTaste",
  // v5–v6 (§16.8, §16.9): Bindungen, Marke (Zettel: wert, setze)
  "binde", "bindeStil", "marke",
])];

/** Stil-Schlüssel (K-068, K-113, K-120, K-126) – Reihenfolge wie im Fehlertext „Erlaubt: …“. */
export const STIL_SCHLUESSEL = ["breite", "hoehe", "abstand", "ausrichtung", "schrift", "farbe", "zeilen", "mindestbreite", "senkrecht", "spalten"];

/** Erlaubte Werte der Vokabular-Stile. */
export const STIL_WERTE = {
  ausrichtung: ["links", "mitte", "rechts"],
  schrift: ["klein", "normal", "gross", "mono", "riesig"],
  farbe: ["tomate", "basilikum", "mozzarella", "kruste", "normal"],
  senkrecht: ["oben", "mitte", "unten", "strecken"],
};

/** Bindbare Eigenschaften für binde("…", fn) über alle Zutaten (K-116, K-124). */
export const BINDBAR = ["text", "aktiv", "wert", "an", "intervall", "titel", "klappbar", "zu", "spalten", "zeilen",
  "gewaehlt", "optionen", "sichtbar", "hinweis", "marke"];

/** Animationsarten für animiere("…") (K-090). */
export const ANIMATIONEN = ["puls", "huepfen", "wackeln", "funkeln", "einblenden", "aufpoppen"];

/**
 * Vorschläge innerhalb eines Text-Arguments: stil("…"/bindeStil("…" → Stil-Schlüssel, stil("farbe", "…" → Werte,
 * binde("…" → bindbare Eigenschaften, animiere("…" → Arten. Liefert {von, liste, art} oder null.
 */
export function textArgumentVorschlaege(vorCursor) {
  const herd = herdTextVorschlaege(vorCursor);
  if (herd) return herd;
  const m = /\.(stil|bindeStil|binde|animiere)\(\(?"([\p{L}]*)$/u.exec(vorCursor);
  if (m) {
    const liste = m[1] === "binde" ? BINDBAR : m[1] === "animiere" ? ANIMATIONEN : STIL_SCHLUESSEL;
    return { von: vorCursor.length - m[2].length, liste, art: m[1] === "animiere" ? "constant" : "property" };
  }
  const w = /\.stil\(\(?"([\p{L}]+)"\s*,\s*"([\p{L}]*)$/u.exec(vorCursor);
  if (w && STIL_WERTE[w[1]]) return { von: vorCursor.length - w[2].length, liste: STIL_WERTE[w[1]], art: "constant" };
  return null;
}

/** Ergänzt die Listen aus dem geladenen Interpreter (falls vorhanden). */
export function ausInterpreterErgaenzen(PL) {
  if (!PL) return;
  try {
    (PL.KEYWORDS || []).forEach((w) => KEYWORDS.add(w));
    (PL.TYPEN || []).forEach((w) => TYPEN.add(w));
    (PL.BUILTINS || []).forEach((w) => BUILTINS.add(w));
    (PL.ANANAS || []).forEach((w) => ANANAS.add(w));
  } catch (e) { /* Interpreter liefert unerwartete Daten – Basislisten genügen */ }
}

// ---------- Herd (SPEC §18, HERD.md §4) ----------
// Feste Sprachteile (Herd-Methoden) stehen hier; Komponenten, ihre Felder, Teil-Methoden, Grundformen und die Palette kommen
// aus site/js/herd/schema.json (herdSchemaErgaenzen) – eine neue Komponente erscheint so ohne Änderung an der UI.

/** Methoden eines Herd-Objekts (`herd.…`). */
export const HERD_METHODEN = ["backe", "schliesse", "titel", "setzeTitel", "breite", "hoehe", "bildnummer", "zeit",
  "taste", "gedrueckt", "losgelassen", "mausX", "mausY", "maus", "klick",
  "hintergrund", "himmel", "umgebung", "nebel", "kamera", "sonne",
  "rechteck", "kreis", "text", "bild", "gruppe", "koerper", "licht", "raum"];
/** Generische Komponenten-Methoden (SPEC §18.4). */
export const KOMPONENTEN_METHODEN = ["hole", "setze", "teil"];
/** Tastennamen (K-110) für taste/gedrueckt/losgelassen("…"). */
export const HERD_TASTEN = ["Links", "Rechts", "Hoch", "Runter", "Leertaste", "Enter", "Escape", "Tab", "Rücktaste", "Entfernen",
  "Pos1", "Ende", "BildHoch", "BildRunter", "w", "a", "s", "d"];
/** Palette (aus dem Schema; Rückfall v1) für farbe: "…". */
export const HERD_FARBEN = ["weiss", "schwarz", "grau", "ofen", "tomate", "salami", "schinken", "basilikum", "oliven", "mozzarella",
  "teig", "kruste", "ananas", "senf", "himmel", "wasser", "aubergine"];
MITGLIEDER.Herd = ["farbe"];
MITGLIEDER.Form = ["wuerfel", "kugel", "zylinder", "kegel", "ebene", "ring"];
for (const m of [...HERD_METHODEN, ...KOMPONENTEN_METHODEN]) if (!ALLE_METHODEN.includes(m)) ALLE_METHODEN.push(m);

/** Ergänzt Typen, Methoden, Grundformen und Palette aus dem Herd-Schema (site/js/herd/schema.json). */
export function herdSchemaErgaenzen(schema) {
  if (!schema || !Array.isArray(schema.komponenten)) return false;
  const neu = (m) => { if (typeof m === "string" && m && !ALLE_METHODEN.includes(m)) ALLE_METHODEN.push(m); };
  for (const k of schema.komponenten) {
    if (!k || typeof k.name !== "string") continue;
    TYPEN.add(k.name);
    neu(k.name[0].toLowerCase() + k.name.slice(1));                // teil.bewegung()
    for (const f of k.felder || []) {
      if (!f || typeof f.name !== "string") continue;
      neu(f.name);                                                   // Getter
      neu("setze" + f.name[0].toUpperCase() + f.name.slice(1));     // Setter
    }
  }
  (schema.teil_methoden || []).forEach(neu);
  if (Array.isArray(schema.grundformen) && schema.grundformen.length) MITGLIEDER.Form = schema.grundformen.slice();
  if (Array.isArray(schema.palette) && schema.palette.length) {
    HERD_FARBEN.length = 0;
    for (const p of schema.palette) if (p && typeof p.name === "string") HERD_FARBEN.push(p.name);
  }
  return true;
}

/** Text-Argumente des Herds: farbe: "…" (Palette), taste/gedrueckt/losgelassen("…") (Tastennamen). */
export function herdTextVorschlaege(vorCursor) {
  const f = /\b(?:farbe|hintergrund|himmel|umgebung|nebel)(?::\s*|\()\(?"([\p{L}]*)$/u.exec(vorCursor) || /\bfarbe\s*,\s*"([\p{L}]*)$/u.exec(vorCursor);
  if (f) return { von: vorCursor.length - f[1].length, liste: HERD_FARBEN, art: "constant" };
  const t = /\.(?:taste|gedrueckt|losgelassen)\(\(?"([\p{L}\p{N}]*)$/u.exec(vorCursor);
  if (t) return { von: vorCursor.length - t[1].length, liste: HERD_TASTEN, art: "constant" };
  return null;
}
