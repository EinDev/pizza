// Wortlisten für Highlighting & Autovervollständigung.
// Basis laut SPEC; zur Laufzeit werden die Listen aus window.PizzaLang ergänzt (falls geladen).

export const KEYWORDS = new Set(`paket import klasse rezeptur rohling calzone quattrostagioni
erbt erfüllt speisekarte familienrezept geheimrezept tiefkühl gebacken
leer neu dies unten serviere falls sonst für solange wähle fall standard
probier verbrannt rand wirf wirft abbrechen weiter ja nein karton ofen roh`.split(/\s+/));

export const TYPEN = new Set(["salami", "funghi", "margherita", "diavolo", "Dauer", "Blech",
  "Speisekarte", "Teig", "Lieferung", "Zustellung", "Reste", "Rohling", "hawaii"]);

export const BUILTINS = new Set(["Bote", "Uhr", "Mathe", "Zufall", "Spiegel", "teig", "bestelle", "schieb", "zwischenstand"]);

export const ANANAS = new Set(["Ananas", "GeprüfteAnanas", "VerbranntAnanas", "LieferAnanas", "LaufzeitAnanas",
  "StreitAnanas", "RechenAnanas", "LeererKartonAnanas", "RohlingAnanas", "GebackenAnanas",
  "TypAnanas", "KeinStückAnanas", "ZugriffsAnanas", "ZugeklapptAnanas", "UnbekanntePizzaAnanas", "KüchenAnanas"]);

export const ANNOTATIONEN = ["PizzaÜberschreibt", "PizzaVeraltet", "NieKarton", "Pizzaiolo", "Kühlschrank"];

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
