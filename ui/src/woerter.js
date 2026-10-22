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
